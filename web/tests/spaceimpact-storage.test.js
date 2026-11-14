'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../js/spaceimpact-storage.js');

function memory() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

test('Space Impact settings survive recreation without reading or overwriting Snake II', () => {
  const storage = memory();
  storage.setItem('snake2.v2.phone', '{"top":999}');
  const first = Storage.createStore(storage);
  assert.equal(first.top, 0);
  first.top = 1250;
  first.gameSounds = false;
  first.keyTones = false;
  first.vibration = false;
  first.language = 'hu';
  const second = Storage.createStore(storage);
  assert.deepEqual(second.snapshot(), { top: 1250, gameSounds: false, keyTones: false, vibration: false, language: 'hu' });
  assert.equal(storage.getItem('snake2.v2.phone'), '{"top":999}');
});

test('invalid snapshots cannot partially replace the settings', () => {
  const store = Storage.createStore(null);
  store.top = 75;
  const before = store.snapshot();
  assert.equal(store.restore({ ...before, top: -1, language: 'en' }), false);
  assert.deepEqual(store.snapshot(), before);
  store.top = NaN;
  store.language = '';
  assert.deepEqual(store.snapshot(), before);
});

test('blocked storage leaves settings usable for the session', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const store = Storage.createStore(blocked);
  store.top = 432;
  store.language = 'ro';
  assert.equal(store.top, 432);
  assert.equal(store.language, 'ro');
});

test('game snapshots use a separate key and clear independently of settings', () => {
  const storage = memory();
  storage.setItem('snake2.v1.save', 'unchanged');
  const store = Storage.createStore(storage);
  store.top = 7;
  const save = Storage.createSave(storage);
  const state = { game: { level: 3, entities: [{ x: 20, y: 12 }] } };
  save.write(state);
  assert.deepEqual(Storage.createSave(storage).load(), state);
  save.clear();
  assert.equal(save.load(), null);
  assert.equal(Storage.createStore(storage).top, 7);
  assert.equal(storage.getItem('snake2.v1.save'), 'unchanged');
});
