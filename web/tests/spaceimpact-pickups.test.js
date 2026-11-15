'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Tones = require('../js/spaceimpact-tones.js');
const Pickups = require('../js/spaceimpact-pickups.js');
const Levels = require('../js/spaceimpact-levels.js');
const fixture = require('./fixtures/spaceimpact-pickups.json');

test('pickup outcomes and rerolls match the firmware reward routine', () => {
  for (const sample of fixture.cases) {
    let i = 0;
    const actual = Pickups.apply(sample.before, sample.class, () => sample.random[i++]);
    assert.deepEqual(actual, { ...sample.after, event: sample.event }, JSON.stringify(sample));
    assert.equal(i, sample.random_calls.length);
  }
});
test('the pickup tone is the decoded firmware script', () => {
  assert.deepEqual(Tones.GAME[31].segments, fixture.sound.segments);
});
test('the level records contain the firmware pickup wave classes', () => {
  const waves = Levels.allLevels.map(level => level.waveRecords.map((r, i) => r[1] === 17 || r[1] === 33 ? [i + 1, r[1]] : null).filter(Boolean));
  assert.deepEqual(waves, [[[6,17],[14,17]], [[5,17]], [[5,17]], [[8,17]], [[4,17]], [[10,17],[13,17],[31,17]], [[13,17]], []]);
});
