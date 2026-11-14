'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Tones = require('../js/spaceimpact-tones.js');

// Original script bytes and the corresponding firmware pitch-table values.
const scripts = {
  23: '00098802a302a302a3028902a302a302a3028a02a302a302a3020b',
  24: '00097c057d057e057f050b',
  25: '0009a302a302a302a302a202a102a0029f029e029d029c029b020b',
  26: '000990028a029002890290028802920287029002860290028502900284029002830290028202900281020b'
};
const pitch = { 0x7c: 440, 0x7d: 466, 0x7e: 494, 0x7f: 523, 0x81: 587, 0x82: 622,
  0x83: 659, 0x84: 698, 0x85: 740, 0x86: 784, 0x87: 831, 0x88: 880, 0x89: 932,
  0x8a: 988, 0x90: 1397, 0x92: 1568, 0x9b: 2637, 0x9c: 2794, 0x9d: 2960,
  0x9e: 3136, 0x9f: 3322, 0xa0: 3520, 0xa1: 3729, 0xa2: 3951, 0xa3: 4186 };

test('Space Impact tone segments reproduce the firmware scripts', () => {
  assert.equal(Tones.TICK_MS, 7.96875);
  for (const [code, raw] of Object.entries(scripts)) {
    const bytes = Buffer.from(raw, 'hex'), expected = [];
    assert.equal(bytes[0], 0); assert.equal(bytes[1], 9); assert.equal(bytes.at(-1), 11);
    for (let i = 2; i < bytes.length - 1; i += 2) {
      assert.notEqual(pitch[bytes[i]], undefined, `pitch ${bytes[i]} in ${code}`);
      expected.push([pitch[bytes[i]], bytes[i + 1]]);
    }
    assert.equal(Tones.GAME[code].code, Number(code));
    assert.deepEqual(Tones.GAME[code].segments, expected);
  }
});
