'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Save = require('../js/save.js');

function memoryStorage() {
  var values = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = value; },
    removeItem: function (key) { delete values[key]; }
  };
}

test('save wraps snapshots, rejects bad versions and tolerates storage errors', function () {
  var storage = memoryStorage();
  var save = Save.create({ storage: storage, key: 'unit' });
  var snap = { hello: [1, 2] };
  save.write(snap);
  assert.deepEqual(save.load(), snap);
  storage.setItem('unit', '{');
  assert.equal(save.load(), null);
  storage.setItem('unit', JSON.stringify({ v: 9, phone: snap }));
  assert.equal(save.load(), null);
  var bad = { setItem: function () { throw new Error('quota'); }, getItem: function () { throw new Error('blocked'); }, removeItem: function () { throw new Error('blocked'); } };
  assert.doesNotThrow(function () { var x = Save.create({ storage: bad }); x.write(snap); x.load(); x.clear(); });
});

test('autosave coalesces writes and flushes immediately', function () {
  var clock = 0, jobs = [], writes = [];
  function setTimeoutFake(fn, ms) { var job = { fn: fn, due: clock + ms, dead: false }; jobs.push(job); return job; }
  function clearTimeoutFake(job) { job.dead = true; }
  function advance(ms) {
    clock += ms;
    var run;
    do {
      run = null;
      for (var i = 0; i < jobs.length; i++) if (!jobs[i].dead && jobs[i].due <= clock) { run = jobs[i]; break; }
      if (run) { run.dead = true; run.fn(); }
    } while (run);
  }
  var phone = { mode: 'menu', inGame: function () { return this.mode === 'game'; }, snapshot: function () { return { t: clock }; } };
  var save = { write: function (s) { writes.push({ at: clock, snap: s }); } };
  var auto = Save.autosave({ phone: phone, save: save, now: function () { return clock; }, setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake });
  auto.touch(); auto.touch(); advance(0); assert.equal(writes.length, 1);
  auto.touch(); advance(499); assert.equal(writes.length, 1);
  advance(1); assert.equal(writes.length, 2);
  auto.touch(); advance(200); auto.flush(); assert.equal(writes.length, 3);
  auto.stop();
});
