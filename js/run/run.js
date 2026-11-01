/* Dungeons and Degenerates — js/run/run.js
 * The run lifecycle (DD.Run, ARCHITECTURE §4.6 / §9.2, DESIGN §3/§5): the party of RunHeroes, gold, items and
 * consumables, act maps and node travel, combat start/finish (HP write-back, downs, scars, deaths, the level-up,
 * gold), rewards, level-ups, the event API (§9.5), shops, taverns, recruits, act completion, victory and game over.
 *
 * Leveling (v2, DESIGN §3 "Leveling is slow and shared"): there is no XP. After every won fight exactly one living
 * hero gains a level, drawn with the run RNG from the living heroes with the lowest level (the DM's "d4"), so every
 * hero reaches level N before anyone reaches N+1. Events level heroes up through the same rotation (or a named
 * hero); the old XP calls (grantXp / grantHeroXp / api.xp) are compatibility aliases for one such level-up.
 *
 * Logic is separate from navigation: every screen change goes through show(), which is skipped in headless
 * tests (DD.headless) unless DD.Run.useUi === true, so tests can drive whole runs without any UI.
 * The run is saved after every step. `state.pending` is the resumable UI step:
 *   { type: 'combat'|'rewards'|'event'|'shop'|'tavern', data }
 * A fight interrupted by a reload restarts from its beginning (the save is taken when the fight starts and is
 * not updated mid-fight). Level-ups and queued skill learns are non-blocking choices stored on the RunHeroes.
 * Random passives (the Table of Questionable Blessings, §9.6 / DD.Passives): every hero rolls once at run start
 * (auto-kept) and once per level gained; events and the shop grant extra rolls. Pending rolls live on the RunHero
 * (`passiveRolls`) and are rolled lazily on their own RNG stream, then stored, so a reload never re-rolls; without
 * the UI they are resolved by the headless policy at once.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const SAVE_KEY = 'run';
  const VERSION = 1;
  const FINAL_ACT = 3;
  const MAX_SKILLS = 4;
  const MAX_LEVEL = 10;
  const BASE_CONSUMABLES = 3;
  const DOWNS_TO_DIE = 3;
  // Start gold, out-of-combat heals and the "Objective Failed" penalty are DD.Balance knobs (js/data/balance.js).
  // (A lost objective is not a won fight: nobody levels up from it.)
  const FALLBACK_BAL = {
    gold: { start: 60 }, heal: { actClear: 0.5, tavern: 0.35, shop: 0.3 },
    objectiveFailed: { goldLoss: 0, countDowns: false },
  };
  function bal(group, key) {
    const g = (DD.Balance && DD.Balance[group]) || FALLBACK_BAL[group];
    const v = g ? g[key] : undefined;
    return v !== undefined ? v : FALLBACK_BAL[group][key];
  }
  function startGold() { return Math.max(0, Math.round(num(bal('gold', 'start'), 60))); }
  function healOf(key) { return Math.max(0, num(bal('heal', key), FALLBACK_BAL.heal[key])); }
  const DIFFICULTIES = ['casual', 'normal', 'brutal'];
  const SLOTS = ['weapon', 'armor', 'trinket'];
  const FALLBACK_STATS = { hp: 24, ap: 3, mov: 4, armor: 0 };
  const FALLBACK_EVENT = 'run_dm_unprepared';
  const RUN_STATS = ['combats', 'kills', 'damage', 'goldEarned', 'downs', 'deaths', 'elites', 'bosses', 'actsCleared', 'levelUps'];
  // Old RunHero / rewards-data fields from the XP era (dropped on load).
  const XP_LEFTOVERS = ['xp', 'xpByHero', 'levelsGained'];
  // Level-up perks (DESIGN §3): hp / dmg are repeatable, mov once at level 5+.
  const PERKS = {
    hp: { id: 'hp', icon: '❤️', name: 'Built Different', desc: '+4 max HP.', stats: { hp: 4 } },
    dmg: { id: 'dmg', icon: '💪', name: 'Unearned Confidence', desc: '+5% damage.', stats: { dmg: 0.05 } },
    mov: { id: 'mov', icon: '👟', name: 'New Shoes', desc: '+1 move (once, level 5+).', stats: { mov: 1 } },
  };

  let S = null;            // current RunState (DD.Run.state)
  let runRng = null;       // DD.RNG driving S (its state is saved as S.rngState)
  let fallbackRng = null;  // DD.Run.rng() when no run exists
  let passRng = null;      // DD.RNG for passive rolls (own stream, saved as S.passiveRngState)
  let fallbackPassRng = null;
  let combat = null;       // live DD.Combat state of the running fight (never saved)
  let inCombat = false;    // a fight is running: saves are suspended until finishCombat
  let combatToken = 0;     // identifies the running fight (stale onEnd callbacks are ignored)
  let lastScreen = null;   // last screen shown (by us or reported via 'ui:screen')
  let hold = 0;            // > 0 while a multi-part step runs: one save at its end instead of one per mutation
  let xpGate = null;       // { used } while an event choice resolves: the XP compat aliases level up once per resolve

  const Run = (DD.Run = {});
  Object.defineProperty(Run, 'state', {
    enumerable: true,
    get: function () { return S; },
    set: function (v) { S = v || null; runRng = null; passRng = null; inCombat = false; combat = null; },
  });

  // ---- small helpers ------------------------------------------------------------------------------
  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function round2(v) { return Math.round(v * 100) / 100; }
  /** True when every {token} of a narration line is filled by vars. */
  function tokensFilled(line, vars) {
    const re = /\{(\w+)\}/g;
    let m;
    while ((m = re.exec(String(line)))) if (vars[m[1]] === undefined || vars[m[1]] === null) return false;
    return true;
  }
  /**
   * A narration line (cosmetic RNG). Lines using a token this caller does not fill ("{hero}" without vars.hero) are
   * skipped, so authors may use tokens on keys that only some callers fill; '' when no line fits. With every line
   * usable the pick (one DD.rng draw) is the one DD.narrate would make.
   */
  function narr(key, vars) {
    vars = vars || {};
    const lines = DD.defs.narration && DD.defs.narration[key];
    if (!lines || !lines.length) return '';
    const ok = [];
    for (let i = 0; i < lines.length; i++) if (tokensFilled(lines[i], vars)) ok.push(i);
    if (!ok.length) return '';
    const pick = ok[Math.floor(DD.rng.next() * ok.length) % ok.length];
    return DD.narrate(key, vars, { next: function () { return (pick + 0.5) / lines.length; } }) || '';
  }
  function rng() {
    if (!S) return fallbackRng || (fallbackRng = DD.RNG('no-run'));
    if (!runRng) {
      runRng = DD.RNG(S.seed);
      if (typeof S.rngState === 'number' && isFinite(S.rngState)) runRng.setState(S.rngState);
    }
    return runRng;
  }
  /** RNG of the passive table: its own stream (seed + ':passives') so rolls never shift loot or maps. */
  function prng() {
    if (!S) return fallbackPassRng || (fallbackPassRng = DD.RNG('no-run:passives'));
    if (!passRng) {
      passRng = DD.RNG(String(S.seed) + ':passives');
      if (typeof S.passiveRngState === 'number' && isFinite(S.passiveRngState)) passRng.setState(S.passiveRngState);
    }
    return passRng;
  }
  function heroAt(idx) { return S && typeof idx === 'number' ? S.party[idx] || null : null; }
  function idxOf(heroId) { return S ? S.party.findIndex(function (h) { return h && h.id === heroId; }) : -1; }
  function aliveIdx() {
    const out = [];
    if (S) S.party.forEach(function (h, i) { if (h && !h.dead) out.push(i); });
    return out;
  }
  function heroName(idxOrHero) {
    const rh = idxOrHero && typeof idxOrHero === 'object' ? idxOrHero : heroAt(idxOrHero);
    if (!rh) return 'Nobody';
    const d = DD.getHero(rh.id);
    return d ? d.name : rh.id;
  }
  function normalizeKind(k) { return k === 'elite' || k === 'boss' ? k : 'normal'; }
  function partyLevel() {
    const alive = aliveIdx();
    if (!alive.length) return 1;
    return Math.round(alive.reduce(function (a, i) { return a + S.party[i].level; }, 0) / alive.length);
  }

  // ---- navigation (the only place that touches DD.UI) -------------------------------------------------
  function uiOn() { return Run.useUi === true || (Run.useUi !== false && !DD.headless); }
  function show(id, params) {
    lastScreen = id;
    if (!uiOn() || !DD.UI || typeof DD.UI.show !== 'function') return false;
    DD.safe('DD.UI.show(' + id + ')', DD.UI.show, DD.UI, [id, params || {}]);
    return true;
  }

  // ---- persistence -------------------------------------------------------------------------------------
  /** JSON-safe deep copy: drops functions, DOM nodes, '__'-prefixed keys and cyclic references. */
  function plain(v, stack) {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function' || typeof v === 'symbol' || (typeof v === 'number' && !isFinite(v))) return undefined;
      return v;
    }
    if (stack.indexOf(v) >= 0 || stack.length > 40 || (typeof Node !== 'undefined' && v instanceof Node)) return undefined;
    stack.push(v);
    let out;
    if (Array.isArray(v)) {
      out = v.map(function (x) { const c = plain(x, stack); return c === undefined ? null : c; });
    } else {
      out = {};
      for (const k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k) || k.indexOf('__') === 0) continue;
        const c = plain(v[k], stack);
        if (c !== undefined) out[k] = c;
      }
    }
    stack.pop();
    return out;
  }

  function save() {
    if (!S || S.over || inCombat || hold) return false;
    S.rngState = rng().getState();
    S.passiveRngState = prng().getState();
    return DD.Storage.set(SAVE_KEY, plain(S, []));
  }
  function changed() { DD.Events.emit('run:changed', { state: S }); }
  /** Persist + notify after every mutation (saves are skipped while a fight is running). */
  function touch() { if (S) { save(); changed(); } }

  function validSave(raw) {
    return !!raw && typeof raw === 'object' && raw.version === VERSION && !raw.over &&
      Array.isArray(raw.party) && raw.party.length > 0 && !!raw.map && !!raw.map.nodes && typeof raw.map.nodes === 'object';
  }

  function normalizeHero(h) {
    h.level = clamp(Math.floor(num(h.level, 1)), 1, MAX_LEVEL);
    delete h.xp;   // XP-era saves: the level (and any pending level-ups) carry over, the XP is gone
    h.skills = (Array.isArray(h.skills) ? h.skills : []).filter(function (s) { return s && typeof s.id === 'string'; })
      .map(function (s) { return { id: s.id, level: clamp(Math.floor(num(s.level, 1)), 1, 3) }; }).slice(0, MAX_SKILLS);
    h.items = Object.assign({ weapon: null, armor: null, trinket: null }, h.items && typeof h.items === 'object' ? h.items : {});
    if (!Array.isArray(h.scars)) h.scars = [];
    if (!Array.isArray(h.perks)) h.perks = [];
    h.downs = num(h.downs, 0);
    h.kills = num(h.kills, 0);
    h.dead = !!h.dead;
    h.pendingLevels = Math.max(0, Math.floor(num(h.pendingLevels, 0)));
    if (!Array.isArray(h.levelChoices) || !h.levelChoices.length) h.levelChoices = null;
    // saves from before the Table of Questionable Blessings get their rolls once loaded (migratePassives)
    if (!Array.isArray(h.passives)) h.__migratePassives = true;
    h.passives = DD.Passives ? DD.Passives.sanitize(h.passives) : (Array.isArray(h.passives) ? h.passives : []);
    h.passiveRolls = (Array.isArray(h.passiveRolls) ? h.passiveRolls : []).map(normalizeJob).filter(Boolean);
    if (h.dead) h.passiveRolls = [];
    h.hp = h.dead ? 0 : clamp(Math.round(num(h.hp, 1)), 1, heroStats(h).maxHp);
  }

  /** A pending passive roll: { src: 'start'|'level'|'event'|'shop'|'debug', lv, noCursed, exclude, roll|null }. */
  function normalizeJob(j) {
    if (!j || typeof j !== 'object') return null;
    const r = j.roll && typeof j.roll === 'object' && typeof j.roll.id === 'string' ? j.roll : null;
    return {
      src: typeof j.src === 'string' && j.src ? j.src : 'level', lv: Math.max(1, Math.floor(num(j.lv, 1))), noCursed: !!j.noCursed,
      exclude: (Array.isArray(j.exclude) ? j.exclude : []).filter(function (x) { return typeof x === 'string'; }),
      roll: r ? {
        id: r.id, level: Math.max(1, Math.floor(num(r.level, 1))), upgrade: !!r.upgrade, d100: clamp(Math.floor(num(r.d100, 50)), 1, 100),
        rarity: typeof r.rarity === 'string' ? r.rarity : 'common', from: num(r.from, 1), to: num(r.to, 100), pct: num(r.pct, 0),
      } : null,
    };
  }

  /** Fill fields missing from older saves or hand-built states. */
  function normalize(s) {
    s.difficulty = DIFFICULTIES.indexOf(s.difficulty) >= 0 ? s.difficulty : 'normal';
    s.act = clamp(Math.floor(num(s.act, 1)), 1, FINAL_ACT);
    s.gold = Math.max(0, Math.round(num(s.gold, startGold())));
    ['visited', 'inventory', 'consumables', 'seenEvents', 'learnQueue', 'fallen', 'fought'].forEach(function (k) {
      if (!Array.isArray(s[k])) s[k] = [];
    });
    s.maxConsumables = Math.max(1, Math.round(num(s.maxConsumables, BASE_CONSUMABLES)));
    s.flags = s.flags && typeof s.flags === 'object' ? s.flags : {};
    const st = s.stats && typeof s.stats === 'object' ? s.stats : {};
    RUN_STATS.forEach(function (k) { st[k] = num(st[k], 0); });
    st.startedAt = num(st.startedAt, Date.now());
    s.stats = st;
    s.pending = s.pending && typeof s.pending === 'object' && s.pending.type ? s.pending : null;
    if (s.pending && (!s.pending.data || typeof s.pending.data !== 'object')) s.pending.data = {};
    if (s.pending && s.pending.type === 'rewards') {
      const d = s.pending.data;
      XP_LEFTOVERS.forEach(function (k) { delete d[k]; });
      if (!Array.isArray(d.levelUps)) d.levelUps = [];
    }
    s.queuedCombat = s.queuedCombat || null;
    s.nodeId = s.nodeId || null;
    s.over = s.over || null;
    s.summary = s.summary || null;
    s.seq = num(s.seq, 0);
    s.goldCarry = clamp(num(s.goldCarry, 0), 0, 0.999999);
    if (!(typeof s.passiveRngState === 'number' && isFinite(s.passiveRngState))) delete s.passiveRngState;
    s.party = s.party.filter(function (h) { return h && typeof h.id === 'string'; });
    s.party.forEach(normalizeHero);
    return s;
  }

  /** Old saves (no `passives`): the run-start roll plus one roll per level already chosen, resolved by the policy;
   *  levels still waiting for their choice get a pending roll like any fresh level-up. */
  function migratePassives() {
    if (!S) return;
    let any = false;
    hold++; // one save once every hero is migrated
    try {
      S.party.forEach(function (rh, idx) {
        if (!rh.__migratePassives) return;
        delete rh.__migratePassives;
        any = true;
        if (rh.dead) return;
        autoRoll(rh, 'start', { noCursed: true });
        for (let lv = 2; lv <= rh.level - rh.pendingLevels; lv++) autoRoll(rh, 'level', { lv: lv });
        for (let k = 0; k < rh.pendingLevels; k++) queueRoll(idx, 'level', { lv: rh.level - rh.pendingLevels + 1 + k });
      });
    } finally { hold--; }
    if (any) save();
  }

  function load() {
    const raw = DD.Storage.get(SAVE_KEY, null);
    if (!validSave(raw)) return false;
    S = normalize(raw);
    runRng = null;
    passRng = null;
    combat = null;
    inCombat = false;
    migratePassives();
    changed();
    return true;
  }
  function hasSave() { return validSave(DD.Storage.get(SAVE_KEY, null)); }
  function clear() {
    DD.Storage.remove(SAVE_KEY);
    S = null;
    runRng = null;
    passRng = null;
    combat = null;
    inCombat = false;
    changed();
  }
  /** Give up the current run: recorded in the Hall of Fame as 'abandoned', save deleted. Returns the summary. */
  function abandon() {
    if (!S) return null;
    const sum = S.over ? S.summary : endRun('abandoned', { silent: true });
    clear();
    return sum;
  }

  // ---- heroes --------------------------------------------------------------------------------------------
  function addStats(acc, stats) {
    if (!stats || typeof stats !== 'object') return;
    for (const k in acc) if (typeof stats[k] === 'number' && isFinite(stats[k])) acc[k] += stats[k];
  }

  /** base + growth*(level-1) + items + scars + perks + Blessings -> { maxHp, ap, mov, armor, dmg, heal, range, block,
   *  hype, init } (init: the v2 initiative modifier, which DD.Combat adds to the d20). Accepts a RunHero (any
   *  RunHero-like object) or a party index. */
  function heroStats(rh) {
    if (typeof rh === 'number') rh = heroAt(rh);
    if (!rh) return { maxHp: FALLBACK_STATS.hp, ap: 3, mov: 4, armor: 0, dmg: 0, heal: 0, range: 0, block: 0, hype: 0, init: 0 };
    const def = DD.getHero(rh.id);
    const base = (def && def.stats) || FALLBACK_STATS;
    const growth = (def && def.growth) || { hp: 4 };
    const lv = clamp(Math.floor(num(rh.level, 1)), 1, MAX_LEVEL);
    const acc = {
      hp: num(base.hp, FALLBACK_STATS.hp), ap: num(base.ap, 3), mov: num(base.mov, 4), armor: num(base.armor, 0),
      dmg: 0, heal: 0, range: 0, block: 0, hype: 0, init: num(base.init, 0),
    };
    for (const k in growth) if (k in acc && typeof growth[k] === 'number') acc[k] += growth[k] * (lv - 1);
    const items = rh.items || {};
    SLOTS.forEach(function (slot) { const it = items[slot] && DD.getItem(items[slot]); if (it) addStats(acc, it.stats); });
    (rh.scars || []).forEach(function (id) { const sc = DD.getScar(id); if (sc) addStats(acc, sc.stats); });
    (rh.perks || []).forEach(function (id) { if (PERKS[id]) addStats(acc, PERKS[id].stats); });
    (rh.passives || []).forEach(function (p) { addStats(acc, DD.passiveStats(p)); });
    return {
      maxHp: Math.max(1, Math.round(acc.hp)), ap: Math.max(1, Math.round(acc.ap)), mov: Math.max(1, Math.round(acc.mov)),
      armor: Math.max(0, Math.round(acc.armor)), dmg: round2(Math.max(-0.9, acc.dmg)), heal: round2(Math.max(-0.9, acc.heal)),
      range: Math.round(acc.range), block: Math.max(0, Math.round(acc.block)), hype: Math.round(acc.hype), init: Math.round(acc.init),
    };
  }

  /** Run fn (which changes max HP inputs) and move current HP by the same delta (no equip/unequip heal exploits). */
  function withMaxHp(rh, fn) {
    const before = heroStats(rh).maxHp;
    fn();
    const after = heroStats(rh).maxHp;
    if (!rh.dead) rh.hp = clamp(Math.round(rh.hp + after - before), 1, after);
  }

  function socketable(def, id) {
    const s = DD.getSkill(id);
    return !!s && s.owner !== 'enemy' && s.owner !== 'summon' && (!def || (id !== def.basic && id !== def.signature));
  }
  function genericSkillIds() {
    return Object.keys(DD.defs.skills).filter(function (id) { return DD.defs.skills[id] && DD.defs.skills[id].owner === 'generic'; });
  }
  /** Unlearned socketable skills for a RunHero: its hero pool, plus the generic pool when opts.generic. */
  function learnableFor(rh, opts) {
    if (!rh) return [];
    const def = DD.getHero(rh.id);
    const have = (rh.skills || []).map(function (s) { return s.id; });
    const out = [];
    function consider(id) { if (have.indexOf(id) < 0 && out.indexOf(id) < 0 && socketable(def, id)) out.push(id); }
    ((def && Array.isArray(def.skillPool) && def.skillPool) || []).forEach(consider);
    if (opts && opts.generic) genericSkillIds().forEach(consider);
    return out;
  }
  function skillMax(id) {
    const s = DD.getSkill(id);
    return s ? clamp(Math.floor(num(s.maxLevel, (s.levels && s.levels.length) || 1)), 1, 3) : 1;
  }
  /** Indices of a RunHero's socketed skills that are below their max level. */
  function upgradableFor(rh) {
    const out = [];
    ((rh && rh.skills) || []).forEach(function (s, i) { if (s.level < skillMax(s.id)) out.push(i); });
    return out;
  }

  /** Grow a fresh recruit to `level` with a sensible auto-build: learn pool skills until 4 are socketed,
   *  then upgrade the lowest skill, then +HP perks. */
  function autoLevel(rh, level) {
    const r = rng();
    const target = clamp(Math.floor(level), 1, MAX_LEVEL);
    while (rh.level < target) {
      rh.level++;
      const learn = rh.skills.length < MAX_SKILLS ? learnableFor(rh, { generic: false }) : [];
      const ups = upgradableFor(rh);
      if (learn.length) {
        rh.skills.push({ id: r.pick(learn), level: 1 });
      } else if (ups.length) {
        let low = Infinity;
        ups.forEach(function (i) { low = Math.min(low, rh.skills[i].level); });
        rh.skills[r.pick(ups.filter(function (i) { return rh.skills[i].level === low; }))].level++;
      } else {
        rh.perks.push('hp');
      }
    }
  }

  /** New RunHero from a hero def: starting skills at level 1, full HP (auto-built when level > 1). */
  function makeRunHero(heroId, level) {
    const def = DD.getHero(heroId);
    const start = def && Array.isArray(def.startingSkills) ? def.startingSkills : [];
    const rh = {
      id: heroId, level: 1, hp: 1,
      skills: start.filter(function (id, i, a) { return typeof id === 'string' && a.indexOf(id) === i; })
        .slice(0, MAX_SKILLS).map(function (id) { return { id: id, level: 1 }; }),
      items: { weapon: null, armor: null, trinket: null }, scars: [], perks: [], downs: 0, dead: false, kills: 0,
      pendingLevels: 0, levelChoices: null, passives: [], passiveRolls: [],
    };
    if (level > 1) autoLevel(rh, level);
    rh.hp = heroStats(rh).maxHp;
    return rh;
  }

  /** A recruit's (or debug hero's) Blessings: the run-start roll plus one roll per level above 1, all resolved by
   *  the headless policy. Returns the resolution results. */
  function autoRollPassivesFor(rh) {
    const out = [];
    if (!rh || rh.dead) return out;
    const push = function (r) { if (r) out.push(r); };
    push(autoRoll(rh, 'start', { noCursed: true }));
    for (let lv = 2; lv <= rh.level; lv++) push(autoRoll(rh, 'level', { lv: lv }));
    return out;
  }

  function makeMap(act) {
    return DD.RunMap.generate(act, DD.RNG(String(S.seed) + ':map:' + act), { run: S, exclude: S.fought });
  }

  /** Start a new run: RunHeroes for 1-4 hero ids, act 1 map, then the map screen. Returns the state. */
  function newRun(heroIds, difficulty, seed) {
    const ids = (Array.isArray(heroIds) ? heroIds : [heroIds]).filter(function (id, i, a) {
      return typeof id === 'string' && id && a.indexOf(id) === i;
    }).slice(0, 4);
    if (!ids.length) { DD.warn('DD.Run.newRun: no heroes given'); return null; }
    ids.forEach(function (id) { if (!DD.getHero(id)) DD.warn('DD.Run.newRun: unknown hero "' + id + '"'); });
    if (seed === undefined || seed === null || seed === '') seed = DD.newSeed();
    combat = null;
    inCombat = false;
    runRng = DD.RNG(seed);
    passRng = null;
    S = {
      version: VERSION, seed: seed, rngState: runRng.getState(),
      difficulty: DIFFICULTIES.indexOf(difficulty) >= 0 ? difficulty : 'normal',
      act: 1, map: null, nodeId: null, visited: [],
      party: [], gold: startGold(), inventory: [], consumables: [], maxConsumables: BASE_CONSUMABLES,
      stats: { combats: 0, kills: 0, damage: 0, goldEarned: 0, downs: 0, deaths: 0, elites: 0, bosses: 0, actsCleared: 0, levelUps: 0, startedAt: Date.now() },
      flags: {}, seenEvents: [], pending: null,
      learnQueue: [], fallen: [], fought: [], queuedCombat: null, over: null, summary: null, seq: 0,
    };
    S.party = ids.map(function (id) { return makeRunHero(id, 1); });
    // "Session Zero character quirks": one roll per hero on the Table of Questionable Blessings, never cursed, kept
    S.party.forEach(function (rh) { autoRoll(rh, 'start', { noCursed: true }); });
    S.maxConsumables = computeMaxConsumables();
    S.map = makeMap(1);
    touch();
    show('map', { act: 1, intro: true, text: narr('run_start') });
    return S;
  }

  // ---- gold, items, consumables -----------------------------------------------------------------------
  /** Gold income after the party's passive runMods.gold (a fractional carry keeps small gains exact over time). */
  function goldIncome(n) {
    const m = DD.Passives ? DD.Passives.goldMult(S) : 1;
    if (m === 1 || !(n > 0)) return n;
    const exact = n * m + num(S.goldCarry, 0);
    const out = Math.floor(exact + 1e-9);
    S.goldCarry = clamp(exact - out, 0, 0.999999);
    return out;
  }
  /** Add (or with n < 0, remove) gold, clamped at 0. Income (n > 0) gets the party's passive gold bonus unless
   *  opts.raw. Returns the actual change. */
  function addGold(n, opts) {
    if (!S) return 0;
    const before = S.gold;
    let amount = Math.round(num(+n, 0));
    if (amount > 0 && !(opts && opts.raw)) amount = goldIncome(amount);
    S.gold = Math.max(0, before + amount);
    const delta = S.gold - before;
    if (delta > 0) S.stats.goldEarned += delta;
    if (delta) DD.Events.emit('run:gold', { gold: S.gold, delta: delta });
    touch();
    return delta;
  }
  function spendGold(n) {
    n = Math.max(0, Math.round(num(+n, 0)));
    if (!S || S.gold < n) return false;
    S.gold -= n;
    if (n) DD.Events.emit('run:gold', { gold: S.gold, delta: -n });
    touch();
    return true;
  }
  /** Put an item in the party bag (equip it with equip()/autoEquip()). */
  function addItem(id) {
    if (!S || !id || !DD.getItem(id)) return false;
    S.inventory.push(id);
    touch();
    return true;
  }
  function canEquip(idx, itemId) {
    const rh = heroAt(idx), def = DD.getItem(itemId);
    return !!rh && !rh.dead && !!def && SLOTS.indexOf(def.slot) >= 0 && (!def.hero || def.hero === rh.id);
  }
  /** Equip a bag item; the previous item in that slot goes back to the bag. */
  function equip(idx, itemId) {
    if (!S || !canEquip(idx, itemId)) return false;
    const at = S.inventory.indexOf(itemId);
    if (at < 0) return false;
    const rh = S.party[idx];
    const slot = DD.getItem(itemId).slot;
    withMaxHp(rh, function () {
      S.inventory.splice(at, 1);
      if (rh.items[slot]) S.inventory.push(rh.items[slot]);
      rh.items[slot] = itemId;
    });
    touch();
    return true;
  }
  function unequip(idx, slot) {
    const rh = heroAt(idx);
    if (!rh || !rh.items || !rh.items[slot]) return false;
    withMaxHp(rh, function () { S.inventory.push(rh.items[slot]); rh.items[slot] = null; });
    touch();
    return true;
  }
  /** Equip a bag item on a living hero whose slot is empty (preferIdx first). Cursed items are never
   *  auto-equipped. Returns the hero index, or -1 when the item stays in the bag. */
  function autoEquip(itemId, preferIdx) {
    const def = DD.getItem(itemId);
    if (!S || !def || def.rarity === 'cursed' || S.inventory.indexOf(itemId) < 0) return -1;
    let order = aliveIdx();
    if (typeof preferIdx === 'number' && order.indexOf(preferIdx) >= 0) {
      order = [preferIdx].concat(order.filter(function (i) { return i !== preferIdx; }));
    }
    for (let i = 0; i < order.length; i++) {
      if (canEquip(order[i], itemId) && !S.party[order[i]].items[def.slot]) { equip(order[i], itemId); return order[i]; }
    }
    return -1;
  }
  /** 3 slots + `consumableSlots` from living heroes' defs (or their passive), e.g. Josiah's Apothecary. */
  function computeMaxConsumables() {
    let n = BASE_CONSUMABLES;
    if (S) S.party.forEach(function (rh) {
      if (!rh || rh.dead) return;
      const def = DD.getHero(rh.id);
      if (!def) return;
      n += Math.max(0, Math.floor(num(def.consumableSlots, 0) || num(def.passive && def.passive.consumableSlots, 0)));
    });
    return n;
  }
  function addConsumable(id) {
    if (!S || !id || !DD.getConsumable(id) || S.consumables.length >= S.maxConsumables) return false;
    S.consumables.push(id);
    touch();
    return true;
  }
  function removeConsumable(i) {
    if (!S || !(i >= 0 && i < S.consumables.length)) return null;
    const id = S.consumables.splice(i, 1)[0];
    touch();
    return id;
  }

  // ---- health & scars ----------------------------------------------------------------------------------
  /** Out-of-combat healing (rests, shops, events, rewards); the hero's passive runMods.heal scales it. */
  function healHero(idx, amount) {
    const rh = heroAt(idx);
    if (!rh || rh.dead || !(amount > 0)) return 0;
    const before = rh.hp;
    const mult = DD.Passives ? DD.Passives.healMult(rh) : 1;
    rh.hp = clamp(Math.round(rh.hp + amount * mult), 1, heroStats(rh).maxHp);
    touch();
    return rh.hp - before;
  }
  /** Heal every living hero by fraction x max HP. Returns the total healed. */
  function healParty(fraction) {
    if (!S || !(fraction > 0)) return 0;
    let total = 0;
    aliveIdx().forEach(function (i) {
      total += healHero(i, Math.max(1, Math.round(heroStats(S.party[i]).maxHp * fraction)));
    });
    return total;
  }
  /** Out-of-combat damage (events): never below 1 HP. Returns the damage dealt. */
  function damageHero(idx, n) {
    const rh = heroAt(idx);
    if (!rh || rh.dead || !(n > 0)) return 0;
    const before = rh.hp;
    rh.hp = Math.max(1, rh.hp - Math.round(n));
    touch();
    return before - rh.hp;
  }
  /** Give a scar (random one the hero does not have when scarId is omitted). Returns the scar id or null. */
  function addScar(idx, scarId) {
    const rh = heroAt(idx);
    if (!rh || rh.dead) return null;
    let id = scarId;
    if (!id) {
      const pool = Object.keys(DD.defs.scars).filter(function (s) { return rh.scars.indexOf(s) < 0; })
        .map(function (s) { return DD.defs.scars[s]; });
      if (!pool.length) return null;
      id = rng().weighted(pool, function (d) { return num(d.weight, 1); }).id;
    }
    if (!DD.getScar(id) || rh.scars.indexOf(id) >= 0) return null;
    withMaxHp(rh, function () { rh.scars.push(id); });
    touch();
    return id;
  }
  /** Remove a scar (the most recent one when scarId is omitted). Returns the removed id or null. */
  function removeScar(idx, scarId) {
    const rh = heroAt(idx);
    if (!rh || !rh.scars.length) return null;
    const at = scarId ? rh.scars.indexOf(scarId) : rh.scars.length - 1;
    if (at < 0) return null;
    let removed = null;
    withMaxHp(rh, function () { removed = rh.scars.splice(at, 1)[0]; });
    touch();
    return removed;
  }
  function mostScarred() {
    let best = -1;
    aliveIdx().forEach(function (i) {
      if (S.party[i].scars.length && (best < 0 || S.party[i].scars.length > S.party[best].scars.length)) best = i;
    });
    return best;
  }

  // ---- skills ---------------------------------------------------------------------------------------------
  /** Learn a skill at level 1. With 4 skills socketed, replaceIdx (0-3) names the one that is forgotten;
   *  without it nothing happens. Returns true when learned. */
  function learnSkill(idx, skillId, replaceIdx) {
    const rh = heroAt(idx);
    if (!rh || rh.dead || !DD.getSkill(skillId) || rh.skills.some(function (s) { return s.id === skillId; })) return false;
    if (rh.skills.length < MAX_SKILLS) rh.skills.push({ id: skillId, level: 1 });
    else if (typeof replaceIdx === 'number' && replaceIdx >= 0 && replaceIdx < rh.skills.length) rh.skills[replaceIdx] = { id: skillId, level: 1 };
    else return false;
    rh.levelChoices = null;
    touch();
    return true;
  }
  /** +1 level for socketed skill skillIdx (max III or the skill's own max). */
  function upgradeSkill(idx, skillIdx) {
    const rh = heroAt(idx);
    const sk = rh && !rh.dead ? rh.skills[skillIdx] : null;
    if (!sk || sk.level >= skillMax(sk.id)) return false;
    sk.level++;
    rh.levelChoices = null;
    touch();
    return true;
  }

  const FORGET_LINES = [
    '{hero} forgot {skill}. It was a phase.',
    '{hero} unlearned {skill} to make room. Brain space is expensive.',
    '{hero} forgot {skill}. Professor Marbles nods in solidarity.',
    '{hero} traded {skill} for a fresh memory. No refunds.',
  ];
  /** Flavor line for replacing a skill ("Professor Marbles forgot it. He forgets things."). */
  function forgetText(idx, skillId) {
    const s = DD.getSkill(skillId);
    const vars = { hero: heroName(idx), skill: s ? s.name : skillId };
    if (/marbles/i.test(vars.hero)) return DD.util.fmt('{hero} forgot {skill}. He forgets things.', vars);
    return DD.util.fmt(DD.util.pick(FORGET_LINES, DD.rng), vars);
  }

  /** Give a hero a skill: learned at once when a socket is free (or replaceIdx names one; -1 = skip), otherwise
   *  queued for the replace-or-skip prompt (pendingLearns). Returns { ok, learned?, queued?, skipped?, text }. */
  function giveSkill(idx, skillId, source, replaceIdx) {
    const rh = heroAt(idx);
    const s = DD.getSkill(skillId);
    if (!rh || rh.dead || !s) return { ok: false, reason: 'invalid', text: 'Nobody here can learn that.' };
    const name = heroName(idx);
    if (rh.skills.some(function (x) { return x.id === skillId; })) {
      return { ok: false, reason: 'known', text: name + ' already knows ' + s.name + '.' };
    }
    if (rh.skills.length < MAX_SKILLS) {
      learnSkill(idx, skillId);
      return { ok: true, learned: true, text: name + ' learned ' + s.name + '!' };
    }
    if (replaceIdx === -1) {
      touch();
      return { ok: true, skipped: true, text: name + ' decided ' + s.name + ' was not worth the brain space.' };
    }
    if (typeof replaceIdx === 'number' && rh.skills[replaceIdx]) {
      const old = rh.skills[replaceIdx].id;
      learnSkill(idx, skillId, replaceIdx);
      return { ok: true, learned: true, replaced: old, text: forgetText(idx, old) + ' ' + name + ' learned ' + s.name + '!' };
    }
    S.learnQueue.push({ heroId: rh.id, skillId: skillId, source: source || 'tome' });
    touch();
    return { ok: true, queued: true, text: name + ' must forget a skill to learn ' + s.name + '. Choose on the level-up screen.' };
  }
  /** Queued "learn X (replace or skip)" prompts: [{ index, heroIdx, heroId, skillId, source }]. */
  function pendingLearns() {
    if (!S) return [];
    const out = [];
    S.learnQueue.forEach(function (q, i) {
      const idx = idxOf(q.heroId);
      if (idx >= 0 && !S.party[idx].dead) out.push({ index: i, heroIdx: idx, heroId: q.heroId, skillId: q.skillId, source: q.source });
    });
    return out;
  }
  /** Resolve queued learn `i` (its `index`): replaceIdx = socket to overwrite (0-3) or -1 to skip. */
  function resolveLearn(i, replaceIdx) {
    const q = S && S.learnQueue[i];
    if (!q) return { ok: false, reason: 'invalid', text: '' };
    const idx = idxOf(q.heroId);
    const rh = heroAt(idx);
    const full = rh && !rh.dead && rh.skills.length >= MAX_SKILLS && !rh.skills.some(function (s) { return s.id === q.skillId; });
    if (full && replaceIdx !== -1 && !(typeof replaceIdx === 'number' && rh.skills[replaceIdx])) {
      return { ok: false, needsReplace: true, reason: 'replace', text: 'Pick a skill to forget (or skip).' };
    }
    S.learnQueue.splice(i, 1);
    const res = rh && !rh.dead ? giveSkill(idx, q.skillId, q.source, replaceIdx) : { ok: false, reason: 'gone', text: 'That hero is gone.' };
    touch();
    return res;
  }

  // ---- level-ups (v2: no XP, one hero per won fight, the lowest level first) ---------------------------------
  /** Level-ups a won fight of `kind` grants (DD.Rewards.levelUpsFor: one constant, DD.Balance.leveling overrides). */
  function levelUpsPerWin(kind) {
    return DD.Rewards && typeof DD.Rewards.levelUpsFor === 'function' ? DD.Rewards.levelUpsFor(kind) : 1;
  }

  /** Living heroes the next rotation level-up is drawn from: those with the lowest level (below the max), in
   *  party order. [] when every living hero is at the max level. */
  function levelUpCandidates() {
    if (!S) return [];
    const open = aliveIdx().filter(function (i) { return S.party[i].level < MAX_LEVEL; });
    let low = Infinity;
    open.forEach(function (i) { low = Math.min(low, S.party[i].level); });
    return open.filter(function (i) { return S.party[i].level === low; });
  }
  /** { candidates: [heroIdx], ids, names, level (theirs), maxed } — who the DM rolls among next (UI hints). */
  function nextLevelUp() {
    const c = levelUpCandidates();
    return {
      candidates: c, ids: c.map(function (i) { return S.party[i].id; }), names: c.map(heroName),
      level: c.length ? S.party[c[0]].level : MAX_LEVEL, maxed: !!S && !c.length && aliveIdx().length > 0,
    };
  }
  /** A hero's weight in the rotation draw: 1, + its Blessings' runMods.xp ("Teacher's Pet"; ARCHITECTURE §9.6). */
  function rotationWeight(rh) {
    const w = DD.Passives && rh ? num(DD.Passives.xpMult(rh), 1) : 1;
    return w > 0 ? w : 0;
  }

  /** Hero idx gains one level: HP growth at once, a pending level-up choice and a pending roll on the Table of
   *  Questionable Blessings. info: { src, rotation, die, face, candidates }. Returns the LevelUp record or null. */
  function gainLevel(idx, info) {
    const rh = heroAt(idx);
    if (!rh || rh.dead || rh.level >= MAX_LEVEL) return null;
    info = info || {};
    const from = rh.level;
    withMaxHp(rh, function () { rh.level++; });
    rh.pendingLevels++;
    queueRoll(idx, 'level', { lv: rh.level });
    S.stats.levelUps = num(S.stats.levelUps, 0) + 1;
    const cands = Array.isArray(info.candidates) ? info.candidates.slice() : [idx];
    touch();
    return {
      heroIdx: idx, heroId: rh.id, name: heroName(idx), from: from, to: rh.level, src: info.src || 'fight',
      rotation: !!info.rotation, die: num(info.die, 0), face: num(info.face, 0),
      candidates: cands, candidateIds: cands.map(function (i) { return S.party[i] ? S.party[i].id : null; }),
    };
  }

  /** One level-up through the rotation: the DM rolls a d(N) among the N lowest-level living heroes (one run-RNG
   *  draw; none when only one hero is behind). Returns the LevelUp record, or null when everyone is maxed. */
  function rotationLevelUp(src) {
    const cands = levelUpCandidates();
    if (!cands.length) return null;
    let k = 0;
    if (cands.length > 1) {
      const w = cands.map(function (i) { return rotationWeight(S.party[i]); });
      const total = w.reduce(function (a, b) { return a + b; }, 0);
      const u = rng().next();
      if (total > 0) {
        let acc = 0;
        k = cands.length - 1;
        for (let j = 0; j < cands.length; j++) { acc += w[j] / total; if (u < acc) { k = j; break; } }
      } else k = Math.floor(u * cands.length) % cands.length;
    }
    return gainLevel(cands[k], { src: src, rotation: true, die: cands.length, face: k + 1, candidates: cands });
  }

  /** A level-up: hero idx (named; null when that hero is dead, missing or maxed) or, with idx omitted, the next one
   *  in the rotation. opts: { src: 'fight'|'event'|'debug'|… }. Returns the LevelUp record or null. */
  function levelUp(idx, opts) {
    const src = (opts && opts.src) || (idx === undefined || idx === null ? 'event' : 'named');
    if (idx === undefined || idx === null) return rotationLevelUp(src);
    return typeof idx === 'number' ? gainLevel(idx, { src: src }) : null;
  }
  /** n rotation level-ups (one after another, so a pair can't land on the same hero while others are behind). */
  function grantLevelUps(n, src) {
    const out = [];
    for (let i = 0; i < Math.max(0, Math.floor(num(n, 0))); i++) {
      const r = rotationLevelUp(src || 'fight');
      if (!r) break;
      out.push(r);
    }
    return out;
  }

  /** The XP-era calls level up once: one level-up per call, and at most one per event choice while it resolves
   *  (old content calls api.xp / grantHeroXp freely inside one choice). idx: named hero, or the rotation. */
  function xpAlias(idx, gate) {
    gate = xpGate || gate;
    if (gate && gate.used) return null;
    const r = levelUp(idx, { src: idx === undefined || idx === null ? 'event' : 'named' });
    if (gate && r) gate.used = true;
    return r;
  }
  /** Compat (v1 XP): any XP for one hero = that hero levels up once. Returns the levels gained (0 or 1). */
  function grantHeroXp(idx, n) {
    if (!S || !(num(+n, 0) > 0)) return 0;
    return xpAlias(idx) ? 1 : 0;
  }
  /** Compat (v1 XP): party XP = one level-up through the rotation (opts.half is ignored). Returns [heroIdx] or []. */
  function grantXp(n) {
    if (!S || !(num(+n, 0) > 0)) return [];
    const r = xpAlias(null);
    return r ? [r.heroIdx] : [];
  }

  function levelQueue() { return aliveIdx().filter(function (i) { return S.party[i].pendingLevels > 0; }); }
  /** Level-up queue for the levelup screen: each hero index repeated once per pending level. */
  function levelQueueFull() {
    const out = [];
    aliveIdx().forEach(function (i) { for (let k = 0; k < S.party[i].pendingLevels; k++) out.push(i); });
    return out;
  }
  function hasPendingChoices() { return !!S && (levelQueue().length > 0 || pendingLearns().length > 0 || rollQueue().length > 0); }

  // ---- random passives: the Table of Questionable Blessings (§9.6) ---------------------------------------------
  function passiveName(id) { const d = DD.getPassive(id); return d ? d.name : String(id); }

  /** A new pending roll for a RunHero, or null when its table is empty (no roll, no error). opts: { lv, noCursed,
   *  exclude: [ids] }. */
  function makeJob(rh, src, opts) {
    if (!DD.Passives || !rh || rh.dead) return null;
    opts = opts || {};
    if (!Array.isArray(rh.passives)) rh.passives = [];
    if (!Array.isArray(rh.passiveRolls)) rh.passiveRolls = [];
    const job = {
      src: src || 'event', lv: Math.max(1, Math.floor(num(opts.lv, rh.level || 1))), noCursed: !!opts.noCursed,
      exclude: (Array.isArray(opts.exclude) ? opts.exclude : []).filter(function (x) { return typeof x === 'string'; }), roll: null,
    };
    return DD.Passives.table(rh, job).length ? job : null;
  }

  /** The hero's front pending roll, rolled now (and stored) if it was not yet; a stored roll is re-checked against
   *  the hero's current Blessings (DD.Passives.refresh) and only re-rolled when it can no longer apply. Jobs whose
   *  table became empty fizzle. Returns { roll, dirty }. */
  function frontRoll(rh) {
    const jobs = rh.passiveRolls || [];
    let dirty = false;
    while (jobs.length) {
      const job = jobs[0];
      if (job.roll) {
        const fresh = DD.Passives.refresh(rh, job.roll);
        if (fresh) {
          if (fresh.upgrade !== job.roll.upgrade || fresh.level !== job.roll.level) { job.roll = fresh; dirty = true; }
          return { roll: job.roll, dirty: dirty };
        }
        job.roll = null;
      }
      const r = DD.Passives.roll(rh, prng(), { noCursed: job.noCursed, exclude: job.exclude });
      dirty = true;
      if (r) {
        job.roll = r;
        if (DD.Meta && DD.Meta.markSeen) DD.Meta.markSeen('passives', r.id);
        return { roll: r, dirty: dirty };
      }
      jobs.shift();
    }
    return { roll: null, dirty: dirty };
  }

  function rollText(rh, r, res) {
    const who = heroName(rh);
    const name = passiveName(r.id);
    if (res.action === 'upgrade') return who + '\'s ' + name + ' is now ' + DD.util.roman(res.entry.level) + '!';
    if (res.action === 'keep') return who + ' gained ' + name + '!';
    if (res.action === 'replace') {
      const old = passiveName(res.replaced.id);
      return who + ' traded ' + old + ' for ' + name + '. ' + old + ' is gone for good.';
    }
    return who + ' passed on ' + name + '. The DM sweeps it off the table.';
  }

  /** Resolve a RunHero's front roll: 'upgrade' | 'keep' | 'replace' (slot) | 'discard' | 'auto' (policy). */
  function resolveFront(rh, action, slot) {
    const r = frontRoll(rh).roll;
    if (!r) return { ok: false, reason: 'none', text: 'There is nothing to roll.' };
    let res = null;
    withMaxHp(rh, function () { res = DD.Passives.apply(rh, r, action || 'auto', slot); });
    if (!res.ok) {
      return {
        ok: false, reason: res.reason, needsReplace: !!res.needsReplace, roll: r,
        text: res.needsReplace ? 'All 4 Blessing slots are full: pick one to replace (or discard the roll).' : 'That roll can no longer be applied.',
      };
    }
    const job = rh.passiveRolls.shift();
    if (res.action !== 'discard' && DD.Meta && DD.Meta.markSeen) DD.Meta.markSeen('passives', r.id);
    return Object.assign(res, { roll: r, src: job.src, lv: job.lv, heroId: rh.id, text: rollText(rh, r, res) });
  }

  /** Roll for a RunHero right now and resolve with the headless policy (run start, recruits, migrations). */
  function autoRoll(rh, src, opts) {
    const job = makeJob(rh, src, opts);
    if (!job) return null;
    rh.passiveRolls.unshift(job);
    const res = resolveFront(rh, 'auto');
    if (!res.ok) { const i = rh.passiveRolls.indexOf(job); if (i >= 0) rh.passiveRolls.splice(i, 1); return null; }
    return res;
  }

  /** Resolve up to `max` (0 = all) of hero idx's pending rolls with the headless policy. Returns the results. */
  function autoResolve(idx, max) {
    const rh = heroAt(idx);
    const out = [];
    for (let guard = 0; rh && !rh.dead && (rh.passiveRolls || []).length && guard < 40 && (!max || out.length < max); guard++) {
      const res = resolveFront(rh, 'auto');
      if (res.ok) out.push(res);
      else if (res.reason !== 'none') rh.passiveRolls.shift();
    }
    return out;
  }

  /** Grant hero idx a roll (src 'level' | 'event' | 'shop' | 'debug'). Level rolls queue at the back; the others
   *  jump to the front (their screen resolves them right away). Without the UI — or with opts.auto (non-level) — the
   *  roll is resolved by the policy at once (job.results). opts: { lv, noCursed, exclude, auto }.
   *  Returns the job, or null when the table has nothing for this hero. */
  function queueRoll(idx, src, opts) {
    const rh = heroAt(idx);
    const job = makeJob(rh, src, opts);
    if (!job) return null;
    if (job.src === 'level') rh.passiveRolls.push(job);
    else rh.passiveRolls.unshift(job);
    if (!uiOn()) job.results = autoResolve(idx, 0);
    else if (opts && opts.auto && job.src !== 'level') job.results = autoResolve(idx, 1);
    touch();
    return job;
  }

  /** Living heroes with pending rolls. */
  function rollQueue() {
    if (!DD.Passives) return [];
    return aliveIdx().filter(function (i) { return (S.party[i].passiveRolls || []).length > 0; });
  }
  /** Pending rolls (all heroes, or hero idx): [{ heroIdx, heroId, index, src, lv, rolled }]. */
  function pendingRolls(idx) {
    const out = [];
    if (!S || !DD.Passives) return out;
    aliveIdx().forEach(function (i) {
      if (typeof idx === 'number' && i !== idx) return;
      (S.party[i].passiveRolls || []).forEach(function (j, k) {
        out.push({ heroIdx: i, heroId: S.party[i].id, index: k, src: j.src, lv: j.lv, rolled: !!j.roll });
      });
    });
    return out;
  }
  /** The roll the hero must resolve next (rolled now and saved if it was not yet — reloading never re-rolls):
   *  { heroIdx, heroId, src, lv, pending, id, level, upgrade, d100, rarity, from, to, pct } or null. */
  function currentRoll(idx) {
    const rh = heroAt(idx);
    if (!rh || rh.dead || !DD.Passives || !(rh.passiveRolls || []).length) return null;
    const fr = frontRoll(rh);
    if (fr.dirty) touch();
    if (!fr.roll) return null;
    const job = rh.passiveRolls[0];
    return Object.assign({ heroIdx: idx, heroId: rh.id, src: job.src, lv: job.lv, pending: rh.passiveRolls.length }, fr.roll);
  }
  /** Resolve hero idx's current roll: action 'upgrade' | 'keep' | 'replace' (slot 0-3) | 'discard' | 'auto'.
   *  Returns { ok, action, entry?, replaced?, roll, src, text } or { ok: false, needsReplace?, reason, text }. */
  function resolveRoll(idx, action, slot) {
    const rh = heroAt(idx);
    if (!rh || rh.dead) return { ok: false, reason: 'invalid', text: 'Nobody here can roll.' };
    const res = resolveFront(rh, action, slot);
    touch();
    return res;
  }
  /** What the level-up screen does next for a hero: 'roll' (a pending Blessing roll; a level's roll comes before
   *  that level's skill choice), 'choice' (a level-up choice) or null. Boons are picked oldest level first, so a
   *  level roll goes first while its level is not past the level whose boon is next (a level whose roll fizzled on
   *  an empty table simply has no roll). */
  function nextLevelStep(idx) {
    const rh = heroAt(idx);
    if (!rh || rh.dead) return null;
    const jobs = DD.Passives ? rh.passiveRolls || [] : [];
    if (jobs.length && jobs[0].src !== 'level') return 'roll';
    if (!(rh.pendingLevels > 0)) return jobs.length ? 'roll' : null;
    const boonLv = rh.level - rh.pendingLevels + 1;
    return jobs.length && jobs[0].lv <= boonLv ? 'roll' : 'choice';
  }
  /** Give hero idx a Blessing directly (debug / tests / events): sets the level when owned, else takes a free slot,
   *  else `slot` (default: the last one) is overwritten. Returns true on success. */
  function addPassive(idx, id, level, slot) {
    const rh = heroAt(idx);
    const def = DD.getPassive(id);
    if (!rh || rh.dead || !def || !DD.Passives) return false;
    const lv = clamp(Math.floor(num(level, 1)), 1, DD.Passives.maxLevel(def));
    withMaxHp(rh, function () {
      const own = DD.Passives.owned(rh, id);
      if (own) own.level = lv;
      else if (typeof slot === 'number' && rh.passives[slot]) rh.passives[slot] = { id: id, level: lv };
      else if (rh.passives.length < DD.Passives.MAX) rh.passives.push({ id: id, level: lv });
      else rh.passives[DD.Passives.MAX - 1] = { id: id, level: lv };
    });
    if (DD.Meta && DD.Meta.markSeen) DD.Meta.markSeen('passives', id);
    touch();
    return true;
  }
  /** Remove a Blessing (id or slot index) from hero idx. Returns the removed entry or null. */
  function removePassive(idx, idOrSlot) {
    const rh = heroAt(idx);
    if (!rh || !Array.isArray(rh.passives)) return null;
    const i = typeof idOrSlot === 'number' ? idOrSlot : rh.passives.findIndex(function (p) { return p.id === idOrSlot; });
    if (!(i >= 0 && i < rh.passives.length)) return null;
    let removed = null;
    withMaxHp(rh, function () { removed = rh.passives.splice(i, 1)[0]; });
    touch();
    return removed;
  }
  /** Debug / recruits: wipe hero idx's Blessings and roll them as a recruit of its level (start + one per level). */
  function autoRollPassives(idx) {
    const rh = heroAt(idx);
    if (!rh || rh.dead) return [];
    withMaxHp(rh, function () { rh.passives = []; });
    rh.passiveRolls = [];
    const out = autoRollPassivesFor(rh);
    touch();
    return out;
  }

  function skillChoice(rh, id) {
    const s = DD.getSkill(id);
    return { type: 'skill', id: id, icon: s.icon || '📖', label: 'Learn ' + s.name, desc: DD.skillDesc(s, 1, null), replace: rh.skills.length >= MAX_SKILLS };
  }
  function upgradeChoice(rh, skillIdx) {
    const slot = rh.skills[skillIdx];
    const s = DD.getSkill(slot.id);
    const next = slot.level + 1;
    return {
      type: 'upgrade', id: slot.id, skillIdx: skillIdx, level: next, icon: (s && s.icon) || '⬆️',
      label: 'Upgrade ' + (s ? s.name : slot.id) + ' to ' + DD.util.roman(next), desc: s ? DD.skillDesc(s, next, null) : '',
    };
  }
  function perkChoice(id) { const p = PERKS[id]; return { type: 'perk', id: id, icon: p.icon, label: p.name, desc: p.desc }; }
  function perkOptions(rh) {
    const out = ['hp', 'dmg'];
    if (rh.level >= 5 && rh.perks.indexOf('mov') < 0) out.push('mov');
    return out;
  }

  /** The 3 options for a hero's next pending level (learn / upgrade / perk), cached until one is applied. */
  function levelUpChoices(idx) {
    const rh = heroAt(idx);
    if (!rh || rh.dead || !(rh.pendingLevels > 0)) return [];
    if (Array.isArray(rh.levelChoices) && rh.levelChoices.length) return rh.levelChoices;
    const r = rng();
    const choices = [];
    function add(c) { if (c && choices.length < 3) choices.push(c); }
    const own = r.shuffle(learnableFor(rh, { generic: false }));
    const gen = r.shuffle(learnableFor(rh, { generic: true }).filter(function (id) { return own.indexOf(id) < 0; }));
    const learn = own.concat(gen);
    const ups = r.shuffle(upgradableFor(rh));
    const perks = r.shuffle(perkOptions(rh));
    if (learn.length) add(skillChoice(rh, learn.shift()));
    if (ups.length) add(upgradeChoice(rh, ups.shift()));
    add(perkChoice(perks.shift()));
    while (choices.length < 3 && (ups.length || learn.length || perks.length)) {
      if (ups.length) add(upgradeChoice(rh, ups.shift()));
      else if (learn.length) add(skillChoice(rh, learn.shift()));
      else add(perkChoice(perks.shift()));
    }
    rh.levelChoices = choices;
    touch();
    return choices;
  }

  /** Apply a level-up choice (object from levelUpChoices or its index). Learning with 4 skills socketed needs
   *  replaceIdx (0-3) or -1 to skip the skill; without it returns { ok: false, needsReplace: true }. */
  function applyLevelChoice(idx, choice, replaceIdx) {
    const rh = heroAt(idx);
    if (!rh || rh.dead || !(rh.pendingLevels > 0)) return { ok: false, reason: 'none', text: '' };
    const list = levelUpChoices(idx);
    const c = typeof choice === 'number' ? list[choice] :
      list.filter(function (x) { return choice && x.type === choice.type && x.id === choice.id; })[0];
    if (!c) return { ok: false, reason: 'invalid', text: '' };
    const name = heroName(idx);
    let text = '';
    if (c.type === 'skill') {
      if (rh.skills.length >= MAX_SKILLS && replaceIdx !== -1 && !(typeof replaceIdx === 'number' && rh.skills[replaceIdx])) {
        return { ok: false, needsReplace: true, reason: 'replace', text: 'Pick a skill to forget (or skip).' };
      }
      const res = giveSkill(idx, c.id, 'levelup', replaceIdx);
      if (!res.ok) { rh.levelChoices = null; return { ok: false, reason: 'stale', text: res.text }; }
      text = res.text;
    } else if (c.type === 'upgrade') {
      const si = rh.skills.findIndex(function (s) { return s.id === c.id; });
      if (!upgradeSkill(idx, si)) { rh.levelChoices = null; return { ok: false, reason: 'stale', text: 'That skill is already maxed. Pick again.' }; }
      const s = DD.getSkill(c.id);
      text = name + '\'s ' + (s ? s.name : c.id) + ' is now ' + DD.util.roman(rh.skills[si].level) + '.';
    } else if (c.type === 'perk' && PERKS[c.id]) {
      withMaxHp(rh, function () { rh.perks.push(c.id); });
      text = name + ' gained ' + PERKS[c.id].name + ': ' + PERKS[c.id].desc;
    } else {
      return { ok: false, reason: 'invalid', text: '' };
    }
    rh.pendingLevels--;
    rh.levelChoices = null;
    touch();
    return { ok: true, choice: c, text: text };
  }

  // ---- map & travel ------------------------------------------------------------------------------------------
  function currentNode() { return S && S.map && S.nodeId ? S.map.nodes[S.nodeId] || null : null; }
  /** Nodes the party can travel to now (row 0 at the start of an act, then the current node's links). */
  function availableNodes() {
    if (!S || S.over || !S.map || (S.pending && S.pending.type === 'combat')) return [];
    const ids = S.nodeId ? ((S.map.nodes[S.nodeId] || {}).links || []) : (S.map.start || []);
    return ids.map(function (id) { return S.map.nodes[id]; }).filter(function (n) { return n && !n.done; });
  }

  /** Close the open non-combat step (shop / tavern / rewards / event) before moving on. */
  function closeStep() {
    const p = S && S.pending;
    if (!p || p.type === 'combat') return;
    if (p.type === 'rewards' && p.data.taken === null && !p.data.skipped) p.data.skipped = true;
    S.pending = null;
  }

  /** Enter a node (id or node object) and dispatch to its screen. A fight queued by an event runs first. */
  function travel(nodeId) {
    if (nodeId && typeof nodeId === 'object') nodeId = nodeId.id;
    if (!S || S.over || !S.map) return false;
    if (S.queuedCombat && !(S.pending && S.pending.type === 'combat')) { startQueuedCombat(); return false; }
    const node = S.map.nodes[nodeId];
    if (!node || !availableNodes().some(function (n) { return n.id === nodeId; })) return false;
    closeStep();
    S.nodeId = nodeId;
    S.visited.push(nodeId);
    switch (node.type) {
      case 'combat': case 'elite': case 'boss': enterFight(node); break;
      case 'event': enterEvent(node); break;
      case 'shop': enterShop(node); break;
      case 'tavern': enterTavern(node); break;
      case 'treasure': enterTreasure(node); break;
      default: node.done = true; touch(); show('map', { act: S.act }); break;
    }
    return true;
  }

  // ---- combat -------------------------------------------------------------------------------------------------
  function enterFight(node) {
    const kind = node.type === 'combat' ? 'normal' : node.type;
    let def = node.encounterId ? DD.getEncounter(node.encounterId) : null;
    if (!def) {
      def = DD.RunMap.pickEncounter(S.act, kind, rng(), { depth: node.row, exclude: S.fought });
      if (def) node.encounterId = def.id;
    }
    startCombat(def, kind, { nodeId: node.id });
  }

  /** Encounter argument -> def: id | def | { act, kind } spec | null (picked for the current act/depth). */
  function resolveEncounter(enc, kind) {
    if (typeof enc === 'string') {
      const def = DD.getEncounter(enc);
      if (def) return def;
      DD.warn('DD.Run: unknown encounter "' + enc + '", using a random ' + normalizeKind(kind) + ' fight instead');
      enc = null;
    }
    if (enc && typeof enc === 'object' && enc.id && DD.getEncounter(enc.id)) return DD.getEncounter(enc.id);
    const spec = enc && typeof enc === 'object' ? enc : {};
    const node = currentNode();
    return DD.RunMap.pickEncounter(clamp(Math.floor(num(spec.act, S.act)), 1, FINAL_ACT), normalizeKind(spec.kind || kind), rng(),
      { depth: node ? node.row : 0, exclude: S.fought });
  }

  function markSeenUnits(list) {
    if (!DD.Meta || !Array.isArray(list)) return;
    list.forEach(function (u) {
      const def = u && DD.getEnemy(u.defId || u.id);
      if (def) DD.Meta.markSeen(def.tier === 'boss' || def.boss ? 'bosses' : 'enemies', def.id);
    });
  }

  /** Start a fight (encounter id / def / { act, kind } spec; kind 'normal'|'elite'|'boss'). Saves the run with
   *  pending 'combat', builds the setup with DD.Encounter.build, starts DD.Combat and shows the HUD.
   *  opts: { nodeId, fromEvent, seed }. Returns the combat state (null when the fight could not start). */
  function startCombat(encounter, kind, opts) {
    if (!S || S.over) return null;
    opts = opts || {};
    const def = resolveEncounter(encounter, kind || (encounter && encounter.kind));
    S.pending = {
      type: 'combat',
      data: {
        nodeId: opts.fromEvent ? null : (opts.nodeId || S.nodeId || null),
        encounterId: def ? def.id : null,
        kind: normalizeKind(kind || (def && def.kind)),
        act: S.act,
        seed: opts.seed != null ? opts.seed : rng().int(1, 2147483646),
        fromEvent: !!opts.fromEvent,
      },
    };
    S.queuedCombat = null;
    inCombat = false;
    touch();
    return launchCombat();
  }

  /** (Re)launch the pending fight from its stored encounter + seed (also used when resuming a save). */
  function launchCombat() {
    const p = S.pending.data;
    const def = p.encounterId ? DD.getEncounter(p.encounterId) : null;
    const engine = DD.Combat && typeof DD.Combat.start === 'function' && DD.Encounter && typeof DD.Encounter.build === 'function';
    if (!def || !engine) {
      DD.warn('DD.Run: skipping a ' + p.kind + ' fight (' + (def ? 'combat engine not loaded' : 'no encounter for act ' + p.act) + ')');
      finishCombat('victory', null);
      return null;
    }
    const party = S.party.filter(function (h) { return h && !h.dead; });
    party.forEach(function (h) { if (!(h.hp >= 1)) h.hp = 1; });
    const node = p.nodeId ? S.map.nodes[p.nodeId] : currentNode();
    const setup = DD.safe('DD.Encounter.build(' + def.id + ')', DD.Encounter.build, DD.Encounter,
      [def, party, { rng: DD.RNG(p.seed), difficulty: S.difficulty, act: p.act, kind: p.kind, depth: node ? node.row : 0 }]);
    if (!setup) {
      DD.warn('DD.Run: encounter "' + def.id + '" failed to build; the fight is skipped');
      finishCombat('victory', null);
      return null;
    }
    const token = ++combatToken;
    inCombat = true;
    const cs = DD.safe('DD.Combat.start(' + def.id + ')', DD.Combat.start, DD.Combat, [setup, {
      run: S, seed: p.seed, headless: !!DD.headless, difficulty: S.difficulty,
      onEnd: function (result, st) { onCombatEnd(token, result, st); },
    }]);
    if (!inCombat || token !== combatToken) return cs || null;   // it already ended inside start()
    if (!cs) {
      inCombat = false;
      DD.warn('DD.Run: combat "' + def.id + '" failed to start; the fight is skipped');
      finishCombat('victory', null);
      return null;
    }
    combat = cs;
    markSeenUnits(setup.enemies);
    show('combat', { encounterId: def.id, kind: p.kind });
    return cs;
  }

  function onCombatEnd(token, result, st) {
    if (result && typeof result === 'object') { st = result; result = st.result; }
    if (token !== combatToken || !inCombat) return;
    // In the game the HUD calls finishCombat once the end-of-fight FX are done (ARCHITECTURE §8.3).
    if (uiOn()) return;
    const finish = function () { if (token === combatToken && inCombat) finishCombat(result, st || combat); };
    if (DD.FX && typeof DD.FX.onIdle === 'function') DD.FX.onIdle(finish);
    else finish();
  }

  function partyIdxForUnit(u) {
    if (u.runHero) {
      const i = S.party.indexOf(u.runHero);
      if (i >= 0) return i;
      if (u.runHero.id) { const j = idxOf(u.runHero.id); if (j >= 0) return j; }
    }
    return idxOf(u.defId);
  }

  /** HP write-back, downs -> scars / third down -> death (victory, or opts.countDowns), kills and damage stats. */
  function applyOutcome(result, cs, opts) {
    const countDowns = result === 'victory' || !!(opts && opts.countDowns);
    const info = { downed: [], scars: [], deaths: [], kills: 0, damage: 0 };
    const units = cs && Array.isArray(cs.units) ? cs.units : [];
    const ustats = (cs && cs.stats && cs.stats.units) || {};
    function statOf(u) { return ustats[u.id] || {}; }
    units.forEach(function (u) {
      if (!u || u.side !== 'hero') return;
      info.kills += num(statOf(u).kills, 0);
      info.damage += num(statOf(u).dmg, 0);
    });
    units.forEach(function (u) {
      if (!u || u.kind !== 'hero') return;
      const idx = partyIdxForUnit(u);
      const rh = heroAt(idx);
      if (!rh || rh.dead) return;
      let kills = num(statOf(u).kills, 0);
      units.forEach(function (s) { if (s && s.kind === 'summon' && s.ownerId === u.id) kills += num(statOf(s).kills, 0); });
      rh.kills += kills;
      const down = !!(u.downed || u.dead || !(u.hp > 0));
      if (!down) { rh.hp = clamp(Math.round(u.hp), 1, heroStats(rh).maxHp); return; }
      rh.hp = 1;
      if (!countDowns) return;
      rh.downs++;
      info.downed.push(idx);
      if (rh.downs >= DOWNS_TO_DIE) {
        rh.dead = true;
        rh.hp = 0;
        rh.pendingLevels = 0;
        rh.levelChoices = null;
        rh.passiveRolls = [];
        if (S.fallen.indexOf(rh.id) < 0) S.fallen.push(rh.id);
        info.deaths.push(idx);
      } else {
        const scar = addScar(idx);
        if (scar) info.scars.push({ heroIdx: idx, scarId: scar });
        rh.hp = 1;
      }
    });
    S.stats.kills += info.kills;
    S.stats.damage += Math.round(info.damage);
    S.stats.downs += info.downed.length;
    S.stats.deaths += info.deaths.length;
    if (info.deaths.length) S.maxConsumables = computeMaxConsumables();
    return info;
  }

  /** Rewards-screen data. levelUps: the LevelUp records of this step (the fight's rotation level-up); leveled:
   *  every pending level-up choice (one entry per level, also older ones from events). */
  function rewardData(source, kind, gold, choices, extra) {
    const id = 'rw' + (++S.seq);
    const data = Object.assign({
      id: id, source: source, kind: kind, act: S.act, gold: gold, levelUps: [], leveled: [],
      downed: [], scars: [], deaths: [], kills: 0, encounterId: null, encounterName: '', actClear: null, text: '',
      taken: null, skipped: false,
    }, extra || {});
    data.choices = (choices || []).map(function (c, i) { return Object.assign({}, c, { rid: id + ':' + i }); });
    return data;
  }

  /** Resolve the running fight (the HUD calls this; headless runs call it from onEnd). Idempotent: only a
   *  pending combat is finished. Victory -> one rotation level-up (DD.Rewards.levelUpsFor), gold, rewards (+ act
   *  clear for the boss); defeat -> game over. Returns { result, outcome: 'rewards'|'gameover'|'victory', data|summary }. */
  function finishCombat(result, cs) {
    if (!S || S.over || !S.pending || S.pending.type !== 'combat') return null;
    hold++;
    let out;
    try { out = resolveCombat(result, cs); } finally { hold--; }
    if (out && out.outcome === 'rewards') {
      touch();
      show('rewards', out.data);
    }
    return out;
  }

  function resolveCombat(result, cs) {
    const p = S.pending.data;
    inCombat = false;
    combat = null;
    if (result !== 'victory' && result !== 'defeat') {
      result = cs && (cs.result === 'victory' || cs.result === 'defeat') ? cs.result : 'victory';
    }
    const def = p.encounterId ? DD.getEncounter(p.encounterId) : null;
    // [integration fix — docs/notes/content-digest.md] a lost objective (the protected keg / coffee machine / snack bowl)
    // while heroes still stand is a lost fight, not a TPK: no loot, the campaign goes on. Only a TPK (or any lost boss
    // fight) ends the run. [balance] It has teeth (DD.Balance.objectiveFailed): the DM bills a share of the party's
    // gold for the damages, and downs count (scar / third down) as in a won fight. [v2] It is not a won fight:
    // nobody levels up.
    const standing = !!(cs && Array.isArray(cs.units) && cs.units.some(function (u) { return u && u.kind === 'hero' && !u.downed && !u.dead; }));
    const failed = result === 'defeat' && standing && p.kind !== 'boss' && aliveIdx().length > 0;
    const info = applyOutcome(result, cs, { countDowns: failed && !!bal('objectiveFailed', 'countDowns') });
    if (cs && Array.isArray(cs.units)) markSeenUnits(cs.units);
    if (def && S.fought.indexOf(def.id) < 0) S.fought.push(def.id);
    S.stats.combats++;
    if (failed && aliveIdx().length) {
      S.stats.failed = (S.stats.failed || 0) + 1;
      const failedNode = p.nodeId ? S.map.nodes[p.nodeId] : null;
      if (failedNode) { failedNode.done = true; failedNode.result = 'defeat'; }
      const loss = clamp(num(bal('objectiveFailed', 'goldLoss'), 0), 0, 1);
      const fine = Math.min(S.gold, Math.round(S.gold * loss));
      if (fine > 0) addGold(-fine);
      S.stats.goldFined = (S.stats.goldFined || 0) + fine;
      const bill = fine > 0 ? ' The DM bills the party ' + fine + ' gold for the damages.' : '';
      const lost = rewardData('combat', 'failed', 0, [], {
        encounterId: def ? def.id : null, encounterName: def ? def.name || def.id : '', failed: true, title: 'Objective Failed',
        downed: info.downed, scars: info.scars, deaths: info.deaths, kills: info.kills, goldLost: fine,
        leveled: levelQueueFull(),
        text: 'The objective is lost; the party is not. Nobody gets paid (or levels up) for this one.' + bill,
      });
      S.pending = { type: 'rewards', data: lost };
      return { result: 'defeat', outcome: 'rewards', data: lost };
    }
    if (result === 'defeat' || !aliveIdx().length) {
      const sum = endRun('defeat', { killedBy: def ? def.name : null, kind: p.kind });
      return { result: 'defeat', outcome: 'gameover', summary: sum };
    }
    if (p.kind === 'elite') S.stats.elites++;
    if (p.kind === 'boss') S.stats.bosses++;
    const node = p.nodeId ? S.map.nodes[p.nodeId] : null;
    if (node) { node.done = true; node.result = 'victory'; }
    // v2: the fight's level-up goes to one living hero, drawn among the lowest levels (the dead are skipped)
    const levelUps = grantLevelUps(levelUpsPerWin(p.kind), 'fight');
    const rw = (def && def.reward) || {};
    const finalBoss = p.kind === 'boss' && p.act >= FINAL_ACT && !!node && p.nodeId === S.map.boss;
    const loot = DD.Rewards.combat(p.kind, p.act, rng(), S, { goldMult: rw.goldMult, itemRarity: rw.itemRarity, final: finalBoss });
    const gold = addGold(loot.gold);   // after passive gold bonuses
    const data = rewardData(p.kind === 'boss' ? 'boss' : 'combat', p.kind, gold, loot.choices, {
      encounterId: def ? def.id : null, encounterName: def ? def.name || def.id : '',
      levelUps: levelUps, leveled: levelQueueFull(), boss: p.kind === 'boss',
      // [integration fix, narrative request] a hero written out of the campaign gets the DM's hero_death line
      downed: info.downed, scars: info.scars, deaths: info.deaths, kills: info.kills,
      text: (info.deaths.length && narr('hero_death')) || narr('victory'),
    });
    S.pending = { type: 'rewards', data: data };
    if (p.kind === 'boss' && node && p.nodeId === S.map.boss) {
      // the rewards screen shows the act-clear interstitial from data.actClear, then DD.Run.next()
      data.actClear = completeAct({ noShow: true, bossIds: bossIdsOf(cs, def) });
      if (S.over) return { result: 'victory', outcome: 'victory', summary: S.summary };
    }
    return { result: 'victory', outcome: 'rewards', data: data };
  }

  // ---- rewards screen -------------------------------------------------------------------------------------------
  function rewards() { return S && S.pending && S.pending.type === 'rewards' ? S.pending.data : null; }
  /** True for a reward from a reward screen that is closed or already used (one pick per screen).
   *  Free-standing rewards (no rid) are always applicable. */
  function isRewardTaken(reward) {
    if (!reward || typeof reward.rid !== 'string') return false;
    const d = rewards();
    if (!d || reward.rid.indexOf(d.id + ':') !== 0) return true;
    return d.taken !== null || d.skipped;
  }
  /** Called by DD.Rewards.apply after a successful apply. */
  function noteRewardApplied(reward) {
    const d = rewards();
    if (!d || !reward || typeof reward.rid !== 'string') return;
    const i = d.choices.findIndex(function (c) { return c.rid === reward.rid; });
    if (i >= 0 && d.taken === null) { d.taken = i; touch(); }
  }
  /** Take reward choice i of the pending reward screen. opts as DD.Rewards.apply (replaceIdx, heroIdx). */
  function takeReward(i, opts) {
    const d = rewards();
    if (!d) return { ok: false, reason: 'none', text: 'There is nothing to take.' };
    if (!d.choices[i]) return { ok: false, reason: 'invalid', text: '' };
    return DD.Rewards.apply(d.choices[i], Object.assign({}, opts, { run: S }));
  }
  function skipRewards() {
    const d = rewards();
    if (!d || d.taken !== null) return false;
    d.skipped = true;
    touch();
    return true;
  }

  // ---- act clear / end of run ----------------------------------------------------------------------------------
  /** After the act boss is beaten: unlock heroes (DD.Meta), heal 50%, next act map — or final victory after
   *  act 3. Runs once per beaten boss (later calls return null). opts.noShow: don't show the map. */
  /** Boss enemy def ids of a fight: boss units in the combat state, else the encounter's boss-tier entries. */
  function bossIdsOf(cs, def) {
    const ids = [];
    const add = function (id) { const e = id && DD.getEnemy(id); if (e && e.tier === 'boss' && ids.indexOf(id) < 0) ids.push(id); };
    if (cs && Array.isArray(cs.units)) cs.units.forEach(function (u) { if (u && u.side === 'enemy') add(u.defId); });
    if (!ids.length && def && Array.isArray(def.enemies)) def.enemies.forEach(function (en) { add(typeof en === 'string' ? en : en && en.id); });
    return ids;
  }

  function completeAct(opts) {
    if (!S || S.over || !S.map || S.map.cleared) return null;
    const boss = S.map.nodes[S.map.boss];
    if (!boss || boss.result !== 'victory') return null;
    S.map.cleared = true;
    const act = S.act;
    const unlocked = DD.Meta ? DD.Meta.unlockForAct(act) : [];
    const bossIds = (opts && opts.bossIds) || bossIdsOf(null, boss.encounterId ? DD.getEncounter(boss.encounterId) : null);
    if (DD.Meta && DD.Meta.unlockForBosses) {
      DD.Meta.unlockForBosses(bossIds).forEach(function (id) { if (unlocked.indexOf(id) < 0) unlocked.push(id); });
    }
    S.stats.actsCleared = Math.max(num(S.stats.actsCleared, 0), act);
    if (act >= FINAL_ACT) {
      endRun('victory', { unlocked: unlocked });
      return { act: act, unlocked: unlocked, victory: true };
    }
    const actHeal = healOf('actClear');
    healParty(actHeal);
    S.act = act + 1;
    S.map = makeMap(S.act);
    S.nodeId = null;
    S.visited = [];
    const info = { act: act, nextAct: S.act, unlocked: unlocked, healed: actHeal, text: narr('act_clear') };
    S.flags.lastActClear = info;
    touch();
    if (!(opts && opts.noShow)) show('map', { act: S.act, intro: true, actClear: info });
    return info;
  }

  /** Params for the end screens: gameover { summary }; victory { summary, final: true, act, unlocked }. */
  function endParams() {
    const sum = S.summary;
    if (S.over !== 'victory') return { summary: sum };
    return { summary: sum, final: true, act: S.act, unlocked: (sum && sum.unlocked) || [] };
  }

  function buildSummary(result, extra) {
    extra = extra || {};
    const now = Date.now();
    return {
      result: result, date: now, seed: S.seed, difficulty: S.difficulty, act: S.act,
      party: S.party.map(function (h) {
        return {
          id: h.id, name: heroName(h), level: h.level, dead: !!h.dead, kills: h.kills, downs: h.downs, scars: h.scars.slice(),
          passives: (h.passives || []).map(function (p) { return { id: p.id, level: p.level }; }),
        };
      }),
      fallen: S.fallen.slice(), gold: S.gold, killedBy: extra.killedBy || null, unlocked: extra.unlocked || [],
      stats: Object.assign({}, S.stats, { durationMs: Math.max(0, now - num(S.stats.startedAt, now)) }),
    };
  }

  /** Finish the run ('victory' | 'defeat' | 'abandoned'): record it in DD.Meta, delete the save, show the end
   *  screen (unless extra.silent). The finished state stays in DD.Run.state for that screen. */
  function endRun(result, extra) {
    if (!S) return null;
    if (S.over) return S.summary;
    const sum = buildSummary(result, extra);
    S.over = result;
    S.summary = sum;
    S.pending = null;
    S.queuedCombat = null;
    inCombat = false;
    combat = null;
    if (DD.Meta) DD.Meta.recordRun(sum);
    DD.Storage.remove(SAVE_KEY);
    changed();
    if (!(extra && extra.silent)) show(result === 'victory' ? 'victory' : 'gameover', endParams());
    return sum;
  }

  // ---- events -----------------------------------------------------------------------------------------------------
  function enterEvent(node) {
    node.done = true;
    let ev = node.eventId ? DD.getEvent(node.eventId) : null;
    if (!ev || !DD.RunMap.eventAvailable(ev, S.act, S)) ev = DD.RunMap.pickEvent(S.act, rng(), { run: S });
    if (!ev) ev = DD.getEvent(FALLBACK_EVENT);
    if (!ev) { touch(); show('map', { act: S.act }); return; }
    node.eventId = ev.id;
    openEvent(ev.id, node.id);
  }

  /** Open an event (by id) as the pending step and show the event screen (unless opts.noShow). */
  function openEvent(eventId, nodeId, opts) {
    const ev = DD.getEvent(eventId);
    if (!S || S.over || !ev) return false;
    if (S.seenEvents.indexOf(ev.id) < 0) S.seenEvents.push(ev.id);
    if (DD.Meta) DD.Meta.markSeen('events', ev.id);
    S.pending = { type: 'event', data: { eventId: ev.id, nodeId: nodeId || null, resolved: false, choice: null, outcome: null, combat: null } };
    touch();
    if (!(opts && opts.noShow)) show('event', { eventId: ev.id });
    return true;
  }

  function choiceAllowed(def, c) {
    return typeof c.requires !== 'function' || !!DD.safe('requires of a choice in event ' + def.id, c.requires, c, [S]);
  }
  /** A choice's label / hint: a string, or (run) => string (e.g. act-scaled numbers). '' when missing. */
  function choiceText(def, c, key) {
    let v = c[key];
    if (typeof v === 'function') v = DD.safe(key + ' of a choice in event ' + def.id, v, c, [S]);
    return v === undefined || v === null ? '' : String(v);
  }

  /** The pending event for the event screen: { id, def, title, icon, text, choices: [{ index, label, hint,
   *  disabled }], resolved, outcome, combat }. null when no event is pending. Function labels / hints are called
   *  with the run. */
  function currentEvent() {
    const p = S && S.pending;
    if (!p || p.type !== 'event') return null;
    const def = DD.getEvent(p.data.eventId);
    if (!def) return null;
    const text = typeof def.text === 'function' ? DD.safe('text of event ' + def.id, def.text, def, [S]) : def.text;
    return {
      id: def.id, def: def, title: def.title, icon: def.icon, text: text == null ? '' : String(text),
      choices: (def.choices || []).map(function (c, i) {
        return { index: i, label: choiceText(def, c, 'label'), hint: choiceText(def, c, 'hint'), disabled: !choiceAllowed(def, c) };
      }),
      resolved: !!p.data.resolved, outcome: p.data.outcome, combat: S.queuedCombat,
    };
  }

  /** Queue a fight to start after the current step (event API `combat`). spec: encounter id | def | { act, kind }. */
  function queueCombat(spec) {
    if (!S || S.over || !spec) return false;
    if (typeof spec === 'string') {
      if (!DD.getEncounter(spec)) DD.warn('DD.Run: event asked for unknown encounter "' + spec + '", using a random fight');
      spec = { id: spec };
    }
    if (typeof spec !== 'object') return false;
    const def = spec.id ? DD.getEncounter(spec.id) : null;
    S.queuedCombat = {
      id: def ? def.id : null,
      act: clamp(Math.floor(num(spec.act, S.act)), 1, FINAL_ACT),
      kind: normalizeKind(spec.kind || (def && def.kind)),
    };
    touch();
    return true;
  }

  function startQueuedCombat() {
    const q = S && S.queuedCombat;
    if (!q || S.over || (S.pending && S.pending.type === 'combat')) return null;
    closeStep();
    return startCombat(q.id ? q.id : { act: q.act, kind: q.kind }, q.kind, { fromEvent: true });
  }

  function resolveChoice(def, c, i) {
    const outer = xpGate;
    xpGate = { used: false };   // the XP aliases (api.xp, grantXp, grantHeroXp) level up at most once in this choice
    let res;
    try {
      res = typeof c.resolve === 'function' ? DD.safe('event ' + def.id + ' choice ' + i, c.resolve, c, [eventApi(), S]) : '';
    } finally { xpGate = outer; }
    let text = '';
    if (typeof res === 'string') text = res;
    else if (res && typeof res === 'object') {
      text = res.text != null ? String(res.text) : '';
      if (res.combat) queueCombat(res.combat);
    }
    return { text: text, combat: S && S.queuedCombat ? S.queuedCombat : null };
  }

  /** Resolve choice i of the pending event. Returns { text, combat (queued fight spec or null) } or null. */
  function chooseEventOption(i) {
    const p = S && S.pending;
    if (!p || p.type !== 'event' || p.data.resolved) return null;
    const def = DD.getEvent(p.data.eventId);
    const c = def && Array.isArray(def.choices) ? def.choices[i] : null;
    if (!c || !choiceAllowed(def, c)) return null;
    const out = resolveChoice(def, c, i);
    if (S.pending === p) {
      p.data.resolved = true;
      p.data.choice = i;
      p.data.outcome = out.text;
      p.data.combat = out.combat;
    }
    touch();
    return out;
  }

  /** Event-screen adapter: resolve choice i of event `eventId` (opened as the pending step if it is not).
   *  Skill learns that need a replace-or-skip prompt are handed to the caller in `learn` (and leave the
   *  queue). Returns { text, combat, learn: [{ heroIdx, heroId, skillId }], levels: [heroIdx per level],
   *  rolls: [pending Blessing rolls, see pendingRolls()] }. */
  function resolveEvent(eventId, i) {
    if (!S || S.over) return null;
    const p = S.pending;
    if (!p || p.type !== 'event' || (eventId && p.data.eventId !== eventId)) {
      if (!eventId || !openEvent(eventId, S.nodeId, { noShow: true })) return null;
    }
    const before = S.learnQueue.length;
    const out = chooseEventOption(i);
    if (!out) return null;
    out.learn = S.learnQueue.splice(before).map(function (q) { return { heroIdx: idxOf(q.heroId), heroId: q.heroId, skillId: q.skillId }; });
    out.levels = levelQueueFull();
    out.rolls = pendingRolls();
    touch();
    return out;
  }

  /** Close the current non-combat step (event / shop / tavern / rewards) without navigating. */
  function leaveNode() {
    if (!S || !S.pending || S.pending.type === 'combat') return false;
    closeStep();
    touch();
    return true;
  }

  function aliveTarget(idx) {
    const rh = heroAt(idx);
    return rh && !rh.dead ? idx : -1;
  }

  /** Event API (ARCHITECTURE §9.5) bound to the current run. Damage never kills (min 1 HP). heal(x): x <= 1 is a
   *  fraction of max HP, otherwise HP; damage(x): 0 < x < 1 is a fraction, otherwise HP. */
  function eventApi() {
    function targets(idx) {
      if (idx === undefined || idx === null) return aliveIdx();
      return aliveTarget(idx) >= 0 ? [idx] : [];
    }
    function randomAlive() { const a = aliveIdx(); return a.length ? rng().pick(a) : -1; }
    const gate = { used: false };   // this api's own XP-alias gate (stand-alone resolves outside resolveChoice)
    const api = {
      gold: function (n) {
        if (n === undefined || n === null) return S ? S.gold : 0;
        return addGold(n);
      },
      heal: function (amount, idx) {
        amount = num(+amount, 0);
        if (!S || !(amount > 0)) return 0;
        let total = 0;
        targets(idx).forEach(function (i) {
          const max = heroStats(S.party[i]).maxHp;
          total += healHero(i, amount <= 1 ? Math.max(1, Math.round(max * amount)) : Math.round(amount));
        });
        return total;
      },
      damage: function (n, idx) {
        n = num(+n, 0);
        if (!S || !(n > 0)) return 0;
        let total = 0;
        targets(idx).forEach(function (i) {
          const max = heroStats(S.party[i]).maxHp;
          total += damageHero(i, n < 1 ? Math.max(1, Math.round(max * n)) : Math.round(n));
        });
        return total;
      },
      /** spec: { id } | { rarity, slot, hero } (+ heroIdx: the preferred wearer — a random item is then one that
       *  hero can use, and it is equipped on them when that slot is free, else on whoever has room). */
      giveItem: function (spec) {
        if (!S) return null;
        if (typeof spec === 'string') spec = { id: spec };
        spec = spec || {};
        const pref = typeof spec.heroIdx === 'number' && aliveTarget(spec.heroIdx) >= 0 ? spec.heroIdx : undefined;
        const hero = spec.hero || (pref !== undefined ? S.party[pref].id : undefined);
        const id = spec.id && DD.getItem(spec.id) ? spec.id :
          DD.Rewards.randomItem({ rarity: spec.rarity, slot: spec.slot, hero: hero, act: S.act, run: S }, rng());
        if (!id) {
          addGold(DD.Rewards.PRICES[spec.rarity] || DD.Rewards.PRICES.common);
          return null;
        }
        addItem(id);
        autoEquip(id, pref);
        return id;
      },
      giveConsumable: function (id) {
        if (!S) return null;
        const cid = id && DD.getConsumable(id) ? id : DD.Rewards.randomConsumable(rng());
        return cid && addConsumable(cid) ? cid : null;
      },
      giveSkill: function (idx, skillId) {
        if (!S) return null;
        if (aliveTarget(idx) < 0) idx = randomAlive();
        if (idx < 0) return null;
        if (!skillId || !DD.getSkill(skillId)) {
          const tome = DD.Rewards.skillTome(idx, rng(), S);
          skillId = tome && tome.id;
        }
        if (!skillId) return null;
        return giveSkill(idx, skillId, 'event').ok ? skillId : null;
      },
      upgradeSkill: function (idx) {
        if (!S) return null;
        const order = aliveTarget(idx) >= 0 ? [idx] : rng().shuffle(aliveIdx());
        for (let k = 0; k < order.length; k++) {
          const ups = upgradableFor(S.party[order[k]]);
          if (ups.length) {
            const si = rng().pick(ups);
            upgradeSkill(order[k], si);
            return S.party[order[k]].skills[si].id;
          }
        }
        return null;
      },
      /** A level-up (v2): hero idx when given (null when that hero is dead, missing or maxed), else the next hero
       *  in the rotation (random among the lowest-level living heroes). Every call is one level-up. Returns the
       *  LevelUp record { heroIdx, heroId, name, from, to, rotation, die, face, candidates } or null. */
      levelUp: function (idx) {
        if (!S) return null;
        if (idx === undefined || idx === null) return levelUp(null, { src: 'event' });
        return aliveTarget(idx) >= 0 ? levelUp(idx, { src: 'event' }) : null;
      },
      /** Compat (v1 XP): "gain n XP" = one level-up — the rotation, or hero idx when given (nobody when that hero
       *  is dead / invalid) — at most once per choice however often it is called. Returns [heroIdx] or []. */
      xp: function (n, idx) {
        if (!S || !(Math.round(num(+n, 0)) > 0)) return [];
        if (idx !== undefined && idx !== null && aliveTarget(idx) < 0) return [];
        const r = xpAlias(idx === undefined || idx === null ? null : idx, gate);
        return r ? [r.heroIdx] : [];
      },
      /** A scar (scarId, else a random one the hero lacks) for hero idx; a random living hero (one without scarId)
       *  when idx is missing or dead. Returns the scar id or null. */
      addScar: function (idx, scarId) {
        if (aliveTarget(idx) < 0) {
          const pool = scarId ? aliveIdx().filter(function (k) { return S.party[k].scars.indexOf(scarId) < 0; }) : aliveIdx();
          idx = pool.length ? rng().pick(pool) : -1;
        }
        return idx >= 0 ? addScar(idx, scarId) : null;
      },
      /** Remove scarId (else the most recent scar) from hero idx; from a random living hero that has it when idx is
       *  missing, dead or lacks it. Returns the removed scar id or null. */
      removeScar: function (idx, scarId) {
        if (!S) return null;
        const has = function (k) { return scarId ? S.party[k].scars.indexOf(scarId) >= 0 : S.party[k].scars.length > 0; };
        let i = aliveTarget(idx);
        if (i < 0 || !has(i)) {
          const scarred = aliveIdx().filter(has);
          i = scarred.length ? rng().pick(scarred) : -1;
        }
        return i >= 0 ? removeScar(i, scarId) : null;
      },
      combat: function (spec) { return queueCombat(spec); },
      hasHero: function (id) { const i = idxOf(id); return i >= 0 && !S.party[i].dead; },
      heroIdx: function (id) { const i = idxOf(id); return i >= 0 && !S.party[i].dead ? i : -1; },
      randomHeroIdx: randomAlive,
      flag: function (name, value) {
        if (!S) return undefined;
        if (value === undefined) return S.flags[name];
        S.flags[name] = value;
        touch();
        return value;
      },
      heroName: function (idx) { return heroName(idx); },
      hero: function (idx) { return heroAt(idx); },
      stats: function (idx) { return heroStats(idx); },
      /** A roll on the Table of Questionable Blessings for hero idx (random living hero when omitted / invalid).
       *  With the UI on, the event screen shows the roll right after the outcome; without it the headless policy
       *  resolves it at once. opts: { noCursed }. Returns { heroIdx, heroId, queued, results } or null (nobody can
       *  roll / the table is empty for that hero). */
      rollPassive: function (idx, opts) {
        if (!S) return null;
        if (aliveTarget(idx) < 0) idx = randomAlive();
        if (idx < 0) return null;
        const job = queueRoll(idx, 'event', { noCursed: !!(opts && opts.noCursed) });
        if (!job) return null;
        return { heroIdx: idx, heroId: S.party[idx].id, queued: !job.results, results: job.results || [] };
      },
      /** True when hero idx (or any living hero) owns the Blessing `id`. */
      hasPassive: function (id, idx) {
        const list = typeof idx === 'number' ? (aliveTarget(idx) >= 0 ? [idx] : []) : aliveIdx();
        return list.some(function (i) { return (S.party[i].passives || []).some(function (p) { return p.id === id; }); });
      },
    };
    Object.defineProperty(api, 'party', { enumerable: true, get: function () { return S ? S.party : []; } });
    Object.defineProperty(api, 'rng', { enumerable: true, get: function () { return rng(); } });
    Object.defineProperty(api, 'act', { enumerable: true, get: function () { return S ? S.act : 1; } });
    Object.defineProperty(api, 'difficulty', { enumerable: true, get: function () { return S ? S.difficulty : 'normal'; } });
    return api;
  }

  // ---- shop -------------------------------------------------------------------------------------------------------
  function result(ok, text, extra) { return Object.assign({ ok: ok, text: text || '' }, extra || {}); }

  function enterShop(node) {
    node.done = true;
    const inv = DD.Rewards.shopInventory(S.act, rng(), S);
    S.pending = { type: 'shop', data: Object.assign({ nodeId: node.id, greeting: narr('shop_greet') }, inv) };
    touch();
    show('shop', S.pending.data);
  }
  /** Shop prices follow the party's passive runMods.price (never below 50%); entries keep their basePrice. */
  function syncShopPrices(inv) {
    if (!inv || typeof inv !== 'object') return inv;
    const m = DD.Passives ? DD.Passives.priceMult(S) : 1;
    ['items', 'tomes', 'consumables', 'services'].forEach(function (k) {
      (Array.isArray(inv[k]) ? inv[k] : []).forEach(function (e) {
        if (!e || typeof e !== 'object') return;
        if (!(typeof e.basePrice === 'number' && isFinite(e.basePrice))) e.basePrice = Math.max(0, num(e.price, 0));
        e.price = Math.max(0, Math.round(e.basePrice * m));
      });
    });
    inv.priceMult = m;
    return inv;
  }
  /** Pending shop stock: { items, tomes, consumables, services, priceMult } (entries carry price + sold), or null. */
  function shop() { return S && S.pending && S.pending.type === 'shop' ? syncShopPrices(S.pending.data) : null; }

  /** The Blessing a re-roll would toss: opts { heroIdx, slot | passiveId }, else the party's weakest one (cursed
   *  first, then lowest rarity / level). Returns { idx, slot } or null. */
  function rerollTarget(opts) {
    if (!DD.Passives) return null;
    if (typeof opts.heroIdx === 'number') {
      const rh = heroAt(opts.heroIdx);
      if (!rh || rh.dead || !(rh.passives || []).length) return null;
      let slot = typeof opts.slot === 'number' ? opts.slot : opts.passiveId ? DD.Passives.indexOf(rh, opts.passiveId) : DD.Passives.weakestSlot(rh);
      if (!(slot >= 0 && slot < rh.passives.length)) return null;
      return { idx: opts.heroIdx, slot: slot };
    }
    let best = null, bestKey = Infinity;
    aliveIdx().forEach(function (i) {
      const rh = S.party[i];
      const w = DD.Passives.weakestSlot(rh);
      if (w < 0) return;
      const k = DD.Passives.rank(rh.passives[w]) * 100 + rh.passives[w].level;
      if (k < bestKey) { bestKey = k; best = { idx: i, slot: w }; }
    });
    return best;
  }

  /** Re-roll a Blessing: toss one (it is gone) and roll a fresh one (never the same). With the UI the shop screen
   *  shows the roll; without it the policy resolves it. Gold is only taken when a fresh roll is possible. */
  function rerollService(svc, opts) {
    const pick = rerollTarget(opts);
    if (!pick) return result(false, 'Nobody has a Blessing to re-roll. Roll some first.', { reason: 'noPassives' });
    const rh = S.party[pick.idx];
    const old = rh.passives[pick.slot];
    const probe = Object.assign({}, rh, { passives: rh.passives.filter(function (p, i) { return i !== pick.slot; }) });
    if (!DD.Passives.table(probe, { exclude: [old.id] }).length) {
      return result(false, 'The table has nothing else for ' + heroName(pick.idx) + '. The DM shrugs.', { reason: 'nothingToRoll' });
    }
    spendGold(svc.price);
    svc.sold = true;
    removePassive(pick.idx, pick.slot);
    const job = queueRoll(pick.idx, 'shop', { exclude: [old.id] });
    let text = heroName(pick.idx) + ' hands ' + passiveName(old.id) + ' over the counter. "Pre-owned. Lovely." The DM rolls again…';
    if (job && job.results) text += ' ' + job.results.map(function (r) { return r.text; }).join(' ');
    touch();
    return result(true, text, { heroIdx: pick.idx, removed: { id: old.id, level: old.level }, queued: !!job && !job.results, results: (job && job.results) || [] });
  }

  /** Buy entry `index` of 'items' | 'tomes' | 'consumables' | 'services'. opts: { replaceIdx } for a tome when
   *  the hero has 4 skills (else the learn is queued), { heroIdx } preferred wearer / scar patient, { scarId }. */
  function buy(section, index, opts) {
    opts = opts || {};
    const inv = shop();
    if (!inv) return result(false, 'The shop is closed.', { reason: 'closed' });
    if (section === 'services') {
      const svc = inv.services[index];
      return svc ? shopService(svc.id, opts) : result(false, 'No such service.', { reason: 'invalid' });
    }
    const list = inv[section];
    const e = Array.isArray(list) ? list[index] : null;
    if (!e || ['items', 'tomes', 'consumables'].indexOf(section) < 0) return result(false, 'That is not for sale.', { reason: 'invalid' });
    if (e.sold) return result(false, 'Sold out. Read the sign.', { reason: 'sold' });
    if (S.gold < e.price) return result(false, narr('shop_broke') || 'You can not afford that.', { reason: 'gold' });
    if (section === 'consumables' && S.consumables.length >= S.maxConsumables) {
      return result(false, 'Your pockets are full.', { reason: 'full' });
    }
    let idx = -1;
    if (section === 'tomes') {
      idx = idxOf(e.heroId);
      if (idx < 0 || S.party[idx].dead) return result(false, 'That tome was for someone who is no longer with us.', { reason: 'gone' });
      if (S.party[idx].skills.some(function (s) { return s.id === e.id; })) return result(false, heroName(idx) + ' already knows that.', { reason: 'known' });
    }
    spendGold(e.price);
    e.sold = true;
    let text;
    if (section === 'items') {
      addItem(e.id);
      const eq = autoEquip(e.id, typeof opts.heroIdx === 'number' ? opts.heroIdx : -1);
      text = eq >= 0 ? e.label + ' equipped on ' + heroName(eq) + '.' : e.label + ' added to the bag.';
    } else if (section === 'consumables') {
      addConsumable(e.id);
      text = e.label + ' added to your consumables.';
    } else {
      text = giveSkill(idx, e.id, 'shop', opts.replaceIdx).text;
    }
    touch();
    return result(true, (narr('shop_buy', { name: e.label, gold: e.price }) + ' ' + text).trim(), { entry: e });
  }

  /** Shop services: 'heal' (every living hero +30% max HP), 'scar' (remove one scar; opts.heroIdx/scarId,
   *  default: the most scarred hero's latest scar) or 'reroll' (re-roll a Blessing; opts.heroIdx + slot|passiveId,
   *  default: the party's weakest Blessing). One use of each per visit. */
  function shopService(id, opts) {
    opts = opts || {};
    const inv = shop();
    const svc = inv ? inv.services.filter(function (s) { return s.id === id; })[0] : null;
    if (!svc) return result(false, 'No such service.', { reason: 'invalid' });
    if (svc.sold) return result(false, 'One per customer. House rules.', { reason: 'sold' });
    if (S.gold < svc.price) return result(false, narr('shop_broke') || 'You can not afford that.', { reason: 'gold' });
    if (id === 'reroll') return rerollService(svc, opts);
    let text;
    if (id === 'heal') {
      if (!aliveIdx().some(function (i) { return S.party[i].hp < heroStats(S.party[i]).maxHp; })) {
        return result(false, 'Everyone is already at full HP. Show-offs.', { reason: 'healthy' });
      }
      spendGold(svc.price);
      text = 'The party heals ' + healParty(healOf('shop')) + ' HP.';
    } else if (id === 'scar') {
      const idx = typeof opts.heroIdx === 'number' ? opts.heroIdx : mostScarred();
      const rh = heroAt(idx);
      if (!rh || rh.dead || !rh.scars.length || (opts.scarId && rh.scars.indexOf(opts.scarId) < 0)) {
        return result(false, 'There is no scar to remove there.', { reason: 'noScars' });
      }
      spendGold(svc.price);
      const removed = removeScar(idx, opts.scarId);
      const sd = DD.getScar(removed);
      text = heroName(idx) + ' is cured of ' + (sd ? sd.name : removed) + '. The cream tingles.';
    } else {
      return result(false, 'No such service.', { reason: 'invalid' });
    }
    svc.sold = true;
    touch();
    return result(true, text);
  }

  // ---- tavern & recruits ----------------------------------------------------------------------------------------------
  /** Unlocked heroes that are not in the party and not fallen this run. */
  function recruitCandidates() {
    if (!S) return [];
    const inParty = S.party.map(function (h) { return h && h.id; });
    return Object.keys(DD.defs.heroes).filter(function (id) {
      return inParty.indexOf(id) < 0 && S.fallen.indexOf(id) < 0 && (!DD.Meta || DD.Meta.isUnlocked(id));
    });
  }

  /** The level a recruit for party slot replaceIdx joins at: the lowest level among the living heroes who stay
   *  (v2 leveling keeps them within one level of each other), else the replaced hero's level, else 1. */
  function recruitLevel(replaceIdx) {
    if (!S) return 1;
    const old = S.party[replaceIdx] || null;
    const others = S.party.filter(function (h, i) { return h && !h.dead && i !== replaceIdx; });
    if (others.length) return Math.min.apply(null, others.map(function (h) { return h.level; }));
    return old ? old.level : 1;
  }

  /** Swap party slot replaceIdx (dead or alive) for a recruit at the living party's lowest level (recruitLevel).
   *  The old hero's equipment goes back to the bag. A party with fewer than 4 heroes may append. The recruit arrives
   *  with its Blessings already rolled (run start + one per level, resolved by the headless policy) and no pending
   *  level-ups. Returns the RunHero. */
  function recruit(heroId, replaceIdx) {
    if (!S || S.over || recruitCandidates().indexOf(heroId) < 0) return null;
    if (typeof replaceIdx !== 'number') replaceIdx = S.party.length < 4 ? S.party.length : -1;
    if (replaceIdx < 0 || replaceIdx > S.party.length || replaceIdx >= 4) return null;
    const old = S.party[replaceIdx] || null;
    const rh = makeRunHero(heroId, recruitLevel(replaceIdx));
    autoRollPassivesFor(rh);
    if (old) {
      SLOTS.forEach(function (slot) { if (old.items[slot]) S.inventory.push(old.items[slot]); });
      S.learnQueue = S.learnQueue.filter(function (q) { return q.heroId !== old.id; });
    }
    S.party[replaceIdx] = rh;
    S.maxConsumables = computeMaxConsumables();
    touch();
    return rh;
  }

  function enterTavern(node) {
    node.done = true;
    S.pending = { type: 'tavern', data: { nodeId: node.id, used: null, greeting: narr('tavern_greet'), recruits: recruitCandidates() } };
    touch();
    show('tavern', S.pending.data);
  }
  /** Pending tavern: { used: null|'rest'|'train'|'recruit', recruits: [heroIds] }, or null. */
  function tavern() { return S && S.pending && S.pending.type === 'tavern' ? S.pending.data : null; }
  function tavernOpen() {
    const t = tavern();
    if (!t) return { error: result(false, 'There is no tavern here.', { reason: 'closed' }) };
    if (t.used) return { error: result(false, 'You already chose to ' + t.used + ' here.', { reason: 'used' }) };
    return { t: t };
  }
  /** Rest: every living hero heals 35% max HP and one scar is removed (scarHeroIdx, else the most scarred hero). */
  function tavernRest(scarHeroIdx) {
    const c = tavernOpen();
    if (c.error) return c.error;
    const healed = healParty(healOf('tavern'));
    const pick = heroAt(scarHeroIdx);
    const idx = pick && !pick.dead && pick.scars.length ? scarHeroIdx : mostScarred();
    const removed = idx >= 0 ? removeScar(idx) : null;
    c.t.used = 'rest';
    touch();
    let text = (narr('rest') + ' The party heals ' + healed + ' HP.').trim();
    if (removed) {
      const sd = DD.getScar(removed);
      text += ' ' + heroName(idx) + ' is no longer bothered by ' + (sd ? sd.name : removed) + '.';
    }
    return result(true, text, { healed: healed, scar: removed ? { heroIdx: idx, scarId: removed } : null });
  }
  /** Train: +1 level for one socketed skill. */
  function tavernTrain(heroIdx, skillIdx) {
    const c = tavernOpen();
    if (c.error) return c.error;
    if (!upgradeSkill(heroIdx, skillIdx)) return result(false, 'That skill can not be trained any further.', { reason: 'maxed' });
    c.t.used = 'train';
    touch();
    const sk = S.party[heroIdx].skills[skillIdx];
    const sd = DD.getSkill(sk.id);
    return result(true, heroName(heroIdx) + ' trained ' + (sd ? sd.name : sk.id) + ' to ' + DD.util.roman(sk.level) + '. The bartender is unimpressed.');
  }
  /** Recruit: swap party slot replaceIdx for heroId (see recruit()). */
  function tavernRecruit(heroId, replaceIdx) {
    const c = tavernOpen();
    if (c.error) return c.error;
    const oldName = heroAt(replaceIdx) ? heroName(replaceIdx) : '';
    const rh = recruit(heroId, replaceIdx);
    if (!rh) return result(false, 'That hero is not available.', { reason: 'invalid' });
    c.t.used = 'recruit';
    c.t.recruits = recruitCandidates();
    touch();
    const name = heroName(rh);
    const line = narr('recruit', { hero: name, name: name });
    // the recruit's Blessings were rolled off-screen (headless policy): say what they brought
    const bless = (rh.passives || []).map(function (p) { return passiveName(p.id) + (p.level > 1 ? ' ' + DD.util.roman(p.level) : ''); });
    const blessText = bless.length ? ' Blessings in tow: ' + bless.join(', ') + '.' : '';
    return result(true, (line + ' ' + name + ' joins at level ' + rh.level + (oldName ? ', replacing ' + oldName : '') + '.' + blessText).trim(), { hero: rh });
  }

  // ---- treasure ------------------------------------------------------------------------------------------------------
  function enterTreasure(node) {
    node.done = true;
    const t = DD.Rewards.treasure(S.act, rng(), S);
    const gold = addGold(t.gold);
    S.pending = {
      type: 'rewards',
      data: rewardData('treasure', 'treasure', gold, t.choices, { nodeId: node.id, title: 'Treasure!', text: narr('treasure') }),
    };
    touch();
    show('rewards', S.pending.data);
  }

  // ---- flow ------------------------------------------------------------------------------------------------------------
  function showEnd() {
    const id = S.over === 'victory' ? 'victory' : 'gameover';
    show(id, endParams());
    return id;
  }
  function afterStep() {
    if (S.queuedCombat) { startQueuedCombat(); return lastScreen; }
    if (hasPendingChoices() && lastScreen !== 'levelup') {
      show('levelup', { queue: levelQueueFull(), learns: pendingLearns() });
      return 'levelup';
    }
    show('map', { act: S.act });
    return 'map';
  }

  /** Show the screen for the current state (after load(), or to re-sync the UI). Loads the save when no run is
   *  in memory. A fight that was interrupted restarts. Returns the screen id. */
  function resume() {
    if (!S && !load()) { show('title'); return 'title'; }
    if (S.over) return showEnd();
    const p = S.pending;
    if (p && p.type === 'combat') {
      if (inCombat) show('combat');
      else launchCombat();
      return lastScreen;
    }
    if (p && p.type === 'rewards' && p.data.taken === null && !p.data.skipped) { show('rewards', p.data); return 'rewards'; }
    if (p && p.type === 'event' && !p.data.resolved) { show('event', { eventId: p.data.eventId }); return 'event'; }
    if (p && p.type === 'shop') { show('shop', p.data); return 'shop'; }
    if (p && p.type === 'tavern') { show('tavern', p.data); return 'tavern'; }
    return afterStep();
  }

  /** Leave the current step (rewards / shop / tavern / resolved event) and go on: a fight queued by an event,
   *  then pending level-ups (once), then the map. A running fight or an unresolved event is re-shown instead. */
  function next() {
    if (!S) { show('title'); return 'title'; }
    if (S.over) return showEnd();
    const p = S.pending;
    if (p && (p.type === 'combat' || (p.type === 'event' && !p.data.resolved))) return resume();
    if (p) { closeStep(); touch(); }
    return afterStep();
  }

  /** Safety nets when the map screen shows (game UI only): restart a fight interrupted by a reload, and start a
   *  fight promised by an event outcome if the event screen went straight to the map. */
  function onUiScreen(e) {
    const id = e && typeof e === 'object' ? e.id : e;
    if (typeof id !== 'string') return;
    lastScreen = id;
    if (id !== 'map' || !uiOn() || !S || S.over || inCombat) return;
    const fightPending = !!(S.pending && S.pending.type === 'combat');
    if (!fightPending && !S.queuedCombat) return;
    setTimeout(function () {
      if (!S || S.over || inCombat || lastScreen !== 'map') return;
      if (S.pending && S.pending.type === 'combat') launchCombat();
      else if (S.queuedCombat) startQueuedCombat();
    }, 0);
  }
  DD.afterLoad(function () { DD.Events.on('ui:screen', onUiScreen); });

  // Used when an event node has no valid event (empty registry, all unique events seen).
  DD.registerEvent({
    id: FALLBACK_EVENT, acts: [1, 2, 3], weight: 0, unique: false, icon: '📓', fallback: true,
    title: 'The DM Did Not Prep This Room',
    text: function () {
      return 'You open the door onto a perfectly blank room. Behind his screen, the DM flips through his notes, ' +
        'sweating. "It is... a room. It has a floor. Everybody roll for vibes?"';
    },
    choices: [
      {
        label: 'Wait politely.', hint: 'Gain 15 gold.',
        // the amount actually gained: gold Blessings (runMods.gold) can make it more
        resolve: function (api) { const g = api.gold(15); return 'The DM slides you ' + g + ' gold to make the staring stop. Awkward, but profitable.'; },
      },
      {
        label: 'Help him improvise.', hint: 'One hero levels up (the DM rolls among the lowest-level heroes).',
        resolve: function (api) {
          const lv = api.levelUp();
          return 'You describe a dramatic chandelier. The DM declares it canon' + (lv ? ' and, as thanks, ' + lv.name + ' levels up.' :
            '. Everyone is already max level, so he just says "nice" and means it.');
        },
      },
    ],
  });

  Object.assign(Run, {
    VERSION: VERSION, SAVE_KEY: SAVE_KEY, FINAL_ACT: FINAL_ACT, MAX_SKILLS: MAX_SKILLS, MAX_LEVEL: MAX_LEVEL,
    DOWNS_TO_DIE: DOWNS_TO_DIE, DIFFICULTIES: DIFFICULTIES, PERKS: PERKS, FALLBACK_EVENT: FALLBACK_EVENT,
    useUi: null,      // null: UI calls unless DD.headless · true: always · false: never
    rng: rng,
    // persistence & flow
    hasSave: hasSave, load: load, save: save, clear: clear, abandon: abandon, newRun: newRun,
    resume: resume, next: next, leave: next,
    // map
    availableNodes: availableNodes, travel: travel, currentNode: currentNode,
    // combat
    startCombat: startCombat, finishCombat: finishCombat,
    currentCombat: function () { return combat; },
    inCombat: function () { return inCombat; },
    // party
    heroStats: heroStats, makeRunHero: makeRunHero, heroName: heroName, hero: heroAt, indexOf: idxOf,
    aliveHeroes: aliveIdx, partyLevel: partyLevel, recruitLevel: recruitLevel,
    addGold: addGold, spendGold: spendGold, addItem: addItem, equip: equip, unequip: unequip, canEquip: canEquip,
    autoEquip: autoEquip, addConsumable: addConsumable, removeConsumable: removeConsumable,
    maxConsumables: function () { return S ? S.maxConsumables : BASE_CONSUMABLES; },
    healParty: healParty, healHero: healHero, damageHero: damageHero, addScar: addScar, removeScar: removeScar,
    // progression (v2: one level-up per won fight through the rotation; grantXp / grantHeroXp are XP-era aliases)
    levelUp: levelUp, grantLevelUps: grantLevelUps, levelUpCandidates: levelUpCandidates, nextLevelUp: nextLevelUp,
    levelUpsPerWin: levelUpsPerWin, grantXp: grantXp, grantHeroXp: grantHeroXp,
    levelUpChoices: levelUpChoices, applyLevelChoice: applyLevelChoice,
    levelQueue: levelQueue, hasPendingChoices: hasPendingChoices,
    learnSkill: learnSkill, upgradeSkill: upgradeSkill, giveSkill: giveSkill, pendingLearns: pendingLearns,
    resolveLearn: resolveLearn, forgetText: forgetText, learnableFor: learnableFor, upgradableFor: upgradableFor,
    learnableSkills: function (idx, opts) { return learnableFor(heroAt(idx), opts); },
    upgradableSkills: function (idx) { return upgradableFor(heroAt(idx)); },
    // random passives (the Table of Questionable Blessings, §9.6)
    passiveRng: prng, pendingRolls: pendingRolls, rollQueue: rollQueue, currentRoll: currentRoll, resolveRoll: resolveRoll,
    nextLevelStep: nextLevelStep, grantRoll: queueRoll, autoResolveRolls: autoResolve, addPassive: addPassive,
    removePassive: removePassive, autoRollPassives: autoRollPassives,
    passiveMods: function () { return DD.Passives ? DD.Passives.partyMods(S) : { gold: 0, xp: 0, price: 0, heal: 0 }; },
    // rewards
    rewards: rewards, takeReward: takeReward, skipRewards: skipRewards, isRewardTaken: isRewardTaken,
    noteRewardApplied: noteRewardApplied,
    // events
    eventApi: eventApi, currentEvent: currentEvent, chooseEventOption: chooseEventOption, openEvent: openEvent,
    resolveEvent: resolveEvent, finishEvent: leaveNode, queueCombat: queueCombat, startQueuedCombat: startQueuedCombat,
    leaveNode: leaveNode, leaveShop: leaveNode, leaveTavern: leaveNode, closeStep: leaveNode, levelQueueFull: levelQueueFull,
    // shop / tavern / recruits
    shop: shop, buy: buy, shopService: shopService,
    tavern: tavern, tavernRest: tavernRest, tavernTrain: tavernTrain, tavernRecruit: tavernRecruit,
    recruit: recruit, recruitCandidates: recruitCandidates,
    // act / end
    completeAct: completeAct, endRun: endRun,
    summary: function () { return S ? (S.summary || buildSummary(S.over || 'in progress')) : null; },
  });
  Object.defineProperty(Run, 'START_GOLD', { enumerable: true, get: startGold });   // DD.Balance.gold.start
  // the one level-up count per won fight (DD.Rewards.LEVEL_UPS_PER_WIN, overridden by DD.Balance.leveling.perWin)
  Object.defineProperty(Run, 'LEVEL_UPS_PER_WIN', { enumerable: true, get: function () { return levelUpsPerWin('normal'); } });
})();
