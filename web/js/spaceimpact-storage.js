/* Browser persistence for Space Impact. Firmware game state is owned by the game engine;
 * this module only supplies isolated storage for settings, high score and its snapshot.
 */
(function (root) {
  'use strict';

  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var common = root.SnakeII || {};
  var Save = common.Save || (typeof require === 'function' ? require('./save.js') : null);
  var SETTINGS_KEY = 'spaceimpact.v1.settings';
  var SAVE_KEY = 'spaceimpact.v1.save';
  var KEY_SOUNDS_VERSION = 3;

  function defaultStorage() {
    try { return root.localStorage || null; } catch (ignore) { return null; }
  }

  function validScore(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function validLanguage(value) {
    return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 64);
  }

  function validSettings(value) {
    return !!value && typeof value === 'object' && validScore(value.top) &&
      typeof value.gameSounds === 'boolean' && typeof value.keyTones === 'boolean' &&
      typeof value.vibration === 'boolean' && validLanguage(value.language);
  }

  function createStore(storage) {
    if (storage === undefined) storage = defaultStorage();
    var data = { top: 0, gameSounds: true, keyTones: true, vibration: true, language: null };

    function copy(value) {
      return { top: value.top, gameSounds: value.gameSounds, keyTones: value.keyTones,
        vibration: value.vibration, language: value.language };
    }
    function persist() {
      try { if (storage) storage.setItem(SETTINGS_KEY, JSON.stringify({ top: data.top, gameSounds: data.gameSounds, keyTones: data.keyTones, vibration: data.vibration, language: data.language, keySounds: KEY_SOUNDS_VERSION })); } catch (ignore) {}
    }
    try {
      var raw = storage && storage.getItem(SETTINGS_KEY);
      if (raw) {
        var loaded = JSON.parse(raw);
        if (validSettings(loaded)) {
          data = copy(loaded);
          // Settings saved before the key sounds became soft clicks (on by default) get the new default once.
          if (loaded.keySounds !== KEY_SOUNDS_VERSION) data.keyTones = true;
        }
      }
    } catch (ignore) {}

    return {
      get top() { return data.top; },
      set top(value) { if (validScore(value)) { data.top = value; persist(); } },
      get gameSounds() { return data.gameSounds; },
      set gameSounds(value) { if (typeof value === 'boolean') { data.gameSounds = value; persist(); } },
      get keyTones() { return data.keyTones; },
      set keyTones(value) { if (typeof value === 'boolean') { data.keyTones = value; persist(); } },
      get vibration() { return data.vibration; },
      set vibration(value) { if (typeof value === 'boolean') { data.vibration = value; persist(); } },
      get language() { return data.language; },
      set language(value) { if (validLanguage(value)) { data.language = value; persist(); } },
      snapshot: function () { return copy(data); },
      restore: function (value) {
        if (!validSettings(value)) return false;
        data = copy(value); persist(); return true;
      }
    };
  }

  function createSave(storage) {
    if (!Save) throw new Error('The shared save module must be loaded before Space Impact storage');
    if (storage === undefined) storage = defaultStorage();
    return Save.create({ storage: storage, key: SAVE_KEY });
  }

  var api = { createStore: createStore, createSave: createSave, SETTINGS_KEY: SETTINGS_KEY, SAVE_KEY: SAVE_KEY };
  ns.Storage = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
