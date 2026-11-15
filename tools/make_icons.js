#!/usr/bin/env node
'use strict';

// Draw the extracted firmware sprites directly; do not resize the result, so
// each source pixel remains an integer-sized block in every output image.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const images = require('../web/js/spaceimpact-assets.js').images;

const BACKGROUND = [0xa2, 0xad, 0x8a, 0xff];
const INK = [0x22, 0x2a, 0x1c, 0xff];
const TRANSPARENT = [0, 0, 0, 0];
const SCENE_WIDTH = 31;
const SCENE_HEIGHT = 23;
const outputDir = path.join(__dirname, '..', 'web', 'icons');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(size, pixels, height) {
  height = height || size;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8-bit RGBA
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (1 + size * 4));
  for (let y = 0; y < height; y++) {
    // A zero filter byte precedes each row.
    pixels.copy(scanlines, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function makeIcon(size, maskable, rounded) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.12);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - (x + 0.5), 0, x + 0.5 - (size - radius));
      const dy = Math.max(radius - (y + 0.5), 0, y + 0.5 - (size - radius));
      const color = rounded && dx * dx + dy * dy > radius * radius ? TRANSPARENT : BACKGROUND;
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) pixels[offset + c] = color[c];
    }
  }

  // The maskable artwork fits inside the centered circle of radius 40% of
  // the icon size, including the corners of its bounding box.
  let scale = Math.floor(size * (maskable ? 0.78 : 0.88) / SCENE_WIDTH);
  if (maskable) {
    while (Math.hypot(SCENE_WIDTH * scale / 2, SCENE_HEIGHT * scale / 2) > size * 0.4) scale--;
  }
  const left = Math.floor((size - SCENE_WIDTH * scale) / 2);
  const top = Math.floor((size - SCENE_HEIGHT * scale) / 2);

  // negative pictures (the level 1 boss) have their figure in the clear bits
  function draw(bitmap, atX, atY, negative) {
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        if (bitmap.rows[y][x] !== (negative ? '.' : '#')) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const offset = ((top + (atY + y) * scale + dy) * size + left + (atX + x) * scale + dx) * 4;
            for (let c = 0; c < 4; c++) pixels[offset + c] = INK[c];
          }
        }
      }
    }
  }

  // images[1] is the 10x7 ship (images[0] is the same ship stored as a negative); images[17] is the 2x1 main shot; images[27] is the
  // 20x23 boss of level 1, stored as a negative, so its figure is the clear bits. All from the extracted descriptor table.
  draw(images[27], 11, 0, true);
  draw(images[1], 0, 8);
  draw(images[17], 11, 11);
  draw(images[17], 15, 11);
  return png(size, pixels);
}

// 1200x630 link-preview card: the LCD-green screen with the title in a 5x7 pixel font and the
// firmware sprites below it. Every pixel of the picture is an integer-sized block.
const GLYPHS = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  ' ': ['..', '..', '..', '..', '..', '..', '..']
};

function makeCard() {
  const width = 1200;
  const height = 630;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(BACKGROUND, i * 4);

  function block(x, y, scale) {
    for (let dy = 0; dy < scale; dy++) {
      const row = ((y + dy) * width + x) * 4;
      for (let dx = 0; dx < scale; dx++) pixels.set(INK, row + dx * 4);
    }
  }
  function text(string, scale, y) {
    const cols = string.split('').map(function (c) { return GLYPHS[c][0].length; });
    const total = cols.reduce(function (a, b) { return a + b + 1; }, -1);
    let x = Math.floor((width - total * scale) / 2);
    string.split('').forEach(function (c, n) {
      GLYPHS[c].forEach(function (row, ry) {
        for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') block(x + rx * scale, y + ry * scale, scale);
      });
      x += (cols[n] + 1) * scale;
    });
  }
  function sprite(bitmap, atX, atY, scale, negative) {
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        if (bitmap.rows[y][x] === (negative ? '.' : '#')) block(atX + x * scale, atY + y * scale, scale);
      }
    }
  }

  // double-line pixel frame like the LCD bezel
  for (let x = 24; x < width - 24; x += 12) { block(x, 24, 6); block(x, height - 30, 6); }
  for (let y = 24; y < height - 24; y += 12) { block(24, y, 6); block(width - 30, y, 6); }

  text('SPACE IMPACT', 14, 62);
  const scale = 13;
  const left = Math.floor((width - SCENE_WIDTH * scale) / 2);
  const top = 200;
  sprite(images[27], left + 11 * scale, top, scale, true);
  sprite(images[1], left, top + 8 * scale, scale);
  sprite(images[17], left + 11 * scale, top + 11 * scale, scale);
  sprite(images[17], left + 15 * scale, top + 11 * scale, scale);
  text('NOKIA 3310', 6, 534);
  return png(width, pixels, height);
}

fs.writeFileSync(path.join(outputDir, 'og-image.png'), makeCard());
console.log('Wrote og-image.png');

fs.mkdirSync(outputDir, { recursive: true });
[
  ['icon-192.png', 192, false, true],
  ['icon-512.png', 512, false, true],
  ['maskable-192.png', 192, true, false],
  ['maskable-512.png', 512, true, false],
  ['apple-touch-icon.png', 180, false, false]
].forEach(function (icon) {
  fs.writeFileSync(path.join(outputDir, icon[0]), makeIcon(icon[1], icon[2], icon[3]));
  console.log('Wrote ' + icon[0]);
});
