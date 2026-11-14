/* English Space Impact instructions from the Nokia 3310 v6.39 PPM B text table.
 * Other firmware language packs have not yet been decoded for this game.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var instructions = 'Use your weapons to survive attacks. Use keys 8 and 0 to move up and down. ' +
    'Use the # key to move forward and the * key to move backwards. ' +
    'Keys 1 and 3 fire the main weapon. Keys 4 and 6 fire the bonus weapons.';
  ns.Texts = { instructions: function () { return instructions; } };
  if (typeof module === 'object' && module.exports) module.exports = ns.Texts;
})(typeof globalThis !== 'undefined' ? globalThis : this);
