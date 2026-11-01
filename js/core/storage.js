/* Dungeons and Degenerates — js/core/storage.js
 * localStorage wrapper (JSON, namespaced, never throws). Works from file:// in Chrome/Edge/Firefox.
 * In tests (window.DD_TEST) a memory store is used so test runs never touch real saves.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const PREFIX = 'dnd_degenerates.v1.';
  const memory = {};
  let useMemory = !!window.DD_TEST;

  function ls() {
    if (useMemory) return null;
    try { return window.localStorage; } catch (e) { return null; }
  }

  DD.Storage = {
    prefix: PREFIX,
    available: function () { return !!ls(); },
    useMemory: function (on) { useMemory = on !== false; },
    get: function (key, fallback) {
      try {
        const store = ls();
        const raw = store ? store.getItem(PREFIX + key) : memory[key];
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        DD.warn('Storage.get failed for ' + key + ': ' + e);
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        const raw = JSON.stringify(value);
        const store = ls();
        if (store) store.setItem(PREFIX + key, raw);
        else memory[key] = raw;
        return true;
      } catch (e) {
        DD.warn('Storage.set failed for ' + key + ': ' + e);
        return false;
      }
    },
    remove: function (key) {
      try {
        const store = ls();
        if (store) store.removeItem(PREFIX + key);
        else delete memory[key];
      } catch (e) { /* ignore */ }
    },
  };
})();
