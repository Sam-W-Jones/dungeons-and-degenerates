/* Dungeons and Degenerates — tests/content/enemies_act1.js
 * Suites "enemies_act1: ..." for js/data/enemies/act1.js (v2: initiative turns, no telegraphs, attacks of opportunity,
 * reach-aware targeting): registry + DESIGN numbers + initiative modifiers + AI styles, every enemy skill fired at once
 * (damage == desc), the act's one elite wind-up (the Mimic's Lid Slam), attacks of opportunity made with act 1 skills,
 * special mechanics (pack bites, splits, spore pops, throws, engulf, gold swallowing, strike funds), AI turns in the
 * real turn flow (brutes stick, the spider dives, ranged keep distance, planners price attacks of opportunity), HUD
 * previews against these enemies, odd states, every encounter built on many seeds, and AutoPlay sims with the fixture
 * party at levels 1-2 (win rates, HP lost, downs). Uses only the test_ fixture heroes; deterministic per t.seed.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T) return;

  const ENEMIES = ['a1_rat', 'a1_gob_grunt', 'a1_gob_kid', 'a1_kobold_rep', 'a1_slime', 'a1_slimelet', 'a1_spore_bro', 'a1_spider',
    'a1_critic', 'a1_mimic', 'a1_bugbear', 'a1_cube'];
  const ENCOUNTERS = ['a1_rats_in_the_cellar', 'a1_goblin_ambush', 'a1_slime_time', 'a1_fungus_among_us', 'a1_web_of_lies',
    'a1_union_meeting', 'a1_open_mic', 'a1_big_flush', 'a1_mimic_hoard', 'a1_last_call', 'a1_cube_cleanup'];
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const HP_BAND = { minion: [6, 9], normal: [12, 20], elite: [45, 70] };
  const HIT_BAND = { minion: [2, 4], normal: [4, 6], elite: [7, 10] };
  const SCALE_BAND = { minion: [0.6, 0.9], normal: [0.7, 1.15], elite: [1.3, 1.6] };
  // v2: the initiative modifier of each enemy (quick goblins, rats and the ambushing Mimic high; slimes, the Rep and the
  // Cube low) and its AI style for the reach-aware targeting (the spider is the act's one diver)
  const INIT = { a1_rat: 3, a1_gob_grunt: 2, a1_gob_kid: 3, a1_kobold_rep: -2, a1_slime: -1, a1_slimelet: 1, a1_spore_bro: -1,
    a1_spider: 2, a1_critic: 1, a1_mimic: 2, a1_bugbear: -1, a1_cube: -3 };
  const STYLE = { a1_rat: 'melee', a1_gob_grunt: 'melee', a1_gob_kid: 'ranged', a1_kobold_rep: 'support', a1_slime: 'melee',
    a1_slimelet: 'melee', a1_spore_bro: 'kamikaze', a1_spider: 'skirmisher', a1_critic: 'ranged', a1_mimic: 'melee',
    a1_bugbear: 'melee', a1_cube: 'melee' };
  // the skill each enemy makes its attacks of opportunity with (null: it makes none)
  const OPP = { a1_rat: 'a1_rat_nibble', a1_gob_grunt: 'a1_gob_poke', a1_gob_kid: null, a1_kobold_rep: null, a1_slime: null,
    a1_slimelet: 'a1_slimelet_glorp', a1_spore_bro: null, a1_spider: 'a1_spider_bite', a1_critic: 'a1_critic_lute',
    a1_mimic: 'a1_mimic_chomp', a1_bugbear: 'a1_bugbear_bounce', a1_cube: 'a1_cube_engulf' };
  const WINDUPS = { a1_mimic_slam: 1 };   // elites: at most one announced wind-up each, normal enemies none

  function enemyDefs() { return ENEMIES.map(DD.getEnemy).filter(Boolean); }
  function mySkills() {
    const out = {};
    enemyDefs().forEach(function (e) { (e.skills || []).forEach(function (id) { out[id] = DD.getSkill(id); }); });
    return Object.keys(out).map(function (k) { return out[k]; }).filter(Boolean);
  }
  function L1(id) { return DD.skillLevel(DD.getSkill(id), 1); }
  function act(fn) { return DD.Combat._action(fn); }
  function key(p) { return p.x + ',' + p.y; }

  /**
   * Sandbox that never ends on its own; it is the first listed hero's turn, round 1 (initiative 'heroesFirst'). AI units
   * always pass unless cfg.ai (then they take real turns; initiative 'enemiesFirst' makes them act before sandbox() returns).
   */
  function sb(cfg) {
    const c = Object.assign({
      w: 9, h: 9, seed: 7, gold: 20,
      objective: { type: 'custom', text: 'Act 1 test' }, encounter: { id: 'a1_test_arena', checkObjective: function () { return null; } },
    }, cfg);
    if (c.ai) delete c.ai;
    else if (c.enemyAi === undefined) c.enemyAi = false;
    return DD.Combat.sandbox(c);
  }
  function U(defId, i) { return DD.Combat.state.units.filter(function (u) { return u.defId === defId && !u.dead; })[i || 0] || null; }
  function H(defId) { const u = U(defId); if (u) { u.block = 0; } return u; }
  /** `e` uses one of its skills right now (exactly what its turn does with it; the cooldown is left alone). */
  function fire(e, skillId, target, opts) {
    let it = null;
    act(function () { it = DD.AI.useNow(e, skillId, target, Object.assign({ noCooldown: true }, opts || {})); });
    return it;
  }
  /** Count the skills a unit uses on its own (attacks of opportunity aside) while fn runs. */
  function usesOf(unit, fn) {
    const used = [];
    DD.Act.addRule({ id: 'a1_uses_' + unit.id, name: 'Uses', hooks: { onSkillUsed: function (ctx) {
      if (ctx.user === unit && !ctx.opportunity && ctx.skill) used.push(ctx.skill.id);
    } } });
    try { fn(); } finally { DD.Act.removeRule('a1_uses_' + unit.id); }
    return used;
  }
  function noErrors(t, from, label) {
    const errs = DD.problems.slice(from).filter(function (p) { return /^Error in /.test(p); });
    t.eq(errs.length, 0, label + ': no swallowed errors ' + errs.slice(0, 2).join(' | '));
  }

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: registry, DESIGN numbers, initiative, AI styles, barks and sprites', function (t) {
    ENEMIES.forEach(function (id) { t.ok(!!DD.getEnemy(id), 'enemy ' + id + ' registered'); });
    ENCOUNTERS.forEach(function (id) { t.ok(!!DD.getEncounter(id), 'encounter ' + id + ' registered'); });
    t.ok(!!DD.getStatus('a1_engulfed') && !!DD.getObject('a1_strike_fund'), 'status a1_engulfed + object a1_strike_fund');
    // every id this file registers carries the a1_ prefix and act 1
    ['enemies', 'encounters'].forEach(function (bag) {
      Object.keys(DD.defs[bag]).forEach(function (id) { if (/^a1_/.test(id)) t.eq(DD.defs[bag][id].act, 1, bag + ' ' + id + ' is act 1'); });
    });
    // a sandbox unit of each, for the engine's own view of it (style, attack-of-opportunity skill, initiative)
    sb({ w: 12, h: 4, heroes: [{ id: 'test_knight', x: 0, y: 0 }], enemies: ENEMIES.map(function (id, i) { return { id: id, x: i, y: 3 }; }) });
    enemyDefs().forEach(function (e) {
      const L = 'enemy ' + e.id;
      const band = HP_BAND[e.tier];
      t.ok(!!band && e.hp >= band[0] && e.hp <= band[1], L + ': HP ' + e.hp + ' in the act 1 ' + e.tier + ' band ' + JSON.stringify(band));
      t.ok(e.tier !== 'boss' && !e.boss, L + ': not a boss');
      t.ok(e.skills.length >= 1 && e.skills.length <= 3, L + ': 1-3 skills');
      const hits = e.skills.map(function (sid) { return L1(sid).dmg || 0; });
      const top = Math.max.apply(null, hits);
      const hb = HIT_BAND[e.tier];
      t.ok(top >= hb[0] && top <= hb[1], L + ': biggest hit ' + top + ' in the ' + e.tier + ' band ' + JSON.stringify(hb));
      ['spawn', 'attack', 'hurt', 'death'].forEach(function (k) {
        const lines = (e.barks || {})[k] || [];
        t.ok(lines.length >= 2 && lines.length <= 4, L + ': barks.' + k + ' has 2-4 lines (' + lines.length + ')');
        lines.forEach(function (b) { t.ok(typeof b === 'string' && b.length > 0 && b.length <= 70, L + ': bark ≤ 70 chars: ' + JSON.stringify(b)); });
      });
      t.ok(typeof e.desc === 'string' && e.desc.length > 40, L + ': codex desc');
      t.ok(e.xp > 0 && Array.isArray(e.gold), L + ': xp/gold');
      const sp = T.contentHelpers && T.contentHelpers.spriteProblems ? T.contentHelpers.spriteProblems(e.sprite) : [];
      t.eq(sp.length, 0, L + ': sprite spec valid ' + sp.join(', '));
      const sc = e.sprite.scale || 1, sb2 = SCALE_BAND[e.tier];
      t.ok(sc >= sb2[0] && sc <= sb2[1], L + ': sprite scale ' + sc + ' fits the ' + e.tier + ' tier');
      // v2: an explicit initiative modifier and AI style, and a tooltip that says what it does on its turn
      t.eq(e.init, INIT[e.id], L + ': initiative modifier ' + e.init);
      if (typeof e.ai === 'function') t.eq(e.aiStyle, STYLE[e.id], L + ': custom planner with aiStyle ' + JSON.stringify(e.aiStyle));
      else t.ok(e.ai && typeof e.ai === 'object' && e.ai.style === STYLE[e.id], L + ': AI style ' + JSON.stringify(e.ai));
      const u = U(e.id);
      t.ok(!!u && u.init === INIT[e.id], L + ': the unit rolls with init ' + (u && u.init));
      t.eq(u && DD.AI.styleOf(u).style, STYLE[e.id], L + ': DD.AI.styleOf → ' + STYLE[e.id]);
      t.eq(!!(u && DD.AI.isDiver(u)), e.id === 'a1_spider', L + ': ' + (e.id === 'a1_spider' ? 'the act\'s one diver' : 'not a diver'));
      const os = u && DD.Act.opportunitySlot(u);
      t.eq(os ? os.id : null, OPP[e.id], L + ': attacks of opportunity with ' + OPP[e.id]);
      const pd = e.passive && (typeof e.passive.desc === 'function' ? e.passive.desc(u) : e.passive.desc);
      t.ok(!!(e.passive && e.passive.name) && typeof pd === 'string' && /^On (its|his) turn /.test(pd) && pd.length <= 330,
        L + ': tooltip says what it does on its turn: ' + pd);
      t.ok(!/telegraph|next round|plans? to/i.test(pd + ' ' + e.desc), L + ': no telegraph wording left in the tooltip / codex');
    });
    // every sprite is distinct (same spec text = same silhouette)
    const seen = {};
    enemyDefs().forEach(function (e) {
      const sig = JSON.stringify(e.sprite) + String(e.sprite.draw || '') + String(e.sprite.overlay || '');
      t.ok(!seen[sig], 'enemy ' + e.id + ': sprite differs from ' + (seen[sig] || 'the others'));
      seen[sig] = e.id;
    });
    mySkills().forEach(function (s) {
      const L = 'skill ' + s.id;
      t.ok(/^a1_/.test(s.id), L + ': a1_ prefix');
      t.eq(s.owner, 'enemy', L + ': owner enemy');
      t.eq(s.ap, 0, L + ': ap 0');
      t.ok(['self', 'ground', 'unit'].indexOf(s.anchor) >= 0, L + ': anchor ' + s.anchor);
      t.ok(typeof s.icon === 'string' && s.icon.length > 0 && s.name.length <= 28, L + ': icon + short name');
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = DD.skillDesc(s, lv, null), Lv = DD.skillLevel(s, lv);
        t.ok(d.length > 10 && !/undefined|NaN|\[object/.test(d), L + ' L' + lv + ': desc without a user: ' + d);
        Object.keys(Lv).forEach(function (k) {
          if (typeof Lv[k] !== 'number' || k === 'len') return;
          // "for its next turn" says turns 1 in words
          const shown = new RegExp('(^|[^0-9])' + Lv[k] + '([^0-9]|$)').test(d) || (k === 'turns' && Lv[k] === 1 && /next turn\b/.test(d));
          t.ok(shown, L + ': desc shows ' + k + ' ' + Lv[k] + ' — ' + d);
        });
        // v2: no telegraphs; only the wind-up skills say "Wind-up"
        t.ok(!/telegraph|charges for|next round/i.test(d), L + ': no telegraph wording — ' + d);
        t.eq(/Wind-up/.test(d), !!WINDUPS[s.id], L + ': ' + (WINDUPS[s.id] ? 'the desc announces the wind-up' : 'acts at once'));
      }
    });
    // encounters: counts, kinds, rewards, sizes, objectives, layouts
    const encs = ENCOUNTERS.map(DD.getEncounter).filter(Boolean);
    const normal = encs.filter(function (e) { return e.kind === 'normal'; }), elite = encs.filter(function (e) { return e.kind === 'elite'; });
    t.ok(normal.length >= 7 && normal.length <= 8, normal.length + ' normal encounters');
    t.ok(elite.length >= 3 && elite.length <= 4, elite.length + ' elite encounters');
    const types = {}, themes = {};
    let layouts = 0;
    encs.forEach(function (en) {
      const L = 'encounter ' + en.id;
      t.ok(en.name && en.name.length > 4 && en.intro && en.intro.length > 30 && en.intro.length < 200, L + ': name + intro');
      t.ok(en.weight > 0, L + ': weight');
      t.ok(en.kind !== 'boss', L + ': not a boss fight');
      if (en.kind === 'elite') {
        t.eq(en.reward && en.reward.itemRarity, 'rare', L + ': elite reward is a rare item');
        t.ok(en.minDepth >= 2, L + ': elites from row 2');
        t.eq(en.enemies.filter(function (e) { const d = DD.getEnemy(e.id); return d && d.tier === 'elite'; }).length, 1, L + ': exactly one elite');
      } else {
        let lo = 0, hi = 0;
        en.enemies.forEach(function (e) { const n = Array.isArray(e.n) ? e.n : [e.n || 1, e.n || 1]; lo += n[0]; hi += n[1]; });
        t.ok(lo >= 3 && hi <= 5, L + ': 3-5 enemies (' + lo + '-' + hi + ')');
      }
      const ot = en.objective.type;
      types[ot] = (types[ot] || 0) + 1;
      if (en.map.layout) {
        layouts++;
        const w = en.map.layout[0].length;
        t.ok(en.map.layout.every(function (r) { return r.length === w; }), L + ': layout rows have equal width');
        t.ok(w >= 9 && w <= 13 && en.map.layout.length >= 9 && en.map.layout.length <= 13, L + ': layout size ' + w + 'x' + en.map.layout.length);
      } else t.ok(en.map.w >= 9 && en.map.w <= 13 && en.map.h >= 9 && en.map.h <= 13, L + ': size ' + en.map.w + 'x' + en.map.h);
      themes[en.map.theme] = 1;
      (en.reinforcements || []).forEach(function (w) {
        t.ok(w.round >= 2 && w.round <= 5, L + ': wave in round ' + w.round + ' (rounds of initiative)');
        (w.enemies || []).forEach(function (e) { t.ok(!!DD.getEnemy(e.id), L + ': wave enemy ' + e.id); });
      });
    });
    t.ok(types.killAll >= 5 && types.survive >= 1 && types.destroy >= 1 && types.protect >= 1, 'objective variety ' + JSON.stringify(types));
    t.ok(layouts >= 2 && layouts <= 3, layouts + ' handcrafted layouts');
    t.ok(themes.cellar && themes.sewer && themes.warren, 'all three act 1 themes used');
    t.ok(encs.some(function (e) { return (e.reinforcements || []).length; }), 'some encounters have reinforcements');
    t.ok(encs.filter(function (e) { return e.minDepth > 0; }).length >= 4, 'harder encounters gated by minDepth');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: sprites paint (gallery strip, poses, portraits)', function (t) {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 140;
    const ctx = c.getContext('2d', { willReadFrequently: true });   // read back after every pose
    const before = DD.problems.length;
    enemyDefs().forEach(function (e) {
      ['idle', 'attack', 'hurt', 'cast', 'downed'].forEach(function (pose) {
        ctx.clearRect(0, 0, c.width, c.height);
        t.tryRun('draw ' + e.id + ' ' + pose, function () {
          DD.Sprites.draw(ctx, e.sprite, 80, 110, 1.5, { t: 1.3, pose: pose, poseT: 0.5, facing: pose === 'hurt' ? -1 : 1, id: e.id });
        });
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let ink = 0;
        for (let i = 3; i < d.length; i += 16) if (d[i] > 24) ink++;
        t.ok(ink > 30, e.id + ' ' + pose + ' paints pixels (' + ink + ')');
      });
      t.tryRun('portrait ' + e.id, function () { const p = DD.Sprites.portrait(e.id, 64); t.ok(p && p.width === 64, e.id + ' portrait'); });
      const m = DD.Sprites.metrics(e.sprite);
      t.ok(m && m.height > 10, e.id + ' metrics height ' + (m && m.height));
    });
    t.ok(DD.problems.slice(before).filter(function (p) { return /Sprite|sprite|Error in/.test(p); }).length === 0,
      'no sprite warnings: ' + DD.problems.slice(before).slice(0, 3).join(' | '));
    // the custom object painter
    const g = DD.Iso && DD.Iso.painter ? DD.Iso.painter(ctx, { t: 1 }) : null;
    if (g) t.tryRun('strike fund draw', function () { ctx.save(); ctx.translate(80, 100); DD.getObject('a1_strike_fund').draw(g, { id: 'a1_strike_fund', hp: 8, maxHp: 8, data: {} }, 1); ctx.restore(); });
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: every skill fires at once (damage == desc)', function (t) {
    const from = DD.problems.length;
    // Rat: 2 + Bleed 1; Pack Tactics +1 per other rat next to the victim (max +2)
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_rat', x: 3, y: 4 }] });
    let h = H('test_mage'), e = U('a1_rat');
    let hp = h.hp;
    const it0 = fire(e, 'a1_rat_nibble', { x: 4, y: 4 });
    t.ok(!!it0 && it0.resolved && !it0.windup && e.intents.length === 0, 'an act 1 action resolves at once and leaves nothing pending');
    t.eq(hp - h.hp, 2, 'rat nibble: 2 damage alone');
    t.eq((DD.Act.getStatus(h, 'bleed') || {}).stacks, 1, 'rat nibble: Bleed 1');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_rat', x: 3, y: 4 }, { id: 'a1_rat', x: 5, y: 4 }, { id: 'a1_rat', x: 4, y: 3 }, { id: 'a1_rat', x: 4, y: 5 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_rat', 0), 'a1_rat_nibble', { x: 4, y: 4 });
    t.eq(hp - h.hp, 4, 'rat nibble with 3 packmates: 2 + 2 (capped)');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_rat', x: 3, y: 4 }, { id: 'a1_rat', x: 5, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_rat', 0), 'a1_rat_nibble', { x: 4, y: 4 });
    t.eq(hp - h.hp, 3, 'rat nibble with 1 packmate: 3');

    // Goblin Grunt: Pointy Stick hits both tiles (friend, foe, object); Rock Toss is lobbed
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 4, y: 4 }], enemies: [{ id: 'a1_gob_grunt', x: 2, y: 4 }] });
    let a = H('test_mage'), b = H('test_cleric');
    let ha = a.hp, hb = b.hp;
    fire(U('a1_gob_grunt'), 'a1_gob_poke', { x: 3, y: 4 });
    t.ok(ha - a.hp === 6 && hb - b.hp === 6, 'pointy stick: 6 to both tiles in front (' + (ha - a.hp) + ', ' + (hb - b.hp) + ')');
    sb({ heroes: [{ id: 'test_mage', x: 7, y: 7 }], enemies: [{ id: 'a1_gob_grunt', x: 2, y: 4 }, { id: 'a1_rat', x: 3, y: 4 }], objects: [{ x: 4, y: 4, id: 'crate' }] });
    const rat = U('a1_rat');
    fire(U('a1_gob_grunt'), 'a1_gob_poke', { x: 3, y: 4 });
    t.eq(rat.hp, 3, 'pointy stick: friendly fire on the goblin\'s own rat (9 - 6)');
    t.ok(!DD.Grid.tile(4, 4).obj, 'pointy stick: pokes the crate behind to splinters (6 HP)');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_gob_grunt', x: 2, y: 4 }], objects: [{ x: 3, y: 4, id: 'pillar' }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_gob_grunt'), 'a1_gob_rock', h);
    t.eq(hp - h.hp, 4, 'rock toss: 4, lobbed over a pillar');

    // Slingshot Kid: first unit in the line only (friend or foe); Nyah Nyah taunts
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }, { id: 'test_cleric', x: 5, y: 4 }], enemies: [{ id: 'a1_gob_kid', x: 1, y: 4 }] });
    a = H('test_mage'); b = H('test_cleric'); ha = a.hp; hb = b.hp;
    fire(U('a1_gob_kid'), 'a1_kid_sling', { x: 2, y: 4 });
    t.ok(ha - a.hp === 5 && hb === b.hp, 'slingshot: 5 to the first unit, nothing behind it');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_gob_kid', x: 1, y: 4 }, { id: 'a1_gob_grunt', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const g2 = U('a1_gob_grunt');
    fire(U('a1_gob_kid'), 'a1_kid_sling', { x: 2, y: 4 });
    t.ok(g2.hp === 14 && h.hp === hp, 'slingshot: the goblin in the way eats the pebble (5 - armor 1: ' + g2.hp + ')');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_gob_kid', x: 1, y: 4 }, { id: 'a1_gob_grunt', x: 4, y: 6 }] });
    h = H('test_mage');
    const kid = U('a1_gob_kid'), grunt = U('a1_gob_grunt');
    fire(kid, 'a1_kid_nyah', h);
    const ta = DD.Act.getStatus(h, 'taunt');
    t.ok(ta && ta.source === kid.id && ta.turns === 1, 'nyah nyah: hero Taunted by the kid for 1 turn');
    const gh = grunt.hp;
    act(function () { DD.Act.damage(h, grunt, 8, { cause: 'skill', ignoreArmor: true }); });
    t.eq(gh - grunt.hp, 4, 'taunted hero deals 50% to anyone but the kid');

    // Kobold Union Rep: Strike Action inspires allies within 2 (and itself; v2: no Block); memo 5
    sb({ heroes: [{ id: 'test_mage', x: 8, y: 8 }], enemies: [{ id: 'a1_kobold_rep', x: 4, y: 4 }, { id: 'a1_gob_grunt', x: 5, y: 5 }, { id: 'a1_gob_grunt', x: 4, y: 7 }] });
    const rep = U('a1_kobold_rep'), near = U('a1_gob_grunt', 0), far = U('a1_gob_grunt', 1);
    fire(rep, 'a1_rep_strike', rep);
    t.ok(DD.Act.hasStatus(near, 'inspired') && DD.Act.getStatus(near, 'inspired').turns === 2 && near.block === 0, 'strike action: ally within 2 is Inspired for 2 turns, no Block');
    t.ok(DD.Act.hasStatus(rep, 'inspired') && rep.block === 0, 'strike action: the Rep too');
    t.ok(!DD.Act.hasStatus(far, 'inspired'), 'strike action: ally 3 tiles away gets nothing');
    act(function () { DD.Act.teleport(near, 7, 8); });
    hp = H('test_mage').hp;
    fire(near, 'a1_gob_poke', { x: 8, y: 8 });
    t.eq(hp - H('test_mage').hp, Math.round(6 * 1.25), 'an Inspired grunt pokes for 25% more (6 → 8)');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 7 }], enemies: [{ id: 'a1_kobold_rep', x: 4, y: 3 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_kobold_rep'), 'a1_rep_memo', h);
    t.eq(hp - h.hp, 5, 'memo: 5');

    // Sewer Slime / Slimelet
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 5, y: 4 }, { id: 'test_rogue', x: 4, y: 6 }], enemies: [{ id: 'a1_slime', x: 4, y: 4 }] });
    a = H('test_mage'); b = H('test_cleric'); const c = H('test_rogue');
    ha = a.hp; hb = b.hp; const hc = c.hp;
    fire(U('a1_slime'), 'a1_slime_splorch', U('a1_slime'));
    t.ok(ha - a.hp === 5 && hb - b.hp === 5 && hc === c.hp, 'splorch: 5 to each adjacent foe only');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_slimelet', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_slimelet'), 'a1_slimelet_glorp', { x: 4, y: 4 });
    t.eq(hp - h.hp, 3, 'glorp: 3');

    // Spore Bro: 6 poison to adjacent units (friends too), dies; its own blast leaves no cloud (v2: one verb)
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_spore_bro', x: 4, y: 4 }, { id: 'a1_gob_kid', x: 5, y: 4 }, { id: 'a1_slime', x: 4, y: 5 }] });
    h = H('test_mage'); hp = h.hp;
    const bro = U('a1_spore_bro'), gg = U('a1_gob_kid'), sl = U('a1_slime');
    fire(bro, 'a1_spore_boom', bro);
    t.eq(hp - h.hp, 6, 'sporesplosion: 6 to the hero');
    t.eq(gg.maxHp - gg.hp, 6, 'sporesplosion: 6 to the friendly goblin kid too');
    t.eq(sl.hp, sl.maxHp, 'sporesplosion: the poison-immune slime takes nothing');
    t.ok(bro.dead, 'sporesplosion: the Spore Bro dies');
    t.ok(!DD.Act.hasStatus(h, 'poison') && !(DD.Grid.tile(4, 4).surface && DD.Grid.tile(4, 4).surface.id === 'poison'), 'sporesplosion: no Poison and no cloud from its own blast');
    t.eq(DD.Combat.state.units.filter(function (u) { return u.defId === 'a1_slimelet'; }).length, 0, 'the slime survived, no split');

    // Cellar Spider: cross web (no damage, Root for the next turn, webs 3 rounds), bite 5 / 8 vs Rooted
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }, { id: 'test_cleric', x: 5, y: 5 }, { id: 'test_rogue', x: 7, y: 7 }], enemies: [{ id: 'a1_spider', x: 1, y: 4 }] });
    a = H('test_mage'); b = H('test_cleric'); ha = a.hp; hb = b.hp;
    const sp = U('a1_spider');
    fire(sp, 'a1_spider_web', { x: 5, y: 4 });
    t.ok(ha === a.hp && hb === b.hp, 'web spit: no damage (a control move)');
    t.ok(DD.Act.hasStatus(a, 'root') && DD.Act.hasStatus(b, 'root') && DD.Act.getStatus(b, 'root').turns === 1, 'web spit: both heroes in the cross Rooted for 1 turn');
    const webs = [[5, 4], [4, 4], [6, 4], [5, 3], [5, 5]].filter(function (p) { const tl = DD.Grid.tile(p[0], p[1]); return tl.surface && tl.surface.id === 'web' && tl.surface.turns === 3; });
    t.eq(webs.length, 5, 'web spit: 5 web tiles for 3 rounds');
    act(function () { DD.Act.teleport(sp, 4, 5); });
    t.ok(!DD.Act.hasStatus(sp, 'root'), 'the spider walks on its own webs (immune to Root)');
    ha = a.hp;
    act(function () { DD.Act.teleport(sp, 4, 4); });
    fire(sp, 'a1_spider_bite', { x: 5, y: 4 });
    t.eq(ha - a.hp, 8, 'sticky snack vs a Rooted hero: 5 + 3');
    const r2 = H('test_rogue');
    act(function () { DD.Act.teleport(sp, 7, 6); });
    const hr = r2.hp;
    fire(sp, 'a1_spider_bite', { x: 7, y: 7 });
    t.eq(hr - r2.hp, 5, 'sticky snack vs a free hero: 5');

    // Critic: Bad Review 4 + Weak 2 turns (a spell: Silence fizzles it); lute 6
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_critic', x: 1, y: 4 }, { id: 'a1_gob_grunt', x: 8, y: 8 }] });
    h = H('test_mage'); hp = h.hp;
    const cr = U('a1_critic');
    fire(cr, 'a1_critic_review', h);
    t.eq(hp - h.hp, 4, 'bad review: 4');
    t.ok(DD.Act.hasStatus(h, 'weak') && DD.Act.getStatus(h, 'weak').turns === 2, 'bad review: Weak 2 turns');
    const g3 = U('a1_gob_grunt'), g3hp = g3.hp;
    act(function () { DD.Act.damage(h, g3, 8, { cause: 'skill', ignoreArmor: true }); });
    t.eq(g3hp - g3.hp, 6, 'a Weakened hero deals 25% less (8 → 6)');
    act(function () { DD.Act.addStatus(cr, 'silenced', { turns: 1 }, h); });
    hp = h.hp;
    const quiet = fire(cr, 'a1_critic_review', h);
    t.ok(h.hp === hp && quiet && !quiet.resolved, 'silenced critic: Bad Review fizzles');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_critic', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_critic'), 'a1_critic_lute', { x: 4, y: 4 });
    t.eq(hp - h.hp, 6, 'lute to the face: 6');
    noErrors(t, from, 'normal enemies');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: elite skills (tongue, CHOMP, the Lid Slam wind-up, throws, stools, engulf)', function (t) {
    const from = DD.problems.length;
    // Mimic: tongue in a straight line pulls next to it (v2: no Root); out of line it misses
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_mimic', x: 1, y: 4 }] });
    let h = H('test_mage'), hp = h.hp;
    const m = U('a1_mimic');
    fire(m, 'a1_mimic_tongue', h);
    t.eq(hp - h.hp, 4, 'tongue: 4 damage');
    t.ok(h.x === 2 && h.y === 4 && !DD.Act.hasStatus(h, 'root'), 'tongue: pulled next to the mimic (' + key(h) + '), not Rooted');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_mimic', x: 1, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const m2 = U('a1_mimic');
    const it = DD.AI.makeIntent(m2, 'a1_mimic_tongue', h, { noCooldown: true, noAdd: true });
    act(function () { DD.Act.teleport(h, 4, 5); });
    act(function () { DD.AI.executeIntent(m2, it); });
    t.ok(h.hp === hp && h.x === 4 && h.y === 5, 'tongue: a target out of line is missed');
    // CHOMP: 9 + swallows up to 4 gold; it all comes back when the mimic dies
    sb({ gold: 10, heroes: [{ id: 'test_mage', x: 2, y: 4 }], enemies: [{ id: 'a1_mimic', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const m3 = U('a1_mimic');
    fire(m3, 'a1_mimic_chomp', h);
    t.eq(hp - h.hp, 9, 'CHOMP: 9');
    t.eq(DD.Act.gold(), 6, 'CHOMP: party gold 10 → 6');
    t.eq(m3.data.gold, 4, 'CHOMP: the mimic holds 4 gold');
    DD.Combat.state.sandboxGold = 2;
    act(function () { DD.Act.heal(null, h, 20); });
    fire(m3, 'a1_mimic_chomp', h);
    t.ok(DD.Act.gold() === 0 && m3.data.gold === 6, 'CHOMP: a broke party loses what it has (2)');
    act(function () { DD.Act.kill(m3, h); });
    t.eq(DD.Act.gold(), 6, 'dead mimic coughs up all 6 swallowed gold');

    // Lid Slam: the act's one elite wind-up. Announced, it lands at the start of the Mimic's next turn: 7 to everything
    // around it (diagonals too), knockback 1, no bump; a stun interrupts it; while the lid is open it makes no attacks of
    // opportunity (stepping out is free)
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }, { id: 'test_cleric', x: 5, y: 5 }, { id: 'test_rogue', x: 4, y: 6 }], enemies: [{ id: 'a1_mimic', x: 4, y: 4 }],
      terrain: function (tl) { if (tl.x === 6 && tl.y === 5) tl.t = 'wall'; } });
    let a = H('test_mage'), b = H('test_cleric'), c = H('test_rogue');
    let mm = U('a1_mimic');
    let ha = a.hp, hb = b.hp, hc = c.hp;
    let started = 0;
    const off = DD.Events.on('windup:start', function (ev) { if (ev.unit === mm) started++; });
    let w = null;
    act(function () { w = DD.AI.windUp(mm, 'a1_mimic_slam', mm, { anchor: 'self', label: 'Lid Slam' }); });
    off();
    t.ok(!!w && w.windup && w.turnsLeft === 1 && started === 1 && mm.intents.length === 1, 'lid slam: announced as a wind-up');
    t.eq(DD.AI.windups().length, 1, 'lid slam: listed for the HUD (DD.AI.windups)');
    t.eq(DD.AI.intentTiles(mm, w).length, 9, 'lid slam: marks the 3×3 square around the mimic');
    t.ok(a.hp === ha && b.hp === hb, 'lid slam: nothing lands yet');
    DD.Combat.endRound();   // the three heroes pass, the Mimic's turn starts: the slam lands
    t.ok(ha - a.hp === 7 && hb - b.hp === 7 && hc === c.hp, 'lid slam: 7 to the orthogonal and diagonal neighbours only (' + (ha - a.hp) + ', ' + (hb - b.hp) + ', ' + (hc - c.hp) + ')');
    t.ok(a.x === 6 && a.y === 4, 'lid slam: knocked back 1 (' + key(a) + ')');
    t.ok(b.x === 5 && b.y === 5 && mm.intents.length === 0, 'lid slam: a knockback into a wall stays put, no bump damage, nothing pending');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }, { id: 'test_cleric', x: 3, y: 3 }], enemies: [{ id: 'a1_mimic', x: 4, y: 4 }] });
    a = H('test_mage'); b = H('test_cleric'); mm = U('a1_mimic');
    ha = a.hp; hb = b.hp;
    t.ok(DD.Combat.provokes(a, 7, 4).some(function (p) { return p.unitId === mm.id && p.skillId === 'a1_mimic_chomp'; }), 'walking away from the Mimic provokes a CHOMP');
    act(function () { DD.AI.windUp(mm, 'a1_mimic_slam', mm, { anchor: 'self', label: 'Lid Slam' }); });
    t.eq(DD.Combat.provokes(a, 7, 4).length, 0, 'lid open: stepping out of the slam provokes nothing');
    t.ok(DD.Combat.move(a, 7, 4) && a.hp === ha && a.x === 7, 'lid open: the mage walks out for free');
    act(function () { DD.Act.addStatus(mm, 'stun', { turns: 1 }, a); });
    t.eq(mm.intents.length, 0, 'a stun interrupts the Lid Slam at once');
    DD.Combat.endRound();
    t.ok(b.hp === hb, 'interrupted: the cleric next to it takes nothing');

    // Bugbear: throw 3 down the line; wall bump 4 both; pit; friend in the way
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_bugbear', x: 2, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const bb = U('a1_bugbear');
    const bi = DD.AI.makeIntent(bb, 'a1_bugbear_bounce', { x: 3, y: 4 }, { noCooldown: true, noAdd: true });
    t.eq(DD.AI.intentTiles(bb, bi).map(key).join(' '), '3,4 4,4 5,4 6,4', 'bounce area: the grab tile + the 3-tile throw path (what threat shading reads)');
    act(function () { DD.AI.executeIntent(bb, bi); });
    t.ok(hp - h.hp === 7 && h.x === 6 && h.y === 4, 'bounce: 7 damage, thrown 3 tiles (' + key(h) + ', ' + (hp - h.hp) + ')');
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_bugbear', x: 2, y: 4 }], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'wall'; } });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_bugbear'), 'a1_bugbear_bounce', { x: 3, y: 4 });
    t.ok(hp - h.hp === 11 && h.x === 4, 'bounce into a wall: 7 + 4 bump (' + (hp - h.hp) + ')');
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_bugbear', x: 2, y: 4 }], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_bugbear'), 'a1_bugbear_bounce', { x: 3, y: 4 });
    t.eq(hp - h.hp, 7 + Math.ceil(h.maxHp * 0.25), 'bounce into a pit: 7 + 25% max HP, climbs out');
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 5, y: 4 }], enemies: [{ id: 'a1_bugbear', x: 2, y: 4 }] });
    const ma = H('test_mage'), cb = H('test_cleric');
    const mah = ma.hp, cbh = cb.hp;
    fire(U('a1_bugbear'), 'a1_bugbear_bounce', { x: 3, y: 4 });
    t.ok(mah - ma.hp === 11 && cbh - cb.hp === 4 && ma.x === 4, 'bounce into a friend: 11 to the thrown hero, 4 to the one it hits');
    // Bar Stool Toss (v2: at once, no wind-up): 6 to everything within 1 of the tile, friends and furniture too
    sb({ heroes: [{ id: 'test_mage', x: 6, y: 4 }, { id: 'test_cleric', x: 6, y: 5 }], enemies: [{ id: 'a1_bugbear', x: 1, y: 4 }, { id: 'a1_rat', x: 7, y: 4 }], objects: [{ x: 5, y: 4, id: 'crate' }] });
    const s1 = H('test_mage'), s2 = H('test_cleric'), brat = U('a1_rat');
    const s1h = s1.hp, s2h = s2.hp;
    const st = fire(U('a1_bugbear'), 'a1_bugbear_stool', { x: 6, y: 4 });
    t.ok(st && st.resolved && !st.windup && U('a1_bugbear').intents.length === 0, 'bar stool: thrown at once');
    t.ok(s1h - s1.hp === 6 && s2h - s2.hp === 6, 'bar stool: 6 to both heroes in radius 1');
    t.eq(brat.hp, 3, 'bar stool: friendly fire on the rat too (9 - 6)');
    t.ok(!DD.Grid.tile(5, 4).obj, 'bar stool: smashes the crate in the area (6 HP)');

    // Cube: Engulf 7 + Engulfed (can't move, 3 acid at the start of each of the victim's turns) for its next 2 turns;
    // 10 damage to the cube spits them out
    sb({ heroes: [{ id: 'test_knight', x: 7, y: 7 }, { id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const kn = H('test_knight');
    const cube = U('a1_cube');
    fire(cube, 'a1_cube_engulf', h);   // on the knight's turn, as if the cube had acted
    t.eq(hp - h.hp, 7, 'engulf: 7');
    let en = DD.Act.getStatus(h, 'a1_engulfed');
    t.ok(en && en.turns === 2 && !DD.Act.hasStatus(h, 'root'), 'engulf: Engulfed for 2 turns (one status, no separate Root)');
    hp = h.hp;
    DD.Combat.endTurn();   // the mage's turn starts inside the cube
    t.ok(DD.Combat.current() === h && hp - h.hp === 3, 'engulfed: 3 acid at the start of its turn (' + (hp - h.hp) + ')');
    t.ok(h.ap === h.maxAp && DD.Combat.reachable(h).size === 0, 'engulfed: full AP (v2), but it cannot move');
    DD.Combat.endTurn();   // the cube passes; round 2, the knight
    en = DD.Act.getStatus(h, 'a1_engulfed');
    t.ok(DD.Combat.current() === kn && en && en.turns === 1, 'engulfed: one of its 2 turns used (' + (en && en.turns) + ')');
    act(function () { DD.Act.teleport(kn, 4, 3); DD.Act.damage(kn, cube, 6, { cause: 'skill', ignoreArmor: true }); });
    t.ok(DD.Act.hasStatus(h, 'a1_engulfed'), '6 damage: not enough yet');
    act(function () { DD.Act.damage(kn, cube, 5, { cause: 'skill', ignoreArmor: true }); });
    t.ok(!DD.Act.hasStatus(h, 'a1_engulfed'), '10+ damage to the cube: spat out');
    t.eq(kn.maxHp - kn.hp, 4, 'acidic body: 2 acid back per adjacent hit (ignores armor)');
    const knh = kn.hp;
    act(function () { DD.Act.teleport(kn, 4, 1); DD.Act.damage(kn, cube, 4, { cause: 'skill' }); });
    t.eq(kn.hp, knh, 'acidic body: hitting it from range is safe');
    act(function () { DD.Act.push(kn, cube, { x: 0, y: 1 }, 2); DD.Act.addStatus(cube, 'stun', { turns: 1 }, kn); });
    t.ok(cube.x === 4 && cube.y === 4 && !DD.Act.hasStatus(cube, 'stun'), 'cube: immovable and stun immune');
    fire(cube, 'a1_cube_engulf', h);
    t.ok(DD.Act.hasStatus(h, 'a1_engulfed'), 're-engulfed');
    act(function () { DD.Act.teleport(h, 1, 1); });
    t.ok(!DD.Act.hasStatus(h, 'a1_engulfed'), 'teleported away: released');
    act(function () { DD.Act.teleport(h, 3, 4); });
    fire(cube, 'a1_cube_engulf', h);
    act(function () { DD.Act.kill(cube, kn); });
    t.ok(!DD.Act.hasStatus(h, 'a1_engulfed'), 'cube dies: released');
    // spit + bones; jiggle slam (at once)
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 7 }], enemies: [{ id: 'a1_cube', x: 4, y: 3 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_cube'), 'a1_cube_spit', h);
    t.eq(hp - h.hp, 4, 'spit: 4');
    t.eq(DD.Grid.tile(4, 7).obj && DD.Grid.tile(4, 7).obj.id, 'bones', 'spit: leaves bones');
    t.ok(DD.Grid.isWalkable(4, 7), 'bones do not block');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 5 }, { id: 'test_cleric', x: 4, y: 3 }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    const j1 = H('test_mage'), j2 = H('test_cleric'), j1h = j1.hp, j2h = j2.hp;
    const js = fire(U('a1_cube'), 'a1_cube_slam', U('a1_cube'));
    t.ok(js && js.resolved && !js.windup && j1h - j1.hp === 8 && j2h - j2.hp === 8, 'jiggle slam: 8 around (diagonal + orthogonal), at once');
    noErrors(t, from, 'elites');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: attacks of opportunity with act 1 skills', function (t) {
    const from = DD.problems.length;
    /** The mage (first hero: its turn) walks from next to the enemy to (tx, ty); returns what happened. */
    function walkAway(defId, tx, ty, cfg) {
      sb(Object.assign({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: defId, x: 3, y: 4 }] }, cfg || {}));
      const h = H('test_mage'), e = U(defId);
      const pv = DD.Combat.provokes(h, tx, ty);
      const hp = h.hp;
      let strikes = 0;
      const off = DD.Events.on('opportunity:attack', function (ev) { if (ev.attacker === e && ev.mover === h) strikes++; });
      const moved = DD.Combat.move(h, tx, ty);
      off();
      return { h: h, e: e, pv: pv, lost: hp - h.hp, strikes: strikes, moved: moved };
    }
    let r = walkAway('a1_rat', 4, 7);
    t.ok(r.pv.length === 1 && r.pv[0].skillId === 'a1_rat_nibble' && r.strikes === 1 && r.lost >= 2, 'rat: walking away provokes an Ankle Nibble (' + r.lost + ')');
    t.ok(DD.Act.hasStatus(r.h, 'bleed') || r.lost > 2, 'rat: the nibble Bleeds the leaver');
    r = walkAway('a1_gob_grunt', 4, 7);
    t.ok(r.pv.length === 1 && r.pv[0].dmg === 6 && r.lost === 6 && r.h.y === 7, 'grunt: the spear pokes the leaver once (6), the walk goes on');
    r = walkAway('a1_critic', 4, 7);
    t.ok(r.strikes === 1 && r.lost === 6, 'critic: Lute to the Face on the way out (6)');
    r = walkAway('a1_spider', 4, 7);
    t.ok(r.strikes === 1 && r.lost === 5, 'spider: a bite on the way out (5)');
    r = walkAway('a1_slimelet', 4, 7);
    t.ok(r.strikes === 1 && r.lost === 3, 'slimelet: a glorp on the way out (3)');
    // (review) Pack Tactics and the webbed-prey bonus ride on the attack of opportunity itself (o.flat), so the move
    // preview, the path choice and the AI's walk prices show what the bites really deal (they showed 2 / 5)
    function oppDealt(fn) {
      let dealt = 0, n = 0;
      DD.Act.addRule({ id: 'a1_opp_watch', name: 'Opp watch', hooks: { onOpportunityAttack: function (o) { dealt += o.dealt || 0; n++; } } });
      try { fn(); } finally { DD.Act.removeRule('a1_opp_watch'); }
      return { dealt: dealt, n: n };
    }
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_rat', x: 3, y: 4 }, { id: 'a1_rat', x: 4, y: 3 }, { id: 'a1_rat', x: 4, y: 5 }] });
    let mv = H('test_mage');
    let pvs = DD.Combat.provokes(mv, 7, 4);
    let od = oppDealt(function () { DD.Combat.move(mv, 7, 4); });
    t.ok(pvs.length === 3 && pvs.every(function (p) { return p.dmg === 4; }), 'rat pack: the preview shows 2 + 2 packmates on each nibble (' + pvs.map(function (p) { return p.dmg; }).join(', ') + ')');
    t.ok(od.n === 3 && od.dealt === 12, 'rat pack: three nibbles of 4 on the way out, as previewed (' + od.dealt + ')');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_spider', x: 4, y: 4 }], surfaces: [{ x: 5, y: 4, id: 'web', turns: 3 }] });
    mv = H('test_mage');
    pvs = DD.Combat.provokes(mv, 8, 4);
    od = oppDealt(function () { DD.Combat.move(mv, 8, 4); });
    t.ok(pvs.length === 1 && pvs[0].dmg === 8 && od.dealt === 8, 'spider: leaving a web costs 5 + 3, previewed and dealt (' + (pvs[0] && pvs[0].dmg) + ' / ' + od.dealt + ')');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_spider', x: 4, y: 4 }] });
    mv = H('test_mage');
    pvs = DD.Combat.provokes(mv, 8, 4);
    od = oppDealt(function () { DD.Combat.move(mv, 8, 4); });
    t.ok(pvs.length === 1 && pvs[0].dmg === 5 && od.dealt === 5, 'spider: off the web it is the plain 5 (' + (pvs[0] && pvs[0].dmg) + ' / ' + od.dealt + ')');
    ['a1_slime', 'a1_gob_kid', 'a1_kobold_rep', 'a1_spore_bro'].forEach(function (id) {
      r = walkAway(id, 4, 7);
      t.ok(r.pv.length === 0 && r.strikes === 0 && r.lost === 0 && r.h.y === 7, id + ': no attack of opportunity (no melee basic)');
    });
    // the Mimic CHOMPs the leaver (9 + gold)
    r = walkAway('a1_mimic', 4, 7, { gold: 10 });
    t.ok(r.strikes === 1 && r.lost === 9 && DD.Act.gold() === 6, 'mimic: CHOMP on the way out (9, 4 gold swallowed)');
    t.ok(DD.Combat.state.log.some(function (l) { return /swallows 4 gold coins/.test(l.text); }), 'mimic: the log says what the reaction CHOMP took (review)');
    // the Bouncer's attack of opportunity is the throw: grabbed on the way out and thrown 3 tiles away from him
    r = walkAway('a1_bugbear', 4, 7);
    t.ok(r.pv.length === 1 && r.pv[0].skillId === 'a1_bugbear_bounce' && r.pv[0].dmg === 7, 'bugbear: the move preview names the throw (7)');
    t.ok(r.moved && r.lost === 7 && r.h.x === 7 && r.h.y === 4, 'bugbear: "OUT!" — thrown to 7,4 (' + key(r.h) + ', ' + r.lost + '), the walk ends there');
    // the Cube slurps up whoever walks away while Engulf is ready (it stops the walk); on cooldown it makes none
    r = walkAway('a1_cube', 4, 7);
    t.ok(r.strikes === 1 && r.lost === 7 && r.h.x === 4 && r.h.y === 4 && DD.Act.hasStatus(r.h, 'a1_engulfed'), 'cube: Engulfed on the way out, stuck at 4,4 (' + key(r.h) + ')');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_cube', x: 3, y: 4 }] });
    DD.Combat.slotsOf(U('a1_cube')).forEach(function (sl) { if (sl.id === 'a1_cube_engulf') sl.cd = 2; });
    t.eq(DD.Combat.provokes(H('test_mage'), 4, 7).length, 0, 'cube: Engulf cooling down, no attack of opportunity');
    // enemies walking away from the knight provoke his slash (the AI prices it): see the AI suite
    noErrors(t, from, 'attacks of opportunity');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: deaths, splits, pops and strike funds', function (t) {
    const from = DD.problems.length;
    // slime split: 2 slimelets on free tiles next to it; none when cooked by fire or dropped in a pit
    sb({ heroes: [{ id: 'test_mage', x: 2, y: 4 }], enemies: [{ id: 'a1_slime', x: 4, y: 4 }] });
    let h = H('test_mage');
    act(function () { DD.Act.damage(h, U('a1_slime'), 30, { cause: 'skill' }); });
    let kids = DD.Combat.state.units.filter(function (u) { return u.defId === 'a1_slimelet' && !u.dead; });
    t.eq(kids.length, 2, 'slime splits into 2 slimelets');
    t.ok(kids.every(function (k) { return DD.Grid.dist(k, { x: 4, y: 4 }) <= 1 && DD.Grid.isWalkable(k.x, k.y, k); }), 'slimelets land on/next to the slime tile');
    t.ok(kids[0].x !== kids[1].x || kids[0].y !== kids[1].y, 'slimelets on different tiles');
    t.ok(!DD.Combat.state.result, 'fight not over while slimelets live');
    t.eq(DD.Combat.joining().filter(function (e) { return kids.some(function (k) { return k.id === e.unitId; }); }).length, 2, 'the slimelets rolled initiative on arrival (they act from next round)');
    act(function () { kids.forEach(function (k) { DD.Act.damage(h, k, 10, { cause: 'skill' }); }); });
    t.eq(DD.Combat.state.units.filter(function (u) { return u.defId === 'a1_slimelet' && !u.dead; }).length, 0, 'slimelets do not split again');
    sb({ heroes: [{ id: 'test_mage', x: 2, y: 4 }], enemies: [{ id: 'a1_slime', x: 4, y: 4 }] });
    h = H('test_mage');
    const s2 = U('a1_slime');
    act(function () { DD.Act.damage(h, s2, 30, { cause: 'skill', element: 'fire' }); });
    t.ok(s2.dead && !U('a1_slimelet'), 'a fire kill cooks the slime: no split');
    t.eq(DD.Combat.state.units.filter(function (u) { return u.defId === 'a1_slime'; })[0].hp, 0, 'fire: ×1.5 weakness, dead');
    sb({ heroes: [{ id: 'test_mage', x: 2, y: 4 }], enemies: [{ id: 'a1_slime', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'pit'; } });
    h = H('test_mage');
    act(function () { DD.Act.push(h, U('a1_slime'), { x: 1, y: 0 }, 1); });
    t.ok(!U('a1_slime') && !U('a1_slimelet'), 'yeeted into a pit: no split');
    // all slimelets placed even in a crowd (nearest free tiles)
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 5, y: 4 }, { id: 'test_rogue', x: 4, y: 3 }], enemies: [{ id: 'a1_slime', x: 4, y: 4 }, { id: 'a1_rat', x: 4, y: 5 }] });
    act(function () { DD.Act.damage(H('test_mage'), U('a1_slime'), 30, { cause: 'skill' }); });
    t.eq(DD.Combat.state.units.filter(function (u) { return u.defId === 'a1_slimelet' && !u.dead; }).length, 2, 'boxed-in slime still splits (own tile + nearest free)');
    t.ok(T.contentHelpers.sanity(t, 'crowded split'), 'no two units share a tile after a crowded split');

    // spore bro pops when killed: poison cloud (Poison 2 on adjacent units), but no damage
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 8, y: 8 }], enemies: [{ id: 'a1_spore_bro', x: 4, y: 4 }] });
    h = H('test_mage');
    const hp = h.hp;
    act(function () { DD.Act.damage(h, U('a1_spore_bro'), 30, { cause: 'skill' }); });
    t.ok(h.hp === hp && DD.Act.getStatus(h, 'poison') && DD.Act.getStatus(h, 'poison').stacks === 2, 'popped spore bro: Poison 2 to the melee killer, no damage');
    t.eq(DD.Grid.tile(4, 4).surface && DD.Grid.tile(4, 4).surface.id, 'poison', 'pop leaves a poison cloud');
    t.ok(!DD.Act.hasStatus(H('test_cleric'), 'poison'), 'far heroes unaffected');

    // strike funds (v2): hazard pay = 2 Block for an enemy that starts its turn within 2 tiles of a fund (it lasts
    // through the heroes' turns until its next turn start); smashing spills 3 gold; the destroy objective wins
    sb({ gold: 0, heroes: [{ id: 'test_mage', x: 1, y: 7 }], enemies: [{ id: 'a1_gob_grunt', x: 4, y: 3 }, { id: 'a1_gob_grunt', x: 8, y: 8 }],
      objects: [{ x: 4, y: 2, id: 'a1_strike_fund' }, { x: 1, y: 6, id: 'a1_strike_fund' }],
      objective: { type: 'destroy', objId: 'a1_strike_fund', count: 2 }, encounter: null });
    const nearG = U('a1_gob_grunt', 0), farG = U('a1_gob_grunt', 1);
    t.ok(DD.Combat.state.rules.filter(function (r) { return r.id === 'a1_hazard_pay'; }).length === 1, 'placing funds declares the Hazard Pay rule once');
    t.ok(nearG.block === 0 && farG.block === 0, 'nobody starts the fight with Block');
    DD.Combat.endTurn();   // the grunts' turns start (they pass): hazard pay; round 2, the mage again
    t.ok(nearG.block === 2 && farG.block === 0, 'strike fund: the grunt within 2 tiles got 2 Block at its turn start (near ' + nearG.block + ', far ' + farG.block + ')');
    h = H('test_mage');
    const ix = DD.Combat.interactions(h).filter(function (o) { return o.kind === 'smash'; })[0];
    t.ok(!!ix, 'strike fund: smashable by an adjacent hero');
    if (ix) { DD.Combat.interact(h, ix.x, ix.y); DD.Combat.interact(h, ix.x, ix.y); }
    t.ok(!DD.Grid.tile(1, 6).obj && DD.Act.gold() === 3, 'strike fund: smashed (2 × 5 dmg) and spilled 3 gold');
    t.ok(!DD.Combat.state.result, 'one fund left: not won yet');
    act(function () { DD.Act.damageObject(h, 4, 2, 8); });
    t.eq(DD.Combat.state.result, 'victory', 'all strike funds destroyed: victory');
    noErrors(t, from, 'mechanics');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: AI turns (act at once, reach-aware targets, sensible choices)', function (t) {
    const from = DD.problems.length;
    // every enemy: 3 rounds against the fixture party (L2) with a goblin buddy. It acts on its own turns with its own
    // skills, never keeps a wind-up after its turn (only the Mimic's Lid Slam is one) and never shares a tile
    enemyDefs().forEach(function (def) {
      DD.Combat.sandbox({ w: 11, h: 11, seed: 4, objective: { type: 'custom' }, encounter: { id: 'a1_ai_probe', checkObjective: function () { return null; } },
        heroes: PARTY.map(function (id, i) { return { id: id, x: 1 + (i % 2), y: 3 + i, level: 2 }; }),
        enemies: [{ id: def.id, x: 7, y: 5 }, { id: 'a1_gob_grunt', x: 8, y: 2 }] });
      const s = DD.Combat.state;
      const e = U(def.id);
      let turns = 0, bad = 0, pending = 0;
      const offs = [
        DD.Events.on('turn:start', function (ev) { if (ev.unit === e) turns++; }),
        DD.Events.on('turn:end', function (ev) {
          if (ev.unit !== e) return;
          (e.intents || []).forEach(function (it) { pending++; if (!it.windup || !WINDUPS[it.skillId]) bad++; });
        }),
      ];
      let used;
      try { used = usesOf(e, function () { for (let r = 0; r < 3 && !s.result; r++) DD.Combat.endRound(); }); } finally { offs.forEach(function (f) { f(); }); }
      t.ok(turns >= 2 || e.dead, def.id + ': took its own turns (' + turns + ')');
      t.ok(used.length > 0 || e.dead, def.id + ': acted within 3 rounds (' + used.join(', ') + ')');
      t.ok(used.every(function (id) { return def.skills.indexOf(id) >= 0; }), def.id + ': only its own skills');
      t.eq(bad, 0, def.id + ': no pending action after its turn except the Lid Slam wind-up (' + pending + ' pending)');
      T.contentHelpers.sanity(t, def.id + ' 3 rounds');
    });

    // brutes stick to the hero next to them: a grunt / rat / slimelet next to the knight ignores the mage in reach
    ['a1_gob_grunt', 'a1_rat', 'a1_slimelet'].forEach(function (id) {
      sb({ ai: true, heroes: [{ id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 4, y: 7 }], enemies: [{ id: id, x: 3, y: 4 }] });
      const kn = H('test_knight'), mg = H('test_mage'), e = U(id);
      const kh = kn.hp, mh = mg.hp;
      const used = usesOf(e, function () { DD.Combat.endRound(); });
      t.ok(used.length === 1 && kn.hp < kh && mg.hp === mh && DD.Grid.dist(e, kn) === 1, id + ': engaged with the knight, it hits him and stays (' + key(e) + ', ' + used.join() + ')');
      t.ok(kn.oppRound !== DD.Combat.state.round - 1, id + ': it never walked away from him (no attack of opportunity)');
    });
    // the spider is the diver: it leaves the knight (paying his attack of opportunity) for the wounded mage
    sb({ ai: true, heroes: [{ id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 6, y: 6, hp: 10 }], enemies: [{ id: 'a1_spider', x: 3, y: 4 }] });
    let kn = H('test_knight'), mg = H('test_mage'), e = U('a1_spider');
    let kh = kn.hp, mh = mg.hp;
    let aoo = 0;
    let off = DD.Events.on('opportunity:attack', function (ev) { if (ev.attacker === kn && ev.mover === e) aoo++; });
    let used = usesOf(e, function () { DD.Combat.endRound(); });
    off();
    t.ok(used[0] === 'a1_spider_bite' && mg.hp === mh - 5 && kn.hp === kh && DD.Grid.dist(e, mg) === 1, 'spider: dives past the knight and bites the wounded mage (' + key(e) + ', mage −' + (mh - mg.hp) + ')');
    t.ok(aoo === 1 && e.hp === e.maxHp - 4, 'spider: it took the knight\'s attack of opportunity on the way (5 − armor 1)');
    // ... but never one that would drop it
    sb({ ai: true, heroes: [{ id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 6, y: 6, hp: 10 }], enemies: [{ id: 'a1_spider', x: 3, y: 4, hpMult: 0.25 }] });
    kn = H('test_knight'); mg = H('test_mage'); e = U('a1_spider');
    mh = mg.hp;
    DD.Combat.endRound();
    t.ok(!e.dead && mg.hp === mh && DD.Grid.dist(e, kn) === 1, 'spider at ' + e.hp + ' HP: does not walk into a lethal attack of opportunity');
    // ranged: the kid keeps his distance and shoots down the row
    sb({ ai: true, heroes: [{ id: 'test_mage', x: 1, y: 4 }], enemies: [{ id: 'a1_gob_kid', x: 5, y: 4 }] });
    mg = H('test_mage'); e = U('a1_gob_kid'); mh = mg.hp;
    used = usesOf(e, function () { DD.Combat.endRound(); });
    t.ok(used[0] === 'a1_kid_sling' && mh - mg.hp === 5 && DD.Grid.dist(e, mg) >= 3, 'kid: shoots the mage from ' + DD.Grid.dist(e, mg) + ' tiles (' + used.join() + ')');
    // a melee hero next to him pins him: he shoots from where he stands rather than eat the knight's slash
    sb({ ai: true, heroes: [{ id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 4, y: 8 }], enemies: [{ id: 'a1_gob_kid', x: 4, y: 3 }] });
    kn = H('test_knight'); e = U('a1_gob_kid');
    const kidHp = e.hp;
    DD.Combat.endRound();
    t.ok(e.x === 4 && e.y === 3 && e.hp === kidHp, 'kid next to the knight: pinned, he stays put (' + key(e) + ')');
    // kamikaze: the Spore Bro walks between two heroes and blows up on both
    sb({ ai: true, heroes: [{ id: 'test_knight', x: 4, y: 4 }, { id: 'test_cleric', x: 4, y: 6 }], enemies: [{ id: 'a1_spore_bro', x: 7, y: 5 }] });
    kn = H('test_knight'); const cl = H('test_cleric');
    kh = kn.hp; const ch = cl.hp;
    DD.Combat.endRound();
    t.ok(U('a1_spore_bro') === null && kh - kn.hp === 5 && ch - cl.hp === 6, 'spore bro: hugs both (knight −' + (kh - kn.hp) + ', cleric −' + (ch - cl.hp) + ') and pops');
    // support: Strike Action with an ally in reach, a memo when alone
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_mage', x: 4, y: 8 }], enemies: [{ id: 'a1_kobold_rep', x: 4, y: 3 }, { id: 'a1_gob_grunt', x: 5, y: 3 }] });
    t.ok(DD.Act.hasStatus(U('a1_kobold_rep'), 'inspired') && DD.Act.hasStatus(U('a1_gob_grunt'), 'inspired'), 'rep: calls Strike Action with an ally in reach');
    sb({ ai: true, heroes: [{ id: 'test_mage', x: 4, y: 7 }], enemies: [{ id: 'a1_kobold_rep', x: 4, y: 2 }] });
    used = usesOf(U('a1_kobold_rep'), function () { DD.Combat.endRound(); });
    t.eq(used.join(), 'a1_rep_memo', 'rep alone files a memo instead');
    // the critic reviews whoever is not Weak yet
    sb({ ai: true, heroes: [{ id: 'test_mage', x: 2, y: 6 }, { id: 'test_cleric', x: 6, y: 6 }], enemies: [{ id: 'a1_critic', x: 4, y: 1 }] });
    act(function () { DD.Act.addStatus(H('test_mage'), 'weak', { turns: 3 }, U('a1_critic')); });
    DD.Combat.endRound();
    t.ok(DD.Act.hasStatus(H('test_cleric'), 'weak') && H('test_cleric').hp < H('test_cleric').maxHp, 'critic: Bad Review for the cleric (the mage is already Weak)');
    // the spider webs prey it cannot bite yet
    sb({ ai: true, heroes: [{ id: 'test_mage', x: 7, y: 4 }], enemies: [{ id: 'a1_spider', x: 1, y: 4 }] });
    used = usesOf(U('a1_spider'), function () { DD.Combat.endRound(); });
    t.ok(used[0] === 'a1_spider_web' && DD.Act.hasStatus(H('test_mage'), 'root'), 'spider: out of biting reach, it webs the mage (' + used.join() + ')');

    // Mimic: crowded by two heroes it winds up the Lid Slam (its whole turn); a hero steps out for free, the other eats it
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 5, y: 5 }], enemies: [{ id: 'a1_mimic', x: 4, y: 4 }] });
    let mi = U('a1_mimic');
    mg = H('test_mage'); const cl2 = H('test_cleric');
    mh = mg.hp;
    const c2h = cl2.hp;
    const slam = mi.intents.filter(function (i) { return i.skillId === 'a1_mimic_slam'; })[0];
    t.ok(!!slam && slam.windup && slam.turnsLeft === 1 && mi.x === 4 && mi.y === 4, 'mimic: crowded, it winds up the Lid Slam where it stands');
    t.ok(mg.hp === mh && cl2.hp === c2h, 'mimic: nothing else that turn (no CHOMP)');
    t.ok(DD.Combat.move(mg, 1, 4) && mg.hp === mh, 'the mage steps out of the slam for free');
    const slamHits = {};
    DD.Act.addRule({ id: 'a1_slam_watch', name: 'Slam watch', hooks: { onTakeDamage: function (d) {
      if (d.skill && d.skill.id === 'a1_mimic_slam' && d.target) slamHits[d.target.defId] = (slamHits[d.target.defId] || 0) + d.dealt;
    } } });
    DD.Combat.endRound();
    t.ok(slamHits.test_cleric === 7 && !slamHits.test_mage, 'the slam lands on the cleric who stayed (' + JSON.stringify(slamHits) + '), not on the mage');
    // a hero in a straight line 2-4 away and nobody to CHOMP: it walks up and licks them in
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_mage', x: 4, y: 8 }], enemies: [{ id: 'a1_mimic', x: 4, y: 1 }] });
    mi = U('a1_mimic'); mg = H('test_mage');
    t.ok(mg.maxHp - mg.hp === 4 && mi.x === 4 && DD.Grid.dist(mi, mg) === 1, 'mimic: walks into line and reels the mage in (' + key(mi) + ' → mage ' + key(mg) + ')');
    // it walks up and CHOMPs a hero it can reach (a plain bite: no hop)
    sb({ ai: true, initiative: 'enemiesFirst', gold: 10, heroes: [{ id: 'test_mage', x: 6, y: 5 }], enemies: [{ id: 'a1_mimic', x: 3, y: 4 }] });
    mg = H('test_mage');
    t.ok(mg.maxHp - mg.hp === 9 && DD.Grid.dist(U('a1_mimic'), mg) === 1 && DD.Act.gold() === 6, 'mimic: walks up and CHOMPs (−9, 4 gold)');
    // elites walk around walls toward the party (walking distance, not as the crow flies)
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_mage', x: 1, y: 7 }], enemies: [{ id: 'a1_mimic', x: 1, y: 1 }],
      terrain: function (tl) { if (tl.y === 3 && tl.x < 7) tl.t = 'wall'; } });
    const walker = U('a1_mimic');
    t.ok(walker.x > 1 && walker.y <= 2, 'mimic heads for the gap in the wall instead of hugging it (' + key(walker) + ')');

    // Bugbear: walks around a hero to throw it into a pit when that pays (no attack of opportunity on the way)
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_mage', x: 4, y: 4 }, { id: 'test_cleric', x: 7, y: 7 }], enemies: [{ id: 'a1_bugbear', x: 2, y: 4 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 5) tl.t = 'pit'; } });
    mg = H('test_mage');
    t.ok(U('a1_bugbear').x === 4 && U('a1_bugbear').y === 3 && mg.maxHp - mg.hp === 7 + Math.ceil(mg.maxHp * 0.25), 'bugbear: walks around and throws the mage into the pit (' + key(U('a1_bugbear')) + ', −' + (mg.maxHp - mg.hp) + ')');
    // ... and prices the knight's attack of opportunity: a wall bump (+4) is not worth stepping around him, a pit is
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'a1_bugbear', x: 3, y: 4 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 6) tl.t = 'wall'; } });
    kn = H('test_knight');
    let bug = U('a1_bugbear');
    t.ok(bug.x === 3 && bug.y === 4 && bug.hp === bug.maxHp && kn.x === 7 && kn.y === 4, 'bugbear vs a wall: throws the knight from where he stands (' + key(kn) + ')');
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'a1_bugbear', x: 3, y: 4 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 5) tl.t = 'pit'; } });
    kn = H('test_knight'); bug = U('a1_bugbear');
    t.ok(bug.x === 4 && bug.y === 3 && bug.hp === bug.maxHp - 3 && kn.maxHp - kn.hp === 7 - kn.armor + Math.ceil(kn.maxHp * 0.25),
      'bugbear vs a pit: steps around (the knight\'s slash: −' + (bug.maxHp - bug.hp) + '), throws him in (−' + (kn.maxHp - kn.hp) + ')');
    // a group further away: the bar stool
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_mage', x: 7, y: 6 }, { id: 'test_cleric', x: 7, y: 7 }], enemies: [{ id: 'a1_bugbear', x: 2, y: 3 }] });
    t.ok(H('test_mage').maxHp - H('test_mage').hp === 6 && H('test_cleric').maxHp - H('test_cleric').hp === 6, 'bugbear: a bar stool into the pair out of reach (6 each)');

    // Cube: digesting → it does not wander off, nor re-engulf the hero it holds (Engulf left ready to tempt it)
    sb({ ai: true, heroes: [{ id: 'test_cleric', x: 8, y: 8 }, { id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    const cube = U('a1_cube');
    fire(cube, 'a1_cube_engulf', H('test_mage'));   // on the cleric's turn: the mage's next 2 turns
    const before = DD.Act.getStatus(H('test_mage'), 'a1_engulfed').turns;
    used = usesOf(cube, function () { DD.Combat.endRound(); });
    t.ok(cube.x === 4 && cube.y === 4, 'cube: stays put while digesting');
    t.ok(used.indexOf('a1_cube_engulf') < 0 && DD.Act.getStatus(H('test_mage'), 'a1_engulfed').turns < before, 'cube: does not re-engulf the hero it holds (' + used.join() + ')');
    noErrors(t, from, 'AI');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: HUD previews against act 1 enemies match reality', function (t) {
    const from = DD.problems.length;
    const F = T.contentHelpers.fingerprint;
    /** Preview the hero's slot at target, then use it for real: preview must be side-effect free and exact. */
    function check(label, hero, slot, x, y) {
      const s = DD.Combat.state;
      t.ok(DD.Combat.current() === hero, label + ': ' + hero.name + '\'s turn');
      const fp = F(s);
      const prev = DD.Combat.preview(hero, slot, x, y);
      t.eq(F(s), fp, label + ': preview leaves the state untouched');
      const before = {};
      s.units.forEach(function (u) { before[u.id] = { hp: u.hp, dead: !!u.dead }; });
      const n0 = s.units.length;
      t.ok(DD.Combat.useSkill(hero, slot, x, y), label + ': used');
      s.units.forEach(function (u) {
        const b = before[u.id];
        if (!b || b.dead) return;
        const e = prev.perUnit[u.id];
        t.eq(b.hp - u.hp, e ? (e.dmg || 0) - (e.heal || 0) : 0, label + ': ' + u.name + ' HP as previewed');
        t.eq(!!u.dead || !!u.downed, !!(e && e.lethal), label + ': ' + u.name + ' KO as previewed');
      });
      const born = s.units.slice(n0).filter(function (u) { return !u.dead; }).length;
      t.eq(born, (prev.spawned || []).length, label + ': spawns as previewed (' + born + ')');
      return prev;
    }
    // killing a slime with a bolt: the preview shows the two slimelets
    sb({ heroes: [{ id: 'test_mage', x: 2, y: 4 }], enemies: [{ id: 'a1_slime', x: 5, y: 4, hpMult: 0.2 }] });
    let mage = U('test_mage');
    let p = check('bolt kills the slime', mage, mage.basic, 5, 4);
    t.eq((p.spawned || []).filter(function (x) { return x.defId === 'a1_slimelet'; }).length, 2, 'preview lists 2 slimelets');
    // fireball kill: no split (preview and reality)
    sb({ heroes: [{ id: 'test_mage', x: 1, y: 4, skills: ['test_fireball'] }], enemies: [{ id: 'a1_slime', x: 4, y: 4, hpMult: 0.2 }] });
    mage = U('test_mage');
    p = check('fireball cooks the slime', mage, mage.skills[0], 4, 4);
    t.eq((p.spawned || []).length, 0, 'preview: no slimelets from a fire kill');
    // knight bashes a spore bro: it pops, the knight gets Poison 2
    sb({ heroes: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'a1_spore_bro', x: 4, y: 4, hpMult: 0.3 }] });
    const kn = U('test_knight');
    p = check('slash pops the spore bro', kn, kn.basic, 4, 4);
    t.ok(p.perUnit[kn.id] && p.perUnit[kn.id].statuses.indexOf('poison') >= 0 && DD.Act.hasStatus(kn, 'poison'), 'preview + reality: Poison from the spores');
    // rogue stabs the cube holding the mage: past 10 damage the preview shows the release
    sb({ heroes: [{ id: 'test_rogue', x: 4, y: 3, skills: ['test_shiv'] }, { id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    const cube = U('a1_cube'), m2 = U('test_mage'), rog = U('test_rogue');
    fire(cube, 'a1_cube_engulf', m2);
    cube.data.jiggle = 8;
    p = check('stab frees the engulfed mage', rog, rog.basic, 4, 4);
    t.ok(p.perUnit[m2.id] && p.perUnit[m2.id].removed.indexOf('a1_engulfed') >= 0 && !DD.Act.hasStatus(m2, 'a1_engulfed'), 'preview + reality: the mage is spat out');
    // a mimic holding gold dies: party gold comes back in preview and reality alike
    sb({ gold: 0, heroes: [{ id: 'test_mage', x: 2, y: 4 }], enemies: [{ id: 'a1_mimic', x: 5, y: 4, hpMult: 0.01 }] });
    U('a1_mimic').data.gold = 5;
    mage = U('test_mage');
    check('bolt kills the mimic', mage, mage.basic, 5, 4);
    t.eq(DD.Act.gold(), 5, 'mimic gold returned');
    // the move preview's "provokes" numbers are the real attacks of opportunity
    sb({ heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'a1_gob_grunt', x: 3, y: 4 }, { id: 'a1_slimelet', x: 4, y: 5 }] });
    const k2 = H('test_knight');
    const pv = DD.Combat.provokes(k2, 6, 3);
    const want = pv.reduce(function (s, x) { return s + x.dmg; }, 0);
    const kh = k2.hp;
    DD.Combat.move(k2, 6, 3);
    t.ok(pv.length === 2 && kh - k2.hp === want, 'provokes preview: ' + pv.map(function (x) { return x.name + ' ' + x.dmg; }).join(', ') + ' = the real ' + (kh - k2.hp));
    noErrors(t, from, 'previews');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: odd states (charm, silence, sheep, dazzle, confuse, taunt, root, stun) and empty targets', function (t) {
    const from = DD.problems.length;
    const STS = ['charmed', 'silenced', 'sheep', 'dazzled', 'confused', 'taunt', 'root', 'stun', 'slow', 'weak'];
    let runs = 0;
    enemyDefs().forEach(function (def) {
      STS.forEach(function (st, i) {
        DD.Combat.sandbox({ w: 10, h: 10, seed: 3 + i, objective: { type: 'custom' }, encounter: { id: 'a1_odd', checkObjective: function () { return null; } },
          heroes: PARTY.map(function (h, k) { return { id: h, x: 2 + k, y: 6 + (k % 2), level: 2 }; }),
          enemies: [{ id: def.id, x: 4, y: 4 }, { id: 'a1_rat', x: 6, y: 4 }, { id: 'a1_gob_grunt', x: 3, y: 3 }],
          terrain: function (tl) { if (tl.x === 7 && tl.y === 7) tl.t = 'pit'; if (tl.x === 1 && tl.y === 1) tl.t = 'lava'; } });
        const s = DD.Combat.state;
        const e = s.units.filter(function (u) { return u.defId === def.id; })[0];
        const h = s.units.filter(function (u) { return u.kind === 'hero'; })[0];
        act(function () { DD.Act.addStatus(e, st, { stacks: 2, turns: 2 }, h); });
        for (let r = 0; r < 2 && !s.result; r++) {
          DD.Combat.endRound();
          runs++;
          (e.intents || []).forEach(function (it) {
            const d = DD.AI.describe(e, it);
            if (!d || !d.text || !isFinite(d.dmg)) t.fail(def.id + ' +' + st + ': describe() broken');
          });
          T.contentHelpers.sanity(t, def.id + ' +' + st + ' r' + r);
        }
      });
      // every skill with an empty target tile, no target at all, and a dead user
      def.skills.forEach(function (sid) {
        sb({ heroes: [{ id: 'test_mage', x: 8, y: 8 }], enemies: [{ id: def.id, x: 3, y: 3 }] });
        const e = U(def.id);
        fire(e, sid, { x: 3, y: 5 });
        act(function () { DD.Combat.resolveSkill(e, sid, null, { extra: { isIntent: true } }); });
        act(function () { DD.Act.kill(e, null); });
        act(function () { DD.Combat.resolveSkill(e, sid, { x: 8, y: 8 }, { extra: { isIntent: true } }); });
        T.contentHelpers.sanity(t, sid + ' empty / dead user');
      });
    });
    t.ok(runs >= ENEMIES.length * STS.length, runs + ' rounds under odd states');
    noErrors(t, from, 'odd states');
  });

  // ---------------------------------------------------------------------------------------------------------------
  // The gimmicks in the real turn flow (each block guards a v2 conversion or an earlier review fix).
  T.suite('enemies_act1: gimmicks in the turn flow (packs, webbed bites, tongues, digestion, keg raids)', function (t) {
    const from = DD.problems.length;
    // Pack Tactics: three rats run up one after another; each bite counts the packmates already there (2 + 3 + 4)
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_rat', x: 4, y: 1 }, { id: 'a1_rat', x: 7, y: 4 }, { id: 'a1_rat', x: 1, y: 4 }] });
    let h = H('test_mage');
    const rats = DD.Combat.state.units.filter(function (u) { return u.defId === 'a1_rat'; });
    t.ok(rats.every(function (r) { return DD.Grid.dist(r, h) === 1; }), 'three rats surround the mage on their turns');
    t.eq(h.maxHp - h.hp, 9, 'pack bites as they arrive: 2 + 3 + 4');
    t.eq((DD.Act.getStatus(h, 'bleed') || {}).stacks, 3, 'three nibbles: Bleed 3');
    // Spider: it webs the mage from afar (the Root covers the mage's next turn); next round the Root is gone but the web
    // under the mage is not, so the bite deals 5 + 3
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_mage', x: 7, y: 4 }], enemies: [{ id: 'a1_spider', x: 0, y: 4 }] });
    h = H('test_mage');
    t.ok(DD.Act.hasStatus(h, 'root') && h.hp === h.maxHp, 'round 1: webbed and Rooted, no damage');
    t.eq(DD.Combat.reachable(h).size, 0, 'rooted on its turn: the mage cannot walk out');
    let hp = h.hp;
    DD.Combat.endRound();
    t.ok(!DD.Act.hasStatus(h, 'root') && hp - h.hp === 8, 'round 2: Root gone, the bite on the web-standing mage deals 8 (' + (hp - h.hp) + ')');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_spider', x: 4, y: 4 }], surfaces: [{ x: 5, y: 4, id: 'web', turns: 3 }] });
    h = H('test_mage'); hp = h.hp;
    t.ok(!DD.Act.hasStatus(h, 'root'), 'a hero standing in a web without Root');
    fire(U('a1_spider'), 'a1_spider_bite', { x: 5, y: 4 });
    t.eq(hp - h.hp, 8, 'sticky snack vs web-standing prey: 5 + 3');
    // Sticky Tongue: whatever is in the way stops the pull without a bonk; the hit is exactly its 4
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_mimic', x: 1, y: 4 }, { id: 'a1_rat', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const blocker = U('a1_rat');
    fire(U('a1_mimic'), 'a1_mimic_tongue', h);
    t.ok(hp - h.hp === 4 && h.x === 4 && blocker.hp === blocker.maxHp, 'tongue over a rat: 4 damage, stops at 4,4 (' + key(h) + ', ' + (hp - h.hp) + '), the rat is not bonked');
    // Lid Slam into a wall: exactly its 7 (the knockback never bumps)
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_mimic', x: 4, y: 4 }], terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'wall'; } });
    h = H('test_mage'); hp = h.hp;
    act(function () { DD.AI.windUp(U('a1_mimic'), 'a1_mimic_slam', U('a1_mimic'), { anchor: 'self' }); });
    const shown = DD.AI.windups()[0];
    DD.Combat.endRound();
    t.ok(shown && shown.dmg === 7 && hp - h.hp === 7, 'lid slam into a wall: shows 7, deals 7 (' + (hp - h.hp) + ')');
    // CHOMP is a plain bite now: a target 2 tiles away is out of reach (the planner walks up instead)
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_mimic', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const far = fire(U('a1_mimic'), 'a1_mimic_chomp', h);
    t.ok(h.hp === hp && U('a1_mimic').x === 3 && !(far && far.resolved), 'CHOMP from 2 tiles: no hop, no bite');
    // Engulf: a second meal does not reset the "10 damage frees everyone" count
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 5, y: 4 }, { id: 'test_knight', x: 4, y: 3 }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    const cb = U('a1_cube'), e1 = H('test_mage'), e2 = H('test_cleric'), kn = H('test_knight');
    fire(cb, 'a1_cube_engulf', e1);
    act(function () { DD.Act.damage(kn, cb, 8, { cause: 'skill', ignoreArmor: true }); });
    fire(cb, 'a1_cube_engulf', e2);
    t.ok(DD.Act.hasStatus(e1, 'a1_engulfed') && DD.Act.hasStatus(e2, 'a1_engulfed'), 'the cube holds two heroes');
    act(function () { DD.Act.damage(kn, cb, 2, { cause: 'skill', ignoreArmor: true }); });
    t.ok(!DD.Act.hasStatus(e1, 'a1_engulfed') && !DD.Act.hasStatus(e2, 'a1_engulfed'), '10 damage since the first meal frees both');

    // Open Mic: a grunt goes for the Last Keg (protect objectives value it) on its turn
    sb({ ai: true, initiative: 'enemiesFirst', heroes: [{ id: 'test_mage', x: 8, y: 0 }], enemies: [{ id: 'a1_gob_grunt', x: 4, y: 5 }],
      objects: [{ x: 4, y: 8, id: 'keg', hp: 30, label: 'The Last Keg' }], objective: { type: 'protect', objId: 'keg' }, encounter: null });
    const kegTile = DD.Grid.tile(4, 8);
    t.eq(kegTile.obj && kegTile.obj.hp, 24, 'the grunt walks up and pokes the keg: 30 → 24');
    // the second wave kicks in the kitchen door (east) in round 2, a walk away from the keg
    const om = DD.getEncounter('a1_open_mic');
    const party = PARTY.map(function (id) { return DD.Combat.makeRunHero({ id: id, level: 2 }); });
    const setup = DD.Encounter.build(om, party, { rng: DD.RNG('a1keg:' + t.seed), difficulty: 'normal', act: 1 });
    DD.Combat.start(setup, { seed: 7, headless: true, difficulty: 'normal', kind: 'normal' });
    const s = DD.Combat.state;
    const arrived = [];
    const offJ = DD.Events.on('initiative:joined', function (ev) {
      if (ev.unit && ev.unit.kind === 'enemy') arrived.push({ id: ev.unit.defId, x: ev.unit.x, y: ev.unit.y, round: s.round });
    });
    try {
      t.ok(DD.Combat.rollInitiative() && s.round === 1, 'open mic: initiative rolled, round 1');
      for (let g = 0; g < 8 && s.round < 2 && !s.result; g++) DD.Combat.endTurn();
    } finally { offJ(); }
    const keg = s.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'keg'; })[0];
    t.ok(s.round === 2 && arrived.length === 2 && arrived.every(function (a) { return a.round === 2; }), 'round 2: the kitchen-door wave arrives (' + arrived.map(function (u) { return u.id + '@' + key(u); }).join(' ') + ')');
    t.ok(!!keg && arrived.every(function (u) { return u.x === s.grid.w - 1 && DD.Grid.dist(u, keg) >= 4; }), 'it comes in on the east edge, at least 4 tiles from the keg');
    noErrors(t, from, 'gimmicks');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: encounters build on many seeds (valid maps)', function (t) {
    const party = PARTY.map(function (id) { return DD.Combat.makeRunHero({ id: id, level: 2 }); });
    ENCOUNTERS.forEach(function (id) {
      const en = DD.getEncounter(id);
      let lo = 0, hi = 0;
      en.enemies.forEach(function (e) { const n = Array.isArray(e.n) ? e.n : [e.n || 1, e.n || 1]; lo += n[0]; hi += n[1]; });
      ['normal', 'brutal'].forEach(function (diff) {
        for (let i = 0; i < 6; i++) {
          const L = id + ' ' + diff + ' #' + i;
          const setup = t.tryRun(L, function () { return DD.Encounter.build(en, party, { rng: DD.RNG('a1enc:' + t.seed + ':' + id + diff + i), difficulty: diff, act: 1 }); });
          if (!setup) continue;
          const v = DD.MapGen.validate({ grid: setup.grid, heroZone: setup.heroZone, enemyZone: setup.enemyZone }, { layout: !!en.map.layout });
          t.ok(v.ok, L + ': valid map ' + v.problems.slice(0, 2).join(' | '));
          t.eq(setup.objective.type, en.objective.type, L + ': objective kept');
          if (en.objective.type === 'destroy') t.eq(setup.objective.count, en.objective.count, L + ': all ' + en.objective.count + ' strike funds placed');
          if (en.objective.type === 'protect') {
            const kegs = setup.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === en.objective.objId; });
            t.ok(kegs.length === 1 && kegs[0].obj.hp === 30 && kegs[0].obj.label === 'The Last Keg', L + ': exactly one Last Keg (30 HP)');
          }
          const extra = diff === 'brutal' && en.kind === 'normal' ? 1 : 0;
          t.ok(setup.enemies.length >= lo + extra && setup.enemies.length <= hi + extra, L + ': ' + setup.enemies.length + ' enemies');
          t.eq(setup.heroes.length, 4, L + ': 4 heroes placed');
          const deploy = {};
          setup.deployTiles.forEach(function (p) { deploy[key(p)] = 1; });
          setup.heroes.concat(setup.enemies).forEach(function (u) {
            const tl = setup.grid.tiles[u.y * setup.grid.w + u.x];
            t.ok(tl && DD.MapGen.isSafeTile(tl), L + ': ' + u.id + ' on a safe tile');
          });
          t.ok(setup.heroes.every(function (hh) { return deploy[key(hh)]; }), L + ': heroes in the deploy zone');
          const near = setup.enemies.filter(function (e) { return setup.heroes.some(function (hh) { return Math.abs(hh.x - e.x) + Math.abs(hh.y - e.y) < 3; }); });
          t.eq(near.length, 0, L + ': no enemy starts within 2 tiles of a hero');
          if (en.map.layout) {
            if (id === 'a1_mimic_hoard') t.ok(setup.enemies.some(function (e) { return e.id === 'a1_mimic' && e.x === 5 && e.y === 3; }), L + ': mimic on its dais mark');
            if (id === 'a1_union_meeting') t.ok(setup.enemies.some(function (e) { return e.id === 'a1_kobold_rep' && e.x === 5 && e.y === 3; }), L + ': the Rep on his soapbox');
          }
        }
      });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  /**
   * AutoPlay the fixture party at `level` through an encounter (a real rolled fight: deployment, initiative, waves).
   * Returns { result, rounds, timeout, taken, pct (of the party's max HP), downs, r1downs, aooBy: { hero, enemy }, violations }.
   */
  function sim(en, level, seed) {
    const party = PARTY.map(function (id) { return DD.Combat.makeRunHero({ id: id, level: level }); });
    const setup = DD.Encounter.build(en, party, { rng: DD.RNG('a1sim:' + seed), difficulty: 'normal', act: 1 });
    let out = null;
    const w = T.contentHelpers.watchAreas(function (w) {
      DD.Combat.start(setup, { seed: DD.RNG('a1simc:' + seed).int(1, 1e9), headless: true, difficulty: 'normal', kind: en.kind });
      w.arm();
      const s = DD.Combat.state;
      let maxHp = 0;
      s.units.forEach(function (u) { if (u.kind === 'hero') maxHp += u.maxHp; });
      let r1downs = 0;
      const aooBy = { hero: 0, enemy: 0 };
      const offs = [
        DD.Events.on('unit:downed', function () { if (DD.Combat.state === s && s.round <= 1) r1downs++; }),
        DD.Events.on('opportunity:attack', function (ev) { if (DD.Combat.state === s && ev.attacker) aooBy[ev.attacker.side === 'hero' ? 'hero' : 'enemy']++; }),
      ];
      let res;
      try { res = DD.AutoPlay.runBattle(30); } finally { offs.forEach(function (f) { f(); }); }
      let taken = 0;
      s.units.forEach(function (u) { if (u.kind === 'hero') taken += (s.stats.units[u.id] || {}).taken || 0; });
      out = { result: res.result, rounds: res.rounds, timeout: !!res.timeout, taken: taken, pct: 100 * taken / Math.max(1, maxHp),
        downs: s.stats.downs || 0, r1downs: r1downs, aooBy: aooBy };
    });
    out.violations = w.violations.filter(function (v, i) { return w.violations.indexOf(v) === i; });
    return out;
  }
  const SIM = {};   // per kind: { wins, total, rounds, pct, downs } (normal runs first, elites compare against it)
  function simSuite(t, kind) {
    const from = DD.problems.length;
    const runs = Math.max(1, +(t.param('n', 3)) || 3);
    const encs = ENCOUNTERS.map(DD.getEncounter).filter(function (e) { return e.kind === kind; });
    const levels = [1, 2];
    const agg = { wins: 0, total: 0, rounds: 0, pct: 0, downs: 0, r1downs: 0, aoo: { hero: 0, enemy: 0 }, perEnc: [] };
    encs.forEach(function (en) {
      const row = [];
      let encWins = 0, encTotal = 0, encRounds = 0, encPct = 0, encTaken = 0;
      levels.forEach(function (lv) {
        let w = 0, r = 0, pc = 0, dn = 0;
        for (let i = 0; i < runs; i++) {
          const res = sim(en, lv, t.seed + ':' + en.id + ':' + lv + ':' + i);
          res.violations.forEach(function (v) { t.fail(en.id + ': ' + v); });
          t.ok(!res.timeout, en.id + ' L' + lv + ' #' + i + ': no timeout (' + res.rounds + ' rounds)');
          if (res.result === 'victory') w++;
          r += res.rounds; pc += res.pct; dn += res.downs; encTaken += res.taken;
          agg.r1downs += res.r1downs; agg.aoo.hero += res.aooBy.hero; agg.aoo.enemy += res.aooBy.enemy;
        }
        row.push('L' + lv + ' ' + w + '/' + runs + ' r' + (r / runs).toFixed(1) + ' HP lost ' + (pc / runs).toFixed(0) + '% downs ' + (dn / runs).toFixed(1));
        encWins += w; encTotal += runs; encRounds += r; encPct += pc; agg.downs += dn;
      });
      agg.wins += encWins; agg.total += encTotal; agg.rounds += encRounds; agg.pct += encPct;
      agg.perEnc.push(encPct / encTotal);
      t.log(en.id + ': ' + row.join(' · ') + ' — avg r' + (encRounds / encTotal).toFixed(1) + ' ' + (encPct / encTotal).toFixed(0) + '%');
      t.ok(encWins > 0, en.id + ': winnable (' + encWins + '/' + encTotal + ')');
      t.ok(encRounds / encTotal >= 2.5, en.id + ': not over in a flash (avg ' + (encRounds / encTotal).toFixed(1) + ' rounds)');
      t.ok(encTaken > 0, en.id + ': the enemies land hits (' + encTaken + ' damage over ' + encTotal + ' fights)');
      if (kind === 'normal') t.ok(encWins / encTotal >= 0.5, en.id + ': normal fight won most of the time by the fixture party at L1-2 (' + encWins + '/' + encTotal + ')');
    });
    SIM[kind] = agg;
    t.log(kind + ' TOTAL: won ' + agg.wins + '/' + agg.total + ' (' + Math.round(100 * agg.wins / agg.total) + '%), avg rounds ' + (agg.rounds / agg.total).toFixed(1) +
      ', HP lost ' + (agg.pct / agg.total).toFixed(1) + '% of the party, downs ' + (agg.downs / agg.total).toFixed(2) + ' a fight, round-1 downs ' + agg.r1downs +
      ', attacks of opportunity ' + (agg.aoo.hero / agg.total).toFixed(1) + ' by heroes / ' + (agg.aoo.enemy / agg.total).toFixed(1) + ' by enemies a fight');
    // light balance guards (v2, "hard but fair"): nobody drops in round 1, the act's fights are fought, not one-shot
    t.ok(agg.r1downs <= Math.ceil(agg.total * 0.05), kind + ': heroes rarely go down in round 1 (' + agg.r1downs + ' in ' + agg.total + ' fights)');
    t.ok(agg.aoo.hero > 0 && agg.aoo.enemy > 0, kind + ': attacks of opportunity happen both ways');
    if (kind === 'elite' && SIM.normal) {
      const mean = SIM.normal.pct / SIM.normal.total, elite = agg.pct / agg.total;
      t.ok(elite >= 1.2 * mean, 'elites hurt clearly more than normal fights (' + elite.toFixed(1) + '% vs ' + mean.toFixed(1) + '% of the party HP)');
      t.ok(agg.rounds / agg.total >= SIM.normal.rounds / SIM.normal.total, 'elites last at least as long as normal fights');
    }
    noErrors(t, from, kind + ' sims');
  }
  T.suite('enemies_act1: autoplay sims (normal encounters, fixture party L1-2)', function (t) { simSuite(t, 'normal'); });
  T.suite('enemies_act1: autoplay sims (elite encounters, fixture party L1-2)', function (t) { simSuite(t, 'elite'); });

  // ---------------------------------------------------------------------------------------------------------------
  // v2 user requests (Nov 3): flyers ignore everything on the floor; heroes can aim attacks at explosive barrels
  T.suite('enemies_act1: v2 requests (Nov 3) — flyers over webs and spores, the Bouncer, the Leaky Flagon barrels', function (t) {
    const from = DD.problems.length;
    // Sticky Snack: a walker standing in a web takes the bonus, a flyer over the same web does not (it is not in it)
    [false, true].forEach(function (flying) {
      sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_spider', x: 4, y: 4 }], surfaces: [{ x: 5, y: 4, id: 'web', turns: 3 }] });
      const h = H('test_mage'), hp = h.hp;
      h.flags.flying = flying;
      fire(U('a1_spider'), 'a1_spider_bite', { x: 5, y: 4 });
      t.eq(hp - h.hp, flying ? 5 : 8, 'Sticky Snack vs ' + (flying ? 'a flyer over' : 'a walker in') + ' a web: ' + (flying ? '5 (no bonus)' : '5 + 3'));
    });
    // the popped Spore Bro's spores lie on the floor: the walker next to him gets Poison 2, the flyer nothing
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 5, y: 4 }], enemies: [{ id: 'a1_spore_bro', x: 4, y: 4 }] });
    const walker = H('test_mage'), flyer = H('test_cleric');
    flyer.flags.flying = true;
    act(function () { DD.Act.damage(walker, U('a1_spore_bro'), 30, { cause: 'skill' }); });
    t.ok(DD.Act.getStatus(walker, 'poison') && DD.Act.getStatus(walker, 'poison').stacks === 2, 'popped spore bro: Poison 2 to the walker next to him');
    t.ok(!DD.Act.hasStatus(flyer, 'poison'), 'and nothing to the flyer above the spores');
    t.ok(DD.Grid.tile(5, 4).surface && DD.Grid.tile(5, 4).surface.id === 'poison', 'the spores are on the floor under the flyer');
    const pv = DD.getEnemy('a1_spore_bro').passive.desc;
    t.ok(/floor/.test(pv) && /flyers float over it/.test(pv), 'the Bro Hug text says the spores lie on the floor (flyers float over)');
    // the Bouncer: a flyer over a pit is not worth throwing (it sails over), the walker into the wall is
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }, { id: 'test_mage', x: 4, y: 3 }], enemies: [{ id: 'a1_bugbear', x: 4, y: 4 }],
      terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; if (tl.x === 4 && tl.y === 2) tl.t = 'wall'; } });
    const mages = DD.Combat.state.units.filter(function (u) { return u.defId === 'test_mage'; });
    const fly2 = mages.filter(function (u) { return u.x === 5; })[0], walk2 = mages.filter(function (u) { return u.x === 4; })[0];
    fly2.flags.flying = true;
    fly2.block = walk2.block = 0;
    act(function () { DD.AI.act(U('a1_bugbear')); });
    t.ok(walk2.hp < walk2.maxHp && fly2.hp === fly2.maxHp && fly2.x === 5 && fly2.y === 4,
      'the Bouncer throws the walker into the wall (−' + (walk2.maxHp - walk2.hp) + '), not the flyer over the pit (−' + (fly2.maxHp - fly2.hp) + ')');
    // the Leaky Flagon's explosive barrels: volatile, so a hero's attack sets one off (credited to the hero)
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_rat', x: 6, y: 5 }], objects: [{ x: 6, y: 4, id: 'barrel_explosive' }] });
    const mg = H('test_mage'), rat = U('a1_rat');
    t.ok(DD.Act.isVolatile(DD.Grid.tile(6, 4).obj), 'barrel_explosive is volatile');
    const slot = DD.Combat.slotsOf(mg).filter(function (s) {
      return DD.Targeting.aimsAtObjects(mg, s) && DD.Combat.canUse(mg, s) === true &&
        DD.Targeting.validTargets(mg, s).some(function (p) { return p.x === 6 && p.y === 4; });
    })[0];
    t.ok(!!slot, 'the mage can aim an attack at the barrel (' + (slot ? slot.id : 'none') + ')');
    if (slot) {
      const ratHp = rat.hp;
      DD.Combat.useSkill(mg, slot, 6, 4);
      t.ok(!DD.Grid.tile(6, 4).obj, 'the attack sets the barrel off');
      t.ok(rat.dead || rat.hp < ratHp, 'the rat next to it is caught in the blast (' + (rat.dead ? 'dead' : ratHp - rat.hp) + ')');
    }
    noErrors(t, from, 'v2 requests');
  });
})();
