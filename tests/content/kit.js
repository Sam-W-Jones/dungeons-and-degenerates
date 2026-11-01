/* Dungeons and Degenerates — tests/content/kit.js
 * Suites "kit: …" for js/data/skills_generic.js (12 generic skills gen_*, owner 'generic') and js/data/consumables.js
 * (14 consumables con_* + the con_d4s surface): registry and text rules, every skill at every level and every
 * consumable in DD.Combat.sandbox fights (effect == desc), edge cases (no target, dying users, map edges, hazards,
 * impaired users), HUD previews vs reality (also with every real hero as the user, full runs only), AutoPlay using
 * consumables sensibly, AutoPlay battles with the whole kit socketed, and the run layer (skill tomes, rewards, shop,
 * learning + upgrading, a real run fight).
 * Uses only fixture heroes/enemies (test_*) so it runs in isolation:
 *   bash tools/test.sh "suite=kit&isolate=skills_generic,consumables,content/kit"
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const GEN = ['gen_throw_chair', 'gen_second_wind', 'gen_dodge_roll', 'gen_shove', 'gen_rally', 'gen_first_aid',
    'gen_pocket_sand', 'gen_taunt', 'gen_sucker_punch', 'gen_barrel_toss', 'gen_power_nap', 'gen_tactical_retreat'];
  const CON = ['con_red_drink', 'con_big_red_drink', 'con_bad_decisions', 'con_smoke_bomb', 'con_energy_drink', 'con_antidote',
    'con_liquid_courage', 'con_scroll_of_yeet', 'con_bag_of_d4s', 'con_holy_water', 'con_frost_flask', 'con_thunder_jar',
    'con_pocket_sand', 'con_mystery_potion'];
  const USER = 'test_knight';   // neutral passive (start-of-fight Block, cleared by fight()), no items
  const KINDS = ['attack', 'buff', 'heal', 'summon', 'move', 'utility'];
  const TARGET_TYPES = ['unit', 'tile', 'self', 'dir'];

  // ---- helpers ---------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function S() { return DD.Combat.state; }
  function badText(s) { return typeof s !== 'string' || !s.trim() || /undefined|NaN|\[object|null/.test(s); }

  /** Sandbox that never ends on its own: 9×9 stone, no first planning, fixture heroes at level 3, Block cleared. */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = (cfg.heroes || [{ id: USER, x: 2, y: 4 }]).map(function (h) { return Object.assign({ level: 3, skills: [] }, h); });
    DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, noPlan: true, enemies: [],
      objective: { type: 'custom', text: 'Kit test' }, encounter: { id: 'kit_arena', checkObjective: function () { return null; } },
    }, cfg, { heroes: heroes }));
    const s = S();
    s.units.forEach(function (u) { if (u.side === 'hero') u.block = 0; });
    return s;
  }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0] || null; }
  function me() { return hero(USER); }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function sk(id) { return DD.getSkill(id); }
  function Lv(id, lv) { return DD.skillLevel(sk(id), lv); }
  function give(u, id, level) { const sl = A().makeSlot(id, level || 1); u.skills = [sl]; return sl; }
  function valid(u, ref, x, y) { return DD.Targeting.isValidTarget(u, ref, x, y); }
  function use(t, u, sl, x, y, label) {
    const why = DD.Combat.canUse(u, sl);
    const ok = why === true && DD.Combat.useSkill(u, sl, x, y);
    t.ok(ok, (label || sl.id) + ' used @' + x + ',' + y + (why === true ? '' : ' (' + why + ')'));
    return ok;
  }
  /** Put one consumable in the (sandbox) pockets and use it. */
  function drink(t, u, id, x, y, label) {
    S().consumables = [id];
    const why = DD.Combat.canUseConsumable(u, 0);
    const ok = why === true && DD.Combat.useConsumable(u, 0, x, y);
    t.ok(ok, (label || id) + ' used @' + x + ',' + y + (why === true ? '' : ' (' + why + ')'));
    return ok;
  }
  function wipeEnemies() { DD.Combat.enemies().forEach(function (e) { A().kill(e, null); }); }
  function snapshot(s) {
    const b = {};
    s.units.forEach(function (o) { b[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed, x: o.x, y: o.y, block: o.block || 0 }; });
    return b;
  }
  function fingerprint(s) {
    if (T.contentHelpers && T.contentHelpers.fingerprint) return T.contentHelpers.fingerprint(s);
    return JSON.stringify([s.units.map(function (u) { return [u.id, u.x, u.y, u.hp, u.block, u.ap, !!u.dead, !!u.downed, u.statuses]; }),
      s.grid.tiles.map(function (tl) { return [tl.t, tl.surface, tl.obj && [tl.obj.id, tl.obj.hp]]; }), s.hype, s.rng.getState(), s.consumables]);
  }
  /** What the preview said vs what really happened (HP, KO, movement, Block, Hype). */
  function compare(t, prev, s, before, hype0, label) {
    s.units.forEach(function (o) {
      const b = before[o.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[o.id];
      t.eq(b.hp - o.hp, e ? (e.dmg || 0) - (e.heal || 0) : 0, label + ': ' + o.name + ' HP change = preview');
      t.eq((o.dead && !b.dead) || (o.downed && !b.downed), !!(e && e.lethal), label + ': ' + o.name + ' KO = preview');
      if (!o.dead && !(e && e.lethal)) {
        t.eq(o.x !== b.x || o.y !== b.y, !!(e && e.moved), label + ': ' + o.name + ' movement = preview');
        t.eq((o.block || 0) - b.block, e ? (e.block || 0) - (e.blocked || 0) : 0, label + ': ' + o.name + ' Block change = preview');
      }
    });
    t.eq(s.hype - hype0, prev.hype, label + ': Hype = preview');
  }
  function checkSkillPreview(t, u, sl, x, y, label) {
    const s = S();
    const fp = fingerprint(s), before = snapshot(s), hype0 = s.hype;
    const prev = t.tryRun(label + ' preview', function () { return DD.Combat.preview(u, sl, x, y); });
    t.ok(!!prev && fingerprint(s) === fp, label + ': preview left the fight untouched');
    if (!prev || !use(t, u, sl, x, y, label)) return null;
    compare(t, prev, s, before, hype0, label);
    return prev;
  }
  function checkConsPreview(t, u, id, x, y, label) {
    const s = S();
    s.consumables = [id];
    const def = DD.getConsumable(id);
    const fp = fingerprint(s), before = snapshot(s), hype0 = s.hype;
    const prev = t.tryRun(label + ' preview', function () { return DD.Targeting.preview(u, def, { x: x, y: y }); });
    t.ok(!!prev && fingerprint(s) === fp, label + ': preview left the fight untouched');
    if (!prev) return null;
    t.eq(!!prev.uncertain, (def.tags || []).indexOf('random') >= 0, label + ': uncertain only for random consumables');
    const ok = DD.Combat.canUseConsumable(u, 0) === true && DD.Combat.useConsumable(u, 0, x, y);
    t.ok(ok, label + ' used');
    if (!ok) return null;
    compare(t, prev, s, before, hype0, label);
    return prev;
  }
  /** Sane state: finite numbers, nobody out of bounds / on an unwalkable tile / sharing a tile. */
  function sane(t, label) {
    if (T.contentHelpers && T.contentHelpers.sanity) return t.ok(T.contentHelpers.sanity(t, label), label + ': state sane');
    const seen = {};
    let ok = true;
    S().units.forEach(function (u) {
      if (u.dead) return;
      if (!isFinite(u.hp) || u.hp < 0 || u.hp > u.maxHp || !DD.Grid.inBounds(u.x, u.y)) ok = false;
      const k = u.x + ',' + u.y;
      if (seen[k]) ok = false;
      seen[k] = 1;
    });
    return t.ok(ok, label + ': state sane');
  }
  /** Sorted "x,y" list of tiles (compare areas). */
  function keys(list) { return list.map(function (p) { return p.x + ',' + p.y; }).sort().join(' '); }
  /** Count DD.FX events pushed while fn runs (a pure query must push none). */
  function fxDuring(fn) {
    const real = DD.FX.push;
    let n = 0;
    DD.FX.push = function (evt) { n++; return real.call(DD.FX, evt); };
    try { fn(); } finally { DD.FX.push = real; }
    return n;
  }
  /** Make the next ctx.rng.int(1, 6) of the fight roll `face` (for the Mystery Potion). */
  function forceD6(face) {
    for (let state = 1; state < 20000; state++) {
      const r = DD.RNG(1);
      r.setState(state);
      if (r.int(1, 6) === face) { S().rng.setState(state); return true; }
    }
    return false;
  }

  // ---- 1. registry and text ------------------------------------------------------------------------------
  T.suite('kit: registry — 12 generic skills and 14 consumables, exact text, no name clashes', function (t) {
    t.eq(GEN.length, 12, '12 generic skills planned');
    t.eq(CON.length, 14, '14 consumables planned');
    t.ok(!!DD.Kit, 'DD.Kit helpers exist');
    if (!DD.Kit) return;
    t.eq(JSON.stringify(DD.Kit.GENERIC_IDS), JSON.stringify(GEN), 'DD.Kit.GENERIC_IDS lists the generic skills');
    t.eq(JSON.stringify(DD.Kit.CONSUMABLE_IDS), JSON.stringify(CON), 'DD.Kit.CONSUMABLE_IDS lists the consumables');
    const owned = Object.keys(DD.defs.skills).filter(function (k) { return DD.defs.skills[k].owner === 'generic'; }).sort();
    t.eq(owned.join(','), GEN.slice().sort().join(','), 'every owner:generic skill is one of the 12 (gen_ prefix)');
    const conIds = Object.keys(DD.defs.consumables).filter(function (k) { return /^con_/.test(k); }).sort();
    t.eq(conIds.join(','), CON.slice().sort().join(','), 'every con_ consumable is one of the 14');
    const probe = { id: 'x', name: 'Probe', hp: 10, maxHp: 20, ap: 3, statuses: [], items: [], flags: {}, x: 0, y: 0, side: 'hero', kind: 'hero', data: {}, rangeBonus: 0 };
    const aps = {};
    GEN.forEach(function (id) {
      const s = sk(id);
      t.ok(!!s, id + ' registered');
      if (!s) return;
      t.ok(s.owner === 'generic' && Array.isArray(s.levels) && s.levels.length === 3, id + ': generic, 3 levels');
      t.ok(KINDS.indexOf(s.kind) >= 0, id + ': kind "' + s.kind + '" (never a spell: Silence can\'t stop the basics)');
      t.ok(Array.isArray(s.tags) && s.tags.length > 0, id + ': tags');
      t.ok(typeof s.icon === 'string' && s.icon.length >= 1 && s.icon.length <= 4, id + ': one emoji icon');
      t.ok(typeof s.flavor === 'string' && s.flavor.length > 10 && s.flavor.length <= 120, id + ': flavor ≤ 120');
      t.ok(typeof s.name === 'string' && s.name.length <= 20, id + ': short name for the action bar (' + s.name + ')');
      t.ok(s.hype === 0, id + ': no Hype cost');
      aps[s.ap] = 1;
      const descs = [1, 2, 3].map(function (lv) {
        const dn = DD.skillDesc(s, lv, null), du = DD.skillDesc(s, lv, probe);
        t.ok(!badText(dn) && dn.length <= 300, id + ' L' + lv + ' desc reads fine without a user: ' + JSON.stringify(dn));
        t.eq(du, dn, id + ' L' + lv + ': desc does not depend on who reads it');
        const L = Lv(id, lv);
        ['dmg', 'heal', 'block', 'push'].forEach(function (k) {
          if (typeof L[k] === 'number' && L[k] > 0) t.ok(new RegExp('(^|[^0-9])' + L[k] + '([^0-9]|$)').test(dn), id + ' L' + lv + ': desc shows its ' + k + ' ' + L[k]);
        });
        return dn;
      });
      t.ok(descs[0] !== descs[1] && descs[1] !== descs[2], id + ': every level reads differently');
      const quips = DD.Kit.QUIPS && DD.Kit.QUIPS[id];
      t.ok(Array.isArray(quips) && quips.length >= 3 && quips.every(function (q) { return typeof q === 'string' && q.length > 0 && q.length <= 70; }), id + ': 3+ quips, each ≤ 70 characters');
    });
    t.ok(aps[0] && aps[1] && aps[2], 'AP mix of 0, 1 and 2');
    let commons = 0, rares = 0;
    CON.forEach(function (id) {
      const c = DD.getConsumable(id);
      t.ok(!!c, id + ' registered');
      if (!c) return;
      t.ok(c.rarity === 'common' || c.rarity === 'rare', id + ': rarity ' + c.rarity);
      if (c.rarity === 'rare') rares++; else commons++;
      t.ok(typeof c.price === 'number' && c.price >= 20 && c.price <= 35 && c.price === Math.round(c.price), id + ': price 20-35 (' + c.price + ')');
      t.ok(c.rarity === 'rare' ? c.price >= 30 : c.price <= 25, id + ': rares cost more than commons');
      t.eq(c.ap, 1, id + ': 1 AP');
      t.ok(typeof c.desc === 'string' && !badText(c.desc) && c.desc.length >= 20 && c.desc.length <= 300, id + ': exact desc (a string for the tooltip)');
      t.ok(typeof c.flavor === 'string' && c.flavor.length > 10 && c.flavor.length <= 120, id + ': flavor ≤ 120');
      t.ok(typeof c.icon === 'string' && c.icon.length >= 1 && c.icon.length <= 4, id + ': icon');
      t.ok(c.target && TARGET_TYPES.indexOf(c.target.type) >= 0 && typeof c.execute === 'function', id + ': target + execute');
      t.ok(Array.isArray(c.tags), id + ': tags');
    });
    t.ok(commons >= 8 && rares >= 3, 'mostly commons (' + commons + ') with a few rares (' + rares + ')');
    t.ok(DD.getConsumable('con_mystery_potion').tags.indexOf('random') >= 0, 'the Mystery Potion is tagged random');
    // names: unique, and no clash with anybody else's skills, consumables or items
    const mine = GEN.map(function (id) { return sk(id).name; }).concat(CON.map(function (id) { return DD.getConsumable(id).name; }));
    const low = mine.map(function (n) { return n.toLowerCase(); });
    t.eq(new Set(low).size, mine.length, 'my 26 names are unique');
    const others = [];
    Object.keys(DD.defs.skills).forEach(function (k) { if (GEN.indexOf(k) < 0) others.push(['skill ' + k, DD.defs.skills[k].name]); });
    Object.keys(DD.defs.consumables).forEach(function (k) { if (CON.indexOf(k) < 0) others.push(['consumable ' + k, DD.defs.consumables[k].name]); });
    Object.keys(DD.defs.items).forEach(function (k) { others.push(['item ' + k, DD.defs.items[k].name]); });
    const clashes = others.filter(function (o) { return low.indexOf(String(o[1]).toLowerCase()) >= 0; });
    t.eq(clashes.length, 0, 'no display-name clash with other content: ' + JSON.stringify(clashes));
    mine.forEach(function (n) { t.ok(!/marble/i.test(n), n + ': the marbles stay Professor Marbles\''); });
    // a generic skill shares the action bar with the hero's basic, signature and pool skills: its icon must be its own
    // (Rude Shove was ✋ like Slate's Personal Space, Sucker Punch 👊 like Marbles' and Slate's basic attacks)
    const genIcons = GEN.map(function (id) { return sk(id).icon; });
    t.eq(new Set(genIcons).size, GEN.length, 'the 12 generic skills have 12 different icons');
    const iconClash = Object.keys(DD.defs.skills).filter(function (k) {
      const s = DD.defs.skills[k];
      return s && GEN.indexOf(k) < 0 && s.owner !== 'enemy' && s.owner !== 'summon' && !/^test_/.test(String(s.owner)) && genIcons.indexOf(s.icon) >= 0;
    });
    t.eq(iconClash.join(','), '', 'no hero skill uses a generic skill\'s icon');
    const d4 = DD.getSurface('con_d4s');
    t.ok(d4 && typeof d4.draw === 'function' && typeof d4.onEnter === 'function' && !d4.hazard && !badText(d4.desc), 'surface con_d4s: painter, onEnter, desc (no hazard flag: heroes are safe on it)');
  });

  // ---- 2. attacks ---------------------------------------------------------------------------------------
  T.suite('kit: Throw Chair, Sucker Punch and Sand in Your Eye at every level', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_throw_chair', lv);
      fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 4, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }] });
      const u = me(), sl = give(u, 'gen_throw_chair', lv), mage = hero('test_mage');
      const g1 = at(4, 4), g2 = at(5, 4), g3 = at(4, 3);
      const hp = [g1.hp, g2.hp, g3.hp, mage.hp];
      t.eq(DD.Combat.costOf(u, sk('gen_throw_chair'), lv).ap, 2, 'Throw Chair L' + lv + ': 2 AP');
      if (!use(t, u, sl, 4, 4, 'Throw Chair L' + lv)) return;
      t.eq(hp[0] - g1.hp, L.dmg, 'Throw Chair L' + lv + ': the target takes ' + L.dmg);
      t.eq(hp[1] - g2.hp, L.splinter || 0, 'Throw Chair L' + lv + ': splinters on the foe next to it: ' + (L.splinter || 0));
      t.eq(hp[2] - g3.hp, L.splinter || 0, 'Throw Chair L' + lv + ': splinters on the other neighbour: ' + (L.splinter || 0));
      t.eq(mage.hp, hp[3], 'Throw Chair L' + lv + ': splinters never hit allies');
      t.eq(u.ap, 1, 'Throw Chair L' + lv + ': 2 AP spent');
      t.ok(DD.Combat.canUse(u, sl) !== true, 'Throw Chair L' + lv + ': on cooldown right after');
    });
    // range, line of sight
    fight({ heroes: [{ id: USER, x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 1 }, { id: 'test_grunt', x: 6, y: 2 }, { id: 'test_grunt', x: 1, y: 4 }, { id: 'test_grunt', x: 2, y: 1 }],
      objects: [{ x: 1, y: 2, id: 'pillar' }] });
    const u = me(), sl = give(u, 'gen_throw_chair', 1);
    t.ok(valid(u, sl, 5, 1) && valid(u, sl, 2, 1), 'Throw Chair: range 1-4 (adjacent and 4 away)');
    t.ok(!valid(u, sl, 6, 2), 'Throw Chair: not 6 away');
    t.ok(!valid(u, sl, 1, 4), 'Throw Chair: needs line of sight (a pillar is in the way)');
    // cooldown cycle: 2 at every level (use in round r → ready again in round r + 3)
    [1, 3].forEach(function (lv) {
      const cd = DD.Combat.cooldownOf(me(), sk('gen_throw_chair'), lv);
      t.eq(cd, 2, 'Throw Chair L' + lv + ': cooldown 2');
      fight({ heroes: [{ id: USER, x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 1, hpMult: 6 }] });
      const sl2 = give(me(), 'gen_throw_chair', lv);
      use(t, me(), sl2, 5, 1, 'Throw Chair L' + lv + ' (cooldown cycle)');
      for (let r = 1; r <= cd; r++) {
        DD.Combat.endTurn();
        t.ok(/cooldown/i.test(String(DD.Combat.canUse(me(), sl2))), 'Throw Chair L' + lv + ': still cooling down ' + r + ' round(s) later');
      }
      DD.Combat.endTurn();
      t.ok(sl2.cd === 0 && !/cooldown/i.test(String(DD.Combat.canUse(me(), sl2))), 'Throw Chair L' + lv + ': ready again ' + (cd + 1) + ' rounds later (cooldown ' + cd + ')');
    });

    // Sucker Punch: plain, every helpless status, Frozen's own +50%, waking the sleeper, Weak at III
    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_sucker_punch', lv);
      ['none'].concat(DD.Kit.HELPLESS).forEach(function (cond) {
        fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
        const u2 = me(), sl2 = give(u2, 'gen_sucker_punch', lv), g = at(3, 4);
        if (cond !== 'none') A().addStatus(g, cond, { turns: 1 }, u2);
        const hp0 = g.hp;
        if (!use(t, u2, sl2, 3, 4, 'Sucker Punch L' + lv + ' vs ' + cond)) return;
        const base = L.dmg + (cond === 'none' ? 0 : L.bonus);
        t.eq(hp0 - g.hp, cond === 'frozen' ? Math.round(base * 1.5) : base, 'Sucker Punch L' + lv + ' vs ' + cond + ': ' + base + (cond === 'frozen' ? ' (+50% on Frozen)' : ''));
        if (cond === 'sleep') t.ok(!has(g, 'sleep'), 'Sucker Punch: the sleeper wakes up');
        t.eq(has(g, 'weak'), !!L.weak, 'Sucker Punch L' + lv + ': Weakened only at III');
        if (L.weak) t.eq(st(g, 'weak').turns, 1, 'Sucker Punch III: Weak for 1 turn');
      });
    });
    fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    t.ok(!valid(me(), give(me(), 'gen_sucker_punch', 1), 4, 4), 'Sucker Punch: melee only');

    // Sand in Your Eye
    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_pocket_sand', lv);
      fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 4, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }, { id: 'test_grunt', x: 4, y: 6 }] });
      const u3 = me(), sl3 = give(u3, 'gen_pocket_sand', lv), mage = hero('test_mage');
      const a = at(3, 4), b = at(3, 5), far = at(4, 6);
      t.eq(valid(u3, sl3, 4, 6), L.range >= 4, 'Sand in Your Eye L' + lv + ': a foe 5 away is out of range');
      const hp = [a.hp, b.hp];
      if (!use(t, u3, sl3, 3, 4, 'Sand in Your Eye L' + lv)) return;
      t.eq(hp[0] - a.hp, L.dmg, 'Sand L' + lv + ': ' + L.dmg + ' damage');
      t.ok(has(a, 'dazzled') && st(a, 'dazzled').turns === 1, 'Sand L' + lv + ': Dazzled for 1 turn');
      t.eq(has(a, 'weak'), !!L.weak, 'Sand L' + lv + ': Weakened from II');
      t.eq(hp[1] - b.hp, L.r ? L.dmg : 0, 'Sand L' + lv + ': the foe next to it is hit only at III');
      t.eq(has(b, 'dazzled'), !!L.r, 'Sand L' + lv + ': the neighbour is Dazzled only at III');
      t.ok(!has(far, 'dazzled') && mage.statuses.length === 0, 'Sand L' + lv + ': nobody else (and never allies)');
    });
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    t.ok(!valid(me(), give(me(), 'gen_pocket_sand', 1), 4, 4) && valid(me(), give(me(), 'gen_pocket_sand', 3), 4, 4), 'Sand: range 2, 3 at III');
    // a Dazzled foe's telegraphed stab lands 1 tile off (so it misses the knight), then the Dazzle is gone
    fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const g = at(3, 4);
    DD.AI.makeIntent(g, 'test_grunt_stab', me());
    t.eq(g.intents.length, 1, 'the grunt telegraphs a stab at the knight');
    use(t, me(), give(me(), 'gen_pocket_sand', 1), 3, 4, 'Sand vs a stabbing grunt');
    const hp0 = me().hp;
    let stabbed = 0;
    A().addRule({ id: 'kit_stab_probe', name: 'probe', hooks: { onTakeDamage: function (d) { if (d.source === g && d.target.defId === USER && d.cause === 'skill') stabbed++; } } });
    DD.Combat.endTurn();
    t.ok(stabbed === 0 && me().hp === hp0, 'the Dazzled stab lands 1 tile off and misses the knight');
    t.ok(!has(g, 'dazzled'), 'Dazzle wears off after the enemy turn');
  });

  // ---- 3. pushes and bombs -------------------------------------------------------------------------------
  T.suite('kit: Rude Shove and Barrel Toss — pushes, crashes, pits, chain reactions', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_shove', lv);
      fight({ heroes: [{ id: USER, x: 2, y: 4 }, { id: 'test_mage', x: 2, y: 3 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      let u = me(), sl = give(u, 'gen_shove', lv);
      const g = at(3, 4);
      if (!use(t, u, sl, 3, 4, 'Shove L' + lv)) return;
      t.eq(g.x, 3 + L.push, 'Shove L' + lv + ': pushed ' + L.push + ' tiles');
      t.eq(g.hp, 14 - L.dmg, 'Shove L' + lv + ': ' + L.dmg + ' damage');
      // an ally: moved, not hurt
      fight({ heroes: [{ id: USER, x: 2, y: 4 }, { id: 'test_mage', x: 2, y: 3 }] });
      u = me(); sl = give(u, 'gen_shove', lv);
      const mage = hero('test_mage'), mhp = mage.hp;
      use(t, u, sl, 2, 3, 'Shove L' + lv + ' (ally)');
      t.ok(mage.x === 2 && mage.y === 3 - L.push && mage.hp === mhp, 'Shove L' + lv + ': an ally slides ' + L.push + ' and takes nothing');
      // a crate in the way: crash for 3, the crate takes 3
      fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], objects: [{ x: 4, y: 4, id: 'crate' }] });
      u = me(); sl = give(u, 'gen_shove', lv);
      const g2 = at(3, 4);
      use(t, u, sl, 3, 4, 'Shove L' + lv + ' into a crate');
      t.ok(g2.x === 3 && g2.hp === 14 - L.dmg - 3 && tile(4, 4).obj && tile(4, 4).obj.hp === 3, 'Shove L' + lv + ': crash = 3 to both the foe and the crate');
      // into another foe: both take the crash
      fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
      u = me(); sl = give(u, 'gen_shove', lv);
      const a = at(3, 4), b = at(4, 4);
      use(t, u, sl, 3, 4, 'Shove L' + lv + ' into a foe');
      t.ok(a.hp === 14 - L.dmg - 3 && b.hp === 11, 'Shove L' + lv + ': both foes take the 3 crash damage');
      // into a pit: YEET, environmental kill
      fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } });
      u = me(); sl = give(u, 'gen_shove', lv);
      const g3 = at(3, 4), hype0 = S().hype;
      use(t, u, sl, 3, 4, 'Shove L' + lv + ' toward a pit');
      t.ok(g3.dead && S().hype - hype0 === 20, 'Shove L' + lv + ': into the pit (+20 Hype environmental kill)');
    });
    fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    const sh = give(me(), 'gen_shove', 3);
    t.ok(!valid(me(), sh, 3, 4), 'Shove: an immovable brute is not a valid target');
    t.ok(!valid(me(), sh, 1, 4), 'Shove: nobody there, no target');
    // ice: a push whose LAST step lands on ice slides one tile further (DD.Act.push), and the HUD area shows that tile
    const row = function (x0, x1) { const out = []; for (let x = x0; x <= x1; x++) out.push({ x: x, y: 4 }); return out; };
    [
      { lv: 1, ice: 5, end: 6, why: 'push 2 ends on the ice at 5,4 and slides to 6,4' },
      { lv: 3, ice: 4, end: 6, why: 'push 3 only passes over the ice at 4,4: no slide' },
      { lv: 3, ice: 6, end: 7, why: 'push 3 ends on the ice at 6,4 and slides to 7,4' },
    ].forEach(function (c) {
      fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }],
        terrain: function (tl) { if (tl.y === 4 && tl.x === c.ice) tl.t = 'ice'; } });
      const icy = at(3, 4), shv = give(me(), 'gen_shove', c.lv);
      t.eq(keys(DD.Targeting.area(me(), shv, c.lv, { x: 3, y: 4 })), keys(row(3, c.end)), 'Shove L' + c.lv + ' and ice: the area shows it (' + c.why + ')');
      use(t, me(), shv, 3, 4, 'Shove L' + c.lv + ' and ice');
      t.ok(icy.x === c.end && icy.y === 4, 'Shove L' + c.lv + ' and ice: ' + c.why + ' (at ' + icy.x + ',' + icy.y + ')');
    });
    // the Scroll of Yeet shares the path: flies 3, lands on the ice, slides 1 more
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }],
      terrain: function (tl) { if (tl.y === 4 && tl.x === 6) tl.t = 'ice'; } });
    const gy = at(3, 4);
    t.eq(keys(DD.Targeting.area(me(), DD.getConsumable('con_scroll_of_yeet'), 1, { x: 3, y: 4 })), keys(row(3, 7)), 'Yeet onto ice: the area shows the slide');
    drink(t, me(), 'con_scroll_of_yeet', 3, 4, 'Yeet onto ice');
    t.ok(gy.x === 7 && gy.y === 4, 'Yeet onto ice: lands on 6,4 and slides to 7,4 (at ' + gy.x + ',' + gy.y + ')');
    // modifyPush hooks change the real push (Marwyn's are 1 shorter, the cursed Barrel Armor rolls 2 further): the
    // highlighted path follows them, and asking for it fires none of the hook's pop-ups / log lines (stand-in rule)
    [[-1, '1 shorter'], [2, '2 further']].forEach(function (c) {
      [['shove', 2, 'gen_shove'], ['yeet', 3, 'con_scroll_of_yeet']].forEach(function (k) {
        fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: k[1], y: 4 }] });
        const mage = hero('test_mage');
        A().addRule({ id: 'kit_push_probe', name: 'Push probe', hooks: { modifyPush: function (p) {
          if (p.unit !== mage) return;
          p.dist += c[0];
          DD.FX.text(p.unit, 'Probe!', { color: '#fff' });
          A().log('The push probe fired.', 'system');
        } } });
        const ref = k[0] === 'shove' ? give(me(), k[2], 1) : DD.getConsumable(k[2]);
        const fired = function () { return S().log.some(function (e) { return e.text === 'The push probe fired.'; }); };
        const log0 = S().log.length, fp = fingerprint(S());
        let path = '';
        const fx = fxDuring(function () { path = keys(DD.Targeting.area(me(), ref, 1, { x: k[1], y: 4 })); });
        t.ok(fx === 0 && S().log.length === log0 && fingerprint(S()) === fp, k[0] + ' path, pushes ' + c[1] + ': no pop-ups, log lines or changes');
        if (k[0] === 'shove') use(t, me(), ref, k[1], 4, 'Shove an ally whose pushes go ' + c[1]);
        else drink(t, me(), k[2], k[1], 4, 'Yeet an ally whose pushes go ' + c[1]);
        t.ok(fired(), k[0] + ' ' + c[1] + ': the real push does fire the hook (and its log line)');
        t.eq(path, keys(row(k[1], mage.x)), k[0] + ', pushes ' + c[1] + ': the highlight ends where the ally lands (' + mage.x + ',4)');
      });
    });

    // Barrel Toss
    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_barrel_toss', lv);
      fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 4, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }] });
      const u = me(), sl = give(u, 'gen_barrel_toss', lv), mage = hero('test_mage');
      const c = at(4, 4), e = at(5, 4), n = at(4, 3);
      const hp = [c.hp, e.hp, n.hp, mage.hp];
      if (!use(t, u, sl, 4, 4, 'Barrel Toss L' + lv)) return;
      t.ok(hp[0] - c.hp === L.dmg && hp[1] - e.hp === L.dmg && hp[2] - n.hp === L.dmg, 'Barrel Toss L' + lv + ': ' + L.dmg + ' fire damage to each foe in the blast');
      t.eq(hp[3] - mage.hp, L.dmg, 'Barrel Toss L' + lv + ': allies in the blast are hit too');
      t.eq(u.ap, 1, 'Barrel Toss L' + lv + ': 2 AP');
      if (L.knock) {
        t.ok(c.x === 4 && c.y === 4, 'Barrel Toss III: the unit at the center stays put');
        t.ok(e.x === 6 && n.y === 2 && mage.y === 6, 'Barrel Toss III: everyone around is thrown 1 tile outward');
      } else {
        t.ok(e.x === 5 && n.y === 3 && mage.y === 5, 'Barrel Toss L' + lv + ': no knockback before III');
      }
    });
    // range (2-4, 5 at III), no line of sight needed
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], objects: [{ x: 2, y: 4, id: 'pillar' }] });
    const b1 = give(me(), 'gen_barrel_toss', 1);
    t.ok(!valid(me(), b1, 1, 5), 'Barrel Toss: not adjacent');
    t.ok(valid(me(), b1, 4, 4) && valid(me(), b1, 5, 4), 'Barrel Toss: lobbed over a pillar, up to 4');
    t.ok(!valid(me(), b1, 6, 4) && valid(me(), give(me(), 'gen_barrel_toss', 3), 6, 4), 'Barrel Toss: 5 tiles only at III');
    // fire reacts: oil spreads, an explosive barrel goes off, water boils to steam
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }],
      objects: [{ x: 3, y: 4, id: 'barrel_explosive' }], surfaces: [{ x: 4, y: 3, id: 'oil', turns: 5 }, { x: 4, y: 2, id: 'oil', turns: 5 }, { x: 5, y: 4, id: 'water', turns: 4 }] });
    const gr = at(4, 4);
    use(t, me(), give(me(), 'gen_barrel_toss', 1), 4, 4, 'Barrel Toss on oil and a barrel');
    t.ok(!tile(3, 4).obj, 'the explosive barrel in the blast goes off');
    t.eq(14 - gr.hp, 5 + 8, 'the grunt takes the toss (5) and the barrel explosion (8)');
    t.ok(tile(4, 3).surface && tile(4, 3).surface.id === 'fire' && tile(4, 2).surface && tile(4, 2).surface.id === 'fire', 'the oil ignites and the fire runs along the slick');
    t.ok(tile(5, 4).surface && tile(5, 4).surface.id === 'steam', 'the puddle boils into steam');

    // the 'throw' damage tag (what e.g. Slate's Mitts read: "+2 to everything he throws"): chair and barrel, not splinters
    const throwBonus = function () {
      A().addRule({ id: 'kit_mitts_probe', name: 'Mitts probe', hooks: { modifyOutgoingDamage: function (d) { if (d.tags && d.tags.indexOf('throw') >= 0) d.flat += 2; } } });
    };
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
    throwBonus();
    let ta = at(4, 4), tb = at(5, 4);
    use(t, me(), give(me(), 'gen_throw_chair', 3), 4, 4, 'Throw Chair III, +2 on throws');
    t.ok(14 - ta.hp === 12 && 14 - tb.hp === 3, 'the chair is a throw (10 + 2), its splinters are not (3): ' + (14 - ta.hp) + ', ' + (14 - tb.hp));
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
    throwBonus();
    ta = at(4, 4); tb = at(5, 4);
    use(t, me(), give(me(), 'gen_barrel_toss', 1), 4, 4, 'Barrel Toss, +2 on throws');
    t.ok(14 - ta.hp === 7 && 14 - tb.hp === 7, 'the barrel blast is a throw: 5 + 2 to everyone in it: ' + (14 - ta.hp) + ', ' + (14 - tb.hp));
  });

  // ---- 4. heals ---------------------------------------------------------------------------------------------
  T.suite('kit: Second Wind, First Aid and Power Nap at every level', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_second_wind', lv);
      fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = me(), sl = give(u, 'gen_second_wind', lv);
      u.hp = u.maxHp - 15;
      A().addStatus(u, 'weak', { turns: 2 }, null);
      A().addStatus(u, 'vulnerable', { turns: 2 }, null);
      A().addStatus(u, 'poison', { stacks: 2 }, null);
      const hp0 = u.hp, ap0 = u.ap;
      t.eq(DD.Combat.costOf(u, sk('gen_second_wind'), lv).ap, 0, 'Second Wind L' + lv + ': 0 AP');
      if (!use(t, u, sl, u.x, u.y, 'Second Wind L' + lv)) return;
      t.eq(u.hp - hp0, L.heal, 'Second Wind L' + lv + ': heals ' + L.heal);
      t.eq(u.ap, ap0 + (L.gainAp || 0), 'Second Wind L' + lv + ': AP ' + (L.gainAp ? '+1' : 'untouched'));
      const left = ['weak', 'vulnerable', 'poison'].filter(function (id) { return has(u, id); });
      t.eq(left.join(','), lv === 1 ? 'weak,vulnerable,poison' : lv === 2 ? 'weak,vulnerable' : '', 'Second Wind L' + lv + ': debuffs left ' + left.join(','));
      t.ok(/charges/i.test(String(DD.Combat.canUse(u, sl))), 'Second Wind L' + lv + ': once per fight');
    });
    fight();
    t.ok(typeof DD.Combat.canUse(me(), give(me(), 'gen_second_wind', 1)) === 'string', 'Second Wind I at full HP: refused (would waste it)');
    t.eq(DD.Combat.canUse(me(), give(me(), 'gen_second_wind', 3)), true, 'Second Wind III at full HP: still worth the AP');

    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_first_aid', lv);
      fight({ heroes: [{ id: USER, x: 4, y: 4 }, { id: 'test_mage', x: 4, y: 5 }, { id: 'test_cleric', x: 3, y: 4 }, { id: 'test_rogue', x: 4, y: 7 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
      const u = me(), sl = give(u, 'gen_first_aid', lv), mage = hero('test_mage'), cleric = hero('test_cleric');
      A().kill(cleric, null);
      t.ok(cleric.downed, 'the cleric is downed for the test');
      mage.hp = mage.maxHp - 12;
      A().addStatus(mage, 'bleed', { stacks: 2 }, null);
      A().addStatus(mage, 'poison', { stacks: 2 }, null);
      t.ok(valid(u, sl, 4, 4) && valid(u, sl, 4, 5), 'First Aid L' + lv + ': self or an adjacent ally');
      t.ok(!valid(u, sl, 5, 4) && !valid(u, sl, 4, 7), 'First Aid L' + lv + ': not a foe, not an ally 3 away');
      t.eq(valid(u, sl, 3, 4), !!L.revive, 'First Aid L' + lv + ': a downed ally only at III');
      const hp0 = mage.hp;
      if (!use(t, u, sl, 4, 5, 'First Aid L' + lv)) return;
      t.eq(mage.hp - hp0, L.heal, 'First Aid L' + lv + ': heals ' + L.heal);
      t.ok(!has(mage, 'bleed'), 'First Aid L' + lv + ': stops the Bleeding');
      t.eq(has(mage, 'poison'), lv === 1, 'First Aid L' + lv + ': cures Poison from II');
      if (L.revive) {
        fight({ heroes: [{ id: USER, x: 4, y: 4 }, { id: 'test_cleric', x: 3, y: 4 }] });
        const c2 = hero('test_cleric');
        A().kill(c2, null);
        use(t, me(), give(me(), 'gen_first_aid', lv), 3, 4, 'First Aid III revive');
        t.ok(!c2.downed && c2.hp === L.revive, 'First Aid III: back on their feet with ' + L.revive + ' HP');
      }
    });

    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_power_nap', lv);
      [3, 1, 5].forEach(function (ap) {
        fight();
        const u = me(), sl = give(u, 'gen_power_nap', lv);
        u.hp = 2;
        u.ap = ap;
        if (!use(t, u, sl, u.x, u.y, 'Power Nap L' + lv + ' with ' + ap + ' AP')) return;
        t.eq(u.ap, 0, 'Power Nap: all AP spent');
        t.eq(u.hp - 2, Math.min(u.maxHp - 2, ap * L.heal), 'Power Nap L' + lv + ' with ' + ap + ' AP: heals ' + ap + ' × ' + L.heal);
      });
    });
    fight();
    t.ok(typeof DD.Combat.canUse(me(), give(me(), 'gen_power_nap', 1)) === 'string', 'Power Nap at full HP: refused');
    // made free by a passive (modifyCost): it heals for the AP actually spent, at least 1
    [3, 0].forEach(function (ap) {
      fight();
      const u = me(), sl = give(u, 'gen_power_nap', 2);
      A().addRule({ id: 'kit_free_nap', name: 'Free naps', hooks: { modifyCost: function (c) { if (c.skill && c.skill.id === 'gen_power_nap') c.ap = 0; } } });
      u.hp = 2;
      u.ap = ap;
      if (!use(t, u, sl, u.x, u.y, 'free Power Nap with ' + ap + ' AP')) return;
      t.eq(u.hp - 2, 4 * Math.max(1, ap), 'a free Power Nap with ' + ap + ' AP heals ' + Math.max(1, ap) + ' × 4');
    });
  });

  // ---- 5. buffs and taunts ----------------------------------------------------------------------------
  T.suite('kit: Rally the Troops and Come At Me, Bro — Block, Inspired timing, taunt redirects', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_rally', lv);
      fight({ heroes: [{ id: USER, x: 4, y: 4 }, { id: 'test_mage', x: 4, y: 5 }, { id: 'test_cleric', x: 4, y: 7 }, { id: 'test_rogue', x: 7, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 7, y: 5 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const u = me(), sl = give(u, 'gen_rally', lv);
      const near = [u, hero('test_mage')], far = [hero('test_cleric'), hero('test_rogue')];
      if (!use(t, u, sl, u.x, u.y, 'Rally L' + lv)) return;
      near.forEach(function (h) {
        t.ok(h.block === L.block && has(h, 'inspired') && st(h, 'inspired').turns === L.turns, 'Rally L' + lv + ': ' + h.name + ' gets ' + L.block + ' Block + Inspired');
      });
      far.forEach(function (h) {
        t.eq(has(h, 'inspired'), L.r >= 3, 'Rally L' + lv + ': ' + h.name + ' 3 tiles away inspired only at radius 3');
      });
      // Inspired: +25% damage right away (chair 7 → 9)
      const g = at(7, 5), hp0 = g.hp;
      const chair = A().makeSlot('gen_throw_chair', 1);
      u.skills = [sl, chair];
      use(t, u, chair, 7, 5, 'Inspired Throw Chair');
      t.eq(hp0 - g.hp, 9, 'Rally L' + lv + ': an Inspired chair hits for 9 (7 × 1.25)');
      DD.Combat.endTurn();
      t.eq(has(me(), 'inspired'), L.turns >= 2, 'Rally L' + lv + ': Inspired ' + (L.turns >= 2 ? 'lasts into the next turn' : 'ends with this turn'));
      DD.Combat.endTurn();
      t.ok(!has(me(), 'inspired'), 'Rally L' + lv + ': gone after that');
    });

    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_taunt', lv);
      fight({ heroes: [{ id: USER, x: 2, y: 4 }, { id: 'test_mage', x: 2, y: 7 }],
        enemies: [{ id: 'test_archer', x: 5, y: 4 }, { id: 'test_archer', x: 5, y: 5 }, { id: 'test_archer', x: 6, y: 4 }] });
      const u = me(), sl = give(u, 'gen_taunt', lv), mage = hero('test_mage');
      const a = at(5, 4), b = at(5, 5), c = at(6, 4);
      DD.AI.makeIntent(a, 'test_arrow', mage);
      t.eq(a.intents[0].unitId, mage.id, 'the archer is aiming at the mage');
      t.eq(valid(u, sl, 6, 4), L.range >= 4, 'Come At Me L' + lv + ': a foe 4 away in range from II');
      if (!use(t, u, sl, 5, 4, 'Come At Me L' + lv)) return;
      t.eq(u.block, L.block, 'Come At Me L' + lv + ': ' + L.block + ' Block');
      t.ok(has(a, 'taunt') && st(a, 'taunt').source === u.id && st(a, 'taunt').turns === 1, 'Come At Me L' + lv + ': the archer is Taunted by the knight for 1 turn');
      t.eq(a.intents.length && a.intents[0].unitId, u.id, 'Come At Me L' + lv + ': its shot now tracks the knight');
      t.eq(has(b, 'taunt'), L.r >= 1, 'Come At Me L' + lv + ': the foe next to it is Taunted only at III');
      t.eq(has(c, 'taunt'), L.r >= 1, 'Come At Me L' + lv + ': (both neighbours)');
      const mhp = mage.hp;
      DD.Combat.endTurn();
      t.eq(mage.hp, mhp, 'Come At Me L' + lv + ': the mage is spared');
      const ai = at(a.x, a.y) === a ? a : null;
      t.ok(ai && ai.intents.some(function (it) { return it.unitId === u.id; }), 'Come At Me L' + lv + ': next round it must come for the knight');
    });
  });

  // ---- 6. movement ----------------------------------------------------------------------------------------
  T.suite('kit: Dodge Roll and Tactical Retreat — straight rolls, roots, cliffs, landing spots', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_dodge_roll', lv);
      fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }], objects: [{ x: 2, y: 3, id: 'pillar' }],
        terrain: function (tl) { if (tl.x === 2 && tl.y === 5) tl.t = 'pit'; if (tl.x === 1 && tl.y === 4) tl.h = 2; } });
      const u = me(), sl = give(u, 'gen_dodge_roll', lv);
      A().addStatus(u, 'root', { turns: 1 }, null);
      t.eq(DD.Combat.reachable(u).size, 0, 'Dodge Roll L' + lv + ': rooted, no walking');
      t.ok(valid(u, sl, 4, 4), 'Dodge Roll L' + lv + ': rolls right past the grunt');
      t.eq(valid(u, sl, 5, 4), L.range >= 3, 'Dodge Roll L' + lv + ': 3 tiles from II');
      t.ok(!valid(u, sl, 3, 5) && !valid(u, sl, 3, 3), 'Dodge Roll: straight lines only');
      t.ok(!valid(u, sl, 2, 2), 'Dodge Roll: a pillar stops it');
      t.ok(!valid(u, sl, 2, 6), 'Dodge Roll: no rolling over a pit');
      t.ok(!valid(u, sl, 0, 4), 'Dodge Roll: no rolling up a 2-level cliff');
      if (!use(t, u, sl, 4, 4, 'Dodge Roll L' + lv)) return;
      t.ok(u.x === 4 && u.y === 4, 'Dodge Roll L' + lv + ': landed');
      t.eq(u.block, L.block, 'Dodge Roll L' + lv + ': ' + L.block + ' Block');
      t.eq(has(u, 'root'), !L.unroot, 'Dodge Roll L' + lv + ': ' + (L.unroot ? 'shakes off the Root' : 'still Rooted'));
      t.eq(u.ap, 2, 'Dodge Roll: 1 AP');
    });
    // "unless you fly": a flyer (Syllamin) rolls over pits, deep water and up cliffs; walls and objects still stop it
    fight({ objects: [{ x: 2, y: 3, id: 'pillar' }],
      terrain: function (tl) { if (tl.x === 2 && tl.y === 5) tl.t = 'pit'; if (tl.x === 3 && tl.y === 4) tl.t = 'deep_water'; if (tl.x === 1 && tl.y === 4) tl.h = 2; } });
    const fly = me();
    fly.flags.flying = true;
    const fr = give(fly, 'gen_dodge_roll', 1);
    t.ok(valid(fly, fr, 2, 6) && valid(fly, fr, 4, 4) && valid(fly, fr, 0, 4), 'Dodge Roll: a flyer rolls over a pit, deep water and a cliff');
    t.ok(!valid(fly, fr, 2, 2), 'Dodge Roll: a flyer still can\'t roll through a pillar');
    t.ok(!valid(fly, fr, 3, 4) && !valid(fly, fr, 2, 5), 'Dodge Roll: ...nor stop over the deep water or the pit');

    [1, 2, 3].forEach(function (lv) {
      const L = Lv('gen_tactical_retreat', lv);
      fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 5, y: 4 }, { id: 'test_cleric', x: 7, y: 4 }, { id: 'test_rogue', x: 6, y: 1 }] });
      let u = me(), sl = give(u, 'gen_tactical_retreat', lv);
      const mage = hero('test_mage');
      t.ok(valid(u, sl, 5, 4), 'Tactical Retreat L' + lv + ': an ally 4 away');
      t.eq(valid(u, sl, 7, 4), L.range >= 6, 'Tactical Retreat L' + lv + ': an ally 6 away only at III');
      if (!use(t, u, sl, 5, 4, 'Tactical Retreat L' + lv)) return;
      t.ok(u.x === 4 && u.y === 4, 'Tactical Retreat L' + lv + ': lands on the free tile next to the ally nearest to you');
      t.ok(u.block === L.block && mage.block === L.block, 'Tactical Retreat L' + lv + ': both gain ' + L.block + ' Block');
      // the nearest tile is lava: land on a safe one instead
      fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 5, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'lava'; } });
      u = me(); sl = give(u, 'gen_tactical_retreat', lv);
      use(t, u, sl, 5, 4, 'Tactical Retreat L' + lv + ' (lava)');
      t.ok(u.x === 5 && u.y === 3 && u.hp === u.maxHp, 'Tactical Retreat L' + lv + ': skips the lava, lands north of the ally');
      // already adjacent: hold your ground, both still guard
      fight({ heroes: [{ id: USER, x: 4, y: 4 }, { id: 'test_mage', x: 5, y: 4 }] });
      u = me(); sl = give(u, 'gen_tactical_retreat', lv);
      use(t, u, sl, 5, 4, 'Tactical Retreat L' + lv + ' (adjacent)');
      t.ok(u.x === 4 && u.y === 4 && u.block === L.block && hero('test_mage').block === L.block, 'Tactical Retreat L' + lv + ': adjacent = no leap, Block for both');
    });
    fight({ heroes: [{ id: USER, x: 4, y: 4 }, { id: 'test_mage', x: 8, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 3 }, { id: 'test_grunt', x: 8, y: 5 }, { id: 'test_grunt', x: 7, y: 4 }] });
    let tr = give(me(), 'gen_tactical_retreat', 1);
    t.ok(!valid(me(), tr, 8, 4), 'Tactical Retreat: a boxed-in ally is not a target');
    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 4, y: 4 }] });
    tr = give(me(), 'gen_tactical_retreat', 1);
    A().addStatus(me(), 'root', { turns: 1 }, null);
    t.ok(/Rooted/.test(String(DD.Combat.canUse(me(), tr))), 'Tactical Retreat: not while Rooted (that is Dodge Roll\'s job)');
    // never into a hazard: when the only free tile next to the ally is lava, the ally is no target at all
    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 5, y: 4 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 3 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 5, y: 5 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'lava'; } });
    tr = give(me(), 'gen_tactical_retreat', 3);
    t.ok(!valid(me(), tr, 5, 4), 'Tactical Retreat: never leaps into lava, even when it is the only free tile next to the ally');
    // out of telegraphed attacks when it can (the HUD area shows the ally and the landing tile)
    const lobbed = function (tiles) {
      fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 5, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      DD.AI.makeIntent(at(8, 8), 'test_lob', tiles[0], { anchor: 'ground', tiles: tiles, noCooldown: true });
      return give(me(), 'gen_tactical_retreat', 1);
    };
    tr = lobbed([{ x: 4, y: 4 }]);
    t.eq(keys(DD.Targeting.area(me(), tr, 1, { x: 5, y: 4 })), '5,3 5,4', 'Tactical Retreat: the area shows the ally and the landing tile');
    use(t, me(), tr, 5, 4, 'Tactical Retreat past a telegraph');
    t.ok(me().x === 5 && me().y === 3, 'Tactical Retreat: the nearest tile is telegraphed, so it lands on the nearest clear one (at ' + me().x + ',' + me().y + ')');
    tr = lobbed([{ x: 4, y: 4 }, { x: 5, y: 3 }, { x: 6, y: 4 }, { x: 5, y: 5 }]);
    use(t, me(), tr, 5, 4, 'Tactical Retreat, every spot telegraphed');
    t.ok(me().x === 4 && me().y === 4, 'Tactical Retreat: every spot telegraphed: the nearest one, as before (at ' + me().x + ',' + me().y + ')');
    tr = lobbed([{ x: 4, y: 4 }]);
    A().addStatus(at(8, 8), 'stun', { turns: 1 }, me());
    use(t, me(), tr, 5, 4, 'Tactical Retreat past a cancelled telegraph');
    t.ok(me().x === 4 && me().y === 4, 'Tactical Retreat: a stunned enemy\'s (cancelled) telegraph does not count');
  });

  // ---- 7. drinks ----------------------------------------------------------------------------------------------
  T.suite('kit: consumables — Red Drinks, Energy Drink, Antidote, Liquid Courage, Mystery Potion', function (t) {
    [['con_red_drink', 10], ['con_big_red_drink', 20]].forEach(function (p) {
      fight({ heroes: [{ id: USER, x: 4, y: 4 }, { id: 'test_mage', x: 4, y: 5 }, { id: 'test_cleric', x: 4, y: 7 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
      const u = me(), mage = hero('test_mage');
      S().consumables = [p[0]];
      const def = DD.getConsumable(p[0]);
      t.ok(valid(u, def, 4, 4) && valid(u, def, 4, 5), p[0] + ': yourself or an adjacent ally');
      t.ok(!valid(u, def, 4, 7) && !valid(u, def, 5, 4), p[0] + ': not 3 away, not a foe');
      u.hp = u.maxHp - 25;
      const hp0 = u.hp;
      if (!drink(t, u, p[0], 4, 4)) return;
      t.eq(u.hp - hp0, p[1], p[0] + ': heals ' + p[1]);
      t.eq(u.ap, 2, p[0] + ': 1 AP');
      t.eq(DD.Combat.consumables().length, 0, p[0] + ': gone from the pockets');
      mage.hp = mage.maxHp - 3;
      drink(t, u, p[0], 4, 5);
      t.eq(mage.hp, mage.maxHp, p[0] + ': an ally, capped at max HP');
    });

    fight({ heroes: [{ id: USER, x: 4, y: 4 }, { id: 'test_mage', x: 4, y: 5 }, { id: 'test_cleric', x: 4, y: 7 }] });
    drink(t, me(), 'con_energy_drink', 4, 4);
    t.eq(me().ap, 4, 'Energy Drink: 3 − 1 + 2 = 4 AP');
    t.ok(has(me(), 'haste') && st(me(), 'haste').turns === 2, 'Energy Drink: Hasted through the next turn');
    drink(t, me(), 'con_energy_drink', 4, 5);
    t.eq(hero('test_mage').ap, 5, 'Energy Drink: an adjacent ally gets 2 AP');
    t.ok(has(hero('test_mage'), 'haste'), 'Energy Drink: ...and the Haste');
    t.ok(!has(hero('test_cleric'), 'haste'), 'Energy Drink: nobody else');
    DD.Combat.endTurn();
    t.ok(me().ap === 4 && hero('test_mage').ap === 4 && hero('test_cleric').ap === 3, 'Energy Drink: +1 AP at the start of the next turn (4 vs 3)');
    DD.Combat.endTurn();
    t.ok(me().ap === 3 && !has(me(), 'haste'), 'Energy Drink: back to 3 AP the turn after');

    fight({ heroes: [{ id: USER, x: 4, y: 4 }, { id: 'test_mage', x: 4, y: 5 }] });
    let mage = hero('test_mage');
    mage.hp = mage.maxHp - 10;
    ['poison', 'bleed', 'weak', 'vulnerable', 'slow'].forEach(function (id) { A().addStatus(mage, id, { stacks: 2, turns: 2 }, null); });
    A().addStatus(mage, 'inspired', { turns: 2 }, null);
    const mhp = mage.hp;
    drink(t, me(), 'con_antidote', 4, 5);
    t.eq(mage.statuses.map(function (s) { return s.id; }).join(','), 'inspired', 'Antidote: every debuff gone, buffs kept');
    t.eq(mage.hp - mhp, 5, 'Antidote: heals 5');

    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
    let u = me();
    drink(t, u, 'con_liquid_courage', 1, 4);
    t.ok(has(u, 'empowered') && u.block === 5 && has(u, 'dazzled') && st(u, 'dazzled').turns === 1, 'Liquid Courage: Empowered, 5 Block, Dazzled this turn');
    const chair = give(u, 'gen_throw_chair', 1);
    t.ok(!valid(u, chair, 5, 4) && valid(u, chair, 4, 4), 'Liquid Courage: Dazzled = −1 max range (the chair reaches 3)');
    const g = at(4, 4), ghp = g.hp;
    use(t, u, chair, 4, 4, 'Empowered chair');
    t.eq(ghp - g.hp, 11, 'Liquid Courage: the next skill deals +50% (7 → 11)');
    t.ok(!has(u, 'empowered'), 'Liquid Courage: Empowered used up');
    DD.Combat.endTurn();
    t.ok(!has(me(), 'dazzled'), 'Liquid Courage: the Dazzle wears off with the turn');

    // Mystery Potion: every face of the d6
    const surges = [];
    const off = DD.Events.on('wildmagic:surge', function (e) { surges.push(e); });
    try {
      [1, 2, 3, 4, 5, 6].forEach(function (face) {
        fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
        u = me();
        u.hp = u.maxHp - 20;
        const hp0 = u.hp;
        t.ok(forceD6(face), 'rigged the d6 to ' + face);
        const n0 = surges.length;
        if (!drink(t, u, 'con_mystery_potion', u.x, u.y, 'Mystery Potion (' + face + ')')) return;
        if (face === 1) {
          t.ok(has(u, 'sheep') && st(u, 'sheep').turns === 1, 'Mystery 1: a sheep for the rest of this turn');
          t.ok(DD.Combat.canUse(u, u.basic) !== true, 'Mystery 1: sheep can\'t use skills');
          DD.Combat.endTurn();
          t.ok(!has(me(), 'sheep'), 'Mystery 1: human again next turn');
        } else if (face === 2) {
          t.ok(has(u, 'poison') && st(u, 'poison').stacks === 3, 'Mystery 2: Poisoned 3');
        } else if (face === 3) {
          t.eq(u.hp - hp0, 12, 'Mystery 3: heals 12');
        } else if (face === 4) {
          t.eq(u.ap, 4, 'Mystery 4: +2 AP (3 − 1 + 2)');
        } else if (face === 5) {
          t.ok(has(u, 'invulnerable') && st(u, 'invulnerable').turns === 2, 'Mystery 5: Invulnerable until the end of the next turn');
          DD.Combat._action(function () { A().damage(at(3, 4), u, 10); });
          t.eq(u.hp, hp0, 'Mystery 5: takes no damage');
        } else {
          const got = surges.slice(n0);
          t.ok(DD.WildMagic ? got.length === 1 && got[0].source === 'con_mystery_potion' && got[0].good === true : u.hp - hp0 === 12, 'Mystery 6: one good wild magic surge');
        }
      });
      // 6 with no good surge possible: never a bad one (WildMagic.surge would fall back to any), heal 12 instead
      if (DD.WildMagic && typeof DD.WildMagic.pool === 'function') {
        const realPool = DD.WildMagic.pool;
        DD.WildMagic.pool = function (unit, opts) { return opts && opts.good === true ? [] : realPool.apply(this, arguments); };
        try {
          fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
          u = me();
          u.hp = u.maxHp - 20;
          const hp0 = u.hp, n0 = surges.length;
          t.ok(forceD6(6), 'rigged the d6 to 6');
          drink(t, u, 'con_mystery_potion', u.x, u.y, 'Mystery Potion (6, no good surge)');
          t.ok(surges.length === n0 && u.hp - hp0 === 12, 'Mystery 6 with no good surge available: no surge at all, heal 12');
        } finally { DD.WildMagic.pool = realPool; }
      }
    } finally { off(); }
  });

  // ---- 8. throwables ------------------------------------------------------------------------------------------
  T.suite('kit: consumables — Flask of Bad Decisions, Frost Flask, Thunder Jar, Holy Water', function (t) {
    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }],
      surfaces: [{ x: 4, y: 3, id: 'oil', turns: 5 }, { x: 4, y: 2, id: 'oil', turns: 5 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'water'; } });
    let u = me();
    const mage = hero('test_mage'), a = at(4, 4), b = at(5, 4), mhp = mage.hp;
    t.ok(!valid(u, DD.getConsumable('con_bad_decisions'), 6, 4), 'Bad Decisions: 5 tiles is too far');
    drink(t, u, 'con_bad_decisions', 4, 4);
    t.ok(a.hp === 6 && b.hp === 6 && mhp - mage.hp === 8, 'Bad Decisions: 8 fire damage to everyone in the blast, allies included');
    t.ok([[4, 4], [5, 4], [4, 5]].every(function (p) { const sf = tile(p[0], p[1]).surface; return sf && sf.id === 'fire' && sf.turns === 2; }), 'Bad Decisions: the floor burns for 2 rounds');
    t.ok(tile(3, 4).surface && tile(3, 4).surface.id === 'steam', 'Bad Decisions: the water boils to steam');
    t.ok(tile(4, 2).surface && tile(4, 2).surface.id === 'fire', 'Bad Decisions: the oil slick catches all the way');

    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }],
      surfaces: [{ x: 4, y: 3, id: 'fire', turns: 3 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'water'; } });
    u = me();
    const wet = at(4, 4), dry = at(5, 4), m2 = hero('test_mage');
    A().addStatus(wet, 'wet', { turns: 2 }, null);
    drink(t, u, 'con_frost_flask', 4, 4);
    t.ok(wet.hp === 9 && has(wet, 'frozen') && !has(wet, 'wet'), 'Frost Flask: 5 frost damage, the Wet grunt freezes solid');
    t.ok(dry.hp === 9 && has(dry, 'slow') && st(dry, 'slow').turns === 1, 'Frost Flask: 5 frost damage and Slowed for 1 turn');
    t.ok(m2.hp === m2.maxHp && m2.statuses.length === 0, 'Frost Flask: allies are left alone');
    t.eq(tile(4, 4).t, 'ice', 'Frost Flask: the water freezes');
    t.ok(!tile(4, 3).surface, 'Frost Flask: the fire goes out');

    // Thunder Jar: 8 + two jumps of 4, nearest first, max 2 jumps
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 6, y: 6 }, { id: 'test_grunt', x: 7, y: 7 }] });
    t.ok(!valid(me(), DD.getConsumable('con_thunder_jar'), 6, 4), 'Thunder Jar: 5 tiles is too far');
    let g = [at(4, 4), at(6, 4), at(6, 6), at(7, 7)];
    drink(t, me(), 'con_thunder_jar', 4, 4);
    t.eq(g.map(function (x) { return 14 - x.hp; }).join(','), '8,4,4,0', 'Thunder Jar: 8 to the target, 4 to each of 2 jumps, the 4th foe is spared');
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }] });
    g = [at(4, 4), at(6, 4)];
    A().addStatus(g[0], 'wet', { turns: 2 }, null);
    g[0].hp = 5;
    drink(t, me(), 'con_thunder_jar', 4, 4);
    t.ok(g[0].dead && g[1].hp === 10, 'Thunder Jar: a kill does not stop the jump');
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    A().addStatus(at(4, 4), 'wet', { turns: 2 }, null);
    drink(t, me(), 'con_thunder_jar', 4, 4);
    t.eq(at(4, 4).hp, 2, 'Thunder Jar: Wet takes +50% (12)');
    // water under a target: the whole pool is shocked once, heroes included
    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 7, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }],
      terrain: function (tl) { if (tl.y === 4 && tl.x >= 6) tl.t = 'water'; } });
    const m3 = hero('test_mage'), m3hp = m3.hp;
    g = [at(4, 4), at(6, 4)];
    drink(t, me(), 'con_thunder_jar', 4, 4);
    t.ok(g[1].hp === 14 - 4 - 4 && has(g[1], 'stun'), 'Thunder Jar: the foe in the pool takes the jump (4) + the shock (4) and is Stunned');
    t.ok(m3hp - m3.hp === 4 && has(m3, 'stun'), 'Thunder Jar: the mage standing in that pool is shocked too (4 + Stun)');
    t.ok(!has(g[0], 'stun'), 'Thunder Jar: dry targets are not stunned');

    // Holy Water: undead / devils / demons take 10, holy ground for 3 rounds
    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 4, y: 5 }], enemies: [{ id: 'test_minion', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }] });
    const minion = at(4, 4), gob = at(5, 4), devil = at(3, 4), m4 = hero('test_mage');
    devil.tags = ['devil'];
    drink(t, me(), 'con_holy_water', 4, 4);
    t.ok(minion.dead && devil.hp === 4 && gob.hp === 14, 'Holy Water: 10 holy damage to undead and devils only');
    t.ok([[4, 4], [5, 4], [4, 5], [3, 4], [4, 3]].every(function (p) { const sf = tile(p[0], p[1]).surface; return sf && sf.id === 'holy' && sf.turns === 3; }), 'Holy Water: Holy Ground on the whole splash for 3 rounds');
    wipeEnemies();
    m4.hp = m4.maxHp - 6;
    const m4hp = m4.hp;
    DD.Combat.endTurn();
    t.eq(m4.hp - m4hp, 3, 'Holy Water: an ally ending the turn on Holy Ground heals 3');
  });

  T.suite('kit: consumables — Smoke Bomb, Bag of d4s, Scroll of Yeet, Pocket Sand (Family Size)', function (t) {
    fight({ heroes: [{ id: USER, x: 4, y: 4 }, { id: 'test_mage', x: 4, y: 5 }, { id: 'test_cleric', x: 6, y: 6 }], enemies: [{ id: 'test_archer', x: 4, y: 8 }],
      surfaces: [{ x: 5, y: 4, id: 'fire', turns: 3 }] });
    const u = me(), arch = at(4, 8);
    DD.AI.makeIntent(arch, 'test_arrow', u);
    drink(t, u, 'con_smoke_bomb', 4, 4);
    t.ok([[4, 4], [4, 3], [4, 5], [3, 4]].every(function (p) { const sf = tile(p[0], p[1]).surface; return sf && sf.id === 'smoke' && sf.turns === 2; }), 'Smoke Bomb: smoke on the tiles around you for 2 rounds');
    t.eq(tile(5, 4).surface.id, 'fire', 'Smoke Bomb: never smothers a hazard (the fire stays)');
    t.ok(has(u, 'stealth') && st(u, 'stealth').turns === 2 && has(hero('test_mage'), 'stealth'), 'Smoke Bomb: you and the ally in it are Stealthed');
    t.ok(!has(hero('test_cleric'), 'stealth'), 'Smoke Bomb: allies outside are not');
    t.ok(!DD.Grid.los({ x: 4, y: 8 }, { x: 4, y: 4 }), 'Smoke Bomb: the smoke blocks line of sight');
    const hp0 = u.hp, b0 = u.block;
    DD.Combat.endTurn();
    t.ok(me().hp === hp0 && me().block >= b0, 'Smoke Bomb: the tracking arrow loses you');
    t.ok(tile(4, 4).surface && tile(4, 4).surface.id === 'smoke', 'Smoke Bomb: still smoky in round 2');
    DD.Combat.endTurn();
    t.ok(!tile(4, 4).surface || tile(4, 4).surface.id !== 'smoke', 'Smoke Bomb: cleared after 2 rounds');

    // Bag of d4s
    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 2, y: 3 }],
      objects: [{ x: 4, y: 3, id: 'crate' }], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'water'; } });
    let k = me();
    const standing = at(4, 4), walker = at(2, 3);
    drink(t, k, 'con_bag_of_d4s', 4, 4);
    const d4 = function (x, y) { const sf = tile(x, y).surface; return !!sf && sf.id === 'con_d4s'; };
    t.eq(standing.hp, 14 - 4, 'd4s: the enemy standing on them steps on one right away (4)');
    t.ok(!d4(4, 4), 'd4s: ...and kicks that tile\'s dice away');
    t.ok(d4(3, 4) && d4(4, 5) && tile(3, 4).surface.turns === 3, 'd4s: scattered for 3 rounds; the mage stands on them unharmed');
    t.eq(hero('test_mage').hp, hero('test_mage').maxHp, 'd4s: heroes are safe');
    t.ok(!d4(5, 4) && !d4(4, 3), 'd4s: none in the water or under the crate');
    DD.Combat._action(function () { A().push(k, walker, { x: 0, y: 1 }, 1); });
    t.ok(walker.y === 4 && walker.x === 2, 'd4s: (shoved the walker south)');
    DD.Combat._action(function () { A().push(k, walker, { x: 1, y: 0 }, 1); });
    t.ok(walker.x === 3 && walker.hp === 10 && !d4(3, 4), 'd4s: pushed onto the dice: 4 damage, dice gone');
    DD.Combat._action(function () { A().applyElement(4, 5, 'fire', null, { noUnits: true }); });
    t.ok(!d4(4, 5), 'd4s: fire melts them');
    // flyers float over, walkers in a planning move step on them
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 1 }, { id: 'test_grunt', x: 5, y: 2 }] });
    k = me();
    drink(t, k, 'con_bag_of_d4s', 3, 4);
    const flyer = at(3, 1), stroller = at(5, 2);
    flyer.flags.flying = true;
    DD.Combat._action(function () { A().teleport(flyer, 3, 3); });
    t.ok(flyer.hp === 14 && d4(3, 3), 'd4s: flyers float over (dice untouched)');
    DD.Combat._action(function () { A().moveAlong(stroller, [{ x: 4, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 4 }], { action: false }); });
    t.ok(stroller.hp === 10 && stroller.y === 4 && !d4(4, 4), 'd4s: a walking enemy steps on them once (4 damage) and keeps walking');
    // a kill by dice is an environmental kill for whoever threw them
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 3 }] });
    k = me();
    drink(t, k, 'con_bag_of_d4s', 3, 4);
    const victim = at(3, 3);
    victim.hp = 3;
    const hype0 = S().hype;
    DD.Combat._action(function () { A().push(k, victim, { x: 0, y: 1 }, 1); });
    t.ok(victim.dead && S().hype - hype0 === 20 && S().stats.units[k.id].kills === 1, 'd4s: a dice kill counts as the thrower\'s environmental kill (+20 Hype)');
    // they wear off after 3 rounds
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.ok(d4(4, 4) || d4(2, 4), 'd4s: still there after 2 rounds');
    DD.Combat.endTurn();
    t.ok(!d4(4, 4) && !d4(2, 4), 'd4s: gone after 3');

    // Scroll of Yeet
    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 3, y: 6 }, { id: 'test_brute', x: 1, y: 2 }] });
    const yeet = DD.getConsumable('con_scroll_of_yeet');
    let y = me();
    S().consumables = ['con_scroll_of_yeet'];
    t.ok(valid(y, yeet, 4, 4) && valid(y, yeet, 1, 6), 'Yeet: a foe or an ally in a straight line');
    t.ok(!valid(y, yeet, 3, 6), 'Yeet: straight lines only');
    t.ok(!valid(y, yeet, 1, 2), 'Yeet: the immovable brute is too heavy');
    const ga = at(4, 4);
    drink(t, y, 'con_scroll_of_yeet', 4, 4);
    t.ok(ga.x === 7 && ga.y === 4 && ga.hp === 14, 'Yeet: 3 tiles straight away from you, no crash');
    const ma = hero('test_mage'), mahp = ma.hp;
    drink(t, y, 'con_scroll_of_yeet', 1, 6);
    t.ok(ma.y === 8 && mahp - ma.hp === 5, 'Yeet: an ally flies too and crashes into the map edge for 5');
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }] });
    const gb = at(4, 4), gc = at(6, 4);
    drink(t, me(), 'con_scroll_of_yeet', 4, 4);
    t.ok(gb.x === 5 && gb.hp === 9 && gc.hp === 9, 'Yeet: crashing into a foe deals 5 to both');
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; } });
    const gd = at(4, 4);
    drink(t, me(), 'con_scroll_of_yeet', 4, 4);
    t.ok(gd.dead, 'Yeet: into the pit');

    // Pocket Sand (Family Size): a cone 3 deep
    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 3, y: 5 }],
      enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 3, y: 3 }, { id: 'test_grunt', x: 4, y: 6 }, { id: 'test_grunt', x: 0, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
    drink(t, me(), 'con_pocket_sand', 2, 4);
    [[2, 4], [3, 3], [4, 6]].forEach(function (p) {
      const f = at(p[0], p[1]);
      t.ok(has(f, 'dazzled') && has(f, 'weak') && st(f, 'weak').turns === 1, 'Pocket Sand (FS): the foe at ' + p + ' is Dazzled and Weakened');
    });
    t.ok(!has(at(0, 4), 'dazzled') && !has(at(5, 4), 'dazzled'), 'Pocket Sand (FS): nothing behind you or beyond 3');
    t.eq(hero('test_mage').statuses.length, 0, 'Pocket Sand (FS): allies in the cone are spared');
  });

  // ---- 9. edge cases ---------------------------------------------------------------------------------------
  T.suite('kit: edge cases — no target, dying users, map edges, hazards, impaired users', function (t) {
    // 1. execute with a null target / an empty far tile for every level and consumable
    GEN.forEach(function (id) {
      [1, 2, 3].forEach(function (lv) {
        fight({ heroes: [{ id: USER, x: 2, y: 4 }, { id: 'test_mage', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] });
        const u = me(), sl = give(u, id, lv);
        u.ap = 6;
        t.tryRun(id + ' L' + lv + ' null target', function () { DD.Combat._action(function () { sk(id).execute(DD.Targeting.buildCtx(u, sl, null)); }); });
        t.tryRun(id + ' L' + lv + ' empty far tile', function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, { x: 8, y: 0 }, { pay: false }); }); });
        sane(t, id + ' L' + lv + ' (no target)');
      });
    });
    CON.forEach(function (id) {
      fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] });
      const u = me(), def = DD.getConsumable(id);
      t.tryRun(id + ' null target', function () { DD.Combat._action(function () { def.execute(DD.Targeting.buildCtx(u, def, null)); }); });
      t.tryRun(id + ' empty far tile', function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, def, { x: 8, y: 0 }, { pay: false }); }); });
      sane(t, id + ' (no target)');
    });

    // 2. the target died before the effect / the user dies mid-skill (thorns)
    fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }] });
    let u = me();
    const dead = at(3, 4);
    A().kill(dead, null);
    t.tryRun('chair at a corpse', function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, give(u, 'gen_throw_chair', 3), { x: 3, y: 4 }, { pay: false }); }); });
    t.eq(at(3, 5).hp, 14, 'a dead target: no splinters flying off a corpse');
    fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
    u = me();
    u.hp = 5;
    const thorny = at(3, 4);
    A().addStatus(thorny, 'thorns', { stacks: 20, turns: 2 }, null);
    t.tryRun('punch a thorn bush', function () { use(t, u, give(u, 'gen_sucker_punch', 3), 3, 4, 'Sucker Punch into thorns'); });
    t.ok(u.downed && has(thorny, 'weak'), 'the puncher is downed by thorns, the punch still Weakens');
    sane(t, 'thorns');
    fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
    u = me();
    u.hp = 5;
    A().addStatus(at(3, 4), 'thorns', { stacks: 20, turns: 2 }, null);
    t.tryRun('shove a thorn bush', function () { use(t, u, give(u, 'gen_shove', 1), 3, 4, 'Shove into thorns'); });
    t.ok(u.downed && at(3, 4) && at(3, 4).hp === 12, 'a downed shover pushes nobody');
    sane(t, 'thorns shove');

    // 3. map edges
    fight({ heroes: [{ id: USER, x: 7, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 4 }] });
    use(t, me(), give(me(), 'gen_shove', 1), 8, 4, 'Shove at the edge');
    t.ok(at(8, 4) && at(8, 4).hp === 14 - 2 - 3, 'Shove at the map edge: crash for 3, stays on the board');
    fight({ heroes: [{ id: USER, x: 5, y: 8 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }, { id: 'test_grunt', x: 8, y: 7 }, { id: 'test_grunt', x: 7, y: 8 }] });
    t.tryRun('barrel in the corner', function () { use(t, me(), give(me(), 'gen_barrel_toss', 3), 8, 8, 'Barrel Toss III into the corner'); });
    t.ok(at(8, 8) && at(8, 8).hp === 14 - 7 && at(8, 6) && at(6, 8), 'corner blast: the center stays, its neighbours are thrown outward along the edges');
    sane(t, 'corner');
    fight({ heroes: [{ id: USER, x: 0, y: 4 }] });
    const roll = give(me(), 'gen_dodge_roll', 2);
    t.ok(DD.Targeting.validTargets(me(), roll).every(function (p) { return p.x >= 0 && DD.Grid.inBounds(p.x, p.y); }), 'Dodge Roll at the edge: only in-bounds tiles');

    // 4. hazards
    fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'lava'; } });
    use(t, me(), give(me(), 'gen_shove', 1), 3, 4, 'Shove into lava');
    t.ok(at(5, 4) && has(at(5, 4), 'burn') && at(5, 4).hp === 14 - 2 - 8, 'shoved through lava: 8 fire + Burn on the way');
    fight({ heroes: [{ id: USER, x: 2, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'lava'; } });
    u = me();
    const hpL = u.hp;
    use(t, u, give(u, 'gen_dodge_roll', 1), 4, 4, 'Dodge Roll into lava (your call)');
    t.ok(u.hp < hpL && has(u, 'burn'), 'rolling into lava hurts, as the preview warns');

    // 5. impaired users: stun-likes and sheep stop everything; Silence stops nothing (no spells here); charm
    ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (cond) {
      fight({ heroes: [{ id: USER, x: 2, y: 4 }, { id: 'test_mage', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      u = me();
      A().addStatus(u, cond, { turns: 2 }, null);
      t.ok(GEN.every(function (id) { return DD.Combat.canUse(u, give(u, id, 3)) !== true; }), cond + ': no generic skill usable');
      S().consumables = ['con_red_drink'];
      t.ok(DD.Combat.canUseConsumable(u, 0) !== true, cond + ': no drinking');
    });
    fight({ heroes: [{ id: USER, x: 2, y: 4 }, { id: 'test_mage', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = me();
    u.hp -= 10;
    A().addStatus(u, 'silenced', { turns: 2 }, null);
    GEN.forEach(function (id) { t.eq(DD.Combat.canUse(u, give(u, id, 1)), true, 'Silenced: ' + id + ' still works (it is not a spell)'); });
    fight({ heroes: [{ id: USER, x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    u = me();
    const charmer = at(4, 4);
    A().addStatus(u, 'charmed', { turns: 2 }, charmer);
    use(t, u, give(u, 'gen_throw_chair', 1), 4, 4, 'charmed chair');
    t.eq(charmer.hp, 14, 'Charmed: a chair can\'t hurt the charmer');
    // summons can't drink
    fight({ heroes: [{ id: 'test_summoner', x: 2, y: 4 }] });
    const hound = DD.Combat.party().filter(function (x) { return x.kind === 'summon'; })[0];
    S().consumables = ['con_red_drink'];
    t.ok(!hound || DD.Combat.canUseConsumable(hound, 0) !== true, 'summons can\'t use consumables');
  });

  // ---- 10. previews ------------------------------------------------------------------------------------------
  /** Crowded arena (hurt user with 6 AP, a downed cleric, oil, a pit, water, a barrel); heroId: the user (default knight). */
  function busyArena(heroId) {
    const id = heroId || USER;
    fight({
      heroes: [{ id: id, x: 4, y: 4, level: heroId ? 5 : 3 }, { id: 'test_mage', x: 3, y: 4 }, { id: 'test_cleric', x: 4, y: 3 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_archer', x: 4, y: 7 }, { id: 'test_minion', x: 5, y: 5 },
        { id: 'test_brute', x: 7, y: 2 }],
      objects: [{ x: 6, y: 1, id: 'barrel_explosive' }, { x: 2, y: 2, id: 'crate' }],
      surfaces: [{ x: 6, y: 4, id: 'oil', turns: 5 }],
      terrain: function (tl) { if (tl.x === 8 && tl.y === 4) tl.t = 'pit'; if (tl.y === 6 && tl.x <= 2) tl.t = 'water'; },
    });
    A().kill(hero('test_cleric'), null);
    const u = hero(id);
    u.hp = Math.max(1, u.maxHp - 12);
    u.ap = 6;
    return u;
  }
  function targetsOf(u, ref, n) {
    const list = DD.Targeting.validTargets(u, ref);
    if (list.length <= n) return list;
    const scored = list.map(function (p, i) {
      const ctx = DD.Targeting.pure(function () { return DD.Targeting.buildCtx(u, ref, p); });
      return { p: p, v: (ctx ? ctx.units.length : 0) * 10 - i * 0.001 };
    }).sort(function (a, b) { return b.v - a.v; });
    return scored.slice(0, n).map(function (e) { return e.p; });
  }
  T.suite('kit: HUD previews match reality for every generic skill level and every consumable', function (t) {
    let checks = 0;
    GEN.forEach(function (id) {
      [1, 2, 3].forEach(function (lv) {
        let u = busyArena();
        const targets = targetsOf(u, give(u, id, lv), 3);
        targets.forEach(function (p) {
          u = busyArena();
          const sl = give(u, id, lv);
          if (DD.Combat.canUse(u, sl) !== true) return;
          if (checkSkillPreview(t, u, sl, p.x, p.y, id + ' L' + lv + ' @' + p.x + ',' + p.y)) checks++;
        });
      });
    });
    CON.forEach(function (id) {
      if (typeof DD.getConsumable(id).preview === 'function') return;   // the Mystery Potion: below
      let u = busyArena();
      const targets = targetsOf(u, DD.getConsumable(id), 2);
      targets.forEach(function (p) {
        u = busyArena();
        if (checkConsPreview(t, u, id, p.x, p.y, id + ' @' + p.x + ',' + p.y)) checks++;
      });
    });
    t.ok(checks >= 60, checks + ' preview checks');
    // the Mystery Potion's preview never gives the roll away: a dry run rolls the same die as the real drink (same RNG
    // state), so without its own preview the HUD would show "? +12" or "? Sheep" and you could only drink good rolls
    const seen = [1, 2, 3, 4, 5, 6].map(function (face) {
      const u = busyArena();
      S().consumables = ['con_mystery_potion'];
      t.ok(forceD6(face), 'rigged the d6 to ' + face);
      const fp = fingerprint(S());
      const p = DD.Targeting.preview(u, DD.getConsumable('con_mystery_potion'), { x: u.x, y: u.y });
      t.ok(fingerprint(S()) === fp, 'Mystery Potion preview (d6 = ' + face + ') leaves the fight untouched');
      const e = p.perUnit[u.id] || {};
      t.ok(p.uncertain && e.uncertain && Object.keys(p.perUnit).length === 1, 'Mystery Potion preview (d6 = ' + face + '): one uncertain "?" on the drinker');
      t.ok(!e.dmg && !e.heal && !e.lethal && !(e.statuses || []).length && !e.moved && !p.hype, 'Mystery Potion preview (d6 = ' + face + '): no numbers or statuses');
      return JSON.stringify(e);
    });
    t.ok(seen.every(function (x) { return x === seen[0]; }), 'Mystery Potion: the same preview for every face of the d6 ' + seen[0]);
  });

  // Every real hero's passive, Rage, gold-scaling and item hooks are in play when they use the kit: the previews must
  // still be exact (full runs only; the fixture knight above covers isolated runs).
  T.suite('kit: previews match reality with every real hero as the user', function (t) {
    const real = Object.keys(DD.defs.heroes).filter(function (k) { return !/^test_/.test(k); });
    if (!real.length) { t.skip('no real heroes loaded (isolated run)'); return; }
    let checks = 0;
    real.forEach(function (hid) {
      GEN.forEach(function (id) {
        [1, 3].forEach(function (lv) {
          let u = busyArena(hid);
          targetsOf(u, give(u, id, lv), 2).forEach(function (p) {
            u = busyArena(hid);
            const sl = give(u, id, lv);
            if (DD.Combat.canUse(u, sl) !== true) return;
            if (checkSkillPreview(t, u, sl, p.x, p.y, hid + ': ' + id + ' L' + lv + ' @' + p.x + ',' + p.y)) checks++;
          });
        });
      });
      CON.forEach(function (id) {
        if (typeof DD.getConsumable(id).preview === 'function') return;
        let u = busyArena(hid);
        targetsOf(u, DD.getConsumable(id), 1).forEach(function (p) {
          u = busyArena(hid);
          if (checkConsPreview(t, u, id, p.x, p.y, hid + ': ' + id + ' @' + p.x + ',' + p.y)) checks++;
        });
      });
    });
    t.ok(checks >= real.length * 30, checks + ' preview checks with ' + real.length + ' real heroes');
    // the push-path highlight with the real modifyPush hooks: Marwyn (1 shorter) and the cursed Barrel Armor (2 further)
    [['marwyn', []], ['zarathor', ['barrel_armor']]].forEach(function (c) {
      if (!DD.getHero(c[0]) || c[1].some(function (it) { return !DD.getItem(it); })) return;
      [['gen_shove', 2, 1], ['gen_shove', 2, 3], ['con_scroll_of_yeet', 3, 1]].forEach(function (k) {
        fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: c[0], x: k[1], y: 4, items: c[1] }] });
        const v = hero(c[0]);
        const ref = /^gen_/.test(k[0]) ? give(me(), k[0], k[2]) : DD.getConsumable(k[0]);
        const area = keys(DD.Targeting.area(me(), ref, k[2], { x: k[1], y: 4 }));
        if (/^gen_/.test(k[0])) use(t, me(), ref, k[1], 4, c[0] + ': ' + k[0] + ' L' + k[2]);
        else drink(t, me(), k[0], k[1], 4, c[0] + ': ' + k[0]);
        const landed = [];
        for (let x = k[1]; x <= v.x; x++) landed.push({ x: x, y: 4 });
        t.eq(area, keys(landed), c[0] + (c[1].length ? ' in ' + c[1].join('+') : '') + ': the ' + k[0] + ' L' + k[2] + ' highlight ends where they land (' + v.x + ',4)');
      });
    });
  });

  // ---- 11. AutoPlay and consumables ------------------------------------------------------------------------
  function takeTurn() { DD.AutoPlay.takeTurn(); }
  T.suite('kit: AutoPlay uses consumables sensibly', function (t) {
    // a badly hurt hero, a Red Drink, nothing to hit: it drinks (on the hurt one)
    fight({ heroes: [{ id: USER, x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], consumables: ['con_red_drink'] });
    const mage = hero('test_mage');
    mage.hp = 5;
    takeTurn();
    t.eq(DD.Combat.consumables().length, 0, 'AutoPlay drinks the Red Drink when an ally is at 5 HP');
    t.ok(mage.hp >= 15, 'AutoPlay: the drink went to the hurt mage (' + mage.hp + ' HP)');
    // everybody healthy: it keeps the drinks
    fight({ heroes: [{ id: USER, x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 5, y: 5 }], consumables: ['con_red_drink', 'con_big_red_drink', 'con_antidote'] });
    for (let i = 0; i < 2 && !S().result; i++) { takeTurn(); if (!S().result) DD.Combat.endTurn(); }
    t.ok(DD.Combat.consumables().indexOf('con_big_red_drink') >= 0, 'AutoPlay does not waste a Big Red Drink on healthy heroes');
    // a cluster of foes and a firebomb: KABOOM
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 4, y: 5 }], consumables: ['con_bad_decisions'] });
    takeTurn();
    t.eq(DD.Combat.consumables().length, 0, 'AutoPlay throws the Flask of Bad Decisions at 4 clustered foes');
    t.ok(DD.Combat.enemies().every(function (e) { return e.hp <= 6; }), 'AutoPlay: every grunt in the blast is singed');
    // two foes flanking an ally: the only blast that gets both also burns the ally, so the flask stays in the bag...
    fight({ heroes: [{ id: USER, x: 1, y: 4 }, { id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 4, y: 5 }], consumables: ['con_bad_decisions'] });
    hero('test_mage').ap = 0;
    takeTurn();
    t.ok(DD.Combat.consumables().indexOf('con_bad_decisions') >= 0, 'AutoPlay: no firebomb when the blast would burn an ally');
    // ...while the same pair without the ally in between gets bombed
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 4, y: 5 }], consumables: ['con_bad_decisions'] });
    takeTurn();
    t.eq(DD.Combat.consumables().length, 0, 'AutoPlay: the same two foes without an ally between them get the flask');
    // a foe on the edge of a pit and a Scroll of Yeet
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_brute', x: 8, y: 8 }, { id: 'test_grunt', x: 4, y: 4 }],
      terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; }, consumables: ['con_scroll_of_yeet'] });
    const g = at(4, 4);
    takeTurn();
    t.ok(g.dead, 'AutoPlay yeets the grunt into the pit');
    // utility bottles stay in the bag for the player (smoke, energy, courage)
    fight({ heroes: [{ id: USER, x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }], consumables: ['con_smoke_bomb', 'con_energy_drink', 'con_liquid_courage'] });
    takeTurn();
    t.eq(DD.Combat.consumables().length, 3, 'AutoPlay leaves utility consumables alone');
    sane(t, 'autoplay consumables');
  });

  T.suite('kit: AutoPlay battles with the whole kit socketed and full pockets', function (t) {
    const loadouts = [
      [USER, ['gen_throw_chair', 'gen_shove', 'gen_taunt', 'gen_rally']],
      ['test_mage', ['gen_barrel_toss', 'gen_pocket_sand', 'gen_sucker_punch', 'gen_dodge_roll']],
      ['test_cleric', ['gen_first_aid', 'gen_second_wind', 'gen_power_nap', 'gen_tactical_retreat']],
      ['test_rogue', ['gen_sucker_punch', 'gen_throw_chair', 'gen_first_aid', 'gen_barrel_toss']],
    ];
    const encs = ['test_a1_normal', 'test_a2_normal', 'test_a1_elite', 'test_a3_normal'].filter(function (id) { return !!DD.getEncounter(id); });
    if (!encs.length) { t.skip('fixture encounters missing'); return; }
    const used = {};
    let battles = 0, wins = 0;
    encs.forEach(function (encId, i) {
      const lvl = 3 + i;
      const party = loadouts.map(function (lo) {
        return DD.Combat.makeRunHero({ id: lo[0], level: lvl, skills: lo[1].map(function (id) { return { id: id, level: 1 + ((i + lo[1].indexOf(id)) % 3) }; }) });
      });
      const rng = DD.RNG(t.seed + ':kit-battle-' + i);
      const setup = DD.Encounter.build(DD.getEncounter(encId), party, { rng: rng, act: DD.getEncounter(encId).act });
      DD.Combat.start(setup, { seed: t.seed + ':kit-' + i, headless: true, consumables: CON.slice((i * 3) % 12, (i * 3) % 12 + 3) });
      A().addRule({ id: 'kit_use_counter', name: 'Kit counter', hooks: { onSkillUsed: function (ctx) {
        if (!A().simulating && ctx && ctx.skill && /^(gen|con)_/.test(ctx.skill.id)) used[ctx.skill.id] = (used[ctx.skill.id] || 0) + 1;
      } } });
      const res = t.tryRun('runBattle ' + encId, function () { return DD.AutoPlay.runBattle(25); });
      battles++;
      if (res && res.result === 'victory') wins++;
      t.ok(res && (res.result === 'victory' || res.result === 'defeat' || res.timeout), encId + ': the battle ends (' + (res && (res.result || 'timeout')) + ' in ' + (res && res.rounds) + ' rounds)');
      sane(t, encId);
    });
    const kinds = Object.keys(used);
    t.log('kit uses in ' + battles + ' AutoPlay battles (' + wins + ' won): ' + JSON.stringify(used));
    t.ok(kinds.filter(function (k) { return /^gen_/.test(k); }).length >= 4, 'AutoPlay found a use for several generic skills (' + kinds.join(', ') + ')');
  });

  // ---- 12. run layer -------------------------------------------------------------------------------------------
  T.suite('kit: run layer — skill tomes, level-ups, rewards and shop offer the kit', function (t) {
    if (!DD.Run || !DD.Rewards || typeof DD.Run.newRun !== 'function') { t.skip('run layer missing'); return; }
    const savedUi = DD.Run.useUi;
    const savedMeta = DD.Meta ? DD.util.deepClone(DD.Meta.data) : null;
    DD.Run.useUi = false;
    try {
      const run = DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], 'normal', 'kit-run');
      t.ok(!!run, 'a test run');
      if (!run) return;
      const rh = run.party[0];
      const gen = DD.Run.learnableFor(rh, { generic: true }), own = DD.Run.learnableFor(rh, { generic: false });
      t.ok(GEN.every(function (id) { return gen.indexOf(id) >= 0; }), 'every generic skill is learnable by any hero');
      t.ok(GEN.every(function (id) { return own.indexOf(id) < 0; }), '...but only from the generic pool');
      // skill tomes: 35% generic
      const rng = DD.RNG('kit-tomes');
      const seen = {};
      for (let i = 0; i < 120; i++) {
        const tome = DD.Rewards.skillTome(null, rng, run);
        if (tome && /^gen_/.test(tome.id)) {
          seen[tome.id] = 1;
          t.ok(tome.type === 'skill' && tome.label === 'Skill Tome: ' + sk(tome.id).name && tome.desc.indexOf(DD.skillDesc(sk(tome.id), 1, null)) >= 0, 'tome ' + tome.id + ' reads its level I text');
        }
      }
      t.ok(Object.keys(seen).length >= 6, 'skill tomes offer generic skills (' + Object.keys(seen).length + ' different seen)');
      // learn one, upgrade to III, then it is maxed
      const res = DD.Run.giveSkill(0, 'gen_throw_chair', 'tome');
      t.ok(res && res.ok !== false, 'learn Throw Chair from a tome');
      const idx = rh.skills.map(function (s) { return s.id; }).indexOf('gen_throw_chair');
      t.ok(idx >= 0 && rh.skills[idx].level === 1, 'socketed at I');
      DD.Run.upgradeSkill(0, idx);
      DD.Run.upgradeSkill(0, idx);
      t.eq(rh.skills[idx].level, 3, 'upgraded to III');
      t.ok(DD.Run.upgradableFor(rh).indexOf(idx) < 0, 'III is the max');
      // consumables: every one drops, commons ~2.5× more often than rares
      const cr = DD.RNG('kit-cons'), count = {};
      for (let i = 0; i < 900; i++) { const id = DD.Rewards.randomConsumable(cr); count[id] = (count[id] || 0) + 1; }
      t.ok(CON.every(function (id) { return count[id] > 0; }), 'every consumable can drop: ' + JSON.stringify(count));
      const avg = function (r) { const ids = CON.filter(function (id) { return DD.getConsumable(id).rarity === r; }); return ids.reduce(function (a, id) { return a + (count[id] || 0); }, 0) / ids.length; };
      t.ok(avg('common') > avg('rare') * 1.5, 'commons drop more than rares (' + avg('common').toFixed(1) + ' vs ' + avg('rare').toFixed(1) + ')');
      CON.forEach(function (id) {
        const r = DD.Rewards.consumableReward(id);
        t.ok(r && r.type === 'consumable' && r.label === DD.getConsumable(id).name && r.desc === DD.getConsumable(id).desc && DD.Rewards.consumablePrice(id) === DD.getConsumable(id).price, id + ': reward card + price');
      });
      // shop stock uses the real prices
      const sr = DD.RNG('kit-shop');
      let stocked = 0;
      for (let i = 0; i < 20; i++) {
        const inv = DD.Rewards.shopInventory(1, sr, run);
        (inv.consumables || []).forEach(function (e) {
          if (!/^con_/.test(e.id)) return;
          stocked++;
          t.ok(e.price === DD.getConsumable(e.id).price && e.price >= 20 && e.price <= 35, 'shop: ' + e.id + ' for ' + e.price + ' gold');
        });
      }
      t.ok(stocked >= 20, 'shops stock the kit (' + stocked + ' entries)');
      // applying a consumable reward fills the pockets, a full bag refuses
      run.consumables.length = 0;
      t.ok(DD.Rewards.apply(DD.Rewards.consumableReward('con_red_drink'), { run: run }).ok, 'reward: Red Drink into the pockets');
      DD.Rewards.apply(DD.Rewards.consumableReward('con_frost_flask'), { run: run });
      DD.Rewards.apply(DD.Rewards.consumableReward('con_bag_of_d4s'), { run: run });
      t.eq(run.consumables.join(','), 'con_red_drink,con_frost_flask,con_bag_of_d4s', 'three pockets filled');
      t.eq(DD.Rewards.apply(DD.Rewards.consumableReward('con_antidote'), { run: run }).reason, 'full', 'a full bag refuses a fourth');
      // a real run fight: the learned skill is socketed, a drink comes out of the run's pockets
      if (DD.Encounter && DD.getEncounter('test_a1_normal')) {
        DD.Run.startCombat('test_a1_normal', 'normal');
        const cs = DD.Combat.state;
        t.ok(cs && cs.run === run, 'run combat started');
        const ku = cs.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
        t.ok(ku && ku.skills.some(function (s) { return s.id === 'gen_throw_chair' && s.level === 3; }), 'the knight brought Throw Chair III');
        if (cs.deploy && cs.deploy.active) cs.deploy.active = false;
        t.ok(DD.Combat.useConsumable(ku, 0, ku.x, ku.y), 'the knight drinks the Red Drink from the run pockets');
        t.eq(run.consumables.join(','), 'con_frost_flask,con_bag_of_d4s', 'the run inventory lost it');
        t.tryRun('finish the run fight', function () { DD.AutoPlay.runBattle(30); });
        if (DD.FX && DD.FX.flush) DD.FX.flush();
        if (DD.Run.inCombat()) DD.Run.finishCombat(cs.result || 'defeat', cs);
        t.ok(!DD.Run.inCombat(), 'the fight handed back to the run');
      }
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      if (DD.Storage && DD.Run.SAVE_KEY) DD.Storage.remove(DD.Run.SAVE_KEY);
      if (savedMeta) { DD.Meta.data = savedMeta; DD.Meta.save(); }
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
  });
})();
