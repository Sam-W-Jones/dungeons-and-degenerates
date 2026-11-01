/* Dungeons and Degenerates — js/data/enemies/act2.js
 * ACT 2 regular enemies + encounters ("The Hauntwood & the Necromancy Academy (Accredited)": hauntwood, academy and
 * graveyard themes). Every id is prefixed 'a2_'.
 * v2 (initiative, no telegraphs): every enemy decides and acts on its own initiative turn, at once (move, then act).
 * Each def carries an `init` modifier and a `passive` line (the inspect panel's "what it does on its turn"). Leaps,
 * charges and the banshee's scream go off from where the unit stands at the start of its turn (no walk first), so
 * heroes counter them by where they end their own turn. The only announced wind-up is Mama Owlbear's Stomp (⏳).
 *   minion/normal: a2_skeleton_intern (Paper Cut Bleed, Coffee Run; leaves a Bone Pile that reassembles unless finished
 *     properly) · a2_zombie_unpaid (Grabby Hands: yank next to it + Root, then bites) · a2_brunch_cultist (Bottomless
 *     Mimosa heals, Scalding Latte burns, serves a2_hollandaise, which dies into an oil slick) · a2_wisp (teleports
 *     instead of walking, chain Swamp Gas Zap, hovers over pits and Lures heroes into them) · a2_owlbear_cub
 *     (straight-line Cub Charge) · a2_banshee (cone Stun from where she floats, One-Star Review) · a2_gargoyle (Gutter
 *     Dive from its perch, then Stone Form until the end of its next turn) · a2_pixie_swarm (single-target hits deal
 *     half, Glitter Bomb Dazzles)
 *   elites: a2_mama_owlbear (immovable; Pounce, Maul, ⏳ Stomp, Vendetta on whoever kills a cub) · a2_necro_ta (Red
 *     Pen, Raise Dead, Detention bone walls; Bone Piles reassemble at once while he stands) · a2_gary (immovable Flesh
 *     Golem: lightning heals him, throws coworkers, GARY ANGRY below half HP) with a2_tesla_coil minions.
 *   extras: statuses a2_stoneform, a2_vendetta · objects a2_bone_pile, a2_bone_wall, a2_chafing_dish (brunch platter),
 *     a2_coffee_machine · 12 encounters (8 normal, 4 elite; 3 handcrafted layouts). Helpers for other authors: DD.Act2.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

  // ---- shared helpers -------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return !!u && DD.Act.hasStatus(u, id); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  function lunge(ctx, to) { const p = to || ctx.target; if (p && ctx.user && (p.x !== ctx.user.x || p.y !== ctx.user.y)) DD.FX.lunge(ctx.user, p); }
  /** Attack bark (cosmetic; barks are silenced in previews). */
  function say(ctx, chance) { if (ctx.isIntent) A().maybeBark(ctx.user, 'attack', chance === undefined ? 0.25 : chance); }
  function landable(x, y, unit) { return G().isFree(x, y, unit) && !G().isDrop(x, y); }
  function nearestDist(p, list) { let d = Infinity; list.forEach(function (o) { d = Math.min(d, dist(p, o)); }); return d; }
  /** Still able to do something this turn (not dead, stunned or a sheep after a step onto a trap). */
  function canAct(u) { return active(u) && !DD.Combat.isStunned(u) && !has(u, 'sheep'); }
  /** aiScore for leaps (Gutter Dive, Mama's Coming): they need a free tile next to the target, so never pick one that can't land. */
  function leapRoom(ctx) {
    const t = ctx.targetUnit, u = ctx.user;
    if (!t || !u) return 0;
    return dist(u, t) === 1 || DIRS.some(function (d) { return landable(t.x + d.x, t.y + d.y, u); }) ? 0 : -50;
  }

  /**
   * Damage every standing unit on the skill's tiles except the user (friend or foe: an enemy's friends in its swing
   * take the hit too). opts: foesOnly, element, objects (also damage destructible objects there).
   */
  function strike(ctx, dmg, opts) {
    opts = opts || {};
    const user = ctx.user, out = [];
    (opts.foesOnly ? ctx.foes : ctx.units).slice().forEach(function (u) {
      if (!active(u) || u === user) return;
      A().damage(user, u, dmg, opts.element ? { element: opts.element } : {});
      out.push(u);
    });
    if (opts.objects) {
      (ctx.tiles || []).forEach(function (p) {
        const t = G().tile(p.x, p.y);
        if (t && t.obj && t.obj.maxHp > 0 && t.obj.hp > 0) A().damageObject(user, p.x, p.y, dmg);
      });
    }
    return out;
  }

  /** BFS step distance from the targets over walkable tiles (units ignored): an approach field. */
  function fieldFrom(targets, unit) {
    const g = S().grid, d = new Array(g.w * g.h).fill(Infinity), q = [];
    targets.forEach(function (t) { const i = t.y * g.w + t.x; if (d[i] !== 0) { d[i] = 0; q.push(i); } });
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % g.w, y = (i / g.w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DIRS[k].x, ny = y + DIRS[k].y;
        if (!G().inBounds(nx, ny) || !G().isWalkable(nx, ny, unit)) continue;
        const j = ny * g.w + nx;
        if (d[j] <= d[i] + 1) continue;
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
    return d;
  }

  /** The wisp's move: a short pop (teleport) instead of a walk. */
  function blink(unit, to) {
    if (!to || (unit.x === to.x && unit.y === to.y) || DD.Act.cantMove(unit) || !G().isFree(to.x, to.y, unit)) return false;
    DD.FX.particles(unit, { kind: 'glitter', color: '#c8ffe0', count: 8 });
    return A().teleport(unit, to.x, to.y);
  }

  /** Move (once) toward the nearest foe, ideally ending `keep` tiles away; flyers may blink. */
  function closeIn(unit, api, keep, useBlink) {
    const foes = api.foes(unit);
    if (!foes.length || DD.Act.cantMove(unit)) return false;
    const g = S().grid, field = fieldFrom(foes, unit), want = Math.max(1, keep || 1);
    const value = function (p) {
      let v = field[p.y * g.w + p.x];
      if (!isFinite(v)) v = 60 + nearestDist(p, foes);
      const md = nearestDist(p, foes);
      return Math.abs(v - want) + (md < want ? (want - md) * 3 : 0);
    };
    const here = value(unit);
    let best = null, bestV = here;
    api.reachable(unit).forEach(function (e) {
      if (e.hazard || G().hazardAt(e.x, e.y, unit) || lethalPath(unit, e)) return;
      const v = value(e) + e.cost * 0.01;
      if (v < bestV - 0.001) { best = e; bestV = v; }
    });
    if (!best) return false;
    return useBlink ? blink(unit, best) : api.moveTo(unit, best.x, best.y);
  }
  function lethalPath(unit, e) { const r = DD.AI.pathRisk ? DD.AI.pathRisk(unit, e) : null; return !!(r && r.lethal); }

  /** Use `choice` (from api.bestAttack) now, from where the unit stands. Returns true if the skill went off. */
  function fire(unit, api, choice) {
    if (!choice || !canAct(unit)) return false;
    const tu = G().unitAt(choice.target.x, choice.target.y);
    const def = DD.getSkill(choice.skillId);
    return api.act(unit, choice.skillId, def && def.anchor === 'unit' && active(tu) ? tu : choice.target, {});
  }
  /**
   * Walk (or blink) to choice.moveTo, then use the skill at once; if the walk was cut short (trap, web) the skill is
   * re-aimed from where the unit ended up. Returns true if the skill went off.
   */
  function go(unit, api, choice, opts) {
    opts = opts || {};
    if (!choice) return false;
    let c = choice;
    if (c.moveTo && (c.moveTo.x !== unit.x || c.moveTo.y !== unit.y)) {
      if (opts.blink) blink(unit, c.moveTo); else api.moveTo(unit, c.moveTo.x, c.moveTo.y);
      if (!canAct(unit)) return false;
      if (unit.x !== c.moveTo.x || unit.y !== c.moveTo.y) c = api.bestAttack(unit, { skills: [choice.skillId], noMove: true, style: opts.style });
    }
    return fire(unit, api, c);
  }
  function movedFrom(unit, start) { return unit.x !== start.x || unit.y !== start.y; }

  /** Shared straight-line charge path: up to L.len tiles, stops before walls/pits/cliffs/friends, ends on the first foe. */
  function chargeTiles(ctx) {
    const u = ctx.user, d = ctx.dir, out = [];
    if (!u || !d || (!d.x && !d.y) || !S()) return out;
    const len = (ctx.L && ctx.L.len) || 4;
    let cur = { x: u.x, y: u.y };
    for (let k = 0; k < len; k++) {
      const nx = cur.x + d.x, ny = cur.y + d.y;
      if (!G().inBounds(nx, ny)) break;
      const o = G().unitAt(nx, ny);
      if (o && o !== u) {
        if (active(o) && G().hostile(u, o)) out.push({ x: nx, y: ny });
        break;
      }
      if (!G().isWalkable(nx, ny, u) || G().isDrop(nx, ny) || !G().canStep(u, cur, { x: nx, y: ny })) break;
      out.push({ x: nx, y: ny });
      cur = { x: nx, y: ny };
    }
    return out;
  }
  /** Run along the charge path, then hit + push the foe at its end (if the charge got there). */
  function doCharge(ctx) {
    const user = ctx.user, L = ctx.L, tiles = ctx.tiles || [];
    if (!active(user) || !tiles.length) return;
    const last = tiles[tiles.length - 1];
    const o = G().unitAt(last.x, last.y);
    const victim = o && o !== user && active(o) && G().hostile(user, o) ? o : null;
    const path = victim ? tiles.slice(0, -1) : tiles.slice();
    if (path.length && !DD.Act.cantMove(user)) A().moveAlong(user, path);
    if (!active(user) || !victim || !active(victim) || dist(user, victim) !== 1) return;
    lunge(ctx, victim);
    say(ctx, 0.3);
    A().damage(user, victim, L.dmg);
    if (active(victim) && L.push) A().push(user, victim, ctx.dir, L.push);
  }

  /** Swamp Gas Zap: the target tile, then the nearest other unit within L.reach (friend or foe), L.jumps times. */
  function chainTiles(ctx) {
    const out = [], t0 = ctx.target, user = ctx.user, s = S();
    if (!t0 || !s) return out;
    out.push({ x: t0.x, y: t0.y });
    const seen = {};
    seen[t0.x + ',' + t0.y] = 1;
    if (user) seen[user.x + ',' + user.y] = 1;
    const jumps = ctx.L && ctx.L.jumps !== undefined ? ctx.L.jumps : 2, reach = (ctx.L && ctx.L.reach) || 2;
    let cur = { x: t0.x, y: t0.y };
    for (let j = 0; j < jumps; j++) {
      let best = null, bd = Infinity;
      for (let i = 0; i < s.units.length; i++) {
        const u = s.units[i];
        if (!active(u) || u === user || seen[u.x + ',' + u.y]) continue;
        const d = dist(cur, u);
        if (d > reach) continue;
        if (d < bd || (d === bd && (u.y < best.y || (u.y === best.y && u.x < best.x)))) { best = u; bd = d; }
      }
      if (!best) break;
      out.push({ x: best.x, y: best.y });
      seen[best.x + ',' + best.y] = 1;
      cur = { x: best.x, y: best.y };
    }
    return out;
  }

  // ---- statuses (durations count the owner's own turns) ---------------------------------------------------
  function stLeft(st) { return st && st.turns > 0 ? ' (' + st.turns + ' of its turns left)' : ''; }
  function sourceName(st, fallback) {
    const u = st && st.source && DD.Combat && DD.Combat.byId ? DD.Combat.byId(st.source) : null;
    return u ? u.name : fallback;
  }

  DD.registerStatus({
    id: 'a2_stoneform', name: 'Stone Form', icon: '🗿', color: '#9aa0aa', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) { return 'Solid stone: takes 75% less damage. A gargoyle in Stone Form does nothing on its turn.' + stLeft(st); },
    hooks: { modifyIncomingDamage: function (d) { d.mult *= 0.25; } },
  });

  DD.registerStatus({
    id: 'a2_vendetta', name: 'Vendetta', icon: '😡', color: '#ff5a3c', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return 'Deals +50% damage to ' + sourceName(st, 'whoever it holds a grudge against') + '.' + stLeft(st); },
    hooks: {
      modifyOutgoingDamage: function (d, st) { if (d.target && st && st.source && d.target.id === st.source) d.mult *= 1.5; },
    },
  });

  // ---- object painters (world px, origin at the tile's top center, +y down) ----------------------------
  const INK = '#1a1014';
  function boneLine(g, x1, y1, x2, y2, col, w) {
    g.line(x1, y1, x2, y2, INK, (w || 2) + 1.6);
    g.line(x1, y1, x2, y2, col, w || 2);
    g.circle(x1, y1, (w || 2) * 0.8, col, INK);
    g.circle(x2, y2, (w || 2) * 0.8, col, INK);
  }
  function skull(g, x, y, r, col, glow) {
    g.circle(x, y, r, col, INK);
    g.rect(x - r * 0.55, y + r * 0.45, r * 1.1, r * 0.6, col, INK, 1);
    g.circle(x - r * 0.38, y - r * 0.05, r * 0.27, INK);
    g.circle(x + r * 0.38, y - r * 0.05, r * 0.27, INK);
    if (glow) g.glow(x, y, r * 1.6, glow, 0.3);
  }

  function drawBonePile(g, obj, t) {
    const bone = '#ece4cf';
    const timer = obj && obj.data ? obj.data.timer : 2;
    const jit = timer !== undefined && timer <= 1 ? Math.sin(t * 26) * 0.9 : 0;   // about to stand up: rattling
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    g.ellipse(0, 2, 17, 7, 'rgba(0,0,0,0.28)');
    g.glow(0, -2, 18, '#7af0ff', 0.18 + 0.12 * pulse);   // still a little bit alive
    boneLine(g, -12 + jit, 3, 6 + jit, -1, bone, 2.4);
    boneLine(g, -8 - jit, -3, 11 - jit, 3, bone, 2.4);
    boneLine(g, -4 + jit, 5, 12 + jit, -3, bone, 2);
    for (let i = 0; i < 3; i++) g.arc(-7 + i * 3.2 - jit, -1, 3.4, Math.PI * 1.05, Math.PI * 1.95, bone, 1.5);   // ribs
    g.line(-10, 1, -6, 6, '#3f7fd0', 1.4);   // the lanyard survived
    g.rect(-7.6, 4.6, 5.2, 3.8, '#ffffff', INK, 0.6);
    g.rect(-7.6, 4.6, 5.2, 1.2, '#3f7fd0', null);
    // a coffee cup: it is on its break
    g.rect(9, -9, 4.6, 5.2, '#f4f1ea', INK, 0.8);
    g.ellipse(11.3, -9, 2.3, 0.9, '#6b3f1d', null);
    g.arc(13.8, -6.6, 1.4, -1.4, 1.4, INK, 0.9);
    skull(g, 3 - jit, -8, 5.2, bone, null);
    g.circle(1 - jit, -8.2, 1.1, g.rgba('#7af0ff', 0.6 + 0.4 * pulse));   // eye sockets glow
    g.circle(5 - jit, -8.2, 1.1, g.rgba('#7af0ff', 0.6 + 0.4 * pulse));
  }

  function drawBoneWall(g, obj, t) {
    const bone = '#e6dcc2', bone2 = '#cfc4a6';
    g.ellipse(0, 3, 21, 9, 'rgba(0,0,0,0.3)');
    g.ellipse(0, 1.5, 17, 7, '#7d7466', INK);
    // a picket of femurs leaning into each other, across the tile
    const posts = [[-13, 3, -11, -24], [-7, 0, -6, -33], [0, -2, 1, -38], [7, 0, 6, -33], [13, 3, 11, -24]];
    posts.forEach(function (p, i) { boneLine(g, p[0], p[1], p[2], p[3], i % 2 ? bone2 : bone, 3); });
    boneLine(g, -13, -16, 13, -16, bone, 2);
    boneLine(g, -11, -6, 11, -6, bone2, 2);
    skull(g, 1, -42 + Math.sin(t * 2) * 0.4, 5.4, bone, '#59e08a');
  }

  function drawChafingDish(g, obj, t) {
    const metal = '#c9ccd4';
    g.ellipse(0, 3, 17, 7, 'rgba(0,0,0,0.3)');
    g.line(-10, 2, -9, -7, INK, 2.2); g.line(10, 2, 9, -7, INK, 2.2); g.line(0, 5, 0, -5, INK, 2.2);
    const fl = Math.sin(t * 13) * 0.7;
    g.ellipse(0, -3, 3.4, 1.6, '#2f4f9a');
    g.ellipse(0, -5 + fl * 0.3, 2.2, 3.4 + fl, '#7fd0ff');   // sterno: the unholy kind of blue
    g.ellipse(0, -8, 15, 6, g.shade(metal, -0.3), INK);
    g.ellipse(0, -9.8, 15, 6, metal, INK);
    const c = g.ctx;
    c.beginPath(); c.ellipse(0, -10, 11.5, 9.5, 0, Math.PI, 0); c.closePath();
    c.fillStyle = '#e3e6ec'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    g.circle(0, -20, 2, metal, INK);
    g.ellipse(-4.5, -15, 3.2, 1.4, 'rgba(255,255,255,0.7)');
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.55 + i / 3) % 1;
      g.circle(-4 + i * 4 + Math.sin(p * 6 + i) * 2, -23 - p * 15, 2 + p * 2.6, g.rgba('#a8f070', 0.55 * (1 - p)));
    }
  }

  function drawCoffeeMachine(g, obj, t) {
    g.ellipse(0, 3, 18, 8, 'rgba(0,0,0,0.3)');
    g.box(0, 0, 13, 6.5, 34, { top: '#c0392b', left: '#9aa1a8', right: '#7d848b' }, INK);   // steel body, red lid
    g.box(0, -34, 13, 6.5, 3, { top: '#d9493a', left: '#a5281c', right: '#8c2117' }, INK);
    // the front (right) face: a menu screen, a glass pot, steam
    g.poly([[2, -27.5], [11, -32], [11, -24], [2, -19.5]], '#1c2a2c', INK);
    g.text('☕', 6.5, -25.6, 6, '#9fffb0');
    const frac = obj && obj.maxHp ? obj.hp / obj.maxHp : 1;
    g.circle(-6, -23, 2, frac > 0.5 ? '#59e08a' : frac > 0.25 ? '#ffd23f' : '#ff4a3a', INK);   // health light
    g.rect(2.5, -14, 7, 8, 'rgba(200,230,240,0.55)', INK, 2);   // glass pot
    g.rect(3, -11, 6, 4.6, 'rgba(110,62,26,0.95)', null, 1.5);
    g.rect(3.4, -16, 5.2, 2, '#2a2a2a', null);
    for (let i = 0; i < 2; i++) {
      const p = (t * 0.7 + i / 2) % 1;
      g.circle(5.5 + Math.sin(p * 7 + i) * 1.5, -17 - p * 18, 1.6 + p * 2, g.rgba('#ffffff', 0.45 * (1 - p)));
    }
    g.poly([[-11, -21], [-5, -24], [-5, -19], [-11, -16]], '#ffe96a', null);   // sticky note: "LAST ONE. TOUCH IT AND DIE."
    g.line(-10, -19.5, -6, -21.5, 'rgba(60,40,20,0.6)', 0.7);
    if (frac <= 0.5) g.line(-3, -30, 1, -22, INK, 1);   // dented
  }

  // ---- objects -----------------------------------------------------------------------------------------
  const PILE = 'a2_bone_pile';
  function taAround() {
    const s = S();
    return !!s && s.units.some(function (u) { return active(u) && u.defId === 'a2_necro_ta' && u.side === 'enemy'; });
  }
  function pileTiles() {
    const s = S();
    return s ? s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === PILE; }) : [];
  }

  /** Stand a Bone Pile back up as a Skeleton Intern at half HP. Returns the new unit, or null (tile occupied). */
  function reassemble(tile, why) {
    if (!tile || !tile.obj || tile.obj.id !== PILE) return null;
    if (G().unitAt(tile.x, tile.y)) {
      DD.FX.text(tile, 'Can\'t get up!', { color: '#ece4cf', size: 13 });
      return null;
    }
    const times = (tile.obj.data && tile.obj.data.times) || 0;
    A().removeObject(tile.x, tile.y);
    const u = A().spawn('a2_skeleton_intern', tile.x, tile.y, { hpMult: 0.5, silent: true });
    if (!u) return null;
    u.data.reassembled = times + 1;
    DD.FX.particles(u, { kind: 'dust', count: 10 });
    DD.FX.text(u, 'Reassembled!', { color: '#ece4cf', size: 15 });
    A().log(u.name + ' pulls itself back together' + (why === 'raise' ? ' (Raise Dead).' : '. Still unpaid.'), 'enemy');
    A().maybeBark(u, 'reassemble', 0.6);
    return u;
  }

  DD.registerObject({
    id: PILE, name: 'Bone Pile', blocksMove: false, blocksLos: false, hp: 3, height: 0.35, color: '#e8e2cf', smashable: true,
    desc: 'A Skeleton Intern on its break. It stands back up (half HP) at the end of the next round, or the same round ' +
      'while a Necromancer TA stands. A hero walking over it, a Smash or 3+ damage scatters it for good.',
    autoplay: function (unit) { return unit && unit.side === 'hero' ? 9 : 0; },
    onEnter: function (unit, obj, tile) {
      if (!active(unit) || unit.side !== 'hero') return;
      DD.FX.text(tile, 'Crunch!', { color: '#fff4d0', size: 15 });
      A().log(unit.name + ' stomps the bone pile flat. That internship is over.', 'hero');
      A().destroyObject(tile.x, tile.y, unit);
    },
    onRoundEnd: function (obj, tile) {
      const left = (obj.data.timer === undefined ? 2 : obj.data.timer) - (taAround() ? 2 : 1);
      obj.data.timer = Math.max(0, left);
      if (left > 0) { DD.FX.text(tile, '*rattle*', { color: '#ece4cf', size: 12 }); return; }
      reassemble(tile, 'timer');
    },
    draw: drawBonePile,
  });

  /** A hero with no free tile around it (walled in by Detention). */
  function boxedIn(u) { return DIRS.every(function (d) { return !G().isFree(u.x + d.x, u.y + d.y, u); }); }

  DD.registerObject({
    id: 'a2_bone_wall', name: 'Bone Wall', blocksMove: true, blocksLos: true, hp: 5, height: 1.3, color: '#ddd5bf', smashable: true,
    desc: 'Detention, in bone form. Blocks movement and line of sight. 5 HP: one Smash breaks it. Crumbles at the end of the next round.',
    autoplay: function (unit) { return unit && unit.side === 'hero' && boxedIn(unit) ? 8 : 0; },
    onRoundEnd: function (obj, tile) {
      obj.data.turns = (obj.data.turns === undefined ? 2 : obj.data.turns) - 1;
      if (obj.data.turns > 0) return;
      A().removeObject(tile.x, tile.y);
      DD.FX.particles(tile, { kind: 'dust', count: 10 });
      DD.FX.tile(tile.x, tile.y, 'crack');
    },
    draw: drawBoneWall,
  });

  DD.registerObject({
    id: 'a2_chafing_dish', name: 'Unholy Brunch Platter', blocksMove: true, blocksLos: false, hp: 10, height: 0.9, color: '#c9ccd4', smashable: true,
    desc: 'Destructible (10 HP; adjacent heroes can Smash it). At the end of each round it heals every enemy within 2 tiles for 3 HP. ' +
      'Breaking it spills flammable hollandaise (oil).',
    onRoundEnd: function (obj, tile) {
      const s = S();
      if (!s) return;
      let fed = 0;
      s.units.slice().forEach(function (u) {
        if (active(u) && u.side === 'enemy' && dist(u, tile) <= 2 && u.hp < u.maxHp && A().heal(null, u, 3) > 0) fed++;
      });
      if (fed) DD.FX.particles(tile, { kind: 'bubbles', color: '#bfffb0', count: 8 });
    },
    onDestroyed: function (obj, tile, src) {
      A().splash(tile.x, tile.y, 1, 'oil', 4, src);
      A().log('Hollandaise everywhere. Very flammable, and somehow still warm.', 'system');
    },
    draw: drawChafingDish,
  });

  DD.registerObject({
    id: 'a2_coffee_machine', name: 'Coffee Machine', blocksMove: true, blocksLos: false, hp: 24, height: 1.2, color: '#5a4a44',
    desc: 'The last working coffee machine in the Academy (24 HP). If it breaks, finals week wins: defeat. Enemies will go for it.',
    onDestroyed: function () { A().log('The coffee machine dies. Somewhere, a wizard falls asleep mid-lecture, forever.', 'narrator'); },
    draw: drawCoffeeMachine,
  });

  // ---- sprite overlays + specs -----------------------------------------------------------------------
  function internOverlay(g) {
    if (g.pose === 'downed') return;
    for (let i = 0; i < 3; i++) g.line(-3.4, -16.4 + i * 2.6, 3.4, -16 + i * 2.6, 'rgba(70,60,48,0.6)', 0.9);   // ribs
    g.line(-2.4, -19.2, 0.3, -13.6, '#3f7fd0', 1.1);   // lanyard
    g.line(2.6, -19.2, 0.7, -13.6, '#3f7fd0', 1.1);
    g.rect(-1.7, -13.9, 4.4, 3.8, '#ffffff', null, 0.5);
    g.rect(-1.7, -13.9, 4.4, 1.2, '#3f7fd0', null);
    g.line(-0.9, -11.6, 1.9, -11.6, 'rgba(40,40,60,0.7)', 0.5);
  }
  function zombieOverlay(g) {
    if (g.pose === 'downed') return;
    g.poly([[-1, -18.4], [1, -18.4], [1.7, -11.2], [0, -9.4], [-1.7, -11.2]], '#b0302a', null);   // limp office tie
    g.poly([[-1.4, -19.2], [1.4, -19.2], [0.9, -17.6], [-0.9, -17.6]], '#7f201b', null);
    g.rect(2.6, -16.6, 4.4, 3.1, '#ffffff', null, 0.4);   // HELLO my name is ___
    g.rect(2.6, -16.6, 4.4, 0.9, '#d03a30', null);
    g.line(-5.5, -15.5, -3, -12.5, 'rgba(60,20,20,0.5)', 0.8);   // a coffee stain from 1724
  }
  function cultistOverlay(g, t) {
    if (g.pose === 'downed') return;
    // champagne flute of mimosa, raised in the off hand's direction
    const x = -7.5, y = -16 + Math.sin(t * 2.2) * 0.3;
    g.poly([[x - 1.6, y - 7], [x + 1.6, y - 7], [x + 0.6, y - 1.5], [x - 0.6, y - 1.5]], 'rgba(255,170,60,0.9)', '#1a1014', 0.7);
    g.line(x, y - 1.5, x, y + 1.6, '#e8f4ff', 0.9);
    g.line(x - 1.4, y + 1.8, x + 1.4, y + 1.8, '#e8f4ff', 0.9);
    g.circle(x - 0.4, y - 5, 0.4, '#fff6c8', null);
  }
  function hollandaiseOverlay(g, t) {
    if (g.pose === 'downed') return;
    const top = -17.4 + Math.sin(t * 4.1) * 0.5;
    g.path(function (c) {   // a wobbly poached egg riding on top: it is, technically, Eggs Benedict
      c.moveTo(-8.5, top + 1.5);
      c.bezierCurveTo(-8, top - 2.2, -2, top - 3.2, 1.5, top - 2.4);
      c.bezierCurveTo(5.5, top - 3.4, 9, top - 1, 8, top + 1.6);
      c.bezierCurveTo(5, top + 3.6, -5, top + 3.8, -8.5, top + 1.5);
      c.closePath();
    }, '#fffaf0', '#1a1014', 1.2);
    g.circle(0.5, top - 0.6, 2.5, '#ffa514', '#1a1014');
    g.circle(-0.3, top - 1.4, 0.8, 'rgba(255,255,255,0.85)', null);
    [[-6.5, -9], [6, -6.5], [-3, -4]].forEach(function (p) { g.circle(p[0], p[1], 0.75, '#3c8a2e', null); });   // parsley
  }
  function bansheeOverlay(g, t) {
    if (g.pose === 'downed') return;
    const hair = g.pal.hair, sway = Math.sin(t * 1.5) * 0.3;
    // The Manager Bob: stiff, asymmetric, highlighted, and very much asking for the manager
    g.poly([[-9.8, -31], [-7.6, -37.8], [-1, -40], [6.5, -38.6], [10.8, -33.5], [11.6 + sway, -23.6], [8.4, -25.6], [7.2, -32.2], [1, -34.6], [-5.4, -33.4]], hair, undefined);
    g.line(-3.5, -38.4, 6, -37.4, 'rgba(255,255,255,0.65)', 1);
    g.line(8.6, -31, 10.2 + sway, -25.4, 'rgba(255,255,255,0.55)', 0.8);
  }
  function stoneOverlay(g, t) {
    if (g.pose === 'downed') return;
    const crack = 'rgba(40,40,48,0.7)';
    g.line(-3, -31, 0.5, -26, crack, 0.9); g.line(0.5, -26, -1.5, -21, crack, 0.9); g.line(4, -12, 7, -8.5, crack, 0.8);
    g.ellipse(-5, -6, 3, 1.4, 'rgba(90,130,70,0.75)', null);   // moss
    // a pigeon has claimed the statue
    const hop = Math.sin(t * 5) > 0.7 ? -0.9 : 0;
    g.ellipse(1.5, -41.5 + hop, 3.8, 2.5, '#8d93a6', undefined);
    g.circle(4.3, -43.6 + hop, 1.8, '#9aa2b8', undefined);
    g.poly([[5.8, -43.8 + hop], [7.6, -43.2 + hop], [5.8, -42.7 + hop]], '#e8a33a', null);
    g.circle(4.8, -44 + hop, 0.45, '#1a1014', null);
    g.line(-2, -40.5 + hop, -4.4, -39 + hop, '#7a8094', 1.2);
  }
  // Owl bits for the bear bodies. Head centres follow DD.Sprites' layout: humanoid 'huge' build head (hr 10.5 × size)
  // sits at y = -23.5 - 0.8 hr; the round quadruped's head (hr 7.2 × size) at (10.11, -17); poses nudge them a little.
  function owlTufts(g, hx, hy, hr, w, h, col) {
    [-1, 1].forEach(function (s) {
      const bx = hx + s * hr * 0.52, by = hy - hr * 0.8;
      g.poly([[bx - w, by + h * 0.28], [bx + s * w * 0.8, by - h], [bx + w, by + h * 0.28]], col, INK, 0.9);
    });
  }
  function cubOverlay(g) {
    if (g.pose === 'downed') return;
    const hr = 7.2 * 1.15, hx = 10.11 + (g.pose === 'attack' ? 2.5 : g.pose === 'hurt' ? -1 : 0), hy = -17 + (g.pose === 'attack' ? 1 : 0);
    owlTufts(g, hx, hy, hr, 1.8, 4.2, '#8a5a35');
  }
  function mamaOverlay(g) {
    if (g.pose === 'downed') return;
    const hr = 10.5 * 1.1, hx = g.pose === 'attack' ? 1.2 : g.pose === 'hurt' ? -0.8 : 0, hy = -23.5 - 0.8 * hr;
    // feathered chest
    g.ellipse(1.2, -15.5, 6.6, 6.4, '#d9c09a', null);
    for (let i = 0; i < 3; i++) {
      for (let j = -1; j <= 1; j++) {
        const x = 1.2 + j * 3.2, y = -19 + i * 3.1;
        g.line(x - 1.3, y - 0.8, x, y + 0.5, 'rgba(110,70,40,0.7)', 0.8);
        g.line(x, y + 0.5, x + 1.3, y - 0.8, 'rgba(110,70,40,0.7)', 0.8);
      }
    }
    owlTufts(g, hx, hy, hr, 2.6, 5.5, '#4a2c18');
    // the beak, open: she is roaring at you
    const bx = hx + hr * 0.29, by = hy + hr * 0.2;
    g.poly([[bx - hr * 0.26, by - hr * 0.08], [bx + hr * 0.26, by - hr * 0.08], [bx, by + hr * 0.32]], '#f0b030', INK, 1);
    g.poly([[bx - hr * 0.17, by + hr * 0.2], [bx + hr * 0.17, by + hr * 0.2], [bx, by + hr * 0.44]], '#c88a20', INK, 0.9);
    // a pink bow on one tuft: she dressed up for the occasion (your funeral)
    const kx = hx + hr * 0.62, ky = hy - hr * 0.85;
    g.poly([[kx, ky], [kx - 4, ky - 3], [kx - 3.7, ky + 2.5]], '#ff7ab8', INK, 0.8);
    g.poly([[kx, ky], [kx + 4, ky - 2.5], [kx + 3.5, ky + 2.8]], '#ff7ab8', INK, 0.8);
    g.circle(kx, ky, 1.4, '#ff4fa0', INK);
  }
  function garyOverlay(g, t) {
    if (g.pose === 'downed') return;
    const metal = '#9aa2aa';
    [-1, 1].forEach(function (s) { g.rect(s * 8.8 - 2, -25, 4, 2.6, metal, '#1a1014', 0.8); g.circle(s * 10.8, -23.7, 1.5, '#c6ccd2', '#1a1014'); });
    g.line(-6.8, -37.6, 6.2, -36.4, '#1a1014', 0.9);   // forehead stitches
    for (let i = -5; i <= 5; i += 2.5) g.line(i, -38.8, i + 0.4, -35.4, '#1a1014', 0.8);
    g.line(-7, -19.5, 6, -13.5, '#1a1014', 0.9);   // torso stitches
    for (let i = 0; i < 5; i++) { const x = -6 + i * 3, y = -19 + i * 1.35; g.line(x - 0.7, y - 1.3, x + 0.7, y + 1.3, '#1a1014', 0.8); }
    if (Math.sin(t * 3.1) > 0.8) { g.line(10.8, -24, 14, -28, '#9fd0ff', 1.1); g.line(14, -28, 12.5, -31, '#9fd0ff', 1.1); }
  }
  function coilDraw(g, t) {
    const metal = '#8b8f96', copper = '#c87a3a', zap = '#9fe4ff';
    g.ellipse(0, 0, 9.5, 3.8, g.shade(metal, -0.35), undefined);
    g.rect(-6.5, -6.5, 13, 6.5, metal, undefined, 1.5);
    g.rect(-1.7, -31, 3.4, 26, g.shade(metal, -0.1), undefined, 1);
    for (let i = 0; i < 6; i++) g.ellipse(0, -9.5 - i * 3.5, 5.4 - i * 0.35, 1.6, copper, undefined);
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    g.glow(0, -35, 13, zap, 0.3 + 0.3 * pulse);
    g.circle(0, -35, 4.8, '#d8dde3', undefined);
    g.circle(-1.6, -36.6, 1.4, 'rgba(255,255,255,0.85)', null);
    for (let k = 0; k < 2; k++) {
      if (Math.sin(t * 7 + k * 2.3) < 0.15) continue;
      const a = t * 9 + k * 3.1, ex = Math.cos(a) * 12, ey = -35 + Math.sin(a * 1.3) * 8;
      g.path(function (c) {
        c.moveTo(0, -35);
        c.lineTo(ex * 0.35 + 2, -35 + (ey + 35) * 0.35 - 2);
        c.lineTo(ex * 0.7 - 1.5, -35 + (ey + 35) * 0.7 + 1.5);
        c.lineTo(ex, ey);
      }, null, zap, 1.1);
    }
  }

  function P(over) { return Object.assign({ outline: '#1a1014' }, over); }
  const SPR = {
    intern: { base: 'humanoid', scale: 0.8, build: 'slim', outfit: 'none',
      palette: P({ skin: '#ece5d3', cloth: '#3f7fd0', cloth2: '#2a3550', hair: '#ece5d3', metal: '#c9ced6', eye: '#7af0ff', accent: '#ffd23f', parchment: '#f4ecd6' }),
      head: { face: 'skull', eyes: 'glow', hair: 'none', mouth: 'none' }, mainhand: 'scroll', overlay: internOverlay },
    zombie: { base: 'humanoid', scale: 1, build: 'normal', outfit: 'tunic',
      palette: P({ skin: '#93ad7c', cloth: '#d8d2bf', cloth2: '#5a5f6a', hair: '#3b3426', eye: '#f2f27a', accent: '#b0302a', boots: '#3a3024' }),
      head: { hair: 'short', eyes: 'sleepy', mouth: 'open' }, extras: ['belt'], overlay: zombieOverlay },
    cultist: { base: 'humanoid', scale: 1, build: 'normal', outfit: 'robe',
      palette: P({ skin: '#e9c7a6', cloth: '#b8325a', cloth2: '#ffb347', hair: '#2a1a14', metal: '#ffd76a', eye: '#ffe14a', accent: '#ff9f2e', book: '#7a2a3a' }),
      head: { hat: 'hood', eyes: 'glow', mouth: 'grin' }, offhand: 'book', extras: ['sash'], aura: { kind: 'bubbles', color: '#ffe9a0' }, overlay: cultistOverlay },
    hollandaise: { base: 'blob', scale: 0.8, palette: P({ skin: '#f3cf45', eye: '#3a2a10' }), shape: { wobble: 2.2 },
      head: { eyes: 'angry', mouth: 'open' }, overlay: hollandaiseOverlay },
    wisp: { base: 'flyer', scale: 0.92, palette: P({ skin: '#7dffb0', eye: '#ffffff' }), shape: { body: 'wisp' },
      head: { eyes: 'glow', mouth: 'grin' }, aura: { kind: 'sparkles', color: '#c8ffe0' } },
    cub: { base: 'quadruped', scale: 0.88, palette: P({ skin: '#a8743f', cloth2: '#f2dfba', hair: '#8a5a35', eye: '#2b1d14', beak: '#f2b840' }),
      shape: { legs: 'short', body: 'round', snout: 'beak', fluff: true }, head: { ears: 'bear', eyes: 'big', mouth: 'none', size: 1.15 }, tail: 'rabbit',
      overlay: cubOverlay },
    banshee: { base: 'humanoid', scale: 1, build: 'slim', outfit: 'dress',
      palette: P({ skin: '#d6ecf2', cloth: '#8fb3d6', cloth2: '#e6f3ff', hair: '#f3df8a', metal: '#c0c8d8', eye: '#ffffff', accent: '#bfe0ff' }),
      head: { hair: 'short', eyes: 'angry', mouth: 'open' }, bling: ['earrings'], aura: { kind: 'smoke', color: '#bfe0ff' }, overlay: bansheeOverlay },
    gargoyle: { base: 'humanoid', scale: 1, build: 'stocky', outfit: 'none',
      palette: P({ skin: '#8e929c', cloth: '#6c707a', cloth2: '#5a5e68', hair: '#5a5e68', horn: '#d8d4c8', wing: '#6c707a', eye: '#ff9a3c', accent: '#ff9a3c' }),
      head: { horns: 'demon', ears: 'pointy', eyes: 'glow', mouth: 'fangs' }, wings: 'bat', tail: 'devil' },
    gargoyleStone: { base: 'humanoid', scale: 1, build: 'stocky', outfit: 'none',
      palette: P({ skin: '#a5a8af', cloth: '#9a9da5', cloth2: '#8e9199', hair: '#8e9199', horn: '#b8bac0', wing: '#9a9da5', eye: '#7c7f86', accent: '#7c7f86' }),
      head: { horns: 'demon', ears: 'pointy', eyes: 'sleepy', mouth: 'frown' }, wings: 'bat', tail: 'devil', overlay: stoneOverlay },
    pixies: { base: 'swarm', scale: 1, palette: P({ skin: '#e2ffc2', accent: '#ff7ad9', eye: '#2b2233', wing: '#d8f6ff' }),
      shape: { of: 'pixie', count: 6 }, aura: { kind: 'sparkles', color: '#fff3a3' } },
    // Mama rears up on her hind legs (the cubs stay on all fours): a big bear body, an owl's face and a pink bow
    mama: { base: 'humanoid', scale: 1.6, build: 'huge', outfit: 'none',
      palette: P({ skin: '#6b4428', cloth: '#5e3a22', cloth2: '#d9c09a', hair: '#3f2614', eye: '#ff7a1a', accent: '#ff7ab8', boots: '#3f2614' }),
      head: { ears: 'bear', eyes: 'angry', mouth: 'none', size: 1.1 }, overlay: mamaOverlay },
    ta: { base: 'humanoid', scale: 1.35, build: 'slim', outfit: 'robe',
      palette: P({ skin: '#d9cfc0', cloth: '#2b2240', cloth2: '#59e08a', hair: '#3a2f2a', metal: '#c0c0c0', eye: '#59e08a', accent: '#e0303a', quill: '#e0303a', book: '#6a1f2a', scarf: '#59e08a' }),
      head: { hat: 'mortarboard', face: 'glasses', eyes: 'glow', hair: 'short', mouth: 'frown' }, mainhand: 'quill', offhand: 'book', extras: ['scarf'],
      aura: { kind: 'smoke', color: '#7a4ab0' } },
    gary: { base: 'humanoid', scale: 1.5, build: 'huge', outfit: 'rags',
      palette: P({ skin: '#9fbf8a', cloth: '#4a3c30', cloth2: '#2e2a26', hair: '#1c1c1c', metal: '#8f969e', eye: '#ffe14a', accent: '#9fd0ff' }),
      head: { hair: 'short', eyes: 'sleepy', mouth: 'frown' }, extras: ['belt'], aura: { kind: 'sparkles', color: '#9fd0ff' }, overlay: garyOverlay },
    coil: { base: 'custom', scale: 0.9, height: 42, width: 20, headY: -35, palette: P({ metal: '#8b8f96', accent: '#7fd8ff', skin: '#c87a3a' }), draw: coilDraw },
  };
  SPR.gargoyleStone.a2Stone = true;

  /**
   * Swap the gargoyle's look when it hardens / wakes, in step with the animation (vis is render-only). `stone`: the
   * state to show (default: whether it has Stone Form now).
   */
  function stoneLook(unit, stone) {
    if (stone === undefined) stone = has(unit, 'a2_stoneform');
    if (!!unit.data.a2StoneLook === stone) return;
    unit.data.a2StoneLook = stone;
    DD.FX.call(function () { if (unit.vis) unit.vis.sprite = stone ? SPR.gargoyleStone : null; });
  }

  function intro(unit, chance) { const s = S(); if (s && s.round === 0) A().maybeBark(unit, 'spawn', chance); }

  // =====================================================================================================
  // Skeleton Intern (minion) — reassembles unless finished properly
  // =====================================================================================================
  eskill({ id: 'a2_intern_papercut', name: 'Paper Cut', icon: '📄', kind: 'attack', tags: ['melee', 'objects'], anchor: 'self',
    levels: [{ dmg: 5, bleed: 2 }], target: { type: 'dir' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage and Bleed ' + L.bleed + ' to the unit on the adjacent tile (objects there take the damage too).'; },
    flavor: 'Death by a thousand memos.',
    execute: function (ctx) {
      lunge(ctx);
      say(ctx);
      strike(ctx, ctx.L.dmg, { objects: true }).forEach(function (u) { if (active(u)) A().addStatus(u, 'bleed', { stacks: ctx.L.bleed }, ctx.user); });
    } });

  eskill({ id: 'a2_intern_coffee', name: 'Coffee Run', icon: '🥤', kind: 'attack', tags: ['ranged'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 4 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: false },
    desc: function (L) { return 'Lob a scalding coffee at a foe up to 5 tiles away (over obstacles): ' + L.dmg + ' damage.'; },
    flavor: 'You ordered a flat white. You got a flat hit.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      DD.FX.projectile(ctx.user, u, { kind: 'flask', color: '#7a4a24', arc: true });
      say(ctx);
      A().damage(ctx.user, u, ctx.L.dmg);
    } });

  DD.registerEnemy({ id: 'a2_skeleton_intern', name: 'Skeleton Intern', act: 2, tier: 'minion', hp: 13, mov: 4, armor: 0, init: 1,
    tags: ['undead', 'skeleton'], flags: {}, resist: { poison: 0 },
    sprite: SPR.intern, skills: ['a2_intern_papercut', 'a2_intern_coffee'], ai: { style: 'melee' }, xp: 2, gold: [1, 2],
    passive: { icon: '🦴', name: 'Reassembles', desc: 'Dies into a Bone Pile that stands back up at half HP at the end of the next round (the same round while a ' +
      'Necromancer TA stands). Fire, holy damage, a fall, a hero stepping on the pile or a Smash end it for good. On its turn it walks up ' +
      'and Paper Cuts, or lobs a Coffee Run from afar.' },
    hooks: {
      onCombatStart: function (unit) { intro(unit, 0.15); },
      onDeath: function (unit, d) {
        if (d.cause === 'fall') return;   // YEETED: nothing left to reassemble
        if (d.element === 'fire' || d.element === 'holy') {
          DD.FX.text(unit, d.element === 'fire' ? 'Cremated!' : 'Laid to rest!', { color: '#ffe08a', size: 15 });
          A().log(unit.name + ' is finished properly. HR will send flowers.', 'kill');
          return;
        }
        let tile = G().tile(unit.x, unit.y);
        if (!tile || G().isDrop(tile.x, tile.y) || (tile.obj && tile.obj.id !== 'bones')) {
          tile = G().neighbors(unit.x, unit.y).filter(function (t) { return !t.obj && G().isWalkable(t.x, t.y) && !G().isDrop(t.x, t.y); })[0] || null;
        }
        if (!tile) return;
        A().placeObject(tile.x, tile.y, PILE, { data: { timer: 2, times: unit.data.reassembled || 0 } });
        DD.FX.text(tile, 'Falls apart...', { color: '#ece4cf', size: 14 });
        A().log(unit.name + ' collapses into a Bone Pile. It looks... temporary.', 'kill');
      },
    },
    barks: {
      spawn: ['Is this... paid?', 'First day! Where do I put my bones?', 'I\'m just here for the experience.'],
      attack: ['Per my last memo!', 'Paper cut! Very professional!', 'Sorry, I was told to do this.'],
      hurt: ['My femur! That\'s company property!', 'Ow! Is there dental?', 'I\'ll file a complaint. In triplicate.'],
      death: ['Taking my fifteen.', 'I\'ll be back after lunch.', 'This isn\'t the end of my internship!'],
      reassemble: ['I\'m back! Did I miss the meeting?', 'Clocking back in!', 'Still unpaid. Still here.'],
    },
    desc: 'Reassembles: it leaves a Bone Pile that stands back up at half HP at the end of the next round. Walk over or Smash the pile, ' +
      'or finish it with fire, holy damage or a fall. Paid in exposure, which, for a skeleton, is mostly sunburn.' });

  // =====================================================================================================
  // Zombie (Unpaid) — grab / root
  // =====================================================================================================
  eskill({ id: 'a2_zombie_overtime', name: 'Unpaid Overtime', icon: '🧟', kind: 'attack', tags: ['melee', 'objects'], anchor: 'self',
    levels: [{ dmg: 7 }], target: { type: 'dir' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the unit on the adjacent tile (objects there take the damage too).'; },
    flavor: 'Three hundred years, no raise, no weekends, one very long lunch break.',
    execute: function (ctx) { lunge(ctx); say(ctx); strike(ctx, ctx.L.dmg, { objects: true }); } });

  // v2: the grab is pull + Root (its 4 damage went: one verb, one rider). The bite comes on the zombie's next turn.
  eskill({ id: 'a2_zombie_grab', name: 'Grabby Hands', icon: '✋', kind: 'attack', tags: ['ranged', 'pull', 'root'], anchor: 'unit', cooldown: 2,
    levels: [{ pull: 3, turns: 1 }], target: { type: 'unit', range: [2, 4], filter: 'enemy', los: true, straight: true },
    desc: function (L) { return 'Yank a foe 2-4 tiles away in a straight line up to ' + L.pull + ' tiles toward it and Root it (it can\'t move on its next turn).'; },
    flavor: 'The new hire is always the first to be grabbed for a "quick task".',
    aiScore: function (ctx) { const t = ctx.targetUnit; return !t || DD.Act.isImmovable(t) ? -50 : 2; },
    execute: function (ctx) {
      const u = ctx.targetUnit, user = ctx.user;
      if (!active(u) || !active(user) || !G().hostile(user, u)) return;
      DD.FX.beam(user, u, { color: '#93ad7c', width: 3 });
      say(ctx, 0.35);
      A().pull(user, u, user, ctx.L.pull);
      if (active(u)) A().addStatus(u, 'root', { turns: ctx.L.turns }, user);
    } });

  DD.registerEnemy({ id: 'a2_zombie_unpaid', name: 'Zombie (Unpaid)', act: 2, tier: 'normal', hp: 28, mov: 3, armor: 0, init: -2,
    tags: ['undead', 'zombie'], flags: {}, resist: { fire: 1.5, poison: 0 },
    sprite: SPR.zombie, skills: ['a2_zombie_overtime', 'a2_zombie_grab'], ai: { style: 'melee' }, xp: 5, gold: [2, 4],
    passive: { icon: '✋', name: 'Grab, Then Bite', desc: 'On its turn it bites a hero next to it (7). A hero 2-4 tiles away in a straight line gets yanked ' +
      'toward it and Rooted instead, so the bite comes next turn. Slow (move 3), weak to fire.' },
    hooks: { onCombatStart: function (unit) { intro(unit, 0.15); } },
    barks: {
      spawn: ['Brainsss... and dental...', 'Clock... in...', 'Shift... starts... now...'],
      attack: ['Overtime...', 'Grab... the new guy...', 'Mandatory... team building...'],
      hurt: ['Not... the... face...', 'Workers\'... comp...', 'Ow. Probably.'],
      death: ['Finally... a... day... off...', 'Tell HR... I quit...', 'Weekend... at last...'],
    },
    desc: 'Slow, but Grabby Hands yanks a hero 2-4 tiles away (in a straight line) next to it and Roots it; the bite follows. Weak to fire. ' +
      'Has worked here for 300 years without a raise and no longer remembers what weekends are.' });

  // =====================================================================================================
  // Cultist of the Forbidden Brunch — heals with mimosas, summons Hollandaise Horrors
  // =====================================================================================================
  eskill({ id: 'a2_cultist_mimosa', name: 'Bottomless Mimosa', icon: '🥂', kind: 'heal', tags: ['heal'], anchor: 'unit', cooldown: 1,
    levels: [{ heal: 8 }], target: { type: 'unit', range: [0, 4], filter: 'allyOrSelf', los: true },
    desc: function (L) { return 'Heal an ally (or itself) for ' + L.heal + ' HP.'; },
    flavor: 'Bottomless, like the cult\'s commitment to day-drinking.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      if (u !== ctx.user) DD.FX.projectile(ctx.user, u, { kind: 'flask', color: '#ffb347', arc: true });
      DD.FX.particles(u, { kind: 'bubbles', color: '#ffe9a0', count: 10 });
      A().heal(ctx.user, u, ctx.L.heal);
    } });

  eskill({ id: 'a2_cultist_latte', name: 'Scalding Latte', icon: '☕', kind: 'attack', tags: ['ranged', 'fire'], anchor: 'unit',
    levels: [{ dmg: 7, burn: 2 }], target: { type: 'unit', range: [1, 4], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to a foe up to 4 tiles away and Burn ' + L.burn + '.'; },
    flavor: 'Extra hot, oat milk, served directly to the face.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      DD.FX.projectile(ctx.user, u, { kind: 'flask', color: '#8a5a35', arc: true });
      say(ctx);
      A().damage(ctx.user, u, ctx.L.dmg, { element: 'fire' });
      if (active(u)) A().addStatus(u, 'burn', { stacks: ctx.L.burn }, ctx.user);
    } });

  eskill({ id: 'a2_cultist_summon', name: 'Brunch Is Served', icon: '🍳', kind: 'summon', tags: ['summon'], anchor: 'ground', cooldown: 3, charges: 2,
    levels: [{ n: 1 }], target: { type: 'tile', range: [1, 2], filter: 'empty' },
    desc: function () { return 'Summon a Hollandaise Horror on an empty tile 1-2 tiles away (twice per fight). It acts from the next round.'; },
    flavor: 'The sauce broke. The sauce is now a guest.',
    execute: function (ctx) {
      const p = ctx.target;
      if (!p) return;
      DD.FX.particles(p, { kind: 'bubbles', color: '#f3cf45', count: 14 });
      const u = A().spawn('a2_hollandaise', p.x, p.y, {});
      if (u) A().log(ctx.user.name + ' serves a Hollandaise Horror. Nobody ordered it.', 'enemy');
    } });

  DD.registerEnemy({ id: 'a2_brunch_cultist', name: 'Cultist of the Forbidden Brunch', act: 2, tier: 'normal', hp: 26, mov: 3, armor: 0, init: 0,
    tags: ['human', 'cultist'], flags: {}, resist: {},
    sprite: SPR.cultist, skills: ['a2_cultist_mimosa', 'a2_cultist_latte', 'a2_cultist_summon'], ai: { style: 'support' }, xp: 5, gold: [3, 5],
    passive: { icon: '🥂', name: 'Brunch Host', desc: 'On its turn it heals the most hurt ally with a Bottomless Mimosa (8), serves a Hollandaise Horror ' +
      '(twice per fight) or throws a Scalding Latte, keeping near its friends and out of melee.' },
    hooks: { onCombatStart: function (unit) { intro(unit, 0.2); } },
    barks: {
      spawn: ['Welcome to Brunch. You may never leave.', 'Mimosa? It\'s mandatory.', 'Have you accepted Eggs Benedict?'],
      attack: ['Careful, it\'s hot!', 'Brunch waits for no one!', 'You\'re not on the reservation list!'],
      hurt: ['You spilled my mimosa!', 'This is a brunch, not a battle!', 'I\'d like to speak to your server!'],
      death: ['Tell the Benedict... I tried...', 'My table... is... ready...', 'Bottomless... like... this... pit...'],
    },
    desc: 'Heals allies with Bottomless Mimosas (8 HP) and serves Hollandaise Horrors. Kill it first or the brunch never ends. ' +
      'Brunch is a sacrament. Reservations are mandatory. The waitlist is eternal.' });

  eskill({ id: 'a2_hollandaise_slap', name: 'Sauce Slap', icon: '🧈', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 5 }], target: { type: 'dir' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the unit on the adjacent tile.'; },
    flavor: 'Rich, buttery, and violent.',
    execute: function (ctx) { lunge(ctx); say(ctx); strike(ctx, ctx.L.dmg); } });

  DD.registerEnemy({ id: 'a2_hollandaise', name: 'Hollandaise Horror', act: 2, tier: 'minion', hp: 12, mov: 4, armor: 0, init: 1,
    tags: ['ooze', 'brunch'], flags: {}, resist: { fire: 1.5 },
    sprite: SPR.hollandaise, skills: ['a2_hollandaise_slap'], ai: { style: 'melee' }, xp: 1, gold: [0, 1],
    passive: { icon: '🧈', name: 'Broken Sauce', desc: 'Dies into a flammable oil slick (radius 1): bring fire. On its turn it oozes up and slaps.' },
    hooks: {
      onDeath: function (unit, d) {
        if (d.cause === 'fall') return;
        A().splash(unit.x, unit.y, 1, 'oil', 4, d.credit || null);
        A().log('The Hollandaise Horror splits into a buttery, very flammable slick.', 'system');
      },
    },
    barks: {
      spawn: ['*bloop*', '*angry sauce noises*', 'BLORP.'],
      attack: ['*splorch*', 'SAUCE!', '*buttery menace*'],
      hurt: ['*splat*', '*curdles*'],
      death: ['*the sauce has split*', '*sad bloop*'],
    },
    desc: 'Leaves a flammable butter slick (oil, radius 1) when it dies. Bring fire. The sauce broke, and now it wants to break you.' });

  // =====================================================================================================
  // Will-o'-the-Wisp — teleports, chain lightning, Lure
  // =====================================================================================================
  eskill({ id: 'a2_wisp_zap', name: 'Swamp Gas Zap', icon: '⚡', kind: 'spell', tags: ['ranged', 'lightning', 'chain'], anchor: 'unit',
    aiScore: hoverScore,
    levels: [{ dmg: 6, jumps: 2, reach: 2 }], target: { type: 'unit', range: [1, 6], filter: 'enemy', los: true },
    area: { shape: 'custom', fn: chainTiles },
    desc: function (L) { return 'Deal ' + L.dmg + ' lightning damage to the target, then the bolt jumps to the nearest other unit within ' + L.reach + ' tiles, up to ' + L.jumps + ' times (friend or foe).'; },
    flavor: 'It\'s not a hazard, it\'s a light show. Spread out.',
    execute: function (ctx) {
      const user = ctx.user;
      let prev = user;
      say(ctx);
      (ctx.tiles || []).forEach(function (p, i) {
        DD.FX.beam(prev, p, { kind: 'lightning', color: '#b8ffd8', width: 3, parallel: i > 0 });
        const u = G().unitAt(p.x, p.y);
        if (active(u) && u !== user) A().damage(user, u, ctx.L.dmg, { element: 'lightning' });
        prev = p;
      });
    } });

  /** Damage a hero would take from being swapped onto the wisp's tile: a fall (pit, deep water: 25% max HP) or lava (8). */
  function lureValue(wisp, target) {
    if (!wisp || !target) return 0;
    if (G().isDrop(wisp.x, wisp.y)) return Math.max(1, Math.ceil(target.maxHp * 0.25));
    const t = G().tile(wisp.x, wisp.y);
    if (t && G().terrain(t).liquid === 'lava') return 8;
    return 0;
  }
  /** A tile the wisp likes to end its turn over: a pit, deep water or lava (its next turn's Lure). */
  function lureSpot(x, y) {
    const t = G().tile(x, y);
    return !!t && (G().isDrop(x, y) || G().terrain(t).liquid === 'lava');
  }
  function lureSoon(u) {
    const sl = DD.Combat.slotsOf(u).filter(function (s) { return s.id === 'a2_wisp_lure'; })[0];
    return !!sl && (sl.cd || 0) <= 1;
  }
  /** Zap aiScore: zap from over a pit / deep water / lava when the Lure is ready next turn (bestAttack scores each spot). */
  function hoverScore(ctx) { return ctx.user && lureSpot(ctx.user.x, ctx.user.y) && lureSoon(ctx.user) ? 2 : 0; }
  eskill({ id: 'a2_wisp_lure', name: 'Lure', icon: '🏮', kind: 'spell', tags: ['teleport', 'swap'], anchor: 'unit', cooldown: 3,
    levels: [{ r: 4 }], target: { type: 'unit', range: [1, 4], filter: 'enemy', los: false },
    desc: function (L) { return 'Swap places with a foe up to ' + L.r + ' tiles away: it lands where the wisp was hovering (pits and deep water included). Fails on immovable units.'; },
    flavor: '"Follow the pretty light," said every bog to every bard.',
    aiScore: function (ctx) {
      const t = ctx.targetUnit;
      if (!t || DD.Act.isImmovable(t)) return -50;
      const v = lureValue(ctx.user, t);
      return v > 0 ? 14 + v : -20;
    },
    execute: function (ctx) {
      const user = ctx.user, t = ctx.targetUnit;
      if (!active(user) || !active(t) || !G().hostile(user, t)) return;
      if (DD.Act.isImmovable(t)) { DD.FX.text(t, 'Won\'t budge!', { color: '#dddddd', size: 15 }); A().log(t.name + ' ignores the pretty light.', 'status'); return; }
      DD.FX.beam(user, t, { color: '#c8ffe0', width: 2 });
      A().log(t.name + ' follows the pretty light...', 'enemy');
      say(ctx, 0.5);
      A().swap(user, t, { src: user });
    } });

  /**
   * Its turn: hovering over a pit / deep water / lava with Lure ready → lure a hero within 4 into it (no blink first).
   * Otherwise blink into zap range (preferring to end over such a tile, so next turn's Lure is a threat you can see) and
   * zap; nobody in reach → drift closer.
   */
  function wispPlan(unit, api) {
    const start = { x: unit.x, y: unit.y };
    if (api.canUse(unit, 'a2_wisp_lure') && lureSpot(unit.x, unit.y)) {
      const lure = api.bestAttack(unit, { skills: ['a2_wisp_lure'], noMove: true });
      if (lure && lure.actionScore >= 10 && fire(unit, api, lure)) return;
    }
    if (!canAct(unit)) return;
    if (api.canUse(unit, 'a2_wisp_zap') && go(unit, api, api.bestAttack(unit, { skills: ['a2_wisp_zap'] }), { blink: true })) return;
    if (canAct(unit) && !movedFrom(unit, start)) closeIn(unit, api, 3, true);
  }

  DD.registerEnemy({ id: 'a2_wisp', name: 'Will-o\'-the-Wisp', act: 2, tier: 'normal', hp: 24, mov: 4, armor: 0, init: 3,
    tags: ['fey', 'spirit'], flags: { flying: true }, resist: { lightning: 0, poison: 0, frost: 1.5 },
    sprite: SPR.wisp, skills: ['a2_wisp_zap', 'a2_wisp_lure'], ai: wispPlan, aiStyle: { style: 'ranged', keepDistance: 3 }, xp: 5, gold: [2, 5],
    passive: { icon: '🏮', name: 'Follow the Pretty Light', desc: 'Teleports instead of walking and likes to hover over pits and deep water. If its turn ' +
      'starts over one with Lure ready, it swaps a hero within 4 tiles into it; otherwise it zaps. The zap chains to the nearest unit within 2, twice: spread out.' },
    hooks: { onCombatStart: function (unit) { intro(unit, 0.2); } },
    barks: {
      spawn: ['Follow meeee!', 'Pretty, isn\'t it?', 'This way to treasure! Probably!'],
      attack: ['Zap! Spread out next time!', 'Shocking, isn\'t it?', 'Bzzzt!'],
      hurt: ['You can\'t hurt a feeling!', 'Flicker!', 'Ow, my glow!'],
      death: ['The light... was a lie...', '*fizzles out*', 'Don\'t follow... other... lights...'],
    },
    desc: 'Teleports instead of walking. Swamp Gas Zap chains to the nearest unit within 2 tiles, twice: spread out. Lure swaps it with a hero, ' +
      'so never end your turn within 4 tiles of a wisp hovering over a pit or deep water. Immune to lightning. Has a 0% success rate as a life coach.' });

  // =====================================================================================================
  // Owlbear Cub — charge
  // =====================================================================================================
  eskill({ id: 'a2_cub_charge', name: 'Cub Charge', icon: '🐻', kind: 'attack', tags: ['melee', 'charge', 'push'], anchor: 'self', cooldown: 2,
    levels: [{ dmg: 8, len: 4, push: 1 }], target: { type: 'dir' }, area: { shape: 'custom', fn: chargeTiles },
    desc: function (L) { return 'Charge up to ' + L.len + ' tiles in a straight line, stop at the first foe and deal ' + L.dmg + ' damage to it, pushing it ' + L.push + ' tile.'; },
    flavor: 'Half owl, half bear, all momentum.',
    aiScore: function (ctx) { return DD.Act.cantMove(ctx.user) ? -50 : 0; },
    execute: doCharge });

  eskill({ id: 'a2_cub_nibble', name: 'Overexcited Nibble', icon: '🦷', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 6 }], target: { type: 'dir' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the unit on the adjacent tile.'; },
    flavor: 'Teething. On you.',
    execute: function (ctx) { lunge(ctx); say(ctx); strike(ctx, ctx.L.dmg); } });

  /** Its turn: a foe in a straight line from where it stands → CHARGE (no walk first); otherwise walk up and nibble. */
  function cubPlan(unit, api) {
    const melee = { style: 'melee', keepDistance: 0 }, start = { x: unit.x, y: unit.y };
    if (api.canUse(unit, 'a2_cub_charge') && fire(unit, api, api.bestAttack(unit, { skills: ['a2_cub_charge'], noMove: true, style: melee }))) return;
    if (!canAct(unit)) return;
    if (api.canUse(unit, 'a2_cub_nibble') && go(unit, api, api.bestAttack(unit, { skills: ['a2_cub_nibble'], style: melee }), { style: melee })) return;
    if (canAct(unit) && !movedFrom(unit, start)) closeIn(unit, api, 1);
  }

  DD.registerEnemy({ id: 'a2_owlbear_cub', name: 'Owlbear Cub', act: 2, tier: 'normal', hp: 26, mov: 4, armor: 0, init: 2,
    tags: ['beast', 'owlbear'], flags: {}, resist: {},
    sprite: SPR.cub, skills: ['a2_cub_charge', 'a2_cub_nibble'], ai: cubPlan, aiStyle: 'melee', xp: 5, gold: [2, 4],
    passive: { icon: '🐻', name: 'Straight-Line Hugger', desc: 'On its turn it charges a hero in a straight line up to 4 tiles from where it stands ' +
      '(stopped by walls, pits, objects and its friends). Nobody in line: it walks up and nibbles. End your turn off its lines.' },
    hooks: {
      onCombatStart: function (unit) { intro(unit, 0.2); },
      onDeath: function (unit, d) { unit.data.killerId = d.credit && d.credit !== unit ? d.credit.id : null; },
    },
    barks: {
      spawn: ['Hoo-rawr!', '*adorable growl*', 'Mommy, new toys!'],
      attack: ['HUG TIME!', 'Hoo hoo CHARGE!', '*playful mauling*'],
      hurt: ['MOMMY!', '*sad hoot*', 'Waaah!'],
      death: ['Mommy... avenge... hoo...', '*final tiny hoot*', 'Nap... time...'],
    },
    desc: 'Cub Charge barrels up to 4 tiles in a straight line from where it stands into the first foe. Stand off its lines, or put something in the way. ' +
      'Its mother is never far away. Do not make eye contact. Do not boop.' });

  // =====================================================================================================
  // Banshee (Wants to Speak to the Manager) — wind-up cone stun
  // =====================================================================================================
  // v2: no wind-up (normal enemies don't telegraph), so the cone shrank from 3 tiles to 2 and she screams from where she floats
  eskill({ id: 'a2_banshee_scream', name: 'Speak to the Manager', icon: '📢', kind: 'spell', tags: ['aoe', 'stun', 'cone'], anchor: 'self', cooldown: 3,
    levels: [{ dmg: 6, len: 2, turns: 1 }], target: { type: 'dir' }, area: { shape: 'cone', size: function (L) { return L.len; } },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to foes in a ' + L.len + '-tile cone and Stun them (they lose their next turn).'; },
    flavor: 'She has been on hold since the Bronze Age.',
    execute: function (ctx) {
      const user = ctx.user;
      DD.FX.particles(user, { kind: 'smoke', color: '#bfe0ff', count: 16 });
      (ctx.tiles || []).forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'pulse', { color: '#bfe0ff', parallel: i > 0 }); });
      DD.FX.shake(5, 280);
      DD.FX.sound('roar');
      say(ctx, 0.6);
      strike(ctx, ctx.L.dmg, { foesOnly: true }).forEach(function (u) { if (active(u)) A().addStatus(u, 'stun', { turns: ctx.L.turns }, user); });
    } });

  eskill({ id: 'a2_banshee_review', name: 'One-Star Review', icon: '⭐', kind: 'attack', tags: ['ranged', 'weak'], anchor: 'unit',
    levels: [{ dmg: 7, turns: 1 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe up to 5 tiles away and Weaken it (25% less damage on its next turn).'; },
    flavor: '"Terrible service. The adventurers fought back. Would not haunt again."',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      DD.FX.projectile(ctx.user, u, { kind: 'note', color: '#bfe0ff' });
      say(ctx);
      A().damage(ctx.user, u, ctx.L.dmg);
      if (active(u)) A().addStatus(u, 'weak', { turns: ctx.L.turns }, ctx.user);
    } });

  function screamSoon(u) {
    const sl = DD.Combat.slotsOf(u).filter(function (s) { return s.id === 'a2_banshee_scream'; })[0];
    return !!sl && (sl.cd || 0) <= 1;
  }
  /**
   * Her turn: heroes in her cone from where she floats → she screams (no move first). Otherwise she floats in and leaves
   * a One-Star Review: to 2 tiles from a hero while her voice is ready (next turn's scream), else 3.
   */
  function bansheePlan(unit, api) {
    const start = { x: unit.x, y: unit.y };
    if (api.canUse(unit, 'a2_banshee_scream') && fire(unit, api, api.bestAttack(unit, { skills: ['a2_banshee_scream'], noMove: true, style: { style: 'melee', keepDistance: 0 } }))) return;
    if (!canAct(unit)) return;
    const style = { style: 'ranged', keepDistance: screamSoon(unit) ? 2 : 3 };
    if (api.canUse(unit, 'a2_banshee_review') && go(unit, api, api.bestAttack(unit, { skills: ['a2_banshee_review'], style: style }), { style: style })) return;
    if (canAct(unit) && !movedFrom(unit, start)) closeIn(unit, api, style.keepDistance);
  }

  DD.registerEnemy({ id: 'a2_banshee', name: 'Banshee (Wants to Speak to the Manager)', act: 2, tier: 'normal', hp: 26, mov: 4, armor: 0, init: 1,
    tags: ['undead', 'spirit'], flags: { flying: true }, resist: { poison: 0, holy: 1.5 },
    sprite: SPR.banshee, skills: ['a2_banshee_scream', 'a2_banshee_review'], ai: bansheePlan, aiStyle: { style: 'ranged', keepDistance: 2 }, xp: 6, gold: [3, 5],
    passive: { icon: '📢', name: 'Wants the Manager', desc: 'On her turn she screams at every hero in her 2-tile cone from where she floats (6 + Stun, ' +
      'cooldown 3). Otherwise she floats up to 2-3 tiles from a hero and leaves a One-Star Review. Do not end your turn next to her.' },
    hooks: { onCombatStart: function (unit) { intro(unit, 0.35); } },
    barks: {
      spawn: ['I\'d like to speak to the manager.', 'Excuse me. EXCUSE ME.', 'Is this how you treat customers?'],
      attack: ['One star!', 'I have been waiting for 300 years!', 'I want a FULL refund!'],
      hurt: ['How DARE you!', 'I\'m writing this down!', 'Do you know who I WAS?'],
      death: ['I\'ll be back... with my lawyer...', 'This store... has no... manager...', 'Worst... afterlife... ever...'],
    },
    desc: 'Screams for the manager from where she floats: a 2-tile cone that Stuns. Keep 3 tiles away when her voice is ready, or Silence her (it is a spell). ' +
      'Died in line at a returns desk. Still in line.' });

  // =====================================================================================================
  // Gargoyle — dive, then stone form
  // =====================================================================================================
  eskill({ id: 'a2_gargoyle_dive', name: 'Gutter Dive', icon: '🌧️', kind: 'attack', tags: ['aoe', 'leap'], anchor: 'unit',
    aiScore: leapRoom,
    levels: [{ dmg: 8 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: false }, area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Swoop at a foe up to 5 tiles away: land on a free tile next to it and deal ' + L.dmg + ' damage to it and every foe next to it (no free tile: no dive).'; },
    flavor: 'Hired as a rain gutter. Promoted to "menace".',
    execute: function (ctx) {
      const user = ctx.user, tgt = ctx.target;
      if (!active(user) || !tgt) return;
      if (DD.Act.cantMove(user)) { DD.FX.text(user, 'Stuck!', { color: '#9fdc7a', size: 14 }); A().log(user.name + ' strains against its roots and dives nowhere.', 'status'); return; }
      // land on the free tile next to the target that is closest to the gargoyle (or stay, if already there)
      const land = DIRS.map(function (d) { return { x: tgt.x + d.x, y: tgt.y + d.y }; })
        .filter(function (p) { return (p.x === user.x && p.y === user.y) || landable(p.x, p.y, user); })
        .sort(function (a, b) { return dist(a, user) - dist(b, user) || a.y - b.y || a.x - b.x; })[0];
      if (!land) { DD.FX.text(user, 'No room to land!', { color: '#dddddd', size: 14 }); A().log(user.name + ' circles, finds no room to land, and sulks.', 'status'); return; }
      if (land.x !== user.x || land.y !== user.y) {
        const from = { x: user.x, y: user.y };
        A().teleport(user, land.x, land.y, { fx: false });
        DD.FX.jump(user, from, land);
      }
      if (!active(user)) return;
      DD.FX.explosion(tgt, { radius: 1, color: '#9aa4b4' });
      DD.FX.shake(5, 260);
      say(ctx, 0.3);
      strike(ctx, ctx.L.dmg, { foesOnly: true });
    } });

  eskill({ id: 'a2_gargoyle_stone', name: 'Stone Form', icon: '🗿', kind: 'buff', tags: ['stone'], anchor: 'self',
    levels: [{ turns: 1 }], target: { type: 'self' },
    desc: function () { return 'Turn to stone until the end of its next turn: takes 75% less damage and does nothing on that turn.'; },
    flavor: 'Not sleeping. Load-bearing.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      if (A().addStatus(u, 'a2_stoneform', { turns: ctx.L.turns }, u)) {
        stoneLook(u);
        A().maybeBark(u, 'stone', 0.4);
        A().log(u.name + ' turns to stone. A pigeon lands on it immediately.', 'enemy');
      }
    } });

  /**
   * Its turn: a statue does nothing. Otherwise it dives on a hero within 5 tiles of its perch (no walk first) and turns
   * to stone right after; nobody in reach → it walks closer.
   */
  function gargoylePlan(unit, api) {
    stoneLook(unit);
    if (has(unit, 'a2_stoneform')) { DD.FX.text(unit, '🗿 ...', { color: '#c8ccd4', size: 14 }); return; }
    if (api.canUse(unit, 'a2_gargoyle_dive') && !DD.Act.cantMove(unit) &&
        fire(unit, api, api.bestAttack(unit, { skills: ['a2_gargoyle_dive'], noMove: true, style: { style: 'melee', keepDistance: 0 } }))) {
      if (canAct(unit) && api.canUse(unit, 'a2_gargoyle_stone')) api.act(unit, 'a2_gargoyle_stone', unit, {});
      return;
    }
    if (canAct(unit)) closeIn(unit, api, 3);
  }

  DD.registerEnemy({ id: 'a2_gargoyle', name: 'Gargoyle', act: 2, tier: 'normal', hp: 28, mov: 3, armor: 1, init: -1,
    tags: ['construct', 'stone'], flags: {}, resist: { poison: 0 },
    sprite: SPR.gargoyle, skills: ['a2_gargoyle_dive', 'a2_gargoyle_stone'], ai: gargoylePlan, aiStyle: 'melee', xp: 6, gold: [3, 5],
    passive: { icon: '🗿', name: 'Swoop, Then Statue', desc: 'On its turn it dives on a hero within 5 tiles of where it perches (8 to it and every hero ' +
      'next to it), then turns to stone until the end of its next turn: 75% less damage, and that turn it does nothing. Hit it while it is flesh.' },
    hooks: {
      onCombatStart: function (unit) { intro(unit, 0.15); },
      onRoundStart: function (unit) { stoneLook(unit); },
      // the 'turnEnd' decay right after this hook ends Stone Form unless it was put on during this very turn
      onTurnEnd: function (unit) {
        const st = DD.Act.getStatus(unit, 'a2_stoneform');
        stoneLook(unit, !!st && (st.turns < 0 || st.turns > 1 || !!st.fresh));
      },
    },
    barks: {
      spawn: ['...', '*grinding stone*', 'You\'re standing in my rain.'],
      attack: ['SPLASH ZONE!', 'Gutter ball!', 'Incoming downpour!'],
      hurt: ['Chipped!', 'That\'s ARCHITECTURE!', 'I\'m load-bearing!'],
      death: ['*crumbles into gravel*', 'Finally... a demolition permit...', 'Tell the pigeons... I\'m sorry...'],
      stone: ['*becomes extremely still*', 'I\'m a statue now. Move along.'],
    },
    desc: 'Swoops down next to a hero within 5 tiles (hitting it and every hero next to it), then turns to stone until the end of its next turn: ' +
      '75% less damage, no attacks. Hit it while it\'s flesh, or shove the statue into a pit. The pigeons consider it their landlord.' });

  // =====================================================================================================
  // Pixie Swarm — dazzle, swarm
  // =====================================================================================================
  eskill({ id: 'a2_pixie_glitter', name: 'Glitter Bomb', icon: '✨', kind: 'spell', tags: ['aoe', 'ranged', 'dazzle'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 5, turns: 1 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: false }, area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Throw glitter at a foe up to 5 tiles away: ' + L.dmg + ' damage to it and every foe next to it, and Dazzle them (−1 range on their next turn).'; },
    flavor: 'Glitter is forever. So is this fight, apparently.',
    execute: function (ctx) {
      const tgt = ctx.target;
      if (!tgt) return;
      DD.FX.projectile(ctx.user, tgt, { kind: 'orb', color: '#ff9ce8', arc: true });
      DD.FX.particles(tgt, { kind: 'glitter', count: 22 });
      say(ctx);
      strike(ctx, ctx.L.dmg, { foesOnly: true }).forEach(function (u) { if (active(u)) A().addStatus(u, 'dazzled', { turns: ctx.L.turns }, ctx.user); });
    } });

  eskill({ id: 'a2_pixie_bite', name: 'Tiny Bites', icon: '🧚', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 5 }], target: { type: 'dir' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the unit on the adjacent tile.'; },
    flavor: 'Forty tiny mouths. Forty tiny grudges.',
    execute: function (ctx) { lunge(ctx); say(ctx); strike(ctx, ctx.L.dmg); } });

  function singleTarget(skill) { return !skill || !skill.area || !skill.area.shape || skill.area.shape === 'single'; }

  DD.registerEnemy({ id: 'a2_pixie_swarm', name: 'Pixie Swarm', act: 2, tier: 'normal', hp: 24, mov: 4, armor: 0, init: 4,
    tags: ['fey', 'swarm'], flags: { flying: true }, resist: {},
    sprite: SPR.pixies, skills: ['a2_pixie_glitter', 'a2_pixie_bite'], ai: { style: 'ranged', keepDistance: 2 }, xp: 5, gold: [2, 5],
    passive: { icon: '🧚', name: 'Swarm', desc: 'Single-target skills deal half damage to it; area attacks hit in full. On its turn it throws a Glitter ' +
      'Bomb from 2+ tiles away (every other turn); in between it flies in and bites.' },
    hooks: {
      onCombatStart: function (unit) { intro(unit, 0.2); },
      modifyIncomingDamage: function (d) { if (d.cause === 'skill' && singleTarget(d.skill)) d.mult *= 0.5; },
    },
    barks: {
      spawn: ['GLITTER TIME!', 'A rave in the woods! You\'re invited!', 'Sparkle sparkle STAB!'],
      attack: ['Glitter bomb!', 'Tiny bites! Tiny bites!', 'You look so SHINY now!'],
      hurt: ['Rude!', 'Ow ow ow ow ow!', 'You squished Kevin!'],
      death: ['The rave... is over...', '*sad sparkles*', 'Glitter... is... forever...'],
    },
    desc: 'Swarm: single-target skills deal half damage to it; area attacks hit every pixie at full. Glitter Bomb Dazzles (−1 range). ' +
      'A rave that got out of hand in 1347 and never stopped.' });

  // =====================================================================================================
  // Mama Owlbear (elite) — pounce / maul at once, the ⏳ Stomp is her one wind-up, vendetta
  // =====================================================================================================
  function vendettaScore(ctx) {
    const v = DD.Act.getStatus(ctx.user, 'a2_vendetta');
    return v && (ctx.foes || []).some(function (f) { return f.id === v.source; }) ? 15 : 0;
  }
  /** The attacker-side multiplier DD.AI.intentDmg puts on a wind-up (Weak, Inspired, Empowered, items, difficulty). */
  function teleMult(u) {
    const s = S();
    let m = 1;
    if (has(u, 'weak')) m *= 0.75;
    if (has(u, 'inspired')) m *= 1.25;
    if (has(u, 'empowered')) m *= 1.5;
    if (u.dmgBonus) m *= 1 + u.dmgBonus;
    if (u.side === 'enemy' && s && s.difficulty) m *= s.difficulty.dmg || 1;
    return m;
  }
  /**
   * Wind-up truth for Vendetta (skill.telegraphFlat, added by DD.AI.intentDmg): while the culprit stands in the
   * Stomp's marked tiles, the badge shows what the culprit will take (+50%) instead of the base number.
   */
  function vendettaFlat(unit, intent) {
    const v = unit && intent ? DD.Act.getStatus(unit, 'a2_vendetta') : null;
    const culprit = v && v.source && DD.Combat.byId ? DD.Combat.byId(v.source) : null;
    if (!active(culprit)) return 0;
    const hit = intent.anchor === 'unit' ? intent.unitId === culprit.id :
      DD.AI.intentTiles(unit, intent).some(function (p) { return p.x === culprit.x && p.y === culprit.y; });
    const def = DD.getSkill(intent.skillId), L = def ? DD.skillLevel(def, intent.level || 1) : null;
    if (!hit || !L || !(L.dmg > 0)) return 0;
    const m = teleMult(unit);
    return Math.round(L.dmg * m * 1.5) - Math.round(L.dmg * m);
  }
  eskill({ id: 'a2_mama_maul', name: 'Maul', icon: '🐾', kind: 'attack', tags: ['melee', 'aoe'], anchor: 'self',
    levels: [{ dmg: 12 }], target: { type: 'dir' }, area: { shape: 'row', size: 1 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the 3 tiles in front of her.'; },
    flavor: 'Bedtime is NOW.',
    aiScore: vendettaScore,
    execute: function (ctx) { lunge(ctx); say(ctx); strike(ctx, ctx.L.dmg); } });

  eskill({ id: 'a2_mama_pounce', name: 'Mama\'s Coming', icon: '💢', kind: 'attack', tags: ['melee', 'leap', 'push'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 11, push: 2 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: false },
    desc: function (L) { return 'Pounce on a foe up to 5 tiles away: land on a free tile next to it, deal ' + L.dmg + ' damage and knock it back ' + L.push + ' tiles (no free tile: no pounce).'; },
    flavor: 'Somebody touched the cubs.',
    // +2 on a hero 2+ tiles away: her gap-closer beats walking up for a one-hero Maul (a two-hero Maul still wins)
    aiScore: function (ctx) { return (ctx.targetUnit && dist(ctx.user, ctx.targetUnit) >= 2 ? 2 : 0) + vendettaScore(ctx) + leapRoom(ctx); },
    execute: function (ctx) {
      const user = ctx.user, u = ctx.targetUnit;
      if (!active(user) || !active(u) || !G().hostile(user, u)) return;
      if (DD.Act.cantMove(user)) { DD.FX.text(user, 'Stuck!', { color: '#9fdc7a', size: 14 }); return; }
      // land on the free tile next to the target that is closest to her
      const land = DIRS.map(function (d) { return { x: u.x + d.x, y: u.y + d.y }; })
        .filter(function (p) { return (p.x === user.x && p.y === user.y) || landable(p.x, p.y, user); })
        .sort(function (a, b) { return dist(a, user) - dist(b, user) || a.y - b.y || a.x - b.x; })[0];
      if (!land) { DD.FX.text(user, 'No room to pounce!', { color: '#dddddd', size: 14 }); return; }
      if (land.x !== user.x || land.y !== user.y) {
        const from = { x: user.x, y: user.y };
        A().teleport(user, land.x, land.y, { fx: false });
        DD.FX.jump(user, from, land);
      }
      if (!active(user) || !active(u) || dist(user, u) !== 1) return;
      lunge(ctx, u);
      say(ctx, 0.4);
      A().damage(user, u, ctx.L.dmg);
      if (active(u) && ctx.L.push) A().push(user, u, { x: Math.sign(u.x - user.x), y: Math.sign(u.y - user.y) }, ctx.L.push);
    } });

  eskill({ id: 'a2_mama_stomp', name: 'Earth-Shaking Stomp', icon: '💥', kind: 'attack', tags: ['aoe'], anchor: 'self', cooldown: 3,
    levels: [{ dmg: 13, r: 2 }], target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return '⏳ Wind-up: at the start of her next turn, deal ' + L.dmg + ' damage to every foe within ' + L.r + ' tiles of her. Stun, Sleep, Freeze or Polymorph stop it.'; },
    flavor: 'The whole forest feels it. The cubs think it\'s hilarious.',
    aiScore: vendettaScore, telegraphFlat: vendettaFlat,
    execute: function (ctx) {
      DD.FX.explosion(ctx.user, { radius: ctx.L.r, color: '#a07850' });
      DD.FX.shake(12, 450);
      DD.FX.sound('explosion');
      say(ctx, 0.6);
      strike(ctx, ctx.L.dmg, { foesOnly: true });
    } });

  /** Foes (heroes, their summons) within the Stomp's radius of her: what makes her rear up. */
  function crowd(unit) {
    const r = DD.skillLevel(DD.getSkill('a2_mama_stomp'), 1).r || 2;
    return DD.AI.targetsFor(unit).filter(function (f) { return dist(f, unit) <= r; }).length;
  }
  /**
   * Her turn: a Pounce from where she stands (no walk first) or walk up and Maul, whichever hurts more. Then, with 2+
   * foes within 2 tiles, she winds up the Stomp (her one announced attack): it lands at the start of her next turn.
   */
  function mamaPlan(unit, api) {
    const melee = { style: 'melee', keepDistance: 0 };   // the pounce's reach must not make her hang back like an archer
    const start = { x: unit.x, y: unit.y };
    let best = api.canUse(unit, 'a2_mama_maul') ? api.bestAttack(unit, { skills: ['a2_mama_maul'], style: melee }) : null;
    if (api.canUse(unit, 'a2_mama_pounce') && !DD.Act.cantMove(unit)) {
      // compared on the action alone: the pounce's own leap puts her next to its target anyway
      const p = api.bestAttack(unit, { skills: ['a2_mama_pounce'], noMove: true, style: melee });
      if (p && (!best || p.actionScore > best.actionScore)) best = p;
    }
    if (!go(unit, api, best, { style: melee }) && canAct(unit) && !movedFrom(unit, start)) closeIn(unit, api, 1);
    if (canAct(unit) && api.canUse(unit, 'a2_mama_stomp') && crowd(unit) >= 2) {
      api.windUp(unit, 'a2_mama_stomp', unit, { anchor: 'self', banner: 'Mama Owlbear rears up! Get clear, or Stun her.' });
      A().maybeBark(unit, 'stomp', 0.7);
    }
  }

  DD.registerEnemy({ id: 'a2_mama_owlbear', name: 'Mama Owlbear', act: 2, tier: 'elite', hp: 110, mov: 4, armor: 1, init: 1,
    tags: ['beast', 'owlbear'], flags: { large: true, immovable: true }, resist: {},
    sprite: SPR.mama, skills: ['a2_mama_maul', 'a2_mama_pounce', 'a2_mama_stomp'], ai: mamaPlan, aiStyle: 'melee', xp: 16, gold: [10, 15],
    passive: { icon: '😡', name: 'Mama Bear', desc: 'On her turn she pounces on a hero within 5 tiles of where she stands, or walks up and mauls. With 2+ ' +
      'heroes within 2 tiles she rears up: ⏳ the Stomp lands at the start of her next turn. Kill a cub and she swears a Vendetta on you.' },
    hooks: {
      onCombatStart: function (unit) { intro(unit, 1); },
      onAllyDeath: function (unit, dead) {
        if (!active(unit) || !dead || dead.defId !== 'a2_owlbear_cub') return;
        const killer = dead.data && dead.data.killerId && DD.Combat.byId ? DD.Combat.byId(dead.data.killerId) : null;
        A().bark(unit, 'phase');
        if (!active(killer) || !G().hostile(unit, killer)) return;
        A().addStatus(unit, 'a2_vendetta', { turns: 2 }, killer);
        DD.FX.text(unit, 'VENDETTA: ' + killer.name + '!', { color: '#ff5a3c', size: 17 });
        A().log('Mama Owlbear swears a Vendetta against ' + killer.name + ' (+50% damage to them).', 'enemy');
      },
    },
    barks: {
      spawn: ['*RAWR-HOO* Who touched my babies?', 'Mama\'s here.', 'You picked the wrong cubs.'],
      attack: ['MAMA SMASH!', 'Bedtime! Forever!', 'Who RAISED you?!'],
      hurt: ['You think that hurts? I had TWINS.', 'Grr-HOO!', 'Is that all?'],
      death: ['Kids... eat... your... vegetables...', 'Be... good... cubs...', '*the forest goes very quiet*'],
      phase: ['YOU HURT MY BABY!', 'THAT WAS MY CUB!', 'Oh, you are GROUNDED. Forever.'],
      stomp: ['Mama\'s counting to ONE.', 'Who wants a time-out?', 'Everybody OFF my lawn!'],
    },
    desc: 'Mini-boss, immovable. When heroes crowd her she rears up for the Earth-Shaking Stomp (⏳: it lands at the start of her next turn and hits ' +
      'everything within 2): get clear, or Stun her. Kill one of her cubs and she swears a Vendetta: +50% damage to the killer for her next 2 turns. ' +
      'You were cute at a bear. The bear was cuter.' });

  // =====================================================================================================
  // Necromancer TA (elite) — raise dead, bone walls
  // =====================================================================================================
  eskill({ id: 'a2_ta_redpen', name: 'Red Pen of Doom', icon: '🖍️', kind: 'spell', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 11, turns: 1 }], target: { type: 'unit', range: [1, 6], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe up to 6 tiles away and make it Vulnerable (+25% damage taken) until the end of its next turn.'; },
    flavor: 'See me after class.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      DD.FX.projectile(ctx.user, u, { kind: 'bolt', color: '#e0303a' });
      say(ctx);
      A().damage(ctx.user, u, ctx.L.dmg);
      if (active(u)) A().addStatus(u, 'vulnerable', { turns: ctx.L.turns }, ctx.user);
    } });

  function raiseTiles(ctx) {
    const t = ctx.target, out = [];
    if (!t) return out;
    out.push({ x: t.x, y: t.y });
    const n = (ctx.L && ctx.L.n) || 2;
    G().emptyTilesNear(t.x, t.y, 2).forEach(function (p) {
      if (out.length < n && (p.x !== t.x || p.y !== t.y) && !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y)) out.push(p);
    });
    return out;
  }
  eskill({ id: 'a2_ta_raise', name: 'Raise Dead', icon: '💀', kind: 'summon', tags: ['summon', 'undead'], anchor: 'ground', cooldown: 3, charges: 2,
    levels: [{ n: 2 }], target: { type: 'tile', range: [1, 3], filter: 'empty' }, area: { shape: 'custom', fn: raiseTiles },
    desc: function (L) { return 'Raise ' + L.n + ' Skeleton Interns on empty tiles 1-3 tiles away and stand every Bone Pile back up (twice per fight). They act from the next round.'; },
    flavor: 'Attendance is mandatory. Even for corpses.',
    execute: function (ctx) {
      let n = 0;
      (ctx.tiles || []).forEach(function (p) {
        DD.FX.particles(p, { kind: 'runes', color: '#59e08a', count: 12 });
        if (A().spawn('a2_skeleton_intern', p.x, p.y, { silent: true })) n++;
      });
      let back = 0;
      pileTiles().forEach(function (t) { if (reassemble(t, 'raise')) back++; });
      A().bark(ctx.user, 'raise');
      A().log(ctx.user.name + ' raises ' + n + ' new intern' + (n === 1 ? '' : 's') + (back ? ' and ' + back + ' old one' + (back === 1 ? '' : 's') : '') + '.', 'enemy');
    } });

  function ringAround(ctx) {
    const t = ctx.target;
    return t ? DIRS.map(function (d) { return { x: t.x + d.x, y: t.y + d.y }; }) : [];
  }
  eskill({ id: 'a2_ta_detention', name: 'Detention', icon: '🦴', kind: 'spell', tags: ['wall'], anchor: 'ground', cooldown: 3,
    levels: [{ turns: 2 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: false }, area: { shape: 'custom', fn: ringAround },
    desc: function () { return 'Raise Bone Walls (5 HP, block movement and sight) on the empty tiles around a foe. They crumble at the end of the next round.'; },
    flavor: 'You will sit there and think about what you did.',
    execute: function (ctx) {
      let n = 0;
      (ctx.tiles || []).forEach(function (p) {
        const t = G().tile(p.x, p.y);
        if (!t || t.obj || G().unitAt(p.x, p.y) || !G().isWalkable(p.x, p.y) || G().isDrop(p.x, p.y) || G().hazardAt(p.x, p.y)) return;
        if (A().placeObject(p.x, p.y, 'a2_bone_wall', { data: { turns: ctx.L.turns } })) { n++; DD.FX.tile(p.x, p.y, 'crack'); }
      });
      if (n) {
        DD.FX.particles(ctx.target, { kind: 'dust', color: '#e6dcc2', count: 12 });
        A().log(ctx.user.name + ' assigns Detention: ' + n + ' bone wall' + (n === 1 ? '' : 's') + ' rise.', 'enemy');
        say(ctx, 0.5);
      }
    } });

  /** A tile 1-3 from the TA, 2+ from every foe, where Raise Dead can put its interns (or null). */
  function raiseSpot(unit, api) {
    return G().emptyTilesNear(unit.x, unit.y, 3).filter(function (p) {
      const d = dist(p, unit);
      return d >= 1 && d <= 3 && !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y) && nearestDist(p, api.foes(unit)) >= 2;
    })[0] || null;
  }
  /**
   * His turn: the Red Pen (walking into range first, keeping 2+ tiles away), then one spell if one is ready: Raise Dead
   * when there are Bone Piles or fewer than 2 interns, else Detention on the closest hero within 3.
   */
  function taPlan(unit, api) {
    const style = { style: 'summoner', keepDistance: 2 };
    const start = { x: unit.x, y: unit.y };
    const penned = api.canUse(unit, 'a2_ta_redpen') && go(unit, api, api.bestAttack(unit, { skills: ['a2_ta_redpen'], style: style }), { style: style });
    if (!canAct(unit)) return;
    if (!penned && !movedFrom(unit, start)) {
      closeIn(unit, api, 3);
      if (canAct(unit) && api.canUse(unit, 'a2_ta_redpen')) fire(unit, api, api.bestAttack(unit, { skills: ['a2_ta_redpen'], noMove: true, style: style }));
    }
    if (!canAct(unit)) return;
    const interns = DD.Combat.active('enemy').filter(function (u) { return u.defId === 'a2_skeleton_intern'; }).length;
    if (api.canUse(unit, 'a2_ta_raise') && (pileTiles().length > 0 || interns < 2)) {
      const spot = raiseSpot(unit, api);
      if (spot && api.act(unit, 'a2_ta_raise', spot, {})) return;
    }
    if (api.canUse(unit, 'a2_ta_detention')) {
      const pest = api.foes(unit).filter(function (f) { return dist(f, unit) <= 3; })
        .sort(function (a, b) { return dist(a, unit) - dist(b, unit) || b.hp - a.hp; })[0];
      if (pest) api.act(unit, 'a2_ta_detention', pest, {});
    }
  }

  DD.registerEnemy({ id: 'a2_necro_ta', name: 'Necromancer TA', act: 2, tier: 'elite', hp: 100, mov: 3, armor: 0, init: 0,
    tags: ['human', 'necromancer'], flags: {}, resist: {},
    sprite: SPR.ta, skills: ['a2_ta_redpen', 'a2_ta_raise', 'a2_ta_detention'], ai: taPlan, aiStyle: { style: 'summoner', keepDistance: 2 }, xp: 16, gold: [10, 15],
    passive: { icon: '📚', name: 'Office Hours', desc: 'While he stands, Bone Piles stand back up at the end of the same round. On his turn he Red Pens a ' +
      'hero, then, if ready, raises the dead (twice per fight) or puts the closest hero within 3 tiles in Detention.' },
    hooks: { onCombatStart: function (unit) { intro(unit, 1); } },
    barks: {
      spawn: ['Office hours are by appointment.', 'You\'re late. That\'s a zero.', 'Did anyone even READ the syllabus?'],
      attack: ['See me after class.', 'Minus ten for style.', 'Red pen of DOOM!'],
      hurt: ['I am not paid enough for this!', 'That\'s going on your transcript!', 'Ow! Tenure denied!'],
      death: ['I never... got... tenure...', 'Class... dismissed...', 'Grades... are... final...'],
      raise: ['Interns! Back to work!', 'Attendance is mandatory. Even for corpses.', 'Group project time!'],
    },
    desc: 'Mini-boss. While he stands, Bone Piles reassemble at the end of the same round. Red Pen every turn; Raise Dead adds 2 Skeleton Interns ' +
      'and stands every pile up; Detention walls in whoever gets close. Grading on a curve. The curve is a scythe.' });

  // =====================================================================================================
  // Flesh Golem Gary (elite) — lightning heals him, throws
  // =====================================================================================================
  function throwableAlly(user, preferId) {
    const s = S();
    if (!s || !user) return null;
    const ok = function (o) {
      return active(o) && o !== user && !G().hostile(user, o) && dist(o, user) === 1 && !DD.Act.isImmovable(o) &&
        o.tier !== 'elite' && !DD.Act.isBoss(o) && o.kind !== 'hero';
    };
    const pref = preferId && DD.Combat.byId ? DD.Combat.byId(preferId) : null;
    if (ok(pref)) return pref;
    return s.units.filter(ok)[0] || null;
  }

  eskill({ id: 'a2_gary_clobber', name: 'Clobber', icon: '👊', kind: 'attack', tags: ['melee', 'push'], anchor: 'self',
    levels: [{ dmg: 13, push: 2 }], target: { type: 'dir' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the unit on the adjacent tile and knock it back ' + L.push + ' tiles.'; },
    flavor: 'Gary does not know his own strength. Gary does not know a lot of things.',
    execute: function (ctx) {
      lunge(ctx);
      say(ctx);
      strike(ctx, ctx.L.dmg).forEach(function (u) { if (active(u)) A().push(ctx.user, u, ctx.dir, ctx.L.push); });
    } });

  eskill({ id: 'a2_gary_throw', name: 'Gary Throw', icon: '🪨', kind: 'attack', tags: ['ranged', 'aoe', 'throw'], anchor: 'unit',
    levels: [{ dmg: 11 }], target: { type: 'unit', range: [2, 6], filter: 'enemy', los: false }, area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Hurl an adjacent ally (or a spare limb) at a foe 2-6 tiles away: ' + L.dmg + ' damage to it and every foe next to it. A thrown ally lands beside it.'; },
    flavor: 'Gary has six spare arms. Gary is not sure whose.',
    // he would rather throw a coworker than a spare limb: from a tile next to one (the AI scores each spot it could walk to)
    aiScore: function (ctx) { return ctx.user && throwableAlly(ctx.user) ? 1.5 : 0; },
    execute: function (ctx) {
      const user = ctx.user, tgt = ctx.target;
      if (!active(user) || !tgt) return;
      const ally = throwableAlly(user);
      let landed = false;
      if (ally) {
        const land = [tgt].concat(ctx.tiles || []).filter(function (p) { return landable(p.x, p.y, ally); })[0];
        if (land) {
          const from = { x: ally.x, y: ally.y };
          A().teleport(ally, land.x, land.y, { fx: false });
          DD.FX.jump(ally, from, land);
          A().log('Gary throws ' + ally.name + '. ' + ally.name + ' did not consent.', 'enemy');
          landed = true;
        }
      }
      if (!landed) DD.FX.projectile(user, tgt, { kind: 'bone', color: '#9fbf8a', arc: true });
      DD.FX.explosion(tgt, { radius: 1, color: '#c8b48a' });
      DD.FX.shake(6, 300);
      say(ctx, 0.4);
      strike(ctx, ctx.L.dmg, { foesOnly: true });
    } });

  /** His turn: one attack, the best one: walk up and Clobber, or Gary Throw from range; nothing in reach → lumber closer. */
  function garyPlan(unit, api) {
    const melee = { style: 'melee', keepDistance: 0 };
    const start = { x: unit.x, y: unit.y };
    if (go(unit, api, api.bestAttack(unit, { style: melee }), { style: melee })) return;
    if (!canAct(unit) || movedFrom(unit, start)) return;
    closeIn(unit, api, 1);
    if (canAct(unit)) fire(unit, api, api.bestAttack(unit, { noMove: true, style: melee }));
  }

  // v2: GARY ANGRY is Inspired for good (the old "and a second attack every round" went: one rule, readable numbers)
  DD.registerEnemy({ id: 'a2_gary', name: 'Flesh Golem Gary', act: 2, tier: 'elite', hp: 110, mov: 3, armor: 1, init: -2,
    tags: ['construct', 'flesh'], flags: { large: true, immovable: true }, resist: { fire: 1.5, poison: 0 },
    sprite: SPR.gary, skills: ['a2_gary_clobber', 'a2_gary_throw'], ai: garyPlan, aiStyle: 'melee', xp: 18, gold: [12, 16],
    passive: { icon: '⚡', name: 'IT\'S ALIVE!', desc: 'Lightning heals him instead of hurting. Below half HP: GARY ANGRY (Inspired for good: +25% damage). ' +
      'On his turn he walks up and Clobbers, or throws whatever stands next to him at a hero 2-6 tiles away.' },
    hooks: {
      onCombatStart: function (unit) { intro(unit, 1); },
      modifyIncomingDamage: function (d) {
        if (d.element !== 'lightning') return;
        d.a2Absorb = Math.max(1, Math.round(d.amount * d.mult + d.flat));
        d.mult = 0;
        d.flat = 0;
      },
      onTakeDamage: function (d) {
        const u = d.target;
        if (!active(u)) return;
        if (d.a2Absorb > 0 && A().heal(null, u, d.a2Absorb) > 0) {
          DD.FX.text(u, 'IT\'S ALIVE!', { color: '#9fd0ff', size: 16 });
          A().maybeBark(u, 'zap', 0.5);
        }
        if (!u.data.angry && u.hp <= u.maxHp / 2) {
          u.data.angry = true;
          A().addStatus(u, 'inspired', { turns: -1 }, u);
          A().bark(u, 'phase');
          DD.FX.text(u, 'GARY ANGRY', { color: '#ff5a3c', size: 20 });
          A().log('Gary is angry now: Inspired for good (+25% damage).', 'enemy');
        }
      },
    },
    barks: {
      spawn: ['Hi. I\'m Gary.', 'Gary help?', 'Gary not monster. Gary is GARY.'],
      attack: ['GARY THROW!', 'Gary sorry! Gary not sorry!', 'Clobber time.'],
      hurt: ['Ow. Gary feelings.', 'Gary had six spleens. Five now.', 'That was Gary\'s arm.'],
      death: ['Gary... tired...', 'Tell Doctor... Gary tried...', 'Gary... go... sleep...'],
      phase: ['GARY ANGRY.', 'NOW GARY MAD.', 'YOU MAKE GARY SAD. SAD GARY SMASH.'],
      zap: ['Ooh, tingly!', 'Gary feel GREAT!', 'MORE LIGHTNING!'],
    },
    desc: 'Mini-boss, immovable. Lightning heals him instead of hurting (Tesla Coils, chain zaps, shocked water). Throws whatever stands next to him, ' +
      'coworkers included. Below half HP: GARY ANGRY (Inspired for good). Afraid of fire. Assembled from six interns; inherited all their student debt.' });

  // Tesla Coil (minion, Gary's lab): arcs into the nearest unit, Gary preferred
  eskill({ id: 'a2_coil_arc', name: 'Arc Discharge', icon: '🔌', kind: 'attack', tags: ['ranged', 'lightning'], anchor: 'unit',
    levels: [{ dmg: 5 }], target: { type: 'unit', range: [1, 4], filter: 'notSelf', los: false },
    desc: function (L) { return 'Arc ' + L.dmg + ' lightning damage into the target, friend or foe (Flesh Golems heal instead).'; },
    flavor: 'Mad science, minimum wage.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u) || !active(ctx.user)) return;
      DD.FX.beam(ctx.user, u, { kind: 'lightning', color: '#9fe4ff', width: 3 });
      A().damage(ctx.user, u, ctx.L.dmg, { element: 'lightning' });
    } });

  eskill({ id: 'a2_coil_overcharge', name: 'Overcharge', icon: '🔋', kind: 'buff', tags: ['buff'], anchor: 'self',
    levels: [{ pct: 50 }], target: { type: 'self' },
    desc: function (L) { return 'Nobody in reach: store a charge and become Empowered (its next arc deals +' + L.pct + '%).'; },
    flavor: 'Hmmmmmmmmmmmmm.',
    execute: function (ctx) {
      if (!active(ctx.user)) return;
      DD.FX.particles(ctx.user, { kind: 'zap', count: 10 });
      A().addStatus(ctx.user, 'empowered', {}, ctx.user);
    } });

  /**
   * The coil's target: the nearest unit within reach, Gary first on ties, the taunter if taunted. Lightning-immune
   * units (other coils, wisps) are skipped: the arc goes where it hurts, or where it charges Gary.
   */
  function arcTarget(unit) {
    const s = S(), def = DD.getSkill('a2_coil_arc');
    const rg = DD.Targeting.range(unit, def, 1);
    const taunt = DD.Act.getStatus(unit, 'taunt');
    const list = s.units.filter(function (o) {
      if (!active(o) || o === unit || o.defId === 'a2_tesla_coil' || (o.resist && o.resist.lightning === 0)) return false;
      const d = dist(o, unit);
      if (d < rg[0] || d > rg[1]) return false;
      if (G().hostile(unit, o) && has(o, 'stealth')) return false;
      if (o.flags && o.flags.untargetable) return false;
      return !taunt || !taunt.source || o.id === taunt.source;
    });
    list.sort(function (a, b) {
      return dist(a, unit) - dist(b, unit) || (b.defId === 'a2_gary') - (a.defId === 'a2_gary') || a.y - b.y || a.x - b.x;
    });
    return list[0] || null;
  }
  /** Its turn: arc into arcTarget (Gary first on ties: it heals him); nobody in reach → Overcharge. */
  function coilPlan(unit, api) {
    const t = arcTarget(unit);
    if (t && api.canUse(unit, 'a2_coil_arc')) { api.act(unit, 'a2_coil_arc', t, {}); return; }
    if (!has(unit, 'empowered') && api.canUse(unit, 'a2_coil_overcharge')) api.act(unit, 'a2_coil_overcharge', unit, {});
  }

  DD.registerEnemy({ id: 'a2_tesla_coil', name: 'Tesla Coil', act: 2, tier: 'minion', hp: 12, mov: 0, armor: 0, init: 2,
    tags: ['construct', 'machine'], flags: { immovable: true }, resist: { lightning: 0, poison: 0 },
    sprite: SPR.coil, skills: ['a2_coil_arc', 'a2_coil_overcharge'], ai: coilPlan, aiStyle: 'ranged', xp: 2, gold: [1, 3],
    passive: { icon: '🔌', name: 'Live Wire', desc: 'On its turn it arcs into the nearest unit within 4 tiles, friend or foe (Gary first: it heals him; ' +
      'lightning-immune units are skipped). Nobody in reach: it Overcharges (+50% on its next arc). Never moves.' },
    barks: {
      spawn: ['*bzzzzt*', '*crackle*'],
      attack: ['*ZAP*', '*BZZRT*'],
      hurt: ['*sputter*', '*spark*'],
      death: ['*fwoomp*', '*sad electrical whine*'],
    },
    desc: 'Arcs 5 lightning damage into the nearest unit within 4 tiles on its turn, friend or foe, skipping lightning-immune ones (Gary heals from it); ' +
      'with nobody in reach it Overcharges. Immovable, immune to lightning. Voids every warranty within a mile.' });

  // =====================================================================================================
  // Encounters (hauntwood, academy, graveyard)
  // =====================================================================================================
  function enc(def) {
    def.act = 2;
    def.reward = def.reward || (def.kind === 'elite' ? { goldMult: 1.2, itemRarity: 'rare' } : { goldMult: 1, itemRarity: null });
    if (def.weight === undefined) def.weight = 1;
    return DD.registerEncounter(def);
  }

  enc({ id: 'a2_unpaid_internship', kind: 'normal', name: 'The Unpaid Internship', minDepth: 0,
    intro: 'The Academy\'s work-study program has gone feral. The interns are paid in exposure, the zombies in nothing, and the brunch cultist in mimosas.',
    map: { theme: 'graveyard', w: 9, h: 10, features: ['gravestones', 'pits', 'mud'], density: 1 },
    enemies: [{ id: 'a2_skeleton_intern', n: 2 }, { id: 'a2_zombie_unpaid', n: 2 }, { id: 'a2_banshee', n: 1 }, { id: 'a2_brunch_cultist', n: 1 }],
    reinforcements: [{ round: 2, enemies: [{ id: 'a2_skeleton_intern', n: 2 }], edge: 'N', text: 'Two more interns arrive. Orientation was a sign-up sheet and a shovel.' }],
    objective: { type: 'killAll' } });

  enc({ id: 'a2_bottomless_brunch', kind: 'normal', name: 'Bottomless Brunch', minDepth: 0,
    intro: 'A clearing, a picnic blanket and a cult. They are serving brunch, and you are not on the list. The mimosas are bottomless. So is their patience for walk-ins.',
    map: { theme: 'hauntwood', w: 10, h: 10, features: ['pools', 'bushes'], density: 1 },
    enemies: [{ id: 'a2_brunch_cultist', n: 2 }, { id: 'a2_zombie_unpaid', n: 2 }, { id: 'a2_pixie_swarm', n: 1 }, { id: 'a2_hollandaise', n: 1 }],
    objective: { type: 'killAll' } });

  enc({ id: 'a2_cub_scouts', kind: 'normal', name: 'Cub Scouts', minDepth: 0,
    intro: 'Two owlbear cubs are earning their Mauling badge. You are the badge. A pixie rave is supervising.',
    map: { theme: 'hauntwood', w: 9, h: 10, features: ['trees', 'hills'], density: 1 },
    enemies: [{ id: 'a2_owlbear_cub', n: 3 }, { id: 'a2_pixie_swarm', n: 2 }, { id: 'a2_wisp', n: 1 }],
    objective: { type: 'killAll' } });

  enc({ id: 'a2_follow_the_lights', kind: 'normal', name: 'Don\'t Follow the Lights', minDepth: 1,
    intro: 'Pretty lights bob over the bog. Every adventurer who ever followed them is now part of the bog. Spread out, and stay off the deep bits.',
    map: { theme: 'hauntwood', w: 10, h: 11, features: ['deep_water', 'pools', 'mud'], density: 1 },
    enemies: [{ id: 'a2_wisp', n: 2 }, { id: 'a2_zombie_unpaid', n: 2 }, { id: 'a2_skeleton_intern', n: 2 }],
    reinforcements: [{ round: 3, enemies: [{ id: 'a2_zombie_unpaid', n: 1 }], edge: 'zone', text: 'Something squelches out of the bog. It wants its boots back.' }],
    objective: { type: 'killAll' } });

  enc({ id: 'a2_forbidden_buffet', kind: 'normal', name: 'The Forbidden Buffet', minDepth: 1, weight: 0.8,
    intro: 'Three unholy brunch platters keep the cult fed forever: eggs Benedict that never runs out. Kick over the buffet before they get seconds.',
    map: { theme: 'graveyard', w: 11, h: 10, features: ['gravestones', 'mud'], density: 1 },
    enemies: [{ id: 'a2_brunch_cultist', n: 2 }, { id: 'a2_skeleton_intern', n: 2 }, { id: 'a2_zombie_unpaid', n: 1 }],
    reinforcements: [{ round: 3, enemies: [{ id: 'a2_hollandaise', n: 2 }], edge: 'zone', text: 'The buffet is replenished. The sauce has opinions.' }],
    objective: { type: 'destroy', objId: 'a2_chafing_dish', count: 3, flavor: 'Health inspectors approve.' } });

  enc({ id: 'a2_last_coffee', kind: 'normal', name: 'The Last Coffee Machine', minDepth: 1, weight: 0.8,
    intro: 'Finals week. The Academy\'s last working coffee machine is under siege by undead interns. Protect it. Civilization depends on it.',
    map: { theme: 'academy', layout: [
      '##b##b##b##',
      '#E..E.E..E.',
      '#....E.....',
      '#.d.....d..',
      '#...c.c....',
      '#....K.....',
      '#.d.....d..',
      '#..H.H.H...',
      '#...H.H....',
      '#..........',
    ], legend: {
      K: { obj: 'a2_coffee_machine' },
      b: { obj: 'bookshelf' },
      c: { obj: 'candles' },
      d: { obj: { id: 'crate', label: 'Break Room Table' } },
    } },
    enemies: [{ id: 'a2_skeleton_intern', n: 3 }, { id: 'a2_zombie_unpaid', n: 2 }, { id: 'a2_banshee', n: 1 }],
    reinforcements: [{ round: 3, enemies: [{ id: 'a2_skeleton_intern', n: 2 }], edge: 'N', text: 'More interns arrive. Somebody told them there was free coffee.' }],
    objective: { type: 'protect', objId: 'a2_coffee_machine', flavor: 'Without it, finals week becomes a TPK.' } });

  enc({ id: 'a2_rooftop_critics', kind: 'normal', name: 'Rooftop Critics', minDepth: 2,
    intro: 'The Academy\'s gargoyles review every visitor. Nobody has ever gotten more than one star. Hit them while they\'re still flesh.',
    map: { theme: 'academy', w: 10, h: 11, features: ['terraces', 'cliffs', 'pits'], density: 1 },
    enemies: [{ id: 'a2_gargoyle', n: 2 }, { id: 'a2_banshee', n: 1 }, { id: 'a2_skeleton_intern', n: 2 }, { id: 'a2_pixie_swarm', n: 1 }],
    objective: { type: 'killAll' } });

  enc({ id: 'a2_graveyard_shift', kind: 'normal', name: 'Graveyard Shift', minDepth: 2, weight: 0.8,
    intro: 'The night shift clocks in. All of it. Hold out until sunrise; the undead have a strict no-overtime policy.',
    map: { theme: 'graveyard', w: 11, h: 11, features: ['gravestones', 'coffins', 'chokepoint'], density: 1 },
    enemies: [{ id: 'a2_zombie_unpaid', n: 2 }, { id: 'a2_skeleton_intern', n: 2 }, { id: 'a2_banshee', n: 1 }, { id: 'a2_wisp', n: 1 }],
    reinforcements: [
      { round: 2, enemies: [{ id: 'a2_skeleton_intern', n: 2 }], edge: 'N', text: 'Interns climb out of fresh graves. Their onboarding was brutal.' },
      { round: 3, enemies: [{ id: 'a2_zombie_unpaid', n: 2 }], edge: 'W' },
      { round: 4, enemies: [{ id: 'a2_skeleton_intern', n: 2 }, { id: 'a2_gargoyle', n: 1 }], edge: 'zone' },
    ],
    objective: { type: 'survive', rounds: 5 } });

  enc({ id: 'a2_mama_bear', kind: 'elite', name: 'Mama Bear', minDepth: 2,
    intro: 'You find two adorable owlbear cubs. Behind the screen, the DM rolls something and smiles.',
    map: { theme: 'hauntwood', w: 11, h: 10, features: ['trees', 'bushes', 'hills'], density: 1 },
    enemies: [{ id: 'a2_mama_owlbear', n: 1 }, { id: 'a2_owlbear_cub', n: 2 }, { id: 'a2_pixie_swarm', n: 1 }],
    objective: { type: 'killAll' } });

  enc({ id: 'a2_office_hours', kind: 'elite', name: 'Office Hours', minDepth: 2,
    intro: 'Office hours are three to four, by appointment, in the crypt. The TA is grading. With extreme prejudice.',
    map: { theme: 'academy', layout: [
      '##b##bb##b##',
      '#c...NN...c.',
      '#.E.E..E.E..',
      '#..d.bb.d...',
      '#.b.......b.',
      '#r..d..d..r.',
      '#...HHHH....',
      '#...HHHH....',
      '#...........',
    ], heights: [
      '000000000000',
      '022222222222',
      '022222222222',
      '011111111111',
      '011111111111',
      '000000000000',
      '000000000000',
      '000000000000',
      '000000000000',
    ], legend: {
      N: { terrain: 'floor', zone: 'enemy' },
      b: { obj: 'bookshelf' },
      c: { obj: 'candles' },
      r: { obj: 'brazier' },
      d: { obj: { id: 'crate', label: 'Lecture Desk' } },
    } },
    enemies: [{ id: 'a2_necro_ta', n: 1, mark: 'N' }, { id: 'a2_skeleton_intern', n: 3 }, { id: 'a2_gargoyle', n: 1 }],
    reinforcements: [{ round: 4, enemies: [{ id: 'a2_skeleton_intern', n: 1 }], edge: 'N', text: 'A late intern shuffles in. The TA marks it absent anyway.' }],
    objective: { type: 'killAll' } });

  enc({ id: 'a2_its_alive', kind: 'elite', name: 'It\'s Alive! (It\'s Gary)', minDepth: 3,
    intro: 'Lightning crackles across a mausoleum turned laboratory. On the slab, something very large sits up and says, quietly, "Hi. I\'m Gary."',
    map: { theme: 'graveyard', layout: [
      '############',
      '#....cc.....',
      '#....G......',
      '#.E..oo...E.',
      '#..~~...~~..',
      '#..Z....Z...',
      '#.g..g.g..g.',
      '#...........',
      '#...HHHH....',
      '#...HHHH....',
      '#...........',
    ], legend: {
      G: { terrain: 'floor', zone: 'enemy' },
      Z: { terrain: 'floor', zone: 'enemy' },
      c: { obj: 'candles' },
      g: { obj: 'gravestone' },
      o: { obj: { id: 'coffin', label: 'Operating Slab' } },
    } },
    enemies: [{ id: 'a2_gary', n: 1, mark: 'G' }, { id: 'a2_tesla_coil', n: 2, mark: 'Z' }, { id: 'a2_wisp', n: 1 }, { id: 'a2_zombie_unpaid', n: 2 }],
    objective: { type: 'killAll' } });

  enc({ id: 'a2_tenure_review', kind: 'elite', name: 'Tenure Review', minDepth: 4, weight: 0.8,
    intro: 'A Necromancer TA is up for tenure, and the review committee is a graveyard full of his former students. Everyone fails.',
    map: { theme: 'graveyard', w: 12, h: 11, features: ['gravestones', 'pits', 'fence'], density: 1 },
    enemies: [{ id: 'a2_necro_ta', n: 1 }, { id: 'a2_zombie_unpaid', n: 2 }, { id: 'a2_banshee', n: 1 }],
    reinforcements: [{ round: 3, enemies: [{ id: 'a2_skeleton_intern', n: 2 }], edge: 'N', text: 'Former students rise to testify. None of them were paid either.' }],
    objective: { type: 'killAll' } });

  // ---- public helpers (other authors: lich interns, boss arenas, events) -------------------------------
  DD.Act2 = {
    sprites: SPR,
    chainTiles: chainTiles,          // custom area: target + nearest units within L.reach, L.jumps times
    chargeTiles: chargeTiles,        // custom area: straight charge line (L.len) ending on the first foe
    doCharge: doCharge,              // execute for a chargeTiles skill (L.dmg, L.push)
    reassemble: reassemble,          // (tile, why) stand an a2_bone_pile up as a half-HP Skeleton Intern
    pileTiles: pileTiles,            // tiles holding a2_bone_pile objects
    throwableAlly: throwableAlly,    // (user, preferId) adjacent friendly unit Gary may throw
    arcTarget: arcTarget,            // (coil) the unit an a2_tesla_coil would arc into
    singleTarget: singleTarget,      // (skillDef) true when the skill has a single-tile area (Pixie Swarm halves those)
  };
})();
