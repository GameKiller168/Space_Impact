#!/usr/bin/env python3
"""Extract all eight raw Space Impact level descriptors and wave-record tables.

The MCU startup record at 0x2f30cc copies eight big-endian pointers from ROM
0x2f30d4 to RAM 0x10a2a4. Each points to a 16-byte descriptor: byte 0 is the
record count, bytes 4..7 are the table pointer, and each table record is 12
bytes. Other bytes are preserved without interpreting them. Requires the user's
local Nokia 3310 v6.39 PPM B full flash; the firmware is not distributed.
"""
import argparse
import json
from pathlib import Path

BASE = 0x200000
POINTERS = 0x2f30d4
DESCRIPTORS = 0x312084
WAVES_START = 0x311820
WAVES_END = 0x312084


def extract(rom):
    def read(address, length):
        offset = address - BASE
        if offset < 0 or offset + length > len(rom):
            raise ValueError('Address outside ROM: 0x%x' % address)
        return rom[offset:offset + length]

    def word(data):
        return int.from_bytes(data, 'big')

    if len(rom) != 0x200000:
        raise ValueError('Expected a 2 MiB full flash image')
    record = read(0x2f30cc, 8)
    if word(record[:4]) != 32 or word(record[4:]) != 0x10a2a4:
        raise ValueError('Unexpected startup pointer-table record')
    pointers = read(POINTERS, 32)
    result = []
    next_wave = WAVES_START
    for i in range(8):
        address = word(pointers[4*i:4*i+4])
        if address != DESCRIPTORS + i*16:
            raise ValueError('Unexpected descriptor pointer for level %d' % (i+1))
        descriptor = read(address, 16)
        count = descriptor[0]
        table = word(descriptor[4:8])
        if not count or table != next_wave or table + count*12 > WAVES_END:
            raise ValueError('Unexpected wave table for level %d' % (i+1))
        records = [list(read(table + n*12, 12)) for n in range(count)]
        result.append({'descriptorAddress': '0x%08x' % address,
                       'descriptor': list(descriptor),
                       'waveTableAddress': '0x%08x' % table,
                       'waveRecords': records})
        next_wave = table + count*12
    if next_wave != WAVES_END:
        raise ValueError('Unexpected end of wave tables')
    return result


def render(levels):
    return '''/* Space Impact level descriptors and wave records from Nokia 3310 v6.39 PPM B.
 * Descriptor and record bytes remain in firmware order. Byte 0 of each descriptor
 * gives its record count; bytes 4..7 hold its table address. The other bytes
 * are retained even where their meaning is not established. The input flash
 * image is not included. firstLevel is retained for the initial-wave model.
 */
(function (root) {
  'use strict';
  var allLevels = ''' + json.dumps(levels, indent=2) + ''';
  var levels = { firstLevel: allLevels[0], allLevels: allLevels };
  root.SpaceImpactLevels = levels;
  if (typeof module === 'object' && module.exports) module.exports = levels;
})(typeof globalThis !== 'undefined' ? globalThis : this);
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--flash', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'web/js/spaceimpact-levels.js')
    args = parser.parse_args()
    levels = extract(args.flash.read_bytes())
    args.output.write_text(render(levels), encoding='utf-8')
    print('Extracted %d descriptors and %d records to %s' %
          (len(levels), sum(len(level['waveRecords']) for level in levels), args.output))

if __name__ == '__main__':
    main()
