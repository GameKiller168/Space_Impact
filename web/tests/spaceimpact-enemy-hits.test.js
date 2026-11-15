'use strict';

require('./support/locale.js');

/*
 * The ship's main shot against ordinary enemies, from the original handler (tests/fixtures/spaceimpact-enemy-hits.json and
 * spaceimpact-enemy-scoring.json, recorded with tools/spaceimpact_record_enemy_hits.py and spaceimpact_record_enemy_scoring.py):
 * the first collidable object whose box overlaps the shot (inclusive edges, no pixel test) takes one hit point; 5 points for
 * a hit, 10 for a kill, none for an enemy bullet; the score stops at its limit; the explosion shows the frame the enemy had
 * and then the four explosion pictures.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Classes = require('../js/spaceimpact-classes.js');
const { images } = require('../js/spaceimpact-assets.js');

test('score limits and explosion frames follow the firmware', () => {
  const Hits = require('../js/spaceimpact-enemy-hits.js');
  const scoring = require('./fixtures/spaceimpact-enemy-scoring.json');
  for (const [before, increment, after, lives] of scoring.score_vectors) {
    assert.equal(Hits.addScore(before, increment), after);
    assert.equal(lives, 3, 'the score update did not award a life');
  }
  const firstFrame = images.findIndex((im) => im.data === scoring.explosion[0][2]);
  assert.ok(firstFrame >= 0);
  scoring.explosion.forEach((row, index) => {
    if (row === null) return assert.equal(index, 4);
    assert.equal(row[0], 2);
    assert.equal(row[1], index);
    assert.equal(images[Hits.explosionFrame(firstFrame, index + 1)].data, row[2]);
  });
});

test('main shots, first-match boxes, damage and scores reproduce firmware contacts', () => {
  const Hits = require('../js/spaceimpact-enemy-hits.js');
  const Engine = require('../js/spaceimpact-engine.js');
  const impacts = require('./fixtures/spaceimpact-enemy-hits.json');
  let hits = 0, misses = 0, edgeOverlaps = 0;
  const hitClasses = new Set();
  for (const c of impacts.cases) for (const sample of c.samples) {
    const [tick, before, allShots, targets, scoreAfter, shotIdsAfter, targetsAfter, terrainHits] = sample;
    // Terrain projectiles are owned by the terrain subsystem; the oracle records
    // those ids at 0x259f18 so only the other shots enter this comparison.
    const shots = allShots.filter((s) => !terrainHits.includes(s[0]));
    const game = Engine.create(impacts.seed || 0);
    game.score = before;
    game.weapons = { cooldown: 0, repeats: 0, shots: shots.map((s) => ({ x: s[1], y: s[2] })) };
    game.objects = targets.map((o) => ({ id: o[0], cls: o[1], x: o[2], y: o[3], w: o[4], h: o[5], hp: o[6], dead: 0, age: tick }));
    for (const sh of shots) for (const o of game.objects) {
      const sx = sh[1], sy = sh[2], x = o.x < 128 ? o.x : o.x - 256, y = o.y < 128 ? o.y : o.y - 256;
      if (Hits.touches({ x: sx, y: sy, w: sh[3], h: sh[4] }, o) &&
          (sx + sh[3] === x || sx === x + o.w || sy + sh[4] === y || sy === y + o.h)) edgeOverlaps++;
    }
    game.shotsHit();
    assert.equal(game.score, scoreAfter, `level ${c.level} wave ${c.wave} tick ${tick}: score`);
    const expectedShots = shots.filter((s) => shotIdsAfter.includes(s[0])).map((s) => ({ x: s[1], y: s[2] }));
    assert.deepEqual(game.weapons.shots, expectedShots, `level ${c.level} wave ${c.wave} tick ${tick}: shots`);
    if (shots.length === shotIdsAfter.length) misses++; else hits++;
    for (let i = 0; i < targets.length; i++) {
      const o = game.objects[i], after = targetsAfter[i];
      assert.equal(after[0], o.id);
      if (after[2] !== targets[i][6]) hitClasses.add(o.cls);
      assert.equal(after[1], o.dead ? 2 : o.cls, `level ${c.level} wave ${c.wave} tick ${tick}: class`);
      assert.equal(after[2], o.hp, `level ${c.level} wave ${c.wave} tick ${tick}: hp`);
      const expectedFrame = o.dead ? 0 : tick % Classes.frames(o.cls).length;
      assert.equal(after[3], expectedFrame, `level ${c.level} wave ${c.wave} tick ${tick}: animation`);
      const descriptor = Classes.frames(o.cls)[tick % Classes.frames(o.cls).length];
      assert.equal(after[4], images[descriptor].data, `level ${c.level} wave ${c.wave} tick ${tick}: image`);
    }
  }
  assert.ok(hits > 0 && misses > 0, 'fixture covers both hits and shots passing through');
  assert.ok(edgeOverlaps > 0, 'fixture exercises inclusive box edges');
  for (const cls of [3, 4, 5, 6, 11, 12, 13, 14, 15, 16, 26, 27, 28, 29, 30, 31])
    assert.ok(hitClasses.has(cls), `fixture damages class ${cls}`);
});

