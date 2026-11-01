/* Dungeons and Degenerates — tests/content/shared.js
 * Suites 'items: …' for the shared item pool (js/data/items.js): registration (counts per rarity and slot, ids,
 * text, prices, stats shown in desc), every item's stats and hooks checked in sandbox fights against the exact
 * numbers of its desc, the cursed downsides, Steve the Torchbearer, exact and side-effect-free previews with items
 * equipped, random loadouts in AutoPlay battles, the reward / shop pipelines (DD.Rewards) and the run layer
 * (equip, heroStats, run gold). The core suites use only the test_ fixture heroes / enemies, so they also run
 * isolated (tools/test.sh "suite=items&isolate=items,shared"); the 'items: real heroes' suites and the random-passive
 * checks run only when those content files are loaded (they skip or log otherwise). Two AutoPlay diagnostics skip
 * unless asked for: the rarity balance sim (itemsim=1) and the per-item outlier sim (itemsim=each).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const RARITY_COUNT = { common: 18, rare: 16, legendary: 7, cursed: 8 };
  const SLOT_COUNT = { weapon: 16, armor: 16, trinket: 17 };
  const STAT_KEYS = ['hp', 'ap', 'mov', 'armor', 'dmg', 'heal', 'range', 'block', 'hype'];
  const HOOK_NAMES = ['onCombatStart', 'onCombatEnd', 'onRoundStart', 'onTurnStart', 'onTurnEnd', 'onMove', 'onEnterTile', 'onSkillUsed',
    'modifyCost', 'modifyRange', 'modifyOutgoingDamage', 'modifyIncomingDamage', 'onDealDamage', 'onTakeDamage', 'onKill', 'onDeath',
    'onDowned', 'onHealed', 'onStatusApplied', 'onAllyDeath', 'modifyStatus', 'modifyPush'];
  const HERO_PREFIX = /^(zar|syl|mar|mrw|cor|jos|ell|spa|sla|slate|buga|gen|a1|a2|a3|dm|wm|test|rt|rp)_/;
  const EAST = { x: 1, y: 0 }, WEST = { x: -1, y: 0 };

  // ---- helpers ----------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function S() { return DD.Combat.state; }
  function loaded(t) {
    if (!DD.Items || !DD.getItem('rusty_shiv')) { t.skip('js/data/items.js is not loaded'); return false; }
    return true;
  }
  function shared() { return DD.Items.ids.map(function (id) { return DD.getItem(id); }); }
  /** Sandbox fight that never ends on its own (custom objective). cfg as DD.Combat.sandbox, plus onRoundEnd(s). */
  function fight(cfg) {
    cfg = cfg || {};
    const enc = { id: 'items_arena', checkObjective: function () { return null; } };
    if (cfg.onRoundEnd) enc.onRoundEnd = cfg.onRoundEnd;
    return DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 5, noPlan: true, objective: { type: 'custom', text: 'Item test' }, encounter: enc,
    }, cfg));
  }
  function kn(items, x, y, extra) {
    return Object.assign({ id: 'test_knight', x: x === undefined ? 2 : x, y: y === undefined ? 4 : y, items: items || [] }, extra || {});
  }
  function unitOf(defId, n) { return S().units.filter(function (u) { return u.defId === defId && !u.dead; })[n || 0] || null; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0] || null; }
  /** One of u's skills through the real player API (pays AP, cooldowns, hooks). */
  function use(u, id, x, y) { const sl = slotOf(u, id); return !!sl && DD.Combat.useSkill(u, sl, x, y); }
  function slash(k, foe) { return use(k, 'test_slash', foe.x, foe.y); }
  /** fn as one public action (a pending end of combat is finalised afterwards, like a player action). */
  function act(fn) { return DD.Combat._action(fn); }
  /** An enemy fires its first skill at (x, y) right now, exactly like an executed intent. */
  function enemyHits(e, x, y) {
    return act(function () { return DD.Combat.resolveSkill(e, e.skillSlots[0], { x: x, y: y }, { quiet: true, extra: { isIntent: true } }); });
  }
  function stacks(u, id) { const s = A().getStatus(u, id); return s ? s.stacks : 0; }
  function root(units) { units.forEach(function (u) { A().addStatus(u, 'root', { turns: 9 }, null); }); }
  function quietWarn(re, fn) {
    const orig = DD.warn;
    DD.warn = function (m) { if (!re.test(String(m))) orig(m); };
    try { return fn(); } finally { DD.warn = orig; }
  }
  function fingerprint(s) {
    return JSON.stringify([
      s.units.map(function (u) {
        return [u.id, u.x, u.y, u.hp, u.maxHp, u.block, u.ap, !!u.dead, !!u.downed, (u.statuses || []).map(function (x) { return [x.id, x.stacks, x.turns]; }),
          (u.intents || []).length, DD.Combat.slotsOf(u).map(function (sl) { return [sl.id, sl.cd, sl.uses]; }), u.data, u.flags];
      }),
      s.grid.tiles.map(function (tl) { return [tl.t, tl.h, tl.surface && [tl.surface.id, tl.surface.turns], tl.obj && [tl.obj.id, tl.obj.hp]]; }),
      s.hype, s.log.length, s.rng.getState(), s.sandboxGold, (s.consumables || []).slice(), s.round, s.phase, s.rules.length, s.result,
    ]);
  }
  function sane(t, label) {
    if (T.contentHelpers && T.contentHelpers.sanity) return T.contentHelpers.sanity(t, label);
    let ok = true;
    S().units.forEach(function (u) {
      if (!isFinite(u.hp) || u.hp < 0 || u.hp > u.maxHp || !isFinite(u.block) || !isFinite(u.ap)) { ok = false; t.fail(label + ': ' + u.name + ' broken numbers'); }
    });
    return ok;
  }
  /** HUD preview of a skill use, then the real use: the preview must not touch the fight and must predict it exactly. */
  function previewThenUse(t, label, u, slot, x, y) {
    const s = S();
    const fp = fingerprint(s);
    const prev = DD.Combat.preview(u, slot, x, y);
    t.eq(fingerprint(s), fp, label + ': the preview leaves the real fight untouched');
    const before = {};
    s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed }; });
    const hype0 = s.hype;
    t.ok(DD.Combat.useSkill(u, slot, x, y), label + ': used');
    // [phase 4, engine fairness] a hit that rolls dice (the Chaos Crystal's surge) previews uncertain: other rolls'
    // expected outcome, never the real roll. Only certain previews are exact.
    if (prev.uncertain) {
      t.ok(Object.keys(prev.perUnit).every(function (k) { return prev.perUnit[k].uncertain; }), label + ': uncertain preview, every badge says "?"');
      return prev;
    }
    s.units.forEach(function (o) {
      const b = before[o.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[o.id];
      t.eq(b.hp - o.hp, e ? (e.dmg || 0) - (e.heal || 0) : 0, label + ': ' + o.name + ' HP change as previewed');
      t.eq((o.dead && !b.dead) || (o.downed && !b.downed), !!(e && e.lethal), label + ': ' + o.name + ' KO as previewed');
    });
    t.eq(s.hype - hype0, prev.hype, label + ': Hype as previewed');
    return prev;
  }
  function sumBy(list, key) { const o = {}; list.forEach(function (x) { o[x[key]] = (o[x[key]] || 0) + 1; }); return o; }

  // ==========================================================================================================
  // Registration
  // ==========================================================================================================
  T.suite('items: registry — 49 shared items, rarities, slots, ids, text, stats and prices', function (t) {
    if (!loaded(t)) return;
    const list = shared();
    t.eq(list.length, 49, '49 shared items');
    t.eq(new Set(DD.Items.ids).size, 49, 'no duplicate ids');
    const byR = sumBy(list, 'rarity'), byS = sumBy(list, 'slot');
    Object.keys(RARITY_COUNT).forEach(function (r) { t.eq(byR[r], RARITY_COUNT[r], r + ' count'); });
    Object.keys(SLOT_COUNT).forEach(function (s) { t.eq(byS[s], SLOT_COUNT[s], s + ' count'); });
    ['weapon', 'armor', 'trinket'].forEach(function (slot) {
      Object.keys(RARITY_COUNT).forEach(function (r) {
        t.ok(list.some(function (it) { return it.slot === slot && it.rarity === r; }), 'a ' + r + ' ' + slot);
      });
    });
    const names = Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k].name; });
    const PRICE = { common: 40, rare: 80, legendary: 150, cursed: 25 };
    list.forEach(function (it) {
      const L = 'item ' + it.id;
      t.ok(/^[a-z][a-z0-9]*(_[a-z0-9]+)+$|^[a-z][a-z0-9]+$/.test(it.id) && !HERO_PREFIX.test(it.id), L + ': plain snake_case id, no hero prefix');
      t.eq(it.hero, null, L + ': no hero restriction');
      t.eq(names.filter(function (n) { return n === it.name; }).length, 1, L + ': unique name "' + it.name + '"');
      t.ok(typeof it.desc === 'string' && it.desc.length > 5 && /\.$/.test(it.desc) && !/undefined|NaN|\[object/.test(it.desc), L + ': desc');
      t.ok(typeof it.flavor === 'string' && it.flavor.length > 5 && it.flavor.length <= 120, L + ': flavor ≤ 120 chars (' + it.flavor.length + ')');
      t.ok(typeof it.icon === 'string' && it.icon.length > 0 && it.icon.length <= 4 && it.icon !== '❔', L + ': one emoji icon');
      t.ok(typeof it.name === 'string' && it.name.length > 3 && it.name.length <= 42, L + ': name length');
      for (const k in (it.stats || {})) {
        t.ok(STAT_KEYS.indexOf(k) >= 0 && typeof it.stats[k] === 'number' && isFinite(it.stats[k]), L + ': stat ' + k);
      }
      for (const h in (it.hooks || {})) t.ok(HOOK_NAMES.indexOf(h) >= 0 && typeof it.hooks[h] === 'function', L + ': hook ' + h);
      // every stat the engine applies is spelled out in the desc
      const st = it.stats || {};
      const signed = function (v) { return (v > 0 ? '+' : '−') + Math.abs(v); };
      if (st.dmg) t.ok(it.desc.indexOf(signed(Math.round(st.dmg * 100)) + '% damage') >= 0, L + ': desc shows the damage bonus');
      if (st.hp) t.ok(it.desc.indexOf(signed(st.hp) + ' max HP') >= 0, L + ': desc shows the HP');
      if (st.armor) t.ok(it.desc.indexOf(signed(st.armor) + ' armor') >= 0, L + ': desc shows the armor');
      if (st.mov) t.ok(it.desc.indexOf(signed(st.mov) + ' Move') >= 0, L + ': desc shows the Move');
      if (st.ap) t.ok(it.desc.indexOf(signed(st.ap) + ' AP') >= 0, L + ': desc shows the AP');
      if (st.range) t.ok(it.desc.indexOf(signed(st.range) + ' range') >= 0, L + ': desc shows the range');
      if (st.block) t.ok(it.desc.indexOf(st.block + ' Block at the start of combat') >= 0, L + ': desc shows the Block');
      if (st.hype) t.ok(it.desc.indexOf(signed(st.hype) + ' Hype at the start of combat') >= 0, L + ': desc shows the Hype');
      t.ok(Object.keys(st).length > 0 || Object.keys(it.hooks || {}).length > 0, L + ': does something');
      const want = typeof it.price === 'number' ? it.price : PRICE[it.rarity];
      t.eq(it.price, it.id === 'pay_to_win_medallion' ? 1 : PRICE[it.rarity], L + ': price');
      if (DD.Rewards && DD.Rewards.itemPrice) t.eq(DD.Rewards.itemPrice(it.id), want, L + ': DD.Rewards price');
    });
    // cursed = a big upside AND a real downside
    list.filter(function (it) { return it.rarity === 'cursed'; }).forEach(function (it) {
      const st = it.stats || {};
      t.ok(st.dmg >= 0.3 || st.armor >= 2 || st.ap >= 1 || Object.keys(it.hooks || {}).length > 0, it.id + ': cursed upside');
      t.ok(st.mov < 0 || Object.keys(it.hooks || {}).length > 0, it.id + ': cursed downside');
    });
    // Steve
    const steve = DD.getSummon('steve_torchbearer');
    t.ok(!!steve && steve.hp === 12 && steve.ap === 2, 'summon steve_torchbearer: 12 HP, 2 AP');
    (steve ? steve.skills : []).forEach(function (id) { const sk = DD.getSkill(id); t.ok(!!sk && sk.owner === 'summon', 'Steve skill ' + id); });
    t.ok(steve && T.contentHelpers && T.contentHelpers.spriteProblems ? T.contentHelpers.spriteProblems(steve.sprite).length === 0 : true, 'Steve sprite valid');
    // helpers
    t.ok(DD.Items.has({ items: ['rusty_shiv'] }, 'rusty_shiv') && DD.Items.has({ items: { weapon: 'rusty_shiv' } }, 'rusty_shiv') &&
      !DD.Items.has({ items: { armor: 'rusty_shiv' } }, 'tiki_torch') && !DD.Items.has(null, 'x'), 'DD.Items.has: units and RunHeroes');
    // the generic content validator accepts everything this file registers
    const reg = T.suites.filter(function (s) { return s.name === 'content: registry cross-references'; })[0];
    if (reg) {
      const fails = [];
      const fake = { seed: t.seed, ok: function (v, m) { if (!v) fails.push(m); }, eq: function (a, b, m) { if (a !== b) fails.push(m); },
        fail: function (m) { fails.push(m); }, log: function () {}, skip: function () {}, param: function (k, d) { return d; } };
      quietWarn(/^content advisory/, function () { reg.fn(fake); });
      const mine = fails.filter(function (m) { return DD.Items.ids.some(function (id) { return String(m).indexOf(id) >= 0; }) || /steve_/.test(String(m)); });
      t.eq(mine.length, 0, 'content registry suite: no complaints about shared items or Steve ' + mine.slice(0, 3).join(' | '));
    }
  });

  // ==========================================================================================================
  // Weapons
  // ==========================================================================================================
  T.suite('items: weapon riders — Rusty Shiv, Tiki Torch, Fork, Flametongue (exact stacks, skills only)', function (t) {
    if (!loaded(t)) return;
    [['rusty_shiv', 'bleed', 1], ['tiki_torch', 'burn', 1], ['hygiene_fork', 'poison', 1], ['flametongue_knockoff', 'burn', 2]].forEach(function (c) {
      fight({ heroes: [kn([c[0]])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }] });
      const k = unitOf('test_knight'), g = at(3, 4);
      k.ap = 9;
      t.ok(slash(k, g), c[0] + ': slash');
      t.eq(g.hp, 9, c[0] + ': the slash itself still deals 5');
      t.eq(stacks(g, c[1]), c[2], c[0] + ': +' + c[2] + ' ' + c[1]);
      slash(k, g);
      t.eq(stacks(g, c[1]), c[2] * 2, c[0] + ': stacks add up per hit');
      slash(k, g);
      t.ok(g.dead, c[0] + ': the killing blow resolves cleanly');
      t.eq(stacks(at(7, 7), c[1]), 0, c[0] + ': untouched foes get nothing');
    });
    // AoE: every foe hit gets the rider, allies caught in the blast do not
    fight({ heroes: [{ id: 'test_mage', x: 1, y: 4, items: ['tiki_torch'] }, kn([], 4, 3)], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
    let m = unitOf('test_mage');
    t.ok(use(m, 'test_fireball', 4, 4), 'fireball with the Tiki Torch');
    t.eq(stacks(at(4, 4), 'burn'), 1, 'Tiki Torch: foe in the blast Burns 1');
    t.eq(stacks(at(5, 4), 'burn'), 1, 'Tiki Torch: second foe in the blast Burns 1');
    t.eq(stacks(unitOf('test_knight'), 'burn'), 0, 'Tiki Torch: the ally caught in the blast does not Burn');
    // consumables are not skills
    fight({ heroes: [{ id: 'test_mage', x: 1, y: 4, items: ['tiki_torch'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], consumables: ['test_firebomb'] });
    m = unitOf('test_mage');
    t.ok(DD.Combat.useConsumable(m, 0, 3, 4), 'firebomb thrown');
    t.ok(at(3, 4).hp < 14 && stacks(at(3, 4), 'burn') === 0, 'Tiki Torch: consumable damage adds no Burn');
    // status ticks are not skill hits (no re-application)
    fight({ heroes: [kn(['tiki_torch'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const k = unitOf('test_knight'), g = at(3, 4);
    slash(k, g);
    DD.Combat.endTurn();
    t.eq(g.hp, 8, 'Tiki Torch: the Burn ticks for 1 at the foe\'s turn end');
    t.eq(stacks(g, 'burn'), 0, 'Tiki Torch: the tick does not add a new Burn');
    sane(t, 'riders');
  });

  T.suite('items: weapon numbers — Butter Knife, Yardstick, Headsman\'s Axe, Lance, Longbow, Excalibur', function (t) {
    if (!loaded(t)) return;
    // Butter Knife: +10%
    fight({ heroes: [kn(['butter_knife'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let k = unitOf('test_knight');
    t.eq(k.dmgBonus, 0.1, 'Butter Knife: dmgBonus 0.1');
    slash(k, at(3, 4));
    t.eq(at(3, 4).hp, 8, 'Butter Knife: slash 5 → 6');
    // Yardstick: +1 range for range 2+ skills only
    fight({ heroes: [{ id: 'test_mage', x: 1, y: 4, items: ['yardstick'] }, kn(['yardstick'], 1, 6)], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    const m = unitOf('test_mage');
    k = unitOf('test_knight');
    t.eq(JSON.stringify(DD.Targeting.range(m, DD.getSkill('test_bolt'), 1)), '[1,6]', 'Yardstick: bolt range 5 → 6');
    t.eq(JSON.stringify(DD.Targeting.range(k, DD.getSkill('test_slash'), 1)), '[1,1]', 'Yardstick: melee stays at 1');
    t.ok(DD.Targeting.isValidTarget(m, m.basic, 7, 4), 'Yardstick: a foe 6 tiles away is a valid bolt target');
    // [review] the engine's range stat also reaches thrown consumables, and both range items now say so
    const bomb = DD.getConsumable('test_firebomb');
    if (bomb) t.eq(DD.Targeting.range(m, bomb, 1)[1], DD.Targeting.range(null, bomb, 1)[1] + 1, 'Yardstick: a thrown firebomb flies 1 tile further');
    t.ok(['yardstick', 'ldr_longbow'].every(function (id) { return /skills and thrown consumables/.test(DD.getItem(id).desc); }),
      'Yardstick / Longbow: the desc names the consumables too');
    // Headsman's Axe: +4 vs foes at or below half HP (skills only)
    fight({ heroes: [kn(['discount_headsman_axe'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    k = unitOf('test_knight');
    const b = at(3, 4);
    k.ap = 9;
    slash(k, b);
    t.eq(b.hp, 46, 'Axe: full-HP brute takes 5 − 1 armor');
    b.hp = 25;
    slash(k, b);
    t.eq(b.hp, 17, 'Axe: at exactly half HP: (5 + 4) − 1 = 8');
    act(function () { A().damage(k, b, 5, { cause: 'other' }); });
    t.eq(b.hp, 13, 'Axe: non-skill damage gets no bonus');
    // Lance of the High Horse: +3 vs lower foes on top of high ground, hop
    fight({ heroes: [kn(['high_horse_lance'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }],
      terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.h = 1; if (tl.x === 2 && tl.y === 5) tl.h = 2; if (tl.x === 6 && tl.y === 6) tl.h = 2; } });
    k = unitOf('test_knight');
    slash(k, at(3, 4));
    t.eq(at(3, 4).hp, 5, 'Lance: 5 × 1.25 (high ground) + 3 = 9');
    slash(k, at(2, 5));
    t.eq(at(2, 5).hp, 9, 'Lance: no bonus against a foe standing higher');
    t.ok(k.flags.hop === true && DD.Grid.canStep(k, { x: 6, y: 5 }, { x: 6, y: 6 }), 'Lance: climbs 2 levels per step');
    t.ok(!DD.Grid.canStep({ flags: {} }, { x: 6, y: 5 }, { x: 6, y: 6 }), '(a normal unit cannot)');
    fight({ heroes: [kn([])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.h = 1; } });
    slash(unitOf('test_knight'), at(3, 4));
    t.eq(at(3, 4).hp, 8, '(without the Lance: 5 × 1.25 = 6)');
    // Longbow: +1 range, +2 at 4+ tiles
    fight({ heroes: [{ id: 'test_mage', x: 1, y: 4, items: ['ldr_longbow'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }] });
    const mb = unitOf('test_mage');
    t.eq(JSON.stringify(DD.Targeting.range(mb, DD.getSkill('test_bolt'), 1)), '[1,6]', 'Longbow: +1 range');
    use(mb, 'test_bolt', 5, 4);
    t.eq(at(5, 4).hp, 8, 'Longbow: 4 tiles away: 4 + 2');
    use(mb, 'test_bolt', 3, 5);
    t.eq(at(3, 5).hp, 10, 'Longbow: 3 tiles away: 4');
    // Excalibur (Rental): +20%, skill damage ignores armor
    fight({ heroes: [kn(['excalibur_rental'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }] });
    k = unitOf('test_knight');
    slash(k, at(3, 4));
    t.eq(at(3, 4).hp, 44, 'Excalibur: 5 × 1.2 = 6 through 1 armor');
    act(function () { A().damage(k, at(3, 4), 5, { cause: 'other' }); });
    t.eq(at(3, 4).hp, 39, 'Excalibur: non-skill damage still meets armor: 6 − 1');
    k.block = 0;
    enemyHits(at(2, 5), k.x, k.y);
    t.eq(k.hp, 29, 'Excalibur: the wielder\'s own armor still works (4 − 1)');
    sane(t, 'numbers');
  });

  T.suite('items: Big Stick and Mjölnir\'s Cousin Darryl knock foes around', function (t) {
    if (!loaded(t)) return;
    // Big Stick: once per turn, adjacent foe hit by a skill → push 1
    fight({ heroes: [kn(['big_stick'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }] });
    let k = unitOf('test_knight');
    const a = at(3, 4), b = at(2, 5);
    root([a, b]);
    slash(k, a);
    t.ok(a.x === 4 && a.y === 4 && a.hp === 9, 'Big Stick: the first adjacent hit pushes 1 tile away');
    slash(k, b);
    t.ok(b.x === 2 && b.y === 5 && b.hp === 9, 'Big Stick: only once per turn');
    DD.Combat.endTurn();
    slash(k, b);
    t.ok(b.x === 2 && b.y === 6, 'Big Stick: next turn it pushes again');
    // immovable foes neither move nor use up the push
    fight({ heroes: [kn(['big_stick'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }] });
    k = unitOf('test_knight');
    slash(k, at(3, 4));
    t.ok(!!at(3, 4) && at(3, 4).defId === 'test_brute', 'Big Stick: the immovable brute stays');
    slash(k, at(2, 5));
    t.ok(!!at(2, 6) && !at(2, 5), 'Big Stick: ...and the push is still available this turn');
    // ranged hits do not push, adjacent ones do (any skill)
    fight({ heroes: [{ id: 'test_mage', x: 2, y: 4, items: ['big_stick'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }] });
    const m = unitOf('test_mage');
    use(m, 'test_bolt', 5, 4);
    t.ok(!!at(5, 4), 'Big Stick: a foe 3 tiles away is not pushed');
    use(m, 'test_bolt', 2, 5);
    t.ok(!!at(2, 6), 'Big Stick: an adjacent foe is pushed even by a bolt');
    // blocked pushes bump
    fight({ heroes: [kn(['big_stick'], 7, 4)], enemies: [{ id: 'test_grunt', x: 8, y: 4 }] });
    slash(unitOf('test_knight'), at(8, 4));
    t.eq(at(8, 4).hp, 6, 'Big Stick: pushed into the map edge: 5 + 3 bump');

    // Darryl: first foe damaged by each skill is knocked back 1; crashes deal 6
    fight({ heroes: [kn(['darryl_hammer'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    k = unitOf('test_knight');
    slash(k, at(3, 4));
    t.ok(!!at(4, 4) && at(4, 4).hp === 9, 'Darryl: knocked back 1 tile');
    fight({ heroes: [kn(['darryl_hammer'])], enemies: [{ id: 'test_grunt', x: 3, y: 3 }, { id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }] });
    k = unitOf('test_knight');
    use(k, 'test_cleave', 3, 4);
    const moved = S().units.filter(function (u) { return u.side === 'enemy' && u.x === 4; });
    t.eq(moved.length, 1, 'Darryl: a 3-foe cleave knocks back only the first foe');
    t.ok(S().units.filter(function (u) { return u.side === 'enemy'; }).every(function (u) { return u.hp === 10; }), 'Darryl: every cleave target took 4');
    fight({ heroes: [kn(['darryl_hammer'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], objects: [{ x: 4, y: 4, id: 'crate' }] });
    slash(unitOf('test_knight'), at(3, 4));
    t.ok(at(3, 4).hp === 3 && !DD.Grid.tile(4, 4).obj, 'Darryl: slammed into a crate: 5 + 6 crash, the crate (6 HP) breaks');
    fight({ heroes: [kn(['darryl_hammer'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
    slash(unitOf('test_knight'), at(3, 4));
    t.ok(at(3, 4).hp === 3 && at(4, 4).hp === 8, 'Darryl: slammed into another foe: 6 crash damage to both');
    fight({ heroes: [kn(['darryl_hammer'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    slash(unitOf('test_knight'), at(3, 4));
    t.eq(at(3, 4).hp, 46, 'Darryl: the immovable brute just takes the hit');
    // the first foe damaged counts even when the hit drops it
    fight({ heroes: [kn(['darryl_hammer'])], enemies: [{ id: 'test_grunt', x: 3, y: 3 }, { id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }] });
    k = unitOf('test_knight');
    const ctx = DD.Targeting.buildCtx(k, slotOf(k, 'test_cleave'), { x: 3, y: 4 });
    ctx.foes[0].hp = 4;
    use(k, 'test_cleave', 3, 4);
    t.eq(S().units.filter(function (u) { return u.side === 'enemy' && !u.dead && u.x === 4; }).length, 0, 'Darryl: the first foe dropped, nobody else is knocked back');
    sane(t, 'knockback');
  });

  T.suite('items: Vampire Spork and the Glaive of Giving 110% (overkill chains)', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['vampire_spork'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }] });
    const k = unitOf('test_knight');
    root([at(3, 4), at(2, 5)]);
    k.hp = 20;
    k.ap = 9;
    for (let i = 0; i < 4; i++) slash(k, at(3, 4));
    t.eq(k.hp, 24, 'Spork: heals 2 per skill hit, 2 times per turn');
    DD.Combat.endTurn();
    const hp = k.hp;
    slash(k, at(3, 4));
    t.eq(k.hp, Math.min(k.maxHp, hp + 2), 'Spork: the budget refreshes next turn');
    k.hp = 10;
    at(2, 5).hp = 1;
    slash(k, at(2, 5));
    t.eq(k.hp, 12, 'Spork: the killing blow heals too');
    fight({ heroes: [{ id: 'test_mage', x: 1, y: 4, items: ['vampire_spork'] }, kn([], 4, 4)], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    const m = unitOf('test_mage');
    m.hp = 10;
    use(m, 'test_fireball', 4, 4);
    t.eq(m.hp, 10, 'Spork: hitting only an ally heals nothing');

    // Glaive: overkill + 3 to the nearest other foe within 2 of the fallen one; chains; skills only
    fight({ heroes: [kn(['overkill_glaive'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 6, y: 7 }] });
    let A1 = at(3, 4), B1 = at(4, 4);
    A1.hp = 2;
    slash(unitOf('test_knight'), A1);
    t.ok(A1.dead, 'Glaive: the foe drops');
    t.eq(B1.hp, 7, 'Glaive: 5 × 1.1 = 6 on 2 HP → 4 overkill + 3 = 7 to the neighbour (no second +10%)');
    t.eq(at(6, 7).hp, 14, 'Glaive: foes further than 2 tiles are safe');
    fight({ heroes: [kn(['overkill_glaive'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 5 }] });
    A1 = at(3, 4); B1 = at(4, 4);
    const C1 = at(5, 5);
    A1.hp = 2; B1.hp = 3;
    slash(unitOf('test_knight'), A1);
    t.ok(A1.dead && B1.dead, 'Glaive: the splash drops the second foe');
    t.eq(C1.hp, 7, 'Glaive: it chains: 7 on 3 HP → 4 overkill + 3 = 7 to the third');
    fight({ heroes: [kn(['overkill_glaive'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
    act(function () { A().damage(unitOf('test_knight'), at(3, 4), 30, { cause: 'status', tags: ['burn'] }); });
    t.eq(at(4, 4).hp, 14, 'Glaive: a non-skill kill does not splash');
    sane(t, 'spork/glaive');
  });

  T.suite('items: cursed weapons — Flail backswing, Sentient Sword insults', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['flail_of_flailing']), { id: 'test_mage', x: 2, y: 3 }, { id: 'test_cleric', x: 1, y: 4 }, { id: 'test_rogue', x: 6, y: 7 }],
      enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }] });
    const k = unitOf('test_knight'), m = unitOf('test_mage'), c = unitOf('test_cleric'), r = unitOf('test_rogue');
    k.ap = 9;
    t.eq(k.dmgBonus, 0.4, 'Flail: +40% damage');
    slash(k, at(3, 4));
    t.eq(at(3, 4).hp, 7, 'Flail: slash 5 × 1.4 = 7');
    t.ok(m.hp === 20 && c.hp === 24, 'Flail: each adjacent ally takes exactly 2');
    t.eq(r.hp, 22, 'Flail: allies further away are safe');
    use(k, 'test_cleave', 3, 4);
    t.ok(at(3, 4).hp === 1 && at(3, 5).hp === 8, 'Flail: cleave 4 × 1.4 = 6 on both foes');
    t.ok(m.hp === 18 && c.hp === 22, 'Flail: one backswing per skill, however many foes it hits');
    use(k, 'test_shield_bash', 2, 5);
    t.ok(m.hp === 18 && c.hp === 22, 'Flail: no foe damaged, no backswing');

    const insp = [];
    fight({ heroes: [kn(['sentient_sword'])], enemies: [{ id: 'test_grunt', x: 2, y: 5 }, { id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }],
      onRoundEnd: function (s) { insp.push(s.units.filter(function (u) { return u.side === 'enemy' && DD.Act.hasStatus(u, 'inspired'); }).length); } });
    const ks = unitOf('test_knight');
    root(S().units.filter(function (u) { return u.side === 'enemy'; }));
    t.ok([at(2, 5), at(4, 4), at(5, 4)].every(function (g) { const s = DD.Act.getStatus(g, 'inspired'); return s && s.turns === 1; }), 'Sword: foes within 3 are Inspired for 1 turn');
    t.ok(!DD.Act.hasStatus(at(6, 4), 'inspired'), 'Sword: a foe 4 tiles away is not');
    slash(ks, at(2, 5));
    t.eq(at(2, 5).hp, 7, 'Sword: slash 5 × 1.35 = 6.75 → 7');
    ks.block = 0;
    enemyHits(at(2, 5), ks.x, ks.y);
    t.eq(ks.hp, 28, 'Sword: an Inspired foe stabs for 4 × 1.25 = 5 − 1 armor');
    DD.Combat.endTurn();
    t.eq(insp[0], 0, 'Sword: the Inspiration is gone by the end of their turn');
    t.eq(S().units.filter(function (u) { return u.side === 'enemy' && DD.Act.hasStatus(u, 'inspired'); }).length, 3, 'Sword: ...and back at the start of the next player turn');
    sane(t, 'cursed weapons');
  });

  // ==========================================================================================================
  // Armor
  // ==========================================================================================================
  T.suite('items: armor stats and retaliation — Bikini, Gambeson, Mithril, Hoodie, Pauldrons', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['chainmail_bikini'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let k = unitOf('test_knight');
    t.eq(k.armor, 2, 'Bikini: armor 1 + 1');
    k.block = 0;
    enemyHits(at(3, 4), k.x, k.y);
    t.eq(k.hp, 30, 'Bikini: a 4-damage stab deals 2');
    fight({ heroes: [kn(['grandmas_gambeson'])], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    k = unitOf('test_knight');
    t.ok(k.maxHp === 39 && k.hp === 39, 'Gambeson: +7 max HP');
    fight({ heroes: [kn(['mithril_shirt'])], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    k = unitOf('test_knight');
    t.ok(k.maxHp === 38 && k.armor === 2, 'Mithril: +6 max HP, +1 armor');
    t.eq(k.block, 7, 'Mithril: 4 Block at the start of combat (+3 from the knight\'s own passive)');
    // Hedgehog Hoodie: adjacent attackers take 2; ranged ones do not
    fight({ heroes: [kn(['hedgehog_hoodie'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_archer', x: 2, y: 7 }] });
    k = unitOf('test_knight');
    k.block = 0;
    t.eq(k.maxHp, 34, 'Hoodie: +2 max HP');
    enemyHits(at(3, 4), k.x, k.y);
    t.ok(k.hp === 31 && at(3, 4).hp === 12, 'Hoodie: stabbed for 3, the stabber takes 2');
    enemyHits(at(2, 7), k.x, k.y);
    t.ok(k.hp === 28 && at(2, 7).hp === 10, 'Hoodie: an arrow from 3 tiles away is not punished');
    fight({ heroes: [kn(['hedgehog_hoodie'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], noPlan: false });
    const g = at(3, 4);
    t.ok(g.intents.length > 0, 'a real intent is planned');
    DD.Combat.endTurn();
    t.eq(g.hp, 12, 'Hoodie: works during a real enemy phase too');
    // Spiked Pauldrons: adjacent attackers are knocked back 1
    fight({ heroes: [kn(['spiked_pauldrons'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_archer', x: 2, y: 7 }, { id: 'test_grunt', x: 1, y: 4 }] });
    k = unitOf('test_knight');
    t.eq(k.maxHp, 36, 'Pauldrons: +4 max HP');
    const g1 = at(3, 4), arch = at(2, 7), g2 = at(1, 4);
    enemyHits(g1, k.x, k.y);
    t.ok(g1.x === 4 && g1.y === 4, 'Pauldrons: the stabber is knocked back 1');
    enemyHits(arch, k.x, k.y);
    t.ok(arch.x === 2 && arch.y === 7, 'Pauldrons: the archer stays put');
    g2.flags.immovable = true;
    enemyHits(g2, k.x, k.y);
    t.ok(g2.x === 1 && g2.y === 4, 'Pauldrons: immovable attackers stay');
    sane(t, 'armor');
  });

  T.suite('items: resistances — Galoshes, Apron, Tinfoil Hat, Crash Helmet', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['galoshes'])], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], surfaces: [{ x: 3, y: 4, id: 'web', turns: 5 }] });
    let k = unitOf('test_knight');
    t.eq(k.maxHp, 35, 'Galoshes: +3 max HP');
    t.ok(A().addStatus(k, 'root', { turns: 2 }) === null && !A().hasStatus(k, 'root'), 'Galoshes: no Root');
    t.ok(A().addStatus(k, 'slow', { turns: 2 }) === null && !A().hasStatus(k, 'slow'), 'Galoshes: no Slow');
    t.ok(!!A().addStatus(k, 'weak', { turns: 2 }), 'Galoshes: other debuffs still land');
    DD.Combat.move(k, 3, 4);
    t.ok(k.x === 3 && !A().hasStatus(k, 'root'), 'Galoshes: walks through a web');
    fight({ heroes: [kn(['fireproof_apron'])], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'lava'; } });
    k = unitOf('test_knight');
    const g = at(7, 7);
    k.block = 0;
    t.ok(A().addStatus(k, 'burn', { stacks: 3 }) === null, 'Apron: can\'t be Burned');
    act(function () { A().damage(g, k, 8, { element: 'fire' }); });
    t.eq(k.hp, 29, 'Apron: 8 fire → 4 − 1 armor = 3');
    act(function () { A().damage(g, k, 8); });
    t.eq(k.hp, 22, 'Apron: physical damage is unchanged (8 − 1)');
    act(function () { A().push(null, k, EAST, 1); });
    t.ok(k.x === 3 && k.hp === 18 && !A().hasStatus(k, 'burn'), 'Apron: lava burns for 4, no Burn');
    fight({ heroes: [kn(['tinfoil_hat'])], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    k = unitOf('test_knight');
    t.eq(k.maxHp, 35, 'Tinfoil Hat: +3 max HP');
    ['charmed', 'confused', 'silenced', 'sleep'].forEach(function (id) {
      t.ok(A().addStatus(k, id, { turns: 2 }, at(7, 7)) === null && !A().hasStatus(k, id), 'Tinfoil Hat: immune to ' + id);
    });
    t.ok(!!A().addStatus(k, 'stun', { turns: 1 }), 'Tinfoil Hat: Stun still lands');
    fight({ heroes: [kn(['crash_helmet'], 0, 4)], enemies: [{ id: 'test_grunt', x: 1, y: 5 }], terrain: function (tl) { if (tl.x === 1 && tl.y === 3) tl.t = 'pit'; } });
    k = unitOf('test_knight');
    t.ok(k.maxHp === 38 && k.hp === 38, 'Crash Helmet: +6 max HP');
    k.block = 0;   // the knight's own 3 Block would hide a 3 − 1 bump
    act(function () { A().push(null, k, WEST, 2); });
    t.eq(k.hp, 38, 'Crash Helmet: slamming into the map edge hurts nothing');
    act(function () { A().teleport(k, 1, 4, { noEnter: true }); A().push(null, k, { x: 0, y: 1 }, 1); });
    t.ok(k.hp === 38 && at(1, 5).hp === 11, 'Crash Helmet: crashing into a grunt: 0 for the wearer, 3 for the grunt');
    act(function () { A().push(null, k, { x: 0, y: -1 }, 1); });
    t.ok(k.hp === 38 && !DD.Grid.isDrop(k.x, k.y), 'Crash Helmet: falling into a pit costs no HP (and he climbs out)');
    // [review] sources that fire after items add flat damage (rules, the Weak Ankles scar): "no damage" still holds
    A().addRule({ id: 'items_test_brittle', name: 'Brittle Bones (test)',
      hooks: { modifyIncomingDamage: function (d) { if (d.cause === 'bump' || d.cause === 'fall') d.flat += 5; } } });
    act(function () { A().teleport(k, 0, 7, { noEnter: true }); A().push(null, k, WEST, 1); });
    t.ok(k.hp === 38 && k.block === 0, 'Crash Helmet: a later +5 flat bump bonus (a rule) still deals nothing');
    A().removeRule('items_test_brittle');
    if (DD.getScar && DD.getScar('scar_weak_ankles')) {
      fight({ heroes: [kn(['crash_helmet'], 0, 4, { scars: ['scar_weak_ankles'] })], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
        terrain: function (tl) { if (tl.x === 1 && tl.y === 6) tl.t = 'pit'; } });
      k = unitOf('test_knight');
      k.block = 0;
      act(function () { A().push(null, k, WEST, 1); });
      t.eq(k.hp, 38, 'Crash Helmet + Weak Ankles (+3 from bumps): an edge bump deals nothing');
      act(function () { A().teleport(k, 1, 5, { noEnter: true }); A().push(null, k, { x: 0, y: 1 }, 1); });
      t.eq(k.hp, 38, 'Crash Helmet + Weak Ankles (+3 from falls): a pit fall deals nothing');
    }
    sane(t, 'resistances');
  });

  T.suite('items: second winds — Undying Undies, Phoenix Down Jacket', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['undying_undies'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let k = unitOf('test_knight');
    const g = at(3, 4);
    k.hp = 5; k.block = 0;
    act(function () { A().damage(g, k, 50); });
    t.ok(!k.downed && k.hp === 1 && k.block === 8, 'Undies: lethal hit → 1 HP and 8 Block');
    t.ok(S().log.some(function (l) { return /Undying Undies/.test(l.text); }), 'Undies: logged');
    act(function () { A().damage(g, k, 50); });
    t.ok(k.downed, 'Undies: only once per combat');
    t.eq(S().result, 'defeat', '(the lone knight is down: defeat)');
    // another item's own "never below 1 HP" damage never wastes the Undies
    fight({ heroes: [kn(['undying_undies', 'pay_to_win_medallion'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }], gold: 0 });
    k = unitOf('test_knight');
    k.hp = 2;
    slash(k, at(3, 4));
    t.ok(k.hp === 1 && !DD.Items.state(k, 'undying_undies'), 'Undies: Pay-to-Win\'s HP charge stops at 1 by itself');
    act(function () { A().damage(at(3, 4), k, 40); });
    t.ok(!k.downed && k.hp === 1, 'Undies: still ready for a real lethal hit');

    fight({ heroes: [kn(['phoenix_down_jacket'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }, { id: 'test_grunt', x: 6, y: 7 }] });
    k = unitOf('test_knight');
    t.eq(k.maxHp, 38, 'Phoenix: +6 max HP');
    k.hp = 5; k.block = 0;
    act(function () { A().damage(at(3, 4), k, 50); });
    t.ok(!k.downed && k.hp === 19, 'Phoenix: rises with 50% HP (19 of 38)');
    t.ok(at(3, 4).hp === 8 && at(2, 5).hp === 8, 'Phoenix: adjacent foes take 6 fire');
    t.eq(at(6, 7).hp, 14, 'Phoenix: distant foes are spared');
    t.eq(S().result, null, 'Phoenix: no defeat for the lone hero');
    act(function () { A().damage(at(3, 4), k, 50); });
    t.ok(k.downed, 'Phoenix: only once per combat');
    fight({ heroes: [kn(['phoenix_down_jacket']), { id: 'test_mage', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    k = unitOf('test_knight');
    act(function () { A().kill(k, at(3, 4)); });
    t.ok(!k.downed && k.hp === 19, 'Phoenix: an instant kill is survived too');
    t.ok(at(3, 4).hp === 8 && unitOf('test_mage').hp === 22, 'Phoenix: the burst spares adjacent allies');
    sane(t, 'second winds');
  });

  T.suite('items: Turtle Shell and the Gilded Breastplate', function (t) {
    if (!loaded(t)) return;
    const blocks = [];
    fight({ heroes: [kn(['turtle_shell'])], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
      onRoundEnd: function (s) { blocks.push(s.units.filter(function (u) { return u.defId === 'test_knight'; })[0].block); } });
    const k = unitOf('test_knight');
    root([at(8, 8)]);
    DD.Combat.endTurn();
    t.eq(blocks[0], 13, 'Turtle: stood still: 3 (passive) + 6 Guard + 4');
    DD.Combat.move(k, 2, 5);
    DD.Combat.endTurn();
    t.eq(blocks[1], 4, 'Turtle: moved away: only the 4 Guard');
    DD.Combat.move(k, 2, 4);
    DD.Combat.move(k, 2, 5);
    DD.Combat.endTurn();
    t.eq(blocks[2], 6, 'Turtle: walked out and back to the start tile: 2 Guard + 4');

    [[85, 8], [200, 12], [9, 0]].forEach(function (c) {
      fight({ heroes: [kn(['gilded_breastplate'])], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], gold: c[0] });
      t.eq(unitOf('test_knight').block, 3 + c[1], 'Gilded: ' + c[0] + ' gold → +' + c[1] + ' Block at turn start');
    });
    fight({ heroes: [kn(['gilded_breastplate'])], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], gold: 85 });
    root([at(8, 8)]);
    S().sandboxGold = 34;
    DD.Combat.endTurn();
    t.eq(unitOf('test_knight').block, 3, 'Gilded: spent gold shrinks the next turn\'s Block (34 → 3)');
    sane(t, 'turtle/gilded');
  });

  T.suite('items: cursed armor — Barrel Armor rolls, Mimic Mail bites, Kevin swaps', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['barrel_armor'])], enemies: [{ id: 'test_grunt', x: 1, y: 4 }, { id: 'test_grunt', x: 8, y: 6 }] });
    let k = unitOf('test_knight');
    t.ok(k.maxHp === 47 && k.armor === 3 && k.mov === 2, 'Barrel: +15 max HP, +2 armor, −1 Move');
    act(function () { A().push(at(1, 4), k, EAST, 1); });
    t.ok(k.x === 5 && k.y === 4, 'Barrel: pushed 1 → rolls 3 tiles');
    act(function () { A().pull(at(8, 6), k, at(8, 6), 1); });
    t.ok(k.x === 6 && k.y === 4, 'Barrel: pulls are not extended (1 tile toward the puller)');
    act(function () { A().push(k, k, WEST, 1); });
    t.eq(k.x, 5, 'Barrel: its own dashes are not extended');
    act(function () { A().push(null, k, { x: 0, y: -1 }, 1); });
    t.eq(k.y, 1, 'Barrel: a push with no source rolls too (1 + 2)');

    fight({ heroes: [kn(['mimic_mail'])], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    k = unitOf('test_knight');
    root([at(8, 8)]);
    t.ok(k.maxHp === 36 && k.armor === 4, 'Mimic: +4 max HP, +3 armor');
    t.eq(k.hp, 35, 'Mimic: bites for 1 at the first turn start (armor and Block do not help)');
    DD.Combat.endTurn();
    t.eq(k.hp, 34, 'Mimic: and every turn after');
    k.hp = 2;
    DD.Combat.endTurn();
    t.eq(k.hp, 1, 'Mimic: never below 1 HP');
    DD.Combat.endTurn();
    t.ok(k.hp === 1 && !k.downed, 'Mimic: at 1 HP it just licks you');
    k.hp = 2;
    A().addStatus(k, 'marked', { stacks: 3 });
    DD.Combat.endTurn();
    t.ok(k.hp === 1 && !k.downed && !A().hasStatus(k, 'marked'), 'Mimic: a Marked bite (1 + 3) still stops at 1 HP');

    let swaps = 0, ok = 0;
    for (let i = 0; i < 24; i++) {
      const pos = [];
      fight({ seed: t.seed + ':kevin' + i, heroes: [kn(['haunted_plate'], 4, 4), { id: 'test_mage', x: 4, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }, { id: 'test_brute', x: 3, y: 4 }],
        onRoundEnd: function (s) { if (!pos.length) s.units.forEach(function (u) { pos.push({ defId: u.defId, x: u.x, y: u.y }); }); } });
      const kk = unitOf('test_knight');
      if (i === 0) t.ok(kk.armor === 3 && kk.maxHp === 38, 'Kevin: +2 armor, +6 max HP');
      if (i % 2) kk.flags.immovable = true;
      DD.Combat.endTurn();
      const kp = pos.filter(function (p) { return p.defId === 'test_knight'; })[0];
      if (kp.x === 4 && kp.y === 4) continue;
      swaps++;
      const partner = pos.filter(function (p) { return p.x === 4 && p.y === 4; })[0];
      if (partner && (partner.defId === 'test_mage' || partner.defId === 'test_grunt') && Math.abs(kp.x - 4) + Math.abs(kp.y - 4) <= 3) ok++;
    }
    t.ok(swaps >= 5 && swaps <= 19, 'Kevin: swaps about half the time (' + swaps + '/24)');
    t.log('Kevin swapped ' + swaps + '/24 times');
    t.eq(ok, swaps, 'Kevin: always with a movable unit within 3 (never the immovable brute or the far grunt), even when the wearer is immovable');
    sane(t, 'cursed armor');
  });

  // ==========================================================================================================
  // Trinkets
  // ==========================================================================================================
  T.suite('items: trinkets — Coin Purse, Foam Finger, Adrenaline Jar, Compound Interest', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['coin_purse'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }], gold: 10 });
    let k = unitOf('test_knight');
    at(3, 4).hp = 1;
    slash(k, at(3, 4));
    t.eq(S().sandboxGold, 12, 'Coin Purse: +2 gold per kill');
    act(function () { A().damage(k, at(7, 7), 99, { cause: 'status', tags: ['burn'] }); });
    t.eq(S().sandboxGold, 14, 'Coin Purse: any kill credited to you counts (a Burn tick)');

    fight({ heroes: [kn(['foam_finger'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }] });
    t.eq(S().hype, 10, 'Foam Finger: +10 Hype at the start of combat');
    at(3, 4).hp = 1;
    slash(unitOf('test_knight'), at(3, 4));
    t.eq(S().hype, 21, 'Foam Finger: a kill gives 8 + 3 Hype');

    fight({ heroes: [kn(['adrenaline_jar'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }, { id: 'test_grunt', x: 1, y: 4 }, { id: 'test_grunt', x: 2, y: 3 }] });
    k = unitOf('test_knight');
    S().units.forEach(function (u) { if (u.side === 'enemy') u.hp = 1; });
    root(S().units.filter(function (u) { return u.side === 'enemy'; }));
    slash(k, at(3, 4));
    t.eq(k.ap, 3, 'Adrenaline Jar: a kill refunds the AP (3 − 1 + 1)');
    slash(k, at(2, 5));
    t.eq(k.ap, 2, 'Adrenaline Jar: once per turn');
    S().phase = 'enemy';
    act(function () { A().damage(k, at(1, 4), 9); });
    S().phase = 'player';
    t.eq(k.ap, 2, 'Adrenaline Jar: kills outside your turn give nothing');
    DD.Combat.endTurn();
    slash(k, at(2, 3));
    t.eq(k.ap, 3, 'Adrenaline Jar: works again next turn');

    [[85, 93], [45, 49], [5, 5], [200, 208]].forEach(function (c) {
      fight({ heroes: [kn(['compound_interest_ledger'])], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], gold: c[0] });
      t.eq(S().sandboxGold, c[1], 'Compound Interest: ' + c[0] + ' gold → ' + c[1]);
    });
    sane(t, 'gold & hype');
  });

  T.suite('items: trinkets — Pretzels, Dog Treats, Poster, Whetstone, Candle', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['pretzel_pouch'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], consumables: ['test_potion'] });
    let k = unitOf('test_knight');
    k.hp = 10;
    t.ok(DD.Combat.useConsumable(k, 0, k.x, k.y), 'potion used');
    t.eq(k.hp, 24, 'Pretzels: potion 10 + pretzels 4');
    slash(k, at(3, 4));
    t.eq(k.hp, 24, 'Pretzels: skills do not heal');

    fight({ heroes: [{ id: 'test_summoner', x: 2, y: 4, items: ['dog_treat_bandolier'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    root([at(8, 8)]);
    const hound = S().units.filter(function (u) { return u.defId === 'test_hound'; })[0];
    t.ok(!!hound && hound.block === 2, 'Dog Treats: the hound gets 2 Block at turn start');
    hound.hp -= 5;
    DD.Combat.endTurn();
    t.ok(hound.hp === hound.maxHp - 3 && hound.block === 2, 'Dog Treats: heals 2 and Blocks 2 every turn');

    fight({ heroes: [kn(['hang_in_there_poster'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    k = unitOf('test_knight');
    k.ap = 9;
    const b = at(3, 4);
    slash(k, b);
    t.eq(b.hp, 46, 'Poster: at full HP: 5 − 1');
    k.hp = 15;
    slash(k, b);
    t.eq(b.hp, 41, 'Poster: below half HP: 5 × 1.25 = 6 − 1');
    k.hp = 16;
    slash(k, b);
    t.eq(b.hp, 37, 'Poster: exactly half is not below half');

    fight({ heroes: [kn(['whetstone'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }] });
    k = unitOf('test_knight');
    slash(k, at(3, 4));
    t.eq(at(3, 4).hp, 7, 'Whetstone: basic attack 5 + 2');
    use(k, 'test_shield_bash', 2, 5);
    t.eq(S().units.filter(function (u) { return u.side === 'enemy' && u.hp === 10; }).length, 1, 'Whetstone: other skills unchanged (bash 4)');

    fight({ heroes: [kn(['scented_candle'])], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    k = unitOf('test_knight');
    root([at(8, 8)]);
    k.hp = 20;
    DD.Combat.endTurn();
    const tile = DD.Grid.tile(2, 4);
    t.ok(tile.surface && tile.surface.id === 'holy' && tile.surface.turns === 1, 'Candle: the tile is Holy Ground (2 rounds, 1 left)');
    t.eq(k.hp, 23, 'Candle: ending the turn on it heals 3');
    // [review] the desc also promises the undead half of Holy Ground
    fight({ heroes: [kn(['scented_candle'])], enemies: [{ id: 'test_minion', x: 8, y: 8 }] });
    k = unitOf('test_knight');
    const mn = unitOf('test_minion');
    root([mn]);
    DD.Combat.endTurn();
    t.ok(DD.Combat.move(k, 2, 6), 'Candle: the knight walks off his Holy Ground');
    act(function () { A().teleport(mn, 2, 4, { noEnter: true }); });
    const mhp = mn.hp;
    DD.Combat.endTurn();
    t.eq(mhp - mn.hp, 3, 'Candle: an undead foe that ends its turn on the Holy Ground takes 3');
    sane(t, 'trinkets');
  });

  T.suite('items: Encore Kazoo and the Pocket Hourglass (pure modifyCost)', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['encore_kazoo'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    let k = unitOf('test_knight');
    t.eq(S().hype, 10, 'Kazoo: +10 Hype at the start of combat');
    slash(k, at(3, 4));
    t.eq(S().hype, 10, 'Kazoo: other skills give nothing');
    S().hype = 100;
    t.ok(use(k, 'test_knight_sig', k.x, k.y), 'signature');
    t.eq(S().hype, 25, 'Kazoo: 100 − 100 + 25 after the signature');

    fight({ heroes: [kn(['pocket_hourglass'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }], consumables: ['test_potion'] });
    k = unitOf('test_knight');
    const b = at(3, 4);
    const fp = fingerprint(S());
    for (let i = 0; i < 10; i++) { DD.Combat.canUse(k, k.basic); DD.Combat.costOf(k, DD.getSkill('test_cleave'), 1); }
    t.eq(fingerprint(S()), fp, 'Hourglass: cost queries change nothing (pure)');
    t.eq(DD.Combat.costOf(k, DD.getSkill('test_cleave'), 1).ap, 1, 'Hourglass: cleave 2 → 1 before the first skill');
    t.ok(DD.Combat.useConsumable(k, 0, k.x, k.y) && k.ap === 2, 'Hourglass: a consumable costs its AP and keeps the discount');
    t.eq(DD.Combat.costOf(k, DD.getSkill('test_slash'), 1).ap, 0, 'Hourglass: still discounted after the potion');
    slash(k, b);
    t.eq(k.ap, 2, 'Hourglass: the first skill (slash) cost 0');
    t.eq(DD.Combat.costOf(k, DD.getSkill('test_slash'), 1).ap, 1, 'Hourglass: the second costs full price');
    slash(k, b);
    t.eq(k.ap, 1, 'Hourglass: paid 1');
    DD.Combat.endTurn();
    t.eq(DD.Combat.costOf(k, DD.getSkill('test_slash'), 1).ap, 0, 'Hourglass: refreshed next turn');
    act(function () { DD.Combat.resolveSkill(k, k.basic, { x: b.x, y: b.y }, { pay: false }); });
    t.eq(DD.Combat.costOf(k, DD.getSkill('test_slash'), 1).ap, 0, 'Hourglass: a free (delegated) use keeps the discount');
    k.hooks = { modifyCost: function (c) { if (c.skill && c.skill.id === 'test_slash') c.ap = 0; } };
    slash(k, b);
    t.eq(k.ap, 3, 'Hourglass: an already-free skill costs 0...');
    t.eq(DD.Combat.costOf(k, DD.getSkill('test_cleave'), 1).ap, 1, '...and does not use up the discount');

    // [review] a skill that prices itself again while it resolves (Power Nap asks costOf how much AP it cost) used to
    // overwrite the quote pay() had used, so the discount was never spent
    fight({ heroes: [kn(['pocket_hourglass'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    k = unitOf('test_knight');
    let asked = 0;
    k.hooks = { onDealDamage: function () {
      asked++;
      DD.Combat.costOf(k, DD.getSkill('test_slash'), 1);
      DD.Combat.canUse(k, slotOf(k, 'test_cleave'));
    } };
    slash(k, at(3, 4));
    t.ok(asked > 0 && k.ap === 3, 'Hourglass: the first slash was free, and re-priced skills mid-swing');
    t.ok(DD.Combat.costOf(k, DD.getSkill('test_slash'), 1).ap === 1 && DD.Combat.costOf(k, DD.getSkill('test_cleave'), 1).ap === 2,
      'Hourglass: ...and it still spent the discount');
    if (DD.getSkill('gen_power_nap')) {
      fight({ heroes: [kn(['pocket_hourglass'], 2, 4, { skills: ['gen_power_nap', 'test_cleave'] })], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
      k = unitOf('test_knight');
      k.hp = 10;
      t.ok(use(k, 'gen_power_nap', k.x, k.y) && k.ap === 0 && k.hp === 19, 'Hourglass + Power Nap: a free nap on 3 AP heals 3 × 3');
      k.ap = 3;
      t.eq(DD.Combat.costOf(k, DD.getSkill('test_cleave'), 1).ap, 2, 'Hourglass + Power Nap: the nap spent the discount');
    }

    // sources that fire AFTER items (scars, random passives, rules) may price a skill outright or only discount 2+ AP
    // skills: when the Hourglass then changes nothing, it stays unspent
    const price = function (u, id) { return DD.Combat.costOf(u, DD.getSkill(id), 1).ap; };
    fight({ heroes: [kn(['pocket_hourglass'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    k = unitOf('test_knight');
    A().addRule({ id: 'items_test_free_basic', name: 'First Swing Free (test)', hooks: { modifyCost: function (c) {
      const u = c.unit;
      if (u && u.basic && c.skill && c.skill.id === u.basic.id && !u.basic.usedThisTurn) c.ap = 0;
    } } });
    t.ok(price(k, 'test_slash') === 0 && price(k, 'test_cleave') === 1, 'Hourglass + a later "first basic is free" rule: slash 0, cleave 2 → 1');
    const fp2 = fingerprint(S());
    for (let i = 0; i < 5; i++) { price(k, 'test_slash'); DD.Combat.canUse(k, slotOf(k, 'test_cleave')); }
    t.eq(fingerprint(S()), fp2, 'Hourglass: pricing with a later source is still pure');
    slash(k, at(3, 4));
    t.ok(k.ap === 3 && price(k, 'test_cleave') === 1, 'Hourglass: a slash that was free anyway leaves it unspent');
    t.eq(price(k, 'test_slash'), 0, 'Hourglass: the second slash is free thanks to it alone');
    slash(k, at(3, 4));
    t.ok(k.ap === 3 && price(k, 'test_cleave') === 2, 'Hourglass: ...and that spends it');
    fight({ heroes: [kn(['pocket_hourglass'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    k = unitOf('test_knight');
    A().addRule({ id: 'items_test_bulk', name: 'Bulk Discount (test)', hooks: { modifyCost: function (c) { if (c.ap >= 2) c.ap -= 1; } } });
    t.ok(price(k, 'test_cleave') === 1 && price(k, 'test_slash') === 0, 'Hourglass + a later "2+ AP costs 1 less" rule: cleave 1, slash 0');
    use(k, 'test_cleave', 3, 4);
    t.ok(k.ap === 2 && price(k, 'test_slash') === 0, 'Hourglass: the cleave cost 1 with or without it, so it stays unspent');
    slash(k, at(3, 4));
    t.ok(k.ap === 2 && price(k, 'test_slash') === 1, 'Hourglass: the free slash spends it');
    // a surcharge that fires after items (scar Commitment Issues: +1 AP on the first skill of each combat)
    if (DD.getScar && DD.getScar('scar_commitment_issues')) {
      fight({ heroes: [kn(['pocket_hourglass'], 2, 4, { scars: ['scar_commitment_issues'] })], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
      k = unitOf('test_knight');
      t.eq(price(k, 'test_cleave'), 2, 'Hourglass + Commitment Issues: cleave 2 + 1 − 1');
      use(k, 'test_cleave', 3, 4);
      t.ok(k.ap === 1 && price(k, 'test_slash') === 1, 'Hourglass + Commitment Issues: paid 2, the discount is spent');
    }
    // every random passive that reprices skills (when the table is loaded): spent exactly when it lowered the price paid
    const repricers = Object.keys(DD.defs.passives || {}).map(function (id) { return DD.defs.passives[id]; })
      .filter(function (p) { return p && p.hooks && typeof p.hooks.modifyCost === 'function'; });
    let repriced = 0;
    repricers.forEach(function (p) {
      (p.levels && p.levels.length ? p.levels : [{}]).forEach(function (L, li) {
        ['test_slash', 'test_cleave', 'test_shield_bash'].forEach(function (sid) {
          fight({ heroes: [kn(['pocket_hourglass'], 2, 4, { passives: [{ id: p.id, level: li + 1 }] })], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
          const u = unitOf('test_knight');
          const sl = slotOf(u, sid);
          if (!sl) return;
          u.ap = 9;
          const paid = price(u, sid);
          const worn = u.items;
          u.items = [];
          const full = price(u, sid);
          u.items = worn;
          if (DD.Combat.canUse(u, sl) !== true || !use(u, sid, 3, 4)) return;
          const m = DD.Items.state(u, 'pocket_hourglass');
          const spent = !!m && m.turn === S().round + ':' + S().phase;
          repriced++;
          t.eq(spent, paid < full, 'Hourglass + ' + p.id + ' L' + (li + 1) + ', ' + sid + ': priced ' + paid + ' (' + full + ' without it), spent ' + spent);
        });
      });
    });
    if (repricers.length) t.log('Hourglass checked against ' + repricers.length + ' repricing random passives (' + repriced + ' uses)');
    sane(t, 'kazoo/hourglass');
  });

  T.suite('items: Hireling Contract — Steve the Torchbearer', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['hireling_contract'])], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] });
    const k = unitOf('test_knight');
    const steve = S().units.filter(function (u) { return u.defId === 'steve_torchbearer'; })[0];
    t.ok(!!steve, 'Steve joins at the start of combat');
    if (!steve) return;
    t.ok(steve.kind === 'summon' && steve.side === 'hero' && steve.ownerId === k.id, 'Steve: a summon owned by the contract holder');
    t.ok(steve.maxHp === 12 && steve.maxAp === 2 && steve.ap === 2 && steve.mov === 4, 'Steve: 12 HP, 2 AP (ready on round 1), move 4');
    t.ok(DD.getSummon('steve_torchbearer').names.indexOf(steve.name) >= 0 && steve.title === 'Torchbearer', 'Steve: one of the Steves (' + steve.name + ')');
    t.eq(DD.Grid.dist(steve, k), 1, 'Steve: right next to his employer');
    const g = at(6, 6);
    act(function () { A().teleport(steve, 5, 6, { noEnter: true }); });
    const prev = previewThenUse(t, 'Torch Poke', steve, slotOf(steve, 'steve_torch_poke'), 6, 6);
    t.ok(g.hp === 11 && stacks(g, 'burn') === 1, 'Torch Poke: 3 fire + 1 Burn');
    t.ok(prev.perUnit[g.id] && prev.perUnit[g.id].statuses.indexOf('burn') >= 0, 'Torch Poke: the preview shows the Burn');
    t.ok(use(steve, 'steve_cower', steve.x, steve.y) && steve.block === 4, 'Cower Professionally: 4 Block');
    t.ok(DD.Combat.canUse(steve, slotOf(steve, 'steve_cower')) !== true, 'Cower: cooldown 1');
    // no room, or only hazards nearby
    fight({ w: 1, h: 1, heroes: [kn(['hireling_contract'], 0, 0)], enemies: [] });
    t.eq(S().units.length, 1, 'Steve: no room, no Steve (and no errors)');
    fight({ w: 5, h: 1, heroes: [kn(['hireling_contract'], 0, 0)], enemies: [],
      terrain: function (tl) { if (tl.x === 1) tl.t = 'lava'; if (tl.x === 2) tl.t = 'pit'; } });
    const s2 = S().units.filter(function (u) { return u.defId === 'steve_torchbearer'; })[0];
    t.ok(!!s2 && s2.x === 3, 'Steve: never spawns on lava or over a pit');
    // a whole AutoPlay fight with Steve
    fight({ heroes: [kn(['hireling_contract']), { id: 'test_mage', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_archer', x: 7, y: 6 }],
      objective: { type: 'killAll' }, encounter: null });
    const res = DD.AutoPlay.runBattle(15);
    t.ok(res.result === 'victory' || res.result === 'defeat' || res.timeout, 'Steve fights an AutoPlay battle (' + res.result + ', ' + res.rounds + ' rounds)');
    sane(t, 'steve');
  });

  T.suite('items: wild magic — Chaos Crystal (good surges only), Bag of Tricks (bad or chaotic, from round 2)', function (t) {
    if (!loaded(t)) return;
    if (!DD.WildMagic) { t.skip('no DD.WildMagic'); return; }
    const surges = [];
    const off = DD.Events.on('wildmagic:surge', function (e) { surges.push(e); });
    try {
      let uses = 0;
      for (let i = 0; i < 10; i++) {
        fight({ seed: t.seed + ':crystal' + i, heroes: [kn(['chaos_crystal'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
        const k = unitOf('test_knight');
        for (let j = 0; j < 6; j++) {
          k.ap = 9;
          const b = S().units.filter(function (u) { return u.defId === 'test_brute' && !u.dead; })[0];
          if (b && DD.Combat.canUse(k, k.basic) === true && DD.Targeting.isValidTarget(k, k.basic, b.x, b.y) && slash(k, b)) uses++;
        }
      }
      const mine = surges.filter(function (e) { return e.source === 'chaos_crystal'; });
      t.ok(uses >= 40, 'Crystal: ' + uses + ' skill uses');
      t.ok(mine.length >= uses * 0.1 && mine.length <= uses * 0.45, 'Crystal: about a quarter surge (' + mine.length + '/' + uses + ')');
      t.log('Chaos Crystal: ' + mine.length + ' surges in ' + uses + ' skill uses: ' + mine.map(function (e) { return e.id; }).join(', '));
      t.ok(mine.every(function (e) { return e.good === true; }), 'Crystal: only good surges (' + mine.map(function (e) { return e.id; }).join(', ') + ')');
      surges.length = 0;
      fight({ heroes: [kn(['chaos_crystal'])], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
        consumables: ['test_potion', 'test_potion', 'test_potion', 'test_potion', 'test_potion', 'test_potion', 'test_potion', 'test_potion'] });
      const k2 = unitOf('test_knight');
      for (let i = 0; i < 8; i++) { k2.ap = 9; DD.Combat.useConsumable(k2, 0, k2.x, k2.y); }
      t.eq(surges.length, 0, 'Crystal: consumables never surge');
      // free echoes (extra.rpEcho, the random passive Echo Chamber) are not new uses: 24 of them, no roll
      for (let i = 0; i < 6; i++) {
        fight({ seed: t.seed + ':echo' + i, heroes: [kn(['chaos_crystal'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
        const ke = unitOf('test_knight');
        for (let j = 0; j < 4; j++) act(function () { DD.Combat.resolveSkill(ke, ke.basic, { x: 3, y: 4 }, { extra: { rpEcho: true } }); });
      }
      t.eq(surges.filter(function (e) { return e.source === 'chaos_crystal'; }).length, 0, 'Crystal: free echoes never surge');

      surges.length = 0;
      fight({ seed: t.seed + ':bag', heroes: [kn(['bag_of_tricks_tricked'], 2, 4, { level: 6 })], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const kb = unitOf('test_knight');
      root([at(8, 8)]);
      t.ok(kb.maxAp === 4 && kb.ap === 4, 'Bag of Tricks: +1 AP (4)');
      t.eq(surges.length, 0, 'Bag of Tricks: no surge on the first turn');
      for (let i = 0; i < 4; i++) if (!S().result) DD.Combat.endTurn();
      const bag = surges.filter(function (e) { return e.source === 'bag_of_tricks_tricked'; });
      t.eq(bag.length, kb.downed || kb.dead ? bag.length : 4, 'Bag of Tricks: one surge per turn from round 2 (' + bag.map(function (e) { return e.id; }).join(', ') + ')');
      t.ok(bag.length > 0 && bag.every(function (e) { return e.good !== true && e.unitId === kb.id; }), 'Bag of Tricks: always bad or chaotic, always on the wearer');
    } finally { off(); }
    sane(t, 'wild magic');
  });

  T.suite('items: Bundle of Party Balloons flies', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['party_balloons'])], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
      terrain: function (tl) { if (tl.x === 3) tl.t = 'pit'; if (tl.x === 2 && tl.y === 6) tl.t = 'lava'; if (tl.x === 1 && tl.y === 4) tl.h = 4; } });
    const k = unitOf('test_knight');
    t.ok(k.flags.flying === true && k.mov === 4, 'Balloons: flying, +1 Move (3 → 4)');
    t.ok(DD.Combat.reachable(k).has('4,4'), 'Balloons: floats over the pit row');
    t.ok(DD.Grid.canStep(k, { x: 2, y: 4 }, { x: 1, y: 4 }), 'Balloons: height 4 is no obstacle');
    t.ok(DD.Combat.move(k, 2, 6) && k.hp === 32 && !A().hasStatus(k, 'burn'), 'Balloons: hovering over lava is harmless');
    act(function () { A().teleport(k, 2, 4, { noEnter: true }); A().push(null, k, EAST, 1); });
    t.ok(k.x === 3 && !k.downed && k.hp === 32, 'Balloons: pushed over a pit, he just floats');
    sane(t, 'balloons');
  });

  T.suite('items: cursed trinkets — Pay-to-Win Medallion, Ring of Indiscriminate Regeneration', function (t) {
    if (!loaded(t)) return;
    fight({ heroes: [kn(['pay_to_win_medallion'])], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_brute', x: 2, y: 5 }], gold: 2, consumables: ['test_potion'] });
    const k = unitOf('test_knight');
    k.ap = 9;
    slash(k, at(3, 4));
    t.ok(at(3, 4).hp === 7 && S().sandboxGold === 1, 'Pay-to-Win: 5 × 1.3 = 7, and 1 gold');
    slash(k, at(2, 5));
    t.ok(S().sandboxGold === 0 && k.hp === 32, 'Pay-to-Win: the last gold');
    slash(k, at(2, 5));
    t.eq(k.hp, 29, 'Pay-to-Win: broke: 3 HP instead (no armor, no Block)');
    DD.Combat.useConsumable(k, 0, k.x, k.y);
    t.eq(k.hp, 32, 'Pay-to-Win: consumables are free (potion healed 10, nothing charged)');
    k.hp = 2;
    slash(k, at(2, 5));
    t.eq(k.hp, 1, 'Pay-to-Win: never below 1 HP');
    slash(k, at(2, 5));
    t.ok(k.hp === 1 && !k.downed, 'Pay-to-Win: at 1 HP nothing more to take');
    // a free echo (the random passive Echo Chamber re-resolves a used skill with extra.rpEcho) is not a new use;
    // a delegated use (Mayor Buga's Delegate: pay: false) is
    fight({ heroes: [kn(['pay_to_win_medallion'])], enemies: [{ id: 'test_brute', x: 3, y: 4 }], gold: 5 });
    const ke = unitOf('test_knight');
    act(function () { DD.Combat.resolveSkill(ke, ke.basic, { x: 3, y: 4 }, { extra: { rpEcho: true } }); });
    t.ok(S().sandboxGold === 5 && at(3, 4).hp === 44, 'Pay-to-Win: a free echo still hits (7 − 1) but costs nothing');
    act(function () { DD.Combat.resolveSkill(ke, ke.basic, { x: 3, y: 4 }, { pay: false }); });
    t.eq(S().sandboxGold, 4, 'Pay-to-Win: a delegated free use is still a skill you use: 1 gold');
    if (DD.getPassive && DD.getPassive('rp_echo_chamber')) {
      fight({ seed: t.seed + ':echoes', heroes: [kn(['pay_to_win_medallion'], 2, 4, { passives: [{ id: 'rp_echo_chamber', level: 2 }] })],
        enemies: [{ id: 'test_brute', x: 3, y: 4 }], gold: 50 });
      const kc = unitOf('test_knight'), bc = at(3, 4);
      bc.maxHp = bc.hp = 999;
      let hits = 0, uses = 0;
      bc.hooks = { onTakeDamage: function (d) { if (d.cause === 'skill') hits++; } };
      for (let i = 0; i < 12; i++) { kc.ap = 9; if (slash(kc, bc)) uses++; }
      if (hits > uses) okLog(t, 50 - S().sandboxGold === uses, 'Pay-to-Win + Echo Chamber: ' + uses + ' slashes + ' + (hits - uses) + ' echoes cost ' + (50 - S().sandboxGold) + ' gold');
      else t.log('Echo Chamber never echoed in 12 slashes (seed ' + t.seed + ')');
    }

    fight({ heroes: [kn(['indiscriminate_ring']), { id: 'test_mage', x: 2, y: 6 }, { id: 'test_cleric', x: 6, y: 4 }],
      enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }] });
    root(S().units.filter(function (u) { return u.side === 'enemy'; }));
    S().units.forEach(function (u) { u.hp -= 8; });
    const hp0 = {};
    S().units.forEach(function (u) { hp0[u.id] = u.hp; });
    DD.Combat.endTurn();
    const gained = function (u) { return u.hp - hp0[u.id]; };
    t.eq(gained(unitOf('test_knight')), 5, 'Ring: the wearer heals 5');
    t.eq(gained(unitOf('test_mage')), 5, 'Ring: an ally 2 tiles away heals 5');
    t.eq(gained(at(4, 4)), 5, 'Ring: a foe 2 tiles away heals 5 too');
    t.eq(gained(unitOf('test_cleric')), 0, 'Ring: an ally 4 tiles away does not');
    t.eq(gained(at(7, 7)), 0, 'Ring: a distant foe does not');
    sane(t, 'cursed trinkets');
  });

  // ==========================================================================================================
  // Previews, AutoPlay, rewards, run
  // ==========================================================================================================
  T.suite('items: previews are exact and side-effect free with items equipped', function (t) {
    if (!loaded(t)) return;
    const cases = [
      ['rusty_shiv', {}], ['tiki_torch', {}], ['hygiene_fork', {}], ['flametongue_knockoff', {}], ['butter_knife', {}],
      ['discount_headsman_axe', { hp: 7 }], ['excalibur_rental', { foe: 'test_brute' }], ['vampire_spork', { me: 20 }],
      ['darryl_hammer', { objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] }], ['big_stick', { pit: true }],
      ['overkill_glaive', { hp: 2, extra: { id: 'test_grunt', x: 4, y: 4 } }], ['flail_of_flailing', { ally: { id: 'test_mage', x: 2, y: 3 } }],
      ['whetstone', {}], ['hang_in_there_poster', { me: 12 }], ['pay_to_win_medallion', { gold: 0 }], ['coin_purse', { hp: 3 }],
      ['foam_finger', { hp: 3 }], ['adrenaline_jar', { hp: 3 }], ['pocket_hourglass', {}], ['high_horse_lance', { high: true }],
      ['chaos_crystal', { seeds: 6 }], ['sentient_sword', {}], ['indiscriminate_ring', {}], ['mimic_mail', {}],
    ];
    cases.forEach(function (c) {
      const id = c[0], o = c[1];
      for (let sd = 0; sd < (o.seeds || 1); sd++) {
        const enemies = [{ id: o.foe || 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }];
        if (o.extra) enemies.push(o.extra);
        const heroes = [kn([id])];
        if (o.ally) heroes.push(o.ally);
        fight({ seed: t.seed + ':prev' + sd, heroes: heroes, enemies: enemies, objects: o.objects, gold: o.gold === undefined ? 20 : o.gold,
          terrain: function (tl) { if (o.pit && tl.x === 4 && tl.y === 4) tl.t = 'pit'; if (o.high && tl.x === 2 && tl.y === 4) tl.h = 1; } });
        const k = unitOf('test_knight');
        if (o.me) k.hp = o.me;
        if (o.hp) at(3, 4).hp = o.hp;
        previewThenUse(t, id + (o.seeds ? ' #' + sd : ''), k, k.basic, 3, 4);
      }
    });
    // consumables: Targeting.preview with the Pretzels
    fight({ heroes: [kn(['pretzel_pouch'])], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], consumables: ['test_potion'] });
    const k = unitOf('test_knight');
    k.hp = 10;
    const fp = fingerprint(S());
    const p = DD.Targeting.preview(k, DD.getConsumable('test_potion'), { x: k.x, y: k.y });
    t.eq(fingerprint(S()), fp, 'Pretzels: the consumable preview changes nothing');
    t.eq(p.perUnit[k.id] && p.perUnit[k.id].heal, 14, 'Pretzels: the consumable preview shows 10 + 4');
    DD.Combat.useConsumable(k, 0, k.x, k.y);
    t.eq(k.hp, 24, 'Pretzels: and so does reality');
  });

  T.suite('items: random loadouts survive AutoPlay battles', function (t) {
    if (!loaded(t)) return;
    const rng = DD.RNG('items-loadouts:' + t.seed);
    const pools = { weapon: [], armor: [], trinket: [] };
    shared().forEach(function (it) { pools[it.slot].push(it.id); });
    Object.keys(pools).forEach(function (k) { pools[k] = rng.shuffle(pools[k]); });
    const heroIds = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue', 'test_summoner'];
    const encs = ['test_a1_normal', 'test_a2_normal', 'test_a1_elite', 'test_a3_normal', 'test_a2_elite', 'test_a1_boss'].filter(function (id) { return !!DD.getEncounter(id); });
    if (!encs.length) { t.skip('no fixture encounters'); return; }
    const used = {};
    const results = { victory: 0, defeat: 0, timeout: 0 };
    let n = 0;
    for (let b = 0; b < 15; b++) {
      const party = rng.sample(heroIds, 4).map(function (id, i) {
        const items = ['weapon', 'armor', 'trinket'].map(function (slot) { return pools[slot][(b * 4 + i) % pools[slot].length]; });
        items.forEach(function (it) { used[it] = true; });
        return DD.Combat.makeRunHero({ id: id, level: 1 + (b % 5), items: items });
      });
      const setup = DD.Encounter.build(encs[b % encs.length], party, { rng: DD.RNG('items-enc:' + t.seed + ':' + b), act: 1 + (b % 3) });
      DD.Combat.start(setup, { seed: 'items-fight:' + t.seed + ':' + b, headless: true });
      const res = t.tryRun('runBattle ' + b, function () { return DD.AutoPlay.runBattle(25); }) || {};
      results[res.result || 'timeout']++;
      n++;
      sane(t, 'loadout battle ' + b);
      t.ok(S().units.every(function (u) { return u.kind !== 'hero' || u.items.length === 3; }), 'battle ' + b + ': every hero carries 3 items');
    }
    t.eq(Object.keys(used).length, 49, 'every shared item was carried into a battle');
    t.ok(n === 15, '15 battles: ' + JSON.stringify(results));
    t.log('loadout battles: ' + JSON.stringify(results));
  });

  T.suite('items: reward and shop pipelines offer the pool (DD.Rewards)', function (t) {
    if (!loaded(t)) return;
    if (!DD.Rewards || !DD.Rewards.randomItem) { t.skip('DD.Rewards not loaded'); return; }
    const run = { act: 1, gold: 100, inventory: [], consumables: [], maxConsumables: 3, flags: {},
      party: ['test_knight', 'test_mage', 'test_cleric', 'test_rogue'].map(function (id) { return DD.Combat.makeRunHero({ id: id }); }) };
    const rng = DD.RNG('items-rewards:' + t.seed);
    Object.keys(RARITY_COUNT).forEach(function (r) {
      const seen = {};
      let wrong = 0;
      for (let i = 0; i < 400; i++) {
        const id = DD.Rewards.randomItem({ rarity: r, run: run }, rng);
        const d = DD.getItem(id);
        if (!d || d.rarity !== r) wrong++;
        seen[id] = true;
      }
      t.eq(wrong, 0, r + ': randomItem keeps the rarity');
      const missing = shared().filter(function (it) { return it.rarity === r && !seen[it.id]; }).map(function (it) { return it.id; });
      t.eq(missing.length, 0, r + ': every shared ' + r + ' item drops (missing: ' + missing.join(', ') + ')');
    });
    shared().forEach(function (it) {
      const r = DD.Rewards.itemReward(it.id, run);
      t.ok(r && r.type === 'item' && r.id === it.id && r.label === it.name && r.icon === it.icon && r.rarity === it.rarity && r.heroIdx === undefined,
        it.id + ': item reward');
      t.eq(r.desc, DD.Rewards.RARITY_NAMES[it.rarity] + ' ' + it.slot + ': ' + it.desc, it.id + ': reward text');
    });
    // shops: three items with the right prices, at most one legendary and one cursed
    const offered = {};
    for (let i = 0; i < 80; i++) {
      const inv = DD.Rewards.shopInventory(1 + (i % 3), DD.RNG('items-shop:' + t.seed + ':' + i), run);
      t.ok(inv.items.length === 3, 'shop ' + i + ': 3 items');
      inv.items.forEach(function (e) {
        offered[e.id] = true;
        if (e.price !== DD.Rewards.itemPrice(e.id)) t.fail('shop ' + i + ': ' + e.id + ' priced ' + e.price);
      });
      const r = sumBy(inv.items.map(function (e) { return DD.getItem(e.id); }), 'rarity');
      if ((r.legendary || 0) > 1 || (r.cursed || 0) > 1) t.fail('shop ' + i + ': too many legendaries/cursed ' + JSON.stringify(r));
    }
    const sharedOffered = DD.Items.ids.filter(function (id) { return offered[id]; });
    t.ok(sharedOffered.length >= 35, 'shops offered ' + sharedOffered.length + ' different shared items');
    t.ok(DD.Items.ids.some(function (id) { return offered[id] && DD.getItem(id).rarity === 'cursed'; }), 'shops sell cursed items too');
    // fight rewards: elites guarantee a rare, bosses a legendary, never cursed
    const fromFights = {};
    for (let i = 0; i < 40; i++) {
      ['elite', 'boss'].forEach(function (kind) {
        const rw = DD.Rewards.combat(kind, 2, DD.RNG('items-loot:' + t.seed + ':' + kind + i), run);
        const first = DD.getItem(rw.choices[0] && rw.choices[0].id);
        if (!first || first.rarity !== (kind === 'elite' ? 'rare' : 'legendary')) t.fail(kind + ' loot ' + i + ': first choice ' + (first && first.id));
        rw.choices.forEach(function (c) { if (c.type === 'item') fromFights[c.id] = true; });
      });
    }
    t.ok(DD.Items.ids.filter(function (id) { return fromFights[id]; }).length >= 15, 'elite/boss loot hands out shared items');
  });

  T.suite('items: run layer — equip, DD.Run.heroStats, autoEquip, run gold', function (t) {
    if (!loaded(t)) return;
    if (!DD.Run || !DD.Run.newRun || !DD.Rewards) { t.skip('run layer not loaded'); return; }
    const savedUi = DD.Run.useUi;
    const savedMeta = DD.Meta ? DD.util.deepClone(DD.Meta.data) : null;
    DD.Run.useUi = false;
    try {
      DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], 'normal', 'items-run:' + t.seed);
      const R = DD.Run.state;
      const base = DD.Run.heroStats(0);
      const hp0 = R.party[0].hp;
      DD.Run.addItem('barrel_armor');
      t.ok(DD.Run.equip(0, 'barrel_armor'), 'equip Barrel Armor');
      const st = DD.Run.heroStats(0);
      t.ok(st.maxHp === base.maxHp + 15 && st.armor === base.armor + 2 && st.mov === base.mov - 1, 'heroStats: +15 HP, +2 armor, −1 Move');
      t.eq(R.party[0].hp, hp0 + 15, 'current HP moves with max HP');
      t.ok(DD.Run.unequip(0, 'armor') && DD.Run.heroStats(0).maxHp === base.maxHp, 'unequip restores the stats');
      DD.Run.addItem('mimic_mail');
      t.eq(DD.Run.autoEquip('mimic_mail'), -1, 'cursed items are never auto-equipped');
      const res = DD.Rewards.apply(DD.Rewards.itemReward('butter_knife', R), { run: R });
      t.ok(res.ok && res.equippedTo >= 0 && R.party[res.equippedTo].items.weapon === 'butter_knife', 'a reward item is auto-equipped: ' + res.text);
      R.party[1].items.trinket = 'compound_interest_ledger';
      R.party[2].items.trinket = 'coin_purse';
      R.party[3].items.armor = 'phoenix_down_jacket';
      R.gold = 85;
      DD.Run.startCombat('test_a1_normal', 'normal');
      const cs = DD.Combat.state;
      t.ok(cs && cs.run === R, 'a run fight');
      t.eq(cs.stats.goldGained, 8, 'Compound Interest: 8 gold of interest at 85 gold');
      t.ok(R.gold >= 93, 'the interest lands in the run gold (' + R.gold + ')');
      const cleric = cs.units.filter(function (u) { return u.defId === 'test_cleric'; })[0];
      const foe = cs.units.filter(function (u) { return u.side === 'enemy' && !u.dead; })[0];
      const g0 = R.gold;
      act(function () { A().damage(cleric, foe, 999); });
      t.ok(foe.dead && R.gold >= g0 + 2 && cs.stats.goldGained === 10, 'Coin Purse: +2 run gold on a kill (' + (R.gold - g0) + ')');
      const rogue = cs.units.filter(function (u) { return u.defId === 'test_rogue'; })[0];
      act(function () { A().kill(rogue, null); });
      t.ok(!rogue.downed && rogue.hp === Math.round(rogue.maxHp * 0.5), 'Phoenix works in a run fight');
      t.tryRun('AutoPlay.runBattle', function () { return DD.AutoPlay.runBattle(40); });
      if (DD.FX && DD.FX.flush) DD.FX.flush();
      if (DD.Run.inCombat()) DD.Run.finishCombat(cs.result || 'defeat', cs);
      t.ok(!DD.Run.inCombat(), 'the run fight finished');
      t.ok(R.party.every(function (h) { return h.dead || (h.hp >= 1 && h.hp <= DD.Run.heroStats(h).maxHp); }), 'HP written back within bounds');
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      if (savedMeta) { DD.Meta.data = savedMeta; DD.Meta.save(); }
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
  });

  // ==========================================================================================================
  // Real heroes (the hero files; every suite below skips when they are not loaded, e.g. isolated runs)
  // ==========================================================================================================
  const REAL = ['zarathor', 'syllamin', 'marbles', 'marwyn', 'ellaria', 'josiah', 'sparrow', 'corelos', 'slate', 'buga'];
  function realHeroes() { return REAL.filter(function (id) { return !!DD.getHero(id); }); }
  function haveAll(t, ids) {
    const miss = ids.filter(function (id) { return !DD.getHero(id) && !DD.getSkill(id); });
    if (miss.length) t.log('skipped a check: ' + miss.join(', ') + ' not loaded');
    return !miss.length;
  }
  /** t.ok that also logs the measured numbers in the message (shown with verbose=1). */
  function okLog(t, v, m) { t.ok(v, m); t.log(m); }
  /** A deterministic target: the nearest foe, else an ally / self, else the first valid tile. */
  function pickTarget(u, tiles) {
    let best = null, score = Infinity;
    tiles.forEach(function (p, i) {
      const o = at(p.x, p.y);
      const rank = o && !o.dead && !o.downed ? (DD.Grid.hostile(u, o) ? 0 : 1) : 2;
      const sc = rank * 1000 + DD.Grid.dist(u, p) * 10 + i * 0.001;
      if (sc < score) { score = sc; best = p; }
    });
    return best;
  }
  /** previewThenUse without assertions: the list of differences between the HUD preview and the real use. */
  function predictAndUse(u, slot, x, y) {
    const s = S();
    const out = { problems: [], uncertain: false, used: false };
    const fp = fingerprint(s);
    let prev = null;
    try { prev = DD.Combat.preview(u, slot, x, y); } catch (e) { out.problems.push('preview threw: ' + e.message); return out; }
    if (fingerprint(s) !== fp) out.problems.push('the preview changed the real fight');
    out.uncertain = !!(prev && prev.uncertain);
    const before = {};
    s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed }; });
    const hype0 = s.hype;
    out.used = DD.Combat.useSkill(u, slot, x, y);
    if (!out.used) { out.problems.push('could not be used'); return out; }
    if (out.uncertain || !prev) return out;
    s.units.forEach(function (o) {
      const b = before[o.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[o.id];
      const want = e ? (e.dmg || 0) - (e.heal || 0) : 0;
      if (b.hp - o.hp !== want) out.problems.push(o.name + ' lost ' + (b.hp - o.hp) + ' HP (preview ' + want + ')');
      const ko = (o.dead && !b.dead) || (o.downed && !b.downed);
      if (ko !== !!(e && e.lethal)) out.problems.push(o.name + ' KO ' + ko + ' (preview ' + !!(e && e.lethal) + ')');
    });
    if (s.hype - hype0 !== prev.hype) out.problems.push('Hype ' + (s.hype - hype0) + ' (preview ' + prev.hype + ')');
    return out;
  }

  T.suite('items: real heroes — the whole pool rides along in AutoPlay fights', function (t) {
    if (!loaded(t)) return;
    const heroes = realHeroes();
    if (heroes.length < 4) { t.skip('the real hero files are not loaded (isolated run)'); return; }
    const rng = DD.RNG('items-real:' + t.seed);
    const pools = { weapon: [], armor: [], trinket: [] };
    shared().forEach(function (it) { pools[it.slot].push(it.id); });
    Object.keys(pools).forEach(function (k) { pools[k] = rng.shuffle(pools[k]); });
    function encFor(act, b) {
      const list = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; })
        .filter(function (e) { return e.act === act && (e.kind === 'normal' || e.kind === 'elite') && !/^test_/.test(e.id); });
      return list.length ? list[b % list.length] : DD.getEncounter('test_a' + act + '_normal');
    }
    const used = {}, results = { victory: 0, defeat: 0, timeout: 0 };
    let n = 0;
    heroes.forEach(function (lead, b) {
      const act = 1 + (b % 3), level = [3, 6, 9][act - 1];
      const ids = [lead].concat(rng.sample(heroes.filter(function (id) { return id !== lead; }), 3));
      const party = ids.map(function (id) {
        const rh = DD.Run && DD.Run.makeRunHero ? DD.Run.makeRunHero(id, level) : DD.Combat.makeRunHero({ id: id, level: level });
        rh.hp = undefined;
        rh.items = { weapon: null, armor: null, trinket: null };
        ['weapon', 'armor', 'trinket'].forEach(function (slot) { const p = pools[slot]; rh.items[slot] = p[n % p.length]; used[rh.items[slot]] = true; });
        n++;
        return rh;
      });
      const enc = encFor(act, b);
      if (!enc) return;
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('items-real-enc:' + t.seed + ':' + b), act: act, difficulty: 'normal' });
      DD.Combat.start(setup, { seed: 'items-real:' + t.seed + ':' + b, headless: true, deploy: false, difficulty: 'normal' });
      const res = t.tryRun('runBattle ' + lead + ' in ' + enc.id, function () { return DD.AutoPlay.runBattle(30); }) || {};
      results[res.result || 'timeout']++;
      sane(t, lead + ' in ' + enc.id);
      t.ok(S().units.filter(function (u) { return u.kind === 'hero'; }).every(function (u) { return u.items.length === 3; }), lead + ' in ' + enc.id + ': every hero carries 3 items');
    });
    t.eq(Object.keys(used).length, 49, 'every shared item was worn by a real hero');
    t.ok(results.victory + results.defeat + results.timeout === heroes.length, heroes.length + ' fights: ' + JSON.stringify(results));
    t.log('real-hero loadout fights: ' + JSON.stringify(results));
  });

  T.suite('items: real heroes — previews stay exact with item hooks on every kit', function (t) {
    if (!loaded(t)) return;
    const heroes = realHeroes();
    if (!heroes.length) { t.skip('the real hero files are not loaded (isolated run)'); return; }
    // hook-heavy loadouts (no range items, so both runs offer the same targets)
    const LOADOUTS = [
      ['darryl_hammer', 'hedgehog_hoodie', 'foam_finger'], ['overkill_glaive', 'phoenix_down_jacket', 'coin_purse'],
      ['flametongue_knockoff', 'spiked_pauldrons', 'adrenaline_jar'], ['vampire_spork', 'mimic_mail', 'pay_to_win_medallion'],
      ['big_stick', 'undying_undies', 'chaos_crystal'], ['excalibur_rental', 'barrel_armor', 'pocket_hourglass'],
      ['flail_of_flailing', 'crash_helmet', 'encore_kazoo'], ['rusty_shiv', 'haunted_plate', 'whetstone'],
      ['sentient_sword', 'galoshes', 'hang_in_there_poster'], ['discount_headsman_axe', 'tinfoil_hat', 'indiscriminate_ring'],
    ];
    let compared = 0;
    const theirs = [];
    heroes.forEach(function (id, hi) {
      const def = DD.getHero(id);
      const pool = (def.skillPool || []).slice();
      def.startingSkills.forEach(function (s) { if (pool.indexOf(s) < 0) pool.unshift(s); });
      for (let pass = 0; pass * 4 < pool.length; pass++) {
        const skills = pool.slice(pass * 4, pass * 4 + 4);
        const items = LOADOUTS[(hi + pass * 3) % LOADOUTS.length];
        const lvl = 1 + ((hi + pass) % 3);
        const setup = function (withItems) {
          fight({ seed: t.seed + ':kit:' + id + ':' + pass, gold: 60,
            heroes: [{ id: id, x: 2, y: 4, level: 6, skills: skills, skillLevel: lvl, items: withItems ? items : [] }, kn([], 2, 5)],
            enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 2 }, { id: 'test_brute', x: 5, y: 4 }, { id: 'test_archer', x: 6, y: 6 }] });
          return unitOf(id);
        };
        const slotIds = DD.Combat.slotsOf(setup(true)).map(function (sl) { return sl.id; })
          .filter(function (sid) { return pass === 0 || (sid !== def.basic && sid !== def.signature); });
        slotIds.forEach(function (sid) {
          const runs = [false, true].map(function (withItems) {
            const u = setup(withItems);
            const sl = u && slotOf(u, sid);
            if (!sl) return null;
            if ((DD.getSkill(sid) || {}).hype > 0) S().hype = 100;
            if (DD.Combat.canUse(u, sl) !== true) return null;
            const tgt = pickTarget(u, DD.Combat.targets(u, sl));
            return tgt ? Object.assign({ tgt: tgt }, predictAndUse(u, sl, tgt.x, tgt.y)) : null;
          });
          const base = runs[0], mine = runs[1];
          if (!base || !mine) return;
          const label = id + ' ' + sid + ' L' + (sid === def.basic || sid === def.signature ? 1 : lvl) + ' with ' + items.join(' + ');
          if (base.problems.length) { theirs.push(id + ' ' + sid + ': ' + base.problems[0]); return; }
          if (base.tgt.x !== mine.tgt.x || base.tgt.y !== mine.tgt.y) return;
          compared++;
          t.ok(mine.problems.length === 0, label + ': preview exact and side-effect free' + (mine.problems.length ? ' — ' + mine.problems.slice(0, 3).join(' | ') : ''));
        });
      }
    });
    okLog(t, compared >= heroes.length * 5, compared + ' hero skill uses compared with items equipped');
    if (theirs.length) t.log('preview mismatches without any item (not item bugs): ' + theirs.join(' · '));
  });

  T.suite('items: real heroes — summoners, flyers and shapeshifters', function (t) {
    if (!loaded(t)) return;
    if (!realHeroes().length) { t.skip('the real hero files are not loaded (isolated run)'); return; }
    // Balloons on a hero who already flies: +1 Move, his own sprite plus balloons
    if (haveAll(t, ['syllamin'])) {
      const def = DD.getHero('syllamin');
      fight({ heroes: [{ id: 'syllamin', x: 2, y: 4, items: ['party_balloons'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const sy = unitOf('syllamin');
      t.ok(sy.flags.flying === true && sy.mov === def.stats.mov + 1, 'Balloons on Syllamin: still flying, Move ' + def.stats.mov + ' → ' + sy.mov);
      t.ok(!!sy.sprite && sy.sprite.itemBalloons === true && sy.sprite.palette === def.sprite.palette, 'Balloons on Syllamin: his own sprite, balloons tied on');
    }
    // Balloons through Ellaria's Wild Shape (the skill swaps unit.sprite, then deletes it when the form ends)
    if (haveAll(t, ['ellaria', 'ell_wildshape']) && DD.Ellaria) {
      const def = DD.getHero('ellaria');
      fight({ heroes: [{ id: 'ellaria', x: 2, y: 4, skills: ['ell_wildshape'], items: ['party_balloons'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      root([at(8, 8)]);
      const el = unitOf('ellaria');
      t.ok(el.sprite && el.sprite.itemBalloons && el.sprite.palette === def.sprite.palette, 'Wild Shape: an elf with balloons');
      t.ok(use(el, 'ell_wildshape', el.x, el.y), 'Wild Shape: used');
      t.ok(el.sprite && el.sprite.itemBalloons && el.sprite.palette === DD.Ellaria.GIANT_SPRITE.palette, 'Wild Shape: the giant corgi gets the balloons too');
      t.ok(el.flags.flying === true && el.flags.immovable === true, 'Wild Shape: a flying, immovable corgi');
      for (let i = 0; i < 5 && el.data.ellShape; i++) DD.Combat.endTurn();
      t.ok(!el.data.ellShape && !A().hasStatus(el, 'ell_absolute_unit'), 'Wild Shape: the form ended');
      t.ok(el.sprite && el.sprite.itemBalloons && el.sprite.palette === def.sprite.palette, 'Wild Shape: back to an elf, balloons re-tied');
      t.ok(el.flags.flying === true && !el.flags.immovable, 'Wild Shape: flying, movable again');
    }
    // Dog Treats feed the pets the heroes start with (Ellaria's corgi, Josiah's raven)
    [['ellaria', 'ell_corgi'], ['josiah', 'jos_raven']].forEach(function (c) {
      if (!haveAll(t, [c[0]]) || !DD.getSummon(c[1])) return;
      const r = [[], ['dog_treat_bandolier']].map(function (items) {
        fight({ heroes: [{ id: c[0], x: 2, y: 4, items: items }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
        root([at(8, 8)]);
        const pet = S().units.filter(function (u) { return u.defId === c[1] && u.kind === 'summon' && !u.dead; })[0];
        if (!pet) return null;
        const b1 = pet.block;
        pet.hp = Math.max(1, pet.maxHp - 5);
        DD.Combat.endTurn();
        return { b1: b1, block: pet.block, hp: pet.hp, owner: pet.ownerId === unitOf(c[0]).id };
      });
      if (!r[0] || !r[1]) { t.fail(c[0] + ': no ' + c[1] + ' at the start of the fight'); return; }
      t.ok(r[1].owner, 'Dog Treats: ' + c[0] + ' owns the ' + c[1]);
      t.eq(r[1].b1 - r[0].b1, 2, 'Dog Treats on ' + c[0] + ': the ' + c[1] + ' gets +2 Block on round 1');
      t.eq(r[1].block - r[0].block, 2, 'Dog Treats on ' + c[0] + ': +2 Block every turn');
      t.eq(r[1].hp - r[0].hp, 2, 'Dog Treats on ' + c[0] + ': +2 HP every turn');
    });
    // Steve is not a corgi: he never takes a slot in Ellaria's pack
    if (haveAll(t, ['ellaria', 'ell_summon_corgi'])) {
      const r = [[], ['hireling_contract']].map(function (items) {
        fight({ heroes: [{ id: 'ellaria', x: 2, y: 4, skills: ['ell_summon_corgi'], items: items }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
        const el = unitOf('ellaria');
        const corgis = function () { return S().units.filter(function (u) { return u.defId === 'ell_corgi' && !u.dead; }).length; };
        const c0 = corgis();
        const can = DD.Combat.canUse(el, slotOf(el, 'ell_summon_corgi'));
        const p = can === true ? pickTarget(el, DD.Combat.targets(el, slotOf(el, 'ell_summon_corgi'))) : null;
        if (p) use(el, 'ell_summon_corgi', p.x, p.y);
        return { steve: !!unitOf('steve_torchbearer'), c0: c0, c1: corgis(), can: can };
      });
      t.ok(r[1].steve && !r[0].steve, 'Hireling Contract on Ellaria: Steve joins');
      t.ok(r[1].c0 === r[0].c0 && r[1].c1 === r[0].c1 && r[1].can === r[0].can, 'Hireling Contract on Ellaria: her corgis are unaffected (' + JSON.stringify(r) + ')');
    }
    sane(t, 'summoners/flyers');
  });

  T.suite('items: real heroes — spenders, payers, throwers and delegates', function (t) {
    if (!loaded(t)) return;
    if (!realHeroes().length) { t.skip('the real hero files are not loaded (isolated run)'); return; }
    // Pocket Hourglass: Mayor Buga's Delegate swings an ally's basic for free, the discount survives
    if (haveAll(t, ['buga', 'buga_delegate'])) {
      fight({ heroes: [{ id: 'buga', x: 1, y: 4, skills: ['buga_delegate'] }, kn(['pocket_hourglass'], 2, 4)], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
      const bu = unitOf('buga'), k = unitOf('test_knight'), b = at(3, 4);
      const hp0 = b.hp;
      t.ok(use(bu, 'buga_delegate', b.x, b.y) && b.hp < hp0, 'Delegate: the knight swings at the brute');
      t.eq(k.ap, 3, 'Delegate: the delegated swing cost the knight nothing');
      t.eq(DD.Combat.costOf(k, DD.getSkill('test_slash'), 1).ap, 0, 'Hourglass: the discount survives a delegated swing');
      slash(k, b);
      t.eq(k.ap, 3, 'Hourglass: the knight\'s own first slash is still free');
      t.eq(DD.Combat.costOf(k, DD.getSkill('test_slash'), 1).ap, 1, 'Hourglass: then full price');
    }
    // Pay-to-Win on a gold spender: Zarathor's coin toss costs its own gold plus the 1-gold microtransaction
    if (haveAll(t, ['zarathor', 'zar_bling_throw'])) {
      const spent = [[], ['pay_to_win_medallion']].map(function (items) {
        fight({ heroes: [{ id: 'zarathor', x: 2, y: 4, skills: ['zar_bling_throw'], items: items }], enemies: [{ id: 'test_brute', x: 4, y: 4 }], gold: 50 });
        const g0 = S().sandboxGold;
        use(unitOf('zarathor'), 'zar_bling_throw', 4, 4);
        return g0 - S().sandboxGold;
      });
      okLog(t, spent[0] > 0 && spent[1] - spent[0] === 1, 'Pay-to-Win on Zarathor: ' + spent[0] + ' gold → ' + spent[1]);
    }
    // HP payers: Mimic Mail bites + Sparrow's HP costs never take her below 1 or down her
    if (haveAll(t, ['sparrow', 'spa_hemoglob'])) {
      fight({ heroes: [{ id: 'sparrow', x: 2, y: 4, skills: ['spa_hemoglob'], items: ['mimic_mail'], hp: 6 }], enemies: [{ id: 'test_brute', x: 5, y: 4 }] });
      root([at(5, 4)]);
      const sp = unitOf('sparrow');
      let low = sp.hp, downed = false;
      for (let r = 0; r < 4 && !S().result; r++) {
        sp.ap = 9;
        while (DD.Combat.canUse(sp, slotOf(sp, 'spa_hemoglob')) === true && use(sp, 'spa_hemoglob', 5, 4)) { low = Math.min(low, sp.hp); downed = downed || sp.downed; }
        DD.Combat.endTurn();
        low = Math.min(low, sp.hp);
        downed = downed || sp.downed;
      }
      okLog(t, low === 1 && !downed, 'Mimic Mail on Sparrow: bites + blood costs bottom out at 1 HP, never downed (low ' + low + ')');
    }
    // Throwers: Marwyn's YEET is a push, so Barrel Armor rolls a thrown friend 2 further and the Crash Helmet eats the crash
    if (haveAll(t, ['marwyn', 'mrw_yeet'])) {
      const xs = [[], ['barrel_armor']].map(function (items) {
        fight({ heroes: [{ id: 'marwyn', x: 1, y: 4, skills: ['mrw_yeet'] }, kn(items, 2, 4)], enemies: [{ id: 'test_grunt', x: 8, y: 0 }] });
        use(unitOf('marwyn'), 'mrw_yeet', 2, 4);
        return unitOf('test_knight').x;
      });
      okLog(t, xs[0] > 2 && xs[1] - xs[0] === 2, 'Barrel Armor: a friend YEETed by Marwyn lands at x ' + xs[0] + ' → rolls on to ' + xs[1]);
      const hit = [[], ['crash_helmet']].map(function (items) {
        fight({ heroes: [{ id: 'marwyn', x: 1, y: 4, skills: ['mrw_yeet'] }, kn(items, 2, 4)], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
        const k = unitOf('test_knight'), g = at(4, 4);
        k.block = 0;
        const hp0 = k.hp, g0 = g.hp;
        use(unitOf('marwyn'), 'mrw_yeet', 2, 4);
        return { me: hp0 - k.hp, it: g0 - g.hp };
      });
      okLog(t, hit[0].me > 0 && hit[1].me === 0 && hit[1].it === hit[0].it && hit[1].it > 0,
        'Crash Helmet: YEETed into a grunt, the wearer takes 0 instead of ' + hit[0].me + ' and the grunt still takes ' + hit[1].it);
    }
    // Slate is immovable: in a barrel he keeps the −1 Move but never rolls
    if (haveAll(t, ['slate'])) {
      fight({ heroes: [{ id: 'slate', x: 2, y: 4, items: ['barrel_armor'] }], enemies: [{ id: 'test_grunt', x: 1, y: 4 }] });
      const sl = unitOf('slate');
      t.eq(sl.mov, DD.getHero('slate').stats.mov - 1, 'Barrel Armor on Slate: −1 Move');
      act(function () { A().push(at(1, 4), sl, EAST, 1); });
      t.ok(sl.x === 2 && sl.y === 4, 'Barrel Armor on Slate: the immovable golem does not roll');
    }
    sane(t, 'spenders/payers/throwers');
  });

  T.suite('items: real heroes — Whetstone on every basic, Encore Kazoo on every signature', function (t) {
    if (!loaded(t)) return;
    const heroes = realHeroes();
    if (!heroes.length) { t.skip('the real hero files are not loaded (isolated run)'); return; }
    const SPOTS = [{ x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 2, y: 2 }];
    /** Damage a lone brute takes from u's basic, with and without the item (null when the basic can't reach it). */
    function basicHit(id, items, extra) {
      for (let i = 0; i < SPOTS.length; i++) {
        const p = SPOTS[i];
        fight({ seed: t.seed + ':whet:' + id, heroes: [Object.assign({ id: id, x: 2, y: 4, items: items }, extra && extra.hero)], enemies: [{ id: 'test_brute', x: p.x, y: p.y }] });
        const u = unitOf(id);
        if (extra && extra.before) extra.before(u);
        const b = at(p.x, p.y);
        if (!u.basic || DD.Combat.canUse(u, u.basic) !== true || !DD.Targeting.isValidTarget(u, u.basic, p.x, p.y)) continue;
        const hp0 = b.hp;
        DD.Combat.useSkill(u, u.basic, p.x, p.y);
        return { dmg: hp0 - b.hp, basic: u.basic.id };
      }
      return null;
    }
    let whet = 0;
    heroes.forEach(function (id) {
      const r = [basicHit(id, []), basicHit(id, ['whetstone'])];
      if (!r[0] || !r[1]) { t.log('Whetstone: ' + id + '\'s basic cannot reach the test brute'); return; }
      if (r[0].dmg <= 0) { t.log('Whetstone: ' + id + '\'s basic ' + r[0].basic + ' deals no direct damage'); return; }
      whet++;
      const delta = r[1].dmg - r[0].dmg;
      okLog(t, delta > 0 && delta % 2 === 0, 'Whetstone on ' + id + ': ' + r[0].basic + ' ' + r[0].dmg + ' → ' + r[1].dmg + ' (+2 per hit)');
    });
    t.ok(whet >= Math.min(6, heroes.length), 'Whetstone checked on ' + whet + ' basics');
    // Ellaria's Wild Shape swaps her basic for Chomp: the Whetstone follows
    if (haveAll(t, ['ellaria', 'ell_wildshape'])) {
      const extra = { hero: { skills: ['ell_wildshape'] }, before: function (u) { use(u, 'ell_wildshape', u.x, u.y); } };
      const r = [basicHit('ellaria', [], extra), basicHit('ellaria', ['whetstone'], extra)];
      t.ok(!!r[0] && !!r[1] && r[1].basic === 'ell_chomp' && r[1].dmg - r[0].dmg === 2, 'Whetstone: Ellaria\'s Chomp ' + (r[0] && r[0].dmg) + ' → ' + (r[1] && r[1].dmg));
    }
    // Encore Kazoo: +25 Hype after every hero's signature
    let kaz = 0;
    heroes.forEach(function (id) {
      const r = [[], ['encore_kazoo']].map(function (items) {
        fight({ seed: t.seed + ':kazoo:' + id, heroes: [{ id: id, x: 2, y: 4, level: 5, items: items }, kn([], 1, 6)],
          enemies: [{ id: 'test_brute', x: 4, y: 4 }, { id: 'test_brute', x: 6, y: 6 }] });
        const u = unitOf(id);
        S().hype = 100;
        if (!u.signature || DD.Combat.canUse(u, u.signature) !== true) return null;
        const p = pickTarget(u, DD.Combat.targets(u, u.signature));
        if (!p || !DD.Combat.useSkill(u, u.signature, p.x, p.y)) return null;
        return S().hype;
      });
      if (r[0] === null || r[1] === null) { t.log('Kazoo: ' + id + '\'s signature could not be used here'); return; }
      kaz++;
      okLog(t, r[1] - r[0] === 25 || (r[1] === 100 && r[1] > r[0]), 'Encore Kazoo on ' + id + ': Hype after the signature ' + r[0] + ' → ' + r[1]);
    });
    t.ok(kaz >= Math.min(6, heroes.length), 'Encore Kazoo checked on ' + kaz + ' signatures');
  });

  /**
   * Diagnostic (itemsim=1, optional n=fights per act): the same real-hero parties (levels 3 / 6 / 9) fight the same
   * normal + elite encounters of each act under AutoPlay with no items, then with random shared items of one rarity,
   * then with act-odds loot. Logs win rate, rounds, party HP lost, downs and damage dealt per mode.
   */
  T.suite('items: balance sim (diagnostic)', function (t) {
    if (!loaded(t)) return;
    if (t.param('itemsim', '0') !== '1') { t.skip('itemsim=1 to run the item balance simulation'); return; }
    const all = Object.keys(DD.defs.heroes);
    const real = all.filter(function (id) { return id.indexOf('test_') !== 0; });
    const heroes = real.length >= 4 ? real : all;
    const N = +t.param('n', 0) || 6;
    const off = +t.param('lvl', 0) || 0, diff = t.param('difficulty', 'normal'), kinds = String(t.param('kinds', 'normal,elite')).split(',');
    const LEVEL = { 1: Math.max(1, 3 + off), 2: Math.max(1, 6 + off), 3: Math.max(1, 9 + off) };
    const byRarity = {};
    shared().forEach(function (it) { ((byRarity[it.rarity] = byRarity[it.rarity] || {})[it.slot] = byRarity[it.rarity][it.slot] || []).push(it.id); });
    const fights = [];
    [1, 2, 3].forEach(function (act) {
      const encs = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; })
        .filter(function (e) { return e.act === act && kinds.indexOf(e.kind) >= 0 && !/^test_/.test(e.id); });
      const pool = encs.length ? encs : [DD.getEncounter('test_a' + act + '_normal')].filter(Boolean);
      const prng = DD.RNG('itemsim-party:' + t.seed + ':' + act);
      for (let i = 0; i < N && pool.length; i++) {
        fights.push({ act: act, i: i, enc: pool[i % pool.length],
          party: prng.sample(heroes, 4).map(function (id) { return DD.Run && DD.Run.makeRunHero ? DD.Run.makeRunHero(id, LEVEL[act]) : DD.Combat.makeRunHero({ id: id, level: LEVEL[act] }); }) });
      }
    });
    const modes = ['none', 'common', 'rare', 'legendary', 'cursed', 'act odds'];
    const rows = [];
    modes.forEach(function (mode) {
      const irng = DD.RNG('itemsim-items:' + t.seed + ':' + mode);
      const rec = { fights: 0, wins: 0, timeouts: 0, rounds: 0, hpLost: 0, downs: 0, dmg: 0 };
      fights.forEach(function (f) {
        const party = f.party.map(function (rh) {
          const c = DD.util.deepClone(rh);
          c.hp = undefined;
          c.items = { weapon: null, armor: null, trinket: null };
          if (mode !== 'none') ['weapon', 'armor', 'trinket'].forEach(function (slot) {
            const r = mode === 'act odds' ? DD.Rewards.rollRarity(f.act, irng) : mode;
            const list = (byRarity[r] || {})[slot] || [];
            if (list.length) c.items[slot] = irng.pick(list);
          });
          return c;
        });
        const setup = DD.Encounter.build(f.enc, party, { rng: DD.RNG('itemsim-enc:' + t.seed + ':' + f.act + ':' + f.i), act: f.act, difficulty: diff });
        const s = DD.Combat.start(setup, { seed: 'itemsim:' + t.seed + ':' + f.act + ':' + f.i, headless: true, deploy: false, difficulty: diff });
        const hs = s.units.filter(function (u) { return u.kind === 'hero'; });
        const max = hs.reduce(function (n, u) { return n + u.maxHp; }, 0);
        const res = t.tryRun('sim ' + mode + ' ' + f.enc.id, function () { return DD.AutoPlay.runBattle(30); }) || {};
        rec.fights++;
        if (res.result === 'victory') rec.wins++;
        if (!res.result) rec.timeouts++;
        rec.rounds += s.round;
        rec.hpLost += 1 - hs.reduce(function (n, u) { return n + (u.downed || u.dead ? 0 : u.hp); }, 0) / max;
        rec.downs += s.stats.downs || 0;
        hs.forEach(function (u) { const st = s.stats.units[u.id]; rec.dmg += st ? st.dmg : 0; });
      });
      const pct = function (v) { return Math.round(100 * v / Math.max(1, rec.fights)) + '%'; };
      const avg = function (v) { return (v / Math.max(1, rec.fights)).toFixed(1); };
      rows.push(mode + ': win ' + pct(rec.wins) + ', timeouts ' + rec.timeouts + ', rounds ' + avg(rec.rounds) + ', party HP lost ' + pct(rec.hpLost) +
        ', downs ' + avg(rec.downs) + ', hero damage ' + avg(rec.dmg) + ' (' + rec.fights + ' fights)');
    });
    t.ok(rows.length === modes.length, 'simulated ' + fights.length + ' fights × ' + modes.length + ' modes with ' + heroes.length + ' heroes (levels ' + JSON.stringify(LEVEL) + ', ' + diff + ', ' + kinds.join('+') + ')');
    rows.forEach(function (r) { t.log(r); });
  });

  /**
   * Diagnostic (itemsim=each; n=fights per act, default 8; carrier=all|tank; only=id,id; difficulty/kinds/lvl as above,
   * default brutal elites + bosses at levels 1/4/7): outlier hunt. The same real-hero parties fight the same encounters
   * once with no items, then once per item with that item on every hero (carrier=tank: only the hero with the most max
   * HP). Logs one line per item sorted by score = Δwin% − Δparty HP lost% − 10·Δdowns − 3·Δrounds, plus the carrier's
   * own HP lost. Per-item noise is about ±5 at n=8 (all carriers) and ±7 for a single carrier: compare seeds.
   */
  T.suite('items: per-item outlier sim (diagnostic)', function (t) {
    if (!loaded(t)) return;
    if (t.param('itemsim', '0') !== 'each') { t.skip('itemsim=each to run the per-item outlier simulation'); return; }
    const heroes = realHeroes();
    if (heroes.length < 4) { t.skip('needs the real heroes'); return; }
    const N = +t.param('n', 0) || 8;
    const diff = t.param('difficulty', 'brutal'), tankOnly = t.param('carrier', 'all') === 'tank';
    const kinds = String(t.param('kinds', 'elite,boss')).split(','), off = +t.param('lvl', 0) || -2;
    const only = String(t.param('only', '')).split(',').filter(Boolean);
    const fights = [];
    [1, 2, 3].forEach(function (act) {
      const pool = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; })
        .filter(function (e) { return e.act === act && kinds.indexOf(e.kind) >= 0 && !/^test_/.test(e.id); });
      const prng = DD.RNG('itemeach-party:' + t.seed + ':' + act);
      for (let i = 0; i < N && pool.length; i++) {
        const party = prng.sample(heroes, 4).map(function (id) { return DD.Run.makeRunHero(id, Math.max(1, 3 * act + off)); });
        let tank = 0;
        party.forEach(function (rh, k) { if (DD.Run.heroStats(rh).maxHp > DD.Run.heroStats(party[tank]).maxHp) tank = k; });
        fights.push({ act: act, i: i, enc: pool[i % pool.length], party: party, tank: tank });
      }
    });
    function run(itemId) {
      const r = { n: 0, wins: 0, rounds: 0, hpLost: 0, downs: 0, tankLost: 0 };
      fights.forEach(function (f) {
        const party = f.party.map(function (rh, k) {
          const c = DD.util.deepClone(rh);
          c.hp = undefined;
          c.items = { weapon: null, armor: null, trinket: null };
          if (itemId && (!tankOnly || k === f.tank)) c.items[DD.getItem(itemId).slot] = itemId;
          return c;
        });
        const setup = DD.Encounter.build(f.enc, party, { rng: DD.RNG('itemeach-enc:' + t.seed + ':' + f.act + ':' + f.i), act: f.act, difficulty: diff });
        const s = DD.Combat.start(setup, { seed: 'itemeach:' + t.seed + ':' + f.act + ':' + f.i, headless: true, deploy: false, difficulty: diff, gold: 80 });
        const hs = s.units.filter(function (u) { return u.kind === 'hero'; });
        const max = hs.reduce(function (n, u) { return n + u.maxHp; }, 0);
        const res = t.tryRun('sim ' + itemId + ' ' + f.enc.id, function () { return DD.AutoPlay.runBattle(30); }) || {};
        const tank = hs.filter(function (u) { return u.runHero && u.runHero.id === f.party[f.tank].id; })[0];
        r.n++;
        if (res.result === 'victory') r.wins++;
        r.rounds += s.round;
        r.hpLost += 1 - hs.reduce(function (n, u) { return n + (u.downed ? 0 : u.hp); }, 0) / max;
        r.downs += s.stats.downs || 0;
        if (tank) r.tankLost += 1 - (tank.downed ? 0 : tank.hp) / tank.maxHp;
      });
      return r;
    }
    const pc = function (v, r) { return Math.round(100 * v / Math.max(1, r.n)); };
    const line = function (label, r) {
      return label + ': win ' + pc(r.wins, r) + '%, rounds ' + (r.rounds / r.n).toFixed(1) + ', party HP lost ' + pc(r.hpLost, r) + '%, downs ' +
        (r.downs / r.n).toFixed(2) + ', tank HP lost ' + pc(r.tankLost, r) + '%';
    };
    const base = run(null);
    t.log(line('no items', base) + ' (' + base.n + ' fights per row, ' + diff + ', carrier ' + (tankOnly ? 'tank' : 'all') + ')');
    const rows = (only.length ? only : DD.Items.ids).filter(function (id) { return !!DD.getItem(id); }).map(function (id) {
      const r = run(id), it = DD.getItem(id);
      const score = (r.wins - base.wins) / r.n * 100 - (r.hpLost - base.hpLost) / r.n * 100 - (r.downs - base.downs) / r.n * 10 - (r.rounds - base.rounds) / r.n * 3;
      return { score: score, text: line(id + ' (' + it.rarity + ' ' + it.slot + ')', r) + ' | score ' + score.toFixed(1) };
    });
    rows.sort(function (a, b) { return b.score - a.score; });
    rows.forEach(function (r) { t.log(r.text); });
    t.ok(rows.length > 0, rows.length + ' items × ' + fights.length + ' fights');
  });
})();
