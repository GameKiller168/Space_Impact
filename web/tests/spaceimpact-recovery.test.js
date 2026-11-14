'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Recovery } = require('../js/spaceimpact-recovery.js');
const fixture = require('./fixtures/spaceimpact-collision.json');

for (const scenario of fixture.scenarios) {
  for (let i = 0; i < scenario.episodes.length; i++) {
    test(`firmware collision and recovery: ${scenario.name}, hit ${i + 1}`, () => {
      const trace = scenario.episodes[i];
      const first = trace[0];
      const recovery = new Recovery({ lives: first.lives, x: first.ship.x, y: first.ship.y,
        now: first.ms, delay: first.delay, nextSecondary: first.next_secondary_ms });
      assert.equal(recovery.hit(), true);
      for (let j = 0; j < trace.length; j++) {
        if (j) recovery.advance();
        assert.deepEqual(recovery.snapshot(), trace[j], `firmware event ${j}`);
      }
    });
  }
}
