/* Dungeons and Degenerates — tests/content/passives.js
 * Suites 'passive-table: …' for js/data/passives.js (the Table of Questionable Blessings): a validator for every
 * registered rp_* entry, one sandbox spec per entry proving that each level does exactly what its desc says
 * (forced RNG for every proc branch + statistics over many trials for the odds), stats / runMods / requires checks,
 * HUD previews with passives on, and AutoPlay fights with random 4-passive loadouts at levels 1/4/7/10.
 * Uses the test_ fixtures (tests/fixtures.js); works in isolation (?isolate=data/passives,content/passives).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  const RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'cursed'];
  const HOOKS = ['onCombatStart', 'onCombatEnd', 'onRoundStart', 'onTurnStart', 'onTurnEnd', 'onMove', 'onEnterTile', 'onSkillUsed',
    'modifyCost', 'modifyRange', 'modifyOutgoingDamage', 'modifyIncomingDamage', 'onDealDamage', 'onTakeDamage', 'onKill', 'onDeath',
    'onDowned', 'onHealed', 'onStatusApplied', 'onAllyDeath', 'modifyStatus', 'modifyPush'];
  const STAT_KEYS = ['hp', 'ap', 'mov', 'armor', 'dmg', 'heal', 'range', 'block', 'hype'];
  const MOD_KEYS = ['gold', 'xp', 'price', 'heal'];
  const FIXTURE_HEROES = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue', 'test_summoner'];

  // ---- helpers ------------------------------------------------------------------------------------
  function rpIds(rarity) {
    return Object.keys(DD.defs.passives).filter(function (k) {
      return k.indexOf('rp_') === 0 && (!rarity || DD.defs.passives[k].rarity === rarity);
    }).sort();
  }
  function badText(s) { return typeof s !== 'string' || !s.trim() || /undefined|NaN|\[object /.test(s); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function quiet(cfg) {
    return DD.Combat.sandbox(Object.assign({ w: 9, h: 9, seed: 7, noPlan: true, objective: { type: 'custom', text: 'Testing' },
      encounter: { id: 'pt_quiet', checkObjective: function () { return null; } } }, cfg || {}));
  }
  /** Standard arena: the hero (passive id at level lv) at (1,4); foes default to an adjacent grunt (2,4) and a far one (7,7). */
  function arena(id, lv, cfg) {
    cfg = cfg || {};
    const me = Object.assign({ id: 'test_knight', x: 1, y: 4, passives: id ? [{ id: id, level: lv }] : [] }, cfg.me || {});
    const s = quiet(Object.assign({
      heroes: [me].concat(cfg.allies || []),
      enemies: cfg.enemies || [{ id: 'test_grunt', x: 2, y: 4, hpMult: cfg.hpMult }, { id: 'test_grunt', x: 7, y: 7, hpMult: cfg.hpMult }],
    }, cfg.sb || {}));
    const hero = DD.Combat.heroes()[0];
    return { s: s, me: hero, p: instOf(hero, id), foe: DD.Combat.enemies()[0], far: DD.Combat.enemies()[1] };
  }
  function instOf(u, id) { return (u && (u.passives || []).filter(function (p) { return p.id === id; })[0]) || null; }
  function bare(u) { u.armor = 0; u.block = 0; return u; }
  function full(u) { u.hp = u.maxHp; return u; }
  function hit(src, tgt, n, opts) { return DD.Act.damage(src, tgt, n, Object.assign({ cause: 'skill' }, opts || {})); }
  function lost(u, fn) { const h = u.hp; fn(); return h - u.hp; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id) || {}; }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  /** Every roll on the current combat RNG returns v while fn runs (0: every proc fires · 0.999: none does). */
  function forced(v, fn) {
    const r = DD.Combat.state.rng, orig = r.next;
    r.next = function () { return v; };
    try { return fn(); } finally { r.next = orig; }
  }
  /** Call one hook of a passive instance directly: fire(p, 'onTurnStart', unit). */
  function fire(p, name) {
    const args = Array.prototype.slice.call(arguments, 2).concat([p]);
    return p.def.hooks[name].apply(p.def.hooks, args);
  }
  function summonsOf(u, defId) {
    return DD.Combat.state.units.filter(function (o) { return !o.dead && o.kind === 'summon' && o.ownerId === u.id && (!defId || o.defId === defId); });
  }
  function enemiesOf(defId) { return DD.Combat.state.units.filter(function (o) { return !o.dead && o.side === 'enemy' && o.defId === defId; }); }
  /** Observed rate vs the promised percentage, with a tolerance of 4.5 sigma (min 2.5 points). */
  function rate(t, n, total, pct, label) {
    const p = pct / 100;
    const tol = Math.max(0.025, 4.5 * Math.sqrt(p * (1 - p) / total));
    const r = n / total;
    t.ok(Math.abs(r - p) <= tol, label + ': ' + (100 * r).toFixed(1) + '% of ' + total + ' trials (promised ' + pct + '% ± ' + (100 * tol).toFixed(1) + ')');
  }
  /** Swap DD.WildMagic.surge for a recorder while fn runs; returns the opts of every call. */
  function surgeCalls(fn) {
    const WM = DD.WildMagic, orig = WM.surge, calls = [];
    WM.surge = function (u, o) { calls.push(o || {}); return null; };
    try { fn(); } finally { WM.surge = orig; }
    return calls;
  }
  function fakeRun(extra) { return Object.assign({ act: 1, gold: 0, consumables: [], maxConsumables: 3, difficulty: 'normal', party: [] }, extra || {}); }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (s) { return s.id === id; })[0]; }

  /** Unit fields with the passive minus without it (level-3 hero), against the numbers the desc promises. */
  function unitDelta(t, id, lv, expect, tag, heroId) {
    const fields = ['maxHp', 'armor', 'maxAp', 'mov', 'dmgBonus', 'healBonus', 'rangeBonus', 'hypeBonus'];
    function unit(passives) {
      quiet({ heroes: [{ id: heroId || 'test_knight', x: 1, y: 4, level: 3, passives: passives }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
      return DD.Combat.heroes()[0];
    }
    const a = unit([]), b = unit([{ id: id, level: lv }]);
    fields.forEach(function (f) {
      const want = expect[f] || 0;
      const got = (b[f] || 0) - (a[f] || 0);
      t.ok(Math.abs(got - want) < 1e-6, tag + ': ' + f + ' ' + (want >= 0 ? '+' : '') + want + ' (got ' + got + ')');
    });
  }
  /** runMods exactly as promised (and through DD.Passives when the run layer is loaded). */
  function modCheck(t, id, lv, expect, tag) {
    const def = DD.getPassive(id);
    const m = def.runMods(DD.skillLevel(def, lv), lv) || {};
    MOD_KEYS.forEach(function (k) {
      t.ok(Math.abs((m[k] || 0) - (expect[k] || 0)) < 1e-9, tag + ': runMods.' + k + ' = ' + (expect[k] || 0) + ' (got ' + m[k] + ')');
    });
    if (DD.Passives && typeof DD.Passives.mods === 'function') {
      const pm = DD.Passives.mods({ id: id, level: lv });
      MOD_KEYS.forEach(function (k) { t.ok(Math.abs((pm[k] || 0) - (expect[k] || 0)) < 1e-9, tag + ': DD.Passives.mods.' + k); });
      const party = [{ id: 'test_knight', passives: [{ id: id, level: lv }] }, { id: 'test_mage', passives: [] }];
      const run = { party: party };
      if (expect.gold) t.ok(Math.abs(DD.Passives.goldMult(run) - (1 + expect.gold)) < 1e-9, tag + ': party gold income ×' + (1 + expect.gold));
      if (expect.price) t.ok(Math.abs(DD.Passives.priceMult(run) - Math.max(0.5, 1 + expect.price)) < 1e-9, tag + ': shop prices ×' + (1 + expect.price));
      if (expect.xp) t.ok(Math.abs(DD.Passives.xpMult(party[0]) - (1 + expect.xp)) < 1e-9, tag + ': XP ×' + (1 + expect.xp));
      if (expect.heal) t.ok(Math.abs(DD.Passives.healMult(party[0]) - (1 + expect.heal)) < 1e-9, tag + ': healing ×' + (1 + expect.heal));
      party[0].dead = true;
      t.ok(DD.Passives.goldMult(run) === 1 && DD.Passives.priceMult(run) === 1, tag + ': a dead hero gives nothing');
    }
  }
  function modSpec(expectFn) { return function (t, lv, L, tag, id) { modCheck(t, id, lv, expectFn(L), tag); }; }
  function requiresCheck(t, id, yes, no, tag) {
    const def = DD.getPassive(id);
    yes.forEach(function (c) { t.ok(def.requires(c[0], c[1]) === true, tag + ': eligible — ' + c[2]); });
    no.forEach(function (c) { t.ok(def.requires(c[0], c[1]) === false, tag + ': not eligible — ' + c[2]); });
  }
  function rh(id) { return DD.Combat.makeRunHero({ id: id }); }
  function heroCase(id) { return [rh(id), DD.getHero(id), id]; }
  /** Walk n tiles (≤ 3 per move action, back and forth along the unit's row; AP topped up). Returns the tiles walked. */
  function walkTiles(u, n) {
    let walked = 0, dir = u.x <= 4 ? 1 : -1;
    for (let guard = 0; walked < n && guard < 20; guard++) {
      const k = Math.min(3, n - walked);
      u.ap = Math.max(u.ap, 2);
      const x = u.x + dir * k;
      if (x < 0 || x > 7 || !DD.Combat.move(u, x, u.y)) { dir = -dir; continue; }
      walked += k;
      dir = -dir;
    }
    return walked;
  }

  // ---- one spec per entry: (t, level, L, tag, id) ---------------------------------------------------------
  const SPECS = {
    // ---------------------------------------------------------------- common
    rp_lucky_socks: function (t, lv, L, tag) {
      const a = arena('rp_lucky_socks', lv, { hpMult: 30 });
      bare(a.foe);
      t.eq(lost(a.foe, function () { forced(0, function () { hit(a.me, a.foe, 10); }); }), 15, tag + ': a lucky hit deals +50% (10 → 15)');
      t.eq(lost(a.foe, function () { forced(0.999, function () { hit(a.me, a.foe, 10); }); }), 10, tag + ': an unlucky one deals 10');
      t.eq(lost(a.foe, function () { forced(0, function () { hit(a.me, a.foe, 10, { cause: 'other' }); }); }), 10, tag + ': only skill hits roll');
      let procs = 0;
      for (let i = 0; i < 1500; i++) { full(a.foe); if (lost(a.foe, function () { hit(a.me, a.foe, 10); }) === 15) procs++; }
      rate(t, procs, 1500, L.pct, tag + ' proc rate');
    },
    rp_thick_skull: function (t, lv, L, tag, id) { unitDelta(t, id, lv, { armor: L.armor, maxHp: L.hp || 0 }, tag); },
    rp_big_boned: function (t, lv, L, tag, id) { unitDelta(t, id, lv, { maxHp: L.hp }, tag); },
    rp_muscle_tank_top: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { dmgBonus: L.pct / 100 }, tag);
      const a = arena(id, lv, { hpMult: 5 });
      bare(a.foe);
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 20); }), Math.round(20 * (1 + L.pct / 100)), tag + ': a 20 hit deals +' + L.pct + '%');
    },
    rp_participation_trophy: function (t, lv, L, tag) {
      function fight(killer) {
        DD.Combat.sandbox({ w: 9, h: 9, seed: 7, noPlan: true, enemies: [{ id: 'test_grunt', x: 5, y: 5 }],
          heroes: [{ id: 'test_knight', x: 1, y: 4, passives: [{ id: 'rp_participation_trophy', level: lv }] }, { id: 'test_mage', x: 1, y: 6 }] });
        const s = DD.Combat.state;
        DD.Combat._action(function () { DD.Act.kill(DD.Combat.enemies()[0], DD.Combat.heroes()[killer]); });
        return s;
      }
      let s = fight(1);
      t.ok(s.result === 'victory' && s.sandboxGold === L.gold, tag + ': won without a kill of your own → +' + L.gold + ' gold (got ' + s.sandboxGold + ')');
      s = fight(0);
      t.ok(s.result === 'victory' && s.sandboxGold === 0, tag + ': you scored a kill → no trophy');
    },
    rp_coin_magnet: function (t, lv, L, tag) {
      const a = arena('rp_coin_magnet', lv, { allies: [{ id: 'test_mage', x: 1, y: 6 }] });
      DD.Act.kill(a.foe, a.me);
      t.eq(a.s.sandboxGold, L.gold, tag + ': your kill → +' + L.gold + ' gold');
      DD.Act.kill(a.far, DD.Combat.heroes()[1]);
      t.eq(a.s.sandboxGold, L.gold, tag + ": an ally's kill → nothing");
    },
    rp_pet_rock: function (t, lv, L, tag) {
      const a = arena('rp_pet_rock', lv, { enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }] });
      function rocks() { return DD.Grid.allTiles().filter(function (tl) { return tl.obj && tl.obj.label === 'Rocky'; }); }
      // noPlan only skips the first planning: the grunts are kept from swinging
      function endTurn() { DD.Combat.endTurn(); DD.Combat.enemies().forEach(function (e) { e.intents = []; }); }
      const u = a.me, o = tile(1, 3).obj;
      t.ok(o && o.id === 'rock' && o.label === 'Rocky' && o.hp === 10 && o.maxHp === 10, tag + ': Rocky (10 HP) appears beside the hero (north; the nearest foe is east)');
      t.ok(!tile(2, 4).obj, tag + ': not between the hero and the nearest foe');
      t.ok(!DD.Grid.blocksLos(1, 3) && DD.Grid.isWalkable(1, 3), tag + ': Rocky blocks nothing (not sight, not movement)');
      t.eq(u.block, 3 + L.block, tag + ': round 1 Block = 3 (Overly Prepared) + ' + L.block + ' (Rocky)');
      endTurn();
      t.eq(u.block, L.block, tag + ': round 2 Block from Rocky: ' + L.block);
      t.ok(DD.Act.damageObject(null, 1, 3, 4) === false && tile(1, 3).obj.hp === 6, tag + ': Rocky takes a 4-damage hit (6/10 HP)');
      t.ok(DD.Combat.move(u, 1, 7), tag + ': the hero wanders off');
      t.ok(tile(1, 3).obj && tile(1, 3).obj.label === 'Rocky', tag + ': Rocky stays put while you watch (he is a rock)');
      endTurn();
      const r = rocks();
      t.ok(r.length === 1 && dist(r[0], u) === 1, tag + ': next turn he is somehow beside you again (at ' + (r[0] && r[0].x) + ',' + (r[0] && r[0].y) + ')');
      t.ok(r.length === 1 && r[0].obj.hp === 6 && r[0].obj.maxHp === 10, tag + ': the very same Rocky (6/10 HP)');
      t.ok(!tile(1, 3).obj, tag + ': and his old spot is empty');
      t.eq(u.block, L.block, tag + ': +' + L.block + ' Block');
      endTurn();
      t.ok(rocks().length === 1 && rocks()[0] === r[0] && u.block === L.block, tag + ': already beside you: he stays put, Block again');
      const pup = DD.Act.summon(u, 'test_hound', r[0].x, r[0].y, { noFx: true });
      t.ok(!!pup && pup.x === r[0].x && pup.y === r[0].y, tag + ': a hound sits on Rocky (he blocks nothing)');
      endTurn();
      const r2 = rocks();
      t.ok(r2.length === 1 && dist(r2[0], u) === 1 && !DD.Grid.unitAt(r2[0].x, r2[0].y) && u.block === L.block,
        tag + ': next turn Rocky has slid out from under it, still beside you (+' + L.block + ' Block)');
      DD.Act.kill(pup, null);
      r[0] = r2[0];
      DD.Act.damageObject(null, r[0].x, r[0].y, 99);
      endTurn();
      t.ok(!rocks().length && u.block === 0, tag + ': a smashed Rocky stays smashed: no more Block');
      quiet({ heroes: [{ id: 'test_knight', x: 4, y: 4, passives: [{ id: 'rp_pet_rock', level: lv }] }, { id: 'test_mage', x: 4, y: 2 }],
        enemies: [{ id: 'test_grunt', x: 8, y: 4 }] });
      t.ok(tile(4, 5).obj && tile(4, 5).obj.label === 'Rocky', tag + ': he picks the side away from other allies');
      quiet({ heroes: [{ id: 'test_knight', x: 1, y: 4, passives: [{ id: 'rp_pet_rock', level: lv }] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }],
        objects: [{ x: 1, y: 3, id: 'crate' }, { x: 1, y: 5, id: 'crate' }] });
      t.ok(tile(0, 4).obj && tile(0, 4).obj.label === 'Rocky', tag + ': both sides taken → Rocky sits behind you');
      quiet({ heroes: [{ id: 'test_knight', x: 1, y: 4, passives: [{ id: 'rp_pet_rock', level: lv }] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }],
        objects: [{ x: 1, y: 3, id: 'crate' }, { x: 1, y: 5, id: 'crate' }, { x: 0, y: 4, id: 'crate' }] });
      t.ok(tile(2, 4).obj && tile(2, 4).obj.label === 'Rocky', tag + ': boxed in → in front, as a last resort');
      quiet({ heroes: [{ id: 'test_knight', x: 1, y: 4, passives: [{ id: 'rp_pet_rock', level: lv }] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }],
        objects: [{ x: 1, y: 3, id: 'crate' }, { x: 1, y: 5, id: 'crate' }, { x: 0, y: 4, id: 'crate' }, { x: 2, y: 4, id: 'crate' }] });
      t.ok(!rocks().length && DD.Combat.heroes()[0].block === 3, tag + ': no room at all → Rocky stays home (no Block)');
      // two pet rocks in one party: each holder only ever moves (and gets Block from) his own Rocky
      quiet({ heroes: [{ id: 'test_knight', x: 1, y: 4, passives: [{ id: 'rp_pet_rock', level: lv }] }, { id: 'test_mage', x: 5, y: 4, passives: [{ id: 'rp_pet_rock', level: lv }] }],
        enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const two = DD.Combat.heroes(), pa = instOf(two[0], 'rp_pet_rock'), pb = instOf(two[1], 'rp_pet_rock');
      DD.Combat.enemies()[0].mov = 0;
      t.ok(rocks().length === 2 && dist(pa.data.rock, two[0]) === 1 && dist(pb.data.rock, two[1]) === 1, tag + ': two holders, two Rockies, one each');
      const spotA = pa.data.rock;
      DD.Act.damageObject(null, spotA.x, spotA.y, 99);                     // the knight's Rocky is gravel...
      const moved = DD.Act.removeObject(pb.data.rock.x, pb.data.rock.y);   // ...and the mage's turns up on that very spot
      DD.Act.placeObject(spotA.x, spotA.y, 'rock', moved);
      pb.data.rock = { x: spotA.x, y: spotA.y };
      endTurn();
      const r3 = rocks();
      t.ok(r3.length === 1 && dist(r3[0], two[1]) === 1 && two[0].block === 0 && two[1].block === L.block,
        tag + ': nobody adopts the other holder\'s Rocky (only the mage gets ' + L.block + ' Block; knight ' + two[0].block + ', mage ' + two[1].block + ')');
    },
    rp_snack_pouch: function (t, lv, L, tag) {
      const a = arena('rp_snack_pouch', lv);
      const u = bare(a.me);
      hit(a.foe, u, u.maxHp - 15);
      t.eq(u.hp, Math.min(u.maxHp, 15 + L.heal), tag + ': dropping below 50% (to 15/' + u.maxHp + ') heals ' + L.heal);
      const h = u.hp;
      hit(a.foe, u, 3);
      t.eq(u.hp, h - 3, tag + ': only once per fight');
      const b = arena('rp_snack_pouch', lv);
      bare(b.me);
      hit(b.foe, b.me, 999);
      t.ok(b.me.downed && b.me.hp === 0, tag + ': a downing hit is not snack time');
    },
    rp_spicy_blood: function (t, lv, L, tag) {
      const a = arena('rp_spicy_blood', lv);
      hit(a.foe, a.me, 4);
      t.eq(st(a.foe, 'burn').stacks, L.burn, tag + ': the adjacent attacker gains Burn ' + L.burn);
      hit(a.far, a.me, 4);
      t.ok(!has(a.far, 'burn'), tag + ': a distant attacker does not');
      DD.Act.removeStatus(a.foe, 'burn', { silent: true });
      hit(a.foe, a.me, 4, { cause: 'other' });
      t.ok(!has(a.foe, 'burn'), tag + ': only skill hits');
      DD.Act.addStatus(a.foe, 'wet', { turns: 2 }, null);
      hit(a.foe, a.me, 4);
      t.ok(!has(a.foe, 'burn'), tag + ': Wet attackers just sizzle');
    },
    rp_allergic_to_goblins: function (t, lv, L, tag) {
      const a = arena('rp_allergic_to_goblins', lv, { enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_minion', x: 1, y: 5 }] });
      const gob = bare(a.foe), undead = bare(a.far);
      bare(a.me);
      t.eq(lost(gob, function () { hit(a.me, gob, 5); }), 5 + L.dmg, tag + ': goblins take +' + L.dmg);
      t.eq(lost(undead, function () { hit(a.me, undead, 5); }), 5, tag + ': other foes take 5');
      t.eq(lost(a.me, function () { hit(gob, a.me, 6); }), 6 - L.less, tag + ': goblin hits on you deal ' + (6 - L.less));
      undead.tags = ['goblinoid', 'bugbear'];
      undead.maxHp = 40;
      full(undead);
      t.eq(lost(undead, function () { hit(a.me, undead, 5); }), 5 + L.dmg, tag + ': goblinoids (bugbears) count too');
      undead.tags = ['kobold'];
      full(undead);
      t.eq(lost(undead, function () { hit(a.me, undead, 5); }), 5 + L.dmg, tag + ': and kobolds');
    },
    rp_main_character: function (t, lv, L, tag) {
      const a = arena('rp_main_character', lv, { allies: [{ id: 'test_mage', x: 1, y: 6 }],
        enemies: [1, 3, 5, 7].map(function (y) { return { id: 'test_grunt', x: 6, y: y }; }) });
      const s = a.s, mage = DD.Combat.heroes()[1], foes = DD.Combat.enemies();
      t.ok(s.rules.some(function (r) { return r.id === 'rp_main_character:' + a.me.id; }), tag + ': a fight-long rule announces the Main Character');
      s.hype = 0;
      DD.Act.kill(foes[0], a.me);
      t.eq(s.hype, 8 + L.bonus, tag + ': your kill: 8 + ' + L.bonus + ' Hype');
      s.hype = 50;
      DD.Act.kill(foes[1], mage);
      t.eq(s.hype, 50 - L.penalty + 8, tag + ': an ally kill: −' + L.penalty + ' first, then the usual 8');
      s.hype = 1;
      DD.Act.kill(foes[2], mage);
      t.eq(s.hype, Math.max(0, 1 - L.penalty) + 8, tag + ': only up to what the party has');
    },
    rp_overcaffeinated: function (t, lv, L, tag) {
      const a = arena('rp_overcaffeinated', lv, { enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const want = [];
      for (let r = 1; r <= 4; r++) want.push(3 + (r <= L.boost ? 1 : 0) - (L.crash && r === L.crash ? 1 : 0));
      const got = [a.me.ap];
      for (let r = 2; r <= 4; r++) { DD.Combat.endTurn(); got.push(DD.Combat.heroes()[0].ap); }
      t.eq(got.join(','), want.join(','), tag + ': AP at the start of rounds 1-4');
    },
    rp_superstitious: function (t, lv, L, tag) {
      const a = arena('rp_superstitious', lv, { enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 8, y: 8 }] });
      bare(a.foe);
      t.eq(a.me.block, 3, tag + ': round 1 (odd): no Block bonus (3 from Overly Prepared)');
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 5); }), 5 + L.dmg, tag + ': odd round: +' + L.dmg + ' damage');
      DD.Combat.endTurn();
      const me = DD.Combat.heroes()[0];
      t.eq(me.block, L.block, tag + ': round 2 (even): ' + L.block + ' Block at turn start');
      bare(a.foe);
      t.eq(lost(a.foe, function () { hit(me, a.foe, 5); }), 5, tag + ': even round: no damage bonus');
    },
    rp_wall_hugger: function (t, lv, L, tag) {
      const a = arena('rp_wall_hugger', lv);
      const u = bare(a.me);
      t.eq(lost(u, function () { hit(a.foe, u, 6); }), 6, tag + ': in the open: full damage');
      tile(1, 3).t = 'wall';
      t.eq(lost(u, function () { hit(a.foe, u, 6); }), 6 - L.n, tag + ': next to a wall: ' + L.n + ' less');
      t.eq(lost(u, function () { hit(a.foe, u, 6, { cause: 'other' }); }), 6, tag + ': only enemy skill hits');
      tile(1, 3).t = 'stone';
      DD.Act.placeObject(0, 4, 'crate');
      t.eq(lost(u, function () { hit(a.foe, u, 6); }), 6 - L.n, tag + ': a crate is a solid object too');
    },
    rp_high_ground: function (t, lv, L, tag) {
      const a = arena('rp_high_ground', lv, { hpMult: 5 });
      bare(a.foe);
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 8); }), 8, tag + ': same height: 8');
      tile(1, 4).h = 1;
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 8); }), 10 + L.dmg, tag + ': from higher ground: 8 × 1.25 + ' + L.dmg);
    },
    rp_clutch_gene: function (t, lv, L, tag) {
      const a = arena('rp_clutch_gene', lv, { hpMult: 5 });
      bare(a.foe);
      const boosted = Math.round(10 * (1 + L.pct / 100));
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 10); }), 10, tag + ': healthy: 10');
      a.me.hp = Math.floor(a.me.maxHp * 0.3);
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 10); }), boosted, tag + ': at 30% HP: +' + L.pct + '%');
      a.me.hp = 1;
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 10); }), L.one ? 20 : boosted, tag + ': at exactly 1 HP: ' + (L.one ? 'double' : '+' + L.pct + '%'));
    },
    rp_ghost_accountant: function (t, lv, L, tag) {
      DD.Combat.sandbox({ w: 9, h: 9, seed: 7, noPlan: true, enemies: [{ id: 'test_grunt', x: 5, y: 5 }],
        heroes: [{ id: 'test_knight', x: 1, y: 4, passives: [{ id: 'rp_ghost_accountant', level: lv }] }] });
      const s = DD.Combat.state;
      DD.Combat._action(function () { DD.Act.kill(DD.Combat.enemies()[0], DD.Combat.heroes()[0]); });
      t.ok(s.result === 'victory' && s.sandboxGold === L.gold, tag + ': a won fight → +' + L.gold + ' gold (got ' + s.sandboxGold + ')');
      const a = arena('rp_ghost_accountant', lv);
      DD.Act.removeStatus(a.me, 'confused', { silent: true });
      forced(0, function () { fire(a.p, 'onTurnStart', a.me); });
      t.ok(has(a.me, 'confused') && st(a.me, 'confused').turns === 1, tag + ': bad roll → Confused this turn');
      DD.Act.removeStatus(a.me, 'confused', { silent: true });
      forced(0.999, function () { fire(a.p, 'onTurnStart', a.me); });
      t.ok(!has(a.me, 'confused'), tag + ': good roll → no ghost');
      let n = 0;
      for (let i = 0; i < 1500; i++) {
        fire(a.p, 'onTurnStart', a.me);
        if (has(a.me, 'confused')) { n++; DD.Act.removeStatus(a.me, 'confused', { silent: true }); }
      }
      rate(t, n, 1500, L.pct, tag + ' Confused rate');
    },
    rp_sleepwalker: function (t, lv, L, tag) {
      const a = arena('rp_sleepwalker', lv);
      const u = a.me;
      const danger = [];
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        const k = Math.abs(x - 1) + Math.abs(y - 4);
        if (k >= 1 && k <= 2 && !(x === 3 && y === 4)) danger.push({ x: x, y: y });
      }
      DD.AI.makeIntent(a.far, 'test_grunt_stab', { x: 1, y: 3 }, { anchor: 'ground', tiles: danger, noCooldown: true });
      const b0 = u.block;
      forced(0, function () { fire(a.p, 'onTurnEnd', u); });
      t.eq(u.block, b0 + L.block, tag + ': sleepwalking gives ' + L.block + ' Block');
      const d = dist(u, { x: 1, y: 4 });
      t.ok(d >= 1 && d <= 2, tag + ': wandered 1-2 tiles (to ' + u.x + ',' + u.y + ')');
      if (L.safe) t.ok(u.x === 3 && u.y === 4, tag + ': never into a tile an enemy is aiming at');
      else t.ok(danger.some(function (q) { return q.x === u.x && q.y === u.y; }), tag + ': below level III it may wander into a telegraph');
      DD.Act.teleport(u, 1, 4);
      a.far.intents = [];
      const b1 = u.block;
      forced(0.999, function () { fire(a.p, 'onTurnEnd', u); });
      t.ok(u.x === 1 && u.y === 4 && u.block === b1, tag + ': no sleepwalk on a good night');
      let n = 0;
      for (let i = 0; i < 1200; i++) {
        fire(a.p, 'onTurnEnd', u);
        if (u.x !== 1 || u.y !== 4) { n++; DD.Act.teleport(u, 1, 4); }
      }
      rate(t, n, 1200, L.pct, tag + ' sleepwalk rate');
    },
    rp_rules_lawyer: function (t, lv, L, tag) {
      const a = arena('rp_rules_lawyer', lv);
      const u = a.me;
      DD.Act.addStatus(u, 'vulnerable', { turns: 2 }, u);
      t.ok(has(u, 'vulnerable'), tag + ': self-inflicted debuffs are not objected to');
      for (let i = 0; i < L.n; i++) {
        if (i % 2) DD.Act.addStatus(u, 'burn', { stacks: 2 }, null);
        else DD.Act.addStatus(u, 'weak', { turns: 2 }, a.foe);
      }
      t.ok(!has(u, 'weak') && !has(u, 'burn'), tag + ': the first ' + L.n + ' (enemy or hazard) are cancelled');
      DD.Act.addStatus(u, 'slow', { turns: 2 }, a.foe);
      t.ok(has(u, 'slow'), tag + ': the next one sticks');
      DD.Act.addStatus(u, 'inspired', { turns: 1 }, a.foe);
      t.ok(has(u, 'inspired'), tag + ': buffs are never objected to');
    },
    rp_trust_fund: modSpec(function (L) { return { gold: L.pct / 100 }; }),
    rp_haggler: modSpec(function (L) { return { price: -L.pct / 100 }; }),
    rp_teachers_pet: modSpec(function (L) { return { xp: L.pct / 100 }; }),
    rp_second_breakfast: modSpec(function (L) { return { heal: L.pct / 100 }; }),
    rp_quantum_pockets: function (t, lv, L, tag) {
      const a = arena('rp_quantum_pockets', lv, { sb: { run: fakeRun() } });
      const bag = a.s.run.consumables;
      bag.length = 0;
      forced(0, function () { fire(a.p, 'onCombatStart', a.me); });
      t.ok(bag.length === 1 && !!DD.getConsumable(bag[0]), tag + ': a lucky roll finds a registered consumable (' + bag[0] + ')');
      forced(0.999, function () { fire(a.p, 'onCombatStart', a.me); });
      t.eq(bag.length, 1, tag + ': an unlucky roll finds nothing');
      bag.push('test_potion', 'test_potion');
      forced(0, function () { fire(a.p, 'onCombatStart', a.me); });
      t.eq(bag.length, 3, tag + ': a full bag stays full');
      let n = 0;
      for (let i = 0; i < 1500; i++) { bag.length = 0; fire(a.p, 'onCombatStart', a.me); if (bag.length) n++; }
      rate(t, n, 1500, L.pct, tag + ' find rate');
      const b = arena('rp_quantum_pockets', lv);
      forced(0, function () { fire(b.p, 'onCombatStart', b.me); });
      t.eq(DD.Combat.consumables().length, 0, tag + ': outside a run nothing happens');
    },
    rp_dad_jokes: function (t, lv, L, tag) {
      const a = arena('rp_dad_jokes', lv, { hpMult: 60 });
      const u = a.me, f = a.foe;
      u.ap = 99;
      forced(0, function () { DD.Combat.useSkill(u, u.basic, f.x, f.y); });
      t.ok(has(f, 'weak') && st(f, 'weak').turns === 1, tag + ': the joke lands → Weakened for 1 turn');
      DD.Act.removeStatus(f, 'weak', { silent: true });
      forced(0.999, function () { DD.Combat.useSkill(u, u.basic, f.x, f.y); });
      t.ok(!has(f, 'weak'), tag + ': the joke can fall flat');
      forced(0, function () { DD.Combat.useSkill(u, u.skills[0], f.x, f.y); });
      t.ok(!has(f, 'weak'), tag + ': only the basic attack (Shield Bash tells no jokes)');
      DD.Act.teleport(f, 2, 4);
      let n = 0;
      for (let i = 0; i < 1000; i++) {
        full(f); u.ap = 99;
        DD.Combat.useSkill(u, u.basic, f.x, f.y);
        if (has(f, 'weak')) { n++; DD.Act.removeStatus(f, 'weak', { silent: true }); }
      }
      rate(t, n, 1000, L.pct, tag + ' Weaken rate');
    },
    rp_fireproof_onesie: function (t, lv, L, tag) {
      const a = arena('rp_fireproof_onesie', lv);
      ['burn', 'poison', 'bleed'].forEach(function (id) {
        DD.Act.addStatus(a.me, id, { stacks: 2 }, a.foe);
        const immune = L.ids.indexOf(id) >= 0;
        t.eq(has(a.me, id), !immune, tag + ': ' + id + (immune ? ' is refused' : ' still applies'));
      });
      DD.Act.setSurface(1, 5, 'fire', 3);
      DD.Combat.move(a.me, 1, 5);
      t.eq(has(a.me, 'burn'), false, tag + ': walking into fire does not Burn either');
    },
    rp_garlic_breath: function (t, lv, L, tag) {
      const a = arena('rp_garlic_breath', lv);
      t.eq(a.foe.maxHp - a.foe.hp, L.dmg, tag + ': the adjacent foe took ' + L.dmg + ' at the start of round 1');
      t.eq(a.far.hp, a.far.maxHp, tag + ': distant foes are spared');
      a.foe.armor = 5; a.foe.block = 0;
      t.eq(lost(a.foe, function () { fire(a.p, 'onTurnStart', a.me); }), L.dmg, tag + ': ignores armor');
    },
    rp_leaky_waterskin: function (t, lv, L, tag) {
      const a = arena('rp_leaky_waterskin', lv, { enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      DD.Act.setSurface(1, 5, 'oil', 5);
      t.ok(DD.Combat.move(a.me, 1, 7), tag + ': walks 3 tiles');
      const s1 = tile(1, 4).surface, s2 = tile(1, 5).surface, s3 = tile(1, 6).surface, s4 = tile(1, 7).surface;
      t.ok(!!s1 && s1.id === L.surface && s1.turns === L.turns, tag + ': the first tile walked out of is ' + L.surface + ' for ' + L.turns + ' rounds');
      t.ok(!!s2 && s2.id === 'oil', tag + ': an existing surface is left alone');
      t.ok(!!s3 && s3.id === L.surface, tag + ': every tile walked out of');
      t.ok(!s4, tag + ': not the tile you stop on');
      DD.Act.push(null, a.me, { x: 1, y: 0 }, 1);
      t.ok(!tile(1, 7).surface, tag + ': being pushed is not walking');
    },
    rp_frequent_flyer: function (t, lv, L, tag, id) {
      requiresCheck(t, id, [[{ id: 'pt_bird' }, { id: 'pt_bird', flags: { flying: true } }, 'a flyer']],
        [heroCase('test_knight'), heroCase('test_mage'), [{ id: 'pt_rock' }, { id: 'pt_rock', flags: {} }, 'a grounded hero']], tag);
      const a = arena(id, lv, { enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = a.me, p = a.p;
      a.foe.mov = 0; // the grunt stays in its corner (planning walks enemies)
      // noPlan only skips the first planning: the grunt is kept from swinging
      function endTurn() { DD.Combat.endTurn(); DD.Combat.enemies().forEach(function (e) { e.intents = []; }); }
      function upgraded() { return u.ap === 3 + (p.data.last === 'ap' ? 1 : 0) && u.block === (p.data.last === 'block' ? 4 : 0) && has(u, 'inspired') === (p.data.last === 'inspired'); }
      t.eq(walkTiles(u, L.miles - 1), L.miles - 1, tag + ': walks ' + (L.miles - 1) + ' tiles');
      t.eq(p.data.miles, L.miles - 1, tag + ': one mile per tile walked');
      endTurn();
      t.ok(u.ap === 3 && u.block === 0 && !has(u, 'inspired') && p.data.miles === L.miles - 1, tag + ': ' + (L.miles - 1) + ' miles: nothing redeemed yet');
      t.eq(walkTiles(u, 1), 1, tag + ': one more tile');
      endTurn();
      t.ok(['ap', 'block', 'inspired'].indexOf(p.data.last) >= 0 && upgraded(), tag + ': ' + L.miles + ' miles → next turn a free upgrade (' + p.data.last + ')');
      t.eq(p.data.miles, 0, tag + ': the miles are spent');
      t.eq(walkTiles(u, 2 * L.miles), 2 * L.miles, tag + ': walks ' + (2 * L.miles) + ' tiles in one turn');
      p.data.last = null;
      endTurn();
      t.ok(!!p.data.last && upgraded() && p.data.miles === L.miles, tag + ': only one upgrade per turn, the spare miles carry over');
      p.data.last = null;
      endTurn();
      t.ok(!!p.data.last && upgraded() && p.data.miles === 0, tag + ': ...and pay for the next one');
      // each upgrade, forced through the combat RNG (int(0, 2) = floor(next × 3))
      [[0, 'ap'], [0.5, 'block'], [0.999, 'inspired']].forEach(function (c) {
        DD.Act.removeStatus(u, 'inspired', { silent: true });
        u.ap = 3; u.block = 0; p.data.miles = L.miles;
        forced(c[0], function () { fire(p, 'onTurnStart', u); });
        t.ok(p.data.last === c[1] && upgraded(), tag + ': upgrade "' + c[1] + '" (+1 AP / 4 Block / Inspired for 1 turn)');
      });
      const got = { ap: 0, block: 0, inspired: 0 };
      for (let i = 0; i < 900; i++) { p.data.miles = L.miles; fire(p, 'onTurnStart', u); got[p.data.last]++; DD.Act.removeStatus(u, 'inspired', { silent: true }); }
      Object.keys(got).forEach(function (k) { rate(t, got[k], 900, 100 / 3, tag + ' "' + k + '" share'); });
    },
    rp_compound_interest: function (t, lv, L, tag, id) {
      [100, 1000, 10].forEach(function (g) {
        const a = arena(id, lv, { sb: { gold: g } });
        const want = Math.min(L.cap, Math.floor(g * L.pct / 100));
        t.eq(a.s.sandboxGold, g + want, tag + ': ' + g + ' gold earns ' + want + ' interest');
      });
      requiresCheck(t, id, [[{ id: 'zarathor' }, { id: 'zarathor' }, 'Zarathor (by name)'], [{ id: 'buga' }, { id: 'buga' }, 'Mayor Buga (by name)']],
        [heroCase('test_knight'), heroCase('test_cleric')], tag);
    },
    rp_cardio_king: function (t, lv, L, tag) {
      const a = arena('rp_cardio_king', lv, { enemies: [{ id: 'test_grunt', x: 8, y: 1, hpMult: 5 }] });
      const u = a.me, f = bare(a.foe);
      const b0 = u.block;
      t.ok(DD.Combat.move(u, 1, 7), tag + ': walks 3 tiles');
      t.eq(u.block, b0, tag + ': 3 tiles: nothing yet');
      t.ok(DD.Combat.move(u, 2, 7), tag + ': walks 1 more');
      t.eq(u.block, b0 + L.block, tag + ': 4 tiles this turn: +' + L.block + ' Block');
      t.eq(lost(f, function () { hit(u, f, 5); }), 5 + L.dmg, tag + ': the next skill hit: +' + L.dmg);
      t.eq(lost(f, function () { hit(u, f, 5); }), 5, tag + ': only that one');
      t.ok(DD.Combat.move(u, 3, 7), tag + ': walks again');
      t.eq(u.block, b0 + L.block, tag + ': once per turn');
    },
    rp_swamp_thing: function (t, lv, L, tag) {
      const a = arena('rp_swamp_thing', lv, { hpMult: 5 });
      bare(a.foe);
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 5); }), 5, tag + ': on dry floor: 5');
      DD.Act.setSurface(1, 4, 'blood', 3);
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 5); }), 5 + L.dmg, tag + ': standing in blood: +' + L.dmg);
    },
    rp_revenge_arc: function (t, lv, L, tag) {
      const a = arena('rp_revenge_arc', lv, { hpMult: 5, allies: [{ id: 'test_mage', x: 1, y: 6 }] });
      const u = a.me, f = bare(a.foe), mage = DD.Combat.heroes()[1];
      t.eq(lost(f, function () { hit(u, f, 10); }), 10, tag + ': everyone standing: 10');
      DD.Act.kill(mage, a.far);
      t.ok(mage.downed, tag + ': the ally is downed');
      t.eq(lost(f, function () { hit(u, f, 10); }), Math.round(10 * (1 + L.pct / 100)), tag + ': an ally down: +' + L.pct + '%');
      const pup = DD.Act.summon(u, 'test_hound', 0, 4, { noFx: true });
      const b0 = u.block;
      DD.Act.kill(pup, a.far);
      t.eq(u.block, b0 + L.block, tag + ': an allied summon dies: +' + L.block + ' Block');
    },
    // ---------------------------------------------------------------- uncommon
    rp_adrenaline_junkie: function (t, lv, L, tag) {
      const a = arena('rp_adrenaline_junkie', lv, { enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = bare(a.me), f = a.foe;
      hit(f, u, L.min - 1);
      DD.Combat.endTurn();
      t.eq(u.ap, 3, tag + ': a ' + (L.min - 1) + '-damage hit: no extra AP');
      u.block = 0;
      hit(f, u, L.min);
      hit(f, u, L.min + 3);
      DD.Combat.endTurn();
      t.eq(u.ap, 4, tag + ': a ' + L.min + '+ hit: +1 AP next turn (two hits still +1)');
      DD.Combat.endTurn();
      t.eq(u.ap, 3, tag + ': and then back to normal');
      u.block = 0;
      hit(f, u, L.min, { cause: 'other' });
      DD.Combat.endTurn();
      t.eq(u.ap, 3, tag + ': only enemy skill hits count');
    },
    rp_vampire_wannabe: function (t, lv, L, tag) {
      const a = arena('rp_vampire_wannabe', lv, { hpMult: 5 });
      const u = a.me, f = bare(a.foe);
      u.hp = 10;
      t.eq(lost(f, function () { hit(u, f, 10); }), 10, tag + ': the hit lands');
      t.eq(u.hp, 10 + Math.round(10 * L.pct / 100), tag + ': and heals ' + L.pct + '% of it');
      f.block = 30;
      const h = u.hp;
      hit(u, f, 10);
      t.eq(u.hp, h, tag + ': damage soaked by Block heals nothing');
    },
    rp_petty_revenge: function (t, lv, L, tag) {
      const a = arena('rp_petty_revenge', lv, { hpMult: 5 });
      hit(a.foe, a.me, 4);
      t.eq(st(a.foe, 'marked').stacks, L.mark, tag + ': the attacker is Marked ' + L.mark);
      bare(a.foe);
      t.eq(lost(a.foe, function () { hit(a.me, a.foe, 5); }), 5 + L.mark, tag + ': its next damage taken is +' + L.mark);
      t.ok(!has(a.foe, 'marked'), tag + ': then the mark is spent');
    },
    rp_bee_whisperer: function (t, lv, L, tag) {
      arena('rp_bee_whisperer', lv, { enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 6 },
        { id: 'test_grunt', x: 4, y: 5 }] });
      const es = DD.Combat.enemies();
      DD.Act.kill(es[0], DD.Combat.heroes()[0]);
      t.eq(st(es[1], 'poison').stacks, L.poison, tag + ': a foe 1 tile from the victim gets Poison ' + L.poison);
      t.eq(st(es[2], 'poison').stacks, L.poison, tag + ': and one 2 tiles away');
      t.ok(!has(es[3], 'poison'), tag + ': but not one 3 tiles away');
    },
    rp_wild_magic_allergy: function (t, lv, L, tag, id) {
      const a = arena(id, lv);
      let calls = surgeCalls(function () { forced(0, function () { fire(a.p, 'onTurnStart', a.me); }); });
      t.ok(calls.length === 1 && !!calls[0].good === !!L.good && calls[0].source === id, tag + ': a sneeze → a Wild Surge' + (L.good ? ' (good only)' : ' (any)'));
      calls = surgeCalls(function () { forced(0.999, function () { fire(a.p, 'onTurnStart', a.me); }); });
      t.eq(calls.length, 0, tag + ': no sneeze, no surge');
      calls = surgeCalls(function () { for (let i = 0; i < 1500; i++) fire(a.p, 'onTurnStart', a.me); });
      rate(t, calls.length, 1500, L.pct, tag + ' surge rate');
      let real = 0;
      const off = DD.Events.on('wildmagic:surge', function () { real++; });
      try { for (let i = 0; i < 300 && !real; i++) fire(a.p, 'onTurnStart', a.me); } finally { off(); }
      t.ok(real === 1, tag + ': a real surge resolves through DD.WildMagic');
    },
    rp_emotional_support_duck: function (t, lv, L, tag) {
      const a = arena('rp_emotional_support_duck', lv);
      const ducks = summonsOf(a.me, 'wm_duck');
      const hp = Math.round(DD.getSummon('wm_duck').hp * L.hp);
      t.eq(ducks.length, L.n, tag + ': ' + L.n + ' Confused Duck(s) join at the start of the fight');
      t.ok(ducks.every(function (d) { return d.maxHp === hp && d.hp === hp && dist(d, a.me) <= 2; }), tag + ': ' + hp + ' HP each, right next to you');
      t.ok(ducks.every(function (d) { return d.ap === d.maxAp; }), tag + ': they act in round 1');
    },
    rp_resting_villain_face: function (t, lv, L, tag) {
      arena('rp_resting_villain_face', lv, { enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }] });
      const es = DD.Combat.enemies();
      t.ok(has(es[0], 'weak') && st(es[0], 'weak').turns === 1, tag + ': the adjacent foe is Weakened for 1 turn');
      t.eq(has(es[1], 'weak'), L.r >= 2, tag + ': a foe 2 tiles away ' + (L.r >= 2 ? 'too' : 'is not'));
      t.ok(!has(es[2], 'weak'), tag + ': distant foes are not');
      t.eq(has(es[0], 'vulnerable'), !!L.vuln, tag + ': Vulnerable ' + (L.vuln ? 'as well' : 'not at this level'));
    },
    rp_inspiring_monologue: function (t, lv, L, tag) {
      arena('rp_inspiring_monologue', lv, { allies: [{ id: 'test_mage', x: 1, y: 6 }, { id: 'test_cleric', x: 4, y: 4 }, { id: 'test_rogue', x: 6, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 8, y: 8 }, { id: 'test_grunt', x: 7, y: 1 }] });
      const hs = DD.Combat.heroes();
      t.ok(has(hs[0], 'inspired') && st(hs[0], 'inspired').turns === L.turns, tag + ': you are Inspired for ' + L.turns + ' turn(s)');
      t.ok(has(hs[1], 'inspired') && st(hs[1], 'inspired').turns === L.turns, tag + ': an ally 2 tiles away too');
      t.eq(has(hs[2], 'inspired'), L.r >= 3, tag + ': an ally 3 tiles away ' + (L.r >= 3 ? 'too' : 'is out of earshot'));
      t.ok(!has(hs[3], 'inspired'), tag + ': an ally 5 tiles away is not');
    },
    rp_parkour: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { mov: L.mov }, tag);
      const a = arena(id, lv, { enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      t.eq(!!a.me.flags.hop, !!L.hop, tag + ': climbs 2 levels: ' + !!L.hop);
      tile(2, 4).h = 2;
      t.eq(DD.Grid.canStep(a.me, { x: 1, y: 4 }, { x: 2, y: 4 }), !!L.hop, tag + ': one step up 2 levels');
    },
    rp_loaded_dice: function (t, lv, L, tag) {
      const seen = {};
      for (let seed = 1; seed <= 400 && Object.keys(seen).length < (L.bonus ? 3 : 4); seed++) {
        const r = Math.min(20, DD.RNG(seed).int(1, 20) + L.bonus);
        const band = r <= 1 ? 'fail' : r <= 9 ? 'meh' : r <= 19 ? 'nice' : 'nat20';
        if (seen[band]) continue;
        seen[band] = 1;
        const a = arena('rp_loaded_dice', lv, { sb: { seed: seed }, enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
        const u = a.me, lab = tag + ' (seed ' + seed + ', rolled ' + r + ')';
        t.eq(a.p.data.roll, r, lab + ': the shown roll');
        if (band === 'fail') t.ok(has(u, 'vulnerable') && st(u, 'vulnerable').turns === 2 && u.block === 3, lab + ': 1 → Vulnerable for 2 turns');
        if (band === 'meh') t.ok(u.block === 3 + 4 && !has(u, 'inspired'), lab + ': 2-9 → 4 Block');
        if (band === 'nice') t.ok(has(u, 'inspired') && st(u, 'inspired').turns === 1 && a.s.hype === 0, lab + ': 10-19 → Inspired for 1 turn');
        if (band === 'nat20') t.ok(has(u, 'inspired') && st(u, 'inspired').turns === 2 && a.s.hype === 15, lab + ': 20 → Inspired for 2 turns, +15 Hype');
      }
      t.eq(Object.keys(seen).sort().join(','), (L.bonus ? ['meh', 'nat20', 'nice'] : ['fail', 'meh', 'nat20', 'nice']).join(','),
        tag + ': every reachable outcome was rolled' + (L.bonus ? ' (no natural 1 with +' + L.bonus + ')' : ''));
    },
    rp_method_actor: function (t, lv, L, tag, id) {
      // the casting pool rebuilt from the registry (the oracle): rollable, in-fight hooks, no stats / runMods / requires
      function pool(own) {
        return Object.keys(DD.defs.passives).sort().map(DD.getPassive).filter(function (d) {
          return d.id.indexOf('rp_') === 0 && d.id !== id && L.pool.indexOf(d.rarity) >= 0 && d.weight > 0 && !d.stats && !d.runMods && !d.requires &&
            Object.keys(d.hooks || {}).length > 0 && (own || []).indexOf(d.id) < 0;
        });
      }
      function cast(seed, owned) {
        quiet({ w: 7, h: 7, seed: seed, heroes: [{ id: 'test_knight', x: 1, y: 3,
          passives: [{ id: id, level: lv }].concat((owned || []).map(function (o) { return { id: o, level: 1 }; })) }],
        enemies: [{ id: 'test_grunt', x: 6, y: 6 }] });
        const u = DD.Combat.heroes()[0];
        return { u: u, p: instOf(u, id), roles: u.passives.filter(function (q) { return q.role; }) };
      }
      const all = pool([]);
      t.ok(all.length >= 10, tag + ': a big casting pool (' + all.length + ' ' + L.pool.join('/') + ' Blessings)');
      const seen = {};
      let match = 0;
      const N = 90;
      for (let seed = 1; seed <= N; seed++) {
        const c = cast(seed);
        const want = all[DD.RNG(seed).int(0, all.length - 1)];
        if (c.roles.length === 1 && c.roles[0].id === want.id && c.p.data.role === want.id && c.roles[0].level === L.lv && c.roles[0].def === want) match++;
        if (c.roles[0]) seen[c.roles[0].id] = 1;
      }
      t.eq(match, N, tag + ': every fight casts exactly one role at level ' + L.lv + ', picked uniformly from the pool by the combat RNG (oracle)');
      t.ok(Object.keys(seen).length >= Math.ceil(all.length * 0.7), tag + ': a different role most fights (' + Object.keys(seen).length + '/' + all.length + ' roles in ' + N + ' fights)');
      const c0 = cast(3);
      t.ok(c0.u.runHero.passives.length === 1 && c0.u.passives.length === 2, tag + ': the role is a fight-only extra (the RunHero keeps its 1 Blessing)');
      t.ok(all.every(function (d) { return d.rarity !== 'legendary' && d.rarity !== 'cursed'; }), tag + ': never a legendary or cursed role');
      // never a role the hero already has
      const owned = all.slice(0, 3).map(function (d) { return d.id; });
      const rest = pool(owned);
      let clean = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const c = cast(seed, owned);
        if (c.roles.length === 1 && owned.indexOf(c.roles[0].id) < 0 && c.roles[0].id === rest[DD.RNG(seed).int(0, rest.length - 1)].id) clean++;
      }
      t.eq(clean, 30, tag + ': never one the hero already has (' + owned.join(', ') + ')');
      // the role really plays: its own onCombatStart and later hooks fire
      const target = L.pool.indexOf('common') >= 0 ? 'rp_pet_rock' : 'rp_emotional_support_duck';
      let seed = 0;
      for (let s = 1; s < 5000 && !seed; s++) if (all[DD.RNG(s).int(0, all.length - 1)].id === target) seed = s;
      t.ok(seed > 0, tag + ': a seed that casts ' + target);
      const c = cast(seed);
      if (target === 'rp_pet_rock') {
        const r = DD.Grid.allTiles().filter(function (tl) { return tl.obj && tl.obj.label === 'Rocky'; });
        t.ok(r.length === 1 && dist(r[0], c.u) === 1 && c.u.block === 3 + DD.skillLevel(DD.getPassive(target), L.lv).block,
          tag + ': cast as a Pet Rock owner: Rocky shows up and gives level-' + L.lv + ' Block');
      } else {
        const ducks = summonsOf(c.u, 'wm_duck');
        t.ok(ducks.length === 1 && ducks[0].maxHp === Math.round(DD.getSummon('wm_duck').hp * 1.5), tag + ': cast as an Emotional Support Duck owner: a 12-HP duck joins');
      }
    },
    rp_greased_up: function (t, lv, L, tag) {
      const a = arena('rp_greased_up', lv);
      ['root', 'slow', 'stun'].forEach(function (id) {
        DD.Act.addStatus(a.me, id, { turns: 1 }, a.foe);
        const immune = L.ids.indexOf(id) >= 0;
        t.eq(has(a.me, id), !immune, tag + ': ' + id + (immune ? ' slides right off' : ' still applies'));
      });
    },
    rp_displacer_ancestry: function (t, lv, L, tag) {
      const a = arena('rp_displacer_ancestry', lv);
      const u = bare(a.me);
      forced(0, function () { hit(a.foe, u, 4); });
      const d = dist(u, { x: 1, y: 4 });
      t.ok(d >= 2 && d <= 3, tag + ': blinked 2-3 tiles away (to ' + u.x + ',' + u.y + ')');
      t.eq(u.hp, u.maxHp - 4, tag + ': after taking the hit');
      DD.Act.teleport(u, 1, 4);
      forced(0.999, function () { hit(a.foe, u, 4); });
      t.ok(u.x === 1 && u.y === 4, tag + ': no blink on a bad roll');
      // every tile 2-3 away is telegraphed except (1,7): the blink picks the calm one
      const danger = [];
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        const k = Math.abs(x - 1) + Math.abs(y - 4);
        if (k >= 2 && k <= 3 && !(x === 1 && y === 7)) danger.push({ x: x, y: y });
      }
      DD.AI.makeIntent(a.far, 'test_grunt_stab', { x: 1, y: 2 }, { anchor: 'ground', tiles: danger, noCooldown: true });
      for (let i = 0; i < 6; i++) {
        full(u);
        forced(0, function () { hit(a.foe, u, 4); });
        t.ok(u.x === 1 && u.y === 7, tag + ': blinks to the one tile no enemy is aiming at (got ' + u.x + ',' + u.y + ')');
        DD.Act.teleport(u, 1, 4);
      }
      danger.push({ x: 1, y: 7 });
      a.far.intents = [];
      DD.AI.makeIntent(a.far, 'test_grunt_stab', { x: 1, y: 2 }, { anchor: 'ground', tiles: danger, noCooldown: true });
      full(u);
      forced(0, function () { hit(a.foe, u, 4); });
      const k2 = dist(u, { x: 1, y: 4 });
      t.ok(k2 >= 2 && k2 <= 3, tag + ': everything telegraphed: it still blinks 2-3 tiles (to ' + u.x + ',' + u.y + ')');
      DD.Act.teleport(u, 1, 4);
      a.far.intents = [];
      let n = 0;
      for (let i = 0; i < 1000; i++) {
        full(u);
        hit(a.foe, u, 4);
        if (u.x !== 1 || u.y !== 4) { n++; DD.Act.teleport(u, 1, 4); }
      }
      rate(t, n, 1000, L.pct, tag + ' blink rate');
    },
    rp_cat_reflexes: function (t, lv, L, tag) {
      const a = arena('rp_cat_reflexes', lv);
      const u = bare(a.me);
      t.eq(lost(u, function () { forced(0, function () { hit(a.foe, u, 6); }); }), 0, tag + ': dodged → no damage');
      t.eq(lost(u, function () { forced(0.999, function () { hit(a.foe, u, 6); }); }), 6, tag + ': not dodged → 6');
      t.eq(lost(u, function () { forced(0, function () { hit(a.foe, u, 6, { cause: 'other' }); }); }), 6, tag + ': only enemy skill hits');
      let n = 0;
      for (let i = 0; i < 1500; i++) { full(u); if (lost(u, function () { hit(a.foe, u, 6); }) === 0) n++; }
      rate(t, n, 1500, L.pct, tag + ' dodge rate');
    },
    rp_pyromaniac: function (t, lv, L, tag, id) {
      const a = arena(id, lv, { hpMult: 5 });
      const f = bare(a.foe);
      t.eq(lost(f, function () { hit(a.me, f, 5, { element: 'fire' }); }), 5 + L.dmg, tag + ': fire hits: +' + L.dmg);
      t.eq(st(f, 'burn').stacks || 0, L.burn, tag + ': Burn ' + L.burn + ' on the foe');
      DD.Act.removeStatus(f, 'burn', { silent: true });
      t.eq(lost(f, function () { hit(a.me, f, 5); }), 5, tag + ': other hits: 5');
      t.ok(!has(f, 'burn'), tag + ': and no Burn');
      requiresCheck(t, id, [heroCase('test_mage')], [heroCase('test_knight'), heroCase('test_cleric')], tag);
    },
    rp_explosive_personality: function (t, lv, L, tag) {
      const a = arena('rp_explosive_personality', lv, { hpMult: 3, allies: [{ id: 'test_mage', x: 1, y: 5 }] });
      const f = bare(a.foe), mage = DD.Combat.heroes()[1];
      DD.Act.kill(a.me, a.far);
      t.ok(a.me.downed, tag + ': the hero is downed');
      t.eq(f.maxHp - f.hp, L.dmg, tag + ': the adjacent foe takes ' + L.dmg + ' fire damage');
      t.eq(mage.hp, mage.maxHp, tag + ': the adjacent ally is spared');
      t.eq(a.far.hp, a.far.maxHp, tag + ': distant foes are spared');
    },
    rp_bedside_manner: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { healBonus: L.pct / 100 }, tag, 'test_cleric');
      const a = arena(id, lv, { me: { id: 'test_cleric' }, allies: [{ id: 'test_knight', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
      const u = a.me, ally = DD.Combat.heroes()[1];
      ally.hp = 5;
      DD.Act.addStatus(ally, 'weak', { turns: 2 }, a.foe);
      t.ok(DD.Combat.useSkill(u, slotOf(u, 'test_heal'), ally.x, ally.y), tag + ': Patch Notes on an ally');
      t.eq(ally.hp, 5 + Math.round(7 * (1 + L.pct / 100)), tag + ': heals 7 × ' + (1 + L.pct / 100));
      t.eq(has(ally, 'weak'), !L.cleanse, tag + ': ' + (L.cleanse ? 'and removes a debuff' : 'debuffs stay at this level'));
      requiresCheck(t, id, [heroCase('test_cleric')], [heroCase('test_knight'), heroCase('test_rogue')], tag);
      // a self-only heal (a barbarian's keg) doesn't make a medic; two heal-tagged skills (drains, donations) do
      const tmp = { test_pt_keg: ['heal', { type: 'self' }], test_pt_drain: ['attack', { type: 'unit', range: [1, 2], filter: 'enemy' }] };
      Object.keys(tmp).forEach(function (sid) {
        DD.registerSkill({ id: sid, name: 'Test ' + sid, owner: 'test_knight', icon: '🧪', kind: tmp[sid][0], tags: ['heal'], ap: 1,
          levels: [{}], target: tmp[sid][1], desc: function () { return 'Heal 1 HP.'; }, execute: function () {} });
      });
      try {
        requiresCheck(t, id, [[{ id: 'pt_vamp' }, { id: 'pt_vamp', skillPool: ['test_pt_keg', 'test_pt_drain'] }, 'two heal-tagged skills']],
          [[{ id: 'pt_keg' }, { id: 'pt_keg', skillPool: ['test_pt_keg'] }, 'only a self-heal'],
            [{ id: 'pt_leech' }, { id: 'pt_leech', skillPool: ['test_pt_drain'] }, 'only one heal-tagged attack']], tag);
      } finally { Object.keys(tmp).forEach(function (sid) { delete DD.defs.skills[sid]; }); }
    },
    rp_proud_pet_parent: function (t, lv, L, tag, id) {
      const a = arena(id, lv, { me: { id: 'test_summoner' }, enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
      const u = a.me;
      let pets = summonsOf(u);
      t.ok(pets.length === 1 && pets[0].maxHp === 10 + L.hp && pets[0].hp === 10 + L.hp, tag + ': the Pack Bond hound gets +' + L.hp + ' max HP');
      t.ok(pets.length === 1 && Math.abs(pets[0].dmgBonus - L.pct / 100) < 1e-9, tag + ': and +' + L.pct + '% damage');
      u.ap = 10;
      const slot = slotOf(u, 'test_call_hound');
      const spot = DD.Combat.targets(u, slot)[0];
      t.ok(!!spot && DD.Combat.useSkill(u, slot, spot.x, spot.y), tag + ': summons another hound');
      pets = summonsOf(u);
      t.ok(pets.length === 2 && pets.every(function (p) { return p.maxHp === 10 + L.hp; }), tag + ': it is pampered on arrival');
      fire(a.p, 'onTurnStart', u);
      t.ok(pets.every(function (p) { return p.maxHp === 10 + L.hp && Math.abs(p.dmgBonus - L.pct / 100) < 1e-9; }), tag + ': never twice');
      requiresCheck(t, id, [heroCase('test_summoner')], [heroCase('test_knight'), heroCase('test_mage')], tag);
    },
    rp_blood_bank_card: function (t, lv, L, tag, id) {
      DD.registerSkill({ id: 'test_pt_bloodskill', name: 'Test Blood Price', owner: 'test_knight', icon: '🩸', kind: 'buff', tags: ['blood'], ap: 1, hpCost: 3,
        levels: [{}], target: { type: 'self' }, desc: function () { return 'Pay 3 HP. Nothing else happens.'; }, execute: function () {} });
      DD.registerSkill({ id: 'test_pt_bloodskill2', name: 'Test Blood Tax', owner: 'test_knight', icon: '🩸', kind: 'buff', tags: [], ap: 1, hpCost: 1,
        levels: [{}], target: { type: 'self' }, desc: function () { return 'Pay 1 HP. Nothing else happens.'; }, execute: function () {} });
      try {
        const a = arena(id, lv, { me: { skills: ['test_pt_bloodskill'] }, enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
        const u = a.me, def = DD.getSkill('test_pt_bloodskill');
        t.eq(DD.Combat.costOf(u, def, 1).hp, Math.max(0, 3 - L.n), tag + ': a 3 HP cost becomes ' + (3 - L.n));
        const h = u.hp, b = u.block;
        t.ok(DD.Combat.useSkill(u, u.skills[0], u.x, u.y), tag + ': used');
        t.eq(h - u.hp, Math.max(0, 3 - L.n), tag + ': paid ' + (3 - L.n) + ' HP');
        t.eq(u.block - b, L.block, tag + ': ' + (L.block ? '+' + L.block + ' Block' : 'no Block at this level'));
        t.eq(DD.Combat.costOf(u, DD.getSkill('test_slash'), 1).hp, 0, tag + ': skills without an HP cost stay free');
        requiresCheck(t, id, [[{ id: 'sparrow' }, { id: 'sparrow' }, 'Sparrow (by name)'],
          [{ id: 'pt_leech' }, { id: 'pt_leech', skillPool: ['test_pt_bloodskill', 'test_pt_bloodskill2', 'test_slash'] }, 'two skills that cost HP']],
        [heroCase('test_knight'), heroCase('test_summoner'),
          [{ id: 'pt_once' }, { id: 'pt_once', skillPool: ['test_pt_bloodskill', 'test_slash'], basic: 'test_pt_bloodskill' }, 'one HP-cost skill listed twice counts once'],
          [{ id: 'corelos' }, { id: 'corelos', skillPool: [] }, 'Corelos by name (his Debt is not a skill HP cost)']], tag);
      } finally { delete DD.defs.skills.test_pt_bloodskill; delete DD.defs.skills.test_pt_bloodskill2; }
    },
    // ---------------------------------------------------------------- rare
    rp_plot_armor: function (t, lv, L, tag) {
      const a = arena('rp_plot_armor', lv);
      const u = bare(a.me);
      hit(a.foe, u, 999);
      t.ok(!u.downed && u.hp === 1, tag + ': a lethal hit leaves you at 1 HP');
      t.eq(u.block, L.block, tag + ': with ' + L.block + ' Block');
      t.eq(has(u, 'invulnerable'), !!L.invuln, tag + ': Invulnerable: ' + !!L.invuln);
      DD.Act.removeStatus(u, 'invulnerable', { silent: true });
      u.block = 0;
      hit(a.foe, u, 999);
      t.ok(u.downed, tag + ': only once per fight');
    },
    rp_ambidextrous: function (t, lv, L, tag) {
      const a = arena('rp_ambidextrous', lv, { hpMult: 5 });
      const u = a.me, f = bare(a.foe), def = DD.getSkill(u.basic.id);
      t.eq(DD.Combat.costOf(u, def, 1).ap, 0, tag + ': the first basic attack each turn is free');
      const ap0 = u.ap;
      t.eq(lost(f, function () { DD.Combat.useSkill(u, u.basic, f.x, f.y); }), 5 + L.dmg, tag + ': it deals 5' + (L.dmg ? ' + ' + L.dmg : ''));
      t.eq(u.ap, ap0, tag + ': no AP spent');
      t.eq(DD.Combat.costOf(u, def, 1).ap, 1, tag + ': the second costs 1');
      DD.Combat.useSkill(u, u.basic, f.x, f.y);
      t.eq(u.ap, ap0 - 1, tag + ': and is paid');
      t.eq(DD.Combat.costOf(u, DD.getSkill('test_cleave'), 1).ap, 2, tag + ': other skills cost as usual');
      DD.Combat.endTurn();
      t.eq(DD.Combat.costOf(u, def, 1).ap, 0, tag + ': free again next turn');
    },
    rp_bifocals: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { rangeBonus: L.range, dmgBonus: L.pct / 100 }, tag, 'test_mage');
      const a = arena(id, lv, { me: { id: 'test_mage' } });
      t.eq(DD.Targeting.range(a.me, DD.getSkill('test_bolt'), 1)[1], 5 + L.range, tag + ': Magic Missile now reaches ' + (5 + L.range));
      t.eq(DD.Targeting.range(a.me, DD.getSkill('test_slash'), 1)[1], 1, tag + ': melee range is unchanged');
    },
    rp_uno_reverse: function (t, lv, L, tag) {
      const a = arena('rp_uno_reverse', lv, { hpMult: 50 });
      const u = bare(a.me), f = bare(a.foe);
      let fh = f.hp;
      t.eq(lost(u, function () { forced(0, function () { hit(f, u, 6); }); }), 0, tag + ': reversed → you take nothing');
      t.eq(fh - f.hp, 6, tag + ': the attacker takes the base 6');
      fh = f.hp;
      t.eq(lost(u, function () { forced(0.999, function () { hit(f, u, 6); }); }), 6, tag + ': not reversed → 6');
      t.eq(fh - f.hp, 0, tag + ': the attacker is untouched');
      let n = 0;
      for (let i = 0; i < 1500; i++) { full(u); full(f); if (lost(u, function () { hit(f, u, 6); }) === 0) n++; }
      rate(t, n, 1500, L.pct, tag + ' reverse rate');
    },
    rp_extra_attack: function (t, lv, L, tag) {
      const enemies = [1, 2, 3, 4, 5].map(function (y) { return { id: 'test_grunt', x: 6, y: y }; });
      const a = arena('rp_extra_attack', lv, { enemies: enemies });
      const u = a.me, es = DD.Combat.enemies(), s = a.s;
      const ap = [u.ap];
      for (let i = 0; i < 4; i++) { DD.Act.kill(es[i], u); ap.push(u.ap); }
      const want = [3];
      for (let i = 1; i <= 4; i++) want.push(3 + Math.min(i, L.n));
      t.eq(ap.join(','), want.join(','), tag + ': AP after 0-4 kills this turn');
      s.phase = 'enemy';
      const a0 = u.ap;
      DD.Act.kill(es[4], u);
      s.phase = 'player';
      t.eq(u.ap, a0, tag + ': kills outside your turn give nothing');
    },
    rp_circle_of_life: function (t, lv, L, tag) {
      const a = arena('rp_circle_of_life', lv, { enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
      const u = a.me;
      function victim() { return DD.Act.spawn('test_grunt', 3, 4, { noFx: true, silent: true }); }
      let v = victim();
      forced(0, function () { DD.Act.kill(v, u); });
      let ducks = summonsOf(u, 'wm_duck');
      t.ok(ducks.length === 1 && ducks[0].x === 3 && ducks[0].y === 4 && ducks[0].maxHp === DD.getSummon('wm_duck').hp, tag + ': reincarnated as a duck on its own tile');
      ducks.forEach(function (d) { d.dead = true; });
      v = victim();
      forced(0.999, function () { DD.Act.kill(v, u); });
      t.eq(summonsOf(u, 'wm_duck').length, 0, tag + ': or not');
      const boss = DD.Act.spawn('test_boss', 4, 6, { noFx: true, silent: true });
      forced(0, function () { DD.Act.kill(boss, u); });
      t.eq(summonsOf(u, 'wm_duck').length, 0, tag + ': bosses never come back as ducks');
      let n = 0;
      for (let i = 0; i < 600; i++) {
        v = victim();
        DD.Act.kill(v, u);
        const d = summonsOf(u, 'wm_duck');
        if (d.length) { n++; d.forEach(function (x) { x.dead = true; }); }
      }
      rate(t, n, 600, L.pct, tag + ' reincarnation rate');
    },
    rp_wild_conduit: function (t, lv, L, tag, id) {
      const a = arena(id, lv, { hpMult: 60, sb: { consumables: ['test_potion'] } });
      const u = a.me, f = a.foe;
      const counts = [];
      const calls = surgeCalls(function () {
        for (let i = 1; i <= L.every * 2; i++) {
          u.ap = 99;
          DD.Combat.useSkill(u, u.basic, f.x, f.y);
          if (i === 1) DD.Combat.useConsumable(u, 0, u.x, u.y);
          counts.push(a.p.data.count);
        }
      });
      t.eq(calls.length, 2, tag + ': ' + (L.every * 2) + ' skills → 2 surges (every ' + L.every + ')');
      t.ok(calls.every(function (c) { return !!c.good === !!L.good && c.source === id; }), tag + ': ' + (L.good ? 'good surges only' : 'any surge'));
      t.eq(counts[0], 1, tag + ': consumables are not skills');
    },
    rp_gold_plated_ego: function (t, lv, L, tag) {
      [[0, 0], [100, Math.min(L.max, Math.floor(100 / L.per))], [1000, L.max]].forEach(function (c) {
        const a = arena('rp_gold_plated_ego', lv, { sb: { gold: c[0] } });
        t.eq(a.me.block, 3 + c[1], tag + ': ' + c[0] + ' gold → ' + c[1] + ' Block at turn start (+3 Overly Prepared)');
      });
    },
    rp_deja_vu: function (t, lv, L, tag) {
      const a = arena('rp_deja_vu', lv);
      const u = a.me, s = a.s, slot = u.skills[0];
      for (let r = 1; r <= L.every * 2; r++) {
        s.round = r;
        slot.cd = 5;
        const ap = u.ap;
        fire(a.p, 'onTurnStart', u);
        const hitRound = r % L.every === 0;
        t.ok(hitRound ? slot.cd === 0 && u.ap === ap + L.ap : slot.cd === 5 && u.ap === ap, tag + ': round ' + r + (hitRound ? ': cooldowns reset' + (L.ap ? ', +' + L.ap + ' AP' : '') : ': nothing'));
      }
    },
    rp_gravitational_ego: function (t, lv, L, tag) {
      arena('rp_gravitational_ego', lv, { enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 1, y: 8 }, { id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const es = DD.Combat.enemies();
      t.ok(es[0].x === 3 && es[0].y === 4, tag + ': a foe 3 tiles away is pulled 1 closer');
      t.ok(es[1].x === 1 && es[1].y === (L.r >= 4 ? 7 : 8), tag + ': a foe 4 tiles away ' + (L.r >= 4 ? 'too' : 'is out of reach'));
      t.ok(es[2].x === 2 && es[2].y === 4, tag + ': adjacent foes stay put');
      t.ok(es[3].x === 8 && es[3].y === 8, tag + ': distant foes stay put');
      t.eq(has(es[0], 'vulnerable'), !!L.vuln, tag + ': pulled foes Vulnerable: ' + !!L.vuln);
      t.ok(!has(es[2], 'vulnerable'), tag + ': unmoved foes never are');
    },
    // ---------------------------------------------------------------- legendary
    rp_chosen_one: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { maxAp: 1, dmgBonus: L.pct / 100 }, tag);
      t.eq(arena(id, lv).me.ap, 4, tag + ': 4 AP in round 1');
    },
    rp_cooldowns_social_construct: function (t, lv, L, tag) {
      const a = arena('rp_cooldowns_social_construct', lv, { hpMult: 10 });
      const u = a.me, bash = DD.getSkill('test_shield_bash'), cleave = DD.getSkill('test_cleave'), slash = DD.getSkill('test_slash');
      const first = L.cheap ? 1 : 2;
      u.ap = 10;
      t.eq(DD.Combat.costOf(u, cleave, 1).ap, first, tag + ': the first cooldown skill this turn — Wide Cleave (2 AP, cooldown 1) — costs ' + first);
      t.eq(DD.Combat.costOf(u, bash, 1).ap, 1, tag + ': Shield Bash (1 AP, cooldown 1) first: 1 (never below 1)');
      t.eq(DD.Combat.costOf(u, slash, 1).ap, 1, tag + ': the basic attack has no cooldown and costs 1');
      t.ok(DD.Combat.useSkill(u, slotOf(u, 'test_cleave'), 2, 4), tag + ': cleave');
      t.eq(u.ap, 10 - first, tag + ': paid ' + first + ' AP');
      t.eq(slotOf(u, 'test_cleave').cd, 0, tag + ': and it has no cooldown');
      t.eq(DD.Combat.costOf(u, cleave, 1).ap, 3, tag + ': the next cooldown skill costs +1 (cleave: 3)');
      t.eq(DD.Combat.costOf(u, bash, 1).ap, 2, tag + ': (bash: 2)');
      t.eq(DD.Combat.costOf(u, slash, 1).ap, 1, tag + ': the basic attack still costs 1');
      t.ok(DD.Combat.useSkill(u, slotOf(u, 'test_cleave'), 2, 4), tag + ': cleave again, same turn');
      t.eq(u.ap, 10 - first - 3, tag + ': paid 3 more');
      t.eq(slotOf(u, 'test_cleave').cd, 0, tag + ': still no cooldown');
      DD.Combat.endTurn();
      t.eq(DD.Combat.costOf(u, cleave, 1).ap, first, tag + ': next turn the first one costs ' + first + ' again');
    },
    rp_echo_chamber: function (t, lv, L, tag) {
      const a = arena('rp_echo_chamber', lv, { hpMult: 60 });
      const u = a.me, f = bare(a.foe);
      u.ap = 99;
      t.eq(lost(f, function () { forced(0, function () { DD.Combat.useSkill(u, u.basic, f.x, f.y); }); }), 10, tag + ': an echo hits twice (5 + 5)');
      t.eq(lost(f, function () { forced(0.999, function () { DD.Combat.useSkill(u, u.basic, f.x, f.y); }); }), 5, tag + ': no echo: 5');
      a.s.hype = 100;
      t.eq(lost(f, function () { forced(0, function () { DD.Combat.useSkill(u, u.signature, u.x, u.y); }); }), 15, tag + ': signatures never echo (15 once)');
      let n = 0;
      for (let i = 0; i < 1200; i++) { full(f); u.ap = 99; if (lost(f, function () { DD.Combat.useSkill(u, u.basic, f.x, f.y); }) === 10) n++; }
      rate(t, n, 1200, L.pct, tag + ' echo rate');
      // [phase 4, engine fairness] the echo is a roll: the HUD preview never gives it away. It is uncertain ("?") and
      // shows the expected hit over other rolls (between the plain hit and the echoed one), not the real roll
      let hidden = 0;
      for (let i = 0; i < 40; i++) {
        full(f); u.ap = 99;
        const prev = DD.Combat.preview(u, u.basic, f.x, f.y);
        lost(f, function () { DD.Combat.useSkill(u, u.basic, f.x, f.y); });
        const e = prev.perUnit[f.id];
        if (prev.uncertain && e && e.uncertain && e.dmg >= 5 && e.dmg <= 10) hidden++;
      }
      t.eq(hidden, 40, tag + ': the HUD preview never gives the echo away (40/40 uncertain, expected 5–10)');
    },
    rp_phoenix_feather: function (t, lv, L, tag) {
      const a = arena('rp_phoenix_feather', lv, { hpMult: 3, allies: [{ id: 'test_mage', x: 1, y: 5 }] });
      const u = a.me, f = bare(a.foe), mage = DD.Combat.heroes()[1];
      DD.Act.kill(u, a.far);
      t.ok(!u.downed && u.hp === Math.round(u.maxHp * L.pct / 100), tag + ': rises again at ' + L.pct + '% HP (' + u.hp + '/' + u.maxHp + ')');
      t.eq(f.maxHp - f.hp, L.dmg, tag + ': the adjacent foe takes ' + L.dmg + ' fire damage');
      t.eq(mage.hp, mage.maxHp, tag + ': the adjacent ally is spared');
      DD.Act.kill(u, a.far);
      t.ok(u.downed, tag + ': only once per fight');
    },
    rp_ultra_instinct: function (t, lv, L, tag) {
      const a = arena('rp_ultra_instinct', lv, { hpMult: 5, enemies: [{ id: 'test_grunt', x: 8, y: 8, hpMult: 5 }, { id: 'test_grunt', x: 8, y: 0, hpMult: 5 }] });
      const u = bare(a.me), f = bare(a.foe);
      t.eq(lost(u, function () { hit(f, u, 6); }), 0, tag + ': the first enemy hit this round: nothing');
      t.eq(f.maxHp - f.hp, L.counter, tag + ': the attacker takes ' + L.counter + ' back');
      t.eq(lost(u, function () { hit(f, u, 6); }), 6, tag + ': the second one lands');
      DD.Combat.endTurn();
      u.block = 0;
      t.eq(lost(u, function () { hit(a.far, u, 6); }), 0, tag + ': a new round: dodged again');
    },
    rp_wild_magic_overload: function (t, lv, L, tag, id) {
      const a = arena(id, lv);
      let calls = surgeCalls(function () { forced(0, function () { fire(a.p, 'onTurnStart', a.me); }); });
      t.ok(calls.length === 1 && calls[0].good === true && calls[0].source === id, tag + ': a good Wild Surge');
      calls = surgeCalls(function () { forced(0.999, function () { fire(a.p, 'onTurnStart', a.me); }); });
      t.eq(calls.length, L.pct >= 100 ? 1 : 0, tag + ': on a bad roll: ' + (L.pct >= 100 ? 'still a surge (always)' : 'nothing'));
      calls = surgeCalls(function () { for (let i = 0; i < 1500; i++) fire(a.p, 'onTurnStart', a.me); });
      rate(t, calls.length, 1500, L.pct, tag + ' surge rate');
    },
    // ---------------------------------------------------------------- cursed
    rp_cursed_glass_cannon: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { dmgBonus: L.pct / 100 }, tag);
      const a = arena(id, lv);
      const u = bare(a.me);
      t.eq(lost(u, function () { hit(a.foe, u, 10); }), Math.round(10 * (1 + L.taken / 100)), tag + ': a 10 hit deals ' + Math.round(10 * (1 + L.taken / 100)));
      t.eq(lost(u, function () { DD.Act.damage(null, u, 10, { cause: 'status', tags: ['burn'] }); }), Math.round(10 * (1 + L.taken / 100)), tag + ': from everything');
    },
    rp_cursed_kleptomaniac: function (t, lv, L, tag, id) {
      const a = arena(id, lv, { hpMult: 5 });
      hit(a.me, a.foe, 5);
      t.eq(a.s.sandboxGold, L.gold, tag + ': a skill hit steals ' + L.gold + ' gold');
      hit(a.me, a.far, 5);
      t.eq(a.s.sandboxGold, 2 * L.gold, tag + ': every hit');
      hit(a.me, a.foe, 5, { cause: 'other' });
      t.eq(a.s.sandboxGold, 2 * L.gold, tag + ': skills only');
      modCheck(t, id, lv, { price: L.price / 100 }, tag);
    },
    rp_cursed_loud_eater: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { armor: L.armor }, tag);
      // the grunt at (4,4) has a juicy mage right next to it; the Loud Eater (3 tiles away) is out of its reach
      const a = arena(id, lv, { allies: [{ id: 'test_mage', x: 5, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }] });
      const u = a.me, es = DD.Combat.enemies(), mage = DD.Combat.heroes()[1];
      u.hp = 10;
      fire(a.p, 'onTurnStart', u);
      t.eq(u.hp, 10 + L.heal, tag + ': snacking heals ' + L.heal + ' at turn start');
      fire(a.p, 'onRoundStart', u, 2);
      t.ok(has(es[0], 'taunt') && st(es[0], 'taunt').source === u.id && has(es[1], 'taunt'), tag + ': enemies within 3 tiles are Taunted by you');
      t.ok(!has(es[2], 'taunt'), tag + ': distant ones are not');
      DD.Combat.endTurn();
      const onMage = es[1].intents.some(function (it) { return DD.AI.intentTiles(es[1], it).some(function (q) { return q.x === mage.x && q.y === mage.y; }); });
      t.ok(!onMage && dist(es[1], u) < 3, tag + ': next planning ignores the adjacent mage and comes for the Loud Eater');
    },
    rp_cursed_monkey_paw: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { maxAp: 1 }, tag);
      const a = arena(id, lv);
      let calls = surgeCalls(function () { forced(0, function () { fire(a.p, 'onTurnStart', a.me); }); });
      t.ok(calls.length === 1 && calls[0].kind === 'bad' && calls[0].source === id, tag + ': the paw curls: a bad Wild Surge');
      calls = surgeCalls(function () { forced(0.999, function () { fire(a.p, 'onTurnStart', a.me); }); });
      t.eq(calls.length, 0, tag + ': or not');
      calls = surgeCalls(function () { for (let i = 0; i < 1500; i++) fire(a.p, 'onTurnStart', a.me); });
      rate(t, calls.length, 1500, L.pct, tag + ' backfire rate');
      let real = null;
      const off = DD.Events.on('wildmagic:surge', function (e) { real = e; });
      try { for (let i = 0; i < 300 && !real; i++) { full(a.me); fire(a.p, 'onTurnStart', a.me); } } finally { off(); }
      t.ok(!!real && real.good === false, tag + ': real backfires come from the bad side of the table (' + (real && real.id) + ')');
    },
    rp_cursed_couch_potato: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { maxAp: 1, dmgBonus: L.pct / 100 }, tag);
      const a = arena(id, lv, { enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = a.me;
      for (let r = 1; r <= 3; r++) {
        t.ok(has(u, 'confused') && st(u, 'confused').turns === 1, tag + ': round ' + r + ': Confused this turn');
        t.eq(u.ap, 4, tag + ': round ' + r + ': 4 AP');
        t.eq(DD.Combat.moveApCost(u), 2, tag + ': round ' + r + ': moving costs 2 AP');
        t.ok(DD.Combat.move(u, 1, r % 2 ? 5 : 4) && u.ap === 2, tag + ': round ' + r + ': one step later, 2 AP are left');
        DD.Combat.endTurn();
      }
      DD.Act.removeStatus(u, 'confused', { silent: true });
      t.eq(DD.Combat.moveApCost(u), 1, tag + ': cleansed mid-turn: moving costs 1 again (until the next turn)');
    },
    rp_cursed_narcoleptic: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { dmgBonus: L.pct / 100 }, tag);
      const a = arena(id, lv, { enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      forced(0, function () { fire(a.p, 'onTurnEnd', a.me); });
      t.ok(has(a.me, 'sleep'), tag + ': dozes off');
      DD.Combat.endTurn();
      t.ok(a.me.ap === 0 && has(a.me, 'sleep'), tag + ': and loses the next turn');
      DD.Act.removeStatus(a.me, 'sleep', { silent: true });
      forced(0.999, function () { fire(a.p, 'onTurnEnd', a.me); });
      t.ok(!has(a.me, 'sleep'), tag + ': or stays awake');
      let n = 0;
      for (let i = 0; i < 1500; i++) { fire(a.p, 'onTurnEnd', a.me); if (has(a.me, 'sleep')) { n++; DD.Act.removeStatus(a.me, 'sleep', { silent: true }); } }
      rate(t, n, 1500, L.chance, tag + ' nap rate');
    },
    rp_cursed_blood_pact: function (t, lv, L, tag) {
      const a = arena('rp_cursed_blood_pact', lv, { enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 20 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const u = a.me, cleave = slotOf(u, 'test_cleave'), bash = slotOf(u, 'test_shield_bash');
      function swing(slot) { slot.cd = 0; u.ap = 3; return DD.Combat.useSkill(u, slot, 2, 4); }
      // noPlan only skips the first planning: the grunts are kept from swinging so only the pact touches HP
      function endTurn() { DD.Combat.endTurn(); DD.Combat.enemies().forEach(function (e) { e.intents = []; }); }
      t.eq(DD.Combat.costOf(u, DD.getSkill('test_cleave'), 1).ap, 1, tag + ': Wide Cleave (2 AP) costs 1');
      t.eq(DD.Combat.costOf(u, DD.getSkill('test_shield_bash'), 1).ap, 1, tag + ': 1-AP skills stay at 1');
      t.eq(DD.Combat.costOf(u, DD.getSkill('test_slash'), 1).ap, 1, tag + ': and so does the basic attack');
      u.hp = 20;
      endTurn();
      t.eq(u.hp, 20, tag + ': a turn without a discounted skill owes nothing');
      t.ok(swing(bash), tag + ': Shield Bash (1 AP)');
      endTurn();
      t.eq(u.hp, 20, tag + ': 1-AP skills never owe anything');
      t.ok(swing(cleave), tag + ': Wide Cleave for 1 AP');
      t.eq(u.ap, 2, tag + ': paid 1 AP');
      t.ok(swing(cleave) && swing(cleave), tag + ': twice more');
      endTurn();
      t.eq(u.hp, 20 - L.hp, tag + ': the end of that turn costs ' + L.hp + ' HP (one installment per turn)');
      endTurn();
      t.eq(u.hp, 20 - L.hp, tag + ': the next quiet turn is free again');
      t.ok(swing(cleave), tag + ': again');
      u.hp = 2;
      endTurn();
      t.eq(u.hp, 1, tag + ': never below 1');
      t.ok(swing(cleave), tag + ': at 1 HP the pact still lends AP');
      endTurn();
      t.ok(u.hp === 1 && !u.downed, tag + ': and it never downs you');
    },
    rp_cursed_predatory_loan: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { hypeBonus: L.hype }, tag);
      let a = arena(id, lv, { sb: { gold: 50 } });
      t.ok(a.s.sandboxGold === 50 - L.fee && a.s.hype === L.hype, tag + ': pays ' + L.fee + ' gold, starts with ' + L.hype + ' Hype');
      t.ok(!has(a.me, 'vulnerable') && !has(a.me, 'weak'), tag + ': and no debuffs');
      a = arena(id, lv, { sb: { gold: L.fee - 1 } });
      t.ok(a.s.sandboxGold === L.fee - 1, tag + ": can't pay: keeps the gold");
      t.ok(has(a.me, 'vulnerable') && st(a.me, 'vulnerable').turns === 2 && has(a.me, 'weak') && st(a.me, 'weak').turns === 2, tag + ': ...and starts Vulnerable and Weak for 2 turns');
    },
    rp_cursed_spontaneous_combustion: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { dmgBonus: L.pct / 100 }, tag);
      const a = arena(id, lv, { allies: [{ id: 'test_mage', x: 1, y: 5 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const u = bare(a.me), mage = DD.Combat.heroes()[1];
      DD.Act.addStatus(u, 'burn', { stacks: 3 }, a.foe);
      t.ok(!has(u, 'burn'), tag + ': immune to Burn');
      t.eq(lost(u, function () { hit(a.foe, u, 6, { element: 'fire' }); }), 0, tag + ': immune to fire damage');
      t.eq(lost(u, function () { hit(a.foe, u, 6); }), 6, tag + ': but not to everything else');
      DD.Act.setSurface(0, 4, 'oil', 5);
      DD.Act.setSurface(0, 5, 'oil', 5);
      tile(1, 3).t = 'water';
      fire(a.p, 'onTurnEnd', u);
      const s04 = tile(0, 4).surface, s25 = tile(2, 4).surface, s15 = tile(1, 5).surface, s05 = tile(0, 5).surface;
      t.ok(!!s04 && s04.id === 'fire', tag + ': the oil next to you goes up in flames');
      t.ok(!!s05 && s05.id === 'fire', tag + ': and the fire spreads along it');
      t.ok(!!s15 && s15.id === 'fire' && s15.turns === 1 && !!s25 && s25.id === 'fire' && s25.turns === 1, tag + ': the other tiles around you catch fire (1 round)');
      t.ok(!tile(1, 3).surface || tile(1, 3).surface.id !== 'fire', tag + ': water does not burn');
      [{ x: 2, y: 4 }, { x: 1, y: 5 }].forEach(function (q) { DD.Act.setSurface(q.x, q.y, null); });
      DD.Combat.endTurn();
      t.ok(has(mage, 'burn'), tag + ': the ally standing next to you at the end of your turn starts Burning (allies or not)');
      t.ok(!has(u, 'burn'), tag + ': you, of course, do not');
      t.ok(!tile(1, 5).surface && !tile(2, 4).surface, tag + ': the fire is gone by the next round');
    },
    rp_cursed_gamblers_ruin: function (t, lv, L, tag) {
      const a = arena('rp_cursed_gamblers_ruin', lv, { hpMult: 50 });
      const f = bare(a.foe);
      t.eq(lost(f, function () { forced(0, function () { hit(a.me, f, 10); }); }), 20, tag + ': jackpot: 10 → 20');
      t.eq(lost(f, function () { forced(0.999, function () { hit(a.me, f, 10); }); }), 5, tag + ': bust: 10 → 5');
      let n = 0;
      for (let i = 0; i < 1500; i++) { full(f); if (lost(f, function () { hit(a.me, f, 10); }) === 20) n++; }
      rate(t, n, 1500, L.win, tag + ' jackpot rate');
    },
    rp_cursed_duck_mafia: function (t, lv, L, tag, id) {
      unitDelta(t, id, lv, { maxAp: 1 }, tag);
      [1, 2, 3].forEach(function (act) {
        arena(id, lv, { sb: { run: fakeRun({ act: act }) } });
        const ducks = enemiesOf('wm_duck_foe');
        t.eq(ducks.length, L.base + act - 1, tag + ': act ' + act + ': ' + (L.base + act - 1) + ' Hostile Ducks');
      });
      arena(id, lv);
      t.eq(enemiesOf('wm_duck_foe').length, L.base, tag + ': outside a run it counts as act 1');
    },
  };

  // ---- suites ----------------------------------------------------------------------------------------------
  T.suite('passive-table: every entry is well-formed (fields, rarity, weight, levels, desc per level, flavor, icon, hooks, stats, runMods)', function (t) {
    const ids = rpIds();
    t.ok(ids.length > 0, 'the table has entries');
    // registered cleanly: no duplicate ids or missing required fields were reported while the table loaded
    const loadWarns = DD.problems.filter(function (w) { return /register passives|passives "rp_|passive rp_/.test(String(w)); });
    t.eq(loadWarns.length, 0, 'no registry warnings for the table' + (loadWarns.length ? ': ' + loadWarns.slice(0, 3).join(' | ') : ''));
    const names = {}, icons = {};
    ids.forEach(function (id) {
      const d = DD.getPassive(id);
      const L0 = 'passive ' + id;
      t.ok(typeof d.name === 'string' && d.name.trim().length > 0 && d.name.length <= 30, L0 + ': name (≤ 30 chars: two lines on a Blessing card)');
      t.ok(!names[d.name], L0 + ': unique name "' + d.name + '"');
      names[d.name] = 1;
      t.ok(typeof d.icon === 'string' && d.icon.length > 0 && d.icon.length <= 8 && !/[a-z0-9]/i.test(d.icon), L0 + ': one emoji icon');
      t.ok(!icons[d.icon], L0 + ': unique icon ' + d.icon + (icons[d.icon] ? ' (also ' + icons[d.icon] + ')' : ''));
      icons[d.icon] = id;
      t.ok(RARITIES.indexOf(d.rarity) >= 0, L0 + ': rarity "' + d.rarity + '"');
      t.ok(typeof d.weight === 'number' && isFinite(d.weight) && d.weight > 0, L0 + ': weight > 0');
      t.eq(d.rarity === 'cursed', /^Cursed: /.test(d.name), L0 + ': cursed entries (and only they) are named "Cursed: …"');
      t.ok(Array.isArray(d.levels) && d.levels.length >= 1 && d.levels.length <= 3, L0 + ': 1-3 levels');
      t.eq(d.maxLevel, d.levels.length, L0 + ': maxLevel = levels.length');
      t.ok(typeof d.flavor === 'string' && d.flavor.trim().length > 0 && d.flavor.length <= 120 && !badText(d.flavor), L0 + ': flavor (≤ 120 chars): ' + d.flavor.length);
      t.ok(Array.isArray(d.tags), L0 + ': tags array');
      t.ok(typeof d.desc === 'function' || typeof d.desc === 'string', L0 + ': desc');
      t.ok(d.hooks && typeof d.hooks === 'object', L0 + ': hooks object');
      Object.keys(d.hooks || {}).forEach(function (k) {
        t.ok(HOOKS.indexOf(k) >= 0, L0 + ': known hook name "' + k + '"');
        t.ok(typeof d.hooks[k] === 'function', L0 + ': hook ' + k + ' is a function');
      });
      t.ok(d.stats === null || typeof d.stats === 'object' || typeof d.stats === 'function', L0 + ': stats null | object | fn');
      t.ok(d.runMods === null || typeof d.runMods === 'function' || typeof d.runMods === 'object', L0 + ': runMods null | fn');
      t.ok(d.requires === null || typeof d.requires === 'function', L0 + ': requires null | fn');
      t.ok(Object.keys(d.hooks || {}).length > 0 || !!d.stats || !!d.runMods, L0 + ': does something (hooks, stats or runMods)');
      t.ok(typeof SPECS[id] === 'function', L0 + ': has a behaviour spec in tests/content/passives.js');
      const seen = {};
      for (let lv = 1; lv <= d.levels.length; lv++) {
        const L = d.levels[lv - 1];
        const tag = L0 + ' L' + lv;
        t.ok(L && typeof L === 'object' && !Array.isArray(L), tag + ': level is an object');
        const text = DD.passiveDesc({ id: id, level: lv });
        t.ok(!badText(text) && text.length <= 260, tag + ': desc "' + text + '"');
        t.ok(!seen[text], tag + ': desc differs from the other levels');
        seen[text] = 1;
        const stats = DD.passiveStats({ id: id, level: lv });
        if (stats !== null) {
          t.ok(typeof stats === 'object', tag + ': stats object');
          Object.keys(stats || {}).forEach(function (k) {
            t.ok(STAT_KEYS.indexOf(k) >= 0 && typeof stats[k] === 'number' && isFinite(stats[k]), tag + ': stat ' + k + ' = ' + stats[k]);
          });
        }
        if (d.runMods) {
          const m = typeof d.runMods === 'function' ? d.runMods(L, lv) : d.runMods;
          t.ok(m && typeof m === 'object', tag + ': runMods object');
          Object.keys(m || {}).forEach(function (k) {
            t.ok(MOD_KEYS.indexOf(k) >= 0 && typeof m[k] === 'number' && isFinite(m[k]) && Math.abs(m[k]) <= 1, tag + ': runMods.' + k + ' = ' + m[k]);
          });
        }
      }
    });
    Object.keys(SPECS).forEach(function (id) { t.ok(!!DD.getPassive(id), 'spec ' + id + ' matches a registered passive'); });
  });

  T.suite('passive-table: the table is big, very random and in the designed rarity mix', function (t) {
    const ids = rpIds();
    const by = {}, weight = {};
    let total = 0;
    RARITIES.forEach(function (r) { by[r] = 0; weight[r] = 0; });
    ids.forEach(function (id) { const d = DD.getPassive(id); by[d.rarity]++; weight[d.rarity] += d.weight; total += d.weight; });
    t.log('entries: ' + ids.length + ' — ' + RARITIES.map(function (r) { return r + ' ' + by[r]; }).join(', '));
    t.log('d100 share: ' + RARITIES.map(function (r) { return r + ' ' + (100 * weight[r] / total).toFixed(1) + '%'; }).join(', '));
    t.ok(ids.length >= 70 && ids.length <= 85, 'about 75 entries (' + ids.length + ')');
    t.ok(by.common >= 28 && by.uncommon >= 16 && by.rare >= 9 && by.legendary >= 6 && by.cursed >= 10, 'rarity mix ~30/18/10/6/11');
    const req = ids.filter(function (id) { return typeof DD.getPassive(id).requires === 'function'; });
    t.ok(req.length >= 4 && req.length <= 12, 'a few hero-specific entries (' + req.join(', ') + ')');
    const tagCount = {};
    ids.forEach(function (id) { (DD.getPassive(id).tags || []).forEach(function (g) { tagCount[g] = (tagCount[g] || 0) + 1; }); });
    ['proc', 'wildmagic', 'duck', 'teleport', 'gold', 'run', 'surface', 'hype', 'status', 'stat'].forEach(function (g) {
      t.ok(tagCount[g] > 0, 'has "' + g + '" entries (' + (tagCount[g] || 0) + ')');
    });
    if (DD.Passives && typeof DD.Passives.table === 'function') {
      const tbl = DD.Passives.table(null);
      t.ok(tbl.length >= ids.length, 'DD.Passives.table lists every entry');
      const fresh = DD.Combat.makeRunHero({ id: 'test_knight' });
      fresh.passives = [];
      const rng = DD.RNG('pt-roll-mix');
      const got = {};
      for (let i = 0; i < 4000; i++) { const r = DD.Passives.roll(fresh, rng); if (r) got[r.rarity] = (got[r.rarity] || 0) + 1; }
      t.log('4000 level-up rolls for a test knight: ' + RARITIES.map(function (r) { return r + ' ' + (got[r] || 0); }).join(', '));
      t.ok(got.common > got.uncommon && got.uncommon > got.rare && got.rare > got.legendary && got.cursed > got.rare, 'rolls follow the weights');
      const start = {};
      for (let i = 0; i < 1000; i++) { const r = DD.Passives.roll(fresh, rng, { noCursed: true }); if (r) start[r.rarity] = (start[r.rarity] || 0) + 1; }
      t.ok(!start.cursed, 'run-start rolls (noCursed) never give a cursed one');
    }
  });

  T.suite('passive-table: requires() never throws, always answers yes/no and picks the right heroes', function (t) {
    const req = rpIds().filter(function (id) { return typeof DD.getPassive(id).requires === 'function'; });
    const heroes = Object.keys(DD.defs.heroes);
    const odd = [[undefined, undefined], [null, null], [{}, null], [{ id: 'nobody' }, undefined], [{ id: 'test_knight', skills: 5 }, null],
      [{ id: 'x', skills: [null, 7, { id: 'nope' }] }, { id: 'x', skillPool: 'oops', summons: 'corgi?', flags: null, basic: 42 }],
      [{ id: 'x' }, { id: 'x', skillPool: [null, 'nope'], startingSkills: null, summons: [], flags: { flying: false } }]];
    req.forEach(function (id) {
      const def = DD.getPassive(id);
      heroes.forEach(function (hid) {
        const r1 = t.tryRun(id + ' requires(' + hid + ')', function () { return def.requires(rh(hid), DD.getHero(hid)); });
        const r2 = t.tryRun(id + ' requires(' + hid + ', no def)', function () { return def.requires(rh(hid)); });
        t.ok(typeof r1 === 'boolean' && r1 === r2, id + ' requires(' + hid + ') → ' + r1);
      });
      odd.forEach(function (args, i) {
        const r = t.tryRun(id + ' requires(odd #' + i + ')', function () { return def.requires(args[0], args[1]); });
        t.ok(typeof r === 'boolean', id + ': odd input #' + i + ' → ' + r);
      });
    });
    // the real heroes these were written for (only when they are registered)
    [['rp_pyromaniac', 'zarathor'], ['rp_compound_interest', 'zarathor'], ['rp_frequent_flyer', 'syllamin'], ['rp_proud_pet_parent', 'ellaria'],
      ['rp_proud_pet_parent', 'josiah'], ['rp_blood_bank_card', 'sparrow'], ['rp_bedside_manner', 'ellaria'], ['rp_bedside_manner', 'josiah'],
      ['rp_compound_interest', 'buga']].forEach(function (c) {
      if (!DD.getHero(c[1]) || !DD.getPassive(c[0])) return;
      t.ok(DD.getPassive(c[0]).requires(rh(c[1]), DD.getHero(c[1])), c[0] + ' is available to ' + c[1]);
    });
    t.ok(!DD.getPassive('rp_frequent_flyer').requires(rh('test_knight'), DD.getHero('test_knight')), 'a grounded knight never sees Frequent Flyer Miles');
  });

  /** Run every spec of one rarity, at every level. */
  function specSuite(rarity) {
    T.suite('passive-table: ' + rarity + ' entries do exactly what their desc says, at every level', function (t) {
      const ids = rpIds(rarity);
      let runs = 0;
      ids.forEach(function (id) {
        const def = DD.getPassive(id);
        const spec = SPECS[id];
        if (!spec) { t.fail('passive ' + id + ': no spec'); return; }
        for (let lv = 1; lv <= def.levels.length; lv++) {
          const tag = id + ' L' + lv;
          t.tryRun(tag, function () { spec(t, lv, DD.skillLevel(def, lv), tag, id); });
          if (T.contentHelpers && T.contentHelpers.sanity && DD.Combat.state) T.contentHelpers.sanity(t, tag + ' (state sane)');
          runs++;
        }
      });
      t.log(rarity + ': ' + ids.length + ' entries, ' + runs + ' entry-levels checked');
    });
  }
  RARITIES.forEach(specSuite);

  T.suite('passive-table: stats on every entry reach the hero sheet and the unit (heroStats, combat units)', function (t) {
    rpIds().forEach(function (id) {
      const def = DD.getPassive(id);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        const want = DD.passiveStats({ id: id, level: lv }) || {};
        const base = DD.Combat.heroStats(DD.Combat.makeRunHero({ id: 'test_knight', level: 4 }));
        const got = DD.Combat.heroStats(DD.Combat.makeRunHero({ id: 'test_knight', level: 4, passives: [{ id: id, level: lv }] }));
        STAT_KEYS.forEach(function (k) {
          const f = k === 'hp' ? 'maxHp' : k;
          const delta = (got[f] || 0) - (base[f] || 0);
          t.ok(Math.abs(delta - (want[k] || 0)) < 1e-6, id + ' L' + lv + ': heroStats.' + f + ' +' + (want[k] || 0) + ' (got ' + delta + ')');
        });
      }
    });
  });

  // ---- previews: the HUD previews every hover; passives must keep them pure and exact ----------------------------
  function fingerprint(s) {
    return JSON.stringify([s.units.map(function (u) {
      return [u.id, u.x, u.y, u.hp, u.maxHp, u.block, u.ap, !!u.dead, !!u.downed, (u.statuses || []).map(function (q) { return [q.id, q.stacks, q.turns]; }),
        (u.passives || []).map(function (p) { return [p.id, p.level, p.data]; }), DD.Combat.slotsOf(u).map(function (sl) { return [sl.id, sl.cd, sl.uses]; })];
    }), s.rng.getState(), s.hype, s.sandboxGold, s.log.length, s.rules.length, (s.consumables || []).length,
    s.grid.tiles.map(function (tl) { return (tl.surface ? tl.surface.id : '') + (tl.obj ? tl.obj.id + tl.obj.hp : ''); }).join('|')]);
  }
  // [phase 4, engine fairness] "exactly" holds for certain previews; a hit that rolls dice (a proc, a gamble) previews
  // uncertain: other rolls' expected outcome, flagged "?", never the real roll
  T.suite('passive-table: HUD previews with random passives stay side-effect free and predict the hit exactly', function (t) {
    const ids = rpIds();
    const rng = DD.RNG('pt-previews');
    let checks = 0, exact = 0, rolls = 0;
    for (let i = 0; i < 40; i++) {
      const loadout = rng.sample(ids, 4).map(function (id) { return { id: id, level: rng.int(1, DD.getPassive(id).levels.length) }; });
      const label = 'loadout #' + i + ' [' + loadout.map(function (p) { return p.id + ' ' + p.level; }).join(', ') + ']';
      const a = arena(null, 1, { me: { passives: loadout }, hpMult: 8, allies: [{ id: 'test_mage', x: 1, y: 6 }], sb: { seed: 100 + i, gold: 40 } });
      const u = a.me, f = a.foe;
      if (!u || u.downed || !f || f.dead) continue;
      for (let k = 0; k < 3 && !a.s.result && DD.Combat.canUse(u, u.basic) === true; k++) {
        const fp = fingerprint(a.s);
        const prev = DD.Combat.preview(u, u.basic, f.x, f.y);
        t.eq(fingerprint(a.s), fp, label + ' hit ' + k + ': the preview left the real fight untouched');
        const before = { foe: f.hp, me: u.hp };
        DD.Combat.useSkill(u, u.basic, f.x, f.y);
        const pu = prev.perUnit[f.id] || { dmg: 0 };
        checks++;
        if (prev.uncertain) {
          rolls++;
          if (!Object.keys(prev.perUnit).every(function (id) { return prev.perUnit[id].uncertain; })) t.fail(label + ' hit ' + k + ': uncertain preview with a badge that is not "?"');
        } else if (pu.dmg === before.foe - f.hp) exact++;
        else t.fail(label + ' hit ' + k + ': preview said −' + pu.dmg + ', the hit did −' + (before.foe - f.hp));
        if (f.dead) break;
      }
    }
    t.log('preview checks: ' + exact + '/' + (checks - rolls) + ' certain ones exact, ' + rolls + ' rolled dice (uncertain)');
    t.ok(checks > 60, 'enough preview checks (' + checks + ')');
  });

  // ---- Echo Chamber resolves other authors' skills a second time: every hero / generic skill must survive that ----
  function echoTarget(u, slot) {
    const tiles = DD.Combat.targets(u, slot) || [];
    function at(q) { const o = DD.Grid.unitAt(q.x, q.y); return o && !o.dead ? o : null; }
    return tiles.filter(function (q) { const o = at(q); return o && o.side === 'enemy'; })[0] ||
      tiles.filter(function (q) { return !!at(q); })[0] || tiles[0] || null;
  }
  /** Preview vs reality per unit (HP change and downs), the content suite's yardstick. */
  function previewGaps(prev, s, before) {
    const out = [];
    s.units.forEach(function (u) {
      const b = before[u.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[u.id];
      const real = b.hp - u.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
      if (real !== said) out.push(u.name + ' HP ' + (-real) + ' for real, preview said ' + (-said));
      const down = (u.dead && !b.dead) || (u.downed && !b.downed);
      if (down !== !!(e && e.lethal)) out.push(u.name + (down ? ' went down unannounced' : ' was predicted to go down'));
    });
    return out;
  }
  /** One use of skill s by heroId (max skill level, hero level 10) with Echo Chamber at pct (100: always, no RNG used). */
  function echoUse(s, heroId, isBasic, pct) {
    quiet({ seed: 11, gold: 50, heroes: [
      { id: heroId, x: 4, y: 4, level: 10, skills: isBasic ? [] : [{ id: s.id, level: s.levels.length }], passives: [{ id: 'rp_echo_chamber', level: 2 }] },
      { id: 'test_mage', x: 3, y: 4, level: 3 }, { id: 'test_cleric', x: 4, y: 3, level: 3 }],
    enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 6, y: 5, hpMult: 4 }, { id: 'test_archer', x: 4, y: 7, hpMult: 4 },
      { id: 'test_brute', x: 7, y: 2, hpMult: 4 }],
    objects: [{ x: 2, y: 2, id: 'crate' }, { x: 3, y: 6, id: 'barrel' }] });
    const st = DD.Combat.state, hs = DD.Combat.heroes(), u = hs[0];
    if (hs[2]) DD.Act.kill(hs[2], null); // a downed ally, so revives have a target
    const p = instOf(u, 'rp_echo_chamber');
    p.L = { pct: pct }; // the instance's own copy (the def's levels stay untouched)
    const slot = isBasic ? u.basic : slotOf(u, s.id);
    if (!slot) return { skip: 'not slotted' };
    u.ap = 99;
    const can = DD.Combat.canUse(u, slot);
    if (can !== true) return { skip: String(can) };
    const tg = echoTarget(u, slot);
    if (!tg) return { skip: 'no target' };
    const fp = fingerprint(st);
    const prev = DD.Combat.preview(u, slot, tg.x, tg.y);
    const pure = fingerprint(st) === fp;
    const before = {};
    st.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed }; });
    let echoed = 0;
    const off = DD.Events.on('combat:log', function (e) { if (e && e.text && e.text.indexOf('(Echo Chamber): ') >= 0) echoed++; });
    try { DD.Combat.useSkill(u, slot, tg.x, tg.y); } finally { off(); }
    const gaps = previewGaps(prev, st, before);
    return { pure: pure, echoed: echoed, gaps: gaps, at: tg, exactable: typeof s.preview !== 'function' && (s.tags || []).indexOf('random') < 0 };
  }
  T.suite('passive-table: Echo Chamber can echo every hero and generic skill (no errors, sane state, previews stay exact)', function (t) {
    const skills = Object.keys(DD.defs.skills).sort().map(DD.getSkill).filter(function (s) {
      return s && Array.isArray(s.levels) && s.levels.length && (s.owner === 'generic' || (s.owner !== 'enemy' && !!DD.getHero(s.owner)));
    });
    let used = 0, echoed = 0;
    const skipped = [], notes = [];
    skills.forEach(function (s) {
      const hero = s.owner === 'generic' ? 'test_knight' : s.owner;
      const hdef = DD.getHero(hero);
      if (hdef.signature === s.id) return; // signatures never echo (the legendary spec checks that)
      const label = 'echo ' + s.id + ' (' + hero + ')';
      const p0 = DD.problems.length;
      const r = t.tryRun(label, function () {
        const res = echoUse(s, hero, hdef.basic === s.id, 100);
        if (!res.skip) {
          used++;
          if (res.echoed) echoed++;
          t.ok(res.pure, label + ': the HUD preview (echo included) left the real fight untouched');
          if (res.gaps.length && res.exactable) {
            const ctl = echoUse(s, hero, hdef.basic === s.id, 0);
            if (!ctl.skip && !ctl.gaps.length) t.fail(label + ': the echo breaks an exact preview: ' + res.gaps.join('; '));
            else notes.push(s.id + ' (preview inexact without an echo too: the content suite owns that)');
          }
          if (T.contentHelpers && T.contentHelpers.sanity) T.contentHelpers.sanity(t, label + ' (state sane)');
          if (!DD.Combat.state.result) DD.Combat.endTurn();
        } else skipped.push(s.id + ' (' + res.skip + ')');
        return res;
      });
      DD.problems.slice(p0).filter(function (w) { return /^Error in /.test(w); }).forEach(function (w) { t.fail(label + ': ' + w.slice(0, 300)); });
      return r;
    });
    t.log(skills.length + ' hero/generic skills, ' + used + ' used with a forced echo, ' + echoed + ' echoed (the rest lost their target first)');
    if (skipped.length) t.log('not usable in the echo arena: ' + skipped.join(', '));
    if (notes.length) t.log('notes: ' + notes.join(', '));
    t.ok(used >= Math.min(10, skills.length) && echoed > 0, 'enough skills echoed (' + echoed + '/' + used + ')');
  });

  // ---- determinism: the table's dice are the fight's dice ------------------------------------------------------------
  /** Gameplay outcome of a fight (no log: narration lines roll cosmetic dice). */
  function outcome(s) {
    return JSON.stringify([s.result, s.round, s.hype, s.sandboxGold, s.run && s.run.gold, s.units.map(function (u) {
      return [u.defId, u.side, u.x, u.y, u.hp, u.maxHp, u.block, !!u.dead, !!u.downed, (u.statuses || []).map(function (q) { return q.id + q.stacks + '/' + q.turns; }).join(','),
        (u.passives || []).map(function (p) { return p.id + p.level; }).join(',')];
    }), s.grid.tiles.map(function (tl) { return (tl.surface ? tl.surface.id + tl.surface.turns : '') + (tl.obj ? tl.obj.id + tl.obj.hp : ''); }).join('|')]);
  }
  /** Spy on a dice function: record calls whose first caller outside js/core/ is js/data/passives.js. Returns the undo. */
  function diceSpy(obj, key, label, bad) {
    const orig = obj[key];
    obj[key] = function () {
      const frames = String(new Error().stack || '').split('\n').slice(2);
      const caller = frames.filter(function (l) { return /\.js/.test(l) && !/\/js\/core\//.test(l); })[0] || '';
      if (/\/js\/data\/passives\.js/.test(caller)) bad.push(label + ' ' + caller.trim());
      return orig.apply(this, arguments);
    };
    return function () { obj[key] = orig; };
  }
  T.suite('passive-table: the same seed and loadout replay the same fight; hooks never roll Math.random or the cosmetic DD.rng', function (t) {
    const plan = fixturePlan();
    if (typeof plan === 'string') { t.skip(plan); return; }
    const pool = FIXTURE_HEROES.filter(DD.getHero);
    const ids = rpIds();
    const rng = DD.RNG('pt-det');
    const deal = dealer(rng, ids);
    const played = {};
    const bad = [];
    const undo = [diceSpy(Math, 'random', 'Math.random', bad), diceSpy(DD.rng, 'next', 'DD.rng.next', bad)];
    let same = 0, n = 0;
    try {
      for (let i = 0; i < 24; i++) {
        const pl = plan[i % plan.length], enc = pl.encs[0];
        const heroes = rng.sample(pool, 4);
        const party = autoParty(heroes, pl.level, rng, deal, played);
        const seed = rng.int(1, 1e9);
        const runs = [0, 1].map(function () {
          const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('pt-det-build:' + seed), difficulty: 'normal', act: enc.act });
          DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: enc.kind,
            run: { act: enc.act, gold: 40, consumables: [], maxConsumables: 3, difficulty: 'normal', party: party } });
          const s = DD.Combat.state;
          DD.AutoPlay.runBattle(10);
          return outcome(s);
        });
        n++;
        if (runs[0] === runs[1]) same++;
        else t.fail('fight #' + i + ' (' + enc.id + ', ' + heroes.join('+') + ') played out differently with the same seed: ' +
          JSON.stringify(party.map(function (h) { return h.passives; })));
      }
    } finally { undo.forEach(function (f) { f(); }); }
    t.eq(same, n, 'identical replays (' + same + '/' + n + ' fights, ' + Object.keys(played).length + ' Blessings in play)');
    t.ok(Object.keys(played).length === ids.length, 'every Blessing was in a replayed fight');
    t.eq(bad.length, 0, 'no Blessing hook rolls Math.random or DD.rng itself' + (bad.length ? ': ' + bad.slice(0, 3).join(' | ') : ''));
  });

  // ---- the run-only Blessings in a live run: gold, interest and consumables go through DD.Run -------------------------
  T.suite('passive-table: run-side Blessings in a live DD.Run (fees, interest, gold, finds and runMods go through the run)', function (t) {
    if (!DD.Run || typeof DD.Run.newRun !== 'function' || !DD.Passives || !DD.getEncounter('test_a1_normal') ||
        FIXTURE_HEROES.slice(0, 4).some(function (h) { return !DD.getHero(h); })) { t.skip('run layer or fixtures not loaded'); return; }
    const S = function () { return DD.Run.state; };
    const savedUi = DD.Run.useUi, savedMeta = DD.util.deepClone(DD.Meta.data);
    const p0 = DD.problems.length;
    DD.Run.useUi = false;
    try {
      DD.Run.newRun(FIXTURE_HEROES.slice(0, 4), 'normal', 'pt-live');
      const loads = [['rp_cursed_predatory_loan', 'rp_ghost_accountant'], ['rp_participation_trophy', 'rp_quantum_pockets'],
        ['rp_compound_interest'], ['rp_coin_magnet']];
      S().party.forEach(function (h, i) { h.passives = loads[i].map(function (id) { return { id: id, level: 1 }; }); });
      S().gold = 100;
      S().consumables = [];
      const node = DD.Run.availableNodes()[0];
      node.type = 'combat';
      node.encounterId = 'test_a1_normal'; // fixture enemies only: independent of content in progress
      t.ok(DD.Run.travel(node.id) && DD.Run.inCombat(), 'a live run fight starts');
      const cs = DD.Combat.state;
      const hs = DD.Combat.heroes();
      // fight start, in party order: the loan's fee (spendGold) first, then 5% interest on what is left
      t.eq(S().gold, 100 - 10 + Math.floor(90 * 0.05), 'Predatory Loan paid 10 through the run, Compound Interest added 5% of 90');
      t.eq(cs.hype, 30, 'the loan\'s Hype is in the fight');
      // Quantum Pockets fills the run's bag, never past its size
      const qp = instOf(hs[1], 'rp_quantum_pockets');
      S().consumables.length = 0; // (the fight start had its own 20% roll)
      forced(0, function () { fire(qp, 'onCombatStart', hs[1]); });
      t.ok(S().consumables.length === 1 && !!DD.getConsumable(S().consumables[0]), 'Quantum Pockets put a consumable in the run\'s bag (' + S().consumables[0] + ')');
      while (S().consumables.length < S().maxConsumables) S().consumables.push(S().consumables[0]);
      forced(0, function () { fire(qp, 'onCombatStart', hs[1]); });
      t.eq(S().consumables.length, S().maxConsumables, 'a full bag stays full');
      // the win: the rogue kills everything (Coin Magnet), then the end-of-fight gold (Ghost Accountant, Participation Trophy)
      const deltas = [];
      let ended = false;
      const offGold = DD.Events.on('run:gold', function (e) { if (!ended) deltas.push(e.delta); });
      const offEnd = DD.Events.on('combat:end', function () { ended = true; });
      try {
        DD.Combat._action(function () { DD.Combat.enemies().forEach(function (e) { DD.Act.kill(e, hs[3]); }); });
      } finally { offGold(); offEnd(); }
      const kills = cs.units.filter(function (u) { return u.side === 'enemy' && u.dead; }).length;
      t.eq(cs.result, 'victory', 'the fight is won');
      t.eq(deltas.join(','), Array(kills + 1).join('2,') + '5,5', 'run gold: +2 per Coin Magnet kill, then +5 (Ghost Accountant) and +5 (Participation Trophy)');
      t.ok(!DD.Run.inCombat() && S().pending && S().pending.type === 'rewards', 'the run moved on to the rewards');
      // runMods are read live by the run: Trust Fund and the Kleptomaniac's prices
      S().party[2].passives = [{ id: 'rp_trust_fund', level: 3 }, { id: 'rp_cursed_kleptomaniac', level: 1 }];
      t.ok(Math.abs(DD.Run.passiveMods().gold - 0.2) < 1e-9 && Math.abs(DD.Run.passiveMods().price - 0.4) < 1e-9, 'the run sees +20% gold and +40% prices');
      const g = S().gold;
      DD.Run.addGold(10);
      t.eq(S().gold, g + 12, 'gold income is 20% higher');
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
    const warns = DD.problems.slice(p0);
    t.eq(warns.length, 0, 'no warnings' + (warns.length ? ': ' + warns.slice(0, 3).join(' | ') : ''));
  });

  // ---- the hero-only Blessings against the real kits they were written for ---------------------------------------------
  /** One sandbox with hero heroId (level 8, kit skills at level 3) holding passive pid (or not), an ally and two foes. */
  function kitArena(heroId, pid, lv, skills, seed) {
    quiet({ w: 9, h: 9, seed: seed || 5, gold: 100, heroes: [
      { id: heroId, x: 2, y: 4, level: 8, skills: skills, passives: pid ? [{ id: pid, level: lv }] : [] }, { id: 'test_knight', x: 2, y: 5, level: 3 }],
    enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 20 }, { id: 'test_grunt', x: 7, y: 7, hpMult: 20 }] });
    const hs = DD.Combat.heroes();
    hs.forEach(function (h) { h.ap = 20; });
    return { s: DD.Combat.state, u: hs[0], ally: hs[1], foe: DD.Combat.enemies()[0] };
  }
  function kitSkills(heroId, fn) {
    const h = DD.getHero(heroId);
    const ids = [h.basic].concat(h.skillPool || [], h.startingSkills || []).filter(function (id, i, a) { return id && a.indexOf(id) === i && DD.getSkill(id); });
    return ids.map(DD.getSkill).filter(fn);
  }
  /** Use slot (first valid target matching pick) and return the target tile, or null. */
  function useOn(a, slot, pick) {
    if (!slot || DD.Combat.canUse(a.u, slot) !== true) return null;
    const tiles = DD.Combat.targets(a.u, slot) || [];
    const tg = tiles.filter(pick || function () { return true; })[0];
    if (!tg) return null;
    return DD.Combat.useSkill(a.u, slot, tg.x, tg.y) ? tg : null;
  }
  T.suite('passive-table: hero-only Blessings work with the real kits they were written for', function (t) {
    const heroes = Object.keys(DD.defs.heroes).filter(function (id) { return id.indexOf('test_') !== 0; }).sort();
    if (!heroes.length) { t.skip('no real heroes registered'); return; }
    function eligible(pid) { return heroes.filter(function (h) { return DD.getPassive(pid).requires(rh(h), DD.getHero(h)); }); }
    function note(msg) { t.log(msg); return msg; }
    let checked = 0;
    // Pyromaniac: a fire skill hit deals exactly +dmg more (flat bonus, after every multiplier)
    eligible('rp_pyromaniac').forEach(function (hid) {
      const def = DD.getPassive('rp_pyromaniac'), L = DD.skillLevel(def, 2);
      const fire = kitSkills(hid, function (s) { return (s.tags || []).indexOf('fire') >= 0 && s.kind !== 'buff' && s.target && s.target.type !== 'self' && !(s.hype > 0); });
      const used = fire.some(function (s) {
        const out = [null, 'rp_pyromaniac'].map(function (pid) {
          const a = kitArena(hid, pid, 2, s.id === DD.getHero(hid).basic ? [] : [{ id: s.id, level: 1 }]);
          const slot = slotOf(a.u, s.id);
          const h0 = a.foe.hp;
          const tg = useOn(a, slot, function (q) { return q.x === a.foe.x && q.y === a.foe.y; });
          return tg ? h0 - a.foe.hp : null;
        });
        if (out[0] === null || out[1] === null || !(out[0] > 0)) return false;
        t.eq(out[1] - out[0], L.dmg, note('Pyromaniac on ' + hid + ': ' + s.name + ' deals +' + L.dmg + ' (' + out[0] + ' → ' + out[1] + ')'));
        return true;
      });
      t.ok(used, 'Pyromaniac on ' + hid + ': a fire skill of the real kit was tested');
      checked++;
    });
    // Bedside Manner: a heal skill on a hurt ally heals more (heal skills credit their user, so healBonus applies)
    eligible('rp_bedside_manner').forEach(function (hid) {
      const heals = kitSkills(hid, function (s) { return (s.kind === 'heal' || (s.tags || []).indexOf('heal') >= 0) && !(s.hype > 0); });
      const used = heals.some(function (s) {
        const out = [null, 'rp_bedside_manner'].map(function (pid) {
          const a = kitArena(hid, pid, 2, s.id === DD.getHero(hid).basic ? [] : [{ id: s.id, level: 1 }]);
          a.ally.hp = 1;
          a.u.hp = Math.max(1, Math.floor(a.u.maxHp / 3));
          const before = a.ally.hp + a.u.hp;
          const tg = useOn(a, slotOf(a.u, s.id), function (q) { return q.x === a.ally.x && q.y === a.ally.y; }) ||
            useOn(a, slotOf(a.u, s.id), function (q) { return !DD.Grid.unitAt(q.x, q.y) || !DD.Grid.hostile(a.u, DD.Grid.unitAt(q.x, q.y)); });
          return tg ? a.ally.hp + a.u.hp - before : null;
        });
        if (out[0] === null || out[1] === null || !(out[0] > 0)) return false;
        t.ok(out[1] > out[0], note('Bedside Manner on ' + hid + ': ' + s.name + ' heals more (' + out[0] + ' → ' + out[1] + ')'));
        return true;
      });
      t.ok(used, 'Bedside Manner on ' + hid + ': a heal skill of the real kit was tested');
      checked++;
    });
    // Proud Pet Parent: every summon the hero brings (passive or skill) gets +hp max HP and +pct% damage
    eligible('rp_proud_pet_parent').forEach(function (hid) {
      const def = DD.getPassive('rp_proud_pet_parent'), L = DD.skillLevel(def, 3);
      const summoners = kitSkills(hid, function (s) { return s.kind === 'summon' && !(s.hype > 0); });
      const pets = function (a) { return a.s.units.filter(function (o) { return o.kind === 'summon' && o.ownerId === a.u.id && !o.dead; }); };
      const out = [null, 'rp_proud_pet_parent'].map(function (pid) {
        const a = kitArena(hid, pid, 3, summoners.slice(0, 3).map(function (s) { return { id: s.id, level: 1 }; }));
        summoners.slice(0, 3).forEach(function (s) { useOn(a, slotOf(a.u, s.id)); });
        return pets(a).map(function (o) { return [o.defId, o.maxHp, o.dmgBonus || 0]; }).sort().join(';');
      });
      const base = out[0].split(';').filter(Boolean), with_ = out[1].split(';').filter(Boolean);
      t.ok(with_.length > 0 && with_.length === base.length, 'Proud Pet Parent on ' + hid + ': the real kit brings summons (' + with_.length + ')');
      with_.forEach(function (row, i) {
        const b = (base[i] || '').split(','), w = row.split(',');
        t.ok(b[0] === w[0] && +w[1] - +b[1] === L.hp && Math.abs(+w[2] - +b[2] - L.pct / 100) < 1e-9,
          note('Proud Pet Parent on ' + hid + ': ' + w[0] + ' gets +' + L.hp + ' max HP and +' + L.pct + '% damage (' + b.join('/') + ' → ' + w.join('/') + ')'));
      });
      checked++;
    });
    // Blood Bank Loyalty Card: every HP cost in the real kit drops by n (min 0)
    eligible('rp_blood_bank_card').forEach(function (hid) {
      const def = DD.getPassive('rp_blood_bank_card'), L = DD.skillLevel(def, 3);
      const costly = kitSkills(hid, function (s) { return +DD.resolve(s.hpCost, DD.skillLevel(s, 1), null, 0) > 0; });
      t.ok(costly.length >= 2, 'Blood Bank Loyalty Card on ' + hid + ': the kit has HP costs (' + costly.length + ')');
      const base = costly.map(function (s) { return DD.Combat.costOf(kitArena(hid, null, 3).u, s, 1).hp; });
      const a = kitArena(hid, 'rp_blood_bank_card', 3);
      costly.forEach(function (s, i) {
        t.eq(DD.Combat.costOf(a.u, s, 1).hp, Math.max(0, base[i] - L.n), 'Blood Bank Loyalty Card on ' + hid + ': ' + s.name + ' costs ' + base[i] + ' → ' + Math.max(0, base[i] - L.n) + ' HP');
      });
      checked++;
    });
    // Frequent Flyer Miles: the flyers earn miles walking (flying) their real moves
    eligible('rp_frequent_flyer').forEach(function (hid) {
      const a = kitArena(hid, 'rp_frequent_flyer', 1);
      t.ok(DD.Grid.isFlying(a.u), 'Frequent Flyer Miles on ' + hid + ': a flyer');
      const p = instOf(a.u, 'rp_frequent_flyer');
      DD.Act.teleport(a.foe, 8, 0, { noEnter: true }); // a clear runway along the hero's row
      const walked = walkTiles(a.u, 3);
      t.ok(walked === 3 && p.data.miles === 3, 'Frequent Flyer Miles on ' + hid + ': 3 tiles flown → 3 miles');
      checked++;
    });
    // Compound Interest: the gold heroes earn interest on the party's gold at the start of every fight
    eligible('rp_compound_interest').forEach(function (hid) {
      const L = DD.skillLevel(DD.getPassive('rp_compound_interest'), 2);
      const a = kitArena(hid, 'rp_compound_interest', 2);
      const ref = kitArena(hid, null, 2);
      t.eq(a.s.sandboxGold - ref.s.sandboxGold, Math.min(L.cap, Math.floor(100 * L.pct / 100)), 'Compound Interest on ' + hid + ': interest on 100 gold');
      checked++;
    });
    t.log(checked + ' hero/Blessing pairs checked against the real kits');
    t.ok(checked >= 6, 'the hero-only Blessings found their heroes (' + checked + ' pairs)');
  });

  // ---- AutoPlay: random 4-passive loadouts at levels 1/4/7/10 -------------------------------------------------------
  function dealer(rng, ids) {
    const deck = [];
    return function (skip) {
      for (let tries = 0; tries < 200; tries++) {
        if (!deck.length) Array.prototype.push.apply(deck, rng.shuffle(ids.slice()));
        const id = deck.pop();
        if (skip.indexOf(id) < 0) return id;
        deck.unshift(id);
      }
      return ids[0];
    };
  }
  function autoParty(heroIds, level, rng, deal, played) {
    return heroIds.map(function (hid) {
      const h = DD.getHero(hid);
      const starting = (h.startingSkills || []).filter(function (sid) { return DD.getSkill(sid); }).slice(0, 4);
      const pool = (h.skillPool || []).filter(function (sid) { return starting.indexOf(sid) < 0 && DD.getSkill(sid); });
      const extra = pool.slice(0, Math.max(0, Math.min(4 - starting.length, Math.floor(level / 3))));
      const sl = Math.min(3, 1 + Math.floor(level / 4));
      const passives = [];
      while (passives.length < 4) {
        const id = deal(passives.map(function (p) { return p.id; }));
        passives.push({ id: id, level: rng.int(1, DD.getPassive(id).levels.length) });
        played[id] = (played[id] || 0) + 1;
      }
      return DD.Combat.makeRunHero({ id: hid, level: level, passives: passives,
        skills: starting.concat(extra).map(function (sid) { return { id: sid, level: Math.min(sl, (DD.getSkill(sid).levels || [1]).length) }; }) });
    });
  }
  /** One fight with counters: no stall, no runaway hook loop, a sane state, no content warnings from the table. */
  function autoFight(t, label, party, enc, seed, deployFirst, hpMult) {
    const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('pt-build:' + seed), difficulty: 'normal', act: enc.act });
    if (!setup || !setup.grid) { t.fail(label + ': encounter build failed'); return null; }
    // tougher fixture foes: longer fights, so round-based passives (crashes, every-Nth-round resets) get their turn
    (setup.enemies || []).forEach(function (e) { e.hpMult = (e.hpMult || 1) * (hpMult || 1); });
    const run = { act: enc.act, gold: 40, consumables: [], maxConsumables: 3, difficulty: 'normal', party: party };
    const p0 = DD.problems.length;
    DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: enc.kind, run: run });
    const s = DD.Combat.state;
    const count = { dmg: 0, st: 0, heal: 0 };
    DD.Act.addRule({ id: 'pt_counter', name: 'Loop Watch', hooks: {
      onTakeDamage: function () { count.dmg++; }, onStatusApplied: function () { count.st++; }, onHealed: function () { count.heal++; } } });
    if (deployFirst && s.deploy && s.deploy.active) {
      const hs = DD.Combat.heroes();
      if (hs.length > 1) t.ok(DD.Combat.deployMove(hs[0], hs[1].x, hs[1].y), label + ': a deploy swap (re-planning with passives)');
    }
    const off = DD.Events.on('wildmagic:surge', function () { count.surges = (count.surges || 0) + 1; });
    const names = rpIds().map(function (id) { return '(' + DD.getPassive(id).name + '):'; });
    let said = 0;
    const offLog = DD.Events.on('combat:log', function (e) { if (e && names.some(function (n) { return e.text.indexOf(n) >= 0; })) said++; });
    let res;
    try { res = DD.AutoPlay.runBattle(30); } finally { off(); offLog(); }
    res.surges = count.surges || 0;
    res.said = said;
    res.ducks = s.units.filter(function (u) { return u.defId === 'wm_duck' || u.defId === 'wm_duck_foe'; }).length;
    t.ok(!!res.result || res.rounds > 30, label + ': the fight resolves or runs out the clock (' + JSON.stringify(res) + ')');
    t.ok(count.dmg < 2500 && count.st < 2500 && count.heal < 2500, label + ': no runaway hook loop (' + count.dmg + ' hits, ' + count.st + ' statuses, ' + count.heal + ' heals)');
    t.ok(s.mutations < 400000, label + ': mutations ' + s.mutations);
    if (T.contentHelpers && T.contentHelpers.sanity) T.contentHelpers.sanity(t, label);
    // every swallowed hook/skill error counts (an echo or a teleport can trip other content), plus the table's own warnings
    const warns = DD.problems.slice(p0).filter(function (w) { return /^Error in |rp_|passive|unknown (status|summon|enemy|surface|object|terrain|skill)/i.test(w); });
    warns.forEach(function (w) { t.fail(label + ': warning ' + w); });
    return res;
  }
  /** planFn(rng) → [{ level, encs: [encounter defs], hp }] or a string (why the suite is skipped). */
  function autoSuite(name, poolFn, perLevel, planFn) {
    T.suite(name, function (t) {
      const pool = poolFn();
      if (pool.length < 2) { t.skip('not enough heroes registered'); return; }
      const ids = rpIds();
      const rng = DD.RNG('pt-auto:' + name);
      const deal = dealer(rng, ids);
      const played = {};
      const plan = planFn(rng);
      if (typeof plan === 'string') { t.skip(plan); return; }
      const per = Math.max(1, +(t.param('n', perLevel)) || perLevel);
      plan.forEach(function (pl) {
        let wins = 0, rounds = 0, timeouts = 0, surges = 0, said = 0, ducks = 0;
        for (let i = 0; i < per; i++) {
          const enc = pl.encs[i % pl.encs.length];
          const heroes = rng.sample(pool, Math.min(4, pool.length));
          const party = autoParty(heroes, pl.level, rng, deal, played);
          const label = 'L' + pl.level + ' #' + i + ' ' + enc.id + ' ' + heroes.join('+');
          const res = t.tryRun(label, function () { return autoFight(t, label, party, enc, rng.int(1, 1e9), i % 2 === 0, pl.hp); });
          if (!res) continue;
          if (res.result === 'victory') wins++;
          if (res.timeout) timeouts++;
          rounds += res.rounds; surges += res.surges; said += res.said; ducks += res.ducks;
        }
        t.log('level ' + pl.level + ' (' + pl.encs.slice(0, per).map(function (e) { return e.id; }).join(', ') + ', foes ×' + pl.hp + ' HP): won ' + wins +
          '/' + per + ', avg rounds ' + (rounds / per).toFixed(1) + ', timeouts ' + timeouts + ' · ' + surges + ' wild surges, ' + ducks + ' ducks, ' +
          said + ' passive log lines');
      });
      const unplayed = ids.filter(function (id) { return !played[id]; });
      t.ok(!unplayed.length, 'every passive was played at least once' + (unplayed.length ? ' (missing: ' + unplayed.join(', ') + ')' : ''));
    });
  }
  function fixturePlan() {
    const plan = [{ level: 1, id: 'test_a1_normal', hp: 1.5 }, { level: 4, id: 'test_a1_elite', hp: 2 }, { level: 7, id: 'test_a2_normal', hp: 3 },
      { level: 10, id: 'test_a3_boss', hp: 2.5 }];
    const missing = plan.filter(function (pl) { return !DD.getEncounter(pl.id); });
    if (missing.length) return 'missing fixture encounters: ' + missing.map(function (pl) { return pl.id; }).join(', ');
    return plan.map(function (pl) { return { level: pl.level, encs: [DD.getEncounter(pl.id)], hp: pl.hp }; });
  }
  /** The real act 1-3 encounters (normal, elite and boss fights), shuffled, at the levels a party has there. */
  function realPlan(rng) {
    const all = Object.keys(DD.defs.encounters).sort().filter(function (k) { return k.indexOf('test_') !== 0; }).map(DD.getEncounter);
    function of(act, kinds) { return rng.shuffle(all.filter(function (e) { return e && e.act === act && kinds.indexOf(e.kind) >= 0; })); }
    const plan = [{ level: 1, encs: of(1, ['normal']), hp: 1.25 }, { level: 4, encs: of(1, ['elite', 'boss']), hp: 1.25 },
      { level: 7, encs: of(2, ['normal', 'elite', 'boss']), hp: 1.25 }, { level: 10, encs: of(3, ['normal', 'elite', 'boss']), hp: 1.25 }];
    return plan.every(function (pl) { return pl.encs.length > 0; }) ? plan : 'real encounters for acts 1-3 are not all registered';
  }
  function realHeroes() { return Object.keys(DD.defs.heroes).filter(function (id) { return id.indexOf('test_') !== 0; }); }
  autoSuite('passive-table: AutoPlay fights with random 4-passive loadouts at levels 1/4/7/10 (fixture heroes)', function () {
    return FIXTURE_HEROES.filter(DD.getHero);
  }, 8, fixturePlan);
  autoSuite('passive-table: AutoPlay fights with random 4-passive loadouts on the real heroes', realHeroes, 4, fixturePlan);
  autoSuite('passive-table: AutoPlay fights with random 4-passive loadouts on the real heroes in the real encounters', realHeroes, 4, realPlan);
})();
