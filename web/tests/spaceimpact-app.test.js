'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../js/spaceimpact-app.js');
const Input = require('../js/input.js');

function memory() {
  const values = new Map();
  return { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
}
function emitter(extra) {
  const handlers = {};
  return Object.assign({ addEventListener(k, f) { handlers[k] = f; }, removeEventListener(k) { delete handlers[k]; }, fire(k) { if (handlers[k]) handlers[k](); } }, extra);
}
function input() {
  let handler, held = new Set();
  return {
    attach(h) { handler = h; return {
      releaseAll() { for (const key of [...held]) { held.delete(key); handler.onRelease(key); } },
      detach() { this.releaseAll(); handler = null; }
    }; },
    down(k) { held.add(k); handler.onPress(k); },
    up(k) { if (held.delete(k)) handler.onRelease(k); }
  };
}
function engine() {
  function make(state) { return {
    advance(ms) { state.elapsed += ms; },
    press(key) { state.held = key; return { events: ['shot'] }; },
    release(key) { if (state.held === key) state.held = null; return { events: ['release'] }; },
    draw(fb) { fb.clear(); }, snapshot() { return { ...state }; }
  }; }
  return { create: () => make({ elapsed: 0, held: null }), restore: s => make({ ...s }) };
}

test('input, audio release, hidden clock and current saved state connect end to end', () => {
  const storage = memory(), pad = input(), doc = emitter({ visibilityState: 'visible' }), win = emitter();
  const sounds = [], events = []; let time = 0;
  const audio = { unlock: () => sounds.push('unlock'), keyDown: k => sounds.push('down:' + k),
    keyUp: k => sounds.push('up:' + k), stopAll: () => sounds.push('stop') };
  const app = App.create({ storage, input: pad, document: doc, window: win, engine: engine(), audio,
    now: () => time, onGameEvent: e => events.push(e) });
  pad.down('select'); pad.up('select');
  time = 100; pad.down('5');
  doc.visibilityState = 'hidden'; doc.fire('visibilitychange');
  assert.ok(sounds.includes('up:5'));
  assert.ok(sounds.includes('stop'));
  assert.deepEqual(events, ['shot', 'release']);
  assert.equal(app.phone.game.snapshot().held, null);
  assert.equal(app.phone.game.snapshot().elapsed, 100);
  time = 10000; app.frame();
  doc.visibilityState = 'visible'; doc.fire('visibilitychange');
  time += 16; app.frame(); time += 16; app.frame();
  assert.equal(app.phone.game.snapshot().elapsed, 116);
  app.stop();
  const nextPad = input();
  const restored = App.create({ storage, input: nextPad, document: doc, window: win, engine: engine(), now: () => time });
  assert.equal(restored.phone.entries()[0].id, 'continue');
  nextPad.down('select'); nextPad.up('select');
  assert.deepEqual(restored.phone.game.snapshot(), { elapsed: 116, held: null });
  restored.stop();
});

test('real keyboard adapter releases the game and key tone on pagehide and detaches on stop', () => {
  function target(extra) {
    const events = {};
    return Object.assign({
      addEventListener(k, f) { (events[k] ||= []).push(f); },
      removeEventListener(k, f) { events[k] = (events[k] || []).filter(x => x !== f); },
      fire(k, value) { for (const f of [...(events[k] || [])]) f(value); }
    }, extra);
  }
  const doc = target({ visibilityState: 'visible' }), win = target(), storage = memory();
  const oldDoc = globalThis.document, oldWin = globalThis.window, sounds = [];
  globalThis.document = doc; globalThis.window = win;
  const event = (key, code) => ({ key, code, preventDefault() { this.prevented = true; } });
  const audio = { unlock() {}, keyDown: k => sounds.push('down:' + k), keyUp: k => sounds.push('up:' + k), stopAll() {} };
  let app;
  try {
    app = App.create({ storage, input: Input, document: doc, window: win, engine: engine(), audio, now: () => 0 });
    doc.fire('keydown', event('Enter', 'Enter')); doc.fire('keyup', event('Enter', 'Enter'));
    doc.fire('keydown', event('1', 'Digit1'));
    assert.equal(app.phone.game.snapshot().held, '1');
    win.fire('pagehide');
    assert.equal(app.save.load().game.held, null);
    assert.ok(sounds.includes('up:1'));
    app.stop(); app = null;
    const after = event('1', 'Digit1'); doc.fire('keydown', after);
    assert.notEqual(after.prevented, true);
  } finally {
    if (app) app.stop();
    if (oldDoc === undefined) delete globalThis.document; else globalThis.document = oldDoc;
    if (oldWin === undefined) delete globalThis.window; else globalThis.window = oldWin;
  }
});
