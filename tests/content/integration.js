/* Dungeons and Degenerates — tests/content/integration.js
 * Integration suites ("integration: ..."): checks that only make sense with every content area loaded together
 * (hero unlocks vs. bosses, act coverage, loot reachability, display-name clashes, hero events), regression tests for
 * the integrator's surgical core fixes (see docs/notes/content-digest.md), and a whole-campaign AutoPlay smoke run with
 * real heroes. Suites that need the full roster skip themselves in isolated runs (&isolate=...).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  function vals(o) { return Object.keys(o || {}).map(function (k) { return o[k]; }); }
  function isTest(id) { return /^(test_|mgt_|mg_|rt_|wm_|hudtest|vux|ui_)/.test(String(id)); }
  function realHeroes() { return Object.keys(DD.defs.heroes).filter(function (id) { return !isTest(id); }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  const ALL_TEN = ['zarathor', 'syllamin', 'marbles', 'marwyn', 'ellaria', 'josiah', 'sparrow', 'corelos', 'slate', 'buga'];
  function fullRoster() { return ALL_TEN.every(function (id) { return !!DD.getHero(id); }); }

  // ---- cross-content consistency ---------------------------------------------------------------------------------
  T.suite('integration: cross-content consistency (unlocks, acts, loot, names, hero events)', function (t) {
    if (!fullRoster() || !DD.getEnemy('dungeon_master')) { t.skip('needs every hero and boss file (isolated run)'); return; }
    // DESIGN §3: 5 starters, act unlocks, boss unlocks
    const want = { zarathor: null, syllamin: null, marbles: null, marwyn: null, ellaria: null,
      josiah: { act: 1 }, sparrow: { act: 2 }, corelos: { act: 3 }, buga: { boss: 'grimble' }, slate: { boss: 'lichtenstein' } };
    Object.keys(want).forEach(function (id) {
      t.eq(JSON.stringify(DD.getHero(id).unlock || null), JSON.stringify(want[id]), id + ': unlock condition');
    });
    t.eq(realHeroes().length, 10, 'ten real heroes');
    const encs = vals(DD.defs.encounters).filter(function (e) { return !isTest(e.id); });
    ['grimble', 'lichtenstein'].forEach(function (b) {
      const e = DD.getEnemy(b);
      t.ok(e && e.tier === 'boss', b + ' is a registered boss');
      t.ok(encs.some(function (en) { return en.kind === 'boss' && (en.enemies || []).some(function (x) { return x.id === b; }); }), b + ' has a boss encounter');
      t.ok(DD.Meta.unlocksForBoss(b).length === 1, b + ' unlocks exactly one hero: ' + JSON.stringify(DD.Meta.unlocksForBoss(b)));
    });
    // every act: normal, elite and boss fights; two bosses in acts 1 and 2, the DM alone in act 3
    const BOSSES = { 1: ['grimble', 'rat_king'], 2: ['lichtenstein', 'dr_iris'], 3: ['dungeon_master'] };
    [1, 2, 3].forEach(function (act) {
      const of = function (kind) { return encs.filter(function (e) { return e.act === act && e.kind === kind; }); };
      t.ok(of('normal').length >= 6, 'act ' + act + ': 6+ normal encounters (' + of('normal').length + ')');
      t.ok(of('elite').length >= 3, 'act ' + act + ': 3+ elite encounters (' + of('elite').length + ')');
      const bosses = of('boss').map(function (e) { return e.enemies.filter(function (x) { const d = DD.getEnemy(x.id); return d && d.tier === 'boss'; })[0].id; }).sort();
      t.eq(JSON.stringify(bosses), JSON.stringify(BOSSES[act].slice().sort()), 'act ' + act + ': boss lineup');
      of('normal').concat(of('elite'), of('boss')).forEach(function (e) {
        if (e.map && e.map.theme) t.ok(!!(DD.Themes && DD.Themes[e.map.theme]), e.id + ': theme "' + e.map.theme + '" exists');
      });
    });
    // player-facing names: hero/generic/summon skills, items, consumables, Blessings and scars never share a name
    const names = {};
    function add(kind, d, nm) { if (!d || isTest(d.id)) return; const k = norm(nm); (names[k] = names[k] || []).push(kind + ':' + d.id); }
    vals(DD.defs.skills).forEach(function (d) { if (d.owner !== 'enemy') add('skill', d, d.name); });
    vals(DD.defs.items).forEach(function (d) { add('item', d, d.name); });
    vals(DD.defs.consumables).forEach(function (d) { add('consumable', d, d.name); });
    vals(DD.defs.passives || {}).forEach(function (d) { add('passive', d, d.name); });
    vals(DD.defs.scars || {}).forEach(function (d) { add('scar', d, d.name); });
    Object.keys(names).forEach(function (k) { t.ok(names[k].length === 1, 'name "' + k + '" is used once: ' + names[k].join(', ')); });
    // loot: every consumable and generic skill can drop / be learned; every shared item can drop
    vals(DD.defs.consumables).filter(function (d) { return !isTest(d.id); }).forEach(function (d) {
      t.ok(!d.noDrop && (d.weight === undefined || d.weight > 0), d.id + ': can drop (rewards, shops)');
      t.ok(DD.Rewards.price('consumable', d.id) > 0, d.id + ': has a price');
    });
    vals(DD.defs.items).filter(function (d) { return !isTest(d.id); }).forEach(function (d) {
      t.ok(!d.noDrop && (d.weight === undefined || d.weight > 0), d.id + ': can drop (rewards, shops)');
    });
    const generic = vals(DD.defs.skills).filter(function (s) { return s.owner === 'generic' && !isTest(s.id); });
    t.ok(generic.length >= 12, '12+ generic skills (' + generic.length + ')');
    ALL_TEN.forEach(function (id) {
      const rh = DD.Combat.makeRunHero({ id: id, level: 1 });
      const learn = DD.Run.learnableFor(rh, { generic: true });
      t.ok(generic.every(function (g) { return learn.indexOf(g.id) >= 0; }), id + ': every generic skill is learnable from a tome');
      const own = DD.Run.learnableFor(rh, { generic: false });
      const pool = DD.getHero(id).skillPool.filter(function (s) { return DD.getHero(id).startingSkills.indexOf(s) < 0; });
      t.ok(pool.every(function (s) { return own.indexOf(s) >= 0; }), id + ': every pool skill is learnable');
    });
    // hero events: each hero has one, and they only name real heroes
    const evs = vals(DD.defs.events).filter(function (e) { return !isTest(e.id); });
    ALL_TEN.forEach(function (id) { t.ok(evs.some(function (e) { return e.hero === id; }), id + ': has a hero event'); });
    evs.forEach(function (e) { if (e.hero) t.ok(!!DD.getHero(e.hero), e.id + ': names an existing hero'); });
    // narration: no line twice on the same key (several authors share keys like boss_start)
    Object.keys(DD.defs.narration).forEach(function (k) {
      const seen = {};
      DD.defs.narration[k].forEach(function (l) { const n = norm(l); t.ok(!seen[n], k + ': line used twice "' + l + '"'); seen[n] = 1; });
    });
  });

  // ---- core fix: a ×0 multiplier from charm / immunity also cancels flat bonuses -------------------------------------
  T.suite('integration: charm and element immunity also cancel flat damage bonuses (core fix)', function (t) {
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('needs tests/fixtures.js'); return; }
    const s = DD.Combat.sandbox({ w: 8, h: 6, seed: 'int-x0', noPlan: true,
      heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }, { id: 'test_grunt', x: 4, y: 4 }] });
    const k = s.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    const foes = s.units.filter(function (u) { return u.defId === 'test_grunt'; });
    k.hooks = { modifyOutgoingDamage: function (d) { d.flat += 3; } };  // like a +3 flat weapon (Whetstone, Lance, …)
    const hp0 = foes[0].hp;
    t.eq(DD.Act.damage(k, foes[0], 5, {}), 8, 'baseline: 5 + 3 flat');
    foes[0].hp = hp0;
    DD.Act.addStatus(k, 'charmed', { turns: 1 }, foes[0]);
    t.eq(DD.Act.damage(k, foes[0], 5, {}), 0, 'charmed: nothing reaches the charmer, flat bonus included');
    t.eq(foes[0].hp, hp0, 'charmer untouched');
    t.ok(DD.Act.damage(k, foes[1], 5, {}) > 0, 'charmed: other foes still take the hit');
    DD.Act.removeStatus(k, 'charmed', { silent: true });
    foes[0].resist = { fire: 0 };
    t.eq(DD.Act.damage(k, foes[0], 5, { element: 'fire' }), 0, 'fire-immune foe: no damage, flat bonus included');
    t.eq(DD.Act.damage(k, foes[0], 5, {}), 8, 'immunity is per element (a physical hit lands)');
    foes[0].hp = hp0;
    // the content idiom "set the exact damage" (mult 0 + flat in a target hook, e.g. the Rat King's flush) still works
    foes[1].hooks = { modifyIncomingDamage: function (d) { d.mult = 0; d.flat = 7; } };
    const hp1 = foes[1].hp;
    t.eq(DD.Act.damage(null, foes[1], 30, { cause: 'fall' }), Math.min(7, hp1), 'a hook can still set an exact amount (mult 0 + flat)');
  });

  // ---- core fix: AutoPlay prices hazards crossed on the way ----------------------------------------------------------
  T.suite('integration: AutoPlay never walks across lava to save a step (core fix)', function (t) {
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('needs tests/fixtures.js'); return; }
    // a lava wall at x = 2 with a stone gap at the top; the foe far east: only the lava tile (2,2) leads east this turn
    const s = DD.Combat.sandbox({ w: 12, h: 5, seed: 'int-lava', noPlan: true,
      heroes: [{ id: 'test_knight', x: 0, y: 2 }], enemies: [{ id: 'test_grunt', x: 11, y: 2 }],
      terrain: function (tile) { if (tile.x === 2 && tile.y > 0) tile.t = 'lava'; } });
    const k = s.units.filter(function (u) { return u.kind === 'hero'; })[0];
    const hp0 = k.hp;
    const lavaPath = DD.Combat.reachable(k).get('3,2');
    t.ok(lavaPath && lavaPath.path.some(function (p) { return p.x === 2 && p.y === 2; }), 'premise: the way east crosses the lava');
    let stepped = false;
    k.hooks = { onEnterTile: function (u, tile) { if (!DD.Act.simulating && tile && tile.t === 'lava') stepped = true; } };
    DD.AutoPlay.takeTurn();
    t.ok(!stepped && DD.Grid.tile(k.x, k.y).t !== 'lava', 'AutoPlay never sets foot on the lava (ended on ' + k.x + ',' + k.y + ')');
    t.eq(k.hp, hp0, 'no self-inflicted burns');
    t.ok(k.x > 0 || k.y !== 2, 'it still moved toward the fight');
  });

  // ---- core fix: AutoPlay walks over to downed allies and helps them up ----------------------------------------------
  T.suite('integration: AutoPlay walks over to a downed ally and helps them up (core fix)', function (t) {
    if (!DD.getHero('test_knight') || !DD.getHero('test_cleric') || !DD.getEnemy('test_grunt')) { t.skip('needs tests/fixtures.js'); return; }
    const s = DD.Combat.sandbox({ w: 10, h: 6, seed: 'int-rescue', noPlan: true,
      heroes: [{ id: 'test_knight', x: 5, y: 2 }, { id: 'test_cleric', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 9, y: 5 }] });
    const k = s.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    const c = s.units.filter(function (u) { return u.defId === 'test_cleric'; })[0];
    c.block = 0;
    DD.Act.damage(null, c, 999, { cause: 'other' });
    t.ok(c.downed, 'premise: the cleric is down, three tiles from the knight');
    t.eq(k.ap, 3, 'premise: the knight has 3 AP (move 1 + Help Up 2)');
    DD.AutoPlay.takeTurn();
    t.ok(!c.downed && c.hp > 0, 'the knight walked over and helped the cleric up (cleric HP ' + c.hp + ')');
    t.eq(Math.abs(k.x - c.x) + Math.abs(k.y - c.y), 1, 'the knight stands next to the cleric');
    // no rescue when Help Up would not be affordable after the walk
    const s2 = DD.Combat.sandbox({ w: 10, h: 6, seed: 'int-rescue2', noPlan: true,
      heroes: [{ id: 'test_knight', x: 5, y: 2 }, { id: 'test_cleric', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 9, y: 5 }] });
    const k2 = s2.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    const c2 = s2.units.filter(function (u) { return u.defId === 'test_cleric'; })[0];
    c2.block = 0;
    DD.Act.damage(null, c2, 999, { cause: 'other' });
    k2.ap = 2;
    DD.AutoPlay.takeTurn();
    t.ok(c2.downed, 'with 2 AP (walk + no Help Up) it does not waste the turn on a half rescue');
  });

  // ---- core fix: the combat HUD shows the party gold ----------------------------------------------------------------
  T.suite('integration: the combat HUD shows the party gold and follows it live (core fix)', function (t) {
    if (!DD.UI || !DD.UI.screens || !DD.UI.screens.combat || !DD.HUD) { t.skip('combat HUD not loaded'); return; }
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('needs tests/fixtures.js'); return; }
    try {
      DD.UI.closeAllModals('test');
      DD.Combat.sandbox({ w: 8, h: 8, seed: 11, theme: 'cellar', gold: 77,
        heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }] });
      DD.UI.show('combat');
      const r = DD.HUD.root();
      const g = r && r.querySelector('.hud-hype .hud-gold .hg-val');
      t.ok(!!g, 'gold chip next to the Hype meter');
      t.eq(g && g.textContent, '77', 'shows the party gold');
      DD.Act.gainGold(5); DD.Combat.changed(); // in play the skill's public action emits combat:changed
      t.eq(g && g.textContent, '82', 'follows gold gained mid-fight');
      DD.Act.loseGold(80); DD.Combat.changed();
      t.eq(g && g.textContent, '2', 'follows gold lost mid-fight (Levy, bribes)');
    } finally {
      DD.UI.closeAllModals('test');
      DD.UI.hideTooltip();
      if (DD.UI.current === 'combat') DD.UI.show('title');
    }
  });

  // ---- core fix: the rewards screen narrates a hero written out of the campaign ---------------------------------------
  T.suite('integration: the rewards screen gives a fallen hero the hero_death line (core fix)', function (t) {
    if (!DD.UI || !DD.UI.screens || !DD.UI.screens.rewards) { t.skip('rewards screen not loaded'); return; }
    const deaths = (DD.defs.narration.hero_death || []).slice();
    if (!deaths.length) { t.skip('no hero_death narration registered'); return; }
    const text = function () { const n = DD.UI.root && DD.UI.root.querySelector('.narration .narr-text'); return n ? n.textContent : ''; };
    try {
      DD.UI.show('rewards', { gold: 10, xp: 5, choices: [], kind: 'normal', deaths: [0], downed: [0], next: 'map' });
      t.ok(deaths.indexOf(text()) >= 0, 'a death shows a hero_death line: "' + text() + '"');
      DD.UI.show('rewards', { gold: 10, xp: 5, choices: [], kind: 'normal', deaths: [], next: 'map' });
      t.ok(text().length > 0 && deaths.indexOf(text()) < 0, 'a plain victory keeps the victory line');
      DD.UI.show('rewards', { gold: 10, xp: 5, choices: [], kind: 'normal', deaths: [0], text: 'Custom.', next: 'map' });
      t.eq(text(), 'Custom.', 'an explicit text (bosses, treasure) still wins');
    } finally {
      DD.UI.closeAllModals('test');
      DD.UI.show('title');
    }
    // the run layer writes the line into the rewards data when a hero is written out (third down in a won fight)
    if (!DD.getHero('test_knight') || !DD.Run || !DD.Combat) return;
    const savedUi = DD.Run.useUi, savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    try {
      DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], 'normal', 'int-death');
      const run = DD.Run.state;
      run.party[0].downs = 2;
      const enc = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; }).filter(function (e) { return /^test_/.test(e.id) && e.act === 1 && e.kind === 'normal'; })[0];
      t.ok(!!enc && !!DD.Run.startCombat(enc, 'normal'), 'premise: a run fight started');
      const cs = DD.Combat.state;
      const k = cs.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
      k.block = 0;
      DD.Act.damage(null, k, 999, { cause: 'other' });
      t.ok(k.downed, 'premise: the knight (2 downs already) is down');
      DD.Act.endCombat('victory');
      if (DD.FX && DD.FX.flush) DD.FX.flush();
      if (DD.Run.inCombat()) DD.Run.finishCombat('victory', cs);
      const d = DD.Run.rewards();
      t.ok(d && d.deaths.indexOf(0) >= 0 && run.party[0].dead, 'the knight is written out of the campaign');
      t.ok(d && deaths.indexOf(d.text) >= 0, 'the rewards data carries a hero_death line: "' + (d && d.text) + '"');
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
  });

  // ---- core fix: a lost objective with heroes standing is a lost fight, not a campaign-ending TPK ----------------------
  T.suite('integration: losing a protect objective loses the fight, not the campaign (core fix)', function (t) {
    if (!DD.getHero('test_knight') || !DD.getEncounter('test_a2_keg') || !DD.Run) { t.skip('needs tests/fixtures.js'); return; }
    const savedUi = DD.Run.useUi, savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    try {
      DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], 'normal', 'int-protect');
      const run = DD.Run.state;
      const gold0 = run.gold;
      const node = DD.Run.availableNodes()[0];
      run.nodeId = node.id;
      t.ok(!!DD.Run.startCombat('test_a2_keg', 'normal', { nodeId: node.id }), 'premise: a protect fight started');
      const cs = DD.Combat.state;
      const keg = cs.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'keg'; })[0];
      t.ok(!!keg, 'premise: the keg is on the map');
      DD.Act.damageObject(null, keg.x, keg.y, 999);
      DD.Combat.checkEnd();
      if (DD.FX && DD.FX.flush) DD.FX.flush();
      t.eq(cs.result, 'defeat', 'the keg broke: the fight is lost');
      if (DD.Run.inCombat()) DD.Run.finishCombat(cs.result, cs);
      t.ok(!run.over, 'the campaign goes on (the party is alive)');
      const d = DD.Run.rewards();
      t.ok(d && d.kind === 'failed' && d.choices.length === 0 && d.gold === 0 && d.xp === 0, 'an "Objective Failed" step with no loot, gold or XP');
      t.eq(run.gold, gold0, 'no gold paid');
      t.ok(run.map.nodes[node.id].done && run.map.nodes[node.id].result === 'defeat', 'the node is done (lost)');
      DD.Run.skipRewards();
      DD.Run.next();
      t.ok(!run.over && DD.Run.availableNodes().length > 0, 'the map continues');
      // a lost boss fight still ends the run, even with heroes standing
      DD.Run.startCombat('test_a1_boss', 'boss');
      const bs = DD.Combat.state;
      DD.Act.endCombat('defeat');
      if (DD.FX && DD.FX.flush) DD.FX.flush();
      if (DD.Run.inCombat()) DD.Run.finishCombat('defeat', bs);
      t.eq(run.over, 'defeat', 'a lost boss fight is still game over');
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
  });

  T.suite('integration: the HUD hands a lost objective to the "Objective Failed" rewards step (core fix)', async function (t) {
    if (!DD.UI || !DD.UI.screens || !DD.UI.screens.combat || !DD.HUD || !DD.getHero('test_knight') || !DD.Run) { t.skip('needs the HUD and tests/fixtures.js'); return; }
    const useUi = DD.Run.useUi, meta = DD.util.deepClone(DD.Meta.data);
    const s = DD.UI.settings(), unlock = s.unlockAll;
    try {
      DD.Run.useUi = true;
      s.unlockAll = true;
      DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], 'normal', 778);
      s.unlockAll = unlock;
      DD.Run.startCombat('test_a1_normal', 'normal');
      t.eq(DD.UI.current, 'combat', 'premise: the HUD runs the fight');
      DD.Combat.finish('defeat');   // heroes standing: what a broken keg looks like to the HUD
      for (let i = 0; i < 4 && DD.UI.current === 'combat'; i++) await new Promise(function (r) { setTimeout(r, 5); });
      t.eq(DD.UI.current, 'rewards', 'the HUD hands off to the rewards screen, not game over');
      t.ok(!DD.Run.state.over && DD.Run.rewards() && DD.Run.rewards().kind === 'failed', 'the run goes on with an Objective Failed step');
    } finally {
      s.unlockAll = unlock;
      DD.Run.useUi = useUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY || 'run');
      DD.Meta.data = meta;
      if (DD.Meta.save) DD.Meta.save();
      DD.UI.closeAllModals('test');
      DD.UI.show('title');
    }
  });

  // ---- whole campaigns ------------------------------------------------------------------------------------------------
  /** Play one whole run headlessly (random nodes, sensible picks), every fight by AutoPlay. Returns a report. */
  function playCampaign(seed, party) {
    const r = DD.RNG('int-camp:' + seed);
    const rep = { fights: 0, capped: [], errors: [], steps: 0, bosses: [] };
    const S = function () { return DD.Run.state; };
    DD.Run.newRun(party, 'normal', 'int-camp' + seed);
    function levels() {
      for (let g = 0; g < 200; g++) {
        const q = DD.Run.levelQueue();
        if (q.length) {
          const ch = DD.Run.levelUpChoices(q[0]);
          if (!ch.length) return;
          const c = ch.filter(function (x) { return x.type === 'upgrade'; })[0] || ch[0];
          let res = DD.Run.applyLevelChoice(q[0], c);
          if (!res.ok && res.needsReplace) res = DD.Run.applyLevelChoice(q[0], c, -1);
          if (!res.ok) { rep.errors.push('level choice refused: ' + res.reason); return; }
          continue;
        }
        const l = DD.Run.pendingLearns();
        if (l.length) { DD.Run.resolveLearn(l[0].index, -1); continue; }
        return;
      }
    }
    while (S() && !S().over && rep.steps++ < 250) {
      levels();
      const avail = DD.Run.availableNodes();
      if (!avail.length) { rep.errors.push('no reachable node in act ' + S().act); break; }
      DD.Run.travel(r.pick(avail).id);
      for (let g = 0; g < 16 && S() && !S().over && S().pending; g++) {
        const p = S().pending;
        if (p.type === 'combat') {
          const cs = DD.Combat.state;
          if (p.data.kind === 'boss') rep.bosses.push(p.data.encounterId);
          rep.fights++;
          DD.AutoPlay.runBattle(40);
          if (DD.FX && DD.FX.flush) DD.FX.flush();
          if (DD.Run.inCombat()) { rep.capped.push(p.data.encounterId); DD.Run.finishCombat('defeat', cs); }
        } else if (p.type === 'rewards') {
          const d = p.data;
          let took = false;
          for (let i = 0; i < d.choices.length && !took; i++) took = DD.Run.takeReward(i, { replaceIdx: -1 }).ok;
          if (!took) DD.Run.skipRewards();
          DD.Run.next();
        } else if (p.type === 'event') {
          const ev = DD.Run.currentEvent();
          const open = ev ? ev.choices.filter(function (c) { return !c.disabled; }) : [];
          if (open.length && !ev.resolved) DD.Run.chooseEventOption(r.pick(open).index);
          DD.Run.next();
        } else if (p.type === 'tavern') {
          DD.Run.tavernRest();
          DD.Run.next();
        } else DD.Run.next();
      }
      const s = S();
      if (s) s.party.forEach(function (h, i) {
        if (h.skills.length > 4) rep.errors.push('hero ' + i + ' socketed ' + h.skills.length + ' skills');
        if (!h.dead && (h.hp < 0 || h.hp > DD.Run.heroStats(h).maxHp)) rep.errors.push('hero ' + i + ' HP ' + h.hp);
      });
    }
    rep.over = S() ? S().over : null;
    rep.act = S() ? S().act : 0;
    rep.cleared = S() ? S().stats.actsCleared || 0 : 0;
    return rep;
  }

  T.suite('integration: whole campaigns with real heroes under AutoPlay (smoke)', function (t) {
    if (!fullRoster() || !DD.getEnemy('dungeon_master')) { t.skip('needs every hero and boss file (isolated run)'); return; }
    const savedUi = DD.Run.useUi, savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    try {
      const n = t.n || 2;
      for (let seed = 0; seed < n; seed++) {
        DD.Meta.reset(false);
        DD.Meta.data.unlocked = ALL_TEN.slice();
        const party = DD.RNG('int-party:' + seed).shuffle(ALL_TEN.slice()).slice(0, 4);
        const rep = t.tryRun('campaign ' + seed, function () { return playCampaign(seed, party); }) || { errors: ['threw'], capped: [] };
        t.eq(rep.errors.length, 0, 'seed ' + seed + ': no invariant violations ' + JSON.stringify(rep.errors.slice(0, 3)));
        t.ok(rep.over === 'victory' || rep.over === 'defeat', 'seed ' + seed + ': the run ends (' + rep.over + ' in act ' + rep.act + ')');
        t.ok(rep.fights >= 6, 'seed ' + seed + ': real fights were played (' + rep.fights + ')');
        t.eq(rep.capped.length, 0, 'seed ' + seed + ': every fight finished under 40 rounds ' + JSON.stringify(rep.capped));
        if (rep.over === 'victory') {
          t.eq(rep.cleared, 3, 'seed ' + seed + ': three acts cleared');
          t.ok(['josiah', 'sparrow', 'corelos'].every(DD.Meta.isUnlocked), 'seed ' + seed + ': act unlocks earned');
        }
        t.log('seed ' + seed + ' [' + party.join(',') + ']: ' + rep.over + ' · act ' + rep.act + ' · ' + rep.fights + ' fights · bosses ' + rep.bosses.join(','));
      }
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
