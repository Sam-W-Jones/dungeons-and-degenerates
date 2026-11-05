/* Dungeons and Degenerates — tests/content/hero_basanos.js
 * Suites "hero_basanos: …" for js/data/heroes/basanos.js (owner: hero-basanos): the hero def, the two forms (Transform,
 * form gates, move bonus, basic attack swap, sprite override), the Hair Trigger passive, every skill at every level in
 * v2 sandbox fights (desc == effect), the signature, the 3 items, HUD previews, v2 edge cases (stun / silence / sheep /
 * charm, deaths mid-skill, pits / lava / water / walls / edges, AP, own-turn durations), AutoPlay battles of
 * ['basanos', 'test_knight', 'test_cleric', 'test_mage'] against the fixture encounters at levels 1 / 3 / 5, attacks of
 * opportunity (his reactions in both forms; leaps, swaps and shoves never provoke), the form following bas_wolf
 * (dispels, the Blood Moon look, other content wrapping his sprite) and the review (v2) regressions (the basic slot's
 * use count across form swaps, Hair Trigger after a refused down, the reaction of his real form after a bare dispel).
 * Run: bash tools/test.sh "suite=hero_basanos&isolate=heroes/basanos,hero_basanos"
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const HUMAN = ['bas_silver_slash', 'bas_shoulder_check', 'bas_hold_the_line', 'bas_step_in'];
  const WOLF = ['bas_rend', 'bas_pounce', 'bas_howl', 'bas_savage_bite', 'bas_frenzy'];
  const POOL = ['bas_transform'].concat(HUMAN, WOLF);
  const ALL = ['bas_sword', 'bas_claw', 'bas_blood_moon'].concat(POOL);
  const ITEMS = ['bas_flea_collar', 'bas_wolfsbane_coat', 'bas_moonfang'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const WOLF_GATE = 'Werewolf form only (Transform first).';
  const HUMAN_GATE = 'Human form only (Transform first).';

  // ---- helpers -----------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function Bz() { return DD.Basanos; }
  /** Sandbox that never ends on its own, 9×9 stone, heroes first; enemies pass unless cfg.enemyAi is true. */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = (cfg.heroes || [{ x: 2, y: 4 }]).map(function (h) { return Object.assign({ id: 'basanos', level: 1, skills: [] }, h); });
    DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, enemyAi: false, enemies: [],
      objective: { type: 'custom', text: 'Basanos test' }, encounter: { id: 'bas_test_arena', checkObjective: function () { return null; } },
    }, cfg, { heroes: heroes }));
    return DD.Combat.state;
  }
  function B() { return DD.Combat.heroes().filter(function (u) { return u.defId === 'basanos'; })[0]; }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function foes() { return DD.Combat.enemies(); }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function wolf(u) { return Bz().isWolf(u); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  /** Set the form directly (tests): through the real transformation code, not the skill. */
  function form(u, toWolf) { if (toWolf) Bz().becomeWolf(u, 'skill'); else Bz().becomeHuman(u); }
  /** The slot Basanos uses for a skill: his basic / signature, or a fresh socket at a level (in the right form). */
  function give(u, id, level) {
    if (id === 'bas_blood_moon') return u.signature;
    if (id === 'bas_sword') { form(u, false); return u.basic; }
    if (id === 'bas_claw') { form(u, false); u.skills = [DD.Act.makeSlot('bas_transform', level || 1)]; form(u, true); return u.basic; }
    const def = DD.getSkill(id);
    const f = Bz().formOf(def);
    if (f) form(u, f === 'wolf');
    const sl = DD.Act.makeSlot(id, level || 1);
    u.skills = [sl];
    return sl;
  }
  function use(t, u, sl, x, y, label) {
    const why = DD.Combat.canUse(u, sl);
    const ok = why === true && DD.Combat.useSkill(u, sl, x, y);
    t.ok(ok, (label || sl.id) + ' used @' + x + ',' + y + (why === true ? '' : ' (' + why + ')'));
    return ok;
  }
  function valid(u, sl, x, y) { return DD.Targeting.isValidTarget(u, sl, x, y); }
  function desc(id, level, user) { return DD.skillDesc(DD.getSkill(id), level, user || null); }
  /** Hype gains (amount, reason) recorded while fn runs. */
  function hypeGains(fn) {
    const list = [], orig = DD.Act.gainHype;
    DD.Act.gainHype = function (n, why) { list.push({ n: n, why: String(why || '') }); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.Act.gainHype = orig; }
    return list;
  }
  /** What a unit looks like at the start of each of `unit`'s turns while fn runs: [{ round, ...probe(unit) }]. */
  function atTurnStarts(unit, probe, fn) {
    const out = [];
    const off = DD.Events.on('turn:start', function (e) { if (e.unit === unit) out.push(Object.assign({ round: e.round }, probe())); });
    try { fn(); } finally { off(); }
    return out;
  }
  /**
   * Preview, use for real, then compare HP changes / KOs / movement / Hype (every outcome of his kit is fixed: no dice,
   * so every preview must be certain and exact).
   */
  function previewMatches(t, u, sl, x, y, label) {
    const s = DD.Combat.state;
    const before = {};
    s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed, x: o.x, y: o.y }; });
    const hype0 = s.hype, rng0 = s.rng.getState();
    let prev = null;
    t.tryRun(label + ' preview', function () { prev = DD.Combat.preview(u, sl, x, y); });
    t.ok(!!prev && s.rng.getState() === rng0 && s.hype === hype0 &&
      s.units.every(function (o) { const b = before[o.id]; return b && b.hp === o.hp && b.x === o.x && b.y === o.y; }), label + ': preview left the fight untouched');
    if (!prev) return;
    t.ok(!prev.uncertain, label + ': the preview is certain (no dice in his kit)');
    if (!use(t, u, sl, x, y, label)) return;
    s.units.forEach(function (o) {
      const b = before[o.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[o.id];
      t.eq(b.hp - o.hp, e ? (e.dmg || 0) - (e.heal || 0) : 0, label + ': ' + o.name + ' HP change = preview');
      t.eq((o.dead && !b.dead) || (o.downed && !b.downed), !!(e && e.lethal), label + ': ' + o.name + ' KO = preview');
      if (!o.dead && !(e && e.lethal)) t.eq(o.x !== b.x || o.y !== b.y, !!(e && e.moved), label + ': ' + o.name + ' movement = preview');
    });
    t.eq(s.hype - hype0, prev.hype, label + ': Hype = preview');
  }
  function textOf(h) {
    const parts = [h.blurb, h.role, h.passive.desc];
    ALL.forEach(function (id) { const s = DD.getSkill(id); for (let lv = 1; lv <= s.levels.length; lv++) parts.push(desc(id, lv)); parts.push(s.flavor || ''); });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); parts.push(it.desc, it.flavor || ''); });
    Object.keys(h.barks).forEach(function (k) { Array.prototype.push.apply(parts, h.barks[k]); });
    return parts.join(' \n ');
  }

  // ---- 1. definition --------------------------------------------------------------------------------------
  T.suite('hero_basanos: hero definition, pool, form tags, barks, items, sprites', function (t) {
    const h = DD.getHero('basanos');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.ok(h.name === 'Basanos' && h.epithet && /werewolf/i.test(h.race) && h.cls, 'name, epithet, race (werewolf), class');
    t.ok(h.complexity >= 1 && h.complexity <= 3 && h.role && h.blurb.length > 60 && /^#[0-9a-f]{6}$/i.test(h.color), 'role, complexity, blurb, color');
    t.eq(h.unlock, null, 'available from the start (unlock: null)');
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov === 4 && h.stats.armor === 0, 'stats in DESIGN §5 ranges (28 HP, 3 AP, move 4)');
    t.eq(h.stats.init, 2, 'initiative modifier +2');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth');
    t.eq(h.basic, 'bas_sword', 'basic: Silvered Sword (human form)');
    t.eq(h.signature, 'bas_blood_moon', 'signature: Blood Moon');
    t.eq(DD.getSkill(h.signature).hype, 100, 'the signature costs 100 Hype');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['bas_transform', 'bas_shoulder_check']), 'starting skills: Transform + Shoulder Check');
    t.eq(JSON.stringify(h.skillPool.slice().sort()), JSON.stringify(POOL.slice().sort()), 'pool of 10 (incl. the 2 starting skills)');
    t.ok(h.skillPool.length >= 8 + 1 && h.skillPool.length <= 10, 'pool size 9-10 (DESIGN §6: 8-10, registry 9-11)');
    t.ok(h.passive && h.passive.name === 'Hair Trigger' && /below half HP/.test(h.passive.desc) && h.passive.hooks.onTakeDamage, 'passive Hair Trigger: one rule (below half HP → werewolf)');
    POOL.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'basanos' && s.levels.length === 3, id + ': registered, owner basanos, 3 levels');
      if (!s) return;
      const f = Bz().formOf(s);
      if (HUMAN.indexOf(id) >= 0) t.eq(f, 'human', id + ' is a human skill');
      else if (WOLF.indexOf(id) >= 0) t.eq(f, 'wolf', id + ' is a wolf skill');
      else t.eq(f, null, id + ' works in both forms');
      for (let lv = 1; lv <= 3; lv++) t.ok(desc(id, lv).split(/\s+/).length <= 28, id + ' L' + lv + ' desc reads in one breath (' + desc(id, lv) + ')');
      if (f) t.ok(desc(id, 1).indexOf(f === 'wolf' ? 'Werewolf form:' : 'Human form:') === 0, id + ': its desc names its form');
    });
    t.eq(Bz().formOf(DD.getSkill('bas_sword')), 'human', 'the sword is the human basic');
    t.eq(Bz().formOf(DD.getSkill('bas_claw')), 'wolf', 'the claw is the wolf basic');
    t.eq(Bz().formOf(DD.getSkill('bas_blood_moon')), null, 'Blood Moon works in both forms');
    // barks: every key 4-6 lines, ≤ 70 characters, plus his form barks
    BARK_KEYS.concat(['wolf', 'human', 'trigger']).forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ': 4-6 lines (' + lines.length + ')');
      lines.forEach(function (l) { t.ok(typeof l === 'string' && l.length > 0 && l.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(l)); });
    });
    // pronouns: he/him; nothing of his kit calls anybody "she"
    const text = textOf(h);
    t.ok(!/\b(she|her|hers|herself)\b/i.test(text), 'no she/her anywhere in his texts (he/him)');
    t.ok(/\bhe\b/i.test(h.blurb) && /\bhe\b/.test(h.passive.desc), 'blurb and passive say "he"');
    // items
    t.eq(ITEMS.filter(function (id) { const it = DD.getItem(id); return it && it.hero === 'basanos'; }).length, 3, '3 hero items');
    const rar = ITEMS.map(function (id) { return DD.getItem(id).rarity; });
    t.ok(rar.indexOf('rare') >= 0 && rar.indexOf('legendary') >= 0, 'at least one rare and one legendary item (' + rar.join(', ') + ')');
    ITEMS.forEach(function (id) { const it = DD.getItem(id); t.ok(!it.stats.block, id + ': no starting Block (v2)'); });
    // sprites: two valid, distinct SpriteSpecs; portraits paint
    const probs = T.contentHelpers && T.contentHelpers.spriteProblems;
    if (probs) {
      t.eq(probs(Bz().HUMAN_SPRITE).length, 0, 'human sprite valid ' + JSON.stringify(probs(Bz().HUMAN_SPRITE)));
      t.eq(probs(Bz().WOLF_SPRITE).length, 0, 'werewolf sprite valid ' + JSON.stringify(probs(Bz().WOLF_SPRITE)));
    }
    t.ok(h.sprite === Bz().HUMAN_SPRITE && Bz().WOLF_SPRITE !== h.sprite && Bz().WOLF_SPRITE.scale > h.sprite.scale, 'the werewolf is a different, bigger sprite');
    t.ok(h.sprite.mainhand === 'sword' && h.sprite.head.beard === 'stubble', 'human: silvered sword and stubble');
    t.ok(Bz().WOLF_SPRITE.tail === 'dog' && Bz().WOLF_SPRITE.head.ears !== 'none' && Bz().WOLF_SPRITE.head.eyes === 'glow', 'werewolf: ears, tail, glowing eyes');
    if (DD.Sprites && DD.Sprites.portrait) {
      t.tryRun('portraits', function () {
        const p = DD.Sprites.portrait('basanos', 64);
        t.ok(!!p && p.width > 0, 'portrait renders');
        const c = document.createElement('canvas');
        c.width = 120; c.height = 120;
        ['idle', 'attack', 'hurt', 'downed', 'cast'].forEach(function (pose) {
          DD.Sprites.draw(c.getContext('2d'), Bz().WOLF_SPRITE, 60, 100, 2, { pose: pose, t: 1 });
          DD.Sprites.draw(c.getContext('2d'), Bz().HUMAN_SPRITE, 60, 100, 2, { pose: pose, t: 1, facing: -1 });
        });
      });
    }
  });

  // ---- 2. the two forms ------------------------------------------------------------------------------------
  T.suite('hero_basanos: Transform swaps forms (move, basic attack, sprite, form gates)', function (t) {
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform', 'bas_silver_slash', 'bas_rend', 'bas_howl'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const u = B(), g = foes()[0];
    t.ok(DD.Combat.current() === u && u.ap === 3, 'his turn, 3 AP');
    t.ok(!wolf(u) && u.basic.id === 'bas_sword' && u.mov === 4 && !u.sprite, 'every fight starts human: sword, move 4, no sprite override');
    const tr = u.skills[0], slash = u.skills[1], rend = u.skills[2], howl = u.skills[3];
    t.eq(DD.Combat.canUse(u, rend), WOLF_GATE, 'wolf skills are locked in human form, with a clear reason');
    t.eq(DD.Combat.canUse(u, howl), WOLF_GATE, 'Howl too');
    t.eq(DD.Combat.canUse(u, slash), true, 'human skills are ready');
    const reach0 = DD.Combat.reachable(u).size;
    t.ok(use(t, u, tr, u.x, u.y, 'Transform'), 'Transform used');
    t.ok(wolf(u) && has(u, 'bas_wolf'), 'he is the werewolf (status bas_wolf)');
    t.eq(u.ap, 2, 'Transform cost 1 AP');
    t.eq(u.mov, 6, '+2 move');
    t.ok(DD.Combat.reachable(u).size > reach0, 'he reaches more tiles');
    t.ok(u.basic.id === 'bas_claw' && u.basic.level === 1, 'basic attack is Claw (Transform level 1)');
    t.ok(u.sprite === Bz().WOLF_SPRITE && u.vis && !u.vis.sprite, 'sprite override: unit.sprite is the werewolf; the on-screen pin is released once playback caught up');
    t.ok(DD.Sprites && DD.Sprites.specFor ? DD.Sprites.specFor(u) === Bz().WOLF_SPRITE : true, 'the renderer draws the werewolf');
    t.eq(DD.Combat.canUse(u, slash), HUMAN_GATE, 'human skills are locked in werewolf form');
    t.eq(DD.Combat.canUse(u, rend), true, 'wolf skills are ready');
    t.eq(DD.Combat.canUse(u, tr), true, 'Transform works in both forms');
    // the form stays for good (no duration): across his turns
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && wolf(u) && u.mov === 6 && u.ap === 3, 'still the werewolf on his next turn (no duration)');
    t.ok(use(t, u, tr, u.x, u.y, 'Transform back'), 'Transform back');
    t.ok(!wolf(u) && u.mov === 4 && u.basic.id === 'bas_sword' && !u.sprite && (!DD.Sprites || DD.Sprites.specFor(u) === Bz().HUMAN_SPRITE), 'human again: move 4, sword, human sprite');
    t.ok(use(t, u, tr, u.x, u.y, 'Transform a third time') && use(t, u, tr, u.x, u.y, 'and a fourth'), 'cooldown 0: he can swap again the same turn');
    t.eq(u.ap, 0, 'each swap costs 1 AP');
    t.eq(DD.Combat.canUse(u, tr), 'Not enough AP.', 'no AP, no swap');
    t.ok(g && !g.dead, 'the grunt watched, horrified');
    // the Claw follows Transform's level
    [1, 2, 3].forEach(function (lv) {
      fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'bas_transform', level: lv }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      const v = B();
      use(t, v, v.skills[0], v.x, v.y, 'Transform L' + lv);
      const L = Bz().CLAW_LV[lv - 1];
      t.ok(v.basic.id === 'bas_claw' && v.basic.level === lv, 'Transform L' + lv + ' → Claw L' + lv);
      t.ok(desc('bas_transform', lv).indexOf('Claw (' + L.dmg + ' damage, ' + L.bleed + ' Bleed)') >= 0, 'Transform L' + lv + ' desc shows the Claw numbers (' + desc('bas_transform', lv) + ')');
    });
    // a dispel takes the wolf away: he is human again from his next turn start (bookkeeping follows the status)
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    const w = B();
    use(t, w, w.skills[0], w.x, w.y, 'Transform');
    DD.Act.cleanse(w, 'buff');
    t.ok(!wolf(w), 'dispelled');
    DD.Combat.endTurn();
    t.ok(!wolf(w) && w.basic.id === 'bas_sword' && w.mov === 4 && !w.sprite, 'his next turn: back to sword, move 4, human sprite');
  });

  // ---- 3. Hair Trigger ----------------------------------------------------------------------------------------
  T.suite('hero_basanos: Hair Trigger (below half HP → werewolf, free)', function (t) {
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const u = B(), g = foes()[0];
    t.eq(u.maxHp, 28, '28 max HP');
    A().damage(g, u, 14, { cause: 'other' });
    t.ok(u.hp === 14 && !wolf(u), 'exactly half (14/28): still human');
    const ap0 = u.ap;
    A().damage(g, u, 1, { cause: 'other' });
    t.ok(u.hp === 13 && wolf(u), 'below half: the werewolf gets out');
    t.ok(u.ap === ap0 && u.basic.id === 'bas_claw' && u.mov === 6, 'free: no AP spent; Claw and +2 move at once');
    A().damage(g, u, 2, { cause: 'other' });
    t.ok(wolf(u) && u.hp === 11, 'already a wolf: nothing changes');
    // transforming back while low: the next real hit turns him again; a fully blocked hit does not
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const v = B(), g2 = foes()[0];
    v.hp = 10;
    t.ok(!wolf(v), 'low HP alone does nothing (it takes damage)');
    A().addBlock(v, 5);
    A().damage(g2, v, 3, { cause: 'other' });
    t.ok(!wolf(v) && v.hp === 10, 'a hit fully absorbed by Block (no HP lost) does not trigger it');
    A().damage(g2, v, 3, { cause: 'other' });
    t.ok(wolf(v) && v.hp === 9, 'HP lost below half (2 blocked, 1 through): triggered (' + v.hp + ')');
    use(t, v, v.skills[0], v.x, v.y, 'Transform back while low');
    t.ok(!wolf(v), 'human again (for now)');
    A().damage(g2, v, 1, { cause: 'other' });
    t.ok(wolf(v), 'the next hit sets him off again');
    // lethal damage: downed, not a wolf; Help Up brings back the man
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const d = B(), k = hero('test_knight');
    d.hp = 20;
    A().damage(foes()[0], d, 20, { cause: 'other' });
    t.ok(d.downed && !wolf(d), 'a lethal hit downs him (no wolf)');
    A().revive(d, 0.5);
    t.ok(!d.downed && !wolf(d) && d.basic.id === 'bas_sword' && !d.sprite, 'revived: human with his sword');
    // downed while a wolf: the status is wiped and the bookkeeping follows (move, basic, sprite)
    form(d, true);
    t.ok(wolf(d) && d.mov === 6, 'a wolf again');
    A().damage(foes()[0], d, 99, { cause: 'other' });
    t.ok(d.downed && !wolf(d) && d.mov === 4 && d.basic.id === 'bas_sword' && !d.sprite, 'downed while a wolf: back to the man (move 4, sword, human sprite)');
    t.ok(k && !k.downed, 'the knight is fine');
    // triggered on an enemy's turn: the grunt's stab puts him below half; on his next turn he is the werewolf
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], enemyAi: true });
    const e = B();
    e.hp = 15;
    const seen = atTurnStarts(e, function () { return { wolf: wolf(e), basic: e.basic.id, mov: e.mov }; }, function () { DD.Combat.endTurn(); });
    t.ok(e.hp < 15, 'the grunt stabbed him on its turn (' + e.hp + ' HP)');
    t.ok(seen.length === 1 && seen[0].wolf && seen[0].basic === 'bas_claw' && seen[0].mov === 6, 'his next turn starts in werewolf form ' + JSON.stringify(seen));
    // the Wolfsbane-Lined Coat heals when Hair Trigger fires (not on a chosen Transform)
    fight({ heroes: [{ x: 2, y: 4, items: ['bas_wolfsbane_coat'], skills: ['bas_transform'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const c = B();
    t.eq(c.maxHp, 32, 'Coat: +4 max HP');
    use(t, c, c.skills[0], c.x, c.y, 'Transform (coat)');
    t.eq(c.hp, 32, 'a chosen Transform does not heal');
    use(t, c, c.skills[0], c.x, c.y, 'Transform back (coat)');
    A().damage(foes()[0], c, 17, { cause: 'other' });
    t.ok(wolf(c) && c.hp === 15 + Bz().COAT_HEAL, 'Hair Trigger with the Coat: 15 HP + ' + Bz().COAT_HEAL + ' (' + c.hp + ')');
  });

  // ---- 4. basic attacks --------------------------------------------------------------------------------------
  T.suite('hero_basanos: Silvered Sword and Claw (desc == effect at every level)', function (t) {
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    let u = B(), f = foes()[0];
    const hp0 = f.hp;
    t.ok(/deal 5 damage/.test(desc('bas_sword', 1)), 'sword desc: 5 damage');
    use(t, u, u.basic, f.x, f.y, 'Silvered Sword');
    t.eq(hp0 - f.hp, 5 - 1, 'sword: 5 damage (− 1 armor on the brute)');
    t.eq(u.ap, 2, '1 AP');
    t.ok(use(t, u, u.basic, f.x, f.y, 'again') && use(t, u, u.basic, f.x, f.y, 'and again'), 'no cooldown: three swings a turn');
    t.ok(!valid(u, u.basic, 5, 4), 'melee only');
    [1, 2, 3].forEach(function (lv) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      u = B(); f = foes()[0];
      const sl = give(u, 'bas_claw', lv), L = Bz().CLAW_LV[lv - 1];
      t.ok(desc('bas_claw', lv).indexOf('deal ' + L.dmg + ' damage') >= 0 && desc('bas_claw', lv).indexOf('apply ' + L.bleed + ' Bleed') >= 0, 'Claw L' + lv + ' desc: ' + desc('bas_claw', lv));
      const h0 = f.hp;
      use(t, u, sl, f.x, f.y, 'Claw L' + lv);
      t.eq(h0 - f.hp, L.dmg, 'Claw L' + lv + ': ' + L.dmg + ' damage');
      t.eq(st(f, 'bleed') && st(f, 'bleed').stacks, L.bleed, 'Claw L' + lv + ': ' + L.bleed + ' Bleed');
    });
  });

  // ---- 5. human skills ---------------------------------------------------------------------------------------
  T.suite('hero_basanos: Silver Slash and Shoulder Check at every level (pits, lava, water, walls, edges, Bleed)', function (t) {
    [{ dmg: 8, turns: 1 }, { dmg: 10, turns: 1 }, { dmg: 12, turns: 2 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
      const u = B(), f = foes()[0];
      const sl = give(u, 'bas_silver_slash', lv);
      t.ok(desc('bas_silver_slash', lv).indexOf('deal ' + L.dmg + ' damage') >= 0 && desc('bas_silver_slash', lv).indexOf('Vulnerable for ' + plural(L.turns, 'turn')) >= 0, 'Silver Slash L' + lv + ' desc');
      const h0 = f.hp;
      use(t, u, sl, f.x, f.y, 'Silver Slash L' + lv);
      t.eq(h0 - f.hp, L.dmg - 1, 'L' + lv + ': ' + L.dmg + ' damage (− 1 armor)');
      t.eq(u.ap, 1, 'L' + lv + ': 2 AP');
      t.ok(has(f, 'vulnerable'), 'L' + lv + ': Vulnerable');
      t.eq(DD.Combat.canUse(u, sl), 'On cooldown (1).', 'L' + lv + ': cooldown 1');
      // it lasts exactly the foe's next L.turns turns
      const seen = atTurnStarts(f, function () { return { v: has(f, 'vulnerable') }; }, function () { for (let k = 0; k < L.turns + 1; k++) DD.Combat.endTurn(); });
      t.ok(seen.slice(0, L.turns).every(function (x) { return x.v; }), 'L' + lv + ': Vulnerable during its next ' + plural(L.turns, 'turn') + ' ' + JSON.stringify(seen));
      t.ok(!has(f, 'vulnerable'), 'L' + lv + ': gone after them');
    });
    [{ dmg: 5, push: 1 }, { dmg: 6, push: 1 }, { dmg: 7, push: 2 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      const u = B(), f = foes()[0];
      const sl = give(u, 'bas_shoulder_check', lv);
      t.ok(desc('bas_shoulder_check', lv).indexOf('deal ' + L.dmg + ' damage') >= 0 && desc('bas_shoulder_check', lv).indexOf('push it ' + plural(L.push, 'tile')) >= 0, 'Shoulder Check L' + lv + ' desc');
      const h0 = f.hp;
      use(t, u, sl, f.x, f.y, 'Shoulder Check L' + lv);
      t.eq(h0 - f.hp, L.dmg, 'L' + lv + ': ' + L.dmg + ' damage');
      t.ok(f.x === 3 + L.push && f.y === 4, 'L' + lv + ': pushed ' + L.push + ' (now ' + f.x + ',' + f.y + ')');
      t.eq(u.ap, 2, 'L' + lv + ': 1 AP');
    });
    // into a pit: YEET (environmental kill, Hype)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'pit'; } });
    let u = B(), f = foes()[0];
    let sl = give(u, 'bas_shoulder_check', 1);
    const gains = hypeGains(function () { use(t, u, sl, 3, 4, 'Shoulder Check into a pit'); });
    t.ok(f.dead, 'pit: the grunt is yeeted');
    t.ok(gains.some(function (g) { return /environmental/.test(g.why); }), 'an environmental kill (Hype)');
    // into lava: 8 fire + Burn
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'lava'; } });
    u = B(); f = foes()[0];
    sl = give(u, 'bas_shoulder_check', 1);
    let h0 = f.hp;
    use(t, u, sl, 3, 4, 'Shoulder Check into lava');
    t.ok(f.x === 4 && h0 - f.hp === 5 + 8 && has(f, 'burn'), 'lava: pushed in, burned (' + (h0 - f.hp) + ' damage, Burn)');
    // into water: Wet (lightning combos)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'water'; } });
    u = B(); f = foes()[0];
    use(t, u, give(u, 'bas_shoulder_check', 1), 3, 4, 'Shoulder Check into water');
    t.ok(f.x === 4 && has(f, 'wet'), 'water: Wet');
    // into a wall / the map edge / another foe: blocked, bump damage
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'wall'; } });
    u = B(); f = foes()[0]; h0 = f.hp;
    use(t, u, give(u, 'bas_shoulder_check', 1), 3, 4, 'Shoulder Check into a wall');
    t.ok(f.x === 3 && h0 - f.hp === 5 + 3, 'wall: stays, 5 + 3 bump damage (' + (h0 - f.hp) + ')');
    fight({ heroes: [{ x: 7, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 4 }] });
    u = B(); f = foes()[0]; h0 = f.hp;
    use(t, u, give(u, 'bas_shoulder_check', 3), 8, 4, 'Shoulder Check at the map edge');
    t.ok(f.x === 8 && h0 - f.hp === 7 + 3, 'edge: stays, 7 + 3 bump damage (' + (h0 - f.hp) + ')');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
    u = B();
    const a = at(3, 4), b = at(4, 4), ha = a.hp, hb = b.hp;
    use(t, u, give(u, 'bas_shoulder_check', 1), 3, 4, 'Shoulder Check into a friend of his');
    t.ok(ha - a.hp === 8 && hb - b.hp === 3, 'both foes bonk (5 + 3 / 3)');
    // combo: Bleed ticks on the push
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B(); f = foes()[0];
    A().addStatus(f, 'bleed', { stacks: 3 }, u);
    h0 = f.hp;
    use(t, u, give(u, 'bas_shoulder_check', 1), 3, 4, 'Shoulder Check a bleeding foe');
    t.eq(h0 - f.hp, 5 + 3, 'Bleed ticks on the push (+3)');
  });

  T.suite('hero_basanos: Hold the Line and Step In at every level (taunt, Block until his next turn)', function (t) {
    [{ r: 2, block: 4 }, { r: 2, block: 5 }, { r: 3, block: 6 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 3, y: 2 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 3, y: 8 }] });
      const u = B();
      const near = at(4, 4), two = at(3, 2), three = at(6, 4), far = at(3, 8);
      const sl = give(u, 'bas_hold_the_line', lv);
      t.ok(desc('bas_hold_the_line', lv).indexOf('within ' + plural(L.r, 'tile')) >= 0 && desc('bas_hold_the_line', lv).indexOf('gain ' + L.block + ' Block') >= 0, 'Hold the Line L' + lv + ' desc');
      use(t, u, sl, u.x, u.y, 'Hold the Line L' + lv);
      t.eq(u.block, L.block, 'L' + lv + ': ' + L.block + ' Block');
      t.ok(has(near, 'taunt') && has(two, 'taunt') && has(three, 'taunt') === (L.r >= 3) && !has(far, 'taunt'), 'L' + lv + ': taunts foes within ' + L.r + ' (not 4 away)');
      t.eq(st(near, 'taunt').source, u.id, 'L' + lv + ': taunted onto him');
      t.eq(DD.Combat.canUse(u, sl), 'On cooldown (2).', 'L' + lv + ': cooldown 2');
    });
    // the taunt works on the foe's turn: it stabs him, not the wounded mage next to it; his Block soaks it and lasts until his next turn
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_hold_the_line'] }, { id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], enemyAi: true });
    const u = B(), m = hero('test_mage'), g = foes()[0];
    m.hp = 4;
    use(t, u, u.skills[0], u.x, u.y, 'Hold the Line');
    t.ok(has(g, 'taunt'), 'taunted');
    const hp0 = u.hp, mhp = m.hp;
    let after = null;
    const offEnd = DD.Events.on('turn:end', function (e) { if (e.unit === g) after = { block: u.block, hp: u.hp }; });
    const during = atTurnStarts(g, function () { return { block: u.block, taunt: has(g, 'taunt') }; }, function () { DD.Combat.endTurn(); DD.Combat.endTurn(); });
    offEnd();
    t.ok(during.length === 1 && during[0].block === 4 && during[0].taunt, 'during the grunt\'s turn: still 4 Block, still taunted ' + JSON.stringify(during));
    t.eq(m.hp, mhp, 'the 4-HP mage is left alone');
    t.ok(!!after && after.hp === hp0 && after.block === 0, 'it stabbed Basanos: 4 damage, all into his 4 Block ' + JSON.stringify(after));
    t.ok(DD.Combat.current() === u && u.block === 0 && !has(g, 'taunt'), 'his next turn: Block expired, taunt gone');
    // Step In
    [{ range: 3, block: 4 }, { range: 4, block: 5 }, { range: 5, block: 6 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_mage', x: 1 + L.range, y: 4 }, { id: 'test_cleric', x: 2 + L.range, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const v = B(), mg = hero('test_mage'), cl = hero('test_cleric');
      const sl = give(v, 'bas_step_in', lv);
      t.ok(desc('bas_step_in', lv).indexOf('within ' + plural(L.range, 'tile')) >= 0 && desc('bas_step_in', lv).indexOf('gain ' + L.block + ' Block') >= 0, 'Step In L' + lv + ' desc');
      t.ok(valid(v, sl, mg.x, mg.y) && !valid(v, sl, cl.x, cl.y), 'L' + lv + ': an ally within ' + L.range + ' (not beyond)');
      use(t, v, sl, mg.x, mg.y, 'Step In L' + lv);
      t.ok(v.x === 1 + L.range && mg.x === 1, 'L' + lv + ': swapped');
      t.eq(v.block, L.block, 'L' + lv + ': ' + L.block + ' Block');
      t.eq(v.ap, 2, 'L' + lv + ': 1 AP');
    });
    // an immovable ally (or a corgi) still swaps: he asked nicely
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    const w = B(), kn = hero('test_knight');
    kn.flags.immovable = true;
    use(t, w, give(w, 'bas_step_in', 1), 3, 4, 'Step In with an immovable ally');
    t.ok(w.x === 3 && kn.x === 1, 'swapped anyway');
  });

  // ---- 6. wolf skills ------------------------------------------------------------------------------------------
  T.suite('hero_basanos: Rend, Savage Bite and Frenzy at every level', function (t) {
    [{ dmg: 3, bleed: 3 }, { dmg: 4, bleed: 4 }, { dmg: 5, bleed: 5 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      const u = B(), f = foes()[0];
      const sl = give(u, 'bas_rend', lv);
      t.ok(desc('bas_rend', lv).indexOf('deal ' + L.dmg + ' damage') >= 0 && desc('bas_rend', lv).indexOf('apply ' + L.bleed + ' Bleed') >= 0, 'Rend L' + lv + ' desc');
      const h0 = f.hp;
      use(t, u, sl, f.x, f.y, 'Rend L' + lv);
      t.eq(h0 - f.hp, L.dmg, 'L' + lv + ': ' + L.dmg + ' damage');
      t.eq(st(f, 'bleed').stacks, L.bleed, 'L' + lv + ': ' + L.bleed + ' Bleed');
      t.eq(u.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(DD.Combat.canUse(u, sl), 'On cooldown (1).', 'L' + lv + ': cooldown 1');
    });
    // Bleed bites when the foe walks on its turn
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }], enemyAi: true });
    const r = B(), g = foes()[0];
    r.ap = 10;
    use(t, r, give(r, 'bas_rend', 1), 2, 4, 'Rend');
    use(t, r, give(r, 'bas_transform', 1), r.x, r.y, 'Transform');
    use(t, r, give(r, 'bas_shoulder_check', 3), 2, 4, 'Shoulder Check (push 2)');
    const hb = g.hp;
    DD.Combat.endTurn();
    t.ok(g.dead || hb - g.hp >= 2, 'the bleeding grunt walked back to him and bled (' + (hb - g.hp) + ')');
    [{ dmg: 9, heal: 6 }, { dmg: 11, heal: 8 }, { dmg: 13, heal: 10 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_brute', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 3 }] });
      const u = B(), br = at(3, 4), gr = at(2, 3);
      const sl = give(u, 'bas_savage_bite', lv);
      t.ok(desc('bas_savage_bite', lv).indexOf('deal ' + L.dmg + ' damage') >= 0 && desc('bas_savage_bite', lv).indexOf('heal ' + L.heal) >= 0, 'Savage Bite L' + lv + ' desc');
      u.hp = 10;
      const h0 = br.hp;
      use(t, u, sl, br.x, br.y, 'Savage Bite L' + lv + ' (no kill)');
      t.eq(h0 - br.hp, L.dmg - 1, 'L' + lv + ': ' + L.dmg + ' damage (− 1 armor)');
      t.eq(u.hp, 10, 'L' + lv + ': no kill, no heal');
      u.ap = 3;
      sl.cd = 0;
      gr.hp = 3;
      use(t, u, sl, gr.x, gr.y, 'Savage Bite L' + lv + ' (kill)');
      t.ok(gr.dead && u.hp === 10 + L.heal, 'L' + lv + ': the kill heals ' + L.heal + ' (' + u.hp + ')');
    });
    [{ dmg: 4, bleed: 1 }, { dmg: 5, bleed: 1 }, { dmg: 6, bleed: 2 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 4, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 5, y: 5 }, { id: 'test_grunt', x: 6, y: 4 }] });
      const u = B(), k = hero('test_knight');
      const sl = give(u, 'bas_frenzy', lv);
      t.ok(desc('bas_frenzy', lv).indexOf('deal ' + L.dmg + ' damage') >= 0 && desc('bas_frenzy', lv).indexOf('apply ' + L.bleed + ' Bleed') >= 0, 'Frenzy L' + lv + ' desc');
      const hp = {};
      foes().forEach(function (f) { hp[f.id] = f.hp; });
      const kh = k.hp;
      use(t, u, sl, u.x, u.y, 'Frenzy L' + lv);
      const hit = foes().filter(function (f) { return hp[f.id] - f.hp === L.dmg && st(f, 'bleed') && st(f, 'bleed').stacks === L.bleed; });
      t.eq(hit.length, 3, 'L' + lv + ': the 3 adjacent foes take ' + L.dmg + ' + ' + L.bleed + ' Bleed');
      t.ok(hp[at(5, 5).id] === at(5, 5).hp && hp[at(6, 4).id] === at(6, 4).hp, 'L' + lv + ': diagonal and distant foes are untouched');
      t.eq(k.hp, kh, 'L' + lv + ': the adjacent ally is untouched');
      t.eq(u.ap, 1, 'L' + lv + ': 2 AP');
    });
  });

  T.suite('hero_basanos: Pounce and Howl at every level (landing, Stun and Inspired last the right own turns)', function (t) {
    [{ dmg: 4, range: 3 }, { dmg: 6, range: 4 }, { dmg: 8, range: 5 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_brute', x: 1 + L.range, y: 4 }, { id: 'test_grunt', x: 2 + L.range, y: 5 }] });
      const u = B(), f = at(1 + L.range, 4), far = at(2 + L.range, 5);
      const sl = give(u, 'bas_pounce', lv);
      t.ok(desc('bas_pounce', lv).indexOf('within ' + plural(L.range, 'tile')) >= 0 && desc('bas_pounce', lv).indexOf('deal ' + L.dmg + ' damage') >= 0, 'Pounce L' + lv + ' desc');
      t.ok(valid(u, sl, f.x, f.y) && !valid(u, sl, far.x, far.y), 'L' + lv + ': range ' + L.range);
      const h0 = f.hp;
      use(t, u, sl, f.x, f.y, 'Pounce L' + lv);
      t.ok(u.x === f.x - 1 && u.y === 4, 'L' + lv + ': lands on the near side (' + u.x + ',' + u.y + ')');
      t.eq(h0 - f.hp, L.dmg - 1, 'L' + lv + ': ' + L.dmg + ' damage (− 1 armor)');
      t.ok(has(f, 'stun'), 'L' + lv + ': Stunned');
      t.eq(u.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(DD.Combat.canUse(u, sl), 'On cooldown (3).', 'L' + lv + ': cooldown 3');
    });
    // the stunned foe loses exactly its next turn
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], enemyAi: true });
    let u = B(), g = foes()[0];
    use(t, u, give(u, 'bas_pounce', 1), 4, 4, 'Pounce');
    let hp0 = u.hp;
    DD.Combat.endTurn();
    t.ok(u.hp === hp0 && !has(g, 'stun'), 'its next turn: lost (no stab), the stun wore off');
    DD.Combat.endTurn();
    t.ok(u.hp < hp0, 'the turn after, it stabs again');
    // landing: never into a pit or onto a hazard when a safe tile exists; no room → not a valid target; adjacent → no leap
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'pit'; if (tl.x === 4 && tl.y === 3) tl.t = 'lava'; } });
    u = B(); g = foes()[0];
    use(t, u, give(u, 'bas_pounce', 1), 4, 4, 'Pounce past a pit');
    t.ok(!u.downed && DD.Grid.dist(u, g) === 1 && tile(u.x, u.y).t === 'stone' && u.hp === u.maxHp,
      'lands next to it on safe ground, not in the pit or the lava (' + u.x + ',' + u.y + ')');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 4, y: 5 }] });
    u = B();
    let sl = give(u, 'bas_pounce', 1);
    t.ok(!valid(u, sl, 4, 4), 'a surrounded foe is not a valid target');
    t.eq(DD.Targeting.pure(function () { return DD.getSkill('bas_pounce').target.canTarget(DD.Targeting.buildCtx(u, sl, { x: 4, y: 4 })); }), 'No room to land.', 'reason: no room to land');
    t.ok(valid(u, sl, 3, 4), 'the outer one is fine');
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    u = B();
    use(t, u, give(u, 'bas_pounce', 1), 4, 4, 'Pounce an adjacent foe');
    t.ok(u.x === 3 && u.y === 4 && has(foes()[0], 'stun'), 'adjacent: no leap, still the Stun');
    // corner of the map: lands inside the board
    fight({ heroes: [{ x: 3, y: 0 }], enemies: [{ id: 'test_grunt', x: 0, y: 0 }] });
    u = B();
    use(t, u, give(u, 'bas_pounce', 1), 0, 0, 'Pounce into the corner');
    t.ok(u.x === 1 && u.y === 0, 'lands at (1,0)');
    // Howl
    [{ r: 2, turns: 1 }, { r: 3, turns: 1 }, { r: 3, turns: 2 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 1 + L.r, y: 4 }, { id: 'test_mage', x: 2 + L.r, y: 4 }], enemies: [{ id: 'test_grunt', x: 2 + L.r, y: 5 }] });
      const w = B(), k = hero('test_knight'), m = hero('test_mage');
      const s2 = give(w, 'bas_howl', lv);
      t.ok(desc('bas_howl', lv).indexOf('within ' + plural(L.r, 'tile')) >= 0 && desc('bas_howl', lv).indexOf('for ' + plural(L.turns, 'turn')) >= 0, 'Howl L' + lv + ' desc');
      use(t, w, s2, w.x, w.y, 'Howl L' + lv);
      t.ok(has(w, 'inspired') && has(k, 'inspired') && !has(m, 'inspired') && !has(foes()[0], 'inspired'), 'L' + lv + ': he and allies within ' + L.r + ' are Inspired (not the far mage, not the foe)');
      t.eq(w.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(DD.Combat.canUse(w, s2), 'On cooldown (3).', 'L' + lv + ': cooldown 3');
      // the knight swings Inspired on its own next turn(s)
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && has(k, 'inspired'), 'L' + lv + ': the knight\'s turn, Inspired');
      const gr = foes()[0], gh = gr.hp;
      k.x = gr.x - 1; k.y = gr.y;
      use(t, k, k.basic, gr.x, gr.y, 'knight slash (Inspired)');
      t.eq(gh - gr.hp, Math.round(5 * 1.25), 'L' + lv + ': Inspired: 5 → 6');
      let left = 0;
      for (let n = 0; n < 4 && has(k, 'inspired'); n++) { DD.Combat.endRound(); left++; }
      t.eq(left, L.turns, 'L' + lv + ': the knight\'s Inspired lasts its next ' + plural(L.turns, 'turn'));
    });
    // on himself (his own turn): this turn and his next one(s)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    u = B();
    use(t, u, give(u, 'bas_howl', 1), u.x, u.y, 'Howl (self)');
    const gr = foes()[0];
    hp0 = gr.hp;
    use(t, u, u.basic, gr.x, gr.y, 'Claw (Inspired)');
    t.eq(hp0 - gr.hp, Math.round(4 * 1.25), 'Inspired this turn: Claw 4 → 5');
    DD.Combat.endTurn();
    t.ok(has(u, 'inspired'), 'still Inspired on his next turn');
    DD.Combat.endTurn();
    t.ok(!has(u, 'inspired'), 'gone after his next turn');
  });

  // ---- 7. signature ----------------------------------------------------------------------------------------------
  T.suite('hero_basanos: Blood Moon (signature)', function (t) {
    fight({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 4, y: 5 }],
      enemies: [{ id: 'test_brute', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 3 }, { id: 'test_grunt', x: 4, y: 2 }, { id: 'test_grunt', x: 7, y: 4 }] });
    const s = DD.Combat.state, u = B(), k = hero('test_knight');
    const sig = u.signature;
    t.eq(DD.Combat.canUse(u, sig), 'Needs 100 Hype.', 'needs 100 Hype');
    s.hype = 100;
    t.ok(/maul every foe within 2 tiles: 14 damage and 3 Bleed each/.test(desc('bas_blood_moon', 1)), 'desc: ' + desc('bas_blood_moon', 1));
    const br = at(5, 4), g1 = at(3, 3), g2 = at(4, 2), far = at(7, 4);
    const h = { br: br.hp, g1: g1.hp, far: far.hp, k: k.hp };
    t.ok(!wolf(u), 'human before');
    use(t, u, sig, u.x, u.y, 'Blood Moon');
    t.ok(wolf(u) && u.basic.id === 'bas_claw' && u.mov === 6, 'he becomes the werewolf (Claw, +2 move)');
    t.eq(h.br - br.hp, 14 - 1, 'adjacent brute: 14 (− 1 armor)');
    t.ok(g1.dead && g2.dead, 'the grunts within 2 are mauled (14 > 14 HP? both down)');
    t.ok(st(br, 'bleed') && st(br, 'bleed').stacks === 3, 'survivors Bleed 3');
    t.eq(far.hp, h.far, 'the grunt 3 tiles away is untouched');
    t.eq(k.hp, h.k, 'the ally is untouched');
    t.eq(u.ap, 1, '2 AP');
    t.ok(s.hype < 100, 'Hype spent');
    // already a wolf: stays a wolf
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_brute', x: 5, y: 4 }] });
    const w = B();
    form(w, true);
    DD.Combat.state.hype = 100;
    use(t, w, w.signature, w.x, w.y, 'Blood Moon as a wolf');
    t.ok(wolf(w) && w.mov === 6, 'still the werewolf (no double move bonus)');
  });

  // ---- 8. items --------------------------------------------------------------------------------------------------
  T.suite('hero_basanos: items (Flea Collar, Wolfsbane-Lined Coat, Moonfang)', function (t) {
    // Flea Collar: the first Transform each turn is free
    fight({ heroes: [{ x: 2, y: 4, items: ['bas_flea_collar'], skills: ['bas_transform'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    const u = B(), tr = u.skills[0];
    t.eq(DD.Combat.costOf(u, DD.getSkill('bas_transform'), 1).ap, 0, 'Collar: Transform shows 0 AP');
    use(t, u, tr, u.x, u.y, 'free Transform');
    t.ok(wolf(u) && u.ap === 3, 'first Transform: 0 AP');
    t.eq(DD.Combat.costOf(u, DD.getSkill('bas_transform'), 1).ap, 1, 'the second one this turn costs 1 AP');
    use(t, u, tr, u.x, u.y, 'second Transform');
    t.ok(!wolf(u) && u.ap === 2, 'second Transform: 1 AP');
    DD.Combat.endTurn();
    t.eq(DD.Combat.costOf(u, DD.getSkill('bas_transform'), 1).ap, 0, 'next turn: free again');
    t.eq(DD.Combat.costOf(u, DD.getSkill('bas_rend'), 1).ap, 1, 'other skills keep their cost');
    // Moonfang: +10% damage, the Bleed he applies is doubled (and the descs say so)
    fight({ heroes: [{ x: 2, y: 4, items: ['bas_moonfang'] }], enemies: [{ id: 'test_brute', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 3 }] });
    const m = B(), br = at(3, 4), gr = at(2, 3);
    t.ok(Math.abs(m.dmgBonus - 0.1) < 1e-9, 'Moonfang: +10% damage');
    t.ok(desc('bas_rend', 1, m).indexOf('apply 6 Bleed') >= 0 && desc('bas_claw', 1, m).indexOf('apply 2 Bleed') >= 0 && desc('bas_rend', 1).indexOf('apply 3 Bleed') >= 0,
      'descs show the doubled Bleed for him (Rend 6, Claw 2), the base without the sword');
    m.ap = 10;
    use(t, m, give(m, 'bas_rend', 1), br.x, br.y, 'Rend with Moonfang');
    t.eq(st(br, 'bleed').stacks, 6, 'Rend: 3 → 6 Bleed');
    use(t, m, m.basic, gr.x, gr.y, 'Claw with Moonfang');
    t.eq(st(gr, 'bleed').stacks, 2, 'Claw: 1 → 2 Bleed');
    const h0 = gr.hp;
    m.skills[0].cd = 0;
    use(t, m, m.skills[0], gr.x, gr.y, 'Rend the grunt');
    t.eq(h0 - gr.hp, Math.round(3 * 1.1), 'Rend 3 × 1.1 = 3');
    // the Coat is covered by the Hair Trigger suite; it carries no starting Block
    t.eq(DD.getItem('bas_wolfsbane_coat').stats.hp, 4, 'Coat: +4 max HP');
    // equipped in a real (short) fight through the run hero
    ITEMS.forEach(function (id, i) {
      const rh = DD.Combat.makeRunHero({ id: 'basanos', level: 3, items: [id], skills: ['bas_transform', 'bas_rend', 'bas_shoulder_check'] });
      DD.Combat.start({ grid: DD.Combat.emptyGrid(9, 9), heroes: [{ runHero: rh, x: 1, y: 4 }, { id: 'test_knight', x: 1, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_archer', x: 7, y: 6 }] }, { seed: 31 + i, headless: true });
      t.tryRun(id + ' battle', function () { DD.AutoPlay.runBattle(8); });
      t.ok(DD.Combat.heroes()[0].items.indexOf(id) >= 0, id + ' equipped in a fight');
    });
  });

  // ---- 9. previews --------------------------------------------------------------------------------------------
  T.suite('hero_basanos: HUD previews match reality (every skill, every level)', function (t) {
    function arena(extra) {
      return fight(Object.assign({ heroes: [{ x: 3, y: 4, level: 3 }, { id: 'test_knight', x: 3, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_brute', x: 3, y: 3 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_archer', x: 2, y: 5 }],
        terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } }, extra || {}));
    }
    ALL.forEach(function (id) {
      const def = DD.getSkill(id);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        arena();
        const u = B();
        const sl = give(u, id, lv);
        DD.Combat.state.hype = 100;
        u.ap = 3;
        const targets = DD.Targeting.validTargets(u, sl);
        t.ok(targets.length > 0, id + ' L' + lv + ': has targets in the arena');
        targets.slice(0, 3).forEach(function (p, k) {
          arena();
          const v = B();
          const s2 = give(v, id, lv);
          DD.Combat.state.hype = 100;
          v.ap = 3;
          previewMatches(t, v, s2, p.x, p.y, id + ' L' + lv + ' #' + k);
        });
      }
    });
  });

  // ---- 10. edge cases ---------------------------------------------------------------------------------------------
  T.suite('hero_basanos: v2 edge cases (stun, silence, sheep, charm, AP, deaths mid-skill, odd targets)', function (t) {
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform', 'bas_silver_slash', 'bas_shoulder_check', 'bas_hold_the_line'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let u = B(), g = foes()[0];
    // silenced: no spells in his kit, so nothing changes
    A().addStatus(u, 'silenced', { turns: 1 }, g);
    t.ok(u.skills.every(function (sl) { return DD.Combat.canUse(u, sl) === true; }) && DD.Combat.canUse(u, u.basic) === true, 'silenced: every skill still works (none are spells)');
    A().removeStatus(u, 'silenced');
    // sheep: no skills, no Transform
    A().addStatus(u, 'sheep', { turns: 1 }, g);
    t.ok(/^Baa/.test(DD.Combat.canUse(u, u.skills[0])) && /^Baa/.test(DD.Combat.canUse(u, u.basic)), 'sheep: Baa (no Transform, no sword)');
    A().removeStatus(u, 'sheep');
    // stunned: nothing; his next turn passes with 0 AP
    A().addStatus(u, 'stun', { turns: 1 }, g);
    t.eq(DD.Combat.canUse(u, u.skills[0]), 'Stunned!', 'stunned: no Transform');
    const r0 = DD.Combat.state.round;
    let lost = null;
    const offEnd = DD.Events.on('turn:end', function (e) { if (e.unit === u && lost === null) lost = { round: e.round, stun: has(u, 'stun') }; });
    DD.Combat.endTurn();
    offEnd();
    t.ok(!!lost && lost.round === r0, 'his stunned turn ends normally');
    t.eq(DD.Combat.state.round, r0 + 2, 'stunned: his next turn (round ' + (r0 + 1) + ') passed by itself');
    t.ok(DD.Combat.current() === u && u.ap === 3 && !has(u, 'stun'), 'then he is back with 3 AP, the stun gone');
    // charmed by the grunt: −1 AP and no damage to the charmer
    A().addStatus(u, 'charmed', { turns: 1 }, g);
    DD.Combat.endTurn();
    t.eq(u.ap, 2, 'charmed: 3 − 1 AP at his turn start');
    let h0 = g.hp;
    use(t, u, u.basic, g.x, g.y, 'sword vs the charmer');
    t.eq(g.hp, h0, 'charmed: he can\'t hurt the charmer');
    // not enough AP
    u.ap = 1;
    t.eq(DD.Combat.canUse(u, u.skills[1]), 'Not enough AP.', 'Silver Slash with 1 AP: not enough');
    u.ap = 0;
    t.eq(DD.Combat.canUse(u, u.skills[0]), 'Not enough AP.', 'Transform with 0 AP: not enough');
    // targets dying mid-skill
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B(); g = foes()[0];
    g.hp = 2;
    t.tryRun('Silver Slash kill', function () { use(t, u, give(u, 'bas_silver_slash', 1), 3, 4, 'Silver Slash on a 2-HP foe'); });
    t.ok(g.dead && !has(g, 'vulnerable'), 'killed, no Vulnerable on a corpse');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B(); g = foes()[0]; g.hp = 2;
    t.tryRun('Shoulder Check kill', function () { use(t, u, give(u, 'bas_shoulder_check', 1), 3, 4, 'Shoulder Check on a 2-HP foe'); });
    t.ok(g.dead && g.x === 3, 'killed, not pushed');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    u = B(); g = foes()[0]; g.hp = 2;
    t.tryRun('Pounce kill', function () { use(t, u, give(u, 'bas_pounce', 1), 4, 4, 'Pounce on a 2-HP foe'); });
    t.ok(g.dead && u.x === 3, 'killed after the leap');
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    at(5, 4).hp = 1;
    t.tryRun('Frenzy partial kill', function () { use(t, u, give(u, 'bas_frenzy', 1), 4, 4, 'Frenzy with one 1-HP foe'); });
    t.ok(foes().length === 1 && st(foes()[0], 'bleed'), 'one dies, the other bleeds');
    // an immovable foe takes the hit and stays put
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    u = B(); g = foes()[0]; h0 = g.hp;
    use(t, u, give(u, 'bas_shoulder_check', 3), 3, 4, 'Shoulder Check an immovable brute');
    t.ok(g.x === 3 && h0 - g.hp === 7 - 1, 'immovable: 7 damage (− 1 armor), not pushed');
    // a Shoulder Check that pushes a bleeding foe to death
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B(); g = foes()[0]; g.hp = 7;
    A().addStatus(g, 'bleed', { stacks: 3 }, u);
    use(t, u, give(u, 'bas_shoulder_check', 1), 3, 4, 'Shoulder Check: 5 + Bleed 3 on 7 HP');
    t.ok(g.dead, 'the Bleed tick on the push finishes it');
    // odd targets through the raw resolver (null, empty tile, himself) never throw
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    ALL.forEach(function (id) {
      const sl = give(u, id, 1);
      [null, { x: 6, y: 6 }, { x: u.x, y: u.y }, { x: 3, y: 4 }].forEach(function (p) {
        t.tryRun(id + ' execute with ' + JSON.stringify(p), function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, p, { pay: false }); }); });
      });
    });
    t.ok(!u.dead && !u.downed, 'nothing exploded');
    // map corner: every skill's targeting works
    fight({ heroes: [{ x: 0, y: 0, skills: ['bas_transform', 'bas_pounce', 'bas_step_in', 'bas_shoulder_check'] }], enemies: [{ id: 'test_grunt', x: 1, y: 0 }, { id: 'test_grunt', x: 0, y: 1 }] });
    u = B();
    u.skills.forEach(function (sl) { t.tryRun(sl.id + ' targets in the corner', function () { DD.Targeting.validTargets(u, sl); }); });
    h0 = at(1, 0).hp;
    use(t, u, u.skills[3], 1, 0, 'Shoulder Check along the top edge');
    t.ok(at(2, 0) && h0 - at(2, 0).hp === 5, 'pushed along the edge');
  });

  // ---- 11. AutoPlay -------------------------------------------------------------------------------------------
  T.suite('hero_basanos: Transform aiScore (AutoPlay knows when the other form is better)', function (t) {
    // human, the grunt 6 tiles away: only the wolf (move 6) reaches it this turn
    fight({ heroes: [{ x: 1, y: 4, skills: ['bas_transform', 'bas_rend'] }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    let u = B();
    const ctx = DD.Targeting.buildCtx(u, u.skills[0], { x: u.x, y: u.y });
    t.ok(Bz().transformScore(ctx) > 0, 'out of human reach, in wolf reach: transforming is worth something (' + Bz().transformScore(ctx).toFixed(1) + ')');
    // human, adjacent, Silver Slash ready: stay a man
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform', 'bas_silver_slash'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    t.eq(Bz().transformScore(DD.Targeting.buildCtx(u, u.skills[0], { x: u.x, y: u.y })), 0, 'adjacent with Silver Slash ready: no reason to transform');
    // rooted, the grunt 3 tiles away: the man can do nothing, the wolf can still Pounce (a leap is not a move action)
    fight({ heroes: [{ x: 1, y: 4, skills: ['bas_transform', 'bas_pounce'] }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    u = B();
    A().addStatus(u, 'root', { turns: 1 }, foes()[0]);
    t.ok(Bz().transformScore(DD.Targeting.buildCtx(u, u.skills[0], { x: u.x, y: u.y })) > 0, 'rooted, Pounce in wolf reach: worth transforming');
    const g = foes()[0], h0 = g.hp;
    t.tryRun('AutoPlay turn', function () { DD.AutoPlay.takeTurn(); });
    t.ok(wolf(u) && g.hp < h0 && has(g, 'stun'), 'AutoPlay: Transform, then Pounce (' + (wolf(u) ? 'wolf' : 'human') + ', grunt ' + h0 + ' → ' + g.hp + ')');
  });

  function battles(t, plans) {
    const totals = {};
    let fought = 0, wins = 0, skillUses = 0, wolfTurns = 0, manTurns = 0, acted = 0;
    plans.forEach(function (p, i) {
      const enc = DD.getEncounter(p.enc);
      if (!enc) { t.fail('fixture encounter ' + p.enc + ' missing'); return; }
      const sl = Math.min(3, 1 + Math.floor((p.level - 1) / 2));
      const party = ['basanos', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
        if (id === 'basanos') return DD.Combat.makeRunHero({ id: id, level: p.level, items: p.items || [], skills: p.skills.map(function (sid) { return { id: sid, level: sl }; }) });
        const h = DD.getHero(id);
        return DD.Combat.makeRunHero({ id: id, level: p.level, skills: h.startingSkills.map(function (sid) { return { id: sid, level: sl }; }) });
      });
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('bas-ap-' + i + ':' + t.seed), difficulty: 'normal', act: enc.act });
      DD.Combat.start(setup, { seed: 700 + i, headless: true, difficulty: 'normal', kind: enc.kind });
      const counts = {};
      A().addRule({ id: 'bas_usage_probe', name: 'Usage probe', hooks: {
        onSkillUsed: function (ctx) {
          if (A().simulating || !ctx.user || ctx.user.defId !== 'basanos' || !ctx.skill || !DD.getSkill(ctx.skill.id)) return;
          counts[ctx.skill.id] = (counts[ctx.skill.id] || 0) + 1;
        },
        onTurnStart: function (unit) {
          if (A().simulating || !unit || unit.defId !== 'basanos' || unit.downed) return;
          if (wolf(unit)) wolfTurns++; else manTurns++;
        },
      } });
      let r = null;
      t.tryRun(p.enc + ' L' + p.level + ' battle', function () { r = DD.AutoPlay.runBattle(30); });
      A().removeRule('bas_usage_probe');
      if (!r) return;
      fought++;
      if (r.result === 'victory') wins++;
      Object.keys(counts).forEach(function (k) {
        totals[k] = (totals[k] || 0) + counts[k];
        if (k !== 'bas_sword' && k !== 'bas_claw') skillUses += counts[k];
      });
      t.ok(r.rounds > 0 && !r.timeout, p.enc + ' L' + p.level + ': finished (' + r.result + ' in ' + r.rounds + ' rounds)');
      const b = DD.Combat.state.units.filter(function (o) { return o.defId === 'basanos'; })[0];
      if (b) {
        const w = wolf(b), base = DD.Combat.heroStats(b.runHero).mov;
        t.ok(b.mov === base + (w ? 2 : 0) && b.basic.id === (w ? 'bas_claw' : 'bas_sword') && (b.sprite === Bz().WOLF_SPRITE) === w,
          p.enc + ' L' + p.level + ': form bookkeeping consistent at the end (' + (w ? 'wolf' : 'man') + ', move ' + b.mov + ', ' + b.basic.id + ')');
      }
      if (Object.keys(counts).length) acted++;
      t.log(p.enc + ' L' + p.level + ' → ' + r.result + ' in ' + r.rounds + ' rounds; Basanos: ' + JSON.stringify(counts));
    });
    return { totals: totals, fought: fought, wins: wins, uses: skillUses, wolfTurns: wolfTurns, manTurns: manTurns, acted: acted };
  }

  T.suite('hero_basanos: AutoPlay battles, levels 1 / 3 (fixture party)', function (t) {
    const res = battles(t, [
      { enc: 'test_a1_normal', level: 1, skills: ['bas_transform', 'bas_shoulder_check'] },
      { enc: 'test_a1_elite', level: 1, skills: ['bas_transform', 'bas_shoulder_check'] },
      { enc: 'test_a1_normal', level: 3, skills: ['bas_transform', 'bas_shoulder_check', 'bas_pounce'] },
      { enc: 'test_a2_normal', level: 3, skills: ['bas_transform', 'bas_silver_slash', 'bas_rend'] },
      { enc: 'test_a1_boss', level: 3, skills: ['bas_transform', 'bas_hold_the_line', 'bas_savage_bite'] },
      // the swordsman: no Transform socketed, so he stays a man unless Hair Trigger lets the wolf out
      { enc: 'test_a2_elite', level: 3, skills: ['bas_shoulder_check', 'bas_silver_slash', 'bas_hold_the_line'] },
    ]);
    t.log('totals: ' + JSON.stringify(res.totals) + ' · wins ' + res.wins + '/' + res.fought + ' · turns as a wolf ' + res.wolfTurns + ', as a man ' + res.manTurns);
    t.ok(res.acted >= res.fought - 1, 'Basanos acts in (nearly) every fight (' + res.acted + '/' + res.fought + ')');
    t.ok(res.uses >= 5, 'Basanos uses his skills, not just his basic attacks (' + res.uses + ')');
    t.ok(Object.keys(res.totals).length >= 4, 'several different skills used (' + Object.keys(res.totals).length + ')');
    t.ok(res.wolfTurns > 0 && res.manTurns > 0, 'he fights in both forms');
    t.ok(['bas_silver_slash', 'bas_shoulder_check', 'bas_hold_the_line', 'bas_step_in'].some(function (k) { return res.totals[k] > 0; }), 'the swordsman\'s skills get used too');
    t.ok(res.wins >= 4, 'the party mostly wins (' + res.wins + '/' + res.fought + ')');
  });

  T.suite('hero_basanos: AutoPlay battles, level 5 (fixture party, items)', function (t) {
    const res = battles(t, [
      { enc: 'test_a2_elite', level: 5, skills: ['bas_transform', 'bas_hold_the_line', 'bas_frenzy', 'bas_savage_bite'], items: ['bas_moonfang'] },
      { enc: 'test_a3_normal', level: 5, skills: ['bas_transform', 'bas_pounce', 'bas_rend', 'bas_shoulder_check'], items: ['bas_flea_collar'] },
      { enc: 'test_a2_boss', level: 5, skills: ['bas_transform', 'bas_silver_slash', 'bas_howl', 'bas_step_in'], items: ['bas_wolfsbane_coat'] },
      { enc: 'test_a3_elite', level: 5, skills: ['bas_shoulder_check', 'bas_hold_the_line', 'bas_rend', 'bas_savage_bite'] },
    ]);
    t.log('totals: ' + JSON.stringify(res.totals) + ' · wins ' + res.wins + '/' + res.fought + ' · turns as a wolf ' + res.wolfTurns + ', as a man ' + res.manTurns);
    t.ok(res.acted >= res.fought - 1, 'Basanos acts in (nearly) every fight (' + res.acted + '/' + res.fought + ')');
    t.ok(res.uses >= 6, 'Basanos uses his skills (' + res.uses + ')');
    t.ok(Object.keys(res.totals).length >= 5, 'several different skills used (' + Object.keys(res.totals).length + ')');
    t.ok(res.wolfTurns > 0, 'the wolf comes out');
    t.ok(res.wins >= 2, 'the party wins most of these (' + res.wins + '/' + res.fought + ')');
  });

  // ---- 12. attacks of opportunity ------------------------------------------------------------------------------
  /** Attacks of opportunity made while fn runs: [{ attacker, mover, skillId }] (def ids). */
  function aoos(fn) {
    const list = [];
    const off = DD.Events.on('opportunity:attack', function (e) {
      list.push({ attacker: e.attacker && e.attacker.defId, mover: e.mover && e.mover.defId, skillId: e.skillId });
    });
    try { fn(); } finally { off(); }
    return list;
  }

  T.suite('hero_basanos: attacks of opportunity (both forms hold the line; leaps, swaps and shoves never provoke)', function (t) {
    // a foe walking away from the swordsman: one free Silvered Sword, and it walks on
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let u = B(), g = foes()[0], h0 = g.hp;
    t.ok(DD.Act.opportunitySlot(u) === u.basic && u.basic.id === 'bas_sword', 'human: the Silvered Sword is his attack of opportunity');
    let seen = aoos(function () { DD.AI.moveTo(g, 6, 4); });
    t.ok(seen.length === 1 && seen[0].attacker === 'basanos' && seen[0].skillId === 'bas_sword', 'the grunt walked off: he struck ' + JSON.stringify(seen));
    t.ok(h0 - g.hp === 5 && g.x > 3, 'Silvered Sword: 5 damage; it walked on to ' + g.x + ',' + g.y);
    // at most once a round
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 3 }] });
    u = B();
    const g1 = at(3, 4), g2 = at(2, 3), h1 = g1.hp, h2 = g2.hp;
    seen = aoos(function () { DD.AI.moveTo(g1, 6, 4); DD.AI.moveTo(g2, 2, 0); });
    t.ok(seen.length === 1 && h1 - g1.hp === 5 && g2.hp === h2, 'one a round: the first leaver is hit, the second walks off free');
    t.eq(u.oppRound, DD.Combat.state.round, 'his reaction of this round is spent');
    // the werewolf's Claw: the fresh Bleed bites at the end of the fleeing foe's walk
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B(); g = foes()[0];
    form(u, true);
    h0 = g.hp;
    seen = aoos(function () { DD.AI.moveTo(g, 6, 4); });
    t.ok(seen.length === 1 && seen[0].skillId === 'bas_claw', 'werewolf: the Claw is his attack of opportunity');
    t.eq(h0 - g.hp, 4 + 1, 'Claw 4, then the Bleed it left bites once the walk ends (+1)');
    t.ok(st(g, 'bleed') && st(g, 'bleed').stacks === 1 && tile(g.x, g.y).surface && tile(g.x, g.y).surface.id === 'blood', 'still Bleeding 1, and it left a blood trail');
    // he provokes too when he walks off; the move preview says so
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B(); g = foes()[0];
    const pv = DD.Combat.provokes(u, 0, 4);
    t.ok(pv.length === 1 && pv[0].unitId === g.id && pv[0].dmg === 4, 'move preview: walking off provokes the grunt (4) ' + JSON.stringify(pv));
    h0 = u.hp;
    seen = aoos(function () { t.ok(DD.Combat.move(u, 0, 4), 'he walks off'); });
    t.ok(seen.length === 1 && seen[0].attacker === 'test_grunt' && u.hp === h0 - 4 && u.x === 0, 'stabbed on the way out (4), he walks on');
    // ... and if that stab puts him below half, the wolf gets out mid-stride (not an interrupt: he walks on)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    u.hp = 15;
    DD.Combat.move(u, 0, 4);
    t.ok(u.hp === 11 && wolf(u) && u.x === 0 && u.y === 4, 'Hair Trigger on an attack of opportunity: a wolf by the end of the walk (' + u.x + ',' + u.y + ')');
    t.ok(u.mov === 6 && u.basic.id === 'bas_claw', 'with +2 move and the Claw for the rest of his turn');
    // leaps, swaps and shoves never provoke
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 7 }] });
    u = B();
    let sl = give(u, 'bas_pounce', 1);
    h0 = u.hp;
    seen = aoos(function () { use(t, u, sl, 2, 7, 'Pounce away from an adjacent grunt'); });
    t.ok(seen.length === 0 && u.hp === h0 && u.y > 4 && DD.Grid.dist(u, at(2, 7)) === 1, 'Pounce is a leap: no attack of opportunity (landed at ' + u.x + ',' + u.y + ')');
    fight({ heroes: [{ x: 2, y: 6 }, { id: 'test_mage', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    const mg = hero('test_mage'), mh = mg.hp;
    seen = aoos(function () { use(t, u, give(u, 'bas_step_in', 1), 2, 4, 'Step In for the mage next to the grunt'); });
    t.ok(seen.length === 0 && u.x === 2 && u.y === 4 && mg.y === 6 && mg.hp === mh, 'Step In is a swap: the mage leaves the grunt\'s side for free');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B(); g = foes()[0]; h0 = g.hp;
    seen = aoos(function () { use(t, u, give(u, 'bas_shoulder_check', 1), 3, 4, 'Shoulder Check'); });
    t.ok(seen.length === 0 && h0 - g.hp === 5 && u.oppRound !== DD.Combat.state.round, 'a shove is forced movement: no attack of opportunity on top (5 damage only)');
    // he can't strike while stunned, a sheep, charmed by the leaver, or downed
    ['stun', 'sheep', 'charmed'].forEach(function (id) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      const v = B(), gr = foes()[0], gh = gr.hp;
      A().addStatus(v, id, { turns: 1 }, gr);
      const s2 = aoos(function () { DD.AI.moveTo(gr, 6, 4); });
      t.ok(s2.length === 0 && gr.hp === gh && gr.x > 3, id + ': the grunt walks off unpunished');
    });
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 0, y: 8 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B(); g = foes()[0];
    A().damage(g, u, 99, { cause: 'other' });
    seen = aoos(function () { DD.AI.moveTo(g, 6, 4); });
    t.ok(u.downed && seen.length === 0, 'downed: no attack of opportunity');
    // combo: Hold the Line taunts the grunt onto him, so it can't strike his friends: the mage disengages for free
    [false, true].forEach(function (taunt) {
      fight({ heroes: [{ x: 2, y: 4, skills: ['bas_hold_the_line'] }, { id: 'test_mage', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 5 }] });
      const v = B(), m = hero('test_mage');
      if (taunt) use(t, v, v.skills[0], v.x, v.y, 'Hold the Line');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === m, 'the mage\'s turn');
      const p2 = DD.Combat.provokes(m, 7, 5), m0 = m.hp;
      const s2 = aoos(function () { DD.Combat.move(m, 7, 5); });
      if (taunt) t.ok(p2.length === 0 && s2.length === 0 && m.hp === m0 && m.x === 7, 'taunted onto Basanos, the grunt can\'t strike the mage: walking off is free');
      else t.ok(p2.length === 1 && s2.length === 1 && m.hp === m0 - 4, 'control: without Hold the Line the mage is stabbed walking off');
    });
    // the AI respects the line: the grunt next to him keeps stabbing him instead of strolling to the wounded mage
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], enemyAi: true });
    u = B();
    const m3 = hero('test_mage');
    m3.hp = 8;
    h0 = u.hp;
    DD.Combat.endRound();
    t.ok(u.hp < h0 && m3.hp === 8 && at(3, 4) && at(3, 4).defId === 'test_grunt', 'engaged with Basanos, the grunt stayed and stabbed him (' + h0 + ' → ' + u.hp + '), the mage untouched');
  });

  // ---- 13. the form follows its status ------------------------------------------------------------------------
  T.suite('hero_basanos: the form follows bas_wolf (dispels, the Blood Moon look, other content wrapping the sprite)', function (t) {
    // a dispel ("OBJECTION!": every buff removed, then Silenced) turns him human at once
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let u = B();
    const g = foes()[0];
    use(t, u, u.skills[0], u.x, u.y, 'Transform');
    t.ok(wolf(u) && u.mov === 6, 'a werewolf');
    A().cleanse(u, 'buff');
    A().addStatus(u, 'silenced', { turns: 1 }, g);
    t.ok(!wolf(u) && u.mov === 4 && u.basic.id === 'bas_sword' && !u.sprite, 'dispelled, then Silenced: human again at once (move 4, sword, human sprite)');
    // a dispel then a hit: synced before Hair Trigger looks at his HP
    use(t, u, u.skills[0], u.x, u.y, 'Transform again');
    A().cleanse(u, 'buff');
    A().damage(g, u, 2, { cause: 'other' });
    t.ok(!wolf(u) && u.mov === 4 && u.basic.id === 'bas_sword', 'dispelled, then hit above half HP: human, bookkeeping synced');
    u.hp = 14;
    A().damage(g, u, 1, { cause: 'other' });
    t.ok(wolf(u) && u.mov === 6 && u.basic.id === 'bas_claw', 'and the next hit below half lets the wolf out again (no double move bonus)');
    // Blood Moon: the huge dire-wolf look lasts the rest of that turn; he stays a werewolf
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_brute', x: 5, y: 4 }] });
    u = B();
    DD.Combat.state.hype = 100;
    use(t, u, u.signature, u.x, u.y, 'Blood Moon');
    t.ok(wolf(u) && u.sprite === Bz().DIRE_SPRITE, 'Blood Moon: the dire-wolf look');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && wolf(u) && u.sprite === Bz().WOLF_SPRITE && u.mov === 6, 'his next turn: the normal werewolf (still +2 move)');
    // other content that wraps his sprite (the Party Balloons item re-ties balloons after skills and at turn ends)
    if (DD.getItem('party_balloons') && DD.Sprites && DD.Sprites.metrics) {
      fight({ heroes: [{ x: 4, y: 4, items: ['party_balloons'], skills: ['bas_transform'] }], enemies: [{ id: 'test_brute', x: 5, y: 4 }] });
      const b = B();
      const shown = function () { return DD.Sprites.specFor(b); }, mov0 = b.mov;
      t.ok(shown().itemBalloons && shown().scale === Bz().HUMAN_SPRITE.scale, 'balloons on the man');
      use(t, b, b.skills[0], b.x, b.y, 'Transform with balloons');
      t.ok(wolf(b) && shown().itemBalloons && shown().scale === Bz().WOLF_SPRITE.scale, 'the werewolf keeps his balloons');
      DD.Combat.state.hype = 100;
      use(t, b, b.signature, b.x, b.y, 'Blood Moon with balloons');
      t.ok(shown().itemBalloons && shown().scale === Bz().DIRE_SPRITE.scale, 'so does the dire wolf');
      DD.Combat.endTurn();
      t.ok(wolf(b) && shown().itemBalloons && shown().scale === Bz().WOLF_SPRITE.scale, 'the dire look fades at his turn end, balloons and all');
      use(t, b, b.skills[0], b.x, b.y, 'Transform back with balloons');
      t.ok(!wolf(b) && shown().itemBalloons && shown().scale === Bz().HUMAN_SPRITE.scale && b.mov === mov0, 'a man with balloons again (move ' + b.mov + ')');
    } else t.log('party_balloons not loaded (isolated run): sprite-wrapping check skipped');
    // previews never touch the real sprite or the on-screen pin
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    u.vis = u.vis || {};
    const pin = u.vis.sprite;
    DD.Combat.preview(u, u.skills[0], u.x, u.y);
    t.ok(!u.sprite && u.vis.sprite === pin && !wolf(u), 'a Transform preview leaves him (and his look) alone');
  });

  // ---- 14. review (v2) ------------------------------------------------------------------------------------------
  /** Skill ids Basanos used (not reactions) while fn runs. */
  function usedBy(u, fn) {
    const list = [];
    A().addRule({ id: 'bas_review_uses', name: 'Basanos review probe', hooks: {
      onSkillUsed: function (ctx) { if (!A().simulating && ctx.user === u && !ctx.opportunity && ctx.skill) list.push(ctx.skill.id); },
    } });
    try { fn(); } finally { A().removeRule('bas_review_uses'); }
    return list;
  }

  T.suite('hero_basanos: review (v2) — a form swap keeps the basic slot\'s bookkeeping (no phantom refunds for AutoPlay)', function (t) {
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform'] }], enemies: [{ id: 'test_brute', x: 3, y: 4, hpMult: 5 }] });
    const u = B(), g = foes()[0];
    use(t, u, u.basic, g.x, g.y, 'sword 1');
    use(t, u, u.basic, g.x, g.y, 'sword 2');
    use(t, u, u.skills[0], u.x, u.y, 'Transform');
    t.ok(u.basic.id === 'bas_claw' && u.basic.uses === 2 && u.basic.usedThisTurn === true,
      'the Claw takes over the slot\'s count (2 uses) and "used this turn" (' + u.basic.uses + ')');
    DD.Combat.endTurn();
    use(t, u, u.basic, g.x, g.y, 'claw');
    use(t, u, u.skills[0], u.x, u.y, 'Transform back');
    t.ok(u.basic.id === 'bas_sword' && u.basic.uses === 3 && u.basic.cd === 0, 'and back: still one slot, 3 basic attacks so far (' + u.basic.uses + ')');
    // a fresh slot (uses 0) read as refunded uses to AutoPlay (+2 each): a werewolf who had clawed a lot transformed
    // there and back for nothing, or into a man next to the foe he was mauling
    [{ x: 3, label: 'next to him' }, { x: 8, label: 'a walk away' }].forEach(function (p) {
      fight({ heroes: [{ x: 2, y: 4, level: 3, skills: ['bas_transform', 'bas_shoulder_check'] }], enemies: [{ id: 'test_grunt', x: p.x, y: 4, hpMult: 4 }] });
      const v = B(), gr = foes()[0], h0 = gr.hp;
      form(v, true);
      v.basic.uses = 6;
      let seq = [];
      t.tryRun('AutoPlay turn (' + p.label + ')', function () { seq = usedBy(v, function () { DD.AutoPlay.takeTurn(); }); });
      t.ok(seq.indexOf('bas_transform') < 0 && wolf(v) && gr.hp < h0,
        'AutoPlay: a werewolf after 6 Claws, grunt ' + p.label + ': he stays a wolf and mauls it (' + seq.join(', ') + ')');
    });
  });

  T.suite('hero_basanos: review (v2) — Hair Trigger after a refused down (Plot Armor: "stay up at 1 HP")', function (t) {
    // the engine asks onTakeDamage before it decides the down: at that moment he is at 0 HP, so the wolf has to wait for
    // the next thing that happens to him (here: the end of the stab, his turn start, the attack of opportunity)
    const real = !!(DD.getPassive && DD.getPassive('rp_plot_armor'));
    t.log(real ? 'with the real Plot Armor Blessing' : 'rp_plot_armor not loaded (isolated run): a fight rule refuses the down');
    /** Plot Armor on him (the real Blessing when loaded, else an equivalent once-a-fight rule). */
    function armored(cfg) {
      if (real) cfg.heroes[0].passives = [{ id: 'rp_plot_armor', level: 1 }];
      fight(cfg);
      if (!real) {
        A().addRule({ id: 'bas_review_plot', name: 'Plot armor (test)', hooks: { preventDeath: function (unit) {
          if (!unit || unit.defId !== 'basanos' || unit.data.basReviewPlot) return false;
          unit.data.basReviewPlot = true;
          unit.hp = 1;
          A().touch();
          return true;
        } } });
      }
      return B();
    }
    // on the grunt's turn: stabbed "to death" at 3 HP, he stays up at 1 HP; his next turn starts as the werewolf (free)
    const u = armored({ heroes: [{ x: 2, y: 4, skills: ['bas_transform'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], enemyAi: true });
    u.hp = 3;
    let triggers = 0;
    const origLog = A().log;
    A().log = function (msg) { if (/Hair Trigger/.test(String(msg))) triggers++; return origLog.apply(this, arguments); };
    let seen = [];
    try {
      seen = atTurnStarts(u, function () { return { wolf: wolf(u), hp: u.hp, basic: u.basic.id, mov: u.mov, downed: u.downed }; }, function () { DD.Combat.endTurn(); });
    } finally { A().log = origLog; }
    t.ok(seen.length === 1 && !seen[0].downed && seen[0].hp === 1, 'the stab would have downed him: he is still up at 1 HP ' + JSON.stringify(seen));
    t.ok(seen.length === 1 && seen[0].wolf && seen[0].basic === 'bas_claw' && seen[0].mov === 6 && u.ap === 3,
      'his turn starts as the werewolf: Claw, +2 move, all 3 AP');
    t.eq(triggers, 1, 'Hair Trigger fired once');
    // on his own walk: a lethal attack of opportunity, refused: the wolf gets out right there and he walks on
    const v = armored({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    v.hp = 3;
    t.ok(DD.Combat.move(v, 0, 4), 'he walks away from the grunt');
    t.ok(!v.downed && v.hp === 1 && wolf(v) && v.mov === 6 && v.x === 0, 'stabbed on the way out, Plot Armor holds: a 1-HP werewolf at the end of the walk (' + v.x + ',' + v.y + ')');
    // a lethal hit that is NOT refused leaves nothing pending: Help Up brings back the man
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const w = B();
    A().damage(foes()[0], w, 99, { cause: 'other' });
    A().revive(w, 0.25);
    DD.Combat.endRound();
    t.ok(DD.Combat.current() === w && !wolf(w) && w.basic.id === 'bas_sword' && w.hp * 2 < w.maxHp, 'downed for real, helped up at 25%: still a man on his next turn (the next hit sets him off)');
  });

  T.suite('hero_basanos: review (v2) — his attack of opportunity is the basic of his real form (a dispel with nothing after it)', function (t) {
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const u = B(), g = foes()[0];
    use(t, u, u.skills[0], u.x, u.y, 'Transform');
    DD.Combat.endTurn();
    A().cleanse(u, 'buff');
    t.ok(!wolf(u) && u.basic.id === 'bas_claw', 'dispelled with no hook after it: the slot is still the Claw until something re-syncs him');
    const o = DD.Act.opportunityOf(u, g, null, { x: 4, y: 4 });
    t.ok(!!o && o.skill.id === 'bas_sword' && o.level === 1, 'the reaction the move preview and the AI see is the Silvered Sword (' + (o && o.skill.id) + ')');
    const pv = DD.Combat.provokes(g, 6, 4);
    t.ok(pv.length === 1 && pv[0].skillId === 'bas_sword' && pv[0].dmg === 5, 'the grunt\'s move preview: the sword, 5 ' + JSON.stringify(pv));
    const h0 = g.hp;
    const seen = aoos(function () { DD.AI.moveTo(g, 6, 4); });
    t.ok(seen.length === 1 && seen[0].skillId === 'bas_sword' && h0 - g.hp === 5 && !has(g, 'bleed'), 'a man swings a sword: 5 damage, no Bleed ' + JSON.stringify(seen));
    t.ok(u.basic.id === 'bas_sword' && u.mov === 4 && !u.sprite, 'the reaction re-synced him: sword slot, move 4, human look');
    // in his true form nothing changes: the werewolf still claws
    fight({ heroes: [{ x: 2, y: 4, skills: ['bas_transform'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const w = B(), g2 = foes()[0];
    use(t, w, w.skills[0], w.x, w.y, 'Transform');
    const o2 = DD.Act.opportunityOf(w, g2, null, { x: 4, y: 4 });
    t.ok(!!o2 && o2.skill.id === 'bas_claw' && o2.slot === w.basic, 'a werewolf reacts with his own Claw slot');
  });

  // ---- v2 requests (Nov 3): barrels ----------------------------------------------------------------------------------
  T.suite('hero_basanos: v2 requests — Silvered Sword and Claw set off an explosive barrel; Pounce leaps at foes, never at a barrel', function (t) {
    function arena() {
      return fight({ objects: [{ x: 3, y: 4, id: 'barrel_explosive' }, { x: 2, y: 7, id: 'barrel_explosive' }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 8, y: 8 }] });
    }
    arena();
    let u = B();
    const pl = give(u, 'bas_pounce', 3);
    t.eq(DD.Targeting.validTargets(u, pl).filter(function (q) { return !!q.obj; }).length, 0, 'Pounce never lists a barrel');
    t.ok(!valid(u, pl, 2, 7) && !valid(u, pl, 3, 4), '...and isValidTarget agrees');
    ['bas_sword', 'bas_claw'].forEach(function (id) {
      arena();
      u = B();
      const sl = give(u, id, 1), g = at(4, 4), g0 = g.hp;
      t.ok(DD.Targeting.validTargets(u, sl).some(function (q) { return q.obj === 'barrel_explosive' && q.x === 3 && q.y === 4; }), id + ': can be aimed at the adjacent barrel');
      t.eq(DD.Combat.preview(u, sl, 3, 4).detonates, 'barrel_explosive', id + ': the preview detonates it');
      previewMatches(t, u, sl, 3, 4, id + ' at a barrel');
      t.ok(!tile(3, 4).obj && g.hp < g0 && !st(g, 'bleed'), id + ': it went off; the grunt next to it takes the blast (no Bleed: the claw hit a barrel)');
    });
  });
})();
