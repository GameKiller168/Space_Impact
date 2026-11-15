'use strict';

require('./support/locale.js');

/*
 * Enemy shots against the running firmware (tests/fixtures/spaceimpact-enemy-fire.json, recorded with
 * tools/spaceimpact_record_fire.py): the 159 isolated ordinary wave records, ship parked and unhurtable. On every tick the
 * enemy bullets on the display and the state of the effects generator (one draw per shot check) must equal the firmware's.
 *
 * For 133 records that holds for the whole record. For 26 it holds up to a "stop" tick that the fixture names; there the
 * recording diverges because of something this test does not model: a bullet that reaches the parked ship or its start shield,
 * the ship object itself disappearing in the recording, or whether a bullet is moved on the tick it is made when the shooter
 * is one of the mini-bosses. Those ticks are left out of the comparison on purpose.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/spaceimpact-engine.js');
const Levels = require('../js/spaceimpact-levels.js');
const Random = require('../js/spaceimpact-random.js');
const fixture = require('./fixtures/spaceimpact-enemy-fire.json');

test('ordinary enemies shoot at the same ticks, from the same places and with the same random draws as the firmware', () => {
  assert.equal(fixture.cases.length, 159);
  let shots = 0, whole = 0;
  for (const c of fixture.cases) {
    const game = Engine.create(1);
    Engine.startLevel(game, c.level - 1);
    game.rng = Random.create(fixture.seed);
    game.ship.y = c.ship_y;
    game.guard = 1e9;
    game.terrainContact = () => false;
    const data = Levels.allLevels[c.level - 1];
    const saved = data.waveRecords;
    data.waveRecords = saved.slice(0, c.wave);          // only this record: the recording plays one wave
    game.waveIndex = c.wave - 1;
    game.wait = 1;
    try {
      for (let t = 0; t < c.ticks.length; t++) {
        game.advance(100);
        if (t === 0) game.waveIndex = data.waveRecords.length;
        const bullets = game.objects.filter((o) => o.cls === 4 && !o.dead).map((o) => [o.x & 255, o.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        assert.deepEqual(bullets, c.ticks[t][0], `level ${c.level} wave ${c.wave}, tick ${t}`);
        assert.equal(game.rng.effects, c.ticks[t][1], `level ${c.level} wave ${c.wave}, tick ${t}: random draws`);
        shots += bullets.length;
      }
    } finally { data.waveRecords = saved; }
    if (c.stop === null) whole += 1;
  }
  assert.ok(shots > 500, `${shots} bullet positions compared`);
  assert.equal(whole, 133);
});
