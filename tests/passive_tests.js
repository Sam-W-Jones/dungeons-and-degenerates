/* Dungeons and Degenerates — tests/passive_tests.js
 * Suites "passives: ..." — the Table of Questionable Blessings (random passives) on the run side (DD.Passives +
 * DD.Run) and in the UI: d100 slices and weights, seeded rolls, requires / maxed / cursed filtering, upgrades, the
 * 4-slot limit, replace / discard, the headless policy, run-start rolls, level-up rolls that survive save / load,
 * old-save migration, recruits, the event API, the shop re-roll, runMods, whole headless runs, the DOM flows
 * (roll -> keep / replace / discard -> skill choice, party slots, HUD tooltip + inspect, shop, event, Hall of Fame)
 * and the edges (a def removed after a save, an empty table, maxed slots, a death with pending rolls, queued
 * level-ups, the keyboard).
 * Suites swap in their own test passives (ids test_rp_*) and restore the real table afterwards, so they never
 * depend on js/data/passives.js — except "passives: integration — whole AutoPlay runs with the real table", which
 * plays whole runs with the real table, heroes and encounters (it skips when they are not loaded).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  function json(v) { return JSON.stringify(v); }
  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

  // ---- test passives ------------------------------------------------------------------------------------------
  /** Weights (rarity defaults): curse 4, rock 10, socks 10, coffee 6, duck 3, crown 1 = 34; never: weight 0. */
  function basicTable() {
    return [
      { id: 'test_rp_curse', name: 'Test Curse', icon: '💀', rarity: 'cursed', levels: [{ d: 0.2, hp: -4 }],
        stats: function (L) { return { dmg: L.d, hp: L.hp }; }, desc: function (L) { return '+' + Math.round(L.d * 100) + '% damage, ' + L.hp + ' max HP.'; } },
      { id: 'test_rp_socks', name: 'Test Socks', icon: '🧦', rarity: 'common', levels: [{ a: 1 }, { a: 2 }, { a: 3 }],
        stats: function (L) { return { armor: L.a }; }, desc: function (L) { return '+' + L.a + ' armor.'; }, flavor: 'Smells lucky.' },
      { id: 'test_rp_rock', name: 'Test Rock', icon: '🪨', rarity: 'common', levels: [{ hp: 3 }, { hp: 6 }],
        stats: function (L) { return { hp: L.hp }; }, desc: function (L) { return '+' + L.hp + ' max HP.'; } },
      { id: 'test_rp_coffee', name: 'Test Coffee', icon: '☕', rarity: 'uncommon', levels: [{}], desc: 'Jittery. Does nothing measurable.' },
      { id: 'test_rp_duck', name: 'Test Duck', icon: '🦆', rarity: 'rare', levels: [{ n: 1 }, { n: 2 }], desc: function (L) { return L.n + ' emotional support duck(s).'; } },
      { id: 'test_rp_crown', name: 'Test Crown', icon: '👑', rarity: 'legendary', levels: [{ n: 1 }, { n: 2 }, { n: 3 }], desc: function (L) { return 'Crown level ' + L.n + '.'; } },
      { id: 'test_rp_never', name: 'Test Never', icon: '🚫', rarity: 'rare', weight: 0, levels: [{}], desc: 'Event-only, never rolled.' },
    ];
  }
  function modsTable() {
    return [
      { id: 'test_rp_gold', name: 'Test Magnet', rarity: 'common', levels: [{ g: 0.5 }], runMods: function (L) { return { gold: L.g }; }, desc: '+50% gold income.' },
      { id: 'test_rp_haggle', name: 'Test Haggler', rarity: 'common', levels: [{}], runMods: { price: -0.8 }, desc: 'Shop prices -80% (never below 50%).' },
      { id: 'test_rp_xp', name: 'Test Nerd', rarity: 'common', levels: [{ x: 0.5 }], runMods: function (L) { return { xp: L.x }; }, desc: 'Weight 1.5 in the level-up rotation.' },
      { id: 'test_rp_heal', name: 'Test Snack', rarity: 'common', levels: [{}], runMods: { heal: 1 }, desc: 'Double out-of-combat healing.' },
    ];
  }
  function registerTable(list) { list.forEach(function (d) { DD.registerPassive(Object.assign({}, d)); }); }

  /** Run fn with DD.defs.passives replaced by `list` (restored afterwards). */
  async function withTable(list, fn) {
    const saved = DD.defs.passives;
    DD.defs.passives = {};
    try {
      registerTable(list);
      return await fn();
    } finally {
      DD.defs.passives = saved;
    }
  }

  // ---- run sandbox (own content + scripted fake engine, like tests/run_tests.js) -------------------------------------
  const RSWAP = ['heroes', 'skills', 'items', 'consumables', 'encounters', 'events', 'statuses', 'passives'];
  const PARTY = ['tp_a', 'tp_b', 'tp_c', 'tp_d'];

  function registerRunContent() {
    const colors = ['#e25822', '#c86bff', '#9fb7c9', '#d9692b', '#5cbf5a'];
    ['tp_a', 'tp_b', 'tp_c', 'tp_d', 'tp_e'].forEach(function (id, n) {
      const pool = [1, 2, 3, 4, 5, 6].map(function (k) { return id + '_s' + k; });
      pool.forEach(function (sid) {
        DD.registerSkill({ id: sid, name: 'Skill ' + sid, owner: id, icon: '✦', kind: 'attack', ap: 1, levels: [{ dmg: 5 }, { dmg: 6 }, { dmg: 8 }],
          target: { type: 'unit', range: [1, 1], filter: 'enemy' }, desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; }, execute: function () {} });
      });
      DD.registerSkill({ id: id + '_basic', name: 'Poke', owner: id, icon: '👉', levels: [{ dmg: 4 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' }, desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; }, execute: function () {} });
      DD.registerSkill({ id: id + '_sig', name: 'Big Finish', owner: id, icon: '🌟', hype: 100, levels: [{ dmg: 20 }], target: { type: 'self' }, desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; }, execute: function () {} });
      DD.registerHero({
        id: id, name: 'Tester ' + id.slice(3).toUpperCase(), epithet: 'the Blessed', race: 'Human', cls: 'Tester', unlock: null, color: colors[n],
        stats: { hp: 20 + n * 2, ap: 3, mov: 4, armor: 0 }, growth: { hp: 4 }, sprite: { base: 'humanoid', palette: { skin: colors[n] } },
        basic: id + '_basic', signature: id + '_sig', passive: { name: 'Test Passive', desc: 'Does nothing.', hooks: {} },
        startingSkills: [pool[0], pool[1]], skillPool: pool, barks: { levelup: ['Ding!'] },
      });
    });
    DD.registerItem({ id: 'tp_item', name: 'Test Hat', slot: 'armor', rarity: 'common', icon: '🎩', stats: { armor: 1 }, desc: 'A hat.' });
    DD.registerItem({ id: 'tp_item2', name: 'Test Ring', slot: 'trinket', rarity: 'rare', icon: '💍', stats: { hp: 3 }, desc: 'A ring.' });
    DD.registerItem({ id: 'tp_item3', name: 'Test Stick', slot: 'weapon', rarity: 'legendary', icon: '🪵', stats: { dmg: 0.1 }, desc: 'A stick.' });
    DD.registerConsumable({ id: 'tp_pot', name: 'Test Potion', rarity: 'common', target: { type: 'self' }, desc: 'Test.', execute: function () {} });
    [1, 2, 3].forEach(function (act) {
      ['normal', 'elite', 'boss'].forEach(function (kind) {
        for (let i = 1; i <= (kind === 'normal' ? 6 : 2); i++) {
          DD.registerEncounter({ id: 'tp_enc_a' + act + '_' + kind + '_' + i, act: act, kind: kind, name: 'Test ' + kind,
            map: { theme: 'cellar', w: 8, h: 8 }, enemies: [{ id: 'tp_enemy', n: 2 }], reward: { goldMult: 1 } });
        }
      });
    });
    DD.registerEvent({
      id: 'tp_ev_roll', acts: [1, 2, 3], icon: '🎲', title: 'The Dice Goblin', text: function () { return 'A goblin offers you a roll on his table.'; },
      choices: [
        { label: 'Roll.', hint: 'Hero 1 gets a Blessing roll.', resolve: function (api) { api.rollPassive(0); return 'The goblin cackles.'; } },
        { label: 'Leave.', resolve: function () { return 'You leave.'; } },
      ],
    });
  }

  function fakeEngine() {
    const eng = { starts: [] };
    eng.Encounter = {
      build: function (def, party) {
        return {
          grid: null, theme: 'cellar', encounter: def, objective: { type: 'killAll' }, rules: [], deployTiles: [], reinforcements: [],
          heroes: party.map(function (rh, i) { return { runHero: rh, x: i, y: 0 }; }), enemies: [],
        };
      },
    };
    eng.Combat = {
      start: function (setup, opts) {
        const st = {
          id: 'fake' + eng.starts.length, result: null, run: opts.run, stats: { units: {} },
          units: setup.heroes.map(function (h, i) {
            return { id: 'h' + i, kind: 'hero', side: 'hero', defId: h.runHero.id, runHero: h.runHero, hp: h.runHero.hp, maxHp: DD.Run.heroStats(h.runHero).maxHp, downed: false, dead: false };
          }),
        };
        eng.starts.push({ opts: opts, state: st });
        return st;
      },
    };
    eng.end = function (result, mutate) {
      const L = eng.starts[eng.starts.length - 1];
      if (mutate) mutate(L.state.units, L.state);
      L.state.result = result;
      L.opts.onEnd(result, L.state);
      return L.state;
    };
    return eng;
  }

  /** fn(eng) inside fresh registries (test heroes + `table` passives), a fake engine and a clean Run/Meta.
   *  opts.ui: Run.useUi = true (rolls wait for the UI instead of the headless policy). */
  async function runSandbox(t, table, fn, opts) {
    opts = opts || {};
    const saved = {};
    RSWAP.forEach(function (k) { saved[k] = DD.defs[k]; DD.defs[k] = {}; });
    const savedCombat = DD.Combat, savedEncounter = DD.Encounter;
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    const savedUi = DD.Run.useUi;
    const p0 = DD.problems.length;
    const eng = fakeEngine();
    try {
      registerRunContent();
      registerTable(table || basicTable());
      if (DD.problems.length > p0) t.fail('sandbox content raised registry warnings: ' + DD.problems.slice(p0).join(' | '));
      const fb = saved.events[DD.Run.FALLBACK_EVENT];
      if (fb) DD.defs.events[fb.id] = fb;
      DD.Combat = eng.Combat;
      DD.Encounter = eng.Encounter;
      DD.Run.useUi = opts.ui ? true : false;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.reset(false);
      return await fn(eng);
    } finally {
      if (DD.UI && DD.UI.closeAllModals) { DD.UI.closeAllModals('test'); DD.UI.hideTooltip(); }
      RSWAP.forEach(function (k) { DD.defs[k] = saved[k]; });
      DD.Combat = savedCombat;
      DD.Encounter = savedEncounter;
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (opts.ui && DD.UI && DD.UI.show) DD.UI.show('title');
    }
  }

  function S() { return DD.Run.state; }
  function rh0() { return S().party[0]; }
  function ids(rh) { return (rh.passives || []).map(function (p) { return p.id; }); }
  /** Hero idx gains exactly n levels (named level-ups, v2: no XP). */
  function levelUp(idx, n) {
    for (let k = 0; k < (n || 1); k++) DD.Run.levelUp(idx, { src: 'debug' });
  }
  function fresh(id, level) { return { id: id, level: level || 1, upgrade: false, d100: 50, rarity: DD.getPassive(id).rarity, from: 1, to: 100, pct: 1 }; }

  // ---- DD.Passives: the table ------------------------------------------------------------------------------------
  T.suite('passives: table — d100 slices, weights, order, requires, maxed and cursed exclusion', function (t) {
    if (!DD.Passives) { t.fail('DD.Passives missing'); return; }
    return withTable(basicTable().concat([{ id: 'test_rp_only_a', name: 'Only A', rarity: 'uncommon', levels: [{}], desc: 'A only.',
      requires: function (rh, def) { return rh.id === 'tp_a' && def === DD.getHero(rh.id); } }]), function () {
      const P = DD.Passives;
      t.eq(P.MAX, 4, 'MAX is 4');
      t.eq(DD.getPassive('test_rp_crown').weight, 1, 'legendary default weight 1');
      t.eq(DD.getPassive('test_rp_coffee').weight, 6, 'uncommon default weight 6');
      t.eq(P.count(), 7, 'count() skips weight-0 entries');
      const tbl = P.table(null).filter(function (e) { return e.id !== 'test_rp_only_a'; });
      t.eq(json(P.table(null).map(function (e) { return e.id; })), json(['test_rp_curse', 'test_rp_rock', 'test_rp_socks', 'test_rp_coffee', 'test_rp_only_a', 'test_rp_duck', 'test_rp_crown']),
        'table order: cursed at the bottom (NAT 1s), then common → legendary (top), ids sorted; weight 0 left out');
      t.ok(P.table(null).every(function (e) { return e.from >= 1 && e.to <= 100 && e.from <= e.to; }), 'every slice inside 1..100');
      const full = P.table(null);
      t.eq(full[0].from, 1, 'first slice starts at 1');
      t.eq(full[full.length - 1].to, 100, 'last slice ends at 100');
      t.ok(full.every(function (e, i) { return i === 0 || (e.from === full[i - 1].to || e.from === full[i - 1].to + 1); }), 'slices are contiguous (tiny ones may share a number)');
      t.near(full.reduce(function (a, e) { return a + e.pct; }, 0), 100, 1e-9, 'slice percentages sum to 100');
      // exact slices without the requires-only entry (total weight 34)
      return withTable(basicTable(), function () {
        const t2 = P.table(null);
        const slice = function (id) { const e = t2.filter(function (x) { return x.id === id; })[0]; return e.from + '-' + e.to; };
        t.eq(slice('test_rp_curse'), '1-12', 'cursed 4/34 → 1-12');
        t.eq(slice('test_rp_rock'), '12-42', 'rock 10/34 → 12-42');
        t.eq(slice('test_rp_socks'), '42-71', 'socks → 42-71');
        t.eq(slice('test_rp_coffee'), '71-89', 'coffee 6/34 → 71-89');
        t.eq(slice('test_rp_duck'), '89-98', 'duck 3/34 → 89-98');
        t.eq(slice('test_rp_crown'), '98-100', 'crown 1/34 → 98-100');
        const lo = P.entryAt(t2, 0), hi = P.entryAt(t2, 0.9999999);
        t.ok(lo.entry.id === 'test_rp_curse' && lo.d100 === 1, 'u = 0 → the cursed entry on a 1');
        t.ok(hi.entry.id === 'test_rp_crown' && hi.d100 === 100, 'u → 1 → the legendary on a 100');
        t.ok(t2.every(function (e) { const mid = (e.lo + e.hi) / 2 / e.total; const h = P.entryAt(t2, mid); return h.entry.id === e.id && h.d100 >= e.from && h.d100 <= e.to; }),
          'entryAt(middle of a slice) → that entry with a d100 inside its slice');
        t.eq(P.table(null, { noCursed: true })[0].id, 'test_rp_rock', 'noCursed drops cursed entries (commons start at 1)');
        t.eq(P.table(null, { noCursed: true })[0].from, 1, 'and re-slices the d100');
        t.ok(P.table(null, { exclude: ['test_rp_duck'] }).every(function (e) { return e.id !== 'test_rp_duck'; }), 'exclude list');
        const rh = { id: 'tp_b', level: 3, passives: [{ id: 'test_rp_socks', level: 2 }, { id: 'test_rp_rock', level: 2 }] };
        const tr = P.table(rh);
        const socks = tr.filter(function (e) { return e.id === 'test_rp_socks'; })[0];
        t.ok(socks && socks.upgrade && socks.level === 3, 'an owned passive below its max comes back as an upgrade (level +1)');
        t.ok(!tr.some(function (e) { return e.id === 'test_rp_rock'; }), 'an owned passive at max level is excluded');
      }).then(function () {
        const ra = P.table({ id: 'tp_a', passives: [] }), rb = P.table({ id: 'tp_b', passives: [] });
        t.ok(ra.some(function (e) { return e.id === 'test_rp_only_a'; }) && !rb.some(function (e) { return e.id === 'test_rp_only_a'; }), 'requires(runHero, heroDef) filters per hero');
        return withTable([], function () {
          const before = DD.problems.length;
          t.eq(P.table({ id: 'tp_a', passives: [] }).length, 0, 'empty registry → empty table');
          t.eq(P.roll({ id: 'tp_a', passives: [] }, DD.RNG(1)), null, 'empty table → roll() is null');
          t.eq(P.count(), 0, 'count() 0');
          t.eq(DD.problems.length, before, 'no warnings from an empty table');
        });
      });
    });
  });

  T.suite('passives: roll — seeded determinism, weighted distribution, upgrades, a broken requires', function (t) {
    return withTable(basicTable(), function () {
      const P = DD.Passives;
      const rh = { id: 'tp_a', passives: [] };
      const seq = function (seed) { const r = DD.RNG(seed); const out = []; for (let i = 0; i < 25; i++) out.push(P.roll(rh, r).id + ':' + P.roll(rh, r).d100); return out.join(','); };
      t.eq(seq('det'), seq('det'), 'same seed → same rolls');
      t.ok(seq('det') !== seq('other'), 'another seed → other rolls');
      const counts = {}, r = DD.RNG('dist');
      const N = 6800;
      let inSlice = true;
      for (let i = 0; i < N; i++) {
        const x = P.roll(rh, r);
        counts[x.id] = (counts[x.id] || 0) + 1;
        if (x.d100 < x.from || x.d100 > x.to || x.d100 < 1 || x.d100 > 100) inSlice = false;
        if (x.upgrade || x.level !== 1) inSlice = false;
      }
      t.ok(inSlice, 'every d100 lies in its slice; fresh rolls are level I, not upgrades');
      const w = { test_rp_curse: 4, test_rp_rock: 10, test_rp_socks: 10, test_rp_coffee: 6, test_rp_duck: 3, test_rp_crown: 1 };
      Object.keys(w).forEach(function (id) {
        const exp = N * w[id] / 34, got = counts[id] || 0;
        t.ok(Math.abs(got - exp) <= Math.max(45, exp * 0.12), id + ': ' + got + ' rolls ≈ ' + Math.round(exp) + ' expected from its weight');
      });
      t.ok(!counts.test_rp_never, 'weight 0 is never rolled');
      const owner = { id: 'tp_a', passives: [{ id: 'test_rp_crown', level: 1 }] };
      const rr = DD.RNG('up');
      let up = null;
      for (let i = 0; i < 4000 && !up; i++) { const x = P.roll(owner, rr); if (x.id === 'test_rp_crown') up = x; }
      t.ok(up && up.upgrade && up.level === 2, 'rolling an owned passive → upgrade to II');
      const maxed = { id: 'tp_a', passives: [{ id: 'test_rp_coffee', level: 1 }] };
      const rm = DD.RNG('mx');
      let sawCoffee = false;
      for (let i = 0; i < 2000; i++) if (P.roll(maxed, rm).id === 'test_rp_coffee') sawCoffee = true;
      t.ok(!sawCoffee, 'a maxed passive (single level) can never be rolled again');
      // a throwing `requires` is contained and excludes the entry (the warning is expected here)
      DD.registerPassive({ id: 'test_rp_boom', name: 'Boom', rarity: 'common', levels: [{}], desc: 'x', requires: function () { throw new Error('boom'); } });
      const before = DD.problems.length;
      const ok = P.table({ id: 'tp_a', passives: [] }).every(function (e) { return e.id !== 'test_rp_boom'; });
      const warned = DD.problems.slice(before).filter(function (p) { return /boom/.test(p); }).length;
      DD.problems.length = before;
      t.ok(ok && warned > 0, 'a throwing requires is reported and the entry is left out');
    });
  });

  T.suite('passives: apply & policy — keep, upgrade, replace, discard, 4-slot limit, sanitize', function (t) {
    return withTable(basicTable(), function () {
      const P = DD.Passives;
      const rh = { id: 'tp_a', passives: [] };
      ['test_rp_socks', 'test_rp_rock', 'test_rp_coffee', 'test_rp_duck'].forEach(function (id) {
        const res = P.apply(rh, fresh(id), 'keep');
        t.ok(res.ok && res.action === 'keep', 'keep ' + id);
      });
      t.eq(rh.passives.length, 4, '4 slots filled');
      const fifth = P.apply(rh, fresh('test_rp_crown'), 'keep');
      t.ok(!fifth.ok && fifth.needsReplace, 'a 5th Blessing needs a replace (or discard)');
      t.eq(rh.passives.length, 4, 'still 4');
      t.ok(!P.apply(rh, fresh('test_rp_crown'), 'replace', 9).ok, 'replace needs a valid slot');
      const rep = P.apply(rh, fresh('test_rp_crown'), 'replace', 2);
      t.ok(rep.ok && rep.replaced.id === 'test_rp_coffee' && rh.passives[2].id === 'test_rp_crown', 'replace slot 2: coffee is gone, crown is in');
      const dis = P.apply(rh, fresh('test_rp_curse'), 'discard');
      t.ok(dis.ok && dis.action === 'discard' && ids(rh).indexOf('test_rp_curse') < 0, 'discard changes nothing');
      const upg = P.apply(rh, { id: 'test_rp_socks', level: 2, upgrade: true, d100: 50, rarity: 'common' }, 'upgrade');
      t.ok(upg.ok && upg.action === 'upgrade' && rh.passives[0].level === 2, 'upgrade an owned passive');
      const acc = P.apply(rh, fresh('test_rp_socks'), 'keep');
      t.ok(acc.ok && acc.action === 'upgrade' && rh.passives[0].level === 3, 'a stale "new" roll of an owned passive upgrades it instead');
      t.ok(!P.apply(rh, fresh('test_rp_socks'), 'keep').ok, 'nothing to do once maxed (stale roll)');
      t.eq(P.options(rh, fresh('test_rp_curse')).keep, false, 'options: no keep when full');
      t.eq(P.options(rh, fresh('test_rp_curse')).replace, true, 'options: replace when full');
      t.eq(P.options({ id: 'tp_a', passives: [] }, fresh('test_rp_curse')).replace, false, 'options: nothing to replace when empty');
      // headless policy
      const pol = function (passives, id, lv) { return P.policy({ id: 'tp_a', passives: passives }, lv ? { id: id, level: lv, upgrade: true, rarity: DD.getPassive(id).rarity } : fresh(id)); };
      t.eq(pol([], 'test_rp_curse').action, 'keep', 'policy: a free slot takes anything (even cursed)');
      t.eq(pol([{ id: 'test_rp_curse', level: 1 }, { id: 'test_rp_crown', level: 1 }], 'test_rp_crown', 2).action, 'upgrade', 'policy: upgrades are taken');
      const fullList = function () { return [{ id: 'test_rp_crown', level: 1 }, { id: 'test_rp_curse', level: 1 }, { id: 'test_rp_rock', level: 1 }, { id: 'test_rp_duck', level: 2 }]; };
      t.eq(pol(fullList(), 'test_rp_curse').action, 'discard', 'policy: never take cursed when full');
      const p1 = pol(fullList(), 'test_rp_coffee');
      t.ok(p1.action === 'replace' && p1.slot === 1, 'policy: full → replace the cursed one first');
      const noCurse = [{ id: 'test_rp_crown', level: 1 }, { id: 'test_rp_socks', level: 3 }, { id: 'test_rp_rock', level: 1 }, { id: 'test_rp_duck', level: 2 }];
      const p2 = P.policy({ id: 'tp_a', passives: noCurse }, fresh('test_rp_coffee'));
      t.ok(p2.action === 'replace' && p2.slot === 2, 'policy: else the lowest rarity, lowest level (rock I over socks III)');
      const allRare = [{ id: 'test_rp_crown', level: 1 }, { id: 'test_rp_duck', level: 1 }, { id: 'test_rp_crown', level: 1 }, { id: 'test_rp_duck', level: 1 }];
      t.eq(P.policy({ id: 'tp_a', passives: allRare }, fresh('test_rp_socks')).action, 'discard', 'policy: only replace when the new one is better');
      const autoRh = { id: 'tp_a', passives: fullList() };
      const auto = P.apply(autoRh, fresh('test_rp_coffee'), 'auto');
      t.ok(auto.ok && auto.action === 'replace' && ids(autoRh).indexOf('test_rp_curse') < 0, 'apply(auto) follows the policy');
      // sanitize
      const s = P.sanitize([{ id: 'test_rp_socks', level: 9 }, 'test_rp_rock', { id: 'test_rp_socks', level: 1 }, { id: 'nope', level: 7 }, null, { id: 'test_rp_duck' }, { id: 'test_rp_crown' }]);
      t.eq(json(s), json([{ id: 'test_rp_socks', level: 3 }, { id: 'test_rp_rock', level: 1 }, { id: 'nope', level: 3 }, { id: 'test_rp_duck', level: 1 }]),
        'sanitize: strings → entries, duplicates and junk dropped, levels clamped, max 4 (unknown ids kept for old saves)');
      const d = P.describe({ id: 'test_rp_socks', level: 2 });
      t.ok(d.name === 'Test Socks' && d.desc === '+2 armor.' && d.next === '+3 armor.' && d.prev === '+1 armor.' && d.rarityName === 'Common', 'describe: exact desc at the level + next / previous');
      t.eq(P.describe('nope').known, false, 'describe of an unknown id is a placeholder');
      t.ok(/NAT 1/.test(P.quip({ id: 'test_rp_curse', d100: 1, rarity: 'cursed' })), 'a d100 of 1 gets the NAT 1 line');
      t.ok(/NATURAL 100/.test(P.quip({ id: 'test_rp_crown', d100: 100, rarity: 'legendary' })), 'a 100 gets the natural 100 line');
      t.eq(P.quip({ id: 'test_rp_duck', d100: 90, rarity: 'rare' }), P.quip({ id: 'test_rp_duck', d100: 90, rarity: 'rare' }), 'quips are stable for a roll');
    });
  });

  // ---- the run flow ---------------------------------------------------------------------------------------------------
  T.suite('passives: run — run-start rolls, level-up rolls, nextLevelStep, save/load never re-rolls', function (t) {
    return runSandbox(t, basicTable(), function () {
      let curseFree = true, one = true;
      for (let i = 0; i < 25; i++) {
        DD.Run.newRun(PARTY, 'normal', 'start' + i);
        S().party.forEach(function (h) {
          if (h.passives.length !== 1) one = false;
          if (h.passives.some(function (p) { return DD.getPassive(p.id).rarity === 'cursed'; })) curseFree = false;
          if (h.passiveRolls.length) one = false;
        });
      }
      t.ok(one, 'every hero starts with exactly one Blessing (auto-kept, nothing pending)');
      t.ok(curseFree, 'run-start rolls are never cursed (25 runs)');
      DD.Run.newRun(PARTY, 'normal', 'same');
      const a = json(S().party.map(ids));
      DD.Run.newRun(PARTY, 'normal', 'same');
      t.eq(json(S().party.map(ids)), a, 'run-start rolls are deterministic by seed');
      t.eq(DD.Run.heroStats(0).maxHp, DD.Run.heroStats(S().party[0]).maxHp, 'heroStats with passive stats');

      // level-ups with the UI on: rolls wait (stored once rolled), one per level, before each skill choice
      DD.Run.useUi = true;
      DD.Run.newRun(PARTY, 'normal', 'lvl');
      const mainState = DD.Run.rng().getState();
      levelUp(0, 2);
      const rh = rh0();
      t.eq(rh.pendingLevels, 2, 'two levels pending');
      t.eq(rh.passiveRolls.length, 2, 'one pending roll per level gained');
      t.ok(rh.passiveRolls.every(function (j) { return j.src === 'level' && j.roll === null; }), 'level rolls are rolled lazily');
      t.eq(json(rh.passiveRolls.map(function (j) { return j.lv; })), json([2, 3]), 'each roll remembers its level');
      t.ok(DD.Run.hasPendingChoices(), 'pending rolls count as pending choices');
      t.eq(DD.Run.nextLevelStep(0), 'roll', 'the first step is the roll');
      const r1 = DD.Run.currentRoll(0);
      t.ok(r1 && r1.src === 'level' && r1.lv === 2 && r1.d100 >= 1 && r1.d100 <= 100, 'currentRoll rolls the front job');
      t.eq(DD.Run.rng().getState(), mainState, 'rolls use their own RNG stream (loot / maps are not shifted)');
      t.eq(json(DD.Run.currentRoll(0)), json(r1), 'asking again returns the stored roll');
      DD.Run.state = null;
      t.ok(DD.Run.load(), 'reload the save');
      const r1b = DD.Run.currentRoll(0);
      t.ok(r1b.id === r1.id && r1b.d100 === r1.d100 && r1b.level === r1.level, 'reloading never re-rolls (same Blessing, same d100)');
      const before = rh0().passives.length;
      const res = DD.Run.resolveRoll(0, 'keep');
      t.ok(res.ok && (res.action === 'keep' || res.action === 'upgrade') && /Tester A/.test(res.text), 'keep resolves the roll: ' + res.text);
      t.ok(rh0().passives.length === before + (res.action === 'keep' ? 1 : 0), 'the Blessing is socketed');
      t.eq(DD.Run.nextLevelStep(0), 'choice', 'then the skill choice for that level');
      t.ok(DD.Run.applyLevelChoice(0, 2, -1).ok, 'apply the level choice');
      t.eq(DD.Run.nextLevelStep(0), 'roll', 'second level: roll first again');
      const r2 = DD.Run.currentRoll(0);
      DD.Run.state = null;
      DD.Run.load();
      t.eq(DD.Run.currentRoll(0).d100, r2.d100, 'second stored roll also survives a reload');
      t.ok(DD.Run.resolveRoll(0, 'discard').ok, 'discard');
      t.ok(DD.Run.applyLevelChoice(0, 2, -1).ok, 'second choice');
      t.eq(DD.Run.nextLevelStep(0), null, 'nothing left');
      t.ok(!DD.Run.hasPendingChoices(), 'no pending choices');
      t.eq(DD.Run.currentRoll(0), null, 'no current roll');
      t.eq(DD.Run.resolveRoll(0, 'keep').reason, 'none', 'resolving nothing fails politely');

      // a stored roll is re-checked: the hero got that Blessing meanwhile → it becomes an upgrade
      levelUp(1, 1);
      const r3 = DD.Run.currentRoll(1);
      const def3 = DD.getPassive(r3.id);
      if (!r3.upgrade && def3.maxLevel > 1) {
        S().party[1].passives = [{ id: r3.id, level: 1 }];
        const r3b = DD.Run.currentRoll(1);
        t.ok(r3b.id === r3.id && r3b.d100 === r3.d100 && r3b.upgrade && r3b.level === 2, 'stale stored roll → same Blessing as an upgrade');
      } else t.ok(true, 'stale-roll check skipped for this seed');
      DD.Run.resolveRoll(1, 'discard');

      // headless (UI off): rolls are resolved at once by the policy
      DD.Run.useUi = false;
      const n0 = rh0().passives.length;
      levelUp(0, 1);
      t.eq(rh0().passiveRolls.length, 0, 'without the UI the level roll is resolved immediately');
      t.ok(rh0().passives.length >= n0, 'by the policy (kept or upgraded)');
      t.eq(DD.Run.nextLevelStep(0), 'choice', 'only the skill choice remains');

      // a dead hero drops its pending rolls
      DD.Run.useUi = true;
      levelUp(2, 1);
      t.ok(S().party[2].passiveRolls.length === 1, 'hero 2 has a pending roll');
      S().party[2].dead = true;
      t.eq(DD.Run.rollQueue().indexOf(2), -1, 'dead heroes are not in the roll queue');
      t.ok(DD.Run.pendingRolls().every(function (p) { return p.heroIdx !== 2; }), 'nor in pendingRolls');
      DD.Run.useUi = false;
    });
  });

  T.suite('passives: run — old saves migrate (retroactive rolls), saves round-trip passives', function (t) {
    return runSandbox(t, basicTable(), function () {
      DD.Run.newRun(PARTY, 'normal', 'migrate');
      S().party.forEach(function (h) { h.level = 3; });
      S().party[0].pendingLevels = 1;
      DD.Run.save();
      const raw = DD.Storage.get(DD.Run.SAVE_KEY, null);
      raw.party.forEach(function (h) { delete h.passives; delete h.passiveRolls; });
      delete raw.passiveRngState;
      DD.Storage.set(DD.Run.SAVE_KEY, raw);
      DD.Run.state = null;
      DD.Run.useUi = true;
      t.ok(DD.Run.load(), 'an old save (no passives) loads');
      t.ok(S().party.every(function (h) { return Array.isArray(h.passives) && Array.isArray(h.passiveRolls); }), 'fields added');
      t.ok(S().party.slice(1).every(function (h) { return h.passives.length >= 1 && h.passives.length <= 3 && !h.passiveRolls.length; }),
        'level-3 heroes got the start roll + one per level already chosen (resolved by the policy)');
      t.eq(S().party[0].passiveRolls.length, 1, 'a level still waiting for its choice gets a pending roll');
      t.ok(!S().party.some(function (h) { return h.__migratePassives; }), 'no migration flags left behind');
      const savedNow = DD.Storage.get(DD.Run.SAVE_KEY, null);
      t.ok(savedNow.party.every(function (h) { return Array.isArray(h.passives); }), 'the migrated run was saved');
      const snap = json(S().party.map(function (h) { return [h.passives, h.passiveRolls.length]; }));
      DD.Run.state = null;
      DD.Run.load();
      t.eq(json(S().party.map(function (h) { return [h.passives, h.passiveRolls.length]; })), snap, 'no second migration on the next load');
      // corrupted entries are sanitized on load
      const raw2 = DD.Storage.get(DD.Run.SAVE_KEY, null);
      raw2.party[1].passives = [{ id: 'test_rp_socks', level: 99 }, { id: 'test_rp_socks' }, 'junk', { id: 'test_rp_rock', level: 1 }, { id: 'test_rp_duck', level: 1 }, { id: 'test_rp_crown', level: 1 }, { id: 'test_rp_coffee', level: 1 }];
      raw2.party[1].passiveRolls = [null, { src: 'event', roll: { id: 'test_rp_duck', d100: 'x' } }];
      DD.Storage.set(DD.Run.SAVE_KEY, raw2);
      DD.Run.state = null;
      DD.Run.load();
      const h1 = S().party[1];
      t.ok(h1.passives.length === 4 && h1.passives[0].level === 3 && h1.passives.filter(function (p) { return p.id === 'test_rp_socks'; }).length === 1,
        'junk passives sanitized (max 4, levels clamped, no duplicates)');
      t.ok(h1.passiveRolls.length === 1 && h1.passiveRolls[0].roll.d100 === 50, 'junk rolls dropped / repaired');
      DD.Run.useUi = false;
    });
  });

  T.suite('passives: run — recruits, event API, shop re-roll, debug helpers', function (t) {
    return runSandbox(t, basicTable(), function (eng) {
      DD.Run.newRun(PARTY, 'normal', 'misc');
      S().party.forEach(function (h, i) { levelUp(i, 5); });
      const lvl = S().party[0].level;
      const rec = DD.Run.recruit('tp_e', 3);
      t.ok(rec && rec.level === lvl, 'recruit at the party\'s (lowest) level');
      t.ok(rec.passives.length >= 1 && rec.passives.length <= 4 && !rec.passiveRolls.length, 'the recruit arrives with policy-resolved Blessings (' + rec.passives.length + ')');
      t.ok(rec.passives.every(function (p, i, a) { return a.findIndex(function (q) { return q.id === p.id; }) === i && p.level <= DD.Passives.maxLevel(p.id); }), 'no duplicates, levels within max');
      t.eq(rec.hp, DD.Run.heroStats(rec).maxHp, 'recruits arrive at full HP (passive stats included)');

      // event API
      const api = DD.Run.eventApi();
      const n0 = S().party[1].passives.length + S().party[1].passives.reduce(function (a, p) { return a + p.level; }, 0);
      const out = api.rollPassive(1);
      t.ok(out && out.heroIdx === 1 && !out.queued && out.results.length === 1, 'UI off: api.rollPassive resolves at once');
      t.ok(S().party[1].passiveRolls.length === 0, 'nothing left pending');
      t.ok(api.hasPassive(S().party[1].passives[0].id, 1) && !api.hasPassive('test_rp_never'), 'api.hasPassive');
      DD.Run.useUi = true;
      const q = api.rollPassive(1);
      t.ok(q && q.queued && S().party[1].passiveRolls[0].src === 'event', 'UI on: the roll waits at the front of the queue');
      t.eq(DD.Run.nextLevelStep(1), 'roll', 'and is shown before anything else');
      t.ok(DD.Run.resolveRoll(1, 'auto').ok, 'resolved');
      t.ok(api.rollPassive(99) !== null, 'an invalid hero index picks a random living hero');
      DD.Run.autoResolveRolls(DD.Run.pendingRolls()[0].heroIdx);
      DD.Run.openEvent('tp_ev_roll', null, { noShow: true });
      const ev = DD.Run.resolveEvent('tp_ev_roll', 0);
      t.ok(ev && ev.rolls.length === 1 && ev.rolls[0].heroIdx === 0 && ev.rolls[0].src === 'event', 'resolveEvent hands over the pending event roll');
      DD.Run.resolveRoll(0, 'discard');
      DD.Run.useUi = false;
      t.ok(n0 >= 0, 'event API checked');

      // shop re-roll
      DD.Run.leaveNode();
      const node = S().map.nodes[S().map.start[0]];
      node.type = 'shop';
      t.ok(DD.Run.travel(node.id), 'travel to a shop');
      const inv = DD.Run.shop();
      const svc = inv.services.filter(function (s) { return s.id === 'reroll'; })[0];
      t.ok(svc && svc.price === 40 && inv.services.length === 3 && inv.services[2] === svc, 'the shop sells "Re-roll a Blessing" (40 gold, third service)');
      S().gold = 100;
      const hero = S().party[2];
      hero.passives = [{ id: 'test_rp_socks', level: 2 }, { id: 'test_rp_duck', level: 1 }];
      const r = DD.Run.buy('services', 2, { heroIdx: 2, passiveId: 'test_rp_socks' });
      t.ok(r.ok && S().gold === 60, 're-roll bought for 40 gold: ' + r.text);
      t.ok(ids(hero).indexOf('test_rp_socks') < 0, 'the tossed Blessing is gone');
      t.ok(hero.passives.length >= 1 && hero.passiveRolls.length === 0 && r.results.length === 1, 'UI off: the fresh roll was resolved by the policy');
      t.ok(r.results[0].roll.id !== 'test_rp_socks', 'the fresh roll is never the tossed one');
      t.eq(DD.Run.buy('services', 2, { heroIdx: 2 }).reason, 'sold', 'once per visit');
      DD.Run.leaveNode();
      // nothing else on the table for that hero: no gold taken
      return withTable([{ id: 'test_rp_solo', name: 'Solo', rarity: 'common', levels: [{}], desc: 'Alone.' }], function () {
        const shopNode = S().map.nodes[S().map.start[1]] || S().map.nodes[S().map.layout[1][0]];
        S().pending = { type: 'shop', data: DD.Rewards.shopInventory(1, DD.RNG(5), S()) };
        S().party.forEach(function (h) { h.passives = []; });
        const s2 = DD.Run.shop();
        t.ok(s2.services.some(function (s) { return s.id === 'reroll'; }), 'service listed while the table has entries');
        t.eq(DD.Run.shopService('reroll', {}).reason, 'noPassives', 'nobody has a Blessing → refused');
        S().party[0].passives = [{ id: 'test_rp_solo', level: 1 }];
        const g = S().gold;
        t.eq(DD.Run.shopService('reroll', { heroIdx: 0, slot: 0 }).reason, 'nothingToRoll', 'nothing else to roll → refused');
        t.ok(S().gold === g && ids(S().party[0]).length === 1, 'no gold taken, Blessing kept');
        t.ok(!!shopNode, 'shop checks done');
        return withTable([], function () {
          const s3 = DD.Rewards.shopInventory(1, DD.RNG(6), S());
          t.ok(!s3.services.some(function (s) { return s.id === 'reroll'; }), 'no passive table → no re-roll service');
          // debug helpers
          return withTable(basicTable(), function () {
            t.ok(DD.Run.addPassive(1, 'test_rp_crown', 3), 'addPassive');
            t.ok(S().party[1].passives.some(function (p) { return p.id === 'test_rp_crown' && p.level === 3; }), 'given at level III');
            t.ok(!DD.Run.addPassive(1, 'nope', 1), 'unknown ids refused');
            t.eq(DD.Run.removePassive(1, 'test_rp_crown').id, 'test_rp_crown', 'removePassive');
            const rolled = DD.Run.autoRollPassives(1);
            t.ok(rolled.length === S().party[1].level && S().party[1].passives.length >= 1 && S().party[1].passives.length <= 4, 'autoRollPassives: start + one per level, by the policy');
            DD.Run.useUi = true;
            const job = DD.Run.grantRoll(0, 'debug', {});
            t.ok(job && S().party[0].passiveRolls[0] === job && job.src === 'debug', 'grantRoll queues a debug roll at the front');
            DD.Run.useUi = false;
            t.ok(eng.starts.length === 0, 'no fights were needed');
          });
        });
      });
    });
  });

  T.suite('passives: run — runMods (gold income, level-up rotation weight, shop prices clamped at 50%, healing)', function (t) {
    return runSandbox(t, modsTable(), function (eng) {
      DD.Run.newRun(PARTY, 'normal', 'mods');
      S().party.forEach(function (h) { h.passives = []; });
      const P = DD.Passives;
      t.eq(json(DD.Run.passiveMods()), json({ gold: 0, xp: 0, price: 0, heal: 0 }), 'no Blessings → no mods');
      S().party[1].passives = [{ id: 'test_rp_gold', level: 1 }];
      t.eq(P.goldMult(S()), 1.5, 'party gold mult');
      S().gold = 0;
      t.eq(DD.Run.addGold(10), 15, '+50% gold income');
      t.eq(DD.Run.addGold(1) + DD.Run.addGold(1), 3, 'small gains keep their fraction (1.5 + 1.5 = 3)');
      t.eq(DD.Run.addGold(-5), -5, 'costs are not scaled');
      t.eq(DD.Run.addGold(10, { raw: true }), 10, 'opts.raw skips the bonus');
      S().party[1].dead = true;
      t.eq(P.goldMult(S()), 1, 'dead heroes\' Blessings do not count');
      S().party[1].dead = false;
      // runMods.xp (v2, no XP): extra weight in the level-up rotation among the lowest-level heroes
      S().party[2].passives = [{ id: 'test_rp_xp', level: 1 }];
      t.eq(P.xpMult(S().party[2]), 1.5, 'the "XP" Blessing: weight 1.5 in the rotation');
      t.eq(P.xpMult(S().party[3]), 1, 'others weigh 1');
      // (each level-up also rolls a Blessing, resolved at once headless: reset the slots before every draw)
      const reset = function (blessed) {
        S().party.forEach(function (h, i) {
          h.level = 1; h.pendingLevels = 0; h.levelChoices = null; h.passiveRolls = [];
          h.passives = i === blessed ? [{ id: 'test_rp_xp', level: 1 }] : [];
        });
      };
      const picks = [0, 0, 0, 0];
      const N = 900;
      for (let k = 0; k < N; k++) {
        reset(2);
        picks[DD.Run.levelUp().heroIdx]++;
      }
      t.ok(picks[2] > picks[0] && picks[2] > picks[1] && picks[2] > picks[3], 'the Blessed hero wins the d4 more often: ' + json(picks));
      t.ok(Math.abs(picks[2] / N - 1.5 / 4.5) < 0.06, 'about 1.5 / 4.5 of the rolls (' + Math.round(picks[2] / N * 100) + '%)');
      reset(2);
      S().party[0].level = 2; S().party[1].level = 2; S().party[3].level = 2;
      t.eq(DD.Run.levelUp().heroIdx, 2, 'the weight never jumps the rotation: the only level-1 hero levels');
      reset(1);
      S().party[1].level = 2;
      const ahead = DD.Run.levelUp();
      t.ok(ahead.heroIdx !== 1 && ahead.candidates.indexOf(1) < 0, 'a Blessed hero ahead of the pack waits like everyone else');
      reset(-1);
      // healing
      S().party[3].passives = [{ id: 'test_rp_heal', level: 1 }];
      S().party.forEach(function (h) { h.hp = 2; });
      t.eq(DD.Run.healHero(3, 4), 8, 'double out-of-combat healing');
      t.eq(DD.Run.healHero(0, 4), 4, 'others heal normally');
      // shop prices: -80% clamps at 50%, dynamic
      S().party[0].passives = [{ id: 'test_rp_haggle', level: 1 }];
      t.eq(P.priceMult(S()), 0.5, 'price mult clamped at 50%');
      S().pending = { type: 'shop', data: DD.Rewards.shopInventory(1, DD.RNG(3), S()) };
      const inv = DD.Run.shop();
      const heal = inv.services.filter(function (s) { return s.id === 'heal'; })[0];
      t.ok(heal.price === 15 && heal.basePrice === 30 && inv.priceMult === 0.5, 'shop prices halved, base price kept');
      t.ok(inv.items.every(function (e) { return e.price === Math.round(e.basePrice * 0.5); }), 'items too');
      S().party[0].passives = [];
      t.eq(DD.Run.shop().services[0].price, 30, 'prices follow the party (Blessing gone → full price)');
      S().party[0].passives = [{ id: 'test_rp_haggle', level: 1 }];
      S().gold = 100;
      S().party[0].hp = 1;
      const b = DD.Run.buy('services', 0);
      t.ok(b.ok && S().gold === 85, 'buying pays the discounted price');
      DD.Run.leaveNode();
      // finishCombat reports the gold really gained, and the one level-up
      S().party.forEach(function (h) { h.hp = 5; });
      const node = S().map.nodes[S().map.start[0]];
      node.type = 'combat';
      node.encounterId = 'tp_enc_a1_normal_1';
      const g0 = S().gold;
      DD.Run.travel(node.id);
      eng.end('victory');
      const d = DD.Run.rewards();
      t.ok(d && S().gold - g0 === d.gold, 'rewards data.gold = gold actually gained (' + d.gold + ')');
      t.ok(d.levelUps.length === 1 && !('xpByHero' in d) && !('xp' in d), 'one level-up, no XP fields');
    });
  });

  // ---- whole runs -------------------------------------------------------------------------------------------------------
  function simulate(eng, seed, log) {
    const r = DD.RNG('psim:' + seed);
    DD.Run.newRun(PARTY, DD.Run.DIFFICULTIES[seed % 3], 'psim' + seed);
    let steps = 0;
    const errors = [];
    while (S() && !S().over && steps++ < 140) {
      for (let g = 0; g < 80; g++) {
        const q = DD.Run.levelQueue();
        if (q.length) { const ch = DD.Run.levelUpChoices(q[0]); let res = DD.Run.applyLevelChoice(q[0], r.pick(ch)); if (!res.ok) res = DD.Run.applyLevelChoice(q[0], r.pick(ch), r.int(-1, 3)); continue; }
        const l = DD.Run.pendingLearns();
        if (l.length) { DD.Run.resolveLearn(l[0].index, r.int(-1, 3)); continue; }
        break;
      }
      const avail = DD.Run.availableNodes();
      if (!avail.length) { errors.push('stuck'); break; }
      DD.Run.travel(r.pick(avail).id);
      for (let k = 0; k < 10 && S() && !S().over && S().pending; k++) {
        const p = S().pending;
        if (p.type === 'combat') {
          eng.end('victory', function (units) { units.forEach(function (u) { if (r.next() < 0.1) { u.hp = 0; u.downed = true; } else u.hp = Math.max(1, Math.round(u.hp * 0.7)); }); if (units.every(function (u) { return u.downed; })) { units[0].downed = false; units[0].hp = 1; } });
        } else if (p.type === 'rewards') {
          const i = p.data.choices.findIndex(function (c) { return c.type !== 'skill'; });
          if (i >= 0) DD.Run.takeReward(i);
          DD.Run.next();
        } else if (p.type === 'event') {
          const ev = DD.Run.currentEvent();
          const open = ev ? ev.choices.filter(function (c) { return !c.disabled; }) : [];
          if (open.length) DD.Run.chooseEventOption(r.pick(open).index);
          DD.Run.next();
        } else if (p.type === 'shop') {
          S().gold += 40;
          DD.Run.buy('services', 2, {});
          DD.Run.next();
        } else if (p.type === 'tavern') {
          if (r.next() < 0.3 && DD.Run.recruitCandidates().length) DD.Run.tavernRecruit(DD.Run.recruitCandidates()[0], r.int(0, 3));
          else DD.Run.tavernRest();
          DD.Run.next();
        } else DD.Run.next();
      }
      S() && S().party.forEach(function (h, i) {
        if (h.passives.length > 4) errors.push('hero ' + i + ' has ' + h.passives.length + ' Blessings');
        if (h.passiveRolls.length) errors.push('hero ' + i + ' has pending rolls in a headless run');
        const pid = h.passives.map(function (p) { return p.id; });
        if (pid.some(function (id, k) { return pid.indexOf(id) !== k; })) errors.push('hero ' + i + ' has a duplicate Blessing');
        if (h.passives.some(function (p) { return p.level > DD.Passives.maxLevel(p.id); })) errors.push('hero ' + i + ' has a Blessing over max');
        if (!h.dead && (h.hp < 1 || h.hp > DD.Run.heroStats(h).maxHp)) errors.push('hero ' + i + ' hp out of range');
      });
    }
    if (log) log(seed, steps);
    return errors;
  }

  T.suite('passives: headless whole-run sims with passives on (no errors, slots fill, policy sane)', function (t) {
    return runSandbox(t, basicTable(), function (eng) {
      const P = DD.Passives;
      const realApply = P.apply;
      const bad = [];
      let calls = 0, replaces = 0, fullKeeps = 0;
      P.apply = function (rh, r, action, slot) {
        const full = (rh.passives || []).length >= P.MAX;
        const before = (rh.passives || []).map(function (p) { return Object.assign({}, p); });
        const res = realApply(rh, r, action, slot);
        calls++;
        if (res.ok && res.action === 'keep' && full) fullKeeps++;
        if (res.ok && res.action === 'replace') {
          replaces++;
          if (action === 'auto') {
            const newRank = P.rank(res.entry), oldRank = P.rank(res.replaced);
            if (DD.getPassive(res.entry.id).rarity === 'cursed') bad.push('policy took a cursed Blessing into a full hero');
            if (newRank <= oldRank) bad.push('policy replaced ' + res.replaced.id + ' with a not-better ' + res.entry.id);
            const minRank = Math.min.apply(null, before.map(function (p) { return P.rank(p); }));
            if (oldRank !== minRank) bad.push('policy did not replace the weakest Blessing');
          }
        }
        return res;
      };
      try {
        const n = t.n || 4;
        let filled = 0;
        for (let seed = 0; seed < n; seed++) {
          DD.Meta.reset(false);
          const errs = simulate(eng, seed);
          t.eq(errs.length, 0, 'seed ' + seed + ': no Blessing invariant broken' + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''));
          t.eq(S().over, 'victory', 'seed ' + seed + ': the run still reaches the final victory');
          const counts = S().party.map(function (h) { return h.passives.length; });
          if (counts.some(function (c) { return c === 4; })) filled++;
          t.log('seed ' + seed + ': levels ' + json(S().party.map(function (h) { return h.level; })) + ' Blessings ' + json(S().party.map(ids)));
        }
        t.ok(filled >= 1, 'heroes fill their 4 slots over a run (' + filled + '/' + n + ' runs)');
        t.ok(calls > n * 20, 'plenty of resolutions (' + calls + ')');
        t.eq(fullKeeps, 0, 'never more than 4');
        t.eq(bad.length, 0, 'the headless policy stays sane (' + replaces + ' replaces)' + (bad.length ? ' — ' + bad.slice(0, 3).join(' | ') : ''));
        t.ok(Object.keys(DD.Meta.data.seen.passives || {}).length > 0, 'rolled Blessings are marked seen in the codex');
      } finally {
        P.apply = realApply;
      }
    });
  });

  T.suite('passives: real engine — a run fight with rolled Blessings whose hooks fire', function (t) {
    if (!DD.Combat || !DD.AutoPlay || !DD.Encounter || !DD.getHero('test_knight') || !DD.getEncounter('test_a1_normal')) { t.skip('engine or tests/fixtures.js not loaded'); return; }
    const hits = { n: 0, combat: 0 };
    const table = basicTable().map(function (d) {
      return Object.assign({}, d, {
        hooks: {
          onCombatStart: function (unit, p) { hits.combat++; p.data.started = true; },
          modifyOutgoingDamage: function (dmg, p) { if (p && p.data && p.data.started) hits.n++; },
        },
      });
    });
    const savedUi = DD.Run.useUi;
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    return withTable(table, function () {
      DD.Run.useUi = false;
      try {
        DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'].filter(DD.getHero), 'normal', 'p-real');
        t.ok(S().party.every(function (h) { return h.passives.length === 1; }), 'fixture heroes start with a Blessing');
        S().party.forEach(function (h, i) { DD.Run.addPassive(i, 'test_rp_socks', 2); });
        let fights = 0;
        for (let g = 0; g < 12 && S() && !S().over && fights < 2; g++) {
          const avail = DD.Run.availableNodes();
          const node = avail[0];
          node.type = 'combat';
          node.encounterId = 'test_a1_normal'; // fixture enemies only: independent of content in progress
          DD.Run.travel(node.id);
          if (S().pending && S().pending.type === 'combat') {
            fights++;
            const cs = DD.Combat.state;
            const u = cs.units.filter(function (x) { return x.kind === 'hero'; })[0];
            t.ok(u.passives.length >= 1 && u.passives.every(function (p) { return p.def && p.L; }), 'hero units carry Blessing instances');
            t.eq(u.armor, DD.Run.heroStats(u.runHero).armor, 'Blessing stats reach the unit (armor)');
            t.tryRun('AutoPlay.runBattle', function () { DD.AutoPlay.runBattle(30); });
            if (DD.FX && DD.FX.flush) DD.FX.flush();
            if (DD.Run.inCombat()) DD.Run.finishCombat(cs.result || 'defeat', cs);
          }
          if (S() && !S().over && S().pending && S().pending.type === 'rewards') DD.Run.skipRewards();
          if (S() && !S().over) DD.Run.next();
        }
        t.ok(fights > 0, fights + ' real fights');
        t.ok(hits.combat > 0 && hits.n > 0, 'Blessing hooks fired in real fights (' + hits.combat + ' combat starts, ' + hits.n + ' damage mods)');
      } finally {
        DD.Run.useUi = savedUi;
        DD.Run.state = null;
        DD.Storage.remove(DD.Run.SAVE_KEY);
        DD.Meta.data = savedMeta;
        DD.Meta.save();
        if (DD.FX && DD.FX.reset) DD.FX.reset();
      }
    });
  });

  // ---- UI --------------------------------------------------------------------------------------------------------------
  function modalEl() { const m = DD.UI.topModal(); return m ? m.el : null; }
  function btn(re) { const m = modalEl(); return m ? Array.prototype.slice.call(m.querySelectorAll('.pr-actions .btn')).filter(function (b) { return re.test(b.textContent); })[0] || null : null; }
  function uiReady(t) {
    if (!DD.UI || !DD.UI.screens || !DD.UI.screens.levelup || typeof DD.UI.passiveRoll !== 'function') { t.fail('DD.UI / levelup screen / passiveRoll missing'); return false; }
    return true;
  }

  T.suite('passives: UI — level-up: THE ROLL MOMENT → keep / replace / discard → skill choice', function (t) {
    if (!uiReady(t)) return;
    return runSandbox(t, basicTable(), async function () {
      const UI = DD.UI;
      UI.init();
      DD.Run.newRun(PARTY, 'normal', 'ui-roll');
      levelUp(0, 3);
      const h = rh0();
      h.passives = [];
      t.eq(h.passiveRolls.length, 3, 'three level rolls pending');
      UI.show('levelup', { next: 'map' });
      t.eq(UI.current, 'levelup', 'level-up screen');
      let m = modalEl();
      t.ok(m && m.classList.contains('modal-roll'), 'the roll comes first (before the boon)');
      const roll = DD.Run.currentRoll(0);
      t.eq(m.querySelector('.pr-die-num').textContent, String(roll.d100), 'the die shows the rolled number');
      const info = UI.passiveInfo({ id: roll.id, level: roll.level });
      t.ok(m.querySelector('.pr-card .pr-name').textContent === info.name && m.querySelector('.pr-desc').textContent === info.desc, 'result card: name + exact desc');
      t.ok(m.querySelector('.pr-card').classList.contains('rarity-' + info.rarity), 'rarity-coloured card');
      t.ok(new RegExp('Rolled ' + roll.d100 + ' on the d100').test(m.querySelector('.pr-rollinfo').textContent), 'the rolled number and its table slice');
      t.ok(/Level 2/.test(m.querySelector('.pr-head-title').textContent), 'header names the level');
      t.eq(m.querySelectorAll('.pr-slots .bless-slot.empty').length, 4, 'the 4 empty slots are shown');
      t.ok(btn(/Keep/) && btn(/Discard/) && !btn(/Replace/), 'Keep + Discard (nothing to replace yet)');
      btn(/Keep/).click();
      t.eq(ids(rh0()).join(), roll.id, 'kept');
      m = modalEl();
      t.ok(m && m.classList.contains('modal-levelup') && m.querySelectorAll('.choice-option').length === 3, 'then the 3 boons for that level');
      m.querySelectorAll('.choice-option')[2].click();
      if (UI.topModal() && UI.topModal().el.querySelector('.rp-grid')) UI.topModal().el.querySelector('.btn.ghost').click();
      // second level: full slots → Replace is the primary action
      rh0().passives = [{ id: 'test_rp_socks', level: 1 }, { id: 'test_rp_rock', level: 1 }, { id: 'test_rp_coffee', level: 1 }, { id: 'test_rp_curse', level: 1 }];
      rh0().passiveRolls[0].roll = { id: 'test_rp_crown', level: 1, upgrade: false, d100: 99, rarity: 'legendary', from: 98, to: 100, pct: 2.9 };
      UI.closeAllModals('test');
      UI.show('levelup', { next: 'map' });
      m = modalEl();
      t.ok(m && m.classList.contains('modal-roll') && m.querySelector('.pr-die-num').textContent === '99', 'second roll (forced legendary 99)');
      t.ok(!btn(/Keep/) && btn(/Replace a Blessing/) && btn(/Replace a Blessing/).classList.contains('primary'), 'full: no Keep, Replace is the primary button');
      t.ok(/full/.test(m.querySelector('.pr-slots-n').textContent), 'slots say full');
      btn(/Replace/).click();
      t.ok(m.querySelector('.pr-slots.replacing') && m.querySelectorAll('.pr-slots .passive-card.clickable').length === 4, 'replace view: the 4 Blessings are clickable');
      t.ok(btn(/Back/), 'with a Back button');
      btn(/Back/).click();
      t.ok(!m.querySelector('.pr-slots.replacing') && btn(/Replace/), 'Back returns to the result');
      btn(/Replace/).click();
      m.querySelectorAll('.pr-slots .passive-card.clickable')[3].click();
      t.eq(ids(rh0()).join(), 'test_rp_socks,test_rp_rock,test_rp_coffee,test_rp_crown', 'slot 4 (the curse) replaced by the crown');
      m = modalEl();
      t.ok(m && m.classList.contains('modal-levelup'), 'then the boon');
      m.querySelectorAll('.choice-option')[2].click();
      if (UI.topModal() && UI.topModal().el.querySelector('.rp-grid')) UI.topModal().el.querySelector('.btn.ghost').click();
      // third level: an upgrade, discarded
      rh0().passiveRolls[0].roll = { id: 'test_rp_socks', level: 2, upgrade: true, d100: 50, rarity: 'common', from: 42, to: 71, pct: 29.4 };
      UI.closeAllModals('test');
      UI.show('levelup', { next: 'map' });
      m = modalEl();
      t.ok(m.querySelector('.pr-stamp') && /Upgrade/.test(m.querySelector('.pr-stamp').textContent), 'duplicates get the UPGRADE! stamp');
      t.ok(m.querySelector('.pr-was') && /Was \(I\)/.test(m.querySelector('.pr-was').textContent), 'and the previous level text');
      t.ok(btn(/Upgrade to II/) && !btn(/Replace/), 'Upgrade to II (no replace for an upgrade)');
      btn(/Discard/).click();
      t.eq(rh0().passives[0].level, 1, 'discarded: socks stay at I');
      m = modalEl();
      t.ok(m && m.classList.contains('modal-levelup'), 'the boon still follows');
      m.querySelectorAll('.choice-option')[2].click();
      if (UI.topModal() && UI.topModal().el.querySelector('.rp-grid')) UI.topModal().el.querySelector('.btn.ghost').click();
      await tick(10);
      t.eq(UI.current, 'map', 'back on the map when everything is chosen');
      t.ok(!DD.Run.hasPendingChoices(), 'nothing pending');
      // the tumble: click skips; Esc in the replace view goes back
      DD.Run.grantRoll(1, 'debug', {});
      let done = null;
      const mm = UI.passiveRoll(1, { animate: true, onDone: function (r) { done = r; } });
      t.ok(mm.el.querySelector('.pr-die.rolling') && !mm.el.querySelector('.pr-card') && /Skip/.test(mm.el.querySelector('.pr-actions').textContent), 'animated: the die tumbles, no result yet, Skip offered');
      mm.el.querySelector('.pr-stage').click();
      t.ok(mm.el.querySelector('.pr-die.landed') && mm.el.querySelector('.pr-card'), 'click lands it at once');
      t.eq(mm.el.querySelector('.pr-die-num').textContent, String(DD.Run.currentRoll(1).d100), 'on the stored number');
      const kb = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true });
      document.body.dispatchEvent(kb);
      t.ok(done && done.ok && !UI.topModal(), 'K keeps (hotkey) and closes');
      UI.show('title');
    }, { ui: true });
  });

  T.suite('passives: UI — party slots, HUD tooltip + inspect, shop re-roll, event roll, Hall of Fame', function (t) {
    if (!uiReady(t)) return;
    return runSandbox(t, basicTable(), async function () {
      const UI = DD.UI;
      UI.init();
      DD.Run.newRun(PARTY, 'normal', 'ui-misc');
      // party screen
      rh0().passives = [{ id: 'test_rp_crown', level: 2 }, { id: 'test_rp_curse', level: 1 }, { id: 'test_rp_socks', level: 3 }];
      UI.show('party', { back: 'map', hero: 0 });
      const root = UI.currentRoot();
      const cards = root.querySelectorAll('.party-bless .passive-card');
      t.eq(cards.length, 3, 'party screen: 3 Blessing cards');
      t.eq(root.querySelectorAll('.party-bless .bless-slot.empty').length, 1, 'and 1 dashed empty slot');
      t.ok(cards[0].classList.contains('rarity-legendary') && cards[1].classList.contains('rarity-cursed'), 'rarity colours');
      t.eq(cards[0].querySelectorAll('.pips .pip.on').length, 2, 'level pips (II of III)');
      t.ok(/Test Crown/.test(cards[0]._ddTip.content()) && /Crown level 2/.test(cards[0]._ddTip.content()) && /Level III/.test(cards[0]._ddTip.content()), 'tooltip: name, exact desc, next level');
      t.ok(root.querySelector('.sheet-passive'), 'the built-in passive is still shown');
      t.ok(/3 \/ 4/.test(root.querySelector('.party-col.gear').textContent), 'count 3 / 4');
      DD.Run.grantRoll(0, 'debug', {});
      UI.refresh();
      const rollBtn = Array.prototype.slice.call(UI.currentRoot().querySelectorAll('.bl-pending .btn')).filter(function (b) { return /Roll/.test(b.textContent); })[0];
      t.ok(rollBtn, 'a waiting roll offers a Roll! button');
      rollBtn.click();
      t.ok(UI.current === 'levelup' && modalEl() && modalEl().classList.contains('modal-roll'), 'Roll! opens the roll on the level-up screen');
      btn(/Keep|Upgrade|Replace/) && btn(/Discard/).click();
      await tick(10);
      t.eq(UI.current, 'party', 'then back to the party screen');
      // shop re-roll
      S().gold = 200;
      DD.Run.leaveNode();
      const node = S().map.nodes[S().map.start[0]];
      node.type = 'shop';
      DD.Run.travel(node.id);
      t.eq(UI.current, 'shop', 'shop screen');
      const rows = UI.currentRoot().querySelectorAll('.keeper-services .ks-row');
      t.eq(rows.length, 3, 'three services at the counter');
      t.ok(/Re-roll a Blessing/.test(rows[2].textContent), 'the re-roll service');
      t.ok(UI.currentRoot().querySelector('.keeper.svc-3'), 'keeper column in its compact layout');
      rows[2].querySelector('.btn.buy').click();
      let m = modalEl();
      const opts = m ? m.querySelectorAll('.choice-option') : [];
      t.ok(m && opts.length >= 3, 'picker lists the party\'s Blessings (' + opts.length + ')');
      const pick = Array.prototype.slice.call(opts).filter(function (o) { return /Test Curse/.test(o.textContent); })[0];
      t.ok(pick, 'the cursed one can be tossed');
      pick.click();
      m = modalEl();
      t.ok(m && m.classList.contains('modal-roll') && /Re-roll/.test(m.querySelector('.pr-head-title').textContent), 'paid, then THE ROLL MOMENT');
      t.ok(ids(rh0()).indexOf('test_rp_curse') < 0, 'the curse is gone');
      t.ok(DD.Run.currentRoll(0).id !== 'test_rp_curse', 'never the tossed one');
      btn(/Discard/).click();
      t.ok(!UI.topModal(), 'resolved');
      t.ok(UI.currentRoot().querySelectorAll('.keeper-services .ks-row')[2].classList.contains('sold'), 'service used for this visit');
      DD.Run.next();
      // event roll
      DD.Run.openEvent('tp_ev_roll', null);
      t.eq(UI.current, 'event', 'event screen');
      const before = rh0().passives.length;
      UI.currentRoot().querySelector('.ev-choice').click();
      m = modalEl();
      t.ok(m && m.classList.contains('modal-roll') && /rolls on the Table/.test(m.querySelector('.pr-head-title').textContent), 'the event roll opens THE ROLL MOMENT');
      const r = DD.Run.currentRoll(0);
      const keep = btn(/Keep|Upgrade/);
      if (keep) keep.click(); else { btn(/Replace/).click(); modalEl().querySelectorAll('.pr-slots .passive-card.clickable')[0].click(); }
      t.ok(!UI.topModal(), 'resolved');
      const chips = Array.prototype.slice.call(UI.currentRoot().querySelectorAll('.change-chip')).map(function (c) { return c.textContent; }).join(' | ');
      t.ok(new RegExp(UI.passiveInfo(r.id).name).test(chips), 'outcome chips show the Blessing: ' + chips);
      t.ok(rh0().passives.length >= before, 'Blessing applied');
      DD.Run.next();
      // Hall of Fame codex
      DD.Meta.markSeen('passives', 'test_rp_crown');
      UI.show('hall', { tab: 'blessings', back: 'title' });
      const bx = UI.currentRoot().querySelectorAll('.bx-card');
      t.eq(bx.length, 7, 'every Blessing has a codex card (weight 0 included)');
      const crown = Array.prototype.slice.call(bx).filter(function (c) { return /Test Crown/.test(c.textContent); })[0];
      t.ok(crown && !crown.classList.contains('unseen'), 'seen Blessings show their name');
      t.ok(UI.currentRoot().querySelectorAll('.bx-card.unseen').length >= 1, 'unseen ones are ???');
      UI.show('hall', { tab: 'records', back: 'title' });
      t.ok(/Blessings discovered/.test(UI.currentRoot().textContent), 'records show the discovery progress');
      UI.show('title');
    }, { ui: true });
  });

  T.suite('passives: UI — combat HUD party-card tooltip and inspect panel list the Blessings', function (t) {
    if (!DD.UI || !DD.UI.screens.combat || !DD.HUD || !DD.Combat || !DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('combat HUD or fixtures missing'); return; }
    return withTable(basicTable(), function () {
      const UI = DD.UI;
      UI.init();
      try {
        DD.Combat.sandbox({ w: 8, h: 8, seed: 3, theme: 'cellar',
          heroes: [{ id: 'test_knight', x: 1, y: 3, passives: ['test_rp_socks', { id: 'test_rp_crown', level: 2 }] }, { id: 'test_mage', x: 1, y: 5 }],
          enemies: [{ id: 'test_grunt', x: 6, y: 3 }] });
        UI.show('combat');
        const card = DD.HUD.root().querySelectorAll('.hud-card')[0];
        const html = card._ddTip.content();
        t.ok(/Blessings/.test(html) && /Test Socks/.test(html) && /Test Crown II/.test(html) && /Crown level 2/.test(html), 'party-card tooltip lists the Blessings with exact text');
        const html2 = DD.HUD.root().querySelectorAll('.hud-card')[1]._ddTip.content();
        t.ok(!/Blessings/.test(html2), 'no Blessings section for a hero without any');
        const k = DD.Combat.heroes()[0];
        DD.HUD.hover(k.x, k.y);
        const chips = DD.HUD.root().querySelectorAll('.hud-inspect .hi-bless .passive-chip');
        t.eq(chips.length, 2, 'inspect panel: one chip per Blessing');
        t.ok(/Test Crown/.test(chips[1]._ddTip.content()), 'chips carry the Blessing tooltip');
      } finally {
        UI.closeAllModals('test');
        UI.hideTooltip();
        UI.show('title');
      }
    });
  });

  // ---- edges (review) ------------------------------------------------------------------------------------------------
  function only(ids) { return basicTable().filter(function (d) { return ids.indexOf(d.id) >= 0; }); }
  function keydown(k) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }

  T.suite('passives: edges — a def removed after a save, empty table, maxed slots, a death with pending rolls', function (t) {
    return runSandbox(t, basicTable(), function (eng) {
      const P = DD.Passives;
      const p0 = DD.problems.length;
      DD.Run.useUi = true;
      // a Blessing def removed after a save: the owned entry stays as "Unknown" (ranked below cursed), a stored roll
      // of a removed def is rolled again
      DD.Run.newRun(PARTY, 'normal', 'edge-removed');
      rh0().passives = [{ id: 'test_rp_rock', level: 1 }];
      levelUp(0, 1);
      rh0().passiveRolls[0].roll = { id: 'test_rp_duck', level: 1, upgrade: false, d100: 93, rarity: 'rare', from: 89, to: 98, pct: 8.8 };
      DD.Run.save();
      delete DD.defs.passives.test_rp_rock;
      delete DD.defs.passives.test_rp_duck;
      DD.Run.state = null;
      t.ok(DD.Run.load(), 'the save loads without the two defs');
      t.eq(json(rh0().passives), json([{ id: 'test_rp_rock', level: 1 }]), 'the unknown Blessing keeps its slot');
      t.ok(DD.Run.heroStats(0).maxHp > 0 && P.describe('test_rp_rock').known === false, 'stats and describe cope');
      const r = DD.Run.currentRoll(0);
      t.ok(r && r.id !== 'test_rp_duck' && DD.getPassive(r.id), 'the stored roll of a removed def is rolled again (' + (r && r.id) + ')');
      t.eq(P.rank('test_rp_rock'), -1, 'an unknown Blessing ranks below cursed');
      const full = { id: 'tp_a', passives: [{ id: 'test_rp_socks', level: 1 }, { id: 'test_rp_rock', level: 2 }, { id: 'test_rp_coffee', level: 1 }, { id: 'test_rp_crown', level: 1 }] };
      t.eq(P.weakestSlot(full), 1, 'it is the weakest slot');
      t.eq(json(P.policy(full, fresh('test_rp_curse'))), json({ action: 'discard' }), 'policy: still never a cursed one when full');
      registerTable(only(['test_rp_duck']));
      t.eq(json(P.policy(full, fresh('test_rp_duck'))), json({ action: 'replace', slot: 1 }), 'policy: the unknown one is replaced first');
      registerTable(only(['test_rp_rock']));
      DD.Run.resolveRoll(0, 'discard');
      // an empty table: no Session Zero roll, no level rolls, no event roll, no re-roll service, no errors
      return withTable([], function () {
        DD.Run.newRun(PARTY, 'normal', 'edge-empty');
        t.ok(S().party.every(function (h) { return !h.passives.length && !h.passiveRolls.length; }), 'empty table: nobody rolls at run start');
        levelUp(0, 2);
        t.ok(rh0().passiveRolls.length === 0 && DD.Run.nextLevelStep(0) === 'choice', 'level-ups go straight to the boon');
        t.eq(DD.Run.eventApi().rollPassive(0), null, 'api.rollPassive → null');
        t.ok(!DD.Rewards.shopInventory(1, DD.RNG(2), S()).services.some(function (s) { return s.id === 'reroll'; }), 'no re-roll service');
      }).then(function () {
        // every entry owned at max level: no roll is queued; a stored roll that can no longer apply fizzles
        return withTable(only(['test_rp_socks', 'test_rp_coffee', 'test_rp_curse', 'test_rp_rock']), function () {
          DD.Run.newRun(PARTY, 'normal', 'edge-maxed');
          const h = rh0();
          h.passives = [{ id: 'test_rp_socks', level: 3 }, { id: 'test_rp_coffee', level: 1 }, { id: 'test_rp_curse', level: 1 }, { id: 'test_rp_rock', level: 1 }];
          levelUp(0, 1);
          t.eq(h.passiveRolls.length, 1, 'rock II is still rollable');
          h.passives[3].level = 2;
          t.eq(DD.Run.currentRoll(0), null, 'its roll fizzles once rock is maxed and nothing else is left');
          t.eq(h.passiveRolls.length, 0, 'the job is dropped');
          t.ok(DD.Run.applyLevelChoice(0, 2, -1).ok, 'the boon still works');
          levelUp(0, 1);
          t.ok(h.passiveRolls.length === 0 && DD.Run.nextLevelStep(0) === 'choice', 'all 4 maxed + nothing else: no roll, straight to the boon');
          // a later level gained while the table was empty has no roll: the earlier level still goes roll → boon
          DD.Run.newRun(PARTY, 'normal', 'edge-gap');
          const g = rh0();
          g.passives = [{ id: 'test_rp_socks', level: 3 }, { id: 'test_rp_coffee', level: 1 }, { id: 'test_rp_curse', level: 1 }, { id: 'test_rp_rock', level: 1 }];
          levelUp(0, 1);
          g.passives[3].level = 2;
          levelUp(0, 1);
          t.eq(json(g.passiveRolls.map(function (j) { return j.lv; })) + ' / ' + g.pendingLevels, '[2] / 2', 'one roll (level 2) for two pending levels');
          g.passives[3].level = 1;
          t.eq(DD.Run.nextLevelStep(0), 'roll', 'level 2: its roll first');
          t.ok(DD.Run.resolveRoll(0, 'discard').ok, 'resolve it');
          t.eq(DD.Run.nextLevelStep(0), 'choice', 'then the level 2 boon');
          t.ok(DD.Run.applyLevelChoice(0, 2, -1).ok, 'level 2 boon');
          t.eq(DD.Run.nextLevelStep(0), 'choice', 'level 3 had no roll: straight to its boon');
          t.ok(DD.Run.applyLevelChoice(0, 2, -1).ok, 'level 3 boon');
          t.eq(DD.Run.nextLevelStep(0), null, 'done');
        });
      }).then(function () {
        // all 4 slots maxed: rolls only offer replace / discard
        DD.Run.newRun(PARTY, 'normal', 'edge-maxed2');
        const h = rh0();
        h.passives = [{ id: 'test_rp_socks', level: 3 }, { id: 'test_rp_coffee', level: 1 }, { id: 'test_rp_curse', level: 1 }, { id: 'test_rp_rock', level: 2 }];
        levelUp(0, 1);
        const r2 = DD.Run.currentRoll(0);
        t.ok(r2 && ['test_rp_duck', 'test_rp_crown'].indexOf(r2.id) >= 0 && !r2.upgrade, 'a maxed Blessing is never rolled (' + r2.id + ')');
        const o = P.options(h, r2);
        t.ok(!o.keep && o.replace && o.discard && o.full, 'full + maxed: replace or discard');
        DD.Run.resolveRoll(0, 'discard');
        // a hero dies (third down) with pending rolls: they are dropped
        levelUp(1, 2);
        DD.Run.currentRoll(1);
        S().party[1].downs = 2;
        const node = S().map.nodes[S().map.start[0]];
        node.type = 'combat';
        node.encounterId = 'tp_enc_a1_normal_1';
        DD.Run.useUi = false; // no screens from the fight; the pending rolls above were queued with the UI on
        DD.Run.travel(node.id);
        eng.end('victory', function (units) { units[1].hp = 0; units[1].downed = true; });
        t.ok(S().party[1].dead, 'hero 1 is written out of the campaign');
        t.eq(S().party[1].passiveRolls.length, 0, 'their pending rolls are dropped');
        t.ok(DD.Run.pendingRolls().every(function (p) { return p.heroIdx !== 1; }) && DD.Run.rollQueue().indexOf(1) < 0, 'and never shown');
        DD.Run.state = null;
        DD.Run.load();
        t.ok(S().party[1].dead && S().party[1].passiveRolls.length === 0, 'still none after a reload');
        t.eq(DD.problems.length, p0, 'no warnings: ' + DD.problems.slice(p0).join(' | '));
        DD.Run.useUi = false;
      });
    });
  });

  T.suite('passives: UI — queued level-ups (roll and boon name the same level), keyboard, recruits, empty table', function (t) {
    if (!uiReady(t)) return;
    return runSandbox(t, basicTable(), async function () {
      const UI = DD.UI;
      UI.init();
      DD.Run.newRun(PARTY, 'normal', 'ui-edges');
      levelUp(0, 2);
      levelUp(2, 1);
      UI.show('levelup', { next: 'map' });
      const seq = [];
      for (let g = 0; g < 20; g++) {
        const m = modalEl();
        if (!m) break;
        if (m.classList.contains('modal-roll')) {
          seq.push('roll ' + m.querySelector('.pr-head-title').textContent);
          (btn(/Keep|Upgrade/) || btn(/Discard/)).click();
        } else if (m.classList.contains('modal-levelup')) {
          seq.push('boon ' + m.querySelector('.lu-head-title').textContent);
          const opts = Array.prototype.slice.call(m.querySelectorAll('.choice-option'));
          (opts.filter(function (o) { return /Built Different|Unearned Confidence/.test(o.textContent); })[0] || opts[2]).click();
        } else break;
      }
      t.log(seq.join(' | '));
      t.eq(seq.length, 6, '3 levels → 3 rolls and 3 boons');
      t.ok(seq.every(function (s, i) { return /^roll/.test(s) === (i % 2 === 0); }), 'each level: the roll, then the boon');
      t.ok(seq.every(function (s, i) { return i % 2 === 0 || s.replace(/^boon /, '') === seq[i - 1].replace(/^roll /, ''); }),
        'the boon names the same level as its roll (the oldest pending level, not the current one)');
      t.ok(/Level 2/.test(seq[1]) && /Level 3/.test(seq[3]), 'levels 2 then 3 for the hero who gained two');
      await tick(10);
      t.eq(UI.current, 'map', 'then the map');
      // keyboard: R → replace view, Esc → back, Enter → the primary (Replace a Blessing…), 2 → replaces slot 2, D discards
      rh0().passives = [{ id: 'test_rp_socks', level: 1 }, { id: 'test_rp_rock', level: 1 }, { id: 'test_rp_coffee', level: 1 }, { id: 'test_rp_duck', level: 1 }];
      levelUp(0, 2);
      rh0().passiveRolls[0].roll = { id: 'test_rp_crown', level: 1, upgrade: false, d100: 99, rarity: 'legendary', from: 98, to: 100, pct: 2.9 };
      UI.show('levelup', { next: 'map' });
      let m = modalEl();
      t.ok(m && m.classList.contains('modal-roll'), 'roll modal');
      keydown('k');
      t.ok(modalEl() === m && !m.querySelector('.pr-slots.replacing'), 'K does nothing when the slots are full');
      keydown('r');
      t.ok(m.querySelector('.pr-slots.replacing'), 'R opens the replace view');
      keydown('Escape');
      t.ok(!m.querySelector('.pr-slots.replacing'), 'Esc goes back');
      keydown('Enter');
      t.ok(m.querySelector('.pr-slots.replacing'), 'Enter picks the primary action (Replace a Blessing…)');
      keydown('2');
      t.eq(ids(rh0()).join(), 'test_rp_socks,test_rp_crown,test_rp_coffee,test_rp_duck', '2 replaces slot 2');
      m = modalEl();
      t.ok(m && m.classList.contains('modal-levelup'), 'then the boon');
      m.querySelectorAll('.choice-option')[2].click();
      m = modalEl();
      t.ok(m && m.classList.contains('modal-roll'), 'second level: its roll');
      keydown('d');
      t.ok(modalEl() && modalEl().classList.contains('modal-levelup') && ids(rh0()).length === 4, 'D discards, then the boon');
      modalEl().querySelectorAll('.choice-option')[2].click();
      await tick(10);
      t.eq(UI.current, 'map', 'map again');
      // recruits say which Blessings they brought; the re-roll picker text keeps clear of the cards
      S().pending = { type: 'tavern', data: { nodeId: null, used: null, recruits: DD.Run.recruitCandidates() } };
      const rec = DD.Run.tavernRecruit('tp_e', 3);
      t.ok(rec.ok && /Blessings in tow: /.test(rec.text), 'the recruit result names its Blessings: ' + rec.text);
      DD.Run.leaveNode();
      S().pending = { type: 'shop', data: DD.Rewards.shopInventory(1, DD.RNG(5), S()) };
      S().gold = 500;
      UI.show('shop');
      const row = Array.prototype.slice.call(UI.currentRoot().querySelectorAll('.keeper-services .ks-row')).filter(function (x) { return /Re-roll/.test(x.textContent); })[0];
      row.querySelector('.btn.buy').click();
      t.ok(modalEl() && modalEl().querySelector('.modal-reroll .choice-text, .choice-text'), 're-roll picker: its text is a .choice-text (spaced from the cards)');
      UI.closeAllModals('test');
      DD.Run.leaveNode();
      // no table loaded: the level-up goes straight to the boon, no Blessings on the party screen, an empty codex
      await withTable([], async function () {
        S().party.forEach(function (h) { h.passives = []; h.passiveRolls = []; });
        levelUp(1, 1);
        UI.show('levelup', { next: 'map' });
        t.ok(modalEl() && modalEl().classList.contains('modal-levelup'), 'empty table: the boon comes first');
        UI.closeAllModals('test');
        UI.show('party', { back: 'map', hero: 1 });
        t.ok(!/Blessings/.test(UI.currentRoot().querySelector('.party-col.gear').textContent), 'party: no Blessings section');
        UI.show('hall', { tab: 'blessings', back: 'title' });
        t.ok(/blank/.test(UI.currentRoot().textContent), 'Hall: the empty table state');
      });
      UI.show('title');
    }, { ui: true });
  });

  // ---- integration (table × system) ------------------------------------------------------------------------------------
  T.suite('passives: integration — role instances marked "this fight only", long names break with a hyphen', function (t) {
    if (!DD.UI || !DD.UI.screens.combat || !DD.HUD || !DD.Combat || !DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('combat HUD or fixtures missing'); return; }
    const long = { id: 'test_rp_long', name: 'Overcaffeinated Gravitational Ego', icon: '🧪', rarity: 'rare', levels: [{}], desc: 'Long words.' };
    return withTable(basicTable().concat([long]), function () {
      const UI = DD.UI;
      UI.init();
      try {
        // a fight-only extra instance (Method Actor's role) next to the hero's own Blessings
        DD.Combat.sandbox({ w: 8, h: 8, seed: 3, theme: 'cellar',
          heroes: [{ id: 'test_knight', x: 1, y: 3, passives: ['test_rp_socks'] }, { id: 'test_mage', x: 1, y: 5 }],
          enemies: [{ id: 'test_grunt', x: 6, y: 3 }] });
        const k = DD.Combat.heroes()[0];
        const role = DD.passiveInstance({ id: 'test_rp_rock', level: 1 });
        role.role = true;
        k.passives.push(role);
        UI.show('combat');
        const html = DD.HUD.root().querySelectorAll('.hud-card')[0]._ddTip.content();
        const rows = html.split('tt-bless-row').slice(1);
        t.eq(rows.length, 2, 'party-card tooltip: the own Blessing and the role');
        t.ok(!/this fight only/.test(rows[0]) && /Test Socks/.test(rows[0]), 'own Blessing: no role tag');
        t.ok(/this fight only/.test(rows[1]) && /Test Rock/.test(rows[1]), 'the role row is tagged "this fight only"');
        DD.HUD.hover(k.x, k.y);
        const chips = DD.HUD.root().querySelectorAll('.hud-inspect .hi-bless .passive-chip');
        t.eq(chips.length, 2, 'inspect panel: a chip each');
        t.ok(!chips[0].classList.contains('role') && chips[1].classList.contains('role') && chips[1].querySelector('.pch-role'), 'only the role chip is marked');
        t.ok(/this fight only/.test(chips[1]._ddTip.content()) && !/this fight only/.test(chips[0]._ddTip.content()), 'the role chip tooltip says so');
        // long single words get a soft hyphen in slot cards (the tooltip keeps the plain name)
        const card = UI.passiveCard({ id: 'test_rp_long', level: 1 }, { compact: true });
        const nm = card.querySelector('.pc-name').textContent;
        t.ok(nm.indexOf('­') > 0 && nm.replace(/­/g, '') === long.name, 'soft hyphens only, the name is intact: ' + nm.replace(/­/g, '-'));
        t.eq(nm.split('­').length, 3, 'one per 12+ letter word (Overcaffeinated, Gravitational)');
        t.ok(/Overcaf­feinated/.test(nm), 'breaks near the middle of the word, before a consonant-vowel pair');
        t.eq(UI.passiveCard({ id: 'test_rp_socks', level: 1 }, { compact: true }).querySelector('.pc-name').textContent, 'Test Socks', 'short names untouched');
        t.ok(UI.passiveTooltipHtml({ id: 'test_rp_long', level: 1 }).indexOf('­') < 0, 'tooltips keep the plain name');
      } finally {
        UI.closeAllModals('test');
        UI.hideTooltip();
        UI.show('title');
      }
    });
  });

  T.suite('passives: integration — whole AutoPlay runs with the real table (every roll and resolution audited)', function (t) {
    const P = DD.Passives;
    const heroes = Object.keys(DD.defs.heroes).filter(function (k) { return k.indexOf('test_') !== 0; });
    const real = P.defs().filter(function (d) { return d.id.indexOf('rp_') === 0; });
    if (heroes.length < 4 || real.length < 10 || !DD.AutoPlay || !DD.Encounter || !DD.Combat) { t.skip('needs the real table, 4 real heroes and the engine'); return; }
    const savedUi = DD.Run.useUi;
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    const realRoll = P.roll, realApply = P.apply;
    const bad = [], stats = { rolls: 0, keep: 0, upgrade: 0, replace: 0, discard: 0, fights: 0, won: 0, instances: 0 };
    const p0 = DD.problems.length;
    P.roll = function (rh, rng, opts) {
      const r = realRoll.call(P, rh, rng, opts);
      if (r) {
        stats.rolls++;
        if (r.d100 < r.from || r.d100 > r.to) bad.push('d100 ' + r.d100 + ' outside its slice ' + r.from + '-' + r.to);
        if (opts && opts.noCursed && r.rarity === 'cursed') bad.push('a never-cursed roll gave ' + r.id);
        const d = DD.getPassive(r.id);
        if (d.requires && !d.requires(rh, DD.getHero(rh.id))) bad.push(rh.id + ' rolled hero-only ' + r.id);
      }
      return r;
    };
    P.apply = function (rh, r, action, slot) {
      const full = (rh.passives || []).length >= P.MAX;
      const before = (rh.passives || []).map(function (p) { return P.rank(p); });
      const res = realApply.call(P, rh, r, action, slot);
      if (res.ok) {
        stats[res.action]++;
        if (action === 'auto' && res.action === 'keep' && full) bad.push('kept a 5th Blessing');
        if (action === 'auto' && res.action === 'replace') {
          if (r.rarity === 'cursed') bad.push('the policy took a cursed Blessing into a full hero');
          if (P.rank(res.entry) <= P.rank(res.replaced)) bad.push('the policy replaced ' + res.replaced.id + ' with a not-better ' + res.entry.id);
          if (P.rank(res.replaced) !== Math.min.apply(null, before)) bad.push('the policy did not replace the weakest Blessing');
        }
      }
      return res;
    };
    function audit() {
      DD.Run.state.party.forEach(function (h) {
        const idl = (h.passives || []).map(function (p) { return p.id; });
        if (idl.length > P.MAX) bad.push(h.id + ' has ' + idl.length + ' Blessings');
        if (idl.some(function (id, k) { return idl.indexOf(id) !== k; })) bad.push(h.id + ' has a duplicate Blessing');
        if ((h.passives || []).some(function (p) { return !DD.getPassive(p.id) || p.level < 1 || p.level > P.maxLevel(p.id); })) bad.push(h.id + ': unknown Blessing or level out of range');
        if (!h.dead && (h.passiveRolls || []).length) bad.push(h.id + ' has pending rolls in a headless run');
      });
    }
    DD.Run.useUi = false;
    const runs = +(t.n || 2);
    const outcomes = [];
    try {
      for (let s = 1; s <= runs; s++) {
        const r = DD.RNG('pint-suite:' + s);
        DD.Meta.reset(false);
        DD.Meta.data.settings.unlockAll = true;
        DD.Run.newRun(r.sample(heroes, 4), 'normal', 'pint-suite-' + s);
        for (let steps = 0; DD.Run.state && !DD.Run.state.over && steps < 120; steps++) {
          for (let g = 0; g < 60; g++) {
            const q = DD.Run.levelQueue();
            if (q.length) { if (!DD.Run.applyLevelChoice(q[0], r.int(0, 2), r.int(-1, 3)).ok && !DD.Run.applyLevelChoice(q[0], 0, -1).ok) DD.Run.state.party[q[0]].pendingLevels = 0; continue; }
            const l = DD.Run.pendingLearns();
            if (l.length) { DD.Run.resolveLearn(l[0].index, -1); continue; }
            break;
          }
          const avail = DD.Run.availableNodes();
          if (!avail.length) break;
          DD.Run.travel(r.pick(avail).id);
          for (let k = 0; k < 12 && DD.Run.state && !DD.Run.state.over && DD.Run.state.pending; k++) {
            const p = DD.Run.state.pending;
            if (p.type === 'combat') {
              const cs = DD.Combat.state;
              stats.fights++;
              cs.units.forEach(function (u) { if (u.kind === 'hero') stats.instances += (u.passives || []).length; });
              t.tryRun('AutoPlay.runBattle', function () { DD.AutoPlay.runBattle(40); });
              if (DD.FX && DD.FX.flush) DD.FX.flush();
              if (DD.Run.inCombat()) DD.Run.finishCombat(cs.result || 'victory', cs);
              const pd = DD.Run.state && DD.Run.state.pending;
              if (pd && pd.type === 'rewards' && pd.data.kind !== 'failed') stats.won++;
            } else if (p.type === 'rewards') { DD.Run.skipRewards(); DD.Run.next(); } else if (p.type === 'event') {
              const ev = DD.Run.currentEvent();
              const open = ev ? ev.choices.filter(function (c) { return !c.disabled; }) : [];
              if (open.length && !p.data.resolved) DD.Run.chooseEventOption(r.pick(open).index);
              DD.Run.next();
            } else if (p.type === 'shop') {
              const inv = DD.Run.shop();
              const ri = inv ? inv.services.findIndex(function (x) { return x.id === 'reroll'; }) : -1;
              if (ri >= 0) { DD.Run.state.gold += 40; DD.Run.buy('services', ri, {}); }
              DD.Run.next();
            } else if (p.type === 'tavern') {
              const c = DD.Run.recruitCandidates();
              if (c.length && r.next() < 0.3) DD.Run.tavernRecruit(r.pick(c), r.int(0, 3)); else DD.Run.tavernRest();
              DD.Run.next();
            } else DD.Run.next();
            if (DD.Run.state) audit();
          }
        }
        outcomes.push(DD.Run.state ? (DD.Run.state.over || 'act ' + DD.Run.state.act) : 'gone');
        t.log('run ' + s + ': ' + outcomes[outcomes.length - 1] + ' · ' + DD.Run.state.party.map(function (h) {
          return h.id + ' L' + h.level + ' [' + h.passives.map(function (p) { return p.id.replace('rp_', '') + ':' + p.level; }).join(',') + ']';
        }).join(' '));
      }
    } finally {
      P.roll = realRoll;
      P.apply = realApply;
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
    // warnings about the table fail; other areas' content warnings are logged (their own suites own them)
    const warns = DD.problems.slice(p0);
    const mine = warns.filter(function (w) { return /rp_|passive|Blessing/i.test(w); });
    const other = warns.filter(function (w) { return mine.indexOf(w) < 0; });
    DD.problems.length = p0;
    if (other.length) t.log('other areas\' warnings (' + other.length + '): ' + other.slice(0, 3).map(function (w) { return String(w).slice(0, 160); }).join(' | '));
    t.log('stats ' + json(stats) + ' · outcomes ' + json(outcomes));
    t.eq(bad.length, 0, 'every roll, resolution and slot list stayed legal' + (bad.length ? ': ' + bad.slice(0, 4).join(' | ') : ''));
    t.eq(mine.length, 0, 'no warning mentions a Blessing' + (mine.length ? ': ' + mine.slice(0, 3).join(' | ') : ''));
    t.ok(outcomes.every(function (o) { return o === 'victory' || o === 'defeat'; }), 'every run reaches its end: ' + outcomes.join(', '));
    // v2: one level-up per won fight, so a run that falls early may never fill the 4 slots (no replace / discard yet):
    // the floor is the Session Zero roll of every hero (4 per run) plus the roll of every won fight's level-up
    t.ok(stats.rolls >= runs * 4 + stats.won && stats.keep >= runs * 4, 'rolls happen and get resolved (Session Zero + one per won fight): ' + json(stats));
    t.ok(stats.fights > 0 && stats.instances > stats.fights, 'hero units carry Blessing instances in the fights');
  });
})();
