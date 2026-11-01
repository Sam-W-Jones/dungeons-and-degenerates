/* Dungeons and Degenerates — tests/content/enemies_act2.js
 * Suites "enemies_act2: …" for js/data/enemies/act2.js (v2: initiative turns, no telegraphs). Registry / data checks
 * (initiative modifiers, inspect-panel `passive` lines, no telegraph wording), every enemy skill used at once (damage
 * == desc, neutral difficulty), each gimmick on the enemy's own turn (DD.AI.act or the real turn flow: reassembling
 * interns, grab + Root, mimosas + hollandaise oil, chain zap + Lure from over a pit, charges from where the cub stands,
 * the banshee's cone, dive + Stone Form, swarm halving, Mama's ⏳ Stomp + Vendetta, Raise Dead + Detention walls,
 * lightning-healed Gary + coils), every enemy taking a sensible turn, durations per own turn, encounters under
 * initiative (waves, survive, protect, destroy), robustness, previews vs reality, encounter builds and AutoPlay sims
 * with the fixture party at the act 2 level band (L2-4; numbers logged with verbose=1, deeper runs with sims=<seeds per
 * level>), plus the regression suite of the AutoPlay core fix (walking around walls to a destroy-objective object).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  const ENEMIES = ['a2_skeleton_intern', 'a2_zombie_unpaid', 'a2_brunch_cultist', 'a2_hollandaise', 'a2_wisp', 'a2_owlbear_cub',
    'a2_banshee', 'a2_gargoyle', 'a2_pixie_swarm', 'a2_mama_owlbear', 'a2_necro_ta', 'a2_gary', 'a2_tesla_coil'];
  const SKILLS = ['a2_intern_papercut', 'a2_intern_coffee', 'a2_zombie_overtime', 'a2_zombie_grab', 'a2_cultist_mimosa', 'a2_cultist_latte', 'a2_cultist_summon',
    'a2_hollandaise_slap', 'a2_wisp_zap', 'a2_wisp_lure', 'a2_cub_charge', 'a2_cub_nibble', 'a2_banshee_scream', 'a2_banshee_review',
    'a2_gargoyle_dive', 'a2_gargoyle_stone', 'a2_pixie_glitter', 'a2_pixie_bite', 'a2_mama_maul', 'a2_mama_pounce', 'a2_mama_stomp',
    'a2_ta_redpen', 'a2_ta_raise', 'a2_ta_detention', 'a2_gary_clobber', 'a2_gary_throw', 'a2_coil_arc', 'a2_coil_overcharge'];
  const STATUSES = ['a2_stoneform', 'a2_vendetta'];
  const OBJECTS = ['a2_bone_pile', 'a2_bone_wall', 'a2_chafing_dish', 'a2_coffee_machine'];
  const NORMAL = ['a2_unpaid_internship', 'a2_bottomless_brunch', 'a2_cub_scouts', 'a2_follow_the_lights', 'a2_forbidden_buffet',
    'a2_last_coffee', 'a2_rooftop_critics', 'a2_graveyard_shift'];
  const ELITE = ['a2_mama_bear', 'a2_office_hours', 'a2_its_alive', 'a2_tenure_review'];
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  // v2: one hero levels up per won fight, so act 2 is fought around levels 2-4 (docs/notes/run-v2.md)
  const LEVELS = [2, 3, 4];
  const LV = 3;
  // initiative modifiers (DESIGN §8: quick pests high, lumbering brutes low, tier defaults otherwise)
  const INIT = { a2_skeleton_intern: 1, a2_zombie_unpaid: -2, a2_brunch_cultist: 0, a2_hollandaise: 1, a2_wisp: 3, a2_owlbear_cub: 2,
    a2_banshee: 1, a2_gargoyle: -1, a2_pixie_swarm: 4, a2_mama_owlbear: 1, a2_necro_ta: 0, a2_gary: -2, a2_tesla_coil: 2 };

  // ---- helpers ------------------------------------------------------------------------------------
  const QUIET = { objective: { type: 'custom', text: 'Testing' }, encounter: { id: 'a2_test_quiet', checkObjective: function () { return null; } } };
  /** A sandbox where AI units always pass (tests drive them with now() / turn()); heroes first, the first hero's turn. */
  function quiet(cfg) { return DD.Combat.sandbox(Object.assign({ w: 9, h: 9, seed: 7, enemyAi: false }, QUIET, cfg || {})); }
  /** A sandbox with live AI: enemies take their own initiative turns (heroes first, then the enemies). */
  function live(cfg) { return DD.Combat.sandbox(Object.assign({ w: 9, h: 9, seed: 7 }, QUIET, cfg || {})); }
  function H(x, y, id, extra) { return Object.assign({ id: id || 'test_mage', x: x, y: y, level: LV }, extra || {}); }
  function E(x, y, id) { return { id: id, x: x, y: y }; }
  function byDef(id) { return DD.Combat.state.units.filter(function (u) { return !u.dead && u.defId === id; }); }
  function heroOf(id) { return DD.Combat.state.units.filter(function (u) { return !u.dead && u.defId === id; })[0]; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function setT(x, y, t, h) { const tl = tile(x, y); tl.t = t; if (h !== undefined) tl.h = h; }
  function key(p) { return p.x + ',' + p.y; }
  function keys(list) { return list.map(key).sort().join(' '); }
  function act(fn) { return DD.Combat._action(fn); }
  /** An AI action right now (built and executed at once, as on the enemy's turn). Returns the action record. */
  function now(u, skillId, target, opts) { return act(function () { return DD.AI.useNow(u, skillId, target, opts || {}); }); }
  /** The unit's turn body (DD.AI.act) right now. */
  function turn(u) { return act(function () { return DD.AI.act(u); }); }
  function pos(u) { return u.x + ',' + u.y; }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (s) { return s.id === id; })[0]; }
  function sanity(t, label) { return T.contentHelpers && T.contentHelpers.sanity ? T.contentHelpers.sanity(t, label) : true; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function countRange(list) {
    let lo = 0, hi = 0;
    (list || []).forEach(function (e) {
      const n = e.n === undefined ? 1 : e.n;
      if (Array.isArray(n)) { lo += n[0]; hi += n[1]; } else { lo += n; hi += n; }
    });
    return [lo, hi];
  }
  /** Records every skill used (by def id: 'a2_x:skill') and every hit (with the skill that dealt it) in this fight. */
  function recorder() {
    const rec = { used: [], hits: [] };
    DD.Act.addRule({ id: 'a2_test_rec', name: 'Recorder', hooks: {
      onSkillUsed: function (ctx) { if (!DD.Act.simulating && ctx && ctx.user && ctx.skill) rec.used.push(ctx.user.defId + ':' + ctx.skill.id); },
      onTakeDamage: function (d) {
        if (!DD.Act.simulating) rec.hits.push({ target: d.target, src: d.source, skill: d.skill ? d.skill.id : null, dealt: d.dealt, cause: d.cause });
      },
    } });
    rec.usedBy = function (defId) { return rec.used.filter(function (s) { return s.indexOf(defId + ':') === 0; }).map(function (s) { return s.split(':')[1]; }); };
    rec.dealt = function (skillId, target) {
      return rec.hits.filter(function (h) { return h.skill === skillId && (!target || h.target === target); }).reduce(function (a, h) { return a + (h.dealt || 0); }, 0);
    };
    rec.clear = function () { rec.used.length = 0; rec.hits.length = 0; };
    return rec;
  }

  /**
   * Fixture run heroes at a v2 level: the 2 starting skills plus one boon per level gained (learn up to 2 more skills,
   * then upgrades, first skills first), like a party that levelled once per won fight.
   */
  function partyAt(level, ids) {
    return (ids || PARTY).map(function (id) {
      const h = DD.getHero(id);
      const boons = Math.max(0, level - 1);
      const learn = Math.min(2, boons);
      const list = h.startingSkills.concat(h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, learn));
      const skills = list.map(function (s) { return { id: s, level: 1 }; });
      for (let k = 0, up = boons - learn; up > 0 && k < 12; k++) {
        const sk = skills[k % skills.length];
        if (sk.level < 3) { sk.level++; up--; }
      }
      return DD.Combat.makeRunHero({ id: id, level: level, skills: skills });
    });
  }

  // =====================================================================================================
  T.suite('enemies_act2: registry, ids and data', function (t) {
    ENEMIES.forEach(function (id) { t.ok(!!DD.getEnemy(id), 'enemy ' + id + ' registered'); });
    SKILLS.forEach(function (id) { t.ok(!!DD.getSkill(id), 'skill ' + id + ' registered'); });
    STATUSES.forEach(function (id) { t.ok(!!DD.getStatus(id), 'status ' + id + ' registered'); });
    OBJECTS.forEach(function (id) { t.ok(!!DD.getObject(id), 'object ' + id + ' registered'); });
    NORMAL.concat(ELITE).forEach(function (id) { t.ok(!!DD.getEncounter(id), 'encounter ' + id + ' registered'); });
    // nothing else claims the a2_ prefix (and nothing of ours leaked out of it)
    const mine = { enemies: ENEMIES, skills: SKILLS, statuses: STATUSES, objects: OBJECTS, encounters: NORMAL.concat(ELITE) };
    Object.keys(mine).forEach(function (bag) {
      Object.keys(DD.defs[bag]).filter(function (id) { return id.indexOf('a2_') === 0; }).forEach(function (id) {
        t.ok(mine[bag].indexOf(id) >= 0, bag + ' ' + id + ' is one of ours');
      });
    });
    const HP = { minion: [10, 14], normal: [20, 30], elite: [80, 110] };
    const HIT = { minion: [4, 6], normal: [4, 8], elite: [10, 13] };
    const SCALE = { minion: [0.7, 0.9], normal: [0.85, 1.1], elite: [1.3, 1.6] };
    const looks = {};
    Object.keys(DD.defs.enemies).forEach(function (id) { if (ENEMIES.indexOf(id) < 0) looks[JSON.stringify(DD.getEnemy(id).sprite)] = id; });
    ENEMIES.forEach(function (id) {
      const e = DD.getEnemy(id);
      if (!e) return;
      t.eq(e.act, 2, id + ' act 2');
      t.ok(e.hp >= HP[e.tier][0] && e.hp <= HP[e.tier][1], id + ' HP ' + e.hp + ' within the act 2 ' + e.tier + ' band');
      t.ok(e.skills.length >= 1 && e.skills.length <= 3, id + ' has 1-3 skills');
      t.ok(typeof e.desc === 'string' && e.desc.length > 40, id + ' has a codex desc');
      t.ok(Array.isArray(e.gold), id + ' gold');
      const sp = T.contentHelpers ? T.contentHelpers.spriteProblems(e.sprite) : [];
      t.eq(sp.length, 0, id + ' sprite valid ' + sp.join(', '));
      const sc = e.sprite.scale || 1;
      t.ok(sc >= SCALE[e.tier][0] && sc <= SCALE[e.tier][1], id + ' sprite scale ' + sc + ' fits its tier');
      const look = JSON.stringify(e.sprite);
      t.ok(!looks[look], id + ' looks different from ' + looks[look]);
      looks[look] = id;
      ['spawn', 'attack', 'hurt', 'death'].forEach(function (k) {
        const b = e.barks[k] || [];
        t.ok(b.length >= 2 && b.length <= 4, id + ' barks.' + k + ' has 2-4 lines');
      });
      Object.keys(e.barks).forEach(function (k) { e.barks[k].forEach(function (line) { t.ok(line.length <= 70, id + ' bark ≤ 70 chars: ' + line); }); });
      let top = 0;
      e.skills.forEach(function (sid) {
        const s = DD.getSkill(sid);
        t.ok(s && s.owner === 'enemy' && s.ap === 0, sid + ' is an enemy skill (ap 0)');
        if (s) top = Math.max(top, DD.skillLevel(s, 1).dmg || 0);
      });
      if (top) t.ok(top >= HIT[e.tier][0] && top <= HIT[e.tier][1], id + ' hits for ' + top + ' (act 2 ' + e.tier + ' band)');
      // v2: an initiative modifier on every def, one turn a round, and an inspect-panel line saying what it does on its turn
      t.eq(e.init, INIT[id], id + ' initiative modifier ' + e.init);
      t.ok(!e.turnsPerRound || e.turnsPerRound === 1, id + ' takes one turn a round');
      const pv = e.passive;
      t.ok(pv && typeof pv.name === 'string' && pv.name.length >= 3 && pv.name.length <= 26 && typeof pv.desc === 'string', id + ' has a passive (name + desc) for the inspect panel');
      if (pv && typeof pv.desc === 'string') {
        t.ok(/\bturn\b/i.test(pv.desc) && pv.desc.length >= 40 && pv.desc.length <= 300, id + ' passive says what it does on its turn, briefly (' + pv.desc.length + ' chars)');
        t.ok(!pv.hooks, id + ' passive is text only (hooks live in def.hooks)');
      }
    });
    t.ok(INIT.a2_pixie_swarm >= 3 && INIT.a2_wisp >= 3, 'quick pests (pixies, wisps) roll high');
    t.ok(INIT.a2_zombie_unpaid < 0 && INIT.a2_gary < 0 && INIT.a2_gargoyle < 0, 'lumbering zombies, Gary and the gargoyles roll low');
    SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      if (!s) return;
      const L = DD.skillLevel(s, 1);
      const d = DD.skillDesc(s, 1, null);
      t.ok(d.length > 10 && !/undefined|NaN/.test(d), id + ' desc works without a user');
      if (L.dmg) t.ok(new RegExp('(^|\\D)' + L.dmg + '(\\D|$)').test(d), id + ' desc shows its damage ' + L.dmg);
      if (L.heal) t.ok(new RegExp('(^|\\D)' + L.heal + '(\\D|$)').test(d), id + ' desc shows its heal ' + L.heal);
      t.ok(['self', 'ground', 'unit'].indexOf(s.anchor) >= 0, id + ' anchor');
      t.ok(s.icon && s.name.length <= 24, id + ' icon + short name');
    });
    // v2: no telegraph wording anywhere; Mama's Stomp is the only announced wind-up
    const texts = [];
    SKILLS.forEach(function (id) { texts.push({ id: id, s: DD.skillDesc(DD.getSkill(id), 1, null) }); });
    ENEMIES.forEach(function (id) { const e = DD.getEnemy(id); texts.push({ id: id, s: e.desc }, { id: id + '.passive', s: e.passive ? e.passive.desc : '' }); });
    STATUSES.forEach(function (id) { texts.push({ id: id, s: DD.getStatus(id).desc({ id: id, stacks: 1, turns: 1, source: null, data: {} }) }); });
    OBJECTS.forEach(function (id) { texts.push({ id: id, s: DD.getObject(id).desc }); });
    const STOMP = ['a2_mama_stomp', 'a2_mama_owlbear', 'a2_mama_owlbear.passive'];
    texts.forEach(function (x) {
      t.ok(!/telegraph|planning|enemy phase|next round's/i.test(x.s), x.id + ' has no telegraph-era wording: ' + x.s);
      if (STOMP.indexOf(x.id) < 0) t.ok(!/⏳|wind-?up|winds up/i.test(x.s), x.id + ' mentions no wind-up (only Mama\'s Stomp is announced)');
    });
    t.ok(/⏳/.test(DD.skillDesc(DD.getSkill('a2_mama_stomp'), 1, null)) && /next turn/.test(DD.skillDesc(DD.getSkill('a2_mama_stomp'), 1, null)), 'the Stomp says it is a wind-up landing at the start of her next turn');
    // encounters
    NORMAL.concat(ELITE).forEach(function (id) {
      const en = DD.getEncounter(id);
      if (!en) return;
      t.eq(en.act, 2, id + ' act 2');
      t.eq(en.kind, ELITE.indexOf(id) >= 0 ? 'elite' : 'normal', id + ' kind');
      t.ok(['hauntwood', 'academy', 'graveyard'].indexOf(en.map.theme) >= 0, id + ' uses an act 2 theme');
      t.ok(typeof en.intro === 'string' && en.intro.length > 30 && en.name.length > 3, id + ' has a name and an intro');
      const r = countRange(en.enemies);
      if (en.kind === 'normal') t.ok(r[0] >= 4 && r[1] <= 6, id + ' fields 4-6 enemies (' + r.join('-') + ')');
      if (en.kind === 'elite') t.eq(en.reward && en.reward.itemRarity, 'rare', id + ' rewards a rare item');
      if (!en.map.layout) t.ok(en.map.w >= 9 && en.map.w <= 13 && en.map.h >= 9 && en.map.h <= 13, id + ' map size 9-13');
      else t.ok(en.map.layout.length >= 9 && en.map.layout.length <= 13 && en.map.layout[0].length >= 9 && en.map.layout[0].length <= 13, id + ' layout size 9-13');
      (en.enemies || []).concat.apply([], (en.reinforcements || []).map(function (w) { return w.enemies; })).forEach(function (e) {
        t.ok(!!DD.getEnemy(e.id) && DD.getEnemy(e.id).act === 2, id + ' uses act 2 enemy ' + e.id);
      });
    });
    const objectives = {};
    NORMAL.concat(ELITE).forEach(function (id) { objectives[DD.getEncounter(id).objective.type] = 1; });
    t.ok(objectives.killAll && objectives.survive && objectives.destroy && objectives.protect, 'killAll, survive, destroy and protect objectives all appear');
    t.eq(NORMAL.concat(ELITE).filter(function (id) { return !!DD.getEncounter(id).map.layout; }).length, 3, 'three handcrafted layouts');
    t.ok(DD.Act2 && typeof DD.Act2.chainTiles === 'function' && typeof DD.Act2.reassemble === 'function', 'DD.Act2 helpers exported');
  });

  // =====================================================================================================
  T.suite('enemies_act2: every attack deals its desc damage, at once', function (t) {
    function check(label, cfg, enemyId, skillId, target, expect) {
      quiet(cfg);
      const e = byDef(enemyId)[0];
      const hs = DD.Combat.heroes();
      const before = hs.map(function (h) { return h.hp; });
      const tgt = typeof target === 'function' ? target(e, hs) : target;
      const it = now(e, skillId, tgt);
      t.ok(it && it.resolved && !it.windup, label + ': used at once (no telegraph)');
      t.eq(e.intents.length, 0, label + ': nothing left pending');
      expect(e, hs, hs.map(function (h, i) { return before[i] - h.hp; }));
      sanity(t, label);
    }
    check('Paper Cut', { heroes: [H(5, 4)], enemies: [E(4, 4, 'a2_skeleton_intern')] }, 'a2_skeleton_intern', 'a2_intern_papercut', { x: 5, y: 4 },
      function (e, hs, d) { t.eq(d[0], 5, 'Paper Cut deals 5'); t.eq((DD.Act.getStatus(hs[0], 'bleed') || {}).stacks, 2, 'and Bleed 2'); });
    check('Coffee Run', { heroes: [H(4, 4)], enemies: [E(1, 4, 'a2_skeleton_intern')] }, 'a2_skeleton_intern', 'a2_intern_coffee', function (e, hs) { return hs[0]; },
      function (e, hs, d) { t.eq(d[0], 4, 'Coffee Run deals 4'); });
    check('Unpaid Overtime', { heroes: [H(5, 4)], enemies: [E(4, 4, 'a2_zombie_unpaid')] }, 'a2_zombie_unpaid', 'a2_zombie_overtime', { x: 5, y: 4 },
      function (e, hs, d) { t.eq(d[0], 7, 'Unpaid Overtime deals 7'); });
    check('Grabby Hands', { heroes: [H(5, 4)], enemies: [E(2, 4, 'a2_zombie_unpaid')] }, 'a2_zombie_unpaid', 'a2_zombie_grab', function (e, hs) { return hs[0]; },
      function (e, hs, d) {
        t.eq(d[0], 0, 'Grabby Hands deals no damage (v2: pull + Root only)');
        t.eq(pos(hs[0]), '3,4', 'and yanks the hero 2 tiles, next to the zombie');
        t.ok(has(hs[0], 'root') && DD.Act.getStatus(hs[0], 'root').turns === 1, 'and Roots it (1 turn)');
        t.eq(DD.Combat.reachable(hs[0]).size, 0, 'a Rooted hero cannot move');
      });
    check('Scalding Latte', { heroes: [H(4, 4)], enemies: [E(2, 4, 'a2_brunch_cultist')] }, 'a2_brunch_cultist', 'a2_cultist_latte', function (e, hs) { return hs[0]; },
      function (e, hs, d) { t.eq(d[0], 7, 'Scalding Latte deals 7 fire'); t.eq((DD.Act.getStatus(hs[0], 'burn') || {}).stacks, 2, 'and Burn 2'); });
    check('Sauce Slap', { heroes: [H(5, 4)], enemies: [E(4, 4, 'a2_hollandaise')] }, 'a2_hollandaise', 'a2_hollandaise_slap', { x: 5, y: 4 },
      function (e, hs, d) { t.eq(d[0], 5, 'Sauce Slap deals 5'); });
    check('Swamp Gas Zap', { heroes: [H(4, 4)], enemies: [E(1, 4, 'a2_wisp')] }, 'a2_wisp', 'a2_wisp_zap', function (e, hs) { return hs[0]; },
      function (e, hs, d) { t.eq(d[0], 6, 'Swamp Gas Zap deals 6 lightning to a lone target'); });
    check('Cub Charge', { heroes: [H(5, 4)], enemies: [E(1, 4, 'a2_owlbear_cub')] }, 'a2_owlbear_cub', 'a2_cub_charge', { x: 2, y: 4 },
      function (e, hs, d) {
        t.eq(d[0], 8, 'Cub Charge deals 8');
        t.eq(pos(e), '4,4', 'the cub charges up to the hero');
        t.eq(pos(hs[0]), '6,4', 'and bowls it over 1 tile');
      });
    check('Overexcited Nibble', { heroes: [H(5, 4)], enemies: [E(4, 4, 'a2_owlbear_cub')] }, 'a2_owlbear_cub', 'a2_cub_nibble', { x: 5, y: 4 },
      function (e, hs, d) { t.eq(d[0], 6, 'Nibble deals 6'); });
    check('Speak to the Manager', { heroes: [H(4, 4), H(5, 1, 'test_cleric'), H(5, 4, 'test_rogue')], enemies: [E(2, 4, 'a2_banshee')] }, 'a2_banshee', 'a2_banshee_scream', { x: 3, y: 4 },
      function (e, hs, d) {
        t.eq(d[0], 6, 'the scream deals 6 in the 2-tile cone');
        t.ok(has(hs[0], 'stun'), 'and Stuns');
        t.ok(d[1] === 0 && !has(hs[1], 'stun'), 'outside the cone: nothing');
        t.ok(d[2] === 0 && !has(hs[2], 'stun'), 'three tiles out (the old 3-tile cone): safe now');
      });
    check('One-Star Review', { heroes: [H(5, 4)], enemies: [E(2, 4, 'a2_banshee')] }, 'a2_banshee', 'a2_banshee_review', function (e, hs) { return hs[0]; },
      function (e, hs, d) { t.eq(d[0], 7, 'One-Star Review deals 7'); t.ok(has(hs[0], 'weak'), 'and Weakens'); });
    check('Gutter Dive', { heroes: [H(5, 4), H(4, 6, 'test_cleric')], enemies: [E(1, 4, 'a2_gargoyle')] }, 'a2_gargoyle', 'a2_gargoyle_dive', function (e, hs) { return hs[0]; },
      function (e, hs, d) {
        t.eq(d[0], 8, 'Gutter Dive deals 8 to its target');
        t.eq(d[1], 0, 'not next to the target: untouched');
        t.eq(pos(e), '4,4', 'the gargoyle lands on the closest tile next to it');
      });
    check('Glitter Bomb', { heroes: [H(4, 4), H(5, 4, 'test_rogue')], enemies: [E(1, 4, 'a2_pixie_swarm')] }, 'a2_pixie_swarm', 'a2_pixie_glitter', function (e, hs) { return hs[0]; },
      function (e, hs, d) {
        t.ok(d[0] === 5 && d[1] === 5, 'Glitter Bomb deals 5 to the target and the foe next to it');
        t.ok(has(hs[0], 'dazzled') && has(hs[1], 'dazzled'), 'and Dazzles them');
      });
    check('Tiny Bites', { heroes: [H(5, 4)], enemies: [E(4, 4, 'a2_pixie_swarm')] }, 'a2_pixie_swarm', 'a2_pixie_bite', { x: 5, y: 4 },
      function (e, hs, d) { t.eq(d[0], 5, 'Tiny Bites deals 5'); });
    check('Maul', { heroes: [H(4, 4), H(4, 5, 'test_cleric')], enemies: [E(3, 4, 'a2_mama_owlbear')] }, 'a2_mama_owlbear', 'a2_mama_maul', { x: 4, y: 4 },
      function (e, hs, d) { t.ok(d[0] === 12 && d[1] === 12, 'Maul deals 12 to each of the 3 tiles in front'); });
    check('Mama\'s Coming', { heroes: [H(5, 4)], enemies: [E(1, 4, 'a2_mama_owlbear')] }, 'a2_mama_owlbear', 'a2_mama_pounce', function (e, hs) { return hs[0]; },
      function (e, hs, d) {
        t.eq(d[0], 11, 'Mama\'s Coming deals 11');
        t.eq(pos(e), '4,4', 'Mama pounces onto the closest tile next to the hero');
        t.eq(pos(hs[0]), '7,4', 'and knocks the hero back 2');
      });
    check('Earth-Shaking Stomp', { heroes: [H(4, 6), H(6, 4, 'test_cleric'), H(4, 7, 'test_rogue')], enemies: [E(4, 4, 'a2_mama_owlbear'), E(5, 4, 'a2_owlbear_cub')] },
      'a2_mama_owlbear', 'a2_mama_stomp', function (e) { return e; },
      function (e, hs, d) {
        t.ok(d[0] === 13 && d[1] === 13, 'the Stomp deals 13 to every foe within 2');
        t.eq(d[2], 0, 'three tiles out: safe');
        const cub = byDef('a2_owlbear_cub')[0];
        t.eq(cub.hp, cub.maxHp, 'her cub is spared');
      });
    check('Red Pen of Doom', { heroes: [H(5, 4)], enemies: [E(1, 4, 'a2_necro_ta')] }, 'a2_necro_ta', 'a2_ta_redpen', function (e, hs) { return hs[0]; },
      function (e, hs, d) {
        t.eq(d[0], 11, 'Red Pen deals 11');
        t.ok(has(hs[0], 'vulnerable') && DD.Act.getStatus(hs[0], 'vulnerable').turns === 1, 'and leaves the hero Vulnerable (until the end of its next turn)');
      });
    check('Clobber', { heroes: [H(5, 4)], enemies: [E(4, 4, 'a2_gary')] }, 'a2_gary', 'a2_gary_clobber', { x: 5, y: 4 },
      function (e, hs, d) { t.eq(d[0], 13, 'Clobber deals 13'); t.eq(pos(hs[0]), '7,4', 'and knocks the hero back 2'); });
    check('Gary Throw', { heroes: [H(6, 4), H(6, 5, 'test_cleric')], enemies: [E(2, 4, 'a2_gary')] }, 'a2_gary', 'a2_gary_throw', { x: 6, y: 4 },
      function (e, hs, d) { t.ok(d[0] === 11 && d[1] === 11, 'Gary Throw deals 11 on and next to the target tile'); });
    check('Arc Discharge', { heroes: [H(6, 4)], enemies: [E(4, 4, 'a2_tesla_coil')] }, 'a2_tesla_coil', 'a2_coil_arc', function (e, hs) { return hs[0]; },
      function (e, hs, d) { t.eq(d[0], 5, 'Arc Discharge deals 5 lightning'); });
    // heals and summons
    quiet({ heroes: [H(8, 8)], enemies: [E(2, 4, 'a2_brunch_cultist'), E(3, 4, 'a2_zombie_unpaid')] });
    const cult = byDef('a2_brunch_cultist')[0], zom = byDef('a2_zombie_unpaid')[0];
    zom.hp -= 12;
    now(cult, 'a2_cultist_mimosa', zom);
    t.eq(zom.maxHp - zom.hp, 4, 'Bottomless Mimosa heals 8');
    now(cult, 'a2_cultist_summon', { x: 2, y: 6 });
    const sauce = byDef('a2_hollandaise')[0];
    t.ok(sauce && pos(sauce) === '2,6', 'Brunch Is Served puts a Hollandaise Horror on the chosen tile');
    t.ok(sauce && DD.Combat.joining().some(function (e) { return e.unitId === sauce.id; }), 'it rolled initiative on arrival (it acts from the next round)');
  });

  // =====================================================================================================
  T.suite('enemies_act2: Skeleton Interns reassemble unless finished properly', function (t) {
    const PILE = 'a2_bone_pile';
    // plain death -> pile -> back at half HP at the end of the NEXT round (one hero: one End Turn = one round)
    quiet({ heroes: [H(1, 1)], enemies: [E(6, 6, 'a2_skeleton_intern')] });
    act(function () { DD.Act.damage(heroOf('test_mage'), byDef('a2_skeleton_intern')[0], 50); });
    t.eq(byDef('a2_skeleton_intern').length, 0, 'the intern falls');
    t.ok(tile(6, 6).obj && tile(6, 6).obj.id === PILE, 'and leaves a Bone Pile');
    DD.Combat.endTurn();
    t.ok(tile(6, 6).obj && tile(6, 6).obj.id === PILE && byDef('a2_skeleton_intern').length === 0, 'still a pile after one round end');
    DD.Combat.endTurn();
    const back = byDef('a2_skeleton_intern')[0];
    t.ok(!!back && !tile(6, 6).obj, 'it reassembles at the end of the next round');
    const half = Math.round(DD.getEnemy('a2_skeleton_intern').hp * 0.5);
    t.ok(back && back.maxHp === half && back.hp <= half, 'at half HP (' + half + ')');
    t.ok(back && back.data.reassembled === 1, 'and remembers it came back');
    t.ok(back && DD.Combat.state.order.some(function (e) { return e.unitId === back.id; }), 'it rolled initiative and has a turn this round (v2)');
    // fire, holy and falls finish it
    [['fire', 'Cremated'], ['holy', 'Laid to rest']].forEach(function (c) {
      quiet({ heroes: [H(1, 1)], enemies: [E(6, 6, 'a2_skeleton_intern')] });
      act(function () { DD.Act.damage(heroOf('test_mage'), byDef('a2_skeleton_intern')[0], 50, { element: c[0] }); });
      t.ok(!tile(6, 6).obj, c[0] + ' damage finishes it properly (no pile)');
    });
    quiet({ heroes: [H(4, 4)], enemies: [E(5, 4, 'a2_skeleton_intern')], terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; } });
    act(function () { DD.Act.push(heroOf('test_mage'), byDef('a2_skeleton_intern')[0], { x: 1, y: 0 }, 1); });
    t.ok(byDef('a2_skeleton_intern').length === 0 && DD.Combat.state.grid.tiles.every(function (tl) { return !tl.obj; }), 'a YEETed intern leaves no pile');
    // a hero walking over the pile scatters it
    quiet({ heroes: [H(3, 4)], enemies: [E(5, 4, 'a2_skeleton_intern')] });
    act(function () { DD.Act.kill(byDef('a2_skeleton_intern')[0], heroOf('test_mage')); });
    t.ok(tile(5, 4).obj && tile(5, 4).obj.id === PILE, 'Act.kill leaves a pile too');
    t.ok(DD.getObject(PILE).autoplay(heroOf('test_mage')) > 0, 'AutoPlay is told the pile is worth stomping');
    t.ok(DD.Combat.move(heroOf('test_mage'), 6, 4), 'a hero walks over the pile');
    t.ok(!tile(5, 4).obj, 'Crunch: the pile is gone');
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.eq(byDef('a2_skeleton_intern').length, 0, 'and nothing comes back');
    // Smash
    quiet({ heroes: [H(4, 4)], enemies: [E(5, 4, 'a2_skeleton_intern')] });
    act(function () { DD.Act.kill(byDef('a2_skeleton_intern')[0], null); });
    const ix = DD.Combat.interactions(heroOf('test_mage')).filter(function (o) { return o.kind === 'smash'; })[0];
    t.ok(ix && ix.x === 5 && ix.y === 4, 'heroes can Smash an adjacent pile');
    t.ok(ix && DD.Combat.interact(heroOf('test_mage'), ix.x, ix.y) && !tile(5, 4).obj, 'one Smash scatters it');
    // something standing on the pile keeps it down
    quiet({ heroes: [H(1, 1)], enemies: [E(6, 6, 'a2_skeleton_intern')] });
    act(function () { DD.Act.kill(byDef('a2_skeleton_intern')[0], null); });
    const coil = act(function () { return DD.Act.spawn('a2_tesla_coil', 6, 6, { silent: true }); });
    t.ok(coil && pos(coil) === '6,6', 'an (immovable) coil stands on the pile');
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.ok(tile(6, 6).obj && byDef('a2_skeleton_intern').length === 0, 'an occupied pile cannot get up');
    act(function () { DD.Act.kill(coil, null); });
    DD.Combat.endTurn();
    t.eq(byDef('a2_skeleton_intern').length, 1, 'once the tile is free it stands up at the next round end');
    // a Necromancer TA makes it immediate
    quiet({ heroes: [H(1, 1)], enemies: [E(6, 6, 'a2_skeleton_intern'), E(8, 8, 'a2_necro_ta')] });
    act(function () { DD.Act.kill(byDef('a2_skeleton_intern')[0], null); });
    DD.Combat.endTurn();
    t.eq(byDef('a2_skeleton_intern').length, 1, 'with a Necromancer TA around, the pile stands up at the end of the same round');
    // the pile avoids clobbering other objects
    quiet({ heroes: [H(1, 1)], enemies: [E(6, 6, 'a2_skeleton_intern')], objects: [{ x: 6, y: 6, id: 'spikes' }] });
    act(function () { DD.Act.kill(byDef('a2_skeleton_intern')[0], null); });
    const piles = DD.Combat.state.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === PILE; });
    t.ok(tile(6, 6).obj && tile(6, 6).obj.id === 'spikes' && piles.length === 1 && DD.Grid.dist(piles[0], { x: 6, y: 6 }) === 1, 'on a trap, the pile lands next to it');
  });

  // =====================================================================================================
  T.suite('enemies_act2: brunch cult heals, serves Hollandaise, and the sauce burns', function (t) {
    quiet({ heroes: [H(1, 1)], enemies: [E(4, 4, 'a2_hollandaise')] });
    act(function () { DD.Act.damage(heroOf('test_mage'), byDef('a2_hollandaise')[0], 50); });
    const oil = [[4, 4], [3, 4], [5, 4], [4, 3], [4, 5]].filter(function (p) { const s = tile(p[0], p[1]).surface; return s && s.id === 'oil'; });
    t.eq(oil.length, 5, 'a dead Hollandaise Horror leaves an oil slick (radius 1)');
    act(function () { DD.Act.applyElement(4, 4, 'fire', heroOf('test_mage')); });
    t.ok([[3, 4], [5, 4], [4, 3]].every(function (p) { const s = tile(p[0], p[1]).surface; return s && s.id === 'fire'; }), 'and it goes up in flames');
    // its turn: a hurt friend gets a mimosa, at once
    quiet({ w: 10, h: 10, heroes: [H(1, 8)], enemies: [E(5, 2, 'a2_brunch_cultist'), E(6, 3, 'a2_zombie_unpaid')] });
    let rec = recorder();
    const z = byDef('a2_zombie_unpaid')[0], c = byDef('a2_brunch_cultist')[0];
    z.hp = 10;
    turn(c);
    t.ok(rec.usedBy('a2_brunch_cultist').join() === 'a2_cultist_mimosa' && z.hp === 18, 'on its turn the cultist pours its hurt friend a Bottomless Mimosa (+8)');
    t.eq(c.intents.length, 0, 'nothing telegraphed');
    // nobody hurt, nobody near -> it serves brunch (or throws a latte)
    quiet({ w: 11, h: 11, heroes: [H(1, 9)], enemies: [E(8, 1, 'a2_brunch_cultist')] });
    rec = recorder();
    turn(byDef('a2_brunch_cultist')[0]);
    const used = rec.usedBy('a2_brunch_cultist');
    t.ok(used.length === 1 && ['a2_cultist_summon', 'a2_cultist_latte'].indexOf(used[0]) >= 0, 'with nobody to heal it attacks or summons (' + used.join() + ')');
    if (used[0] === 'a2_cultist_summon') t.ok(DD.Combat.joining().some(function (e) { return e.unit && e.unit.defId === 'a2_hollandaise'; }), 'the Horror joins the order next round');
    sanity(t, 'cultist');
    // the Unholy Brunch Platter (a2_forbidden_buffet): heals enemies within 2 for 3 at round end, spills oil when broken
    quiet({ heroes: [H(1, 1)], enemies: [E(4, 6, 'a2_zombie_unpaid'), E(7, 7, 'a2_zombie_unpaid')], objects: [{ x: 4, y: 4, id: 'a2_chafing_dish' }] });
    const near = byDef('a2_zombie_unpaid')[0], far = byDef('a2_zombie_unpaid')[1];
    near.hp -= 10; far.hp -= 10;
    DD.Combat.endTurn();
    t.ok(near.maxHp - near.hp === 7 && far.maxHp - far.hp === 10, 'the platter feeds the enemy 2 tiles away (+3), not the one 6 away');
    act(function () { DD.Act.damageObject(heroOf('test_mage'), 4, 4, 10); });
    t.ok(!tile(4, 4).obj && [[4, 4], [3, 4], [5, 4], [4, 3], [4, 5]].every(function (p) { const s = tile(p[0], p[1]).surface; return s && s.id === 'oil'; }),
      'breaking it (10 HP) spills an oil slick, radius 1');
    // the Last Coffee Machine: enemy melee chews on it on its turn, and losing it loses the fight
    quiet({ heroes: [H(1, 1)], enemies: [E(4, 5, 'a2_zombie_unpaid')], objects: [{ x: 4, y: 4, id: 'a2_coffee_machine' }], objective: { type: 'protect', objId: 'a2_coffee_machine' } });
    const zm = byDef('a2_zombie_unpaid')[0];
    turn(zm);
    t.eq(tile(4, 4).obj.hp, 24 - 7, 'a zombie next to the machine bites it on its turn (Unpaid Overtime, 7)');
    act(function () { DD.Act.damageObject(zm, 4, 4, 50); });
    t.eq(DD.Combat.state.result, 'defeat', 'no coffee machine: defeat');
  });

  // =====================================================================================================
  T.suite('enemies_act2: wisps chain lightning, lure heroes from over pits and teleport', function (t) {
    quiet({ heroes: [H(4, 4), H(5, 5, 'test_cleric'), H(8, 8, 'test_rogue')], enemies: [E(0, 4, 'a2_wisp'), E(4, 6, 'a2_zombie_unpaid')] });
    const w = byDef('a2_wisp')[0], z = byDef('a2_zombie_unpaid')[0];
    const a = heroOf('test_mage'), b = heroOf('test_cleric'), c = heroOf('test_rogue');
    const ctx = DD.Targeting.buildCtx(w, slotOf(w, 'a2_wisp_zap'), { x: 4, y: 4 });
    t.eq(ctx.tiles.map(key).join(' '), '4,4 5,5 4,6', 'the chain: target, nearest within 2, then the next');
    const hp = [a.hp, b.hp, c.hp, z.hp];
    now(w, 'a2_wisp_zap', a);
    t.ok(hp[0] - a.hp === 6 && hp[1] - b.hp === 6 && hp[3] - z.hp === 6, 'every link takes 6, the zombie friend included');
    t.eq(hp[2] - c.hp, 0, 'far away: untouched');
    quiet({ heroes: [H(4, 4)], enemies: [E(1, 4, 'a2_wisp')] });
    act(function () { DD.Act.addStatus(heroOf('test_mage'), 'wet', { turns: 2 }); });
    const hp2 = heroOf('test_mage').hp;
    now(byDef('a2_wisp')[0], 'a2_wisp_zap', heroOf('test_mage'));
    t.eq(hp2 - heroOf('test_mage').hp, 9, 'Wet heroes take +50% (9)');
    // Lure over a pit
    quiet({ heroes: [H(3, 6)], enemies: [E(1, 1, 'a2_wisp')], terrain: function (tl) { if (tl.x === 3 && tl.y === 3) tl.t = 'pit'; } });
    const w2 = byDef('a2_wisp')[0], m = heroOf('test_mage');
    act(function () { DD.Act.teleport(w2, 3, 3); });
    t.eq(pos(w2), '3,3', 'the wisp hovers over the pit');
    const mhp = m.hp;
    now(w2, 'a2_wisp_lure', m);
    t.eq(pos(w2), '3,6', 'Lure swaps it with the hero');
    t.ok(!m.downed && mhp - m.hp === Math.ceil(m.maxHp * 0.25) && !DD.Grid.isPit(m.x, m.y), 'who falls into the pit (25% max HP) and climbs out');
    // immovable heroes ignore it
    quiet({ heroes: [H(3, 6)], enemies: [E(3, 3, 'a2_wisp')] });
    const w3 = byDef('a2_wisp')[0], m3 = heroOf('test_mage');
    m3.flags.immovable = true;
    now(w3, 'a2_wisp_lure', m3);
    t.ok(pos(w3) === '3,3' && pos(m3) === '3,6', 'immovable heroes do not follow the light');
    // its turn: hovering over a pit with Lure ready, a hero within 4 gets lured in (no blink first)
    quiet({ heroes: [H(3, 6)], enemies: [E(1, 1, 'a2_wisp')], terrain: function (tl) { if (tl.x === 3 && tl.y === 3) tl.t = 'pit'; } });
    let rec = recorder();
    const w4 = byDef('a2_wisp')[0], m4 = heroOf('test_mage'), h4 = m4.hp;
    act(function () { DD.Act.teleport(w4, 3, 3); });
    turn(w4);
    t.eq(rec.usedBy('a2_wisp').join(), 'a2_wisp_lure', 'over a pit with Lure ready, its turn is a Lure');
    t.ok(pos(w4) === '3,6' && h4 - m4.hp === Math.ceil(m4.maxHp * 0.25), 'the hero takes the plunge');
    // not over a pit: it blinks into zap range, preferring to hover over the pit (next turn's Lure is a threat you can see)
    quiet({ w: 11, h: 11, heroes: [H(2, 7)], enemies: [E(7, 4, 'a2_wisp')], terrain: function (tl) { if (tl.x === 5 && tl.y === 5) tl.t = 'pit'; } });
    rec = recorder();
    const w5 = byDef('a2_wisp')[0], m5 = heroOf('test_mage'), h5 = m5.hp;
    turn(w5);
    t.eq(rec.usedBy('a2_wisp').join(), 'a2_wisp_zap', 'not over a pit: it zaps');
    t.eq(h5 - m5.hp, 6, 'the zap lands at once (6)');
    t.eq(pos(w5), '5,5', 'from over the pit, blinking there (it never walks)');
    t.ok(DD.Grid.dist(w5, m5) <= 6 && DD.Grid.los(w5, m5), 'within zap range and sight');
    // no pit anywhere: it still blinks into range and zaps
    quiet({ w: 11, h: 11, heroes: [H(1, 9)], enemies: [E(9, 1, 'a2_wisp')] });
    rec = recorder();
    const w6 = byDef('a2_wisp')[0], h6 = heroOf('test_mage').hp;
    turn(w6);
    t.ok(rec.usedBy('a2_wisp').join() === 'a2_wisp_zap' ? heroOf('test_mage').hp < h6 : DD.Grid.dist(w6, heroOf('test_mage')) < 16, 'far away: it blinks closer (and zaps if it can)');
    t.eq(w6.intents.length, 0, 'nothing telegraphed');
    sanity(t, 'wisp');
  });

  // =====================================================================================================
  T.suite('enemies_act2: owlbear cubs charge from where they stand', function (t) {
    function line(cfg) {
      quiet(cfg);
      const cub = byDef('a2_owlbear_cub')[0];
      const ctx = DD.Targeting.buildCtx(cub, slotOf(cub, 'a2_cub_charge'), { x: cub.x + 1, y: cub.y });
      return keys(ctx.tiles);
    }
    t.eq(line({ heroes: [H(8, 8)], enemies: [E(1, 4, 'a2_owlbear_cub')], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'wall'; } }), '2,4', 'stops before a wall');
    t.eq(line({ heroes: [H(8, 8)], enemies: [E(1, 4, 'a2_owlbear_cub')], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'pit'; } }), '2,4', 'stops before a pit');
    t.eq(line({ heroes: [H(8, 8)], enemies: [E(1, 4, 'a2_owlbear_cub'), E(3, 4, 'a2_zombie_unpaid')] }), '2,4', 'stops before a friend');
    t.eq(line({ heroes: [H(4, 4)], enemies: [E(1, 4, 'a2_owlbear_cub')] }), '2,4 3,4 4,4', 'ends on the first foe');
    t.eq(line({ heroes: [H(8, 8)], enemies: [E(1, 4, 'a2_owlbear_cub')] }), '2,4 3,4 4,4 5,4', 'otherwise runs its full 4 tiles');
    // its turn: a hero in a straight line within 4 tiles gets charged at once
    quiet({ heroes: [H(5, 4)], enemies: [E(1, 4, 'a2_owlbear_cub')] });
    let rec = recorder();
    const cub = byDef('a2_owlbear_cub')[0], m = heroOf('test_mage');
    let hp = m.hp;
    turn(cub);
    t.eq(rec.usedBy('a2_owlbear_cub').join(), 'a2_cub_charge', 'a hero in its line: CHARGE');
    t.ok(hp - m.hp === 8 && pos(cub) === '4,4' && pos(m) === '6,4', '8 damage, the cub ends next to where the hero stood, the hero is bowled over');
    // off its lines but within a walk: it walks up and nibbles instead (no walk-then-charge)
    quiet({ heroes: [H(4, 3)], enemies: [E(1, 1, 'a2_owlbear_cub')] });
    rec = recorder();
    const cub2 = byDef('a2_owlbear_cub')[0], m2 = heroOf('test_mage');
    hp = m2.hp;
    turn(cub2);
    t.eq(rec.usedBy('a2_owlbear_cub').join(), 'a2_cub_nibble', 'off its lines: it walks up and nibbles');
    t.ok(hp - m2.hp === 6 && dist(cub2, m2) === 1, 'Overexcited Nibble: 6');
    // off its lines and too far to nibble: it only walks, even though it could line up a charge
    quiet({ w: 11, h: 11, heroes: [H(8, 6)], enemies: [E(1, 1, 'a2_owlbear_cub')] });
    rec = recorder();
    const cub3 = byDef('a2_owlbear_cub')[0], m3 = heroOf('test_mage');
    hp = m3.hp;
    turn(cub3);
    t.ok(rec.usedBy('a2_owlbear_cub').length === 0 && m3.hp === hp && dist(cub3, m3) < 12, 'out of reach and off its lines: it only closes in');
    // a Rooted cub doesn't charge
    quiet({ heroes: [H(5, 4)], enemies: [E(1, 4, 'a2_owlbear_cub')] });
    rec = recorder();
    const cub4 = byDef('a2_owlbear_cub')[0];
    act(function () { DD.Act.addStatus(cub4, 'root', { turns: 1 }, heroOf('test_mage')); });
    hp = heroOf('test_mage').hp;
    turn(cub4);
    t.ok(rec.usedBy('a2_owlbear_cub').indexOf('a2_cub_charge') < 0 && pos(cub4) === '1,4' && heroOf('test_mage').hp === hp, 'Rooted: no charge');
    sanity(t, 'charge');
  });

  // =====================================================================================================
  T.suite('enemies_act2: the banshee screams from where she floats (no wind-up)', function (t) {
    // heroes in her 2-tile cone: she screams at once, without moving
    quiet({ w: 10, h: 10, heroes: [H(3, 4), H(3, 5, 'test_cleric'), H(1, 1, 'test_rogue')], enemies: [E(5, 4, 'a2_banshee')] });
    let rec = recorder();
    const b = byDef('a2_banshee')[0];
    const hs = DD.Combat.heroes(), hp = hs.map(function (h) { return h.hp; });
    turn(b);
    t.eq(rec.usedBy('a2_banshee').join(), 'a2_banshee_scream', 'heroes in her cone: she screams');
    t.ok(pos(b) === '5,4' && b.intents.length === 0, 'from where she floats, at once (nothing pending)');
    t.ok(hp[0] - hs[0].hp === 6 && hp[1] - hs[1].hp === 6 && has(hs[0], 'stun') && has(hs[1], 'stun'), 'both heroes in the cone take 6 and are Stunned');
    t.ok(hp[2] === hs[2].hp && !has(hs[2], 'stun'), 'the far hero is fine');
    // nobody in her cone: she floats up to 2 tiles from a hero (her voice is ready) and leaves a One-Star Review
    quiet({ w: 11, h: 11, heroes: [H(1, 5)], enemies: [E(7, 5, 'a2_banshee')] });
    rec = recorder();
    const b2 = byDef('a2_banshee')[0], m2 = heroOf('test_mage'), hp2 = m2.hp;
    turn(b2);
    t.eq(rec.usedBy('a2_banshee').join(), 'a2_banshee_review', 'out of her cone: a One-Star Review');
    t.ok(hp2 - m2.hp === 7 && has(m2, 'weak'), '7 damage and Weak');
    t.eq(dist(b2, m2), 2, 'she ends 2 tiles away: next turn\'s scream is a threat you can read (and step away from)');
    // her voice on cooldown: she keeps 3 tiles away
    rec.clear();
    act(function () { DD.Act.teleport(m2, 1, 9); });
    slotOf(b2, 'a2_banshee_scream').cd = 3;
    turn(b2);
    t.ok(rec.usedBy('a2_banshee').join() === 'a2_banshee_review' && dist(b2, m2) === 3, 'scream cooling down: she reviews from 3 tiles');
    // Silenced: no scream (it is a spell), she reviews instead; Stunned: she loses the turn
    quiet({ w: 10, h: 10, heroes: [H(3, 4)], enemies: [E(5, 4, 'a2_banshee')] });
    rec = recorder();
    const b3 = byDef('a2_banshee')[0], m3 = heroOf('test_mage');
    act(function () { DD.Act.addStatus(b3, 'silenced', { turns: 1 }, m3); });
    turn(b3);
    t.ok(rec.usedBy('a2_banshee').join() === 'a2_banshee_review' && !has(m3, 'stun'), 'Silenced: no scream, just a review');
    quiet({ w: 10, h: 10, heroes: [H(3, 4)], enemies: [E(5, 4, 'a2_banshee')] });
    rec = recorder();
    const b4 = byDef('a2_banshee')[0], m4 = heroOf('test_mage'), hp4 = m4.hp;
    act(function () { DD.Act.addStatus(b4, 'stun', { turns: 1 }, m4); });
    t.eq(turn(b4), false, 'Stunned: she loses the turn');
    t.ok(rec.used.length === 0 && m4.hp === hp4, 'and nothing happens');
    sanity(t, 'banshee');
  });

  // =====================================================================================================
  T.suite('enemies_act2: gargoyles dive, then stay stone until the end of their next turn', function (t) {
    // the real turn flow: the mage, the cleric, then the gargoyle
    live({ w: 10, h: 10, heroes: [H(2, 4), H(1, 6, 'test_cleric')], enemies: [E(6, 4, 'a2_gargoyle')] });
    const rec = recorder();
    const g = byDef('a2_gargoyle')[0], m = heroOf('test_mage');
    DD.Combat.endRound();
    t.eq(rec.usedBy('a2_gargoyle').join(), 'a2_gargoyle_dive,a2_gargoyle_stone', 'its turn: a dive, then Stone Form');
    t.ok(rec.dealt('a2_gargoyle_dive') >= 8, 'the dive lands (8)');
    t.ok(has(g, 'a2_stoneform') && g.intents.length === 0, 'then it is stone, nothing telegraphed');
    t.ok(g.vis && g.vis.sprite && g.vis.sprite.a2Stone, 'and looks like one (pigeon included)');
    t.ok(DD.Combat.current() === m && DD.Combat.state.round === 2, 'round 2, the mage\'s turn');
    let before = g.hp;
    act(function () { DD.Act.damage(m, g, 20); });
    t.eq(before - g.hp, 4, 'stone takes 75% less damage (20 → 5, −1 armor)');
    rec.clear();
    DD.Combat.endRound();
    t.eq(rec.usedBy('a2_gargoyle').length, 0, 'its next turn: a statue does nothing');
    t.ok(!has(g, 'a2_stoneform'), 'and Stone Form ends with that turn');
    t.ok(!g.vis.sprite, 'flesh again, in step with the status');
    before = g.hp;
    act(function () { DD.Act.damage(m, g, 20); });
    t.eq(before - g.hp, 19, 'flesh takes full damage (−1 armor) on the heroes\' turns that follow');
    rec.clear();
    DD.Combat.endRound();
    t.ok(rec.usedBy('a2_gargoyle').indexOf('a2_gargoyle_dive') >= 0 || g.dead, 'and the turn after that it dives again');
    // a statue can be shoved into a pit
    quiet({ heroes: [H(3, 4)], enemies: [E(4, 4, 'a2_gargoyle')], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } });
    const g2 = byDef('a2_gargoyle')[0];
    act(function () { DD.Act.addStatus(g2, 'a2_stoneform', { turns: 1 }, g2); });
    act(function () { DD.Act.push(heroOf('test_mage'), g2, { x: 1, y: 0 }, 1); });
    t.ok(g2.dead, 'a stone gargoyle shoved into a pit is gone');
    // it dives from its perch: out of reach (6+ tiles), it only walks closer
    quiet({ w: 11, h: 11, heroes: [H(1, 5)], enemies: [E(8, 5, 'a2_gargoyle')] });
    let r2 = recorder();
    const g3 = byDef('a2_gargoyle')[0], m3 = heroOf('test_mage'), hp3 = m3.hp;
    turn(g3);
    t.ok(r2.used.length === 0 && m3.hp === hp3 && dist(g3, m3) < 7, '7 tiles away: no walk-then-dive, it closes in');
    // rooted gargoyles can't dive
    quiet({ heroes: [H(5, 4)], enemies: [E(1, 4, 'a2_gargoyle')] });
    r2 = recorder();
    const g4 = byDef('a2_gargoyle')[0], hp4 = heroOf('test_mage').hp;
    act(function () { DD.Act.addStatus(g4, 'root', { turns: 1 }, heroOf('test_mage')); });
    turn(g4);
    t.ok(pos(g4) === '1,4' && heroOf('test_mage').hp === hp4 && r2.used.length === 0, 'a Rooted gargoyle dives nowhere');
    // no free tile next to the target: no dive
    quiet({ heroes: [H(5, 5), H(4, 5, 'test_cleric'), H(6, 5, 'test_rogue'), H(5, 4, 'test_knight')], enemies: [E(5, 1, 'a2_gargoyle'), E(5, 6, 'a2_zombie_unpaid')] });
    const g5 = byDef('a2_gargoyle')[0], boxed = heroOf('test_mage');
    const hps = DD.Combat.heroes().map(function (h) { return h.hp; });
    now(g5, 'a2_gargoyle_dive', boxed);
    t.ok(pos(g5) === '5,1' && DD.Combat.heroes().every(function (h, i) { return h.hp === hps[i]; }), 'a boxed-in hero cannot be dived on: no landing, no damage');
    const ctx5 = DD.Targeting.buildCtx(g5, slotOf(g5, 'a2_gargoyle_dive'), { x: boxed.x, y: boxed.y });
    t.ok(DD.getSkill('a2_gargoyle_dive').aiScore(ctx5) < 0, 'and the AI scores that dive as a no-go');
    sanity(t, 'gargoyle');
  });

  // =====================================================================================================
  T.suite('enemies_act2: pixie swarms shrug off single-target hits; glitter dazzles', function (t) {
    quiet({ heroes: [H(1, 4)], enemies: [E(4, 4, 'a2_pixie_swarm')] });
    const p = byDef('a2_pixie_swarm')[0], m = heroOf('test_mage');
    const bolt = m.basic;
    const prev = DD.Combat.preview(m, bolt, p.x, p.y);
    let hp = p.hp;
    t.ok(DD.Combat.useSkill(m, bolt, p.x, p.y), 'the mage bolts the swarm on his turn');
    t.eq(hp - p.hp, 2, 'a single-target hit deals half (4 → 2)');
    t.eq(prev.perUnit[p.id] && prev.perUnit[p.id].dmg, 2, 'and the preview said so');
    const fb = slotOf(m, 'test_fireball');
    const prev2 = DD.Combat.preview(m, fb, p.x, p.y);
    hp = p.hp;
    t.ok(DD.Combat.useSkill(m, fb, p.x, p.y), 'then fireballs it');
    t.eq(hp - p.hp, 6, 'area damage hits in full (5 + 1 passive)');
    t.eq(prev2.perUnit[p.id] && prev2.perUnit[p.id].dmg, 6, 'preview agrees');
    // its turn: glitter from range at once; a Dazzled hero has 1 less range on its next turn
    quiet({ w: 10, h: 10, heroes: [H(2, 4), H(2, 5, 'test_rogue')], enemies: [E(7, 4, 'a2_pixie_swarm')] });
    const rec = recorder();
    const px = byDef('a2_pixie_swarm')[0], m2 = heroOf('test_mage'), r0 = DD.Targeting.range(m2, DD.getSkill(m2.basic.id), 1)[1];
    turn(px);
    t.eq(rec.usedBy('a2_pixie_swarm').join(), 'a2_pixie_glitter', 'on its turn: a Glitter Bomb');
    t.ok(has(m2, 'dazzled') && has(heroOf('test_rogue'), 'dazzled') && dist(px, m2) >= 2, 'both heroes glittered, from 2+ tiles away');
    t.eq(DD.Targeting.range(m2, DD.getSkill(m2.basic.id), 1)[1], r0 - 1, 'a Dazzled hero has 1 less range');
    t.ok(DD.Act2.singleTarget(DD.getSkill('test_bolt')) && !DD.Act2.singleTarget(DD.getSkill('test_fireball')), 'singleTarget helper');
  });

  // =====================================================================================================
  T.suite('enemies_act2: Mama Owlbear pounces from where she stands and winds up her Stomp (⏳)', function (t) {
    // the real turn flow: two heroes crowd her; on her turn she attacks and rears up for the Stomp
    live({ w: 10, h: 10, heroes: [H(4, 5), H(5, 4, 'test_cleric')], enemies: [E(4, 4, 'a2_mama_owlbear')] });
    let rec = recorder();
    const mama = byDef('a2_mama_owlbear')[0], mage = heroOf('test_mage'), cler = heroOf('test_cleric');
    mage.maxHp = mage.hp = cler.maxHp = cler.hp = 99;
    DD.Combat.endRound();
    const first = rec.usedBy('a2_mama_owlbear');
    t.ok(first.length === 1 && ['a2_mama_maul', 'a2_mama_pounce'].indexOf(first[0]) >= 0, 'her turn: one attack at once (' + first.join() + ')');
    const st = mama.intents[0];
    t.ok(mama.intents.length === 1 && st.windup && st.skillId === 'a2_mama_stomp' && st.turnsLeft === 1, 'two heroes within 2: she winds up the Stomp (⏳, her one announced attack)');
    const w = DD.AI.windups().filter(function (x) { return x.unit === mama; })[0];
    t.ok(w && w.dmg === 13 && w.tiles.length >= 12, 'the wind-up shows 13 on her radius-2 marked tiles');
    t.ok(/start of Mama Owlbear's next turn/.test(DD.AI.describe(mama, st).text), 'and says when it lands');
    // the mage gets clear, the cleric stays: it lands at the start of her next turn
    t.ok(DD.Combat.current() === mage, 'the heroes get their turns first');
    act(function () { DD.Act.teleport(mage, 4, 8); });
    rec.clear();
    const hm = mage.hp, hc = cler.hp;
    DD.Combat.endRound();
    t.eq(rec.dealt('a2_mama_stomp', cler), 13, 'the cleric, still within 2, takes the Stomp (13)');
    t.eq(rec.dealt('a2_mama_stomp', mage), 0, 'the mage got clear');
    t.ok(hc - cler.hp >= 13 && hm >= mage.hp, 'then she takes her normal turn');
    // a Stun interrupts it, and she loses that turn
    live({ w: 10, h: 10, heroes: [H(4, 5), H(5, 4, 'test_cleric')], enemies: [E(4, 4, 'a2_mama_owlbear')] });
    rec = recorder();
    const m2 = byDef('a2_mama_owlbear')[0];
    DD.Combat.heroes().forEach(function (h) { h.maxHp = h.hp = 99; });
    DD.Combat.endRound();
    t.eq(m2.intents.length, 1, 'wound up again');
    act(function () { DD.Act.addStatus(m2, 'stun', { turns: 1 }, heroOf('test_mage')); });
    t.eq(m2.intents.length, 0, 'a Stun interrupts the wind-up at once');
    rec.clear();
    DD.Combat.endRound();
    t.ok(rec.dealt('a2_mama_stomp') === 0 && rec.usedBy('a2_mama_owlbear').length === 0, 'no Stomp, and she loses the turn');
    // the pounce goes off from where she stands (no walk first): 5 tiles away yes, 8 tiles away she only closes in
    quiet({ w: 10, h: 10, heroes: [H(6, 4)], enemies: [E(1, 4, 'a2_mama_owlbear')] });
    rec = recorder();
    const mp = byDef('a2_mama_owlbear')[0], hp = heroOf('test_mage').hp;
    turn(mp);
    t.ok(rec.usedBy('a2_mama_owlbear').join() === 'a2_mama_pounce' && hp - heroOf('test_mage').hp === 11, 'a hero 5 tiles away: Mama\'s Coming (11) beats walking up for a Maul');
    t.eq(dist(mp, heroOf('test_mage')), 3, 'and the hero is knocked back 2');
    // two heroes in a Maul: she walks up and mauls instead
    quiet({ w: 10, h: 10, heroes: [H(6, 4), H(6, 5, 'test_cleric')], enemies: [E(2, 4, 'a2_mama_owlbear')] });
    rec = recorder();
    turn(byDef('a2_mama_owlbear')[0]);
    t.eq(rec.usedBy('a2_mama_owlbear').join(), 'a2_mama_maul', 'two heroes side by side: a Maul for both');
    quiet({ w: 11, h: 11, heroes: [H(9, 4)], enemies: [E(1, 4, 'a2_mama_owlbear')] });
    rec = recorder();
    const mf = byDef('a2_mama_owlbear')[0];
    turn(mf);
    t.ok(rec.used.length === 0 && dist(mf, heroOf('test_mage')) < 8, '8 tiles away: no walk-then-pounce, she closes in');
    // vendetta
    quiet({ w: 10, h: 10, heroes: [H(4, 4), H(4, 5, 'test_cleric')], enemies: [E(3, 4, 'a2_mama_owlbear'), E(7, 7, 'a2_owlbear_cub')] });
    const m3 = byDef('a2_mama_owlbear')[0], killer = heroOf('test_mage'), other = heroOf('test_cleric');
    act(function () { DD.Act.damage(killer, byDef('a2_owlbear_cub')[0], 99); });
    const v = DD.Act.getStatus(m3, 'a2_vendetta');
    t.ok(v && v.source === killer.id && v.turns === 2, 'killing a cub earns a Vendetta from Mama (her next 2 turns)');
    t.ok(/Wizzy McTest/.test(DD.getStatus('a2_vendetta').desc(v)), 'the status names the culprit');
    const hk = killer.hp, ho = other.hp;
    now(m3, 'a2_mama_maul', { x: 4, y: 4 });
    t.eq(hk - killer.hp, 18, 'the killer takes +50% (12 → 18)');
    t.eq(ho - other.hp, 12, 'everyone else the usual 12');
    const ws = DD.AI.windUp(m3, 'a2_mama_stomp', m3, { anchor: 'self', noCooldown: true });
    t.eq(DD.AI.describe(m3, ws).dmg, 20, 'the Stomp wind-up shows what the culprit in it will take (13 → 20)');
    act(function () { DD.Act.teleport(killer, 8, 8); });
    t.eq(DD.AI.describe(m3, ws).dmg, 13, 'culprit out of the red: it shows the base 13');
    m3.intents = [];
    const ctx = DD.Targeting.buildCtx(m3, slotOf(m3, 'a2_mama_maul'), { x: 4, y: 5 });
    act(function () { DD.Act.teleport(killer, 4, 4); });
    const ctx2 = DD.Targeting.buildCtx(m3, slotOf(m3, 'a2_mama_maul'), { x: 4, y: 4 });
    t.ok(DD.getSkill('a2_mama_maul').aiScore(ctx2) === 15 && DD.getSkill('a2_mama_maul').aiScore(ctx) >= 0, 'her AI prefers hitting the culprit');
    sanity(t, 'mama');
  });

  // =====================================================================================================
  T.suite('enemies_act2: Necromancer TA grades, raises the dead and hands out detention', function (t) {
    quiet({ heroes: [H(8, 8)], enemies: [E(4, 1, 'a2_necro_ta')] });
    const ta = byDef('a2_necro_ta')[0];
    act(function () { DD.Act.placeObject(7, 6, 'a2_bone_pile', { data: { timer: 2 } }); });
    const ctx = DD.Targeting.buildCtx(ta, slotOf(ta, 'a2_ta_raise'), { x: 4, y: 3 });
    t.eq(ctx.tiles.length, 2, 'Raise Dead picks 2 tiles');
    now(ta, 'a2_ta_raise', { x: 4, y: 3 });
    t.eq(byDef('a2_skeleton_intern').length, 3, '2 new interns + the pile stands back up');
    t.ok(!tile(7, 6).obj, 'the pile is used up');
    t.ok(byDef('a2_skeleton_intern').every(function (u) { return DD.Combat.joining().some(function (e) { return e.unitId === u.id; }); }), 'they roll initiative and act from the next round');
    // Detention
    quiet({ heroes: [H(5, 5), H(5, 6, 'test_cleric')], enemies: [E(1, 1, 'a2_necro_ta')], objects: [{ x: 6, y: 5, id: 'crate' }] });
    const ta2 = byDef('a2_necro_ta')[0], m = heroOf('test_mage');
    now(ta2, 'a2_ta_detention', m);
    const walls = [[5, 4], [4, 5]].filter(function (p) { return tile(p[0], p[1]).obj && tile(p[0], p[1]).obj.id === 'a2_bone_wall'; });
    t.eq(walls.length, 2, 'bone walls rise on the free tiles around the hero');
    t.ok(tile(6, 5).obj.id === 'crate' && !tile(5, 6).obj, 'occupied tiles keep what they had');
    const reach = DD.Combat.reachable(m);
    t.ok(!reach.has('5,4') && !reach.has('4,5'), 'walls block movement');
    t.ok(!DD.Grid.los(m, { x: 5, y: 1 }), 'and line of sight');
    const smash = DD.Combat.interactions(m).filter(function (o) { return o.kind === 'smash' && o.x === 5 && o.y === 4; })[0];
    t.ok(smash && DD.Combat.interact(m, 5, 4) && !tile(5, 4).obj, 'one Smash breaks a wall');
    DD.Combat.endRound();
    t.ok(tile(4, 5).obj && tile(4, 5).obj.id === 'a2_bone_wall', 'the other wall lasts through the next round');
    DD.Combat.endRound();
    t.ok(!tile(4, 5).obj || tile(4, 5).obj.id !== 'a2_bone_wall', 'then crumbles (rounds, not turns)');
    // his turn: the Red Pen, then Raise Dead when there are piles
    quiet({ w: 11, h: 11, heroes: [H(5, 8), H(2, 9, 'test_cleric')], enemies: [E(5, 2, 'a2_necro_ta')] });
    let rec = recorder();
    const ta3 = byDef('a2_necro_ta')[0];
    act(function () { DD.Act.placeObject(8, 2, 'a2_bone_pile', { data: { timer: 2 } }); });
    turn(ta3);
    t.eq(rec.usedBy('a2_necro_ta').join(), 'a2_ta_redpen,a2_ta_raise', 'with a pile on the map: Red Pen, then Raise Dead');
    t.ok(DD.Combat.heroes().some(function (h) { return has(h, 'vulnerable'); }), 'someone got graded (Vulnerable)');
    t.ok(byDef('a2_skeleton_intern').length === 3 && ta3.intents.length === 0, 'three interns at once, nothing telegraphed');
    // a hero close by gets Detention (after the Red Pen)
    quiet({ w: 11, h: 11, heroes: [H(5, 4), H(2, 9, 'test_cleric')], enemies: [E(5, 2, 'a2_necro_ta'), E(9, 1, 'a2_skeleton_intern'), E(9, 2, 'a2_skeleton_intern')] });
    rec = recorder();
    turn(byDef('a2_necro_ta')[0]);
    t.ok(rec.usedBy('a2_necro_ta').indexOf('a2_ta_detention') >= 0 && rec.usedBy('a2_necro_ta')[0] === 'a2_ta_redpen', 'a hero close by: Red Pen, then Detention');
    sanity(t, 'ta');
  });

  // =====================================================================================================
  T.suite('enemies_act2: Flesh Golem Gary loves lightning, throws coworkers, gets angry', function (t) {
    quiet({ heroes: [H(1, 4, 'test_mage', { skills: ['test_chain_zap'] })], enemies: [E(4, 4, 'a2_gary')] });
    const gary = byDef('a2_gary')[0], m = heroOf('test_mage');
    gary.hp = 60;
    const zap = slotOf(m, 'test_chain_zap');
    const prev = DD.Combat.preview(m, zap, gary.x, gary.y);
    t.ok(DD.Combat.useSkill(m, zap, gary.x, gary.y), 'the mage zaps Gary');
    t.eq(gary.hp, 66, 'lightning heals him instead (5 + 1 passive)');
    t.eq(prev.perUnit[gary.id] && prev.perUnit[gary.id].heal, 6, 'and the preview shows the heal');
    // throwing a coworker
    quiet({ heroes: [H(6, 4), H(6, 5, 'test_cleric')], enemies: [E(2, 4, 'a2_gary'), E(2, 5, 'a2_zombie_unpaid')] });
    const g2 = byDef('a2_gary')[0], z = byDef('a2_zombie_unpaid')[0];
    const hp = [heroOf('test_mage').hp, heroOf('test_cleric').hp];
    now(g2, 'a2_gary_throw', { x: 6, y: 4 });
    t.ok(hp[0] - heroOf('test_mage').hp === 11 && hp[1] - heroOf('test_cleric').hp === 11, 'Gary Throw deals 11 around the target tile');
    t.eq(pos(z), '6,3', 'the zombie lands on the first free tile of the area');
    t.eq(z.hp, z.maxHp, 'unhurt (and not consulted)');
    t.eq(DD.Act2.throwableAlly(g2), null, 'nobody left to throw');
    // GARY ANGRY (v2: Inspired for good, still one attack a turn)
    quiet({ heroes: [H(1, 1)], enemies: [E(6, 6, 'a2_gary')] });
    const g3 = byDef('a2_gary')[0];
    act(function () { DD.Act.damage(heroOf('test_mage'), g3, 40); });
    t.ok(!g3.data.angry, 'not angry yet');
    act(function () { DD.Act.damage(heroOf('test_mage'), g3, 20); });
    t.ok(g3.data.angry && has(g3, 'inspired') && DD.Act.getStatus(g3, 'inspired').turns === -1, 'below half HP: GARY ANGRY (Inspired for good)');
    // his turn: next to a hero he clobbers; from afar he throws; angry, still one attack
    quiet({ w: 10, h: 10, heroes: [H(6, 5), H(5, 8, 'test_cleric')], enemies: [E(5, 5, 'a2_gary'), E(4, 5, 'a2_zombie_unpaid')] });
    let rec = recorder();
    const g4 = byDef('a2_gary')[0];
    turn(g4);
    t.eq(rec.usedBy('a2_gary').join(), 'a2_gary_clobber', 'a hero next to him: Clobber');
    quiet({ w: 10, h: 10, heroes: [H(8, 5)], enemies: [E(2, 5, 'a2_gary'), E(1, 5, 'a2_zombie_unpaid')] });
    rec = recorder();
    const g5 = byDef('a2_gary')[0], z5 = byDef('a2_zombie_unpaid')[0], m5 = heroOf('test_mage'), h5 = m5.hp;
    turn(g5);
    t.eq(rec.usedBy('a2_gary').join(), 'a2_gary_throw', 'a hero 6 tiles away: Gary Throw');
    t.ok(h5 - m5.hp === 11 && dist(z5, m5) <= 1, 'the coworker flies (11) and lands next to the hero');
    quiet({ w: 10, h: 10, heroes: [H(6, 5), H(5, 8, 'test_cleric')], enemies: [E(5, 5, 'a2_gary'), E(4, 5, 'a2_zombie_unpaid')] });
    rec = recorder();
    const g6 = byDef('a2_gary')[0];
    g6.data.angry = true;
    act(function () { DD.Act.addStatus(g6, 'inspired', { turns: -1 }, g6); });
    const hm = heroOf('test_mage').hp;
    turn(g6);
    t.ok(rec.usedBy('a2_gary').length === 1 && hm - heroOf('test_mage').hp === 16, 'an angry Gary still attacks once a turn, Inspired (13 → 16)');
    // the coils keep him topped up
    quiet({ heroes: [H(8, 8)], enemies: [E(4, 4, 'a2_tesla_coil'), E(4, 6, 'a2_gary')] });
    const g7 = byDef('a2_gary')[0], coil = byDef('a2_tesla_coil')[0];
    g7.hp = 50;
    turn(coil);
    t.eq(g7.hp, 55, 'a coil arcs into Gary on its turn when he is the nearest: +5');
    sanity(t, 'gary');
  });

  // =====================================================================================================
  T.suite('enemies_act2: tesla coils arc at the nearest unit or overcharge', function (t) {
    quiet({ heroes: [H(4, 6)], enemies: [E(4, 4, 'a2_tesla_coil'), E(4, 1, 'a2_gary')] });
    const coil = byDef('a2_tesla_coil')[0];
    t.eq(DD.Act2.arcTarget(coil).defId, 'test_mage', 'the nearest unit wins (hero at 2 vs Gary at 3)');
    quiet({ heroes: [H(4, 6)], enemies: [E(4, 4, 'a2_tesla_coil'), E(2, 4, 'a2_gary')] });
    t.eq(DD.Act2.arcTarget(byDef('a2_tesla_coil')[0]).defId, 'a2_gary', 'ties go to Gary');
    quiet({ heroes: [H(4, 7)], enemies: [E(4, 4, 'a2_tesla_coil'), E(4, 5, 'a2_wisp'), E(5, 4, 'a2_tesla_coil')] });
    t.eq(DD.Act2.arcTarget(byDef('a2_tesla_coil')[0]).defId, 'test_mage', 'lightning-immune neighbours (a wisp, another coil) are skipped for the hero 3 tiles away');
    quiet({ heroes: [H(4, 6), H(5, 4, 'test_cleric')], enemies: [E(4, 4, 'a2_tesla_coil')] });
    const c2 = byDef('a2_tesla_coil')[0];
    act(function () { DD.Act.addStatus(c2, 'taunt', { turns: 1 }, heroOf('test_mage')); });
    t.eq(DD.Act2.arcTarget(c2).defId, 'test_mage', 'a taunted coil arcs at the taunter');
    const hc = heroOf('test_mage').hp;
    turn(c2);
    t.eq(hc - heroOf('test_mage').hp, 5, 'and does, on its turn');
    quiet({ heroes: [H(8, 8)], enemies: [E(1, 1, 'a2_tesla_coil')] });
    const rec = recorder();
    const c3 = byDef('a2_tesla_coil')[0];
    turn(c3);
    t.ok(rec.usedBy('a2_tesla_coil').join() === 'a2_coil_overcharge' && has(c3, 'empowered'), 'nobody in reach: it overcharges (Empowered)');
    act(function () { DD.Act.teleport(heroOf('test_mage'), 1, 3); });
    const hp = heroOf('test_mage').hp;
    turn(c3);
    t.eq(hp - heroOf('test_mage').hp, 8, 'its next arc deals 8 (5 +50%)');
    t.ok(!has(c3, 'empowered'), 'the charge is spent');
    t.eq(c3.mov, 0, 'coils never move');
    act(function () { DD.Act.push(heroOf('test_mage'), c3, { x: 1, y: 0 }, 2); });
    t.eq(pos(c3), '1,1', 'and cannot be pushed');
  });

  // =====================================================================================================
  T.suite('enemies_act2: every enemy takes a sensible turn (its gimmick, at once)', function (t) {
    const CASES = [
      { id: 'a2_skeleton_intern', cfg: { heroes: [H(5, 4)], enemies: [E(1, 4, 'a2_skeleton_intern')] }, skill: 'a2_intern_papercut',
        check: function (e, h, d) { return d === 5 && has(h, 'bleed') && dist(e, h) === 1; }, what: 'walks up and Paper Cuts (5 + Bleed)' },
      { id: 'a2_zombie_unpaid', cfg: { heroes: [H(7, 4)], enemies: [E(1, 4, 'a2_zombie_unpaid')] }, skill: 'a2_zombie_grab',
        check: function (e, h) { return has(h, 'root') && dist(e, h) === 1; }, what: 'walks into line and yanks the hero next to it, Rooted' },
      { id: 'a2_brunch_cultist', cfg: { heroes: [H(1, 8)], enemies: [E(5, 2, 'a2_brunch_cultist'), E(6, 3, 'a2_zombie_unpaid')] }, skill: 'a2_cultist_mimosa',
        setup: function () { byDef('a2_zombie_unpaid')[0].hp = 10; }, check: function () { return byDef('a2_zombie_unpaid')[0].hp === 18; }, what: 'pours a hurt friend a Mimosa' },
      { id: 'a2_hollandaise', cfg: { heroes: [H(5, 4)], enemies: [E(3, 4, 'a2_hollandaise')] }, skill: 'a2_hollandaise_slap',
        check: function (e, h, d) { return d === 5; }, what: 'oozes up and slaps (5)' },
      { id: 'a2_wisp', cfg: { heroes: [H(3, 6)], enemies: [E(1, 1, 'a2_wisp')], terrain: function (tl) { if (tl.x === 3 && tl.y === 3) tl.t = 'pit'; } }, skill: 'a2_wisp_lure',
        setup: function () { DD.Act.teleport(byDef('a2_wisp')[0], 3, 3); },   // units never spawn over a pit
        check: function (e, h, d) { return d === Math.ceil(h.maxHp * 0.25) && pos(e) === '3,6'; }, what: 'Lures the hero into the pit it hovers over' },
      { id: 'a2_owlbear_cub', cfg: { heroes: [H(5, 4)], enemies: [E(1, 4, 'a2_owlbear_cub')] }, skill: 'a2_cub_charge',
        check: function (e, h, d) { return d === 8; }, what: 'charges down its line (8)' },
      { id: 'a2_banshee', cfg: { heroes: [H(3, 4)], enemies: [E(5, 4, 'a2_banshee')] }, skill: 'a2_banshee_scream',
        check: function (e, h, d) { return d === 6 && has(h, 'stun'); }, what: 'screams at the hero in her cone (6 + Stun)' },
      { id: 'a2_gargoyle', cfg: { heroes: [H(5, 4)], enemies: [E(1, 4, 'a2_gargoyle')] }, skill: 'a2_gargoyle_dive', also: 'a2_gargoyle_stone',
        check: function (e, h, d) { return d === 8 && has(e, 'a2_stoneform'); }, what: 'dives (8), then turns to stone' },
      { id: 'a2_pixie_swarm', cfg: { heroes: [H(2, 4)], enemies: [E(6, 4, 'a2_pixie_swarm')] }, skill: 'a2_pixie_glitter',
        check: function (e, h, d) { return d === 5 && has(h, 'dazzled'); }, what: 'throws a Glitter Bomb (5 + Dazzle)' },
      { id: 'a2_mama_owlbear', cfg: { heroes: [H(4, 5, 'test_mage', { hp: 60 }), H(5, 4, 'test_cleric')], enemies: [E(4, 4, 'a2_mama_owlbear')] }, skill: null,
        check: function (e) { return e.intents.length === 1 && e.intents[0].windup && e.intents[0].skillId === 'a2_mama_stomp'; }, what: 'mauls or pounces, then winds up the Stomp' },
      { id: 'a2_necro_ta', cfg: { w: 11, h: 11, heroes: [H(5, 8)], enemies: [E(5, 2, 'a2_necro_ta')] }, skill: 'a2_ta_redpen', also: 'a2_ta_raise',
        check: function (e, h, d) { return d === 11 && has(h, 'vulnerable') && byDef('a2_skeleton_intern').length === 2; }, what: 'Red Pens (11 + Vulnerable), then raises 2 interns' },
      { id: 'a2_gary', cfg: { heroes: [H(5, 4)], enemies: [E(4, 4, 'a2_gary')] }, skill: 'a2_gary_clobber',
        check: function (e, h, d) { return d === 13 && dist(e, h) === 3; }, what: 'Clobbers (13) and knocks the hero back' },
      { id: 'a2_tesla_coil', cfg: { heroes: [H(4, 7)], enemies: [E(4, 4, 'a2_tesla_coil')] }, skill: 'a2_coil_arc',
        check: function (e, h, d) { return d === 5; }, what: 'arcs into the hero 3 tiles away (5)' },
    ];
    t.eq(CASES.map(function (c) { return c.id; }).sort().join(), ENEMIES.slice().sort().join(), 'a case for every act 2 enemy');
    CASES.forEach(function (c) {
      quiet(Object.assign({ w: 10, h: 10 }, c.cfg));
      const rec = recorder();
      if (c.setup) c.setup();
      const e = byDef(c.id)[0], h = DD.Combat.heroes()[0], hp = h.hp;
      const acted = turn(e);
      const used = rec.usedBy(c.id);
      t.ok(acted, c.id + ': takes its turn');
      if (c.skill) t.eq(used[0], c.skill, c.id + ' ' + c.what + ' (used ' + used.join() + ')');
      if (c.also) t.ok(used.indexOf(c.also) > 0, c.id + ' also uses ' + c.also);
      if (!c.skill) t.ok(used.length === 1 && ['a2_mama_maul', 'a2_mama_pounce'].indexOf(used[0]) >= 0, c.id + ': one attack (' + used.join() + ')');
      t.ok(c.check(e, h, hp - h.hp), c.id + ' ' + c.what);
      t.ok(c.id === 'a2_mama_owlbear' || e.intents.length === 0, c.id + ': nothing left pending (no telegraph)');
      t.ok(used.length <= 2, c.id + ': at most two skills in one turn (' + used.length + ')');
      sanity(t, c.id);
    });
  });

  // =====================================================================================================
  T.suite('enemies_act2: initiative and durations count their owner\'s own turns', function (t) {
    // a rolled fight: every act 2 enemy rolls d20 + its own modifier
    DD.Combat.sandbox(Object.assign({ w: 12, h: 12, seed: 21, initiative: 'roll', enemyAi: false, heroes: [H(1, 1)],
      enemies: ENEMIES.map(function (id, i) { return E(3 + (i % 8), 4 + Math.floor(i / 8) * 4, id); }) }, QUIET));
    const order = DD.Combat.order();
    ENEMIES.forEach(function (id) {
      const en = order.filter(function (e) { return e.unit && e.unit.defId === id; })[0];
      t.ok(en && en.init === INIT[id] && en.total === en.roll + en.init && en.roll >= 1 && en.roll <= 20, id + ' rolls d20 ' + (en ? en.roll : '?') + ' + ' + INIT[id]);
    });
    t.ok(order.every(function (e, i) { return i === 0 || order[i - 1].total >= e.total; }), 'the order is sorted by total');
    // a Root from the zombie's turn covers the hero's next turn, then it is gone
    live({ w: 11, h: 5, heroes: [H(8, 2)], enemies: [E(2, 2, 'a2_zombie_unpaid')] });
    const m = heroOf('test_mage'), z = byDef('a2_zombie_unpaid')[0];
    DD.Combat.endTurn();
    t.ok(has(m, 'root') && dist(m, z) === 1, 'the zombie\'s turn: grabbed and Rooted');
    t.ok(DD.Combat.current() === m && DD.Combat.reachable(m).size === 0, 'the hero\'s next turn: it cannot move');
    const hp = m.hp;
    DD.Combat.endTurn();
    t.eq(hp - m.hp, 7, 'the zombie\'s next turn: the bite (7)');
    t.ok(!has(m, 'root') && DD.Combat.reachable(m).size > 0, 'then the Root is gone: it moves again');
    // a Stun from the banshee's turn costs the hero exactly its next turn
    live({ w: 10, h: 10, heroes: [H(3, 4)], enemies: [E(5, 4, 'a2_banshee')] });
    const m2 = heroOf('test_mage'), n0 = DD.Combat.state.log.length;
    DD.Combat.endTurn();
    t.ok(DD.Combat.state.round === 3 && DD.Combat.current() === m2, 'stunned: its round-2 turn passed by itself; round 3 is the hero\'s again');
    t.ok(!has(m2, 'stun') && m2.ap === 3, 'and the Stun is gone, full AP');
    t.ok(DD.Combat.state.log.slice(n0).some(function (l) { return /Stun/.test(l.text); }), 'the log says so');
    // Dazzle: −1 range on the hero's next turn only
    live({ w: 10, h: 10, heroes: [H(2, 4)], enemies: [E(6, 4, 'a2_pixie_swarm')] });
    const m3 = heroOf('test_mage'), r0 = DD.Targeting.range(m3, DD.getSkill(m3.basic.id), 1)[1];
    DD.Combat.endTurn();
    t.ok(has(m3, 'dazzled') && DD.Targeting.range(m3, DD.getSkill(m3.basic.id), 1)[1] === r0 - 1, 'glittered on the pixies\' turn: −1 range on its next turn');
    DD.Combat.endTurn();
    t.ok(!has(m3, 'dazzled') || DD.Act.getStatus(m3, 'dazzled').fresh === undefined || DD.Combat.state.round === 3, 'and it wears off at the end of that turn (unless glittered again)');
    sanity(t, 'durations');
  });

  // =====================================================================================================
  T.suite('enemies_act2: encounters work under initiative (waves, survive, protect, destroy)', function (t) {
    function begin(id, seed) {
      const def = DD.getEncounter(id);
      const setup = DD.Encounter.build(def, partyAt(LV), { rng: DD.RNG('a2v2:' + id + ':' + seed), difficulty: 'normal', act: 2 });
      DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: def.kind });
      t.eq(DD.Combat.state.phase, 'deploy', id + ': opens in deployment');
      DD.Combat.rollInitiative();
      DD.Combat.heroes().forEach(function (h) { h.maxHp = h.hp = 999; });   // the party only watches
      return DD.Combat.state;
    }
    function rounds(s, n) { for (let i = 0; i < n && !s.result; i++) DD.Combat.endRound(); }
    // a round-2 wave arrives at the start of round 2 and acts that round
    let s = begin('a2_unpaid_internship', 5);
    const n1 = byDef('a2_skeleton_intern').length;
    rounds(s, 1);
    const fresh = byDef('a2_skeleton_intern').filter(function (u) { return !u.data.reassembled; });
    t.ok(s.round === 2 && fresh.length >= n1 + 2 - (2 - n1 >= 0 ? 0 : 0), 'unpaid internship: the round-2 wave arrived (' + n1 + ' → ' + fresh.length + ' interns)');
    t.ok(fresh.every(function (u) { return s.order.some(function (e) { return e.unitId === u.id; }); }), 'every intern has an initiative entry');
    // survive 5 rounds: waves at rounds 2, 3 and 4, victory at the end of round 5
    s = begin('a2_graveyard_shift', 9);
    const counts = [];
    for (let r = 0; r < 8 && !s.result; r++) { counts.push(DD.Combat.active('enemy').length); DD.Combat.endRound(); }
    t.ok(counts.length >= 4 && counts[1] > counts[0] && counts[2] > counts[1] && counts[3] > counts[2], 'graveyard shift: the waves arrive at rounds 2, 3 and 4 (' + counts.join(' → ') + ')');
    t.ok(s.result === 'victory' && s.round === 5, 'and holding out until the end of round 5 wins (' + s.result + ', round ' + s.round + ')');
    // protect: the coffee machine
    s = begin('a2_last_coffee', 3);
    t.eq(s.objective.type, 'protect', 'last coffee: a protect objective');
    const k = s.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'a2_coffee_machine'; })[0];
    act(function () { DD.Act.damageObject(null, k.x, k.y, 99); });
    t.eq(s.result, 'defeat', 'losing the machine loses the fight, whoever\'s turn it is');
    // destroy: the three platters
    s = begin('a2_forbidden_buffet', 4);
    const dishes = s.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'a2_chafing_dish'; });
    t.eq(dishes.length, 3, 'forbidden buffet: three platters');
    dishes.forEach(function (tl) { if (!s.result) act(function () { DD.Act.damageObject(DD.Combat.heroes()[0], tl.x, tl.y, 99); }); });
    t.eq(s.result, 'victory', 'breaking all three wins');
    // an elite wave (office hours, round 4) joins the order too
    s = begin('a2_office_hours', 6);
    rounds(s, 3);
    t.ok(s.round === 4 && s.units.some(function (u) { return !u.dead && u.defId === 'a2_skeleton_intern' && s.order.some(function (e) { return e.unitId === u.id; }); }), 'office hours: interns (old and late) all have turns by round 4');
    sanity(t, 'encounters');
  });

  // =====================================================================================================
  T.suite('enemies_act2: skills tolerate odd targets and odd users', function (t) {
    ENEMIES.forEach(function (id) {
      DD.getEnemy(id).skills.forEach(function (sid) {
        [null, 'self', 'edge', 'rooted', 'charmed', 'silenced', 'stunned', 'sheep', 'dead target'].forEach(function (mode) {
          quiet({ heroes: [H(4, 6), H(2, 4, 'test_cleric')], enemies: [E(4, 4, id), E(6, 4, 'a2_zombie_unpaid')] });
          const e = byDef(id)[0], m = heroOf('test_mage'), slot = slotOf(e, sid);
          let tgt = { x: 4, y: 2 };
          if (mode === 'self') tgt = { x: e.x, y: e.y };
          if (mode === 'edge') tgt = { x: 0, y: 0 };
          if (mode === 'rooted') act(function () { DD.Act.addStatus(e, 'root', { turns: 1 }, m); });
          if (mode === 'charmed') act(function () { DD.Act.addStatus(e, 'charmed', { turns: 1 }, m); });
          if (mode === 'silenced') act(function () { DD.Act.addStatus(e, 'silenced', { turns: 1 }, m); });
          if (mode === 'stunned') act(function () { DD.Act.addStatus(e, 'stun', { turns: 1 }, m); });
          if (mode === 'sheep' && !DD.Act.isBoss(e)) act(function () { DD.Act.addStatus(e, 'sheep', { turns: 1 }, m); });
          if (mode === 'dead target') { tgt = { x: m.x, y: m.y }; act(function () { DD.Act.kill(m, null); }); }
          if (mode === null || mode === 'rooted' || mode === 'charmed' || mode === 'silenced' || mode === 'stunned' || mode === 'sheep') tgt = DD.Targeting.validTargets(e, slot)[0] || tgt;
          t.tryRun(sid + ' ' + mode, function () {
            act(function () { DD.Combat.resolveSkill(e, slot, tgt, { extra: { isIntent: true } }); });
          });
          sanity(t, sid + ' ' + mode);
        });
      });
      // and the whole turn, under every odd status
      ['rooted', 'charmed', 'silenced', 'taunt', 'dazzled', 'confused', 'sheep', 'stunned'].forEach(function (mode) {
        quiet({ w: 10, h: 10, heroes: [H(4, 6), H(2, 4, 'test_cleric')], enemies: [E(4, 3, id), E(6, 4, 'a2_zombie_unpaid')], terrain: function (tl) { if (tl.x === 8 && tl.y === 8) tl.t = 'pit'; } });
        const e = byDef(id)[0], m = heroOf('test_mage');
        const sid = { rooted: 'root', stunned: 'stun' }[mode] || mode;
        if (!(mode === 'sheep' && DD.Act.isBoss(e))) act(function () { DD.Act.addStatus(e, sid, { turns: 1 }, m); });
        t.tryRun(id + ' turn while ' + mode, function () { turn(e); });
        t.ok(!e.intents.length || e.intents.every(function (i) { return i.windup; }), id + ' ' + mode + ': only wind-ups are ever stored');
        sanity(t, id + ' turn while ' + mode);
      });
    });
    t.ok(true, 'no throws');
  });

  // =====================================================================================================
  T.suite('enemies_act2: enemy skill previews leave no trace and match reality', function (t) {
    const fp = T.contentHelpers && T.contentHelpers.fingerprint;
    let checked = 0, hits = 0;
    ENEMIES.forEach(function (id) {
      DD.getEnemy(id).skills.forEach(function (sid) {
        const setup = function () {
          quiet({ seed: 11, heroes: [H(4, 4), H(5, 5, 'test_cleric'), H(2, 3, 'test_rogue')], enemies: [E(4, 3, id), E(6, 3, 'a2_zombie_unpaid')] });
          const e = byDef(id)[0];
          if (sid === 'a2_cultist_mimosa') byDef('a2_zombie_unpaid')[0].hp -= 9;
          return e;
        };
        let e = setup();
        // the target whose area holds the most other units (so the comparison means something)
        const tg = DD.Targeting.validTargets(e, slotOf(e, sid)).map(function (p) {
          const ctx = DD.Targeting.pure(function () { return DD.Targeting.buildCtx(e, slotOf(e, sid), p); });
          return { p: p, n: ctx ? ctx.units.filter(function (u) { return u !== e; }).length : 0 };
        }).sort(function (a, b) { return b.n - a.n; }).map(function (q) { return q.p; })[0];
        if (!tg) { t.log(sid + ': no target from the test spot'); return; }
        const ids = DD.Combat.state.units.map(function (u) { return u.id; });
        const before = fp ? fp(DD.Combat.state) : '';
        const prev = t.tryRun('preview ' + sid, function () { return DD.Targeting.preview(e, slotOf(e, sid), tg); });
        if (fp) t.eq(fp(DD.Combat.state), before, sid + ': the preview changed nothing');
        e = setup();   // same sandbox again: units come back in the same order (fresh ids)
        const hp = DD.Combat.state.units.map(function (u) { return u.hp; });
        act(function () { DD.Combat.resolveSkill(e, slotOf(e, sid), tg, { pay: true }); });
        DD.Combat.state.units.forEach(function (u, i) {
          if (i >= hp.length) return;
          const p = prev && prev.perUnit[ids[i]];
          const real = hp[i] - u.hp, said = p ? (p.dmg || 0) - (p.heal || 0) : 0;
          if (real) hits++;
          t.eq(real, said, sid + ': preview of ' + u.name + ' matches (' + real + ')');
        });
        checked++;
      });
    });
    t.ok(checked >= 25 && hits >= 20, 'previewed ' + checked + ' enemy skills (' + hits + ' units changed HP)');
  });

  // =====================================================================================================
  T.suite('enemies_act2: encounters build on 6 seeds with valid maps', function (t) {
    const party = partyAt(LV);
    NORMAL.concat(ELITE).forEach(function (id) {
      const def = DD.getEncounter(id);
      const range = countRange(def.enemies);
      const layout = !!def.map.layout;
      ['normal', 'brutal'].forEach(function (diff) {
        for (let k = 0; k < 6; k++) {
          const setup = DD.Encounter.build(def, party, { rng: DD.RNG('a2build:' + id + ':' + diff + ':' + k + ':' + t.seed), difficulty: diff, act: 2 });
          const label = id + ' (' + diff + ' #' + k + ')';
          const v = DD.MapGen.validate({ grid: setup.grid, heroZone: setup.heroZone, enemyZone: setup.enemyZone }, { layout: layout });
          t.ok(v.ok, label + ': valid map ' + v.problems.slice(0, 2).join(' | '));
          t.eq(setup.objective.type, def.objective.type, label + ': objective survives the build');
          t.eq(setup.heroes.length, 4, label + ': 4 heroes placed');
          const extra = diff === 'brutal' && def.kind === 'normal' ? 1 : 0;
          t.ok(setup.enemies.length >= range[0] + extra && setup.enemies.length <= range[1] + extra, label + ': enemy count ' + setup.enemies.length);
          setup.enemies.forEach(function (e) {
            const tl = setup.grid.tiles[e.y * setup.grid.w + e.x];
            t.ok(DD.MapGen.isSafeTile(tl), label + ': ' + e.id + ' starts on a safe tile');
          });
          if (def.objective.type === 'destroy') t.eq(setup.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === def.objective.objId; }).length, 3, label + ': 3 brunch platters');
          if (def.objective.type === 'protect') t.eq(setup.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === def.objective.objId; }).length, 1, label + ': one coffee machine');
          if (k === 0 && diff === 'normal') {
            DD.Combat.start(setup, { seed: 9, headless: true, difficulty: 'normal', kind: def.kind });
            const s = DD.Combat.state;
            t.ok(s.units.every(function (u) { return u.dead || DD.Grid.isWalkable(u.x, u.y, u); }), label + ': everyone stands on walkable tiles');
            t.ok(s.objective.text.length > 8, label + ': objective text "' + s.objective.text + '"');
            if (id === 'a2_its_alive') t.eq(byDef('a2_tesla_coil').length, 2, 'Gary\'s lab has its 2 coils');
            if (id === 'a2_office_hours') { const e0 = setup.enemies.filter(function (e) { return e.id === 'a2_necro_ta'; })[0]; t.ok(e0 && setup.grid.tiles[e0.y * setup.grid.w + e0.x].h === 2, 'the TA starts on the stage (h2)'); }
          }
        }
      });
    });
  });

  // =====================================================================================================
  // Regression for the core fix in js/engine/autoplay.js (walkApproach, docs/notes/enemies-act2.md "Core fixes"): with a
  // destroy objective left, AutoPlay used to walk by straight-line distance, stall behind a wall (or pace in and out of a
  // dead-end pocket) and idle until the 30-round timeout (seen in a2_forbidden_buffet with real heroes).
  T.suite('enemies_act2: AutoPlay walks around walls to a destroy target (core fix)', function (t) {
    function fight(wall, platter, hero) {
      DD.Combat.sandbox({ w: 9, h: 7, seed: 3, objective: { type: 'destroy', objId: 'a2_chafing_dish', count: 1 },
        heroes: [H(hero.x, hero.y)], enemies: [], objects: [{ x: platter.x, y: platter.y, id: 'a2_chafing_dish' }],
        terrain: function (tl) { if (wall(tl.x, tl.y)) tl.t = 'wall'; } });
      return DD.AutoPlay.runBattle(14);
    }
    // a straight wall: no tile within reach is closer as the crow flies
    let r = fight(function (x, y) { return y === 3 && x >= 1 && x <= 7; }, { x: 4, y: 1 }, { x: 4, y: 5 });
    t.ok(r.result === 'victory' && r.rounds <= 6, 'around a straight wall to the platter (' + JSON.stringify(r) + ')');
    // a dead-end pocket that is closer as the crow flies, with the only way round at the far end
    r = fight(function (x, y) { return y === 3 && x <= 6; }, { x: 1, y: 5 }, { x: 4, y: 1 });
    t.ok(r.result === 'victory' && r.rounds <= 8, 'past a dead-end pocket to the platter (' + JSON.stringify(r) + ')');
  });

  // =====================================================================================================
  // AutoPlay sims: the fixture party vs each encounter at the act 2 level band (logged; deeper with sims=<seeds per level>)
  /** Real heroes (when loaded) for heroes=real runs: 4 of them, picked by a seeded RNG. */
  function realParty(seed) {
    const ids = Object.keys(DD.defs.heroes).filter(function (k) { return k.indexOf('test_') !== 0; }).sort();
    return ids.length >= 4 ? DD.RNG('a2party:' + seed).sample(ids, 4) : null;
  }
  function sim(encId, level, seed, heroIds) {
    const def = DD.getEncounter(encId);
    const setup = DD.Encounter.build(def, partyAt(level, heroIds), { rng: DD.RNG('a2sim:' + encId + ':' + level + ':' + seed), difficulty: 'normal', act: 2 });
    DD.Combat.start(setup, { seed: 1000 + seed * 31 + level, headless: true, difficulty: 'normal', kind: def.kind });
    const s = DD.Combat.state;
    const maxHp = DD.Combat.heroes().reduce(function (a, h) { return a + h.maxHp; }, 0);
    // protect fights: how much of the protected object the enemies chewed through
    const ob = s.objective, prot = ob && ob.type === 'protect' && ob.objId ? ob.objId : null;
    const protHp = function () { let hp = 0; s.grid.tiles.forEach(function (tl) { if (tl.obj && tl.obj.id === prot) hp += tl.obj.hp; }); return hp; };
    const prot0 = prot ? protHp() : 0;
    const res = DD.AutoPlay.runBattle(30);
    let taken = 0;
    s.units.forEach(function (u) { if (u.kind === 'hero') taken += (s.stats.units[u.id] || {}).taken || 0; });
    return { win: res.result === 'victory', rounds: res.rounds, timeout: !!res.timeout, taken: taken / maxHp, downs: s.stats.downs || 0,
      objLost: prot0 ? (prot0 - protHp()) / prot0 : 0, rolled: !!s.order };
  }
  function simSuite(name, ids) {
    T.suite('enemies_act2: autoplay sims (' + name + ')', function (t) {
      const per = Math.max(1, +t.param('sims', 1) || 1);
      ids.forEach(function (id) {
        const elite = ELITE.indexOf(id) >= 0;
        let wins = 0, n = 0, rounds = 0, taken = 0, downs = 0, timeouts = 0, objLost = 0, rolled = 0;
        const byLevel = [];
        LEVELS.forEach(function (lv) {
          let w = 0;
          for (let k = 0; k < per; k++) {
            const r = sim(id, lv, Number(String(t.seed).replace(/\D/g, '') || 1) % 97 + k * 13 + lv);
            n++; rounds += r.rounds; taken += r.taken; downs += r.downs; objLost += r.objLost;
            if (r.win) { wins++; w++; }
            if (r.timeout) timeouts++;
            if (r.rolled) rolled++;
            sanity(t, id + ' L' + lv);
          }
          byLevel.push('L' + lv + ' ' + w + '/' + per);
        });
        const protect = DD.getEncounter(id).objective.type === 'protect';
        t.log(id + ' (' + (elite ? 'elite' : 'normal') + '): won ' + wins + '/' + n + ' [' + byLevel.join(', ') + '], avg rounds ' + (rounds / n).toFixed(1) +
          ', HP lost ' + Math.round(100 * taken / n) + '% of party max, downs/fight ' + (downs / n).toFixed(1) +
          (protect ? ', protected object lost ' + Math.round(100 * objLost / n) + '% of its HP' : ''));
        t.eq(rolled, n, id + ': every fight rolled initiative');
        t.eq(timeouts, 0, id + ': no timeouts');
        t.ok(rounds / n >= 2, id + ': fights last more than a round or two (' + (rounds / n).toFixed(1) + ')');
      });
    });
  }
  /** The current board as text: units (H hero, E enemy), objects (O objective, # blocking, o other), ~ liquid, _ drop, X blocked; heights on the right. */
  function boardLog(t) {
    const s = DD.Combat.state, ob = s.objective || {};
    for (let y = 0; y < s.grid.h; y++) {
      let row = '', hs = '';
      for (let x = 0; x < s.grid.w; x++) {
        const tl = DD.Grid.tile(x, y), u = DD.Grid.unitAt(x, y);
        let c = '.';
        if (u) c = u.side === 'hero' ? 'H' : 'E';
        else if (tl.obj) c = tl.obj.id === ob.objId ? 'O' : DD.Grid.objBlocksMove(tl.obj) ? '#' : 'o';
        else if (DD.Grid.isDrop(x, y)) c = '_';
        else if (!DD.Grid.isWalkable(x, y)) c = 'X';
        else if (DD.Grid.terrain(tl).liquid) c = '~';
        row += c;
        hs += tl.h;
      }
      t.log('map ' + (y < 10 ? ' ' : '') + y + '  ' + row + '   ' + hs);
    }
  }
  /**
   * Debug helper (skipped unless battle=<encounter id>): AutoPlay battles at lv=<level(s)> and s=<seed(s)> (comma lists,
   * paired up): one battle prints its log (one line per round) and the final board; several print a line each, plus the
   * last rounds and the board of every timeout.
   */
  T.suite('enemies_act2: debug battle log', function (t) {
    const id = t.param('battle', '');
    if (!id || !DD.getEncounter(id)) { t.skip('pass battle=<encounter id>&lv=<level(s)>&s=<seed(s)>'); return; }
    const lvs = String(t.param('lv', LV)).split(',').map(Number), sds = String(t.param('s', 1)).split(',').map(Number);
    const n = Math.max(lvs.length, sds.length);
    for (let i = 0; i < n; i++) {
      const lv = lvs[Math.min(i, lvs.length - 1)] || LV, sd = sds[Math.min(i, sds.length - 1)] || 1;
      const r = sim(id, lv, sd, t.param('heroes', '') === 'real' ? realParty(sd) : null);
      const s = DD.Combat.state, rounds = {};
      s.log.forEach(function (e) { (rounds[e.round] = rounds[e.round] || []).push(e.text); });
      const ks = Object.keys(rounds);
      if (n > 1) t.log('L' + lv + ' s' + sd + ': ' + JSON.stringify(r) + ' enemies left: ' + DD.Combat.active('enemy').map(function (u) { return u.name + ' ' + u.hp; }).join(', '));
      if (n === 1 || r.timeout) {
        (n === 1 ? ks : ks.slice(-3)).forEach(function (k) { t.log('R' + k + ': ' + rounds[k].join(' | ')); });
        if (n === 1) t.log(JSON.stringify(r));
        boardLog(t);
      }
    }
    t.ok(true, 'ran');
  });

  /** Balance tool (skipped unless heroes=real and 4+ real heroes are loaded): real kits vs every encounter, act 2 levels. */
  T.suite('enemies_act2: autoplay sims with real heroes', function (t) {
    if (t.param('heroes', '') !== 'real' || !realParty(1)) { t.skip('pass heroes=real (and load the hero files)'); return; }
    const per = Math.max(1, +t.param('sims', 2) || 2);
    const only = t.param('battle', '');
    let all = 0, allWins = 0, allTaken = 0;
    NORMAL.concat(ELITE).filter(function (id) { return !only || id === only; }).forEach(function (id) {
      let wins = 0, n = 0, rounds = 0, taken = 0, downs = 0;
      LEVELS.forEach(function (lv) {
        for (let k = 0; k < per; k++) {
          const party = realParty(k * 7 + lv);
          const r = sim(id, lv, k * 13 + lv, party);
          n++; rounds += r.rounds; taken += r.taken; downs += r.downs;
          if (r.win) wins++;
          else {
            t.log('  lost: L' + lv + ' sim seed ' + (k * 13 + lv) + ', party [' + party.join(', ') + '], ' + r.rounds + ' rounds' + (r.timeout ? ' (timeout)' : ''));
            if (only) boardLog(t);
          }
          sanity(t, id + ' L' + lv);
        }
      });
      all += n; allWins += wins; allTaken += taken;
      t.log(id + ': won ' + wins + '/' + n + ', avg rounds ' + (rounds / n).toFixed(1) + ', HP lost ' + Math.round(100 * taken / n) + '%, downs/fight ' + (downs / n).toFixed(1));
    });
    t.log('TOTAL: won ' + allWins + '/' + all + ', HP lost ' + Math.round(100 * allTaken / Math.max(1, all)) + '%');
    t.ok(true, 'ran');
  });

  simSuite('graveyard and brunch', ['a2_unpaid_internship', 'a2_bottomless_brunch', 'a2_forbidden_buffet']);
  simSuite('hauntwood', ['a2_cub_scouts', 'a2_follow_the_lights', 'a2_mama_bear']);
  simSuite('academy', ['a2_last_coffee', 'a2_rooftop_critics', 'a2_office_hours']);
  simSuite('night shift and Gary', ['a2_graveyard_shift', 'a2_its_alive', 'a2_tenure_review']);
})();
