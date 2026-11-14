/* Nokia 3310 v6.39 PPM B game-tone scripts used by the Space Impact handler.
 * Keys in GAME are the decimal event codes written to the game's record + 20.
 * The firmware scripts provide frequency and duration, not buzzer waveform or volume.
 * Evidence and script addresses are recorded in SPACEIMPACT_AUDIO.md.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var tones = {
    TICK_MS: 7.96875,
    GAME: {
      23: { code: 0x17, segments: [[880, 2], [4186, 2], [4186, 2], [4186, 2], [932, 2], [4186, 2], [4186, 2], [4186, 2], [988, 2], [4186, 2], [4186, 2], [4186, 2]] },
      24: { code: 0x18, segments: [[440, 5], [466, 5], [494, 5], [523, 5]] },
      25: { code: 0x19, segments: [[4186, 2], [4186, 2], [4186, 2], [4186, 2], [3951, 2], [3729, 2], [3520, 2], [3322, 2], [3136, 2], [2960, 2], [2794, 2], [2637, 2]] },
      26: { code: 0x1a, segments: [[1397, 2], [988, 2], [1397, 2], [932, 2], [1397, 2], [880, 2], [1568, 2], [831, 2], [1397, 2], [784, 2], [1397, 2], [740, 2], [1397, 2], [698, 2], [1397, 2], [659, 2], [1397, 2], [622, 2], [1397, 2], [587, 2]] }
    }
  };
  ns.Tones = tones;
  if (typeof module === 'object' && module.exports) module.exports = tones;
})(typeof globalThis !== 'undefined' ? globalThis : this);
