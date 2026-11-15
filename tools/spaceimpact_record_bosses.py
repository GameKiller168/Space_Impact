#!/usr/bin/env python3
"""Record Space Impact boss fights and level endings from the supplied firmware.

The ship is protected by private flash patches (see spaceimpact_record_schedule.py).
It waits without firing for a configurable number of ticks after each boss appears,
then aims and fires until the level changes. The firmware itself, its random
generator, object updates, attacks and collision code remain in use.
"""
import argparse
import hashlib
import json
from pathlib import Path

from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers, RECORD
from spaceimpact_record_schedule import PATCHES, BOSS_CLASSES, EXTRA, SHIP_ID, LEVEL


def record(flash, observe, last_tick, seed):
    fw = SpaceImpactOracle(flash, seed)
    m = fw.m
    m.flash = bytearray(m.flash)
    for address, halfword in PATCHES:
        offset = address - m.base
        m.flash[offset:offset + 2] = bytes((halfword >> 8, halfword & 255))
    clock = FirmwareTimers(fw)
    draws = []

    def calls(cpu, target, caller):
        # The ROM obtains a random value at 0x2dd7d0 and reduces it using the
        # modulo helper at 0x2f0998. Preserve the arguments, result and call
        # site: some calls to that helper are not random draws.
        if target == 0x2f0998:
            a, n = cpu.r[0], cpu.r[1]
            draws.append([caller, a, n, a % n if n else 0])

    clock.next_main()
    traces = []
    trace = None
    for tick in range(2, last_tick + 1):
        draws.clear()
        fw.c.callhook = calls if trace is not None else None
        try:
            now, state = clock.next_main()
        except RuntimeError:
            break
        level = m.r8(LEVEL)
        objects = []
        for obj in state['objects']:
            extra = list(m.read_bytes(EXTRA + 12 * obj['id'], 12))
            objects.append({'id': obj['id'], 'class': extra[2], 'x': obj['x'], 'y': obj['y'],
                            'width': obj['width'], 'height': obj['height'], 'data': obj['data'],
                            'flags': obj['flags'], 'extra': extra})
        boss = next((o for o in objects if o['class'] in BOSS_CLASSES), None)
        if trace is None and boss:
            trace = {'level': level + 1, 'spawn_tick': tick, 'ticks': []}
            traces.append(trace)
        if trace is not None:
            trace['ticks'].append({'tick': tick, 'ms': now, 'return': state['return'],
                                   'delay': state['delay'], 'timer': state['timer'], 'event': state['event'],
                                   'level': level + 1, 'phase': state['phase'],
                                   'boss_state': m.r8(0x109f0b), 'scroll': m.r16(0x10a1f2),
                                   'waves_left': m.r8(0x10a1ee), 'lives': m.r8(0x10a203),
                                   'score_byte': m.r8(0x10a1ff), 'score': m.r32(RECORD + 16),
                                   'ship_id': m.r16(SHIP_ID), 'objects': objects,
                                   'modulo': list(draws)})
            if level + 1 != trace['level'] or clock.ended:
                print('level %d: %d recorded ticks, ended=%s' % (trace['level'], len(trace['ticks']), clock.ended), flush=True)
                trace = None
        if clock.ended:
            break
        ship = next((o for o in objects if o['id'] == m.r16(SHIP_ID)), None)
        if boss and ship and trace and len(trace['ticks']) > observe and boss['x'] < 84:
            want = boss['y'] + boss['height'] // 2 - 6
            if want != ship['y']:
                fw.message(17 if want < ship['y'] else 9)
            fw.message(10)
    return traces, clock.ended


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--flash', required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-bosses.json')
    parser.add_argument('--observe', type=int, default=160)
    parser.add_argument('--last-tick', type=int, default=12000)
    parser.add_argument('--seed', type=lambda value: int(value, 0), default=0x1234)
    args = parser.parse_args()
    traces, ended = record(args.flash, args.observe, args.last_tick, args.seed)
    if len(traces) != 8 or not ended:
        raise RuntimeError('recording incomplete: %d bosses, game ended: %s' % (len(traces), ended))
    out = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
           'handler': '0x25a52a', 'seed': args.seed, 'observation_ticks': args.observe,
           'timer_order': 'secondary before main when both are due (phone ordering unverified)', 'levels': traces}
    args.output.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(args.output)


if __name__ == '__main__':
    main()
