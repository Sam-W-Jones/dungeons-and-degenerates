/* Dungeons and Degenerates — js/data/heroes/hjalmar.js
 * Hero: HJALMAR, THE MENACE — a small, gleeful, very mischievous monkey (he/him) who rigs the battlefield with comedic
 * traps and makes foes walk into them. v2-native (initiative, no telegraphs, no Guard), DESIGN §6 "Hjalmar" + "Simplicity".
 * Traps are non-blocking objects on empty tiles (hja_peel, hja_bear_trap, hja_cushion, hja_paint, hja_firecracker,
 * hja_glove; data.owner = Hjalmar's unit id). The first foe of his to enter one (walking, pushed, pulled, swapped,
 * teleported; flyers float over) springs it: one verb per trap. Foes never see them (no AI hazard), so traps punish the
 * paths enemies walk on their own turns and every push, pull and swap the party makes.
 * Passive "Monkey Business": every trap a foe springs gives the party 5 Hype (the crowd loves a pratfall).
 * Registers: hero hjalmar, 11 skills (hja_*), status hja_slipped, 6 trap objects, 3 hero items.
 * Public helpers for tests / other content: DD.Hjalmar (setTrap, spring, traps, canTrapAt, gloveTiles, KINDS...).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const HERO = 'hjalmar';
  const SLIPPED = 'hja_slipped';
  const TRAP_HYPE = 5;                      // Monkey Business: party Hype per trap a foe springs
  const COCONUT = 'hja_coconut', POMADE = 'hja_pomade', SACK = 'hja_prop_sack';
  const BANANA = '#ffd84a', BANANA_DARK = '#c99a1c', FUR = '#8b5a2b', FUR_DARK = '#5e3a1e', FACE = '#ecc9a0';
  const FEZ = '#c62f2f', PINK = '#ff7aa8', PAINTS = ['#ff4d6d', '#3fa7ff', '#7be05a', '#ffd84a'];

  /** One entry per trap kind: its object, its skill and how it is named. */
  const KINDS = {
    peel: { obj: 'hja_peel', skill: 'hja_peel', name: 'Banana Peel', icon: '🍌' },
    bear: { obj: 'hja_bear_trap', skill: 'hja_bear_trap', name: 'Bear Trap', icon: '🪤' },
    cushion: { obj: 'hja_cushion', skill: 'hja_cushion', name: 'Whoopee Cushion', icon: '💨' },
    paint: { obj: 'hja_paint', skill: 'hja_paint', name: 'Paint Bucket', icon: '🎨' },
    boom: { obj: 'hja_firecracker', skill: 'hja_firecracker', name: 'Firecracker Bundle', icon: '🧨' },
    glove: { obj: 'hja_glove', skill: 'hja_glove', name: 'Spring Glove', icon: '🥊' },
  };
  const TRAP_OBJ = {}, TRAP_SKILL = {};
  Object.keys(KINDS).forEach(function (k) { TRAP_OBJ[KINDS[k].obj] = k; TRAP_SKILL[KINDS[k].skill] = k; });

  // ---- helpers ------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function FX() { return DD.FX; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function byId(id) { return id && DD.Combat ? DD.Combat.byId(id) : null; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function dataOf(u) { return u.data || (u.data = {}); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  /** Item check for a combat unit (items: [ids]) or a RunHero (items: { weapon, armor, trinket }). */
  function hasItem(u, id) {
    if (!u || !u.items) return false;
    if (Array.isArray(u.items)) return u.items.indexOf(id) >= 0;
    for (const k in u.items) if (u.items[k] === id) return true;
    return false;
  }
  /** "through its next turn" / "through its next 2 turns". */
  function nextTurns(n) { return n > 1 ? 'through its next ' + n + ' turns' : 'through its next turn'; }

  // ---- traps ----------------------------------------------------------------------------------------
  function isTrap(o) { return !!o && !!TRAP_OBJ[o.id]; }
  function ownerOf(o) { return o && o.data ? byId(o.data.owner) : null; }
  /** Hostile to the trap's owner (ownerless traps catch the enemy side). */
  function isFoe(owner, u) {
    if (!active(u)) return false;
    return owner ? G().hostile(owner, u) : u.side === 'enemy';
  }
  /** Trap tiles, oldest first: of one owner (unit or id), or everybody's. */
  function traps(owner) {
    const s = S();
    if (!s || !s.grid) return [];
    const id = owner && typeof owner === 'object' ? owner.id : owner;
    const out = [];
    s.grid.tiles.forEach(function (t) { if (isTrap(t.obj) && (!id || (t.obj.data && t.obj.data.owner === id))) out.push(t); });
    out.sort(function (a, b) { return ((a.obj.data && a.obj.data.seq) || 0) - ((b.obj.data && b.obj.data.seq) || 0); });
    return out;
  }
  /** Room for a trap: an empty, walkable tile (no unit, no object, not a pit) → true | reason. */
  function canTrapAt(p) {
    const t = p && G().tile(p.x, p.y);
    if (!t) return 'Off the map.';
    if (t.obj) return 'Something is already there.';
    if (!G().isFree(p.x, p.y) || G().isDrop(p.x, p.y)) return 'No room for a trap.';
    return true;
  }
  /** The tile label shown in the inspect panel: the trap and its numbers. */
  function labelOf(kind, d) {
    const K = KINDS[kind];
    switch (kind) {
      case 'bear': return K.name + ' (' + d.snap + ' damage, Root)';
      case 'cushion': return K.name + ' (Taunt, ' + plural(d.turns || 1, 'turn') + ')';
      case 'paint': return K.name + ' (Dazzle, ' + plural(d.turns || 1, 'turn') + ')';
      case 'boom': return K.name + ' (' + d.boom + ' fire, radius 1)';
      case 'glove': return K.name + ' (knocks ' + plural(d.push, 'tile') + ' ' + dirWord(d.dir) + ')';
      default: return K.name + ' (slip)';
    }
  }
  function dirWord(d) {
    if (!d) return 'away';
    return d.x > 0 ? 'east' : d.x < 0 ? 'west' : d.y > 0 ? 'south' : 'north';
  }

  /**
   * Set a trap of `kind` for owner on (x, y) with its numbers in opts ({ snap } / { turns } / { boom } / { push, dir }).
   * Returns the object instance, or null when there is no room.
   */
  function setTrap(owner, x, y, kind, opts) {
    const s = S(), K = KINDS[kind];
    if (!s || !K || canTrapAt({ x: x, y: y }) !== true) return null;
    s.data = s.data || {};
    s.data.hjaTrapSeq = (s.data.hjaTrapSeq || 0) + 1;
    const data = Object.assign({}, opts || {}, { owner: owner ? owner.id : null, kind: kind, seq: s.data.hjaTrapSeq });
    if (data.dir) data.dir = { x: data.dir.x, y: data.dir.y };
    const o = A().placeObject(x, y, K.obj, { label: labelOf(kind, data), data: data });
    if (!o) return null;
    if (owner) dataOf(owner).hjaTrapTurn = s.turn;
    FX().tile(x, y, 'glow', { color: BANANA });
    FX().particles({ x: x, y: y }, { kind: 'dust', count: 6, parallel: true });
    A().log((owner ? owner.name : 'Someone') + ' sets a ' + K.name.toLowerCase() + '. Watch your step.', 'hero');
    return o;
  }

  /** Foes of the owner on and next to p (the firecracker's blast). */
  function blastFoes(owner, p) {
    const out = [];
    G().shape('circle', { x: p.x, y: p.y }, null, 1).forEach(function (q) {
      const u = G().unitAt(q.x, q.y);
      if (isFoe(owner, u) && out.indexOf(u) < 0) out.push(u);
    });
    return out;
  }

  /**
   * The trap on (x, y) springs on `foe`: it is used up, its one effect happens, and (Monkey Business) the party gains 5
   * Hype when it is Hjalmar's. Returns true if a trap sprang.
   */
  function spring(x, y, foe) {
    const t = G().tile(x, y);
    const o = t && isTrap(t.obj) ? t.obj : null;
    if (!o || !active(foe)) return false;
    A().removeObject(x, y);
    const d = o.data || {}, owner = ownerOf(o), K = KINDS[d.kind] || KINDS.peel;
    A().log(foe.name + ' springs ' + (owner ? owner.name + '\'s' : 'a') + ' ' + K.name.toLowerCase() + '!', 'status');
    switch (d.kind) {
      case 'bear':
        FX().text(foe, '🪤 SNAP!', { color: '#e8edf2', size: 17 });
        FX().sound('slash');
        A().damage(owner, foe, d.snap || 0, { tags: ['trap'], noHighGround: true });
        if (active(foe)) A().addStatus(foe, 'root', { turns: 1 }, owner);
        break;
      case 'cushion':
        FX().text(foe, '💨 PFFFFT!', { color: PINK, size: 18 });
        FX().particles(foe, { kind: 'smoke', color: '#e8f0c0', count: 10, parallel: true });
        A().addStatus(foe, 'taunt', { turns: d.turns || 1 }, owner);
        break;
      case 'paint':
        FX().text(foe, '🎨 SPLASH!', { color: '#7fd0ff', size: 17 });
        PAINTS.forEach(function (c, i) { FX().particles(foe, { kind: 'blood', color: c, count: 4, parallel: i > 0 }); });
        A().addStatus(foe, 'dazzled', { turns: d.turns || 1 }, owner);
        break;
      case 'boom': {
        FX().explosion({ x: x, y: y }, { radius: 1, color: '#ff8a2a', ms: 320 });
        FX().particles({ x: x, y: y }, { kind: 'sparks', color: BANANA, count: 18, parallel: true });
        FX().text({ x: x, y: y }, '🧨 BANG!', { color: '#ffb35a', size: 18, parallel: true });
        FX().sound('explosion');
        blastFoes(owner, { x: x, y: y }).forEach(function (f) {
          if (active(f)) A().damage(owner, f, d.boom || 0, { element: 'fire', tags: ['trap', 'fire', 'aoe'], noHighGround: true });
        });
        break;
      }
      case 'glove': {
        FX().text(foe, '🥊 BOING!', { color: '#ff9a7a', size: 18 });
        FX().sound('push');
        const r = d.dir ? A().push(owner, foe, d.dir, d.push || 0) : null;
        // a walk can't go on from somewhere else: the punch ends it there
        if (r && r.moved > 0 && active(foe)) A().stopMove(foe);
        break;
      }
      default:
        FX().text(foe, '🍌 WHOOPS!', { color: BANANA, size: 18 });
        FX().sound('bump');
        A().addStatus(foe, SLIPPED, { turns: 1 }, owner);
        break;
    }
    if (owner && owner.defId === HERO) {
      A().gainHype(TRAP_HYPE, 'Monkey Business');
      if (active(owner)) A().maybeBark(owner, 'trap', 0.35);
    }
    return true;
  }

  /**
   * A unit entered a trap tile: it springs if the unit is a foe of the trap's owner (the objects' onEnter). Traps are on
   * the floor: a flyer floats over (the engine skips ground objects' onEnter for flyers; checked here too).
   */
  function springOn(tile, unit) {
    if (!tile || !isTrap(tile.obj) || !active(unit) || !G().feelsFloor(unit)) return false;
    if (!isFoe(ownerOf(tile.obj), unit)) return false;
    return spring(tile.x, tile.y, unit);
  }

  // ---- trap painters (origin: tile top centre, +y down, world px at zoom 1) ---------------------------------
  function seqOf(o) { return o && o.data && typeof o.data.seq === 'number' ? o.data.seq : 0; }
  /** Hjalmar's mark under every trap: a dashed banana-yellow ring, pulsing, so traps read at a glance. */
  function trapRing(g, o, t) {
    const c = g.ctx, pulse = 0.5 + 0.5 * Math.sin((t || 0) * 3 + seqOf(o) * 1.3);
    g.ellipse(0, 0, 17, 8.5, 'rgba(40,24,6,0.28)', null);
    c.save();
    c.setLineDash([3.5, 2.5]);
    c.lineDashOffset = -(t || 0) * 6;
    g.lw = 1.4;
    g.ellipse(0, 0, 17, 8.5, null, U.rgba(BANANA, 0.55 + 0.35 * pulse));
    c.restore();
  }
  /** Fill (and outline) a path built by fn(ctx) with the iso painter's line width. */
  function fillPath(g, fn, fill, stroke) {
    const c = g.ctx;
    c.beginPath(); fn(c);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = g.lw; c.lineJoin = 'round'; c.stroke(); }
  }
  function drawPeel(g, o, t) {
    trapRing(g, o, t);
    const c = g.ctx, wob = Math.sin((t || 0) * 2 + seqOf(o)) * 0.06;
    g.lw = 1.1;
    // three long floppy flaps lying flat (y squashed) around the bottom of the banana, which still stands up a little
    [-0.55, 1.55, 3.55].forEach(function (a, i) {
      c.save();
      c.scale(1, 0.5);
      c.rotate(a + wob * (i - 1));
      fillPath(g, function (p) {
        p.moveTo(2.5, -4);
        p.quadraticCurveTo(11, -6.5, 17, -1.6);
        p.quadraticCurveTo(18.6, 0, 17, 1.4);
        p.quadraticCurveTo(11, 4.6, 2.5, 4);
        p.closePath();
      }, i === 1 ? '#ffe36e' : BANANA, '#3a2a08');
      g.line(5, -0.4, 15, 0, U.rgba(BANANA_DARK, 0.75), 1.1);
      g.ellipse(17, 0, 1.6, 1.3, '#4a3410', null);
      c.restore();
    });
    g.ellipse(0, -1.6, 5, 3.4, '#ffe36e', '#3a2a08');
    g.ellipse(0.3, -2.6, 3.4, 2.1, '#fff2b8', null);
    g.rect(-1.3, -9, 2.6, 7, '#7a5a1e', '#3a2a08', 0.9);
    g.rect(-1.3, -9, 2.6, 1.6, '#4a3410', null, 0.6);
    g.ellipse(-2.8, -2.9, 1.5, 0.8, 'rgba(255,255,255,0.75)', null);
  }
  function drawBearTrap(g, o, t) {
    trapRing(g, o, t);
    const c = g.ctx;
    g.lw = 1.1;
    // the chain to its stake
    for (let i = 0; i < 4; i++) g.ellipse(10 + i * 2.6, 3.2 + i * 1.1, 1.6, 1, null, '#6b737c');
    g.rect(19.5, 4.2, 2, 4, '#5b4632', '#1a1014', 0.5);
    // two steel jaws lying open, teeth up
    g.ellipse(0, 0, 12, 6, '#5e666f', '#1a1014');
    g.ellipse(0, 0, 8.2, 4.1, '#3a3f45', '#1a1014');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = Math.cos(a) * 10, y = Math.sin(a) * 5;
      g.poly([[x - 1.4, y], [x + Math.cos(a) * -1.2, y - 3.4], [x + 1.4, y]], '#dfe5ea', '#1a1014');
    }
    // the pressure plate in the middle
    g.ellipse(0, -0.5, 4.2, 2.1, '#a8b0b8', '#1a1014');
    const gl = 0.4 + 0.3 * Math.sin((t || 0) * 4 + seqOf(o));
    g.ellipse(-1.2, -1.1, 1.6, 0.7, U.rgba('#ffffff', gl), null);
    c.lineCap = 'butt';
  }
  function drawCushion(g, o, t) {
    trapRing(g, o, t);
    const puff = 1 + 0.03 * Math.sin((t || 0) * 2.4 + seqOf(o));
    g.lw = 1.2;
    g.ellipse(0, -2.2, 11 * puff, 6.2 * puff, '#d9487a', '#1a1014');
    g.ellipse(-0.6, -3.4, 9 * puff, 4.6 * puff, PINK, null);
    g.ellipse(-3.5, -4.8, 3.6, 1.6, 'rgba(255,255,255,0.55)', null);
    g.ellipse(0, -2.2, 11 * puff, 6.2 * puff, null, '#1a1014');
    // the nozzle, pointing at whoever sits down
    g.poly([[9, -3.2], [14.5, -5.6], [15.4, -3.6], [10, -1.2]], '#c23b6c', '#1a1014');
    g.ellipse(15, -4.6, 1.4, 1.2, '#7a1c40', '#1a1014');
  }
  function drawPaint(g, o, t) {
    trapRing(g, o, t);
    const c = g.ctx;
    g.lw = 1.1;
    // splats of every colour (it has been tested on Marwyn), a tripwire across the tile
    [[-9, 2.5, 4.2, PAINTS[0]], [8, 3.5, 3.6, PAINTS[1]], [-2, 5.5, 3, PAINTS[2]], [10, -2, 2.4, PAINTS[3]]].forEach(function (s) {
      c.save(); c.translate(s[0], s[1]); c.scale(1, 0.5);
      g.circle(0, 0, s[2], s[3], null);
      g.circle(s[2] * 0.9, s[2] * 0.4, s[2] * 0.35, s[3], null);
      c.restore();
    });
    g.line(-15, -1, 15, 1.5, '#f4f0e6', 0.9);
    // the bucket, propped on a stick, paint about to go everywhere
    g.line(-2.5, -4, 1.2, -13, '#7a5a3a', 1.6);
    c.save();
    c.translate(2.5, -15);
    c.rotate(-0.42);
    g.cylinder(0, 0, 5, 2.2, 7, '#b8c0c8', null, '#1a1014');
    g.ellipse(0, -7, 4.3, 1.8, PAINTS[1], null);
    const drip = (((t || 0) * 0.8 + seqOf(o) * 0.37) % 1);
    g.circle(4.5, -6 + drip * 7, 1.1, PAINTS[0], null);
    c.restore();
  }
  function drawFirecracker(g, o, t) {
    trapRing(g, o, t);
    g.lw = 1.1;
    const sticks = [[-4.5, 0.5], [0, -0.5], [4.5, 0.5], [-2.2, 2.4], [2.4, 2.4]];
    sticks.forEach(function (p, i) { g.cylinder(p[0], p[1], 2.4, 1.1, 11 + (i % 2), i % 2 ? '#d93a2a' : '#c32a1e', '#f3d27a', '#1a1014'); });
    g.rect(-6.8, -6.5, 13.6, 2.2, '#f2c14e', '#1a1014', 0.6);
    // a fuse, fizzing
    const fx = 1.2, fy = -12.5;
    g.line(0, -11.6, fx, fy - 3, '#4a3a2a', 1);
    const k = (t || 0) * 9 + seqOf(o);
    g.glow(fx, fy - 3.4, 5, '#ffcf5a', 0.6 + 0.3 * Math.sin(k));
    for (let i = 0; i < 4; i++) {
      const a = k * 0.7 + i * 1.6;
      g.line(fx, fy - 3.4, fx + Math.cos(a) * 3.2, fy - 3.4 + Math.sin(a) * 2.2, '#fff3a0', 0.8);
    }
  }
  /**
   * Screen offset of k grid steps in direction d at the current view (DD.Iso.local: at the default view east is
   * down-right and south down-left; a turned map turns the glove's floor arrow with it).
   */
  function isoStep(d, k) {
    if (DD.Iso && DD.Iso.local) { const L = DD.Iso.local(d.x * k, d.y * k); return { x: L.x, y: L.y }; }
    return { x: (d.x - d.y) * 32 * k, y: (d.x + d.y) * 16 * k };
  }
  function drawGlove(g, o, t) {
    trapRing(g, o, t);
    const c = g.ctx, d = (o && o.data && o.data.dir) || { x: 1, y: 0 };
    const tip = isoStep(d, 0.5), coil = 0.5 + 0.5 * Math.sin((t || 0) * 5 + seqOf(o));
    g.lw = 1.1;
    // an arrow on the floor: this way, please
    c.save();
    c.globalAlpha = 0.55 + 0.25 * coil;
    const a1 = isoStep(d, 0.3), a2 = isoStep(d, 0.48), side = isoStep({ x: -d.y, y: d.x }, 0.1);
    g.line(a1.x * 0.4, a1.y * 0.4, a2.x, a2.y, '#ff9a7a', 2.2);
    g.poly([[a2.x + tip.x * 0.12, a2.y + tip.y * 0.12], [a2.x - tip.x * 0.12 + side.x, a2.y - tip.y * 0.12 + side.y],
      [a2.x - tip.x * 0.12 - side.x, a2.y - tip.y * 0.12 - side.y]], '#ff9a7a', null);
    c.restore();
    // the box, its spring and the glove poking out toward the aim
    g.box(0, 0, 7.5, 3.75, 6.5, { top: '#c8935a', left: '#a5703e', right: '#8a5a30' }, '#1a1014');
    const gx = tip.x * (0.22 + 0.05 * coil), gy = tip.y * (0.22 + 0.05 * coil) - 9.5;
    for (let i = 0; i < 4; i++) {
      const k = (i + 0.5) / 4;
      g.ellipse(gx * k, -7.5 + (gy + 7.5) * k, 2.2, 1.1, null, '#d8dde2');
    }
    g.circle(gx, gy, 4.6, '#d62828', '#1a1014');
    g.circle(gx - 1.5, gy - 1.4, 1.4, 'rgba(255,255,255,0.6)', null);
    g.ellipse(gx + (tip.x < 0 ? 3.3 : -3.3), gy + 1.2, 2, 2.6, '#b81f1f', '#1a1014');
  }

  const TRAP_DESC = {
    peel: 'Hjalmar\'s banana peel. The first foe to step on it slips: it can\'t act until the end of its turn.',
    bear: 'Hjalmar\'s bear trap. The first foe to step on it takes its damage and is Rooted through its next turn.',
    cushion: 'Hjalmar\'s whoopee cushion. The first foe to step on it is Taunted by Hjalmar: it can only attack him.',
    paint: 'Hjalmar\'s paint bucket on a tripwire. The first foe to step on it is Dazzled: its attacks land a tile off.',
    boom: 'Hjalmar\'s firecracker bundle. When a foe steps on it, it explodes: fire damage to every foe within 1.',
    glove: 'Hjalmar\'s spring glove. The first foe to step on it is knocked the way the glove points.',
  };
  const PAINTER = { peel: drawPeel, bear: drawBearTrap, cushion: drawCushion, paint: drawPaint, boom: drawFirecracker, glove: drawGlove };
  Object.keys(KINDS).forEach(function (kind) {
    const def = {
      id: KINDS[kind].obj, name: KINDS[kind].name, blocksMove: false, blocksLos: false, hp: 0, height: kind === 'paint' || kind === 'boom' ? 0.5 : 0.15,
      color: BANANA,
      desc: TRAP_DESC[kind] + ' Foes never see it coming; flyers float over.',
      onEnter: function (unit, o, tile) { springOn(tile, unit); },
      draw: PAINTER[kind],
    };
    // map rotation: the glove's box turns with the board (g.box on the view's ground quad; the same pixels at yaw 0)
    if (kind === 'glove') def.yawAware = true;
    DD.registerObject(def);
  });

  // ---- status ----------------------------------------------------------------------------------------
  // "can't act" holds even when it slips in the middle of its own turn: stun-like (no strike lands, its next turn is lost
  // when it slipped on someone else's), noMove (a planner that walks again is refused), and a wind-up queued after the
  // slip is called off at that turn's end (one queued before it was already interrupted by the stun-like)
  DD.registerStatus({
    id: SLIPPED, name: 'Slipped', icon: '🍌', color: BANANA, type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1, skipFresh: false, stunLike: true, noMove: true,
    desc: function () { return 'Flat on its back after a banana peel: it can\'t act until the end of its turn.'; },
    hooks: {
      onTurnEnd: function (unit) {
        if (unit && unit.intents && unit.intents.length && DD.AI && DD.AI.cancelIntents) DD.AI.cancelIntents(unit, '🍌 Slipped!', { keepUnstoppable: true });
      },
    },
  });

  // ---- AutoPlay hints (never shown to players) --------------------------------------------------------------
  /** A foe's biggest damage number (its own skills' L.dmg). */
  function hitOf(f) {
    let best = 0;
    DD.Combat.slotsOf(f).forEach(function (sl) {
      const d = DD.getSkill(sl.id), L = d ? DD.skillLevel(d, sl.level || 1) : null;
      if (L && L.dmg > best) best = L.dmg;
    });
    return best || 4;
  }
  function rangedFoe(f) {
    const st = DD.AI && DD.AI.styleOf ? DD.AI.styleOf(f) : null;
    return !!st && st.style === 'ranged';
  }
  /**
   * How likely foe f is to walk over p on its next turn: p within its move, on a shortest way to the hero-side unit
   * nearest it (a tile next to that unit is where it stops to strike). Engaged / pinned foes stay put.
   */
  function crossChance(f, p, party) {
    if (DD.Act.cantMove(f) || DD.Act.isStunned(f) || G().isFlying(f)) return 0;
    const d = dist(f, p);
    const mov = (DD.Combat.effectiveMov ? DD.Combat.effectiveMov(f) : f.mov) || 0;
    if (d > mov) return 0;
    let near = null, nd = 99;
    party.forEach(function (h) { const k = dist(f, h); if (k < nd) { nd = k; near = h; } });
    if (!near || nd <= 1) return 0;
    const via = d + dist(p, near);
    let c = via === nd ? 0.5 : via === nd + 2 ? 0.15 : 0;
    if (c && dist(p, near) === 1) c += 0.15;
    if (rangedFoe(f)) c *= 0.4;
    return c;
  }
  /** Where a foe on p would be knocked (glove): 15 into a pit, 6 into a hazard, 3 for a bump, else 2. */
  function knockValue(f, p, dir, n, me) {
    let x = p.x, y = p.y;
    for (let k = 0; k < n; k++) {
      const nx = x + dir.x, ny = y + dir.y;
      if (!G().inBounds(nx, ny)) return 3;
      if (G().isDrop(nx, ny) && !G().isFlying(f)) return DD.Act.isBoss(f) ? 4 : 15;
      const o = G().unitAt(nx, ny), tl = G().tile(nx, ny);
      if (o) return G().hostile(me, o) ? 4 : 0;
      if (!G().isWalkable(nx, ny, f) || (tl.obj && G().objBlocksMove(tl.obj))) return 3;
      if (G().hazardAt(nx, ny, f)) return 6;
      x = nx; y = ny;
    }
    return 2;
  }
  /** The unit on the monkey's side nearest to foe f (the one it is walking toward). */
  function nearestFriend(me, f) {
    let near = null, nd = 99;
    S().units.forEach(function (u) { if (active(u) && !G().hostile(me, u)) { const k = dist(f, u); if (k < nd) { nd = k; near = u; } } });
    return near;
  }
  /** Damage-equivalent worth of foe f springing a trap of `kind` set on p by me. */
  function effectValue(kind, me, f, p, L, dir) {
    switch (kind) {
      case 'peel': return f.flags && f.flags.stunImmune ? 0.5 : hitOf(f) + 3;
      case 'bear': return DD.AI.estimate(me, f, L.snap || 0, null) + (rangedFoe(f) ? 1 : 3);
      case 'cushion': {
        // its strike this turn fizzles unless the monkey is in reach of where it stops (next to the hero it is after);
        // coming for him anyway, the cushion changes little
        const near = nearestFriend(me, f);
        if (!near || near === me) return hitOf(f) * 0.1;
        return hitOf(f) * (dist(me, near) > 2 ? 0.8 : 0.2);
      }
      case 'paint': return hitOf(f) * 0.5 + 1;
      case 'boom': {
        let n = 1;
        DD.Combat.state.units.forEach(function (o) { if (o !== f && isFoe(me, o) && dist(o, p) <= 2) n += 0.7; });
        return (L.boom || 0) * Math.min(n, 3);
      }
      case 'glove': return dir ? knockValue(f, p, dir, L.push || 0, me) : 0;
      default: return 0;
    }
  }
  /**
   * AutoPlay's worth of setting a trap on ctx.target now: the best foe likely to walk into it (+ a little for the next
   * best), less when another trap of his is already right there. 0 when no foe is coming its way.
   */
  function trapValue(ctx, kind) {
    const me = ctx && ctx.user, p = ctx && ctx.target, s = S();
    if (!me || !p || !s || canTrapAt(p) !== true) return 0;
    const L = ctx.L || {};
    const party = s.units.filter(function (u) { return active(u) && !G().hostile(me, u); });
    const dir = kind === 'glove' ? gloveDir(ctx) : null;
    const vals = [];
    let miss = 1;
    s.units.forEach(function (f) {
      if (!isFoe(me, f)) return;
      const c = crossChance(f, p, party);
      if (c <= 0) return;
      miss *= 1 - c;
      vals.push(c * effectValue(kind, me, f, p, L, dir));
    });
    if (!vals.length) return 0;
    vals.sort(function (a, b) { return b - a; });
    // the firecracker hurts whoever is around when anybody sets it off: worth the chance that someone does
    let v = kind === 'boom' ? (1 - miss) * effectValue(kind, me, null, p, L, dir) : vals[0] + 0.3 * (vals[1] || 0);
    traps(me).forEach(function (t) { if (dist(t, p) <= 1) v *= 0.6; });
    return Math.min(v, 14);
  }

  // ---- sprite --------------------------------------------------------------------------------------------
  // small brown monkey: pale face and belly, big ears, a red organ-grinder vest and a tiny fez, a sack of props,
  // a long tail curling up behind him and a grin that means he has already done something
  const HJA_PAL = {
    skin: FUR, cloth: '#c0392b', cloth2: '#f2c14e', hair: FUR_DARK, metal: '#e3b341', eye: '#2a1a10',
    accent: BANANA, outline: '#1c120b', ear: FUR, inner: FACE, tail: FUR, pants: FUR, boots: FUR_DARK,
    belt: '#7a4a24', wood: '#8a5a32',
  };
  /** The tail's tip as sprites.js draws a 'cat' tail for this build (tiny: w 10, legs 4), plus its sway. */
  function tailTip(t) {
    const sz = 0.75, ax = -10 * 0.47, ay = -4 - 1.2, sway = Math.sin(t * 2.2) * 2 * sz;
    return { x: ax - 7 * sz + sway, y: ay - 11 * sz };
  }
  /** Face: a pale peanut mask (two eye patches over a wide muzzle), big shiny eyes, nostrils and a wicked grin. */
  function hjaFace(g, H, t) {
    const r = H.r, fx = H.x + r * 0.18;
    g.path(function (p) {
      p.ellipse(fx - r * 0.3, H.y - r * 0.06, r * 0.36, r * 0.4, 0, 0, Math.PI * 2);
      p.moveTo(fx + r * 0.66, H.y - r * 0.06);
      p.ellipse(fx + r * 0.3, H.y - r * 0.06, r * 0.36, r * 0.4, 0, 0, Math.PI * 2);
      p.moveTo(fx + r * 0.62, H.y + r * 0.4);
      p.ellipse(fx, H.y + r * 0.4, r * 0.62, r * 0.42, 0, 0, Math.PI * 2);
    }, FACE, null);
    g.path(function (p) { p.ellipse(fx, H.y + r * 0.4, r * 0.62, r * 0.42, 0, 0.1, Math.PI - 0.1); }, null, U.rgba('#1c120b', 0.55), Math.max(0.6, r * 0.06));
    // eyes (they blink like everyone else's)
    const ey = H.y - r * 0.06, ex = r * 0.29, er = r * 0.17;
    if (g.blink) {
      [-1, 1].forEach(function (s) { g.line(fx + s * ex - er, ey, fx + s * ex + er, ey, g.outline, Math.max(0.8, r * 0.08)); });
    } else {
      const look = Math.sin(t * 0.7) * r * 0.03;
      [-1, 1].forEach(function (s) {
        g.circle(fx + s * ex + look, ey, er, '#24160c', null);
        g.circle(fx + s * ex + look + er * 0.35, ey - er * 0.4, er * 0.38, '#ffffff', null);
      });
      // scheming eyebrows: one slanted down to the nose, one raised high
      const bw = Math.max(0.8, r * 0.09);
      g.line(fx - ex - er * 1.1, ey - er * 2.0, fx - ex + er * 1.1, ey - er * 1.45, FUR_DARK, bw);
      g.arc(fx + ex, ey - er * 1.25, er * 1.15, Math.PI * 1.15, Math.PI * 1.85, FUR_DARK, bw);
    }
    // nostrils + the grin (white teeth, he is already laughing)
    g.circle(fx - r * 0.08, H.y + r * 0.22, r * 0.045, '#3a2414', null);
    g.circle(fx + r * 0.08, H.y + r * 0.22, r * 0.045, '#3a2414', null);
    const my = H.y + r * 0.42;
    g.path(function (p) {
      p.moveTo(fx - r * 0.42, my - r * 0.04);
      p.quadraticCurveTo(fx, my + r * 0.12, fx + r * 0.44, my - r * 0.06);
      p.quadraticCurveTo(fx + r * 0.05, my + r * 0.52, fx - r * 0.42, my - r * 0.04);
      p.closePath();
    }, '#5a1e1e', g.outline, Math.max(0.7, r * 0.07));
    g.path(function (p) {
      p.moveTo(fx - r * 0.36, my - r * 0.01);
      p.quadraticCurveTo(fx, my + r * 0.13, fx + r * 0.38, my - r * 0.03);
      p.lineTo(fx + r * 0.3, my + r * 0.1);
      p.quadraticCurveTo(fx, my + r * 0.22, fx - r * 0.3, my + r * 0.1);
      p.closePath();
    }, '#fffbea', null);
  }
  /** The tiny fez (tilted, of course) with a tassel that swings when he moves. */
  function hjaFez(g, H, t) {
    const r = H.r, c = g.ctx;
    c.save();
    c.translate(H.x + r * 0.12, H.y - r * 0.82);
    c.rotate(0.22);
    const bw = r * 0.46, tw = r * 0.36, h = r * 0.62;
    g.path(function (p) {
      p.moveTo(-bw, 0); p.lineTo(-tw, -h); p.lineTo(tw, -h); p.lineTo(bw, 0);
      p.quadraticCurveTo(0, r * 0.12, -bw, 0); p.closePath();
    }, FEZ, g.outline, Math.max(0.8, r * 0.08));
    g.ellipse(0, -h, tw, r * 0.1, '#a82424', g.outline, 0);
    g.line(-bw * 0.95, -r * 0.08, bw * 0.95, -r * 0.08, '#f2c14e', Math.max(0.8, r * 0.09));
    const sw = Math.sin(t * 2.8) * 0.35;
    const kx = Math.sin(0.9 + sw) * r * 0.55, ky = -h + Math.cos(0.9 + sw) * r * 0.55;
    g.line(0, -h, kx, ky, '#1c120b', Math.max(0.7, r * 0.06));
    g.circle(kx, ky, r * 0.1, '#f2c14e', g.outline);
    c.restore();
  }
  /** His sack of props hanging at his back hip (in front of the tail's root), a banana poking out of it. */
  function hjaSack(g, shY, t) {
    const x = -6.6, y = shY + 9.6, bob = Math.sin(t * 2.2) * 0.2;
    g.line(3.2, shY + 1.4, x + 1.2, y - 2.6, '#6b4a2a', 1.1);
    g.ellipse(x + 1.3, y - 3.2 + bob, 1.1, 2.1, BANANA, g.outline, 0.45);
    g.shaded(function (p) { p.ellipse(x, y, 2.9, 3.1, 0, 0, Math.PI * 2); }, '#b08850', { dx: 0.6, dy: -0.7 });
    g.line(x - 1.9, y - 2.1, x + 2, y - 1.9, '#6b4a2a', 0.9);
  }
  /** In front: the face over the plain head, the fez, a pale belly patch on the vest, his sack and his tail's curl. */
  function hjaOverlay(g, t) {
    if (!g || !g.head) return;
    const H = g.head;
    // belly (tiny build: shoulders 0.8 r below the head centre, torso 8.5 tall)
    const shY = H.y + H.r * 0.8;
    g.ellipse(0.8, shY + 5.2, 2.6, 3.1, FACE, null);
    hjaSack(g, shY, t);
    // the tail's curl, out behind him (beyond the body's edge, so drawing it on top is safe)
    const tp = tailTip(t);
    g.arc(tp.x + 1.6, tp.y, 1.9, Math.PI * 0.95, Math.PI * 2.6, g.outline, 2.9);
    g.arc(tp.x + 1.6, tp.y, 1.9, Math.PI * 0.95, Math.PI * 2.6, FUR, 1.5);
    hjaFace(g, H, t);
    hjaFez(g, H, t);
  }
  const HJA_SPRITE = {
    base: 'humanoid', scale: 0.92, palette: HJA_PAL, build: 'tiny', outfit: 'tunic',
    head: { size: 1.1, ears: 'rat', horns: 'none', hair: 'none', beard: 'none', hat: 'none', face: 'none', eyes: 'none', mouth: 'none', blush: false },
    wings: 'none', tail: 'cat', mainhand: 'none', offhand: 'none',
    bling: [], extras: [],
    aura: null,
    overlay: hjaOverlay,
  };

  // ---- FX helpers ------------------------------------------------------------------------------------------
  function drawCoconut(c, x, y, p, view) {
    const z = (view && view.zoom) || 1;
    c.save();
    c.translate(x, y);
    c.rotate(p * 12);
    c.fillStyle = '#6b4220'; c.strokeStyle = '#1c120b'; c.lineWidth = 1.1 * z;
    c.beginPath(); c.arc(0, 0, 4.6 * z, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#2a1a0c';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(Math.cos(i * 2.1) * 1.6 * z, Math.sin(i * 2.1) * 1.6 * z, 0.8 * z, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  function drawTossed(c, x, y, p, view) {
    const z = (view && view.zoom) || 1;
    c.save();
    c.translate(x, y);
    c.rotate(p * 9);
    c.fillStyle = BANANA; c.strokeStyle = '#3a2a08'; c.lineWidth = 1 * z;
    c.beginPath(); c.ellipse(0, 0, 5 * z, 2.4 * z, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#7a5a1e';
    c.fillRect(4 * z, -0.8 * z, 2 * z, 1.6 * z);
    c.restore();
  }
  function toss(from, to, opts) {
    FX().projectile(from, to, Object.assign({ kind: 'custom', draw: drawTossed, color: BANANA, arc: 0.7, ms: 260 }, opts || {}));
  }

  // ---- skills ----------------------------------------------------------------------------------------------
  function skill(def) { def.owner = HERO; return DD.registerSkill(def); }
  function gloveDir(ctx) {
    const u = ctx && ctx.user, p = ctx && ctx.target;
    if (!u || !p || (u.x === p.x && u.y === p.y)) return null;
    return U.dirTo(u, p);
  }
  /** The spring glove's tile and the tiles it would knock a foe along (the HUD area shows the aim). */
  function gloveTiles(ctx) {
    const p = ctx && ctx.target, d = gloveDir(ctx);
    if (!p) return [];
    const out = [{ x: p.x, y: p.y }];
    const n = Math.max(0, Math.round(+(ctx.L && ctx.L.push) || 0));
    for (let k = 1; d && k <= n; k++) {
      const x = p.x + d.x * k, y = p.y + d.y * k;
      if (!G().inBounds(x, y)) break;
      out.push({ x: x, y: y });
    }
    return out;
  }

  /** A trap-setting skill: a tile within L.range (or def.range), empty, any line of sight (he scampers over). */
  function trapSkill(def) {
    const kind = def.kind;
    skill({
      id: KINDS[kind].skill, name: KINDS[kind].name, icon: KINDS[kind].icon, kind: 'utility', tags: ['trap'].concat(def.tags || []),
      ap: def.ap || 1, cooldown: def.cooldown,
      levels: def.levels,
      target: { type: 'tile', range: def.range || [1, 3], los: false, filter: 'empty', canTarget: function (ctx) { return canTrapAt(ctx.target); } },
      area: def.area || { shape: 'single' },
      desc: def.desc, flavor: def.flavor,
      autoplayValue: function (ctx) { return trapValue(ctx, kind); },
      execute: function (ctx) {
        const p = ctx.target;
        if (!p) return;
        toss(ctx.user, p);
        if (!setTrap(ctx.user, p.x, p.y, kind, def.data(ctx))) FX().text(p, 'No room for a trap', { color: '#e8d9b0', size: 13 });
        else A().maybeBark(ctx.user, 'move', 0.2);
      },
    });
  }

  // Basic: Coconut Toss
  skill({
    id: 'hja_basic', name: 'Coconut Toss', icon: '🥥', kind: 'attack', tags: ['ranged'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 4 }],
    target: { type: 'unit', range: [1, 4], los: true, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe within 4.'; },
    flavor: 'Thrown with love. Mostly with spin.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      FX().projectile(u, t, { kind: 'custom', draw: drawCoconut, color: '#6b4220', arc: 0.45, ms: 280 });
      FX().text(t, 'BONK!', { color: '#e0b080', size: 14, parallel: true });
      A().damage(u, t, ctx.L.dmg, { tags: ['ranged', 'coconut'] });
      if (active(t) && hasItem(u, COCONUT)) A().knockback(u, t, 1);
    },
  });

  // Starter: Banana Peel — the first foe to step on it slips and loses its turn
  trapSkill({
    kind: 'peel', tags: ['stun', 'slip'],
    cooldown: function (L) { return L.cd; },
    levels: [{ range: 3, cd: 3 }, { range: 4, cd: 3 }, { range: 4, cd: 2 }],
    range: function (L) { return [1, L.range]; },
    desc: function (L) { return 'Set a banana peel within ' + L.range + ': the first foe to step on it slips and can\'t act until the end of its turn.'; },
    flavor: 'The oldest trick in the book. The book is also a banana peel.',
    data: function () { return {}; },
  });

  // Starter: Bear Trap — damage + Root
  trapSkill({
    kind: 'bear', tags: ['root', 'damage'],
    cooldown: 1,
    levels: [{ snap: 5 }, { snap: 7 }, { snap: 9 }],
    desc: function (L) { return 'Set a bear trap within 3: the first foe to step on it takes ' + L.snap + ' damage and is Rooted through its next turn.'; },
    flavor: 'Technically a monkey trap. He has never caught a bear. He has never caught a monkey either.',
    data: function (ctx) { return { snap: ctx.L.snap }; },
  });

  // Whoopee Cushion — Taunted by Hjalmar
  trapSkill({
    kind: 'cushion', tags: ['taunt'],
    cooldown: function (L) { return L.cd; },
    levels: [{ turns: 1, cd: 2 }, { turns: 1, cd: 1 }, { turns: 2, cd: 1 }],
    desc: function (L) { return 'Set a whoopee cushion within 3: the first foe to step on it is Taunted by Hjalmar ' + nextTurns(L.turns) + '.'; },
    flavor: 'Everyone heard it. Everyone looked. And there is the monkey, pointing and crying with laughter.',
    data: function (ctx) { return { turns: ctx.L.turns }; },
  });

  // Paint Bucket — Dazzled
  trapSkill({
    kind: 'paint', tags: ['dazzle'],
    cooldown: function (L) { return L.cd; },
    levels: [{ turns: 1, cd: 2 }, { turns: 2, cd: 2 }, { turns: 2, cd: 1 }],
    desc: function (L) { return 'Set a paint bucket within 3: the first foe to step on it is Dazzled ' + nextTurns(L.turns) + '.'; },
    flavor: 'All four colours at once. It is called art. It is called "my eyes!"',
    data: function (ctx) { return { turns: ctx.L.turns }; },
  });

  // Firecracker Bundle — fire damage to every foe within 1 when sprung
  trapSkill({
    kind: 'boom', tags: ['fire', 'aoe', 'damage'],
    ap: 2, cooldown: 2,
    levels: [{ boom: 6 }, { boom: 7 }, { boom: 9 }],
    area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Set a firecracker bundle within 3: when a foe steps on it, every foe within 1 takes ' + L.boom + ' fire damage.'; },
    flavor: 'Bought from a man behind the tavern. The man had no eyebrows. That was the guarantee.',
    data: function (ctx) { return { boom: ctx.L.boom }; },
  });

  // Spring Glove — knocked away along the aim
  trapSkill({
    kind: 'glove', tags: ['push'],
    cooldown: function (L) { return L.cd; },
    levels: [{ push: 2, cd: 2 }, { push: 3, cd: 2 }, { push: 3, cd: 1 }],
    area: { shape: 'custom', fn: gloveTiles },
    desc: function (L) { return 'Set a spring glove within 3, aimed away from Hjalmar: the first foe to step on it is knocked ' + L.push + ' tiles that way.'; },
    flavor: 'Boxing glove, spring, box, tripwire. Patent pending. Patent office pending.',
    data: function (ctx) { return { push: ctx.L.push, dir: gloveDir(ctx) || { x: 1, y: 0 } }; },
  });

  // Pickpocket — steal gold, the mark is Weak
  skill({
    id: 'hja_pickpocket', name: 'Pickpocket', icon: '🤏', kind: 'utility', tags: ['melee', 'gold', 'weak'],
    ap: 1, cooldown: 2,
    levels: [{ gold: 3, turns: 1 }, { gold: 4, turns: 1 }, { gold: 5, turns: 2 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Steal ' + L.gold + ' gold from an adjacent foe; it is Weak ' + nextTurns(L.turns) + '.'; },
    flavor: 'He took its lunch money, its keys and its sense of security. He will return none of them.',
    // the gold is run value the dry run can't see (like Buga's fines: one point per gold)
    autoplayValue: function (ctx) { return ctx && ctx.L ? ctx.L.gold : 0; },
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      FX().lunge(u, t, { ms: 110 });
      FX().particles(t, { kind: 'coins', count: 6 });
      FX().text(t, '🤏 Yoink! +' + ctx.L.gold + ' gold', { color: '#ffe066', size: 14 });
      A().gainGold(ctx.L.gold);
      A().log(u.name + ' pickpockets ' + t.name + ' for ' + ctx.L.gold + ' gold.', 'hero');
      A().addStatus(t, 'weak', { turns: ctx.L.turns }, u);
    },
  });

  // Swing Away — a leap that never provokes
  skill({
    id: 'hja_swing', name: 'Swing Away', icon: '🐒', kind: 'move', tags: ['move', 'jump'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ range: 3, cd: 2 }, { range: 4, cd: 1 }, { range: 5, cd: 1 }],
    target: { type: 'tile', range: function (L) { return [1, L.range]; }, los: true, filter: 'empty' },
    desc: function (L) { return 'Leap to an empty tile within ' + L.range + ' that Hjalmar can see.'; },
    flavor: 'There is always a chandelier. If there is no chandelier, there is someone\'s head.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!active(u) || !p) return;
      const from = { x: u.x, y: u.y };
      if (A().teleport(u, p.x, p.y, { fx: false })) {
        FX().jump(u, from, p, { ms: 380 });
        FX().particles(from, { kind: 'leaves', count: 5, parallel: true });
        A().maybeBark(u, 'move', 0.3);
      }
    },
  });

  // Bait and Switch — swap places with a foe (stand on your own trap first)
  function switchHint(ctx) {
    const me = ctx && ctx.user, f = ctx && ctx.targetUnit;
    if (!me || !f || ctx.autoplay || !G().feelsFloor(f)) return 0;   // a flyer floats over his trap
    const t = G().tile(me.x, me.y);
    if (!t || !isTrap(t.obj) || ownerOf(t.obj) !== me) return 0;
    const d = t.obj.data || {};
    return effectValue(d.kind, me, f, t, { snap: d.snap, boom: d.boom, push: d.push }, d.dir) + TRAP_HYPE * 0.4;
  }
  skill({
    id: 'hja_switch', name: 'Bait and Switch', icon: '🔀', kind: 'move', tags: ['swap', 'teleport'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ range: 2, cd: 3 }, { range: 3, cd: 3 }, { range: 4, cd: 2 }],
    target: {
      type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy',
      canTarget: function (ctx) {
        const f = ctx.targetUnit;
        if (f && DD.Act.isImmovable(f)) return 'Too heavy to swap.';
        if (f && G().isDrop(f.x, f.y)) return 'Not over that.';
        return true;
      },
    },
    desc: function (L) { return 'Swap places with a foe within ' + L.range + '.'; },
    flavor: 'Now you see him. Now he is you. Now you are standing on a banana peel.',
    autoplayValue: switchHint,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(u) || !active(f)) return;
      FX().text(u, '🔀 Ta-da!', { color: BANANA, size: 15 });
      if (!A().swap(u, f, { src: u })) FX().text(f, 'Won\'t budge', { color: '#dddddd', size: 13 });
    },
  });

  // Signature: Prank War — banana peels rain on an area
  skill({
    id: 'hja_signature', name: 'Prank War', icon: '🙈', kind: 'attack', tags: ['aoe', 'stun', 'slip'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 8 }],
    target: { type: 'tile', range: [0, 5], los: false, filter: 'any' },
    area: { shape: 'circle', size: 2 },
    desc: function (L) { return 'Every foe within 2 of a tile within 5 takes ' + L.dmg + ' damage and slips: it can\'t act until the end of its turn.'; },
    flavor: 'He has been planning this since the tavern. Possibly since birth.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!p) return;
      FX().banner('PRANK WAR!', { sub: 'Banana peels. Everywhere. Forever.', color: BANANA, ms: 900 });
      FX().flash('#fff3b0', 220);
      FX().shake(8, 420);
      ctx.tiles.forEach(function (q, i) {
        toss({ x: q.x - 1, y: q.y - 1, h: 8 }, q, { arc: 0, ms: 300, parallel: i > 0 });
      });
      FX().particles(p, { kind: 'glitter', color: BANANA, count: 24, parallel: true });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(u, f, ctx.L.dmg, { tags: ['aoe', 'slip'] });
        if (active(f)) A().addStatus(f, SLIPPED, { turns: 1 }, u);
      });
    },
  });

  // ---- items ----------------------------------------------------------------------------------------------
  DD.registerItem({
    id: COCONUT, name: 'Coconut of Unusual Size', slot: 'weapon', rarity: 'rare', icon: '🥥', hero: HERO,
    stats: { dmg: 0.1 },
    desc: '+10% damage. Coconut Toss knocks its target 1 tile away from Hjalmar.',
    flavor: 'He found it on a beach. There is no beach. Nobody asks.',
    hooks: {},
  });
  DD.registerItem({
    id: POMADE, name: 'Greased Fur Pomade', slot: 'trinket', rarity: 'rare', icon: '🧴', hero: HERO,
    stats: { mov: 1 },
    desc: '+1 move. Hjalmar can\'t be opportunity-attacked.',
    flavor: 'Banana-scented. Makes him impossible to grab and very easy to find.',
    hooks: {
      modifyOpportunity: function (o) { if (o && o.mover && hasItem(o.mover, POMADE)) o.cancel = true; },
    },
  });
  DD.registerItem({
    id: SACK, name: 'Bottomless Sack of Props', slot: 'armor', rarity: 'legendary', icon: '🎒', hero: HERO,
    stats: { hp: 6 },
    desc: '+6 max HP. The first trap Hjalmar sets each turn costs 0 AP.',
    flavor: 'Peels, pies, a rubber chicken, another, smaller sack. It goes all the way down.',
    hooks: {
      modifyCost: function (c) {
        const s = S();
        if (!c || !c.unit || !c.skill || !TRAP_SKILL[c.skill.id] || !hasItem(c.unit, SACK) || !s) return;
        if (dataOf(c.unit).hjaTrapTurn !== s.turn) c.ap = 0;
      },
    },
  });

  // ---- the hero -----------------------------------------------------------------------------------------
  DD.registerHero({
    id: HERO, name: 'Hjalmar', epithet: 'the Menace', race: 'Monkey', cls: 'Trickster',
    role: 'Trapper & trickster', complexity: 2,
    blurb: 'A small, gleeful menace of a monkey who rigs every floor with banana peels, bear traps and whoopee cushions, ' +
      'then laughs until he falls over. He steals hats, gold and dignity. He has never once said sorry, and he means it.',
    color: '#e0a53a',
    unlock: null,
    stats: { hp: 22, ap: 3, mov: 5, armor: 0, init: 4 },
    growth: { hp: 3 },
    flags: { hop: true },
    sprite: HJA_SPRITE,
    basic: 'hja_basic',
    signature: 'hja_signature',
    passive: {
      name: 'Monkey Business',
      desc: 'Every time a foe springs one of Hjalmar\'s traps, the party gains ' + TRAP_HYPE + ' Hype. The crowd loves a pratfall.',
      // the rule lives in spring() (every trap is his); nothing to hook
      hooks: {},
    },
    startingSkills: ['hja_peel', 'hja_bear_trap'],
    skillPool: ['hja_peel', 'hja_bear_trap', 'hja_cushion', 'hja_paint', 'hja_firecracker', 'hja_glove', 'hja_pickpocket', 'hja_swing', 'hja_switch'],
    summons: [],
    barks: {
      select: ['Hjalmar! Ooh ooh! Who wants to see a trick?', 'Hee hee. Watch your step. No, really.', 'I didn\'t do it. Whatever it is. Yet.',
        'One monkey. Many bananas. Zero regrets.', 'Point me at something wearing a hat.'],
      start: ['Ooh! A fresh floor! It needs more banana.', 'Nobody move. Especially you. Hee hee.', 'Roll for initiative! I rolled a banana.',
        'This dungeon is far too tidy. Let\'s fix that.', 'Places, everyone! Act natural!'],
      move: ['Swing! Swiiing!', 'Scamper scamper scamper.', 'Don\'t mind me. Just rigging the place.', 'Is the floor lava? No. Banana. Wait for it.',
        'Hee hee. That tile is mine now.'],
      kill: ['Hee hee hee! Gotcha!', 'And THAT is why you watch your step!', 'Ooh ooh! Did you see that? Again!',
        'Prank complete. Victim unavailable for comment.', 'Ha! Classic!'],
      hurt: ['Ow! Hey! Not the fur!', 'Eek! Rude!', 'Foul! Ref! REF!', 'Ow ow ow. Okay. Revenge banana.'],
      lowhp: ['Help! Monkey down-ish!', 'I need a banana. A medicinal one.', 'This prank is going badly for me!', 'Ooh. Ooh no. Ooh no no no.'],
      downed: ['Tell... the bananas... I loved them...', 'Pranked... by life itself...', 'Avenge me... with whoopee cushions...',
        'I slipped. On my own peel. Tell no one.'],
      revive: ['I\'m up! Was anyone watching? Good.', 'Ta-da! I never left!', 'Back! And I brought more peels!', 'Thanks! I owe you one banana.'],
      ally_down: ['Hey! Get up! You\'re missing the good part!', 'Noooo! Who will laugh at my pranks now?', 'Friend down! Prank them back!',
        'Hang on! I\'ll rig something!'],
      levelup: ['Ooh ooh! New tricks!', 'Level up! More pockets for more peels!', 'I learned something! Mostly about slipping.',
        'Bigger monkey. Same mischief.'],
      victory: ['Hee hee hee! Flawless! Mostly!', 'And the crowd goes bananas!', 'Who\'s cleaning up the peels? Not it!', 'Best. Prank. Ever.',
        'Pranked them all! Monkey wins!'],
      idle: ['Psst. Marwyn. Your boot\'s untied. Made you look.', 'Does anyone else hear a banana? Just me?',
        'I put a whoopee cushion on the DM\'s chair.', 'Mayor Buga, you look extra toasty today.', 'I\'m not bored. I\'m planning.'],
      signature: ['PRANK WAR! Everybody slips!', 'Bananas! Bananas everywhere!', 'It\'s raining peels! Hallelujah!',
        'My masterpiece! Hee hee hee!', 'Hope you all wore grippy socks!'],
      trap: ['Hee hee! Gotcha!', 'Watch your step! Too late!', 'Ooh ooh! It worked!', 'Classic! Never gets old!', 'That one was for you!'],
    },
  });

  /** Small public surface for tests and other content. */
  DD.Hjalmar = {
    KINDS: KINDS, TRAP_HYPE: TRAP_HYPE, SLIPPED: SLIPPED,
    isTrap: isTrap, traps: traps, canTrapAt: canTrapAt, setTrap: setTrap, spring: spring, springOn: springOn,
    gloveTiles: gloveTiles, trapValue: trapValue, crossChance: crossChance,
  };
})();
