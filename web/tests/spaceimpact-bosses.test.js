'use strict';

require('./support/locale.js');

/*
 * The bosses of levels 1, 2 and 4 against the firmware's recordings (tests/fixtures/spaceimpact-boss-bounce.json, from
 * tools/spaceimpact_record_bosses.py): entry, bounce off the terrain and the top limit, and (levels 1 and 2) the boss's
 * bullets with the random values the firmware drew for them, replayed through the generator. Hits on the boss do not change
 * its movement, so none are made here.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/spaceimpact-engine.js');
const Levels = require('../js/spaceimpact-levels.js');
const Random = require('../js/spaceimpact-random.js');
const Classes = require('../js/spaceimpact-classes.js');
const fixture = require('./fixtures/spaceimpact-boss-bounce.json');

test('the bouncing bosses of levels 1, 2 and 4 move, and the first two shoot, exactly as in the firmware (level 4 movement only)', () => {
  assert.equal(fixture.levels.length, 3);
  for (const entry of fixture.levels) {
    const game = Engine.create(1);
    Engine.startLevel(game, entry.level - 1);
    game.shipContact = () => {};
    const data = Levels.allLevels[entry.level - 1];
    const saved = data.waveRecords;
    const index = saved.findIndex((record) => record[4] === 23);
    data.waveRecords = saved.slice(0, index + 1);
    game.waveIndex = index; game.wait = 1; game.scroll = entry.scroll; game.bossDir = entry.first_dir;
    const queue = entry.draws.slice();
    const original = Random.effects;
    Random.effects = () => { if (!queue.length) throw new Error('more draws than the firmware made'); return queue.shift(); };
    try {
      let drawn = 0;
      for (let t = 0; t < entry.ticks.length; t++) {
        // the entries that stood behind the boss in the firmware's display list: static stand-ins at the end of the list
        const bossAt = game.objects.findIndex((o) => Classes.isBoss(o.cls));
        if (bossAt >= 0) {
          const standIns = game.objects.filter((o) => o.standIn);
          const wanted = entry.ticks[t].after;
          game.objects = game.objects.filter((o) => !o.standIn);
          const bullets = game.objects.filter((o) => o.cls === 4), rest = game.objects.filter((o) => o.cls !== 4);
          for (let k = 0; k < wanted; k++) rest.push({ id: 900 + k, cls: 3, x: 200, y: 0, w: 9, h: 5, hp: 1, age: 0, vm: 8, speed: 0, y0: 0, phase: 0, dir: 1, dead: 0, stop: 0, held: 0, div: 0, ammo: 0, standIn: true });
          game.objects = rest.concat(bullets);
          void standIns;
        }
        game.advance(100);
        if (t === 0) game.waveIndex = data.waveRecords.length;
        drawn += entry.ticks[t].n;
        const boss = game.objects.find((o) => Classes.isBoss(o.cls));
        const where = `level ${entry.level}, tick ${t}`;
        assert.deepEqual([boss.x, boss.y], [entry.ticks[t].x, entry.ticks[t].y], where);
        // level 4 also runs the special-shot check on every tick (not modelled yet), so its draws are not compared
        if (entry.ticks[t].bullets) assert.equal(entry.draws.length - queue.length, drawn, `${where}: random draws so far`);
        if (entry.ticks[t].bullets && t < entry.bullets_until) {
          const bullets = game.objects.filter((o) => o.cls === 4 && !o.dead).map((o) => [o.x & 255, o.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          assert.deepEqual(bullets, entry.ticks[t].bullets, `${where}: bullets`);
        }
      }
    } finally { Random.effects = original; data.waveRecords = saved; }
  }
});
