/* Dungeons and Degenerates — js/data/heroes/benedick.js
 * Benedick the Inevitable, Snail (Dragon, Allegedly), Knight of the Margins (he/him, the 17th hero, V3; available from
 * the start). Spec: .tmp/v3/addendum-benedick.md (plan §4.12). Two forms and a shell in between:
 *   Snail      — the main form: move 2, armor 2, Fourteen Thousand Teeth basic (melee: he makes attacks of opportunity).
 *   In His Shell — Coming Out of My Shell spends all his AP: half damage (takenMult 0.5) until his next turn start...
 *   Dragonsnail — ...when he bursts out flying for 2 of his turns (+3 move, Slow Burn basic, three dragon-only skills),
 *                 then lands by himself (gliding off a pit, deep water or lava first). The change never heals (D9).
 * Passive A Sticky Situation: at his turn end, Snail Slime on the bare floor of every tile he crawled off (recorded while
 * he walks, laid at turn end so move Undo keeps working); grounded non-boss foes that walk onto it stop (the `stops` snag).
 * Snail Mail posts a parcel that bursts at the start of his next turn. His only heal is the Snail Mucin Serum (D9).
 * Form state: statuses ben_in_shell / ben_dragon are the source of truth; unit.data.ben holds the bookkeeping (move bonus,
 * shown look, crawl steps, the Sign's charge). Registers: hero benedick, 13 skills (ben_*), statuses ben_in_shell and
 * ben_dragon, surface ben_slime, object ben_parcel, 3 hero items, loading tips. Test / debug API: DD.Benedick.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HERO = 'benedick';
  const SHELL_ST = 'ben_in_shell', DRAGON = 'ben_dragon', SLIME = 'ben_slime', PARCEL = 'ben_parcel';
  const TEETH = 'ben_teeth', BURN = 'ben_slow_burn', SHELL = 'ben_shell', MAIL = 'ben_mail';
  const DRAGON_MOV = 3, DRAGON_TURNS = 2, SLIME_TURNS = 3, SERUM_HEAL = 3;
  const SERUM = 'ben_mucin_serum', STRIPES = 'ben_racing_stripes', SIGN = 'ben_dnd_sign';
  const SLOW_BURN = [{ dmg: 4, burn: 1 }, { dmg: 5, burn: 1 }, { dmg: 6, burn: 1 }];   // by the shell's level
  const MINT = '#5fcf9b', GOO = '#cfeec0', EMBER = '#ff8a3d';
  const DRAGON_GATE = 'Dragonsnail only (Coming Out of My Shell first).';
  const DRAGON_GATE_NONE = 'Dragonsnail only (and Coming Out of My Shell is not socketed).';

  // ---- helpers ------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function byPos(a, b) { return a.y - b.y || a.x - b.x; }
  function foeOf(u, f) { return active(u) && active(f) && G().hostile(u, f); }
  function byId(id) { return id == null || !DD.Combat || !DD.Combat.byId ? null : DD.Combat.byId(id); }
  /** Item check for combat units (items array), RunHeroes (slot object) or null. */
  function hasItem(user, id) {
    if (!user) return false;
    const items = user.items;
    if (Array.isArray(items)) return items.indexOf(id) >= 0;
    if (items && typeof items === 'object') { for (const k in items) if (items[k] === id) return true; }
    return !!(user.runHero && user.runHero !== user && hasItem(user.runHero, id));
  }
  /** A skill's target reach for this user: the base number plus his range items (DD.Targeting.reach; heroes-v1). */
  function reach(user, id, L, base) {
    const d = DD.getSkill(id);
    if (!user || !d || !DD.Targeting || typeof DD.Targeting.reach !== 'function') return base;
    return DD.Targeting.reach(d, L || d.levels[0], user, base);
  }
  function dataOf(u) {
    const d = u.data || (u.data = {});
    return d.ben || (d.ben = { dragon: false, mov: 0, look: 'snail', pos: null, steps: [], dnd: false, dndNow: false });
  }
  /** Read-only view of his bookkeeping (queries, descs and scores never create it). */
  function peek(u) { return (u && u.data && u.data.ben) || null; }
  function tagged(def, tag) { return !!def && (def.tags || []).indexOf(tag) >= 0; }
  function isPlant(u) { return !!u && (u.tags || []).indexOf('plant') >= 0; }
  function levelRow(level) { const d = DD.getSkill(SHELL); return d ? DD.skillLevel(d, level || 1) : { cd: 4, slow: 4, burst: 0 }; }

  // ---- forms ------------------------------------------------------------------------------------------
  function isDragon(u) { return !!u && A().hasStatus(u, DRAGON); }
  function inShell(u) { return !!u && A().hasStatus(u, SHELL_ST); }
  /** Level of his socketed Coming Out of My Shell (1 when it is not socketed): it sets Slow Burn's numbers. */
  function shellLevel(u) {
    const slots = u && Array.isArray(u.skills) ? u.skills : [];
    for (let i = 0; i < slots.length; i++) if (slots[i] && slots[i].id === SHELL) return Math.max(1, Math.min(3, slots[i].level || 1));
    return 1;
  }
  function hasShellSkill(u) { return !!u && Array.isArray(u.skills) && u.skills.some(function (sl) { return sl && sl.id === SHELL; }); }
  /** His move without the Dragonsnail bonus. */
  function baseMov(u) { const d = peek(u); return (u.mov || 0) - ((d && d.mov) || 0); }
  /** The look his statuses ask for: the shell wins (a shelled dragon is a floating shell), then the dragon. */
  function lookOf(u) { return !active(u) ? 'snail' : inShell(u) ? 'shell' : isDragon(u) ? 'dragon' : 'snail'; }

  /**
   * Swap the sprite (Basanos' pattern): the logical override (unit.sprite) changes at once; on screen the old look is
   * pinned (unit.vis.sprite) until FX playback reaches the change, then the pin is dropped so unit.sprite shows again —
   * also when other content re-wrapped it meanwhile (the Party Balloons). Previews skip the visual part.
   */
  const looks = new WeakMap();
  function showSprite(u, spec) {
    const before = (u.vis && u.vis.sprite) || u.sprite || SNAIL_SPRITE;
    if (spec) u.sprite = spec; else delete u.sprite;
    if (A().simulating || !u.vis) return;
    if (!u.vis.sprite) u.vis.sprite = before;
    const n = (looks.get(u) || 0) + 1, shown = spec || SNAIL_SPRITE;
    looks.set(u, n);
    DD.FX.call(function () { if (u.vis) u.vis.sprite = looks.get(u) === n ? null : shown; });
  }
  /** Swap the basic attack slot; it stays one slot, so its bookkeeping carries over (Basanos' setBasic). */
  function setBasic(u, id, level) {
    const old = u.basic || {};
    u.basic = A().makeSlot(id, level);
    u.basic.usedThisTurn = !!old.usedThisTurn;
    u.basic.uses = old.uses || 0;
    u.basic.cd = old.cd || 0;
    u.basic.fresh = !!old.fresh;
  }
  /** Make the move bonus, the basic slot and the look follow ben_dragon / ben_in_shell (a dispel or a down included). */
  function syncForm(u) {
    if (!u || u.kind !== 'hero') return;
    const d = dataOf(u);
    const dragon = isDragon(u) && active(u);
    let changed = false;
    if (dragon && !d.dragon) {
      d.dragon = true;
      d.mov = DRAGON_MOV;
      u.mov = (u.mov || 0) + DRAGON_MOV;
      setBasic(u, BURN, shellLevel(u));
      changed = true;
    } else if (!dragon && d.dragon) {
      d.dragon = false;
      u.mov = Math.max(1, (u.mov || 0) - (d.mov || 0));
      d.mov = 0;
      setBasic(u, TEETH, 1);
      changed = true;
    }
    const look = lookOf(u);
    if (look !== d.look) {
      d.look = look;
      showSprite(u, look === 'shell' ? SHELL_SPRITE : look === 'dragon' ? DRAGON_SPRITE : null);
      changed = true;
    }
    if (changed) A().touch();
  }

  /**
   * Into the shell. why: 'skill' (Coming Out of My Shell: spends the AP left on his turn) | 'sign' (the Do Not Disturb
   * Sign's death-save: also as the Dragonsnail, which keeps flying under a floating shell) | 'test'. Never heals (D9).
   */
  function withdraw(u, L, why) {
    if (!active(u) || inShell(u) || (isDragon(u) && why !== 'sign')) return false;
    L = L || levelRow(shellLevel(u));
    if (why !== 'test' && DD.Combat.isTurnOf && DD.Combat.isTurnOf(u)) {
      const left = Math.floor(u.ap || 0);
      if (left > 0) A().gainAp(u, -left);
    }
    const st = A().addStatus(u, SHELL_ST, { silent: true }, u);
    if (!st || !inShell(u)) return false;
    st.data = st.data || {};
    st.data.slow = L.slow || 0;
    st.data.burst = L.burst || 0;
    syncForm(u);
    DD.FX.particles(u, { kind: 'dust', count: 10 });
    if (why === 'sign') return true;
    DD.FX.text(u, 'BRB', { color: '#e8d2a6', size: 16 });
    DD.FX.sound('buff');
    if (why === 'skill') A().bark(u, 'shell');
    A().log(u.name + ' withdraws into his shell. A tiny sign on the door reads BRB.', 'hero');
    return true;
  }

  /** His turn start, after the parcels: out of the shell as the Dragonsnail for DRAGON_TURNS of his turns. */
  function emerge(u) {
    if (!active(u) || !inShell(u)) return false;
    const st = A().getStatus(u, SHELL_ST);
    const burst = (st && st.data && st.data.burst) || 0;
    // the dragon first, then the shell goes: no snail look in between
    A().addStatus(u, DRAGON, { turns: DRAGON_TURNS, silent: true }, u);
    A().removeStatus(u, SHELL_ST, { silent: true });
    syncForm(u);
    if (!isDragon(u)) return false;
    DD.FX.flash(EMBER, 200);
    DD.FX.banner('DRAGONSNAIL!', { sub: 'He came out of his shell', color: EMBER });
    DD.FX.shake(6, 300);
    DD.FX.particles(u, { kind: 'fire', count: 18 });
    DD.FX.particles(u, { kind: 'sparks', count: 10, color: '#c98a45', parallel: true });
    DD.FX.particles(u, { kind: 'smoke', count: 8, parallel: true });
    DD.FX.sound('roar');
    DD.FX.sound('fire');
    A().bark(u, 'emerge');
    A().log(u.name + ' comes out of his shell. Way out. He is a Dragonsnail now.', 'hero');
    if (burst > 0) {
      const def = DD.getSkill(SHELL);
      adjacentFoes(u).forEach(function (f) {
        if (!active(f) || !active(u)) return;
        DD.FX.particles(f, { kind: 'fire', count: 10, parallel: true });
        A().damage(u, f, burst, { element: 'fire', skill: def, tags: ['fire', 'burst'] });
      });
    }
    return true;
  }

  /** The dragon wore off (or was dispelled) while he stands: a snail again (syncForm already restored the rest). */
  function land(u) {
    if (!active(u)) return;
    DD.FX.particles(u, { kind: 'dust', count: 12 });
    DD.FX.text(u, 'Snail again.', { color: GOO, size: 14 });
    DD.FX.sound('bump');
    A().bark(u, 'land');
    A().log('The dragon wears off. ' + u.name + ' is a snail again, and would like a moment.', 'hero');
  }

  /**
   * Turn end of his last Dragonsnail turn (before the status decays and before lava ticks): over a drop or a walker's
   * hazard with nothing else keeping him up, he glides to the nearest walker-safe tile first, so landing hurts nobody.
   */
  function glideIfNeeded(u) {
    const st = active(u) ? A().getStatus(u, DRAGON) : null;
    if (!st || st.turns !== 1) return false;
    const g = Object.create(u);
    g.statuses = u.statuses.filter(function (x) { return x.id !== DRAGON; });
    if (G().isFlying(g)) return false;
    if (!G().isDrop(u.x, u.y) && !G().hazardAt(u.x, u.y, g)) return false;
    const spot = A().safeSpot(u.x, u.y, g);
    if (!spot) return false;
    const from = { x: u.x, y: u.y };
    if (!A().teleport(u, spot.x, spot.y, { fx: false })) return false;
    DD.FX.jump(u, from, spot, { ms: 300 });
    A().bark(u, 'glide');
    A().log(u.name + ' glides down to solid ground. Undignified, but solid.', 'hero');
    return true;
  }

  /** canUse of a Dragonsnail-only skill. */
  function gate(ctx) {
    const u = ctx && ctx.user;
    if (!u || isDragon(u)) return true;
    return hasShellSkill(u) ? DRAGON_GATE : DRAGON_GATE_NONE;
  }
  function adjacentFoes(u) {
    if (!DD.Combat || !DD.Combat.foesOf) return [];
    return DD.Combat.foesOf(u).filter(function (f) { return active(f) && dist(f, u) === 1; }).sort(byPos);
  }

  // ---- the slime -------------------------------------------------------------------------------------------
  /** Does Snail Slime stop this walker? Grounded, hostile to the heroes (charm counts), no boss, not root-proof. Pure. */
  function sticks(u) {
    return !!u && !u.dead && !u.downed && G().effectiveSide(u) === 'enemy' && !A().isBoss(u) && G().feelsFloor(u) && !A().immuneTo(u, 'root');
  }
  /** A foe walked onto his slime: the walk ends here; the owner may bark, and heal with the Snail Mucin Serum (D9). */
  function stuck(foe, tile) {
    if (!active(foe)) return;
    A().stopMove(foe);
    const owner = byId(tile && tile.surface && tile.surface.data ? tile.surface.data.src : null);
    DD.FX.text(foe, 'Stuck!', { color: GOO, size: 14 });
    DD.FX.particles(foe, { kind: 'bubbles', color: GOO, count: 8, parallel: true });
    DD.FX.sound('splash');
    A().log(foe.name + ' gets stuck in ' + (owner ? owner.name + '\'s' : 'snail') + ' slime.', 'hero');
    if (!active(owner)) return;
    A().maybeBark(owner, 'stuck', 0.35);
    if (hasItem(owner, SERUM) && A().heal(owner, owner, SERUM_HEAL) > 0) {
      DD.FX.text(owner, 'Moisturised!', { color: GOO, size: 14 });
      A().log(owner.name + ' moisturises.', 'hero');
    }
  }
  /**
   * Bare floor for slime: no other surface (his own slime is refreshed), walkable for walkers, no pit, no liquid. A unit
   * standing there doesn't matter (Spit Shine's 5 tiles include his own; the trail never lists the tile he ends on).
   */
  function slimeable(x, y) {
    const t = G().tile(x, y);
    if (!t) return false;
    if (t.surface && t.surface.id !== SLIME) return false;
    const td = G().terrain(t);
    return !td.pit && !td.liquid && td.walkable !== false && G().isWalkable(x, y, null);
  }
  /** Lay (or refresh) Snail Slime on a bare-floor tile for `turns` rounds; true if the tile has his slime now. */
  function laySlime(x, y, turns, u) {
    if (!slimeable(x, y)) return false;
    const t = G().tile(x, y);
    if (t.surface && t.surface.id === SLIME) {
      const sf = t.surface;
      sf.data = sf.data || {};
      if ((sf.turns >= 0 && sf.turns < turns) || sf.data.src !== (u ? u.id : null)) {
        if (sf.turns >= 0 && sf.turns < turns) sf.turns = turns;
        sf.data.src = u ? u.id : null;
        A().touch();
      }
    } else {
      if (!A().setSurface(x, y, SLIME, turns)) return false;
      t.surface.data = t.surface.data || {};
      t.surface.data.src = u ? u.id : null;
    }
    DD.FX.tile(x, y, 'glow', { color: GOO, parallel: true });
    return true;
  }
  /**
   * The tiles he crawled off this turn, oldest first: walk his recorded steps back from where he stands. A step that
   * does not end where the chain is was taken back (Combat.undo is silent) and is skipped; a real crawl gives its tile.
   */
  function trailTiles(u) {
    const d = peek(u);
    if (!d || !Array.isArray(d.steps) || !d.steps.length) return [];
    let cur = { x: u.x, y: u.y };
    const out = [];
    for (let i = d.steps.length - 1; i >= 0; i--) {
      const st = d.steps[i];
      if (!st || !st.to || !st.from || st.to.x !== cur.x || st.to.y !== cur.y) continue;
      if (st.crawl && !(st.from.x === u.x && st.from.y === u.y)) out.push({ x: st.from.x, y: st.from.y });
      cur = st.from;
    }
    return out.reverse();
  }
  /** onEnterTile on his own sources: record the step (a crawl = his own walk or swap move on his turn, on the floor). */
  function recordStep(u, tile, cause) {
    if (!u || !tile || u.kind !== 'hero') return;
    const d = dataOf(u);
    let from = d.pos;
    // a walk step is one tile: the engine faced him along it (moveAlong / swapMove), which survives a silent Undo
    if (cause === 'move' && (!from || Math.abs(from.x - tile.x) + Math.abs(from.y - tile.y) !== 1) && u.lastDir && (u.lastDir.x || u.lastDir.y)) {
      from = { x: tile.x - u.lastDir.x, y: tile.y - u.lastDir.y };
    }
    const crawl = cause === 'move' && !!DD.Combat.isTurnOf && DD.Combat.isTurnOf(u) && G().feelsFloor(u);
    if (!Array.isArray(d.steps)) d.steps = [];
    if (from) d.steps.push({ from: { x: from.x, y: from.y }, to: { x: tile.x, y: tile.y }, crawl: crawl });
    d.pos = { x: tile.x, y: tile.y };
    if (crawl && from && !A().simulating) DD.FX.particles(from, { kind: 'bubbles', color: GOO, count: 3, parallel: true });
  }
  /**
   * Combat.undo puts a walker (and, for a swap, the ally) back without any tile event: the recorded position follows
   * (RULES' `move:undone`), so the next step's `from` is where he really is. The undone steps stay in the record; the
   * chain in trailTiles skips them.
   */
  function onUndone(e) {
    [e && e.unit, e && e.allyId != null ? byId(e.allyId) : null].forEach(function (u) {
      const d = u && u.defId === HERO ? peek(u) : null;
      if (d) d.pos = { x: u.x, y: u.y };
    });
  }
  DD.afterLoad(function () { if (DD.Events && DD.Events.on) DD.Events.on('move:undone', onUndone); });

  /** His turn end: slime on every tile he crawled off this turn. */
  function layTrail(u) {
    if (!active(u)) return [];
    const laid = trailTiles(u).filter(function (p) { return laySlime(p.x, p.y, SLIME_TURNS, u); });
    if (laid.length) DD.FX.sound('splash');
    return laid;
  }

  // ---- Snail Mail ------------------------------------------------------------------------------------------
  /** His parcels on the board: [{ x, y, obj }]. */
  function parcels(u) {
    const s = S();
    if (!s || !s.grid || !u) return [];
    const out = [];
    s.grid.tiles.forEach(function (t) { if (t.obj && t.obj.id === PARCEL && t.obj.data && t.obj.data.src === u.id) out.push({ x: t.x, y: t.y, obj: t.obj }); });
    return out;
  }
  /** His turn start (first thing, even stunned, shelled or a dragon): every parcel bursts on whoever is on or next to it. */
  function deliver(u) {
    if (!active(u)) return 0;
    let hit = 0;
    const def = DD.getSkill(MAIL);
    parcels(u).forEach(function (p) {
      const dmg = (p.obj.data && p.obj.data.dmg) || 0;
      A().removeObject(p.x, p.y);
      DD.FX.explosion({ x: p.x, y: p.y }, { radius: 1, color: '#c9a36b' });
      DD.FX.sound('explosion');
      DD.FX.text({ x: p.x, y: p.y }, 'SPECIAL DELIVERY!', { color: '#f3e2b8', size: 15 });
      A().log('📦 Snail Mail! The parcel arrives (late, as promised).', 'hero');
      const foes = DD.Combat.foesOf(u).filter(function (f) { return active(f) && dist(f, p) <= 1; }).sort(byPos);
      if (foes.length) A().maybeBark(u, 'delivery', 0.6);
      foes.forEach(function (f) {
        if (!active(f) || !active(u)) return;
        A().damage(u, f, dmg, { skill: def, tags: ['delayed', 'parcel'], noHighGround: true });
        hit++;
      });
    });
    return hit;
  }
  /**
   * What a parcel of `dmg` would take off foe f if it landed now (pure): DD.AI.estimate's numbers (his outgoing
   * multipliers, its armor, takenMult and resist), from a stand-in on f's own tile because a delivery never gets high
   * ground. The preview and AutoPlay's mailScore print / price this, not the raw L.mail.
   */
  function mailHit(u, f, dmg) {
    if (!u || !f || !(dmg > 0)) return 0;
    if (!DD.AI || typeof DD.AI.estimate !== 'function') return dmg;
    const at = Object.create(u);
    at.x = f.x; at.y = f.y;
    return Math.max(0, Math.round(+DD.AI.estimate(at, f, dmg, null, false, DD.getSkill(MAIL)) || 0));
  }
  /** He went down: his parcels are taken off the board undelivered. */
  function returnToSender(u) {
    const list = parcels(u);
    list.forEach(function (p) { A().removeObject(p.x, p.y); });
    if (list.length) A().log('With ' + u.name + ' down, his parcel is returned to sender.', 'hero');
    return list.length;
  }

  // ---- AutoPlay ------------------------------------------------------------------------------------------
  /** Damage-equivalent of one use (rough: AutoPlay prices real outcomes with dry runs afterwards). */
  function useValue(def, L) {
    let v = (L.dmg || 0) + 0.55 * (L.mail || 0) + 0.8 * (L.burn || 0) + 0.3 * (L.block || 0);
    if (tagged(def, 'stun')) v += 6;
    if (tagged(def, 'taunt')) v += 3;
    if (tagged(def, 'weak')) v += 2;
    if (tagged(def, 'push') || tagged(def, 'pull')) v += 1;
    return v;
  }
  function reachOf(def, L) {
    if (def.target && def.target.type === 'self') return def.area && def.area.shape === 'adjacent' ? 1 : Math.max(1, L.r || 1);
    const r = def.target && def.target.range;
    return Array.isArray(r) ? r[1] : typeof r === 'function' ? (DD.resolve(r, L, null, [1, 1])[1] || 1) : 1;
  }
  /** The slots a form can use: its basic plus the socketed skills that work in it (the switch itself never). */
  function formSlots(u, dragon) {
    const out = [{ id: dragon ? BURN : TEETH, level: dragon ? shellLevel(u) : 1, cd: 0, uses: 0 }];
    (u.skills || []).forEach(function (sl) {
      const def = sl && DD.getSkill(sl.id);
      if (!def || sl.id === SHELL || (!dragon && tagged(def, 'dragon'))) return;
      out.push(sl);
    });
    return out;
  }
  /** Rough best value this form gets out of `ap` AP from here (walking in with its move, a flight for the dragon). */
  function formValue(u, dragon, ap) {
    if (!(ap > 0) || !DD.Combat || !DD.Combat.state) return 0;
    const foes = DD.Combat.foesOf(u).filter(active);
    if (!foes.length) return 0;
    const mov = DD.Combat.cantMove(u) ? 0 : Math.max(0, baseMov(u)) + (dragon ? DRAGON_MOV : 0);
    let best = 0;
    formSlots(u, dragon).forEach(function (sl) {
      const def = DD.getSkill(sl.id);
      if (!def || sl.cd > 0 || def.hype > 0 || (def.charges > 0 && (sl.uses || 0) >= def.charges)) return;
      const L = DD.skillLevel(def, sl.level || 1);
      const cost = Math.max(1, DD.Combat.costOf(u, def, sl.level || 1).ap);
      const v = useValue(def, L);
      if (!(v > 0) || cost > ap) return;
      const r = reachOf(def, L);
      let left = ap;
      if (!foes.some(function (f) { return dist(f, u) <= r; })) {
        if (ap < cost + 1 || !foes.some(function (f) { return dist(f, u) <= r + mov; })) return;
        left = ap - 1;
      }
      const uses = DD.Combat.cooldownOf(u, def, sl.level || 1) > 0 ? 1 : Math.floor(left / cost);
      best = Math.max(best, v * uses);
    });
    return best;
  }
  /**
   * Coming Out of My Shell's aiScore (pure): the Dragonsnail's next two turns over the snail's, discounted, plus the
   * III burst, plus (quick pass only) the hits the shell would halve, minus what the drained AP could still buy now. So
   * AutoPlay acts first and tucks in with its last AP, and shells early when a move-2 snail reaches nothing.
   */
  function shellScore(ctx) {
    const u = ctx && ctx.user, L = (ctx && ctx.L) || {};
    if (!active(u) || !DD.Combat || !DD.Combat.state || isDragon(u) || inShell(u)) return 0;
    const cost = DD.Combat.costOf(u, ctx.skill || DD.getSkill(SHELL), ctx.level || 1).ap;
    const lost = formValue(u, false, Math.max(0, (u.ap || 0) - cost));
    const gain = Math.max(0, formValue(u, true, 3) - formValue(u, false, 3)) * DRAGON_TURNS * 0.7;
    const burst = (L.burst || 0) * adjacentFoes(u).length * 0.6;
    let shield = 0;
    if (!ctx.autoplay && DD.AutoPlay && typeof DD.AutoPlay.incomingAt === 'function') {
      const inc = DD.safe('benedick shellScore incomingAt', DD.AutoPlay.incomingAt, DD.AutoPlay, [u, u.x, u.y]);
      shield = 0.4 * Math.min(u.hp || 0, (inc && inc.dmg) || 0);
    }
    return Math.max(0, gain + burst + shield - lost - 2);
  }
  /** Will this foe still be there at the start of his next turn? (Stunned / held best, engaged next, a wind-up holder.) */
  function stay(f) {
    if (A().isStunned(f) || (A().cantMoveNext && A().cantMoveNext(f)) || A().hasStatus(f, 'sheep') || A().hasStatus(f, 'sleep') || A().hasStatus(f, 'frozen')) return 0.95;
    if (DD.Combat.foesOf(f).some(function (h) { return active(h) && dist(h, f) === 1; })) return 0.7;
    if ((f.intents || []).some(function (i) { return i && i.windup; })) return 0.6;
    return 0.35;
  }
  /** Snail Mail's aiScore (pure): what the parcel will likely hit next turn (it is worth nothing now: key `mail`). */
  function mailScore(ctx) {
    const u = ctx && ctx.user, L = (ctx && ctx.L) || {}, p = ctx && ctx.target;
    if (!active(u) || !p || !DD.Combat || !DD.Combat.state) return 0;
    const tl = G().tile(p.x, p.y);
    if (!tl || tl.obj) return 0;
    let v = 0;
    DD.Combat.foesOf(u).forEach(function (f) {
      if (!active(f) || dist(f, p) > 1) return;
      // its Block is gone by then (Block expires at the start of its own turn); armor and the rest are not
      v += Math.min(mailHit(u, f, L.mail || 0), f.hp || 0) * stay(f) * 0.9;
    });
    return v;
  }
  /** Spit Shine's aiScore (pure): AutoPlay's danger model does not see slime stops, so the patch says what it is worth. */
  function spitScore(ctx) {
    const u = ctx && ctx.user, p = ctx && ctx.target;
    if (!active(u) || !p || !DD.Combat || !DD.Combat.state) return 0;
    const foes = DD.Combat.foesOf(u).filter(active);
    if (!foes.some(function (f) { return dist(f, p) <= 4; })) return 0;
    let n = 0;
    foes.forEach(function (f) {
      if (dist(f, p) > 3 || !sticks(f)) return;
      if (DD.Combat.foesOf(f).some(function (h) { return active(h) && dist(h, f) === 1; })) return;
      n++;
    });
    const fresh = (ctx.tiles || []).filter(function (q) {
      const t = G().tile(q.x, q.y);
      return slimeable(q.x, q.y) && !(t.surface && t.surface.id === SLIME);
    }).length;
    return Math.min(7, 1.5 * n + 0.3 * fresh);
  }

  // ---- sprites and painters --------------------------------------------------------------------------------
  const P = { foot: '#cdbf8b', foot2: '#a8996a', gloss: '#f6fbe9', shell: '#c98a45', shell2: '#8c5226', band: '#f1dcaa',
    groove: '#5a3418', helm: '#c7cdd6', helm2: '#8b939e', pennant: '#c0392b', lance: '#7a5530', eye: '#141018',
    sclera: '#fdfdf6', outline: '#2a1c12', slime: 'rgba(205,240,200,0.55)', sign: '#c89b62', seal: '#f3efe4',
    skin: '#cdbf8b', accent: MINT };
  const PD = Object.assign({}, P, { foot: '#9fbf7a', foot2: '#7a9a58', shell: '#b4442e', shell2: '#6e2418', band: '#ffb347',
    wing: '#2f8f5b', wing2: '#1f6b43', horn: '#efe2b8', eyeGlow: '#ffd23f', fire: '#ff8a2a', skin: '#9fbf7a', accent: EMBER });

  /** A logarithmic spiral stroke (the shell's band), cx/cy its eye, R the outer radius, `turns` full turns inward. */
  function spiral(g, cx, cy, R, turns, a0, color, width) {
    const c = g.ctx, N = 56, th = turns * Math.PI * 2, k = Math.log(1 / 0.15) / th;
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * th, r = R * Math.exp(-k * a);
      const x = cx + Math.cos(a0 - a) * r, y = cy + Math.sin(a0 - a) * r * 0.95;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = color; c.lineWidth = width; c.stroke(); c.lineCap = 'butt';
  }
  function spiralPoint(cx, cy, R, turns, a0, f) {
    const th = turns * Math.PI * 2, k = Math.log(1 / 0.15) / th, a = f * th, r = R * Math.exp(-k * a);
    return [cx + Math.cos(a0 - a) * r, cy + Math.sin(a0 - a) * r * 0.95];
  }
  /** The spiral shell (both looks of the snail body, and the shell alone). */
  function drawShell(g, cx, cy, R, pal, t, dragon, still) {
    g.shaded(function (p) { p.arc(cx, cy, R, 0, Math.PI * 2); }, pal.shell,
      { dx: 1.4, dy: -1.6, dark: pal.shell2, hl: [cx - R * 0.42, cy - R * 0.5, R * 0.3, R * 0.17, -0.6] });
    const a0 = 0.9;
    spiral(g, cx + R * 0.08, cy + R * 0.04, R * 0.86, 2.25, a0, dragon ? g.shade(pal.band, -0.1) : pal.band, Math.max(1.6, R * 0.22));
    spiral(g, cx + R * 0.08, cy + R * 0.04, R * 0.7, 2.25, a0 + 0.35, pal.groove, Math.max(0.6, R * 0.07));
    if (dragon) {
      const pulse = still ? 0.8 : 0.6 + 0.4 * Math.sin(t * 3);
      [0.25, 0.55, 0.85].forEach(function (f) {
        const q = spiralPoint(cx + R * 0.08, cy + R * 0.04, R * 0.86, 2.25, a0, f);
        g.glow(q[0], q[1], R * 0.42, pal.band, 0.55 * pulse);
      });
    }
    g.ellipse(cx - R * 0.45, cy - R * 0.55, R * 0.22, R * 0.11, 'rgba(255,255,255,0.55)', null, -0.6);
  }
  /** One bat wing rooted at (rx, ry): three finger bones (Morning Breath's very new wings), scalloped membrane. */
  function wing(g, rx, ry, flap, size, membrane, bone) {
    const c = g.ctx;
    c.save();
    c.translate(rx, ry);
    c.rotate(flap);
    c.scale(size, size);
    // an arm bone up to the wrist, four finger bones fanning back, the membrane scalloped between them down to the shell
    const W = [-3, -14];
    const tips = [[-6, -25], [-16, -23], [-22.5, -13.5], [-21, -4]];
    const body = [-9, 2];
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(W[0], W[1]);
    c.lineTo(tips[0][0], tips[0][1]);
    let prev = tips[0];
    tips.slice(1).concat([body]).forEach(function (p) {
      const mx = (prev[0] + p[0]) / 2, my = (prev[1] + p[1]) / 2;
      c.quadraticCurveTo(mx + (W[0] - mx) * 0.42, my + (W[1] - my) * 0.42, p[0], p[1]);
      prev = p;
    });
    c.closePath();
    c.fillStyle = membrane; c.fill();
    c.strokeStyle = g.outline; c.lineWidth = g.lw * 0.6; c.lineJoin = 'round'; c.stroke();
    g.line(0, 0, W[0], W[1], bone, 1.6);
    tips.forEach(function (tp) { g.line(W[0], W[1], tp[0], tp[1], bone, 0.8); });
    g.poly([[W[0] - 0.8, W[1] + 0.2], [W[0] + 0.6, W[1] - 3.2], [W[0] + 1.3, W[1] + 0.1]], '#efe2b8', null);
    c.restore();
  }
  /** The bucket helm: a little tapered pail with an eye slit and two holes on top for the eyestalks. */
  function helm(g, x, y, w, h, pal) {
    const top = w * 0.84, lw = g.lw;
    g.lw = Math.min(lw, 1.15);
    g.shaded(function (p) {
      p.moveTo(x - w / 2, y); p.lineTo(x + w / 2, y); p.lineTo(x + top / 2, y - h); p.lineTo(x - top / 2, y - h); p.closePath();
    }, pal.helm, { dx: 0.8, dy: -0.6, dark: pal.helm2, hl: [x - w * 0.18, y - h * 0.6, w * 0.12, h * 0.28] });
    g.ellipse(x, y - h, top / 2, h * 0.16, g.shade(pal.helm, 0.18), g.outline);
    g.line(x + w * 0.02, y - h * 0.48, x + w * 0.46, y - h * 0.48, '#1a1418', Math.max(0.8, h * 0.13));
    g.circle(x - top * 0.18, y - h - 0.2, h * 0.09, '#1a1418', null);
    g.circle(x + top * 0.2, y - h - 0.2, h * 0.09, '#1a1418', null);
    g.circle(x - w * 0.32, y - h * 0.2, 0.45, '#ffffff', null);
    g.circle(x + w * 0.3, y - h * 0.2, 0.45, '#ffffff', null);
    g.lw = lw;
  }
  function eyeball(g, x, y, r, pal, blink, look) {
    if (blink) { g.ellipse(x, y, r, r * 0.28, pal.sclera, g.outline); return; }
    g.circle(x, y, r, pal.sclera, g.outline);
    g.circle(x + r * 0.35 * (look || 1), y + r * 0.05, r * 0.5, pal.eye, null);
    g.circle(x + r * 0.15, y - r * 0.35, r * 0.18, '#ffffff', null);
  }

  /** The snail (and, greener with wings, the Dragonsnail): origin at the foot, facing +x. */
  function drawBody(g, t, o, dragon) {
    const pal = dragon ? PD : P, c = g.ctx;
    const still = !!o.still, pose = g.pose, pt = typeof g.poseT === 'number' ? g.poseT : 0.5;
    const atk = pose === 'attack', cast = pose === 'cast', hurt = pose === 'hurt';
    const hx = atk ? 2 * Math.sin(Math.PI * pt) : 0;
    const flap = (still ? -0.1 : Math.sin(t * 5) * 0.3) - (atk || cast ? 0.25 : 0);
    // back wing (darker, a little smaller), behind everything
    if (dragon) wing(g, -1, -26, flap - 0.22, 0.78, pal.wing2, g.shade(pal.wing2, -0.25));
    // the lance strapped to his shell, pennant fluttering (the snail; the dragon left it somewhere)
    if (!dragon) {
      g.limb(-5, -19, -11.5, -40, 1.5, pal.lance);
      g.poly([[-11.9, -39.6], [-12.2, -44.5], [-10.4, -40.1]], '#d9dde3', g.outline);
      const fl = still ? 0 : Math.sin(t * 6) * 1.2;
      g.poly([[-11.6, -38.6], [-19.5, -37 + fl], [-11.1, -34.4]], pal.pennant, g.outline);
    }
    // the foot: tail to head, rising into a rounded head
    g.shaded(function (p) {
      p.moveTo(-21, -1);
      p.quadraticCurveTo(-16, 0.6, -10, 0.6);
      p.lineTo(12 + hx, 0.6);
      p.quadraticCurveTo(19.5 + hx, 0.6, 20.5 + hx, -5);
      p.quadraticCurveTo(21.5 + hx, -12, 16 + hx, -13.5);
      p.quadraticCurveTo(10.5 + hx, -14.5, 9.5 + hx, -9);
      p.quadraticCurveTo(8 + hx, -5, 1, -5);
      p.lineTo(-12, -5);
      p.quadraticCurveTo(-18.5, -4.5, -21, -1);
      p.closePath();
    }, pal.foot, { dx: 0.8, dy: -0.9, dark: pal.foot2, hl: [14 + hx, -10.5, 2.4, 1.2, -0.4] });
    if (dragon) g.poly([[-20.5, -1.4], [-25.5, -4.6], [-24.4, 0.9], [-26, 3.2]], pal.foot2, g.outline);
    // walk: a muscular ripple of pale arcs travelling back along the foot (snails glide; no bob)
    if (typeof o.walk === 'number' && !still) {
      const ph = ((o.walk % 1) + 1) % 1;
      for (let k = 0; k < 3; k++) {
        const x = 11 - (((ph + k / 3) % 1) * 30);
        g.arc(x, -0.6, 2.6, Math.PI * 1.15, Math.PI * 1.85, g.rgba(pal.gloss, 0.75), 0.9);
      }
    }
    // the shell (ember-shelled with dorsal spikes for the dragon)
    if (dragon) {
      for (let i = 0; i < 5; i++) {
        const a = -2.6 + i * 0.45, R = 11.5;
        const bx = -3 + Math.cos(a) * R, by = -17 + Math.sin(a) * R;
        const nx = Math.cos(a), ny = Math.sin(a);
        g.poly([[bx - ny * 1.8, by + nx * 1.8], [bx + nx * 4.2, by + ny * 4.2], [bx + ny * 1.8, by - nx * 1.8]], pal.horn, g.outline);
      }
    }
    drawShell(g, -3, -17, 11.5, pal, t, dragon, still);
    if (!dragon) g.line(-13, -12, 5, -23.5, '#6b4a2a', 1.3);     // the lance's strap across the shell
    // the head
    if (!dragon) {
      const mouthY = -5.5;
      if (atk) {
        g.ellipse(19.2 + hx, mouthY, 2.2, 1.6, '#3a1a1a', null);
        for (let i = 0; i < 6; i++) g.circle(17.8 + hx + (i % 3) * 1.3, mouthY - 0.9 + Math.floor(i / 3) * 1.8, 0.33, '#ffffff', null);
      } else g.arc(18.8 + hx, mouthY - 0.6, 1.5, 0.3, 2.6, g.outline, 0.7);
      const k = hurt ? 0.45 : cast ? 1.15 : 1;
      const spread = cast ? 1.8 : 0;
      const sway = still ? 0 : Math.sin(t * 1.3) * 1.2;
      const ex1 = 12.6 + hx - spread + sway * 0.6, ey1 = -19 - 12 * k, ex2 = 19.2 + hx + spread + sway, ey2 = -19 - 14 * k;
      g.limb(14.3 + hx, -18.5, ex1, ey1, 1.5, pal.foot, (14.3 + ex1) / 2 - 0.8, (-18.5 + ey1) / 2);
      g.limb(17.6 + hx, -18.5, ex2, ey2, 1.5, pal.foot, (17.6 + ex2) / 2 + 0.8, (-18.5 + ey2) / 2);
      helm(g, 16 + hx, -11.2, 9, 7.4, pal);
      eyeball(g, ex1, ey1, 2.3, pal, g.blink, 1);
      eyeball(g, ex2, ey2, 2.3, pal, g.blink, 1);
    } else {
      // horns curling back, the bucket helm hanging askew on the back one (he never took it off, he just grew)
      g.limb(13.5 + hx, -13.5, 8.5 + hx, -22, 1.6, pal.horn, 8.5 + hx, -15);
      g.limb(16.5 + hx, -13.8, 13 + hx, -23.5, 1.6, pal.horn, 17.5 + hx, -19);
      c.save();
      c.translate(8.2 + hx, -22.4);
      c.rotate(-0.45);
      helm(g, 0, 4.4, 5.6, 4.6, pal);
      c.restore();
      // glowing slit eyes
      const ey = -10.3;
      g.glow(17.3 + hx, ey, 3.6, pal.eyeGlow, 0.6);
      if (g.blink) g.line(15.9 + hx, ey, 18.7 + hx, ey, '#3a2a10', 0.8);
      else {
        g.ellipse(17.3 + hx, ey, 1.7, 1.3, pal.eyeGlow, g.outline);
        g.line(17.5 + hx, ey - 1, 17.5 + hx, ey + 1, '#1a1408', 0.6);
      }
      // mouth: a grin of fire on attack / cast, nostril smoke otherwise
      if (atk || cast) {
        g.poly([[20.8 + hx, -7.5], [16.5 + hx, -5.8], [20.9 + hx, -4.3]], '#3a1010', g.outline);
        g.glow(20 + hx, -8, 7, pal.fire, 0.9);
      } else if (!still) {
        for (let i = 0; i < 2; i++) {
          const ph = ((t * 0.9 + i * 0.5) % 1);
          g.circle(21.5 + hx + ph * 2, -8.5 - ph * 7, 0.8 + ph * 1.4, g.rgba('#8a8494', 0.55 * (1 - ph)), null);
        }
      }
      // the snail foot still dangles under the wings, with one slime drip
      const drip = still ? 1.2 : 1 + ((t * 0.8) % 1) * 2.2;
      g.ellipse(2, 0.8 + drip, 0.9, 0.9 + drip * 0.3, P.slime, null);
      // front wing
      wing(g, -4, -26, flap, 0.9, g.rgba(pal.wing, 0.95), g.shade(pal.wing, -0.35));
    }
  }

  /** In His Shell: the shell alone on a rim of foot, the door sealed, a BRB sign, ember cracks (the dragon is coming). */
  function drawShellLook(g, t, o) {
    const c = g.ctx, pal = P, still = !!o.still, pose = g.pose;
    const rock = pose === 'hurt' ? Math.sin(t * 22) * 0.12 : still ? 0 : Math.sin(t * 1.4) * 0.02;
    c.save();
    c.rotate(rock);
    g.ellipse(0, -1.4, 13.5, 2.6, pal.foot2, g.outline);
    drawShell(g, 0, -12.5, 12, pal, t, false, still);
    // ember cracks, pulsing
    const pulse = still ? 0.7 : 0.55 + 0.45 * Math.sin(t * 3.2);
    [[[-8, -16], [-5.5, -13.5], [-7, -10.5], [-4.5, -8]], [[2, -22.5], [4, -19.5], [2.5, -17]], [[-2, -5.5], [0.5, -7.5], [-0.5, -10]]].forEach(function (z) {
      g.glow(z[1][0], z[1][1], 4.5, EMBER, 0.45 * pulse);
      for (let i = 1; i < z.length; i++) g.line(z[i - 1][0], z[i - 1][1], z[i][0], z[i][1], g.rgba(EMBER, 0.6 + 0.4 * pulse), 1.1);
    });
    // the door: sealed with a chalky epiphragm
    g.ellipse(8.4, -6.2, 3.6, 4.6, pal.seal, g.outline, 0.25);
    g.circle(7.6, -7.4, 0.4, '#d8d0bf', null);
    g.circle(9, -5, 0.35, '#d8d0bf', null);
    // the sign on a nail (thin lines: it is small)
    const lw = g.lw;
    g.lw = Math.min(lw, 0.9);
    g.line(9, -13.4, 5.6, -10.9, '#4a3220', 0.5);
    g.line(9, -13.4, 12.4, -10.9, '#4a3220', 0.5);
    g.rect(4.2, -11.2, 9.6, 5.6, '#e2bf86', g.outline, 0.8);
    g.line(4.8, -6.4, 13.2, -6.4, g.shade(pal.sign, -0.25), 0.6);
    g.circle(9, -13.5, 0.6, '#6b6b6b', null);
    g.lw = lw;
    g.text('BRB', 9, -8.3, 4.2, '#2a1a10', null);
    // now and then one eyestalk peeks over the rim
    const ph = (t % 5);
    if (!still && ph > 4.2) {
      const up = Math.sin(((ph - 4.2) / 0.8) * Math.PI);
      g.limb(4, -21, 5, -21 - 6 * up, 1.4, pal.foot);
      eyeball(g, 5, -21 - 6 * up, 2, pal, false, 1);
    }
    c.restore();
  }

  /** Downed: just the shell, tipped over, a tiny white flag on a toothpick in the doorway. */
  function drawLying(g, t, o, lying, spec) {
    const c = g.ctx;
    // undo the engine's fall-over-backwards: the shell rests on its side instead
    const H = (spec && spec.height) || 36, W = (spec && spec.width) || 38;
    c.rotate(lying * Math.PI / 2);
    c.translate(-lying * H * 0.4, lying * (W * 0.3 + 1));
    c.save();
    c.rotate(-0.5 * lying);
    drawShell(g, 0, -11.5, 11.5, P, t, false, true);
    g.ellipse(8, -5.6, 3.4, 4.2, '#3a2a1e', g.outline, 0.3);
    g.line(8.5, -6, 13.5, -18, '#e8dcb8', 0.7);
    g.poly([[13.3, -17.6], [18.2, -17.2], [14.4, -14.6]], '#ffffff', g.outline);
    c.restore();
  }

  /** One painter, three looks (spec.look): the snail, In His Shell, the Dragonsnail. Billboards: only the facing mirrors. */
  function drawBenedick(g, t, o) {
    o = o || {};
    const look = (this && this.look) || 'snail';
    const lying = o.lying || 0;
    if (lying > 0.05) { drawLying(g, t, o, lying, this); return; }
    if (look === 'shell') { drawShellLook(g, t, o); return; }
    drawBody(g, t, o, look === 'dragon');
  }
  /** A gloss of fresh slime under the snail (ground level; not on still frames: portraits, measurements). */
  function slimeGloss(g, t, o) {
    if (o && o.still) return;
    g.ellipse(-2, 0.5, 18, 3, 'rgba(205,240,200,0.42)', null);
    g.circle(-12, 0.2, 0.7, 'rgba(255,255,255,0.8)', null);
    g.circle(-4, 1.4, 0.55, 'rgba(255,255,255,0.75)', null);
    g.circle(6, 0.4, 0.6, 'rgba(255,255,255,0.8)', null);
  }

  const SNAIL_SPRITE = { base: 'custom', look: 'snail', scale: 1, height: 36, width: 38, headY: -24,
    portrait: { x: 12, y: -22, r: 14 }, palette: P, draw: drawBenedick, underlay: slimeGloss };
  const SHELL_SPRITE = { base: 'custom', look: 'shell', scale: 1, height: 26, width: 28, headY: -14,
    portrait: { x: 2, y: -13, r: 13 }, palette: P, draw: drawBenedick, underlay: slimeGloss };
  const DRAGON_SPRITE = { base: 'custom', look: 'dragon', scale: 1.22, hover: 7, height: 40, width: 44, headY: -24,
    portrait: { x: 14, y: -15, r: 13 }, palette: PD, draw: drawBenedick, aura: { kind: 'glow', color: EMBER } };

  // tile-local painters (no direction, so the view's yaw never matters)
  function rand(x, y, k) {
    let n = (x * 73856093) ^ (y * 19349663) ^ (k * 83492791);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  /** Snail Slime: a faint sheen and 3-5 glossy mint blobs; iridescent dry arcs on its last round. */
  function drawSlime(g, sf, t) {
    const tl = g.tile || { x: 0, y: 0 };
    g.diamond(0, 0, 29, 14.5, 'rgba(205,240,200,0.16)');
    const n = 3 + Math.floor(rand(tl.x, tl.y, 1) * 3);
    for (let i = 0; i < n; i++) {
      const u = (rand(tl.x, tl.y, 10 + i) - 0.5) * 0.62, v = (rand(tl.x, tl.y, 20 + i) - 0.5) * 0.62;
      const p = g.local ? g.local(u, v) : [(u - v) * 32, (u + v) * 16];
      const r = 3.2 + rand(tl.x, tl.y, 30 + i) * 3.2;
      g.ellipse(p[0], p[1], r, r * 0.5, 'rgba(196,238,186,0.6)');
      g.ellipse(p[0] - r * 0.3, p[1] - r * 0.14, r * 0.38, r * 0.15, 'rgba(255,255,255,0.75)');
      g.circle(p[0] + r * 0.35, p[1] + r * 0.08, 0.6, 'rgba(255,255,255,0.85)');
      if (sf && sf.turns === 1) g.arc(p[0], p[1], r * 0.85, Math.PI * 1.05, Math.PI * 1.75, 'rgba(255,170,240,0.55)', 0.7);
    }
  }
  /** Snail Mail: a canvas mail sack, twine and a bow, a stamp, a luggage tag reading LATE; it bobs gently. */
  function drawParcel(g, obj, t) {
    const c = g.ctx, bob = Math.sin((t || 0) * 2) * 0.6, cy = -7 + bob;
    g.ellipse(0, 0, 8, 2.8, 'rgba(0,0,0,0.3)');
    const gr = c.createRadialGradient(-2.5, cy - 3, 1, 0, cy, 9);
    gr.addColorStop(0, '#e6c590'); gr.addColorStop(1, '#9a7240');
    c.beginPath(); c.ellipse(0, cy, 7.4, 6.6, 0, 0, Math.PI * 2);
    c.fillStyle = gr; c.fill(); c.strokeStyle = '#2a1c12'; c.lineWidth = 1.2; c.stroke();
    g.ellipse(0, cy - 6.6, 2.6, 1.6, '#b98b55', '#2a1c12');
    g.line(-7, cy, 7, cy, '#e8dcb8', 0.8);
    g.line(0, cy - 6.4, 0, cy + 6.5, '#e8dcb8', 0.8);
    g.ellipse(-2, cy - 8.2, 2, 1.2, null, '#e8dcb8');
    g.ellipse(2, cy - 8.2, 2, 1.2, null, '#e8dcb8');
    g.rect(1.6, cy - 3.4, 3.6, 4.2, '#f3efe4', '#c0392b', 0.2);
    g.rect(2.4, cy - 2.6, 2, 2.4, '#5fcf9b');
    g.line(-4, cy + 1, -8, cy + 4, '#e8dcb8', 0.6);
    g.rect(-12.2, cy + 3, 6.4, 3.6, '#f3e2b8', '#2a1c12', 0.5);
    g.text('LATE', -9, cy + 4.9, 3.6, '#c0392b', { bold: true });
  }
  /** The Inevitable's slime streak from where he was to where he arrives (both tiles projected: right at any yaw). */
  function drawStreak(c, x, y, p, view, evt) {
    if (!view || typeof view.toScreen !== 'function' || !evt || !evt.to) return;
    const b = view.toScreen(evt.to.x, evt.to.y, evt.to.h || 0), z = view.zoom || 1;
    const k = Math.min(1, p / 0.65);
    const ex = x + (b.x - x) * k, ey = y + (b.y - y) * k;
    c.save();
    c.globalAlpha = p > 0.75 ? Math.max(0, (1 - p) / 0.25) : 1;
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(205,240,200,0.6)'; c.lineWidth = 8 * z;
    c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.8 * z;
    c.beginPath(); c.moveTo(x, y - 1.5 * z); c.lineTo(ex, ey - 1.5 * z); c.stroke();
    c.fillStyle = '#c98a45'; c.strokeStyle = '#2a1c12'; c.lineWidth = 1.2 * z;
    c.beginPath(); c.arc(ex, ey - 6 * z, 5 * z, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
  }

  // ---- statuses ------------------------------------------------------------------------------------------
  DD.registerStatus({
    id: SHELL_ST, name: 'In His Shell', icon: '🐚', color: '#c98a45', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1, takenMult: 0.5,
    desc: function () { return 'In his shell: takes half damage. Bursts out as the Dragonsnail at the start of his next turn.'; },
  });
  DD.registerStatus({
    id: DRAGON, name: 'Dragonsnail', icon: '🐉', color: EMBER, type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', skipFresh: false, defaultTurns: DRAGON_TURNS, flying: true,
    desc: function (st) {
      const n = st && st.turns > 0 ? st.turns : DRAGON_TURNS;
      return 'Dragonsnail: flying, +' + DRAGON_MOV + ' move, Slow Burn basic attack, Dragonsnail skills ready, no slime trail. ' +
        'Lands when this runs out (' + plural(n, 'turn') + ' left), gliding to the nearest safe tile first if he must.';
    },
  });

  // ---- surface and object -------------------------------------------------------------------------------
  DD.registerSurface({
    id: SLIME, name: 'Snail Slime', color: 'rgba(205,240,200,0.45)', turns: SLIME_TURNS,
    stops: function (unit) { return sticks(unit); },
    snagStatus: 'root',
    // QA HERO-2: root-proof foes walk through (sticks); the only one registered is the act-1 Cellar Spider (a suite pins it)
    desc: 'Grounded foes (not bosses or spiders) that walk onto it stop there. Heroes and flyers don\'t mind it. Fire dries it up.',
    react: { fire: { surface: null } },
    onEnter: function (unit, tile, cause) { if (cause === 'move' && sticks(unit)) stuck(unit, tile); },
    draw: drawSlime,
  });
  DD.registerObject({
    id: PARCEL, name: 'Snail Mail Parcel', blocksMove: false, blocksLos: false, hp: 0, height: 0.45, targetable: false,
    color: '#b98b55',
    desc: 'Snail Mail from Benedick: at the start of his next turn, damage to every foe on or next to this tile. No signature required.',
    draw: drawParcel,
  });

  // ---- basic attacks (the form decides which one he has) --------------------------------------------------
  DD.registerSkill({
    id: TEETH, name: 'Fourteen Thousand Teeth', owner: HERO, icon: '🦷', kind: 'attack', tags: ['melee', 'bite'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 5, plant: 10 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Snail form: deal ' + L.dmg + ' damage to an adjacent foe (' + L.plant + ' if it is a plant).'; },
    flavor: 'A garden snail has about fourteen thousand teeth. He has named every one of them.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      const plant = isPlant(f);
      DD.FX.lunge(u, f);
      DD.FX.sound('hit');
      if (plant) DD.FX.text(f, 'Salad!', { color: '#9be07a', size: 15 });
      A().damage(u, f, plant ? ctx.L.plant : ctx.L.dmg, { tags: ['melee', 'bite'] });
    },
  });

  DD.registerSkill({
    id: BURN, name: 'Slow Burn', owner: HERO, icon: '🔥', kind: 'attack', tags: ['ranged', 'fire', 'burn'],
    ap: 1, cooldown: 0,
    levels: SLOW_BURN.map(function (b) { return { dmg: b.dmg, burn: b.burn }; }),
    target: { type: 'unit', range: [1, 3], los: true, filter: 'enemy' },
    desc: function (L, user) {
      return 'Dragonsnail form: deal ' + L.dmg + ' fire damage to a foe within ' + reach(user, BURN, L, 3) + ' and apply Burn ' + L.burn + '.';
    },
    flavor: 'Dragon fire, at snail speed. It gets there. It always gets there.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.projectile(u, f, { kind: 'fireball', color: EMBER });
      DD.FX.particles(f, { kind: 'smoke', count: 5, parallel: true });
      A().damage(u, f, ctx.L.dmg, { element: 'fire', tags: ['ranged', 'fire'] });
      if (active(f)) A().addStatus(f, 'burn', { stacks: ctx.L.burn }, u);
    },
  });

  // ---- the switch: Coming Out of My Shell ---------------------------------------------------------------------
  DD.registerSkill({
    id: SHELL, name: 'Coming Out of My Shell', owner: HERO, icon: '🐚', kind: 'utility', tags: ['shapeshift', 'shell'],
    ap: 1, cooldown: function (L) { return L.cd; },
    // `slow` / `burst`, never `dmg`: nothing is dealt now (AutoPlay's quick estimates read L.dmg as damage now)
    levels: [{ cd: 4, slow: 4, burst: 0 }, { cd: 3, slow: 5, burst: 0 }, { cd: 3, slow: 6, burst: 6 }],
    target: { type: 'self' },
    canUse: function (ctx) {
      const u = ctx && ctx.user;
      return !u ? true : isDragon(u) ? 'Already out of his shell.' : inShell(u) ? 'Already in his shell.' : true;
    },
    desc: function (L, user) {
      return 'Spend all your AP hiding in your shell: half damage until your next turn. Then burst out' +
        (L.burst > 0 ? ' (' + L.burst + ' fire damage to adjacent foes)' : '') + ' as the Dragonsnail for ' + DRAGON_TURNS +
        ' turns: flying, +' + DRAGON_MOV + ' move, Slow Burn basic (' + L.slow + ' fire damage within ' + reach(user, BURN, null, 3) + ', Burn 1).';
    },
    forgetWarning: 'The Dragonsnail lives in here. Without it he stays a snail all fight (unless the Do Not Disturb Sign sends ' +
      'him in), and his Dragonsnail skills gather dust. Slowly.',
    flavor: 'He\'s been working on himself. He\'s coming out of his shell. Way, way out.',
    execute: function (ctx) { withdraw(ctx.user, ctx.L, 'skill'); },
    aiScore: shellScore,
  });

  // ---- either form -------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'ben_slime_line', name: 'Slime Line', owner: HERO, icon: '🪢', kind: 'attack', tags: ['ranged', 'pull'],
    ap: 1, cooldown: 1,
    levels: [{ dmg: 3, pull: 2, range: 3 }, { dmg: 4, pull: 2, range: 4 }, { dmg: 5, pull: 3, range: 4 }],
    target: { type: 'unit', range: function (L) { return [2, L.range]; }, los: true, filter: 'enemy' },
    desc: function (L, user) {
      return 'Deal ' + L.dmg + ' damage to a foe 2 to ' + reach(user, 'ben_slime_line', L, L.range) + ' tiles away and pull it ' + plural(L.pull, 'tile') + ' toward you.';
    },
    flavor: 'A strand of slime, a flick of the eyestalks, and suddenly you\'re in this together.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.beam(u, f, { color: GOO, width: 2 });
      A().damage(u, f, ctx.L.dmg, { tags: ['ranged', 'slime'] });
      if (active(f) && active(u)) A().pull(u, f, { x: u.x, y: u.y }, ctx.L.pull);
    },
  });

  DD.registerSkill({
    id: 'ben_wait', name: 'I\'ll Wait', owner: HERO, icon: '🕰️', kind: 'utility', tags: ['taunt', 'ranged', 'block'],
    ap: 1, cooldown: 2,
    levels: [{ range: 4, block: 4 }, { range: 5, block: 5 }, { range: 6, block: 6 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy' },
    desc: function (L, user) { return 'Taunt a foe within ' + reach(user, 'ben_wait', L, L.range) + ' for its next turn and gain ' + L.block + ' Block.'; },
    flavor: 'Take your time. He has all of it.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(u)) return;
      if (foeOf(u, f)) A().addStatus(f, 'taunt', { turns: 1 }, u);
      A().addBlock(u, ctx.L.block);
      DD.FX.text(u, 'I\'ll wait.', { color: '#e8f5e0', size: 15 });
    },
  });

  DD.registerSkill({
    id: 'ben_lettuce', name: 'Lettuce Pray', owner: HERO, icon: '🥬', kind: 'buff', tags: ['block', 'aoe', 'ally'],
    ap: 1, cooldown: 2,
    levels: [{ block: 4, r: 1 }, { block: 5, r: 1 }, { block: 6, r: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'You and every ally within ' + plural(L.r, 'tile') + ' gain ' + L.block + ' Block.'; },
    flavor: 'For what we are about to receive, may we be truly crunchy.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'leaves', count: 12 });
      DD.FX.text(u, 'Lettuce pray.', { color: '#bff0a0', size: 15 });
      DD.FX.sound('buff');
      ctx.friends.forEach(function (a) { if (active(a)) A().addBlock(a, ctx.L.block); });
    },
  });

  DD.registerSkill({
    id: 'ben_shellacking', name: 'Shellacking', owner: HERO, icon: '💫', kind: 'attack', tags: ['melee', 'dazzle'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 8, turns: 1 }, { dmg: 10, turns: 1 }, { dmg: 12, turns: 2 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe; it is Dazzled for ' + plural(L.turns, 'turn') + '.'; },
    flavor: 'A thorough shellacking, from an expert in shells.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.lunge(u, f);
      DD.FX.shake(3, 160);
      DD.FX.sound('crit');
      DD.FX.text(f, 'SHELLACKED!', { color: '#ffd23f', size: 15 });
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'shell'] });
      if (active(f)) A().addStatus(f, 'dazzled', { turns: ctx.L.turns }, u);
    },
  });

  DD.registerSkill({
    id: 'ben_spit_shine', name: 'Spit Shine', owner: HERO, icon: '🫧', kind: 'utility', tags: ['surface', 'slime', 'ranged'],
    ap: 1, cooldown: 2,
    levels: [{ range: 3, turns: 3 }, { range: 4, turns: 3 }, { range: 5, turns: 4 }],
    target: { type: 'tile', range: function (L) { return [1, L.range]; }, los: true, filter: 'any' },
    area: { shape: 'circle', size: 1 },
    desc: function (L, user) {
      return 'Cover a tile within ' + reach(user, 'ben_spit_shine', L, L.range) + ' and the 4 tiles around it in Snail Slime for ' +
        plural(L.turns, 'round') + ' (bare floor only).';
    },
    flavor: 'He calls it detailing. The monsters call it "my shoes".',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u) || !ctx.target) return;
      DD.FX.projectile(u, ctx.target, { kind: 'flask', color: GOO });
      DD.FX.particles(ctx.target, { kind: 'bubbles', color: GOO, count: 12 });
      ctx.tiles.forEach(function (q) { laySlime(q.x, q.y, ctx.L.turns, u); });
    },
    aiScore: spitScore,
  });

  DD.registerSkill({
    id: MAIL, name: 'Snail Mail', owner: HERO, icon: '📦', kind: 'attack', tags: ['ranged', 'aoe', 'delayed'],
    ap: 2, cooldown: 2,
    // key `mail`, not `dmg`: nothing lands now (AutoPlay's quick estimates read L.dmg as damage now)
    levels: [{ mail: 9 }, { mail: 11 }, { mail: 13 }],
    target: { type: 'tile', range: [1, 5], los: false, filter: 'any',
      canTarget: function (ctx) {
        const p = ctx && ctx.target;
        const t = p && G().tile(p.x, p.y);
        if (!t || !G().isWalkable(p.x, p.y, null) || G().isDrop(p.x, p.y) || t.obj) return 'No room for a parcel.';
        return true;
      } },
    area: { shape: 'circle', size: 1 },
    desc: function (L, user) {
      return 'Post a parcel to a tile within ' + reach(user, MAIL, L, 5) + ' (no sight needed). At the start of your next turn, every foe on or next to it takes ' + L.mail + ' damage.';
    },
    flavor: 'Guaranteed delivery. Not guaranteed when. Fine: next turn. Probably.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!active(u) || !p) return;
      const t = G().tile(p.x, p.y);
      if (!t || t.obj || !G().isWalkable(p.x, p.y, null) || G().isDrop(p.x, p.y)) return;
      if (!A().placeObject(p.x, p.y, PARCEL, { data: { dmg: ctx.L.mail, src: u.id } })) return;
      DD.FX.projectile(u, p, { kind: 'flask', color: '#b98b55' });
      DD.FX.text(p, '📦 Posted', { color: '#f3e2b8', size: 14 });
      A().maybeBark(u, 'mail', 0.4);
      A().log(u.name + ' posts a parcel. Estimated delivery: his next turn.', 'hero');
    },
    // honest: nothing happens now; the HUD shows what is due (after its armor, his Weak, a cheat's takenMult...)
    preview: function (ctx) {
      const out = {};
      (ctx.foes || []).forEach(function (f) { out[f.id] = { dmg: 0, text: '📦 ' + mailHit(ctx.user, f, ctx.L.mail) + ' next turn' }; });
      return out;
    },
    aiScore: mailScore,
  });

  // ---- Dragonsnail only ------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'ben_breath', name: 'Morning Breath', owner: HERO, icon: '🐲', kind: 'attack', tags: ['fire', 'aoe', 'cone', 'weak', 'dragon'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 5, size: 2, turns: 1 }, { dmg: 6, size: 2, turns: 1 }, { dmg: 7, size: 3, turns: 1 }],
    target: { type: 'tile', range: function (L) { return [1, L.size]; }, los: false, filter: 'any', straight: true },
    area: { shape: 'cone', size: function (L) { return L.size; } },
    canUse: gate,
    desc: function (L) {
      return 'Dragonsnail only: deal ' + L.dmg + ' fire damage to every foe in a cone ' + L.size + ' tiles deep; each is Weakened for ' + plural(L.turns, 'turn') + '.';
    },
    flavor: 'He has been in a shell all night. Nobody is ready for this.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      const far = ctx.tiles[ctx.tiles.length - 1];
      if (far) DD.FX.beam(u, far, { color: '#ff8a2a', width: 6 });
      DD.FX.sound('fire');
      ctx.tiles.forEach(function (q, i) { DD.FX.tile(q.x, q.y, 'glow', { color: '#ff8a2a', parallel: i > 0 }); });
      DD.FX.particles(u, { kind: 'fire', count: 20, parallel: true });
      A().maybeBark(u, 'breath', 0.3);
      ctx.foes.slice().sort(byPos).forEach(function (f) {
        if (!active(f) || !active(u)) return;
        A().damage(u, f, L.dmg, { element: 'fire', tags: ['fire', 'aoe', 'breath'] });
        if (active(f)) A().addStatus(f, 'weak', { turns: L.turns }, u);
      });
    },
  });

  DD.registerSkill({
    id: 'ben_wing_it', name: 'Wing It', owner: HERO, icon: '🪽', kind: 'attack', tags: ['aoe', 'push', 'dragon'],
    ap: 1, cooldown: 2,
    levels: [{ dmg: 2, push: 2 }, { dmg: 3, push: 2 }, { dmg: 4, push: 3 }],
    target: { type: 'self' },
    area: { shape: 'adjacent' },
    canUse: gate,
    desc: function (L) { return 'Dragonsnail only: deal ' + L.dmg + ' damage to every adjacent foe and push each one ' + plural(L.push, 'tile') + ' away.'; },
    flavor: 'He has had wings for eleven seconds. He is making it up as he goes.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.text(u, 'FLAP!', { color: '#c8f5d8', size: 16 });
      DD.FX.particles(u, { kind: 'dust', count: 12 });
      DD.FX.particles(u, { kind: 'feathers', count: 6, color: '#2f8f5b', parallel: true });
      DD.FX.sound('push');
      ctx.foes.slice().sort(byPos).forEach(function (f) {
        if (!active(f) || !active(u)) return;
        const dir = DD.util.dirTo(u, f);
        A().damage(u, f, ctx.L.dmg, { tags: ['aoe', 'push'] });
        if (active(f)) A().push(u, f, dir, ctx.L.push);
      });
    },
  });

  DD.registerSkill({
    id: 'ben_riddle', name: 'Riddle Me This', owner: HERO, icon: '❓', kind: 'spell', tags: ['stun', 'ranged', 'dragon'],
    ap: 2, cooldown: function (L) { return L.cd; },
    levels: [{ range: 3, cd: 3 }, { range: 4, cd: 3 }, { range: 4, cd: 2 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy' },
    canUse: gate,
    desc: function (L, user) { return 'Dragonsnail only: Stun a foe within ' + reach(user, 'ben_riddle', L, L.range) + ' (it skips its next turn).'; },
    flavor: 'What has one foot, a house and fourteen thousand teeth? Take your time. Take a whole turn.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.text(f, '???', { color: '#ffd23f', size: 18 });
      DD.FX.sound('magic');
      A().maybeBark(u, 'riddle', 0.6);
      A().addStatus(f, 'stun', { turns: 1 }, u);
    },
  });

  // ---- signature: The Inevitable -------------------------------------------------------------------------------
  /** Where he arrives next to `foe`: a free, non-drop tile, hazard-free first, then nearest to him (Basanos' Pounce). */
  function landingTile(u, foe) {
    if (!u || !foe) return null;
    if (dist(u, foe) === 1) return { x: u.x, y: u.y };
    const spots = DD.util.DIRS.map(function (d) { return { x: foe.x + d.x, y: foe.y + d.y }; }).filter(function (p) {
      return G().isFree(p.x, p.y, u) && !G().isDrop(p.x, p.y);
    });
    spots.sort(function (a, b) {
      return (G().hazardAt(a.x, a.y, u) ? 1 : 0) - (G().hazardAt(b.x, b.y, u) ? 1 : 0) || dist(a, u) - dist(b, u) || byPos(a, b);
    });
    return spots[0] || null;
  }

  DD.registerSkill({
    id: 'ben_inevitable', name: 'The Inevitable', owner: HERO, icon: '🐌', kind: 'attack', tags: ['melee', 'teleport', 'stun'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 18 }],
    target: {
      type: 'unit', range: [1, 99], los: false, filter: 'enemy',
      objects: false,   // he arrives next to a foe; a crate is not worth the trip (his basic still bites one)
      canTarget: function (ctx) { return landingTile(ctx.user, ctx.targetUnit) ? true : 'No room to arrive.'; },
    },
    desc: function (L) { return 'Appear next to any foe on the battlefield (no line of sight needed): deal ' + L.dmg + ' damage and Stun it.'; },
    flavor: 'You can run. You can hide. He is already halfway there. He was always halfway there.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      const spot = landingTile(u, f);
      if (!spot) return;
      DD.FX.banner('THE INEVITABLE', { sub: 'He was always on his way', color: MINT });
      if (spot.x !== u.x || spot.y !== u.y) {
        const from = { x: u.x, y: u.y };
        DD.FX.custom('custom', { at: { x: from.x, y: from.y, h: DD.FX.tileH ? DD.FX.tileH(from.x, from.y) : 0 },
          to: { x: spot.x, y: spot.y, h: DD.FX.tileH ? DD.FX.tileH(spot.x, spot.y) : 0 }, ms: 600, layer: 'world', draw: drawStreak });
        if (!A().teleport(u, spot.x, spot.y, { fx: false })) return;
        DD.FX.jump(u, from, spot, { ms: 300 });
      }
      if (!active(u) || !active(f) || dist(u, f) !== 1) return;
      A().face(u, f);
      DD.FX.lunge(u, f);
      DD.FX.shake(8, 400);
      DD.FX.sound('magic');
      DD.FX.sound('crit');
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'bite', 'signature'] });
      if (active(f)) A().addStatus(f, 'stun', { turns: 1 }, u);
      A().log(u.name + ' was always on his way. He has arrived.', 'hero');
    },
  });

  // ---- passive: A Sticky Situation ---------------------------------------------------------------------------
  const PASSIVE = {
    name: 'A Sticky Situation',
    desc: 'At the end of his turn, Benedick leaves Snail Slime on the bare floor of every tile he crawled off (' + SLIME_TURNS +
      ' rounds). Grounded foes, bosses and spiders aside, that walk onto it stop there.',
    hooks: {
      onCombatStart: function (u) {
        const d = dataOf(u);
        d.steps = []; d.pos = { x: u.x, y: u.y }; d.dnd = false; d.dndNow = false;
        syncForm(u);
      },
      onRoundStart: function (u) { syncForm(u); },
      // parcels first (even stunned, shelled or a dragon), then out of the shell, then a fresh crawl record
      onTurnStart: function (u) {
        deliver(u);
        emerge(u);
        syncForm(u);
        const d = dataOf(u);
        d.pos = { x: u.x, y: u.y };
        d.steps = [];
      },
      onTurnEnd: function (u) {
        layTrail(u);
        glideIfNeeded(u);
        syncForm(u);
        const d = dataOf(u);
        d.steps = [];
        d.pos = { x: u.x, y: u.y };
      },
      onEnterTile: function (u, tile, cause) { recordStep(u, tile, cause); },
      // QA HERO-4: the shell's half damage shows on the hit itself (cosmetic; the number is the engine's takenMult)
      onTakeDamage: function (d) {
        const u = d && d.target;
        if (!u || u.defId !== HERO || A().simulating || !inShell(u) || !((d.dealt || 0) + (d.blocked || 0) > 0)) return;
        DD.FX.text(u, '🐚 halved', { color: '#e8d2a6', size: 13 });
      },
      onStatusApplied: function (u) { syncForm(u); },
      onStatusRemoved: function (u, st, reason) {
        const was = peek(u) && peek(u).dragon;
        syncForm(u);
        if (st && st.id === DRAGON && was && !isDragon(u) && active(u)) land(u);
      },
      onHealed: function (u) { syncForm(u); },
      onSkillUsed: function (ctx) { if (ctx && ctx.user && ctx.user.defId === HERO) syncForm(ctx.user); },
      onOpportunityAttack: function (o) {
        if (o && o.attacker && o.attacker.defId === HERO) syncForm(o.attacker);
        if (o && o.mover && o.mover.defId === HERO) syncForm(o.mover);
      },
      onDowned: function (u) { returnToSender(u); syncForm(u); },
      // pure: a Dragonsnail strikes nobody from the air (Slow Burn is ranged; this also cancels a stale melee slot)
      modifyOpportunity: function (o) {
        const a = o && o.attacker;
        if (a && a.kind === 'hero' && a.defId === HERO && isDragon(a)) o.cancel = true;
      },
    },
  };

  // ---- the form's voice (QA HERO-6): the snail's move / kill lines, and the Dragonsnail's (ALL CAPS, naming nobody) ----
  const FORM_BARKS = {
    snail: {
      move: ['Coming through. Gradually.', 'One tile at a time. Two, on a good day.', 'Mind the slime. It\'s for them, not you.',
        'I am, technically, sprinting.', 'Full speed ahead! This is it. This is full speed.'],
      kill: ['Fourteen thousand teeth. All of them sorry.', 'Got there in the end. I always do.', 'Inevitable. That\'s the word. Inevitable.',
        'Out-paced by a snail. Put that on your headstone.', 'And THAT is why you never turn your back on a snail.'],
    },
    dragon: {
      move: ['BEHOLD MY AIRSPEED! IT IS CONSIDERABLE!', 'WINGS! I HAVE BEEN WALKING LIKE A FOOL!', 'MAKE WAY! A DRAGON IS LATE FOR NOTHING!',
        'SPEED IS MY BIRTHRIGHT. SINCE ROUGHLY NOW.'],
      kill: ['BURNT. SLOWLY. AS FORETOLD.', 'THE SLOW BURN CLAIMS ANOTHER! LETTUCE FOR ALL!', 'KNEEL! OH. YOU HAVE ALREADY FALLEN. CARRY ON.',
        'INEVITABLE! I SAID IT IN CAPITALS THIS TIME.'],
    },
  };
  /** Is the fight's Benedick a Dragonsnail right now? (One Benedick a party: his barks follow that unit's form.) */
  function dragonOnBoard() {
    const s = DD.Combat && DD.Combat.state;
    return !!(s && s.units && s.units.some(function (u) { return u.defId === HERO && !u.dead && isDragon(u); }));
  }

  // ---- hero ----------------------------------------------------------------------------------------------------
  // race: the spec's, restored in review (V3) once META-UI's Hall roster fit its two-line race + class (ui fit suite)
  DD.registerHero({
    id: HERO, name: 'Benedick', epithet: 'the Inevitable', race: 'Snail (Dragon, Allegedly)', cls: 'Knight of the Margins',
    role: 'Slow shell tank · a dragon in bursts', complexity: 3,
    blurb: 'A courteous snail knight from the margins of old manuscripts, where the snail always beats the knight. ' +
      'He is the slowest hero in the dungeon, his slime trail stops monsters in their tracks, and he always gets there. ' +
      'Give him a turn in his shell and out bursts a fire-breathing Dragonsnail. Please don\'t mention salt.',
    color: MINT, unlock: null,
    stats: { hp: 28, ap: 3, mov: 2, armor: 2, init: -2 }, growth: { hp: 4 }, flags: {},
    sprite: SNAIL_SPRITE,
    basic: TEETH, signature: 'ben_inevitable',
    passive: PASSIVE,
    startingSkills: [SHELL, 'ben_slime_line'],
    skillPool: [SHELL, 'ben_slime_line', 'ben_wait', 'ben_lettuce', 'ben_shellacking', 'ben_spit_shine', MAIL,
      'ben_breath', 'ben_wing_it', 'ben_riddle'],
    summons: [],
    barks: {
      select: ['Benedick, at your service. I\'ll be right there. Eventually.', 'A knight of the margins, reporting for duty. Mind the slime.',
        'Slow and steady. Mostly slow.', 'I bring my own house. You\'d be amazed how rare that is.', 'Is there salt where we\'re going? Be honest with me.'],
      start: ['Go on ahead, everyone. I\'ll catch up. Round three, perhaps.', 'Steady on, everyone. Let them come to me.',
        'Before we begin: is anyone carrying salt? Anyone at all?', 'Monsters! Form an orderly queue. I\'m slow.', 'Onward! At a dignified pace.'],
      // QA HERO-6: move and kill speak in the form he is in (the engine reads def.barks by key, whatever the form)
      get move() { return dragonOnBoard() ? FORM_BARKS.dragon.move : FORM_BARKS.snail.move; },
      swap: ['After you, {ally}. I insist. I always insist.', 'Swap with me, {ally}. Mind the slime on your way.'],
      get kill() { return dragonOnBoard() ? FORM_BARKS.dragon.kill : FORM_BARKS.snail.kill; },
      hurt: ['Ow! The shell! I live in that!', 'That\'s a load-bearing shell, thank you very much.', 'Mind the shell! It\'s a listed building!',
        'A dent! In my ancestral home!'],
      lowhp: ['I\'m drying out here! Someone find me a puddle!', 'Things look grim. Is that... is that SALT?',
        'Retreating! You\'ll see me leave in about a week.', 'The shell\'s holding. I\'m less sure about me.'],
      downed: ['Tell the lettuce... I loved it...', 'Nobody\'s... home...', 'Was it... salt...?', 'I\'ll be back. Slowly. But back.'],
      revive: ['Back out of my shell! Did I miss much?', 'Up! Moisturised and furious.', 'Thank you. I\'d have got up myself. By Tuesday.',
        'Still inevitable. Just briefly horizontal.'],
      ally_down: ['Hold on! I\'m coming! Give me... a while!', 'Somebody help them up! I\'ll be there by round four!',
        'Right. That\'s it. I\'m coming out of my shell.', 'Leave them alone! I\'m approaching! Menacingly!'],
      levelup: ['I\'ve grown! A whole new ring on my shell.', 'Stronger, wiser, and roughly as fast.', 'Character growth. Very slow. Very real.',
        'I feel more dragon than ever. Slightly.'],
      victory: ['Victory! I\'ll just be a moment catching up to it.', 'A clean win. Well, slimy. A slimy win.',
        'Inevitable, as I said. Did I say? I meant to.', 'Lettuce celebrate!', 'Splendid fight. Who\'s got a cucumber?'],
      idle: ['Betty, that was my lettuce hoard. That WAS my lettuce hoard.', 'Pebbles, lovely to see you. From over here. Fire dries me out.',
        'Syllamin, I am not a slug. Please stop rhyming me with "slug".', 'Josiah, your prescription says "salt". I\'m getting a second opinion.',
        'Kiri, you walk through walls. I carry mine. We\'re not so different.', 'Slate, Air Mail is NOT how snails travel. Put me down. Gently.'],
      signature: ['I was always on my way.', 'You can run. I\'d prefer it, frankly.', 'Surprise! I\'ve been crawling since breakfast.',
        'Did you think you\'d outrun me? Adorable.', 'Inevitable. Look it up.'],
      shell: ['Nobody\'s home! Back in a turn!', 'BRB. Please don\'t touch the shell.', 'Going in a snail. Coming out... different.', 'Hold my lettuce.'],
      emerge: ['BEHOLD! I HAVE COME OUT OF MY SHELL!', 'TREMBLE, MORTALS! AND BRING LETTUCE!', 'I AM THE WYRM OF THE GARDEN WALL! FEAR MY FOOT!',
        'WINGS! I HAVE WINGS! WHY DID NOBODY TELL ME?'],
      land: ['And... I\'m a snail again. Lovely. Fine.', 'The dragon\'s gone. The dignity stays.', 'Back to cruising speed. Which is none.',
        'That was fun. Same time in a few turns?'],
      glide: ['Not landing there, thank you. Over here.', 'Gliding to safety. Gracefully. Mostly.'],
      stuck: ['Sticky, isn\'t it? Take your time.', 'Ah. You\'ve found my trail.', 'Stay a while. You haven\'t much choice.'],
      mail: ['Posted! Arriving next turn. Ish.', 'Please allow one turn for delivery.', 'First class! Well. Snail class.'],
      delivery: ['Special delivery! Sign here. And here.', 'Your parcel has arrived. So has the damage.', 'Delivered! No refunds.'],
      breath: ['SMELL THAT? THAT\'S DRAGON.', 'I HAVEN\'T BRUSHED SINCE THE LAST AGE!'],
      riddle: ['WHAT HAS ONE FOOT, A HOUSE AND FOURTEEN THOUSAND TEETH?', 'RIDDLE ME THIS! TAKE ALL THE TIME YOU NEED!',
        'WHAT GOES SLOW, THEN FAST, THEN ON FIRE? YOU.'],
      dnd: ['DO NOT DISTURB. I mean it this time.', 'Nobody\'s home! Leave a message!'],
    },
  });

  // ---- hero items (rare, rare, legendary) ----------------------------------------------------------------------
  DD.registerItem({
    id: SERUM, name: 'Snail Mucin Serum', slot: 'trinket', rarity: 'rare', icon: '🧴', hero: HERO,
    stats: {},
    desc: 'Whenever a foe gets stuck in Benedick\'s Snail Slime, he heals ' + SERUM_HEAL + ' HP.',
    flavor: 'Ninety-six percent snail mucin. Dermatologists love him. Monsters do not.',
    hooks: {},   // stuck() reads it: his only heal (D9), grown out of his slime
  });
  DD.registerItem({
    id: STRIPES, name: 'Racing Stripes', slot: 'armor', rarity: 'rare', icon: '🏁', hero: HERO,
    stats: { hp: 3, mov: 1 },
    desc: '+3 max HP and +1 move.',
    flavor: 'Painted on his shell, both sides. Science says stripes don\'t make you faster. Science has never met him.',
    hooks: {},
  });
  DD.registerItem({
    id: SIGN, name: 'Do Not Disturb Sign', slot: 'weapon', rarity: 'legendary', icon: '🚪', hero: HERO,
    stats: { dmg: 0.1 },
    desc: '+10% damage. Once per fight, a hit that would down you leaves you at 1 HP, hiding in your shell (as Coming Out of My Shell, without its cooldown).',
    flavor: 'NOBODY HOME. PLEASE LEAVE PARCELS WITH THE NEIGHBOUR.',
    hooks: {
      // a death-save, not a heal (D9 counts them apart): once a fight he stays up at 1 HP
      preventDeath: function (unit) {
        if (!unit || unit.kind !== 'hero' || !hasItem(unit, SIGN)) return false;
        const d = dataOf(unit);
        if (d.dnd) return false;
        d.dnd = true;
        d.dndNow = true;
        unit.hp = 1;
        return true;
      },
      onDeathPrevented: function (unit) {
        const d = peek(unit);
        if (!d || !d.dndNow) return;
        d.dndNow = false;
        A().stopMove(unit);
        withdraw(unit, levelRow(shellLevel(unit)), 'sign');
        DD.FX.text(unit, '🚪 DO NOT DISTURB', { color: '#f3e2b8', size: 16 });
        A().bark(unit, 'dnd');
        A().log('DO NOT DISTURB. ' + unit.name + ' refuses to go down and hides in his shell at 1 HP.', 'hero');
      },
    },
  });

  // ---- loading-screen tips ----------------------------------------------------------------------------------------
  DD.registerNarration('tips', [
    'Benedick\'s slime stops any grounded foe (not a boss or a spider) that walks onto it. Taunt one across it with I\'ll Wait and it stops short.',
    'Act first, then tuck Benedick into his shell with his last AP: next turn the Dragonsnail bursts out, flying.',
    'Snail Mail lands at the start of Benedick\'s next turn, on the tile, not the foe. Post it on something that can\'t leave.',
  ]);

  // ---- test / debug API -------------------------------------------------------------------------------------------
  /** Put a unit in a form through the real code (tests, debug): 'snail' | 'shell' | 'dragon'. */
  function enterForm(u, form) {
    if (!u) return false;
    if (form === 'snail') {
      A().removeStatus(u, SHELL_ST, { silent: true });
      A().removeStatus(u, DRAGON, { silent: true });
    } else if (form === 'shell') {
      A().removeStatus(u, DRAGON, { silent: true });
      withdraw(u, levelRow(shellLevel(u)), 'test');
    } else if (form === 'dragon') {
      if (!inShell(u)) withdraw(u, levelRow(shellLevel(u)), 'test');
      emerge(u);
    }
    syncForm(u);
    return lookOf(u) === form;
  }

  DD.Benedick = {
    SHELL_ST: SHELL_ST, DRAGON: DRAGON, SLIME: SLIME, PARCEL: PARCEL, DRAGON_MOV: DRAGON_MOV, DRAGON_TURNS: DRAGON_TURNS,
    SLIME_TURNS: SLIME_TURNS, SERUM_HEAL: SERUM_HEAL, SLOW_BURN: SLOW_BURN, DRAGON_GATE: DRAGON_GATE, DRAGON_GATE_NONE: DRAGON_GATE_NONE,
    SNAIL_SPRITE: SNAIL_SPRITE, SHELL_SPRITE: SHELL_SPRITE, DRAGON_SPRITE: DRAGON_SPRITE,
    isDragon: isDragon, inShell: inShell, shellLevel: shellLevel, withdraw: withdraw, emerge: emerge, syncForm: syncForm,
    glideIfNeeded: glideIfNeeded, sticks: sticks, laySlime: laySlime, trailTiles: trailTiles, parcels: parcels, deliver: deliver,
    landingTile: landingTile, formValue: formValue, shellScore: shellScore, mailScore: mailScore, spitScore: spitScore,
    enterForm: enterForm, lookOf: lookOf, baseMov: baseMov, mailHit: mailHit, FORM_BARKS: FORM_BARKS,
    painters: { drawBenedick: drawBenedick, drawSlime: drawSlime, drawParcel: drawParcel, drawStreak: drawStreak, slimeGloss: slimeGloss },
  };
})();
