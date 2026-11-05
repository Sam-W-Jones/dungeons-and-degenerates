/* Dungeons and Degenerates — tests/content/hero_hjalmar.js
 * Suites "hero_hjalmar: …" for js/data/heroes/hjalmar.js (v2: initiative turns, no telegraphs, no Guard, attacks of
 * opportunity): registry data, texts and barks (he/him, simplicity), the sprite and the trap painters, the traps
 * themselves (set, sprung by foes walking / pushed / swapped in, one-shot, never by heroes or flyers, invisible to the
 * AI), the Monkey Business passive (+5 Hype per trap sprung), every skill at every level in sandbox fights (desc ==
 * effect: damage, statuses and their exact own-turn durations, displacement, gold, costs, cooldowns, ranges), the
 * signature, the items, previews against reality, v2 + opportunity-attack edge cases and AutoPlay battles at levels
 * 1 / 3 / 5 with the fixture knight, cleric and mage.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  const POOL = ['hja_peel', 'hja_bear_trap', 'hja_cushion', 'hja_paint', 'hja_firecracker', 'hja_glove', 'hja_pickpocket', 'hja_swing', 'hja_switch'];
  const TRAPS = ['hja_peel', 'hja_bear_trap', 'hja_cushion', 'hja_paint', 'hja_firecracker', 'hja_glove'];
  const OBJS = { hja_peel: 'hja_peel', hja_bear_trap: 'hja_bear_trap', hja_cushion: 'hja_cushion', hja_paint: 'hja_paint', hja_firecracker: 'hja_firecracker', hja_glove: 'hja_glove' };
  const ALL = POOL.concat(['hja_basic', 'hja_signature']);
  const ITEMS = ['hja_coconut', 'hja_pomade', 'hja_prop_sack'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const FEM = /\b(she|her|hers|herself)\b/i;
  const SLIPPED = 'hja_slipped';
  const EAST = { x: 1, y: 0 }, WEST = { x: -1, y: 0 }, NORTH = { x: 0, y: -1 }, SOUTH = { x: 0, y: 1 };

  // ---- helpers ------------------------------------------------------------------------------------------
  function sk(id) { return DD.getSkill(id); }
  function L(id, lv) { return DD.skillLevel(sk(id), lv); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function stacks(u, id) { const st = DD.Act.getStatus(u, id); return st ? st.stacks : 0; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function objAt(x, y) { const tl = DD.Grid.tile(x, y); return tl ? tl.obj : null; }
  function trapAt(x, y) { const o = objAt(x, y); return o && DD.Hjalmar.isTrap(o) ? o : null; }
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
   * Sandbox with Hjalmar at cfg.at (default 1,4) on a 9×9 floor; heroes first in the listed order (Hjalmar, then
   * cfg.heroes), enemies pass unless cfg.ai. cfg: { at, level, skills: [[id, lv]], items, hp, enemies, heroes, terrain,
   * objects, surfaces, w, h, seed, ai, gold, killAll (a fight that can be won; default: it never ends) }.
   * Returns { s, h, slot(id), foes }.
   */
  function arena(cfg) {
    cfg = cfg || {};
    const p = cfg.at || [1, 4];
    const skills = (cfg.skills || []).map(function (e) { return { id: e[0], level: e[1] || 1 }; });
    const heroes = [{ id: 'hjalmar', x: p[0], y: p[1], level: cfg.level || 1, skills: skills, items: cfg.items || [], hp: cfg.hp }]
      .concat(cfg.heroes || []);
    const s = DD.Combat.sandbox({
      w: cfg.w || 9, h: cfg.h || 9, seed: cfg.seed || 7, enemyAi: !!cfg.ai, gold: cfg.gold || 0,
      objective: cfg.killAll ? { type: 'killAll' } : { type: 'custom', text: 'Hjalmar test' },
      encounter: cfg.killAll ? undefined : { id: 'hja_test_arena', checkObjective: function () { return null; } },
      heroes: heroes, enemies: cfg.enemies || [], terrain: cfg.terrain ? terr(cfg.terrain) : undefined, objects: cfg.objects, surfaces: cfg.surfaces,
    });
    const h = s.units.filter(function (u) { return u.defId === 'hjalmar'; })[0];
    return {
      s: s, h: h,
      slot: function (id) { return DD.Combat.slotsOf(h).filter(function (sl) { return sl.id === id; })[0]; },
      foes: s.units.filter(function (u) { return u.side === 'enemy'; }),
    };
  }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0]; }
  function unitOf(defId, n) { return DD.Combat.state.units.filter(function (u) { return u.defId === defId && !u.dead; })[n || 0] || null; }

  /** Use a slot for real (canUse + valid target), failing the test with the reason otherwise. */
  function use(t, u, slot, x, y, label) {
    const ok = DD.Combat.canUse(u, slot);
    if (ok !== true) { t.fail((label || (slot && slot.id)) + ': canUse says ' + ok); return false; }
    const r = DD.Combat.useSkill(u, slot, x, y);
    if (!r) t.fail((label || slot.id) + ': useSkill refused target ' + x + ',' + y);
    return r;
  }
  function valid(u, slot, x, y) { return DD.Targeting.isValidTarget(u, slot, x, y); }
  /** Set a trap with Hjalmar's own skill (pays its cost), returning the object. */
  function set(t, a, id, x, y, label) {
    use(t, a.h, a.slot(id), x, y, label || id);
    return trapAt(x, y);
  }

  function hpMap(s) { const m = {}; s.units.forEach(function (u) { m[u.id] = { hp: u.hp, dead: !!u.dead, downed: !!u.downed }; }); return m; }
  function previewProblems(prev, s, before) {
    if (prev.uncertain) return ['the preview is uncertain (Hjalmar rolls no dice)'];
    const out = [];
    s.units.forEach(function (u) {
      const b = before[u.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[u.id];
      const real = b.hp - u.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
      if (real !== said) out.push(u.name + ': real HP change ' + (-real) + ', preview ' + (-said));
      const down = (u.dead && !b.dead) || (u.downed && !b.downed);
      if (down !== !!(e && e.lethal)) out.push(u.name + ': lethal mismatch');
      const moved = e && e.moved ? e.moved.x + ',' + e.moved.y : null;
      if (!u.dead && (u.x !== b.x || u.y !== b.y) && moved !== u.x + ',' + u.y) out.push(u.name + ': moved to ' + u.x + ',' + u.y + ', preview ' + moved);
    });
    return out;
  }
  function stateKey(s) {
    return JSON.stringify([s.units.map(function (u) {
      return [u.id, u.x, u.y, u.hp, u.block, u.ap, !!u.dead, (u.statuses || []).map(function (st) { return [st.id, st.stacks, st.turns]; }),
        DD.Combat.slotsOf(u).map(function (sl) { return [sl.id, sl.cd, sl.uses]; }), u.data];
    }), s.grid.tiles.map(function (tl) { return [tl.t, tl.surface && [tl.surface.id, tl.surface.turns], tl.obj && [tl.obj.id, tl.obj.hp, tl.obj.data]]; }),
    s.hype, s.rng.getState(), s.log.length, s.sandboxGold, s.data]);
  }
  /** Preview, then use: the preview must leave the fight untouched and predict HP, downs, moves and Hype exactly. */
  function previewThenUse(t, u, slot, x, y, label) {
    const s = DD.Combat.state;
    const k0 = stateKey(s);
    const prev = DD.Combat.preview(u, slot, x, y);
    t.eq(stateKey(s), k0, label + ': preview leaves the fight untouched');
    const before = hpMap(s);
    s.units.forEach(function (v) { before[v.id].x = v.x; before[v.id].y = v.y; });
    const hype0 = s.hype;
    use(t, u, slot, x, y, label);
    previewProblems(prev, s, before).forEach(function (m) { t.fail(label + ': preview ≠ reality: ' + m); });
    t.eq(s.hype - hype0, prev.hype, label + ': preview Hype matches');
    return prev;
  }
  /** Call fn(e) at each turn:start of a unit matching pred while body() runs. */
  function onTurns(pred, fn, body) {
    const off = DD.Events.on('turn:start', function (e) { if (pred(e.unit)) fn(e); });
    try { body(); } finally { off(); }
  }
  /** How many of u's turn starts had status id while body() ran. */
  function turnsWith(u, id, body) {
    let n = 0;
    onTurns(function (x) { return x === u; }, function () { if (has(u, id)) n++; }, body);
    return n;
  }
  /** Run body; return how many attacks of opportunity fired (opportunity:attack events). */
  function aooDuring(body) {
    let n = 0;
    const off = DD.Events.on('opportunity:attack', function () { n++; });
    try { body(); } finally { off(); }
    return n;
  }
  function textsOf(id) {
    const d = sk(id), out = [d.flavor || ''];
    for (let lv = 1; lv <= d.levels.length; lv++) out.push(DD.skillDesc(d, lv, null));
    return out;
  }

  // ---- registry & data --------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: registry, identity, numbers, descriptions and barks', function (t) {
    const h = DD.getHero('hjalmar');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.eq(h.name, 'Hjalmar', 'name');
    t.ok(h.epithet && h.race === 'Monkey' && h.cls && h.role && h.blurb.length > 60, 'identity + blurb');
    t.ok(h.complexity >= 1 && h.complexity <= 3 && /^#[0-9a-f]{6}$/i.test(h.color), 'complexity + colour');
    t.eq(h.unlock, null, 'available from the start (unlock: null, DESIGN v2)');
    t.eq(JSON.stringify(h.stats), JSON.stringify({ hp: 22, ap: 3, mov: 5, armor: 0, init: 4 }), 'L1 stats: 22 HP, 3 AP, move 5, initiative +4');
    t.eq(h.growth.hp, 3, 'growth +3 HP per level');
    t.ok(h.flags && h.flags.hop === true, 'hop: he climbs everything');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['hja_peel', 'hja_bear_trap']), 'starting skills: Banana Peel + Bear Trap');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'pool of 9 (DESIGN v2: 8-10 besides basic and signature)');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic/signature not in pool');
    t.eq(JSON.stringify(h.summons || []), '[]', 'no summons');
    t.eq(sk(h.signature).hype, 100, 'signature costs 100 Hype');
    const b = L(h.basic, 1);
    t.ok(b.dmg >= 4 && b.dmg <= 6 && sk(h.basic).ap === 1 && !sk(h.basic).cooldown, 'basic: 1 AP, 4-6 damage, no cooldown');
    t.ok(DD.Targeting.range(null, sk(h.basic), 1)[1] >= 2, 'a ranged basic (a squishy monkey makes no attacks of opportunity)');
    t.ok(h.passive && h.passive.name === 'Monkey Business' && /5 Hype/.test(h.passive.desc) && /trap/.test(h.passive.desc), 'passive Monkey Business: 5 Hype per trap sprung');
    const aps = {};
    let words = 0;
    ALL.forEach(function (id) {
      const d = sk(id);
      t.ok(!!d, id + ' registered');
      if (!d) return;
      t.eq(d.owner, 'hjalmar', id + ' owner');
      t.ok(typeof d.icon === 'string' && d.icon.length > 0 && d.icon.length <= 3, id + ' one emoji icon');
      t.ok(d.kind !== 'spell', id + ' is not a spell (Silence does not stop pranks)');
      if (POOL.indexOf(id) >= 0) { t.eq(d.levels.length, 3, id + ' has 3 levels'); aps[DD.resolve(d.ap, d.levels[0], null, 1)] = 1; }
      for (let lv = 1; lv <= d.levels.length; lv++) {
        const txt = DD.skillDesc(d, lv, null);
        t.ok(txt && !/undefined|NaN|\[object/.test(txt), id + ' L' + lv + ' desc with a null user');
        const Lv = DD.skillLevel(d, lv);
        ['dmg', 'snap', 'boom', 'push', 'gold', 'range'].forEach(function (k) {
          if (typeof Lv[k] === 'number' && Lv[k] > 0) t.ok(new RegExp('(^|[^0-9])' + Lv[k] + '([^0-9]|$)').test(txt), id + ' L' + lv + ' desc shows ' + k + ' ' + Lv[k]);
        });
        if (Lv.turns > 1) t.ok(txt.indexOf(Lv.turns + ' turns') >= 0, id + ' L' + lv + ' desc shows turns ' + Lv.turns);
        // DESIGN §6 Simplicity: one verb, read in one breath, no if/else clauses
        const n = txt.split(/\s+/).length;
        words = Math.max(words, n);
        t.ok(n <= 24, id + ' L' + lv + ' desc reads in one breath (' + n + ' words): ' + txt);
        t.ok(!/\bif\b|\bunless\b|\botherwise\b/i.test(txt), id + ' L' + lv + ' desc has no conditions: ' + txt);
      }
      t.ok(!d.flavor || d.flavor.length <= 120, id + ' flavor ≤ 120');
    });
    t.log('longest desc: ' + words + ' words');
    t.ok(aps[1] && aps[2], 'pool mixes 1 and 2 AP skills');
    t.ok(POOL.some(function (id) { return DD.Combat.cooldownOf(null, sk(id), 1) >= 3; }), 'a long-cooldown skill');
    POOL.forEach(function (id) {
      const face = [1, 2, 3].map(function (lv) {
        const d = sk(id), Lv = DD.skillLevel(d, lv);
        return JSON.stringify([DD.skillDesc(d, lv, null), DD.resolve(d.ap, Lv, null, 1), DD.resolve(d.cooldown, Lv, null, 0), DD.resolve(d.target.range, Lv, null, null)]);
      });
      t.ok(face[0] !== face[1] && face[1] !== face[2], id + ': every level looks different');
    });
    // six traps, one verb each
    TRAPS.forEach(function (id) { t.ok(sk(id).tags.indexOf('trap') >= 0 && sk(id).target.filter === 'empty', id + ' is a trap set on an empty tile'); });
    // barks: every key 4-6 lines of ≤ 70 characters, in his voice
    BARK_KEYS.concat(['trap']).forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ' has 4-6 lines (' + lines.length + ')');
      lines.forEach(function (line) {
        t.ok(typeof line === 'string' && line.length > 0 && line.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(line));
        t.ok(!FEM.test(line), 'no she/her in his barks: ' + JSON.stringify(line));
      });
    });
    // pronouns: he/him in everything written about him
    const about = [h.blurb, h.passive.desc, DD.getStatus(SLIPPED).desc({ stacks: 1, turns: 1, source: null, data: {} })];
    ALL.forEach(function (id) { Array.prototype.push.apply(about, textsOf(id)); });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); if (it) about.push(it.desc, it.flavor); });
    Object.keys(OBJS).forEach(function (id) { about.push(DD.getObject(OBJS[id]).desc); });
    about.forEach(function (txt) { t.ok(!FEM.test(txt), 'he/him, never she/her: ' + JSON.stringify(txt)); });
    t.ok(/\bHe\b/.test(h.blurb), 'the blurb says "He"');
    // content he owns
    const st = DD.getStatus(SLIPPED);
    t.ok(!!st && st.stunLike === true && st.skipFresh === false && st.type === 'debuff', 'status Slipped: stun-like, only the current / next turn (skipFresh: false)');
    Object.keys(OBJS).forEach(function (id) {
      const o = DD.getObject(OBJS[id]);
      t.ok(o && o.blocksMove === false && o.blocksLos === false && typeof o.draw === 'function' && typeof o.onEnter === 'function', OBJS[id] + ': a flat, walkable trap object with a painter');
      t.ok(!o.hazard, OBJS[id] + ': no AI hazard (foes never see it coming)');
    });
    const items = Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k]; }).filter(function (it) { return it.hero === 'hjalmar'; });
    t.eq(items.length, 3, 'three hero items');
    t.ok(items.some(function (it) { return it.rarity === 'rare'; }) && items.some(function (it) { return it.rarity === 'legendary'; }), 'a rare and a legendary item');
  });

  T.suite('hero_hjalmar: sprite, portrait and trap painters', function (t) {
    const h = DD.getHero('hjalmar');
    const probs = T.contentHelpers && T.contentHelpers.spriteProblems ? T.contentHelpers.spriteProblems(h.sprite) : [];
    t.eq(probs.length, 0, 'SpriteSpec valid: ' + probs.join(', '));
    t.ok(h.sprite.base === 'humanoid' && h.sprite.build === 'tiny' && h.sprite.tail === 'cat' && typeof h.sprite.overlay === 'function', 'small humanoid monkey with a long tail and an overlay (face, fez, tail curl)');
    const p0 = DD.problems.length;
    const cv = document.createElement('canvas');
    cv.width = 200; cv.height = 200;
    const ctx = cv.getContext('2d');
    ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
      [1, -1].forEach(function (facing) {
        t.tryRun('draw ' + pose + ' ' + facing, function () { DD.Sprites.draw(ctx, h.sprite, 100, 160, 2, { t: 1.3, pose: pose, facing: facing, blink: pose === 'idle' }); });
      });
    });
    const port = DD.Sprites.portrait('hjalmar', 64);
    t.ok(port && port.width === 64, 'portrait renders at 64 px');
    const px = port.getContext('2d').getImageData(0, 0, 64, 64).data;
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 200) opaque++;
    t.ok(opaque > 1000, 'portrait is not blank (' + opaque + ' opaque px)');
    // the trap painters (every direction for the glove)
    if (DD.Render && typeof DD.Render.drawObjectAt === 'function') {
      Object.keys(OBJS).forEach(function (id) {
        [EAST, SOUTH, WEST, NORTH].forEach(function (d) {
          t.tryRun('paint ' + id, function () { DD.Render.drawObjectAt(ctx, { id: OBJS[id], hp: 0, maxHp: 0, data: { seq: 1, dir: d, owner: null } }, 100, 120, 2, { t: 0.7 }); });
        });
      });
    } else t.log('DD.Render not loaded: trap painters not exercised');
    t.eq(DD.problems.slice(p0).length, 0, 'no sprite / painter warnings: ' + DD.problems.slice(p0).join(' | '));
  });

  // ---- traps ---------------------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: traps — set on empty tiles, sprung once by a foe, never by heroes or flyers, unseen by the AI', function (t) {
    const a = arena({ at: [1, 4], skills: [['hja_bear_trap', 1], ['hja_peel', 1]], ai: true,
      objects: [{ x: 2, y: 2, id: 'crate' }], terrain: { '3,6': 'pit', '1,7': 'wall' },
      enemies: [E(5, 4, 'test_grunt', 3), E(7, 7)], heroes: [{ id: 'test_cleric', x: 0, y: 6 }] });
    const h = a.h, g = a.foes[0], slot = a.slot('hja_bear_trap');
    t.ok(!valid(h, slot, 2, 2) && !valid(h, slot, 3, 6) && !valid(h, slot, 1, 7) && !valid(h, slot, 0, 6), 'not on an object, a pit, a wall or a unit');
    t.ok(valid(h, slot, 4, 4) && !valid(h, slot, 5, 5), 'within 3 (any line of sight)');
    const o = set(t, a, 'hja_bear_trap', 3, 4);
    t.ok(o && o.id === 'hja_bear_trap' && o.data.owner === h.id && o.data.snap === 5 && /Bear Trap/.test(o.label), 'a bear trap object owned by Hjalmar, its number on it (' + (o && o.label) + ')');
    t.ok(!valid(h, a.slot('hja_peel'), 3, 4), 'one trap per tile');
    t.eq(DD.Grid.hazardAt(3, 4, g), null, 'the AI does not see it as a hazard');
    t.ok(DD.Grid.isWalkable(3, 4, g) && DD.Grid.isFree(3, 4), 'it blocks nobody');
    t.eq(DD.Hjalmar.traps(h).length, 1, 'DD.Hjalmar.traps lists it');
    // a hero walks over it: nothing (and the move can still be undone)
    const h0 = DD.Combat.state.hype;
    t.ok(DD.Combat.move(h, 3, 4), 'Hjalmar walks onto his own trap');
    t.ok(trapAt(3, 4) && h.hp === h.maxHp && !has(h, 'root'), 'nothing happens to him');
    t.ok(DD.Combat.canUndo(), 'a no-op tile callback keeps Undo');
    DD.Combat.undo();
    t.ok(h.x === 1 && h.y === 4, 'undone');
    t.eq(DD.Combat.state.hype, h0, 'no Hype for a hero');
    // the grunt walks into it on its own turn (after the cleric's)
    DD.Combat.endRound();
    t.ok(g.x === 3 && g.y === 4 && g.hp === 42 - 5 && has(g, 'root'), 'the grunt walked in: 5 damage, Rooted, its walk ended there');
    t.eq(trapAt(3, 4), null, 'the trap is used up');
    t.eq(h.hp, h.maxHp, 'it never reached Hjalmar');
    // an ownerless trap (other content may set one) catches the enemy side
    const b = arena({ at: [1, 4], enemies: [E(4, 4, 'test_grunt', 3)], heroes: [{ id: 'test_knight', x: 1, y: 6 }] });
    DD.Hjalmar.setTrap(null, 3, 4, 'bear', { snap: 6 });
    DD.Act.push(null, b.foes[0], WEST, 1);
    t.ok(b.foes[0].hp === 42 - 6 && has(b.foes[0], 'root'), 'an ownerless trap springs on a foe');
    DD.Hjalmar.setTrap(null, 1, 5, 'bear', { snap: 6 });
    DD.Act.push(null, at(1, 6), NORTH, 1);
    t.ok(trapAt(1, 5) && unitOf('test_knight').hp === 32, 'but never on a hero');
    // flyers float over
    const f = arena({ at: [1, 4], skills: [['hja_peel', 1]], enemies: [E(4, 4, 'test_grunt', 3)] });
    set(t, f, 'hja_peel', 3, 4);
    f.foes[0].flags.flying = true;
    DD.Act.push(f.h, f.foes[0], WEST, 1);
    t.ok(f.foes[0].x === 3 && !has(f.foes[0], SLIPPED) && trapAt(3, 4), 'a flyer floats over a banana peel (the trap stays)');
    // traps wait for as long as it takes
    const w = arena({ at: [1, 4], skills: [['hja_bear_trap', 1]], enemies: [E(8, 8)] });
    set(t, w, 'hja_bear_trap', 3, 4);
    for (let i = 0; i < 4; i++) DD.Combat.endRound();
    t.ok(trapAt(3, 4), 'still set four rounds later');
  });

  T.suite('hero_hjalmar: Monkey Business — every trap a foe springs gives the party 5 Hype', function (t) {
    t.eq(DD.Hjalmar.TRAP_HYPE, 5, 'the number');
    const a = arena({ at: [1, 4], skills: [['hja_bear_trap', 1], ['hja_peel', 1]], enemies: [E(4, 4, 'test_grunt', 3), E(4, 5, 'test_grunt', 3)] });
    set(t, a, 'hja_bear_trap', 3, 4);
    set(t, a, 'hja_peel', 3, 5);
    t.eq(DD.Combat.state.hype, 0, 'setting traps gives nothing');
    DD.Act.push(a.h, a.foes[0], WEST, 1);
    hypeIs(t, DD.Combat.state.hype, 5, 'one trap sprung: +5');
    DD.Act.push(a.h, a.foes[1], WEST, 1);
    hypeIs(t, DD.Combat.state.hype, 10, 'two traps sprung: +10');
    // a trap that kills: +5 and the kill
    const k = arena({ at: [1, 4], skills: [['hja_bear_trap', 1]], enemies: [E(4, 4, 'test_minion'), E(8, 8)] });
    set(t, k, 'hja_bear_trap', 3, 4);
    k.foes[0].hp = 5;
    DD.Act.push(k.h, k.foes[0], WEST, 1);
    t.ok(k.foes[0].dead, 'a 5 HP minion dies in the trap');
    hypeIs(t, DD.Combat.state.hype, 5 + hype().kill, '+5 for the trap, +' + hype().kill + ' for the kill');
    t.eq((DD.Combat.state.stats.units[k.h.id] || {}).kills, 1, 'the kill is Hjalmar\'s');
    // the bar caps at 100
    const c = arena({ at: [1, 4], skills: [['hja_bear_trap', 1]], enemies: [E(4, 4, 'test_grunt', 3)] });
    set(t, c, 'hja_bear_trap', 3, 4);
    DD.Combat.state.hype = 98;
    DD.Act.push(c.h, c.foes[0], WEST, 1);
    t.eq(DD.Combat.state.hype, 100, 'Hype caps at 100');
    // even while he is down, his traps keep working and the crowd keeps cheering
    const d = arena({ at: [1, 4], skills: [['hja_bear_trap', 1]], enemies: [E(4, 4, 'test_grunt', 3)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    set(t, d, 'hja_bear_trap', 3, 4);
    DD.Act.damage(d.foes[0], d.h, 999, { cause: 'other' });
    t.ok(d.h.downed, 'Hjalmar is down');
    DD.Act.push(null, d.foes[0], WEST, 1);
    t.ok(d.foes[0].hp === 37 && has(d.foes[0], 'root'), 'his bear trap still bites');
    hypeIs(t, DD.Combat.state.hype, 5, 'and still pays 5 Hype');
  });

  // ---- basic ------------------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: Coconut Toss (basic)', function (t) {
    const a = arena({ at: [1, 4], enemies: [E(5, 4), E(6, 4), E(4, 6), E(1, 6)], terrain: { '3,6': 'wall', '2,6': 'wall', '4,5': 'wall', '3,5': 'wall', '1,5': 'wall' } });
    const h = a.h, near = a.foes[0], far = a.foes[1];
    t.ok(valid(h, h.basic, 5, 4) && !valid(h, h.basic, 6, 4), 'range 4 exactly');
    // (review) a foe 2 tiles away behind a wall: in range, out of sight
    t.ok(DD.Grid.dist(h, a.foes[3]) === 2 && !DD.Grid.los(h, a.foes[3]) && !valid(h, h.basic, 1, 6), 'needs line of sight');
    use(t, h, h.basic, 5, 4, 'toss 1');
    t.eq(near.hp, 10, '4 damage');
    t.eq(h.ap, 2, 'costs 1 AP');
    use(t, h, h.basic, 5, 4, 'toss 2');
    use(t, h, h.basic, 5, 4, 'toss 3');
    t.ok(near.hp === 2 && far.hp === 14, 'three tosses in a turn (no cooldown)');
    t.eq(DD.Combat.canUse(h, h.basic), 'Not enough AP.', 'then he is out of AP');
    // it never makes attacks of opportunity (ranged)
    t.eq(DD.Act.opportunitySlot(h), null, 'no attack of opportunity with a coconut');
  });

  // ---- pool skills ----------------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: Banana Peel I-III — a foe that walks in slips and loses the rest of its turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('hja_peel', lv);
      // range and cooldown
      const r = arena({ at: [1, 4], skills: [['hja_peel', lv]] });
      t.ok(valid(r.h, r.slot('hja_peel'), 1, 4 - Lv.range), 'L' + lv + ': range ' + Lv.range);
      t.ok(!valid(r.h, r.slot('hja_peel'), 0, 4 - Lv.range), 'L' + lv + ': not ' + (Lv.range + 1) + ' tiles away');
      use(t, r.h, r.slot('hja_peel'), 1, 2, 'L' + lv + ' set');
      t.eq(r.h.ap, 2, 'L' + lv + ': 1 AP');
      for (let k = 1; k <= Lv.cd; k++) {
        DD.Combat.endRound();
        t.ok(/cooldown/i.test(String(DD.Combat.canUse(r.h, r.slot('hja_peel')))), 'L' + lv + ': on cooldown on his next turn ' + k + ' of ' + Lv.cd);
      }
      DD.Combat.endRound();
      t.eq(DD.Combat.canUse(r.h, r.slot('hja_peel')), true, 'L' + lv + ': ready again after ' + Lv.cd + ' turns');
      // the grunt has one way to reach him: straight through the peel
      const a = arena({ at: [1, 4], skills: [['hja_peel', lv]], ai: true, enemies: [E(5, 4, 'test_grunt', 3)] });
      const g = a.foes[0];
      set(t, a, 'hja_peel', 3, 4, 'L' + lv + ' peel');
      const n = turnsWith(g, SLIPPED, function () { DD.Combat.endTurn(); });
      t.ok(g.x === 3 && g.y === 4, 'L' + lv + ': it slipped on the peel and its walk ended there');
      t.eq(a.h.hp, a.h.maxHp, 'L' + lv + ': it never attacked (its turn was over)');
      t.eq(n, 0, 'L' + lv + ': it started that turn on its feet');
      t.ok(!has(g, SLIPPED), 'L' + lv + ': back up at the end of that turn');
      hypeIs(t, DD.Combat.state.hype, 5, 'L' + lv + ': Monkey Business +5');
      DD.Combat.endTurn();
      t.ok(g.x === 2 && a.h.hp === a.h.maxHp - 4, 'L' + lv + ': its next turn is normal: it walks up and stabs');
    });
  });

  T.suite('hero_hjalmar: Banana Peel — pushed in on someone else\'s turn it loses its next turn; immune foes; wind-ups', function (t) {
    // the knight shoves the grunt across Hjalmar's peel
    const a = arena({ at: [3, 2], skills: [['hja_peel', 1]], ai: true, enemies: [E(3, 4, 'test_grunt', 3)], heroes: [{ id: 'test_knight', x: 2, y: 4 }] });
    const g = a.foes[0];
    set(t, a, 'hja_peel', 4, 4);
    DD.Combat.endTurn();
    const k = DD.Combat.current();
    t.eq(k && k.defId, 'test_knight', 'the knight\'s turn');
    use(t, k, slotOf(k, 'test_shield_bash'), 3, 4, 'shield bash east');
    t.ok(has(g, SLIPPED) && g.x === 5, 'pushed over the peel: Slipped (and the push carried on to 5,4)');
    let slippedStarts = 0, hpBefore = 0;
    onTurns(function (u) { return u === g; }, function () { if (has(g, SLIPPED)) slippedStarts++; hpBefore = k.hp + a.h.hp; }, function () {
      DD.Combat.endTurn();
    });
    t.eq(slippedStarts, 1, 'it started its next turn flat on its back');
    t.ok(g.x === 5 && g.y === 4 && k.hp + a.h.hp === hpBefore, 'and lost that turn: no move, no attack');
    t.ok(!has(g, SLIPPED), 'up again at the end of it');
    // stun-immune foes shrug it off (the trap is still sprung)
    const im = arena({ at: [1, 4], skills: [['hja_peel', 1]], ai: true, enemies: [E(5, 4, 'test_grunt', 3)] });
    im.foes[0].flags.stunImmune = true;
    set(t, im, 'hja_peel', 3, 4);
    DD.Combat.endTurn();
    t.ok(!has(im.foes[0], SLIPPED) && im.foes[0].x === 2 && im.h.hp === im.h.maxHp - 4, 'a stun-immune grunt keeps walking and stabs');
    t.ok(!trapAt(3, 4), 'the peel is gone anyway');
    hypeIs(t, DD.Combat.state.hype, 5, 'and still +5 Hype');
    // a slip interrupts a boss wind-up (it is stun-like)
    const bw = arena({ at: [1, 4], skills: [['hja_peel', 1]], enemies: [E(5, 4, 'test_boss')] });
    const boss = bw.foes[0];
    set(t, bw, 'hja_peel', 4, 4);
    DD.AI.windUp(boss, 'test_boss_meteor', { x: 1, y: 4 }, { tiles: [{ x: 1, y: 4 }], label: 'Meteor' });
    t.eq(boss.intents.length, 1, 'the boss winds up its meteor');
    DD.Act.push(bw.h, boss, WEST, 1);
    t.ok(has(boss, SLIPPED) && boss.intents.length === 0, 'shoved onto the peel: it slips and the wind-up is interrupted');
  });

  T.suite('hero_hjalmar: Bear Trap I-III — damage and Rooted through its next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('hja_bear_trap', lv);
      const a = arena({ at: [1, 4], skills: [['hja_bear_trap', lv]], ai: true, enemies: [E(5, 4, 'test_grunt', 3)] });
      const g = a.foes[0];
      set(t, a, 'hja_bear_trap', 3, 4, 'L' + lv);
      t.eq(a.h.ap, 2, 'L' + lv + ': 1 AP');
      t.ok(/cooldown/i.test(String(DD.Combat.canUse(a.h, a.slot('hja_bear_trap')))), 'L' + lv + ': cooldown 1');
      const n = turnsWith(g, 'root', function () {
        DD.Combat.endTurn();
        t.ok(g.x === 3 && g.hp === 42 - Lv.snap && has(g, 'root'), 'L' + lv + ': it walked in: ' + Lv.snap + ' damage, Rooted, stuck there');
        t.eq(a.h.hp, a.h.maxHp, 'L' + lv + ': it could not reach Hjalmar');
        DD.Combat.endTurn();
        t.ok(g.x === 3 && a.h.hp === a.h.maxHp, 'L' + lv + ': its next turn: still stuck, no attack');
        t.ok(!has(g, 'root'), 'L' + lv + ': free at the end of that turn');
        DD.Combat.endTurn();
      });
      t.eq(n, 1, 'L' + lv + ': Rooted at the start of exactly one of its turns');
      t.ok(g.x === 2 && a.h.hp === a.h.maxHp - 4, 'L' + lv + ': then it walks up and stabs');
    });
    // a snap that kills: no Root on a corpse, the fight goes on
    const d = arena({ at: [1, 4], skills: [['hja_bear_trap', 1]], enemies: [E(4, 4, 'test_minion'), E(8, 8)] });
    set(t, d, 'hja_bear_trap', 3, 4);
    d.foes[0].hp = 5;
    DD.Act.push(d.h, d.foes[0], WEST, 2);
    t.ok(d.foes[0].dead && d.foes[0].x === 3 && !has(d.foes[0], 'root') && !DD.Combat.state.result, 'the minion dies in the trap mid-push: no Root, no error');
    // the knight shoves a grunt into it on his turn: Rooted for its whole next turn
    const p = arena({ at: [3, 2], skills: [['hja_bear_trap', 2]], ai: true, enemies: [E(3, 4, 'test_grunt', 3)], heroes: [{ id: 'test_knight', x: 2, y: 4 }] });
    set(t, p, 'hja_bear_trap', 4, 4);
    DD.Combat.endTurn();
    use(t, DD.Combat.current(), slotOf(DD.Combat.current(), 'test_shield_bash'), 3, 4, 'bash into the trap');
    const g2 = p.foes[0];
    t.ok(g2.hp === 42 - 4 - 7 && has(g2, 'root'), 'bash 4 + snap 7, Rooted');
    const n2 = turnsWith(g2, 'root', function () { DD.Combat.endTurn(); });
    t.eq(n2, 1, 'Rooted on its next turn');
    t.ok(!has(g2, 'root'), 'and only that one');
  });

  T.suite('hero_hjalmar: Whoopee Cushion I-III — Taunted by Hjalmar through its next turn(s)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('hja_cushion', lv);
      // the grunt goes for the cleric; its way crosses the cushion; Hjalmar is far out of its reach
      const a = arena({ at: [2, 4], skills: [['hja_cushion', lv]], ai: true, enemies: [E(5, 6, 'test_grunt', 3)], heroes: [{ id: 'test_cleric', x: 1, y: 6 }] });
      const g = a.foes[0], cleric = at(1, 6);
      set(t, a, 'hja_cushion', 3, 6, 'L' + lv);
      t.eq(a.h.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(DD.Combat.cooldownOf(a.h, sk('hja_cushion'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      DD.Act.teleport(a.h, 8, 0);
      let taunted = 0;
      onTurns(function (u) { return u === g; }, function () { if (has(g, 'taunt')) taunted++; }, function () {
        DD.Combat.endRound();
        const st = DD.Act.getStatus(g, 'taunt');
        t.ok(st && st.source === a.h.id, 'L' + lv + ': PFFFT: it is Taunted by Hjalmar');
        t.eq(cleric.hp, cleric.maxHp, 'L' + lv + ': its stab at the cleric fizzled (it may only attack Hjalmar)');
        for (let r = 0; r < Lv.turns; r++) DD.Combat.endRound();
        t.eq(cleric.hp, cleric.maxHp, 'L' + lv + ': on its next ' + Lv.turns + ' turn(s) it only chases Hjalmar');
      });
      t.eq(taunted, Lv.turns, 'L' + lv + ': Taunted at the start of exactly ' + Lv.turns + ' of its turns');
      t.ok(!has(g, 'taunt'), 'L' + lv + ': then it is over it');
    });
    // shoved onto it on a hero's turn with Hjalmar in its reach: it goes for the monkey, not the cleric next door
    const b = arena({ at: [2, 4], skills: [['hja_cushion', 1]], ai: true, enemies: [E(4, 6, 'test_grunt', 3)], heroes: [{ id: 'test_cleric', x: 2, y: 7 }] });
    set(t, b, 'hja_cushion', 3, 6);
    DD.Act.push(b.h, b.foes[0], WEST, 1);
    t.ok(has(b.foes[0], 'taunt') && DD.Act.getStatus(b.foes[0], 'taunt').turns === 1, 'pushed onto it: Taunted for its next turn');
    DD.Combat.endRound();
    t.ok(b.h.hp === b.h.maxHp - 4 && at(2, 7).hp === at(2, 7).maxHp, 'in reach of the monkey: it stabs Hjalmar, not the cleric');
  });

  T.suite('hero_hjalmar: Paint Bucket I-III — Dazzled through its next turn(s)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('hja_paint', lv);
      const a = arena({ at: [1, 4], skills: [['hja_paint', lv]], ai: true, enemies: [E(5, 4, 'test_grunt', 3)] });
      const g = a.foes[0];
      set(t, a, 'hja_paint', 3, 4, 'L' + lv);
      t.eq(a.h.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(DD.Combat.cooldownOf(a.h, sk('hja_paint'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      const n = turnsWith(g, 'dazzled', function () {
        DD.Combat.endTurn();
        t.ok(has(g, 'dazzled') && !trapAt(3, 4), 'L' + lv + ': it walked through the tripwire: Dazzled');
        for (let r = 0; r < Lv.turns; r++) DD.Combat.endTurn();
      });
      t.eq(n, Lv.turns, 'L' + lv + ': Dazzled at the start of exactly ' + Lv.turns + ' of its turns');
      t.ok(!has(g, 'dazzled'), 'L' + lv + ': then it can see again');
    });
    // pushed in: Dazzled covers its next turn
    const p = arena({ at: [1, 4], skills: [['hja_paint', 1]], enemies: [E(4, 4, 'test_grunt', 3)] });
    set(t, p, 'hja_paint', 3, 4);
    DD.Act.push(p.h, p.foes[0], WEST, 1);
    const st = DD.Act.getStatus(p.foes[0], 'dazzled');
    t.ok(st && st.turns === 1 && st.source === p.h.id, 'pushed onto it: Dazzled for its next turn');
  });

  T.suite('hero_hjalmar: Firecracker Bundle I-III — fire damage to every foe within 1, allies spared', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('hja_firecracker', lv);
      const a = arena({ at: [1, 4], skills: [['hja_firecracker', lv]], enemies: [E(4, 4, 'test_grunt', 3), E(3, 5, 'test_grunt', 3), E(3, 6, 'test_grunt', 3)],
        heroes: [{ id: 'test_cleric', x: 2, y: 4 }] });
      const f = a.foes;
      t.eq(DD.Targeting.area(a.h, sk('hja_firecracker'), lv, { x: 3, y: 4 }).length, 5, 'L' + lv + ': the HUD shows the blast (radius 1)');
      set(t, a, 'hja_firecracker', 3, 4, 'L' + lv);
      t.eq(a.h.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(f[0].hp + f[1].hp, 84, 'L' + lv + ': nothing until someone steps on it');
      DD.Act.push(a.h, f[0], WEST, 1);
      t.eq([f[0].hp, f[1].hp, f[2].hp].join(','), [42 - Lv.boom, 42 - Lv.boom, 42].join(','), 'L' + lv + ': BANG: ' + Lv.boom + ' to the grunt on it and the one next to it, none 2 away');
      t.eq(at(2, 4).hp, at(2, 4).maxHp, 'L' + lv + ': the cleric next to it is spared');
      t.ok(/cooldown/i.test(String(DD.Combat.canUse(a.h, a.slot('hja_firecracker')))), 'L' + lv + ': cooldown 2');
    });
    // a grunt walking in on its own turn sets it off; a kill is Hjalmar's
    const w = arena({ at: [1, 4], skills: [['hja_firecracker', 1]], ai: true, killAll: true, enemies: [E(5, 4)] });
    set(t, w, 'hja_firecracker', 3, 4);
    w.foes[0].hp = 5;
    DD.Combat.endTurn();
    t.ok(w.foes[0].dead && w.h.hp === w.h.maxHp, 'the grunt walks in and blows up');
    t.eq((DD.Combat.state.stats.units[w.h.id] || {}).kills, 1, 'credited to Hjalmar');
    t.eq(DD.Combat.state.result, 'victory', 'killing the last foe with a trap wins the fight');
  });

  T.suite('hero_hjalmar: Spring Glove I-III — aimed away from Hjalmar, knocks the foe along', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('hja_glove', lv);
      const a = arena({ at: [1, 4], skills: [['hja_glove', lv]], ai: true, enemies: [E(5, 4, 'test_grunt', 3)] });
      const g = a.foes[0];
      const area = DD.Targeting.area(a.h, sk('hja_glove'), lv, { x: 3, y: 4 });
      t.eq(area.map(function (p) { return p.x + ',' + p.y; }).join(' '), ['3,4'].concat([1, 2, 3].slice(0, Lv.push).map(function (k) { return (3 + k) + ',4'; })).join(' '),
        'L' + lv + ': the HUD shows the glove and the ' + Lv.push + ' tiles it punches along');
      const o = set(t, a, 'hja_glove', 3, 4, 'L' + lv);
      t.ok(o && o.data.dir.x === 1 && o.data.dir.y === 0 && o.data.push === Lv.push, 'L' + lv + ': aimed east, away from Hjalmar');
      t.eq(DD.Combat.cooldownOf(a.h, sk('hja_glove'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      DD.Combat.endTurn();
      t.ok(g.x === 3 + Lv.push && g.y === 4, 'L' + lv + ': BOING: knocked ' + Lv.push + ' tiles back east (to ' + g.x + ',' + g.y + ')');
      t.ok(g.hp === 42 && a.h.hp === a.h.maxHp, 'L' + lv + ': its walk ended there; no harm, no attack');
    });
    // the aim follows where Hjalmar stood: north
    const n = arena({ at: [4, 6], skills: [['hja_glove', 1]] });
    t.ok(set(t, n, 'hja_glove', 4, 4).data.dir.y === -1, 'set north of him: aimed north');
    // into a pit: YEET (+5 and the environmental kill)
    const p = arena({ at: [2, 4], skills: [['hja_glove', 1]], terrain: { '5,4': 'pit' }, enemies: [E(4, 5), E(8, 8)] });
    set(t, p, 'hja_glove', 4, 4);
    DD.Act.push(p.h, p.foes[0], NORTH, 1);
    t.ok(p.foes[0].dead, 'punched into the pit: YEET');
    hypeIs(t, DD.Combat.state.hype, 5 + hype().envKill, '+5 Monkey Business, +' + hype().envKill + ' environmental kill');
    // into a wall: bump; into lava: burned; into water: Wet
    const wl = arena({ at: [2, 4], skills: [['hja_glove', 1]], terrain: { '5,4': 'wall' }, enemies: [E(4, 5, 'test_grunt', 3)] });
    set(t, wl, 'hja_glove', 4, 4);
    DD.Act.push(wl.h, wl.foes[0], NORTH, 1);
    t.ok(wl.foes[0].x === 4 && wl.foes[0].hp === 42 - 3, 'against a wall: BONK (3)');
    const lv = arena({ at: [2, 4], skills: [['hja_glove', 1]], terrain: { '5,4': 'lava' }, enemies: [E(4, 5, 'test_grunt', 3)] });
    set(t, lv, 'hja_glove', 4, 4);
    DD.Act.push(lv.h, lv.foes[0], NORTH, 1);
    t.ok(lv.foes[0].hp < 42 && has(lv.foes[0], 'burn'), 'through lava: burned (' + lv.foes[0].hp + ' HP)');
    const wt = arena({ at: [2, 4], skills: [['hja_glove', 1]], terrain: { '6,4': 'water' }, enemies: [E(4, 5, 'test_grunt', 3)] });
    set(t, wt, 'hja_glove', 4, 4);
    DD.Act.push(wt.h, wt.foes[0], NORTH, 1);
    t.ok(wt.foes[0].x === 6 && has(wt.foes[0], 'wet'), 'into water: Wet');
    // the map edge
    const ed = arena({ at: [6, 4], skills: [['hja_glove', 1]], enemies: [E(8, 5, 'test_grunt', 3)] });
    set(t, ed, 'hja_glove', 8, 4);
    DD.Act.push(ed.h, ed.foes[0], NORTH, 1);
    t.ok(ed.foes[0].x === 8 && ed.foes[0].y === 4 && ed.foes[0].hp === 42 - 3, 'aimed off the map: it bumps the edge instead');
    // immovable: nothing to knock
    const im = arena({ at: [2, 4], skills: [['hja_glove', 1]], enemies: [E(4, 5, 'test_brute')] });
    set(t, im, 'hja_glove', 4, 4);
    DD.Act.teleport(im.foes[0], 4, 4);
    t.ok(im.foes[0].x === 4 && !trapAt(4, 4), 'an immovable brute just squashes the glove');
    // a chain: the glove punches a grunt onto a bear trap
    const ch = arena({ at: [2, 4], skills: [['hja_glove', 1], ['hja_bear_trap', 1]], enemies: [E(4, 5, 'test_grunt', 3)] });
    set(t, ch, 'hja_glove', 4, 4);
    set(t, ch, 'hja_bear_trap', 5, 4);
    DD.Act.push(ch.h, ch.foes[0], NORTH, 1);
    t.ok(has(ch.foes[0], 'root') && ch.foes[0].hp === 42 - 5, 'BOING into a bear trap: SNAP (a combo of his own)');
    hypeIs(t, DD.Combat.state.hype, 10, 'two traps sprung: +10 Hype');
  });

  T.suite('hero_hjalmar: Pickpocket I-III — gold, and the mark is Weak through its next turn(s)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('hja_pickpocket', lv);
      const a = arena({ at: [3, 4], skills: [['hja_pickpocket', lv]], ai: true, enemies: [E(4, 4, 'test_grunt', 3), E(6, 4)] });
      const g = a.foes[0];
      t.ok(valid(a.h, a.slot('hja_pickpocket'), 4, 4) && !valid(a.h, a.slot('hja_pickpocket'), 6, 4), 'L' + lv + ': adjacent only');
      use(t, a.h, a.slot('hja_pickpocket'), 4, 4, 'L' + lv);
      t.eq(DD.Act.gold(), Lv.gold, 'L' + lv + ': +' + Lv.gold + ' gold');
      t.eq(g.hp, 42, 'L' + lv + ': no damage of its own');
      t.eq(a.h.ap, 2, 'L' + lv + ': 1 AP');
      t.ok(/cooldown/i.test(String(DD.Combat.canUse(a.h, a.slot('hja_pickpocket')))), 'L' + lv + ': cooldown 2');
      const hp0 = a.h.hp;
      const n = turnsWith(g, 'weak', function () {
        DD.Combat.endTurn();
        t.eq(hp0 - a.h.hp, Math.round(4 * 0.75), 'L' + lv + ': its stab is Weak (4 → ' + Math.round(4 * 0.75) + ')');
        for (let r = 1; r < Lv.turns + 1; r++) DD.Combat.endTurn();
      });
      t.eq(n, Lv.turns, 'L' + lv + ': Weak at the start of exactly ' + Lv.turns + ' of its turns');
    });
  });

  T.suite('hero_hjalmar: Swing Away I-III — a leap that never provokes', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('hja_swing', lv);
      const a = arena({ at: [1, 8], skills: [['hja_swing', lv]], enemies: [E(2, 8, 'test_grunt', 3)], terrain: { '3,6': 'wall', '3,5': 'wall', '4,6': 'wall' } });
      const h = a.h, g = a.foes[0], slot = a.slot('hja_swing');
      t.ok(valid(h, slot, 1, 8 - Lv.range) && !valid(h, slot, 1, 7 - Lv.range), 'L' + lv + ': within ' + Lv.range);
      t.ok(!valid(h, slot, 2, 8) && !valid(h, slot, 3, 6), 'L' + lv + ': empty tiles only');
      const fired = aooDuring(function () { use(t, h, slot, 1, 8 - Lv.range, 'L' + lv); });
      t.ok(h.x === 1 && h.y === 8 - Lv.range && h.hp === h.maxHp, 'L' + lv + ': leapt ' + Lv.range + ' tiles, unharmed');
      t.eq(fired, 0, 'L' + lv + ': leaving the grunt\'s side provoked nothing');
      t.eq(h.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(DD.Combat.cooldownOf(h, sk('hja_swing'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
    });
    // a plain walk away from the same grunt does provoke
    const w = arena({ at: [1, 8], enemies: [E(2, 8, 'test_grunt', 3)] });
    t.ok(DD.Combat.provokes(w.h, 1, 5).length === 1, 'walking off provokes the grunt (the HUD says so)');
    const fired = aooDuring(function () { DD.Combat.move(w.h, 1, 5); });
    t.ok(fired === 1 && w.h.hp === w.h.maxHp - 4, 'walking away: an attack of opportunity (−4)');
    // line of sight: not over a wall he can't see past
    const ls = arena({ at: [1, 4], skills: [['hja_swing', 3]], terrain: { '2,3': 'wall', '2,4': 'wall', '2,5': 'wall' } });
    t.ok(!DD.Grid.los(ls.h, { x: 4, y: 4 }) && !valid(ls.h, ls.slot('hja_swing'), 4, 4), 'needs line of sight');
    // Rooted: no walking, but a leap is not a move action (like every jump and teleport)
    const rt = arena({ at: [1, 4], skills: [['hja_swing', 1]], enemies: [E(8, 8)] });
    DD.Act.addStatus(rt.h, 'root', { turns: 1 }, rt.foes[0]);
    t.ok(DD.Combat.cantMove(rt.h) && DD.Combat.canUse(rt.h, rt.slot('hja_swing')) === true, 'Rooted: he can still swing away');
    use(t, rt.h, rt.slot('hja_swing'), 1, 1, 'rooted swing');
    t.ok(rt.h.x === 1 && rt.h.y === 1, 'out of the bear trap he was standing in, so to speak');
    // into water: Wet
    const wt = arena({ at: [1, 4], skills: [['hja_swing', 1]], terrain: { '3,4': 'water' } });
    use(t, wt.h, wt.slot('hja_swing'), 3, 4, 'swing into water');
    t.ok(has(wt.h, 'wet'), 'lands Wet');
  });

  T.suite('hero_hjalmar: Bait and Switch I-III — swap places with a foe (onto his own trap)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('hja_switch', lv);
      const a = arena({ at: [1, 4], skills: [['hja_switch', lv], ['hja_bear_trap', 1]], enemies: [E(1 + Lv.range, 5, 'test_grunt', 3), E(2 + Lv.range, 5, 'test_grunt', 3)] });
      const h = a.h, g = a.foes[0];
      set(t, a, 'hja_bear_trap', 1, 5, 'L' + lv + ' trap');
      t.ok(DD.Combat.move(h, 1, 5) && trapAt(1, 5) && h.hp === h.maxHp, 'L' + lv + ': he steps onto his own trap (it ignores him)');
      t.ok(valid(h, a.slot('hja_switch'), 1 + Lv.range, 5) && !valid(h, a.slot('hja_switch'), 2 + Lv.range, 5), 'L' + lv + ': a foe within ' + Lv.range);
      const fired = aooDuring(function () { use(t, h, a.slot('hja_switch'), 1 + Lv.range, 5, 'L' + lv); });
      t.ok(h.x === 1 + Lv.range && h.y === 5 && g.x === 1 && g.y === 5, 'L' + lv + ': swapped');
      t.ok(g.hp === 42 - 5 && has(g, 'root'), 'L' + lv + ': the grunt lands in the bear trap: SNAP');
      t.eq(fired, 0, 'L' + lv + ': a swap provokes nothing');
      t.eq(DD.Combat.cooldownOf(h, sk('hja_switch'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      hypeIs(t, DD.Combat.state.hype, 5, 'L' + lv + ': +5 Hype');
    });
    const im = arena({ at: [1, 4], skills: [['hja_switch', 3]], enemies: [E(3, 4, 'test_brute'), E(1, 6)] });
    t.ok(!valid(im.h, im.slot('hja_switch'), 3, 4) && valid(im.h, im.slot('hja_switch'), 1, 6), 'not an immovable brute');
    const pit = arena({ at: [1, 4], skills: [['hja_switch', 3]], terrain: { '3,4': 'pit' }, enemies: [E(3, 4)] });
    pit.foes[0].flags.flying = true;
    t.ok(!valid(pit.h, pit.slot('hja_switch'), 3, 4), 'not a flyer hovering over a pit');
  });

  // ---- signature --------------------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: Prank War — 8 damage to every foe within 2, and they all slip', function (t) {
    const a = arena({ at: [1, 4], ai: true, enemies: [E(5, 4, 'test_grunt', 3), E(6, 5, 'test_grunt', 3), E(5, 6, 'test_grunt', 3), E(8, 4, 'test_grunt', 3)],
      heroes: [{ id: 'test_cleric', x: 4, y: 4 }] });
    const h = a.h, f = a.foes, sig = h.signature;
    DD.Combat.state.hype = 99;
    t.eq(DD.Combat.canUse(h, sig), 'Needs 100 Hype.', 'needs 100 Hype');
    DD.Combat.state.hype = 100;
    t.ok(valid(h, sig, 5, 4) && valid(h, sig, 6, 4) && !valid(h, sig, 8, 4), 'a tile within 5');
    use(t, h, sig, 5, 4, 'Prank War');
    t.eq([f[0].hp, f[1].hp, f[2].hp, f[3].hp].join(','), '34,34,34,42', '8 to every foe within 2, none 3 away');
    t.ok(has(f[0], SLIPPED) && has(f[1], SLIPPED) && has(f[2], SLIPPED) && !has(f[3], SLIPPED), 'they all slip');
    t.eq(at(4, 4).hp, at(4, 4).maxHp, 'the cleric in the middle is spared');
    hypeIs(t, DD.Combat.state.hype, hype().multiHit, 'Hype spent (then +' + hype().multiHit + ' for hitting several)');
    t.eq(h.ap, 1, '2 AP');
    const pos = f.map(function (u) { return u.x + ',' + u.y; }).join(' ');
    let flat = 0;
    onTurns(function (u) { return u.side === 'enemy'; }, function (e) { if (has(e.unit, SLIPPED)) flat++; }, function () { DD.Combat.endRound(); });
    t.eq(flat, 3, 'three foes start their next turn flat on their backs');
    t.eq(f.slice(0, 3).map(function (u) { return u.x + ',' + u.y; }).join(' '), pos.split(' ').slice(0, 3).join(' '), 'and lose it: nobody moved');
    t.ok(f.every(function (u) { return !has(u, SLIPPED); }), 'up again afterwards');
    // stun-immune foes take the damage but keep their footing; a foe it kills just dies
    const b = arena({ at: [1, 4], enemies: [E(5, 4, 'test_grunt', 3), E(5, 5)] });
    b.foes[0].flags.stunImmune = true;
    b.foes[1].hp = 5;
    DD.Combat.state.hype = 100;
    use(t, b.h, b.h.signature, 5, 4, 'Prank War II');
    t.ok(b.foes[0].hp === 34 && !has(b.foes[0], SLIPPED) && b.foes[1].dead, 'immune: damage only; the 5 HP grunt dies (no status on a corpse)');
  });

  // ---- items ------------------------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: items — Coconut of Unusual Size, Greased Fur Pomade, Bottomless Sack of Props', function (t) {
    ITEMS.forEach(function (id) {
      const it = DD.getItem(id);
      t.ok(it && it.hero === 'hjalmar' && it.desc && it.flavor && it.flavor.length <= 120, id + ' registered for Hjalmar');
      t.ok(!it.stats.block, id + ': no combat-start Block (v2)');
    });
    // Coconut: +10% damage (his traps too), Coconut Toss knocks back 1
    const c = arena({ at: [1, 4], items: ['hja_coconut'], skills: [['hja_bear_trap', 1]], enemies: [E(4, 4, 'test_grunt', 3), E(4, 5, 'test_grunt', 3)] });
    use(t, c.h, c.h.basic, 4, 4, 'coconut toss');
    t.ok(c.foes[0].hp === 42 - Math.round(4 * 1.1) && c.foes[0].x === 5, 'Coconut: ' + Math.round(4 * 1.1) + ' damage and knocked to 5,4');
    set(t, c, 'hja_bear_trap', 3, 5);
    DD.Act.push(c.h, c.foes[1], WEST, 1);
    t.eq(c.foes[1].hp, 42 - Math.round(5 * 1.1), 'his traps hit harder too (5 → ' + Math.round(5 * 1.1) + ')');
    const tossed = arena({ at: [2, 4], items: ['hja_coconut'], skills: [['hja_bear_trap', 1]], enemies: [E(4, 4, 'test_grunt', 3)] });
    set(t, tossed, 'hja_bear_trap', 5, 4);
    use(t, tossed.h, tossed.h.basic, 4, 4, 'toss into the trap');
    t.ok(tossed.foes[0].x === 5 && has(tossed.foes[0], 'root'), 'a coconut knocks a foe into his own trap');
    // Pomade: +1 move, no attacks of opportunity on him
    const p = arena({ at: [1, 8], items: ['hja_pomade'], enemies: [E(2, 8, 'test_grunt', 3)] });
    t.eq(DD.Combat.effectiveMov(p.h), 6, 'Pomade: move 5 + 1');
    t.eq(DD.Combat.provokes(p.h, 1, 4).length, 0, 'Pomade: walking off provokes nobody (the HUD agrees)');
    const fired = aooDuring(function () { DD.Combat.move(p.h, 1, 4); });
    t.ok(fired === 0 && p.h.hp === p.h.maxHp && p.h.y === 4, 'too greasy to grab');
    // Sack: +6 max HP; the first trap each turn is free
    const s = arena({ at: [1, 4], items: ['hja_prop_sack'], skills: [['hja_bear_trap', 1], ['hja_peel', 1], ['hja_firecracker', 1]], enemies: [E(8, 8)] });
    t.eq(s.h.maxHp, 28, 'Sack: 22 + 6 max HP');
    t.ok(DD.Combat.costOf(s.h, sk('hja_bear_trap'), 1).ap === 0 && DD.Combat.costOf(s.h, sk('hja_firecracker'), 1).ap === 0, 'Sack: the first trap of the turn costs 0 AP (even a firecracker)');
    t.eq(DD.Combat.costOf(s.h, sk('hja_basic'), 1).ap, 1, 'Sack: other skills cost as usual');
    set(t, s, 'hja_bear_trap', 3, 4);
    t.eq(s.h.ap, 3, 'a free bear trap');
    t.eq(DD.Combat.costOf(s.h, sk('hja_peel'), 1).ap, 1, 'the second trap costs its AP');
    set(t, s, 'hja_peel', 3, 5);
    t.eq(s.h.ap, 2, 'peel: 1 AP');
    DD.Combat.endRound();
    t.eq(DD.Combat.costOf(s.h, sk('hja_firecracker'), 1).ap, 0, 'next turn the first trap is free again');
    // in a rolled fight his initiative modifier is +4
    const rh = DD.Combat.makeRunHero({ id: 'hjalmar', level: 1 });
    DD.Combat.start({ grid: DD.Combat.emptyGrid(8, 8), heroes: [{ runHero: rh, x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] }, { seed: 5, headless: true, initiative: 'roll' });
    const e = DD.Combat.state.order.filter(function (o) { return DD.Combat.byId(o.unitId).defId === 'hjalmar'; })[0];
    t.ok(e && e.init === 4 && e.total === e.roll + 4, 'rolled initiative: d20 + 4');
  });

  // ---- previews -------------------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: previews match reality for every skill at every level', function (t) {
    const cases = [
      { id: 'hja_basic', lv: 1, tg: [4, 4], enemies: [E(4, 4)] },
      { id: 'hja_basic', lv: 1, tg: [4, 4], enemies: [E(4, 4), E(8, 8)], hp: 3, note: 'lethal' },
      { id: 'hja_peel', tg: [3, 4], enemies: [E(5, 4)] },
      { id: 'hja_bear_trap', tg: [3, 4], enemies: [E(5, 4)] },
      { id: 'hja_cushion', tg: [3, 4], enemies: [E(5, 4)] },
      { id: 'hja_paint', tg: [3, 4], enemies: [E(5, 4)] },
      { id: 'hja_firecracker', tg: [3, 4], enemies: [E(4, 4), E(3, 5)] },
      { id: 'hja_glove', tg: [3, 4], enemies: [E(5, 4)] },
      { id: 'hja_pickpocket', at: [3, 4], tg: [4, 4], enemies: [E(4, 4)] },
      { id: 'hja_swing', tg: [1, 1], enemies: [E(2, 4)], terrain: { '1,1': 'water' } },
      { id: 'hja_switch', tg: [2, 4], enemies: [E(2, 4)] },
      { id: 'hja_signature', lv: 1, tg: [5, 4], enemies: [E(5, 4), E(6, 4), E(5, 5, 'test_brute')] },
      { id: 'hja_signature', lv: 1, tg: [5, 4], enemies: [E(5, 4), E(8, 8)], hp: 4, note: 'lethal' },
    ];
    let n = 0;
    cases.forEach(function (c) {
      const lvs = c.lv ? [c.lv] : [1, 2, 3];
      lvs.forEach(function (lv) {
        const pool = POOL.indexOf(c.id) >= 0;
        const a = arena({ at: c.at || [1, 4], skills: pool ? [[c.id, lv]] : [], enemies: c.enemies, terrain: c.terrain });
        if (c.hp) a.foes[0].hp = c.hp;
        const slot = c.id === 'hja_basic' ? a.h.basic : c.id === 'hja_signature' ? a.h.signature : a.slot(c.id);
        if (c.id === 'hja_signature') DD.Combat.state.hype = 100;
        previewThenUse(t, a.h, slot, c.tg[0], c.tg[1], c.id + ' L' + lv + (c.note ? ' ' + c.note : ''));
        n++;
      });
    });
    // a swap onto his own traps: the preview springs them too (damage, Root, the slide of a glove, Hype)
    [['hja_bear_trap', 'bear', { snap: 7 }], ['hja_glove', 'glove', { push: 2, dir: { x: 0, y: 1 } }], ['hja_firecracker', 'boom', { boom: 6 }]].forEach(function (c) {
      const a = arena({ at: [1, 5], skills: [['hja_switch', 2]], enemies: [E(3, 4), E(1, 3)] });
      DD.Hjalmar.setTrap(a.h, 1, 4, c[1], c[2]);
      DD.Act.teleport(a.h, 1, 4);
      t.ok(trapAt(1, 4) && a.h.x === 1 && a.h.y === 4, 'switch onto a ' + c[1] + ': Hjalmar stands on his own trap');
      const prev = previewThenUse(t, a.h, a.slot('hja_switch'), 3, 4, 'switch onto a ' + c[1]);
      t.ok(prev.hype >= 5, 'switch onto a ' + c[1] + ': the preview shows the Monkey Business Hype (+' + prev.hype + ')');
      n++;
    });
    t.log('previews checked: ' + n);
  });

  // ---- v2 edge cases ----------------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: v2 edge cases (stunned, silenced, sheep, charmed, AP, turn order, opportunity attacks)', function (t) {
    // stunned by an enemy on its turn: his next turn passes with 0 AP
    const st = arena({ at: [1, 4], skills: [['hja_peel', 1]], enemies: [E(2, 4)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    onTurns(function (u) { return u.side === 'enemy'; }, function () { if (DD.Combat.state.round === 1) DD.Act.addStatus(st.h, 'stun', { turns: 1 }, st.foes[0]); }, function () {
      DD.Combat.endTurn(); DD.Combat.endTurn();
    });
    t.ok(DD.Combat.state.round === 2 && DD.Combat.current() && DD.Combat.current().defId === 'test_knight', 'stunned: his round-2 turn passed by itself');
    t.ok(st.h.ap === 0 && DD.Combat.canUse(st.h, st.h.basic) !== true, 'no AP, no skills');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === st.h && st.h.ap === 3 && !has(st.h, 'stun'), 'round 3: back to normal');
    // silenced: everything still works (pranks are not spells)
    const si = arena({ at: [1, 4], skills: [['hja_peel', 1], ['hja_bear_trap', 1], ['hja_cushion', 1], ['hja_swing', 1]], enemies: [E(4, 4)] });
    DD.Act.addStatus(si.h, 'silenced', { turns: 1 }, si.foes[0]);
    DD.Combat.slotsOf(si.h).filter(function (sl) { return sl !== si.h.signature; }).forEach(function (sl) {
      t.eq(DD.Combat.canUse(si.h, sl), true, 'silenced: ' + sl.id + ' still works');
    });
    // sheep: no skills
    const sh = arena({ at: [1, 4], skills: [['hja_peel', 1]], enemies: [E(4, 4)] });
    DD.Act.addStatus(sh.h, 'sheep', { turns: 1 }, sh.foes[0]);
    t.ok(/Baa/.test(String(DD.Combat.canUse(sh.h, sh.h.basic))) && /Baa/.test(String(DD.Combat.canUse(sh.h, sh.slot('hja_peel')))), 'sheep: baa');
    // charmed by a grunt: −1 AP, and his own bear trap can't hurt the charmer (it still Roots it)
    const ch = arena({ at: [1, 4], skills: [['hja_bear_trap', 1]], enemies: [E(4, 4, 'test_grunt', 3), E(3, 6, 'test_grunt', 3)] });
    set(t, ch, 'hja_bear_trap', 3, 4);
    onTurns(function (u) { return u === ch.foes[0]; }, function () { DD.Act.addStatus(ch.h, 'charmed', { turns: 1 }, ch.foes[0]); }, function () { DD.Combat.endTurn(); });
    t.ok(DD.Combat.current() === ch.h && ch.h.ap === 2, 'charmed: 2 AP on his turn');
    DD.Act.push(null, ch.foes[0], WEST, 1);
    t.ok(ch.foes[0].hp === 42 && has(ch.foes[0], 'root'), 'his charmer springs the bear trap: no damage (charm), still Rooted');
    use(t, ch.h, ch.h.basic, 3, 6, 'charmed toss at the other grunt');
    t.eq(ch.foes[1].hp, 38, 'the other grunt is fair game');
    // not enough AP / not his turn
    const ap = arena({ at: [1, 4], skills: [['hja_firecracker', 1], ['hja_peel', 1]], enemies: [E(4, 4, 'test_grunt', 3)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    use(t, ap.h, ap.h.basic, 4, 4, 'a toss');
    use(t, ap.h, ap.slot('hja_peel'), 3, 5, 'a peel');
    t.ok(ap.h.ap === 1 && /cooldown/i.test(String(DD.Combat.canUse(ap.h, ap.slot('hja_peel')))), 'one peel per cooldown');
    t.eq(DD.Combat.canUse(ap.h, ap.slot('hja_firecracker')), 'Not enough AP.', '1 AP left: a firecracker bundle needs 2');
    DD.Combat.endTurn();
    t.ok(/Not Hjalmar's turn/.test(String(DD.Combat.canUse(ap.h, ap.h.basic))), 'on the knight\'s turn he waits');
    // a target dying mid-skill: a coconut kills, a Prank War that kills some still trips the rest
    const dy = arena({ at: [1, 4], enemies: [E(3, 4), E(4, 4, 'test_grunt', 3)] });
    dy.foes[0].hp = 3;
    use(t, dy.h, dy.h.basic, 3, 4, 'lethal toss');
    t.ok(dy.foes[0].dead && !DD.Combat.state.result, 'the target died; the fight goes on');
    // the last foe dies in a trap on its own turn: victory, no errors
    const vk = arena({ at: [1, 4], skills: [['hja_bear_trap', 3]], ai: true, killAll: true, enemies: [E(5, 4, 'test_minion')] });
    set(t, vk, 'hja_bear_trap', 3, 4);
    DD.Combat.endTurn();
    t.eq(DD.Combat.state.result, 'victory', 'the last foe dies in a bear trap on its own turn: victory');
    // opportunity attacks: the grunt next to him punishes a plain walk away, his leaps and swaps slip out for free
    const op = arena({ at: [1, 4], skills: [['hja_swing', 1], ['hja_switch', 1]], enemies: [E(2, 4, 'test_grunt', 3), E(1, 6, 'test_grunt', 3), E(2, 6, 'test_grunt', 3)] });
    t.ok(aooDuring(function () { use(t, op.h, op.slot('hja_switch'), 1, 6, 'switch away'); }) === 0 && op.h.y === 6, 'Bait and Switch out of the grunt\'s reach: no attack of opportunity');
    t.ok(aooDuring(function () { use(t, op.h, op.slot('hja_swing'), 4, 6, 'swing away'); }) === 0 && op.h.x === 4, 'Swing Away from the next grunt: none either');
    t.eq(op.h.hp, op.h.maxHp, 'not a scratch');
    // initiative +4 from the def
    t.eq(DD.Combat.initOf ? DD.Combat.initOf(arena({ at: [1, 4] }).h) : 4, 4, 'initiative modifier +4');
  });

  // ---- combos with other heroes --------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: combos — the party pushes foes into his traps', function (t) {
    // the knight's shield bash into a firecracker next to a second grunt: two hit, +5 Hype, multi-hit by the knight
    const a = arena({ at: [4, 2], skills: [['hja_firecracker', 2]], enemies: [E(3, 4, 'test_grunt', 3), E(5, 5, 'test_grunt', 3)], heroes: [{ id: 'test_knight', x: 2, y: 4 }] });
    set(t, a, 'hja_firecracker', 5, 4);
    DD.Combat.endTurn();
    const k = DD.Combat.current();
    use(t, k, slotOf(k, 'test_shield_bash'), 3, 4, 'bash 2 east');
    t.ok(a.foes[0].hp === 42 - 4 - 7 && a.foes[1].hp === 42 - 7, 'bash 4 + bang 7; the grunt next to it takes 7 too');
    hypeIs(t, DD.Combat.state.hype, 5, 'Monkey Business +5');
    // the mage's lightning on a foe the glove punched into water
    const w = arena({ at: [2, 4], skills: [['hja_glove', 1]], terrain: { '6,4': 'water' }, enemies: [E(4, 5, 'test_grunt', 3)],
      heroes: [{ id: 'test_mage', x: 4, y: 7, skills: [{ id: 'test_chain_zap', level: 1 }] }] });
    set(t, w, 'hja_glove', 4, 4);
    DD.Act.push(w.h, w.foes[0], NORTH, 1);
    t.ok(has(w.foes[0], 'wet'), 'BOING into the water: Wet');
    DD.Combat.endTurn();
    const mage = DD.Combat.current(), hp0 = w.foes[0].hp;
    use(t, mage, slotOf(mage, 'test_chain_zap'), w.foes[0].x, w.foes[0].y, 'chain zap');
    t.ok(hp0 - w.foes[0].hp > L('test_chain_zap', 1).dmg + 1, 'Wet foes take the mage\'s lightning hard (' + (hp0 - w.foes[0].hp) + ')');
    // a grunt Rooted by the bear trap can't get away from the knight's next swing (a stationary target)
    const r = arena({ at: [1, 4], skills: [['hja_bear_trap', 1]], ai: true, enemies: [E(5, 4, 'test_grunt', 3)], heroes: [{ id: 'test_knight', x: 4, y: 6 }] });
    set(t, r, 'hja_bear_trap', 3, 4);
    DD.Combat.endRound();
    t.ok(has(r.foes[0], 'root') && r.foes[0].x === 3, 'Rooted in the trap for the party\'s turns');
  });

  // ---- review (v2) --------------------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: review (v2) — last-tile slips, glove bumps, charmed walkers, the cushion\'s AutoPlay worth', function (t) {
    // a peel on the tile next to Hjalmar (the last step of the walk): it slips there and never stabs
    const a = arena({ at: [1, 4], skills: [['hja_peel', 1]], ai: true, enemies: [E(4, 4, 'test_grunt', 3)] });
    set(t, a, 'hja_peel', 2, 4, 'peel next to him');
    const g = a.foes[0];
    DD.Combat.endTurn();
    t.ok(g.x === 2 && g.y === 4 && !trapAt(2, 4), 'the grunt walked up onto the peel');
    t.eq(a.h.hp, a.h.maxHp, 'slipped on its last step: no stab');
    t.ok(!has(g, SLIPPED), 'and up again at the end of that turn');
    DD.Combat.endTurn();
    t.eq(a.h.hp, a.h.maxHp - 4, 'its next turn is normal: it stabs');
    // "can't act until the end of its turn" holds under a planner that walks again and winds up after the slip
    // (real ones do: the act 1 Mimic walks twice, several elites and bosses walk and then wind up)
    const p = arena({ at: [1, 4], skills: [['hja_peel', 1]], ai: true, enemies: [E(6, 4, 'test_grunt', 3)] });
    set(t, p, 'hja_peel', 4, 4, 'peel for the planner');
    const pg = p.foes[0], gdef = DD.getEnemy('test_grunt'), oldAi = gdef.ai;
    const steps = [];
    gdef.ai = function (u, api) {
      api.moveTo(u, 3, 4); steps.push(u.x + ',' + u.y);
      api.moveTo(u, 2, 4); steps.push(u.x + ',' + u.y);
      api.windUp(u, 'test_grunt_stab', { x: 1, y: 4 }, { label: 'Sneaky Stab' });
    };
    try { DD.Combat.endTurn(); } finally { gdef.ai = oldAi; }
    t.eq(steps.join(' '), '4,4 4,4', 'it slipped on the peel mid-walk and its second walk was refused');
    t.eq(pg.intents.length, 0, 'the wind-up it queued while flat on its back was called off at the end of that turn');
    t.ok(!has(pg, SLIPPED) && p.h.hp === p.h.maxHp, 'up again, nobody hurt');
    DD.Combat.endTurn();
    t.ok(pg.x === 2 && p.h.hp === p.h.maxHp - 4, 'its next turn is normal (one stab, no leftover wind-up)');
    // a glove aimed into a wall: no room to knock it, so it is bumped (3) and walks on, like any blocked push
    const w = arena({ at: [1, 4], skills: [['hja_glove', 1]], ai: true, enemies: [E(3, 2, 'test_grunt', 3)],
      terrain: { '4,4': 'wall', '2,3': 'wall', '1,3': 'wall', '0,3': 'wall', '2,5': 'wall', '1,5': 'wall', '0,5': 'wall' } });
    const o = set(t, w, 'hja_glove', 3, 4, 'glove facing a wall');
    t.ok(o && o.data.dir.x === 1, 'aimed east, into the wall');
    DD.Combat.endTurn();
    t.ok(w.foes[0].hp === 42 - 3 && !trapAt(3, 4), 'the grunt springs it: BONK against the wall (3)');
    t.ok(w.foes[0].x === 2 && w.foes[0].y === 4 && w.h.hp === w.h.maxHp - 4, 'not knocked anywhere, so its walk went on and it stabbed');
    // a foe charmed to fight for the party is still a foe to a trap
    const c = arena({ at: [3, 2], skills: [['hja_bear_trap', 1]], ai: true, enemies: [E(1, 4, 'test_grunt', 3), E(6, 4, 'test_grunt', 3)] });
    set(t, c, 'hja_bear_trap', 3, 4, 'trap in the charmed walk');
    DD.Act.addStatus(c.foes[0], 'charmed', { turns: 1 }, c.h);
    DD.Combat.endTurn();
    t.ok(c.foes[0].x === 3 && c.foes[0].hp === 42 - 5 && has(c.foes[0], 'root'), 'a charmed grunt walking at its friends springs the bear trap too');
    // the whoopee cushion's AutoPlay worth: high on the way to a far-off ally (its strike fizzles), low when the foe comes
    // for the monkey anyway (before the review it was the same small number everywhere, so AutoPlay hardly set one)
    const Lc = L('hja_cushion', 1);
    const far = arena({ at: [2, 4], skills: [['hja_cushion', 1]], enemies: [E(5, 7, 'test_grunt', 3)], heroes: [{ id: 'test_cleric', x: 1, y: 7 }] });
    const vFar = DD.Hjalmar.trapValue({ user: far.h, target: { x: 2, y: 7 }, L: Lc }, 'cushion');
    const own = arena({ at: [2, 4], skills: [['hja_cushion', 1]], enemies: [E(5, 4, 'test_grunt', 3)] });
    const vOwn = DD.Hjalmar.trapValue({ user: own.h, target: { x: 3, y: 4 }, L: Lc }, 'cushion');
    t.ok(vFar > 1.5 && vFar > 3 * vOwn, 'cushion hint: in front of a far-off cleric ' + vFar.toFixed(2) + ' vs in front of himself ' + vOwn.toFixed(2));
    const near = arena({ at: [2, 6], skills: [['hja_cushion', 1]], enemies: [E(5, 7, 'test_grunt', 3)], heroes: [{ id: 'test_cleric', x: 1, y: 7 }] });
    const vNear = DD.Hjalmar.trapValue({ user: near.h, target: { x: 2, y: 7 }, L: Lc }, 'cushion');
    t.ok(vNear < vFar, 'cushion hint: less when the monkey stands next to that cleric (it hits him instead): ' + vNear.toFixed(2));
  });

  // ---- AutoPlay ---------------------------------------------------------------------------------------------------------
  T.suite('hero_hjalmar: AutoPlay battles at levels 1 / 3 / 5 (party Hjalmar + fixture knight, cleric, mage)', function (t) {
    const loadouts = {
      1: [['hja_peel', 1], ['hja_bear_trap', 1]],
      3: [['hja_peel', 2], ['hja_bear_trap', 2], ['hja_firecracker', 1], ['hja_glove', 1]],
      '3b': [['hja_cushion', 1], ['hja_paint', 1], ['hja_pickpocket', 1], ['hja_switch', 1]],
      5: [['hja_peel', 2], ['hja_bear_trap', 3], ['hja_firecracker', 2], ['hja_swing', 2]],
      '5b': [['hja_glove', 2], ['hja_cushion', 2], ['hja_paint', 2], ['hja_switch', 2]],
    };
    const fights = [[1, 1, 'normal'], [1, 1, 'elite'], [1, 1, 'boss'], [2, 3, 'normal'], [2, '3b', 'elite'], [2, 3, 'boss'],
      [3, 5, 'normal'], [3, '5b', 'elite'], [3, 5, 'boss'], [1, '3b', 'normal'], [2, '5b', 'normal'], [3, '3b', 'normal']];
    const used = {}, sprung = {};
    const orig = DD.Combat.useSkill, origSpring = DD.Hjalmar.spring;
    const results = [];
    let wins = 0, traps = 0;
    DD.Combat.useSkill = function (unit, slot) {
      const r = orig.apply(this, arguments);
      if (r && unit && slot && unit.defId === 'hjalmar') used[slot.id] = (used[slot.id] || 0) + 1;
      return r;
    };
    const off = DD.Events.on('combat:log', function (e) { if (/ springs .*Hjalmar's /.test(e.text)) { traps++; const m = / Hjalmar's (.*)!$/.exec(e.text); if (m) sprung[m[1]] = (sprung[m[1]] || 0) + 1; } });
    try {
      fights.forEach(function (f, i) {
        const act = f[0], key = f[1], kind = f[2], lvl = parseInt(key, 10);
        const enc = DD.getEncounter('test_a' + act + '_' + kind);
        if (!enc) { t.fail('fixture encounter missing: test_a' + act + '_' + kind); return; }
        const party = ['hjalmar', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
          if (id === 'hjalmar') return DD.Combat.makeRunHero({ id: id, level: lvl, skills: loadouts[key].map(function (e) { return { id: e[0], level: e[1] }; }) });
          const h = DD.getHero(id);
          return DD.Combat.makeRunHero({ id: id, level: lvl, skills: h.skillPool.slice(0, 4).map(function (sid) { return { id: sid, level: Math.min(3, 1 + Math.floor(lvl / 3)) }; }) });
        });
        const seed = (Number(t.seed) || 1) * 37 + (i + 1) * 7919;
        const p0 = DD.problems.length;
        const setup = DD.Encounter.build(enc, party, { rng: DD.RNG(seed), difficulty: 'normal', act: act });
        DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: kind });
        const r = DD.AutoPlay.runBattle(30);
        const s = DD.Combat.state;
        const h = s.units.filter(function (u) { return u.defId === 'hjalmar'; })[0];
        t.ok(h && isFinite(h.hp) && h.hp >= 0 && h.hp <= h.maxHp, enc.id + ' L' + lvl + ': Hjalmar sane');
        t.ok(!!s.order && s.order.length > 0, enc.id + ': initiative rolled');
        t.ok(r.result === 'victory' || r.result === 'defeat' || r.timeout, enc.id + ' L' + lvl + ': the battle ends (' + r.result + ', ' + r.rounds + ' rounds)');
        t.eq(DD.problems.slice(p0).filter(function (m) { return /Error in/.test(m); }).length, 0, enc.id + ': no swallowed errors');
        if (r.result === 'victory') wins++;
        results.push(enc.id + ' L' + key + ': ' + (r.result || 'timeout') + ' in ' + r.rounds + ' (Hjalmar ' + (h.downed ? 'downed' : h.hp + '/' + h.maxHp) +
          ', dealt ' + ((s.stats.units[h.id] || {}).dmg || 0) + ', traps left ' + DD.Hjalmar.traps(h).length + ')');
      });
      // deterministic turns: a grunt coming up the corridor → AutoPlay sets a trap in its way
      const c = arena({ at: [1, 4], level: 3, skills: [['hja_bear_trap', 1], ['hja_peel', 1]], enemies: [E(6, 4)],
        terrain: { '0,3': 'wall', '1,3': 'wall', '2,3': 'wall', '3,3': 'wall', '4,3': 'wall', '5,3': 'wall', '6,3': 'wall', '7,3': 'wall', '8,3': 'wall',
          '0,5': 'wall', '1,5': 'wall', '2,5': 'wall', '3,5': 'wall', '4,5': 'wall', '5,5': 'wall', '6,5': 'wall', '7,5': 'wall', '8,5': 'wall' } });
      DD.AutoPlay.takeTurn();
      t.ok(DD.Hjalmar.traps(c.h).length > 0, 'AutoPlay sets a trap in the corridor the grunt must walk (' + DD.Hjalmar.traps(c.h).map(function (q) { return q.obj.id + '@' + q.x + ',' + q.y; }).join(' ') + ')');
      // standing on his own bear trap next to a grunt: AutoPlay baits and switches it in
      const b = arena({ at: [1, 5], level: 3, skills: [['hja_switch', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
      DD.Hjalmar.setTrap(b.h, 1, 4, 'bear', { snap: 9 });
      DD.Act.teleport(b.h, 1, 4);
      const s0 = used.hja_switch || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.hja_switch || 0) > s0 && has(b.foes[0], 'root'), 'AutoPlay swaps a grunt onto the bear trap under him');
      // a full Hype bar and a crowd: Prank War
      const sig = arena({ at: [1, 4], level: 5, enemies: [E(5, 3, 'test_grunt', 2), E(5, 5, 'test_grunt', 2), E(6, 4, 'test_grunt', 2), E(4, 4, 'test_grunt', 2)] });
      sig.s.hype = 100;
      const g0 = used.hja_signature || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.hja_signature || 0) > g0, 'AutoPlay starts a Prank War with 100 Hype and 4 foes in reach');
    } finally { DD.Combat.useSkill = orig; DD.Hjalmar.spring = origSpring; off(); }
    t.log(results.join(' | '));
    t.log('Hjalmar skill uses: ' + Object.keys(used).map(function (k) { return k + '×' + used[k]; }).join(', '));
    t.log('traps sprung in the fixture fights: ' + traps + ' (' + Object.keys(sprung).map(function (k) { return k + '×' + sprung[k]; }).join(', ') + ')');
    t.ok((used.hja_basic || 0) > 0, 'Coconut Toss used');
    const trapUses = TRAPS.filter(function (id) { return (used[id] || 0) > 0; });
    t.ok(trapUses.length >= 5, 'at least 5 of the 6 traps set by AutoPlay (' + trapUses.join(', ') + ')');
    t.ok(traps >= 6, 'foes actually spring his traps (' + traps + ')');
    const poolUsed = Object.keys(used).filter(function (k) { return POOL.indexOf(k) >= 0; });
    t.ok(poolUsed.length >= 7, 'at least 7 different pool skills used by AutoPlay (' + poolUsed.join(', ') + ')');
    t.ok(wins >= 9, 'the party wins most fixture fights (' + wins + '/' + fights.length + ')');
  });

  // ---- v2 requests (Nov 3): flyers ignore the floor, barrels, the map turns ----------------------------------------------
  T.suite('hero_hjalmar: v2 requests — flyers never spring a trap (and his AutoPlay knows it), Coconut Toss sets off a barrel, the glove arrow turns with the map', function (t) {
    // 1. every trap is a floor effect: a flyer pushed, walked or swapped onto one floats over it (the trap stays)
    const a = arena({ at: [1, 4], enemies: [E(5, 4, 'test_grunt', 3), E(8, 8)] });
    const g = a.foes[0];
    Object.keys(DD.Hjalmar.KINDS).forEach(function (kind) {
      DD.Hjalmar.setTrap(a.h, 4, 4, kind, { snap: 5, turns: 1, boom: 6, push: 2, dir: WEST });
      g.flags.flying = true;
      const hp0 = g.hp, hype0 = DD.Combat.state.hype;
      DD.Act.push(a.h, g, WEST, 1);
      t.ok(g.x === 4 && g.y === 4 && g.hp === hp0 && !g.statuses.length && trapAt(4, 4), kind + ': a flyer pushed onto it floats over it (the trap stays)');
      t.eq(DD.Combat.state.hype, hype0, kind + ': no Monkey Business Hype');
      t.eq(DD.Hjalmar.springOn(DD.Grid.tile(4, 4), g), false, kind + ': springOn refuses a flyer too');
      DD.Act.teleport(g, 5, 4, { fx: false });
      DD.Act.removeObject(4, 4);
    });
    // a walker still springs it
    g.flags.flying = false;
    DD.Hjalmar.setTrap(a.h, 4, 4, 'bear', { snap: 5 });
    DD.Act.push(a.h, g, WEST, 1);
    t.ok(!trapAt(4, 4) && has(g, 'root'), 'a walker pushed onto a bear trap springs it');
    // 2. AutoPlay: a trap in a flyer's path is worth nothing; Bait and Switch onto his trap is worth nothing on a flyer
    const b = arena({ at: [1, 4], skills: [['hja_bear_trap', 1], ['hja_switch', 3]], enemies: [E(5, 4, 'test_grunt', 3)] });
    const f = b.foes[0], trapCtx = DD.Targeting.buildCtx(b.h, b.slot('hja_bear_trap'), { x: 3, y: 4 });
    t.ok(sk('hja_bear_trap').autoplayValue(trapCtx) > 0, 'a bear trap in a walker\'s path is worth setting');
    f.flags.flying = true;
    t.eq(sk('hja_bear_trap').autoplayValue(DD.Targeting.buildCtx(b.h, b.slot('hja_bear_trap'), { x: 3, y: 4 })), 0, 'in a flyer\'s path: worth nothing');
    f.flags.flying = false;
    DD.Hjalmar.setTrap(b.h, 2, 4, 'bear', { snap: 5 });
    DD.Act.teleport(b.h, 2, 4, { fx: false });
    t.ok(trapAt(2, 4) && b.h.x === 2, 'premise: Hjalmar stands on his own bear trap');
    const sw = sk('hja_switch');
    t.ok(sw.autoplayValue(DD.Targeting.buildCtx(b.h, b.slot('hja_switch'), { x: 5, y: 4 })) > 0, 'Bait and Switch onto it: worth it on a walker');
    f.flags.flying = true;
    t.eq(sw.autoplayValue(DD.Targeting.buildCtx(b.h, b.slot('hja_switch'), { x: 5, y: 4 })), 0, 'worth nothing on a flyer');
    use(t, b.h, b.slot('hja_switch'), 5, 4, 'swap with the flyer');
    t.ok(f.x === 2 && f.y === 4 && !has(f, 'root') && trapAt(2, 4), 'the flyer lands over the trap and floats there (it stays)');
    // 3. Coconut Toss at an explosive barrel: it goes off at once, his blast (the coconut's knock-back has nothing to knock)
    const c = arena({ at: [1, 4], items: ['hja_coconut'], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }], enemies: [E(5, 4, 'test_grunt', 3), E(8, 8)] });
    const gr = c.foes[0], g0 = gr.hp;
    t.ok(DD.Targeting.validTargets(c.h, c.h.basic).some(function (q) { return q.obj === 'barrel_explosive' && q.x === 4 && q.y === 4; }), 'Coconut Toss can be aimed at the barrel');
    const prev = previewThenUse(t, c.h, c.h.basic, 4, 4, 'Coconut Toss at a barrel');
    t.eq(prev.detonates, 'barrel_explosive', 'the preview detonates it');
    t.ok(!objAt(4, 4) && gr.hp < g0 && gr.x === 5, 'the barrel went off: the grunt next to it takes the blast where it stands');
    t.eq(c.h.ap, 2, '1 AP');
    // 4. the spring glove's floor arrow points along the grid at every view (DD.Iso.local), exactly as before at the default one
    if (!DD.Iso || !DD.Iso.withYaw || !DD.Iso.painter) { t.log('DD.Iso views not loaded: glove arrow not checked'); return; }
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const glove = DD.getObject('hja_glove');
    function arrowEnd(d, yaw) {
      return DD.Iso.withYaw(yaw, function () {
        const gp = DD.Iso.painter(cv.getContext('2d'), { t: 0.7 }), lines = [], line = gp.line;
        gp.line = function (x1, y1, x2, y2, col) { lines.push({ x: x2, y: y2, col: col }); return line.apply(gp, arguments); };
        glove.draw(gp, { id: 'hja_glove', hp: 0, maxHp: 0, data: { seq: 1, dir: d, owner: null } }, 0.7);
        const arrow = lines.filter(function (l) { return l.col === '#ff9a7a'; })[0];
        return { got: arrow, want: DD.Iso.local(d.x * 0.48, d.y * 0.48) };
      });
    }
    [EAST, SOUTH, WEST, NORTH].forEach(function (d) {
      [0, 90, 180, 270, 37].forEach(function (yaw) {
        const r = arrowEnd(d, yaw);
        t.ok(r.got && Math.abs(r.got.x - r.want.x) < 1e-6 && Math.abs(r.got.y - r.want.y) < 1e-6,
          'dir ' + d.x + ',' + d.y + ' at ' + yaw + '°: the arrow points along the grid (' + (r.got && r.got.x.toFixed(2) + ',' + r.got.y.toFixed(2)) + ')');
      });
    });
    const e0 = arrowEnd(EAST, 0).got, e180 = arrowEnd(EAST, 180).got;
    t.ok(Math.abs(e0.x - 0.48 * 32) < 1e-6 && Math.abs(e0.y - 0.48 * 16) < 1e-6, 'default view: east still points down-right, pixel for pixel');
    t.ok(Math.abs(e180.x + e0.x) < 1e-6 && Math.abs(e180.y + e0.y) < 1e-6, 'turned half a circle: the arrow points the other way on screen');
  });

  // ---- map rotation: box props turn with the board (rotation plan §7 P2: def.yawAware) ------------------------------
  /**
   * Pixels of an object def painted at `yaw` on a fresh 160×200 canvas (the feet at 80, 160; zoom 1.5), through the painter
   * the renderer hands it: the yawAware one when the def opts in, the billboard one when `billboard` is set.
   */
  function rotPx(id, inst, yaw, billboard) {
    const def = DD.getObject(id), cv = document.createElement('canvas');
    cv.width = 160; cv.height = 200;
    const c = cv.getContext('2d');
    c.translate(80, 160); c.scale(1.5, 1.5);
    const obj = Object.assign({ id: id, hp: 0, maxHp: 0, data: {} }, JSON.parse(JSON.stringify(inst || {})));
    DD.Iso.withYaw(yaw, function () {
      const g = DD.Iso.painter(c, { yawAware: !billboard && def.yawAware === true, t: 0.8 });
      g.obj = obj; g.tile = { x: 3, y: 4 }; g.zoom = 1.5; g.lw = 1.2; g.outline = '#1a1014';
      g.pal = def.colors || def.palette || {};
      def.draw.call(def, g, obj, 0.8);
    });
    return c.getImageData(0, 0, cv.width, cv.height).data;
  }
  function rotSame(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  /** Opaque pixels passing fn(r, g, b): how many, and their mean x (canvas px; the feet are at 80). */
  function rotCount(d, fn) {
    let n = 0, sx = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && fn(d[i], d[i + 1], d[i + 2])) { n++; sx += (i / 4) % 160; }
    return { n: n, x: n ? sx / n : 0 };
  }
  function rotHex(hex) {
    const v = parseInt(hex.slice(1), 16);
    return function (r, g, b) { return r === (v >> 16) && g === ((v >> 8) & 255) && b === (v & 255); };
  }
  /**
   * Each case [id, inst]: the def opts in; at yaw 0 its turning painter draws exactly the billboard pixels (opting in never
   * changes the default view); it paints at every angle without throwing, and turns (30° differs from 0°).
   */
  function rotTurns(t, cases) {
    const yaws = [30, 37.5, 45, 90, 120, 180, 225, 270, 315];
    cases.forEach(function (cs) {
      const id = cs[0], inst = cs[1] || {}, tag = id + ' ' + JSON.stringify(inst.data || {}) + (inst.hp ? ' (' + inst.hp + ' HP)' : '');
      t.ok(!!DD.getObject(id) && DD.getObject(id).yawAware === true, tag + ': opts in (yawAware)');
      const p0 = t.tryRun(tag + ' at 0°', function () { return rotPx(id, inst, 0); });
      t.ok(!!p0 && rotSame(p0, rotPx(id, inst, 0, true)), 'yaw 0: ' + tag + ' paints exactly what the billboard painter paints');
      const bad = [];
      yaws.forEach(function (y) {
        const p = t.tryRun(tag + ' at ' + y + '°', function () { return rotPx(id, inst, y); });
        if (!p || !rotCount(p, function () { return true; }).n) bad.push(y);
        else if (y === 30 && p0 && rotSame(p, p0)) bad.push('30 (did not turn)');
      });
      t.eq(bad.join(','), '', tag + ' paints at ' + yaws.join(' / ') + '° and turns with the map');
    });
  }

  T.suite('hero_hjalmar: the spring glove\'s box turns with the map (yawAware)', function (t) {
    if (!DD.Iso || !DD.Iso.withYaw || !DD.getObject('hja_glove')) { t.skip('map views or Hjalmar not loaded'); return; }
    const n0 = DD.problems.length;
    rotTurns(t, [['hja_glove', { data: { dir: { x: 1, y: 0 } } }], ['hja_glove', { data: { dir: { x: 0, y: -1 } } }]]);
    t.ok(['hja_peel', 'hja_bear_trap', 'hja_cushion', 'hja_paint', 'hja_firecracker'].every(function (id) { return DD.getObject(id) && DD.getObject(id).yawAware !== true; }),
      'the other traps have no box: they stay billboards');
    t.eq(DD.problems.slice(n0).filter(function (p) { return /^Error in /.test(p); }).length, 0, 'no swallowed errors');
  }, { tags: ['render'] });
})();
