/*
 * Maps browser input to Nokia keys. The game's keypad mapping is taken from the English v6.39 Space Impact
 * instruction string: 8 / 0 move vertically, # / * move forward / backward, 1 / 3 fire, and 4 / 6 use
 * bonus weapons. PC keyboard shortcuts are only browser conveniences and are not shown in the phone UI.
 */
(function () {
  'use strict';

  var NS = (globalThis.SnakeII = globalThis.SnakeII || {});
  var ARROW_IN_GAME = {
    ArrowUp: '8', ArrowDown: '0', ArrowLeft: '*', ArrowRight: '#',
    w: '8', s: '0', a: '*', d: '#'
  };
  var SCROLL = { ArrowUp: 'scrollUp', ArrowDown: 'scrollDown', w: 'scrollUp', s: 'scrollDown' };
  var FUNCTION = { Enter: 'select', Backspace: 'c', Escape: 'c', c: 'c' };
  var NUMPAD = {
    Numpad8: '8', Numpad2: '0', Numpad4: '*', Numpad6: '#',
    Numpad5: 'fireMain', Numpad0: 'fireBonus', NumpadEnter: 'select'
  };
  var WASD = { KeyW: '8', KeyS: '0', KeyA: '*', KeyD: '#' };
  var EXTRA = { Space: 'fireMain', ShiftLeft: 'fireBonus', ShiftRight: 'fireBonus' };

  function keyFor(key, inGame) {
    var k = key.length === 1 ? key.toLowerCase() : key;
    if (inGame) {
      if (ARROW_IN_GAME[k]) return ARROW_IN_GAME[k];
      if ((k >= '0' && k <= '9') || k === '*' || k === '#') return k;
      if (k === ' ') return 'fireMain';
      if (k === 'Shift') return 'fireBonus';
    } else if (SCROLL[k]) return SCROLL[k];
    if (k === ' ') return inGame ? 'fireMain' : 'select';
    return FUNCTION[k] || null;
  }

  function keyForEvent(event, inGame) {
    var code = event.code || '';
    if (code === 'NumpadEnter') return 'select';
    if (Object.prototype.hasOwnProperty.call(NUMPAD, code)) {
      if (code === 'Numpad8' || code === 'Numpad2') {
        return inGame ? NUMPAD[code] : (code === 'Numpad8' ? 'scrollUp' : 'scrollDown');
      }
      return inGame ? NUMPAD[code] : null;
    }
    if (Object.prototype.hasOwnProperty.call(EXTRA, code)) {
      if (inGame) return EXTRA[code];
      return code === 'Space' ? 'select' : null;
    }
    if (Object.prototype.hasOwnProperty.call(WASD, code)) {
      return inGame ? WASD[code] : (code === 'KeyW' ? 'scrollUp' : code === 'KeyS' ? 'scrollDown' : null);
    }
    return keyFor(event.key || '', inGame);
  }

  function attach(options) {
    var pad = options.pad;
    var onRelease = options.onRelease || function () {};
    var sources = {};
    var keyboard = {};
    var pointers = {};
    var buttons = {};

    function buttonFor(key) {
      if (!pad) return null;
      if (pad.querySelector) return pad.querySelector('[data-key="' + key + '"]');
      if (pad.querySelectorAll) {
        var allButtons = pad.querySelectorAll('[data-key]');
        for (var i = 0; i < allButtons.length; i += 1) {
          if (allButtons[i].getAttribute('data-key') === key) return allButtons[i];
        }
      }
      return null;
    }
    function updateButton(key) {
      var b = buttonFor(key) || buttons[key];
      if (!b || !b.classList) return;
      if (sources[key] && sources[key].count) b.classList.add('down');
      else b.classList.remove('down');
    }
    function addSource(key, id) {
      if (!sources[key]) sources[key] = { count: 0 };
      if (sources[key][id]) return false;
      var first = sources[key].count === 0;
      sources[key][id] = true;
      sources[key].count += 1;
      updateButton(key);
      if (first) options.onPress(key);
      return true;
    }
    function removeSource(key, id) {
      var entry = sources[key];
      if (!entry || !entry[id]) return;
      delete entry[id];
      entry.count -= 1;
      updateButton(key);
      if (!entry.count) { delete sources[key]; onRelease(key); }
    }
    function releaseAll() {
      Object.keys(keyboard).forEach(function (id) { removeSource(keyboard[id], id); delete keyboard[id]; });
      Object.keys(pointers).forEach(function (id) { removeSource(pointers[id], id); delete pointers[id]; });
    }

    function keydown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var key = keyForEvent(e, options.inGame());
      if (!key) return;
      e.preventDefault();
      if (e.repeat) return;
      var id = 'k:' + (e.code || e.key);
      if (keyboard[id]) return;
      keyboard[id] = key;
      addSource(key, id);
    }
    function keyup(e) {
      var id = 'k:' + (e.code || e.key);
      if (!keyboard[id]) return;
      removeSource(keyboard[id], id);
      delete keyboard[id];
    }
    function pointerdown(e) {
      var b = e.target.closest ? e.target.closest('[data-key]') : null;
      if (!b || !pad.contains(b)) return;
      e.preventDefault();
      var id = 'p:' + (e.pointerId === undefined ? 'default' : e.pointerId);
      var key = b.getAttribute('data-key');
      buttons[key] = b;
      if (!pointers[id]) { pointers[id] = key; addSource(key, id); }
    }
    function releasePointer(e) {
      var id = 'p:' + (e.pointerId === undefined ? 'default' : e.pointerId);
      if (!pointers[id]) return;
      removeSource(pointers[id], id);
      delete pointers[id];
    }
    function pointerout(e) {
      var from = e.target && e.target.closest ? e.target.closest('[data-key]') : null;
      var to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-key]') : null;
      if (from && from === to) return;
      releasePointer(e);
    }
    function contextmenu(e) { e.preventDefault(); }
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('blur', releaseAll);
    if (pad) {
      pad.addEventListener('pointerdown', pointerdown);
      pad.addEventListener('pointerup', releasePointer);
      pad.addEventListener('pointerout', pointerout);
      pad.addEventListener('pointercancel', releasePointer);
      pad.addEventListener('contextmenu', contextmenu);
    }
    function detach() {
      releaseAll();
      if (document.removeEventListener) { document.removeEventListener('keydown', keydown); document.removeEventListener('keyup', keyup); }
      if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('blur', releaseAll);
      if (pad && pad.removeEventListener) {
        pad.removeEventListener('pointerdown', pointerdown);
        pad.removeEventListener('pointerup', releasePointer);
        pad.removeEventListener('pointerout', pointerout);
        pad.removeEventListener('pointercancel', releasePointer);
        pad.removeEventListener('contextmenu', contextmenu);
      }
    }
    return { releaseAll: releaseAll, detach: detach };
  }

  NS.Input = { attach: attach, keyFor: keyFor, keyForEvent: keyForEvent };
  if (typeof module === 'object' && module.exports) module.exports = NS.Input;
})();
