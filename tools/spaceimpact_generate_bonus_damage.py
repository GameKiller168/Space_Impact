#!/usr/bin/env python3
"""Record bonus damage against a stationary, isolated class-5 target."""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers


def run(flash, typ):
    fw = SpaceImpactOracle(flash); clock = FirmwareTimers(fw)
    clock.next_main(); clock.next_main(); m = fw.m
    m.w8(0x10a1ef, 255); m.w8(0x10a205, typ); m.w8(0x10a206, 3)
    fw.message(13)
    target = fw.c.call(0x25793a, [5, 2, 30, 23]); extra = 0x109f0c + 12 * target
    m.w8(extra + 3, 20); m.w8(extra + 6, 0)
    frames = []
    for tick in range(1, 13):
        _, result = clock.next_main()
        shots = []
        for o in result['objects']:
            cls = m.r8(0x109f0e + 12 * o['id'])
            if cls == typ: shots.append([o['x'], o['y']])
        frames.append({'tick':tick, 'hp':m.r8(extra+3), 'class':m.r8(extra+2),
                       'score':m.r32(0x10a1fc), 'shots':shots})
    return {'type':typ, 'target':{'class':5,'x':30,'y':23,'hp':20}, 'frames':frames}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--flash',required=True)
    p.add_argument('--output',type=Path,default=Path(__file__).resolve().parent.parent/'web/tests/fixtures/spaceimpact-bonus-damage.json')
    a=p.parse_args();d={'firmware_sha256':hashlib.sha256(Path(a.flash).read_bytes()).hexdigest(),
                       'cases':[run(a.flash,typ) for typ in (9,10,22)]}
    a.output.write_text(json.dumps(d,separators=(',',':'))+'\n');print(a.output)
if __name__=='__main__':main()
