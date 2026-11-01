/* Dungeons and Degenerates — js/data/bosses/beholder.js
 * Act 2 boss: DR. IRIS, Beholder Optometrist (enemy 'dr_iris', encounter 'boss_dr_iris').
 * Arena "The Optometry Wing": she floats, immovable, on her exam chair in the middle of the clinic; Exam Mirrors stand
 * on (and around) her four lines of sight, pillars give cover.
 * Custom planner — 3-ray-wide eye beams every turn in a clockwise lighthouse (2 lines, 3 below half HP; a line that
 * already bounces back at her is skipped) plus a rotation, all planned BEFORE the beams:
 *   phase 1: Eye Exam (giant tumbling "E" telegraph, ⏳1) → Anti-Magic Cone (Silence) → Disintegrate (tracking, ⏳2) +
 *   floaters → Anti-Magic Cone;  phase 2 (≤ 50%): double Eye Exam → cone + floaters → Disintegrate.
 * Clinical Gaze (status 'iris_gaze', live numbers in its desc): at the end of her turn every hero she can see (6 tiles)
 * takes 8 (10 in phase 2, when her X-ray vision sees through pillars but not mirrors); from round 8 it reaches 1 tile
 * farther a round, and from round 12 ("closing time") it ignores all cover and grows by 2 a round, so no fight can stall.
 * Puzzle: beams are traced through the room (pillars/walls stop them, mirrors re-emit them the way they face). Turn a
 * mirror (core 'mirror' object, 1 AP, at most two quarter turns per mirror per round) so a beam comes back into her:
 * 24 damage to HER and she flinches out of her remaining beams; next planning she spins that mirror around (two turns
 * to line it up again). The telegraph tiles follow the mirrors live. A stun buys her 3 turns of Squinting.
 * Public helpers: DD.Act2Bosses.iris.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const TAU = Math.PI * 2;

  // ---- numbers (DESIGN §5, Act 2 boss: HP 260-320, hits 10-14, big telegraphs 22-30) ----------------------------
  const N = {
    hp: 280, beam: 13, reflect: 24, exam: 14, cone: 7, coneLen: 4, disintegrate: 26, disRange: 12,
    floaterCap: 3, floaterHp: 12, floaterDmg: 4, gaze: 8, gaze2: 10, gazeRange: 6, overtime: 7, closing: 11,
  };
  const IRIS = 'dr_iris';
  const DIRS = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
  const ORDER = ['N', 'E', 'S', 'W'];

  // ---- small helpers -------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function S() { return DD.Combat && DD.Combat.state; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  function key(x, y) { return x + ',' + y; }
  function units() { const s = S(); return s ? s.units : []; }
  function findIris() { return units().filter(function (u) { return u.defId === IRIS && !u.dead; })[0] || null; }
  function irisData(u) {
    if (!u.data.iris) u.data.iris = { turn: 0, phase: 1, rot: 0, exam: 0, burned: [] };
    return u.data.iris;
  }
  function fightData() {
    const s = S();
    if (!s) return { reflections: 0, rotations: 0, flinches: 0 };
    s.data = s.data || {};
    if (!s.data.iris) s.data.iris = { reflections: 0, rotations: 0, flinches: 0 };
    return s.data.iris;
  }
  function heroFoes(u) { return units().filter(function (o) { return active(o) && G().hostile(u, o) && !has(o, 'stealth'); }); }
  function aliveOf(defId) { return units().filter(function (u) { return u.defId === defId && active(u); }); }
  function dirName(d) { return d.x > 0 ? 'E' : d.x < 0 ? 'W' : d.y > 0 ? 'S' : 'N'; }
  function facingOf(o) {
    const f = o && (o.data && o.data.facing !== undefined ? o.data.facing : o.facing);
    return DIRS[f] || DIRS.N;
  }
  function setFacing(o, f) { o.data.facing = f; o.facing = f; }
  function rotName(f, k) { const i = ORDER.indexOf(f); return ORDER[(((i < 0 ? 0 : i) + k) % 4 + 4) % 4]; }
  function isMirror(t) { return !!(t && t.obj && t.obj.id === 'mirror'); }

  // telegraph numbers: the planner never passes an explicit dmg, so DD.AI.intentDmg shows them live (Weak applied
  // after planning, or running out before a ⏳ attack lands, changes the number on the board at once)

  // ---- beam tracing ----------------------------------------------------------------------------------------------
  /**
   * Trace one ray from `from` (exclusive) in `dir`: walls and blocking objects (pillars, chairs...) stop it, units don't
   * (it pierces), Exam Mirrors re-emit it the way they face. `home` (default `from`) is Dr. Iris's tile: a ray that comes
   * back into it ends there with self = true (the tile is included). Returns { tiles, self, mirrors: ['x,y'], segs: [{a, b}] }.
   */
  function traceRay(from, dir, home) {
    const out = { tiles: [], self: false, mirrors: [], segs: [] };
    const s = S();
    if (!s || !from || !dir || (!dir.x && !dir.y)) return out;
    home = home || from;
    const seen = {};
    let x = from.x, y = from.y, d = { x: dir.x, y: dir.y };
    let a = { x: x, y: y };
    for (let step = 0; step < 90; step++) {
      const nx = x + d.x, ny = y + d.y;
      if (!G().inBounds(nx, ny)) break;
      const t = G().tile(nx, ny);
      const td = G().terrain(t);
      if (td.walkable === false && !td.pit && !td.liquid) break;
      if (nx === home.x && ny === home.y) {
        out.self = true;
        out.tiles.push({ x: nx, y: ny });
        x = nx; y = ny;
        break;
      }
      if (isMirror(t)) {
        const f = facingOf(t.obj);
        const k = key(nx, ny) + ':' + f.x + ',' + f.y;
        out.tiles.push({ x: nx, y: ny });
        if (out.mirrors.indexOf(key(nx, ny)) < 0) out.mirrors.push(key(nx, ny));
        out.segs.push({ a: a, b: { x: nx, y: ny } });
        x = nx; y = ny;
        if (seen[k]) { a = null; break; }
        seen[k] = 1;
        d = { x: f.x, y: f.y };
        a = { x: x, y: y };
        continue;
      }
      if (t.obj && G().objBlocksMove(t.obj)) break;
      out.tiles.push({ x: nx, y: ny });
      x = nx; y = ny;
    }
    if (a && (a.x !== x || a.y !== y)) out.segs.push({ a: a, b: { x: x, y: y } });
    return out;
  }
  /**
   * A full eye beam: three parallel rays — the central one from her tile and two side rays that start on the tiles
   * diagonally in front of her (part of the blast; the tiles beside her stay safe) — each traced through the mirrors.
   * Returns { tiles (deduped union), self (any ray came back into her), mirrors, segs, rays }.
   */
  function traceBeam(from, dir) {
    const out = { tiles: [], self: false, mirrors: [], segs: [], rays: [] };
    if (!from || !dir || (!dir.x && !dir.y)) return out;
    const seen = {};
    const add = function (p) { const k = key(p.x, p.y); if (!seen[k]) { seen[k] = 1; out.tiles.push({ x: p.x, y: p.y }); } };
    const side = { x: -dir.y, y: dir.x };
    const fx = from.x + dir.x, fy = from.y + dir.y;
    [{ x: from.x, y: from.y, center: true }, { x: fx + side.x, y: fy + side.y }, { x: fx - side.x, y: fy - side.y }].forEach(function (o) {
      if (!o.center && !openTile(o.x, o.y)) return;
      if (!o.center) add(o);
      const r = traceRay(o, dir, from);
      out.rays.push(r);
      r.tiles.forEach(add);
      if (r.self) out.self = true;
      r.mirrors.forEach(function (m) { if (out.mirrors.indexOf(m) < 0) out.mirrors.push(m); });
      r.segs.forEach(function (sg) { out.segs.push(sg); });
    });
    return out;
  }
  function beamArea(ctx) {
    if (!ctx || !ctx.user) return [];
    const dir = ctx.dir && (ctx.dir.x || ctx.dir.y) ? ctx.dir : { x: 0, y: 1 };
    return traceBeam(ctx.user, dir).tiles;
  }

  // ---- statuses --------------------------------------------------------------------------------------------------
  DD.registerStatus({
    id: 'iris_squint', name: 'Squinting', icon: '😑', color: '#d6c7ff', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 3,
    desc: function (st) {
      return 'Recovering from the last stun: can\'t be Stunned, Frozen or Charmed. Reflected beams still hurt.' +
        (st && st.turns > 0 ? ' (' + st.turns + ' turn' + (st.turns === 1 ? '' : 's') + ' left)' : '');
    },
  });
  const INCAPACITATE = { stun: 1, frozen: 1, charmed: 1 };
  // her end-of-turn gaze, shown on her as a status so the inspect panel always has the live numbers
  DD.registerStatus({
    id: 'iris_gaze', name: 'Clinical Gaze', icon: '🧐', color: '#ff9af5', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () {
      const g = gazeNow(findIris());
      const cover = g.cover === 2 ? 'Closing time: nothing blocks her view.' : g.cover === 1 ? 'X-ray vision: only mirrors block her view.' :
        'Pillars and mirrors block her view (below half HP only mirrors do).';
      return 'At the end of her turn every hero she can see within ' + g.range + ' tiles takes ' + g.dmg + ' damage. ' + cover +
        ' From round ' + (N.overtime + 1) + ' her reach grows by 1 a round; from round ' + (N.closing + 1) +
        ' nothing blocks it and it deals 2 more each round.';
    },
    // [autoplay fidelity] the gaze is not telegraphed: AutoPlay / the HUD read it here (threatAt, docs/notes/autoplay.md)
    hooks: { threatAt: function (unit, hero, tile) { return gazeThreat(unit, hero, tile); } },
  });

  // ---- reflection (the puzzle payoff) ------------------------------------------------------------------------------
  function creditFor(tr) {
    const s = S();
    let best = null, at = -1;
    tr.mirrors.forEach(function (k) {
      const p = k.split(',');
      const t = G().tile(+p[0], +p[1]);
      const o = t && t.obj;
      if (o && o.data && o.data.turnedAt > at) { at = o.data.turnedAt; best = o.data.turnedBy; }
    });
    const u = best ? DD.Combat.byId(best) : null;
    return u && !u.dead && s ? u : null;
  }
  /** The payoff: her own beam hits HER (18) and she flinches — her beams still to come this turn fizzle. */
  function reflect(iris, tr, L) {
    const fd = fightData();
    fd.reflections++;
    const hero = creditFor(tr);
    DD.FX.flash('#ff7af0', 160);
    DD.FX.text(iris, 'REFLECTED!', { color: '#ff9af5', size: 20 });
    A().log('The beam bounces back into Dr. Iris\'s own eye! (' + (hero ? hero.name + ' angled that mirror' : 'nice angles') + ')', 'hero');
    A().narrate('iris_reflect', { hero: hero ? hero.name : 'the party' });
    A().damage(hero, iris, L.reflect, { cause: 'status', tags: ['reflection'] });
    if (!active(iris)) return;
    const d = irisData(iris);
    tr.mirrors.forEach(function (k) { if (d.burned.indexOf(k) < 0) d.burned.push(k); });
    A().bark(iris, 'reflect');
    const left = (iris.intents || []).filter(function (it) { return it.skillId === 'iris_eye_beam'; });
    if (left.length) {
      fd.flinches++;
      iris.intents = iris.intents.filter(function (it) { return left.indexOf(it) < 0; });
      DD.FX.text(iris, 'Flinches!', { color: '#ffe14d', size: 15 });
      A().log('Dr. Iris flinches: her other eye beams fizzle.', 'status');
      A().touch();
    }
  }

  /** Gaze reach: 6, then +1 per round from round 9 ("Overtime": nobody waits out an appointment in a corner). */
  function gazeRange() {
    const s = S();
    return N.gazeRange + Math.max(0, ((s && s.round) || 0) - N.overtime);
  }
  /** Gaze numbers right now: { dmg, range, cover } — cover 0: pillars + mirrors block it, 1: mirrors only, 2: nothing. */
  function gazeNow(u) {
    const late = Math.max(0, ((S() && S().round) || 0) - N.closing);
    const xray = !!u && irisData(u).phase >= 2;
    return { dmg: (xray ? N.gaze2 : N.gaze) + late * 2, range: gazeRange(), cover: late > 0 ? 2 : xray ? 1 : 0 };
  }
  /**
   * Line of sight for her gaze: the normal rule, or with X-ray vision (phase 2) a supercover walk where only walls and
   * mirrors block (pillars and furniture no longer hide you).
   */
  function gazeSees(u, h, xray) {
    if (!xray) return G().los(u, h);
    const dx = Math.abs(h.x - u.x), dy = Math.abs(h.y - u.y), sx = h.x > u.x ? 1 : -1, sy = h.y > u.y ? 1 : -1;
    const blocks = function (x, y) {
      const t = G().tile(x, y);
      if (!t) return true;
      const td = G().terrain(t);
      return (td.walkable === false && !td.pit && !td.liquid) || isMirror(t);
    };
    let x = u.x, y = u.y, ix = 0, iy = 0;
    while (ix < dx || iy < dy) {
      const dec = (1 + 2 * ix) * dy - (1 + 2 * iy) * dx;
      if (dec === 0) {
        if (blocks(x + sx, y) && blocks(x, y + sy)) return false;
        x += sx; y += sy; ix++; iy++;
      } else if (dec < 0) { x += sx; ix++; } else { y += sy; iy++; }
      if (x === h.x && y === h.y) break;
      if (blocks(x, y)) return false;
    }
    return true;
  }
  /**
   * End of her turn: every hero she can see within reach takes Clinical Gaze damage (cover blocks it; X-ray in phase 2;
   * at closing time nothing blocks it and it grows by 2 a round).
   */
  function clinicalGaze(u) {
    // the Clinical Gaze status IS the gaze (it shows the live numbers): dispel it and she skips a turn of staring
    if (!active(u) || !has(u, 'iris_gaze') || (DD.Combat.isStunned && DD.Combat.isStunned(u))) return 0;
    const g = gazeNow(u);
    const xray = g.cover === 1;
    const n = g.dmg;
    const range = g.range;
    const closing = g.cover === 2; // the clinic is closing: nobody waits out an appointment behind a mirror
    const seen = heroFoes(u).filter(function (h) {
      return h.kind === 'hero' && G().dist(u, h) <= range && (closing || gazeSees(u, h, xray));
    });
    if (!seen.length) return 0;
    const who = closing ? 'in the clinic (closing time: nowhere to hide!)' : xray ? 'not hiding behind a mirror (X-ray vision!)' :
      'in her line of sight (hide behind a pillar or a mirror)';
    A().log('Dr. Iris scrutinizes everyone ' + who + ' within ' + range + ' tiles: ' + n + ' damage each.', 'enemy');
    seen.forEach(function (h) { if (active(h)) A().damage(u, h, n, { cause: 'status', tags: ['gaze'], silent: true }); });
    return seen.length;
  }

  /**
   * threatAt (see DD.AutoPlay): what her end-of-turn gaze would deal to hero h standing on tile — the same reach, cover
   * and X-ray rules as clinicalGaze — as { dmg, label }, or 0 (summons, stealthed heroes, cover, a stunned Iris).
   */
  function gazeThreat(u, h, tile) {
    if (!active(u) || !has(u, 'iris_gaze') || (DD.Combat.isStunned && DD.Combat.isStunned(u))) return 0;
    if (!h || h.kind !== 'hero' || !tile || !G().hostile(u, h) || has(h, 'stealth')) return 0;
    const g = gazeNow(u);
    if (G().dist(u, tile) > g.range) return 0;
    if (g.cover !== 2 && !gazeSees(u, tile, g.cover === 1)) return 0;
    return { dmg: g.dmg, label: 'Clinical Gaze' };
  }

  /** Objective subtitle: the puzzle in one line, plus what hides you from her gaze right now (phase / closing time). */
  function flavorText(u) {
    const g = gazeNow(u);
    const how = 'Rotate an Exam Mirror (1 AP, from next to it) until a beam\'s red line runs back into her. ';
    if (g.cover === 2) return how + 'Closing time: her gaze finds everyone within ' + g.range + ' tiles (' + g.dmg + ' damage a turn).';
    if (g.cover === 1) return how + 'X-ray gaze: only a mirror between you and her blocks it now.';
    return how + 'Pillars and mirrors block her gaze.';
  }
  function updateFlavor(u) { const s = S(); if (s && s.objective) s.objective.flavor = flavorText(u); }

  /** At planning: she telekinetically spins every mirror that just burned her around (two quarter turns). */
  function nudgeMirrors(u) {
    const d = irisData(u);
    if (!d.burned.length) return 0;
    let n = 0;
    d.burned.forEach(function (k) {
      const p = k.split(',');
      const t = G().tile(+p[0], +p[1]);
      if (!isMirror(t)) return;
      setFacing(t.obj, rotName(t.obj.data.facing || 'N', 2));
      DD.FX.tile(t.x, t.y, 'glow', { color: '#c9a0ff' });
      n++;
    });
    d.burned = [];
    if (n) {
      A().log('Dr. Iris glares at the offending mirror' + (n > 1 ? 's' : '') + ' and telekinetically spins ' + (n > 1 ? 'them' : 'it') +
        ' around. Two rotations will set it right again.', 'enemy');
      A().bark(u, 'nudge');
      A().touch();
    }
    return n;
  }

  // ---- area helpers ----------------------------------------------------------------------------------------------
  function openTile(x, y) {
    const t = G().tile(x, y);
    if (!t) return false;
    const td = G().terrain(t);
    if (td.walkable === false && !td.pit) return false;
    return !(t.obj && G().objBlocksMove(t.obj));
  }
  /**
   * The tumbling "E" of an eye chart in a size×size box: spine + prongs on every other row. rot 0: opens East (E),
   * 1: South (Ш upside down), 2: West (Ǝ), 3: North (Ш). Returns offsets {dx, dy} from the box's top-left corner.
   */
  function eGlyph(size, rot) {
    const out = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!(x === 0 || y % 2 === 0)) continue;
      let p;
      switch (((rot % 4) + 4) % 4) {
        case 0: p = { dx: x, dy: y }; break;
        case 1: p = { dx: size - 1 - y, dy: x }; break;
        case 2: p = { dx: size - 1 - x, dy: size - 1 - y }; break;
        default: p = { dx: y, dy: size - 1 - x };
      }
      out.push(p);
    }
    return out;
  }
  function examTiles(cx, cy, rot, size) {
    const s = S();
    size = size || 5;
    const h = Math.floor(size / 2);
    const x0 = Math.max(0, Math.min(s.grid.w - size, cx - h)), y0 = Math.max(0, Math.min(s.grid.h - size, cy - h));
    return eGlyph(size, rot).map(function (p) { return { x: x0 + p.dx, y: y0 + p.dy }; })
      .filter(function (p) { return G().inBounds(p.x, p.y) && openTile(p.x, p.y); });
  }
  function examArea(ctx) {
    const t = ctx && ctx.target;
    return t ? examTiles(t.x, t.y, 0, 5) : [];
  }

  // ---- skills ----------------------------------------------------------------------------------------------------
  function beamFx(from, tr, ctx) {
    // a dazzled / confused beam was moved off its trace: draw the shifted line instead of the mirror path
    const moved = ctx.tiles.length && tr.tiles.length && (ctx.tiles[0].x !== tr.tiles[0].x || ctx.tiles[0].y !== tr.tiles[0].y);
    if (moved) {
      DD.FX.beam(ctx.tiles[0], ctx.tiles[ctx.tiles.length - 1], { color: '#ff4fd8', width: 6 });
      return;
    }
    if (!tr.segs.length && tr.tiles.length) tr.segs.push({ a: from, b: tr.tiles[tr.tiles.length - 1] });
    tr.segs.forEach(function (sg, i) { DD.FX.beam(sg.a, sg.b, { color: i ? '#ffa0f0' : '#ff4fd8', width: 6, parallel: i > 0 }); });
  }

  eskill({
    id: 'iris_eye_beam', name: 'Optic Ray', icon: '👁️', kind: 'spell', tags: ['ranged', 'aoe'], anchor: 'self',
    levels: [{ dmg: N.beam, reflect: N.reflect }], target: { type: 'dir' },
    area: { shape: 'custom', fn: beamArea },
    desc: function (L) {
      return 'Three parallel rays down the marked lines: ' + L.dmg + ' damage to everyone on them (floaters too). Walls and pillars stop a ' +
        'ray; Exam Mirrors send it on the way they face. A ray that comes back into Dr. Iris hits HER for ' + L.reflect + ' and she flinches ' +
        '(her beams still to come this turn fizzle).';
    },
    flavor: 'Follow the light. No, the other light. No, the OTHER one.',
    execute: function (ctx) {
      const u = ctx.user;
      const tr = traceBeam(u, ctx.dir);
      beamFx(u, tr, ctx);
      let self = false;
      ctx.units.forEach(function (o) {
        if (o === u) { self = true; return; }
        if (active(o)) A().damage(u, o, ctx.L.dmg);
      });
      if (self && active(u)) reflect(u, tr, ctx.L);
    },
  });

  eskill({
    id: 'iris_eye_exam', name: 'Eye Exam', icon: '🔠', kind: 'spell', tags: ['aoe'], anchor: 'ground',
    levels: [{ dmg: N.exam }], target: { type: 'tile', range: [0, 30], filter: 'any', los: false },
    area: { shape: 'custom', fn: examArea },
    desc: function (L) {
      return 'A giant eye-chart "E" slams down on the marked tiles: ' + L.dmg + ' damage to everyone on them. The gaps between the prongs are safe.';
    },
    flavor: 'Which way is the E facing? Wrong. It was facing YOU.',
    execute: function (ctx) {
      ctx.tiles.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'crack', { parallel: i > 0, color: '#f2f2f2' }); });
      DD.FX.shake(6, 300);
      ctx.units.forEach(function (o) { if (o !== ctx.user && active(o)) A().damage(ctx.user, o, ctx.L.dmg); });
    },
  });

  eskill({
    id: 'iris_antimagic', name: 'Anti-Magic Cone', icon: '🚫', kind: 'attack', tags: ['aoe'], anchor: 'self',
    levels: [{ dmg: N.cone, len: N.coneLen, turns: 1 }], target: { type: 'dir' },
    area: { shape: 'cone', size: function (L) { return L.len; } },
    desc: function (L) {
      return 'Her central eye opens: ' + L.dmg + ' damage and Silenced (no spells) for ' + L.turns + ' turn to each of her foes in a ' + L.len + '-tile cone.';
    },
    flavor: 'Magic is just bad eyesight with extra steps.',
    execute: function (ctx) {
      const end = ctx.tiles[ctx.tiles.length - 1];
      if (end) DD.FX.beam(ctx.user, end, { color: '#9fe7ff', width: 10 });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().addStatus(f, 'silenced', { turns: ctx.L.turns }, ctx.user);
      });
    },
  });

  eskill({
    id: 'iris_disintegrate', name: 'Disintegrate', icon: '💀', kind: 'spell', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: N.disintegrate }], target: { type: 'unit', range: [1, N.disRange], filter: 'enemy', los: true },
    desc: function (L) {
      return 'Charges for 2 turns, then deals ' + L.dmg + ' damage to the tracked target. Fizzles if it breaks line of sight (hide behind a ' +
        'pillar or a mirror).';
    },
    flavor: 'The most aggressive "you\'re due for a checkup" in the realm.',
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.beam(ctx.user, f, { color: '#7dffb0', width: 12 });
        DD.FX.shake(9, 380, { parallel: true });
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) DD.FX.text(f, 'Mostly not disintegrated!', { color: '#a8ffcf', size: 14 });
      });
    },
  });

  eskill({
    id: 'iris_next_patient', name: 'Next Patient, Please!', icon: '🩺', kind: 'summon', tags: ['summon'], anchor: 'self', cooldown: 2,
    levels: [{ n: 2 }], target: { type: 'self' },
    desc: function (L) { return 'Calls ' + L.n + ' Eye Floaters out of the waiting room (never more than ' + N.floaterCap + ' at once).'; },
    flavor: 'Please take a number. The number is a floater.',
    execute: function (ctx) { spawnFloaters(ctx.user, ctx.L.n); },
  });

  eskill({
    id: 'iris_floater_blur', name: 'Blurry Vision', icon: '🌫️', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: N.floaterDmg, turns: 1 }], target: { type: 'unit', range: [1, 4], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the tracked target and Dazzle it for ' + L.turns + ' turn (−1 max range).'; },
    flavor: 'It drifts out of focus every time you look straight at it.',
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.projectile(ctx.user, f, { kind: 'orb', color: '#dfe8ff' });
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().addStatus(f, 'dazzled', { turns: ctx.L.turns }, ctx.user);
      });
    },
  });

  function spawnFloaters(u, n) {
    let k = Math.min(n, N.floaterCap - aliveOf('iris_floater').length);
    if (k <= 0 || !u) return 0;
    const s = S();
    const marks = s.grid.tiles.filter(function (t) { return t.tag === 'iris_waiting'; });
    const spots = marks.concat(G().emptyTilesNear(u.x, u.y, 3))
      .filter(function (p) { return G().isFree(p.x, p.y) && !G().hazardAt(p.x, p.y); });
    let made = 0;
    for (let i = 0; i < spots.length && k > 0; i++) {
      if (!G().isFree(spots[i].x, spots[i].y)) continue;
      if (A().spawn('iris_floater', spots[i].x, spots[i].y)) { k--; made++; }
    }
    if (made) A().log('Dr. Iris: "Next patient!" ' + made + ' Eye Floater' + (made > 1 ? 's drift' : ' drifts') + ' out of the waiting room.', 'enemy');
    return made;
  }

  // ---- planner -------------------------------------------------------------------------------------------------------
  function enterPhase2(u) {
    const d = irisData(u);
    if (d.phase >= 2) return;
    d.phase = 2;
    DD.FX.flash('#ff7af0', 220);
    DD.FX.banner('SECOND OPINION', { sub: 'X-ray vision: only mirrors hide you from her gaze now', color: '#ffb0f5', ms: 1000 });
    A().log('Dr. Iris dilates every pupil she has: three beams a turn, Eye Exams in pairs, and an X-ray gaze that sees through ' +
      'pillars (mirrors still block it).', 'enemy');
    A().narrate('iris_phase2', {});
    A().bark(u, 'phase');
  }

  /**
   * Beam directions this turn: a clockwise lighthouse (2 lines in phase 1, 3 in phase 2) starting at d.rot. She is a
   * professional: a line that ALREADY bounces back into her is skipped for the next one clockwise, so mirrors have to
   * be turned after she telegraphs (never pre-aimed).
   */
  function beamDirs(d, u) {
    const want = d.phase >= 2 ? 3 : 2;
    const out = [];
    for (let k = 0; k < 4 && out.length < want; k++) {
      const n = ORDER[(d.rot + k) % 4];
      if (u && traceBeam(u, DIRS[n]).self) continue;
      out.push(n);
    }
    return out;
  }

  function addBeams(u, api, d) {
    beamDirs(d, u).forEach(function (n) {
      const v = DIRS[n];
      api.addIntent(u, 'iris_eye_beam', { x: u.x + v.x, y: u.y + v.y }, { anchor: 'self', dir: v, label: 'Optic Ray (' + n + ')' });
    });
    d.rot = (d.rot + 1) % 4;
  }

  function clusterCenter(foes, exclude) {
    // centre of the 5×5 box that covers the most heroes (ties: nearest the heroes' centroid)
    let best = null, bestN = -1, bestD = Infinity;
    let cx = 0, cy = 0;
    foes.forEach(function (f) { cx += f.x; cy += f.y; });
    cx /= Math.max(1, foes.length); cy /= Math.max(1, foes.length);
    foes.forEach(function (f) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const c = { x: f.x + dx, y: f.y + dy };
        if (exclude && Math.abs(c.x - exclude.x) < 3 && Math.abs(c.y - exclude.y) < 3) continue;
        let n = 0;
        foes.forEach(function (o) { if (Math.abs(o.x - c.x) <= 2 && Math.abs(o.y - c.y) <= 2) n++; });
        const dd = Math.abs(c.x - cx) + Math.abs(c.y - cy);
        if (n > bestN || (n === bestN && dd < bestD)) { best = c; bestN = n; bestD = dd; }
      }
    });
    return best;
  }

  function eyeExam(u, api, foes, d, count) {
    let prev = null;
    for (let i = 0; i < count; i++) {
      const c = clusterCenter(foes, prev);
      if (!c) break;
      const rot = d.exam++ % 4;
      const tiles = examTiles(c.x, c.y, rot, 5);
      if (!tiles.length) continue;
      api.addIntent(u, 'iris_eye_exam', c, { anchor: 'ground', tiles: tiles, delay: 1, label: 'Eye Exam (' + ['E →', 'E ↓', 'E ←', 'E ↑'][rot] + ')' });
      prev = c;
    }
  }

  function cone(u, api, foes) {
    let best = null, bestN = 0;
    ORDER.forEach(function (n) {
      const v = DIRS[n];
      const tiles = G().shape('cone', { x: u.x + v.x, y: u.y + v.y }, v, N.coneLen, u);
      let k = 0;
      foes.forEach(function (f) { if (tiles.some(function (p) { return p.x === f.x && p.y === f.y; })) k++; });
      if (k > bestN) { bestN = k; best = v; }
    });
    if (!best) return false;
    api.addIntent(u, 'iris_antimagic', { x: u.x + best.x, y: u.y + best.y }, { anchor: 'self', dir: best });
    return true;
  }

  function disintegrate(u, api, foes) {
    let best = null, bestSc = Infinity;
    foes.forEach(function (f) {
      const dd = G().dist(u, f);
      if (dd < 1 || dd > N.disRange || !G().los(u, f)) return;
      const sc = f.hp + (f.block || 0) + dd * 0.2;
      if (sc < bestSc) { bestSc = sc; best = f; }
    });
    if (!best) return false;
    api.addIntent(u, 'iris_disintegrate', best, { anchor: 'unit', delay: 2 });
    return true;
  }

  function floaters(u, api) {
    if (aliveOf('iris_floater').length >= N.floaterCap || !api.canUse(u, 'iris_next_patient')) return false;
    api.addIntent(u, 'iris_next_patient', u, { anchor: 'self' });
    return true;
  }

  function irisPlan(unit, api) {
    const d = irisData(unit);
    if (!has(unit, 'iris_gaze')) A().addStatus(unit, 'iris_gaze', { turns: -1, silent: true }, unit);
    nudgeMirrors(unit);
    if (d.phase < 2 && unit.hp <= unit.maxHp * 0.5) enterPhase2(unit);
    updateFlavor(unit);
    const foes = heroFoes(unit);
    if (!foes.length) return;
    const kept = (unit.intents || []).map(function (i) { return i.skillId; });
    const step = d.turn;
    d.turn++;
    // pattern attacks first, beams last: a reflected beam makes her flinch and cancels the beams still to come
    const examPending = kept.indexOf('iris_eye_exam') >= 0, disPending = kept.indexOf('iris_disintegrate') >= 0;
    if (d.phase < 2) {
      switch (step % 4) {
        case 0: if (!examPending) eyeExam(unit, api, foes, d, 1); break;
        case 1: cone(unit, api, foes); break;
        case 2: if (!disPending) disintegrate(unit, api, foes); floaters(unit, api); break;
        default: if (!cone(unit, api, foes) && !examPending) eyeExam(unit, api, foes, d, 1);
      }
    } else {
      switch (step % 3) {
        case 0: if (!examPending) eyeExam(unit, api, foes, d, 2); break;
        case 1: cone(unit, api, foes); floaters(unit, api); break;
        default: if (!disPending) disintegrate(unit, api, foes); else cone(unit, api, foes);
      }
    }
    addBeams(unit, api, d);
  }

  // ---- mirrors (core 'mirror' object + instance callbacks) ---------------------------------------------------------------
  const TURNS_PER_ROUND = 2;
  // the tile inspect shows obj.label: it carries the per-round turn budget (the core mirror desc can't)
  const MIRROR_LABEL = 'Exam Mirror (' + TURNS_PER_ROUND + ' quarter turns a round)';
  /** A mirror creaks: at most two quarter turns per mirror per round. */
  function turnsLeft(o) {
    const s = S();
    if (!s || !o || !o.data) return 0;
    return o.data.turnedRound === s.round ? Math.max(0, TURNS_PER_ROUND - (o.data.turnsThisRound || 0)) : TURNS_PER_ROUND;
  }
  function mirrorReady(o) { return turnsLeft(o) > 0; }
  /**
   * Value of turning this mirror for AutoPlay: the best outcome within the quarter turns still allowed this round —
   * reflections gained (her own beam back into her: 18 damage plus the beams she flinches out of) and hero hits
   * avoided — divided by the turns it takes. 0 when it can't be turned or it already lines up.
   */
  function mirrorHint(unit, o) {
    const iris = findIris();
    const left = turnsLeft(o);
    if (!iris || !active(iris) || !left) return 0;
    const beams = (iris.intents || []).filter(function (it) { return it.skillId === 'iris_eye_beam' && !(it.delay > 0); });
    if (!beams.length) return 0;
    const f0 = o.data.facing || 'N';
    const outcome = function () {
      let self = 0, hurt = 0;
      beams.forEach(function (it) {
        DD.AI.intentTiles(iris, it).forEach(function (p) {
          const v = G().unitAt(p.x, p.y);
          if (v === iris) self++;
          else if (active(v) && v.side === 'hero') hurt++;
        });
      });
      return { self: self, hurt: hurt };
    };
    const base = outcome();
    let best = 0;
    try {
      for (let k = 1; k <= left; k++) {
        setFacing(o, rotName(f0, k));
        const r = outcome();
        const gain = (r.self - base.self) * (N.reflect + N.beam) + (base.hurt - r.hurt) * N.beam;
        if (gain / k > best) best = gain / k;
      }
    } finally { setFacing(o, f0); }
    return best;
  }

  function onMirrorTurned(unit, o, tile) {
    const fd = fightData();
    fd.rotations++;
    o.data.turnedBy = unit.id;
    o.data.turnedAt = fd.rotations;
    const round = S().round;
    o.data.turnsThisRound = o.data.turnedRound === round ? (o.data.turnsThisRound || 0) + 1 : 1;
    o.data.turnedRound = round;
    const left = turnsLeft(o);
    o.label = left ? 'Exam Mirror (' + left + ' more quarter turn' + (left === 1 ? '' : 's') + ' this round)' : 'Exam Mirror (creaky: no more turns this round)';
    const iris = findIris();
    if (!iris || !iris.intents) return;
    const back = iris.intents.some(function (it) {
      return it.skillId === 'iris_eye_beam' && DD.AI.intentTiles(iris, it).some(function (p) { return p.x === iris.x && p.y === iris.y; });
    });
    if (back) {
      DD.FX.text(tile, 'Lined up!', { color: '#ff9af5', size: 14 });
      A().log('A beam is now angled straight back at Dr. Iris. She has not noticed. Yet.', 'hero');
    }
  }

  /**
   * Encounter onStart: every mirror gets the puzzle callbacks and a random starting angle (never one that already sends
   * one of her lines back at her); her lighthouse and eye-chart rotations start at a random offset.
   */
  function setupClinic(state) {
    fightData();
    const iris = findIris();
    const mirrors = state.grid.tiles.filter(isMirror);
    mirrors.forEach(function (t) {
      const o = t.obj;
      o.data = Object.assign({}, o.data);
      setFacing(o, o.data.facing || o.facing || 'N');
      o.label = MIRROR_LABEL;
      o.autoplay = mirrorHint;
      o.available = mirrorReady;
      o.onInteract = onMirrorTurned;
      o.onRoundEnd = function (obj) { if (obj) obj.label = MIRROR_LABEL; };
    });
    // a mirror on one of her four lines starts one or two clockwise quarter turns short of facing her (so every line can
    // be lined up within a round, never pre-aimed); the corner mirrors get any angle that doesn't already bounce back
    mirrors.forEach(function (t) {
      const o = t.obj;
      const onLine = iris && (t.x === iris.x || t.y === iris.y);
      const home = onLine ? dirName({ x: Math.sign(iris.x - t.x), y: Math.sign(iris.y - t.y) }) : null;
      const options = onLine ? state.rng.shuffle([rotName(home, -1), rotName(home, -2)]) : state.rng.shuffle(ORDER.slice());
      for (let k = 0; k < options.length; k++) {
        setFacing(o, options[k]);
        if (!iris || !ORDER.some(function (n) { return traceBeam(iris, DIRS[n]).self; })) break;
      }
    });
    if (iris) {
      const d = irisData(iris);
      d.rot = state.rng.int(0, 3);
      d.exam = state.rng.int(0, 3);
      if (!has(iris, 'iris_gaze')) A().addStatus(iris, 'iris_gaze', { turns: -1, silent: true }, iris);
    }
    if (state.objective) state.objective.flavor = flavorText(iris);
  }

  // ---- decor objects -----------------------------------------------------------------------------------------------------
  function drawChart(g) {
    g.ellipse(0, 3, 14, 6, 'rgba(0,0,0,0.25)', null);
    g.line(-7, 0, -6, -12, '#6b4a2b', 2);
    g.line(7, 0, 6, -12, '#6b4a2b', 2);
    g.rect(-11, -52, 22, 42, '#f8f6f0', true, 1.5);
    const rows = [['E', 9], ['F P', 6], ['T O Z', 4.6], ['L P E D', 3.6], ['U R N X T', 2.8]];
    let y = -46;
    rows.forEach(function (r) { g.text(r[0], 0, y, r[1], '#1a1014'); y += r[1] + 2.4; });
    g.line(-9, -14, 9, -14, '#d03030', 0.8);
  }
  function drawChair(g, obj, time) {
    g.ellipse(0, 3, 15, 6, 'rgba(0,0,0,0.25)', null);
    g.box(0, 0, 8, 4, 8, { top: '#7a8a9a', left: '#5a6a7a', right: '#4a5a6a' }, true);
    g.poly([[-12, -10], [10, -12], [12, -7], [-10, -5]], '#2a9d8f', true);
    g.poly([[-12, -10], [-14, -30], [-9, -31], [-7, -9]], '#2a9d8f', true);
    g.line(9, -12, 12, -26, '#9aa4ae', 1.6);
    g.circle(12, -28, 5, '#dfe8f0', true);
    g.glow(12, -28, 8, '#fff6c0', 0.35 + 0.1 * Math.sin(time * 2));
  }
  DD.registerObject({
    id: 'iris_chart', name: 'Snellen Eye Chart', blocksMove: true, blocksLos: true, hp: 0, height: 1.6, color: '#f8f6f0',
    desc: 'Blocks movement and line of sight. The bottom line reads "U R N X T". Dr. Iris insists that is a coincidence.',
    draw: drawChart,
  });
  DD.registerObject({
    id: 'iris_chair', name: 'Exam Chair', blocksMove: true, blocksLos: false, hp: 0, height: 0.9, color: '#2a9d8f',
    desc: 'Blocks movement (and eye beams). It has restraints. For your comfort.',
    draw: drawChair,
  });
  // waiting-room linoleum: pale teal, so red telegraph hatching stays readable where the party deploys
  DD.registerTerrain({
    id: 'iris_lino', name: 'Waiting-Room Linoleum', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#8fc9c0', left: '#6ea59c', right: '#5a8c84' },
    desc: 'Squeaky, sanitized, and somehow sticky. The magazines here are from the previous edition.',
  });

  // ---- sprites -------------------------------------------------------------------------------------------------------------
  function hasSt(st, id) { return !!st && (st instanceof Set ? st.has(id) : Array.isArray(st) ? st.indexOf(id) >= 0 : typeof st === 'object' ? !!st[id] : false); }

  /** Render-time check (live state, no side effects): does one of her planned beams come back into her right now? */
  function beamComingBack(u) {
    const s = S();
    if (!u || !s || u.dead || !Array.isArray(u.intents) || s.units.indexOf(u) < 0) return false;
    for (let i = 0; i < u.intents.length; i++) {
      const it = u.intents[i];
      if (it && it.skillId === 'iris_eye_beam' && it.dir && traceBeam(u, it.dir).self) return true;
    }
    return false;
  }

  function drawStalk(g, bx, by, ex, ey, cx, cy, t, i, hurt, glasses) {
    g.limb(bx, by, ex, ey, 2.1, '#d98c9a', cx, cy);
    g.circle(ex, ey, 3.3, '#fbf3f0', true);
    const lx = Math.sin(t * 1.7 + i) * 0.9;
    if (hurt) g.line(ex - 2, ey, ex + 2, ey, '#3a1a20', 1);
    else {
      g.circle(ex + lx, ey + 0.3, 1.7, ['#2a9d8f', '#8e5ad6', '#c47a2c', '#3a7bd5'][i % 4], null);
      g.circle(ex + lx, ey + 0.3, 0.8, '#120a10', null);
    }
    if (glasses === 1) g.circle(ex, ey, 3.8, 'rgba(220,240,255,0.18)', '#3a2a20');
    else if (glasses === 2) { g.rect(ex - 4, ey - 2.2, 8, 4, 'rgba(20,20,30,0.75)', '#120a10', 1); }
  }

  function drawIris(g, t, o) {
    const st = o && o.statuses;
    const cast = g.pose === 'cast' || g.pose === 'attack';
    const hurt = g.pose === 'hurt' || hasSt(st, 'stun');
    const squint = hasSt(st, 'iris_squint');
    const body = '#f4e6e6';
    const cy = -22, r = 17;
    const wob = Math.sin(t * 2.3) * 0.6;
    // eyestalks behind
    const stalks = [[-14, -32, -22, -46], [-8, -36, -13, -53], [-1, -38, -2, -57], [7, -37, 9, -55], [13, -33, 21, -48]];
    stalks.forEach(function (s, i) {
      const sw = Math.sin(t * 1.9 + i * 1.3) * 2.2;
      drawStalk(g, s[0], s[1] + wob, s[2] + sw, s[3] + Math.cos(t * 1.4 + i) * 1.2, (s[0] + s[2]) / 2 + sw * 1.5, (s[1] + s[3]) / 2 + 6, t, i, hurt, i === 1 ? 1 : i === 3 ? 2 : 0);
    });
    // body: the big eyeball
    g.glow(0, cy, 30, cast ? '#ff6ae8' : '#ffd1f0', cast ? 0.32 : 0.14);
    g.shaded(function (p) { p.arc(0, cy + wob, r, 0, TAU); }, body, { dx: 2, dy: -2, hl: [-6, cy - 8 + wob, 5, 2.6, -0.5] });
    // veins
    [[-15, cy + 4, -9, cy + 1, -6, cy + 6], [14, cy + 6, 9, cy + 3, 8, cy + 9], [-11, cy - 10, -6, cy - 7, -4, cy - 11]].forEach(function (v) {
      g.path(function (p) { p.moveTo(v[0], v[1] + wob); p.quadraticCurveTo(v[2], v[3] + wob, v[4], v[5] + wob); }, null, 'rgba(200,40,60,0.55)', 0.8);
    });
    // the central eye: lid, iris, pupil
    const ex = 2, ey = cy - 2 + wob;
    const open = hurt ? 0.12 : squint ? 0.45 : cast ? 1.15 : 0.92 + Math.sin(t * 0.9) * 0.05;
    g.ellipse(ex, ey, 11.5, 9 * open + 0.6, '#ffffff', true);
    if (open > 0.2) {
      const iy = ey + 0.2;
      g.circle(ex + 1.2, iy, 6.6 * Math.min(1, open + 0.1), cast ? '#d63fbf' : '#2a9d8f', null);
      g.circle(ex + 1.2, iy, cast ? 1.8 : 3.2, '#120a10', null);
      g.circle(ex - 1.2, iy - 2.2, 1.4, 'rgba(255,255,255,0.9)', null);
      // a monocle-sized contact lens glint
      g.arc(ex + 1.2, iy, 7.4, -2.4, -1.2, 'rgba(255,255,255,0.7)', 0.8);
    }
    g.path(function (p) { p.moveTo(ex - 12.5, ey); p.quadraticCurveTo(ex, ey - 12 * open - 2, ex + 12.5, ey); }, null, '#7a3a48', 1.6);
    // professional smile with too many teeth
    g.path(function (p) { p.moveTo(-9, cy + 9 + wob); p.quadraticCurveTo(1, cy + 16 + wob, 11, cy + 8.5 + wob); p.quadraticCurveTo(1, cy + 12 + wob, -9, cy + 9 + wob); }, '#5a1a2a', true);
    for (let i = 0; i < 6; i++) g.poly([[-7 + i * 3, cy + 10.2 + wob], [-5.5 + i * 3, cy + 12.6 + wob], [-4 + i * 3, cy + 10.2 + wob]], '#fffaf0', null);
    // lab coat collar + stethoscope draped over the bottom of the eyeball
    g.path(function (p) { p.moveTo(-15, cy + 9 + wob); p.quadraticCurveTo(0, cy + 22 + wob, 15, cy + 9 + wob); p.lineTo(13, cy + 17 + wob); p.quadraticCurveTo(0, cy + 25 + wob, -13, cy + 17 + wob); p.closePath(); }, '#ffffff', true);
    g.path(function (p) { p.moveTo(-12, cy + 12 + wob); p.quadraticCurveTo(-4, cy + 26 + wob, 4, cy + 19 + wob); }, null, '#2a3a4a', 1.4);
    g.circle(4.5, cy + 19.5 + wob, 2.2, '#c9ced6', true);
    g.rect(7, cy + 13 + wob, 7, 3.4, '#2d6bd6', true, 0.6);
    g.text('DR.', 10.5, cy + 14.7 + wob, 2.4, '#ffffff', null);
    // head mirror on a headband: the original reflective surface
    g.path(function (p) { p.arc(0, cy + wob, r + 0.8, -2.7, -0.5); }, null, '#3a2a30', 2.2);
    g.circle(-9, cy - 15 + wob, 5.2, '#d8e2ea', true);
    g.circle(-9, cy - 15 + wob, 1.4, '#3a4a5a', null);
    g.arc(-9, cy - 15 + wob, 4, -2.2, -1.2, '#ffffff', 1.1);
    if (cast) g.glow(ex, ey, 14, '#ff6ae8', 0.4);
    // puzzle feedback: one of her telegraphed beams currently bounces back at her — she has noticed (too late)
    if (beamComingBack(o && o.unit)) {
      const k = Math.sin(t * 9);
      g.text('!!', 15, cy - 26 + k, 11, '#ff3d6e');
      g.ellipse(-15, cy - 6 + Math.abs(k) * 2, 1.6, 2.6, '#9fe0ff', true);
      g.ellipse(16, cy - 2 + Math.abs(k) * 2, 1.3, 2.1, '#9fe0ff', true);
    }
  }

  function drawFloater(g, t) {
    const c = g.ctx;
    c.save();
    c.globalAlpha = 0.82;
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      pts.push([Math.sin(t * 2.2 + u * 5.5) * 6 * (1 - u * 0.4), -8 - u * 22 + Math.cos(t * 1.7 + u * 4) * 1.5]);
    }
    for (let i = pts.length - 1; i >= 0; i--) g.circle(pts[i][0], pts[i][1], 3.6 - i * 0.22, 'rgba(225,235,255,0.65)', 'rgba(120,130,170,0.8)');
    const h = pts[pts.length - 1];
    g.circle(h[0], h[1], 3.6, 'rgba(245,250,255,0.95)', '#4a5070');
    g.circle(h[0] + 0.8, h[1], 1.4, '#1a1a2e', null);
    c.restore();
  }

  // ---- enemies ---------------------------------------------------------------------------------------------------------------
  DD.registerEnemy({
    id: IRIS, name: 'Dr. Iris', act: 2, tier: 'boss', hp: N.hp, mov: 0, armor: 0,
    tags: ['aberration', 'boss', 'beholder'], flags: { flying: true, large: true, immovable: true, immune: ['sleep'] }, resist: { poison: 0.5 },
    sprite: {
      base: 'custom', scale: 2.0, height: 58, width: 40, headY: -24, hover: 8,
      palette: { skin: '#f4e6e6', cloth: '#ffffff', cloth2: '#2a9d8f', hair: '#d98c9a', metal: '#d8e2ea', eye: '#2a9d8f', accent: '#ff6ae8', outline: '#1a1014' },
      bounds: { l: -40, r: 40, t: -76, b: 16 }, portrait: { x: 0, y: -26, r: 22 },
      draw: drawIris,
    },
    skills: ['iris_eye_beam', 'iris_eye_exam', 'iris_antimagic', 'iris_disintegrate', 'iris_next_patient'],
    ai: irisPlan, xp: 50, gold: [80, 100],
    hooks: {
      onStatusApplied: function (unit, st) {
        if (st && INCAPACITATE[st.id] && active(unit)) A().addStatus(unit, 'iris_squint', { turns: 3, silent: true }, unit);
      },
      modifyStatus: function (s) {
        if (!INCAPACITATE[s.id] || !s.unit || !has(s.unit, 'iris_squint')) return;
        s.cancel = true;
        DD.FX.text(s.unit, '😑 Squinting: no effect', { color: '#d6c7ff', size: 13 });
      },
      onTurnEnd: function (unit) { clinicalGaze(unit); },
      onDeath: function () { A().narrate('iris_victory', {}); },
    },
    boss: { title: 'Beholder Optometrist', intro: '"Read the bottom line for me. Oh, you can\'t? Then you\'ll want to DODGE it."', music: null },
    barks: {
      spawn: ['The doctor will see you now. All of you. At once.', 'Better... or worse?', 'Please remove your glasses. And your hope.'],
      attack: ['Better or worse? WORSE.', 'Follow the light!', 'Look directly into the beam.', 'Twenty-twenty-DIE.'],
      hurt: ['My cornea!', 'That is NOT how you treat a doctor!', 'Ow, right in the eye. Every eye.'],
      death: ['I... should have... worn... protective eyewear...', 'Your... copay... is... waived...', 'Everything... is going... blurry...'],
      phase: ['SECOND OPINION!', 'Time to dilate.'],
      reflect: ['MY EYE! MY OWN BEAM!', 'Who angled that mirror?!', 'I see what you did there. Painfully.'],
      nudge: ['Hands off my equipment.', 'Mirrors are for ME to look at.'],
    },
    desc: 'A beholder with a doctorate, ten eyes, a lab coat and a waiting list. She has never once given a straight answer to ' +
      '"better or worse?" Bounces her own beams off mirrors for fun. Hates it when patients do it back.',
  });

  DD.registerEnemy({
    id: 'iris_floater', name: 'Eye Floater', act: 2, tier: 'minion', hp: N.floaterHp, mov: 4, armor: 0,
    tags: ['aberration'], flags: { flying: true },
    sprite: { base: 'custom', scale: 0.9, height: 34, width: 16, headY: -28, hover: 4, palette: { skin: '#e8eeff', accent: '#9fb4ff', outline: '#3a4060' }, draw: drawFloater },
    skills: ['iris_floater_blur'], ai: { style: 'ranged', keepDistance: 2 }, xp: 2, gold: [0, 1],
    barks: {
      spawn: ['*drifts into your field of vision*', 'Don\'t look at me. You will anyway.'],
      attack: ['Blur!', 'Am I in your way? Good.'],
      hurt: ['Blink harder!', 'I was barely there anyway.'],
      death: ['*drifts away forever*', 'You won\'t see me again. Probably.'],
    },
    desc: 'A squiggly translucent thing that lives in the corner of your eye. It escaped from Dr. Iris and now works reception.',
  });

  // ---- arena + encounter ----------------------------------------------------------------------------------------------------
  // 13 × 12: Dr. Iris on her exam chair (B) mid-room. Exam Mirrors stand on her four lines — n (north), w (west),
  // e (east), s (south) — plus two corner mirrors a / d for bank shots; P = pillar, c = eye chart, x = exam chair,
  // f = waiting room (floater spawn), E = the first floater.
  const LAYOUT = [
    '#############',
    '#.c...n...x.f',
    '#..........Ef',
    '#..P.....P...',
    '#............',
    '#.w...B...e..',
    '#............',
    '#..P.....P...',
    '#.a...s...d..',
    '#............',
    '#..HHHHHHHH..',
    '#............',
  ];
  // the legend never carries a `data` object: MapGen copies it by reference into every fight (setupClinic owns data)
  function mirror(facing) { return { terrain: 'marble', obj: { id: 'mirror', facing: facing }, mark: 'iris_mirror' }; }
  DD.registerEncounter({
    id: 'boss_dr_iris', act: 2, kind: 'boss', name: 'The Optometry Wing', weight: 1,
    intro: 'The Academy\'s optometry wing. White tiles, a humming lamp and a waiting room full of people who came in for "just a quick look".',
    map: {
      theme: 'academy', layout: LAYOUT,
      legend: {
        '.': { terrain: 'marble' },
        'P': { terrain: 'marble', obj: 'pillar' },
        'c': { terrain: 'marble', obj: 'iris_chart' },
        'x': { terrain: 'marble', obj: 'iris_chair' },
        'n': mirror('E'), 'w': mirror('S'), 'e': mirror('N'), 's': mirror('S'), 'a': mirror('E'), 'd': mirror('W'),
        'f': { terrain: 'iris_lino', mark: 'iris_waiting' },
        'E': { terrain: 'iris_lino', zone: 'enemy', tag: 'enemy_spawn' },
        'B': { terrain: 'iris_lino', zone: 'enemy', tag: 'boss_spawn' },
        'H': { terrain: 'iris_lino', zone: 'hero' },
      },
    },
    enemies: [{ id: IRIS, n: 1 }, { id: 'iris_floater', n: 1 }],
    objective: { type: 'boss', flavor: 'Rotate an Exam Mirror (1 AP, from next to it) until a beam\'s red line runs back into her. Pillars block her gaze.' },
    onStart: function (state) { setupClinic(state); A().narrate('iris_start', {}); },
    reward: { goldMult: 1, itemRarity: 'legendary' },
  });

  // ---- narration ---------------------------------------------------------------------------------------------------------------
  DD.registerNarration('boss_start', [
    'The DM adjusts the lamp so it shines directly in your eyes. "For atmosphere."',
  ]);
  DD.registerNarration('iris_start', [
    'DM: "Those mirrors swivel. Her beams bounce. Angles of incidence are a thing. I will say no more." (He draws a diagram anyway.)',
    'DM: "She shoots straight lines. Mirrors bend straight lines. Pillars stop staring. That is the whole hint. Okay, it was three hints."',
  ]);
  DD.registerNarration('iris_reflect', [
    '{hero} angles the mirror just so. Dr. Iris gets a taste of her own medicine. Literally optical.',
    'The beam comes home to roost. The DM draws a little diagram of the angles and is unreasonably proud of {hero}.',
    'Physics! The DM did not expect anyone to understand the mirrors.',
  ]);
  DD.registerNarration('iris_phase2', [
    'Dr. Iris dilates. All ten pupils. The DM reaches for his sunglasses.',
    'Second opinion: still very, very angry.',
  ]);
  DD.registerNarration('iris_victory', [
    'Dr. Iris closes all ten eyes. Your copay has been waived. Permanently.',
  ]);

  // ---- public helpers (tests, other content) ------------------------------------------------------------------------------------
  DD.Act2Bosses = DD.Act2Bosses || {};
  DD.Act2Bosses.iris = {
    N: N, plan: irisPlan, traceBeam: traceBeam, traceRay: traceRay, eGlyph: eGlyph, examTiles: examTiles, beamDirs: beamDirs,
    mirrorHint: mirrorHint, mirrorReady: mirrorReady, setupClinic: setupClinic, nudgeMirrors: nudgeMirrors, findIris: findIris,
    data: irisData, fight: fightData, spawnFloaters: spawnFloaters, gaze: clinicalGaze, gazeRange: gazeRange, gazeNow: gazeNow,
    setFacing: setFacing,
  };
})();
