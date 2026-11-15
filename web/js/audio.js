(function () {
  'use strict';

  var NS = (globalThis.SnakeII = globalThis.SnakeII || {});
  var Tones = NS.Tones;
  var GAME_GAIN = 0.2; // This peak level is an estimate, not firmware data.
  var KEY_GAIN = 0.4; // Click levels are estimates, not firmware data.
  // Measured on a recording of a real Nokia keypad: the click peaks within ~2 ms and falls to
  // 10% in ~12 ms. A key-down is a snap (body ~300 Hz, mid noise ~800 Hz, a little 3-4 kHz); a
  // key-up is a softer thump (body ~225 Hz, mostly low). Each spec has a falling sine body and
  // noise bands [centre Hz, Q, level]. Four down and three up variants vary around those values.
  var CLICK_DOWN = [
    { bodyHz: 280, body: 1.0, bodyMs: 52, noiseMs: 22, bands: [[650, 0.7, 0.3], [2400, 0.7, 0.09]] },
    { bodyHz: 260, body: 1.05, bodyMs: 56, noiseMs: 24, bands: [[600, 0.7, 0.28], [2200, 0.7, 0.08]] },
    { bodyHz: 300, body: 0.95, bodyMs: 48, noiseMs: 20, bands: [[720, 0.7, 0.3], [2600, 0.7, 0.1]] },
    { bodyHz: 275, body: 1.0, bodyMs: 53, noiseMs: 22, bands: [[630, 0.7, 0.29], [2300, 0.7, 0.09]] }
  ];
  var CLICK_UP = [
    { bodyHz: 215, body: 0.85, bodyMs: 54, noiseMs: 18, bands: [[650, 0.7, 0.12], [2400, 0.7, 0.04]] },
    { bodyHz: 200, body: 0.9, bodyMs: 58, noiseMs: 20, bands: [[600, 0.7, 0.11], [2200, 0.7, 0.04]] },
    { bodyHz: 230, body: 0.8, bodyMs: 50, noiseMs: 16, bands: [[720, 0.7, 0.13], [2600, 0.7, 0.04]] }
  ];
  var GAME_ENVELOPE = 0.0003;
  var START_AHEAD = 0.005;

  function create(options) {
    options = options || {};
    var Context = options.AudioContext;
    if (typeof Context !== 'function') Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    var settings = options.settings || {};
    // The keypad DTMF table is shared, while game-event scripts are specific to each game.
    var gameTones = options.gameTones || Tones;
    var ctx = null;
    var unlocked = false;
    var gameVoice = null;
    var pressed = {};
    var noise = null;
    var downVariant = 0;
    var upVariant = 0;

    function isSupported() {
      return typeof Context === 'function';
    }

    function disconnect(node) {
      try {
        if (node && node.disconnect) node.disconnect();
      } catch (ignore) {}
    }

    function cleanupVoice(voice) {
      var i;
      if (!voice || voice.cleaned) return;
      voice.cleaned = true;
      for (i = 0; i < voice.nodes.length; i += 1) disconnect(voice.nodes[i]);
      if (gameVoice === voice) gameVoice = null;
    }

    function ended(voice) {
      voice.endedCount += 1;
      if (voice.endedCount >= voice.oscillators.length) cleanupVoice(voice);
    }

    function unlock() {
      var result;
      if (!isSupported()) return;
      try {
        if (!ctx) ctx = new Context();
        if (!ctx) return;
        unlocked = true;
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          result = ctx.resume();
          if (result && typeof result.then === 'function') result.then(function () {}, function () {});
        }
      } catch (ignore) {
        ctx = null;
        unlocked = false;
      }
    }

    function ready() {
      return !!(isSupported() && unlocked && ctx);
    }

    function cancelGame() {
      var voice = gameVoice;
      var now;
      var i;
      if (!voice || !ctx) return;
      try {
        now = ctx.currentTime;
        for (i = 0; i < voice.oscillators.length; i += 1) {
          var osc = voice.oscillators[i];
          var gain = voice.gains[i].gain;
          gain.cancelScheduledValues(now);
          gain.setValueAtTime(GAME_GAIN, now);
          gain.linearRampToValueAtTime(0, now + 0.005);
          osc.stop(now + 0.006);
        }
      } catch (ignore) {}
      gameVoice = null;
    }

    function playGame(name) {
      var tone;
      var voice;
      var start;
      var cursor;
      var i;
      if (!ready()) return;
      try {
        if (!settings.gameSounds) return;
        tone = gameTones && gameTones.GAME && gameTones.GAME[name];
        if (!tone) return;
        cancelGame();
        voice = { oscillators: [], gains: [], nodes: [], key: null, cleaned: false, endedCount: 0 };
        gameVoice = voice;
        start = ctx.currentTime + START_AHEAD;
        cursor = start;
        for (i = 0; i < tone.segments.length; i += 1) {
          var segment = tone.segments[i];
          var frequency = segment[0];
          var duration = segment[1] * gameTones.TICK_MS / 1000;
          var end = cursor + duration;
          if (frequency) {
            var oscillator = ctx.createOscillator();
            var gainNode = ctx.createGain();
            var attack = Math.min(GAME_ENVELOPE, duration / 2);
            var release = Math.min(GAME_ENVELOPE, duration / 2);
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(frequency, cursor);
            gainNode.gain.setValueAtTime(0, cursor);
            gainNode.gain.linearRampToValueAtTime(GAME_GAIN, cursor + attack);
            gainNode.gain.setValueAtTime(GAME_GAIN, end - release);
            gainNode.gain.linearRampToValueAtTime(0, end);
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            voice.oscillators.push(oscillator);
            voice.gains.push(gainNode);
            voice.nodes.push(oscillator, gainNode);
            oscillator.onended = (function (v) {
              return function () { ended(v); };
            })(voice);
            oscillator.start(cursor);
            oscillator.stop(end);
          }
          cursor = end;
        }
        if (!voice.oscillators.length) cleanupVoice(voice);
      } catch (ignore) {
        if (gameVoice) cleanupVoice(gameVoice);
        gameVoice = null;
      }
    }

    // Key sounds are short mechanical clicks instead of held DTMF beeps: a different
    // click when the key goes down and when it comes back up, several variants of each,
    // with a little random pitch and level so repeated presses do not sound identical.
    function noiseBuffer() {
      var length;
      var data;
      var i;
      if (noise) return noise;
      length = Math.max(1, Math.floor(ctx.sampleRate * 0.05));
      noise = ctx.createBuffer(1, length, ctx.sampleRate);
      data = noise.getChannelData(0);
      for (i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return noise;
    }

    function click(phoneKey, variant, down) {
      var t = ctx.currentTime + START_AHEAD;
      var keyShift = 1 + (phoneKey.length === 1 && phoneKey >= '0' && phoneKey <= '9' ? (phoneKey.charCodeAt(0) - 52) * 0.012 : 0);
      var jitter = (0.94 + Math.random() * 0.12) * keyShift;
      var level = (down ? 1 : 0.65) * (0.9 + Math.random() * 0.2) * KEY_GAIN;
      var spec = (down ? CLICK_DOWN : CLICK_UP)[variant];
      var voice = { key: null, oscillators: [], gains: [], nodes: [], cleaned: false, endedCount: 0 };
      var source = ctx.createBufferSource();
      var body = ctx.createOscillator();
      var bodyGain = ctx.createGain();
      var i;
      source.buffer = noiseBuffer();
      voice.nodes.push(source);
      for (i = 0; i < spec.bands.length; i += 1) {
        var filter = ctx.createBiquadFilter();
        var noiseGain = ctx.createGain();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(spec.bands[i][0] * jitter, t);
        if (filter.Q) filter.Q.setValueAtTime(spec.bands[i][1], t);
        noiseGain.gain.setValueAtTime(0.0001, t);
        noiseGain.gain.linearRampToValueAtTime(level * spec.bands[i][2], t + 0.002);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + spec.noiseMs / 1000);
        source.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        voice.nodes.push(filter, noiseGain);
      }
      body.type = 'sine';
      body.frequency.setValueAtTime(spec.bodyHz * jitter, t);
      body.frequency.exponentialRampToValueAtTime(spec.bodyHz * jitter * 0.7, t + spec.bodyMs / 1000);
      bodyGain.gain.setValueAtTime(0.0001, t);
      bodyGain.gain.linearRampToValueAtTime(level * spec.body, t + 0.002);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + spec.bodyMs / 1000);
      body.connect(bodyGain);
      bodyGain.connect(ctx.destination);
      voice.oscillators.push(body);
      voice.gains.push(bodyGain);
      voice.nodes.push(body, bodyGain);
      body.onended = function () { ended(voice); };
      source.start(t);
      source.stop(t + spec.noiseMs / 1000 + 0.01);
      body.start(t);
      body.stop(t + spec.bodyMs / 1000 + 0.01);
    }

    function keyDown(phoneKey) {
      if (!ready() || pressed[phoneKey]) return;
      try {
        if (!settings.keyTones) return;
        pressed[phoneKey] = true;
        downVariant = (downVariant + 1 + Math.floor(Math.random() * (CLICK_DOWN.length - 1))) % CLICK_DOWN.length;
        click(phoneKey, downVariant, true);
      } catch (ignore) {}
    }

    function keyUp(phoneKey) {
      if (!pressed[phoneKey]) return;
      delete pressed[phoneKey];
      if (!ready()) return;
      try {
        if (!settings.keyTones) return;
        upVariant = (upVariant + 1 + Math.floor(Math.random() * (CLICK_UP.length - 1))) % CLICK_UP.length;
        click(phoneKey, upVariant, false);
      } catch (ignore) {}
    }

    function stopAll() {
      if (!ready()) return;
      try { cancelGame(); } catch (ignore) {}
      pressed = {};
    }

    return {
      isSupported: isSupported,
      unlock: unlock,
      playGame: playGame,
      keyDown: keyDown,
      keyUp: keyUp,
      stopAll: stopAll
    };
  }

  var Audio = { create: create };
  NS.Audio = Audio;
  if (typeof module === 'object' && module.exports) module.exports = Audio;
})();
