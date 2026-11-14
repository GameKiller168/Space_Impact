'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FirstThree } = require('../js/spaceimpact-waves.js');
const trace = require('./fixtures/spaceimpact-waves.json');

test('the first three waves match the firmware spawn, motion, animation and exits', () => {
  const game = new FirstThree();
  for (const expected of trace.snapshots) {
    while (game.tick < expected.tick) game.advance();
    const actual = game.snapshot();
    assert.deepEqual(actual, {
      tick: expected.tick,
      scroll: expected.scroll,
      wavesLeft: expected.waves_left,
      waitTicks: expected.wait_ticks,
      enemies: expected.enemies
    }, `tick ${expected.tick}`);
  }
});

test('the partial wave model stops at the end of its verified trace', () => {
  const game = new FirstThree();
  for (let i = 0; i < 92; i++) game.advance();
  assert.throws(() => game.advance(), RangeError);
});
