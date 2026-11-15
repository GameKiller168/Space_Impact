#!/usr/bin/env python3
"""Exercise ship object-contact modes and gates in the actual firmware routine.

Each fresh initialized level gets one stationary object inserted after the ship.
Terrain calls are disabled in the private flash copy to isolate object contact.
"""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, DISPLAY, RECORD
from spaceimpact_generate_terrain_contact import patch


def run(flash, level, cls, x, y, guard, phase):
    fw = SpaceImpactOracle(flash); m = fw.m; m.flash = bytearray(m.flash)
    patch(m, 0x257c9a, 0x2000 + level - 1)
    patch(m, 0x259d72, 0x2000); patch(m, 0x259d74, 0x46c0)
    FirmwareTimers(fw).next_main()
    m.w16(0x10a20a, guard); m.w8(0x10a1f0, phase)
    sid = m.r16(0x10a208)
    oid = fw.c.call(0x25793a, [cls, m.r8(0x10a1ed), x, y])
    def obj(id):
        a = m.r32(DISPLAY + 4) + id * 28
        return {'x': m.r8(a+4), 'y': m.r8(a+5), 'width': m.r8(a+20), 'height': m.r8(a+21), 'data': '0x%08x' % m.r32(a+12)}
    ship, other = obj(sid), dict(obj(oid), **{'class': cls})
    mode = m.r8(0x10a1ed); picked = []
    def call(cpu, target, origin):
        if target & ~1 == 0x2592b0 and cpu.r[0] in (17, 33) and 0x259eaa <= origin <= 0x259eb2: picked.append(cpu.r[0])
    fw.c.callhook = call
    fw.c.call(0x259d30, [RECORD])
    return {'level':level, 'ship':ship, 'object':other, 'mode':mode, 'guard':guard, 'phase':phase,
            'outcome':'hit' if m.r8(0x10a200) else ('pickup' if picked else 'none')}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--flash',required=True)
    p.add_argument('--output',type=Path,default=Path(__file__).resolve().parent.parent/'web/tests/fixtures/spaceimpact-contact-modes.json')
    args=p.parse_args()
    specs=[(level,5,x,y,0,10) for level in (1,3,5) for x in (9,11,13,15,17,19,21) for y in (18,20,23)]
    specs += [(level,cls,8,20,guard,phase) for level in (1,3,5) for cls in (4,5,17,33) for guard,phase in ((0,10),(1,10),(0,30))]
    data={'firmware_sha256':hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(), 'routine':'0x259d30',
          'note':'terrain call patched out; isolated objects inserted after ship', 'cases':[run(args.flash,*spec) for spec in specs]}
    args.output.write_text(json.dumps(data,separators=(',',':'))+'\n');print(args.output)
if __name__=='__main__':main()
