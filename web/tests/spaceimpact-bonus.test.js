'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Bonus = require('../js/spaceimpact-bonus.js');
const Weapons = require('../js/spaceimpact-weapons.js');
const fixture = require('./fixtures/spaceimpact-bonus.json');

test('bonus messages, cooldown, ammunition and projectile frames match the firmware', () => {
  for (const scenario of fixture.cases) {
    let bonus = { type: scenario.type, ammo: scenario.ammo, shots: [] }, weapons = Weapons.initial();
    const ship = { x: 5, y: 20 };
    for (const [i, expected] of scenario.steps.entries()) {
      weapons = Weapons.message(weapons, expected.message, ship);
      const result = Bonus.message(bonus, expected.message, ship, weapons.cooldown, scenario.level);
      bonus = result.state; weapons.cooldown = result.cooldown;
      assert.deepEqual({ cooldown: result.cooldown, ammo: bonus.ammo, event: result.event, shots: bonus.shots.map(Bonus.display) },
        { cooldown: expected.cooldown, ammo: expected.ammo, event: expected.event, shots: expected.shots },
        `level ${scenario.level} class ${scenario.type} step ${i}`);
    }
  }
});

test('isolated bonus attacks track and damage the target on firmware ticks', () => {
  const Engine = require('../js/spaceimpact-engine.js');
  const damage = require('./fixtures/spaceimpact-bonus-damage.json');
  for (const sample of damage.cases) {
    const game = Engine.create(7);
    game.waveIndex = require('../js/spaceimpact-levels.js').allLevels[0].waveRecords.length;
    game.bonus.type = sample.type;
    game.fire(13);
    const target = { id: 1, cls: 5, x: 30, y: 23, w: 9, h: 5, hp: 20, age: 0, vm: 6, speed: 0, y0: 23, phase: 0, dir: 1, dead: 0, stop: 0, held: 0 };
    game.objects.push(target);
    for (const expected of sample.frames) {
      game.step();
      assert.equal(target.hp, expected.hp, `class ${sample.type}, tick ${expected.tick}`);
      assert.equal(game.score, expected.score, `class ${sample.type}, tick ${expected.tick}`);
      assert.deepEqual(game.bonus.shots.map(s => [s.x, s.y]), expected.shots, `class ${sample.type}, tick ${expected.tick}`);
    }
  }
});

test('lives, respawn shield, position and bonus stock match the firmware after a death', () => {
  const Engine = require('../js/spaceimpact-engine.js');
  const trace = require('./fixtures/spaceimpact-lives-details.json');
  const game = Engine.create(7);
  game.bonus.type = 9; game.bonus.ammo = 7;
  for (const f of trace.frames) {
    game.step();
    assert.deepEqual({ lives: game.lives, hit: game.mode === 'dying', guard: game.guard > 0,
      type: game.bonus.type, ammo: game.bonus.ammo, ship: [game.ship.x, game.ship.y] },
    { lives: f.lives, hit: f.hit, guard: f.guard, type: f.type, ammo: f.ammo, ship: f.ship }, `tick ${f.tick}`);
  }
});

test('held bonus fire uses the shared cooldown and stops at empty ammunition', () => {
  const Engine = require('../js/spaceimpact-engine.js');
  for (const key of ['4', '6', 'fireBonus']) {
    const game = Engine.create(7);
    assert.deepEqual(game.press(key).events, [25]);
    for (let i = 0; i < 10; i++) game.advance(100);
    assert.equal(game.bonus.ammo, 0);
    assert.equal(game.bonus.shots.length, 3);
    game.release(key);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const restored = Engine.restore(saved);
    assert.ok(restored);
    assert.deepEqual(restored.snapshot(), saved);
    for (let i = 0; i < 10; i++) { game.step(); restored.step(); }
    assert.deepEqual(restored.snapshot(), game.snapshot());
  }
});

test('ship sound scripts and vibration call contexts match firmware traces', () => {
  const fixture = require('./fixtures/spaceimpact-ship-sounds.json');
  const Tones = require('../js/spaceimpact-tones.js');
  require('../js/spaceimpact-pickups.js');
  for (const [code, data] of Object.entries(fixture.scripts)) assert.deepEqual(Tones.GAME[code].segments, data.segments);
  for (const entry of fixture.cases) assert.equal(entry.vibration_calls, entry.name === 'hit' ? 1 : 0, entry.name);
  const Engine = require('../js/spaceimpact-engine.js');
  const game = Engine.create(7);
  const repeat = fixture.cases.find(c => c.name === 'mainrepeat');
  game.fire(10); game.flush(); game.step(); game.step(); game.flush(); game.fire(138);
  assert.equal(repeat.event, 0); assert.equal(game.flush(), null);
  game.beginDying();
  assert.deepEqual(game.flush().events, [23, 'vibration']);
});
