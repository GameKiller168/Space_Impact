/* The page: one phone, one display, a few keys. Wires the Space Impact shell to the DOM. */
(function () {
  'use strict';

  var NS = globalThis.SnakeII, SI = globalThis.SpaceImpact;
  var storage = null;
  try { storage = globalThis.localStorage; storage.getItem('spaceimpact.probe'); } catch (ignore) { storage = null; }

  var store = SI.Storage.createStore(storage);
  var audio = NS.Audio.create({ settings: store, gameTones: SI.Tones });
  var lcd = new NS.Lcd(document.getElementById('lcd'));

  var app = SI.App.create({
    engine: {
      create: function () { return SI.Engine.create(); },
      restore: function (snapshot) { return SI.Engine.restore(snapshot); }
    },
    pad: document.getElementById('keys'),
    paint: function (fb) { lcd.draw(fb); },
    instructions: function (language) { return SI.Texts.instructions(NS.I18n.resolve(language)); },
    audio: audio,
    store: store,
    storage: storage,
    onGameEvent: function (event, settings) {
      if (event === 'vibration') {
        try {
          if (settings && settings.vibration && globalThis.navigator && typeof globalThis.navigator.vibrate === 'function') globalThis.navigator.vibrate(494);
        } catch (ignore) {}
      } else audio.playGame(event);
    }
  });
  var phone = app.phone;

  function updatePageLanguage() {
    var t = function (key) { return NS.I18n.text(key, store.language); };
    document.documentElement.lang = NS.I18n.resolve(store.language);
    document.getElementById('lcd').setAttribute('aria-label', t('DISPLAY'));
    document.getElementById('keys').setAttribute('aria-label', t('KEYS'));
    var buttons = document.querySelectorAll('#keys [data-key]');
    for (var i = 0; i < buttons.length; i++) {
      var key = buttons[i].getAttribute('data-key');
      if (key === 'select') {
        buttons[i].setAttribute('aria-label', t('BUTTON_SELECT'));
        var cap = buttons[i].querySelector('.cap');
        if (cap) cap.textContent = t('SELECT');
      } else if (key === 'scrollUp') buttons[i].setAttribute('aria-label', t('SCROLL_UP'));
      else if (key === 'scrollDown') buttons[i].setAttribute('aria-label', t('SCROLL_DOWN'));
      else if (key === 'c') buttons[i].setAttribute('aria-label', 'C');
      // the digit keys keep their role in the game (8 up, 0 down, * back, # forward, 1 and 3 fire, 4 and 6 bonus weapons)
    }
  }
  var previous = phone.onLanguageChange;
  phone.onLanguageChange = function () { if (typeof previous === 'function') previous.apply(phone, arguments); updatePageLanguage(); };
  updatePageLanguage();

  function loop() { app.frame(); requestAnimationFrame(loop); }
  SI.app = app;                    // for the console
  lcd.draw(phone.draw());
  requestAnimationFrame(loop);
})();
