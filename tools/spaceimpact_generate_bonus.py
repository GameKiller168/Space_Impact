#!/usr/bin/env python3
"""Capture bonus-key and projectile transitions from the original handler."""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers
from spaceimpact_generate_terrain_contact import patch


def run(flash, level, weapon, ammo, messages):
    fw = SpaceImpactOracle(flash)
    m = fw.m; m.flash = bytearray(m.flash)
    patch(m, 0x257c9a, 0x2000 + level - 1)
    clock = FirmwareTimers(fw); clock.next_main(); clock.next_main()
    m.w8(0x10a1ef, 255); m.w8(0x10a205, weapon); m.w8(0x10a206, ammo)
    steps = []
    for msg in messages:
        result = fw.message(msg)
        shots = []
        for o in result['objects']:
            cls = m.r8(0x109f0e + 12 * o['id'])
            if cls in (9, 10, 22):
                item = {'type': cls, 'x': o['x'], 'y': o['y']}
                if cls == 22:
                    a = m.r32(0x111af4) + 28 * o['id']
                    item['endX'] = m.r8(a + 12); item['endY'] = m.r8(a + 13)
                else:
                    item['data'] = o['data']; item['width'] = o['width']; item['height'] = o['height']
                shots.append(item)
        steps.append({'message': msg, 'cooldown': m.r8(0x10a201), 'ammo': m.r8(0x10a206),
                      'event': result['event'] if result['return'] in (27, 31) else 0, 'shots': shots})
    return {'level': level, 'type': weapon, 'ammo': ammo, 'steps': steps}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--flash', required=True)
    p.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-bonus.json')
    args = p.parse_args()
    scenarios = [(1,9,3,[13]+[1]*8), (1,10,3,[15]+[1]*85), (1,22,3,[13,1,13,1,15]+[1]*35),
                 (5,22,2,[15]+[1]*5), (1,10,2,[13,15,1,15,1,15,1,1,13,1,1,15]),
                 (1,10,0,[13,15,1,141,143])]
    data = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(), 'handler': '0x25a52a',
            'cases': [run(args.flash, *s) for s in scenarios]}
    args.output.write_text(json.dumps(data, separators=(',', ':')) + '\n'); print(args.output)
if __name__ == '__main__': main()
