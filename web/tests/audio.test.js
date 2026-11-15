'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
require('../js/tones.js');
var Audio = require('../js/audio.js');

function FakeAudioContext() {
  this.currentTime = 10;
  this.destination = {};
  this.state = 'suspended';
  this.oscillators = [];
  this.gains = [];
    this.gainNodes = [];
  this.resumeCount = 0;
}
FakeAudioContext.prototype.resume = function () {
  this.resumeCount += 1;
  this.state = 'running';
  return Promise.resolve();
};
FakeAudioContext.prototype.createOscillator = function () {
  var oscillator = {
    type: '', frequency: { events: [], setValueAtTime: function (value, time) { this.events.push([value, time]); },
      exponentialRampToValueAtTime: function () {} },
    starts: [], stops: [], connections: [], disconnectCount: 0, onended: null,
    connect: function (node) { this.connections.push(node); },
    start: function (time) { this.starts.push(time); },
    stop: function (time) { this.stops.push(time); },
    disconnect: function () { this.disconnectCount += 1; }
  };
  this.oscillators.push(oscillator);
  return oscillator;
};
FakeAudioContext.prototype.createGain = function () {
  var gain = {
    events: [], cancelEvents: [],
    setValueAtTime: function (value, time) { this.events.push(['set', value, time]); },
    linearRampToValueAtTime: function (value, time) { this.events.push(['ramp', value, time]); },
    exponentialRampToValueAtTime: function (value, time) { this.events.push(['ramp', value, time]); },
    cancelScheduledValues: function (time) { this.cancelEvents.push(time); }
  };
  this.gains.push(gain);
  var gainNode = { gain: gain, connections: [], disconnectCount: 0,
    connect: function (node) { this.connections.push(node); },
    disconnect: function () { this.disconnectCount += 1; }
  };
  this.gainNodes.push(gainNode);
  return gainNode;
};

FakeAudioContext.prototype.sampleRate = 8000;
FakeAudioContext.prototype.createBuffer = function (channels, length) {
  var data = new Float32Array(length);
  return { length: length, getChannelData: function () { return data; } };
};
FakeAudioContext.prototype.createBufferSource = function () {
  var source = { starts: [], stops: [], connect: function () {}, disconnect: function () {},
    start: function (t) { this.starts.push(t); }, stop: function (t) { this.stops.push(t); } };
  (this.sources = this.sources || []).push(source);
  return source;
};
FakeAudioContext.prototype.createBiquadFilter = function () {
  return { type: '', frequency: { setValueAtTime: function () {} }, Q: { setValueAtTime: function () {} },
    connect: function () {}, disconnect: function () {} };
};

function contextFactory() {
  function Context() {
    FakeAudioContext.call(this);
    Context.last = this;
  }
  Context.prototype = Object.create(FakeAudioContext.prototype);
  Context.prototype.constructor = Context;
  return Context;
}

test('game scripts schedule tones at exact tick lengths and gaps', function () {
  var Context = contextFactory();
  var audio = Audio.create({ AudioContext: Context, settings: { gameSounds: true, keyTones: true } });
  var ctx;
  audio.unlock();
  ctx = Context.last;
  audio.playGame('eat');
  assert.equal(ctx.oscillators.length, 1);
  assert.equal(ctx.oscillators[0].type, 'square');
  assert.equal(ctx.oscillators[0].frequency.events[0][0], 2637);
  assert.equal(ctx.oscillators[0].starts[0], 10.005);
  assert.ok(Math.abs(ctx.oscillators[0].stops[0] - 10.01296875) < 1e-9);

  audio.playGame('crash');
  assert.equal(ctx.oscillators.length, 4);
  assert.deepEqual(ctx.oscillators.slice(1).map(function (osc) { return osc.frequency.events[0][0]; }), [440, 440, 440]);
  assert.ok(Math.abs(ctx.oscillators[2].starts[0] - ctx.oscillators[1].starts[0] - 0.031875) < 1e-9);
  assert.ok(Math.abs(ctx.oscillators[3].starts[0] - ctx.oscillators[1].starts[0] - 0.06375) < 1e-9);
  assert.ok(Math.abs(ctx.oscillators[1].stops[0] - ctx.oscillators[1].starts[0] - 0.0159375) < 1e-9);
});

test('injected Space Impact tones play their own scripts', function () {
  var Context = contextFactory();
  var tones = require('../js/spaceimpact-tones.js');
  var audio = Audio.create({ AudioContext: Context, settings: { gameSounds: true, keyTones: true }, gameTones: tones });
  audio.unlock();
  audio.playGame(24);
  assert.deepEqual(Context.last.oscillators.map(function (osc) { return osc.frequency.events[0][0]; }), [440, 466, 494, 523]);
  assert.ok(Math.abs(Context.last.oscillators[0].stops[0] - Context.last.oscillators[0].starts[0] - 0.03984375) < 1e-9);
  audio.playGame('eat');
  assert.equal(Context.last.oscillators.length, 4);
});

test('won script includes the silent gap in the second note start', function () {
  var Context = contextFactory();
  var audio = Audio.create({ AudioContext: Context, settings: { gameSounds: true } });
  audio.unlock();
  audio.playGame('won');
  assert.equal(Context.last.oscillators.length, 2);
  assert.deepEqual(Context.last.oscillators.map(function (osc) { return osc.frequency.events[0][0]; }), [523, 784]);
  assert.ok(Math.abs(Context.last.oscillators[0].stops[0] - Context.last.oscillators[0].starts[0] - 0.11953125) < 1e-9);
  assert.ok(Math.abs(Context.last.oscillators[1].starts[0] - Context.last.oscillators[0].starts[0] - 0.1434375) < 1e-9);
});

test('a key plays a short click on press and a different, quieter one on release', function () {
  var Context = contextFactory();
  var audio = Audio.create({ AudioContext: Context, settings: { keyTones: true } });
  audio.unlock();
  audio.keyDown('5');
  audio.keyDown('5');
  assert.equal(Context.last.sources.length, 1);
  assert.equal(Context.last.oscillators.length, 1);
  assert.ok(Context.last.oscillators[0].stops[0] - Context.last.oscillators[0].starts[0] < 0.09);
  audio.keyUp('5');
  assert.equal(Context.last.sources.length, 2);
  assert.equal(Context.last.oscillators.length, 2);
  audio.keyUp('5');
  audio.keyUp('not-pressed');
  assert.equal(Context.last.sources.length, 2);
});

test('a held key is silent after its click', function () {
  var Context = contextFactory();
  var audio = Audio.create({ AudioContext: Context, settings: { keyTones: true } });
  audio.unlock();
  audio.keyDown('8');
  var stop = Context.last.oscillators[0].stops[0];
  assert.ok(stop - Context.last.currentTime < 0.1);
});

test('key down and key up clicks rotate through variants', function () {
  var Context = contextFactory();
  var audio = Audio.create({ AudioContext: Context, settings: { keyTones: true } });
  var lengths = {};
  var i;
  audio.unlock();
  for (i = 0; i < 12; i += 1) { audio.keyDown('1'); audio.keyUp('1'); }
  Context.last.oscillators.forEach(function (osc, n) {
    var key = (n % 2 ? 'up' : 'down') + Math.round((osc.stops[0] - osc.starts[0]) * 1000);
    lengths[key] = true;
  });
  assert.ok(Object.keys(lengths).length >= 4);
});

test('settings are read at call time and disabled sounds allocate no nodes', function () {
  var Context = contextFactory();
  var settings = { gameSounds: false, keyTones: false };
  var audio = Audio.create({ AudioContext: Context, settings: settings });
  audio.unlock();
  audio.playGame('eat');
  audio.keyDown('1');
  audio.keyUp('1');
  assert.equal(Context.last.oscillators.length, 0);
  settings.gameSounds = true;
  settings.keyTones = true;
  audio.playGame('eat');
  audio.keyDown('1');
  assert.equal(Context.last.oscillators.length, 2);
});

test('unlock is idempotent and unsupported or throwing contexts stay silent', function () {
  var Context = contextFactory();
  var audio = Audio.create({ AudioContext: Context, settings: {} });
  audio.unlock();
  audio.unlock();
  assert.equal(Context.last.resumeCount, 1);
  assert.equal(audio.isSupported(), true);
  var unsupported = Audio.create({ AudioContext: null });
  assert.equal(unsupported.isSupported(), false);
  assert.doesNotThrow(function () { unsupported.unlock(); unsupported.playGame('eat'); unsupported.keyDown('1'); unsupported.keyUp('1'); unsupported.stopAll(); });
  var Broken = function () { throw new Error('unavailable'); };
  var broken = Audio.create({ AudioContext: Broken });
  assert.doesNotThrow(function () { broken.unlock(); broken.playGame('eat'); broken.keyDown('1'); broken.keyUp('1'); broken.stopAll(); });
});

test('a new game tone cancels the previous voice and stopAll forgets pressed keys', function () {
  var Context = contextFactory();
  var audio = Audio.create({ AudioContext: Context, settings: { gameSounds: true, keyTones: true } });
  audio.unlock();
  audio.playGame('won');
  var first = Context.last.oscillators.slice(0);
  audio.playGame('eat');
  assert.deepEqual(first.map(function (osc) { return osc.stops[1]; }), [10.006, 10.006]);
  assert.ok(Context.last.gains[0].cancelEvents.length > 0);
  audio.keyDown('2');
  audio.stopAll();
  var count = Context.last.sources.length;
  audio.keyUp('2');
  assert.equal(Context.last.sources.length, count);
});

test('finished game voices disconnect their nodes', function () {
  var Context = contextFactory();
  var audio = Audio.create({ AudioContext: Context, settings: { gameSounds: true } });
  audio.unlock();
  audio.playGame('eat');
  Context.last.oscillators[0].onended();
  assert.equal(Context.last.oscillators[0].disconnectCount, 1);
  assert.equal(Context.last.gainNodes[0].disconnectCount, 1);
});
