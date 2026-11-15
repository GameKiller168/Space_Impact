#!/usr/bin/env python3
"""Trace initial and post-respawn shield duration and preserved bonus ammo."""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, DISPLAY


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--flash',required=True)
    p.add_argument('--output',type=Path,default=Path(__file__).resolve().parent.parent/'web/tests/fixtures/spaceimpact-lives-details.json')
    a=p.parse_args();fw=SpaceImpactOracle(a.flash);clock=FirmwareTimers(fw);clock.next_main();m=fw.m
    m.w8(0x10a205,9);m.w8(0x10a206,7)
    frames=[]
    for tick in range(2,141):
        _, r=clock.next_main();sid=m.r16(0x10a208);obj=m.r32(DISPLAY+4)+28*sid
        frames.append({'tick':tick,'lives':m.r8(0x10a203),'hit':bool(m.r8(0x10a200)),
                       'guard':bool(m.r16(0x10a20a)), 'type':m.r8(0x10a205),'ammo':m.r8(0x10a206),
                       'ship':[m.r8(obj+4),m.r8(obj+5)], 'event':r['event'],'return':r['return']})
    out={'firmware_sha256':hashlib.sha256(Path(a.flash).read_bytes()).hexdigest(), 'frames':frames}
    a.output.write_text(json.dumps(out,separators=(',',':'))+'\n');print(a.output)
if __name__=='__main__':main()
