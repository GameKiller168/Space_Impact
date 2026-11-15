#!/usr/bin/env python3
"""Record when and where ordinary enemies fire, by playing isolated wave records with the original handler.

Same setup as tools/spaceimpact_record_enemies.py (ship parked and unhurtable through the private flash patches, the two
random generators seeded alike); in addition every object that is not one of the wave's enemies and appears on the display
list is recorded with the tick it appeared on, its class, position and the state of both random generators before and after
the tick. The rule that decides firing is then fitted to these recordings (see web/js/spaceimpact-fire.js).

Usage: python3 tools/spaceimpact_record_fire.py --flash <firmware> [--output FILE]
"""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, RECORD
from spaceimpact_record_enemies import new_case, EXTRA, SEED, BOSS_CLASSES, PICKUPS

SPAWN_RNG, EFFECT_RNG = 0x111bf0, 0x10da5c


def record_wave(flash, level, wave_index, ship_y, limit):
    f, clock = new_case(flash, level, ship_y)
    m = f.m
    desc = m.r32(0x10a2a4 + 4 * level)
    address = m.r32(desc + 4) + wave_index * 12
    record = list(m.read_bytes(address, 12))
    m.w8(0x10a1e0, 1)
    m.w32(0x10a1e4, address)
    m.w8(0x10a1ee, 1)
    m.w8(0x10a1ef, 0)
    wave_ids, known, ticks = None, set(), []
    calls = []

    def hook(cpu, target, from_pc):
        # the routines that decide and perform a shot: 0x25865a (should it fire?), 0x2586b2 (fire), 0x2584c8 (no ammunition needed?)
        if target in (0x25865a, 0x2586b2, 0x2584c8):
            idx = cpu.r[0]
            base = EXTRA + 12 * idx
            calls.append([target, from_pc, idx, [m.r8(base + k) for k in range(12)]])
    f.c.callhook = hook
    for t in range(limit):
        del calls[:]
        before = (m.r32(SPAWN_RNG), m.r32(EFFECT_RNG))
        _, state = clock.next_main()
        objects = {o['id']: o for o in state['objects']}
        if wave_ids is None:
            wave_ids = [o['id'] for o in state['objects'] if m.r8(EXTRA + 12 * o['id'] + 2) == record[1]]
            known = set(o['id'] for o in state['objects'])
        enemies = []
        for ident in wave_ids:
            o = objects.get(ident)
            enemies.append([o['x'], o['y']] if o and m.r8(EXTRA + 12 * ident + 2) == record[1] else None)
        # every enemy bullet on the display list (class 4, the first extra byte pair identifies the class), by position
        shots = sorted([o['x'], o['y']] for ident, o in objects.items()
                       if ident not in wave_ids and m.r8(EXTRA + 12 * ident + 2) == 4)
        after = (m.r32(SPAWN_RNG), m.r32(EFFECT_RNG))
        ticks.append({'enemies': enemies, 'bullets': shots, 'rng_before': before, 'rng_after': after, 'calls': [list(c) for c in calls]})
        m.w8(0x10a1ef, 255)
        if all(e is None for e in enemies):
            break
    return {'level': level + 1, 'wave': wave_index + 1, 'ship_y': ship_y, 'record': record, 'ticks': ticks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--flash', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--max-ticks', type=int, default=300)
    args = parser.parse_args()
    f = SpaceImpactOracle(args.flash)
    cases = []
    for level in range(8):
        desc = f.m.r32(0x10a2a4 + 4 * level)
        count, table = f.m.r8(desc), f.m.r32(desc + 4)
        for index in range(count):
            record = list(f.m.read_bytes(table + index * 12, 12))
            if not record[0] or record[1] in BOSS_CLASSES or record[1] in PICKUPS:
                continue
            cases.append(record_wave(args.flash, level, index, (8, 20, 29)[len(cases) % 3], args.max_ticks))
            if len(cases) % 20 == 0:
                print('recorded %d cases' % len(cases), flush=True)
    out = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(), 'seed': SEED, 'cases': cases}
    args.output.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print('wrote', args.output, len(cases))


if __name__ == '__main__':
    main()
