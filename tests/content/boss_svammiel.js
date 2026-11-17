/* Dungeons and Degenerates — tests/content/boss_svammiel.js
 * Suites "boss_svammiel: …" for js/data/bosses/svammiel.js (Svammiel, the floor boss, encounter boss_svammiel; the
 * `svammiel` cameo def and its five cameo cheats) and the DM's twist cut-off line in dm.js. Plan .tmp/v3/design.md §3.0.2,
 * §3.5, §4.1, §5.1, §8.4 (Content). Act 4 ships dark: suites that need act 4 set DD.Balance.campaign.acts inside
 * try / finally. Suites that need the real DD.Cameo (js/engine/cameo.js) or E2 / E13 say so and skip that part while the
 * engine is the core stand-in. Author sims run only with sim=1 (n=, level=).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const SV = 'svam_svammiel', IMP = 'svam_imp';
  const LV = 6;   // plan §2.3: the party meets him at about level 6

  // ---- helpers --------------------------------------------------------------------------------------------------
  function B() { return DD.BossSvammiel; }
  function S() { return DD.Combat.state; }
  function F() { return S().data.svam; }
  function act(fn) { return DD.Combat._action(fn); }
  function sv() { return S().units.filter(function (u) { return u.defId === SV && !u.dead; })[0]; }
  function heroes() { return S().units.filter(function (u) { return u.kind === 'hero' && !u.dead; }); }
  function hero(id) { return S().units.filter(function (u) { return u.defId === id; })[0]; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function objs(id) { return DD.Grid.allTiles().filter(function (t) { return t.obj && t.obj.id === id; }); }
  function put(u, x, y) { return u.x === x && u.y === y ? true : DD.Act.teleport(u, x, y, { noEnter: true, fx: false }); }
  function logHas(re) { return S().log.some(function (l) { return re.test(l.text); }); }
  function rule(id) { return S().rules.filter(function (r) { return r.id === id; })[0] || null; }
  function mentions(text, n) { return new RegExp('(^|[^0-9])' + n + '(?![0-9])').test(text); }
  function onList(list, p) { return list.some(function (q) { return q.x === p.x && q.y === p.y; }); }
  function partyAt(level, ids) {
    return (ids || PARTY).map(function (id) {
      const h = DD.getHero(id);
      const boons = Math.max(0, level - 1);
      const learn = Math.min(2, boons);
      const list = h.startingSkills.concat(h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, learn));
      const skills = list.map(function (s) { return { id: s, level: 1 }; });
      for (let k = 0, up = boons - learn; up > 0 && k < 12; k++) {
        const sk = skills[k % skills.length];
        if (sk.level < Math.min(3, DD.getSkill(sk.id).levels.length)) { sk.level++; up--; }
      }
      return DD.Combat.makeRunHero({ id: id, level: level, skills: skills });
    });
  }
  /** Run fn with act 4 switched on (DD.finalAct() === 4), restoring the knob afterwards. */
  function withActs(n, fn) {
    const snap = DD.Balance.snapshot ? DD.Balance.snapshot() : null;
    const old = DD.Balance.campaign.acts;
    DD.Balance.campaign.acts = n;
    try { return fn(); } finally { if (snap && DD.Balance.restore) DD.Balance.restore(snap); else DD.Balance.campaign.acts = old; }
  }
  /**
   * The real arena. Default: a scripted fight (sandbox flag: no deployment, heroes first then him, giveTurnTo allowed);
   * opts.real: the real path (deployment, rolled initiative).
   */
  function startFight(seed, opts) {
    opts = opts || {};
    const setup = DD.Encounter.build('boss_svammiel', partyAt(opts.level || LV, opts.ids), { rng: DD.RNG('svam:' + seed), difficulty: opts.diff || 'normal', act: 4 });
    if (opts.real) return DD.Combat.start(setup, { seed: seed, headless: true, difficulty: opts.diff || 'normal', kind: 'boss' });
    return DD.Combat.start(setup, { seed: seed, headless: true, difficulty: opts.diff || 'normal', kind: 'boss', sandbox: true,
      initiative: opts.initiative || 'heroesFirst', order: opts.order });
  }
  /** A clean fight at the first hero's turn: no round cheat pending, no wind-up, Fudge as given. */
  function cleanFight(seed, opts) {
    startFight(seed, opts);
    const f = F();
    if (f.next) { DD.Act.removeRule('svam_next'); f.next = null; }
    if (f.cur) { DD.Act.removeRule('svam_cheat'); f.cur = null; }
    sv().intents = [];
    B().updateBoard();
    return sv();
  }
  function freeFloor(pred) {
    return DD.Grid.allTiles().filter(function (t) { return t.t === 'svam_linoleum' && !t.obj && !DD.Grid.unitAt(t.x, t.y) && (!pred || pred(t)); })[0];
  }
  function panelTiles(id) { return B().panel(id).tiles; }
  function freeOn(id, not) { return panelTiles(id).filter(function (q) { const t = DD.Grid.tile(q.x, q.y); return !t.obj && !DD.Grid.unitAt(q.x, q.y) && DD.Grid.tile(q.x, q.y).t === 'svam_linoleum' && !(not && onList(not, q)); }); }
  /** End the round (every remaining hero turn passes; his turns run) with his AI switched off. */
  function quietRound() {
    const s = S();
    const off = s.aiOff;
    s.aiOff = true;
    try { DD.Combat.endRound(); } finally { s.aiOff = off; }
  }
  function realHeroIds() { return Object.keys(DD.defs.heroes).filter(function (k) { return !/^test_/.test(k); }); }

  // ---- registry & arena --------------------------------------------------------------------------------------------
  T.suite('boss_svammiel: registry, arena and encounter', function (t) {
    const ids = { enemies: [SV, IMP], skills: ['svam_pitchfork', 'svam_nat20', 'svam_buffet', 'svam_collapse', 'svam_rain', 'svam_honest', 'svam_jab'],
      objects: ['svam_dm_table', 'svam_rigged_die', 'svam_master_die'], terrain: ['svam_linoleum', 'svam_void', 'svam_stub'],
      statuses: ['svam_wings', 'svam_fudge', 'svam_caught', 'svam_guard', 'svam_clocking_in'], encounters: ['boss_svammiel'], cameos: ['svammiel'] };
    for (const kind in ids) ids[kind].forEach(function (id) { t.ok(!!DD.defs[kind][id], kind + ' ' + id + ' registered'); });
    const def = DD.getEnemy(SV);
    t.eq(def.tier, 'boss', 'boss tier');
    t.eq(def.act, 4, 'act 4');
    t.ok(def.hp === B().N.hp && def.hp >= 300 && def.hp <= 480, def.hp + ' HP (the knob; the act-4 boss band 300-480)');
    t.eq(def.pronoun, 'he', 'pronoun he (lead patch P4)');
    t.ok(def.boss && def.boss.title === 'The Floor Boss' && /I am not\. Going\. To\. Play\. FAIR\./.test(def.boss.intro), 'boss title + intro (V §9.1)');
    t.eq(def.mov, 5, 'move 5');
    t.eq(def.init, 4, 'initiative +4');
    t.eq(def.armor, B().N.armor, 'armor from the knob (' + def.armor + ')');
    t.eq(typeof def.ai, 'function', 'custom planner');
    t.ok(!def.flags.flying, 'flight comes from the Wings status, not the def (CAUGHT can ground him)');
    t.ok(DD.getStatus('svam_wings').flying === true && DD.getStatus('svam_wings').decay === 'never', 'Wings (Graph Paper): flying, never decays');
    t.eq(DD.getStatus('svam_caught').takenMult, 1.25, 'Caught Red-Handed: takenMult 1.25');
    t.ok(def.sprite.scale >= 1.8 && def.sprite.scale <= 2.4 && def.sprite.base === 'custom', 'custom painter, boss scale');
    t.eq(def.skills.join(), 'svam_pitchfork,svam_nat20,svam_buffet', 'skill slots = his immediate attacks (wind-ups are scripted)');
    ['svam_collapse', 'svam_rain'].forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(s.windupOnly === true && /^Wind-up/.test(DD.skillDesc(s, 1, null)), id + ': a wind-up-only skill whose desc says so');
    });
    t.eq(DD.skillDesc(DD.getSkill('svam_pitchfork'), 1, null), 'Deal ' + B().N.pitchfork + ' damage to an adjacent foe.', 'Pitchfork desc exact');
    t.eq(DD.skillDesc(DD.getSkill('svam_nat20'), 1, null), 'He rolls a d20 where nobody can see it. It\'s a 20. Deal ' + B().N.nat20 + ' damage to a foe within 6 he can see.', 'Natural Twenty desc exact');
    t.eq(DD.skillDesc(DD.getSkill('svam_buffet'), 1, null), 'Deal ' + B().N.buffet + ' damage to each adjacent foe and knock it back 2 tiles.', 'Wing Buffet desc exact');
    t.eq(DD.skillDesc(DD.getSkill('svam_rain'), 1, null), 'Wind-up: on his first turn after every hero has had one, hellfire rains on a cross around up to 3 heroes: ' + B().N.rain + ' fire damage.', 'Hellfire Rain desc exact');
    t.eq(DD.skillDesc(DD.getSkill('svam_honest'), 1, null), 'He has to roll where everyone can see it now. 1: nothing. 2-10: ' + B().N.honestLow + ' damage. 11-20: ' + B().N.honest + ' damage, to a foe within 6 he can see.', 'Honest d20 desc exact');
    t.eq(DD.skillDesc(DD.getSkill('svam_collapse'), 1, null), 'Wind-up: on his first turn after every hero has had one, the marked panel drops into the void: each grounded unit on it falls once (heroes: 25% of max HP, then climb out). It comes back at the end of the next round.', 'Floor Collapse desc exact');
    t.eq(DD.skillDesc(DD.getSkill('svam_jab'), 1, null), 'Deal 7 damage to an adjacent foe.', 'Clipboard Jab desc exact');
    t.ok(DD.getSkill('svam_honest').tags.indexOf('random') >= 0, 'the Honest d20 is tagged random (previews show "?")');
    // P3: every printed damage comes from a damage key of L (DD.AI.fightLevel scales them)
    t.ok(/Dmg|dmg/.test(Object.keys(DD.getSkill('svam_honest').levels[0]).join()), 'the Honest d20\'s low roll is a damage key (lowDmg)');
    // barks
    ['spawn', 'attack', 'hurt', 'lowhp', 'kill', 'stunned', 'death', 'phase2', 'phase3', 'ruling', 'dice', 'caught', 'named'].forEach(function (k) {
      t.ok(Array.isArray(def.barks[k]) && def.barks[k].length >= 1, 'barks.' + k);
    });
    for (const k in def.barks) def.barks[k].forEach(function (b) { t.ok(b.length <= 70, 'bark ≤ 70: ' + b); });
    t.ok(def.barks.named.indexOf('Stop sliming my floor, Benedick! It\'s LINOLEUM!') >= 0, 'named bark #17 names Benedick (exact line)');
    // every registered real hero has exactly one named line of his, by the exact capitalised name
    realHeroIds().forEach(function (id) {
      const words = DD.getHero(id).name.split(/[^A-Za-z]+/).filter(function (w) { return w.length >= 3 && /^[A-Z]/.test(w) && w !== 'The'; });
      const n = def.barks.named.filter(function (l) { return words.some(function (w) { return new RegExp('\\b' + w + '\\b').test(l); }); }).length;
      t.eq(n, 1, 'one named bark for ' + id);
    });
    t.eq(def.barks.named.length, 17, 'seventeen named lines (sixteen heroes of v2 + Benedick)');
    t.ok(!/four/i.test(def.barks.spawn.join(' ')), 'his opening lines count no doors ("all my toys", not "four")');
    t.eq((DD.defs.narration.svam_finale_open || []).length >= 6, true, 'svam_finale_open: 6 opening lines (the start cameo\'s announcer key in his fight)');
    // the imp
    const imp = DD.getEnemy(IMP);
    t.ok(imp.tier === 'minion' && imp.hp === 18 && imp.flags.flying && imp.aiStyle === 'assassin', 'Floor Staff Imp: minion, 18 HP, flying, a diver');
    // objects (lead patch P2: HP in the desc + "any single-target damage skill can break it", targetable decided)
    [['svam_rigged_die', B().N.dieHp], ['svam_master_die', B().N.masterHp]].forEach(function (p) {
      const o = DD.getObject(p[0]);
      t.ok(o.hp === p[1] && o.targetable === true && o.desc.indexOf(p[1] + ' HP') >= 0 && /any single-target damage skill can break it/.test(o.desc), p[0] + ': ' + p[1] + ' HP, targetable, desc says so');
    });
    t.ok(DD.getObject('svam_dm_table').hp === 0 && DD.getObject('svam_dm_table').targetable === false, 'the kids\' table can\'t be hurt or aimed at');
    // encounter
    const en = DD.getEncounter('boss_svammiel');
    t.ok(en.act === 4 && en.kind === 'boss' && en.weight === 0 && en.finale === true && !en.gauntlet, 'the finale: act 4, boss, weight 0, finale');
    // QA flow-3: the finale keeps Combat.start's boss banner ("Svammiel" / "The Floor Boss"): his own board has no cameo banner
    t.ok(en.banner !== false && en.cameo && en.cameo.start === 'svam_finale_open' && en.cameo.cheat === null, 'his title card (no banner: false), no start cheat (a Bribe does nothing here)');
    t.ok(en.reward.goldMult === 0 && en.reward.itemRarity === null, 'reward { goldMult 0, itemRarity null } (the run ends)');
    t.ok(en.shortName === 'The Last Floor' && en.shortName.length <= 24 && en.icon === '😈' && en.name === 'The Last Floor', 'name, shortName, icon');
    // arena
    t.eq(B().LAYOUT.length, 14, '14 rows');
    B().LAYOUT.forEach(function (r, y) { t.eq(r.length, 17, 'row ' + y + ' is 17 wide'); });
    startFight('reg' + t.seed);
    const st = S(), f = F();
    t.eq(st.grid.w + 'x' + st.grid.h, '17x14', 'the arena is 17 × 14');
    t.eq(f.panelOrder.length, 20, '20 panels');
    t.eq(st.data.panels.length, 20, 'state.data.panels lists their bounds');
    f.panelOrder.forEach(function (id) { t.eq(B().panel(id).tiles.length, 9, 'panel ' + id + ' is 3 × 3'); });
    t.eq(B().panelIdAt(8, 8), 'C3', 'panel naming: (8,8) is C3');
    t.ok(DD.Grid.tile(8, 8).tag === 'panel_C3', 'tile.tag = panel_C3');
    t.eq(DD.Grid.tile(0, 6).obj && DD.Grid.tile(0, 6).obj.id, 'svam_dm_table', 'the DM (demoted) at (0,6), off the board');
    t.ok(DD.Grid.isWalkable(1, 6), 'his interact tile (1,6) is floor (panel A2)');
    t.eq(objs('svam_rigged_die').map(function (q) { return q.x + ',' + q.y; }).sort().join(' '), '11,5 5,5 8,8', 'three Rigged Dice at (5,5), (11,5), (8,8)');
    const s = sv();
    t.ok(s && s.x === 8 && s.y === 2, 'Svammiel on his spot (8,2)');
    t.ok(DD.Grid.isFlying(s) && has(s, 'svam_wings'), 'he flies (Wings)');
    t.ok(DD.Grid.isDrop(0, 0) && DD.Grid.isDrop(16, 13), 'the void all around');
    t.ok(heroes().every(function (h) { const p = B().panelIdAt(h.x, h.y); return /^[BCD]4$/.test(p); }), 'heroes deploy on B4-D4');
  });

  T.suite('boss_svammiel: his turn, the wind-ups and his attacks deal what they say', function (t) {
    const s = cleanFight('turn' + t.seed);
    const mg = hero('test_mage');
    t.eq(B().namedBark(s, S()), '', 'a named bark needs a named hero in the fight (fixture heroes: none, Benedick\'s line included)');
    // his attacks at a hero with no armor, Block or damage passive: exactly the number the HUD prints (DD.AI.fightLevel)
    [['svam_pitchfork', { x: 8, y: 3 }], ['svam_nat20', { x: 8, y: 6 }]].forEach(function (p) {
      put(mg, p[1].x, p[1].y);
      mg.hp = mg.maxHp; mg.block = 0;
      const L = DD.AI.fightLevel(DD.getSkill(p[0]), 1, s);
      const hp0 = mg.hp;
      act(function () { DD.AI.useNow(s, p[0], mg); });
      t.eq(hp0 - mg.hp, L.dmg, p[0] + ' deals its printed number (' + L.dmg + ')');
    });
    const kn = hero('test_knight');
    // his full turn: one action, then a Floor Collapse wind-up on the busiest panel (phase 1)
    heroes().forEach(function (h) { h.hp = h.maxHp; });
    s.intents = [];
    act(function () { DD.AI.act(s); });
    const wu = s.intents.filter(function (i) { return i.skillId === 'svam_collapse'; })[0];
    t.ok(!!wu, 'he winds up Floor Collapse after his action');
    if (wu) {
      const id = wu.data.panel;
      t.ok(id && id !== 'A2', 'never A2 (' + id + ')');
      t.eq(wu.tiles.length, 9, 'the wind-up marks the whole panel');
      const onIt = heroes().filter(function (h) { return onList(wu.tiles, h); });
      t.ok(onIt.length > 0, 'it targets a panel with heroes on it (' + onIt.length + ')');
      // threatAt shows the fall on those tiles (honest: 25% of max HP)
      const h = onIt[0];
      const th = B().threatAt(s, h, h);
      t.ok(th && th.dmg === Math.ceil(h.maxHp * 0.25), 'threatAt: the fall on the marked panel (' + JSON.stringify(th) + ')');
      // when it lands (its timing: the FIGHTS-01 suite): heroes on it fall (25% max HP) once and climb out; the panel
      // comes back at the end of the next round
      const before = {};
      onIt.forEach(function (x) { before[x.id] = x.hp; });
      wu.turnsLeft = 1; wu.delay = 1; wu.window = 0;
      act(function () { DD.AI.resolveWindups(s); });
      t.ok(!B().present(id), 'the panel dropped');
      onIt.forEach(function (x) {
        t.eq(before[x.id] - x.hp, Math.ceil(x.maxHp * 0.25), x.name + ' fell: 25% of max HP');
        t.ok(!DD.Grid.isDrop(x.x, x.y), x.name + ' climbed out onto a panel');
      });
      t.ok(B().panel(id).tiles.every(function (q) { return DD.Grid.isDrop(q.x, q.y); }), 'every tile of it is the void');
      const r0 = S().round;
      quietRound();
      t.ok(!B().present(id) || S().round > r0 + 1, 'still gone at the end of the round it dropped');
      quietRound();
      t.ok(B().present(id), 'back at the end of the next round');
    }
    if (DD.getHero('zarathor')) {
      startFight('named' + t.seed, { ids: ['zarathor', 'test_knight', 'test_mage', 'test_rogue'] });
      t.ok(/Zarathor/.test(B().namedBark(sv(), S())), 'with Zarathor in the party: his named line');
    }
  });

  // ---- the cheat budget -------------------------------------------------------------------------------------------------
  T.suite('boss_svammiel: the cheat budget — one Round Cheat a round, announced a round ahead, live for its round only', function (t) {
    startFight('budget' + t.seed);
    const f = F();
    t.eq(f.cur, null, 'round 1 has no Round Cheat (its cheat is the NAT 20 initiative)');
    t.ok(f.next && f.next.round === 2, 'round 2\'s cheat is announced as round 1 starts (after deployment)');
    const nx = rule('svam_next');
    t.ok(nx && nx.next === true && nx.cheat === true && nx.source === 'svammiel' && /^Next round: /.test(nx.name), 'a "Next round" chip (next, cheat, source)');
    t.ok(nx && f.next.round === 2 && nx.desc === B().aheadDescOf(f.next), 'the chip carries the exact desc, written for round 2: ' + (nx && nx.desc));
    // QA FIGHTS-05: the announcement is printed in round 1 and names round 2 by number
    t.ok(S().log.some(function (l) { return l.round === 1 && /^😈 Svammiel cheats: .+\(round 2\)\. .+ Reason: .+\.$/.test(l.text); }),
      'the log line (round 1) names round 2 and ends "Reason: <reason>."');
    t.ok(rule('svam_p_nat20') && rule('svam_p_cutscenes') && rule('svam_rulings'), 'phase chips: NAT 20 (round 1), You Can\'t Skip My Cutscenes; the Rulings chip');
    const seen = [];
    let prev = null;
    for (let r = 1; r <= 7 && !S().result; r++) {
      const inspect = B().passiveText(sv());
      t.ok(inspect.indexOf('This round: ' + (f.cur ? B().CHEATS[f.cur.id].name : 'none')) >= 0 && inspect.indexOf('Next round: ' + (f.next ? B().CHEATS[f.next.id].name : 'none')) >= 0,
        'round ' + S().round + ': his inspect line names this round\'s and next round\'s cheats: ' + inspect.slice(0, 90));
      t.ok(/This round: .* · Next cheat: .* · Rulings \d+ · Fudge \d+/.test(S().objective.flavor), 'the objective subtitle: ' + S().objective.flavor);
      quietRound();
      if (S().result || f.phase > 1) break;
      const c = f.cur;
      if (c) {
        seen.push(c.id);
        t.eq(c.round, S().round, 'the live cheat belongs to this round');
        const live = rule('svam_cheat');
        t.ok(live && !live.next && live.cheatId === c.id, 'its chip is live (no "Next round") for round ' + S().round);
        t.ok(c.id !== prev, 'never last round\'s cheat (' + c.id + ')');
        t.ok(B().DECK.petty.indexOf(c.id) >= 0, 'phase 1 draws from the Petty deck (' + c.id + ')');
        prev = c.id;
      } else prev = null;
      t.ok(!f.next || f.next.round === S().round + 1, 'next round\'s cheat is always one round ahead');
    }
    const counts = {};
    seen.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    Object.keys(counts).forEach(function (id) { t.ok(counts[id] <= 2, id + ' at most twice a phase (' + counts[id] + ')'); });
    t.ok(seen.length >= 3, 'cheats went live: ' + seen.join(', '));
    // determinism: the same seed draws the same cheats, whatever the cosmetic RNG did in between
    const seq = function () {
      startFight('budget-det');
      const out = [F().next && F().next.id];
      for (let r = 0; r < 4 && !S().result; r++) { DD.rng.next(); DD.rng.next(); quietRound(); out.push(F().next && F().next.id); }
      return out.join();
    };
    t.eq(seq(), seq(), 'same seed, same cheats (drawn with the combat RNG; lines with the cosmetic RNG)');
  });

  T.suite('boss_svammiel: each Round Cheat does exactly what its chip says (and ends with its round)', function (t) {
    // R1 The Floor Is Lava: lava at the end of its round (8 fire + Burn to grounded units on it), cools at the end of the next
    let mg, cl, kn, ro;
    function fresh(seed) { const u = cleanFight(seed); mg = hero('test_mage'); cl = hero('test_cleric'); kn = hero('test_knight'); ro = hero('test_rogue'); return u; }
    let s = fresh('r1' + t.seed);
    put(mg, 1, 10); put(cl, 2, 10);   // panel A4 (x 1-3, y 10-12)
    DD.Act.addStatus(cl, 'svam_wings', { turns: -1, silent: true }, cl);   // a flyer for the test
    const c1 = B().force('svam_lava', { panel: 'A4' }, { now: true });
    t.eq(rule('svam_cheat').desc, 'The marked panel turns to lava at the end of this round and cools at the end of the next.', 'R1 desc exact');
    t.ok(S().data.zones.some(function (z) { return /Lava/.test(z.label) && z.tiles.length === 9; }), 'R1 marks the panel (a zone)');
    const th = B().threatAt(s, mg, mg);
    t.ok(th && th.dmg === B().N.lava, 'R1 threatAt: ' + B().N.lava + ' on the marked panel');
    let hpM = mg.hp, hpC = cl.hp;
    quietRound();
    t.ok(B().panel('A4').tiles.every(function (q) { return DD.Grid.tile(q.x, q.y).t === 'lava'; }), 'R1: the panel is lava at the end of its round');
    t.ok(hpM - mg.hp >= 8 && has(mg, 'burn'), 'R1: the grounded hero on it is scorched (8 fire + Burn): ' + (hpM - mg.hp));
    t.eq(cl.hp, hpC, 'R1: the flyer is untouched');
    t.ok(!rule('svam_cheat') || rule('svam_cheat').cheatId !== c1.id || F().cur !== c1, 'R1\'s chip ended with its round');
    quietRound();
    t.ok(B().panel('A4').tiles.every(function (q) { return DD.Grid.tile(q.x, q.y).t === 'svam_linoleum'; }), 'R1: it cools at the end of the next round');
    // R3 No Healing on My Floor
    s = fresh('r3' + t.seed);
    B().force('svam_no_healing', null, { now: true });
    kn.hp = kn.maxHp - 20;
    let got = 0;
    act(function () { got = DD.Act.heal(null, kn, 10); });
    t.eq(got, 5, 'R3: a 10 heal on a hero heals 5');
    act(function () { got = DD.Act.heal(null, kn, 1); });
    t.eq(got, 1, 'R3: min 1');
    s.hp = s.maxHp - 20;
    act(function () { got = DD.Act.heal(null, s, 10, { cause: 'status' }); });
    t.eq(got, 10, 'R3: his side heals in full');
    // R4 Skill Ban (a Ruling resets it)
    s = fresh('r4' + t.seed);
    const slot = mg.skills[0];
    const c4 = B().force('svam_ban', { unitId: mg.id, skillId: slot.id, hero: mg.name, skill: DD.getSkill(slot.id).name }, { now: true });
    t.eq(rule('svam_cheat').desc, DD.getSkill(slot.id).name + ' is banned: it is on cooldown through ' + mg.name + '\'s next turn.', 'R4 desc filled exactly');
    t.ok(slot.cd >= 1, 'R4: the skill is on cooldown');
    DD.Combat.giveTurnTo(mg);
    t.ok(/cooldown/i.test(String(DD.Combat.canUse(mg, slot))), 'R4: refused on the hero\'s next turn: ' + DD.Combat.canUse(mg, slot));
    F().rulings = 2;
    put(mg, 1, 6);
    act(function () { DD.Combat.interact(mg, 0, 6); });
    t.ok(c4.cancelled && slot.cd === 0, 'R4: a Ruling resets that cooldown');
    // R5 The Tilt: 2 tiles toward a landmark; bumps; the void is a fall; immovable heroes and flyers stay
    s = fresh('r5' + t.seed);
    put(mg, 7, 9); put(kn, 4, 11); put(ro, 10, 7); put(cl, 12, 7);
    DD.Act.addStatus(cl, 'svam_wings', { turns: -1, silent: true }, cl);
    kn.flags.immovable = true;
    try {
      B().force('svam_tilt', { dir: 'stuff' }, { now: true });
      t.eq(rule('svam_cheat').desc, 'At the end of this round every grounded unit slides 2 tiles toward your stuff.', 'R5 desc filled exactly');
      put(ro, 10, 11);
      const thr = B().threatAt(s, ro, ro);
      t.ok(thr && thr.dmg === Math.ceil(ro.maxHp * 0.25), 'R5 threatAt: a slide into the void costs 25% of max HP');
      const hpR = ro.hp;
      quietRound();
      t.ok(mg.x === 7 && mg.y === 11, 'R5: a grounded hero slides 2 tiles toward the deploy side (' + mg.x + ',' + mg.y + ')');
      t.ok(kn.x === 4 && kn.y === 11, 'R5: the immovable hero stays');
      t.ok(cl.x === 12 && cl.y === 7, 'R5: the flyer stays');
      t.ok(hpR - ro.hp === Math.ceil(ro.maxHp * 0.25) && !DD.Grid.isDrop(ro.x, ro.y), 'R5: off the edge = a fall (25% max HP), then climbs out');
    } finally { kn.flags.immovable = false; }
    // R7 Panel Swap: units, objects and floor trade places; flyers stay where they hover
    s = fresh('r7' + t.seed);
    put(mg, 10, 7);   // D3 offset (0,0)
    put(cl, 4, 4); DD.Act.addStatus(cl, 'svam_wings', { turns: -1, silent: true }, cl);   // B2 offset (0,0), flying
    B().force('svam_panel_swap', { panels: ['B2', 'D3'] }, { now: true });
    t.eq(rule('svam_cheat').desc, 'At the end of this round the two marked panels swap, with everything standing on them.', 'R7 desc exact');
    quietRound();
    t.ok(mg.x === 4 && mg.y === 4 || (B().panelIdAt(mg.x, mg.y) === 'B2'), 'R7: the grounded hero rode D3 to B2 (' + mg.x + ',' + mg.y + ')');
    t.ok(cl.x === 4 && cl.y === 4 || DD.Grid.tile(cl.x, cl.y).obj === null, 'R7: the flyer stayed where it hovered');
    t.ok(DD.Grid.tile(11, 8).obj && DD.Grid.tile(11, 8).obj.id === 'svam_rigged_die' && !DD.Grid.tile(5, 5).obj, 'R7: the Rigged Die at (5,5) rode to (11,8)');
    // R8 Moving Costs Extra: hero moves (and the swap move) cost 2 AP this round only
    s = fresh('r8' + t.seed);
    t.eq(DD.Combat.moveApCost(mg), 1, 'a move costs 1 AP before');
    B().force('svam_moving_costs', null, { now: true });
    t.eq(DD.Combat.moveApCost(mg), 2, 'R8: a hero move costs 2 AP');
    t.eq(DD.Combat.moveApCost(s), 1, 'R8: not his');
    put(mg, 6, 9); put(kn, 7, 9);
    DD.Combat.giveTurnTo(mg);
    const si = DD.Combat.swapInfo(mg, 7, 9);
    t.ok(si && si.ap === 2, 'R8: the swap move costs 2 AP too');
    quietRound();
    t.eq(DD.Combat.moveApCost(mg), 1, 'R8 ends with its round');
    // R9 New Seating Chart: whoever sits on the chairs swaps; a lone sitter moves; an immovable one stays
    s = fresh('r9' + t.seed);
    put(mg, 6, 8); put(kn, 9, 3);
    B().force('svam_swap', { a: { x: 6, y: 8 }, b: { x: 9, y: 3 } }, { now: true });
    quietRound();
    t.ok(mg.x === 9 && mg.y === 3 && kn.x === 6 && kn.y === 8, 'R9: the two on the chairs swapped');
    s = fresh('r9b' + t.seed);
    put(mg, 6, 8);
    B().force('svam_swap', { a: { x: 6, y: 8 }, b: { x: 9, y: 3 } }, { now: true });
    quietRound();
    t.ok(mg.x === 9 && mg.y === 3, 'R9: someone on only one chair moves to the other');
    s = fresh('r9c' + t.seed);
    put(kn, 6, 8); kn.flags.immovable = true;
    try {
      B().force('svam_swap', { a: { x: 6, y: 8 }, b: { x: 9, y: 3 } }, { now: true });
      quietRound();
      t.ok(kn.x === 6 && kn.y === 8, 'R9: an immovable hero stays on his chair');
    } finally { kn.flags.immovable = false; }
    // R10 Bring a Friend: two imps on the marked tiles at the start of its round; they clock in, then act; at most 4
    s = fresh('r10' + t.seed);
    const tiles = [freeFloor(function (q) { return q.y === 6 && q.x >= 3; }), freeFloor(function (q) { return q.y === 7 && q.x >= 12; })];
    B().force('svam_wander', { tiles: [{ x: tiles[0].x, y: tiles[0].y }, { x: tiles[1].x, y: tiles[1].y }] }, { now: true });
    let imps = S().units.filter(function (u) { return u.defId === IMP && !u.dead; });
    t.eq(imps.length, 2, 'R10: two imps arrive');
    t.ok(imps.every(function (u) { return onList(tiles, u); }), 'R10: on the marked tiles');
    let used = 0;
    DD.Act.addRule({ id: 'test_imp_watch', name: 'w', hooks: { onSkillUsed: function (ctx) { if (ctx.user && ctx.user.defId === IMP) used++; } } });
    try {
      imps.forEach(function (u) { put(u, mg.x + 1 <= 15 ? mg.x + 1 : mg.x - 1, mg.y); });
      act(function () { imps.forEach(function (u) { DD.AI.act(u); }); });
      t.eq(used, 0, 'R10: they clock in on their arrival round');
    } finally { DD.Act.removeRule('test_imp_watch'); }
    B().force('svam_wander', { tiles: [{ x: 3, y: 9 }, { x: 13, y: 9 }, { x: 3, y: 3 }] }, { now: true });
    B().force('svam_wander', { tiles: [{ x: 13, y: 3 }, { x: 2, y: 8 }] }, { now: true });
    imps = S().units.filter(function (u) { return u.defId === IMP && !u.dead; });
    t.ok(imps.length <= 4, 'R10: at most 4 alive (' + imps.length + ')');
    // R11 No Signatures (E13 veto, else the 99-AP fallback) for its round only
    ['veto', 'cost'].forEach(function (mode) {
      if (mode === 'veto' && typeof DD.Combat.vetoOf !== 'function') { t.log('E13 not landed: the veto path is skipped'); return; }
      B().vetoMode = mode;
      try {
        s = fresh('r11' + mode + t.seed);
        S().hype = 100;
        B().force('svam_no_signatures', null, { now: true });
        DD.Combat.giveTurnTo(mg);
        mg.ap = 3;
        const why = DD.Combat.canUse(mg, mg.signature);
        t.ok(why === (mode === 'veto' ? 'Banned by Svammiel (No Signatures, That\'s Overpowered).' : 'Not enough AP.'), 'R11 (' + mode + '): the signature is refused: ' + why);
        t.ok(DD.Combat.canUse(mg, mg.skills[0]) === true || !/Banned|AP/.test(String(DD.Combat.canUse(mg, mg.skills[0]))), 'R11: other skills are fine');
        quietRound();
        DD.Combat.giveTurnTo(mg);
        S().hype = 100; mg.ap = 3;
        const w2 = DD.Combat.canUse(mg, mg.signature);
        t.ok(!/Banned by Svammiel/.test(String(w2)) && w2 !== 'Not enough AP.', 'R11 ends with its round: ' + w2);
      } finally { B().vetoMode = 'auto'; }
    });
    // R12 Hype Confiscated: −30 at the start of its round
    s = fresh('r12' + t.seed);
    S().hype = 50;
    B().force('svam_hype_tax', null, { now: true });
    t.eq(S().hype, 20, 'R12: the party loses 30 Hype');
    // R6 Rule Zero: no effect at all
    s = fresh('r6' + t.seed);
    B().force('svam_rule_zero', null, { now: true });
    t.eq(rule('svam_cheat').desc, 'Svammiel is handsome. That\'s the rule.', 'R6 desc exact');
    t.ok(!Object.keys(rule('svam_cheat').hooks || {}).length, 'R6 has no hooks');
    t.eq(B().rulingValue(), 0, 'AutoPlay values a Ruling on R6 at 0');
    // R2 Bonus Action: two attacks on his turn
    s = fresh('r2' + t.seed);
    put(mg, 8, 3); put(kn, 9, 2);
    B().force('svam_bonus', null, { now: true });
    let acts = 0;
    DD.Act.addRule({ id: 'test_sv_watch', name: 'w', hooks: { onSkillUsed: function (ctx) { if (ctx.user === s && !(ctx.intent && ctx.intent.windup)) acts++; } } });
    try { act(function () { DD.AI.act(s); }); } finally { DD.Act.removeRule('test_sv_watch'); }
    t.eq(acts, 2, 'R2: two attacks on his turn');
  });

  // ---- snap cheats, Fudge, the stun guard, dice ---------------------------------------------------------------------------
  T.suite('boss_svammiel: snap cheats (Fudge), Don\'t Stun the DM, Rigged Dice', function (t) {
    const s = cleanFight('snap' + t.seed);
    const kn = hero('test_knight'), mg = hero('test_mage');
    const f = F();
    t.eq(f.fudge, 3, 'three Fudge tokens');
    t.ok(has(s, 'svam_fudge') && s.statuses.filter(function (x) { return x.id === 'svam_fudge'; })[0].stacks === 3, 'the Fudge status shows 3');
    // S1 Reroll!: the round's first stun doesn't land
    let st = null;
    act(function () { st = DD.Act.addStatus(s, 'stun', { turns: 1 }, kn); });
    t.ok(!st && !has(s, 'stun'), 'S1 Reroll!: the first stun this round is refused');
    t.eq(f.fudge, 2, 'S1 spent a token');
    act(function () { st = DD.Act.addStatus(s, 'stun', { turns: 1 }, kn); });
    t.ok(!!st && has(s, 'stun'), 'one snap a round: the second stun lands');
    act(function () { DD.Act.removeStatus(s, 'stun', { silent: true }); });
    act(function () { st = DD.Act.addStatus(s, 'stun', { turns: 1 }, kn); });
    t.ok(!st, 'Don\'t Stun the DM: stun-proof until he has played a turn');
    t.eq(f.fudge, 2, 'the guard costs no token');
    t.ok(has(s, 'svam_guard'), 'the guard shows as a status');
    // S2 That's a 1 Now: the next round's first 20+ hit deals 1 (preview = result)
    f.guard = null; DD.Act.removeStatus(s, 'svam_guard', { silent: true });
    quietRound();
    const hp0 = s.hp;
    let dealt = 0;
    act(function () { dealt = DD.Act.damage(kn, s, 30, { cause: 'skill' }); });
    t.eq(dealt, 1, 'S2: the round\'s first 20+ hit deals 1');
    t.eq(f.fudge, 1, 'S2 spent a token');
    act(function () { dealt = DD.Act.damage(kn, s, 30, { cause: 'skill' }); });
    t.ok(dealt > 20, 'one snap a round: the next big hit goes through (' + dealt + ')');
    t.ok(s.hp < hp0, 'he took damage');
    // the estimate mirrors S2 (AutoPlay and the HUD's numbers stay honest)
    quietRound();
    const est = DD.AI.estimate(kn, s, 30, null);
    t.eq(est, 1, 'estimate: a 30 hit on him is 1 while a snap is ready');
    // Rigged Die: −1 Fudge now and for the fight, +1 Ruling, +8 Hype
    const r0 = f.rulings, h0 = S().hype, m0 = f.fudgeMax, fu0 = f.fudge;
    const die = objs('svam_rigged_die')[0];
    act(function () { DD.Act.damageObject(mg, die.x, die.y, 99); });
    t.ok(!DD.Grid.tile(die.x, die.y).obj, 'a Rigged Die breaks');
    t.eq(f.fudgeMax, m0 - 1, 'its max drops for the fight');
    t.eq(f.fudge, Math.max(0, Math.min(fu0 - 1, m0 - 1)), 'a token now');
    t.eq(f.rulings, r0 + 1, '+1 Ruling');
    t.eq(S().hype, Math.min(100, h0 + 8), '+8 Hype');
    objs('svam_rigged_die').forEach(function (q) { act(function () { DD.Act.damageObject(mg, q.x, q.y, 99); }); });
    t.eq(f.fudgeMax, 0, 'three broken: no Fudge, ever');
    quietRound();
    act(function () { st = DD.Act.addStatus(s, 'stun', { turns: 1 }, kn); });
    t.ok(!!st, 'no tokens: no Reroll!');
  });

  // ---- Rulings ------------------------------------------------------------------------------------------------------------
  T.suite('boss_svammiel: Rulings from the DM at the kids\' table', function (t) {
    const s = cleanFight('ruling' + t.seed);
    const mg = hero('test_mage');
    const f = F();
    put(mg, 1, 6);
    DD.Combat.giveTurnTo(mg);
    t.ok(!DD.Combat.interactions(mg).some(function (o) { return o.x === 0 && o.y === 6; }), 'no Ruling without a cheat to cancel');
    B().force('svam_tilt', { dir: 'throne' });
    DD.Combat.giveTurnTo(mg);
    const ia = DD.Combat.interactions(mg).filter(function (o) { return o.x === 0 && o.y === 6; })[0];
    t.ok(ia && ia.ap === 1 && ia.label === 'Ask for a Ruling', 'Ask for a Ruling (1 AP) from the panel next to him');
    const hp0 = s.hp, n0 = f.rulings;
    t.ok(DD.Combat.interact(mg, 0, 6), 'the Ruling');
    t.ok(f.next === null || f.next.cancelled, 'no cheat live: it cancels next round\'s');
    t.ok(!rule('svam_next'), 'its chip is gone');
    t.eq(hp0 - s.hp, 10, 'Svammiel takes 10 damage');
    t.eq(f.rulings, n0 - 1, 'one Ruling spent');
    t.ok(logHas(/OBJECTION! That is not Rules As Written!/), 'the DM objects (log)');
    B().force('svam_lava', { panel: 'C3' }, { now: true });
    DD.Combat.giveTurnTo(mg);
    t.ok(!DD.Combat.interactions(mg).some(function (o) { return o.x === 0 && o.y === 6; }), 'once a round');
    quietRound();
    t.ok(B().panel('C3').tiles.some(function (q) { return DD.Grid.tile(q.x, q.y).t === 'lava'; }), '(the uncancelled lava landed)');
    // a live cheat comes first
    const c = B().force('svam_moving_costs', null, { now: true });
    f.rulings = 1;
    DD.Combat.giveTurnTo(mg);
    put(mg, 1, 6);
    t.ok(DD.Combat.interact(mg, 0, 6), 'a second Ruling next round');
    t.ok(c.cancelled && !rule('svam_cheat'), 'it cancels this round\'s live cheat first');
    t.eq(DD.Combat.moveApCost(mg), 1, 'Moving Costs Extra is gone');
    t.eq(f.rulings, 0, 'out of Rulings');
  });

  // ---- phases ---------------------------------------------------------------------------------------------------------------
  T.suite('boss_svammiel: phases — the gates, I Go Twice, NO MORE FLOOR, Master Dice, Pencilled HP', function (t) {
    let s = cleanFight('ph' + t.seed);
    const f = F();
    f.fudge = 0; DD.Act.removeStatus(s, 'svam_fudge', { silent: true });
    const T2 = B().threshold(s, 2), T3 = B().threshold(s, 3);
    t.eq(T2 + '/' + T3, Math.ceil(s.maxHp * 2 / 3) + '/' + Math.ceil(s.maxHp / 3), 'phases at 2/3 and 1/3 of his HP (' + T2 + '/' + T3 + ')');
    // one huge hit: the phase flips at once, the damage carries on only to the next floor; no skipping, no death
    act(function () { DD.Act.damage(null, s, 999, { cause: 'other' }); });
    t.eq(f.phase, 2, 'phase 2 after crossing 320');
    t.eq(s.hp, T3, 'clamped at the next phase\'s floor (' + T3 + ')');
    act(function () { DD.Act.damage(null, s, 999, { cause: 'other' }); });
    t.ok(f.phase === 2 && s.hp === T3 && !s.dead, 'the same round: no second phase, no death (You Can\'t Skip My Cutscenes)');
    t.eq(s.turnsPerRound, 2, 'I Go Twice: two initiative entries from the next round (E2)');
    t.ok(rule('svam_p_twice'), 'the I Go Twice chip');
    t.eq(f.fudge, f.fudgeMax, 'Fudge refilled');
    quietRound();
    if (typeof DD.Combat.entriesPerRound === 'function') t.eq(S().order.filter(function (e) { return e.unitId === s.id; }).length, 2, 'two entries this round');
    else t.log('E2 not landed: two actions on one turn instead');
    t.ok(!F().next || B().DECK.blatant.indexOf(F().next.id) >= 0, 'phase 2 draws from the Blatant deck');
    // phase 3: NO MORE FLOOR
    act(function () { DD.Act.damage(null, s, 5, { cause: 'other' }); });
    t.eq(f.phase, 3, 'phase 3 below 160');
    t.eq(s.turnsPerRound, 1, 'back to one entry');
    t.ok(!f.next && !rule('svam_next'), 'Round Cheats stop');
    t.ok(rule('svam_p_floor') && rule('svam_p_pencil') && rule('svam_p_dice'), 'the phase-3 chips');
    const dice = objs('svam_master_die');
    t.eq(dice.length, 3, 'three Master Dice');
    t.eq(f.masterPlaced, 3, 'placed 3');
    const cols = dice.map(function (q) { return B().panelIdAt(q.x, q.y).charAt(0); });
    t.eq(new Set(cols).size, 3, 'in three different columns (' + cols.join() + ')');
    t.ok(dice.every(function (q) { return B().CORE.indexOf(B().panelIdAt(q.x, q.y)) < 0; }), 'on outer panels');
    t.ok(f.drop && f.drop.ids.length === 2 && f.drop.round === S().round + 1, 'two outer panels marked to drop at the end of the next round');
    t.ok(f.drop.ids.every(function (id) { return id !== 'A2' && B().CORE.indexOf(id) < 0; }), 'never A2 or the core: ' + f.drop.ids.join());
    const marked = f.drop.ids.slice();
    // pencil: up to 5 per standing die of this round's damage, never above 160
    s.hp = T3 - 40;
    f.taken = 30;
    quietRound();
    t.eq(s.hp, T3 - 40 + 15, 'Pencilled HP: 3 dice × 5 = 15 rubbed out');
    t.ok(marked.every(function (id) { return B().present(id); }), 'the marked panels still stand at the end of the round they were marked');
    quietRound();
    t.ok(marked.every(function (id) { return !B().present(id); }), 'they drop for good at the end of the next round');
    t.ok(f.drop && f.drop.ids.every(function (id) { return marked.indexOf(id) < 0; }), 'the next pair is marked: ' + (f.drop && f.drop.ids.join()));
    t.ok(objs('svam_master_die').length === 3, 'dice on a dropping panel tumbled to one that stays');
    // drops never take the core or A2
    for (let i = 0; i < 9 && f.drop; i++) quietRound();
    t.ok(B().CORE.concat(['A2']).every(function (id) { return B().present(id) || F().collapsed.some(function (c) { return c.id === id; }); }), 'the core and A2 never drop for good');
    t.eq(f.gone.length, 13, 'all 13 droppable panels gone, then it stops');
    // CAUGHT CHEATING
    s = sv();
    s.hp = 100;
    const before = s.hp;
    objs('svam_master_die').forEach(function (q) { act(function () { DD.Act.damageObject(hero('test_mage'), q.x, q.y, 99); }); });
    t.ok(f.caught, 'all Master Dice broken: CAUGHT CHEATING');
    t.ok(!has(s, 'svam_wings') && !DD.Grid.isFlying(s), 'grounded');
    t.ok(has(s, 'svam_caught'), 'Caught Red-Handed');
    t.eq(s.skillSlots.map(function (x) { return x.id; }).join(), 'svam_pitchfork,svam_honest,svam_buffet', 'the Honest d20 replaces Natural Twenty');
    t.ok(!has(s, 'svam_fudge') && f.fudge === 0 && !f.drop, 'no Fudge, no more drops');
    t.ok(!rule('svam_rulings') && !rule('svam_p_floor'), 'no Rulings or cheat chips');
    t.ok(!DD.Grid.isDrop(s.x, s.y), 'over the void he fell (and climbed out)');
    t.ok(s.hp <= before, 'HP ' + before + ' → ' + s.hp);
    // a fall costs him a flat 30 (with Caught Red-Handed's ×1.25 already in)
    const edge = DD.Grid.allTiles().filter(function (q) { return DD.Grid.isFree(q.x, q.y) && !DD.Grid.isDrop(q.x, q.y) && DD.Grid.isDrop(q.x, q.y - 1) && q.y > 0; })[0];
    if (t.ok(!!edge, 'a floor tile at the void\'s edge')) {
      put(s, edge.x, edge.y);
      const h0 = s.hp;
      act(function () { DD.Act.push(hero('test_knight'), s, { x: 0, y: -1 }, 1); });
      t.eq(h0 - s.hp, 30, 'a fall costs him 30');
    }
  });

  // ---- NAT 20 initiative (the real path) --------------------------------------------------------------------------------
  T.suite('boss_svammiel: Initiative? Natural 20. (rolled fights)', function (t) {
    withActs(4, function () {
      startFight('init' + t.seed, { real: true });
      act(function () { DD.Combat.rollInitiative(); });
      const e = S().order.filter(function (x) { return x.unitId === sv().id; })[0];
      t.ok(e && e.roll === 20 && e.total === 20 + e.init, 'his round-1 roll is a 20 (' + (e && e.roll) + ')');
      t.ok(logHas(/😈 Svammiel cheats: Initiative\? Natural 20\. His round-1 initiative roll is a 20\. Reason: /), 'the cheat is logged with its reason');
    });
  });

  // ---- the Radio Edit (the goats' cameo cheat) -------------------------------------------------------------------------------
  /** A sandbox with heroes holding exactly these skills: [[heroId, [[skillId, level], …]], …]. */
  function radioFight(spec, seed) {
    DD.Combat.sandbox({ w: 9, h: 9, seed: seed || 'radio', enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
      heroes: spec.map(function (h, i) { return { id: h[0], x: i, y: 0, level: 6, skills: h[1].map(function (p) { return { id: p[0], level: p[1] }; }) }; }) });
    return S();
  }
  function pickOf(spec) { radioFight(spec); const p = B().radioPick(S()); return p ? p.def.id + '@' + p.unit.defId : null; }
  T.suite('boss_svammiel: the Radio Edit picks exactly one skill (each tie-break) and fills its desc', function (t) {
    const C = B().CAMEO_CHEATS.svam_cameo_radio;
    t.eq(C.desc, '<Skill> (<Hero>) is bleeped: it can\'t be used this fight.', 'the template');
    t.ok(C.name === 'Radio Edit' && C.icon === '📻' && C.rounds === -1, 'Radio Edit 📻, the whole fight (rounds −1)');
    t.eq(pickOf([['test_knight', [['test_shield_bash', 1], ['test_cleave', 2]]], ['test_mage', [['test_fireball', 1], ['test_frost_ray', 1]]]]), 'test_cleave@test_knight',
      'the highest skill level wins');
    t.eq(pickOf([['test_knight', [['test_cleave', 2]]], ['test_mage', [['test_fireball', 2]]]]), 'test_fireball@test_mage', 'a level tie: the higher L.dmg (6 > 5)');
    t.eq(pickOf([['test_knight', [['test_cleave', 3]]], ['test_mage', [['test_fireball', 3]]]]), 'test_cleave@test_knight', 'level and damage tied: party order');
    t.eq(pickOf([['test_mage', [['test_fireball', 3]]], ['test_knight', [['test_cleave', 3]]]]), 'test_fireball@test_mage', '(party order the other way round)');
    t.eq(pickOf([['test_knight', [['test_shield_bash', 2], ['test_cleave', 2]]]]), 'test_shield_bash@test_knight', 'one hero, all tied: slot order');
    t.eq(pickOf([['test_knight', [['test_cleave', 2], ['test_shield_bash', 2]]]]), 'test_cleave@test_knight', '(slot order the other way round)');
    t.eq(pickOf([['test_knight', [['test_war_shout', 3], ['test_shield_bash', 1]]]]), 'test_shield_bash@test_knight', 'a skill that deals no damage is never picked');
    t.eq(pickOf([['test_knight', [['test_war_shout', 3], ['test_guard_ally', 3]]]]), null, 'no damage skill: no pick');
    // never the basic or the signature (they are no socketed skills), a 'shapeshift' skill or a revive
    const zap = DD.getSkill('test_chain_zap'), tags0 = zap.tags, filt0 = zap.target.filter;
    try {
      zap.tags = tags0.concat(['shapeshift']);
      t.eq(pickOf([['test_mage', [['test_chain_zap', 3], ['test_fireball', 1]]]]), 'test_fireball@test_mage', 'a \'shapeshift\' skill is never picked');
      zap.tags = tags0;
      zap.target.filter = 'downedAlly';
      t.eq(pickOf([['test_mage', [['test_chain_zap', 3], ['test_fireball', 1]]]]), 'test_fireball@test_mage', 'a revive (downedAlly) is never picked');
    } finally { zap.tags = tags0; zap.target.filter = filt0; }
    radioFight([['test_knight', [['test_cleave', 2]]]]);
    const p = B().radioPick(S());
    t.ok(p && p.unit.skills.indexOf(p.slot) >= 0 && p.unit.basic !== p.slot && p.unit.signature !== p.slot, 'the pick is a socketed slot');
    t.eq(B().radioDesc(p), 'Wide Cleave (Sir Testsalot) is bleeped: it can\'t be used this fight.', 'the filled desc');
    // ≤ 90 characters for every registered hero × each of its damage skills (the card's effect line)
    let n = 0;
    Object.keys(DD.defs.heroes).filter(function (k) { return !/^test_/.test(k); }).forEach(function (hid) {
      const h = DD.getHero(hid);
      (h.skillPool || []).forEach(function (sid) {
        const s = DD.getSkill(sid);
        if (!s || (s.tags || []).indexOf('shapeshift') >= 0 || !s.levels.some(function (L) { return (+DD.resolve(L.dmg, L, null, 0) || 0) > 0; })) return;
        const d = s.name + ' (' + h.name + ') is bleeped: it can\'t be used this fight.';
        n++;
        t.ok(d.length <= 90, 'Radio Edit desc ≤ 90: ' + d + ' (' + d.length + ')');
      });
    });
    t.log('Radio Edit descs checked for ' + n + ' hero damage skills');
  });

  T.suite('boss_svammiel: the Radio Edit refuses its skill all fight (E13 veto, and the 99-AP fallback)', function (t) {
    ['veto', 'cost'].forEach(function (mode) {
      if (mode === 'veto' && typeof DD.Combat.vetoOf !== 'function') { t.log('E13 not landed: the veto path is skipped'); return; }
      B().vetoMode = mode;
      try {
        radioFight([['test_knight', [['test_shield_bash', 1], ['test_cleave', 3]]], ['test_mage', [['test_fireball', 2]]]], 'radio-' + mode);
        const rule0 = B().applyCameoCheat('svam_cameo_radio');
        const kn = hero('test_knight');
        const slot = kn.skills.filter(function (x) { return x.id === 'test_cleave'; })[0];
        t.ok(rule0 && rule0.id === 'cameo:svam_cameo_radio' && rule0.cheat === true && rule0.turns === -1, mode + ': a whole-fight cheat rule');
        t.eq(rule0.desc, 'Wide Cleave (Sir Testsalot) is bleeped: it can\'t be used this fight.', mode + ': the rule carries the filled desc');
        t.ok(S().data.cameoRadio && S().data.cameoRadio.unitId === kn.id && S().data.cameoRadio.skillId === 'test_cleave', mode + ': state.data.cameoRadio');
        const want = mode === 'veto' ? 'Bleeped by Svammiel (Radio Edit).' : 'Not enough AP.';
        for (let r = 0; r < 3; r++) {
          DD.Combat.giveTurnTo(kn);
          kn.ap = 3;
          t.eq(DD.Combat.canUse(kn, slot), want, mode + ', round ' + S().round + ': refused');
          t.ok(DD.Combat.canUse(kn, kn.skills[0]) !== want, mode + ': his other skill is not');
          act(function () { DD.Act.resetCooldowns(kn); });
          kn.ap = 3;
          t.eq(DD.Combat.canUse(kn, slot), want, mode + ': a cooldown reset does not undo it');
          t.ok(!DD.Combat.useSkill(kn, slot, 8, 8), mode + ': useSkill refuses it');
          DD.Combat.endRound();
        }
        const mg = hero('test_mage');
        DD.Combat.giveTurnTo(mg);
        mg.ap = 3;
        t.ok(DD.Combat.canUse(mg, mg.skills[0]) !== want, mode + ': another hero\'s skills are untouched');
        // AutoPlay never picks it
        radioFight([['test_knight', [['test_cleave', 3], ['test_shield_bash', 1]]]], 'radio-ap-' + mode);
        B().applyCameoCheat('svam_cameo_radio');
        const k2 = hero('test_knight');
        put(S().units.filter(function (u) { return u.defId === 'test_grunt'; })[0], k2.x + 1, k2.y);
        let banned = 0;
        DD.Act.addRule({ id: 'test_radio_watch', name: 'w', hooks: { onSkillUsed: function (ctx) { if (ctx.user === k2 && ctx.skill && ctx.skill.id === 'test_cleave') banned++; } } });
        try { for (let r = 0; r < 3 && !S().result; r++) { DD.Combat.giveTurnTo(k2); k2.ap = 3; DD.AutoPlay.takeTurn(); DD.Combat.endRound(); } } finally { DD.Act.removeRule('test_radio_watch'); }
        t.eq(banned, 0, mode + ': AutoPlay never uses the bleeped skill');
      } finally { B().vetoMode = 'auto'; }
    });
    // through the engine (js/engine/cameo.js) the same cheat fills the same desc
    if (DD.Cameo && !DD.Cameo.stub) {
      radioFight([['test_knight', [['test_cleave', 3]]]], 'radio-engine');
      const r = DD.Cameo.cheat('svammiel', 'svam_cameo_radio');
      t.ok(r && r.desc === 'Wide Cleave (Sir Testsalot) is bleeped: it can\'t be used this fight.', 'DD.Cameo.cheat fills the desc: ' + (r && r.desc));
      t.ok(logHas(/😈 Svammiel cheats: Radio Edit\. Wide Cleave \(Sir Testsalot\) is bleeped: it can't be used this fight\. Reason: /), 'the engine\'s log line');
      radioFight([['test_knight', [['test_war_shout', 3]]]], 'radio-none');
      t.eq(DD.Cameo.cheat('svammiel', 'svam_cameo_radio'), null, 'no candidate: no cheat (the cameo plays without a card)');
    } else t.log('DD.Cameo is the core stand-in: the engine route is skipped');
  });

  // ---- the other four cameo cheats --------------------------------------------------------------------------------------------
  T.suite('boss_svammiel: cameo cheats — Green Thumb, Nepotism, That\'s a 1 Now, The Floor Is Lava', function (t) {
    const CC = B().CAMEO_CHEATS;
    ['svam_green_thumb', 'svam_nepotism', 'svam_cameo_one', 'svam_cameo_lava', 'svam_cameo_radio'].forEach(function (id) {
      const c = CC[id];
      t.ok(c && c.id === id && c.name.length <= 24 && c.desc.length <= 90 && typeof c.icon === 'string', id + ': name ≤ 24, desc ≤ 90 (' + c.desc.length + ')');
      t.ok(DD.getCameo('svammiel').cheats[id] === c, id + ' is in the svammiel cameo def');
      for (const k in (c.hooks || {})) t.ok(['modifyInitiative', 'modifyFinalDamage', 'estimateDealt', 'modifyUse', 'modifyCost', 'modifyIncomingDamage', 'modifyStatus'].indexOf(k) >= 0, id + ': known hook ' + k);
    });
    t.eq(CC.svam_green_thumb.desc, 'Svammiel planted two Strangler Vines for the Gardener.', 'Green Thumb desc exact');
    t.eq(CC.svam_nepotism.desc, 'The League are Svammiel\'s favourites: +3 initiative for every League member.', 'Nepotism desc exact');
    t.eq(CC.svam_cameo_one.desc, 'The first hit of 10 or more damage on Galbraith this fight deals 1 instead.', 'That\'s a 1 Now desc exact');
    t.eq(CC.svam_cameo_lava.desc, 'The patch on the path to the cauldron is lava until the end of round 3. Hags don\'t burn.', 'The Floor Is Lava desc exact');
    // Green Thumb (needs C1's Gardener and vines)
    if (DD.getEnemy(B().N.vine) && DD.getEnemy(B().N.gardener)) {
      DD.Combat.sandbox({ w: 14, h: 12, seed: 'gt', heroes: [{ id: 'test_knight', x: 4, y: 11 }], enemies: [{ id: B().N.gardener, x: 6, y: 1 }] });
      const r = B().applyCameoCheat('svam_green_thumb');
      const vines = S().units.filter(function (u) { return u.defId === B().N.vine && !u.dead; });
      t.ok(r && vines.length === 2, 'Green Thumb: two vines');
      t.ok(vines.every(function (v) { return v.ownerId === S().units.filter(function (u) { return u.defId === B().N.gardener; })[0].id; }), 'owned by the Gardener');
      t.ok(vines.every(function (v) { return onList(B().N.vinePos, v); }), 'on (5,9) and (8,9)');
    } else t.log('the Gardener (C1) is not loaded: Green Thumb\'s effect is skipped');
    DD.Combat.sandbox({ w: 6, h: 6, seed: 'gt0', heroes: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 5, y: 5 }] });
    t.eq(B().applyCameoCheat('svam_green_thumb'), null, 'Green Thumb does nothing without the Gardener (no chip)');
    // Nepotism: +3 initiative for units tagged league (rolled fights)
    DD.Combat.sandbox({ w: 8, h: 8, seed: 'nep', initiative: 'roll', deploy: true, deployTiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      heroes: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }, { id: 'test_archer', x: 7, y: 7 }] });
    const lg = S().units.filter(function (u) { return u.defId === 'test_grunt'; })[0];
    lg.tags.push('league');
    t.ok(!!B().applyCameoCheat('svam_nepotism'), 'Nepotism applies (a League member is here)');
    act(function () { DD.Combat.rollInitiative(); });
    S().order.forEach(function (e) {
      const u = DD.Combat.byId(e.unitId);
      t.eq(e.total - e.roll - e.init, u === lg ? 3 : 0, (u === lg ? 'the League member gets +3' : u.name + ' gets nothing extra'));
    });
    DD.Combat.sandbox({ w: 6, h: 6, seed: 'nep0', heroes: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 5, y: 5 }] });
    t.eq(B().applyCameoCheat('svam_nepotism'), null, 'no League here: no Nepotism');
    // That's a 1 Now (the target's id is a knob: a test enemy stands in for Galbraith)
    const N0 = B().N.galbraith;
    B().N.galbraith = 'test_brute';
    try {
      DD.Combat.sandbox({ w: 6, h: 6, seed: 'one', heroes: [{ id: 'test_mage', x: 0, y: 0 }], enemies: [{ id: 'test_brute', x: 1, y: 0 }] });
      const br = S().units.filter(function (u) { return u.defId === 'test_brute'; })[0], mg = hero('test_mage');
      t.ok(!!B().applyCameoCheat('svam_cameo_one'), 'That\'s a 1 Now applies');
      t.eq(DD.AI.estimate(mg, br, 15, null), 1, 'the estimate says 1 (estimateDealt on the rule)');
      let d = 0;
      act(function () { d = DD.Act.damage(mg, br, 8, { cause: 'skill' }); });
      t.eq(d, 8 - (br.armor || 0), 'a small hit goes through');
      act(function () { d = DD.Act.damage(mg, br, 15, { cause: 'skill' }); });
      t.eq(d, 1, 'the first 10+ hit deals 1');
      t.ok(!rule('cameo:svam_cameo_one'), 'spent: its chip is gone (QA FIGHTS-11)');
      act(function () { d = DD.Act.damage(mg, br, 15, { cause: 'skill' }); });
      t.eq(d, 15 - (br.armor || 0), 'only the first');
      t.ok(DD.AI.estimate(mg, br, 15, null) > 1, 'and the estimate knows it is spent');
    } finally { B().N.galbraith = N0; }
    // The Floor Is Lava (the Coven's patch x 6-8, y 7-9) until the end of round 3
    DD.Combat.sandbox({ w: 14, h: 13, seed: 'lava', heroes: [{ id: 'test_knight', x: 7, y: 12 }], enemies: [{ id: 'test_grunt', x: 7, y: 1 }] });
    const lr = B().applyCameoCheat('svam_cameo_lava');
    const patch = [];
    for (let y = 7; y <= 9; y++) for (let x = 6; x <= 8; x++) patch.push({ x: x, y: y });
    t.ok(lr && lr.turns === 3 && typeof lr.onRemove === 'function', 'a 3-round rule that restores the floor in onRemove');
    t.ok(patch.every(function (q) { return DD.Grid.tile(q.x, q.y).t === 'lava'; }), 'the patch is lava');
    // QA FIGHTS-06: his lava knows its friends (a Coven member takes nothing from it, damage or Burn); a hero still burns
    const hag = S().units.filter(function (u) { return u.defId === 'test_grunt'; })[0], kn0 = hero('test_knight');
    hag.tags = (hag.tags || []).concat(['coven']);
    put(hag, 7, 6);
    const hp0 = hag.hp;
    act(function () { DD.Act.push(kn0, hag, { x: 0, y: 1 }, 3); });
    t.ok(onList(patch, hag) && hag.hp === hp0 && !has(hag, 'burn'), 'a hag shoved across the patch: no damage, no Burn (at ' + hag.x + ',' + hag.y + ', ' + (hp0 - hag.hp) + ' lost)');
    t.ok(logHas(/Svammiel's lava knows its friends/), 'and he says so (once)');
    put(kn0, 6, 6);
    const kh = kn0.hp;
    act(function () { DD.Act.push(hag, kn0, { x: 0, y: 1 }, 1); });
    t.ok(kn0.hp < kh && has(kn0, 'burn'), 'a hero shoved onto it burns (' + (kh - kn0.hp) + ')');
    put(kn0, 7, 12);
    DD.Act.removeStatus(kn0, 'burn', { silent: true });
    kn0.hp = kn0.maxHp;
    const hagHp = hag.hp;
    const s = S();
    s.aiOff = true;
    DD.Combat.endRound(); DD.Combat.endRound();
    t.ok(patch.every(function (q) { return DD.Grid.tile(q.x, q.y).t === 'lava'; }) && s.round === 3, 'still lava in round 3');
    DD.Combat.endRound();
    t.ok(patch.every(function (q) { return DD.Grid.tile(q.x, q.y).t !== 'lava'; }), 'cooled at the end of round 3');
    t.ok(!rule('cameo:svam_cameo_lava'), 'its chip is gone');
    t.eq(hag.hp, hagHp, 'the hag stood in it for three rounds: not a scratch');
  });

  T.suite('boss_svammiel: each registered door\'s start cameo lands its cheat (the doors that have landed)', function (t) {
    if (!DD.Cameo || DD.Cameo.stub) { t.skip('DD.Cameo is the core stand-in'); return; }
    const doors = Object.keys(DD.defs.encounters).map(DD.getEncounter).filter(function (e) {
      return e && e.act === 4 && e.gauntlet && !/^test_/.test(e.id) && e.cameo && B().CAMEO_CHEATS[e.cameo.cheat];
    });
    if (!doors.length) { t.skip('no act-4 door with a Svammiel cheat has landed yet'); return; }
    doors.forEach(function (en) {
      withActs(4, function () {
        const setup = DD.Encounter.build(en, partyAt(5), { rng: DD.RNG('door:' + en.id), difficulty: 'normal', act: 4 });
        DD.Combat.start(setup, { seed: 'door:' + en.id, headless: true, kind: 'boss' });
        const r = rule('cameo:' + en.cameo.cheat), def = B().CAMEO_CHEATS[en.cameo.cheat];
        const can = !def.when || def.when(S()) || !!r;
        if (!can) { t.log(en.id + ': ' + en.cameo.cheat + ' had nothing to do in this line-up (no chip)'); return; }
        t.ok(!!r && r.cheat === true && r.source === 'svammiel', en.id + ': ' + en.cameo.cheat + ' is a 😈 chip after the start cameo');
        t.ok(r && (en.cameo.cheat === 'svam_cameo_radio' ? / is bleeped: it can't be used this fight\.$/.test(r.desc) : r.desc === def.desc), en.id + ': its exact desc: ' + (r && r.desc));
        t.ok(S().log.some(function (l) { return l.cls === 'cameo' && new RegExp('^😈 Svammiel cheats: ' + def.name.replace(/[.?*+^$()[\]{}|\\]/g, '\\$&')).test(l.text); }), en.id + ': the cheat\'s log line');
      });
    });
  });

  // ---- the cameo def --------------------------------------------------------------------------------------------------------
  T.suite('boss_svammiel: the svammiel cameo def — triggers, the twist script, the sulk, the start roast\'s situation', function (t) {
    const def = DD.getCameo('svammiel');
    t.ok(def && def.name === 'Svammiel' && def.title === 'The Floor Boss' && def.enemy === SV && def.icon === '😈', 'name, title, enemy, icon');
    t.ok(def.roastPrefix === 'svam_hero_' && def.comebackPrefix === 'svam_back_', 'roast / comeback prefixes');
    const tr = {};
    def.triggers.forEach(function (x) { tr[x.id] = x; });
    t.ok(tr.start && tr.start.on === 'start' && tr.start.act === 4 && tr.start.style === 'swoop', 'start: every act-4 fight (swoop)');
    t.ok(tr.twist && tr.twist.on === 'victory' && tr.twist.act === 3 && tr.twist.kind === 'boss' && tr.twist.key === 'svam_twist' && tr.twist.style === 'entrance' && tr.twist.force === true,
      'the twist: the act-3 boss victory, svam_twist, entrance, forced');
    t.ok(tr.twist.banner && tr.twist.banner.title === 'YOU THOUGHT THIS WAS OVER?' && tr.twist.bubble === 'I, SVAMMIEL, CONTROL ALL.' && typeof tr.twist.then === 'function', 'the twist\'s banner, bubble and extras');
    t.ok(tr.shadow && tr.shadow.style === 'shadow' && tr.shadow.encounter === 'boss_dm' && tr.shadow.once, 'the winged shadow in the DM\'s phase 3');
    [['down', 'heroDowned', 'svam_down'], ['signature', 'signature', 'svam_signature'], ['member_down', 'kill', 'svam_member_down'], ['env_kill', 'kill', 'svam_env_kill'],
      ['countered', 'windupCancel', 'svam_countered'], ['long', 'round', 'svam_long']].forEach(function (p) {
      t.ok(tr[p[0]] && tr[p[0]].on === p[1] && tr[p[0]].key === p[2] && tr[p[0]].act === 4 && tr[p[0]].style === 'bubble', p[0] + ': ' + p[1] + ' → ' + p[2]);
    });
    t.ok(tr.member_down.squad === true && tr.long.from === 8, 'squad kills; round 8+');
    t.ok(tr.sulk && tr.sulk.style === 'quip' && tr.sulk.keyOf({ encounter: { gauntlet: { lane: 'goats' } } }) === 'svam_sulk_goats' && !tr.sulk.keyOf({ encounter: { finale: true } }),
      'the sulk reads the lane from the encounter (a finale has none)');
    DD.Combat.sandbox({ w: 6, h: 6, seed: 'env', heroes: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 5, y: 5 }] });
    const kn = hero('test_knight'), gr = S().units.filter(function (u) { return u.defId === 'test_grunt'; })[0];
    t.ok(tr.env_kill.when(S(), { killerId: kn.id, cause: 'bump' }) && tr.env_kill.when(S(), { killerId: kn.id, cause: 'fall' }), 'an environmental kill by a hero');
    t.ok(!tr.env_kill.when(S(), { killerId: kn.id, cause: 'skill' }) && !tr.env_kill.when(S(), { killerId: gr.id, cause: 'bump' }), 'not a plain hit, not an enemy\'s');
    // the start roast's situation (pools from NARRATIVE; stand-ins while they are missing)
    const temp = [];
    ['svam_sit_first', 'svam_sit_debt', 'svam_sit_rich', 'svam_sit_fallen'].forEach(function (k) { if (!DD.defs.narration[k]) { DD.defs.narration[k] = ['stand-in {hero}{name}']; temp.push(k); } });
    try {
      DD.Combat.sandbox({ w: 6, h: 6, seed: 'sit', heroes: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 5, y: 5 }],
        encounter: { id: 'test_sit_door', act: 4, kind: 'boss', gauntlet: { lane: 'x', order: 1 } } });
      t.eq(def.situation(S(), null, []), null, 'no run: no situation (a sandbox)');
      const run = { gold: 300, party: [{ id: 'test_knight', scars: ['scar_owes_the_dm'] }], fallen: [], flags: {}, map: { lanes: [{}, {}, {}], beaten: [] }, difficulty: 'normal' };
      let sit = def.situation(S(), run, []);
      t.eq(sit && sit.key, 'svam_sit_first', 'the first door: "first"');
      sit = def.situation(S(), run, ['svam_sit_first']);
      t.ok(sit && sit.key === 'svam_sit_debt' && sit.heroId === 'test_knight' && sit.vars.hero === 'Sir Testsalot', 'then the debt (it names the hero: his comeback can follow)');
      sit = def.situation(S(), run, ['svam_sit_first', 'svam_sit_debt', 'svam_sit_fresh']);
      t.eq(sit && sit.key, 'svam_sit_rich', 'then (after "fresh": everyone at full HP) rich: 250+ gold');
      run.fallen = ['test_mage'];
      sit = def.situation(S(), run, []);
      t.ok(sit && sit.key === 'svam_sit_fallen' && sit.vars.name === 'Wizzy McTest', 'a fallen hero comes first');
    } finally { temp.forEach(function (k) { delete DD.defs.narration[k]; }); }
  });

  // ---- the twist: the DM's cut-off line and Svammiel's entrance ------------------------------------------------------------
  T.suite('boss_svammiel: the twist — the DM is cut off mid-sentence only while the campaign goes on', function (t) {
    if (!DD.getEncounter('boss_dm')) { t.skip('dm.js not loaded'); return; }
    const seen0 = DD.Meta && DD.Meta.data && DD.Meta.data.seen && DD.Meta.data.seen.bosses ? !!DD.Meta.data.seen.bosses.svammiel : false;
    // the DM's speech bubbles during the kill (QA flow-1: nothing on screen finishes his sentence while he is cut off)
    let bubbles = [];
    const fightDM = function (seed) {
      const setup = DD.Encounter.build('boss_dm', partyAt(5), { rng: DD.RNG('dmtw:' + seed), difficulty: 'normal', act: 3 });
      DD.Combat.start(setup, { seed: seed, headless: true, kind: 'boss', sandbox: true, initiative: 'heroesFirst' });
      const dm = S().units.filter(function (u) { return u.defId === 'dungeon_master'; })[0];
      bubbles = [];
      const orig = DD.FX.bark;
      DD.FX.bark = function (u, text) { if (u === dm) bubbles.push(String(text)); return orig.apply(this, arguments); };
      try { act(function () { DD.Act.kill(dm, heroes()[0], { force: true }); }); } finally { DD.FX.bark = orig; }
      return S();
    };
    const at = function (re) { return S().log.findIndex(function (l) { return re.test(l.text); }); };
    try {
      withActs(3, function () {
        fightDM('classic');
        t.eq(S().result, 'victory', 'acts 3: the DM falls');
        t.ok(logHas(/The Dungeon Master: "Fine\. FINE\. You win\. Same time next week\?"/) && !logHas(/next—/), 'acts 3: his whole line');
        t.ok(!logHas(/SVAMMIEL/) && !logHas(/The table shakes/), 'acts 3: no Svammiel, no shaking table');
        t.ok(bubbles.length === 1 && /^Fine\. FINE\. You win\. Same time next week\?/.test(bubbles[0]), 'acts 3: his death bubble, the whole line (' + bubbles.join(' | ') + ')');
      });
      withActs(4, function () {
        fightDM('twist');
        t.ok(logHas(/The Dungeon Master: "Fine\. FINE\. You win\. Same time next—"/), 'acts 4: the twist cuts him off');
        t.ok(bubbles.length === 1 && bubbles[0] === 'Fine. FINE. You win. Same time next—', 'acts 4: his bubble is cut off too, never the whole line (' + bubbles.join(' | ') + ')');
        // the engine barks 'death' at 0 HP, before it marks him dead: then (and only then) his pool is empty
        const dmU = S().units.filter(function (u) { return u.defId === 'dungeon_master'; })[0];
        dmU.dead = false;
        try { t.eq(DD.getEnemy('dungeon_master').barks.death.length, 0, 'at 0 HP while cut off his death pool is empty (the engine\'s death bark stays quiet)'); } finally { dmU.dead = true; }
        t.eq(DD.getEnemy('dungeon_master').barks.death.length, 2, 'any other time the pool is whole (lints, other fights)');
        if (DD.Cameo && !DD.Cameo.stub && (DD.defs.narration.svam_twist || []).length) {
          t.ok(logHas(/You thought this was over\? I, SVAMMIEL, CONTROL ALL\./), 'the entrance line (svam_twist)');
          t.ok(logHas(/"Oh no\. That's my DM\."/), 'the DM: "Oh no. That\'s my DM."');
          // QA flow-4 (plan §2.1): the table shakes, then his line, then the DM's "Oh no" — each once
          const iShake = at(/^The table shakes\./), iLine = at(/You thought this was over\?/), iOh = at(/"Oh no\. That's my DM\."/);
          t.ok(iShake >= 0 && iShake < iLine && iLine < iOh, 'the order: shake ' + iShake + ' < his line ' + iLine + ' < "Oh no" ' + iOh);
          t.eq(S().log.filter(function (l) { return /^The table shakes\./.test(l.text); }).length, 1, 'the table shakes once');
          t.ok(DD.Meta.data.seen.bosses.svammiel, 'the spoiler gate opens (seen.bosses.svammiel)');
        } else t.log('the twist line (svam_twist, NARRATIVE) or the cameo engine is missing: the entrance is skipped');
      });
      withActs(3, function () { t.eq(DD.getEnemy('dungeon_master').barks.death.length, 2, 'acts 3 again: his death pool is back'); });
    } finally {
      if (!seen0 && DD.Meta && DD.Meta.data && DD.Meta.data.seen && DD.Meta.data.seen.bosses) delete DD.Meta.data.seen.bosses.svammiel;
    }
  });

  // ---- honesty: previews and dry runs with cheats active; cameos route to barks in his fight --------------------------------
  T.suite('boss_svammiel: previews = results with cheats active; dry runs leave the fight alone; his fight routes cameos to barks', function (t) {
    const s = cleanFight('prev' + t.seed);
    const kn = hero('test_knight');
    put(kn, 8, 3);
    DD.Combat.giveTurnTo(kn);
    S().hype = 100;
    kn.ap = 3;
    DD.Act.addStatus(kn, 'empowered', { turns: 2, silent: true }, kn);
    DD.Act.addStatus(kn, 'inspired', { turns: 2, silent: true }, kn);
    const f = F();
    t.ok(f.fudge > 0, 'a Fudge token is ready');
    const fp = T.contentHelpers && T.contentHelpers.fingerprint ? T.contentHelpers.fingerprint(S()) : null;
    const p = DD.Combat.preview(kn, kn.signature, kn.x, kn.y);
    if (fp) t.eq(T.contentHelpers.fingerprint(S()), fp, 'the preview changed nothing (Fudge, rules, data)');
    const shown = p && p.perUnit && p.perUnit[s.id] ? p.perUnit[s.id].dmg : null;
    const hp0 = s.hp;
    t.ok(DD.Combat.useSkill(kn, kn.signature, kn.x, kn.y), 'the big hit');
    t.eq(hp0 - s.hp, 1, 'That\'s a 1 Now: it dealt 1');
    t.eq(shown, 1, 'and the preview said 1');
    // a dry run of a Ruling leaves the real cheat alone
    B().force('svam_tilt', { dir: 'throne' });
    const mg = hero('test_mage');
    put(mg, 1, 6);
    DD.Combat.giveTurnTo(mg);
    const nx = F().next;
    DD.Targeting.simulate(function () { const u = DD.Combat.byId(mg.id); if (u) DD.Combat.interact(u, 0, 6); });
    t.ok(F().next === nx && !nx.cancelled && rule('svam_next'), 'a dry-run Ruling leaves the real next cheat alone');
    // his own fight: the start cameo's lines are barks on his unit (no swoop)
    if (DD.Cameo && !DD.Cameo.stub) {
      startFight('route' + t.seed);
      const h = DD.Cameo.history(S());
      t.ok(h.length >= 1 && S().log.some(function (l) { return l.cls === 'cameo' && l.speaker === 'Svammiel'; }), 'the start cameo played (log lines with his speaker chip)');
      t.ok(DD.Cameo.present(S(), 'svammiel') === sv(), 'present: his unit is on the board, so lines are barks');
      t.ok(!S().rules.some(function (r) { return /^cameo:/.test(r.id); }), 'no start cheat in his fight');
    } else t.log('DD.Cameo is the core stand-in: routing is skipped');
  });

  // ---- V3 review regressions (docs/notes/boss-svammiel.md "Review (V3)") ------------------------------------------------------
  T.suite('boss_svammiel: the Round Cheat draw is weighted over the whole deck (every card comes up)', function (t) {
    // the draw once read st.rng.float() (NaN without bounds): it always took the deck's first eligible card, so six of
    // the twelve Round Cheats (Rule Zero, New Seating Chart, Moving Costs Extra, Bring a Friend, No Signatures, Hype
    // Confiscated) never came up in a real fight
    cleanFight('deck' + t.seed);
    const f = F(), mg = hero('test_mage');
    S().hype = 50;
    f.dmg[S().round] = {};
    f.dmg[S().round][mg.id + '|' + mg.skills[0].id] = 12;   // last round's damage: Skill Ban can plan
    const W = { svam_lava: 3, svam_tilt: 3, svam_panel_swap: 3, svam_wander: 3, svam_rule_zero: 1 };
    ['petty', 'blatant'].forEach(function (deck) {
      f.phase = deck === 'petty' ? 1 : 2;
      const counts = {};
      for (let i = 0; i < 300; i++) {
        f.drawn = {}; f.cur = null; f.next = null; f.lastId = null;
        const c = B().drawCheat(S().round + 2);
        if (c) counts[c.id] = (counts[c.id] || 0) + 1;
      }
      B().DECK[deck].forEach(function (id) { t.ok(counts[id] > 0, deck + ': ' + id + ' comes up (' + (counts[id] || 0) + ' of 300)'); });
      const hi = B().DECK[deck].filter(function (id) { return W[id] === 3; }), lo = B().DECK[deck].filter(function (id) { return !W[id]; });
      const avg = function (ids) { return ids.reduce(function (a, id) { return a + (counts[id] || 0); }, 0) / Math.max(1, ids.length); };
      t.ok(avg(hi) > avg(lo), deck + ': weight-3 cards come up more often than weight-2 ones (' + avg(hi).toFixed(0) + ' > ' + avg(lo).toFixed(0) + ')');
      if (deck === 'petty') t.ok((counts.svam_rule_zero || 0) < avg(lo), 'Rule Zero (weight 1) is the rarest: ' + counts.svam_rule_zero);
    });
    f.phase = 1;
  });

  T.suite('boss_svammiel: texts that count his turns and actions read the knobs (phase 3: one action a turn)', function (t) {
    const s = cleanFight('acts' + t.seed);
    const N = B().N;
    t.eq(B().CHEATS.svam_go_twice.desc, 'He takes two turns a round.', 'I Go Twice (N.p2Turns ' + N.p2Turns + ')');
    B().enterPhase(s, 2);
    t.ok(/at most one new a round/.test(B().passiveText(s)), 'phase 2 inspect: at most one new wind-up a round (N.windsPerRound): ' + B().passiveText(s).slice(0, 160));
    quietRound();
    B().enterPhase(s, 3);
    const p3 = S().log.filter(function (l) { return /^PHASE 3/.test(l.text); }).map(function (l) { return l.text; }).join(' ');
    t.ok(p3 && !/twice a turn/.test(p3) && /one action a turn/.test(p3), 'the phase-3 log line says one action a turn: ' + p3.slice(-140));
    t.ok(/One action a turn/.test(B().passiveText(s)) && !/Two actions/.test(B().passiveText(s)), 'the phase-3 inspect line too');
    const p0 = N.p3Acts;
    N.p3Acts = 2;
    try { t.ok(/Two actions a turn/.test(B().passiveText(s)), 'and follows the knob (p3Acts 2)'); } finally { N.p3Acts = p0; }
    // Bonus Action, live when he flips into phase 3, still gives him the extra attack its chip promised
    const mg = hero('test_mage'), kn = hero('test_knight');
    s.intents = [];
    put(mg, s.x, s.y + 1); put(kn, s.x + 1, s.y);
    B().force('svam_bonus', null, { now: true });
    let acts = 0;
    DD.Act.addRule({ id: 'test_sv_acts', name: 'w', silent: true, hooks: { onSkillUsed: function (ctx) { if (ctx.user === s && !(ctx.intent && ctx.intent.windup) && ['svam_rain', 'svam_collapse'].indexOf(ctx.skill.id) < 0) acts++; } } });
    try { act(function () { DD.AI.act(s); }); } finally { DD.Act.removeRule('test_sv_acts'); }
    t.eq(acts, N.p3Acts + 1, 'phase 3 + a live Bonus Action: ' + (N.p3Acts + 1) + ' attacks on his turn');
  });

  T.suite('boss_svammiel: Skill Ban never outlasts its word, a Ruling undoes only the ban; Bring a Friend\'s live chip', function (t) {
    // a skill already cooling through the hero's next turn: the ban adds nothing (it used to add one more turn)
    cleanFight('ban2' + t.seed);
    let mg = hero('test_mage');
    let slot = mg.skills[0];
    slot.cd = 2; slot.fresh = false;
    B().force('svam_ban', { unitId: mg.id, skillId: slot.id, hero: mg.name, skill: DD.getSkill(slot.id).name }, { now: true });
    t.ok(slot.cd === 2 && !slot.fresh, 'a 2-turn cooldown stays as it was (' + slot.cd + (slot.fresh ? ' fresh' : '') + ')');
    DD.Combat.giveTurnTo(mg);
    t.ok(/cooldown/i.test(String(DD.Combat.canUse(mg, slot))), 'refused on the hero\'s next turn');
    quietRound();
    DD.Combat.giveTurnTo(mg);
    mg.ap = 3;
    t.ok(!/cooldown/i.test(String(DD.Combat.canUse(mg, slot))), 'and usable the turn after: ' + DD.Combat.canUse(mg, slot));
    // a skill with no cooldown: one turn of it
    cleanFight('ban3' + t.seed);
    mg = hero('test_mage'); slot = mg.skills[0];
    B().force('svam_ban', { unitId: mg.id, skillId: slot.id, hero: mg.name, skill: DD.getSkill(slot.id).name }, { now: true });
    DD.Combat.giveTurnTo(mg);
    t.ok(/cooldown/i.test(String(DD.Combat.canUse(mg, slot))), 'no cooldown before: refused on the next turn');
    quietRound();
    DD.Combat.giveTurnTo(mg);
    mg.ap = 3;
    t.ok(!/cooldown/i.test(String(DD.Combat.canUse(mg, slot))), 'and only that turn');
    // a Ruling cancels the ban, not the skill's own cooldown
    cleanFight('ban4' + t.seed);
    mg = hero('test_mage'); slot = mg.skills[0];
    slot.cd = 3; slot.fresh = false;
    const c = B().force('svam_ban', { unitId: mg.id, skillId: slot.id, hero: mg.name, skill: DD.getSkill(slot.id).name }, { now: true });
    DD.Combat.giveTurnTo(mg);
    F().rulings = 2;
    put(mg, 1, 6);
    act(function () { DD.Combat.interact(mg, 0, 6); });
    t.ok(c.cancelled && slot.cd >= 2, 'the Ruling cancelled the ban and left the skill\'s own cooldown (' + slot.cd + ')');
    // Bring a Friend: its round by number while announced (QA FIGHTS-05), "this round" once its imps are on the board
    cleanFight('wander2' + t.seed);
    const tiles = [freeFloor(function (q) { return q.y === 6 && q.x >= 3; }), freeFloor(function (q) { return q.y === 7 && q.x >= 12; })].map(function (q) { return { x: q.x, y: q.y }; });
    B().force('svam_wander', { tiles: tiles });
    const nr = S().round + 1;
    t.eq(rule('svam_next').desc, 'At the start of round ' + nr + ' two Floor Staff Imps arrive on the marked tiles (they act from round ' + (nr + 1) + '; at most 4 alive).', 'announced: by number');
    B().force('svam_wander', { tiles: tiles }, { now: true });
    t.eq(rule('svam_cheat').desc, 'At the start of this round two Floor Staff Imps arrive on the marked tiles (they act from the round after; at most 4 alive).', 'live: this round');
  });

  T.suite('boss_svammiel: Pencilled HP rubs out at most half a round\'s damage (the slow road always gets somewhere)', function (t) {
    const s = cleanFight('pencil' + t.seed);
    const f = F();
    f.fudge = 0; DD.Act.removeStatus(s, 'svam_fudge', { silent: true });
    t.eq(B().CHEATS.svam_retcon.desc, 'At the end of each round he erases up to 5 of the damage he took that round per standing Master Die (never more than half of it).', 'the chip says so');
    B().enterPhase(s, 2);
    quietRound();
    B().enterPhase(s, 3);
    const T3 = B().threshold(s, 3);
    t.eq(objs('svam_master_die').length, 3, 'three Master Dice stand (15 a round at most)');
    s.hp = T3 - 40;
    f.taken = 12;
    quietRound();
    t.eq(s.hp, T3 - 40 + 6, 'a 12-damage round: 6 rubbed out, not 12 (a weak party still wins the race)');
    s.hp = T3 - 40;
    f.taken = 40;
    quietRound();
    t.eq(s.hp, T3 - 40 + Math.min(15, 5 * objs('svam_master_die').length), 'a 40-damage round: the dice cap (5 per standing die)');
    // the Radio Edit with no candidate: apply says false (DD.Cameo.cheat: no card)
    radioFight([['test_knight', [['test_war_shout', 3]]]], 'radio-false');
    t.eq(B().CAMEO_CHEATS.svam_cameo_radio.apply(S(), {}), false, 'Radio Edit apply without a candidate: false, never a half-filled desc');
  });

  // ---- AutoPlay ---------------------------------------------------------------------------------------------------------------
  /** One fight on the real path (deployment, rolled initiative), AutoPlay on both sides. → summary. */
  /** BAL (V3): the author band measures the content numbers, so the zz author sims run without DD.Balance's act-4
   *  campaign rows (the act row and boss_svammiel's row, boss_dm.js's bare() pattern); balance=1 keeps them. */
  function bareRows(start) {
    const Bal = DD.Balance, k = DD.MAX_ACT, ENC = 'boss_svammiel';
    if (!Bal || DD.params.balance === '1') return start();
    const a = Bal.act && Bal.act[k], row = Bal.encounters && Bal.encounters[ENC];
    if (a) Bal.act[k] = { hp: 1, dmg: 1 };
    if (row) delete Bal.encounters[ENC];
    try { return start(); } finally { if (a) Bal.act[k] = a; if (row) Bal.encounters[ENC] = row; }
  }
  let t0 = null;
  function simFight(seed, ids, level) {
    const setup = DD.Encounter.build('boss_svammiel', partyAt(level, ids), { rng: DD.RNG('svsim:' + seed), difficulty: 'normal', act: 4 });
    DD.Combat.start(setup, { seed: 'svsim:' + seed, headless: true, difficulty: 'normal', kind: 'boss' });
    const taken = {}, dealt = { 1: 0, 2: 0, 3: 0 };
    DD.Act.addRule({ id: 'test_svsim_watch', name: 'watch', silent: true, hooks: { onTakeDamage: function (d) {
      if (DD.Act.simulating) return;
      if (d.target && d.target.kind === 'hero') { const k = 'p' + ((S().data.svam || {}).phase || 0) + ':' + ((d.skill && d.skill.id) || d.cause); taken[k] = (taken[k] || 0) + (d.dealt || 0); }
      if (d.target && d.target.defId === SV && S().data.svam) dealt[S().data.svam.phase] = (dealt[S().data.svam.phase] || 0) + (d.dealt || 0);
    } } });
    const res = DD.AutoPlay.runBattle(40);
    const f = F();
    if (t0 && t0.param('detail', '0') === '2') S().log.filter(function (l) { return l.round <= 4; }).forEach(function (l) { t0.log('    r' + l.round + ' [' + l.cls + '] ' + l.text.slice(0, 150)); });
    if (t0 && t0.param('detail', '0') !== '0') t0.log('  taken by heroes: ' + JSON.stringify(taken) + ' · dealt to him by phase: ' + JSON.stringify(dealt) + ' · p2 at ' + f.stats.phase2 + ', p3 at ' + f.stats.phase3);
    return { win: res.result === 'victory', rounds: res.rounds, timeout: !!res.timeout, phase: f.phase, caught: f.caught, rulings: f.stats.rulings, rigged: f.stats.rigged,
      master: f.stats.master, falls: f.stats.falls, pencil: f.stats.pencil, cheats: f.stats.cheats, downs: S().stats.downs || 0 };
  }
  // ---- QA fixes (Nov 17; .tmp/v3/qa: FIGHTS-01..11, flow, voice) ---------------------------------------------------------
  /** Phase 2 with two entries, the order rebuilt as `shape` ('S' = his entry, 'h<i>' = hero i), at his first entry. */
  function phase2At(seed, shape) {
    const s = cleanFight(seed);
    F().fudge = 0;
    DD.Act.removeStatus(s, 'svam_fudge', { silent: true });
    act(function () { DD.Act.damage(null, s, s.hp - B().threshold(s, 2), { cause: 'other', ignoreArmor: true }); });
    quietRound();
    const f = F();
    if (f.next) { DD.Act.removeRule('svam_next'); f.next = null; }
    if (f.cur) { DD.Act.removeRule('svam_cheat'); f.cur = null; }
    const mine = S().order.filter(function (e) { return e.unitId === s.id; }).sort(function (a, b) { return (a.k || 0) - (b.k || 0); });
    const hs = heroes();
    const he = hs.map(function (h) { return S().order.filter(function (e) { return e.unitId === h.id; })[0]; });
    let mi = 0;
    S().order = shape.map(function (x) { return x === 'S' ? mine[mi++] : he[+x.slice(1)]; });
    S().turnIndex = shape.indexOf('S');
    S().current = s.id;
    s.intents = [];
    heroes().forEach(function (h) { h.hp = h.maxHp; h.block = 0; });
    return { s: s, hs: hs, mine: mine.length };
  }
  T.suite('boss_svammiel: QA FIGHTS-01 — in phase 2 a wind-up lands only after every hero has had a turn (I Go Twice, any order)', function (t) {
    const SHAPES = [['S', 'h0', 'S', 'h1', 'h2', 'h3'], ['S', 'h0', 'h1', 'S', 'h2', 'h3'], ['h0', 'S', 'h1', 'h2', 'S', 'h3'],
      ['S', 'S', 'h0', 'h1', 'h2', 'h3'], ['h0', 'h1', 'h2', 'h3', 'S', 'S'], ['h0', 'h1', 'S', 'h2', 'h3', 'S']];
    SHAPES.forEach(function (shape, n) {
      const P = phase2At('f01:' + n + ':' + t.seed, shape);
      const s = P.s;
      if (!t.ok(P.mine === 2 && F().phase === 2, shape.join(' ') + ': two entries in phase 2')) return;
      act(function () { DD.AI.act(s); });
      const wu = s.intents.filter(function (i) { return i.windup; })[0];
      if (!t.ok(!!wu, shape.join(' ') + ': he winds up (' + (wu && wu.skillId) + ', ' + (wu && wu.turnsLeft) + ' of his turns)')) return;
      // play the order forward the engine's way: a hero entry starts a hero turn, his entry counts the wind-up down
      const seen = {}, n0 = S().order.length;
      let landed = -1;
      for (let k = 1; k <= n0 * 3 && landed < 0; k++) {
        const i = (S().turnIndex + 1) % n0;
        const e = S().order[i], u = DD.Combat.byId(e.unitId);
        S().turnIndex = i; S().current = u.id;
        if (u === s) {
          act(function () { DD.AI.resolveWindups(s); });
          if (s.intents.indexOf(wu) < 0) landed = k;
        } else { S().heroTurns = (S().heroTurns || 0) + 1; seen[u.id] = true; }
      }
      t.ok(landed > 0, shape.join(' ') + ': it lands within three passes of the order');
      t.ok(P.hs.every(function (h) { return seen[h.id]; }), shape.join(' ') + ': every hero had a turn before it landed (' + Object.keys(seen).length + '/' + P.hs.length + ')');
      t.ok(landed <= n0 + 1, shape.join(' ') + ': and no later than the same point of the next round (' + landed + ' entries)');
    });
    // phase 1 (one entry): unchanged, it lands at his next turn
    const s1 = cleanFight('f01p1' + t.seed);
    S().turnIndex = S().order.findIndex(function (e) { return e.unitId === s1.id; });
    S().current = s1.id;
    t.eq(B().windTurns(s1), 1, 'phase 1, one entry: a wind-up waits one of his turns');
  });

  T.suite('boss_svammiel: QA FIGHTS-02 — a panel drop makes each grounded unit on it fall exactly once (Floor Collapse, No More Floor)', function (t) {
    const PANELS = ['A3', 'B3', 'E2', 'D4', 'B1', 'C1'];
    let bad = [];
    PANELS.forEach(function (id) {
      for (let i = 0; i < 9; i++) {
        cleanFight('f02:' + id + ':' + i);
        const kn = hero('test_knight');
        const q = B().panel(id).tiles[i];
        if (DD.Grid.tile(q.x, q.y).obj) continue;
        heroes().forEach(function (h, k) { if (h !== kn) put(h, 1 + k, 12); });
        if (!put(kn, q.x, q.y)) continue;
        kn.hp = kn.maxHp; kn.block = 0;
        const f0 = F().stats.falls;
        act(function () { B().dropPanel(id, { temporary: true }); });
        const lost = kn.maxHp - kn.hp, fall = Math.ceil(kn.maxHp * 0.25);
        if (lost !== fall || F().stats.falls - f0 !== 1 || DD.Grid.isDrop(kn.x, kn.y) || B().panelIdAt(kn.x, kn.y) === id) bad.push(id + '#' + i + ' lost ' + lost);
      }
    });
    t.eq(bad.join(', '), '', 'Floor Collapse: a hero alone on any tile falls once (25% of max HP), climbs out off the panel, one fall counted');
    // three heroes on one panel: each falls once
    cleanFight('f02:three');
    const p = B().panel('A3').tiles, three = heroes().slice(0, 3);
    three.forEach(function (h, k) { put(h, p[k * 3 + 1].x, p[k * 3 + 1].y); h.hp = h.maxHp; h.block = 0; });
    act(function () { B().dropPanel('A3', { temporary: true }); });
    three.forEach(function (h) { t.eq(h.maxHp - h.hp, Math.ceil(h.maxHp * 0.25), h.name + ' fell once'); });
    // No More Floor: two neighbouring outer panels at once; a hero on their shared edge never lands on the other one
    const s = cleanFight('f02:nmf');
    act(function () { DD.Act.damage(null, s, s.hp - B().threshold(s, 2), { cause: 'other', ignoreArmor: true }); });
    quietRound();
    act(function () { DD.Act.damage(null, s, s.hp - B().threshold(s, 3), { cause: 'other', ignoreArmor: true }); });
    t.eq(F().phase, 3, 'phase 3');
    const kn = hero('test_knight'), a3 = B().panel('A3').tiles, a4 = B().panel('A4').tiles;
    heroes().forEach(function (h, k) { if (h !== kn) put(h, 7 + k, 6); });
    const edge = a3.filter(function (q) { return q.y === 9 && !DD.Grid.tile(q.x, q.y).obj && !DD.Grid.unitAt(q.x, q.y); })[0];
    if (t.ok(!!edge && put(kn, edge.x, edge.y), 'a hero on A3\'s edge next to A4')) {
      kn.hp = kn.maxHp; kn.block = 0;
      F().drop = { ids: ['A3', 'A4'], round: S().round };
      quietRound();
      t.ok(!B().present('A3') && !B().present('A4'), 'both dropped for good');
      t.eq(kn.maxHp - kn.hp, Math.ceil(kn.maxHp * 0.25), 'he fell once');
      t.ok(['A3', 'A4'].indexOf(B().panelIdAt(kn.x, kn.y)) < 0 && !DD.Grid.isDrop(kn.x, kn.y), 'and climbed out on a panel that stays (' + B().panelIdAt(kn.x, kn.y) + ')');
    }
  });

  T.suite('boss_svammiel: QA FIGHTS-03/05 — a live cheat lasts one round; every announcement names its round; counters never whisper early', function (t) {
    // the text for its round, by number, for every Round Cheat (none says "this round", "next round" or "the next")
    const all = B().DECK.petty.concat(B().DECK.blatant).filter(function (id, i, a) { return a.indexOf(id) === i; });
    startFight('f05' + t.seed);
    all.forEach(function (id) {
      const data = id === 'svam_ban' ? { skill: 'Test Slash', hero: 'Sir Testsalot' } : id === 'svam_tilt' ? { dir: 'stuff' } : {};
      const txt = B().aheadDescOf({ id: id, round: 5, data: data });
      t.ok(!/this round|next round|the next\b|round after/i.test(txt) && (id === 'svam_rule_zero' || /\bround 5\b/.test(txt)), id + ': "' + txt + '"');
    });
    t.eq(B().aheadDescOf({ id: 'svam_lava', round: 5, data: {} }), 'The marked panel turns to lava at the end of round 5 and cools at the end of round 6.', 'R1 by number');
    t.eq(B().aheadDescOf({ id: 'svam_ban', round: 4, data: { skill: 'Test Slash', hero: 'Sir Testsalot' } }),
      'Test Slash is banned in round 4: it is on cooldown through Sir Testsalot\'s turn that round.', 'R4 by number');
    // R1 end to end: announced in round r-1 for round r, live in round r only (turns 1: no "all fight"), lava then "Rule ended"
    cleanFight('f05lava' + t.seed);
    const r0 = S().round;
    const c = B().force('svam_lava', null);
    t.ok(S().log.some(function (l) { return l.round === r0 && l.text.indexOf('(round ' + (r0 + 1) + ')') >= 0; }), 'announced in round ' + r0 + ' for round ' + (r0 + 1));
    t.ok(!S().log.some(function (l) { return l.round === r0 && /Get off the marked panel/.test(l.text); }), 'its in-round counter is not whispered a round early');
    quietRound();
    const live = rule('svam_cheat');
    t.ok(live && live.turns === 1 && !live.next, 'live in round ' + S().round + ' for that round only (turns ' + (live && live.turns) + ')');
    t.ok(S().log.some(function (l) { return l.round === c.round && /^😈 The Floor Is Lava is on this round/.test(l.text); }), '"is on this round" printed in its round');
    t.ok(S().log.some(function (l) { return l.round === c.round && /Get off the marked panel/.test(l.text); }), 'the DM\'s counter whispered in its round');
    const n0 = S().log.length;
    quietRound();
    const tail = S().log.slice(n0).map(function (l) { return l.text; });
    const iLava = tail.findIndex(function (x) { return /is lava now/.test(x); }), iEnd = tail.findIndex(function (x) { return /^Rule ended: The Floor Is Lava/.test(x); });
    t.ok(iLava >= 0 && iEnd > iLava, 'at its round end: the lava, then "Rule ended" (' + iLava + ' < ' + iEnd + ')');
    t.ok(F().cur !== c && (!rule('svam_cheat') || rule('svam_cheat').cheatId !== 'svam_lava') && B().panel(c.data.panel).tiles.every(function (q) { return DD.Grid.tile(q.x, q.y).t === 'lava'; }), 'chip gone, panel lava');
    // a start-of-round cheat whispers at its announcement (Hype Confiscated: "before he takes it")
    cleanFight('f05tax' + t.seed);
    S().hype = 40;
    const r1 = S().round;
    B().force('svam_hype_tax', {});
    t.ok(S().log.some(function (l) { return l.round === r1 && /Spend your Hype before he takes it/.test(l.text); }), 'Hype Confiscated: its counter at the announcement');
  });

  T.suite('boss_svammiel: QA FIGHTS-07/08, voice-4/6/7, flow-5 — Fudge every phase, 12-HP Master Dice, texts from the knobs', function (t) {
    // FIGHTS-07: all three Rigged Dice broken, a new phase still deals him a Fudge token
    const s = cleanFight('f07' + t.seed);
    objs('svam_rigged_die').forEach(function (q) { act(function () { DD.Act.damageObject(hero('test_mage'), q.x, q.y, 99); }); });
    t.eq(F().fudgeMax + '/' + F().fudge, '0/0', 'three dice broken: no Fudge left');
    act(function () { DD.Act.damage(null, s, s.hp - B().threshold(s, 2), { cause: 'other', ignoreArmor: true }); });
    t.eq(F().fudge, B().N.fudgeFloor, 'phase 2 deals him ' + B().N.fudgeFloor + ' anyway');
    t.ok(has(s, 'svam_fudge'), 'the Fudge status shows it');
    t.ok(/a new phase still deals him 1 token at least/.test(DD.getStatus('svam_fudge').desc({ stacks: 1 })) && /a new phase still deals him 1 token/.test(DD.getObject('svam_rigged_die').desc),
      'the Fudge and Rigged Die texts say so');
    // FIGHTS-08: Master Dice 12 HP: a 6-damage hit doesn't break one
    quietRound();
    act(function () { DD.Act.damage(null, s, s.hp - B().threshold(s, 3), { cause: 'other', ignoreArmor: true }); });
    const dice = objs('svam_master_die');
    t.ok(dice.length === 3 && dice.every(function (q) { return q.obj.hp === 12 && q.obj.maxHp === 12; }), 'Master Dice at 12 HP (' + dice.map(function (q) { return q.obj.hp; }).join('/') + ')');
    act(function () { DD.Act.damageObject(hero('test_mage'), dice[0].x, dice[0].y, 6); });
    t.ok(objs('svam_master_die').length === 3 && !F().caught, 'a 6-damage hit leaves it standing');
    t.ok(/12 HP/.test(DD.getObject('svam_master_die').desc), 'its desc says 12 HP');
    // voice-7: CAUGHT's texts read N.caught
    const c0 = B().N.caught;
    B().N.caught = 1.5;
    try {
      act(function () { B().caught(s); });
      t.ok(logHas(/\+50% damage taken, every fall/), 'the CAUGHT log line reads the knob (+50%)');
      t.ok(/\+50% damage taken/.test(B().passiveText(s)) && /\+50% damage taken/.test(DD.getStatus('svam_caught').desc()), 'his inspect line and the status too');
    } finally { B().N.caught = c0; }
    // voice-6: the honest 1 is embarrassment, not a death wish
    t.ok(!/wants to die/.test(String(DD.getSkill('svam_honest').execute)) && /swallow him/.test(String(DD.getSkill('svam_honest').execute)), 'the honest 1 line');
    // flow-5: the demoted DM has a codex card (no HP, codex: true)
    t.ok(DD.getObject('svam_dm_table').codex === true, 'the kids\' table DM: codex: true');
    // voice-4: Skill Ban's "radio edit" quip only after the Radio Edit landed this run
    const ban = (DD.defs.narration.svam_quip_svam_ban || []).filter(function (l) { return /radio edit/i.test(l); });
    if (t.ok(ban.length === 1, 'the callback line is in the pool')) {
      const said = [];
      const orig = DD.Act.bark;
      DD.Act.bark = function (u, text) { if (u === sv()) said.push(text); return ''; };
      try {
        cleanFight('v4' + t.seed);
        for (let i = 0; i < 30; i++) B().force('svam_ban', { skill: 'Test Slash', hero: 'Sir Testsalot' });
        t.ok(said.length >= 25 && said.indexOf(ban[0]) < 0, 'no Radio Edit this run: never the callback (' + said.length + ' quips)');
        S().run = { flags: { cameo: { cheats: ['svam_cameo_radio'] } } };
        t.ok(B().radioLanded(S()), 'run memory: the Radio Edit landed');
        said.length = 0;
        for (let i = 0; i < 30; i++) B().force('svam_ban', { skill: 'Test Slash', hero: 'Sir Testsalot' });
        t.ok(said.indexOf(ban[0]) >= 0, 'after it landed: the callback can play');
        S().run = null;
      } finally { DD.Act.bark = orig; }
    }
  });

  T.suite('boss_svammiel: AutoPlay fights him to the end (fixture party; no errors, no timeouts)', function (t) {
    const sanity = T.contentHelpers && T.contentHelpers.sanity;
    const n = Math.max(1, Math.min(4, +(t.param('n', 2)) || 2));
    for (let i = 0; i < n; i++) {
      const r = withActs(4, function () { return simFight('fx' + i + ':' + t.seed, PARTY, 7); });
      if (sanity) sanity(t, 'sim ' + i);
      t.ok(!r.timeout, 'fight ' + i + ' ends (' + r.rounds + ' rounds)');
      t.log('fixture party L7: ' + JSON.stringify(r));
    }
  });
  T.suite('boss_svammiel: zz author sims at L6 (sim=1 only: real random parties, puzzle engagement)', function (t) {
    if (t.param('sim', '0') !== '1') { t.skip('sim=1 runs the author sims'); return; }
    const pool = realHeroIds();
    if (pool.length < 4) { t.skip('real heroes not loaded'); return; }
    withKnobs(t.param('knobs', ''), function () { authorSims(t, pool); });
  });
  /**
   * knobs=hp:420,pitchfork:12,rain:18,windsPerRound:1,style:melee — try a tuning without editing the file (BAL): the
   * numbers of N and the skill levels / def fields they feed, restored afterwards.
   */
  function withKnobs(spec, fn) {
    const N = B().N, def = DD.getEnemy(SV), undo = [];
    const SK = { pitchfork: ['svam_pitchfork', 'dmg'], nat20: ['svam_nat20', 'dmg'], buffet: ['svam_buffet', 'dmg'], rain: ['svam_rain', 'dmg'],
      honest: ['svam_honest', 'dmg'], honestLow: ['svam_honest', 'lowDmg'], jab: ['svam_jab', 'dmg'] };
    String(spec || '').split(',').filter(Boolean).forEach(function (kv) {
      const p = kv.split(':'), k = p[0], v = isNaN(+p[1]) ? p[1] : +p[1];
      if (k === 'style') { const o = def.aiStyle; def.aiStyle = v; undo.push(function () { def.aiStyle = o; }); return; }
      if (k === 'hp') { const o = def.hp; def.hp = v; undo.push(function () { def.hp = o; }); }
      if (k === 'armor') { const o = def.armor; def.armor = v; undo.push(function () { def.armor = o; }); }
      if (SK[k]) { const L = DD.getSkill(SK[k][0]).levels[0], o = L[SK[k][1]]; L[SK[k][1]] = v; undo.push(function () { L[SK[k][1]] = o; }); }
      if (k in N) { const o = N[k]; N[k] = v; undo.push(function () { N[k] = o; }); }
    });
    try { return fn(); } finally { undo.reverse().forEach(function (f) { f(); }); }
  }
  function authorSims(t, pool) {
    t0 = t;
    const n = Math.max(1, +(t.param('n', 20)) || 20), level = +(t.param('level', LV)) || LV;
    const rng = DD.RNG('svam-author:' + t.seed);
    const sum = { win: 0, rounds: 0, caught: 0, rulings: 0, rigged: 0, master: 0, falls: 0, pencil: 0, downs: 0, timeouts: 0, p3: 0 };
    for (let i = 0; i < n; i++) {
      const ids = rng.sample(pool, 4);
      const r = withActs(4, function () { return bareRows(function () { return simFight('a' + i + ':' + t.seed, ids, level); }); });
      sum.win += r.win ? 1 : 0; sum.rounds += r.rounds; sum.caught += r.caught ? 1 : 0; sum.rulings += r.rulings; sum.rigged += r.rigged;
      sum.master += r.master; sum.falls += r.falls; sum.pencil += r.pencil; sum.downs += r.downs; sum.timeouts += r.timeout ? 1 : 0; sum.p3 += r.phase >= 3 ? 1 : 0;
      t.log(i + ' ' + ids.join(',') + ': ' + JSON.stringify(r));
    }
    const pct = Math.round(100 * sum.win / n);
    t.log('AUTHOR L' + level + ': won ' + sum.win + '/' + n + ' (' + pct + '%), avg rounds ' + (sum.rounds / n).toFixed(1) + ', reached phase 3 ' + sum.p3 + ', CAUGHT ' + sum.caught +
      ', Rulings ' + sum.rulings + ', Rigged Dice ' + sum.rigged + ', Master Dice ' + sum.master + ', hero falls ' + (sum.falls / n).toFixed(2) + '/fight, pencil ' + (sum.pencil / n).toFixed(1) +
      '/fight, downs ' + (sum.downs / n).toFixed(2) + '/fight, timeouts ' + sum.timeouts);
    t.ok(pct >= 45 && pct <= 90, 'win rate in the 45-90% band (' + pct + '%)');
    t.ok(sum.timeouts === 0, 'no timeouts');
    t.ok(sum.rulings > 0 && sum.rigged > 0, 'puzzle engagement: Rulings and Rigged Dice');
    t.ok(sum.caught > 0 || sum.p3 === 0, 'CAUGHT reached when phase 3 is');
  }
})();
