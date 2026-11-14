#!/usr/bin/env python3
"""Record initial main-weapon transitions from the original game handler."""
import argparse
import hashlib
import json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, DISPLAY

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--flash', required=True)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-fire.json')
args = parser.parse_args()

cases = [('main_1', [10, 1, 1, 1]), ('main_3', [12, 1, 1]),
         ('cooldown', [10, 10, 1, 10, 1, 10, 1, 1, 12]),
         ('moved_ship', [17, 20, 10, 1, 1]),
         ('high_variants', [138, 138, 1, 1, 138, 140, 1, 1, 140, 138, 138, 138, 1, 1, 138, 10])]
out = {'source': 'Nokia 3310 v6.39 PPM B, app 1, handler 0x25a52a',
       'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(), 'cases': []}
for name, messages in cases:
    firmware = SpaceImpactOracle(args.flash)
    initial = firmware.message(36)
    existing = {obj['id'] for obj in initial['objects']}
    steps = []
    for msg in messages:
        state = firmware.message(msg)
        ship_id = firmware.m.r16(0x10a208)
        ship_addr = firmware.m.r32(DISPLAY + 4) + ship_id * 28
        shots = [{'x': obj['x'], 'y': obj['y']} for obj in state['objects'] if obj['id'] not in existing]
        steps.append({'message': msg, 'ship': [firmware.m.r8(ship_addr + 4), firmware.m.r8(ship_addr + 5)],
                      'cooldown': firmware.m.r8(0x10a201), 'repeats': firmware.m.r8(0x10a202), 'shots': shots})
    out['cases'].append({'name': name, 'steps': steps})
args.output.write_text(json.dumps(out, indent=2) + '\n')
print(args.output)
