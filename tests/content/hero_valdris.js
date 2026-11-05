/* Dungeons and Degenerates — tests/content/hero_valdris.js
 * Suites "hero_valdris: …" for js/data/heroes/valdris.js (v2: initiative turns, no telegraphs, no Guard, attacks of
 * opportunity): registry data, texts and barks (pronouns, simplicity), the sprite, the Strike While the Iron's Hot passive
 * (+3 on Burning foes, attacks of opportunity included and visible to the estimates), every skill at every level in
 * sandbox fights (desc == effect: damage, statuses, Block, Thorns, displacement, surfaces, costs, cooldowns, ranges),
 * durations counted in own turns, the signature, the items, previews against reality, attacks of opportunity (his hammer
 * holds the line, walking away provokes, pushes and teleports don't), v2 edge cases (stunned / silenced / sheep / charmed
 * Valdris, targets dying mid-skill, pits / lava / water / walls / map edges, AP), combos with other heroes, the v2 review's
 * probes (plain Burn ticks and Thorns, delayed hits, summons, real heroes when loaded) and AutoPlay battles at levels 1 / 3 / 5.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  const POOL = ['val_flame_edge', 'val_forge_armour', 'val_forge_weapon', 'val_spiked', 'val_temper', 'val_hammer_faith', 'val_molten',
    'val_anvil', 'val_hair_flip'];
  const ALL = POOL.concat(['val_basic', 'val_signature']);
  const ITEMS = ['val_apron', 'val_conditioner', 'val_brightforge'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const EXTRA_BARKS = ['opportunity', 'iron', 'hair'];
  const FEM = /\b(she|her|hers|herself)\b/i;
  const IRON = 3;

  // ---- helpers ------------------------------------------------------------------------------------------
  function S() { return DD.Combat.state; }
  function A() { return DD.Act; }
  function sk(id) { return DD.getSkill(id); }
  function L(id, lv) { return DD.skillLevel(sk(id), lv); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function stacks(u, id) { const st = DD.Act.getStatus(u, id); return st ? st.stacks : 0; }
  function turnsLeft(u, id) { const st = DD.Act.getStatus(u, id); return st ? st.turns : null; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function pos(u) { return u.x + ',' + u.y; }
  function surf(x, y) { const tl = DD.Grid.tile(x, y); return tl && tl.surface ? tl.surface.id : null; }
  function hype() { return (DD.Balance && DD.Balance.hype) || { kill: 8, envKill: 20, multiHit: 4 }; }
  /** Hype gained == want, or ≥ want while the balance knobs also trickle Hype from damage dealt / taken. */
  function hypeIs(t, got, want, label) {
    if ((hype().dealtPer || 0) > 0 || (hype().takenPer || 0) > 0) t.ok(got >= want, label + ' (≥ ' + want + ', got ' + got + ')');
    else t.eq(got, want, label);
  }
  /** Terrain map for sandboxes: { 'x,y': terrainId | { t, h } }. */
  function terr(map) {
    return function (tl) {
      const v = map[tl.x + ',' + tl.y];
      if (!v) return;
      if (typeof v === 'string') tl.t = v; else Object.assign(tl, v);
    };
  }
  function E(x, y, id, hpMult) { return { id: id || 'test_grunt', x: x, y: y, hpMult: hpMult }; }

  /**
   * Sandbox with Valdris at cfg.at (default 1,4) on a 9×9 floor; heroes first in the listed order (Valdris, then
   * cfg.heroes) unless cfg.order; enemies pass unless cfg.ai. cfg: { at, level, skills: [[id, lv]], items, hp, enemies,
   * heroes, summons ([{ id, x, y, owner }]), terrain (map), objects, surfaces, w, h, seed, ai, order }.
   * Returns { s, v, slot(id), foes, hero(defId) }.
   */
  function arena(cfg) {
    cfg = cfg || {};
    const p = cfg.at || [1, 4];
    const skills = (cfg.skills || []).map(function (e) { return { id: e[0], level: e[1] || 1 }; });
    const heroes = [{ id: 'valdris', x: p[0], y: p[1], level: cfg.level || 1, skills: skills, items: cfg.items || [], hp: cfg.hp }]
      .concat(cfg.heroes || []);
    const s = DD.Combat.sandbox({
      w: cfg.w || 9, h: cfg.h || 9, seed: cfg.seed || 7, enemyAi: !!cfg.ai, order: cfg.order,
      objective: { type: 'custom', text: 'Valdris test' }, encounter: { id: 'val_test_arena', checkObjective: function () { return null; } },
      heroes: heroes, enemies: cfg.enemies || [], summons: cfg.summons, terrain: cfg.terrain ? terr(cfg.terrain) : undefined,
      objects: cfg.objects, surfaces: cfg.surfaces,
    });
    const v = s.units.filter(function (u) { return u.defId === 'valdris'; })[0];
    return {
      s: s, v: v,
      slot: function (id) { return DD.Combat.slotsOf(v).filter(function (sl) { return sl.id === id; })[0]; },
      foes: s.units.filter(function (u) { return u.side === 'enemy'; }),
      hero: function (id) { return s.units.filter(function (u) { return u.defId === id; })[0]; },
    };
  }

  /** Use a slot for real (canUse + valid target), failing the test with the reason otherwise. */
  function use(t, u, slot, x, y, label) {
    const ok = DD.Combat.canUse(u, slot);
    if (ok !== true) { t.fail((label || (slot && slot.id)) + ': canUse says ' + ok); return false; }
    const r = DD.Combat.useSkill(u, slot, x, y);
    if (!r) t.fail((label || slot.id) + ': useSkill refused target ' + x + ',' + y);
    return r;
  }
  function valid(u, slot, x, y) { return DD.Targeting.isValidTarget(u, slot, x, y); }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0]; }

  function hpMap(s) { const m = {}; s.units.forEach(function (u) { m[u.id] = { hp: u.hp, dead: !!u.dead, downed: !!u.downed }; }); return m; }
  function previewProblems(prev, s, before) {
    if (prev.uncertain) return ['the preview is uncertain (Valdris rolls no dice)'];
    const out = [];
    s.units.forEach(function (u) {
      const b = before[u.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[u.id];
      const real = b.hp - u.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
      if (real !== said) out.push(u.name + ': real HP change ' + (-real) + ', preview ' + (-said));
      const down = (u.dead && !b.dead) || (u.downed && !b.downed);
      if (down !== !!(e && e.lethal)) out.push(u.name + ': lethal mismatch');
    });
    return out;
  }
  function stateKey(s) {
    return JSON.stringify([s.units.map(function (u) {
      return [u.id, u.x, u.y, u.hp, u.block, u.ap, !!u.dead, (u.statuses || []).map(function (st) { return [st.id, st.stacks, st.turns]; }),
        DD.Combat.slotsOf(u).map(function (sl) { return [sl.id, sl.cd, sl.uses]; })];
    }), s.grid.tiles.map(function (tl) { return [tl.t, tl.surface && [tl.surface.id, tl.surface.turns], tl.obj && tl.obj.hp]; }), s.hype, s.rng.getState(), s.log.length]);
  }
  /** Preview, then use: the preview must leave the fight untouched and predict HP, downs, Block and Hype exactly. */
  function previewThenUse(t, u, slot, x, y, label) {
    const s = S();
    const k0 = stateKey(s);
    const prev = DD.Combat.preview(u, slot, x, y);
    t.eq(stateKey(s), k0, label + ': preview leaves the fight untouched');
    const before = hpMap(s);
    const blocks = {};
    s.units.forEach(function (x2) { blocks[x2.id] = x2.block; });
    const hype0 = s.hype;
    use(t, u, slot, x, y, label);
    previewProblems(prev, s, before).forEach(function (m) { t.fail(label + ': preview ≠ reality: ' + m); });
    s.units.forEach(function (x2) {
      const e = prev.perUnit[x2.id], gained = Math.max(0, x2.block - (blocks[x2.id] || 0));
      if (gained || (e && e.block)) t.eq(e ? e.block || 0 : 0, gained, label + ': preview Block on ' + x2.name);
    });
    t.eq(s.hype - hype0, prev.hype, label + ': preview Hype matches');
    return prev;
  }
  /** Call fn(e) at each turn:start of a unit matching pred while body() runs. */
  function onTurns(pred, fn, body) {
    const off = DD.Events.on('turn:start', function (e) { if (pred(e.unit)) fn(e); });
    try { body(); } finally { off(); }
  }
  /** The attacks of opportunity made while fn runs: [{ a: attacker defId, m: mover defId, skill }]. */
  function opportunities(fn) {
    const seen = [];
    const off = DD.Events.on('opportunity:attack', function (e) { seen.push({ a: e.attacker.defId, m: e.mover.defId, skill: e.skillId }); });
    try { fn(); } finally { off(); }
    return seen;
  }
  function textsOf(id) {
    const d = sk(id), out = [d.flavor || ''];
    for (let lv = 1; lv <= d.levels.length; lv++) out.push(DD.skillDesc(d, lv, null));
    return out;
  }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }

  // ---- registry & data --------------------------------------------------------------------------------------
  T.suite('hero_valdris: registry, identity, numbers, descriptions and barks', function (t) {
    const h = DD.getHero('valdris');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.eq(h.name, 'Valdris', 'name');
    t.ok(h.epithet && h.race === 'Human' && /Forge Cleric/.test(h.cls) && h.role && h.blurb.length > 60, 'identity: a human forge cleric, blurb');
    t.ok(h.complexity >= 1 && h.complexity <= 3 && /^#[0-9a-f]{6}$/i.test(h.color), 'complexity + colour');
    t.eq(h.unlock, null, 'available from the start (unlock: null, DESIGN v2)');
    t.eq(JSON.stringify(h.stats), JSON.stringify({ hp: 28, ap: 3, mov: 3, armor: 1, init: 0 }), 'L1 stats: 28 HP, 3 AP, move 3, armor 1, initiative 0');
    t.eq(h.growth.hp, 4, 'growth +4 HP per level');
    t.eq(JSON.stringify(h.flags), '{}', 'no special flags');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['val_flame_edge', 'val_forge_armour']), 'starting skills: a weapon (Flame-Forged Edge) and armour (Forge Armour)');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'pool of 9 (DESIGN v2: 8-10 besides basic and signature)');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic/signature not in pool');
    t.eq(JSON.stringify(h.summons || []), '[]', 'no summons');
    t.eq(sk(h.signature).hype, 100, 'signature costs 100 Hype');
    const b = L(h.basic, 1);
    t.ok(b.dmg >= 4 && b.dmg <= 6 && sk(h.basic).ap === 1 && !sk(h.basic).cooldown, 'basic: 1 AP, 4-6 damage, no cooldown');
    t.ok(h.passive && h.passive.name === 'Strike While the Iron\'s Hot' && /\+3 damage to Burning foes/.test(h.passive.desc), 'passive: Strike While the Iron\'s Hot (+3 on Burning foes)');
    t.ok(words(h.passive.desc) <= 16, 'the passive is one clear rule: ' + h.passive.desc);
    const aps = {};
    let longest = 0;
    ALL.forEach(function (id) {
      const d = sk(id);
      t.ok(!!d, id + ' registered');
      if (!d) return;
      t.eq(d.owner, 'valdris', id + ' owner');
      t.ok(typeof d.icon === 'string' && d.icon.length > 0 && d.icon.length <= 3, id + ' one emoji icon');
      if (POOL.indexOf(id) >= 0) { t.eq(d.levels.length, 3, id + ' has 3 levels'); aps[d.ap] = 1; }
      for (let lv = 1; lv <= d.levels.length; lv++) {
        const txt = DD.skillDesc(d, lv, null);
        t.ok(txt && !/undefined|NaN|\[object/.test(txt), id + ' L' + lv + ' desc with a null user');
        const Lv = DD.skillLevel(d, lv);
        ['dmg', 'block', 'bonus', 'burn', 'thorns', 'push', 'r', 'heal'].forEach(function (k) {
          if (typeof Lv[k] === 'number' && Lv[k] > 0) t.ok(new RegExp('(^|[^0-9])' + Lv[k] + '([^0-9]|$)').test(txt), id + ' L' + lv + ' desc shows ' + k + ' ' + Lv[k]);
        });
        // DESIGN §6 Simplicity: one verb, read in one breath, no if/else clauses
        const n = words(txt);
        longest = Math.max(longest, n);
        t.ok(n <= 24, id + ' L' + lv + ' desc reads in one breath (' + n + ' words): ' + txt);
        t.ok(!/\bif\b|\bunless\b|\botherwise\b/i.test(txt), id + ' L' + lv + ' desc has no conditions: ' + txt);
      }
      t.ok(!d.flavor || d.flavor.length <= 120, id + ' flavor ≤ 120');
    });
    t.log('longest desc: ' + longest + ' words');
    t.ok(aps[1] && aps[2] && aps[3], 'pool mixes 1, 2 and 3 AP skills');
    t.ok(POOL.some(function (id) { return DD.Combat.cooldownOf(null, sk(id), 1) >= 3; }), 'a long-cooldown skill (Anvil Drop)');
    // levels differ visibly (desc, cost, cooldown, range)
    POOL.forEach(function (id) {
      const face = [1, 2, 3].map(function (lv) {
        const d = sk(id), Lv = DD.skillLevel(d, lv);
        return JSON.stringify([DD.skillDesc(d, lv, null), DD.resolve(d.ap, Lv, null, 1), DD.resolve(d.cooldown, Lv, null, 0), DD.resolve(d.target.range, Lv, null, null)]);
      });
      t.ok(face[0] !== face[1] && face[1] !== face[2], id + ': every level looks different');
    });
    // he forges for the party: his ally skills reach 3 tiles and need no line of sight; Forge Weapon is allies only
    ['val_flame_edge', 'val_forge_armour', 'val_spiked', 'val_temper'].forEach(function (id) {
      t.ok(sk(id).target.filter === 'allyOrSelf' && sk(id).target.los === false && JSON.stringify(sk(id).target.range) === '[0,3]', id + ': Valdris or an ally within 3');
    });
    t.ok(sk('val_forge_weapon').target.filter === 'ally', 'Forge Weapon: allies only');
    t.ok(sk('val_anvil').kind === 'spell' && POOL.filter(function (id) { return sk(id).kind === 'spell'; }).length === 1, 'only Anvil Drop (a prayer) is a spell (Silence stops it)');
    // barks: every key 4-6 lines of ≤ 70 characters, in his voice
    BARK_KEYS.concat(EXTRA_BARKS).forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ' has 4-6 lines (' + lines.length + ')');
      lines.forEach(function (line) {
        t.ok(typeof line === 'string' && line.length > 0 && line.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(line));
        t.ok(!FEM.test(line), 'no she/her in his barks: ' + JSON.stringify(line));
      });
    });
    t.ok(h.barks.hurt.concat(h.barks.select, h.barks.move).some(function (l) { return /hair/i.test(l); }), 'the hair is his pride (barks)');
    // pronouns: he/him in everything written about him
    const about = [h.blurb, h.role, h.passive.desc];
    ALL.forEach(function (id) { Array.prototype.push.apply(about, textsOf(id)); });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); if (it) about.push(it.desc, it.flavor); });
    ['val_forged', 'val_flame_edge'].forEach(function (id) { about.push(DD.getStatus(id).desc({ id: id, stacks: 3, turns: 1, source: null, data: {} })); });
    about.forEach(function (txt) { t.ok(!FEM.test(txt), 'he/him, never she/her: ' + JSON.stringify(txt)); });
    t.ok(/\bHe\b/.test(h.blurb) && /hair/.test(h.blurb) && /weapons and armour/.test(h.blurb), 'the blurb says "He", the hair, weapons and armour');
    // content he owns
    t.ok(DD.getStatus('val_forged').type === 'buff' && DD.getStatus('val_forged').decay === 'turnEnd' && DD.getStatus('val_forged').defaultTurns === 1, 'Freshly Forged: a buff through the next turn');
    t.ok(DD.getStatus('val_flame_edge').type === 'buff' && DD.getStatus('val_flame_edge').decay === 'never', 'Flame-Forged Edge: a buff until used');
    const items = Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k]; }).filter(function (it) { return it.hero === 'valdris'; });
    t.eq(items.length, 3, 'three hero items');
    t.ok(items.some(function (it) { return it.rarity === 'rare'; }) && items.some(function (it) { return it.rarity === 'legendary'; }), 'a rare and a legendary item');
    // no v1 words in anything of his
    about.concat(BARK_KEYS.reduce(function (a, k) { return a.concat(h.barks[k]); }, [])).forEach(function (txt) {
      t.ok(!/telegraph|\bintent|\bGuard\b|\bXP\b/i.test(txt), 'no v1 words: ' + JSON.stringify(txt));
    });
  });

  T.suite('hero_valdris: sprite and portrait', function (t) {
    const h = DD.getHero('valdris');
    const probs = T.contentHelpers && T.contentHelpers.spriteProblems ? T.contentHelpers.spriteProblems(h.sprite) : [];
    t.eq(probs.length, 0, 'SpriteSpec valid: ' + probs.join(', '));
    t.ok(h.sprite.head.hair === 'long' && h.sprite.mainhand === 'hammer' && h.sprite.outfit === 'armor', 'long hair, a hammer, armour');
    t.ok(/^#f/i.test(h.sprite.palette.hair), 'golden blonde hair (' + h.sprite.palette.hair + ')');
    t.ok(typeof h.sprite.overlay === 'function' && typeof h.sprite.underlay === 'function', 'overlay (apron, charm, big hammer, mane) + underlay (embers)');
    const p0 = DD.problems.length;
    const cv = document.createElement('canvas');
    cv.width = 220; cv.height = 220;
    const ctx = cv.getContext('2d');
    ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
      [1, -1].forEach(function (facing) {
        t.tryRun('draw ' + pose + ' ' + facing, function () { DD.Sprites.draw(ctx, h.sprite, 110, 170, 2, { t: 1.3, pose: pose, facing: facing }); });
      });
    });
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (pt) {
      t.tryRun('draw swing ' + pt, function () { DD.Sprites.draw(ctx, h.sprite, 110, 170, 2, { t: 0.4, pose: 'attack', poseT: pt }); });
    });
    // the big hammer is painted in the stock item's frame: its grip is the hand sprites.js draws (idle: the hammer hangs at his side)
    const grip = DD.Valdris.hammerGrip({ head: { x: 0, y: -26.3, r: 10 }, pose: 'idle' });
    t.ok(grip.x > 9 && grip.x < 12 && grip.y > -6 && grip.y < -1 && Math.abs(grip.r - 0.75) < 1e-9, 'idle grip at his side (' + grip.x.toFixed(1) + ', ' + grip.y.toFixed(1) + ')');
    const port = DD.Sprites.portrait('valdris', 64);
    t.ok(port && port.width === 64, 'portrait renders at 64 px');
    const px = port.getContext('2d').getImageData(0, 0, 64, 64).data;
    let opaque = 0, golden = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 200) opaque++;
      if (px[i + 3] > 200 && px[i] > 200 && px[i + 1] > 160 && px[i + 2] < 140) golden++;
    }
    t.ok(opaque > 1000, 'portrait is not blank (' + opaque + ' opaque px)');
    t.ok(golden > 120, 'the portrait shows plenty of golden hair (' + golden + ' px)');
    t.eq(DD.problems.slice(p0).length, 0, 'no sprite warnings: ' + DD.problems.slice(p0).join(' | '));
  });

  // ---- passive -------------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: Strike While the Iron\'s Hot — +3 on Burning foes (attacks of opportunity too)', function (t) {
    const a = arena({ at: [3, 4], skills: [['val_molten', 1]], enemies: [E(4, 4, 'test_grunt', 2), E(3, 3, 'test_grunt', 2), E(2, 4, 'test_brute')],
      heroes: [{ id: 'test_knight', x: 4, y: 5 }] });
    const v = a.v, g = a.foes[0], g2 = a.foes[1], brute = a.foes[2];
    use(t, v, v.basic, 4, 4, 'cold hit');
    t.eq(g.hp, 28 - 5, 'a foe that is not Burning: 5');
    A().addStatus(g, 'burn', { stacks: 3 }, null);
    use(t, v, v.basic, 4, 4, 'hot hit');
    t.eq(g.hp, 28 - 5 - (5 + IRON), 'a Burning foe: 5 + 3 = 8');
    A().addStatus(brute, 'burn', { stacks: 1 }, null);
    use(t, v, v.basic, 2, 4, 'hot hit on armour');
    t.eq(brute.hp, 50 - (5 + IRON - 1), 'the brute\'s armor 1 applies after: 7');
    // a Wet foe can't Burn, so no bonus
    A().addStatus(g2, 'wet', { turns: 2 }, null);
    A().addStatus(g2, 'burn', { stacks: 2 }, null);
    t.ok(!has(g2, 'burn'), 'Wet: the Burn fizzles');
    // the Burn's own ticks are a status, not his hit: never boosted
    DD.Combat.endTurn();
    const knight = DD.Combat.current();
    t.eq(knight.defId, 'test_knight', 'the knight acts next');
    const gBefore = g.hp;
    use(t, knight, knight.basic, 4, 4, 'knight on the Burning grunt');
    t.eq(gBefore - g.hp, 5 - 0, 'not for allies: the knight\'s slash stays 5');
    DD.Combat.endTurn();
    t.eq(DD.Combat.current(), v, 'round 2');
    // fire on fire: Molten Spray's hit on a foe already Burning is +3, the others plain
    const m = arena({ at: [3, 4], skills: [['val_molten', 1]], enemies: [E(4, 4, 'test_grunt', 2), E(5, 3, 'test_grunt', 2)] });
    A().addStatus(m.foes[0], 'burn', { stacks: 1 }, null);
    use(t, m.v, m.slot('val_molten'), 4, 4, 'spray');
    t.eq(m.foes[0].hp + ',' + m.foes[1].hp, (28 - 4 - IRON) + ',' + (28 - 4), 'Molten Spray: 7 on the Burning foe, 4 on the other');
    // attacks of opportunity: the bonus is declared through modifyOpportunity, so the AI and the HUD see it
    const o = arena({ at: [3, 4], enemies: [E(4, 4), E(8, 8)] });
    const og = o.foes[0];
    t.eq(DD.AI.opportunityDmg(o.v, og, { x: 4, y: 4 }), 5, 'leaving him costs a cold foe 5');
    A().addStatus(og, 'burn', { stacks: 3 }, null);
    t.eq(DD.AI.opportunityDmg(o.v, og, { x: 4, y: 4 }), 5 + IRON, '...and a Burning one 8 (the estimate knows)');
    const seen = opportunities(function () { DD.AI.moveTo(og, 7, 4); });
    t.ok(seen.length === 1 && seen[0].a === 'valdris' && seen[0].skill === 'val_basic', 'it walks away: Valdris swings');
    t.eq(og.hp, 14 - (5 + IRON), 'the swing is 8, exactly as estimated');
    // charmed by the grunt: nothing reaches his charmer, not even the bonus
    const c = arena({ at: [3, 4], enemies: [E(4, 4, 'test_grunt', 2), E(3, 5, 'test_grunt', 2)] });
    A().addStatus(c.foes[0], 'burn', { stacks: 3 }, null);
    A().addStatus(c.v, 'charmed', { turns: 1 }, c.foes[0]);
    use(t, c.v, c.v.basic, 4, 4, 'charmed swing');
    t.eq(c.foes[0].hp, 28, 'charmed: 0 to his charmer, Burning or not');
    A().addStatus(c.foes[1], 'burn', { stacks: 3 }, null);
    use(t, c.v, c.v.basic, 3, 5, 'charmed swing at the other');
    t.eq(c.foes[1].hp, 28 - 8, 'the other grunt takes 8');
  });

  // ---- basic ------------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: Percussive Maintenance (basic)', function (t) {
    const a = arena({ at: [3, 4], enemies: [E(4, 4), E(5, 4)], heroes: [{ id: 'test_knight', x: 2, y: 4 }] });
    const v = a.v, near = a.foes[0], far = a.foes[1];
    t.ok(valid(v, v.basic, 4, 4) && !valid(v, v.basic, 5, 4), 'adjacent only');
    t.ok(!valid(v, v.basic, 2, 4), 'not at allies');
    use(t, v, v.basic, 4, 4, 'whack 1');
    t.eq(near.hp, 9, '5 damage');
    t.eq(v.ap, 2, 'costs 1 AP');
    use(t, v, v.basic, 4, 4, 'whack 2');
    use(t, v, v.basic, 4, 4, 'whack 3');
    t.ok(near.dead && far.hp === 14, 'three whacks in a turn kill a 14 HP grunt (no cooldown)');
    t.eq(DD.Combat.canUse(v, v.basic), 'Not enough AP.', 'then he is out of AP');
    t.ok(DD.Act.opportunitySlot(v) === v.basic, 'his hammer is melee: it is his attack of opportunity');
  });

  // ---- starting skills ------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: Flame-Forged Edge I-III — an ally\'s next damaging skill sets each foe it hits Burning', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const burn = L('val_flame_edge', lv).burn;
      const a = arena({ at: [1, 4], skills: [['val_flame_edge', lv]], heroes: [{ id: 'test_knight', x: 4, y: 4, skills: [{ id: 'test_cleave', level: 1 }, { id: 'test_war_shout', level: 1 }] }],
        enemies: [E(5, 3, 'test_grunt', 2), E(5, 4, 'test_grunt', 2), E(5, 5, 'test_grunt', 2), E(8, 8)] });
      const v = a.v, kn = a.hero('test_knight'), f = a.foes;
      t.ok(valid(v, a.slot('val_flame_edge'), 4, 4) && valid(v, a.slot('val_flame_edge'), 1, 4), 'L' + lv + ': the knight 3 tiles away, or himself');
      use(t, v, a.slot('val_flame_edge'), 4, 4, 'L' + lv + ' edge');
      t.eq(stacks(kn, 'val_flame_edge'), burn, 'L' + lv + ': the knight carries a Flame-Forged Edge ' + burn);
      t.eq(v.ap, 2, 'L' + lv + ': 1 AP');
      t.ok(/cooldown/i.test(String(DD.Combat.canUse(v, a.slot('val_flame_edge')))), 'L' + lv + ': cooldown 1');
      DD.Combat.endTurn();
      t.eq(DD.Combat.current(), kn, 'L' + lv + ': the knight\'s turn');
      use(t, kn, slotOf(kn, 'test_war_shout'), 4, 4, 'L' + lv + ' war shout');
      t.ok(has(kn, 'val_flame_edge'), 'L' + lv + ': a skill that deals no damage leaves the edge alone');
      use(t, kn, slotOf(kn, 'test_cleave'), 5, 4, 'L' + lv + ' cleave');
      t.eq([f[0], f[1], f[2]].map(function (x) { return stacks(x, 'burn'); }).join(','), [burn, burn, burn].join(','), 'L' + lv + ': each foe the cleave hits is Burning ' + burn);
      t.eq(f[3].hp + ',' + stacks(f[3], 'burn'), '14,0', 'L' + lv + ': the one far away untouched');
      t.ok(!has(kn, 'val_flame_edge'), 'L' + lv + ': the edge is spent');
      DD.Combat.endRound();
      t.eq(DD.Combat.current(), v, 'L' + lv + ': round 2');
      DD.Combat.endTurn();
      const b0 = stacks(f[1], 'burn');
      use(t, kn, kn.basic, 5, 4, 'L' + lv + ' slash');
      t.eq(stacks(f[1], 'burn'), b0, 'L' + lv + ': the knight\'s next hit sets nothing new alight');
    });
    // on himself: his next hit lights the foe, the one after is +3 (the passive)
    const s = arena({ at: [3, 4], skills: [['val_flame_edge', 1]], enemies: [E(4, 4, 'test_grunt', 2)] });
    use(t, s.v, s.slot('val_flame_edge'), 3, 4, 'edge on himself');
    use(t, s.v, s.v.basic, 4, 4, 'lit');
    t.ok(stacks(s.foes[0], 'burn') === 3 && s.foes[0].hp === 28 - 5, 'his own whack: 5 and Burning 3');
    use(t, s.v, s.v.basic, 4, 4, 'hot');
    t.eq(s.foes[0].hp, 28 - 5 - 8, 'the next whack strikes while the iron is hot: 8');
    // it waits as long as it takes (no duration) and a hit that is fully Blocked still lights the foe
    const w = arena({ at: [1, 4], skills: [['val_flame_edge', 1]], heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [E(5, 4, 'test_grunt', 2)] });
    use(t, w.v, w.slot('val_flame_edge'), 4, 4, 'edge');
    DD.Combat.endRound();
    DD.Combat.endRound();
    t.ok(S().round === 3 && has(w.hero('test_knight'), 'val_flame_edge'), 'two rounds later the edge is still there, unused');
    DD.Combat.endTurn();
    A().addBlock(w.foes[0], 20);
    use(t, w.hero('test_knight'), w.hero('test_knight').basic, 5, 4, 'blocked slash');
    t.ok(w.foes[0].hp === 28 && stacks(w.foes[0], 'burn') === 3, 'a hit soaked by Block still lights the foe');
    // a Wet foe sizzles: no Burn, the edge is spent anyway
    const wet = arena({ at: [3, 4], skills: [['val_flame_edge', 1]], enemies: [E(4, 4)] });
    A().addStatus(wet.foes[0], 'wet', { turns: 2 }, null);
    use(t, wet.v, wet.slot('val_flame_edge'), 3, 4, 'edge');
    use(t, wet.v, wet.v.basic, 4, 4, 'wet whack');
    t.ok(!has(wet.foes[0], 'burn') && !has(wet.v, 'val_flame_edge'), 'Wet: it sizzles, the edge is spent');
    // an attack of opportunity neither uses nor spends it
    const o = arena({ at: [3, 4], skills: [['val_flame_edge', 1]], enemies: [E(4, 4)] });
    use(t, o.v, o.slot('val_flame_edge'), 3, 4, 'edge');
    DD.AI.moveTo(o.foes[0], 7, 4);
    t.ok(o.foes[0].hp === 9 && !has(o.foes[0], 'burn') && has(o.v, 'val_flame_edge'), 'his swing at a leaving foe: plain 5, the edge kept for a real skill');
    // range 3, no line of sight needed
    const r = arena({ at: [1, 4], skills: [['val_flame_edge', 1]], terrain: { '2,4': 'wall' }, heroes: [{ id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 5, y: 4 }] });
    t.ok(valid(r.v, r.slot('val_flame_edge'), 4, 4) && !valid(r.v, r.slot('val_flame_edge'), 5, 4), 'range 3 through a wall, not 4');
  });

  T.suite('hero_valdris: Forge Armour I-III — Block until the start of its next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const block = L('val_forge_armour', lv).block;
      // the knight acts before him: Valdris armours him for every enemy turn until the knight's own next turn
      const a = arena({ at: [1, 4], skills: [['val_forge_armour', lv]], ai: true, order: ['test_knight', 'valdris'],
        heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [E(5, 4, 'test_grunt', 3)] });
      const v = a.v, kn = a.hero('test_knight'), g = a.foes[0];
      t.eq(DD.Combat.current(), kn, 'L' + lv + ': the knight first');
      kn.block = 0;
      DD.Combat.endTurn();
      t.eq(DD.Combat.current(), v, 'L' + lv + ': then Valdris');
      t.ok(valid(v, a.slot('val_forge_armour'), 4, 4) && valid(v, a.slot('val_forge_armour'), 1, 4), 'L' + lv + ': an ally within 3 or himself');
      use(t, v, a.slot('val_forge_armour'), 4, 4, 'L' + lv + ' armour');
      t.eq(kn.block, block, 'L' + lv + ': +' + block + ' Block');
      t.eq(v.ap, 2, 'L' + lv + ': 1 AP');
      let during = -1;
      onTurns(function (u) { return u === g; }, function () { during = kn.block; }, function () { DD.Combat.endTurn(); });
      t.eq(during, block, 'L' + lv + ': the Block is still there on the grunt\'s turn');
      t.eq(DD.Combat.current(), kn, 'L' + lv + ': round 2, the knight');
      t.eq(kn.hp, kn.maxHp, 'L' + lv + ': the grunt\'s stab was soaked');
      t.eq(kn.block, 0, 'L' + lv + ': gone at the start of the knight\'s next turn');
    });
    // on himself, in his own turn: through every enemy turn of the round
    const s = arena({ at: [3, 4], skills: [['val_forge_armour', 1]], ai: true, enemies: [E(4, 4, 'test_grunt', 3)] });
    use(t, s.v, s.slot('val_forge_armour'), 3, 4, 'self');
    DD.Combat.endTurn();
    t.ok(s.v.hp === s.v.maxHp && s.v.block === 0 && DD.Combat.current() === s.v, 'his own 6 Block soaked the stab and is gone at his next turn start');
    t.ok(!valid(s.v, s.slot('val_forge_armour'), 4, 4), 'never on foes');
  });

  // ---- pool skills ----------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: Forge Weapon I-III — +N damage with every hit until the end of its next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const bonus = L('val_forge_weapon', lv).bonus;
      const a = arena({ at: [1, 4], skills: [['val_forge_weapon', lv]], heroes: [{ id: 'test_knight', x: 4, y: 4, skills: [{ id: 'test_cleave', level: 1 }] }],
        enemies: [E(5, 3, 'test_grunt', 2), E(5, 4, 'test_grunt', 2), E(5, 5, 'test_grunt', 2)] });
      const v = a.v, kn = a.hero('test_knight'), f = a.foes;
      t.ok(!valid(v, a.slot('val_forge_weapon'), 1, 4) && valid(v, a.slot('val_forge_weapon'), 4, 4), 'L' + lv + ': allies only, within 3');
      use(t, v, a.slot('val_forge_weapon'), 4, 4, 'L' + lv + ' forge');
      t.eq(stacks(kn, 'val_forged') + '/' + turnsLeft(kn, 'val_forged'), bonus + '/1', 'L' + lv + ': Freshly Forged +' + bonus + ' for its next turn');
      t.eq(v.ap, 2, 'L' + lv + ': 1 AP');
      DD.Combat.endTurn();
      use(t, kn, slotOf(kn, 'test_cleave'), 5, 4, 'L' + lv + ' cleave');
      t.eq(f.map(function (x) { return x.hp; }).join(','), [28 - 4 - bonus, 28 - 4 - bonus, 28 - 4 - bonus].join(','), 'L' + lv + ': each of the cleave\'s hits is 4 + ' + bonus);
      use(t, kn, kn.basic, 5, 4, 'L' + lv + ' slash');
      t.eq(f[1].hp, 28 - 4 - bonus - 5 - bonus, 'L' + lv + ': and the slash 5 + ' + bonus);
      DD.Combat.endTurn();
      t.ok(!has(kn, 'val_forged'), 'L' + lv + ': gone at the end of the knight\'s turn');
    });
    // forged after the knight's turn: it covers his attack of opportunity on the enemy turn, then his next turn
    const o = arena({ at: [1, 4], skills: [['val_forge_weapon', 2]], order: ['test_knight', 'valdris'], heroes: [{ id: 'test_knight', x: 4, y: 4 }],
      enemies: [E(5, 4, 'test_grunt', 2), E(8, 8)] });
    const kn = o.hero('test_knight'), g = o.foes[0];
    DD.Combat.endTurn();
    use(t, o.v, o.slot('val_forge_weapon'), 4, 4, 'forge after his turn');
    t.eq(DD.AI.opportunityDmg(kn, g, { x: 5, y: 4 }), 5 + 3, 'the AI knows leaving the forged knight costs 8');
    let seen = null;
    onTurns(function (u) { return u === g; }, function () { seen = opportunities(function () { DD.AI.moveTo(g, 8, 4); }); }, function () { DD.Combat.endTurn(); });
    t.ok(seen && seen.length === 1 && seen[0].a === 'test_knight' && g.hp === 28 - 8, 'on its turn the grunt walks off: the knight\'s attack of opportunity is 5 + 3');
    t.ok(DD.Combat.current() === kn && S().round === 2 && has(kn, 'val_forged'), 'round 2: still forged on the knight\'s own turn');
    DD.Combat.endTurn();
    t.ok(!has(kn, 'val_forged'), '...and gone once it ends');
    // the mage's spells count too (every hit)
    const m = arena({ at: [1, 4], skills: [['val_forge_weapon', 1]], heroes: [{ id: 'test_mage', x: 2, y: 4 }], enemies: [E(5, 4, 'test_grunt', 2)] });
    use(t, m.v, m.slot('val_forge_weapon'), 2, 4, 'forge the mage');
    DD.Combat.endTurn();
    const mage = m.hero('test_mage');
    use(t, mage, mage.basic, 5, 4, 'missile');
    t.eq(m.foes[0].hp, 28 - 4 - 2, 'Magic Missile 4 + 2');
  });

  T.suite('hero_valdris: Spiked Pauldrons I-III — Thorns through its next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const th = L('val_spiked', lv).thorns;
      const a = arena({ at: [1, 4], skills: [['val_spiked', lv]], ai: true, order: ['test_knight', 'valdris'],
        heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [E(5, 4, 'test_grunt', 3)] });
      const v = a.v, kn = a.hero('test_knight'), g = a.foes[0];
      kn.block = 0;
      DD.Combat.endTurn();
      use(t, v, a.slot('val_spiked'), 4, 4, 'L' + lv + ' spikes');
      t.eq(stacks(kn, 'thorns') + '/' + turnsLeft(kn, 'thorns'), th + '/1', 'L' + lv + ': Thorns ' + th + ' through its next turn');
      DD.Combat.endTurn();
      t.eq(g.hp, 42 - th, 'L' + lv + ': the grunt stabbed the knight and took ' + th + ' back');
      t.eq(kn.hp, kn.maxHp - 3, 'L' + lv + ': (the stab: 4 − armor 1)');
      t.ok(DD.Combat.current() === kn && has(kn, 'thorns'), 'L' + lv + ': still Thorny on his own turn');
      DD.Combat.endTurn();
      t.ok(!has(kn, 'thorns'), 'L' + lv + ': gone at the end of it');
    });
    const s = arena({ at: [1, 4], skills: [['val_spiked', 1]], enemies: [E(5, 4)] });
    t.ok(valid(s.v, s.slot('val_spiked'), 1, 4) && !valid(s.v, s.slot('val_spiked'), 5, 4), 'himself or allies, never foes');
  });

  T.suite('hero_valdris: Temper I-III — sheds every debuff (III also heals 5)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('val_temper', lv);
      const a = arena({ at: [1, 4], skills: [['val_temper', lv]], heroes: [{ id: 'test_knight', x: 4, y: 4, hp: 20 }], enemies: [E(6, 4)] });
      const v = a.v, kn = a.hero('test_knight'), g = a.foes[0];
      ['stun', 'root', 'weak', 'burn', 'poison'].forEach(function (id) { A().addStatus(kn, id, { stacks: 2, turns: 1 }, g); });
      A().addStatus(kn, 'inspired', { turns: 1 }, v);
      use(t, v, a.slot('val_temper'), 4, 4, 'L' + lv + ' temper');
      t.ok(['stun', 'root', 'weak', 'burn', 'poison'].every(function (id) { return !has(kn, id); }), 'L' + lv + ': every debuff gone');
      t.ok(has(kn, 'inspired'), 'L' + lv + ': buffs stay');
      t.eq(kn.hp, 20 + (Lv.heal || 0), 'L' + lv + ': heals ' + (Lv.heal || 0));
      t.eq(DD.Combat.cooldownOf(v, sk('val_temper'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      // the cleanse came before the knight's turn: no stun, he plays normally
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === kn && kn.ap === 3, 'L' + lv + ': the stun was lifted in time: the knight has his 3 AP');
    });
  });

  T.suite('hero_valdris: Hammer of Faith I-III — damage and a push (pits, lava, water, walls, edges, immovable)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('val_hammer_faith', lv);
      const a = arena({ at: [2, 4], skills: [['val_hammer_faith', lv]], enemies: [E(3, 4, 'test_grunt', 2)] });
      const v = a.v, g = a.foes[0];
      t.ok(valid(v, a.slot('val_hammer_faith'), 3, 4), 'L' + lv + ': adjacent');
      use(t, v, a.slot('val_hammer_faith'), 3, 4, 'L' + lv);
      t.ok(g.hp === 28 - Lv.dmg && pos(g) === (3 + Lv.push) + ',4', 'L' + lv + ': ' + Lv.dmg + ' damage, pushed ' + Lv.push + ' tiles');
      t.eq(v.ap, 1, 'L' + lv + ': 2 AP');
      t.ok(/cooldown/i.test(String(DD.Combat.canUse(v, a.slot('val_hammer_faith')))), 'L' + lv + ': cooldown 1');
    });
    // a pit: YEET (environmental kill, Hype)
    const p = arena({ at: [2, 4], skills: [['val_hammer_faith', 1]], enemies: [E(3, 4), E(8, 8)], terrain: { '4,4': 'pit' } });
    const h0 = S().hype;
    use(t, p.v, p.slot('val_hammer_faith'), 3, 4, 'into the pit');
    t.ok(p.foes[0].dead, 'pushed into a pit: gone');
    hypeIs(t, S().hype - h0, hype().envKill, 'environmental kill Hype');
    // lava: 8 fire + Burn on entry
    const lv = arena({ at: [2, 4], skills: [['val_hammer_faith', 1]], enemies: [E(3, 4, 'test_grunt', 3)], terrain: { '5,4': 'lava' } });
    use(t, lv.v, lv.slot('val_hammer_faith'), 3, 4, 'into lava');
    t.ok(pos(lv.foes[0]) === '5,4' && lv.foes[0].hp === 42 - 7 - 8 && has(lv.foes[0], 'burn'), 'into lava: 7 + 8, Burning (' + lv.foes[0].hp + ')');
    // water: Wet (puts out Burn)
    const wa = arena({ at: [2, 4], skills: [['val_hammer_faith', 1]], enemies: [E(3, 4, 'test_grunt', 2)], terrain: { '5,4': 'water' } });
    A().addStatus(wa.foes[0], 'burn', { stacks: 3 }, null);
    use(t, wa.v, wa.slot('val_hammer_faith'), 3, 4, 'into water');
    t.ok(has(wa.foes[0], 'wet') && !has(wa.foes[0], 'burn') && wa.foes[0].hp === 28 - 7 - IRON, 'into water: Wet, the Burn out (the hit itself was hot: 10)');
    // a wall: bump 3
    const wl = arena({ at: [2, 4], skills: [['val_hammer_faith', 1]], enemies: [E(3, 4, 'test_grunt', 2)], terrain: { '4,4': 'wall' } });
    use(t, wl.v, wl.slot('val_hammer_faith'), 3, 4, 'into a wall');
    t.ok(pos(wl.foes[0]) === '3,4' && wl.foes[0].hp === 28 - 7 - 3, 'against a wall: 7 + bump 3, it stays');
    // the map edge
    const ed = arena({ at: [7, 4], skills: [['val_hammer_faith', 1]], enemies: [E(8, 4, 'test_grunt', 2)] });
    use(t, ed.v, ed.slot('val_hammer_faith'), 8, 4, 'at the edge');
    t.ok(pos(ed.foes[0]) === '8,4' && ed.foes[0].hp === 28 - 7 - 3, 'at the map edge: 7 + bump 3');
    // immovable
    const im = arena({ at: [2, 4], skills: [['val_hammer_faith', 1]], enemies: [E(3, 4, 'test_brute')] });
    use(t, im.v, im.slot('val_hammer_faith'), 3, 4, 'the brute');
    t.ok(pos(im.foes[0]) === '3,4' && im.foes[0].hp === 50 - 6, 'immovable brute: 7 − armor 1, it stays');
    // a foe that dies to the hit is not pushed (and nothing breaks)
    const dy = arena({ at: [2, 4], skills: [['val_hammer_faith', 1]], enemies: [E(3, 4), E(8, 8)] });
    dy.foes[0].hp = 5;
    use(t, dy.v, dy.slot('val_hammer_faith'), 3, 4, 'lethal');
    t.ok(dy.foes[0].dead && !at(4, 4) && !at(5, 4), 'a lethal hit: dead where it stood');
  });

  T.suite('hero_valdris: Molten Spray I-III — a fiery cone: damage, Burn, oil ignites', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('val_molten', lv);
      const a = arena({ at: [3, 4], skills: [['val_molten', lv]], heroes: [{ id: 'test_knight', x: 5, y: 5 }],
        enemies: [E(4, 4, 'test_grunt', 2), E(5, 3, 'test_grunt', 2), E(5, 4, 'test_grunt', 2), E(6, 4, 'test_grunt', 2), E(4, 3, 'test_grunt', 2)] });
      const v = a.v, f = a.foes, kn = a.hero('test_knight');
      t.eq(DD.Targeting.area(v, sk('val_molten'), lv, { x: 4, y: 4 }).length, 4, 'L' + lv + ': a cone 2 deep is 4 tiles');
      t.eq(JSON.stringify(DD.Targeting.area(v, sk('val_molten'), lv, { x: 5, y: 4 })), JSON.stringify(DD.Targeting.area(v, sk('val_molten'), lv, { x: 4, y: 4 })),
        'L' + lv + ': aimed at the tile behind it, the same cone (it starts at him)');
      t.ok(valid(v, a.slot('val_molten'), 5, 4) && !valid(v, a.slot('val_molten'), 6, 4) && !valid(v, a.slot('val_molten'), 4, 3), 'L' + lv + ': aimed up to 2 tiles away, straight');
      const h0 = S().hype;
      use(t, v, a.slot('val_molten'), 4, 4, 'L' + lv);
      t.eq([f[0], f[1], f[2]].map(function (x) { return x.hp + '/' + stacks(x, 'burn'); }).join(','),
        [0, 1, 2].map(function () { return (28 - Lv.dmg) + '/' + Lv.burn; }).join(','), 'L' + lv + ': ' + Lv.dmg + ' fire damage and Burn ' + Lv.burn + ' in the cone');
      t.eq(f[3].hp + '/' + f[4].hp, '28/28', 'L' + lv + ': nothing outside the cone (3 deep, beside him)');
      t.ok(kn.hp === kn.maxHp && !has(kn, 'burn'), 'L' + lv + ': the ally in the cone is spared');
      hypeIs(t, S().hype - h0, hype().multiHit, 'L' + lv + ': Hype for hitting several');
      t.eq(v.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(DD.Combat.cooldownOf(v, sk('val_molten'), lv), 2, 'L' + lv + ': cooldown 2');
    });
    // the fire meets the floor: oil ignites (along the whole slick), a Wet foe takes the damage but does not Burn
    const o = arena({ at: [3, 4], skills: [['val_molten', 1]], enemies: [E(4, 4, 'test_grunt', 2), E(5, 3, 'test_grunt', 2)],
      surfaces: [{ x: 5, y: 5, id: 'oil', turns: 5 }, { x: 6, y: 5, id: 'oil', turns: 5 }, { x: 7, y: 5, id: 'oil', turns: 5 }] });
    A().addStatus(o.foes[1], 'wet', { turns: 2 }, null);
    use(t, o.v, o.slot('val_molten'), 4, 4, 'spray the oil');
    t.ok(surf(5, 5) === 'fire' && surf(7, 5) === 'fire', 'the oil goes up, all along the slick');
    t.ok(o.foes[1].hp === 24 && !has(o.foes[1], 'burn'), 'the Wet foe: 4 damage, no Burn');
    // an explosive barrel in the cone goes off (it was in the desc)
    const bx = arena({ at: [3, 4], skills: [['val_molten', 1]], enemies: [E(4, 4, 'test_grunt', 3), E(8, 8)], objects: [{ x: 5, y: 4, id: 'barrel_explosive' }] });
    use(t, bx.v, bx.slot('val_molten'), 4, 4, 'spray the barrel');
    t.ok(!DD.Grid.tile(5, 4).obj && bx.foes[0].hp < 42 - 4 && bx.v.hp === bx.v.maxHp, 'the barrel explodes: the grunt next to it takes the blast too (' + bx.foes[0].hp + '), Valdris 2 tiles away does not');
    // at the map edge the cone is short; empty cones are fine
    const e = arena({ at: [7, 4], skills: [['val_molten', 1]], enemies: [E(8, 4)] });
    t.eq(DD.Targeting.area(e.v, sk('val_molten'), 1, { x: 8, y: 4 }).length, 1, 'map edge: one tile east of (7,4)');
    use(t, e.v, e.slot('val_molten'), 8, 4, 'edge spray');
    t.eq(e.foes[0].hp, 10, 'edge spray still hits');
    const n = arena({ at: [3, 4], skills: [['val_molten', 1]], enemies: [E(8, 8)] });
    use(t, n.v, n.slot('val_molten'), 2, 4, 'spray at nobody');
    t.eq(n.foes[0].hp, 14, 'nobody hurt');
  });

  T.suite('hero_valdris: Anvil Drop I-III — damage and a Stun (it loses its next turn)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const dmg = L('val_anvil', lv).dmg;
      const a = arena({ at: [1, 4], skills: [['val_anvil', lv]], ai: true, heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [E(5, 4, 'test_grunt', 3), E(8, 8, 'test_grunt', 3)] });
      const v = a.v, kn = a.hero('test_knight'), g = a.foes[0];
      t.ok(valid(v, a.slot('val_anvil'), 5, 4) && !valid(v, a.slot('val_anvil'), 8, 8), 'L' + lv + ': a foe within 4 (not 11 away)');
      use(t, v, a.slot('val_anvil'), 5, 4, 'L' + lv);
      t.ok(g.hp === 42 - dmg && has(g, 'stun'), 'L' + lv + ': ' + dmg + ' damage, Stunned');
      t.eq(v.ap, 0, 'L' + lv + ': 3 AP');
      t.eq(DD.Combat.cooldownOf(v, sk('val_anvil'), lv), 3, 'L' + lv + ': cooldown 3');
      let acted = false;
      const off = DD.Events.on('turn:end', function (e) { if (e.unit === g && kn.hp < kn.maxHp) acted = true; });
      try { DD.Combat.endRound(); } finally { off(); }
      t.ok(!acted && kn.hp === kn.maxHp, 'L' + lv + ': the stunned grunt lost its turn next to the knight');
      t.ok(!has(g, 'stun'), 'L' + lv + ': the Stun is gone after that turn');
    });
    // line of sight needed
    const w = arena({ at: [1, 4], skills: [['val_anvil', 1]], terrain: { '2,4': 'wall', '2,3': 'wall', '2,5': 'wall' }, enemies: [E(4, 4)] });
    t.ok(!valid(w.v, w.slot('val_anvil'), 4, 4), 'a wall hides the foe: no anvil');
    // it interrupts a boss wind-up at once
    const b = arena({ at: [1, 4], skills: [['val_anvil', 1]], heroes: [{ id: 'test_knight', x: 1, y: 6 }], enemies: [E(4, 4, 'test_boss')] });
    const boss = b.foes[0];
    DD.AI.windUp(boss, 'test_boss_meteor', { x: 1, y: 6 }, { label: 'Meteor of Regression' });
    t.eq(boss.intents.length, 1, 'the boss winds up a meteor');
    let cancelled = false;
    const off = DD.Events.on('windup:cancel', function (e) { if (e.unit === boss) cancelled = true; });
    try { use(t, b.v, b.slot('val_anvil'), 4, 4, 'anvil on the boss'); } finally { off(); }
    t.ok(cancelled && boss.intents.length === 0 && has(boss, 'stun'), 'the anvil interrupts it (windup:cancel), the boss is Stunned');
    // a stun-immune foe still takes the damage
    const im = arena({ at: [1, 4], skills: [['val_anvil', 1]], enemies: [E(4, 4, 'test_grunt', 2)] });
    im.foes[0].flags.stunImmune = true;
    use(t, im.v, im.slot('val_anvil'), 4, 4, 'immune');
    t.ok(im.foes[0].hp === 18 && !has(im.foes[0], 'stun'), 'stun-immune: 10 damage, no Stun');
  });

  T.suite('hero_valdris: Hair Flip I-III — foes around him are Dazzled through their next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('val_hair_flip', lv);
      const a = arena({ at: [3, 4], skills: [['val_hair_flip', lv]], enemies: [E(4, 4), E(3, 6), E(6, 4)], heroes: [{ id: 'test_knight', x: 2, y: 4 }] });
      const v = a.v, f = a.foes;
      use(t, v, a.slot('val_hair_flip'), 3, 4, 'L' + lv);
      t.ok(has(f[0], 'dazzled') && turnsLeft(f[0], 'dazzled') === 1, 'L' + lv + ': the adjacent foe is Dazzled for its next turn');
      t.eq(has(f[1], 'dazzled'), Lv.r >= 2, 'L' + lv + ': the foe 2 tiles away ' + (Lv.r >= 2 ? 'too' : 'not (radius 1)'));
      t.ok(!has(f[2], 'dazzled'), 'L' + lv + ': 3 tiles away: never');
      t.ok(!has(a.hero('test_knight'), 'dazzled') && !has(v, 'dazzled'), 'L' + lv + ': friends are spared');
      t.eq(v.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(DD.Combat.cooldownOf(v, sk('val_hair_flip'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      DD.Combat.endRound();
      t.ok(!has(f[0], 'dazzled'), 'L' + lv + ': it wears off after the foe\'s turn');
    });
    // Dazzled foes make no attacks of opportunity: everyone walks away for free
    const d = arena({ at: [3, 4], skills: [['val_hair_flip', 1]], enemies: [E(4, 4)], heroes: [{ id: 'test_knight', x: 4, y: 5 }] });
    t.eq(DD.Combat.provokes(d.v, 0, 4).length, 1, 'before: walking off the grunt provokes it');
    use(t, d.v, d.slot('val_hair_flip'), 3, 4, 'flip');
    t.eq(DD.Combat.provokes(d.v, 0, 4).length, 0, 'after: nothing');
    const seen = opportunities(function () { DD.Combat.move(d.v, 0, 4); });
    t.ok(seen.length === 0 && d.v.hp === d.v.maxHp && pos(d.v) === '0,4', 'he walks off unharmed');
    DD.Combat.endTurn();
    const kn = d.hero('test_knight');
    const seen2 = opportunities(function () { DD.Combat.move(kn, 4, 8); });
    t.ok(seen2.length === 0 && kn.hp === kn.maxHp, 'so does the knight');
  });

  // ---- signature --------------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: Divine Forge — 8 Block and +3 with every hit for the whole party', function (t) {
    const a = arena({ at: [1, 4], order: ['test_knight', 'valdris'], heroes: [{ id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 8, y: 0 }],
      enemies: [E(5, 4, 'test_grunt', 3), E(8, 8)] });
    const v = a.v, kn = a.hero('test_knight'), mage = a.hero('test_mage'), g = a.foes[0];
    kn.block = 0;
    DD.Combat.endTurn();
    t.eq(DD.Combat.current(), v, 'his turn');
    const sig = v.signature;
    S().hype = 99;
    t.eq(DD.Combat.canUse(v, sig), 'Needs 100 Hype.', 'needs 100 Hype');
    S().hype = 100;
    use(t, v, sig, 1, 4, 'DIVINE FORGE');
    [v, kn, mage].forEach(function (u) {
      t.ok(u.block === 8 && stacks(u, 'val_forged') === 3, u.name + ': 8 Block and Freshly Forged +3 (anywhere on the field)');
    });
    t.ok(!has(g, 'val_forged') && g.block === 0, 'foes get nothing');
    t.eq(S().hype, 0, '100 Hype spent');
    t.eq(v.ap, 1, '2 AP');
    // his own bonus works right away (his turn) and through his next one
    A().teleport(g, 2, 4);
    A().teleport(mage, 1, 1);
    const hp0 = g.hp;
    use(t, v, v.basic, 2, 4, 'forged whack');
    t.eq(hp0 - g.hp, 5 + 3, 'his own whack: 5 + 3');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === mage && mage.block === 0 && has(mage, 'val_forged'), 'the mage\'s turn: its Block is gone, the bonus is not');
    use(t, mage, mage.basic, 2, 4, 'forged missile');
    t.eq(hp0 - g.hp, 5 + 3 + 4 + 3, 'Magic Missile 4 + 3');
    DD.Combat.endTurn();
    t.ok(!has(mage, 'val_forged'), 'the mage\'s bonus ended with its turn');
    t.ok(has(kn, 'val_forged') && has(v, 'val_forged'), 'the knight and Valdris keep theirs until their next turns end');
  });

  // ---- items ------------------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: items — "Kiss the Smith" Apron, Forge-Proof Conditioner, Brightforge', function (t) {
    ITEMS.forEach(function (id) {
      const it = DD.getItem(id);
      t.ok(it && it.hero === 'valdris' && it.desc && it.flavor && it.flavor.length <= 120, id + ' registered for Valdris');
      t.ok(!it.stats.block, id + ': no combat-start Block (v2)');
    });
    // the apron: +6 HP, +1 armor, half damage from fire (Burn ticks too)
    const ap = arena({ at: [3, 4], items: ['val_apron'], enemies: [E(4, 4)] });
    t.ok(ap.v.maxHp === 34 && ap.v.armor === 2, 'Apron: 34 max HP, armor 2');
    A().damage(ap.foes[0], ap.v, 10, { element: 'fire' });
    t.eq(ap.v.hp, 34 - (5 - 2), 'Apron: 10 fire → 5, minus armor 2 → 3');
    A().damage(ap.foes[0], ap.v, 10, {});
    t.eq(ap.v.hp, 34 - 3 - 8, 'Apron: other damage as usual (10 − 2)');
    // the conditioner: +2 initiative, +4 HP (a rolled fight reads it)
    const co = arena({ at: [3, 4], items: ['val_conditioner'] });
    t.ok(co.v.init === 2 && co.v.maxHp === 32, 'Conditioner: initiative +2, 32 max HP');
    // Brightforge: +10% damage; Flame-Forged Edge costs 0 AP (his other skills keep their cost)
    const br = arena({ at: [3, 4], items: ['val_brightforge'], skills: [['val_flame_edge', 1], ['val_forge_armour', 1]],
      heroes: [{ id: 'test_knight', x: 3, y: 6 }], enemies: [E(4, 4, 'test_grunt', 3), E(8, 8)] });
    use(t, br.v, br.v.basic, 4, 4, 'bright whack');
    t.eq(br.foes[0].hp, 42 - Math.round(5 * 1.1), 'Brightforge: 5 +10%');
    t.ok(!has(br.foes[0], 'burn'), 'a plain whack sets nothing on fire');
    t.eq(DD.Combat.costOf(br.v, sk('val_flame_edge'), 1).ap, 0, 'Brightforge: Flame-Forged Edge costs 0 AP');
    t.eq(DD.Combat.costOf(br.v, sk('val_forge_armour'), 1).ap, 1, '...Forge Armour still 1');
    const ap0 = br.v.ap;
    use(t, br.v, br.slot('val_flame_edge'), 3, 6, 'free edge');
    t.ok(br.v.ap === ap0 && stacks(br.hero('test_knight'), 'val_flame_edge') === 3, 'a free edge for the knight (' + ap0 + ' AP left)');
    t.ok(/cooldown/i.test(String(DD.Combat.canUse(br.v, br.slot('val_flame_edge')))), '...its cooldown still applies');
    t.eq(DD.Combat.costOf(arena({ at: [3, 4], skills: [['val_flame_edge', 1]] }).v, sk('val_flame_edge'), 1).ap, 1, 'without the hammer: 1 AP');
    // his attack of opportunity swings it too: +10%
    const ob = arena({ at: [3, 4], items: ['val_brightforge'], enemies: [E(4, 4, 'test_grunt', 3), E(8, 8)] });
    const seen = opportunities(function () { DD.AI.moveTo(ob.foes[0], 7, 4); });
    t.ok(seen.length === 1 && ob.foes[0].hp === 42 - Math.round(5 * 1.1), 'Brightforge on his attack of opportunity: 6');
  });

  // ---- previews -------------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: previews match reality for every skill at every level', function (t) {
    const cases = [
      { id: 'val_basic', lv: 1, tg: [4, 4], enemies: [E(4, 4)] },
      { id: 'val_basic', lv: 1, tg: [4, 4], enemies: [E(4, 4)], hp: 3, note: 'lethal' },
      { id: 'val_basic', lv: 1, tg: [4, 4], enemies: [E(4, 4)], burn: 2, note: 'hot' },
      { id: 'val_flame_edge', tg: [5, 4], heroes: [{ id: 'test_knight', x: 5, y: 4 }], enemies: [E(6, 4)] },
      { id: 'val_forge_armour', tg: [5, 4], heroes: [{ id: 'test_knight', x: 5, y: 4 }], enemies: [E(6, 4)] },
      { id: 'val_forge_armour', tg: [3, 4], enemies: [E(6, 4)], note: 'self' },
      { id: 'val_forge_weapon', tg: [5, 4], heroes: [{ id: 'test_knight', x: 5, y: 4 }], enemies: [E(6, 4)] },
      { id: 'val_spiked', tg: [5, 4], heroes: [{ id: 'test_knight', x: 5, y: 4 }], enemies: [E(6, 4)] },
      { id: 'val_temper', tg: [5, 4], heroes: [{ id: 'test_knight', x: 5, y: 4, hp: 20 }], enemies: [E(6, 4)], debuff: 'test_knight' },
      { id: 'val_hammer_faith', tg: [4, 4], enemies: [E(4, 4)], terrain: { '5,4': 'pit' } },
      { id: 'val_hammer_faith', tg: [4, 4], enemies: [E(4, 4)], terrain: { '6,4': 'lava' } },
      { id: 'val_hammer_faith', tg: [4, 4], enemies: [E(4, 4)], terrain: { '5,4': 'wall' } },
      { id: 'val_molten', tg: [4, 4], enemies: [E(4, 4), E(5, 3), E(5, 5)], heroes: [{ id: 'test_knight', x: 5, y: 4 }] },
      { id: 'val_molten', tg: [4, 4], enemies: [E(4, 4), E(5, 3)], surfaces: [{ x: 5, y: 4, id: 'oil', turns: 5 }, { x: 6, y: 4, id: 'oil', turns: 5 }], note: 'oil' },
      { id: 'val_anvil', tg: [6, 4], enemies: [E(6, 4)] },
      { id: 'val_anvil', tg: [6, 4], enemies: [E(6, 4)], hp: 9, note: 'lethal' },
      { id: 'val_hair_flip', tg: [3, 4], enemies: [E(4, 4), E(3, 6)] },
      { id: 'val_signature', lv: 1, tg: [3, 4], heroes: [{ id: 'test_knight', x: 5, y: 4 }, { id: 'test_mage', x: 0, y: 0 }], enemies: [E(6, 4)] },
    ];
    let n = 0;
    cases.forEach(function (c) {
      const lvs = c.lv ? [c.lv] : [1, 2, 3];
      lvs.forEach(function (lv) {
        const pool = POOL.indexOf(c.id) >= 0;
        const a = arena({ at: [3, 4], skills: pool ? [[c.id, lv]] : [], enemies: c.enemies, heroes: c.heroes, terrain: c.terrain, surfaces: c.surfaces });
        if (c.hp) a.foes[0].hp = c.hp;
        if (c.burn) A().addStatus(a.foes[0], 'burn', { stacks: c.burn }, null);
        if (c.debuff) A().addStatus(a.hero(c.debuff), 'poison', { stacks: 3 }, a.foes[0]);
        const slot = c.id === 'val_basic' ? a.v.basic : c.id === 'val_signature' ? a.v.signature : a.slot(c.id);
        if (c.id === 'val_signature') S().hype = 100;
        previewThenUse(t, a.v, slot, c.tg[0], c.tg[1], c.id + ' L' + lv + (c.note ? ' ' + c.note : ''));
        n++;
      });
    });
    t.log('previews checked: ' + n);
    // the HUD's preview of a buff names it
    const a = arena({ at: [3, 4], skills: [['val_forge_weapon', 2]], heroes: [{ id: 'test_knight', x: 5, y: 4 }], enemies: [E(6, 4)] });
    const prev = DD.Combat.preview(a.v, a.slot('val_forge_weapon'), 5, 4);
    const e = prev.perUnit[a.hero('test_knight').id];
    t.ok(e && e.statuses.indexOf('val_forged') >= 0, 'Forge Weapon preview: "' + (e && e.text) + '"');
    // the move preview knows what leaving him costs a Burning foe (the AI's estimate, via modifyOpportunity)
    const o = arena({ at: [3, 4], enemies: [E(4, 4)] });
    A().addStatus(o.foes[0], 'burn', { stacks: 2 }, null);
    t.eq(DD.AI.opportunityDmg(o.v, o.foes[0], { x: 4, y: 4 }), 8, 'attack-of-opportunity estimate on a Burning foe: 8');
  });

  // ---- attacks of opportunity ---------------------------------------------------------------------------------------------
  T.suite('hero_valdris: attacks of opportunity (his hammer holds the line; walking away provokes; pushes and teleports never do)', function (t) {
    let a = arena({ at: [3, 4], enemies: [E(4, 4)] });
    let v = a.v, g = a.foes[0];
    t.eq(DD.AI.opportunityDmg(v, g, { x: 4, y: 4 }), 5, 'the AI knows walking away from him costs 5');
    t.ok(DD.AI.engaged(g).indexOf(v) >= 0, 'the grunt next to him is engaged');
    let seen = opportunities(function () { DD.AI.moveTo(g, 7, 4); });
    t.ok(seen.length === 1 && seen[0].a === 'valdris' && seen[0].m === 'test_grunt', 'it walks away: Valdris swings');
    t.ok(g.hp === 9 && pos(g) === '7,4', '5 damage, and it walks on');
    t.eq(v.oppRound, S().round, 'his swing of this round is spent');
    A().teleport(g, 4, 4);
    seen = opportunities(function () { DD.AI.moveTo(g, 7, 4); });
    t.ok(seen.length === 0 && g.hp === 9, 'once per round');
    DD.Combat.endRound();
    A().teleport(g, 4, 4);
    seen = opportunities(function () { DD.AI.moveTo(g, 7, 4); });
    t.ok(seen.length === 1 && g.hp === 4, 'a new round: a new swing');
    // a swing that kills: Hype
    a = arena({ at: [3, 4], enemies: [E(4, 4), E(8, 8)] });
    a.foes[0].hp = 4;
    const h0 = S().hype;
    DD.AI.moveTo(a.foes[0], 7, 4);
    t.ok(a.foes[0].dead, 'his swing kills the runner');
    hypeIs(t, S().hype - h0, hype().kill, 'kill Hype');
    // walking away from a foe provokes it; the move preview knows; that move can't be undone
    a = arena({ at: [3, 4], enemies: [E(4, 4)] });
    v = a.v; g = a.foes[0];
    const reach = DD.Combat.reachable(v).get('0,4');
    t.ok(reach && reach.provokes && reach.provokes.length === 1 && reach.provokes[0] === g.id, 'the walk to 0,4 provokes the grunt');
    const pv = DD.Combat.provokes(v, 0, 4);
    t.ok(pv.length === 1 && pv[0].unitId === g.id && pv[0].dmg === 3, 'HUD: "provokes 1" (its Stab 4 − his armor 1 = 3)');
    seen = opportunities(function () { t.ok(DD.Combat.move(v, 0, 4), 'Valdris walks off'); });
    t.ok(seen.length === 1 && seen[0].a === 'test_grunt' && seen[0].m === 'valdris', 'the grunt stabs him in the back');
    t.ok(v.hp === 28 - 3 && pos(v) === '0,4', '−3 (armor 1), and he walks on');
    t.ok(!DD.Combat.canUndo(), 'a move that provoked can\'t be undone');
    // pushes never provoke: Hammer of Faith knocks the grunt off the knight without the knight swinging
    a = arena({ at: [2, 4], skills: [['val_hammer_faith', 1]], heroes: [{ id: 'test_knight', x: 3, y: 5 }], enemies: [E(3, 4, 'test_grunt', 2)] });
    seen = opportunities(function () { use(t, a.v, a.slot('val_hammer_faith'), 3, 4, 'knock it away'); });
    t.ok(seen.length === 0 && pos(a.foes[0]) === '5,4' && a.foes[0].hp === 28 - 7, 'pushed off the knight and Valdris: no attack of opportunity');
    // a teleported foe doesn't provoke him either (swaps, Blink: no walk)
    a = arena({ at: [3, 4], enemies: [E(4, 4)] });
    seen = opportunities(function () { A().teleport(a.foes[0], 7, 7); });
    t.ok(seen.length === 0 && a.foes[0].hp === 14, 'teleported away: no swing');
    // his ally's teleport away from a foe provokes nothing either (the fixture mage's Blink)
    a = arena({ at: [1, 1], heroes: [{ id: 'test_mage', x: 3, y: 4, skills: [{ id: 'test_blink', level: 1 }] }], enemies: [E(4, 4)] });
    DD.Combat.endTurn();
    const mage = a.hero('test_mage');
    seen = opportunities(function () { use(t, mage, slotOf(mage, 'test_blink'), 3, 1, 'blink'); });
    t.ok(seen.length === 0 && mage.hp === mage.maxHp, 'Blink out of melee: no stab');
    // a stunned, sleeping, sheep or downed Valdris swings at nobody
    ['stun', 'sleep', 'sheep'].forEach(function (id) {
      const b = arena({ at: [3, 4], heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [E(4, 4)] });
      A().addStatus(b.v, id, { turns: 1 }, b.foes[0]);
      const ev = opportunities(function () { DD.AI.moveTo(b.foes[0], 7, 4); });
      t.ok(ev.length === 0 && b.foes[0].hp === 14 && pos(b.foes[0]) === '7,4', id + ': no swing, it strolls off');
    });
    const dn = arena({ at: [3, 4], heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [E(4, 4)] });
    A().damage(dn.foes[0], dn.v, 99, {});
    seen = opportunities(function () { DD.AI.moveTo(dn.foes[0], 7, 4); });
    t.ok(dn.v.downed && seen.length === 0 && dn.foes[0].hp === 14, 'downed: no swing');
    // with Spiked Pauldrons on himself he holds the line twice: a stab back (Thorns) and the swing as it leaves
    const sp = arena({ at: [3, 4], skills: [['val_spiked', 1]], ai: true, enemies: [E(4, 4, 'test_grunt', 2)] });
    use(t, sp.v, sp.slot('val_spiked'), 3, 4, 'spikes');
    DD.Combat.endTurn();
    t.eq(sp.foes[0].hp, 28 - 3, 'the grunt that stabbed him took Thorns 3');
    seen = opportunities(function () { DD.AI.moveTo(sp.foes[0], 7, 4); });
    t.ok(seen.length === 1 && seen[0].a === 'valdris' && sp.foes[0].hp === 28 - 3 - 5, '...and when it walks off him, the hammer swings too (' + sp.foes[0].hp + ')');
  });

  // ---- v2 edge cases ----------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: v2 edge cases (stunned, silenced, sheep, charmed, AP, turn order, dying targets)', function (t) {
    // stunned by an enemy on its turn: his next turn passes with 0 AP
    const st = arena({ at: [1, 4], skills: [['val_forge_armour', 1]], enemies: [E(2, 4)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    onTurns(function (u) { return u.side === 'enemy'; }, function () { if (S().round === 1) A().addStatus(st.v, 'stun', { turns: 1 }, st.foes[0]); }, function () {
      DD.Combat.endTurn(); DD.Combat.endTurn();
    });
    t.ok(S().round === 2 && DD.Combat.current() && DD.Combat.current().defId === 'test_knight', 'stunned: his round-2 turn passed by itself');
    t.ok(st.v.ap === 0 && DD.Combat.canUse(st.v, st.v.basic) !== true, 'no AP, no skills');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === st.v && st.v.ap === 3 && !has(st.v, 'stun'), 'round 3: back to normal');
    // silenced: only Anvil Drop (a prayer) is blocked
    const si = arena({ at: [3, 4], skills: [['val_anvil', 1], ['val_forge_weapon', 1], ['val_molten', 1], ['val_hair_flip', 1]], enemies: [E(4, 4)], heroes: [{ id: 'test_knight', x: 2, y: 4 }] });
    A().addStatus(si.v, 'silenced', { turns: 1 }, si.foes[0]);
    t.ok(DD.Combat.canUse(si.v, si.slot('val_anvil')) !== true, 'silenced: no Anvil Drop');
    ['val_forge_weapon', 'val_molten', 'val_hair_flip'].forEach(function (id) { t.eq(DD.Combat.canUse(si.v, si.slot(id)), true, 'silenced: ' + id + ' still works (smithing is not a spell)'); });
    t.eq(DD.Combat.canUse(si.v, si.v.basic), true, 'silenced: the hammer still works');
    // sheep: no skills
    const sh = arena({ at: [3, 4], skills: [['val_forge_armour', 1]], enemies: [E(5, 4)] });
    A().addStatus(sh.v, 'sheep', { turns: 1 }, sh.foes[0]);
    t.ok(/Baa/.test(String(DD.Combat.canUse(sh.v, sh.v.basic))) && /Baa/.test(String(DD.Combat.canUse(sh.v, sh.slot('val_forge_armour')))), 'sheep: baa');
    // charmed: −1 AP on his turn; his hammer can't hurt the charmer, the forge still works on friends
    const ch = arena({ at: [3, 4], skills: [['val_forge_armour', 1]], enemies: [E(4, 4, 'test_grunt', 2)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    onTurns(function (u) { return u === ch.foes[0]; }, function () { A().addStatus(ch.v, 'charmed', { turns: 1 }, ch.foes[0]); }, function () { DD.Combat.endRound(); });
    t.ok(DD.Combat.current() === ch.v && ch.v.ap === 2, 'charmed: 2 AP on his turn');
    use(t, ch.v, ch.v.basic, 4, 4, 'charmed whack');
    t.eq(ch.foes[0].hp, 28, 'no damage to his charmer');
    use(t, ch.v, ch.slot('val_forge_armour'), 3, 4, 'charmed armour');
    t.eq(ch.v.block, 6, 'the forge works regardless');
    // not enough AP / not his turn
    const ap = arena({ at: [1, 4], skills: [['val_anvil', 1], ['val_hammer_faith', 1]], enemies: [E(2, 4), E(4, 4)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    use(t, ap.v, ap.v.basic, 2, 4, 'one whack first');
    t.eq(DD.Combat.canUse(ap.v, ap.slot('val_anvil')), 'Not enough AP.', '2 AP left: Anvil Drop needs 3');
    t.eq(DD.Combat.canUse(ap.v, ap.slot('val_hammer_faith')), true, 'Hammer of Faith (2) still fits');
    DD.Combat.endTurn();
    t.ok(/Not Valdris's turn/.test(String(DD.Combat.canUse(ap.v, ap.v.basic))), 'on the knight\'s turn he waits');
    // a foe dying mid-cone: the spray carries on to the others; the last foe dying ends the fight cleanly
    const dy = arena({ at: [3, 4], skills: [['val_molten', 1]], enemies: [E(4, 4), E(5, 4), E(8, 8)] });
    dy.foes[0].hp = 2;
    use(t, dy.v, dy.slot('val_molten'), 4, 4, 'dying cone');
    t.ok(dy.foes[0].dead && dy.foes[1].hp === 10 && stacks(dy.foes[1], 'burn') === 2, 'the first foe dies, the second still burns');
    const last = DD.Combat.sandbox({ w: 9, h: 9, seed: 3, enemyAi: false, heroes: [{ id: 'valdris', x: 3, y: 4, skills: [{ id: 'val_molten', level: 3 }] }],
      enemies: [{ id: 'test_minion', x: 4, y: 4 }, { id: 'test_minion', x: 5, y: 5 }] });
    const lv = last.units[0];
    use(t, lv, slotOf(lv, 'val_molten'), 4, 4, 'final spray');
    t.eq(last.result, 'victory', 'killing the last foes mid-skill wins the fight');
    t.ok(DD.Combat.useSkill(lv, lv.basic, 4, 4) === false, 'and nothing more happens after');
    // Flame-Forged Edge on an ally who then dies before using it: harmless
    const gone = arena({ at: [1, 4], skills: [['val_flame_edge', 1]], heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [E(5, 4)] });
    use(t, gone.v, gone.slot('val_flame_edge'), 4, 4, 'edge');
    A().damage(gone.foes[0], gone.hero('test_knight'), 99, {});
    t.tryRun('a round with the edge on a downed knight', function () { DD.Combat.endRound(); });
    t.ok(gone.hero('test_knight').downed, 'the downed knight just keeps it');
    // initiative modifier 0 from the def
    t.eq(DD.Combat.initOf ? DD.Combat.initOf(arena({ at: [1, 4] }).v) : 0, 0, 'initiative modifier 0');
    // level 5: 28 + 4 × 4 HP
    t.eq(arena({ at: [1, 4], level: 5 }).v.maxHp, 44, 'level 5: 44 max HP');
  });

  // ---- combos ---------------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: combos — his forging pays off for the party (and the party\'s fire pays him)', function (t) {
    // 1. the fixture mage's Oil Slick + his Molten Spray: the whole slick goes up, the crowd in it burns, his hammer is +3
    const f = arena({ at: [3, 4], skills: [['val_molten', 1]], order: ['test_mage', 'valdris'], heroes: [{ id: 'test_mage', x: 4, y: 1, skills: [{ id: 'test_oil_slick', level: 1 }] }],
      enemies: [E(4, 4, 'test_grunt', 2), E(5, 4, 'test_grunt', 2), E(6, 5, 'test_grunt', 2)] });
    const mage = f.hero('test_mage');
    use(t, mage, slotOf(mage, 'test_oil_slick'), 5, 4, 'Oil Slick');
    t.ok(surf(4, 3) === 'oil' && surf(6, 5) === 'oil', 'a 3×3 slick under the grunts');
    DD.Combat.endTurn();
    use(t, f.v, f.slot('val_molten'), 4, 4, 'spray the slick');
    t.ok(surf(6, 5) === 'fire' && surf(4, 3) === 'fire', 'the slick goes up, corner to corner');
    t.ok(f.foes.every(function (x) { return has(x, 'burn'); }), 'all three grunts burn (one was outside the cone)');
    const hp0 = f.foes[0].hp;
    use(t, f.v, f.v.basic, 4, 4, 'hot iron');
    t.eq(hp0 - f.foes[0].hp, 8, 'Valdris strikes while the iron is hot: 8');
    // 2. Flame-Forged Edge → an ally's area attack lights a crowd → his Molten Spray / hammer get +3 on each
    const c = arena({ at: [2, 4], skills: [['val_flame_edge', 1], ['val_molten', 1]], heroes: [{ id: 'test_knight', x: 4, y: 4, skills: [{ id: 'test_cleave', level: 1 }] }],
      enemies: [E(5, 3, 'test_grunt', 2), E(5, 4, 'test_grunt', 2), E(5, 5, 'test_grunt', 2)] });
    use(t, c.v, c.slot('val_flame_edge'), 4, 4, 'edge the knight');
    DD.Combat.endTurn();
    const kn = c.hero('test_knight');
    use(t, kn, slotOf(kn, 'test_cleave'), 5, 4, 'flaming cleave');
    t.ok(c.foes.every(function (x) { return stacks(x, 'burn') === 3; }), 'the cleave sets all three alight');
    // 3. Forge Weapon on an area attacker multiplies: +2 on each of the cleave's three hits
    const w = arena({ at: [2, 4], skills: [['val_forge_weapon', 1]], heroes: [{ id: 'test_knight', x: 4, y: 4, skills: [{ id: 'test_cleave', level: 1 }] }],
      enemies: [E(5, 3, 'test_grunt', 2), E(5, 4, 'test_grunt', 2), E(5, 5, 'test_grunt', 2)] });
    use(t, w.v, w.slot('val_forge_weapon'), 4, 4, 'forge');
    DD.Combat.endTurn();
    use(t, w.hero('test_knight'), slotOf(w.hero('test_knight'), 'test_cleave'), 5, 4, 'forged cleave');
    t.eq(w.foes.reduce(function (s2, x) { return s2 + (28 - x.hp); }, 0), 3 * (4 + 2), 'three hits of 4 + 2 = 18');
    // 4. Hammer of Faith into a pool, then the mage's lightning (Wet: +50%) — the push sets up the element
    const z = arena({ at: [2, 4], skills: [['val_hammer_faith', 1]], heroes: [{ id: 'test_mage', x: 2, y: 2, skills: [{ id: 'test_chain_zap', level: 1 }] }],
      enemies: [E(3, 4, 'test_grunt', 3)], terrain: { '5,4': 'water' } });
    use(t, z.v, z.slot('val_hammer_faith'), 3, 4, 'into the pool');
    t.ok(has(z.foes[0], 'wet') && pos(z.foes[0]) === '5,4', 'pushed into water: Wet');
    DD.Combat.endTurn();
    const zm = z.hero('test_mage'), zhp = z.foes[0].hp;
    use(t, zm, slotOf(zm, 'test_chain_zap'), 5, 4, 'zap the wet grunt');
    t.ok(zhp - z.foes[0].hp >= 9, 'Chain Zap on a Wet foe: 5 × 1.5 (+1 arcane), plus the shocked pool (' + (zhp - z.foes[0].hp) + ')');
    // 5. Anvil Drop's Stun lets the party walk away from the stunned brute for free (stunned foes make no attacks of opportunity)
    const s = arena({ at: [1, 4], skills: [['val_anvil', 1]], heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [E(5, 4, 'test_brute')] });
    use(t, s.v, s.slot('val_anvil'), 5, 4, 'anvil the brute');
    DD.Combat.endTurn();
    const k2 = s.hero('test_knight');
    t.eq(DD.Combat.provokes(k2, 4, 7).length, 0, 'the stunned brute threatens nobody: the knight disengages for free');
  });

  // ---- review (v2) ------------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: review (v2) — plain Burn ticks and Thorns, delayed hits, no Thorns snowball, summons, real-hero combos', function (t) {
    // 1. his own Burn ticking is a status, not his hit: never +3
    const b = arena({ at: [3, 4], skills: [['val_molten', 1]], enemies: [E(4, 4, 'test_grunt', 2), E(8, 8)] });
    const g = b.foes[0];
    use(t, b.v, b.slot('val_molten'), 4, 4, 'spray');
    t.ok(g.hp === 24 && stacks(g, 'burn') === 2, 'sprayed: 4 damage and Burn 2 from Valdris');
    let tick = null;
    let off = DD.Events.on('turn:end', function (e) { if (e.unit === g) tick = 24 - g.hp; });
    try { DD.Combat.endTurn(); } finally { off(); }
    t.eq(tick, 2, 'his Burn ticks for 2 at the end of its turn (a status, not his hit: no +3)');
    // 2. his Thorns hit back plain too (a reflection, not his hit), even at a Burning attacker
    const th = arena({ at: [3, 4], skills: [['val_spiked', 1]], ai: true, enemies: [E(4, 4, 'test_grunt', 2)] });
    use(t, th.v, th.slot('val_spiked'), 3, 4, 'spikes');
    A().addStatus(th.foes[0], 'burn', { stacks: 1 }, null);
    let lost = null;
    off = DD.Events.on('turn:end', function (e) { if (e.unit === th.foes[0]) lost = 28 - th.foes[0].hp; });
    try { DD.Combat.endTurn(); } finally { off(); }
    t.eq(th.v.hp, th.v.maxHp - 3, 'the Burning grunt stabbed him (4 − armor 1)');
    t.eq(lost, 3 + 1, 'it took Thorns 3 (no +3) and then its own Burn 1');
    // 3. a hit of the holder's skill landing outside a skill resolution (a delayed arrow): it lights the foe, the edge goes at once
    const d = arena({ at: [1, 4], skills: [['val_flame_edge', 1]], heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [E(5, 4, 'test_grunt', 2), E(8, 8)] });
    const kn = d.hero('test_knight');
    use(t, d.v, d.slot('val_flame_edge'), 4, 4, 'edge');
    t.ok(!DD.Act.currentSkill(), 'no skill is resolving now');
    A().damage(kn, d.foes[0], 5, { skill: sk('test_slash') });
    t.ok(stacks(d.foes[0], 'burn') === 3 && !has(kn, 'val_flame_edge'), 'a delayed hit of the knight\'s skill: Burning 3, the edge spent at once');
    // 4. Spiked Pauldrons on himself never snowballs: cooldown 1 = every other turn, each coat lasts through his next turn
    const sp = arena({ at: [3, 4], skills: [['val_spiked', 3]], enemies: [E(8, 8)] });
    let most = 0, casts = 0;
    for (let r = 0; r < 6; r++) {
      if (DD.Combat.canUse(sp.v, sp.slot('val_spiked')) === true) { use(t, sp.v, sp.slot('val_spiked'), 3, 4, 'spikes ' + r); casts++; }
      most = Math.max(most, stacks(sp.v, 'thorns'));
      DD.Combat.endTurn();
    }
    t.ok(casts === 3 && most === L('val_spiked', 3).thorns, 'six rounds, three coats: never more than Thorns ' + L('val_spiked', 3).thorns + ' (' + casts + ' casts, max ' + most + ')');
    // 5. the apron only halves the fire he takes: his own Molten Spray stays full strength
    const ap = arena({ at: [3, 4], items: ['val_apron'], skills: [['val_molten', 1]], enemies: [E(4, 4, 'test_grunt', 2)] });
    use(t, ap.v, ap.slot('val_molten'), 4, 4, 'apron spray');
    t.eq(ap.foes[0].hp, 28 - 4, 'the apron never halves his own fire');
    // 6. summons are allies: Forge Weapon and Divine Forge reach a hound, which uses the bonus on its owner's turn
    const sm = arena({ at: [1, 4], skills: [['val_forge_weapon', 1]], heroes: [{ id: 'test_knight', x: 1, y: 7 }],
      summons: [{ id: 'test_hound', x: 4, y: 4, owner: 'test_knight' }], enemies: [E(5, 4, 'test_grunt', 2), E(8, 8)] });
    const hound = S().units.filter(function (u) { return u.defId === 'test_hound'; })[0];
    t.ok(!!hound && valid(sm.v, sm.slot('val_forge_weapon'), hound.x, hound.y), 'Forge Weapon can forge for a summon');
    S().hype = 100;
    use(t, sm.v, sm.v.signature, 1, 4, 'Divine Forge');
    t.ok(hound && hound.block === 8 && stacks(hound, 'val_forged') === 3, 'Divine Forge: the hound gets 8 Block and +3 too');
    DD.Combat.endTurn();
    t.eq(DD.Combat.current(), sm.hero('test_knight'), 'the knight\'s turn (his hound acts on it)');
    if (hound) use(t, hound, slotOf(hound, 'test_hound_bite'), 5, 4, 'forged bite');
    t.eq(sm.foes[0].hp, 28 - 3 - 3, 'its Bite: 3 + 3');
    // 7. the signature's text gives the Block no "until the end" (Block ends at the start of its owner's next turn)
    const sig = DD.skillDesc(sk('val_signature'), 1, null);
    t.ok(!/Block[^.]*until the end/.test(sig) && /\+3 damage with every hit until the end of their next turn/.test(sig), 'Divine Forge text: ' + sig);
    // 8. real heroes (skipped in isolated runs): the party's fire feeds his passive, his edge lights their area attacks
    if (DD.getHero('pebbles') && sk('peb_basic')) {
      const p = arena({ at: [3, 4], order: ['pebbles', 'valdris'], heroes: [{ id: 'pebbles', x: 5, y: 4 }], enemies: [E(4, 4, 'test_grunt', 2)] });
      const pb = p.hero('pebbles');
      use(t, pb, pb.basic, 4, 4, 'Spicy Nibble');
      if (has(p.foes[0], 'burn')) {
        DD.Combat.endTurn();
        const h0 = p.foes[0].hp;
        use(t, p.v, p.v.basic, 4, 4, 'hot whack');
        t.eq(h0 - p.foes[0].hp, 5 + IRON, 'Pebbles sets it Burning, Valdris strikes while the iron is hot: 8');
      } else t.log('Spicy Nibble no longer Burns: the Pebbles combo check is skipped');
    } else t.log('Pebbles not loaded: combo check skipped');
    if (DD.getHero('zarathor') && sk('zar_fireball') && sk('zar_fireball').area) {
      const z = arena({ at: [3, 4], skills: [['val_flame_edge', 1]], heroes: [{ id: 'zarathor', x: 3, y: 1, skills: [{ id: 'zar_fireball', level: 1 }] }],
        enemies: [E(4, 4, 'test_grunt', 2), E(5, 4, 'test_grunt', 2), E(8, 8)] });
      const zr = z.hero('zarathor');
      use(t, z.v, z.slot('val_flame_edge'), 3, 1, 'edge for Zarathor');
      DD.Combat.endTurn();
      use(t, zr, slotOf(zr, 'zar_fireball'), 5, 4, 'Gold-Plated Fireball');
      const hit = z.foes.filter(function (f) { return f.hp < f.maxHp; });
      t.ok(hit.length >= 2 && hit.every(function (f) { return stacks(f, 'burn') >= 3; }) && !has(zr, 'val_flame_edge'),
        'Flame-Forged Edge on Zarathor: his fireball sets every foe it hits Burning 3 (' + hit.length + ' hit), the edge is spent');
      DD.Combat.endTurn();
      if (!z.foes[0].dead && has(z.foes[0], 'burn')) {
        const h1 = z.foes[0].hp;
        use(t, z.v, z.v.basic, 4, 4, 'hot whack');
        t.eq(h1 - z.foes[0].hp, 5 + IRON, '...then Valdris strikes while the iron is hot: 8');
      }
    } else t.log('Zarathor not loaded: combo check skipped');
    if (DD.getHero('kiri') && sk('kir_beyond')) {
      const k = arena({ at: [1, 4], skills: [['val_flame_edge', 1]], heroes: [{ id: 'kiri', x: 2, y: 2, skills: [{ id: 'kir_beyond', level: 1 }] }],
        enemies: [E(6, 4, 'test_grunt', 3), E(8, 8)] });
      const ki = k.hero('kiri');
      use(t, k.v, k.slot('val_flame_edge'), 2, 2, 'edge for Kiri');
      DD.Combat.endTurn();
      use(t, ki, slotOf(ki, 'kir_beyond'), 6, 4, 'Arrow from Beyond');
      t.ok(has(ki, 'val_flame_edge') && !has(k.foes[0], 'burn'), 'Arrow from Beyond deals nothing yet: the edge waits');
      DD.Combat.endRound();
      DD.Combat.endTurn();
      if (k.foes[0].hp < 42) t.ok(stacks(k.foes[0], 'burn') === 3 && !has(ki, 'val_flame_edge'), 'the arrow lands at the start of her next turn: Burning 3, the edge spent');
      else t.log('the arrow did not land: check skipped');
    } else t.log('Kiri not loaded: combo check skipped');
  });

  // ---- AutoPlay ---------------------------------------------------------------------------------------------------------
  T.suite('hero_valdris: AutoPlay battles at levels 1 / 3 / 5 (party Valdris + fixture knight, cleric, mage)', function (t) {
    const loadouts = {
      1: [['val_flame_edge', 1], ['val_forge_armour', 1]],
      3: [['val_flame_edge', 2], ['val_forge_weapon', 1], ['val_hammer_faith', 1], ['val_molten', 1]],
      '3b': [['val_spiked', 1], ['val_temper', 1], ['val_anvil', 1], ['val_hair_flip', 1]],
      5: [['val_flame_edge', 2], ['val_forge_weapon', 2], ['val_molten', 2], ['val_anvil', 2]],
      '5b': [['val_forge_armour', 2], ['val_hammer_faith', 2], ['val_hair_flip', 2], ['val_spiked', 2]],
    };
    const fights = [[1, 1, 'normal'], [1, 1, 'elite'], [1, 1, 'boss'], [2, 3, 'normal'], [2, '3b', 'elite'], [2, 3, 'boss'],
      [3, 5, 'normal'], [3, '5b', 'elite'], [3, 5, 'boss'], [1, '3b', 'normal'], [2, '5b', 'normal'], [3, '3b', 'normal']];
    const used = {};
    const orig = DD.Combat.useSkill;
    const results = [];
    let wins = 0, aooBy = 0, aooOn = 0;
    DD.Combat.useSkill = function (unit, slot) {
      const r = orig.apply(this, arguments);
      if (r && unit && slot && unit.defId === 'valdris') used[slot.id] = (used[slot.id] || 0) + 1;
      return r;
    };
    const offOpp = DD.Events.on('opportunity:attack', function (e) {
      if (e.attacker && e.attacker.defId === 'valdris') aooBy++;
      if (e.mover && e.mover.defId === 'valdris') aooOn++;
    });
    try {
      fights.forEach(function (f, i) {
        const act = f[0], key = f[1], kind = f[2], lvl = parseInt(key, 10);
        const enc = DD.getEncounter('test_a' + act + '_' + kind);
        if (!enc) { t.fail('fixture encounter missing: test_a' + act + '_' + kind); return; }
        const party = ['valdris', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
          if (id === 'valdris') return DD.Combat.makeRunHero({ id: id, level: lvl, skills: loadouts[key].map(function (e) { return { id: e[0], level: e[1] }; }) });
          const h = DD.getHero(id);
          return DD.Combat.makeRunHero({ id: id, level: lvl, skills: h.skillPool.slice(0, 4).map(function (sid) { return { id: sid, level: Math.min(3, 1 + Math.floor(lvl / 3)) }; }) });
        });
        const seed = (Number(t.seed) || 1) * 37 + (i + 1) * 7919;
        const setup = DD.Encounter.build(enc, party, { rng: DD.RNG(seed), difficulty: 'normal', act: act });
        DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: kind });
        const r = DD.AutoPlay.runBattle(30);
        const s = S();
        const v = s.units.filter(function (u) { return u.defId === 'valdris'; })[0];
        t.ok(v && isFinite(v.hp) && v.hp >= 0 && v.hp <= v.maxHp, enc.id + ' L' + lvl + ': Valdris sane');
        t.ok(!!s.order && s.order.length > 0, enc.id + ': initiative rolled');
        t.ok(r.result === 'victory' || r.result === 'defeat' || r.timeout, enc.id + ' L' + lvl + ': the battle ends (' + r.result + ', ' + r.rounds + ' rounds)');
        if (r.result === 'victory') wins++;
        results.push(enc.id + ' L' + key + ': ' + (r.result || 'timeout') + ' in ' + r.rounds + ' (Valdris ' + (v.downed ? 'downed' : v.hp + '/' + v.maxHp) +
          ', dealt ' + ((s.stats.units[v.id] || {}).dmg || 0) + ')');
      });
      // a full Hype bar and the party in the thick of it: AutoPlay calls down the Divine Forge (a deterministic sandbox turn)
      const a = arena({ at: [3, 4], level: 5, heroes: [{ id: 'test_knight', x: 4, y: 5, level: 5 }, { id: 'test_mage', x: 2, y: 5, level: 5 }],
        enemies: [E(5, 5, 'test_grunt', 2), E(4, 6, 'test_grunt', 2), E(5, 4, 'test_grunt', 2), E(3, 6, 'test_grunt', 2)] });
      a.s.hype = 100;
      const before = used.val_signature || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.val_signature || 0) > before, 'AutoPlay forges for everyone with 100 Hype and the party engaged');
      // a grunt on the lip of a pit: AutoPlay hammers it in (an environmental kill beats any whack)
      const p = arena({ at: [3, 4], level: 3, skills: [['val_hammer_faith', 1], ['val_forge_armour', 1]], enemies: [E(4, 4), E(7, 7)], terrain: { '5,4': 'pit' } });
      const b0 = used.val_hammer_faith || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.val_hammer_faith || 0) > b0 && p.foes[0].dead, 'AutoPlay knocks a grunt into the pit behind it');
      // a crowd in front of him and an edge in hand: he lights them up and hits the hot ones
      const c = arena({ at: [3, 4], level: 3, skills: [['val_molten', 1], ['val_forge_armour', 1]], enemies: [E(4, 4, 'test_grunt', 2), E(5, 3, 'test_grunt', 2), E(5, 5, 'test_grunt', 2)] });
      const m0 = used.val_molten || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.val_molten || 0) > m0 && c.foes.every(function (x) { return has(x, 'burn'); }), 'AutoPlay sprays a crowd of three');
      // surrounded by three grunts with his hair in hand: AutoPlay flips it (each of their stabs will probably miss)
      const hf = arena({ at: [4, 4], level: 3, skills: [['val_hair_flip', 1], ['val_spiked', 1]], enemies: [E(5, 4, 'test_grunt', 2), E(3, 4, 'test_grunt', 2), E(4, 5, 'test_grunt', 2)] });
      const f0 = used.val_hair_flip || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.val_hair_flip || 0) > f0 && hf.foes.every(function (x) { return has(x, 'dazzled'); }), 'AutoPlay flips the hair with three foes around him');
    } finally { DD.Combat.useSkill = orig; offOpp(); }
    t.log(results.join(' | '));
    t.log('Valdris skill uses: ' + Object.keys(used).map(function (k) { return k + '×' + used[k]; }).join(', ') + '; attacks of opportunity by him ' + aooBy + ', on him ' + aooOn);
    t.ok((used.val_basic || 0) > 0, 'Percussive Maintenance used');
    t.ok((used.val_flame_edge || 0) > 0, 'Flame-Forged Edge used');
    t.ok((used.val_forge_armour || 0) > 0, 'Forge Armour used');
    const poolUsed = Object.keys(used).filter(function (k) { return POOL.indexOf(k) >= 0; });
    t.ok(poolUsed.length >= 7, 'at least 7 different pool skills used by AutoPlay (' + poolUsed.join(', ') + ')');
    t.ok(wins >= 9, 'the party wins most fixture fights (' + wins + '/' + fights.length + ')');
  });

  // ---- v2 requests (Nov 3): heals bring the downed back up, barrels ----------------------------------------------------
  T.suite('hero_valdris: v2 requests — Temper III gets a downed ally back up (5 HP); Temper I-II can\'t be aimed at the downed; his hammers set off barrels', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const a = arena({ at: [1, 4], skills: [['val_temper', lv]], heroes: [{ id: 'test_knight', x: 2, y: 4 }], enemies: [E(8, 8)] });
      const k = a.hero('test_knight'), sl = a.slot('val_temper');
      DD.Act.kill(k, null);
      t.ok(k.downed && !k.dead, 'L' + lv + ': premise: the knight is down');
      const tg = DD.Targeting.validTargets(a.v, sl).filter(function (q) { return q.x === 2 && q.y === 4; })[0];
      if (lv < 3) {
        t.ok(!tg && !valid(a.v, sl, 2, 4), 'L' + lv + ': Temper ' + (lv === 1 ? 'I' : 'II') + ' heals nothing: it can\'t be aimed at a downed ally');
        return;
      }
      t.ok(tg && tg.revive === true, 'L3: the downed knight is a target (revive)');
      const prev = DD.Combat.preview(a.v, sl, 2, 4);
      const e = prev.perUnit[k.id];
      t.ok(e && e.revived && e.heal === 5 && e.text.indexOf('UP! 5 HP') >= 0, 'L3: the preview says UP! 5 HP (' + (e && e.text) + ')');
      use(t, a.v, sl, 2, 4, 'L3 Temper on the downed knight');
      t.ok(!k.downed && k.hp === 5, 'L3: back on its feet with 5 HP (' + k.hp + ')');
      t.eq(a.v.ap, 2, 'L3: 1 AP');
      // on a standing ally Temper III still sheds the debuffs first, then mends 5
      DD.Act.addStatus(k, 'weak', { turns: 2 }, null);
      const hp0 = k.hp;
      slotOf(a.v, 'val_temper').cd = 0;
      use(t, a.v, sl, 2, 4, 'L3 Temper on the standing knight');
      t.ok(!DD.Act.hasStatus(k, 'weak') && k.hp === Math.min(k.maxHp, hp0 + 5), 'L3: a standing ally sheds its debuffs and heals 5');
    });
    // Percussive Maintenance and Hammer of Faith at an explosive barrel: it goes off at once (no push: nothing to push)
    ['val_basic', 'val_hammer_faith'].forEach(function (id) {
      const b = arena({ at: [1, 4], skills: id === 'val_basic' ? [] : [[id, 1]], objects: [{ x: 2, y: 4, id: 'barrel_explosive' }], enemies: [E(3, 4, 'test_grunt', 3), E(8, 8)] });
      const sl = id === 'val_basic' ? b.v.basic : b.slot(id), g = b.foes[0], g0 = g.hp;
      t.ok(DD.Targeting.validTargets(b.v, sl).some(function (q) { return q.obj === 'barrel_explosive' && q.x === 2 && q.y === 4; }), id + ': can be aimed at the adjacent barrel');
      const prev = previewThenUse(t, b.v, sl, 2, 4, id + ' at a barrel');
      t.eq(prev.detonates, 'barrel_explosive', id + ': the preview detonates it');
      t.ok(!DD.Grid.tile(2, 4).obj && g.hp < g0 && g.x === 3, id + ': it went off; the grunt next to it takes the blast where it stands');
      t.eq(b.v.ap, 3 - DD.Combat.costOf(b.v, sk(id), 1).ap, id + ': its AP is paid');
    });
  });
})();
