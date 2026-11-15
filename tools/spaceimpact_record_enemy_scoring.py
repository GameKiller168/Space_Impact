#!/usr/bin/env python3
"""Capture firmware score limits and an ordinary-enemy explosion sequence.

Usage: python3 tools/spaceimpact_record_enemy_scoring.py --flash <firmware> [--output FILE]
"""
import argparse
import hashlib
import json
from pathlib import Path
from spaceimpact_oracle import RECORD
from spaceimpact_record_enemies import EXTRA, new_case


def score_vectors(flash):
    f, _ = new_case(flash, 0, 8)
    m = f.m
    rows = []
    for score in (0, 95, 995, 4995, 9995, 31485, 31489, 31490, 31494, 31495, 31499, 31500):
        for inc in (5, 10):
            m.w32(0x10a1fc, score)
            m.w8(0x10a203, 3)
            f.c.call(0x2592b0, [0x31, inc, RECORD])
            rows.append([score, inc, m.r32(0x10a1fc), m.r8(0x10a203)])
    return rows


def explosion(flash):
    f, clock = new_case(flash, 0, 6)
    m = f.m
    desc = m.r32(0x10a2a4)
    address = m.r32(desc + 4)
    m.w8(0x10a1e0, 1); m.w32(0x10a1e4, address)
    m.w8(0x10a1ee, 1); m.w8(0x10a1ef, 0)
    ident, sequence = None, []
    for tick in range(160):
        f.message(10)
        _, state = clock.next_main()
        m.w8(0x10a1ef, 255)
        if ident is None:
            for o in state['objects']:
                if m.r8(EXTRA + 12 * o['id'] + 2) == 2:
                    ident = o['id']
                    break
        if ident is not None:
            obj = next((o for o in state['objects'] if o['id'] == ident), None)
            if obj is None:
                sequence.append(None)
                break
            e = EXTRA + 12 * ident
            sequence.append([m.r8(e + 2), m.r8(e + 1), obj['data'], obj['x'], obj['y']])
    if not sequence or sequence[-1] is not None:
        raise RuntimeError('explosion was not captured to removal')
    return sequence


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--flash', required=True)
    p.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-enemy-scoring.json')
    args = p.parse_args()
    out = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
           'score_routine': '0x2592b0', 'score_vectors': score_vectors(args.flash), 'explosion': explosion(args.flash)}
    args.output.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(args.output)


if __name__ == '__main__':
    main()
