/* Dungeons and Degenerates — tests/content/enemies_act1.js
 * Suites "enemies_act1: ..." for js/data/enemies/act1.js: registry + DESIGN numbers, every enemy skill fired as a
 * real intent (damage == desc), special mechanics (pack bites, splits, spore pops, tongue pulls, throws, engulf,
 * gold swallowing, strike funds), AI planning (valid, readable intents incl. the elites' delayed hits), HUD previews
 * against these enemies, every encounter built on many seeds, and AutoPlay sims with the fixture party (L1-4).
 * Uses only the test_ fixture heroes; deterministic per t.seed.
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
  const DELAYED = { a1_mimic_slam: 1, a1_bugbear_stool: 1, a1_cube_slam: 1 };

  function enemyDefs() { return ENEMIES.map(DD.getEnemy).filter(Boolean); }
  function mySkills() {
    const out = {};
    enemyDefs().forEach(function (e) { (e.skills || []).forEach(function (id) { out[id] = DD.getSkill(id); }); });
    return Object.keys(out).map(function (k) { return out[k]; }).filter(Boolean);
  }
  function L1(id) { return DD.skillLevel(DD.getSkill(id), 1); }
  function act(fn) { return DD.Combat._action(fn); }
  function key(p) { return p.x + ',' + p.y; }

  /** Sandbox that never ends on its own. Heroes start with 0 AP-free Guard (ap zeroed by the helpers that need it). */
  function sb(cfg) {
    return DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, noPlan: true, gold: 20,
      objective: { type: 'custom', text: 'Act 1 test' }, encounter: { id: 'a1_test_arena', checkObjective: function () { return null; } },
    }, cfg));
  }
  function U(defId, i) { return DD.Combat.state.units.filter(function (u) { return u.defId === defId && !u.dead; })[i || 0] || null; }
  function H(defId) { const u = U(defId); if (u) { u.block = 0; } return u; }
  /** Fire one intent of `e` right now (exactly what the enemy phase does for it). */
  function fire(e, skillId, target, opts) {
    const it = DD.AI.makeIntent(e, skillId, target, Object.assign({ noCooldown: true }, opts || {}));
    act(function () { DD.AI.executeIntent(e, it); });
    return it;
  }
  function noErrors(t, from, label) {
    const errs = DD.problems.slice(from).filter(function (p) { return /^Error in /.test(p); });
    t.eq(errs.length, 0, label + ': no swallowed errors ' + errs.slice(0, 2).join(' | '));
  }

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: registry, DESIGN numbers, barks and sprites', function (t) {
    ENEMIES.forEach(function (id) { t.ok(!!DD.getEnemy(id), 'enemy ' + id + ' registered'); });
    ENCOUNTERS.forEach(function (id) { t.ok(!!DD.getEncounter(id), 'encounter ' + id + ' registered'); });
    t.ok(!!DD.getStatus('a1_engulfed') && !!DD.getObject('a1_strike_fund'), 'status a1_engulfed + object a1_strike_fund');
    // every id this file registers carries the a1_ prefix and act 1
    ['enemies', 'skills', 'statuses', 'objects', 'encounters'].forEach(function (bag) {
      Object.keys(DD.defs[bag]).forEach(function (id) {
        const d = DD.defs[bag][id];
        if (/^a1_/.test(id)) {
          if (bag === 'enemies' || bag === 'encounters') t.eq(d.act, 1, bag + ' ' + id + ' is act 1');
        }
      });
    });
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
      if (typeof e.ai !== 'function') t.ok(e.ai && typeof e.ai === 'object' && !!e.ai.style, L + ': explicit AI style (' + JSON.stringify(e.ai) + ')');
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
          if (typeof Lv[k] === 'number' && k !== 'len') t.ok(new RegExp('(^|[^0-9])' + Lv[k] + '([^0-9]|$)').test(d), L + ': desc shows ' + k + ' ' + Lv[k] + ' — ' + d);
        });
      }
    });
    // anchors are mixed across the roster, big hits are delayed
    const anchors = {};
    mySkills().forEach(function (s) { anchors[s.anchor] = (anchors[s.anchor] || 0) + 1; });
    t.ok(anchors.self >= 5 && anchors.ground >= 2 && anchors.unit >= 5, 'mixed anchors ' + JSON.stringify(anchors));
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
      (en.reinforcements || []).forEach(function (w) { (w.enemies || []).forEach(function (e) { t.ok(!!DD.getEnemy(e.id), L + ': wave enemy ' + e.id); }); });
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
  T.suite('enemies_act1: every skill fires as an intent (damage == desc)', function (t) {
    const from = DD.problems.length;
    // Rat: 2 + Bleed 1; Pack Tactics +1 per other rat next to the victim (max +2)
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_rat', x: 3, y: 4 }] });
    let h = H('test_mage'), e = U('a1_rat');
    let hp = h.hp;
    fire(e, 'a1_rat_nibble', { x: 4, y: 4 });
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

    // Goblin Grunt: Pointy Stick hits both tiles (friend, foe, object); Rock Toss tracks
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
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_gob_grunt', x: 2, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_gob_grunt'), 'a1_gob_rock', h);
    t.eq(hp - h.hp, 4, 'rock toss: 4');

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

    // Kobold Union Rep: Strike Action buffs allies within 2 (and itself); memo tracks
    sb({ heroes: [{ id: 'test_mage', x: 8, y: 8 }], enemies: [{ id: 'a1_kobold_rep', x: 4, y: 4 }, { id: 'a1_gob_grunt', x: 5, y: 5 }, { id: 'a1_gob_grunt', x: 4, y: 7 }] });
    const rep = U('a1_kobold_rep'), near = U('a1_gob_grunt', 0), far = U('a1_gob_grunt', 1);
    fire(rep, 'a1_rep_strike', rep);
    t.ok(near.block === 4 && DD.Act.hasStatus(near, 'inspired') && DD.Act.getStatus(near, 'inspired').turns === 2, 'strike action: ally within 2 gets 4 Block + Inspired 2');
    t.ok(rep.block === 4 && DD.Act.hasStatus(rep, 'inspired'), 'strike action: the Rep too');
    t.ok(far.block === 0 && !DD.Act.hasStatus(far, 'inspired'), 'strike action: ally 3 tiles away gets nothing');
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

    // Spore Bro: 6 poison to adjacent units (friends too), poison cloud, dies; poison-immune slime shrugs
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_spore_bro', x: 4, y: 4 }, { id: 'a1_gob_kid', x: 5, y: 4 }, { id: 'a1_slime', x: 4, y: 5 }] });
    h = H('test_mage'); hp = h.hp;
    const bro = U('a1_spore_bro'), gg = U('a1_gob_kid'), sl = U('a1_slime');
    fire(bro, 'a1_spore_boom', bro);
    t.eq(hp - h.hp, 6, 'sporesplosion: 6 to the hero');
    t.eq(gg.maxHp - gg.hp, 6, 'sporesplosion: 6 to the friendly goblin kid too');
    t.eq(sl.hp, sl.maxHp, 'sporesplosion: the poison-immune slime takes nothing');
    t.ok(bro.dead, 'sporesplosion: the Spore Bro dies');
    t.ok(DD.Act.hasStatus(h, 'poison') && DD.Act.getStatus(h, 'poison').stacks >= 2, 'sporesplosion: Poison 2 from the cloud');
    t.eq(DD.Grid.tile(4, 4).surface && DD.Grid.tile(4, 4).surface.id, 'poison', 'sporesplosion: poison cloud on its tile');
    t.eq(DD.Combat.state.units.filter(function (u) { return u.defId === 'a1_slimelet'; }).length, 0, 'the slime survived, no split');

    // Cellar Spider: cross web (2 + Root 1 + webs 3 rounds), bite 5 / 8 vs Rooted
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }, { id: 'test_cleric', x: 5, y: 5 }, { id: 'test_rogue', x: 7, y: 7 }], enemies: [{ id: 'a1_spider', x: 1, y: 4 }] });
    a = H('test_mage'); b = H('test_cleric'); ha = a.hp; hb = b.hp;
    const sp = U('a1_spider');
    fire(sp, 'a1_spider_web', { x: 5, y: 4 }, { anchor: 'ground' });
    t.ok(ha - a.hp === 2 && hb - b.hp === 2, 'web spit: 2 to both foes in the cross');
    t.ok(DD.Act.hasStatus(a, 'root') && DD.Act.hasStatus(b, 'root') && DD.Act.getStatus(a, 'root').turns === 1, 'web spit: Root 1');
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
    fire(cr, 'a1_critic_review', h);
    t.eq(h.hp, hp, 'silenced critic: Bad Review fizzles');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_critic', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_critic'), 'a1_critic_lute', { x: 4, y: 4 });
    t.eq(hp - h.hp, 6, 'lute to the face: 6');
    noErrors(t, from, 'normal enemies');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: elite skills (tongue, CHOMP, slams, throws, engulf)', function (t) {
    const from = DD.problems.length;
    // Mimic: tongue in a straight line pulls next to it; out of line it misses
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_mimic', x: 1, y: 4 }] });
    let h = H('test_mage'), hp = h.hp;
    const m = U('a1_mimic');
    let it = DD.AI.makeIntent(m, 'a1_mimic_tongue', h, { noCooldown: true });
    t.eq(it.anchor, 'unit', 'tongue tracks its target');
    act(function () { DD.AI.executeIntent(m, it); });
    t.eq(hp - h.hp, 4, 'tongue: 4 damage');
    t.ok(h.x === 2 && h.y === 4, 'tongue: pulled next to the mimic (' + key(h) + ')');
    t.ok(DD.Act.hasStatus(h, 'root') && DD.Act.getStatus(h, 'root').turns === 1 && DD.Act.getStatus(h, 'root').source === m.id, 'tongue: Rooted 1 turn next to its mouth');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_mimic', x: 1, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const m2 = U('a1_mimic');
    it = DD.AI.makeIntent(m2, 'a1_mimic_tongue', h, { noCooldown: true });
    act(function () { DD.Act.teleport(h, 4, 5); });
    act(function () { DD.AI.executeIntent(m2, it); });
    t.ok(h.hp === hp && h.x === 4 && h.y === 5, 'tongue: stepping out of line dodges it');
    // CHOMP: 9 + swallows up to 4 gold; it all comes back when the mimic dies
    sb({ gold: 10, heroes: [{ id: 'test_mage', x: 2, y: 4 }], enemies: [{ id: 'a1_mimic', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const m3 = U('a1_mimic');
    fire(m3, 'a1_mimic_chomp', { x: 2, y: 4 });
    t.eq(hp - h.hp, 9, 'CHOMP: 9');
    t.eq(DD.Act.gold(), 6, 'CHOMP: party gold 10 → 6');
    t.eq(m3.data.gold, 4, 'CHOMP: the mimic holds 4 gold');
    DD.Combat.state.sandboxGold = 2;
    act(function () { DD.Act.heal(null, h, 20); });
    fire(m3, 'a1_mimic_chomp', { x: 2, y: 4 });
    t.ok(DD.Act.gold() === 0 && m3.data.gold === 6, 'CHOMP: a broke party loses what it has (2)');
    act(function () { DD.Act.kill(m3, h); });
    t.eq(DD.Act.gold(), 6, 'dead mimic coughs up all 6 swallowed gold');
    // Lid Slam: 7 to everything around (diagonals too), knockback 1
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }, { id: 'test_cleric', x: 5, y: 5 }, { id: 'test_rogue', x: 4, y: 6 }], enemies: [{ id: 'a1_mimic', x: 4, y: 4 }] });
    const a = H('test_mage'), b = H('test_cleric'), c = H('test_rogue');
    const ha = a.hp, hb = b.hp, hc = c.hp;
    fire(U('a1_mimic'), 'a1_mimic_slam', U('a1_mimic'));
    t.ok(ha - a.hp === 7 && hb - b.hp === 7 && hc === c.hp, 'lid slam: 7 to the orthogonal and diagonal neighbours only');
    t.ok(a.x === 6 && a.y === 4, 'lid slam: knocked back 1 (' + key(a) + ')');

    // Bugbear: throw 3 down the line; wall bump 4 both; pit; friend in the way
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'a1_bugbear', x: 2, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const bb = U('a1_bugbear');
    it = DD.AI.makeIntent(bb, 'a1_bugbear_bounce', { x: 3, y: 4 }, { noCooldown: true });
    t.eq(DD.AI.intentTiles(bb, it).map(key).join(' '), '3,4 4,4 5,4 6,4', 'bounce telegraph: the grab tile + the 3-tile throw path');
    act(function () { DD.AI.executeIntent(bb, it); });
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
    // Bear Hug: 4 + Root 1 to every adjacent foe; then the throw cannot be sidestepped
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 4, y: 5 }, { id: 'test_rogue', x: 6, y: 6 }], enemies: [{ id: 'a1_bugbear', x: 4, y: 4 }, { id: 'a1_gob_grunt', x: 5, y: 4 }] });
    const hg1 = H('test_mage'), hg2 = H('test_cleric'), hg3 = H('test_rogue'), pal = U('a1_gob_grunt');
    const g1h = hg1.hp, g2h = hg2.hp, g3h = hg3.hp;
    fire(U('a1_bugbear'), 'a1_bugbear_hug', U('a1_bugbear'));
    t.ok(g1h - hg1.hp === 4 && g2h - hg2.hp === 4 && g3h === hg3.hp, 'bear hug: 4 to each adjacent hero only');
    t.ok(DD.Act.hasStatus(hg1, 'root') && DD.Act.hasStatus(hg2, 'root') && DD.Act.getStatus(hg1, 'root').turns === 1, 'bear hug: grabbed (Rooted 1)');
    t.ok(pal.hp === pal.maxHp && !DD.Act.hasStatus(pal, 'root'), 'bear hug: his goblin pal is spared');
    t.eq(DD.Combat.reachable(hg1).size, 0, 'grabbed hero cannot step out of the throw line');
    sb({ heroes: [{ id: 'test_mage', x: 6, y: 4 }, { id: 'test_cleric', x: 6, y: 5 }], enemies: [{ id: 'a1_bugbear', x: 1, y: 4 }, { id: 'a1_rat', x: 7, y: 4 }], objects: [{ x: 5, y: 4, id: 'crate' }] });
    const s1 = H('test_mage'), s2 = H('test_cleric'), rat = U('a1_rat');
    const s1h = s1.hp, s2h = s2.hp;
    it = DD.AI.makeIntent(U('a1_bugbear'), 'a1_bugbear_stool', { x: 6, y: 4 }, { anchor: 'ground', delay: 1, noCooldown: true });
    t.ok(it.delay === 1 && it.pending && it.anchor === 'ground', 'bar stool: delayed, ground-anchored');
    act(function () { DD.AI.executeIntent(U('a1_bugbear'), it); });
    t.eq(s1.hp, s1h, 'bar stool: nothing yet (charging)');
    act(function () { DD.AI.executeIntent(U('a1_bugbear'), it); });
    t.ok(s1h - s1.hp === 6 && s2h - s2.hp === 6, 'bar stool: 6 to both heroes in radius 1');
    t.eq(rat.hp, 3, 'bar stool: friendly fire on the rat too (9 - 6)');
    t.ok(!DD.Grid.tile(5, 4).obj, 'bar stool: smashes the crate in the area (6 HP)');

    // Cube: Engulf 7 + Rooted, −1 AP, 3 acid per turn; 10 damage to the cube spits them out
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_knight', x: 7, y: 7 }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const cube = U('a1_cube');
    fire(cube, 'a1_cube_engulf', { x: 3, y: 4 });
    t.eq(hp - h.hp, 7, 'engulf: 7');
    const en = DD.Act.getStatus(h, 'a1_engulfed');
    t.ok(en && en.turns === 2 && DD.Act.hasStatus(h, 'root'), 'engulf: Engulfed + Rooted for 2 turns');
    t.eq(DD.Combat.reachable(h).size, 0, 'engulfed hero cannot move');
    // next player phase: acid + AP drain
    DD.Combat.state.units.forEach(function (u) { if (u.side === 'hero') u.ap = 0; });
    cube.intents = [];
    hp = h.hp;
    DD.Combat.endTurn();
    t.ok(h.hp <= hp - 3, 'engulfed: 3 acid at the start of its turn (' + (hp - h.hp) + ')');
    t.eq(h.ap, h.maxAp - 1, 'engulfed: −1 AP');
    const kn = H('test_knight');
    act(function () { DD.Act.teleport(kn, 4, 3); DD.Act.damage(kn, cube, 6, { cause: 'skill', ignoreArmor: true }); });
    t.ok(DD.Act.hasStatus(h, 'a1_engulfed'), '6 damage: not enough yet');
    act(function () { DD.Act.damage(kn, cube, 5, { cause: 'skill', ignoreArmor: true }); });
    t.ok(!DD.Act.hasStatus(h, 'a1_engulfed') && !DD.Act.hasStatus(h, 'root'), '10+ damage to the cube: spat out (Engulfed and its Root gone)');
    t.ok(DD.Combat.reachable(h).size > 0 || h.ap === 0, 'freed hero can move again');
    t.eq(kn.maxHp - kn.hp, 4, 'acidic body: 2 acid back per adjacent hit (ignores armor)');
    const knh = kn.hp;
    act(function () { DD.Act.teleport(kn, 4, 1); DD.Act.damage(kn, cube, 4, { cause: 'skill' }); });
    t.eq(kn.hp, knh, 'acidic body: hitting it from range is safe');
    // immovable + stun immune
    act(function () { DD.Act.push(kn, cube, { x: 0, y: 1 }, 2); DD.Act.addStatus(cube, 'stun', { turns: 1 }, kn); });
    t.ok(cube.x === 4 && cube.y === 4 && !DD.Act.hasStatus(cube, 'stun'), 'cube: immovable and stun immune');
    // engulf ends when the cube dies or the victim is moved away
    fire(cube, 'a1_cube_engulf', { x: 3, y: 4 });
    t.ok(DD.Act.hasStatus(h, 'a1_engulfed'), 're-engulfed');
    act(function () { DD.Act.teleport(h, 1, 1); });
    t.ok(!DD.Act.hasStatus(h, 'a1_engulfed'), 'teleported away: released');
    act(function () { DD.Act.teleport(h, 3, 4); });
    fire(cube, 'a1_cube_engulf', { x: 3, y: 4 });
    act(function () { DD.Act.kill(cube, kn); });
    t.ok(!DD.Act.hasStatus(h, 'a1_engulfed'), 'cube dies: released');
    // spit + bones; jiggle slam
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 7 }], enemies: [{ id: 'a1_cube', x: 4, y: 3 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_cube'), 'a1_cube_spit', h);
    t.eq(hp - h.hp, 4, 'spit: 4');
    t.eq(DD.Grid.tile(4, 7).obj && DD.Grid.tile(4, 7).obj.id, 'bones', 'spit: leaves bones');
    t.ok(DD.Grid.isWalkable(4, 7), 'bones do not block');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 5 }, { id: 'test_cleric', x: 4, y: 3 }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    const j1 = H('test_mage'), j2 = H('test_cleric'), j1h = j1.hp, j2h = j2.hp;
    fire(U('a1_cube'), 'a1_cube_slam', U('a1_cube'));
    t.ok(j1h - j1.hp === 8 && j2h - j2.hp === 8, 'jiggle slam: 8 around (diagonal + orthogonal)');
    noErrors(t, from, 'elites');
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

    // strike funds: hazard pay Block at round end; smashing spills 3 gold; destroy objective wins
    sb({ gold: 0, heroes: [{ id: 'test_mage', x: 1, y: 7 }], enemies: [{ id: 'a1_gob_grunt', x: 4, y: 3 }, { id: 'a1_gob_grunt', x: 8, y: 8 }],
      objects: [{ x: 4, y: 2, id: 'a1_strike_fund' }, { x: 1, y: 6, id: 'a1_strike_fund' }],
      objective: { type: 'destroy', objId: 'a1_strike_fund', count: 2 }, encounter: null });
    const nearG = U('a1_gob_grunt', 0), farG = U('a1_gob_grunt', 1);
    DD.Combat.state.units.forEach(function (u) { u.intents = []; if (u.side === 'hero') u.ap = 0; });
    DD.Combat.endTurn();
    t.ok(nearG.block >= 2 && farG.block === 0, 'strike fund: enemies within 2 get 2 Block at round end (near ' + nearG.block + ', far ' + farG.block + ')');
    h = H('test_mage');
    h.ap = 3;
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
  T.suite('enemies_act1: AI plans valid, readable intents', function (t) {
    const from = DD.problems.length;
    const planned = {};
    enemyDefs().forEach(function (def) {
      DD.Combat.sandbox({ w: 11, h: 11, seed: 4, objective: { type: 'custom' }, encounter: { id: 'a1_ai_probe', checkObjective: function () { return null; } },
        heroes: PARTY.map(function (id, i) { return { id: id, x: 1 + (i % 2), y: 3 + i, level: 3 }; }),
        enemies: [{ id: def.id, x: 7, y: 5 }, { id: 'a1_gob_grunt', x: 8, y: 2 }] });
      const s = DD.Combat.state;
      const e = s.units.filter(function (u) { return u.defId === def.id; })[0];
      for (let r = 0; r < 4 && !s.result && !e.dead; r++) {
        (e.intents || []).forEach(function (it) {
          planned[def.id] = (planned[def.id] || 0) + 1;
          const L = def.id + ' r' + s.round + ' ' + it.skillId;
          t.ok(def.skills.indexOf(it.skillId) >= 0, L + ': its own skill');
          const d = DD.AI.describe(e, it);
          t.ok(d && d.label && d.text && d.text.length > 20 && d.icon, L + ': describe() readable');
          const tiles = DD.AI.intentTiles(e, it);
          t.ok(tiles.length > 0 && tiles.every(function (p) { return DD.Grid.inBounds(p.x, p.y); }), L + ': telegraph tiles in bounds');
          if (it.delay > 0 || it.pending) t.ok(!!DELAYED[it.skillId], L + ': only the big hits are delayed');
          if (DELAYED[it.skillId] && !it.data.redirected) t.ok(it.pending, L + ': big hit planned with a delay');
          if (it.anchor === 'unit') {
            const tu = DD.Combat.byId(it.unitId);
            const rg = DD.Targeting.range(e, DD.getSkill(it.skillId), it.level || 1);
            const dd = tu ? DD.Grid.dist(e, tu) : -1;
            t.ok(tu && dd >= rg[0] && dd <= rg[1], L + ': tracked target in range at planning (' + dd + ' in ' + rg + ')');
          }
          if (it.anchor === 'self' && DD.getSkill(it.skillId).target.type !== 'self') {
            t.ok(Math.abs(it.rel.dx) + Math.abs(it.rel.dy) >= 1, L + ': self-anchored attack aims away from itself');
          }
        });
        s.units.forEach(function (u) { if (u.side === 'hero') u.ap = 0; });
        DD.Combat.endTurn();
      }
      t.ok(planned[def.id] > 0 || e.dead, def.id + ' planned intents within 4 rounds (' + (planned[def.id] || 0) + ')');
    });
    // Rep: buff when friends are near, memo when alone
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 4, y: 8 }], enemies: [{ id: 'a1_kobold_rep', x: 4, y: 3 }, { id: 'a1_gob_grunt', x: 5, y: 3 }] });
    t.eq((U('a1_kobold_rep').intents[0] || {}).skillId, 'a1_rep_strike', 'rep calls Strike Action with an ally in reach');
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 4, y: 7 }], enemies: [{ id: 'a1_kobold_rep', x: 4, y: 2 }] });
    t.eq((U('a1_kobold_rep').intents[0] || {}).skillId, 'a1_rep_memo', 'rep alone files a memo instead');
    // Mimic: two heroes in reach → Lid Slam with a delay + a CHOMP now
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 5, y: 5 }], enemies: [{ id: 'a1_mimic', x: 4, y: 4 }] });
    let mi = U('a1_mimic');
    const slam = mi.intents.filter(function (i) { return i.skillId === 'a1_mimic_slam'; })[0];
    t.ok(slam && slam.delay === 1 && slam.pending, 'mimic: Lid Slam telegraphed one round ahead');
    t.ok(mi.intents.some(function (i) { return i.skillId === 'a1_mimic_chomp'; }), 'mimic: also CHOMPs an adjacent hero');
    t.ok(mi.x === 4 && mi.y === 4, 'mimic: stays put when the crowd comes to it');
    // Mimic: a hero in a straight line at range → tongue
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 8, y: 1 }], enemies: [{ id: 'a1_mimic', x: 1, y: 8 }], terrain: function (tl) { if (tl.y === 5 && tl.x < 8) tl.t = 'wall'; } });
    mi = U('a1_mimic');
    t.ok(mi.intents.length === 0 || mi.intents.every(function (i) { return DD.getSkill(i.skillId); }), 'mimic far away: only valid intents');
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 4, y: 8 }], enemies: [{ id: 'a1_mimic', x: 4, y: 1 }] });
    mi = U('a1_mimic');
    const tg = mi.intents.filter(function (i) { return i.skillId === 'a1_mimic_tongue'; })[0];
    t.ok(tg && (mi.x === 4 || mi.y === 8), 'mimic lines up for a Sticky Tongue (' + key(mi) + ')');
    // Bugbear: a hero next to a pit gets thrown into it
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 4, y: 4 }, { id: 'test_cleric', x: 6, y: 6 }], enemies: [{ id: 'a1_bugbear', x: 2, y: 4 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 5) tl.t = 'pit'; } });
    const bb = U('a1_bugbear');
    const bounce = bb.intents.filter(function (i) { return i.skillId === 'a1_bugbear_bounce'; })[0];
    t.ok(bounce && bounce.rel && bounce.rel.dy === 1 && bb.x === 4 && bb.y === 3, 'bugbear: walks around to throw the hero into the pit (' + key(bb) + ' ' + JSON.stringify(bounce && bounce.rel) + ')');
    const stool = bb.intents.filter(function (i) { return i.skillId === 'a1_bugbear_stool'; })[0];
    t.ok(stool && stool.delay === 1 && stool.anchor === 'ground' && stool.abs.x === 6 && stool.abs.y === 6, 'bugbear: lobs a delayed stool at the hero in the back');
    // elites walk around walls toward the party (walking distance, not as the crow flies)
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 1, y: 7 }], enemies: [{ id: 'a1_mimic', x: 1, y: 1 }],
      terrain: function (tl) { if (tl.y === 3 && tl.x < 7) tl.t = 'wall'; } });
    const walker = U('a1_mimic');
    t.ok(walker.x > 1 && walker.y <= 2, 'mimic heads for the gap in the wall instead of hugging it (' + key(walker) + ')');
    // Cube: digesting → it does not wander off
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 8, y: 8 }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    const cube = U('a1_cube');
    fire(cube, 'a1_cube_engulf', { x: 3, y: 4 });
    DD.Combat.state.units.forEach(function (u) { if (u.side === 'hero') u.ap = 0; });
    DD.Combat.endTurn();
    t.ok(cube.x === 4 && cube.y === 4, 'cube: stays put while digesting');
    t.ok(cube.intents.every(function (i) { return i.skillId !== 'a1_cube_engulf' || DD.Grid.dist(AIT(cube, i), { x: 3, y: 4 }) !== 0; }), 'cube: does not re-engulf the hero it already holds');
    noErrors(t, from, 'AI');
  });
  function AIT(u, it) { return DD.AI.intentTarget(u, it) || { x: -9, y: -9 }; }

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: HUD previews against act 1 enemies match reality', function (t) {
    const from = DD.problems.length;
    const F = T.contentHelpers.fingerprint;
    /** Preview the hero's slot at target, then use it for real: preview must be side-effect free and exact. */
    function check(label, hero, slot, x, y) {
      const s = DD.Combat.state;
      hero.ap = 3;
      const fp = F(s);
      const prev = DD.Combat.preview(hero, slot, x, y);
      t.eq(F(s), fp, label + ': preview leaves the state untouched');
      const before = {};
      s.units.forEach(function (u) { before[u.id] = { hp: u.hp, dead: !!u.dead, statuses: u.statuses.map(function (q) { return q.id; }).sort().join() }; });
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
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_rogue', x: 4, y: 3, skills: ['test_shiv'] }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    const cube = U('a1_cube'), m2 = U('test_mage'), rog = U('test_rogue');
    fire(cube, 'a1_cube_engulf', { x: 3, y: 4 });
    cube.data.jiggle = 8;
    p = check('stab frees the engulfed mage', rog, rog.basic, 4, 4);
    t.ok(p.perUnit[m2.id] && p.perUnit[m2.id].removed.indexOf('a1_engulfed') >= 0 && !DD.Act.hasStatus(m2, 'a1_engulfed'), 'preview + reality: the mage is spat out');
    // a mimic holding gold dies: party gold comes back in preview and reality alike
    sb({ gold: 0, heroes: [{ id: 'test_mage', x: 2, y: 4 }], enemies: [{ id: 'a1_mimic', x: 5, y: 4, hpMult: 0.01 }] });
    U('a1_mimic').data.gold = 5;
    mage = U('test_mage');
    check('bolt kills the mimic', mage, mage.basic, 5, 4);
    t.eq(DD.Act.gold(), 5, 'mimic gold returned');
    noErrors(t, from, 'previews');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('enemies_act1: odd states (charm, silence, sheep, dazzle, confuse, taunt, root, stun) and empty targets', function (t) {
    const from = DD.problems.length;
    const STS = ['charmed', 'silenced', 'sheep', 'dazzled', 'confused', 'taunt', 'root', 'stun', 'slow', 'weak'];
    let runs = 0;
    enemyDefs().forEach(function (def) {
      STS.forEach(function (st, i) {
        DD.Combat.sandbox({ w: 10, h: 10, seed: 3 + i, noPlan: true, objective: { type: 'custom' }, encounter: { id: 'a1_odd', checkObjective: function () { return null; } },
          heroes: PARTY.map(function (h, k) { return { id: h, x: 2 + k, y: 6 + (k % 2), level: 3 }; }),
          enemies: [{ id: def.id, x: 4, y: 4 }, { id: 'a1_rat', x: 6, y: 4 }, { id: 'a1_gob_grunt', x: 3, y: 3 }],
          terrain: function (tl) { if (tl.x === 7 && tl.y === 7) tl.t = 'pit'; if (tl.x === 1 && tl.y === 1) tl.t = 'lava'; } });
        const s = DD.Combat.state;
        const e = s.units.filter(function (u) { return u.defId === def.id; })[0];
        const h = s.units.filter(function (u) { return u.kind === 'hero'; })[0];
        act(function () { DD.Act.addStatus(e, st, { stacks: 2, turns: 2 }, h); DD.AI.planAll(); });
        for (let r = 0; r < 2 && !s.result; r++) {
          (e.intents || []).forEach(function (it) {
            const d = DD.AI.describe(e, it);
            if (!d || !d.text || !isFinite(d.dmg)) t.fail(def.id + ' +' + st + ': describe() broken');
          });
          s.units.forEach(function (u) { if (u.side === 'hero') u.ap = 0; });
          DD.Combat.endTurn();
          runs++;
          T.contentHelpers.sanity(t, def.id + ' +' + st + ' r' + r);
        }
      });
      // every skill with an empty target tile, no target at all, and a dead user
      def.skills.forEach(function (sid) {
        sb({ heroes: [{ id: 'test_mage', x: 8, y: 8 }], enemies: [{ id: def.id, x: 3, y: 3 }] });
        const e = U(def.id);
        const it = DD.AI.makeIntent(e, sid, { x: 3, y: 5 }, { noCooldown: true });
        act(function () { DD.AI.executeIntent(e, it); });
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
  // Review regressions: each block failed (or the mechanic never fired) before the review fixes in act1.js / ai.js.
  T.suite('enemies_act1: review fixes (honest telegraphs, webbed bites, hops, digestion, keg raids)', function (t) {
    const from = DD.problems.length;
    function endRound() { DD.Combat.state.units.forEach(function (u) { if (u.side === 'hero') u.ap = 0; }); DD.Combat.endTurn(); }
    function shown(list) {
      let n = 0;
      list.forEach(function (e) { (e.intents || []).forEach(function (it) { n += DD.AI.describe(e, it).dmg; }); });
      return n;
    }

    // Pack Tactics in the telegraph (core fix: a skill's telegraphFlat in DD.AI.intentDmg): the numbers are the bites
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_rat', x: 4, y: 1 }, { id: 'a1_rat', x: 7, y: 4 }, { id: 'a1_rat', x: 1, y: 4 }] });
    let rats = DD.Combat.state.units.filter(function (u) { return u.defId === 'a1_rat'; });
    let h = H('test_mage'), hp = h.hp;
    t.ok(rats.every(function (r) { return DD.Grid.dist(r, h) === 1 && r.intents.length === 1; }), 'three rats surround the mage and plan a bite each');
    t.eq(shown(rats), 12, 'rat telegraphs: 2 + 2 packmates each (12 total)');
    endRound();
    t.eq(hp - h.hp, 12, 'the three bites deal exactly the telegraphed 12');
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_rat', x: 4, y: 1 }, { id: 'a1_rat', x: 7, y: 4 }] });
    rats = DD.Combat.state.units.filter(function (u) { return u.defId === 'a1_rat'; });
    t.eq(shown(rats), 6, 'two rats: 3 + 3');
    act(function () { DD.Act.kill(rats[1], null); });
    t.eq(shown([rats[0]]), 2, 'a packmate dies: the telegraph drops to the lone 2 at once');

    // Spider: the web's Root wears off at the end of the hero's turn, before the bite planned on it lands; the web
    // under the stuck hero does not, so the +3 (and its telegraph) still hold
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }, { id: 'test_knight', x: 8, y: 8 }], enemies: [{ id: 'a1_spider', x: 2, y: 4 }] });
    const sp = U('a1_spider');
    h = H('test_mage');
    DD.AI.makeIntent(sp, 'a1_spider_web', { x: 5, y: 4 }, { anchor: 'ground' });
    endRound();
    const bite = sp.intents.filter(function (i) { return i.skillId === 'a1_spider_bite'; })[0];
    t.ok(!!bite && DD.Act.hasStatus(h, 'root') && DD.Grid.dist(sp, h) === 1, 'webbed mage is Rooted and the spider plans a bite next to it');
    t.eq(bite ? DD.AI.describe(sp, bite).dmg : -1, 8, 'the bite telegraph shows 5 + 3 vs webbed prey');
    hp = h.hp;
    endRound();
    t.eq(hp - h.hp, 8, 'the bite lands for 8 although the Root wore off (still standing in the web)');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_spider', x: 4, y: 4 }], surfaces: [{ x: 5, y: 4, id: 'web', turns: 3 }] });
    h = H('test_mage'); hp = h.hp;
    t.ok(!DD.Act.hasStatus(h, 'root'), 'a hero standing in a web without Root');
    fire(U('a1_spider'), 'a1_spider_bite', { x: 5, y: 4 });
    t.eq(hp - h.hp, 8, 'sticky snack vs web-standing prey: 5 + 3');

    // Sticky Tongue: whatever is in the way stops the pull without a bonk; the hit is exactly the telegraphed 4
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_mimic', x: 1, y: 4 }, { id: 'a1_rat', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    const blocker = U('a1_rat');
    fire(U('a1_mimic'), 'a1_mimic_tongue', h);
    t.ok(hp - h.hp === 4 && h.x === 4 && blocker.hp === blocker.maxHp && DD.Act.hasStatus(h, 'root'),
      'tongue over a rat: 4 damage, stops at 4,4 (' + key(h) + ', ' + (hp - h.hp) + '), the rat is not bonked, still Rooted');
    // Lid Slam: the knockback bump into a wall is in the desc now
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_mimic', x: 4, y: 4 }], terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'wall'; } });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_mimic'), 'a1_mimic_slam', U('a1_mimic'));
    const slamDesc = DD.skillDesc(DD.getSkill('a1_mimic_slam'), 1, null);
    t.eq(hp - h.hp, L1('a1_mimic_slam').dmg + L1('a1_mimic_slam').bump, 'lid slam into a wall: 7 + 3 (' + (hp - h.hp) + ')');
    t.ok(/\b3 more\b/.test(slamDesc), 'lid slam desc states the 3 bump damage: ' + slamDesc);

    // CHOMP: tracked, hops 1 tile to bite from 2 away (straight or diagonal); 3 away, Rooted or boxed in: nothing
    sb({ gold: 10, heroes: [{ id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'a1_mimic', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    let mm = U('a1_mimic');
    let it = DD.AI.makeIntent(mm, 'a1_mimic_chomp', h, { noCooldown: true });
    t.eq(it.anchor, 'unit', 'CHOMP tracks its target');
    act(function () { DD.AI.executeIntent(mm, it); });
    t.ok(hp - h.hp === 9 && mm.x === 4 && mm.y === 4 && DD.Act.gold() === 6 && mm.data.gold === 4,
      'CHOMP from 2 tiles: hops to 4,4 (' + key(mm) + '), bites 9 (' + (hp - h.hp) + '), swallows 4 gold');
    sb({ heroes: [{ id: 'test_mage', x: 5, y: 5 }], enemies: [{ id: 'a1_mimic', x: 4, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    mm = U('a1_mimic');
    fire(mm, 'a1_mimic_chomp', h);
    t.ok(hp - h.hp === 9 && DD.Grid.dist(mm, h) === 1 && DD.Grid.dist(mm, { x: 4, y: 4 }) === 1, 'CHOMP diagonal: hops to a corner and bites (' + key(mm) + ')');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_mimic', x: 2, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    mm = U('a1_mimic');
    it = DD.AI.makeIntent(mm, 'a1_mimic_chomp', h, { noCooldown: true });
    act(function () { DD.Act.teleport(h, 5, 4); });
    act(function () { DD.AI.executeIntent(mm, it); });
    t.ok(h.hp === hp && mm.x === 2, 'CHOMP: a target that got 3 tiles away is lost (no hop, no bite)');
    act(function () { DD.Act.teleport(h, 4, 4); DD.Act.addStatus(mm, 'root', { turns: 1 }, h); });
    fire(mm, 'a1_mimic_chomp', h);
    t.ok(h.hp === hp && mm.x === 2, 'CHOMP: a Rooted mimic cannot hop');
    sb({ heroes: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'a1_mimic', x: 2, y: 4 }, { id: 'a1_rat', x: 3, y: 4 }] });
    h = H('test_mage'); hp = h.hp;
    fire(U('a1_mimic'), 'a1_mimic_chomp', h);
    t.ok(h.hp === hp && U('a1_mimic').x === 2, 'CHOMP: no free tile to land on, no bite');

    // Engulf: a second meal does not reset the "10 damage frees everyone" count
    sb({ heroes: [{ id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 5, y: 4 }, { id: 'test_knight', x: 4, y: 3 }], enemies: [{ id: 'a1_cube', x: 4, y: 4 }] });
    const cb = U('a1_cube'), e1 = H('test_mage'), e2 = H('test_cleric'), kn = H('test_knight');
    fire(cb, 'a1_cube_engulf', { x: 3, y: 4 });
    act(function () { DD.Act.damage(kn, cb, 8, { cause: 'skill', ignoreArmor: true }); });
    fire(cb, 'a1_cube_engulf', { x: 5, y: 4 });
    t.ok(DD.Act.hasStatus(e1, 'a1_engulfed') && DD.Act.hasStatus(e2, 'a1_engulfed'), 'the cube holds two heroes');
    act(function () { DD.Act.damage(kn, cb, 2, { cause: 'skill', ignoreArmor: true }); });
    t.ok(!DD.Act.hasStatus(e1, 'a1_engulfed') && !DD.Act.hasStatus(e2, 'a1_engulfed'), '10 damage since the first meal frees both');

    // Open Mic: a grunt goes for the Last Keg (protect objectives value it), and the back-door wave lands near it
    sb({ noPlan: false, heroes: [{ id: 'test_mage', x: 8, y: 0 }], enemies: [{ id: 'a1_gob_grunt', x: 4, y: 5 }],
      objects: [{ x: 4, y: 8, id: 'keg', hp: 18, label: 'The Last Keg' }], objective: { type: 'protect', objId: 'keg' }, encounter: null });
    const gr = U('a1_gob_grunt');
    const poke = gr.intents.filter(function (i) { return i.skillId === 'a1_gob_poke'; })[0];
    t.ok(!!poke && DD.AI.intentTiles(gr, poke).some(function (p) { return p.x === 4 && p.y === 8; }), 'grunt lines its spear up on the keg');
    endRound();
    const kegTile = DD.Grid.tile(4, 8);
    t.eq(kegTile.obj && kegTile.obj.hp, 12, 'keg poked: 18 → 12');
    const om = DD.getEncounter('a1_open_mic');
    const party = PARTY.map(function (id) { return DD.Combat.makeRunHero({ id: id, level: 2 }); });
    const setup = DD.Encounter.build(om, party, { rng: DD.RNG('a1keg:' + t.seed), difficulty: 'normal', act: 1 });
    DD.Combat.start(setup, { seed: 7, headless: true, difficulty: 'normal', kind: 'normal' });
    const s = DD.Combat.state;
    const n0 = s.units.length;
    endRound();
    const wave = s.units.slice(n0).filter(function (u) { return !u.dead; });
    const keg = s.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'keg'; })[0];
    t.eq(wave.length, 2, 'round 2: the back-door wave arrives (' + wave.map(function (u) { return u.defId + '@' + key(u); }).join(' ') + ')');
    t.ok(!!keg && wave.every(function (u) { return u.y >= 6 && DD.Grid.dist(u, keg) <= 6; }), 'it comes in behind the party, within a walk of the keg');
    noErrors(t, from, 'review fixes');
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
            t.ok(kegs.length === 1 && kegs[0].obj.hp === 18 && kegs[0].obj.label === 'The Last Keg', L + ': exactly one Last Keg (18 HP)');
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
  /** AutoPlay the fixture party at `level` through an encounter. Returns { result, rounds, taken, downs, violations }. */
  function sim(en, level, seed) {
    const party = PARTY.map(function (id) { return DD.Combat.makeRunHero({ id: id, level: level }); });
    const setup = DD.Encounter.build(en, party, { rng: DD.RNG('a1sim:' + seed), difficulty: 'normal', act: 1 });
    let out = null;
    const w = T.contentHelpers.watchTelegraphs(function (w) {
      DD.Combat.start(setup, { seed: DD.RNG('a1simc:' + seed).int(1, 1e9), headless: true, difficulty: 'normal', kind: en.kind });
      w.arm();
      const s = DD.Combat.state;
      const res = DD.AutoPlay.runBattle(30);
      let taken = 0;
      s.units.forEach(function (u) { if (u.side === 'hero' && u.kind === 'hero') taken += (s.stats.units[u.id] || {}).taken || 0; });
      out = { result: res.result, rounds: res.rounds, timeout: !!res.timeout, taken: taken, downs: s.stats.downs || 0 };
    });
    out.violations = w.violations.filter(function (v, i) { return w.violations.indexOf(v) === i; });
    return out;
  }
  const SIM = {};   // per kind: { wins, total, rounds, taken } (normal runs first, elites compare against it)
  function simSuite(t, kind) {
    const from = DD.problems.length;
    const runs = Math.max(1, +(t.param('n', 2)) || 2);
    const encs = ENCOUNTERS.map(DD.getEncounter).filter(function (e) { return e.kind === kind; });
    const levels = kind === 'elite' ? [2, 3, 4] : [1, 2, 3, 4];
    const agg = { wins: 0, total: 0, rounds: 0, taken: 0, perEnc: [] };
    encs.forEach(function (en) {
      const row = [];
      let encWins = 0, encTotal = 0, encRounds = 0, encTaken = 0;
      levels.forEach(function (lv) {
        let w = 0, r = 0, tk = 0, dn = 0;
        for (let i = 0; i < runs; i++) {
          const res = sim(en, lv, t.seed + ':' + en.id + ':' + lv + ':' + i);
          res.violations.forEach(function (v) { t.fail(en.id + ': ' + v); });
          t.ok(!res.timeout, en.id + ' L' + lv + ' #' + i + ': no timeout (' + res.rounds + ' rounds)');
          if (res.result === 'victory') w++;
          r += res.rounds; tk += res.taken; dn += res.downs;
        }
        row.push('L' + lv + ' ' + w + '/' + runs + ' r' + (r / runs).toFixed(1) + ' dmg' + Math.round(tk / runs) + ' downs' + (dn / runs).toFixed(1));
        encWins += w; encTotal += runs; encRounds += r; encTaken += tk;
      });
      agg.wins += encWins; agg.total += encTotal; agg.rounds += encRounds; agg.taken += encTaken;
      agg.perEnc.push(encTaken / encTotal);
      t.log(en.id + ': ' + row.join(' · ') + ' — avg r' + (encRounds / encTotal).toFixed(1) + ' dmg' + Math.round(encTaken / encTotal));
      t.ok(encWins > 0, en.id + ': winnable (' + encWins + '/' + encTotal + ')');
      t.ok(encRounds / encTotal >= 2.5, en.id + ': not over in a flash (avg ' + (encRounds / encTotal).toFixed(1) + ' rounds)');
      t.ok(encTaken > 0, en.id + ': the enemies land hits (' + encTaken + ' damage over ' + encTotal + ' fights)');
      if (kind === 'normal') t.ok(encWins / encTotal >= 0.5, en.id + ': normal fight won most of the time by the fixture party (' + encWins + '/' + encTotal + ')');
    });
    SIM[kind] = agg;
    t.log(kind + ' TOTAL: won ' + agg.wins + '/' + agg.total + ', avg rounds ' + (agg.rounds / agg.total).toFixed(1) + ', avg damage taken ' + (agg.taken / agg.total).toFixed(1));
    if (kind === 'elite' && SIM.normal) {
      // Elites are the act's hard fights. 1.25× the normal mean (was 2×): since the review a few normal fights (fungus,
      // the keg raid, the union hall) bite nearly as hard by design, and 2 runs per level make single fights noisy
      // (seeds 1-5: elites 1.36-2.6× the normal mean).
      const mean = SIM.normal.taken / SIM.normal.total;
      const sorted = SIM.normal.perEnc.slice().sort(function (a, b) { return a - b; });
      const median = (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
      const elite = agg.taken / agg.total;
      t.ok(elite >= 1.25 * mean, 'elites hurt clearly more than normal fights (' + elite.toFixed(1) + ' vs ' + mean.toFixed(1) + ', median ' + median.toFixed(1) + ')');
      t.ok(agg.rounds / agg.total >= SIM.normal.rounds / SIM.normal.total, 'elites last at least as long as normal fights');
    }
    noErrors(t, from, kind + ' sims');
  }
  T.suite('enemies_act1: autoplay sims (normal encounters, fixture party L1-4)', function (t) { simSuite(t, 'normal'); });
  T.suite('enemies_act1: autoplay sims (elite encounters, fixture party L2-4)', function (t) { simSuite(t, 'elite'); });
})();
