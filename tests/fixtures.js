/* Dungeons and Degenerates — tests/fixtures.js
 * Test-only content (ids prefixed "test_"): 5 heroes whose kits cover every target type, filter and area shape,
 * 2 summons, 11 enemies covering every AI style (incl. a custom-planner boss with a WIND-UP and a phase change),
 * encounters for every act × kind, 2 consumables and 4 items (incl. a cursed one). v2: heroes and enemies carry
 * initiative modifiers (stats.init / init; an enemy without one uses its tier default).
 * Loaded by the test harness and by ?fixtures=1 in the game. Registration only (no DD_TEST references).
 */
(function () {
  'use strict';
  const DD = window.DD;

  // ---- helpers ------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function hitAll(ctx, dmg, opts) {
    const out = [];
    ctx.foes.forEach(function (f) { if (!f.dead) out.push(A().damage(ctx.user, f, dmg, opts)); });
    return out;
  }
  function melee(ctx) { if (ctx.target) DD.FX.lunge(ctx.user, ctx.target); }
  function shoot(ctx, kind, color) { if (ctx.target) DD.FX.projectile(ctx.user, ctx.target, { kind: kind || 'bolt', color: color || '#ffffff' }); }
  function lv(a, b, c) { return [a, b, c]; }

  function hero(def) {
    def.barks = def.barks || {
      select: ['Ready.', 'Test me.'], start: ['Assert victory!'], move: ['Moving.'], kill: ['Green test!'],
      hurt: ['Ow, a regression.'], lowhp: ['Flaky...'], downed: ['Stack overflow...'], revive: ['Rerun!'],
      ally_down: ['Man down!'], levelup: ['Version bump!'], victory: ['All tests pass!'], idle: ['...'], signature: ['FULL COVERAGE!'],
    };
    def.unlock = def.unlock === undefined ? null : def.unlock;
    return DD.registerHero(def);
  }
  function skill(def) { return DD.registerSkill(def); }
  function spr(base, pal, extra) {
    return Object.assign({ base: base, scale: 1, palette: Object.assign({ skin: '#e0b090', cloth: '#556677', cloth2: '#aabbcc', hair: '#332211', metal: '#cccccc', eye: '#222222', accent: '#ff6600', outline: '#111111' }, pal || {}) }, extra || {});
  }

  // ---- Sir Testsalot (melee tank): dir / self / unit ally / tile emptyOrUnit; row, circle, single ---------------
  skill({ id: 'test_slash', name: 'Test Slash', owner: 'test_knight', icon: '🗡️', kind: 'attack', tags: ['melee'], ap: 1,
    levels: [{ dmg: 5 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; }, flavor: 'Basic, like the tests.',
    execute: function (ctx) { melee(ctx); if (ctx.targetUnit) A().damage(ctx.user, ctx.targetUnit, ctx.L.dmg); } });
  skill({ id: 'test_knight_sig', name: 'Full Regression', owner: 'test_knight', icon: '💥', kind: 'attack', tags: ['aoe'], ap: 2, hype: 100,
    levels: [{ dmg: 15 }], target: { type: 'self' }, area: { shape: 'circle', size: 2 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every foe within 2 tiles and Taunt them.'; },
    execute: function (ctx) {
      DD.FX.explosion(ctx.user, { radius: 2 });
      ctx.foes.forEach(function (f) { A().damage(ctx.user, f, ctx.L.dmg); if (!f.dead) A().addStatus(f, 'taunt', { turns: 1 }, ctx.user); });
    } });
  skill({ id: 'test_shield_bash', name: 'Shield Bash', owner: 'test_knight', icon: '🛡️', kind: 'attack', tags: ['melee', 'push'], ap: 1, cooldown: 1,
    levels: lv({ dmg: 4, push: 2 }, { dmg: 5, push: 2 }, { dmg: 6, push: 3 }), target: { type: 'dir' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the adjacent unit and push it ' + L.push + '.'; },
    execute: function (ctx) {
      melee(ctx);
      const u = ctx.targetUnit;
      if (!u) return;
      A().damage(ctx.user, u, ctx.L.dmg);
      if (!u.dead) A().push(ctx.user, u, ctx.dir, ctx.L.push);
    } });
  skill({ id: 'test_cleave', name: 'Wide Cleave', owner: 'test_knight', icon: '🪓', kind: 'attack', tags: ['melee', 'aoe'], ap: 2, cooldown: 1,
    levels: lv({ dmg: 4 }, { dmg: 5 }, { dmg: 7 }), target: { type: 'dir' }, area: { shape: 'row', size: 1 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the 3 tiles in front.'; },
    execute: function (ctx) { melee(ctx); hitAll(ctx, ctx.L.dmg); } });
  skill({ id: 'test_war_shout', name: 'Mandatory Meeting', owner: 'test_knight', icon: '📣', kind: 'buff', tags: ['aoe'], ap: 1, cooldown: 2,
    levels: lv({ block: 4 }, { block: 6 }, { block: 8 }), target: { type: 'self' }, area: { shape: 'circle', size: 2 },
    desc: function (L) { return 'Gain ' + L.block + ' Block and Taunt foes within 2 tiles.'; },
    execute: function (ctx) {
      A().addBlock(ctx.user, ctx.L.block);
      ctx.foes.forEach(function (f) { A().addStatus(f, 'taunt', { turns: 1 }, ctx.user); });
    } });
  skill({ id: 'test_guard_ally', name: 'Code Review', owner: 'test_knight', icon: '🧱', kind: 'buff', tags: [], ap: 1, cooldown: 1,
    levels: lv({ block: 5 }, { block: 7 }, { block: 9 }), target: { type: 'unit', range: [1, 3], filter: 'ally' },
    desc: function (L) { return 'Give an ally ' + L.block + ' Block.'; },
    execute: function (ctx) { if (ctx.targetUnit) A().addBlock(ctx.targetUnit, ctx.L.block); } });
  skill({ id: 'test_charge', name: 'Hotfix Charge', owner: 'test_knight', icon: '🐎', kind: 'move', tags: ['melee'], ap: 2, cooldown: 2,
    levels: lv({ dmg: 5 }, { dmg: 6 }, { dmg: 8 }), target: { type: 'tile', range: [2, 3], filter: 'emptyOrUnit', straight: true },
    desc: function (L) { return 'Charge in a straight line: move next to the target tile and deal ' + L.dmg + ' damage to a foe there.'; },
    execute: function (ctx) {
      const u = ctx.user;
      const steps = Math.abs(ctx.target.x - u.x) + Math.abs(ctx.target.y - u.y);
      const foe = ctx.targetUnit && DD.Grid.hostile(u, ctx.targetUnit) ? ctx.targetUnit : null;
      const goal = foe ? steps - 1 : steps;
      let last = null;
      for (let i = 1; i <= goal; i++) {
        const p = { x: u.x + ctx.dir.x * i, y: u.y + ctx.dir.y * i };
        if (!DD.Grid.isFree(p.x, p.y, u)) break;
        last = p;
      }
      if (last) A().teleport(u, last.x, last.y);
      if (foe && !foe.dead && DD.Grid.dist(u, foe) === 1) { melee(ctx); A().damage(u, foe, ctx.L.dmg); }
    } });

  hero({ id: 'test_knight', name: 'Sir Testsalot', epithet: 'the Asserted', race: 'Human', cls: 'Fighter', role: 'Test tank', complexity: 1,
    blurb: 'A knight who writes the test before the quest.', color: '#7a8fa6',
    stats: { hp: 32, ap: 3, mov: 3, armor: 1, init: -1 }, growth: { hp: 5 }, flags: {},
    sprite: spr('humanoid', { cloth: '#6c7a89', metal: '#d0d6dc' }, { build: 'stocky', outfit: 'armor', head: { hat: 'helmet' }, mainhand: 'sword', offhand: 'shield' }),
    basic: 'test_slash', signature: 'test_knight_sig',
    // v2 moved this from onCombatStart (now wiped at initiative) to his round-1 turn: other areas' tests count on these
    // 3 Block in round 1 only. A fixture convenience, not a pattern: real content gets no opening shield (DESIGN §4.1).
    passive: { name: 'Overly Prepared', desc: 'Gains 3 Block at the start of his turn in round 1.',
      hooks: { onTurnStart: function (u) { if (DD.Combat.state && DD.Combat.state.round === 1) DD.Act.addBlock(u, 3); } } },
    startingSkills: ['test_shield_bash', 'test_cleave'],
    skillPool: ['test_shield_bash', 'test_cleave', 'test_war_shout', 'test_guard_ally', 'test_charge'] });

  // ---- Wizzy McTest (elemental caster): tile any / line / cone / ring / square / custom / all_foes -------------
  skill({ id: 'test_bolt', name: 'Magic Missile (Unit)', owner: 'test_mage', icon: '✨', kind: 'spell', tags: ['ranged'], ap: 1,
    levels: [{ dmg: 4 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; },
    execute: function (ctx) { shoot(ctx, 'bolt', '#b9a0ff'); if (ctx.targetUnit) A().damage(ctx.user, ctx.targetUnit, ctx.L.dmg); } });
  skill({ id: 'test_mage_sig', name: 'Mass Assert', owner: 'test_mage', icon: '☄️', kind: 'spell', tags: ['fire', 'aoe'], ap: 2, hype: 100,
    levels: [{ dmg: 12 }], target: { type: 'self' }, area: { shape: 'all_foes' },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to every foe.'; },
    execute: function (ctx) { DD.FX.flash('#ff8a1a', 200); hitAll(ctx, ctx.L.dmg, { element: 'fire' }); } });
  skill({ id: 'test_fireball', name: 'Fire Fixture', owner: 'test_mage', icon: '🔥', kind: 'spell', tags: ['fire', 'aoe', 'ranged'], ap: 2, cooldown: 1,
    levels: lv({ dmg: 5, r: 1 }, { dmg: 6, r: 1 }, { dmg: 7, r: 1 }), target: { type: 'tile', range: [2, 5], filter: 'any', los: true },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage in radius ' + L.r + ' (hurts allies too) and ignite the area.'; },
    execute: function (ctx) {
      shoot(ctx, 'fireball', '#ff7a1a');
      DD.FX.explosion(ctx.target, { radius: ctx.L.r });
      ctx.units.forEach(function (u) { A().damage(ctx.user, u, ctx.L.dmg, { element: 'fire' }); });
      ctx.tiles.forEach(function (p) { A().applyElement(p.x, p.y, 'fire', ctx.user, { noUnits: true }); });
    } });
  skill({ id: 'test_frost_ray', name: 'Frost Ray', owner: 'test_mage', icon: '❄️', kind: 'spell', tags: ['frost', 'ranged'], ap: 2, cooldown: 1,
    levels: lv({ dmg: 4, len: 4 }, { dmg: 5, len: 4 }, { dmg: 6, len: 5 }), target: { type: 'tile', range: [1, 1], filter: 'any', los: false },
    area: { shape: 'line', size: function (L) { return L.len; } },
    desc: function (L) { return 'Deal ' + L.dmg + ' frost damage along a ' + L.len + '-tile line and freeze water.'; },
    execute: function (ctx) {
      const end = ctx.tiles[ctx.tiles.length - 1];
      if (end) DD.FX.beam(ctx.user, end, { color: '#9fe3ff' });
      hitAll(ctx, ctx.L.dmg, { element: 'frost' });
      ctx.tiles.forEach(function (p) { A().applyElement(p.x, p.y, 'frost', ctx.user, { noUnits: true }); });
    } });
  skill({ id: 'test_cone_of_cold', name: 'Cone of Mild Chill', owner: 'test_mage', icon: '🧊', kind: 'spell', tags: ['frost', 'aoe'], ap: 2, cooldown: 2,
    levels: lv({ dmg: 4, len: 2 }, { dmg: 5, len: 2 }, { dmg: 5, len: 3 }), target: { type: 'dir' }, area: { shape: 'cone', size: function (L) { return L.len; } },
    desc: function (L) { return 'Deal ' + L.dmg + ' frost damage in a cone of length ' + L.len + ' and Slow foes.'; },
    execute: function (ctx) { ctx.foes.forEach(function (f) { A().damage(ctx.user, f, ctx.L.dmg, { element: 'frost' }); if (!f.dead) A().addStatus(f, 'slow', { turns: 1 }, ctx.user); }); } });
  skill({ id: 'test_chain_zap', name: 'Chain Zap', owner: 'test_mage', icon: '⚡', kind: 'spell', tags: ['lightning', 'ranged'], ap: 2, cooldown: 2,
    levels: lv({ dmg: 5 }, { dmg: 6 }, { dmg: 8 }), target: { type: 'unit', range: [1, 5], filter: 'enemy' },
    area: { shape: 'custom', fn: function (ctx) {
      const out = [ctx.target];
      if (!ctx.target || !ctx.state) return out;
      ctx.state.units.forEach(function (u) {
        if (!u.dead && !u.downed && u !== ctx.user && DD.Grid.dist(u, ctx.target) === 1 && DD.Grid.hostile(ctx.user, u)) out.push({ x: u.x, y: u.y });
      });
      return out;
    } },
    desc: function (L) { return 'Deal ' + L.dmg + ' lightning damage to the target and foes next to it; electrifies water.'; },
    execute: function (ctx) {
      hitAll(ctx, ctx.L.dmg, { element: 'lightning' });
      if (ctx.target) A().applyElement(ctx.target.x, ctx.target.y, 'lightning', ctx.user, { noUnits: true });
    } });
  skill({ id: 'test_ring_of_fire', name: 'Ring of Fire', owner: 'test_mage', icon: '💍', kind: 'spell', tags: ['fire', 'aoe'], ap: 2, cooldown: 3,
    levels: lv({ dmg: 3 }, { dmg: 4 }, { dmg: 5 }), target: { type: 'self' }, area: { shape: 'ring', size: 2 },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to units exactly 2 tiles away and set those tiles on fire.'; },
    execute: function (ctx) {
      ctx.units.forEach(function (u) { A().damage(ctx.user, u, ctx.L.dmg, { element: 'fire' }); });
      ctx.tiles.forEach(function (p) { A().setSurface(p.x, p.y, 'fire', 2); });
    } });
  skill({ id: 'test_blink', name: 'Blink', owner: 'test_mage', icon: '🌀', kind: 'move', tags: [], ap: 1, cooldown: 2,
    levels: lv({ r: 3 }, { r: 4 }, { r: 5 }), target: { type: 'tile', range: function (L) { return [1, L.r]; }, filter: 'empty', los: false },
    desc: function (L) { return 'Teleport to an empty tile up to ' + L.r + ' tiles away.'; },
    execute: function (ctx) { A().teleport(ctx.user, ctx.target.x, ctx.target.y); } });
  skill({ id: 'test_oil_slick', name: 'Oil Slick', owner: 'test_mage', icon: '🛢️', kind: 'utility', tags: ['oil'], ap: 1, cooldown: 2,
    levels: lv({ r: 1 }, { r: 1 }, { r: 2 }), target: { type: 'tile', range: [1, 4], filter: 'any' }, area: { shape: 'square', size: function (L) { return L.r; } },
    desc: function (L) { return 'Cover a ' + (L.r * 2 + 1) + 'x' + (L.r * 2 + 1) + ' square in flammable oil.'; },
    execute: function (ctx) { ctx.tiles.forEach(function (p) { A().applyElement(p.x, p.y, 'oil', ctx.user); }); } });

  hero({ id: 'test_mage', name: 'Wizzy McTest', epithet: 'the Mocked', race: 'Gnome', cls: 'Wizard', role: 'Test caster', complexity: 2,
    blurb: 'Casts spells with 100% branch coverage.', color: '#8e6bd6',
    stats: { hp: 22, ap: 3, mov: 4, armor: 0, init: 1 }, growth: { hp: 3 }, flags: {},
    sprite: spr('humanoid', { cloth: '#5b3f9a' }, { build: 'slim', outfit: 'robe', head: { hat: 'wizard', beard: 'long' }, mainhand: 'staff' }),
    basic: 'test_bolt', signature: 'test_mage_sig',
    passive: { name: 'Arcane Surplus', desc: 'Elemental damage deals +1.', hooks: { modifyOutgoingDamage: function (d) { if (d.element && d.cause === 'skill') d.flat += 1; } } },
    startingSkills: ['test_fireball', 'test_frost_ray'],
    skillPool: ['test_fireball', 'test_frost_ray', 'test_cone_of_cold', 'test_chain_zap', 'test_ring_of_fire', 'test_blink', 'test_oil_slick'] });

  // ---- Father Unittest (support): allyOrSelf / ally / downedAlly / notSelf; cross / all_allies -----------------
  skill({ id: 'test_smite', name: 'Smite-ish', owner: 'test_cleric', icon: '✝️', kind: 'attack', tags: ['holy', 'ranged'], ap: 1,
    levels: [{ dmg: 4 }], target: { type: 'unit', range: [1, 3], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' holy damage.'; },
    execute: function (ctx) { shoot(ctx, 'orb', '#fff0a0'); if (ctx.targetUnit) A().damage(ctx.user, ctx.targetUnit, ctx.L.dmg, { element: 'holy' }); } });
  skill({ id: 'test_cleric_sig', name: 'Green Build', owner: 'test_cleric', icon: '🙏', kind: 'heal', tags: ['heal'], ap: 2, hype: 100,
    levels: [{ heal: 12 }], target: { type: 'self' }, area: { shape: 'all_allies' },
    desc: function (L) { return 'Heal every ally ' + L.heal + ' HP and remove their debuffs.'; },
    execute: function (ctx) { ctx.friends.forEach(function (f) { A().heal(ctx.user, f, ctx.L.heal); A().cleanse(f, 'debuff'); }); } });
  skill({ id: 'test_heal', name: 'Patch Notes', owner: 'test_cleric', icon: '💚', kind: 'heal', tags: ['heal'], ap: 1, cooldown: 1,
    levels: lv({ heal: 7 }, { heal: 9 }, { heal: 12 }), target: { type: 'unit', range: [0, 4], filter: 'allyOrSelf' },
    desc: function (L) { return 'Heal an ally or yourself for ' + L.heal + ' HP.'; },
    execute: function (ctx) { if (ctx.targetUnit) A().heal(ctx.user, ctx.targetUnit, ctx.L.heal); } });
  skill({ id: 'test_bless', name: 'Pep Talk', owner: 'test_cleric', icon: '🌟', kind: 'buff', tags: [], ap: 1, cooldown: 2,
    levels: lv({ turns: 1 }, { turns: 2 }, { turns: 2, haste: true }), target: { type: 'unit', range: [1, 4], filter: 'ally' },
    desc: function (L) { return 'An ally is Inspired for ' + L.turns + ' turn' + (L.turns > 1 ? 's' : '') + (L.haste ? ' and Hasted' : '') + '.'; },
    execute: function (ctx) {
      if (!ctx.targetUnit) return;
      A().addStatus(ctx.targetUnit, 'inspired', { turns: ctx.L.turns }, ctx.user);
      if (ctx.L.haste) A().addStatus(ctx.targetUnit, 'haste', { turns: 2 }, ctx.user);
    } });
  skill({ id: 'test_sanctuary', name: 'Safe Space', owner: 'test_cleric', icon: '⛪', kind: 'heal', tags: ['heal', 'holy'], ap: 2, cooldown: 2,
    levels: lv({ heal: 3 }, { heal: 4 }, { heal: 6 }), target: { type: 'tile', range: [0, 3], filter: 'any' }, area: { shape: 'cross', size: 1 },
    desc: function (L) { return 'Bless a cross of tiles (holy ground for 3 rounds) and heal allies there ' + L.heal + '.'; },
    execute: function (ctx) {
      ctx.tiles.forEach(function (p) { A().setSurface(p.x, p.y, 'holy', 3); });
      ctx.friends.forEach(function (f) { A().heal(ctx.user, f, ctx.L.heal); });
    } });
  skill({ id: 'test_revive', name: 'Rerun Failed', owner: 'test_cleric', icon: '🔁', kind: 'heal', tags: ['heal'], ap: 2, charges: 1,
    levels: lv({ pct: 40 }, { pct: 50 }, { pct: 60 }), target: { type: 'unit', range: [1, 3], filter: 'downedAlly', los: false },
    desc: function (L) { return 'Revive a downed ally at ' + L.pct + '% HP. Once per combat.'; },
    execute: function (ctx) { if (ctx.targetUnit) A().revive(ctx.targetUnit, ctx.L.pct / 100); } });
  skill({ id: 'test_purge', name: 'Refactor', owner: 'test_cleric', icon: '🧹', kind: 'spell', tags: [], ap: 1, cooldown: 1,
    levels: lv({ n: 1 }, { n: 2 }, { n: 3 }), target: { type: 'unit', range: [1, 3], filter: 'notSelf' },
    desc: function (L) { return 'Remove ' + L.n + ' debuff' + (L.n > 1 ? 's' : '') + ' from an ally, or ' + L.n + ' buff' + (L.n > 1 ? 's' : '') + ' from a foe.'; },
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      A().cleanse(u, DD.Grid.hostile(ctx.user, u) ? 'buff' : 'debuff', ctx.L.n);
    } });
  skill({ id: 'test_sleep_hymn', name: 'Boring Sermon', owner: 'test_cleric', icon: '💤', kind: 'spell', tags: ['aoe'], ap: 2, cooldown: 3,
    levels: lv({ turns: 1 }, { turns: 2 }, { turns: 2 }), target: { type: 'tile', range: [2, 4], filter: 'any' }, area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Foes in radius 1 fall Asleep for ' + L.turns + ' turn' + (L.turns > 1 ? 's' : '') + '.'; },
    execute: function (ctx) { ctx.foes.forEach(function (f) { A().addStatus(f, 'sleep', { turns: ctx.L.turns }, ctx.user); }); } });

  hero({ id: 'test_cleric', name: 'Father Unittest', epithet: 'the Green', race: 'Dwarf', cls: 'Cleric', role: 'Test healer', complexity: 1,
    blurb: 'Heals anything that fails.', color: '#e8d27a',
    stats: { hp: 26, ap: 3, mov: 4, armor: 0 }, growth: { hp: 4 }, flags: {},
    sprite: spr('humanoid', { cloth: '#e8e0c0', cloth2: '#c9a227' }, { build: 'stocky', outfit: 'robe', head: { beard: 'long', hat: 'mortarboard' }, mainhand: 'hammer' }),
    basic: 'test_smite', signature: 'test_cleric_sig',
    passive: { name: 'Test Driven', desc: 'Healing an ally also gives them 1 Block.', hooks: {
      onSkillUsed: function (ctx) { if (ctx.skill.kind === 'heal' && ctx.targetUnit && ctx.targetUnit !== ctx.user && !ctx.targetUnit.dead) DD.Act.addBlock(ctx.targetUnit, 1); },
    } },
    startingSkills: ['test_heal', 'test_bless'],
    skillPool: ['test_heal', 'test_bless', 'test_sanctuary', 'test_revive', 'test_purge', 'test_sleep_hymn'] });

  // ---- Shady McTest (skirmisher): straight pull, swap, object filter, empty traps, adjacent ------------------
  skill({ id: 'test_stab', name: 'Stab', owner: 'test_rogue', icon: '🔪', kind: 'attack', tags: ['melee'], ap: 1,
    levels: [{ dmg: 4 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage and Bleed 1.'; },
    execute: function (ctx) { melee(ctx); const u = ctx.targetUnit; if (!u) return; A().damage(ctx.user, u, ctx.L.dmg); if (!u.dead) A().addStatus(u, 'bleed', { stacks: 1 }, ctx.user); } });
  skill({ id: 'test_rogue_sig', name: 'Merge Conflict', owner: 'test_rogue', icon: '🗡️', kind: 'attack', tags: ['melee'], ap: 1, hype: 100,
    levels: [{ dmg: 20 }], target: { type: 'unit', range: [1, 4], filter: 'enemy' },
    desc: function (L) { return 'Teleport next to a foe and deal ' + L.dmg + ' damage.'; },
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      const spot = DD.Grid.emptyTilesNear(u.x, u.y, 1).filter(function (p) { return DD.Grid.dist(p, u) === 1; })[0];
      if (spot) A().teleport(ctx.user, spot.x, spot.y);
      melee(ctx);
      A().damage(ctx.user, u, ctx.L.dmg);
    } });
  skill({ id: 'test_shiv', name: 'Shiv', owner: 'test_rogue', icon: '🩸', kind: 'attack', tags: ['melee'], ap: 1, cooldown: 1,
    levels: lv({ dmg: 3, bleed: 2 }, { dmg: 4, bleed: 2 }, { dmg: 4, bleed: 3 }), target: { type: 'dir' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the adjacent unit and Bleed ' + L.bleed + '.'; },
    execute: function (ctx) {
      melee(ctx);
      const u = ctx.targetUnit;
      if (!u) return;
      A().damage(ctx.user, u, ctx.L.dmg);
      if (!u.dead) A().addStatus(u, 'bleed', { stacks: ctx.L.bleed }, ctx.user);
    } });
  skill({ id: 'test_hook', name: 'Grappling Hook', owner: 'test_rogue', icon: '🪝', kind: 'attack', tags: ['pull', 'ranged'], ap: 1, cooldown: 2,
    levels: lv({ dmg: 2, pull: 3 }, { dmg: 3, pull: 3 }, { dmg: 4, pull: 4 }), target: { type: 'unit', range: [2, 4], filter: 'enemy', straight: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage and pull the target up to ' + L.pull + ' tiles toward you.'; },
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      DD.FX.beam(ctx.user, u, { color: '#bbbbbb', width: 2 });
      A().damage(ctx.user, u, ctx.L.dmg);
      if (!u.dead) A().pull(ctx.user, u, ctx.user, ctx.L.pull);
    } });
  skill({ id: 'test_swap', name: 'Swap Places', owner: 'test_rogue', icon: '🔄', kind: 'move', tags: [], ap: 1, cooldown: 2,
    levels: lv({ r: 3 }, { r: 4 }, { r: 5 }), target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'notSelf' },
    desc: function (L) { return 'Swap places with any unit up to ' + L.r + ' tiles away.'; },
    execute: function (ctx) { if (ctx.targetUnit) A().swap(ctx.user, ctx.targetUnit); } });
  skill({ id: 'test_trap', name: 'Leave a Spike', owner: 'test_rogue', icon: '📌', kind: 'utility', tags: [], ap: 1, cooldown: 2,
    levels: lv({ n: 1 }, { n: 1 }, { n: 1 }), target: { type: 'tile', range: [1, 3], filter: 'empty' },
    desc: function () { return 'Place a spike trap (5 damage to whoever steps on it).'; },
    execute: function (ctx) { A().placeObject(ctx.target.x, ctx.target.y, 'spikes'); } });
  skill({ id: 'test_sabotage', name: 'Sabotage', owner: 'test_rogue', icon: '🔧', kind: 'utility', tags: [], ap: 1, cooldown: 1,
    levels: lv({ dmg: 10 }, { dmg: 15 }, { dmg: 20 }), target: { type: 'tile', range: [1, 2], filter: 'object' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an object (explosive barrels explode).'; },
    execute: function (ctx) { A().damageObject(ctx.user, ctx.target.x, ctx.target.y, ctx.L.dmg); } });
  skill({ id: 'test_shove', name: 'Elbows Out', owner: 'test_rogue', icon: '💪', kind: 'attack', tags: ['push', 'aoe'], ap: 1, cooldown: 2,
    levels: lv({ push: 1 }, { push: 2 }, { push: 2 }), target: { type: 'self' }, area: { shape: 'adjacent' },
    desc: function (L) { return 'Push every adjacent unit ' + L.push + ' tile' + (L.push > 1 ? 's' : '') + ' away.'; },
    execute: function (ctx) { ctx.units.forEach(function (u) { if (u !== ctx.user) A().knockback(ctx.user, u, ctx.L.push); }); } });
  skill({ id: 'test_mark', name: 'Flag for Review', owner: 'test_rogue', icon: '🎯', kind: 'utility', tags: ['ranged'], ap: 1, cooldown: 1,
    levels: lv({ mark: 3 }, { mark: 4 }, { mark: 6 }), target: { type: 'unit', range: [1, 5], filter: 'enemy' },
    desc: function (L) { return 'Mark a foe: the next damage it takes is +' + L.mark + '.'; },
    execute: function (ctx) { if (ctx.targetUnit) A().addStatus(ctx.targetUnit, 'marked', { stacks: ctx.L.mark }, ctx.user); } });

  hero({ id: 'test_rogue', name: 'Shady McTest', epithet: 'the Flaky', race: 'Halfling', cls: 'Rogue', role: 'Test skirmisher', complexity: 2,
    blurb: 'Passes locally. Fails in CI.', color: '#4f6d4a',
    stats: { hp: 22, ap: 3, mov: 5, armor: 0, init: 3 }, growth: { hp: 3 }, flags: { hop: true },
    sprite: spr('humanoid', { cloth: '#2f3b2c' }, { build: 'slim', outfit: 'tunic', head: { hat: 'hood', face: 'bandit_mask' }, mainhand: 'dagger', offhand: 'dagger' }),
    basic: 'test_stab', signature: 'test_rogue_sig',
    passive: { name: 'Backstab Coverage', desc: 'Deals +2 damage to Bleeding foes.', hooks: {
      modifyOutgoingDamage: function (d) { if (d.cause === 'skill' && d.target && DD.Act.hasStatus(d.target, 'bleed')) d.flat += 2; },
    } },
    startingSkills: ['test_shiv', 'test_hook'],
    skillPool: ['test_shiv', 'test_hook', 'test_swap', 'test_trap', 'test_sabotage', 'test_shove', 'test_mark'] });

  // ---- Beastmaster Mocha (summoner) + summons ------------------------------------------------------------
  skill({ id: 'test_whip', name: 'Whip Crack', owner: 'test_summoner', icon: '🪢', kind: 'attack', tags: ['pull'], ap: 1,
    levels: [{ dmg: 3 }], target: { type: 'unit', range: [1, 2], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage and pull the target 1 tile.'; },
    execute: function (ctx) { const u = ctx.targetUnit; if (!u) return; A().damage(ctx.user, u, ctx.L.dmg); if (!u.dead) A().pull(ctx.user, u, ctx.user, 1); } });
  skill({ id: 'test_summoner_sig', name: 'Release the Mocks', owner: 'test_summoner', icon: '🐕', kind: 'summon', tags: ['summon'], ap: 2, hype: 100,
    levels: [{ n: 2 }], target: { type: 'self' },
    desc: function (L) { return 'Summon ' + L.n + ' hounds next to you; they can act right away.'; },
    execute: function (ctx) {
      const spots = DD.Grid.emptyTilesNear(ctx.user.x, ctx.user.y, 2).filter(function (p) { return !DD.Grid.isDrop(p.x, p.y); }).slice(0, ctx.L.n);
      spots.forEach(function (p) { A().summon(ctx.user, 'test_hound', p.x, p.y, { ready: true }); });
    } });
  skill({ id: 'test_call_hound', name: 'Call Hound', owner: 'test_summoner', icon: '🦮', kind: 'summon', tags: ['summon'], ap: 2, cooldown: 2, charges: 3,
    levels: lv({ lvl: 1 }, { lvl: 2 }, { lvl: 3 }), target: { type: 'tile', range: [1, 2], filter: 'empty' },
    desc: function (L) { return 'Summon a level ' + L.lvl + ' hound (3 per combat).'; },
    execute: function (ctx) { A().summon(ctx.user, 'test_hound', ctx.target.x, ctx.target.y, { level: ctx.L.lvl }); } });
  skill({ id: 'test_call_turret', name: 'Deploy Turret', owner: 'test_summoner', icon: '🗼', kind: 'summon', tags: ['summon'], ap: 2, cooldown: 3,
    levels: lv({ lvl: 1 }, { lvl: 2 }, { lvl: 3 }), target: { type: 'tile', range: [1, 2], filter: 'empty' },
    desc: function (L) { return 'Summon a level ' + L.lvl + ' turret that shoots from range.'; },
    execute: function (ctx) { A().summon(ctx.user, 'test_turret', ctx.target.x, ctx.target.y, { level: ctx.L.lvl }); } });
  skill({ id: 'test_bark_order', name: 'Good Boy!', owner: 'test_summoner', icon: '🦴', kind: 'buff', tags: [], ap: 1, cooldown: 1,
    levels: lv({ ap: 1 }, { ap: 1 }, { ap: 2 }), target: { type: 'unit', range: [1, 4], filter: 'ally' },
    desc: function (L) { return 'An ally gains ' + L.ap + ' AP this turn.'; },
    execute: function (ctx) { if (ctx.targetUnit) A().gainAp(ctx.targetUnit, ctx.L.ap); } });
  skill({ id: 'test_feral_roar', name: 'Feral Roar', owner: 'test_summoner', icon: '🦁', kind: 'utility', tags: ['aoe'], ap: 1, cooldown: 2,
    levels: lv({ turns: 1 }, { turns: 2 }, { turns: 2 }), target: { type: 'self' }, area: { shape: 'adjacent' },
    desc: function (L) { return 'Adjacent foes are Weakened for ' + L.turns + ' turn' + (L.turns > 1 ? 's' : '') + '.'; },
    execute: function (ctx) { ctx.foes.forEach(function (f) { A().addStatus(f, 'weak', { turns: ctx.L.turns }, ctx.user); }); } });

  hero({ id: 'test_summoner', name: 'Beastmaster Mocha', epithet: 'of the Stubs', race: 'Elf', cls: 'Ranger', role: 'Test summoner', complexity: 2,
    blurb: 'Never fights alone. Mostly because of the dogs.', color: '#c08a4a',
    stats: { hp: 24, ap: 3, mov: 4, armor: 0 }, growth: { hp: 4 }, flags: {},
    sprite: spr('humanoid', { cloth: '#6b8f3a' }, { build: 'slim', outfit: 'tunic', head: { ears: 'elf', hair: 'long', hat: 'flowers' }, mainhand: 'bow' }),
    basic: 'test_whip', signature: 'test_summoner_sig', summons: ['test_hound', 'test_turret'],
    passive: { name: 'Pack Bond', desc: 'Starts each combat with a hound next to her.', hooks: {
      onCombatStart: function (u) {
        const p = DD.Grid.emptyTilesNear(u.x, u.y, 2).filter(function (q) { return DD.Grid.dist(q, u) >= 1 && !DD.Grid.isDrop(q.x, q.y); })[0];
        if (p) DD.Act.summon(u, 'test_hound', p.x, p.y, { noFx: true });
      },
    } },
    startingSkills: ['test_call_hound', 'test_bark_order'],
    skillPool: ['test_call_hound', 'test_bark_order', 'test_call_turret', 'test_feral_roar'] });

  skill({ id: 'test_hound_bite', name: 'Bite', owner: 'summon', icon: '🦷', kind: 'attack', tags: ['melee'], ap: 1,
    levels: lv({ dmg: 3 }, { dmg: 4 }, { dmg: 5 }), target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; },
    execute: function (ctx) { melee(ctx); if (ctx.targetUnit) A().damage(ctx.user, ctx.targetUnit, ctx.L.dmg); } });
  skill({ id: 'test_hound_howl', name: 'Howl', owner: 'summon', icon: '🐺', kind: 'utility', tags: ['aoe'], ap: 1, cooldown: 2,
    levels: lv({ r: 2 }, { r: 2 }, { r: 3 }), target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Taunt foes within ' + L.r + ' tiles.'; },
    execute: function (ctx) { ctx.foes.forEach(function (f) { A().addStatus(f, 'taunt', { turns: 1 }, ctx.user); }); } });
  skill({ id: 'test_turret_shot', name: 'Pew', owner: 'summon', icon: '🏹', kind: 'attack', tags: ['ranged'], ap: 1,
    levels: lv({ dmg: 3 }, { dmg: 4 }, { dmg: 5 }), target: { type: 'unit', range: [2, 5], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage at range.'; },
    execute: function (ctx) { shoot(ctx, 'arrow'); if (ctx.targetUnit) A().damage(ctx.user, ctx.targetUnit, ctx.L.dmg); } });

  DD.registerSummon({ id: 'test_hound', name: 'Test Hound', hp: 10, mov: 4, ap: 2, armor: 0, tags: ['beast'],
    names: ['Rex', 'Biscuit Jr.', 'Assertion', 'Good Boy'],
    sprite: spr('quadruped', { skin: '#b07a3a', cloth: '#b07a3a' }, { scale: 0.7, tail: 'dog', head: { ears: 'dog' }, shape: { legs: 'short', snout: 'long', fluff: true } }),
    skills: ['test_hound_bite', 'test_hound_howl'], barks: { spawn: ['Woof!'], death: ['*sad whine*'] }, desc: 'A very good test double.' });
  DD.registerSummon({ id: 'test_turret', name: 'Test Turret', hp: 8, mov: 0, ap: 1, armor: 1, tags: ['construct'], flags: { immovable: true },
    sprite: spr('construct', { metal: '#8899aa' }, { scale: 0.8, shape: { kind: 'totem' } }),
    skills: ['test_turret_shot'], barks: { spawn: ['*whirr*'] }, desc: 'Points at things and says pew.' });

  // ---- enemies (every AI style and anchor) ------------------------------------------------------------
  function enemy(def) {
    def.barks = def.barks || { spawn: ['Test subject reporting.'], attack: ['Assert THIS!'], hurt: ['Ow, my coverage!'], death: ['Test... failed...'] };
    def.desc = def.desc || 'A test enemy. It exists to be defeated, repeatedly.';
    return DD.registerEnemy(def);
  }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }

  eskill({ id: 'test_grunt_stab', name: 'Stab', icon: '🗡️', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 4 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the adjacent tile.'; },
    execute: function (ctx) { melee(ctx); hitAll(ctx, ctx.L.dmg); } });
  eskill({ id: 'test_arrow', name: 'Tracking Arrow', icon: '🏹', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 4 }], target: { type: 'unit', range: [2, 6], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the tracked target.'; },
    execute: function (ctx) { shoot(ctx, 'arrow'); hitAll(ctx, ctx.L.dmg); } });
  eskill({ id: 'test_lob', name: 'Lobbed Rock', icon: '🪨', kind: 'attack', tags: ['aoe'], anchor: 'ground', cooldown: 1,
    levels: [{ dmg: 5 }], target: { type: 'tile', range: [3, 7], filter: 'any', los: false }, area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to everything in radius 1 of the marked tile.'; },
    execute: function (ctx) {
      DD.FX.projectile(ctx.user, ctx.target, { kind: 'rock', arc: true });
      ctx.units.forEach(function (u) { A().damage(ctx.user, u, ctx.L.dmg); });
    } });
  eskill({ id: 'test_mend', name: 'Mend', icon: '💚', kind: 'heal', tags: ['heal'], anchor: 'unit', cooldown: 1,
    levels: [{ heal: 6 }], target: { type: 'unit', range: [0, 4], filter: 'allyOrSelf' },
    desc: function (L) { return 'Heal an ally ' + L.heal + ' HP.'; },
    execute: function (ctx) { if (ctx.targetUnit) A().heal(ctx.user, ctx.targetUnit, ctx.L.heal); } });
  eskill({ id: 'test_poke', name: 'Poke', icon: '👉', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 2 }], target: { type: 'unit', range: [1, 3], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; },
    execute: function (ctx) { hitAll(ctx, ctx.L.dmg); } });
  eskill({ id: 'test_sling', name: 'Sling', icon: '🪃', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 3 }], target: { type: 'unit', range: [2, 4], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage from a safe distance.'; },
    execute: function (ctx) { shoot(ctx, 'rock'); hitAll(ctx, ctx.L.dmg); } });
  eskill({ id: 'test_raise', name: 'Spawn Mock', icon: '🧟', kind: 'summon', tags: ['summon'], anchor: 'ground', cooldown: 2,
    levels: [{ n: 1 }], target: { type: 'tile', range: [1, 2], filter: 'empty' },
    desc: function () { return 'Summon a Test Minion on the marked tile.'; },
    execute: function (ctx) { A().spawn('test_minion', ctx.target.x, ctx.target.y); } });
  eskill({ id: 'test_hex_bolt', name: 'Hex Bolt', icon: '🔮', kind: 'spell', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 3 }], target: { type: 'unit', range: [1, 4], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage and Weaken the target.'; },
    execute: function (ctx) { ctx.foes.forEach(function (f) { A().damage(ctx.user, f, ctx.L.dmg); if (!f.dead && !f.downed) A().addStatus(f, 'weak', { turns: 1 }, ctx.user); }); } });
  eskill({ id: 'test_nibble', name: 'Nibble', icon: '🦷', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 2 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; },
    execute: function (ctx) { melee(ctx); hitAll(ctx, ctx.L.dmg); } });
  eskill({ id: 'test_explode', name: 'Self-Destruct', icon: '💣', kind: 'attack', tags: ['aoe', 'fire'], anchor: 'self',
    levels: [{ dmg: 8 }], target: { type: 'self' }, area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Explode: deal ' + L.dmg + ' fire damage to everything adjacent, then die.'; },
    execute: function (ctx) {
      DD.FX.explosion(ctx.user, { radius: 1 });
      ctx.units.forEach(function (u) { if (u !== ctx.user) A().damage(ctx.user, u, ctx.L.dmg, { element: 'fire' }); });
      if (!ctx.user.dead) A().kill(ctx.user, null, { cause: 'other', text: 'BOOM' });
    } });
  eskill({ id: 'test_smash', name: 'Overhead Smash', icon: '🔨', kind: 'attack', tags: ['melee', 'aoe'], anchor: 'self',
    levels: [{ dmg: 8 }], target: { type: 'dir' }, area: { shape: 'row', size: 1 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the 3 tiles in front.'; },
    execute: function (ctx) { melee(ctx); hitAll(ctx, ctx.L.dmg); } });
  eskill({ id: 'test_sweep', name: 'Sweep', icon: '🌪️', kind: 'attack', tags: ['melee', 'push'], anchor: 'self', cooldown: 2,
    levels: [{ dmg: 5, push: 1 }], target: { type: 'self' }, area: { shape: 'adjacent' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to all adjacent foes and push them ' + L.push + '.'; },
    execute: function (ctx) { ctx.foes.forEach(function (f) { A().damage(ctx.user, f, ctx.L.dmg); if (!f.dead && !f.downed) A().knockback(ctx.user, f, ctx.L.push); }); } });
  eskill({ id: 'test_web_shot', name: 'Web Shot', icon: '🕸️', kind: 'attack', tags: ['ranged'], anchor: 'ground', cooldown: 1,
    levels: [{ dmg: 2 }], target: { type: 'tile', range: [2, 5], filter: 'any' }, area: { shape: 'cross', size: 1 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage in a small cross, Root foes there and leave webs.'; },
    execute: function (ctx) {
      ctx.foes.forEach(function (f) { A().damage(ctx.user, f, ctx.L.dmg); if (!f.dead && !f.downed) A().addStatus(f, 'root', { turns: 1 }, ctx.user); });
      ctx.tiles.forEach(function (p) { A().setSurface(p.x, p.y, 'web', 3); });
    } });

  enemy({ id: 'test_grunt', name: 'Test Grunt', act: 1, tier: 'normal', hp: 14, mov: 3, armor: 0, tags: ['goblin'],
    sprite: spr('humanoid', { skin: '#6fa04a', cloth: '#7a4a2a' }, { build: 'slim', outfit: 'rags', head: { ears: 'goblin' }, mainhand: 'dagger' }),
    skills: ['test_grunt_stab'], ai: 'default', xp: 4, gold: [2, 4] });
  enemy({ id: 'test_archer', name: 'Test Archer', act: 1, tier: 'normal', hp: 10, mov: 3, tags: ['goblin'],
    sprite: spr('humanoid', { skin: '#6fa04a', cloth: '#4a6a2a' }, { build: 'slim', outfit: 'tunic', head: { ears: 'goblin', hat: 'hood' }, mainhand: 'bow' }),
    skills: ['test_arrow'], ai: { style: 'ranged', keepDistance: 3 }, xp: 4, gold: [2, 4] });
  enemy({ id: 'test_mortar', name: 'Test Mortar', act: 2, tier: 'normal', hp: 12, mov: 2, tags: ['kobold'],
    sprite: spr('humanoid', { skin: '#b5651d', cloth: '#555555' }, { build: 'tiny', outfit: 'armor', head: { hat: 'helmet' } }),
    skills: ['test_lob'], ai: { style: 'ranged', keepDistance: 4 }, xp: 5, gold: [2, 5] });
  enemy({ id: 'test_healer', name: 'Test Medic', act: 1, tier: 'normal', hp: 12, mov: 3, tags: ['kobold'],
    sprite: spr('humanoid', { skin: '#b5651d', cloth: '#ffffff', cloth2: '#d03030' }, { build: 'tiny', outfit: 'robe', head: { hat: 'beret' }, mainhand: 'flask' }),
    skills: ['test_mend', 'test_poke'], ai: { style: 'support' }, xp: 5, gold: [3, 5] });
  enemy({ id: 'test_coward', name: 'Test Coward', act: 1, tier: 'minion', hp: 7, mov: 4, init: 3, tags: ['goblin'],
    sprite: spr('humanoid', { skin: '#6fa04a', cloth: '#888866' }, { build: 'tiny', outfit: 'rags', head: { ears: 'goblin', eyes: 'big' } }),
    skills: ['test_sling'], ai: { style: 'coward' }, xp: 2, gold: [1, 2] });
  enemy({ id: 'test_summoner_foe', name: 'Test Necromancer', act: 2, tier: 'normal', hp: 14, mov: 3, tags: ['human'],
    sprite: spr('humanoid', { skin: '#d8c8b8', cloth: '#2a1a3a' }, { outfit: 'robe', head: { hat: 'hood', eyes: 'glow' }, mainhand: 'staff', aura: { kind: 'smoke', color: '#6a3a8a' } }),
    skills: ['test_raise', 'test_hex_bolt'], ai: { style: 'summoner', keepDistance: 3 }, xp: 6, gold: [3, 6] });
  enemy({ id: 'test_minion', name: 'Test Minion', act: 1, tier: 'minion', hp: 6, mov: 3, tags: ['undead'],
    sprite: spr('humanoid', { skin: '#e8e2cf', cloth: '#444444' }, { build: 'tiny', outfit: 'none', head: { face: 'skull' } }),
    skills: ['test_nibble'], ai: 'default', xp: 1, gold: [0, 1] });
  enemy({ id: 'test_bomber', name: 'Test Bomber', act: 3, tier: 'normal', hp: 8, mov: 4, init: -2, tags: ['construct'],
    sprite: spr('blob', { skin: '#cc3333', cloth: '#cc3333' }, { scale: 0.8, shape: { wobble: 1.5 }, aura: { kind: 'flames', color: '#ff8a1a' } }),
    skills: ['test_explode'], ai: { style: 'kamikaze' }, xp: 3, gold: [1, 3],
    barks: { spawn: ['Tick tock.'], attack: ['KABOOM TIME!'], hurt: ['Careful, I\'m volatile!'], death: ['Fizzle.'] } });
  enemy({ id: 'test_web_spinner', name: 'Test Spider', act: 2, tier: 'normal', hp: 11, mov: 4, tags: ['beast'],
    sprite: spr('quadruped', { skin: '#333333', cloth: '#333333', eye: '#ff3030' }, { scale: 0.9, shape: { legs: 'long', body: 'round' } }),
    skills: ['test_web_shot'], ai: 'default', xp: 4, gold: [2, 4] });
  enemy({ id: 'test_brute', name: 'Test Brute', act: 1, tier: 'elite', hp: 50, mov: 3, armor: 1, tags: ['ogre'],
    flags: { immovable: true, large: true },
    sprite: spr('humanoid', { skin: '#8a9a6a', cloth: '#5a3a2a' }, { scale: 1.3, build: 'huge', outfit: 'furs', head: { mouth: 'tusks' }, mainhand: 'club' }),
    skills: ['test_smash', 'test_sweep'], ai: { style: 'melee' }, xp: 12, gold: [8, 12] });

  // ---- the boss: custom planner, a wound-up meteor, phase change at 50% -------------------------------------
  eskill({ id: 'test_boss_slam', name: 'Assertion Slam', icon: '👊', kind: 'attack', tags: ['melee', 'push'], anchor: 'self',
    levels: [{ dmg: 10 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the adjacent tile and push 1.'; },
    execute: function (ctx) {
      melee(ctx);
      ctx.foes.forEach(function (f) { A().damage(ctx.user, f, ctx.L.dmg); if (!f.dead && !f.downed) A().push(ctx.user, f, ctx.dir, 1); });
    } });
  eskill({ id: 'test_boss_meteor', name: 'Meteor of Regression', icon: '☄️', kind: 'spell', tags: ['fire', 'aoe'], anchor: 'ground', cooldown: 2,
    levels: [{ dmg: 14 }], target: { type: 'tile', range: [0, 12], filter: 'any', los: false }, area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Wind-up (lands at the start of its next turn): deal ' + L.dmg + ' fire damage to everything in radius 1 and set it ablaze.'; },
    execute: function (ctx) {
      DD.FX.explosion(ctx.target, { radius: 1, color: '#ff5a1f' });
      DD.FX.shake(10, 400);
      ctx.units.forEach(function (u) { A().damage(ctx.user, u, ctx.L.dmg, { element: 'fire' }); });
      ctx.tiles.forEach(function (p) { A().setSurface(p.x, p.y, 'fire', 2); });
    } });
  eskill({ id: 'test_boss_summon', name: 'Spin Up Workers', icon: '👥', kind: 'summon', tags: ['summon'], anchor: 'self', cooldown: 3,
    levels: [{ n: 2 }], target: { type: 'self' },
    desc: function (L) { return 'Summon ' + L.n + ' Test Minions nearby.'; },
    execute: function (ctx) {
      DD.Grid.emptyTilesNear(ctx.user.x, ctx.user.y, 2).filter(function (p) { return !DD.Grid.isDrop(p.x, p.y); }).slice(0, ctx.L.n)
        .forEach(function (p) { A().spawn('test_minion', p.x, p.y); });
    } });
  eskill({ id: 'test_boss_rage', name: 'Integration Rage', icon: '😡', kind: 'buff', tags: [], anchor: 'self', charges: 1,
    levels: [{ heal: 10 }], target: { type: 'self' },
    desc: function (L) { return 'Heal ' + L.heal + ' HP and become Inspired for 2 turns.'; },
    execute: function (ctx) { A().heal(ctx.user, ctx.user, ctx.L.heal); A().addStatus(ctx.user, 'inspired', { turns: 2 }, ctx.user); } });

  /** v2 planner: it acts on its turn (api.act), and its Meteor is a WIND-UP that lands at the start of its next turn. */
  function bossPlan(unit, api) {
    const d = unit.data;
    if (!d.phase) d.phase = 1;
    if (d.phase === 1 && unit.hp <= unit.maxHp * 0.5) {
      d.phase = 2;
      DD.Act.log('The Test Overlord enters PHASE 2: Integration Hell!', 'enemy');
      DD.Act.bark(unit, 'phase');
      DD.FX.banner('PHASE 2', { sub: 'Integration Hell' });
      if (api.canUse(unit, 'test_boss_rage')) api.act(unit, 'test_boss_rage', unit, { anchor: 'self' });
    }
    const foes = api.foes(unit);
    if (!foes.length) return;
    const weakest = foes.slice().sort(function (a, b) { return a.hp - b.hp; })[0];
    const charging = unit.intents.some(function (i) { return i.skillId === 'test_boss_meteor'; });
    if (!charging && api.canUse(unit, 'test_boss_meteor')) api.windUp(unit, 'test_boss_meteor', weakest, { label: 'Meteor of Regression' });
    if (d.phase === 2 && api.canUse(unit, 'test_boss_summon')) api.act(unit, 'test_boss_summon', unit, { anchor: 'self' });
    const best = api.bestAttack(unit, { skills: ['test_boss_slam'] });
    if (best) {
      api.moveTo(unit, best.moveTo.x, best.moveTo.y);
      if (api.dist(unit, best.target) === 1) api.act(unit, 'test_boss_slam', best.target, {});
      return;
    }
    let goal = null, gd = Infinity;
    api.reachable(unit).forEach(function (e) { const dd = api.dist(e, weakest); if (dd < gd) { gd = dd; goal = e; } });
    if (goal && gd < api.dist(unit, weakest)) api.moveTo(unit, goal.x, goal.y);
  }

  enemy({ id: 'test_boss', name: 'The Test Overlord', act: 1, tier: 'boss', hp: 120, mov: 3, armor: 1, tags: ['boss'],
    flags: { large: true }, resist: { fire: 0.5 },
    sprite: spr('humanoid', { skin: '#7a2a2a', cloth: '#2a2a2a', metal: '#ffd700', eye: '#ffef5a' }, { scale: 1.9, build: 'huge', outfit: 'armor',
      head: { horns: 'demon', hat: 'crown', eyes: 'glow' }, mainhand: 'greatsword', aura: { kind: 'flames', color: '#ff5a1f' } }),
    skills: ['test_boss_slam', 'test_boss_meteor', 'test_boss_summon', 'test_boss_rage'], ai: bossPlan, xp: 40, gold: [30, 40],
    boss: { title: 'Lord of the Red Builds', intro: 'The Test Overlord cracks its knuckles. "Your build is BROKEN."', music: null },
    barks: { spawn: ['Your build is BROKEN.'], attack: ['FAIL!'], hurt: ['A minor regression.'], death: ['All... tests... pass...'], phase: ['INTEGRATION HELL!'] },
    desc: 'The final assertion. It has never been green.' });

  // ---- encounters (every act × kind, plus objective variants) -----------------------------------------------
  const THEMES = { 1: ['cellar', 'sewer', 'warren'], 2: ['hauntwood', 'academy', 'graveyard'], 3: ['hellscape', 'hoard', 'dm_table'] };
  function enc(def) { def.weight = def.weight || 1; return DD.registerEncounter(def); }
  [1, 2, 3].forEach(function (act) {
    const th = THEMES[act];
    const normal = {
      1: [{ id: 'test_grunt', n: 2 }, { id: 'test_archer', n: 1 }, { id: 'test_healer', n: 1 }],
      2: [{ id: 'test_grunt', n: 1 }, { id: 'test_mortar', n: 1 }, { id: 'test_summoner_foe', n: 1 }, { id: 'test_coward', n: 1 }],
      3: [{ id: 'test_bomber', n: 2 }, { id: 'test_archer', n: 1 }, { id: 'test_web_spinner', n: 1 }],
    }[act];
    enc({ id: 'test_a' + act + '_normal', act: act, kind: 'normal', name: 'Test Skirmish ' + act, intro: 'A wild test case appears!',
      map: { theme: th[0], w: 9, h: 9, features: [], density: 1 }, enemies: normal, objective: { type: 'killAll' }, reward: { goldMult: 1 } });
    enc({ id: 'test_a' + act + '_elite', act: act, kind: 'elite', name: 'Test Brute Squad ' + act, intro: 'Something large clears its throat.',
      map: { theme: th[1], w: 10, h: 9, features: [], density: 1 },
      enemies: [{ id: 'test_brute', n: 1 }, { id: 'test_minion', n: [1, 2] }],
      reinforcements: [{ round: 3, enemies: [{ id: 'test_minion', n: 2 }], edge: 'N' }],
      objective: { type: 'killAll' }, reward: { goldMult: 1, itemRarity: 'rare' } });
    enc({ id: 'test_a' + act + '_boss', act: act, kind: 'boss', name: 'The Test Overlord (Act ' + act + ')', intro: 'The final assertion awaits.',
      map: { theme: th[2], w: 11, h: 10, features: [], density: 1 },
      enemies: [{ id: 'test_boss', n: 1 }, { id: 'test_minion', n: 1 }], objective: { type: 'boss' }, reward: { goldMult: 1, itemRarity: 'legendary' } });
  });
  enc({ id: 'test_a1_totems', act: 1, kind: 'normal', name: 'Test Totems', intro: 'Smash the totems before they finish compiling.', weight: 0.2,
    map: { theme: 'cellar', layout: [
      '..........',
      '.H.....E..',
      '.H..K...E.',
      '.H........',
      '.H...K....',
      '..........',
      '..........'], legend: { K: { obj: 'totem' } } },
    enemies: [{ id: 'test_grunt', n: 2 }], objective: { type: 'destroy', objId: 'totem', count: 2 } });
  enc({ id: 'test_a2_keg', act: 2, kind: 'normal', name: 'Protect the Test Keg', intro: 'Protect the Last Keg. It is load-bearing.', weight: 0.2,
    map: { theme: 'cellar', layout: [
      '.........',
      '.H.....E.',
      '.HK......',
      '.H.....E.',
      '.H.......',
      '.........'], legend: { K: { obj: 'keg' } } },
    enemies: [{ id: 'test_grunt', n: 1 }, { id: 'test_archer', n: 1 }], objective: { type: 'protect', objId: 'keg' } });
  enc({ id: 'test_a3_survive', act: 3, kind: 'normal', name: 'Hold the Test Line', intro: 'Survive until the build finishes.', weight: 0.2,
    map: { theme: 'hellscape', w: 9, h: 9, features: [], density: 1 },
    enemies: [{ id: 'test_grunt', n: 2 }], objective: { type: 'survive', rounds: 3 },
    reinforcements: [{ round: 2, enemies: [{ id: 'test_minion', n: 2 }], edge: 'E' }] });

  // ---- consumables & items (exercise the item hook source and the consumable flow) ----------------------
  DD.registerConsumable({ id: 'test_potion', name: 'Test Potion', icon: '🧪', rarity: 'common', ap: 1,
    target: { type: 'unit', range: [0, 1], filter: 'allyOrSelf' }, area: { shape: 'single' },
    desc: 'Heal an adjacent ally or yourself for 10 HP.', flavor: 'Tastes like a passing test.',
    execute: function (ctx) { if (ctx.targetUnit) A().heal(ctx.user, ctx.targetUnit, 10); } });
  DD.registerConsumable({ id: 'test_firebomb', name: 'Test Firebomb', icon: '💣', rarity: 'rare', ap: 1,
    target: { type: 'tile', range: [1, 4], filter: 'any', los: true }, area: { shape: 'circle', size: 1 },
    desc: 'Deal 6 fire damage to everything in radius 1 and ignite it.', flavor: 'Integration test, literally.',
    execute: function (ctx) {
      DD.FX.explosion(ctx.target, { radius: 1 });
      ctx.units.forEach(function (u) { A().damage(ctx.user, u, 6, { element: 'fire' }); });
      ctx.tiles.forEach(function (p) { A().applyElement(p.x, p.y, 'fire', ctx.user, { noUnits: true }); });
    } });
  DD.registerItem({ id: 'test_sword', name: 'Sword of Testing', slot: 'weapon', rarity: 'common', icon: '🗡️',
    stats: { dmg: 0.1 }, desc: '+10% damage. Kills give +5 Hype.', flavor: 'Sharp, reproducible.',
    hooks: { onKill: function () { DD.Act.gainHype(5, 'Sword of Testing'); } } });
  DD.registerItem({ id: 'test_plate', name: 'Plate of Mocking', slot: 'armor', rarity: 'rare', icon: '🛡️',
    stats: { hp: 6, armor: 1, init: -1 }, desc: '+6 max HP, +1 armor, −1 initiative.', flavor: 'Mocks every blow. Slowly.' });
  DD.registerItem({ id: 'test_charm', name: 'Charm of Coverage', slot: 'trinket', rarity: 'legendary', icon: '📿',
    stats: { range: 1, hype: 10 }, desc: '+1 range to ranged skills, +10 Hype at combat start, +1 Block at the start of each of your turns.',
    flavor: 'Covers everything except the important bits.',
    hooks: { onTurnStart: function (unit) { DD.Act.addBlock(unit, 1); } } });
  DD.registerItem({ id: 'test_cursed_hat', name: 'Cursed Hat of Flakiness', slot: 'trinket', rarity: 'cursed', icon: '🎩', hero: 'test_mage',
    stats: { dmg: 0.25, hp: -4 }, desc: '+25% damage, -4 max HP, take +1 damage from every hit.', flavor: 'Passes on Tuesdays.',
    hooks: { modifyIncomingDamage: function (d) { d.flat += 1; } } });
})();
