#!/usr/bin/env python3
"""Local Nokia 3310 PPM B Space Impact oracle. Requires a firmware image.

Example: python3 tools/spaceimpact_oracle.py --flash /path/to/firmware.fls --messages 0x24,1,1,1,10
Executes the original Thumb code; selected allocation/phone OS services are simulated.
This is an analysis harness, not a complete phone emulator.
"""
import argparse, json
from armemu import Mem, CPU

HANDLER, RECORD, GLOBAL, DISPLAY, HEAP = 0x25a52a, 0xf00000, 0x109ec4, 0x111af0, 0xc00000

class SpaceImpactOracle:
    def __init__(self, flash_path, seed=0x1234):
        self.m = Mem(open(flash_path, 'rb').read())
        self.c = CPU(self.m)
        self.heap = HEAP
        self.calls = []
        self.m.w32(0x10da5c, seed)
        # The ROM contains startup records as (length, RAM destination, padded data).
        # These eleven records initialize the Space Impact module's static data,
        # including the level table and the 37-entry image descriptor table.
        a = 0x2f30cc
        while a < 0x2f31fc:
            size, dest = self.m.r32(a), self.m.r32(a + 4)
            self.m.write_bytes(dest, self.m.read_bytes(a + 8, size))
            a += 8 + ((size + 3) & ~3)
        def alloc(cpu):
            size = (cpu.r[0] + 7) & ~7
            cpu.r[0], self.heap = self.heap, self.heap + max(size, 8)
        def release(cpu): cpu.r[0] = 0
        def modulo(cpu):
            a, b = cpu.r[0], cpu.r[1]
            cpu.r[3], cpu.r[0] = (a // b, a % b) if b else (0, 0)
        def display_alloc(cpu):
            count = cpu.r[0]
            size = (count + 1) * 28
            ptr, self.heap = self.heap, self.heap + ((size + 7) & ~7)
            self.m.write_bytes(ptr, bytes(size))
            self.m.w32(DISPLAY + 4, ptr)
            self.m.w16(DISPLAY + 2, count)
            self.m.w16(DISPLAY, 1)
            for i in range(1, count + 1): self.m.w16(ptr + i * 28, i + 1 if i < count else 0)
            self.m.w8(DISPLAY + 8, 1)
            cpu.r[0] = 1
        for addr in (0x29a810, 0x2dd6dc): self.c.hooks[addr] = alloc
        for addr in (0x29a74e, 0x2dd70e): self.c.hooks[addr] = release
        self.c.hooks[0x2f0998] = modulo
        self.c.hooks[0x2dd936] = display_alloc
        # Time/OS clock is unavailable to the harness. A fixed seed makes replays repeatable.
        self.c.hooks[0x2cc440] = lambda cpu: cpu.r.__setitem__(0, 0x7fffffff)
        self.m.write_bytes(RECORD, bytes(64))
    def message(self, msg):
        result = self.c.call(HANDLER, [msg, RECORD], max_steps=5000000)
        return {'message': msg, 'return': result, **self.snapshot()}

    def initial_timed_ticks(self, count):
        """Run the observed initial timer protocol; fail on unmodeled return codes.

        The dispatcher maps the main timer to message 1 and the secondary timer
        to message 0. For a tie, deliver the secondary timer first. This ordering
        remains an assumption pending an event-queue trace from the phone OS.
        """
        start = self.message(0x24)
        if start['return'] != 1 or start['delay'] != 100:
            raise RuntimeError('unexpected initial app state')
        secondary = None
        for tick in range(1, count + 1):
            elapsed = tick * 100
            secondary_result = None
            if secondary is not None and elapsed == secondary:
                secondary_result = self.message(0)
                if secondary_result['return'] != 1 or secondary_result['timer'] != 3000:
                    raise RuntimeError('unmodeled secondary timer result')
                secondary += secondary_result['timer']
            result = self.message(1)
            if result['delay'] != 100:
                raise RuntimeError('unmodeled main timer delay change')
            if result['return'] == 19:
                secondary = elapsed + result['timer']
            elif result['return'] != 33:
                raise RuntimeError('unmodeled main timer result: %s' % result['return'])
            yield tick, result, secondary_result
    def snapshot(self):
        m = self.m
        ptr, capacity = m.r32(DISPLAY + 4), m.r16(DISPLAY + 2)
        objects, seen = [], set()
        index = m.r16(ptr) if ptr else 0
        while 0 < index <= capacity and index not in seen:
            seen.add(index)
            a = ptr + 28 * index
            objects.append({'id': index, 'kind': m.r8(a+2), 'x': m.r8(a+4), 'y': m.r8(a+5),
                            'data': '0x%08x' % m.r32(a+12), 'width': m.r8(a+20), 'height': m.r8(a+21),
                            'flags': m.r8(a+24), 'raw': m.read_bytes(a,28).hex()})
            index = m.r16(a)
        return {'delay': m.r16(RECORD+12), 'timer': m.r16(RECORD+14), 'score': m.r32(RECORD+16),
                'event': m.r16(RECORD+20), 'phase': m.r8(GLOBAL+0x32c),
                'level': m.r8(GLOBAL+0x2c), 'state_hex': m.read_bytes(GLOBAL, 0x350).hex(),
                'objects': objects}


class FirmwareTimers:
    """The observed timer and return-code paths of the Nokia game dispatcher.

    Unsupported return codes abort the trace. When both timers expire together,
    secondary is delivered first; the phone event-queue tie order is unknown.
    """
    def __init__(self, fw):
        self.fw = fw
        self.now = 0
        start = fw.message(0x24)
        if start['return'] != 1 or not start['delay']:
            raise RuntimeError('unexpected startup result')
        # Dispatcher event 0x53 starts the primary timer from record +12.
        self.main_due = start['delay']
        self.secondary_due = None
        self.secondary_events = []
        self.ended = False

    def next_main(self):
        while self.main_due is not None or self.secondary_due is not None:
            secondary_first = self.secondary_due is not None and (self.main_due is None or self.secondary_due <= self.main_due)
            self.now = self.secondary_due if secondary_first else self.main_due
            if secondary_first:
                self.secondary_due = None
                result = self.fw.message(0)
                self.secondary_events.append(self.now)
            else:
                self.main_due = None
                result = self.fw.message(1)
            code = result['return']
            if code == 19:
                # Dispatcher cancels and restarts both timers on return 0x13.
                self.main_due = self.now + result['delay']
                self.secondary_due = self.now + result['timer']
            elif code == 21:
                # Cancel the secondary timer; only a fired main timer restarts.
                self.secondary_due = None
                if not secondary_first: self.main_due = self.now + result['delay']
            elif code == 22:
                # Cancel and restart the main timer regardless of event source.
                self.main_due = self.now + result['delay']
                if secondary_first: self.secondary_due = self.now + result['timer']
            elif code in (23, 25):
                # Cancel the main timer without restarting it.
                self.main_due = None
                if secondary_first: self.secondary_due = self.now + result['timer']
            elif code in (31, 32):
                # Cancel and restart the secondary timer; 31 can also play sound.
                self.secondary_due = self.now + result['timer']
                if not secondary_first: self.main_due = self.now + result['delay']
            elif code in (1, 27, 33):
                # These paths restart the timer that delivered the event.
                if secondary_first:
                    self.secondary_due = self.now + result['timer']
                else:
                    self.main_due = self.now + result['delay']
            elif code in (2, 18, 24, 30):
                # The dispatcher exits the game and cancels both timers.
                self.main_due = self.secondary_due = None
                self.ended = True
            else:
                raise RuntimeError('unmodeled dispatcher return %#x at %d ms' % (code, self.now))
            if not secondary_first:
                return self.now, result
        raise RuntimeError('main timer stopped')

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--flash', required=True, help='path to the Nokia 3310 v6.39 PPM B flash image')
    p.add_argument('--seed', default='0x1234')
    p.add_argument('--messages', default='0x24,1,1,1,1')
    p.add_argument('--state', action='store_true', help='include the full game-state bytes')
    args = p.parse_args()
    fw = SpaceImpactOracle(args.flash, int(args.seed, 0))
    for value in args.messages.split(','):
        msg = fw.message(int(value, 0))
        if not args.state: del msg['state_hex']
        print(json.dumps(msg, separators=(',', ':')))
