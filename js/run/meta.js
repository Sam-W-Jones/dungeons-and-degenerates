/* Dungeons and Degenerates — js/run/meta.js
 * Persistent meta progression (DD.Meta, ARCHITECTURE §4.7 / §9.1): unlocked heroes, lifetime stats, settings,
 * codex "seen" flags and the last 20 run summaries, stored in DD.Storage under 'meta'.
 * Unlock rules (DESIGN §3): heroes whose def has `unlock: null` are starters; `unlock: { act: N }` heroes unlock on
 * the first clear of act N; `unlock: { boss: enemyId }` heroes unlock the first time that boss is beaten;
 * settings.unlockAll ("I'm the DM's Favorite") unlocks everyone while it is on.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const KEY = 'meta';
  const HISTORY_MAX = 20;
  // DESIGN §3 defaults, used when the hero defs are not registered (yet).
  const STARTERS = ['zarathor', 'syllamin', 'marbles', 'marwyn', 'ellaria'];
  const ACT_UNLOCKS = { 1: ['josiah'], 2: ['sparrow'], 3: ['corelos'] };
  // `unlock: { boss: enemyId }` heroes unlock the first time that boss is beaten (fallback for unregistered ids)
  const BOSS_UNLOCKS = { grimble: ['buga'], lichtenstein: ['slate'] };
  const BOSS_NAMES = { grimble: 'Grimble the Goblin Tax Collector', lichtenstein: 'Lich-tenstein, the Overdue Librarian' };
  const SEEN_KINDS = {
    enemy: 'enemies', enemies: 'enemies', boss: 'bosses', bosses: 'bosses', event: 'events', events: 'events',
    passive: 'passives', passives: 'passives',   // Blessings discovered on the Table of Questionable Blessings
  };
  const STAT_KEYS = ['runs', 'wins', 'bestAct', 'deaths', 'kills', 'downs', 'combats', 'elites', 'bosses', 'goldEarned', 'actsCleared'];
  // Per-run summary stats that add up into the lifetime totals (runs/wins/bestAct are handled separately).
  const SUMMED = ['deaths', 'kills', 'downs', 'combats', 'elites', 'bosses', 'goldEarned'];

  function defaults() {
    const stats = {};
    STAT_KEYS.forEach(function (k) { stats[k] = 0; });
    return {
      version: 1,
      unlocked: STARTERS.slice(),
      stats: stats,
      settings: { animSpeed: 1, sfx: true, volume: 0.6, shake: true, unlockAll: false, showGrid: true },
      seen: { enemies: {}, bosses: {}, events: {}, passives: {} },
      history: [],
    };
  }

  /** Merge stored data over defaults, keeping only well-typed values (old or hand-edited saves never crash). */
  function merge(base, stored) {
    if (!stored || typeof stored !== 'object') return base;
    if (Array.isArray(stored.unlocked)) {
      stored.unlocked.forEach(function (id) {
        if (typeof id === 'string' && id && base.unlocked.indexOf(id) < 0) base.unlocked.push(id);
      });
    }
    if (stored.stats && typeof stored.stats === 'object') {
      for (const k in stored.stats) {
        const v = stored.stats[k];
        if (typeof v === 'number' && isFinite(v)) base.stats[k] = v;
      }
    }
    if (stored.settings && typeof stored.settings === 'object') {
      for (const k in stored.settings) {
        const v = stored.settings[k];
        if (!(k in base.settings) || typeof v === typeof base.settings[k]) base.settings[k] = v;
      }
    }
    if (stored.seen && typeof stored.seen === 'object') {
      for (const kind in base.seen) {
        const bag = stored.seen[kind];
        if (bag && typeof bag === 'object') for (const id in bag) if (bag[id]) base.seen[kind][id] = bag[id];
      }
    }
    if (Array.isArray(stored.history)) {
      base.history = stored.history.filter(function (h) { return h && typeof h === 'object'; }).slice(0, HISTORY_MAX);
    }
    return base;
  }

  function heroDefs() { return (DD.defs && DD.defs.heroes) || {}; }

  function unlockAllOn() {
    return !!Meta.data.settings.unlockAll || (DD.debug && DD.params && DD.params.unlockall === '1');
  }

  /** True if the hero is permanently unlocked (ignores the unlockAll toggle). */
  function ownsHero(heroId) {
    if (Meta.data.unlocked.indexOf(heroId) >= 0) return true;
    const def = heroDefs()[heroId];
    return !!def && !def.unlock;
  }

  const Meta = (DD.Meta = {
    KEY: KEY,
    HISTORY_MAX: HISTORY_MAX,
    STARTERS: STARTERS,
    ACT_UNLOCKS: ACT_UNLOCKS,
    BOSS_UNLOCKS: BOSS_UNLOCKS,
    data: defaults(),

    defaults: defaults,

    /** Load from storage (merged over defaults). Returns the data object. */
    load: function () {
      Meta.data = merge(defaults(), DD.Storage.get(KEY, null));
      return Meta.data;
    },

    save: function () { return DD.Storage.set(KEY, Meta.data); },

    /** Wipe all meta progress (Hall of Fame "reset"). Settings are kept unless keepSettings === false. */
    reset: function (keepSettings) {
      const settings = Meta.data.settings;
      Meta.data = defaults();
      if (keepSettings !== false && settings) Meta.data.settings = Object.assign(Meta.data.settings, settings);
      Meta.save();
      DD.Events.emit('meta:changed', { reset: true });
      return Meta.data;
    },

    isUnlocked: function (heroId) {
      if (!heroId || typeof heroId !== 'string') return false;
      return unlockAllOn() || ownsHero(heroId);
    },

    /** Permanently unlock a hero. Returns true when it was not unlocked before. */
    unlock: function (heroId) {
      if (!heroId || typeof heroId !== 'string') return false;
      const fresh = !ownsHero(heroId);
      if (Meta.data.unlocked.indexOf(heroId) < 0) Meta.data.unlocked.push(heroId);
      Meta.save();
      if (fresh) DD.Events.emit('meta:changed', { unlocked: heroId });
      return fresh;
    },

    /** Hero ids unlocked by the first clear of `act` (hero defs first, DESIGN fallback for unregistered ids). */
    unlocksForAct: function (act) {
      act = +act;
      const ids = [];
      const defs = heroDefs();
      Object.keys(defs).forEach(function (id) {
        const u = defs[id] && defs[id].unlock;
        if (u && +u.act === act) ids.push(id);
      });
      (ACT_UNLOCKS[act] || []).forEach(function (id) {
        if (!defs[id] && ids.indexOf(id) < 0) ids.push(id);
      });
      return ids;
    },

    /** Unlock everything tied to clearing `act`. Returns the newly unlocked hero ids. */
    unlockForAct: function (act) {
      const fresh = [];
      Meta.unlocksForAct(act).forEach(function (id) { if (Meta.unlock(id)) fresh.push(id); });
      return fresh;
    },

    /** Hero ids unlocked by beating the boss enemy `bossId` (hero defs first, fallback map for unregistered ids). */
    unlocksForBoss: function (bossId) {
      const ids = [];
      const defs = heroDefs();
      Object.keys(defs).forEach(function (id) {
        const u = defs[id] && defs[id].unlock;
        if (u && u.boss && u.boss === bossId) ids.push(id);
      });
      (BOSS_UNLOCKS[bossId] || []).forEach(function (id) {
        if (!defs[id] && ids.indexOf(id) < 0) ids.push(id);
      });
      return ids;
    },

    /** Unlock everything tied to beating these boss enemy ids. Returns the newly unlocked hero ids. */
    unlockForBosses: function (bossIds) {
      const fresh = [];
      (bossIds || []).forEach(function (b) {
        Meta.unlocksForBoss(b).forEach(function (id) { if (Meta.unlock(id)) fresh.push(id); });
      });
      return fresh;
    },

    /** Display name of a boss for unlock hints ("Grimble the Goblin Tax Collector"). */
    bossName: function (bossId) {
      const e = DD.getEnemy(bossId);
      if (e) return e.boss && e.boss.title ? e.name + ', ' + e.boss.title : e.name;
      return BOSS_NAMES[bossId] || bossId;
    },

    /** Registered hero ids the player may pick (party select / recruits). */
    unlockedHeroes: function () {
      return Object.keys(heroDefs()).filter(function (id) { return Meta.isUnlocked(id); });
    },

    lockedHeroes: function () {
      return Object.keys(heroDefs()).filter(function (id) { return !Meta.isUnlocked(id); });
    },

    /** Short unlock condition for a locked hero card, e.g. "Clear Act 1 to unlock." */
    unlockHint: function (heroId) {
      const def = heroDefs()[heroId];
      let boss = def && def.unlock && def.unlock.boss;
      if (!boss && !def) {
        for (const b in BOSS_UNLOCKS) if (BOSS_UNLOCKS[b].indexOf(heroId) >= 0) boss = b;
      }
      if (boss) return 'Defeat ' + Meta.bossName(boss) + ' to unlock.';
      let act = def && def.unlock && def.unlock.act;
      if (!act) {
        for (const a in ACT_UNLOCKS) if (ACT_UNLOCKS[a].indexOf(heroId) >= 0) act = +a;
      }
      if (!act) return '';
      return act >= 3 ? 'Beat the Dungeon Master to unlock.' : 'Clear Act ' + act + ' to unlock.';
    },

    /** Record a finished run (victory / defeat / abandoned): lifetime stats + history (newest first, max 20). */
    recordRun: function (summary) {
      if (!summary || typeof summary !== 'object') return null;
      const entry = DD.util.deepClone(summary);
      if (!entry.date) entry.date = Date.now();
      const st = Meta.data.stats;
      st.runs++;
      if (entry.result === 'victory') st.wins++;
      st.bestAct = Math.max(st.bestAct || 0, +entry.act || 0);
      const rs = entry.stats || {};
      SUMMED.forEach(function (k) { if (typeof rs[k] === 'number' && isFinite(rs[k])) st[k] = (st[k] || 0) + rs[k]; });
      if (typeof rs.actsCleared === 'number') st.actsCleared = (st.actsCleared || 0) + rs.actsCleared;
      Meta.data.history.unshift(entry);
      if (Meta.data.history.length > HISTORY_MAX) Meta.data.history.length = HISTORY_MAX;
      Meta.save();
      DD.Events.emit('meta:changed', { run: entry });
      return entry;
    },

    /** Mark a codex entry as seen. kind: 'enemies'|'bosses'|'events' (singular accepted). Returns true if new. */
    markSeen: function (kind, id) {
      const bag = Meta.data.seen[SEEN_KINDS[kind] || kind];
      if (!bag || !id) return false;
      if (bag[id]) return false;
      bag[id] = Date.now();
      Meta.save();
      return true;
    },

    isSeen: function (kind, id) {
      const bag = Meta.data.seen[SEEN_KINDS[kind] || kind];
      return !!(bag && id && bag[id]);
    },

    /** Change one setting and persist it. */
    setSetting: function (key, value) {
      Meta.data.settings[key] = value;
      Meta.save();
      DD.Events.emit('meta:settings', { key: key, value: value });
      return value;
    },
  });

  // `DD.Meta.settings` shortcut (reads and writes go to data.settings).
  Object.defineProperty(Meta, 'settings', {
    enumerable: true,
    get: function () { return Meta.data.settings; },
    set: function (v) { if (v && typeof v === 'object') Object.assign(Meta.data.settings, v); },
  });

  DD.afterLoad(function () { Meta.load(); }, -100);
})();
