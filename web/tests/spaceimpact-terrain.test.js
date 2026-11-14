'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const terrain = require('../js/spaceimpact-terrain.js');
const oracle = require('./fixtures/spaceimpact-terrain.json');
const { crc32 } = require('./support/crc32.js');

test('terrain compositor matches the firmware across eight levels and scrolling boundaries', () => {
  assert.equal(oracle.entries.length, 88);
  for (const entry of oracle.entries) {
    const actual = crc32(terrain.renderBytes(entry.level, entry.scroll)).toString(16).padStart(8, '0');
    assert.equal(actual, entry.crc32, `level ${entry.level}, scroll ${entry.scroll}`);
  }
});

test('first level terrain is empty and the map repeats after 512 columns', () => {
  assert.ok(terrain.renderBytes(1, 0).every((v) => v === 0));
  for (let level = 1; level <= 8; level++) {
    assert.deepEqual(terrain.renderBytes(level, 17), terrain.renderBytes(level, 529));
  }
});

test('terrain layer placement follows the firmware level selection', () => {
  assert.deepEqual(Array.from({length: 8}, (_, i) => terrain.originY(i + 1)),
    [32, 32, 32, 32, 0, 0, 32, 32]);
  assert.throws(() => terrain.originY(0), RangeError);
  assert.throws(() => terrain.originY(9), RangeError);
});

test('terrain image exposes native pixels for the framebuffer compositor', () => {
  const image = terrain.render(2, 0), bytes = terrain.renderBytes(2, 0);
  assert.deepEqual([image.width, image.height, image.rows.length], [84, 16, 16]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 84; x++) {
    assert.equal(image.rows[y][x] === '#', Boolean(bytes[(y >> 3) * 84 + x] & (1 << (y & 7))));
  }
});
