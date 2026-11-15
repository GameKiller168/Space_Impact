'use strict';

require('./support/locale.js');

/*
 * Ordinary enemy movement against the running firmware: tests/fixtures/spaceimpact-enemies.json holds 159 isolated wave
 * records (every ordinary record of all eight levels, bosses, pickups and empty records left out), each played by the
 * original handler for up to 300 ticks with the ship parked at y = 8, 20 or 29 and unable to be hurt, recorded with
 * tools/spaceimpact_record_enemies.py. The engine must put every enemy of the wave on the same pixel on every tick.
 * One thing is not compared: when an enemy reaches the parked ship the firmware removes it, and the engine's ship is
 * made untouchable by a different route, so a case ends when the firmware's enemy vanishes next to the ship.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/spaceimpact-engine.js');
const Levels = require('../js/spaceimpact-levels.js');
const Random = require('../js/spaceimpact-random.js');
const fixture = require('./fixtures/spaceimpact-enemies.json');

test('the firmware random generators reproduce their recorded sequences', () => {
  for (const row of fixture.random) {
    const state = Random.create(row.seed);
    for (let i = 0; i < row.spawn.length; i++) assert.equal(Random.spawn(state), row.spawn[i][0], `spawn ${row.seed} #${i}`);
    for (let i = 0; i < row.effects.length; i++) assert.equal(Random.effects(state), row.effects[i][0], `effects ${row.seed} #${i}`);
  }
});

test('every ordinary wave of every level moves exactly as in the firmware', () => {
  assert.equal(fixture.cases.length, 159);
  const levelsSeen = new Set();
  for (const c of fixture.cases) {
    levelsSeen.add(c.level);
    const game = Engine.create(1);
    Engine.startLevel(game, c.level - 1);
    game.rng = Random.create(fixture.seed);
    game.ship.y = c.ship_y;
    game.guard = 1e9; game.terrainContact = () => false;
    const records = Levels.allLevels[c.level - 1].waveRecords;
    game.waveIndex = c.wave - 1;
    game.wait = 1;
    let ids = null;
    const where = `level ${c.level} wave ${c.wave}`;
    ticks: for (let t = 0; t < c.ticks.length; t++) {
      game.advance(100);
      if (t === 0) { game.waveIndex = records.length; ids = game.objects.filter((o) => o.cls === c.record[1]).map((o) => o.id); }
      for (let i = 0; i < c.record[0]; i++) {
        const want = c.ticks[t][1 + i], object = game.objects.find((o) => o.id === ids[i]);
        const mine = object ? [object.x & 255, object.y & 255] : null;
        if (want === null && mine && mine[0] <= 16) break ticks;
        assert.deepEqual(mine, want ? [want[0], want[1]] : null, `${where}, tick ${t}, enemy ${i}`);
      }
    }
  }
  assert.equal(levelsSeen.size, 8);
});
