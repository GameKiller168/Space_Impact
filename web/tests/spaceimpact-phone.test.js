'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Phone = require('../js/spaceimpact-phone.js');
const Storage = require('../js/spaceimpact-storage.js');
const Save = require('../js/save.js');

function memory() {
  const values = new Map();
  return { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
}
function engine() {
  function game(state) {
    return { state, advance(ms) { state.elapsed += ms; }, press(key) { state.lastKey = key; },
      draw(fb) { fb.clear(); fb.set(1, 1); }, snapshot() { return { ...state }; } };
  }
  return { create: () => game({ elapsed: 0, lastKey: null }),
    restore: s => s && Number.isInteger(s.elapsed) && s.elapsed >= 0 ? game({ ...s }) : null };
}

test('the main menu invokes only a supplied game adapter and exposes Continue after pause', () => {
  const phone = new Phone({ engine: engine() });
  assert.deepEqual(phone.entries().map(e => e.id), ['newGame', 'topScore', 'instructions', 'options']);
  assert.equal(phone.press('select'), 'newGame');
  assert.equal(phone.inGame(), true);
  phone.press('2'); phone.advance(125); phone.press('c');
  assert.equal(phone.entries()[0].id, 'continue');
  phone.press('select');
  assert.equal(phone.inGame(), true);
  assert.deepEqual(phone.game.snapshot(), { elapsed: 125, lastKey: '2' });
  assert.equal(phone.draw().get(1, 1), 1);
});

test('a missing adapter never starts a different game', () => {
  const phone = new Phone();
  assert.equal(phone.press('select'), 'newGameUnavailable');
  assert.equal(phone.inGame(), false);
  assert.equal(phone.game, null);
});

test('game events reach the host and held keys can be released while paused', () => {
  const events = [], released = [];
  const adapter = { create() { return {
    press() { return { events: ['shot'] }; },
    release(key) { released.push(key); return { events: ['stop'] }; },
    advance() {}, draw() {}, snapshot() { return {}; }
  }; } };
  const phone = new Phone({ engine: adapter, onEvent: e => events.push(e) });
  phone.press('select'); phone.press('5'); phone.press('c'); phone.release('5');
  assert.deepEqual(events, ['shot', 'stop']);
  assert.deepEqual(released, ['5']);
});

test('hiding the page releases held keys and never advances the hidden interval', () => {
  const released = [];
  const adapter = { create() { return {
    elapsed: 0, press() {}, release(key) { released.push(key); },
    advance(ms) { this.elapsed += ms; }, draw() {}, snapshot() { return { elapsed: this.elapsed }; }
  }; } };
  const phone = new Phone({ engine: adapter });
  phone.press('select'); phone.press('5'); phone.setVisible(false);
  assert.equal(phone.inGame(), false);
  phone.press('6'); phone.release('5'); phone.advance(5000);
  assert.deepEqual(released, ['5']);
  assert.equal(phone.game.elapsed, 0);
  phone.setVisible(true); phone.advance(5000); phone.advance(25);
  assert.equal(phone.game.elapsed, 25);
});

test('saved game and settings restore together, with Continue selected', () => {
  const disk = memory(), save = Storage.createSave(disk), adapter = engine();
  const original = new Phone({ engine: adapter, store: Storage.createStore(disk) });
  original.store.language = 'hu';
  original.press('select'); original.advance(100); original.press('6');
  save.write(original.snapshot());
  const restored = new Phone({ engine: adapter, store: Storage.createStore(disk), save });
  assert.equal(restored.inGame(), false);
  assert.equal(restored.entries()[0].id, 'continue');
  restored.press('select'); restored.advance(25);
  assert.deepEqual(restored.game.snapshot(), { elapsed: 125, lastKey: '6' });
  assert.equal(restored.store.language, 'hu');
});

test('the shared autosave scheduler captures the current injected game state', () => {
  const disk = memory(), save = Storage.createSave(disk), adapter = engine();
  const phone = new Phone({ engine: adapter, store: Storage.createStore(disk) });
  const autosave = Save.autosave({ phone, save });
  phone.onChange = () => autosave.touch();
  phone.press('select'); phone.advance(250); phone.press('4');
  autosave.flush(); autosave.stop();
  const restored = new Phone({ engine: adapter, store: Storage.createStore(disk), save });
  assert.equal(restored.entries()[0].id, 'continue');
  restored.press('select');
  assert.deepEqual(restored.game.snapshot(), { elapsed: 250, lastKey: '4' });
});

test('newer separately saved settings survive restoration of an older game snapshot', () => {
  const disk = memory(), save = Storage.createSave(disk), adapter = engine();
  const store = Storage.createStore(disk), phone = new Phone({ engine: adapter, store });
  store.language = 'hu'; phone.press('select'); save.write(phone.snapshot());
  store.language = 'ro';
  const restored = new Phone({ engine: adapter, store: Storage.createStore(disk), save });
  assert.equal(restored.store.language, 'ro');
  assert.equal(restored.entries()[0].id, 'continue');
});

test('invalid engine state cannot change live settings or game', () => {
  const phone = new Phone({ engine: engine() });
  phone.store.top = 9;
  const before = phone.snapshot();
  assert.equal(phone.restore({ version: 1, settings: { ...before.settings, top: 200 }, game: { elapsed: -1 } }), false);
  assert.deepEqual(phone.snapshot(), before);
});

test('options and language selection use the shared translations and isolated settings', () => {
  const phone = new Phone({ engine: engine() });
  phone.press('scrollUp'); phone.press('select');
  assert.equal(phone.kind, 'options');
  phone.press('select'); assert.equal(phone.store.gameSounds, false);
  phone.press('scrollUp'); phone.press('select');
  assert.equal(phone.kind, 'language');
  const hu = phone.entries().findIndex(e => e.id === 'hu');
  phone.states.language.c = hu; phone.press('select');
  assert.equal(phone.store.language, 'hu');
  assert.equal(phone.kind, 'options');
  phone.press('c'); assert.equal(phone.entries()[0].label, 'Új játék');
  assert.equal(phone.draw().w, 84);
});

test('instructions come only from the injected Space Impact text provider', () => {
  const seen = [];
  const phone = new Phone({ engine: engine(), instructions: lang => { seen.push(lang); return 'Space Impact instructions.'; } });
  phone.press('scrollDown'); phone.press('scrollDown'); phone.press('select');
  assert.equal(phone.mode, 'instructions');
  assert.equal(phone.draw().w, 84);
  assert.ok(seen.length >= 1);
  phone.press('c');
  assert.equal(phone.mode, 'menu');
});
