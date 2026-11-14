/* Wiring for the Space Impact shell. The game engine, its event sounds, and the
 * LCD painter are supplied by the host. This file does not start an application. */
(function (root) {
  'use strict';
  var common = (root.SnakeII = root.SnakeII || {});
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var req = typeof require === 'function';
  var Storage = ns.Storage || (req ? require('./spaceimpact-storage.js') : null);
  var Phone = ns.Phone || (req ? require('./spaceimpact-phone.js') : null);
  var Save = common.Save || (req ? require('./save.js') : null);
  var Input = common.Input || (req ? require('./input.js') : null);

  function defaultStorage() { try { return root.localStorage || null; } catch (ignore) { return null; } }
  function invoke(obj, name, arg) {
    try { if (obj && typeof obj[name] === 'function') obj[name](arg); } catch (ignore) {}
  }

  function create(options) {
    options = options || {};
    var storage = options.storage === undefined ? defaultStorage() : options.storage;
    var save = options.save || Storage.createSave(storage);
    var store = options.store || Storage.createStore(storage);
    var phone = options.phone || new Phone({ engine: options.engine, instructions: options.instructions, store: store, save: save });
    var autosave = options.autosave || Save.autosave({ phone: phone, save: save });
    var input = options.input || Input, audio = options.audio || null;
    var doc = options.document || root.document, win = options.window || root;
    var now = options.now || function () { return root.performance.now(); };
    var paint = options.paint || function () {};
    var last = now(), maxStep = 250, stopped = false;
    var previousChange = phone.onChange, previousEvent = phone.onEvent;
    phone.onChange = function () { autosave.touch(); if (typeof previousChange === 'function') previousChange(); };
    phone.onEvent = function (event) {
      try { if (typeof previousEvent === 'function') previousEvent(event); } catch (ignore) {}
      try { if (typeof options.onGameEvent === 'function') options.onGameEvent(event, phone.store); } catch (ignore) {}
    };
    function sync() {
      var t = now(), delta = Math.max(0, Math.min(maxStep, t - last));
      last = t;
      phone.advance(delta);
    }
    var inputHandle = input.attach({
      pad: options.pad || null,
      inGame: function () { return phone.inGame(); },
      onPress: function (key) {
        if (stopped) return;
        sync();
        if (!phone.visible) return;
        invoke(audio, 'unlock'); invoke(audio, 'keyDown', key);
        phone.press(key); paint(phone.draw());
      },
      onRelease: function (key) {
        if (stopped) return;
        sync(); phone.release(key); invoke(audio, 'keyUp', key); paint(phone.draw());
      }
    });
    function visibility() {
      if (stopped) return;
      var visible = !doc || doc.visibilityState !== 'hidden';
      sync();
      if (!visible) {
        if (inputHandle && typeof inputHandle.releaseAll === 'function') inputHandle.releaseAll();
        phone.setVisible(false); autosave.flush(); invoke(audio, 'stopAll');
      } else phone.setVisible(true);
      last = now();
    }
    function pagehide() {
      if (stopped) return;
      sync();
      if (inputHandle && typeof inputHandle.releaseAll === 'function') inputHandle.releaseAll();
      phone.setVisible(false); autosave.flush(); invoke(audio, 'stopAll');
    }
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', visibility);
    if (win && win.addEventListener) {
      win.addEventListener('pagehide', pagehide);
      win.addEventListener('pageshow', visibility);
    }
    if (doc && doc.visibilityState === 'hidden') phone.setVisible(false);
    return {
      phone: phone, save: save,
      frame: function () { if (!stopped) { sync(); paint(phone.draw()); } },
      flush: function () { if (!stopped) autosave.flush(); },
      stop: function () {
        if (stopped) return;
        if (inputHandle && typeof inputHandle.detach === 'function') inputHandle.detach();
        else if (inputHandle && typeof inputHandle.releaseAll === 'function') inputHandle.releaseAll();
        autosave.flush(); autosave.stop(); invoke(audio, 'stopAll');
        stopped = true;
        phone.onChange = previousChange; phone.onEvent = previousEvent;
        if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', visibility);
        if (win && win.removeEventListener) { win.removeEventListener('pagehide', pagehide); win.removeEventListener('pageshow', visibility); }
      }
    };
  }
  ns.App = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = ns.App;
})(typeof globalThis !== 'undefined' ? globalThis : this);
