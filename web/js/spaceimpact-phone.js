/* Space Impact phone shell. The game is an injected adapter; no game rules live here.
 * adapter.create() and adapter.restore(snapshot) return a game with advance(ms), press(key),
 * draw(framebuffer) and snapshot(). A game may return { ended: true, score: n } from either
 * advance, press or release, and may include an events array for the host's audio/haptics.
 * The host should connect onChange to the shared autosave scheduler.
 */
(function (root) {
  'use strict';
  var common = (root.SnakeII = root.SnakeII || {});
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var req = typeof require === 'function';
  var Screens = common.Screens || (req ? require('./screens.js') : null);
  var I18n = common.I18n || (req ? require('./i18n.js') : null);
  var Text = common.Text || (req ? require('./text.js') : null);
  var Framebuffer = common.Framebuffer || (req ? require('./framebuffer.js') : null);
  var Storage = ns.Storage || (req ? require('./spaceimpact-storage.js') : null);

  function validGame(g) {
    return !!g && typeof g.advance === 'function' && typeof g.press === 'function' &&
      typeof g.draw === 'function' && typeof g.snapshot === 'function';
  }

  function Phone(options) {
    options = options || {};
    this.engine = options.engine || null;
    this.store = options.store || Storage.createStore(null);
    this.instructions = options.instructions || null;
    this.onChange = options.onChange || null;
    this.onLanguageChange = options.onLanguageChange || null;
    this.onEvent = options.onEvent || null;
    this.fb = new Framebuffer(84, 48);
    this.mode = 'menu'; this.kind = 'main'; this.game = null; this.paused = false;
    this.visible = true; this.skipNextAdvance = false; this.held = new Set();
    this.states = { main: { s: 0, c: 0 }, options: { s: 0, c: 0 }, language: { s: 0, c: 0 } };
    this.page = 0;
    if (options.save) {
      var saved = options.save.load();
      // Settings are written separately on each change and can be newer than the last game snapshot.
      if (saved) this.restore(saved, { restoreSettings: false });
    }
  }
  Phone.prototype.t = function (key, params) { return I18n.text(key, this.store.language, params); };
  Phone.prototype.changed = function () { try { if (typeof this.onChange === 'function') this.onChange(); } catch (ignore) {} };
  Phone.prototype.inGame = function () { return this.mode === 'game' && this.visible; };
  Phone.prototype.entries = function () {
    if (this.kind === 'language') {
      return [{ id: null, label: this.t('SYSTEM') }].concat(I18n.LANGUAGES.map(function (l) { return { id: l.code, label: l.name }; }));
    }
    if (this.kind === 'options') {
      return [
        { id: 'gameSounds', label: this.t('GAME_SOUNDS'), value: this.t(this.store.gameSounds ? 'ON' : 'OFF') },
        { id: 'keyTones', label: this.t('KEY_TONES'), value: this.t(this.store.keyTones ? 'ON' : 'OFF') },
        { id: 'vibration', label: this.t('VIBRATION'), value: this.t(this.store.vibration ? 'ON' : 'OFF') },
        { id: 'language', label: this.t('LANGUAGE'), value: this.store.language ? this.store.language.toUpperCase() : this.t('SYSTEM') }
      ];
    }
    var out = [];
    if (this.game && this.paused) out.push({ id: 'continue', label: this.t('CONTINUE') });
    out.push({ id: 'newGame', label: this.t('NEW_GAME') }, { id: 'topScore', label: this.t('TOP_SCORE') },
      { id: 'instructions', label: this.t('INSTRUCTIONS') }, { id: 'options', label: this.t('OPTIONS') });
    return out;
  };
  Phone.prototype.showMenu = function (kind) {
    this.mode = 'menu'; this.kind = kind;
    Screens.fit(this.states[kind], this.entries().length);
  };
  Phone.prototype.select = function () {
    var entry = this.entries()[this.states[this.kind].c];
    if (this.kind === 'language') {
      this.store.language = entry.id;
      this.showMenu('options');
      try { if (typeof this.onLanguageChange === 'function') this.onLanguageChange(I18n.resolve(this.store.language)); } catch (ignore) {}
    } else if (this.kind === 'options') {
      if (entry.id === 'language') {
        var index = I18n.LANGUAGES.findIndex(function (l) { return l.code === this.store.language; }, this);
        this.states.language = { s: Math.max(0, index + 1), c: Math.max(0, index + 1) };
        this.showMenu('language');
      } else this.store[entry.id] = !this.store[entry.id];
    } else if (entry.id === 'options') this.showMenu('options');
    else if (entry.id === 'topScore') this.mode = 'topScore';
    else if (entry.id === 'instructions') {
      if (typeof this.instructions !== 'function' || !this.instructions(this.store.language)) return 'instructions';
      this.page = 0; this.mode = 'instructions';
    } else if (entry.id === 'continue') { this.paused = false; this.mode = 'game'; }
    else if (entry.id === 'newGame') {
      if (!this.engine || typeof this.engine.create !== 'function') return 'newGameUnavailable';
      var game = this.engine.create();
      if (!validGame(game)) return 'newGameUnavailable';
      this.game = game; this.paused = false; this.held.clear(); this.mode = 'game';
    }
    this.changed();
    return entry.id;
  };
  Phone.prototype.result = function (result) {
    if (!result) return;
    if (Array.isArray(result.events) && typeof this.onEvent === 'function') {
      for (var i = 0; i < result.events.length; i++) {
        try { this.onEvent(result.events[i]); } catch (ignore) {}
      }
    }
    if (result.ended !== true) return;
    if (Number.isSafeInteger(result.score) && result.score >= 0 && result.score > this.store.top) this.store.top = result.score;
    this.game = null; this.paused = false; this.held.clear(); this.showMenu('main');
  };
  Phone.prototype.press = function (key) {
    if (!this.visible) return;
    if (this.mode === 'game') {
      if (key === 'c') {
        this.releaseHeld();
        if (this.game) { this.paused = true; this.showMenu('main'); }
      } else { this.held.add(key); this.result(this.game.press(key)); }
      this.changed(); return;
    }
    if (this.mode === 'topScore') { this.showMenu('main'); return; }
    if (this.mode === 'instructions') {
      if (key === 'c') this.showMenu('main');
      else if (key === 'select') this.page = (this.page + 1) % Screens.instructionPages(this.instructions(this.store.language)).length;
      return;
    }
    if (key === 'scrollUp' || key === 'scrollDown') Screens.moveCursor(this.states[this.kind], this.entries().length, key === 'scrollUp' ? -1 : 1);
    else if (key === 'select') return this.select();
    else if (key === 'c' && this.kind !== 'main') this.showMenu(this.kind === 'language' ? 'options' : 'main');
  };
  Phone.prototype.release = function (key) {
    var held = this.held.delete(key);
    if (held && this.game && typeof this.game.release === 'function') {
      this.result(this.game.release(key)); this.changed();
    }
  };
  Phone.prototype.releaseHeld = function () {
    var keys = Array.from(this.held);
    this.held.clear();
    for (var i = 0; i < keys.length && this.game; i++) {
      if (typeof this.game.release === 'function') this.result(this.game.release(keys[i]));
    }
  };
  // The host calls this on visibilitychange. Drop the first elapsed delta after returning,
  // since it may contain time spent in a hidden tab.
  Phone.prototype.setVisible = function (visible) {
    visible = !!visible;
    if (this.visible === visible) return;
    this.visible = visible;
    if (!visible) { this.releaseHeld(); this.changed(); }
    else this.skipNextAdvance = true;
  };
  Phone.prototype.advance = function (ms) {
    if (!this.visible) return;
    if (this.skipNextAdvance) { this.skipNextAdvance = false; return; }
    if (this.inGame() && Number.isFinite(ms) && ms > 0) { this.result(this.game.advance(ms)); this.changed(); }
  };
  Phone.prototype.snapshot = function () {
    return { version: 1, settings: this.store.snapshot(), game: this.game ? this.game.snapshot() : null };
  };
  Phone.prototype.restore = function (snapshot, options) {
    options = options || {};
    if (!snapshot || snapshot.version !== 1 || !snapshot.settings || !Object.prototype.hasOwnProperty.call(snapshot, 'game')) return false;
    var game = null;
    try {
      if (snapshot.game !== null) {
        if (!this.engine || typeof this.engine.restore !== 'function') return false;
        game = this.engine.restore(snapshot.game);
        if (!validGame(game)) return false;
      }
      if (!Storage.createStore(null).restore(snapshot.settings)) return false;
      if (options.restoreSettings !== false && !this.store.restore(snapshot.settings)) return false;
    } catch (ignore) { return false; }
    this.game = game; this.paused = !!game; this.held.clear(); this.showMenu('main');
    return true;
  };
  Phone.prototype.draw = function () {
    Text.setFontPack(I18n.fontPack(this.store.language));
    if (this.mode === 'game') { this.game.draw(this.fb); return this.fb; }
    if (this.mode === 'topScore') return Screens.drawNote(this.fb, Screens.noteLines(this.t('TOP_SCORE_NOTE', { n: this.store.top })));
    if (this.mode === 'instructions') return Screens.drawInstructions(this.fb, this.page, this.instructions(this.store.language), this.t('NEXT'), I18n.resolve(this.store.language) !== 'en');
    var entries = this.entries(), state = this.states[this.kind];
    return Screens.drawMenu(this.fb, { items: entries.map(function (e) { return e.label; }),
      values: entries.map(function (e) { return e.value || ''; }), s: state.s, c: state.c, header: '', softKey: this.t('SELECT') });
  };
  ns.Phone = Phone;
  if (typeof module === 'object' && module.exports) module.exports = Phone;
})(typeof globalThis !== 'undefined' ? globalThis : this);
