#!/usr/bin/env python3
"""Record the wave schedule of all eight levels from the firmware oracle.

A bot plays the original handler through the levels. To get past a level it must kill the boss, so the ship
shoots only bosses, and the ship cannot be hit: in this process's private copy of the flash the two halfwords
that begin the ship-contact search are replaced (see PATCHES). This is an exploration aid; nothing here is a
faithful recording of ship deaths. Enemy spawns do not depend on the ship, so the schedule is unaffected.

For every level the output lists the tick offsets, counted from the level's first tick, at which each wave
record was spawned. The first wave comes 20 ticks after a level starts and every later one comes as many ticks
after the previous wave as its record's delay byte says; the fixture lets the engine prove that.

Usage: python3 tools/spaceimpact_record_schedule.py --flash /path/to/firmware.fls [--output FILE]
Takes about two minutes. The flash image is not stored.
"""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers

# (address, replacement halfword): 0x259de2 `adds r4,r0,#0` -> `movs r4,#0` makes the ship-contact search find
# nothing; 0x259d72/0x259d74 `bl 0x2e7036` -> `movs r0,#0; nop` disables the terrain test.
PATCHES = [(0x259de2, 0x2400), (0x259d72, 0x2000), (0x259d74, 0x46c0)]
BOSS_CLASSES = {7, 18, 19, 20, 23, 24, 25, 34}
EXTRA, SHIP_ID, LEVEL, WAVES_LEFT = 0x109f0c, 0x10a208, 0x109ef0, 0x10a1ee
DISPLAY_ARRAY = None


def record(flash, last_tick):
    fw = SpaceImpactOracle(flash)
    clock = FirmwareTimers(fw)
    m = fw.m
    m.flash = bytearray(m.flash)
    for address, halfword in PATCHES:
        offset = address - m.base
        m.flash[offset], m.flash[offset + 1] = halfword >> 8, halfword & 0xff
    clock.next_main()
    levels = {}              # level -> {'start': tick, 'waves': [ticks]}
    level, remaining = 0, m.r8(WAVES_LEFT)
    levels[0] = {'start': 1, 'waves': []}
    for tick in range(2, last_tick + 1):
        try:
            _, state = clock.next_main()
        except RuntimeError:
            break
        now_level = m.r8(LEVEL)
        if now_level != level:
            level, remaining = now_level, m.r8(WAVES_LEFT)
            levels[level] = {'start': tick, 'waves': []}
        left = m.r8(WAVES_LEFT)
        while left < remaining:
            levels[level]['waves'].append(tick)
            remaining -= 1
        # aim at a boss and fire at it, nothing else
        sid = m.r16(SHIP_ID)
        ship, boss = None, None
        for o in state['objects']:
            cls = m.r8(EXTRA + 12 * o['id'] + 2)
            if o['id'] == sid:
                ship = o
            elif cls in BOSS_CLASSES and o['x'] < 84:
                boss = o
        if boss and ship:
            want = boss['y'] + boss['height'] // 2 - 6
            if want != ship['y']:
                fw.message(17 if want < ship['y'] else 9)
            fw.message(10)
    return levels


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--flash', required=True)
    parser.add_argument('--last-tick', type=int, default=5800)
    parser.add_argument('--output', type=Path,
                        default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-schedule.json')
    args = parser.parse_args()
    levels = record(args.flash, args.last_tick)
    out = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(), 'handler': '0x25a52a',
           'note': 'offsets are tick - level start tick; the ship cannot be hit and shoots only bosses',
           'levels': [{'level': k + 1, 'start_tick': v['start'], 'spawn_offsets': [t - v['start'] for t in v['waves']]}
                      for k, v in sorted(levels.items())]}
    args.output.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(args.output)
    for entry in out['levels']:
        print('level %d starts at tick %d, %d waves, first at +%d' % (entry['level'], entry['start_tick'],
              len(entry['spawn_offsets']), entry['spawn_offsets'][0] if entry['spawn_offsets'] else -1))


if __name__ == '__main__':
    main()
