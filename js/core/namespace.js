/* Dungeons and Degenerates — js/core/namespace.js
 * Global namespace, content registries, narration and after-load hooks.
 * Loaded FIRST (see js/manifest.js). At load time every other file may only:
 *   - attach things to window.DD
 *   - call DD.register*(), DD.registerNarration(), DD.afterLoad()
 * Contract: docs/ARCHITECTURE.md
 */
(function () {
  'use strict';
  const DD = (window.DD = window.DD || {});

  DD.VERSION = '0.1.0';
  DD.TITLE = 'Dungeons and Degenerates';

  // ---- URL params & global flags -------------------------------------------
  DD.params = {};
  try {
    new URLSearchParams(window.location.search).forEach(function (v, k) { DD.params[k] = v; });
  } catch (e) { /* ignore */ }
  DD.debug = DD.params.debug === '1';
  DD.headless = false; // tests set true: no renderer, DD.FX.instant = true

  // ---- diagnostics ----------------------------------------------------------
  DD.problems = []; // registration / content warnings (strings)
  DD.errors = [];   // uncaught errors (strings)
  DD.warn = function (msg) {
    msg = String(msg);
    DD.problems.push(msg);
    if (window.console) console.warn('[DD] ' + msg);
  };
  window.addEventListener('error', function (e) {
    DD.errors.push((e && e.message ? e.message : String(e)) + (e && e.filename ? ' @ ' + e.filename + ':' + e.lineno : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    DD.errors.push('Unhandled rejection: ' + (e && e.reason && e.reason.stack ? e.reason.stack : String(e && e.reason)));
  });

  /** Call fn safely; report (not rethrow) errors. Used around content hooks. */
  DD.safe = function (label, fn, thisArg, args) {
    try {
      return fn.apply(thisArg, args || []);
    } catch (err) {
      DD.warn('Error in ' + label + ': ' + (err && err.stack ? err.stack : err));
      if (DD.debug && window.console) console.error(err);
      return undefined;
    }
  };

  // ---- registries -------------------------------------------------------------
  DD.defs = {
    heroes: {}, skills: {}, statuses: {}, items: {}, consumables: {}, enemies: {}, summons: {},
    terrain: {}, objects: {}, surfaces: {}, encounters: {}, events: {}, scars: {}, passives: {}, narration: {},
  };

  function register(kind, def, required, defaults) {
    if (!def || typeof def !== 'object' || typeof def.id !== 'string' || !def.id) {
      DD.warn('register ' + kind + ': definition without a string id: ' + (def && def.name));
      return def;
    }
    const bag = DD.defs[kind];
    if (bag[def.id]) DD.warn('register ' + kind + ': duplicate id "' + def.id + '" (later one wins)');
    for (let i = 0; i < required.length; i++) {
      if (def[required[i]] === undefined) DD.warn(kind + ' "' + def.id + '" is missing required field "' + required[i] + '"');
    }
    if (defaults) {
      const d = defaults(def);
      for (const k in d) if (def[k] === undefined) def[k] = d[k];
    }
    def.__kind = kind;
    bag[def.id] = def;
    return def;
  }

  DD.registerHero = function (def) {
    return register('heroes', def,
      ['name', 'stats', 'sprite', 'basic', 'signature', 'passive', 'startingSkills', 'skillPool', 'barks'],
      function () {
        return { epithet: '', race: '', cls: '', role: '', complexity: 1, blurb: '', color: '#cccccc', unlock: null, growth: { hp: 4 }, flags: {} };
      });
  };

  DD.registerSkill = function (def) {
    return register('skills', def, ['name', 'owner', 'target', 'execute'], function (d) {
      const levels = Array.isArray(d.levels) && d.levels.length ? d.levels : [{}];
      return {
        icon: '✦', kind: 'attack', tags: [],
        ap: d.owner === 'enemy' ? 0 : 1,
        hpCost: 0, cooldown: 0, charges: 0, hype: 0,
        levels: levels, maxLevel: levels.length,
        area: { shape: 'single' }, anchor: 'self',
        desc: function () { return ''; }, flavor: '',
      };
    });
  };

  DD.registerStatus = function (def) {
    return register('statuses', def, ['name', 'type'], function () {
      return { icon: '?', color: '#cccccc', stacking: 'stack', maxStacks: 99, decay: 'turnEnd', hooks: {}, desc: function () { return ''; } };
    });
  };

  DD.registerItem = function (def) {
    return register('items', def, ['name', 'slot', 'rarity'], function (d) {
      const prices = { common: 40, rare: 80, legendary: 150, cursed: 25 };
      return { icon: '❔', stats: {}, hooks: {}, hero: null, desc: '', flavor: '', price: prices[d.rarity] || 50 };
    });
  };

  DD.registerConsumable = function (def) {
    return register('consumables', def, ['name', 'target', 'execute'], function (d) {
      return { icon: '🧪', rarity: 'common', ap: 1, area: { shape: 'single' }, desc: '', flavor: '', price: d.rarity === 'rare' ? 35 : 22 };
    });
  };

  DD.registerEnemy = function (def) {
    return register('enemies', def, ['name', 'act', 'tier', 'hp', 'sprite', 'skills'], function () {
      return { mov: 3, armor: 0, tags: [], flags: {}, resist: {}, ai: 'default', xp: 4, gold: [1, 3], hooks: {}, barks: {}, desc: '', boss: null };
    });
  };

  /** Player-controlled summons (corgis, ravens, imps...). Same shape as enemies, plus ap. */
  DD.registerSummon = function (def) {
    return register('summons', def, ['name', 'hp', 'sprite', 'skills'], function () {
      return { mov: 3, ap: 2, armor: 0, tags: [], flags: {}, resist: {}, hooks: {}, barks: {}, desc: '' };
    });
  };

  DD.registerTerrain = function (def) {
    return register('terrain', def, ['name'], function () {
      return { walkable: true, cost: 1, blocksLos: false, pit: false, liquid: null, tall: 0, colors: null, desc: '' };
    });
  };

  DD.registerObject = function (def) {
    return register('objects', def, ['name'], function () {
      return { blocksMove: true, blocksLos: false, hp: 0, height: 0.8, interact: null, desc: '' };
    });
  };

  DD.registerSurface = function (def) {
    return register('surfaces', def, ['name'], function () {
      return { color: 'rgba(255,255,255,0.3)', turns: 3, blocksLos: false, desc: '' };
    });
  };

  DD.registerEncounter = function (def) {
    return register('encounters', def, ['act', 'kind'], function () {
      return { name: def.id, intro: '', weight: 1, minDepth: 0, enemies: [], objective: { type: 'killAll' }, reinforcements: [], rules: [] };
    });
  };

  DD.registerEvent = function (def) {
    return register('events', def, ['title', 'text', 'choices'], function () {
      return { acts: [1, 2, 3], weight: 1, unique: true, icon: '❓' };
    });
  };

  DD.registerScar = function (def) {
    return register('scars', def, ['name', 'desc'], function () {
      return { icon: '🩹', stats: {}, hooks: {} };
    });
  };

  /** Random passives — the Table of Questionable Blessings (ARCHITECTURE §3.12): rolled on level-ups, 4 slots. */
  DD.registerPassive = function (def) {
    return register('passives', def, ['name', 'rarity', 'desc'], function (d) {
      const levels = Array.isArray(d.levels) && d.levels.length ? d.levels : [{}];
      const weights = { common: 10, uncommon: 6, rare: 3, legendary: 1, cursed: 4 };
      return { icon: '🎲', levels: levels, maxLevel: levels.length, weight: weights[d.rarity] || 5, stats: null,
        hooks: {}, runMods: null, requires: null, flavor: '', tags: [] };
    });
  };

  // ---- lookups ------------------------------------------------------------------
  DD.getHero = function (id) { return DD.defs.heroes[id] || null; };
  DD.getSkill = function (id) { return DD.defs.skills[id] || null; };
  DD.getStatus = function (id) { return DD.defs.statuses[id] || null; };
  DD.getItem = function (id) { return DD.defs.items[id] || null; };
  DD.getConsumable = function (id) { return DD.defs.consumables[id] || null; };
  DD.getEnemy = function (id) { return DD.defs.enemies[id] || null; };
  DD.getSummon = function (id) { return DD.defs.summons[id] || null; };
  DD.getTerrain = function (id) { return DD.defs.terrain[id] || null; };
  DD.getObject = function (id) { return DD.defs.objects[id] || null; };
  DD.getSurface = function (id) { return DD.defs.surfaces[id] || null; };
  DD.getEncounter = function (id) { return DD.defs.encounters[id] || null; };
  DD.getEvent = function (id) { return DD.defs.events[id] || null; };
  DD.getScar = function (id) { return DD.defs.scars[id] || null; };
  DD.getPassive = function (id) { return DD.defs.passives[id] || null; };

  /** A passive entry ('id' | { id, level }) as a combat instance { id, level, L, def, data } (null if unknown). */
  DD.passiveInstance = function (p) {
    const id = typeof p === 'string' ? p : p && p.id;
    const def = id ? DD.getPassive(id) : null;
    if (!def) return null;
    const level = Math.max(1, Math.min(def.maxLevel || 1, Math.floor((p && p.level) || 1)));
    return { id: id, level: level, L: DD.skillLevel(def, level), def: def, data: {} };
  };

  /** Stats a passive entry grants: def.stats object or def.stats(L, level) (null when none). */
  DD.passiveStats = function (p) {
    const inst = p && p.def ? p : DD.passiveInstance(p);
    if (!inst || !inst.def.stats) return null;
    if (typeof inst.def.stats !== 'function') return inst.def.stats;
    return DD.safe('stats of passive ' + inst.id, inst.def.stats, inst.def, [inst.L, inst.level]) || null;
  };

  /** Description of a passive entry at its level: def.desc(L, level) or a string (never throws). */
  DD.passiveDesc = function (p) {
    const inst = p && p.def ? p : DD.passiveInstance(p);
    if (!inst) return '';
    if (typeof inst.def.desc !== 'function') return String(inst.def.desc || '');
    const s = DD.safe('desc of passive ' + inst.id, inst.def.desc, inst.def, [inst.L, inst.level]);
    return s == null ? '' : String(s);
  };

  /** Per-level numbers of a skill: levels[level-1], clamped. */
  DD.skillLevel = function (skillDef, level) {
    if (!skillDef || !skillDef.levels || !skillDef.levels.length) return {};
    const i = Math.max(0, Math.min(skillDef.levels.length - 1, (level || 1) - 1));
    return skillDef.levels[i] || {};
  };

  /** Resolve a value that may be a function of (L, user). */
  DD.resolve = function (v, L, user, fallback) {
    if (typeof v === 'function') {
      const r = DD.safe('DD.resolve', v, null, [L, user]);
      return r === undefined ? fallback : r;
    }
    return v === undefined ? fallback : v;
  };

  /** Skill description text for a level (never throws). */
  DD.skillDesc = function (skillDef, level, user) {
    if (!skillDef) return '';
    const L = DD.skillLevel(skillDef, level);
    if (typeof skillDef.desc === 'function') {
      const s = DD.safe('desc of ' + skillDef.id, skillDef.desc, skillDef, [L, user || null]);
      return s == null ? '' : String(s);
    }
    return String(skillDef.desc || '');
  };

  // ---- narration ----------------------------------------------------------------
  /** Add lines to a narration key. Lines may use {hero} {enemy} {n} {gold} {name} tokens. */
  DD.registerNarration = function (key, lines) {
    if (!Array.isArray(lines)) lines = [lines];
    const bag = DD.defs.narration;
    (bag[key] = bag[key] || []).push.apply(bag[key], lines.filter(function (l) { return typeof l === 'string' && l; }));
  };

  /** Pick a narration line for key and fill tokens. Returns '' if none. */
  DD.narrate = function (key, vars, rng) {
    const lines = DD.defs.narration[key];
    if (!lines || !lines.length) return '';
    const r = rng && rng.next ? rng.next() : Math.random();
    let line = lines[Math.floor(r * lines.length) % lines.length];
    vars = vars || {};
    return line.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? String(vars[k]) : m; });
  };

  // ---- after-load hooks -----------------------------------------------------------
  const afterLoadFns = [];
  /** Register fn to run once all scripts are loaded (before the game boots / tests run). Lower order runs first. */
  DD.afterLoad = function (fn, order) {
    afterLoadFns.push({ fn: fn, order: order || 0, i: afterLoadFns.length });
  };
  DD.loaded = false;
  DD.runAfterLoad = function () {
    if (DD.loaded) return;
    afterLoadFns.sort(function (a, b) { return a.order - b.order || a.i - b.i; });
    for (let i = 0; i < afterLoadFns.length; i++) DD.safe('afterLoad #' + i, afterLoadFns[i].fn);
    DD.loaded = true;
  };
})();
