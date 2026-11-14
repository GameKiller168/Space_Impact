#!/usr/bin/env python3
"""Capture the first unsteered player collision and recovery from the firmware."""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, DISPLAY
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--flash',required=True)
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parent.parent/'web/tests/fixtures/spaceimpact-life.json')
args=parser.parse_args()
fw=SpaceImpactOracle(args.flash); timers=FirmwareTimers(fw)
trace={'firmware_sha256':hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
       'handler':'0x25a52a','inputs':[],'initial_ship_position':[5,20],
       'coincident_timers':'secondary message 0 before main message 1 (ordering unverified)',
       'snapshots':[]}
for tick in range(1,111):
    ms,event=timers.next_main()
    if not 89<=tick<=104:continue
    m=fw.m; ship=m.r16(0x10a208); a=m.r32(DISPLAY+4)+28*ship
    trace['snapshots'].append({'tick':tick,'ms':ms,'return':event['return'],'event':event['event'],
        'lives':m.r8(0x10a203),'hit_state':m.r8(0x10a200),
        'ship':{'x':m.r8(a+4),'y':m.r8(a+5),'data':'0x%08x'%m.r32(a+12),
                'width':m.r8(a+20),'height':m.r8(a+21),'flags':m.r8(a+24)},
        'scroll':m.r16(0x10a1f2),'waves_left':m.r8(0x10a1ee),'wait_ticks':m.r8(0x10a1ef),
        'next_main_ms':timers.main_due,'next_secondary_ms':timers.secondary_due})
trace['secondary_events_ms']=timers.secondary_events
trace['next_main_ms']=timers.main_due
trace['next_secondary_ms']=timers.secondary_due
args.output.write_text(json.dumps(trace,indent=2)+'\n')
print(args.output)
