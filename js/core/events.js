/* Dungeons and Degenerates — js/core/events.js
 * Tiny event bus. Listener errors are caught and reported so one bad listener can't break the game.
 *   const off = DD.Events.on('combat:changed', fn);  DD.Events.emit('combat:changed', data);  off();
 * Event names in use are listed in docs/ARCHITECTURE.md §5.10.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const listeners = {};

  DD.Events = {
    on: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      return function () { DD.Events.off(name, fn); };
    },
    once: function (name, fn) {
      const off = DD.Events.on(name, function (data) { off(); fn(data); });
      return off;
    },
    off: function (name, fn) {
      const arr = listeners[name];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    emit: function (name, data) {
      const arr = listeners[name];
      if (!arr || !arr.length) return;
      const copy = arr.slice();
      for (let i = 0; i < copy.length; i++) DD.safe('event listener "' + name + '"', copy[i], null, [data]);
    },
    clear: function (name) {
      if (name) delete listeners[name];
      else for (const k in listeners) delete listeners[k];
    },
  };
})();
