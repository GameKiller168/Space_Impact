#!/usr/bin/env python3
"""Capture independent input-driven Space Impact collision/recovery sequences."""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--flash',required=True)
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parent.parent/'web/tests/fixtures/spaceimpact-collision.json')
args=parser.parse_args()

def run(name, inputs, max_hits):
    fw=SpaceImpactOracle(args.flash); clock=FirmwareTimers(fw); clock.next_main()
    for msg in inputs:
        result=fw.message(msg)
        if result['return'] != 1: raise RuntimeError('unmodeled input dispatcher result')
    episodes=[]; recording=None
    for tick in range(2,1000):
        now,result=clock.next_main(); m=fw.m; active=m.r8(0x10a200)
        if active and recording is None:
            recording=[]
        if recording is not None:
            sid=m.r16(0x10a208)
            entry=next((o for o in result['objects'] if o['id']==sid),None)
            ship=None if entry is None else {k:entry[k] for k in ('x','y','data','width','height','flags')}
            recording.append({'ms':now,'return':result['return'],'event':result['event'],
                'lives':m.r8(0x10a203),'hit_state':active,'phase':result['phase'],
                'delay':result['delay'],'ship':ship,
                'next_main_ms':clock.main_due,'next_secondary_ms':clock.secondary_due})
            if result['return'] in (19,24):
                episodes.append(recording); recording=None
                if len(episodes)>=max_hits or clock.ended:break
        if clock.ended:break
    if len(episodes)!=max_hits:raise RuntimeError('did not capture the requested collision episodes: '+name)
    return {'name':name,'inputs_after_first_tick':inputs,'episodes':episodes}

result={'firmware_sha256':hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
        'handler':'0x25a52a', 'coincident_timers':'secondary message 0 before main message 1 (ordering unverified)',
        'scenarios':[run('unsteered_three_lives',[],3),run('up_once',[17],1),
                     run('right_five',[20]*5,1),run('down_once',[9],1)]}
args.output.write_text(json.dumps(result,indent=2)+'\n');print(args.output)
