/* Dungeons and Degenerates — js/data/heroes/buga.js
 * Hero: Mayor Buga, the Toast of the Town — a lightly buttered slice of sourdough and small-town politician who is all
 * about the loot and making his allies do the work. v2 kit (DESIGN §6 "Simplicity": one verb per skill, the combos
 * carry the power): he points (Delegate), promises (Campaign Promise), flatters (Butter Up), hides behind people (Human
 * Shield), poses (Photo Op), pays (Bribe), ties things up in red tape (pull + Root), sheds flammable crumbs (Slow) and
 * plants pork-barrel spending (a lit explosive object). Passive: he takes the credit, and 2 gold, for every enemy an
 * ally defeats. His basic attack is ranged, so he never makes attacks of opportunity; Human Shield (a swap) and Red Tape
 * (a pull) move units without provoking any, and Delegate's free swings are not reactions.
 * Registers the hero, 12 skills (basic, signature, a pool of 10), the buga_crumbs surface, the buga_pork_barrel object
 * and 3 hero items.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HERO = 'buga';
  const CREDIT_GOLD = 2;      // Skimming Off the Top
  const CHAIN_GOLD = 3;       // ... wearing the Chain of Office
  const PEN_MARK = 2;         // Mightier-Than-the-Sword Pen: Campaign Pamphlet's Mark
  const TOASTER_HP = 0.5;     // The Re-Election Toaster
  const GOLD = '#ffd76a';

  // ---- helpers (runtime only) -----------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function byId(id) { return id == null || !DD.Combat ? null : DD.Combat.byId(id); }
  function hasItem(u, id) { return !!u && Array.isArray(u.items) && u.items.indexOf(id) >= 0; }
  function isBuga(u) { return !!u && u.kind === 'hero' && u.defId === HERO; }

  /** Cosmetic speech bubble with a literal line (DD.rng only, never during previews). */
  function say(unit, lines, chance) {
    if (!unit || !lines || !lines.length || DD.Act.simulating) return;
    if (chance !== undefined && DD.rng.next() >= chance) return;
    DD.Act.bark(unit, lines[Math.floor(DD.rng.next() * lines.length) % lines.length]);
  }

  const CREDIT_LINES = ['You\'re welcome, everyone!', 'I\'ll be taking credit for that.', 'My administration did that!',
    'Put that in the newsletter!', 'Another campaign promise kept!', 'I made that happen. Me. Personally.'];
  const DELEGATE_LINES = ['Handle that, would you?', 'You! Hit that. I\'m management.', 'Delegation IS leadership!',
    'I\'d do it myself, but I\'m toast.', 'Somebody fix that. Not me. Somebody.'];
  const PROMISE_LINES = ['Read my crust: more AP!', 'I promise! Probably!', 'An extra action? For YOU? Done.', 'Trust me. I\'m a mayor.'];
  const SHIELD_LINES = ['Take one for the team! My team.', 'Hazard pay is in the mail!', 'Hold still. You\'re my cover.'];
  const BRIBE_LINES = ['Everyone has a price!', 'Consider it a campaign donation.', 'Sign here, here, and attack him.'];
  const FINE_LINES = ['That\'s a loitering fine!', 'Citation! Pay up!', 'Ignorance of the law is no excuse!'];
  const BUTTER_LINES = ['Has anyone told you you look MAGNIFICENT?', 'You\'re my favorite constituent!', 'Buttered up and ready!'];
  const TAPE_LINES = ['Red tape! Fill out a form!', 'Your application has been delayed!', 'Hold it! Paperwork first!'];
  const PHOTO_LINES = ['Everybody say "cheese"!', 'Get my good side! It\'s both sides!', 'Smile! This one\'s for the newsletter!'];
  const PORK_LINES = ['Pork barrel spending!', 'Infrastructure! Duck!', 'Your tax gold at work!'];
  const CRUMB_LINES = ['Mind the crumbs!', 'I shed when I\'m nervous!', 'Free carbs for my supporters!'];

  // ---- passive: Skimming Off the Top ------------------------------------------------------------------
  /** Whose work it was: an ally of Buga (hero side), or a foe Buga himself bribed (Charmed by him). */
  function creditable(buga, dead, d) {
    if (!isBuga(buga) || !active(buga) || !dead || dead.side !== 'enemy' || dead.kind === 'summon') return false;
    const killer = d && d.credit;
    if (!killer || killer === buga || killer === dead) return false;
    if (killer.side === 'hero') return true;
    const charm = A().getStatus(killer, 'charmed');
    return !!charm && charm.source === buga.id;
  }
  /** onAnyDeath on Buga's passive: an enemy fell to somebody else's work, so Buga takes the credit (and the gold). */
  function takeCredit(buga, dead, d) {
    if (!creditable(buga, dead, d)) return;
    const gold = hasItem(buga, 'buga_chain_of_office') ? CHAIN_GOLD : CREDIT_GOLD;
    A().gainGold(gold);
    DD.FX.text(buga, '🎖️ Credit taken! +' + gold + ' gold', { color: GOLD, size: 13 });
    DD.FX.particles(dead, { kind: 'coins', count: 8 });
    A().log(buga.name + ' takes full credit for ' + d.credit.name + '\'s kill (+' + gold + ' gold).', 'hero');
    say(buga, CREDIT_LINES, 0.5);
  }

  // ---- Delegate / Toast of the Town: who swings for free -----------------------------------------------
  function strikeSlot(u) {
    if (u.kind === 'hero') return u.basic || null;
    const list = u.skills || [];
    for (let i = 0; i < list.length; i++) { const d = DD.getSkill(list[i].id); if (d && d.kind === 'attack') return list[i]; }
    return list[0] || null;
  }
  /** The basic attack (summons: first attack) an ally could swing at target right now for free, or null. */
  function strikeAt(ally, target) {
    if (!active(ally) || !active(target) || DD.Combat.isStunned(ally) || has(ally, 'sheep')) return null;
    const charm = A().getStatus(ally, 'charmed');
    if (charm && charm.source === target.id) return null;   // a charmed hero can't hurt its charmer
    const slot = strikeSlot(ally);
    const def = slot && DD.getSkill(slot.id);
    if (!def || def.hype > 0) return null;
    if (def.kind === 'spell' && has(ally, 'silenced')) return null;
    if (slot.cd > 0 || (def.charges > 0 && (slot.uses || 0) >= def.charges)) return null;
    if (typeof def.canUse === 'function') {
      const ok = DD.Targeting.pure(function () {
        return DD.safe('canUse of ' + def.id, def.canUse, def, [DD.Targeting.buildCtx(ally, slot, null)]);
      });
      if (ok === false || typeof ok === 'string') return null;
    }
    return DD.Targeting.isValidTarget(ally, slot, target.x, target.y) ? slot : null;
  }
  /** Up to n allies best placed to hit target: most expected damage, then nearest, then board order. */
  function delegates(user, target, n) {
    const s = S();
    if (!s || !user || !active(target)) return [];
    const out = [];
    s.units.forEach(function (u, i) {
      if (u === user || u.side !== user.side || G().hostile(user, u)) return;
      const slot = strikeAt(u, target);
      if (!slot) return;
      const L = DD.skillLevel(DD.getSkill(slot.id), slot.level);
      let est = L && L.dmg > 0 && DD.AI ? DD.AI.estimate(u, target, L.dmg, null) : 0;
      const taunt = A().getStatus(u, 'taunt');
      if (taunt && taunt.source && taunt.source !== target.id) est *= 0.5;   // hero Taunt: half damage vs others
      out.push({ unit: u, slot: slot, est: est, dist: G().dist(u, target), i: i });
    });
    out.sort(function (a, b) { return b.est - a.est || a.dist - b.dist || a.i - b.i; });
    return out.slice(0, Math.max(1, n || 1));
  }
  /** Target tile + the tiles of the allies who will swing (the HUD highlights who does the work). */
  function crewArea(n) {
    return function (ctx) {
      if (!ctx || !ctx.target || !ctx.user) return [];
      const out = [{ x: ctx.target.x, y: ctx.target.y }];
      const t = G().unitAt(ctx.target.x, ctx.target.y);
      if (active(t) && G().hostile(ctx.user, t)) {
        delegates(ctx.user, t, typeof n === 'function' ? n(ctx) : n).forEach(function (e) { out.push({ x: e.unit.x, y: e.unit.y }); });
      }
      return out;
    };
  }
  /** The ally swings its basic at t for free (re-checked: the previous swing may have moved or finished t). */
  function swing(user, ally, t) {
    const slot = active(t) ? strikeAt(ally, t) : null;
    if (!slot) return false;
    DD.FX.beam(user, ally, { color: GOLD, width: 2, ms: 200 });
    DD.FX.text(ally, '👉 Delegated!', { color: GOLD, size: 12 });
    DD.Combat.resolveSkill(ally, slot, { x: t.x, y: t.y }, { pay: false });
    return true;
  }

  // ---- Bribe / Pork Barrel / Crumb Trail helpers --------------------------------------------------------
  function bribeProblem(t, L) {
    if (!t) return 'Pick a foe.';
    if (DD.Act.isBoss(t)) return 'Bosses have their own accountants.';
    const f = t.flags || {};
    if (Array.isArray(f.immune) && f.immune.indexOf('charmed') >= 0) return 'Incorruptible. Disgusting.';
    if (has(t, 'charmed')) return 'Already on the payroll.';
    return A().gold() >= L.gold ? null : 'Can\'t afford it (' + L.gold + ' gold).';
  }

  /** A planted barrel's name (shown when inspected) states its exact blast and kickbacks. */
  function barrelLabel(data) {
    return 'Pork Barrel (' + data.dmg + ' fire' + (data.gold > 0 ? ', +' + data.gold + ' gold' : '') + ')';
  }

  /** A pork barrel can stand on a free, dry, non-burning floor tile. */
  function barrelSpotOk(x, y) {
    const t = G().tile(x, y);
    if (!t || t.obj || !G().isFree(x, y) || G().isDrop(x, y)) return false;
    if (G().terrain(t).liquid) return false;
    return !G().hazardAt(x, y, null);
  }

  /** Grounded foes on crumbs are Slowed through their next turn (flyers never touch the floor). */
  function slowFoe(unit) {
    if (!active(unit) || unit.side !== 'enemy' || G().isFlying(unit)) return;
    // a refresh (it walked in, then ended its turn there) is silent: one "Slowed" popup per slowdown, not per tick
    A().addStatus(unit, 'slow', { turns: 1, silent: has(unit, 'slow') }, null);
  }
  /** Crumbs only land on bare, dry floor (no liquids, no other surfaces). */
  function crumbSpotOk(x, y) {
    const t = G().tile(x, y);
    return !!t && !G().terrain(t).liquid && !G().isDrop(x, y) && G().terrain(t).walkable !== false && (!t.surface || t.surface.id === 'buga_crumbs');
  }

  // ---- FX painters (visual only) ---------------------------------------------------------------------
  function drawPaper(c, x, y, p, view, evt) {
    const z = (view && view.zoom) || 1;
    c.save();
    c.translate(x, y);
    c.rotate(p * 8);
    c.fillStyle = (evt && evt.paper) || '#f6efe0'; c.strokeStyle = '#2a160b'; c.lineWidth = 1.1 * z;
    c.beginPath(); c.rect(-4.2 * z, -2.8 * z, 8.4 * z, 5.6 * z); c.fill(); c.stroke();
    c.strokeStyle = (evt && evt.ink) || '#c8102e'; c.lineWidth = 0.9 * z;
    c.beginPath(); c.moveTo(-2.6 * z, -0.9 * z); c.lineTo(2.6 * z, -0.9 * z); c.moveTo(-2.6 * z, 1 * z); c.lineTo(1.4 * z, 1 * z); c.stroke();
    c.restore();
  }
  function drawBarrelShot(c, x, y, p, view) {
    const z = (view && view.zoom) || 1;
    c.save();
    c.translate(x, y);
    c.rotate(p * 10);
    c.fillStyle = '#e06a7c'; c.strokeStyle = '#1a1014'; c.lineWidth = 1.3 * z;
    c.beginPath(); c.ellipse(0, 0, 6 * z, 7.5 * z, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#5a2a2a'; c.lineWidth = 1.4 * z;
    c.beginPath(); c.moveTo(-6 * z, -3 * z); c.lineTo(6 * z, -3 * z); c.moveTo(-6 * z, 3 * z); c.lineTo(6 * z, 3 * z); c.stroke();
    c.fillStyle = '#ffb3c1'; c.beginPath(); c.ellipse(0, 0, 2.6 * z, 1.9 * z, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function paper(from, to, opts) {
    DD.FX.projectile(from, to, Object.assign({ kind: 'custom', arc: 0.35, color: '#f6efe0', draw: drawPaper, ms: 240 }, opts || {}));
  }

  // ---- surface: toast crumbs --------------------------------------------------------------------------
  function drawCrumbs(g) {
    const c = g.ctx, tl = g.tile || { x: 0, y: 0 };
    const rnd = function (salt) { return DD.Iso && DD.Iso.rand ? DD.Iso.rand(tl.x, tl.y, salt) : ((salt * 7919) % 97) / 97; };
    const spot = function (i, base, k) {
      const u = (rnd(base + i) - 0.5) * k, v = (rnd(base + 40 + i) - 0.5) * k;
      return { x: (u - v) * 32, y: (u + v) * 16 };
    };
    c.fillStyle = 'rgba(240,190,100,0.42)';
    c.fillRect(-32, -16, 64, 32);
    for (let i = 0; i < 14; i++) {
      const p = spot(i, 70, 0.86), s = 1.2 + rnd(210 + i) * 1.1;
      c.fillStyle = i % 3 === 0 ? '#7a3f16' : i % 2 ? '#f3cf86' : '#d9973f';
      c.fillRect(p.x - s / 2, p.y - s * 0.35, s, s * 0.7);
    }
    // chunky crumbs: little toasted crouton cubes (light top, darker sides)
    c.lineWidth = 0.7;
    c.strokeStyle = '#4a2610';
    c.lineJoin = 'round';
    for (let i = 0; i < 7; i++) {
      const p = spot(i, 130, 0.78), s = 2.2 + rnd(250 + i) * 1.9, x = p.x, y = p.y;
      c.beginPath(); c.moveTo(x - s, y - s * 0.5); c.lineTo(x, y); c.lineTo(x, y + s * 0.75); c.lineTo(x - s, y + s * 0.25); c.closePath();
      c.fillStyle = '#c98a3f'; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + s, y - s * 0.5); c.lineTo(x + s, y + s * 0.25); c.lineTo(x, y + s * 0.75); c.closePath();
      c.fillStyle = '#9c5b24'; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - s, y - s * 0.5); c.lineTo(x, y - s); c.lineTo(x + s, y - s * 0.5); c.lineTo(x, y); c.closePath();
      c.fillStyle = '#f6d18a'; c.fill(); c.stroke();
    }
  }
  DD.registerSurface({
    id: 'buga_crumbs', name: 'Toast Crumbs', color: 'rgba(214,158,74,0.5)', turns: 3,
    desc: 'Grounded enemies on the crumbs (walking in or ending their turn here) are Slowed (−2 move) on their next turn. ' +
      'Flammable: it is toast.',
    react: { fire: { surface: 'fire', turns: 2, spread: true }, water: { surface: null } },
    onEnter: function (unit) { slowFoe(unit); },
    onTurnEnd: function (unit) { slowFoe(unit); },   // a foe that stays on the crumbs stays Slowed
    draw: drawCrumbs,
  });

  // ---- object: the pork barrel ------------------------------------------------------------------------
  function drawPorkBarrel(g, obj, t) {
    const OUT = '#1a1014', c = g.ctx;
    g.ellipse(0, 1.5, 15, 7.5, 'rgba(0,0,0,0.3)');
    g.cylinder(0, 0, 12, 6, 24, '#d24a5e', '#ec8b99', OUT);
    c.beginPath(); c.ellipse(0, -4, 12.4, 6.2, 0, 0, Math.PI); c.strokeStyle = '#4a2028'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.ellipse(0, -19.5, 12.4, 6.2, 0, 0, Math.PI); c.strokeStyle = '#4a2028'; c.lineWidth = 2; c.stroke();
    g.poly([[-8, -25], [-10.5, -31], [-4.5, -27]], '#ec8b99', OUT);
    g.poly([[8, -25], [10.5, -31], [4.5, -27]], '#ec8b99', OUT);
    g.ellipse(0, -10, 4.6, 3.2, '#ffb3c1', OUT);
    g.circle(-1.6, -10, 0.9, '#7a2a3a');
    g.circle(1.6, -10, 0.9, '#7a2a3a');
    g.circle(-4.6, -15.5, 1.2, OUT);
    g.circle(4.6, -15.5, 1.2, OUT);
    g.text('$', 0, -20, 6, '#ffe066', { stroke: OUT, strokeWidth: 2 });
    g.line(2.5, -24.5, 5, -30.5, '#3a2a20', 1.4);
    const f = 0.5 + 0.5 * Math.sin((t || 0) * 16);
    g.glow(5, -31, 5 + 2 * f, '#ffb040', 0.9);
    g.circle(5, -31, 1.2, '#fff6c0');
  }
  DD.registerObject({
    // hp 1: "as soon as it is hit" (any damage, even a 1-damage splash, pops it)
    id: 'buga_pork_barrel', name: 'Pork Barrel', blocksMove: true, blocksLos: false, hp: 1, height: 0.9, color: '#d24a5e',
    // volatile: it explodes when destroyed, so any hero's single-target attack can be aimed at it to set it off
    smashable: true, volatile: true,
    desc: 'Its fuse is lit: it explodes at the end of the round, or as soon as it is hit or set alight, for the fire damage in ' +
      'its name (8-12 by Pork Barrel level) to everything within 1 tile, whoever smashed it included. Taxpayer funded, pork filled.',
    react: { fire: { destroy: true } },
    // AutoPlay: worth popping when foes (not friends, not the smasher) stand next to it; a lit one blows anyway at the end
    // of the round, so popping it early only lands the blast before the enemies act
    autoplay: function (unit, obj, tile) {
      if (!unit || !tile) return 0;
      const data = (obj && obj.data) || {};
      const dmg = data.dmg > 0 ? data.dmg : 8;
      let v = 0;
      G().shape('circle', { x: tile.x, y: tile.y }, null, 1).forEach(function (p) {
        const u = G().unitAt(p.x, p.y);
        if (active(u)) v += G().hostile(unit, u) ? dmg : -dmg * 1.5;
      });
      return Math.max(0, v) * (data.fuse > 0 ? 0.5 : 1);
    },
    // the fuse (data.fuse rounds, set when Buga plants it) burns down at the end of the round
    onRoundEnd: function (o, tile) {
      const data = (o && o.data) || {};
      if (!(data.fuse > 0) || !tile || tile.obj !== o) return;
      data.fuse--;
      if (data.fuse > 0) return;
      const owner = byId(data.owner);
      A().log('The Pork Barrel\'s fuse burns down...', 'dmg');
      A().destroyObject(tile.x, tile.y, owner && !owner.dead ? owner : null);
    },
    // credit: the hero who popped it (so an ally's pop is an ally's kill: Buga takes the credit), else its owner
    onDestroyed: function (o, tile, src) {
      const data = (o && o.data) || {};
      const owner = byId(data.owner);
      const credit = src && src.side === 'hero' ? src : (active(owner) ? owner : src || null);
      A().log('The Pork Barrel goes off! Somebody is getting re-elected.', 'dmg');
      A().explode(credit, tile.x, tile.y, { radius: 1, dmg: data.dmg > 0 ? data.dmg : 8, element: 'fire' });
      if (data.gold > 0) {
        A().gainGold(data.gold);
        DD.FX.particles(tile, { kind: 'coins', count: 14 });
        DD.FX.text(tile, '+' + data.gold + ' gold (kickbacks)', { color: GOLD, size: 13 });
      }
    },
    draw: drawPorkBarrel,
  });

  // ---- basic & signature ------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'buga_pamphlet', name: 'Campaign Pamphlet', owner: HERO, icon: '🗞️', kind: 'attack', tags: ['ranged'],
    ap: 1, cooldown: 0, levels: [{ dmg: 4 }],
    target: { type: 'unit', range: [1, 4], los: true, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe within 4 tiles.'; },
    flavor: 'Fourteen promises and a coupon. The coupon has expired.',
    execute: function (ctx) {
      const t = ctx.targetUnit;
      if (!t) return;
      paper(ctx.user, t);
      A().damage(ctx.user, t, ctx.L.dmg);
    },
  });

  DD.registerSkill({
    id: 'buga_toast_of_the_town', name: 'Toast of the Town', owner: HERO, icon: '🥂', kind: 'buff',
    tags: ['command', 'ally', 'combo'],
    ap: 2, cooldown: 0, hype: 100, levels: [{}],
    target: { type: 'unit', range: [1, 6], los: false, filter: 'enemy',
      canTarget: function (ctx) { return ctx.targetUnit && delegates(ctx.user, ctx.targetUnit, 1).length ? true : 'No ally can reach that foe.'; } },
    area: { shape: 'custom', fn: crewArea(99) },
    desc: function () {
      return 'Point at a foe within 6 tiles: every ally who can hit it makes 2 free basic attacks on it.';
    },
    flavor: '"To my brave volunteers!" He raises a glass. They charge. Twice. He does not.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      DD.FX.banner('TOAST OF THE TOWN!', { sub: 'Four more years! (Of you doing the work.)', color: GOLD });
      DD.FX.flash('#ffe9a8', 260);
      DD.FX.shake(5, 300);
      DD.FX.particles(u, { kind: 'coins', count: 26 });
      A().log(u.name + ' raises a glass and gives a forty-minute toast. Everyone else does the fighting.', 'narrator');
      // a dogpile: everyone swings, then everyone swings again (each swing re-checks that the foe is still there)
      const crew = delegates(u, t, 99);
      for (let round = 0; round < 2; round++) crew.forEach(function (e) { swing(u, e.unit, t); });
    },
  });

  // ---- the skill pool ---------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'buga_delegate', name: 'Delegate', owner: HERO, icon: '👉', kind: 'buff', tags: ['command', 'ally', 'combo'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ allies: 1, cd: 2 }, { allies: 1, cd: 1 }, { allies: 2, cd: 1 }],
    target: { type: 'unit', range: [1, 6], los: false, filter: 'enemy',
      canTarget: function (ctx) { return ctx.targetUnit && delegates(ctx.user, ctx.targetUnit, 1).length ? true : 'No ally can reach that foe.'; } },
    area: { shape: 'custom', fn: crewArea(function (ctx) { return (ctx.L && ctx.L.allies) || 1; }) },
    desc: function (L) {
      return 'Point at a foe within 6 tiles: ' + (L.allies > 1 ? 'the ' + L.allies + ' best-placed allies make free basic attacks' :
        'the best-placed ally makes a free basic attack') + ' on it.';
    },
    flavor: 'Leadership is mostly pointing.',
    execute: function (ctx) {
      const user = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      const crew = delegates(user, t, ctx.L.allies);
      if (!crew.length) { DD.FX.text(user, 'Nobody volunteers...', { color: '#dddddd', size: 13 }); return; }
      DD.FX.lunge(user, t);
      say(user, DELEGATE_LINES, 0.4);
      crew.forEach(function (e) { swing(user, e.unit, t); });
    },
  });

  DD.registerSkill({
    id: 'buga_fine', name: 'Loitering Fine', owner: HERO, icon: '🧾', kind: 'attack', tags: ['ranged', 'gold'],
    ap: 1, cooldown: 1,
    levels: [{ dmg: 4, gold: 2 }, { dmg: 5, gold: 2 }, { dmg: 6, gold: 3 }],
    target: { type: 'unit', range: [1, 3], los: true, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe within 3 tiles and pocket ' + L.gold + ' gold.'; },
    flavor: 'Loitering in a dungeon is a 2-gold fine. Loitering while undead is extra.',
    // the gold is run value the dry run can't see: worth a little over a plain pamphlet (a fine served on a barrel sets
    // it off and collects nothing)
    autoplayValue: function (ctx) { return ctx && ctx.L && ctx.targetUnit ? ctx.L.gold : 0; },
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!t) return;
      paper(u, t, { paper: '#ffe066', ink: '#1a1014' });
      say(u, FINE_LINES, 0.35);
      A().damage(u, t, ctx.L.dmg);
      A().gainGold(ctx.L.gold);
      DD.FX.text(t, '🧾 +' + ctx.L.gold + ' gold', { color: GOLD, size: 13 });
      A().log(t.name + ' is fined ' + ctx.L.gold + ' gold for loitering.', 'hero');
    },
  });

  DD.registerSkill({
    id: 'buga_promise', name: 'Campaign Promise', owner: HERO, icon: '🤞', kind: 'buff', tags: ['ap', 'ally', 'combo'],
    ap: 0, cooldown: function (L) { return L.cd; },
    levels: [{ ap: 1, cd: 3 }, { ap: 1, cd: 2 }, { ap: 2, cd: 2 }],
    target: { type: 'unit', range: [1, 5], los: false, filter: 'ally' },
    desc: function (L) { return 'An ally within 5 tiles gains ' + L.ap + ' AP on its next turn.'; },
    flavor: 'Read my crust: more AP. Terms and conditions apply. Promises cost nothing (that is the problem).',
    execute: function (ctx) {
      const ally = ctx.targetUnit;
      if (!active(ally)) return;
      DD.FX.particles(ally, { kind: 'sparks', count: 10 });
      A().gainAp(ally, ctx.L.ap);
      say(ctx.user, PROMISE_LINES, 0.45);
    },
  });

  DD.registerSkill({
    id: 'buga_human_shield', name: 'Human Shield', owner: HERO, icon: '🛡️', kind: 'buff', tags: ['swap', 'defend', 'ally', 'combo'],
    ap: 1, cooldown: 2,
    levels: [{ r: 3, block: 4 }, { r: 4, block: 6 }, { r: 5, block: 8 }],
    target: { type: 'unit', range: function (L) { return [1, L.r]; }, los: false, filter: 'ally',
      canTarget: function (ctx) {
        const a = ctx.targetUnit, u = ctx.user;
        if (!a || !u) return 'Pick an ally.';
        if (DD.Act.isImmovable(a) || DD.Act.isImmovable(u)) return 'Won\'t budge.';
        if (!G().isFlying(u) && (G().isDrop(a.x, a.y) || !G().isWalkable(a.x, a.y, u))) return 'Buga can\'t stand there.';
        return true;
      } },
    desc: function (L) { return 'Swap places with an ally within ' + L.r + ' tiles; it gains ' + L.block + ' Block.'; },
    flavor: 'A good leader stands behind his people. Directly behind. Using them as cover.',
    execute: function (ctx) {
      const u = ctx.user, ally = ctx.targetUnit;
      if (!active(ally)) return;
      if (!A().swap(u, ally, { src: u })) { DD.FX.text(u, 'Won\'t budge!', { color: '#dddddd', size: 13 }); return; }
      if (!active(ally)) return;
      A().addBlock(ally, ctx.L.block);
      DD.FX.text(ally, 'Hazard pay!', { color: GOLD, size: 12 });
      say(u, SHIELD_LINES, 0.45);
    },
  });

  DD.registerSkill({
    id: 'buga_bribe', name: 'Bribe', owner: HERO, icon: '💰', kind: 'utility', tags: ['gold', 'charm', 'ranged', 'combo'],
    ap: 1, cooldown: 3,
    levels: [{ gold: 10, r: 3, turns: 1 }, { gold: 8, r: 4, turns: 1 }, { gold: 8, r: 4, turns: 2 }],
    target: { type: 'unit', range: function (L) { return [1, L.r]; }, los: true, filter: 'enemy',
      canTarget: function (ctx) { return bribeProblem(ctx.targetUnit, ctx.L) || true; } },
    canUse: function (ctx) { return A().gold() >= ctx.L.gold ? true : 'Not enough gold (' + ctx.L.gold + ' needed).'; },
    desc: function (L) {
      return 'Pay ' + L.gold + ' gold to Charm a foe within ' + L.r + ' tiles (not a boss): on its next ' +
        (L.turns > 1 ? L.turns + ' turns' : 'turn') + ' it fights for you.';
    },
    flavor: 'Everyone has a price. Goblins are on sale.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t) || bribeProblem(t, ctx.L)) return;
      DD.FX.projectile(u, t, { kind: 'coin' });
      const st = A().addStatus(t, 'charmed', { turns: ctx.L.turns }, u);
      if (!st) { DD.FX.text(t, 'Not for sale!', { color: '#dddddd', size: 13 }); return; }
      A().spendGold(ctx.L.gold);
      DD.FX.particles(t, { kind: 'coins', count: 10 });
      DD.FX.text(t, '−' + ctx.L.gold + ' gold', { color: GOLD, size: 13 });
      A().log(u.name + ' slips ' + t.name + ' ' + ctx.L.gold + ' gold. Loyalty is a subscription.', 'hero');
      say(u, BRIBE_LINES, 0.45);
    },
  });

  DD.registerSkill({
    id: 'buga_butter_up', name: 'Butter Up', owner: HERO, icon: '🧈', kind: 'buff', tags: ['ally', 'empower', 'combo'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ r: 3, cd: 2 }, { r: 5, cd: 1 }, { r: 5, cd: 1, inspire: true }],
    target: { type: 'unit', range: function (L) { return [1, L.r]; }, los: false, filter: 'ally' },
    desc: function (L) {
      return 'An ally within ' + L.r + ' tiles is Empowered: its next damaging skill deals +50%' +
        (L.inspire ? ', and it is Inspired (+25% damage) through its next turn' : '') + '.';
    },
    flavor: 'Flattery gets you everywhere. Butter gets you there faster.',
    execute: function (ctx) {
      const u = ctx.user, ally = ctx.targetUnit;
      if (!active(ally)) return;
      DD.FX.particles(ally, { kind: 'glitter', color: '#fff1a3', count: 12 });
      DD.FX.text(ally, '🧈 Buttered up!', { color: '#fff1a3', size: 12 });
      A().addStatus(ally, 'empowered', {}, u);
      if (ctx.L.inspire) A().addStatus(ally, 'inspired', { turns: 1 }, u);
      say(u, BUTTER_LINES, 0.45);
    },
  });

  DD.registerSkill({
    id: 'buga_red_tape', name: 'Red Tape', owner: HERO, icon: '🎀', kind: 'utility', tags: ['pull', 'root', 'ranged', 'combo'],
    ap: 1, cooldown: 2,
    levels: [{ r: 4, pull: 2 }, { r: 4, pull: 3 }, { r: 5, pull: 4 }],
    target: { type: 'unit', range: function (L) { return [2, L.r]; }, los: true, filter: 'enemy' },
    desc: function (L) {
      return 'Pull a foe 2-' + L.r + ' tiles away up to ' + L.pull + ' tiles toward Buga and Root it for its next turn.';
    },
    flavor: 'Please fill out Form 27-B in triplicate before attacking the Mayor.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      DD.FX.beam(u, t, { color: '#d0102a', width: 3 });
      say(u, TAPE_LINES, 0.35);
      A().pull(u, t, u, ctx.L.pull);
      if (active(t)) A().addStatus(t, 'root', { turns: 1 }, u);
    },
  });

  DD.registerSkill({
    id: 'buga_photo_op', name: 'Photo Op', owner: HERO, icon: '📸', kind: 'buff', tags: ['aoe', 'inspire', 'ally', 'combo'],
    ap: 1, cooldown: 2,
    levels: [{ r: 2 }, { r: 3 }, { r: 3, hype: 3 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) {
      return 'Allies within ' + L.r + ' tiles are Inspired (+25% damage) through their next turn' +
        (L.hype > 0 ? '; +' + L.hype + ' Hype for each of them' : '') + '.';
    },
    flavor: 'Get his good side. Both sides are his good side. He is toast.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.flash('#ffffff', 160);
      DD.FX.particles(u, { kind: 'sparks', count: 18 });
      DD.FX.text(u, '📸 Say cheese!', { color: '#ffffff', size: 14 });
      say(u, PHOTO_LINES, 0.5);
      let n = 0;
      ctx.friends.forEach(function (f) {
        if (f === u || !active(f)) return;
        A().addStatus(f, 'inspired', { turns: 1 }, u);
        n++;
      });
      if (ctx.L.hype > 0 && n) A().gainHype(ctx.L.hype * n, 'Photo Op');
    },
  });

  DD.registerSkill({
    id: 'buga_pork_barrel', name: 'Pork Barrel', owner: HERO, icon: '🐷', kind: 'utility', tags: ['fire', 'object', 'aoe', 'gold', 'combo'],
    ap: 2, cooldown: 1, charges: 2,
    levels: [{ boom: 8 }, { boom: 10 }, { boom: 12, gold: 3 }],
    target: { type: 'tile', range: [1, 4], los: true, filter: 'empty',
      canTarget: function (ctx) { return ctx.target && barrelSpotOk(ctx.target.x, ctx.target.y) ? true : 'No room for the barrel.'; } },
    area: { shape: 'circle', size: 1 },
    desc: function (L) {
      return 'Plant a Pork Barrel within 4 tiles. It explodes at round end, or when hit or lit: ' + L.boom +
        ' fire damage within 1 tile' + (L.gold > 0 ? ', +' + L.gold + ' gold' : '') + '.';
    },
    flavor: 'Taxpayer funded and highly explosive. Like most public works.',
    // the blast comes after the dry run (end of the round): foes next to the spot are worth most of it, allies cost it
    autoplayValue: function (ctx) {
      if (!ctx || !ctx.L || !ctx.target) return 0;
      let v = 0;
      (ctx.foes || []).forEach(function () { v += ctx.L.boom * 0.6; });
      (ctx.friends || []).forEach(function () { v -= ctx.L.boom; });
      return Math.max(0, v);
    },
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!p || !barrelSpotOk(p.x, p.y)) return;
      DD.FX.projectile(u, p, { kind: 'custom', arc: 1, draw: drawBarrelShot, ms: 360 });
      say(u, PORK_LINES, 0.45);
      const data = { dmg: ctx.L.boom, gold: ctx.L.gold || 0, owner: u.id, fuse: 1 };
      if (!A().placeObject(p.x, p.y, 'buga_pork_barrel', { label: barrelLabel(data), data: data })) return;
      DD.FX.tile(p.x, p.y, 'pulse', { color: '#ff8fa3' });
      DD.FX.text(p, 'THUNK!', { color: '#ffb3c1', size: 13 });
    },
  });

  DD.registerSkill({
    id: 'buga_crumbs', name: 'Crumb Trail', owner: HERO, icon: '🍞', kind: 'utility', tags: ['surface', 'aoe', 'slow', 'combo'],
    ap: 1, cooldown: 2,
    levels: [{ r: 1, turns: 3 }, { r: 2, turns: 3 }, { r: 2, turns: 5 }],
    target: { type: 'tile', range: [1, 4], los: true, filter: 'any' },
    area: { shape: 'cross', size: function (L) { return L.r; } },
    desc: function (L) {
      return 'Scatter flammable crumbs on the bare floor of a ' + (4 * L.r + 1) + '-tile cross within 4 for ' + L.turns +
        ' rounds: grounded foes there are Slowed (−2 move).';
    },
    flavor: 'He sheds when he is nervous. He is always nervous.',
    execute: function (ctx) {
      const u = ctx.user;
      if (ctx.target) DD.FX.particles(ctx.target, { kind: 'dust', count: 14 });
      say(u, CRUMB_LINES, 0.35);
      ctx.tiles.forEach(function (p, i) {
        if (!crumbSpotOk(p.x, p.y) || !A().setSurface(p.x, p.y, 'buga_crumbs', ctx.L.turns)) return;
        DD.FX.tile(p.x, p.y, 'glow', { color: '#e0a13a', parallel: i > 0 });
        slowFoe(G().unitAt(p.x, p.y));
      });
    },
  });

  // ---- items ------------------------------------------------------------------------------------------
  DD.registerItem({
    id: 'buga_golden_pen', name: 'Mightier-Than-the-Sword Pen', slot: 'weapon', rarity: 'rare', icon: '🖋️', hero: HERO,
    stats: { dmg: 0.1 },
    desc: '+10% damage. Campaign Pamphlet also Marks its target: the next hit it takes deals +' + PEN_MARK + ' damage.',
    flavor: 'Signs executive orders, autographs and, in a pinch, eyeballs.',
    hooks: {
      onSkillUsed: function (ctx) {
        if (!ctx || !ctx.skill || ctx.skill.id !== 'buga_pamphlet' || !isBuga(ctx.user) || !active(ctx.targetUnit)) return;
        A().addStatus(ctx.targetUnit, 'marked', { stacks: PEN_MARK }, ctx.user);
      },
    },
  });
  DD.registerItem({
    id: 'buga_chain_of_office', name: 'Chain of Office (Gold-Plated)', slot: 'trinket', rarity: 'rare', icon: '🏅', hero: HERO,
    stats: { hype: 10 },
    desc: '+10 Hype at combat start. Skimming Off the Top pays ' + CHAIN_GOLD + ' gold per credit instead of ' + CREDIT_GOLD + '.',
    flavor: 'Solid gold, as long as nobody scratches it. Please do not scratch it.',
    hooks: {},
  });
  DD.registerItem({
    id: 'buga_toaster', name: 'The Re-Election Toaster', slot: 'armor', rarity: 'legendary', icon: '🍞', hero: HERO,
    stats: { hp: 6, armor: 1 },
    desc: '+6 max HP, +1 armor. Once per combat, when Buga goes down he pops right back up with ' + Math.round(TOASTER_HP * 100) + '% HP. Ding!',
    flavor: 'Two slots: one for the Mayor, one for his running mate.',
    hooks: {
      onDowned: function (unit) {
        if (!unit || unit.dead || !unit.downed || !unit.data || unit.data.buga_toasted) return;
        unit.data.buga_toasted = true;
        DD.FX.text(unit, '🍞 DING!', { color: GOLD, size: 22 });
        A().log('DING! ' + unit.name + ' pops back out of the toaster, golden brown and re-elected.', 'heal');
        // downed mid-walk (an attack of opportunity, a trap): he did go down, so that walk ends where he fell (DESIGN §4.2)
        if (A().revive(unit, TOASTER_HP)) A().stopMove(unit);
      },
    },
  });

  // ---- sprite: a slice of toast in a top hat (custom painter, origin at the feet, +y down) ---------
  function slicePath(c) {
    c.moveTo(-10, -8);
    c.lineTo(-10.2, -21.5);
    c.bezierCurveTo(-14.2, -22.6, -14.8, -29.4, -10.6, -32.2);
    c.bezierCurveTo(-7.6, -34.8, -2.8, -34.6, 0, -32.9);
    c.bezierCurveTo(2.8, -34.6, 7.6, -34.8, 10.6, -32.2);
    c.bezierCurveTo(14.8, -29.4, 14.2, -22.6, 10.2, -21.5);
    c.lineTo(10, -8);
    c.quadraticCurveTo(10, -5.5, 7.5, -5.5);
    c.lineTo(-7.5, -5.5);
    c.quadraticCurveTo(-10, -5.5, -10, -8);
    c.closePath();
  }
  function crumbPath(c) {
    c.moveTo(-8, -8.6);
    c.lineTo(-8.2, -22.4);
    c.bezierCurveTo(-11.8, -23.4, -12.4, -28.8, -9, -30.6);
    c.bezierCurveTo(-6.4, -32.6, -2.6, -32.4, 0, -31);
    c.bezierCurveTo(2.6, -32.4, 6.4, -32.6, 9, -30.6);
    c.bezierCurveTo(12.4, -28.8, 11.8, -23.4, 8.2, -22.4);
    c.lineTo(8, -8.6);
    c.quadraticCurveTo(8, -7.5, 6.6, -7.5);
    c.lineTo(-6.6, -7.5);
    c.quadraticCurveTo(-8, -7.5, -8, -8.6);
    c.closePath();
  }
  function grinPath(c) {
    c.moveTo(-6, -20.9);
    c.quadraticCurveTo(0, -19.4, 6, -20.9);
    c.quadraticCurveTo(5.3, -14.6, 0, -14.4);
    c.quadraticCurveTo(-5.3, -14.6, -6, -20.9);
    c.closePath();
  }

  function drawBuga(g, t, o) {
    o = o || {};
    const P = g.pal, c = g.ctx;
    const pt = typeof g.poseT === 'number' ? g.poseT : 0.5;
    const atk = g.pose === 'attack' ? Math.sin(Math.PI * pt) : 0;
    const cast = g.pose === 'cast';
    const hurt = g.pose === 'hurt';
    const ko = (o.lying || 0) > 0.5;
    const wave = o.still ? 0.35 : Math.sin(t * 3.4);
    const step = typeof o.walk === 'number' ? Math.sin(o.walk * Math.PI * 2) : 0;
    const limb = P.limb || '#4a2a14', glove = P.glove || '#ffffff', shoe = P.shoe || '#1d1a22';
    const crust = P.crust || '#94531f';

    // back arm (behind the slice), holding a rolled-up pamphlet
    const bh = cast ? { x: -15.4, y: -27.5 } : { x: -14.4, y: -11 + wave * 0.25 };
    g.limb(-9.4, -16, bh.x, bh.y, 2, limb, cast ? -14 : -13.8, cast ? -19.5 : -14.6);
    if (!cast) g.rect(bh.x - 1.1, bh.y - 4.6, 2.3, 5.6, '#f6efe0', undefined, 0.8);
    g.circle(bh.x, bh.y, 2.1, glove);

    // stubby legs and shiny shoes
    const lift1 = Math.max(0, step) * 1.2, lift2 = Math.max(0, -step) * 1.2;
    g.limb(-3.8, -6.5, -4.3 - step * 1.4, -1.7 - lift1, 2.3, limb);
    g.limb(3.8, -6.5, 4.3 + step * 1.4, -1.7 - lift2, 2.3, limb);
    g.ellipse(-4.7 - step * 1.4, -1.2 - lift1, 3, 1.5, shoe);
    g.ellipse(5.2 + step * 1.4, -1.2 - lift2, 3, 1.5, shoe);

    // the slice: crust, toasted crumb, a few pores
    g.path(slicePath, crust);
    const grad = c.createRadialGradient(-1, -22, 1.5, 0, -20, 15.5);
    grad.addColorStop(0, P.crumb || '#f8dc98');
    grad.addColorStop(0.55, P.skin || '#e3a857');
    grad.addColorStop(1, P.toast || '#c98a3f');
    g.path(crumbPath, grad, null);
    [[-5.6, -10.4], [5.4, -9.6], [-8, -26.5], [7.6, -28.6], [-3, -31.2], [2.6, -9.2]].forEach(function (p, i) {
      g.ellipse(p[0], p[1], 0.6 + (i % 2) * 0.3, 0.42, g.rgba(crust, 0.55), null);
    });

    // mayor's sash (clipped to the slice) and the chain of office
    c.save();
    c.beginPath(); slicePath(c); c.clip();
    g.poly([[-15, -17.2], [15, -10.2], [15, -6.2], [-15, -13.2]], P.cloth || '#c8102e', g.outline, g.lw * 0.8);
    g.line(-15, -16.1, 15, -9.1, P.metal || '#ffcf3f', 0.7);
    c.restore();
    c.save();
    c.beginPath(); c.moveTo(-8.6, -18.4); c.quadraticCurveTo(0, -8.8, 8.6, -18.4);
    c.strokeStyle = g.outline; c.lineWidth = 2.6; c.stroke();
    c.setLineDash([1.3, 0.8]);
    c.strokeStyle = P.metal || '#ffcf3f'; c.lineWidth = 1.5; c.stroke();
    c.restore();
    g.circle(0, -12.6, 2.8, P.metal || '#ffcf3f');
    g.circle(0, -12.6, 1.5, g.shade(P.metal || '#ffcf3f', -0.25), null);
    g.star(-0.9, -13.6, 1.1, '#ffffff', null, 4, 0.35);

    // face: dot eyes, smug brows, blush, the big politician grin
    const ey = -25.4, ex = 3.9;
    if (ko) {
      [-ex, ex].forEach(function (x) { g.line(x - 1.4, ey - 1.4, x + 1.4, ey + 1.4, P.eye, 1.1); g.line(x - 1.4, ey + 1.4, x + 1.4, ey - 1.4, P.eye, 1.1); });
    } else if (hurt) {
      g.line(-ex - 1.5, ey - 1.2, -ex + 1.2, ey, P.eye, 1.2); g.line(-ex + 1.2, ey, -ex - 1.5, ey + 1.2, P.eye, 1.2);
      g.line(ex + 1.5, ey - 1.2, ex - 1.2, ey, P.eye, 1.2); g.line(ex - 1.2, ey, ex + 1.5, ey + 1.2, P.eye, 1.2);
    } else if (g.blink) {
      g.line(-ex - 1.5, ey, -ex + 1.5, ey, P.eye, 1.1); g.line(ex - 1.5, ey, ex + 1.5, ey, P.eye, 1.1);
    } else {
      g.circle(-ex, ey, 1.85, P.eye, null); g.circle(ex, ey, 1.85, P.eye, null);
      g.circle(-ex + 0.6, ey - 0.65, 0.62, '#ffffff', null); g.circle(ex + 0.6, ey - 0.65, 0.62, '#ffffff', null);
    }
    const bt = atk > 0.2 ? 0.9 : cast ? -0.6 : 0;
    g.line(-ex - 1.9, ey - 3 - bt * 0.3, -ex + 1.6, ey - 3.5 + bt, crust, 1.15);
    g.line(ex - 1.6, ey - 3.5 + bt, ex + 1.9, ey - 3 - bt * 0.3, crust, 1.15);
    g.circle(-7.4, -21.6, 1.9, g.rgba('#ff6f5a', 0.35), null);
    g.circle(7.4, -21.6, 1.9, g.rgba('#ff6f5a', 0.35), null);
    if (ko) {
      g.line(-3.5, -17.6, 3.5, -17.6, P.mouth || '#5a1d12', 1.3);
    } else if (hurt) {
      g.ellipse(0, -17.4, 2.2, 2.6, P.mouth || '#5a1d12');
    } else if (cast) {
      g.ellipse(0, -17.2, 3.6, 3.4, P.mouth || '#5a1d12');
      g.ellipse(0, -15.6, 2.1, 1.2, '#d9534f', null);
    } else {
      g.path(grinPath, P.mouth || '#5a1d12', null);
      c.save();
      c.beginPath(); grinPath(c); c.clip();
      g.rect(-6.5, -21.6, 13, 3.3, P.teeth || '#fffaf0', null);
      [-3.4, -1.1, 1.1, 3.4].forEach(function (x) { g.line(x, -20.6, x, -18.5, 'rgba(90,40,20,0.35)', 0.5); });
      g.rect(1.3, -20.6, 2.1, 2, P.metal || '#ffcf3f', null);
      g.ellipse(0, -15.2, 2.6, 1.3, '#d9534f', null);
      c.restore();
      g.path(grinPath, null, g.outline, g.lw * 0.75);
    }

    // a pat of butter melting on the left lobe: puddle, drip, then the slab itself
    const butter = P.accent || '#fff1a3';
    const melt = o.still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.3);
    g.ellipse(-6.6, -33.5, 5, 1.6, g.rgba(butter, 0.92), null);
    g.path(function (cc) {
      cc.moveTo(-10.2, -33.4);
      cc.quadraticCurveTo(-10.9, -31.4 + melt * 0.8, -10, -29.8 + melt * 1.3);
      cc.quadraticCurveTo(-9.1, -30.9 + melt * 0.7, -8.6, -33.4);
      cc.closePath();
    }, butter, null);
    c.save();
    c.translate(-6.4, -35.4);
    c.rotate(-0.1);
    g.poly([[-3.2, 0.4], [-1.6, -1.5], [4.4, -1.5], [2.8, 0.4]], '#fff8d6', g.outline, 1);
    g.poly([[-3.2, 0.4], [2.8, 0.4], [2.8, 2.7], [-3.2, 2.7]], butter, g.outline, 1);
    g.poly([[2.8, 0.4], [4.4, -1.5], [4.4, 0.8], [2.8, 2.7]], P.butterEdge || '#e3c25a', g.outline, 1);
    g.line(-1.6, -0.5, 2, -0.5, '#ffffff', 0.7);
    c.restore();

    // top hat, worn at a jaunty angle on the right lobe
    const hb = o.still ? 0 : Math.sin(t * 2.6 + 1) * 0.35;
    const hat = P.hair || '#1f1b24';
    c.save();
    c.translate(5.6, -33.6 + hb);
    c.rotate(0.17 + (cast ? -0.12 : 0) + atk * 0.08);
    g.ellipse(0, 0, 7.1, 1.9, hat);
    g.path(function (cc) { cc.moveTo(-4.3, -0.6); cc.lineTo(-3.9, -9.8); cc.lineTo(3.9, -9.8); cc.lineTo(4.3, -0.6); cc.closePath(); }, hat);
    g.rect(-4.2, -3.4, 8.4, 2, P.band || P.metal || '#d4af37', null);
    g.ellipse(0, -9.8, 3.9, 1.15, g.shade(hat, 0.22));
    g.line(-2.5, -8.3, -2.3, -4, 'rgba(255,255,255,0.2)', 0.9);
    c.restore();

    // front arm: the eternal politician wave (pointing when attacking, both arms up when giving a speech)
    let fh;
    if (cast) fh = { x: 15.6, y: -28 };
    else if (atk > 0) fh = { x: 15.6 + atk * 3.6, y: -18.5 - atk * 1.5 };
    else fh = { x: 14.8 + wave * 0.8, y: -24.6 + Math.abs(wave) * 0.9 };
    g.limb(9.5, -16, fh.x, fh.y, 2, limb, 13.6, -16.8);
    g.circle(fh.x, fh.y, 2.25, glove);
    if (atk > 0) g.limb(fh.x + 1, fh.y, fh.x + 3.4, fh.y - 0.3, 0.9, glove);
  }

  const SPRITE = {
    base: 'custom', scale: 1,
    palette: {
      skin: '#e3a857', cloth: '#c8102e', cloth2: '#f6e7b0', hair: '#1f1b24', metal: '#ffcf3f', eye: '#1a1014',
      accent: '#fff1a3', outline: '#2a160b', crust: '#94531f', crumb: '#f8dc98', toast: '#c98a3f', mouth: '#5a1d12',
      teeth: '#fffaf0', limb: '#4a2a14', glove: '#ffffff', shoe: '#1d1a22', band: '#d4af37', butterEdge: '#e3c25a',
    },
    height: 44, width: 28, headY: -25,
    portrait: { x: 1, y: -25, r: 19 },
    draw: drawBuga,
  };

  // ---- the hero ---------------------------------------------------------------------------------------
  DD.registerHero({
    id: HERO, name: 'Mayor Buga', epithet: 'the Toast of the Town', race: 'Toast (Sourdough)', cls: 'Mayor',
    role: 'Support · manipulator · loot', complexity: 2,
    blurb: 'A lightly buttered slice of sourdough who won the mayoral race on one promise: more gold for Mayor Buga. ' +
      'He never fights his own battles; he points, makes promises and takes the credit (and the gold) for every kill. ' +
      'The town adores him. The town is also missing its treasury.',
    color: '#2a9d8f',
    unlock: null, // v2: every hero is available from the start (user request; was: beat Grimble)
    stats: { hp: 24, ap: 3, mov: 4, armor: 0, init: 0 },
    growth: { hp: 4 },
    flags: {},
    sprite: SPRITE,
    basic: 'buga_pamphlet',
    signature: 'buga_toast_of_the_town',
    passive: {
      name: 'Skimming Off the Top',
      desc: 'Whenever an ally (or a foe he bribed) defeats an enemy while Buga stands, he takes the credit: +' + CREDIT_GOLD + ' gold.',
      hooks: { onAnyDeath: function (unit, dead, d) { takeCredit(unit, dead, d); } },
    },
    startingSkills: ['buga_delegate', 'buga_fine'],
    skillPool: ['buga_delegate', 'buga_fine', 'buga_promise', 'buga_human_shield', 'buga_bribe', 'buga_butter_up',
      'buga_red_tape', 'buga_photo_op', 'buga_pork_barrel', 'buga_crumbs'],
    summons: [],
    barks: {
      select: ['Mayor Buga, at your service. Vote early, vote often!', 'Ah, a constituent! How can I help... myself?',
        'Lightly buttered and ready to lead.', 'The toast with the most, reporting for duty!', 'Who wants a photo with the Mayor?'],
      start: ['This dungeon is now under municipal jurisdiction!', 'Positions, everyone! I\'ll supervise.',
        'Remember, team: I take the credit, you take the hits.', 'Marwyn, you\'re up front. I\'ll be up back.',
        'I hereby declare this dungeon open... for business!', 'Roll for initiative? I\'d like a recount first.'],
      move: ['Pressing the flesh! Er, the crust.', 'A brisk constitutional!', 'Heading where the votes are.',
        'Mind the crumbs.', 'Walking. Strictly for the cameras.', 'Hjalmar, if you rigged this floor, I\'m suing.'],
      kill: ['Another problem solved by the Mayor\'s office!', 'Taxes: collected. Permanently.', 'Your vote has been counted. Against you.',
        'Put that in the newsletter!', 'And THAT is why I won by a landslide.'],
      hurt: ['Not the crust!', 'I\'ll have you know I\'m artisanal!', 'My approval rating!', 'Ow! I\'m suing the dungeon!',
        'Who\'s paying for this dent?', 'A cheap shot! I\'ll have you audited!'],
      lowhp: ['I\'m getting burnt out here!', 'Call my lawyer! And a medic! Lawyer first!', 'One more bite and I\'m crumbs!',
        'Josiah! I need a potion and a press release!', 'This is not a good look for re-election.',
        'Basanos, stop looking at me like I\'m breakfast!'],
      downed: ['Tell the voters... I loved them... mostly their gold...', 'Toast... is... toast...', 'I demand... a recount...',
        'Butter me... one last time...'],
      revive: ['The Mayor has been re-elected!', 'POP! Fresh out of the toaster!', 'Rumors of my staleness were exaggerated.',
        'I\'m back! Did anyone touch the treasury?'],
      ally_down: ['Tragic! I\'ll name a sewer after them.', 'Somebody get them up! They owe me taxes!', 'I declare a day of mourning! A half day.',
        'We lost a voter! Get them back on the rolls!', 'This is why I delegate. Wait...'],
      levelup: ['A promotion! I accept, on behalf of myself.', 'Mayor Buga: now with extra grain!', 'My approval rating just went up!',
        'Stronger, crustier and more corrupt than ever!', 'I\'d like to thank... me. Mostly me.',
        'Valdris, engrave this on my chain of office!'],
      victory: ['Another victory for the Mayor! You\'re all welcome.', 'The loot is now in municipal custody.',
        'A landslide! I will accept your applause now.', 'Ribbon-cutting in five minutes. Bring snacks.',
        'Syllamin, write me a victory song. Make me taller.', 'Kiri, is the ethereal plane taxable? Asking for me.'],
      idle: ['Betty, stop eating the ballots.', 'Is it just me, or is this dungeon under-taxed?', 'I could go for a little jam right now.',
        'Zarathor, is that bling municipal property?', 'Professor Marbles slept through my speech again.',
        'Pebbles, good boy! Now stop sniffing my crust.'],
      signature: ['People of the dungeon! I am the Toast of the Town!', 'Four more years! FOUR MORE YEARS!',
        'Let me be perfectly clear: I am magnificent. Sorry, Marwyn.', 'Ask not what your mayor can do for you!',
        'A toast! To my brave volunteers! Charge!'],
    },
  });
})();
