'use strict';

// The phone defaults to the system language, which Node 21+ exposes as
// `navigator.language` (taken from the host locale). The checks expect the
// English labels, so pin the browser language to keep results independent of
// the machine that runs them. Tests that exercise language detection pass the
// languages explicitly and are not affected.
(function pinLanguage() {
  const pinned = Object.freeze({ language: 'en-US', languages: Object.freeze(['en-US']) });
  Object.defineProperty(globalThis, 'navigator', { value: pinned, configurable: true, writable: true });
})();
