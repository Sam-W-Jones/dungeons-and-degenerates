/* Dungeons and Degenerates — js/data/heroes/slate.js
 * Slate, the Unamused: Lich-tenstein's grumpy pale-blue library golem. Grappler / thrower / bruiser (v2, simple kit).
 * Passive Short Fuse: +1 Rage (sla_rage, max 5) whenever someone else hits him, heals him or gives him a buff status
 * (Block from an ally is no buff status: playtest heroes-6); at 3+ Rage his runes flare and his skills deal +2 damage. Rage never drains; Blow a Gasket spends it, the signature maxes it.
 * Grappled (sla_grappled, on the victim, noMove): it can't move, and when Slate walks it is dragged into the tile he
 * left (it gets no attack of opportunity on him); it ends when they are apart, when he can't hold on (stunned, sheep,
 * downed) or when he lets go. Sustain (D9, Nov 12): the hold counts SLATE's turns (decay 'never'; Short Fuse's
 * onTurnEnd ticks it, the grab turn's own end doesn't count), so it lasts until the end of his next 1-2 turns and he can
 * still squeeze (Stress Ball: damage + a self-heal), drag or throw it then; the victim is held for the same number of
 * its own turns as before. Only Hold Still grabs: another caller of DD.Slate.grab whose holder has no Short Fuse must
 * call DD.Slate.tickHold(holder) at that holder's turn ends itself.
 * Conditional heal (Nov 18, "It Is Not a Hug"): at the end of each of his turns while he holds a foe (the grab turn
 * too), he heals Hold Still's `hug` (4/5/5, stored on the Grappled instance; 4 for a direct grab), via 'lift:slate';
 * a turn he squeezed with Stress Ball skips it (one grapple heal per turn). tickHold runs it before the countdown.
 * Throws lift an adjacent unit or object and land it up to N tiles away in a line, over units and low clutter: it and
 * the foe it hits take the damage, pits / lava / water do the rest, thrown objects shatter (barrels explode). Throws,
 * slams, drags and pulls are forced movement: they never provoke attacks of opportunity (Air Mail is an escape hatch).
 * Registers the hero, 12 skills, 2 statuses, the Boulder object, 3 items and loading tips. All state lives on units /
 * statuses (previews are dry runs of the same code).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const RAGE = 'sla_rage', HELD = 'sla_grappled', BOULDER = 'sla_boulder';
  const MITTS = 'sla_mitts', CARDIGAN = 'sla_cardigan', LEDGER = 'sla_ledger';
  const MAX_RAGE = 5, FLARE = 3, FLARE_DMG = 2, CARDIGAN_BLOCK = 2;
  // AutoPlay: pinning a foe through its next turn, on top of the generic Grappled debuff term (sustain refit: 1.5 -> 2.5,
  // the spec's fallback: he grabbed 0.9 times an act 1 regular fight, target 1.2; docs/notes/balance.md)
  const HOLD_AI = 2.5;
  // Nov 18 conditional heal: Hold Still's turn-end hold heal per level (`hug`, never `heal`: AutoPlay's quick pass credits L.heal).
  // The conditional-healing balance pass raised the plan's 3/4/4 one step (T8: 0.98 hold heals a fight against 1.0;
  // holdValue prices the hug, so a bigger one buys grabs; docs/notes/balance.md)
  const HUG = [4, 5, 5];
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
  /** A skill socketed on this unit or run hero (combat slots and run heroes both keep skills as [{ id, level }]). */
  function hasSkill(u, id) {
    return !!u && Array.isArray(u.skills) && u.skills.some(function (s) { return !!s && (s === id || s.id === id); });
  }
  function dirTo(a, b) { return DD.util.dirTo(a, b); }
  function step(p, d, k) { return { x: p.x + d.x * k, y: p.y + d.y * k }; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function objName(o) { const d = DD.getObject(o.id); return String(o.label || (d ? d.name : o.id)).toLowerCase(); }
  /** A skill's target reach for this unit: the base number plus its range changes (DD.Targeting.reach: a Yardstick, Dazzle,
   *  the Mitts' modifyRange; playtest heroes-v1 / desc-sweep-5). Without a combat unit (codex, shop): the base. */
  function reach(user, id, L, base) {
    const d = DD.getSkill(id);
    if (!user || !user.side || !d || !DD.Targeting || typeof DD.Targeting.reach !== 'function') return base;
    return DD.Targeting.reach(d, L, user, base);
  }
  /** Throw distance: the throw's target range less the tile it is lifted from (the Mitts of Unreasonable Velocity +1,
   *  a +range item +1); out of a fight, the Mitts alone. */
  function throwRange(L, user, id) {
    if (user && user.side) return reach(user, id, L, L.range);
    return L.range + (hasItem(user, MITTS) ? 1 : 0);
  }

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

  /** Seize v until the end of Slate's next `turns` turns (one hold at a time). Returns true if it is now held. */
  function grab(slate, v, turns) {
    if (!canHold(slate) || !liftable(slate, v) || G().dist(slate, v) !== 1) return false;
    const old = heldBy(slate);
    if (old && old !== v) release(old, 'Dropped!');
    const st = DD.Act.addStatus(v, HELD, { turns: turns, silent: true }, slate);
    if (!st) return false;
    // a grab on his own turn: that turn's end doesn't count (tickHold); a refresh keeps the same instance and data
    st.data = st.data || {};
    st.data.slaFresh = DD.Act.isOwnTurn(slate);
    st.data.hug = HUG[0];   // Hold Still writes its level's `hug` over this after a successful grab
    DD.FX.text(v, 'Grappled!', { color: RUNE, size: 15 });
    DD.Act.log(slate.name + ' grabs ' + v.name + '. It is not a hug.', 'hero');
    return true;
  }

  /** His per-fight bookkeeping (unit.data.sla; dry runs deep-copy it). */
  function slaData(u) {
    const d = u.data || (u.data = {});
    return d.sla || (d.sla = { squeeze: -1 });
  }
  /** True when he squeezed with Stress Ball this turn (pure: never creates his bookkeeping). */
  function squeezed(u) {
    const s = S(), d = u && u.data && u.data.sla;
    return !!s && !!d && d.squeeze === s.turn;
  }
  /** The hold heal the Grappled instance carries (Hold Still's level; 3 for a direct grab). */
  function hugOf(st) { const n = st && st.data && +st.data.hug; return n > 0 ? n : HUG[0]; }

  /**
   * Nov 18 "It Is Not a Hug": at the end of his turn, still holding v (he can hold on, they are adjacent) and no Stress
   * Ball squeeze this turn → he heals the hold's hug. Always called when that holds (0 at full HP: the sim counts fires).
   */
  function hugHeal(slate, v, st) {
    if (!holdOk(slate, v) || squeezed(slate)) return 0;
    const n = DD.Act.heal(slate, slate, hugOf(st), { via: 'lift:slate' });
    if (n > 0) {
      DD.Act.log(slate.name + ' holds ' + v.name + ' very, very still. It is NOT a hug. He feels a little better anyway.', 'hero');
      DD.Act.maybeBark(slate, 'hug', 0.35);
    }
    return n;
  }

  /** Grappled counts Slate's turns: the grab turn's own end doesn't count, then each of his turn ends takes one. */
  function tickHold(slate) {
    const v = heldBy(slate), st = v && getSt(v, HELD);
    if (!st) return;
    // the hold heal comes first: the grab turn's end heals too, and so does the turn he lets go
    hugHeal(slate, v, st);
    if (!getSt(v, HELD) || st.turns < 0) return;
    if (st.data && st.data.slaFresh) { st.data.slaFresh = false; return; }
    st.turns -= 1;
    if (st.turns <= 0) release(v, 'Let go.');
    else DD.Act.touch();
  }
  /** Pure: v's hold ends at the end of the turn under way (its holder is acting, last turn, not the grab turn). */
  function releasesThisTurn(v) {
    const st = getSt(v, HELD), h = st && byId(st.source);
    return !!h && DD.Act.isOwnTurn(h) && !(st.data && st.data.slaFresh) && st.turns <= 1;
  }
  /** When the hold ends, in the holder's turns (the Grappled desc). */
  function holdEnds(h, st) {
    const n = st && st.turns > 0 ? st.turns : 1;
    const own = !!h && DD.Act.isOwnTurn(h) && !(st && st.data && st.data.slaFresh);
    if (own) return n === 1 ? 'this turn' : 'his next ' + (n - 1 === 1 ? 'turn' : (n - 1) + ' turns');
    return 'his next ' + (n === 1 ? 'turn' : n + ' turns');
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
   * null for an object): { end, land, shatter, k, wall, crash, crashObj, drop }. end = the tile it comes down on
   * (short of a wall), land = where a thrown unit ends up (it bounces back short of a crash), shatter = where a thrown
   * object breaks (on the foe it hits, else short of anything in the way), drop = a pit / deep water at end.
   */
  function flight(from, dir, n, mover) {
    let k = 0, wall = false;
    for (let i = 1; i <= n; i++) {
      const p = step(from, dir, i);
      if (stopsFlight(p.x, p.y)) { wall = true; break; }
      k = i;
    }
    const end = step(from, dir, k);
    const res = { end: end, land: end, shatter: end, k: k, wall: wall, crash: null, crashObj: false, drop: false };
    if (k === 0) { res.land = res.shatter = { x: from.x, y: from.y }; return res; }
    const occ = G().unitAt(end.x, end.y);
    const tl = G().tile(end.x, end.y);
    const objBlocks = !!(tl.obj && G().objBlocksMove(tl.obj));
    // a thrown object can't come down on another object, not even a flat one (spikes, a rune): it lands short
    const blocked = !!(occ && occ !== mover) || objBlocks || (!mover && !!tl.obj);
    const drop = G().isDrop(end.x, end.y) && !(mover && G().isFlying(mover));
    // odd unwalkable ground that is neither a wall nor a drop: it bounces off like a wall
    const unwalkable = !blocked && !drop && !!mover && !G().isWalkable(end.x, end.y, mover);
    if (blocked || unwalkable) {
      res.wall = res.wall || unwalkable;
      res.crash = occ && occ !== mover ? occ : null;
      res.crashObj = !res.crash && objBlocks;
      res.land = { x: from.x, y: from.y };
      for (let i = k - 1; i >= 1; i--) {
        const p = step(from, dir, i);
        const ok = mover ? G().isFree(p.x, p.y, mover) : !G().tile(p.x, p.y).obj && !G().isDrop(p.x, p.y);
        if (ok) { res.land = p; break; }
      }
      res.shatter = res.crash && !tl.obj ? end : res.land;
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

  /**
   * The object breaks where it lands: placed (non-blocking, so it may share a unit's tile) and destroyed at once. If
   * something left an object there mid-throw (a foe that drops bones), it breaks on the nearest clear tile back toward
   * Slate (its own tile is clear: it was just picked up).
   */
  function shatter(user, inst, at, dir, from) {
    let p = at;
    for (let i = 0; i < 8; i++) {
      const t = G().tile(p.x, p.y);
      if (t && !t.obj && !G().isDrop(p.x, p.y)) break;
      if (p.x === from.x && p.y === from.y) return false;
      p = { x: p.x - dir.x, y: p.y - dir.y };
    }
    DD.FX.particles(p, { kind: 'dust', count: 14 });
    const o = DD.Act.placeObject(p.x, p.y, inst.id, Object.assign({}, inst, { blocksMove: false }));
    return o ? DD.Act.destroyObject(p.x, p.y, user) : false;
  }

  /** Throw the object at `at` along dir for up to n tiles: the foe it hits takes dmg, then it shatters. */
  function throwObject(user, at, dir, n, dmg) {
    const t = G().tile(at.x, at.y);
    const inst = t && t.obj;
    if (!inst) return false;
    DD.Act.removeObject(at.x, at.y);
    const f = flight(at, dir, n, null);
    DD.FX.projectile(at, f.drop ? f.end : f.shatter, { kind: 'custom', arc: 22 + f.k * 8, ms: 260 + f.k * 50, sound: 'push', draw: objDrawer(inst.id) });
    DD.Act.withCredit(user, function () {
      if (f.drop) {
        DD.FX.particles(f.end, { kind: 'dust', count: 10 });
        DD.Act.log('The ' + objName(inst) + ' tumbles into the abyss.', 'system');
        return;
      }
      if (f.crash && active(f.crash) && G().hostile(user, f.crash)) DD.Act.damage(user, f.crash, crashDmg(user, dmg), { cause: 'bump', tags: ['throw', 'crash'] });
      if (f.crashObj) DD.Act.damageObject(user, f.end.x, f.end.y, dmg);
      shatter(user, inst, f.shatter, dir, at);
    });
    return true;
  }

  // ---- statuses ----------------------------------------------------------------------------------------
  DD.registerStatus({
    id: RAGE, name: 'Rage', icon: '💢', color: RUNE, type: 'buff', stacking: 'stack', maxStacks: MAX_RAGE,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      return 'Rage ' + st.stacks + '/' + MAX_RAGE + '. At ' + FLARE + '+ his runes flare: his skills deal +' + FLARE_DMG + ' damage. ' +
        '+1 whenever someone else hits him, heals him or gives him a buff status (Block doesn\'t count).';
    },
  });

  DD.registerStatus({
    id: HELD, name: 'Grappled', icon: '🤼', color: RUNE, type: 'debuff', stacking: 'refresh', maxStacks: 1,
    // turns = the holder's turns: Short Fuse's onTurnEnd ticks it (tickHold), never the victim's own turn ends
    decay: 'never', defaultTurns: 1, noMove: true,
    // [finish review, audit-7] predictions (DD.Act.cantMoveNext: threat shading, AutoPlay's danger): still held when the
    // victim's next turn starts? Each of Slate's turn ends before then takes one (the grab turn's own end doesn't count)
    heldThrough: function (st, v) {
      const h = byId(st && st.source);
      if (!holdOk(h, v)) return false;
      const ends = (DD.Act.isOwnTurn(h) ? 1 : 0) + (DD.AI && DD.AI.turnsBefore ? DD.AI.turnsBefore(h, v) : 1);
      return ends < (st.turns > 0 ? st.turns : 1) + (st.data && st.data.slaFresh ? 1 : 0);
    },
    desc: function (st) {
      const h = byId(st && st.source), name = h ? h.name : 'Slate';
      return 'Held by ' + name + ': can\'t move, and is dragged along when he walks (no attack of opportunity on him: they ' +
        'move together). Free once they are apart, or when ' + name + ' lets go at the end of ' + holdEnds(h, st) + '. ' +
        name + ' heals ' + hugOf(st) + ' HP at the end of each of his turns while he holds it.';
    },
    hooks: {
      // a hold that went stale (he was stunned, sheeped or downed, or they were moved apart) lets go
      onTurnStart: function (unit, st) { if (!holdOk(byId(st.source), unit)) release(unit, 'Breaks free!'); },
      onEnterTile: function (unit, tile, cause, st) {
        const h = byId(st.source);
        if (!h || !active(h) || G().dist(h, unit) !== 1) release(unit, 'Slips free!');
      },
      // fired for the held unit as attacker or mover (pure): it never swings at the golem walking off with it
      modifyOpportunity: function (o, st) { if (o && o.mover && st && o.mover.id === st.source && o.attacker !== o.mover) o.cancel = true; },
    },
  });

  // ---- the Boulder (Hard Pass leaves one; Personal Space can throw it) ----------------------------------
  DD.registerObject({
    id: BOULDER, name: 'Boulder', blocksMove: true, blocksLos: false, hp: 5, height: 0.75, color: '#8ea6b8',
    // rules run: anyone can clear it, by hand or from range
    smashable: true, throwable: true, targetable: true,
    desc: 'A chunk of floor Slate ripped up and threw. Blocks movement. 5 HP: Smash it, or any single-target damage skill can break it. ' +
      'Slate can throw it again.',
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

  // ---- AutoPlay values (content side) --------------------------------------------------------------------
  /** HP worth of a self-heal, the way AutoPlay prices heals (more below half HP): the shared DD.AutoPlay.healWorth (E2). */
  function healWorth(u, heal) {
    if (DD.AutoPlay && typeof DD.AutoPlay.healWorth === 'function') return DD.AutoPlay.healWorth(u, heal);
    const miss = u.maxHp - u.hp;
    return miss > 0 ? Math.min(heal, miss) * (miss > u.maxHp / 2 ? 1.5 : 0.8) : 0;
  }
  /** The hold heal a Stress Ball squeeze would forfeit this turn (he holds a foe, no squeeze yet this turn). */
  function forfeitValue(u) {
    const v = heldBy(u);
    return v && holdOk(u, v) && !squeezed(u) ? healWorth(u, hugOf(getSt(v, HELD))) : 0;
  }
  /**
   * Stress Ball: the quick pass prices its self-heal (the exact pass's dry run sees it); both subtract the turn-end hold
   * heal a squeeze this turn forfeits (Nov 18: one grapple heal per turn; no dry run sees a turn-end heal).
   */
  function stressScore(ctx) {
    const u = ctx.user;
    if (!active(u) || !ctx.L) return 0;
    const forfeit = forfeitValue(u);
    return ctx.autoplay ? -forfeit : healWorth(u, ctx.L.heal) - forfeit;
  }
  /**
   * Hold Still: the hold itself, the squeeze it sets up (usable now, or next turn: the hold lasts through it), and
   * (Nov 18) the turn-end hold heals no dry run sees: the grab turn's for sure, each later one at 0.8. None when the
   * grab's damage likely kills (nothing left to hold).
   */
  function holdValue(ctx) {
    const u = ctx.user, v = ctx.targetUnit;
    if (!active(u) || !active(v) || !liftable(u, v)) return 0;
    let val = HOLD_AI;
    const sl = (u.skills || []).filter(function (s) { return s && s.id === 'sla_stress_ball'; })[0];
    // cd 0, or cd 1 already past a turn start (it reaches 0 at his next one)
    if (sl && (!(sl.cd > 0) || (sl.cd === 1 && !sl.fresh))) {
      const L = DD.skillLevel(DD.getSkill('sla_stress_ball'), sl.level || 1);
      val += healWorth(u, L.heal) + 0.5 * L.dmg;
    }
    const H = ctx.L;
    if (H && H.hug > 0 && !(DD.AI && DD.AI.estimate && DD.AI.estimate(u, v, H.dmg) >= v.hp)) {
      val += healWorth(u, H.hug) * (1 + 0.8 * (H.turns || 1));
    }
    return val;
  }

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
    levels: [{ dmg: 4, turns: 1, hug: HUG[0] }, { dmg: 5, turns: 1, hug: HUG[1] }, { dmg: 6, turns: 2, hug: HUG[2] }],
    // objects: false — he grapples foes, not barrels or crates (Love Tap pops or breaks one; Personal Space throws it)
    target: { type: 'unit', range: [1, 1], filter: 'enemy', canTarget: liftTarget, objects: false },
    // Nov 18: it heals (the turn-end hold heal), so Svammiel's Radio Edit never bleeps it (healsWith)
    heals: true,
    // [Nov 18, Deviation: hero-slate.md] grab + Grappled + the hold heal, the heal printed as a second sentence
    desc: function (L, user) {
      return 'Grab an adjacent foe: ' + L.dmg + ' damage, and it is Grappled until the end of your next ' +
        (L.turns === 1 ? 'turn' : L.turns + ' turns') + ' (can\'t move; dragged along when you walk). You heal ' + L.hug +
        ' HP at the end of each of your turns while you hold it' +
        (hasSkill(user, 'sla_stress_ball') ? ' (not on a turn you squeeze it with Stress Ball)' : '') + '.';
    },
    flavor: 'He hates being touched. He has no problem touching YOU.',
    autoplayValue: holdValue,
    execute: function (ctx) {
      const u = ctx.user, v = ctx.targetUnit;
      if (!active(u) || !active(v)) return;
      DD.FX.lunge(u, v);
      DD.Act.damage(u, v, ctx.L.dmg, { tags: ['grapple'] });
      if (active(u) && active(v) && grab(u, v, ctx.L.turns)) {
        const st = getSt(v, HELD);
        if (st) { st.data = st.data || {}; st.data.hug = ctx.L.hug; }
      }
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
    const out = [at];
    [f.end, f.drop ? null : thing.unit ? f.land : f.shatter].forEach(function (p) {
      if (p && !out.some(function (q) { return q.x === p.x && q.y === p.y; })) out.push(p);
    });
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
      return 'Throw an adjacent foe or object up to ' + plural(throwRange(L, user, 'sla_personal_space'), 'tile') + ': it and the foe it hits take ' + L.dmg +
        ' damage. Objects shatter.';
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
        // rules run: what the party may not aim at (targetable: false, the object it protects) is no boulder target either
        const Tg = DD.Targeting;
        if (!o && t && t.obj && t.obj.maxHp > 0 && t.obj.hp > 0 && G().objBlocksMove(t.obj) && Tg && Tg.objectTargetable && !Tg.objectTargetable(t.obj)) {
          return 'He has been asked not to throw rocks at that.';
        }
        return true;
      },
    },
    desc: function (L, user) {
      return 'Lob a boulder up to ' + reach(user, 'sla_rocks_fall', L, L.range) + ' tiles, over walls: ' + L.dmg + ' damage to the foe or object there. On empty floor, ' +
        'the Boulder stays.';
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
      return 'Throw an adjacent ally up to ' + plural(throwRange(L, user, 'sla_air_mail'), 'tile') + ' onto a safe empty tile. Foes next to the landing take ' +
        L.thud + ' damage.';
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
    // objects: false — a slam over the shoulder is for foes (a barrel or a crate goes through Personal Space)
    target: { type: 'unit', range: [1, 1], filter: 'enemy', canTarget: liftTarget, objects: false },
    area: { shape: 'custom', fn: function (ctx) {
      const u = ctx.user, tg = ctx.target;
      if (!u || !tg) return tg ? [tg] : [];
      const d = dirTo(u, tg);
      return [tg, { x: u.x - d.x, y: u.y - d.y }];
    } },
    desc: function (L) {
      return 'Slam an adjacent foe onto the tile behind you (if there\'s room): ' + L.dmg + ' damage' +
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
    desc: function (L, user) {
      return 'Rune-chain a foe up to ' + reach(user, 'sla_get_over_here', L, L.range) + ' tiles away in a line: ' + L.dmg + ' damage, and pull it next to you.';
    },
    flavor: 'Runes: for writing, warding, and yanking people by the collar.',
    execute: function (ctx) {
      const u = ctx.user, v = ctx.targetUnit;
      if (!active(u) || !active(v)) return;
      DD.FX.beam(u, v, { color: RUNE, width: 3 });
      DD.Act.damage(u, v, ctx.L.dmg, { tags: ['rune'] });
      // all the way in, from however far his range items let him reach ("next to you")
      if (active(v) && active(u)) DD.Act.pull(u, v, u, Math.max(ctx.L.range, G().dist(u, v) - 1));
    },
  });

  // D9 sustain: his heal comes from his own verb (the hold). No 'heal' tag: it must not make him a healer (REQ.healer).
  // His own heal is nobody else touching him, so it never feeds Short Fuse; the squeeze is a skill hit (the flare's +2).
  skill({
    id: 'sla_stress_ball', name: 'Stress Ball', icon: '✊', kind: 'attack', tags: ['melee', 'grapple'], ap: 1, cooldown: 1,
    levels: [{ dmg: 3, heal: 4 }, { dmg: 4, heal: 5 }, { dmg: 5, heal: 6 }],
    // objects: false — he squeezes the foe he is holding, not a crate (D1 opt-out)
    target: { type: 'unit', range: [1, 1], filter: 'enemy', objects: false,
      canTarget: function (ctx) { return ctx.targetUnit && holderOf(ctx.targetUnit) === ctx.user ? true : 'Grab it first (Hold Still).'; } },
    desc: function (L) { return 'Squeeze the foe you\'re holding: ' + L.dmg + ' damage, and you heal ' + L.heal + ' HP.'; },
    flavor: 'His therapist said to get a stress ball. He got a goblin. Close enough.',
    aiScore: stressScore,
    execute: function (ctx) {
      const u = ctx.user, v = ctx.targetUnit;
      if (!active(u) || !active(v) || holderOf(v) !== u) return;
      // Nov 18: a squeeze is this turn's grapple heal; the turn-end hold heal skips it (they never stack)
      if (S()) slaData(u).squeeze = S().turn;
      DD.FX.lunge(u, v);
      DD.FX.text(v, 'SQUEAK!', { color: RUNE, size: 15 });
      DD.Act.damage(u, v, ctx.L.dmg, { tags: ['grapple', 'squeeze'] });
      if (!active(u)) return;
      // the heal lands even when the squeeze kills (the hold ends with the foe); self, active only: never a revive
      const n = DD.Act.heal(u, u, ctx.L.heal);
      if (n > 0) DD.Act.log(u.name + ' squeezes ' + v.name + ' like a stress ball. He feels marginally less furious.', 'hero');
      DD.Act.maybeBark(u, 'squeeze', 0.35);
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
    // [review v2] trimmed to four lines in the party-select panel (the Immovable chip right below says the rest)
    blurb: 'Lich-tenstein\'s library golem, who quit after nine centuries of shushing. Grabs whatever comes near, smacks ' +
      'whatever walks away, throws whatever stays, and gets angrier whenever anyone touches him (healing counts). His ' +
      'runes glow when he\'s mad. They glow a lot.',
    color: '#6fd3e6',
    unlock: null, // v2: every hero is available from the start (user request; was: beat Lich-tenstein)
    // finish audit-8 (Nov 14): move 3 -> 4. He was the weakest hero (0.54x the median run-win share): fine in act 1,
    // too slow to reach the fight in acts 2-3. Same 200 seeds with Slate in every party: 23.5% -> 28.5% of runs won,
    // 33 -> 38 damage a fight (Love Tap 5 -> 6 measured 23.5%: no change). docs/notes/balance.md "Finish (Nov 14)"
    stats: { hp: 32, ap: 3, mov: 4, armor: 1, init: -2 },
    growth: { hp: 4 },
    flags: { immovable: true },
    sprite: SPRITE,
    basic: 'sla_love_tap',
    signature: 'sla_tantrum',
    passive: {
      name: 'Short Fuse',
      desc: 'Gains 1 Rage (max ' + MAX_RAGE + ') whenever someone else hits him, heals him or gives him a buff status ' +
        '(Block doesn\'t count). At ' + FLARE + '+ Rage his runes ' +
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
        // an attack of opportunity gets the flare through o.flat instead, so the AI's and the HUD's estimates see it
        modifyOutgoingDamage: function (d) { if (skillHit(d) && !d.opportunity && flared(d.source)) d.flat += FLARE_DMG; },
        // fired for the attacker and the mover alike (pure): o.slaFlare keeps it to once per attack
        modifyOpportunity: function (o) {
          const a = o && o.attacker;
          if (!a || o.slaFlare || a.kind !== 'hero' || a.defId !== 'slate' || !flared(a)) return;
          o.slaFlare = true;
          o.flat += FLARE_DMG;
        },
        onEnterTile: function (u, tile, cause) { dragStep(u, cause); },
        onMove: function (u) { afterWalk(u); },
        onDowned: function (u) { releaseAll(u, 'Dropped!'); },
        // the hold counts his turns (fires before turn-end decay)
        onTurnEnd: function (u) { tickHold(u); },
      },
    },
    startingSkills: ['sla_hold_still', 'sla_personal_space'],
    skillPool: ['sla_hold_still', 'sla_personal_space', 'sla_rocks_fall', 'sla_air_mail', 'sla_foot_down', 'sla_lawn',
      'sla_rock_bottom', 'sla_gasket', 'sla_get_over_here', 'sla_stress_ball'],
    summons: [],
    barks: {
      select: ['Hmph.', 'What. WHAT.', 'I was napping. For a century.', 'Don\'t touch me. Just point.', 'Fine. Who needs throwing?',
        'Kiri. Stop walking through me.'],
      start: ['Get off my lawn.', 'Fighting. Again. Wonderful.', 'Nine hundred years of shushing. No more whispering.',
        'Everybody stay where I can throw you.', 'Hjalmar. If I step on ONE banana peel...', 'Betty. Do NOT eat the map.'],
      swap: ['Move, {ally}. Or be moved. Same thing.', 'Out of my way, {ally}. Politely. That was polite.'],
      move: ['My knees are gravel.', 'Walking. Hate it.', 'Coming through. Move or be moved.', 'One step at a time. Literally.',
        'Hmph. Stairs. Of course.'],
      kill: ['Stay down.', 'Hmph. Kids.', 'And STAY off my lawn.', 'That\'s what you get.', 'Next.', 'Basanos, drop it. That one\'s mine.'],
      hurt: ['OW. Rude.', 'That chipped me.', 'Now I\'m annoyed.', 'Hands OFF.', 'You\'ll regret that. Briefly.'],
      lowhp: ['I\'m... crumbling.', 'Need a chisel. And a nap.', 'It\'s just a stone wound.', 'This is why I hate adventuring.',
        'Josiah. Rock glue. Now.', 'Valdris. Hammer me back together. GENTLY.'],
      downed: ['Rocks... fall...', 'Tell Kevin... I said... hmph.', 'Wake me... when it\'s quiet.', 'Finally. A nap.',
        'I\'m not crying. It\'s erosion.'],
      revive: ['Who woke me. WHO.', 'Did I ASK for help?', 'Ugh. Back to work.', 'I was enjoying that.', 'Fine. Up. Happy?'],
      ally_down: ['Get up. You\'re embarrassing us.', 'Nobody hits them but ME.', 'Now I\'m REALLY angry.', 'Hmph. Lightweight.',
        'Somebody help them. Not me. ...Fine. Me.'],
      levelup: ['Great. More responsibility.', 'Another rune. Whoop-de-doo.', 'Stronger. Still grumpy.', 'I feel slightly less ancient.',
        'Don\'t throw me a party. I\'ll throw it back.'],
      victory: ['Finally. Quiet.', 'Everybody off my lawn.', 'Hmph. Adequate.', 'Can I go back to sleep now?',
        'Don\'t hug me. Marwyn. MARWYN.'],
      idle: ['A fire dog named Pebbles. My cousins are OFFENDED.', 'Zarathor, your bling is giving me a headache.', 'Syllamin. Indoor voice.',
        'Marbles, you\'re asleep on my foot again.', 'Ellaria, if that corgi licks me one more time...',
        'Buga. Stop buttering my shoulder.'],
      signature: ['THAT\'S IT. EVERYBODY OUT.', 'I\'VE HAD IT UP TO HERE!', 'TANTRUM. TIME.', 'THE FLOOR GOES TOO!', 'GET. OFF. MY. LAWN!'],
      squeeze: ['Hmph. Better.', 'Squeeze. Breathe. Squeeze.', 'Stop wriggling. This is for my health.',
        'Anger management. Very effective. For me.'],
      // Nov 18: the turn-end hold heal (It Is Not a Hug)
      hug: ['It is NOT a hug.', 'Hmph. Therapeutic.', 'Stop. Wiggling.'],
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
    'Slate gains Rage whenever someone else hits him, heals him or gives him a buff status (Block doesn\'t count). At 3 Rage his runes flare: +2 damage on his skills.',
    'Heal Slate anyway. He hates it, and it makes him angrier. Everybody wins.',
    'A foe Slate is holding can\'t move, and it comes along when he walks. Drag it somewhere unpleasant, then throw it.',
    'Throw goblins at goblins. Throw them into pits. Throw them into water, then call someone with lightning.',
    'Air Mail throws an ally out of a brawl without provoking a single attack of opportunity. The landing is their problem.',
    'A foe Taunted by Get Off My Lawn only swings at Slate, so the wizard next to it can walk away without getting stabbed.',
    'Slate\'s Stress Ball squeezes whatever he is holding. It hurts them. It helps him. He will deny both.',
    'Slate holds on at least until the end of his next turn: grab a foe, then drag it, throw it or squeeze it next turn.',
  ]);

  // a tiny public surface for other content (bosses / items / events that want to poke Slate)
  DD.Slate = { rage: rage, flared: flared, gainRage: gainRage, spendRage: spendRage, heldBy: heldBy, holderOf: holderOf,
    grab: grab, release: release, tickHold: tickHold, releasesThisTurn: releasesThisTurn, flight: flight, throwUnit: throwUnit,
    throwObject: throwObject, objThrowable: objThrowable, HOLD_AI: HOLD_AI, holdValue: holdValue,
    HUG: HUG, squeezed: squeezed, stressScore: stressScore };
})();
