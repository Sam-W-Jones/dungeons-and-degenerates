/* Dungeons and Degenerates — js/data/bosses/ratking.js
 * Act 1 boss: THE RAT KING AND THE RAT BAR ASSOCIATION (enemy 'rat_king', encounter 'boss_rat_king', a sewer junction).
 * A crowned, conjoined swarm. Too many rats to shove (immovable), so only sewer water can move him; immune to Sleep.
 * Planner rotation: Tangled Tails (tracking pull + root) / Gnaw (rotten floor tiles near heroes collapse into pits) /
 * Sewer Surge (delayed: a channel floods and washes everyone in it into the drain), then a Rat Pile on all 8 tiles
 * around him (after the tails, so a reeled-in hero lands in it) + the gavel. He likes to wade in the channels.
 * Swelling Ranks (soft timer): +1 stack every round from round 2, +2 damage per stack on all his attacks (max 6).
 * Phases at 66% / 33% HP: he SPLITS, two Rat Lawyers break off (max 3 on retainer). Phase 2 "Cross-Examination":
 * Gnaw takes 3 tiles, two gavels. Phase 3 "Closing Arguments": Sewer Surge floods both channels at once, Class Action.
 * Puzzle: two sluice valves (mid-arena: A on the island, B on the party walkway). Opening one washes everyone in its
 * channel into the drain: Rat Lawyers drown (an environmental kill), heroes lose 25% max HP and climb out, and the Rat
 * King is FLUSHED: 30 damage, Stunned (his telegraphs are cancelled), Wet, and his Swelling Ranks wash away. Each
 * valve needs 3 rounds to build pressure again.
 * Puzzle state lives in object data and unit.data (copied by previews and deploy rewinds).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const TAU = Math.PI * 2;

  const FLUSH_DMG = 30;
  const VALVE_CD = 3;
  const WADE = 3;                 // how much the King likes ending his move in a channel (he holds court in the sewage)
  const LAWYER_CAP = 3;
  const SWARM_DMG = 2;           // Swelling Ranks: +2 damage per stack on all his attacks, +1 stack per round, max 6
  const SWARM_MAX = 6;
  // balance knobs (tests may tweak them for sims): lawyers on retainer, gavels per round by phase, valve recharge, wading
  const CFG = { lawyerCap: LAWYER_CAP, gavels: { 1: 1, 2: 2, 3: 2 }, valveCd: VALVE_CD, wade: WADE, swarmDmg: SWARM_DMG };
  const FLOW = { x: -1, y: 0 };          // the channels drain west
  const SPLITS = [0.66, 0.33];
  const PATTERNS = { 1: ['tails', 'gnaw', 'tails', 'surge'], 2: ['surge', 'tails', 'gnaw', 'tails'], 3: ['surge', 'tails', 'class', 'gnaw'] };
  const LAWYER_NAMES = ['Ratticus Finch', 'Squeakson Esq.', 'Barrister Whiskers', 'Ratrick, Ratrick & Rat', 'Cheddarton QC', 'Johnnie Gnawchran'];

  // ---- helpers ----------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function nearestDist(p, list) { let d = Infinity; list.forEach(function (q) { d = Math.min(d, dist(p, q)); }); return d; }
  function plural(n, w) { return n + ' ' + (n === 1 ? w : w + 's'); }

  function tilesWhere(s, fn) {
    const out = [];
    if (!s || !s.grid) return out;
    s.grid.tiles.forEach(function (t) { if (fn(t)) out.push(t); });
    return out;
  }
  function chanOf(t) { return t && typeof t.tag === 'string' && t.tag.indexOf('rat_chan') === 0 ? t.tag.slice(8) : null; }
  function channels(s) {
    const out = {};
    tilesWhere(s || S(), function (t) { return !!chanOf(t); }).forEach(function (t) { const c = chanOf(t); (out[c] = out[c] || []).push({ x: t.x, y: t.y }); });
    return out;
  }
  function chanTiles(chan, s) { return channels(s)[chan] || []; }
  function inChannel(p, chan) { const t = G().tile(p.x, p.y); return !!t && chanOf(t) !== null && (!chan || chanOf(t) === chan); }
  function rotTiles(s) { return tilesWhere(s || S(), function (t) { return t.t === 'rat_rot'; }).map(function (t) { return { x: t.x, y: t.y }; }); }
  function valves(s) { return tilesWhere(s || S(), function (t) { return !!t.obj && t.obj.id === 'rat_valve'; }).map(function (t) { return { x: t.x, y: t.y, obj: t.obj }; }); }
  function king(s) { s = s || S(); return s ? s.units.filter(function (u) { return !u.dead && u.defId === 'rat_king'; })[0] || null : null; }
  function lawyers(s) { s = s || S(); return s ? s.units.filter(function (u) { return active(u) && u.defId === 'rat_lawyer'; }) : []; }
  function plaintiffs(s) { s = s || S(); return s ? s.units.filter(function (u) { return active(u) && u.defId === 'rat_plaintiff'; }) : []; }
  /** Flush damage (the valve def's dmg; FLUSH_DMG unless a balance run tunes it). */
  function flushDmg() { const d = DD.getObject('rat_valve'); return d && d.dmg > 0 ? d.dmg : FLUSH_DMG; }
  function unitsIn(tiles) {
    const out = [];
    tiles.forEach(function (p) { const u = G().unitAt(p.x, p.y); if (active(u) && out.indexOf(u) < 0) out.push(u); });
    return out;
  }

  /** Which channel a valve feeds: its data, else the channel next to it. */
  function valveChannel(o, tile) {
    if (o && o.data && o.data.chan) return o.data.chan;
    if (!tile) return null;
    for (let i = 0; i < 4; i++) {
      const d = DD.util.DIRS[i];
      const c = chanOf(G().tile(tile.x + d.x, tile.y + d.y));
      if (c) return c;
    }
    return null;
  }

  // ---- statuses ----------------------------------------------------------------------------------------
  DD.registerStatus({
    id: 'rat_session', name: 'Court in Session', icon: '⚖️', color: '#d4af37', type: 'buff', stacking: 'refresh', maxStacks: 3,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      return st.stacks >= 3 ? 'Closing Arguments (phase 3): Sewer Surge floods both channels at once, Class Action calls in Plaintiff Rats, Gnaw takes 3 tiles, ' +
          (CFG.gavels[3] || 1) + ' gavels a round.'
        : st.stacks >= 2 ? 'Cross-Examination (phase 2): Gnaw takes 3 rotten tiles at once and ' + (CFG.gavels[2] || 1) + ' gavels fly every round. Splits again at 33% HP.'
          : 'Opening Statements: one gavel a round. Splits off two Rat Lawyers at 66% and again at 33% HP.';
    },
  });

  // the soft timer: more sewer rats join the pile every round; a flush washes them away
  DD.registerStatus({
    id: 'rat_swarm', name: 'Swelling Ranks', icon: '🐀', color: '#b59a86', type: 'buff', stacking: 'stack', maxStacks: SWARM_MAX,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      return 'More sewer rats join the pile every round: +' + SWARM_DMG * st.stacks + ' damage on all of his attacks (up to +' + SWARM_DMG * SWARM_MAX +
        '). Flushing him down the drain washes them all away.';
    },
    telegraphFlat: function (st) { return CFG.swarmDmg * st.stacks; },
    hooks: {
      modifyOutgoingDamage: function (d, st) { if (d.cause === 'skill' && d.source && d.source.defId === 'rat_king') d.flat += CFG.swarmDmg * st.stacks; },
    },
  });

  // stun guard (like the act 2 and 3 bosses): a swarm can't be stun-locked; the flush always lands
  const GUARDED = { stun: 1, sleep: 1, frozen: 1, charmed: 1 };
  let puzzleStun = false;
  DD.registerStatus({
    id: 'rat_recess', name: 'Recess', icon: '🔔', color: '#c9b26b', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) {
      return 'The court just took a recess: can\'t be Stunned or Charmed again until the end of next round (a flush still knocks him flat).' +
        (st && st.turns > 0 ? ' (' + plural(st.turns, 'turn') + ' left)' : '');
    },
  });

  // ---- painters ------------------------------------------------------------------------------------------
  function drawRot(g, tile) {
    const c = g.ctx;
    const r = DD.Iso ? DD.Iso.rand(tile ? tile.x : 0, tile ? tile.y : 0, 7) : 0.5;
    c.save();
    c.globalAlpha = 0.85;
    g.ellipse(0, 0, 17, 8.5, 'rgba(40,30,20,0.35)');
    c.lineCap = 'round';
    const lines = [[-14, -2, -4, 1], [-4, 1, 3, -4], [3, -4, 12, 1], [-4, 1, -1, 7], [3, -4, 6, -9]];
    lines.forEach(function (l, i) { g.line(l[0] + r * 2, l[1], l[2], l[3] + (i % 2 ? r : -r), '#1e1712', 1.4); });
    // teeth marks
    for (let i = 0; i < 3; i++) g.ellipse(-8 + i * 7 + r * 3, 5 - i, 1.6, 0.9, '#120d0a');
    c.restore();
  }

  function drawValve(g, obj) {
    const c = g.ctx, d = obj.data || {}, t = g.t || 0;
    const cd = d.cd > 0;
    const W = -31;                        // wheel height: tall enough to read over the units standing around it
    g.ellipse(0, 1, 15, 7.5, 'rgba(0,0,0,0.3)');
    g.cylinder(0, 0, 9, 4.5, 6, '#4c6558', '#6f8f80', true);          // floor flange
    g.cylinder(0, -6, 5.5, 2.75, 20, '#5f7d6e', '#86a596', true);     // the riser pipe
    g.cylinder(-9, -10, 4, 2, 4, '#4c6558', '#6f8f80', true);         // side outlet
    if (!cd) for (let i = 0; i < 3; i++) {                              // ready: it drips
      const q = (t * 0.9 + i / 3) % 1;
      g.circle(-11 + Math.sin(i * 2.1) * 0.8, -8 + q * 9, 1.1 * (1 - q * 0.4), 'rgba(127,196,255,' + (0.9 - q * 0.6) + ')', null);
    }
    if (!cd) g.glow(0, W, 20, '#7dff9a', 0.28 + 0.14 * Math.sin(t * 4));
    const ang = (cd ? t * 6 : 0) + (d.chan === 'B' ? 0.4 : 0);
    g.ellipse(0, W, 14.5, 7.3, null, true);
    c.beginPath(); c.ellipse(0, W, 14, 7, 0, 0, TAU); c.strokeStyle = cd ? '#8a8a8a' : '#d0392b'; c.lineWidth = 3.4; c.stroke();
    c.beginPath(); c.ellipse(0, W - 0.8, 13, 6.4, 0, Math.PI * 1.1, Math.PI * 1.7); c.strokeStyle = cd ? '#b0b0b0' : '#ff8a7a'; c.lineWidth = 1.2; c.stroke();
    c.beginPath();
    for (let k = 0; k < 4; k++) { const a = ang + k * Math.PI / 2; c.moveTo(0, W); c.lineTo(Math.cos(a) * 13.5, W + Math.sin(a) * 6.7); }
    c.strokeStyle = cd ? '#6a6a6a' : '#8e2a20'; c.lineWidth = 2; c.stroke();
    g.circle(0, W, 2.6, '#d0d4da', true);
    // gauge: pressure ready (green) or building (amber needle low)
    g.circle(6, -15, 3.2, '#e8e4da', true);
    g.line(6, -15, 6 + Math.cos(cd ? -2.4 : -0.6) * 2.4, -15 + Math.sin(cd ? -2.4 : -0.6) * 2.4, cd ? '#c0392b' : '#1a1014', 1);
    if (d.chan) {
      c.save(); c.translate(-10, -22);
      g.rect(-5, -4.5, 10, 9, '#e8e4da', true, 1.2);
      g.text(d.chan, 0, 0.3, 7.5, '#1f4f8a');
      c.restore();
    }
  }

  /** One rat: body, pointed head toward f (±1), ears, red eye, pink nose and whiskers. Origin = body centre. */
  function drawRat(g, x, y, f, sc, col, tilt, blink) {
    const c = g.ctx;
    c.save(); c.translate(x, y); c.rotate(tilt || 0); c.scale(sc, sc);
    const dark = DD.util.shade(col, -0.25);
    g.ellipse(0, 0, 6.2, 4.1, col);                                       // body
    g.ellipse(-f * 1.4, -1.6, 3.4, 1.7, DD.util.shade(col, 0.2), null);  // back highlight
    g.ellipse(-f * 1.5, 2.9, 1.4, 0.9, dark, null);                       // hind foot
    g.ellipse(f * 2.8, 3.1, 1.2, 0.8, dark, null);                        // fore foot
    g.circle(f * 4.2, -3.0, 1.5, '#b77783');                              // back ear
    g.poly([[f * 3.6, -3.4], [f * 10.4, 0.2], [f * 3.4, 2.6]], DD.util.shade(col, 0.12));   // snout (lighter: the face reads)
    g.circle(f * 4.4, -0.6, 3.3, col);                                    // head
    g.circle(f * 3.2, -3.4, 1.7, '#e892a1');                              // front ear (small: the eye and snout lead)
    g.circle(f * 3.2, -3.4, 0.85, '#c76878', null);
    g.circle(f * 10.2, 0.2, 1.0, '#e07a8c', null);                        // nose
    if (blink) g.line(f * 5.2, -1.3, f * 6.8, -1.3, '#1a1014', 0.7);
    else {                                                                // a beady red eye with a dark rim
      g.circle(f * 6.0, -1.4, 1.45, '#1a1014', null);
      g.circle(f * 6.0, -1.4, 1.05, '#ff3b2f', null);
      g.circle(f * 6.3, -1.75, 0.38, '#ffffff', null);
    }
    g.line(f * 8.5, 0.6, f * 12, -0.6, 'rgba(240,235,225,0.8)', 0.35);
    g.line(f * 8.5, 1.0, f * 12, 1.8, 'rgba(240,235,225,0.8)', 0.35);
    c.restore();
  }

  /**
   * Ermine trim along the robe's hem (the quadratic curve p0 → c → p1): a fur band, thickest at the front where it
   * faces us and thinner where it wraps round the sides, with a fluffy scalloped lower edge and black ermine tails.
   */
  function ermineHem(g, x0, y0, cx, cy, x1, y1, t) {
    const N = 16, top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, u = 1 - s;
      const x = u * u * x0 + 2 * u * s * cx + s * s * x1, y = u * u * y0 + 2 * u * s * cy + s * s * y1;
      const th = 1.6 + 2.2 * Math.sin(Math.PI * s);
      top.push([x, y - th]); bot.push([x, y + 0.6 + 0.5 * Math.sin(Math.PI * s)]);
    }
    const band = function (c) {
      c.moveTo(top[0][0], top[0][1]);
      for (let i = 1; i <= N; i++) c.lineTo(top[i][0], top[i][1]);
      c.lineTo(bot[N][0], bot[N][1]);
      for (let i = N; i > 0; i--) { // one fluffy tuft per segment
        const a = bot[i], b = bot[i - 1];
        c.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1.5, b[0], b[1]);
      }
      c.closePath();
    };
    g.shaded(band, '#f4f1ea', { dx: 0, dy: -1.1, dark: '#cfc6b4' });
    for (let i = 1; i < 4; i++) { // the sheen along the top of the fur
      const k = Math.round(i * N / 4);
      g.line(top[k - 1][0], top[k - 1][1] + 0.7, top[k + 1][0], top[k + 1][1] + 0.7, 'rgba(255,255,255,0.7)', 0.6);
    }
    for (let i = 0; i < 5; i++) { // black ermine tails, a little wobble as the robe sways
      const k = Math.round((0.12 + i * 0.19) * N), p = top[k], q = bot[k];
      const x = p[0] + Math.sin(t * 1.4 + i) * 0.2, y = (p[1] + q[1]) / 2 - 0.2, sz = 0.55 + 0.35 * Math.sin(Math.PI * k / N);
      g.poly([[x - 0.9 * sz, y - 1.1 * sz], [x + 0.9 * sz, y - 1.1 * sz], [x, y + 1.5 * sz]], '#1a1014', null);
      g.circle(x, y - 1.3 * sz, 0.55 * sz, '#1a1014', null);
    }
  }

  /** The Rat King: a mound of up to 12 rats whose tails are knotted together, crown + barrister wig on top. Fewer rats as he splits. */
  function drawRatKing(g) {
    const c = g.ctx, t = g.t || 0, u = g.unit;
    const ratio = u && u.maxHp ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 1;
    const n = Math.max(5, Math.min(12, Math.round(5 + 7 * ratio)));
    const fur = ['#8d7764', '#6c5b4f', '#a48d77', '#5d4d43', '#7e6959'];
    const lunge = g.pose === 'attack' ? 2.5 : 0;
    // [x, y, facing, tilt]: the king first, then the rats that stay longest
    const SLOTS = [
      [0, -30, 1, 0], [-8, -22, -1, 0.15], [8, -22, 1, -0.15], [-4, -14, -1, -0.1], [5, -14, 1, 0.1], [0, -6, 1, 0],
      [-14, -13, -1, 0.35], [14, -13, 1, -0.35], [-10, -5, -1, 0.1], [10, -5, 1, -0.1], [-19, -4, -1, 0.25], [19, -4, 1, -0.25]];
    const used = SLOTS.slice(0, n);
    // the royal robe: red velvet draped behind the pile (it shrinks with him), ermine hem with black tails
    const sway = Math.sin(t * 1.4) * 0.8, cw = 10 + 12 * Math.min(1, (n - 3) / 9);
    const robe = function (cc) {
      cc.moveTo(-6, -33);
      cc.quadraticCurveTo(-cw - 1 + sway, -16, -cw - 3 + sway, 1);
      cc.quadraticCurveTo(0, 5, cw + 3 + sway, 1);
      cc.quadraticCurveTo(cw + 1 + sway, -16, 6, -33);
      cc.closePath();
    };
    g.shaded(robe, '#a3283a', { dx: -1.5, dy: -1, hl: [-cw * 0.45, -14, 3, 9, 0.2] });
    ermineHem(g, -cw - 3 + sway, 1, 0, 5, cw + 3 + sway, 1, t);
    // tails, behind everything: from every rat's rump down to the knot
    c.save(); c.lineCap = 'round';
    used.forEach(function (s, i) {
      if (i === 0) return;
      const w = Math.sin(t * 3 + i) * 1.5;
      c.beginPath(); c.moveTo(s[0] - s[2] * 5, s[1] + 1);
      c.quadraticCurveTo(s[0] * 0.5 + w, s[1] * 0.35 + 5, 0, 2);
      c.strokeStyle = '#1a1014'; c.lineWidth = 2.8; c.stroke();
      c.strokeStyle = '#e7a3ab'; c.lineWidth = 1.4; c.stroke();
    });
    c.restore();
    // rats, back (top) to front (bottom)
    const order = used.map(function (s, i) { return { s: s, i: i }; }).sort(function (a, b) { return a.s[1] - b.s[1]; });
    order.forEach(function (e) {
      const s = e.s, i = e.i, k = i === 0;
      const bob = Math.sin(t * (4 + i * 0.3) + i * 1.7) * 0.7;
      drawRat(g, s[0] + (k ? lunge : lunge * 0.4), s[1] + bob, s[2], k ? 1.3 : 1, fur[i % fur.length], s[3], g.blink && !k);
    });
    // the knot, in front at the base (a tangle of pink loops)
    g.ellipse(0, 2, 7, 3.4, '#e7a3ab', '#1a1014');
    for (let i = 0; i < 4; i++) {
      const a = t * 0.8 + i * 1.6;
      g.ellipse(Math.cos(a) * 3, 1.6 + Math.sin(a) * 1.1, 2.4, 1.2, null, '#b8737b', a);
    }
    // the gavel, held up by the rat on the right (it bangs on attack)
    const gs = SLOTS[2], bang = g.pose === 'attack' ? 0.9 : Math.sin(t * 2) * 0.12;
    c.save(); c.translate(gs[0] + 9, gs[1] - 2); c.rotate(-0.5 + bang);
    g.limb(0, 0, 0, -9, 1.6, '#8a5a33');
    g.rect(-3.6, -12.5, 7.2, 4, '#6b3f22', true, 1.2);
    g.line(-3.6, -11.3, 3.6, -11.3, '#c99a5b', 0.8);
    c.restore();
    // the King's regalia: a barrister's wig (curls + side lappets) and the crown on the top rat
    const top = SLOTS[0], bob0 = Math.sin(t * 4 + 0) * 0.7;
    const hx = top[0] + 4.4 * 1.3 + lunge, hy = top[1] - 0.6 * 1.3 + bob0;
    const wig = '#f2efe6', wigLine = '#8a857a';
    for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) g.circle(hx + s * 5.2, hy - 2.4 + k * 2.1, 1.6, wig, wigLine);
    for (let w = 0; w < 6; w++) g.circle(hx - 4.4 + w * 1.75, hy - 3.8 + Math.abs(w - 2.5) * 0.6, 1.9, wig, wigLine);
    const gold = g.pal.metal || '#e8c547';
    g.poly([[hx - 4.2, hy - 4.6], [hx - 4.8, hy - 10.5], [hx - 2.1, hy - 7.4], [hx, hy - 11.8], [hx + 2.1, hy - 7.4], [hx + 4.8, hy - 10.5], [hx + 4.2, hy - 4.6]], gold);
    g.circle(hx, hy - 5.8, 1.1, '#d0302a', null);
    g.circle(hx - 4.8, hy - 10.5, 0.8, gold);
    g.circle(hx + 4.8, hy - 10.5, 0.8, gold);
    g.glow(hx + 2, hy - 9, 5, '#fff3a0', 0.35 + 0.3 * Math.sin(t * 3));
    if (g.pose === 'attack') for (let i = 0; i < 3; i++) g.line(22 + i * 2, -16 + i * 5, 27 + i * 2, -17 + i * 5, '#f2efe6', 1.2);
  }

  /** Rat Lawyer extras: a red tie and a briefcase handle glint. */
  function lawyerOverlay(g) {
    g.poly([[-0.2, -15.6], [1.6, -15.6], [1.2, -13.8], [2.2, -9.2], [0.7, -7.8], [-0.6, -9.2], [0.2, -13.8]], '#c0392b', g.outline);
  }

  // ---- terrain & objects -----------------------------------------------------------------------------------
  DD.registerTerrain({
    id: 'rat_rot', name: 'Rotten Floor', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#6c665c', left: '#504b44', right: '#433f39' },
    desc: 'Chewed-through flooring. The Rat King can Gnaw it into a pit; anyone standing on it falls in.',
    draw: drawRot,
  });

  DD.registerObject({
    id: 'rat_valve', name: 'Sluice Valve', blocksMove: true, blocksLos: false, hp: 0, height: 1.3, color: '#5f7d6e', dmg: FLUSH_DMG,
    desc: 'Interact (1 AP): open the sluice. Everyone standing in its channel is washed all the way into the drain: enemies drown, heroes lose 25% max HP and climb out, and the Rat King is FLUSHED (' + FLUSH_DMG + ' damage, Stunned, Wet, and his Swelling Ranks wash away). Needs ' + VALVE_CD + ' rounds to build pressure again.',
    available: function (o) { return !(o.data && o.data.cd > 0); },
    interact: { ap: 1, label: 'Crank Sluice', fn: function (unit, o, tile) { return openSluice(unit, o, tile); } },
    autoplay: function (unit, o, tile, s) { return valveValue(unit, o, tile, s); },
    onRoundEnd: function (o) {
      if (!o.data || !(o.data.cd > 0)) return;
      o.data.cd--;
      relabelValve(o);
    },
    draw: drawValve,
  });

  function relabelValve(o) {
    if (!o || !o.data) return;
    o.label = 'Sluice Valve (channel ' + (o.data.chan || '?') + ')' + (o.data.cd > 0 ? ' — building pressure: ' + plural(o.data.cd, 'round') : ' — ready');
  }

  // ---- the flood ---------------------------------------------------------------------------------------------
  /** Nearest free dry walkway tile (not a channel, not a drop) to p, or null. */
  function dryLanding(p, unit) {
    const s = S();
    for (let r = 1; r <= s.grid.w + s.grid.h; r++) {
      const ring = G().emptyTilesRing(p.x, p.y, r, unit).filter(function (q) { return !inChannel(q) && !G().hazardAt(q.x, q.y, unit); });
      if (ring.length) return ring[0];
    }
    return null;
  }

  /** Climbing out of the drain lands on the walkway, not back in the water. */
  function climbOut(u) {
    if (!active(u) || !inChannel(u)) return;
    const q = dryLanding(u, u);
    const from = { x: u.x, y: u.y };
    if (q && A().teleport(u, q.x, q.y, { noEnter: true, fx: false })) DD.FX.jump(u, from, q);
  }

  function flush(u, src) {
    if (!active(u)) return;
    climbOut(u);
    if (!active(u)) return;
    puzzleStun = true;
    try { A().addStatus(u, 'stun', { turns: 1 }, src || null); } finally { puzzleStun = false; }
    if (active(u)) A().addStatus(u, 'wet', { turns: 2 }, src || null);
    if (active(u) && DD.Act.hasStatus(u, 'rat_swarm')) A().removeStatus(u, 'rat_swarm', { text: 'Rats washed away!' });
    DD.FX.text(u, 'FLUSHED!', { color: '#7fd0ff', size: 20 });
    A().bark(u, 'flush');
    const k = u.data;
    k.flushes = (k.flushes || 0) + 1;
    A().narrate('rat_flush', { hero: src && src.side === 'hero' ? src.name : 'the sewer', enemy: u.name });
  }

  /**
   * Wash everyone standing in a channel toward the drain (closest to the drain first, so nobody blocks the others).
   * opts: { exempt: unitId (the Rat King's own surge) }. The King is immovable to anything but this water.
   * The water sweeps past what it can't carry (a downed hero, a flyer, an immovable summon): on an arena with a drain,
   * anyone it could not wash all the way still ends up in the drain (a blocked flush used to cost the valve for 2 bump
   * damage).
   */
  function flood(chan, src, opts) {
    opts = opts || {};
    const tiles = chanTiles(chan);
    if (!tiles.length) return { moved: [], drowned: [], flushed: false };
    const out = { moved: [], drowned: [], flushed: false };
    const drain = tilesWhere(S(), function (t) { return t.tag === 'rat_drain'; }).length > 0;
    DD.FX.sound('splash');
    tiles.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'splash', { parallel: i > 0, color: '#7fc4ff' }); });
    const list = unitsIn(tiles).filter(function (u) { return u.id !== opts.exempt && !G().isFlying(u) && !u.downed; });
    list.sort(function (a, b) { return (a.x * -FLOW.x + a.y * -FLOW.y) - (b.x * -FLOW.x + b.y * -FLOW.y); });
    list.forEach(function (u) {
      if (!active(u)) return;
      const isKing = u.defId === 'rat_king';
      const was = u.flags ? u.flags.immovable : undefined;
      if (isKing && u.flags) u.flags.immovable = false;
      let res;
      try { res = A().push(src || null, u, FLOW, 30, { bump: 0, slide: false }); } finally { if (isKing && u.flags) u.flags.immovable = was; }
      if (res && res.moved) out.moved.push(u);
      let fell = !!(res && res.fell);
      if (!fell && drain && active(u) && inChannel(u, chan) && (isKing || !A().isImmovable(u))) { A().fall(u, src || null); fell = true; }
      if (fell) {
        if (u.dead) out.drowned.push(u);
        else if (isKing) { flush(u, src); out.flushed = true; } else climbOut(u);
      }
    });
    if (out.drowned.some(function (u) { return u.defId === 'rat_lawyer'; }) && !A().simulating) {
      A().log(DROWN_LINES[Math.floor(DD.rng.next() * DROWN_LINES.length) % DROWN_LINES.length], 'narrator');
    }
    return out;
  }
  const DROWN_LINES = [
    'A Rat Lawyer is washed down the drain. Nobody files an appeal.',
    'One fewer lawyer in the world. The DM asks everyone to hold their applause.',
  ];

  function openSluice(unit, o, tile) {
    if (!o || !o.data || o.data.cd > 0) return false;
    const chan = valveChannel(o, tile);
    o.data.chan = chan;
    o.data.cd = CFG.valveCd;
    o.data.uses = (o.data.uses || 0) + 1;
    const s = S();
    s.data = s.data || {};
    const rd = s.data.rat || (s.data.rat = { sluices: 0, flushes: 0, drowned: 0 });
    rd.sluices++;
    relabelValve(o);
    DD.FX.text(tile, 'SLUICE OPEN!', { color: '#7fd0ff', size: 16 });
    A().log(unit.name + ' opens the sluice on channel ' + (chan || '?') + '. Here comes the sewage!', 'hero');
    const res = flood(chan, unit, {});
    if (res.flushed) rd.flushes++;
    rd.drowned += res.drowned.length;
    return true;
  }

  /** AutoPlay hint: what opening this sluice is worth right now (the King in the water is the jackpot). */
  function valveValue(unit, o, tile, s) {
    if (CFG.noHint || !o || !o.data || o.data.cd > 0) return 0;
    const chan = valveChannel(o, tile);
    if (!chan) return 0;
    let v = 0;
    unitsIn(chanTiles(chan, s)).forEach(function (u) {
      if (G().isFlying(u)) return;
      if (u.defId === 'rat_king') v += 55;
      else if (u.side === 'enemy') v += 18;
      else if (u.side === 'hero') v -= 30;
    });
    return v;
  }

  // ---- splits (phase transitions) ------------------------------------------------------------------------------
  function phaseOf(u) { return 1 + Math.min(2, (u && u.data && u.data.splits) || 0); }

  function spawnLawyers(u, n) {
    const room = Math.max(0, CFG.lawyerCap - lawyers().length);
    const want = Math.min(n, room);
    const spots = G().emptyTilesNear(u.x, u.y, 3).filter(function (p) { return !G().isDrop(p.x, p.y) && !(p.x === u.x && p.y === u.y); });
    const out = [];
    for (let i = 0; i < want && i < spots.length; i++) {
      const L = A().spawn('rat_lawyer', spots[i].x, spots[i].y, { silent: true });
      if (!L) continue;
      L.name = LAWYER_NAMES[Math.floor(DD.rng.next() * LAWYER_NAMES.length) % LAWYER_NAMES.length];
      A().log(L.name + ' splits off the Rat King and passes the bar.', 'enemy');
      A().maybeBark(L, 'spawn', 0.7);
      out.push(L);
    }
    return out;
  }

  /** Class Action: Plaintiff Rats crawl out next to the drains (next to the King on a map without drains). */
  function classAction(king, n, cap) {
    const s = S();
    const want = Math.min(n, Math.max(0, cap - plaintiffs(s).length));
    if (want <= 0) { DD.FX.text(king, 'Case dismissed!', { color: '#d0d0d0', size: 13 }); return []; }
    const heroes = DD.Combat.active('hero');
    let spots = [];
    tilesWhere(s, function (t) { return t.tag === 'rat_drain'; }).forEach(function (dr) {
      G().emptyTilesNear(dr.x, dr.y, 2).forEach(function (p) {
        if (!G().isDrop(p.x, p.y) && !inChannel(p) && !spots.some(function (q) { return q.x === p.x && q.y === p.y; })) spots.push(p);
      });
    });
    spots.sort(function (a, b) { return nearestDist(a, heroes) - nearestDist(b, heroes) || a.y - b.y || a.x - b.x; });
    if (!spots.length) spots = G().emptyTilesNear(king.x, king.y, 3).filter(function (p) { return !G().isDrop(p.x, p.y); });
    const out = [];
    for (let i = 0; i < want && i < spots.length; i++) {
      const r = A().spawn('rat_plaintiff', spots[i].x, spots[i].y, { silent: true });
      if (!r) continue;
      DD.FX.particles(r, { kind: 'bubbles', count: 8 });
      out.push(r);
    }
    if (out.length) {
      A().log('Class action! ' + out.length + ' Plaintiff Rat' + (out.length === 1 ? '' : 's') + ' crawl out of the drains to join the lawsuit.', 'enemy');
      A().maybeBark(out[0], 'spawn', 0.7);
    }
    return out;
  }

  function split(u, k) {
    const phase = 1 + k;
    // phase 2+ Gnaw takes 3 tiles: level 2 of the skill (telegraph, desc and execution all read the slot level)
    DD.Combat.slotsOf(u).forEach(function (sl) { if (sl.id === 'rat_gnaw') sl.level = 2; });
    A().addStatus(u, 'rat_session', { stacks: phase, turns: -1, silent: true }, u);
    DD.FX.banner('MOTION TO SPLIT!', { sub: phase >= 3 ? 'Phase 3: Closing Arguments' : 'Phase 2: Cross-Examination', color: '#d4af37', ms: 1100 });
    DD.FX.particles(u, { kind: 'dust', count: 16 });
    A().log('The Rat King splits! Rat Lawyers break off the pile. Phase ' + phase + ': ' + (phase >= 3 ? 'Closing Arguments.' : 'Cross-Examination.'), 'enemy');
    A().bark(u, 'phase');
    A().narrate('rat_split', { n: phase });
    spawnLawyers(u, 2);
  }

  function checkSplit(u) {
    if (!active(u) || !(u.hp > 0)) return;     // the killing blow is not a motion to split
    const d = u.data;
    d.splits = d.splits || 0;
    const r = u.hp / Math.max(1, u.maxHp);
    let want = 0;
    SPLITS.forEach(function (th) { if (r <= th) want++; });
    while (d.splits < want) { d.splits++; split(u, d.splits); }
  }

  // ---- skills -------------------------------------------------------------------------------------------------------
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; def.cooldown = def.cooldown || 0; return DD.registerSkill(def); }

  function around(p) {
    const out = [];
    if (!p) return out;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push({ x: p.x + dx, y: p.y + dy });
    return out;
  }
  function near8(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1; }
  /** A tracking skill's reach (its def's target.range), so desc, planner and targeting always agree. */
  function reach(id) { const s = DD.getSkill(id); return (s && s.target && s.target.range) || [1, 1]; }
  function reachText(id) { const r = reach(id); return r[0] === r[1] ? String(r[0]) : r[0] + '-' + r[1]; }
  function inReach(id, d) { const r = reach(id); return d >= r[0] && d <= r[1]; }

  // ---- telegraph truth (DD.AI.intentDmg adds a skill's telegraphFlat(unit, intent) to the planned number) ----------
  /** The attacker's damage multiplier, as the engine applies it to telegraphs (Weak, Inspired, Empowered, items, difficulty). */
  function outMult(u) {
    let m = 1;
    if (DD.Act.hasStatus(u, 'weak')) m *= 0.75;
    if (DD.Act.hasStatus(u, 'inspired')) m *= 1.25;
    if (DD.Act.hasStatus(u, 'empowered')) m *= 1.5;
    if (u.dmgBonus) m *= 1 + u.dmgBonus;
    const s = S();
    if (u.side === 'enemy') m *= (s && s.difficulty && s.difficulty.dmg) || 1;
    return m;
  }
  /** Run a query that consults content hooks with FX, log lines and barks silenced (telegraphs are pure). */
  function quietly(fn) {
    const sim = A().simulating, push = DD.FX.push;
    A().simulating = true;
    DD.FX.push = function (evt) { return evt; };
    try { return fn(); } finally { DD.FX.push = push; A().simulating = sim; }
  }
  /** How far a pull of n really carries `unit` once modifyPush hooks had their say (Marwyn plants his feet). */
  function pullDist(src, unit, dir, n) {
    const pm = { unit: unit, src: src || null, dir: { x: dir.x, y: dir.y }, dist: Math.floor(n), cancel: false };
    quietly(function () { DD.Hooks.fire('modifyPush', unit, pm); });
    return pm.cancel ? 0 : Math.max(0, Math.floor(+pm.dist || 0));
  }
  /**
   * Where Tangled Tails would drop hero h (DD.Act.pull toward the King k, n tiles: blocked by units, objects, walls
   * and cliffs, one extra slide on ice), or null when it would fall in a pit or can't be moved. Pure.
   */
  function tailsLanding(k, h, n) {
    if (!k || !h || A().isImmovable(h)) return null;
    const dir = DD.util.dirTo(h, k);
    if (!dir.x && !dir.y) return null;
    const dx = k.x - h.x, dy = k.y - h.y;
    const along = dx === 0 || dy === 0 ? Math.abs(dx + dy) - 1 : Math.abs(dir.x ? dx : dy);
    let left = pullDist(k, h, dir, Math.max(0, Math.min(n, along)));
    const fly = G().isFlying(h);
    let p = { x: h.x, y: h.y }, slid = false;
    while (left > 0) {
      const q = { x: p.x + dir.x, y: p.y + dir.y };
      if (q.x === k.x && q.y === k.y) break;
      const t = G().tile(q.x, q.y);
      if (!t || G().unitAt(q.x, q.y) || (t.obj && G().objBlocksMove(t.obj))) break;
      const td = G().terrain(t);
      const drop = G().isDrop(q.x, q.y);
      if (td.walkable === false && !td.pit && !(td.liquid && (fly || td.liquid === 'deep'))) break;
      if (!drop && !G().canStep(h, p, q)) break;
      if (drop && !fly) return null;
      p = q;
      left--;
      if (left === 0 && !slid && !fly) {
        const sd = t.surface ? DD.getSurface(t.surface.id) : null;
        if (td.slide || (sd && sd.slide)) { left = 1; slid = true; }
      }
    }
    return p;
  }
  /** Rat Pile: a hero standing in it Rooted takes the buried number; the telegraph shows it while one does. */
  function pileFlat(unit, intent) {
    const L = DD.skillLevel(DD.getSkill('rat_pile'), (intent && intent.level) || 1);
    if (!L || !unit || !(L.rooted > L.dmg)) return 0;
    const buried = DD.AI.intentTiles(unit, intent).some(function (p) {
      const f = G().unitAt(p.x, p.y);
      return active(f) && G().hostile(unit, f) && DD.Act.hasStatus(f, 'root');
    });
    if (!buried) return 0;
    const m = outMult(unit);
    return Math.round(L.rooted * m) - Math.round(L.dmg * m);
  }
  /**
   * Tangled Tails: when the King also telegraphs a Rat Pile and the pull would drop the tracked hero in it, the hero
   * takes the buried pile hit right after the tails. The tails' number includes it, so the hero's "Will be hit by"
   * tells the whole story (a hero already standing in the pile only adds the buried bonus: the pile shows the rest).
   */
  function tailsFlat(unit, intent) {
    const h = intent && DD.Combat.byId(intent.unitId);
    if (!unit || !active(h) || !(unit.intents || []).some(function (it) { return it.skillId === 'rat_pile'; })) return 0;
    const T = DD.skillLevel(DD.getSkill('rat_tails'), intent.level || 1), P = DD.skillLevel(DD.getSkill('rat_pile'), 1);
    const land = tailsLanding(unit, h, T.pull);
    if (!land || !near8(land, unit)) return 0;
    const m = outMult(unit);
    if (near8(h, unit)) return DD.Act.hasStatus(h, 'root') ? 0 : Math.round(P.rooted * m) - Math.round(P.dmg * m);
    return Math.round(P.rooted * m) + DD.AI.telegraphFlat(unit);
  }

  eskill({
    id: 'rat_pile', name: 'Rat Pile', icon: '🐀', kind: 'attack', tags: ['melee', 'aoe'], anchor: 'self',
    levels: [{ dmg: 12, rooted: 22, bleed: 1 }],
    target: { type: 'self' }, area: { shape: 'custom', fn: function (ctx) { return around(ctx && ctx.user); } },
    desc: function (L) {
      return 'Swarm all 8 surrounding tiles (diagonals too): deal ' + L.dmg + ' damage (' + L.rooted + ' to a Rooted hero, who is buried in rats) and Bleed ' + L.bleed + ' to every hero there.';
    },
    flavor: 'Two dozen teeth, one shared opinion.',
    telegraphFlat: pileFlat,
    execute: function (ctx) {
      DD.FX.particles(ctx.user, { kind: 'dust', count: 10 });
      ctx.foes.forEach(function (f) {
        DD.FX.lunge(ctx.user, f, { parallel: true });
        const buried = DD.Act.hasStatus(f, 'root');
        if (buried) DD.FX.text(f, 'BURIED IN RATS', { color: '#e7a3ab', size: 14 });
        A().damage(ctx.user, f, buried ? ctx.L.rooted : ctx.L.dmg, { noHighGround: true });
        if (active(f)) A().addStatus(f, 'bleed', { stacks: ctx.L.bleed }, ctx.user);
      });
    },
  });

  eskill({
    id: 'rat_gnaw', name: 'Gnaw', icon: '🦷', kind: 'attack', tags: ['aoe', 'terrain'], anchor: 'ground',
    levels: [{ dmg: 8, n: 2 }, { dmg: 8, n: 3 }],
    target: { type: 'tile', range: [0, 40], los: false, filter: 'any' },
    desc: function (L) {
      return 'Gnaw through ' + L.n + ' marked rotten floor tiles: deal ' + L.dmg + ' damage to every hero on them, then the floor collapses into a pit (a falling hero loses 25% max HP and climbs out).';
    },
    flavor: 'The building code was more of a suggestion.',
    execute: function (ctx) {
      DD.FX.sound('bump');
      ctx.tiles.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'crack', { parallel: i > 0 }); DD.FX.particles(p, { kind: 'dust', count: 8, parallel: true }); });
      A().damageTiles(ctx.user, ctx.tiles, ctx.L.dmg, { filter: 'foes', noHighGround: true });
      ctx.tiles.forEach(function (p) {
        const t = G().tile(p.x, p.y);
        if (!t || t.t !== 'rat_rot') return;
        t.tag = 'rat_gnawed';
        A().setTerrain(p.x, p.y, 'pit');
      });
      A().log('The floor gives way under the Rat King\'s gnawing.', 'enemy');
    },
  });

  eskill({
    id: 'rat_surge', name: 'Sewer Surge', icon: '🌊', kind: 'attack', tags: ['aoe', 'delayed', 'water', 'push'], anchor: 'ground',
    levels: [{ dmg: 8 }],
    target: { type: 'tile', range: [0, 40], los: false, filter: 'any' },
    desc: function (L) {
      return 'After the countdown the marked channel floods: deal ' + L.dmg + ' damage to every hero in it, then wash everyone in it (except the Rat King) all the way into the drain: a hero loses 25% max HP and climbs out, his own lawyers and rats drown.';
    },
    flavor: 'High tide in the low places.',
    execute: function (ctx) {
      const chan = (ctx.intent && ctx.intent.data && ctx.intent.data.chan) || chanOf(ctx.tiles[0] ? G().tile(ctx.tiles[0].x, ctx.tiles[0].y) : null);
      A().log('SEWER SURGE! Channel ' + (chan || '?') + ' floods.', 'enemy');
      A().damageTiles(ctx.user, ctx.tiles, ctx.L.dmg, { filter: 'foes', noHighGround: true });
      if (chan) flood(chan, ctx.user, { exempt: ctx.user.id });
    },
  });

  eskill({
    id: 'rat_gavel', name: 'Order in the Court!', icon: '🔨', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 12 }],
    target: { type: 'unit', range: [2, 6], los: true, filter: 'enemy' },
    desc: function (L) { return 'Hurls the gavel at a hero ' + reachText('rat_gavel') + ' tiles away (tracking): deal ' + L.dmg + ' damage. Fizzles if the hero breaks line of sight or gets out of range.'; },
    flavor: 'ORDER! ORDER! (The rats have never once achieved order.)',
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        DD.FX.projectile(ctx.user, f, { kind: 'rock', color: '#8a5a33' });
        DD.FX.text(f, 'ORDER!', { color: '#ffe066', size: 15 });
        A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true });
      });
    },
  });

  eskill({
    id: 'rat_tails', name: 'Tangled Tails', icon: '🪢', kind: 'attack', tags: ['ranged', 'pull', 'root'], anchor: 'unit',
    levels: [{ dmg: 8, pull: 2, turns: 2 }],
    target: { type: 'unit', range: [2, 6], los: true, filter: 'enemy' },
    desc: function (L) {
      return 'Tracks a hero ' + reachText('rat_tails') + ' tiles away: deal ' + L.dmg + ' damage, pull them ' + L.pull + ' tiles toward the King and Root them for ' + L.turns +
        ' turns. It resolves before his Rat Pile, so a hero reeled in next to him lands in it, Rooted (buried); its telegraph then counts that pile hit too. Fizzles without line of sight.';
    },
    flavor: 'Forty tails, one knot, and now you are in it.',
    telegraphFlat: tailsFlat,
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        DD.FX.beam(ctx.user, f, { color: '#e7a3ab', width: 4 });
        A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true });
        if (active(f)) A().pull(ctx.user, f, ctx.user, ctx.L.pull);
        if (active(f)) A().addStatus(f, 'root', { turns: ctx.L.turns }, ctx.user);
      });
    },
  });

  eskill({
    id: 'rat_class', name: 'Class Action', icon: '📜', kind: 'summon', tags: ['summon'], anchor: 'self',
    levels: [{ n: 2, cap: 3 }],
    target: { type: 'self' },
    desc: function (L) { return L.n + ' Plaintiff Rats crawl out of the drains to join the lawsuit (never more than ' + L.cap + ' plaintiffs).'; },
    flavor: 'Everyone who has ever been bitten by a rat is entitled to compensation. By rats.',
    execute: function (ctx) { classAction(ctx.user, ctx.L.n, ctx.L.cap); },
  });

  eskill({
    id: 'rat_nibble', name: 'Nibble', icon: '🦷', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 4, bleed: 1 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the adjacent tile and Bleed ' + L.bleed + '.'; },
    flavor: 'Pain and suffering, itemized.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.lunge(ctx.user, ctx.target);
      ctx.foes.forEach(function (f) {
        A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true });
        if (active(f)) A().addStatus(f, 'bleed', { stacks: ctx.L.bleed }, ctx.user);
      });
    },
  });

  // lawyers
  eskill({
    id: 'rat_objection', name: 'OBJECTION!', icon: '☝️', kind: 'attack', tags: ['ranged', 'push'], anchor: 'unit',
    levels: [{ dmg: 7, push: 1 }],
    target: { type: 'unit', range: [1, 4], los: true, filter: 'enemy' },
    desc: function (L) { return 'Tracks a hero up to 4 tiles away: deal ' + L.dmg + ' damage and push them ' + L.push + ' tile away. Fizzles without line of sight.'; },
    flavor: 'Sustained. Mostly by the defendant\'s face.',
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        DD.FX.projectile(ctx.user, f, { kind: 'note', color: '#f2efe6' });
        DD.FX.text(f, 'OBJECTION!', { color: '#ffe066', size: 15 });
        A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true });
        if (active(f)) A().knockback(ctx.user, f, ctx.L.push);
      });
    },
  });

  eskill({
    id: 'rat_cease', name: 'Cease and Desist', icon: '✋', kind: 'attack', tags: ['ranged', 'root'], anchor: 'unit',
    levels: [{ dmg: 4, turns: 1 }],
    target: { type: 'unit', range: [1, 4], los: true, filter: 'enemy' },
    desc: function (L) { return 'Tracks a hero up to 4 tiles away: deal ' + L.dmg + ' damage and Root them for ' + L.turns + ' turn (they must cease all movement). Fizzles without line of sight.'; },
    flavor: 'Effective immediately. Signed, a rat.',
    // a rooted hero can't walk away from the King's Rat Pile: worth more the closer the King is
    aiScore: function (ctx) {
      const f = ctx.targetUnit;
      if (!f || DD.Act.hasStatus(f, 'root')) return -10;
      const k = king(ctx.state);
      return 6 + (k && active(k) && dist(k, f) <= 5 ? 6 : 0);
    },
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        DD.FX.projectile(ctx.user, f, { kind: 'note', color: '#ff8a7a' });
        DD.FX.text(f, 'CEASE & DESIST', { color: '#ff8a7a', size: 14 });
        A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true });
        if (active(f)) A().addStatus(f, 'root', { turns: ctx.L.turns }, ctx.user);
      });
    },
  });

  eskill({
    id: 'rat_billable', name: 'Billable Bite', icon: '🧾', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 6 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the adjacent tile. Billed in six-minute increments.'; },
    flavor: 'The retainer is non-refundable.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.lunge(ctx.user, ctx.target);
      ctx.foes.forEach(function (f) { A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true }); });
    },
  });

  // ---- the Rat King's planner -------------------------------------------------------------------------------------
  function pendingOf(unit, skillId) { return (unit.intents || []).filter(function (it) { return it.skillId === skillId; }); }

  function moveKing(unit, api, foes) {
    const opts = [{ x: unit.x, y: unit.y, cost: 0, path: [] }];
    api.reachable(unit).forEach(function (e) { opts.push(e); });
    let best = null, bestSc = -Infinity;
    opts.forEach(function (p) {
      const risk = DD.AI.pathRisk ? DD.AI.pathRisk(unit, p) : { lethal: false, penalty: 0 };
      if (risk.lethal) return;
      const adj = foes.filter(function (f) { return near8(f, p); }).length;
      const stuck = foes.filter(function (f) { return near8(f, p) && DD.Act.hasStatus(f, 'root'); }).length;
      const t = G().tile(p.x, p.y);
      let sc = -2 * nearestDist(p, foes) + (adj ? 6 + adj : 0) + stuck * 10 - risk.penalty - (p.cost || 0) * 0.05;
      if (inChannel(p)) sc += CFG.wade;              // he holds court in the sewage (a little)
      if (t && t.t === 'rat_rot') sc -= 0.5;
      if (sc > bestSc) { bestSc = sc; best = p; }
    });
    if (best && (best.x !== unit.x || best.y !== unit.y)) api.moveTo(unit, best.x, best.y);
  }

  function planGnaw(unit, api, foes, phase) {
    if (pendingOf(unit, 'rat_gnaw').length) return false;
    const sl = api.slot(unit, 'rat_gnaw');
    if (!sl) return false;
    const L = DD.skillLevel(DD.getSkill('rat_gnaw'), sl.level);
    const scored = rotTiles(api.state).filter(function (p) { return !(p.x === unit.x && p.y === unit.y); }).map(function (p) {
      let sc = 0;
      foes.forEach(function (f) { const d = dist(f, p); if (d === 0) sc += 20; else if (d === 1) sc += 6; else if (d === 2) sc += 1; });
      return { p: p, sc: sc };
    }).filter(function (e) { return e.sc > 0; }).sort(function (a, b) { return b.sc - a.sc || a.p.y - b.p.y || a.p.x - b.p.x; });
    if (!scored.length || scored[0].sc < 6) return false;
    const picks = scored.slice(0, L.n).map(function (e) { return e.p; });
    api.addIntent(unit, 'rat_gnaw', picks[0], { anchor: 'ground', tiles: picks, noCooldown: true, label: 'Gnaw' });
    return true;
  }

  function planSurge(unit, api, foes, phase) {
    const chans = channels(api.state);
    const pending = {};
    pendingOf(unit, 'rat_surge').forEach(function (it) { if (it.data && it.data.chan) pending[it.data.chan] = 1; });
    const cands = Object.keys(chans).filter(function (c) { return !pending[c]; }).map(function (c) {
      const inIt = foes.filter(function (f) { return inChannel(f, c); }).length;
      return { chan: c, n: inIt, tiles: chans[c] };
    }).filter(function (e) { return e.n > 0 || phase >= 3; }).sort(function (a, b) { return b.n - a.n || (a.chan < b.chan ? -1 : 1); });
    if (!cands.length || !cands.some(function (e) { return e.n > 0; })) return false;
    const pick = phase >= 3 ? cands : cands.slice(0, 1);
    pick.forEach(function (e) {
      const anchor = foes.filter(function (f) { return inChannel(f, e.chan); })[0] || e.tiles[Math.floor(e.tiles.length / 2)];
      api.addIntent(unit, 'rat_surge', { x: anchor.x, y: anchor.y }, { anchor: 'ground', tiles: e.tiles, delay: 1, data: { chan: e.chan }, noCooldown: true, label: 'Sewer Surge (channel ' + e.chan + ')' });
    });
    return true;
  }

  function planClass(unit, api) {
    const L = DD.skillLevel(DD.getSkill('rat_class'), 1);
    if (plaintiffs(api.state).length >= L.cap) return false;
    api.addIntent(unit, 'rat_class', unit, { tiles: [], noCooldown: true, label: 'Class Action' });
    return true;
  }

  /** Tangled Tails: reel in the most damaged hero in reach that is not already tied up (next round: Rat Pile). */
  function planTails(unit, api, foes) {
    let best = null, bs = -Infinity;
    foes.forEach(function (f) {
      const d = dist(unit, f);
      if (!inReach('rat_tails', d) || DD.Act.hasStatus(f, 'root') || !api.los(unit, f)) return;
      const sc = (1 - f.hp / Math.max(1, f.maxHp)) * 10 - d * 0.5;
      if (sc > bs) { bs = sc; best = f; }
    });
    if (!best) return false;
    api.addIntent(unit, 'rat_tails', best, { noCooldown: true });
    return true;
  }

  function ratKingPlan(unit, api) {
    const d = unit.data;
    checkSplit(unit);
    const foes = api.foes(unit);
    if (!foes.length) return;
    const phase = phaseOf(unit);
    const pat = PATTERNS[phase];
    const act = pat[(d.step || 0) % pat.length];
    d.step = (d.step || 0) + 1;
    moveKing(unit, api, foes);
    if (!active(unit)) return;
    // one rotation step; each falls back to the others when it has nothing to do (summons only on their own step)
    const FALLBACK = { surge: ['surge', 'tails', 'gnaw'], gnaw: ['gnaw', 'tails', 'surge'], tails: ['tails', 'gnaw', 'surge'], class: ['class', 'tails', 'gnaw', 'surge'] };
    const order = FALLBACK[act] || FALLBACK.gnaw;
    let reeled = false;
    for (let i = 0; i < order.length; i++) {
      const k = order[i];
      if (k === 'surge' && planSurge(unit, api, foes, phase)) break;
      if (k === 'gnaw' && planGnaw(unit, api, foes, phase)) break;
      if (k === 'tails' && planTails(unit, api, foes)) { reeled = true; break; }
      if (k === 'class' && planClass(unit, api)) break;
    }
    // Rat Pile on all 8 tiles around him, AFTER the tails (whoever gets reeled in lands in it)
    if (reeled || foes.some(function (f) { return near8(f, unit); })) api.addIntent(unit, 'rat_pile', unit, { noCooldown: true });
    // and every round the gavel flies at the most hurt hero in range that isn't already being reeled in
    // (from phase 2 on, "ORDER! ORDER!": two gavels at two different heroes)
    const skip = pendingOf(unit, 'rat_tails').map(function (it) { return it.unitId; });
    const throws = CFG.gavels[phase] || 1;
    for (let n = 0; n < throws; n++) {
      let tgt = null, ts = -Infinity;
      foes.forEach(function (f) {
        const d = dist(unit, f);
        if (!inReach('rat_gavel', d) || skip.indexOf(f.id) >= 0 || !api.los(unit, f)) return;
        const sc = (1 - f.hp / Math.max(1, f.maxHp)) * 10 - d * 0.3;
        if (sc > ts) { ts = sc; tgt = f; }
      });
      if (!tgt) break;
      skip.push(tgt.id);
      api.addIntent(unit, 'rat_gavel', tgt, { noCooldown: true });
    }
  }

  // ---- enemies ----------------------------------------------------------------------------------------------------------
  /** A tiny protest sign: "SUE!" */
  function plaintiffOverlay(g) {
    const sway = Math.sin((g.t || 0) * 3) * 0.08;
    const c = g.ctx;
    c.save(); c.translate(-3, -10); c.rotate(sway);
    g.line(0, 0, 0, -13, '#7a5534', 1.4);
    g.rect(-6.5, -19.5, 13, 7, '#f3ecd6', g.outline, 1);
    g.text('SUE!', 0, -16, 5, '#a8261c', null);
    c.restore();
  }

  DD.registerEnemy({
    id: 'rat_plaintiff', name: 'Plaintiff Rat', act: 1, tier: 'minion',
    hp: 7, mov: 4, armor: 0, tags: ['beast', 'rat'],
    flags: {}, resist: { poison: 0.5 },
    sprite: {
      base: 'quadruped', scale: 0.62,
      palette: { skin: '#7d6f66', cloth: '#7d6f66', eye: '#ff4d3d', outline: '#15110f', inner: '#e8a0aa', tail: '#e3a0a6' },
      head: { ears: 'rat', eyes: 'angry' }, tail: 'rat', shape: { legs: 'short', snout: 'long', body: 'long' },
      overlay: plaintiffOverlay,
    },
    skills: ['rat_nibble'],
    ai: 'default', xp: 1, gold: [0, 1],
    barks: {
      spawn: ['I was WRONGED!', 'See you in court!', 'Pain and suffering!'],
      attack: ['Damages!', 'This is for my emotional distress!'],
      hurt: ['Assault!', 'My lawyer will hear about this!'],
      death: ['I... settle...', 'Case... closed...'],
    },
    desc: 'A rat with a grievance and a sign. Nibbles and Bleeds. Washes down a drain or falls in a pit like any small rat.',
  });

  DD.registerEnemy({
    id: 'rat_lawyer', name: 'Rat Lawyer', act: 1, tier: 'normal',
    hp: 14, mov: 3, armor: 0, tags: ['beast', 'rat', 'lawyer'],
    flags: {}, resist: { poison: 0.5 },
    sprite: {
      base: 'humanoid', scale: 0.92, build: 'slim', outfit: 'coat',
      palette: { skin: '#8d7f74', cloth: '#2b2d3a', cloth2: '#e8e4da', hair: '#6e625a', metal: '#c9b26b', eye: '#ff4d4d', accent: '#b03030', outline: '#15110f', inner: '#e8a0aa', tail: '#e3a0a6', book: '#5a2a1a' },
      head: { ears: 'rat', face: 'glasses', eyes: 'angry', mouth: 'grin' },
      tail: 'rat', mainhand: 'scroll', offhand: 'book',
      overlay: lawyerOverlay,
    },
    skills: ['rat_objection', 'rat_cease', 'rat_billable'],
    ai: { style: 'ranged', keepDistance: 2 }, xp: 4, gold: [2, 5],
    barks: {
      spawn: ['Ratticus for the defense!', 'My client pleads the cheese.', 'I passed the bar. I also ate it.'],
      attack: ['OBJECTION!', 'Leading the witness!', 'That will be billed.'],
      hurt: ['Hearsay!', 'I demand a recess!', 'Badgering the rodent!'],
      death: ['I rest... my case...', 'Mistrial...', 'Tell the King... I billed him...'],
    },
    desc: 'Pushes heroes around with OBJECTION! from range. Pushable, unlike his client: shove him into a pit or wash him down the drain.',
  });

  DD.registerEnemy({
    id: 'rat_king', name: 'The Rat King', act: 1, tier: 'boss',
    hp: 200, mov: 5, armor: 0, tags: ['beast', 'rat', 'swarm', 'boss'],
    flags: { large: true, immovable: true, immune: ['frozen', 'sleep'] }, resist: { poison: 0.5 },
    sprite: {
      base: 'custom', scale: 1.9, height: 40, width: 40, headY: -30,
      palette: { skin: '#7d6f66', metal: '#e8c547', accent: '#d0302a', eye: '#ff4d3d', outline: '#1a1014' },
      portrait: { x: 0, y: -24, r: 18 },
      draw: drawRatKing,
    },
    skills: ['rat_pile', 'rat_gnaw', 'rat_surge', 'rat_class', 'rat_tails', 'rat_gavel'],
    ai: ratKingPlan, xp: 40, gold: [30, 40],
    hooks: {
      onCombatStart: function (u) { u.data.splits = u.data.splits || 0; A().addStatus(u, 'rat_session', { stacks: 1, turns: -1, silent: true }, u); },
      // Swelling Ranks: one more stack every round from round 2 (before planning, so the telegraphs show it)
      onRoundStart: function (u, round) {
        const now = DD.Act.getStatus(u, 'rat_swarm');
        if (round < 2 || !active(u) || (now && now.stacks >= SWARM_MAX)) return;
        const st = A().addStatus(u, 'rat_swarm', { stacks: 1, silent: true }, u);
        if (!st) return;
        DD.FX.status(u, 'rat_swarm', '+Swelling Ranks ' + st.stacks);
        A().log('More sewer rats pile onto the King: Swelling Ranks ' + st.stacks + ' (+' + CFG.swarmDmg * st.stacks + ' damage).', 'enemy');
      },
      // stun guard: after a stun (or charm) he can't be stunned or charmed again until the end of next round
      modifyStatus: function (m) {
        if (!GUARDED[m.id] || puzzleStun || !m.unit || !DD.Act.hasStatus(m.unit, 'rat_recess')) return;
        m.cancel = true;
        DD.FX.text(m.unit, '🔔 Recess: no effect', { color: '#e8d9a8', size: 13 });
      },
      onStatusApplied: function (u, st) {
        if (st && GUARDED[st.id] && active(u)) A().addStatus(u, 'rat_recess', { turns: st.fresh ? 3 : 2, silent: true }, u);
      },
      // falling in the drain (only the sewer water can move him) hurts a fixed amount: FLUSHED
      modifyIncomingDamage: function (d) { if (d.cause === 'fall') { d.mult = 0; d.flat = flushDmg(); } },
      onTakeDamage: function (d) { checkSplit(d.target); },
      onDeath: function () { A().narrate('rat_death', {}); },
    },
    barks: {
      spawn: ['All rise for His Royal Rattiness!', 'Court is in session. You are the defendants.', 'We find you... delicious.'],
      attack: ['Objection overruled!', 'Guilty! Guilty! Guilty!', 'The court will now nibble.'],
      hurt: ['Hearsay!', 'Contempt of court!', 'Order! ORDER!'],
      death: ['Court... adjourned...', 'Appeal... to... cheese...', 'We\'ll see you in Rat Hell.'],
      phase: ['Motion to split: GRANTED!', 'My associates will handle this.', 'We are many. We are billable.'],
      flush: ['Not the drain! Anything but the drain!', 'GLUB! Objection! GLUB!', 'We\'ll remember this. All forty of us.'],
    },
    desc: 'Too many rats to shove (only sewer water moves him) and too many to put to sleep; after a stun the court calls a recess (no second stun next round). More rats join the pile every round (+' + SWARM_DMG + ' damage each, up to +' + SWARM_DMG * SWARM_MAX + '). Gnaws rotten floor into pits, floods channels, reels heroes into his Rat Pile, splits into Rat Lawyers at 66% and 33% HP. Open a sluice while he wades and the drain does the rest.',
    boss: { title: 'and the Rat Bar Association', intro: 'A crowned knot of rats rises from the sewage, wearing a tiny wig. "The Court of Rats is now in session."', music: null },
  });

  // ---- encounter ----------------------------------------------------------------------------------------------------------
  // 13 x 12 sewer junction: the throne walkway up north, two 2-wide channels (A, B) draining west into the Big Drain,
  // an island between them, the party's walkway south. Valve A sits on the island, valve B on the party's walkway.
  const LAYOUT = [
    '#############',
    '#.X...B......',
    '#..r.....r...',
    'daaaaaaaaaaaa',
    'daaaaaaaaaaaa',
    '#..Er..A.rE..',
    '#.r.X.....r..',
    'dbbbbbbbbbbbb',
    'dbbbbbbbbbbbb',
    '#..r..V..r...',
    '#..H.H.H.H...',
    '#.H.H...H.H..',
  ];
  const HEIGHTS = [
    '0000000000000',
    '0111111111111',
    '0111111111111',
    '0000000000000',
    '0000000000000',
    '0111111111111',
    '0111111111111',
    '0000000000000',
    '0000000000000',
    '0111111111111',
    '0111111111111',
    '0111111111111',
  ];
  const LEGEND = {
    'a': { terrain: 'water', mark: 'rat_chanA' },
    'b': { terrain: 'water', mark: 'rat_chanB' },
    'd': { terrain: 'pit', mark: 'rat_drain' },
    'r': { terrain: 'rat_rot', mark: 'rat_rot' },
    'A': { obj: 'rat_valve', mark: 'rat_valveA' },
    'V': { obj: 'rat_valve', mark: 'rat_valveB' },
    'X': { obj: 'barrel_explosive' },
    'H': { zone: 'hero' },
  };

  DD.registerEncounter({
    id: 'boss_rat_king', act: 1, kind: 'boss', name: 'The Rat Bar Association',
    intro: 'Deep in the sewer junction, something with forty tails and one crown is holding court.',
    weight: 1, minDepth: 0,
    map: { theme: 'sewer', layout: LAYOUT, heights: HEIGHTS, legend: LEGEND },
    enemies: [{ id: 'rat_king', n: 1 }, { id: 'rat_lawyer', n: 2, mark: 'E' }],
    objective: { type: 'boss' },
    reward: { goldMult: 1, itemRarity: 'legendary' },
    onStart: function (s) {
      s.data = s.data || {};
      s.data.rat = s.data.rat || { sluices: 0, flushes: 0, drowned: 0 };
      valves(s).forEach(function (v) {
        const t = G().tile(v.x, v.y);
        v.obj.data.chan = t && t.tag === 'rat_valveA' ? 'A' : t && t.tag === 'rat_valveB' ? 'B' : valveChannel(v.obj, t);
        v.obj.data.cd = 0;
        relabelValve(v.obj);
      });
      A().narrate('rat_start', {});
    },
  });

  // ---- narration ------------------------------------------------------------------------------------------------------------
  DD.registerNarration('boss_start', [
    'The DM lowers his voice to Boss Voice. Someone giggles. The DM does not.',
  ]);
  DD.registerNarration('rat_start', [
    'DM: "Those two valves feed the channels. The channels feed the drain. I am saying this for no reason."',
    'DM: "The Rat King can\'t be shoved. Water, however, doesn\'t ask permission."',
  ]);
  DD.registerNarration('rat_flush', [
    '{hero} flushes the Rat King. Justice is served, and it is soggy.',
    'The Rat King goes down the drain. All forty of him. Then climbs out, furious and damp.',
    'DM: "That\'s... actually how you deal with rats. Fine. FINE."',
  ]);
  DD.registerNarration('rat_split', [
    'The Rat King splits. Somewhere, a law school accepts two more applicants.',
    'More lawyers peel off the pile. The billing rate doubles.',
  ]);
  DD.registerNarration('rat_death', [
    'The Rat King unravels into a hundred very confused rats. Court is adjourned, forever.',
    'The crown rolls into the drain. The Rat Bar Association is officially disbarred.',
  ]);

  // test hooks (read-only helpers for tests/content/bosses_act1.js)
  DD.RatKingBoss = { channels: channels, chanTiles: chanTiles, rotTiles: rotTiles, valves: valves, flood: flood, phaseOf: phaseOf,
    FLUSH_DMG: FLUSH_DMG, VALVE_CD: VALVE_CD, LAWYER_CAP: LAWYER_CAP, SPLITS: SPLITS.slice(), PATTERNS: PATTERNS, cfg: CFG };
})();
