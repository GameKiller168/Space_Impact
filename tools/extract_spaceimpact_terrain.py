#!/usr/bin/env python3
"""Extract 32-column terrain maps and banks; see 0x257b48 and 0x2e6e98."""
import argparse,json,pathlib
BASE=0x200000
MAPS=[0x311740,0x311780,0x311760,0x311760,0x3117a0,0x3117c0,0x3117e0,0x311800]
BANKS=[[0x312760,0x312780,0x3127a0],
       [0x3127e4,0x312804,0x312824,0x312844],
       [0x3124b8,0x3124d8,0x3124f8,0x312518],
       [0x3126b8,0x3126d8,0x3126f8,0x312718],
       [0x312254,0x312274,0x312294,0x3122b4],
       [0x312254,0x312274,0x312294,0x3122b4],
       [0x312864,0x312884,0x3128a4,0x3128c4,0x3128e4,0x312904],
       [0x3128a4,0x312984,0x312924,0x312944,0x312964]]
def extract(rom):
 def take(addr):
  pos=addr-BASE
  if pos<0 or pos+32>len(rom):raise ValueError('Out of range: %x'%addr)
  return list(rom[pos:pos+32])
 out=[]
 for addr,bank in zip(MAPS,BANKS):
  mapping=take(addr)
  if max(mapping)>len(bank):raise ValueError('Unexpected terrain tile index at %x'%addr)
  out.append({'mapAddress':'0x%08x'%addr,'map':mapping,'tiles':[{'address':'0x%08x'%p,'columns':take(p)} for p in bank]})
 return out
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('firmware',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);a=p.parse_args()
 levels=extract(a.firmware.read_bytes()); payload=json.dumps(levels,separators=(',',':'))
 a.output.write_text('''/* Space Impact terrain from Nokia 3310 v6.39 PPM B.
 * The 16×2 tile map and 32-byte tile banks follow firmware 0x257b48 and 0x2e6e98.
 * This is the terrain layer only, before sprites and UI are composed.
 */
(function (root) {
  'use strict';
  var levels = '''+payload+''';
  function renderBytes(level, scroll) {
    if (!Number.isInteger(level) || level < 1 || level > levels.length ||
        !Number.isInteger(scroll) || scroll < 0) throw new RangeError('Invalid terrain level or scroll');
    var data = levels[level - 1], result = new Uint8Array(84 * 2);
    for (var page = 0; page < 2; page++) {
      for (var x = 0; x < 84; x++) {
        var position = (scroll + x) % 512;
        var index = Math.floor(position / 32);
        var tile = data.map[page * 16 + index];
        // The firmware retains the preceding nonempty tile for the first byte at a boundary.
        if (x > 0 && position % 32 === 0) {
          var previous = data.map[page * 16 + ((index + 15) % 16)];
          if (previous) tile = previous;
        }
        if (tile) result[page * 84 + x] = data.tiles[tile - 1].columns[position % 32];
      }
    }
    return result;
  }
  // 0x257798 selects the upper terrain for zero-based levels 4 and 5.
  // 0x2e7002 places all other two-page terrain layers at LCD row 32.
  function originY(level) {
    if (!Number.isInteger(level) || level < 1 || level > levels.length) throw new RangeError('Invalid terrain level');
    return level === 5 || level === 6 ? 0 : 32;
  }
  function render(level, scroll) {
    var bytes = renderBytes(level, scroll), rows = [];
    for (var y = 0; y < 16; y++) {
      var row = '';
      for (var x = 0; x < 84; x++) row += (bytes[Math.floor(y / 8) * 84 + x] & (1 << (y % 8))) ? '#' : '.';
      rows.push(row);
    }
    return { width: 84, height: 16, rows: rows };
  }
  var terrain = { levels: levels, renderBytes: renderBytes, render: render, originY: originY };
  root.SpaceImpactTerrain = terrain;
  if (typeof module === 'object' && module.exports) module.exports = terrain;
})(typeof globalThis !== 'undefined' ? globalThis : this);
''',encoding='utf-8')
 print('Extracted',len(levels),'terrain maps')
