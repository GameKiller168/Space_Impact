'use strict';

require('./support/locale.js');

/*
 * The bosses of levels 1 to 7 against the firmware's recordings (tests/fixtures/spaceimpact-bosses.json, from
 * tools/spaceimpact_record_bosses.py): entry, bounce, charge, special shots and the boss's bullets with the random values the
 * firmware drew for them, replayed through the generator. Hits on the boss do not change its movement, so none are made here.
 * The ticks from the first explosion on (the ship's shots destroying boss objects) are not compared.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/spaceimpact-engine.js');
const Levels = require('../js/spaceimpact-levels.js');
const Random = require('../js/spaceimpact-random.js');
const Classes = require('../js/spaceimpact-classes.js');
const fixture = require('./fixtures/spaceimpact-bosses.json');

const SPECIAL = { 4: 21, 5: 16, 6: 14, 7: 6 };

function playBoss(entry, onTick) {
  const game = Engine.create(1);
  Engine.startLevel(game, entry.level - 1);
  game.shipContact = () => {};
  const data = Levels.allLevels[entry.level - 1];
  const saved = data.waveRecords;
  const index = saved.findIndex((record) => record[4] === 23);
  data.waveRecords = saved.slice();                      // the records behind the boss (two empty ones on level 6) decide how long the terrain scrolls
  game.waveIndex = index; game.wavesLeft = saved.length - index; game.wait = 1; game.scroll = entry.scroll; game.bossDir = entry.first_dir; game.bossCool = entry.cool;
  // bullets of the waves before the boss that are still flying when it appears (they stand before the boss in the list)
  for (const [x, y] of entry.ticks[0].bullets) game.objects.push({ id: 800 + game.objects.length, cls: 4, x: x + 3, y, w: 2, h: 1, hp: 1, age: 0, vm: 6, speed: 3, y0: y, phase: 0, dir: 1, dead: 0, stop: 0, held: 0, div: 0, ammo: 0 });
  game.nextId = 1000;
  const queue = entry.draws.slice();
  const original = Random.effects;
  Random.effects = () => { if (!queue.length) throw new Error('more draws than the firmware made'); return queue.shift(); };
  try {
    let drawn = 0;
    for (let t = 0; t < Math.min(entry.ticks.length, entry.until); t++) {
      // the entries that stood behind the boss in the firmware's display list: static stand-ins at the end of the list
      if (game.objects.some((o) => Classes.isBoss(o.cls))) {
        const bossAt = game.objects.findIndex((o) => Classes.isBoss(o.cls));
        game.objects = game.objects.filter((o) => !o.standIn);
        const behind = game.objects.slice(bossAt + 1).filter((o) => o.cls !== 4).length;
        const front = game.objects.filter((o, i) => o.cls !== 4 || i <= bossAt), bullets = game.objects.filter((o, i) => o.cls === 4 && i > bossAt);
        const rest = front.slice();
        for (let k = behind; k < (t ? entry.ticks[t - 1].after : 0); k++) rest.push({ id: 900 + k, cls: 3, x: 200, y: 0, w: 9, h: 5, hp: 1, age: 0, vm: 8, speed: 0, y0: 0, phase: 0, dir: 1, dead: 0, stop: 0, held: 0, div: 0, ammo: 0, standIn: true });
        game.objects = rest.concat(bullets);
      }
      game.ship.y = entry.ticks[t].ship;               // the homing shots follow the ship
      game.advance(100);
      drawn += entry.ticks[t].n;
      onTick(game, t, drawn, entry.draws.length - queue.length);
    }
  } finally { Random.effects = original; data.waveRecords = saved; }
}

test('the bosses of levels 1 to 7 move, shoot and launch their special shots exactly as in the firmware', () => {
  assert.equal(fixture.levels.length, 7);
  for (const entry of fixture.levels) {
    playBoss(entry, (game, t, drawn, used) => {
      const where = `level ${entry.level}, tick ${t}`;
      const boss = game.objects.find((o) => Classes.isBoss(o.cls));
      assert.deepEqual([boss.x, boss.y], [entry.ticks[t].x, entry.ticks[t].y], where);
      assert.equal(used, drawn, `${where}: random draws so far`);
      const sort = (list) => list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      assert.deepEqual(sort(game.objects.filter((o) => o.cls === 4 && !o.dead).map((o) => [o.x & 255, o.y])), entry.ticks[t].bullets, `${where}: bullets`);
      if (SPECIAL[entry.level]) assert.deepEqual(sort(game.objects.filter((o) => o.cls === SPECIAL[entry.level] && !o.dead).map((o) => [o.x & 255, o.y])), entry.ticks[t].special, `${where}: special shots`);
    });
  }
});
