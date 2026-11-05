/* Dungeons and Degenerates — tests/content/hero_kiri.js
 * Suites "hero_kiri: …" for js/data/heroes/kiri.js (v2: initiative turns, no telegraphs, no Guard): registry data,
 * texts and barks (pronouns, simplicity), the sprite, the Between Worlds passive (her skills ignore line of sight),
 * every skill at every level in sandbox fights (desc == effect: damage, statuses, displacement, surfaces, costs,
 * cooldowns, ranges), Arrow from Beyond's landing at the start of her next turn, durations counted in own turns, the
 * signature, the items, previews against reality, v2 edge cases (stunned / silenced / sheep / charmed Kiri, targets
 * dying mid-skill, pits / lava / water / walls / map edges, AP), attacks of opportunity (walking off a foe provokes;
 * Ethereal Step, Fade Out and pushes don't; her bow never strikes; AutoPlay steps out of a lethal pin) and AutoPlay
 * battles at levels 1 / 3 / 5.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  const POOL = ['kir_phase', 'kir_step', 'kir_mark', 'kir_pin', 'kir_banish', 'kir_volley', 'kir_beyond', 'kir_fade', 'kir_mist'];
  const ALL = POOL.concat(['kir_basic', 'kir_signature']);
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const MASC = /\b(he|him|his|himself)\b/i;

  // ---- helpers ------------------------------------------------------------------------------------------
  function sk(id) { return DD.getSkill(id); }
  function L(id, lv) { return DD.skillLevel(sk(id), lv); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function stacks(u, id) { const st = DD.Act.getStatus(u, id); return st ? st.stacks : 0; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
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
   * Sandbox with Kiri at cfg.at (default 1,4) on a 9×9 floor; heroes first in the listed order (Kiri, then cfg.heroes),
   * enemies pass unless cfg.ai. cfg: { at, level, skills: [[id, lv]], items, hp, enemies, heroes, terrain (map), objects,
   * surfaces, w, h, seed, ai }. Returns { s, k, slot(id), foes }.
   */
  function arena(cfg) {
    cfg = cfg || {};
    const p = cfg.at || [1, 4];
    const skills = (cfg.skills || []).map(function (e) { return { id: e[0], level: e[1] || 1 }; });
    const heroes = [{ id: 'kiri', x: p[0], y: p[1], level: cfg.level || 1, skills: skills, items: cfg.items || [], hp: cfg.hp }]
      .concat(cfg.heroes || []);
    const s = DD.Combat.sandbox({
      w: cfg.w || 9, h: cfg.h || 9, seed: cfg.seed || 7, enemyAi: !!cfg.ai,
      objective: { type: 'custom', text: 'Kiri test' }, encounter: { id: 'kir_test_arena', checkObjective: function () { return null; } },
      heroes: heroes, enemies: cfg.enemies || [], terrain: cfg.terrain ? terr(cfg.terrain) : undefined, objects: cfg.objects, surfaces: cfg.surfaces,
    });
    const k = s.units.filter(function (u) { return u.defId === 'kiri'; })[0];
    return {
      s: s, k: k,
      slot: function (id) { return DD.Combat.slotsOf(k).filter(function (sl) { return sl.id === id; })[0]; },
      foes: s.units.filter(function (u) { return u.side === 'enemy'; }),
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

  function hpMap(s) { const m = {}; s.units.forEach(function (u) { m[u.id] = { hp: u.hp, dead: !!u.dead, downed: !!u.downed }; }); return m; }
  function previewProblems(prev, s, before) {
    if (prev.uncertain) return ['the preview is uncertain (Kiri rolls no dice)'];
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
  /** Preview, then use: the preview must leave the fight untouched and predict HP, downs and Hype exactly. */
  function previewThenUse(t, u, slot, x, y, label) {
    const s = DD.Combat.state;
    const k0 = stateKey(s);
    const prev = DD.Combat.preview(u, slot, x, y);
    t.eq(stateKey(s), k0, label + ': preview leaves the fight untouched');
    const before = hpMap(s);
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
  function textsOf(id) {
    const d = sk(id), out = [d.flavor || ''];
    for (let lv = 1; lv <= d.levels.length; lv++) out.push(DD.skillDesc(d, lv, null));
    return out;
  }

  // ---- registry & data --------------------------------------------------------------------------------------
  T.suite('hero_kiri: registry, identity, numbers, descriptions and barks', function (t) {
    const h = DD.getHero('kiri');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.eq(h.name, 'Kiri', 'name');
    t.ok(h.epithet && h.race === 'Half-Elf' && h.cls === 'Ranger' && h.role && h.blurb.length > 60, 'identity + blurb');
    t.ok(h.complexity >= 1 && h.complexity <= 3 && /^#[0-9a-f]{6}$/i.test(h.color), 'complexity + colour');
    t.eq(h.unlock, null, 'available from the start (unlock: null, DESIGN v2)');
    t.eq(JSON.stringify(h.stats), JSON.stringify({ hp: 24, ap: 3, mov: 4, armor: 0, init: 3 }), 'L1 stats: 24 HP, 3 AP, move 4, initiative +3');
    t.eq(h.growth.hp, 4, 'growth +4 HP per level');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['kir_phase', 'kir_step']), 'starting skills: Phase Shot + Ethereal Step (arrows and steps through the ethereal plane)');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'pool of 9 (DESIGN v2: 8-10 besides basic and signature)');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic/signature not in pool');
    t.eq(JSON.stringify(h.summons || []), '[]', 'no summons');
    t.eq(sk(h.signature).hype, 100, 'signature costs 100 Hype');
    const b = L(h.basic, 1);
    t.ok(b.dmg >= 4 && b.dmg <= 6 && sk(h.basic).ap === 1 && !sk(h.basic).cooldown, 'basic: 1 AP, 4-6 damage, no cooldown');
    t.ok(h.passive && h.passive.name === 'Between Worlds' && /line of sight/.test(h.passive.desc), 'passive Between Worlds (line of sight)');
    const aps = {};
    let words = 0;
    ALL.forEach(function (id) {
      const d = sk(id);
      t.ok(!!d, id + ' registered');
      if (!d) return;
      t.eq(d.owner, 'kiri', id + ' owner');
      t.ok(typeof d.icon === 'string' && d.icon.length > 0 && d.icon.length <= 3, id + ' one emoji icon');
      t.ok(d.target && d.target.los === false, id + ': ignores line of sight (Between Worlds)');
      if (POOL.indexOf(id) >= 0) { t.eq(d.levels.length, 3, id + ' has 3 levels'); aps[d.ap] = 1; }
      for (let lv = 1; lv <= d.levels.length; lv++) {
        const txt = DD.skillDesc(d, lv, null);
        t.ok(txt && !/undefined|NaN|\[object/.test(txt), id + ' L' + lv + ' desc with a null user');
        const Lv = DD.skillLevel(d, lv);
        ['dmg', 'arrow', 'mark', 'len', 'push', 'r'].forEach(function (k) {
          if (typeof Lv[k] === 'number' && Lv[k] > 0) t.ok(new RegExp('(^|[^0-9])' + Lv[k] + '([^0-9]|$)').test(txt), id + ' L' + lv + ' desc shows ' + k + ' ' + Lv[k]);
        });
        if (Lv.turns > 1) t.ok(txt.indexOf(Lv.turns + ' ') >= 0, id + ' L' + lv + ' desc shows turns ' + Lv.turns);
        // DESIGN §6 Simplicity: one verb, read in one breath (about 12 words + numbers), no if/else clauses
        const n = txt.split(/\s+/).length;
        words = Math.max(words, n);
        t.ok(n <= 20, id + ' L' + lv + ' desc reads in one breath (' + n + ' words): ' + txt);
        const clauses = txt.split(/[.:;!?](\s|$)/).filter(function (x) { return x && x.trim(); }).length;
        t.ok(clauses <= 2, id + ' L' + lv + ' desc is one sentence (a colon or one more clause at most): ' + txt);
        t.ok(!/\bif\b|\bunless\b|\botherwise\b/i.test(txt), id + ' L' + lv + ' desc has no conditions: ' + txt);
      }
      t.ok(!d.flavor || d.flavor.length <= 120, id + ' flavor ≤ 120');
    });
    t.log('longest desc: ' + words + ' words');
    t.ok(aps[1] && aps[2] && aps[3], 'pool mixes 1, 2 and 3 AP skills');
    t.ok(POOL.some(function (id) { return DD.Combat.cooldownOf(null, sk(id), 1) >= 3; }), 'a long-cooldown skill');
    // levels differ visibly (desc, cost, cooldown, range)
    POOL.forEach(function (id) {
      const face = [1, 2, 3].map(function (lv) {
        const d = sk(id), Lv = DD.skillLevel(d, lv);
        return JSON.stringify([DD.skillDesc(d, lv, null), DD.resolve(d.ap, Lv, null, 1), DD.resolve(d.cooldown, Lv, null, 0), DD.resolve(d.target.range, Lv, null, null)]);
      });
      t.ok(face[0] !== face[1] && face[1] !== face[2], id + ': every level looks different');
    });
    // the ranges and areas the descs name are the real ones, at every level ("within N", "up to N tiles", "line of N
    // tiles" = the target range; "within N of a tile" / "radius N" = the area)
    ALL.forEach(function (id) {
      const d = sk(id);
      if (d.target.type === 'self') return;
      for (let lv = 1; lv <= d.levels.length; lv++) {
        const txt = DD.skillDesc(d, lv, null), Lv = DD.skillLevel(d, lv);
        const nums = [];
        txt.replace(/within (\d+)\b(?! of)|up to (\d+) tiles|line of (\d+) tiles/g, function (m, a, b, c) { nums.push(+(a || b || c)); return m; });
        t.eq(nums.length ? nums[nums.length - 1] : null, DD.Targeting.range(null, d, lv)[1], id + ' L' + lv + ': the range in the desc is the real one');
        const ar = /within (\d+) of a tile|radius (\d+)/.exec(txt);
        if (d.area && d.area.shape !== 'custom' && d.area.shape !== 'single') {
          t.eq(ar ? +(ar[1] || ar[2]) : null, DD.resolve(d.area.size, Lv, null, 1), id + ' L' + lv + ': the area in the desc is the real one');
        } else t.ok(!ar, id + ' L' + lv + ': a single-target / line skill names no area');
      }
    });
    t.ok(!h.flags.noProvoke && !h.flags.noOpportunity, 'no attack-of-opportunity flags: the rule applies to her as written (her skills are the way out)');
    // barks: every key 4-6 lines of ≤ 70 characters, in her voice (+ the extra key 'provoked', fired by her passive)
    BARK_KEYS.concat(['provoked']).forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ' has 4-6 lines (' + lines.length + ')');
      lines.forEach(function (line) {
        t.ok(typeof line === 'string' && line.length > 0 && line.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(line));
        t.ok(!MASC.test(line), 'no he/him/his in her barks: ' + JSON.stringify(line));
      });
    });
    // pronouns: she/her in everything written about her
    const about = [h.blurb, h.passive.desc, DD.getStatus('kir_incoming').desc({ stacks: 18, turns: -1, source: null, data: {} })];
    ALL.forEach(function (id) { Array.prototype.push.apply(about, textsOf(id)); });
    ['kir_ghostwood_bow', 'kir_name_tag', 'kir_cloak_elsewhere'].forEach(function (id) { const it = DD.getItem(id); if (it) about.push(it.desc, it.flavor); });
    about.forEach(function (txt) { t.ok(!MASC.test(txt), 'she/her, never he/him: ' + JSON.stringify(txt)); });
    t.ok(/\bShe\b/.test(h.blurb), 'the blurb says "she"');
    // content she owns
    t.ok(!!DD.getStatus('kir_incoming') && !!DD.getSurface('kir_ghost_mist') && DD.getSurface('kir_ghost_mist').blocksLos === true, 'status + mist surface registered');
    const items = Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k]; }).filter(function (it) { return it.hero === 'kiri'; });
    t.eq(items.length, 3, 'three hero items');
    t.ok(items.some(function (it) { return it.rarity === 'rare'; }) && items.some(function (it) { return it.rarity === 'legendary'; }), 'a rare and a legendary item');
  });

  T.suite('hero_kiri: sprite and portrait', function (t) {
    const h = DD.getHero('kiri');
    const probs = T.contentHelpers && T.contentHelpers.spriteProblems ? T.contentHelpers.spriteProblems(h.sprite) : [];
    t.eq(probs.length, 0, 'SpriteSpec valid: ' + probs.join(', '));
    t.ok(h.sprite.head.ears === 'pointy' && h.sprite.head.hat === 'hood' && h.sprite.mainhand === 'bow', 'half-elf ears, hood, longbow');
    t.ok(typeof h.sprite.overlay === 'function' && typeof h.sprite.underlay === 'function', 'overlay (ear tips, quiver) + underlay (ectoplasm)');
    const p0 = DD.problems.length;
    const cv = document.createElement('canvas');
    cv.width = 200; cv.height = 200;
    const ctx = cv.getContext('2d');
    ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
      [1, -1].forEach(function (facing) {
        t.tryRun('draw ' + pose + ' ' + facing, function () { DD.Sprites.draw(ctx, h.sprite, 100, 160, 2, { t: 1.3, pose: pose, facing: facing }); });
      });
    });
    const port = DD.Sprites.portrait('kiri', 64);
    t.ok(port && port.width === 64, 'portrait renders at 64 px');
    const px = port.getContext('2d').getImageData(0, 0, 64, 64).data;
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 200) opaque++;
    t.ok(opaque > 1000, 'portrait is not blank (' + opaque + ' opaque px)');
    t.eq(DD.problems.slice(p0).length, 0, 'no sprite warnings: ' + DD.problems.slice(p0).join(' | '));
  });

  // ---- passive -------------------------------------------------------------------------------------------------------
  T.suite('hero_kiri: Between Worlds — her skills ignore line of sight (enemies still need it)', function (t) {
    const a = arena({ at: [1, 4], skills: [['kir_pin', 1], ['test_bolt', 1]], terrain: { '2,3': 'wall', '2,4': 'wall', '2,5': 'wall' },
      enemies: [E(5, 4), E(5, 5, 'test_archer')] });
    const k = a.k, g = a.foes[0], archer = a.foes[1];
    t.ok(!DD.Grid.los(k, g), 'a wall hides the grunt');
    t.ok(valid(k, k.basic, 5, 4) && valid(k, a.slot('kir_pin'), 5, 4), 'Ghost Arrow and Pinning Shot target it anyway');
    t.ok(!valid(k, a.slot('test_bolt'), 5, 4), 'a borrowed line-of-sight skill (Magic Missile) cannot: the rule is hers');
    t.ok(!DD.Grid.los(archer, k), 'the archer cannot see Kiri behind her wall');
    t.ok(DD.Targeting.validTargets(archer, sk('test_arrow')).every(function (p) { return p.x !== k.x || p.y !== k.y; }), 'so it cannot shoot her');
    use(t, k, k.basic, 5, 4, 'Ghost Arrow through the wall');
    t.eq(g.hp, 14 - 5, 'it hits for 5');
    ALL.forEach(function (id) { t.eq(sk(id).target.los, false, id + ' has target.los === false'); });
  });

  // ---- basic ------------------------------------------------------------------------------------------------------
  T.suite('hero_kiri: Ghost Arrow (basic)', function (t) {
    const a = arena({ at: [1, 4], enemies: [E(6, 4), E(7, 4)], heroes: [{ id: 'test_knight', x: 2, y: 4 }] });
    const k = a.k, near = a.foes[0], far = a.foes[1];
    t.ok(valid(k, k.basic, 6, 4) && !valid(k, k.basic, 7, 4), 'range 5 exactly');
    t.ok(!valid(k, k.basic, 2, 4), 'not at allies');
    use(t, k, k.basic, 6, 4, 'shot 1');
    t.eq(near.hp, 9, '5 damage');
    t.eq(k.ap, 2, 'costs 1 AP');
    use(t, k, k.basic, 6, 4, 'shot 2');
    use(t, k, k.basic, 6, 4, 'shot 3');
    t.ok(near.dead && far.hp === 14, 'three shots in a turn kill a 14 HP grunt (no cooldown)');
    t.eq(DD.Combat.canUse(k, k.basic), 'Not enough AP.', 'then she is out of AP');
  });

  // ---- pool skills ----------------------------------------------------------------------------------------------------
  T.suite('hero_kiri: Phase Shot I-III — every foe in a straight line, through walls and units', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('kir_phase', lv);
      const a = arena({ at: [1, 4], skills: [['kir_phase', lv]], terrain: { '3,4': 'wall' },
        enemies: [E(2, 4), E(4, 4), E(6, 4), E(7, 4), E(2, 5)], heroes: [{ id: 'test_knight', x: 5, y: 4 }] });
      const k = a.k, f = a.foes, knight = at(5, 4), slot = a.slot('kir_phase');
      t.ok(valid(k, slot, 2, 4) && valid(k, slot, 1, 0) && !valid(k, slot, 3, 5) && !valid(k, slot, 7, 4), 'L' + lv + ': straight lines within ' + Lv.len + ' only');
      t.eq(DD.Targeting.area(k, sk('kir_phase'), lv, { x: 2, y: 4 }).length, Lv.len, 'L' + lv + ': the line is ' + Lv.len + ' tiles');
      const h0 = DD.Combat.state.hype;
      use(t, k, slot, 2, 4, 'L' + lv);
      t.eq([f[0].hp, f[1].hp, f[2].hp].join(','), [14 - Lv.dmg, 14 - Lv.dmg, 14 - Lv.dmg].join(','), 'L' + lv + ': ' + Lv.dmg + ' to each foe in the line (one behind a wall, one behind an ally)');
      t.eq(f[3].hp + ',' + f[4].hp, '14,14', 'L' + lv + ': nothing past the line or beside it');
      t.eq(knight.hp, knight.maxHp, 'L' + lv + ': the ally in the line is unharmed');
      hypeIs(t, DD.Combat.state.hype - h0, hype().multiHit, 'L' + lv + ': +' + hype().multiHit + ' Hype for hitting 2+ foes');
      t.eq(k.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(Lv.dmg, [4, 5, 6][lv - 1], 'L' + lv + ': ' + Lv.dmg + ' per foe (4 / 5 / 6)');
      // cooldown 1: unusable on her next turn, back the turn after
      DD.Combat.endTurn(); DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && /cooldown/i.test(String(DD.Combat.canUse(k, slot))), 'L' + lv + ': on cooldown on her next turn');
      DD.Combat.endTurn(); DD.Combat.endTurn();
      t.eq(DD.Combat.canUse(k, slot), true, 'L' + lv + ': ready again the turn after');
    });
    // at the map edge the line is short
    const e = arena({ at: [7, 4], skills: [['kir_phase', 1]], enemies: [E(8, 4)] });
    t.eq(DD.Targeting.area(e.k, sk('kir_phase'), 1, { x: 8, y: 4 }).length, 1, 'map edge: 1 tile east of (7,4)');
    use(t, e.k, e.slot('kir_phase'), 8, 4, 'edge shot');
    t.eq(e.foes[0].hp, 14 - 4, 'edge shot still hits');
    // one foe: Ghost Arrow hits harder; two in a line: Phase Shot wins for the same AP
    t.ok(L('kir_phase', 1).dmg < L('kir_basic', 1).dmg && 2 * L('kir_phase', 1).dmg > L('kir_basic', 1).dmg && sk('kir_phase').ap === sk('kir_basic').ap,
      'L1: 4 < 5 on one foe, 8 > 5 on two (both 1 AP)');
  });

  T.suite('hero_kiri: Ethereal Step I-III — a straight-line teleport through walls and units', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const len = L('kir_step', lv).len;
      const a = arena({ at: [1, 4], skills: [['kir_step', lv]], terrain: { '2,4': 'wall', '1,2': 'pit' }, enemies: [E(3, 4)] });
      const k = a.k, slot = a.slot('kir_step');
      t.ok(valid(k, slot, 1 + len, 4) && !valid(k, slot, 2 + len, 4), 'L' + lv + ': up to ' + len + ' tiles');
      t.ok(!valid(k, slot, 2, 4) && !valid(k, slot, 3, 4) && !valid(k, slot, 2, 5), 'L' + lv + ': not into walls, onto units or off the line');
      t.ok(valid(k, slot, 1, 3) && !valid(k, slot, 1, 2) && valid(k, slot, 1, 1), 'L' + lv + ': never into a pit 2 tiles north (but past it)');
      DD.Act.addStatus(k, 'root', { turns: 1 }, a.foes[0]);
      t.ok(DD.Combat.cantMove(k) && DD.Combat.canUse(k, slot) === true, 'L' + lv + ': Rooted, she can still step (a teleport is not a move action)');
      use(t, k, slot, 1 + len, 4, 'L' + lv);
      t.ok(k.x === 1 + len && k.y === 4, 'L' + lv + ': through the wall and the grunt to ' + (1 + len) + ',4');
      t.eq(k.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(k.hp, k.maxHp, 'L' + lv + ': no harm done');
      t.ok(/cooldown/i.test(String(DD.Combat.canUse(k, slot))), 'L' + lv + ': cooldown 1');
    });
    // onto water: she gets Wet like anyone arriving there
    const w = arena({ at: [1, 4], skills: [['kir_step', 1]], terrain: { '4,4': 'water' } });
    use(t, w.k, w.slot('kir_step'), 4, 4, 'step into water');
    t.ok(has(w.k, 'wet'), 'stepping into water makes her Wet');
    // map edge: only in-bounds tiles
    const e = arena({ at: [0, 0], skills: [['kir_step', 3]] });
    t.ok(DD.Targeting.validTargets(e.k, e.slot('kir_step')).every(function (p) { return p.x >= 0 && p.y >= 0 && (p.x === 0 || p.y === 0); }), 'corner: only in-bounds straight tiles');
  });

  T.suite('hero_kiri: Spirit Mark I-III — Marked sets up an ally\'s hit', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const mark = L('kir_mark', lv).mark;
      const a = arena({ at: [1, 4], skills: [['kir_mark', lv]], enemies: [E(4, 4, 'test_grunt', 2), E(8, 8)], heroes: [{ id: 'test_knight', x: 3, y: 4 }] });
      const k = a.k, g = a.foes[0];
      t.ok(valid(k, a.slot('kir_mark'), 4, 4) && !valid(k, a.slot('kir_mark'), 8, 8), 'L' + lv + ': range 6');
      use(t, k, a.slot('kir_mark'), 4, 4, 'L' + lv);
      t.eq(stacks(g, 'marked'), mark, 'L' + lv + ': Marked ' + mark);
      t.eq(g.hp, 28, 'L' + lv + ': no damage of its own');
      t.eq(k.ap, 2, 'L' + lv + ': 1 AP');
      DD.Combat.endTurn();
      const knight = DD.Combat.current();
      t.eq(knight && knight.defId, 'test_knight', 'L' + lv + ': the knight acts next');
      use(t, knight, knight.basic, 4, 4, 'L' + lv + ' knight slash');
      t.eq(g.hp, 28 - 5 - mark, 'L' + lv + ': the knight\'s 5 becomes ' + (5 + mark));
      t.ok(!has(g, 'marked'), 'L' + lv + ': the mark is used up');
    });
  });

  T.suite('hero_kiri: Pinning Shot I-III — Root lasts exactly its next turn(s)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('kir_pin', lv);
      const a = arena({ at: [1, 4], skills: [['kir_pin', lv]], ai: true, enemies: [E(4, 4, 'test_grunt', 3)] });
      const k = a.k, g = a.foes[0];
      use(t, k, a.slot('kir_pin'), 4, 4, 'L' + lv);
      t.eq(g.hp, 42 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage');
      t.ok(has(g, 'root'), 'L' + lv + ': Rooted');
      let rootedOnItsTurn = 0;
      onTurns(function (u) { return u === g; }, function () { if (has(g, 'root')) rootedOnItsTurn++; }, function () {
        DD.Combat.endTurn();   // the grunt's turn (rooted), then Kiri's round 2
        t.ok(g.x === 4 && g.y === 4 && k.hp === k.maxHp, 'L' + lv + ': on its turn it cannot walk up to her');
        t.eq(has(g, 'root'), Lv.turns > 1, 'L' + lv + ': ' + (Lv.turns > 1 ? 'still Rooted for its second turn' : 'Root gone after its turn'));
        DD.Combat.endTurn();
        DD.Combat.endTurn();
      });
      t.eq(rootedOnItsTurn, Lv.turns, 'L' + lv + ': Rooted on exactly ' + Lv.turns + ' of its turns');
      t.ok(!has(g, 'root') && (g.x !== 4 || g.y !== 4 || Lv.turns > 2), 'L' + lv + ': then it walks again');
    });
    // a pin that kills: no Root on a corpse, no error
    const d = arena({ at: [1, 4], skills: [['kir_pin', 1]], enemies: [E(3, 4)] });
    d.foes[0].hp = 3;
    use(t, d.k, d.slot('kir_pin'), 3, 4, 'lethal pin');
    t.ok(d.foes[0].dead, 'the target died mid-skill');
  });

  T.suite('hero_kiri: Banishing Shot I-III — push away from Kiri (pits, lava, water, walls, edges, immovable)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('kir_banish', lv);
      const a = arena({ at: [1, 4], skills: [['kir_banish', lv]], enemies: [E(3, 4), E(3, 2), E(4, 2)] });
      t.ok(valid(a.k, a.slot('kir_banish'), 3, 2) && !valid(a.k, a.slot('kir_banish'), 4, 2), 'L' + lv + ': range 4 (a foe 4 tiles away yes, 5 no)');
      use(t, a.k, a.slot('kir_banish'), 3, 4, 'L' + lv);
      const g = a.foes[0];
      t.ok(g.hp === 14 - Lv.dmg && g.x === 3 + Lv.push && g.y === 4, 'L' + lv + ': ' + Lv.dmg + ' damage, pushed ' + Lv.push + ' east to ' + g.x + ',' + g.y);
      t.eq(a.k.ap, 2, 'L' + lv + ': 1 AP');
    });
    // into a pit: YEET (environmental kill, +envKill Hype)
    const p = arena({ at: [1, 4], skills: [['kir_banish', 1]], enemies: [E(3, 4)], terrain: { '4,4': 'pit' } });
    use(t, p.k, p.slot('kir_banish'), 3, 4, 'pit');
    t.ok(p.foes[0].dead, 'pushed into a pit: gone');
    hypeIs(t, DD.Combat.state.hype, hype().envKill, 'environmental kill Hype');
    // into lava: burns
    const l = arena({ at: [1, 4], skills: [['kir_banish', 1]], enemies: [E(3, 4, 'test_grunt', 3)], terrain: { '4,4': 'lava' } });
    use(t, l.k, l.slot('kir_banish'), 3, 4, 'lava');
    t.ok(l.foes[0].hp < 42 - 3 && has(l.foes[0], 'burn'), 'pushed through lava: burned (' + l.foes[0].hp + ' HP)');
    // into water: Wet (lightning combo for Wizzy & co.)
    const w = arena({ at: [1, 4], skills: [['kir_banish', 1]], enemies: [E(3, 4)], terrain: { '5,4': 'water' } });
    use(t, w.k, w.slot('kir_banish'), 3, 4, 'water');
    t.ok(w.foes[0].x === 5 && has(w.foes[0], 'wet'), 'pushed into water: Wet');
    // into a wall: bump
    const b = arena({ at: [1, 4], skills: [['kir_banish', 1]], enemies: [E(3, 4)], terrain: { '4,4': 'wall' } });
    use(t, b.k, b.slot('kir_banish'), 3, 4, 'wall');
    t.ok(b.foes[0].x === 3 && b.foes[0].hp === 14 - 3 - 3, 'against a wall: stays, 3 + 3 bump damage');
    // map edge
    const e = arena({ at: [5, 4], skills: [['kir_banish', 1]], enemies: [E(8, 4)] });
    use(t, e.k, e.slot('kir_banish'), 8, 4, 'edge');
    t.ok(e.foes[0].x === 8 && e.foes[0].hp === 14 - 3 - 3, 'at the map edge: bump instead');
    // immovable
    const im = arena({ at: [1, 4], skills: [['kir_banish', 1]], enemies: [E(3, 4, 'test_brute')] });
    use(t, im.k, im.slot('kir_banish'), 3, 4, 'immovable');
    t.ok(im.foes[0].x === 3 && im.foes[0].hp === 50 - (3 - 1), 'the immovable brute takes the hit (armor 1) and stays');
    // damage, then push: a shot that kills pushes nobody into the foe behind (no collision for it)
    const lk = arena({ at: [1, 4], skills: [['kir_banish', 1]], enemies: [E(3, 4), E(4, 4)] });
    lk.foes[0].hp = 3;
    use(t, lk.k, lk.slot('kir_banish'), 3, 4, 'lethal banish');
    t.ok(lk.foes[0].dead && lk.foes[1].hp === 14 && lk.foes[1].x === 4, 'a lethal shot: the foe behind is not bumped (' + lk.foes[1].hp + ' HP)');
    // diagonal targets go along the longer axis, away from her
    const dg = arena({ at: [1, 4], skills: [['kir_banish', 1]], enemies: [E(3, 5)] });
    use(t, dg.k, dg.slot('kir_banish'), 3, 5, 'diagonal');
    t.ok(dg.foes[0].x === 5 && dg.foes[0].y === 5, 'a foe 2 east 1 south goes east');
  });

  T.suite('hero_kiri: Haunted Volley I-III — radius 1, foes only', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const dmg = L('kir_volley', lv).dmg;
      const a = arena({ at: [1, 4], skills: [['kir_volley', lv]], enemies: [E(5, 4), E(5, 3), E(6, 4), E(7, 4)], heroes: [{ id: 'test_knight', x: 4, y: 4 }] });
      use(t, a.k, a.slot('kir_volley'), 5, 4, 'L' + lv);
      const f = a.foes;
      t.eq([f[0].hp, f[1].hp, f[2].hp, f[3].hp].join(','), [14 - dmg, 14 - dmg, 14 - dmg, 14].join(','), 'L' + lv + ': ' + dmg + ' to each foe within 1');
      t.eq(at(4, 4).hp, at(4, 4).maxHp, 'L' + lv + ': the ally next to the blast is spared');
      t.eq(a.k.ap, 1, 'L' + lv + ': 2 AP');
      t.ok(!valid(a.k, a.slot('kir_volley'), 7, 4), 'L' + lv + ': range 5');
    });
  });

  T.suite('hero_kiri: Arrow from Beyond I-III — it lands at the start of her next turn, wherever the target is', function (t) {
    t.ok(!(L('kir_beyond', 1).dmg > 0) && L('kir_beyond', 1).arrow === 18, 'its number is L.arrow, not L.dmg (estimates read L.dmg as damage dealt now)');
    [1, 2, 3].forEach(function (lv) {
      const dmg = L('kir_beyond', lv).arrow;
      const a = arena({ at: [1, 4], skills: [['kir_beyond', lv]], enemies: [E(5, 7, 'test_grunt', 3), E(8, 8)] });
      const k = a.k, g = a.foes[0];
      t.ok(valid(k, a.slot('kir_beyond'), 5, 7) && !valid(k, a.slot('kir_beyond'), 8, 8), 'L' + lv + ': range 7');
      use(t, k, a.slot('kir_beyond'), 5, 7, 'L' + lv);
      t.eq(g.hp, 42, 'L' + lv + ': nothing yet');
      t.eq(stacks(g, 'kir_incoming'), dmg, 'L' + lv + ': the target shows Arrow from Beyond ' + dmg);
      t.eq(k.ap, 0, 'L' + lv + ': 3 AP (her whole turn)');
      // the target runs and hides behind walls, out of range: the arrow does not care
      DD.Act.teleport(g, 8, 0);
      DD.Combat.state.grid.tiles.forEach(function (tl) { if (tl.x === 7 && tl.y <= 1) tl.t = 'wall'; });
      let early = 0;
      onTurns(function (u) { return u.side === 'enemy' || u === k; }, function () { if (g.hp !== 42) early++; }, function () { DD.Combat.endTurn(); });
      t.eq(early, 0, 'L' + lv + ': not a scratch before her next turn starts');
      t.ok(DD.Combat.current() === k && DD.Combat.state.round === 2, 'L' + lv + ': her next turn');
      t.eq(g.hp, 42 - dmg, 'L' + lv + ': ' + dmg + ' damage at the start of it, 11 tiles away behind a wall');
      t.ok(!has(g, 'kir_incoming'), 'L' + lv + ': the arrow is spent');
      t.eq(k.ap, 3, 'L' + lv + ': and she still gets her full turn');
      t.ok(/cooldown/i.test(String(DD.Combat.canUse(k, a.slot('kir_beyond')))), 'L' + lv + ': cooldown 2 (still cooling)');
    });
    // allies' setups add up: Marked + Vulnerable before it lands
    const m = arena({ at: [1, 4], skills: [['kir_beyond', 1]], enemies: [E(5, 4, 'test_grunt', 3)] });
    use(t, m.k, m.slot('kir_beyond'), 5, 4, 'combo');
    DD.Act.addStatus(m.foes[0], 'marked', { stacks: 4 }, null);
    DD.Act.addStatus(m.foes[0], 'vulnerable', { turns: 2 }, null);
    DD.Combat.endTurn();
    t.eq(m.foes[0].hp, 42 - (Math.round(18 * 1.25) + 4), 'Vulnerable and Marked boost it: ' + (Math.round(18 * 1.25) + 4));
    // a kill from beyond is hers (+kill Hype)
    const kl = arena({ at: [1, 4], skills: [['kir_beyond', 1]], enemies: [E(5, 4), E(8, 8)] });
    use(t, kl.k, kl.slot('kir_beyond'), 5, 4, 'kill');
    DD.Combat.endTurn();
    t.ok(kl.foes[0].dead, 'the 14 HP grunt dies to it');
    hypeIs(t, DD.Combat.state.hype, hype().kill, 'kill Hype');
    t.eq((DD.Combat.state.stats.units[kl.k.id] || {}).kills, 1, 'credited to Kiri');
    // the target dies first: nothing happens, no error
    const dd = arena({ at: [1, 4], skills: [['kir_beyond', 1]], enemies: [E(5, 4), E(8, 8)] });
    use(t, dd.k, dd.slot('kir_beyond'), 5, 4, 'dies first');
    DD.Act.kill(dd.foes[0], null);
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === dd.k && dd.foes[1].hp === 14, 'a dead target: the arrow just never lands');
    // Kiri is downed first: it fizzles
    const kd = arena({ at: [1, 4], skills: [['kir_beyond', 1]], enemies: [E(5, 4, 'test_grunt', 3)], heroes: [{ id: 'test_knight', x: 1, y: 6 }] });
    use(t, kd.k, kd.slot('kir_beyond'), 5, 4, 'downed');
    DD.Act.damage(kd.foes[0], kd.k, 999, { cause: 'other' });
    t.ok(kd.k.downed && !has(kd.foes[0], 'kir_incoming'), 'Kiri down: her arrow loses its way');
    DD.Combat.endRound();
    t.eq(kd.foes[0].hp, 42, 'and never lands');
    // Kiri is stunned on her next turn: it still lands (she loosed it last turn)
    const st = arena({ at: [1, 4], skills: [['kir_beyond', 1]], enemies: [E(5, 4, 'test_grunt', 3)], heroes: [{ id: 'test_knight', x: 1, y: 6 }] });
    use(t, st.k, st.slot('kir_beyond'), 5, 4, 'stunned');
    onTurns(function (u) { return u.side === 'enemy'; }, function () { DD.Act.addStatus(st.k, 'stun', { turns: 1 }, st.foes[0]); }, function () { DD.Combat.endTurn(); DD.Combat.endTurn(); });
    t.eq(st.foes[0].hp, 42 - 18, 'stunned on her next turn, the arrow lands anyway');
    // two Kiris: each lands her own arrows on her own turn
    const two = arena({ at: [1, 4], skills: [['kir_beyond', 1]], enemies: [E(5, 4, 'test_grunt', 3), E(5, 6, 'test_grunt', 3)],
      heroes: [{ id: 'kiri', x: 1, y: 6, skills: [{ id: 'kir_beyond', level: 1 }] }] });
    const k2 = two.s.units.filter(function (u) { return u.defId === 'kiri'; })[1];
    use(t, two.k, two.slot('kir_beyond'), 5, 4, 'first Kiri');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === k2 && two.foes[0].hp === 42, 'the second Kiri\'s turn does not land the first one\'s arrow');
    use(t, k2, DD.Combat.slotsOf(k2).filter(function (sl) { return sl.id === 'kir_beyond'; })[0], 5, 6, 'second Kiri');
    DD.Combat.endTurn();
    t.ok(two.foes[0].hp === 24 && two.foes[1].hp === 42, 'the first lands at the first Kiri\'s turn');
    DD.Combat.endTurn();
    t.eq(two.foes[1].hp, 24, 'the second at the second Kiri\'s turn');
    // AutoPlay values it (previews show no damage now)
    const ai = arena({ at: [1, 4], skills: [['kir_beyond', 1]], enemies: [E(5, 4)] });
    const ctx = DD.Targeting.buildCtx(ai.k, ai.slot('kir_beyond'), { x: 5, y: 4 });
    t.ok(sk('kir_beyond').aiScore(ctx) > 10, 'aiScore values the landing damage (' + sk('kir_beyond').aiScore(ctx) + ')');
  });

  T.suite('hero_kiri: Fade Out I-III — Stealthed until the end of her next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('kir_fade', lv);
      const a = arena({ at: [1, 4], skills: [['kir_fade', lv]], ai: true, enemies: [E(2, 4)], heroes: [{ id: 'test_knight', x: 6, y: 7 }] });
      const k = a.k, g = a.foes[0];
      if (Lv.cleanse) { DD.Act.addStatus(k, 'weak', { turns: 2 }, g); DD.Act.addStatus(k, 'root', { turns: 2 }, g); }
      use(t, k, a.slot('kir_fade'), k.x, k.y, 'L' + lv);
      t.ok(has(k, 'stealth'), 'L' + lv + ': Stealthed');
      t.eq(k.ap, 2, 'L' + lv + ': 1 AP');
      if (Lv.cleanse) t.ok(!has(k, 'weak') && !has(k, 'root'), 'L3: she sheds her debuffs');
      let hidden = 0;
      onTurns(function (u) { return u === g; }, function () { if (has(k, 'stealth')) hidden++; }, function () {
        DD.Combat.endRound();
        t.ok(has(k, 'stealth') && k.hp === k.maxHp, 'L' + lv + ': the grunt next to her ignored her; still Stealthed on her next turn');
        DD.Combat.endRound();
      });
      t.eq(hidden, 1, 'L' + lv + ': hidden during exactly one enemy turn');
      t.ok(!has(k, 'stealth'), 'L' + lv + ': gone at the end of her next turn');
      t.eq(DD.Combat.cooldownOf(k, sk('kir_fade'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
    });
    // attacking reveals her (core Stealth)
    const r = arena({ at: [1, 4], skills: [['kir_fade', 1]], enemies: [E(4, 4)] });
    use(t, r.k, r.slot('kir_fade'), 1, 4, 'fade');
    use(t, r.k, r.k.basic, 4, 4, 'shoot');
    t.ok(!has(r.k, 'stealth'), 'dealing damage reveals her');
  });

  T.suite('hero_kiri: Mist Opportunity I-III — blocks sight for everyone but Kiri', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('kir_mist', lv);
      const a = arena({ at: [1, 4], skills: [['kir_mist', lv]], surfaces: [{ x: 4, y: 3, id: 'fire', turns: 5 }], terrain: { '5,5': 'wall' },
        enemies: [E(6, 4, 'test_archer')], heroes: [{ id: 'test_cleric', x: 2, y: 4 }] });
      const k = a.k, archer = a.foes[0];
      t.ok(DD.Targeting.validTargets(archer, sk('test_arrow')).some(function (p) { return p.x === 2 && p.y === 4; }), 'L' + lv + ': before: the archer can shoot the cleric');
      use(t, k, a.slot('kir_mist'), 4, 4, 'L' + lv);
      const tiles = DD.Targeting.area(k, sk('kir_mist'), lv, { x: 4, y: 4 });
      const misted = tiles.filter(function (q) { return surf(q.x, q.y) === 'kir_ghost_mist'; });
      const walls = tiles.filter(function (q) { return DD.Grid.tile(q.x, q.y).t === 'wall'; }).length;
      t.eq(surf(4, 3), 'fire', 'L' + lv + ': not over other surfaces (the fire stays)');
      t.eq(misted.length, tiles.length - 1 - walls, 'L' + lv + ': every other tile within ' + Lv.r + ' is misted (not the fire' + (walls ? ', not the wall' : '') + ')');
      t.ok(misted.every(function (q) { return DD.Grid.tile(q.x, q.y).surface.turns === Lv.turns; }), 'L' + lv + ': for ' + Lv.turns + ' rounds');
      t.ok(!DD.Targeting.validTargets(archer, sk('test_arrow')).some(function (p) { return p.x === 2 && p.y === 4; }), 'L' + lv + ': the archer cannot see the cleric through it');
      t.ok(!DD.Grid.los(k, archer) && valid(k, k.basic, 6, 4), 'L' + lv + ': Kiri shoots through her own mist');
      t.eq(k.ap, 2, 'L' + lv + ': 1 AP');
      for (let r = 1; r < Lv.turns; r++) DD.Combat.endRound();
      t.eq(surf(4, 4), 'kir_ghost_mist', 'L' + lv + ': still there in round ' + Lv.turns);
      DD.Combat.endRound();
      t.eq(surf(4, 4), null, 'L' + lv + ': gone after ' + Lv.turns + ' rounds');
    });
  });

  // ---- combos with other heroes ------------------------------------------------------------------------------------------
  T.suite('hero_kiri: combos — her setups pay off for the party', function (t) {
    // Banishing Shot into water → Wet → Wizzy's lightning hits half as hard again
    function zapAfter(water) {
      const a = arena({ at: [1, 4], skills: [['kir_banish', 1]], enemies: [E(3, 4, 'test_grunt', 3)], terrain: water ? { '5,4': 'water' } : {},
        heroes: [{ id: 'test_mage', x: 2, y: 6, skills: [{ id: 'test_chain_zap', level: 1 }] }] });
      use(t, a.k, a.slot('kir_banish'), 3, 4, 'banish' + (water ? ' into water' : ''));
      DD.Combat.endTurn();
      const mage = DD.Combat.current(), g = a.foes[0], hp0 = g.hp;
      use(t, mage, DD.Combat.slotsOf(mage).filter(function (sl) { return sl.id === 'test_chain_zap'; })[0], g.x, g.y, 'chain zap');
      return { lost: hp0 - g.hp, wet: water, stun: has(g, 'stun') };
    }
    const dry = zapAfter(false), wet = zapAfter(true);
    t.ok(wet.lost >= Math.round(dry.lost * 1.4), 'Wet from the push: the zap deals ' + wet.lost + ' instead of ' + dry.lost);
    // Pinning Shot holds a foe in the fire it would rather walk out of
    const f = arena({ at: [1, 4], skills: [['kir_pin', 1]], ai: true, enemies: [E(4, 4, 'test_grunt', 3)], surfaces: [{ x: 4, y: 4, id: 'fire', turns: 3 }] });
    use(t, f.k, f.slot('kir_pin'), 4, 4, 'pin in fire');
    DD.Combat.endTurn();
    const g = f.foes[0];
    t.ok(g.x === 4 && g.y === 4 && (has(g, 'burn') || g.hp < 42 - 7), 'rooted in the fire, it burns (' + g.hp + ' HP, Burn ' + stacks(g, 'burn') + ')');
  });

  // ---- signature --------------------------------------------------------------------------------------------------------
  T.suite('hero_kiri: Rain from the Other Side — 16 to every foe within 2, ignoring Block and armor', function (t) {
    const a = arena({ at: [1, 4], enemies: [E(5, 4, 'test_brute'), E(6, 5, 'test_grunt', 2), E(5, 6, 'test_grunt', 2), E(7, 4, 'test_grunt', 2), E(8, 4, 'test_grunt', 2)],
      heroes: [{ id: 'test_knight', x: 4, y: 4 }], terrain: { '3,3': 'wall', '3,5': 'wall', '2,4': 'wall' } });
    const k = a.k, f = a.foes, sig = k.signature;
    DD.Combat.state.hype = 99;
    t.eq(DD.Combat.canUse(k, sig), 'Needs 100 Hype.', 'needs 100 Hype');
    DD.Combat.state.hype = 100;
    DD.Act.addBlock(f[0], 6);
    t.ok(valid(k, sig, 5, 4) && !valid(k, sig, 8, 4), 'a tile within 6 (walled in, she still aims)');
    use(t, k, sig, 5, 4, 'signature');
    t.ok(f[0].hp === 50 - 16 && f[0].block === 6, 'the armored brute behind 6 Block takes the full 16');
    t.eq([f[1].hp, f[2].hp, f[3].hp, f[4].hp].join(','), '12,12,12,28', 'every foe within 2 takes 16, the one 3 away none');
    t.eq(at(4, 4).hp, at(4, 4).maxHp, 'the ally in the area is spared');
    hypeIs(t, DD.Combat.state.hype, hype().multiHit, 'Hype spent (then +' + hype().multiHit + ' for hitting several)');
    t.eq(k.ap, 1, '2 AP');
  });

  // ---- items ------------------------------------------------------------------------------------------------------------
  T.suite('hero_kiri: items — Ghostwood Longbow, the Name Tag, Cloak of Being Somewhere Else', function (t) {
    ['kir_ghostwood_bow', 'kir_name_tag', 'kir_cloak_elsewhere'].forEach(function (id) {
      const it = DD.getItem(id);
      t.ok(it && it.hero === 'kiri' && it.desc && it.flavor && it.flavor.length <= 120, id + ' registered for Kiri');
      t.ok(!it.stats.block, id + ': no combat-start Block (v2)');
    });
    const bow = arena({ at: [1, 4], items: ['kir_ghostwood_bow'], skills: [['kir_phase', 1], ['kir_step', 1]], enemies: [E(7, 4)] });
    t.ok(valid(bow.k, bow.k.basic, 7, 4), 'Longbow: Ghost Arrow reaches 6');
    t.ok(valid(bow.k, bow.slot('kir_step'), 5, 4) && !valid(bow.k, bow.slot('kir_step'), 6, 4), 'Longbow: Ethereal Step I goes up to 3 + 1 tiles');
    const line = DD.Targeting.area(bow.k, sk('kir_phase'), 1, { x: 7, y: 4 });
    t.ok(valid(bow.k, bow.slot('kir_phase'), 7, 4) && line.length === 6 && line[5].x === 7, 'Longbow: Phase Shot\'s line is 5 + 1 tiles and reaches the aimed tile');
    use(t, bow.k, bow.k.basic, 7, 4, 'bow shot');
    t.eq(bow.foes[0].hp, 14 - Math.round(5 * 1.1), 'Longbow: +10% damage (5 → ' + Math.round(5 * 1.1) + ')');
    use(t, bow.k, bow.slot('kir_phase'), 7, 4, 'bow phase shot');
    t.eq(bow.foes[0].hp, 14 - 6 - Math.round(4 * 1.1), 'Longbow: Phase Shot hits the foe 6 tiles away (4 +10% → ' + Math.round(4 * 1.1) + ')');
    const tag = arena({ at: [1, 4], items: ['kir_name_tag'] });
    t.ok(tag.k.init === 5 && tag.k.maxHp === 28, 'Name Tag: initiative +3 → +5, 28 max HP');
    const cl = arena({ at: [1, 4], items: ['kir_cloak_elsewhere'], skills: [['kir_step', 1], ['kir_phase', 1]] });
    t.ok(cl.k.maxHp === 30 && cl.k.armor === 1, 'Cloak: +6 max HP, +1 armor');
    t.eq(DD.Combat.costOf(cl.k, sk('kir_step'), 1).ap, 0, 'Cloak: Ethereal Step costs 0 AP');
    t.eq(DD.Combat.costOf(cl.k, sk('kir_phase'), 1).ap, 1, 'Cloak: other skills cost as usual (Phase Shot 1)');
    use(t, cl.k, cl.slot('kir_step'), 4, 4, 'free step');
    t.ok(cl.k.x === 4 && cl.k.ap === 3, 'a free step');
    // in a rolled fight her initiative modifier is +3 (+2 with the tag)
    const rh = DD.Combat.makeRunHero({ id: 'kiri', level: 1, items: ['kir_name_tag'] });
    DD.Combat.start({ grid: DD.Combat.emptyGrid(8, 8), heroes: [{ runHero: rh, x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] }, { seed: 5, headless: true, initiative: 'roll' });
    const e = DD.Combat.state.order.filter(function (o) { return DD.Combat.byId(o.unitId).defId === 'kiri'; })[0];
    t.ok(e && e.init === 5 && e.total === e.roll + 5, 'rolled initiative: d20 + 5');
  });

  // ---- previews -------------------------------------------------------------------------------------------------------
  T.suite('hero_kiri: previews match reality for every skill at every level', function (t) {
    const cases = [
      { id: 'kir_basic', lv: 1, at: [1, 4], tg: [4, 4], enemies: [E(4, 4)], terrain: { '2,4': 'wall' } },
      { id: 'kir_basic', lv: 1, at: [1, 4], tg: [4, 4], enemies: [E(4, 4)], hp: 3, note: 'lethal' },
      { id: 'kir_phase', tg: [2, 4], enemies: [E(2, 4), E(4, 4), E(5, 4)], terrain: { '3,4': 'wall' }, low: 1 },
      { id: 'kir_step', tg: [4, 4], terrain: { '2,4': 'wall', '4,4': 'water' }, enemies: [E(3, 4)] },
      { id: 'kir_mark', tg: [4, 4], enemies: [E(4, 4)] },
      { id: 'kir_pin', tg: [4, 4], enemies: [E(4, 4)] },
      { id: 'kir_banish', tg: [3, 4], enemies: [E(3, 4)], terrain: { '4,4': 'pit' } },
      { id: 'kir_banish', tg: [3, 4], enemies: [E(3, 4)], terrain: { '5,4': 'lava' } },
      { id: 'kir_volley', tg: [5, 4], enemies: [E(5, 4), E(6, 4), E(5, 5)], heroes: [{ id: 'test_knight', x: 4, y: 4 }] },
      { id: 'kir_beyond', tg: [5, 4], enemies: [E(5, 4)] },
      { id: 'kir_fade', tg: [1, 4], enemies: [E(5, 4)] },
      { id: 'kir_mist', tg: [4, 4], enemies: [E(5, 4)] },
      { id: 'kir_signature', lv: 1, tg: [5, 4], enemies: [E(5, 4), E(6, 4), E(5, 5, 'test_brute')] },
    ];
    let n = 0;
    cases.forEach(function (c) {
      const lvs = c.lv ? [c.lv] : [1, 2, 3];
      lvs.forEach(function (lv) {
        const pool = POOL.indexOf(c.id) >= 0;
        const a = arena({ at: c.at || [1, 4], skills: pool ? [[c.id, lv]] : [], enemies: c.enemies, heroes: c.heroes, terrain: c.terrain });
        if (c.hp) a.foes[0].hp = c.hp;
        if (c.low) a.foes[0].hp = 2;
        const slot = c.id === 'kir_basic' ? a.k.basic : c.id === 'kir_signature' ? a.k.signature : a.slot(c.id);
        if (c.id === 'kir_signature') DD.Combat.state.hype = 100;
        previewThenUse(t, a.k, slot, c.tg[0], c.tg[1], c.id + ' L' + lv + (c.note ? ' ' + c.note : ''));
        n++;
      });
    });
    t.log('previews checked: ' + n);
    // the HUD's preview of Arrow from Beyond tells what is coming
    const a = arena({ at: [1, 4], skills: [['kir_beyond', 2]], enemies: [E(5, 4)] });
    const prev = DD.Combat.preview(a.k, a.slot('kir_beyond'), 5, 4);
    const e = prev.perUnit[a.foes[0].id];
    t.ok(e && e.dmg === 0 && e.statuses.indexOf('kir_incoming') >= 0 && /Foreshadowed 22/.test(e.text), 'Arrow from Beyond preview: "' + (e && e.text) + '"');
    // the status reads as a state in the log, like every status ("… is Rooted.")
    const n0 = DD.Combat.state.log.length;
    use(t, a.k, a.slot('kir_beyond'), 5, 4, 'arrow for the log');
    const lines = DD.Combat.state.log.slice(n0).map(function (l) { return l.text; });
    t.ok(lines.some(function (l) { return /^Test Grunt is Foreshadowed \(22\)\.$/.test(l); }), 'log: "Test Grunt is Foreshadowed (22)." (' + lines.join(' | ') + ')');
  });

  // ---- v2 edge cases ----------------------------------------------------------------------------------------------------
  T.suite('hero_kiri: v2 edge cases (stunned, silenced, sheep, charmed, AP, turn order)', function (t) {
    // stunned by an enemy on its turn: her next turn passes with 0 AP
    const st = arena({ at: [1, 4], skills: [['kir_phase', 1]], enemies: [E(2, 4)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    onTurns(function (u) { return u.side === 'enemy'; }, function () { if (DD.Combat.state.round === 1) DD.Act.addStatus(st.k, 'stun', { turns: 1 }, st.foes[0]); }, function () {
      DD.Combat.endTurn(); DD.Combat.endTurn();
    });
    t.ok(DD.Combat.state.round === 2 && DD.Combat.current() && DD.Combat.current().defId === 'test_knight', 'stunned: her round-2 turn passed by itself');
    t.ok(st.k.ap === 0 && DD.Combat.canUse(st.k, st.k.basic) !== true, 'no AP, no skills');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === st.k && st.k.ap === 3 && !has(st.k, 'stun'), 'round 3: back to normal');
    // silenced: no spells — and she has none
    const si = arena({ at: [1, 4], skills: POOL.slice(0, 4).map(function (id) { return [id, 1]; }), enemies: [E(4, 4)] });
    DD.Act.addStatus(si.k, 'silenced', { turns: 1 }, si.foes[0]);
    DD.Combat.slotsOf(si.k).filter(function (sl) { return sl !== si.k.signature; }).forEach(function (sl) {
      t.eq(DD.Combat.canUse(si.k, sl), true, 'silenced: ' + sl.id + ' still works (arrows and steps are not spells)');
    });
    POOL.concat(['kir_basic', 'kir_signature']).forEach(function (id) { t.ok(sk(id).kind !== 'spell', id + ' is not a spell'); });
    // sheep: no skills
    const sh = arena({ at: [1, 4], skills: [['kir_step', 1]], enemies: [E(4, 4)] });
    DD.Act.addStatus(sh.k, 'sheep', { turns: 1 }, sh.foes[0]);
    t.ok(/Baa/.test(String(DD.Combat.canUse(sh.k, sh.k.basic))) && /Baa/.test(String(DD.Combat.canUse(sh.k, sh.slot('kir_step')))), 'sheep: baa');
    // charmed by the grunt: −1 AP next turn, and her arrows can't hurt the charmer (not even from beyond)
    const ch = arena({ at: [1, 4], skills: [['kir_beyond', 1]], enemies: [E(4, 4, 'test_grunt', 3), E(4, 6, 'test_grunt', 3)] });
    use(t, ch.k, ch.slot('kir_beyond'), 4, 4, 'arrow at the future charmer');
    onTurns(function (u) { return u === ch.foes[0]; }, function () { DD.Act.addStatus(ch.k, 'charmed', { turns: 1 }, ch.foes[0]); }, function () { DD.Combat.endTurn(); });
    t.ok(DD.Combat.current() === ch.k && ch.k.ap === 2, 'charmed: 2 AP on her turn');
    t.eq(ch.foes[0].hp, 42, 'the arrow from beyond cannot hurt her charmer');
    use(t, ch.k, ch.k.basic, 4, 4, 'charmed shot');
    t.eq(ch.foes[0].hp, 42, 'neither can Ghost Arrow');
    use(t, ch.k, ch.k.basic, 4, 6, 'charmed shot at the other one');
    t.eq(ch.foes[1].hp, 37, 'the other grunt is fair game');
    // not enough AP / not her turn
    const ap = arena({ at: [1, 4], skills: [['kir_beyond', 1], ['kir_phase', 1]], enemies: [E(4, 4)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    use(t, ap.k, ap.k.basic, 4, 4, 'one shot first');
    t.eq(DD.Combat.canUse(ap.k, ap.slot('kir_beyond')), 'Not enough AP.', '2 AP left: Arrow from Beyond needs 3');
    DD.Combat.endTurn();
    t.ok(/Not Kiri's turn/.test(String(DD.Combat.canUse(ap.k, ap.k.basic))), 'on the knight\'s turn she waits');
    // Dazzled (hero: −1 max range): Phase Shot's line shrinks with its range, so it still ends on the aimed tile
    const dz = arena({ at: [1, 4], skills: [['kir_phase', 1]], enemies: [E(5, 4), E(6, 4)] });
    DD.Act.addStatus(dz.k, 'dazzled', { turns: 1 }, dz.foes[0]);
    t.ok(valid(dz.k, dz.slot('kir_phase'), 5, 4) && !valid(dz.k, dz.slot('kir_phase'), 6, 4), 'dazzled: Phase Shot aims 4 tiles');
    use(t, dz.k, dz.slot('kir_phase'), 5, 4, 'dazzled phase shot');
    t.ok(dz.foes[0].hp === 14 - 4 && dz.foes[1].hp === 14, 'dazzled: the line is 4 tiles (the foe 5 away is spared)');
    // targets dying mid-skill: a Phase Shot line where the first foe dies keeps going
    const dy = arena({ at: [1, 4], skills: [['kir_phase', 1]], enemies: [E(2, 4), E(3, 4)] });
    dy.foes[0].hp = 2;
    use(t, dy.k, dy.slot('kir_phase'), 2, 4, 'dying line');
    t.ok(dy.foes[0].dead && dy.foes[1].hp === 14 - 4, 'the first foe dies, the arrow carries on');
    // a Volley that kills a whole cluster ends the fight cleanly
    const vk = DD.Combat.sandbox({ w: 9, h: 9, seed: 3, enemyAi: false, heroes: [{ id: 'kiri', x: 1, y: 4, skills: [{ id: 'kir_volley', level: 3 }] }],
      enemies: [{ id: 'test_minion', x: 5, y: 4 }, { id: 'test_minion', x: 5, y: 5 }] });
    const vkk = vk.units[0];
    use(t, vkk, DD.Combat.slotsOf(vkk).filter(function (sl) { return sl.id === 'kir_volley'; })[0], 5, 4, 'final volley');
    t.eq(vk.result, 'victory', 'killing the last foes mid-skill wins the fight');
    // initiative +3 from the def; v2 turn model: she acts on her own initiative slot
    t.eq(DD.Combat.initOf ? DD.Combat.initOf(arena({ at: [1, 4] }).k) : 3, 3, 'initiative modifier +3');
  });

  // ---- attacks of opportunity (DESIGN §4.2) ---------------------------------------------------------------------------
  T.suite('hero_kiri: attacks of opportunity — walking off a foe provokes; Ethereal Step, Fade Out and pushes slip away; her bow never strikes', function (t) {
    const seen = [];
    const off = DD.Events.on('opportunity:attack', function (e) { seen.push(e.attacker.defId + '>' + e.mover.defId); });
    const barks = [];
    const mb = DD.Act.maybeBark;
    DD.Act.maybeBark = function (u, key) { if (u && u.defId === 'kiri') barks.push(key); return mb.apply(this, arguments); };
    const fresh = function () { seen.length = 0; barks.length = 0; };
    try {
      // walking off the grunt next to her: one free stab on the way out (the move preview says so), and no undo
      let a = arena({ at: [3, 4], enemies: [E(4, 4)] });
      let k = a.k, g = a.foes[0];
      t.eq(DD.Act.opportunitySlot(k), null, 'a ranged basic: Kiri never makes attacks of opportunity');
      const pv = DD.Combat.provokes(k, 0, 4);
      t.ok(pv.length === 1 && pv[0].unitId === g.id && pv[0].dmg === 4, 'move preview: provokes the grunt (4) (' + JSON.stringify(pv) + ')');
      fresh();
      t.ok(DD.Combat.move(k, 0, 4), 'she walks off');
      t.ok(k.hp === k.maxHp - 4 && k.x === 0 && k.y === 4, 'stabbed for 4 on the way out, and she kept going (' + k.x + ',' + k.y + ', ' + k.hp + ' HP)');
      t.eq(seen.join(' '), 'test_grunt>kiri', 'exactly one attack of opportunity');
      t.ok(barks.indexOf('provoked') >= 0, 'her passive asks for a "provoked" bark');
      t.eq(g.oppRound, DD.Combat.state.round, 'the grunt has spent its attack of opportunity for the round');
      t.eq(DD.Combat.canUndo(), false, 'a move that provoked can\'t be undone');
      // walking up to a foe never provokes; an ordinary hit is not "provoked"
      a = arena({ at: [1, 4], enemies: [E(4, 4)] });
      fresh();
      t.ok(DD.Combat.move(a.k, 3, 4) && seen.length === 0 && a.k.hp === a.k.maxHp, 'walking up next to it: nothing');
      DD.Act.damage(a.foes[0], a.k, 4, { cause: 'skill' });
      t.ok(a.k.hp === a.k.maxHp - 4 && barks.indexOf('provoked') < 0, 'a plain stab: no "provoked" bark');
      // Ethereal Step is a teleport: out of a pincer without a scratch...
      a = arena({ at: [3, 4], skills: [['kir_step', 1]], enemies: [E(4, 4), E(3, 5)] });
      k = a.k;
      t.eq(DD.Act.provokers(k, [{ x: 3, y: 3 }]).length, 2, 'walking out, she would provoke both grunts');
      fresh();
      use(t, k, a.slot('kir_step'), 3, 1, 'step out of the pincer');
      t.ok(k.x === 3 && k.y === 1 && k.hp === k.maxHp && seen.length === 0, 'stepped out: no attack of opportunity');
      // ...straight through the grunt and out the other side...
      a = arena({ at: [3, 4], skills: [['kir_step', 1]], enemies: [E(4, 4)] });
      fresh();
      use(t, a.k, a.slot('kir_step'), 6, 4, 'step through the grunt');
      t.ok(a.k.x === 6 && a.k.hp === a.k.maxHp && seen.length === 0 && a.foes[0].oppRound !== DD.Combat.state.round, 'through it: no swing, its reaction unspent');
      // ...and while Rooted next to it (no move action at all)
      a = arena({ at: [3, 4], skills: [['kir_step', 1]], enemies: [E(4, 4)] });
      DD.Act.addStatus(a.k, 'root', { turns: 1 }, a.foes[0]);
      t.eq(DD.Combat.reachable(a.k).size, 0, 'Rooted: she cannot walk anywhere');
      fresh();
      use(t, a.k, a.slot('kir_step'), 3, 1, 'rooted step');
      t.ok(a.k.y === 1 && a.k.hp === a.k.maxHp && seen.length === 0, 'Rooted, she still steps away untouched');
      // Fade Out: a Stealthed Kiri slips away on foot
      a = arena({ at: [3, 4], skills: [['kir_fade', 1]], enemies: [E(4, 4)] });
      k = a.k;
      t.eq(DD.Combat.provokes(k, 0, 4).length, 1, 'before: walking off provokes the grunt');
      use(t, k, a.slot('kir_fade'), 3, 4, 'fade');
      t.eq(DD.Combat.provokes(k, 0, 4).length, 0, 'Stealthed: the move preview provokes nobody');
      fresh();
      t.ok(DD.Combat.move(k, 0, 4) && seen.length === 0 && k.hp === k.maxHp && has(k, 'stealth'), 'she walks off untouched, still Stealthed');
      // Banishing Shot: push the grunt off her, then walk away for free
      a = arena({ at: [3, 4], skills: [['kir_banish', 1]], enemies: [E(4, 4)] });
      k = a.k; g = a.foes[0];
      fresh();
      use(t, k, a.slot('kir_banish'), 4, 4, 'banish the grunt off her');
      t.ok(g.x === 6 && seen.length === 0, 'a push is not a move action: no attack of opportunity');
      t.eq(DD.Combat.provokes(k, 0, 4).length, 0, 'the walk provokes nobody now');
      t.ok(DD.Combat.move(k, 0, 4) && seen.length === 0 && k.hp === k.maxHp, 'she walks off for free');
      // ...and pushing a foe out of the knight's reach gives the knight no free slash either
      a = arena({ at: [1, 4], skills: [['kir_banish', 1]], enemies: [E(4, 4)], heroes: [{ id: 'test_knight', x: 4, y: 5 }] });
      g = a.foes[0];
      const knight = at(4, 5);
      t.ok(DD.Act.provokers(g, [{ x: 4, y: 3 }]).indexOf(knight) >= 0, 'walking off, the grunt would provoke the knight');
      fresh();
      use(t, a.k, a.slot('kir_banish'), 4, 4, 'banish the grunt off the knight');
      t.ok(g.x === 6 && g.hp === 14 - 3 && seen.length === 0 && knight.oppRound !== DD.Combat.state.round, 'pushed away: no slash on the way');
      // Pinning Shot stops its walk, not its swing: Root is no escape for her
      a = arena({ at: [3, 4], skills: [['kir_pin', 1]], enemies: [E(4, 4, 'test_grunt', 3)] });
      k = a.k;
      use(t, k, a.slot('kir_pin'), 4, 4, 'pin the grunt next to her');
      fresh();
      t.ok(DD.Combat.move(k, 2, 4) && seen.join(' ') === 'test_grunt>kiri' && k.hp === k.maxHp - 4, 'a Rooted grunt still stabs her as she walks off (' + seen.join(' ') + ')');
      // a foe walking off Kiri gets nothing from her bow; walking off the knight beside her costs it a slash
      a = arena({ at: [3, 4], enemies: [E(4, 4)] });
      g = a.foes[0];
      fresh();
      DD.AI.moveTo(g, 7, 4);
      t.ok(g.x !== 4 && g.hp === 14 && seen.length === 0, 'it walks off Kiri untouched (to ' + g.x + ',' + g.y + ')');
      a = arena({ at: [3, 4], enemies: [E(4, 4)], heroes: [{ id: 'test_knight', x: 4, y: 5 }] });
      g = a.foes[0];
      fresh();
      DD.AI.moveTo(g, 7, 4);
      t.ok(seen.join(' ') === 'test_knight>test_grunt' && g.hp === 14 - 5, 'walking off both: the knight slashes, Kiri does not (' + seen.join(' ') + ')');
      // AutoPlay: wounded between a rooted brute and a rooted grunt (every walk off provokes both, lethally), she steps out
      a = arena({ at: [4, 5], level: 3, skills: [['kir_step', 1], ['kir_phase', 1]], enemies: [E(5, 5, 'test_brute'), E(4, 4, 'test_grunt', 3)] });
      k = a.k;
      k.hp = 9;
      a.foes.forEach(function (f) { DD.Act.addStatus(f, 'root', { turns: 1 }, k); });
      const away = DD.Combat.reachable(k).get('1,5');
      t.ok(away && away.provokes.length === 2, 'premise: walking off provokes both (' + (away && away.provokes.length) + ')');
      fresh();
      DD.AutoPlay.takeTurn();
      t.ok(a.slot('kir_step').cd > 0, 'AutoPlay uses Ethereal Step');
      t.ok(seen.length === 0 && !k.downed && k.hp === 9 && DD.Grid.dist(k, a.foes[0]) > 1 && DD.Grid.dist(k, a.foes[1]) > 1,
        'and gets out of reach without provoking anything (' + k.x + ',' + k.y + ')');
      if (T.contentHelpers && T.contentHelpers.sanity) T.contentHelpers.sanity(t, 'attacks of opportunity');
    } finally { off(); DD.Act.maybeBark = mb; }
  });

  // ---- AutoPlay ---------------------------------------------------------------------------------------------------------
  T.suite('hero_kiri: AutoPlay battles at levels 1 / 3 / 5 (party Kiri + fixture knight, cleric, mage)', function (t) {
    const loadouts = {
      1: [['kir_phase', 1], ['kir_step', 1]],
      3: [['kir_phase', 2], ['kir_pin', 1], ['kir_beyond', 1], ['kir_mark', 1]],
      '3b': [['kir_volley', 1], ['kir_banish', 1], ['kir_fade', 1], ['kir_mist', 1]],
      5: [['kir_phase', 2], ['kir_pin', 2], ['kir_beyond', 2], ['kir_volley', 2]],
      '5b': [['kir_mark', 2], ['kir_banish', 2], ['kir_fade', 2], ['kir_step', 2]],
    };
    const fights = [[1, 1, 'normal'], [1, 1, 'elite'], [1, 1, 'boss'], [2, 3, 'normal'], [2, '3b', 'elite'], [2, 3, 'boss'],
      [3, 5, 'normal'], [3, '5b', 'elite'], [3, 5, 'boss'], [1, '3b', 'normal'], [2, '5b', 'normal'], [3, '3b', 'normal']];
    const used = {};
    const orig = DD.Combat.useSkill;
    const results = [];
    let wins = 0, aoo = 0;
    const offAoo = DD.Events.on('opportunity:attack', function (e) { if (e.mover && e.mover.defId === 'kiri') aoo++; });
    DD.Combat.useSkill = function (unit, slot) {
      const r = orig.apply(this, arguments);
      if (r && unit && slot && unit.defId === 'kiri') used[slot.id] = (used[slot.id] || 0) + 1;
      return r;
    };
    try {
      fights.forEach(function (f, i) {
        const act = f[0], key = f[1], kind = f[2], lvl = parseInt(key, 10);
        const enc = DD.getEncounter('test_a' + act + '_' + kind);
        if (!enc) { t.fail('fixture encounter missing: test_a' + act + '_' + kind); return; }
        const party = ['kiri', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
          if (id === 'kiri') return DD.Combat.makeRunHero({ id: id, level: lvl, skills: loadouts[key].map(function (e) { return { id: e[0], level: e[1] }; }) });
          const h = DD.getHero(id);
          return DD.Combat.makeRunHero({ id: id, level: lvl, skills: h.skillPool.slice(0, 4).map(function (sid) { return { id: sid, level: Math.min(3, 1 + Math.floor(lvl / 3)) }; }) });
        });
        const seed = (Number(t.seed) || 1) * 37 + (i + 1) * 7919;
        const setup = DD.Encounter.build(enc, party, { rng: DD.RNG(seed), difficulty: 'normal', act: act });
        DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: kind });
        const r = DD.AutoPlay.runBattle(30);
        const s = DD.Combat.state;
        const k = s.units.filter(function (u) { return u.defId === 'kiri'; })[0];
        t.ok(k && isFinite(k.hp) && k.hp >= 0 && k.hp <= k.maxHp, enc.id + ' L' + lvl + ': Kiri sane');
        t.ok(!!s.order && s.order.length > 0, enc.id + ': initiative rolled');
        t.ok(r.result === 'victory' || r.result === 'defeat' || r.timeout, enc.id + ' L' + lvl + ': the battle ends (' + r.result + ', ' + r.rounds + ' rounds)');
        if (r.result === 'victory') wins++;
        results.push(enc.id + ' L' + key + ': ' + (r.result || 'timeout') + ' in ' + r.rounds + ' (Kiri ' + (k.downed ? 'downed' : k.hp + '/' + k.maxHp) +
          ', dealt ' + ((s.stats.units[k.id] || {}).dmg || 0) + ')');
      });
      // a full Hype bar and a cluster of foes in reach: AutoPlay calls down the rain (deterministic sandbox turn)
      const a = arena({ at: [1, 4], level: 5, enemies: [E(5, 3, 'test_grunt', 2), E(5, 5, 'test_grunt', 2), E(6, 4, 'test_grunt', 2), E(4, 4, 'test_grunt', 2)] });
      a.s.hype = 100;
      const before = used.kir_signature || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.kir_signature || 0) > before, 'AutoPlay uses Rain from the Other Side with 100 Hype and 4 foes in reach');
      // three grunts lined up behind a wall: AutoPlay pierces them all with Phase Shot (12 damage + Hype for 1 AP)
      const ln = arena({ at: [1, 4], level: 3, skills: [['kir_phase', 1], ['kir_step', 1]], enemies: [E(3, 4), E(4, 4), E(5, 4)], terrain: { '2,4': 'wall' } });
      const ph0 = used.kir_phase || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.kir_phase || 0) > ph0 && ln.foes.every(function (f) { return f.hp < 14; }), 'AutoPlay pierces three lined-up grunts with Phase Shot');
      // a grunt on the lip of a pit: AutoPlay banishes it (an environmental kill beats any arrow)
      const p = arena({ at: [1, 4], level: 3, skills: [['kir_banish', 1], ['kir_phase', 1]], enemies: [E(4, 4), E(7, 7)], terrain: { '5,4': 'pit' } });
      const b0 = used.kir_banish || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.kir_banish || 0) > b0 && p.foes[0].dead, 'AutoPlay banishes a grunt into the pit behind it');
    } finally { DD.Combat.useSkill = orig; offAoo(); }
    t.log(results.join(' | '));
    t.log('Kiri skill uses: ' + Object.keys(used).map(function (k) { return k + '×' + used[k]; }).join(', '));
    t.log('attacks of opportunity on Kiri: ' + aoo);
    t.ok((used.kir_basic || 0) > 0, 'Ghost Arrow used');
    t.ok((used.kir_phase || 0) > 0, 'Phase Shot used');
    const poolUsed = Object.keys(used).filter(function (k) { return POOL.indexOf(k) >= 0; });
    t.ok(poolUsed.length >= 6, 'at least 6 different pool skills used by AutoPlay (' + poolUsed.join(', ') + ')');
    t.ok(wins >= 9, 'the party wins most fixture fights (' + wins + '/' + fights.length + ')');
  });

  // ---- v2 requests (Nov 3): clouds, barrels ---------------------------------------------------------------------------
  T.suite('hero_kiri: v2 requests — Ghost Mist is a cloud (it hangs over pits and lava), her arrows set barrels off through walls, Arrow from Beyond is for foes only', function (t) {
    t.ok(DD.getSurface('kir_ghost_mist').airborne === true, 'Ghost Mist is airborne (a cloud, not a floor surface)');
    // 1. over a pit and lava: the mist hangs there too, so a pit is no hole in it
    const a = arena({ at: [1, 4], skills: [['kir_mist', 1]], terrain: { '4,4': 'pit', '4,2': 'lava' },
      enemies: [E(6, 4, 'test_archer')], heroes: [{ id: 'test_cleric', x: 2, y: 4 }] });
    const archer = a.foes[0];
    t.ok(DD.Targeting.validTargets(archer, sk('test_arrow')).some(function (p) { return p.x === 2 && p.y === 4; }), 'before: the archer shoots the cleric across the pit');
    use(t, a.k, a.slot('kir_mist'), 4, 3, 'mist next to the pit');
    t.eq(surf(4, 4), 'kir_ghost_mist', 'the mist hangs over the pit');
    t.eq(surf(4, 2), 'kir_ghost_mist', 'and over the lava');
    t.ok(surf(3, 4) === null && surf(5, 4) === null, 'premise: on the archer\'s line, only the pit is misted');
    t.ok(!DD.Targeting.validTargets(archer, sk('test_arrow')).some(function (p) { return p.x === 2 && p.y === 4; }), 'after: the misted pit blocks its sight');
    // 2. barrels: Ghost Arrow sets one off behind a wall (Between Worlds); Arrow from Beyond can't be aimed at one
    const b = arena({ at: [1, 4], skills: [['kir_beyond', 1], ['kir_pin', 1]], terrain: { '3,4': 'wall' },
      objects: [{ x: 4, y: 4, id: 'barrel_explosive' }], enemies: [E(5, 4, 'test_grunt', 3), E(8, 8)] });
    const g = b.foes[0], g0 = g.hp;
    const objTargets = function (slot) { return DD.Targeting.validTargets(b.k, slot).filter(function (q) { return !!q.obj; }); };
    t.ok(objTargets(b.k.basic).some(function (q) { return q.x === 4 && q.y === 4; }), 'Ghost Arrow can be aimed at the barrel behind the wall');
    t.ok(objTargets(b.slot('kir_pin')).length === 1, 'so can Pinning Shot');
    t.eq(objTargets(b.slot('kir_beyond')).length, 0, 'Arrow from Beyond can\'t (it lands next turn: foes only)');
    t.ok(!valid(b.k, b.slot('kir_beyond'), 4, 4), '...and isValidTarget agrees');
    const prev = previewThenUse(t, b.k, b.k.basic, 4, 4, 'Ghost Arrow at the barrel');
    t.eq(prev.detonates, 'barrel_explosive', 'the preview detonates it');
    t.ok(!DD.Grid.tile(4, 4).obj && g.hp < g0, 'it went off: the grunt next to it takes the blast');
    t.eq(b.k.ap, 2, '1 AP');
  });
})();
