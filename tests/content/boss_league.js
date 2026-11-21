/* Dungeons and Degenerates — tests/content/boss_league.js
 * Suites "boss_league: …" for js/data/bosses/league.js (THE LLLLLLLLLLEEEEEEEEEEEAAAAAAAAAAAAGUUUUUUUUUUUUUEEEEEEEEE OF
 * VILLAINY, encounter boss_league, plan .tmp/v3/design.md §3.2 / §5.3 / §5.4): the registry and the user's 56-letter name,
 * the arena, every member's skills against their descs (and the wind-up numbers), the passives (Meat Shield,
 * Unreasonable, Sneak Attack, Expendable Friends), bodies and Spiteful Revival, Villain Hype / the frontman / The Theme
 * Song, Too Evil to Drown and the Trapdoor Lever, the squad objective (E10) and the Nepotism cameo cheat, the voice
 * (lengths, villain pronouns, the dwarf gag, named lines), robustness and AutoPlay battles (real=1: random real parties at
 * L5 against the plan's band). Works isolated (&isolate=league): the fixture heroes stand in for the party.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const ENC = 'boss_league';
  const IDS = ['lg_kelek', 'lg_warduke', 'lg_skylla', 'lg_zarak', 'lg_zargash'];
  const NAMES = { lg_kelek: 'Kelek', lg_warduke: 'Warduke', lg_skylla: 'Skylla', lg_zarak: 'Zarak', lg_zargash: 'Zargash' };
  const LV = 5;

  // ---- helpers --------------------------------------------------------------------------------------------------
  function L() { return DD.League; }
  function S() { return DD.Combat.state; }
  function ready(t) {
    if (!DD.League || !DD.getEncounter(ENC)) { t.skip('js/data/bosses/league.js not loaded'); return false; }
    if (!DD.getHero('test_knight')) { t.skip('needs tests/fixtures.js'); return false; }
    return true;
  }
  function act(fn) { return DD.Combat._action(fn); }
  function partyAt(level, ids) {
    return (ids || PARTY).map(function (id) {
      const h = DD.getHero(id);
      const boons = Math.max(0, level - 1), learn = Math.min(2, boons);
      const list = h.startingSkills.concat(h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, learn));
      const skills = list.map(function (s) { return { id: s, level: 1 }; });
      for (let k = 0, up = boons - learn; up > 0 && k < 12; k++) {
        const sk = skills[k % skills.length];
        if (sk.level < Math.min(3, DD.getSkill(sk.id).levels.length)) { sk.level++; up--; }
      }
      return DD.Combat.makeRunHero({ id: id, level: level, skills: skills });
    });
  }
  /** BAL (V3): the author bands measure the content numbers, so a real=1 author sim runs without DD.Balance's act-4
   *  campaign rows (the act row and this encounter's row, boss_dm.js's bare() pattern); balance=1 keeps them. */
  function bareRows(on, start) {
    const B = DD.Balance, k = DD.MAX_ACT;
    if (!on || !B || DD.params.balance === '1') return start();
    const a = B.act && B.act[k], row = B.encounters && B.encounters[ENC];
    if (a) B.act[k] = { hp: 1, dmg: 1 };
    if (row) delete B.encounters[ENC];
    try { return start(); } finally { if (a) B.act[k] = a; if (row) B.encounters[ENC] = row; }
  }
  /** The real encounter. Default: a scripted fight (no deployment, heroes first, no cameo). opts.real: the real path. */
  function startFight(seed, opts) {
    opts = opts || {};
    const diff = opts.diff || 'normal';
    const setup = DD.Encounter.build(ENC, partyAt(opts.level || LV, opts.ids), { rng: DD.RNG('lg:' + seed), difficulty: diff, act: 4 });
    const o = { seed: seed, headless: true, difficulty: diff, kind: 'boss' };
    if (!opts.cameo) o.cameo = false;
    if (!opts.real) { o.sandbox = true; o.initiative = 'heroesFirst'; }
    return DD.Combat.start(setup, o);
  }
  /** A small scripted arena: heroes and enemies at fixed tiles, the AI off unless asked. */
  function arena(cfg) {
    return DD.Combat.sandbox(Object.assign({ w: 11, h: 11, seed: 7, noPlan: true, enemyAi: false, cameo: false }, cfg));
  }
  function unit(defId) { return S().units.filter(function (u) { return u.defId === defId && !u.dead; })[0]; }
  function units(defId) { return S().units.filter(function (u) { return u.defId === defId; }); }
  function put(u, x, y) { return u.x === x && u.y === y ? true : DD.Act.teleport(u, x, y, { noEnter: true, fx: false }); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function key(p) { return p.x + ',' + p.y; }
  function onList(list, p) { return list.some(function (q) { return q.x === p.x && q.y === p.y; }); }
  /** Damage records (target, base, flat, dealt, cause, skill) while fn runs. */
  function hits(fn) {
    const out = [];
    DD.Act.addRule({ id: 'test_lg_hits', name: 'Test hits', silent: true, hooks: { onTakeDamage: function (d) {
      out.push({ target: d.target, base: d.base, flat: d.flat, dealt: d.dealt, cause: d.cause, skill: d.skill ? d.skill.id : null, amount: d.amount });
    } } });
    try { fn(); } finally { DD.Act.removeRule('test_lg_hits'); }
    out.of = function (u) { return out.filter(function (h) { return h.target === u; }); };
    return out;
  }
  function slotOf(u, id) { return (u.skillSlots || []).filter(function (s) { return s.id === id; })[0] || null; }
  function useNow(u, id, target) { return act(function () { return DD.AI.useNow(u, id, target); }); }
  function land(u, it) { return act(function () { return DD.AI.executeIntent(u, it); }); }
  function windup(u, id) { return (u.intents || []).filter(function (i) { return i.skillId === id; })[0] || null; }
  function bare(u) { u.armor = 0; u.block = 0; (u.statuses || []).slice().forEach(function (st) { DD.Act.removeStatus(u, st.id, { silent: true }); }); }
  function sentences(s) { return String(s).split(/(?<=[.!?…])\s+|\n/); }

  // ---- registry, the name, the encounter ----------------------------------------------------------------------------
  T.suite('boss_league: registry, the user\'s 56-letter name and the encounter', function (t) {
    if (!ready(t)) return;
    // the user's letters: l×10, e×11, a×12, g, u×13, e×9 (plan §0.3 V19)
    const w = L().word(13);
    const runs = [];
    w.toLowerCase().replace(/(.)\1*/g, function (m) { runs.push(m.length + m[0]); return m; });
    t.eq(runs.join(' '), '10l 11e 12a 1g 13u 9e', 'the full word keeps the user\'s letters');
    t.eq(w.length, 56, '56 letters');
    t.eq(L().name(13), 'The ' + w + ' of Villainy', 'the full name');
    t.eq(L().name(13).length, 72, 'the full name has 72 characters');
    t.eq(L().name(1), 'The League of Villainy', 'level 1 is "The League of Villainy"');
    t.eq(L().FULL, L().name(13), 'DD.League.FULL');
    const lens = [];
    for (let n = 1; n <= 13; n++) lens.push(L().name(n).length);
    t.eq(lens.join(','), '22,27,32,37,42,47,52,57,62,66,69,71,72', 'every level caps each letter run (V §8.2.2 table)');
    t.eq(L().name(3), 'The Llleeeaaaguuueee of Villainy', 'level 3 (the objective subtitle form)');
    t.eq(L().name(0), L().name(1), 'junk levels clamp low');
    t.eq(L().name(99), L().FULL, 'junk levels clamp high');
    t.eq(L().fit(50), L().name(6), 'fit(50) is the widest name within 50 characters');
    t.eq(L().fit(5), L().name(1), 'fit never goes below level 1');
    const fr = L().frames();
    t.ok(fr.length === 13 && fr[0] === L().name(1) && fr[12] === L().FULL, 'frames: level 1 → 13');
    // the five
    let total = 0;
    IDS.forEach(function (id) {
      const d = DD.getEnemy(id);
      if (!t.ok(!!d, id + ' registered')) return;
      t.eq(d.name, NAMES[id], id + ': the user\'s name');
      t.ok(d.act === 4 && d.tier === 'elite' && !d.boss, id + ': an act-4 elite with no boss field (squad rules, plan §3.0.1)');
      t.ok(d.tags.indexOf('league') >= 0, id + ': tagged league (Nepotism reads it)');
      t.eq(d.pronoun, id === 'lg_skylla' ? 'she' : 'he', id + ': pronoun');
      t.ok(typeof d.ai === 'function' && !!d.passive && typeof d.passive.desc === 'function', id + ': a custom planner and a live passive line');
      t.ok(typeof d.desc === 'string' && d.desc.length > 60, id + ': a codex desc');
      total += d.hp;
    });
    t.ok(total >= 320 && total <= 365, 'squad total ' + total + ' HP (plan §3.0.5 band 320-365; §3.2 shipped 365 before the author sims)');
    t.eq(total, IDS.reduce(function (n, id) { return n + DD.League.N.hp[id]; }, 0), 'the defs read DD.League.N.hp');
    t.eq(JSON.stringify(IDS.map(function (id) { return DD.getEnemy(id).init; })), JSON.stringify([1, 0, 2, 3, -1]), 'initiative modifiers Kelek +1, Warduke 0, Skylla +2, Zarak +3, Zargash −1');
    t.ok(DD.getEnemy('lg_zarak').flags.immovable === true, 'Zarak is immovable (short and sturdy)');
    // the encounter
    const e = DD.getEncounter(ENC);
    t.eq(e.name, L().FULL, 'encounter name: the full name');
    t.eq(e.shortName, 'The League of Villainy', 'shortName');
    t.ok(e.shortName.length <= 24, 'shortName ≤ 24');
    t.ok(e.act === 4 && e.kind === 'boss' && e.weight === 0, 'act 4, a boss fight, weight 0 (only the gauntlet places it)');
    t.ok(e.gauntlet && e.gauntlet.lane === 'league' && e.gauntlet.order === 2 && e.gauntlet.hint === 'Five of them: control and area damage.', 'gauntlet lane league, order 2, the hint');
    t.ok(e.icon === '🦹' && e.banner === false, 'icon 🦹, banner false (the cameo shows it)');
    t.ok(e.cameo && e.cameo.start === 'svam_cameo_league' && e.cameo.cheat === 'svam_nepotism' && Array.isArray(e.cameo.frames) && e.cameo.frames.length === 13,
      'cameo: announcer svam_cameo_league, cheat svam_nepotism, the stretch frames');
    t.ok(e.reward && e.reward.goldMult === 0.9 && e.reward.itemRarity === 'rare', 'reward: a guaranteed rare, boss gold × 0.9 (lead patch P5)');
    t.eq(JSON.stringify(e.objective.bossIds.slice().sort()), JSON.stringify(IDS.slice().sort()), 'objective.bossIds names the five');
    t.ok(e.objective.type === 'boss' && e.objective.flavor === 'Break the bodies, or the cleric prays them back up.', 'a squad boss objective with the flavor line');
    // the skills
    Object.keys(L().SK).forEach(function (k) {
      const s = DD.getSkill(L().SK[k]);
      t.ok(!!s && s.owner === 'enemy', L().SK[k] + ': an enemy skill');
    });
    ['lg_fireball', 'lg_theme', 'lg_revival'].forEach(function (id) { t.ok(DD.getSkill(id).windupOnly === true, id + ': wind-up only (threat shading sees the at-once kit)'); });
    t.eq(DD.getSkill('lg_revival').charges, 2, 'Spiteful Revival: twice per fight');
    t.ok(DD.getSkill('lg_tunnel').fromStand === true, 'Tunnel Ambush goes off from where he stands');
  });

  // ---- the arena ------------------------------------------------------------------------------------------------
  T.suite('boss_league: the Clubhouse (layout, War Room, podium, Shark Tank, lever, kegs, spawns)', function (t) {
    if (!ready(t)) return;
    const s = startFight(1);
    const g = s.grid;
    t.ok(g.w === 15 && g.h === 13, 'a 15 × 13 arena');
    const at = function (id) { const u = unit(id); return u ? key(u) : null; };
    t.eq(at('lg_warduke'), '5,3', 'Warduke spawns at (5,3)');
    t.eq(at('lg_zarak'), '9,3', 'Zarak spawns at (9,3)');
    t.eq(at('lg_kelek'), '7,1', 'Kelek spawns on the podium (7,1)');
    t.eq(at('lg_skylla'), '3,2', 'Skylla spawns at (3,2)');
    t.eq(at('lg_zargash'), '7,2', 'Zargash spawns at (7,2)');
    const tl = function (x, y) { return DD.Grid.tile(x, y); };
    t.ok(tl(7, 1).h === 2 && tl(6, 1).h === 2 && tl(8, 1).tag === 'podium' && tl(7, 1).tag === 'podium', 'the Villain Podium: 3 tiles at height 2, tagged podium');
    t.ok(tl(0, 0).h === 1 && tl(14, 3).h === 1 && tl(4, 5).h === 0, 'the War Room is a level up');
    t.ok(DD.Grid.terrain(tl(0, 4)).walkable === false && DD.Grid.terrain(tl(4, 4)).walkable === false, 'the wall');
    t.ok(DD.Grid.isWalkable(2, 4) && DD.Grid.isWalkable(6, 4) && DD.Grid.isWalkable(8, 4), 'the side door and the 3-wide stair');
    t.eq(g.tiles.filter(function (x) { return x.t === 'lg_shark_tank'; }).length, 12, 'the Shark Tank: 12 tiles of deep water');
    t.ok(DD.Grid.isDrop(13, 6), 'the Shark Tank is a drop');
    t.ok(tl(0, 8).obj && tl(0, 8).obj.id === 'lg_lever', 'the Trapdoor Lever at (0,8)');
    const kegs = g.tiles.filter(function (x) { return x.obj && x.obj.id === 'barrel_explosive'; });
    t.ok(kegs.length === 3 && kegs.every(function (x) { return x.obj.label === 'Evil Powder Keg'; }), 'three Evil Powder Kegs');
    t.eq(g.tiles.filter(function (x) { return x.obj && x.obj.id === 'lg_table'; }).length, 10, 'the Evil Conference Table (5 × 2)');
    t.eq(g.tiles.filter(function (x) { return x.obj && x.obj.id === 'pillar'; }).length, 4, 'four pillars');
    t.ok(s.units.filter(function (u) { return u.kind === 'hero'; }).every(function (u) { return u.y >= 11; }), 'the heroes deploy at the south end');
    t.ok(s.rules.some(function (r) { return r.id === 'lg_hype' && r.name === 'Villain Hype 0/100' && r.icon === '🎤'; }), 'the Villain Hype rule chip (the HUD prints icon + name: "🎤 Villain Hype 0/100", no doubled icon)');
    t.ok(has(unit('lg_kelek'), 'lg_meat_shield'), 'Kelek wears his Meat Shield from the start');
    t.ok(S().log.some(function (l) { return l.text.indexOf(L().word(13)) >= 0; }), 'Kelek\'s intro says the full name (the log wraps it)');
  });

  // ---- Warduke ---------------------------------------------------------------------------------------------------
  T.suite('boss_league: Warduke — Skull Splitter, Hero Punt into walls / heroes / the tank, Bodyguard, Unreasonable', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_mage', x: 4, y: 4, level: 5 }, { id: 'test_cleric', x: 0, y: 0, level: 5 }],
      enemies: [{ id: 'lg_warduke', x: 3, y: 4 }, { id: 'lg_kelek', x: 5, y: 9 }],
      terrain: function (tl) { if (tl.x === 8 && tl.y === 4) tl.t = 'lg_shark_tank'; } });
    const w = unit('lg_warduke'), m = unit('test_mage'), k = unit('lg_kelek');
    bare(m);
    const Ls = DD.skillLevel(DD.getSkill('lg_skull'), 1);
    let rec = hits(function () { useNow(w, 'lg_skull', m); });
    t.ok(rec.of(m).length === 1 && rec.of(m)[0].base === Ls.dmg && rec.of(m)[0].dealt === Ls.dmg, 'Skull Splitter: ' + Ls.dmg + ' damage (' + JSON.stringify(rec.of(m)[0]) + ')');
    // Bodyguard: a hero next to a caster is worth more
    const ctxFar = DD.Targeting.buildCtx(w, slotOf(w, 'lg_skull'), { x: m.x, y: m.y });
    t.eq(DD.getSkill('lg_skull').aiScore(ctxFar), 0, 'Bodyguard: +0 for a hero next to nobody');
    put(k, 5, 4);
    const ctxNear = DD.Targeting.buildCtx(w, slotOf(w, 'lg_skull'), { x: m.x, y: m.y });
    t.eq(DD.getSkill('lg_skull').aiScore(ctxNear), 6, 'Bodyguard: +6 for a hero next to Kelek');
    // Hero Punt
    const Lp = DD.skillLevel(DD.getSkill('lg_punt'), 1);
    put(k, 5, 9);
    m.hp = m.maxHp;
    rec = hits(function () { useNow(w, 'lg_punt', m); });
    t.ok(m.x === 7 && m.y === 4 && rec.of(m).length === 0, 'Hero Punt: ' + Lp.dist + ' tiles away, no crash, no damage (' + key(m) + ')');
    act(function () { DD.Act.setCooldown(w, 'lg_punt', 0); });
    put(m, 4, 4); put(unit('test_cleric'), 6, 4); bare(unit('test_cleric'));
    rec = hits(function () { useNow(w, 'lg_punt', m); });
    t.ok(m.x === 5 && rec.of(m).some(function (h) { return h.cause === 'bump' && h.base === Lp.crash; }) &&
      rec.of(unit('test_cleric')).some(function (h) { return h.cause === 'bump' && h.base === Lp.crash; }), 'a crash: it and what it hits take ' + Lp.crash);
    // into the Shark Tank: a hero loses 25% of max HP and climbs out
    put(unit('test_cleric'), 0, 0);
    put(m, 6, 4); put(w, 5, 4);
    m.hp = m.maxHp;
    const ctxTank = DD.Targeting.buildCtx(w, slotOf(w, 'lg_punt'), { x: m.x, y: m.y });
    t.ok(DD.getSkill('lg_punt').aiScore(ctxTank) > 10, 'the AI likes a punt into the Shark Tank (' + DD.getSkill('lg_punt').aiScore(ctxTank) + ')');
    act(function () { DD.Act.setCooldown(w, 'lg_punt', 0); });
    useNow(w, 'lg_punt', m);
    t.ok(!DD.Grid.isDrop(m.x, m.y) && m.hp === m.maxHp - Math.ceil(m.maxHp * 0.25) && has(m, 'wet'), 'into the tank: 25% of max HP, Wet, climbed out (' + m.hp + '/' + m.maxHp + ' at ' + key(m) + ')');
    // Unreasonable below half HP: immovable and +3 (telegraph and the hit)
    w.hp = Math.ceil(w.maxHp / 2) + 1;
    act(function () { DD.Act.damage(null, w, 5, { cause: 'other' }); });
    t.ok(has(w, 'lg_unreasonable') && w.flags.immovable === true, 'below half HP: Unreasonable and immovable');
    t.eq(DD.AI.telegraphFlat(w), DD.League.N.unreasonable, 'the +3 shows on his numbers (status telegraphFlat)');
    const before = { x: w.x, y: w.y };
    act(function () { DD.Act.push(m, w, { x: -1, y: 0 }, 2); });
    t.ok(w.x === before.x && w.y === before.y, 'Unreasonable: he can\'t be pushed');
    put(m, w.x + 1, w.y); bare(m); m.hp = m.maxHp;
    rec = hits(function () { useNow(w, 'lg_skull', m); });
    t.ok(rec.of(m).length === 1 && rec.of(m)[0].dealt === Ls.dmg + DD.League.N.unreasonable, 'Unreasonable Skull Splitter: ' + (Ls.dmg + DD.League.N.unreasonable));
    const o = DD.Act.opportunityOf(w, m, { x: m.x, y: m.y });
    t.ok(!!o && o.flat === DD.League.N.unreasonable, 'and on his attack of opportunity (o.flat ' + (o && o.flat) + ')');
    act(function () { DD.Act.heal(null, w, w.maxHp); });
    t.ok(!has(w, 'lg_unreasonable') && !w.flags.immovable, 'healed above half: reasonable (and movable) again');
  });

  // ---- Zarak -----------------------------------------------------------------------------------------------------
  T.suite('boss_league: Zarak — immovable, Shin Splitter, Tunnel Ambush, Sneak Attack (and its wind-up number)', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_mage', x: 5, y: 5, level: 5 }, { id: 'test_cleric', x: 0, y: 10, level: 5 }],
      enemies: [{ id: 'lg_zarak', x: 4, y: 5 }, { id: 'lg_warduke', x: 9, y: 9 }] });
    const z = unit('lg_zarak'), m = unit('test_mage'), w = unit('lg_warduke');
    bare(m);
    const r = DD.Act.push(m, z, { x: -1, y: 0 }, 2);
    t.ok(r.moved === 0 && z.x === 4, 'Zarak can\'t be pushed');
    t.ok(!DD.Act.swap(z, w), 'nor swapped by a skill');
    const Ls = DD.skillLevel(DD.getSkill('lg_shins'), 1);
    let rec = hits(function () { useNow(z, 'lg_shins', m); });
    t.ok(rec.of(m).length === 1 && rec.of(m)[0].dealt === Ls.dmg && rec.of(m)[0].flat === 0, 'Shin Splitter: ' + Ls.dmg + ' damage');
    const bl = DD.Act.getStatus(m, 'bleed');
    t.ok(!!bl && bl.stacks === Ls.bleed, 'and Bleed ' + Ls.bleed);
    // Sneak Attack (Audible): +4 next to another League member — the hit, the wind-up number, the attack of opportunity
    const it0 = DD.AI.makeIntent(z, 'lg_shins', m, { noAdd: true, noCooldown: true });
    t.eq(DD.AI.intentDmg(z, it0), Ls.dmg, 'no flank: the number is ' + Ls.dmg);
    put(w, 5, 6);
    const it1 = DD.AI.makeIntent(z, 'lg_shins', m, { noAdd: true, noCooldown: true });
    t.eq(DD.AI.intentDmg(z, it1), Ls.dmg + DD.League.N.sneak, 'flanked by Warduke: the number shows +' + DD.League.N.sneak);
    bare(m); m.hp = m.maxHp;
    rec = hits(function () { useNow(z, 'lg_shins', m); });
    t.ok(rec.of(m).length === 1 && rec.of(m)[0].dealt === Ls.dmg + DD.League.N.sneak, 'and the hit deals it (' + JSON.stringify(rec.of(m)[0]) + ')');
    const o = DD.Act.opportunityOf(z, m, { x: m.x, y: m.y });
    t.ok(!!o && o.flat === DD.League.N.sneak, 'Sneak Attack rides on his attack of opportunity too');
    // Tunnel Ambush: pops up next to a foe within 6, 10 damage + Slowed, never provokes
    const Lt = DD.skillLevel(DD.getSkill('lg_tunnel'), 1);
    put(w, 9, 9); put(z, 0, 0); put(m, 3, 3); bare(m); m.hp = m.maxHp;
    const c = unit('test_cleric');
    const targets = DD.Targeting.validTargets(z, slotOf(z, 'lg_tunnel'));
    t.ok(onList(targets, m) && !onList(targets, c), 'targets: the mage within ' + Lt.r + ', not the cleric 10 away');
    rec = hits(function () { useNow(z, 'lg_tunnel', m); });
    t.ok(DD.Grid.dist(z, m) === 1, 'Zarak pops up next to the mage (' + key(z) + ')');
    t.ok(rec.of(m).length === 1 && rec.of(m)[0].dealt === Lt.dmg, 'Tunnel Ambush: ' + Lt.dmg + ' damage');
    const sl = DD.Act.getStatus(m, 'slow');
    t.ok(!!sl && sl.turns === 1, 'and Slowed through its next turn');
    t.ok(rec.of(z).length === 0, 'the dash provoked nothing');
    // no room next to the victim: no target
    put(z, 0, 0); put(m, 5, 5);
    act(function () {
      [[4, 5], [6, 5], [5, 4], [5, 6]].forEach(function (p) { DD.Act.placeObject(p[0], p[1], 'pillar'); });
    });
    t.eq(DD.getSkill('lg_tunnel').target.canTarget(DD.Targeting.buildCtx(z, slotOf(z, 'lg_tunnel'), { x: 5, y: 5 })), 'No room to pop up next to it.', 'boxed in: no room to pop up');
  });

  // ---- Kelek -----------------------------------------------------------------------------------------------------
  T.suite('boss_league: Kelek — Evil Missiles, the Unspeakable Fireball wind-up, Meat Shield', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_mage', x: 7, y: 1, level: 5 }, { id: 'test_cleric', x: 1, y: 4, level: 5 }, { id: 'test_rogue', x: 4, y: 7, level: 5 },
      { id: 'test_knight', x: 10, y: 10, level: 5 }],
      enemies: [{ id: 'lg_kelek', x: 4, y: 4 }, { id: 'lg_warduke', x: 9, y: 0 }, { id: 'lg_zarak', x: 0, y: 10 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 5) { tl.t = 'wall'; } } });
    const k = unit('lg_kelek'), m = unit('test_mage'), c = unit('test_cleric'), r = unit('test_rogue'), kn = unit('test_knight');
    [m, c, r, kn].forEach(bare);
    m.hp = 10; c.hp = 12; r.hp = 20;
    const Lm = DD.skillLevel(DD.getSkill('lg_missiles'), 1);
    const foes = DD.League.missileFoes(k).map(function (u) { return u.defId; });
    t.eq(JSON.stringify(foes), JSON.stringify(['test_mage', 'test_cleric', 'test_rogue']), 'Evil Missiles pick up to 3 foes within ' + Lm.r + ', the weakest first (the knight is 12 away)');
    const rec = hits(function () { useNow(k, 'lg_missiles', k); });
    t.ok([m, c, r].every(function (u) { return rec.of(u).length === 1 && rec.of(u)[0].dealt === Lm.dmg; }) && !rec.of(kn).length,
      'each takes ' + Lm.dmg + ' (the rogue behind a wall too: no line of sight needed)');
    // Meat Shield: half damage with Warduke next to him (and the estimate agrees)
    const w = unit('lg_warduke');
    k.hp = k.maxHp;
    let lost = k.hp; act(function () { DD.Act.damage(null, k, 10, { cause: 'other' }); }); lost -= k.hp;
    t.eq(lost, 10, 'no Warduke next to him: 10 is 10');
    put(w, 5, 4);
    t.eq(DD.Act.takenMult(k), 0.5, 'Warduke next to him: takenMult 0.5');
    t.eq(DD.AI.estimate(m, k, 10), 5, 'the AI estimate sees the Meat Shield');
    k.hp = k.maxHp;
    lost = k.hp; act(function () { DD.Act.damage(null, k, 10, { cause: 'other' }); }); lost -= k.hp;
    t.eq(lost, 5, 'and so does the hit: 5');
    // the fireball: radius 2 around a tile within 7, 16 fire to every unit there, League included
    const Lf = DD.skillLevel(DD.getSkill('lg_fireball'), 1);
    put(w, 9, 0);
    put(m, 6, 6); put(c, 6, 7); put(r, 9, 9); put(unit('lg_zarak'), 7, 6);
    [m, c, r].forEach(function (u) { u.hp = u.maxHp; });
    const z = unit('lg_zarak'); z.armor = 0;
    const center = DD.League.fireballCenter(k);
    t.ok(!!center && DD.Grid.dist(center, k) <= Lf.range, 'a fireball centre within ' + Lf.range + ' (' + (center && key(center)) + ')');
    const it = act(function () { return DD.AI.windUp(k, 'lg_fireball', { x: 6, y: 6 }, { anchor: 'ground', label: 'Unspeakable Fireball' }); });
    t.ok(!!it && DD.AI.intentTiles(k, it).length === 13, 'the marked area: radius ' + Lf.r + ' (13 tiles)');
    t.eq(DD.AI.intentDmg(k, it), Lf.dmg, 'its number: ' + Lf.dmg);
    t.eq(slotOf(k, 'lg_fireball').cd, DD.getSkill('lg_fireball').cooldown, 'the cooldown starts at the wind-up');
    const rec2 = hits(function () { land(k, it); });
    t.ok(rec2.of(m).length === 1 && rec2.of(m)[0].dealt === Lf.dmg && rec2.of(c).length === 1, 'the heroes in it take ' + Lf.dmg);
    t.ok(rec2.of(z).length === 1 && rec2.of(z)[0].dealt === Lf.dmg, 'League included: Zarak takes ' + Lf.dmg + ' too');
    t.ok(!rec2.of(r).length, 'nobody outside the marked tiles');
    // with one hero in reach, no fireball
    put(r, 0, 10); put(m, 10, 0);
    t.eq(DD.League.fireballCenter(k), null, 'one hero in reach: no fireball');
  });

  // ---- Skylla ----------------------------------------------------------------------------------------------------
  T.suite('boss_league: Skylla — Eldritch Blah, the Hex, Expendable Friends (once, nearest, credit; previews honest)', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_mage', x: 2, y: 2, level: 5 }, { id: 'test_knight', x: 9, y: 2, level: 5 }],
      enemies: [{ id: 'lg_skylla', x: 2, y: 8 }, { id: 'lg_warduke', x: 3, y: 9 }, { id: 'lg_zarak', x: 8, y: 9 }, { id: 'lg_kelek', x: 0, y: 0 }] });
    const sk = unit('lg_skylla'), m = unit('test_mage');
    bare(m);
    const Lb = DD.skillLevel(DD.getSkill('lg_blah'), 1);
    const rec = hits(function () { useNow(sk, 'lg_blah', m); });
    t.ok(rec.of(m).length === 1 && rec.of(m)[0].dealt === Lb.dmg, 'Eldritch Blah: ' + Lb.dmg + ' damage');
    t.ok(m.x === 2 && m.y === 2 + Lb.pull, 'pulled ' + Lb.pull + ' tiles toward her (' + key(m) + ')');
    const Lh = DD.skillLevel(DD.getSkill('lg_hex'), 1);
    useNow(sk, 'lg_hex', m);
    const v = DD.Act.getStatus(m, 'vulnerable');
    t.ok(!!v && v.turns === Lh.turns, 'Hex of Mild Inconvenience: Vulnerable for ' + Lh.turns + ' turns');
    // Expendable Friends: the nearest other member takes the killing blow; she is left at 1 HP
    const w = unit('lg_warduke'), kn = unit('test_knight');
    const victim = DD.League.expendableVictim(sk);
    t.ok(victim === w, 'the nearest other member: Warduke (2 away)');
    // the preview of a lethal hit is honest and leaves no trace
    sk.hp = 3;
    const pv = act(function () { return DD.Targeting.preview(m, m.basic, { x: sk.x, y: sk.y }); });
    const ld = S().data.league;
    t.ok(!!pv && !w.dead && sk.hp === 3 && !(ld && ld.expended) && !sk.data.lgExpended, 'a preview runs it on a copy only');
    const e = pv && pv.perUnit[sk.id];
    t.ok(!!e && !e.lethal, 'the preview does not promise a kill on Skylla (' + JSON.stringify(e) + ')');
    act(function () { DD.Act.damage(kn, sk, 20, { cause: 'other' }); });
    t.ok(!sk.dead && sk.hp === 1, 'she survives at 1 HP');
    t.ok(w.dead, 'Warduke takes the blow');
    t.ok(S().stats.units[kn.id] && S().stats.units[kn.id].kills >= 1, 'the kill credits the hero who struck');
    act(function () { DD.Act.damage(kn, sk, 5, { cause: 'other' }); });
    t.ok(sk.dead, 'once per fight: the next killing blow kills her');
    // ties: equal distance → the lowest HP
    arena({ heroes: [{ id: 'test_mage', x: 0, y: 0, level: 5 }],
      enemies: [{ id: 'lg_skylla', x: 5, y: 5 }, { id: 'lg_warduke', x: 5, y: 7 }, { id: 'lg_zargash', x: 7, y: 5 }] });
    unit('lg_warduke').hp = 30;
    t.ok(DD.League.expendableVictim(unit('lg_skylla')) === unit('lg_warduke'), 'a tie on distance: the lowest HP (Warduke at 30)');
    // nobody else standing: she just dies
    arena({ heroes: [{ id: 'test_mage', x: 0, y: 0, level: 5 }], enemies: [{ id: 'lg_skylla', x: 5, y: 5 }] });
    act(function () { DD.Act.damage(unit('test_mage'), unit('lg_skylla'), 999, { cause: 'other' }); });
    t.ok(!unit('lg_skylla'), 'alone, a killing blow kills her');
  });

  // ---- Zargash, bodies, Spiteful Revival ---------------------------------------------------------------------------
  T.suite('boss_league: Zargash — Smite, Unholy Water, bodies and Spiteful Revival (2 charges; broken body or stun stops it)', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 5, level: 5 }, { id: 'test_knight', x: 10, y: 10, level: 5 }],
      enemies: [{ id: 'lg_zargash', x: 5, y: 5 }, { id: 'lg_warduke', x: 3, y: 5 }, { id: 'lg_kelek', x: 5, y: 2 }] });
    const z = unit('lg_zargash'), m = unit('test_mage'), w = unit('lg_warduke');
    bare(m);
    const Lsm = DD.skillLevel(DD.getSkill('lg_smite'), 1);
    let rec = hits(function () { useNow(z, 'lg_smite', m); });
    t.ok(rec.of(m).length === 1 && rec.of(m)[0].dealt === Lsm.dmg, 'Smite of Disapproval: ' + Lsm.dmg);
    // Unholy Water: another League member within 5, 15 HP
    const Lw = DD.skillLevel(DD.getSkill('lg_water'), 1);
    w.hp = 40;
    useNow(z, 'lg_water', w);
    t.eq(w.hp, 40 + Lw.heal, 'Unholy Water heals Warduke ' + Lw.heal);
    const can = DD.getSkill('lg_water').target.canTarget;
    t.eq(can(DD.Targeting.buildCtx(z, slotOf(z, 'lg_water'), { x: z.x, y: z.y })), 'Only another League member.', 'never himself');
    // a fallen member leaves a body: 10 HP, breakable by any single-target damage skill
    act(function () { DD.Act.kill(w, m); });
    const bt = DD.Grid.tile(3, 5);
    t.ok(bt.obj && bt.obj.id === 'lg_body' && bt.obj.hp === 10 && bt.obj.data.defId === 'lg_warduke' && /Warduke/.test(bt.obj.label), 'Warduke\'s body on his tile (10 HP)');
    const q = DD.Targeting.validTargets(m, m.basic).filter(function (p) { return p.x === 3 && p.y === 5; })[0];
    t.ok(!!q && q.obj === 'lg_body', 'the body is a target for the party (D1)');
    t.eq(DD.getObject('lg_body').autoplay(m, bt.obj, bt, S(), 'break'), 12, 'AutoPlay: a body Zargash can raise is worth 12');
    // Spiteful Revival
    const it = act(function () { return DD.AI.windUp(z, 'lg_revival', { x: 3, y: 5 }, { anchor: 'ground', tiles: [{ x: 3, y: 5 }], label: 'Spiteful Revival' }); });
    t.ok(!!it && DD.AI.intentTiles(z, it).length === 1, 'the wind-up marks the body tile');
    t.eq(DD.getObject('lg_body').autoplay(m, bt.obj, bt, S(), 'break'), 30, 'with a raise pending on it: 30');
    const before = S().units.length;
    land(z, it);
    const w2 = unit('lg_warduke');
    t.ok(!!w2 && w2 !== w && w2.x === 3 && w2.y === 5 && w2.hp === Math.ceil(w2.maxHp / 2), 'Warduke gets back up with half his max HP (' + (w2 && w2.hp) + ')');
    t.ok(!DD.Grid.tile(3, 5).obj, 'the body is gone');
    t.ok(S().units.length === before + 1 && w2.data.raised, 'a new unit (it rolls initiative as a joiner)');
    t.eq(slotOf(z, 'lg_revival').uses, 1, 'one charge spent');
    // a broken body: the prayer fizzles
    act(function () { DD.Act.kill(w2, m); });
    const it2 = act(function () { return DD.AI.windUp(z, 'lg_revival', { x: 3, y: 5 }, { anchor: 'ground', tiles: [{ x: 3, y: 5 }] }); });
    act(function () { DD.Act.damageObject(m, 3, 5, 10); });
    t.ok(!DD.Grid.tile(3, 5).obj, 'the body breaks at 10 damage');
    land(z, it2);
    t.ok(!unit('lg_warduke'), 'no body, no Warduke');
    t.eq(slotOf(z, 'lg_revival').uses, 2, 'both charges spent');
    const api = DD.AI.api(z);
    t.ok(!api.canUse(z, 'lg_revival'), 'twice per fight: no third revival');
    // a stun interrupts it
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 5, level: 5 }], enemies: [{ id: 'lg_zargash', x: 5, y: 5 }, { id: 'lg_kelek', x: 3, y: 5 }] });
    act(function () { DD.Act.kill(unit('lg_kelek'), unit('test_mage')); });
    const z2 = unit('lg_zargash');
    act(function () { DD.AI.act(z2); });
    t.ok(!!windup(z2, 'lg_revival'), 'his planner winds up a revival on the body within reach');
    act(function () { DD.Act.addStatus(z2, 'stun', { turns: 1 }, unit('test_mage')); });
    t.ok(!windup(z2, 'lg_revival'), 'a stun interrupts it');
    // Zargash dead: the bodies are décor
    act(function () { DD.Act.kill(z2, unit('test_mage')); });
    const bodies = DD.League.bodyTiles();
    t.ok(bodies.length === 2 && bodies.every(function (b) { return DD.getObject('lg_body').autoplay(unit('test_mage'), b.obj, b, S(), 'break') === 0; }),
      'no Zargash: no body is worth breaking');
  });

  // ---- Villain Hype and The Theme Song --------------------------------------------------------------------------
  T.suite('boss_league: Villain Hype, the frontman and The Theme Song (singers × 5, the podium twice, an honest number)', function (t) {
    if (!ready(t)) return;
    const s = startFight(3);
    s.aiOff = true;
    const d = s.data.league;
    t.ok(!!d && d.on && d.hype === 0, 'the League\'s fight memory, Hype 0');
    d.expended = true;   // Skylla's Expendable Friends is spent: the kills below land where they are aimed
    const k = unit('lg_kelek'), w = unit('lg_warduke'), sk = unit('lg_skylla'), z = unit('lg_zarak'), zg = unit('lg_zargash');
    // sources: a round end +10, a downed hero +20, a fallen member +10
    DD.Combat.endRound();
    t.eq(d.hype, 10, '+10 at the end of a round');
    t.ok(s.rules.some(function (r) { return r.id === 'lg_hype' && r.name === 'Villain Hype 10/100'; }), 'the chip shows it');
    const h = s.units.filter(function (u) { return u.kind === 'hero' && !u.downed; })[0];
    act(function () { DD.Act.kill(h, k); });
    t.eq(d.hype, 30, '+20 for a downed hero');
    t.eq(DD.League.frontman(s), k, 'the frontman: Kelek');
    t.eq(DD.League.songCount(s), 6, 'five singers, Kelek on the podium counts twice: 6');
    act(function () { DD.Act.addStatus(z, 'stun', { turns: 1 }, null); DD.Act.addStatus(sk, 'charmed', { turns: 1 }, h); });
    t.eq(DD.League.songCount(s), 4, 'stunned and charmed members don\'t sing');
    act(function () { DD.Act.removeStatus(z, 'stun', { silent: true }); DD.Act.removeStatus(sk, 'charmed', { silent: true }); });
    act(function () { DD.Act.kill(k, null); });
    t.eq(d.hype, 40, '+10 for a fallen member');
    t.eq(DD.League.frontman(s), w, 'Kelek down: Warduke fronts');
    act(function () { DD.Act.kill(w, null); });
    t.eq(DD.League.frontman(s), sk, 'then Skylla');
    act(function () { DD.Act.kill(sk, null); });
    t.eq(DD.League.frontman(s), zg, 'then Zargash');
    act(function () { DD.Act.kill(zg, null); });
    t.eq(DD.League.frontman(s), z, 'then Zarak');
    t.eq(d.hype, 70, 'and every fall paid +10');
    // the song: at 100, on the frontman's turn
    const s2 = startFight(4);
    s2.aiOff = true;
    const d2 = s2.data.league;
    const kk = unit('lg_kelek');
    d2.hype = 100;
    const heroesOn = s2.units.filter(function (u) { return u.kind === 'hero'; });
    // two heroes near the War Room, one far away
    put(heroesOn[0], 7, 4); put(heroesOn[1], 4, 5); put(heroesOn[2], 1, 10);
    act(function () { DD.AI.act(kk); });
    const it = windup(kk, 'lg_theme');
    t.ok(!!it, 'Kelek winds up The Theme Song');
    t.eq(d2.hype, 0, 'the meter resets');
    t.ok(!windup(kk, 'lg_fireball'), 'instead of the Fireball');
    const tiles = DD.AI.intentTiles(kk, it);
    t.ok(onList(tiles, heroesOn[0]) && onList(tiles, heroesOn[1]) && !onList(tiles, heroesOn[2]), 'marked: within 3 of a singer');
    const n = DD.League.songCount(s2);
    const per = DD.skillLevel(DD.getSkill('lg_theme'), 1).dmg;
    t.eq(DD.AI.intentDmg(kk, it), per * n, 'its number: ' + per + ' × ' + n + ' voices');
    // a singer stunned before it lands: the number drops, and so does the hit
    act(function () { DD.Act.addStatus(unit('lg_zarak'), 'stun', { turns: 1 }, null); });
    const n2 = DD.League.songCount(s2);
    t.eq(DD.AI.intentDmg(kk, it), per * n2, 'one voice down: ' + per * n2);
    heroesOn.forEach(function (u) { bare(u); u.hp = u.maxHp; });
    const rec = hits(function () { land(kk, it); });
    t.ok(rec.of(heroesOn[0]).length === 1 && rec.of(heroesOn[0])[0].dealt === per * n2 && rec.of(heroesOn[1])[0].dealt === per * n2,
      'every hero on the marked tiles takes ' + per * n2 + ' (' + JSON.stringify(rec.of(heroesOn[0])[0]) + ')');
    t.ok(!rec.of(heroesOn[2]).length, 'nobody off them');
    t.ok(!rec.some(function (x) { return x.target.side === 'enemy'; }), 'the League sings at the heroes, not at itself');
    // QA FIGHTS-10: the narration follows the outcome (a hit: league_song; every hero out of the red: league_song_whiff)
    const sung = function (key) { const p = DD.defs.narration[key] || []; return S().log.filter(function (l) { return p.indexOf(l.text) >= 0; }).length; };
    t.ok(sung('league_song') === 1 && sung('league_song_whiff') === 0, 'a song that hits: the hit narration');
    const spare = DD.Grid.allTiles().filter(function (q) { return DD.Grid.isFree(q.x, q.y) && !DD.Grid.isDrop(q.x, q.y) && !onList(tiles, q); });
    heroesOn.forEach(function (u, i) { if (onList(tiles, u)) put(u, spare[i].x, spare[i].y); });
    const rec2 = hits(function () { land(kk, it); });
    t.ok(!rec2.some(function (x) { return x.target.kind === 'hero'; }), 'everybody stepped out: nobody hit');
    t.ok(sung('league_song') === 1 && sung('league_song_whiff') === 1, 'and the narration says it hit nobody (' + sung('league_song') + '/' + sung('league_song_whiff') + ')');
  });

  // ---- Too Evil to Drown, the Trapdoor Lever --------------------------------------------------------------------
  T.suite('boss_league: Too Evil to Drown and the Trapdoor Lever (the podium into the Shark Tank; resets after 3 rounds)', function (t) {
    if (!ready(t)) return;
    const s = startFight(5);
    s.aiOff = true;
    const z = unit('lg_zarak');
    const hp0 = z.hp;
    act(function () { DD.Act.kill(z, null, { cause: 'fall' }); });
    t.ok(!z.dead && z.hp === hp0 - DD.League.N.tank && (DD.Act.getStatus(z, 'bleed') || {}).stacks === DD.League.N.tankBleed,
      'a fall: ' + DD.League.N.tank + ' damage and Bleed ' + DD.League.N.tankBleed + ', no death');
    z.hp = 5;
    act(function () { DD.Act.kill(z, null, { cause: 'fall' }); });
    t.ok(!z.dead && z.hp === 1, 'never below 1 HP');
    // pushed into the tank: survives and climbs out
    const sk = unit('lg_skylla');
    put(sk, 12, 7);
    const hp1 = sk.hp;
    act(function () { DD.Act.push(null, sk, { x: 1, y: 0 }, 2); });
    // (the push itself then ticks the fresh Bleed once: "each move or push")
    t.ok(!sk.dead && sk.hp <= hp1 - DD.League.N.tank && has(sk, 'bleed') && !DD.Grid.isDrop(sk.x, sk.y), 'pushed into the Shark Tank: hurt, Bleeding, climbed out (' + key(sk) + ', ' + sk.hp + '/' + hp1 + ')');
    // the lever: everyone on the podium drops in
    const k = unit('lg_kelek'), zg = unit('lg_zargash');
    const heroes = s.units.filter(function (u) { return u.kind === 'hero'; });
    const kn = heroes[0], puller = heroes[1], flyer = heroes[2];
    t.ok(put(kn, 6, 1) && put(zg, 8, 1) && put(puller, 1, 8), 'Kelek, Zargash and a hero on the podium; a hero at the lever');
    const lever = DD.Grid.tile(0, 8).obj;
    t.eq(DD.getObject('lg_lever').autoplay(puller, lever, DD.Grid.tile(0, 8), S(), 'interact'), 25 * 2 - 15, 'AutoPlay: 25 per villain on the podium − 15 per hero');
    const kh = k.hp, zh = zg.hp, nh = kn.hp;
    t.ok(DD.Combat.interactions(puller).some(function (o) { return o.x === 0 && o.y === 8 && o.kind === 'object'; }), 'a hero next to it can pull it');
    act(function () { DD.Act.interact(puller, 0, 8); });
    const nearTank = function (u) { return S().grid.tiles.some(function (x) { return x.t === 'lg_shark_tank' && DD.Grid.dist(x, u) <= 2; }); };
    t.ok(k.hp === kh - DD.League.N.tank && zg.hp === zh - DD.League.N.tank && !k.dead && !zg.dead, 'Kelek and Zargash: ' + DD.League.N.tank + ' each, no death');
    t.ok(has(k, 'bleed') && has(zg, 'bleed'), 'and Bleed');
    t.ok(kn.hp === nh - Math.ceil(kn.maxHp * 0.25) && has(kn, 'wet'), 'the hero on the podium: 25% of max HP and Wet');
    t.ok([k, zg, kn].every(nearTank) && [k, zg, kn].every(function (u) { const tl = DD.Grid.tile(u.x, u.y); return tl.tag !== 'podium' && !DD.Grid.isDrop(u.x, u.y); }),
      'all climbed out at the tank\'s edge (' + [k, zg, kn].map(key).join(' ') + ')');
    t.ok(lever.data.usedRound === S().round && !DD.Act.interactionOf(lever, puller), 'pulled: no second pull');
    const enc = DD.getEncounter(ENC);
    const used = lever.data.usedRound;
    S().round = used + 2; enc.onRoundEnd(S());
    t.ok(!!lever.data.usedRound, 'still down two rounds later');
    S().round = used + 3; enc.onRoundEnd(S());
    t.ok(!lever.data.usedRound && !!DD.Act.interactionOf(lever, puller), 'reset at the end of the third round after');
    // flyers stay put
    flyer.flags.flying = true;
    DD.Act.touch();
    t.ok(put(flyer, 7, 1), 'a flyer on the podium');
    const fh = flyer.hp;
    act(function () { DD.League.trapdoor(puller); });
    t.ok(flyer.x === 7 && flyer.y === 1 && flyer.hp === fh, 'a flyer on the podium stays put');
  });

  // ---- the squad objective and the cameo cheat -------------------------------------------------------------------
  T.suite('boss_league: the squad objective (E10: all five, a raised one too) and Svammiel\'s Nepotism', function (t) {
    if (!ready(t)) return;
    const s = startFight(6);
    s.aiOff = true;
    s.data.league.expended = true;   // the kills below land where they are aimed
    t.ok(s.objective.type === 'boss' && Array.isArray(s.objective.bossIds) && s.objective.bossIds.length === 5, 'the objective survives the build: a squad boss fight');
    t.ok(/League of Villainy \(5 left\)/.test(s.objective.text), 'objective text: ' + s.objective.text);
    t.eq(s.objective.flavor, 'Break the bodies, or the cleric prays them back up.', 'the flavor line');
    const h = s.units.filter(function (u) { return u.kind === 'hero'; })[0];
    ['lg_kelek', 'lg_warduke', 'lg_skylla', 'lg_zarak'].forEach(function (id) { act(function () { DD.Act.kill(unit(id), h); }); });
    t.ok(!s.result, 'four down: not over');
    // Zargash prays one back up: still not over when Zargash falls
    const zg = unit('lg_zargash');
    const body = DD.League.bodyTiles().filter(function (b) { return DD.Grid.dist(b, zg) <= 4; })[0];
    t.ok(!!body, 'a body within 4 of Zargash');
    const it = act(function () { return DD.AI.windUp(zg, 'lg_revival', { x: body.x, y: body.y }, { anchor: 'ground', tiles: [{ x: body.x, y: body.y }] }); });
    land(zg, it);
    const raised = s.units.filter(function (u) { return u.data && u.data.raised && !u.dead; })[0];
    t.ok(!!raised, 'a member is back');
    act(function () { DD.Act.kill(zg, h); });
    t.ok(!s.result, 'Zargash down, the raised one standing: not over');
    act(function () { DD.Act.kill(raised, h); });
    t.eq(s.result, 'victory', 'every squad unit down: victory');
    t.ok(S().log.some(function (l) { return /League of Villainy is disbanded|Ringlerun locks the Staff/.test(l.text); }), 'the league_death narration');
    // Nepotism (C5's cheat, played by DD.Cameo): +3 initiative for every League member
    const cam = DD.getCameo && DD.getCameo('svammiel');
    if (!cam || !DD.Cameo || DD.Cameo.stub || !cam.cheats || !cam.cheats.svam_nepotism) { t.log('Svammiel\'s cameo / cameo.js not loaded: Nepotism check skipped'); return; }
    const s2 = startFight(7, { real: true, cameo: true });
    t.ok(s2.rules.some(function (r) { return r.id === 'cameo:svam_nepotism'; }), 'the start cameo applies Nepotism');
    DD.Combat.rollInitiative();
    const order = S().order || [];
    const lg = order.filter(function (e) { const u = DD.Combat.byId(e.unitId); return u && (u.tags || []).indexOf('league') >= 0; });
    t.ok(lg.length === 5 && lg.every(function (e) { return e.total === e.roll + e.init + 3; }), 'every League member rolls +3 initiative');
  });

  // ---- voice -----------------------------------------------------------------------------------------------------
  T.suite('boss_league: voice — lengths, villain pronouns, the dwarf gag, named lines, banter, mourning, narration', function (t) {
    if (!ready(t)) return;
    const lines = [];   // [label, text]
    IDS.forEach(function (id) {
      const d = DD.getEnemy(id);
      Object.keys(d.barks).forEach(function (k) { d.barks[k].forEach(function (l) { lines.push([id + '.' + k, l, 'bark']); }); });
    });
    DD.League.BANTER.forEach(function (b, i) { b.forEach(function (l) { lines.push(['banter ' + i + ' ' + l[0], l[1], 'bark']); }); });
    lines.forEach(function (x) {
      t.ok(x[1].length <= 70, x[0] + ': a bubble line ≤ 70 (' + x[1].length + ') "' + x[1] + '"');
      t.ok(!/[A-Za-z]{23,}/.test(x[1]), x[0] + ': no stretched word over 22 letters in a bubble "' + x[1] + '"');
      t.ok(!/^[a-z][a-z0-9_]*$/.test(x[1]), x[0] + ': not mistaken for a bark key');
    });
    // texts a player reads: barks, banter, descs, passives, skills, statuses, objects, terrain, narration
    const texts = lines.slice();
    IDS.forEach(function (id) {
      const d = DD.getEnemy(id);
      texts.push([id + ' desc', d.desc]);
      texts.push([id + ' passive', d.passive.desc(null)]);
    });
    Object.keys(DD.League.SK).forEach(function (k) {
      const s = DD.getSkill(DD.League.SK[k]);
      texts.push([s.id + ' desc', DD.skillDesc(s, 1, null)]);
      texts.push([s.id + ' flavor', s.flavor]);
    });
    ['lg_meat_shield', 'lg_unreasonable'].forEach(function (id) { texts.push([id, DD.getStatus(id).desc({ stacks: 1, turns: -1, data: {} })]); });
    ['lg_body', 'lg_lever', 'lg_table'].forEach(function (id) { texts.push([id, DD.getObject(id).desc]); });
    ['lg_shark_tank', 'lg_podium'].forEach(function (id) { texts.push([id, DD.getTerrain(id).desc]); });
    ['league_tip', 'league_rollcall', 'league_song', 'league_trapdoor', 'league_death'].forEach(function (k) {
      const pool = DD.defs.narration[k] || [];
      t.ok(pool.length >= 2, k + ': 2+ lines');
      pool.forEach(function (l) { texts.push([k, l]); t.ok(l.length <= 160, k + ': narration ≤ 160'); });
    });
    texts.push(['encounter intro', DD.getEncounter(ENC).intro]);
    // the pronoun sweep (plan §8.4): a sentence naming exactly one League member uses only that member's pronouns
    const HE = /\b(he|him|his|himself)\b/i, SHE = /\b(she|her|hers|herself)\b/i;
    let swept = 0;
    texts.forEach(function (x) {
      sentences(x[1]).forEach(function (sent) {
        const who = IDS.filter(function (id) { return new RegExp('\\b' + NAMES[id] + '\\b').test(sent); });
        if (who.length !== 1) return;
        swept++;
        t.ok(!(who[0] === 'lg_skylla' ? HE : SHE).test(sent), x[0] + ': pronouns for ' + NAMES[who[0]] + ' in "' + sent + '"');
      });
    });
    t.ok(swept >= 20, 'the sweep saw ' + swept + ' sentences naming one member');
    const SCREEN = /\b(?:top|bottom)[- ](?:left|right)\b|\b(?:up|down) the screen\b|\btoward the (?:top|bottom)\b|\bscreen[- ](?:left|right)\b/i;
    texts.forEach(function (x) { t.ok(!SCREEN.test(x[1]), x[0] + ': no screen-direction words'); });
    // the running gag (the user's "important"): Zarak insists he is an orc; everyone else calls him the dwarf
    const zarak = DD.getEnemy('lg_zarak');
    const orcish = Object.keys(zarak.barks).reduce(function (n, k) { return n + zarak.barks[k].filter(function (l) { return /\borcs?\b/i.test(l); }).length; }, 0);
    t.ok(orcish >= 10, 'Zarak says "orc" in ' + orcish + ' lines');
    const dwarfed = lines.filter(function (x) { return x[0].indexOf('lg_zarak.') !== 0 && /\bdwarf\b/i.test(x[1]) && !/\bbanter \d+ lg_zarak/.test(x[0]); }).length;
    t.ok(dwarfed >= 5, 'the others call him the dwarf (' + dwarfed + ' lines)');
    t.ok(/dwarf/.test(zarak.desc) && /orc/.test(zarak.desc) && /Svammiel/.test(zarak.desc), 'his codex tells the gag');
    // named lines: a real hero (or Benedick, pending), named exactly; the Benedick line verbatim (addendum-benedick §19.3)
    // the user's heroes (DESIGN §2; Benedick, V3's 17th, may not have landed yet): the registry's name wins when loaded
    const ROSTER = { zarathor: 'Zarathor', syllamin: 'Syllamin', marbles: 'Professor Marbles', marwyn: 'Marwyn', ellaria: 'Ellaria', josiah: 'Josiah',
      sparrow: 'Sparrow', corelos: 'Corelos', slate: 'Slate', buga: 'Mayor Buga', kiri: 'Kiri', betty: 'Betty', basanos: 'Basanos', valdris: 'Valdris',
      hjalmar: 'Hjalmar', pebbles: 'Pebbles', benedick: 'Benedick', rasma: 'Rasma', biz: 'Biz', gus: 'Phat Gus' };
    IDS.forEach(function (id) {
      (DD.League.NAMED[id] || []).forEach(function (p) {
        const h = DD.getHero(p[0]);
        const nm = h ? h.name : ROSTER[p[0]];
        if (!t.ok(!!nm, id + ': named line for a real hero (' + p[0] + ')')) return;
        t.ok(p[1].indexOf(nm) >= 0, id + ': the named line names ' + nm + ' exactly: "' + p[1] + '"');
      });
    });
    t.ok(DD.League.NAMED.lg_zarak.some(function (p) { return p[0] === 'benedick' && p[1] === 'A snail! At least nobody calls YOU a dwarf, Benedick!'; }),
      'Zarak\'s Benedick line, verbatim');
    // the party filter with hero ids: without Benedick in the fight, his line never plays
    arena({ heroes: [{ id: 'test_mage', x: 1, y: 1 }], enemies: [{ id: 'lg_zarak', x: 5, y: 5 }] });
    let leaked = 0;
    for (let i = 0; i < 40; i++) if (DD.League.namedLine(unit('lg_zarak'))) leaked++;
    t.eq(leaked, 0, 'no named line without its hero in the fight');
    // mourning: every fallen member has mourners among the others; banter speakers are members
    IDS.forEach(function (fallen) {
      const k = 'mourn_' + NAMES[fallen].toLowerCase();
      const by = IDS.filter(function (id) { return id !== fallen && (DD.getEnemy(id).barks[k] || []).length > 0; });
      t.ok(by.length >= 3, NAMES[fallen] + ' falls: ' + by.length + ' members can mourn');
      t.ok(!(DD.getEnemy(fallen).barks[k]), NAMES[fallen] + ' does not mourn himself or herself');
    });
    DD.League.BANTER.forEach(function (b, i) { t.ok(b.length >= 2 && b.length <= 5 && b.every(function (l) { return IDS.indexOf(l[0]) >= 0; }), 'banter ' + i + ': 2-5 lines by members'); });
    DD.defs.narration.league_tip.forEach(function (l) { t.ok(/^DM \(whispering\): ".+"$/.test(l), 'the demoted DM whispers the tip: ' + l); });
    IDS.forEach(function (id) { ['spawn', 'attack', 'hurt', 'death', 'last', 'song', 'drowned'].forEach(function (k) { t.ok((DD.getEnemy(id).barks[k] || []).length >= 1, id + ': barks.' + k); }); });
  });

  // ---- robustness ------------------------------------------------------------------------------------------------
  T.suite('boss_league: robustness — each member alone, charmed and sheeped turns, previews leave no trace', function (t) {
    if (!ready(t)) return;
    IDS.forEach(function (id) {
      DD.Combat.sandbox({ w: 11, h: 11, seed: 9, cameo: false, objective: { type: 'custom' }, encounter: { id: 'lg_alone', checkObjective: function () { return null; } },
        heroes: PARTY.map(function (h, i) { return { id: h, x: 1 + (i % 2), y: 3 + i, level: 5 }; }), enemies: [{ id: id, x: 7, y: 5 }] });
      let used = 0;
      const e = unit(id);
      DD.Act.addRule({ id: 'test_lg_used', name: 'used', silent: true, hooks: { onSkillUsed: function (ctx) { if (ctx.user === e) used++; } } });
      for (let r = 0; r < 3 && !S().result; r++) act(function () { DD.Combat.endRound(); });
      DD.Act.removeRule('test_lg_used');
      t.ok(used > 0 || e.dead, id + ': alone in a bare sandbox, it acts (' + used + ' skills in 3 rounds)');
    });
    // charmed and sheeped members take their turns without trouble
    const s = startFight(8);
    s.aiOff = true;
    const h = s.units.filter(function (u) { return u.kind === 'hero'; })[0];
    IDS.forEach(function (id) {
      const u = unit(id);
      act(function () { DD.Act.addStatus(u, 'charmed', { turns: 1 }, h); });
      act(function () { DD.AI.act(u); });
      act(function () { DD.Act.removeStatus(u, 'charmed', { silent: true }); DD.Act.addStatus(u, 'sheep', { turns: 1 }, h); });
      act(function () { DD.AI.act(u); });
      act(function () { DD.Act.removeStatus(u, 'sheep', { silent: true }); });
    });
    t.ok(true, 'charmed / sheeped turns ran');
    // previews (dry runs) of hits on every member leave the fight untouched
    const s3 = startFight(9);
    s3.aiOff = true;
    const mage = s3.units.filter(function (u) { return u.kind === 'hero'; })[0];
    const look = function () {
      return JSON.stringify({ hp: s3.units.map(function (u) { return u.hp + ':' + u.dead; }), ld: s3.data.league.stats, hype: s3.data.league.hype,
        expended: s3.data.league.expended, objs: s3.grid.tiles.filter(function (x) { return x.obj; }).length });
    };
    const hp0 = {};
    IDS.forEach(function (id) { hp0[id] = unit(id).hp; });
    const snap = look();
    let previewed = 0;
    IDS.forEach(function (id) {
      const u = unit(id);
      const spot = DD.Grid.neighbors(u.x, u.y).filter(function (n) { return DD.Grid.isFree(n.x, n.y) && !DD.Grid.isDrop(n.x, n.y); })[0];
      if (!spot || !put(mage, spot.x, spot.y)) return;
      const q = DD.Targeting.validTargets(mage, mage.basic).filter(function (p) { return p.x === u.x && p.y === u.y; })[0];
      if (!q) return;
      u.hp = 1;
      act(function () { DD.Targeting.preview(mage, mage.basic, q); });
      u.hp = hp0[id];
      previewed++;
    });
    t.ok(previewed >= 3, previewed + ' lethal previews');
    const after = look().replace(/"hp":\[[^\]]*\]/, '');
    t.eq(after, snap.replace(/"hp":\[[^\]]*\]/, ''), 'previews of lethal hits change nothing (bodies, Hype, Expendable Friends)');
    t.ok(IDS.every(function (id) { return !!unit(id); }), 'and nobody died for real');
  });

  // ---- AutoPlay battles ------------------------------------------------------------------------------------------
  T.suite('boss_league: AutoPlay battles (fixture party; real=1: random real parties at L5 against the plan\'s band)', function (t) {
    if (!ready(t)) return;
    const real = t.param('real', '0') === '1';
    const pool = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    if (real && pool.length < 4) { t.skip('real=1 needs the hero files (isolate=league,heroes)'); return; }
    const n = Math.max(1, +(t.param('n', real ? 20 : 2)) || 1);
    const level = +(t.param('level', LV)) || LV;
    const rng = DD.RNG('lg-sims:' + t.seed);
    let wins = 0, rounds = 0, timeouts = 0, downs = 0;
    const eng = { bodies: 0, broken: 0, raised: 0, songs: 0, songLanded: 0, lever: 0, dropped: 0, fireballs: 0, expended: 0, drowned: 0, punted: 0, tunnels: 0 };
    const taken = {}, dealt = { heroes: 0, other: 0 }, byRound = [];   // damage to heroes by League skill; to the League
    // tuning probes (BAL): hpx=<HP factor>, knobs=key:value,… (DD.League.N), both restored afterwards
    const hpx = +(t.param('hpx', 1)) || 1, saved = {}, savedN = Object.assign({}, DD.League.N);
    IDS.forEach(function (id) { saved[id] = DD.getEnemy(id).hp; DD.getEnemy(id).hp = Math.round(saved[id] * hpx); });
    String(t.param('knobs', '')).split(',').filter(Boolean).forEach(function (kv) { const p = kv.split(':'); if (p[0] in DD.League.N) DD.League.N[p[0]] = +p[1]; });
    // lv=lg_missiles.dmg:3,… (a skill's level-1 number)
    const savedLv = [];
    String(t.param('lv', '')).split(',').filter(Boolean).forEach(function (kv) {
      const p = kv.split(':'), q = p[0].split('.'), def = DD.getSkill(q[0]);
      if (!def || !def.levels[0] || !(q[1] in def.levels[0])) return;
      savedLv.push([def, q[1], def.levels[0][q[1]]]);
      def.levels[0][q[1]] = +p[1];
    });
    try {
    for (let i = 0; i < n; i++) {
      const ids = real ? rng.sample(pool, 4) : PARTY;
      const s = bareRows(real, function () { return startFight('sim' + i, { real: true, level: level, ids: ids }); });
      DD.Act.addRule({ id: 'test_lg_diag', name: 'diag', silent: true, hooks: {
        onTakeDamage: function (d) {
          if (!d.target || DD.Act.simulating) return;
          if (d.target.kind === 'hero') { const k = d.skill ? d.skill.id : d.cause; taken[k] = (taken[k] || 0) + (d.dealt || 0); }
          else if ((d.target.tags || []).indexOf('league') >= 0) {
            if (d.source && d.source.side === 'hero') {
              dealt.heroes += d.dealt || 0;
              const r = Math.min(16, S().round);
              byRound[r] = (byRound[r] || 0) + (d.dealt || 0);
            } else dealt.other += d.dealt || 0;
          }
        },
        onHealed: function (u, amount) { if (!DD.Act.simulating && u && (u.tags || []).indexOf('league') >= 0) dealt.healed = (dealt.healed || 0) + (amount || 0); },
      } });
      const res = DD.AutoPlay.runBattle(40);
      rounds += res.rounds;
      if (res.result === 'victory') wins++;
      if (res.timeout) timeouts++;
      downs += s.stats.downs || 0;
      const st = DD.League.stats(s);
      Object.keys(eng).forEach(function (k) { eng[k] += st[k] || 0; });
      if (t.param('fights')) t.log('#' + i + ' ' + ids.join(',') + ': ' + res.result + ' in ' + res.rounds + ' rounds');
    }
    } finally {
      IDS.forEach(function (id) { DD.getEnemy(id).hp = saved[id]; });
      Object.assign(DD.League.N, savedN);
      savedLv.forEach(function (x) { x[0].levels[0][x[1]] = x[2]; });
    }
    if (hpx !== 1 || t.param('knobs') || t.param('lv')) t.log('probe: hpx ' + hpx + ', knobs ' + t.param('knobs', '-') + ', lv ' + t.param('lv', '-'));
    const pct = Math.round(100 * wins / n);
    t.log('League at L' + level + ' (' + (real ? 'random real parties' : 'fixture party') + '): won ' + wins + '/' + n + ' (' + pct + '%), avg rounds ' +
      (rounds / n).toFixed(1) + ', downs ' + (downs / n).toFixed(2) + ', timeouts ' + timeouts + ' · engagement ' + JSON.stringify(eng));
    const per = function (o) { const r = {}; Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).forEach(function (k) { r[k] = Math.round(o[k] / n); }); return JSON.stringify(r); };
    t.log('per fight: damage to heroes by source ' + per(taken) + ' · damage to the League ' + per(dealt) + ' (per round ' + Math.round(dealt.heroes / Math.max(1, rounds)) + ' from heroes)');
    t.log('hero damage to the League by round (per fight): ' + byRound.map(function (v, r) { return r + ':' + Math.round((v || 0) / n); }).filter(Boolean).join(' '));
    t.eq(timeouts, 0, 'no timeouts');
    if (!real) return;
    t.ok(eng.bodies > 0, 'members fall and leave bodies');
    t.ok(pct >= 45 && pct <= 90, 'author band (plan §7.2: 45-90%; target 63-74% at L5): ' + pct + '%');
    t.ok(eng.broken + eng.raised > 0, 'the body puzzle happens (broken ' + eng.broken + ', raised ' + eng.raised + ')');
  });
})();
