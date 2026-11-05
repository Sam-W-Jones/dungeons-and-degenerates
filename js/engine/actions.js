/* Dungeons and Degenerates — js/engine/actions.js
 * DD.Act (ARCHITECTURE §5.4, §6.5-6.8): every gameplay effect goes through here so it gets FX, hooks, log
 * lines, stats and Hype. Damage pipeline, statuses, deaths/downs, push/pull/falls, surfaces + the element
 * reaction table (declared in js/data/terrain.js), objects, spawns/summons, gold, rules.
 * While DD.Act.simulating is true (Targeting.preview dry runs) events, log, barks, narration and run-gold
 * changes are suppressed; markUncertain() tells the preview that its outcome depends on chance.
 * v2 (initiative): statuses applied during their owner's own turn are `fresh` (the end of that turn does not count),
 * gainAp outside the unit's turn is banked for its next turn, units arriving after initiative roll for a slot, and a
 * stun-like or polymorph interrupts pending wind-ups. Attacks of opportunity: a move action (moveAlong with provoke)
 * leaving a tile next to an opposing melee unit lets it strike once (once per round per attacker; opportunityOf).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  // simulating: preview dry run (no log/events/barks/run gold) · muted: no log lines (for replays)
  // _sim: the running dry run's record { draws, uncertain } (Targeting.simulate) · _quiet > 0: engine bookkeeping
  // draws (loot gold, summon names) that a preview must not count as chance in the outcome
  const Act = (DD.Act = { simulating: false, muted: false, _sim: null, _quiet: 0 });

  /** During a preview dry run: the outcome depends on chance, so the HUD must not show it as certain. */
  Act.markUncertain = function () { if (Act.simulating && Act._sim) Act._sim.uncertain = true; };
  /** Run fn with combat-RNG draws that are bookkeeping, not part of what a preview shows. */
  function quietly(fn) { Act._quiet++; try { return fn(); } finally { Act._quiet--; } }

  // causes that skip the source's outgoing modifiers (they are not "attacks") and default to ignoring armor
  const ENV_CAUSE = { status: 1, surface: 1, terrain: 1, bump: 1, fall: 1, explosion: 1 };
  const NO_ARMOR_CAUSE = { status: 1, surface: 1, terrain: 1, fall: 1 };
  const ENV_KILL_CAUSE = { surface: 1, terrain: 1, bump: 1, fall: 1, explosion: 1 };
  const STUN_LIKE = { stun: 1, sleep: 1, frozen: 1 };
  const ELEMENT_ALIAS = { ice: 'frost', cold: 'frost', electric: 'lightning', shock: 'lightning', ale: 'water' };
  const ELEMENT_SOUND = { fire: 'fire', frost: 'frost', lightning: 'zap', poison: 'poison' };
  const ELEMENT_COLOR = { fire: '#ff8a1a', frost: '#9fe3ff', lightning: '#9fd0ff', poison: '#8fdc3c', holy: '#fff0a0' };

  // ---- small helpers ---------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function FX() { return DD.FX; }
  function G() { return DD.Grid; }
  function bump() { const s = S(); if (s) s.mutations = (s.mutations || 0) + 1; }
  Act.touch = bump;

  function getStatus(u, id) {
    if (!u || !u.statuses) return null;
    for (let i = 0; i < u.statuses.length; i++) if (u.statuses[i].id === id) return u.statuses[i];
    return null;
  }
  function has(u, id) { return !!getStatus(u, id); }
  function active(u) { return !!u && !u.dead && !u.downed; }
  /** A status def flag: true on the def, or (st, unit) => bool. */
  function flagOf(sd, key, st, u) {
    const v = sd && sd[key];
    return typeof v === 'function' ? !!DD.safe('status ' + sd.id + ' ' + key, v, sd, [st, u]) : !!v;
  }
  /** Stun-like: the core stun / sleep / frozen, or a status def with stunLike (loses its turns, intents cancelled). */
  function stunLikeId(id) { if (STUN_LIKE[id]) return true; const sd = DD.getStatus(id); return !!(sd && sd.stunLike); }
  Act.isStunLike = stunLikeId;
  /** Has any stun-like status right now. */
  function stunnedNow(u) {
    if (!u || !u.statuses) return false;
    for (let i = 0; i < u.statuses.length; i++) if (stunLikeId(u.statuses[i].id)) return true;
    return false;
  }
  Act.isStunned = stunnedNow;
  /** Can't take move actions: Rooted, or any status whose def says noMove (a grapple, a hold). Pushes still work. */
  function cantMove(u) {
    if (!u || !u.statuses) return false;
    for (let i = 0; i < u.statuses.length; i++) {
      const st = u.statuses[i];
      if (st.id === 'root') return true;
      const sd = DD.getStatus(st.id);
      if (sd && sd.noMove && flagOf(sd, 'noMove', st, u)) return true;
    }
    return false;
  }
  Act.cantMove = cantMove;
  function isBoss(u) { return !!u && (u.tier === 'boss' || !!u.isBoss); }
  function nameOf(u) { return u ? u.name : 'Something'; }
  function byId(id) {
    const s = S();
    if (!s || id == null) return null;
    for (let i = 0; i < s.units.length; i++) if (s.units[i].id === id) return s.units[i];
    return null;
  }
  function defOf(u) { return DD.Hooks.defOf(u); }
  Act.isBoss = isBoss;

  function statOf(u) {
    const s = S();
    if (!s || !u) return null;
    const bag = s.stats.units;
    return bag[u.id] || (bag[u.id] = { dmg: 0, taken: 0, kills: 0, heals: 0 });
  }
  Act.statOf = statOf;

  /** Cosmetic random line (barks/narration never touch the logic RNG). */
  function cosmeticRng() { return DD.rng; }

  // ---- skill resolution context (Hype for multi-hits, Empowered consumption, multi-kills) --------------
  const skillStack = [];
  Act.beginSkill = function (user, skill, extra) {
    const c = { user: user, skill: skill, foes: {}, foeCount: 0, kills: 0, empowerUsed: false, extra: extra || null };
    skillStack.push(c);
    return c;
  };
  Act.endSkill = function () {
    const c = skillStack.pop();
    if (!c) return null;
    const u = c.user;
    if (c.empowerUsed && u && has(u, 'empowered')) Act.removeStatus(u, 'empowered', { silent: true });
    if (u && u.side === 'hero' && c.foeCount >= 2) Act.gainHype(HY().multiHit, 'multi-hit');
    if (c.kills >= 3) Act.narrate('multi_kill', { hero: nameOf(u), n: c.kills });
    return c;
  };
  Act.currentSkill = function () { return skillStack.length ? skillStack[skillStack.length - 1] : null; };

  // ---- credit for displacement kills (push into lava etc.) ---------------------------------------------
  const creditStack = [];
  Act.withCredit = function (src, fn) {
    creditStack.push(src || null);
    try { return fn(); } finally { creditStack.pop(); }
  };
  function currentCredit() {
    for (let i = creditStack.length - 1; i >= 0; i--) if (creditStack[i]) return creditStack[i];
    return null;
  }

  /** Engine module state that previews must save/restore. */
  Act._saveModule = function () { return { skill: skillStack.slice(), credit: creditStack.slice() }; };
  Act._restoreModule = function (m) {
    skillStack.length = 0; Array.prototype.push.apply(skillStack, m.skill);
    creditStack.length = 0; Array.prototype.push.apply(creditStack, m.credit);
  };

  // ---- log / events / barks / narration ----------------------------------------------------------
  function emit(name, data) { if (!Act.simulating) DD.Events.emit(name, data); }
  Act.emit = emit;

  Act.log = function (text, cls) {
    const s = S();
    if (!s || Act.simulating || Act.muted || !text) return;
    const entry = { round: s.round, text: String(text), cls: cls || 'system' };
    s.log.push(entry);
    if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
    emit('combat:log', entry);
  };

  Act.narrate = function (key, vars) {
    if (Act.simulating) return '';
    const line = DD.narrate(key, vars || {}, cosmeticRng());
    if (line) Act.log(line, 'narrator');
    return line;
  };

  /** Speech bubble from a bark key of the unit's def (select/kill/hurt/...) or literal text. */
  Act.bark = function (unit, keyOrText, opts) {
    if (Act.simulating || !unit || unit.dead || !keyOrText) return '';
    const def = defOf(unit);
    let text = String(keyOrText);
    // identifier-like strings ('kill', 'ally_down', 'phase') are bark keys; anything else is literal text
    if (/^[a-z][a-z0-9_]*$/.test(text)) {
      const lines = def && def.barks ? def.barks[text] : null;
      text = Array.isArray(lines) ? U.line(lines, cosmeticRng()) : typeof lines === 'string' ? lines : '';
    }
    if (!text) return '';
    FX().bark(unit, text, opts);
    return text;
  };
  /** Bark with a probability (cosmetic). */
  Act.maybeBark = function (unit, key, chance) {
    if (Act.simulating) return '';
    if (cosmeticRng().next() < (chance === undefined ? 0.35 : chance)) return Act.bark(unit, key);
    return '';
  };

  // ---- Hype / AP / cooldowns ------------------------------------------------------------------------
  Act.gainHype = function (n, reason) {
    const s = S();
    if (!s || !n) return 0;
    const before = s.hype || 0;
    s.hype = U.clamp(before + Math.round(n), 0, 100);
    const delta = s.hype - before;
    if (delta > 0) s.stats.hypeGained = (s.stats.hypeGained || 0) + delta;
    if (delta) { bump(); emit('hype:changed', { hype: s.hype, delta: delta, reason: reason || '' }); }
    return delta;
  };

  // Hype sources beyond the skill/passive ones (numbers: DD.Balance.hype, js/data/balance.js). [balance]
  const HYPE_FALLBACK = { kill: 8, envKill: 20, multiHit: 4, eliteKill: 0, dealtPer: 0, takenPer: 0, bossQuarter: 0, puzzle: 0, puzzlePerRound: 2 };
  function HY() { return (DD.Balance && DD.Balance.hype) || HYPE_FALLBACK; }
  /** Damage-driven Hype: +1 per `per` points, the remainder carried on the fight (state.hypeCarry) so chip damage adds up. */
  function hypeTrickle(key, amount, per, reason) {
    const s = S();
    if (!s || !(per > 0) || !(amount > 0)) return 0;
    const carry = s.hypeCarry || (s.hypeCarry = {});
    const exact = (carry[key] || 0) + amount / per;
    const n = Math.floor(exact + 1e-9);
    carry[key] = exact - n;
    return n > 0 ? Act.gainHype(n, reason) : 0;
  }
  /** After damage lands: Hype for damage the hero side deals, damage heroes take, and each boss quarter knocked off. */
  function hypeFromDamage(d, target) {
    const h = HY(), cu = d.credit;
    if (cu && cu.side === 'hero' && target.side === 'enemy') hypeTrickle('dealt', d.dealt, h.dealtPer, 'damage dealt');
    if (target.kind === 'hero' && target.side === 'hero') hypeTrickle('taken', d.dealt, h.takenPer, 'damage taken');
    if (h.bossQuarter > 0 && target.side === 'enemy' && isBoss(target) && target.maxHp > 0) {
      const q = Math.min(3, Math.floor((1 - Math.max(0, target.hp) / target.maxHp) * 4 + 1e-9));
      const prev = (target.data && target.data.hypeQuarters) || 0;
      if (q > prev) {
        target.data = target.data || {};
        target.data.hypeQuarters = q;
        Act.gainHype((q - prev) * h.bossQuarter, 'boss bloodied');
      }
    }
  }
  /** AutoPlay / puzzle hint of an object (§5.7): instance, its interact, def, def interact; a number, 0 when none. */
  Act.puzzleHint = function (o, unit, tile) {
    if (!o) return 0;
    const def = DD.getObject(o.id) || {};
    const srcs = [o, o.interact, def, def.interact];
    let h;
    for (let i = 0; i < srcs.length && h === undefined; i++) if (srcs[i] && srcs[i].autoplay !== undefined) h = srcs[i].autoplay;
    if (typeof h === 'function') h = DD.safe('puzzle hint ' + o.id, h, null, [unit, o, tile, S()]);
    return typeof h === 'number' && isFinite(h) ? h : 0;
  };
  /** A boss-fight puzzle step by the hero side (an interaction or a destroyed object that was worth something). */
  function puzzleStep(unit, hint) {
    const s = S(), h = HY();
    if (!s || !(h.puzzle > 0) || !(hint > 0) || !unit || unit.side !== 'hero' || s.kind !== 'boss') return 0;
    const p = s.hypePuzzle && s.hypePuzzle.round === s.round ? s.hypePuzzle : (s.hypePuzzle = { round: s.round, n: 0 });
    if (p.n >= (h.puzzlePerRound > 0 ? h.puzzlePerRound : Infinity)) return 0;
    p.n++;
    return Act.gainHype(h.puzzle, 'puzzle step');
  }

  /**
   * AP for a unit. During its own turn (it is the current unit or acts on its turn) it can spend it now; outside its
   * turn (another hero's turn, round start, before initiative) it is banked and added at the start of its next turn
   * (unit.apBank, also negative: "−1 AP next turn"). v2: AP refreshes at every turn start, so this is the only way
   * AP given to an ally whose turn it is not survives.
   */
  Act.gainAp = function (unit, n) {
    if (!active(unit) || !n) return 0;
    n = Math.round(+n) || 0;
    if (!n) return 0;
    const now = !!(DD.Combat && DD.Combat.isTurnOf && DD.Combat.isTurnOf(unit));
    if (now) unit.ap = Math.max(0, (unit.ap || 0) + n);
    else unit.apBank = (Math.round(+unit.apBank || 0) || 0) + n;
    bump();
    FX().text(unit, (n > 0 ? '+' : '') + n + ' AP' + (now ? '' : ' next turn'), { color: '#7fe3ff', size: 15 });
    return n;
  };

  function slotsOf(unit) {
    if (DD.Combat && DD.Combat.slotsOf) return DD.Combat.slotsOf(unit);
    return [];
  }
  /**
   * The skill is unusable during its owner's next n turns, exactly as if a cooldown-n skill had just been used
   * (the next tick is skipped). Called from an onTurnStart hook it covers the turn that is starting.
   */
  Act.setCooldown = function (unit, skillId, n) {
    const slots = slotsOf(unit);
    const cd = Math.max(0, Math.round(+n) || 0);
    for (let i = 0; i < slots.length; i++) if (slots[i].id === skillId) { slots[i].cd = cd; slots[i].fresh = cd > 0; }
    bump();
  };
  Act.resetCooldowns = function (unit) {
    const slots = slotsOf(unit);
    for (let i = 0; i < slots.length; i++) { slots[i].cd = 0; slots[i].fresh = false; }
    bump();
    if (unit) FX().text(unit, 'Cooldowns reset!', { color: '#9fffb0', size: 14 });
  };

  // ---- gold (run gold, or state.sandboxGold without a run) -----------------------------------------
  function runIsLive(s) { return !!(s.run && DD.Run && DD.Run.state === s.run); }
  Act.gold = function () {
    const s = S();
    if (!s) return 0;
    return s.run ? (s.run.gold || 0) : (s.sandboxGold || 0);
  };
  function setGold(s, value, delta) {
    if (s.run) {
      if (Act.simulating) return;
      if (runIsLive(s) && delta > 0 && DD.Run.addGold) DD.Run.addGold(delta);
      else if (runIsLive(s) && delta < 0 && DD.Run.spendGold && DD.Run.spendGold(-delta)) { /* paid through the run */ }
      else s.run.gold = Math.max(0, value);
      if (!runIsLive(s)) emit('run:gold', { gold: s.run.gold, delta: delta });
    } else {
      s.sandboxGold = Math.max(0, value);
    }
    bump();
  }
  Act.gainGold = function (n) {
    const s = S();
    n = Math.round(n || 0);
    if (!s || n <= 0) return 0;
    setGold(s, Act.gold() + n, n);
    s.stats.goldGained = (s.stats.goldGained || 0) + n;
    FX().sound('coin');
    return n;
  };
  Act.spendGold = function (n) {
    const s = S();
    n = Math.round(n || 0);
    if (!s) return false;
    if (n <= 0) return true;
    if (Act.gold() < n) return false;
    setGold(s, Act.gold() - n, -n);
    return true;
  };
  Act.loseGold = function (n) {
    const s = S();
    if (!s) return 0;
    const actual = Math.max(0, Math.min(Math.round(n || 0), Act.gold()));
    if (actual > 0) setGold(s, Act.gold() - actual, -actual);
    return actual;
  };

  /** Add a random registered (non-test) consumable to the party inventory if there is room. Returns id|null. */
  Act.giveRandomConsumable = function (id) {
    const s = S();
    if (!s || Act.simulating) return null;
    if (!id) {
      const all = Object.keys(DD.defs.consumables);
      const real = all.filter(function (k) { return k.indexOf('test_') !== 0; });
      const pool = real.length ? real : all;
      if (!pool.length) return null;
      id = pool[s.rng.int(0, pool.length - 1)];
    }
    if (s.run) {
      if (runIsLive(s) && DD.Run.addConsumable) return DD.Run.addConsumable(id) ? id : null;
      const max = s.run.maxConsumables || 3;
      if ((s.run.consumables || []).length >= max) return null;
      (s.run.consumables = s.run.consumables || []).push(id);
      return id;
    }
    s.consumables = s.consumables || [];
    if (s.consumables.length >= (s.maxConsumables || 3)) return null;
    s.consumables.push(id);
    bump();
    return id;
  };

  // ---- statuses -----------------------------------------------------------------------------------
  Act.getStatus = getStatus;
  Act.hasStatus = has;

  /**
   * The unit's own turn is under way (v2: it is the current unit, or a summon acting on its owner's turn, past its
   * start-of-turn ticks). A status applied now is `fresh`: the end of this turn does not count, so turns: 1 covers its
   * NEXT turn (DD.Combat decay). Statuses from onTurnStart hooks are not fresh: a stun there costs this turn only.
   */
  function ownPhase(unit) {
    return !!(unit && DD.Combat && DD.Combat.isActing && DD.Combat.isActing(unit));
  }
  Act.isOwnTurn = ownPhase;

  function turnsOf(v, fallback) {
    const n = Math.round(+v);
    return v === null || v === undefined || !isFinite(n) ? fallback : n === 0 ? 1 : n;
  }

  function immuneTo(unit, id) {
    const f = unit.flags || {};
    if ((stunLikeId(id) || id === 'sheep') && f.stunImmune) return true;
    if (id === 'sheep' && isBoss(unit)) return true;
    if (Array.isArray(f.immune) && f.immune.indexOf(id) >= 0) return true;
    return false;
  }
  /** The unit can't get this status (flags.immune, stunImmune for stun-likes and sheep, bosses vs sheep). Pure. */
  Act.immuneTo = function (unit, id) { return !!unit && immuneTo(unit, id); };

  /** Apply a status. opts: number (stacks) or { stacks = 1, turns, silent }. Returns the instance or null. */
  Act.addStatus = function (target, id, opts, src) {
    if (typeof opts === 'number') opts = { stacks: opts };
    opts = opts || {};
    const def = DD.getStatus(id);
    if (!def) { DD.warn('addStatus: unknown status "' + id + '"'); return null; }
    if (!active(target)) return null;
    let stacks = opts.stacks === undefined ? 1 : Math.max(1, Math.round(opts.stacks) || 1);
    const defTurns = turnsOf(def.defaultTurns, -1);
    let turns = turnsOf(opts.turns, defTurns);
    if (immuneTo(target, id)) {
      if (!opts.silent) FX().text(target, 'Immune!', { color: '#dddddd', size: 14 });
      return null;
    }
    if (id === 'burn' && has(target, 'wet')) {
      if (!opts.silent) FX().text(target, 'Sizzle!', { color: '#bfe6ff', size: 14 });
      return null;
    }
    const m = { unit: target, id: id, stacks: stacks, turns: turns, src: src || null, cancel: false };
    DD.Hooks.fire('modifyStatus', target, m);
    if (m.cancel) return null;
    stacks = Math.max(1, Math.round(m.stacks) || 1);
    turns = turnsOf(m.turns, turns);
    if (id === 'wet' && has(target, 'burn')) Act.removeStatus(target, 'burn', { text: 'Extinguished!' });
    const max = def.maxStacks || 99;
    let inst = getStatus(target, id);
    const fresh = ownPhase(target);
    if (inst) {
      if (def.stacking === 'none') return inst;
      inst.stacks = def.stacking === 'stack' ? Math.min(max, inst.stacks + stacks) : Math.min(max, Math.max(inst.stacks, stacks));
      inst.turns = inst.turns < 0 || turns < 0 ? -1 : Math.max(inst.turns, turns);
      if (fresh) inst.fresh = true;
      if (src) inst.source = src.id;
    } else {
      inst = { id: id, stacks: Math.min(max, stacks), turns: turns, source: src ? src.id : null, data: {} };
      if (fresh) inst.fresh = true;
      target.statuses.push(inst);
    }
    bump();
    if (!opts.silent) {
      FX().status(target, id, '+' + def.name + (stacks > 1 ? ' ' + stacks : ''));
      FX().sound(def.type === 'buff' ? 'buff' : 'debuff');
      Act.log(target.name + ' is ' + def.name + (inst.stacks > 1 ? ' (' + inst.stacks + ')' : '') + '.', 'status');
    }
    // v2: a stun-like or a polymorph interrupts a pending wind-up at once (clear feedback; DESIGN §4.1 counterplay).
    // Taunt, charm, silence, dazzle and confuse act on the unit's next turn instead (DD.AI), not on its wind-ups.
    if (target.intents && target.intents.length && DD.AI && DD.AI.cancelIntents && (stunLikeId(id) || id === 'sheep')) {
      DD.AI.cancelIntents(target, id === 'sheep' ? 'Baa?' : def.name + '!', { keepUnstoppable: true });
    }
    DD.Hooks.fire('onStatusApplied', target, target, inst, src || null);
    return inst;
  };

  Act.removeStatus = function (target, id, opts) {
    opts = opts || {};
    if (!target || !target.statuses) return false;
    for (let i = 0; i < target.statuses.length; i++) {
      if (target.statuses[i].id !== id) continue;
      target.statuses.splice(i, 1);
      bump();
      const def = DD.getStatus(id);
      if (!opts.silent) FX().status(target, id, opts.text || ('−' + (def ? def.name : id)), { removed: true });
      landed(target, def);
      return true;
    }
    return false;
  };

  /**
   * [v2 review] A status that granted flight (def `flying`) is gone: a unit that no longer flies over a pit or deep
   * water falls in (heroes and bosses climb out hurt). Other floor effects reach it from its next entry / turn end.
   */
  function landed(unit, def) {
    if (!def || !def.flying || !active(unit) || G().isFlying(unit) || !G().isDrop(unit.x, unit.y)) return;
    fall(unit, currentCredit());
  }

  /** Remove up to `count` statuses of a type ('debuff'|'buff'), most recent first. Returns the number removed. */
  Act.cleanse = function (target, type, count) {
    if (!target || !target.statuses) return 0;
    type = type || 'debuff';
    let n = 0, wings = null;
    const max = count === undefined || count === null ? Infinity : count;
    for (let i = target.statuses.length - 1; i >= 0 && n < max; i--) {
      const def = DD.getStatus(target.statuses[i].id);
      if (def && def.type === type) { target.statuses.splice(i, 1); n++; if (def.flying) wings = def; }
    }
    if (n) {
      bump();
      FX().text(target, type === 'debuff' ? 'Cleansed!' : 'Dispelled!', { color: type === 'debuff' ? '#9fffb0' : '#d0b0ff', size: 15 });
      Act.log(target.name + (type === 'debuff' ? ' shrugs off ' : ' loses ') + U.plural(n, type) + '.', 'status');
      landed(target, wings);
    }
    return n;
  };

  /** Bleed: each move action or forced movement deals `stacks` damage and leaves blood (DESIGN §4.4). */
  Act.bleedTick = function (unit) {
    const st = getStatus(unit, 'bleed');
    if (!st || !active(unit)) return 0;
    const tile = G().tile(unit.x, unit.y);
    if (tile && !tile.surface) Act.setSurface(unit.x, unit.y, 'blood', 4);
    return Act.damage(byId(st.source), unit, st.stacks, { cause: 'status', tags: ['bleed'] });
  };

  // ---- damage pipeline (§6.5) --------------------------------------------------------------------
  function tileH(u) { const t = G().tile(u.x, u.y); return t ? t.h || 0 : 0; }

  /**
   * Damage-taken multiplier from content statuses declaring takenMult (number or pure (st, unit) => number), applied
   * next to Vulnerable. Declared rather than hooked so DD.AI.estimate (enemy planning, AutoPlay) can read it too.
   */
  function takenMult(u) {
    let m = 1;
    const list = (u && u.statuses) || [];
    for (let i = 0; i < list.length; i++) {
      const sd = DD.getStatus(list[i].id);
      if (!sd || sd.takenMult === undefined || sd.takenMult === null) continue;
      const v = Number(typeof sd.takenMult === 'function' ? DD.safe('takenMult of ' + sd.id, sd.takenMult, sd, [list[i], u]) : sd.takenMult);
      if (isFinite(v) && v >= 0) m *= v;
    }
    return m;
  }
  Act.takenMult = takenMult;

  /**
   * Deal damage. opts: element, skill, tags, cause ('skill'|'status'|'surface'|'terrain'|'bump'|'fall'|
   * 'explosion'|'other'), ignoreBlock, ignoreArmor, noHighGround, silent, reflect (thorns; no outgoing mods).
   * Environmental causes skip the source's outgoing modifiers but still credit it (kills, stats, Hype).
   * Returns HP actually lost.
   */
  Act.damage = function (src, target, amount, opts) {
    opts = opts || {};
    if (!active(target)) return 0;
    amount = Number(amount);
    if (!isFinite(amount) || amount <= 0) return 0;
    const s = S();
    const sk = Act.currentSkill();
    const cause = opts.cause || (opts.skill || (sk && src && sk.user === src) ? 'skill' : 'other');
    const d = {
      source: src || null, target: target, base: amount, amount: amount, mult: 1, flat: 0,
      element: opts.element ? (ELEMENT_ALIAS[opts.element] || opts.element) : null,
      skill: opts.skill || (sk && src && sk.user === src ? sk.skill : null), tags: opts.tags || [], cause: cause,
      ignoreBlock: !!opts.ignoreBlock, ignoreArmor: opts.ignoreArmor !== undefined ? !!opts.ignoreArmor : !!NO_ARMOR_CAUSE[cause],
      dealt: 0, blocked: 0, killed: false, overkill: 0, highGround: false,
      credit: src || currentCredit(),
    };
    // an attack of opportunity's hit (content: "+2 damage on attacks of opportunity" → if (d.opportunity) d.flat += 2)
    const opp = sk && src && sk.user === src && sk.extra && sk.extra.opportunity ? sk.extra.opportunity : null;
    d.opportunity = !!opp;
    if (has(target, 'invulnerable') || (target.flags && target.flags.invulnerable)) {
      if (!opts.silent) FX().text(target, 'Invulnerable!', { color: '#ffffff', size: 14 });
      return 0;
    }
    const offensive = !ENV_CAUSE[cause] && !opts.reflect;
    if (src && offensive) {
      if (opp && opp.mover === target) {
        d.flat += Number(opp.flat) || 0;
        if (typeof opp.mult === 'number' && isFinite(opp.mult) && opp.mult >= 0) d.mult *= opp.mult;
      }
      DD.Hooks.fire('modifyOutgoingDamage', src, d);
      if (has(src, 'weak')) d.mult *= 0.75;
      if (has(src, 'inspired')) d.mult *= 1.25;
      if (src.dmgBonus) d.mult *= 1 + src.dmgBonus;
      // a free reaction neither uses nor consumes Empowered ("its next damaging skill")
      if (cause === 'skill' && has(src, 'empowered') && !opp) {
        d.mult *= 1.5;
        if (sk && sk.user === src) sk.empowerUsed = true; else Act.removeStatus(src, 'empowered', { silent: true });
      }
      if (src.side === 'hero') {
        const taunt = getStatus(src, 'taunt');
        if (taunt && taunt.source && taunt.source !== target.id) d.mult *= 0.5;
        const charm = getStatus(src, 'charmed');
        // [integration fix, hero-corelos request] "can't damage the charmer" includes flat bonuses (items' d.flat)
        if (charm && charm.source === target.id) { d.mult = 0; d.nullified = true; }
      }
      if (src.side === 'enemy' && s && s.difficulty) d.mult *= s.difficulty.dmg || 1;
      if (cause === 'skill' && !opts.noHighGround && !src.dead && tileH(src) > tileH(target)) { d.mult *= 1.25; d.highGround = true; }
    }
    DD.Hooks.fire('modifyIncomingDamage', target, d);
    if (has(target, 'vulnerable')) d.mult *= 1.25;
    d.mult *= takenMult(target);
    if (d.element && target.resist && typeof target.resist[d.element] === 'number') {
      d.mult *= target.resist[d.element];
      if (target.resist[d.element] === 0) d.nullified = true; // [integration fix] immune: flat bonuses don't leak through
    }
    if (d.element === 'lightning' && has(target, 'wet')) d.mult *= 1.5;
    if ((!d.element || d.element === 'physical') && has(target, 'frozen')) d.mult *= 1.5;
    // (a hook's own `d.mult = 0; d.flat = n` still deals exactly n: only the charm / immunity rules nullify)
    let final = d.nullified ? 0 : Math.round(d.amount * d.mult + d.flat);
    if (!isFinite(final) || final < 0) final = 0;
    if (final > 0) {
      const mk = getStatus(target, 'marked');
      if (mk) { final += mk.stacks; Act.removeStatus(target, 'marked', { silent: true }); }
    }
    if (final > 0 && !d.ignoreArmor && target.armor > 0) final = Math.max(1, final - target.armor);
    d.amount = final;
    // [phase 4, boss-dm request] modifyFinalDamage(d): the target's last word on the amount, after armor and before
    // Block (HP gates such as Plot Armor clamp here instead of healing back afterwards). Immunity can't be undone.
    if (final > 0 && !d.nullified) {
      DD.Hooks.fire('modifyFinalDamage', target, d);
      final = Math.max(0, Math.round(+d.amount || 0));
      d.amount = final;
    }
    let blocked = 0;
    if (final > 0 && !d.ignoreBlock && target.block > 0) {
      blocked = Math.min(target.block, final);
      target.block -= blocked;
    }
    const before = target.hp;
    const hpDmg = final - blocked;
    target.hp = Math.max(0, before - hpDmg);
    d.dealt = before - target.hp;
    d.blocked = blocked;
    d.overkill = Math.max(0, hpDmg - before);
    bump();

    if (final > 0) {
      FX().damage(target, d.dealt, { element: d.element, blocked: blocked, crit: d.highGround, cause: cause });
      FX().sound(d.element && ELEMENT_SOUND[d.element] ? ELEMENT_SOUND[d.element] : (d.highGround ? 'crit' : 'hit'));
    } else if (!opts.silent) {
      FX().text(target, d.mult === 0 ? 'Immune!' : '0', { color: '#cccccc', size: 14 });
    }
    if (!opts.silent && final > 0) {
      const how = cause === 'status' ? ' (' + (d.tags[0] || 'status') + ')' : cause === 'skill' || cause === 'other' ? '' : ' (' + cause + ')';
      const from = src && src !== target && (cause === 'skill' || cause === 'other') ? ' from ' + src.name : '';
      Act.log(target.name + ' takes ' + d.dealt + (d.element ? ' ' + d.element : '') + ' damage' + from + how +
        (blocked ? ' (' + blocked + ' blocked)' : '') + (d.highGround ? ' (high ground!)' : '') + '.', target.side === 'hero' ? 'enemy' : 'dmg');
    }
    const cu = d.credit;
    if (cu) { const st = statOf(cu); if (st) st.dmg += d.dealt; }
    const tt = statOf(target);
    if (tt) tt.taken += d.dealt;
    if (d.dealt > 0) hypeFromDamage(d, target);

    if (final > 0) {
      if (has(target, 'sleep')) Act.removeStatus(target, 'sleep', { text: 'Wakes up!' });
      if (src && offensive && has(src, 'stealth')) Act.removeStatus(src, 'stealth', { text: 'Revealed!' });
      if (d.element === 'fire' && has(target, 'frozen')) Act.removeStatus(target, 'frozen', { text: 'Thawed!' });
      if (d.element === 'frost' && has(target, 'wet') && active(target)) {
        Act.removeStatus(target, 'wet', { silent: true });
        Act.addStatus(target, 'frozen', { turns: 1 }, src);
      }
      if (sk && src && sk.user === src && DD.Grid.hostile(src, target) && !sk.foes[target.id]) { sk.foes[target.id] = 1; sk.foeCount++; }
    }
    if (src) DD.Hooks.fire('onDealDamage', src, d);
    DD.Hooks.fire('onTakeDamage', target, d);
    if (target.hp <= 0 && !target.dead && !target.downed) {
      d.killed = true;
      if (!zeroHp(target, d) && active(target) && !(target.hp > 0)) target.hp = 1;
    } else if (final > 0 && target.side === 'hero' && target.kind === 'hero') {
      if (target.hp <= target.maxHp * 0.3) Act.maybeBark(target, 'lowhp', 0.3); else Act.maybeBark(target, 'hurt', 0.15);
    } else if (final > 0 && target.side === 'enemy') Act.maybeBark(target, 'hurt', 0.12);
    // thorns: an adjacent attacker that damaged it gets hurt back
    if (final > 0 && src && src !== target && offensive && !src.dead && G().dist(src, target) === 1) {
      const th = getStatus(target, 'thorns');
      if (th) Act.damage(target.dead ? null : target, src, th.stacks, { cause: 'other', reflect: true, tags: ['thorns'], noHighGround: true });
    }
    return d.dealt;
  };

  /** Damage every unit on tiles. opts.filter 'foes'|'friends'|'all' relative to src (default foes; 'all' w/o src). */
  Act.damageTiles = function (src, tiles, amount, opts) {
    opts = opts || {};
    const out = [];
    if (!tiles) return out;
    const filter = opts.filter || (src ? 'foes' : 'all');
    const victims = [];
    for (let i = 0; i < tiles.length; i++) {
      const u = G().unitAt(tiles[i].x, tiles[i].y);
      if (!active(u)) continue;
      if (filter === 'foes' && !(src && DD.Grid.hostile(src, u))) continue;
      if (filter === 'friends' && src && DD.Grid.hostile(src, u)) continue;
      if (victims.indexOf(u) < 0) victims.push(u);
    }
    for (let i = 0; i < victims.length; i++) {
      const amt = typeof amount === 'function' ? amount(victims[i]) : amount;
      out.push({ unit: victims[i], dealt: Act.damage(src, victims[i], amt, opts) });
    }
    if (opts.hitObjects) {
      for (let i = 0; i < tiles.length; i++) {
        const t = G().tile(tiles[i].x, tiles[i].y);
        if (t && t.obj) Act.damageObject(src, t.x, t.y, typeof amount === 'function' ? amount(null) : amount);
      }
    }
    return out;
  };

  /**
   * v2 (user request): this heal is the one AIMED at a downed ally by a single-target healing skill or consumable
   * (DD.Targeting marks it: the running skill's ctx.reviveTarget), so it gets the ally back up. Area heals, regen,
   * lifesteal, passives and round-end heals never aim at anyone downed (status heals never count).
   */
  function aimedRevive(target, opts) {
    if (!target || target.dead || !target.downed || target.kind !== 'hero' || opts.cause === 'status') return false;
    const sk = Act.currentSkill();
    return !!(sk && sk.extra && sk.extra.reviveTarget === target);
  }

  /**
   * Heal (not downed/dead units). opts: silent, cause. The source's item heal bonus applies, then the target's
   * modifyHeal(h) hooks (h = { unit, src, base, amount, cause, cancel, revive }: incoming healing). Returns HP healed.
   * v2: a heal aimed at a downed ally (aimedRevive) gets it back on its feet with the healed amount as HP (at least 1, at
   * most its max HP; 0 AP, it acts on its own slot) — a normal revive (Act.revive: log, FX, narration, bark); a
   * cancelled heal (modifyHeal) does not revive.
   */
  Act.heal = function (src, target, amount, opts) {
    opts = opts || {};
    const reviving = aimedRevive(target, opts);
    if (!active(target) && !reviving) return 0;
    amount = Number(amount);
    if (!isFinite(amount) || amount <= 0) return 0;
    const base = amount;
    const bonus = src && opts.cause !== 'status' ? Number(src.healBonus) : 0;
    if (bonus && isFinite(bonus)) amount = Math.max(0, amount * (1 + bonus));
    // [phase 4, passives-table request] incoming-heal modifiers (no second heal needed for "+N% healing received")
    const h = { unit: target, src: src || null, base: base, amount: amount, cause: opts.cause || null, cancel: false, revive: reviving };
    DD.Hooks.fire('modifyHeal', target, h);
    if (h.cancel) return 0;
    amount = Number(h.amount);
    if (!isFinite(amount) || amount <= 0) return 0;
    if (reviving) {
      if (!target.downed || target.dead) return 0;
      const hp = U.clamp(Math.round(amount), 1, target.maxHp);
      if (!Act.revive(target, null, { hp: hp, by: src })) return 0;
      const st = statOf(src);
      if (st) st.heals += hp;
      DD.Hooks.fire('onHealed', target, target, hp, src || null);
      return hp;
    }
    const healed = Math.max(0, Math.min(target.maxHp - target.hp, Math.round(amount)));
    target.hp += healed;
    bump();
    if (healed > 0) {
      FX().heal(target, healed);
      FX().sound('heal');
      if (!opts.silent) Act.log(target.name + ' heals ' + healed + ' HP' + (src && src !== target ? ' (' + src.name + ')' : '') + '.', 'heal');
      const st = statOf(src);
      if (st) st.heals += healed;
    }
    DD.Hooks.fire('onHealed', target, target, healed, src || null);
    return healed;
  };

  Act.addBlock = function (target, n) {
    if (!active(target)) return 0;
    n = Math.round(n || 0);
    if (n <= 0) return 0;
    target.block = (target.block || 0) + n;
    bump();
    FX().block(target, n);
    return n;
  };

  // ---- deaths, downs, revives (§6.5, §6.8) ------------------------------------------------------
  /**
   * 0 HP: heroes go down, everything else dies, unless a source's preventDeath(unit, d) returns true (renewing
   * bosses, last stands): then nothing of a death happens (no bark, log, loot, Hype, onKill...) and the unit keeps
   * the HP the hook gave it (else 1 after damage, its HP before an instant kill). [phase 4, bosses-act2 request]
   * Returns false when the death was refused.
   */
  function zeroHp(target, d) {
    if (DD.Hooks.some('preventDeath', target, target, d)) {
      d.killed = false;
      d.prevented = true;
      bump();
      return false;
    }
    if (target.kind === 'hero') down(target, d); else die(target, d);
    return true;
  }

  function enemyLoot(target) {
    const s = S();
    if (!s || target.side !== 'enemy' || target.kind === 'summon' || target.fled) return;
    const def = defOf(target);
    if (!def) return;
    s.stats.xp = (s.stats.xp || 0) + (def.xp || 0);
    const g = def.gold;
    let gold = 0;
    if (Array.isArray(g)) gold = quietly(function () { return s.rng.int(g[0] || 0, g[1] === undefined ? g[0] || 0 : g[1]); });
    else if (typeof g === 'number') gold = g;
    s.stats.gold = (s.stats.gold || 0) + gold;
  }

  function die(target, d) {
    const s = S();
    if (target.dead) return;
    if (target.side === 'enemy') Act.bark(target, 'death');
    target.dead = true;
    target.hp = 0;
    target.block = 0;
    // its pending wind-ups die with it (ARCHITECTURE §5.6: 'windup:cancel' like any interrupt, reason 'death')
    const hadWindups = !!(target.intents && target.intents.length);
    target.intents = [];
    if (hadWindups) emit('windup:cancel', { unit: target, unitId: target.id, reason: 'death' });
    bump();
    FX().death(target, { cause: d.cause });
    FX().sound(d.cause === 'fall' ? 'fall' : 'death');
    if (d.text) FX().text(target, d.text, { color: '#ffdf6b', size: 22 });
    const killer = d.credit && d.credit !== target ? d.credit : null;
    Act.log(target.name + (d.cause === 'fall' ? ' is YEETED into oblivion!' : ' is defeated!') + (killer ? ' (' + killer.name + ')' : ''), 'kill');
    if (killer) { const st = statOf(killer); if (st) st.kills++; }
    enemyLoot(target);
    DD.Hooks.fire('onDeath', target, target, d);
    if (killer) DD.Hooks.fire('onKill', killer, d);
    const all = s.units.slice();
    for (let i = 0; i < all.length; i++) {
      const f = all[i];
      if (f !== target && active(f) && f.side === target.side) DD.Hooks.fire('onAllyDeath', f, f, target);
    }
    // [phase 4, hero-corelos request] onAnyDeath(unit, dead, d) on every active unit's own sources, and each rule once
    for (let i = 0; i < all.length; i++) if (all[i] !== target && active(all[i])) DD.Hooks.fireOwn('onAnyDeath', all[i], all[i], target, d);
    DD.Hooks.fireRules('onAnyDeath', null, target, d);
    if (killer && killer.side === 'hero' && target.side === 'enemy') {
      if (HY().eliteKill > 0 && target.tier === 'elite') Act.gainHype(HY().eliteKill, 'elite kill');   // [balance]
      if (ENV_KILL_CAUSE[d.cause]) {
        s.stats.envKills = (s.stats.envKills || 0) + 1;
        Act.gainHype(HY().envKill, 'environmental kill');
        Act.narrate('env_kill', { hero: killer.name, enemy: target.name });
      } else {
        Act.gainHype(HY().kill, 'kill');
        if (d.overkill >= 10) Act.narrate('overkill', { hero: killer.name, enemy: target.name, n: d.overkill });
        else if (cosmeticRng().next() < 0.3) Act.narrate('kill', { hero: killer.name, enemy: target.name });
      }
      if (killer.kind === 'hero') Act.maybeBark(killer, 'kill', 0.4);
      const sk = Act.currentSkill();
      if (sk && sk.user === killer) sk.kills++;
    }
    emit('unit:died', { unitId: target.id, unit: target, killerId: killer ? killer.id : null, cause: d.cause });
    if (DD.Combat && DD.Combat.checkEnd) DD.Combat.checkEnd();
  }

  function down(target, d) {
    const s = S();
    if (target.downed || target.dead) return;
    target.downed = true;
    target.hp = 0;
    target.block = 0;
    target.ap = 0;
    target.statuses = [];
    bump();
    FX().downed(target);
    FX().sound('downed');
    Act.log(target.name + ' is down!', 'kill');
    Act.narrate('hero_downed', { hero: target.name, enemy: d.credit ? d.credit.name : 'gravity' });
    s.stats.downs = (s.stats.downs || 0) + 1;
    Act.bark(target, 'downed');
    const allies = s.units.filter(function (u) { return u.kind === 'hero' && active(u) && u !== target; });
    if (allies.length) Act.maybeBark(allies[Math.floor(cosmeticRng().next() * allies.length)], 'ally_down', 0.6);
    DD.Hooks.fire('onDowned', target, target, d);
    // [phase 4, passives-table request] onAllyDowned(unit, downed, d): heroes are downed, not killed (no onAllyDeath)
    const side = s.units.slice();
    for (let i = 0; i < side.length; i++) {
      const f = side[i];
      if (f !== target && active(f) && f.side === target.side) DD.Hooks.fire('onAllyDowned', f, f, target, d);
    }
    emit('unit:downed', { unitId: target.id, unit: target });
    if (DD.Combat && DD.Combat.checkEnd) DD.Combat.checkEnd();
  }

  /** Instant death (heroes are downed instead). opts: cause, text (e.g. 'YEET!'), force (ignore invulnerable). */
  Act.kill = function (target, src, opts) {
    opts = opts || {};
    if (!target || target.dead || target.downed) return false;
    if (has(target, 'invulnerable') && !opts.force) { FX().text(target, 'Invulnerable!', { color: '#ffffff' }); return false; }
    const d = { source: src || null, target: target, base: target.hp, amount: target.hp, mult: 1, flat: 0, element: opts.element || null,
      skill: null, tags: opts.tags || [], cause: opts.cause || 'other', dealt: target.hp, blocked: 0, killed: true, overkill: 0,
      credit: src || currentCredit(), text: opts.text || null };
    const hp0 = target.hp;
    target.hp = 0;
    if (!zeroHp(target, d)) { if (!target.dead && !target.downed && !(target.hp > 0)) target.hp = Math.max(1, hp0); return false; }
    const st = statOf(d.credit);
    if (st) st.dmg += hp0;
    return true;
  };

  /**
   * Revive a downed hero at a fraction of max HP (min 1), or exactly opts.hp (1..max HP). It has 0 AP and acts on its
   * own initiative slot (one already passed this round: next round).
   */
  Act.revive = function (target, hpFraction, opts) {
    opts = opts || {};
    if (!target || target.dead || !target.downed) return false;
    let frac = Number(hpFraction === undefined || hpFraction === null ? 0.25 : hpFraction);
    if (!isFinite(frac)) frac = 0.25;
    const exact = Number(opts.hp);
    target.downed = false;
    target.hp = U.clamp(Math.round(opts.hp !== undefined && isFinite(exact) ? exact : target.maxHp * frac), 1, target.maxHp);
    target.ap = 0;
    bump();
    FX().revive(target);
    FX().sound('heal');
    // [requests verify] no pronoun after a hero's name (every hero has their own; narrator.js convention)
    Act.log(target.name + ' is back up (' + target.hp + ' HP)' + (opts.by && opts.by !== target ? ', thanks to ' + opts.by.name : '') + '.', 'heal');
    Act.narrate('hero_revived', { hero: target.name });
    Act.bark(target, 'revive');
    return true;
  };

  // ---- tile entry (traps, terrain, surfaces, hooks) ----------------------------------------------
  /**
   * A tile callback. It counts as a side effect (the move can't be undone) only if it changed something: through
   * DD.Act (every Act mutation counts), DD.Act.touch(), or a roll of the combat RNG. A no-op (Loose Marbles under a
   * hero, a rune under its owner) keeps Undo. [phase 4, hero-marbles request]
   */
  function tileCall(label, fn, self, args) {
    const s = S();
    const r0 = s && s.rng ? s.rng.getState() : null;
    DD.safe(label, fn, self, args);
    if (s && s.rng && r0 !== null && s.rng.getState() !== r0) bump();
  }
  /**
   * Fire everything that happens when a unit enters a tile. cause 'move'|'push'|'teleport'|'spawn'. Flyers (v2) feel
   * nothing of the floor: no terrain onEnter, no ground objects / traps / plates, only airborne surfaces (clouds).
   * onEnterTile hooks still fire (content that implements a floor effect there checks DD.Grid.feelsFloor).
   */
  function enterTile(unit, tile, cause) {
    if (!tile || !active(unit)) return;
    const floor = G().feelsFloor(unit);
    if (cause !== 'spawn') {
      if (floor) {
        const td = G().terrain(tile);
        if (typeof td.onEnter === 'function') tileCall('terrain ' + td.id + ' onEnter', td.onEnter, td, [unit, tile, cause]);
        if (!active(unit)) return;
      }
      if (tile.surface) {
        const sd = DD.getSurface(tile.surface.id);
        if (sd && typeof sd.onEnter === 'function' && G().feelsSurface(unit, sd)) tileCall('surface ' + sd.id + ' onEnter', sd.onEnter, sd, [unit, tile]);
        if (!active(unit)) return;
      }
      const o = tile.obj;
      if (o && floor && !G().objBlocksMove(o)) {
        const od = DD.getObject(o.id);
        const fn = typeof o.onEnter === 'function' ? o.onEnter : od && od.onEnter;
        if (typeof fn === 'function') tileCall('object ' + o.id + ' onEnter', fn, o, [unit, o, tile]);
        if (!active(unit)) return;
      }
    }
    DD.Hooks.fire('onEnterTile', unit, unit, tile, cause);
  }
  Act.enterTile = enterTile;

  // units told to stop walking (Act.stopMove), checked by moveAlong after each tile; WeakSet: sim copies differ
  const stopping = new WeakSet();
  /**
   * End the unit's current walk on the tile it just entered, without a status (a slip, a snare): call it from a tile
   * callback or an onEnterTile hook. [phase 4, hero-marbles request]
   */
  Act.stopMove = function (unit) { if (active(unit)) { stopping.add(unit); bump(); } };

  function face(unit, to) {
    if (!unit || !to) return;
    const sdx = (to.x - to.y) - (unit.x - unit.y);
    if (sdx > 0) unit.facing = 1; else if (sdx < 0) unit.facing = -1;
    const d = U.dirTo(unit, to);
    if (d.x || d.y) unit.lastDir = d;
  }
  Act.face = face;

  /** Safe spot to climb out to: nearest free non-drop tile, preferring tiles without hazards. */
  function safeSpot(x, y, unit) {
    const g = S().grid;
    const maxR = g.w + g.h;
    for (let r = 1; r <= maxR; r++) {
      const ring = G().emptyTilesRing(x, y, r, unit);
      if (!ring.length) continue;
      for (let i = 0; i < ring.length; i++) if (!G().hazardAt(ring[i].x, ring[i].y, unit)) return ring[i];
      return ring[0];
    }
    return null;
  }
  Act.safeSpot = safeSpot;

  /** A ground unit lands on a pit / deep water: non-boss enemies & summons die, heroes & bosses climb out hurt. */
  function fall(unit, src) {
    const tile = G().tile(unit.x, unit.y);
    const deep = tile && G().terrain(tile).liquid === 'deep';
    if (deep) { Act.removeStatus(unit, 'burn', { silent: true }); }
    if (unit.kind === 'hero' || isBoss(unit)) {
      const spot = safeSpot(unit.x, unit.y, unit);
      const from = { x: unit.x, y: unit.y };
      if (spot) { unit.x = spot.x; unit.y = spot.y; FX().jump(unit, from, spot); }
      FX().text(unit, deep ? 'Glub glub!' : 'Ow, my everything!', { color: '#ffd0a0', size: 15 });
      Act.log(unit.name + (deep ? ' sinks, then splutters out.' : ' falls into the pit and climbs out.'), 'dmg');
      Act.damage(src || null, unit, Math.max(1, Math.ceil(unit.maxHp * 0.25)), { cause: 'fall', ignoreBlock: true, ignoreArmor: true });
      if (deep && active(unit)) Act.addStatus(unit, 'wet', { turns: 2 }, null);
      return false;
    }
    FX().sound('fall');
    if (Act.kill(unit, src || null, { cause: 'fall', text: deep ? 'SPLOOSH!' : 'YEET!', force: true })) return true;
    // the death was refused (preventDeath): it still can't stay in the pit, so it climbs out like a hero would
    if (active(unit) && G().isDrop(unit.x, unit.y)) {
      const spot = safeSpot(unit.x, unit.y, unit);
      if (spot) { const from = { x: unit.x, y: unit.y }; unit.x = spot.x; unit.y = spot.y; FX().jump(unit, from, spot); }
    }
    return false;
  }
  Act.fall = function (unit, src) { if (!active(unit)) return false; bump(); return Act.withCredit(src, function () { return fall(unit, src); }); };

  function isImmovable(u) {
    return !!(u.flags && u.flags.immovable) || !!u.downed;
  }
  Act.isImmovable = isImmovable;

  function slippery(u) {
    if (G().isFlying(u)) return false;
    const t = G().tile(u.x, u.y);
    if (!t) return false;
    if (G().terrain(t).slide) return true;
    const sd = t.surface ? DD.getSurface(t.surface.id) : null;
    return !!(sd && sd.slide);
  }

  /** What stops a step of forced movement from (unit.x, unit.y) to (nx, ny): null | { kind, unit } */
  function stepBlocker(unit, nx, ny) {
    if (!G().inBounds(nx, ny)) return { kind: 'edge' };
    const t = G().tile(nx, ny);
    if (t.obj && G().objBlocksMove(t.obj)) return { kind: 'object' };
    const other = G().unitAt(nx, ny);
    if (other) return { kind: 'unit', unit: other };
    const td = G().terrain(t);
    const fly = G().isFlying(unit);
    if (!fly && td.walkable === false && !td.pit && td.liquid !== 'deep') return { kind: 'wall' };
    if (fly && td.walkable === false && !td.pit && !td.liquid) return { kind: 'wall' };
    if (!td.pit && td.liquid !== 'deep' && !G().canStep(unit, { x: unit.x, y: unit.y }, { x: nx, y: ny })) return { kind: 'height' };
    return null;
  }

  /**
   * Push step by step (§6.6). opts: bump (default 3), stopAt {x,y} (pull: soft stop), slide (default true).
   * Returns { moved, blockedBy, fell, to, hitUnit }.
   */
  Act.push = function (src, target, dir, dist, opts) {
    opts = opts || {};
    const res = { moved: 0, blockedBy: null, fell: false, to: target ? { x: target.x, y: target.y } : null, hitUnit: null };
    if (!active(target) || !dir || (!dir.x && !dir.y) || !(dist > 0)) return res;
    dir = { x: U.sign(dir.x), y: dir.x ? 0 : U.sign(dir.y) };
    if (isImmovable(target)) {
      FX().text(target, 'Immovable!', { color: '#dddddd', size: 15 });
      Act.log(target.name + ' refuses to budge.', 'system');
      return res;
    }
    // [core fix, hero-marwyn] content hook modifyPush(p), p = { unit, src, dir, dist, cancel }: shorten or cancel
    // forced movement on the target (Marwyn's pushes and pulls are 1 tile shorter). docs/notes/hero-marwyn.md
    // [phase 4, items request] modifyOutgoingPush(p) first, on the pusher's sources ("your pushes go 1 tile further")
    const pm = { unit: target, src: src || null, dir: dir, dist: Math.floor(dist), cancel: false };
    if (src && src !== target) DD.Hooks.fire('modifyOutgoingPush', src, pm);
    if (!pm.cancel) DD.Hooks.fire('modifyPush', target, pm);
    if (pm.cancel || !(pm.dist > 0)) return res;
    dist = Math.floor(pm.dist);
    const bumpDmg = opts.bump === undefined ? 3 : opts.bump;
    Act.withCredit(src, function () {
      let remaining = Math.floor(dist);
      let slid = false;
      while (remaining > 0 && active(target)) {
        const nx = target.x + dir.x, ny = target.y + dir.y;
        if (opts.stopAt && nx === opts.stopAt.x && ny === opts.stopAt.y) break;
        const b = stepBlocker(target, nx, ny);
        if (b) {
          res.blockedBy = b.kind;
          res.hitUnit = b.unit || null;
          bumpInto(src, target, nx, ny, b, bumpDmg);
          break;
        }
        const from = { x: target.x, y: target.y };
        target.x = nx; target.y = ny;
        res.moved++;
        bump();
        FX().slide(target, from, { x: nx, y: ny }, { ms: 120 });
        if (!G().isFlying(target) && G().isDrop(nx, ny)) { res.fell = true; fall(target, src); break; }
        enterTile(target, G().tile(nx, ny), 'push');
        remaining--;
        if (remaining === 0 && !slid && opts.slide !== false && active(target) && slippery(target)) {
          remaining = 1; slid = true;
          FX().text(target, 'Wheee!', { color: '#bfefff', size: 13 });
        }
      }
      if (res.moved > 0 && active(target)) Act.bleedTick(target);
    });
    res.to = { x: target.x, y: target.y };
    if (res.moved > 0) FX().sound('push');
    return res;
  };

  function bumpInto(src, target, nx, ny, b, dmg) {
    FX().lunge(target, { x: nx, y: ny }, { ms: 110 });
    FX().sound('bump');
    if (dmg <= 0) return;
    FX().text(target, 'BONK!', { color: '#ffe08a', size: 16 });
    Act.damage(src, target, dmg, { cause: 'bump', tags: ['bump'] });
    if (b.kind === 'unit' && active(b.unit)) Act.damage(src, b.unit, dmg, { cause: 'bump', tags: ['bump'] });
    if (b.kind === 'object') Act.damageObject(src, nx, ny, dmg);
  }

  /** Pull toward a point (stops before reaching it). */
  Act.pull = function (src, target, toward, dist, opts) {
    if (!active(target) || !toward) return { moved: 0, blockedBy: null, fell: false, to: target ? { x: target.x, y: target.y } : null };
    const dx = toward.x - target.x, dy = toward.y - target.y;
    const dir = U.dirTo(target, toward);
    if (!dir.x && !dir.y) return { moved: 0, blockedBy: null, fell: false, to: { x: target.x, y: target.y } };
    const aligned = dx === 0 || dy === 0;
    const along = aligned ? Math.abs(dx + dy) - 1 : Math.abs(dir.x ? dx : dy);
    const n = Math.max(0, Math.min(dist, along));
    return Act.push(src, target, dir, n, Object.assign({ stopAt: { x: toward.x, y: toward.y } }, opts || {}));
  };

  /** Push away from the source. */
  Act.knockback = function (src, target, dist, opts) {
    if (!src || !active(target)) return { moved: 0, blockedBy: null, fell: false, to: null };
    return Act.push(src, target, U.dirTo(src, target), dist, opts);
  };

  /** Teleport to a free tile. opts: noEnter (skip tile effects), fx: false. */
  Act.teleport = function (target, x, y, opts) {
    opts = opts || {};
    if (!active(target) && !(target && target.downed && opts.allowDowned)) return false;
    if (target.x === x && target.y === y) return true;
    if (!G().isFree(x, y, target)) return false;
    const from = { x: target.x, y: target.y };
    face(target, { x: x, y: y });
    target.x = x; target.y = y;
    bump();
    if (opts.fx !== false) FX().teleport(target, from, { x: x, y: y });
    if (!opts.noEnter) enterTile(target, G().tile(x, y), 'teleport');
    return true;
  };

  /**
   * Swap two units' positions (fails if either is immovable). A grounded unit swapped onto a pit / deep water
   * (where a flyer was hovering) falls in. opts: force (ignore immovable), noEnter (no tile effects), src (credit).
   */
  Act.swap = function (a, b, opts) {
    opts = opts || {};
    if (!a || !b || a.dead || b.dead || a === b) return false;
    if (!opts.force && (isImmovable(a) || isImmovable(b))) return false;
    const pa = { x: a.x, y: a.y }, pb = { x: b.x, y: b.y };
    a.x = pb.x; a.y = pb.y; b.x = pa.x; b.y = pa.y;
    bump();
    FX().teleport(a, pa, pb);
    FX().teleport(b, pb, pa, { parallel: true });
    if (opts.noEnter) return true;
    Act.withCredit(opts.src || null, function () {
      [a, b].forEach(function (u) {
        if (!active(u)) return;
        if (!G().isFlying(u) && G().isDrop(u.x, u.y)) fall(u, opts.src || currentCredit());
        else enterTile(u, G().tile(u.x, u.y), 'teleport');
      });
    });
    return true;
  };

  // ---- attacks of opportunity (v2, DESIGN §4.2, ARCHITECTURE §6.2) -----------------------------------------
  // A MOVE action (DD.Combat.move, an AI walk) that leaves a tile next to an opposing unit with a melee basic attack
  // lets that unit make one free basic attack on the mover (once per round per attacker). Pushes, pulls, teleports,
  // swaps, jumps and skill dashes (moveAlong without opts.provoke) never provoke.
  const OPP_UNIT_FILTERS = { enemy: 1, any: 1, notSelf: 1 };
  const OPP_TILE_FILTERS = { any: 1, enemy: 1, emptyOrUnit: 1, notSelf: 1 };

  /**
   * A melee damaging skill def for this slot (target 'unit' / 'tile' / 'dir' at range 1 that hits foes), or null. Never
   * a 'ranged'-tagged one (a slingshot, an eye beam), and an area attack (a cone breath, a beam) only if tagged 'melee'
   * ('dir' skills always read as range 1, so a dragon's breath would otherwise be its free "basic attack").
   */
  function meleeDef(u, sl) {
    const def = sl && DD.getSkill(sl.id);
    if (!def || typeof def.execute !== 'function') return null;
    const L = DD.skillLevel(def, sl.level || 1);
    if (!L || !(L.dmg > 0)) return null;
    const tags = def.tags || [];
    if (tags.indexOf('ranged') >= 0) return null;
    if (def.area && def.area.shape && def.area.shape !== 'single' && tags.indexOf('melee') < 0) return null;
    const tg = def.target || {};
    const type = tg.type || 'unit';
    if (type === 'unit' ? !OPP_UNIT_FILTERS[tg.filter || 'enemy'] : type === 'tile' ? !OPP_TILE_FILTERS[tg.filter || 'any'] : type !== 'dir') return null;
    const rg = DD.Targeting.range(u, def, sl.level || 1);
    return rg[1] === 1 && rg[0] <= 1 ? def : null;
  }
  /** The slot is usable for a free attack now: off cooldown, charges left, no silenced spell, its canUse agrees. */
  function slotReady(u, sl, def) {
    if ((sl.cd || 0) > 0) return false;
    if (def.charges > 0 && (sl.uses || 0) >= def.charges) return false;
    if (def.kind === 'spell' && has(u, 'silenced')) return false;
    if (typeof def.canUse === 'function') {
      const ok = DD.Targeting.pure(function () { return DD.safe('canUse of ' + def.id, def.canUse, def, [DD.Targeting.buildCtx(u, sl, null)]); });
      if (ok === false || typeof ok === 'string') return false;
    }
    return true;
  }
  /**
   * The skill slot a unit makes attacks of opportunity with, or null: a hero's basic attack if it is melee (max range
   * 1); summons and enemies: their first ready melee damaging skill. The attack is free (no AP, HP, cooldown or charge).
   */
  function opportunitySlot(u) {
    if (!u) return null;
    if (u.kind === 'hero') { const d = u.basic && meleeDef(u, u.basic); return d && slotReady(u, u.basic, d) ? u.basic : null; }
    const slots = slotsOf(u);
    for (let i = 0; i < slots.length; i++) {
      const def = meleeDef(u, slots[i]);
      if (def && slotReady(u, slots[i], def)) return slots[i];
    }
    return null;
  }
  Act.opportunitySlot = opportunitySlot;

  /**
   * Run fn with the unit virtually standing on p (queries about a path it has not walked yet; always restored), on top
   * of a friend it would pass there (Grid.onTop: canTarget / hooks see the mover, not the friend).
   */
  function standing(u, p, fn) {
    if (!p || (u.x === p.x && u.y === p.y)) return G().onTop(u, fn);
    const ox = u.x, oy = u.y;
    u.x = p.x; u.y = p.y;
    try { return G().onTop(u, fn); } finally { u.x = ox; u.y = oy; }
  }

  /**
   * Would `attacker` make an attack of opportunity on `mover` leaving tile `from` (default: where it stands) toward
   * `to`? → o = { attacker, mover, from, to, slot, skill, level, flat, mult, cancel } or null. Pure (a query: the HUD
   * and the AI call it for paths not walked yet). Rules: both active, the attacker hostile to the mover and next to
   * `from`, not stunned / asleep / frozen (any stun-like) / sheep, not Dazzled / Confused (AI units), not taunted by
   * someone else (AI units), its attack of opportunity of this round unused, a ready melee skill (opportunitySlot) that
   * can target the mover there; the mover not stealthed / untargetable; flags.noOpportunity (attacker) /
   * flags.noProvoke (mover) opt out; then modifyOpportunity(o) on the attacker's sources and the mover's (cancel, flat,
   * mult — keep those hooks pure; the fight's rules count once, with the attacker's). A charmed enemy fighting for the
   * heroes is on their side (no heroes strike it).
   */
  function opportunityOf(attacker, mover, from, to) {
    const s = S();
    if (!s || s.result || !s.order || s.phase === 'deploy' || !active(attacker) || !active(mover) || attacker === mover) return null;
    const p = from ? { x: from.x, y: from.y } : { x: mover.x, y: mover.y };
    if (Math.abs(attacker.x - p.x) + Math.abs(attacker.y - p.y) !== 1) return null;
    if (attacker.oppRound === s.round) return null;
    const af = attacker.flags || {}, mf = mover.flags || {};
    if (af.noOpportunity || mf.noProvoke || mf.untargetable) return null;
    if (!G().hostile(attacker, mover) || has(mover, 'stealth')) return null;
    // an enemy charmed to fight for the heroes is on their side: they don't stab their new friend in the back
    if (G().effectiveSide(attacker) === G().effectiveSide(mover)) return null;
    if (stunnedNow(attacker) || has(attacker, 'sheep')) return null;
    const charm = getStatus(attacker, 'charmed');
    if (charm && charm.source === mover.id && attacker.side === 'hero') return null;   // it can't hurt its charmer anyway
    if (!(DD.Combat.isPlayerControlled && DD.Combat.isPlayerControlled(attacker))) {
      if (has(attacker, 'dazzled') || has(attacker, 'confused')) return null;
      const t = DD.AI && DD.AI.taunter ? DD.AI.taunter(attacker) : null;
      if (t && t !== mover && G().hostile(attacker, t)) return null;
    }
    const sl = opportunitySlot(attacker);
    if (!sl) return null;
    const def = DD.getSkill(sl.id);
    const tg = def.target || {};
    if (typeof tg.canTarget === 'function') {
      const ok = standing(mover, p, function () {
        return DD.Targeting.pure(function () { return DD.safe('canTarget of ' + def.id, tg.canTarget, def, [DD.Targeting.buildCtx(attacker, sl, p)]); });
      });
      if (ok !== true) return null;
    }
    const o = { attacker: attacker, mover: mover, from: p, to: to ? { x: to.x, y: to.y } : null, slot: sl, skill: def, level: sl.level || 1,
      flat: 0, mult: 1, cancel: false };
    // the attacker's sources (with the fight's rules), then the mover's own (a rule must not count twice)
    standing(mover, p, function () {
      DD.Hooks.fire('modifyOpportunity', attacker, o);
      if (!o.cancel) DD.Hooks.fireOwn('modifyOpportunity', mover, o);
    });
    return o.cancel ? null : o;
  }
  Act.opportunityOf = opportunityOf;

  /**
   * The units that would make an attack of opportunity on `mover` walking `path` (excluding the start; from: the start,
   * default its tile): each attacker once, in the order they would strike. Pure.
   */
  Act.provokers = function (mover, path, from) {
    const out = [];
    const s = S();
    if (!s || !active(mover) || !path || !path.length) return out;
    let p = from ? { x: from.x, y: from.y } : { x: mover.x, y: mover.y };
    const seen = {};
    for (let i = 0; i < path.length; i++) {
      for (let k = 0; k < s.units.length; k++) {
        const a = s.units[k];
        if (seen[a.id] || a.dead || Math.abs(a.x - p.x) + Math.abs(a.y - p.y) !== 1) continue;
        if (opportunityOf(a, mover, p, path[i])) { seen[a.id] = 1; out.push(a); }
      }
      p = path[i];
    }
    return out;
  };

  /**
   * The attack of opportunity itself (mover still on the tile it leaves): re-checks opportunityOf, marks the attacker's
   * reaction used for this round, then resolves its opportunity skill on the mover's tile only (ctx.opportunity = o, no
   * cost, no cooldown; its damage carries d.opportunity and o.flat / o.mult; Empowered is neither used nor consumed).
   * Log, FX, event 'opportunity:attack', then onOpportunityAttack(o) on the attacker's and the mover's sources
   * (rules once; o.dealt = HP + Block the mover lost). It is aimed at the mover even while it shares a friend's tile
   * (Grid.onTop). Returns o or null.
   */
  function opportunityAttack(attacker, mover, to) {
    const o = opportunityOf(attacker, mover, null, to);
    if (!o) return null;
    const s = S();
    attacker.oppRound = s.round;
    bump();
    const tile = { x: mover.x, y: mover.y };
    const before = mover.hp + (mover.block || 0);
    FX().text(attacker, '⚔️ Attack of opportunity!', { color: '#ffd27a', size: 15 });
    Act.log(attacker.name + ' gets an attack of opportunity on ' + mover.name + ' (' + o.skill.name + ')!', attacker.side === 'hero' ? 'hero' : 'enemy');
    emit('opportunity:attack', { attacker: attacker, attackerId: attacker.id, mover: mover, moverId: mover.id, skillId: o.skill.id, from: o.from, to: o.to });
    // the mover may be passing through a friend: on its tile it is the one on top (the strike is aimed at the mover)
    G().onTop(mover, function () {
      DD.Combat.resolveSkill(attacker, o.slot, tile, { quiet: true, extra: { opportunity: o, tiles: [tile] } });
    });
    o.dealt = Math.max(0, before - ((mover.dead ? 0 : mover.hp) + (mover.dead ? 0 : mover.block || 0)));
    DD.Hooks.fire('onOpportunityAttack', attacker, o);
    DD.Hooks.fireOwn('onOpportunityAttack', mover, o);
    return o;
  }
  Act.opportunityAttack = opportunityAttack;

  /**
   * Every attack of opportunity provoked by the mover leaving its tile toward `to` (each adjacent attacker in unit
   * order; stops once the mover is down, stunned-like, held / rooted, moved or told to stop). Returns how many struck.
   */
  function provokeLeaving(unit, to) {
    const s = S();
    const x0 = unit.x, y0 = unit.y;
    let n = 0;
    const list = s.units.slice();
    for (let k = 0; k < list.length; k++) {
      const a = list[k];
      if (a.dead || a === unit || Math.abs(a.x - x0) + Math.abs(a.y - y0) !== 1) continue;
      if (opportunityAttack(a, unit, to)) n++;
      if (s.result || !active(unit) || unit.x !== x0 || unit.y !== y0 || stunnedNow(unit) || cantMove(unit) || stopping.has(unit)) break;
    }
    return n;
  }

  /**
   * Walk along a path (excluding start) one tile at a time, firing tile effects. Stops if the unit dies, is
   * rooted, or the way is blocked; never ends sharing a tile. opts: action (default true: counts as a move
   * action for Bleed), cause ('move'), provoke (a MOVE action: leaving a tile next to opposing units triggers their
   * attacks of opportunity; an attack that downs, stuns, roots, moves or stops the walker ends the walk there).
   * Returns the tiles actually walked (array; .provoked = attacks of opportunity made, .interrupted = one ended it).
   */
  Act.moveAlong = function (unit, path, opts) {
    opts = opts || {};
    const walked = [];
    walked.provoked = 0;
    walked.interrupted = false;
    if (!active(unit) || !path || !path.length) return walked;
    stopping.delete(unit);
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (!G().isWalkable(p.x, p.y, unit)) break;
      let occ = G().unitAt(p.x, p.y);
      if (occ && occ !== unit && (G().hostile(unit, occ) || i === path.length - 1)) break;
      if (opts.provoke) {
        const x0 = unit.x, y0 = unit.y;
        const n = provokeLeaving(unit, p);
        if (n) {
          walked.provoked += n;
          const s = S();
          if (s.result || !active(unit) || unit.x !== x0 || unit.y !== y0 || stunnedNow(unit) || cantMove(unit) || stopping.has(unit)) {
            walked.interrupted = true;
            if (active(unit) && !s.result) FX().text(unit, 'Stopped!', { color: '#ffb36b', size: 14 });
            break;
          }
          // the attack may have changed the way ahead
          if (!G().isWalkable(p.x, p.y, unit)) break;
          occ = G().unitAt(p.x, p.y);
          if (occ && occ !== unit && (G().hostile(unit, occ) || i === path.length - 1)) break;
        }
      }
      face(unit, p);
      const from = { x: unit.x, y: unit.y };
      unit.x = p.x; unit.y = p.y;
      walked.push({ x: p.x, y: p.y });
      FX().move(unit, [{ x: p.x, y: p.y }], { from: from });
      enterTile(unit, G().tile(p.x, p.y), opts.cause || 'move');
      if (!active(unit)) break;
      if (stopping.has(unit)) { stopping.delete(unit); break; }
      if (i < path.length - 1) {
        // a trap that roots (or holds) or stuns stops the walk right there
        if (cantMove(unit)) { FX().text(unit, 'Stuck!', { color: '#9fdc7a', size: 14 }); break; }
        if (stunnedNow(unit)) break;
      }
    }
    stopping.delete(unit);
    // never end inside another unit (e.g. rooted while passing through a friend, or downed there by an attack of
    // opportunity: the body is moved off the friend's tile too)
    if (!unit.dead && unitsOn(unit.x, unit.y) > 1) {
      const spot = G().nearestFree(unit.x, unit.y, unit);
      if (spot) { const from = { x: unit.x, y: unit.y }; unit.x = spot.x; unit.y = spot.y; FX().slide(unit, from, spot); }
    }
    if (walked.length) {
      DD.Hooks.fire('onMove', unit, unit, walked);
      if (opts.action !== false && active(unit)) Act.bleedTick(unit);
    }
    return walked;
  };
  function unitsOn(x, y) {
    const s = S();
    let n = 0;
    for (let i = 0; i < s.units.length; i++) { const u = s.units[i]; if (!u.dead && u.x === x && u.y === y) n++; }
    return n;
  }

  // ---- surfaces & elements (§6.6; reaction table lives in js/data/terrain.js) ----------------------
  const CREATES = { water: 'water', poison: 'poison', blood: 'blood', oil: 'oil', holy: 'holy', web: 'web', smoke: 'smoke', cheeto: 'cheeto', steam: 'steam' };

  /** Set (or clear with null) a tile surface. Refused on pits/walls and where the liquid makes no sense. */
  Act.setSurface = function (x, y, id, turns) {
    const t = G().tile(x, y);
    if (!t) return false;
    if (!id) {
      if (t.surface) { t.surface = null; bump(); }
      return true;
    }
    const sd = DD.getSurface(id);
    if (!sd) { DD.warn('setSurface: unknown surface "' + id + '"'); return false; }
    const td = G().terrain(t);
    const cloud = !!sd.airborne;   // [v2 review] clouds drift over pits / lava
    if (td.pit && !cloud) return false;
    if (td.walkable === false && !td.pit && !td.liquid) return false;
    if (td.liquid === 'lava' && !cloud) return false;
    if (td.liquid === 'deep' && !cloud && ['oil', 'poison', 'blood', 'electric'].indexOf(id) < 0) return false;
    if (td.liquid === 'water' && (id === 'water' || id === 'ice')) return false;
    t.surface = { id: id, turns: turns > 0 ? turns : turns < 0 ? -1 : (sd.turns || 3), data: {} };
    bump();
    return true;
  };

  function waterBody(x, y) {
    const out = [];
    const seen = {};
    const queue = [{ x: x, y: y }];
    function wet(t) {
      if (!t) return false;
      const td = G().terrain(t);
      return td.liquid === 'water' || td.liquid === 'deep' || (t.surface && t.surface.id === 'water');
    }
    if (!wet(G().tile(x, y))) return out;
    seen[x + ',' + y] = 1;
    while (queue.length && out.length < 80) {
      const p = queue.shift();
      out.push(p);
      for (let i = 0; i < 4; i++) {
        const nx = p.x + U.DIRS[i].x, ny = p.y + U.DIRS[i].y;
        const k = nx + ',' + ny;
        if (seen[k]) continue;
        seen[k] = 1;
        if (wet(G().tile(nx, ny))) queue.push({ x: nx, y: ny });
      }
    }
    return out;
  }
  Act.waterBody = waterBody;

  /** Lightning in water: every ground unit in the connected water body takes 4 lightning damage and is stunned. */
  function shock(x, y, src) {
    const body = waterBody(x, y);
    if (!body.length) return 0;
    FX().sound('zap');
    Act.log('The water crackles with lightning!', 'dmg');
    let hit = 0;
    Act.withCredit(src, function () {
      for (let i = 0; i < body.length; i++) {
        FX().tile(body[i].x, body[i].y, 'glow', { color: '#9fd0ff', parallel: i > 0 });
        const u = G().unitAt(body[i].x, body[i].y);
        if (!active(u) || G().isFlying(u)) continue;
        hit++;
        FX().particles(u, { kind: 'zap', count: 10 });
        Act.damage(src || null, u, 4, { element: 'lightning', cause: 'surface', tags: ['shock'] });
        if (active(u)) Act.addStatus(u, 'stun', { turns: 1 }, src || null);
      }
    });
    return hit;
  }

  function igniteChain(start, fromId, r, src) {
    const tiles = [];
    const seen = {};
    const queue = [start];
    seen[start.x + ',' + start.y] = 1;
    while (queue.length && tiles.length < 100) {
      const t = queue.shift();
      tiles.push(t);
      for (let i = 0; i < 4; i++) {
        const n = G().tile(t.x + U.DIRS[i].x, t.y + U.DIRS[i].y);
        if (!n || seen[n.x + ',' + n.y]) continue;
        seen[n.x + ',' + n.y] = 1;
        if (n.surface && n.surface.id === fromId) queue.push(n);
      }
    }
    for (let i = 0; i < tiles.length; i++) {
      tiles[i].surface = { id: r.surface || 'fire', turns: r.turns || 3, data: {} };
      FX().tile(tiles[i].x, tiles[i].y, 'glow', { color: '#ff8a1a', parallel: i > 0 });
    }
    FX().sound('fire');
    Act.log(tiles.length > 1 ? 'The ' + fromId + ' goes up in a line of flames!' : 'It ignites!', 'dmg');
    // the floor burns: walkers on the slick catch fire, flyers above it don't (v2)
    for (let i = 0; i < tiles.length; i++) Act.applyElement(tiles[i].x, tiles[i].y, 'fire', src, { floor: true });
  }

  function surfaceReaction(t, sd, r, element, src) {
    if (r.shock) { shock(t.x, t.y, src); return; }
    if (r.spread) { igniteChain(t, sd.id, r, src); return; }
    if (r.surface === null) {
      t.surface = null;
      FX().tile(t.x, t.y, 'splash');
    } else if (r.surface) {
      const nd = DD.getSurface(r.surface);
      t.surface = { id: r.surface, turns: r.turns || (nd ? nd.turns : 2) || 2, data: {} };
      FX().tile(t.x, t.y, 'glow');
      if (r.surface === 'steam') FX().particles(t, { kind: 'smoke', count: 10 });
    }
  }

  function terrainReaction(t, td, r, element, src) {
    if (r.shock) { shock(t.x, t.y, src); return; }
    if (r.surface !== undefined) {
      if (r.surface === null) t.surface = null; else Act.setSurface(t.x, t.y, r.surface, r.turns);
    }
    if (r.terrain) {
      const to = td.id === 'ice' && t.melt ? t.melt : r.terrain;
      Act.setTerrain(t.x, t.y, to);
      t.melt = r.melt || null;
      if (to === 'obsidian') { FX().particles(t, { kind: 'smoke', count: 12 }); Act.log('The lava hisses and hardens into obsidian.', 'system'); }
    }
  }

  function unitReaction(u, element, src) {
    if (!active(u)) return;
    if (element === 'fire') {
      if (has(u, 'frozen')) Act.removeStatus(u, 'frozen', { text: 'Thawed!' });
      if (has(u, 'wet')) Act.removeStatus(u, 'wet', { text: 'Sizzle!' });
      else Act.addStatus(u, 'burn', { stacks: 2 }, src || null);
    } else if (element === 'frost') {
      if (has(u, 'burn')) Act.removeStatus(u, 'burn', { text: 'Cooled!' });
      if (has(u, 'wet')) { Act.removeStatus(u, 'wet', { silent: true }); Act.addStatus(u, 'frozen', { turns: 1 }, src || null); }
    } else if (element === 'water') {
      if (has(u, 'burn')) Act.removeStatus(u, 'burn', { text: 'Extinguished!' });
      Act.addStatus(u, 'wet', { turns: 2 }, src || null);
    }
  }

  /**
   * Apply an element to a tile: objects react (barrels explode), the surface reacts (oil ignites and spreads,
   * water boils to steam / freezes / conducts), a fresh surface is created for liquid-like elements, terrain
   * reacts (lava → obsidian, water → ice, ice → water) and the unit there reacts (Burn / Frozen / Wet).
   * opts.noUnits skips the unit reaction; opts.floor: the element comes from the floor (a slick going up, a spilled
   * brazier), not aimed at the tile, so a flyer there does not react (v2).
   */
  Act.applyElement = function (x, y, element, src, opts) {
    opts = opts || {};
    const t = G().tile(x, y);
    if (!t || !element) return false;
    element = ELEMENT_ALIAS[element] || element;
    bump();
    const hadSurface = !!t.surface;
    if (t.obj) {
      const od = DD.getObject(t.obj.id);
      const r = (t.obj.react && t.obj.react[element]) || (od && od.react && od.react[element]);
      if (r && r.destroy) Act.destroyObject(x, y, src);
    }
    if (t.surface) {
      const sd = DD.getSurface(t.surface.id);
      const r = sd && sd.react && sd.react[element];
      if (r) surfaceReaction(t, sd, r, element, src);
    }
    if (!hadSurface && CREATES[element]) Act.setSurface(x, y, CREATES[element]);
    const td = G().terrain(t);
    const tr = td.react && td.react[element];
    if (tr) terrainReaction(t, td, tr, element, src);
    if (!opts.noUnits) {
      const u = G().unitAt(x, y);
      if (!opts.floor || G().feelsFloor(u)) unitReaction(u, element, src);
    }
    return true;
  };

  /** Explosion: dmg to every unit within radius (friendly fire), hits objects, leaves element surfaces. */
  Act.explode = function (src, x, y, o) {
    o = o || {};
    const radius = o.radius === undefined ? 1 : o.radius;
    const dmg = o.dmg === undefined ? 8 : o.dmg;
    const element = o.element === undefined ? 'fire' : o.element;
    const tiles = G().shape('circle', { x: x, y: y }, null, radius);
    // a preview dry run records the blasts it set off (Targeting.preview's `blast` tiles: the HUD shows the area)
    if (Act.simulating && Act._sim) Array.prototype.push.apply(Act._sim.blasts || (Act._sim.blasts = []), tiles);
    FX().explosion({ x: x, y: y }, { radius: radius, color: ELEMENT_COLOR[element] || '#ff8a1a' });
    FX().sound('explosion');
    FX().shake(8, 350);
    Act.log('KABOOM!', 'dmg');
    Act.withCredit(src, function () {
      const victims = [];
      for (let i = 0; i < tiles.length; i++) { const u = G().unitAt(tiles[i].x, tiles[i].y); if (active(u)) victims.push(u); }
      for (let i = 0; i < victims.length; i++) Act.damage(src || null, victims[i], dmg, { element: element, cause: 'explosion', tags: ['explosion'] });
      for (let i = 0; i < tiles.length; i++) {
        const tt = G().tile(tiles[i].x, tiles[i].y);
        if (tt.obj) Act.damageObject(src, tt.x, tt.y, dmg);
        if (element) Act.applyElement(tt.x, tt.y, element, src, { noUnits: true });
        if (o.surface && !tt.surface) Act.setSurface(tt.x, tt.y, o.surface, o.turns || 2);
      }
    });
    return tiles;
  };

  /** Spill a surface in radius r (element reactions first); units standing there feel its onEnter. */
  Act.splash = function (x, y, r, id, turns, src) {
    const tiles = G().shape('circle', { x: x, y: y }, null, r || 0);
    Act.withCredit(src, function () {
      for (let i = 0; i < tiles.length; i++) {
        const tx = tiles[i].x, ty = tiles[i].y;
        Act.applyElement(tx, ty, id, src, { noUnits: true });
        const t = G().tile(tx, ty);
        if (t && !t.surface) Act.setSurface(tx, ty, id, turns);
        const u = G().unitAt(tx, ty);
        if (t && t.surface && t.surface.id === id && active(u)) {
          const sd = DD.getSurface(id);
          if (sd && typeof sd.onEnter === 'function' && G().feelsSurface(u, sd)) DD.safe('surface ' + id + ' onEnter', sd.onEnter, sd, [u, t]);
        }
      }
    });
    return tiles;
  };

  // ---- terrain & objects ------------------------------------------------------------------------
  Act.setTerrain = function (x, y, terrainId) {
    const t = G().tile(x, y);
    const def = DD.getTerrain(terrainId);
    if (!t) return false;
    if (!def) { DD.warn('setTerrain: unknown terrain "' + terrainId + '"'); return false; }
    t.t = terrainId;
    if (terrainId !== 'ice') t.melt = null;
    bump();
    FX().tile(x, y, def.pit ? 'crack' : def.liquid ? 'splash' : 'pulse');
    const wall = def.walkable === false && !def.pit && !def.liquid;
    const cloudy = !!(t.surface && (DD.getSurface(t.surface.id) || {}).airborne);   // [v2 review] clouds stay
    if (wall || (def.pit && !cloudy)) t.surface = null;
    if (def.pit && t.obj) t.obj = null;
    if (def.liquid === 'lava' && !cloudy) t.surface = null;
    const u = G().unitAt(x, y);
    if (u && active(u)) {
      const fly = G().isFlying(u);
      if (!fly && G().isDrop(x, y)) fall(u, currentCredit());
      else if (wall) {
        const spot = G().nearestFree(x, y, u);
        if (spot) { const from = { x: u.x, y: u.y }; u.x = spot.x; u.y = spot.y; FX().slide(u, from, spot); }
      } else if (!fly && typeof def.onEnter === 'function') DD.safe('terrain ' + def.id + ' onEnter', def.onEnter, def, [u, t, 'terrain']);
    }
    return true;
  };

  Act.setHeight = function (x, y, h) {
    const t = G().tile(x, y);
    if (!t) return false;
    t.h = U.clamp(Math.round(h || 0), 0, 4);
    bump();
    FX().tile(x, y, 'pulse');
    return true;
  };

  /** Place an object instance (overrides are shallow-merged; data merged). Refused on a tile with a unit if it blocks. */
  Act.placeObject = function (x, y, objId, overrides) {
    const t = G().tile(x, y);
    if (!t) return null;
    const def = DD.getObject(objId);
    if (!def) DD.warn('placeObject: unknown object "' + objId + '"');
    overrides = overrides || {};
    const blocks = overrides.blocksMove !== undefined ? !!overrides.blocksMove : (def ? def.blocksMove !== false : true);
    if (blocks && G().unitAt(x, y)) return null;
    const hp = overrides.hp !== undefined ? overrides.hp : (def ? def.hp || 0 : 0);
    const o = Object.assign({}, overrides);
    o.id = objId;
    o.hp = hp;
    o.maxHp = overrides.maxHp !== undefined ? overrides.maxHp : hp;
    o.data = Object.assign({}, overrides.data || {});
    if (def && typeof def.init === 'function') DD.safe('object init ' + objId, def.init, def, [o, t]);
    t.obj = o;
    bump();
    return o;
  };

  Act.removeObject = function (x, y) {
    const t = G().tile(x, y);
    if (!t || !t.obj) return null;
    const o = t.obj;
    t.obj = null;
    bump();
    return o;
  };

  /** Damage a destructible object (hp > 0). Returns true if it was destroyed. */
  Act.damageObject = function (src, x, y, amount) {
    const t = G().tile(x, y);
    const o = t && t.obj;
    if (!o) return false;
    if (!(o.maxHp > 0) || !(o.hp > 0)) return false;
    amount = Math.round(amount || 0);
    if (amount <= 0) return false;
    const by = src || currentCredit();
    const hint = by && by.side === 'hero' && S() && S().kind === 'boss' ? Act.puzzleHint(o, by, t) : 0;   // before the hit
    o.hp -= amount;
    bump();
    FX().tile(x, y, 'crack');
    FX().text({ x: x, y: y }, '-' + amount, { color: '#e0c090', size: 13 });
    if (o.hp <= 0) { Act.destroyObject(x, y, src, { hint: hint }); return true; }
    return false;
  };

  /** Remove an object (onDestroyed, objective count). opts.hint: its puzzle hint before the blow (damageObject). */
  Act.destroyObject = function (x, y, src, opts) {
    const s = S();
    const t = G().tile(x, y);
    const o = t && t.obj;
    if (!o) return false;
    const by = src || currentCredit();
    const hint = opts && opts.hint !== undefined ? opts.hint : by && by.side === 'hero' && s.kind === 'boss' ? Act.puzzleHint(o, by, t) : 0;
    t.obj = null;
    bump();
    const def = DD.getObject(o.id);
    FX().particles({ x: x, y: y }, { kind: 'dust', count: 14 });
    FX().sound('bump');
    Act.log('The ' + String(o.label || (def ? def.name : o.id)).toLowerCase() + ' is destroyed.', 'system');
    s.stats.objects = s.stats.objects || {};
    s.stats.objects[o.id] = (s.stats.objects[o.id] || 0) + 1;
    const ob = s.objective;
    if (ob && ob.type === 'destroy' && (!ob.objId || ob.objId === o.id)) ob.destroyed = (ob.destroyed || 0) + 1;
    const fn = typeof o.onDestroyed === 'function' ? o.onDestroyed : def && def.onDestroyed;
    if (typeof fn === 'function') Act.withCredit(src, function () { DD.safe('object ' + o.id + ' onDestroyed', fn, o, [o, t, src || null]); });
    if (hint > 0) puzzleStep(by, hint);
    if (DD.Combat && DD.Combat.refreshObjective) DD.Combat.refreshObjective();
    if (DD.Combat && DD.Combat.checkEnd) DD.Combat.checkEnd();
    return true;
  };

  /** A volatile object: it explodes when destroyed (def or instance flag `volatile`), so attacks can set it off. */
  Act.isVolatile = function (o) {
    if (!o) return false;
    if (o.volatile !== undefined) return !!o.volatile;
    const d = DD.getObject(o.id);
    return !!(d && d.volatile);
  };

  const DETONATE_QUIPS = ['Safety third!', 'Somebody had to.', 'The DM sighs audibly.', 'OSHA has left the chat.', 'Worth it.'];
  /**
   * v2 (user request): a single-target attack aimed at a volatile object (DD.Targeting: target.objects) sets it off
   * outright — destroyed, its onDestroyed blast credited to the attacker (kills, Hype, stats, gold hooks), the skill's
   * own riders skipped. FX: a projectile for a ranged attack, a lunge for a melee one. Returns true when it went off.
   * Called by DD.Combat.resolveSkill inside the skill's resolution (beginSkill / endSkill).
   */
  Act.detonate = function (src, x, y, skill) {
    const t = G().tile(x, y);
    const o = t && t.obj;
    if (!o) return false;
    const def = DD.getObject(o.id);
    const name = String(o.label || (def ? def.name : o.id)).toLowerCase();
    const tags = (skill && skill.tags) || [];
    const ranged = !!src && (G().dist(src, t) > 1 || tags.indexOf('ranged') >= 0);
    if (src) {
      face(src, t);
      if (ranged) FX().projectile(src, { x: x, y: y }, { kind: 'bolt', color: '#ffd27a' });
      else FX().lunge(src, { x: x, y: y });
      if (!Act.simulating) {
        Act.log(src.name + (ranged ? ' takes a shot at the ' : ' gives the ') + name + (ranged ? '' : ' a good whack') + '. ' +
          U.line(DETONATE_QUIPS, cosmeticRng()), src.side === 'hero' ? 'hero' : 'enemy');
      }
    }
    bump();
    return Act.destroyObject(x, y, src || null);
  };

  /** Interaction offered by an object for this unit: { ap, label } or null. */
  Act.interactionOf = function (o, unit) {
    if (!o) return null;
    const def = DD.getObject(o.id);
    const ia = o.interact !== undefined ? o.interact : def && def.interact;
    if (!ia && typeof o.onInteract !== 'function') return null;
    if (o.data && o.data.disabled) return null;
    const avail = typeof o.available === 'function' ? o.available : def && def.available;
    if (typeof avail === 'function' && !DD.safe('object ' + o.id + ' available', avail, o, [o, unit])) return null;
    return { ap: ia && ia.ap !== undefined ? ia.ap : 1, label: (ia && ia.label) || 'Use' };
  };

  /** Perform an object interaction (no AP; DD.Combat.interact pays). Def fn first, then instance onInteract. */
  Act.interact = function (unit, x, y) {
    const t = G().tile(x, y);
    const o = t && t.obj;
    if (!o || !unit) return false;
    const def = DD.getObject(o.id);
    const ia = o.interact !== undefined ? o.interact : def && def.interact;
    if (!ia && typeof o.onInteract !== 'function') return false;
    const hint = unit.side === 'hero' && S() && S().kind === 'boss' ? Act.puzzleHint(o, unit, t) : 0;   // [balance] puzzle Hype
    face(unit, t);
    FX().lunge(unit, t);
    let r;
    if (ia && typeof ia.fn === 'function') r = DD.safe('interact ' + o.id, ia.fn, ia, [unit, o, t]);
    if (r !== false && typeof o.onInteract === 'function') DD.safe('onInteract ' + o.id, o.onInteract, o, [unit, o, t]);
    bump();
    if (hint > 0) puzzleStep(unit, hint);
    return true;
  };

  // ---- units: spawn & summon ----------------------------------------------------------------------
  function slot(id, level) { return { id: id, level: level || 1, cd: 0, uses: 0, usedThisTurn: false }; }
  Act.makeSlot = slot;

  function baseUnit(def, kind, side, x, y) {
    const mov = Number(def.mov);
    return {
      id: U.uid('u'), defId: def.id, kind: kind, side: side, name: def.name || def.id,
      x: x, y: y, hp: 1, maxHp: 1, block: 0, armor: Math.max(0, Number(def.armor) || 0),
      ap: 0, maxAp: 0, mov: def.mov === undefined || def.mov === null || !isFinite(mov) ? 3 : Math.max(0, Math.round(mov)),
      flags: Object.assign({}, def.flags || {}), tags: (def.tags || []).slice(), resist: Object.assign({}, def.resist || {}),
      statuses: [], dmgBonus: 0, healBonus: 0, rangeBonus: 0,
      runHero: null, basic: null, signature: null, skills: [], items: [], scars: [],
      skillSlots: [], intents: [], order: 0, tier: null, isBoss: false, ownerId: null,
      init: Math.round(Number(def.init) || 0), apBank: 0, oppRound: 0,
      facing: side === 'hero' ? 1 : -1, lastDir: side === 'hero' ? { x: 1, y: 0 } : { x: -1, y: 0 },
      data: {}, dead: false, downed: false, vis: null,
    };
  }
  Act.baseUnit = baseUnit;
  // initiative modifier of an enemy whose def gives none (DESIGN §4.1; same table as DD.Combat.TIER_INIT)
  const TIER_INIT = { minion: 1, normal: 0, elite: 1, boss: 2 };

  /** Build (not place) an enemy unit. opts: side, hpMult, noScale, level. */
  Act.newEnemyUnit = function (def, x, y, opts) {
    opts = opts || {};
    const s = S();
    let diff = opts.noScale ? 1 : (s && s.difficulty ? s.difficulty.hp || 1 : 1);
    // [balance] per-tier HP (DD.Balance.tierHp) in real fights; sandbox fights stay neutral
    if (!opts.noScale && s && s.difficulty && s.difficulty.tiers && DD.Balance && DD.Balance.tierHpOf) diff *= DD.Balance.tierHpOf(def.tier || 'normal');
    const u = baseUnit(def, 'enemy', opts.side || 'enemy', x, y);
    u.maxHp = u.hp = Math.max(1, Math.round((def.hp || 1) * (opts.hpMult || 1) * diff));
    // [balance] extra move for enemies that can move (DD.Balance.enemyMov per tier) in real fights
    if (!opts.noScale && s && s.difficulty && s.difficulty.tiers && s.difficulty.mov && u.mov > 0) {
      const add = s.difficulty.mov[def.tier || 'normal'];
      if (typeof add === 'number' && add) u.mov = Math.max(1, u.mov + Math.round(add));
    }
    u.skillSlots = (def.skills || []).map(function (id) { return slot(id, opts.level || 1); });
    u.tier = def.tier || 'normal';
    u.isBoss = u.tier === 'boss' || !!def.boss;
    u.init = typeof def.init === 'number' && isFinite(def.init) ? Math.round(def.init) : (TIER_INIT[u.tier] || 0);
    return u;
  };

  /**
   * Build (not place) a summon unit for an owner. opts: level, hpMult, ready, name. v2: `ready` (act at once) only
   * applies during its owner's turn; otherwise it has 0 AP like everyone whose turn it is not, and gets its AP when its
   * owner's turn starts (e.g. a corgi summoned at combat start no longer shows 2 AP through the turns before hers).
   */
  Act.newSummonUnit = function (def, owner, x, y, opts) {
    opts = opts || {};
    const s = S();
    const u = baseUnit(def, 'summon', owner ? owner.side : (opts.side || 'hero'), x, y);
    u.maxHp = u.hp = Math.max(1, Math.round((def.hp || 1) * (opts.hpMult || 1)));
    u.maxAp = def.ap === undefined ? 2 : def.ap;
    const ownersTurn = !!(owner && DD.Combat && DD.Combat.isTurnOf && DD.Combat.isTurnOf(owner));
    u.ap = opts.ready && ownersTurn ? u.maxAp : 0;
    u.skills = (def.skills || []).map(function (id) { return slot(id, opts.level || 1); });
    u.skillSlots = u.skills;
    u.ownerId = owner ? owner.id : null;
    u.init = typeof def.init === 'number' && isFinite(def.init) ? Math.round(def.init) : 0;
    u.title = def.name;
    if (opts.name) u.name = opts.name;
    else if (Array.isArray(def.names) && def.names.length && s) u.name = def.names[quietly(function () { return s.rng.int(0, def.names.length - 1); })];
    return u;
  };

  function place(u, x, y) {
    const fly = { flags: u.flags };
    if (G().isFree(x, y, fly) && !G().isDrop(x, y)) return { x: x, y: y };
    return G().nearestFree(x, y, fly);
  }

  function arrive(u, opts) {
    const s = S();
    s.units.push(u);
    bump();
    if (opts.noFx) FX().initVis(u);
    else { FX().initVis(u, { hidden: true }); FX().spawn(u); }
    enterTile(u, G().tile(u.x, u.y), 'spawn');
    // units that arrive once the combat-start hooks are firing (passive summons, onStart spawns, waves) get their own
    if ((s.round >= 1 || s.startHooksFired) && !opts.noHooks) DD.Hooks.fire('onCombatStart', u, u);
    // v2: after initiative a unit with no turn of its own (not a summon acting on its owner's turn) rolls now and
    // joins the order at the next round start
    if (!u.dead && DD.Combat && DD.Combat.noteArrival) DD.Combat.noteArrival(u);
  }

  /** Spawn an enemy-side unit (difficulty HP scaling applies). opts: side, hpMult, noScale, noFx, silent, level. */
  Act.spawn = function (enemyId, x, y, opts) {
    opts = opts || {};
    const s = S();
    const def = DD.getEnemy(enemyId);
    if (!s || !def) { DD.warn('spawn: unknown enemy "' + enemyId + '"'); return null; }
    const probe = Act.newEnemyUnit(def, x, y, opts);
    const pos = place(probe, x, y);
    if (!pos) return null;
    probe.x = pos.x; probe.y = pos.y;
    arrive(probe, opts);
    if (!opts.silent) {
      Act.log(probe.name + ' joins the fight!', 'enemy');
      Act.maybeBark(probe, 'spawn', 0.5);
    }
    return probe;
  };

  /** Summon a hero-side controllable unit next to its owner's side. opts: level, hpMult, ready, name, noFx. */
  Act.summon = function (owner, summonId, x, y, opts) {
    opts = opts || {};
    const s = S();
    const def = DD.getSummon(summonId);
    if (!s || !def) { DD.warn('summon: unknown summon "' + summonId + '"'); return null; }
    const u = Act.newSummonUnit(def, owner, x, y, opts);
    const pos = place(u, x, y);
    if (!pos) return null;
    u.x = pos.x; u.y = pos.y;
    arrive(u, opts);
    FX().sound('summon');
    if (!opts.silent) Act.log((owner ? owner.name + ' summons ' : '') + u.name + (u.title && u.title !== u.name ? ' the ' + u.title : '') + '!', 'hero');
    Act.maybeBark(u, 'spawn', 0.6);
    return u;
  };

  // ---- wind-ups, rules, end ------------------------------------------------------------------------
  /** Interrupt a unit's pending wind-ups (v2: the only pending enemy actions). */
  Act.cancelIntents = function (unit, reason) {
    if (!unit) return;
    if (DD.AI && DD.AI.cancelIntents) DD.AI.cancelIntents(unit, reason);
    else { unit.intents = []; bump(); }
  };

  Act.addRule = function (rule) {
    const s = S();
    if (!s || !rule) return null;
    const r = Object.assign({ name: 'House Rule', icon: '📜', desc: '', hooks: {}, turns: -1 }, rule);
    if (!r.id) r.id = U.uid('rule');
    for (let i = s.rules.length - 1; i >= 0; i--) if (s.rules[i].id === r.id) s.rules.splice(i, 1);
    s.rules.push(r);
    bump();
    Act.log('New rule: ' + r.name + (r.desc ? ' (' + (typeof r.desc === 'function' ? r.desc() : r.desc) + ')' : ''), 'system');
    if (typeof r.onAdd === 'function') DD.safe('rule ' + r.id + ' onAdd', r.onAdd, r, [s, r]);
    return r;
  };
  Act.removeRule = function (id) {
    const s = S();
    if (!s) return false;
    for (let i = 0; i < s.rules.length; i++) {
      if (s.rules[i].id !== id) continue;
      const r = s.rules.splice(i, 1)[0];
      bump();
      if (typeof r.onRemove === 'function') DD.safe('rule ' + r.id + ' onRemove', r.onRemove, r, [s, r]);
      Act.log('Rule ended: ' + r.name, 'system');
      return true;
    }
    return false;
  };

  Act.endCombat = function (result) {
    if (DD.Combat && DD.Combat.finish) DD.Combat.finish(result);
  };
})();
