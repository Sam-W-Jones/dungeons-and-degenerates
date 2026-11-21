/* Dungeons and Degenerates — js/data/heroes/rasma.js
 * Hero: RASMA THE MONOTAUR (he/him, h19, the 18th hero; available from the start). The user (Nov 18): "a monocle-wearing
 * monotaur who speaks in formal, polite english. He is a spellsword (he enchants his sword with magical effects to deal
 * damage)." Spec: .tmp/h19/addendum-rasma.md. A minotaur with a monocle (hence, he insists, a monotaur) who enchants his
 * sword, then delivers it one courteous strike at a time.
 * The loop: an enchantment (The Cold Shoulder / Positively Shocking / Most Disarming: 1 AP, kind 'spell', self) puts ONE
 * blade status on him (ras_frost / ras_shock / ras_charm; the others go), holding CHARGES (3, 4 with Rapier Wit) as its
 * stacks. A sword strike is a hit of one of HIS skills tagged 'sword' (Pardon Me, so his attacks of opportunity too, the
 * sword skills and Touché's ripostes): the blade gives it its element (modifyOutgoingDamage; attacks of opportunity get the
 * +bonus through modifyOpportunity's o.flat only; estimateDealt mirrors both for DD.AI.estimate), adds its bonus and
 * puts its rider on every foe the strike damaged; each strike that damaged a foe uses ONE charge, once its resolution has
 * ended (onSkillUsed; a riposte inside a foe's skill at once). Positively Shocking's arc fires then, outside the
 * resolution, so it never counts toward the multi-hit Hype. Nothing rides on an object hit (D4).
 * Enchanté (his passive and his ONE conditional heal, D9 / Nov 18): the strike that uses the last charge heals him
 * AFTERGLOW 5 HP through DD.Act.heal(u, u, 5, { via: 'lift:rasma' }) after an active() check. Enchanting, refilling,
 * replacing, dispels, Tea, the Look, Touché's use, the signature and every item are HP-neutral; never a revive.
 * Registers: hero rasma, 12 skills, 4 statuses, 3 hero items, 3 loading tips (all ids ras_*). Test / debug API: DD.Rasma.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HERO = 'rasma';
  const CHARGES = 3, WIT_CHARGES = 4, BASE = 5, AFTERGLOW = 5, ARC_RANGE = 2;   // AFTERGLOW 3 → 4 (h19:balance it1) → 5 (fix:balance R4)
  const FROST = 'ras_frost', SHOCK = 'ras_shock', CHARM = 'ras_charm', GUARD = 'ras_guard';
  const BLADES = [FROST, SHOCK, CHARM];
  const EL = { ras_frost: 'frost', ras_shock: 'lightning', ras_charm: null };
  const BLADE_OF = { ras_cold_shoulder: FROST, ras_shocking: SHOCK, ras_disarming: CHARM };   // skill id → status id
  const SKILL_OF = { ras_frost: 'ras_cold_shoulder', ras_shock: 'ras_shocking', ras_charm: 'ras_disarming' };
  const KIND_OF = { frost: FROST, shock: SHOCK, charm: CHARM };
  const COLOR_OF = { ras_frost: '#9fe3ff', ras_shock: '#fff27a', ras_charm: '#ff9ec7' };
  const ICON_OF = { ras_frost: '❄️', ras_shock: '⚡', ras_charm: '🌹' };
  const PARTICLE_OF = { ras_frost: 'ice', ras_shock: 'zap', ras_charm: 'glitter' };
  const SOUND_OF = { ras_frost: 'frost', ras_shock: 'zap', ras_charm: 'magic' };
  const BARK_OF = { ras_frost: 'enchant_frost', ras_shock: 'enchant_shock', ras_charm: 'enchant_charm' };
  const WIT = 'ras_rapier_wit', WAISTCOAT = 'ras_waistcoat', MONOCLE = 'ras_spare_monocle';
  const STEEL = '#e8eef4', CLARET = '#a64d79', GUARD_COL = '#e8e2d0', REFRESH = '#bff3c8';
  const LAST_WARNING = 'His last enchantment. Without one his sword is plain steel and Enchanté never heals him.';

  // ---- helpers ------------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function hostile(a, b) { return !!a && !!b && DD.Grid.hostile(a, b); }
  /** A real foe of u: hostile both ways (a foe charmed to fight for the heroes is no foe: no blade, no arc). */
  function foeOf(u, f) { return hostile(u, f) && hostile(f, u); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function byPos(a, b) { return a.y - b.y || a.x - b.x; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  /** The status instance st sits on unit u (status hooks fire for an attacker's and a mover's sources alike). */
  function holds(u, st) { return !!u && !!st && Array.isArray(u.statuses) && u.statuses.indexOf(st) >= 0; }
  /** The fight's unit holding this very status instance (a chip passes the live instance), or null. Pure. */
  function holderOf(st) {
    const s = S();
    if (!s || !st || !Array.isArray(s.units)) return null;
    for (let i = 0; i < s.units.length; i++) if (holds(s.units[i], st)) return s.units[i];
    return null;
  }
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
  function dataOf(u) { const d = u.data || (u.data = {}); return d.ras || (d.ras = { monocle: -1 }); }
  /** Read-only view of his bookkeeping (cost hooks and scores never create it). */
  function peek(u) { return (u && u.data && u.data.ras) || null; }
  /** His own skill is resolving (a hit inside it is spent when it ends), else the hit came from outside one. */
  function inOwnSkill(u) { const sk = A().currentSkill(); return !!sk && sk.user === u; }
  /** AutoPlay's shared heal price (DD.AutoPlay.healWorth, E2), with the same formula as a fallback. */
  function healWorth(u, n) {
    if (DD.AutoPlay && typeof DD.AutoPlay.healWorth === 'function') return DD.AutoPlay.healWorth(u, n);
    n = Number(n);
    if (!active(u) || !(n > 0)) return 0;
    const miss = (u.maxHp || 0) - (u.hp || 0);
    return miss > 0 ? Math.min(n, miss) * (miss > u.maxHp / 2 ? 1.5 : 0.8) : 0;
  }
  function resistOf(f, el) { return f && f.resist && typeof f.resist[el] === 'number' ? f.resist[el] : 1; }
  function slotOf(u, id) {
    if (!u || !DD.Combat) return null;
    const list = DD.Combat.slotsOf(u);
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function stacksOf(u, id) { const st = A().getStatus(u, id); return st ? (st.stacks || 1) : 0; }

  // ---- the blade -----------------------------------------------------------------------------------------------
  /** One of HIS skills tagged 'sword' (generic tome skills and the signature are not sword strikes). */
  function isSword(def) { return !!def && def.owner === HERO && Array.isArray(def.tags) && def.tags.indexOf('sword') >= 0; }
  /** Charges a new enchantment holds (read when he enchants; the descs print it). */
  function charges(u) { return hasItem(u, WIT) ? WIT_CHARGES : CHARGES; }
  function bladeOf(u) {
    if (!u || !Array.isArray(u.statuses)) return null;
    for (let i = 0; i < u.statuses.length; i++) if (BLADES.indexOf(u.statuses[i].id) >= 0) return u.statuses[i];
    return null;
  }
  /** Pure: { id, stacks, data } of the enchantment he holds, or null. */
  function bladeInfo(u) {
    const st = bladeOf(u);
    return st ? { id: st.id, stacks: st.stacks || 0, data: st.data || {} } : null;
  }
  /** What the sword shows: { id, n } or null (plain steel; downed: plain). */
  function bladeShown(u) {
    if (!u || u.dead || u.downed) return null;
    const st = bladeOf(u);
    return st ? { id: st.id, n: Math.max(1, Math.min(WIT_CHARGES, st.stacks || 1)) } : null;
  }
  function bladeColor(u) { const st = bladeOf(u); return st ? COLOR_OF[st.id] : STEEL; }
  /** A hit of one of his sword skills on a foe, by the unit holding this blade. */
  function swordHit(d, st) {
    return !!d && d.cause === 'skill' && isSword(d.skill) && holds(d.source, st) && !!d.target && d.target !== d.source &&
      foeOf(d.source, d.target);
  }
  /**
   * The scratch record of the strike under way: on his resolving skill's ctx (each resolution its own, so an echoed
   * resolve is a strike of its own), else null (a riposte inside a foe's skill).
   */
  function strikeOf(u) {
    const sk = A().currentSkill();
    return sk && sk.user === u && sk.extra && typeof sk.extra === 'object' ? sk.extra : null;
  }

  /**
   * His one conditional heal (D9 / Nov 18): the strike that spends the last charge. Always called then (0 at full HP:
   * the sim's ledger counts the fire); a downed Rasma holds no blade, so it never revives.
   */
  function afterglow(u, id) {
    if (!active(u)) return 0;
    const n = A().heal(u, u, AFTERGLOW, { via: 'lift:rasma' });
    DD.FX.particles(u, { kind: 'glitter', color: COLOR_OF[id] || STEEL, count: 12, parallel: true });
    if (n > 0) {
      DD.FX.text(u, '✨ Most refreshing!', { color: REFRESH, size: 14 });
      A().maybeBark(u, 'refresh', 0.35);
    }
    A().log(u.name + (n > 0 ? '\'s enchantment is spent. Most refreshing.' : '\'s enchantment is spent.'), 'hero');
    return n;
  }

  /** The nearest other active foe of his within 2 of the first foe's tile, never one this strike hit (ties byPos). */
  function arcTarget(u, first, ids) {
    const s = S();
    if (!s || !u || !first) return null;
    const skip = ids || [];
    let best = null, bd = 99;
    s.units.forEach(function (g) {
      if (!active(g) || g === u || !foeOf(u, g) || g.id === first.id || skip.indexOf(g.id) >= 0) return;
      const d = Math.abs(g.x - first.x) + Math.abs(g.y - first.y);
      if (d > ARC_RANGE) return;
      if (d < bd || (d === bd && best && byPos(g, best) < 0)) { best = g; bd = d; }
    });
    return best;
  }
  function arc(u, st, hit) {
    const n = (st.data && st.data.arc) || 0;
    if (!(n > 0) || !hit || !hit.first) return;
    const g = arcTarget(u, hit.first, hit.ids);
    if (!g) return;
    // [QA qa-rasma-4] the zigzag (fx_render draws it for kind 'lightning'), wide enough to read at the default zoom
    DD.FX.beam(hit.first, g, { color: COLOR_OF[SHOCK], width: 3, kind: 'lightning' });
    DD.FX.particles(g, { kind: 'zap', count: 8, parallel: true });
    DD.FX.sound('zap', { parallel: true });
    // [QA qa-rasma-3] the cause before its effect in the log (the arc line, then its damage / defeat lines)
    A().log('Lightning arcs from ' + hit.first.name + ' to ' + g.name + '.', 'hero');
    A().damage(u, g, n, { element: 'lightning', cause: 'other', tags: ['ras_arc'], noHighGround: true });
  }
  /** Use n charges (1, or every one left: Do Keep the Change) after a strike that damaged a foe: the arc, then the count. */
  function spend(u, st, n, hit) {
    if (!holds(u, st)) return;
    if (st.id === SHOCK && hit) arc(u, st, hit);
    if (!holds(u, st)) return;                                   // Thorns on the arc's target can down him
    st.stacks = Math.max(0, (st.stacks || 0) - Math.max(1, n || 1));
    if (st.stacks > 0) { A().touch(); syncBlade(u); return; }
    A().removeStatus(u, st.id, { silent: true });
    syncBlade(u);
    afterglow(u, st.id);
  }

  /** The three enchantments' execute: one blade at a time; recasting the one he holds refills it at the new level. */
  function enchant(u, id, L, level) {
    if (!active(u) || BLADES.indexOf(id) < 0) return null;
    L = L || {};
    const old = bladeOf(u), oldId = old ? old.id : null;
    BLADES.forEach(function (b) { if (has(u, b)) A().removeStatus(u, b, { silent: true }); });
    const n = charges(u);
    const st = A().addStatus(u, id, { stacks: n, silent: true }, u);
    if (!st) { syncBlade(u); return null; }
    st.stacks = n;
    st.data = { bonus: L.bonus || 0, slow: L.slow || 0, arc: L.arc || 0, weak: L.weak || 0, level: level || 1 };
    const def = DD.getStatus(id), col = COLOR_OF[id];
    DD.FX.particles(u, { kind: PARTICLE_OF[id], color: col, count: 14 });
    DD.FX.text(u, ICON_OF[id] + ' Enchanté!', { color: col, size: 15 });
    DD.FX.flash(col, 120);
    DD.FX.sound(SOUND_OF[id], { parallel: true });
    DD.FX.text(u, '✦', { color: '#fffbe6', size: 18, parallel: true });   // the monocle glints
    DD.FX.sound('coin', { parallel: true });
    A().maybeBark(u, BARK_OF[id], 0.4);
    if (oldId && oldId !== id) A().log(u.name + ' swaps ' + DD.getStatus(oldId).name + ' for ' + def.name + ' (' + n + ' charges).', 'hero');
    else A().log(u.name + ' enchants his sword: ' + def.name + ' (' + n + ' charges).', 'hero');
    syncBlade(u);
    return st;
  }

  /**
   * The sword's look follows FX playback (Benedick's showSprite pin): the logic changes at once, unit.vis.rasBlade keeps
   * what was shown until the FX queue reaches each change. Cosmetic only; previews skip it.
   */
  const shownLast = new WeakMap();
  function syncBlade(u) {
    if (!u || typeof u !== 'object' || A().simulating) return;
    const now = bladeShown(u);
    const prev = shownLast.has(u) ? shownLast.get(u) : null;
    shownLast.set(u, now);
    if (!u.vis) return;
    if (u.vis.rasBlade === undefined) u.vis.rasBlade = prev;
    DD.FX.call(function () { if (u.vis) u.vis.rasBlade = now; });
  }

  /** The live line his sword skills' descs append in a fight (a combat unit holding a blade only). */
  function bladeNote(user) {
    if (!user || !Array.isArray(user.statuses) || !user.kind) return '';
    const b = bladeInfo(user);
    if (!b) return '';
    const d = b.data || {}, bonus = d.bonus || 0;
    const what = b.id === FROST ? '❄️ +' + bonus + ' frost, Slows' : b.id === SHOCK ? '⚡ +' + bonus + ' lightning, arcs ' + (d.arc || 0) : '🌹 +' + bonus + ', Weakens';
    return ' Now: ' + what + '; ' + plural(b.stacks, 'charge') + ' left.';
  }
  function enchantsIn(rh) {
    const list = rh && Array.isArray(rh.skills) ? rh.skills : [];
    return list.filter(function (sl) { return sl && BLADE_OF[sl.id || sl]; }).length;
  }
  /** forgetWarning (ARCH §3.2): his last socketed enchantment speaks up (the campaign sim keeps it, plan D4). */
  function lastEnchantWarning(L, rh) { return rh && enchantsIn(rh) === 1 ? LAST_WARNING : ''; }

  // ---- AutoPlay (content-side; every function pure) ----------------------------------------------------------
  function canMoveSoon(f) { return !A().cantMove(f) && !A().isStunned(f) && !has(f, 'sheep') && (f.mov || 0) > 0; }
  function freezable(f) { return !!f && !A().immuneTo(f, 'frozen') && !A().isBoss(f) && !has(f, 'frozen'); }
  /** What f's best ready damaging skill would deal to u (AI.estimate; 6 when it shows none). */
  function threatOf(u, f) {
    let best = 0;
    if (!f || !DD.Combat || !DD.AI) return 6;
    DD.Combat.slotsOf(f).forEach(function (sl) {
      if (!sl || sl.cd > 0) return;
      const def = DD.getSkill(sl.id), L = def && DD.skillLevel(def, sl.level || 1);
      if (!L || !(L.dmg > 0)) return;
      best = Math.max(best, DD.AI.estimate(f, u, L.dmg, null, false, def));
    });
    return best > 0 ? best : 6;
  }
  function regardsReach(u) {
    const sl = slotOf(u, 'ras_regards');
    if (!sl) return 0;
    const L = DD.skillLevel(DD.getSkill('ras_regards'), sl.level || 1);
    return reach(u, 'ras_regards', L, L.range);
  }
  function swordReach(u) { return Math.max(1, regardsReach(u)); }
  /** Can he land a sword strike on f this turn with apAfter AP: adjacent, Sending My Regards ready, or a step + a strike. */
  function strikeableNow(u, f, apAfter) {
    if (!(apAfter >= 1)) return false;
    const d = dist(u, f);
    if (d === 1) return true;
    const rg = slotOf(u, 'ras_regards');
    if (rg && !(rg.cd > 0) && apAfter >= 2 && d <= regardsReach(u)) return true;
    return apAfter >= 2 && !A().cantMove(u) && d - 1 <= DD.Combat.effectiveMov(u);
  }
  function avgTop2(list, fn) {
    const v = list.map(fn).sort(function (a, b) { return b - a; });
    if (!v.length) return 0;
    return v.length === 1 ? v[0] : (v[0] + v[1]) / 2;
  }
  /** One enchanted strike on f over a plain one (BASE = a basic's 5). */
  function strikeGain(u, id, L, f) {
    L = L || {};
    const el = EL[id], r = el ? resistOf(f, el) : 1;
    if (r === 0) return 0;                                       // immune: 0 damage, no charge, no rider
    const plainM = has(f, 'frozen') ? 1.5 : 1;                   // a plain strike's Frozen bonus, lost to frost / lightning
    const m = el ? r * (el === 'lightning' && has(f, 'wet') ? 1.5 : 1) : plainM;
    let v = Math.round((BASE + (L.bonus || 0)) * m) - Math.round(BASE * plainM);
    if (id === FROST) {
      v += canMoveSoon(f) ? 1.5 : 0.3;                          // Slow (little on a Rooted / stunned / immobile foe)
      if (has(f, 'wet') && freezable(f)) v += 4 + 0.5 * threatOf(u, f);
    }
    if (id === CHARM) v += 0.25 * threatOf(u, f) * (L.weak || 1);
    if (id === SHOCK) {
      const g = arcTarget(u, f, [f.id]);
      if (g) v += 0.8 * (L.arc || 0) * resistOf(g, 'lightning') * (has(g, 'wet') ? 1.5 : 1);
    }
    return Math.max(0, v);
  }
  /**
   * The three enchantments' aiScore: this turn's and the next strikes' gain, minus what a recast throws away (the charges
   * left and the afterglow they would have brought). With a last charge and a strike in reach he strikes first: that
   * strike's dry run carries the afterglow, and the recast comes after it. In AutoPlay's exact pass the dry run also
   * credits any added or topped-up buff with a generic +1.5: EXACT_OFFSET takes it back, so the score alone decides.
   */
  const EXACT_OFFSET = 2, LATER = 1, GLOW_SHARE = 0.6;
  /**
   * fix:balance R1 (Nov 21): no foe in reach this turn and no blade up, but a foe within reach of his next turn: enchant
   * on the way in (a move left after it), so the blade is up when he arrives. A fifth of his strikes were plain steel with
   * an enchantment socketed, the blade was up at only 56% of his turn starts, and the afterglow fired 0.89 times a fight.
   */
  function onTheWay(u, id, L, apAfter, mov) {
    if (apAfter < DD.Combat.moveApCost(u) || A().cantMove(u)) return 0;
    const soon = DD.Combat.foesOf(u).filter(function (f) { return active(f) && dist(u, f) <= 2 * mov + swordReach(u); });
    if (!soon.length) return 0;
    const v = avgTop2(soon, function (f) { return strikeGain(u, id, L, f); }) * 2 * 0.85 * 0.6 + GLOW_SHARE * 0.6 * healWorth(u, AFTERGLOW);
    return Math.max(0, v - 0.5);
  }
  function enchantScore(ctx) {
    const u = ctx && ctx.user, L = (ctx && ctx.L) || {}, id = ctx && ctx.skill ? BLADE_OF[ctx.skill.id] : null;
    const off = ctx && ctx.autoplay ? EXACT_OFFSET : 0;
    if (!id || !active(u) || !DD.Combat || !DD.Combat.state) return -off;
    const cur = bladeInfo(u);
    if (cur && cur.id === id && cur.stacks >= 2 && (cur.data.level || 1) >= (ctx.level || 1)) return -off;   // no churn
    const apAfter = (u.ap || 0) - DD.Combat.costOf(u, ctx.skill, ctx.level).ap;
    const mov = DD.Combat.effectiveMov(u);
    const near = DD.Combat.foesOf(u).filter(function (f) { return active(f) && dist(u, f) <= mov + swordReach(u); });
    if (!near.length) return cur ? -off : onTheWay(u, id, L, apAfter, mov) - off;
    const now = near.filter(function (f) { return strikeableNow(u, f, apAfter); });
    if (cur && cur.stacks <= 1 && now.length) return -off;      // spend the last charge first
    const pool = now.length ? now : near, k = now.length ? 1 : 0.6;
    const per = avgTop2(pool, function (f) { return strikeGain(u, id, L, f); });
    const n = charges(u);
    // this turn's strikes, then the rest of the charges (they never decay: later turns spend them; LATER weighs them)
    const nowS = Math.min(n, Math.min(apAfter, 2));
    let v = per * (now.length ? nowS + LATER * (n - nowS) : 1.4) * 0.85 * k;
    v += GLOW_SHARE * k * healWorth(u, AFTERGLOW);               // the afterglow its last charge will bring
    if (cur) {
      v -= cur.stacks * avgTop2(pool, function (f) { return strikeGain(u, cur.id, cur.data, f); }) * 0.85;   // the charges thrown away
      v -= healWorth(u, AFTERGLOW);                              // any recast forfeits the afterglow of the one he holds
    }
    return Math.max(0, v - 0.5) - off;
  }
  function wetPayers(u) {
    const cons = DD.Combat.consumables().map(function (c) { return c && typeof c === 'object' ? c.id : c; });
    if (cons.indexOf('con_thunder_jar') >= 0 || cons.indexOf('con_frost_flask') >= 0) return true;
    return DD.Combat.friendsOf(u).concat([u]).some(function (f) { return hasItem(f, 'syl_electric_lute'); });
  }
  /** Tea, Anyone?: put out an ally's Burn; soak a foe his blade (or the party's Wet payoffs) will cash in. */
  function teaScore(ctx) {
    const u = ctx && ctx.user, x = ctx && ctx.targetUnit, L = (ctx && ctx.L) || {};
    if (!active(u) || !active(x) || x === u || !DD.Combat || !DD.Combat.state) return 0;
    const wet = A().getStatus(x, 'wet');
    if (wet && (wet.turns < 0 || wet.turns >= 2)) return 0;
    if (!hostile(u, x)) return 2 * stacksOf(x, 'burn');
    const apAfter = (u.ap || 0) - DD.Combat.costOf(u, ctx.skill, ctx.level).ap;
    const cur = bladeInfo(u);
    let v = 0;
    const frostHeld = !!cur && cur.id === FROST;
    const frostReady = frostHeld || (!!slotOf(u, 'ras_cold_shoulder') && apAfter >= 2);
    if (frostReady && freezable(x)) {
      const now = strikeableNow(u, x, frostHeld ? apAfter : apAfter - 1);
      const next = dist(u, x) <= DD.Combat.effectiveMov(u) + swordReach(u) + 1;
      if (now || next) v += (4 + 0.5 * threatOf(u, x)) * (now ? 1 : 0.6);
    }
    const shockHeld = !!cur && cur.id === SHOCK;
    const shockSl = slotOf(u, 'ras_shocking');
    if (shockHeld) v += 0.5 * (BASE + (cur.data.bonus || 0));
    else if (shockSl && apAfter >= 2) v += 0.5 * (BASE + (DD.skillLevel(DD.getSkill('ras_shocking'), shockSl.level || 1).bonus || 0));
    if (wetPayers(u)) v += 2;
    v -= 1.5 * stacksOf(x, 'burn');                              // don't put out the party's own fire
    return Math.max(0, v);
  }
  /** A Disapproving Look: a pending spell wind-up the Silence outlasts, else the foe's best ready damaging spell. */
  function lookScore(ctx) {
    const u = ctx && ctx.user, f = ctx && ctx.targetUnit, L = (ctx && ctx.L) || {};
    if (!active(u) || !active(f) || !hostile(u, f) || A().isBoss(f) || !DD.Combat || !DD.AI) return 0;
    if (has(f, 'silenced')) return 0;
    let best = 0;
    (f.intents || []).forEach(function (it) {
      const def = it && DD.getSkill(it.skillId);
      if (!def || def.kind !== 'spell' || !it.windup || (it.data && it.data.unstoppable)) return;
      if ((it.turnsLeft || 0) <= (L.turns || 1)) best = Math.max(best, 8 + 0.5 * (it.dmg || 0));
    });
    if (best > 0) return best;
    let spell = 0;
    DD.Combat.slotsOf(f).forEach(function (sl) {
      const def = sl && DD.getSkill(sl.id), SL = def && DD.skillLevel(def, sl.level || 1);
      if (!def || def.kind !== 'spell' || sl.cd > 0 || !SL || !(SL.dmg > 0)) return;
      spell = Math.max(spell, DD.AI.estimate(f, u, SL.dmg, null, false, def));
    });
    return 0.7 * spell;
  }
  /** Touché: adjacent foes with a ready melee hit, the riposte with what his blade adds, the afterglow it may bring. */
  function toucheScore(ctx) {
    const u = ctx && ctx.user, L = (ctx && ctx.L) || {};
    if (!active(u) || has(u, GUARD) || !DD.Combat || !DD.Combat.state) return 0;
    const adj = DD.Combat.foesOf(u).filter(function (f) {
      if (!active(f) || dist(u, f) !== 1 || A().isStunned(f) || has(f, 'sheep')) return false;
      return DD.Combat.slotsOf(f).some(function (sl) {
        const def = sl && DD.getSkill(sl.id), SL = def && DD.skillLevel(def, sl.level || 1);
        return !!def && !(sl.cd > 0) && !!SL && SL.dmg > 0 && (def.tags || []).indexOf('ranged') < 0;
      });
    });
    const h = Math.min(L.hits || 1, adj.length);
    if (!h) return 0;
    const cur = bladeInfo(u);
    const rider = cur ? avgTop2(adj, function (f) { return strikeGain(u, cur.id, cur.data, f); }) : 0;
    return h * ((L.riposte || 0) + rider) * 0.7 + (cur && cur.stacks === 1 ? 0.5 * healWorth(u, AFTERGLOW) : 0);
  }
  /** Do Keep the Change: the quick pass misses the per-charge damage; both passes pay for the charges it throws away. */
  function changeScore(ctx) {
    const u = ctx && ctx.user, L = (ctx && ctx.L) || {};
    if (!active(u)) return 0;
    const cur = bladeInfo(u), n = cur ? cur.stacks : 0;
    let v = ctx.autoplay ? 0 : (L.per || 0) * n;
    if (cur && n > 1 && ctx.targetUnit) v -= (n - 1) * strikeGain(u, cur.id, cur.data, ctx.targetUnit) * 0.6;
    return v;
  }
  /** A Thousand Pardons: the quick pass reads one strike of 6; the other two per foe come here. */
  function thousandScore(ctx) { return ctx && ctx.autoplay ? 0 : 12 * ((ctx && ctx.foes) || []).filter(active).length; }

  // ---- sprite and painter (humanoid + overlay; stock options only) -----------------------------------------------
  const RAS_PAL = {
    skin: '#6b4430', hair: '#4e2f20', cloth: '#7a2e4a', cloth2: '#d6b56a', metal: '#d4dbe3', eye: '#2a1a12', accent: '#e8c55a',
    outline: '#1c120e', boots: '#2b1d17', pants: '#3a2a26', belt: '#3a2418', leather: '#5a3820', grip: '#3a2418',
    muzzle: '#d8b08a', nose: '#3b2620', horn: '#efe4c8', hornTip: '#8a7656', cravat: '#f6f1e6', gold: '#e8c55a', cup: '#fbf7ee',
    tea: '#9a6232', waistcoat: '#d6a93a',
  };
  const HUGE = { w: 20, th: 15, lh: 8.5, aw: 5.4 };              // sprites.js BUILDS.huge (coat tails, waistcoat)
  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /** Cosmetic hash in [0, 1) (the lightning zigzag; never game logic, never Math.random). */
  function hash01(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  /** The stock sword's rotation (sprites.js itemRotation with ITEM_INFO.sword.idle 0.85) for this pose. */
  function bladeRot(g) {
    const fa = g.hands && g.hands.front && isFinite(g.hands.front.angle) ? g.hands.front.angle : 1.2, idle = 0.85;
    if (g.pose === 'attack') {
      const swing = fa + Math.PI / 2 - 0.4, p = g.poseT;
      return p !== undefined && p !== null && p > 0.55 ? lerp(swing, idle, smooth((p - 0.55) / 0.45)) : swing;
    }
    if (g.pose === 'cast') return idle - 0.3;
    if (g.pose === 'hurt') return idle - 0.6;
    return idle;
  }
  /** The blade the painter shows: the FX-pinned value when there is one, else the statuses; no unit: plain. */
  function paintedBlade(o) {
    const u = o && o.unit;
    if (!u || typeof u !== 'object') return null;
    if (u.vis && u.vis.rasBlade !== undefined) return u.vis.rasBlade;
    const ids = Array.isArray(o.statuses) ? o.statuses : null;
    const st = bladeOf(u);
    if (!st || (ids && ids.indexOf(st.id) < 0)) return null;
    return { id: st.id, n: Math.max(1, Math.min(WIT_CHARGES, st.stacks || 1)) };
  }
  /** The glow over the stock blade, in drawItem's frame (translate(hand) · rotate(R) · scale(1.1)). */
  function bladeGlow(g, t, o, lying) {
    const hf = g.hands && g.hands.front;
    if (!hf || !isFinite(hf.x) || !isFinite(hf.y)) return;
    const c = g.ctx, still = !!(o && o.still), kind = paintedBlade(o);
    const W = 1.5, LB = 15;
    const blade = [[-W, -1.6], [-W, -LB + W * 1.2], [0, -LB - W * 0.8], [W, -LB + W * 1.2], [W, -1.6]];
    c.save();
    c.translate(hf.x, hf.y);
    c.rotate(bladeRot(g));
    c.scale(1.1, 1.1);
    if (lying) c.globalAlpha *= 0.5;
    if (!kind || !COLOR_OF[kind.id]) {
      // plain steel: a glint travelling up the blade every ~3 s
      const ph = still ? -1 : ((t % 3) / 0.6);
      if (ph >= 0 && ph < 1 && !lying) {
        const y = -2.5 - ph * 12;
        g.line(-0.6, y + 1.2, 0.6, y - 1.2, 'rgba(255,255,255,0.85)', 0.7);
      }
      c.restore();
      return;
    }
    const col = COLOR_OF[kind.id];
    const a = still ? 0.6 : 0.55 + 0.15 * Math.sin(t * 4);
    g.glow(0, -8.5, 10, col, still ? 0.4 : 0.35 + 0.12 * Math.sin(t * 4));
    g.poly(blade, g.rgba(col, a), null);
    g.line(-W * 0.45, -2.6, -W * 0.45, -LB * 0.8, 'rgba(255,255,255,0.75)', 0.55);
    if (kind.id === FROST) {
      for (let i = 0; i < 3; i++) {
        const k = still ? (i + 0.5) / 3 : (t * 0.55 + i / 3) % 1;
        const x = Math.sin((still ? 0 : t * 3) + i * 2.1) * 1.4, y = -3 - k * 13;
        if (!lying) g.circle(x, y, 0.55 * (1 - k) + 0.25, 'rgba(240,252,255,0.9)', null);
      }
    } else if (kind.id === SHOCK) {
      const seed = still ? 3 : Math.floor(t * 8);
      const pts = [[0, -2]];
      for (let i = 1; i <= 4; i++) pts.push([(hash01(seed * 7 + i) - 0.5) * 2.6, -2 - i * 3.3]);
      for (let i = 0; i < pts.length - 1; i++) g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], '#ffffff', 0.55);
      if (!lying) {
        g.circle((hash01(seed + 11) - 0.5) * 4, -4 - hash01(seed + 13) * 11, 0.5, '#fffbd0', null);
        g.circle((hash01(seed + 17) - 0.5) * 4, -4 - hash01(seed + 19) * 11, 0.45, '#ffffff', null);
      }
    } else if (kind.id === CHARM && !lying) {
      for (let i = 0; i < 2; i++) {
        const k = still ? 0.3 + i * 0.35 : (t * 0.45 + i * 0.5) % 1;
        const x = Math.sin((still ? 0 : t * 2) + i * 3) * 1.6 + (i ? 1.5 : -1.2) * k * 2, y = -LB - 1 - k * 5;
        g.ellipse(x, y, 0.9, 0.55, g.rgba('#ff7fb4', 1 - k * 0.7), null, (still ? 0 : t * 2) + i);
      }
    }
    // charge pips (1-4) down the blade's flat, from the hilt up: the fist and a clinched foe often hide the guard, and a
    // pip of r 0.7 was about 1 px at the default zoom ([QA qa-rasma-7]); the chip and the board glyph keep the exact count
    for (let i = 0; i < Math.max(0, Math.min(WIT_CHARGES, kind.n || 0)); i++) {
      const py = -4 - i * 2.6;
      g.circle(0, py, 1.4, '#1c120e', null);
      g.circle(0, py, 1.05, col, null);
      g.circle(-0.35, py - 0.35, 0.35, 'rgba(255,255,255,0.8)', null);
    }
    c.restore();
  }
  function rasOverlay(g, t, o) {
    if (!g || !g.head) return;
    const H = g.head, r = H.r, pal = g.pal, c = g.ctx;
    const lying = !!(o && o.lying >= 0.5), still = !!(o && o.still) || lying;
    const hurt = g.pose === 'hurt' || lying;
    const shY = H.y + r * 0.8, hipY = -HUGE.lh, w = HUGE.w;
    const lw = Math.max(0.6, g.lw * 0.7);
    // 1. coat tails: two claret swallow-tails from the back hip to the knees
    const sway = o && typeof o.walk === 'number' ? Math.sin(o.walk * Math.PI * 2) * 1.2 : (still ? 0 : Math.sin(t * 1.8) * 0.4);
    for (let i = 0; i < 2; i++) {
      const x0 = -w * 0.42 + i * 1.6, col = i ? pal.cloth : g.shade(pal.cloth, -0.18);
      g.path(function (p) {
        p.moveTo(x0, hipY - 1.5);
        p.quadraticCurveTo(x0 - 3.2 + sway, hipY + 4, x0 - 2.6 + sway, -2.2);
        p.lineTo(x0 - 0.4 + sway * 0.6, -3.6);
        p.quadraticCurveTo(x0 + 0.6, hipY + 3, x0 + 2.2, hipY - 1.2);
        p.closePath();
      }, col, g.outline, lw);
    }
    // 7. the waistcoat V and the cravat (under the head)
    const vx = w * 0.12;
    g.path(function (p) {
      p.moveTo(vx - 3.8, shY + 2.2); p.lineTo(vx + 3.8, shY + 2.2); p.lineTo(vx + 2.8, hipY - 0.2);
      p.lineTo(vx - 2.8, hipY - 0.2); p.closePath();
    }, pal.waistcoat, g.outline, lw);
    for (let i = 0; i < 3; i++) g.line(vx - 2.6, shY + 5 + i * 3, vx + 2.6, shY + 5 + i * 3, 'rgba(120,80,20,0.35)', 0.45);
    for (let i = 0; i < 3; i++) g.circle(vx, shY + 4.6 + i * 3.2, 0.7, '#b8862e', null);
    g.path(function (p) {
      p.moveTo(vx - 2.8, shY + 0.6); p.lineTo(vx + 2.8, shY + 0.6); p.lineTo(vx, shY + 5.2); p.closePath();
    }, pal.cravat, g.outline, lw);
    for (let i = -1; i <= 1; i++) g.circle(vx + i * 1.6, shY + 1.4, 1.15, pal.cravat, null);
    g.circle(vx, shY + 2.4, 0.75, pal.gold, null);
    // 2. horns: the back one first (85%, darker, never in front of the face), then the front one
    // a crescent: thick at the root, out over the ear, then up to a darker tip
    function horn(sgn, k, col) {
      const bx = H.x + sgn * 0.55 * r, by = H.y - 0.7 * r;
      const tx = H.x + sgn * 1.45 * r * k, ty = H.y - 1.4 * r * k;
      g.path(function (p) {
        p.moveTo(bx - sgn * 0.32 * r, by + 0.22 * r);
        p.quadraticCurveTo(H.x + sgn * 1.55 * r * k, H.y - 0.5 * r, tx, ty);
        p.quadraticCurveTo(H.x + sgn * 1.0 * r * k, H.y - 0.95 * r, bx + sgn * 0.14 * r, by - 0.26 * r);
        p.closePath();
      }, col, g.outline, lw);
      c.save();
      g.path(function (p) {
        p.moveTo(bx - sgn * 0.32 * r, by + 0.22 * r);
        p.quadraticCurveTo(H.x + sgn * 1.55 * r * k, H.y - 0.5 * r, tx, ty);
        p.quadraticCurveTo(H.x + sgn * 1.0 * r * k, H.y - 0.95 * r, bx + sgn * 0.14 * r, by - 0.26 * r);
        p.closePath();
      }, null, null);
      c.clip();
      g.circle(tx, ty, r * 0.3 * k, pal.hornTip, null);
      c.restore();
      g.line(bx + sgn * 0.12 * r, by - 0.02 * r, H.x + sgn * 1.12 * r * k, H.y - 0.92 * r * k, 'rgba(255,255,255,0.55)', Math.max(0.4, r * 0.05));
    }
    c.save();
    c.beginPath();
    c.rect(H.x - r * 4, H.y - r * 4, r * 8, r * 8);
    c.arc(H.x, H.y, r * 0.98, 0, Math.PI * 2, true);
    c.clip('evenodd');
    horn(-1, 0.85, g.shade(pal.horn, -0.18));
    c.restore();
    horn(1, 1, pal.horn);
    // 3. ears: leaf-shaped, sideways under the horn roots, with a twitch now and then
    const tw = still ? 0 : (((t + 0.7) % 3.7) < 0.18 ? Math.sin(((t + 0.7) % 3.7) / 0.18 * Math.PI) * 0.35 : 0);
    [-1, 1].forEach(function (sgn) {
      const ex = H.x + sgn * 0.95 * r, ey = H.y - 0.15 * r, rot = sgn * (0.35 + (sgn > 0 ? tw : 0));
      g.ellipse(ex, ey, r * 0.34, r * 0.16, sgn < 0 ? g.shade(pal.skin, -0.15) : pal.skin, g.outline, rot);
      g.ellipse(ex, ey, r * 0.2, r * 0.08, '#b07a68', null, rot);
    });
    // 4. forelock: three dark curls between the horns
    for (let i = -1; i <= 1; i++) g.circle(H.x + i * r * 0.22, H.y - r * 0.82 + Math.abs(i) * r * 0.06, r * 0.17, pal.hair, g.outline);
    // 5. muzzle: a broad pale block across the lower face, two nostrils, a polite little mouth
    const mx = H.x + 0.62 * r, my = H.y + 0.52 * r;
    g.ellipse(mx, my, r * 0.5, r * 0.3, pal.muzzle, g.outline, 0);
    g.ellipse(mx + r * 0.3, my - r * 0.04, r * 0.07, r * 0.1, pal.nose, null, 0.3);
    g.ellipse(mx + r * 0.08, my - r * 0.04, r * 0.06, r * 0.09, pal.nose, null, -0.3);
    if (g.pose === 'attack') g.ellipse(mx + r * 0.12, my + r * 0.17, r * 0.14, r * 0.06, '#5a2a24', null);
    else g.arc(mx + r * 0.1, my + r * 0.05, r * 0.16, 0.25 * Math.PI, 0.8 * Math.PI, pal.nose, Math.max(0.5, r * 0.06));
    // 6. the monocle: on the front eye, or dangling on its chain when he is hurt / down (it popped out)
    const eye = { x: H.x + r * 0.6, y: H.y + r * 0.1 };
    const pocket = { x: vx + 3.2, y: shY + 7.5 };
    if (!hurt) {
      g.path(function (p) { p.moveTo(eye.x, eye.y + r * 0.27); p.quadraticCurveTo(eye.x + r * 0.2, shY + 4, pocket.x, pocket.y); }, null, pal.gold, Math.max(0.4, r * 0.04));
      g.circle(eye.x, eye.y, r * 0.27, 'rgba(223,244,255,0.35)', pal.gold);
      g.circle(eye.x, eye.y, r * 0.3, null, g.outline);
      const glint = g.pose === 'cast' || (!still && (t % 7) < 0.35);
      if (glint) g.star(eye.x + r * 0.12, eye.y - r * 0.12, r * 0.32, '#ffffff', null, 4, 0.3);
      else g.line(eye.x + r * 0.08, eye.y - r * 0.12, eye.x + r * 0.15, eye.y - r * 0.02, '#ffffff', Math.max(0.6, r * 0.06));
    } else {
      const swing = still ? 0 : Math.sin(t * 6) * 1.6;
      const mo = { x: vx + 1 + swing, y: shY + 8.5 };
      g.path(function (p) { p.moveTo(pocket.x, pocket.y); p.quadraticCurveTo(vx + 2, shY + 10, mo.x, mo.y - r * 0.27); }, null, pal.gold, Math.max(0.4, r * 0.04));
      g.circle(mo.x, mo.y, r * 0.27, 'rgba(223,244,255,0.35)', pal.gold);
    }
    if (o && o.unit && hasItem(o.unit, MONOCLE)) {
      g.circle(pocket.x - 1.2, pocket.y + 2.2, r * 0.15, 'rgba(223,244,255,0.35)', pal.gold);   // the spare, on the chain
    }
    // 8. the teacup in the back hand: always level, never spilled
    const hb = g.hands && g.hands.back;
    if (hb && isFinite(hb.x) && isFinite(hb.y)) {
      c.save();
      let cx = hb.x, cy = hb.y - 1.2;
      if (lying) {
        // on the floor beside him, upright: counter-rotate the sprite's fall about the cup
        cx = -5; cy = -1.5;
        c.translate(cx, cy);
        c.rotate((o.lying || 1) * Math.PI / 2);
        c.translate(-cx, -cy);
      }
      g.ellipse(cx, cy + 1.2, 4.2, 1.1, pal.cup, g.outline);                       // saucer
      g.path(function (p) {
        p.moveTo(cx - 2.6, cy - 2.8); p.lineTo(cx + 2.6, cy - 2.8); p.quadraticCurveTo(cx + 2.4, cy + 0.8, cx, cy + 0.9);
        p.quadraticCurveTo(cx - 2.4, cy + 0.8, cx - 2.6, cy - 2.8); p.closePath();
      }, pal.cup, g.outline, lw);
      g.ellipse(cx, cy - 2.8, 2.6, 0.7, pal.tea, null);
      g.line(cx - 2.6, cy - 2.8, cx + 2.6, cy - 2.8, pal.gold, 0.5);
      g.arc(cx + 3, cy - 1.2, 1, -1.2, 1.2, pal.cup, 0.8);                           // handle
      if (!still || lying) {
        for (let i = 0; i < 2; i++) {
          const k = still ? 0.5 : (t * 0.5 + i * 0.5) % 1;
          g.path(function (p) {
            p.moveTo(cx - 0.8 + i * 1.6, cy - 3.4 - k * 1.5);
            p.quadraticCurveTo(cx + 0.4 + i * 1.6, cy - 5 - k * 2, cx - 0.6 + i * 1.6, cy - 6.4 - k * 2.5);
          }, null, 'rgba(255,255,255,' + (0.5 * (1 - k)).toFixed(3) + ')', 0.6);
        }
      }
      if (g.pose === 'hurt' && !still) {
        const hop = Math.abs(Math.sin(t * 7)) * 2.2;
        g.circle(cx + 0.4, cy - 3.4 - hop, 0.45, pal.tea, null);                    // one drop hops up and lands back in
      }
      c.restore();
    }
    // 9. the blade glow (the readability core): colour by enchantment, charge pips on the guard
    bladeGlow(g, t, o, lying);
  }
  const RASMA_SPRITE = {
    base: 'humanoid', scale: 1.1, build: 'huge', outfit: 'coat', palette: RAS_PAL,
    head: { size: 1.05, ears: 'none', horns: 'none', hair: 'none', beard: 'none', hat: 'none', face: 'none', eyes: 'normal', mouth: 'none', blush: false },
    wings: 'none', tail: 'cat', mainhand: 'sword', offhand: 'none', bling: [], extras: [], aura: null,
    overlay: rasOverlay,
  };

  // ---- statuses ---------------------------------------------------------------------------------------------------
  const STRIKES = 'Rasma\'s sword strikes (attacks of opportunity and ripostes too) deal ';
  function turnsWord(n) { return plural(n, 'turn'); }
  function blade(def) {
    DD.registerStatus(Object.assign({
      type: 'buff', stacking: 'refresh', maxStacks: WIT_CHARGES, decay: 'never', defaultTurns: -1, showStacks: true,
      hooks: {
        // before resist / Wet / Frozen / the freeze (DD.Act.damage)
        modifyOutgoingDamage: function (d, st) {
          if (!swordHit(d, st)) return;
          d.rasWet = has(d.target, 'wet');
          if (EL[st.id]) d.element = EL[st.id];
          if (!d.opportunity) d.flat += (st.data && st.data.bonus) || 0;   // an attack of opportunity got it as o.flat
        },
        // pure: the move preview, AI.opportunityDmg and the real attack of opportunity read it
        modifyOpportunity: function (o, st) {
          if (o && holds(o.attacker, st) && isSword(o.skill)) o.flat += (st.data && st.data.bonus) || 0;
        },
        // pure mirror for DD.AI.estimate (the enemy AI, AutoPlay's quick pass): the bonus and the element's corrections
        estimateDealt: function (e, st) {
          if (!e || !holds(e.attacker, st) || (e.skill && !isSword(e.skill)) || !foeOf(e.attacker, e.target)) return;
          if (!e.opportunity) e.flat += (st.data && st.data.bonus) || 0;
          const el = EL[st.id];
          if (!el || e.element) return;                         // the caller already applied a real element
          const t = e.target, r = resistOf(t, el);
          if (r === 0) { e.mult = 0; e.flat = -1e6; return; }   // immune: the engine nullifies, flats included
          e.mult *= r;
          if (el === 'lightning' && has(t, 'wet')) e.mult *= 1.5;
          if (has(t, 'frozen')) e.mult /= 1.5;                  // the caller gave the physical Frozen bonus the hit won't get
        },
        // after the hit, before the target's down check: the rider, and the strike recorded (or spent at once)
        onDealDamage: function (d, st) {
          if (!swordHit(d, st) || !(d.amount > 0)) return;
          const u = d.source, f = d.target, data = st.data || {};
          if (active(f) && f.hp > 0) {
            if (st.id === FROST) A().addStatus(f, 'slow', { turns: data.slow || 1 }, u);
            if (st.id === CHARM) A().addStatus(f, 'weak', { turns: data.weak || 1 }, u);
          }
          if (d.rasWet && has(f, 'frozen')) A().maybeBark(u, 'freeze', 0.6);
          DD.FX.particles(f, { kind: PARTICLE_OF[st.id], color: COLOR_OF[st.id], count: 6, parallel: true });
          const c = strikeOf(u);
          if (c) {
            const hit = c.rasHit || (c.rasHit = { first: null, ids: [] });
            if (hit.ids.indexOf(f.id) < 0) hit.ids.push(f.id);
            if (!hit.first) hit.first = { id: f.id, x: f.x, y: f.y, name: f.name };
          } else spend(u, st, 1, { first: { id: f.id, x: f.x, y: f.y, name: f.name }, ids: [f.id] });   // a riposte in a foe's skill
        },
        // after his resolution has ended (the arc lands outside it): one charge per strike that damaged a foe
        onSkillUsed: function (ctx, st) {
          if (!ctx || !holds(ctx.user, st) || ctx.objectHit || !ctx.rasHit) return;
          const hit = ctx.rasHit, all = !!ctx.rasCashOut;
          ctx.rasHit = null;
          spend(ctx.user, st, all ? st.stacks : 1, hit);
        },
      },
    }, def));
  }
  blade({
    id: FROST, name: 'Frosty Blade', icon: '❄️', color: COLOR_OF[FROST],
    desc: function (st) {
      const d = (st && st.data) || {}, n = (st && st.stacks) || 3;
      return STRIKES + 'frost damage, +' + (d.bonus !== undefined ? d.bonus : 2) + ', and Slow each foe hit for ' + turnsWord(d.slow || 1) +
        '. Wet foes freeze. ' + plural(n, 'charge') + ' left.';
    },
  });
  blade({
    id: SHOCK, name: 'Shocking Blade', icon: '⚡', color: COLOR_OF[SHOCK],
    desc: function (st) {
      const d = (st && st.data) || {}, n = (st && st.stacks) || 3;
      // [QA qa-rasma-5a] the +50% applies to the strike, the flat bonus after it (actions.js adds flats after multipliers)
      return STRIKES + 'lightning damage (+50% against Wet foes), +' + (d.bonus !== undefined ? d.bonus : 2) + ', and arc ' + (d.arc || 2) +
        ' lightning damage to the nearest other foe within ' + ARC_RANGE + '. ' + plural(n, 'charge') + ' left.';
    },
  });
  blade({
    id: CHARM, name: 'Disarming Blade', icon: '🌹', color: COLOR_OF[CHARM],
    desc: function (st) {
      const d = (st && st.data) || {}, n = (st && st.stacks) || 3;
      return STRIKES + '+' + (d.bonus !== undefined ? d.bonus : 2) + ' damage and Weaken each foe hit for ' + turnsWord(d.weak || 1) +
        ' (it deals 25% less). ' + plural(n, 'charge') + ' left.';
    },
  });
  DD.registerStatus({
    id: GUARD, name: 'En Garde', icon: '🤺', color: GUARD_COL, type: 'buff', stacking: 'refresh', maxStacks: 2,
    decay: 'never', defaultTurns: -1,   // his passive removes it at his turn start (deterministic)
    desc: function (st) {
      const n = (st && st.stacks) || 1, rp = (st && st.data && st.data.riposte) || 5;
      // it counts hits, not foes (one foe hitting twice takes both ripostes), as Touché III's own desc says
      const who = n === 1 ? 'the next foe that hits Rasma from an adjacent tile takes' : 'the next ' + n + ' times a foe hits Rasma from an adjacent tile, it takes';
      // [QA qa-rasma-5b] a riposte is a sword strike: it carries his blade (the live note when the chip's holder is known)
      const holder = holderOf(st);
      return 'En garde: ' + who + ' a ' + rp + '-damage sword strike back, plus his enchantment if he holds one (not while he is stunned, ' +
        'asleep, frozen or a sheep). Ends at the start of his next turn.' + (holder ? bladeNote(holder) : '');
    },
    hooks: {
      // before the hit lands (a hit wakes a sleeper before onTakeDamage): was he able to riposte when it came?
      modifyIncomingDamage: function (d, st) {
        if (d && holds(d.target, st)) d.rasDazed = A().isStunned(d.target) || has(d.target, 'sheep');
      },
      // fires before the down check: a hit that downs him gets no riposte (hp > 0)
      onTakeDamage: function (d, st) {
        const u = d && d.target, f = d && d.source;
        if (!holds(u, st) || !active(u) || !(u.hp > 0) || d.rasDazed || A().isStunned(u) || has(u, 'sheep')) return;
        if (!f || !active(f) || f === u || !hostile(f, u) || d.cause !== 'skill' || d.reflect || dist(f, u) !== 1 || !(d.amount > 0)) return;
        const rp = st.data && st.data.riposte;
        if (!(rp > 0)) return;
        st.stacks = (st.stacks || 1) - 1;
        if (st.stacks <= 0) A().removeStatus(u, GUARD, { silent: true }); else A().touch();   // before striking: no re-entry
        DD.FX.lunge(u, f);
        DD.FX.text(u, '🤺 Touché!', { color: GUARD_COL, size: 15 });
        A().log('Touché! ' + u.name + ' ripostes against ' + f.name + '.', 'hero');   // [QA qa-rasma-3] before its damage
        A().damage(u, f, rp, { skill: DD.getSkill('ras_touche'), tags: ['melee', 'sword', 'riposte'], noHighGround: true });
        A().maybeBark(u, 'touche', 0.5);
      },
    },
  });

  // ---- skills -----------------------------------------------------------------------------------------------------
  function skill(def) { def.owner = HERO; return DD.registerSkill(def); }
  function strike(u, f, n, ctx, tags) { return A().damage(u, f, n, { skill: ctx.skill, tags: tags }); }

  // Basic: Pardon Me — melee, so it is also his attack of opportunity (a sword strike: it carries the enchantment)
  skill({
    id: 'ras_pardon', name: 'Pardon Me', icon: '🗡️', kind: 'attack', tags: ['melee', 'sword'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 5 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L, user) { return 'Sword strike: deal ' + L.dmg + ' damage to an adjacent foe.' + bladeNote(user); },
    flavor: 'He apologises before, during and after. The sword does not.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(f) || f === u) return;
      if (ctx.opportunity) A().maybeBark(u, 'opportunity', 0.4);
      DD.FX.lunge(u, f);
      strike(u, f, ctx.L.dmg, ctx, ['melee', 'sword']);
      DD.FX.particles(f, { kind: 'sparks', color: bladeColor(u), count: 8, parallel: true });
    },
  });

  // The three enchantments (1 AP, cooldown 0, kind 'spell', self): one blade at a time, counted in charges
  function enchantSkill(def) {
    return skill(Object.assign({
      kind: 'spell', ap: 1, cooldown: 0, target: { type: 'self' }, aiScore: enchantScore, forgetWarning: lastEnchantWarning,
      execute: function (ctx) { enchant(ctx.user, BLADE_OF[ctx.skill.id], ctx.L, ctx.level); },
    }, def));
  }
  enchantSkill({
    id: 'ras_cold_shoulder', name: 'The Cold Shoulder', icon: '❄️', tags: ['enchant', 'buff', 'frost', 'slow'],
    levels: [{ bonus: 3, slow: 1 }, { bonus: 4, slow: 1 }, { bonus: 4, slow: 2 }],   // fix:balance R2 (Nov 21): +2 / +3 / +3 → +3 / +4 / +4
    desc: function (L, user) {
      return 'Enchant your sword with frost (' + charges(user) + ' charges): its strikes deal frost damage, +' + L.bonus + ', and Slow each foe hit for ' +
        turnsWord(L.slow) + '. Wet foes freeze.';
    },
    flavor: 'A frost so polite you\'ll thank him for it. Briefly.',
  });
  enchantSkill({
    id: 'ras_shocking', name: 'Positively Shocking', icon: '⚡', tags: ['enchant', 'buff', 'lightning'],
    levels: [{ bonus: 3, arc: 2 }, { bonus: 4, arc: 3 }, { bonus: 4, arc: 4 }],   // fix:balance R2
    desc: function (L, user) {
      return 'Enchant your sword with lightning (' + charges(user) + ' charges): its strikes deal lightning damage (+50% against Wet foes), +' +
        L.bonus + ', and arc ' + L.arc + ' lightning damage to the nearest other foe within ' + ARC_RANGE + '.';
    },
    flavor: '"How shocking," he says, every single time. He has never once been shocked.',
  });
  enchantSkill({
    id: 'ras_disarming', name: 'Most Disarming', icon: '🌹', tags: ['enchant', 'buff', 'weak'],
    levels: [{ bonus: 3, weak: 1 }, { bonus: 4, weak: 1 }, { bonus: 4, weak: 2 }],   // fix:balance R2
    desc: function (L, user) {
      return 'Enchant your sword with charm (' + charges(user) + ' charges): its strikes deal +' + L.bonus + ' damage and Weaken each foe hit for ' +
        turnsWord(L.weak) + ' (it deals 25% less).';
    },
    flavor: 'A smile, a bow, a blade that makes you feel underdressed.',
  });

  // With All Due Respect (starter): the big polite one
  skill({
    id: 'ras_due_respect', name: 'With All Due Respect', icon: '🫡', kind: 'attack', tags: ['melee', 'sword'],
    ap: 2, cooldown: 1,
    levels: [{ dmg: 9 }, { dmg: 11 }, { dmg: 13 }],   // h19:balance it1: 8 / 10 / 12 → 9 / 11 / 13
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L, user) { return 'Sword strike: deal ' + L.dmg + ' damage to an adjacent foe.' + bladeNote(user); },
    flavor: 'Nothing good has ever followed the words "with all due respect".',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(f) || f === u) return;
      DD.FX.lunge(u, f);
      DD.FX.shake(3, 160);
      strike(u, f, ctx.L.dmg, ctx, ['melee', 'sword']);
      DD.FX.particles(f, { kind: 'sparks', color: bladeColor(u), count: 10, parallel: true });
      A().maybeBark(u, 'respect', 0.3);
    },
  });

  // Sweeping Bow: every adjacent foe, one charge however many it hits
  skill({
    id: 'ras_sweeping_bow', name: 'Sweeping Bow', icon: '🙇', kind: 'attack', tags: ['melee', 'sword', 'aoe'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4 }, { dmg: 5 }, { dmg: 6 }],
    target: { type: 'self' },
    area: { shape: 'adjacent' },
    desc: function (L, user) { return 'Sword strike: deal ' + L.dmg + ' damage to every adjacent foe (one charge, however many it hits).' + bladeNote(user); },
    flavor: 'A bow so deep and so sincere that everyone nearby needs stitches.',
    execute: function (ctx) {
      const u = ctx.user, col = bladeColor(u);
      DD.FX.text(u, 'A bow!', { color: col, size: 14 });
      ctx.tiles.forEach(function (q, i) { DD.FX.tile(q.x, q.y, 'glow', { color: col, parallel: i > 0 }); });
      A().maybeBark(u, 'bow', 0.3);
      ctx.foes.slice().sort(byPos).forEach(function (f) {
        if (!active(f)) return;
        DD.FX.particles(f, { kind: 'sparks', color: col, count: 6, parallel: true });
        strike(u, f, ctx.L.dmg, ctx, ['melee', 'sword', 'aoe']);
      });
    },
  });

  // Sending My Regards: his only reach (ranged: never an attack of opportunity)
  skill({
    id: 'ras_regards', name: 'Sending My Regards', icon: '✉️', kind: 'attack', tags: ['ranged', 'sword'],
    ap: 2, cooldown: 1,
    levels: [{ dmg: 6, range: 4 }, { dmg: 8, range: 4 }, { dmg: 9, range: 5 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy' },
    desc: function (L, user) {
      return 'Sword strike: flick a crescent of magic off your blade at a foe within ' + reach(user, 'ras_regards', L, L.range) + ': ' + L.dmg + ' damage.' + bladeNote(user);
    },
    flavor: 'Kind regards. Warm regards. Freezing regards, depending on the blade.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(f) || f === u) return;
      DD.FX.projectile(u, f, { kind: 'bolt', color: bladeColor(u) });
      strike(u, f, ctx.L.dmg, ctx, ['ranged', 'sword']);
      A().maybeBark(u, 'regards', 0.3);
    },
  });

  // Do Keep the Change: a strike that cashes in every charge left (spent after the resolution: the afterglow fires)
  skill({
    id: 'ras_keep_change', name: 'Do Keep the Change', icon: '🪙', kind: 'attack', tags: ['melee', 'sword', 'finisher'],
    ap: 2, cooldown: 3,
    levels: [{ dmg: 6, per: 2 }, { dmg: 7, per: 3 }, { dmg: 8, per: 3 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L, user) {
      return 'Sword strike: deal ' + L.dmg + ' damage to an adjacent foe, +' + L.per + ' for each charge left on your enchantment; it uses them all.' + bladeNote(user);
    },
    flavor: 'He always overtips. Mostly in frost.',
    aiScore: changeScore,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(f) || f === u) return;
      const st = bladeOf(u), n = st ? st.stacks || 0 : 0;     // read before the hit
      DD.FX.lunge(u, f);
      DD.FX.particles(f, { kind: 'coins', count: 12, parallel: true });
      DD.FX.particles(f, { kind: 'sparks', color: bladeColor(u), count: 8, parallel: true });
      strike(u, f, ctx.L.dmg + ctx.L.per * n, ctx, ['melee', 'sword', 'finisher']);
      // only a strike that damaged the foe uses the charges (an immune foe takes 0: nothing is spent, nothing is said)
      if (st && holds(u, st) && ctx.rasHit) {
        ctx.rasCashOut = true;                                    // the blade's onSkillUsed spends every charge
        A().maybeBark(u, 'change', 0.4);
        A().log(u.name + ' spends every last charge. "Do keep the change."', 'hero');
      }
    },
  });

  // Touché: until his next turn, the first adjacent foe(s) to hit him take a sword strike back
  skill({
    id: 'ras_touche', name: 'Touché', icon: '🤺', kind: 'buff', tags: ['stance', 'sword', 'riposte'],
    ap: 1, cooldown: 2,
    levels: [{ riposte: 5, hits: 1 }, { riposte: 7, hits: 1 }, { riposte: 7, hits: 2 }],
    target: { type: 'self' },
    desc: function (L, user) {
      return (L.hits > 1 ? 'En garde: until your next turn, the first ' + L.hits + ' times a foe hits you from an adjacent tile, it takes a sword strike back for ' + L.riposte + '.'
        : 'En garde: until your next turn, the first foe that hits you from an adjacent tile takes a sword strike back for ' + L.riposte + '.') + bladeNote(user);
    },
    flavor: '"Touché," he says, graciously, every time you land one. Then it\'s his turn to be gracious.',
    aiScore: toucheScore,
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      const st = A().addStatus(u, GUARD, { stacks: ctx.L.hits, silent: true }, u);
      if (!st) return;
      st.stacks = ctx.L.hits;
      st.data.riposte = ctx.L.riposte;
      DD.FX.text(u, '🤺 En garde!', { color: GUARD_COL, size: 15 });
      DD.FX.sound('buff', { parallel: true });
      A().log(u.name + ' takes his guard. En garde.', 'hero');
    },
  });

  // Tea, Anyone?: a foe or an ally is Wet (a Burn on it goes out); the unit only, no surface
  skill({
    id: 'ras_tea', name: 'Tea, Anyone?', icon: '🫖', kind: 'utility', tags: ['water', 'wet', 'ranged', 'support'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ range: 3, cd: 3 }, { range: 4, cd: 3 }, { range: 4, cd: 2 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'notSelf' },
    desc: function (L, user) {
      return 'Throw your tea over a foe or ally within ' + reach(user, 'ras_tea', L, L.range) + ': it is Wet for 2 turns (a Burn on it goes out).';
    },
    flavor: 'He refills from somewhere. Nobody has ever seen the pot.',
    aiScore: teaScore,
    execute: function (ctx) {
      const u = ctx.user, x = ctx.targetUnit;
      if (!active(x) || x === u) return;
      DD.FX.projectile(u, x, { kind: 'flask', color: '#9a6232' });
      DD.FX.particles(x, { kind: 'bubbles', color: '#c8a27a', count: 10, parallel: true });
      DD.FX.text(x, '🫖 Tea?', { color: '#e8d2b0', size: 14, parallel: true });
      DD.FX.sound('splash', { parallel: true });
      A().maybeBark(u, 'tea', 0.5);
      A().log(u.name + ' offers ' + x.name + ' some tea. Forcefully.', 'hero');
      A().addStatus(x, 'wet', { turns: 2 }, u);
    },
  });

  // A Disapproving Look: Silence a non-boss (a look is not a spell: Silence can't stop it)
  skill({
    id: 'ras_look', name: 'A Disapproving Look', icon: '🤨', kind: 'utility', tags: ['silence', 'ranged', 'monocle'],
    ap: 1, cooldown: 3,
    levels: [{ range: 3, turns: 1 }, { range: 4, turns: 1 }, { range: 4, turns: 2 }],
    target: {
      type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy',
      canTarget: function (ctx) { return ctx.targetUnit && A().isBoss(ctx.targetUnit) ? 'Bosses don\'t take a hint.' : true; },
    },
    desc: function (L, user) {
      return 'A foe within ' + reach(user, 'ras_look', L, L.range) + ' (not a boss) is Silenced for ' + turnsWord(L.turns) + ': no spells, and a spell wind-up fizzles.';
    },
    flavor: 'One raised eyebrow. One monocle. One very quiet room.',
    aiScore: lookScore,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(f) || f === u || A().isBoss(f)) return;
      DD.FX.text(u, '✦', { color: '#fffbe6', size: 16 });
      DD.FX.text(f, '🤐 Ahem.', { color: '#c8d0dc', size: 14, parallel: true });
      A().maybeBark(u, 'look', 0.5);
      A().addStatus(f, 'silenced', { turns: ctx.L.turns }, u);
      A().log(f.name + ' falls silent under ' + u.name + '\'s disapproving look.', 'hero');
    },
  });

  // Signature: A Thousand Pardons — every foe within 2 takes three strikes of 6: lightning, frost, plain steel
  skill({
    id: 'ras_thousand', name: 'A Thousand Pardons', icon: '🎩', kind: 'attack', tags: ['melee', 'aoe', 'signature'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 6 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: 2 },
    desc: function (L) {
      return 'Every foe within 2 takes three strikes of ' + L.dmg + ': lightning, then frost, then plain steel. Your enchantment is not used.';
    },
    flavor: 'Pardon. Pardon. Terribly sorry. Pardon. He means every one of them.',
    aiScore: thousandScore,
    execute: function (ctx) {
      const u = ctx.user, n = ctx.L.dmg;
      DD.FX.text(u, '✦', { color: '#fffbe6', size: 22 });
      DD.FX.sound('coin', { parallel: true });
      DD.FX.banner('A THOUSAND PARDONS', { sub: 'How do you do? And you? And you?', color: CLARET });
      DD.FX.flash('#ffffff', 140);
      const tags = ['ras_thousand'];
      ctx.foes.slice().sort(byPos).forEach(function (f) {
        if (!active(f)) return;
        [['lightning', COLOR_OF[SHOCK]], ['frost', COLOR_OF[FROST]], [null, STEEL]].forEach(function (e) {
          if (!active(f)) return;
          DD.FX.lunge(u, f, { parallel: true });
          DD.FX.particles(f, { kind: 'sparks', color: e[1], count: 8, parallel: true });
          DD.FX.text(f, 'Pardon!', { color: e[1], size: 13, parallel: true });
          const opts = { skill: ctx.skill, tags: tags };
          if (e[0]) opts.element = e[0];
          A().damage(u, f, n, opts);
        });
      });
      DD.FX.text(u, '🧐 *pop*', { color: '#fffbe6', size: 14 });
      DD.FX.shake(8, 400);
      A().log('A thousand pardons! ' + u.name + ' apologises to everyone within 2, three times each.', 'hero');
    },
  });

  // ---- the hero ------------------------------------------------------------------------------------------------------
  const PASSIVE = {
    name: 'Enchanté',
    desc: 'Rasma\'s sword holds one enchantment at a time. Each sword strike that hits a foe (attacks of opportunity and ' +
      'ripostes too) uses one of its charges; the strike that uses the last heals him ' + AFTERGLOW + ' HP.',
    hooks: {
      onCombatStart: function (u) { if (u && u.vis) delete u.vis.rasBlade; shownLast.delete(u); syncBlade(u); },   // plain steel
      onTurnStart: function (u) { if (u && has(u, GUARD)) A().removeStatus(u, GUARD, { silent: true }); },          // Touché ends
      onStatusRemoved: function (u, st) { if (st && BLADES.indexOf(st.id) >= 0) syncBlade(u); },                    // dispels
      onDowned: function (u) { syncBlade(u); },
      // cosmetic: a big hit knocks the monocle out
      onTakeDamage: function (d) {
        const u = d && d.target;
        if (u && u.defId === HERO && active(u) && u.hp > 0 && (d.amount || 0) >= 10) A().maybeBark(u, 'pop', 0.3);
      },
    },
  };

  DD.registerHero({
    id: HERO, name: 'Rasma', epithet: 'the Monotaur', race: 'Minotaur', cls: 'Spellsword',
    role: 'Melee spellsword · enchant, then strike', complexity: 2,
    blurb: 'A minotaur with a monocle, which makes him (as he will politely explain) a monotaur. Rasma enchants his sword ' +
      'with frost, lightning or sheer charm, then delivers it one courteous strike at a time, apologising sincerely for ' +
      'each. He has never once raised his voice, only his sword.',
    color: CLARET,
    unlock: null,
    stats: { hp: 32, ap: 3, mov: 4, armor: 0, init: -1 },   // h19:balance it2: HP 30 → 32
    growth: { hp: 4 },
    flags: {},
    sprite: RASMA_SPRITE,
    basic: 'ras_pardon',
    signature: 'ras_thousand',
    passive: PASSIVE,
    startingSkills: ['ras_cold_shoulder', 'ras_due_respect'],
    skillPool: ['ras_cold_shoulder', 'ras_due_respect', 'ras_shocking', 'ras_disarming', 'ras_sweeping_bow', 'ras_regards',
      'ras_keep_change', 'ras_touche', 'ras_tea', 'ras_look'],
    summons: [],
    barks: {
      select: ['Rasma, delighted to oblige. Horns, monocle and all.', 'A monotaur, if you please. One monocle. Hence the mono.',
        'Charmed, I\'m sure. Shall we proceed?', 'My blade and I are entirely at your disposal.', 'Ready, willing, and impeccably dressed.'],
      start: ['Good evening, all. I\'m afraid I must ask you to perish.', 'Ladies, gentlemen, monsters: shall we begin?',
        'En garde, if you please. Whenever you\'re ready.', 'I do hope nobody minds if I enchant my sword.',
        'Introductions first. Rasma. Enchanté. Now, then.'],
      move: ['Coming through. Do forgive the hooves.', 'One does not run. One proceeds briskly.', 'Mind the china, everyone. I\'m a bull.',
        'If you would be so kind as to make way.', 'Proceeding at a gentlemanly trot.'],
      kill: ['Do forgive me. It was nothing personal.', 'Rest well. You were a most gracious opponent.', 'Thank you for the dance.',
        'Oh dear. I appear to have won. How awkward.', 'My condolences to your family. And your lair.'],
      hurt: ['I say! That was uncalled for.', 'Good heavens. My monocle nearly came off.', 'A palpable hit. Well done, you.',
        'You\'ve scuffed my waistcoat. Very nearly unforgivable.'],
      lowhp: ['I fear I may need a moment. And a cup of tea.', 'Things are getting rather beastly, I\'m afraid.',
        'Not to alarm anyone, but I am rather dying.', 'Still standing. Barely, but politely.'],
      downed: ['Do excuse me... I must lie down...', 'Most... inconvenient...', 'Tell them... I was... polite...',
        'My monocle... has anyone seen... my monocle...'],
      revive: ['Most kind of you. I\'m in your debt.', 'Back on my hooves. Now, where were we?', 'Thank you ever so much. Now, where\'s my monocle?',
        'Restored, refreshed, and only slightly bloodied.'],
      ally_down: ['How dare you. That was my friend.', 'Someone see to them at once! I shall see to you.', 'Now I am cross. Politely, but cross.',
        'That was uncalled for. I shall have words. Sharp ones.'],
      levelup: ['How marvellous. I feel positively enchanted.', 'A new trick for an old bull.', 'One must keep improving. It\'s only polite.',
        'My compliments to the dungeon. Most educational.'],
      victory: ['Well fought, everyone. Tea, anyone?', 'Good show, all. Do help yourselves to the loot.', 'Victory, and not a single teacup broken.',
        'My compliments to the fallen. Lovely footwork.', 'Do tidy up, everyone. We are guests here.'],
      // party-filtered by exact name: each names exactly one shipped hero (plan D11: never another h19 hero or a construct)
      idle: ['Lovely weather for a dungeon, wouldn\'t you say?', 'Pardon me a moment. My monocle\'s smudged.',
        'Marwyn, there\'s no need to shout. I\'m standing right here.', 'Betty, the saucer is not a biscuit. Please put it down.',
        'Syllamin, language! There are monsters present.', 'Hjalmar, kindly return my monocle. That one is my good one.',
        'Benedick, a fellow gentleman. Lettuce, or tea?', 'Corelos, one never signs anything before tea.'],
      signature: ['A thousand pardons! Well. Three each.', 'I do apologise in advance. And during. And after.', 'Pardon! Pardon! Terribly sorry! Pardon!',
        'How do you do? And you? And you? Lovely.', 'Do forgive the theatrics. They are quite necessary.'],
      swap: ['Do go ahead, {ally}. I shall hold the line.', '{ally}, might I trouble you for your spot?', 'Pardon me, {ally}. A quick do-si-do.'],
      // custom keys (DD.Act.maybeBark from his own code)
      enchant_frost: ['I\'m afraid I must give you the cold shoulder.', 'A touch of frost, I think.', 'Frightfully sorry. It\'s about to get chilly.'],
      enchant_shock: ['Brace yourselves. This may come as a shock.', 'Positively shocking, I know. Do bear with me.', 'A little spark of conversation.'],
      enchant_charm: ['Allow me to be utterly disarming.', 'A smile, a bow, and they simply crumble.', 'Do put your claws down. There\'s a dear.'],
      freeze: ['Oh dear. You appear to be frozen.', 'Do pardon the frostbite. You shall thaw presently, I assure you.', 'Wet, then frozen. Dreadfully sorry.'],
      refresh: ['Most refreshing.', 'A finished spell is a happy spell.', 'Lovely. Now, where was I?'],
      opportunity: ['Leaving without a goodbye? How rude.', 'Not so fast. We haven\'t been introduced.', 'Departing mid-conversation? Allow me to see you out.'],
      touche: ['Touché!', 'Touché. And riposte.', 'A fair hit. Now, if I may...'],
      tea: ['Tea? You look positively parched.', 'Milk? No? Straight in the face, then.', 'Careful, it\'s hot. Well. Lukewarm.'],
      look: ['I beg your pardon?', 'Not in front of the monsters, please.', 'We\'ll have none of that, thank you.', 'Ahem.'],
      change: ['Do keep the change.', 'Spend it wisely.', 'No need for a receipt.'],
      respect: ['With all due respect...', 'I say this with the greatest respect.', 'No offence intended. Plenty of damage, though.'],
      bow: ['Ladies. Gentlemen. Monsters.', 'A bow to all of you. And then some.', 'Do forgive the sweeping gesture.'],
      regards: ['Do give them my regards.', 'With my compliments.', 'Kind regards. Freezing regards, perhaps.'],
      pop: ['Good heavens!', 'My monocle!', 'I say!'],
    },
  });

  // ---- hero items (legendary / rare / rare) -----------------------------------------------------------------------------
  DD.registerItem({
    id: WIT, name: 'Rapier Wit', slot: 'weapon', rarity: 'legendary', icon: '⚔️', hero: HERO,
    stats: { dmg: 0.1 },
    desc: '+10% damage. Rasma\'s enchantments hold ' + WIT_CHARGES + ' charges instead of ' + CHARGES + '.',
    flavor: 'Sharper than it looks. Sharper than he lets on.',
    hooks: {},   // charges(u) reads it when he enchants
  });
  DD.registerItem({
    id: WAISTCOAT, name: 'Bespoke Waistcoat', slot: 'armor', rarity: 'rare', icon: '🧥', hero: HERO,
    stats: { hp: 4, armor: 1 },
    desc: '+4 max HP and +1 armor.',
    flavor: 'Tailored for a chest the size of a wine barrel. The tailor retired on the fee.',
    hooks: {},
  });
  DD.registerItem({
    id: MONOCLE, name: 'The Spare Monocle', slot: 'trinket', rarity: 'rare', icon: '🧐', hero: HERO,
    stats: {},
    desc: 'Rasma\'s first enchantment each turn costs 0 AP.',
    flavor: 'One for seeing, one for emergencies. A gentleman is never caught with just the one.',
    hooks: {
      // pure (the cost pill, AutoPlay and canUse read Combat.costOf): the wearer's first enchantment of this turn is free
      modifyCost: function (c) {
        const s = S();
        if (!s || !c || !c.unit || !c.skill || !BLADE_OF[c.skill.id] || !hasItem(c.unit, MONOCLE)) return;
        const d = peek(c.unit);
        if (!d || d.monocle !== s.turn) c.ap = 0;
      },
      onCostPaid: function (p) {
        const s = S();
        if (!s || !p || !p.unit || !p.skill || !BLADE_OF[p.skill.id] || p.consumable || !hasItem(p.unit, MONOCLE)) return;
        if (p.ap === 0) dataOf(p.unit).monocle = s.turn;
      },
    },
  });

  // ---- loading-screen tips -------------------------------------------------------------------------------------------
  DD.registerNarration('tips', [
    'Rasma\'s enchantment rides on his sword strikes, attacks of opportunity too: 3 of them (4 with Rapier Wit).',
    'The strike that spends the last charge of Rasma\'s enchantment heals him ' + AFTERGLOW + ' HP. Finish what you start.',
    'Frost freezes a Wet foe solid: soak it first (Tea, Anyone?, a puddle, a keg), then hit it with a sword under The Cold Shoulder.',
  ]);

  // ---- test / debug API ----------------------------------------------------------------------------------------------
  /** Enchant a unit through the real code (tests, debug): kind 'frost' | 'shock' | 'charm', level 1-3. */
  function enchantNow(u, kind, level) {
    const id = KIND_OF[kind] || (BLADES.indexOf(kind) >= 0 ? kind : null);
    if (!u || !id) return null;
    const d = DD.getSkill(SKILL_OF[id]);
    return enchant(u, id, DD.skillLevel(d, level || 1), level || 1);
  }
  DD.Rasma = {
    HERO: HERO, CHARGES: CHARGES, WIT_CHARGES: WIT_CHARGES, BASE: BASE, AFTERGLOW: AFTERGLOW, ARC_RANGE: ARC_RANGE,
    BLADES: BLADES.slice(), EL: EL, BLADE_OF: BLADE_OF, COLOR_OF: COLOR_OF, GUARD: GUARD, LAST_WARNING: LAST_WARNING,
    RASMA_SPRITE: RASMA_SPRITE,
    isSword: isSword, charges: charges, bladeInfo: bladeInfo, bladeShown: bladeShown, enchantNow: enchantNow, spend: spend,
    arcTarget: arcTarget, strikeGain: strikeGain, enchantScore: enchantScore, teaScore: teaScore, lookScore: lookScore,
    toucheScore: toucheScore, changeScore: changeScore, thousandScore: thousandScore, bladeNote: bladeNote,
    lastEnchantWarning: lastEnchantWarning, threatOf: threatOf, strikeableNow: strikeableNow, syncBlade: syncBlade,
    painters: { rasOverlay: rasOverlay, bladeRot: bladeRot, paintedBlade: paintedBlade },
  };
})();
