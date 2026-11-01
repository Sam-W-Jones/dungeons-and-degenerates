/* Dungeons and Degenerates — js/data/heroes/slate.js
 * Slate, the Unamused: Lich-tenstein's grumpy pale-blue library golem. Grappler / thrower / bruiser (v2, simple kit).
 * Passive Short Fuse: +1 Rage (sla_rage, max 5) whenever someone else hits, heals or buffs him; at 3+ Rage his runes
 * flare and his skills deal +2 damage. Rage never drains; Blow a Gasket spends it, the signature maxes it.
 * Grappled (sla_grappled, on the victim, noMove): it can't move, and when Slate walks it is dragged into the tile he
 * left; it ends when its turns run out, when they are apart or when he can't hold on (stunned, sheep, downed).
 * Throws lift an adjacent unit or object and land it up to N tiles away in a line, over units and low clutter: it and
 * the foe it hits take the damage, pits / lava / water do the rest, thrown objects shatter (barrels explode).
 * Registers the hero, 11 skills, 2 statuses, the Boulder object, 3 items and loading tips. All state lives on units /
 * statuses (previews are dry runs of the same code).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const RAGE = 'sla_rage', HELD = 'sla_grappled', BOULDER = 'sla_boulder';
  const MITTS = 'sla_mitts', CARDIGAN = 'sla_cardigan', LEDGER = 'sla_ledger';
  const MAX_RAGE = 5, FLARE = 3, FLARE_DMG = 2, CARDIGAN_BLOCK = 2;
  const RUNE = '#7af0ff';
  // canonical loose objects Slate can pick up (plus any object def / instance flagged `throwable: true`)
  const THROWABLE = { crate: 1, barrel: 1, barrel_explosive: 1, keg: 1, mushroom: 1, coffin: 1, candles: 1, brazier: 1, sla_boulder: 1 };
  // skills whose max range is a throw distance (the Mitts add 1)
  const THROW_RANGE = { sla_personal_space: 1, sla_air_mail: 1 };

  // ---- small helpers ---------------------------------------------------------------------------------
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function byId(id) { return id != null && DD.Combat && DD.Combat.byId ? DD.Combat.byId(id) : null; }
  function getSt(u, id) { return u && u.statuses ? DD.Act.getStatus(u, id) : null; }
  function has(u, id) { return !!getSt(u, id); }
  function hasItem(u, id) { return !!u && Array.isArray(u.items) && u.items.indexOf(id) >= 0; }
  function dirTo(a, b) { return DD.util.dirTo(a, b); }
  function step(p, d, k) { return { x: p.x + d.x * k, y: p.y + d.y * k }; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function left(st) { return st && st.turns > 0 ? ' (' + plural(st.turns, 'turn') + ' left)' : ''; }
  function objName(o) { const d = DD.getObject(o.id); return String(o.label || (d ? d.name : o.id)).toLowerCase(); }
  /** Throw distance with the Mitts of Unreasonable Velocity (+1). */
  function throwRange(L, user) { return L.range + (hasItem(user, MITTS) ? 1 : 0); }

  // ---- Rage (Short Fuse) -------------------------------------------------------------------------------
  function rage(u) { const st = getSt(u, RAGE); return st ? st.stacks : 0; }
  function flared(u) { return rage(u) >= FLARE; }

  /** +n Rage (max 5). The Cardigan pays 2 Block per Rage gained. Returns the stacks actually gained. */
  function gainRage(u, n) {
    n = Math.max(0, Math.round(n || 0));
    if (!active(u) || !n) return 0;
    const before = rage(u);
    const add = Math.min(n, MAX_RAGE - before);
    if (add <= 0) return 0;
    DD.Act.addStatus(u, RAGE, { stacks: add, silent: true }, u);
    const gained = rage(u) - before;
    if (gained <= 0) return 0;
    DD.FX.text(u, '+' + gained + ' Rage 💢', { color: RUNE, size: 13 });
    if (hasItem(u, CARDIGAN)) DD.Act.addBlock(u, CARDIGAN_BLOCK * gained);
    if (before < FLARE && rage(u) >= FLARE) {
      DD.FX.particles(u, { kind: 'runes', count: 14, color: RUNE });
      DD.FX.text(u, 'RUNES FLARE!', { color: RUNE, size: 17 });
      DD.Act.log(u.name + '\'s runes flare (Rage ' + rage(u) + '): +' + FLARE_DMG + ' damage.', 'hero');
    }
    return gained;
  }

  /** Spend all Rage. Returns the stacks spent. */
  function spendRage(u) {
    const n = rage(u);
    if (!n) return 0;
    DD.Act.removeStatus(u, RAGE, { silent: true });
    if (n >= FLARE) DD.FX.text(u, 'runes dim', { color: '#9fb7c9', size: 12 });
    return n;
  }

  /** Short Fuse: someone else hit, healed or buffed him ("Did I ASK?"). The Grudge Ledger counts every grudge twice. */
  function touched(u, src) {
    if (!active(u) || !src || src === u) return 0;
    return gainRage(u, hasItem(u, LEDGER) ? 2 : 1);
  }

  /** His own skill hitting a unit (not consumables, statuses or the floor): the flare's +2 applies. */
  function skillHit(d) { return !!d && d.cause === 'skill' && !!d.skill && !!DD.getSkill(d.skill.id); }

  // ---- grapple ---------------------------------------------------------------------------------------
  /** A unit Slate can lift, hold or throw: anything that can be pushed (not himself, immovable or untargetable). */
  function liftable(user, u) {
    return active(u) && u !== user && !DD.Act.isImmovable(u) && !(u.flags && u.flags.untargetable);
  }
  function holderOf(v) { const st = getSt(v, HELD); return st ? byId(st.source) : null; }
  /** The unit this Slate is holding (the Grappled status on the victim is the only record of a hold). */
  function heldBy(slate) {
    const s = S();
    if (!s || !slate) return null;
    for (let i = 0; i < s.units.length; i++) {
      const u = s.units[i];
      if (u === slate || !active(u)) continue;
      const st = getSt(u, HELD);
      if (st && st.source === slate.id) return u;
    }
    return null;
  }
  function canHold(slate) { return active(slate) && !DD.Act.isStunned(slate) && !has(slate, 'sheep'); }
  function holdOk(slate, v) { return canHold(slate) && active(v) && G().dist(slate, v) === 1; }

  /** End a hold. text: popup over the victim (null = quiet). */
  function release(v, text) {
    if (!v || !has(v, HELD)) return false;
    DD.Act.removeStatus(v, HELD, active(v) && text ? { text: text } : { silent: true });
    if (active(v) && text) DD.Act.log(v.name + ' is free.', 'status');
    return true;
  }
  function releaseAll(slate, text) {
    for (let guard = 0; guard < 8; guard++) { const v = heldBy(slate); if (!v || !release(v, text)) return; }
  }

  /** Seize v through its next `turns` turns (one hold at a time). Returns true if it is now held. */
  function grab(slate, v, turns) {
    if (!canHold(slate) || !liftable(slate, v) || G().dist(slate, v) !== 1) return false;
    const old = heldBy(slate);
    if (old && old !== v) release(old, 'Dropped!');
    const st = DD.Act.addStatus(v, HELD, { turns: turns, silent: true }, slate);
    if (!st) return false;
    DD.FX.text(v, 'Grappled!', { color: RUNE, size: 15 });
    DD.Act.log(slate.name + ' grabs ' + v.name + '. It is not a hug.', 'hero');
    return true;
  }

  /** Slate entered a tile: when he walks, the held foe is dragged into the tile he just left. */
  function dragStep(slate, cause) {
    const v = heldBy(slate);
    if (!v || G().dist(slate, v) === 1) return;
    const d = slate.lastDir || { x: 0, y: 0 };
    const prev = { x: slate.x - d.x, y: slate.y - d.y };
    if (cause !== 'move' || !liftable(slate, v) || G().dist(prev, v) !== 1 || !G().isFree(prev.x, prev.y, v)) {
      release(v, 'Slips free!');
      return;
    }
    DD.FX.slide(v, { x: v.x, y: v.y }, prev, { ms: 115, parallel: true });
    DD.Act.teleport(v, prev.x, prev.y, { fx: false });
    if (slate.data) slate.data.slaDragged = true;
  }
  /** After his walk: a dragged foe bleeds like any moved unit; a foe left behind is free. */
  function afterWalk(slate) {
    const v = heldBy(slate);
    const dragged = slate.data && slate.data.slaDragged;
    if (slate.data) slate.data.slaDragged = false;
    if (!v) return;
    if (G().dist(slate, v) !== 1) { release(v, 'Slips free!'); return; }
    if (dragged) DD.Act.bleedTick(v);
  }

  // ---- throwing ----------------------------------------------------------------------------------------
  function objThrowable(o) {
    if (!o || o.throwable === false || !G().objBlocksMove(o)) return false;
    const ob = S() && S().objective;
    if (ob && ob.type === 'protect' && ob.objId === o.id) return false;
    if (o.throwable === true) return true;
    const def = DD.getObject(o.id);
    if (def && def.throwable === false) return false;
    return !!THROWABLE[o.id] || !!(def && def.throwable === true);
  }
  /** What Slate would throw from the tile next to him in direction d: { unit } | { obj, x, y } | null. */
  function throwThing(user, d) {
    if (!user || !d || (!d.x && !d.y)) return null;
    const x = user.x + d.x, y = user.y + d.y;
    const v = G().unitAt(x, y);
    if (v) return G().hostile(user, v) && liftable(user, v) ? { unit: v } : null;
    const t = G().tile(x, y);
    return t && t.obj && objThrowable(t.obj) ? { obj: t.obj, x: x, y: y } : null;
  }
  function tossable(user, a) {
    return liftable(user, a) && !G().hostile(user, a) && (a.kind === 'hero' || a.kind === 'summon');
  }

  /** Thrown things fly over units and low objects; walls, tall objects and the map edge stop them. */
  function stopsFlight(x, y) {
    const t = G().tile(x, y);
    if (!t) return true;
    const td = G().terrain(t);
    if (td.walkable === false && !td.pit && !td.liquid) return true;
    return !!(t.obj && G().objBlocksMove(t.obj) && G().objBlocksLos(t.obj));
  }

  /**
   * Where something at `from` thrown along dir for up to n tiles comes down (pure query; mover = the thrown unit,
   * null for an object): { end, land, k, wall, crash, crashObj, drop }. end = the tile it comes down on (short of a
   * wall), land = where a thrown unit ends up (it bounces back short of a crash), drop = a pit / deep water at end.
   */
  function flight(from, dir, n, mover) {
    let k = 0, wall = false;
    for (let i = 1; i <= n; i++) {
      const p = step(from, dir, i);
      if (stopsFlight(p.x, p.y)) { wall = true; break; }
      k = i;
    }
    const end = step(from, dir, k);
    const res = { end: end, land: end, k: k, wall: wall, crash: null, crashObj: false, drop: false };
    if (k === 0) { res.land = { x: from.x, y: from.y }; return res; }
    const occ = G().unitAt(end.x, end.y);
    const tl = G().tile(end.x, end.y);
    const blocked = !!(occ && occ !== mover) || !!(tl.obj && G().objBlocksMove(tl.obj));
    const drop = G().isDrop(end.x, end.y) && !(mover && G().isFlying(mover));
    // odd unwalkable ground that is neither a wall nor a drop: it bounces off like a wall
    const unwalkable = !blocked && !drop && !!mover && !G().isWalkable(end.x, end.y, mover);
    if (blocked || unwalkable) {
      res.wall = res.wall || unwalkable;
      res.crash = occ && occ !== mover ? occ : null;
      res.crashObj = !res.crash && !!(tl.obj && G().objBlocksMove(tl.obj));
      res.land = { x: from.x, y: from.y };
      for (let i = k - 1; i >= 1; i--) {
        const p = step(from, dir, i);
        const ok = mover ? G().isFree(p.x, p.y, mover) : !G().tile(p.x, p.y).obj && !G().isDrop(p.x, p.y);
        if (ok) { res.land = p; break; }
      }
      return res;
    }
    res.drop = drop;
    return res;
  }

  /**
   * Crash damage to the foe a thrown thing hits: a collision (cause 'bump', so a crash kill is an environmental kill),
   * which skips outgoing modifiers, so the flare's +2 is added here ("his skills deal +2").
   */
  function crashDmg(user, n) { return n + (flared(user) ? FLARE_DMG : 0); }
  function crashFx(at, wallOnly) {
    DD.FX.particles(at, { kind: 'dust', count: 12 });
    DD.FX.text(at, wallOnly ? 'BONK!' : 'CRUNCH!', { color: '#ffe08a', size: 16 });
    DD.FX.shake(5, 200);
  }

  /** Lift unit u and throw it along dir for up to n tiles: it and the foe it hits take dmg. Returns { land, crash, fell }. */
  function throwUnit(user, u, dir, n, dmg) {
    const res = { land: null, crash: null, fell: false };
    if (!active(u)) return res;
    release(u, null);
    const from = { x: u.x, y: u.y };
    const f = flight(from, dir, n, u);
    res.crash = f.crash;
    DD.Act.withCredit(user, function () {
      const dest = f.drop ? f.end : f.land;
      const far = G().dist(from, dest);
      if (far > 0) DD.FX.jump(u, from, dest, { arc: 26 + far * 8, ms: 250 + far * 55 });
      if (f.drop) {
        // pits / deep water: the engine's fall rules (enemies are YEETed, heroes and bosses climb out hurt)
        u.x = dest.x; u.y = dest.y;
        DD.Act.touch();
        res.fell = true;
        DD.Act.fall(u, user);
      } else if (far > 0) {
        DD.Act.teleport(u, dest.x, dest.y, { fx: false });
      }
      res.land = { x: u.x, y: u.y };
      if (f.crash || f.crashObj || f.wall) crashFx(f.crash || f.crashObj ? f.end : res.land, !f.crash && !f.crashObj);
      if (f.crash && active(f.crash) && G().hostile(user, f.crash)) DD.Act.damage(user, f.crash, crashDmg(user, dmg), { cause: 'bump', tags: ['throw', 'crash'] });
      if (f.crashObj) DD.Act.damageObject(user, f.end.x, f.end.y, dmg);
      if (active(u)) DD.Act.damage(user, u, dmg, { tags: ['throw'] });
    });
    return res;
  }

  /** Visual-only painter for a thrown object (FX projectile kind 'custom'). */
  function objDrawer(objId) {
    const def = DD.getObject(objId) || {};
    const col = def.color || '#9fb7c9';
    return function (c, x, y, p, view) {
      const z = (view && view.zoom) || 1, s = 6.5 * z;
      c.save();
      c.translate(x, y);
      c.rotate(p * 8);
      c.fillStyle = col; c.strokeStyle = '#1a1014'; c.lineWidth = 1.2 * z;
      c.beginPath(); c.rect(-s, -s * 0.8, s * 2, s * 1.6); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(-s, -s * 0.8, s * 2, s * 0.45);
      c.restore();
    };
  }

  /** The object breaks where it lands: placed (non-blocking, so it may share a unit's tile) and destroyed at once. */
  function shatter(user, inst, x, y) {
    const t = G().tile(x, y);
    DD.FX.particles({ x: x, y: y }, { kind: 'dust', count: 14 });
    if (!t || t.obj || G().isDrop(x, y)) return false;
    const o = DD.Act.placeObject(x, y, inst.id, Object.assign({}, inst, { blocksMove: false }));
    return o ? DD.Act.destroyObject(x, y, user) : false;
  }

  /** Throw the object at `at` along dir for up to n tiles: the foe it hits takes dmg, then it shatters. */
  function throwObject(user, at, dir, n, dmg) {
    const t = G().tile(at.x, at.y);
    const inst = t && t.obj;
    if (!inst) return false;
    DD.Act.removeObject(at.x, at.y);
    const f = flight(at, dir, n, null);
    DD.FX.projectile(at, f.end, { kind: 'custom', arc: 22 + f.k * 8, ms: 260 + f.k * 50, sound: 'push', draw: objDrawer(inst.id) });
    DD.Act.withCredit(user, function () {
      if (f.drop) {
        DD.FX.particles(f.end, { kind: 'dust', count: 10 });
        DD.Act.log('The ' + objName(inst) + ' tumbles into the abyss.', 'system');
        return;
      }
      if (f.crash && active(f.crash) && G().hostile(user, f.crash)) DD.Act.damage(user, f.crash, crashDmg(user, dmg), { cause: 'bump', tags: ['throw', 'crash'] });
      if (f.crashObj) DD.Act.damageObject(user, f.end.x, f.end.y, dmg);
      const spot = f.crashObj ? f.land : f.end;
      shatter(user, inst, spot.x, spot.y);
    });
    return true;
  }

  // ---- statuses ----------------------------------------------------------------------------------------
  DD.registerStatus({
    id: RAGE, name: 'Rage', icon: '💢', color: RUNE, type: 'buff', stacking: 'stack', maxStacks: MAX_RAGE,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      return 'Rage ' + st.stacks + '/' + MAX_RAGE + '. At ' + FLARE + '+ his runes flare: his skills deal +' + FLARE_DMG + ' damage. ' +
        '+1 whenever someone else hits, heals or buffs him.';
    },
  });

  DD.registerStatus({
    id: HELD, name: 'Grappled', icon: '🤼', color: RUNE, type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1, noMove: true,
    desc: function (st) {
      const h = byId(st && st.source);
      return 'Held by ' + (h ? h.name : 'Slate') + ': can\'t move, and is dragged along when he walks. Free once they are apart.' + left(st);
    },
    hooks: {
      // a hold that went stale (he was stunned, sheeped or downed, or they were moved apart) lets go
      onTurnStart: function (unit, st) { if (!holdOk(byId(st.source), unit)) release(unit, 'Breaks free!'); },
      onEnterTile: function (unit, tile, cause, st) {
        const h = byId(st.source);
        if (!h || !active(h) || G().dist(h, unit) !== 1) release(unit, 'Slips free!');
      },
    },
  });

  // ---- the Boulder (Hard Pass leaves one; Personal Space can throw it) ----------------------------------
  DD.registerObject({
    id: BOULDER, name: 'Boulder', blocksMove: true, blocksLos: false, hp: 5, height: 0.75, color: '#8ea6b8',
    smashable: true, throwable: true,
    desc: 'A chunk of floor Slate ripped up and threw. Blocks movement. 5 HP (Smash it). Slate can throw it again.',
    draw: function (g, obj, t) {
      g.ellipse(1, 2, 15, 6.5, 'rgba(0,0,0,0.3)', null);
      g.poly([[-14, 0], [-15, -9], [-9, -18], [1, -21], [11, -16], [15, -7], [12, 2], [0, 5]], '#8ea6b8', true);
      g.poly([[-9, -18], [1, -21], [11, -16], [3, -11], [-6, -12]], '#c3d5e1', null);
      g.poly([[11, -16], [15, -7], [12, 2], [4, 3], [3, -11]], '#6a8396', null);
      g.poly([[-14, 0], [-15, -9], [-9, -18], [1, -21], [11, -16], [15, -7], [12, 2], [0, 5]], null, true);
      g.line(-5, -5, -2, -12, '#5b788c', 1.4);
      g.line(-2, -12, 2, -8, '#5b788c', 1.4);
      g.line(-4, -9, 1, -6, '#5b788c', 1.2);
      g.line(7, -4, 9, 0, '#4f6577', 1);
    },
  });

  // ---- skills ------------------------------------------------------------------------------------------
  function skill(def) { def.owner = 'slate'; return DD.registerSkill(def); }
  function liftTarget(ctx) {
    const v = ctx.targetUnit;
    if (!v) return 'Pick a foe next to you.';
    return liftable(ctx.user, v) ? true : 'Too heavy to lift! (Immovable.)';
  }

  skill({
    id: 'sla_love_tap', name: 'Love Tap', icon: '👊', kind: 'attack', tags: ['melee'], ap: 1,
    levels: [{ dmg: 5 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'He calls it a love tap. The goblin calls it a concussion.',
    execute: function (ctx) {
      const u = ctx.user, v = ctx.targetUnit;
      if (!active(u) || !active(v)) return;
      DD.FX.lunge(u, v);
      DD.Act.damage(u, v, ctx.L.dmg);
    },
  });

  skill({
    id: 'sla_hold_still', name: 'Hold Still', icon: '🤼', kind: 'attack', tags: ['melee', 'grapple', 'root'], ap: 1, cooldown: 2,
    levels: [{ dmg: 4, turns: 1 }, { dmg: 5, turns: 1 }, { dmg: 6, turns: 2 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy', canTarget: liftTarget },
    desc: function (L) {
      return 'Grab an adjacent foe: ' + L.dmg + ' damage, and it is Grappled through its next ' + (L.turns === 1 ? 'turn' : L.turns + ' turns') +
        ' (can\'t move; dragged along when you walk).';
    },
    flavor: 'He hates being touched. He has no problem touching YOU.',
    execute: function (ctx) {
      const u = ctx.user, v = ctx.targetUnit;
      if (!active(u) || !active(v)) return;
      DD.FX.lunge(u, v);
      DD.Act.damage(u, v, ctx.L.dmg, { tags: ['grapple'] });
      if (active(u) && active(v)) grab(u, v, ctx.L.turns);
    },
  });

  function throwArea(ctx) {
    const u = ctx.user, tg = ctx.target;
    if (!u || !tg) return tg ? [tg] : [];
    const d = dirTo(u, tg);
    const thing = throwThing(u, d);
    if (!thing) return [tg];
    const at = step(u, d, 1);
    const f = flight(at, d, Math.max(0, G().dist(u, tg) - 1), thing.unit || null);
    const out = [at, f.end];
    if (thing.unit ? !f.drop : f.crashObj) out.push(f.land);
    return out;
  }

  skill({
    id: 'sla_personal_space', name: 'Personal Space', icon: '✋', kind: 'attack', tags: ['melee', 'throw', 'push', 'combo'], ap: 2, cooldown: 1,
    levels: [{ dmg: 7, range: 3 }, { dmg: 9, range: 3 }, { dmg: 11, range: 4 }],
    target: {
      type: 'tile', los: false, straight: true,
      range: function (L) { return [2, L.range + 1]; },
      canTarget: function (ctx) {
        if (!ctx.user || !ctx.target) return 'Pick where it lands.';
        return throwThing(ctx.user, dirTo(ctx.user, ctx.target)) ? true : 'Nothing to throw that way.';
      },
    },
    area: { shape: 'custom', fn: throwArea },
    desc: function (L, user) {
      return 'Throw the foe or object next to you up to ' + plural(throwRange(L, user), 'tile') + ' in a line. It and any foe it hits take ' +
        L.dmg + ' damage (objects shatter).';
    },
    flavor: 'He does not do hugs. He does trajectories.',
    execute: function (ctx) {
      const u = ctx.user, tg = ctx.target;
      if (!active(u) || !tg || (tg.x !== u.x && tg.y !== u.y)) return;
      const d = dirTo(u, tg);
      const thing = throwThing(u, d);
      if (!thing) return;
      const n = Math.max(0, G().dist(u, tg) - 1);
      DD.FX.lunge(u, step(u, d, 1));
      if (thing.unit) throwUnit(u, thing.unit, d, n, ctx.L.dmg);
      else throwObject(u, { x: thing.x, y: thing.y }, d, n, ctx.L.dmg);
    },
  });

  // [review, v1] was "Rocks Fall": the Dungeon Master's attack (dm_rocks_fall). The id stays for saved runs.
  skill({
    id: 'sla_rocks_fall', name: 'Hard Pass', icon: '🪨', kind: 'attack', tags: ['ranged', 'terrain', 'throw'], ap: 2, cooldown: 2,
    levels: [{ dmg: 7, range: 5 }, { dmg: 9, range: 5 }, { dmg: 10, range: 6 }],
    target: {
      type: 'tile', los: false, filter: 'any', range: function (L) { return [2, L.range]; },
      canTarget: function (ctx) {
        const t = ctx.target && G().tile(ctx.target.x, ctx.target.y);
        const td = t ? G().terrain(t) : null;
        if (td && td.walkable === false && !td.pit && !td.liquid) return 'That is a wall. He checked.';
        const o = ctx.target && G().unitAt(ctx.target.x, ctx.target.y);
        if (o && ctx.user && !G().hostile(ctx.user, o)) return 'Not on a friend. Probably.';
        return true;
      },
    },
    desc: function (L) {
      return 'Lob a boulder at a tile up to ' + L.range + ' away, no line of sight needed: ' + L.dmg + ' damage to the foe or object ' +
        'there. On empty floor, the Boulder stays.';
    },
    flavor: 'Someone asked him to pass the rock. He gave it a HARD pass.',
    execute: function (ctx) {
      const u = ctx.user, tg = ctx.target;
      if (!active(u) || !tg) return;
      DD.FX.projectile(u, tg, { kind: 'rock', size: 2.3, color: '#9fb7c9', arc: true, ms: 480 });
      DD.FX.shake(6, 260);
      DD.FX.particles(tg, { kind: 'dust', count: 16 });
      DD.Act.withCredit(u, function () {
        const t = G().tile(tg.x, tg.y);
        const v = G().unitAt(tg.x, tg.y);
        if (v) {
          if (active(v) && G().hostile(u, v)) DD.Act.damage(u, v, ctx.L.dmg, { tags: ['rock', 'throw'] });
          return;
        }
        if (t && t.obj && G().objBlocksMove(t.obj)) { DD.Act.damageObject(u, tg.x, tg.y, ctx.L.dmg); return; }
        const td = t ? G().terrain(t) : null;
        if (t && !t.obj && td && td.walkable !== false && !td.liquid && !td.pit) DD.Act.placeObject(tg.x, tg.y, BOULDER);
      });
    },
  });

  skill({
    id: 'sla_air_mail', name: 'Air Mail', icon: '📦', kind: 'move', tags: ['throw', 'ally', 'combo'], ap: 1,
    cooldown: function (L) { return L.cd; },
    levels: [{ range: 3, thud: 3, cd: 2 }, { range: 4, thud: 4, cd: 2 }, { range: 4, thud: 5, cd: 1 }],
    target: {
      type: 'tile', los: false, straight: true, filter: 'empty',
      range: function (L) { return [2, L.range + 1]; },
      canTarget: function (ctx) {
        const u = ctx.user, tg = ctx.target;
        if (!u || !tg) return 'Pick where they land.';
        const d = dirTo(u, tg);
        const ally = G().unitAt(u.x + d.x, u.y + d.y);
        if (!tossable(u, ally)) return 'No ally to throw that way.';
        const f = flight(ally, d, G().dist(u, tg) - 1, ally);
        if (f.wall || f.crash || f.crashObj || f.drop || f.end.x !== tg.x || f.end.y !== tg.y) return 'Something is in the way.';
        if (G().hazardAt(tg.x, tg.y, ally)) return 'Not into THAT.';
        return true;
      },
    },
    area: { shape: 'custom', fn: function (ctx) {
      const u = ctx.user, tg = ctx.target;
      if (!u || !tg) return tg ? [tg] : [];
      const out = [step(u, dirTo(u, tg), 1), tg];
      DD.util.DIRS.forEach(function (d) { out.push(step(tg, d, 1)); });
      return out;
    } },
    desc: function (L, user) {
      return 'Throw the ally next to you up to ' + plural(throwRange(L, user), 'tile') + ' in a line onto a safe empty tile. Foes next to ' +
        'where it lands take ' + L.thud + ' damage.';
    },
    flavor: 'The party\'s fastest travel option. Also the most complained about.',
    execute: function (ctx) {
      const u = ctx.user, tg = ctx.target;
      if (!active(u) || !tg || (tg.x !== u.x && tg.y !== u.y)) return;
      const d = dirTo(u, tg);
      const ally = G().unitAt(u.x + d.x, u.y + d.y);
      if (!tossable(u, ally) || !G().isFree(tg.x, tg.y, ally)) return;
      const from = { x: ally.x, y: ally.y };
      const far = G().dist(from, tg);
      DD.FX.lunge(u, from);
      DD.FX.jump(ally, from, tg, { arc: 34 + far * 8, ms: 280 + far * 55 });
      DD.Act.teleport(ally, tg.x, tg.y, { fx: false });
      if (!active(ally)) return;
      DD.FX.particles(tg, { kind: 'dust', count: 14 });
      DD.FX.shake(4, 180);
      DD.Act.log(u.name + ' mails ' + ally.name + ' across the battlefield. No return address.', 'hero');
      DD.util.DIRS.forEach(function (dd) {
        const o = G().unitAt(tg.x + dd.x, tg.y + dd.y);
        if (active(o) && G().hostile(u, o)) DD.Act.damage(u, o, ctx.L.thud, { tags: ['throw', 'landing'] });
      });
    },
  });

  skill({
    id: 'sla_foot_down', name: 'Putting My Foot Down', icon: '👣', kind: 'attack', tags: ['aoe', 'push'], ap: 2, cooldown: 2,
    levels: [{ dmg: 4, push: 1, len: 2 }, { dmg: 5, push: 2, len: 2 }, { dmg: 6, push: 2, len: 3 }],
    target: { type: 'dir' },
    area: { shape: 'cone', size: function (L) { return L.len; } },
    desc: function (L) {
      return 'Stomp: foes in a cone of ' + L.len + ' take ' + L.dmg + ' damage and are pushed ' + plural(L.push, 'tile') + ' back.';
    },
    flavor: 'Not in this house. Not on this floor. Not anymore.',
    execute: function (ctx) {
      const u = ctx.user, d = ctx.dir;
      if (!active(u) || !d) return;
      DD.FX.lunge(u, step(u, d, 1));
      DD.FX.shake(9, 320);
      ctx.tiles.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'crack', { parallel: i > 0 }); });
      // the far ones first, so the near ones have somewhere to go
      const foes = ctx.foes.slice().sort(function (a, b) { return G().dist(u, b) - G().dist(u, a); });
      foes.forEach(function (f) {
        if (!active(f)) return;
        DD.Act.damage(u, f, ctx.L.dmg);
        if (active(f)) DD.Act.push(u, f, d, ctx.L.push);
      });
    },
  });

  skill({
    id: 'sla_lawn', name: 'Get Off My Lawn', icon: '🏡', kind: 'utility', tags: ['taunt', 'aoe', 'block'], ap: 1, cooldown: 2,
    levels: [{ block: 4, r: 2 }, { block: 6, r: 2 }, { block: 8, r: 3 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) {
      return 'Yell: every foe within ' + L.r + ' tiles is Taunted for its next turn, and you gain ' + L.block + ' Block.';
    },
    flavor: 'Everything within shouting distance is his lawn.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.text(u, 'GET OFF MY LAWN!', { color: '#ffe08a', size: 16 });
      DD.FX.shake(5, 250);
      ctx.foes.forEach(function (f) { if (active(f)) DD.Act.addStatus(f, 'taunt', { turns: 1 }, u); });
      DD.Act.addBlock(u, ctx.L.block);
    },
  });

  skill({
    id: 'sla_rock_bottom', name: 'Rock Bottom', icon: '🙃', kind: 'attack', tags: ['melee', 'throw', 'stun'], ap: 2, cooldown: 2,
    levels: [{ dmg: 10 }, { dmg: 12 }, { dmg: 12, stun: 1 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy', canTarget: liftTarget },
    area: { shape: 'custom', fn: function (ctx) {
      const u = ctx.user, tg = ctx.target;
      if (!u || !tg) return tg ? [tg] : [];
      const d = dirTo(u, tg);
      return [tg, { x: u.x - d.x, y: u.y - d.y }];
    } },
    desc: function (L) {
      return 'Lift an adjacent foe and slam it onto the tile behind you (if there\'s room): ' + L.dmg + ' damage' +
        (L.stun ? ', and it is Stunned for its next turn' : '') + '.';
    },
    flavor: 'Where every foe ends up eventually. Usually face first.',
    execute: function (ctx) {
      const u = ctx.user, v = ctx.targetUnit;
      if (!active(u) || !active(v) || G().dist(u, v) !== 1 || !liftable(u, v)) return;
      const d = dirTo(u, v);
      const behind = { x: u.x - d.x, y: u.y - d.y };
      const from = { x: v.x, y: v.y };
      DD.Act.withCredit(u, function () {
        let at = from;
        const tb = G().tile(behind.x, behind.y);
        const drop = !!tb && G().isDrop(behind.x, behind.y) && !G().isFlying(v) && !G().unitAt(behind.x, behind.y) && !(tb.obj && G().objBlocksMove(tb.obj));
        if (drop) {
          DD.FX.jump(v, from, behind, { arc: 46, ms: 380 });
          v.x = behind.x; v.y = behind.y;
          DD.Act.touch();
          DD.Act.fall(v, u);
          at = behind;
        } else if (tb && G().isFree(behind.x, behind.y, v)) {
          DD.FX.jump(v, from, behind, { arc: 46, ms: 380 });
          DD.Act.teleport(v, behind.x, behind.y, { fx: false });
          at = behind;
        }
        DD.FX.shake(10, 360);
        DD.FX.particles(at, { kind: 'dust', count: 16 });
        DD.FX.text(at, 'ROCK BOTTOM!', { color: RUNE, size: 16 });
        if (active(v)) DD.Act.damage(u, v, ctx.L.dmg, { tags: ['slam'] });
        if (active(v) && ctx.L.stun) DD.Act.addStatus(v, 'stun', { turns: 1 }, u);
      });
    },
  });

  skill({
    id: 'sla_gasket', name: 'Blow a Gasket', icon: '💢', kind: 'spell', tags: ['aoe', 'rune'], ap: 2, cooldown: 3,
    levels: [{ dmg: 3, per: 2 }, { dmg: 5, per: 2 }, { dmg: 5, per: 3 }],
    target: { type: 'self' },
    area: { shape: 'square', size: 1 },
    desc: function (L, user) {
      const now = user && Array.isArray(user.statuses) ? ' (' + (L.dmg + L.per * rage(user)) + ' right now)' : '';
      return 'Vent all your Rage: every foe in the 8 tiles around you takes ' + L.dmg + ' damage + ' + L.per + ' per Rage spent' + now + '.';
    },
    flavor: 'Nine hundred years of library shushing, released all at once.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      // spent first: the runes are dark while it lands, so the flare's +2 never doubles up with the Rage it spends
      const spent = spendRage(u);
      const dmg = ctx.L.dmg + ctx.L.per * spent;
      DD.FX.flash(RUNE, 180);
      DD.FX.explosion(u, { radius: 1, color: RUNE });
      DD.FX.shake(8 + spent * 2, 420);
      DD.FX.particles(u, { kind: 'runes', count: 12 + spent * 4, color: RUNE });
      DD.FX.text(u, spent >= 4 ? 'KA-BLAM!' : spent ? 'HRRRNGH!' : 'pfft.', { color: RUNE, size: 18 });
      ctx.foes.forEach(function (f) { if (active(f)) DD.Act.damage(u, f, dmg, { tags: ['rune'] }); });
    },
  });

  skill({
    id: 'sla_get_over_here', name: 'Get Over Here', icon: '⛓️', kind: 'spell', tags: ['ranged', 'pull', 'rune', 'combo'], ap: 1, cooldown: 2,
    levels: [{ dmg: 2, range: 4 }, { dmg: 3, range: 5 }, { dmg: 4, range: 6 }],
    target: { type: 'unit', filter: 'enemy', straight: true, los: true, range: function (L) { return [2, L.range]; } },
    desc: function (L) {
      return 'Lash a rune-chain at a foe in a straight line up to ' + L.range + ' tiles away: ' + L.dmg + ' damage, and pull it next to you.';
    },
    flavor: 'Runes: for writing, warding, and yanking people by the collar.',
    execute: function (ctx) {
      const u = ctx.user, v = ctx.targetUnit;
      if (!active(u) || !active(v)) return;
      DD.FX.beam(u, v, { color: RUNE, width: 3 });
      DD.Act.damage(u, v, ctx.L.dmg, { tags: ['rune'] });
      if (active(v) && active(u)) DD.Act.pull(u, v, u, ctx.L.range);
    },
  });

  skill({
    id: 'sla_tantrum', name: 'Tectonic Tantrum', icon: '🤬', kind: 'attack', tags: ['aoe', 'push'], ap: 2, hype: 100,
    levels: [{ dmg: 15, push: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: 2 },
    desc: function (L) {
      return 'The ground heaves: every foe within 2 tiles takes ' + L.dmg + ' damage and is knocked ' + L.push + ' tiles away from you. ' +
        'Then your Rage maxes out.';
    },
    flavor: 'Seismologists call it an event. He calls it Tuesday.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.flash(RUNE, 260);
      DD.FX.shake(16, 700);
      DD.FX.explosion(u, { radius: 2, color: RUNE });
      DD.FX.particles(u, { kind: 'runes', count: 30, color: RUNE });
      ctx.tiles.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'crack', { parallel: i > 0 }); });
      const foes = ctx.foes.slice();
      foes.forEach(function (f) { if (active(f)) DD.Act.damage(u, f, ctx.L.dmg); });
      foes.sort(function (a, b) { return G().dist(u, b) - G().dist(u, a); }).forEach(function (f) {
        if (active(f) && active(u)) DD.Act.knockback(u, f, ctx.L.push);
      });
      if (active(u)) gainRage(u, MAX_RAGE);
    },
  });

  // ---- sprite: a hunched slab of pale-blue stone, heavy brow, runes that light up with Rage ---------------
  function rageStacks(unit) {
    const list = unit && unit.statuses;
    if (!Array.isArray(list)) return 0;
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === RAGE) return list[i].stacks || 0;
    return 0;
  }
  /** Is this unit holding someone right now (a Grappled status sourced to it on the board)? Pose only. */
  function isHolding(unit) {
    const s = S();
    if (!s || !Array.isArray(s.units) || !unit || unit.id == null) return false;
    for (let i = 0; i < s.units.length; i++) {
      const o = s.units[i];
      if (!o || o.dead || o.id === unit.id || !Array.isArray(o.statuses)) continue;
      for (let k = 0; k < o.statuses.length; k++) if (o.statuses[k] && o.statuses[k].id === HELD && o.statuses[k].source === unit.id) return true;
    }
    return false;
  }
  function strokeLines(c, segs, color, width) {
    c.beginPath();
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      c.moveTo(s[0], s[1]);
      for (let k = 2; k + 1 < s.length; k += 2) c.lineTo(s[k], s[k + 1]);
    }
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
    c.lineCap = 'butt';
  }
  /** Carved rune grooves, lit cyan from the inside as flare (0..1) rises. */
  function runeLines(g, segs, flare, glow) {
    const c = g.ctx;
    strokeLines(c, segs, g.pal.metal, 1.35);
    if (flare <= 0.02) return;
    if (glow) for (let i = 0; i < glow.length; i++) g.glow(glow[i][0], glow[i][1], 4 + 4 * flare, g.pal.accent, 0.45 * flare);
    c.save();
    c.globalAlpha *= Math.min(1, flare);
    strokeLines(c, segs, g.pal.accent, 1.5);
    if (flare >= 1) strokeLines(c, segs, '#f2feff', 0.55);
    c.restore();
  }
  function fist(g, x, y, w, h, col) {
    g.shaded(function (p) {
      p.moveTo(x - w / 2 + 2, y - h / 2); p.lineTo(x + w / 2 - 1.5, y - h / 2); p.quadraticCurveTo(x + w / 2 + 0.8, y - h / 2, x + w / 2 + 0.8, y - h / 2 + 2);
      p.lineTo(x + w / 2, y + h / 2 - 1.5); p.quadraticCurveTo(x + w / 2, y + h / 2, x + w / 2 - 2, y + h / 2);
      p.lineTo(x - w / 2 + 1.5, y + h / 2); p.quadraticCurveTo(x - w / 2 - 0.6, y + h / 2, x - w / 2 - 0.6, y + h / 2 - 2);
      p.lineTo(x - w / 2, y - h / 2 + 2); p.quadraticCurveTo(x - w / 2, y - h / 2, x - w / 2 + 2, y - h / 2); p.closePath();
    }, col, { dx: 0.9, dy: -0.9 });
    g.line(x - w / 2 + 2.2, y - 0.6, x + w / 2 - 1.8, y - 0.6, g.shade(col, -0.35), 0.8);
  }
  /** One arm hanging from a shoulder pivot (angle 0 = straight down, negative swings it forward). */
  function arm(g, sx, sy, ang, col, front, flare) {
    const c = g.ctx;
    c.save();
    c.translate(sx, sy);
    c.rotate(ang);
    g.shaded(function (p) { p.moveTo(-4.2, -1); p.lineTo(4.4, -1); p.lineTo(5, 12); p.lineTo(-4.6, 12); p.closePath(); }, col, { dx: 0.8, dy: -0.8 });
    g.shaded(function (p) { p.moveTo(-4.8, 11); p.lineTo(5.4, 11); p.lineTo(5.8, 17.5); p.lineTo(-5.4, 17.5); p.closePath(); }, g.shade(col, -0.05), { dx: 0.8, dy: -0.8 });
    fist(g, 0.4, 21, front ? 11 : 10, front ? 8.6 : 8, front ? col : g.shade(col, -0.06));
    if (front) runeLines(g, [[-3.5, 13.2, 4.2, 13.2], [-3.2, 15.4, 4.6, 15.4], [0, 3, 0, 8, 2.4, 6]], flare, [[0.5, 14.3]]);
    c.restore();
  }

  function drawSlate(g, t, o) {
    o = o || {};
    const c = g.ctx, P = g.pal;
    const unit = o.unit || g.unit;
    const r = unit ? rageStacks(unit) : -1;
    const flare = r < 0 ? 0.45 : r >= FLARE ? 1 : r * 0.18;
    const hot = flare >= 1;
    const pose = g.pose;
    const pt = typeof g.poseT === 'number' ? g.poseT : 0.5;
    const still = !!o.still;
    const br = still ? 0 : Math.sin(t * 1.5) * 0.5;
    const walk = typeof o.walk === 'number' ? Math.sin(o.walk * Math.PI * 2) : 0;
    const stone = P.skin, dark = P.cloth, light = P.cloth2;
    const lying = o.lying || 0;

    // arm angles: overhead smash on attack, both raised on cast, flinch on hurt, reaching forward while holding
    let fa = still ? 0 : Math.sin(t * 1.5 + 1) * 0.04, ba = -fa * 0.6;
    if (pose === 'attack') fa = pt < 0.45 ? -2.5 * (pt / 0.45) : -2.5 + 1.7 * ((pt - 0.45) / 0.55);
    else if (pose === 'cast') { fa = -2.55; ba = 2.4; }
    else if (pose === 'hurt') { fa = 0.38; ba = -0.28; }
    else if (unit && isHolding(unit)) fa = -0.95;

    // back aura (raging only)
    if (hot) {
      g.glow(2, -22, 30, P.accent, 0.2 + 0.07 * Math.sin(t * 4));
      for (let i = 0; i < 3; i++) {
        const a = t * 1.3 + i * 2.094;
        if (Math.sin(a) >= 0) continue;
        const x = Math.cos(a) * 24, y = -24 + Math.sin(a * 2) * 3 + Math.sin(a) * 4;
        g.glow(x, y, 5, P.accent, 0.5);
        strokeLines(c, [[x, y - 2.6, x, y + 2.6], [x - 1.8, y - 1, x + 1.8, y + 1]], P.accent, 1.1);
      }
    }

    // back arm, legs
    arm(g, -12.5, -29 + br, ba, g.shade(stone, -0.2), false, flare);
    const legY = -12;
    const lf = walk * 2.2, lb = -walk * 2.2;
    g.shaded(function (p) { p.moveTo(-9.5 + lb, legY); p.lineTo(-2 + lb, legY); p.lineTo(-1.5 + lb, -0.2 - Math.max(0, walk) * 1.2); p.lineTo(-10.5 + lb, -0.2 - Math.max(0, walk) * 1.2); p.closePath(); }, g.shade(stone, -0.22), { dx: 0.8, dy: -0.8 });
    g.shaded(function (p) { p.moveTo(1.5 + lf, legY); p.lineTo(9.5 + lf, legY); p.lineTo(10.5 + lf, -0.2 - Math.max(0, -walk) * 1.2); p.lineTo(1 + lf, -0.2 - Math.max(0, -walk) * 1.2); p.closePath(); }, g.shade(stone, -0.05), { dx: 0.8, dy: -0.8 });
    runeLines(g, [[5 + lf, -9, 5 + lf, -4, 7.2 + lf, -6]], flare, null);

    // torso: a hunched boulder, wide at the shoulders
    const ty = br;
    const torso = function (p) {
      p.moveTo(-11, -10 + ty);
      p.lineTo(11.5, -10 + ty);
      p.quadraticCurveTo(15.5, -10 + ty, 16.5, -16 + ty);
      p.lineTo(18, -29 + ty);
      p.quadraticCurveTo(18, -35 + ty, 11, -35.5 + ty);
      p.lineTo(-8, -36.8 + ty);
      p.quadraticCurveTo(-16, -36.5 + ty, -16, -29 + ty);
      p.lineTo(-14.5, -15 + ty);
      p.quadraticCurveTo(-14, -10 + ty, -11, -10 + ty);
      p.closePath();
    };
    g.shaded(torso, stone, { dx: 1.8, dy: -1.6, dark: dark, hl: [3, -30 + ty, 7, 2, -0.15], light: g.rgba(light, 0.9) });
    // cracks, chips and a moss patch (he is very old)
    g.line(-9, -31 + ty, -6, -26 + ty, g.shade(stone, -0.45), 0.9);
    g.line(-6, -26 + ty, -8, -21 + ty, g.shade(stone, -0.45), 0.9);
    g.line(11, -19 + ty, 14, -15 + ty, g.shade(stone, -0.45), 0.9);
    g.ellipse(-10.5, -35.4 + ty, 4.2, 1.6, P.hair, null);
    g.ellipse(-8, -36.2 + ty, 2.2, 1.1, g.shade(P.hair, 0.15), null);
    // belt of carved slabs + the big chest rune
    g.line(-12.5, -13.5 + ty, 14, -13.5 + ty, g.shade(stone, -0.35), 1);
    runeLines(g, [[1.5, -29 + ty, 1.5, -17 + ty], [1.5, -25.5 + ty, 6.5, -28.5 + ty], [1.5, -21.5 + ty, -3.5, -24.5 + ty], [1.5, -18 + ty, 5.5, -15 + ty],
      [-9, -18 + ty, -6.5, -20.5 + ty, -4, -18 + ty], [9, -24 + ty, 12, -24 + ty, 12, -21 + ty]], flare, [[1.5, -23 + ty], [-6.5, -19 + ty], [11, -23 + ty]]);

    // near shoulder boulder (the head sits over it, the arm hangs in front of both)
    g.shaded(function (p) { p.arc(15.5, -29.5 + br, 6.6, 0, Math.PI * 2); }, stone, { dx: 1, dy: -1.2, dark: dark, hl: [14, -32.5 + br, 2.6, 1.2, -0.3] });
    runeLines(g, [[13, -31 + br, 15.5, -27.5 + br, 18, -31 + br]], flare, [[15.5, -29.5 + br]]);

    // head: a small block sunk low between the shoulders (hunched), forward-set, with a brow like a cliff ledge
    const hy = br * 1.2;
    c.save();
    c.translate(1.5, 2.5);
    g.shaded(function (p) {
      p.moveTo(-1, -31 + hy); p.lineTo(-1.5, -40 + hy); p.quadraticCurveTo(-1.5, -43 + hy, 2, -43 + hy);
      p.lineTo(10, -42.5 + hy); p.quadraticCurveTo(13, -42.5 + hy, 13, -39 + hy); p.lineTo(12.5, -31 + hy); p.closePath();
    }, stone, { dx: 1, dy: -1, dark: dark, hl: [5, -41 + hy, 3.5, 1, 0] });
    g.ellipse(4.5, -43 + hy, 3.2, 1.1, P.hair, null);
    // eyes: deep-set slits under the brow (X X when knocked out, shut when blinking)
    const eyeY = -36 + hy;
    if (lying >= 0.6) {
      strokeLines(c, [[3.2, eyeY - 1.2, 5.6, eyeY + 1.2], [3.2, eyeY + 1.2, 5.6, eyeY - 1.2], [7.6, eyeY - 1.2, 10, eyeY + 1.2], [7.6, eyeY + 1.2, 10, eyeY - 1.2]], P.outline, 0.9);
    } else if (g.blink || pose === 'hurt') {
      strokeLines(c, [[3, eyeY, 5.8, eyeY + 0.3], [7.4, eyeY + 0.3, 10.2, eyeY]], P.outline, 0.9);
    } else {
      const ec = hot ? '#ffffff' : P.eye;
      g.glow(4.4, eyeY, 2.6 + 2 * flare, P.accent, 0.35 + 0.45 * flare);
      g.glow(8.8, eyeY, 2.6 + 2 * flare, P.accent, 0.35 + 0.45 * flare);
      g.rect(3, eyeY - 0.7, 2.8, 1.5, ec, null);
      g.rect(7.4, eyeY - 0.7, 2.8, 1.5, ec, null);
    }
    // the brow: two heavy slabs meeting low in the middle (permanently unimpressed)
    g.poly([[-1.8, -40.2 + hy], [6.3, -37.4 + hy], [6.6, -35.8 + hy], [-1.4, -38 + hy]], g.shade(stone, -0.35), P.outline, g.lw * 0.7);
    g.poly([[13.4, -40.5 + hy], [6.6, -37.4 + hy], [6.4, -35.8 + hy], [13, -38.2 + hy]], g.shade(stone, -0.28), P.outline, g.lw * 0.7);
    // frown crack + jaw line
    strokeLines(c, [[3.6, -32.6 + hy, 6.4, -33.6 + hy, 9.6, -32.4 + hy]], P.outline, 1);
    g.line(0, -31.2 + hy, 12, -31.2 + hy, g.shade(stone, -0.4), 0.8);
    runeLines(g, [[11.2, -39.5 + hy, 11.2, -36 + hy]], flare, null);
    c.restore();

    arm(g, 16, -27.5 + br, fa, stone, true, flare);

    // raging: steam out of the ears, sparks rising, front rune glyphs
    if (hot && !still) {
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.8 + i / 3) % 1;
        c.save();
        c.globalAlpha *= 0.55 * (1 - p);
        g.circle(0.5 + Math.sin(p * 5 + i) * 2 - p * 3, -39.5 - p * 12 + hy, 1.6 + p * 3, '#e8f6ff', null);
        c.restore();
      }
      for (let i = 0; i < 3; i++) {
        const a = t * 1.3 + i * 2.094;
        if (Math.sin(a) < 0) continue;
        const x = Math.cos(a) * 24, y = -24 + Math.sin(a * 2) * 3 + Math.sin(a) * 4;
        g.glow(x, y, 5, P.accent, 0.55);
        strokeLines(c, [[x, y - 2.6, x, y + 2.6], [x - 1.8, y - 1, x + 1.8, y + 1]], '#e8fdff', 1.1);
      }
    }
  }

  const SPRITE = {
    base: 'custom', scale: 1.15, draw: drawSlate,
    palette: { skin: '#9fb7c9', cloth: '#6c8699', cloth2: '#dbe8f0', hair: '#7a9a52', metal: '#587489', eye: '#c6f7ff', accent: RUNE, outline: '#17212b' },
    height: 42, width: 34, headY: -34,
    portrait: { x: 5, y: -32, r: 12.5 },
  };

  // ---- the hero ----------------------------------------------------------------------------------------
  DD.registerHero({
    id: 'slate', name: 'Slate', epithet: 'the Unamused', race: 'Stone Golem', cls: 'Guardian (Retired)',
    role: 'Grappler / thrower / bruiser', complexity: 2,
    blurb: 'Lich-tenstein\'s library golem, who quit on the spot after nine hundred years of shushing. Grabs whatever ' +
      'comes near, throws whatever stays, and gets angrier every time anyone touches him (healing counts). Nothing ' +
      'short of an earthquake moves him, and his runes glow when he\'s mad, so they are basically always on.',
    color: '#6fd3e6',
    unlock: null, // v2: every hero is available from the start (user request; was: beat Lich-tenstein)
    stats: { hp: 32, ap: 3, mov: 3, armor: 1, init: -2 },
    growth: { hp: 4 },
    flags: { immovable: true },
    sprite: SPRITE,
    basic: 'sla_love_tap',
    signature: 'sla_tantrum',
    passive: {
      name: 'Short Fuse',
      desc: 'Gains 1 Rage (max ' + MAX_RAGE + ') whenever someone else hits, heals or buffs him. At ' + FLARE + '+ Rage his runes ' +
        'flare: his skills deal +' + FLARE_DMG + ' damage.',
      hooks: {
        onTakeDamage: function (d) {
          const u = d && d.target;
          if (u && u.hp > 0 && d.amount > 0) touched(u, d.source);
        },
        onHealed: function (unit, amount, src) { if (amount > 0) touched(unit, src); },
        onStatusApplied: function (unit, st, src) {
          if (!st) return;
          // he can't hold on to anything while stunned, asleep, frozen or a sheep
          if (DD.Act.isStunLike(st.id) || st.id === 'sheep') { releaseAll(unit, 'Dropped!'); return; }
          const def = DD.getStatus(st.id);
          if (def && def.type === 'buff') touched(unit, src);
        },
        modifyOutgoingDamage: function (d) { if (skillHit(d) && flared(d.source)) d.flat += FLARE_DMG; },
        onEnterTile: function (u, tile, cause) { dragStep(u, cause); },
        onMove: function (u) { afterWalk(u); },
        onDowned: function (u) { releaseAll(u, 'Dropped!'); },
      },
    },
    startingSkills: ['sla_hold_still', 'sla_personal_space'],
    skillPool: ['sla_hold_still', 'sla_personal_space', 'sla_rocks_fall', 'sla_air_mail', 'sla_foot_down', 'sla_lawn',
      'sla_rock_bottom', 'sla_gasket', 'sla_get_over_here'],
    summons: [],
    barks: {
      select: ['Hmph.', 'What. WHAT.', 'I was napping. For a century.', 'Don\'t touch me. Just point.', 'Fine. Who needs throwing?',
        'Kiri. Stop walking through me.'],
      start: ['Get off my lawn.', 'Fighting. Again. Wonderful.', 'Nine hundred years of shushing. No more whispering.',
        'Everybody stay where I can throw you.', 'Let\'s get this over with.', 'Betty. Do NOT eat the map.'],
      move: ['My knees are gravel.', 'Walking. Hate it.', 'Coming through. Move or be moved.', 'One step at a time. Literally.',
        'Hmph. Stairs. Of course.'],
      kill: ['Stay down.', 'Hmph. Kids.', 'And STAY off my lawn.', 'That\'s what you get.', 'Next.', 'Basanos, drop it. That one\'s mine.'],
      hurt: ['OW. Rude.', 'That chipped me.', 'Now I\'m annoyed.', 'Hands OFF.', 'You\'ll regret that. Briefly.'],
      lowhp: ['I\'m... crumbling.', 'Need a chisel. And a nap.', 'It\'s just a stone wound.', 'This is why I hate adventuring.',
        'Josiah. Rock glue. Now.'],
      downed: ['Rocks... fall...', 'Tell Kevin... I said... hmph.', 'Wake me... when it\'s quiet.', 'Finally. A nap.',
        'I\'m not crying. It\'s erosion.'],
      revive: ['Who woke me. WHO.', 'Did I ASK for help?', 'Ugh. Back to work.', 'I was enjoying that.', 'Fine. Up. Happy?'],
      ally_down: ['Get up. You\'re embarrassing us.', 'Nobody hits them but ME.', 'Now I\'m REALLY angry.', 'Hmph. Lightweight.',
        'Somebody help them. Not me. ...Fine. Me.'],
      levelup: ['Great. More responsibility.', 'Another rune. Whoop-de-doo.', 'Stronger. Still grumpy.', 'I feel slightly less ancient.',
        'Don\'t throw me a party. I\'ll throw it back.'],
      victory: ['Finally. Quiet.', 'Everybody off my lawn.', 'Hmph. Adequate.', 'Can I go back to sleep now?',
        'Don\'t hug me. Marwyn. MARWYN.'],
      idle: ['Somebody shelve these goblins. Alphabetically.', 'Zarathor, your bling is giving me a headache.', 'Syllamin. Indoor voice.',
        'Marbles, you\'re asleep on my foot again.', 'Ellaria, if that corgi licks me one more time...',
        'Buga. Stop buttering my shoulder.'],
      signature: ['THAT\'S IT. EVERYBODY OUT.', 'I\'VE HAD IT UP TO HERE!', 'TANTRUM. TIME.', 'THE FLOOR GOES TOO!', 'GET. OFF. MY. LAWN!'],
    },
  });

  // ---- items -------------------------------------------------------------------------------------------
  DD.registerItem({
    id: MITTS, name: 'Mitts of Unreasonable Velocity', slot: 'weapon', rarity: 'rare', icon: '⚾', hero: 'slate',
    stats: { dmg: 0.1 },
    desc: '+10% damage. Personal Space and Air Mail throw 1 tile further.',
    flavor: 'Oven mitts, technically. He refuses to explain.',
    hooks: { modifyRange: function (m) { if (m.skill && THROW_RANGE[m.skill.id]) m.max += 1; } },
  });
  DD.registerItem({
    id: CARDIGAN, name: 'Cardigan of Disapproval', slot: 'armor', rarity: 'rare', icon: '🧶', hero: 'slate',
    stats: { hp: 6 },
    desc: '+6 max HP. Slate gains ' + CARDIGAN_BLOCK + ' Block for every Rage he gains.',
    flavor: 'Knitted by a grateful village in 1309. He has never said thank you.',
  });
  DD.registerItem({
    id: LEDGER, name: 'The Grudge Ledger', slot: 'trinket', rarity: 'legendary', icon: '📜', hero: 'slate',
    stats: { dmg: 0.1 },
    desc: '+10% damage. Short Fuse gives Slate 2 Rage instead of 1 (every grudge is recorded twice).',
    flavor: 'Every slight since the Bronze Age, alphabetized. You are in it. Twice.',
  });

  // ---- loading-screen tips -------------------------------------------------------------------------------
  DD.registerNarration('tips', [
    'Slate gains Rage whenever anyone hits, heals or buffs him. At 3 Rage his runes flare: +2 damage on his skills.',
    'Heal Slate anyway. He hates it, and it makes him angrier. Everybody wins.',
    'A foe Slate is holding can\'t move, and it comes along when he walks. Drag it somewhere unpleasant, then throw it.',
    'Throw goblins at goblins. Throw them into pits. Throw them into water, then call someone with lightning.',
  ]);

  // a tiny public surface for other content (bosses / items / events that want to poke Slate)
  DD.Slate = { rage: rage, flared: flared, gainRage: gainRage, spendRage: spendRage, heldBy: heldBy, holderOf: holderOf,
    grab: grab, release: release, flight: flight, throwUnit: throwUnit, throwObject: throwObject, objThrowable: objThrowable };
})();
