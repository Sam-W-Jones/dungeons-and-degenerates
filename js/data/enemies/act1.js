/* Dungeons and Degenerates — js/data/enemies/act1.js
 * ACT 1 regular enemies + encounters ("The Leaky Flagon's Basement": cellar, sewer and warren themes).
 * v2: every enemy decides and acts on its own initiative turn (move, then one skill, at once; no telegraphs).
 *   minion/normal: a1_rat (packs, Bleed) · a1_gob_grunt (2-tile spear, pokes objects) · a1_gob_kid (straight-line
 *     slingshot, taunts) · a1_kobold_rep (Strike Action: Inspired allies) · a1_slime (splits into two a1_slimelet
 *     unless cooked or dropped) · a1_spore_bro (walks up, explodes; pops into spores when killed) · a1_spider (web
 *     Root, bites webbed prey harder) · a1_critic (Bad Review: Weak)
 *   elites: a1_mimic (tongue pull, gold-swallowing CHOMP, and the act's one elite wind-up: the Lid Slam) · a1_bugbear
 *     (throws heroes into walls, friends and pits; bar stools) · a1_cube (immovable, Engulf, Jiggle Slam)
 *   extras: status a1_engulfed · object a1_strike_fund + its rule a1_hazard_pay · 11 encounters (8 normal, 3 elite;
 *     3 handcrafted layouts).
 * Each enemy's gimmick and how it picks its targets are stated as exact text in def.passive (the HUD inspect panel).
 * v2 targeting: brutes (melee / kamikaze) stick to the hero next to them, the kid and the critic keep their distance,
 * the Rep stays behind his friends, and the spider is the act's one diver ('skirmisher': the wounded, the squishy,
 * webbed prey). Elites use custom planners (aiStyle 'melee'): one move and one action per turn; their walks price the
 * attacks of opportunity they would provoke (api.aooCost) and never take a lethal one. Bosses: js/data/bosses/.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;
  const TAU = Math.PI * 2;

  // ---- shared helpers -------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return !!u && DD.Act.hasStatus(u, id); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function cheb(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
  function hasIntent(u, skillId) { return (u.intents || []).some(function (i) { return i.skillId === skillId; }); }
  function lunge(ctx, to) { const p = to || ctx.target; if (p && ctx.user) DD.FX.lunge(ctx.user, p); }
  /** Level-1 numbers of one of this file's skills (read lazily, e.g. by def.passive texts the HUD shows). */
  function lvl(skillId) { return DD.skillLevel(DD.getSkill(skillId), 1) || {}; }
  /** Attack bark (cosmetic, never during previews). */
  function say(ctx, chance) { if (ctx.isIntent) A().maybeBark(ctx.user, 'attack', chance === undefined ? 0.3 : chance); }
  /** Deal dmg to every standing unit of the list except the user; returns the units that were hit. */
  function strike(ctx, list, dmg, opts) {
    const out = [];
    (list || []).forEach(function (u) {
      if (!active(u) || u === ctx.user) return;
      A().damage(ctx.user, u, dmg, opts);
      out.push(u);
    });
    return out;
  }
  /** Damage destructible objects on the given tiles (crates, kegs, barrels — explosive ones explode). */
  function smashObjects(src, tiles, dmg) {
    (tiles || []).forEach(function (p) {
      const t = G().tile(p.x, p.y);
      if (t && t.obj && t.obj.maxHp > 0 && t.obj.hp > 0) A().damageObject(src, p.x, p.y, dmg);
    });
  }
  /** Idle-animation phase the sprite painter uses for this unit (overlays line up with the base). */
  function phaseOf(g) { return g.unit && g.unit.id !== undefined ? (U.hash(String(g.unit.id)) % 1000) / 1000 * TAU : 0; }

  function eskill(def) {
    def.owner = 'enemy';
    def.ap = 0;
    ['hpCost', 'cooldown', 'charges', 'hype'].forEach(function (k) { if (def[k] === undefined) def[k] = 0; });
    return DD.registerSkill(def);
  }

  // ---- planner helpers (custom AIs: they run on the unit's own turn and act at once) ------------------------
  /**
   * Where the unit could stand this turn: its tile first, then reachable tiles that are not hazards. Each spot carries
   * `aoo`: what the walk there costs in attacks of opportunity (api.aooCost; spots whose walk would drop it are left out).
   */
  function spotsOf(unit, api) {
    const out = [{ x: unit.x, y: unit.y, here: true, cost: 0, aoo: 0 }];
    api.reachable(unit).forEach(function (e) {
      if (G().hazardAt(e.x, e.y, unit) || e.hazard) return;
      if (DD.AI.pathRisk && DD.AI.pathRisk(unit, e).lethal) return;
      const aoo = api.aooCost(unit, e);
      if (aoo === Infinity) return;
      e.aoo = aoo;
      out.push(e);
    });
    return out;
  }
  /** Run fn with the unit virtually standing on p (always restored). */
  function at(unit, p, fn) {
    const ox = unit.x, oy = unit.y;
    unit.x = p.x; unit.y = p.y;
    try { return fn(); } finally { unit.x = ox; unit.y = oy; }
  }
  function stepTo(unit, api, p) {
    if (!p || (p.x === unit.x && p.y === unit.y)) return true;
    return api.moveTo(unit, p.x, p.y) && active(unit);
  }
  /** Spot with at least `min` foes all around it (diagonals too); prefers staying put. */
  function crowdSpot(unit, api, min, noMove) {
    const foes = api.foes(unit);
    let best = null, bestSc = -Infinity;
    (noMove ? [{ x: unit.x, y: unit.y, cost: 0 }] : spotsOf(unit, api)).forEach(function (p) {
      let n = 0, friends = 0;
      foes.forEach(function (f) { if (cheb(p, f) === 1) n++; });
      api.friends(unit).forEach(function (f) { if (cheb(p, f) === 1) friends++; });
      if (n < min) return;
      const sc = n * 10 - friends * 12 - (p.cost || 0) * 0.2 - (p.aoo || 0);
      if (sc > bestSc) { bestSc = sc; best = p; }
    });
    return best && bestSc > 0 ? best : null;
  }
  /** The unit standing on the chosen tile for unit-anchored skills (the tile otherwise). */
  function aimOf(skillId, p) {
    const def = DD.getSkill(skillId);
    if (def && def.anchor === 'unit') {
      const u = G().unitAt(p.x, p.y);
      return active(u) ? u : null;
    }
    return p;
  }
  /**
   * Use one skill now: walk to the best spot for it first (unless noMove), then act from there (v2: move first, then
   * act). A walk cut short (a web, a trap) aims again from where it ended. Returns true if the skill fired.
   */
  function actSkill(unit, api, skillId, noMove) {
    if (!api.canUse(unit, skillId)) return false;
    let b = api.bestAttack(unit, { skills: [skillId], noMove: !!noMove });
    if (!b) return false;
    if (!stepTo(unit, api, b.moveTo)) {
      if (!active(unit)) return false;
      b = api.bestAttack(unit, { skills: [skillId], noMove: true });
      if (!b) return false;
    }
    const aim = aimOf(skillId, b.target);
    return !!aim && api.act(unit, skillId, aim, {});
  }
  /** Steps a walker needs from each tile to reach a foe (BFS, units ignored), so nobody sulks behind a wall. */
  function walkField(unit, foes) {
    const g = S().grid, dist = new Array(g.w * g.h).fill(Infinity), q = [];
    foes.forEach(function (f) { const i = f.y * g.w + f.x; dist[i] = 0; q.push(i); });
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % g.w, y = (i / g.w) | 0;
      U.DIRS.forEach(function (d) {
        const nx = x + d.x, ny = y + d.y, j = ny * g.w + nx;
        if (!G().inBounds(nx, ny) || dist[j] <= dist[i] + 1 || !G().isWalkable(nx, ny, unit)) return;
        if (!G().canStep(unit, { x: nx, y: ny }, { x: x, y: y })) return;
        dist[j] = dist[i] + 1;
        q.push(j);
      });
    }
    return dist;
  }
  /**
   * Walk toward the nearest foe by walking distance (Manhattan if walls cut it off), never onto hazards; an attack of
   * opportunity on the way weighs like a detour of a quarter tile per point of its cost.
   */
  function approach(unit, api) {
    const foes = api.foes(unit);
    if (!foes.length) return false;
    const field = walkField(unit, foes), w = S().grid.w;
    const near = function (p) {
      const v = field[p.y * w + p.x];
      if (isFinite(v)) return v;
      let d = Infinity;
      foes.forEach(function (f) { d = Math.min(d, G().dist(p, f)); });
      return 100 + d;
    };
    let best = null, bestD = near(unit);
    spotsOf(unit, api).forEach(function (p) {
      if (p.here) return;
      const d = near(p) + (p.cost || 0) * 0.01 + (p.aoo || 0) * 0.25;
      if (d < bestD) { bestD = d; best = p; }
    });
    return best ? stepTo(unit, api, best) : false;
  }

  // =====================================================================================================
  // Statuses & objects
  // =====================================================================================================

  function cubeOf(st) { return st && st.source ? DD.Combat.byId(st.source) : null; }
  /** Units currently held by this cube. */
  function heldBy(cube) {
    const s = S();
    if (!s || !cube) return [];
    return s.units.filter(function (u) {
      if (!active(u)) return false;
      const st = A().getStatus(u, 'a1_engulfed');
      return !!st && st.source === cube.id;
    });
  }
  /** Spit a held unit out. */
  function release(unit, text) {
    if (!unit) return false;
    const had = A().removeStatus(unit, 'a1_engulfed', { text: text || 'Spat out!' });
    if (had) A().log(unit.name + ' squelches free of the Gelatinous Cube.', 'status');
    return had;
  }

  // v2: one status does it all (noMove = can't take move actions, like Root; pushes still work); durations count the
  // victim's own turns, so Engulf's 2 turns are the victim's next two turns
  DD.registerStatus({
    id: 'a1_engulfed', name: 'Engulfed', icon: '🫧', color: '#8be36a', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2, noMove: true,
    desc: function (st) {
      const acid = st && st.data && st.data.acid ? st.data.acid : 3;
      const left = st && st.turns > 0 ? ' (' + plural(st.turns, 'turn') + ' left)' : '';
      return 'Stuck inside a Gelatinous Cube: can\'t move and takes ' + acid + ' acid damage at the start of each of its turns. ' +
        'Dealing 10 damage to the Cube frees everyone inside.' + left;
    },
    hooks: {
      onTurnStart: function (unit, st) {
        const cube = cubeOf(st);
        if (!active(cube) || G().dist(cube, unit) > 1) { release(unit, 'Slips free!'); return; }
        DD.FX.particles(unit, { kind: 'bubbles', count: 8, color: '#8be36a' });
        A().damage(cube, unit, (st.data && st.data.acid) || 3, { cause: 'status', tags: ['acid'] });
      },
      onEnterTile: function (unit, tile, cause, st) {
        const cube = cubeOf(st);
        if (!active(cube) || G().dist(cube, unit) > 1) release(unit, 'Squelch!');
      },
    },
  });

  /** World painter: a pink piggy bank with a coin hovering over the slot and a little price tag. */
  function drawStrikeFund(g, obj, t) {
    const pink = '#f49ac1', dark = '#c45f8e', ink = '#5a1f38', bob = Math.sin(t * 2.4) * 0.8;
    g.ellipse(0, 1, 13, 5, 'rgba(0,0,0,0.28)');
    [[-8, 0], [-3.5, 1.5], [3.5, 1.5], [8, 0]].forEach(function (p) { g.rect(p[0] - 1.8, -5 + p[1] * 0.4, 3.6, 5.2, dark, true, 1); });
    g.ellipse(0, -10, 12.5, 8.5, pink, true);
    g.ellipse(-2.5, -6.5, 7, 3.6, 'rgba(255,255,255,0.22)');
    g.poly([[2.5, -16.5], [5.5, -21.5], [8, -15.5]], dark, true);
    g.poly([[-2, -17.5], [0.5, -22], [3, -17]], dark, true);
    g.ellipse(12, -10, 3.6, 3.3, dark, true);
    g.circle(11.1, -10.2, 0.8, ink); g.circle(12.9, -10.2, 0.8, ink);
    g.circle(7, -13, 1.3, '#1a1014');
    g.arc(-12.8, -11.5, 2.2, 0.2, Math.PI * 1.6, dark, 1.3);
    g.line(-4, -18.3, 1.5, -18.6, ink, 1.8);
    g.ellipse(-1.2, -22.5 + bob, 2.8, 2.8, '#f4c430', true);
    g.text('$', -1.2, -22.4 + bob, 4, '#8a5a00');
    g.rect(-15, -12.5, 9, 6.5, '#f3e6c4', true, 1);
    g.text('UNION', -10.5, -9.3, 2.6, '#2e7d32');
  }

  // Hazard pay (v2): Block from the start of an enemy's own turn lasts until its next turn start, i.e. through every
  // hero turn in between (Block handed out at round end would vanish at each enemy's next turn start). Objects have no
  // unit hooks, so the pay is a fight rule: the union hall declares it, and a fund placed with DD.Act.placeObject adds it.
  const HAZARD = { id: 'a1_hazard_pay', range: 2, block: 2 };
  function nearFund(u, range) {
    const g = S() && S().grid;
    if (!g) return false;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range + Math.abs(dy); dx <= range - Math.abs(dy); dx++) {
        const t = G().tile(u.x + dx, u.y + dy);
        if (t && t.obj && t.obj.id === 'a1_strike_fund' && t.obj.hp > 0) return true;
      }
    }
    return false;
  }
  function hazardRule() {
    return { id: HAZARD.id, name: 'Hazard Pay', icon: '🐷', turns: -1,
      desc: 'An enemy that starts its turn within ' + HAZARD.range + ' tiles of a Strike Fund gains ' + HAZARD.block + ' Block.',
      hooks: {
        onTurnStart: function (unit) {
          const s = S();
          if (!s || !active(unit) || unit.side !== 'enemy' || !nearFund(unit, HAZARD.range)) return;
          if (unit.data.a1HazardTurn === s.turn) return;   // one pay per turn, even if the rule got declared twice
          unit.data.a1HazardTurn = s.turn;
          A().addBlock(unit, HAZARD.block);
        },
      } };
  }

  DD.registerObject({
    id: 'a1_strike_fund', name: 'Strike Fund', blocksMove: true, blocksLos: false, hp: 8, height: 0.75, color: '#f49ac1',
    smashable: true,
    desc: 'Destructible (8 HP); adjacent heroes can Smash it. The union\'s piggy bank. Hazard pay: an enemy that starts ' +
      'its turn within 2 tiles of a Strike Fund gains 2 Block. Breaking it spills 3 gold.',
    init: function () {
      const s = S();
      if (s && s.rules && !s.rules.some(function (r) { return r && r.id === HAZARD.id; })) A().addRule(hazardRule());
    },
    onDestroyed: function (obj, tile) {
      DD.FX.particles(tile, { kind: 'coins', count: 14 });
      A().gainGold(3);
      A().log('The Strike Fund shatters. 3 gold rolls out, along with the union\'s dignity.', 'system');
    },
    draw: drawStrikeFund,
  });

  // =====================================================================================================
  // Dire-ish Rat — minion, packs, Bleed
  // =====================================================================================================

  /** Pack Tactics: other rats on the biter's side standing next to the victim, capped at L.pack. */
  function packBonus(src, victim) {
    if (!src || !victim) return 0;
    let n = 0;
    S().units.forEach(function (u) {
      if (u !== src && u !== victim && active(u) && u.defId === 'a1_rat' && G().dist(u, victim) === 1 && !G().hostile(src, u)) n++;
    });
    return Math.min(DD.skillLevel(DD.getSkill('a1_rat_nibble'), 1).pack, n);
  }
  /** The unit an intent of `unit` would land on right now (pure; for wind-up numbers). */
  function intentVictim(unit, intent) {
    const p = DD.AI.intentTarget(unit, intent);
    const v = p ? G().unitAt(p.x, p.y) : null;
    return active(v) && G().hostile(unit, v) ? v : null;
  }

  eskill({ id: 'a1_rat_nibble', name: 'Ankle Nibble', icon: '🐀', kind: 'attack', tags: ['melee', 'bleed'], anchor: 'self',
    levels: [{ dmg: 2, bleed: 1, pack: 2 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage and Bleed ' + L.bleed + '. Pack Tactics: +1 damage for each other rat next to the target (max +' + L.pack + ').';
    },
    flavor: 'Not fully dire. Dire-adjacent. Dire-curious.',
    // a wind-up of this bite (none in act 1; content that puppets rats) shows the pack bonus too (DD.AI.intentDmg)
    telegraphFlat: function (unit, intent) { return packBonus(unit, intentVictim(unit, intent)); },
    // the estimate only sees 2 damage: rats value a bite like their pack does (and brave a puddle for it)
    aiScore: function (ctx) {
      const v = ctx.targetUnit;
      return v ? 3 + packBonus(ctx.user, v) : 0;
    },
    execute: function (ctx) {
      lunge(ctx);
      say(ctx, 0.2);
      strike(ctx, ctx.foes, ctx.L.dmg).forEach(function (u) { if (active(u)) A().addStatus(u, 'bleed', { stacks: ctx.L.bleed }, ctx.user); });
    } });

  DD.registerEnemy({ id: 'a1_rat', name: 'Dire-ish Rat', act: 1, tier: 'minion', hp: 9, mov: 5, armor: 0, init: 3,
    tags: ['beast', 'rat'], flags: {}, resist: {},
    // def.passive: the gimmick as the HUD inspect panel shows it (desc may be a function; enemy hooks live in def.hooks)
    passive: { name: 'Pack Tactics', icon: '🐀', desc: function () {
      return 'On its turn it runs up and bites a hero it can reach (whoever it can hurt most), and keeps biting the one it is next to. Each other rat next to the victim adds +1 damage (max +' + lvl('a1_rat_nibble').pack + ').';
    } },
    sprite: { base: 'quadruped', scale: 0.72,
      palette: { skin: '#7d6b5d', cloth2: '#b9a796', belly: '#b9a796', hair: '#5e4f44', eye: '#ff4433', accent: '#e85d75', outline: '#1a1014' },
      shape: { legs: 'short', body: 'long', snout: 'long', fluff: true },
      head: { ears: 'rat', eyes: 'angry', mouth: 'fangs', face: 'eyepatch', size: 0.95 }, tail: 'rat' },
    skills: ['a1_rat_nibble'], ai: { style: 'melee' }, xp: 2, gold: [0, 2],
    hooks: {
      // Pack Tactics: +1 skill damage per other (friendly) rat next to the victim, max +2 (attacks of opportunity: below)
      modifyOutgoingDamage: function (d) {
        if (d.cause !== 'skill' || !d.source || !d.target || d.opportunity) return;
        d.flat += packBonus(d.source, d.target);
      },
      // ... on an attack of opportunity the pack bonus rides on o.flat, so the move preview ("provokes"), path choice and
      // the AI's price of a walk show the real bite (pure; once per o: a rat mover's own hooks see the same o)
      modifyOpportunity: function (o) {
        if (!o.attacker || o.attacker.defId !== 'a1_rat' || o.a1Pack !== undefined) return;
        o.a1Pack = packBonus(o.attacker, o.mover);
        o.flat += o.a1Pack;
      },
    },
    barks: {
      spawn: ['*squeak of intent*', 'SQUEAK. (That means "ankles".)', 'The cheese was a lie. Your ankles are not.'],
      attack: ['Nibble nibble.', 'ANKLES!', '*aggressive chittering*'],
      hurt: ['SQUEEE!', 'Rude!', 'Not the whiskers!'],
      death: ['*dramatic final squeak*', 'Tell the cheese... I loved it...', 'Avenge me, brothers! Or don\'t.'],
    },
    desc: 'A rat that skipped leg day, arm day and bath day. Quick off the mark (initiative +3) and never alone: every other rat next to its target makes the bite worse. Bites cause Bleeding.' });

  // =====================================================================================================
  // Goblin Grunt — 2-tile spear (also pokes objects)
  // =====================================================================================================

  eskill({ id: 'a1_gob_poke', name: 'Pointy Stick', icon: '🔱', kind: 'attack', tags: ['melee', 'line', 'objects'], anchor: 'self',
    levels: [{ dmg: 6 }], target: { type: 'dir' }, area: { shape: 'line', size: 2 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to everything on the 2 tiles in front (friend, foe or object).'; },
    flavor: 'Reach weapon. The goblin read about reach weapons once.',
    execute: function (ctx) {
      lunge(ctx, ctx.tiles[0]);
      say(ctx, 0.25);
      strike(ctx, ctx.units, ctx.L.dmg);
      smashObjects(ctx.user, ctx.tiles, ctx.L.dmg);
    } });
  eskill({ id: 'a1_gob_rock', name: 'Rock Toss', icon: '🪨', kind: 'attack', tags: ['ranged'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 4 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: false },
    desc: function (L) { return 'Lob a rock over anything in the way: deal ' + L.dmg + ' damage to a target up to 5 tiles away.'; },
    flavor: 'Goblin artillery: a rock, thrown, with feeling.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.projectile(ctx.user, ctx.target, { kind: 'rock', arc: true, color: '#8c8478' });
      strike(ctx, ctx.foes, ctx.L.dmg);
    } });

  DD.registerEnemy({ id: 'a1_gob_grunt', name: 'Goblin Grunt', act: 1, tier: 'normal', hp: 18, mov: 4, armor: 1, init: 2,
    tags: ['goblin'], flags: {}, resist: {},
    passive: { name: 'Long Spear', icon: '🔱', desc: 'On his turn he walks up and spears both tiles in front of him, hitting friend, foe or object (he goes for protected kegs), and keeps at the hero he is next to; with nobody in reach he lobs a rock instead.' },
    sprite: { base: 'humanoid', scale: 0.9, build: 'slim', outfit: 'rags',
      palette: { skin: '#6fa04a', cloth: '#7a5a3a', cloth2: '#4e3a26', hair: '#2a2a1a', metal: '#8d9096', eye: '#ffde59', accent: '#c0392b',
        shield: '#a0a3a8', wood: '#7b5530', outline: '#1a1014' },
      head: { ears: 'goblin', hat: 'helmet', eyes: 'angry', mouth: 'grin' },
      mainhand: 'spear', offhand: 'shield', extras: ['belt'] },
    skills: ['a1_gob_poke', 'a1_gob_rock'], ai: { style: 'melee' }, xp: 4, gold: [2, 4],
    barks: {
      spawn: ['Shiny adventurers! Dibs on the boots!', 'Me and my stick. Best friends.', 'Boss said stab. We stab.'],
      attack: ['STAB! Stab again!', 'Pointy end goes in you!', 'Hold still, I\'m reaching!'],
      hurt: ['Ow! My one good ear!', 'Not fair, you have levels!', 'Goblin down! Wait, no. Still up.'],
      death: ['Tell boss... it was pointy...', 'Worth it. Probably.', 'I regret nothing! Except this.'],
    },
    desc: 'Minimum-wage goblin with a pot on his head and a stick with a point. Goblins are quick (initiative +2). The spear hits both tiles in front of him, including whatever (or whoever) is standing there, kegs included.' });

  // =====================================================================================================
  // Goblin Slingshot Kid — straight-line shot that stops at the first unit, taunts
  // =====================================================================================================

  // pierce: false — the line (its area, what the HUD and the AI see) ends at the first unit or object in the way
  eskill({ id: 'a1_kid_sling', name: 'Slingshot', icon: '🎯', kind: 'attack', tags: ['ranged', 'line'], anchor: 'self',
    levels: [{ dmg: 5, len: 6 }], target: { type: 'dir' }, area: { shape: 'line', size: function (L) { return L.len; }, pierce: false },
    desc: function (L) { return 'Fire a pebble down a straight line of ' + L.len + ' tiles: deal ' + L.dmg + ' damage to the first unit it hits, friend or foe (walls and obstacles stop it).'; },
    flavor: 'Aim is a skill. The kid has confidence instead.',
    execute: function (ctx) {
      const end = ctx.tiles[ctx.tiles.length - 1];
      if (end) DD.FX.projectile(ctx.user, end, { kind: 'rock', arc: false, size: 0.6, color: '#c9c2b3' });
      say(ctx, 0.25);
      const first = ctx.units.filter(function (u) { return u !== ctx.user; })[0];
      if (first) strike(ctx, [first], ctx.L.dmg);
    } });
  eskill({ id: 'a1_kid_nyah', name: 'Nyah Nyah!', icon: '😝', kind: 'utility', tags: ['ranged', 'debuff', 'taunt'], anchor: 'unit', cooldown: 3,
    levels: [{ turns: 1 }], target: { type: 'unit', range: [1, 4], filter: 'enemy', los: true },
    desc: function (L) { return 'Taunt the target for its next ' + (L.turns === 1 ? 'turn' : L.turns + ' turns') + ': it deals 50% less damage to anyone but the Slingshot Kid.'; },
    flavor: 'Thumbs in ears, tongue out, fingers wiggling. Devastating.',
    aiScore: function (ctx) { const t = ctx.targetUnit; return !t || has(t, 'taunt') ? -10 : 2; },
    execute: function (ctx) {
      const t = ctx.targetUnit;
      if (!active(t) || !G().hostile(ctx.user, t)) return;
      DD.FX.text(ctx.user, 'NYAH NYAH!', { color: '#ffb0d0', size: 15 });
      A().addStatus(t, 'taunt', { turns: ctx.L.turns }, ctx.user);
    } });

  /** Propeller beanie + slingshot (the base humanoid has no slingshot prop). */
  function kidOverlay(g, t) {
    const ph = phaseOf(g), br = Math.sin(t * 2.2 + ph);
    const hx = g.pose === 'attack' ? 1.2 : g.pose === 'hurt' ? -0.8 : 0;
    const hy = -20 + br * 0.45;
    g.path(function (c) { c.arc(hx, hy - 3.5, 8.6, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); }, '#3f8cff');
    g.path(function (c) { c.arc(hx, hy - 3.5, 8.6, Math.PI * 1.36, Math.PI * 1.64); c.lineTo(hx, hy - 3.5); c.closePath(); }, '#ffd23f', null);
    g.rect(hx - 9, hy - 4.4, 18, 2, '#e23b3b', undefined, 0.8);
    g.line(hx, hy - 12, hx, hy - 15.5, '#3a2a1a', 1.2);
    const spin = Math.cos(t * 14) * 6.5;
    g.ellipse(hx, hy - 16, Math.abs(spin) + 0.8, 1.3, spin > 0 ? '#e23b3b' : '#ffd23f');
    g.circle(hx, hy - 16, 1, '#3a2a1a', null);
    // slingshot in the front hand
    const sx = 7.5, sy = -7 + br * 0.3;
    g.line(sx, sy + 3, sx, sy - 2, '#7b5530', 1.6);
    g.line(sx, sy - 2, sx - 2.4, sy - 6, '#7b5530', 1.5);
    g.line(sx, sy - 2, sx + 2.4, sy - 6, '#7b5530', 1.5);
    const pull = g.pose === 'attack' ? 2.5 : 0.6;
    g.path(function (c) { c.moveTo(sx - 2.4, sy - 6); c.quadraticCurveTo(sx - pull * 1.6, sy - 3 + pull, sx + 2.4, sy - 6); }, null, '#ff6fb5', 0.9);
  }

  DD.registerEnemy({ id: 'a1_gob_kid', name: 'Goblin Slingshot Kid', act: 1, tier: 'normal', hp: 14, mov: 4, armor: 0, init: 3,
    tags: ['goblin'], flags: {}, resist: {},
    passive: { name: 'Line of Fire', icon: '🎯', desc: 'On his turn he keeps his distance and shoots straight down a row or column: the pebble hits the first unit in the way, friend or foe, so stand behind something. Or he taunts a hero. Pin him with a melee hero: stepping away provokes an attack of opportunity.' },
    sprite: { base: 'humanoid', scale: 0.8, build: 'tiny', outfit: 'tunic',
      palette: { skin: '#86c25e', cloth: '#d9483b', cloth2: '#f2d24b', hair: '#3a2a1a', eye: '#2b2233', accent: '#4fb3ff', outline: '#1a1014' },
      head: { ears: 'goblin', eyes: 'big', mouth: 'grin', hair: 'none' }, extras: ['pouches'], overlay: kidOverlay },
    skills: ['a1_kid_sling', 'a1_kid_nyah'], ai: { style: 'ranged', keepDistance: 3 }, xp: 4, gold: [1, 4],
    barks: {
      spawn: ['Mom said I could fight adventurers!', 'I got a slingshot AND a dream!', 'Bet you can\'t catch me!'],
      attack: ['Bullseye! Probably!', 'PEW!', 'Eat pebble!'],
      hurt: ['I\'m telling!', 'Ow ow OW!', 'That\'s not fair, I\'m little!'],
      death: ['I\'m grounded forever...', 'Worth... it...', 'Tell Mom I was brave.'],
    },
    desc: 'Nine years old, propeller beanie, zero fear, and always first in line (initiative +3). His pebble flies in a straight line and smacks the first thing it meets, so stand behind your friends (or his). He also taunts.' });

  // =====================================================================================================
  // Kobold Union Rep — support, Strike Action
  // =====================================================================================================

  // v2: one verb. (The Block it used to hand out vanished at each ally's own turn start; the union's Block now comes
  // from the Strike Funds' hazard pay.) turns: 2 = each ally's next two turns, his own next two as well.
  eskill({ id: 'a1_rep_strike', name: 'Strike Action!', icon: '📢', kind: 'buff', tags: ['buff', 'aoe'], anchor: 'self', cooldown: 2,
    levels: [{ turns: 2 }], target: { type: 'self' }, area: { shape: 'circle', size: 2 },
    desc: function (L) {
      return 'The Rep and every ally within 2 tiles are Inspired (+25% damage) for their next ' + plural(L.turns, 'turn') + '.';
    },
    flavor: 'Solidarity forever. Also stabbing.',
    aiScore: function (ctx) {
      const allies = ctx.friends.filter(function (u) { return u !== ctx.user && active(u); });
      if (!allies.length) return -8;
      return allies.reduce(function (s, u) { return s + (has(u, 'inspired') ? -3 : 2); }, 0);
    },
    execute: function (ctx) {
      DD.FX.text(ctx.user, 'STRIKE ACTION!', { color: '#ffd23f', size: 17 });
      DD.FX.particles(ctx.user, { kind: 'notes', count: 10, color: '#ffd23f' });
      say(ctx, 0.6);
      ctx.friends.forEach(function (u) { if (active(u)) A().addStatus(u, 'inspired', { turns: ctx.L.turns }, ctx.user); });
    } });
  eskill({ id: 'a1_rep_memo', name: 'Strongly Worded Memo', icon: '📝', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 5 }], target: { type: 'unit', range: [1, 6], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a target up to 6 tiles away in line of sight.'; },
    flavor: 'Per my last memo. Paper cuts are a workplace hazard.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.projectile(ctx.user, ctx.target, { kind: 'bolt', color: '#f3ecd0', size: 0.8 });
      strike(ctx, ctx.foes, ctx.L.dmg);
    } });

  /** Picket sign on a pole. */
  function picketSign(g, t) {
    const ph = phaseOf(g), sway = Math.sin(t * 1.6 + ph) * 0.06 + (g.pose === 'cast' || g.pose === 'attack' ? Math.sin(t * 14) * 0.08 : 0);
    const c = g.ctx;
    c.save();
    c.translate(8, -4);
    c.rotate(sway);
    g.rect(-0.9, -38, 1.8, 40, '#8a5a2b', undefined, 0.6);
    g.rect(-9, -47, 18, 11, '#f6f1e3', undefined, 1);
    g.rect(-9, -47, 18, 2.4, '#e23b3b', null, 0.5);
    g.text('STRIKE', 0, -40.6, 4.6, '#c0392b');
    c.restore();
  }

  DD.registerEnemy({ id: 'a1_kobold_rep', name: 'Kobold Union Rep', act: 1, tier: 'normal', hp: 16, mov: 3, armor: 1, init: -2,
    tags: ['kobold'], flags: {}, resist: {},
    passive: { name: 'Shop Steward', icon: '📢', desc: 'On his turn he stays behind his friends and calls Strike Action (allies within 2 tiles hit 25% harder) whenever one is near enough to hear it; otherwise he throws a memo at whoever he can see.' },
    sprite: { base: 'humanoid', scale: 0.84, build: 'tiny', outfit: 'tunic',
      palette: { skin: '#c86a2c', cloth: '#3f6fb5', cloth2: '#2a4a80', metal: '#f1c40f', hat: '#f1c40f', eye: '#2b2233', accent: '#e23b3b', sash: '#e23b3b', outline: '#1a1014' },
      head: { ears: 'pointy', hat: 'helmet', eyes: 'normal', mouth: 'open' }, tail: 'lizard', extras: ['sash'], overlay: picketSign },
    skills: ['a1_rep_strike', 'a1_rep_memo'], ai: { style: 'support' }, xp: 5, gold: [3, 6],
    barks: {
      spawn: ['This dungeon is now a union shop!', 'Mandatory meeting! Attendance is stabbing!', 'Who authorized these adventurers?'],
      attack: ['Per my last memo!', 'This is a formal grievance!', 'Solidarity, brothers! STAB!'],
      hurt: ['Workplace injury! I want a form!', 'That\'s a safety violation!', 'Ow! Hazard pay!'],
      death: ['The union... will remember...', 'I demand... a dental plan...', 'Tell them... I died on the clock.'],
    },
    desc: 'Represents the dungeon\'s goblins in all labor disputes, mostly the ones about stabbing you. Slow off the mark (initiative −2): he reads the minutes first. Stays behind the picket line and calls Strike Action: everyone near him hits harder. Kill him first and the strike collapses.' });

  // =====================================================================================================
  // Sewer Slime — splits into two Slimelets (unless cooked or dropped into a pit)
  // =====================================================================================================

  eskill({ id: 'a1_slime_splorch', name: 'Splorch', icon: '🟢', kind: 'attack', tags: ['melee', 'aoe'], anchor: 'self',
    levels: [{ dmg: 5 }], target: { type: 'self' }, area: { shape: 'adjacent' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every foe next to the slime.'; },
    flavor: 'The sound it makes is "splorch". The smell is worse.',
    execute: function (ctx) {
      DD.FX.particles(ctx.user, { kind: 'bubbles', count: 10, color: '#9ccf3c' });
      say(ctx, 0.2);
      strike(ctx, ctx.foes, ctx.L.dmg);
    } });
  eskill({ id: 'a1_slimelet_glorp', name: 'Glorp', icon: '💧', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 3 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; },
    flavor: 'A tiny, sincere glorp.',
    execute: function (ctx) { lunge(ctx); strike(ctx, ctx.foes, ctx.L.dmg); } });

  /** A rubber duck riding on top of the slime (follows the blob's wobble). */
  function duckOverlay(g, t) {
    const ph = phaseOf(g), wob = 1.6;
    const k = Math.sin(t * 3.2 + ph) * 0.07 * wob;
    const hgt = 18 * (1 - k), top = Math.sin(t * 4.1 + ph) * 1.4 * wob;
    const x = top * 0.8 - 2.5, y = -hgt + 0.8;
    g.ellipse(x, y - 2.4, 4.8, 3, '#ffd23f');
    g.circle(x + 3.4, y - 6, 2.7, '#ffd23f');
    g.poly([[x + 5.6, y - 6.4], [x + 8.2, y - 5.6], [x + 5.6, y - 4.8]], '#ff8a1a');
    g.circle(x + 3.9, y - 6.8, 0.6, '#1a1014', null);
    g.ellipse(x - 1.4, y - 3.4, 2.2, 1.2, '#f2b81e', null);
  }

  /** Free safe tiles for split / spawned units: the tile itself (if free) then its neighbours, shuffled. */
  function spotsAround(x, y, n, rng) {
    const out = [];
    const ok = function (p) { return G().isFree(p.x, p.y) && !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y, null); };
    if (ok({ x: x, y: y })) out.push({ x: x, y: y });
    const ring = U.DIRS.map(function (d) { return { x: x + d.x, y: y + d.y }; }).filter(ok);
    const order = rng ? rng.shuffle(ring.slice()) : ring;
    for (let i = 0; i < order.length && out.length < n; i++) out.push(order[i]);
    if (out.length < n) G().emptyTilesNear(x, y, 2).forEach(function (p) {
      if (out.length < n && ok(p) && !out.some(function (q) { return q.x === p.x && q.y === p.y; })) out.push(p);
    });
    return out.slice(0, n);
  }

  DD.registerEnemy({ id: 'a1_slime', name: 'Sewer Slime', act: 1, tier: 'normal', hp: 20, mov: 3, armor: 0, init: -1,
    tags: ['ooze', 'slime'], flags: {}, resist: { poison: 0, fire: 1.5 },
    passive: { name: 'Mitosis', icon: '🟢', desc: 'On its turn it oozes up to a hero it can reach and splorches everyone next to it, sticking to the one it is next to. Too gooey to swing at anyone walking away (no attacks of opportunity). Killed, it splits into two Slimelets unless the killing blow is fire or it falls into a pit.' },
    sprite: { base: 'blob', scale: 1.02, palette: { skin: '#86ad35', eye: '#1a1014', accent: '#f4d03f', outline: '#1a1014' },
      shape: { wobble: 1.6 }, head: { eyes: 'big', mouth: 'open' }, overlay: duckOverlay },
    skills: ['a1_slime_splorch'], ai: { style: 'melee' }, xp: 4, gold: [1, 3],
    hooks: {
      // splits into two Slimelets, unless the killing blow was fire (cooked) or it fell into a pit / deep water
      onDeath: function (unit, d) {
        if (!d || d.cause === 'fall' || d.element === 'fire') { A().log('The Sewer Slime is ' + (d && d.element === 'fire' ? 'cooked through. No splitting.' : 'gone for good.'), 'system'); return; }
        const s = S();
        const spots = spotsAround(unit.x, unit.y, 2, s.rng);
        let n = 0;
        spots.forEach(function (p) { if (A().spawn('a1_slimelet', p.x, p.y, { silent: true })) n++; });
        if (n) {
          DD.FX.particles(unit, { kind: 'bubbles', count: 16, color: '#9ccf3c' });
          A().log('The Sewer Slime splits into ' + plural(n, 'Slimelet') + '!', 'enemy');
        }
      },
    },
    barks: {
      spawn: ['Blorp.', 'BLORP!', '*gurgles hospitably*'],
      attack: ['Splorch!', 'Hug time!', '*wet noises*'],
      hurt: ['Blorp?!', 'Now there could be two of me.', '*offended jiggle*'],
      death: ['Blorp... blorp...', 'We are legion. Well, two.', '*splits with enthusiasm*'],
    },
    desc: 'Sewer runoff that achieved sentience and immediately regretted it. Slow to get going (initiative −1). Immune to poison, weak to fire. Splits into two Slimelets when killed, unless the killing blow is fire (cooked) or it falls into a pit. The duck is load-bearing.' });

  DD.registerEnemy({ id: 'a1_slimelet', name: 'Slimelet', act: 1, tier: 'minion', hp: 7, mov: 3, armor: 0, init: 1,
    tags: ['ooze', 'slime'], flags: {}, resist: { poison: 0, fire: 1.5 },
    passive: { name: 'Half a Slime', icon: '💧', desc: 'On its turn it hops up and glorps the hero next to it. It does not split again.' },
    sprite: { base: 'blob', scale: 0.7, palette: { skin: '#a5c94a', eye: '#1a1014', outline: '#1a1014' }, shape: { wobble: 2.2 },
      head: { eyes: 'big', mouth: 'smile' } },
    skills: ['a1_slimelet_glorp'], ai: { style: 'melee' }, xp: 1, gold: [0, 1],
    barks: {
      spawn: ['blorp!', 'Am baby.', '*tiny gurgle*'],
      attack: ['glorp!', 'Nom.', 'Hug!'],
      hurt: ['blorp :(', 'Mommy!', 'Eep!'],
      death: ['*tiny pop*', 'bye bye...', 'blrp.'],
    },
    desc: 'Half a Sewer Slime, twice as enthusiastic (initiative +1). Does not split again; it has used up its one trick.' });

  // =====================================================================================================
  // Spore Bro — kamikaze: walks up and explodes into poison; pops into spores if killed
  // =====================================================================================================

  /** The pop: poison spores settle on the floor around him (a Poison Puddle; v2 flyers float over it, like any floor). */
  function sporeCloud(x, y, src) { A().splash(x, y, 1, 'poison', 2, src || null); }

  /** Spotted toadstool cap over the head (stocky humanoid head geometry), drawn as an overlay. */
  function sporeCap(g, t, user) {
    const ph = phaseOf(g), br = user && user.still ? 0 : Math.sin(t * 2.2 + ph);
    const r = 10, x = g.pose === 'attack' ? 1.2 : g.pose === 'hurt' ? -0.8 : 0, y = -17 + br * 0.3 - r * 0.8 + br * 0.15;
    const cap = g.pal.hat || '#d1402c', wob = Math.sin(t * 2) * r * 0.03;
    g.shaded(function (c) {
      c.moveTo(x - r * 1.55, y - r * 0.32);
      c.bezierCurveTo(x - r * 1.5, y - r * 1.85 + wob, x + r * 1.5, y - r * 1.85 - wob, x + r * 1.55, y - r * 0.32);
      c.quadraticCurveTo(x, y - r * 0.05, x - r * 1.55, y - r * 0.32);
      c.closePath();
    }, cap, { dx: r * 0.12, dy: -r * 0.12, hl: [x + r * 0.35, y - r * 1.25, r * 0.4, r * 0.16, -0.3] });
    [[-0.8, -0.85, 0.22], [0.05, -1.25, 0.26], [0.85, -0.8, 0.2], [-0.3, -0.6, 0.15], [0.5, -0.45, 0.13]].forEach(function (s) {
      g.ellipse(x + s[0] * r, y + s[1] * r, s[2] * r, s[2] * r * 0.8, '#fbf6ee', null);
    });
  }

  // v2: one verb (the explosion used to leave a spore cloud too; now only a Spore Bro killed by somebody else pops)
  eskill({ id: 'a1_spore_boom', name: 'Sporesplosion', icon: '🍄', kind: 'attack', tags: ['aoe', 'poison'], anchor: 'self',
    levels: [{ dmg: 6 }], target: { type: 'self' }, area: { shape: 'circle', size: 1 },
    desc: function (L) {
      return 'Explode: deal ' + L.dmg + ' poison damage to every adjacent unit (friend or foe). The Spore Bro dies.';
    },
    flavor: 'Bro, hold my spores.',
    execute: function (ctx) {
      const u = ctx.user;
      u.data.exploded = true;
      DD.FX.explosion(u, { radius: 1, color: '#9be564' });
      DD.FX.shake(5, 250);
      A().bark(u, 'attack');
      strike(ctx, ctx.units, ctx.L.dmg, { element: 'poison' });
      if (!u.dead) A().kill(u, null, { cause: 'other', text: 'POP!', force: true });
    } });

  DD.registerEnemy({ id: 'a1_spore_bro', name: 'Spore Bro', act: 1, tier: 'normal', hp: 15, mov: 4, armor: 0, init: -1,
    tags: ['fungus', 'plant'], flags: {}, resist: { poison: 0 },
    passive: { name: 'Bro Hug', icon: '🍄', desc: 'On his turn he walks up to the biggest bunch of heroes he can reach and explodes, hitting everyone next to him (he dies doing it). Killed by anything else, he pops and his spores settle on the floor around him (a poison puddle, radius 1: Poison 2 to anyone standing in it; flyers float over it).' },
    sprite: { base: 'humanoid', scale: 0.92, build: 'stocky', outfit: 'tunic',
      palette: { skin: '#efe2c8', cloth: '#3fd18a', cloth2: '#1f8a55', hat: '#d1402c', metal: '#ffd34d', eye: '#2b2233', accent: '#b8f070', outline: '#1a1014' },
      head: { hat: 'none', hair: 'none', face: 'sunglasses', mouth: 'grin' }, bling: ['chain'],
      aura: { kind: 'bubbles', color: '#b8f070' }, overlay: sporeCap },
    skills: ['a1_spore_boom'], ai: { style: 'kamikaze' }, xp: 3, gold: [1, 3],
    hooks: {
      // killed by anything but its own explosion: it pops and its spores carpet the floor (a poison puddle)
      onDeath: function (unit, d) {
        if (unit.data.exploded || (d && d.cause === 'fall')) return;
        DD.FX.particles(unit, { kind: 'poison', count: 14 });
        sporeCloud(unit.x, unit.y, null);
        A().log('The Spore Bro pops. His spores carpet the floor around him. Watch your step (flyers: carry on).', 'enemy');
      },
    },
    barks: {
      spawn: ['Sup, bro. Hug?', 'Spores out, bros!', 'Bro. BRO. Come here.'],
      attack: ['BRO HUG!', 'This one\'s for the colony!', 'YOLO! Literally!'],
      hurt: ['Bro, not cool.', 'You\'re harshing my spores.', 'Chill, bro!'],
      death: ['Spores... everywhere... bro...', 'Tell my mycelium I love them.', 'Pfffft.'],
    },
    desc: 'A mushroom who lifts. Takes his time getting up (initiative −1), then walks up for a hug and explodes; kill him, root him or push him back into his friends before his turn. Killing him spills poison spores on the floor around him, so do it from range (or from the air). Immune to poison, obviously.' });

  // =====================================================================================================
  // Cellar Spider — web Root (ground), bites Rooted prey harder; immune to Root
  // =====================================================================================================

  // v2: a control move, no damage (webbing = Root now + webs that Root whoever walks in later)
  eskill({ id: 'a1_spider_web', name: 'Web Spit', icon: '🕸️', kind: 'attack', tags: ['ranged', 'aoe', 'root'], anchor: 'ground', cooldown: 2,
    levels: [{ turns: 1, web: 3 }], target: { type: 'tile', range: [2, 5], filter: 'any', los: false }, area: { shape: 'cross', size: 1 },
    desc: function (L) {
      return 'Lob a web over anything in the way: web a small cross for ' + L.web + ' rounds and Root the foes in it for their next ' +
        (L.turns === 1 ? 'turn' : L.turns + ' turns') + ' (webs also Root whoever walks in).';
    },
    flavor: 'Interior decorating, spider style.',
    aiScore: function (ctx) { return ctx.foes.reduce(function (s, u) { return s + (has(u, 'root') ? 0 : 2); }, 0); },
    execute: function (ctx) {
      if (ctx.target) DD.FX.projectile(ctx.user, ctx.target, { kind: 'orb', arc: true, color: '#f2f2f2' });
      say(ctx, 0.25);
      ctx.foes.forEach(function (u) { if (active(u)) A().addStatus(u, 'root', { turns: ctx.L.turns }, ctx.user); });
      ctx.tiles.forEach(function (p) { A().setSurface(p.x, p.y, 'web', ctx.L.web); });
    } });
  /** Prey the spider bites harder: Rooted, or standing in a web (the web's Root from the spider's turn wears off at the
   *  end of the stuck hero's next turn, before the spider's next bite; the web under the hero is still there). A flyer
   *  over a web is not standing in it (v2: flyers ignore the floor). */
  function webbed(u) {
    if (!active(u)) return false;
    if (has(u, 'root')) return true;
    const t = G().tile(u.x, u.y);
    return !!(t && t.surface && t.surface.id === 'web' && G().feelsSurface(u, t.surface));
  }
  eskill({ id: 'a1_spider_bite', name: 'Sticky Snack', icon: '🕷️', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 5, bonus: 3 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage, +' + L.bonus + ' if the target is Rooted or standing in a web.'; },
    flavor: 'Fast food, but the food is slow.',
    // a wind-up of this bite (none in act 1) would show the bonus when its victim is webbed (DD.AI.intentDmg reads this)
    telegraphFlat: function (unit, intent) { return webbed(intentVictim(unit, intent)) ? DD.skillLevel(DD.getSkill('a1_spider_bite'), 1).bonus : 0; },
    aiScore: function (ctx) { return ctx.targetUnit && webbed(ctx.targetUnit) ? 3 : 0; },
    execute: function (ctx) { lunge(ctx); say(ctx, 0.2); strike(ctx, ctx.foes, ctx.L.dmg); } });

  /** A fat round abdomen over the leg bases (the painter's legs alone read as a cage), a red hourglass and a
   *  second pair of beady eyes. */
  function spiderOverlay(g, t) {
    const ph = phaseOf(g), br = Math.sin(t * 2.6 + ph);
    const by = -(7 + 8.2 * 0.72) + br * 0.25;
    const body = g.pal.skin || '#8a7461';
    g.shaded(function (c) { c.ellipse(-2.5, by - 0.5, 9.5, 7.6, 0, 0, Math.PI * 2); }, body, { dx: 1.4, dy: -1.6, hl: [-4.5, by - 5, 3.2, 1.4, -0.4] });
    g.arc(-2.5, by + 1.5, 6.5, 0.35, Math.PI - 0.35, g.shade(body, -0.35), 0.9);
    g.poly([[-4.5, by - 4.6], [-0.5, by - 4.6], [-2.5, by - 1.6]], '#d42a2a', null);
    g.poly([[-4.5, by + 1.4], [-0.5, by + 1.4], [-2.5, by - 1.6]], '#d42a2a', null);
    const hx = 10.5 * 0.88 + 7.2 * 0.95 * 0.35 + (g.pose === 'attack' ? 2.5 : 0), hy = by - 8.2 * 0.1 + br * 0.2 + (g.pose === 'attack' ? 1 : 0);
    g.circle(hx + 1.2, hy - 3.6, 0.9, '#ff3a3a', null);
    g.circle(hx + 3.6, hy - 3.2, 0.9, '#ff3a3a', null);
  }

  DD.registerEnemy({ id: 'a1_spider', name: 'Cellar Spider', act: 1, tier: 'normal', hp: 16, mov: 4, armor: 1, init: 2,
    tags: ['beast', 'spider'], flags: { immune: ['root'] }, resist: { poison: 0.5, fire: 1.5 },
    passive: { name: 'Ambush Hunter', icon: '🕸️', desc: function () {
      return 'On its turn it webs heroes from afar, or goes for the weakest prey it can reach (wounded, squishy or webbed) and bites, ' +
        'even past your front line. Prey that is Rooted or standing in a web takes +' + lvl('a1_spider_bite').bonus + '. Immune to Root (webs never stop it).';
    } },
    sprite: { base: 'quadruped', scale: 1, palette: { skin: '#8a7461', cloth2: '#a8917b', belly: '#a8917b', eye: '#ff3a3a', accent: '#d42a2a', outline: '#1a1010' },
      shape: { legs: 'spider', body: 'round', snout: 'flat' }, head: { eyes: 'glow', mouth: 'fangs', size: 0.95 }, overlay: spiderOverlay },
    // the act's diver: it picks on the weak (DD.AI 'skirmisher' targeting) and braves attacks of opportunity for it
    skills: ['a1_spider_web', 'a1_spider_bite'], ai: { style: 'skirmisher' }, xp: 4, gold: [2, 4],
    hooks: {
      // Sticky Snack bites webbed (Rooted or web-standing) targets harder (attacks of opportunity: below)
      modifyOutgoingDamage: function (d) {
        if (d.cause === 'skill' && !d.opportunity && d.skill && d.skill.id === 'a1_spider_bite' && webbed(d.target)) d.flat += DD.skillLevel(d.skill, 1).bonus || 0;
      },
      // ... a bite on prey leaving a web rides on o.flat, so the move preview and the AI's walk prices show the +3 (pure)
      modifyOpportunity: function (o) {
        if (!o.attacker || o.attacker.defId !== 'a1_spider' || !o.skill || o.skill.id !== 'a1_spider_bite' || o.a1Web !== undefined) return;
        o.a1Web = webbed(o.mover) ? DD.skillLevel(o.skill, o.level || 1).bonus || 0 : 0;
        o.flat += o.a1Web;
      },
    },
    barks: {
      spawn: ['*eight legs, zero chill*', 'Welcome to my web. Wipe your feet.', 'Dinner AND a show.'],
      attack: ['Stay. Still.', 'Snack time.', '*happy clicking*'],
      hurt: ['*furious skittering*', 'My legs! Several of them!', 'Hiss!'],
      death: ['*curls up dramatically*', 'Seven legs... not enough...', 'Leave... the webs... up...'],
    },
    desc: 'The cellar\'s oldest tenant; it has not paid rent since the Second Age, and it drops on you fast (initiative +2). An ambush hunter: it ignores whoever stands in front and goes for whoever looks tastiest (the wounded and the squishy). Spits webs that Root (and keep Rooting whoever steps in), then bites prey that is Rooted or still standing in a web harder. Walks on its own webs: immune to Root. Weak to fire.' });

  // =====================================================================================================
  // Bandit Bard Critic — Bad Review (Weak); silence-able
  // =====================================================================================================

  eskill({ id: 'a1_critic_review', name: 'Bad Review', icon: '👎', kind: 'spell', tags: ['ranged', 'debuff'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 4, turns: 2 }], target: { type: 'unit', range: [1, 6], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage and Weaken the target (−25% damage) for its next ' + plural(L.turns, 'turn') + '. A spell: Silence stops it.'; },
    flavor: '★☆☆☆☆ "The fighter\'s footwork was derivative."',
    aiScore: function (ctx) { return ctx.targetUnit && !has(ctx.targetUnit, 'weak') ? 2 : 0; },
    execute: function (ctx) {
      if (ctx.target) DD.FX.projectile(ctx.user, ctx.target, { kind: 'feather', color: '#f6f2ea' });
      say(ctx, 0.35);
      strike(ctx, ctx.foes, ctx.L.dmg).forEach(function (u) {
        if (!active(u)) return;
        A().addStatus(u, 'weak', { turns: ctx.L.turns }, ctx.user);
        DD.FX.text(u, '★☆☆☆☆', { color: '#ffd23f', size: 14 });
      });
    } });
  eskill({ id: 'a1_critic_lute', name: 'Lute to the Face', icon: '🎸', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 6 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; },
    flavor: 'He cannot play it, but he can swing it.',
    execute: function (ctx) { lunge(ctx); say(ctx, 0.3); strike(ctx, ctx.foes, ctx.L.dmg); } });

  DD.registerEnemy({ id: 'a1_critic', name: 'Bandit Bard Critic', act: 1, tier: 'normal', hp: 17, mov: 3, armor: 0, init: 1,
    tags: ['human', 'bandit', 'bard'], flags: {}, resist: {},
    passive: { name: 'Everyone\'s a Critic', icon: '👎', desc: 'On his turn he keeps his distance and writes a Bad Review (damage + Weak) of a hero he can see, preferring one who is not Weak yet, or swings his lute at anyone next to him. Silenced, he has nothing to say.' },
    sprite: { base: 'humanoid', scale: 1, build: 'slim', outfit: 'coat',
      palette: { skin: '#e8c4a0', cloth: '#41285e', cloth2: '#d8c27a', hair: '#2a1a12', hat: '#1c1a22', eye: '#2b2233', accent: '#c0392b',
        scarf: '#c0392b', quill: '#f6f2ea', parchment: '#efe2b8', mask: '#1c1a22', outline: '#1a1014' },
      head: { hair: 'short', beard: 'stubble', hat: 'beret', face: 'bandit_mask', mouth: 'frown', eyes: 'sleepy' },
      mainhand: 'quill', offhand: 'scroll', extras: ['scarf'] },
    skills: ['a1_critic_review', 'a1_critic_lute'], ai: { style: 'ranged', keepDistance: 3 }, xp: 5, gold: [3, 6],
    barks: {
      spawn: ['Ugh. Another party of murderhobos.', 'Let\'s see if this act has a second act.', 'I\'ll be taking notes.'],
      attack: ['One star. Generous.', 'Derivative!', 'I\'ve seen better tactics from a mimic.'],
      hurt: ['Critics are people too!', 'Violence? How pedestrian.', 'That\'s going in the review.'],
      death: ['Two... stars...', 'At least... it was short...', 'My memoir... unfinished...'],
    },
    desc: 'A highwayman who robs travelers of their dignity. Quick to judge (initiative +1). His Bad Reviews Weaken heroes; they are bardic magic, so Silence shuts him up. Up close he swings a lute he cannot play.' });

  // =====================================================================================================
  // ELITE — Mimic (Disappointed)
  // =====================================================================================================

  // v2: damage + one rider (the pull); the Root that kept a pulled hero next to its mouth is gone
  eskill({ id: 'a1_mimic_tongue', name: 'Sticky Tongue', icon: '👅', kind: 'attack', tags: ['ranged', 'pull'], anchor: 'unit', cooldown: 2,
    levels: [{ dmg: 4, pull: 3 }], target: { type: 'unit', range: [2, 4], filter: 'enemy', los: true, straight: true },
    desc: function (L) {
      return 'Straight line only: deal ' + L.dmg + ' damage and pull the target up to ' + L.pull + ' tiles toward the Mimic (no bump if something is in the way).';
    },
    flavor: 'It licks the loot first. Then it licks you.',
    execute: function (ctx) {
      const u = ctx.user, tu = ctx.targetUnit;
      if (!active(tu)) return;
      if (tu.x !== u.x && tu.y !== u.y) {
        DD.FX.text(u, 'Missed! (out of line)', { color: '#ffb0c0', size: 14 });
        A().log(u.name + '\'s tongue slaps the floor. ' + tu.name + ' is out of line.', 'enemy');
        return;
      }
      DD.FX.beam(u, tu, { color: '#ff6f91', width: 5 });
      say(ctx, 0.3);
      strike(ctx, [tu], ctx.L.dmg);
      // a tongue stops at whatever is in the way (no bump damage), so the number shown is the whole hit
      if (active(tu)) A().pull(u, tu, u, ctx.L.pull, { bump: 0 });
    } });
  // v2: a plain bite now (the hop existed to catch heroes dodging its telegraph); it walks up on its own turn instead
  eskill({ id: 'a1_mimic_chomp', name: 'CHOMP', icon: '🦷', kind: 'attack', tags: ['melee', 'gold'], anchor: 'unit',
    levels: [{ dmg: 9, steal: 4 }], target: { type: 'unit', range: [1, 1], filter: 'enemy', los: true },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage and swallow up to ' + L.steal + ' of the party\'s gold (the Mimic coughs it all back up when it dies).';
    },
    flavor: 'It was hoping for a dragon hoard. It got you.',
    execute: function (ctx) {
      const u = ctx.user, tu = ctx.targetUnit;
      if (!active(tu) || !G().hostile(u, tu)) return;
      lunge(ctx, tu);
      DD.FX.shake(4, 200);
      strike(ctx, [tu], ctx.L.dmg).forEach(function (v) {
        if (v.side !== 'hero' || u.dead) return;
        const got = A().loseGold(ctx.L.steal);
        u.data.gold = (u.data.gold || 0) + got;
        if (got > 0) DD.FX.particles(v, { kind: 'coins', count: 6 + got });
        if (ctx.isIntent || ctx.opportunity) {   // its turn or an attack of opportunity (not a preview): say what it took
          A().bark(u, got >= ctx.L.steal ? 'Mmm. Coins.' : got > 0 ? got + ' gold?! That\'s IT?' : 'No gold?! I am SO disappointed.');
          A().log(u.name + ' swallows ' + plural(got, 'gold coin') + '.', 'enemy');
        }
      });
    } });
  // The act's one elite wind-up (the lid creaking open IS the mimic): announced on its turn, lands at the start of its
  // next one (anchor 'self': push the Mimic and the slam moves with it). A stun, sleep, freeze or sheep interrupts it.
  eskill({ id: 'a1_mimic_slam', name: 'Lid Slam', icon: '📦', kind: 'attack', tags: ['melee', 'aoe', 'push'], anchor: 'self', cooldown: 3,
    levels: [{ dmg: 7, push: 1 }], target: { type: 'self' }, area: { shape: 'square', size: 1 },
    desc: function (L) {
      return 'Wind-up: the lid creaks open. At the start of the Mimic\'s next turn it slams down: ' + L.dmg + ' damage to every unit around the Mimic ' +
        '(diagonals too), knocked back ' + plural(L.push, 'tile') + '. Step away (it can\'t bite you as you go) or stun it.';
    },
    flavor: 'The lid creaks open. Everybody back up.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.shake(9, 380);
      DD.FX.particles(u, { kind: 'dust', count: 18 });
      say(ctx, 0.5);
      // no bump damage: the slam is exactly the number on its marked tiles
      strike(ctx, ctx.units, ctx.L.dmg).forEach(function (v) { if (active(v) && !u.dead) A().knockback(u, v, ctx.L.push, { bump: 0 }); });
    } });

  /** Custom painter: a treasure chest with teeth, a lolling tongue and deeply unimpressed eyes. */
  function drawMimic(g, t) {
    const pal = g.pal;
    const pose = g.pose, pt = typeof g.poseT === 'number' ? g.poseT : 0.5;
    const atk = pose === 'attack' ? Math.sin(Math.PI * pt) : pose === 'cast' ? 0.5 : 0;
    const hurt = pose === 'hurt' ? 1 : 0;
    const breathe = 0.5 + 0.5 * Math.sin(t * 2.1);
    const W = 14, BH = 13, base = -0.5, rim = base - BH;
    const gap = 3.5 + breathe * 1.5 + atk * 9 - hurt * 1.5;
    const wood = pal.wood || '#8a5a2b', dark = g.shade(wood, -0.32), metal = pal.metal || '#d4af37';
    // stubby feet (it walks, sadly)
    g.ellipse(-8.5, base + 0.4, 3.4, 1.7, dark);
    g.ellipse(8.5, base + 0.4, 3.4, 1.7, dark);
    // the maw between rim and lid, with a few swallowed coins glinting
    g.rect(-W + 2, rim - gap - 1.5, (W - 2) * 2, gap + 4, '#3a0d14', null, 3);
    g.ellipse(-4, rim - 1, 2, 1.2, metal, null);
    g.ellipse(3, rim - 1.6, 2, 1.2, g.shade(metal, 0.15), null);
    // lower teeth
    for (let i = 0; i < 7; i++) {
      const x = -W + 3.2 + i * 3.6;
      g.poly([[x - 1.5, rim + 0.4], [x + 1.5, rim + 0.4], [x, rim - 2.6]], '#f6f1e3', null);
    }
    // body: planks + metal bands + lock
    g.shaded(function (c) { c.rect(-W, rim, W * 2, BH); }, wood, { dx: 1.2, dy: -1, hl: null });
    g.line(-W + 1, rim + BH * 0.5, W - 1, rim + BH * 0.5, dark, 0.8);
    g.rect(-W, rim, 3.2, BH, metal, undefined, 0.6);
    g.rect(W - 3.2, rim, 3.2, BH, metal, undefined, 0.6);
    g.rect(-3, rim + 2.5, 6, 6.5, metal, undefined, 1.2);
    g.circle(0, rim + 5, 1.1, '#1a1014', null);
    g.rect(-0.45, rim + 5, 0.9, 2.4, '#1a1014', null);
    // tongue lolling over the front, swaying
    const sway = Math.sin(t * 2.6) * 1.6 + atk * 4;
    g.path(function (c) {
      c.moveTo(-1.5, rim - 1.2);
      c.quadraticCurveTo(-2 + sway * 0.4, rim + 5, 1 + sway, rim + 9 + atk * 3);
      c.quadraticCurveTo(4 + sway, rim + 11 + atk * 3, 5.5 + sway * 0.8, rim + 7.5 + atk * 3);
      c.quadraticCurveTo(5, rim + 3, 3.5, rim - 1.2);
      c.closePath();
    }, '#e8607a');
    g.line(1.2, rim + 0.5, 2 + sway * 0.7, rim + 7 + atk * 2, '#b8405a', 0.7);
    // lid: lifted, a little crooked
    const lidY = rim - gap, lh = 9, tilt = (atk * 0.08 + Math.sin(t * 1.3) * 0.02);
    const c = g.ctx;
    c.save();
    c.translate(0, lidY);
    c.rotate(-tilt);
    for (let i = 0; i < 7; i++) {
      const x = -W + 3.2 + i * 3.6;
      g.poly([[x - 1.5, -0.4], [x + 1.5, -0.4], [x, 2.6]], '#f6f1e3', null);
    }
    g.shaded(function (p) {
      p.moveTo(-W, 0); p.lineTo(-W, -lh * 0.55);
      p.quadraticCurveTo(-W, -lh, -W + 4, -lh); p.lineTo(W - 4, -lh);
      p.quadraticCurveTo(W, -lh, W, -lh * 0.55); p.lineTo(W, 0); p.closePath();
    }, wood, { dx: 1, dy: -1.2, hl: [-4, -lh * 0.75, 6, 1.2, 0] });
    g.rect(-W, -lh * 0.55 - 1, W * 2, 2.2, metal, undefined, 0.8);
    // eyes: half-lidded and unimpressed (raised wide when it lunges)
    const lidDrop = atk > 0.3 ? 0.25 : hurt ? 0.1 : 0.62;
    [-5.5, 5.5].forEach(function (ex, k) {
      const ey = -lh * 0.45;
      g.ellipse(ex, ey, 3.3, 2.9, '#f4f0e0');
      g.circle(ex + (k ? -0.6 : 0.6), ey + 0.8, 1.4, '#1a1014', null);
      g.path(function (p) { p.rect(ex - 3.5, ey - 3.1, 7, 6.2 * lidDrop); }, wood, null);
      g.line(ex - 3.4, ey - 3.1 + 6.2 * lidDrop, ex + 3.4, ey - 3.1 + 6.2 * lidDrop, '#1a1014', 0.9);
      // sad brows: inner ends raised
      g.line(ex + (k ? -3.2 : 3.2), ey - 4.8, ex + (k ? 2.6 : -2.6), ey - 3.6, '#1a1014', 1.2);
    });
    c.restore();
    if (hurt) g.text('!', 11, rim - gap - lh - 3, 7, '#ffe14a');
  }

  DD.registerEnemy({ id: 'a1_mimic', name: 'Mimic (Disappointed)', act: 1, tier: 'elite', hp: 68, mov: 3, armor: 2, init: 2,
    tags: ['monstrosity', 'mimic'], flags: { large: true }, resist: { fire: 1.25 },
    passive: { name: 'Creaky Lid', icon: '📦', desc: 'On its turn it CHOMPs a hero it can walk up to (sticking to the one next to it), else licks someone 2-4 tiles away in a straight line and reels them in. Crowded by 2+ foes, it winds up a Lid Slam instead: it lands at the start of its next turn, and while the lid is open it can\'t bite anyone walking away.' },
    sprite: { base: 'custom', scale: 1.4, height: 40, width: 32, headY: -24, portrait: { x: 0, y: -22, r: 19 },
      palette: { wood: '#8a5a2b', metal: '#d4af37', skin: '#8a5a2b', eye: '#f4f0e0', accent: '#e8607a', outline: '#1a1014' },
      draw: drawMimic },
    skills: ['a1_mimic_tongue', 'a1_mimic_chomp', 'a1_mimic_slam'], ai: mimicPlan, aiStyle: 'melee', xp: 12, gold: [10, 16],
    hooks: {
      // the lid is open (Lid Slam wound up): no CHOMP for heroes stepping out of the slam (pure: paths and the HUD ask)
      modifyOpportunity: function (o) {
        if (o.attacker && o.attacker.defId === 'a1_mimic' && hasIntent(o.attacker, 'a1_mimic_slam')) o.cancel = true;
      },
      onDeath: function (unit) {
        const n = unit.data.gold || 0;
        if (!n) return;
        unit.data.gold = 0;
        DD.FX.particles(unit, { kind: 'coins', count: 18 });
        A().gainGold(n);
        A().log('The Mimic coughs up the ' + plural(n, 'gold coin') + ' it swallowed. Sticky, but spendable.', 'system');
      },
    },
    barks: {
      spawn: ['*sighs* Adventurers. Of course.', 'I was hoping for a dragon. I got you.', 'Go on. Open me. I dare you.'],
      attack: ['Hold still, snack.', 'Your loot is SO mid.', 'Lick first, questions never.'],
      hurt: ['Rude! I\'m an antique!', 'Watch the finish!', 'That\'s going to splinter.'],
      death: ['Should have been... a wardrobe...', 'Take the gold. It was never enough.', '*lid closes sadly*'],
    },
    desc: 'A chest that wanted to eat a dragon hoard and keeps getting adventurers. It has been waiting nine years for someone to touch it (initiative +2). It walks up and CHOMPs (swallowing party gold, coughed back up when it dies), or licks a hero in a straight line and reels them in. Crowd it and the lid creaks open: the Lid Slam lands at the start of its next turn, so back away or stun it. Iron bands: armor 2.' });

  /**
   * One move and one action a turn: crowded by 2+ foes (diagonals count) → the lid creaks open (the Lid Slam wind-up is
   * its whole turn); else CHOMP whoever it can walk up to; else lick someone in a straight line; else walk closer.
   */
  function mimicPlan(unit, api) {
    if (!api.foes(unit).length) return;
    const charging = hasIntent(unit, 'a1_mimic_slam');   // normally it already landed at this turn's start
    if (!charging && api.canUse(unit, 'a1_mimic_slam')) {
      const spot = crowdSpot(unit, api, 2);
      if (spot) {
        const x = unit.x, y = unit.y;
        if (stepTo(unit, api, spot) && api.windUp(unit, 'a1_mimic_slam', unit, { anchor: 'self', label: 'Lid Slam' })) {
          A().bark(unit, '*the lid creaks open*');
          return;
        }
        if (!active(unit)) return;
        if (unit.x !== x || unit.y !== y) {
          // the walk was cut short (a web, a trap): bite or lick from where it stands
          if (!actSkill(unit, api, 'a1_mimic_chomp', true)) actSkill(unit, api, 'a1_mimic_tongue', true);
          return;
        }
      }
    }
    if (actSkill(unit, api, 'a1_mimic_chomp', charging)) return;
    if (actSkill(unit, api, 'a1_mimic_tongue', charging)) return;
    if (!charging) approach(unit, api);
  }

  // =====================================================================================================
  // ELITE — Bugbear Bouncer: grabs and throws heroes, lobs bar stools
  // =====================================================================================================

  eskill({ id: 'a1_bugbear_bounce', name: 'You\'re Not On The List', icon: '🚪', kind: 'attack', tags: ['melee', 'push', 'throw'], anchor: 'self',
    levels: [{ dmg: 7, throw: 3, bump: 4 }], target: { type: 'dir' }, area: { shape: 'line', size: 4 },
    desc: function (L) {
      return 'Grab the unit in front of him: deal ' + L.dmg + ' damage and throw it up to ' + L.throw + ' tiles straight away from him. Slamming into something deals ' + L.bump + ' more damage to it (and to the unit or object it hits); a pit drops it in (a flyer sails over).';
    },
    flavor: 'Velvet rope policy, strictly enforced.',
    execute: function (ctx) {
      const u = ctx.user, d = ctx.dir;
      const first = ctx.tiles[0];
      const v = first ? G().unitAt(first.x, first.y) : null;
      lunge(ctx, first);
      if (!active(v) || v === u) { DD.FX.text(u, 'Grabs at air.', { color: '#d0d0d0', size: 14 }); return; }
      say(ctx, 0.6);
      strike(ctx, [v], ctx.L.dmg);
      if (active(v) && !u.dead) {
        DD.FX.text(v, 'OUT!', { color: '#ffd23f', size: 18 });
        A().push(u, v, d, ctx.L.throw, { bump: ctx.L.bump });
      }
    } });
  // v2: Bear Hug is gone — it Rooted heroes so they could not sidestep the telegraphed throw, and throws are immediate now
  eskill({ id: 'a1_bugbear_stool', name: 'Bar Stool Toss', icon: '🪑', kind: 'attack', tags: ['ranged', 'aoe', 'objects'], anchor: 'ground', cooldown: 2,
    levels: [{ dmg: 6 }], target: { type: 'tile', range: [2, 5], filter: 'any', los: false }, area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Lob a bar stool over anything in the way: deal ' + L.dmg + ' damage to everything within 1 tile of the target tile (friend, foe or furniture).'; },
    flavor: 'The stool was also asked to leave.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.projectile(ctx.user, ctx.target, { kind: 'rock', arc: true, size: 1.6, color: '#8a5a2b' });
      if (ctx.target) DD.FX.explosion(ctx.target, { radius: 1, color: '#c8a070' });
      DD.FX.shake(6, 260);
      strike(ctx, ctx.units, ctx.L.dmg);
      smashObjects(ctx.user, ctx.tiles, ctx.L.dmg);
    } });

  /** Overlay: a staff tee ("SECURITY") — the base tunic is plain black. */
  function securityOverlay(g, t) {
    const ph = phaseOf(g), br = Math.sin(t * 2.2 + ph);
    if (g.pose === 'downed') return;
    g.text('SECURITY', 0, -15.5 + br * 0.2, 3.4, '#f4f0e0');
  }

  /** Expected value of throwing f (standing at f) along dir from `from`: base damage + collision / drop value. */
  function throwValue(unit, f, dir, L) {
    let sc = L.dmg, x = f.x, y = f.y;
    for (let k = 0; k < L.throw; k++) {
      const nx = x + dir.x, ny = y + dir.y;
      if (!G().inBounds(nx, ny)) { sc += L.bump; break; }
      const o = G().unitAt(nx, ny);
      if (o) { sc += L.bump + (G().hostile(unit, o) ? L.bump : -L.bump * 1.5); break; }
      const t = G().tile(nx, ny);
      if (t.obj && G().objBlocksMove(t.obj)) { sc += L.bump + (A().isVolatile(t.obj) ? 3 : 0); break; }
      if (G().isDrop(nx, ny)) {
        if (!G().isFlying(f)) { sc += f.kind === 'hero' || A().isBoss(f) ? Math.ceil(f.maxHp * 0.25) + 3 : 25; break; }
        x = nx; y = ny;   // a flyer thrown over a pit just keeps flying (v2: it never falls)
        continue;
      }
      const td = G().terrain(t);
      if (td.walkable === false || !G().canStep(f, { x: x, y: y }, { x: nx, y: ny })) { sc += L.bump; break; }
      if (G().hazardAt(nx, ny, f)) sc += 4;
      x = nx; y = ny;
    }
    return sc;
  }

  /** Value of a bar stool landing on tile c: its damage per foe within 1 tile, −9 per friend (the stool does not care). */
  function stoolValue(unit, c, L) {
    let v = 0;
    G().shape('circle', c, null, 1).forEach(function (q) {
      const o = G().unitAt(q.x, q.y);
      if (!active(o) || o === unit) return;
      v += G().hostile(unit, o) ? L.dmg : -9;
    });
    return v;
  }

  /**
   * One move and one action a turn: throw the adjacent foe whose throw hurts most (he walks around his victim to aim it
   * at walls, friends, barrels and pits, if that beats the attack of opportunity the walk provokes) or lob a bar stool
   * into a group further away, whichever scores higher; else walk closer. Like every brute he sticks to the hero who
   * stood next to him when his turn began (DD.AI.targetValue: engaged, threat, kills).
   */
  function bugbearPlan(unit, api) {
    const foes = api.foes(unit);
    if (!foes.length) return;
    const LB = lvl('a1_bugbear_bounce'), LS = lvl('a1_bugbear_stool');
    const canThrow = api.canUse(unit, 'a1_bugbear_bounce'), canStool = api.canUse(unit, 'a1_bugbear_stool');
    const rg = DD.Targeting.range(unit, DD.getSkill('a1_bugbear_stool'), 1);
    const origin = { x: unit.x, y: unit.y };
    let best = null;
    const offer = function (o) { if (o.score > 0 && (!best || o.score > best.score)) best = o; };
    const consider = function (p) {
      at(unit, p, function () {
        const bias = -(p.cost || 0) * 0.2 - (p.aoo || 0);
        foes.forEach(function (f) {
          const d = G().dist(p, f);
          if (canThrow && d === 1) {
            const focus = DD.AI.targetValue(unit, f, DD.AI.estimate(unit, f, LB.dmg), 'melee', origin);
            offer({ p: p, skill: 'a1_bugbear_bounce', target: { x: f.x, y: f.y }, score: throwValue(unit, f, U.dirTo(p, f), LB) + focus + bias });
          }
          if (canStool && d >= Math.max(2, rg[0]) && d <= rg[1]) offer({ p: p, skill: 'a1_bugbear_stool', target: { x: f.x, y: f.y }, score: stoolValue(unit, f, LS) - 1 + bias });
        });
      });
    };
    if (canThrow || canStool) spotsOf(unit, api).forEach(consider);
    if (!best) { approach(unit, api); return; }
    if (!stepTo(unit, api, best.p)) {
      if (!active(unit)) return;
      // the walk was cut short (a web, a trap): act from here if anything still works
      best = null;
      consider({ x: unit.x, y: unit.y, cost: 0 });
      if (!best) return;
    }
    api.act(unit, best.skill, best.target, {});
  }

  DD.registerEnemy({ id: 'a1_bugbear', name: 'Bugbear Bouncer', act: 1, tier: 'elite', hp: 70, mov: 3, armor: 2, init: -1,
    tags: ['goblinoid', 'bugbear'], flags: { large: true }, resist: {},
    passive: { name: 'Bouncer', icon: '🚪', desc: 'On his turn he throws the hero next to him into whatever hurts most (walls, friends, barrels, pits), stepping around them to aim it, or lobs a bar stool into a group further away. Walk away from him and his attack of opportunity is the throw.' },
    sprite: { base: 'humanoid', scale: 1.45, build: 'huge', outfit: 'tunic',
      palette: { skin: '#a8743f', cloth: '#1d1d24', cloth2: '#33333d', hair: '#6b4426', metal: '#d4af37', eye: '#ffd23f', accent: '#e23b3b',
        book: '#22222a', outline: '#140c08' },
      head: { ears: 'bear', hair: 'none', eyes: 'angry', mouth: 'tusks', face: 'sunglasses' },
      offhand: 'book', bling: ['chain'], overlay: securityOverlay },
    skills: ['a1_bugbear_bounce', 'a1_bugbear_stool'], ai: bugbearPlan, aiStyle: 'melee', xp: 12, gold: [8, 14],
    barks: {
      spawn: ['You\'re not on the list.', 'No shirt, no shoes, no levels, no service.', 'Party of four? We\'re at capacity.'],
      attack: ['OUT.', 'Take it outside. I\'ll help.', 'Did I stutter?'],
      hurt: ['That\'s a lifetime ban.', 'Cute.', 'You just bought the bar a new window.'],
      death: ['Tell the manager... I quit...', 'Who\'s gonna... check IDs...', 'Last... call...'],
    },
    desc: 'Head of security at the Leaky Flagon. Big, and slow to get going (initiative −1), because he checks a list nobody is on. Then he throws whoever is next to him three tiles: into walls, friends, barrels or pits for extra pain. Walking out on him gets you thrown out. Lobs bar stools at groups further away.' });

  // =====================================================================================================
  // ELITE — Gelatinous Cube: immovable, Engulf, Jiggle Slam
  // =====================================================================================================

  // v2: the victim can't move (a1_engulfed noMove) and is digested; the AP drain and the separate Root are gone
  eskill({ id: 'a1_cube_engulf', name: 'Engulf', icon: '🫧', kind: 'attack', tags: ['melee', 'root'], anchor: 'self', cooldown: 2,
    levels: [{ dmg: 7, acid: 3, turns: 2, free: 10 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage and Engulf the target for its next ' + plural(L.turns, 'turn') + ': it can\'t move and takes ' + L.acid +
        ' acid damage at the start of each of its turns. Dealing ' + L.free + ' damage to the Cube frees everyone inside.';
    },
    flavor: 'Step one: be a cube. Step two: there is no step two.',
    aiScore: function (ctx) { return ctx.targetUnit && has(ctx.targetUnit, 'a1_engulfed') ? -30 : 4; },
    execute: function (ctx) {
      const u = ctx.user;
      lunge(ctx);
      say(ctx, 0.4);
      strike(ctx, ctx.foes, ctx.L.dmg).forEach(function (v) {
        if (!active(v) || u.dead) return;
        // the "10 damage frees everyone" count starts with the first meal (a second one does not reset it)
        if (!heldBy(u).length) u.data.jiggle = 0;
        const st = A().addStatus(v, 'a1_engulfed', { turns: ctx.L.turns }, u);
        if (st) {
          st.data.acid = ctx.L.acid;
          DD.FX.particles(v, { kind: 'bubbles', count: 12, color: '#8be36a' });
          A().log(v.name + ' is engulfed by the Gelatinous Cube!', 'enemy');
        }
      });
    } });
  eskill({ id: 'a1_cube_spit', name: 'Spit Out Previous Adventurer', icon: '🦴', kind: 'attack', tags: ['ranged'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 4 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: false },
    desc: function (L) { return 'Lob a skeleton over anything in the way: deal ' + L.dmg + ' damage to a target up to 5 tiles away and leave a pile of bones on its tile.'; },
    flavor: 'He was a level 3 rogue. He did not check for cubes.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.projectile(ctx.user, ctx.target, { kind: 'bone', arc: true, color: '#efe6d2' });
      strike(ctx, ctx.foes, ctx.L.dmg);
      const t = ctx.target ? G().tile(ctx.target.x, ctx.target.y) : null;
      if (t && !t.obj && G().isWalkable(t.x, t.y)) A().placeObject(t.x, t.y, 'bones');
    } });
  // v2: immediate (brainless jelly gives no warning); it only slams when 2+ foes stand around it
  eskill({ id: 'a1_cube_slam', name: 'Jiggle Slam', icon: '🟩', kind: 'attack', tags: ['melee', 'aoe'], anchor: 'self', cooldown: 3,
    levels: [{ dmg: 8 }], target: { type: 'self' }, area: { shape: 'square', size: 1 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every unit around the Cube (diagonals too), including anyone inside it.'; },
    flavor: 'There is always room for jello. And for you.',
    execute: function (ctx) {
      DD.FX.shake(8, 340);
      DD.FX.particles(ctx.user, { kind: 'bubbles', count: 20, color: '#8be36a' });
      say(ctx, 0.4);
      strike(ctx, ctx.units, ctx.L.dmg);
    } });

  /**
   * One move and one action a turn, and no moving while it digests someone: Jiggle Slam when 2+ foes stand around it,
   * else Engulf a foe next to it (walking up first), else spit a skeleton at someone further away, else ooze closer.
   */
  function cubePlan(unit, api) {
    if (!api.foes(unit).length) return;
    const digesting = heldBy(unit).some(function (v) { return G().dist(v, unit) === 1; });
    if (api.canUse(unit, 'a1_cube_slam')) {
      const spot = crowdSpot(unit, api, 2, digesting);
      if (spot) {
        const x = unit.x, y = unit.y;
        if (stepTo(unit, api, spot) && api.act(unit, 'a1_cube_slam', unit, {})) return;
        if (!active(unit) || unit.x !== x || unit.y !== y) return;
      }
    }
    if (actSkill(unit, api, 'a1_cube_engulf', digesting)) return;
    if (actSkill(unit, api, 'a1_cube_spit', digesting)) return;
    if (!digesting) approach(unit, api);
  }

  const ACID_BODY = 2;

  DD.registerEnemy({ id: 'a1_cube', name: 'Gelatinous Cube', act: 1, tier: 'elite', hp: 70, mov: 2, armor: 2, init: -3,
    tags: ['ooze', 'cube'], flags: { immovable: true, stunImmune: true, large: true }, resist: { poison: 0, fire: 1.5 },
    passive: { name: 'Acidic Body', icon: '🫧', desc: function () {
      return 'On its turn it Jiggle Slams when 2+ foes stand around it, else Engulfs the foe next to it (it never moves while digesting), else spits a skeleton. ' +
        'Walking away from it while Engulf is ready gets you Engulfed. A foe hitting it with a skill from next to it takes ' + ACID_BODY + ' acid. ' +
        lvl('a1_cube_engulf').free + ' damage to it frees everyone inside.';
    } },
    sprite: { base: 'blob', scale: 1.55, palette: { skin: '#7fe08a', metal: '#e8c547', eye: '#1a1014', outline: '#16301a' },
      shape: { cube: true, translucent: true, wobble: 1 }, head: { eyes: 'big', mouth: 'smile' } },
    skills: ['a1_cube_engulf', 'a1_cube_spit', 'a1_cube_slam'], ai: cubePlan, aiStyle: 'melee', xp: 12, gold: [8, 14],
    hooks: {
      // Acidic Body: a foe that hits it from an adjacent tile with a skill gets splashed; enough damage makes it gag
      onTakeDamage: function (d) {
        const cube = d.target;
        if (!cube || !((d.dealt || 0) + (d.blocked || 0) > 0)) return;
        const src = d.source;
        if (d.cause === 'skill' && active(src) && src !== cube && G().hostile(cube, src) && G().dist(src, cube) === 1) {
          A().damage(cube.dead ? null : cube, src, ACID_BODY, { cause: 'other', reflect: true, ignoreArmor: true, noHighGround: true, tags: ['acid'] });
        }
        if (cube.dead) return;
        const held = heldBy(cube);
        if (!held.length) return;
        cube.data.jiggle = (cube.data.jiggle || 0) + (d.dealt || 0) + (d.blocked || 0);
        const free = DD.skillLevel(DD.getSkill('a1_cube_engulf'), 1).free || 10;
        if (cube.data.jiggle < free) return;
        cube.data.jiggle = 0;
        DD.FX.text(cube, '*HURK*', { color: '#8be36a', size: 17 });
        held.forEach(function (v) { release(v, 'Spat out!'); });
      },
      onDeath: function (unit) {
        heldBy(unit).forEach(function (v) { release(v, 'Free!'); });
        A().log('The Cube collapses. Inside: three boots, a skeleton and somebody\'s homework.', 'system');
      },
    },
    barks: {
      spawn: ['*wobbles menacingly*', '*the sound of jello thinking*', '*a boot floats past inside it*'],
      attack: ['*SHLORP*', '*hungry wobble*', '*glorp of intent*'],
      hurt: ['*offended jiggle*', '*wobbles harder*', '*a skeleton waves from inside*'],
      death: ['*sad deflating noise*', '*splat*', '*the boots are free*'],
    },
    desc: 'A ten-foot cube of lime gelatin that cleans dungeons by eating everything in them. Immovable, brainless (stun immune) and in no hurry at all (initiative −3). Acidic Body: hitting it from an adjacent tile burns the attacker for 2. Engulfed heroes are stuck and slowly digested; deal 10 damage to the Cube to make it spit them out. Weak to fire.' });

  // =====================================================================================================
  // Encounters (act 1): 8 normal, 3 elite
  // =====================================================================================================

  const NORMAL = { goldMult: 1, itemRarity: null };
  const ELITE = { goldMult: 1, itemRarity: 'rare' };
  const KEG_HP = 30;   // The Last Keg (a1_open_mic): five spear pokes

  DD.registerEncounter({ id: 'a1_rats_in_the_cellar', act: 1, kind: 'normal', name: 'Rats in the Cellar (Obviously)', weight: 1.2, minDepth: 0,
    intro: 'Every campaign starts with rats in a cellar. The DM has run this exact encounter forty times and is still proud of it.',
    map: { theme: 'cellar', w: 10, h: 10, features: ['water', 'crates', 'kegs'], density: 1 },
    enemies: [{ id: 'a1_rat', n: 5 }],
    reinforcements: [
      { round: 2, enemies: [{ id: 'a1_rat', n: 2 }], edge: 'S', text: 'Two more rats squeeze out of a drain on the far side. There are always more rats.' },
      { round: 2, enemies: [{ id: 'a1_rat', n: 2 }], edge: 'E', text: 'And two more out of the wine rack. Of course.' },
      { round: 3, enemies: [{ id: 'a1_rat', n: 2 }], edge: 'zone', text: 'The rats regroup and send in the reserves. Rats have reserves.' },
    ],
    objective: { type: 'killAll' }, reward: NORMAL });

  DD.registerEncounter({ id: 'a1_goblin_ambush', act: 1, kind: 'normal', name: 'Goblin Ambush (Poorly Planned)', weight: 1, minDepth: 0,
    intro: 'The goblins have been lying in wait for three hours. They are thrilled you finally showed up and have forgotten the plan.',
    map: { theme: 'warren', w: 10, h: 10, features: ['rocks', 'hills'], density: 1 },
    enemies: [{ id: 'a1_gob_grunt', n: 2 }, { id: 'a1_gob_kid', n: 1 }, { id: 'a1_rat', n: 1 }],
    reinforcements: [{ round: 2, enemies: [{ id: 'a1_gob_grunt', n: 1 }, { id: 'a1_gob_kid', n: 1 }], edge: 'S', text: 'The other half of the ambush wakes up on the wrong side of the room. They hid very well. From each other.' }],
    objective: { type: 'killAll' }, reward: NORMAL });

  DD.registerEncounter({ id: 'a1_slime_time', act: 1, kind: 'normal', name: 'It\'s Slime Time', weight: 1, minDepth: 0,
    intro: 'Something in the sewer goes "blorp". Then three somethings go "blorp". Cutting them in half makes more of them. Fire does not.',
    map: { theme: 'sewer', w: 10, h: 10, features: ['channel', 'slime'], density: 1 },
    enemies: [{ id: 'a1_slime', n: 3 }, { id: 'a1_rat', n: 1 }],
    reinforcements: [{ round: 2, enemies: [{ id: 'a1_rat', n: 2 }], edge: 'S', text: 'Two rats ride a slime-slick down the drainpipe, screaming with joy.' }],
    objective: { type: 'killAll' }, reward: NORMAL });

  DD.registerEncounter({ id: 'a1_fungus_among_us', act: 1, kind: 'normal', name: 'The Fungus Among Us', weight: 1, minDepth: 1,
    intro: 'Two mushrooms in tank tops are vibing aggressively next to some goblins. Do not let them hug you. Do not pop them up close.',
    map: { theme: 'warren', w: 11, h: 11, features: ['pits', 'mushrooms'], density: 1 },
    enemies: [{ id: 'a1_spore_bro', n: 2 }, { id: 'a1_gob_grunt', n: 1 }, { id: 'a1_gob_kid', n: 1 }, { id: 'a1_rat', n: 1 }],
    reinforcements: [{ round: 3, enemies: [{ id: 'a1_spore_bro', n: 1 }], edge: 'zone', text: 'A third Spore Bro arrives, fashionably late and already hugging.' }],
    objective: { type: 'killAll' }, reward: NORMAL });

  DD.registerEncounter({ id: 'a1_web_of_lies', act: 1, kind: 'normal', name: 'Web of Lies', weight: 1, minDepth: 1,
    intro: 'The cellar\'s oldest tenants have webbed the place up, and a masked bandit with a quill is already reviewing your entrance. Two stars.',
    map: { theme: 'cellar', w: 10, h: 10, features: ['web', 'crates', 'kegs'], density: 1 },
    enemies: [{ id: 'a1_spider', n: 2 }, { id: 'a1_critic', n: 1 }, { id: 'a1_rat', n: 2 }],
    reinforcements: [{ round: 2, enemies: [{ id: 'a1_spider', n: 1 }], edge: 'zone', text: 'Another spider drops from the rafters. The rent is due and it is hungry.' }],
    objective: { type: 'killAll' }, reward: NORMAL });

  DD.registerEncounter({ id: 'a1_union_meeting', act: 1, kind: 'normal', name: 'Mandatory Union Meeting', weight: 0.9, minDepth: 2,
    intro: 'The Kobold Union Rep is mid-speech about overtime pay. The goblins vote unanimously to stab you. Smash the Strike Funds and the union folds.',
    // the union hall: funds on the back table, rows of chairs, the Rep on his soapbox
    map: { theme: 'cellar', layout: [
      '###########',
      '#..$..$..$.',
      '#.E..e..E..',
      '#....R.....',
      '#.C.C.C.C..',
      '#......~...',
      '#.C.C.C.C..',
      '#..........',
      '#...X......',
      '#.HHHHHHH..',
      '#..........',
    ], heights: [
      '00000000000',
      '01111111111',
      '01111111111',
      '00000200000',
    ], legend: { $: { obj: 'a1_strike_fund' }, R: { zone: 'enemy', mark: 'soapbox' }, e: { zone: 'enemy' } } },
    enemies: [{ id: 'a1_kobold_rep', n: 1, mark: 'R' }, { id: 'a1_gob_grunt', n: 2 }, { id: 'a1_gob_kid', n: 1 }],
    reinforcements: [{ round: 3, enemies: [{ id: 'a1_rat', n: 2 }], edge: 'zone', text: 'The night shift clocks in: rats pour out of the walls.' }],
    // the funds come with the map (no DD.Act.placeObject), so the hall declares their hazard pay itself
    rules: [hazardRule()],
    objective: { type: 'destroy', objId: 'a1_strike_fund', count: 3 }, reward: NORMAL });

  DD.registerEncounter({ id: 'a1_open_mic', act: 1, kind: 'normal', name: 'Open Mic Night (Hostile)', weight: 0.8, minDepth: 2,
    intro: 'Open Mic Night at the Leaky Flagon. A bandit critic heckles from the stage while goblins eye the last keg. Protect the keg. Protect the vibe.',
    map: { theme: 'cellar', layout: [
      '###########',
      '#E.E..E.E.e',
      '#....e.....',
      '#..C...C..X',
      '#..........',
      '#.bbb..bbb.',
      '#....~.....',
      '#.C.....C..',
      '#....K.....',
      '#.HHHHHHH..',
      '#..........',
    ], heights: [
      '00000000000',
      '01111111111',
      '01111111111',
    ], legend: { b: { obj: 'barrel' }, e: { zone: 'enemy' }, K: { obj: { id: 'keg', hp: KEG_HP, label: 'The Last Keg' } } } },
    enemies: [{ id: 'a1_critic', n: 1 }, { id: 'a1_gob_grunt', n: 2 }, { id: 'a1_rat', n: 1 }],
    // v2: enemies reach the keg on the turn they arrive (no telegraph to answer), so the second wave kicks in the side
    // door, a walk away from the keg (it used to land right next to it), and the keg is sturdier (it was 18 HP)
    reinforcements: [{ round: 2, enemies: [{ id: 'a1_gob_grunt', n: 1 }, { id: 'a1_gob_kid', n: 1 }], edge: 'E',
      text: 'More goblins kick in the kitchen door on the east side. They heard there was free beer.' }],
    objective: { type: 'protect', objId: 'keg' }, reward: NORMAL });

  DD.registerEncounter({ id: 'a1_big_flush', act: 1, kind: 'normal', name: 'The Big Flush', weight: 0.8, minDepth: 3,
    intro: 'Somebody upstairs flushed. Everything in the sewer is coming this way. Hold out for 5 rounds until the tide passes.',
    map: { theme: 'sewer', w: 11, h: 11, features: ['channel', 'water'], density: 1 },
    enemies: [{ id: 'a1_slime', n: 1 }, { id: 'a1_rat', n: 2 }],
    reinforcements: [
      { round: 2, enemies: [{ id: 'a1_rat', n: 2 }, { id: 'a1_slime', n: 1 }], edge: 'E', text: 'A wave of rats rides the current in from a side pipe, surfing on a slime.' },
      { round: 3, enemies: [{ id: 'a1_slime', n: 1 }, { id: 'a1_rat', n: 1 }], edge: 'S', text: 'Something large and moist slides down the drain behind you.' },
      { round: 4, enemies: [{ id: 'a1_spore_bro', n: 2 }, { id: 'a1_rat', n: 1 }], edge: 'W', text: 'Two Spore Bros surf in on a rat. Of course they do.' },
    ],
    objective: { type: 'survive', rounds: 5 }, reward: NORMAL });

  DD.registerEncounter({ id: 'a1_mimic_hoard', act: 1, kind: 'elite', name: 'Suspiciously Many Chests', weight: 1, minDepth: 2,
    intro: 'A goblin treasure room: gold on the floor, chests in the corners, and one chest in the middle that sighs heavily when you walk in.',
    map: { theme: 'warren', layout: [
      '###########',
      '#$..g...g.$',
      '#..P..e..P.',
      '#...EME....',
      '#.g.......g',
      '#..P.....P.',
      '#....~~....',
      '#.C.....C..',
      '#..........',
      '#.HHHHHHH..',
      '#..........',
    ], heights: [
      '00000000000',
      '01111111111',
      '01111111111',
      '01111111111',
    ], legend: { g: { obj: 'gold_pile' }, M: { zone: 'enemy' }, e: { zone: 'enemy' } } },
    enemies: [{ id: 'a1_mimic', n: 1, mark: 'M' }, { id: 'a1_rat', n: 3 }],
    reinforcements: [{ round: 2, enemies: [{ id: 'a1_gob_grunt', n: 2 }], edge: 'S',
      text: 'The goblins who own this treasure room are back from lunch, behind you, and furious about the mess.' }],
    objective: { type: 'killAll' }, reward: ELITE });

  DD.registerEncounter({ id: 'a1_last_call', act: 1, kind: 'elite', name: 'Last Call at the Leaky Flagon', weight: 1, minDepth: 2,
    intro: 'Closing time. The Bugbear Bouncer cracks his knuckles and checks a list you are definitely not on. Mind the explosive barrels.',
    map: { theme: 'cellar', w: 12, h: 11, features: ['barrels', 'kegs', 'crates', 'water'], density: 1 },
    enemies: [{ id: 'a1_bugbear', n: 1 }, { id: 'a1_gob_grunt', n: 1 }, { id: 'a1_gob_kid', n: 1 }],
    reinforcements: [{ round: 2, enemies: [{ id: 'a1_rat', n: 2 }], edge: 'S', text: 'The bar rats join the brawl. They have been waiting all night for this.' }],
    objective: { type: 'killAll' }, reward: ELITE });

  DD.registerEncounter({ id: 'a1_cube_cleanup', act: 1, kind: 'elite', name: 'Clean-Up on Aisle Sewer', weight: 1, minDepth: 3,
    intro: 'A Gelatinous Cube is mopping the sewer. It is very thorough. It has never once missed an adventurer.',
    map: { theme: 'sewer', w: 11, h: 11, features: ['pools', 'slime'], density: 1 },
    enemies: [{ id: 'a1_cube', n: 1 }, { id: 'a1_slime', n: 1 }, { id: 'a1_rat', n: 1 }],
    objective: { type: 'killAll' }, reward: ELITE });
})();
