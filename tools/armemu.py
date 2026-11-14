#!/usr/bin/env python3
"""A small ARM7TDMI emulator (ARM + Thumb, big-endian memory) for running parts of a Nokia DCT3 flash image.

Memory: the flash image is mapped at 0x200000 (read only, 0xFF beyond the file), everything else is RAM that
springs into existence (zero filled) on first touch. Peripheral accesses are not modelled; reads/writes outside
the flash and below RAM_TOP are plain RAM, others are logged by the caller through the access hook if wanted.

Hooks: cpu.hooks[addr] = f(cpu) runs INSTEAD of the code at addr (Thumb entry addresses are even here), f must put
the return value in r0 itself; the emulator then returns to LR like `bx lr`.
"""
import struct

BASE = 0x200000
MASK = 0xFFFFFFFF
SENTINEL = 0xFFFF0000


class Mem:
    def __init__(self, flash, base=BASE):
        self.flash = flash
        self.base = base
        self.pages = {}
        self.trace = None            # optional f(kind, addr, value, size)

    def _page(self, a):
        p = a >> 12
        pg = self.pages.get(p)
        if pg is None:
            pg = self.pages[p] = bytearray(4096)
        return pg

    def r8(self, a):
        a &= MASK
        o = a - self.base
        if 0 <= o < 0x200000:
            v = self.flash[o] if o < len(self.flash) else 0xFF
        else:
            v = self._page(a)[a & 0xFFF]
        if self.trace:
            self.trace('r', a, v, 1)
        return v

    def r16(self, a):
        a &= MASK & ~1
        o = a - self.base
        if 0 <= o < 0x200000:
            v = ((self.flash[o] << 8) | self.flash[o + 1]) if o + 1 < len(self.flash) else 0xFFFF
        else:
            pg = self._page(a)
            i = a & 0xFFF
            v = (pg[i] << 8) | pg[i + 1]
        if self.trace:
            self.trace('r', a, v, 2)
        return v

    def r32(self, a):
        a &= MASK & ~3
        o = a - self.base
        if 0 <= o < 0x200000:
            v = struct.unpack_from('>I', self.flash, o)[0] if o + 4 <= len(self.flash) else 0xFFFFFFFF
        else:
            pg = self._page(a)
            i = a & 0xFFF
            v = struct.unpack_from('>I', pg, i)[0]
        if self.trace:
            self.trace('r', a, v, 4)
        return v

    def w8(self, a, v):
        a &= MASK
        if self.trace:
            self.trace('w', a, v & 0xFF, 1)
        if 0 <= a - self.base < 0x200000:
            return
        self._page(a)[a & 0xFFF] = v & 0xFF

    def w16(self, a, v):
        a &= MASK & ~1
        if self.trace:
            self.trace('w', a, v & 0xFFFF, 2)
        if 0 <= a - self.base < 0x200000:
            return
        pg = self._page(a)
        i = a & 0xFFF
        pg[i] = (v >> 8) & 0xFF
        pg[i + 1] = v & 0xFF

    def w32(self, a, v):
        a &= MASK & ~3
        if self.trace:
            self.trace('w', a, v & MASK, 4)
        if 0 <= a - self.base < 0x200000:
            return
        pg = self._page(a)
        struct.pack_into('>I', pg, a & 0xFFF, v & MASK)

    def write_bytes(self, a, data):
        for i, b in enumerate(data):
            self._page(a + i)[(a + i) & 0xFFF] = b

    def read_bytes(self, a, n):
        out = bytearray()
        for i in range(n):
            o = a + i - self.base
            if 0 <= o < 0x200000:
                out.append(self.flash[o] if o < len(self.flash) else 0xFF)
            else:
                out.append(self._page(a + i)[(a + i) & 0xFFF])
        return bytes(out)


def sx(v, bits):
    m = 1 << (bits - 1)
    return (v & (m - 1)) - (v & m)


class Halt(Exception):
    pass


class CPU:
    def __init__(self, mem):
        self.m = mem
        self.r = [0] * 16
        self.n = self.z = self.c = self.v = 0
        self.thumb = True
        self.hooks = {}
        self.steps = 0
        self.callhook = None        # f(cpu, target, from_pc) called on every bl / blx / bx to a new function
        self.swihook = None

    # -- helpers ---------------------------------------------------------------------------------------------
    @property
    def pc(self):
        return self.r[15]

    def set_nz(self, v):
        self.n = (v >> 31) & 1
        self.z = 1 if (v & MASK) == 0 else 0

    def add_flags(self, a, b, cin=0):
        res = a + b + cin
        r = res & MASK
        self.c = 1 if res > MASK else 0
        self.v = 1 if (~(a ^ b) & (a ^ r)) >> 31 & 1 else 0
        self.set_nz(r)
        return r

    def sub_flags(self, a, b, cin=1):
        res = a + ((~b) & MASK) + cin
        r = res & MASK
        self.c = 1 if res > MASK else 0
        self.v = 1 if ((a ^ b) & (a ^ r)) >> 31 & 1 else 0
        self.set_nz(r)
        return r

    def cond(self, cc):
        n, z, c, v = self.n, self.z, self.c, self.v
        return (z == 1, z == 0, c == 1, c == 0, n == 1, n == 0, v == 1, v == 0,
                c == 1 and z == 0, c == 0 or z == 1, n == v, n != v,
                z == 0 and n == v, z == 1 or n != v, True, False)[cc]

    # -- running -----------------------------------------------------------------------------------------------
    def call(self, addr, args=(), thumb=True, max_steps=2_000_000, sp=0x00EF0000):
        """Call a function and run until it returns to the sentinel. Returns r0."""
        for i, a in enumerate(args[:4]):
            self.r[i] = a & MASK
        if len(args) > 4:
            sp -= 4 * (len(args) - 4)
            for i, a in enumerate(args[4:]):
                self.m.w32(sp + 4 * i, a)
        self.r[13] = sp
        self.r[14] = SENTINEL | 1
        self.thumb = thumb
        self.r[15] = addr & ~1
        start = self.steps
        while self.r[15] != SENTINEL:
            if self.steps - start > max_steps:
                raise Halt('step limit at pc=%x' % self.r[15])
            self.step()
        return self.r[0]

    def step(self):
        self.steps += 1
        pc = self.r[15]
        h = self.hooks.get(pc)
        if h is not None:
            h(self)
            lr = self.r[14]
            self.thumb = bool(lr & 1)
            self.r[15] = lr & ~1
            return
        if self.thumb:
            self.step_thumb()
        else:
            self.step_arm()

    # -- Thumb -------------------------------------------------------------------------------------------------
    def step_thumb(self):
        m = self.m
        r = self.r
        pc = r[15]
        h = m.r16(pc)
        r[15] = pc + 2
        top = h >> 11
        if (h >> 13) == 0:
            o = (h >> 11) & 3
            if o == 3:
                imm = (h >> 10) & 1
                sub = (h >> 9) & 1
                rn = (h >> 6) & 7
                a = r[(h >> 3) & 7]
                b = rn if imm else r[rn]
                r[h & 7] = self.sub_flags(a, b) if sub else self.add_flags(a, b)
            else:
                off = (h >> 6) & 31
                a = r[(h >> 3) & 7]
                if o == 0:
                    if off:
                        self.c = (a >> (32 - off)) & 1
                        a = (a << off) & MASK
                elif o == 1:
                    if off == 0:
                        off = 32
                    self.c = (a >> (off - 1)) & 1
                    a = a >> off if off < 32 else 0
                else:
                    if off == 0:
                        off = 32
                    s = sx(a, 32)
                    self.c = (a >> (min(off, 32) - 1)) & 1
                    a = (s >> min(off, 31)) & MASK if off < 32 else (MASK if s < 0 else 0)
                r[h & 7] = a
                self.set_nz(a)
        elif (h >> 13) == 1:
            o = (h >> 11) & 3
            rd = (h >> 8) & 7
            imm = h & 255
            if o == 0:
                r[rd] = imm
                self.set_nz(imm)
            elif o == 1:
                self.sub_flags(r[rd], imm)
            elif o == 2:
                r[rd] = self.add_flags(r[rd], imm)
            else:
                r[rd] = self.sub_flags(r[rd], imm)
        elif (h >> 10) == 0x10:
            o = (h >> 6) & 15
            rs = r[(h >> 3) & 7]
            rd = h & 7
            a = r[rd]
            if o == 0:
                a &= rs; self.set_nz(a); r[rd] = a
            elif o == 1:
                a ^= rs; self.set_nz(a); r[rd] = a
            elif o in (2, 3, 4, 7):
                s = rs & 255
                if o == 2:
                    if s:
                        if s < 32:
                            self.c = (a >> (32 - s)) & 1
                            a = (a << s) & MASK
                        else:
                            self.c = (a & 1) if s == 32 else 0
                            a = 0
                elif o == 3:
                    if s:
                        if s < 32:
                            self.c = (a >> (s - 1)) & 1
                            a >>= s
                        else:
                            self.c = (a >> 31) if s == 32 else 0
                            a = 0
                elif o == 4:
                    if s:
                        sg = sx(a, 32)
                        if s < 32:
                            self.c = (a >> (s - 1)) & 1
                            a = (sg >> s) & MASK
                        else:
                            self.c = (a >> 31) & 1
                            a = MASK if sg < 0 else 0
                else:
                    if s:
                        s &= 31
                        if s:
                            a = ((a >> s) | (a << (32 - s))) & MASK
                        self.c = (a >> 31) & 1
                self.set_nz(a)
                r[rd] = a
            elif o == 5:
                r[rd] = self.add_flags(a, rs, self.c)
            elif o == 6:
                r[rd] = self.sub_flags(a, rs, self.c)
            elif o == 8:
                self.set_nz(a & rs)
            elif o == 9:
                r[rd] = self.sub_flags(0, rs)
            elif o == 10:
                self.sub_flags(a, rs)
            elif o == 11:
                self.add_flags(a, rs)
            elif o == 12:
                a |= rs; self.set_nz(a); r[rd] = a
            elif o == 13:
                a = (a * rs) & MASK; self.set_nz(a); r[rd] = a
            elif o == 14:
                a &= ~rs & MASK; self.set_nz(a); r[rd] = a
            else:
                a = ~rs & MASK; self.set_nz(a); r[rd] = a
        elif (h >> 10) == 0x11:
            o = (h >> 8) & 3
            h1 = (h >> 7) & 1
            h2 = (h >> 6) & 1
            rs = ((h >> 3) & 7) | (h2 << 3)
            rd = (h & 7) | (h1 << 3)
            sv = (pc + 4) if rs == 15 else r[rs]
            if o == 0:
                v = ((pc + 4) if rd == 15 else r[rd]) + sv & MASK
                if rd == 15:
                    r[15] = v & ~1
                else:
                    r[rd] = v
            elif o == 1:
                self.sub_flags((pc + 4) if rd == 15 else r[rd], sv)
            elif o == 2:
                if rd == 15:
                    r[15] = sv & ~1
                else:
                    r[rd] = sv
            else:
                if h1:      # blx rs (not on ARM7TDMI) - treat as bx with link
                    r[14] = (pc + 2) | 1
                self.bx(sv, pc)
        elif top == 9:
            rd = (h >> 8) & 7
            r[rd] = m.r32(((pc + 4) & ~3) + ((h & 255) << 2))
        elif (h >> 12) == 5:
            ro = r[(h >> 6) & 7]
            rb = r[(h >> 3) & 7]
            rd = h & 7
            a = (rb + ro) & MASK
            if not (h >> 9) & 1:
                L = (h >> 11) & 1
                B = (h >> 10) & 1
                if L:
                    r[rd] = m.r8(a) if B else self.ldr(a)
                else:
                    if B:
                        m.w8(a, r[rd])
                    else:
                        m.w32(a, r[rd])
            else:
                H = (h >> 11) & 1
                S = (h >> 10) & 1
                k = (S << 1) | H
                if k == 0:
                    m.w16(a, r[rd])
                elif k == 1:
                    r[rd] = m.r16(a)
                elif k == 2:
                    r[rd] = sx(m.r8(a), 8) & MASK
                else:
                    r[rd] = sx(m.r16(a), 16) & MASK
        elif (h >> 13) == 3:
            B = (h >> 12) & 1
            L = (h >> 11) & 1
            off = (h >> 6) & 31
            rb = r[(h >> 3) & 7]
            rd = h & 7
            if B:
                a = rb + off
                if L:
                    r[rd] = m.r8(a)
                else:
                    m.w8(a, r[rd])
            else:
                a = rb + (off << 2)
                if L:
                    r[rd] = self.ldr(a)
                else:
                    m.w32(a, r[rd])
        elif (h >> 12) == 8:
            L = (h >> 11) & 1
            a = r[(h >> 3) & 7] + (((h >> 6) & 31) << 1)
            rd = h & 7
            if L:
                r[rd] = m.r16(a)
            else:
                m.w16(a, r[rd])
        elif (h >> 12) == 9:
            L = (h >> 11) & 1
            rd = (h >> 8) & 7
            a = r[13] + ((h & 255) << 2)
            if L:
                r[rd] = m.r32(a)
            else:
                m.w32(a, r[rd])
        elif (h >> 12) == 10:
            rd = (h >> 8) & 7
            w = (h & 255) << 2
            r[rd] = (r[13] + w) & MASK if (h >> 11) & 1 else (((pc + 4) & ~3) + w) & MASK
        elif (h >> 8) == 0xB0:
            w = (h & 127) << 2
            r[13] = (r[13] - w if (h >> 7) & 1 else r[13] + w) & MASK
        elif (h >> 12) == 11 and ((h >> 9) & 3) == 2:
            L = (h >> 11) & 1
            R = (h >> 8) & 1
            lst = h & 255
            sp = r[13]
            if L:
                for i in range(8):
                    if lst >> i & 1:
                        r[i] = m.r32(sp)
                        sp += 4
                if R:
                    v = m.r32(sp)
                    sp += 4
                    r[13] = sp & MASK
                    self.bx(v, pc)          # ARMv5 style interworking pop pc; harmless on ARMv4T code that uses pop {pc}
                    return
                r[13] = sp & MASK
            else:
                n = bin(lst).count('1') + R
                sp -= 4 * n
                a = sp
                for i in range(8):
                    if lst >> i & 1:
                        m.w32(a, r[i])
                        a += 4
                if R:
                    m.w32(a, r[14])
                r[13] = sp & MASK
        elif (h >> 12) == 12:
            L = (h >> 11) & 1
            rb = (h >> 8) & 7
            lst = h & 255
            a = r[rb]
            for i in range(8):
                if lst >> i & 1:
                    if L:
                        r[i] = m.r32(a)
                    else:
                        m.w32(a, r[i])
                    a += 4
            if not (L and (lst >> rb) & 1):
                r[rb] = a & MASK
        elif (h >> 12) == 13:
            c = (h >> 8) & 15
            if c == 15:
                if self.swihook:
                    self.swihook(self, h & 255)
                return
            if self.cond(c):
                r[15] = (pc + 4 + (sx(h & 255, 8) << 1)) & MASK
        elif top == 0x1C:
            r[15] = (pc + 4 + (sx(h & 0x7FF, 11) << 1)) & MASK
        elif (h & 0xF800) == 0xF000:
            r[14] = (pc + 4 + (sx(h & 0x7FF, 11) << 12)) & MASK
        elif (h & 0xF800) == 0xF800:
            tgt = (r[14] + ((h & 0x7FF) << 1)) & MASK
            r[14] = (pc + 2) | 1
            if self.callhook:
                self.callhook(self, tgt, pc - 2)
            r[15] = tgt
        else:
            raise Halt('undefined thumb %04x at %x' % (h, pc))

    def ldr(self, a):
        v = self.m.r32(a)
        rot = (a & 3) * 8
        if rot:
            v = ((v >> rot) | (v << (32 - rot))) & MASK
        return v

    def bx(self, target, pc):
        if self.callhook and (target & ~1) != SENTINEL and False:
            self.callhook(self, target & ~1, pc)
        self.thumb = bool(target & 1)
        self.r[15] = target & ~1 if self.thumb else target & ~3

    # -- ARM ---------------------------------------------------------------------------------------------------
    def reg(self, i, pc):
        return (pc + 8) & MASK if i == 15 else self.r[i]

    def shift_op(self, w, pc, setc):
        rm = self.reg(w & 15, pc)
        typ = (w >> 5) & 3
        if w & 16:
            amt = self.reg((w >> 8) & 15, pc) & 255
            if (w & 15) == 15:
                rm = (pc + 12) & MASK
            reg_amt = True
        else:
            amt = (w >> 7) & 31
            reg_amt = False
        c = self.c
        if typ == 0:
            if amt:
                if amt < 32:
                    c = (rm >> (32 - amt)) & 1
                    rm = (rm << amt) & MASK
                else:
                    c = (rm & 1) if amt == 32 else 0
                    rm = 0
        elif typ == 1:
            if amt == 0 and not reg_amt:
                amt = 32
            if amt:
                if amt < 32:
                    c = (rm >> (amt - 1)) & 1
                    rm >>= amt
                else:
                    c = (rm >> 31) if amt == 32 else 0
                    rm = 0
        elif typ == 2:
            if amt == 0 and not reg_amt:
                amt = 32
            if amt:
                sg = sx(rm, 32)
                if amt < 32:
                    c = (rm >> (amt - 1)) & 1
                    rm = (sg >> amt) & MASK
                else:
                    c = (rm >> 31) & 1
                    rm = MASK if sg < 0 else 0
        else:
            if amt == 0 and not reg_amt:        # rrx
                c, rm = rm & 1, ((self.c << 31) | (rm >> 1)) & MASK
            elif amt:
                amt &= 31
                if amt:
                    rm = ((rm >> amt) | (rm << (32 - amt))) & MASK
                c = (rm >> 31) & 1
        if setc:
            self.c = c
        return rm

    def step_arm(self):
        m = self.m
        r = self.r
        pc = r[15]
        w = m.r32(pc)
        r[15] = pc + 4
        if not self.cond(w >> 28):
            return
        if (w & 0x0FFFFFF0) == 0x012FFF10:
            self.bx(self.reg(w & 15, pc), pc)
            return
        if (w & 0x0FC000F0) == 0x00000090:
            rd, rn, rs, rm = (w >> 16) & 15, (w >> 12) & 15, (w >> 8) & 15, w & 15
            v = r[rm] * r[rs]
            if w & (1 << 21):
                v += r[rn]
            v &= MASK
            r[rd] = v
            if w & (1 << 20):
                self.set_nz(v)
            return
        if (w & 0x0F8000F0) == 0x00800090:
            rdhi, rdlo, rs, rm = (w >> 16) & 15, (w >> 12) & 15, (w >> 8) & 15, w & 15
            a, b = r[rm], r[rs]
            if w & (1 << 22):
                a, b = sx(a, 32), sx(b, 32)
            v = a * b
            if w & (1 << 21):
                v += (r[rdhi] << 32) | r[rdlo]
            v &= (1 << 64) - 1
            r[rdlo], r[rdhi] = v & MASK, v >> 32
            if w & (1 << 20):
                self.n = (v >> 63) & 1
                self.z = 1 if v == 0 else 0
            return
        top = (w >> 25) & 7
        if (w & 0x0E000090) == 0x00000090 and (w & 0x60):
            P, U, I, W, L = (w >> 24) & 1, (w >> 23) & 1, (w >> 22) & 1, (w >> 21) & 1, (w >> 20) & 1
            rn, rd = (w >> 16) & 15, (w >> 12) & 15
            sh = (w >> 5) & 3
            off = (((w >> 4) & 0xF0) | (w & 15)) if I else r[w & 15]
            base = self.reg(rn, pc)
            a = base + off if U else base - off
            ea = a if P else base
            if L:
                if sh == 1:
                    v = m.r16(ea)
                elif sh == 2:
                    v = sx(m.r8(ea), 8) & MASK
                else:
                    v = sx(m.r16(ea), 16) & MASK
                r[rd] = v
            else:
                m.w16(ea, r[rd])
            if (not P) or W:
                if not (L and rn == rd):
                    r[rn] = a & MASK
            return
        if top in (0, 1):
            if (w & 0x0FBF0FFF) == 0x010F0000:
                r[(w >> 12) & 15] = 0x1F       # mrs: system mode, flags ignored
                return
            if (w & 0x0DB0F000) == 0x0120F000:
                return                          # msr: ignored
            opc = (w >> 21) & 15
            S = (w >> 20) & 1
            rn, rd = (w >> 16) & 15, (w >> 12) & 15
            if w & (1 << 25):
                imm = w & 255
                rot = ((w >> 8) & 15) * 2
                op2 = ((imm >> rot) | (imm << (32 - rot))) & MASK if rot else imm
                if S and rot:
                    self.c = (op2 >> 31) & 1
            else:
                op2 = self.shift_op(w, pc, S and opc in (0, 1, 8, 9, 12, 13, 14, 15))
            a = self.reg(rn, pc)
            if (w & 16) and rn == 15 and not (w & (1 << 25)):
                a = (pc + 12) & MASK
            res = None
            if opc == 0: res = a & op2
            elif opc == 1: res = a ^ op2
            elif opc == 2: res = self.sub_flags(a, op2) if S else (a - op2) & MASK
            elif opc == 3: res = self.sub_flags(op2, a) if S else (op2 - a) & MASK
            elif opc == 4: res = self.add_flags(a, op2) if S else (a + op2) & MASK
            elif opc == 5: res = self.add_flags(a, op2, self.c) if S else (a + op2 + self.c) & MASK
            elif opc == 6: res = self.sub_flags(a, op2, self.c) if S else (a - op2 - 1 + self.c) & MASK
            elif opc == 7: res = self.sub_flags(op2, a, self.c) if S else (op2 - a - 1 + self.c) & MASK
            elif opc == 8: self.set_nz(a & op2); return
            elif opc == 9: self.set_nz(a ^ op2); return
            elif opc == 10: self.sub_flags(a, op2); return
            elif opc == 11: self.add_flags(a, op2); return
            elif opc == 12: res = a | op2
            elif opc == 13: res = op2
            elif opc == 14: res = a & ~op2 & MASK
            else: res = ~op2 & MASK
            res &= MASK
            if S and opc in (0, 1, 12, 13, 14, 15):
                self.set_nz(res)
            if rd == 15:
                r[15] = res & ~3
            else:
                r[rd] = res
            return
        if top in (2, 3):
            P, U, B, W, L = (w >> 24) & 1, (w >> 23) & 1, (w >> 22) & 1, (w >> 21) & 1, (w >> 20) & 1
            rn, rd = (w >> 16) & 15, (w >> 12) & 15
            off = (w & 0xFFF) if top == 2 else self.shift_op(w & ~16, pc, False)
            base = self.reg(rn, pc)
            a = (base + off if U else base - off) & MASK
            ea = a if P else base
            if L:
                v = m.r8(ea) if B else self.ldr(ea)
            else:
                v = self.reg(rd, pc) + (4 if rd == 15 else 0)
            if (not P) or W:
                r[rn] = a
            if L:
                if rd == 15:
                    self.bx(v, pc)
                else:
                    r[rd] = v
            else:
                if B:
                    m.w8(ea, v)
                else:
                    m.w32(ea, v)
            return
        if top == 4:
            P, U, S, W, L = (w >> 24) & 1, (w >> 23) & 1, (w >> 22) & 1, (w >> 21) & 1, (w >> 20) & 1
            rn = (w >> 16) & 15
            lst = [i for i in range(16) if w >> i & 1]
            n = len(lst)
            base = r[rn]
            if U:
                a = base + (4 if P else 0)
                nb = base + 4 * n
            else:
                a = base - 4 * n + (0 if P else 4)
                nb = base - 4 * n
            for i in lst:
                if L:
                    v = m.r32(a)
                    if i == 15:
                        self.bx(v, pc)
                    else:
                        r[i] = v
                else:
                    m.w32(a, self.reg(i, pc) + (4 if i == 15 else 0))
                a += 4
            if W:
                r[rn] = nb & MASK
            return
        if top == 5:
            off = sx(w & 0xFFFFFF, 24) << 2
            tgt = (pc + 8 + off) & MASK
            if w & (1 << 24):
                r[14] = pc + 4
                if self.callhook:
                    self.callhook(self, tgt, pc)
            r[15] = tgt
            return
        if top == 7 and (w & (1 << 24)):
            if self.swihook:
                self.swihook(self, w & 0xFFFFFF)
            return
        raise Halt('undefined arm %08x at %x' % (w, pc))
