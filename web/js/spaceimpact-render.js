/* Draw extracted one-bit masks into the shared 84 × 48 framebuffer. */
(function (root) {
  'use strict';

  var ns = (root.SpaceImpact = root.SpaceImpact || {});

  // Some pictures are stored as negatives: the ship of level 1 and the bosses of levels 1, 5 and 6 are boxes whose clear bits are
  // the figure (their border is set, the figure is cut out of it). Drawn as they are they show a square with a hole. The tiny
  // pictures and the other bosses are stored the right way round.
  var NEGATIVE = { 0: true, 23: true, 24: true, 25: true, 26: true, 27: true, 28: true, 29: true, 30: true, 43: true, 44: true, 45: true, 46: true };

  // Transparent masks set dark pixels only. Opaque masks also clear light pixels. A negative picture sets its clear bits.
  function blit(fb, bitmap, x, y, opaque, negative) {
    var ink = negative ? '.' : '#';
    for (var row = 0; row < bitmap.height; row++) {
      var py = y + row;
      if (py < 0 || py >= fb.h) continue;
      var pixels = bitmap.rows[row];
      for (var col = 0; col < bitmap.width; col++) {
        var px = x + col;
        if (px < 0 || px >= fb.w) continue;
        if (pixels.charAt(col) === ink) fb.set(px, py, 1);
        else if (opaque) fb.set(px, py, 0);
      }
    }
    return fb;
  }

  ns.Render = { blit: blit, NEGATIVE: NEGATIVE };
  if (typeof module === 'object' && module.exports) module.exports = ns.Render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
