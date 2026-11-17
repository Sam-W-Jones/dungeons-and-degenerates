/* Dungeons and Degenerates — tests/core_tests.js
 * Suites "core: ..." for the V3 core (the lead's wave-0 contract, docs/notes/v3-contract.md): DD.finalAct() and the act
 * rows it drives (act 4 ships dark: an act-4 fight reads act 3's row and prices until the knob says 4), the gauntlet's
 * order scaling in DD.Balance.scale, DD.registerCameo and the DD.Cameo stand-in, the narration act variants
 * (key@a<act>: runs, sandbox fights and stale states) and the V3 load order of both manifests.
 * Every knob change is undone in a finally (DD.Balance.snapshot / restore); no literal "last act" is assumed.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  function B() { return DD.Balance; }
  /** Run fn with DD.Balance restored afterwards. */
  function withKnobs(fn) {
    const snap = B().snapshot();
    try { return fn(); } finally { B().restore(snap); }
  }

  T.suite('core: V3 DD.finalAct() clamps the campaign knob to 3..DD.MAX_ACT and the act rows follow it (act 4 ships dark)', function (t) {
    t.eq(DD.MAX_ACT, 4, 'DD.MAX_ACT: content may be written for acts 1-4');
    t.ok(!!B() && !!B().campaign, 'DD.Balance.campaign exists');
    const knob = Math.floor(Number(B().campaign.acts));
    t.eq(DD.finalAct(), Math.max(3, Math.min(DD.MAX_ACT, knob)), 'finalAct() is the knob (' + B().campaign.acts + '), clamped');
    withKnobs(function () {
      [[3, 3], [4, 4], [9, 4], [1, 3], [0, 3], [3.7, 3], ['4', 4], ['x', 3], [null, 3]].forEach(function (c) {
        B().campaign.acts = c[0];
        t.eq(DD.finalAct(), c[1], 'campaign.acts ' + JSON.stringify(c[0]) + ' → finalAct() ' + c[1]);
      });
      delete B().campaign;
      t.eq(DD.finalAct(), 3, 'no campaign row → 3 (the classic campaign)');
    });
    t.eq(DD.finalAct(), Math.max(3, Math.min(DD.MAX_ACT, knob)), 'restored');
    // the act row and the shop markup of an act-4 fight: act 3's while the knob is 3, act 4's once it is 4
    withKnobs(function () {
      B().act[4] = { hp: 2, dmg: 3 };
      B().priceAct[3] = 1.5;
      B().priceAct[4] = 2.5;
      B().campaign.acts = 3;
      const a3 = B().scale('normal', 3, 'boss'), a4 = B().scale('normal', 4, 'boss');
      t.ok(a4.hp === a3.hp && a4.dmg === a3.dmg, 'knob 3: an act-4 fight reads act 3\'s row (' + JSON.stringify(a4) + ')');
      t.eq(B().priceMultOf(4), 1.5, 'knob 3: act-4 prices read act 3\'s markup');
      B().campaign.acts = 4;
      const b4 = B().scale('normal', 4, 'boss');
      t.ok(Math.abs(b4.hp - a3.hp * 2) < 0.002 && Math.abs(b4.dmg - a3.dmg * 3) < 0.002, 'knob 4: act 4 reads its own row (' + JSON.stringify(b4) + ')');
      t.eq(B().priceMultOf(4), 2.5, 'knob 4: act-4 prices read act 4\'s markup');
      t.eq(B().priceMultOf(9), 2.5, 'an act past the campaign reads the last act');
    });
  });

  T.suite('core: V3 balance rows — campaign, act 4, gauntlet order scaling (via DD.Balance.scale), Bribe, markup, gauntlet stops, cameo budget', function (t) {
    const b = B();
    const pos = function (v) { return typeof v === 'number' && isFinite(v) && v > 0; };
    t.ok(b.act[4] && pos(b.act[4].hp) && pos(b.act[4].dmg), 'act[4] hp / dmg > 0');
    t.ok(b.gauntlet && b.gauntlet.hpPerBeaten >= 0 && b.gauntlet.dmgPerBeaten >= 0, 'gauntlet { hpPerBeaten, dmgPerBeaten } ≥ 0');
    t.ok(pos(b.prices.bribe) && pos(b.priceAct[4]), 'prices.bribe and priceAct[4] > 0');
    const NODE = ['shop', 'event', 'tavern'];
    ['lobby', 'between', 'last'].forEach(function (k) {
      const row = b.map.gauntlet && b.map.gauntlet[k];
      t.ok(Array.isArray(row) && row.length >= 1 && row.every(function (x) { return NODE.indexOf(x) >= 0; }), 'map.gauntlet.' + k + ': stop types ' + JSON.stringify(row));
    });
    t.ok(b.map.gauntlet.last.indexOf('tavern') >= 0 && b.map.gauntlet.between.indexOf('tavern') >= 0, 'a tavern between every pair of fights and before the floor boss');
    t.ok(b.cameo && pos(b.cameo.perFight) && pos(b.cameo.perRound) && b.cameo.minGap >= 0 && b.cameo.comeback >= 0 && b.cameo.comeback <= 1, 'cameo budget numbers');
    t.eq(b.cameo.off, 0, 'cameo.off 0: the shipped game plays every cameo (sims and debug pages switch them off with 1)');
    withKnobs(function () {
      t.eq(b.set('cameo.off', 1), 0, 'B.set reaches cameo.off (tools/sim.sh bal=cameo.off:1)');
      t.eq(B().cameo.off, 1, 'cameo.off set');
    });
    // the order scaling lives in one place: scale(…, { gauntlet: { index } }) — RULES' difficultyOf and MAPGEN's
    // difficultyInfo pass the door's gauntlet object (a run's fight multipliers come from Combat.start, not the setup)
    withKnobs(function () {
      b.campaign.acts = 4;
      b.gauntlet.hpPerBeaten = 0.1;
      b.gauntlet.dmgPerBeaten = 0.05;
      const base = b.scale('normal', 4, 'boss', { encounter: 'zz_no_such' });
      const two = b.scale('normal', 4, 'boss', { encounter: 'zz_no_such', gauntlet: { lane: 'x', index: 2, beaten: ['a', 'b'] } });
      t.ok(Math.abs(two.hp - base.hp * 1.2) < 0.002 && Math.abs(two.dmg - base.dmg * 1.1) < 0.002, 'index 2: HP × 1.2, damage × 1.1 (' + JSON.stringify(two) + ' vs ' + JSON.stringify(base) + ')');
      [{ index: 0 }, { index: 'junk' }, { index: -3 }, {}, null].forEach(function (g) {
        const s = b.scale('normal', 4, 'boss', { encounter: 'zz_no_such', gauntlet: g });
        t.ok(s.hp === base.hp && s.dmg === base.dmg, 'gauntlet ' + JSON.stringify(g) + ': no scaling');
      });
      const n = b.scale('normal', 4, 'boss', { neutral: true, gauntlet: { index: 3 } });
      const n0 = b.scale('normal', 4, 'boss', { neutral: true });
      t.ok(n.hp === n0.hp && n.dmg === n0.dmg, 'a sandbox (neutral) fight: no order scaling');
      b.gauntlet.hpPerBeaten = 0;
      b.gauntlet.dmgPerBeaten = 0;
      const off = b.scale('normal', 4, 'boss', { encounter: 'zz_no_such', gauntlet: { index: 4 } });
      t.ok(off.hp === base.hp && off.dmg === base.dmg, 'the knob at 0 (the shipped default): the order is free');
    });
  });

  T.suite('core: V3 DD.registerCameo defaults and the DD.Cameo API (the core stand-in until js/engine/cameo.js assigns the real one)', function (t) {
    const before = DD.problems.length;
    const id = 'zz_core_cameo';
    try {
      const c = DD.registerCameo({ id: id, name: 'Core Tester' });
      t.ok(DD.getCameo(id) === c && DD.defs.cameos[id] === c, 'registered: DD.getCameo / DD.defs.cameos');
      t.ok(c.title === '' && c.icon === '🎭' && c.color === '#c0213a' && c.enemy === null && c.situation === null &&
        c.roastPrefix === null && c.comebackPrefix === null, 'defaults: title, icon, color, enemy, situation, prefixes');
      t.ok(Array.isArray(c.triggers) && !c.triggers.length && c.cheats && !Object.keys(c.cheats).length, 'defaults: no triggers, no cheats');
      const c2 = DD.registerCameo({ id: id + '_2', name: 'Other' });
      t.ok(c2.triggers !== c.triggers && c2.cheats !== c.cheats, 'each def gets its own default lists');
      t.eq(DD.getCameo('zz_no_such_cameo'), null, 'an unknown id → null');
      t.eq(DD.problems.length, before, 'no registration warnings');
    } finally {
      delete DD.defs.cameos[id];
      delete DD.defs.cameos[id + '_2'];
    }
    const C = DD.Cameo;
    t.ok(!!C, 'DD.Cameo exists');
    ['fire', 'play', 'say', 'cheat', 'campaignGoesOn', 'present', 'history', 'budget'].forEach(function (k) {
      t.ok(C && typeof C[k] === 'function', 'DD.Cameo.' + k + '()');
    });
    t.ok(C && C.STYLES && typeof C.STYLES === 'object' && C.TOKENS && typeof C.TOKENS === 'object', 'DD.Cameo.STYLES / TOKENS');
    if (C && C.stub === true) {
      t.ok(C.fire('round:start', {}) === 0 && C.say('svammiel', 'svam_down') === '' && C.play('svammiel', 'x') === '' &&
        C.cheat('svammiel', 'svam_nepotism') === null && C.present({}, 'svammiel') === null, 'the stand-in plays and applies nothing');
      t.ok(Array.isArray(C.history({})) && C.budget({}).left === 0, 'the stand-in: empty history, no budget');
    } else t.log('js/engine/cameo.js has replaced the core stand-in (DD.Cameo.stub is ' + (C && C.stub) + ')');
    // campaignGoesOn: the cases the plan and the contract agree on (a run's act, or a sandbox fight of the act-3 boss)
    withKnobs(function () {
      B().campaign.acts = 3;
      t.eq(!!C.campaignGoesOn({ run: { act: 3 }, encounter: { act: 3 } }), false, 'knob 3: beating the act-3 boss ends the campaign');
      t.eq(!!C.campaignGoesOn({ run: null, encounter: { act: 3 } }), false, 'knob 3: a sandbox act-3 fight ends it too');
      B().campaign.acts = 4;
      t.eq(!!C.campaignGoesOn({ run: { act: 3 }, encounter: { act: 3 } }), true, 'knob 4: the act-3 boss is not the end (the twist)');
      t.eq(!!C.campaignGoesOn({ run: null, encounter: { act: 3 } }), true, 'knob 4: a sandbox act-3 fight goes on (debug twist=1)');
      t.eq(!!C.campaignGoesOn({ run: { act: 4 }, encounter: { act: 4 } }), false, 'knob 4: act 4 is the end');
    });
  });

  T.suite('core: V3 narration act variants — key@a<act> replaces the pool in its act (runs, sandbox fights, stale states)', function (t) {
    const savedC = DD.Combat.state, savedR = DD.Run.state;
    const rng = DD.RNG('core-narr');
    try {
      DD.registerNarration('zz_core_key', ['base {hero}']);
      DD.registerNarration('zz_core_key@a4', ['variant {hero}']);
      DD.registerNarration('zz_core_empty@a4', []);
      DD.registerNarration('zz_core_empty', ['only base']);
      t.eq(DD.narrationKey('zz_core_key', 4), 'zz_core_key@a4', 'narrationKey: the variant in its act');
      t.eq(DD.narrationKey('zz_core_key', 2), 'zz_core_key', 'narrationKey: the base key in another act');
      t.eq(DD.narrationKey('zz_core_empty', 4), 'zz_core_empty', 'narrationKey: an empty variant falls back to the base');
      t.eq(DD.narrationBaseKey('zz_core_key@a4'), 'zz_core_key', 'narrationBaseKey strips @a<act>');
      t.eq(DD.narrationBaseKey('victory'), 'victory', 'narrationBaseKey leaves a base key alone');
      DD.Combat.state = null;
      DD.Run.state = null;
      t.eq(DD.narrationAct(), 0, 'no fight, no run: act 0');
      t.eq(DD.narrate('zz_core_key', { hero: 'A' }, rng), 'base A', 'no fight, no run: the base pool');
      DD.Combat.state = { phase: 'player', run: null, encounter: { act: 4 } };
      t.eq(DD.narrationAct(), 4, 'a sandbox act-4 fight: its encounter act');
      t.eq(DD.narrate('zz_core_key', { hero: 'B' }, rng), 'variant B', 'a sandbox act-4 fight: the variant, base tokens filled');
      t.eq(DD.narrate('zz_core_empty', {}, rng), 'only base', 'a variant without lines: the base pool');
      DD.Combat.state.phase = 'over';
      t.eq(DD.narrationAct(), 4, 'the sandbox fight is over and no run exists: still its act');
      const run = { act: 2 };
      DD.Run.state = run;
      t.eq(DD.narrationAct(), 2, 'a run exists and the sandbox fight is over: the run\'s act');
      DD.Combat.state = { phase: 'player', run: null, encounter: { act: 4 } };
      t.eq(DD.narrationAct(), 4, 'a sandbox fight running while a run exists: the fight\'s act');
      DD.Combat.state = { phase: 'player', run: run, encounter: { act: 2 } };
      run.act = 4;
      t.eq(DD.narrationAct(), 4, 'a run\'s fight: the run\'s act');
      t.eq(DD.narrate('zz_core_key', { hero: 'C' }, rng), 'variant C', 'a run in act 4: the variant');
      DD.Combat.state = { phase: 'over', run: { act: 4 }, encounter: { act: 4 } };
      run.act = 1;
      t.eq(DD.narrationAct(), 1, 'a stale fight of an older run: the current run\'s act');
      t.eq(DD.narrate('zz_core_key', { hero: 'D' }, rng), 'base D', 'a new run\'s act 1 never draws @a4 lines');
      DD.Run.state = null;
      t.eq(DD.narrationAct(), 0, 'a stale run fight and no run: act 0');
    } finally {
      DD.Combat.state = savedC;
      DD.Run.state = savedR || null;
      ['zz_core_key', 'zz_core_key@a4', 'zz_core_empty', 'zz_core_empty@a4'].forEach(function (k) { delete DD.defs.narration[k]; });
    }
  });

  T.suite('core: V3 manifests list every new file once, in load order (cameo.js after combat.js, Benedick after Pebbles, act 4 after the DM)', function (t) {
    const M = window.DD_MANIFEST || [], X = window.DD_EXTRA_SCRIPTS || [];
    function at(list, p) { return list.indexOf(p); }
    function once(list, p) { return list.filter(function (q) { return q === p; }).length === 1; }
    function after(list, a, b) { return at(list, a) >= 0 && at(list, b) > at(list, a); }
    const game = [['js/engine/combat.js', 'js/engine/cameo.js'], ['js/data/heroes/pebbles.js', 'js/data/heroes/benedick.js'],
      ['js/data/bosses/dm.js', 'js/data/bosses/gardener.js'], ['js/data/bosses/gardener.js', 'js/data/bosses/league.js'],
      ['js/data/bosses/league.js', 'js/data/bosses/galbraith.js'], ['js/data/bosses/galbraith.js', 'js/data/bosses/coven.js'],
      ['js/data/bosses/coven.js', 'js/data/bosses/svammiel.js'], ['js/data/bosses/svammiel.js', 'js/data/bosses/goats.js'],
      ['js/data/events.js', 'js/data/events_act4.js'], ['js/data/narrator.js', 'js/data/svammiel_lines.js']];
    game.forEach(function (p) { t.ok(once(M, p[1]) && after(M, p[0], p[1]), p[1] + ' once, after ' + p[0]); });
    t.ok(after(M, 'js/engine/cameo.js', 'js/engine/autoplay.js') && after(M, 'js/data/bosses/goats.js', 'js/data/events.js'), 'cameo.js before autoplay.js; the bosses before the narrative files');
    const tests = [['tests/content/hero_pebbles.js', 'tests/content/hero_benedick.js'], ['tests/content/boss_dm.js', 'tests/content/boss_gardener.js'],
      ['tests/content/boss_gardener.js', 'tests/content/boss_league.js'], ['tests/content/boss_league.js', 'tests/content/boss_galbraith.js'],
      ['tests/content/boss_galbraith.js', 'tests/content/boss_coven.js'], ['tests/content/boss_coven.js', 'tests/content/boss_svammiel.js'],
      ['tests/content/boss_svammiel.js', 'tests/content/boss_goats.js'], ['tests/content/narrative.js', 'tests/content/svammiel_lines.js'],
      ['tests/content/svammiel_lines.js', 'tests/content/events_act4.js'], ['tests/content/events_act4.js', 'tests/content/integration.js']];
    tests.forEach(function (p) { t.ok(once(X, p[1]) && after(X, p[0], p[1]), p[1] + ' once, after ' + p[0]); });
    t.ok(once(X, 'tests/core_tests.js'), 'tests/core_tests.js is listed once');
    // a listed file that failed to load is reported by the loader, never an error
    t.ok(!(DD.errors || []).some(function (e) { return /cameo|benedick|goats|gardener|league|galbraith|coven|svammiel|events_act4/.test(e); }), 'no load error from a V3 file');
  });
})();
