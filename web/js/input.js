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
    var dragging = {};
    var listeners = [];                 // [target, type, handler], so that detach() can take them all away again

    function listen(target, type, handler) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }
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
      dragging = {};
    }

    function keydown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var key = keyForEvent(e, options.inGame());
      if (!key) return;
      e.preventDefault();
      if (e.repeat) return;               // the game repeats fire and movement itself, from the held key
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
    listen(typeof document !== 'undefined' ? document : null, 'keydown', keydown);
    listen(typeof document !== 'undefined' ? document : null, 'keyup', keyup);
    listen(typeof window !== 'undefined' ? window : null, 'blur', releaseAll);

    // Every finger (or mouse button) is its own pointer: it presses the key under it, and when it slides over to
    // another key it lets go of the first and presses the next, independently of the other fingers.
    function pointerId(e) { return 'p:' + (e.pointerId === undefined ? 'default' : e.pointerId); }
    function keyButtonAt(x, y) {
      var el = typeof document !== 'undefined' && document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      var b = el && el.closest ? el.closest('[data-key]') : null;
      return b && pad.contains(b) ? b : null;
    }
    function moveTo(id, b) {
      var key = b ? b.getAttribute('data-key') : null;
      if (pointers[id] === key) return;
      if (pointers[id]) { removeSource(pointers[id], id); delete pointers[id]; }
      if (key) { buttons[key] = b; pointers[id] = key; addSource(key, id); }
    }
    function releasePointer(e) {
      var id = pointerId(e);
      delete dragging[id];
      if (!pointers[id]) return;
      removeSource(pointers[id], id);
      delete pointers[id];
    }
    if (pad) {
      listen(pad, 'pointerdown', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-key]') : null;
        if (!b || !pad.contains(b)) return;
        e.preventDefault();
        var id = pointerId(e), key = b.getAttribute('data-key');
        // a touch is captured by the element it started on; let go so that it can slide over the other keys
        if (e.target.releasePointerCapture && e.pointerId !== undefined) {
          try { e.target.releasePointerCapture(e.pointerId); } catch (ignore) { /* not captured */ }
        }
        dragging[id] = true;
        buttons[key] = b;
        if (!pointers[id]) { pointers[id] = key; addSource(key, id); }
      });
      listen(pad, 'pointermove', function (e) {
        var id = pointerId(e);
        if (dragging[id]) moveTo(id, keyButtonAt(e.clientX, e.clientY));
      });
      listen(pad, 'pointerup', releasePointer);
      listen(pad, 'pointercancel', releasePointer);
      listen(pad, 'pointerout', function (e) {
        // moving between the label and the edge of the same key is not leaving the key
        var from = e.target && e.target.closest ? e.target.closest('[data-key]') : null;
        var to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-key]') : null;
        if (from && from === to) return;
        var id = pointerId(e);
        if (!pointers[id]) return;
        removeSource(pointers[id], id);
        delete pointers[id];
      });
      listen(pad, 'contextmenu', function (e) { e.preventDefault(); });
      // A finger that starts anywhere on the page, or wanders off the pad and back, presses whatever key is under it.
      listen(typeof document !== 'undefined' ? document : null, 'pointerdown', function (e) {
        if (e.target && pad.contains && pad.contains(e.target)) return;
        var id = pointerId(e);
        dragging[id] = true;
        moveTo(id, keyButtonAt(e.clientX, e.clientY));
      });
      listen(typeof document !== 'undefined' ? document : null, 'pointermove', function (e) {
        var id = pointerId(e);
        if (dragging[id]) moveTo(id, keyButtonAt(e.clientX, e.clientY));
      });
      // a finger lifted outside the pad must not leave a key stuck down
      listen(typeof window !== 'undefined' ? window : null, 'pointerup', releasePointer);
      listen(typeof window !== 'undefined' ? window : null, 'pointercancel', releasePointer);
    }
    function detach() {
      releaseAll();
      listeners.forEach(function (entry) {
        if (typeof entry[0].removeEventListener === 'function') entry[0].removeEventListener(entry[1], entry[2]);
      });
      listeners = [];
    }
    return { releaseAll: releaseAll, detach: detach };
  }

  NS.Input = { attach: attach, keyFor: keyFor, keyForEvent: keyForEvent };
  if (typeof module === 'object' && module.exports) module.exports = NS.Input;
})();
