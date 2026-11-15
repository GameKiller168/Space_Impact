'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Terrain = require('../js/spaceimpact-terrain.js');
const Contact = require('../js/spaceimpact-contact.js');
const TerrainContact = require('../js/spaceimpact-terrain-contact.js');
const Engine = require('../js/spaceimpact-engine.js');
const { images } = require('../js/spaceimpact-assets.js');
const fixture = require('./fixtures/spaceimpact-terrain-contact.json');
const byData = new Map(images.map(image => [image.data, image]));
function sprite(data, x, y) {
  const image = byData.get(data);
  assert.ok(image, data);
  return { x, y, width: image.width, height: image.height, pages: Contact.pagesFromRows(image.rows) };
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

test('terrain contact matches every oracle tick, including shield pushback', () => {
  let checked = 0, hits = 0, pushes = 0;
  for (const scenario of fixture.cases) {
    for (const frame of scenario.frames) {
      const scroll = (frame.scroll + 511) % 512; // compositor precedes this tick's scroll increment
      assert.equal(crc32(Terrain.renderBytes(scenario.level, scroll)), frame.terrain_crc32);
      const ship = sprite(frame.ship_data, frame.x, frame.y);
      const actual = TerrainContact.hits(scenario.level, scroll, ship);
      assert.equal(actual, frame.hit, `level ${scenario.level} tick ${frame.tick} x=${frame.x} y=${frame.y}`);
      if (frame.shield && !frame.hit) {
        const shield = sprite(frame.shield.data, frame.shield.x, frame.shield.y);
        const push = TerrainContact.hits(scenario.level, scroll, shield);
        assert.equal(frame.after_y, frame.y + (push ? (frame.orientation ? 2 : -2) : 0));
        if (push) pushes++;
      }
      checked++; if (frame.hit) hits++;
    }
  }
  assert.ok(checked > 1500 && hits > 15 && pushes > 10);
});

test('engine follows exact terrain hit ticks and shield movements from the oracle', () => {
  for (const scenario of fixture.cases) {
    const game = Engine.create(7);
    Engine.startLevel(game, scenario.level - 1);
    game.ship = { x: scenario.x, y: scenario.y };
    game.waveIndex = require('../js/spaceimpact-levels.js').allLevels[game.level].waveRecords.length;
    for (const frame of scenario.frames) {
      game.step();
      assert.equal(game.tick, frame.tick);
      assert.equal(game.mode === 'dying', frame.hit, `level ${scenario.level}, start y ${scenario.y}, tick ${frame.tick}`);
      assert.equal(game.ship.y, frame.after_y, `level ${scenario.level}, start y ${scenario.y}, tick ${frame.tick}`);
      assert.equal(game.guard > 0, frame.guard !== 0, `guard on tick ${frame.tick}`);
    }
  }
});

test('upper terrain levels use firmware movement limits', () => {
  for (const level of [4, 5]) {
    const game = Engine.create(1); Engine.startLevel(game, level);
    for (let i = 0; i < 60; i++) game.moveShip(17);
    assert.equal(game.ship.y, 1);
    for (let i = 0; i < 60; i++) game.moveShip(9);
    assert.equal(game.ship.y, 35);
  }
});
