#!/usr/bin/env python3
"""Capture the firmware pickup reward routine with controlled RNG outcomes.

Runs the real 0x2592b0 against initialized game state. Only the random-number
routine is replaced, so each branch, including reroll at the life cap, can be
recorded independently and deterministically.
"""
import argparse
import hashlib
import json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, RECORD

CASES = [(17, lives, weapon, ammo, random) for lives, weapon, ammo, random in [
    (3, 10, 3, [0]), (5, 10, 3, [0, 0, 1]), (3, 10, 3, [1]),
    (3, 9, 8, [1]), (3, 9, 8, [2]), (3, 10, 8, [2]),
    (3, 22, 8, [3]), (3, 10, 8, [3]), (3, 10, 126, [1])]] + [
    (33, 3, weapon, ammo, []) for weapon, ammo in [(10, 3), (9, 8), (22, 1), (10, 127)]]


def run(flash, spec):
    cls, lives, weapon, ammo, values = spec
    fw = SpaceImpactOracle(flash)
    FirmwareTimers(fw).next_main()
    m = fw.m
    m.w8(0x10a203, lives); m.w8(0x10a205, weapon); m.w8(0x10a206, ammo)
    calls = []
    def random(cpu):
        if len(calls) >= len(values): raise RuntimeError('unexpected random call')
        cpu.r[0] = values[len(calls)]; calls.append(cpu.r[0])
    fw.c.hooks[0x2dd7d0] = random
    fw.c.call(0x2592b0, [cls, 1, RECORD])
    byte = m.r8(0x10a206)
    return {'class': cls, 'before': {'lives': lives, 'type': weapon, 'ammo': ammo}, 'random': values,
            'after': {'lives': m.r8(0x10a203), 'type': m.r8(0x10a205), 'ammo': byte if byte < 128 else byte - 256},
            'event': m.r16(RECORD + 20), 'random_calls': calls}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--flash', required=True)
    p.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-pickups.json')
    args = p.parse_args()
    fw = SpaceImpactOracle(args.flash)
    m = fw.m
    entry = 0x321e6c + 8 * 31
    ptr = m.r32(entry)
    note = m.r8(ptr + 2)
    sound = {'event': 31, 'entry': '0x%06x' % entry, 'address': '0x%06x' % ptr,
             'segments': [[m.r16(0x32afd0 + 2 * (note - 0x40)), m.r8(ptr + 3)]]}
    data = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(), 'routine': '0x2592b0',
            'sound': sound, 'cases': [run(args.flash, case) for case in CASES]}
    args.output.write_text(json.dumps(data, separators=(',', ':')) + '\n')
    print(args.output)


if __name__ == '__main__': main()
