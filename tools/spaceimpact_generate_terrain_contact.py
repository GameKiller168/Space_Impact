#!/usr/bin/env python3
"""Record ship-versus-terrain decisions from the original game handler.

Each case starts a chosen level by changing one initialization instruction in a
private flash copy. Only the ship's search for *other objects* is disabled; the
terrain test and all other code run normally. Inputs move the ship before the
first recorded tick, then it stays still while the landscape scrolls. The CRC
is of the actual 168-byte terrain buffer seen at contact entry.
"""
import argparse
import hashlib
import json
import zlib
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, DISPLAY, GLOBAL

SHIP, MODE, GUARD, HIT, SCROLL = 0x10a208, 0x109ecc, 0x10a20a, 0x10a200, 0x10a1f2


def patch(m, address, value):
    offset = address - m.base
    m.flash[offset:offset + 2] = bytes((value >> 8, value & 0xff))


def run(flash, level, x, y, limit):
    fw = SpaceImpactOracle(flash)
    m = fw.m
    m.flash = bytearray(m.flash)
    # Replace a redundant clear of an already zero field by movs r0, #level-1.
    # The normal initialization uses r0 for the level byte and descriptor.
    patch(m, 0x257c9a, 0x2000 + level - 1)
    # 0x259de2: ignore the found object; do not patch the terrain call.
    patch(m, 0x259de2, 0x2400)
    clock = FirmwareTimers(fw)
    clock.next_main()
    sid = m.r16(SHIP)
    def ship():
        address = m.r32(DISPLAY + 4) + 28 * sid
        return m.r8(address + 4), m.r8(address + 5)
    while ship()[0] != x:
        before = ship()
        fw.message(20 if before[0] < x else 22)
        if ship() == before:
            raise RuntimeError('unreachable x')
    while ship()[1] != y:
        before = ship()
        fw.message(9 if before[1] < y else 17)
        if ship() == before:
            raise RuntimeError('unreachable y')
    frames = []
    captured = []
    def contact(cpu, target, from_pc):
        if target & ~1 == 0x259d30:
            pos = ship()
            ship_addr = m.r32(DISPLAY + 4) + 28 * sid
            shield_id = m.r16(GUARD)
            shield_addr = m.r32(DISPLAY + 4) + 28 * shield_id
            shield = None if not shield_id else {'x': m.r8(shield_addr + 4), 'y': m.r8(shield_addr + 5),
                'width': m.r8(shield_addr + 20), 'height': m.r8(shield_addr + 21),
                'data': '0x%08x' % m.r32(shield_addr + 12)}
            captured.append({'scroll': m.r16(SCROLL), 'x': pos[0], 'y': pos[1],
                             'ship_data': '0x%08x' % m.r32(ship_addr + 12),
                             'guard': shield_id, 'shield': shield, 'collision_mode': m.r8(0x10a1ed), 'orientation': m.r8(MODE),
                             'terrain_crc32': '%08x' % (zlib.crc32(m.read_bytes(m.r32(GLOBAL + 12), 168)) & 0xffffffff)})
    fw.c.callhook = contact
    for tick in range(2, limit + 1):
        captured.clear()
        _, result = clock.next_main()
        if len(captured) != 1:
            raise RuntimeError('unexpected contact calls at tick %d' % tick)
        frame = dict(captured[0], tick=tick, hit=bool(m.r8(HIT)), after_y=ship()[1], event=result['event'], returned=result['return'])
        frames.append(frame)
        if frame['hit']:
            break
    return {'level': level, 'x': x, 'y': y, 'frames': frames}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--flash', required=True)
    p.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-terrain-contact.json')
    args = p.parse_args()
    scenarios = [(1, 5, 41), (2, 5, 41)]
    for level in (3, 4, 7, 8):
        scenarios += [(level, 5, y) for y in (29, 32, 35, 38, 41)]
        scenarios += [(level, 22, 35)]
    for level in (5, 6):
        scenarios += [(level, 5, y) for y in (1, 6, 9, 12, 15, 16)]
        scenarios += [(level, 22, 9)]
    data = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
            'routine': '0x2e7036', 'ship_contact': '0x259d30',
            'patches': 'initial level selection and object search only; terrain contact unmodified',
            'cases': [run(args.flash, *case, 90) for case in scenarios]}
    args.output.write_text(json.dumps(data, separators=(',', ':')) + '\n')
    for case in data['cases']:
        hits = [f['tick'] for f in case['frames'] if f['hit']]
        print('level %d x=%d y=%d first_hit=%s frames=%d' % (case['level'], case['x'], case['y'], hits, len(case['frames'])))
    print(args.output)


if __name__ == '__main__':
    main()
