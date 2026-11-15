#!/usr/bin/env python3
"""Trace ship sound events and calls to the firmware's vibration routine."""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, RECORD
import extract_spaceimpact_tones as tones


def run(flash, name):
    fw=SpaceImpactOracle(flash); clock=FirmwareTimers(fw);clock.next_main();clock.next_main();m=fw.m
    m.w16(RECORD+20,0); vibrations=[]
    def hook(cpu,target,origin):
        if target & ~1 == 0x2dd70e: vibrations.append(origin)
    fw.c.callhook=hook
    if name=='hit':
        for tick in range(3,151):
            _,r=clock.next_main()
            if m.r8(0x10a200): break
        else: raise RuntimeError('no collision')
    elif name == 'mainrepeat':
        fw.message(10); clock.next_main(); clock.next_main(); m.w16(RECORD+20,0); r=fw.message(138)
    elif name.startswith('pickup'):
        cls=int(name[6:]);fw.c.hooks[0x2dd7d0]=lambda cpu: cpu.r.__setitem__(0,1)
        fw.c.call(0x2592b0,[cls,1,RECORD]);r={'event':m.r16(RECORD+20),'return':None}
    else:
        code={'main':10,'bonus9':13,'bonus10':13,'bonus22':13}[name]
        if name.startswith('bonus'):
            m.w8(0x10a205,int(name[5:]));m.w8(0x10a206,3)
        r=fw.message(code)
    return {'name':name,'event':r['event'],'return':r['return'],'vibration_calls':len(vibrations)}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--flash',required=True)
    p.add_argument('--output',type=Path,default=Path(__file__).resolve().parent.parent/'web/tests/fixtures/spaceimpact-ship-sounds.json')
    a=p.parse_args();data=Path(a.flash).read_bytes();tones.EVENTS=(0x17,0x18,0x19,0x1a,0x1f)
    scripts=tones.extract(data)
    out={'firmware_sha256':hashlib.sha256(data).hexdigest(),'scripts':scripts['events'],
         'cases':[run(a.flash,name) for name in ('main','mainrepeat','bonus9','bonus10','bonus22','pickup17','pickup33','hit')]}
    a.output.write_text(json.dumps(out,separators=(',',':'))+'\n');print(a.output)
if __name__=='__main__':main()
