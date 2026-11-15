#!/usr/bin/env python3
"""Record the ship's shots against ordinary enemies: hits, hit points, explosions and score, from the original handler.

Like tools/spaceimpact_record_enemies.py every ordinary wave record is played in isolation (ship unhurtable through private
flash patches, both random generators seeded alike), but the ship is placed at the height of the first enemy when it would pass
x = 40 and fires on every tick (message 10, the main weapon). Per tick the file stores the score, every enemy as
[x, y, hit points, animation] (null once it is gone) and the ship's shots as [x, y] sorted.

Usage: python3 tools/spaceimpact_record_hits.py --flash <firmware> --output FILE
"""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, RECORD
from spaceimpact_record_enemies import new_case, EXTRA, SEED, BOSS_CLASSES, PICKUPS
import spaceimpact_record_enemies as E


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
    ids, ticks = None, []
    ship_id = m.r16(0x10a208)
    for _ in range(limit):
        f.message(10)                      # fire on every tick (the firmware lets one shot out per cooldown)
        _, state = clock.next_main()
        objects = {o['id']: o for o in state['objects']}
        if ids is None:
            ids = [o['id'] for o in state['objects'] if m.r8(EXTRA + 12 * o['id'] + 2) == record[1]]
        enemies = []
        for ident in ids:
            o = objects.get(ident)
            enemies.append([o['x'], o['y'], m.r8(EXTRA + 12 * ident + 3), m.r8(EXTRA + 12 * ident + 1)]
                           if o and m.r8(EXTRA + 12 * ident + 2) == record[1] else None)
        shots = sorted([o['x'], o['y']] for i, o in objects.items() if i not in ids and m.r8(EXTRA + 12 * i + 2) == 1)
        ticks.append({'score': m.r32(0x10a1fc), 'enemies': enemies, 'shots': shots})
        m.w8(0x10a1ef, 255)
        if all(e is None for e in enemies):
            break
    return {'level': level + 1, 'wave': wave_index + 1, 'ship_y': ship_y, 'record': record, 'ticks': ticks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--flash', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--max-ticks', type=int, default=160)
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
            ship_y = 6 + (len(cases) * 7) % 30
            cases.append(record_wave(args.flash, level, index, ship_y, args.max_ticks))
            if len(cases) % 20 == 0:
                print('recorded %d cases' % len(cases), flush=True)
    out = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(), 'seed': SEED, 'cases': cases}
    args.output.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print('wrote', args.output, len(cases))


if __name__ == '__main__':
    main()
