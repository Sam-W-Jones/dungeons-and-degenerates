/* Dungeons and Degenerates — js/data/bosses/ratking.js
 * Act 1 boss: THE RAT KING AND THE RAT BAR ASSOCIATION (enemy 'rat_king', encounter 'boss_rat_king', a sewer junction).
 * A crowned, conjoined swarm. Too many rats to shove (immovable), so only sewer water can move him; immune to Sleep
 * and Frozen.
 * v2 (initiative, no telegraphs): he takes TWO turns a round (two initiative entries; one turn gave a solo boss too
 * few actions to matter against four heroes). Each turn he walks (he likes to wade in the channels) and does ONE
 * thing: a Rat Pile on everyone around him when a Rooted hero, or three or more heroes, stand on the 8 tiles next to
 * him; otherwise the next step of his docket — Tangled Tails (reel a hero in and Root them), Gnaw (wind-up: marked
 * rotten floor collapses into pits) or Sewer Surge (wind-up: a whole channel floods and washes everyone in it into
 * the drain). Wind-ups land one round later, at the start of the same turn of his (every unit, so every hero, gets
 * one turn first); stunning or flushing him cancels them. Tangled Tails + the Rat Pile is his combo: a reeled-in,
 * rooted hero can't walk out of the pile. His ranged picks weigh the damage (capped at what the hero has left), a
 * knockout, a hero close enough to reel into the pile and "contempt of court" — the hero who has dealt the most damage
 * (never just "whoever is lowest").
 * Swelling Ranks (soft timer): +1 stack every round from round 2, +1 damage per stack on his at-once attacks (no cap;
 * not on wind-ups).
 * Phases at 66% / 33% HP: he SPLITS, two Rat Lawyers break off (max 3 on retainer). Phase 2 "Cross-Examination":
 * Gnaw takes 3 tiles. Phase 3 "Closing Arguments": Sewer Surge floods both channels at once, Class Action.
 * Puzzle: two sluice valves (mid-arena: A on the island, B on the party walkway). Opening one washes everyone in its
 * channel into the drain: Rat Lawyers drown (an environmental kill), heroes lose 25% max HP and climb out, and the Rat
 * King is FLUSHED: 30 damage, Stunned for both of his next turns (his wind-ups are cancelled), Wet, and his Swelling
 * Ranks wash away. Each valve needs 4 rounds to build pressure again.
 * Puzzle state lives in object data and unit.data (copied by previews and deploy rewinds).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const TAU = Math.PI * 2;

  const FLUSH_DMG = 30;
  const VALVE_CD = 4;            // rounds a valve needs to build pressure again (3 made the flush an 80% win button)
  const WADE = 3;                // how much the King likes ending his move in a channel (he holds court in the sewage)
  const LAWYER_CAP = 3;
  const SWARM_DMG = 1;           // Swelling Ranks: +1 damage per stack on his at-once attacks, +1 stack per round
  const SWARM_MAX = 99;          // no real cap: the soft timer keeps growing until a flush washes it away (no stalls)
  const GUARD_TURNS = 3;         // Recess: the turn a stun costs him + his next two
  const FLUSH_STUN = 2;          // a flush costs him both of his next turns (a round)
  // balance knobs (tests may tweak them for sims): lawyers on retainer, valve recharge, wading, swarm damage
  const CFG = { lawyerCap: LAWYER_CAP, valveCd: VALVE_CD, wade: WADE, swarmDmg: SWARM_DMG, swarmFrom: 2, crowd: 3, flushStun: FLUSH_STUN };
  /** Heroes next to him that make a Rat Pile worth it even when none of them is Rooted. */
  function crowd() { return Math.max(1, Math.round(+CFG.crowd || 3)); }
  const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  const FLOW = { x: -1, y: 0 };          // the channels drain west
  const SPLITS = [0.66, 0.33];
  // his docket: one step per turn (two turns a round); a crowd (or a Rooted hero) next to him gets the Rat Pile instead
  const PATTERNS ={ 1: ['tails', 'gnaw', 'tails', 'surge'], 2: ['tails', 'surge', 'tails', 'gnaw'], 3: ['tails', 'surge', 'class', 'gnaw'] };
  const STEP_NAMES = { tails: 'Tangled Tails', gavel: 'Order in the Court!', gnaw: 'Gnaw', surge: 'Sewer Surge', class: 'Class Action', pile: 'Rat Pile' };
  const LAWYER_NAMES = ['Ratticus Finch', 'Squeakson Esq.', 'Barrister Whiskers', 'Ratrick, Ratrick & Rat', 'Cheddarton QC', 'Johnnie Gnawchran'];

  // ---- helpers ----------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function out(u) { return !active(u) || DD.Act.isStunned(u) || DD.Act.hasStatus(u, 'sheep'); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function nearestDist(p, list) { let d = Infinity; list.forEach(function (q) { d = Math.min(d, dist(p, q)); }); return d; }
  function plural(n, w) { return n + ' ' + (n === 1 ? w : w + 's'); }
  function rooted(u) { return DD.Act.hasStatus(u, 'root'); }

  function tilesWhere(s, fn) {
    const res = [];
    if (!s || !s.grid) return res;
    s.grid.tiles.forEach(function (t) { if (fn(t)) res.push(t); });
    return res;
  }
  function chanOf(t) { return t && typeof t.tag === 'string' && t.tag.indexOf('rat_chan') === 0 ? t.tag.slice(8) : null; }
  function channels(s) {
    const res = {};
    tilesWhere(s || S(), function (t) { return !!chanOf(t); }).forEach(function (t) { const c = chanOf(t); (res[c] = res[c] || []).push({ x: t.x, y: t.y }); });
    return res;
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
    const res = [];
    tiles.forEach(function (p) { const u = G().unitAt(p.x, p.y); if (active(u) && res.indexOf(u) < 0) res.push(u); });
    return res;
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
      return st.stacks >= 3 ? 'Closing Arguments (phase 3): Sewer Surge floods both channels at once and Class Action calls in Plaintiff Rats.'
        : st.stacks >= 2 ? 'Cross-Examination (phase 2): Gnaw takes up to 3 rotten tiles at once. Splits again at 33% HP.'
          : 'Opening Statements: splits off two Rat Lawyers at 66% and again at 33% HP.';
    },
  });

  // the soft timer: more sewer rats join the pile every round; a flush washes them away. Only his at-once attacks get
  // the bonus: it grows at the round start, which could raise a pending wind-up after the heroes' last look at it
  const WINDUPS = { rat_gnaw: 1, rat_surge: 1 };
  function swarmNow(u) { const st = u && DD.Act.getStatus(u, 'rat_swarm'); return st ? CFG.swarmDmg * st.stacks : 0; }
  DD.registerStatus({
    id: 'rat_swarm', name: 'Swelling Ranks', icon: '🐀', color: '#b59a86', type: 'buff', stacking: 'stack', maxStacks: SWARM_MAX,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      return 'More sewer rats join the pile every round: +' + CFG.swarmDmg * st.stacks + ' damage on his Rat Pile, Tangled Tails and gavel (no cap; not on his wind-ups). ' +
        'Flushing him down the drain washes them all away.';
    },
    telegraphFlat: function (st) { return CFG.swarmDmg * st.stacks; },
    hooks: {
      modifyOutgoingDamage: function (d, st) {
        if (d.cause === 'skill' && d.source && d.source.defId === 'rat_king' && !(d.skill && WINDUPS[d.skill.id])) d.flat += CFG.swarmDmg * st.stacks;
      },
    },
  });

  // stun guard (like the act 2 and 3 bosses): a swarm can't be stun-locked. During the recess a stun no longer costs him
  // a turn but still scatters his wind-ups (stun = THE wind-up counter); the flush always lands
  // guarded: every stun-like status (stun, sleep, frozen, a banana peel...) and charm
  function stunLike(id) { return !!(DD.Act && DD.Act.isStunLike(id)); }
  function guarded(id) { return id === 'charmed' || stunLike(id); }
  let puzzleStun = false;
  DD.registerStatus({
    id: 'rat_recess', name: 'Recess', icon: '🔔', color: '#c9b26b', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: GUARD_TURNS,
    desc: function (st) {
      return 'The court just took a recess: stuns (banana peels too) and Charm don\'t land on him (a stun still cancels his wind-ups; a flush still knocks him flat).' +
        (st && st.turns > 0 ? ' (' + plural(st.turns, 'turn') + ' of his left)' : '');
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
    desc: 'Chewed-through flooring. The Rat King can Gnaw it into a pit; anyone still standing on it when it goes falls in (flyers just hover).',
    draw: drawRot,
  });

  DD.registerObject({
    id: 'rat_valve', name: 'Sluice Valve', blocksMove: true, blocksLos: false, hp: 0, height: 1.3, color: '#5f7d6e', dmg: FLUSH_DMG,
    desc: 'Interact (1 AP): open the sluice. Everyone standing in its channel is washed all the way into the drain (flyers stay dry): enemies drown, heroes lose 25% max HP and climb out, and the Rat King is FLUSHED (' + FLUSH_DMG + ' damage, Stunned for both of his next turns, Wet, and his Swelling Ranks wash away). Needs ' + VALVE_CD + ' rounds to build pressure again.',
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
    try { A().addStatus(u, 'stun', { turns: CFG.flushStun || FLUSH_STUN }, src || null); } finally { puzzleStun = false; }
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
   * anyone it could not wash all the way still ends up in the drain.
   */
  function flood(chan, src, opts) {
    opts = opts || {};
    const tiles = chanTiles(chan);
    if (!tiles.length) return { moved: [], drowned: [], flushed: false };
    const res = { moved: [], drowned: [], flushed: false };
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
      let r;
      try { r = A().push(src || null, u, FLOW, 30, { bump: 0, slide: false }); } finally { if (isKing && u.flags) u.flags.immovable = was; }
      if (r && r.moved) res.moved.push(u);
      let fell = !!(r && r.fell);
      if (!fell && drain && active(u) && inChannel(u, chan) && (isKing || !A().isImmovable(u))) { A().fall(u, src || null); fell = true; }
      if (fell) {
        if (u.dead) res.drowned.push(u);
        else if (isKing) { flush(u, src); res.flushed = true; } else climbOut(u);
      }
    });
    if (res.drowned.some(function (u) { return u.defId === 'rat_lawyer'; }) && !A().simulating) {
      A().log(DROWN_LINES[Math.floor(DD.rng.next() * DROWN_LINES.length) % DROWN_LINES.length], 'narrator');
    }
    return res;
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
    const res = [];
    for (let i = 0; i < want && i < spots.length; i++) {
      const L = A().spawn('rat_lawyer', spots[i].x, spots[i].y, { silent: true });
      if (!L) continue;
      L.name = LAWYER_NAMES[Math.floor(DD.rng.next() * LAWYER_NAMES.length) % LAWYER_NAMES.length];
      A().log(L.name + ' splits off the Rat King and passes the bar.', 'enemy');
      A().maybeBark(L, 'spawn', 0.7);
      res.push(L);
    }
    return res;
  }

  /** Class Action: Plaintiff Rats crawl out next to the drains (next to the King on a map without drains). */
  function classAction(k, n, cap) {
    const s = S();
    const want = Math.min(n, Math.max(0, cap - plaintiffs(s).length));
    if (want <= 0) { DD.FX.text(k, 'Case dismissed!', { color: '#d0d0d0', size: 13 }); return []; }
    const heroes = DD.Combat.active('hero');
    let spots = [];
    tilesWhere(s, function (t) { return t.tag === 'rat_drain'; }).forEach(function (dr) {
      G().emptyTilesNear(dr.x, dr.y, 2).forEach(function (p) {
        if (!G().isDrop(p.x, p.y) && !inChannel(p) && !spots.some(function (q) { return q.x === p.x && q.y === p.y; })) spots.push(p);
      });
    });
    spots.sort(function (a, b) { return nearestDist(a, heroes) - nearestDist(b, heroes) || a.y - b.y || a.x - b.x; });
    if (!spots.length) spots = G().emptyTilesNear(k.x, k.y, 3).filter(function (p) { return !G().isDrop(p.x, p.y); });
    const res = [];
    for (let i = 0; i < want && i < spots.length; i++) {
      const r = A().spawn('rat_plaintiff', spots[i].x, spots[i].y, { silent: true });
      if (!r) continue;
      DD.FX.particles(r, { kind: 'bubbles', count: 8 });
      res.push(r);
    }
    if (res.length) {
      A().log('Class action! ' + res.length + ' Plaintiff Rat' + (res.length === 1 ? '' : 's') + ' crawl out of the drains to join the lawsuit.', 'enemy');
      A().maybeBark(res[0], 'spawn', 0.7);
    }
    return res;
  }

  function split(u, k) {
    const phase = 1 + k;
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
    const res = [];
    if (!p) return res;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) res.push({ x: p.x + dx, y: p.y + dy });
    return res;
  }
  function near8(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1; }
  /** A skill's reach (its def's target.range), so desc, planner and targeting always agree. */
  function reach(id) { const s = DD.getSkill(id); return (s && s.target && s.target.range) || [1, 1]; }
  function reachText(id) { const r = reach(id); return r[0] === r[1] ? String(r[0]) : r[0] + '-' + r[1]; }
  function inReach(id, d) { const r = reach(id); return d >= r[0] && d <= r[1]; }

  eskill({
    id: 'rat_pile', name: 'Rat Pile', icon: '🐀', kind: 'attack', tags: ['melee', 'aoe'], anchor: 'self',
    levels: [{ dmg: 7, bleed: 1 }],
    target: { type: 'self' }, area: { shape: 'custom', fn: function (ctx) { return around(ctx && ctx.user); } },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage and Bleed ' + L.bleed + ' to every hero on the 8 tiles around him (diagonals too).';
    },
    flavor: 'Two dozen teeth, one shared opinion.',
    execute: function (ctx) {
      DD.FX.particles(ctx.user, { kind: 'dust', count: 10 });
      ctx.foes.forEach(function (f) {
        DD.FX.lunge(ctx.user, f, { parallel: true });
        if (rooted(f)) DD.FX.text(f, 'BURIED IN RATS', { color: '#e7a3ab', size: 14 });
        A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true });
        if (active(f)) A().addStatus(f, 'bleed', { stacks: ctx.L.bleed }, ctx.user);
      });
    },
  });

  eskill({
    id: 'rat_gnaw', name: 'Gnaw', icon: '🦷', kind: 'attack', tags: ['aoe', 'terrain', 'windup'], anchor: 'ground',
    levels: [{ dmg: 8, n: 2, n2: 3 }],
    target: { type: 'tile', range: [0, 40], los: false, filter: 'any' },
    desc: function (L) {
      return 'Wind-up (lands one round later): the marked rotten floor tiles (up to ' + L.n + ' near heroes, ' + L.n2 + ' from phase 2) give way: ' + L.dmg +
        ' damage to every hero on them, then they collapse into pits (a falling hero loses 25% max HP and climbs out).';
    },
    flavor: 'The building code was more of a suggestion.',
    telegraphFlat: function (unit) { return -swarmNow(unit); },   // Swelling Ranks don't apply to wind-ups
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
    id: 'rat_surge', name: 'Sewer Surge', icon: '🌊', kind: 'attack', tags: ['aoe', 'windup', 'water', 'push'], anchor: 'ground',
    levels: [{ dmg: 8 }],
    target: { type: 'tile', range: [0, 40], los: false, filter: 'any' },
    desc: function (L) {
      return 'Wind-up (lands one round later): the marked channel floods: ' + L.dmg + ' damage to every hero in it, then everyone standing in it but him is washed into the drain (flyers stay dry; a hero loses 25% max HP and climbs out; his own rats drown).';
    },
    flavor: 'High tide in the low places.',
    telegraphFlat: function (unit) { return -swarmNow(unit); },   // Swelling Ranks don't apply to wind-ups
    execute: function (ctx) {
      const chan = (ctx.intent && ctx.intent.data && ctx.intent.data.chan) || chanOf(ctx.tiles[0] ? G().tile(ctx.tiles[0].x, ctx.tiles[0].y) : null);
      A().log('SEWER SURGE! Channel ' + (chan || '?') + ' floods.', 'enemy');
      A().damageTiles(ctx.user, ctx.tiles, ctx.L.dmg, { filter: 'foes', noHighGround: true });
      if (chan) flood(chan, ctx.user, { exempt: ctx.user.id });
    },
  });

  eskill({
    id: 'rat_gavel', name: 'Order in the Court!', icon: '🔨', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 10 }],
    target: { type: 'unit', range: [1, 6], los: true, filter: 'enemy' },
    desc: function (L) { return 'Hurl the gavel at a hero ' + reachText('rat_gavel') + ' tiles away (line of sight): deal ' + L.dmg + ' damage.'; },
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
    levels: [{ dmg: 6, pull: 2, turns: 1 }],
    target: { type: 'unit', range: [1, 6], los: true, filter: 'enemy' },
    desc: function (L) {
      return 'Lash a hero ' + reachText('rat_tails') + ' tiles away (line of sight): deal ' + L.dmg + ' damage, pull them ' + L.pull + ' tiles toward him and Root them for ' + plural(L.turns, 'turn') + '.';
    },
    flavor: 'Forty tails, one knot, and now you are in it.',
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
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent hero and Bleed ' + L.bleed + '.'; },
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
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a hero up to 4 tiles away (line of sight) and push them ' + L.push + ' tile away.'; },
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
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a hero up to 4 tiles away (line of sight) and Root them for ' + plural(L.turns, 'turn') + '.'; },
    flavor: 'Effective immediately. Signed, a rat.',
    // a rooted hero can't walk away from the King's Rat Pile: worth more the closer the King is
    aiScore: function (ctx) {
      const f = ctx.targetUnit;
      if (!f || rooted(f)) return -10;
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
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent hero. Billed in six-minute increments.'; },
    flavor: 'The retainer is non-refundable.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.lunge(ctx.user, ctx.target);
      ctx.foes.forEach(function (f) { A().damage(ctx.user, f, ctx.L.dmg, { noHighGround: true }); });
    },
  });

  // ---- the Rat King's planner (v2: walk, one docket step, then a Rat Pile if anyone is next to him) -------------------
  function pendingOf(unit, skillId) { return (unit.intents || []).filter(function (it) { return it.skillId === skillId; }); }

  /**
   * Where he stands this turn: close to the party (a hero 2-3 tiles away can be reeled into the pile, a crowd next to
   * him gets piled on, a rooted one is lunch), a little wading in the channels, walks priced with the attacks of
   * opportunity they provoke, never onto his own marked Gnaw tiles. Boxed in (a downed hero and a barrel in a corner:
   * no tile to walk to) with nothing to do from there, the swarm scurries through the cracks instead (see stalled).
   */
  function moveKing(unit, api, foes) {
    const opts = [{ x: unit.x, y: unit.y, cost: 0, path: [], here: true }];
    api.reachable(unit).forEach(function (e) { opts.push(e); });
    if (opts.length === 1 && !DD.Act.cantMove(unit) && stalled(unit, api, foes) && scurry(unit, foes)) return;
    // his own pending Gnaw: standing on a marked tile when it lands drops him into the pit (a free 30 for the party)
    const gnawed = {};
    pendingOf(unit, 'rat_gnaw').forEach(function (it) { DD.AI.intentTiles(unit, it).forEach(function (q) { gnawed[q.x + ',' + q.y] = 1; }); });
    let best = null, bestSc = -Infinity;
    opts.forEach(function (p) {
      const risk = DD.AI.pathRisk ? DD.AI.pathRisk(unit, p) : { lethal: false, penalty: 0 };
      if (risk.lethal) return;
      const aoo = p.here ? 0 : api.aooCost(unit, p);
      if (aoo === Infinity) return;
      const adj = foes.filter(function (f) { return near8(f, p); }).length;
      const stuck = foes.filter(function (f) { return near8(f, p) && rooted(f); }).length;
      const reel = foes.some(function (f) { const dd = dist(f, p); return dd >= 2 && dd <= 3 && !rooted(f) && G().los(p, f); });
      const t = G().tile(p.x, p.y);
      const pile = adj >= crowd() || stuck > 0;                   // a Rat Pile right now beats setting up a reel
      let sc = -2 * nearestDist(p, foes) + (adj ? 6 + adj : 0) + (pile ? 6 : 0) + stuck * 4 + (reel && !pile ? 3 : 0) - risk.penalty - aoo - (p.cost || 0) * 0.05;
      if (inChannel(p)) sc += CFG.wade;              // he holds court in the sewage (a little)
      if (t && t.t === 'rat_rot') sc -= 0.5;
      if (gnawed[p.x + ',' + p.y]) sc -= 60;
      if (sc > bestSc) { bestSc = sc; best = p; }
    });
    if (best && !best.here) api.moveTo(unit, best.x, best.y);
  }

  /**
   * Boxed in AND with nothing to do from here: no Rat Pile (no crowd, nobody Rooted next to him) and nobody in reach of
   * Tangled Tails or the gavel. Heroes who surround him get piled on, not scurried away from.
   */
  function stalled(unit, api, foes) {
    if (pileTime(unit, api)) return false;
    return !rangedTarget(unit, api, foes, 'rat_tails', false) && !rangedTarget(unit, api, foes, 'rat_gavel', false);
  }
  /**
   * Boxed in with nowhere to walk and nothing in reach (bodies can't be walked through, and a corner + a barrel + one
   * downed hero does it): forty rats squeeze through the cracks and re-form on the free tile within his move (bodies
   * ignored) closest to the party. A teleport, so no attacks of opportunity. Without this a boxed-in King stalled the
   * fight (a 30-round sim).
   */
  function scurry(unit, foes) {
    const mov = DD.Combat.effectiveMov(unit);
    let best = null, bestSc = Infinity;
    G().reachable(unit, mov, { ignoreUnits: true }).forEach(function (e) {
      if (!G().isFree(e.x, e.y, unit) || G().isDrop(e.x, e.y) || G().hazardAt(e.x, e.y, unit)) return;
      const sc = nearestDist(e, foes) * 10 + e.cost;
      if (sc < bestSc) { bestSc = sc; best = e; }
    });
    if (!best) return false;
    const from = { x: unit.x, y: unit.y };
    if (!A().teleport(unit, best.x, best.y, { fx: false })) return false;
    DD.FX.jump(unit, from, best);
    DD.FX.text(unit, 'Scurry!', { color: '#e7a3ab', size: 15 });
    A().log('Boxed in, the Rat King scatters into forty rats and re-forms a few tiles away.', 'enemy');
    return true;
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

  /**
   * Gnaw (wind-up): the rotten tiles under and next to heroes (a rooted one can't step off). A flyer over the rot only
   * takes the bite: it never falls in (v2), so its tile is worth less.
   */
  function planGnaw(unit, api, foes, phase) {
    if (pendingOf(unit, 'rat_gnaw').length) return false;
    const L = DD.skillLevel(DD.getSkill('rat_gnaw'), 1);
    const n = phase >= 2 ? L.n2 : L.n;
    const scored = rotTiles(api.state).filter(function (p) { return !(p.x === unit.x && p.y === unit.y); }).map(function (p) {
      let sc = 0;
      foes.forEach(function (f) {
        const d = dist(f, p);
        if (d === 0) sc += G().isFlying(f) ? 8 : rooted(f) ? 35 : 20;
        else if (d === 1) sc += 6;
        else if (d === 2) sc += 1;
      });
      return { p: p, sc: sc };
    }).filter(function (e) { return e.sc > 0; }).sort(function (a, b) { return b.sc - a.sc || a.p.y - b.p.y || a.p.x - b.p.x; });
    if (!scored.length || scored[0].sc < 6) return false;
    const picks = scored.slice(0, n).map(function (e) { return e.p; });
    return !!windUpRound(api, unit, 'rat_gnaw', picks[0], { tiles: picks, label: 'Gnaw' });
  }

  /** Sewer Surge (wind-up): the channel with the most heroes in it (phase 3: both channels). */
  function planSurge(unit, api, foes, phase) {
    const chans = channels(api.state);
    const pending = {};
    pendingOf(unit, 'rat_surge').forEach(function (it) { if (it.data && it.data.chan) pending[it.data.chan] = 1; });
    const cands = Object.keys(chans).filter(function (c) { return !pending[c]; }).map(function (c) {
      const inIt = foes.filter(function (f) { return inChannel(f, c); });
      return { chan: c, n: inIt.length + inIt.filter(rooted).length, tiles: chans[c], first: inIt[0] };
    }).filter(function (e) { return e.n > 0 || phase >= 3; }).sort(function (a, b) { return b.n - a.n || (a.chan < b.chan ? -1 : 1); });
    if (!cands.length || !cands.some(function (e) { return e.n > 0; })) return false;
    const pick = phase >= 3 ? cands : cands.slice(0, 1);
    pick.forEach(function (e, i) {
      const anchor = e.first || e.tiles[Math.floor(e.tiles.length / 2)];
      windUpRound(api, unit, 'rat_surge', { x: anchor.x, y: anchor.y }, { tiles: e.tiles, data: { chan: e.chan }, label: 'Sewer Surge (' + e.chan + ')',
        banner: i === 0 ? (pick.length > 1 ? 'Both channels are about to flood!' : 'Channel ' + e.chan + ' is about to flood!') : false });
    });
    return true;
  }

  /** Damage a unit has dealt this fight (the fight's own stats). */
  function dealt(u) { const s = S(); const st = s && s.stats && s.stats.units && s.stats.units[u.id]; return st ? st.dmg || 0 : 0; }
  /**
   * Who a ranged docket attack goes for (in reach, in sight), by score: the damage the hit would do, capped at what the
   * hero has left; +10 for a knockout (a sure kill tempts him, DESIGN §8); +12 for Tangled Tails on a hero 1-3 tiles
   * away (reeled next to him, Rooted: Rat Pile fodder); and contempt of court, up to +4 for the hero who has dealt the
   * most damage this fight (never "whoever is lowest"). The cap keeps him from knocking the same freshly helped-up hero
   * down forever while the helpers stand around: as the swarm grows, a healthy hero is worth more than a 25%-HP one.
   */
  function rangedTarget(unit, api, foes, skillId, skipRooted) {
    const L = DD.skillLevel(DD.getSkill(skillId), 1);
    const dmg = ((L && L.dmg) || 0) + swarmNow(unit);
    const top = Math.max(1, foes.reduce(function (m, f) { return Math.max(m, dealt(f)); }, 0));
    let best = null, bs = -Infinity;
    foes.forEach(function (f) {
      const d = dist(unit, f);
      if (!inReach(skillId, d) || !api.los(unit, f) || (skipRooted && rooted(f))) return;
      const left = f.hp + (f.block || 0);
      const est = dmg > 0 ? DD.AI.estimate(unit, f, dmg, null) : 0;
      const sc = Math.min(est, left) + (est >= left && est > 0 ? 10 : 0) + (skillId === 'rat_tails' && d <= 3 ? 12 : 0) + 4 * dealt(f) / top - d * 0.01;
      if (sc > bs) { bs = sc; best = f; }
    });
    return best;
  }
  function doTails(unit, api, foes) {
    const tgt = rangedTarget(unit, api, foes, 'rat_tails', true);
    return !!tgt && api.act(unit, 'rat_tails', tgt, { noCooldown: true });
  }
  function doGavel(unit, api, foes) {
    const tgt = rangedTarget(unit, api, foes, 'rat_gavel', false);
    return !!tgt && api.act(unit, 'rat_gavel', tgt, { noCooldown: true });
  }
  function doClass(unit, api) {
    const L = DD.skillLevel(DD.getSkill('rat_class'), 1);
    if (plaintiffs(api.state).length >= L.cap) return false;
    return api.act(unit, 'rat_class', unit, { noCooldown: true });
  }

  function doAction(unit, api, k) {
    const foes = api.foes(unit);
    return k === 'tails' ? doTails(unit, api, foes) : k === 'gavel' ? doGavel(unit, api, foes) : k === 'class' ? doClass(unit, api) : false;
  }
  function doWind(unit, api, k, phase) {
    const foes = api.foes(unit);
    return k === 'surge' ? planSurge(unit, api, foes, phase) : k === 'gnaw' ? planGnaw(unit, api, foes, phase) : false;
  }

  /** Rat Pile time: a Rooted hero, or a crowd (CFG.crowd: three or more heroes), on the 8 tiles around him. */
  function pileTime(unit, api) {
    const near = api.foes(unit).filter(function (f) { return near8(f, unit); });
    return near.length >= crowd() || near.some(rooted);
  }
  const WIND_STEP = { gnaw: 1, surge: 1 };
  /**
   * One docket step now. Tangled Tails falls back to the gavel (everyone in reach is already Rooted), Class Action to
   * Tangled Tails; a wind-up step winds up its Gnaw / Sewer Surge (or the other one) and throws the gavel instead while
   * one is still pending or when neither has anyone to catch.
   */
  function docketStep(unit, api, k, phase) {
    if (WIND_STEP[k]) {
      if (!pendingOf(unit, 'rat_gnaw').length && !pendingOf(unit, 'rat_surge').length) {
        if (doWind(unit, api, k, phase)) return k;
        const v = k === 'gnaw' ? 'surge' : 'gnaw';
        if (doWind(unit, api, v, phase)) return v;
      }
      return doAction(unit, api, 'gavel') ? 'gavel' : null;
    }
    if (doAction(unit, api, k)) return k;
    const alt = k === 'tails' ? 'gavel' : 'tails';
    return doAction(unit, api, alt) ? alt : null;
  }

  /**
   * One of his two turns a round: walk, then ONE thing — a Rat Pile when a Rooted hero, or three or more heroes, stand
   * on the 8 tiles around him, otherwise the next step of his docket (PATTERNS; see docketStep for the fallbacks).
   */
  function ratKingPlan(unit, api) {
    const d = unit.data;
    checkSplit(unit);
    if (!active(unit) || !api.foes(unit).length) return;
    const phase = phaseOf(unit);
    moveKing(unit, api, api.foes(unit));
    if (out(unit)) return;
    let did = null;
    if (pileTime(unit, api) && api.act(unit, 'rat_pile', unit, { noCooldown: true })) did = 'pile';
    else {
      const pat = PATTERNS[phase] || PATTERNS[1];
      const k = pat[(d.step || 0) % pat.length];
      d.step = (d.step || 0) + 1;
      d.lastStep = k;
      did = docketStep(unit, api, k, phase);
    }
    d.lastAct = did;
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
    passive: { name: 'Billable Hours', icon: '⚖️', desc: 'On its turn it keeps its distance and objects (push) or serves a Cease and Desist (Root: it loves rooting a hero near the King). Next to a hero it bites, and so it does when you walk away from it.' },
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
    hp: 150, mov: 5, armor: 0, init: 2, turnsPerRound: 2, tags: ['beast', 'rat', 'swarm', 'boss'],
    flags: { large: true, immovable: true, immune: ['frozen', 'sleep'] }, resist: { poison: 0.5 },
    sprite: {
      base: 'custom', scale: 1.9, height: 40, width: 40, headY: -30,
      palette: { skin: '#7d6f66', metal: '#e8c547', accent: '#d0302a', eye: '#ff4d3d', outline: '#1a1014' },
      portrait: { x: 0, y: -24, r: 18 },
      draw: drawRatKing,
    },
    skills: ['rat_pile', 'rat_tails', 'rat_gavel', 'rat_class'],
    ai: ratKingPlan, aiStyle: 'ranged', xp: 40, gold: [30, 40],
    passive: {
      name: 'Court Docket', icon: '⏳',
      desc: function (u) {
        const pat = PATTERNS[phaseOf(u)] || PATTERNS[1];
        const next = u && u.data ? pat[(u.data.step || 0) % pat.length] : null;
        return 'Two turns a round. Each turn: a Rat Pile if ' + NUM[crowd()] + ' or more heroes, or a Rooted one, are next to him, otherwise his docket: ' +
          pat.map(function (k) { return STEP_NAMES[k]; }).join(', ') + (next ? ' (next: ' + STEP_NAMES[next] + ')' : '') +
          '. Gnaw and Sewer Surge are wind-ups that land one round later (a stun or a flush cancels them); with nobody near the rot or in the water he throws his gavel instead.';
      },
    },
    hooks: {
      onCombatStart: function (u) { u.data.splits = u.data.splits || 0; A().addStatus(u, 'rat_session', { stacks: 1, turns: -1, silent: true }, u); },
      onTurnStart: function (u) { openWindow(u); },
      // Swelling Ranks: one more stack every round from round 2 (the round count, not his turns)
      onRoundStart: function (u, round) {
        const now = DD.Act.getStatus(u, 'rat_swarm');
        if (round < (CFG.swarmFrom || 2) || !active(u) || (now && now.stacks >= SWARM_MAX)) return;
        const st = A().addStatus(u, 'rat_swarm', { stacks: 1, silent: true }, u);
        if (!st) return;
        DD.FX.status(u, 'rat_swarm', '+Swelling Ranks ' + st.stacks);
        A().log('More sewer rats pile onto the King: Swelling Ranks ' + st.stacks + ' (+' + CFG.swarmDmg * st.stacks + ' damage).', 'enemy');
      },
      // stun guard: after a stun (or charm) none of them lands for his next GUARD_TURNS turns, but a stun still scatters
      // his pending wind-ups
      modifyStatus: function (m) {
        if (!guarded(m.id) || puzzleStun || !m.unit || !DD.Act.hasStatus(m.unit, 'rat_recess')) return;
        m.cancel = true;
        const cut = stunLike(m.id) && (m.unit.intents || []).length ? DD.AI.cancelIntents(m.unit, 'Order! Wind-up scattered') : 0;
        if (!cut) DD.FX.text(m.unit, '🔔 Recess: no effect', { color: '#e8d9a8', size: 13 });
      },
      onStatusApplied: function (u, st) {
        if (st && guarded(st.id) && active(u)) A().addStatus(u, 'rat_recess', { turns: CFG.guard || GUARD_TURNS, silent: true }, u);
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
    desc: 'Too many rats to shove (only sewer water moves him) and too many to put to sleep or freeze; after a stun the court calls a recess (no second one for a while, though a stun always cancels his wind-ups). More rats join the pile every round (+' + SWARM_DMG + ' damage each on his Rat Pile, Tangled Tails and gavel, no cap) until a flush washes them away. Takes two turns a round. Reels heroes in with Tangled Tails and buries them under a Rat Pile, gnaws rotten floor into pits, floods the channels, splits into Rat Lawyers at 66% and 33% HP. Open a sluice while he wades and the drain does the rest.',
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
    FLUSH_DMG: FLUSH_DMG, VALVE_CD: VALVE_CD, LAWYER_CAP: LAWYER_CAP, SPLITS: SPLITS.slice(), PATTERNS: PATTERNS,
    SWARM_MAX: SWARM_MAX, GUARD_TURNS: GUARD_TURNS, cfg: CFG };
})();
