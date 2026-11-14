'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Controls = require('../js/spaceimpact-controls.js');
const fixture = require('./fixtures/spaceimpact-movement.json');

test('phone and browser fire aliases map to Space Impact firmware messages', () => {
  const normal = { '0': 9, '1': 10, '3': 12, '4': 13, '6': 15, '8': 17, '#': 20, '*': 22,
    fireMain: 10, fireBonus: 13 };
  for (const [key, message] of Object.entries(normal)) assert.equal(Controls.messageForKey(key, false), message);
  assert.equal(Controls.messageForKey('8', true), 145);
  assert.equal(Controls.messageForKey('fireMain', true), 138);
  assert.equal(Controls.messageForKey('fireBonus', true), null);
  assert.equal(Controls.messageForKey('2', false), null);
});

for (const sample of fixture.cases) {
  test('ship movement matches firmware: ' + sample.name, () => {
    let position = { x: fixture.initial_ship_position[0], y: fixture.initial_ship_position[1] };
    for (const event of sample.sequence) {
      for (let i = 0; i < event.count; i++) position = Controls.move(position, event.message, Controls.INITIAL_BOUNDS);
    }
    assert.deepEqual([position.x, position.y], sample.ship_position);
  });
}
