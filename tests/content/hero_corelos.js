/* Dungeons and Degenerates — tests/content/hero_corelos.js
 * Suites "hero_corelos: …" for js/data/heroes/corelos.js (v2: initiative, no telegraphs, no Guard): registry + barks +
 * sprite, every skill at every level in DD.Combat.sandbox fights (exact damage vs armor-free fixture foes, statuses,
 * displacement, summons, costs, cooldowns, charges), runes on the paths enemies walk on their own turns (and on pushes,
 * pulls, teleports, flyers), Debt + Collateral Damage, the signature, the three items, v2 edge cases (silenced / stunned
 * / sheep / charmed user, dying targets, hazards, edges, AP, statuses lasting exactly the right own turns), previews
 * (no side effects, exact) and AutoPlay battles in acts 1-3 at levels 1 / 3 / 5.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const P = 'hero_corelos: ';

  // ---- helpers ------------------------------------------------------------------------------------
  function S() { return DD.Combat.state; }
  function A() { return DD.Act; }
  function units(defId) { return S().units.filter(function (u) { return u.defId === defId && !u.dead; }); }
  function cor() { return S().units.filter(function (u) { return u.defId === 'corelos'; })[0]; }
  function hasRune(x, y) { const t = DD.Grid.tile(x, y); return !!(t && t.obj && t.obj.id === 'cor_rune'); }
  function debt(u) { return DD.Corelos.debt(u); }
  function st(u, id) { return A().getStatus(u, id); }
  function hype(k) { return (DD.Balance && DD.Balance.hype && DD.Balance.hype[k]) || { kill: 8, envKill: 20 }[k]; }

  /**
   * Sandbox: Corelos at (cx, cy) with socketed skills, fixture foes. Initiative 'heroesFirst' (Corelos, then the allies
   * in the listed order, then the foes) unless cfg.order; the AI only acts with ai: true (else enemyAi: false). The
   * fight never ends on its own (custom objective) so deaths can be inspected. Round 1, Corelos' turn.
   */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = [{ id: 'corelos', x: cfg.cx === undefined ? 1 : cfg.cx, y: cfg.cy === undefined ? 4 : cfg.cy, level: cfg.level || 1,
      skills: cfg.skills || [], items: cfg.items, hp: cfg.hp }].concat(cfg.allies || []);
    const s = DD.Combat.sandbox({
      w: cfg.w || 9, h: cfg.h || 9, seed: cfg.seed || 7, enemyAi: cfg.ai ? undefined : false, noPlan: !!cfg.noPlan,
      objective: cfg.objective || { type: 'custom' }, encounter: cfg.objective ? null : { id: 'cor_test', checkObjective: function () { return null; } },
      heroes: heroes, enemies: cfg.enemies || [], objects: cfg.objects, terrain: cfg.terrain, order: cfg.order,
    });
    const me = cor();
    if (cfg.ap !== undefined) me.ap = cfg.ap;
    return { s: s, me: me, slot: me.skills[0] || null };
  }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0]; }
  function use(t, u, slot, x, y, label) {
    const ok = DD.Combat.useSkill(u, slot, x, y);
    t.ok(ok, label + ': useSkill(' + slot.id + ' @' + x + ',' + y + ') succeeded (canUse: ' + DD.Combat.canUse(u, slot) + ')');
    return ok;
  }
  function L(id, lv) { return DD.skillLevel(DD.getSkill(id), lv); }
  function desc(id, lv, user) { return DD.skillDesc(DD.getSkill(id), lv, user === undefined ? null : user); }
  function corridor() { return function (tl) { if (tl.y === 0 || tl.y === 2) tl.t = 'wall'; }; }
  function stunFoes(turns) {
    S().units.forEach(function (u) { if (u.side === 'enemy' && !u.dead) A().addStatus(u, 'stun', { turns: turns || 3, silent: true }, null); });
  }
  /** Preview at a target, then the real use: HP changes, downs and spawns must match exactly. */
  function previewMatches(t, u, slot, x, y, label) {
    const s = S();
    const fp = T.contentHelpers.fingerprint(s);
    const prev = DD.Combat.preview(u, slot, x, y);
    t.eq(T.contentHelpers.fingerprint(s), fp, label + ': preview left the real state untouched');
    t.ok(!prev.uncertain, label + ': preview is certain (no dice)');
    const before = {};
    s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: o.dead, downed: o.downed }; });
    const born = s.units.length;
    use(t, u, slot, x, y, label);
    let bad = 0;
    s.units.forEach(function (o) {
      const b = before[o.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[o.id];
      const real = b.hp - o.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
      if (real !== said) { bad++; t.fail(label + ': ' + o.name + ' HP change ' + real + ' vs preview ' + said); }
      const down = (o.dead && !b.dead) || (o.downed && !b.downed);
      if (down !== !!(e && e.lethal)) { bad++; t.fail(label + ': ' + o.name + ' lethal mismatch'); }
    });
    t.eq(s.units.filter(function (o, i) { return i >= born && !o.dead; }).length, (prev.spawned || []).length, label + ': spawned count matches the preview');
    t.ok(!bad, label + ': preview == reality');
    return prev;
  }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  // ---- registry ------------------------------------------------------------------------------------
  T.suite(P + 'registry, stats, barks, sprite and items (v2: simple kit, init +1, available from the start)', function (t) {
    const h = DD.getHero('corelos');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.eq(h.name, 'Corelos', 'name');
    t.ok(h.epithet && h.race && h.cls && h.role && h.blurb && h.color, 'epithet / race / cls / role / blurb / color');
    t.eq(h.unlock, null, 'available from the start (v2: unlock null)');
    t.eq(h.stats.init, 1, 'initiative modifier +1');
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov >= 3 && h.stats.mov <= 5 && !h.stats.block, 'DESIGN §5 stats, no Block stat');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth +3-5 HP');
    t.eq(h.startingSkills.length, 2, 'exactly 2 starting skills');
    t.ok(h.skillPool.length >= 9 && h.skillPool.length <= 10, 'pool of 9-10 skills (DESIGN v2 8-10, content suite 9-11): ' + h.skillPool.length);
    h.startingSkills.forEach(function (id) { t.ok(h.skillPool.indexOf(id) >= 0, id + ' starter in the pool'); });
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic / signature are not socketable');
    t.eq(DD.getSkill(h.signature).hype, 100, 'signature costs 100 Hype');
    t.eq(L(h.basic, 1).dmg, 4, 'basic attack deals 4 (its runes do the rest)');
    t.eq(DD.getSkill(h.basic).ap, 1, 'basic attack costs 1 AP');
    t.eq(JSON.stringify(h.summons), JSON.stringify(['cor_imp']), 'summons listed');
    t.ok(!DD.getSkill('cor_attorney') && !DD.getStatus('cor_attorney') && !DD.getStatus('cor_contract'), 'v1 Power of Attorney and the contract shield are gone');
    const all = h.skillPool.concat([h.basic, h.signature, 'cor_imp_poke', 'cor_imp_objection']);
    const v1 = /telegraph|intent|guard|planning|player phase|this round/i;
    all.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && id.indexOf('cor_') === 0, id + ' registered with the cor_ prefix');
      if (!s) return;
      t.ok(typeof s.icon === 'string' && s.icon.length > 0 && s.icon.length <= 3, id + ' has one emoji icon');
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = DD.skillDesc(s, lv, null);
        t.ok(d && !/undefined|NaN|null/.test(d), id + ' L' + lv + ' desc without a user: ' + d);
        t.ok(!v1.test(d), id + ' L' + lv + ': no v1 wording (telegraphs / intents / Guard / planning): ' + d);
        t.ok(words(d) <= 26, id + ' L' + lv + ': the desc reads in one breath (' + words(d) + ' words): ' + d);
      }
      t.ok(!s.flavor || s.flavor.length <= 120, id + ' flavor ≤ 120 chars');
    });
    h.skillPool.forEach(function (id) { t.eq(DD.getSkill(id).levels.length, 3, id + ' has 3 levels'); });
    const costs = h.skillPool.map(function (id) { const s = DD.getSkill(id); return typeof s.ap === 'function' ? s.ap(s.levels[0]) : s.ap; });
    t.ok(costs.indexOf(0) >= 0 && costs.indexOf(1) >= 0 && costs.indexOf(2) >= 0, 'a mix of AP costs: ' + costs.join(','));
    t.ok(h.skillPool.some(function (id) { return DD.getSkill(id).charges > 0; }), 'a big skill with charges');
    t.ok(!v1.test(h.passive.desc) && !v1.test(h.blurb) && !v1.test(h.role), 'passive / blurb / role: no v1 wording');
    t.ok(/Debt/.test(h.passive.desc) && /pays off 4/.test(h.passive.desc), 'passive: one clear rule (kills pay off Debt): ' + h.passive.desc);
    ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'].forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ' has 4-6 lines (' + lines.length + ')');
      lines.forEach(function (b) {
        t.ok(typeof b === 'string' && b.length > 0 && b.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(b) + ' (' + b.length + ')');
        t.ok(!v1.test(b), 'bark without v1 wording: ' + b);
      });
    });
    const imp = DD.getSummon('cor_imp');
    t.ok(!!imp && imp.flags.flying && imp.names.length >= 4, 'imp summon: flying, named');
    ['spawn', 'attack', 'hurt', 'death'].forEach(function (k) { (imp.barks[k] || []).forEach(function (b) { t.ok(b.length <= 70, 'imp bark ≤ 70: ' + b); }); });
    t.ok(!!DD.getStatus('cor_debt'), 'status cor_debt');
    t.ok(!!DD.getObject('cor_rune') && DD.getObject('cor_rune').blocksMove === false && !DD.getObject('cor_rune').hazard, 'rune object: walkable, not a hazard (foes do not avoid it)');
    const items = ['cor_quill', 'cor_soul_card', 'cor_notarized'].map(DD.getItem);
    items.forEach(function (it, i) {
      t.ok(!!it && it.hero === 'corelos', 'item ' + i + ' is Corelos-only');
      if (!it) return;
      t.ok(!(it.stats && it.stats.block) && !(it.hooks && it.hooks.onCombatStart), it.id + ': no starting shield (v2)');
      t.ok(!v1.test(it.desc), it.id + ': no v1 wording');
    });
    t.ok(items.some(function (it) { return it && it.rarity === 'rare'; }) && items.some(function (it) { return it && it.rarity === 'legendary'; }), 'a rare and a legendary item');
    T.contentHelpers.spriteProblems(h.sprite).forEach(function (p) { t.fail('hero sprite: ' + p); });
    T.contentHelpers.spriteProblems(imp.sprite).forEach(function (p) { t.fail('imp sprite: ' + p); });
    if (DD.Sprites && typeof DD.Sprites.portrait === 'function') {
      const pc = DD.Sprites.portrait('corelos', 64);
      t.ok(pc && pc.width > 0, 'portrait renders');
      const cv = document.createElement('canvas'); cv.width = 80; cv.height = 80;
      const c = cv.getContext('2d');
      DD.Sprites.draw(c, h.sprite, 40, 70, 1.5, { t: 1.3 });
      const px = c.getImageData(0, 0, 80, 80).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
      t.ok(n > 400, 'hero sprite paints pixels (' + n + ')');
      const metrics = DD.Sprites.metrics(h.sprite);
      t.ok(metrics.height >= 34 && metrics.height <= 48, 'about 40 px tall at zoom 1 (' + metrics.height + ')');
    }
    if (DD.Render && typeof DD.Render.drawObjectAt === 'function') {
      const cv = document.createElement('canvas'); cv.width = 80; cv.height = 60;
      const c = cv.getContext('2d');
      DD.Render.drawObjectAt(c, { id: 'cor_rune', hp: 0, maxHp: 0, data: { dmg: 6, root: true, seq: 2 } }, 40, 35, 1, {});
      DD.Render.drawObjectAt(c, 'cor_rune', 40, 35, 1, {});
      const px = c.getImageData(0, 0, 80, 60).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
      t.ok(n > 200, 'rune painter draws a visible rune (' + n + ' px)');
    }
    // initiative: +1 on the roll (a rolled fight's entry carries it)
    DD.Combat.start({ grid: DD.Combat.emptyGrid(7, 7), heroes: [{ id: 'corelos', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 5 }] },
      { seed: 3, headless: true, initiative: 'roll' });
    const e = (S().order || []).filter(function (en) { return en.unitId === cor().id; })[0];
    t.ok(!!e && e.init === 1 && e.total === e.roll + 1, 'rolled initiative: d20 + 1 (' + (e && e.roll) + ' + ' + (e && e.init) + ' = ' + (e && e.total) + ')');
  });

  // ---- Rune Bolt -------------------------------------------------------------------------------------
  T.suite(P + 'Rune Bolt (basic) and rune bursts', function (t) {
    const f = fight({ allies: [{ id: 'test_mage', x: 5, y: 6 }], objects: [{ x: 4, y: 5, id: 'crate' }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_grunt', x: 5, y: 7 }] });
    const g = units('test_grunt'), mage = units('test_mage')[0];
    const crateHp = DD.Grid.tile(4, 5).obj.hp;
    t.ok(DD.Corelos.placeRune(f.me, 5, 5, { dmg: 5 }), 'rune placed next to the target');
    t.ok(DD.Corelos.placeRune(f.me, 8, 1, { dmg: 5 }), 'far rune placed');
    const prev = previewMatches(t, f.me, f.me.basic, 5, 4, 'bolt + burst');
    t.ok(prev.tiles.length >= 5, 'the HUD area includes the burst zone (' + prev.tiles.length + ' tiles)');
    t.eq(g[0].hp, 14 - 4 - 5, 'target: 4 bolt + 5 burst');
    t.eq(g[1].hp, 14 - 5, 'foe next to the rune: 5 burst');
    t.eq(g[2].hp, 14, 'foe 2 tiles from the rune: untouched');
    t.ok(!hasRune(5, 5) && hasRune(8, 1), 'only the rune next to the target burst');
    t.eq(mage.hp, mage.maxHp, 'an ally next to the burst is untouched (runes only hurt foes)');
    t.eq(DD.Grid.tile(4, 5).obj.hp, crateHp, 'a crate next to the burst is untouched too (v2: foes only)');
    t.eq(f.me.ap, 2, 'costs 1 AP');
    t.eq(DD.Combat.canUse(f.me, f.me.basic), true, 'no cooldown');
    t.eq(A().statOf(f.me).dmg, 4 + 5 + 5, 'bolt and burst damage credited to Corelos');
    // plain bolt, no runes nearby, and the HUD area is just the target
    const f2 = fight({ enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    const p2 = previewMatches(t, f2.me, f2.me.basic, 4, 4, 'plain bolt');
    t.eq(units('test_grunt')[0].hp, 10, 'plain bolt: 4 damage');
    t.eq(p2.tiles.length, 1, 'plain bolt: the area is the target alone');
    t.ok(!DD.Targeting.isValidTarget(f2.me, f2.me.basic, 6, 4), 'range 4 (no target at 5)');
    // a flyer floats over a rune (no burst), but a bolt at it sets the rune under it off ("on or next to")
    const f3 = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 6 }] });
    const fl = units('test_grunt')[0];
    fl.flags.flying = true;
    DD.Corelos.placeRune(f3.me, 4, 4, { dmg: 5 });
    t.ok(A().teleport(fl, 4, 4) && hasRune(4, 4) && fl.hp === 14, 'a flyer lands on a rune: nothing happens');
    previewMatches(t, f3.me, f3.me.basic, 4, 4, 'bolt at a flyer on a rune');
    t.eq(fl.hp, 14 - 4 - 5, 'the rune under the flyer bursts: 4 + 5');
    t.ok(!hasRune(4, 4), 'rune spent');
    // a bolt that kills its target still sets the runes next to it off
    const f4 = fight({ enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 0.2 }, { id: 'test_grunt', x: 5, y: 5 }] });
    DD.Corelos.placeRune(f4.me, 4, 5, { dmg: 5 });
    previewMatches(t, f4.me, f4.me.basic, 4, 4, 'lethal bolt');
    t.ok(units('test_grunt').length === 1 && units('test_grunt')[0].hp === 14 - 5, 'the target dies; the rune next to it still bursts on its neighbour');
  });

  // ---- Glyph of Warding -------------------------------------------------------------------------------
  T.suite(P + 'Glyph of Warding at every level (rune, damage, binding at III, cap)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_glyph', lv);
      const f = fight({ cx: 2, cy: 4, skills: [{ id: 'cor_glyph', level: lv }], ap: 10,
        allies: [{ id: 'test_mage', x: 4, y: 3 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 6 }] });
      const mage = units('test_mage')[0], grunt = units('test_grunt')[0], far = units('test_grunt')[1];
      t.ok(new RegExp('take ' + Lv.rune + ' damage').test(desc('cor_glyph', lv)), 'L' + lv + ': desc shows ' + Lv.rune + ' damage');
      t.eq(/Rooted/.test(desc('cor_glyph', lv)), !!Lv.root, 'L' + lv + ': desc mentions the root only at III');
      previewMatches(t, f.me, f.slot, 4, 4, 'glyph L' + lv);
      const tl = DD.Grid.tile(4, 4);
      t.ok(hasRune(4, 4), 'L' + lv + ': rune inscribed');
      t.eq(tl.obj.data.dmg, Lv.rune, 'L' + lv + ': rune damage ' + Lv.rune);
      t.eq(!!tl.obj.data.root, !!Lv.root, 'L' + lv + ': binding rune only at III');
      t.ok(new RegExp((Lv.root ? 'Binding Rune' : 'Rune') + ' \\(' + Lv.rune + ' dmg').test(tl.obj.label), 'L' + lv + ': labelled for the inspect panel (' + tl.obj.label + ')');
      t.ok(!st(grunt, 'marked') && !st(far, 'marked'), 'L' + lv + ': no Marks any more (one verb)');
      t.eq(f.me.ap, 9, 'L' + lv + ': 1 AP');
      t.eq(f.slot.cd, 0, 'L' + lv + ': no cooldown');
      // targeting rules
      t.ok(!DD.Targeting.isValidTarget(f.me, f.slot, 4, 3), 'occupied tile is not a target');
      t.ok(!DD.Targeting.isValidTarget(f.me, f.slot, 4, 4), 'a tile that already has a rune is not a target');
      t.ok(!DD.Targeting.isValidTarget(f.me, f.slot, 7, 4), 'range 4 (5 tiles away is out)');
      t.ok(DD.Targeting.isValidTarget(f.me, f.slot, 6, 4), '4 tiles away is in');
      // the grunt is put on the rune: it bursts on it (the ally next to it is safe); binding: Rooted for its next turn
      t.ok(A().teleport(grunt, 4, 4), 'L' + lv + ': the grunt lands on the rune');
      t.eq(grunt.hp, 14 - Lv.rune, 'L' + lv + ': ' + Lv.rune + ' damage to the foe on it');
      t.eq(mage.hp, mage.maxHp, 'L' + lv + ': the ally next to it is safe');
      t.ok(!hasRune(4, 4), 'L' + lv + ': rune spent');
      t.eq(!!st(grunt, 'root'), !!Lv.root, 'L' + lv + ': Rooted only by a binding rune');
      if (Lv.root) t.eq(st(grunt, 'root').turns, 1, 'L3: Rooted for its next turn');
    });
    // cap: the 4th rune makes the oldest fizzle; no runes on objects or over pits
    const f = fight({ cx: 4, cy: 4, skills: [{ id: 'cor_glyph', level: 1 }], ap: 10, objects: [{ x: 4, y: 6, id: 'crate' }],
      terrain: function (tl) { if (tl.x === 6 && tl.y === 6) tl.t = 'pit'; } });
    [[2, 4], [6, 4], [4, 2], [4, 7]].forEach(function (p) { use(t, f.me, f.slot, p[0], p[1], 'cap'); });
    t.eq(DD.Corelos.runes(f.me).length, 3, 'max 3 runes');
    t.ok(!hasRune(2, 4) && hasRune(6, 4) && hasRune(4, 2) && hasRune(4, 7), 'the oldest rune fizzled');
    t.ok(!DD.Targeting.isValidTarget(f.me, f.slot, 4, 6), 'no rune on a crate');
    t.ok(!DD.Targeting.isValidTarget(f.me, f.slot, 6, 6), 'no rune over a pit');
    t.ok(/max 3/.test(desc('cor_glyph', 1, f.me)), 'desc shows the cap');
    // AutoPlay's hint: a rune between foes and the party is worth something, a rune nobody will reach is not
    const fa = fight({ cx: 1, cy: 4, skills: [{ id: 'cor_glyph', level: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    const near = DD.Corelos.runeValue(DD.Targeting.buildCtx(fa.me, fa.slot, { x: 4, y: 4 }));
    const away = DD.Corelos.runeValue(DD.Targeting.buildCtx(fa.me, fa.slot, { x: 1, y: 8 }));
    t.ok(near > 0 && away === 0, 'rune hint: on the path ' + near + ', far behind the party ' + away);
    [[1, 1], [1, 7], [2, 8]].forEach(function (p) { DD.Corelos.placeRune(fa.me, p[0], p[1], { dmg: 5 }); });
    t.eq(DD.Corelos.runeValue(DD.Targeting.buildCtx(fa.me, fa.slot, { x: 4, y: 4 })), 0, 'rune hint at the cap: 0 (a 4th rune only makes one fizzle)');
  });

  // ---- runes on enemy paths ------------------------------------------------------------------------------
  T.suite(P + 'runes punish enemy turns (walks, pushes, pulls, teleports, flyers, allies)', function (t) {
    // a corridor: on its turn the grunt must walk over (4,1) to approach Corelos at (1,1)
    function corr(lv, flying, hpMult) {
      const f = fight({ w: 9, h: 3, cx: 1, cy: 1, ai: true, skills: [{ id: 'cor_glyph', level: lv }], terrain: corridor(),
        enemies: [{ id: 'test_grunt', x: 6, y: 1, hpMult: hpMult }] });
      const g = units('test_grunt')[0];
      if (flying) g.flags.flying = true;
      use(t, f.me, f.slot, 4, 1, 'corridor glyph L' + lv);
      DD.Combat.endTurn();
      return { f: f, g: g };
    }
    let r = corr(1);
    t.eq(S().round, 2, 'its turn is over: round 2, Corelos again');
    t.eq(r.g.hp, 14 - 5, 'walk over the rune on its turn: 5 damage');
    t.ok(!hasRune(4, 1), 'the rune is spent');
    t.eq(r.g.x, 3, 'a plain rune does not stop the walk (ends at 3,1)');
    t.ok(S().log.some(function (e) { return /rune bursts under Test Grunt/.test(e.text); }), 'log line for the trap');
    r = corr(3);
    t.eq(r.g.hp, 14 - 6, 'binding rune: 6 damage');
    t.eq(r.g.x, 4, 'binding rune stops the walk on the rune tile');
    t.ok(!!st(r.g, 'root'), 'and it is Rooted');
    DD.Combat.endTurn();
    t.ok(r.g.x === 4 && r.g.y === 1, 'round 2: still Rooted on its turn, it stays on the rune tile (' + r.g.x + ',' + r.g.y + ')');
    t.ok(!st(r.g, 'root'), 'round 2: the root ends with that turn (its next turn)');
    t.eq(r.f.me.hp, 24, 'nothing reached Corelos yet');
    DD.Combat.endTurn();
    t.ok(r.g.x === 2 && r.f.me.hp === 24 - 4, 'round 3: free again, it walks up and stabs (' + r.g.x + ',' + r.g.y + ', Corelos ' + r.f.me.hp + ')');
    r = corr(1, true);
    t.eq(r.g.hp, 14, 'flyers float over runes');
    t.ok(hasRune(4, 1), 'the rune is still armed after a flyer passed');
    // a rune kill on the enemy's turn: credit, Hype, Debt payoff before his next turn
    const fk = fight({ w: 9, h: 3, cx: 1, cy: 1, ai: true, skills: [{ id: 'cor_glyph', level: 1 }], terrain: corridor(), enemies: [{ id: 'test_grunt', x: 6, y: 1, hpMult: 0.3 }] });
    use(t, fk.me, fk.slot, 4, 1, 'kill glyph');
    DD.Corelos.addDebt(fk.me, 6, fk.me);
    const h0 = S().hype;
    DD.Combat.endTurn();
    t.ok(units('test_grunt').length === 0, 'the rune killed the 4-HP grunt on its own turn');
    t.eq(A().statOf(fk.me).kills, 1, 'kill credited to Corelos');
    t.eq(S().hype - h0, hype('kill'), '+' + hype('kill') + ' Hype for the kill');
    t.eq(fk.me.hp, 24 - 2, 'the kill paid off 4 of the 6 Debt before it came due (paid 2 HP at his turn start)');
    // pushed onto a rune (Restraining Order); allies walk over runes freely on their own turn
    const fp = fight({ cx: 3, cy: 4, skills: [{ id: 'cor_restraining', level: 1 }], allies: [{ id: 'test_mage', x: 1, y: 1 }],
      enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    DD.Corelos.placeRune(fp.me, 6, 4, { dmg: 5 });
    DD.Corelos.placeRune(fp.me, 1, 3, { dmg: 5 });
    const g = units('test_grunt')[0];
    previewMatches(t, fp.me, fp.slot, 3, 4, 'push onto a rune');
    t.eq(g.hp, 14 - 2 - 5, 'pushed 2 tiles onto the rune: 2 + 5');
    t.eq(g.x, 6, 'ends on the rune tile');
    const mage = units('test_mage')[0];
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === mage, 'the mage\'s turn');
    t.ok(DD.Combat.move(mage, 1, 3), 'the ally walks onto a rune');
    t.ok(hasRune(1, 3) && mage.hp === mage.maxHp, 'runes ignore allies');
    // "Rooted for its next turn": a foe pushed onto a binding rune on Corelos' turn can't walk back on its turn
    [false, true].forEach(function (root) {
      const fb = fight({ cx: 3, cy: 4, ai: true, skills: [{ id: 'cor_restraining', level: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }] });
      DD.Corelos.placeRune(fb.me, 6, 4, { dmg: 5, root: root });
      use(t, fb.me, fb.slot, 3, 4, (root ? 'binding' : 'plain') + ' rune push');
      const gb = units('test_grunt')[0];
      t.eq(!!st(gb, 'root'), root, (root ? 'binding' : 'plain') + ' rune: Rooted ' + root);
      DD.Combat.endTurn();
      t.ok(root ? gb.x === 6 && gb.y === 4 && fb.me.hp === 24 : DD.Grid.dist(gb, fb.me) === 1 && fb.me.hp === 20,
        (root ? 'binding rune: it stays put on its turn, Corelos untouched' : 'plain rune: it walks back and stabs Corelos') + ' (at ' + gb.x + ',' + gb.y + ', Corelos ' + fb.me.hp + ')');
    });
    // pulled across two runes (You've Been Served)
    const fl = fight({ cx: 1, cy: 4, skills: [{ id: 'cor_served', level: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 4, hpMult: 2 }] });
    DD.Corelos.placeRune(fl.me, 4, 4, { dmg: 5 });
    DD.Corelos.placeRune(fl.me, 3, 4, { dmg: 5 });
    const big = units('test_grunt')[0];
    previewMatches(t, fl.me, fl.slot, 6, 4, 'pull across runes');
    t.eq(big.hp, 28 - 4 - 5 - 5, 'pulled over two runes: 4 + 5 + 5');
    t.eq(big.x, 2, 'pulled 4 tiles, next to Corelos');
    t.eq(DD.Corelos.runes(fl.me).length, 0, 'both runes spent');
    // teleported foes set runes off; spawned ones do not
    const ft = fight({ enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    DD.Corelos.placeRune(ft.me, 4, 4, { dmg: 5 });
    DD.Corelos.placeRune(ft.me, 6, 2, { dmg: 5 });
    A().teleport(units('test_grunt')[0], 4, 4);
    t.ok(!hasRune(4, 4) && units('test_grunt')[0].hp === 9, 'teleported onto a rune: it bursts');
    const spawned = A().spawn('test_grunt', 6, 2);
    t.ok(!!spawned && hasRune(6, 2) && spawned.hp === spawned.maxHp, 'spawned onto a rune: nothing happens');
  });

  // ---- Runic Detonation ------------------------------------------------------------------------------
  T.suite(P + 'Runic Detonation at every level', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_detonate', lv);
      const f = fight({ cx: 1, cy: 1, skills: [{ id: 'cor_detonate', level: lv }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 4, y: 6 }, { id: 'test_grunt', x: 8, y: 8 }] });
      t.eq(DD.Combat.canUse(f.me, f.slot), 'No runes to detonate.', 'L' + lv + ': nothing to detonate');
      t.ok(new RegExp('\\+' + Lv.bonus + ' damage').test(desc('cor_detonate', lv)), 'L' + lv + ': desc shows +' + Lv.bonus);
      DD.Corelos.placeRune(f.me, 4, 4, { dmg: 5 });
      DD.Corelos.placeRune(f.me, 6, 4, { dmg: 5 });
      const g = units('test_grunt');
      previewMatches(t, f.me, f.slot, f.me.x, f.me.y, 'detonate L' + lv);
      const per = 5 + Lv.bonus;
      t.eq(g[0].hp, 28 - per * 2, 'L' + lv + ': foe between two runes is hit by both (' + per + ' each)');
      t.eq(g[1].hp, 14, 'L' + lv + ': foe 2 tiles away is safe');
      t.eq(g[2].hp, 14, 'L' + lv + ': far foe untouched');
      t.eq(g[0].x, 5, 'L' + lv + ': no displacement (one verb)');
      t.eq(DD.Corelos.runes(f.me).length, 0, 'L' + lv + ': all runes spent');
      t.eq(f.slot.cd, 1, 'L' + lv + ': cooldown 1');
      t.eq(f.me.ap, 2, 'L' + lv + ': 1 AP');
    });
    // a second Corelos' runes are not his (two owners on one board)
    const f = fight({ cx: 1, cy: 1, skills: [{ id: 'cor_detonate', level: 1 }], allies: [{ id: 'corelos', x: 1, y: 7 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    const other = S().units.filter(function (u) { return u.defId === 'corelos' && u !== f.me; })[0];
    DD.Corelos.placeRune(f.me, 5, 3, { dmg: 5 });
    DD.Corelos.placeRune(other, 5, 5, { dmg: 5 });
    use(t, f.me, f.slot, 1, 1, 'detonate own runes');
    t.ok(!hasRune(5, 3) && hasRune(5, 5) && units('test_grunt')[0].hp === 14 - 7, 'only his own runes burst');
  });

  // ---- Dark Bargain, Debt and Collateral Damage ---------------------------------------------------------
  T.suite(P + 'Dark Bargain, Debt and Collateral Damage (paid at the start of HIS next turn)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_bargain', lv);
      const f = fight({ skills: [{ id: 'cor_bargain', level: lv }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      t.eq(desc('cor_bargain', lv), 'Gain ' + Lv.gain + ' AP. Take ' + Lv.debt + ' Debt.', 'L' + lv + ': one breath');
      previewMatches(t, f.me, f.slot, f.me.x, f.me.y, 'bargain L' + lv);
      t.eq(f.me.ap, 3 + Lv.gain, 'L' + lv + ': +' + Lv.gain + ' AP now (free to use)');
      t.eq(debt(f.me), Lv.debt, 'L' + lv + ': ' + Lv.debt + ' Debt');
      t.eq(f.slot.cd, 2, 'L' + lv + ': cooldown 2');
      t.eq(f.me.hp, 24, 'L' + lv + ': nothing paid yet');
      DD.Combat.endTurn();
      t.eq(f.me.hp, 24 - Lv.debt, 'L' + lv + ': Debt paid in HP at the start of his next turn');
      t.ok(!st(f.me, 'cor_debt'), 'L' + lv + ': Debt cleared once paid');
      t.ok(DD.Combat.canUse(f.me, f.slot) !== true, 'L' + lv + ': on cooldown in round 2');
      DD.Combat.endTurn();
      t.ok(DD.Combat.canUse(f.me, f.slot) !== true, 'L' + lv + ': on cooldown in round 3');
      DD.Combat.endTurn();
      t.eq(DD.Combat.canUse(f.me, f.slot), true, 'L' + lv + ': ready again in round 4');
    });
    // v2 timing: an ally's turn start does not collect his Debt; the payment is at HIS turn start
    const ft = fight({ skills: [{ id: 'cor_bargain', level: 1 }], allies: [{ id: 'test_mage', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    use(t, ft.me, ft.slot, ft.me.x, ft.me.y, 'bargain then pass');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === units('test_mage')[0] && ft.me.hp === 24 && debt(ft.me) === 6, 'the mage\'s turn: Corelos still owes 6, nothing paid');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === ft.me && ft.me.hp === 18, 'his own next turn: 6 HP paid');
    // never below 1 HP; Debt stacks; Block does not help
    const f = fight({ hp: 4, enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    DD.Corelos.addDebt(f.me, 6, f.me);
    DD.Corelos.addDebt(f.me, 3, f.me);
    t.eq(debt(f.me), 9, 'Debt stacks');
    DD.Combat.endTurn();
    t.eq(f.me.hp, 1, 'Debt never drops him below 1 HP');
    t.ok(!f.me.downed, 'not downed by Debt');
    // each foe that dies (whoever killed it, on any turn) pays off 4; an ally summon dying does not
    const f2 = fight({ allies: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 0.2 }, { id: 'test_grunt', x: 2, y: 6, hpMult: 0.2 }] });
    const mage = units('test_mage')[0];
    const g = units('test_grunt');
    DD.Corelos.addDebt(f2.me, 10, f2.me);
    const imp = A().summon(f2.me, 'cor_imp', 1, 1, { level: 1 });
    A().kill(imp, null);
    t.eq(debt(f2.me), 10, 'an ally summon dying pays off nothing');
    t.ok(DD.Combat.useSkill(f2.me, f2.me.basic, g[1].x, g[1].y), 'Corelos kills a foe');
    t.eq(debt(f2.me), 6, 'his own kill pays off 4');
    DD.Combat.endTurn();
    t.ok(DD.Combat.useSkill(mage, mage.basic, 4, 4), 'the mage kills a foe on her turn');
    t.eq(debt(f2.me), 2, 'an ally\'s kill pays off 4');
    t.eq(DD.Corelos.payOff(f2.me, 0), 0, 'paying off nothing does nothing');
    DD.Corelos.payOff(f2.me, 9);
    t.ok(!st(f2.me, 'cor_debt'), 'Debt paid off in full is removed');
    t.eq(DD.Corelos.payOff(f2.me, 4), 0, 'nothing to pay off without Debt');
    // AutoPlay's hint for Debt costs: only foes about to die (≤ 8 HP) pay part of it off, never more than 4
    const fr = fight({ skills: [{ id: 'cor_bargain', level: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }, { id: 'test_grunt', x: 7, y: 7, hpMult: 0.2 }] });
    const rel = DD.Corelos.debtRelief(DD.Targeting.buildCtx(fr.me, fr.slot, { x: fr.me.x, y: fr.me.y }));
    A().kill(units('test_grunt')[1], null);
    const rel0 = DD.Corelos.debtRelief(DD.Targeting.buildCtx(fr.me, fr.slot, { x: fr.me.x, y: fr.me.y }));
    t.ok(rel === 4 && rel0 === 0, 'Debt hint: a 3-HP foe in sight is worth 4, healthy foes 0 (' + rel + ' / ' + rel0 + ')');
    // the status desc is exact
    const d = DD.getStatus('cor_debt').desc({ id: 'cor_debt', stacks: 7, turns: -1, data: {} });
    t.ok(/Owes 7 HP/.test(d) && /next turn/.test(d) && /pays off 4/.test(d), 'Debt desc: ' + d);
    // Debt does not outlive the fight: he skips town (a victory log line)
    const fv = fight({ objective: { type: 'killAll' }, enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 0.2 }] });
    DD.Corelos.addDebt(fv.me, 6, fv.me);
    t.ok(DD.Combat.useSkill(fv.me, fv.me.basic, 3, 4) && S().result === 'victory', 'the last foe dies: victory');
    t.ok(S().log.some(function (e) { return /skips town owing 2 Debt/.test(e.text); }), 'he skips town owing the 2 left');
  });

  // ---- You've Been Served -----------------------------------------------------------------------------
  T.suite(P + 'You\'ve Been Served at every level (pull, pits, dying targets)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_served', lv);
      const f = fight({ cx: 1, cy: 4, skills: [{ id: 'cor_served', level: lv }], allies: [{ id: 'test_knight', x: 2, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }] });
      const g = units('test_grunt');
      t.ok(!DD.Targeting.isValidTarget(f.me, f.slot, 4, 6), 'L' + lv + ': straight lines only');
      previewMatches(t, f.me, f.slot, 6, 4, 'served L' + lv);
      t.eq(g[0].hp, 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage');
      t.eq(g[0].x, 6 - Lv.pull, 'L' + lv + ': pulled ' + Lv.pull + ' tiles');
      t.ok(!st(g[0], 'weak'), 'L' + lv + ': no extra rider');
      t.eq(f.slot.cd, 2, 'L' + lv + ': cooldown 2');
      t.eq(f.me.ap, 2, 'L' + lv + ': 1 AP');
    });
    // the pull stops next to Corelos (and next to the knight: into his reach); a target that dies is not pulled
    const f = fight({ cx: 1, cy: 4, skills: [{ id: 'cor_served', level: 2 }], allies: [{ id: 'test_knight', x: 2, y: 5 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 1, y: 7, hpMult: 0.2 }] });
    const g = units('test_grunt');
    use(t, f.me, f.slot, 5, 4, 'short pull');
    t.eq(g[0].x, 2, 'stops on the tile next to Corelos');
    t.eq(DD.Grid.dist(g[0], units('test_knight')[0]), 1, '... right next to the knight (pull-into-cleave setup)');
    f.slot.cd = 0; f.slot.fresh = false;
    use(t, f.me, f.slot, 1, 7, 'lethal serve');
    t.ok(g[1].dead && g[1].y === 7, 'a 3-HP target dies to the damage (and is not pulled)');
    // pulled across a pit: YEET
    const fp = fight({ cx: 1, cy: 4, skills: [{ id: 'cor_served', level: 1 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'pit'; },
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    const h0 = S().hype;
    previewMatches(t, fp.me, fp.slot, 5, 4, 'pull into a pit');
    t.ok(units('test_grunt').length === 0, 'pulled into the pit between them: YEET');
    t.ok(S().hype - h0 >= hype('envKill'), 'environmental kill Hype (+' + (S().hype - h0) + ')');
  });

  // ---- Restraining Order ------------------------------------------------------------------------------
  T.suite(P + 'Restraining Order at every level, hazards and edges', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_restraining', lv);
      const f = fight({ cx: 4, cy: 4, skills: [{ id: 'cor_restraining', level: lv }], allies: [{ id: 'test_mage', x: 3, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const g = units('test_grunt'), mage = units('test_mage')[0];
      previewMatches(t, f.me, f.slot, 4, 4, 'restraining L' + lv);
      t.eq(g[0].hp, 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage to an adjacent foe');
      t.eq(g[0].x, 5 + Lv.push, 'L' + lv + ': pushed ' + Lv.push + ' tiles east');
      t.eq(g[1].y, 3 - Lv.push, 'L' + lv + ': the other one pushed north');
      t.eq(g[2].hp, 14, 'L' + lv + ': far foe untouched');
      t.ok(mage.x === 3 && mage.hp === mage.maxHp, 'L' + lv + ': allies are not pushed or hurt');
      t.ok(!st(g[0], 'root'), 'L' + lv + ': no extra rider');
      t.eq(f.slot.cd, 2, 'L' + lv + ': cooldown 2');
    });
    // hazards: pit (YEET), lava, water; and the map edge
    const f = fight({ cx: 4, cy: 4, skills: [{ id: 'cor_restraining', level: 1 }],
      terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; if (tl.x === 4 && tl.y === 1) tl.t = 'lava'; if (tl.x === 2 && tl.y === 4) tl.t = 'water'; },
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 3, y: 4 }] });
    const g = units('test_grunt').slice();
    const h0 = S().hype;
    use(t, f.me, f.slot, 4, 4, 'hazards');
    t.ok(g[0].dead, 'pushed into a pit: YEET');
    t.ok(S().hype - h0 >= hype('envKill'), 'environmental kill Hype (+' + (S().hype - h0) + ')');
    t.eq(g[1].hp, 14 - 2 - 8, 'pushed into lava: 2 + 8 fire');
    t.ok(!!st(g[1], 'burn'), 'and Burning');
    t.ok(!!st(g[2], 'wet'), 'pushed through water: Wet');
    const fe = fight({ cx: 4, cy: 7, skills: [{ id: 'cor_restraining', level: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 8 }] });
    use(t, fe.me, fe.slot, 4, 7, 'edge');
    t.eq(units('test_grunt')[0].hp, 14 - 2 - 3, 'pushed against the map edge: 2 + 3 bump');
    // nobody adjacent: still usable, nothing happens; a foe killed by the damage is not pushed
    const fn = fight({ cx: 4, cy: 4, skills: [{ id: 'cor_restraining', level: 3 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 0.2 }, { id: 'test_grunt', x: 8, y: 8 }] });
    use(t, fn.me, fn.slot, 4, 4, 'lethal restraining');
    t.ok(units('test_grunt').length === 1, 'killed, then nothing to push');
    fn.slot.cd = 0; fn.slot.fresh = false;
    use(t, fn.me, fn.slot, 4, 4, 'nobody adjacent');
    t.eq(units('test_grunt')[0].hp, 14, 'nobody adjacent: nothing happens');
  });

  // ---- Cease & Desist ---------------------------------------------------------------------------------
  T.suite(P + 'Cease & Desist at every level (stun: skips exactly its next turn; interrupts wind-ups)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_cease', lv);
      const f = fight({ cx: 4, cy: 4, ai: true, skills: [{ id: 'cor_cease', level: lv }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
      const g = units('test_grunt')[0];
      t.eq(DD.Combat.costOf(f.me, DD.getSkill('cor_cease'), lv).ap, Lv.cost, 'L' + lv + ': costs ' + Lv.cost + ' AP');
      const prev = previewMatches(t, f.me, f.slot, 5, 4, 'cease L' + lv);
      t.ok((prev.perUnit[g.id].statuses || []).indexOf('stun') >= 0, 'L' + lv + ': the preview shows the Stun');
      t.eq(st(g, 'stun').turns, 1, 'L' + lv + ': Stunned for its next turn');
      t.eq(f.me.ap, 3 - Lv.cost, 'L' + lv + ': ' + Lv.cost + ' AP');
      t.eq(f.slot.cd, Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      DD.Combat.endTurn();
      t.eq(f.me.hp, 24, 'L' + lv + ': its turn passed: the adjacent grunt did not stab');
      t.ok(!st(g, 'stun'), 'L' + lv + ': the stun is gone after that turn');
      DD.Combat.endTurn();
      t.eq(f.me.hp, 20, 'L' + lv + ': the turn after, it stabs again (exactly one lost turn)');
    });
    // diplomatic immunity: stun-immune foes are not targets
    const fi = fight({ cx: 4, cy: 4, skills: [{ id: 'cor_cease', level: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }] });
    units('test_grunt')[0].flags.stunImmune = true;
    t.ok(!DD.Targeting.isValidTarget(fi.me, fi.slot, 5, 4) && DD.Targeting.isValidTarget(fi.me, fi.slot, 4, 6), 'a stun-immune foe is not a target, the other is');
    t.ok(!DD.Targeting.isValidTarget(fi.me, fi.slot, 4, 4), 'not on himself');
    // a boss winding up its meteor: the letter interrupts it
    const fb = fight({ cx: 4, cy: 4, skills: [{ id: 'cor_cease', level: 1 }], enemies: [{ id: 'test_boss', x: 7, y: 4 }] });
    const b = units('test_boss')[0];
    DD.AI.windUp(b, 'test_boss_meteor', { x: 4, y: 4 }, { label: 'Meteor of Regression' });
    t.eq(b.intents.length, 1, 'the boss winds up a meteor on Corelos');
    let cancelled = 0;
    const off = DD.Events.on('windup:cancel', function (e) { if (e.unit === b) cancelled++; });
    try { use(t, fb.me, fb.slot, 7, 4, 'cease the boss'); } finally { off(); }
    t.ok(b.intents.length === 0 && cancelled === 1, 'the wind-up is interrupted (windup:cancel)');
    DD.Combat.endTurn();
    t.eq(fb.me.hp, 24, 'no meteor, no slam: the boss lost its turn');
    // AutoPlay sends the letter to the brute that acts before the wounded cleric it is standing next to
    DD.Combat.sandbox({ w: 9, h: 9, seed: 3, heroes: [{ id: 'corelos', x: 1, y: 4, level: 3, skills: [{ id: 'cor_glyph', level: 1 }, { id: 'cor_cease', level: 1 }] },
      { id: 'test_cleric', x: 5, y: 4, level: 1, hp: 10 }], enemies: [{ id: 'test_brute', x: 6, y: 4 }], order: ['corelos', 'test_brute', 'test_cleric'] });
    const used = {};
    A().addRule({ id: 'cor_test_used', name: 'Used', hooks: { onSkillUsed: function (ctx) { if (!DD.Act.simulating && ctx && ctx.user) used[ctx.skill.id] = 1; } } });
    DD.AutoPlay.takeTurn();
    t.ok(used.cor_cease && !!st(units('test_brute')[0], 'stun'), 'AutoPlay: Cease & Desist on the brute about to smash the cleric (' + Object.keys(used).join(', ') + ')');
  });

  // ---- Sign Here, Please --------------------------------------------------------------------------------
  T.suite(P + 'Sign Here, Please at every level (charm for its next turn(s) + Debt)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_sign_here', lv);
      const f = fight({ cx: 4, cy: 4, ai: true, skills: [{ id: 'cor_sign_here', level: lv }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 4, hpMult: 3 }] });
      const g = units('test_grunt');
      A().addStatus(g[1], 'stun', { turns: 3, silent: true }, null);   // the friend stays put and never acts
      previewMatches(t, f.me, f.slot, 5, 4, 'sign L' + lv);
      t.eq(st(g[0], 'charmed').turns, Lv.turns, 'L' + lv + ': Charmed for ' + plural(Lv.turns, 'turn'));
      t.eq(debt(f.me), Lv.debt, 'L' + lv + ': ' + Lv.debt + ' Debt');
      t.eq(f.me.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(f.slot.cd, 3, 'L' + lv + ': cooldown 3');
      DD.Combat.endTurn();
      t.eq(g[1].hp, 42 - 4, 'L' + lv + ': on its turn the charmed grunt stabs its friend');
      t.eq(f.me.hp, 24 - Lv.debt, 'L' + lv + ': Corelos only pays his Debt at his turn start (no stab)');
      DD.Combat.endTurn();
      if (Lv.turns > 1) {
        t.eq(g[1].hp, 42 - 8, 'L3 round 2: still charmed, it stabs its friend again');
        t.eq(f.me.hp, 24 - Lv.debt, 'L3 round 2: Corelos is still not hit');
        t.ok(!st(g[0], 'charmed'), 'L3: the contract ends after its 2 turns');
      } else {
        t.ok(!st(g[0], 'charmed'), 'L' + lv + ': the contract ended with its one turn');
        t.eq(f.me.hp, 24 - Lv.debt - 4, 'L' + lv + ' round 2: back on its side, it stabs Corelos');
      }
    });
    // no signing bosses, charm-immune foes or foes already under contract
    const fi = fight({ cx: 4, cy: 4, skills: [{ id: 'cor_sign_here', level: 1 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }, { id: 'test_boss', x: 2, y: 2 }, { id: 'test_grunt', x: 6, y: 6 }] });
    const gi = units('test_grunt');
    gi[0].flags.immune = ['charmed'];
    A().addStatus(gi[1], 'charmed', { turns: 1 }, fi.me);
    t.ok(!DD.Targeting.isValidTarget(fi.me, fi.slot, 5, 4), 'a charm-immune foe is not a target');
    t.ok(!DD.Targeting.isValidTarget(fi.me, fi.slot, 4, 6), 'an already charmed foe is not a target');
    t.ok(!DD.Targeting.isValidTarget(fi.me, fi.slot, 2, 2), 'a boss is not a target (bosses bring their own lawyers)');
    t.ok(DD.Targeting.isValidTarget(fi.me, fi.slot, 6, 6), 'a plain foe is');
    t.ok(/not a boss/.test(desc('cor_sign_here', 1)), 'the desc says so');
  });

  // ---- Soul Contract ------------------------------------------------------------------------------------
  T.suite(P + 'Soul Contract at every level (Block until the owner\'s next turn, Debt)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_soul_contract', lv);
      // initiative: Corelos, the grunt, then the mage: the Block covers the grunt's turn and ends at the mage's turn start
      const f = fight({ cx: 2, cy: 2, ai: true, skills: [{ id: 'cor_soul_contract', level: lv }], allies: [{ id: 'test_mage', x: 4, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }], order: ['corelos', 'test_grunt', 'test_mage'] });
      const mage = units('test_mage')[0];
      t.eq(desc('cor_soul_contract', lv), 'Give yourself or an ally ' + Lv.block + ' Block. Take ' + Lv.debt + ' Debt.', 'L' + lv + ': one breath');
      previewMatches(t, f.me, f.slot, 4, 4, 'contract L' + lv);
      t.eq(mage.block, Lv.block, 'L' + lv + ': ' + Lv.block + ' Block');
      t.eq(debt(f.me), Lv.debt, 'L' + lv + ': ' + Lv.debt + ' Debt');
      t.eq(f.me.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(f.slot.cd, 2, 'L' + lv + ': cooldown 2');
      let during = -1;
      const off = DD.Events.on('turn:end', function (e) { if (e.unit && e.unit.defId === 'test_grunt') during = mage.block; });
      try { DD.Combat.endTurn(); } finally { off(); }
      t.ok(DD.Combat.current() === mage, 'L' + lv + ': the mage\'s turn');
      t.eq(during, Lv.block - 4, 'L' + lv + ': the grunt\'s stab hit the Block');
      t.eq(mage.hp, mage.maxHp, 'L' + lv + ': the mage lost no HP');
      t.eq(mage.block, 0, 'L' + lv + ': the Block ended at the mage\'s turn start');
    });
    // on himself: Block through the enemy turns, then Debt paid at his turn start
    const f = fight({ cx: 4, cy: 4, ai: true, skills: [{ id: 'cor_soul_contract', level: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    previewMatches(t, f.me, f.slot, 4, 4, 'contract self');
    t.eq(f.me.block, 8, 'self: 8 Block');
    DD.Combat.endTurn();
    t.eq(f.me.hp, 24 - 4, 'self: the stab hit the Block; he paid only the 4 Debt');
    t.eq(f.me.block, 0, 'self: Block gone at his turn start');
    t.ok(!DD.Targeting.isValidTarget(f.me, f.slot, 5, 4), 'foes are not targets');
  });

  // ---- Infernal Lawyer -------------------------------------------------------------------------------------
  T.suite(P + 'Infernal Lawyer at every level and its skills (acts on Corelos\' turn)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_lawyer', lv);
      const f = fight({ cx: 4, cy: 4, skills: [{ id: 'cor_lawyer', level: lv }], ap: 5,
        enemies: [{ id: 'test_grunt', x: 6, y: 5 }, { id: 'test_archer', x: 8, y: 4 }] });
      previewMatches(t, f.me, f.slot, 5, 5, 'lawyer L' + lv);
      const imp = units('cor_imp')[0];
      t.ok(!!imp && imp.kind === 'summon' && imp.side === 'hero', 'L' + lv + ': imp summoned on our side');
      if (!imp) return;
      t.eq(imp.maxHp, Lv.hp, 'L' + lv + ': ' + Lv.hp + ' HP');
      t.ok(imp.flags.flying, 'L' + lv + ': flies');
      t.eq(imp.ap, Lv.ready ? 2 : 0, 'L' + lv + ': ' + (Lv.ready ? 'acts at once (2 AP)' : 'arrives with 0 AP'));
      t.ok(DD.Combat.isTurnOf(imp), 'L' + lv + ': it acts on Corelos\' turn (no initiative entry of its own)');
      t.eq(DD.Combat.canUse(f.me, f.slot), 'No charges left.', 'L' + lv + ': once per combat');
      t.ok(DD.getSummon('cor_imp').names.indexOf(imp.name) >= 0, 'L' + lv + ': named ' + imp.name);
      imp.ap = 2;
      const poke = slotOf(imp, 'cor_imp_poke'), obj = slotOf(imp, 'cor_imp_objection');
      t.eq(poke.level, lv, 'L' + lv + ': imp skills at level ' + lv);
      const g = units('test_grunt')[0];
      use(t, imp, poke, 6, 5, 'poke L' + lv);
      t.eq(g.hp, 14 - L('cor_imp_poke', lv).dmg, 'L' + lv + ': poke ' + L('cor_imp_poke', lv).dmg);
      const arch = units('test_archer')[0];
      use(t, imp, obj, 8, 4, 'objection L' + lv);
      t.eq((st(arch, 'taunt') || {}).turns, 1, 'L' + lv + ': archer taunted for its next turn');
      t.eq(imp.block, L('cor_imp_objection', lv).block, 'L' + lv + ': imp Block');
      t.eq(obj.cd, 2, 'L' + lv + ': Objection cooldown 2');
    });
    // v2 taunt: on its turn the archer must shoot the Lawyer, not Corelos
    const f = fight({ cx: 1, cy: 1, ai: true, skills: [{ id: 'cor_lawyer', level: 1 }], enemies: [{ id: 'test_archer', x: 5, y: 2 }] });
    use(t, f.me, f.slot, 2, 2, 'summon for the taunt');
    const imp = units('cor_imp')[0];
    imp.ap = 2;
    use(t, imp, slotOf(imp, 'cor_imp_objection'), 5, 2, 'objection');
    const hp = imp.hp;
    DD.Combat.endTurn();
    t.ok(f.me.hp === 24 && imp.hp === hp - 4, 'the taunted archer shot the Lawyer (imp ' + imp.hp + '/' + hp + ', Corelos ' + f.me.hp + ')');
    t.ok(!st(units('test_archer')[0], 'taunt'), 'the taunt lasted exactly its one turn');
    t.eq(imp.ap, 2, 'the Lawyer gets its AP back at Corelos\' turn start');
  });

  // ---- Collect Debt ---------------------------------------------------------------------------------------
  T.suite(P + 'Collect Debt at every level', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('cor_collect', lv);
      let f = fight({ cx: 2, cy: 4, skills: [{ id: 'cor_collect', level: lv }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }] });
      let g = units('test_grunt')[0];
      previewMatches(t, f.me, f.slot, 4, 4, 'collect L' + lv);
      t.eq(g.hp, 28 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage without Debt');
      t.eq(f.me.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(f.slot.cd, 2, 'L' + lv + ': cooldown 2');
      f = fight({ cx: 2, cy: 4, skills: [{ id: 'cor_collect', level: lv }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
      g = units('test_grunt')[0];
      DD.Corelos.addDebt(f.me, 5, f.me);
      t.ok(new RegExp(': ' + (Lv.dmg + 5) + ' right now').test(desc('cor_collect', lv, f.me)), 'L' + lv + ': desc shows the live total');
      previewMatches(t, f.me, f.slot, 4, 4, 'collect debt L' + lv);
      t.eq(g.hp, 42 - Lv.dmg - 5, 'L' + lv + ': +5 for 5 Debt');
      t.eq(debt(f.me), 5, 'L' + lv + ': Debt stays when it does not kill');
      // capped at +10; a kill pays off 4 like any other death
      f = fight({ cx: 2, cy: 4, skills: [{ id: 'cor_collect', level: lv }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 1.2 }] });
      g = units('test_grunt')[0];
      DD.Corelos.addDebt(f.me, 30, f.me);
      use(t, f.me, f.slot, 4, 4, 'collect kill L' + lv);
      t.ok(g.dead, 'L' + lv + ': ' + (Lv.dmg + 10) + ' (capped) kills a 17-HP grunt');
      t.eq(debt(f.me), 26, 'L' + lv + ': the kill pays off 4 (Collateral Damage)');
    });
    const f = fight({ cx: 2, cy: 4, skills: [{ id: 'cor_collect', level: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    DD.Corelos.addDebt(f.me, 25, f.me);
    use(t, f.me, f.slot, 4, 4, 'collect cap');
    t.eq(units('test_grunt')[0].hp, 42 - 17, 'bonus capped at +10');
  });

  // ---- signature --------------------------------------------------------------------------------------
  T.suite(P + 'Read the Fine Print (signature: every foe skips its next turn)', function (t) {
    const f = fight({ cx: 4, cy: 4, ai: true, enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_archer', x: 8, y: 2 },
      { id: 'test_brute', x: 2, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    const g = units('test_grunt')[0], a = units('test_archer')[0], br = units('test_brute')[0], imm = units('test_grunt')[1];
    imm.flags.stunImmune = true;
    t.ok(DD.Combat.canUse(f.me, f.me.signature) !== true, 'needs 100 Hype');
    S().hype = 100;
    t.eq(desc('cor_fine_print', 1), 'Every foe is Stunned: it skips its next turn.', 'one big, simple effect');
    const prev = previewMatches(t, f.me, f.me.signature, 4, 4, 'signature');
    t.ok([g, a, br].every(function (u) { return (prev.perUnit[u.id].statuses || []).indexOf('stun') >= 0; }), 'the preview shows every Stun');
    t.ok([g, a, br].every(function (u) { return st(u, 'stun') && st(u, 'stun').turns === 1; }), 'every foe Stunned for its next turn');
    t.ok(!st(imm, 'stun'), 'a stun-immune foe shrugs it off');
    t.eq(f.me.ap, 1, '2 AP');
    t.ok(S().hype < 100, 'Hype spent (' + S().hype + ')');
    DD.Combat.endTurn();
    t.eq(f.me.hp, 24, 'nobody hit Corelos: grunt, archer and brute all lost their turn');
    t.ok([g, a, br].every(function (u) { return !st(u, 'stun'); }), 'the stuns are gone after those turns');
    DD.Combat.endTurn();
    t.ok(f.me.hp < 24, 'the turn after, they are back at it (Corelos ' + f.me.hp + ')');
    // a boss wind-up is interrupted by the fine print
    const fb = fight({ cx: 4, cy: 4, enemies: [{ id: 'test_boss', x: 7, y: 4 }, { id: 'test_minion', x: 1, y: 1 }] });
    const b = units('test_boss')[0];
    DD.AI.windUp(b, 'test_boss_meteor', { x: 4, y: 4 }, { label: 'Meteor of Regression' });
    S().hype = 100;
    previewMatches(t, fb.me, fb.me.signature, 4, 4, 'signature vs a wind-up');
    t.ok(b.intents.length === 0 && !!st(b, 'stun') && !!st(units('test_minion')[0], 'stun'), 'the meteor is void, boss and minion Stunned');
  });

  // ---- items ---------------------------------------------------------------------------------------------
  T.suite(P + 'items: Quill, Platinum Soul Card, Notarized Soul', function (t) {
    // Quill: runes deal +2 (part of the burst: labels and descs show it, multipliers apply to the whole amount)
    let f = fight({ cx: 1, cy: 1, skills: [{ id: 'cor_glyph', level: 1 }], items: ['cor_quill'], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    t.ok(/take 7 damage/.test(desc('cor_glyph', 1, f.me)) && /take 5 damage/.test(desc('cor_glyph', 1)), 'Glyph desc: 5 + 2 = 7 with the Quill');
    DD.Corelos.placeRune(f.me, 5, 5, { dmg: 5 });
    t.ok(/\(7 dmg\)/.test(DD.Grid.tile(5, 5).obj.label), 'the rune label shows 7 (' + DD.Grid.tile(5, 5).obj.label + ')');
    DD.Corelos.burst(5, 5, {});
    t.eq(units('test_grunt')[0].hp, 14 - 7, 'bursts deal +2');
    A().addStatus(f.me, 'weak', { turns: 2 }, null);
    DD.Corelos.placeRune(f.me, 7, 8, { dmg: 5 });
    DD.Corelos.burst(7, 8, {});
    t.eq(units('test_grunt')[1].hp, 14 - 5, 'Quill + Weak: round(7 × 0.75) = 5');
    t.ok(/max 3/.test(desc('cor_glyph', 1, f.me)), 'the cap stays 3 (one effect)');
    f = fight({ cx: 4, cy: 4, items: ['cor_quill'], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    A().addStatus(f.me, 'charmed', { turns: 1 }, units('test_grunt')[0]);
    DD.Corelos.placeRune(f.me, 6, 4, { dmg: 5 });
    DD.Corelos.burst(6, 4, {});
    t.eq(units('test_grunt')[0].hp, 14, 'Quill + charmed: still nothing for the charmer');
    f = fight({ cx: 1, cy: 1, skills: [{ id: 'cor_detonate', level: 1 }], items: ['cor_quill'], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    DD.Corelos.placeRune(f.me, 5, 5, { dmg: 5 });
    previewMatches(t, f.me, f.slot, 1, 1, 'quill detonation');
    t.eq(units('test_grunt')[0].hp, 14 - 9, 'Quill + Detonation I: 5 + 2 + 2');
    // Soul Card: every death pays off 7
    f = fight({ items: ['cor_soul_card'], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 0.2 }, { id: 'test_grunt', x: 8, y: 8 }] });
    t.eq(S().hype, 0, 'Soul Card: no Hype at combat start (one effect)');
    DD.Corelos.addDebt(f.me, 9, f.me);
    t.ok(/pays off 7/.test(DD.getStatus('cor_debt').desc(st(f.me, 'cor_debt'))), 'the Debt tooltip says 7');
    t.ok(DD.Combat.useSkill(f.me, f.me.basic, 3, 4), 'kill');
    t.eq(debt(f.me), 2, 'a death pays off 7');
    // Notarized Soul: once per combat, a lethal hit leaves him at half HP + 10 Debt, which really comes due
    f = fight({ items: ['cor_notarized'], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    t.eq(f.me.maxHp, 30, 'Notarized Soul: +6 max HP');
    const g = units('test_grunt')[0];
    A().damage(g, f.me, 40);
    t.ok(!f.me.downed && f.me.hp === 15, 'first lethal hit: stays up with half his HP (' + f.me.hp + ')');
    t.eq(debt(f.me), 10, '+10 Debt');
    A().damage(g, f.me, 40);
    t.ok(f.me.downed, 'second lethal hit: down (once per combat)');
    f = fight({ items: ['cor_notarized'], cx: 4, cy: 4, enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    A().damage(units('test_grunt')[0], f.me, 40);
    DD.Combat.endTurn();
    t.eq(f.me.hp, 15 - 10, 'the 10 Debt is collected at his next turn start (15 → 5)');
    t.ok(!!DD.getItem('cor_notarized').hooks.preventDeath, 'the save is a preventDeath hook (mid-fight, not a starting shield)');
  });

  // ---- edge cases -----------------------------------------------------------------------------------------
  T.suite(P + 'edge cases: silenced, stunned, sheep, charmed, AP, not his turn, null targets, downed', function (t) {
    const pool = DD.getHero('corelos').skillPool;
    const f = fight({ cx: 4, cy: 4, level: 5, skills: ['cor_glyph', 'cor_bargain', 'cor_served', 'cor_soul_contract'].map(function (id) { return { id: id, level: 1 }; }),
      allies: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_archer', x: 4, y: 7 }] });
    const me = f.me;
    A().addStatus(me, 'silenced', { turns: 2 }, null);
    t.eq(DD.Combat.canUse(me, slotOf(me, 'cor_glyph')), 'Silenced!', 'silenced: no runes (a spell)');
    t.eq(DD.Combat.canUse(me, me.basic), true, 'silenced: Rune Bolt (an attack) still works');
    t.eq(DD.Combat.canUse(me, slotOf(me, 'cor_bargain')), true, 'silenced: Dark Bargain (a buff) still works');
    t.eq(DD.Combat.canUse(me, slotOf(me, 'cor_served')), true, 'silenced: You\'ve Been Served (an attack) still works');
    t.eq(DD.Combat.canUse(me, slotOf(me, 'cor_soul_contract')), true, 'silenced: Soul Contract (a buff) still works');
    S().hype = 100;
    t.eq(DD.Combat.canUse(me, me.signature), 'Silenced!', 'silenced: no fine print');
    S().hype = 0;
    A().removeStatus(me, 'silenced', { silent: true });
    A().addStatus(me, 'stun', { turns: 1 }, null);
    t.eq(DD.Combat.canUse(me, me.basic), 'Stunned!', 'stunned');
    A().removeStatus(me, 'stun', { silent: true });
    A().addStatus(me, 'sheep', { turns: 1 }, null);
    t.ok(/Baa/.test(DD.Combat.canUse(me, slotOf(me, 'cor_bargain'))), 'sheep');
    A().removeStatus(me, 'sheep', { silent: true });
    me.ap = 0;
    t.eq(DD.Combat.canUse(me, me.basic), 'Not enough AP.', 'no AP: no bolt');
    t.eq(DD.Combat.canUse(me, slotOf(me, 'cor_bargain')), true, 'no AP: Dark Bargain is free');
    // charmed by the grunt: his runes don't hurt the charmer
    const g = units('test_grunt')[0];
    A().addStatus(me, 'charmed', { turns: 1 }, g);
    DD.Corelos.placeRune(me, 6, 4, { dmg: 5 });
    DD.Corelos.burst(6, 4, {});
    t.eq(g.hp, 14, 'charmed: runes deal 0 to the charmer');
    // not his turn: the mage's turn refuses his skills
    A().removeStatus(me, 'charmed', { silent: true });
    DD.Combat.endTurn();
    t.ok(/turn/i.test(String(DD.Combat.canUse(me, me.basic))), 'on the mage\'s turn Corelos can\'t act (' + DD.Combat.canUse(me, me.basic) + ')');
    // a stunned Corelos loses his turn (0 AP) but still pays his Debt at its start
    const fs = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    DD.Corelos.addDebt(fs.me, 3, fs.me);
    A().addStatus(fs.me, 'stun', { turns: 1 }, units('test_grunt')[0]);
    let passed = 0;
    const offP = DD.Events.on('turn:start', function (e) { if (e.unit === fs.me && e.round === 2) passed = fs.me.ap === 0 ? 1 : -1; });
    try { DD.Combat.endTurn(); } finally { offP(); }
    t.eq(passed, 1, 'stunned: his round-2 turn starts with 0 AP');
    t.ok(S().round === 3 && DD.Combat.current() === fs.me && !st(fs.me, 'stun'), 'stunned: that turn passed by itself; round 3 is his again');
    t.eq(fs.me.hp, 21, 'stunned: the Debt was still collected at the start of the lost turn');
    // downed: statuses (Debt) are cleared, nothing is collected later
    const fd = fight({ allies: [{ id: 'test_mage', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    DD.Corelos.addDebt(fd.me, 5, fd.me);
    A().damage(units('test_grunt')[0], fd.me, 99);
    t.ok(fd.me.downed && !st(fd.me, 'cor_debt'), 'downed: the Debt is gone with his statuses');
    DD.Combat.endRound();
    t.eq(fd.me.hp, 0, 'downed: nothing collected at his (skipped) turn');
    // every skill tolerates a null target / an empty board when forced
    const all = pool.concat(['cor_rune_bolt', 'cor_fine_print']);
    const before = DD.problems.length;
    all.forEach(function (id) {
      fight({ cx: 4, cy: 4, skills: [{ id: id, level: 3 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = cor();
      const sl = slotOf(u, id) || A().makeSlot(id, 3);
      DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, null, {}); });
      DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, { x: 0, y: 0 }, {}); });
    });
    const imp = units('cor_imp')[0] || null;
    t.ok(imp === null || imp.side === 'hero', 'forced uses stay sane');
    t.eq(DD.problems.slice(before).filter(function (w) { return /^Error in /.test(w); }).length, 0, 'no swallowed errors with null targets');
  });

  // ---- previews -----------------------------------------------------------------------------------------
  T.suite(P + 'previews: side-effect free and exact for every skill', function (t) {
    const cases = [
      ['cor_glyph', 3, 5, 5], ['cor_bargain', 3, 4, 4], ['cor_detonate', 3, 4, 4], ['cor_served', 3, 4, 8], ['cor_restraining', 3, 4, 4],
      ['cor_cease', 3, 5, 4], ['cor_sign_here', 3, 5, 4], ['cor_soul_contract', 3, 3, 4], ['cor_soul_contract', 1, 4, 4], ['cor_lawyer', 3, 4, 5],
      ['cor_collect', 3, 5, 4], ['cor_rune_bolt', 1, 5, 4], ['cor_fine_print', 1, 4, 4], ['cor_collect', 1, 6, 5], ['cor_rune_bolt', 1, 6, 5],
    ];
    cases.forEach(function (c) {
      const f = fight({ cx: 4, cy: 4, ai: true, level: 6, skills: [{ id: c[0], level: c[1] }], ap: 6,
        allies: [{ id: 'test_mage', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 5, hpMult: 0.5 }, { id: 'test_archer', x: 4, y: 8 }] });
      S().hype = 100;
      DD.Corelos.addDebt(f.me, 3, f.me);
      DD.Corelos.placeRune(f.me, 6, 4, { dmg: 6 });
      DD.Corelos.placeRune(f.me, 4, 7, { dmg: 6, root: true });
      const sl = slotOf(f.me, c[0]);
      previewMatches(t, f.me, sl, c[2], c[3], c[0] + ' L' + c[1] + ' @' + c[2] + ',' + c[3]);
      DD.Combat.endRound();
      t.ok(T.contentHelpers.sanity(t, c[0] + ' after a round'), c[0] + ': sane after a round');
    });
    // the imp's skills
    const f = fight({ cx: 4, cy: 4, skills: [{ id: 'cor_lawyer', level: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 5 }, { id: 'test_archer', x: 8, y: 4 }] });
    use(t, f.me, f.slot, 5, 5, 'summon for previews');
    const imp = units('cor_imp')[0];
    imp.ap = 2;
    previewMatches(t, imp, slotOf(imp, 'cor_imp_poke'), 6, 5, 'imp poke');
    previewMatches(t, imp, slotOf(imp, 'cor_imp_objection'), 8, 4, 'imp objection');
  });

  // ---- AutoPlay ----------------------------------------------------------------------------------------
  const LOADOUTS = {
    1: [['cor_glyph', 1], ['cor_bargain', 1]],
    3: [['cor_glyph', 1], ['cor_bargain', 1], ['cor_served', 1], ['cor_cease', 1]],
    5: [['cor_glyph', 2], ['cor_detonate', 2], ['cor_collect', 1], ['cor_lawyer', 1]],
  };
  const ALT = {
    1: [['cor_glyph', 1], ['cor_bargain', 1]],
    3: [['cor_glyph', 1], ['cor_restraining', 1], ['cor_sign_here', 1], ['cor_soul_contract', 1]],
    5: [['cor_glyph', 3], ['cor_bargain', 2], ['cor_sign_here', 2], ['cor_cease', 2]],
  };
  function party(level, alt) {
    const lo = (alt ? ALT : LOADOUTS)[level];
    return [DD.Combat.makeRunHero({ id: 'corelos', level: level, skills: lo.map(function (e) { return { id: e[0], level: e[1] }; }) })]
      .concat(['test_knight', 'test_cleric', 'test_mage'].map(function (id) { return DD.Combat.makeRunHero({ id: id, level: level }); }));
  }
  function battle(t, encId, level, alt, tally) {
    const enc = DD.getEncounter(encId);
    if (!enc) { t.fail('fixture encounter ' + encId + ' missing'); return null; }
    const rng = DD.RNG('cor-auto:' + t.seed + ':' + encId + ':' + level + (alt ? 'b' : ''));
    const setup = DD.Encounter.build(enc, party(level, alt), { rng: rng, difficulty: 'normal', act: enc.act });
    DD.Combat.start(setup, { seed: rng.int(1, 1e9), headless: true, difficulty: 'normal', kind: enc.kind });
    A().addRule({ id: 'cor_test_tally', name: 'Tally', hooks: { onSkillUsed: function (ctx) {
      if (DD.Act.simulating || !ctx || !ctx.user) return;
      if (ctx.user.defId === 'corelos' || ctx.user.defId === 'cor_imp') tally[ctx.skill.id] = (tally[ctx.skill.id] || 0) + 1;
    } } });
    const res = DD.AutoPlay.runBattle(30);
    const bursts = S().log.filter(function (e) { return /rune bursts/.test(e.text); }).length;
    tally.bursts = (tally.bursts || 0) + bursts;
    t.ok(!!S().order && S().order.length > 0, encId + ' L' + level + ': initiative was rolled');
    t.ok(T.contentHelpers.sanity(t, encId + ' L' + level), encId + ' L' + level + ': state sane');
    t.log(encId + ' L' + level + (alt ? ' (alt)' : '') + ': ' + res.result + ' in ' + res.rounds + ' rounds, rune bursts ' + bursts);
    return res;
  }
  [1, 2, 3].forEach(function (act) {
    T.suite(P + 'AutoPlay battles in act ' + act + ' (levels 1 / 3 / 5, fixture party)', function (t) {
      const tally = {};
      const before = DD.problems.length;
      let ended = 0, wins = 0, n = 0;
      [1, 3, 5].forEach(function (level) {
        ['normal', 'elite'].forEach(function (kind) {
          const res = battle(t, 'test_a' + act + '_' + kind, level, kind === 'elite', tally);
          if (!res) return;
          n++;
          if (res.result) ended++;
          if (res.result === 'victory') wins++;
        });
      });
      if (act === 3) { const r = battle(t, 'test_a3_boss', 5, false, tally); n++; if (r && r.result) ended++; if (r && r.result === 'victory') wins++; }
      t.log('act ' + act + ': ' + wins + '/' + n + ' won, ' + ended + ' ended; skill uses ' + JSON.stringify(tally));
      t.ok(ended >= n - 1, 'battles end (' + ended + '/' + n + ')');
      t.ok(wins >= Math.ceil(n / 2), 'the party mostly wins (' + wins + '/' + n + ')');
      t.ok((tally.cor_rune_bolt || 0) > 0, 'Rune Bolt used');
      t.ok((tally.cor_glyph || 0) > 0 && (tally.bursts || 0) > 0, 'runes inscribed (' + (tally.cor_glyph || 0) + ') and set off (' + (tally.bursts || 0) + ')');
      const kinds = Object.keys(tally).filter(function (k) { return k !== 'bursts' && k !== 'cor_rune_bolt'; });
      t.ok(kinds.length >= 4, 'Corelos used ' + kinds.length + ' different skills besides his basic: ' + kinds.join(', '));
      t.eq(DD.problems.slice(before).filter(function (w) { return /^Error in /.test(w); }).length, 0, 'no swallowed errors');
    });
  });
})();
