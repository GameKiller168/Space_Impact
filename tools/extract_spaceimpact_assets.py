#!/usr/bin/env python3
"""Extract the Space Impact image-descriptor table from a Nokia 3310 v6.39 flash.

Usage: python3 tools/extract_spaceimpact_assets.py INPUT.fls web/js/spaceimpact-assets.js
The ROM is mapped at CPU 0x200000. Images are arranged as vertical 8-pixel
pages, with one byte per column and the least significant bit at the top.
The input firmware remains local; only pixel masks and their source addresses
are written to the JavaScript module.
"""
import argparse
import json
import pathlib

BASE = 0x200000
FIRST = 0x312dcc
END = 0x3131bc
STRIDE = 12


def extract(rom):
    def take(address, size):
        offset = address - BASE
        if offset < 0 or offset + size > len(rom):
            raise ValueError('address outside flash: 0x%x' % address)
        return rom[offset:offset + size]

    images = []
    for descriptor in range(FIRST, END, STRIDE):
        entry = take(descriptor, STRIDE)
        pointer = int.from_bytes(entry[:4], 'big')
        width, height = entry[8], entry[9]
        if not (0x311000 <= pointer < FIRST and entry[4:8] == b'\0'*4 and
                1 <= width <= 84 and 1 <= height <= 48 and entry[10:] == b'\0'*2):
            raise ValueError('unexpected descriptor at 0x%x' % descriptor)
        bitmap = take(pointer, width * ((height + 7) // 8))
        rows = [''.join('#' if bitmap[(y // 8) * width + x] & (1 << (y % 8)) else '.'
                        for x in range(width)) for y in range(height)]
        images.append({'descriptor': '0x%08x' % descriptor, 'data': '0x%08x' % pointer,
                       'width': width, 'height': height, 'rows': rows})
    return images


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('firmware', type=pathlib.Path)
    parser.add_argument('output', type=pathlib.Path)
    args = parser.parse_args()
    images = extract(args.firmware.read_bytes())
    payload = json.dumps(images, separators=(',', ':'))
    args.output.write_text('''/* Space Impact image descriptor table from Nokia 3310 v6.39 PPM B.
 * Each source byte represents a vertical 8-pixel page, least significant bit first.
 * The firmware image is not included. Descriptor ordering and duplicates are preserved.
 */
(function (root) {
  'use strict';
  var images = ''' + payload + ''';
  var assets = { images: images };
  root.SpaceImpactAssets = assets;
  if (typeof module === 'object' && module.exports) module.exports = assets;
})(typeof globalThis !== 'undefined' ? globalThis : this);
''', encoding='utf-8')
    print('Extracted %d descriptors to %s' % (len(images), args.output))

if __name__ == '__main__':
    main()
