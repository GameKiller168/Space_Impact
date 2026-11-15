#!/usr/bin/env python3
"""Capture ship-contact inputs and the firmware's verdict, one life at a time.

The player contact routine (entry 0x259d30, called once per tick) decides whether
the ship is hit, and a hit rewrites the ship and the other object. So the inputs
are captured when the routine is entered, before it changes anything. For each
scenario this tool runs the original handler and records, on every tick where
some other display object lies within a small margin of the ship's box:
  - the ship record, the collision mode byte (0x10a1ed) and the guard word
    (0x10a20a) that the routine checks before it tests anything,
  - the nearby objects, each with its position `order` in the display list, its
    class byte (table at 0x109f0e, 12 bytes per object), box and image pointer;
    bitmaps outside the flash (the terrain composite) are stored as vertical
    8-pixel pages when the entry follows the ship's. The firmware's search starts
    at the entry after the ship's, so the ship's own `order` is stored as well,
  - whether the player-hit flag (0x10a200) became set during that tick.
Ticks without a nearby object cannot produce contact and are not stored. Each
scenario stops after its requested number of hits or at its tick limit. Requires a local flash image; it is not stored.
"""
import argparse, hashlib, json
from pathlib import Path
from spaceimpact_oracle import SpaceImpactOracle, FirmwareTimers

CONTACT_ENTRY = 0x259d30
CLASS_TABLE, HIT_FLAG, SHIP_ID, MODE, GUARD = 0x109f0e, 0x10a200, 0x10a208, 0x10a1ed, 0x10a20a
MARGIN = 2
INPUT_RETURNS = (1, 27)  # 27 only asks the phone to play a sound; no timer changes
ROM_START, ROM_END = 0x200000, 0x400000

# (name, messages after the first tick, tick limit, hits to record, {tick: messages sent after that tick})
SCENARIOS = [
    ('unsteered', [], 320, 2, {}),
    ('up_1', [17], 200, 1, {}), ('up_3', [17] * 3, 200, 1, {}), ('up_10', [17] * 10, 200, 1, {}),
    ('down_1', [9], 200, 1, {}), ('down_3', [9] * 3, 200, 1, {}), ('down_5', [9] * 5, 200, 1, {}),
    ('right_5', [20] * 5, 320, 2, {}), ('right_10', [20] * 10, 200, 1, {}), ('left_3', [22] * 3, 200, 1, {}),
    ('down_8', [9] * 8, 200, 1, {}), ('down_12', [9] * 12, 200, 1, {}), ('down_20', [9] * 20, 200, 1, {}),
    ('fire_once', [10], 200, 1, {}), ('fire_bonus_key', [12], 200, 1, {}),
    ('fire_stream', [10], 200, 1, dict((t, [10]) for t in range(4, 60, 4))),
]


def capture(fw):
    """The ship, the objects near it, the mode and the guard word, as the contact routine sees them."""
    m = fw.m
    state = fw.snapshot()
    sid = m.r16(SHIP_ID)
    ship = next((o for o in state['objects'] if o['id'] == sid), None)
    if ship is None:
        raise RuntimeError('ship object missing')
    near = []
    order = {obj['id']: index for index, obj in enumerate(state['objects'])}
    for obj in state['objects']:
        if obj['id'] == sid:
            continue
        if (ship['x'] <= obj['x'] + obj['width'] + MARGIN and obj['x'] <= ship['x'] + ship['width'] + MARGIN and
                ship['y'] <= obj['y'] + obj['height'] + MARGIN and obj['y'] <= ship['y'] + ship['height'] + MARGIN):
            item = {'id': obj['id'], 'order': order[obj['id']], 'class': m.r8(CLASS_TABLE + 12 * obj['id']), 'x': obj['x'], 'y': obj['y'],
                    'width': obj['width'], 'height': obj['height'], 'data': obj['data']}
            pointer = int(obj['data'], 16)
            # Only entries after the ship's can be found by the search, so only those need their bitmap.
            if not ROM_START <= pointer < ROM_END and order[obj['id']] > order[sid]:
                item['pages'] = m.read_bytes(pointer, obj['width'] * ((obj['height'] + 7) // 8)).hex()
            near.append(item)
    return {'mode': m.r8(MODE), 'guard': m.r16(GUARD),
            'ship': dict({k: ship[k] for k in ('x', 'y', 'width', 'height', 'data')}, order=order[sid]), 'objects': near}


def run(flash, name, inputs, limit, lives, later):
    fw = SpaceImpactOracle(flash)
    clock = FirmwareTimers(fw)
    clock.next_main()
    for msg in inputs:
        if fw.message(msg)['return'] not in INPUT_RETURNS:
            raise RuntimeError('unmodeled input result in ' + name)
    m = fw.m
    entered = []
    def on_call(cpu, target, from_pc):
        if (target & ~1) == CONTACT_ENTRY:
            entered.append(capture(fw))
    fw.c.callhook = on_call
    ticks, hit_ticks, previous_hit, tick = [], [], 0, 1
    for tick in range(2, limit + 1):
        del entered[:]
        try:
            clock.next_main()
        except RuntimeError:
            break  # the game ended
        hit = m.r8(HIT_FLAG)
        newly = 1 if hit and not previous_hit else 0
        if not hit or newly:
            # While the ship is exploding the routine's other gates apply, which are not modeled; those ticks are skipped.
            if len(entered) > 1 or (newly and not entered):
                raise RuntimeError('unexpected contact-routine calls at tick %d in %s: %d' % (tick, name, len(entered)))
            # The handler does not run the routine on every tick (for example not on the tick that restarts the timers
            # after a life is lost); such ticks carry no verdict.
            if entered and (entered[0]['objects'] or newly):
                ticks.append(dict({'tick': tick, 'hit': newly}, **entered[0]))
        previous_hit = hit
        if newly:
            hit_ticks.append(tick)
            if len(hit_ticks) >= lives:
                break
        for msg in later.get(tick, []):
            if fw.message(msg)['return'] not in INPUT_RETURNS:
                raise RuntimeError('unmodeled input result in ' + name)
    return {'name': name, 'inputs_after_first_tick': inputs, 'later_inputs': dict((str(k), v) for k, v in later.items()),
            'last_tick': tick, 'hit_ticks': hit_ticks, 'ticks': ticks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--flash', required=True)
    parser.add_argument('--output', type=Path,
                        default=Path(__file__).resolve().parent.parent / 'web/tests/fixtures/spaceimpact-contact.json')
    args = parser.parse_args()
    result = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(),
              'handler': '0x25a52a', 'contact_routine': '0x259d30', 'class_table': '0x109f0e',
              'margin': MARGIN,
              'coincident_timers': 'secondary message 0 before main message 1 (ordering unverified)',
              'scenarios': [run(args.flash, *scenario) for scenario in SCENARIOS]}
    args.output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(args.output)
    for s in result['scenarios']:
        print('%-14s hit_ticks=%s last_tick=%d stored_ticks=%d' % (s['name'], s['hit_ticks'], s['last_tick'], len(s['ticks'])))


if __name__ == '__main__':
    main()
