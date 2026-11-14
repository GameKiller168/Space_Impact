#!/usr/bin/env python3
"""Capture the first three level-1 waves with the local firmware oracle."""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--flash', required=True)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-waves.json')
args=parser.parse_args()
fw = SpaceImpactOracle(args.flash)
selected = {20,21,22,55,56,57,61,62,63,70,71,72,79,80,81,90,91,92}
result = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
          'handler':'0x25a52a','descriptor':'0x312084','wave_table':'0x311820',
          'timer_ms':100,'inputs':[],
          'coincident_timers':'secondary message 0 before main message 1 (ordering unverified)',
          'first_three_records':[fw.m.read_bytes(0x311820 + i*12,12).hex() for i in range(3)],
          'snapshots':[]}
timers = FirmwareTimers(fw)
for tick in range(1, max(selected) + 1):
    elapsed, event = timers.next_main()
    if tick not in selected: continue
    enemies = [{key: obj[key] for key in ('x','y','data','width','height')} for obj in event['objects']
               if obj['data'] in ('0x003122d4','0x003122e0')]
    result['snapshots'].append({'tick':tick,'ms':elapsed,'scroll':fw.m.r16(0x10a1f2),
        'waves_left':fw.m.r8(0x10a1ee),'wait_ticks':fw.m.r8(0x10a1ef),'enemies':enemies})
args.output.write_text(json.dumps(result,indent=2)+'\n')
print(args.output)
