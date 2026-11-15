#!/usr/bin/env python3
"""Record pickup flight after substituting a wave record in private flash.

Each specified pickup wave is used as the first wave of its own level. Ship
object and terrain hits are patched out, as in the schedule recorder; object
updates and pickup class handling remain firmware code.
"""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers
from spaceimpact_generate_terrain_contact import patch

SPECS=[(1,6),(1,14),(2,5),(3,5),(4,8),(5,4),(6,10),(6,13),(6,31),(7,13)]


def run(flash, level, wave):
    fw=SpaceImpactOracle(flash);m=fw.m;m.flash=bytearray(m.flash)
    patch(m,0x257c9a,0x2000+level-1);patch(m,0x259de2,0x2400);patch(m,0x259d72,0x2000);patch(m,0x259d74,0x46c0)
    desc=m.r32(0x10a2a4+4*(level-1));table=m.r32(desc+4)
    record=m.read_bytes(table+12*(wave-1),12)
    offset=table-m.base;m.flash[offset:offset+12]=record
    clock=FirmwareTimers(fw);frames=[];seen=False
    for tick in range(1,125):
        _,state=clock.next_main();pickup=[]
        for o in state['objects']:
            ex=0x109f0c+12*o['id'];cls=m.r8(ex+2)
            if cls in (17,33):
                pickup.append({'class':cls,'x':o['x'],'y':o['y'],'data':o['data'],
                               'vm':m.r8(ex+5),'speed':m.r8(ex+6)})
        if pickup:seen=True;frames.append({'tick':tick,'objects':pickup})
        elif seen:break
    if not seen: raise RuntimeError('pickup not spawned')
    return {'level':level,'wave':wave,'record':list(record),'frames':frames}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--flash',required=True)
    p.add_argument('--output',type=Path,default=Path(__file__).resolve().parent.parent/'web/tests/fixtures/spaceimpact-pickup-flight.json')
    a=p.parse_args();out={'firmware_sha256':hashlib.sha256(Path(a.flash).read_bytes()).hexdigest(),
                          'note':'pickup record substituted for first wave; ship contact patched',
                          'cases':[run(a.flash,*spec) for spec in SPECS]}
    a.output.write_text(json.dumps(out,separators=(',',':'))+'\n');print(a.output)
if __name__=='__main__':main()
