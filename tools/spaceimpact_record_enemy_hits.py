#!/usr/bin/env python3
"""Record ship-shot contacts with isolated ordinary firmware waves.

The ship is untouchable via the private patches from the schedule recorder; it
fires normal messages while parked at three heights. Each saved sample captures
the actual shot-contact routine's inputs immediately before its call and the
objects and score after the handler returns. Enemy bullets remain enabled.

Usage: python3 tools/spaceimpact_record_enemy_hits.py --flash <firmware> [--output FILE]
"""
import argparse
import hashlib
import json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle
from spaceimpact_record_enemies import new_case, EXTRA, SHIP

IGNORED = {0, 1, 2, 8, 9, 10, 22, 36, 50}
BOSSES = {7, 18, 19, 20, 23, 24, 25, 34, 35}
PICKUPS = {17, 33}


def shot_sample(f):
    m = f.m
    objects = f.snapshot()['objects']
    try:
        ship_index = next(i for i, o in enumerate(objects) if o['id'] == m.r16(SHIP))
    except StopIteration:
        return None
    shots = []
    for o in objects:
        cls = m.r8(EXTRA + 12 * o['id'] + 2)
        if cls == 1:
            shots.append([o['id'], o['x'], o['y'], o['width'], o['height']])
    targets = []
    for o in objects[ship_index + 1:]:
        extra = EXTRA + 12 * o['id']
        cls = m.r8(extra + 2)
        if cls == 35:
            return None  # final-boss turret path belongs to the boss subsystem
        if cls not in IGNORED and cls not in BOSSES and cls not in PICKUPS:
            targets.append([o['id'], cls, o['x'], o['y'], o['width'], o['height'], m.r8(extra + 3), m.r8(extra + 10)])
    if not shots or not targets:
        return None
    return [m.r32(0x10a1fc), shots, targets]


def touch(s, o):
    def signed(n): return n if n < 128 else n - 256
    x, y, w, h = map(signed, o[2:6])
    return s[1] <= x + w and s[1] + s[3] >= x and s[2] <= y + h and s[2] + s[4] >= y


def record_case(flash, level, index, ship_y):
    f, clock = new_case(flash, level, ship_y)
    m = f.m
    descriptor = m.r32(0x10a2a4 + 4 * level)
    address = m.r32(descriptor + 4) + 12 * index
    record = list(m.read_bytes(address, 12))
    m.w8(0x10a1e0, 1); m.w32(0x10a1e4, address)
    m.w8(0x10a1ee, 1); m.w8(0x10a1ef, 0)
    before, samples, terrain_hits = [None], [], set()
    original_step = f.c.step
    def step():
        # At the instruction following the shot-terrain BL, r0 is its result
        # and r4 is the projectile's display id. The firmware still runs it.
        if f.c.pc == 0x259f18 and f.c.r[0]:
            terrain_hits.add(f.c.r[4])
        original_step()
    f.c.step = step
    def hook(cpu, target, source):
        if target == 0x259d30:
            before[0] = shot_sample(f)
    f.c.callhook = hook
    for tick in range(190):
        f.message(10)
        before[0] = None
        terrain_hits.clear()
        _, result = clock.next_main()
        old = before[0]
        if old and (tick % 16 == 0 or any(touch(s, o) for s in old[1] for o in old[2])):
            objects = {o['id']: o for o in result['objects']}
            live_shots = [s[0] for s in old[1] if s[0] in objects and m.r8(EXTRA + 12 * s[0] + 2) == 1]
            targets = []
            for o in old[2]:
                ident = o[0]
                if ident in objects:
                    e = EXTRA + 12 * ident
                    targets.append([ident, m.r8(e + 2), m.r8(e + 3), m.r8(e + 1), objects[ident]['data']])
                else:
                    targets.append([ident, None])
            samples.append([tick + 1, old[0], old[1], old[2], m.r32(0x10a1fc), live_shots, targets, sorted(terrain_hits)])
        m.w8(0x10a1ef, 255)
    return {'level': level + 1, 'wave': index + 1, 'record': record, 'ship_y': ship_y, 'samples': samples}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--flash', required=True)
    p.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-enemy-hits.json')
    args = p.parse_args()
    f = SpaceImpactOracle(args.flash)
    selected = []
    seen = set()
    for level in range(8):
        desc = f.m.r32(0x10a2a4 + 4 * level)
        for index in range(f.m.r8(desc)):
            rec = list(f.m.read_bytes(f.m.r32(desc + 4) + index * 12, 12))
            cls = rec[1]
            if not rec[0] or cls in BOSSES or cls in PICKUPS or cls in seen:
                continue
            seen.add(cls)
            selected.append((level, index))
    # Include multi-hit enemies and an aligned class-3 wave.
    selected.extend([(0, 4), (7, 0), (0, 16)])
    cases = []
    for level, index in selected:
        for y in (8, 20, 29):
            cases.append(record_case(args.flash, level, index, y))
        print('recorded class %d' % cases[-1]['record'][1], flush=True)
    out = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
           'handler': '0x259d30', 'seed': 0x1234, 'notes': 'The patched original handler runs with enemy fire enabled. Samples capture shot searches before and after the handler, including projectile ids consumed by the original terrain test.', 'cases': cases}
    args.output.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print('wrote %s (%d cases)' % (args.output, len(cases)))


if __name__ == '__main__':
    main()
