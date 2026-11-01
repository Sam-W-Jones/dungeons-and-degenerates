/* Dungeons and Degenerates — js/run/passives.js
 * DD.Passives — the run side of the Table of Questionable Blessings (ARCHITECTURE §3.12 / §9.6, DESIGN §7.1):
 * the weighted d100 table, rolls (owned below max level → upgrade, maxed excluded, `requires` filter), describe
 * helpers, the headless policy, applying a resolution to a RunHero's 4 slots, and run modifiers (runMods: gold,
 * price, heal; `xp` is the hero's extra weight in the v2 level-up rotation — there is no XP any more).
 * Pure logic over RunHero-like objects ({ id, passives: [{ id, level }] }); DD.Run owns the flow (pending rolls,
 * saving, UI). Table order puts cursed entries at the bottom of the d100 (NAT 1s) and legendaries at the top.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const MAX = 4;
  const ORDER = ['cursed', 'common', 'uncommon', 'rare', 'legendary'];
  const RARITY = {
    cursed: { name: 'Cursed', color: '#c06cff', rank: 0 },
    common: { name: 'Common', color: '#cfc6b4', rank: 1 },
    uncommon: { name: 'Uncommon', color: '#6fd27a', rank: 2 },
    rare: { name: 'Rare', color: '#5aa9ff', rank: 3 },
    legendary: { name: 'Legendary', color: '#ffb52e', rank: 4 },
  };
  const MOD_KEYS = ['gold', 'xp', 'price', 'heal'];

  const QUIPS = {
    nat1: ['That\'s a NAT 1. Congratulations?'],
    nat100: ['NATURAL 100! The DM is checking the dice for weights.'],
    maxed: ['MAXED OUT. The DM crosses it off his list with a sigh.', 'Level III. It cannot get any more of itself.'],
    upgrade: ['Déjà vu! Rolling it twice makes it stronger.', 'Again?! The dice have a favourite.', 'Same blessing, more of it. The DM is out of ideas.'],
    cursed: ['The DM is trying very hard not to smile.', 'Ooh. That one has fine print.', 'The dice giggled. Dice should not giggle.', 'Somewhere, a rules lawyer felt a disturbance.'],
    legendary: ['The DM stands up. The DM never stands up.', 'The whole table goes quiet. Someone drops a Cheeto.', 'The DM checks the rulebook. Then checks it again.'],
    rare: ['A rare one! Screenshot it for the group chat.', 'Ooh, shiny. The DM pretends that was the plan.', 'The DM mutters "that\'s fine, that\'s totally fine".'],
    uncommon: ['Not bad! The DM nods slowly.', 'Respectable. Mildly suspicious, but respectable.', 'The DM writes something down. Ominous.'],
    common: ['The DM shrugs. It counts.', 'A humble blessing for a humble degenerate.', 'It\'s not much, but it\'s honest work.'],
  };

  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function rarityOf(def) { return def && RARITY[def.rarity] ? def.rarity : 'common'; }
  /** Rarity rank (cursed 0 … legendary 4); an unknown Blessing (its def was removed after a save) ranks -1, so the
   *  headless policy and the shop's default re-roll replace it first. */
  function rank(x) {
    const def = typeof x === 'string' ? DD.getPassive(x) : x && x.def ? x.def : x && x.id ? DD.getPassive(x.id) : x;
    return def ? RARITY[rarityOf(def)].rank : -1;
  }
  function maxLevelOf(def) { return def ? Math.max(1, Math.floor(num(def.maxLevel, (def.levels && def.levels.length) || 1))) : 1; }
  function weightOf(def) {
    const w = def && typeof def.weight === 'number' && isFinite(def.weight) ? def.weight : 0;
    return Math.max(0, w);
  }
  function orderIdx(def) { return ORDER.indexOf(rarityOf(def)); }
  function byTableOrder(a, b) { return orderIdx(a) - orderIdx(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }

  /** Every registered passive def in table order (cursed → legendary, then id). */
  function defs() {
    const bag = (DD.defs && DD.defs.passives) || {};
    return Object.keys(bag).map(function (k) { return bag[k]; }).filter(function (d) { return d && d.id; }).sort(byTableOrder);
  }
  /** Number of passives that can ever be rolled (weight > 0). */
  function count() { return defs().filter(function (d) { return weightOf(d) > 0; }).length; }

  /** A RunHero's passive entries, sanitized in place: [{ id, level }] (max 4, levels clamped, no duplicates). */
  function list(rh) {
    if (!rh) return [];
    if (!Array.isArray(rh.passives)) rh.passives = [];
    return rh.passives;
  }
  function sanitize(arr) {
    const out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (p) {
      const id = typeof p === 'string' ? p : p && typeof p.id === 'string' ? p.id : null;
      if (!id || out.some(function (o) { return o.id === id; })) return;
      const def = DD.getPassive(id);
      const lv = Math.max(1, Math.floor(num(p && p.level, 1)));
      out.push({ id: id, level: def ? Math.min(lv, maxLevelOf(def)) : Math.min(lv, 3) });
    });
    return out.slice(0, MAX);
  }
  function indexOf(rh, id) { return list(rh).findIndex(function (p) { return p && p.id === id; }); }
  function owned(rh, id) { const i = indexOf(rh, id); return i >= 0 ? rh.passives[i] : null; }
  function isMaxed(entry) { const def = entry && DD.getPassive(entry.id); return !!def && entry.level >= maxLevelOf(def); }
  function hasFreeSlot(rh) { return list(rh).length < MAX; }

  /** Defs this hero may roll now: weight > 0, `requires` passes, not owned at max level.
   *  opts: { noCursed, exclude: [ids] }. Without a RunHero every rollable def is listed (no requires check). */
  function eligible(rh, opts) {
    opts = opts || {};
    const ex = opts.exclude || [];
    const heroDef = rh ? DD.getHero(rh.id) : null;
    return defs().filter(function (d) {
      if (weightOf(d) <= 0 || ex.indexOf(d.id) >= 0) return false;
      if (opts.noCursed && d.rarity === 'cursed') return false;
      if (!rh) return true;
      const own = owned(rh, d.id);
      if (own && own.level >= maxLevelOf(d)) return false;
      if (typeof d.requires === 'function' && !DD.safe('requires of passive ' + d.id, d.requires, d, [rh, heroDef])) return false;
      return true;
    });
  }

  /** The d100 table for a hero: [{ id, def, weight, rarity, from, to, pct, lo, hi, upgrade, level }] where from..to
   *  is the entry's slice of 1..100 (tiny slices may share a number with a neighbour: the DM's screen hides the
   *  decimals). opts as eligible(). */
  /** Weight multiplier of a Blessing the hero already owns below its max level (DD.Balance.passives.ownedWeight):
   *  upgrades come up that much more often. [balance] */
  function ownedMult() {
    const m = DD.Balance && DD.Balance.passives && DD.Balance.passives.ownedWeight;
    return typeof m === 'number' && isFinite(m) && m >= 0 ? m : 1;
  }
  function tableWeight(rh, d) {
    const w = weightOf(d);
    return rh && owned(rh, d.id) ? w * ownedMult() : w;
  }

  function table(rh, opts) {
    const list = eligible(rh, opts);
    let total = 0;
    list.forEach(function (d) { total += tableWeight(rh, d); });
    let cum = 0;
    return list.map(function (d) {
      const w = tableWeight(rh, d);
      const lo = cum, hi = cum + w;
      cum = hi;
      const from = Math.min(100, Math.floor(lo / total * 100 + 1e-9) + 1);
      const to = Math.max(from, Math.min(100, Math.ceil(hi / total * 100 - 1e-9)));
      const own = rh ? owned(rh, d.id) : null;
      return {
        id: d.id, def: d, weight: w, rarity: rarityOf(d), from: from, to: to, pct: w / total * 100, lo: lo, hi: hi, total: total,
        upgrade: !!own, level: own ? own.level + 1 : 1,
      };
    });
  }

  /** The table entry at position u in [0, 1) of the total weight, plus the d100 shown for it. */
  function entryAt(tbl, u) {
    if (!tbl || !tbl.length) return null;
    const total = tbl[0].total;
    const pos = clamp(u, 0, 1 - 1e-12) * total;
    let e = tbl[tbl.length - 1];
    for (let i = 0; i < tbl.length; i++) if (pos < tbl[i].hi) { e = tbl[i]; break; }
    const d100 = clamp(Math.floor(pos / total * 100) + 1, e.from, e.to);
    return { entry: e, d100: d100 };
  }

  /** Roll once: { id, level, upgrade, d100, rarity, from, to, pct } or null when nothing can be rolled.
   *  opts: { noCursed, exclude }. */
  function roll(rh, rng, opts) {
    const tbl = table(rh, opts);
    if (!tbl.length) return null;
    const r = rng && typeof rng.next === 'function' ? rng : DD.RNG();
    const hit = entryAt(tbl, r.next());
    const e = hit.entry;
    return { id: e.id, level: e.level, upgrade: e.upgrade, d100: hit.d100, rarity: e.rarity, from: e.from, to: e.to, pct: Math.round(e.pct * 10) / 10 };
  }

  /** Re-check a stored roll against the hero's current passives (they may have changed since it was rolled):
   *  owned below max → upgrade to owned+1, not owned → new at level I. null when it can no longer apply. */
  function refresh(rh, r) {
    const def = r && DD.getPassive(r.id);
    if (!def) return null;
    const own = owned(rh, r.id);
    if (own && own.level >= maxLevelOf(def)) return null;
    const out = Object.assign({}, r, { upgrade: !!own, level: own ? own.level + 1 : 1, rarity: rarityOf(def) });
    return out;
  }

  // ---- descriptions -----------------------------------------------------------------------------------------
  function modsOf(entry) {
    const inst = entry && entry.def ? entry : DD.passiveInstance(entry);
    const out = { gold: 0, xp: 0, price: 0, heal: 0 };
    if (!inst || !inst.def.runMods) return out;
    const m = typeof inst.def.runMods === 'function'
      ? DD.safe('runMods of passive ' + inst.id, inst.def.runMods, inst.def, [inst.L, inst.level]) : inst.def.runMods;
    if (m && typeof m === 'object') MOD_KEYS.forEach(function (k) { out[k] = num(m[k], 0); });
    return out;
  }

  /** Display info for an entry ('id' | { id, level }): { id, def, known, name, icon, rarity, rarityName, color, rank,
   *  level, maxLevel, desc, next, prev, flavor, stats, mods, tags }. Never throws; unknown ids get a placeholder. */
  function describe(p) {
    const id = typeof p === 'string' ? p : p && p.id;
    const def = id ? DD.getPassive(id) : null;
    if (!def) {
      return { id: id || '?', def: null, known: false, name: 'Unknown Blessing', icon: '❔', rarity: 'common', rarityName: 'Unknown',
        color: RARITY.common.color, rank: 1, level: 1, maxLevel: 1, desc: 'This blessing fell off the table. The DM is looking for it.',
        next: '', prev: '', flavor: '', stats: null, mods: { gold: 0, xp: 0, price: 0, heal: 0 }, tags: [] };
    }
    const max = maxLevelOf(def);
    const level = clamp(Math.floor(num(p && p.level, 1)), 1, max);
    const inst = DD.passiveInstance({ id: id, level: level });
    const rar = rarityOf(def);
    return {
      id: id, def: def, known: true, name: def.name || id, icon: def.icon || '🎲', rarity: rar, rarityName: RARITY[rar].name,
      color: RARITY[rar].color, rank: RARITY[rar].rank, level: level, maxLevel: max,
      desc: DD.passiveDesc(inst),
      next: level < max ? DD.passiveDesc({ id: id, level: level + 1 }) : '',
      prev: level > 1 ? DD.passiveDesc({ id: id, level: level - 1 }) : '',
      flavor: def.flavor || '', stats: DD.passiveStats(inst), mods: modsOf(inst),
      tags: (def.tags || []).filter(function (t) { return typeof t === 'string'; }),
    };
  }

  /** A deterministic comedy line for a roll (same roll → same line). */
  function quip(r) {
    if (!r) return '';
    let key = r.rarity === 'cursed' ? 'cursed' : RARITY[r.rarity] ? r.rarity : 'common';
    if (r.upgrade) {
      const def = DD.getPassive(r.id);
      key = def && r.level >= maxLevelOf(def) ? 'maxed' : 'upgrade';
    }
    if (r.d100 === 1) key = 'nat1';
    else if (r.d100 === 100) key = 'nat100';
    const lines = QUIPS[key];
    const h = (DD.util.hash(String(r.id)) + num(r.d100, 0)) >>> 0;
    return lines[h % lines.length];
  }

  // ---- decisions ----------------------------------------------------------------------------------------------
  /** What a hero may do with a roll: { upgrade, keep, replace, discard, full, owned }. */
  function options(rh, r) {
    const fresh = refresh(rh, r);
    if (!fresh) return { upgrade: false, keep: false, replace: false, discard: true, full: !hasFreeSlot(rh), owned: false, stale: true };
    const full = !hasFreeSlot(rh);
    return {
      upgrade: fresh.upgrade, keep: !fresh.upgrade && !full, replace: !fresh.upgrade && list(rh).length > 0,
      discard: true, full: full, owned: fresh.upgrade,
    };
  }

  /** Index of the weakest owned passive: cursed first, then lowest rarity, then lowest level, then first slot. */
  function weakestSlot(rh) {
    let best = -1, bestKey = Infinity;
    list(rh).forEach(function (p, i) {
      const k = rank(p) * 100 + num(p.level, 1);
      if (k < bestKey) { bestKey = k; best = i; }
    });
    return best;
  }

  /** Headless policy (no UI, AutoPlay runs, recruits): upgrades and free slots are taken; when full, replace the
   *  weakest owned passive (cursed first, then lowest rarity) only if the new one is better; never take cursed when
   *  full. Returns { action: 'upgrade'|'keep'|'replace'|'discard', slot? }. */
  function policy(rh, r) {
    const fresh = refresh(rh, r);
    if (!fresh) return { action: 'discard' };
    if (fresh.upgrade) return { action: 'upgrade' };
    if (hasFreeSlot(rh)) return { action: 'keep' };
    if (fresh.rarity === 'cursed') return { action: 'discard' };
    const w = weakestSlot(rh);
    if (w >= 0 && rank(fresh) > rank(rh.passives[w])) return { action: 'replace', slot: w };
    return { action: 'discard' };
  }

  /** Apply a resolution to rh.passives. action: 'upgrade'|'keep' (accept: upgrades an owned passive, else takes a
   *  free slot) | 'replace' (slot = index to overwrite) | 'discard' | 'auto' (policy).
   *  Returns { ok, action, entry?, replaced?, reason?, needsReplace? } — never throws. */
  function apply(rh, r, action, slot) {
    if (!rh || !r) return { ok: false, reason: 'invalid' };
    list(rh);
    if (action === 'auto') {
      const p = policy(rh, r);
      action = p.action;
      slot = p.slot;
    }
    if (action === 'discard') return { ok: true, action: 'discard' };
    const fresh = refresh(rh, r);
    if (!fresh) return { ok: false, reason: 'stale' };
    const def = DD.getPassive(fresh.id);
    if (fresh.upgrade) {
      const own = owned(rh, fresh.id);
      own.level = Math.min(maxLevelOf(def), own.level + 1);
      return { ok: true, action: 'upgrade', entry: own };
    }
    if (action === 'keep' || action === 'upgrade') {
      if (!hasFreeSlot(rh)) return { ok: false, reason: 'full', needsReplace: true };
      const entry = { id: fresh.id, level: 1 };
      rh.passives.push(entry);
      return { ok: true, action: 'keep', entry: entry };
    }
    if (action === 'replace') {
      const i = Math.floor(num(slot, -1));
      if (!(i >= 0 && i < rh.passives.length)) return { ok: false, reason: 'slot', needsReplace: true };
      const old = rh.passives[i];
      const entry = { id: fresh.id, level: 1 };
      rh.passives[i] = entry;
      return { ok: true, action: 'replace', entry: entry, replaced: old };
    }
    return { ok: false, reason: 'invalid' };
  }

  // ---- run modifiers --------------------------------------------------------------------------------------------
  /** Summed runMods of one hero's passives: { gold, xp, price, heal } fractions (dead heroes: all 0). */
  function heroMods(rh) {
    const out = { gold: 0, xp: 0, price: 0, heal: 0 };
    if (!rh || rh.dead) return out;
    list(rh).forEach(function (p) {
      const m = modsOf(p);
      MOD_KEYS.forEach(function (k) { out[k] += m[k]; });
    });
    return out;
  }
  /** runMods summed over the living party (party-wide keys: gold, price). */
  function partyMods(run) {
    const out = { gold: 0, xp: 0, price: 0, heal: 0 };
    ((run && run.party) || []).forEach(function (rh) {
      const m = heroMods(rh);
      MOD_KEYS.forEach(function (k) { out[k] += m[k]; });
    });
    return out;
  }
  /** Multipliers the run layer applies: gold income ≥ 0, shop prices ≥ 50%, healing ≥ 0, and xpMult (v2, no XP):
   *  the hero's weight ≥ 0 in the level-up rotation draw among the lowest-level heroes (DD.Run). */
  function goldMult(run) { return Math.max(0, 1 + partyMods(run).gold); }
  function priceMult(run) { return Math.max(0.5, 1 + partyMods(run).price); }
  function xpMult(rh) { return Math.max(0, 1 + heroMods(rh).xp); }
  function healMult(rh) { return Math.max(0, 1 + heroMods(rh).heal); }

  DD.Passives = {
    MAX: MAX, ORDER: ORDER, RARITY: RARITY, QUIPS: QUIPS,
    defs: defs, count: count, list: list, sanitize: sanitize, owned: owned, indexOf: indexOf, isMaxed: isMaxed,
    hasFreeSlot: hasFreeSlot, maxLevel: function (id) { return maxLevelOf(typeof id === 'string' ? DD.getPassive(id) : id); },
    rank: rank, weight: weightOf, eligible: eligible, table: table, entryAt: entryAt, roll: roll, refresh: refresh,
    describe: describe, quip: quip, options: options, weakestSlot: weakestSlot, policy: policy, apply: apply,
    mods: modsOf, heroMods: heroMods, partyMods: partyMods, goldMult: goldMult, priceMult: priceMult, xpMult: xpMult, healMult: healMult,
  };
})();
