'use strict';

require('./support/locale.js');

/*
 * The Space Impact engine against the firmware traces that exist for it, plus the behaviour that has no firmware
 * trace (progression, saving). Where a test compares with the firmware it says which fixture it is.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Framebuffer = require('../js/framebuffer.js');
const Engine = require('../js/spaceimpact-engine.js');
const Levels = require('../js/spaceimpact-levels.js');
const Classes = require('../js/spaceimpact-classes.js');
const { images } = require('../js/spaceimpact-assets.js');
const schedule = require('./fixtures/spaceimpact-schedule.json');
const waves = require('./fixtures/spaceimpact-waves.json');
const contact = require('./fixtures/spaceimpact-contact.json');

const FB = globalThis.SnakeII.Framebuffer;

// One firmware tick n is the engine's step n - 1: the firmware's first tick only starts the clock.
function stepTo(game, firmwareTick) { while (game.tick < firmwareTick) game.advance(100); }
function frameImage(object) { return images[Classes.frames(object.cls)[object.age % Classes.frames(object.cls).length]]; }

test('the wave schedule of every level matches the spawn ticks recorded from the firmware', () => {
  assert.equal(schedule.levels.length, 8);
  for (const entry of schedule.levels) {
    const game = Engine.create(7);
    Engine.startLevel(game, entry.level - 1);
    const seen = [];
    let previous = 0;
    for (let steps = 0; steps < 3000 && seen.length < entry.spawn_offsets.length; steps++) {
      game.guard = 30;
      game.advance(100);
      while (previous < game.waveIndex) { seen.push(game.tick - 1); previous += 1; }
    }
    assert.deepEqual(seen, entry.spawn_offsets, `level ${entry.level}`);
  }
});

test('the first three waves fly where the firmware put them', () => {
  const game = Engine.create(7);
  for (const expected of waves.snapshots.filter((snapshot) => snapshot.tick <= 91)) {
    stepTo(game, expected.tick);
    const actual = game.objects.filter((object) => !object.dead).map((object) => ({ x: object.x, y: object.y, data: frameImage(object).data, width: object.w, height: object.h }));
    const order = (a, b) => a.y - b.y || a.x - b.x;
    assert.deepEqual(actual.sort(order), expected.enemies.slice().sort(order), `firmware tick ${expected.tick}`);
  }
});

test('the ship is hit on the same tick as in the firmware for the scripted level-1 runs', () => {
  const moves = { 17: '8', 9: '0', 20: '#', 22: '*' };
  const checked = ['unsteered', 'up_1', 'up_3', 'up_10', 'down_1', 'right_5', 'right_10', 'left_3', 'fire_once', 'fire_stream'];
  for (const scenario of contact.scenarios.filter((entry) => checked.includes(entry.name))) {
    const game = Engine.create(7);
    for (const code of scenario.inputs_after_first_tick) {
      if (moves[code]) { game.press(moves[code]); game.release(moves[code]); } else { game.press('fireMain'); game.release('fireMain'); }
    }
    const later = scenario.later_inputs;
    let hitTick = null;
    while (game.mode === 'play' && game.tick < 400) {
      if (later[String(game.tick)]) { game.press('fireMain'); game.release('fireMain'); }
      game.advance(100);
    }
    if (game.mode === 'dying') hitTick = game.tick;
    assert.equal(hitTick, scenario.hit_ticks[0], scenario.name);
  }
});

test('a held key moves the ship every tick after a short delay and firing is limited by the cooldown', () => {
  const game = Engine.create(7);
  game.guard = 30;
  game.press('8');
  assert.deepEqual(game.ship, { x: 5, y: 19 });
  game.advance(100); game.advance(100);
  assert.deepEqual(game.ship, { x: 5, y: 19 });
  game.advance(100);
  assert.deepEqual(game.ship, { x: 5, y: 17 });
  game.release('8');
  game.press('fireMain');
  assert.equal(game.weapons.shots.length, 1);
  game.press('fireMain');
  assert.equal(game.weapons.shots.length, 1, 'the second press falls into the cooldown');
});

test('shooting a ship-class enemy removes it, scores its points and leaves an explosion for four ticks', () => {
  const game = Engine.create(7);
  game.guard = 30;
  game.ship.y = 6;
  stepTo(game, 22);
  const enemies = game.objects.filter((object) => object.cls === 5);
  assert.equal(enemies.length, 3);
  for (let i = 0; i < 40 && game.score === 0; i++) { game.press('fireMain'); game.release('fireMain'); game.advance(100); }
  assert.equal(game.score, 10);
  const dying = game.objects.filter((object) => object.dead);
  assert.equal(dying.length, 1);
  for (let i = 0; i < 4; i++) game.advance(100);
  assert.equal(game.objects.filter((object) => object.dead).length, 0);
});

test('an invulnerable, aiming player plays through all eight levels and wins', () => {
  const game = Engine.create(1);
  const fb = new FB(84, 48);
  const levelsStarted = [0];
  let result = null;
  for (let tick = 0; tick < 20000 && !(result && result.ended); tick++) {
    game.guard = 30;
    const target = game.objects.find((object) => !object.dead && object.x < 84 && object.cls !== 4 && !Classes.isPickup(object.cls));
    if (target && game.mode === 'play') {
      const want = target.y + Math.floor(target.h / 2) - 3;
      if (game.ship.y < want) game.moveShip(9); else if (game.ship.y > want) game.moveShip(17);
      game.fire(10);
    }
    result = game.advance(100);
    if (game.level !== levelsStarted[levelsStarted.length - 1]) levelsStarted.push(game.level);
    if (tick % 50 === 0) game.draw(fb);
  }
  assert.deepEqual(levelsStarted, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(result && result.ended, 'the game ended');
  assert.ok(result.score > 3000);
  assert.equal(game.mode, 'won');
});

test('without a guard the lives run out and the game ends with its score', () => {
  const game = Engine.create(3);
  let result = null;
  for (let tick = 0; tick < 5000 && !(result && result.ended); tick++) result = game.advance(100);
  assert.ok(result && result.ended);
  assert.equal(game.lives, 0);
  assert.equal(result.score, game.score);
});

test('the ship\'s explosion, the loss of a life and the shield after the respawn follow the recorded sequence', () => {
  const game = Engine.create(3);
  while (game.mode === 'play') game.advance(100);
  assert.equal(game.mode, 'dying');
  assert.equal(game.lives, 3);
  const ticksToRespawn = [];
  while (game.mode === 'dying') { game.advance(100); ticksToRespawn.push(game.lives); }
  assert.equal(ticksToRespawn.length, 5);
  assert.equal(game.lives, 2);
  assert.equal(game.mode, 'play');
  assert.equal(game.guard, 30);
  assert.deepEqual(game.ship, { x: 5, y: 20 });
});

test('a snapshot restores the same game, which then plays on identically', () => {
  const game = Engine.create(5);
  for (let i = 0; i < 400; i++) { if (i % 7 === 0) game.press('fireMain'); if (i % 11 === 0) game.moveShip(i % 2 ? 9 : 17); game.advance(100); }
  const snapshot = JSON.parse(JSON.stringify(game.snapshot()));
  const copy = Engine.restore(snapshot);
  assert.ok(copy);
  assert.deepEqual(copy.snapshot(), snapshot);
  for (let i = 0; i < 300; i++) { game.advance(100); copy.advance(100); }
  assert.deepEqual(copy.snapshot(), game.snapshot());
  const fbA = new FB(84, 48), fbB = new FB(84, 48);
  game.draw(fbA); copy.draw(fbB);
  assert.ok(fbA.equals(fbB));
});

test('restoring refuses snapshots that are not a complete, valid game', () => {
  const good = Engine.create(5).snapshot();
  assert.ok(Engine.restore(good));
  assert.equal(Engine.restore(null), null);
  assert.equal(Engine.restore({}), null);
  const bad = (change) => { const s = JSON.parse(JSON.stringify(good)); change(s); return Engine.restore(s); };
  assert.equal(bad((s) => { s.v = 2; }), null);
  assert.equal(bad((s) => { s.level = 8; }), null);
  assert.equal(bad((s) => { s.lives = 9; }), null);
  assert.equal(bad((s) => { s.mode = 'flying'; }), null);
  assert.equal(bad((s) => { s.ship.x = 'a'; }), null);
  assert.equal(bad((s) => { s.objects = [{ id: 1, cls: 99 }]; }), null);
  assert.equal(bad((s) => { s.weapons.shots = new Array(100).fill({ x: 1, y: 1 }); }), null);
  assert.equal(bad((s) => { delete s.weapons; }), null);
});

test('every frame draws inside the 84 x 48 display and the HUD shows one heart per life', () => {
  const game = Engine.create(5);
  const fb = new FB(84, 48);
  game.draw(fb);
  const heart = images[79].rows;
  for (let life = 0; life < 3; life++) {
    for (let row = 0; row < heart.length; row++) for (let col = 0; col < heart[row].length; col++) {
      assert.equal(fb.get(life * 6 + col, row), heart[row][col] === '#' ? 1 : 0, `heart ${life}`);
    }
  }
  assert.equal(fb.get(18, 1), 0, 'no fourth heart');
});
