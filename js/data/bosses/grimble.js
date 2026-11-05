/* Dungeons and Degenerates — js/data/bosses/grimble.js
 * Act 1 boss: GRIMBLE, THE GOBLIN TAX COLLECTOR (enemy 'grimble', encounter 'boss_grimble', a tax office arena).
 * v2 (initiative, no telegraphs): Grimble takes TWO turns a round (two initiative entries; one turn gave a solo boss
 * too few actions to matter against four heroes). Each turn he walks (phase 1: never out of the striped DROP ZONE in
 * front of his vault) and does ONE thing — a Rubber Stamp shockwave if a hero is next to him, otherwise the next step
 * of his docket (Levy, Red Tape, Levy, Hire Intern) — then, if none is pending, winds up an AUDIT: a paperwork barrage
 * down a hero's row or column that lands one round later, at the start of the same turn of his (every unit, so every
 * hero, gets one turn to step out first; stun him to cancel it). Red Tape roots a hero anywhere, preferably one standing
 * in the Audit's lane. The Levy needs line of sight (filing cabinets are cover); his picks are "the biggest spender"
 * (most damage dealt). Ill-Gotten Gains (soft timer): every 10 gold he holds adds +1 damage to his attacks but the
 * Audit (max +8).
 * Phase 2 at 50% HP, or from round 10 when the fiscal quarter ends (so a hero can't stall him from cover forever),
 * "Hostile Takeover": two Hasted interns at once, the Audit comes as a crossing row + column, the Levy becomes Garnish
 * Wages (no line of sight needed) and he leaves his desk to stamp people (walking back to it on hiring turns).
 * Puzzle: three Tax Loophole levers. Exploit all three and the vault door drops on the DROP ZONE: everyone there loses
 * all Block, takes 36 damage and is Stunned (Grimble for both of his next turns, his pending Audit cancelled); Grimble
 * is also Vulnerable and every coin he holds spills back to the party. He starts with two interns; Goblin interns walk
 * over and close exploited loopholes on their turn. After a drop the loopholes are "under review" (3 rounds, +2 per
 * later drop), then the door goes back up.
 * Puzzle state lives in state.data.grim and in object data (both copied by previews and deploy rewinds).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const TAU = Math.PI * 2;

  const VAULT_DMG = 36;
  const REVIEW_ROUNDS = 3;        // after the first drop; every later drop adds 2 more (the paperwork piles up)
  const GAIN_PER = 10;            // Ill-Gotten Gains: +1 damage on all his attacks per 10 gold he holds...
  const GAIN_MAX = 8;             // ...up to +8
  const PHASE2_AT = 0.5;
  const QUARTER_END = 10;         // ...or from this round on: the fiscal quarter ends (no stalling him from cover)
  const PHASE2_MOV = 2;           // he leaves his desk: +2 move in phase 2
  const VAULT_STUN = 2;           // the vault door costs him both of his next turns (a round)
  const LOOPHOLE_NAMES = ['Offshore Account', 'Charitable Write-Off', 'Creative Accounting'];
  const INTERN_NAMES = ['Gary', 'Brenda', 'Kevin', 'Snig', 'Doug', 'Moira', 'Pip', 'Todd', 'Gristle', 'Becky'];
  // his docket: one step per turn (a hero next to him gets the Rubber Stamp instead)
  const P1 = ['levy', 'tape', 'levy', 'hire'];
  const P2 = ['levy', 'hire', 'levy', 'tape'];
  // balance knobs (tests may tweak them for sims)
  const GCFG = { noHint: false, gainPer: GAIN_PER, gainMax: GAIN_MAX, p1: null, p2: null, vaultStun: VAULT_STUN, quarterEnd: QUARTER_END };
  /** The docket of a phase (balance sims may set GCFG.p1 / p2 to 'tape+levy+...'). */
  function docketOf(phase) {
    const c = phase === 2 ? GCFG.p2 : GCFG.p1;
    if (typeof c === 'string' && c) return c.split(/[+/ ]+/).filter(Boolean);
    return phase === 2 ? P2 : P1;
  }

  // ---- small helpers ------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function plural(n, w) { return n + ' ' + (n === 1 ? w : w + 's'); }
  function nearestDist(p, list) { let d = Infinity; list.forEach(function (q) { d = Math.min(d, dist(p, q)); }); return d; }
  function out(u) { return !active(u) || DD.Act.isStunned(u) || DD.Act.hasStatus(u, 'sheep'); }

  const NO_DATA = { pulls: 0, drops: 0, hits: 0, refiles: 0, jam: 0, jamTick: -1 };
  /** Puzzle bookkeeping (created on first write; reads never mutate the state). */
  function gdata(s) {
    s = s || S();
    if (!s) return Object.assign({}, NO_DATA);
    s.data = s.data || {};
    return s.data.grim || (s.data.grim = Object.assign({}, NO_DATA));
  }
  function gread(s) { s = s || S(); return (s && s.data && s.data.grim) || NO_DATA; }

  function tilesWhere(s, fn) {
    const res = [];
    if (!s || !s.grid) return res;
    s.grid.tiles.forEach(function (t) { if (fn(t)) res.push(t); });
    return res;
  }
  function zoneTiles(s) { return tilesWhere(s || S(), function (t) { return t.t === 'grim_dropzone'; }).map(function (t) { return { x: t.x, y: t.y }; }); }
  function inZone(p) { const t = G().tile(p.x, p.y); return !!t && t.t === 'grim_dropzone'; }
  function loopholes(s) { return tilesWhere(s || S(), function (t) { return !!t.obj && t.obj.id === 'grim_loophole'; }).map(function (t) { return { x: t.x, y: t.y, obj: t.obj }; }); }
  function vaultTile(s) { return tilesWhere(s || S(), function (t) { return !!t.obj && t.obj.id === 'grim_vault'; })[0] || null; }
  function grimble(s) { s = s || S(); return s ? s.units.filter(function (u) { return !u.dead && u.defId === 'grimble'; })[0] || null : null; }
  function interns(s) { s = s || S(); return s ? s.units.filter(function (u) { return active(u) && u.defId === 'grim_intern'; }) : []; }
  function center(list) {
    let x = 0, y = 0;
    list.forEach(function (p) { x += p.x; y += p.y; });
    return { x: Math.round(x / list.length), y: Math.round(y / list.length) };
  }

  // DM lines for the smaller beats (logged like narration; the big beats use registered narration keys)
  const LINES = {
    loophole: [
      '{hero} finds a loophole. Somewhere, an accountant feels a disturbance.',
      'One loophole down. The rope above the drop zone creaks.',
      '{hero} exploits a loophole with the confidence of someone who has never filed taxes.',
    ],
    loopholeLast: [
      'Two loopholes exploited. One more and the vault door comes down on whoever is in the DROP ZONE.',
      'The rope is down to its last thread. DM: "I would not stand in the stripes."',
    ],
    vaultMiss: [
      'The vault door slams down on an empty office. Grimble files a noise complaint.',
      'All that engineering and nobody was home. The DM sighs into his Cheetos.',
    ],
    refile: [
      '{enemy} closes a loophole. Unpaid, but thorough.',
      'An intern files the paperwork. The rope tightens. Boo.',
    ],
  };
  function say(key, vars) {
    const lines = LINES[key];
    if (A().simulating || !lines || !lines.length) return '';
    vars = vars || {};
    const line = lines[Math.floor(DD.rng.next() * lines.length) % lines.length].replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? String(vars[k]) : m; });
    A().log(line, 'narrator');
    return line;
  }

  // ---- statuses -----------------------------------------------------------------------------------------
  DD.registerStatus({
    id: 'grim_takeover', name: 'Hostile Takeover', icon: '📈', color: '#7fd36b', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () { return 'Phase 2: the Audit comes as a crossing row + column, interns arrive two at a time and Hasted, he Garnishes Wages (no line of sight needed) and leaves his desk to stamp people (+' + PHASE2_MOV + ' move).'; },
  });
  /**
   * Ill-Gotten Gains: +1 damage per GAIN_PER gold he holds (max GAIN_MAX) on his at-once attacks. Stacks = gold held.
   * Not on the Audit: a Levy on his other turn could otherwise raise a pending Audit after the heroes' last look at it.
   */
  function gainsOf(stacks) { return Math.min(GCFG.gainMax, Math.floor((stacks || 0) / GCFG.gainPer)); }
  function gainsNow(u) { const st = u && DD.Act.getStatus(u, 'grim_ledger'); return st ? gainsOf(st.stacks) : 0; }
  DD.registerStatus({
    id: 'grim_ledger', name: 'Ill-Gotten Gains', icon: '💰', color: '#ffd23f', type: 'buff', stacking: 'stack', maxStacks: 999,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      return 'Grimble is holding ' + st.stacks + ' of your gold: +' + gainsOf(st.stacks) + ' damage on every attack but the Audit (+1 per ' + GAIN_PER + ' gold, up to +' + GAIN_MAX +
        '). The vault door knocks it all loose (refunded); the rest is refunded when he falls.';
    },
    telegraphFlat: function (st) { return gainsOf(st.stacks); },
    hooks: {
      modifyOutgoingDamage: function (d, st) {
        if (d.cause === 'skill' && d.source && d.source.defId === 'grimble' && !(d.skill && d.skill.id === 'grim_audit')) d.flat += gainsOf(st.stacks);
      },
    },
  });
  // stun guard (like the act 2 and 3 bosses): a stun costs him one turn, then he appeals; while the appeal is pending a
  // stun no longer costs him a turn but still interrupts his Audit (stun = THE wind-up counter); the vault always lands
  // guarded: every stun-like status (stun, sleep, frozen, a banana peel...) and charm
  function stunLike(id) { return !!(DD.Act && DD.Act.isStunLike(id)); }
  function guarded(id) { return id === 'charmed' || stunLike(id); }
  const GUARD_TURNS = 3;          // the turn he loses + his next two
  let puzzleStun = false;
  DD.registerStatus({
    id: 'grim_appeal', name: 'Appeal Pending', icon: '📎', color: '#d9c38a', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: GUARD_TURNS,
    desc: function (st) {
      return 'He appealed the last stun: stuns (sleep, freezes, banana peels...) and Charm don\'t land on him (a stun still cancels his Audit; the vault door still knocks him flat).' +
        (st && st.turns > 0 ? ' (' + plural(st.turns, 'turn') + ' of his left)' : '');
    },
  });

  // ---- painters (world objects / terrain; origin at the tile centre, +y down) -------------------------------------
  /** Striped hazard border on the edges that face non-zone tiles, plus a faint painted X. */
  function drawDropZone(g, tile) {
    const c = g.ctx;
    const edge = function (dx, dy) { const n = tile && DD.Grid ? DD.Grid.tile(tile.x + dx, tile.y + dy) : null; return !n || n.t !== 'grim_dropzone'; };
    c.save();
    c.globalAlpha = 0.5;
    g.line(-11, -5.5, 11, 5.5, '#b8322a', 2.6);
    g.line(-11, 5.5, 11, -5.5, '#b8322a', 2.6);
    c.globalAlpha = 1;
    const segs = [[edge(0, -1), [0, -13], [26, 0]], [edge(1, 0), [26, 0], [0, 13]], [edge(0, 1), [0, 13], [-26, 0]], [edge(-1, 0), [-26, 0], [0, -13]]];
    segs.forEach(function (s) {
      if (!s[0]) return;
      c.beginPath(); c.moveTo(s[1][0], s[1][1]); c.lineTo(s[2][0], s[2][1]);
      c.lineCap = 'butt'; c.lineWidth = 4.2; c.strokeStyle = '#f2c230'; c.stroke();
      c.setLineDash([4, 4]); c.strokeStyle = '#1d1810'; c.stroke(); c.setLineDash([]);
    });
    c.restore();
  }

  // ---- map rotation: the office furniture turns with the board (def.yawAware: g.box / g.diamond stand on the view's
  // ground quad). Details keep their classic yaw-0 coordinates and are moved onto the view: the very same pixels at the
  // default view, the same spot of the same physical side (or of the top) at any other; a side facing away hides its
  // details. Billboards near a block's middle (tags, stamps, levers, glows) stay billboards.
  function classic() { return DD.Iso.view().legacy; }
  /** The visible face of a block on (cx, cy, hw, hh) on physical side dir ('N' | 'E' | 'S' | 'W'), or null (facing away). */
  function sideFace(g, dir, cx, cy, hw, hh) {
    const fs = g.faces(cx, cy, hw, hh);
    for (let i = 0; i < fs.length; i++) if (fs[i].dir === dir) return fs[i];
    return null;
  }
  /**
   * A point drawn at yaw 0 on a block's left ('L': its S side) or right ('R': its E side) face, put on the visible face f
   * at the same spot (exactly [px, py] at the default view).
   */
  function onFace(f, side, cx, cy, hw, hh, px, py) {
    if (classic()) return [px, py];
    const s = (side === 'L' ? px - cx + hw : px - cx) / hw;
    return f.at(s, cy + hh * (side === 'L' ? s : 1 - s) - py);
  }
  /** A point drawn at yaw 0 `h` px above the square (cx, cy, hw, hh) (on a block's top), in the current view. */
  function onTop(g, cx, cy, hw, hh, h, px, py) {
    if (classic()) return [px, py];
    const a = (px - cx) / hw, b = (py + h - cy) / hh;
    return g.on(cx, cy, hw, hh, (a + b) / 2, (b - a) / 2, h);
  }
  function quadPoly(c, q) { c.beginPath(); c.moveTo(q[0][0], q[0][1]); c.lineTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1]); c.lineTo(q[3][0], q[3][1]); c.closePath(); }

  function drawLoophole(g, obj) {
    const c = g.ctx, d = obj.data || {}, t = g.t || 0;
    const jam = gread().jam > 0, on = !!d.on;
    g.ellipse(0, 1, 13, 6, 'rgba(0,0,0,0.3)');
    g.box(0, 0, 10, 5, 13, { top: '#7a5534', left: '#5f4127', right: '#4b331f' }, true);
    g.diamond(0, -13, 7, 3.5, '#3a281a');
    // the brass lever
    const a = on ? 0.7 : -0.7;
    const ex = Math.sin(a) * 16, ey = -13 - Math.cos(a) * 15;
    g.line(0, -13, ex, ey, '#1a1014', 3.6);
    g.line(0, -13, ex, ey, jam ? '#8a8a8a' : '#d4af37', 2.1);
    g.circle(ex, ey, 3.3, jam ? '#9a9a9a' : on ? '#43c463' : '#d8443a', true);
    g.circle(ex - 1, ey - 1, 1, 'rgba(255,255,255,0.65)');
    // a paper tag: "§ LOOPHOLE"
    const sway = Math.sin(t * 2 + (obj.data && obj.data.n || 0)) * 0.6;
    c.save(); c.translate(-6, -8 + sway);
    g.poly([[-4, -4], [3, -5.5], [4, 3], [-3, 4.5]], '#f3ecd6', true);
    g.text('§', 0, -0.4, 6, '#7a2a1a');
    c.restore();
    if (jam) {
      c.save(); c.translate(3, -6); c.rotate(-0.3);
      g.rect(-7, -3, 14, 6, 'rgba(200,40,30,0.85)', true, 1);
      g.text('VOID', 0, 0, 4.6, '#fff4e0');
      c.restore();
    } else if (on) {
      g.glow(0, -14, 22, '#ffd23f', 0.35 + 0.15 * Math.sin(t * 5));
    } else {
      g.glow(ex, ey, 7, '#ff6a5a', 0.25 + 0.15 * Math.sin(t * 4));
    }
  }

  function drawVault(g, obj) {
    const c = g.ctx, d = obj.data || {}, t = g.t || 0;
    const down = !!d.down;
    // the hoisted door: a fat round slab hanging from a frayed rope over the drop zone; it turns with the board, and is
    // drawn behind the vault while it hangs on the far side
    const hang = onTop(g, 0, 0, 18, 9, 50, -22, -50);
    const door = function () {
      const sw = Math.sin(t * 1.3) * 1.5;
      c.save(); c.translate(hang[0] + sw, hang[1]);
      g.line(0, -30, 0, -11, '#8a6a3a', 2.2);
      g.line(-0.8, -24, 0.9, -22, '#c9a36a', 1);
      g.ellipse(0, 4, 14, 15, '#9aa2ab', true);
      g.ellipse(0, 4, 10.5, 11.5, '#b6bdc5', '#5d636b');
      for (let i = 0; i < 8; i++) { const an = i * TAU / 8 + t * 0.2; g.circle(Math.cos(an) * 12.3, 4 + Math.sin(an) * 13.2, 0.9, '#5d636b'); }
      g.circle(0, 4, 4, '#d4af37', true);
      for (let i = 0; i < 4; i++) { const an = i * TAU / 4 + t; g.line(0, 4, Math.cos(an) * 6.5, 4 + Math.sin(an) * 6.5, '#7d6420', 1.3); }
      c.restore();
    };
    const doorBehind = !down && hang[1] + 50 < -0.5;
    g.ellipse(0, 2, 22, 11, 'rgba(0,0,0,0.35)');
    if (doorBehind) door();
    g.box(0, 0, 18, 9, 54, { top: '#7c838c', left: '#5d636b', right: '#474c53' }, true);
    // the opening on the south face (toward the drop zone; the camera-facing left face by default), with gold inside
    const south = sideFace(g, 'S', 0, 0, 18, 9);
    if (south) {
      const P = function (x, y) { return onFace(south, 'L', 0, 0, 18, 9, x, y); };
      c.save();
      quadPoly(c, [P(-15, -8), P(-3, -2), P(-3, -36), P(-15, -42)]);
      c.fillStyle = '#1c1612'; c.fill(); c.strokeStyle = '#1a1014'; c.lineWidth = 1.2; c.stroke();
      c.clip();
      for (let i = 0; i < 9; i++) {
        const p = P(-14 + (i % 3) * 4.2, -10 - Math.floor(i / 3) * 3 + (i % 2));
        g.ellipse(p[0], p[1], 2.6, 1.3, '#f0c040', 'rgba(110,70,10,0.9)');
      }
      const gl = P(-9, -14);
      g.glow(gl[0], gl[1], 12, '#ffd23f', 0.35);
      c.restore();
    }
    // rivets on the plain steel sides
    g.faces(0, 0, 18, 9).forEach(function (f) {
      if (f.dir === 'S') return;
      for (let i = 0; i < 4; i++) {
        const a = onFace(f, 'R', 0, 0, 18, 9, 4 + i * 3.5, -44 + i * 1.75), b = onFace(f, 'R', 0, 0, 18, 9, 4 + i * 3.5, -6 + i * 1.75);
        g.circle(a[0], a[1], 0.9, '#c9ced6'); g.circle(b[0], b[1], 0.9, '#c9ced6');
      }
    });
    if (!down) {
      if (!doorBehind) door();
    } else {
      c.save(); c.translate(8, -30); c.rotate(-0.15);
      g.rect(-9, -4, 18, 8, '#f3ecd6', true, 1);
      g.text('UNDER', 0, -1.5, 3.6, '#a8261c'); g.text('REVIEW', 0, 1.9, 3.6, '#a8261c');
      c.restore();
    }
  }

  function drawDesk(g) {
    const t = g.t || 0;
    g.ellipse(0, 2, 17, 8.5, 'rgba(0,0,0,0.3)');
    g.box(0, 0, 15, 7.5, 15, { top: '#8e5f36', left: '#6f4828', right: '#5a3a20' }, true);
    // paper towers, a quill, a rubber stamp (standing on the top: they turn with the board)
    const on = function (x, y) { return onTop(g, 0, 0, 15, 7.5, 15, x, y); };
    const stack = function (p, n) { for (let i = 0; i < n; i++) g.box(p[0] + (i % 2 ? 0.6 : -0.4), p[1] - i * 2.1, 5.5, 2.7, 2.1, { top: '#f6f1e2', left: '#d9d2bd', right: '#c4bca5' }, 'rgba(60,40,30,0.6)'); };
    const q = on(4, -16);
    stack(on(-6, -15), 5); stack(q, 3);
    g.line(q[0] + 2, q[1] - 6, q[0] + 6, q[1] - 14 + Math.sin(t * 2) * 0.6, '#f2f2f2', 2.2);
    g.line(q[0] + 2, q[1] - 6, q[0] + 6, q[1] - 14 + Math.sin(t * 2) * 0.6, '#3a3a3a', 0.6);
    const sp = on(0.2, -16);
    g.rect(sp[0] - 1.7, sp[1] - 4, 3.4, 4, '#b8322a', true, 0.8);
  }

  function drawCabinet(g, obj) {
    const c = g.ctx;
    g.ellipse(0, 2, 14, 7, 'rgba(0,0,0,0.3)');
    g.box(0, 0, 11, 5.5, 36, { top: '#9aa0a8', left: '#7b828b', right: '#636970' }, true);
    // drawer seams round every side; handles, the escaping paperwork (south) and the dent (east) on their own sides
    const fs = g.faces(0, 0, 11, 5.5);
    for (let k = 1; k < 3; k++) {
      const h = k * 12;
      fs.forEach(function (f) { g.line(f.x0, f.y0 - h, f.x1, f.y1 - h, '#4e5359', 1); });
    }
    const south = sideFace(g, 'S', 0, 0, 11, 5.5), east = sideFace(g, 'E', 0, 0, 11, 5.5);
    if (south) {
      for (let k = 0; k < 3; k++) { const p = onFace(south, 'L', 0, 0, 11, 5.5, -6.8, 1.4 - k * 12 - 7); g.rect(p[0], p[1], 3.4, 1.6, '#d4af37', null); }
      const p = onFace(south, 'L', 0, 0, 11, 5.5, -5, -31);
      c.save(); c.translate(p[0], p[1]); c.rotate(-0.4);
      g.rect(-2.5, -3, 5, 4, '#f6f1e2', 'rgba(60,40,30,0.6)');
      c.restore();
    }
    if (east && obj && obj.maxHp > 0 && obj.hp < obj.maxHp) {
      const a = onFace(east, 'R', 0, 0, 11, 5.5, 2, -30), b = onFace(east, 'R', 0, 0, 11, 5.5, 7, -22);
      g.line(a[0], a[1], b[0], b[1], '#2a2d31', 1.2);
    }
  }

  // ---- terrain & objects ------------------------------------------------------------------------------------
  DD.registerTerrain({
    id: 'grim_dropzone', name: 'DROP ZONE', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#c9c2b4', left: '#a59e90', right: '#8d877b' },
    desc: 'Directly under the hoisted vault door. When all three Tax Loopholes are exploited, everyone here loses all Block, takes ' + VAULT_DMG + ' damage and is Stunned (Grimble for both of his next turns, and he drops all the gold he stole). Grimble works here.',
    draw: drawDropZone,
  });

  DD.registerObject({
    id: 'grim_loophole', name: 'Tax Loophole', blocksMove: true, blocksLos: false, hp: 0, height: 1, color: '#c9a227', yawAware: true,
    desc: 'Interact (1 AP): exploit it. All three exploited: the vault door drops on the striped DROP ZONE — everyone there loses all Block, takes ' + VAULT_DMG +
      ' damage and is Stunned (Grimble for his next 2 turns; he is also Vulnerable and every coin he stole spills back to you). Interns close exploited loopholes. After a drop they are under review for ' + REVIEW_ROUNDS + ' rounds (+2 per later drop).',
    available: function (o) { return !(o.data && o.data.on) && !(gread().jam > 0); },
    interact: { ap: 1, label: 'Exploit Loophole', fn: function (unit, o, tile) { return exploit(unit, o, tile); } },
    autoplay: function (unit, o, tile, s) { return loopholeValue(unit, o, s); },
    onRoundEnd: function (o, tile, s) { tickReview(s); },
    draw: drawLoophole,
  });

  DD.registerObject({
    id: 'grim_vault', name: 'The Vault', blocksMove: true, blocksLos: true, hp: 0, height: 2.2, color: '#7c838c', dmg: VAULT_DMG, yawAware: true,
    desc: 'Grimble\'s vault. Its door hangs from one frayed rope above the striped DROP ZONE. Three Tax Loopholes would cut it.',
    onRoundEnd: function (o, tile, s) { tickReview(s); },
    draw: drawVault,
  });

  DD.registerObject({
    id: 'grim_desk', name: 'Grimble\'s Desk', blocksMove: true, blocksLos: false, hp: 0, height: 0.7, color: '#8e5f36', yawAware: true,
    desc: 'Blocks movement. The paperwork on it is load-bearing.',
    draw: drawDesk,
  });

  DD.registerObject({
    id: 'grim_cabinet', name: 'Filing Cabinet', blocksMove: true, blocksLos: true, hp: 6, height: 1.2, color: '#7b828b', yawAware: true,
    desc: 'Blocks movement and line of sight (cover from his Levy; Red Tape and Garnish Wages need none). 6 HP: when destroyed it releases a blizzard of receipts (smoke in radius 1 for 2 rounds).',
    onDestroyed: function (o, tile) {
      DD.FX.particles(tile, { kind: 'feathers', color: '#f6f1e2', count: 16 });
      G().shape('circle', { x: tile.x, y: tile.y }, null, 1).forEach(function (p) { A().setSurface(p.x, p.y, 'smoke', 2); });
      A().log('The filing cabinet bursts into a blizzard of receipts.', 'system');
    },
    draw: drawCabinet,
  });

  // ---- FX painters (screen space) -----------------------------------------------------------------------------
  function drawFallingDoor(c, x, y, p, view) {
    const z = (view && view.zoom) || 1;
    const k = p * p;
    const dy = (1 - k) * 300 * z;
    c.save();
    c.fillStyle = 'rgba(0,0,0,' + (0.12 + 0.45 * k) + ')';
    c.beginPath(); c.ellipse(x, y, (18 + 40 * k) * z, (9 + 20 * k) * z, 0, 0, TAU); c.fill();
    const rx = 46 * z, ry = (40 - 22 * k) * z, th = (9 + 5 * k) * z;
    c.translate(x, y - dy - ry * 0.35);
    c.lineWidth = 2.5 * z; c.strokeStyle = '#1a1014';
    // the slab's steel edge (it is a very thick door)
    c.fillStyle = '#4f555c'; c.beginPath(); c.ellipse(0, th, rx, ry, 0, 0, TAU); c.fill(); c.stroke();
    c.fillRect(-rx, 0, rx * 2, th);
    c.beginPath(); c.moveTo(-rx, 0); c.lineTo(-rx, th); c.moveTo(rx, 0); c.lineTo(rx, th); c.stroke();
    c.fillStyle = '#8f979f'; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#b6bdc5'; c.beginPath(); c.ellipse(0, -2 * z, rx * 0.76, ry * 0.76, 0, 0, TAU); c.fill();
    c.fillStyle = '#d4af37'; c.beginPath(); c.ellipse(0, -2 * z, rx * 0.22, ry * 0.22, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#5d636b';
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10; c.beginPath(); c.arc(Math.cos(a) * rx * 0.88, Math.sin(a) * ry * 0.88, 2 * z, 0, TAU); c.fill(); }
    c.restore();
  }

  function drawPaperRain(c, x, y, p, view) {
    const z = (view && view.zoom) || 1;
    c.save();
    for (let i = 0; i < 3; i++) {
      const q = Math.min(1, p * 1.25 + i * 0.12);
      const px = x + (i - 1) * 9 * z + Math.sin(q * 9 + i) * 5 * z;
      const py = y - (1 - q) * 110 * z - 6 * z;
      c.save(); c.translate(px, py); c.rotate(Math.sin(q * 7 + i * 2) * 0.9);
      c.globalAlpha = q >= 1 ? 0.5 : 1;
      c.fillStyle = '#f6f1e2'; c.strokeStyle = '#3a2a20'; c.lineWidth = 1 * z;
      c.fillRect(-5 * z, -6.5 * z, 10 * z, 13 * z); c.strokeRect(-5 * z, -6.5 * z, 10 * z, 13 * z);
      c.fillStyle = '#9a8f80';
      for (let l = 0; l < 3; l++) c.fillRect(-3.5 * z, (-4 + l * 3) * z, 7 * z, 0.9 * z);
      c.fillStyle = '#b8322a'; c.fillRect(1 * z, 3.2 * z, 3 * z, 2 * z);
      c.restore();
    }
    c.restore();
  }

  // ---- puzzle ------------------------------------------------------------------------------------------------
  /** Rounds the loopholes stay under review after the n-th drop (3, 5, 7...). */
  function reviewRounds(n) { return REVIEW_ROUNDS + 2 * Math.max(0, (n || 1) - 1); }
  /** Vault door damage (the vault def's dmg; VAULT_DMG unless a balance run tunes it). */
  function vaultDmg() { const d = DD.getObject('grim_vault'); return d && d.dmg > 0 ? d.dmg : VAULT_DMG; }

  function relabel(s) {
    s = s || S();
    const g = gread(s);
    loopholes(s).forEach(function (l, i) {
      const o = l.obj;
      if (!o.data.name) o.data.name = LOOPHOLE_NAMES[i % LOOPHOLE_NAMES.length];
      o.label = 'Tax Loophole: ' + o.data.name + (o.data.on ? ' (EXPLOITED)' : g.jam > 0 ? ' (under review: ' + plural(g.jam, 'round') + ')' : '');
    });
  }

  /** After a drop: count the review down once per round end; then the door goes back up and the loopholes reopen. */
  function tickReview(s) {
    s = s || S();
    const g = gread(s);
    if (!(g.jam > 0) || g.jamTick === s.round) return;
    const w = gdata(s);
    w.jamTick = s.round;
    w.jam--;
    if (w.jam <= 0) {
      w.jam = 0;
      const vt = vaultTile(s);
      if (vt) { vt.obj.data.down = false; DD.FX.text(vt, 'Winched back up!', { color: '#ffe066', size: 14 }); }
      A().log('The interns winch the vault door back up. The loopholes are open for business again.', 'enemy');
    }
    relabel(s);
  }

  function exploit(unit, o, tile) {
    const s = S();
    if (!s || !o || !o.data) return false;
    const g = gdata(s);
    if (o.data.on || g.jam > 0) return false;
    o.data.on = true;
    g.pulls++;
    const list = loopholes(s);
    const on = list.filter(function (l) { return l.obj.data.on; }).length;
    relabel(s);
    DD.FX.tile(tile.x, tile.y, 'glow', { color: '#ffd23f' });
    DD.FX.particles(tile, { kind: 'coins', count: 8 });
    DD.FX.sound('coin');
    DD.FX.text(tile, 'LOOPHOLE ' + on + '/' + list.length + '!', { color: '#ffe066', size: 16 });
    A().log(unit.name + ' exploits the ' + o.data.name + ' loophole (' + on + '/' + list.length + ').', 'hero');
    if (on >= list.length) dropVault(unit);
    else say(on === list.length - 1 ? 'loopholeLast' : 'loophole', { hero: unit.name, n: on });
    return true;
  }

  /**
   * Party gold back. A refund is not income: in a live run it skips the party's passive gold bonus (a Trust Fund made
   * being robbed profitable); previews and sandboxes go through DD.Act as usual.
   */
  function giveBack(n) {
    const s = S();
    if (s && s.run && !A().simulating && DD.Run && DD.Run.state === s.run && typeof DD.Run.addGold === 'function') {
      DD.Run.addGold(n, { raw: true });
      A().touch();
      DD.FX.sound('coin');
      return n;
    }
    return A().gainGold(n);
  }

  /** Give back every coin Grimble is holding (Ill-Gotten Gains resets). lead: log line start. Returns the amount. */
  function refund(u, lead) {
    const n = (u && u.data && u.data.stolen) || 0;
    if (n <= 0) return 0;
    u.data.stolen = 0;
    giveBack(n);
    if (!u.dead && DD.Act.hasStatus(u, 'grim_ledger')) A().removeStatus(u, 'grim_ledger', { text: 'Refund!' });
    DD.FX.particles(u, { kind: 'coins', count: 24 });
    DD.FX.text(u, '+' + n + ' gold refunded!', { color: '#ffe066', size: 16 });
    A().log(lead + n + ' gold loose from Grimble\'s ledger: refunded to the party!', 'hero');
    return n;
  }

  /** Cut the rope: the vault door lands on the DROP ZONE (or on Grimble himself on an arena without one). */
  function dropVault(src) {
    const s = S();
    const g = gdata(s);
    g.drops++;
    const zone = zoneTiles(s);
    const boss = grimble(s);
    let victims = [];
    zone.forEach(function (p) { const u = G().unitAt(p.x, p.y); if (active(u) && victims.indexOf(u) < 0) victims.push(u); });
    if (!zone.length && active(boss)) victims = [boss];
    const at = zone.length ? center(zone) : boss ? { x: boss.x, y: boss.y } : null;
    DD.FX.banner('LOOPHOLE EXPLOITED!', { sub: 'The vault door is coming down!', color: '#ffd23f', ms: 1100 });
    if (at) DD.FX.custom('custom', { at: at, ms: 560, draw: drawFallingDoor });
    DD.FX.shake(18, 650);
    DD.FX.sound('explosion');
    if (at) DD.FX.explosion(at, { radius: 1, color: '#c8ccd2' });
    zone.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'crack', { parallel: i > 0 }); });
    A().log('KA-THOOOM! The vault door drops onto the DROP ZONE.', 'dmg');
    let hitBoss = false;
    A().withCredit(src || null, function () {
      victims.forEach(function (u) {
        if (!active(u)) return;
        if (u.block > 0) { u.block = 0; DD.FX.block(u, 0); DD.FX.text(u, 'Block stripped!', { color: '#cfe3ff', size: 14 }); A().touch(); }
        const dealt = A().damage(src || null, u, vaultDmg(), { cause: 'terrain', ignoreBlock: true, ignoreArmor: true, tags: ['vault'], silent: true });
        A().log(u.name + ' is flattened by the vault door: ' + dealt + ' damage.', u.side === 'hero' ? 'enemy' : 'dmg');
        if (u.defId === 'grimble') hitBoss = true;
        if (!active(u)) return;
        const taxman = u.defId === 'grimble';
        puzzleStun = true;
        try { A().addStatus(u, 'stun', { turns: taxman ? GCFG.vaultStun || VAULT_STUN : 1 }, src || null); } finally { puzzleStun = false; }
        if (taxman && active(u)) {
          A().addStatus(u, 'vulnerable', { turns: 2 * (GCFG.vaultStun || VAULT_STUN) }, src || null);
          A().bark(u, 'vault');
          refund(u, 'The vault door knocks ');
        }
      });
    });
    if (hitBoss) { g.hits++; A().narrate('grim_vault_hit', { hero: src ? src.name : 'the party' }); }
    else say('vaultMiss', {});
    loopholes(s).forEach(function (l) { l.obj.data.on = false; });
    g.jam = reviewRounds(g.drops);
    g.jamTick = -1;
    const vt = vaultTile(s);
    if (vt) vt.obj.data.down = true;
    relabel(s);
  }

  /** An intern that can stand next to loophole l on its next turn (it would close it at once). */
  function threatened(l, s) {
    return interns(s).some(function (i) {
      if (out(i)) return false;
      if (dist(i, l) === 1) return true;
      const mov = DD.Act.cantMove(i) ? 0 : DD.Combat.effectiveMov(i);
      if (!mov || dist(i, l) > mov + 1) return false;
      let near = false;
      G().reachable(i, mov).forEach(function (e) { if (!near && dist(e, l) === 1 && !G().unitAt(e.x, e.y)) near = true; });
      return near;
    });
  }

  /**
   * AutoPlay hint: progress pulls are worth a solid attack, unless an intern can get to an exploited loophole (this
   * one included) on its next turn and undo the work (then deal with the intern first); the last pull is worth what
   * the drop hits right now.
   */
  function loopholeValue(unit, o, s) {
    s = s || S();
    if (GCFG.noHint || !s || !o || !o.data || o.data.on || gread(s).jam > 0) return 0;
    const list = loopholes(s);
    const on = list.filter(function (l) { return l.obj.data.on; }).length;
    if (on + 1 < list.length) {
      const here = list.filter(function (l) { return l.obj === o; })[0];
      const undone = list.some(function (l) { return (l.obj.data.on || l === here) && threatened(l, s); });
      return undone ? 6 : 16 + on * 4;
    }
    const zone = zoneTiles(s);
    if (!zone.length) return active(grimble(s)) ? 60 : 0;
    let v = 0, heroIn = false, boss = false;
    zone.forEach(function (p) {
      const u = G().unitAt(p.x, p.y);
      if (!active(u)) return;
      if (u.side === 'hero') heroIn = true;
      else if (u.defId === 'grimble') { boss = true; v += 60; } else v += 8;
    });
    // a drop that only squashes interns wastes the puzzle (and starts the review): wait for the taxman himself
    return heroIn || !boss ? 0 : v;
  }

  // ---- skills -------------------------------------------------------------------------------------------------
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; def.cooldown = def.cooldown || 0; return DD.registerSkill(def); }

  /** Levy / Garnish Wages: hit the hero, then pocket the party's gold (Block now, Ill-Gotten Gains for later). */
  function levyExecute(ctx) {
    const u = ctx.user, L = ctx.L;
    ctx.foes.forEach(function (f) {
      DD.FX.projectile(u, f, { kind: 'coin', color: '#ffd23f' });
      A().damage(u, f, L.dmg, { noHighGround: true });
    });
    const took = ctx.foes.some(function (f) { return f.side === 'hero'; }) ? A().loseGold(L.gold) : 0;
    if (took > 0) {
      u.data.stolen = (u.data.stolen || 0) + took;
      A().addStatus(u, 'grim_ledger', { stacks: took, silent: true }, u);
      DD.FX.text(u, '+' + took + ' gold (yours)', { color: '#ffd76a', size: 15 });
      const blk = Math.ceil(took / 2);
      A().log('Grimble levies ' + took + ' gold from the party and buys ' + blk + ' Block with it. "For the paperwork." (Ill-Gotten Gains: holding ' +
        u.data.stolen + ' gold, +' + gainsOf(u.data.stolen) + ' damage.)', 'enemy');
      A().addBlock(u, blk);
    } else if (ctx.foes.length) DD.FX.text(u, 'You\'re broke?!', { color: '#d0d0d0', size: 13 });
  }

  eskill({
    id: 'grim_levy', name: 'Levy', icon: '💰', kind: 'attack', tags: ['ranged', 'gold'], anchor: 'unit',
    levels: [{ dmg: 11, gold: 10 }],
    target: { type: 'unit', range: [1, 7], los: true, filter: 'enemy' },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage to the biggest spender in sight (the hero who has dealt the most damage, up to 7 tiles away) and steal up to ' + L.gold +
        ' party gold. He gains Block equal to half the gold stolen (rounded up).';
    },
    flavor: 'Taxes are the price of living in a dungeon.',
    execute: levyExecute,
  });

  eskill({
    id: 'grim_garnish', name: 'Garnish Wages', icon: '💸', kind: 'attack', tags: ['ranged', 'gold'], anchor: 'unit',
    levels: [{ dmg: 13, gold: 15 }],
    target: { type: 'unit', range: [1, 30], los: false, filter: 'enemy' },
    desc: function (L) {
      return 'Phase 2 Levy: deal ' + L.dmg + ' damage to the biggest spender anywhere in the office (no line of sight needed) and steal up to ' + L.gold +
        ' party gold. He gains Block equal to half the gold stolen (rounded up).';
    },
    flavor: 'Death and taxes. He handles both.',
    execute: levyExecute,
  });

  eskill({
    id: 'grim_redtape', name: 'Red Tape', icon: '🎀', kind: 'attack', tags: ['ranged', 'root'], anchor: 'unit',
    levels: [{ dmg: 3, turns: 1 }],
    target: { type: 'unit', range: [1, 30], los: false, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to any hero in the office (no line of sight needed) and Root them for ' + plural(L.turns, 'turn') + '.'; },
    flavor: 'Please hold. Your adventure is important to us.',
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        DD.FX.beam(ctx.user, f, { color: '#d0302a', width: 3 });
        DD.FX.text(f, 'PLEASE HOLD', { color: '#ff8a7a', size: 14 });
        A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true });
        if (active(f)) A().addStatus(f, 'root', { turns: ctx.L.turns }, ctx.user);
      });
    },
  });

  // wind-up only (DD.AI.windUp): not in his skill list, so threat shading and AutoPlay never read it as a strike now
  eskill({
    id: 'grim_audit', name: 'Audit', icon: '📑', kind: 'attack', tags: ['aoe', 'windup'], anchor: 'ground',
    levels: [{ dmg: 18 }],
    target: { type: 'tile', range: [0, 40], los: false, filter: 'any' },
    area: { shape: 'custom', fn: function (ctx) { return ctx && ctx.target ? lane('row', ctx.target.y) : []; } },
    desc: function (L) { return 'Wind-up (lands one round later): deal ' + L.dmg + ' damage to every hero in the marked row or column.'; },
    flavor: 'Form 27-B, in triplicate, at terminal velocity.',
    // Ill-Gotten Gains don't apply to the Audit: cancel the status flat the engine adds to wind-up numbers
    telegraphFlat: function (unit) { return -gainsNow(unit); },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      DD.FX.sound('arrow');
      ctx.tiles.forEach(function (p, i) { DD.FX.custom('custom', { at: p, ms: 420, draw: drawPaperRain, parallel: i > 0 }); });
      ctx.foes.forEach(function (f) { DD.FX.text(f, 'AUDITED!', { color: '#ff8a7a', size: 15 }); });
      A().damageTiles(u, ctx.tiles, L.dmg, { filter: 'foes', noHighGround: true });
    },
  });

  // cooldown 1: never two of his turns in a row (melee heroes can stay on him between stamps)
  eskill({
    id: 'grim_stamp', name: 'Rubber Stamp of Denial', icon: '🔨', kind: 'attack', tags: ['melee', 'push'], anchor: 'self', cooldown: 1,
    levels: [{ dmg: 11, push: 2 }],
    target: { type: 'self' }, area: { shape: 'adjacent' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every hero on the 4 tiles next to him and push them ' + L.push + ' tiles away.'; },
    flavor: 'Request: denied. Appeal: denied. Face: stamped.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      DD.FX.shake(5, 200);
      DD.FX.particles(u, { kind: 'dust', count: 10 });
      ctx.foes.forEach(function (f) {
        DD.FX.lunge(u, f, { parallel: true });
        DD.FX.text(f, 'DENIED', { color: '#ff5a4a', size: 18 });
        A().damage(u, f, L.dmg, { noHighGround: true });
        if (active(f)) A().knockback(u, f, L.push);
      });
    },
  });

  eskill({
    id: 'grim_hire', name: 'Hire Intern', icon: '📋', kind: 'summon', tags: ['summon'], anchor: 'self',
    levels: [{ n: 1, cap: 3 }, { n: 2, cap: 4, haste: true }],
    target: { type: 'self' },
    desc: function (L) {
      return 'Hire ' + L.n + ' Goblin Intern' + (L.n === 1 ? '' : 's') + (L.haste ? ' who arrive Hasted' : '') +
        ' at the break-room doors (never more than ' + L.cap + ' on the payroll).';
    },
    flavor: 'Unpaid, but they get exposure. Mostly to adventurers.',
    execute: function (ctx) { hireInterns(ctx.user, ctx.L.n, ctx.L.cap, !!ctx.L.haste); },
  });

  // interns
  eskill({
    id: 'grim_papercut', name: 'Paper Cut', icon: '📄', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 4, bleed: 1 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent hero and Bleed ' + L.bleed + '.'; },
    flavor: 'Weaponized stationery. The worst kind of cut.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.lunge(ctx.user, ctx.target);
      ctx.foes.forEach(function (f) {
        A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true });
        if (active(f)) A().addStatus(f, 'bleed', { stacks: ctx.L.bleed }, ctx.user);
      });
    },
  });

  eskill({
    id: 'grim_refile', name: 'Close Loophole', icon: '🗂️', kind: 'utility', tags: ['puzzle'], anchor: 'ground',
    levels: [{ n: 1 }],
    target: { type: 'tile', range: [1, 1], filter: 'object', los: false },
    desc: function () { return 'Close an adjacent exploited Tax Loophole.'; },
    flavor: '"Is this for credit?"',
    aiScore: function () { return 0; },
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      const t = p ? G().tile(p.x, p.y) : null;
      const o = t && t.obj;
      if (!o || o.id !== 'grim_loophole' || !o.data || !o.data.on) { DD.FX.text(u, 'Nothing to file.', { color: '#d0d0d0', size: 13 }); return; }
      if (dist(u, p) !== 1) { DD.FX.text(u, 'Can\'t reach the paperwork!', { color: '#d0d0d0', size: 13 }); return; }
      o.data.on = false;
      gdata().refiles++;
      relabel();
      DD.FX.lunge(u, t);
      DD.FX.tile(t.x, t.y, 'pulse', { color: '#b8322a' });
      DD.FX.text(t, 'Loophole closed', { color: '#ff9a8a', size: 14 });
      A().log(u.name + ' closes the ' + o.data.name + ' loophole. "Is this for credit?"', 'enemy');
      if (DD.rng.next() < 0.5) say('refile', { enemy: u.name });
    },
  });

  // ---- interns -------------------------------------------------------------------------------------------------
  function hireInterns(boss, n, cap, haste) {
    const s = S();
    if (!s || !boss) return [];
    const room = Math.max(0, cap - interns(s).length);
    const want = Math.min(n, room);
    const hired = [];
    if (want <= 0) { DD.FX.text(boss, 'Hiring freeze!', { color: '#d0d0d0', size: 14 }); return hired; }
    const doors = tilesWhere(s, function (t) { return t.tag === 'grim_door'; }).filter(function (t) { return G().isFree(t.x, t.y) && !G().isDrop(t.x, t.y); });
    const near = G().emptyTilesNear(boss.x, boss.y, 3).filter(function (p) { return !G().isDrop(p.x, p.y) && !inZone(p); });
    const spots = doors.map(function (t) { return { x: t.x, y: t.y }; }).concat(near);
    for (let i = 0; i < want; i++) {
      const p = spots[i] || { x: boss.x, y: boss.y };
      const u = A().spawn('grim_intern', p.x, p.y, { silent: true });
      if (!u) continue;
      u.name = 'Intern ' + INTERN_NAMES[Math.floor(DD.rng.next() * INTERN_NAMES.length) % INTERN_NAMES.length];
      if (haste) A().addStatus(u, 'haste', { turns: 2 }, boss);
      A().log('Grimble hires ' + u.name + '. Unpaid. "For the exposure."', 'enemy');
      A().maybeBark(u, 'spawn', 0.6);
      hired.push(u);
    }
    return hired;
  }

  /** The exploited loophole this intern goes and closes: the nearest one no other intern has claimed (unit.data.claim). */
  function claimLoophole(unit, s) {
    if (gread(s).jam > 0) return null;
    const claimed = {};
    interns(s).forEach(function (o) { if (o !== unit && o.data && o.data.claim) claimed[o.data.claim] = 1; });
    let best = null, bd = Infinity;
    loopholes(s).forEach(function (l) {
      if (!l.obj.data.on || claimed[l.x + ',' + l.y]) return;
      const d = dist(unit, l);
      if (d < bd) { bd = d; best = l; }
    });
    return best;
  }

  /** Intern turn: walk to an exploited loophole and close it (at once if it gets next to it); otherwise a plain turn. */
  function internPlan(unit, api) {
    const s = api.state;
    const lever = claimLoophole(unit, s);
    unit.data.claim = lever ? lever.x + ',' + lever.y : null;
    if (!lever) { api.defaultTurn(unit); return; }
    if (api.dist(unit, lever) !== 1) {
      let best = null, bestSc = Infinity;
      api.reachable(unit).forEach(function (e) {
        const aoo = api.aooCost(unit, e);
        if (aoo === Infinity || G().unitAt(e.x, e.y)) return;
        const sc = dist(e, lever) * 10 + e.cost * 0.1 + (e.hazard ? 6 : 0) + aoo;
        if (sc < bestSc) { bestSc = sc; best = e; }
      });
      if (best && dist(best, lever) < api.dist(unit, lever)) api.moveTo(unit, best.x, best.y);
    }
    if (out(unit)) return;
    if (api.dist(unit, lever) === 1) {
      api.act(unit, 'grim_refile', { x: lever.x, y: lever.y }, {});
      unit.data.claim = null;
      return;
    }
    // still on the way: poke whoever is next to it
    const hit = api.bestAttack(unit, { skills: ['grim_papercut'], noMove: true });
    if (hit) api.act(unit, 'grim_papercut', hit.target, {});
  }

  // ---- Grimble's planner (v2: walk, ONE action, then wind up the next Audit) ---------------------------------
  function lane(kind, idx) {
    const s = S();
    const res = [];
    if (!s || !s.grid) return res;
    const n = kind === 'row' ? s.grid.w : s.grid.h;
    for (let i = 0; i < n; i++) {
      const x = kind === 'row' ? i : idx, y = kind === 'row' ? idx : i;
      const t = G().tile(x, y);
      if (!t) continue;
      const td = G().terrain(t);
      if (td.walkable === false && !td.pit && !td.liquid) continue;
      res.push({ x: x, y: y });
    }
    return res;
  }
  function laneKey(kind, idx) { return kind + ':' + idx; }
  function pendingAudits(unit) { return (unit.intents || []).filter(function (it) { return it.skillId === 'grim_audit'; }); }

  /** The best rows/columns to audit: most heroes caught (healthy ones count a little more, a rooted one a lot more). */
  function bestLanes(unit, foes, count) {
    const taken = {};
    pendingAudits(unit).forEach(function (it) { if (it.data && it.data.lane) taken[it.data.lane] = 1; });
    const cands = {};
    foes.forEach(function (f) {
      [['row', f.y], ['col', f.x]].forEach(function (k) {
        const key = laneKey(k[0], k[1]);
        if (taken[key] || cands[key]) return;
        let sc = 0;
        foes.forEach(function (o) {
          if ((k[0] === 'row' ? o.y : o.x) !== k[1]) return;
          sc += 10 + 2 * (o.hp / Math.max(1, o.maxHp));
          if (DD.Act.hasStatus(o, 'root')) sc += 15;      // stuck in Red Tape: can't walk out of the lane
        });
        cands[key] = { kind: k[0], idx: k[1], key: key, score: sc, anchor: { x: f.x, y: f.y } };
      });
    });
    const list = Object.keys(cands).map(function (k) { return cands[k]; }).sort(function (a, b) { return b.score - a.score || (a.kind < b.kind ? -1 : 1) || a.idx - b.idx; });
    if (count <= 1) return list.slice(0, 1);
    const row = list.filter(function (l) { return l.kind === 'row'; })[0], col = list.filter(function (l) { return l.kind === 'col'; })[0];
    return [row, col].filter(Boolean).slice(0, count);
  }

  /** How many turns a round he takes (his initiative entries; the def's turnsPerRound before initiative). */
  function turnsPerRound(unit) {
    const s = S();
    const n = s && s.order ? s.order.filter(function (e) { return e.unitId === unit.id; }).length : 0;
    return Math.max(1, n || Math.round(+(DD.getEnemy(unit.defId) || {}).turnsPerRound || 1));
  }
  /**
   * A wind-up that lands ONE ROUND later, at the start of this same turn of his (his other turn of the round counts it
   * down): every unit in the order, so every hero, gets exactly one turn first. The engine's hero-window rule
   * (ai.js heroWindow) is switched off for it (window 0): it would add a second round when his two turns are back to
   * back, and the round already gives everyone their turn.
   */
  function windUpRound(api, unit, skillId, target, opts) {
    opts = Object.assign({ turns: turnsPerRound(unit), noCooldown: true }, opts);
    opts.data = Object.assign({ oneRound: true }, opts.data);
    const it = api.windUp(unit, skillId, target, opts);
    if (it) it.window = 0;
    return it;
  }
  /** Turn start (before due wind-ups resolve): his one-round wind-ups ignore the hero window (see windUpRound). */
  function openWindow(unit) { (unit.intents || []).forEach(function (it) { if (it.data && it.data.oneRound) it.window = 0; }); }

  /** Wind up an Audit when none is pending: one lane through the heroes (phase 2: a crossing row + column). */
  function planAudits(unit, api, foes) {
    if (pendingAudits(unit).length || !foes.length) return 0;
    const per = unit.data.phase === 2 ? 2 : 1;
    const lanes = bestLanes(unit, foes, per);
    lanes.forEach(function (l, i) {
      windUpRound(api, unit, 'grim_audit', l.anchor, { tiles: lane(l.kind, l.idx), label: l.kind === 'row' ? 'Audit (row)' : 'Audit (column)', data: { lane: l.key },
        banner: i === 0 ? (per > 1 ? 'Grimble audits a row AND a column!' : 'Grimble audits a ' + (l.kind === 'row' ? 'row' : 'column') + '!') : false });
    });
    return lanes.length;
  }
  /** Lanes (rows / columns) of the Audits he has pending. */
  function auditLanes(unit) {
    const res = {};
    pendingAudits(unit).forEach(function (it) { if (it.data && it.data.lane) res[it.data.lane] = 1; });
    return res;
  }

  /** Damage a unit has dealt this fight (the fight's own stats). */
  function spent(u) { const s = S(); const st = s && s.stats && s.stats.units && s.stats.units[u.id]; return st ? st.dmg || 0 : 0; }
  /** The biggest spender in reach of skillId from `from`: the hero who has dealt the most damage (ties: the most hurt). */
  function levyTarget(unit, from, foes, skillId) {
    const tg = (DD.getSkill(skillId || 'grim_levy') || {}).target || {};
    const rg = tg.range || [1, 7];
    let best = null, bs = -Infinity;
    foes.forEach(function (f) {
      const dd = dist(from, f);
      if (dd < rg[0] || dd > rg[1]) return;
      if (tg.los !== false && !G().los(from, f)) return;
      const sc = spent(f) * 10 - f.hp - dd * 0.01;
      if (sc > bs) { bs = sc; best = f; }
    });
    return best;
  }
  function levyId(unit) { return unit.data.phase === 2 ? 'grim_garnish' : 'grim_levy'; }

  /** His next docket step (the inspect panel names it). */
  function nextStep(unit) {
    const pat = docketOf((unit && unit.data && unit.data.phase) || 1);
    return pat[((unit && unit.data && unit.data.step) || 0) % pat.length];
  }
  function stepName(step, phase) {
    if (step === 'levy') return phase === 2 ? 'Garnish Wages' : 'Levy';
    if (step === 'hire') return phase === 2 ? 'Hire Interns' : 'Hire Intern';
    return step === 'tape' ? 'Red Tape' : step === 'stamp' ? 'Rubber Stamp' : String(step);
  }
  function stampSlot(unit) { return DD.Combat.slotsOf(unit).filter(function (sl) { return sl.id === 'grim_stamp'; })[0] || null; }
  function stampReady(unit) { const sl = stampSlot(unit); return !!sl && !(sl.cd > 0); }

  /**
   * Where he stands this turn. atDesk: in (or back to) the DROP ZONE; otherwise (phase 2, Stamp ready) he goes and
   * stamps somebody. Walks are priced with the attacks of opportunity they provoke.
   */
  function positionGrimble(unit, api, atDesk, foes, step, stamp) {
    const zone = zoneTiles(api.state);
    const homebound = zone.length > 0 && atDesk;
    const opts = [{ x: unit.x, y: unit.y, cost: 0, path: [], here: true }];
    api.reachable(unit).forEach(function (e) { opts.push(e); });
    const shot = step === 'tape' ? 'grim_redtape' : levyId(unit);
    let best = null, bestSc = -Infinity;
    opts.forEach(function (p) {
      const risk = DD.AI.pathRisk ? DD.AI.pathRisk(unit, p) : { lethal: false, penalty: 0 };
      if (risk.lethal) return;
      const aoo = p.here ? 0 : api.aooCost(unit, p);
      if (aoo === Infinity) return;
      let sc = -risk.penalty - aoo - (p.cost || 0) * 0.1;
      if (homebound && !inZone(p)) sc -= 100 + nearestDist(p, zone) * 5;
      const adj = foes.filter(function (f) { return dist(f, p) === 1; }).length;
      const near = nearestDist(p, foes);
      // next to heroes only when the Stamp is ready (otherwise a little room to work)
      if (!atDesk) sc += adj ? 14 + adj * 2 : -near * 2;
      else if (zone.length) sc += stamp ? (adj ? 4 : 0) : -adj * 2;
      else sc += stamp && adj ? 4 : near < 3 ? -(3 - near) * 3 : -(near - 3) * 0.3;
      if (step !== 'hire' && levyTarget(unit, p, foes, shot)) sc += 6;
      if (sc > bestSc) { bestSc = sc; best = p; }
    });
    if (best && !best.here) api.moveTo(unit, best.x, best.y);
  }

  /**
   * One docket step now ('levy' / 'tape' / 'hire'). The Levy needs a hero in sight (hide behind a cabinet and that step
   * is wasted: cover is the counterplay; the fiscal-quarter takeover keeps that from stalling the fight); Red Tape
   * reaches anyone (if everyone is already Rooted he levies instead); a hiring step with a full payroll levies (else
   * tapes). He never hires just because he can't see anyone.
   */
  function docketStep(unit, api, step) {
    const order = { levy: ['levy'], tape: ['tape', 'levy'], hire: ['hire', 'levy', 'tape'] }[step] || ['levy'];
    for (let i = 0; i < order.length; i++) {
      const foes = api.foes(unit);
      const k = order[i];
      if (k === 'levy') {
        const id = levyId(unit);
        const tgt = levyTarget(unit, unit, foes, id);
        if (tgt && api.act(unit, id, tgt, { noCooldown: true })) return k;
      } else if (k === 'tape') {
        // Red Tape goes for a hero standing in a pending Audit lane (rooted, they can't walk out of it)
        const lanes = auditLanes(unit);
        const free = foes.filter(function (f) { return !DD.Act.hasStatus(f, 'root'); });
        const stuck = free.filter(function (f) { return lanes[laneKey('row', f.y)] || lanes[laneKey('col', f.x)]; });
        const tgt = levyTarget(unit, unit, stuck, 'grim_redtape') || levyTarget(unit, unit, free, 'grim_redtape');
        if (tgt && api.act(unit, 'grim_redtape', tgt, { noCooldown: true })) return k;
      } else if (k === 'hire') {
        const sl = api.slot(unit, 'grim_hire');
        const H = sl ? DD.skillLevel(DD.getSkill('grim_hire'), sl.level) : null;
        if (H && interns(api.state).length < H.cap && api.act(unit, 'grim_hire', unit, { noCooldown: true })) return k;
      }
    }
    return null;
  }

  /** Phase 2. quarterEnd: it came from the round count (the fiscal quarter ended), not from his HP. */
  function hostileTakeover(unit, quarterEnd) {
    const d = unit.data;
    d.phase = 2;
    d.step = 0;
    // phase 2 hiring numbers live in level 2 of Hire Intern (desc and execution read the slot level); the Levy slot
    // becomes Garnish Wages (its own skill: no line of sight needed)
    DD.Combat.slotsOf(unit).forEach(function (sl) {
      if (sl.id === 'grim_hire') sl.level = 2;
      if (sl.id === 'grim_levy') { sl.id = 'grim_garnish'; sl.level = 1; }
    });
    unit.mov = (unit.mov || 0) + PHASE2_MOV;
    A().addStatus(unit, 'grim_takeover', { turns: -1, silent: true }, unit);
    DD.FX.banner('HOSTILE TAKEOVER', { sub: (quarterEnd ? 'The fiscal quarter is over! ' : '') + 'Double audits. Faster interns. Grimble leaves his desk.', color: '#7fd36b', ms: 1200 });
    DD.FX.particles(unit, { kind: 'coins', count: 18 });
    A().log((quarterEnd ? 'The fiscal quarter ends. ' : '') + 'Grimble initiates a HOSTILE TAKEOVER: double audits, faster interns, and he is coming out from behind the desk!', 'enemy');
    A().narrate('grim_takeover', { enemy: unit.name });
    A().bark(unit, 'phase');
    hireInterns(unit, 2, 4, true);
  }

  /**
   * His turn: walk (phase 1: never out of the DROP ZONE), then ONE action — the Rubber Stamp if a hero stands next to
   * him and it is ready (cooldown 1: not two turns in a row), else the next docket step (Levy, Red Tape, Levy, Hire
   * Intern; phase 2: Garnish Wages, Hire, Garnish, Red Tape; a Stamp turn keeps the docket where it is) — then wind up
   * the next Audit if none is pending.
   */
  function grimblePlan(unit, api) {
    const d = unit.data;
    if (!d.phase) d.phase = 1;
    if (d.phase === 1 && unit.hp <= unit.maxHp * PHASE2_AT) hostileTakeover(unit, false);
    else if (d.phase === 1 && api.round >= (GCFG.quarterEnd || QUARTER_END)) hostileTakeover(unit, true);
    if (!active(unit)) return;
    if (!api.foes(unit).length) return;
    const step = nextStep(unit);
    const stamp = stampReady(unit);
    // phase 2: out from behind the desk to stamp somebody when the Stamp is ready, back to the desk otherwise
    positionGrimble(unit, api, d.phase === 1 || step === 'hire' || !stamp, api.foes(unit), step, stamp);
    if (out(unit)) return;
    const foes = api.foes(unit);
    d.lastAct = null;
    if (stamp && foes.some(function (f) { return dist(f, unit) === 1; }) && api.act(unit, 'grim_stamp', unit, {})) d.lastAct = 'stamp';
    else {
      d.step = (d.step || 0) + 1;
      d.lastStep = step;
      d.lastAct = docketStep(unit, api, step);
    }
    if (out(unit)) return;
    planAudits(unit, api, api.foes(unit));
  }

  // ---- enemies ----------------------------------------------------------------------------------------------------
  /** Grimble's accountant's eyeshade, ledger badge and a quill behind the ear. */
  function grimbleOverlay(g) {
    const t = g.t || 0;
    const hr = 11.5, hy = -26.2 + Math.sin(t * 2.2) * 0.15;
    const vy = hy - hr * 0.42;
    g.ellipse(0, vy, hr * 1.02, hr * 0.26, 'rgba(36,140,70,0.92)', g.outline);
    g.poly([[-hr * 0.9, vy + 0.5], [hr * 0.9, vy + 0.5], [hr * 1.15, vy + 5.2], [-hr * 1.15, vy + 5.2]], 'rgba(60,200,110,0.55)', g.outline);
    g.line(-hr * 1.05, vy + 5, hr * 1.05, vy + 5, 'rgba(20,90,45,0.9)', 1.1);
    // G.R.S. badge on the coat
    g.circle(-4.5, -12, 2.6, '#e8c547', g.outline);
    g.text('$', -4.5, -12, 3.6, '#5a3c0a', null);
  }

  /** A lanyard with an INTERN badge (and a coffee stain). */
  function internOverlay(g) {
    g.line(-2.5, -15.5, 0, -9.5, '#c0392b', 0.9);
    g.line(2.5, -15.5, 0, -9.5, '#c0392b', 0.9);
    g.rect(-2.8, -9.8, 5.6, 3.6, '#f6f1e2', g.outline, 0.6);
    g.line(-1.8, -8.6, 1.8, -8.6, '#3a6fd0', 0.7);
    g.line(-1.8, -7.3, 1.2, -7.3, '#9a8f80', 0.6);
  }

  DD.registerEnemy({
    id: 'grim_intern', name: 'Goblin Intern', act: 1, tier: 'minion',
    hp: 7, mov: 4, armor: 0, tags: ['goblin', 'intern'],
    flags: {}, resist: {},
    sprite: {
      base: 'humanoid', scale: 0.78, build: 'tiny', outfit: 'tunic',
      palette: { skin: '#8cc152', cloth: '#ecebe4', cloth2: '#3a6fd0', hair: '#2b2b2b', metal: '#b0b0b0', eye: '#2b2233', accent: '#c0392b', outline: '#15110d' },
      head: { size: 1.05, ears: 'goblin', hair: 'short', eyes: 'big', mouth: 'smile' },
      mainhand: 'scroll', offhand: 'flask', extras: ['satchel'],
      overlay: internOverlay,
    },
    skills: ['grim_papercut', 'grim_refile'],
    ai: internPlan, aiStyle: 'melee', xp: 1, gold: [0, 1],
    passive: { name: 'Eager to Please', icon: '🗂️', desc: 'On its turn it walks over to an exploited Tax Loophole and closes it the moment it stands next to one; otherwise it paper-cuts the nearest hero.' },
    barks: {
      spawn: ['Is this for credit?', 'I\'m learning SO much!', 'Day one! Where\'s the coffee?', 'My mom says this is a real job.'],
      attack: ['Per my last email!', 'Paper cut! Sorry! Not sorry!', 'Synergy!'],
      hurt: ['Is this covered by insurance?', 'HR! HR!!', 'Ow, my career!'],
      death: ['Tell my mom... it was unpaid...', 'Can I put this on my resume?', 'I quit!'],
    },
    desc: 'An unpaid goblin intern. Walks over to close exploited Tax Loopholes; kill it, stun it or shove it away first. Paid in exposure, and exposure kills.',
  });

  const GRIMBLE_DEF = DD.registerEnemy({
    id: 'grimble', name: 'Grimble', act: 1, tier: 'boss',
    hp: 160, mov: 1, armor: 0, init: 2, turnsPerRound: 2, tags: ['goblin', 'boss', 'bureaucrat'],
    flags: { large: true }, resist: { fire: 1.25 },
    sprite: {
      base: 'humanoid', scale: 1.9, build: 'stocky', outfit: 'coat',
      palette: { skin: '#7fae4a', cloth: '#3e3654', cloth2: '#d9c38a', hair: '#2a2a2a', metal: '#e8c547', eye: '#ffe36b', accent: '#2e8b57', outline: '#14100c', boots: '#2a1d14', book: '#7a2a1a' },
      head: { size: 1.15, ears: 'goblin', hair: 'none', face: 'monocle', eyes: 'angry', mouth: 'gold_teeth' },
      mainhand: 'quill', offhand: 'book', bling: ['chain', 'rings'], extras: ['pouches', 'belt'],
      aura: { kind: 'sparkles', color: '#ffd23f' },
      overlay: grimbleOverlay,
    },
    skills: ['grim_levy', 'grim_stamp', 'grim_redtape', 'grim_hire'],
    ai: grimblePlan, aiStyle: 'ranged', xp: 40, gold: [30, 40],
    passive: {
      name: 'Double Shift', icon: '⏳',
      desc: function (u) {
        const ph = u && u.data && u.data.phase === 2 ? 2 : 1;
        const AU = DD.skillLevel(DD.getSkill('grim_audit'), 1);
        const doc = docketOf(ph).map(function (k) { return stepName(k, ph); }).join(', ');
        return 'Two turns a round. Each turn: a Rubber Stamp if a hero is next to him (never two turns in a row), otherwise his docket: ' + doc +
          (u && u.data ? ' (next: ' + stepName(nextStep(u), ph) + ')' : '') + '. He keeps an Audit wound up: ' + AU.dmg + ' damage to every hero in ' +
          (ph === 2 ? 'a row and a column' : 'a row or column') + ', landing one round later (a stun cancels it). ' +
          (ph === 2 ? 'He leaves his desk to stamp people and walks back to hire.' : 'He never leaves the DROP ZONE (until Hostile Takeover: half HP, or round ' + (GCFG.quarterEnd || QUARTER_END) + ' when the fiscal quarter ends).');
      },
    },
    hooks: {
      onCombatStart: function (u) { if (!u.data.phase) u.data.phase = 1; u.data.stolen = u.data.stolen || 0; },
      onTurnStart: function (u) { openWindow(u); },
      // stun guard: after a stun (or sleep / freeze / charm) none of them lands for his next GUARD_TURNS turns, but a
      // stun-like still interrupts his pending Audit
      modifyStatus: function (m) {
        if (!guarded(m.id) || puzzleStun || !m.unit || !DD.Act.hasStatus(m.unit, 'grim_appeal')) return;
        m.cancel = true;
        const cut = stunLike(m.id) && (m.unit.intents || []).length ? DD.AI.cancelIntents(m.unit, 'Objection! Audit called off') : 0;
        if (!cut) DD.FX.text(m.unit, '📎 Appeal pending: no effect', { color: '#e8d9a8', size: 13 });
      },
      onStatusApplied: function (u, st) {
        if (st && guarded(st.id) && active(u)) A().addStatus(u, 'grim_appeal', { turns: GCFG.guard || GUARD_TURNS, silent: true }, u);
      },
      onDeath: function (u) {
        const n = refund(u, 'His ledger bursts open: ');
        A().narrate('grim_death', { gold: n });
      },
    },
    barks: {
      spawn: ['Your papers, please.', 'You owe back taxes on all that loot.', 'Grimble. Goblin Revenue Service.'],
      attack: ['DENIED!', 'That\'s a late fee!', 'Audit THIS!', 'Sign here. And here. And HERE.'],
      hurt: ['That\'s tax fraud!', 'I\'m writing this down!', 'You\'ll be fined for that!'],
      death: ['My... receipts...', 'You\'ll hear from my lawyer! He\'s a rat.', 'Death... AND taxes...'],
      phase: ['HOSTILE TAKEOVER!', 'I\'m restructuring. YOU are the cuts!', 'Interns! Overtime! Unpaid!'],
      vault: ['MY VAULT!', 'That loophole was... technically legal...', 'Ow. Deductible, though.'],
    },
    desc: 'Works double shifts (two turns a round). Steals your gold (Block now, extra damage while he holds it), ties you up in Red Tape, winds up Audits down whole rows and columns, hires interns and stamps anyone who crowds his desk; below half HP (or once the fiscal quarter ends, round 10) he Garnishes Wages through walls. Weak to fire (paperwork). Appeals every stun (no second one for a while, though a stun always cancels his Audit). Word is his vault door hangs by a thread: three Tax Loopholes and one frayed rope.',
    boss: { title: 'The Goblin Tax Collector', intro: 'Grimble adjusts his visor. "Under the Goblin Revenue Code, all loot is taxable. All of it."', music: null },
  });

  // ---- encounter --------------------------------------------------------------------------------------------------
  // 12 x 12 tax office: the vault and the striped DROP ZONE up north on a carpeted dais, three loopholes spread out
  // (west flank, east dais edge, middle of the floor), filing cabinets + pillars for cover, the party deploys south.
  const LAYOUT = [
    '############',
    '#$kIkVkkIk$.',
    '#kkkZZZbkkkk',
    '#kkkZBZkkk2k',
    '#1.C.D..C...',
    '#...........',
    '#..P....P...',
    '#.....3.....',
    '#.C.......C.',
    '#...........',
    '#.H.H..H.H..',
    '#..H.HH.H...',
  ];
  const HEIGHTS = [
    '000000000000',
    '011111111110',
    '011111111110',
    '011111111110',
    '000000000000',
    '000000000000',
    '000000000000',
    '000000000000',
    '000000000000',
    '000000000000',
    '000000000000',
    '000000000000',
  ];
  const LEGEND = {
    '.': { terrain: 'wood' },
    'k': { terrain: 'carpet' },
    'Z': { terrain: 'grim_dropzone' },
    'B': { terrain: 'grim_dropzone', zone: 'enemy', tag: 'boss_spawn' },
    'V': { terrain: 'carpet', obj: 'grim_vault' },
    'I': { terrain: 'carpet', mark: 'grim_door' },
    '$': { terrain: 'carpet', obj: 'gold_pile' },
    'b': { terrain: 'carpet', obj: 'brazier' },
    '1': { terrain: 'wood', obj: 'grim_loophole', mark: 'grim_loophole' },
    '2': { terrain: 'carpet', obj: 'grim_loophole', mark: 'grim_loophole' },
    '3': { terrain: 'wood', obj: 'grim_loophole', mark: 'grim_loophole' },
    'C': { terrain: 'wood', obj: 'grim_cabinet' },
    'D': { terrain: 'wood', obj: 'grim_desk' },
    'P': { terrain: 'wood', obj: 'pillar' },
    'H': { terrain: 'wood', zone: 'hero' },
  };

  DD.registerEncounter({
    id: 'boss_grimble', act: 1, kind: 'boss', name: 'The Goblin Revenue Service',
    intro: 'Behind a mountain of paperwork, a goblin in an accountant\'s visor looks up. "You\'re late. And you owe."',
    weight: 1, minDepth: 0,
    map: { theme: 'cellar', layout: LAYOUT, heights: HEIGHTS, legend: LEGEND },
    enemies: [{ id: 'grimble', n: 1 }, { id: 'grim_intern', n: 2, mark: 'grim_door' }],
    objective: { type: 'boss' },
    reward: { goldMult: 1, itemRarity: 'legendary' },
    onStart: function (s) {
      const g = gdata(s);
      loopholes(s).forEach(function (l, i) { l.obj.data.n = i + 1; l.obj.data.name = LOOPHOLE_NAMES[i % LOOPHOLE_NAMES.length]; l.obj.data.on = false; });
      const vt = vaultTile(s);
      if (vt) vt.obj.data.down = false;
      g.jam = 0;
      relabel(s);
      A().narrate('grim_start', {});
    },
  });

  // ---- narration -----------------------------------------------------------------------------------------------------
  DD.registerNarration('boss_start', [
    'The DM cracks his knuckles. "Okay. This one I actually prepped."',
    'Boss music, courtesy of the DM humming. Badly.',
  ]);
  DD.registerNarration('grim_start', [
    'DM: "Those three levers are labelled TAX LOOPHOLE. And that vault door is hanging by one rope. Just... noticing things."',
    'DM: "Every lever in this office says LOOPHOLE on it. Goblins are terrible at secrets."',
  ]);
  DD.registerNarration('grim_vault_hit', [
    'The vault door flattens Grimble. That is what we call a hostile audit.',
    '{hero} cuts the last rope. Grimble is now a goblin pancake. With tax.',
    'DM: "And that is why you never stand under your own vault."',
  ]);
  DD.registerNarration('grim_takeover', [
    'Grimble announces a hostile takeover. The interns announce they are "so excited for this opportunity".',
    'Grimble restructures. The DM writes "phase two" on a napkin.',
  ]);
  DD.registerNarration('grim_death', [
    'Grimble is audited by the afterlife. The party gets a refund. Somewhere, a toast in a top hat smiles.',
    'The Goblin Revenue Service is closed until further notice. Loot is tax-free again!',
  ]);

  // test hooks (read-only helpers for tests/content/bosses_act1.js)
  DD.GrimbleBoss = { def: GRIMBLE_DEF, zoneTiles: zoneTiles, loopholes: loopholes, vaultTile: vaultTile, lane: lane, data: gread, dropVault: dropVault,
    threatened: threatened, levyTarget: levyTarget,
    fx: { door: drawFallingDoor, paper: drawPaperRain },
    VAULT_DMG: VAULT_DMG, GAIN_PER: GAIN_PER, GAIN_MAX: GAIN_MAX, REVIEW_ROUNDS: REVIEW_ROUNDS, reviewRounds: reviewRounds, PHASE2_AT: PHASE2_AT, QUARTER_END: QUARTER_END, PHASE2_MOV: PHASE2_MOV,
    GUARD_TURNS: GUARD_TURNS, P1: P1.slice(), P2: P2.slice(), cfg: GCFG };
})();
