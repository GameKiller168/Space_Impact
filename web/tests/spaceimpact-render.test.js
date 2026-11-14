'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Framebuffer = require('../js/framebuffer.js');
const Render = require('../js/spaceimpact-render.js');

test('transparent and opaque bitmap drawing preserve or clear background pixels', () => {
  const bitmap = { width: 3, height: 2, rows: ['#.#', '.#.'] };
  const fb = new Framebuffer(4, 3);
  fb.fillRect(0, 0, 4, 3, 1);
  Render.blit(fb, bitmap, 1, 0, false);
  assert.equal(fb.toAscii(), '####\n####\n####');
  Render.blit(fb, bitmap, 1, 0, true);
  assert.equal(fb.toAscii(), '##.#\n#.#.\n####');
});

test('a bitmap crossing the LCD boundary is clipped at the correct source pixels', () => {
  const bitmap = { width: 4, height: 3, rows: ['#...', '.##.', '..##'] };
  const fb = new Framebuffer(3, 2);
  Render.blit(fb, bitmap, -1, -1, false);
  assert.equal(fb.toAscii(), '##.\n.##');
});
