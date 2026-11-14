'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const assets = require('../js/spaceimpact-assets.js');

function at(address) {
  return assets.images.find((image) => image.descriptor === address);
}

test('the Space Impact firmware image table keeps all 84 descriptors in address order', () => {
  assert.equal(assets.images.length, 84);
  assets.images.forEach((image, i) => {
    assert.equal(Number(image.descriptor), 0x312dcc + 12 * i);
    assert.ok(Number(image.data) >= 0x311000 && Number(image.data) < 0x312dcc);
    assert.equal(image.rows.length, image.height);
    for (const row of image.rows) {
      assert.equal(row.length, image.width);
      assert.match(row, /^[.#]+$/);
    }
  });
});

test('firmware heart and ship pixels use the correct page orientation', () => {
  assert.deepEqual(at('0x00313180'), {
    descriptor: '0x00313180', data: '0x00312750', width: 5, height: 4,
    rows: ['##.##', '#####', '.###.', '..#..']
  });
  assert.deepEqual(at('0x00312de4').rows,
    ['.....####', '.####.##.', '#.#######', '.####.##.', '.....####']);
});

test('large firmware images keep their dimensions and shared frame references', () => {
  const firstBoss = at('0x00312ee0');
  assert.equal(firstBoss.data, '0x00312570');
  assert.deepEqual([firstBoss.width, firstBoss.height], [19, 21]);
  assert.equal(firstBoss.rows[0], '#####...###########');
  assert.deepEqual(at('0x00312eec').rows, firstBoss.rows);
  const lastBoss = at('0x00313030');
  assert.deepEqual([lastBoss.width, lastBoss.height], [38, 38]);
  assert.equal(lastBoss.rows[0], '...........................#####......');
});
