/* Dungeons and Degenerates — js/core/rng.js
 * Seeded RNG (mulberry32). Game logic must use an RNG instance, never Math.random().
 *   const r = DD.RNG('my-seed');  r.next() in [0,1) · r.int(1,6) inclusive · r.pick(arr) · r.chance(0.25)
 *   r.getState() / r.setState(s) for saving · r.fork('label') for independent sub-streams
 */
(function () {
  'use strict';
  const DD = window.DD;

  function seedToUint(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return (seed >>> 0) || 1;
    return DD.util.hash(String(seed)) || 1;
  }

  function RNG(seed) {
    if (seed === undefined || seed === null) seed = Math.floor(Math.random() * 1e9);
    let state = seedToUint(seed);
    const r = {
      seed: seed,
      next: function () {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      float: function (a, b) { return a + (b - a) * r.next(); },
      /** Inclusive integer in [a, b]. */
      int: function (a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.floor(r.next() * (b - a + 1)); },
      chance: function (p) { return r.next() < p; },
      pick: function (arr) { return DD.util.pick(arr, r); },
      shuffle: function (arr) { return DD.util.shuffle(arr, r); },
      sample: function (arr, n) { return DD.util.sample(arr, n, r); },
      weighted: function (items, weightFn) { return DD.util.weightedPick(items, weightFn, r); },
      /** Independent child stream (deterministic for a given parent state + label). */
      fork: function (label) { return RNG(String(state) + ':' + (label || '')); },
      getState: function () { return state; },
      setState: function (s) { state = s >>> 0; },
    };
    return r;
  }

  DD.RNG = RNG;
  DD.rng = RNG(); // cosmetic / UI randomness only
  DD.newSeed = function () { return Math.floor(Math.random() * 2147483647); };
})();
