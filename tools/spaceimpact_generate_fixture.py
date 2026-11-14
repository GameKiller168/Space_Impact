#!/usr/bin/env python3
"""Generate the checked-in movement fixture by executing the local v6.39 firmware oracle."""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, DISPLAY

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--flash', required=True)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-movement.json')
args=parser.parse_args()

CASES = [
 ('up',[(17,1)]),('down',[(9,1)]),('right',[(20,1)]),('left',[(22,1)]),
 ('up_repeat',[(145,1)]),('down_repeat',[(137,1)]),('right_repeat',[(148,1)]),('left_repeat',[(150,1)]),
 ('top_limit',[(17,100)]),('bottom_limit',[(9,100)]),('right_limit',[(20,100)]),('left_limit',[(22,100)]),
 ('top_repeated_step_at_seven',[(17,13),(145,1)]),
 ('bottom_repeated_step_at_forty',[(9,20),(137,1)]),
 ('right_repeated_step_at_72',[(20,67),(148,1)]),
 ('left_repeated_step_at_two',[(22,3),(150,1)]),
 ('diagonal_sequence',[(17,4),(20,6),(9,2),(22,3)]),
]

def position(fw):
    ship_id = fw.m.r16(0x10a1dc + 44)
    obj = fw.m.r32(DISPLAY + 4) + ship_id * 28
    return [fw.m.r8(obj + 4), fw.m.r8(obj + 5)]

out={'firmware_sha256':hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
     'handler':'0x25a52a','startup_message':36,'initial_ship_position':[5,20],
     'cases':[]}
for name, sequence in CASES:
    fw=SpaceImpactOracle(args.flash); fw.message(36)
    for msg,count in sequence:
        for _ in range(count): fw.message(msg)
    out['cases'].append({'name':name,'sequence':[{'message':msg,'count':count} for msg,count in sequence],
                         'ship_position':position(fw)})
args.output.write_text(json.dumps(out,indent=2)+'\n')
print(args.output)
