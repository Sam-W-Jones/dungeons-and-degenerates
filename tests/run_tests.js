/* Dungeons and Degenerates — tests/run_tests.js
 * META-RUN suites ("run: ..."): meta progression, act maps, run lifecycle, rewards, level-ups, shop, tavern,
 * events, save/load and whole headless runs.
 * Pure-logic suites run inside a sandbox: the content registries are swapped for small test-only content (rt_ ids)
 * and DD.Combat / DD.Encounter for a scripted fake engine, then everything is restored — so they never depend on
 * other areas' content. Integration suites use the real registries / DD.Combat / DD.AutoPlay and skip when absent.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  // 'passives' too: the random passive table rolls at run start / level-ups (tests/passive_tests.js covers it).
  // 'enemies' [integration fix]: "run: boss unlocks" registers a stub 'grimble'; without the swap it replaced the real
  // boss for every later suite (registry warning 'duplicate id "grimble"', a skill-less Grimble in boss tests).
  const SWAP = ['heroes', 'skills', 'items', 'consumables', 'encounters', 'events', 'statuses', 'passives', 'enemies'];
  const PARTY = ['rt_a', 'rt_b', 'rt_c', 'rt_d'];

  // ---- sandbox content ----------------------------------------------------------------------------------------
  function skill(id, owner, levels, extra) {
    return Object.assign({
      id: id, name: 'Test ' + id, owner: owner, icon: '✦', kind: 'attack', ap: 1,
      target: { type: 'unit', range: [1, 1], filter: 'enemy' },
      levels: levels || [{ dmg: 5 }, { dmg: 6 }, { dmg: 8 }],
      desc: function (L) { return 'Deal ' + (L.dmg || 0) + ' damage.'; },
      execute: function () { /* never executed by run tests */ },
    }, extra || {});
  }

  function registerContent() {
    const heroes = [
      { id: 'rt_a', unlock: null, hp: 24 }, { id: 'rt_b', unlock: null, hp: 26 }, { id: 'rt_c', unlock: null, hp: 28 },
      { id: 'rt_d', unlock: null, hp: 30 }, { id: 'rt_e', unlock: null, hp: 22 }, { id: 'rt_f', unlock: { act: 1 }, hp: 25 },
      { id: 'rt_g', unlock: { act: 2 }, hp: 27 }, { id: 'rt_h', unlock: { act: 3 }, hp: 21, consumableSlots: 1 },
    ];
    heroes.forEach(function (h) {
      const pool = [1, 2, 3, 4, 5, 6].map(function (n) { return h.id + '_s' + n; });
      pool.forEach(function (id, i) { DD.registerSkill(skill(id, h.id, i === 5 ? [{ dmg: 9 }] : null)); });
      DD.registerSkill(skill(h.id + '_basic', h.id));
      DD.registerSkill(skill(h.id + '_sig', h.id, [{ dmg: 20 }], { hype: 100 }));
      DD.registerHero({
        id: h.id, name: 'Hero ' + h.id.slice(3).toUpperCase(), unlock: h.unlock, consumableSlots: h.consumableSlots,
        stats: { hp: h.hp, ap: 3, mov: 4, armor: 0 }, growth: { hp: 4 },
        sprite: { base: 'humanoid' }, basic: h.id + '_basic', signature: h.id + '_sig',
        passive: { name: 'Test Passive', desc: 'Does nothing.', hooks: {} },
        startingSkills: [pool[0], pool[1]], skillPool: pool, barks: {},
      });
    });
    ['rt_gen1', 'rt_gen2', 'rt_gen3'].forEach(function (id) { DD.registerSkill(skill(id, 'generic')); });

    const items = [
      ['rt_w_common', 'weapon', 'common', { dmg: 0.1 }], ['rt_a_common', 'armor', 'common', { hp: 5, armor: 1 }],
      ['rt_t_common', 'trinket', 'common', { range: 1 }], ['rt_w_common2', 'weapon', 'common', { dmg: 0.05 }],
      ['rt_w_rare', 'weapon', 'rare', { dmg: 0.2 }], ['rt_a_rare', 'armor', 'rare', { hp: 10 }],
      ['rt_t_rare', 'trinket', 'rare', { mov: 1 }], ['rt_w_leg', 'weapon', 'legendary', { dmg: 0.35 }],
      ['rt_a_leg', 'armor', 'legendary', { hp: 15, block: 3 }], ['rt_t_leg', 'trinket', 'legendary', { ap: 1 }],
      ['rt_t_cursed', 'trinket', 'cursed', { dmg: 0.3, hp: -6 }], ['rt_w_cursed', 'weapon', 'cursed', { dmg: 0.5, mov: -1 }],
    ];
    items.forEach(function (x) {
      DD.registerItem({ id: x[0], name: 'Item ' + x[0], slot: x[1], rarity: x[2], icon: '🗡️', stats: x[3], desc: 'Test item.', flavor: 'Joke.' });
    });
    DD.registerItem({ id: 'rt_a_only', name: 'Hero A Trinket', slot: 'trinket', rarity: 'rare', hero: 'rt_a', icon: '💍', stats: { hype: 10 }, desc: 'Only for A.' });
    DD.registerItem({ id: 'rt_priced', name: 'Overpriced Hat', slot: 'armor', rarity: 'common', icon: '🎩', stats: { armor: 1 }, desc: 'A hat.', price: 55 });

    [['rt_pot_red', 'common'], ['rt_pot_big', 'rare'], ['rt_pot_odd', 'common']].forEach(function (c) {
      DD.registerConsumable({ id: c[0], name: 'Potion ' + c[0], rarity: c[1], target: { type: 'self' }, desc: 'Test potion.', execute: function () {} });
    });

    [1, 2, 3].forEach(function (act) {
      ['normal', 'elite', 'boss'].forEach(function (kind) {
        const n = kind === 'normal' ? 6 : 2;
        for (let i = 1; i <= n; i++) {
          DD.registerEncounter({
            id: 'rt_enc_a' + act + '_' + kind + '_' + i, act: act, kind: kind, name: 'Test ' + kind + ' ' + act + '.' + i,
            map: { theme: 'cellar', w: 8, h: 8 }, enemies: [{ id: 'rt_enemy', n: 2 }], reward: { goldMult: 1 },
          });
        }
      });
    });

    DD.registerStatus({ id: 'weak', name: 'Weak', type: 'debuff' });
    DD.registerStatus({ id: 'marked', name: 'Marked', type: 'debuff' });

    registerEvents();
  }

  function registerEvents() {
    DD.registerEvent({
      id: 'rt_ev_gold', acts: [1, 2, 3], title: 'Gold Test', text: function () { return 'A test about gold.'; },
      choices: [
        { label: 'Take', resolve: function (api) { api.gold(25); return 'Took 25 gold.'; } },
        { label: 'Pay', resolve: function (api) { api.gold(-10); return 'Paid 10 gold.'; } },
      ],
    });
    DD.registerEvent({
      id: 'rt_ev_fight', acts: [1, 2, 3], title: 'Fight Test', text: 'An ambush test.',
      choices: [
        { label: 'Fight (return)', resolve: function () { return { text: 'Ambush!', combat: { act: 1, kind: 'elite' } }; } },
        { label: 'Fight (api)', resolve: function (api) { api.combat('rt_enc_a1_normal_1'); return 'More ambush.'; } },
      ],
    });
    DD.registerEvent({
      id: 'rt_ev_loot', acts: [1, 2, 3], title: 'Loot Test', text: 'Shiny things.',
      choices: [
        { label: 'Item', resolve: function (api) { api.giveItem({ rarity: 'rare' }); api.giveConsumable(); return 'Loot.'; } },
        { label: 'Skill', resolve: function (api) { api.giveSkill(0); api.upgradeSkill(1); api.xp(12); return 'Learning.'; } },
        { label: 'Pain', requires: function (run) { return run.gold >= 0; }, resolve: function (api) { api.damage(5); api.addScar(2); api.heal(0.5, 0); return 'Ouch.'; } },
      ],
    });
    DD.registerEvent({
      id: 'rt_ev_needs_b', acts: [1], title: 'B Only', text: 'For B.',
      requires: function (run) { return run.party.some(function (h) { return h.id === 'rt_b' && !h.dead; }); },
      choices: [{ label: 'Hi B', resolve: function (api) { return api.heroName(api.heroIdx('rt_b')) + ' waves.'; } }],
    });
    DD.registerEvent({
      id: 'rt_ev_never', acts: [1, 2, 3], title: 'Never', text: 'Never offered.',
      requires: function () { return false; },
      choices: [{ label: 'No', resolve: function () { return 'Impossible.'; } }],
    });
    DD.registerEvent({
      id: 'rt_ev_act3', acts: [3], title: 'Act 3 Only', text: 'Late game.',
      choices: [{ label: 'Ok', resolve: function (api) { api.flag('rt_seen_act3', true); return 'Flagged.'; } }],
    });
  }

  // ---- fake combat engine -------------------------------------------------------------------------------------
  function fakeEngine() {
    const eng = { starts: [], builds: [] };
    eng.Encounter = {
      build: function (def, party, opts) {
        eng.builds.push({ def: def, party: party, opts: opts });
        return {
          grid: null, theme: 'cellar', encounter: def, objective: { type: 'killAll' }, rules: [], deployTiles: [], reinforcements: [],
          heroes: party.map(function (rh, i) { return { runHero: rh, x: i, y: 0 }; }),
          enemies: (def.enemies || []).map(function (e, i) { return { id: e.id, x: i, y: 5 }; }),
        };
      },
    };
    eng.Combat = {
      start: function (setup, opts) {
        const st = {
          id: 'fake' + eng.starts.length, result: null, run: opts.run, setup: setup, stats: { units: {} },
          units: setup.heroes.map(function (h, i) {
            return { id: 'h' + i, kind: 'hero', side: 'hero', defId: h.runHero.id, runHero: h.runHero, hp: h.runHero.hp, maxHp: DD.Run.heroStats(h.runHero).maxHp, downed: false, dead: false };
          }),
        };
        eng.starts.push({ setup: setup, opts: opts, state: st });
        return st;
      },
    };
    eng.last = function () { return eng.starts[eng.starts.length - 1] || null; };
    /** End the running fake fight: mutate(units, state) adjusts the outcome, then the engine calls onEnd. */
    eng.end = function (result, mutate) {
      const L = eng.last();
      if (!L) throw new Error('no fake combat was started');
      if (mutate) mutate(L.state.units, L.state);
      L.state.result = result;
      L.opts.onEnd(result, L.state);
      return L.state;
    };
    return eng;
  }

  /** Run fn inside the sandbox (fresh registries with test content, fake engine, clean Meta/Run, no UI). */
  async function sandbox(t, fn) {
    const saved = {};
    SWAP.forEach(function (k) { saved[k] = DD.defs[k]; DD.defs[k] = {}; });
    const savedCombat = DD.Combat, savedEncounter = DD.Encounter;
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    const savedUi = DD.Run.useUi;
    const savedProblems = DD.problems.length;
    const eng = fakeEngine();
    try {
      registerContent();
      const fb = saved.events[DD.Run.FALLBACK_EVENT];
      if (fb) DD.defs.events[fb.id] = fb;
      if (DD.problems.length > savedProblems) t.fail('sandbox content raised registry warnings: ' + DD.problems.slice(savedProblems).join(' | '));
      DD.Combat = eng.Combat;
      DD.Encounter = eng.Encounter;
      DD.Run.useUi = false;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.reset(false);
      return await fn(eng);
    } finally {
      SWAP.forEach(function (k) { DD.defs[k] = saved[k]; });
      DD.Combat = savedCombat;
      DD.Encounter = savedEncounter;
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
    }
  }

  // ---- helpers ------------------------------------------------------------------------------------------------
  function S() { return DD.Run.state; }
  function newRun(ids, seed, diff) { return DD.Run.newRun(ids || PARTY.slice(), diff || 'normal', seed === undefined ? 1234 : seed); }
  function json(v) { return JSON.stringify(v); }
  function firstOfType(map, type) {
    const ids = Object.keys(map.nodes).filter(function (id) { return map.nodes[id].type === type; });
    return ids.length ? map.nodes[ids[0]] : null;
  }
  /** Force the first start node to `type` (with a matching encounter for fights) and travel there. */
  function travelTo(type) {
    const s = S();
    const node = s.map.nodes[s.map.start[0]];
    node.type = type;
    delete node.encounterId;
    delete node.eventId;
    if (type === 'combat' || type === 'elite' || type === 'boss') node.encounterId = 'rt_enc_a' + s.act + '_' + (type === 'combat' ? 'normal' : type) + '_1';
    if (type === 'event') node.eventId = 'rt_ev_gold';
    return { ok: DD.Run.travel(node.id), node: node };
  }
  /** Invariants that must hold after every step of a run. */
  function checkInvariants(t, label) {
    const bad = invariantError();
    t.ok(!bad, label + ': invariants' + (bad ? ' — ' + bad : ''));
  }
  function invariantError() {
    const s = S();
    if (!s) return null;
    let bad = null;
    s.party.forEach(function (h, i) {
      const max = DD.Run.heroStats(h).maxHp;
      if (h.dead && h.hp !== 0) bad = 'dead hero ' + i + ' has hp ' + h.hp;
      if (!h.dead && (h.hp < 1 || h.hp > max)) bad = 'hero ' + i + ' hp ' + h.hp + ' outside [1,' + max + ']';
      if (h.skills.length > 4) bad = 'hero ' + i + ' has ' + h.skills.length + ' skills';
      const ids = h.skills.map(function (k) { return k.id; });
      if (ids.some(function (id, k) { return ids.indexOf(id) !== k; })) bad = 'hero ' + i + ' has duplicate skills';
      if (h.level < 1 || h.level > 10) bad = 'hero ' + i + ' level ' + h.level;
      h.skills.forEach(function (k) { const d = DD.getSkill(k.id); if (d && k.level > d.levels.length) bad = 'skill ' + k.id + ' over max level'; });
    });
    if (s.gold < 0 || !isFinite(s.gold)) bad = 'gold ' + s.gold;
    if (s.consumables.length > s.maxConsumables + 1) bad = 'too many consumables';
    if (!s.over && !DD.Run.inCombat() && !DD.Run.hasSave()) bad = 'run is not saved';
    return bad;
  }

  // ---- meta ---------------------------------------------------------------------------------------------------
  T.suite('run: meta — defaults, unlocks, settings, codex, history', function (t) {
    return sandbox(t, function () {
      const M = DD.Meta;
      const d = M.defaults();
      t.eq(d.settings.volume, 0.6, 'default volume');
      t.eq(d.settings.unlockAll, false, 'unlockAll off by default');
      t.eq(json(d.unlocked), json(M.STARTERS), 'DESIGN starters unlocked by default');
      t.ok(M.settings === M.data.settings, 'settings shortcut');
      t.ok(M.isUnlocked('rt_a') && M.isUnlocked('rt_e'), 'starters (unlock: null) are unlocked');
      t.ok(!M.isUnlocked('rt_f') && !M.isUnlocked('rt_g') && !M.isUnlocked('rt_h'), 'act unlocks start locked');
      t.ok(!M.isUnlocked('') && !M.isUnlocked(null), 'bad ids are not unlocked');
      t.eq(M.unlockHint('rt_f'), 'Clear Act 1 to unlock.', 'act 1 hint');
      t.eq(M.unlockHint('rt_h'), 'Beat the Dungeon Master to unlock.', 'act 3 hint');
      t.ok(M.unlocksForAct(1).indexOf('rt_f') >= 0, 'rt_f unlocks with act 1');
      t.ok(M.unlocksForAct(3).indexOf('corelos') >= 0, 'unregistered DESIGN unlocks still listed (corelos)');
      t.eq(json(M.unlockForAct(1)), json(['rt_f', 'josiah']), 'clearing act 1 newly unlocks rt_f (+ josiah fallback)');
      t.eq(json(M.unlockForAct(1)), '[]', 'second clear unlocks nothing new');
      t.ok(M.isUnlocked('rt_f'), 'rt_f now unlocked');
      t.ok(M.unlockedHeroes().indexOf('rt_f') >= 0 && M.unlockedHeroes().indexOf('rt_g') < 0, 'unlockedHeroes lists only unlocked');
      M.setSetting('unlockAll', true);
      t.ok(M.isUnlocked('rt_h'), 'unlockAll unlocks everyone');
      t.ok(M.unlock('rt_h'), 'unlock while unlockAll is on still reports a new permanent unlock');
      M.setSetting('unlockAll', false);
      t.ok(M.isUnlocked('rt_h') && !M.isUnlocked('rt_g'), 'permanent unlocks survive turning unlockAll off');
      t.eq(DD.Storage.get('meta', {}).settings.unlockAll, false, 'setSetting persists');
      t.ok(M.markSeen('enemy', 'rt_enemy'), 'markSeen new');
      t.ok(!M.markSeen('enemies', 'rt_enemy'), 'markSeen again is not new');
      t.ok(M.isSeen('enemies', 'rt_enemy') && !M.isSeen('bosses', 'rt_enemy'), 'codex kinds are separate');
      t.ok(!M.markSeen('nonsense', 'x'), 'unknown codex kind ignored');
      for (let i = 0; i < 25; i++) {
        M.recordRun({ result: i % 5 === 0 ? 'victory' : 'defeat', act: (i % 3) + 1, stats: { kills: 2, deaths: 1, downs: 1, combats: 3 } });
      }
      t.eq(M.data.stats.runs, 25, 'runs counted');
      t.eq(M.data.stats.wins, 5, 'wins counted');
      t.eq(M.data.stats.bestAct, 3, 'best act');
      t.eq(M.data.stats.kills, 50, 'kills summed');
      t.eq(M.data.stats.deaths, 25, 'deaths summed');
      t.eq(M.data.history.length, 20, 'history capped at 20');
      t.ok(M.data.history[0].act === 1 && M.data.history[0].result === 'defeat', 'newest run first (#24)');
      t.ok(M.data.history[19].act === 3 && M.data.history[19].result === 'victory', 'oldest kept run is #5');
      t.ok(M.data.history[0].date > 0, 'history entries are dated');
      M.save();
      M.data.stats.runs = 999;
      M.load();
      t.eq(M.data.stats.runs, 25, 'load restores the saved data');
      DD.Storage.set('meta', { stats: { runs: 'lots', wins: 3 }, settings: { volume: 'loud', sfx: false }, unlocked: [7, 'rt_g'], seen: { enemies: { a: 1 } }, history: [null, { result: 'defeat' }] });
      M.load();
      t.eq(M.data.stats.runs, 0, 'mistyped stats fall back to defaults');
      t.eq(M.data.stats.wins, 3, 'valid stats kept');
      t.eq(M.data.settings.volume, 0.6, 'mistyped settings fall back');
      t.eq(M.data.settings.sfx, false, 'valid settings kept');
      t.ok(M.data.unlocked.indexOf('rt_g') >= 0 && M.data.unlocked.indexOf(7) < 0, 'unlocked list sanitized');
      t.ok(M.data.unlocked.indexOf('zarathor') >= 0, 'starters always present');
      t.eq(M.data.history.length, 1, 'junk history entries dropped');
      t.ok(M.isSeen('enemies', 'a'), 'seen merged');
      DD.Storage.set('meta', 'garbage');
      t.tryRun('load garbage', function () { M.load(); });
      t.eq(M.data.stats.runs, 0, 'garbage meta resets to defaults');
    });
  });

  // ---- maps ---------------------------------------------------------------------------------------------------
  T.suite('run: map — structural invariants over many seeds', function (t) {
    const n = t.n || 300;
    let bad = 0, maps = 0, fights = 0, slots = 0;
    const typeCount = {};
    const savedEnc = DD.defs.encounters, savedEv = DD.defs.events;
    DD.defs.encounters = {};
    DD.defs.events = {};
    try {
      for (let seed = 0; seed < n; seed++) {
        for (let act = 1; act <= 3; act++) {
          const map = DD.RunMap.generate(act, DD.RNG('map-test:' + seed + ':' + act));
          maps++;
          const problems = DD.RunMap.validate(map);
          if (problems.length) { bad++; if (bad <= 5) t.log('seed ' + seed + ' act ' + act + ': ' + problems.join('; ')); }
          const counts = {};
          for (let r = 1; r < 6; r++) {
            map.layout[r].forEach(function (id) {
              const ty = map.nodes[id].type;
              counts[ty] = (counts[ty] || 0) + 1;
              typeCount[ty] = (typeCount[ty] || 0) + 1;
              slots++;
              if (DD.RunMap.isFight(ty)) fights++;
            });
          }
          if (!counts.shop || !counts.elite || !counts.event) {
            bad++;
            if (bad <= 5) t.log('seed ' + seed + ' act ' + act + ' misses a guaranteed type: ' + json(counts));
          }
          Object.keys(map.nodes).forEach(function (id) { if (id.indexOf('a' + act + '_') !== 0) bad++; });
        }
      }
      t.eq(bad, 0, maps + ' maps valid (rows, types, links, no crossings, reachability, guarantees)');
      const share = fights / slots;
      t.ok(share > 0.4 && share < 0.75, 'fights are ' + Math.round(share * 100) + '% of rows 1-5 (pacing)');
      t.ok(typeCount.treasure > 0 && typeCount.tavern > 0, 'treasure and mid-act taverns appear: ' + json(typeCount));
      const a = DD.RunMap.generate(2, DD.RNG('same'));
      const b = DD.RunMap.generate(2, DD.RNG('same'));
      t.eq(json(a), json(b), 'generation is deterministic per seed');
      t.ok(json(a) !== json(DD.RunMap.generate(2, DD.RNG('other'))), 'different seeds give different maps');
      t.eq(a.rows, 8, 'rows = 7 + boss row');
      t.eq(a.nodes[a.boss].row, 7, 'boss on row 7');
      t.eq(DD.RunMap.validate(null).length, 1, 'validate tolerates garbage');
      const info = DD.RunMap.nodeInfo(a.nodes[a.boss]);
      t.ok(info && info.icon && info.name, 'nodeInfo for the boss');
    } finally {
      DD.defs.encounters = savedEnc;
      DD.defs.events = savedEv;
    }
  });

  T.suite('run: map — encounters and events pre-assigned, lazy when registries are empty', function (t) {
    return sandbox(t, function (eng) {
      const run = newRun();
      [1, 2, 3].forEach(function (act) {
        const map = DD.RunMap.generate(act, DD.RNG('pre:' + act), { run: run });
        const used = [];
        let ok = true, events = 0;
        Object.keys(map.nodes).forEach(function (id) {
          const node = map.nodes[id];
          if (DD.RunMap.isFight(node.type)) {
            const enc = DD.getEncounter(node.encounterId);
            const kind = node.type === 'combat' ? 'normal' : node.type;
            if (!enc || enc.kind !== kind || enc.act !== act) { ok = false; t.log('bad encounter on ' + id + ': ' + node.encounterId); }
            if (enc && kind === 'normal') used.push(enc.id);
          }
          if (node.type === 'event') {
            const ev = DD.getEvent(node.eventId);
            if (ev) { events++; if (ev.id === 'rt_ev_never' || (act !== 3 && ev.id === 'rt_ev_act3')) ok = false; }
          }
        });
        t.ok(ok, 'act ' + act + ': fights carry a matching encounter, events respect acts/requires');
        t.ok(events > 0, 'act ' + act + ': events pre-assigned');
        t.ok(used.length <= 6 ? used.every(function (id, i) { return used.indexOf(id) === i; }) : true, 'act ' + act + ': normal encounters do not repeat while the pool lasts');
      });
      // empty registries: nothing pre-assigned, lazy assignment at travel time once content exists
      const savedEnc = DD.defs.encounters;
      const savedEvents = DD.defs.events;
      DD.defs.encounters = {};
      DD.defs.events = {};
      const map = DD.RunMap.generate(1, DD.RNG('empty'), { run: S() });
      t.ok(Object.keys(map.nodes).every(function (id) { return !map.nodes[id].encounterId && !map.nodes[id].eventId; }), 'nothing assigned without content');
      t.eq(DD.RunMap.pickEncounter(1, 'normal', DD.RNG(1)), null, 'pickEncounter -> null when empty');
      t.eq(DD.RunMap.pickEvent(1, DD.RNG(1)), null, 'pickEvent -> null when empty');
      S().map = map;
      DD.defs.encounters = savedEnc;
      DD.defs.events = savedEvents;
      const node = map.nodes[map.start[0]];
      t.ok(DD.Run.travel(node.id), 'travel works with a lazily assigned fight');
      t.ok(node.encounterId && DD.getEncounter(node.encounterId).kind === 'normal', 'encounter assigned at travel time');
      t.eq(S().pending.type, 'combat', 'combat pending');
      t.eq(eng.starts.length, 1, 'combat engine started');
      // nearest-act fallback when an act has no encounters of a kind
      Object.keys(DD.defs.encounters).forEach(function (id) { if (DD.defs.encounters[id].act === 3) delete DD.defs.encounters[id]; });
      const near = DD.RunMap.pickEncounter(3, 'elite', DD.RNG(2));
      t.ok(near && near.kind === 'elite' && near.act === 2, 'falls back to the nearest act');
      const noBoss = DD.RunMap.pickEncounter(1, 'boss', DD.RNG(3), { exclude: [] });
      t.ok(noBoss && noBoss.kind === 'boss', 'boss pick');
    });
  });

  // ---- new run / heroes ------------------------------------------------------------------------------------------
  T.suite('run: new run — RunHeroes, defaults, saving', function (t) {
    return sandbox(t, function () {
      const s = newRun(PARTY, 77, 'brutal');
      t.ok(s && s === S(), 'newRun returns the state');
      t.eq(s.version, 1, 'version');
      t.eq(s.seed, 77, 'seed');
      t.eq(s.difficulty, 'brutal', 'difficulty');
      t.eq(s.act, 1, 'act 1');
      t.eq(s.gold, 60, 'start gold 60');
      t.eq(s.maxConsumables, 3, '3 consumable slots');
      t.eq(s.party.length, 4, '4 heroes');
      s.party.forEach(function (h, i) {
        const def = DD.getHero(h.id);
        t.eq(h.id, PARTY[i], 'hero ' + i + ' id');
        t.eq(h.level, 1, 'level 1');
        t.ok(!('xp' in h), 'no XP field (v2 leveling has no XP)');
        t.eq(h.hp, def.stats.hp, 'full HP');
        t.eq(json(h.skills), json(def.startingSkills.map(function (id) { return { id: id, level: 1 }; })), 'starting skills at level 1');
        t.eq(json(h.items), json({ weapon: null, armor: null, trinket: null }), 'no items');
        t.ok(h.scars.length === 0 && h.downs === 0 && !h.dead && h.kills === 0, 'clean record');
      });
      t.eq(DD.RunMap.validate(s.map).length, 0, 'act 1 map valid');
      t.eq(json(DD.Run.availableNodes().map(function (n) { return n.id; })), json(s.map.start), 'start nodes available');
      t.ok(s.pending === null && s.nodeId === null, 'nothing pending');
      t.ok(DD.Run.hasSave(), 'saved immediately');
      t.eq(newRun(PARTY, 5, 'insane').difficulty, 'normal', 'unknown difficulty -> normal');
      t.eq(newRun(['rt_a', 'rt_a', 'rt_b'], 5).party.length, 2, 'duplicate heroes removed');
      t.eq(newRun(['rt_a', 'rt_b', 'rt_c', 'rt_h'], 5).maxConsumables, 4, 'consumableSlots on a hero def adds a slot');
      const a = json(newRun(PARTY, 'seed-x').map), b = json(newRun(PARTY, 'seed-x').map);
      t.eq(a, b, 'same seed, same map');
      t.eq(DD.Run.newRun([], 'normal', 1), null, 'no heroes -> null');
      t.ok(typeof newRun(PARTY, null).seed === 'number', 'a seed is generated when none is given');
    });
  });

  T.suite('run: heroStats — base, growth, items, scars, perks', function (t) {
    return sandbox(t, function () {
      newRun();
      const h = S().party[0];
      t.eq(json(DD.Run.heroStats(h)), json({ maxHp: 24, ap: 3, mov: 4, armor: 0, dmg: 0, heal: 0, range: 0, block: 0, hype: 0, init: 0 }), 'level 1 base stats');
      // v2 initiative modifier: the def's stats.init + items / scars / perks / Blessings (what DD.Combat adds to the d20)
      DD.getHero('rt_a').stats.init = 2;
      DD.registerItem({ id: 'rt_boots_init', name: 'Quick Boots', slot: 'trinket', rarity: 'common', icon: '👟', stats: { init: 1 }, desc: '+1 initiative.' });
      t.eq(DD.Run.heroStats({ id: 'rt_a', level: 1, items: { trinket: 'rt_boots_init' } }).init, 3, 'init: def 2 + item 1');
      delete DD.getHero('rt_a').stats.init;
      h.level = 3;
      t.eq(DD.Run.heroStats(0).maxHp, 32, 'growth: +4 HP per level (by index too)');
      h.items.armor = 'rt_a_leg';
      h.items.weapon = 'rt_w_rare';
      h.items.trinket = 'rt_t_common';
      h.scars = ['scar_trick_knee', 'scar_glass_jaw', 'scar_bruised_ego'];
      h.perks = ['hp', 'dmg', 'mov'];
      const st = DD.Run.heroStats(h);
      t.eq(st.maxHp, 32 + 15 - 4 + 4, 'max HP: base+growth+armor-scar+perk');
      t.eq(st.mov, 4 - 1 + 1, 'move: scar and perk');
      t.eq(st.block, 3, 'block from items');
      t.eq(st.range, 1, 'range from items');
      t.near(st.dmg, 0.2 - 0.05 + 0.05, 1e-9, 'damage bonus: weapon - scar + perk');
      h.scars = ['scar_trick_knee'];
      h.items = { weapon: 'rt_w_cursed', armor: null, trinket: null };
      h.perks = [];
      t.eq(DD.Run.heroStats(h).mov, 2, 'move penalties stack');
      t.eq(DD.Run.heroStats({ id: 'rt_a', level: 1, items: { weapon: 'rt_w_cursed' }, scars: ['scar_trick_knee', 'scar_trick_knee', 'scar_trick_knee', 'scar_trick_knee'] }).mov, 1, 'move never below 1');
      t.ok(DD.Run.heroStats(null).maxHp > 0, 'null -> fallback stats');
      t.ok(DD.Run.heroStats({ id: 'nobody', level: 2 }).maxHp > 0, 'unknown hero -> fallback stats');
      t.ok(DD.Run.heroStats({ id: 'rt_b' }).maxHp === 26, 'bare RunHero-like object works');
    });
  });

  T.suite('run: gold, items, equipment and consumables', function (t) {
    return sandbox(t, function () {
      newRun();
      const s = S();
      let events = 0;
      const off = DD.Events.on('run:gold', function () { events++; });
      t.eq(DD.Run.addGold(15), 15, 'addGold returns the change');
      t.eq(s.gold, 75, 'gold added');
      t.eq(s.stats.goldEarned, 15, 'goldEarned tracked');
      t.eq(DD.Run.addGold(-100), -75, 'negative addGold clamps at 0');
      t.eq(s.gold, 0, 'gold 0');
      t.ok(!DD.Run.spendGold(1), 'cannot overspend');
      DD.Run.addGold(50);
      t.ok(DD.Run.spendGold(20) && s.gold === 30, 'spendGold');
      t.ok(events >= 3, 'run:gold events emitted');
      off();
      t.ok(!DD.Run.addItem('nope'), 'unknown item rejected');
      t.ok(DD.Run.addItem('rt_a_common'), 'item added');
      t.eq(json(s.inventory), json(['rt_a_common']), 'in the bag');
      const h = s.party[1];
      const hp0 = h.hp;
      h.hp -= 6;
      t.ok(DD.Run.equip(1, 'rt_a_common'), 'equip');
      t.eq(h.items.armor, 'rt_a_common', 'equipped');
      t.eq(s.inventory.length, 0, 'removed from the bag');
      t.eq(h.hp, hp0 - 6 + 5, 'equipping +5 max HP raises current HP by 5');
      t.ok(DD.Run.unequip(1, 'armor'), 'unequip');
      t.eq(h.hp, hp0 - 6, 'unequip returns to the same HP (no heal exploit)');
      t.ok(!DD.Run.unequip(1, 'armor'), 'nothing to unequip');
      DD.Run.addItem('rt_a_only');
      t.ok(!DD.Run.canEquip(1, 'rt_a_only') && !DD.Run.equip(1, 'rt_a_only'), 'hero-only item refused for other heroes');
      t.ok(DD.Run.equip(0, 'rt_a_only'), 'hero-only item fits its hero');
      DD.Run.addItem('rt_t_rare');
      t.ok(DD.Run.equip(0, 'rt_t_rare'), 'equip over an existing item');
      t.ok(s.inventory.indexOf('rt_a_only') >= 0 && s.party[0].items.trinket === 'rt_t_rare', 'old item back in the bag');
      DD.Run.addItem('rt_t_cursed');
      t.eq(DD.Run.autoEquip('rt_t_cursed'), -1, 'cursed items are never auto-equipped');
      DD.Run.addItem('rt_w_common');
      const eq = DD.Run.autoEquip('rt_w_common', 2);
      t.eq(eq, 2, 'autoEquip prefers the given hero');
      t.eq(s.party[2].items.weapon, 'rt_w_common', 'auto-equipped');
      t.eq(DD.Run.autoEquip('rt_w_common'), -1, 'autoEquip needs the item in the bag');
      s.party[3].dead = true;
      t.ok(!DD.Run.equip(3, 'rt_t_cursed'), 'dead heroes cannot equip');
      s.party[3].dead = false;
      t.ok(!DD.Run.addConsumable('nope'), 'unknown consumable rejected');
      t.ok(DD.Run.addConsumable('rt_pot_red') && DD.Run.addConsumable('rt_pot_big') && DD.Run.addConsumable('rt_pot_odd'), '3 consumables fit');
      t.ok(!DD.Run.addConsumable('rt_pot_red'), 'the 4th does not');
      t.eq(DD.Run.removeConsumable(1), 'rt_pot_big', 'removeConsumable returns the id');
      t.eq(DD.Run.removeConsumable(9), null, 'out of range -> null');
      t.eq(s.consumables.length, 2, '2 left');
      t.eq(DD.Run.maxConsumables(), 3, 'maxConsumables()');
    });
  });

  /** Party levels as a compact string, e.g. "2,2,1,1". */
  function levels() { return S().party.map(function (h) { return h.level; }).join(','); }
  /** max - min level among the living heroes. */
  function spread() {
    const lv = S().party.filter(function (h) { return !h.dead; }).map(function (h) { return h.level; });
    return lv.length ? Math.max.apply(null, lv) - Math.min.apply(null, lv) : 0;
  }

  T.suite('run: v2 level-ups — the rotation (lowest level first, random among them), named heroes, max level, the dead', function (t) {
    return sandbox(t, function () {
      newRun(PARTY, 'rotation');
      const s = S();
      t.ok(!DD.Rewards.xpTable && !DD.Rewards.combatXp && !DD.Run.xpInfo, 'no XP table / combat XP / xpInfo any more');
      t.eq(DD.Rewards.LEVEL_UPS_PER_WIN, 1, 'one level-up per won fight (the single constant)');
      t.ok(['normal', 'elite', 'boss'].every(function (k) { return DD.Run.levelUpsPerWin(k) === 1; }), 'normal, elite and boss fights alike');
      t.eq(DD.Run.LEVEL_UPS_PER_WIN, 1, 'DD.Run.LEVEL_UPS_PER_WIN mirrors it');
      t.eq(json(DD.Run.levelUpCandidates()), json([0, 1, 2, 3]), 'everyone level 1: everyone is a candidate');
      const n0 = DD.Run.nextLevelUp();
      t.ok(n0.candidates.length === 4 && n0.level === 1 && !n0.maxed && n0.names[0] === 'Hero A', 'nextLevelUp describes the next roll');
      const max0 = DD.Run.heroStats(0).maxHp, hp0 = s.party.map(function (h) { return h.hp; });
      const first = DD.Run.levelUp();
      t.ok(first && first.rotation && first.die === 4 && first.face >= 1 && first.face <= 4, 'a rotation level-up is a d4 among 4: ' + json(first));
      t.eq(first.heroIdx, first.candidates[first.face - 1], 'the die face names the hero (its place among the candidates)');
      t.ok(first.from === 1 && first.to === 2 && first.heroId === PARTY[first.heroIdx] && first.name === DD.Run.heroName(first.heroIdx), 'record: from / to / id / name');
      t.eq(json(first.candidateIds), json(PARTY), 'record keeps the candidates\' ids');
      const lh = s.party[first.heroIdx];
      t.ok(lh.level === 2 && lh.pendingLevels === 1, 'one level gained, its choice pending');
      t.eq(DD.Run.heroStats(lh).maxHp - DD.Run.heroStats({ id: lh.id, level: 1 }).maxHp, 4, 'growth applied');
      t.eq(lh.hp, hp0[first.heroIdx] + 4, 'current HP grows with it');
      t.ok(s.party.every(function (h, i) { return i === first.heroIdx || (h.level === 1 && h.pendingLevels === 0 && h.hp === hp0[i]); }), 'nobody else changed');
      t.eq(s.stats.levelUps, 1, 'stats.levelUps counts');
      t.eq(json(DD.Run.levelUpCandidates()), json([0, 1, 2, 3].filter(function (i) { return i !== first.heroIdx; })), 'the leveled hero leaves the candidates');
      // the rest of the round: every other hero once, then everyone again
      const round = [first.heroIdx];
      for (let k = 0; k < 3; k++) {
        const r = DD.Run.levelUp();
        t.ok(r && round.indexOf(r.heroIdx) < 0 && r.from === 1, 'level-up ' + (k + 2) + ' goes to a hero still at level 1 (' + r.heroIdx + ')');
        round.push(r.heroIdx);
        t.ok(spread() <= 1, 'max - min level stays <= 1 (' + levels() + ')');
      }
      t.eq(levels(), '2,2,2,2', 'all four reach level 2 before anyone reaches 3');
      t.eq(DD.Run.levelUpCandidates().length, 4, 'a fresh round: everyone is a candidate again');
      t.eq(DD.Run.nextLevelUp().level, 2, 'next candidates are at level 2');
      // named hero (events): jumps the queue
      const named = DD.Run.levelUp(2, { src: 'event' });
      t.ok(named && named.heroIdx === 2 && !named.rotation && named.die === 0 && named.to === 3 && named.src === 'event', 'levelUp(idx): that hero, no roll');
      t.eq(json(DD.Run.levelUpCandidates()), json([0, 1, 3]), 'the named hero is ahead now');
      t.eq(DD.Run.levelUp(9), null, 'an unknown hero gets nothing');
      // compat aliases: one level-up per call
      const g = DD.Run.grantXp(400);
      t.ok(g.length === 1 && [0, 1, 3].indexOf(g[0]) >= 0, 'grantXp(n) = one rotation level-up, whatever n: ' + json(g));
      t.eq(json(DD.Run.grantXp(0)), '[]', 'grantXp(0) does nothing');
      t.eq(DD.Run.grantHeroXp(1, 999), 1, 'grantHeroXp(idx, n) = that hero levels up once');
      t.eq(DD.Run.grantHeroXp(1, 0), 0, 'no XP, no level');
      // the dead are skipped
      s.party[3].dead = true; s.party[3].hp = 0;
      for (let k = 0; k < 6; k++) {
        const r = DD.Run.levelUp();
        t.ok(r && r.heroIdx !== 3 && r.candidates.indexOf(3) < 0, 'the dead are never candidates');
        t.ok(spread() <= 1 || k === 0, 'living spread stays small (' + levels() + ')');
      }
      t.eq(DD.Run.levelUp(3), null, 'a dead hero cannot be named either');
      t.eq(DD.Run.grantHeroXp(3, 50), 0, 'nor through the XP alias');
      t.ok(DD.Run.levelQueue().indexOf(3) < 0, 'dead heroes leave the level queue');
      t.ok(DD.Run.levelQueueFull().length === s.party.reduce(function (a, h) { return a + (h.dead ? 0 : h.pendingLevels); }, 0), 'levelQueueFull repeats per pending level');
      // max level 10
      s.party[0].level = 10; s.party[1].level = 10; s.party[2].level = 9;
      const last = DD.Run.levelUp();
      t.ok(last && last.heroIdx === 2 && last.die === 1 && last.face === 1, 'only one hero below the max: no roll needed (d1)');
      t.eq(s.party[2].level, 10, 'capped at 10');
      t.eq(DD.Run.levelUp(), null, 'everyone at 10: nobody levels up');
      t.ok(DD.Run.nextLevelUp().maxed && !DD.Run.nextLevelUp().candidates.length, 'nextLevelUp says maxed');
      t.eq(DD.Run.levelUp(0), null, 'no named level-ups past 10');
      t.eq(json(DD.Run.grantLevelUps(3)), '[]', 'grantLevelUps stops when nobody can level');
    });
  });

  T.suite('run: v2 level-ups — seeded, fair over many runs, Balance override', function (t) {
    return sandbox(t, function (eng) {
      const seq = function (seed) {
        newRun(PARTY, seed);
        const out = [];
        for (let k = 0; k < 8; k++) out.push(DD.Run.levelUp().heroIdx);
        return out.join('');
      };
      t.eq(seq('det-a'), seq('det-a'), 'the same seed picks the same heroes');
      const seen = {};
      for (let k = 0; k < 6; k++) seen[seq('det-' + k)] = 1;
      t.ok(Object.keys(seen).length > 1, 'different seeds pick different heroes');
      // the first pick of a fresh party is uniform over the 4 heroes; the second over the 3 left
      const firsts = [0, 0, 0, 0], seconds = [0, 0, 0, 0];
      const N = t.n || 400;
      for (let k = 0; k < N; k++) {
        newRun(PARTY, 'fair-' + k);
        const a = DD.Run.levelUp(), b = DD.Run.levelUp();
        firsts[a.heroIdx]++;
        if (b.heroIdx === a.heroIdx) t.fail('the same hero leveled twice in a row while others were behind');
        seconds[b.heroIdx]++;
        if (b.die !== 3) t.fail('second roll should be a d3, got d' + b.die);
      }
      t.ok(firsts.every(function (c) { return c > N * 0.17 && c < N * 0.33; }), 'first level-up ~25% per hero over ' + N + ' runs: ' + json(firsts));
      t.ok(seconds.every(function (c) { return c > N * 0.17 && c < N * 0.33; }), 'second level-up spreads too: ' + json(seconds));
      // DD.Balance.leveling.perWin is the one override (number or per kind); restored afterwards
      const hadBal = !!DD.Balance, saved = DD.Balance ? DD.Balance.leveling : undefined;
      if (!DD.Balance) DD.Balance = {};
      try {
        DD.Balance.leveling = { perWin: 2 };
        t.eq(DD.Run.levelUpsPerWin('normal'), 2, 'perWin: 2 for every kind');
        DD.Balance.leveling = { perWin: { normal: 1, elite: 1, boss: 2 } };
        t.ok(DD.Run.levelUpsPerWin('boss') === 2 && DD.Run.levelUpsPerWin('elite') === 1, 'perWin per kind');
        DD.Balance.leveling = { perWin: 'lots' };
        t.eq(DD.Run.levelUpsPerWin('normal'), 1, 'junk falls back to the constant');
        DD.Balance.leveling = { perWin: 2 };
        newRun(PARTY, 'two-per-win');
        travelTo('combat');
        eng.end('victory');
        const d = DD.Run.rewards();
        t.ok(d.levelUps.length === 2 && d.levelUps[0].heroIdx !== d.levelUps[1].heroIdx, 'two level-ups go to two different lowest heroes');
        t.eq(DD.Rewards.combat('normal', 1, DD.RNG(1), S()).levelUpCount, 2, 'DD.Rewards.combat reports the count');
      } finally {
        if (saved === undefined) delete DD.Balance.leveling; else DD.Balance.leveling = saved;
        if (!hadBal) delete DD.Balance;
      }
    });
  });

  T.suite('run: level-up choices — learn, upgrade, perk, replace and skip', function (t) {
    return sandbox(t, function () {
      newRun(PARTY, 4242);
      const s = S();
      const h = s.party[0];
      DD.Run.levelUp(0);
      const c1 = DD.Run.levelUpChoices(0);
      t.eq(c1.length, 3, '3 choices');
      t.eq(json(c1.map(function (c) { return c.type; })), json(['skill', 'upgrade', 'perk']), 'learn / upgrade / perk');
      t.ok(DD.Run.levelUpChoices(0) === c1, 'choices are cached until applied');
      t.ok(c1.every(function (c) { return c.label && typeof c.desc === 'string' && c.icon; }), 'choices have label/desc/icon');
      t.ok(DD.getHero('rt_a').skillPool.indexOf(c1[0].id) >= 0, 'learn offers a hero pool skill');
      const other = newRun(PARTY, 4242);
      DD.Run.levelUp(0);
      t.eq(json(DD.Run.levelUpChoices(0)), json(c1), 'deterministic per seed');
      DD.Run.state = s;
      const r1 = DD.Run.applyLevelChoice(0, c1[0]);
      t.ok(r1.ok && h.skills.length === 3 && h.skills[2].id === c1[0].id, 'learned the new skill');
      t.ok(h.pendingLevels === 0 && h.levelChoices === null, 'level-up consumed');
      t.eq(DD.Run.applyLevelChoice(0, 0).ok, false, 'nothing pending -> not ok');
      t.ok(other !== s, 'second run was separate');
      // fill the sockets, then learning needs replace-or-skip
      t.ok(DD.Run.learnSkill(0, DD.Run.learnableSkills(0)[0]), 'learnSkill into a free socket');
      t.eq(h.skills.length, 4, '4 sockets full');
      t.ok(!DD.Run.learnSkill(0, DD.Run.learnableSkills(0)[0]), 'a 5th skill needs a replace index');
      t.ok(!DD.Run.learnSkill(0, h.skills[0].id, 1), 'a known skill cannot be learned again');
      DD.Run.levelUp(0);
      let c = DD.Run.levelUpChoices(0);
      const learn = c.filter(function (x) { return x.type === 'skill'; })[0];
      t.ok(learn && learn.replace, 'learn choice flags the replace');
      const before = json(h.skills);
      const r2 = DD.Run.applyLevelChoice(0, learn);
      t.ok(!r2.ok && r2.needsReplace, 'needsReplace without a replace index');
      t.eq(json(h.skills), before, 'nothing changed');
      t.eq(h.pendingLevels, 1, 'still pending');
      const forgotten = h.skills[1].id;
      const r3 = DD.Run.applyLevelChoice(0, learn, 1);
      t.ok(r3.ok && h.skills[1].id === learn.id && h.skills[1].level === 1, 'replaced socket 1');
      t.ok(h.skills.every(function (k) { return k.id !== forgotten; }), 'the old skill is forgotten');
      t.ok(r3.text.indexOf(DD.getSkill(forgotten).name) >= 0, 'flavor text names the forgotten skill: ' + r3.text);
      DD.Run.levelUp(0);
      c = DD.Run.levelUpChoices(0);
      const learn2 = c.filter(function (x) { return x.type === 'skill'; })[0];
      const snap = json(h.skills);
      t.ok(DD.Run.applyLevelChoice(0, learn2, -1).ok, 'skip (-1) is allowed');
      t.ok(json(h.skills) === snap && h.pendingLevels === 0, 'skip keeps the skills and consumes the level');
      // upgrades: max level III, single-level skills never offered
      h.skills = [{ id: 'rt_a_s1', level: 2 }, { id: 'rt_a_s6', level: 1 }, { id: 'rt_a_s2', level: 3 }, { id: 'rt_a_s3', level: 1 }];
      t.eq(json(DD.Run.upgradableSkills(0)), json([0, 3]), 'only skills below their max are upgradable');
      t.ok(DD.Run.upgradeSkill(0, 0) && h.skills[0].level === 3, 'upgrade to III');
      t.ok(!DD.Run.upgradeSkill(0, 0), 'no level IV');
      t.ok(!DD.Run.upgradeSkill(0, 1), 'single-level skill cannot upgrade');
      // stale choice: the offered upgrade got maxed elsewhere
      h.level = 4;
      DD.Run.levelUp(0);
      c = DD.Run.levelUpChoices(0);
      const up = c.filter(function (x) { return x.type === 'upgrade'; })[0];
      t.ok(up && up.id === 'rt_a_s3', 'the only upgradable skill is offered');
      h.skills[3].level = 3;
      const r4 = DD.Run.applyLevelChoice(0, up);
      t.ok(!r4.ok && r4.reason === 'stale', 'stale upgrade rejected');
      t.ok(h.levelChoices === null && h.pendingLevels === 1, 'choices regenerate, level still pending');
      // perks: +4 max HP (current too); move perk only from level 5, once
      const hpBefore = h.hp, maxBefore = DD.Run.heroStats(0).maxHp;
      h.levelChoices = [{ type: 'perk', id: 'hp', label: 'x', desc: 'y', icon: 'z' }];
      t.ok(DD.Run.applyLevelChoice(0, 0).ok, 'hp perk');
      t.eq(DD.Run.heroStats(0).maxHp, maxBefore + 4, '+4 max HP');
      t.eq(h.hp, hpBefore + 4, '+4 current HP');
      const lowHero = s.party[1];
      DD.Run.levelUp(1);
      const offers = function (idx) {
        const out = [];
        for (let k = 0; k < 40; k++) {
          s.party[idx].levelChoices = null;
          DD.Run.levelUpChoices(idx).forEach(function (x) { if (x.type === 'perk') out.push(x.id); });
        }
        return out;
      };
      t.ok(offers(1).indexOf('mov') < 0 && lowHero.level < 5, 'no move perk below level 5');
      while (lowHero.level < 5) DD.Run.levelUp(1);
      t.ok(offers(1).indexOf('mov') >= 0, 'move perk offered at level 5+');
      lowHero.perks.push('mov');
      t.ok(offers(1).indexOf('mov') < 0, 'move perk only once');
      // exhausted pools fall back to generic skills, then to upgrades/perks
      const g = s.party[2];
      g.skills = [{ id: 'rt_c_s1', level: 1 }, { id: 'rt_c_s2', level: 1 }];
      DD.getHero('rt_c').skillPool = ['rt_c_s1', 'rt_c_s2'];
      DD.Run.levelUp(2);
      const gc = DD.Run.levelUpChoices(2);
      t.ok(gc[0].type === 'skill' && DD.getSkill(gc[0].id).owner === 'generic', 'generic skill when the hero pool is exhausted');
      DD.defs.skills.rt_gen1.owner = DD.defs.skills.rt_gen2.owner = DD.defs.skills.rt_gen3.owner = 'enemy';
      g.levelChoices = null;
      const gc2 = DD.Run.levelUpChoices(2);
      t.eq(gc2.length, 3, 'still 3 choices with nothing to learn');
      t.ok(gc2.every(function (x) { return x.type !== 'skill'; }), 'no learn choice when nothing is learnable');
    });
  });

  // ---- v2 leveling through the run flow -----------------------------------------------------------------------------
  T.suite('run: v2 leveling — every won fight (normal, elite, boss, event fight) levels up one hero; lost objectives and treasure do not', function (t) {
    return sandbox(t, function (eng) {
      ['combat', 'elite', 'boss'].forEach(function (type) {
        newRun(PARTY, 'kind-' + type);
        travelTo(type);
        eng.end('victory');
        const d = DD.Run.rewards();
        t.ok(d && d.levelUps.length === 1 && d.levelUps[0].src === 'fight' && d.levelUps[0].rotation, type + ': one rotation level-up');
        t.eq(levels().split(',').filter(function (x) { return x === '2'; }).length, 1, type + ': exactly one hero at level 2 (' + levels() + ')');
        t.ok(d.leveled.length === 1 && d.leveled[0] === d.levelUps[0].heroIdx, type + ': leveled lists that hero\'s pending choice');
        t.eq(DD.Run.nextLevelStep(d.levelUps[0].heroIdx), 'choice', type + ': its boon waits (no Blessing table in this sandbox)');
      });
      // the act boss: level-up, then the act clears
      newRun(PARTY, 'kind-actboss');
      walkAct(t, eng, { pick: function (avail) { return avail.filter(function (n) { return n.type !== 'boss'; })[0] || avail[0]; } });
      const bd = DD.Run.rewards();
      t.ok(bd && bd.actClear && bd.levelUps.length === 1, 'the act boss also levels up exactly one hero');
      t.ok(spread() <= 1, 'after a whole act the party spans at most one level (' + levels() + ')');
      // an event fight (queued by an event choice)
      newRun(PARTY, 'kind-event');
      DD.Run.openEvent('rt_ev_fight', null, { noShow: true });
      DD.Run.chooseEventOption(0);
      DD.Run.next();
      t.ok(S().pending.type === 'combat' && S().pending.data.fromEvent, 'the event fight started');
      eng.end('victory');
      t.eq(DD.Run.rewards().levelUps.length, 1, 'a won event fight levels up one hero');
      // a lost protect objective (heroes standing): not a win — nobody levels up
      newRun(PARTY, 'kind-failed');
      travelTo('combat');
      const lv0 = levels();
      eng.end('defeat', function (units) { units[1].hp = 0; units[1].downed = true; });
      const fd = DD.Run.rewards();
      t.ok(fd && fd.kind === 'failed' && fd.levelUps.length === 0, 'a lost objective grants no level-up');
      t.eq(levels(), lv0, 'levels unchanged');
      t.ok(!/XP/.test(fd.text) && /levels up/.test(fd.text), 'its text says so without XP: ' + fd.text);
      t.eq(S().stats.levelUps, 0, 'stats.levelUps unchanged');
      // treasure: not a fight
      newRun(PARTY, 'kind-treasure');
      travelTo('treasure');
      t.ok(DD.Run.rewards().levelUps.length === 0 && levels() === '1,1,1,1', 'treasure grants no level-up');
      // a TPK ends the run before anything levels
      newRun(PARTY, 'kind-tpk');
      travelTo('combat');
      eng.end('defeat', function (units) { units.forEach(function (u) { u.hp = 0; u.downed = true; }); });
      t.ok(S().over === 'defeat' && levels() === '1,1,1,1', 'a TPK: game over, no level-up');
    });
  });

  T.suite('run: v2 leveling — recruits join at the lowest level, deaths and recruits keep the rotation fair', function (t) {
    return sandbox(t, function (eng) {
      newRun(PARTY, 'recruits');
      const s = S();
      DD.Meta.unlock('rt_f');
      DD.Run.grantLevelUps(6);
      t.eq(levels().split(',').sort().join(','), '2,2,3,3', 'six level-ups: two heroes at 3, two at 2');
      const high = s.party.findIndex(function (h) { return h.level === 3; });
      const low = s.party.findIndex(function (h) { return h.level === 2; });
      // replacing a level-3 hero: the recruit joins at 2 (the lowest of those who stay)
      t.eq(DD.Run.recruitLevel(high), 2, 'recruitLevel for a level-3 slot');
      const r1 = DD.Run.recruit('rt_e', high);
      t.ok(r1 && r1.level === 2 && r1.pendingLevels === 0 && !('xp' in r1), 'recruit at level 2, nothing pending, no XP');
      t.ok(spread() <= 1, 'still within one level (' + levels() + ')');
      t.eq(json(DD.Run.levelUpCandidates().sort()), json(s.party.map(function (h, i) { return i; }).filter(function (i) { return s.party[i].level === 2; })), 'the recruit is in the running with the other level-2 heroes');
      // a dead hero's seat: the recruit joins at the living party's lowest level
      s.party[low].dead = true; s.party[low].hp = 0;
      const r2 = DD.Run.recruit('rt_f', low);
      t.eq(r2.level, Math.min.apply(null, s.party.filter(function (h, i) { return i !== low && !h.dead; }).map(function (h) { return h.level; })), 'the dead hero\'s replacement joins at the lowest living level');
      // the rotation carries on fairly through more fights (rows 0-5 of the act map)
      for (let k = 0; k < 6; k++) {
        const n = DD.Run.availableNodes()[0];
        n.type = 'combat'; n.encounterId = 'rt_enc_a1_normal_' + ((k % 6) + 1);
        DD.Run.travel(n.id);
        eng.end('victory');
        t.ok(spread() <= 1, 'fight ' + (k + 1) + ': levels ' + levels());
        DD.Run.next();
      }
      // a party where one hero is alone at the bottom: no roll, that hero levels
      s.party.forEach(function (h) { h.level = 4; });
      s.party[2].level = 3;
      const solo = DD.Run.levelUp();
      t.ok(solo.heroIdx === 2 && solo.die === 1, 'only one hero behind: they level, no roll');
    });
  });

  T.suite('run: v2 leveling — XP-era saves load cleanly (XP dropped, levels and pending choices kept)', function (t) {
    return sandbox(t, function (eng) {
      newRun(PARTY, 'xp-era');
      travelTo('combat');
      eng.end('victory');
      DD.Run.save();
      // turn the save into an XP-era one: uneven levels, xp everywhere, an XP rewards screen pending
      const raw = JSON.parse(JSON.stringify(DD.Storage.get(DD.Run.SAVE_KEY)));
      [4, 3, 3, 2].forEach(function (lv, i) { raw.party[i].level = lv; raw.party[i].xp = [0, 0, 10, 25, 45][lv] + 3; raw.party[i].pendingLevels = 0; raw.party[i].levelChoices = null; });
      raw.party[0].pendingLevels = 2;
      raw.pending.data.xp = 12;
      raw.pending.data.xpByHero = { 0: 12, 1: 6, 2: 12, 3: 12 };
      raw.pending.data.levelsGained = { 0: 1 };
      delete raw.pending.data.levelUps;
      raw.pending.data.leveled = [0, 0];
      delete raw.stats.levelUps;
      DD.Storage.set(DD.Run.SAVE_KEY, raw);
      DD.Run.state = null;
      t.ok(DD.Run.hasSave() && DD.Run.load(), 'an XP-era save loads');
      const s = S();
      t.ok(s.party.every(function (h) { return !('xp' in h); }), 'XP fields dropped from the heroes');
      t.eq(levels(), '4,3,3,2', 'levels kept');
      t.eq(s.party[0].pendingLevels, 2, 'pending level-up choices kept');
      const d = DD.Run.rewards();
      t.ok(d && !('xp' in d) && !('xpByHero' in d) && !('levelsGained' in d) && Array.isArray(d.levelUps) && d.levelUps.length === 0, 'XP fields dropped from the pending rewards screen (levelUps: [])');
      t.eq(s.stats.levelUps, 0, 'stats.levelUps filled in');
      t.eq(DD.Run.resume(), 'rewards', 'resume shows the rewards step');
      DD.Run.skipRewards();
      t.eq(DD.Run.next(), 'levelup', 'the waiting choices are offered');
      let guard = 0;
      while (DD.Run.levelQueue().length && guard++ < 10) DD.Run.applyLevelChoice(DD.Run.levelQueue()[0], 2, -1);
      t.eq(DD.Run.levelQueue().length, 0, 'and can be made');
      // the uneven old levels even out: the rotation levels the lowest first
      const n = DD.Run.availableNodes()[0];
      n.type = 'combat'; n.encounterId = 'rt_enc_a1_normal_2';
      DD.Run.travel(n.id);
      eng.end('victory');
      t.eq(DD.Run.rewards().levelUps[0].heroIdx, 3, 'the next fight levels the level-2 hero (the only one behind)');
      t.eq(levels(), '4,3,3,3', 'catching up');
      DD.Run.save();
      DD.Run.state = null;
      DD.Run.load();
      t.ok(S().party.every(function (h) { return !('xp' in h); }) && !('xp' in DD.Storage.get(DD.Run.SAVE_KEY).party[0]), 'nothing XP-shaped is written back');
    });
  });

  T.suite('run: v2 leveling — events: api.levelUp, XP aliases once per choice, named heroes, the fallback event', function (t) {
    return sandbox(t, function () {
      DD.registerEvent({
        id: 'rt_ev_lv', acts: [1, 2, 3], title: 'Level Test', text: 'Levels.',
        choices: [
          { label: 'Lots of XP', resolve: function (api) { api.xp(5); api.xp(50); DD.Run.grantHeroXp(0, 10); DD.Run.grantXp(30); return 'XP everywhere.'; } },
          { label: 'Two level-ups', resolve: function (api) { const a = api.levelUp(), b = api.levelUp(); return a.name + ' and ' + b.name + ' level up.'; } },
          { label: 'Named', resolve: function (api) { api.xp(15, 3); return 'Hero D studies.'; } },
          { label: 'Named alias', resolve: function () { DD.Run.grantHeroXp(1, 25); DD.Run.grantHeroXp(2, 25); return 'Hero B studies.'; } },
        ],
      });
      const total = function () { return S().party.reduce(function (a, h) { return a + h.level; }, 0); };
      newRun(PARTY, 'ev-lv');
      DD.Run.openEvent('rt_ev_lv', null, { noShow: true });
      DD.Run.chooseEventOption(0);
      t.eq(total(), 5, 'four XP calls in one choice: one level-up');
      t.ok(S().party.filter(function (h) { return h.level === 2; }).length === 1, 'through the rotation (one hero at 2: ' + levels() + ')');
      DD.Run.leaveNode();
      DD.Run.openEvent('rt_ev_lv', null, { noShow: true });
      const before = levels();
      DD.Run.chooseEventOption(1);
      t.eq(total(), 7, 'api.levelUp() twice: two level-ups (each call counts)');
      t.ok(spread() <= 1, 'both through the rotation: still within one level (' + before + ' → ' + levels() + ')');
      DD.Run.leaveNode();
      const d0 = S().party[3].level;
      DD.Run.openEvent('rt_ev_lv', null, { noShow: true });
      DD.Run.chooseEventOption(2);
      t.eq(S().party[3].level, d0 + 1, 'api.xp(n, idx): that hero levels up');
      DD.Run.leaveNode();
      const b0 = S().party[1].level, c0 = S().party[2].level;
      DD.Run.openEvent('rt_ev_lv', null, { noShow: true });
      DD.Run.chooseEventOption(3);
      t.ok(S().party[1].level === b0 + 1 && S().party[2].level === c0, 'grantHeroXp twice in one choice: only the first hero levels (once per choice)');
      DD.Run.leaveNode();
      t.eq(DD.Run.grantHeroXp(2, 25), 1, 'outside an event choice the alias works again');
      // resolveEvent reports the pending choices of the leveled heroes
      newRun(PARTY, 'ev-lv2');
      const r = DD.Run.resolveEvent('rt_ev_lv', 2);
      t.ok(r && json(r.levels) === json([3]), 'resolveEvent lists the new pending level: ' + json(r && r.levels));
      // the built-in fallback event levels through the rotation and names the hero
      newRun(PARTY, 'ev-fallback');
      DD.Run.openEvent(DD.Run.FALLBACK_EVENT, null, { noShow: true });
      const ev = DD.Run.currentEvent();
      t.ok(!/XP/.test(ev.choices[1].hint) && /levels up/.test(ev.choices[1].hint), 'fallback hint without XP: ' + ev.choices[1].hint);
      const out = DD.Run.chooseEventOption(1);
      const up = S().party.filter(function (h) { return h.level === 2; });
      t.ok(up.length === 1 && out.text.indexOf(DD.Run.heroName(up[0])) >= 0, 'the outcome names the hero who leveled: ' + out.text);
      t.ok(!/XP/.test(out.text), 'and mentions no XP');
    });
  });

  // ---- travel & combat -------------------------------------------------------------------------------------------
  T.suite('run: travel through every node type', function (t) {
    return sandbox(t, function (eng) {
      ['combat', 'elite', 'boss'].forEach(function (type) {
        newRun(PARTY, 'travel-' + type);
        const before = eng.starts.length;
        const r = travelTo(type);
        t.ok(r.ok, type + ': travel ok');
        const p = S().pending;
        t.ok(p && p.type === 'combat' && p.data.kind === (type === 'combat' ? 'normal' : type), type + ': pending combat of the right kind');
        t.eq(eng.starts.length, before + 1, type + ': engine started');
        const L = eng.last();
        t.ok(L.opts.run === S() && typeof L.opts.onEnd === 'function', type + ': Combat.start gets { run, onEnd }');
        t.eq(L.setup.heroes.length, 4, type + ': all living heroes deployed');
        t.eq(eng.builds[eng.builds.length - 1].opts.difficulty, 'normal', type + ': difficulty passed to Encounter.build');
        t.eq(DD.Run.availableNodes().length, 0, type + ': no travel while fighting');
        t.ok(!DD.Run.travel(S().map.start[1]), type + ': travel refused mid-fight');
        t.ok(DD.Run.inCombat() && DD.Run.currentCombat() === L.state, type + ': combat tracked');
        eng.end('victory');
        t.eq(S().pending.type, 'rewards', type + ': rewards after victory');
        t.ok(r.node.done && r.node.result === 'victory', type + ': node done');
        t.eq(S().act, 1, type + ': a boss fight off the boss node does not clear the act');
        t.ok(DD.Run.availableNodes().length > 0, type + ': next row reachable');
        checkInvariants(t, type);
      });
      newRun(PARTY, 'travel-event');
      t.ok(travelTo('event').ok, 'event: travel ok');
      t.ok(S().pending.type === 'event' && S().pending.data.eventId === 'rt_ev_gold', 'event pending');
      t.ok(S().seenEvents.indexOf('rt_ev_gold') >= 0 && DD.Meta.isSeen('events', 'rt_ev_gold'), 'event marked seen');
      const ev = DD.Run.currentEvent();
      t.ok(ev && ev.title === 'Gold Test' && ev.text === 'A test about gold.' && ev.choices.length === 2, 'currentEvent describes it');
      const out = DD.Run.chooseEventOption(0);
      t.ok(out && out.text === 'Took 25 gold.' && S().gold === 85, 'event choice resolved');
      t.eq(DD.Run.chooseEventOption(1), null, 'an event resolves once');
      t.eq(DD.Run.next(), 'map', 'next() goes back to the map');
      t.eq(S().pending, null, 'event step closed');
      newRun(PARTY, 'travel-shop');
      t.ok(travelTo('shop').ok, 'shop: travel ok');
      const shop = DD.Run.shop();
      t.ok(shop && shop.items.length === 3 && shop.tomes.length === 2 && shop.consumables.length === 2 && shop.services.length === 2, 'shop stocked 3/2/2 + 2 services');
      newRun(PARTY, 'travel-tavern');
      t.ok(travelTo('tavern').ok, 'tavern: travel ok');
      t.ok(DD.Run.tavern() && DD.Run.tavern().used === null, 'tavern pending');
      t.eq(json(DD.Run.tavern().recruits), json(['rt_e']), 'recruits: unlocked heroes not in the party');
      newRun(PARTY, 'travel-treasure');
      t.ok(travelTo('treasure').ok, 'treasure: travel ok');
      const rw = DD.Run.rewards();
      t.ok(rw && rw.source === 'treasure' && rw.choices.length === 3 && rw.gold >= 20, 'treasure rewards pending');
      t.eq(S().gold, 60 + rw.gold, 'treasure gold added');
      t.ok(rw.choices.filter(function (c) { return c.type === 'item'; }).length >= 2, 'treasure offers two items');
      t.ok(!DD.Run.travel('a1_boss'), 'cannot jump to an unreachable node');
      t.ok(!DD.Run.travel('nope'), 'unknown node refused');
      const nextId = DD.Run.availableNodes()[0].id;
      t.ok(DD.Run.travel(DD.Run.availableNodes()[0]), 'travel accepts node objects');
      t.ok(rw.skipped && S().nodeId === nextId, 'travelling on skips untaken treasure');
      checkInvariants(t, 'after travel');
    });
  });

  T.suite('run: finishCombat — victory, downs, scars, deaths, the level-up, gold, stats', function (t) {
    return sandbox(t, function (eng) {
      newRun(PARTY, 'finish');
      const s = S();
      travelTo('combat');
      const gold0 = s.gold;
      eng.end('victory', function (units, st) {
        units[0].hp = 7;
        units[1].hp = 0; units[1].downed = true;
        units.push({ id: 's1', kind: 'summon', side: 'hero', ownerId: 'h0', hp: 3, dead: false });
        units.push({ id: 'e1', kind: 'enemy', side: 'enemy', defId: 'rt_enemy', hp: 0, dead: true });
        st.stats.units = { h0: { kills: 2, dmg: 30 }, h2: { kills: 1, dmg: 12 }, s1: { kills: 1, dmg: 4 } };
      });
      const d = DD.Run.rewards();
      t.ok(Array.isArray(d.levelUps) && d.levelUps.length === 1, 'exactly one level-up for the won fight');
      const lu = d.levelUps[0];
      t.ok(lu.rotation && lu.die === 4 && json(lu.candidates) === json([0, 1, 2, 3]), 'drawn among all four (a downed-but-revived hero still counts): ' + json(lu));
      t.eq(levels().split(',').filter(function (x) { return x === '2'; }).length, 1, 'one hero is level 2 (' + levels() + ')');
      t.eq(s.party[lu.heroIdx].level, 2, 'the drawn hero is the one who leveled');
      t.eq(s.party[0].hp, 7 + (lu.heroIdx === 0 ? 4 : 0), 'HP written back (+4 growth if hero 0 leveled)');
      t.ok(s.party[1].hp === 1 + (lu.heroIdx === 1 ? 4 : 0) && s.party[1].downs === 1, 'downed hero revives at 1 HP, downs++');
      t.eq(s.party[1].scars.length, 1, 'downed hero got a scar');
      t.ok(DD.getScar(s.party[1].scars[0]), 'a registered scar');
      t.ok(s.party.every(function (h) { return !('xp' in h); }), 'no XP anywhere');
      t.eq(s.party[0].kills, 3, 'hero kills include its summons');
      t.eq(s.stats.kills, 4, 'run kills');
      t.eq(s.stats.damage, 46, 'run damage');
      t.eq(s.stats.downs, 1, 'run downs');
      t.eq(s.stats.combats, 1, 'combats counted');
      t.eq(s.stats.levelUps, 1, 'level-ups counted');
      t.ok(d.gold >= 12 && d.gold <= 20 && s.gold === gold0 + d.gold, 'act 1 normal gold 12-20');
      t.eq(d.choices.length, 3, '3 reward choices');
      t.ok(d.choices.every(function (c) { return c.rid && c.rid.indexOf(d.id + ':') === 0; }), 'choices carry rids');
      t.eq(json(d.downed), json([1]), 'downed listed');
      t.eq(d.scars.length, 1, 'scars listed');
      t.ok(!('xp' in d) && !('xpByHero' in d), 'rewards data carries no XP');
      t.eq(json(d.leveled), json([lu.heroIdx]), 'leveled: every pending level-up (just the drawn hero)');
      t.eq(d.next, undefined, 'no next override: the rewards screen continues with DD.Run.next()');
      t.eq(DD.Run.finishCombat('victory', eng.last().state), null, 'finishCombat is idempotent');
      t.ok(DD.Meta.isSeen('enemies', 'rt_enemy') === false, 'unregistered enemies are not added to the codex');
      checkInvariants(t, 'after victory');
      // third down kills
      DD.Run.next();
      s.party[2].downs = 2;
      const node = DD.Run.availableNodes()[0];
      node.type = 'combat'; node.encounterId = 'rt_enc_a1_normal_2';
      DD.Run.travel(node.id);
      const lv2 = s.party[2].level;
      eng.end('victory', function (units) { units[2].hp = 0; units[2].downed = true; });
      t.ok(s.party[2].dead && s.party[2].hp === 0, 'third down: written out of the campaign');
      t.ok(s.fallen.indexOf('rt_c') >= 0 && s.stats.deaths === 1, 'fallen + deaths stat');
      const lu2 = DD.Run.rewards().levelUps[0];
      t.ok(lu2 && lu2.heroIdx !== 2 && lu2.candidates.indexOf(2) < 0 && s.party[2].level === lv2, 'the fallen hero is skipped: the level-up goes to a living one');
      t.eq(json(DD.Run.rewards().deaths), json([2]), 'deaths listed');
      checkInvariants(t, 'after a death');
      // dead heroes sit out the next fight; a null combat state is tolerated
      DD.Run.next();
      const n2 = DD.Run.availableNodes()[0];
      n2.type = 'combat'; n2.encounterId = 'rt_enc_a1_normal_3';
      DD.Run.travel(n2.id);
      t.eq(eng.last().setup.heroes.length, 3, 'dead heroes are not deployed');
      const hp = s.party.map(function (h) { return { hp: h.hp, level: h.level }; });
      t.ok(DD.Run.finishCombat('victory', null).outcome === 'rewards', 'finishCombat without a combat state');
      t.ok(s.party.every(function (h, i) { return h.dead || h.hp - 4 * (h.level - hp[i].level) === hp[i].hp; }), 'no HP changes without a combat state (besides level-up growth)');
      eng.end('victory');
      t.eq(DD.Run.rewards().id, 'rw3', 'a late onEnd from a finished fight is ignored');
      // defeat
      DD.Run.next();
      const n3 = DD.Run.availableNodes()[0];
      n3.type = 'combat'; n3.encounterId = 'rt_enc_a1_normal_4';
      DD.Run.travel(n3.id);
      const runs = DD.Meta.data.stats.runs;
      eng.end('defeat', function (units) { units.forEach(function (u) { u.hp = 0; u.downed = true; }); });
      t.eq(s.over, 'defeat', 'TPK -> game over');
      t.ok(s.summary && s.summary.result === 'defeat' && s.summary.killedBy === 'Test normal 1.4', 'summary with killedBy');
      t.eq(DD.Meta.data.stats.runs, runs + 1, 'run recorded in meta');
      t.eq(DD.Meta.data.history[0].result, 'defeat', 'history entry');
      t.ok(!DD.Run.hasSave(), 'save deleted');
      t.eq(DD.Run.finishCombat('victory', null), null, 'nothing to finish after game over');
      t.eq(DD.Run.availableNodes().length, 0, 'no travel after game over');
      t.eq(DD.Run.next(), 'gameover', 'next() -> gameover');
    });
  });

  T.suite('run: rewards — loot tables, guarantees, odds, fallbacks', function (t) {
    return sandbox(t, function () {
      newRun();
      const s = S();
      let ok = true;
      for (let i = 0; i < 200; i++) {
        const kind = ['normal', 'elite', 'boss'][i % 3], act = (Math.floor(i / 3) % 3) + 1;
        const r = DD.Rewards.combat(kind, act, DD.RNG('loot' + i), s);
        const types = r.choices.map(function (c) { return c.type; });
        const lo = kind === 'boss' ? 80 : kind === 'elite' ? 35 : 12 + 6 * (act - 1);
        const hi = kind === 'boss' ? 100 : kind === 'elite' ? 50 : 20 + 6 * (act - 1);
        if (r.choices.length !== 3 || types.some(function (x, k) { return types.indexOf(x) !== k; })) { ok = false; t.log('bad choices ' + json(types)); }
        if (r.gold < lo || r.gold > hi) { ok = false; t.log(kind + ' act ' + act + ' gold ' + r.gold); }
        if (r.levelUpCount !== 1 || 'xp' in r) ok = false;
        if (!r.choices.every(function (c) { return typeof c.label === 'string' && c.label && typeof c.desc === 'string'; })) ok = false;
        if (kind === 'elite' && !(r.choices[0].type === 'item' && r.choices[0].rarity === 'rare')) { ok = false; t.log('elite without rare'); }
        if (kind === 'boss' && !(r.choices[0].type === 'item' && r.choices[0].rarity === 'legendary')) { ok = false; t.log('boss without legendary'); }
      }
      t.ok(ok, '200 loot rolls: 3 distinct choices, DESIGN gold, one level-up, elite rare, boss legendary');
      t.eq(DD.Rewards.combat('normal', 1, DD.RNG(1), s, { goldMult: 2 }).gold >= 24, true, 'goldMult doubles gold');
      t.eq(DD.Rewards.combat('normal', 1, DD.RNG(1), s, { itemRarity: 'legendary' }).choices[0].rarity, 'legendary', 'encounter itemRarity override');
      const count = function (act) {
        const c = { common: 0, rare: 0, legendary: 0, cursed: 0 };
        const r = DD.RNG('odds' + act);
        for (let i = 0; i < 3000; i++) c[DD.Rewards.rollRarity(act, r)]++;
        return c;
      };
      const c1 = count(1), c3 = count(3);
      t.ok(c3.legendary > c1.legendary * 2 && c3.common < c1.common, 'odds shift toward rare/legendary by act: ' + json(c1) + ' vs ' + json(c3));
      // item picks
      for (let i = 0; i < 50; i++) {
        const id = DD.Rewards.randomItem({ slot: 'armor', rarity: 'rare', run: s }, DD.RNG('ri' + i));
        if (DD.getItem(id).slot !== 'armor') ok = false;
      }
      t.ok(ok, 'randomItem respects slot');
      s.party = s.party.filter(function (h) { return h.id !== 'rt_a'; });
      let heroItem = false;
      for (let i = 0; i < 300; i++) if (DD.Rewards.randomItem({ rarity: 'rare', run: s }, DD.RNG('h' + i)) === 'rt_a_only') heroItem = true;
      t.ok(!heroItem, 'hero-specific items only drop for heroes in the party');
      newRun();
      DD.Run.addItem('rt_w_leg');
      DD.Run.addItem('rt_a_leg');
      t.eq(DD.Rewards.randomItem({ rarity: 'legendary', run: S() }, DD.RNG(5)), 'rt_t_leg', 'prefers items the party does not own');
      t.ok(DD.Rewards.randomItem({ rarity: 'legendary', run: S(), exclude: ['rt_t_leg'] }, DD.RNG(6)) !== 'rt_t_leg', 'exclude is honoured');
      // tomes and upgrades
      const tome = DD.Rewards.skillTome(1, DD.RNG(7), S());
      t.ok(tome && tome.type === 'skill' && tome.heroIdx === 1 && tome.heroId === 'rt_b', 'skill tome for the asked hero');
      t.ok(DD.Run.learnableSkills(1, { generic: true }).indexOf(tome.id) >= 0, 'tome skill is unlearned and socketable');
      const up = DD.Rewards.upgradeOffer(S(), DD.RNG(8));
      t.ok(up && up.type === 'upgrade' && up.level === 2, 'upgrade offer');
      // empty registries -> gold fallbacks, no throws
      const savedItems = DD.defs.items, savedCons = DD.defs.consumables, savedSkills = DD.defs.skills;
      DD.defs.items = {}; DD.defs.consumables = {}; DD.defs.skills = {};
      const e = DD.Rewards.combat('boss', 2, DD.RNG(9), S());
      t.eq(e.choices.length, 3, 'still 3 choices with empty registries');
      t.ok(e.choices.every(function (c) { return c.type === 'gold' || c.type === 'heal'; }), 'gold/heal fallbacks: ' + json(e.choices.map(function (c) { return c.type; })));
      t.eq(DD.Rewards.randomItem({}, DD.RNG(1)), null, 'randomItem -> null');
      t.eq(DD.Rewards.randomConsumable(DD.RNG(1)), null, 'randomConsumable -> null');
      t.eq(DD.Rewards.skillTome(null, DD.RNG(1), S()), null, 'skillTome -> null');
      const inv = DD.Rewards.shopInventory(1, DD.RNG(1), S());
      t.ok(inv.items.length === 0 && inv.tomes.length === 0 && inv.consumables.length === 0 && inv.services.length === 2, 'empty shop still sells services');
      const tr = DD.Rewards.treasure(1, DD.RNG(1), S());
      t.ok(tr.gold > 0 && tr.choices.length === 3, 'treasure with empty registries');
      DD.defs.items = savedItems; DD.defs.consumables = savedCons; DD.defs.skills = savedSkills;
      t.eq(DD.Rewards.price('item', 'rt_priced'), 55, 'item price from def');
      t.eq(DD.Rewards.price('item', 'rt_a_leg'), 150, 'default legendary price');
      t.eq(DD.Rewards.price('tome'), 60, 'tome price');
      t.eq(DD.Rewards.price('scar'), 45, 'scar removal price');
      t.eq(DD.Rewards.price('heal'), 30, 'heal price');
      t.eq(DD.Rewards.price('consumable', 'rt_pot_big'), 35, 'consumable price from def');
    });
  });

  T.suite('run: rewards — applying every reward type, one pick per screen', function (t) {
    return sandbox(t, function (eng) {
      newRun(PARTY, 'apply');
      const s = S();
      const A = DD.Rewards.apply;
      t.ok(A({ type: 'gold', amount: 30 }).ok && s.gold === 90, 'gold');
      s.party[0].hp = 5;
      const healed = A(DD.Rewards.healReward());
      t.ok(healed.ok && s.party[0].hp === 5 + Math.round(24 * 0.3), 'heal 30%');
      const it = A(DD.Rewards.itemReward('rt_w_rare', s));
      t.ok(it.ok && it.equippedTo === 0 && s.party[0].items.weapon === 'rt_w_rare', 'item auto-equipped into an empty slot');
      const cur = A(DD.Rewards.itemReward('rt_t_cursed', s));
      t.ok(cur.ok && cur.equippedTo === -1 && s.inventory.indexOf('rt_t_cursed') >= 0, 'cursed item goes to the bag');
      t.ok(A(DD.Rewards.itemReward('rt_a_only', s)).equippedTo === 0, 'hero item equips on its hero');
      t.ok(!A({ type: 'item', id: 'nope' }).ok, 'missing item rejected');
      ['rt_pot_red', 'rt_pot_big', 'rt_pot_odd'].forEach(function (id) { A(DD.Rewards.consumableReward(id)); });
      const full = A(DD.Rewards.consumableReward('rt_pot_red'));
      t.ok(!full.ok && full.reason === 'full', 'consumable refused when full');
      const tome = { type: 'skill', id: 'rt_b_s3', heroIdx: 1, heroId: 'rt_b' };
      const learned = A(tome);
      t.ok(learned.ok && learned.learned && s.party[1].skills.length === 3, 'tome learned into a free socket');
      t.eq(A(tome).reason, 'known', 'known skill rejected');
      DD.Run.learnSkill(1, 'rt_b_s4');
      const q = A({ type: 'skill', id: 'rt_b_s5', heroIdx: 1, heroId: 'rt_b' });
      t.ok(q.ok && q.queued, 'full sockets: learn queued');
      t.eq(DD.Run.pendingLearns().length, 1, 'pendingLearns lists it');
      t.ok(DD.Run.hasPendingChoices(), 'hasPendingChoices');
      t.ok(DD.Run.resolveLearn(0).needsReplace, 'resolveLearn needs a socket');
      t.ok(DD.Run.resolveLearn(0, 7).needsReplace, 'invalid socket rejected');
      const res = DD.Run.resolveLearn(0, 0);
      t.ok(res.ok && s.party[1].skills[0].id === 'rt_b_s5' && DD.Run.pendingLearns().length === 0, 'resolveLearn replaces');
      const rep = A({ type: 'skill', id: 'rt_b_s6', heroId: 'rt_b', heroIdx: 1 }, { replaceIdx: 2 });
      t.ok(rep.ok && rep.replaced && s.party[1].skills[2].id === 'rt_b_s6', 'replaceIdx replaces directly');
      const skip = A({ type: 'skill', id: 'rt_gen1', heroId: 'rt_b' }, { replaceIdx: -1 });
      t.ok(skip.ok && skip.skipped && s.party[1].skills.every(function (k) { return k.id !== 'rt_gen1'; }), 'replaceIdx -1 skips');
      const upg = A({ type: 'upgrade', id: 'rt_c_s1', heroIdx: 2, heroId: 'rt_c' });
      t.ok(upg.ok && s.party[2].skills[0].level === 2, 'upgrade');
      s.party[2].skills[0].level = 3;
      t.eq(A({ type: 'upgrade', id: 'rt_c_s1', heroId: 'rt_c' }).reason, 'maxed', 'maxed upgrade rejected');
      t.ok(!A({ type: 'mystery' }).ok && !A(null).ok, 'unknown rewards rejected');
      // one pick per reward screen
      travelTo('combat');
      eng.end('victory');
      const d = DD.Run.rewards();
      const goldIdx = d.choices.findIndex(function (c) { return c.type !== 'consumable'; });
      const r1 = DD.Run.takeReward(goldIdx);
      t.ok(r1.ok && d.taken === goldIdx, 'takeReward marks the pick');
      const other = (goldIdx + 1) % 3;
      t.eq(DD.Run.takeReward(other).reason, 'taken', 'a second pick is refused');
      t.eq(A(d.choices[other]).reason, 'taken', 'also through DD.Rewards.apply');
      t.ok(DD.Run.isRewardTaken(d.choices[other]), 'isRewardTaken');
      DD.Run.next();
      t.ok(DD.Run.isRewardTaken(d.choices[other]), 'rewards of a closed screen stay taken');
      t.ok(!DD.Run.skipRewards(), 'nothing to skip');
      const n = DD.Run.availableNodes()[0];
      n.type = 'combat'; n.encounterId = 'rt_enc_a1_normal_5';
      DD.Run.travel(n.id);
      eng.end('victory');
      t.ok(DD.Run.skipRewards() && DD.Run.rewards().skipped, 'skipRewards');
      t.eq(DD.Run.takeReward(0).reason, 'taken', 'skipped screens refuse picks');
      t.ok(A({ type: 'gold', amount: 5 }).ok, 'free-standing rewards (no rid) always apply');
    });
  });

  // ---- shop / tavern -----------------------------------------------------------------------------------------------
  T.suite('run: shop — stock, prices, buying, services', function (t) {
    return sandbox(t, function () {
      let ok = true;
      for (let i = 0; i < 60; i++) {
        newRun(PARTY, 'stock' + i);
        const inv = DD.Rewards.shopInventory((i % 3) + 1, DD.RNG('s' + i), S());
        const ids = inv.items.map(function (x) { return x.id; });
        const rar = inv.items.map(function (x) { return x.rarity; });
        if (inv.items.length !== 3 || ids.some(function (id, k) { return ids.indexOf(id) !== k; })) ok = false;
        if (rar.filter(function (r) { return r === 'legendary'; }).length > 1 || rar.filter(function (r) { return r === 'cursed'; }).length > 1) ok = false;
        if (inv.tomes.length !== 2 || inv.tomes[0].id === inv.tomes[1].id || inv.tomes.some(function (x) { return x.price !== 60 || x.heroId !== S().party[x.heroIdx].id; })) ok = false;
        if (inv.consumables.length !== 2 || inv.consumables[0].id === inv.consumables[1].id) ok = false;
        if (inv.items.some(function (x) { return x.price !== DD.getItem(x.id).price || x.sold; })) ok = false;
        if (json(inv.services.map(function (x) { return [x.id, x.price]; })) !== json([['heal', 30], ['scar', 45]])) ok = false;
      }
      t.ok(ok, '60 shops: 3 distinct items (<=1 legendary, <=1 cursed), 2 tomes, 2 consumables, services, def prices');
      newRun(PARTY, 'buy');
      const s = S();
      travelTo('shop');
      const inv = DD.Run.shop();
      s.gold = 1000;
      const item = inv.items[0];
      const r1 = DD.Run.buy('items', 0);
      t.ok(r1.ok && item.sold && s.gold === 1000 - item.price, 'bought an item at its price');
      t.ok(s.inventory.indexOf(item.id) >= 0 || s.party.some(function (h) { return h.items[DD.getItem(item.id).slot] === item.id; }), 'item owned');
      t.eq(DD.Run.buy('items', 0).reason, 'sold', 'sold out');
      t.eq(DD.Run.buy('items', 9).reason, 'invalid', 'invalid index');
      t.eq(DD.Run.buy('act', 0).reason, 'invalid', 'invalid section');
      s.gold = 1;
      t.eq(DD.Run.buy('items', 1).reason, 'gold', 'cannot afford');
      t.ok(!inv.items[1].sold && s.gold === 1, 'nothing taken when broke');
      s.gold = 1000;
      const tome = inv.tomes[0];
      const hi = DD.Run.indexOf(tome.heroId);
      const r2 = DD.Run.buy('tomes', 0);
      t.ok(r2.ok && S().party[hi].skills.some(function (k) { return k.id === tome.id; }), 'tome learned into a free socket');
      const t2 = inv.tomes[1];
      const h2 = DD.Run.indexOf(t2.heroId);
      while (s.party[h2].skills.length < 4) DD.Run.learnSkill(h2, DD.Run.learnableSkills(h2).filter(function (id) { return id !== t2.id; })[0]);
      const r3 = DD.Run.buy('tomes', 1);
      t.ok(r3.ok && DD.Run.pendingLearns().some(function (q) { return q.skillId === t2.id; }), 'full sockets: tome learn queued');
      while (s.consumables.length < s.maxConsumables) DD.Run.addConsumable('rt_pot_red');
      const g = s.gold;
      t.eq(DD.Run.buy('consumables', 0).reason, 'full', 'consumables full');
      t.eq(s.gold, g, 'no gold spent when full');
      s.consumables = [];
      t.ok(DD.Run.buy('consumables', 0).ok && s.consumables.length === 1, 'bought a consumable');
      t.eq(DD.Run.buy('services', 0).reason, 'healthy', 'no heal needed at full HP');
      s.party[0].hp = 3;
      const r4 = DD.Run.shopService('heal');
      t.ok(r4.ok && s.party[0].hp === 3 + Math.round(DD.Run.heroStats(0).maxHp * 0.3), 'heal service: 30%');
      t.eq(DD.Run.shopService('heal').reason, 'sold', 'one heal per visit');
      t.eq(DD.Run.buy('services', 1).reason, 'noScars', 'no scars to remove');
      DD.Run.addScar(2, 'scar_trick_knee');
      DD.Run.addScar(2, 'scar_glass_jaw');
      const r5 = DD.Run.buy('services', 1, { heroIdx: 2, scarId: 'scar_trick_knee' });
      t.ok(r5.ok && json(s.party[2].scars) === json(['scar_glass_jaw']), 'scar removal service');
      t.eq(DD.Run.shopService('nope').reason, 'invalid', 'unknown service');
      t.eq(DD.Run.next(), 'levelup', 'leaving the shop with a queued learn goes to the level-up flow');
      t.eq(S().pending, null, 'shop closed');
      t.eq(DD.Run.buy('items', 1).reason, 'closed', 'no buying after leaving');
    });
  });

  T.suite('run: tavern — rest, train, recruit', function (t) {
    return sandbox(t, function (eng) {
      newRun(PARTY, 'tavern');
      const s = S();
      travelTo('tavern');
      s.party.forEach(function (h) { h.hp = 2; });
      DD.Run.addScar(1, 'scar_glass_jaw');
      DD.Run.addScar(1, 'scar_tinnitus');
      DD.Run.addScar(3, 'scar_trick_knee');
      const rest = DD.Run.tavernRest();
      t.ok(rest.ok, 'rest');
      t.eq(s.party[0].hp, 2 + Math.round(24 * 0.35), 'rest heals 35% max HP');
      t.ok(rest.scar && rest.scar.heroIdx === 1 && s.party[1].scars.length === 1, 'one scar removed from the most scarred hero');
      t.eq(s.party[3].scars.length, 1, 'only one scar removed');
      t.eq(DD.Run.tavernTrain(0, 0).reason, 'used', 'one choice per visit');
      t.eq(DD.Run.tavernRecruit('rt_e', 0).reason, 'used', 'recruit also locked');
      // train
      s.pending.data.used = null;
      t.eq(DD.Run.tavernTrain(0, 7).reason, 'maxed', 'invalid skill');
      t.eq(DD.Run.tavern().used, null, 'a failed train does not use the visit');
      t.ok(DD.Run.tavernTrain(0, 0).ok && s.party[0].skills[0].level === 2, 'train upgrades a skill');
      // recruit at the lowest level of the living heroes who stay (v2), equipment returned
      s.pending.data.used = null;
      DD.Meta.unlock('rt_f');
      t.eq(json(DD.Run.recruitCandidates()), json(['rt_e', 'rt_f']), 'candidates: unlocked, not in the party');
      s.party[0].level = 4; s.party[1].level = 3; s.party[2].level = 1; s.party[3].level = 4;
      t.eq(DD.Run.recruitLevel(2), 3, 'recruitLevel: the lowest of the others (the replaced hero leaves)');
      t.eq(DD.Run.recruitLevel(1), 1, 'replacing someone else: the level-1 hero stays, so level 1');
      DD.Run.addItem('rt_a_common');
      DD.Run.equip(2, 'rt_a_common');
      s.learnQueue.push({ heroId: 'rt_c', skillId: 'rt_c_s3', source: 'tome' });
      const r = DD.Run.tavernRecruit('rt_f', 2);
      t.ok(r.ok && s.party[2].id === 'rt_f', 'recruited into slot 2');
      const rh = s.party[2];
      t.eq(rh.level, 3, 'recruit joins at the living party\'s lowest level');
      t.ok(!('xp' in rh) && rh.pendingLevels === 0, 'no XP, no pending level-ups (auto-built)');
      t.ok(/joins at level 3/.test(r.text), 'the result names the level: ' + r.text);
      t.eq(rh.hp, DD.Run.heroStats(rh).maxHp, 'at full HP');
      t.eq(rh.skills.length, 4, 'auto-built: 4 skills socketed');
      t.ok(s.inventory.indexOf('rt_a_common') >= 0, "the old hero's equipment went back to the bag");
      t.eq(s.learnQueue.length, 0, "the old hero's queued learns were dropped");
      t.eq(json(DD.Run.tavern().recruits), json(['rt_c', 'rt_e']), 'the replaced (living) hero can be recruited again');
      // dead heroes can be replaced; fallen heroes cannot come back; locked heroes cannot join
      s.party[3].dead = true; s.party[3].hp = 0;
      s.fallen.push('rt_d');
      t.eq(DD.Run.recruit('rt_d', 0), null, 'fallen heroes stay gone');
      t.eq(DD.Run.recruit('rt_g', 0), null, 'locked heroes cannot join');
      const r2 = DD.Run.recruit('rt_e', 3);
      t.ok(r2 && s.party[3].id === 'rt_e' && !s.party[3].dead, 'a dead party member is replaced');
      t.eq(DD.Run.recruit('rt_c', 9), null, 'bad slot');
      newRun(['rt_a', 'rt_b'], 'small');
      t.ok(DD.Run.recruit('rt_c') && S().party.length === 3, 'a short party can append');
      t.eq(eng.starts.length, 0, 'no fights in this suite');
      checkInvariants(t, 'tavern');
    });
  });

  // ---- act completion ----------------------------------------------------------------------------------------------
  /** Walk the current act node by node, resolving each step with the fake engine, until the boss is beaten. */
  function walkAct(t, eng, opts) {
    opts = opts || {};
    const startAct = S().act;
    let guard = 0;
    while (S() && !S().over && S().act === startAct && guard++ < 40) {
      const avail = DD.Run.availableNodes();
      if (!avail.length) { t.fail('stuck: nothing reachable on act ' + startAct); return; }
      const node = opts.pick ? opts.pick(avail) : avail[0];
      t.ok(DD.Run.travel(node.id), 'travel to ' + node.id);
      let p = S().pending;
      if (p && p.type === 'event') { DD.Run.chooseEventOption(0); p = S().pending; }
      if (S().queuedCombat) DD.Run.next();
      p = S().pending;
      if (p && p.type === 'combat') {
        eng.end('victory', opts.mutate || null);
        if (S().over) return;
      }
      if (opts.each) opts.each();
      if (S().pending && S().pending.type === 'rewards' && S().pending.data.actClear) return;
      DD.Run.next();
    }
  }

  T.suite('run: act completion — unlocks, heal, next act, final victory', function (t) {
    return sandbox(t, function (eng) {
      newRun(PARTY, 'acts');
      const s = S();
      walkAct(t, eng, { pick: function (avail) { return avail.filter(function (n) { return n.type !== 'boss'; })[0] || avail[0]; } });
      const d = DD.Run.rewards();
      t.ok(d && d.actClear && d.actClear.act === 1 && d.actClear.nextAct === 2, 'boss victory clears act 1');
      t.eq(json(d.actClear.unlocked), json(['rt_f', 'josiah']), 'act 1 clear unlocks heroes');
      t.ok(DD.Meta.isUnlocked('rt_f'), 'unlock persisted in meta');
      t.ok(!d.actClear.victory && d.actClear.healed === 0.5 && typeof d.actClear.text === 'string', 'actClear drives the act-clear interstitial');
      t.ok(d.boss && d.choices[0].type === 'item' && d.choices[0].rarity === 'legendary', 'boss loot offers a legendary');
      t.eq(s.act, 2, 'now in act 2');
      t.ok(s.nodeId === null && s.visited.length === 0 && s.map.act === 2, 'fresh act 2 map');
      t.eq(DD.RunMap.validate(s.map).length, 0, 'act 2 map valid');
      t.eq(DD.Run.completeAct(), null, 'completeAct is idempotent');
      t.eq(s.stats.bosses, 1, 'boss counted');
      t.ok(s.party.every(function (h) { return h.hp === DD.Run.heroStats(h).maxHp; }), 'party at full HP (no damage taken + 50% heal)');
      // act 2 with damage taken: the 50% heal is visible
      walkAct(t, eng, { mutate: function (units) { units.forEach(function (u) { u.hp = 1; }); } });
      t.eq(s.act, 3, 'act 2 cleared');
      t.ok(s.party.every(function (h) {
        const max = DD.Run.heroStats(h).maxHp;
        return h.hp >= Math.min(max, 1 + Math.round(max * 0.5));
      }), '50% heal between acts (heroes left the boss at 1 HP)');
      t.ok(DD.Meta.isUnlocked('rt_g'), 'act 2 unlocks rt_g');
      const runs = DD.Meta.data.stats.runs;
      walkAct(t, eng);
      t.eq(s.over, 'victory', 'act 3 boss -> campaign victory');
      t.eq(s.summary.result, 'victory', 'victory summary');
      t.ok(s.summary.unlocked.indexOf('rt_h') >= 0 && DD.Meta.isUnlocked('rt_h'), 'beating the DM unlocks the act 3 hero');
      t.eq(DD.Meta.data.stats.wins, 1, 'win recorded');
      t.eq(DD.Meta.data.stats.runs, runs + 1, 'run recorded');
      t.eq(DD.Meta.data.stats.bestAct, 3, 'best act 3');
      t.eq(s.stats.actsCleared, 3, 'three acts cleared');
      t.ok(!DD.Run.hasSave(), 'finished runs are not resumable');
      t.eq(DD.Run.next(), 'victory', 'next() -> victory');
      t.eq(DD.Run.completeAct(), null, 'nothing to complete after victory');
    });
  });

  // ---- save / load -------------------------------------------------------------------------------------------------
  T.suite('run: boss unlocks — unlock: { boss } heroes', function (t) {
    return sandbox(t, function (eng) {
      const M = DD.Meta;
      t.ok(M.unlocksForBoss('grimble').indexOf('buga') >= 0, 'Grimble unlocks Mayor Buga (fallback map)');
      t.ok(M.unlocksForBoss('lichtenstein').indexOf('slate') >= 0, 'Lich-tenstein unlocks Slate (fallback map)');
      t.eq(M.unlocksForBoss('rt_enemy').length, 0, 'other bosses unlock nobody');
      t.ok(/Grimble/.test(M.unlockHint('buga')), 'hint names the boss: ' + M.unlockHint('buga'));
      DD.registerHero({ id: 'rt_bosshero', name: 'Boss Hero', stats: { hp: 20, ap: 3, mov: 4 }, sprite: { base: 'humanoid' },
        basic: 'x', signature: 'x', passive: { name: 'P', desc: 'P' }, startingSkills: [], skillPool: [], barks: {},
        unlock: { boss: 'grimble' } });
      t.ok(M.unlocksForBoss('grimble').indexOf('rt_bosshero') >= 0, 'hero defs with unlock.boss are found');
      t.ok(!M.isUnlocked('rt_bosshero') && /Defeat/.test(M.unlockHint('rt_bosshero')), 'locked until the boss falls');
      DD.registerEnemy({ id: 'grimble', name: 'Grimble', act: 1, tier: 'boss', hp: 150, sprite: { base: 'humanoid' }, skills: [] });
      Object.keys(DD.defs.encounters).forEach(function (k) {
        const e = DD.defs.encounters[k];
        if (e.act === 1 && e.kind === 'boss') e.enemies = [{ id: 'grimble', n: 1 }];
      });
      newRun(PARTY, 'boss-unlock');
      walkAct(t, eng, { pick: function (avail) { return avail.filter(function (n) { return n.type !== 'boss'; })[0] || avail[0]; } });
      const d = DD.Run.rewards();
      t.ok(d && d.actClear, 'act 1 boss beaten');
      const un = (d && d.actClear && d.actClear.unlocked) || [];
      t.ok(un.indexOf('rt_bosshero') >= 0 && un.indexOf('buga') >= 0, 'beating Grimble unlocks his heroes: ' + json(un));
      t.ok(M.isUnlocked('rt_bosshero') && M.isUnlocked('buga'), 'boss unlocks persist in meta');
      t.eq(M.unlockForBosses(['grimble']).length, 0, 'boss unlocks happen once');
    });
  });

  T.suite('run: save/load round trip mid-run', function (t) {
    return sandbox(t, function (eng) {
      newRun(PARTY, 'saves');
      const s = S();
      travelTo('combat');
      eng.end('victory', function (units) { units[1].hp = 0; units[1].downed = true; units[0].hp = 9; });
      DD.Run.addItem('rt_t_rare');
      DD.Run.addConsumable('rt_pot_big');
      DD.Run.levelUp(0);
      DD.Run.levelUpChoices(0);
      s.flags.custom = { nested: [1, 2, 3] };
      s.flags.cyclic = { self: null };
      s.flags.cyclic.self = s.flags.cyclic;
      s.flags.fn = function () {};
      t.ok(DD.Run.save(), 'save with junk in flags');
      const snap = JSON.parse(JSON.stringify(DD.Storage.get('run')));
      const expectNext = DD.RNG(s.seed);
      expectNext.setState(snap.rngState);
      const nextVal = expectNext.next();
      DD.Run.state = null;
      t.ok(DD.Run.hasSave(), 'hasSave');
      t.ok(DD.Run.load(), 'load');
      const l = S();
      t.ok(l !== s, 'a fresh object');
      t.eq(l.party[1].downs, 1, 'downs kept');
      t.eq(json(l.party[1].scars), json(s.party[1].scars), 'scars kept');
      t.eq(json(l.party[0].levelChoices), json(s.party[0].levelChoices), 'cached level choices kept');
      t.eq(json(l.inventory), json(s.inventory), 'inventory kept');
      t.eq(json(l.consumables), json(s.consumables), 'consumables kept');
      t.eq(json(l.flags.custom), json({ nested: [1, 2, 3] }), 'flags kept');
      t.ok(l.flags.cyclic && l.flags.cyclic.self === undefined && l.flags.fn === undefined, 'cycles and functions dropped from the save');
      t.eq(json(l.map), json(s.map), 'map kept');
      t.eq(l.pending.type, 'rewards', 'pending rewards kept');
      t.eq(DD.Run.rng().next(), nextVal, 'RNG continues where the save left it');
      t.ok(DD.Run.takeReward(l.pending.data.choices.findIndex(function (c) { return c.type !== 'consumable'; })).ok, 'a resumed reward can be taken');
      t.eq(DD.Run.resume(), 'levelup', 'resume -> level-up (pending choices)');
      // a fight interrupted by a reload restarts
      DD.Run.next();
      const node = DD.Run.availableNodes()[0];
      node.type = 'combat'; node.encounterId = 'rt_enc_a1_normal_6';
      DD.Run.travel(node.id);
      const seed = S().pending.data.seed;
      const starts = eng.starts.length;
      S().gold = 9999;   // mid-fight changes are not saved
      DD.Run.state = null;
      t.ok(DD.Run.load(), 'load mid-fight save');
      t.ok(S().gold !== 9999, 'the save is from the start of the fight');
      t.eq(S().pending.type, 'combat', 'combat pending after load');
      t.ok(!DD.Run.inCombat(), 'not running yet');
      t.eq(DD.Run.resume(), 'combat', 'resume relaunches the fight');
      t.eq(eng.starts.length, starts + 1, 'engine restarted');
      t.eq(eng.last().opts.seed, seed, 'same combat seed');
      t.eq(eng.last().setup.encounter.id, 'rt_enc_a1_normal_6', 'same encounter');
      eng.end('victory');
      t.eq(S().pending.type, 'rewards', 'the restarted fight finishes normally');
      // bad saves
      const good = DD.Storage.get('run');
      DD.Storage.set('run', Object.assign({}, good, { version: 99 }));
      t.ok(!DD.Run.hasSave() && !DD.Run.load(), 'version mismatch rejected');
      DD.Storage.set('run', 'garbage');
      t.ok(!DD.Run.load(), 'garbage rejected');
      DD.Storage.set('run', Object.assign({}, good, { over: 'defeat' }));
      t.ok(!DD.Run.load(), 'finished runs rejected');
      const old = JSON.parse(JSON.stringify(good));
      delete old.learnQueue; delete old.fallen; delete old.fought; delete old.stats; delete old.party[0].perks; delete old.party[0].pendingLevels;
      old.party[1].hp = 9999;
      DD.Storage.set('run', old);
      t.ok(DD.Run.load(), 'older saves load');
      t.ok(Array.isArray(S().learnQueue) && Array.isArray(S().fallen) && S().stats.combats === 0, 'missing fields filled');
      t.eq(S().party[1].hp, DD.Run.heroStats(1).maxHp, 'out-of-range HP clamped');
      t.ok(S().stats.levelUps === 0, 'stats.levelUps filled in');
      DD.Run.clear();
      t.ok(!DD.Run.hasSave() && S() === null, 'clear removes the run');
      newRun(PARTY, 'abandon');
      const runs = DD.Meta.data.stats.runs;
      const sum = DD.Run.abandon();
      t.ok(sum && sum.result === 'abandoned' && DD.Meta.data.stats.runs === runs + 1, 'abandon records the run');
      t.ok(!DD.Run.hasSave() && S() === null, 'abandon clears it');
      t.eq(DD.Run.resume(), 'title', 'resume with nothing saved -> title');
    });
  });

  // ---- events ------------------------------------------------------------------------------------------------------
  T.suite('run: event API — every method against a test run', function (t) {
    return sandbox(t, function (eng) {
      newRun(PARTY, 'api');
      const s = S();
      const api = DD.Run.eventApi();
      t.eq(api.gold(), 60, 'gold() reads');
      t.eq(api.gold(15), 15, 'gold(+n)');
      t.eq(api.gold(-1000), -75, 'gold(-n) clamps at 0');
      s.gold = 50;
      s.party.forEach(function (h) { h.hp = 4; });
      t.eq(api.heal(0.5, 0), 12, 'heal(fraction, idx)');
      t.eq(api.heal(5, 1), 5, 'heal(n, idx)');
      t.ok(api.heal(1) > 0 && s.party.every(function (h) { return h.hp === DD.Run.heroStats(h).maxHp; }), 'heal(1) = full party heal');
      t.eq(api.damage(1000, 2), DD.Run.heroStats(2).maxHp - 1, 'damage never kills');
      t.eq(s.party[2].hp, 1, 'left at 1 HP');
      t.eq(api.damage(0.5, 3), Math.round(DD.Run.heroStats(3).maxHp * 0.5), 'damage(fraction)');
      t.ok(api.damage(2) > 0, 'damage(n) hits the whole party');
      t.eq(api.damage(5, 9), 0, 'bad index is ignored');
      const rare = api.giveItem({ rarity: 'rare' });
      t.ok(rare && DD.getItem(rare).rarity === 'rare', 'giveItem({ rarity })');
      t.eq(api.giveItem({ id: 'rt_t_leg' }), 'rt_t_leg', 'giveItem({ id })');
      t.eq(api.giveItem('rt_w_leg'), 'rt_w_leg', 'giveItem(id string)');
      const slot = api.giveItem({ slot: 'armor' });
      t.eq(DD.getItem(slot).slot, 'armor', 'giveItem({ slot })');
      const c = api.giveConsumable();
      t.ok(c && s.consumables.indexOf(c) >= 0, 'giveConsumable()');
      t.eq(api.giveConsumable('rt_pot_big'), 'rt_pot_big', 'giveConsumable(id)');
      const sk = api.giveSkill();
      t.ok(sk && s.party.some(function (h) { return h.skills.some(function (k) { return k.id === sk; }); }), 'giveSkill() learns a skill');
      const gen = DD.Run.learnableSkills(1, { generic: true }).filter(function (id) { return DD.getSkill(id).owner === 'generic'; })[0];
      t.eq(api.giveSkill(1, gen), gen, 'giveSkill(idx, id)');
      while (s.party[1].skills.length < 4) DD.Run.learnSkill(1, DD.Run.learnableSkills(1)[0]);
      const extra = DD.Run.learnableSkills(1)[0];
      t.eq(api.giveSkill(1, extra), extra, 'giveSkill on a full hero...');
      t.ok(DD.Run.pendingLearns().some(function (q) { return q.skillId === extra && q.heroIdx === 1; }), '...queues the replace-or-skip flow');
      const up = api.upgradeSkill(0);
      t.ok(up && s.party[0].skills.some(function (k) { return k.id === up && k.level === 2; }), 'upgradeSkill(idx)');
      t.ok(api.upgradeSkill() !== null, 'upgradeSkill() random hero');
      const lv0 = levels();
      const x1 = api.xp(10);
      t.ok(x1.length === 1 && s.party[x1[0]].level === 2, 'xp(n) (compat) = one level-up through the rotation: ' + json(x1));
      t.eq(json(api.xp(10)), '[]', '... once per choice: a second xp() on the same api does nothing');
      t.eq(levels().split(',').reduce(function (a, v) { return a + +v; }, 0), lv0.split(',').reduce(function (a, v) { return a + +v; }, 0) + 1, 'one level in total');
      const lu = api.levelUp();
      t.ok(lu && lu.rotation && lu.heroIdx !== x1[0] && lu.candidates.indexOf(x1[0]) < 0, 'levelUp() = the next hero in the rotation');
      const named = api.levelUp(3);
      t.ok(named && named.heroIdx === 3 && !named.rotation, 'levelUp(idx) = that hero');
      t.eq(api.levelUp(9), null, 'levelUp(bad idx) = nobody');
      const scar = api.addScar(3);
      t.ok(scar && s.party[3].scars.indexOf(scar) >= 0, 'addScar(idx)');
      t.ok(api.addScar() !== null, 'addScar() random hero');
      const had = s.party[3].scars.slice();
      const removed = api.removeScar(3);
      t.ok(had.indexOf(removed) >= 0 && s.party[3].scars.length === had.length - 1, 'removeScar(idx)');
      t.ok(api.removeScar() !== null || s.party.every(function (h) { return !h.scars.length; }), 'removeScar() picks a scarred hero');
      t.ok(api.hasHero('rt_b') && !api.hasHero('rt_z'), 'hasHero');
      t.eq(api.heroIdx('rt_c'), 2, 'heroIdx');
      t.eq(api.heroIdx('rt_z'), -1, 'heroIdx missing');
      s.party[2].dead = true; s.party[2].hp = 0;
      t.ok(!api.hasHero('rt_c') && api.heroIdx('rt_c') === -1, 'dead heroes do not count');
      for (let i = 0; i < 30; i++) if (api.randomHeroIdx() === 2) t.fail('randomHeroIdx picked a dead hero');
      const deadScars = s.party[2].scars.length;
      const sc2 = api.addScar(2);
      t.ok(s.party[2].scars.length === deadScars && sc2 && s.party.some(function (h, i) { return i !== 2 && h.scars.indexOf(sc2) >= 0; }), 'addScar on a dead hero goes to a living one');
      t.ok(api.party === s.party, 'api.party');
      t.ok(api.rng && typeof api.rng.next === 'function' && api.rng === DD.Run.rng(), 'api.rng is the run RNG');
      t.eq(api.heroName(0), 'Hero A', 'heroName');
      t.eq(api.flag('x'), undefined, 'flag read');
      t.eq(api.flag('x', 3), 3, 'flag write');
      t.eq(s.flags.x, 3, 'flag stored on the run');
      t.eq(api.act, 1, 'api.act');
      t.ok(api.combat('rt_enc_a1_normal_2') && s.queuedCombat.id === 'rt_enc_a1_normal_2', 'combat(id) queues a fight');
      t.ok(api.combat({ act: 2, kind: 'elite' }) && s.queuedCombat.kind === 'elite' && s.queuedCombat.act === 2 && s.queuedCombat.id === null, 'combat({ act, kind })');
      s.queuedCombat = null;
      // full event flow: { text, combat } return -> fight after the event
      s.party[2].dead = false; s.party[2].hp = 5;
      DD.Run.openEvent('rt_ev_fight', null, { noShow: true });
      const out = DD.Run.chooseEventOption(0);
      t.ok(out.text === 'Ambush!' && out.combat && out.combat.kind === 'elite', 'resolve returned a fight');
      const starts = eng.starts.length;
      t.eq(DD.Run.next(), 'combat', 'next() starts the queued fight');
      t.eq(eng.starts.length, starts + 1, 'fight started');
      t.ok(S().pending.data.fromEvent && S().pending.data.kind === 'elite', 'event fight is an elite');
      t.ok(DD.getEncounter(S().pending.data.encounterId).act === 2 || DD.getEncounter(S().pending.data.encounterId).act === 1, 'encounter from the requested act');
      eng.end('victory');
      t.ok(DD.Run.rewards() && DD.Run.rewards().kind === 'elite', 'elite rewards after the event fight');
      // resolveEvent adapter: learns that need a replace are handed to the event screen
      DD.Run.next();
      s.party.forEach(function (h, i) { while (h.skills.length < 4 && DD.Run.learnableSkills(i).length) DD.Run.learnSkill(i, DD.Run.learnableSkills(i)[0]); });
      s.learnQueue = [];
      const r = DD.Run.resolveEvent('rt_ev_loot', 1);
      t.ok(r && r.text === 'Learning.', 'resolveEvent opens + resolves');
      t.ok(Array.isArray(r.learn) && r.learn.length === 1 && r.learn[0].heroIdx === 0, 'queued learn handed over');
      t.eq(DD.Run.pendingLearns().length, 0, 'and removed from the queue');
      t.ok(Array.isArray(r.levels), 'pending level-ups listed');
      t.ok(DD.Run.finishEvent() && S().pending === null, 'finishEvent closes the step');
      t.ok(!DD.Run.leaveNode(), 'nothing left to close');
      t.eq(DD.Run.resolveEvent('nope', 0), null, 'unknown event');
      t.eq(DD.Run.currentEvent(), null, 'no current event');
    });
  });

  T.suite('run: event API — xp(n, heroIdx), giveItem({ heroIdx }), addScar / removeScar(idx, scarId)', function (t) {
    return sandbox(t, function () {
      newRun(PARTY, 'api2');
      const s = S();
      const api = DD.Run.eventApi();
      // xp for one hero (compat): that hero levels up, once per choice
      t.eq(json(api.xp(12, 2)), json([2]), 'xp(n, idx) levels only that hero');
      t.eq(levels(), '1,1,2,1', 'only hero 2 leveled');
      t.eq(json(api.xp(1, 1)), json([]), 'the same choice (api) levels up only once');
      t.eq(levels(), '1,1,2,1', '... so hero 1 stays');
      s.party[3].dead = true; s.party[3].hp = 0;
      const api2 = DD.Run.eventApi();
      t.eq(json(api2.xp(50, 3)), json([]), 'a dead hero gets nothing');
      t.eq(s.party[3].level, 1, 'dead hero level unchanged');
      t.eq(json(api2.xp(0)), json([]), 'xp(0) does nothing (and does not use up the choice)');
      const x = api2.xp(5);
      t.ok(x.length === 1 && x[0] !== 3 && x[0] !== 2, 'xp(n) goes through the rotation and skips the dead: ' + json(x));
      s.party[3].dead = false; s.party[3].hp = 5;
      // giveItem prefers a wearer
      s.party.forEach(function (h) { h.items = { weapon: null, armor: null, trinket: null }; });
      t.eq(api.giveItem({ id: 'rt_w_rare', heroIdx: 2 }), 'rt_w_rare', 'giveItem({ id, heroIdx })');
      t.eq(s.party[2].items.weapon, 'rt_w_rare', 'equipped on the preferred hero');
      t.eq(api.giveItem({ id: 'rt_w_leg', heroIdx: 2 }), 'rt_w_leg', 'slot taken on the preferred hero...');
      t.ok(s.party[2].items.weapon === 'rt_w_rare' && s.party.some(function (h, i) { return i !== 2 && h.items.weapon === 'rt_w_leg'; }), '... so someone with room wears it');
      let onlyA = 0;
      for (let i = 0; i < 30; i++) {
        const id = api.giveItem({ rarity: 'rare', slot: 'trinket', heroIdx: 1 });
        if (id === 'rt_a_only') onlyA++;
      }
      t.eq(onlyA, 0, 'a random item for hero 1 is never another hero\'s restricted item');
      // scars by id
      s.party.forEach(function (h) { h.scars = []; });
      const ids = Object.keys(DD.defs.scars);
      t.ok(ids.length >= 2, 'scars registered');
      t.eq(api.addScar(1, ids[0]), ids[0], 'addScar(idx, scarId) gives that scar');
      t.eq(json(s.party[1].scars), json([ids[0]]), 'on that hero');
      t.eq(api.addScar(1, ids[0]), null, 'not twice');
      s.party[0].dead = true; s.party[0].hp = 0;
      const to = api.addScar(0, ids[1]);
      t.ok(to === ids[1] && s.party[0].scars.length === 0 && s.party.some(function (h) { return h.scars.indexOf(ids[1]) >= 0; }), 'a dead hero\'s scar goes to a living one');
      s.party[0].dead = false; s.party[0].hp = 5;
      api.addScar(2, ids[1] === ids[0] ? ids[1] : ids[0]);
      const before = s.party[2].scars.slice();
      t.eq(api.removeScar(2, ids[0]), before.indexOf(ids[0]) >= 0 ? ids[0] : null, 'removeScar(idx, scarId) removes that scar');
      t.ok(s.party[2].scars.indexOf(ids[0]) < 0, 'gone from that hero');
      const holder = s.party.findIndex(function (h) { return h.scars.indexOf(ids[0]) >= 0; });
      t.ok(holder >= 0, 'another hero still has ' + ids[0]);
      t.eq(api.removeScar(3, ids[0]), ids[0], 'asking a hero without it finds a living one who has it');
      t.ok(s.party.every(function (h) { return h.scars.indexOf(ids[0]) < 0; }), 'nobody has it now');
      t.eq(api.removeScar(1, 'no_such_scar'), null, 'an unknown scar id removes nothing');
    });
  });

  T.suite('run: event choices with function labels / hints; narration skips lines with unfilled tokens', function (t) {
    return sandbox(t, function () {
      newRun(PARTY, 'labels');
      DD.registerEvent({
        id: 'rt_ev_fn', acts: [1, 2, 3], title: 'Function Labels', text: 'Labels can be functions.',
        choices: [
          { label: function (run) { return 'Pay ' + run.act * 15 + ' gold'; }, hint: function (run) { return 'Act ' + run.act; }, resolve: function () { return 'Paid.'; } },
          { label: 'Plain', resolve: function () { return 'Plain.'; } },
        ],
      });
      DD.Run.openEvent('rt_ev_fn', null, { noShow: true });
      const ev = DD.Run.currentEvent();
      t.eq(ev.choices[0].label, 'Pay 15 gold', 'label function called with the run');
      t.eq(ev.choices[0].hint, 'Act 1', 'hint function called with the run');
      t.eq(ev.choices[1].hint, '', 'missing hint → ""');
      t.eq(typeof ev.choices[1].label, 'string', 'plain labels stay strings');
      t.eq(DD.Run.chooseEventOption(0).text, 'Paid.', 'the choice still resolves');
      // run-layer narration: a line with a token the caller does not fill is never used
      const saved = DD.defs.narration.rest;
      const next0 = DD.rng.next;
      try {
        DD.defs.narration.rest = ['{hero} naps on a barrel.', 'The party naps on the barrels.'];
        DD.rng.next = function () { return 0; }; // DD.narrate alone would now pick the first line, raw token and all
        DD.Run.next();
        travelTo('tavern');
        const r = DD.Run.tavernRest();
        t.ok(r && r.ok && r.text.indexOf('The party naps on the barrels.') === 0, 'rest text skips the line with an unfilled {hero}: ' + (r && r.text));
        DD.defs.narration.rest = ['{hero} naps on a barrel.'];
        newRun(PARTY, 'labels2');
        travelTo('tavern');
        const r2 = DD.Run.tavernRest();
        t.ok(r2 && r2.ok && r2.text.indexOf('{') < 0 && /^The party heals/.test(r2.text), 'no usable line: no narration, no raw token: ' + (r2 && r2.text));
      } finally {
        DD.rng.next = next0;
        if (saved) DD.defs.narration.rest = saved; else delete DD.defs.narration.rest;
      }
    });
  });

  /** Party for a content event: real heroes when registered (so hero-specific events can fire), else fixtures. */
  function eventParties() {
    const ids = Object.keys(DD.defs.heroes).filter(function (id) { return id.indexOf('test_') !== 0; });
    const pool = ids.length >= 4 ? ids : Object.keys(DD.defs.heroes);
    if (pool.length < 1) return [];
    const parties = [];
    for (let i = 0; i < pool.length; i++) {
      const p = [pool[i]];
      for (let k = 1; k < pool.length && p.length < 4; k++) p.push(pool[(i + k) % pool.length]);
      parties.push(p);
    }
    return parties;
  }

  T.suite('run: every registered event resolves through the event API', function (t) {
    const ids = Object.keys(DD.defs.events);
    const parties = eventParties();
    if (!parties.length) { t.skip('no heroes registered'); return; }
    const savedUi = DD.Run.useUi;
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    let resolved = 0, unreachable = 0;
    try {
      ids.forEach(function (id) {
        const def = DD.getEvent(id);
        (def.choices || []).forEach(function (choice, ci) {
          let done = false;
          for (let p = 0; p < parties.length && !done; p++) {
            for (let act = 1; act <= 3 && !done; act++) {
              DD.Run.newRun(parties[p], 'normal', 'event:' + id + ':' + ci + ':' + p);
              const s = DD.Run.state;
              s.act = act;
              s.gold = 150;
              if (!DD.RunMap.eventAvailable(def, act, s) && !def.fallback) continue;
              if (typeof choice.requires === 'function' && !DD.safe('requires of ' + id, choice.requires, choice, [s])) continue;
              t.tryRun(id + ' text', function () { DD.Run.openEvent(id, null, { noShow: true }); return DD.Run.currentEvent(); });
              const out = t.tryRun(id + ' choice ' + ci, function () { return DD.Run.chooseEventOption(ci); });
              t.ok(out && typeof out.text === 'string', id + ' choice ' + ci + ' returns outcome text');
              if (out && out.combat) {
                const q = out.combat;
                t.ok(q.id === null || DD.getEncounter(q.id), id + ' choice ' + ci + ' fight spec is valid');
              }
              t.ok(s.party.every(function (h) { return h.dead || h.hp >= 1; }), id + ' choice ' + ci + ' never kills');
              t.ok(s.gold >= 0, id + ' choice ' + ci + ' keeps gold >= 0');
              resolved++;
              done = true;
            }
          }
          if (!done) unreachable++;
        });
      });
      t.log(ids.length + ' events, ' + resolved + ' choices resolved, ' + unreachable + ' choices never available to the test parties');
      t.ok(resolved > 0, 'resolved at least the built-in fallback event');
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
    }
  });

  // ---- scars --------------------------------------------------------------------------------------------------------
  T.suite('run: scars — registry, stats and hooks', function (t) {
    const ids = Object.keys(DD.defs.scars);
    t.ok(ids.length >= 12, ids.length + ' scars registered');
    const statKeys = ['hp', 'ap', 'mov', 'armor', 'dmg', 'heal', 'range', 'block', 'hype'];
    ids.forEach(function (id) {
      const d = DD.getScar(id);
      t.ok(d.name && d.icon && typeof d.desc === 'string' && d.desc.length > 0, id + ': name/icon/desc');
      t.ok(d.flavor && d.flavor.length <= 120, id + ': flavor <= 120 chars');
      Object.keys(d.stats || {}).forEach(function (k) {
        t.ok(statKeys.indexOf(k) >= 0 && typeof d.stats[k] === 'number' && d.stats[k] <= 0, id + ': stat ' + k + ' is a penalty');
      });
      t.ok(Object.keys(d.stats || {}).length + Object.keys(d.hooks || {}).length > 0, id + ': has an effect');
    });
    // hooks against stand-ins (no combat engine needed)
    const savedAct = DD.Act, savedCombat = DD.Combat;
    const calls = [];
    DD.Act = {
      addStatus: function (u, sid, o) { calls.push(['status', sid, o]); return {}; },
      loseGold: function (n) { calls.push(['gold', n]); return n; },
      log: function () {},
    };
    DD.Combat = { state: { round: 1 } };
    try {
      const H = function (id, name) { return DD.getScar(id).hooks[name]; };
      const unit = { id: 'u1', name: 'Tester', hp: 10, maxHp: 10, ap: 3, side: 'hero', data: {}, statuses: [] };
      const d = { source: { side: 'enemy', hp: 5, maxHp: 10 }, target: unit, mult: 1, flat: 0, cause: 'bump', element: null };
      H('scar_weak_ankles', 'modifyIncomingDamage')(d);
      t.eq(d.flat, 3, 'Weak Ankles: +3 on bumps');
      d.cause = 'skill'; d.flat = 0;
      H('scar_weak_ankles', 'modifyIncomingDamage')(d);
      t.eq(d.flat, 0, 'Weak Ankles: not on skills');
      H('scar_thin_skin', 'modifyIncomingDamage')(d);
      t.eq(d.flat, 1, 'Thin Skin: +1 from enemy skills');
      d.flat = 0; d.element = 'fire';
      H('scar_afraid_of_fire', 'modifyIncomingDamage')(d);
      t.eq(d.flat, 2, 'Afraid of Fire: +2 fire');
      const out = { source: unit, mult: 1, flat: 0 };
      H('scar_imposter_syndrome', 'modifyOutgoingDamage')(out);
      t.near(out.mult, 0.9, 1e-9, 'Imposter Syndrome: -10% at full HP');
      unit.hp = 9; out.mult = 1;
      H('scar_imposter_syndrome', 'modifyOutgoingDamage')(out);
      t.eq(out.mult, 1, 'Imposter Syndrome: normal when hurt');
      const cost = { unit: unit, skill: {}, ap: 2, hp: 0 };
      H('scar_commitment_issues', 'modifyCost')(cost);
      t.eq(cost.ap, 3, 'Commitment Issues: first skill +1 AP');
      H('scar_commitment_issues', 'onSkillUsed')({ user: unit });
      cost.ap = 2;
      H('scar_commitment_issues', 'modifyCost')(cost);
      t.eq(cost.ap, 2, 'Commitment Issues: later skills normal');
      H('scar_hangover', 'onTurnStart')(unit);
      t.eq(unit.ap, 2, 'Hangover: -1 AP on round 1');
      DD.Combat.state.round = 2;
      H('scar_hangover', 'onTurnStart')(unit);
      t.eq(unit.ap, 2, 'Hangover: only round 1');
      if (DD.getStatus('weak')) {
        H('scar_stage_fright', 'onCombatStart')(unit);
        t.ok(calls.some(function (c) { return c[0] === 'status' && c[1] === 'weak' && c[2].turns === 1; }), 'Stage Fright: Weak for 1 turn');
      }
      if (DD.getStatus('marked')) {
        H('scar_sleep_talker', 'onCombatStart')(unit);
        t.ok(calls.some(function (c) { return c[0] === 'status' && c[1] === 'marked' && c[2].stacks === 3; }), 'Sleep Talker: Marked 3');
      }
      H('scar_owes_the_dm', 'onCombatEnd')(unit, 'victory');
      H('scar_owes_the_dm', 'onCombatEnd')(unit, 'defeat');
      t.eq(calls.filter(function (c) { return c[0] === 'gold'; }).length, 1, 'Owes the DM: 5 gold after wins only');
      t.tryRun('hooks tolerate junk', function () {
        ids.forEach(function (id) {
          const hooks = DD.getScar(id).hooks || {};
          Object.keys(hooks).forEach(function (k) { hooks[k]({}); hooks[k](null); });
        });
      });
    } finally {
      DD.Act = savedAct;
      DD.Combat = savedCombat;
    }
  });

  // ---- whole runs ---------------------------------------------------------------------------------------------------
  /** Resolve every pending level-up and queued learn with random (seeded) picks. */
  function resolveChoices(r) {
    for (let guard = 0; guard < 120; guard++) {
      const q = DD.Run.levelQueue();
      if (q.length) {
        const i = q[0];
        const ch = DD.Run.levelUpChoices(i);
        const c = r.pick(ch);
        let res = DD.Run.applyLevelChoice(i, c);
        if (!res.ok && res.needsReplace) res = DD.Run.applyLevelChoice(i, c, r.int(-1, 3));
        continue;
      }
      const l = DD.Run.pendingLearns();
      if (l.length) { DD.Run.resolveLearn(l[0].index, r.int(-1, 3)); continue; }
      return true;
    }
    return false;
  }

  /** v2 invariants right after a won fight: exactly one level-up (unless everyone is maxed), drawn among the lowest
   *  living heroes (the chosen one went from the lowest level to the next, every other candidate is still at it,
   *  nobody living is below it), and the living party spans at most one level. ctx.errors collects breaks. */
  function checkFightLevel(ctx, ups0) {
    const s = S();
    const d = s.pending && s.pending.type === 'rewards' ? s.pending.data : null;
    if (!d || d.kind === 'failed') return;
    ctx.wins = (ctx.wins || 0) + 1;
    const living = s.party.map(function (h, i) { return i; }).filter(function (i) { return !s.party[i].dead; });
    const maxed = living.every(function (i) { return s.party[i].level >= 10; });
    const lu = (d.levelUps || [])[0];
    if ((d.levelUps || []).length !== (maxed && !lu ? 0 : 1)) ctx.errors.push('fight ' + ctx.fights + ': ' + (d.levelUps || []).length + ' level-ups');
    if (s.stats.levelUps - ups0 !== (d.levelUps || []).length) ctx.errors.push('fight ' + ctx.fights + ': stats.levelUps moved by ' + (s.stats.levelUps - ups0));
    if (lu) {
      ctx.faces = ctx.faces || {};
      ctx.faces[lu.die + ':' + lu.face] = (ctx.faces[lu.die + ':' + lu.face] || 0) + 1;
      const h = s.party[lu.heroIdx];
      if (!h || h.dead || h.level !== lu.from + 1 || lu.to !== lu.from + 1) ctx.errors.push('fight ' + ctx.fights + ': the chosen hero did not gain exactly one level');
      if (lu.candidates.indexOf(lu.heroIdx) < 0) ctx.errors.push('fight ' + ctx.fights + ': chosen hero not among the candidates');
      lu.candidates.forEach(function (i) { if (i !== lu.heroIdx && s.party[i] && !s.party[i].dead && s.party[i].level !== lu.from) ctx.errors.push('fight ' + ctx.fights + ': candidate ' + i + ' was not at the lowest level'); });
      living.forEach(function (i) { if (i !== lu.heroIdx && s.party[i].level < lu.from) ctx.errors.push('fight ' + ctx.fights + ': hero ' + i + ' was lower than the chosen one'); });
      living.forEach(function (i) { if (s.party[i].level === lu.from && lu.candidates.indexOf(i) < 0) ctx.errors.push('fight ' + ctx.fights + ': hero ' + i + ' was lowest but not a candidate'); });
    }
    if (spread() > 1) ctx.errors.push('fight ' + ctx.fights + ': living levels spread ' + levels());
  }

  /** Resolve the pending step(s) after a travel the way a player could (random but seeded). */
  function playStep(r, eng, ctx) {
    for (let guard = 0; guard < 12 && S() && !S().over && S().pending; guard++) {
      const p = S().pending;
      if (p.type === 'combat') {
        ctx.fights++;
        const lose = ctx.loseAt && ctx.fights >= ctx.loseAt;
        const ups0 = S().stats.levelUps;
        eng.end(lose ? 'defeat' : 'victory', function (units) {
          units.forEach(function (u) {
            if (lose || r.next() < 0.12) { u.hp = 0; u.downed = true; } else u.hp = Math.max(1, Math.round(u.hp * r.float(0.3, 1)));
          });
          if (!lose && units.every(function (u) { return u.downed; })) { units[0].downed = false; units[0].hp = 1; }
        });
        if (!S().over) checkFightLevel(ctx, ups0);
        if (S().pending && S().pending.type === 'rewards' && S().pending.data.actClear) ctx.levelsAtBoss.push(S().party.map(function (h) { return h.level; }));
      } else if (p.type === 'rewards') {
        const order = r.shuffle(p.data.choices.map(function (c, i) { return i; }));
        let took = false;
        for (let k = 0; k < order.length && !took; k++) {
          const c = p.data.choices[order[k]];
          const hero = c.heroId ? S().party[DD.Run.indexOf(c.heroId)] : null;
          took = DD.Run.takeReward(order[k], hero && hero.skills.length >= 4 ? { replaceIdx: r.int(-1, 3) } : {}).ok;
        }
        if (!took) DD.Run.skipRewards();
        DD.Run.next();
      } else if (p.type === 'event') {
        const ev = DD.Run.currentEvent();
        const open = ev ? ev.choices.filter(function (c) { return !c.disabled; }) : [];
        if (open.length) DD.Run.chooseEventOption(r.pick(open).index);
        DD.Run.next();
      } else if (p.type === 'shop') {
        for (let k = 0; k < 4; k++) DD.Run.buy(r.pick(['items', 'tomes', 'consumables', 'services']), r.int(0, 2), { replaceIdx: r.int(-1, 3) });
        DD.Run.next();
      } else if (p.type === 'tavern') {
        const a = r.int(0, 2);
        if (a === 0) DD.Run.tavernRest();
        else if (a === 1) {
          const hi = r.pick(DD.Run.aliveHeroes());
          const ups = DD.Run.upgradableSkills(hi);
          if (ups.length) DD.Run.tavernTrain(hi, r.pick(ups));
        } else {
          const c = DD.Run.recruitCandidates();
          if (c.length) DD.Run.tavernRecruit(r.pick(c), r.int(0, S().party.length - 1));
        }
        DD.Run.next();
      } else {
        DD.Run.next();
      }
    }
  }

  /** Play one whole run with the fake engine. ctx: { loseAt } -> returns ctx with stats and errors. */
  function simulateRun(eng, seed, ctx) {
    ctx = Object.assign({ fights: 0, steps: 0, errors: [], levelsAtBoss: [], loseAt: 0 }, ctx || {});
    const r = DD.RNG('sim:' + seed);
    newRun(PARTY, 'sim' + seed, DD.Run.DIFFICULTIES[seed % 3]);
    while (S() && !S().over && ctx.steps++ < 120) {
      if (!resolveChoices(r)) ctx.errors.push('level-up choices never resolved');
      const avail = DD.Run.availableNodes();
      if (!avail.length) { ctx.errors.push('stuck on act ' + S().act + ' at ' + S().nodeId); break; }
      const mapErr = DD.RunMap.validate(S().map);
      if (mapErr.length) ctx.errors.push('map: ' + mapErr[0]);
      DD.Run.travel(r.pick(avail).id);
      playStep(r, eng, ctx);
      const bad = invariantError();
      if (bad) ctx.errors.push('step ' + ctx.steps + ': ' + bad);
    }
    return ctx;
  }

  T.suite('run: whole headless runs with a simulated engine (3 acts, all node types)', function (t) {
    return sandbox(t, function (eng) {
      const n = t.n || 6;
      let wins = 0;
      const faces = {};
      let won = 0;
      for (let seed = 0; seed < n; seed++) {
        DD.Meta.reset(false);
        const ctx = simulateRun(eng, seed);
        t.eq(ctx.errors.length, 0, 'seed ' + seed + ': no invariant violations' + (ctx.errors.length ? ' — ' + ctx.errors.slice(0, 3).join(' | ') : ''));
        t.eq(S().over, 'victory', 'seed ' + seed + ': the run reaches the final victory');
        if (S().over === 'victory') wins++;
        t.ok(S().stats.bosses === 3 && S().stats.actsCleared === 3, 'seed ' + seed + ': three bosses');
        t.ok(['rt_f', 'rt_g', 'rt_h'].every(DD.Meta.isUnlocked), 'seed ' + seed + ': all act unlocks earned');
        t.eq(DD.Meta.data.history[0].result, 'victory', 'seed ' + seed + ': recorded');
        // v2: slow, shared leveling — one level per won fight (plus the odd event), never more than 1 apart
        t.ok(ctx.wins > 0 && S().stats.levelUps >= ctx.wins, 'seed ' + seed + ': at least one level-up per won fight (' + S().stats.levelUps + ' for ' + ctx.wins + ' wins)');
        const b1 = ctx.levelsAtBoss[0] || [];
        t.ok(b1.length && Math.max.apply(null, b1) <= 4, 'seed ' + seed + ': slow leveling — the act 1 boss is fought around level 2 (' + json(b1) + ')');
        Object.keys(ctx.faces || {}).forEach(function (k) { faces[k] = (faces[k] || 0) + ctx.faces[k]; });
        won += ctx.wins || 0;
        t.log('seed ' + seed + ': ' + ctx.fights + ' fights (' + ctx.wins + ' won), ' + S().stats.levelUps + ' level-ups, levels at bosses ' + json(ctx.levelsAtBoss) + ', deaths ' + S().stats.deaths + ', gold ' + S().gold);
      }
      t.eq(wins, n, 'every simulated run finished');
      t.ok([1, 2, 3, 4].every(function (f) { return faces['4:' + f] > 0; }), 'the d4 landed on every face over the runs: ' + json(faces));
      t.log(won + ' won fights; die:face counts ' + json(faces));
      DD.Meta.reset(false);
      const lost = simulateRun(eng, 99, { loseAt: 3 });
      t.eq(lost.errors.length, 0, 'defeat run: no invariant violations');
      t.ok(S().over === 'defeat' && DD.Meta.data.history[0].result === 'defeat' && !DD.Run.hasSave(), 'a TPK on the third fight ends the run');
    });
  });

  T.suite('run: UI mode — navigation, HUD-owned combat end, map safety nets (stub DD.UI)', function (t) {
    return sandbox(t, async function (eng) {
      const savedUI = DD.UI;
      const shown = [];
      DD.UI = {
        current: null,
        show: function (id, params) { shown.push({ id: id, params: params }); DD.UI.current = id; DD.Events.emit('ui:screen', { id: id }); return true; },
      };
      const last = function () { return shown[shown.length - 1] || {}; };
      const wait = function () { return new Promise(function (r) { setTimeout(r, 10); }); };
      DD.Run.useUi = true;
      try {
        newRun(PARTY, 'ui-mode');
        t.ok(last().id === 'map' && last().params.act === 1, 'newRun shows the map');
        travelTo('combat');
        t.eq(last().id, 'combat', 'a fight shows the combat HUD');
        eng.end('victory');
        t.eq(S().pending.type, 'combat', 'with the UI on, onEnd leaves finishing to the HUD');
        const out = DD.Run.finishCombat('victory', eng.last().state);
        t.ok(out && out.outcome === 'rewards' && last().id === 'rewards' && last().params === S().pending.data, 'HUD finish -> rewards screen with the pending data');
        DD.Run.next();
        t.eq(last().id, 'levelup', 'next() -> level-up screen when choices are pending');
        t.ok(Array.isArray(last().params.queue) && last().params.queue.length === 1 && Array.isArray(last().params.learns), 'levelup params { queue, learns }: one hero leveled');
        t.eq(last().params.queue[0], DD.Run.levelQueue()[0], 'the queue names the hero the DM rolled');
        DD.Run.next();
        t.eq(last().id, 'map', 'next() from the level-up screen -> map');
        // a fight promised by an event is started when the map shows
        DD.Run.queueCombat({ act: 1, kind: 'normal' });
        const starts = eng.starts.length;
        DD.UI.show('map');
        await wait();
        t.eq(eng.starts.length, starts + 1, 'queued event fight started after the map showed');
        t.eq(last().id, 'combat', 'and the HUD is shown');
        // a fight interrupted by a reload restarts when the map shows
        t.ok(!DD.Run.save(), 'no saves while the fight runs (the save is from its start)');
        DD.Run.state = null;
        t.ok(DD.Run.load() && S().pending.type === 'combat' && !DD.Run.inCombat(), 'loaded a mid-fight save');
        DD.UI.show('map');
        await wait();
        t.eq(eng.starts.length, starts + 2, 'interrupted fight relaunched');
        t.ok(DD.Run.inCombat(), 'running again');
        // [integration] a TPK: a defeat with heroes standing is a lost objective now (rewards, the run goes on)
        eng.last().state.units.forEach(function (u) { u.downed = true; u.hp = 0; });
        DD.Run.finishCombat('defeat', eng.last().state);
        t.ok(last().id === 'gameover' && last().params.summary && last().params.summary.result === 'defeat', 'defeat -> gameover { summary }');
        // final victory params
        newRun(PARTY, 'ui-final');
        S().act = 3;
        S().map = DD.RunMap.generate(3, DD.RNG('ui-final'), { run: S() });
        const boss = S().map.nodes[S().map.boss];
        S().nodeId = S().map.layout[6][0];
        S().map.nodes[S().nodeId].links = [boss.id];
        boss.encounterId = 'rt_enc_a3_boss_1';
        DD.Run.travel(boss.id);
        DD.Run.finishCombat('victory', eng.last().state);
        t.ok(last().id === 'victory' && last().params.final === true && last().params.act === 3, 'campaign victory -> victory { final: true, act: 3 }');
        t.ok(last().params.unlocked.indexOf('rt_h') >= 0, 'victory params list the unlocks');
        DD.Run.useUi = false;
        const n = shown.length;
        newRun(PARTY, 'ui-off');
        t.eq(shown.length, n, 'useUi = false never touches DD.UI');
      } finally {
        DD.UI = savedUI;
      }
    });
  });

  T.suite('run: integration with the real combat engine (DD.Combat + DD.AutoPlay)', function (t) {
    if (!DD.Combat || typeof DD.Combat.start !== 'function' || !DD.AutoPlay || typeof DD.AutoPlay.runBattle !== 'function' ||
        !DD.Encounter || typeof DD.Encounter.build !== 'function') { t.skip('DD.Combat / DD.AutoPlay / DD.Encounter not available yet'); return; }
    const all = Object.keys(DD.defs.heroes);
    const real = all.filter(function (id) { return id.indexOf('test_') !== 0; });
    const pool = real.length >= 4 ? real : all;
    if (pool.length < 4) { t.skip('fewer than 4 heroes registered'); return; }
    const encs = Object.keys(DD.defs.encounters).map(function (id) { return DD.defs.encounters[id]; });
    if (!encs.some(function (e) { return e.act === 1 && e.kind === 'normal'; })) { t.skip('no act 1 encounters registered'); return; }
    const savedUi = DD.Run.useUi;
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    try {
      DD.Run.newRun(pool.slice(0, 4), 'normal', 'real-engine');
      let fights = 0;
      for (let guard = 0; guard < 25 && S() && !S().over && fights < 3; guard++) {
        const avail = DD.Run.availableNodes();
        if (!avail.length) { t.fail('nothing reachable'); break; }
        const node = avail.filter(function (n) { return n.type === 'combat'; })[0] || avail[0];
        t.ok(DD.Run.travel(node.id), 'travel to ' + node.id + ' (' + node.type + ')');
        const p = S().pending;
        if (p && p.type === 'combat') {
          fights++;
          const cs = DD.Combat.state;
          t.ok(cs && cs.run === S(), 'DD.Combat.state.run is the run state');
          t.ok(DD.Run.inCombat() && DD.Run.currentCombat() === cs, 'the run tracks the fight');
          const heroes = (cs.units || []).filter(function (u) { return u.kind === 'hero'; });
          t.eq(heroes.length, DD.Run.aliveHeroes().length, 'every living hero deployed');
          heroes.forEach(function (u) {
            const rh = S().party[DD.Run.indexOf(u.defId)];
            t.ok(rh && u.hp === rh.hp && u.maxHp === DD.Run.heroStats(rh).maxHp, u.defId + ': unit HP from the RunHero');
          });
          const res = t.tryRun('AutoPlay.runBattle', function () { return DD.AutoPlay.runBattle(40); });
          if (DD.FX && DD.FX.flush) DD.FX.flush();
          if (DD.Run.inCombat()) { t.log('battle hit the round cap: ' + json(res)); DD.Run.finishCombat(cs.result || 'defeat', cs); }
          t.ok(!DD.Run.inCombat(), 'the fight finished through onEnd');
          t.ok(S().over || (S().pending && S().pending.type === 'rewards'), 'rewards or game over (' + (cs.result || '?') + ')');
          if (!S().over && S().pending && S().pending.type === 'rewards' && S().pending.data.kind !== 'failed') {
            t.eq((S().pending.data.levelUps || []).length, 1, 'a won real fight levels up exactly one hero');
          }
          checkInvariants(t, 'after a real fight');
        } else if (p && p.type === 'event') {
          const ev = DD.Run.currentEvent();
          const open = ev ? ev.choices.filter(function (c) { return !c.disabled; }) : [];
          if (open.length) DD.Run.chooseEventOption(open[0].index);
        }
        if (S() && !S().over && S().pending && S().pending.type === 'rewards') {
          const d = S().pending.data;
          const i = d.choices.findIndex(function (c) { return c.type !== 'skill' && c.type !== 'consumable'; });
          if (i >= 0) t.ok(DD.Run.takeReward(i).ok, 'took a reward');
        }
        if (S() && !S().over) DD.Run.next();
      }
      t.ok(fights > 0, fights + ' real fights played');
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
  });
})();
