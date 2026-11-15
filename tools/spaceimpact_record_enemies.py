#!/usr/bin/env python3
"""Record isolated ordinary wave records with the original Space Impact handler.

Each case initializes the requested level, then selects one unmodified wave
record. The private flash patches are those used by spaceimpact_record_schedule:
they prevent ship and terrain damage but preserve the shot-contact routine.
The ship is parked using normal key messages. Enemy projectiles are left active.
The 300-tick limit bounds modes that remain on screen indefinitely.

Usage: python3 tools/spaceimpact_record_enemies.py --flash <firmware> [--output FILE]
"""
import argparse
import hashlib
import json
from pathlib import Path

from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, RECORD
from spaceimpact_record_schedule import PATCHES, BOSS_CLASSES

EXTRA, DISPLAY, SHIP = 0x109f0c, 0x111af0, 0x10a208
SEED = 0x1234
PICKUPS = {17, 33}


def random_vectors(flash):
    f = SpaceImpactOracle(flash)
    rows = []
    for seed in (0, 1, SEED, 0x80000000, 0xffffffff):
        f.m.w32(0x111bf0, seed)
        f.m.w32(0x10da5c, seed)
        row = {'seed': seed, 'spawn': [], 'effects': []}
        for _ in range(16):
            value = f.c.call(0x2f1b44)
            row['spawn'].append([value, f.m.r32(0x111bf0)])
            value = f.c.call(0x2dd7d0)
            row['effects'].append([value, f.m.r32(0x10da5c)])
        rows.append(row)
    return rows


def new_case(flash, level, ship_y):
    f = SpaceImpactOracle(flash, SEED)
    m = f.m
    m.flash = bytearray(m.flash)
    for address, halfword in PATCHES:
        offset = address - m.base
        m.flash[offset:offset + 2] = halfword.to_bytes(2, 'big')
    clock = FirmwareTimers(f)
    # 0x2578de loads the level descriptor and recreates terrain; 0x257a18
    # creates the ship, exactly as the normal startup path does.
    m.w8(0x109ef0, level)
    f.c.call(0x2578de, [m.r32(0x10a2a4 + 4 * level)])
    f.c.call(0x257a18, [RECORD, 10])
    clock.next_main()
    for _ in range(abs(ship_y - 20)):
        f.message(17 if ship_y < 20 else 9)
    m.w32(0x111bf0, SEED)
    m.w32(0x10da5c, SEED)
    return f, clock


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
    for _ in range(limit):
        _, state = clock.next_main()
        objects = {o['id']: o for o in state['objects']}
        if ids is None:
            ids = [o['id'] for o in state['objects'] if m.r8(EXTRA + 12 * o['id'] + 2) == record[1]]
            if len(ids) != record[0]:
                raise RuntimeError('level %d wave %d: spawned %d of %d' % (level + 1, wave_index + 1, len(ids), record[0]))
        row = [m.r32(0x10a1fc)]
        for ident in ids:
            o = objects.get(ident)
            cls = m.r8(EXTRA + 12 * ident + 2) if o else None
            if o is None or cls != record[1]:
                row.append(None)
            else:
                row.append([o['x'], o['y'], m.r8(EXTRA + 12 * ident + 1), m.r8(EXTRA + 12 * ident + 3)])
        ticks.append(row)
        # Do not allow the next wave or a level transition to contaminate a case.
        m.w8(0x10a1ef, 255)
        if all(entry is None for entry in row[1:]):
            break
    return {'level': level + 1, 'wave': wave_index + 1, 'ship_y': ship_y, 'record': record, 'ticks': ticks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--flash', required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-enemies.json')
    parser.add_argument('--max-ticks', type=int, default=300)
    parser.add_argument('--limit', type=int, default=0, help='optional maximum case count for development')
    args = parser.parse_args()
    f = SpaceImpactOracle(args.flash)
    cases, skipped = [], []
    for level in range(8):
        desc = f.m.r32(0x10a2a4 + 4 * level)
        count, table = f.m.r8(desc), f.m.r32(desc + 4)
        for index in range(count):
            record = list(f.m.read_bytes(table + index * 12, 12))
            if not record[0] or record[1] in BOSS_CLASSES or record[1] in PICKUPS:
                skipped.append([level + 1, index + 1, record[1]])
                continue
            ship_y = (8, 20, 29)[len(cases) % 3]
            cases.append(record_wave(args.flash, level, index, ship_y, args.max_ticks))
            if len(cases) % 20 == 0:
                print('recorded %d cases' % len(cases), flush=True)
            if args.limit and len(cases) >= args.limit:
                break
        if args.limit and len(cases) >= args.limit:
            break
    output = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
              'handler': '0x25a52a', 'seed': SEED,
              'notes': 'Isolated unmodified ordinary records; patched ship contact; no ship firing. Each tick is [score,[x,y,animation,hp],...]; null means removed.',
              'random': random_vectors(args.flash), 'skipped_boss_pickup_empty': skipped, 'cases': cases}
    args.output.write_text(json.dumps(output, separators=(',', ':')) + '\n')
    print('wrote %s: %d cases' % (args.output, len(cases)), flush=True)


if __name__ == '__main__':
    main()
