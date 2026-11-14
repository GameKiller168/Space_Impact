/* Draw extracted one-bit masks into the shared 84 × 48 framebuffer. */
(function (root) {
  'use strict';

  var ns = (root.SpaceImpact = root.SpaceImpact || {});

  // Transparent masks set dark pixels only. Opaque masks also clear light pixels.
  function blit(fb, bitmap, x, y, opaque) {
    for (var row = 0; row < bitmap.height; row++) {
      var py = y + row;
      if (py < 0 || py >= fb.h) continue;
      var pixels = bitmap.rows[row];
      for (var col = 0; col < bitmap.width; col++) {
        var px = x + col;
        if (px < 0 || px >= fb.w) continue;
        if (pixels.charAt(col) === '#') fb.set(px, py, 1);
        else if (opaque) fb.set(px, py, 0);
      }
    }
    return fb;
  }

  ns.Render = { blit: blit };
  if (typeof module === 'object' && module.exports) module.exports = ns.Render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
