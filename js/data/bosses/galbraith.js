/* Dungeons and Degenerates — js/data/bosses/galbraith.js
 * Act IV door 3 (V3, plan .tmp/v3/design.md §3.3, §5.3, §6.2): GRAND MAGISTER GALBRAITH (he), the spellcasting lich
 * every spell is named after. Encounter 'boss_galbraith', "Galbraith's Grand Observatory" (theme a4_observatory, 13 × 13,
 * a round observatory over the starry void). A solo mini-boss (tier boss, boss.mini; plan §3.0.1).
 *   The puzzle: the only creature down here who still uses spell slots, and he shows them (status 🔮 Spell Slots, 0-9).
 *   - Galbraith's Counterspell (a fight rule, content-only: plan §0.3 V20): once a round the first hero spell that would
 *     damage or debuff him, cast by a hero he can see within 6, does nothing to him and costs him 2 slots. Bait it; steel
 *     and arrows go through. Previews, dry runs and DD.AI.estimate see it (estimateDealt mirror).
 *   - Focus Crystals (3, 15 HP, breakable by any single-target damage skill): +1 slot each at his turn start.
 *   - A turn that starts at 2 slots or fewer is an Intermission: no action, +50% damage taken until his next turn
 *     starts, back to 9 slots at its end (the burst window).
 *   - Each turn: a Mildly Forbidden Teleport away from melee (not two turns running), one spell (Wall of Force against
 *     two melee heroes, Chain Lightning on a cluster, else the Frostbite Ray cantrip), then a wind-up he can afford
 *     (Meteoric Displeasure and Power Word: Ouch take turns).
 *   - Phase 2 "Encore" (≤ 100 of 340 HP; the damage carries over): Overchannelling (+50% damage taken, no slots, no
 *     Counterspell), move 5, two Frostbite Rays at two heroes a turn, the Grand Finale every other turn (anchored on
 *     him); each standing crystal heals him 8 at his turn start.
 *   - Galbraith's Contingency (the DM's stun guard): after a stun lands, stuns from others are refused until the end
 *     of the next turn he really plays.
 * Every bit of boss state lives in the unit's data (previews and dry runs copy it). Cosmetic picks use DD.rng only.
 * Galbraith speaks in the first person or is named; he is "he" everywhere else.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  // ---- ids ------------------------------------------------------------------------------------------------------
  const GAL = 'gal_galbraith', ENC = 'boss_galbraith', RULE = 'gal_counterspell';
  const CRYSTAL = 'gal_crystal', WALL = 'gal_force_wall', FLOOR = 'gal_starmarble', SIGIL = 'gal_sigil';
  const SK = { ray: 'gal_ray', chain: 'gal_chain', wall: 'gal_wall', blink: 'gal_blink', meteor: 'gal_meteor', pw: 'gal_pw',
    rest: 'gal_rest', finale: 'gal_finale' };
  const ST = { slots: 'gal_slots', resting: 'gal_resting', over: 'gal_overchannel' };

  // ---- knobs (BAL tunes these; the descs read them) ---------------------------------------------------------------
  const N = {
    hp: 340, p2: 100,                // phase 2 at 100 of 340 HP (a share of max HP: difficulty scales both)
    slots: 9, restAt: 2,             // a turn that starts at 2 slots or fewer is an Intermission
    cost: { chain: 3, wall: 3, blink: 1, counter: 2, meteor: 5, pw: 4 },
    sight: 6,                        // Counterspell and the rays: a hero he can see within 6
    crystalHp: 15, crystalHeal: 8, crystalHint: 14, crystalHintP2: 18,
    blinkMin: 4, blinkMax: 6, wallLen: 5, wallRounds: 2, wallReach: 4,
    meteorN: 3, meteorGap: 3, pwRange: 8, chainHops: 2, chainReach: 2,
    mov: 3, movP2: 5, takenRest: 1.5, takenOver: 1.5, namedChance: 0.25,
  };
  const KIT = { 1: [SK.ray, SK.chain, SK.wall], 2: [SK.ray] };
  const STYLE = { style: 'ranged', keepDistance: 3 };
  const C = { robe: '#16204a', gold: '#e8c15a', soul: '#7fe3ff', bone: '#efe8d6', beard: '#a6f0ff', ink: '#0b1030' };

  // ---- small helpers --------------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function quiet() { return !!(DD.Act && DD.Act.simulating); }
  function isGal(u) { return !!u && u.defId === GAL; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function incapacitated(u) { return !active(u) || DD.Act.isStunned(u) || has(u, 'sheep'); }
  function round() { const s = S(); return s ? s.round : 0; }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  function lvl(id) { const s = DD.getSkill(id); return (s && DD.skillLevel(s, 1)) || {}; }
  /** A skill's numbers as THIS fight deals them for a live unit (DD.AI.fightLevel), the raw level without one. */
  function liveLvl(id, u) {
    const s = DD.getSkill(id);
    if (!s) return {};
    return u && u.side && DD.AI && DD.AI.fightLevel && S() ? DD.AI.fightLevel(s, 1, u) : DD.skillLevel(s, 1);
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  /** The living Galbraith of a fight (looked up every time: previews swap DD.Combat.state). */
  function findGal(state) {
    const s = state || S();
    if (!s || !s.units) return null;
    for (let i = 0; i < s.units.length; i++) if (isGal(s.units[i]) && !s.units[i].dead) return s.units[i];
    return null;
  }
  /** Boss state on the unit (created on first use). */
  function boss(u) {
    const d = u.data || (u.data = {});
    if (!d.gal) {
      d.gal = { phase: 1, slots: N.slots, counteredRound: -1, turns: 0, lastBlink: -9, restTurn: -1, nextWind: 'meteor', p2Turns: 0,
        guard: null, lostTurn: false, jabbed: false,
        stats: { turns: 0, counters: 0, rests: 0, restDmg: 0, blinks: 0, walls: 0, chains: 0, rays: 0, meteors: 0, meteorHits: 0, pws: 0, pwLanded: 0,
          finales: 0, finaleHits: 0, crystals: 0, healed: 0, regen: 0, stuns: 0, refused: 0, lost: 0, encore: 0 } };
    }
    return d.gal;
  }
  function crystalTiles(state) {
    const s = state || S();
    return s && s.grid ? s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === CRYSTAL && t.obj.hp > 0; }) : [];
  }
  function crystalsStanding(state) { return crystalTiles(state).length; }
  function pendingWindup(u) { return ((u && u.intents) || []).some(function (i) { return i && i.windup; }); }
  function windupOf(u, id) { return ((u && u.intents) || []).filter(function (i) { return i && i.skillId === id; })[0] || null; }
  function bark(u, key, chance) { if (!quiet() && active(u)) A().maybeBark(u, key, chance === undefined ? 1 : chance); }
  function heroFoes(unit) { return DD.AI.targetsFor(unit).filter(function (f) { return f.kind === 'hero'; }); }
  /** A hero whose basic attack is a melee one (the engine's attack-of-opportunity rule says which). */
  function meleeHero(h) { return h.kind === 'hero' && !!DD.Act.opportunitySlot(h); }
  function sees(from, to, range) { return dist(from, to) >= 1 && dist(from, to) <= range && G().los(from, to); }

  // ---- spell slots (the authoritative count is boss(u).slots; the 🔮 status mirrors it for the HUD) -----------------
  function slotsOf(u) { return u ? boss(u).slots : 0; }
  function syncSlots(u) {
    if (!u) return;
    const d = boss(u);
    if (d.phase !== 1 || !active(u)) { if (has(u, ST.slots)) A().removeStatus(u, ST.slots, { silent: true }); return; }
    let st = A().getStatus(u, ST.slots);
    if (!st) st = A().addStatus(u, ST.slots, { stacks: Math.max(1, d.slots), turns: -1, silent: true }, u);
    if (st && st.stacks !== d.slots) { st.stacks = d.slots; A().touch(); }
  }
  function setSlots(u, n) {
    const d = boss(u);
    d.slots = U.clamp(Math.round(n) || 0, 0, N.slots);
    syncSlots(u);
    return d.slots;
  }
  function spend(u, n) { return setSlots(u, slotsOf(u) - n); }
  /** The slot check of a slotted spell (content canUse: AI.reachOf and AutoPlay read it, so the shading stays honest). */
  function slotGate(cost) {
    return function (ctx) {
      const u = ctx && ctx.user;
      if (!u || !isGal(u)) return true;
      const d = boss(u);
      if (d.phase !== 1) return 'No slots: he is Overchannelling.';
      return d.slots >= cost ? true : 'Not enough spell slots (' + cost + ').';
    };
  }

  // ---- Counterspell (a fight rule: plan §0.3 V20) -------------------------------------------------------------------
  const COUNTER_DESC = 'Once per round, the first hero spell that would damage or debuff Galbraith while he can see its caster within ' + N.sight +
    ' does nothing to him. It costs him ' + N.cost.counter + ' slots. Not while he rests or holds fewer than ' + N.cost.counter + ' slots.';
  /** Can he counter right now (this round's counter unspent, enough slots, awake, phase 1)? Pure. */
  function counterArmed(g, s) {
    s = s || S();
    if (!active(g) || !s) return false;
    const d = boss(g);
    return d.phase === 1 && !has(g, ST.resting) && d.slots >= N.cost.counter && d.counteredRound !== s.round;
  }
  /** A hero-side caster he can see within 6. Pure. */
  function counterable(g, caster) {
    return !!caster && caster.side === 'hero' && !caster.dead && G().hostile(caster, g) && dist(g, caster) <= N.sight &&
      (dist(g, caster) === 0 || G().los(g, caster));
  }
  /** The resolution a hit belongs to (one AoE spell is countered as one), or null outside a resolution. */
  function resolutionOf(caster, skill) {
    const sk = A().currentSkill();
    return sk && sk.user === caster && sk.skill === skill && sk.extra && typeof sk.extra === 'object' ? sk.extra : null;
  }
  function counterNow(g, caster, skill, ctx) {
    const d = boss(g);
    d.counteredRound = round();
    d.stats.counters++;
    if (ctx) ctx.galCountered = g.id;
    spend(g, N.cost.counter);
    if (!quiet()) {
      DD.FX.beam(g, caster, { color: C.soul, width: 3 });
      DD.FX.text(g, '🔮 Countered!', { color: C.soul, size: 17 });
      A().log('Galbraith\'s Counterspell! ' + caster.name + '\'s ' + skill.name + ' does nothing to him (' + N.cost.counter + ' slots spent: ' +
        d.slots + ' left). Once a round: anything after it goes through.', 'enemy');
      bark(g, 'counter', 0.7);
    }
    updateFlavor(g);
  }
  function negate(d) { d.mult = 0; d.flat = 0; d.nullified = true; d.countered = true; }
  function counterRule() {
    return {
      id: RULE, name: '🔮 Galbraith\'s Counterspell', icon: '🔮', desc: COUNTER_DESC, turns: -1,
      hooks: {
        modifyIncomingDamage: function (d) {
          const g = d.target;
          if (!isGal(g) || d.cause !== 'skill' || !d.skill || d.skill.kind !== 'spell') return;
          const c = d.source;
          if (!c || c.side !== 'hero') return;
          if (d.element && g.resist && g.resist[d.element] === 0) return;   // it would do nothing anyway
          const ctx = resolutionOf(c, d.skill);
          if (ctx && ctx.galCountered === g.id) { negate(d); return; }
          if (!counterArmed(g) || !counterable(g, c)) return;
          counterNow(g, c, d.skill, ctx);
          negate(d);
        },
        modifyStatus: function (m) {
          const g = m.unit;
          if (!isGal(g) || m.cancel) return;
          const def = DD.getStatus(m.id);
          const c = m.src;
          if (!def || def.type !== 'debuff' || !c || c.side !== 'hero') return;
          const sk = A().currentSkill();
          if (!sk || sk.user !== c || !sk.skill || sk.skill.kind !== 'spell') return;
          const ctx = sk.extra && typeof sk.extra === 'object' ? sk.extra : null;
          if (ctx && ctx.galCountered === g.id) { m.cancel = true; return; }
          if (!counterArmed(g) || !counterable(g, c)) return;
          counterNow(g, c, sk.skill, ctx);
          m.cancel = true;
        },
        // honesty (a fight rule is the attacker's source): DD.AI.estimate and AutoPlay see a countered spell deal 0
        estimateDealt: function (e) {
          const g = e.target;
          if (!isGal(g) || !e.skill || e.skill.kind !== 'spell') return;
          const c = e.attacker;
          if (!c || c.side !== 'hero') return;
          if (e.element && g.resist && g.resist[e.element] === 0) return;
          if (!counterArmed(g) || !counterable(g, c)) return;
          e.mult = 0; e.flat = 0;
        },
      },
    };
  }
  function ensureRule() {
    const s = S();
    if (s && !s.rules.some(function (r) { return r.id === RULE; })) A().addRule(counterRule());
  }

  // ---- phases -----------------------------------------------------------------------------------------------------
  /** HP at which the Encore starts (100 of 340: the same share of a scaled max HP). */
  function threshold(u) { return Math.ceil((u ? u.maxHp : N.hp) * N.p2 / N.hp); }
  function syncKit(u) {
    const want = KIT[boss(u).phase] || KIT[1];
    const cur = u.skillSlots || [];
    if (cur.length === want.length && cur.every(function (sl, i) { return sl.id === want[i]; })) return;
    u.skillSlots = want.map(function (id) { return cur.filter(function (sl) { return sl.id === id; })[0] || DD.Act.makeSlot(id, 1); });
    A().touch();
  }
  function enterEncore(u) {
    const d = boss(u);
    if (d.phase !== 1) return;
    d.phase = 2;
    d.p2Turns = 0;
    d.stats.encore = round() || 1;
    if (has(u, ST.resting)) A().removeStatus(u, ST.resting, { silent: true });
    syncSlots(u);
    A().addStatus(u, ST.over, { turns: -1 }, u);
    u.mov = N.movP2;
    syncKit(u);
    A().removeRule(RULE);
    if (!quiet()) {
      DD.FX.flash('#7fe3ff', 260);
      DD.FX.shake(7, 420);
      DD.FX.banner('AN ENCORE!', { sub: '"An encore! The crowd demands it. I am the crowd."', color: C.soul, ms: 1300 });
      A().log('ENCORE! Grand Magister Galbraith burns his own soul for spells: no slots, no Counterspell, move ' + N.movP2 +
        ', +50% damage taken. Two Frostbite Rays a turn and the Grand Finale every other turn.', 'enemy');
      A().narrate('galbraith_encore', {});
      bark(u, 'phase', 1);
      if (DD.Cameo && DD.Cameo.say) DD.Cameo.say('svammiel', 'svam_phase', { enemy: u.name });
    }
    updateFlavor(u);
  }
  function syncPhase(u) { if (boss(u).phase === 1 && active(u) && u.hp <= threshold(u)) enterEncore(u); }

  // ---- the objective subtitle and the inspect line ------------------------------------------------------------------
  function updateFlavor(u) {
    const s = S();
    if (!s || !s.objective || !u || !active(u)) return;
    const d = boss(u), n = crystalsStanding();
    let text;
    if (d.phase === 2) {
      text = 'ENCORE: he takes +50% damage. ' + (n ? 'Break the Focus Crystals (each heals him ' + N.crystalHeal + ' a turn, ' + n + ' left), then spread out' :
        'Spread out') + ' against the Grand Finale.';
    } else if (has(u, ST.resting)) text = 'INTERMISSION! He takes +50% damage and can\'t Counterspell until his next turn. Hit him NOW!';
    else {
      text = 'Bait his Counterspell with a cheap spell; swords and arrows go through. ' +
        (n >= 3 ? 'Break a Focus Crystal or he never rests (3 left).' : n ? 'Break the Focus Crystals (' + n + ' left): each one refills a slot a turn.' :
          'Crystals down: he rests whenever his slots run dry.');
    }
    if (s.objective.flavor !== text) { s.objective.flavor = text; A().touch(); }
  }
  function nextWindName(d) { return d.nextWind === 'pw' ? 'Power Word: Ouch' : 'Meteoric Displeasure'; }
  function passiveText(u) {
    const guard = ' Galbraith\'s Contingency: after a stun lands, he shrugs off stuns until he has played a turn.';
    if (!u || !u.data || !u.data.gal) {
      return 'Spell slots ' + N.slots + '/' + N.slots + ' (+1 at his turn start per standing Focus Crystal). Counterspell: once a round, the first hero spell at him ' +
        'from within ' + N.sight + ' in his sight does nothing (2 slots). Each turn: a Mildly Forbidden Teleport if a foe is next to him (not two turns running), ' +
        'one spell, then a wind-up he can afford. A turn that starts at ' + N.restAt + ' slots or fewer is an Intermission: no action, +50% damage taken ' +
        'until his next turn, then ' + N.slots + ' slots. Encore at ' + threshold(null) + ' HP.' + guard;
    }
    const d = u.data.gal, n = crystalsStanding();
    if (d.phase === 2) {
      const w = windupOf(u, SK.finale);
      const next = w ? 'it lands at the start of his next turn' : (d.p2Turns % 2 === 0 ? 'next: his next turn' : 'next: the turn after his next');
      return 'ENCORE (Overchannelling): +50% damage taken, no slots, no Counterspell, move ' + N.movP2 + '. Each turn: two Frostbite Rays at two different ' +
        'foes, then the Grand Finale every other turn (' + next + '). Each standing Focus Crystal heals him ' + N.crystalHeal + ' at his turn start (' + n +
        ' standing).' + guard;
    }
    const s = S();
    const cs = has(u, ST.resting) ? 'off (resting)' : d.slots < N.cost.counter ? 'off (under ' + N.cost.counter + ' slots)' :
      s && d.counteredRound === s.round ? 'used this round' : 'ready';
    return 'Spell slots ' + d.slots + '/' + N.slots + ' (+1 at his turn start per standing Focus Crystal: ' + n + ' standing). Counterspell: ' + cs +
      ' (once a round, the first hero spell at him from within ' + N.sight + ' in his sight; 2 slots). Each turn: a Mildly Forbidden Teleport if a foe is ' +
      'next to him (not two turns running), one spell, then a wind-up he can afford (next: ' + nextWindName(d) + '). A turn that starts at ' + N.restAt +
      ' slots or fewer is an Intermission: no action, +50% damage taken until his next turn, then ' + N.slots + ' slots. Encore at ' + threshold(u) + ' HP.' + guard;
  }

  // ---- named lines (picked by hero id: a hero whose file has not landed is never "present") -------------------------
  const NAMED = [
    ['zarathor', 'A fireball with GOLD on it, Zarathor? Who approved that?'],
    ['kiri', 'Arrows through walls, Kiri? That\'s my spell. Pay up.'],
    ['corelos', 'Runes, Corelos? I invented runes. And the letter R.'],
    ['syllamin', 'Spells set to music, Syllamin. Disgusting. Catchy.'],
    ['marbles', 'Professor Marbles! We were students together! You forgot?'],
    ['valdris', 'A forge cleric, Valdris. Hitting things with prayer. Quaint.'],
    ['benedick', 'Galbraith\'s Escargot, Benedick. A classic. Hold still.'],
    // h19 (addendum-rasma §19.4, addendum-biz §19.4, addendum-gus §20.4)
    ['rasma', 'Rasma! A fellow of breeding! Galbraith\'s Polite Disintegration, then.'],
    ['biz', 'Galbraith\'s Grand Disassembly, Biz. Do hold still.'],
    // [h19 review:shared] not "Eldritch powers, Phat Gus? …": Svammiel's roast of him opens with those words
    ['gus', 'Weird woods magic, Phat Gus? Quaint. I have TENURE in eldritch.'],
  ];
  /** A named line about `about` (or any hero in this fight), '' when none fits. Cosmetic RNG. */
  function namedLine(about) {
    const s = S();
    if (!s) return '';
    const here = {};
    s.units.forEach(function (x) { if (x.kind === 'hero' && active(x)) here[x.defId] = 1; });
    const ok = NAMED.filter(function (p) { return here[p[0]] && (!about || about.defId === p[0]); });
    return ok.length ? ok[Math.floor(DD.rng.next() * ok.length)][1] : '';
  }
  function sayNamed(u, about, chance) {
    if (quiet() || !active(u) || DD.rng.next() >= chance) return '';
    const line = namedLine(about);
    if (line) A().bark(u, line);
    return line;
  }

  // ---- the stun guard and the hooks on Galbraith --------------------------------------------------------------------
  const HOOKS = {
    onCombatStart: function (unit) {
      if (!isGal(unit)) return;
      const d = boss(unit);
      unit.mov = d.phase === 2 ? N.movP2 : N.mov;
      ensureRule();
      syncKit(unit);
      syncSlots(unit);
      bark(unit, 'spawn', 1);
      updateFlavor(unit);
    },
    onRoundStart: function (unit, r) {
      if (!isGal(unit)) return;
      const d = boss(unit);
      if ((r || round()) === 1 && !d.jabbed) {
        d.jabbed = true;
        if (!quiet()) {
          A().log('Galbraith: "Lich-tenstein? I supervised his thesis. He still owes me a library book. I see the irony. I hate the irony."', 'enemy');
          A().narrate('galbraith_tip', {});
        }
      }
      syncPhase(unit);
      updateFlavor(unit);
    },
    onTurnStart: function (unit) {
      if (!isGal(unit)) return;
      const d = boss(unit);
      d.lostTurn = DD.Act.isStunned(unit);
      if (has(unit, ST.resting)) A().removeStatus(unit, ST.resting, { text: 'Intermission over' });
      const n = crystalsStanding();
      if (d.phase === 1) {
        if (n && d.slots < N.slots) {
          const before = d.slots;
          setSlots(unit, d.slots + n);
          d.stats.regen += d.slots - before;
          if (!quiet()) DD.FX.text(unit, '🔮 +' + (d.slots - before) + ' (Focus Crystals)', { color: C.soul, size: 14 });
        } else syncSlots(unit);
      } else if (n) {
        const healed = A().heal(null, unit, n * N.crystalHeal, { cause: 'status' });
        d.stats.healed += healed || 0;
        if (healed && !quiet()) A().log('The Focus Crystals feed Galbraith\'s Encore: he heals ' + healed + ' (' + plural(n, 'crystal') + ' standing).', 'enemy');
      }
      updateFlavor(unit);
    },
    onTurnEnd: function (unit) {
      if (!isGal(unit)) return;
      const d = boss(unit), s = S();
      if (d.lostTurn) d.stats.lost++;
      // the guard drops at the end of a turn he really played, armed before that turn began (the DM's rule)
      else if (d.guard && s && s.turn > d.guard.turn) d.guard = null;
      d.lostTurn = false;
      if (d.phase === 1 && d.restTurn === d.turns && has(unit, ST.resting)) {
        setSlots(unit, N.slots);
        if (!quiet()) {
          DD.FX.text(unit, '🔮 ' + N.slots + ' slots', { color: C.soul, size: 15 });
          A().log('Galbraith\'s Intermission ends: back to ' + N.slots + ' spell slots. He still takes +50% damage until his next turn starts.', 'enemy');
        }
      }
      updateFlavor(unit);
    },
    /** Galbraith's Contingency: once stunned he shrugs off stuns from others until he has played a turn again. */
    modifyStatus: function (m) {
      if (!isGal(m.unit) || !DD.Act.isStunLike(m.id) || m.src === m.unit || m.cancel) return;
      const d = boss(m.unit);
      if (d.guard) {
        m.cancel = true;
        d.stats.refused++;
        if (!quiet()) DD.FX.text(m.unit, '🎩 Galbraith\'s Contingency: shrugs it off', { color: '#dfe8ff', size: 14 });
      }
    },
    onStatusApplied: function (unit, st) {
      if (!isGal(unit) || !st || !DD.Act.isStunLike(st.id)) return;
      const d = boss(unit), s = S();
      d.stats.stuns++;
      d.guard = { turn: s ? s.turn : 0 };
      bark(unit, 'stunned', 0.7);
    },
    onTakeDamage: function (dd) {
      const u = dd.target;
      if (!isGal(u) || u.dead) return;
      const d = boss(u);
      if (has(u, ST.resting)) d.stats.restDmg += dd.dealt || 0;
      syncPhase(u);
    },
    onDeath: function (unit) {
      if (!isGal(unit)) return;
      A().removeRule(RULE);
      if (!quiet()) {
        DD.FX.text(unit, '🎩 Final Curtain', { color: C.gold, size: 18 });
        A().narrate('galbraith_death', {});
      }
    },
  };

  // ---- his turn -------------------------------------------------------------------------------------------------------
  /** Stand spots: here + the move action's reachable tiles over the floor (he hovers, but he poses over marble). */
  function spots(unit, api) {
    const out = [{ x: unit.x, y: unit.y, cost: 0, path: [], aoo: 0, risk: 0, here: true }];
    if (A().cantMove(unit)) return out;
    api.reachable(unit).forEach(function (e) {
      if (G().isPit(e.x, e.y)) return;
      const risk = DD.AI.pathRisk(unit, e);
      const aoo = api.aooCost(unit, e);
      if (risk.lethal || aoo === Infinity) return;
      out.push({ x: e.x, y: e.y, cost: e.cost || 0, path: e.path, aoo: aoo, risk: risk.penalty || 0, here: false });
    });
    return out;
  }
  /** The best spot by value(p) (−Infinity = never) minus its walk's price; null when none is allowed. */
  function bestSpot(unit, api, value) {
    let best = null;
    const ox = unit.x, oy = unit.y;
    try {
      spots(unit, api).forEach(function (p) {
        unit.x = p.x; unit.y = p.y;
        const v = value(p);
        if (!isFinite(v)) return;
        const sc = v - p.aoo - p.risk - p.cost * 0.15 + (p.here ? 0.25 : 0);
        if (!best || sc > best.score) best = Object.assign({}, p, { score: sc });
      });
    } finally { unit.x = ox; unit.y = oy; }
    return best;
  }
  function walkTo(unit, p) {
    if (!p || p.here || (p.x === unit.x && p.y === unit.y)) return true;
    DD.AI.moveTo(unit, p.x, p.y, p.path);
    return unit.x === p.x && unit.y === p.y;
  }
  /** Foes next to p (melee pressure on a stand spot). */
  function crowd(p, foes) { return foes.filter(function (f) { return dist(f, p) === 1; }).length; }
  function nearMelee(p, foes) { return foes.filter(function (f) { return meleeHero(f) && dist(f, p) <= 2; }).length; }
  /** A spot with nothing to cast at: closer to the party is better (a hiding party never stalls the fight). */
  function approach(p, foes) {
    let n = Infinity;
    foes.forEach(function (f) { n = Math.min(n, dist(f, p)); });
    return isFinite(n) ? -6 - 0.5 * Math.max(0, n - 2) : -6;
  }
  /** He flies, so a push can leave him over the void; he floats back to the marble on his turn (melee can't reach him there). */
  function overVoid(p) { return G().isPit(p.x, p.y) ? 12 : 0; }
  function rayValue(unit, f) {
    const def = DD.getSkill(SK.ray), L = lvl(SK.ray);
    const est = DD.AI.estimate(unit, f, L.dmg, 'frost', false, def);
    const kill = est >= f.hp + (f.block || 0) ? 8 : 0;
    return est + kill + 3 * (1 - f.hp / Math.max(1, f.maxHp));
  }
  /** Chain Lightning's victims from a target tile: the target + up to 2 more foes within 2 of it (nearest first). */
  function chainTiles(user, target, state) {
    const s = state || S();
    const out = [{ x: target.x, y: target.y }];
    if (!s || !user) return out;
    const extra = s.units.filter(function (u) {
      return active(u) && u !== user && (u.x !== target.x || u.y !== target.y) && G().hostile(user, u) && dist(u, target) <= N.chainReach;
    }).sort(function (a, b) { return dist(a, target) - dist(b, target) || s.units.indexOf(a) - s.units.indexOf(b); });
    extra.slice(0, N.chainHops).forEach(function (u) { out.push({ x: u.x, y: u.y }); });
    return out;
  }
  /** The best thing to cast from where he (virtually) stands: { skillId, target, value } or null. */
  function castFromHere(unit, foes, chainOk) {
    let best = null;
    const cdef = DD.getSkill(SK.chain), L = lvl(SK.chain);
    foes.forEach(function (f) {
      if (!sees(unit, f, N.sight)) return;
      const rv = rayValue(unit, f);
      if (!best || rv > best.value) best = { skillId: SK.ray, target: f, value: rv };
      if (!chainOk) return;
      const hit = chainTiles(unit, f).map(function (p) { return G().unitAt(p.x, p.y); }).filter(function (v) { return active(v) && G().hostile(unit, v); });
      if (hit.length < 2) return;
      let v = 4;
      hit.forEach(function (h) { v += DD.AI.estimate(unit, h, L.dmg, 'lightning', false, cdef); });
      if (v > best.value) best = { skillId: SK.chain, target: f, value: v };
    });
    return best;
  }
  /** Wall of Force: 2+ melee heroes within 3 → the row (1 or 2 tiles out, 5 wide) that walls off the most of them. */
  function wallPlan(unit) {
    const melee = heroFoes(unit).filter(function (h) { return meleeHero(h) && dist(h, unit) <= 3; });
    if (melee.length < 2) return null;
    let best = null;
    U.DIRS.forEach(function (dir) {
      [1, 2].forEach(function (k) {
        const c = { x: unit.x + dir.x * k, y: unit.y + dir.y * k };
        const tiles = [];
        for (let o = -Math.floor(N.wallLen / 2); o <= Math.floor(N.wallLen / 2); o++) {
          const p = dir.x ? { x: c.x, y: c.y + o } : { x: c.x + o, y: c.y };
          const t = G().tile(p.x, p.y);
          if (!t || t.obj || G().unitAt(p.x, p.y) || G().isPit(p.x, p.y) || dist(p, unit) > N.wallReach || !G().isWalkable(p.x, p.y)) continue;
          tiles.push(p);
        }
        if (tiles.length < 3) return;
        let blocked = 0;
        melee.forEach(function (h) {
          const along = (h.x - unit.x) * dir.x + (h.y - unit.y) * dir.y;
          const perp = dir.x ? h.y - unit.y : h.x - unit.x;
          if (along > k && Math.abs(perp) <= Math.floor(N.wallLen / 2) + 1) blocked++;
        });
        if (!blocked) return;
        const sc = blocked * 10 + tiles.length - k;
        if (!best || sc > best.score) best = { target: c, tiles: tiles, dir: dir, blocked: blocked, score: sc };
      });
    });
    return best;
  }
  /** Mildly Forbidden Teleport: a free floor tile 4-6 from the nearest foe that sees the most heroes (ties: away from the void). */
  function blinkSpot(unit, state) {
    const s = state || S();
    if (!s) return null;
    const foes = s.units.filter(function (o) { return active(o) && G().hostile(unit, o); });
    if (!foes.length) return null;
    let best = null;
    s.grid.tiles.forEach(function (t) {
      if ((t.x === unit.x && t.y === unit.y) || G().isPit(t.x, t.y) || !G().isFree(t.x, t.y)) return;
      let near = Infinity;
      foes.forEach(function (f) { near = Math.min(near, dist(f, t)); });
      if (near < N.blinkMin || near > N.blinkMax) return;
      const seen = foes.filter(function (f) { return f.kind === 'hero' && sees(t, f, N.sight); }).length;
      let edge = 0;
      U.DIRS.forEach(function (dd) { if (!G().inBounds(t.x + dd.x, t.y + dd.y) || G().isPit(t.x + dd.x, t.y + dd.y)) edge++; });
      const sc = seen * 10 - edge - dist(unit, t) * 0.05;
      if (!best || sc > best.score) best = { x: t.x, y: t.y, score: sc, seen: seen };
    });
    return best;
  }
  /** Power Word: Ouch: the hero he can see within 8 with the lowest HP + Block. */
  function pwTarget(unit) {
    const list = heroFoes(unit).filter(function (h) { return sees(unit, h, N.pwRange); });
    list.sort(function (a, b) { return (a.hp + (a.block || 0)) - (b.hp + (b.block || 0)) || S().units.indexOf(a) - S().units.indexOf(b); });
    return list[0] || null;
  }
  /** Meteoric Displeasure: up to 3 heroes at least 3 apart, the most crowded first; radius 1 around each. */
  function meteorPlan(unit) {
    const s = S();
    const heroes = heroFoes(unit);
    if (!heroes.length) return null;
    const crowdOf = function (h) { return s.units.filter(function (o) { return active(o) && G().hostile(unit, o) && dist(o, h) <= 1; }).length; };
    const order = heroes.slice().sort(function (a, b) { return crowdOf(b) - crowdOf(a) || a.hp - b.hp || s.units.indexOf(a) - s.units.indexOf(b); });
    const centers = [];
    order.forEach(function (h) {
      if (centers.length >= N.meteorN || centers.some(function (c) { return dist(c, h) < N.meteorGap; })) return;
      centers.push({ x: h.x, y: h.y });
    });
    const tiles = [];
    centers.forEach(function (c) {
      G().shape('circle', c, null, 1).forEach(function (p) {
        if (G().inBounds(p.x, p.y) && !(p.x === unit.x && p.y === unit.y) && !tiles.some(function (q) { return q.x === p.x && q.y === p.y; })) tiles.push({ x: p.x, y: p.y });
      });
    });
    return { centers: centers, tiles: tiles };
  }

  function rest(unit, api) {
    if (api.act(unit, SK.rest, unit, { anchor: 'self' })) return true;
    return false;
  }
  function blink(unit, api) {
    const p = blinkSpot(unit);
    if (!p) return false;
    if (!api.act(unit, SK.blink, { x: p.x, y: p.y }, { anchor: 'ground' })) return false;
    return unit.x === p.x && unit.y === p.y;
  }
  function fire(unit, api, skillId, target) {
    if (!active(target)) return false;
    if (target.kind === 'hero') sayNamed(unit, target, N.namedChance);   // now and then he names whom he aims at
    return api.act(unit, skillId, target, { anchor: 'unit' });
  }
  /** One spell: Wall of Force against two melee heroes, Chain Lightning on a cluster, else the Frostbite Ray. */
  function castSpell(unit, api, blinked) {
    if (api.canUse(unit, SK.wall)) {
      const w = wallPlan(unit);
      if (w && api.act(unit, SK.wall, w.target, { anchor: 'ground', tiles: w.tiles, dir: w.dir })) return true;
    }
    const chainOk = api.canUse(unit, SK.chain);   // off cooldown and enough slots (its canUse)
    const plan = function () { return castFromHere(unit, api.foes(unit), chainOk); };
    let pick;
    if (blinked) pick = plan();
    else {
      const foes = api.foes(unit);
      const spot = bestSpot(unit, api, function (p) {
        const c = castFromHere(unit, foes, chainOk);
        return (c ? c.value : approach(p, foes)) - crowd(p, foes) * 6 - nearMelee(p, foes) * 2 - overVoid(p);
      });
      if (spot) {
        walkTo(unit, spot);
        if (incapacitated(unit) || api.state.result) return true;
      }
      pick = plan();
    }
    if (!pick) return false;
    return fire(unit, api, pick.skillId, pick.target);
  }
  /** The wind-up he can afford (Meteoric Displeasure and Power Word: Ouch take turns). */
  function windNext(unit, api) {
    const d = boss(unit);
    if (pendingWindup(unit)) return false;
    const order = d.nextWind === 'pw' ? ['pw', 'meteor'] : ['meteor', 'pw'];
    for (let i = 0; i < order.length; i++) {
      const k = order[i];
      if (d.slots < N.cost[k]) continue;
      if (k === 'meteor') {
        const m = meteorPlan(unit);
        if (!m || !m.centers.length) continue;
        if (!api.windUp(unit, SK.meteor, m.centers[0], { anchor: 'ground', tiles: m.tiles, data: { centers: m.centers } })) continue;
        spend(unit, N.cost.meteor);
        d.stats.meteors++;
        d.nextWind = 'pw';
        bark(unit, 'meteor', 0.8);
        return true;
      }
      const v = pwTarget(unit);
      if (!v || !api.windUp(unit, SK.pw, v, { track: true })) continue;
      spend(unit, N.cost.pw);
      d.stats.pws++;
      d.nextWind = 'meteor';
      if (!sayNamed(unit, v, 0.5)) bark(unit, 'pw', 0.8);
      return true;
    }
    return false;
  }
  /** Phase 2: two Frostbite Rays at two different foes, then the Grand Finale every other turn. */
  function encoreTurn(unit, api) {
    const d = boss(unit);
    d.p2Turns++;
    const finaleNow = !windupOf(unit, SK.finale) && d.p2Turns % 2 === 1;
    const L = lvl(SK.finale);
    const foes = api.foes(unit);
    const spot = bestSpot(unit, api, function (p) {
      const vals = foes.filter(function (f) { return sees(unit, f, N.sight); }).map(function (f) { return rayValue(unit, f); }).sort(function (a, b) { return b - a; });
      let v = vals.length ? vals[0] + (vals[1] || 0) : approach(p, foes);
      if (finaleNow) v += 7 * foes.filter(function (f) { return dist(f, p) <= L.r; }).length;
      return v - crowd(p, foes) * 3 - overVoid(p);
    });
    if (spot) walkTo(unit, spot);
    let first = null;
    for (let k = 0; k < 2 && !incapacitated(unit) && !api.state.result; k++) {
      const pick = castFromHere(unit, api.foes(unit).filter(function (f) { return f !== first; }), false);
      if (!pick) break;
      if (fire(unit, api, SK.ray, pick.target)) first = pick.target;
    }
    if (finaleNow && !incapacitated(unit) && !api.state.result && api.windUp(unit, SK.finale, { x: unit.x, y: unit.y }, { anchor: 'self' })) {
      d.stats.finales++;
      bark(unit, 'finale', 1);
    }
  }
  function galTurn(unit, api) {
    const d = boss(unit);
    d.turns++;
    d.stats.turns++;
    syncPhase(unit);
    if (d.phase === 1) ensureRule();   // a Galbraith that joined after the start (scripts, tests) brings his rule too
    if (d.phase === 2) { encoreTurn(unit, api); updateFlavor(unit); return; }
    if (d.slots <= N.restAt) { rest(unit, api); updateFlavor(unit); return; }
    if (!api.foes(unit).length) return;
    let blinked = false;
    const adjacent = api.foes(unit).some(function (f) { return dist(f, unit) === 1; });
    if (adjacent && d.lastBlink !== d.turns - 1 && d.slots >= N.cost.blink) blinked = blink(unit, api);
    if (incapacitated(unit) || api.state.result) return;
    castSpell(unit, api, blinked);
    if (incapacitated(unit) || api.state.result) return;
    windNext(unit, api);
    updateFlavor(unit);
  }

  // ---- skills ---------------------------------------------------------------------------------------------------------
  function zap(ctx, victim, amount, element, tags) {
    return DD.Act.damage(ctx.user, victim, amount, { element: element || null, tags: tags || [] });
  }
  eskill({ id: SK.ray, name: 'Galbraith\'s Frostbite Ray', icon: '🥶', kind: 'spell', tags: ['frost', 'ranged'], anchor: 'unit',
    levels: [{ dmg: 14 }], target: { type: 'unit', range: [1, N.sight], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' frost damage to a foe within ' + N.sight + ' he can see. A cantrip: costs no slots.'; },
    flavor: 'Named after its inventor. Who is also the one firing it. Who would like you to know that.',
    execute: function (ctx) {
      const v = ctx.targetUnit;
      if (v) DD.FX.beam(ctx.user, v, { color: '#9fe3ff', width: 3 });
      bark(ctx.user, 'attack', 0.2);
      ctx.foes.forEach(function (f) { if (active(f)) zap(ctx, f, ctx.L.dmg, 'frost'); });
      if (isGal(ctx.user)) boss(ctx.user).stats.rays++;
    } });
  eskill({ id: SK.chain, name: 'Galbraith\'s Chain Lightning (Abridged)', icon: '⚡', kind: 'spell', tags: ['lightning', 'ranged', 'aoe'], anchor: 'unit',
    cooldown: 1, levels: [{ dmg: 14 }], target: { type: 'unit', range: [1, N.sight], filter: 'enemy', los: true },
    area: { shape: 'custom', fn: function (ctx) { return ctx.target ? chainTiles(ctx.user, ctx.target, ctx.state) : []; } },
    canUse: slotGate(N.cost.chain),
    desc: function (L) {
      return 'Spend ' + N.cost.chain + ' slots: deal ' + L.dmg + ' lightning damage to a foe within ' + N.sight + ' and to up to ' + N.chainHops +
        ' more foes within ' + N.chainReach + ' of it.';
    },
    flavor: 'The abridged edition. The unabridged one has a foreword. By him.',
    execute: function (ctx) {
      const u = ctx.user;
      if (isGal(u)) { spend(u, N.cost.chain); boss(u).stats.chains++; }
      let from = u;
      // a hop leaves from the foe it just struck: that foe flinches, it does not cast (fx_render beamShooter; the beams
      // play before the damage, so the renderer's struck-unit rule can't tell; fix:polish, render-ui's request)
      ctx.foes.forEach(function (f) {
        const look = { color: '#cfe3ff', width: 2 };
        if (from !== u) look.shooter = false;
        DD.FX.beam(from, f, look);
        from = f;
      });
      bark(u, 'attack', 0.3);
      ctx.foes.forEach(function (f) { if (active(f)) zap(ctx, f, ctx.L.dmg, 'lightning'); });
    } });
  eskill({ id: SK.wall, name: 'Galbraith\'s Wall of Force', icon: '🧱', kind: 'spell', tags: ['utility'], anchor: 'ground', cooldown: 3,
    levels: [{ len: N.wallLen }], target: { type: 'tile', range: [1, 2], filter: 'any', los: false, straight: true },
    area: { shape: 'row', size: Math.floor(N.wallLen / 2) },
    canUse: slotGate(N.cost.wall),
    desc: function (L) {
      return 'Spend ' + N.cost.wall + ' slots: raise a wall of up to ' + L.len + ' tiles within ' + N.wallReach +
        ' until the end of the next round. It blocks movement and sight and can\'t be broken.';
    },
    flavor: 'A wall of pure smugness. Translucent, so you can watch him not care.',
    execute: function (ctx) {
      const u = ctx.user;
      if (isGal(u)) { spend(u, N.cost.wall); boss(u).stats.walls++; }
      let n = 0;
      ctx.tiles.forEach(function (p) {
        const t = G().tile(p.x, p.y);
        if (!t || t.obj || G().unitAt(p.x, p.y) || G().isPit(p.x, p.y) || !G().isWalkable(p.x, p.y)) return;
        if (A().placeObject(p.x, p.y, WALL, { data: { left: N.wallRounds } })) { n++; DD.FX.tile(p.x, p.y, 'pulse', { color: C.soul }); }
      });
      if (n) {
        DD.FX.text(u, '🧱 Wall of Force!', { color: C.soul, size: 16 });
        A().log('Galbraith raises a Wall of Force (' + plural(n, 'tile') + '): it blocks movement and sight until the end of the next round.', 'enemy');
        bark(u, 'wall', 0.8);
      }
    } });
  eskill({ id: SK.blink, name: 'Galbraith\'s Mildly Forbidden Teleport', icon: '🌀', kind: 'spell', tags: ['move'], anchor: 'ground',
    levels: [{ n: 1 }], target: { type: 'tile', range: [0, 40], filter: 'empty', los: false },
    desc: function () {
      return 'Spend ' + N.cost.blink + ' slot: teleport to a free floor tile at least ' + N.blinkMin + ' tiles from every foe (the nearest within ' +
        N.blinkMax + '). He does it at the start of his turn when a foe is next to him, never two turns running.';
    },
    flavor: 'Forbidden by the Arcane Council, mildly. He chairs the Arcane Council.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!p || !A().teleport(u, p.x, p.y)) return;
      if (isGal(u)) { const d = boss(u); spend(u, N.cost.blink); d.lastBlink = d.turns; d.stats.blinks++; }
      A().log('Galbraith\'s Mildly Forbidden Teleport! He reappears out of reach.', 'enemy');
      bark(u, 'blink', 0.6);
    } });
  eskill({ id: SK.rest, name: 'Galbraith\'s Intermission', icon: '💤', kind: 'utility', tags: [], anchor: 'self',
    levels: [{ n: 1 }], target: { type: 'self' },
    desc: function () {
      return 'A turn that starts at ' + N.restAt + ' or fewer slots he spends resting, and he is back to ' + N.slots + ' slots at its end. ' +
        'Until his next turn starts he takes +50% damage and can\'t Counterspell.';
    },
    flavor: 'Ten minutes. Visit the gift shop. Everything in it is named after him.',
    execute: function (ctx) {
      const u = ctx.user;
      A().addStatus(u, ST.resting, { turns: -1 }, u);
      if (isGal(u)) { const d = boss(u); d.restTurn = d.turns; d.stats.rests++; }
      DD.FX.text(u, '💤 Intermission!', { color: '#ffd76a', size: 17 });
      A().log('Galbraith\'s Intermission! Out of spell slots, he rests his whole turn: +50% damage taken and no Counterspell until his next turn.', 'hero');
      bark(u, 'rest', 1);
      updateFlavor(u);
    } });
  eskill({ id: SK.meteor, name: 'Galbraith\'s Meteoric Displeasure', icon: '☄️', kind: 'spell', tags: ['fire', 'aoe'], anchor: 'ground', windupOnly: true,
    levels: [{ dmg: 20 }], target: { type: 'tile', range: [0, 40], filter: 'any', los: false }, area: { shape: 'circle', size: 1 },
    desc: function (L) {
      return 'Wind-up (' + N.cost.meteor + ' slots): next turn up to three meteors land, radius 1 around up to ' + N.meteorN + ' heroes: ' + L.dmg +
        ' fire damage to each foe in them.';
    },
    flavor: 'Displeasure, expressed geologically.',
    execute: function (ctx) {
      const u = ctx.user;
      const centers = (ctx.intent && ctx.intent.data && ctx.intent.data.centers) || (ctx.target ? [ctx.target] : []);
      centers.forEach(function (c, i) { DD.FX.projectile({ x: c.x, y: c.y, h: 10 }, c, { kind: 'fireball', arc: false, ms: 300, parallel: i > 0 }); });
      DD.FX.shake(8, 360);
      let n = 0;
      ctx.units.forEach(function (v) { if (v !== u && active(v) && G().hostile(u, v)) { zap(ctx, v, ctx.L.dmg, 'fire', ['meteor']); n++; } });
      if (isGal(u)) boss(u).stats.meteorHits += n;
      if (n) bark(u, 'landed', 0.6);
    } });
  eskill({ id: SK.pw, name: 'Galbraith\'s Power Word: Ouch', icon: '🗯️', kind: 'spell', tags: ['ranged'], anchor: 'unit', windupOnly: true,
    levels: [{ dmg: 26 }], target: { type: 'unit', range: [1, N.pwRange], filter: 'enemy', los: true },
    desc: function (L) {
      return 'Wind-up (' + N.cost.pw + ' slots): next turn the marked hero takes ' + L.dmg + ' damage, if Galbraith can still see that hero within ' +
        N.pwRange + ' (the mark follows the hero).';
    },
    flavor: 'There are many Power Words. This is the one he could pronounce.',
    execute: function (ctx) {
      const u = ctx.user, v = ctx.targetUnit;
      if (!active(v)) return;
      DD.FX.text(v, 'OUCH.', { color: '#ffffff', size: 20 });
      zap(ctx, v, ctx.L.dmg, null, ['word']);
      if (isGal(u)) boss(u).stats.pwLanded++;
      bark(u, 'landed', 0.6);
    } });
  eskill({ id: SK.finale, name: 'Galbraith\'s Grand Finale', icon: '🎆', kind: 'spell', tags: ['aoe'], anchor: 'self', windupOnly: true,
    levels: [{ dmg: 20, r: 3 }], target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Wind-up: next turn ' + L.dmg + ' damage to each foe within ' + L.r + ' of him (the blast moves with him).'; },
    flavor: 'Please find your seats. Please stay in them. Please die in them.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.explosion({ x: u.x, y: u.y }, { radius: ctx.L.r, color: '#7fe3ff' });
      DD.FX.flash('#bfefff', 200);
      let n = 0;
      ctx.units.forEach(function (v) { if (v !== u && active(v) && G().hostile(u, v)) { zap(ctx, v, ctx.L.dmg, null, ['finale']); n++; } });
      if (isGal(u)) boss(u).stats.finaleHits += n;
      if (n) bark(u, 'landed', 0.6);
    } });

  // ---- statuses -------------------------------------------------------------------------------------------------------
  DD.registerStatus({ id: ST.slots, name: 'Spell Slots', icon: '🔮', color: C.soul, type: 'buff', stacking: 'refresh', maxStacks: N.slots, decay: 'never',
    defaultTurns: -1,
    desc: function (st) {
      return 'Spell slots: ' + (st ? st.stacks : N.slots) + ' of ' + N.slots + '. Each spell costs slots; a turn that starts at ' + N.restAt +
        ' or fewer is spent resting.';
    } });
  DD.registerStatus({ id: ST.resting, name: 'Intermission', icon: '💤', color: '#ffd76a', type: 'debuff', stacking: 'none', maxStacks: 1, decay: 'never',
    defaultTurns: -1, takenMult: N.takenRest,
    desc: function () { return '+50% damage taken and no Counterspell until his next turn starts. Back to ' + N.slots + ' slots at the end of the turn he rests.'; } });
  DD.registerStatus({ id: ST.over, name: 'Overchannelling', icon: '🔥', color: '#ff7ad9', type: 'debuff', stacking: 'none', maxStacks: 1, decay: 'never',
    defaultTurns: -1, takenMult: N.takenOver,
    desc: function () { return '+50% damage taken. No slots, no Counterspell.'; } });

  // ---- terrain & objects ----------------------------------------------------------------------------------------------
  /** A tiny gold constellation on the marble (points along the grid: map rotation through g.local). */
  function drawStarMarble(g, t) {
    if (!t) return;
    const k = (t.x * 7 + t.y * 3) % 5;
    const pts = [[-0.22, -0.12], [0.02, 0.14], [0.24, -0.05]];
    if (k === 0) {
      const P = pts.map(function (p) { return g.local(p[0], p[1]); });
      g.line(P[0][0], P[0][1], P[1][0], P[1][1], 'rgba(232,193,90,0.5)', 0.7);
      g.line(P[1][0], P[1][1], P[2][0], P[2][1], 'rgba(232,193,90,0.5)', 0.7);
      P.forEach(function (q) { g.circle(q[0], q[1], 1.3, '#e8c15a', null); });
    } else if (k === 2) {
      const q = g.local(0.18 * ((t.x % 3) - 1), 0.15 * ((t.y % 3) - 1));
      g.circle(q[0], q[1], 1.1, 'rgba(232,193,90,0.75)', null);
    }
  }
  DD.registerTerrain({ id: FLOOR, name: 'Star-Chart Marble', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#e4e2ee', left: '#c3c1d0', right: '#a8a6b8' },
    desc: 'White marble inlaid with gold star charts. Every constellation is named Galbraith. Some of them twice.',
    draw: drawStarMarble });
  DD.registerTerrain({ id: SIGIL, name: 'The Grand Magister\'s Sigil', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#e9e4f2', left: '#c6c1d6', right: '#aba6bd' },
    desc: 'A gold rune ring with a large "G" in the middle, in case anyone forgot whose observatory this is.',
    draw: function (g, t, time) {
      const a = 0.55 + 0.2 * Math.sin((time || 0) * 2);
      g.ellipse(0, 0, 20, 10, null, 'rgba(232,193,90,' + a.toFixed(2) + ')');
      g.ellipse(0, 0, 15, 7.5, null, 'rgba(127,227,255,0.45)');
      g.text('G', 0, 0, 9, '#b8892a', { stroke: 'rgba(255,255,255,0.6)', strokeWidth: 2 });
    } });

  function drawCrystal(g, obj) {
    const t = g.t || 0;
    const bob = Math.sin(t * 2.2) * 1.6;
    const k = obj && obj.maxHp > 0 ? 1 - obj.hp / obj.maxHp : 0;
    g.ellipse(0, 2, 13, 5.5, 'rgba(0,0,0,0.25)');
    g.cylinder(0, 0, 7, 3.5, 6, '#b8892a', '#e8c15a', true);
    const y = -24 + bob;
    g.glow(0, y, 18, C.soul, 0.32 + 0.12 * Math.sin(t * 3));
    g.poly([[0, y - 12], [-6, y], [0, y + 9], [6, y]], 'rgba(127,227,255,0.85)', '#1a3a50');
    g.poly([[0, y - 12], [-6, y], [0, y - 1]], 'rgba(220,250,255,0.7)', null);
    g.line(0, y - 12, 0, y + 9, 'rgba(255,255,255,0.35)', 0.8);
    if (k > 0.2) g.line(-3, y - 4, 1.5, y + 3, '#16283a', 1);
    if (k > 0.55) g.line(2, y - 8, -1, y - 1, '#16283a', 1);
    for (let i = 0; i < 3; i++) {
      const a = t * 1.6 + i * 2.09;
      g.circle(Math.cos(a) * 9, y + Math.sin(a) * 3, 1.2, '#e8c15a', null);
    }
  }
  DD.registerObject({ id: CRYSTAL, name: 'Focus Crystal', blocksMove: true, blocksLos: false, hp: N.crystalHp, height: 1.0, color: '#7fe3ff',
    targetable: true,
    desc: 'Breakable (' + N.crystalHp + ' HP): any single-target damage skill can break it. While it stands, Galbraith regains 1 spell slot at the start ' +
      'of each of his turns (in his Encore it heals him ' + N.crystalHeal + ' instead). Blocks movement, not sight.',
    autoplay: function (unit, obj, tile, state, how) {
      if (how && how !== 'break') return 0;
      const g = findGal(state);
      if (!g) return 0;
      return boss(g).phase === 2 ? N.crystalHintP2 : N.crystalHint;
    },
    onDestroyed: function (o, tile, src) {
      const g = findGal();
      if (tile) DD.FX.particles(tile, { kind: 'glitter', count: 18 });
      if (!g) return;
      const d = boss(g);
      d.stats.crystals++;
      if (!quiet()) {
        const n = crystalsStanding();
        A().log('A Focus Crystal shatters' + (src && src.name ? ' (' + src.name + ')' : '') + '! ' + (n ? plural(n, 'crystal') + ' left.' : 'His last one.') +
          (d.phase === 1 ? ' One slot less a turn for Galbraith.' : ' One heal less for his Encore.'), 'hero');
        bark(g, 'crystal', 0.8);
      }
      updateFlavor(g);
    },
    draw: drawCrystal });

  function drawForceWall(g, obj) {
    const t = g.t || 0;
    const left = (obj && obj.data && obj.data.left) || 1;
    const a = left <= 1 ? 0.28 + 0.12 * Math.sin(t * 9) : 0.42;
    const H = 46;
    g.ellipse(0, 0, 14, 7, 'rgba(127,227,255,' + (a * 0.6).toFixed(2) + ')', 'rgba(232,193,90,0.8)');
    g.rect(-14, -H, 28, H, 'rgba(127,227,255,' + (a * 0.55).toFixed(2) + ')', null);
    g.ellipse(0, -H, 14, 7, 'rgba(200,245,255,' + a.toFixed(2) + ')', 'rgba(232,193,90,0.9)');
    for (let i = 0; i < 3; i++) {
      const y = -((t * 22 + i * 15) % H);
      g.line(-12, y, 12, y - 3, 'rgba(255,255,255,0.35)', 0.8);
    }
    g.text('G', 0, -H / 2, 10, 'rgba(232,193,90,0.9)', { stroke: 'rgba(11,16,48,0.6)', strokeWidth: 2 });
  }
  DD.registerObject({ id: WALL, name: 'Wall of Force', blocksMove: true, blocksLos: true, hp: 0, height: 1.4, color: '#7fe3ff',
    desc: 'A wall of pure smugness: it blocks movement and sight and can\'t be broken. Gone at the end of the round after the one it went up in.',
    onRoundEnd: function (o, tile) {
      o.data = o.data || {};
      o.data.left = (o.data.left || 1) - 1;
      if (o.data.left > 0) return;
      A().removeObject(tile.x, tile.y);
      DD.FX.particles(tile, { kind: 'glitter', count: 8 });
    },
    draw: drawForceWall });

  // ---- the sprite (custom, rotation-safe: a billboard; round props only) ----------------------------------------------
  function drawOrrery(g, x, y, t) {
    g.glow(x, y, 9, '#ffe9a8', 0.35);
    g.ellipse(x, y, 9, 3.4, null, '#e8c15a', -0.3);
    g.ellipse(x, y, 6, 2.4, null, '#c9a03a', 0.5);
    g.circle(x, y, 2.6, '#ffd76a', true);
    const a = t * 1.8, b = -t * 2.6;
    const p1 = [x + Math.cos(a) * 9 * Math.cos(-0.3) - Math.sin(a) * 3.4 * Math.sin(-0.3), y + Math.cos(a) * 9 * Math.sin(-0.3) + Math.sin(a) * 3.4 * Math.cos(-0.3)];
    const p2 = [x + Math.cos(b) * 6 * Math.cos(0.5) - Math.sin(b) * 2.4 * Math.sin(0.5), y + Math.cos(b) * 6 * Math.sin(0.5) + Math.sin(b) * 2.4 * Math.cos(0.5)];
    g.circle(p1[0], p1[1], 1.5, '#7fe3ff', true);
    g.circle(p2[0], p2[1], 1.2, '#ff8ad8', true);
  }
  function drawSkull(g, x, y, r, t, bright) {
    g.shaded(function (p) { p.ellipse(x, y, r, r * 1.02, 0, 0, Math.PI * 2); }, C.bone, { dx: 1.1, dy: -1.1, hl: [x - r * 0.3, y - r * 0.5, r * 0.35, r * 0.2, -0.3] });
    g.shaded(function (p) {
      p.moveTo(x - r * 0.6, y + r * 0.5); p.lineTo(x + r * 0.62, y + r * 0.5); p.lineTo(x + r * 0.5, y + r * 1.05); p.lineTo(x - r * 0.48, y + r * 1.05); p.closePath();
    }, C.bone, { dx: 0.6, dy: -0.6 });
    for (let i = -1; i <= 2; i++) g.line(x + i * r * 0.25 - r * 0.1, y + r * 0.66, x + i * r * 0.25 - r * 0.1, y + r * 0.98, '#3a2a26', 0.6);
    g.poly([[x + r * 0.08, y + r * 0.18], [x - r * 0.08, y + r * 0.44], [x + r * 0.26, y + r * 0.44]], '#2a1d20', null);
    const flick = (bright ? 0.95 : 0.8) + 0.15 * Math.sin(t * 9);
    [[x - r * 0.38, y - r * 0.05], [x + r * 0.42, y - r * 0.05]].forEach(function (e) {
      g.ellipse(e[0], e[1], r * 0.3, r * 0.33, '#0d1422', null);
      g.glow(e[0], e[1], r * 0.8, C.soul, 0.6 * flick);
      g.circle(e[0], e[1], r * 0.13, 'rgba(210,250,255,' + flick.toFixed(2) + ')', null);
    });
    // the gold monocle (and its chain) on the right eye
    g.circle(x + r * 0.42, y - r * 0.05, r * 0.42, 'rgba(220,240,255,0.18)', C.gold);
    g.path(function (p) { p.moveTo(x + r * 0.84, y); p.quadraticCurveTo(x + r * 1.3, y + r * 0.9, x + r * 0.7, y + r * 1.6); }, null, C.gold, 0.7);
  }
  function drawBeard(g, x, y, t, len) {
    const w = 7;
    g.glow(x, y + len * 0.5, len * 0.6, C.beard, 0.25);
    g.path(function (p) {
      p.moveTo(x - w, y);
      for (let i = 1; i <= 4; i++) p.lineTo(x - w * (1 - i / 5) + Math.sin(t * 6 + i) * 1.4, y + len * i / 4.6);
      p.lineTo(x + Math.sin(t * 5) * 2, y + len);
      for (let i = 4; i >= 1; i--) p.lineTo(x + w * (1 - i / 5) + Math.sin(t * 6 + i + 1.7) * 1.4, y + len * i / 4.6);
      p.lineTo(x + w, y);
      p.closePath();
    }, 'rgba(166,240,255,0.78)', 'rgba(60,170,210,0.9)', 0.9);
    g.path(function (p) { p.moveTo(x - 2.5, y + 2); p.quadraticCurveTo(x + Math.sin(t * 7) * 2, y + len * 0.5, x, y + len * 0.85); }, null, 'rgba(240,255,255,0.8)', 0.8);
  }
  function drawHat(g, x, y, t) {
    // the brim (so wide it is a stage), a towering bent cone, a gold band, stars orbiting the brim
    for (let i = 0; i < 4; i++) {
      const a = t * 1.1 + i * 1.57;
      if (Math.sin(a) > 0) continue;
      g.star(x + Math.cos(a) * 25, y + Math.sin(a) * 6, 2.2, '#ffe9a8', null, 4, 0.4);
    }
    g.shaded(function (p) { p.ellipse(x, y, 24, 5.6, 0, 0, Math.PI * 2); }, C.robe, { dx: 0.8, dy: -0.8 });
    g.ellipse(x, y, 24, 5.6, null, C.gold);
    g.shaded(function (p) {
      p.moveTo(x - 10, y - 1);
      p.quadraticCurveTo(x - 6, y - 18, x - 1, y - 32);
      p.quadraticCurveTo(x + 4, y - 38, x + 10, y - 36);
      p.quadraticCurveTo(x + 4, y - 30, x + 3, y - 22);
      p.quadraticCurveTo(x + 6, y - 10, x + 10, y - 1);
      p.closePath();
    }, C.robe, { dx: 1.4, dy: -1.1, hl: [x - 4, y - 16, 1.6, 6, 0.2] });
    g.path(function (p) { p.moveTo(x - 9.5, y - 3); p.quadraticCurveTo(x, y - 6.5, x + 9.5, y - 3); p.lineTo(x + 9, y - 6); p.quadraticCurveTo(x, y - 9.5, x - 9, y - 6); p.closePath(); }, C.gold, true);
    g.star(x - 2, y - 17, 2.4, '#ffe9a8', null, 5, 0.45);
    g.star(x + 3, y - 26, 1.6, '#ffe9a8', null, 4, 0.4);
    for (let i = 0; i < 4; i++) {
      const a = t * 1.1 + i * 1.57;
      if (Math.sin(a) <= 0) continue;
      g.star(x + Math.cos(a) * 25, y + Math.sin(a) * 6, 2.2, '#ffe9a8', null, 4, 0.4);
    }
  }
  function drawGalbraith(g, t, o) {
    const u = o && o.unit;
    const gd = u && u.data && u.data.gal;
    if (gd && gd.phase === 2) { drawEncore(g, t, o); return; }
    const cast = g.pose === 'cast' || g.pose === 'attack';
    const hurt = g.pose === 'hurt';
    const sway = Math.sin(t * 1.4) * 0.8;
    g.glow(0, -34, 32, C.soul, 0.13 + 0.05 * Math.sin(t * 2));
    // the orrery staff (far hand)
    const sx = cast ? -27 : -16, sy = cast ? -50 : -44;
    g.limb(-14, -1, sx, sy + 4, 1.8, '#6a4a22');
    drawOrrery(g, sx, sy - 3, t);
    // the robe: tall, upright, a constellation embroidered on it
    g.shaded(function (p) {
      p.moveTo(-7.5, -40);
      p.quadraticCurveTo(-11.5, -22, -13 + sway * 0.4, 0);
      p.lineTo(13 + sway * 0.4, 0);
      p.quadraticCurveTo(11.5, -22, 7.5, -40);
      p.closePath();
    }, C.robe, { dx: 1.6, dy: -1.2, hl: [-4.5, -28, 2, 8, 0.1] });
    g.line(-12.6, -1.5, 13, -1.5, C.gold, 1.4);
    const cons = [[-7, -9], [-3, -15], [2.5, -11], [6, -19], [3.5, -27]];
    for (let i = 1; i < cons.length; i++) g.line(cons[i - 1][0], cons[i - 1][1], cons[i][0], cons[i][1], 'rgba(232,193,90,0.65)', 0.7);
    cons.forEach(function (c, i) { g.star(c[0], c[1], i === 3 ? 1.8 : 1.2, '#ffe9a8', null, 4, 0.45); });
    // arms: flung wide (showman) when casting, else one on the staff and one gesturing
    const hand = function (x, y) { g.circle(x, y, 2.3, C.bone, true); if (cast) g.glow(x, y, 7, C.soul, 0.5); };
    if (cast) {
      g.limb(-6, -37, sx + 3, sy + 2, 2.4, C.robe, -14, -46);
      g.limb(6, -37, 22, -47, 2.4, C.robe, 14, -46);
      hand(sx + 3, sy + 2); hand(22, -48);
      g.star(24, -54, 2.6 + Math.sin(t * 10), '#bff6ff', null, 4, 0.35);
    } else {
      g.limb(-6, -37, sx + 1.5, sy + 9, 2.4, C.robe, -12, -38);
      hand(sx + 1.5, sy + 9);
      g.limb(6, -37, 11 + (hurt ? -2 : 0), -24 + Math.sin(t * 2.2) * 0.8, 2.4, C.robe, 12, -32);
      hand(11 + (hurt ? -2 : 0), -24 + Math.sin(t * 2.2) * 0.8);
    }
    // head: the spirit-flame beard to the waist, the skull, the hat
    const hy = -47 + (hurt ? 1.2 : 0);
    drawBeard(g, 0.5, hy + 6, t, 22);
    drawSkull(g, 0.5, hy, 8, t, cast);
    drawHat(g, 0.5, hy - 7.5, t);
  }
  /** Phase 2: a floating crowned skull wreathed in spellfire. */
  function drawEncore(g, t, o) {
    const y = -34 + Math.sin(t * 2.4) * 1.5;
    g.glow(0, y, 34, '#ff7ad9', 0.18 + 0.06 * Math.sin(t * 4));
    g.glow(0, y, 26, C.soul, 0.3);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.42;
      const fx = Math.cos(a) * 13, fy = y + Math.sin(a) * 4 + 4;
      g.flame(fx, fy, 6, 13 + 5 * Math.sin(t * 8 + i * 1.3), i % 2 ? 'rgba(127,227,255,0.85)' : 'rgba(255,122,217,0.8)', null, Math.sin(t * 5 + i) * 2);
    }
    // the wisp tail where the robe used to be
    g.path(function (p) {
      p.moveTo(-7, y + 8);
      p.quadraticCurveTo(-4 + Math.sin(t * 4) * 2, y + 20, Math.sin(t * 3) * 3, -2);
      p.quadraticCurveTo(4 + Math.sin(t * 4 + 1) * 2, y + 20, 7, y + 8);
      p.closePath();
    }, 'rgba(127,227,255,0.55)', null);
    drawSkull(g, 0, y, 11, t, true);
    // the crown (gold, five points)
    const cy = y - 10;
    g.poly([[-9, cy + 3], [-9, cy - 4], [-5, cy], [-2.5, cy - 7], [0, cy - 1], [2.5, cy - 7], [5, cy], [9, cy - 4], [9, cy + 3]], C.gold, true);
    g.circle(0, cy - 1.5, 1.4, '#ff7ad9', null);
    for (let i = 0; i < 3; i++) {
      const a = t * 1.5 + i * 2.09;
      g.star(Math.cos(a) * 20, y - 4 + Math.sin(a) * 5, 1.8, '#ffe9a8', null, 4, 0.4);
    }
    if (g.pose === 'cast' || g.pose === 'attack') g.text('ENCORE!', 0, y - 24, 6, '#bff6ff');
  }
  const SPRITE = {
    base: 'custom', scale: 2.1, height: 62, width: 34, headY: -47, hover: 8,
    palette: { skin: C.bone, cloth: C.robe, cloth2: C.gold, hair: C.beard, metal: C.gold, eye: C.soul, accent: C.soul, outline: '#1a1014' },
    bounds: { l: -48, r: 48, t: -104, b: 16 }, portrait: { x: 0, y: -48, r: 20 },
    draw: drawGalbraith,
  };

  // ---- the enemy --------------------------------------------------------------------------------------------------------
  DD.registerEnemy({
    id: GAL, name: 'Grand Magister Galbraith', act: 4, tier: 'boss', pronoun: 'he', shortName: 'Galbraith',
    hp: N.hp, mov: N.mov, armor: 0, init: 3,
    tags: ['boss', 'undead', 'lich', 'caster'], flags: { flying: true, large: true, immune: ['sleep'] }, resist: { poison: 0, frost: 0.5 },
    sprite: SPRITE,
    // what he does at once (threat shading and AutoPlay read the slots); the wind-ups, the teleport and the Intermission
    // are scripted by his turn (the DM's pattern)
    skills: KIT[1].slice(), ai: galTurn, aiStyle: STYLE, xp: 50, gold: [50, 70], hooks: HOOKS,
    passive: { name: 'Galbraith\'s Spell Slot Economy', icon: '🔮', desc: passiveText },
    named: NAMED,
    barks: {
      spawn: ['Behold! Galbraith\'s Grand Entrance!', 'Kneel. No? Galbraith\'s Kneeling Lesson, then.', 'Applause may begin. ...Now. NOW.'],
      attack: ['Galbraith\'s Meteoric Displeasure!', 'Feel Galbraith\'s Unreasonably Large Hand!', 'Say it with me: GALBRAITH\'S.',
        'A spell! Mine. They\'re all mine.', 'Galbraith\'s Polite Disintegration. Pardon me.'],
      windup: ['Galbraith\'s Grand Finale! Please find your seats.', 'Hold your applause. Hold your breath. Either.'],
      landed: ['You may applaud.', 'Bravo, me. Bravo.'],
      hurt: ['You cast that without CREDITING me?', 'My robe! Ninth century! Vintage!', 'A cantrip? On a GRAND MAGISTER?'],
      phase: ['An encore! The crowd demands it. I am the crowd.'],
      stunned: ['Galbraith\'s Contingency... is... loading...'],
      death: ['Galbraith\'s... Final... Curtain...', 'Spell my name right on the plaque... one L...'],
      // the fight's own moments (new lines in V's voice)
      counter: ['Countered! Credit the inventor next time.', 'Galbraith\'s Counterspell! You\'re welcome.', 'Denied. That spell has my name on it.'],
      rest: ['Intermission! Ten minutes. Visit the gift shop.', 'Galbraith\'s Intermission. Buy a programme.'],
      blink: ['Galbraith\'s Mildly Forbidden Teleport! Personal space!', 'No touching the talent.'],
      wall: ['Galbraith\'s Wall of Force! Mind the fourth wall.', 'A wall. Of force. Of mine.'],
      meteor: ['Galbraith\'s Meteoric Displeasure! Look up.', 'Hold your applause. Hold your breath. Either.'],
      pw: ['Galbraith\'s Power Word: Ouch. Say it with me.', 'One word. My word. Ouch.'],
      finale: ['Galbraith\'s Grand Finale! Please find your seats.', 'Hold your applause. Hold your breath. Either.'],
      crystal: ['My focus! I was FOCUSING!', 'That crystal was a gift. From me. To me.'],
      named: NAMED.map(function (p) { return p[1]; }),
    },
    desc: 'The archlich every spell is named after. Galbraith\'s Fireball, Galbraith\'s Grasping Hand, Galbraith\'s Mildly Forbidden Teleport: if ' +
      'it has an apostrophe, it is his. Expects a bow. Accepts applause.',
    boss: { title: 'Namesake of Every Spell', mini: true, sting: 'grand_spell', music: null,
      intro: 'Grand Magister Galbraith spreads his arms: "Behold! Galbraith\'s Grand Spectacular! Please hold your applause until you are dead."' } });

  // ---- the arena: Galbraith's Grand Observatory (plan §3.3) -------------------------------------------------------------
  //  _ the starry void (a pit) · . star-chart marble · o Focus Crystal on its pedestal (h2, steps h1) · p brass orrery
  //  column (blocks sight) · B Galbraith on his sigil · H deploy. Nothing here has a front.
  const LAYOUT = [
    '____.....____',
    '__....o....__',
    '_..........._',
    '_..p.....p.._',
    '.............',
    '......B......',
    'o...........o',
    '.............',
    '_..p.....p.._',
    '_..........._',
    '__..HHHHH..__',
    '__.HHHHHHH.__',
    '____.....____',
  ];
  const HEIGHTS = [
    '0000001000000',
    '0000012100000',
    '0000001000000',
    '0000000000000',
    '0000000000000',
    '1000000000001',
    '2100000000012',
    '1000000000001',
    '0000000000000',
    '0000000000000',
    '0000000000000',
    '0000000000000',
    '0000000000000',
  ];
  DD.registerEncounter({ id: ENC, act: 4, kind: 'boss', weight: 0, minDepth: 0,
    name: 'Galbraith\'s Grand Observatory', shortName: 'Galbraith', icon: '🔭', banner: false,
    gauntlet: { lane: 'galbraith', order: 3, hint: 'Counters one spell a round: steel and arrows go through.' },
    cameo: { start: 'svam_cameo_galbraith', cheat: 'svam_cameo_one', interjections: true },
    intro: 'Stars painted on the ceiling, gold stars set into the floor and a lich at the telescope, naming every constellation after himself.',
    map: { theme: 'a4_observatory', layout: LAYOUT, heights: HEIGHTS, legend: {
      '.': { terrain: FLOOR },
      '_': { terrain: 'pit' },
      'o': { terrain: FLOOR, obj: { id: CRYSTAL } },
      'p': { terrain: FLOOR, obj: { id: 'pillar', label: 'Brass Orrery Column' } },
      'B': { terrain: SIGIL, zone: 'enemy', tag: 'boss_spawn' },
      'H': { terrain: FLOOR, zone: 'hero' },
    } },
    enemies: [{ id: GAL, n: 1 }],
    objective: { type: 'boss', flavor: 'Bait his Counterspell with a cheap spell; swords and arrows go through. Break a Focus Crystal or he never rests (3 left).' },
    reward: { goldMult: 0.9, itemRarity: 'rare' } });

  // ---- narration ----------------------------------------------------------------------------------------------------------
  DD.registerNarration('galbraith_tip', [
    'DM (whispering): "He counters one spell a round. Lead with a cheap one; swords and arrows go straight through."',
    'DM (whispering): "Break the crystals or he never needs a rest. When he names a Grand Finale, get off the red."',
  ]);
  DD.registerNarration('galbraith_encore', [
    'The orrery staff shatters, the robes burn away, and a crowned skull rises in spellfire to take an encore nobody asked for.',
    'The observatory lights dim. A spotlight finds Galbraith, now a floating skull in a crown. He bows to an empty room. The room is you.',
  ]);
  DD.registerNarration('galbraith_death', [
    'Grand Magister Galbraith takes a final bow, and the bow keeps going until there is nothing left but the hat.',
    'The painted stars go out one at a time, and every one of them had his name on it.',
  ]);

  // test / debug hooks (no game logic depends on them)
  DD.Galbraith = {
    N: N, SK: SK, ST: ST, KIT: KIT, LAYOUT: LAYOUT, HEIGHTS: HEIGHTS, NAMED: NAMED, COUNTER_DESC: COUNTER_DESC,
    ID: GAL, ENC: ENC, RULE: RULE, CRYSTAL: CRYSTAL, WALL: WALL,
    findGal: findGal, boss: boss, slotsOf: slotsOf, setSlots: setSlots, counterArmed: counterArmed, counterable: counterable,
    crystalsStanding: crystalsStanding, threshold: threshold, enterEncore: enterEncore, syncPhase: syncPhase, syncKit: syncKit,
    wallPlan: wallPlan, blinkSpot: blinkSpot, pwTarget: pwTarget, meteorPlan: meteorPlan, chainTiles: chainTiles,
    passiveText: passiveText, updateFlavor: updateFlavor, namedLine: namedLine, liveLvl: liveLvl,
    drawGalbraith: drawGalbraith, drawEncore: drawEncore, drawCrystal: drawCrystal, drawForceWall: drawForceWall,
    /** Puzzle engagement of a fight (the sims read it): the boss's stats, or zeros. */
    stats: function (state) {
      const s = state || S();
      const g = s && s.units ? s.units.filter(isGal)[0] : null;
      return g && g.data && g.data.gal ? Object.assign({ phase: g.data.gal.phase }, g.data.gal.stats) : null;
    },
  };
})();
