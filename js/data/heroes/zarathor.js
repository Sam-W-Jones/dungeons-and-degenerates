/* Dungeons and Degenerates — js/data/heroes/zarathor.js
 * Hero: ZARATHOR, THE BEDAZZLED — tiefling warlock of fire, wild magic and bling (starter).
 * v2 kit (DESIGN §6 "Simplicity"): one verb per skill, at most one rider, combos carry the power. Passive "Drip
 * Check": at the start of each of his turns he deals +10% damage per 50 gold the party holds (max +30%), snapshotted
 * as status zar_drip. Combo hooks: his basic pays off Burning foes (Pebbles, Valdris, fire lanes, burning oil),
 * Fireball / Strut ignite the ground (DD.Act.applyElement: oil, webs, barrels, water → steam), Hex / Bedazzle / Lasso
 * set up the party. Starters: Gold-Plated Fireball + Throw Money At It. Gold skills spend real run gold through
 * DD.Act.spendGold (sandbox: state.sandboxGold).
 * Registers: hero zarathor, 12 skills, 3 statuses, summon zar_statue, 3 items (all ids zar_*).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const DRIP_STEP = 50, DRIP_STEP_RING = 30, DRIP_MAX = 3;
  const GOLD = '#ffd23a', FLAME = '#ff7a1a', PURPLE = '#b46cff';

  // ---- helpers ------------------------------------------------------------------------------------
  function active(u) { return !!u && !u.dead && !u.downed; }
  function hasItem(u, id) { return !!u && Array.isArray(u.items) && u.items.indexOf(id) >= 0; }
  function inCombat() { return !!(DD.Combat && DD.Combat.state); }
  /** The fight is won or lost (the killing blow's onSkillUsed still runs after Combat.finish). */
  function fightOver() { const s = DD.Combat && DD.Combat.state; return !s || !!s.result; }
  function hostile(a, b) { return DD.Grid.hostile(a, b); }
  /** Fire reacts with the ground (oil ignites, webs burn, barrels blow, water steams); units there are left alone. */
  function ignite(tiles, src) { tiles.forEach(function (q) { DD.Act.applyElement(q.x, q.y, 'fire', src, { noUnits: true }); }); }

  // ---- Drip Check (gold → damage), counted at combat start and at the start of each of his turns ---------
  function dripStep(u) { return hasItem(u, 'zar_ring_bling') ? DRIP_STEP_RING : DRIP_STEP; }
  function dripTier(u) { return U.clamp(Math.floor(DD.Act.gold() / dripStep(u)), 0, DRIP_MAX); }
  function assessDrip(u) {
    if (!active(u)) return;
    const tier = dripTier(u);
    const st = DD.Act.getStatus(u, 'zar_drip');
    const old = st ? st.stacks : 0;
    if (tier === old) { if (st) st.data.step = dripStep(u); return; }
    if (st) DD.Act.removeStatus(u, 'zar_drip', { silent: true });
    const ns = tier > 0 ? DD.Act.addStatus(u, 'zar_drip', { stacks: tier, silent: true }, u) : null;
    if (ns) ns.data.step = dripStep(u);
    DD.FX.text(u, tier > 0 ? '💎 Drip +' + tier * 10 + '%' : '💎 Drip: broke', { color: tier > old ? GOLD : '#c9b8a0', size: 14 });
    DD.Act.log('Drip Check: ' + u.name + (tier > 0 ? ' deals +' + tier * 10 + '% damage (the party holds ' + DD.Act.gold() + ' gold).' :
      ' is too broke to drip (' + DD.Act.gold() + ' gold).'), 'status');
  }

  // ---- wild magic ---------------------------------------------------------------------------------
  function wildSurge(u, source, good) {
    // no surges once the fight is decided: a post-victory "Make It Rain" was free run gold, a backfire could down a hero
    if (!active(u) || fightOver() || !DD.WildMagic || typeof DD.WildMagic.surge !== 'function') return null;
    const opts = { source: source || 'zarathor' };
    if (good) opts.good = true;
    return DD.WildMagic.surge(u, opts);
  }

  // ---- gold costs ---------------------------------------------------------------------------------
  function goldCost(L) { return Math.max(0, Math.round(+(L && L.gold) || 0)); }
  /** canUse for gold skills: affordable, or the Platinum Hellcard covers the difference in HP. */
  function canPay(ctx) {
    const cost = goldCost(ctx.L);
    if (!cost || DD.Act.gold() >= cost || hasItem(ctx.user, 'zar_hellcard')) return true;
    return 'Too broke! Needs ' + cost + ' gold (the party has ' + DD.Act.gold() + ').';
  }
  /** hpCost of gold skills: the gold the party is short, paid in HP — only with the Platinum Hellcard. */
  function debtHp(L, user) {
    if (!user || !hasItem(user, 'zar_hellcard') || !inCombat()) return 0;
    return Math.max(0, goldCost(L) - DD.Act.gold());
  }
  function payGold(ctx) {
    const u = ctx.user, cost = goldCost(ctx.L), have = DD.Act.gold();
    if (!cost) return true;
    if (have >= cost && DD.Act.spendGold(cost)) {
      DD.FX.text(u, '−' + cost + ' gold', { color: GOLD, size: 14 });
      return true;
    }
    if (hasItem(u, 'zar_hellcard')) {
      DD.Act.loseGold(have);
      DD.FX.text(u, '💳 Charged!', { color: '#d8c8ff', size: 14 });
      // the HP itself was paid with the skill's cost (engine log "pays N HP", capped at 1 HP left)
      DD.Act.log(u.name + ' puts the missing ' + (cost - have) + ' gold on the Platinum Hellcard. The interest is paid in blood.', 'hero');
      return true;
    }
    DD.FX.text(u, 'Card declined!', { color: '#ff8a7a', size: 14 });
    DD.Act.log(u.name + ' reaches for his gold and finds lint.', 'system');
    return false;
  }

  // ---- statuses ----------------------------------------------------------------------------------------
  DD.registerStatus({
    id: 'zar_drip', name: 'Drip', icon: '💎', color: GOLD, type: 'buff', stacking: 'refresh', maxStacks: DRIP_MAX,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      // the HUD shows this mid-turn: say what the purse is now and what the next check will give
      const step = (st.data && st.data.step) || DRIP_STEP, gold = DD.Act.gold();
      return 'Deals +' + Math.min(DRIP_MAX, st.stacks) * 10 + '% damage (+10% per ' + step + ' gold the party holds, max +30%). ' +
        'The party holds ' + gold + ' gold: the next Drip Check, at the start of his turn, gives +' + U.clamp(Math.floor(gold / step), 0, DRIP_MAX) * 10 + '%.';
    },
    hooks: {
      modifyOutgoingDamage: function (d, st) { if (st && st.stacks > 0) d.mult *= 1 + 0.1 * Math.min(DRIP_MAX, st.stacks); },
    },
  });

  function rebukeDmg(st) { return Math.max(1, Math.round(+(st && st.data && st.data.dmg) || 5)); }
  /** A warded unit was hit by an enemy attack: hellfire lashes back at the attacker (attacks only, so it never loops). */
  function rebukeHit(d, st) {
    const unit = d.target, atk = d.source;
    if (!unit || unit.dead || !atk || atk === unit || !active(atk)) return;
    if (d.cause !== 'skill' || !(d.amount > 0) || !hostile(unit, atk)) return;
    const caster = st && st.source ? DD.Combat.byId(st.source) : null;
    const src = active(caster) && !hostile(caster, unit) ? caster : unit;   // a downed Zarathor neither deals it nor barks
    DD.FX.beam(unit, atk, { color: '#ff5a1f', width: 4 });
    DD.FX.particles(atk, { kind: 'fire', count: 10 });
    DD.Act.log('Hellish Rebuke! ' + atk.name + ' gets roasted for hitting ' + unit.name + '.', 'hero');
    DD.Act.damage(src, atk, rebukeDmg(st), { element: 'fire', cause: 'other', tags: ['fire', 'rebuke'] });
  }
  DD.registerStatus({
    id: 'zar_rebuke', name: 'Hellish Rebuke', icon: '😈', color: '#ff4d2e', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnStart', defaultTurns: 1,
    desc: function (st) { return 'Enemies whose attacks hit it take ' + rebukeDmg(st) + ' fire damage. Lasts until its next turn.'; },
    hooks: { onTakeDamage: function (d, st) { rebukeHit(d, st); } },
  });

  function bonusOf(st) { return Math.max(1, Math.round(+(st && st.data && st.data.bonus) || 4)); }
  /**
   * Is this damage instance part of the status holder's own skill against a foe? A free attack of opportunity is not
   * "its next damaging skill" (like Empowered, it neither uses nor spends the sparkles).
   */
  function ownSkillHit(d) {
    const sk = DD.Act.currentSkill();
    return d.cause === 'skill' && !d.opportunity && !!d.source && !!d.target && d.target !== d.source && hostile(d.source, d.target) &&
      !!sk && sk.user === d.source;
  }
  DD.registerStatus({
    id: 'zar_bedazzled', name: 'Bedazzled', icon: '💅', color: '#ff9cf0', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function (st) { return 'Its next damaging skill deals +' + bonusOf(st) + ' damage to each foe it hits.'; },
    hooks: {
      modifyOutgoingDamage: function (d, st) {
        if (!ownSkillHit(d)) return;
        // once per foe per skill: a multi-strike skill (3 paws, 2 daggers) gets the +N on its first strike only
        const got = st.data.got || (st.data.got = {});
        if (got[d.target.id]) return;
        got[d.target.id] = 1;
        d.flat += bonusOf(st);
        st.data.armed = true;
      },
      onSkillUsed: function (ctx, st) {
        if (ctx.opportunity || !st.data.armed) return;
        st.data.armed = false;
        st.data.got = {};
        if (ctx.user) DD.Act.removeStatus(ctx.user, 'zar_bedazzled', { text: '💅 Sparkles spent' });
      },
    },
  });

  // ---- summon: the Tasteful Statue ----------------------------------------------------------------
  /**
   * Taunt every foe within the statue's radius (quiet: the start-of-turn re-taunt, no popups). Returns how many.
   * A foe charmed onto the heroes' side is left alone: taunted by a statue it may not hit, it would waste the charm.
   */
  function statueTaunt(statue, quiet) {
    if (!active(statue)) return 0;
    const r = Math.max(1, Math.round(+(statue.data && statue.data.r) || 2));
    const side = DD.Grid.effectiveSide(statue);
    const list = DD.Combat.foesOf(statue).filter(function (f) { return DD.Grid.dist(f, statue) <= r && DD.Grid.effectiveSide(f) !== side; });
    list.forEach(function (f) { if (active(f) && active(statue)) DD.Act.addStatus(f, 'taunt', { turns: 1, silent: !!quiet }, statue); });
    return list.length;
  }
  function statueBreak(statue) {
    DD.FX.particles(statue, { kind: 'coins', count: 22 });
    DD.FX.text({ x: statue.x, y: statue.y }, '*CRACK* (tastefully)', { color: GOLD, size: 14 });
    DD.Act.log('The statue shatters. Zarathor will be commissioning another.', 'system');
  }

  // ---- sprites ---------------------------------------------------------------------------------------
  // red tiefling, gold-plated horns (of course), royal purple coat with gold trim, BLING
  const ZAR_PAL = {
    skin: '#c8372d', cloth: '#6a2c9a', cloth2: '#f2c230', hair: '#16101c', metal: '#ffd23a', eye: '#ffe14d',
    accent: FLAME, outline: '#1a0e14', horn: '#f2c230', collar: '#f2c230', pants: '#2c1240', boots: '#1d1020',
    tail: '#b52f27', cast: '#ff9a2a', blush: '#ff6b5a',
  };
  // back-hand position of the 'normal' humanoid build per pose (mirrors sprites.js arm angles)
  const BACK_ARM = { sx: -(13.5 / 2 - 3.5 * 0.35), sy: -19 + 3.5 * 0.75 + 0.4, len: 12 * 0.62 + 3.6 };
  const BACK_ANGLE = { cast: -2.35, hurt: -2.2, attack: 2.05 };
  /** Extra flair over the base humanoid: hellfire dancing in his open (back) hand. */
  function zarOverlay(g, t) {
    if (!g || typeof g.flame !== 'function') return;
    const a = BACK_ANGLE[g.pose] !== undefined ? BACK_ANGLE[g.pose] : 1.95;
    const hx = BACK_ARM.sx + Math.cos(a) * BACK_ARM.len, hy = BACK_ARM.sy + Math.sin(a) * BACK_ARM.len - 1.2;
    const fl = Math.sin(t * 9) * 0.6, lean = Math.sin(t * 5);
    g.glow(hx, hy - 2.5, 6, FLAME, 0.55);
    g.flame(hx, hy, 3.6, 6.6 + fl, 'rgba(255,122,26,0.92)', null, lean * 0.8);
    g.flame(hx, hy, 1.8, 3.8 + fl * 0.5, 'rgba(255,233,120,0.95)', null, lean * 0.4);
  }
  const ZAR_SPRITE = {
    base: 'humanoid', scale: 1, palette: ZAR_PAL, build: 'normal', outfit: 'coat',
    head: { size: 1, ears: 'pointy', horns: 'tiefling', hair: 'none', beard: 'none', hat: 'none', face: 'sunglasses', eyes: 'glow', mouth: 'gold_teeth' },
    wings: 'none', tail: 'devil', mainhand: 'orb', offhand: 'none',
    bling: ['chain', 'rings', 'earrings', 'bracelets', 'grill'], extras: ['collar'],
    aura: { kind: 'flames', color: FLAME },
    overlay: zarOverlay,
  };
  const STATUE_PAL = {
    skin: '#e0ad35', cloth: '#c9971c', cloth2: '#ffe27a', hair: '#b07f12', metal: '#fff4b8', eye: '#8a6510',
    accent: '#ffe27a', outline: '#4a3208', horn: '#a87a14', collar: '#ffe27a', pants: '#b8860b', boots: '#9a7012',
    tail: '#d4a52c', blush: '#e0ad35',
  };
  /** The statue stands on a gold drum plinth with its title engraved (it reads as a monument, not a gold tiefling). */
  function statueOverlay(g, t, o) {
    if (!g || (o && o.lying >= 0.5)) return;
    const r = 11.5, ry = 4, top = -0.5, bot = 3.4;
    g.ellipse(0, bot, r, ry, '#8a6410', true);
    g.rect(-r, top, r * 2, bot - top, '#8a6410', null);
    g.line(-r, top, -r, bot, null, 1.2);
    g.line(r, top, r, bot, null, 1.2);
    g.ellipse(0, top, r, ry, '#e0ad35', true);
    g.ellipse(-3.5, top - 1, 4, 1.2, 'rgba(255,244,184,0.75)', null);
    g.text('ME', 0, bot + 1.9, 3.4, '#ffe27a', '#4a3208');
  }
  const STATUE_SPRITE = {
    base: 'humanoid', scale: 1.05, palette: STATUE_PAL, build: 'normal', outfit: 'coat',
    head: { size: 1, ears: 'pointy', horns: 'tiefling', hair: 'none', beard: 'none', hat: 'none', face: 'sunglasses', eyes: 'normal', mouth: 'gold_teeth', blush: false },
    wings: 'none', tail: 'devil', mainhand: 'orb', offhand: 'none',
    bling: ['chain', 'rings', 'earrings'], extras: ['collar'],
    aura: { kind: 'sparkles', color: '#fff3a0' },
    overlay: statueOverlay,
  };

  DD.registerSummon({
    id: 'zar_statue', name: 'Tasteful Statue', hp: 12, mov: 0, ap: 0, armor: 1,
    tags: ['construct', 'gold', 'statue'], flags: { immovable: true, stunImmune: true }, resist: { poison: 0 },
    sprite: STATUE_SPRITE,
    skills: [],
    names: ['Tasteful Statue', 'Monument to Me', 'Zarathor (Gold Ed.)', 'Bust of Greatness', 'The Thinker (About Me)'],
    hooks: {
      // a hero summon's turn is its owner's: this re-taunts at the start of each of Zarathor's turns
      onTurnStart: function (unit) { statueTaunt(unit, true); },
      onDeath: function (unit) { statueBreak(unit); },
    },
    barks: {
      spawn: ['*gleams majestically*', '*strikes a heroic pose*', '*is extremely tasteful*'],
      hurt: ['*chip*', '*a scratch on the abs*', '*CLANG*'],
      death: ['*shatters into a shower of coins*', '*CRACK* (tastefully)'],
    },
    desc: 'A solid-gold, life-size (if life were nine feet tall) statue of Zarathor. Enemies cannot resist hitting it. Neither can pigeons.',
  });

  // ---- skills ------------------------------------------------------------------------------------------
  function skill(def) { def.owner = 'zarathor'; return DD.registerSkill(def); }

  // Basic: Eldritch Bling — the Burn payoff (Pebbles' bites, Valdris' flame-forged edges, his fire lanes, burning oil)
  skill({
    id: 'zar_basic', name: 'Eldritch Bling', icon: '🔮', kind: 'spell', tags: ['fire', 'ranged', 'combo'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 5, vsBurn: 2 }],
    target: { type: 'unit', range: [1, 4], los: true, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to a foe within 4 (+' + L.vsBurn + ' if it is Burning).'; },
    flavor: 'Eldritch Blast, but bedazzled. Anything already on fire is, in his words, "pre-heated".',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      const hot = DD.Act.hasStatus(t, 'burn');
      DD.FX.projectile(u, t, { kind: 'bolt', color: PURPLE, trail: true });
      DD.FX.particles(t, { kind: hot ? 'fire' : 'coins', count: hot ? 9 : 5 });
      if (hot) DD.FX.text(t, 'Pre-heated!', { color: FLAME, size: 13 });
      DD.Act.damage(u, t, ctx.L.dmg + (hot ? ctx.L.vsBurn : 0), { element: 'fire', skill: ctx.skill, tags: ['fire'] });
    },
  });

  // Gold-Plated Fireball (starter): the AoE payoff for foes someone bunched up
  skill({
    id: 'zar_fireball', name: 'Gold-Plated Fireball', icon: '🔥', kind: 'spell', tags: ['fire', 'aoe', 'ranged'],
    ap: 2, cooldown: 1,
    levels: [{ dmg: 5 }, { dmg: 6 }, { dmg: 7 }],
    target: { type: 'tile', range: [1, 5], los: true, filter: 'any' },
    area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to every foe in radius 1. Ignites oil, webs and explosive barrels there.'; },
    flavor: 'A normal fireball, but gold-plated. It costs nothing extra because he simply says it does.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!p) return;
      DD.FX.projectile(u, p, { kind: 'fireball', color: FLAME, arc: 0.35, size: 1.3 });
      DD.FX.explosion(p, { radius: 1, color: FLAME });
      DD.FX.particles(p, { kind: 'coins', count: 10 });
      ctx.foes.forEach(function (f) { if (active(f)) DD.Act.damage(u, f, ctx.L.dmg, { element: 'fire', skill: ctx.skill, tags: ['fire', 'aoe'] }); });
      ignite(ctx.tiles, u);
    },
  });

  // Throw Money At It (starter): gold for a big hit + Dazzle. Cooldown 2: in v2 a Dazzle spoils the target's whole next
  // attack, so a 1-AP hit + Dazzle every other turn was too much control for the price.
  skill({
    id: 'zar_bling_throw', name: 'Throw Money At It', icon: '💸', kind: 'attack', tags: ['ranged', 'gold'],
    ap: 1, cooldown: 2, hpCost: debtHp,
    levels: [{ dmg: 8, gold: 5 }, { dmg: 10, gold: 5 }, { dmg: 12, gold: 5 }],
    // never at an explosive barrel: the gold is paid in execute, so a barrel shot would be free (Eldritch Bling does barrels)
    target: { type: 'unit', range: [1, 5], los: true, filter: 'enemy', objects: false },
    canUse: canPay,
    desc: function (L) { return 'Spend ' + L.gold + ' gold: hit a foe within 5 for ' + L.dmg + ' damage and Dazzle it.'; },
    flavor: 'When fire can\'t solve it, throw money at it. He has never once picked the coins back up.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t) || !payGold(ctx)) return;
      DD.FX.projectile(u, t, { kind: 'coin', color: GOLD });
      DD.FX.particles(t, { kind: 'coins', count: 14 });
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['gold'] });
      if (active(t)) DD.Act.addStatus(t, 'dazzled', { turns: 1 }, u);
    },
  });

  // Tacky Hex: the Vulnerable setup for the whole party
  skill({
    id: 'zar_hex', name: 'Tacky Hex', icon: '🧿', kind: 'spell', tags: ['ranged', 'debuff', 'vulnerable'],
    ap: 1, cooldown: 2,
    levels: [{ turns: 2, r: 0 }, { turns: 3, r: 0 }, { turns: 3, r: 1 }],
    target: { type: 'unit', range: [1, 5], los: true, filter: 'enemy' },
    area: { shape: 'circle', size: function (L) { return L.r || 0; } },
    desc: function (L) {
      return (L.r ? 'Hex a foe within 5 and every foe next to it: they are' : 'Hex a foe within 5: it is') +
        ' Vulnerable (+25% damage taken) for ' + (L.r ? 'their' : 'its') + ' next ' + L.turns + ' turns.';
    },
    flavor: 'He curses its outfit: socks with sandals, a novelty tie. It will never recover, emotionally or defensively.',
    // AutoPlay: the hex is worth the party's follow-up hits, not just its own status value
    aiScore: function (ctx) { return ctx.foes.filter(function (f) { return f.hp >= 10 && !DD.Act.hasStatus(f, 'vulnerable'); }).length * 2; },
    execute: function (ctx) {
      const u = ctx.user;
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.beam(u, f, { color: '#ff5cc8', width: 2 });
        DD.FX.particles(f, { kind: 'glitter', count: 10 });
        DD.Act.addStatus(f, 'vulnerable', { turns: ctx.L.turns }, u);
      });
    },
  });

  // Bedazzle: an ally's next damaging skill hits harder (best on an ally who hits several foes)
  skill({
    id: 'zar_bedazzle', name: 'Bedazzle', icon: '💅', kind: 'buff', tags: ['buff'],
    ap: 1, cooldown: 1,
    levels: [{ bonus: 4 }, { bonus: 5 }, { bonus: 6 }],
    target: { type: 'unit', range: [1, 4], los: false, filter: 'ally' },
    desc: function (L) { return 'Bedazzle an ally within 4: its next damaging skill deals +' + L.bonus + ' damage to each foe it hits.'; },
    flavor: 'Every weapon is better with rhinestones. Marwyn\'s axe now spells MAGNIFICENT in sequins.',
    aiScore: function (ctx) { return ctx.targetUnit && !DD.Act.hasStatus(ctx.targetUnit, 'zar_bedazzled') ? ctx.L.bonus : 0; },
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      DD.FX.beam(u, t, { color: '#ff9cf0', width: 2 });
      DD.FX.particles(t, { kind: 'glitter', count: 16 });
      const st = DD.Act.addStatus(t, 'zar_bedazzled', { stacks: 1 }, u);
      if (st) st.data.bonus = Math.max(+st.data.bonus || 0, ctx.L.bonus);
    },
  });

  // Hellish Rebuke: ward that burns attackers (put it on whoever is Taunting the room)
  skill({
    id: 'zar_rebuke', name: 'Hellish Rebuke', icon: '😈', kind: 'spell', tags: ['fire', 'buff'],
    ap: 1, cooldown: 2,
    levels: [{ fire: 5 }, { fire: 7 }, { fire: 9 }],
    target: { type: 'unit', range: [0, 4], los: false, filter: 'allyOrSelf' },
    desc: function (L) { return 'Ward himself or an ally within 4 until its next turn: enemies whose attacks hit it take ' + L.fire + ' fire damage.'; },
    flavor: 'Hit me? In THIS economy? In THIS outfit?',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      if (t !== u) DD.FX.beam(u, t, { color: '#ff5a1f', width: 3 });
      DD.FX.particles(t, { kind: 'fire', count: 14 });
      const st = DD.Act.addStatus(t, 'zar_rebuke', { turns: 1 }, u);
      if (st) st.data.dmg = Math.max(+st.data.dmg || 0, ctx.L.fire);
    },
  });

  // Bling Lasso: pull with the gold chain (into a cleave, a pit, the lava, his own fire trail)
  skill({
    id: 'zar_lasso', name: 'Bling Lasso', icon: '⛓️', kind: 'attack', tags: ['pull', 'ranged', 'gold'],
    ap: 1, cooldown: 2,
    levels: [{ dmg: 3, pull: 3, range: 4 }, { dmg: 4, pull: 3, range: 5 }, { dmg: 5, pull: 4, range: 5 }],
    target: { type: 'unit', range: function (L) { return [2, L.range]; }, los: true, filter: 'enemy', straight: true },
    desc: function (L) { return 'Lash a foe in a straight line within ' + L.range + ': deal ' + L.dmg + ' damage and pull it up to ' + L.pull + ' tiles toward him.'; },
    flavor: 'Heavy, gold, and alarmingly long. He insists it is "for emergencies".',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      DD.FX.beam(u, t, { color: GOLD, width: 3 });
      DD.FX.particles(t, { kind: 'coins', count: 6 });
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['pull'] });
      if (active(t)) DD.Act.pull(u, t, u, ctx.L.pull);
    },
  });

  // Fabulous Strut: straight dash that leaves a fire lane (allies push foes into it, the AI walks around it)
  function strutPath(u, p) {
    if (!u || !p || (p.x !== u.x && p.y !== u.y) || (p.x === u.x && p.y === u.y)) return null;
    const dir = U.dirTo(u, p), n = Math.abs(p.x - u.x) + Math.abs(p.y - u.y);
    const out = [];
    let prev = { x: u.x, y: u.y };
    for (let i = 1; i <= n; i++) {
      const q = { x: u.x + dir.x * i, y: u.y + dir.y * i };
      if (!DD.Grid.isFree(q.x, q.y, u) || DD.Grid.isDrop(q.x, q.y) || !DD.Grid.canStep(u, prev, q)) return null;
      out.push(q);
      prev = q;
    }
    return out;
  }
  function fireTrail(u, tiles, turns) {
    tiles.forEach(function (q, i) {
      const tl = DD.Grid.tile(q.x, q.y);
      if (!tl || DD.Grid.unitAt(q.x, q.y)) return;
      DD.Act.applyElement(q.x, q.y, 'fire', u, { noUnits: true });
      const td = DD.Grid.terrain(tl);
      if (!tl.surface && !td.liquid && td.walkable !== false) DD.Act.setSurface(q.x, q.y, 'fire', turns);
      DD.FX.tile(q.x, q.y, 'glow', { color: FLAME, parallel: i > 0 });
    });
  }
  skill({
    id: 'zar_strut', name: 'Fabulous Strut', icon: '🕺', kind: 'move', tags: ['fire', 'move'],
    ap: 1, cooldown: 2,
    levels: [{ len: 3, turns: 2 }, { len: 4, turns: 2 }, { len: 5, turns: 3 }],
    target: {
      type: 'tile', range: function (L) { return [1, L.len]; }, los: false, filter: 'empty', straight: true,
      canTarget: function (ctx) { return strutPath(ctx.user, ctx.target) ? true : 'Something is in the way of the runway.'; },
    },
    canUse: function (ctx) { return ctx.user && DD.Act.cantMove(ctx.user) ? 'Can\'t move! The strut is cancelled.' : true; },
    desc: function (L) { return 'Strut up to ' + L.len + ' tiles in a straight line, leaving fire (' + L.turns + ' rounds) on every tile he leaves.'; },
    flavor: 'The runway is wherever he says it is. The runway is also on fire.',
    execute: function (ctx) {
      const u = ctx.user;
      const path = strutPath(u, ctx.target);
      if (!path || DD.Act.cantMove(u)) return;
      const start = { x: u.x, y: u.y };
      DD.FX.text(u, '🕺 Strut!', { color: '#ffe9a8', size: 14 });
      const walked = DD.Act.moveAlong(u, path) || [];
      const left = [start].concat(walked).filter(function (q) { return q.x !== u.x || q.y !== u.y; });
      fireTrail(u, left, ctx.L.turns);
      if (walked.length) DD.FX.particles(u, { kind: 'glitter', count: 10 });
    },
  });

  // Gold Plating: gold for Block
  skill({
    id: 'zar_gold_plating', name: 'Gold Plating', icon: '🥇', kind: 'buff', tags: ['buff', 'gold'],
    ap: 1, cooldown: 2, hpCost: debtHp,
    levels: [{ block: 8, gold: 6 }, { block: 10, gold: 6 }, { block: 12, gold: 6 }],
    target: { type: 'unit', range: [0, 4], los: false, filter: 'allyOrSelf' },
    canUse: canPay,
    desc: function (L) { return 'Spend ' + L.gold + ' gold: gold-plate himself or an ally within 4 for ' + L.block + ' Block.'; },
    flavor: 'Armor is just jewelry that commits.',
    execute: function (ctx) {
      const t = ctx.targetUnit;
      if (!active(t) || !payGold(ctx)) return;
      DD.FX.particles(t, { kind: 'coins', count: 16 });
      DD.Act.addBlock(t, ctx.L.block);
    },
  });

  // Statue of Me: a gold decoy that keeps the room's attention (once per combat)
  skill({
    id: 'zar_statue', name: 'Statue of Me', icon: '🏆', kind: 'summon', tags: ['summon', 'taunt', 'gold'],
    ap: 2, cooldown: 0, charges: 1,
    levels: [{ hp: 12, r: 2 }, { hp: 18, r: 2 }, { hp: 24, r: 3 }],
    target: { type: 'tile', range: [1, 3], los: false, filter: 'empty' },
    desc: function (L) {
      return 'Unveil a ' + L.hp + '-HP gold statue of himself within 3. It Taunts foes within ' + L.r +
        ' now and whenever his turn starts. Once per combat.';
    },
    flavor: 'Life-size. Well, life-size if life were nine feet tall, had abs, and wore sunglasses indoors.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target, L = ctx.L;
      if (!p) return;
      const def = DD.getSummon('zar_statue');
      const s = DD.Act.summon(u, 'zar_statue', p.x, p.y, { level: ctx.level, hpMult: L.hp / ((def && def.hp) || 12) });
      if (!s) return;
      s.data.r = L.r;
      DD.FX.particles(s, { kind: 'coins', count: 18 });
      DD.FX.text(s, 'BEHOLD: ME.', { color: GOLD, size: 16 });
      DD.Act.log(u.name + ' unveils a tasteful monument to himself. The enemies cannot look away.', 'hero');
      statueTaunt(s);
    },
  });

  // Wild Card: deliberately set off wild magic, the brief's other obsession
  skill({
    id: 'zar_wild_card', name: 'Wild Card', icon: '🃏', kind: 'buff', tags: ['random', 'wild'],
    ap: 1, cooldown: 1, charges: 2,
    levels: [{ n: 1, good: 0 }, { n: 1, good: 1 }, { n: 2, good: 1 }],
    target: { type: 'self' },
    desc: function (L) {
      if (!L.good) return 'Set off a Wild Surge (mostly good, sometimes not). 2 uses per combat.';
      return (L.n > 1 ? 'Set off two good Wild Surges.' : 'Set off a good Wild Surge.') + ' 2 uses per combat.';
    },
    flavor: 'It\'s not a spell. It\'s a lifestyle.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.particles(u, { kind: 'glitter', count: 16 });
      for (let i = 0; i < (ctx.L.n || 1); i++) {
        if (!active(u)) break;
        wildSurge(u, 'wild card', !!ctx.L.good);
      }
    },
  });

  // Signature: Bling Supernova
  skill({
    id: 'zar_signature', name: 'Bling Supernova', icon: '💥', kind: 'spell', tags: ['fire', 'aoe', 'ranged'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 18 }],
    target: { type: 'tile', range: [0, 5], los: true, filter: 'any' },
    area: { shape: 'circle', size: 2 },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to every foe within 2 tiles of the target and Dazzle the survivors.'; },
    flavor: 'Do not look directly at the bling. Do not look directly at the bling. DO NOT LOOK DIRECTLY AT THE—',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!p) return;
      DD.FX.banner('BLING SUPERNOVA', { sub: 'Do not look directly at the drip', color: GOLD, ms: 900 });
      DD.FX.flash('#fff1a8', 260);
      DD.FX.projectile(u, p, { kind: 'orb', color: GOLD, trail: true, size: 1.6 });
      DD.FX.explosion(p, { radius: 2, color: GOLD });
      DD.FX.explosion(p, { radius: 1, color: FLAME, parallel: true });
      DD.FX.shake(12, 500);
      DD.FX.particles({ x: p.x, y: p.y, h: 6 }, { kind: 'coins', count: 40 });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.Act.damage(u, f, ctx.L.dmg, { element: 'fire', skill: ctx.skill, tags: ['fire', 'aoe'] });
        if (active(f)) DD.Act.addStatus(f, 'dazzled', { turns: 1 }, u);
      });
    },
  });

  // ---- items ------------------------------------------------------------------------------------------
  DD.registerItem({
    id: 'zar_ring_bling', name: 'Ring of Excessive Bling', slot: 'trinket', rarity: 'rare', icon: '💍', hero: 'zarathor',
    stats: { dmg: 0.05 },
    desc: '+5% damage. Drip Check counts every 30 gold instead of every 50 (still max +30%).',
    flavor: 'One ring to rule them all? Amateur. He wears eleven, and one of them has a smaller ring on it.',
    hooks: {},
  });
  DD.registerItem({
    id: 'zar_hellcard', name: 'Platinum Hellcard', slot: 'weapon', rarity: 'rare', icon: '💳', hero: 'zarathor',
    stats: { dmg: 0.1 },
    desc: '+10% damage. When the party can\'t afford one of his gold skills, he pays the missing gold in HP instead (1 HP per gold).',
    flavor: 'Buy now, pay later. Interest rate: 666%. Customer service: eternal.',
    hooks: {},
  });
  DD.registerItem({
    id: 'zar_shades', name: 'Shades of Indoor Brilliance', slot: 'armor', rarity: 'legendary', icon: '🕶️', hero: 'zarathor',
    stats: { hp: 6, armor: 1 },
    desc: '+6 max HP, +1 armor. Enemies whose attacks hit him are Dazzled.',
    flavor: 'The future is so bright. So is the present. So is he, specifically.',
    hooks: {
      onTakeDamage: function (d) {
        const me = d.target, atk = d.source;
        if (!active(me) || !active(atk) || atk === me || d.cause !== 'skill' || !(d.amount > 0) || !hostile(me, atk)) return;
        DD.FX.text(atk, '😎 Too bright!', { color: GOLD, size: 13 });
        DD.Act.addStatus(atk, 'dazzled', { turns: 1 }, me);
      },
    },
  });

  // ---- the hero -----------------------------------------------------------------------------------------
  DD.registerHero({
    id: 'zarathor', name: 'Zarathor', epithet: 'the Bedazzled', race: 'Tiefling', cls: 'Warlock',
    role: 'Ranged fire, bling and wild magic', complexity: 2,
    blurb: 'A tiefling warlock who sold his soul for unlimited bling and is still waiting on the "unlimited" part. ' +
      'He hits harder the richer the party is, literally throws money at problems, and sets off wild magic like a man who has never read a warning label.',
    color: '#e25822',
    unlock: null,
    stats: { hp: 24, ap: 3, mov: 4, armor: 0, init: 1 },
    growth: { hp: 4 },
    flags: {},
    sprite: ZAR_SPRITE,
    basic: 'zar_basic',
    signature: 'zar_signature',
    passive: {
      name: 'Drip Check',
      desc: 'At the start of each of his turns: +10% damage for every 50 gold the party holds (max +30%).',
      hooks: {
        onCombatStart: function (unit) { assessDrip(unit); },
        onTurnStart: function (unit) { assessDrip(unit); },
      },
    },
    startingSkills: ['zar_fireball', 'zar_bling_throw'],
    skillPool: ['zar_fireball', 'zar_bling_throw', 'zar_hex', 'zar_bedazzle', 'zar_rebuke', 'zar_lasso', 'zar_strut',
      'zar_gold_plating', 'zar_statue', 'zar_wild_card'],
    summons: ['zar_statue'],
    barks: {
      select: ['Zarathor, the Bedazzled. Autographs after the fight.', 'Drip check? Passed. Obviously.', 'Point me at something flammable.',
        'Careful. The rings are load-bearing.', 'Sunglasses stay on. The future is too bright.'],
      start: ['Let\'s light this place up. Literally.', 'Nobody scuff the bling and nobody gets hurt. Much.', 'Roll for initiative! Mine\'s a gold d20.',
        'Marwyn, you\'re standing in my good light.', 'Hope these goons brought a fire extinguisher.'],
      move: ['Strutting. Do not interrupt the strut.', 'Make way for the main character.', 'Every floor is a runway if you believe.',
        'This dungeon should be honored, frankly.', 'Attacks of opportunity? I only take opportunities.'],
      kill: ['And THAT is why you accessorize.', 'Crispy. Golden brown. Perfection.', 'You\'ve been bedazzled. Fatally.',
        'Too much drip? No. Just enough.', 'Next! I have sparkle to spare.'],
      hurt: ['Not the face! Not the rings!', 'Ow! Do you know what this coat cost?', 'You scratched the gold leaf, you animal!',
        'Rude. Incredibly, unfashionably rude.', 'That\'s coming out of your loot.'],
      lowhp: ['I\'m fine! The sunglasses hide the panic.', 'Josiah? Ellaria? Somebody heal the talent!', 'Bleeding on velvet. A true tragedy.',
        'Okay, wild magic. Do not fail me now.', 'Valdris! Forge me some armor! Gold, if you have it!'],
      downed: ['Tell my rings... I loved them...', 'Bury me with the bling. ALL of the bling.', 'Tragic. Iconic, but tragic.',
        'It was the shades. I couldn\'t see. Worth it.'],
      revive: ['The legend returns! Lightly singed.', 'Did anyone touch my stuff? I\'m counting rings.', 'Death? Not in this outfit.',
        'Back, baby. Back and shinier than ever.'],
      ally_down: ['Nooo! That one still owes me twelve gold!', 'Hero down! Gently, people! Mind the coat!', 'Hold on! I\'ll avenge you. Fabulously.',
        'Betty! Stop eating the loot! We have a hero down!', 'Professor Marbles, wake up! Someone\'s down!',
        'Pebbles, fetch help! No, not a stick! HELP!'],
      levelup: ['Level up! New bling unlocked.', 'More power? Put it on my tab.', 'I\'ve grown. Mostly my ego, but still.',
        'Ding! That\'s the sound of my value rising.'],
      victory: ['Another win for the well-dressed.', 'Drip check: passed. Enemies: failed.', 'Loot first. Then more loot. Then a nap.',
        'Mayor Buga, hands off. I saw that coin first.', 'Kiri, check the ethereal plane. Any loot? For me?'],
      idle: ['Is it hot in here, or is it me? It\'s me.', 'Hjalmar. My ring. The big one. I know it was you.', 'Syllamin, your heckles need more sparkle.',
        'Slate, you\'d look amazing in gold leaf.', 'Basanos, you are shedding on the velvet. Again.', 'Wild magic is just magic with ambition.'],
      signature: ['BLING SUPERNOVA! Avert your eyes!', 'Behold! MAXIMUM DRIP!', 'Feel the shine! FEEL IT!', 'Fire, gold and bad decisions!',
        'Look upon my bling, ye mighty, and despair!'],
    },
  });

  /** Small public surface for tests, the codex and other content (read-only helpers). */
  DD.Zarathor = {
    dripStep: dripStep,
    dripTier: dripTier,
    assessDrip: assessDrip,
    strutPath: strutPath,
    statueTaunt: statueTaunt,
    wildSurge: wildSurge,
  };
})();
