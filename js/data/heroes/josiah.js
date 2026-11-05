/* Dungeons and Degenerates — js/data/heroes/josiah.js
 * Josiah the Medically Dubious — plague doctor: Poison that spreads, potions that (mostly) heal, a flammable Plague
 * Miasma and Onyx, a raven he never leaves home without. v2 kit (DESIGN §6 "Simplicity"): one verb per skill; the power is in
 * the combinations — Poison + Contagion, Quarantine's Rooted / Vulnerable, the raven's Marked, a cloud other heroes'
 * fire ignites, a bomb that blasts foes into pits, traps and his own cloud.
 * Attacks of opportunity: his cane reaches 2 tiles and flags.noOpportunity keeps it that way (he never makes them, even
 * Dazzled); the raven's Peck is melee, so the raven does. Raven Dive moves the raven by teleport (never provokes).
 * Passive "Unlicensed Apothecary": his raven (summon jos_raven) at combat start, contagious Poison (combat rule
 * jos_contagion) and +1 consumable slot (hero def consumableSlots, read by DD.Run).
 * Registers: hero josiah, 14 skills (jos_*: basic, signature, 10 pool, 2 raven), status jos_vaccinated, surface
 * jos_miasma, summon jos_raven and the items jos_beak_mask, jos_raven_treats, jos_alembic (rare) and jos_plague_bell
 * (legendary: the contagion reaches 2 tiles).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const RAVEN = 'jos_raven';
  const BEAK = 'jos_beak_mask', TREATS = 'jos_raven_treats', ALEMBIC = 'jos_alembic', BELL = 'jos_plague_bell';
  const GREEN = '#8fdc3c', TOXIC = '#b9e48a';
  /** Contagion range with The Plague Bell (adjacent foes without it). */
  const BELL_REACH = 2;
  /** Chance that the Portable Alembic brews a potion after a won fight. */
  const BREW_CHANCE = 0.5;
  /** What counts as a potion for the Alembic (anything liquid); other consumables are only a fallback. */
  const LIQUID = /potion|draught|drink|flask|tonic|elixir|brew|antidote|water|jar|juice|courage|tea|philt|vial|bottle|soda|ale/i;

  // ---- small helpers ----------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  /** Item check for a combat unit (items: [ids]) or a RunHero (items: { weapon, armor, trinket }). */
  function hasItem(u, id) {
    const it = u && u.items;
    if (!it) return false;
    if (Array.isArray(it)) return it.indexOf(id) >= 0;
    return it.weapon === id || it.armor === id || it.trinket === id;
  }
  function isJosiah(u) { return !!u && (u.kind === 'hero' ? u.defId === 'josiah' : !u.kind && u.id === 'josiah'); }
  function byId(id) { return id && DD.Combat && DD.Combat.byId ? DD.Combat.byId(id) : null; }
  function ownerOf(u) { return u ? byId(u.ownerId) : null; }
  function plural(n, w) { return n === 1 ? w : w + 's'; }
  /** Stunned / asleep / frozen (any stun-like) or a sheep: the raven can't fly anywhere. */
  function knocked(u) { return A().isStunned(u) || A().hasStatus(u, 'sheep'); }

  /** Poison stacks Josiah puts on foes (+1 with the Herb-Stuffed Beak Mask), as shown and as applied. */
  function pz(n, user) { return n + (isJosiah(user) && hasItem(user, BEAK) ? 1 : 0); }
  /** A charmed hero can't damage its charmer (DESIGN 4.4) — that includes Poison, which is damage on a timer. */
  function charmedBy(src, foe) { const c = src && A().getStatus(src, 'charmed'); return !!c && c.source === foe.id; }
  function poisonFoe(src, foe, n) {
    if (!active(foe) || !(n > 0) || charmedBy(src, foe)) return null;
    return A().addStatus(foe, 'poison', { stacks: pz(n, src) }, src || null);
  }

  // ---- the raven ----------------------------------------------------------------------------------------
  function ravenOf(owner) {
    const s = S();
    if (!s || !owner) return null;
    for (let i = 0; i < s.units.length; i++) {
      const u = s.units[i];
      if (u.defId === RAVEN && u.kind === 'summon' && u.ownerId === owner.id && active(u)) return u;
    }
    return null;
  }
  /** Raven skill level grows with Josiah: L1-3 → I, L4-6 → II, L7+ → III. */
  function ravenLevel(owner) { return Math.max(1, Math.min(3, 1 + Math.floor((((owner && owner.level) || 1) - 1) / 3))); }
  /** Raven max HP: 10, +10% per Josiah level above 1 (halves round up), doubled by the Suspicious Raven Treats. */
  function ravenHp(owner) {
    const base = (DD.getSummon(RAVEN) || {}).hp || 10;
    const hp = Math.max(1, Math.round(base * (100 + 10 * Math.max(0, ((owner && owner.level) || 1) - 1)) / 100));
    return hp * (hasItem(owner, TREATS) ? 2 : 1);
  }

  /** A free, preferably safe tile for a (flying) raven next to `near`, else around the owner. */
  function ravenSpot(owner, near) {
    const s = S();
    const fly = { flags: { flying: true } };
    const zone = s && s.deploy && s.deploy.active ? s.deploy.tiles : null;
    const outside = function (p) { return zone && !zone.some(function (z) { return z.x === p.x && z.y === p.y; }) ? 1 : 0; };
    const centers = near && near !== owner ? [near, owner] : [owner];
    for (let c = 0; c < centers.length; c++) {
      const ctr = centers[c];
      const list = G().emptyTilesNear(ctr.x, ctr.y, c === 0 && centers.length > 1 ? 1 : 2, fly)
        .filter(function (p) { return (p.x !== ctr.x || p.y !== ctr.y) && !G().isDrop(p.x, p.y); });
      if (!list.length) continue;
      const score = function (p) { return (G().hazardAt(p.x, p.y, fly) ? 4 : 0) + outside(p) * 2 + G().dist(p, ctr); };
      list.sort(function (a, b) { return score(a) - score(b); });
      return list[0];
    }
    return owner ? G().nearestFree(owner.x, owner.y, fly) : null;
  }
  function summonRaven(owner, near, opts) {
    const p = owner ? ravenSpot(owner, near || owner) : null;
    if (!p) return null;
    const base = (DD.getSummon(RAVEN) || {}).hp || 10;
    return A().summon(owner, RAVEN, p.x, p.y, Object.assign({ level: ravenLevel(owner), hpMult: ravenHp(owner) / base }, opts || {}));
  }
  /** Where a diving raven lands next to `target` (null: already adjacent / nowhere to land). */
  function landingSpot(raven, target) {
    if (G().dist(raven, target) === 1) return null;
    let best = null, bs = Infinity;
    U.DIRS.forEach(function (d) {
      const p = { x: target.x + d.x, y: target.y + d.y };
      if (!G().isFree(p.x, p.y, raven)) return;
      const sc = (G().isDrop(p.x, p.y) ? 50 : 0) + (G().hazardAt(p.x, p.y, raven) ? 20 : 0) + G().dist(raven, p);
      if (sc < bs) { bs = sc; best = p; }
    });
    return best;
  }
  /** Raven skills: true, or why not ('Needs Onyx.' only when the skill can't call a new one). */
  function ravenProblem(user, needsOne) {
    const r = ravenOf(user);
    if (!r) return needsOne ? 'Needs Onyx.' : true;
    return knocked(r) ? 'Onyx is indisposed.' : true;
  }

  // ---- passive: Unlicensed Apothecary -------------------------------------------------------------------
  /** Combat rule added by Josiah: a hook source of every unit, so it sees every death. */
  const CONTAGION_HOOKS = {
    onDeath: function (unit) {
      const s = S();
      const st = A().getStatus(unit, 'poison');
      if (!s || !st || !unit) return;
      const docs = s.units.filter(function (u) { return isJosiah(u) && active(u) && G().hostile(u, unit); });
      if (!docs.length) return;
      const belled = docs.filter(function (j) { return hasItem(j, BELL); });
      const doc = belled[0] || docs[0];
      const reach = belled.length ? BELL_REACH : 1;
      let n = 0;
      s.units.slice().forEach(function (v) {
        if (v === unit || !active(v) || !G().hostile(doc, v) || G().dist(v, unit) > reach) return;
        if (poisonFoe(doc, v, st.stacks)) { n++; DD.FX.particles(v, { kind: 'poison', count: 8 }); }
      });
      if (!n) return;
      DD.FX.text({ x: unit.x, y: unit.y }, belled.length ? '🔔 Contagious!' : 'Contagious!', { color: GREEN, size: 15 });
      A().log('The plague spreads from ' + unit.name + ' to ' + n + ' ' + plural(n, 'neighbour') + '!', 'status');
    },
  };
  function ensureContagion() {
    const s = S();
    if (!s || s.rules.some(function (r) { return r.id === 'jos_contagion'; })) return;
    const bell = s.units.some(function (u) { return isJosiah(u) && !u.dead && hasItem(u, BELL); });
    A().addRule({ id: 'jos_contagion', name: 'Contagion', icon: '☣️', turns: -1,
      desc: 'Josiah is here: when a Poisoned foe dies, ' + (bell ? 'foes within ' + BELL_REACH + ' tiles' : 'adjacent foes') + ' catch all of its Poison.',
      hooks: CONTAGION_HOOKS });
  }

  const PASSIVE = {
    name: 'Unlicensed Apothecary',
    desc: 'Starts each fight with Onyx, his raven. Poison is contagious: when a Poisoned foe dies, adjacent foes catch all of its ' +
      'Poison. +1 consumable slot.',
    hooks: {
      onCombatStart: function (unit) {
        if (!active(unit)) return;
        ensureContagion();
        const s = S();
        if (!ravenOf(unit)) summonRaven(unit, unit, { noFx: !!s && s.round === 0 });
      },
    },
  };

  /** Portable Alembic: after a won run fight, BREW_CHANCE to brew a random potion into the party inventory. */
  function brew(unit, result) {
    const s = S();
    if (!s || !s.run || result !== 'victory' || !unit || unit.dead || A().simulating) return null;
    if (!s.rng.chance(BREW_CHANCE)) return null;
    const ids = Object.keys(DD.defs.consumables).filter(function (k) { return k.indexOf('test_') !== 0; });
    const potions = ids.filter(function (k) {
      const c = DD.getConsumable(k) || {};
      return LIQUID.test(k) || LIQUID.test(c.name || '') || c.icon === '🧪' || c.icon === '⚗️';
    });
    const pool = potions.length ? potions : ids;
    const got = A().giveRandomConsumable(pool.length ? pool[s.rng.int(0, pool.length - 1)] : undefined);
    if (got) {
      const name = (DD.getConsumable(got) || {}).name || 'a potion';
      DD.FX.text(unit, '⚗️ Brewed: ' + name, { color: TOXIC, size: 15 });
      A().log(unit.name + ' scrapes the battlefield into the Alembic and brews ' + name + '. Do not ask what is in it.', 'hero');
      if (!DD.headless && DD.UI && typeof DD.UI.toast === 'function') {
        DD.safe('Josiah brew toast', DD.UI.toast, DD.UI, [unit.name + ' brewed ' + name + ' from the leftovers.', { icon: '⚗️', ms: 3600 }]);
      }
    }
    return got;
  }

  // ---- FX helpers ---------------------------------------------------------------------------------------
  function lob(from, to, color) { DD.FX.projectile(from, to, { kind: 'flask', color: color || GREEN, arc: true }); }
  function puffAt(p, kind, n) { DD.FX.particles(p, { kind: kind || 'poison', count: n || 10 }); }

  // ---- statuses & surfaces ------------------------------------------------------------------------------
  DD.registerStatus({
    id: 'jos_vaccinated', name: 'Vaccinated', icon: '💉', color: '#7fd4ff', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) {
      const n = st && st.turns > 0 ? ' (' + st.turns + ' ' + plural(st.turns, 'turn') + ' left)' : '';
      return 'Immune to new debuffs' + n + '. Mild soreness is normal.';
    },
    hooks: {
      modifyStatus: function (s) {
        const d = DD.getStatus(s.id);
        if (s.cancel || !d || d.type !== 'debuff') return;
        s.cancel = true;
        DD.FX.text(s.unit, '💉 Immune!', { color: '#7fd4ff', size: 14 });
      },
    },
  });

  /** Miasma doses only foes of the side that brewed it (tile.surface.data = { side, owner, poison }). */
  function miasmaFoe(unit, tile) {
    const d = (tile && tile.surface && tile.surface.data) || {};
    return !d.side || G().effectiveSide(unit) !== d.side;
  }
  DD.registerSurface({
    id: 'jos_miasma', name: 'Plague Miasma', color: 'rgba(120,170,60,0.5)', turns: 2, airborne: true,
    desc: 'Foes of its brewer are Poisoned on each Miasma tile they enter. Flammable: fire turns the whole cloud into flames.',
    react: { fire: { surface: 'fire', turns: 2, spread: true } },
    // only its brewer's foes see a hazard (AI paths avoid it; the brewer's side walks through freely)
    hazard: function (unit, tile) { return !unit || miasmaFoe(unit, tile); },
    hazardDmg: 3,
    // what it does: Poison only, so poison-proof foes (slimes, skeletons, constructs...) see no hazard
    hazardStatus: 'poison',
    onEnter: function (unit, tile) {
      const sf = tile && tile.surface;
      if (!active(unit) || !sf || sf.id !== 'jos_miasma' || !miasmaFoe(unit, tile)) return;
      const d = sf.data || {};
      const src = byId(d.owner);
      poisonFoe(active(src) ? src : null, unit, d.poison || 2);
    },
    // flat painter (the renderer clips it to the tile): sickly fog, drifting puffs, a few bubbles
    draw: function (g, sf, t) {
      const c = g.ctx, tl = g.tile || { x: 0, y: 0 };
      const ph = ((tl.x * 37 + tl.y * 61) % 17) / 17 * 6.283;
      t = t || 0;
      c.fillStyle = 'rgba(92,138,36,0.38)';
      c.fillRect(-32, -16, 64, 32);
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.22 + i / 6 + ph / 6.283) % 1;
        const x = Math.sin(ph + i * 2.1 + t * 0.5) * 16, y = Math.cos(ph * 0.7 + i * 1.7) * 6 - k * 3, r = 9 + k * 9;
        const a = 0.62 * Math.sin(Math.PI * Math.min(1, k * 1.1));
        const gr = c.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(196,240,120,' + a.toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(120,175,50,0)');
        c.fillStyle = gr;
        c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
      }
      // lazy swirls of bad air
      c.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const a0 = t * (0.7 + i * 0.3) + ph + i * 3;
        c.beginPath(); c.ellipse(Math.sin(ph + i * 2) * 8, Math.cos(ph + i) * 3, 11 - i * 3, 4.5 - i, 0, a0, a0 + 2.4);
        c.strokeStyle = 'rgba(40,70,18,0.55)'; c.lineWidth = 1.4; c.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.6 + i * 0.33 + ph) % 1;
        c.beginPath(); c.arc(Math.sin(ph * 2 + i * 2.4) * 12, 5 - k * 11, 0.8 + k * 1.7, 0, 6.283);
        c.strokeStyle = 'rgba(225,255,175,' + (0.85 * (1 - k)).toFixed(3) + ')'; c.lineWidth = 0.8; c.stroke();
      }
    },
    // volume painter (unclipped, drawn with the objects of its row): a lumpy bank of lit puffs that roll upward,
    // swell and fade, so the cloud reads as a gas hanging above the floor
    drawVolume: function (g, sf, t) {
      const c = g.ctx, tl = g.tile || { x: 0, y: 0 };
      const ph = ((tl.x * 37 + tl.y * 61) % 17) / 17 * 6.283;
      t = t || 0;
      for (let i = 0; i < 5; i++) {
        const k = (t * 0.08 + i / 5 + ph / 6.283) % 1, life = Math.sin(Math.PI * k);
        const x = Math.sin(ph + i * 2.4) * 12 + Math.sin(t * 0.35 + i * 1.3) * 2;
        const y = Math.cos(ph * 0.8 + i * 2.1) * 4 - 5 - k * 17;
        const r = (9 + 3 * Math.sin(i * 2.7 + ph)) * (0.6 + 0.55 * life) + 3;
        const a = 0.62 * Math.min(1, life * 1.6);
        const gr = c.createRadialGradient(x - r * 0.3, y - r * 0.38, r * 0.1, x, y, r);
        gr.addColorStop(0, 'rgba(220,250,165,' + a.toFixed(3) + ')');
        gr.addColorStop(0.5, 'rgba(140,192,66,' + (a * 0.85).toFixed(3) + ')');
        gr.addColorStop(0.8, 'rgba(92,138,38,' + (a * 0.5).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(70,110,28,0)');
        c.fillStyle = gr;
        c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
      }
    },
  });

  // ---- basic & signature --------------------------------------------------------------------------------
  // tagged 'reach', not 'melee': tooltips show the tags, and in v2 "melee" reads as "holds the line" (it never does)
  DD.registerSkill({
    id: 'jos_cane', name: 'House Call', owner: 'josiah', icon: '🩺', kind: 'attack', tags: ['reach'], ap: 1,
    levels: [{ dmg: 4, sick: 6 }],
    target: { type: 'unit', range: [1, 2], filter: 'enemy', los: true },
    desc: function (L) { return 'Poke a foe up to 2 tiles away with your cane: ' + L.dmg + ' damage, ' + L.sick + ' if it is Poisoned.'; },
    flavor: 'Plague doctors examined patients with a cane so they never had to touch them. Josiah examines them very, very hard.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      DD.FX.lunge(ctx.user, u);
      A().damage(ctx.user, u, A().hasStatus(u, 'poison') ? ctx.L.sick : ctx.L.dmg);
    },
  });

  DD.registerSkill({
    id: 'jos_pandemic', name: 'Pandemic', owner: 'josiah', icon: '🦠', kind: 'attack', tags: ['poison', 'aoe'], ap: 2, hype: 100,
    levels: [{ dmg: 8, poison: 4 }],
    target: { type: 'self' }, area: { shape: 'all_foes' },
    desc: function (L, user) { return 'Uncork Jar #7: every foe takes ' + L.dmg + ' poison damage and is Poisoned ' + pz(L.poison, user) + '.'; },
    flavor: 'The label said DO NOT OPEN UNTIL PANDEMIC. Technically, it is now.',
    execute: function (ctx) {
      const user = ctx.user;
      DD.FX.banner('PANDEMIC!', { sub: 'Josiah opened Jar #7', color: GREEN });
      DD.FX.flash('#9be26a', 320);
      DD.FX.shake(9, 450);
      DD.FX.sound('poison');
      puffAt(user, 'poison', 24);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        puffAt(f, 'poison', 14);
        A().damage(user, f, ctx.L.dmg, { element: 'poison' });
        poisonFoe(user, f, ctx.L.poison);
      });
      const r = ravenOf(user);
      if (r) A().bark(r, 'CAW CAW CAAAW!');
    },
  });

  // ---- skill pool ---------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'jos_plague_flask', name: 'Plague Flask', owner: 'josiah', icon: '🧪', kind: 'attack', tags: ['poison', 'aoe', 'ranged'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 2, poison: 3 }, { dmg: 3, poison: 4 }, { dmg: 4, poison: 5 }],
    target: { type: 'tile', range: [2, 4], filter: 'any', los: true }, area: { shape: 'circle', size: 1 },
    desc: function (L, user) { return 'Lob a flask: foes in radius 1 take ' + L.dmg + ' poison damage and are Poisoned ' + pz(L.poison, user) + '.'; },
    flavor: 'Shake well. Throw better.',
    execute: function (ctx) {
      lob(ctx.user, ctx.target);
      DD.FX.explosion(ctx.target, { radius: 1, color: GREEN });
      puffAt(ctx.target, 'poison', 16);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg, { element: 'poison' });
        poisonFoe(ctx.user, f, ctx.L.poison);
      });
    },
  });

  DD.registerSkill({
    id: 'jos_draught', name: 'Mostly Medicine', owner: 'josiah', icon: '🍶', kind: 'heal', tags: ['heal'], ap: 1, cooldown: 1,
    levels: [{ heal: 7 }, { heal: 9 }, { heal: 11 }],
    target: { type: 'unit', range: [0, 3], filter: 'allyOrSelf', los: true },
    desc: function (L) { return 'Toss a potion to an ally within 3 (or drink it yourself): heal ' + L.heal + ' HP.'; },
    flavor: 'Ingredients: water, herbs, hope and one (1) mystery ingredient.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      if (u !== ctx.user) lob(ctx.user, u, '#ff6f8a');
      DD.FX.particles(u, { kind: 'bubbles', count: 10 });
      A().heal(ctx.user, u, ctx.L.heal);
    },
    aiScore: function (ctx) { const u = ctx.targetUnit; return u ? Math.min(ctx.L.heal, u.maxHp - u.hp) : 0; },
  });

  DD.registerSkill({
    id: 'jos_raven_dive', name: 'Raven Dive', owner: 'josiah', icon: '🐦', kind: 'attack', tags: ['ranged', 'raven'], ap: 1, cooldown: 1,
    levels: [{ dmg: 4 }, { dmg: 5 }, { dmg: 6, dazzle: 1 }],
    target: { type: 'unit', range: [1, 5], filter: 'enemy', los: false },
    desc: function (L) {
      return 'Onyx (called back if gone) swoops next to a foe within 5 and pecks it for ' + L.dmg + ' damage' +
        (L.dazzle ? ' and Dazzles it' : '') + '.';
    },
    flavor: 'Ravens go for the eyes. Onyx also goes for the snacks.',
    canUse: function (ctx) { return ravenProblem(ctx.user, false); },
    execute: function (ctx) {
      const user = ctx.user, u = ctx.targetUnit;
      if (!u) return;
      let raven = ravenOf(user);
      if (!raven) raven = summonRaven(user, u, {});
      if (raven) {
        const spot = landingSpot(raven, u);
        if (spot) {
          const from = { x: raven.x, y: raven.y };
          if (A().teleport(raven, spot.x, spot.y, { fx: false })) DD.FX.jump(raven, from, spot);
        }
        if (active(raven)) { A().face(raven, u); DD.FX.lunge(raven, u); }
      }
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'feathers', count: 10 });
      DD.FX.sound('caw');
      A().damage(user, u, ctx.L.dmg);
      if (ctx.L.dazzle && active(u)) A().addStatus(u, 'dazzled', { turns: ctx.L.dazzle }, user);
    },
    aiScore: function (ctx) { return ravenOf(ctx.user) ? 0 : 6; },
  });

  DD.registerSkill({
    id: 'jos_leeches', name: 'Prescribe Leeches', owner: 'josiah', icon: '🪱', kind: 'attack', tags: ['ranged', 'drain'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 6 }, { dmg: 8 }, { dmg: 10 }],
    target: { type: 'unit', range: [1, 3], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe within 3 and heal yourself for the HP it lost.'; },
    flavor: 'Medieval medicine: take blood from the bad guy, give it to the doctor. Peer review pending.',
    execute: function (ctx) {
      const user = ctx.user, u = ctx.targetUnit;
      if (!u) return;
      DD.FX.beam(user, u, { color: '#8a1c2a', width: 3 });
      const dealt = A().damage(user, u, ctx.L.dmg, { tags: ['drain'] });
      if (!(dealt > 0) || !active(user)) return;
      DD.FX.particles(user, { kind: 'blood', count: 6 });
      A().heal(user, user, dealt);
    },
  });

  DD.registerSkill({
    id: 'jos_miasma', name: 'Plague Miasma', owner: 'josiah', icon: '🌫️', kind: 'utility', tags: ['poison', 'aoe', 'surface'],
    ap: 2, cooldown: 3,
    levels: [{ poison: 2, turns: 2 }, { poison: 3, turns: 2 }, { poison: 3, turns: 3 }],
    target: { type: 'tile', range: [1, 4], filter: 'any', los: false }, area: { shape: 'circle', size: 1 },
    // every Miasma tile a foe enters doses it (a surface's onEnter runs per tile): shoving a foe through the cloud stacks up
    desc: function (L, user) {
      return 'Fill radius 1 with Plague Miasma for ' + L.turns + ' rounds: foes inside are Poisoned ' + pz(L.poison, user) +
        ', and again on each Miasma tile they enter. Flammable.';
    },
    flavor: 'Bad air is a legitimate medical theory. Josiah is making it a legitimate weapon.',
    execute: function (ctx) {
      const user = ctx.user;
      lob(user, ctx.target, '#6f9a3a');
      puffAt(ctx.target, 'smoke', 18);
      ctx.tiles.forEach(function (p) {
        const t = G().tile(p.x, p.y);
        if (!t || (t.surface && t.surface.id === 'fire')) return; // no cloud over open flames
        if (A().setSurface(p.x, p.y, 'jos_miasma', ctx.L.turns)) {
          t.surface.data = { side: user.side, owner: user.id, poison: ctx.L.poison };
          DD.FX.tile(p.x, p.y, 'glow', { color: GREEN, parallel: true });
        }
      });
      ctx.foes.forEach(function (f) {
        const t = G().tile(f.x, f.y);
        if (t && t.surface && t.surface.id === 'jos_miasma') poisonFoe(user, f, ctx.L.poison);
      });
    },
    aiScore: function (ctx) { return ctx.foes.length * 4; },
  });

  DD.registerSkill({
    id: 'jos_quarantine', name: 'Quarantine', owner: 'josiah', icon: '🚧', kind: 'utility', tags: ['control', 'ranged'],
    ap: 1, cooldown: 3,
    levels: [{ root: 1, vuln: 2 }, { root: 1, vuln: 3 }, { root: 2, vuln: 3 }],
    target: { type: 'unit', range: [1, 4], filter: 'enemy', los: true },
    desc: function (L) {
      return 'A foe within 4 is Rooted for ' + L.root + ' ' + plural(L.root, 'turn') + ' and Vulnerable (+25% damage taken) for ' +
        L.vuln + ' turns.';
    },
    flavor: 'Six feet apart. Seven if it is a goblin.',
    execute: function (ctx) {
      const user = ctx.user, u = ctx.targetUnit;
      if (!u) return;
      DD.FX.beam(user, u, { color: '#e0c040', width: 2 });
      DD.FX.text(u, '🚧 QUARANTINED', { color: '#ffd23f', size: 15 });
      A().addStatus(u, 'root', { turns: ctx.L.root }, user);
      if (active(u)) A().addStatus(u, 'vulnerable', { turns: ctx.L.vuln }, user);
    },
    aiScore: function (ctx) { return ctx.targetUnit ? 4 : 0; },
  });

  DD.registerSkill({
    id: 'jos_vaccinate', name: 'Vaccinate', owner: 'josiah', icon: '💉', kind: 'buff', tags: ['cleanse', 'buff'], ap: 1, cooldown: 2,
    levels: [{ turns: 1 }, { turns: 2 }, { turns: 2, block: 5 }],
    target: { type: 'unit', range: [0, 3], filter: 'allyOrSelf', los: true },
    desc: function (L) {
      return 'Cure an ally within 3 (or yourself) of all debuffs; it is immune to new ones for ' + L.turns + ' ' + plural(L.turns, 'turn') +
        (L.block ? ' and gains ' + L.block + ' Block' : '') + '.';
    },
    flavor: 'Mild soreness at the injection site is normal. So is Onyx watching.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      if (u !== ctx.user) DD.FX.projectile(ctx.user, u, { kind: 'dagger', color: '#bfe8ff' });
      A().cleanse(u, 'debuff');
      A().addStatus(u, 'jos_vaccinated', { turns: ctx.L.turns }, ctx.user);
      if (ctx.L.block) A().addBlock(u, ctx.L.block);
    },
    aiScore: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return 0;
      const bad = (u.statuses || []).filter(function (st) { const d = DD.getStatus(st.id); return d && d.type === 'debuff'; }).length;
      return 1 + bad * 3 + (A().isStunned(u) ? 6 : 0);
    },
  });

  DD.registerSkill({
    id: 'jos_volatile', name: 'Volatile Brew', owner: 'josiah', icon: '⚗️', kind: 'attack', tags: ['fire', 'aoe', 'ranged', 'push'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 5, push: 1 }, { dmg: 6, push: 1 }, { dmg: 7, push: 2 }],
    target: { type: 'tile', range: [2, 4], filter: 'any', los: true }, area: { shape: 'circle', size: 1 },
    desc: function (L) {
      return 'Lob a bomb: every unit in radius 1 takes ' + L.dmg + ' fire damage (allies too) and is pushed ' + L.push + ' ' +
        plural(L.push, 'tile') + ' outward.';
    },
    flavor: 'The label says DO NOT SHAKE. Josiah has never been good with labels.',
    execute: function (ctx) {
      const user = ctx.user, c = ctx.target;
      lob(user, c, '#ff8a1a');
      DD.FX.explosion(c, { radius: 1, color: '#ff8a1a' });
      DD.FX.shake(6, 300);
      const victims = ctx.units.slice();
      victims.forEach(function (v) { if (active(v)) A().damage(user, v, ctx.L.dmg, { element: 'fire' }); });
      // v2 (one rider: the push): the blast no longer ignites the ground; lighting his cloud is other heroes' job
      // outer ring first, so the blast scatters the crowd instead of bonking it together
      victims.slice().sort(function (a, b) { return G().dist(b, c) - G().dist(a, c); }).forEach(function (v) {
        if (!active(v)) return;
        const dir = v.x === c.x && v.y === c.y ? U.dirTo(user, v) : U.dirTo(c, v);
        if (dir.x || dir.y) A().push(user, v, dir, ctx.L.push);
      });
    },
  });

  /** Murder of Crows: radius 2 around Josiah's raven (no raven, no flock). */
  function murderTiles(ctx) {
    const r = ravenOf(ctx && ctx.user);
    return r ? G().shape('circle', { x: r.x, y: r.y }, null, 2, null) : [];
  }
  DD.registerSkill({
    id: 'jos_murder', name: 'Murder of Crows', owner: 'josiah', icon: '🪶', kind: 'spell', tags: ['aoe', 'raven'], ap: 3, cooldown: 3,
    levels: [{ dmg: 7 }, { dmg: 9 }, { dmg: 10, mark: 3 }],
    target: { type: 'self' }, area: { shape: 'custom', fn: murderTiles },
    desc: function (L) {
      return 'Onyx calls the flock: every foe within 2 tiles of him takes ' + L.dmg + ' damage' +
        (L.mark ? ' and is Marked ' + L.mark : '') + '.';
    },
    flavor: 'A group of crows is a murder. A group of Josiah\'s crows is a malpractice suit.',
    canUse: function (ctx) { return ravenProblem(ctx.user, true); },
    execute: function (ctx) {
      const user = ctx.user;
      const r = ravenOf(user);
      if (!r) return;
      A().bark(r, 'CAAAW!');
      DD.FX.sound('caw');
      DD.FX.particles(r, { kind: 'feathers', count: 26 });
      ctx.foes.forEach(function (f, i) {
        if (!active(f)) return;
        DD.FX.projectile(r, f, { kind: 'feather', color: '#2b2a35', parallel: i > 0 });
        A().damage(user, f, ctx.L.dmg);
        if (ctx.L.mark && active(f)) A().addStatus(f, 'marked', { stacks: ctx.L.mark }, user);
      });
    },
    // the whole turn goes into it: worth it on a crowd around the raven
    aiScore: function (ctx) { return ctx.foes.length >= 2 ? ctx.foes.length * 3 : 0; },
  });

  DD.registerSkill({
    id: 'jos_salts', name: 'Smelling Salts', owner: 'josiah', icon: '🧂', kind: 'heal', tags: ['heal', 'revive'], ap: 1, charges: 1,
    levels: [{ pct: 30 }, { pct: 40 }, { pct: 50 }],
    target: { type: 'unit', range: [1, 4], filter: 'downedAlly', los: false },
    desc: function (L) { return 'Revive a downed ally within 4 at ' + L.pct + '% HP. Once per combat.'; },
    flavor: 'One sniff and you are back. Two sniffs and you can taste colours.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u || !u.downed || u.dead) return;
      DD.FX.projectile(ctx.user, u, { kind: 'flask', color: '#f2f2f2', arc: true });
      DD.FX.particles(u, { kind: 'sparks', count: 12 });
      A().revive(u, ctx.L.pct / 100);
    },
    aiScore: function (ctx) { return ctx.targetUnit && ctx.targetUnit.downed ? 20 : 0; },
  });

  // ---- the raven (summon) -------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'jos_peck', name: 'Peck', owner: 'summon', icon: '💢', kind: 'attack', tags: ['melee'], ap: 1,
    levels: [{ dmg: 2 }, { dmg: 3 }, { dmg: 4 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Peck an adjacent foe for ' + L.dmg + ' damage.'; },
    flavor: 'Right in the eye. Every time. It is a gift.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      DD.FX.lunge(ctx.user, u);
      DD.FX.particles(u, { kind: 'feathers', count: 5 });
      A().damage(ctx.user, u, ctx.L.dmg);
      A().maybeBark(ctx.user, 'attack', 0.2);
    },
  });

  DD.registerSkill({
    id: 'jos_omen', name: 'Ill Omen', owner: 'summon', icon: '👁️', kind: 'spell', tags: ['ranged', 'mark'], ap: 1, cooldown: 1,
    levels: [{ mark: 3 }, { mark: 4 }, { mark: 5 }],
    target: { type: 'unit', range: [1, 4], filter: 'enemy', los: true },
    // Marked: the next damage of any kind, a Poison tick included (statuses.js), so the desc says "damage", not "hit"
    desc: function (L) { return 'Caw ominously at a foe within 4: it is Marked, so the next damage it takes is +' + L.mark + '.'; },
    flavor: 'Nobody likes it when Onyx stares. Least of all the one he stares at.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      DD.FX.beam(ctx.user, u, { color: '#b48cff', width: 2 });
      DD.FX.sound('caw');
      A().addStatus(u, 'marked', { stacks: ctx.L.mark }, ctx.user);
    },
    aiScore: function (ctx) { return ctx.targetUnit ? 3 : 0; },
  });

  DD.registerSummon({
    id: RAVEN, name: 'Raven', hp: 10, mov: 5, ap: 2, armor: 0, tags: ['beast', 'bird'], flags: { flying: true },
    // always Onyx, re-summoned or not (he always comes back; ravens are like that); one name keeps the one RNG draw
    names: ['Onyx'],
    sprite: {
      base: 'flyer', scale: 0.85,
      palette: { skin: '#3d3b57', eye: '#a6ff6a', beak: '#a19cb0', accent: '#7be04a', outline: '#0b0a10', metal: '#d8b25a', scarf: '#7be04a' },
      shape: { body: 'bird' }, head: { eyes: 'glow', face: 'monocle' }, extras: ['scarf'],
    },
    skills: ['jos_peck', 'jos_omen'],
    hooks: {
      onDeath: function (unit) { const o = ownerOf(unit); if (active(o)) A().bark(o, 'raven_down'); },
    },
    barks: {
      spawn: ['Caw.', 'Onyx is back. Onyx is always back.', '*judgmental head tilt*', 'CAW. (Translation: you again?)'],
      attack: ['CAW!', '*aggressive pecking*', 'Shiny eye. Mine.'],
      hurt: ['SQUAWK!', 'Caw?!'],
      death: ['Nevermore... (for now)', '*one dramatic feather*'],
    },
    desc: 'Onyx, Josiah\'s raven: flies, acts on his turn, 10 HP (+10% per Josiah level). Pecks eyes, delivers omens and silently ' +
      'judges every one of his prescriptions.',
  });

  // ---- items ------------------------------------------------------------------------------------------
  DD.registerItem({
    id: BEAK, name: 'Herb-Stuffed Beak Mask', slot: 'armor', rarity: 'rare', icon: '🌿', hero: 'josiah', stats: { hp: 4 },
    desc: '+4 max HP. Every Poison Josiah applies has +1 stack.',
    flavor: 'Lavender, mint, cloves and one sandwich he forgot about in 1347.',
  });
  DD.registerItem({
    id: TREATS, name: 'Suspicious Raven Treats', slot: 'trinket', rarity: 'rare', icon: '🐛', hero: 'josiah', stats: {},
    desc: 'Onyx, Josiah\'s raven, has double max HP.',
    flavor: 'Do not ask what is in them. Onyx asked once. Onyx is now enormous.',
  });
  DD.registerItem({
    id: ALEMBIC, name: 'Portable Alembic', slot: 'trinket', rarity: 'rare', icon: '🫧', hero: 'josiah', stats: {},
    desc: 'After every won fight, 50% chance that Josiah brews a random potion for the party (if the bag has room).',
    flavor: 'It bubbles in his coat pocket all day. The coat has started bubbling too.',
    hooks: { onCombatEnd: function (unit, result) { brew(unit, result); } },
  });
  DD.registerItem({
    id: BELL, name: 'The Plague Bell', slot: 'weapon', rarity: 'legendary', icon: '🔔', hero: 'josiah', stats: { dmg: 0.1 },
    desc: '+10% damage. Contagion reaches every foe within ' + BELL_REACH + ' tiles of the dead, not just adjacent ones.',
    flavor: 'Ring it and shout "Bring out your dead!" These days the dead mostly bring themselves.',
  });

  // ---- sprite ----------------------------------------------------------------------------------------
  /** Overlay: herb smoke curling out of the beak tip (local coords: +x = facing, origin at the feet). */
  function beakSmoke(g, t, o) {
    if (o && (o.lying > 0.3 || o.still)) return;
    t = t || 0;
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.5 + i / 3) % 1;
      const x = 20 + p * 5 + Math.sin(t * 2.2 + i * 2) * 1.3, y = -18.5 - p * 12;
      g.glow(x, y, 2.4 + p * 3.8, TOXIC, 0.6 * (1 - p));
    }
  }

  DD.registerHero({
    id: 'josiah', name: 'Josiah', epithet: 'the Medically Dubious', race: 'Human', cls: 'Plague Doctor',
    role: 'Poison healer & raven wrangler', complexity: 2,
    blurb: 'A plague doctor with a beak full of herbs, a coat full of unlabeled vials and a raven named Onyx who is smarter than he is. ' +
      'His cures are only slightly worse than the disease, and his diseases are contagious. Nobody has ever seen his medical ' +
      'license, and he would like to keep it that way.',
    color: '#86b84a',
    unlock: null, // all heroes are available from the start (user request; was: clear act 1)
    stats: { hp: 26, ap: 3, mov: 4, armor: 0, init: 0 },
    growth: { hp: 4 },
    // he never makes attacks of opportunity, even when Dazzle or a house rule shrinks his cane's reach to 1 (melee)
    flags: { noOpportunity: true },
    consumableSlots: 1,
    sprite: {
      base: 'humanoid', scale: 1, build: 'slim', outfit: 'coat',
      palette: { skin: '#d9c4a8', cloth: '#363042', cloth2: '#7a5a3c', hair: '#1c1a22', metal: '#c9a24f', eye: '#a6ff6a', accent: '#7be04a',
        outline: '#100c12', mask: '#efe6cc', hat: '#1b1820', collar: '#4a4058', leather: '#8a6440', boots: '#231b16', wood: '#7a5634' },
      head: { hat: 'plague', face: 'plague_mask', eyes: 'glow', mouth: 'none' },
      mainhand: 'cane', offhand: 'flask',
      extras: ['collar', 'bandolier'],
      aura: { kind: 'smoke', color: '#9fd27a' },
      overlay: beakSmoke,
    },
    basic: 'jos_cane',
    signature: 'jos_pandemic',
    passive: PASSIVE,
    startingSkills: ['jos_plague_flask', 'jos_draught'],
    skillPool: ['jos_plague_flask', 'jos_draught', 'jos_raven_dive', 'jos_leeches', 'jos_miasma', 'jos_quarantine', 'jos_vaccinate',
      'jos_volatile', 'jos_murder', 'jos_salts'],
    summons: [RAVEN],
    barks: {
      select: ['The doctor is in. The beak is on.', 'Say "ahh". No, from over there.', 'I have a potion for that. I have a potion for everything.',
        'Who needs a second opinion? It is still plague.', 'Bring out your wounded. Or your dead. I am flexible.',
        'Valdris, forge me a smaller beak. This one whistles.'],
      start: ['Everyone stay back. I am about to practice medicine.', 'Roll for initiative? I roll for infection.',
        'I have diagnosed the problem. It is them.', 'Onyx, take notes. Mostly on their weak spots.', 'Masks on, everyone! Oh, it\'s just me? Typical.',
        'Kiri, if you see a ghost, ask about its symptoms.'],
      move: ['Making a house call.', 'Keep your distance. Medically.', 'Coming through! Doctor! Mostly!', 'Mind the miasma. It bites.',
        'The cane goes first. Then me.', 'Pebbles, heel! Not through the miasma! You are ON FIRE!'],
      kill: ['Time of death: just now.', 'Patient discharged. Permanently.', 'The treatment worked. The patient didn\'t.',
        'Should have taken the leeches.', 'I\'ll mark that down as "cured".'],
      hurt: ['Ow! That\'s a billable injury!', 'Not the beak! It\'s load-bearing!', 'I\'ll need a doctor. Oh. Right.',
        'That will unbalance my humours.', 'Medically speaking: ow.', 'Ow! Hjalmar, was that one of YOUR traps?!'],
      lowhp: ['I\'m prescribing myself... everything.', 'My humours are... very unbalanced...', 'Onyx! The big bottle! The BIG one!',
        'This is fine. I have seen worse. Mostly on corpses.', 'Somebody pass me a potion. Not that one. That one!',
        'Pebbles, stop licking my wound! You are cauterising it!'],
      downed: ['Tell Onyx... he was right...', 'I diagnose myself... with floor.', 'Bring out... your... me...',
        'Self-medication... has failed...', 'Don\'t let the corgis lick the wound...'],
      revive: ['I\'m not dead yet! Medically, I\'m thriving!', 'Ah, smelling salts. My own recipe, too.', 'Back on my feet. Mostly on my cane.',
        'Death was a second opinion I didn\'t ask for.', 'The doctor is back in. Sorry for the wait.'],
      ally_down: ['Patient down! I repeat, patient down!', 'Nobody touch them! Let a professional poke them.',
        'Marwyn, stop flexing over the body and HELP!', 'Don\'t die! The paperwork is horrendous!', 'Hold still, I\'m coming! Not THAT still!',
        'Basanos, I am a doctor, not a vet! ...Fine. I am both.'],
      levelup: ['My medical license would be so proud. If I had one.', 'New techniques! Some of them are even legal!',
        'Level up! Onyx remains unimpressed.', 'I have learned so much from my malpractice.', 'Experience is the best medicine. Then leeches.'],
      victory: ['Take two of these and call me in the morning.', 'Another successful outbreak. Of victory!',
        'Onyx, collect samples. Not the shiny ones. Samples!', 'Syllamin, that was not "murder". It was a cure.', 'Let\'s loot the bodies. For science.',
        'Hjalmar, give Onyx his buttons back. Both of you. Now.'],
      idle: ['*ominous bubbling from a coat pocket*', 'Has anyone seen my leeches? Any of them?', 'Zarathor, stop polishing your rings in my miasma.',
        'Onyx says we\'re doing great. He\'s lying.', 'Marbles, that\'s not a nap, that\'s a coma. I\'d know.',
        'Betty, the medicine is not a snack. Put it down.'],
      signature: ['Oops. Wrong jar.', 'Wash your hands! WASH YOUR HANDS!', 'Jar Number Seven! Stand well back!', 'I call this one: The Common Everything.',
        'Pandemic! Everyone but us! Probably!'],
      raven_down: ['Onyx! Who is going to judge me now?', 'NEVERMORE?! ...that is not funny.', 'I\'ll bring you back! With science! And seeds!',
        'No! He still owes me three shiny buttons!', 'Don\'t worry. Onyx always comes back. Ravens are like that.'],
    },
  });
})();
