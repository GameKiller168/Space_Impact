#!/usr/bin/env python3
"""Record the damage to ordinary objects in an unshielded ship collision."""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, RECORD


def run(flash, hp):
    fw=SpaceImpactOracle(flash);m=fw.m;FirmwareTimers(fw).next_main()
    shield=m.r16(0x10a20a);fw.c.call(0x258cac,[shield]);m.w16(0x10a20a,0)
    oid=fw.c.call(0x25793a,[5,2,8,20]);extra=0x109f0c+12*oid;m.w8(extra+3,hp)
    fw.c.call(0x259d30,[RECORD])
    return {'before_hp':hp,'after_hp':m.r8(extra+3),'after_class':m.r8(extra+2),
            'hit':m.r8(0x10a200),'score':m.r32(0x10a1fc),'event':m.r16(RECORD+20)}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--flash',required=True)
    p.add_argument('--output',type=Path,default=Path(__file__).resolve().parent.parent/'web/tests/fixtures/spaceimpact-ship-damage.json')
    a=p.parse_args();data={'firmware_sha256':hashlib.sha256(Path(a.flash).read_bytes()).hexdigest(), 'cases':[run(a.flash,hp) for hp in (1,5)]}
    a.output.write_text(json.dumps(data,separators=(',',':'))+'\n');print(a.output)
if __name__=='__main__':main()
