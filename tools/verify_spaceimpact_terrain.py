#!/usr/bin/env python3
"""Compare the browser terrain compositor with the original firmware routine.

Example:
  python3 tools/verify_spaceimpact_terrain.py \
    --firmware /path/to/nokia-3310-v639-ppm-b.fls \
    --armemu /path/to/armemu.py

The ARM emulator is a local development dependency; the firmware remains local.
The routine at 0x2e6e98 is run at every scroll position for each level, first
sequentially with a reused output buffer, then in a shuffled order with that
buffer filled before every call. Optionally write the smaller test fixture with
--write-fixture PATH. Node.js is used to execute the browser implementation.
"""
import argparse
import importlib.util
import json
import pathlib
import random
import subprocess
import sys
import zlib

from extract_spaceimpact_terrain import MAPS, BANKS

PROJECT = pathlib.Path(__file__).resolve().parent.parent
FIXTURE_OFFSETS = (0, 1, 31, 32, 33, 84, 255, 480, 511, 512, 513)


def load_armemu(path):
    path = path / 'armemu.py' if path.is_dir() else path
    spec = importlib.util.spec_from_file_location('local_armemu', path)
    if spec is None or spec.loader is None:
        raise ValueError('Cannot load ARM emulator: %s' % path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def browser_crcs(node):
    js = r'''const t=require('./web/js/spaceimpact-terrain.js');
const crc=require('./web/tests/support/crc32.js').crc32;
const output=[];
for (let level=1;level<=8;level++) {
  let row=[];
  for (let scroll=0;scroll<514;scroll++) row.push(crc(t.renderBytes(level,scroll)));
  output.push(row);
}
process.stdout.write(JSON.stringify(output));'''
    return json.loads(subprocess.check_output([node, '-e', js], cwd=PROJECT, text=True))


def machine(armemu, flash, mapping, tiles):
    mem = armemu.Mem(flash)
    cpu = armemu.CPU(mem)
    state, buffer, bank = 0xf10000, 0xf20000, 0xf30000
    mem.w8(state, 16)
    mem.w8(state + 1, 2)
    mem.w32(state + 4, mapping)
    mem.w32(state + 12, buffer)
    mem.w16(state + 16, 1)
    mem.w32(state + 32, bank)
    for i, address in enumerate(tiles):
        mem.w32(bank + 4 * i, address)
    cpu.hooks[0x2dd748] = lambda _cpu: None
    return mem, cpu, state, buffer


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--firmware', type=pathlib.Path, required=True, help='Path to the local v6.39 PPM B .fls dump')
    parser.add_argument('--armemu', type=pathlib.Path, required=True, help='Path to armemu.py or its containing directory')
    parser.add_argument('--node', default='node', help='Node.js executable (default: node)')
    parser.add_argument('--write-fixture', type=pathlib.Path, help='Optionally write the compact 88-case oracle fixture')
    args = parser.parse_args()
    flash = args.firmware.read_bytes()
    if len(flash) != 0x200000:
        raise ValueError('Expected a 2 MiB .fls dump mapped at 0x200000')
    armemu = load_armemu(args.armemu)
    expected = browser_crcs(args.node)
    fixture = []

    for mode in ('sequential', 'shuffled'):
        count = 0
        for i, (mapping, tiles) in enumerate(zip(MAPS, BANKS)):
            mem, cpu, state, buffer = machine(armemu, flash, mapping, tiles)
            offsets = list(range(512))
            if mode == 'shuffled':
                random.Random(7548 + i).shuffle(offsets)
            for offset in offsets:
                if mode == 'shuffled':
                    mem.write_bytes(buffer, bytes([0xa5]) * 168)
                cpu.call(0x2e6e98, [state, offset], max_steps=1_000_000)
                actual = zlib.crc32(mem.read_bytes(buffer, 168)) & 0xffffffff
                if actual != expected[i][offset]:
                    raise AssertionError('%s: level %d, scroll %d: firmware %08x, browser %08x' %
                                         (mode, i + 1, offset, actual, expected[i][offset]))
                if mode == 'sequential' and offset in FIXTURE_OFFSETS:
                    fixture.append({'level': i + 1, 'scroll': offset, 'crc32': '%08x' % actual})
                count += 1
            if mode == 'sequential':
                for offset in (512, 513):
                    cpu.call(0x2e6e98, [state, offset], max_steps=1_000_000)
                    actual = zlib.crc32(mem.read_bytes(buffer, 168)) & 0xffffffff
                    if actual != expected[i][offset]:
                        raise AssertionError('level %d, scroll %d differs' % (i + 1, offset))
                    fixture.append({'level': i + 1, 'scroll': offset, 'crc32': '%08x' % actual})
        print('%s: %d/4096 firmware cases matched' % (mode, count), flush=True)

    if args.write_fixture:
        fixture.sort(key=lambda entry: (entry['level'], entry['scroll']))
        result = {'source': 'Nokia 3310 v6.39 PPM B, 0x2e6e98', 'entries': fixture}
        args.write_fixture.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print('Wrote %d firmware cases to %s' % (len(fixture), args.write_fixture))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, AssertionError, subprocess.CalledProcessError) as exc:
        print('Terrain verification failed: %s' % exc, file=sys.stderr)
        sys.exit(1)
