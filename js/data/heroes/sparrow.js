/* Dungeons and Degenerates — js/data/heroes/sparrow.js
 * Hero: Sparrow the Hemogoblin, goblin blood mage (she/her). v2 kit, one verb per skill: most of her spells cost HP,
 * and her passive Blood Price makes an adjacent Bleeding foe pay those costs instead. Bleed is her signature status:
 * her own payoffs (Juice Box, Blood Puppet Show) and every ally who shoves a Bleeding foe cash it in. Registers the
 * hero, 12 skills (basic, signature, 10 pool skills), the Blood Clone summon (+2 summon skills) and 3 hero items.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const BLOOD = '#c0102a';
  const BLOOD_HI = '#ff3b5c';
  const DONOR_RANGE = 1;   // Blood Price: an adjacent Bleeding foe pays
  const CARD_RANGE = 3;    // ...up to 3 tiles away with the Organ Donor Card
  const SLURP = 3;         // Bloodsucker's Bib: HP per blood puddle slurped

  // ---- helpers (runtime only) -----------------------------------------------------------------------
  function A() { return DD.Act; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function hasItem(u, id) { return !!u && Array.isArray(u.items) && u.items.indexOf(id) >= 0; }
  function bleedStacks(u) { const st = DD.Act.getStatus(u, 'bleed'); return st ? st.stacks : 0; }

  /** Bleed stacks Sparrow applies (the Shiv of Sharing adds 1). Works with user === null for descriptions. */
  function bleedN(n, user) { return n + (hasItem(user, 'spa_shiv_of_sharing') ? 1 : 0); }
  function bleed(src, target, n) {
    if (!active(target)) return null;
    return A().addStatus(target, 'bleed', { stacks: bleedN(n, src) }, src);
  }

  // ---- Blood Price: someone else's blood ------------------------------------------------------------
  function ownSkill(def) { return !!def && def.owner === 'sparrow'; }
  function donorRange(u) { return hasItem(u, 'spa_donor_card') ? CARD_RANGE : DONOR_RANGE; }

  /**
   * Who pays Sparrow's blood price: the nearest Bleeding foe in reach (most Bleed on a tie). Never an invulnerable
   * foe, nor the one charming her (a charmed hero can't hurt her charmer, DESIGN §4.4).
   */
  function donorFor(u) {
    const s = DD.Combat && DD.Combat.state;
    if (!s || !active(u)) return null;
    const r = donorRange(u);
    const charm = A().getStatus(u, 'charmed');
    let best = null, bd = 0, bs = 0;
    for (let i = 0; i < s.units.length; i++) {
      const o = s.units[i];
      if (!active(o) || !DD.Grid.hostile(u, o)) continue;
      if (A().hasStatus(o, 'invulnerable') || (o.flags && o.flags.invulnerable)) continue;
      if (charm && charm.source === o.id) continue;
      const st = A().getStatus(o, 'bleed');
      if (!st) continue;
      const d = DD.Grid.dist(u, o);
      if (d > r) continue;
      if (!best || d < bd || (d === bd && st.stacks > bs)) { best = o; bd = d; bs = st.stacks; }
    }
    return best;
  }

  /** HP cost of a skill as if no donor stood around (every other modifyCost hook still applies). */
  function rawHpCost(u, def, level) {
    const L = DD.skillLevel(def, level || 1);
    const c = { unit: u, skill: def, level: level || 1, ap: 0, hp: DD.resolve(def.hpCost, L, u, 0), spaNoDonor: true };
    DD.Hooks.fire('modifyCost', u, c);
    return Math.max(0, Math.round(+c.hp || 0));
  }

  /**
   * onCostPaid: modifyCost charged her nothing because a donor stood in reach, so the donor pays now. Combat.pay()
   * fires this right after costOf, nothing moved in between: it is the same donor. Resolves that don't pay (previews by
   * def, free "make an attack" effects) never charge anybody.
   */
  function payBloodPrice(p) {
    const u = p && p.unit;
    if (!p || p.consumable || !active(u) || !ownSkill(p.skill) || p.hpCost > 0) return;
    const cost = rawHpCost(u, p.skill, p.level);
    if (cost <= 0) return;
    const donor = donorFor(u);
    if (!donor) return;
    DD.FX.beam(donor, u, { color: BLOOD, width: 3 });
    DD.FX.particles(donor, { kind: 'blood', count: 10 });
    A().log(donor.name + ' pays ' + u.name + '\'s blood price (' + cost + ' HP).', 'status');
    // status damage: no Empowered / Inspired / item bonuses, no thorns, doesn't break her Stealth
    A().damage(u, donor, cost, { cause: 'status', tags: ['bleed', 'blood_price'], ignoreBlock: true });
  }

  // ---- small shared bits ---------------------------------------------------------------------------
  /** The skill's target unit if it is an active foe of the user (execute may be reached with odd targets). */
  function foeOf(ctx) {
    const u = ctx.targetUnit;
    return active(u) && u !== ctx.user && DD.Grid.hostile(ctx.user, u) ? u : null;
  }
  function lunge(ctx, at) { if (at) DD.FX.lunge(ctx.user, at); }
  function glob(from, to) { DD.FX.projectile(from, to, { kind: 'orb', color: BLOOD, trail: true, size: 1.2 }); }

  /** Blood Puppet Show's area: tiles of active hostile Bleeding units within L.r of Sparrow. */
  function bleedingFoeTiles(ctx) {
    const u = ctx && ctx.user, s = ctx && ctx.state, L = (ctx && ctx.L) || {};
    if (!u || !s) return [];
    const out = [];
    s.units.forEach(function (o) {
      if (!active(o) || !DD.Grid.hostile(u, o) || !A().hasStatus(o, 'bleed')) return;
      if (DD.Grid.dist(u, o) <= (L.r || 0)) out.push({ x: o.x, y: o.y });
    });
    return out;
  }

  /** Free tile next to a foe for Vein Glory (closest to Sparrow, hazards last), or her own tile if adjacent. */
  function landingSpot(user, foe) {
    if (!user || !foe) return null;
    if (DD.Grid.dist(user, foe) === 1) return { x: user.x, y: user.y };
    let best = null, bd = Infinity;
    DD.util.DIRS.forEach(function (d) {
      const x = foe.x + d.x, y = foe.y + d.y;
      if (!DD.Grid.isFree(x, y, user) || DD.Grid.isDrop(x, y)) return;
      const sc = Math.abs(x - user.x) + Math.abs(y - user.y) + (DD.Grid.hazardAt(x, y, user) ? 20 : 0);
      if (sc < bd) { bd = sc; best = { x: x, y: y }; }
    });
    return best;
  }

  function skill(def) {
    def.owner = def.owner || 'sparrow';
    return DD.registerSkill(def);
  }

  // ---- basic & signature ---------------------------------------------------------------------------
  skill({
    id: 'spa_basic', name: 'Shiv Happens', icon: '🔪', kind: 'attack', tags: ['melee', 'bleed'], ap: 1,
    levels: [{ dmg: 4, bleed: 1 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L, user) { return 'Deal ' + L.dmg + ' damage and Bleed ' + bleedN(L.bleed, user) + '.'; },
    flavor: 'Stab first. Brood later.',
    execute: function (ctx) {
      const u = foeOf(ctx);
      if (!u) return;
      lunge(ctx, u);
      A().damage(ctx.user, u, ctx.L.dmg);
      bleed(ctx.user, u, ctx.L.bleed);
    },
  });

  skill({
    id: 'spa_signature', name: 'Crimson Tide', icon: '🌊', kind: 'spell', tags: ['aoe', 'blood', 'bleed'], ap: 2, hype: 100,
    hpCost: function (L, user) { return user && user.hp > 1 ? Math.floor(user.hp / 2) : 0; },
    levels: [{ dmg: 16, bleed: 3, r: 3 }],
    target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L, user) {
      return 'Costs half your current HP. Every foe within ' + L.r + ' tiles takes ' + L.dmg + ' damage and gains Bleed ' + bleedN(L.bleed, user) + '.';
    },
    flavor: 'She opened a vein. The DM opened a new tab to google "can goblins do that".',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      DD.FX.banner('CRIMSON TIDE', { sub: 'Surf\'s up. The surf is blood.', color: BLOOD_HI, ms: 900 });
      DD.FX.flash('#8f0a1e', 260);
      DD.FX.explosion(u, { radius: L.r, color: BLOOD });
      DD.FX.shake(10, 450);
      DD.FX.sound('splash');
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.particles(f, { kind: 'blood', count: 14 });
        A().damage(u, f, L.dmg, { tags: ['blood'] });
        bleed(u, f, L.bleed);
      });
    },
  });

  // ---- skill pool -----------------------------------------------------------------------------------
  // setups: Hemo-Glob, Thousand Paper Cuts (Bleed for her passive, Juice Box and every ally's shove), Blood Drive
  // (an ally's next big hit), Blood Puppet Show (Bleeding foes dragged into pits, lava, water or an ally's AoE)
  skill({
    id: 'spa_hemoglob', name: 'Hemo-Glob', icon: '🩸', kind: 'spell', tags: ['ranged', 'blood', 'bleed'], ap: 1, hpCost: 2, cooldown: 1,
    levels: [{ dmg: 6, bleed: 1 }, { dmg: 8, bleed: 1 }, { dmg: 9, bleed: 2 }],
    target: { type: 'unit', range: [1, 5], filter: 'enemy', los: true },
    desc: function (L, user) { return 'Lob your own blood at a foe within 5: deal ' + L.dmg + ' damage and Bleed ' + bleedN(L.bleed, user) + '.'; },
    flavor: 'It\'s not a phase. It\'s a projectile.',
    execute: function (ctx) {
      const u = foeOf(ctx);
      if (!u) return;
      glob(ctx.user, u);
      A().damage(ctx.user, u, ctx.L.dmg, { tags: ['blood'] });
      bleed(ctx.user, u, ctx.L.bleed);
    },
  });

  skill({
    id: 'spa_juicebox', name: 'Juice Box', icon: '🧃', kind: 'spell', tags: ['blood', 'drain', 'heal'], ap: 2, cooldown: 2,
    levels: [{ dmg: 5, per: 2 }, { dmg: 7, per: 2 }, { dmg: 8, per: 3 }],
    target: { type: 'unit', range: [1, 2], filter: 'enemy', los: true },
    desc: function (L) {
      return 'Drain a foe within 2: deal ' + L.dmg + ' damage +' + L.per + ' per Bleed on it, and heal half the damage dealt (rounded up).';
    },
    flavor: 'Fruit punch flavor. The fruit is you.',
    aiScore: function (ctx) { return ctx.targetUnit ? bleedStacks(ctx.targetUnit) : 0; },
    execute: function (ctx) {
      const user = ctx.user, u = foeOf(ctx), L = ctx.L;
      if (!u) return;
      const stacks = bleedStacks(u);
      DD.FX.beam(u, user, { color: BLOOD, width: 2 });
      DD.FX.particles(u, { kind: 'blood', count: 6 + stacks * 3 });
      const dealt = A().damage(user, u, L.dmg + L.per * stacks, { tags: ['blood', 'drain'] });
      if (dealt > 0 && active(user)) A().heal(user, user, Math.ceil(dealt / 2));
    },
  });

  skill({
    id: 'spa_papercuts', name: 'Thousand Paper Cuts', icon: '📄', kind: 'spell', tags: ['aoe', 'ranged', 'bleed'], ap: 2, hpCost: 2, cooldown: 2,
    levels: [{ dmg: 3, bleed: 2 }, { dmg: 4, bleed: 2 }, { dmg: 5, bleed: 3 }],
    target: { type: 'tile', range: [1, 4], filter: 'any', los: true }, area: { shape: 'circle', size: 1 },
    desc: function (L, user) {
      return 'Blood confetti on a tile within 4: every foe in radius 1 takes ' + L.dmg + ' damage and gains Bleed ' + bleedN(L.bleed, user) + '.';
    },
    flavor: 'She counted. It\'s exactly a thousand. Goblins have a lot of free time.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (ctx.target) {
        DD.FX.projectile(u, ctx.target, { kind: 'orb', color: '#f3e9e6', size: 0.8 });
        DD.FX.explosion(ctx.target, { radius: 1, color: BLOOD });
      }
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.particles(f, { kind: 'blood', count: 8 });
        A().damage(u, f, L.dmg, { tags: ['bleed'] });
        bleed(u, f, L.bleed);
      });
    },
  });

  skill({
    id: 'spa_spray', name: 'Say It, Don\'t Spray It', icon: '💦', kind: 'spell', tags: ['aoe', 'blood', 'dazzle'], ap: 2, hpCost: 2, cooldown: 2,
    levels: [{ dmg: 3, len: 2 }, { dmg: 4, len: 2 }, { dmg: 5, len: 3 }],
    target: { type: 'dir' }, area: { shape: 'cone', size: function (L) { return L.len; } },
    desc: function (L) {
      return 'Spray a cone of length ' + L.len + ': foes take ' + L.dmg + ' damage and are Dazzled (their next attacks land 1 tile off).';
    },
    flavor: 'Nobody asked for the arterial weather report.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      const far = ctx.tiles[ctx.tiles.length - 1];
      if (far) DD.FX.beam(u, far, { color: BLOOD, width: 7 });
      DD.FX.sound('splash');
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(u, f, L.dmg, { tags: ['blood'] });
        if (active(f)) A().addStatus(f, 'dazzled', { turns: 1 }, u);
      });
    },
  });

  skill({
    id: 'spa_scab', name: 'Scab Armor', icon: '🩹', kind: 'buff', tags: ['defense', 'blood'], ap: 1, hpCost: 3, cooldown: 2,
    levels: [{ block: 8 }, { block: 10 }, { block: 12, thorns: 3 }],
    target: { type: 'self' },
    desc: function (L) {
      return 'Gain ' + L.block + ' Block' + (L.thorns ? ', plus Thorns ' + L.thorns + ' until the end of your next turn.' : '.');
    },
    flavor: 'Crunchy on the outside. Edgy on the inside.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'blood', count: 10 });
      A().addBlock(u, L.block);
      if (L.thorns) A().addStatus(u, 'thorns', { stacks: L.thorns, turns: 1 }, u);
    },
  });

  skill({
    id: 'spa_goblinmode', name: 'Goblin Mode', icon: '👺', kind: 'move', tags: ['move', 'stealth'], ap: 1, cooldown: 3,
    levels: [{ r: 4 }, { r: 5 }, { r: 6 }],
    target: { type: 'tile', range: function (L) { return [1, L.r]; }, filter: 'empty', los: false },
    desc: function (L) {
      return 'Teleport to an empty tile within ' + L.r + ' and turn Stealthed until the end of your next turn (enemies ignore you).';
    },
    flavor: 'Unhinged. Feral. Gone. Classic goblin.',
    aiScore: function (ctx) { return ctx.user && ctx.user.hp < ctx.user.maxHp * 0.5 ? 3 : 0; },
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u) || !ctx.target) return;
      DD.FX.particles(u, { kind: 'smoke', count: 10 });
      if (!A().teleport(u, ctx.target.x, ctx.target.y) || !active(u)) return;
      A().addStatus(u, 'stealth', { turns: 1 }, u);
    },
  });

  skill({
    id: 'spa_puppet', name: 'Blood Puppet Show', icon: '🎭', kind: 'spell', tags: ['push', 'control', 'bleed'], ap: 1, hpCost: 2, cooldown: 2,
    levels: [{ r: 4, push: 2 }, { r: 5, push: 2 }, { r: 5, push: 3 }],
    target: { type: 'dir', canTarget: function (ctx) { return ctx.foes.length ? true : 'No Bleeding foe within range.'; } },
    area: { shape: 'custom', fn: bleedingFoeTiles },
    canUse: function (ctx) { return bleedingFoeTiles(ctx).length ? true : 'No Bleeding foe within ' + ctx.L.r + ' tiles.'; },
    desc: function (L) { return 'Drag every Bleeding foe within ' + L.r + ' tiles ' + L.push + ' tiles in the chosen direction.'; },
    flavor: 'Tonight\'s show: "Into the Pit", a tragedy in one act.',
    aiScore: function (ctx) { return ctx.foes.length * 2; },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, dir = ctx.dir;
      if (!dir || (!dir.x && !dir.y)) return;
      // the foe farthest along the drag goes first, so the line doesn't trip over itself
      const along = function (f) { return f.x * dir.x + f.y * dir.y; };
      ctx.foes.slice().sort(function (a, b) { return along(b) - along(a); }).forEach(function (f) {
        if (!active(f) || !A().hasStatus(f, 'bleed')) return;
        DD.FX.beam(u, f, { color: BLOOD, width: 2 });
        A().push(u, f, dir, L.push);
      });
    },
  });

  skill({
    id: 'spa_twin', name: 'Evil Twin', icon: '👥', kind: 'summon', tags: ['summon', 'taunt', 'blood'], ap: 2, hpCost: 4, cooldown: 1, charges: 2,
    levels: [{ hp: 8, r: 1 }, { hp: 11, r: 1 }, { hp: 14, r: 2 }],
    target: { type: 'tile', range: [1, 3], filter: 'empty', los: false },
    desc: function (L) {
      return 'Summon a Blood Clone (' + L.hp + ' HP) within 3; foes ' + (L.r > 1 ? 'within ' + L.r + ' tiles of' : 'next to') +
        ' it are Taunted. 2 per fight.';
    },
    flavor: 'Same face, same knives, worse attitude. Somehow.',
    aiScore: function () { return 4; },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u) || !ctx.target) return;
      DD.FX.particles(ctx.target, { kind: 'blood', count: 16 });
      const def = DD.getSummon('spa_clone');
      const c = A().summon(u, 'spa_clone', ctx.target.x, ctx.target.y, { level: ctx.level, hpMult: L.hp / ((def && def.hp) || 8) });
      if (!c) return;
      DD.Combat.foesOf(c).forEach(function (f) {
        if (active(f) && DD.Grid.dist(c, f) <= L.r) A().addStatus(f, 'taunt', { turns: 1 }, c);
      });
    },
  });

  skill({
    id: 'spa_blooddrive', name: 'Blood Drive', icon: '💉', kind: 'buff', tags: ['heal', 'buff', 'blood'], ap: 1, hpCost: 3, cooldown: 2,
    levels: [{ heal: 4 }, { heal: 6 }, { heal: 8 }],
    target: { type: 'unit', range: [1, 4], filter: 'ally', los: false },
    desc: function (L) { return 'An ally within 4 heals ' + L.heal + ' HP and is Empowered (its next damaging skill deals +50%).'; },
    flavor: 'Free cookie with every pint. The cookie is also blood.',
    aiScore: function (ctx) { return ctx.targetUnit && !A().hasStatus(ctx.targetUnit, 'empowered') ? 3 : 0; },
    execute: function (ctx) {
      const u = ctx.user, a = ctx.targetUnit, L = ctx.L;
      if (!active(a) || a === u || DD.Grid.hostile(u, a)) return;
      DD.FX.beam(u, a, { color: BLOOD, width: 3 });
      DD.FX.particles(a, { kind: 'hearts', count: 6 });
      A().heal(u, a, L.heal);
      if (active(a)) A().addStatus(a, 'empowered', {}, u);
    },
  });

  skill({
    id: 'spa_veinglory', name: 'Vein Glory', icon: '🗡️', kind: 'attack', tags: ['melee', 'blood', 'move'], ap: 3, hpCost: 4, cooldown: 3,
    levels: [{ dmg: 15 }, { dmg: 19 }, { dmg: 22 }],
    target: {
      type: 'unit', range: [1, 3], filter: 'enemy', los: true,
      canTarget: function (ctx) { return ctx.targetUnit && landingSpot(ctx.user, ctx.targetUnit) ? true : 'No room to land next to it.'; },
    },
    desc: function (L) { return 'Dart next to a foe within 3 and gut it for ' + L.dmg + ' damage.'; },
    flavor: 'Glory to the veins! Specifically, theirs.',
    execute: function (ctx) {
      const u = ctx.user, f = foeOf(ctx);
      if (!f || !active(u)) return;
      const spot = landingSpot(u, f);
      if (!spot) return;
      if ((spot.x !== u.x || spot.y !== u.y) && !A().teleport(u, spot.x, spot.y)) return;
      if (!active(u) || !active(f) || DD.Grid.dist(u, f) !== 1) return;
      A().face(u, f);
      lunge(ctx, f);
      DD.FX.particles(f, { kind: 'blood', count: 16 });
      A().damage(u, f, ctx.L.dmg, { tags: ['blood'] });
    },
  });

  // ---- Blood Clone (Evil Twin) ----------------------------------------------------------------------
  skill({
    id: 'spa_clone_shiv', name: 'Copycat Shiv', owner: 'summon', icon: '🔪', kind: 'attack', tags: ['melee', 'bleed'], ap: 1,
    levels: [{ dmg: 3, bleed: 1 }, { dmg: 4, bleed: 1 }, { dmg: 5, bleed: 1 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage and Bleed ' + L.bleed + '.'; },
    flavor: 'Plagiarism, but stabbier.',
    execute: function (ctx) {
      const u = foeOf(ctx);
      if (!u) return;
      lunge(ctx, u);
      A().damage(ctx.user, u, ctx.L.dmg);
      if (active(u)) A().addStatus(u, 'bleed', { stacks: ctx.L.bleed }, ctx.user);
    },
  });
  skill({
    id: 'spa_clone_taunt', name: 'Hey, Ugly!', owner: 'summon', icon: '😝', kind: 'utility', tags: ['taunt', 'aoe'], ap: 1, cooldown: 1,
    levels: [{ r: 2 }, { r: 2 }, { r: 3 }],
    target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Foes within ' + L.r + ' tiles are Taunted (on their next turn they must attack the clone).'; },
    flavor: '"No, I\'M the real Sparrow!" Nobody asked.',
    aiScore: function (ctx) { return ctx.foes.length * 3; },
    execute: function (ctx) {
      DD.FX.text(ctx.user, 'HEY, UGLY!', { color: BLOOD_HI, size: 15 });
      ctx.foes.forEach(function (f) { if (active(f)) A().addStatus(f, 'taunt', { turns: 1 }, ctx.user); });
    },
  });

  /** Sparrow's long goblin ears poking out of the hood (head centre (hx, -20.9), radius 10.5 for her head spec). */
  function bigEars(g, t, hx, skin, inner) {
    const hy = -20.9, r = 10.5;
    const twitch = Math.sin(t * 1.3) > 0.97 ? r * 0.18 : 0;
    for (let s = -1; s <= 1; s += 2) {
      const tipY = hy - r * 0.46 - (s > 0 ? twitch : 0);
      g.poly([[hx + s * r * 0.96, hy - r * 0.34], [hx + s * r * 2.35, tipY], [hx + s * r * 1.02, hy + r * 0.3]], skin);
      g.poly([[hx + s * r * 1.12, hy - r * 0.18], [hx + s * r * 2.02, tipY + r * 0.1], [hx + s * r * 1.14, hy + r * 0.14]], inner, null);
    }
  }
  function poseShift(o) { const p = o && o.pose; return p === 'attack' ? 1.2 : p === 'hurt' ? -0.8 : 0; }

  function cloneOverlay(g, t, o) {
    bigEars(g, t, poseShift(o), '#c8203f', '#ff8a9a');
    // drips running down the body + a bloody puddle at the feet
    g.ellipse(0, 0.6, 9, 2.6, 'rgba(160,10,30,0.55)', null);
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.6 + i / 3) % 1, x = -4 + i * 4;
      g.ellipse(x, -9 + k * 8, 0.9, 1.4, 'rgba(255,70,100,' + (0.9 - k * 0.7).toFixed(2) + ')', null);
    }
  }

  DD.registerSummon({
    id: 'spa_clone', name: 'Blood Clone', hp: 8, mov: 4, ap: 2, armor: 0, tags: ['blood', 'clone'], flags: {},
    names: ['Sparrow?', 'Worraps', 'Also Sparrow', 'Sparrow 2', 'Definitely Sparrow', 'Evil Sparrow', 'Sparrow (Director\'s Cut)'],
    sprite: {
      base: 'humanoid', scale: 0.8, build: 'tiny', outfit: 'rags',
      palette: { skin: '#c8203f', cloth: '#7d0b20', cloth2: '#5a0616', hair: '#3a0610', metal: '#ffb3bf', eye: '#fff0f3',
        accent: '#ff3b5c', outline: '#2a0208', inner: '#ff8a9a' },
      head: { size: 1.12, ears: 'goblin', hat: 'hood', eyes: 'glow', mouth: 'grin', blush: false },
      mainhand: 'dagger', aura: { kind: 'blood', color: '#ff4060' }, overlay: cloneOverlay,
    },
    skills: ['spa_clone_shiv', 'spa_clone_taunt'],
    hooks: {
      // cosmetic only: a clone that dies just splats
      onDeath: function (unit) {
        DD.FX.particles(unit, { kind: 'blood', count: 22 });
        DD.FX.text(unit, 'POP!', { color: BLOOD_HI, size: 18 });
      },
    },
    barks: {
      spawn: ['I\'m the real one.', 'Ew, do I look like that?', 'Sparrow, but worse. Or better.', 'Hi. I hate it here.', 'Hey, ugly! Yeah, you!'],
      death: ['*pop*', 'Tell Sparrow... she owes me...', 'Splat. Called it.'],
    },
    desc: 'A goblin-shaped puddle of Sparrow with all her opinions and none of her impulse control. Taunts foes, stabs them, splats.',
  });

  // ---- items (one rule each) ------------------------------------------------------------------------
  DD.registerItem({
    id: 'spa_shiv_of_sharing', name: 'Shiv of Sharing', slot: 'weapon', rarity: 'rare', icon: '🔪', hero: 'sparrow',
    desc: 'Every Bleed Sparrow applies is 1 stack stronger.',
    flavor: 'Sharing is caring. Bleeding is sharing.',
  });
  // id kept from v1 (saves); it was "Scab Mail" when slurping blood was part of her passive
  DD.registerItem({
    id: 'spa_scab_mail', name: 'Bloodsucker\'s Bib', slot: 'armor', rarity: 'rare', icon: '🧃', hero: 'sparrow',
    desc: 'Stepping into blood while hurt slurps it up: Sparrow heals ' + SLURP + ' HP.',
    flavor: 'Technically armor. Definitely a bib. Do not ask what it has absorbed.',
    hooks: {
      onEnterTile: function (unit, tile) {
        if (!active(unit) || !tile || !tile.surface || tile.surface.id !== 'blood' || unit.hp >= unit.maxHp) return;
        A().setSurface(tile.x, tile.y, null);
        DD.FX.particles(tile, { kind: 'blood', count: 8 });
        DD.FX.text(unit, 'Slurp!', { color: '#ff8a9a', size: 13 });
        A().heal(unit, unit, SLURP);
      },
    },
  });
  DD.registerItem({
    id: 'spa_donor_card', name: 'Organ Donor Card (Not Hers)', slot: 'trinket', rarity: 'legendary', icon: '💳', hero: 'sparrow',
    desc: 'Sparrow\'s blood price can be paid by a Bleeding foe up to ' + CARD_RANGE + ' tiles away.',
    flavor: 'Signed in someone else\'s blood. Notarized in hers.',
  });

  // ---- sprite ---------------------------------------------------------------------------------------
  /**
   * Big goblin ears poking out of the hood (a hoop in the back one), glowing blood tears running from the eyes, a rune
   * sigil on the chest and a corked blood vial on the hip. Head centre for the tiny build at head size 1.12: (0, -20.9), r 10.5.
   */
  function sparrowOverlay(g, t, o) {
    const hx = poseShift(o), hy = -20.9, r = 10.5;
    const pulse = 0.6 + 0.4 * Math.sin(t * 3.1);
    const rune = 'rgba(255,45,75,' + pulse.toFixed(2) + ')';
    // one silver hoop through the lower edge of the back ear, drawn first so the ear hides its top half
    // (a pair of rings sitting on the ear read as a second set of eyes)
    const bx = hx - r * 1.02, by = hy + r * 0.3, tx = hx - r * 2.35, ty = hy - r * 0.46;
    g.arc(bx + (tx - bx) * 0.58, by + (ty - by) * 0.58 + 0.5, 1.15, 0, Math.PI * 2, '#c3c8d4', 0.65);
    bigEars(g, t, hx, '#7cb342', '#e58a8a');
    // glowing blood tears running down from the eyes (eyes sit at x ≈ hx + 2.5 ± 3.8, y ≈ hy + 1);
    // no cross bar: a bar under a round glowing eye reads as a ♀ sign
    [hx - 1.5, hx + 6.6].forEach(function (ex, i) {
      g.glow(ex, hy + 4.6, 2.2, '#ff2b4a', 0.3 * pulse);
      g.line(ex, hy + 2.6, ex - 0.25 + i * 0.5, hy + 5.4, rune, 0.7);
      g.ellipse(ex - 0.3 + i * 0.6, hy + 6.0, 0.6, 0.85, rune, null);
    });
    // chest sigil
    g.glow(0.5, -8.4, 3.4, '#ff2b4a', 0.3 * pulse);
    g.line(-1.2, -10.4, 2.2, -6.6, rune, 0.9);
    g.line(2.2, -10.4, -1.2, -6.6, rune, 0.9);
    g.line(0.5, -11.2, 0.5, -5.8, rune, 0.8);
    // corked blood vial on the hip
    g.rect(-5.6, -6.4, 2.6, 3.8, '#e0203a', '#12080c', 0.7);
    g.rect(-5.3, -7.6, 2, 1.4, '#8a5a33', '#12080c', 0.4);
    g.rect(-5.1, -6.0, 0.7, 2.2, 'rgba(255,210,220,0.75)', null);
  }

  // ---- the hero -------------------------------------------------------------------------------------
  DD.registerHero({
    id: 'sparrow', name: 'Sparrow', epithet: 'the Hemogoblin', race: 'Goblin', cls: 'Blood Mage',
    role: 'High-risk bleed assassin', complexity: 2,
    blurb: 'A pint-sized goblin edgelord who pays for every spell in blood: hers, ideally someone else\'s. ' +
      'Any Bleeding foe standing next to her picks up the tab. It\'s not a phase, Mom.',
    color: '#c0102a',
    unlock: null, // all heroes are available from the start (user request; was: clear act 2)
    stats: { hp: 22, ap: 3, mov: 5, armor: 0, init: 3 },
    growth: { hp: 3 },
    flags: {},
    sprite: {
      base: 'humanoid', scale: 0.9, build: 'tiny', outfit: 'rags',
      palette: { skin: '#7cb342', cloth: '#2a1b2a', cloth2: '#8b1426', hair: '#16101a', metal: '#d9dde8', eye: '#ff2d45',
        accent: '#e0203a', outline: '#12080c', inner: '#e58a8a', hat: '#7d1630', boots: '#2a1a14', leather: '#4a2a1e' },
      head: { size: 1.12, ears: 'goblin', hat: 'hood', hair: 'none', eyes: 'glow', mouth: 'fangs', blush: false },
      mainhand: 'dagger', offhand: 'dagger', extras: ['pouches'],
      aura: { kind: 'blood', color: '#e0203a' },
      overlay: sparrowOverlay,
    },
    basic: 'spa_basic',
    signature: 'spa_signature',
    passive: {
      name: 'Blood Price',
      desc: 'Her skills\' HP costs are paid by an adjacent Bleeding foe instead of her, when there is one.',
      /** For the HUD's "paid by" pill (combat_hud.js hpPayer): the foe that pays this skill's HP cost, or null. */
      hpPayer: function (unit, def, level) {
        if (!active(unit) || !ownSkill(def) || rawHpCost(unit, def, level) <= 0) return null;
        return donorFor(unit);
      },
      hooks: {
        // only her own skills: a generic HP-cost skill learned from a tome is paid by her as usual
        modifyCost: function (c) {
          if (c.hp > 0 && !c.spaNoDonor && !c.noDonor && c.unit && ownSkill(c.skill) && donorFor(c.unit)) c.hp = 0;
        },
        onCostPaid: function (p) { payBloodPrice(p); },
      },
    },
    startingSkills: ['spa_hemoglob', 'spa_juicebox'],
    skillPool: ['spa_hemoglob', 'spa_juicebox', 'spa_papercuts', 'spa_spray', 'spa_scab', 'spa_goblinmode', 'spa_puppet',
      'spa_twin', 'spa_blooddrive', 'spa_veinglory'],
    summons: ['spa_clone'],
    barks: {
      select: [
        'The blood remembers. ...What? It does.',
        'Sparrow. Like the bird. But stabbier.',
        'Don\'t touch the vials. Those are personal.',
        'Ugh. Fine. What.',
        'I\'m not small. I\'m efficiently packaged.',
        'My blood type? Yes.',
      ],
      start: [
        'Who\'s donating today? That was rhetorical.',
        'Fresh veins. My favorite.',
        'Darkness falls. So do I. On you. With knives.',
        'Marwyn, don\'t hog all the blood this time.',
        'Roll for initiative? I roll for arteries.',
        'Bleed for me. Or I bleed for you. Either way: bleeding.',
      ],
      move: [
        'Scurry scurry.',
        'Moving through the shadows. Mostly shadows.',
        'Following the blood trail. Yum.',
        'Don\'t look at me. Seriously.',
        'Tiny feet. Big plans.',
      ],
      kill: [
        'Your blood\'s mine now. Finders keepers.',
        'Shiv happens.',
        'Should\'ve eaten more spinach.',
        'Thanks for the donation.',
        'Drained. Like my will to live.',
        'Another one for the collection.',
      ],
      hurt: [
        'Hey! That\'s MY blood, I was using that!',
        'Ow. Rude. Accurate, but rude.',
        'Pain is just blood leaving with attitude.',
        'That\'s gonna scab beautifully.',
        'Free sample. Don\'t get used to it.',
        'Syllamin, your mom jokes can\'t hurt me. My mom\'s a crypt.',
      ],
      lowhp: [
        'Running on fumes and spite. Mostly spite.',
        'Low on blood. Someone stand next to me and bleed.',
        'Josiah, I need a refill. The red kind.',
        'Low HP. High drama. My natural habitat.',
        'One more cut and I\'m a raisin.',
      ],
      downed: [
        'Tell my blood... I loved it...',
        'Everything\'s going dark. Finally. It suits me.',
        'Not dead. Just... resting my veins.',
        'Remember me as I was: edgy.',
        'Nooo... my aesthetic...',
      ],
      revive: [
        'I\'m back. Did anyone drink my blood? Be honest.',
        'Death? Overrated. Way too bright.',
        'Rise, little goblin. Rise and stab.',
        'Back from the dark side. They had no snacks.',
      ],
      ally_down: [
        'Don\'t waste all that blood! ...I mean, nooo!',
        'Get up! You\'re bleeding on my good floor!',
        'Hold on! I\'ll bleed in your general direction!',
        'That\'s a lot of blood. Not judging. Noting.',
        'Somebody help them. My hands are full of knives.',
      ],
      levelup: [
        'More power. More blood. More me.',
        'I leveled up. Still not taller.',
        'My darkness grew. Like a houseplant.',
        'Level up! Unlocked: a darker eyeliner.',
        'Finally. The DM rolled my name. Took long enough.',
      ],
      victory: [
        'Gather the blood. We\'re throwing a party.',
        'Victory. Very grim. Very cool.',
        'Zarathor, stop looting the corpses. That\'s MY job.',
        'Nobody mop this floor. It\'s art now.',
        'Corelos, check the contract. Their blood is mine.',
        'Kiri, your ghost arrows were cute. My kills, though.',
      ],
      idle: [
        'Mayor Buga, call me "little buddy" once more...',
        'Professor Marbles, those are my vials, not marbles.',
        'Ellaria, your corgi licked my dagger. Again.',
        'Slate, you don\'t even bleed. It\'s upsetting.',
        'Basanos, stop sniffing my blood vials. Down. DOWN.',
        'Betty, do NOT eat the vials. They\'re not snacks.',
      ],
      signature: [
        'CRIMSON TIIIIDE!',
        'Surf\'s up, losers!',
        'OPEN THE FLOODGATES!',
        'Everybody gets a blood bath!',
        'Swim in it! SWIM!',
      ],
    },
  });
})();
