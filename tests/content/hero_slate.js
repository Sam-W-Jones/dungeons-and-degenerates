/* Dungeons and Degenerates — tests/content/hero_slate.js
 * Suites 'hero_slate: …' for js/data/heroes/slate.js (v2: initiative turns, no telegraphs, no Guard, simple kit):
 * definition + level tables + simplicity rules, Short Fuse (Rage from hits / heals / buffs, the flare), every skill at
 * every level in DD.Combat.sandbox fights (damage vs armor-free fixture foes, statuses lasting exactly the right own
 * turns, throws, crashes, pits, lava, water, walls, map edges, objects, grapple holds and drags, cooldowns, ranges),
 * the signature, the items, combos with other heroes, previews vs reality, v2 edge cases (disabled users, deaths
 * mid-skill, no AP, not his turn) and AutoPlay battles with party [slate, test_knight, test_cleric, test_mage] against
 * the fixture encounters of acts 1-3 at levels 1 / 3 / 5.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const POOL = ['sla_hold_still', 'sla_personal_space', 'sla_rocks_fall', 'sla_air_mail', 'sla_foot_down', 'sla_lawn',
    'sla_rock_bottom', 'sla_gasket', 'sla_get_over_here'];
  const ALL_SKILLS = ['sla_love_tap', 'sla_tantrum'].concat(POOL);
  const L5_HP = 32 + 4 * 4;   // Slate at level 5 (the default in these sandboxes)
  // words for mechanics v2 removed (DESIGN §4.1): nothing of Slate's may still promise them
  const REMOVED = /telegraph|intent|\bguard\b|cancel|planning|next round|starts? (each|every|the) (fight|combat)/i;

  // ---- helpers ------------------------------------------------------------------------------------
  /**
   * Sandbox fight, Slate first (heroes first, then foes, in the listed order). Foes pass every turn unless o.ai.
   * o: { w, h, seed, ai, noPlan, initiative, order, slate: { x, y, level, skills, items }, allies, enemies, objects,
   * terrain, surfaces, objective }.
   */
  function fight(o) {
    o = o || {};
    const s = DD.Combat.sandbox({
      w: o.w || 9, h: o.h || 9, seed: o.seed || 11, enemyAi: o.ai ? undefined : false, noPlan: !!o.noPlan,
      initiative: o.initiative, order: o.order,
      objective: o.objective || { type: 'custom', text: 'Slate test' },
      encounter: o.objective ? null : { id: 'sla_test_arena', checkObjective: function () { return null; } },
      heroes: [Object.assign({ id: 'slate', x: 2, y: 4, level: 5 }, o.slate || {})].concat(o.allies || []),
      enemies: o.enemies || [], objects: o.objects || [], terrain: o.terrain, surfaces: o.surfaces,
    });
    const u = s.units.filter(function (x) { return x.defId === 'slate'; })[0];
    return { s: s, u: u };
  }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0]; }
  function rage(u) { return DD.Slate.rage(u); }
  function setRage(u, n) {
    DD.Act.removeStatus(u, 'sla_rage', { silent: true });
    if (n > 0) DD.Slate.gainRage(u, n);
  }
  function use(u, id, x, y) {
    const sl = slotOf(u, id);
    if (!sl) return 'no slot';
    const ok = DD.Combat.canUse(u, sl);
    if (ok !== true) return ok;
    if (!DD.Targeting.isValidTarget(u, sl, x, y)) return 'invalid target ' + x + ',' + y;
    return DD.Combat.useSkill(u, sl, x, y) ? true : 'useSkill failed';
  }
  function valid(u, id, x, y) { const sl = slotOf(u, id); return !!sl && DD.Targeting.isValidTarget(u, sl, x, y); }
  function L(id, lv) { return DD.skillLevel(DD.getSkill(id), lv); }
  function desc(id, lv, user) { return DD.skillDesc(DD.getSkill(id), lv, user || null); }
  function noErrors(t, label, from) {
    const errs = DD.problems.slice(from).filter(function (w) { return /^Error in /.test(w); });
    t.eq(errs.length, 0, label + ': no swallowed errors' + (errs.length ? ' — ' + errs[0].slice(0, 160) : ''));
  }
  /** Ends the current hero turn: the AI turns that follow resolve inside; returns at the next hero turn. */
  function pass() { return DD.Combat.endTurn(); }
  /** Pass every turn (other heroes' too) until it is u's turn again. */
  function untilTurnOf(u) {
    for (let i = 0; i < 12; i++) {
      const s = DD.Combat.state;
      if (!s || s.result) return false;
      pass();
      if (DD.Combat.current() === u) return true;
    }
    return false;
  }

  // ---- definition -------------------------------------------------------------------------------------
  T.suite('hero_slate: definition, simplicity rules and level tables', function (t) {
    const h = DD.getHero('slate');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov >= 3 && h.stats.mov <= 5, 'DESIGN §5 L1 stats');
    t.eq(h.stats.init, -2, 'v2: initiative modifier −2 (golems are slow)');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth +3-5 HP');
    t.ok(h.flags && h.flags.immovable === true, 'immovable');
    t.eq(h.unlock, null, 'v2: available from the start (unlock: null)');
    t.ok(h.complexity <= 2, 'simplified (complexity ' + h.complexity + ')');
    t.ok(!!h.blurb && h.blurb.split('.').length >= 3 && !!h.color && !!h.epithet && !!h.race && !!h.cls && !!h.role, 'flavor fields');
    t.eq(h.startingSkills.length, 2, 'two starting skills');
    t.ok(h.skillPool.length >= 9 && h.skillPool.length <= 10, 'pool of 9-10 (DESIGN §6 v2: 8-10; registry: 9-11): ' + h.skillPool.length);
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'pool order');
    h.startingSkills.forEach(function (id) { t.ok(h.skillPool.indexOf(id) >= 0, 'starter in pool: ' + id); });
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic / signature not socketable');
    const aps = {};
    ALL_SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'slate', id + ' registered, owner slate');
      if (!s) return;
      t.ok(/^sla_/.test(id), id + ' prefixed');
      t.ok(typeof s.icon === 'string' && s.icon.length > 0 && s.icon.length <= 4, id + ' one emoji icon');
      t.ok(s.flavor && s.flavor.length <= 120, id + ' flavor ≤ 120');
      for (let lv = 1; lv <= s.levels.length; lv++) {
        [null, { id: 'p', statuses: [], flags: {}, data: {}, items: [] }].forEach(function (user) {
          const d = DD.skillDesc(s, lv, user);
          t.ok(d.length > 20 && !/undefined|NaN|\[object/.test(d), id + ' L' + lv + ' desc ' + (user ? 'with' : 'without') + ' a user: ' + d.slice(0, 60));
        });
        const d = desc(id, lv);
        // DESIGN §6 v2 simplicity: one breath, one verb (+ one rider), no hidden Rage clauses, no removed mechanics
        t.ok(d.length <= 160, id + ' L' + lv + ' desc reads in one breath (' + d.length + ' chars): ' + d);
        t.ok(!/Rage 3\+|if you are holding|instead\b/i.test(d), id + ' L' + lv + ': no per-skill Rage or holding clauses');
        t.ok(!REMOVED.test(d), id + ' L' + lv + ': no removed v1 mechanics in "' + d + '"');
        const Lv = DD.skillLevel(s, lv);
        if (Lv.dmg) t.ok(new RegExp('(^|[^0-9])' + Lv.dmg + '([^0-9]|$)').test(d), id + ' L' + lv + ' desc shows its damage ' + Lv.dmg);
        aps[DD.resolve(s.ap, Lv, null, 1)] = 1;
      }
      if (h.skillPool.indexOf(id) >= 0) t.eq(s.levels.length, 3, id + ' has 3 levels');
    });
    t.ok(aps[1] && aps[2], 'AP mix of 1 and 2');
    // level III = bigger numbers OR one added rider (DESIGN §6): Rock Bottom adds a Stun, the rest scale
    t.ok(!L('sla_rock_bottom', 2).stun && L('sla_rock_bottom', 3).stun && L('sla_rock_bottom', 3).dmg === L('sla_rock_bottom', 2).dmg, 'Rock Bottom III: one added rider (Stun), same numbers');
    const basic = DD.getSkill(h.basic), sig = DD.getSkill(h.signature);
    t.ok(basic.ap === 1 && basic.levels[0].dmg >= 4 && basic.levels[0].dmg <= 6, 'basic: 1 AP, 4-6 damage');
    t.ok(sig.hype === 100 && sig.levels[0].dmg >= 15 && sig.levels[0].dmg <= 25, 'signature: 100 Hype, 15-25 damage');
    const combos = ALL_SKILLS.filter(function (id) { return DD.getSkill(id).tags.indexOf('combo') >= 0; });
    t.ok(combos.length >= 2 && combos.length <= 3, '2-3 skills tagged as combo setups with other heroes: ' + combos.join(', '));
    // the passive: one rule (two sentences), his comedic core
    const pd = h.passive.desc;
    t.ok(/Rage/.test(pd) && /hits, heals or buffs/.test(pd) && /\+2 damage/.test(pd), 'passive desc: ' + pd);
    t.ok(pd.split('. ').length <= 2 && pd.length <= 150, 'passive is one clear rule (' + pd.length + ' chars)');
    // texts that mention removed mechanics or the wrong pronouns
    const narr = (DD.defs.narration.tips || []).filter(function (l) { return /Slate/.test(l); });
    t.ok(narr.length >= 3, 'loading tips about Slate (' + narr.length + ')');
    const texts = [h.blurb, h.role, pd].concat(narr, ['sla_rage', 'sla_grappled'].map(function (id) {
      return DD.getStatus(id).desc({ id: id, stacks: 3, turns: 1, source: null, data: {} });
    }), ['sla_mitts', 'sla_cardigan', 'sla_ledger'].map(function (id) { return DD.getItem(id).desc; }));
    texts.forEach(function (tx) {
      t.ok(!REMOVED.test(tx), 'no removed mechanics: ' + tx.slice(0, 70));
      t.ok(!/\b(she|her|hers)\b/i.test(tx), 'Slate is he/him: ' + tx.slice(0, 70));
    });
    // barks
    const keys = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
    let mentions = 0;
    const named = {};
    keys.forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ' has 4-6 lines (' + lines.length + ')');
      lines.forEach(function (b) {
        t.ok(typeof b === 'string' && b.length > 0 && b.length <= 70, 'bark ≤ 70 chars: ' + b);
        t.ok(!REMOVED.test(b), 'bark mentions nothing removed: ' + b);
        const m = b.match(/Zarathor|Syllamin|Marbles|Marwyn|Ellaria|Josiah|Sparrow|Corelos|Buga|Kiri|Betty|Basanos/g);
        if (m) { mentions++; m.forEach(function (n) { named[n] = 1; }); }
      });
    });
    t.ok(mentions >= 6 && named.Kiri && named.Betty && named.Basanos, 'barks name other heroes, the new ones too: ' + Object.keys(named).join(', '));
    // statuses, object, items
    t.ok(!!DD.getStatus('sla_rage') && DD.getStatus('sla_rage').decay === 'never', 'sla_rage: never decays (no drain)');
    const held = DD.getStatus('sla_grappled');
    t.ok(held && held.noMove === true && held.type === 'debuff', 'sla_grappled: an engine noMove debuff (no hidden root)');
    t.ok(!DD.getStatus('sla_grappling'), 'one record per hold: no separate "grappling" status on Slate');
    t.ok(!!DD.getObject('sla_boulder') && typeof DD.getObject('sla_boulder').draw === 'function', 'Boulder object with a painter');
    const items = ['sla_mitts', 'sla_cardigan', 'sla_ledger'].map(DD.getItem);
    t.ok(items.every(function (it) { return it && it.hero === 'slate' && /^sla_/.test(it.id) && !(it.stats && it.stats.block); }), '3 hero items, no stats.block');
    t.ok(items.filter(function (it) { return it.rarity === 'rare'; }).length === 2 && items.some(function (it) { return it.rarity === 'legendary'; }), 'two rares and a legendary');
    t.ok(items.every(function (it) { return !it.hooks || (!it.hooks.onCombatStart && !it.hooks.modifyGuard); }), 'no combat-start freebies, no Guard hooks');
    // [review, v1] his skill names must not collide with anyone else's (his boulder lob was once the DM's "Rocks Fall")
    const others = {};
    Object.keys(DD.defs.skills).forEach(function (k) { const s = DD.getSkill(k); if (s && s.owner !== 'slate') others[String(s.name).toLowerCase()] = k; });
    ALL_SKILLS.forEach(function (id) {
      const nm = String(DD.getSkill(id).name).toLowerCase();
      t.ok(!others[nm], id + ' "' + DD.getSkill(id).name + '" is his own name' + (others[nm] ? ' (also ' + others[nm] + ')' : ''));
    });
  });

  // ---- Short Fuse ---------------------------------------------------------------------------------------
  T.suite('hero_slate: Short Fuse — Rage from hits, heals and buffs; the flare; no drain', function (t) {
    const p0 = DD.problems.length;
    let f = fight({ allies: [{ id: 'test_cleric', x: 1, y: 4 }, { id: 'test_mage', x: 2, y: 7 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
    const u = f.u, cleric = at(1, 4), mage = at(2, 7), g = at(3, 4);
    t.eq(rage(u), 0, 'every fight starts calm (no free Rage)');
    t.ok(DD.Combat.current() === u && u.ap === 3, 'his turn, 3 AP');
    DD.Act.damage(g, u, 4);
    t.eq(rage(u), 1, 'a foe hits him → 1 Rage');
    DD.Act.damage(g, u, 4);
    t.eq(rage(u), 2, 'again → 2');
    t.ok(!DD.Slate.flared(u), 'not flared at 2');
    DD.Act.heal(cleric, u, 3);
    t.eq(rage(u), 3, 'an ally heals him → +1 ("Did I ASK?")');
    t.ok(DD.Slate.flared(u), 'runes flare at 3');
    DD.Act.heal(u, u, 1);
    DD.Act.heal(null, u, 1);
    t.eq(rage(u), 3, 'his own heals and sourceless heals are nobody touching him');
    DD.Act.addStatus(u, 'inspired', { turns: 1 }, cleric);
    t.eq(rage(u), 4, 'an ally buffs him → +1');
    DD.Act.addStatus(u, 'weak', { turns: 1 }, cleric);
    DD.Act.addStatus(u, 'haste', { turns: 1 }, u);
    DD.Act.damage(null, u, 2);
    t.eq(rage(u), 4, 'no Rage from a debuff, his own buff or the floor (sourceless damage)');
    DD.Act.damage(g, u, 4); DD.Act.damage(g, u, 4);
    t.eq(rage(u), 5, 'capped at 5');
    t.eq(st(u, 'sla_rage').stacks, 5, 'status stacks 5');
    setRage(u, 1);
    u.hp = u.maxHp;
    DD.Act.heal(cleric, u, 5);
    t.eq(rage(u), 1, 'a heal at full HP heals nothing: no Rage');
    DD.Act.addStatus(u, 'invulnerable', { turns: 1 }, u);
    DD.Act.damage(g, u, 4);
    t.eq(rage(u), 1, 'a hit that does nothing (invulnerable) is no hit');
    DD.Act.removeStatus(u, 'invulnerable', { silent: true });
    u.block = 10;
    DD.Act.damage(g, u, 4);
    t.eq(rage(u), 2, 'a hit fully absorbed by Block still annoys him');
    DD.Act.damage(mage, u, 2);
    t.eq(rage(u), 3, 'friendly fire counts ("someone else")');
    // the flare: +2 on his skills' damage, nothing below 3 Rage
    setRage(u, 2);
    let hp = g.hp;
    t.eq(use(u, 'sla_love_tap', 3, 4), true, 'Love Tap at Rage 2');
    t.eq(hp - g.hp, 5, 'Love Tap: 5 damage (Rage 2: no flare)');
    t.eq(u.ap, 2, 'Love Tap costs 1 AP');
    setRage(u, 3);
    hp = g.hp;
    t.eq(use(u, 'sla_love_tap', 3, 4), true, 'Love Tap flared');
    t.eq(hp - g.hp, 7, 'Love Tap at 3+ Rage: 5 + 2');
    t.ok(!valid(u, 'sla_love_tap', 4, 4), 'Love Tap is melee only');
    // no drain: quiet rounds keep his Rage; a fresh fight starts at 0 again
    f = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    setRage(f.u, 4);
    for (let i = 0; i < 3; i++) DD.Combat.endRound();
    t.eq(rage(f.u), 4, 'three quiet rounds later: still 4 (Rage never drains)');
    t.eq(DD.Combat.state.round, 4, 'round 4');
    f = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    t.eq(rage(f.u), 0, 'a new fight: calm again');
    // a downed Slate grumbles about nothing
    f = fight({ allies: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    DD.Act.damage(null, f.u, 999);
    t.ok(f.u.downed, 'downed');
    DD.Act.damage(at(3, 4), f.u, 3);
    t.eq(rage(f.u), 0, 'downed: no Rage');
    noErrors(t, 'Short Fuse', p0);
  });

  // ---- Hold Still -----------------------------------------------------------------------------------------
  T.suite('hero_slate: Hold Still — Grappled through exactly its next turn(s), drag, release', function (t) {
    const p0 = DD.problems.length;
    // the bait: a nearly dead mage two steps from the grunt; a free grunt goes for her, a held one can only hit Slate
    function bait(lv, extra) {
      const f = fight(Object.assign({ ai: true, slate: { x: 3, y: 4, skills: [{ id: 'sla_hold_still', level: lv }] },
        allies: [{ id: 'test_mage', x: 6, y: 4, hp: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] }, extra || {}));
      return { f: f, u: f.u, g: at(4, 4), mage: at(6, 4) };
    }
    // control: without the hold, the grunt walks over and stabs the mage
    let c = bait(1);
    t.ok(untilTurnOf(c.u), 'control: a round passes');
    t.ok(!(c.g.x === 4 && c.g.y === 4) && (c.mage.hp < 4 || c.mage.downed), 'control: a free grunt leaves Slate for the wounded mage');
    for (let lv = 1; lv <= 3; lv++) {
      const Lv = L('sla_hold_still', lv);
      c = bait(lv);
      const u = c.u, g = c.g, mage = c.mage;
      t.eq(use(u, 'sla_hold_still', 4, 4), true, 'L' + lv + ': used');
      t.eq(g.hp, 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage');
      t.ok(has(g, 'sla_grappled') && st(g, 'sla_grappled').turns === Lv.turns && st(g, 'sla_grappled').source === u.id, 'L' + lv + ': Grappled for ' + Lv.turns);
      t.ok(DD.Combat.cantMove(g) && !has(g, 'root'), 'L' + lv + ': it can\'t move (an engine noMove hold, no hidden root)');
      t.ok(DD.Slate.heldBy(u) === g && DD.Slate.holderOf(g) === u, 'L' + lv + ': Slate holds it');
      t.eq(slotOf(u, 'sla_hold_still').cd, 2, 'L' + lv + ': cooldown 2');
      t.eq(u.ap, 2, 'L' + lv + ': costs 1 AP');
      t.ok(/Grappled/.test(desc('sla_hold_still', lv)) && new RegExp('next ' + (Lv.turns === 1 ? 'turn' : Lv.turns + ' turns')).test(desc('sla_hold_still', lv)), 'L' + lv + ': desc says how long');
      untilTurnOf(u);   // the mage's turn, the grunt's (held), then round 2: Slate's turn again
      t.ok(DD.Combat.current() === u && DD.Combat.state.round === 2, 'L' + lv + ': back to Slate, round 2');
      t.ok(g.x === 4 && g.y === 4, 'L' + lv + ': the held grunt did not move on its turn');
      t.eq(mage.hp, 4, 'L' + lv + ': the mage is safe');
      t.eq(u.hp, L5_HP - 3, 'L' + lv + ': it stabbed the only thing in reach (Slate, 4 − 1 armor)');
      t.eq(rage(u), 1, 'L' + lv + ': which annoyed him (+1 Rage)');
      if (Lv.turns === 1) {
        t.ok(!has(g, 'sla_grappled') && !DD.Combat.cantMove(g), 'L' + lv + ': free at the end of its one held turn');
      } else {
        t.ok(has(g, 'sla_grappled') && st(g, 'sla_grappled').turns === 1, 'L' + lv + ': still held for its second turn');
        untilTurnOf(u);
        t.ok(g.x === 4 && g.y === 4 && mage.hp === 4, 'L' + lv + ': second turn held too');
        t.ok(!has(g, 'sla_grappled'), 'L' + lv + ': then free');
      }
    }
    // the foe acts before Slate: the hold still covers exactly its next turn
    c = bait(1, { initiative: 'enemiesFirst', noPlan: true });
    t.ok(DD.Combat.current() === c.u && DD.Combat.state.round === 1, 'enemies first: the grunt passed round 1, Slate acts');
    use(c.u, 'sla_hold_still', 4, 4);
    untilTurnOf(c.u);   // the mage, then round 2: the grunt (held), then Slate
    t.ok(DD.Combat.current() === c.u && DD.Combat.state.round === 2, 'round 2, Slate\'s turn');
    t.ok(c.g.x === 4 && c.g.y === 4 && c.mage.hp === 4, 'enemies first: held through its round-2 turn');
    t.ok(!has(c.g, 'sla_grappled'), 'and free at its end (before Slate\'s turn)');

    // dragging along
    let f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 2 }] }, enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    let g = at(5, 4);
    t.eq(use(f.u, 'sla_hold_still', 5, 4), true, 'drag: grabbed');
    t.ok(DD.Combat.move(f.u, 2, 4), 'drag: Slate walks two tiles west');
    t.ok(f.u.x === 2 && g.x === 3 && g.y === 4, 'drag: the grunt was dragged into the tile behind him (' + g.x + ',' + g.y + ')');
    t.ok(has(g, 'sla_grappled') && DD.Slate.heldBy(f.u) === g, 'drag: still held');
    t.ok(!DD.Combat.canUndo(), 'drag: a drag is a side effect (no undo)');
    // dragged through fire: it walks into the flames he leaves behind
    f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    g = at(5, 4);
    use(f.u, 'sla_hold_still', 5, 4);
    DD.Act.setSurface(4, 4, 'fire', 3);
    t.ok(DD.Combat.move(f.u, 3, 4), 'fire: Slate steps off the burning tile');
    t.ok(g.x === 4 && has(g, 'burn'), 'fire: the grunt was dragged into the fire and Burns');
    // he walks through a friend: the friend's tile can't take the grunt, so it slips free
    f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 1 }] }, allies: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    g = at(5, 4);
    use(f.u, 'sla_hold_still', 5, 4);
    t.ok(DD.Combat.move(f.u, 2, 4), 'through a friend: walked');
    t.ok(f.u.x === 2 && g.x === 4 && !has(g, 'sla_grappled'), 'through a friend: dragged one tile, then it slips free (at ' + g.x + ')');
    // a held foe bleeds when dragged (forced movement)
    f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    g = at(5, 4);
    use(f.u, 'sla_hold_still', 5, 4);
    DD.Act.addStatus(g, 'bleed', { stacks: 2 }, f.u);
    const bh = g.hp;
    DD.Combat.move(f.u, 3, 4);
    t.eq(bh - g.hp, 2, 'a Bleeding foe bleeds 2 when dragged');
    // separated by someone else's push → released
    f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 1 }] }, allies: [{ id: 'test_knight', x: 4, y: 3 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    g = at(5, 4);
    use(f.u, 'sla_hold_still', 5, 4);
    DD.Act.push(at(4, 3), g, { x: 1, y: 0 }, 2);
    t.ok(!has(g, 'sla_grappled') && !DD.Combat.cantMove(g) && !DD.Slate.heldBy(f.u), 'pushed apart → released');
    // Slate stunned / asleep / frozen / sheeped / downed → lets go
    ['stun', 'sleep', 'frozen', 'sheep', 'downed'].forEach(function (sid) {
      const f3 = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 3 }] }, allies: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
      const g3 = at(5, 4);
      use(f3.u, 'sla_hold_still', 5, 4);
      if (sid === 'downed') DD.Act.damage(null, f3.u, 999);
      else DD.Act.addStatus(f3.u, sid, { turns: 1 }, g3);
      t.ok(!has(g3, 'sla_grappled'), sid + ' Slate → he lets go');
    });
    // one hold at a time; the victim dies → nothing left over
    f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 2 }] }, enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }] });
    const ga = at(5, 4), gb = at(3, 4);
    use(f.u, 'sla_hold_still', 5, 4);
    slotOf(f.u, 'sla_hold_still').cd = 0;
    t.eq(use(f.u, 'sla_hold_still', 3, 4), true, 'grab a second foe');
    t.ok(!has(ga, 'sla_grappled') && has(gb, 'sla_grappled') && DD.Slate.heldBy(f.u) === gb, 'only one hold at a time');
    DD.Act.kill(gb, f.u);
    t.ok(!DD.Slate.heldBy(f.u), 'victim died → nobody held');
    // immovable foes can't be held; a pushable boss can (it just can't walk off)
    f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 1 }] }, enemies: [{ id: 'test_brute', x: 5, y: 4 }, { id: 'test_boss', x: 4, y: 6 }] });
    t.ok(!valid(f.u, 'sla_hold_still', 5, 4), 'an immovable brute is too heavy to hold');
    const why = DD.Targeting.pure(function () { return DD.getSkill('sla_hold_still').target.canTarget(DD.Targeting.buildCtx(f.u, slotOf(f.u, 'sla_hold_still'), { x: 5, y: 4 })); });
    t.ok(typeof why === 'string' && /heavy/i.test(why), 'it says why: ' + why);
    const boss = at(4, 6);
    DD.Act.teleport(f.u, 4, 5, { fx: false, noEnter: true });
    t.eq(use(f.u, 'sla_hold_still', 4, 6), true, 'the (pushable) Test Overlord can be grabbed');
    t.ok(has(boss, 'sla_grappled') && DD.Combat.cantMove(boss), 'and can\'t walk off');
    noErrors(t, 'Hold Still', p0);
  });

  // ---- Personal Space ---------------------------------------------------------------------------------------
  T.suite('hero_slate: Personal Space — throws, crashes, pits, lava, water, walls, objects', function (t) {
    const W = 11;
    for (let lv = 1; lv <= 3; lv++) {
      const Lv = L('sla_personal_space', lv);
      const sk = [{ id: 'sla_personal_space', level: lv }];
      // clean throw: lands exactly range tiles further
      let f = fight({ w: W, slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
      let g = at(2, 4);
      const tx = 2 + Lv.range;
      t.ok(valid(f.u, 'sla_personal_space', tx, 4), 'L' + lv + ': can aim ' + Lv.range + ' tiles past the foe');
      t.ok(!valid(f.u, 'sla_personal_space', tx + 1, 4), 'L' + lv + ': not ' + (Lv.range + 1));
      t.ok(!valid(f.u, 'sla_personal_space', 3, 5), 'L' + lv + ': straight lines only');
      t.ok(new RegExp('up to ' + Lv.range + ' tiles').test(desc('sla_personal_space', lv, f.u)) && new RegExp(' ' + Lv.dmg + ' damage').test(desc('sla_personal_space', lv, f.u)), 'L' + lv + ': desc numbers');
      t.eq(use(f.u, 'sla_personal_space', tx, 4), true, 'L' + lv + ': thrown');
      t.ok(g.x === tx && g.y === 4, 'L' + lv + ': landed on ' + tx + ',4 (at ' + g.x + ',' + g.y + ')');
      t.eq(g.hp, 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage');
      t.eq(f.u.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(slotOf(f.u, 'sla_personal_space').cd, 1, 'L' + lv + ': cooldown 1');
      // a crash: both take it (calm) — and both get the flare's +2 at 3 Rage
      [0, 3].forEach(function (r) {
        f = fight({ w: W, slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 2 }] });
        setRage(f.u, r);
        const a = at(2, 4), b = at(5, 4);
        t.eq(use(f.u, 'sla_personal_space', 5, 4), true, 'L' + lv + ' R' + r + ': thrown at a goblin');
        const want = Lv.dmg + (r >= 3 ? 2 : 0);
        t.ok(a.x === 4 && a.y === 4, 'L' + lv + ' R' + r + ': lands short of the goblin it hit');
        t.ok(a.hp === 28 - want && b.hp === 28 - want, 'L' + lv + ' R' + r + ': both take ' + want + ' (' + (28 - a.hp) + ', ' + (28 - b.hp) + ')');
        t.ok(!has(a, 'stun') && !has(b, 'stun'), 'L' + lv + ' R' + r + ': no hidden stun');
      });
    }
    const sk = [{ id: 'sla_personal_space', level: 1 }];
    const PS = L('sla_personal_space', 1).dmg;
    // a crash is a collision: a crash kill is environmental (+20 Hype, +4 more for hitting two foes)
    let f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_minion', x: 4, y: 4 }, { id: 'test_archer', x: 8, y: 8 }] });
    const mini = at(4, 4);
    mini.hp = 2;
    const hh = f.s.hype;
    use(f.u, 'sla_personal_space', 4, 4);
    t.ok(mini.dead, 'crash kill');
    t.eq(f.s.hype - hh, 24, 'crash kill: environmental +20, multi-hit +4');
    t.eq(f.s.stats.envKills, 1, 'crash kill counted as environmental');
    // pit: YEET (environmental kill, +20 Hype)
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_archer', x: 8, y: 8 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'pit'; } });
    let g = at(2, 4);
    const hype0 = f.s.hype;
    t.eq(use(f.u, 'sla_personal_space', 4, 4), true, 'pit: thrown');
    t.ok(g.dead, 'pit: YEETed');
    t.eq(f.s.hype - hype0, 20, 'pit: +20 Hype (environmental kill)');
    // deep water too
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_archer', x: 8, y: 8 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'deep_water'; } });
    g = at(2, 4);
    use(f.u, 'sla_personal_space', 3, 4);
    t.ok(g.dead, 'deep water: sinks');
    // over a pit onto solid ground: it flies over
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'pit'; } });
    g = at(2, 4);
    use(f.u, 'sla_personal_space', 4, 4);
    t.ok(!g.dead && g.x === 4, 'flies over a pit');
    // lava: 8 fire + Burn on landing, then the impact
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 3 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'lava'; } });
    g = at(2, 4);
    use(f.u, 'sla_personal_space', 4, 4);
    t.eq(g.hp, 42 - 8 - PS, 'lava: 8 + ' + PS);
    t.ok(has(g, 'burn'), 'lava: Burning');
    // water: Wet (the lightning combo, see the combos suite)
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'water'; } });
    g = at(2, 4);
    use(f.u, 'sla_personal_space', 4, 4);
    t.ok(has(g, 'wet') && g.x === 4, 'water: Wet');
    // wall: stops short with a BONK
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'wall'; } });
    g = at(2, 4);
    t.ok(valid(f.u, 'sla_personal_space', 5, 4), 'wall: can aim past it');
    use(f.u, 'sla_personal_space', 5, 4);
    t.ok(g.x === 3 && g.hp === 14 - PS, 'wall: stops before it and still takes its ' + PS);
    // tall objects stop it like walls, low ones are flown over
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }], objects: [{ x: 3, y: 4, id: 'crate' }, { x: 5, y: 4, id: 'pillar' }] });
    g = at(2, 4);
    use(f.u, 'sla_personal_space', 5, 4);
    t.ok(g.x === 4, 'over the crate, stopped by the pillar (at ' + g.x + ')');
    // map edge
    f = fight({ w: 6, slate: { x: 3, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    g = at(4, 4);
    t.ok(!valid(f.u, 'sla_personal_space', 6, 4), 'edge: no target off the map');
    t.eq(use(f.u, 'sla_personal_space', 5, 4), true, 'edge: thrown to the last tile');
    t.ok(g.x === 5, 'edge: landed on the edge tile');
    // objects: a crate shatters on a goblin; an explosive barrel explodes; a keg floods
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 4, y: 4 }], objects: [{ x: 2, y: 4, id: 'crate' }] });
    t.eq(use(f.u, 'sla_personal_space', 4, 4), true, 'crate: thrown');
    t.eq(at(4, 4).hp, 14 - PS, 'crate: the goblin took ' + PS);
    t.ok(!DD.Grid.tile(2, 4).obj && !DD.Grid.tile(4, 4).obj && !DD.Grid.tile(3, 4).obj, 'crate: shattered');
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 5 }], objects: [{ x: 2, y: 4, id: 'barrel_explosive' }] });
    t.eq(use(f.u, 'sla_personal_space', 4, 4), true, 'barrel: thrown');
    t.eq(at(5, 4).hp, 14 - 8, 'barrel: explodes where it lands (8 fire to a neighbour)');
    t.eq(at(4, 5).hp, 14 - 8, 'barrel: radius 1');
    t.eq(f.u.hp, f.u.maxHp, 'barrel: Slate stood clear');
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], objects: [{ x: 2, y: 4, id: 'keg' }] });
    use(f.u, 'sla_personal_space', 4, 4);
    t.ok(has(at(4, 4), 'wet') && has(at(5, 4), 'wet'), 'keg: floods the landing (Wet foes)');
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 4, y: 4 }], objects: [{ x: 2, y: 4, id: 'sla_boulder' }] });
    t.eq(use(f.u, 'sla_personal_space', 4, 4), true, 'boulder: throwable');
    t.eq(at(4, 4).hp, 14 - PS, 'boulder: ' + PS + ' damage');
    // things he can't throw: allies, immovable foes, levers (a pushable boss is fair game)
    f = fight({ slate: { x: 4, y: 4, skills: sk }, allies: [{ id: 'test_knight', x: 5, y: 4 }], enemies: [{ id: 'test_brute', x: 4, y: 5 }, { id: 'test_grunt', x: 8, y: 8 }],
      objects: [{ x: 4, y: 3, id: 'lever' }] });
    t.eq(DD.Targeting.validTargets(f.u, slotOf(f.u, 'sla_personal_space')).length, 0, 'no allies, immovable brutes or levers');
    f = fight({ w: 11, slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_boss', x: 2, y: 4 }] });
    const boss = at(2, 4), bhp = boss.hp;
    t.eq(use(f.u, 'sla_personal_space', 5, 4), true, 'the (pushable) Test Overlord can be thrown');
    t.ok(boss.x === 5 && boss.hp === bhp - (PS - boss.armor), 'boss: lands 3 further and takes ' + PS + ' − armor');
    // throwing the held foe ends the hold
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    g = at(2, 4);
    DD.Slate.grab(f.u, g, 1);
    use(f.u, 'sla_personal_space', 4, 4);
    t.ok(!has(g, 'sla_grappled') && !DD.Slate.heldBy(f.u) && g.x === 4, 'a held foe flies, and the hold ends');
    // crashing into an ally: the ally is spared
    f = fight({ slate: { x: 1, y: 4, skills: sk }, allies: [{ id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    const mage = at(4, 4);
    use(f.u, 'sla_personal_space', 4, 4);
    t.eq(mage.hp, mage.maxHp, 'friends are never hurt by his throws');
    t.ok(at(3, 4) && at(3, 4).side === 'enemy', 'the goblin bounced off the mage');
  });

  // ---- Hard Pass (id sla_rocks_fall) ---------------------------------------------------------------------------
  T.suite('hero_slate: Hard Pass — boulder lob, no LOS, the Boulder stays', function (t) {
    for (let lv = 1; lv <= 3; lv++) {
      const Lv = L('sla_rocks_fall', lv);
      const sk = [{ id: 'sla_rocks_fall', level: lv }];
      const f = fight({ w: 10, slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 1 + Lv.range, y: 4 }],
        terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'wall'; } });
      t.ok(valid(f.u, 'sla_rocks_fall', 1 + Lv.range, 4), 'L' + lv + ': range ' + Lv.range + ', over a wall (no LOS needed)');
      t.ok(!valid(f.u, 'sla_rocks_fall', 2 + Lv.range, 4), 'L' + lv + ': not ' + (Lv.range + 1));
      t.ok(!valid(f.u, 'sla_rocks_fall', 2, 4), 'L' + lv + ': not at a wall');
      t.eq(use(f.u, 'sla_rocks_fall', 1 + Lv.range, 4), true, 'L' + lv + ': lobbed');
      t.eq(at(1 + Lv.range, 4).hp, 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage');
      t.ok(!DD.Grid.tile(1 + Lv.range, 4).obj, 'L' + lv + ': no boulder under a goblin');
      t.eq(slotOf(f.u, 'sla_rocks_fall').cd, 2, 'L' + lv + ': cooldown 2');
      t.eq(f.u.ap, 1, 'L' + lv + ': 2 AP');
    }
    const sk = [{ id: 'sla_rocks_fall', level: 1 }];
    let f = fight({ slate: { x: 1, y: 4, skills: sk }, allies: [{ id: 'test_knight', x: 4, y: 6 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }, { id: 'test_grunt', x: 5, y: 4 }] });
    t.ok(!valid(f.u, 'sla_rocks_fall', 4, 6), 'never on a friend');
    t.eq(use(f.u, 'sla_rocks_fall', 4, 4), true, 'lobbed at empty floor');
    const b = DD.Grid.tile(4, 4).obj;
    t.ok(b && b.id === 'sla_boulder' && b.hp === 5, 'empty tile: the Boulder stays');
    t.ok(!DD.Grid.isWalkable(4, 4), 'the Boulder blocks movement');
    t.ok(DD.Combat.smashable(b), 'heroes can Smash it');
    t.eq(at(5, 4).hp, 14, 'no splash on the neighbours');
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'water'; if (tl.x === 3 && tl.y === 5) tl.t = 'pit'; } });
    use(f.u, 'sla_rocks_fall', 4, 4);
    slotOf(f.u, 'sla_rocks_fall').cd = 0; f.u.ap = 3;
    use(f.u, 'sla_rocks_fall', 3, 5);
    t.ok(!DD.Grid.tile(4, 4).obj && !DD.Grid.tile(3, 5).obj, 'no boulder in water or pits');
    f = fight({ slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 5, y: 5 }, { id: 'test_grunt', x: 4, y: 5 }], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
    use(f.u, 'sla_rocks_fall', 4, 4);
    t.ok(!DD.Grid.tile(4, 4).obj || DD.Grid.tile(4, 4).obj.id !== 'barrel_explosive', 'it smashes objects (the barrel went off)');
    t.ok(at(4, 5).hp === 14 - 8 && at(5, 5).hp === 14, 'the barrel blast hits its neighbour (8), not a diagonal 2 away');
  });

  // ---- Air Mail -----------------------------------------------------------------------------------------------
  T.suite('hero_slate: Air Mail — throw an ally, landing thud', function (t) {
    for (let lv = 1; lv <= 3; lv++) {
      const Lv = L('sla_air_mail', lv);
      const sk = [{ id: 'sla_air_mail', level: lv }];
      const tx = 4 + Lv.range;
      let f = fight({ w: 11, slate: { x: 3, y: 3, skills: sk }, allies: [{ id: 'test_knight', x: 4, y: 3 }],
        enemies: [{ id: 'test_grunt', x: tx + 1, y: 3 }, { id: 'test_grunt', x: tx, y: 4 }, { id: 'test_grunt', x: tx, y: 5 }] });
      const kn = at(4, 3);
      t.ok(valid(f.u, 'sla_air_mail', tx, 3), 'L' + lv + ': lands ' + Lv.range + ' further');
      t.ok(!valid(f.u, 'sla_air_mail', tx + 1, 3), 'L' + lv + ': not onto a foe');
      t.eq(use(f.u, 'sla_air_mail', tx, 3), true, 'L' + lv + ': mailed');
      t.ok(kn.x === tx && kn.y === 3, 'L' + lv + ': the knight landed at ' + tx + ',3');
      t.ok(at(tx + 1, 3).hp === 14 - Lv.thud && at(tx, 4).hp === 14 - Lv.thud, 'L' + lv + ': foes next to the landing take ' + Lv.thud);
      t.eq(at(tx, 5).hp, 14, 'L' + lv + ': a foe 2 away does not');
      t.eq(kn.hp, kn.maxHp, 'L' + lv + ': the ally is unhurt');
      t.eq(kn.block, 0, 'L' + lv + ': and gets no Block (one rider: the thud)');
      t.eq(slotOf(f.u, 'sla_air_mail').cd, Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      t.eq(f.u.ap, 2, 'L' + lv + ': 1 AP');
      t.ok(new RegExp('take ' + Lv.thud + ' damage').test(desc('sla_air_mail', lv)), 'L' + lv + ': desc shows the thud');
      f = fight({ w: 11, slate: { x: 3, y: 3, skills: sk }, allies: [{ id: 'test_knight', x: 4, y: 3 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      t.ok(!valid(f.u, 'sla_air_mail', tx + 1, 3), 'L' + lv + ': out of range');
    }
    const sk = [{ id: 'sla_air_mail', level: 1 }];
    let f = fight({ slate: { x: 1, y: 4, skills: sk }, allies: [{ id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
      terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'lava'; if (tl.x === 4 && tl.y === 4) tl.t = 'pit'; } });
    t.ok(!valid(f.u, 'sla_air_mail', 3, 4) && !valid(f.u, 'sla_air_mail', 4, 4), 'never into lava or a pit');
    t.ok(valid(f.u, 'sla_air_mail', 5, 4), 'but happily over them');
    f = fight({ slate: { x: 1, y: 4, skills: sk }, allies: [{ id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
      terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'wall'; } });
    t.ok(!valid(f.u, 'sla_air_mail', 4, 4) && !valid(f.u, 'sla_air_mail', 5, 4), 'not through a wall');
    // immovable allies (a turret) can't be mailed; summons can
    f = fight({ slate: { x: 1, y: 4, skills: sk }, allies: [{ id: 'test_summoner', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    const owner = at(1, 2);
    const tur = DD.Act.summon(owner, 'test_turret', 2, 4, { noFx: true });
    t.ok(tur && tur.x === 2, 'turret placed next to Slate');
    t.ok(!valid(f.u, 'sla_air_mail', 4, 4), 'immovable turrets can\'t be mailed');
    const hound = DD.Combat.party().filter(function (x) { return x.defId === 'test_hound'; })[0];
    t.ok(!!hound, 'the summoner brought a hound');
    if (hound) {
      DD.Act.teleport(hound, 1, 5, { fx: false, noEnter: true });
      t.ok(valid(f.u, 'sla_air_mail', 1, 7), 'summons can be mailed');
      t.eq(use(f.u, 'sla_air_mail', 1, 7), true, 'hound mailed');
      t.ok(hound.x === 1 && hound.y === 7, 'hound landed');
    }
  });

  // ---- Putting My Foot Down ------------------------------------------------------------------------------------
  T.suite('hero_slate: Putting My Foot Down — cone, push', function (t) {
    for (let lv = 1; lv <= 3; lv++) {
      const Lv = L('sla_foot_down', lv);
      const sk = [{ id: 'sla_foot_down', level: lv }];
      const f = fight({ w: 11, slate: { x: 2, y: 4, skills: sk }, allies: [{ id: 'test_knight', x: 4, y: 3 }],
        enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 5 }] });
      const a = at(3, 4), b = at(4, 5), kn = at(4, 3);
      const ctx = DD.Targeting.buildCtx(f.u, slotOf(f.u, 'sla_foot_down'), { x: 3, y: 4 });
      t.eq(ctx.tiles.length, Lv.len === 2 ? 4 : 9, 'L' + lv + ': cone of ' + Lv.len);
      t.eq(use(f.u, 'sla_foot_down', 3, 4), true, 'L' + lv + ': stomped');
      t.ok(a.hp === 14 - Lv.dmg && b.hp === 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' to each foe');
      t.ok(a.x === 3 + Lv.push && a.y === 4, 'L' + lv + ': near foe pushed ' + Lv.push + ' (at ' + a.x + ')');
      t.ok(b.x === 4 + Lv.push && b.y === 5, 'L' + lv + ': far foe pushed ' + Lv.push);
      t.ok(kn.x === 4 && kn.y === 3 && kn.hp === kn.maxHp, 'L' + lv + ': the ally is untouched');
      t.eq(DD.Grid.tile(3, 4).t, 'stone', 'L' + lv + ': no hidden rubble');
      t.eq(slotOf(f.u, 'sla_foot_down').cd, 2, 'L' + lv + ': cooldown 2');
    }
    // the push is the combo: into a pit
    let f = fight({ slate: { x: 2, y: 4, skills: [{ id: 'sla_foot_down', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'pit'; } });
    const g = at(3, 4);
    use(f.u, 'sla_foot_down', 3, 4);
    t.ok(g.dead, 'stomped into the pit: YEET');
    // a held foe is pushed like any other (and the hold ends: they are apart)
    f = fight({ slate: { x: 2, y: 4, skills: [{ id: 'sla_foot_down', level: 2 }] }, enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const h = at(3, 4);
    DD.Slate.grab(f.u, h, 1);
    use(f.u, 'sla_foot_down', 3, 4);
    t.ok(h.x === 5 && !has(h, 'sla_grappled'), 'held foe: pushed 2, the hold ends (no special case)');
  });

  // ---- Get Off My Lawn -------------------------------------------------------------------------------------------
  T.suite('hero_slate: Get Off My Lawn — Taunt for exactly its next turn, Block until his', function (t) {
    for (let lv = 1; lv <= 3; lv++) {
      const Lv = L('sla_lawn', lv);
      const f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_lawn', level: lv }] },
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_archer', x: 4, y: 6 }, { id: 'test_archer', x: 4, y: 1 }] });
      const g = at(5, 4), near = at(4, 6), far = at(4, 1);
      t.eq(use(f.u, 'sla_lawn', 4, 4), true, 'L' + lv + ': yelled');
      t.eq(f.u.block, Lv.block, 'L' + lv + ': +' + Lv.block + ' Block');
      t.ok(has(g, 'taunt') && has(near, 'taunt') && st(g, 'taunt').source === f.u.id, 'L' + lv + ': foes within ' + Lv.r + ' taunted by Slate');
      t.eq(has(far, 'taunt'), Lv.r >= 3, 'L' + lv + ': a foe 3 away ' + (Lv.r >= 3 ? 'too' : 'not'));
      t.ok(g.x === 5 && near.y === 6, 'L' + lv + ': nobody is shoved (one rider: the Block)');
      t.eq(rage(f.u), 0, 'L' + lv + ': no free Rage');
      t.eq(slotOf(f.u, 'sla_lawn').cd, 2, 'L' + lv + ': cooldown 2');
      t.eq(f.u.ap, 2, 'L' + lv + ': 1 AP');
    }
    // with the AI: the archer would finish the mage; taunted, it must shoot Slate, for exactly its next turn
    function lawnFight(yell) {
      const f = fight({ ai: true, slate: { x: 4, y: 4, skills: [{ id: 'sla_lawn', level: 1 }] }, allies: [{ id: 'test_mage', x: 1, y: 6, hp: 4 }],
        enemies: [{ id: 'test_archer', x: 4, y: 6 }] });
      if (yell) use(f.u, 'sla_lawn', 4, 4);
      return { f: f, u: f.u, mage: at(1, 6), arch: at(4, 6) };
    }
    let c = lawnFight(false);
    untilTurnOf(c.u);
    t.ok(c.mage.hp < 4 || c.mage.downed, 'control: the archer shoots the wounded mage');
    c = lawnFight(true);
    let during = -1;
    const off = DD.Events.on('turn:start', function (e) { if (e.unit && e.unit.side === 'enemy') during = c.u.block; });
    c.u.ap = 0;
    pass();   // the mage's turn (she waits for input)
    t.ok(DD.Combat.current() && DD.Combat.current().defId === 'test_mage', 'the mage\'s turn comes first (heroes first)');
    DD.Combat.current().ap = 0;
    pass();   // the archer (taunted), then round 2
    off();
    t.eq(during, 4, 'the Block was still up when the archer\'s turn started');
    t.eq(c.mage.hp, 4, 'taunted: the archer left the mage alone');
    t.eq(c.u.hp, L5_HP, 'it shot Slate instead, into his Block (4 − 1 armor = 3 blocked)');
    t.ok(!has(c.arch, 'taunt'), 'the taunt ended with its turn');
    t.ok(DD.Combat.current() === c.u && c.u.block === 0, 'round 2: Slate\'s Block is gone at the start of his turn');
    t.eq(rage(c.u), 1, 'and the blocked arrow annoyed him (+1 Rage)');
  });

  // ---- Rock Bottom ----------------------------------------------------------------------------------------------
  T.suite('hero_slate: Rock Bottom — over the shoulder, pits, lava, edges; III stuns its next turn', function (t) {
    for (let lv = 1; lv <= 3; lv++) {
      const Lv = L('sla_rock_bottom', lv);
      const sk = [{ id: 'sla_rock_bottom', level: lv }];
      const f = fight({ ai: true, slate: { x: 4, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 2 }] });
      const g = at(5, 4);
      t.eq(use(f.u, 'sla_rock_bottom', 5, 4), true, 'L' + lv + ': used');
      t.ok(g.x === 3 && g.y === 4, 'L' + lv + ': slammed onto the tile behind him');
      t.eq(g.hp, 28 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage');
      t.eq(has(g, 'stun'), !!Lv.stun, 'L' + lv + ': ' + (Lv.stun ? 'Stunned' : 'no stun'));
      t.eq(slotOf(f.u, 'sla_rock_bottom').cd, 2, 'L' + lv + ': cooldown 2');
      t.eq(f.u.ap, 1, 'L' + lv + ': 2 AP');
      f.u.ap = 0;
      pass();
      if (Lv.stun) {
        t.eq(f.u.hp, L5_HP, 'L' + lv + ': the stunned grunt lost its turn');
        t.ok(!has(g, 'stun'), 'L' + lv + ': stun gone at the end of that turn');
        f.u.ap = 0;
        pass();
        t.eq(f.u.hp, L5_HP - 3, 'L' + lv + ': next round it stabs again (4 − 1 armor)');
      } else {
        t.eq(f.u.hp, L5_HP - 3, 'L' + lv + ': no stun: it stabs right back');
      }
    }
    const sk = [{ id: 'sla_rock_bottom', level: 1 }];
    const RB = L('sla_rock_bottom', 1).dmg;
    let f = fight({ slate: { x: 4, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'pit'; } });
    let g = at(5, 4);
    const h0 = f.s.hype;
    use(f.u, 'sla_rock_bottom', 5, 4);
    t.ok(g.dead, 'pit behind him: gone');
    t.eq(f.s.hype - h0, 20, 'pit: environmental kill Hype');
    f = fight({ slate: { x: 4, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'lava'; } });
    g = at(5, 4);
    use(f.u, 'sla_rock_bottom', 5, 4);
    t.ok(g.x === 3 && g.hp === 42 - 8 - RB && has(g, 'burn'), 'lava behind him: 8 lava + ' + RB + ' slam + Burn (' + g.hp + ')');
    f = fight({ slate: { x: 4, y: 4, skills: sk }, allies: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    g = at(5, 4);
    const kn = at(3, 4);
    use(f.u, 'sla_rock_bottom', 5, 4);
    t.ok(g.x === 5 && g.hp === 14 - RB && kn.hp === kn.maxHp, 'no room behind him: slammed in place, the ally is fine');
    f = fight({ slate: { x: 0, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 1, y: 4 }] });
    g = at(1, 4);
    use(f.u, 'sla_rock_bottom', 1, 4);
    t.ok(g.x === 1 && g.hp === 14 - RB, 'map edge behind him: slammed in place');
    f = fight({ slate: { x: 4, y: 4, skills: sk }, enemies: [{ id: 'test_brute', x: 5, y: 4 }] });
    t.ok(!valid(f.u, 'sla_rock_bottom', 5, 4), 'immovable foes are too heavy to lift');
    // a held foe stays held when slammed behind him (still next to him: no special rule)
    f = fight({ slate: { x: 4, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 2 }] });
    g = at(5, 4);
    DD.Slate.grab(f.u, g, 1);
    use(f.u, 'sla_rock_bottom', 5, 4);
    t.ok(g.x === 3 && g.hp === 28 - RB && DD.Slate.heldBy(f.u) === g, 'held foe: ' + RB + ' (no bonus), still held behind him');
  });

  // ---- Blow a Gasket --------------------------------------------------------------------------------------------
  T.suite('hero_slate: Blow a Gasket — spend all Rage', function (t) {
    for (let lv = 1; lv <= 3; lv++) {
      const Lv = L('sla_gasket', lv);
      [0, 2, 5].forEach(function (r) {
        const f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_gasket', level: lv }] }, allies: [{ id: 'test_knight', x: 3, y: 4 }],
          enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 5, y: 5, hpMult: 3 }, { id: 'test_grunt', x: 3, y: 3, hpMult: 3 }, { id: 'test_archer', x: 6, y: 4 }] });
        setRage(f.u, r);
        const kn = at(3, 4);
        const want = Lv.dmg + Lv.per * r;
        t.ok(new RegExp('\\(' + want + ' right now\\)').test(desc('sla_gasket', lv, f.u)), 'L' + lv + ' R' + r + ': desc shows ' + want + ' right now');
        t.eq(use(f.u, 'sla_gasket', 4, 4), true, 'L' + lv + ' Rage ' + r + ': vented');
        // spent first: the runes are dark when it lands, so no flare bonus on top
        t.ok(at(5, 4).hp === 42 - want && at(5, 5).hp === 42 - want && at(3, 3).hp === 42 - want, 'L' + lv + ' Rage ' + r + ': ' + want + ' to each foe around him');
        t.eq(at(6, 4).hp, 10, 'L' + lv + ': a foe 2 away is out of it');
        t.eq(kn.hp, kn.maxHp, 'L' + lv + ': the ally next to him is fine');
        t.eq(rage(f.u), 0, 'L' + lv + ': all Rage spent');
        t.eq(f.u.hp, f.u.maxHp, 'L' + lv + ': no hidden heal');
        t.eq(slotOf(f.u, 'sla_gasket').cd, 3, 'L' + lv + ': cooldown 3');
      });
    }
    const f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_gasket', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    DD.Act.addStatus(f.u, 'silenced', { turns: 1 }, at(5, 4));
    t.eq(DD.Combat.canUse(f.u, slotOf(f.u, 'sla_gasket')), 'Silenced!', 'rune magic: silenced blocks it');
  });

  // ---- Get Over Here -------------------------------------------------------------------------------------------
  T.suite('hero_slate: Get Over Here — rune-chain pull', function (t) {
    for (let lv = 1; lv <= 3; lv++) {
      const Lv = L('sla_get_over_here', lv);
      const sk = [{ id: 'sla_get_over_here', level: lv }];
      let f = fight({ w: 10, slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 1 + Lv.range, y: 4 }, { id: 'test_grunt', x: 3, y: 6 }] });
      const g = at(1 + Lv.range, 4);
      t.ok(!valid(f.u, 'sla_get_over_here', 3, 6), 'L' + lv + ': straight lines only');
      t.eq(use(f.u, 'sla_get_over_here', 1 + Lv.range, 4), true, 'L' + lv + ': lashed at ' + Lv.range);
      t.ok(g.x === 2 && g.y === 4, 'L' + lv + ': yanked next to him');
      t.eq(g.hp, 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage');
      t.ok(!has(g, 'sla_grappled'), 'L' + lv + ': not grabbed (one rider: the pull)');
      t.eq(f.u.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(slotOf(f.u, 'sla_get_over_here').cd, 2, 'L' + lv + ': cooldown 2');
      f = fight({ w: 10, slate: { x: 1, y: 4, skills: sk }, enemies: [{ id: 'test_grunt', x: 2 + Lv.range, y: 4 }] });
      t.ok(!valid(f.u, 'sla_get_over_here', 2 + Lv.range, 4), 'L' + lv + ': not ' + (Lv.range + 1));
    }
    let f = fight({ slate: { x: 1, y: 4, skills: [{ id: 'sla_get_over_here', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 4, y: 4 }], terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'wall'; } });
    t.ok(!valid(f.u, 'sla_get_over_here', 4, 4), 'needs line of sight');
    f = fight({ slate: { x: 1, y: 4, skills: [{ id: 'sla_get_over_here', level: 3 }] }, enemies: [{ id: 'test_brute', x: 4, y: 4 }] });
    use(f.u, 'sla_get_over_here', 4, 4);
    t.ok(at(4, 4) && at(4, 4).defId === 'test_brute', 'immovable foes are not yanked');
    f = fight({ slate: { x: 1, y: 4, skills: [{ id: 'sla_get_over_here', level: 1 }] }, enemies: [{ id: 'test_boss', x: 4, y: 4 }] });
    use(f.u, 'sla_get_over_here', 4, 4);
    t.ok(at(2, 4) && at(2, 4).defId === 'test_boss', 'a pushable boss is yanked like by any pull');
    // something in the way: the pull stops at it (the engine's bump)
    f = fight({ w: 10, slate: { x: 1, y: 4, skills: [{ id: 'sla_get_over_here', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }] });
    use(f.u, 'sla_get_over_here', 5, 4);
    t.ok(at(4, 4) && at(4, 4).hp === 14 - 2 - 3 && at(3, 4).hp === 14 - 3, 'blocked: stops at the goblin in between, both bump for 3');
    f = fight({ slate: { x: 1, y: 4, skills: [{ id: 'sla_get_over_here', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    DD.Act.addStatus(f.u, 'silenced', { turns: 1 }, at(4, 4));
    t.eq(DD.Combat.canUse(f.u, slotOf(f.u, 'sla_get_over_here')), 'Silenced!', 'silenced blocks the rune-chain');
  });

  // ---- Tectonic Tantrum -------------------------------------------------------------------------------------------
  T.suite('hero_slate: Tectonic Tantrum — signature', function (t) {
    let f = fight({ w: 11, h: 11, slate: { x: 5, y: 5 }, allies: [{ id: 'test_knight', x: 4, y: 5 }],
      enemies: [{ id: 'test_grunt', x: 6, y: 5, hpMult: 3 }, { id: 'test_grunt', x: 5, y: 3, hpMult: 3 }, { id: 'test_grunt', x: 5, y: 8, hpMult: 3 },
        { id: 'test_grunt', x: 9, y: 5, hpMult: 3 }] });
    const sig = f.u.signature;
    t.eq(DD.Combat.canUse(f.u, sig), 'Needs 100 Hype.', 'needs 100 Hype');
    f.s.hype = 100;
    const e = at(6, 5), n = at(5, 3), s3 = at(5, 8), far = at(9, 5), kn = at(4, 5);
    t.eq(DD.Combat.useSkill(f.u, sig, 5, 5), true, 'TANTRUM');
    t.ok(e.x === 8 && e.y === 5 && e.hp === 42 - 15, 'east foe: 15, knocked 2 east (at ' + e.x + ',' + e.y + ', ' + e.hp + ')');
    t.ok(n.x === 5 && n.y === 1 && n.hp === 42 - 15, 'north foe: knocked 2 north');
    t.ok(s3.x === 5 && s3.y === 8 && s3.hp === 42 && far.hp === 42, 'foes 3+ away are untouched');
    t.ok(kn.x === 4 && kn.hp === kn.maxHp, 'the ally stays put and unhurt');
    t.eq(rage(f.u), 5, 'then his Rage maxes out');
    t.ok(f.s.hype < 100, 'Hype spent');
    // the Rage comes after: a calm Slate deals 15, a flared one 17
    f = fight({ w: 11, h: 11, slate: { x: 5, y: 5 }, enemies: [{ id: 'test_grunt', x: 6, y: 5, hpMult: 3 }] });
    setRage(f.u, 3);
    f.s.hype = 100;
    DD.Combat.useSkill(f.u, f.u.signature, 5, 5);
    t.eq(at(8, 5).hp, 42 - 17, 'already flared: 15 + 2');
    // a knock into a foe outside the blast: the engine's bump (3 each)
    f = fight({ w: 11, h: 11, slate: { x: 5, y: 5 }, enemies: [{ id: 'test_grunt', x: 6, y: 5, hpMult: 3 }, { id: 'test_grunt', x: 8, y: 5, hpMult: 3 }] });
    f.s.hype = 100;
    const a = at(6, 5), b = at(8, 5);
    DD.Combat.useSkill(f.u, f.u.signature, 5, 5);
    t.ok(a.x === 7 && a.hp === 42 - 15 - 3, 'bump: stops short, 15 + 3');
    t.eq(b.hp, 42 - 3, 'bump: the one it hit took 3');
    // immovable foes just take the damage; map edges bump; pits YEET
    f = fight({ w: 7, h: 7, slate: { x: 5, y: 3 }, enemies: [{ id: 'test_brute', x: 4, y: 3 }, { id: 'test_grunt', x: 6, y: 3, hpMult: 3 }, { id: 'test_grunt', x: 5, y: 2 }],
      terrain: function (tl) { if (tl.x === 5 && tl.y === 0) tl.t = 'pit'; } });
    f.s.hype = 100;
    const brute = at(4, 3), bhp = brute.hp, g = at(6, 3), pg = at(5, 2);
    DD.Combat.useSkill(f.u, f.u.signature, 5, 3);
    t.ok(brute.x === 4 && brute.hp === bhp - (15 - brute.armor), 'immovable: not moved, still hurt');
    t.ok(g.x === 6 && g.hp === 42 - 15 - 3, 'edge: bonks against the edge (15 + 3)');
    t.ok(pg.dead, 'into the pit: YEET');
  });

  // ---- items ------------------------------------------------------------------------------------------------------
  T.suite('hero_slate: items — Mitts, Cardigan, Grudge Ledger', function (t) {
    let f = fight({ w: 11, slate: { x: 1, y: 4, items: ['sla_mitts'], skills: [{ id: 'sla_personal_space', level: 1 }, { id: 'sla_air_mail', level: 1 }] },
      enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 2 }] });
    t.ok(Math.abs(f.u.dmgBonus - 0.1) < 1e-9, 'Mitts: +10% damage');
    t.ok(valid(f.u, 'sla_personal_space', 6, 4) && !valid(f.u, 'sla_personal_space', 7, 4), 'Mitts: Personal Space throws 4 (3 + 1)');
    t.ok(/up to 4 tiles/.test(desc('sla_personal_space', 1, f.u)) && /up to 4 tiles/.test(desc('sla_air_mail', 1, f.u)), 'Mitts: the descs say 4 for him');
    t.ok(/up to 3 tiles/.test(desc('sla_personal_space', 1, null)), 'without them: 3');
    use(f.u, 'sla_personal_space', 6, 4);
    t.eq(at(6, 4).hp, 28 - Math.round(L('sla_personal_space', 1).dmg * 1.1), 'Mitts: the throw hits for its damage × 1.1');
    f = fight({ w: 11, slate: { x: 3, y: 3, items: ['sla_mitts'], skills: [{ id: 'sla_air_mail', level: 1 }] }, allies: [{ id: 'test_knight', x: 4, y: 3 }], enemies: [{ id: 'test_grunt', x: 9, y: 8 }] });
    t.ok(valid(f.u, 'sla_air_mail', 8, 3) && !valid(f.u, 'sla_air_mail', 9, 3), 'Mitts: Air Mail throws 4 (3 + 1)');
    // Cardigan: 2 Block for every Rage gained
    f = fight({ slate: { x: 1, y: 4, items: ['sla_cardigan'] }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    t.eq(f.u.maxHp, L5_HP + 6, 'Cardigan: +6 max HP');
    t.eq(f.u.block, 0, 'Cardigan: no starting Block');
    DD.Act.damage(at(2, 4), f.u, 2);
    t.eq(f.u.block, 2, 'Cardigan: a hit (+1 Rage) → 2 Block');
    DD.Slate.gainRage(f.u, 2);
    t.eq(f.u.block, 6, 'Cardigan: +2 Rage → 4 more');
    f = fight({ slate: { x: 5, y: 5, items: ['sla_cardigan'] }, enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    f.s.hype = 100;
    DD.Combat.useSkill(f.u, f.u.signature, 5, 5);
    t.ok(rage(f.u) === 5 && f.u.block === 10, 'Cardigan: the Tantrum\'s 5 Rage → 10 Block');
    // Grudge Ledger: every grudge counts twice
    f = fight({ slate: { x: 1, y: 4, items: ['sla_ledger'] }, allies: [{ id: 'test_cleric', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    t.eq(rage(f.u), 0, 'Ledger: no starting Rage (no combat-start freebies)');
    t.ok(Math.abs(f.u.dmgBonus - 0.1) < 1e-9, 'Ledger: +10% damage');
    DD.Act.damage(at(2, 4), f.u, 2);
    t.eq(rage(f.u), 2, 'Ledger: a hit → 2 Rage');
    DD.Act.heal(at(1, 3), f.u, 1);
    t.ok(rage(f.u) === 4 && !DD.Slate.flared(f.u) === false, 'Ledger: a heal → 2 more (flared after two touches)');
    DD.Act.damage(at(2, 4), f.u, 2);
    t.eq(rage(f.u), 5, 'Ledger: still capped at 5');
  });

  // ---- combos with other heroes -----------------------------------------------------------------------------------
  T.suite('hero_slate: combos — water + lightning, pull into reach, Air Mail delivery, heals feed Rage', function (t) {
    const p0 = DD.problems.length;
    // 1. Personal Space into water → Wet → the mage's Chain Zap (lightning) + the water shocks and stuns it
    function zap(water) {
      const f = fight({ w: 10, slate: { x: 1, y: 4, skills: [{ id: 'sla_personal_space', level: 1 }] },
        allies: [{ id: 'test_mage', x: 4, y: 1, skills: [{ id: 'test_chain_zap', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 3 }],
        terrain: function (tl) { if (water && tl.x === 4 && tl.y === 4) tl.t = 'water'; } });
      const g = at(2, 4);
      use(f.u, 'sla_personal_space', 4, 4);
      const hp = g.hp;
      pass();   // the mage's turn
      const mage = DD.Combat.current();
      t.ok(mage && mage.defId === 'test_mage', 'zap: the mage acts next');
      const ok = DD.Combat.useSkill(mage, slotOf(mage, 'test_chain_zap'), g.x, g.y);
      return { ok: ok, lost: hp - g.hp, g: g };
    }
    const dry = zap(false), wet = zap(true);
    t.ok(dry.ok && wet.ok, 'the mage zaps the thrown goblin both times');
    t.ok(has(wet.g, 'stun') && !has(dry.g, 'stun'), 'thrown into water: the zap electrifies the pool and stuns it');
    t.ok(wet.lost > dry.lost + 3, 'Wet + shock: ' + wet.lost + ' damage vs ' + dry.lost + ' on dry ground');
    // 2. Get Over Here drags the backline archer into the knight's reach (heroes first: the knight acts next)
    let f = fight({ w: 10, slate: { x: 1, y: 4, skills: [{ id: 'sla_get_over_here', level: 1 }] }, allies: [{ id: 'test_knight', x: 2, y: 5 }],
      enemies: [{ id: 'test_archer', x: 5, y: 4 }] });
    const arch = at(5, 4);
    use(f.u, 'sla_get_over_here', 5, 4);
    t.ok(arch.x === 2 && arch.y === 4, 'pulled next to Slate, right in front of the knight');
    pass();
    const kn = DD.Combat.current();
    t.ok(kn && kn.defId === 'test_knight' && DD.Combat.useSkill(kn, kn.basic, 2, 4), 'the knight slashes it on his turn');
    // 3. Air Mail delivers the knight into the goblins: thud now, his own attack on his turn
    f = fight({ w: 11, slate: { x: 3, y: 3, skills: [{ id: 'sla_air_mail', level: 1 }] }, allies: [{ id: 'test_knight', x: 4, y: 3 }],
      enemies: [{ id: 'test_grunt', x: 8, y: 3 }, { id: 'test_grunt', x: 7, y: 4 }] });
    use(f.u, 'sla_air_mail', 7, 3);
    t.ok(at(8, 3).hp === 11 && at(7, 4).hp === 11, 'special delivery: 3 to each goblin next to the landing');
    pass();
    const kn2 = DD.Combat.current();
    t.ok(kn2 && kn2.x === 7 && kn2.y === 3 && DD.Combat.useSkill(kn2, kn2.basic, 8, 3), 'and the knight follows up on his turn');
    // 4. healers and buffers make him angrier: the cleric flares his runes for him
    f = fight({ slate: { x: 4, y: 4 }, allies: [{ id: 'test_cleric', x: 4, y: 6, skills: [{ id: 'test_heal', level: 1 }, { id: 'test_bless', level: 1 }] }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    DD.Act.damage(at(5, 4), f.u, 6);
    t.eq(rage(f.u), 1, 'hit once');
    pass();
    const cl = DD.Combat.current();
    t.ok(cl && cl.defId === 'test_cleric', 'the cleric\'s turn');
    DD.Combat.useSkill(cl, slotOf(cl, 'test_heal'), 4, 4);
    DD.Combat.useSkill(cl, slotOf(cl, 'test_bless'), 4, 4);
    t.ok(rage(f.u) === 3 && DD.Slate.flared(f.u), 'healed (+1) and Inspired (+1): runes flare ("Did I ASK?")');
    noErrors(t, 'combos', p0);
  });

  // ---- previews vs reality --------------------------------------------------------------------------------------
  /** A busy board: pits, lava, water, wall, barrels, keg, crate, boulder, an ally, several foes. */
  function busy(skills, rageN, extra) {
    const f = fight(Object.assign({
      w: 11, h: 9, seed: 21,
      slate: { x: 4, y: 4, level: 6, skills: skills },
      allies: [{ id: 'test_knight', x: 3, y: 4 }, { id: 'test_mage', x: 1, y: 1 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 5 }, { id: 'test_archer', x: 4, y: 1 }, { id: 'test_minion', x: 7, y: 4 },
        { id: 'test_grunt', x: 6, y: 6, hpMult: 2 }, { id: 'test_minion', x: 4, y: 7 }],
      objects: [{ x: 4, y: 3, id: 'barrel_explosive' }, { x: 2, y: 2, id: 'keg' }, { x: 8, y: 2, id: 'crate' }, { x: 2, y: 4, id: 'sla_boulder' }],
      terrain: function (tl) {
        if (tl.x === 8 && tl.y === 4) tl.t = 'pit';
        if (tl.x === 4 && tl.y === 8) tl.t = 'lava';
        if (tl.x === 1 && tl.y >= 4 && tl.y <= 6) tl.t = 'water';
        if (tl.x === 6 && tl.y === 2) tl.t = 'wall';
      },
    }, extra || {}));
    if (rageN) setRage(f.u, rageN);
    f.s.hype = 100;
    f.u.ap = 10;
    return f;
  }
  function hpMap(s) { const m = {}; s.units.forEach(function (u) { m[u.id] = { hp: u.hp, dead: !!u.dead, downed: !!u.downed }; }); return m; }

  T.suite('hero_slate: previews match reality and leak nothing', function (t) {
    let checked = 0;
    const p0 = DD.problems.length;
    ALL_SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      for (let lv = 1; lv <= s.levels.length; lv++) {
        [0, 3].forEach(function (rg) {
          const sk = POOL.indexOf(id) >= 0 ? [{ id: id, level: lv }] : [];
          const f0 = busy(sk, rg);
          const targets = DD.Targeting.validTargets(f0.u, slotOf(f0.u, id)).slice(0, 6);
          targets.forEach(function (tg) {
            const f = busy(sk, rg);
            const u = f.u, sl = slotOf(u, id);
            if (id === 'sla_rock_bottom' || id === 'sla_personal_space') DD.Slate.grab(u, at(5, 4), 1);   // a held foe in the mix
            const snap = function () {
              return JSON.stringify([f.s.units.map(function (x) { return [x.id, x.x, x.y, x.hp, x.block, (x.statuses || []).map(function (q) { return [q.id, q.stacks, q.turns, q.source]; })]; }),
                f.s.hype, f.s.grid.tiles.map(function (tl) { return [tl.t, tl.obj && tl.obj.id, tl.surface && tl.surface.id]; })]);
            };
            const before = snap();
            const prev = DD.Combat.preview(u, sl, tg.x, tg.y);
            t.ok(before === snap(), id + ' L' + lv + ' R' + rg + ' @' + tg.x + ',' + tg.y + ': preview left the fight untouched');
            const pre = hpMap(f.s), hype0 = f.s.hype;
            t.eq(DD.Combat.useSkill(u, sl, tg.x, tg.y), true, id + ' L' + lv + ' @' + tg.x + ',' + tg.y + ': used');
            f.s.units.forEach(function (x) {
              const b = pre[x.id];
              if (!b || b.dead) return;
              const e = prev.perUnit[x.id];
              const real = b.hp - x.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
              if (real !== said) t.fail(id + ' L' + lv + ' R' + rg + ' @' + tg.x + ',' + tg.y + ': ' + x.name + ' HP ' + real + ' real vs ' + said + ' preview');
              const down = (x.dead && !b.dead) || (x.downed && !b.downed);
              if (down !== !!(e && e.lethal)) t.fail(id + ' L' + lv + ' @' + tg.x + ',' + tg.y + ': ' + x.name + ' lethal mismatch');
            });
            t.eq(f.s.hype - hype0, prev.hype, id + ' L' + lv + ' @' + tg.x + ',' + tg.y + ': Hype predicted');
            t.ok(!prev.uncertain, id + ' L' + lv + ' @' + tg.x + ',' + tg.y + ': no dice, so the preview is exact');
            checked++;
          });
        });
      }
    });
    t.ok(checked >= 60, 'compared ' + checked + ' previews');
    t.log('previews compared: ' + checked);
    noErrors(t, 'previews', p0);
  });

  // ---- v2 edge cases ----------------------------------------------------------------------------------------------
  T.suite('hero_slate: v2 edge cases — disabled users, not his turn, deaths mid-skill, no AP, odd targets', function (t) {
    const p0 = DD.problems.length;
    ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (sid) {
      const f = busy(POOL.slice(0, 4).map(function (id) { return { id: id, level: 2 }; }), 0);
      DD.Act.addStatus(f.u, sid, { turns: 1 }, at(5, 4));
      DD.Combat.slotsOf(f.u).forEach(function (sl) { t.ok(DD.Combat.canUse(f.u, sl) !== true, sid + ': ' + sl.id + ' blocked'); });
    });
    // a stun from a foe's turn costs exactly his next turn (0 AP, the turn passes by itself)
    let f = fight({ allies: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    DD.Act.addStatus(f.u, 'stun', { turns: 1 }, at(8, 8));
    f.u.ap = 0;
    pass();                      // the knight's turn
    DD.Combat.current().ap = 0;
    pass();                      // round 2: Slate is stunned → his turn passes → the knight again
    t.ok(DD.Combat.current() && DD.Combat.current().defId === 'test_knight' && DD.Combat.state.round === 2, 'stunned: his round-2 turn passed by itself');
    t.ok(!has(f.u, 'stun'), 'and the stun is gone after it');
    DD.Combat.current().ap = 0;
    pass();
    t.ok(DD.Combat.current() === f.u && f.u.ap === 3, 'round 3: his turn again, 3 AP');
    // silenced: spells blocked, attacks fine
    f = busy([{ id: 'sla_gasket', level: 1 }, { id: 'sla_get_over_here', level: 1 }, { id: 'sla_hold_still', level: 1 }, { id: 'sla_personal_space', level: 1 }], 0);
    DD.Act.addStatus(f.u, 'silenced', { turns: 1 }, at(5, 4));
    t.ok(DD.Combat.canUse(f.u, slotOf(f.u, 'sla_gasket')) !== true && DD.Combat.canUse(f.u, slotOf(f.u, 'sla_get_over_here')) !== true, 'silenced: spells blocked');
    t.eq(DD.Combat.canUse(f.u, slotOf(f.u, 'sla_hold_still')), true, 'silenced: grabbing is not a spell');
    // charmed: can't hurt the charmer, can still throw it
    f = fight({ slate: { x: 1, y: 4, skills: [{ id: 'sla_personal_space', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    let g = at(2, 4);
    DD.Act.addStatus(f.u, 'charmed', { turns: 1 }, g);
    use(f.u, 'sla_personal_space', 4, 4);
    t.ok(g.x === 4 && g.hp === 14, 'charmed: the charmer is thrown but not hurt');
    // not his turn / not enough AP
    f = fight({ slate: { x: 1, y: 4, skills: [{ id: 'sla_personal_space', level: 1 }] }, allies: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    DD.Combat.setOrder(['test_knight']);
    DD.Combat.giveTurnTo(at(1, 1));
    t.ok(/Not Slate's turn|Not your turn/.test(String(DD.Combat.canUse(f.u, slotOf(f.u, 'sla_personal_space')))), 'on the knight\'s turn: "' + DD.Combat.canUse(f.u, slotOf(f.u, 'sla_personal_space')) + '"');
    f = fight({ slate: { x: 1, y: 4, skills: [{ id: 'sla_personal_space', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    f.u.ap = 1;
    t.eq(DD.Combat.canUse(f.u, slotOf(f.u, 'sla_personal_space')), 'Not enough AP.', 'not enough AP');
    // the thrown foe dies on landing before it can crash (lava); the one it would hit is untouched
    f = fight({ slate: { x: 1, y: 4, skills: [{ id: 'sla_personal_space', level: 1 }] }, enemies: [{ id: 'test_minion', x: 2, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'lava'; } });
    g = at(2, 4);
    use(f.u, 'sla_personal_space', 4, 4);
    t.ok(g.dead && at(5, 4).hp === 14, 'dies in lava mid-throw, nothing else happens');
    // a 1-HP foe dies from its crash; the one it hit still takes the hit
    f = fight({ slate: { x: 1, y: 4, skills: [{ id: 'sla_personal_space', level: 1 }] }, enemies: [{ id: 'test_minion', x: 2, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
    g = at(2, 4); g.hp = 1;
    use(f.u, 'sla_personal_space', 4, 4);
    t.ok(g.dead && at(4, 4).hp === 14 - L('sla_personal_space', 1).dmg, 'crash: thrown foe dies, the hit one still takes the hit');
    // Slate downed mid-skill (thorns): no errors, nothing weird
    f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_rock_bottom', level: 3 }] }, allies: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }] });
    g = at(5, 4);
    DD.Act.addStatus(g, 'thorns', { stacks: 50, turns: 2 }, g);
    f.u.hp = 1;
    use(f.u, 'sla_rock_bottom', 5, 4);
    t.ok(f.u.downed, 'Slate downed by thorns mid-slam');
    t.ok(!f.s.result, 'the fight goes on (the knight stands)');
    // a held victim slammed to death: nothing left over
    f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_rock_bottom', level: 3 }] }, enemies: [{ id: 'test_minion', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    g = at(5, 4);
    DD.Slate.grab(f.u, g, 2);
    use(f.u, 'sla_rock_bottom', 5, 4);
    t.ok(g.dead && !DD.Slate.heldBy(f.u), 'held victim slammed to death: hold cleaned up');
    // pushes into pits / lava / water at the edge of the map
    f = fight({ w: 5, h: 5, slate: { x: 1, y: 2, skills: [{ id: 'sla_foot_down', level: 2 }] }, enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 3 }, { id: 'test_grunt', x: 3, y: 1, hpMult: 3 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 2) tl.t = 'lava'; if (tl.x === 4 && tl.y === 1) tl.t = 'water'; } });
    use(f.u, 'sla_foot_down', 2, 2);
    const ga = at(4, 2), gb = at(4, 1);
    t.ok(ga && has(ga, 'burn') && ga.hp === 42 - 5 - 8, 'stomped into lava at the map edge (5 + 8, Burning)');
    t.ok(gb && has(gb, 'wet'), 'stomped into the water: Wet');
    // executes tolerate odd contexts (null target unit, nothing to throw, no ally to mail)
    f = fight({ slate: { x: 4, y: 4 }, enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    ALL_SKILLS.forEach(function (id) {
      const def = DD.getSkill(id);
      [{ x: 4, y: 6 }, { x: 0, y: 0 }, null].forEach(function (tg) {
        t.tryRun(id + ' odd target', function () {
          DD.Combat._action(function () { DD.Combat.resolveSkill(f.u, def, tg, { quiet: true }); });
        });
      });
    });
    t.ok(f.u.x === 4 && f.u.y === 4 && f.u.hp === f.u.maxHp, 'odd contexts did nothing silly');
    // a whole AI round with a hold, a taunt and a stun on the board: no errors, statuses tick per own turn
    f = fight({ ai: true, slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 3 }, { id: 'sla_lawn', level: 1 }] },
      allies: [{ id: 'test_knight', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_archer', x: 4, y: 6 }, { id: 'test_minion', x: 8, y: 8 }] });
    use(f.u, 'sla_hold_still', 5, 4);
    use(f.u, 'sla_lawn', 4, 4);
    for (let i = 0; i < 4 && !f.s.result; i++) DD.Combat.endRound();
    t.ok(!has(at(5, 4) || f.u, 'sla_grappled') || DD.Slate.heldBy(f.u), 'after 4 rounds the hold is over (or still a real one)');
    t.ok(DD.Combat.state.units.every(function (x) { return (x.statuses || []).every(function (q) { return q.id !== 'taunt' || q.turns >= 0; }); }), 'statuses sane');
    noErrors(t, 'edge cases', p0);
  });

  // ---- AutoPlay battles ---------------------------------------------------------------------------------------------
  /** v2 leveling: level 1 = the two starters; 3 = two more learned; 5 = four skills, two upgraded to II. */
  function slateKit(level, variant) {
    const one = function (id, lv) { return { id: id, level: lv || 1 }; };
    if (level <= 1) return [one('sla_hold_still'), one('sla_personal_space')];
    if (level <= 3) return variant ? [one('sla_hold_still'), one('sla_personal_space'), one('sla_foot_down'), one('sla_get_over_here')]
      : [one('sla_hold_still'), one('sla_personal_space'), one('sla_rocks_fall'), one('sla_lawn')];
    return variant ? [one('sla_hold_still', 2), one('sla_personal_space', 2), one('sla_rock_bottom'), one('sla_gasket')]
      : [one('sla_personal_space', 2), one('sla_air_mail'), one('sla_hold_still', 2), one('sla_lawn')];
  }
  function battles(t, acts, kinds, levels) {
    const used = {};
    let fights = 0, wins = 0, slateUses = 0;
    const p0 = DD.problems.length;
    acts.forEach(function (act) {
      levels.forEach(function (level) {
        kinds.forEach(function (kind, ki) {
          const enc = DD.getEncounter('test_a' + act + '_' + kind);
          if (!enc) return;
          const party = ['slate', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
            return DD.Combat.makeRunHero(id === 'slate' ? { id: id, level: level, skills: slateKit(level, (act + ki) % 2) } : { id: id, level: level });
          });
          const rng = DD.RNG('sla-autoplay-v2:' + t.seed + ':' + act + ':' + level + ':' + kind);
          const setup = DD.Encounter.build(enc, party, { rng: rng, difficulty: 'normal', act: act });
          DD.Combat.start(setup, { seed: rng.int(1, 1e9), headless: true, difficulty: 'normal', kind: kind });
          const s = DD.Combat.state;
          DD.Act.addRule({ id: 'sla_usage_probe', name: 'Usage Probe', hooks: { onSkillUsed: function (ctx) {
            if (ctx.user && ctx.user.defId === 'slate' && !DD.Act.simulating) { used[ctx.skill.id] = (used[ctx.skill.id] || 0) + 1; slateUses++; }
          } } });
          const res = DD.AutoPlay.runBattle(30);
          fights++;
          if (res.result === 'victory') wins++;
          t.ok(res.result === 'victory' || res.result === 'defeat' || res.timeout, 'act ' + act + ' L' + level + ' ' + kind + ': battle finished (' + res.result + ', ' + res.rounds + ' rounds)');
          t.ok(Array.isArray(s.order) && s.order.length > 0, 'act ' + act + ' L' + level + ' ' + kind + ': initiative was rolled');
          s.units.forEach(function (x) {
            if (!x.dead && !x.downed && !DD.Grid.isWalkable(x.x, x.y, x)) t.fail('act ' + act + ' L' + level + ' ' + kind + ': ' + x.name + ' ended on an unwalkable tile');
          });
        });
      });
    });
    noErrors(t, 'battles', p0);
    t.log('fights ' + fights + ', wins ' + wins + ', Slate skill uses ' + slateUses + ': ' + JSON.stringify(used));
    return { used: used, fights: fights, wins: wins, uses: slateUses };
  }

  T.suite('hero_slate: AutoPlay v2 battles — acts 1-3 normal + elite at levels 1 / 3 / 5', function (t) {
    const r = battles(t, [1, 2, 3], ['normal', 'elite'], [1, 3, 5]);
    t.ok(r.fights >= 18, 'fought ' + r.fights);
    t.ok(r.uses >= r.fights, 'Slate acts in these fights (' + r.uses + ' skill uses)');
    t.ok(Object.keys(r.used).length >= 5, 'Slate uses a spread of his kit: ' + Object.keys(r.used).join(', '));
    // (the fixture elite is an immovable brute he can't lift, so his lifts shine in the boss suite below)
    const skillUses = r.uses - (r.used.sla_love_tap || 0);
    t.ok(skillUses >= r.fights / 2, 'not just Love Tap: ' + skillUses + ' uses of his skills');
    t.ok(r.wins >= r.fights / 2, 'the party wins most of them (' + r.wins + '/' + r.fights + ')');
  });

  T.suite('hero_slate: AutoPlay v2 battles — the fixture boss at levels 1 / 3 / 5', function (t) {
    const b = battles(t, [1, 2, 3], ['boss'], [1, 3, 5]);
    t.ok(b.fights >= 9, 'fought ' + b.fights);
    t.ok(b.uses >= b.fights, 'Slate acts in these fights (' + b.uses + ' skill uses)');
    t.ok(Object.keys(b.used).length >= 4, 'a spread of skills: ' + Object.keys(b.used).join(', '));
    t.ok(b.used.sla_personal_space > 0 && b.used.sla_hold_still > 0, 'the starting throw and grapple get used (the Overlord can be lifted)');
    t.ok(b.wins >= b.fights / 2, 'the party wins most of them (' + b.wins + '/' + b.fights + ')');
  });

  T.suite('hero_slate: AutoPlay finds the set pieces (pit throw, Tantrum) and tooltips render', function (t) {
    function probe() {
      const used = [];
      DD.Act.addRule({ id: 'sla_pick_probe', name: 'Probe', hooks: { onSkillUsed: function (ctx) { if (ctx.user && ctx.user.defId === 'slate' && !DD.Act.simulating) used.push(ctx.skill.id); } } });
      return used;
    }
    // a goblin between Slate and a pit: the throw is a YEET
    let f = fight({ slate: { x: 2, y: 4, skills: [{ id: 'sla_personal_space', level: 1 }, { id: 'sla_hold_still', level: 1 }] },
      enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_archer', x: 8, y: 0 }], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } });
    let used = probe();
    const g = at(3, 4);
    DD.AutoPlay.takeTurn();
    t.ok(used.indexOf('sla_personal_space') >= 0 && g.dead, 'AutoPlay throws the goblin into the pit (' + used.join(', ') + ')');
    // three foes around him and 100 Hype: TANTRUM
    f = fight({ w: 11, h: 11, slate: { x: 5, y: 5 }, enemies: [{ id: 'test_grunt', x: 6, y: 5 }, { id: 'test_grunt', x: 4, y: 5 }, { id: 'test_grunt', x: 5, y: 4 }] });
    f.s.hype = 100;
    used = probe();
    DD.AutoPlay.takeTurn();
    t.ok(used.indexOf('sla_tantrum') >= 0, 'AutoPlay throws a Tectonic Tantrum at 100 Hype (' + used.join(', ') + ')');
    // HUD / codex tooltips for every skill, item and status
    if (DD.UI && typeof DD.UI.skillTooltipHtml === 'function') {
      ALL_SKILLS.forEach(function (id) {
        for (let lv = 1; lv <= DD.getSkill(id).levels.length; lv++) {
          const h = DD.UI.skillTooltipHtml(id, lv, f.u);
          t.ok(typeof h === 'string' && h.length > 50 && !/undefined|NaN/.test(h), 'tooltip ' + id + ' L' + lv);
        }
      });
      ['sla_mitts', 'sla_cardigan', 'sla_ledger'].forEach(function (id) {
        const h = DD.UI.itemTooltipHtml(id);
        t.ok(typeof h === 'string' && h.length > 50 && !/undefined|NaN/.test(h), 'item tooltip ' + id);
      });
      [{ id: 'sla_rage', stacks: 3, turns: -1, source: null, data: {} }, { id: 'sla_grappled', stacks: 1, turns: 2, source: f.u.id, data: {} }].forEach(function (s) {
        const h = DD.UI.statusTooltipHtml(s);
        t.ok(typeof h === 'string' && h.length > 50 && !/undefined|NaN/.test(h), 'status tooltip ' + s.id);
      });
    } else t.log('DD.UI not loaded: tooltips skipped');
  });

  // ---- sprite ----------------------------------------------------------------------------------------------------
  T.suite('hero_slate: sprite, rune flare, holding pose, portrait and Boulder painter', function (t) {
    const p0 = DD.problems.length;
    const spec = DD.getHero('slate').sprite;
    const W = 160, H = 180;
    function paint(statuses, opts, unitIn) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const unit = unitIn || { id: 'sla_probe', defId: 'slate', kind: 'hero', statuses: statuses || [], flags: {}, data: {} };
      DD.Sprites.draw(c.getContext('2d'), spec, W / 2, H - 20, 2, Object.assign({ t: 1.3, unit: unit, still: true }, opts || {}));
      const d = c.getContext('2d').getImageData(0, 0, W, H).data;
      let px = 0, cyan = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 30) px++;
        if (d[i + 3] > 30 && d[i] < 170 && d[i + 1] > 200 && d[i + 2] > 215) cyan++;
      }
      return { px: px, cyan: cyan, data: d };
    }
    const calm = paint([]);
    const hot = paint([{ id: 'sla_rage', stacks: 5, turns: -1 }]);
    t.ok(calm.px > 2000, 'paints a big golem (' + calm.px + ' px)');
    t.ok(hot.cyan > calm.cyan * 2 + 40, 'runes flare cyan at Rage 3+ (' + calm.cyan + ' → ' + hot.cyan + ')');
    ['attack', 'cast', 'hurt', 'downed'].forEach(function (pose) { t.ok(paint([], { pose: pose, poseT: 0.4 }).px > 1000, 'pose ' + pose); });
    t.ok(paint([{ id: 'sla_rage', stacks: 4, turns: -1 }], { still: false, facing: -1 }).px > 1000, 'animated, facing left');
    // the holding pose reads the board: a Grappled foe sourced to him
    const f = fight({ slate: { x: 4, y: 4, skills: [{ id: 'sla_hold_still', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    const free = paint(null, {}, f.u);
    use(f.u, 'sla_hold_still', 5, 4);
    const holding = paint(null, {}, f.u);
    let diff = 0;
    for (let i = 3; i < free.data.length; i += 4) if ((free.data[i] > 30) !== (holding.data[i] > 30)) diff++;
    t.ok(diff > 30, 'he reaches out while holding someone (' + diff + ' px differ)');
    const m = DD.Sprites.metrics('slate');
    t.ok(m.height > 44 && m.height < 56, 'about 50 px tall at zoom 1 (' + Math.round(m.height) + ')');
    const pc = DD.Sprites.portrait('slate', 64);
    t.ok(pc && pc.width === 64, 'portrait');
    const c = document.createElement('canvas');
    c.width = 80; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.translate(40, 50);
    DD.getObject('sla_boulder').draw(DD.Iso.painter(ctx, {}), { id: 'sla_boulder', hp: 5, maxHp: 5, data: {} }, 0);
    const d = ctx.getImageData(0, 0, 80, 80).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 30) n++;
    t.ok(n > 300, 'Boulder painter draws (' + n + ' px)');
    t.eq(DD.problems.slice(p0).filter(function (w) { return /Sprite|sprite|Error in/.test(w); }).length, 0, 'no sprite warnings');
  });
})();

