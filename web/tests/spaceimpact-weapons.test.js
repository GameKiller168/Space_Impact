'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Controls = require('../js/spaceimpact-controls.js');
const Weapons = require('../js/spaceimpact-weapons.js');
const fixture = require('./fixtures/spaceimpact-fire.json');

for (const scenario of fixture.cases) {
  test('initial main weapon matches firmware: ' + scenario.name, () => {
    let ship = { x: 5, y: 20 }, weapons = Weapons.initial();
    for (const step of scenario.steps) {
      ship = Controls.move(ship, step.message, Controls.INITIAL_BOUNDS);
      weapons = Weapons.message(weapons, step.message, ship);
      assert.deepEqual([ship.x, ship.y], step.ship);
      assert.deepEqual(weapons, { cooldown: step.cooldown, repeats: step.repeats, shots: step.shots });
    }
  });
}

test('a main projectile leaves the playfield after crossing its right edge', () => {
  assert.deepEqual(Weapons.message({ cooldown: 0, repeats: 0, shots: [{ x: 83, y: 23 }] }, 1, { x: 5, y: 20 }).shots, []);
});
