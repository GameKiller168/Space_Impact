'use strict';

require('./support/locale.js');

/*
 * The notes of the phone around the game (game over, top score, you won) and the firmware texts they use.
 * The texts are the ones of the v6.39 PPM B text table: ids 537, 576, 578, 579 and 1332.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Phone = require('../js/spaceimpact-phone.js');
const Texts = require('../js/spaceimpact-texts.js');
const Storage = require('../js/spaceimpact-storage.js');

function adapter(result) {
  return { create() {
    let ticks = 0;
    return { advance() { ticks += 1; return ticks >= 3 ? result : null; }, press() {}, draw(fb) { fb.clear(); }, snapshot() { return { ticks }; } };
  }, restore() { return null; } };
}
function play(result, language) {
  const store = Storage.createStore(null);
  store.language = language || 'en';
  const phone = new Phone({ engine: adapter(result), store });
  phone.press('select');
  for (let i = 0; i < 3; i++) phone.advance(100);
  return phone;
}

test('the firmware labels of the five PPM B languages are the phone\'s own words', () => {
  assert.equal(Texts.label('NEW_GAME', 'en'), 'New game');
  assert.equal(Texts.label('NEW_GAME', 'de'), 'Neues Spiel');
  assert.equal(Texts.label('TOP_SCORE', 'fr'), 'Meilleur score');
  assert.equal(Texts.label('GAME_OVER_SCORE', 'it'), 'Finito!\nPunteggio:\n%N');
  assert.equal(Texts.label('YOU_WON', 'nl'), 'Game over!\nU HEBT\nGEWONNEN!');
  assert.equal(Texts.label('NEW_GAME', 'hu'), null, 'languages that are not decoded fall back to the page\'s own labels');
});

test('the instruction text is the firmware\'s where the language section reads back, English otherwise', () => {
  assert.match(Texts.instructions('en'), /^Use your weapons to survive attacks\./);
  assert.match(Texts.instructions('hu'), /^Fegyverekkel védekezzen a támadások ellen!/);
  assert.match(Texts.instructions('hu-HU'), /bonusz fegyvereket\.$/);
  assert.match(Texts.instructions('ru'), /^Отражать атаки/);
  assert.equal(Texts.instructions('xx'), Texts.instructions('en'));
  for (const language of Texts.instructionLanguages) assert.match(Texts.instructions(language), /[8] .*[0]/);
});

test('a lost game shows the game-over note with the new top score and then the menu again', () => {
  const phone = play({ ended: true, score: 120 });
  assert.equal(phone.mode, 'note');
  assert.equal(phone.note.key, 'GAME_OVER_TOP', 'a first score above the stored top score is a new top score');
  assert.equal(phone.t(phone.note.key, phone.note.params), 'Game over!\nTOP SCORE:\n120');
  assert.equal(phone.store.top, 120);
  phone.press('select');
  assert.equal(phone.mode, 'menu');
  assert.equal(phone.kind, 'main');
});

test('a score below the top score shows the plain score note', () => {
  const store = Storage.createStore(null);
  store.top = 500;
  const phone = new Phone({ engine: adapter({ ended: true, score: 90 }), store });
  phone.press('select');
  for (let i = 0; i < 3; i++) phone.advance(100);
  assert.equal(phone.note.key, 'GAME_OVER_SCORE');
  assert.equal(phone.store.top, 500);
});

test('a won game shows the won note first, then the score; a note leaves by itself after 3070 ms', () => {
  const phone = play({ ended: true, score: 4000, won: true }, 'de');
  assert.equal(phone.t(phone.note.key), 'Spiel zu Ende:\nGewonnen!');
  phone.advance(3069);
  assert.equal(phone.mode, 'note');
  assert.equal(phone.note.key, 'YOU_WON');
  phone.advance(2);
  assert.equal(phone.mode, 'note');
  assert.equal(phone.note.key, 'GAME_OVER_TOP');
  assert.equal(phone.t(phone.note.key, phone.note.params), 'Spielende.\nREKORD!\n4000');
  phone.advance(3070);
  assert.equal(phone.mode, 'menu');
});

test('the top score entry shows the stored score in a note', () => {
  const store = Storage.createStore(null);
  store.top = 42;
  store.language = 'fr';
  const phone = new Phone({ engine: adapter(null), store });
  phone.press('scrollDown');
  phone.press('select');
  assert.equal(phone.mode, 'note');
  assert.equal(phone.t(phone.note.key, phone.note.params), 'Meilleur score:\n42');
  phone.press('2');
  assert.equal(phone.mode, 'menu');
});

test('every note can be drawn in every language of the page without an error, and it puts pixels on the display', () => {
  const I18n = require('../js/i18n.js');
  for (const { code } of I18n.LANGUAGES) {
    for (const [key, params] of [['TOP_SCORE_NOTE', { n: 1234 }], ['GAME_OVER_TOP', { n: 99 }], ['GAME_OVER_SCORE', { n: 7 }], ['YOU_WON', undefined]]) {
      const store = Storage.createStore(null);
      store.language = code;
      const phone = new Phone({ engine: adapter(null), store });
      phone.showNotes([{ key, params }]);
      const fb = phone.draw();
      let lit = 0;
      for (let y = 0; y < 48; y++) for (let x = 0; x < 84; x++) if (fb.get(x, y)) lit += 1;
      assert.ok(lit > 40, `${code} ${key}: ${lit} pixels`);
    }
  }
});
