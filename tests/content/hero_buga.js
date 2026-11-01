/* Dungeons and Degenerates — tests/content/hero_buga.js
 * Suites 'hero_buga: …' for Mayor Buga (js/data/heroes/buga.js), v2 (initiative order, no telegraphs, no Guard,
 * durations count the owner's own turns): registration, the Skimming Off the Top passive (credit gold for allies'
 * kills), basic + signature, every pool skill at every level in sandbox fights (numbers, statuses and how many of the
 * owner's turns they last, displacement, costs, cooldowns, charges, gold), combos with other heroes, items, v2 edge
 * cases (whose turn, stunned / silenced / sheep / charmed user, dying targets, pits, lava, water, map edges, AP),
 * exact previews, stated ranges, AutoPlay battles with usage counts, and the sprite / object / surface painters.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const POOL = ['buga_delegate', 'buga_fine', 'buga_promise', 'buga_human_shield', 'buga_bribe', 'buga_butter_up',
    'buga_red_tape', 'buga_photo_op', 'buga_pork_barrel', 'buga_crumbs'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];

  // ---- helpers ----------------------------------------------------------------------------------------
  /**
   * Sandbox fight that never ends on its own (custom objective). Sandbox v2 defaults: initiative 'heroesFirst' (heroes in
   * the listed order, then enemies), so it starts on Buga's turn in round 1. Enemies pass unless cfg.enemyAi is true.
   */
  function arena(cfg) {
    return DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, gold: 50, enemyAi: false,
      objective: { type: 'custom', text: 'Buga test' },
      encounter: { id: 'hb_arena', checkObjective: function () { return null; } },
    }, cfg));
  }
  function unit(defId, n) {
    return DD.Combat.state.units.filter(function (u) { return u.defId === defId && !u.dead; })[n || 0] || null;
  }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0] || null; }
  function use(u, id, p) { const sl = slotOf(u, id); return !!sl && DD.Combat.useSkill(u, sl, p.x, p.y); }
  function valid(u, id, p) { const sl = slotOf(u, id); return !!sl && DD.Targeting.isValidTarget(u, sl, p.x, p.y); }
  function can(u, id) { return DD.Combat.canUse(u, slotOf(u, id)); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function gold() { return DD.Act.gold(); }
  function cur() { return DD.Combat.current(); }
  function lvl(id, lv) { return DD.skillLevel(DD.getSkill(id), lv); }
  function buga(skills, x, y, extra) {
    return Object.assign({ id: 'buga', x: x === undefined ? 2 : x, y: y === undefined ? 4 : y, level: 3, skills: skills || [] }, extra || {});
  }
  function sk(id, level) { return { id: id, level: level || 1 }; }
  /** End hero turns until it is u's turn (bounded). */
  function toTurn(u) {
    for (let i = 0; i < 24 && cur() !== u && !DD.Combat.state.result; i++) DD.Combat.endTurn();
    return cur() === u;
  }
  function crumbTiles() { return DD.Combat.state.grid.tiles.filter(function (tl) { return tl.surface && tl.surface.id === 'buga_crumbs'; }); }
  function barrelAt(x, y) { const tl = DD.Grid.tile(x, y); return tl && tl.obj && tl.obj.id === 'buga_pork_barrel' ? tl.obj : null; }
  /** Record which skills are used (by unit def id) through a rule on the current fight. */
  function usage() {
    const list = [];
    DD.Act.addRule({ id: 'hb_usage', name: 'Usage', hooks: { onSkillUsed: function (ctx) {
      if (!DD.Act.simulating && ctx && ctx.user) list.push(ctx.user.defId + ':' + ctx.skill.id);
    } } });
    return list;
  }
  /** Run fn with DD.warn messages matching re swallowed (advisories of suites we call directly). */
  function quietWarn(re, fn) {
    const orig = DD.warn;
    DD.warn = function (m) { if (!re.test(String(m))) orig(m); };
    try { return fn(); } finally { DD.warn = orig; }
  }

  // ---- registration ---------------------------------------------------------------------------------
  T.suite('hero_buga: registration and v2 data (unlock null, init 0, 10 one-verb skills, no v1 mechanics)', function (t) {
    const h = DD.getHero('buga');
    t.ok(!!h, 'hero buga registered');
    if (!h) return;
    t.eq(h.name, 'Mayor Buga', 'name');
    ['epithet', 'race', 'cls', 'role', 'blurb', 'color'].forEach(function (k) { t.ok(typeof h[k] === 'string' && h[k].length > 0, 'field ' + k); });
    t.ok(h.complexity >= 1 && h.complexity <= 3, 'complexity 1-3');
    t.eq(h.unlock, null, 'v2: available from the start (unlock: null)');
    t.eq(h.stats.init, 0, 'v2: initiative modifier 0');
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov >= 3 && h.stats.mov <= 5, 'L1 stats in the DESIGN §5 ranges');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth +3-5 HP');
    t.ok(h.sprite && h.sprite.base === 'custom' && typeof h.sprite.draw === 'function', 'custom sprite painter');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['buga_delegate', 'buga_fine']), 'starters: Delegate (manipulation) + Loitering Fine (loot)');
    t.eq(JSON.stringify(h.skillPool.slice().sort()), JSON.stringify(POOL.slice().sort()), 'pool of 10 (DESIGN §6: 8-10)');
    t.ok(h.passive && h.passive.hooks && Object.keys(h.passive.hooks).join() === 'onAnyDeath', 'passive: one rule, one hook (onAnyDeath)');
    const sig = DD.getSkill(h.signature), basic = DD.getSkill(h.basic);
    t.ok(sig && sig.hype === 100 && sig.owner === 'buga' && sig.ap === 2, 'signature: 100 Hype + 2 AP');
    t.ok(basic && basic.ap === 1 && basic.levels[0].dmg >= 4 && basic.levels[0].dmg <= 6, 'basic: 1 AP, 4-6 damage');
    const aps = {};
    const texts = [h.passive.desc, h.blurb, h.role];
    POOL.concat([h.basic, h.signature]).forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'buga', id + ': owned by buga');
      if (!s) return;
      const pooled = POOL.indexOf(id) >= 0;
      if (pooled) t.eq(s.levels.length, 3, id + ': 3 levels');
      aps[DD.resolve(s.ap, s.levels[0], null, 1)] = 1;
      t.ok(typeof s.icon === 'string' && s.icon.length > 0 && s.icon.length <= 4, id + ': one emoji icon');
      t.ok(typeof s.flavor === 'string' && s.flavor.length > 0 && s.flavor.length <= 120, id + ': flavor <= 120');
      const faces = s.levels.map(function (L, i) {
        const d = DD.skillDesc(s, i + 1, null);
        texts.push(d);
        t.ok(d.length > 10 && !/undefined|NaN/.test(d), id + ' L' + (i + 1) + ' desc: ' + d);
        // DESIGN §6 "the desc reads in one breath": one verb + at most one rider
        t.ok(d.split(/\s+/).length <= 30, id + ' L' + (i + 1) + ': one breath (' + d.split(/\s+/).length + ' words)');
        return JSON.stringify([d, DD.resolve(s.cooldown, DD.skillLevel(s, i + 1), null, 0)]);
      });
      if (pooled) t.ok(faces[0] !== faces[1] && faces[1] !== faces[2], id + ': every level changes something visible');
    });
    t.ok(aps[0] && aps[1] && aps[2], 'a mix of AP costs (0, 1 and 2)');
    t.ok(POOL.some(function (id) { return DD.getSkill(id).charges > 0; }), 'a big skill with charges (Pork Barrel)');
    t.ok(POOL.some(function (id) { return DD.getSkill(id).cooldown >= 3; }), 'a big skill with a long cooldown (Bribe)');
    t.ok(POOL.filter(function (id) { return DD.getSkill(id).tags.indexOf('combo') >= 0; }).length >= 3, 'combo setups / payoffs are tagged');
    t.ok(POOL.some(function (id) { return DD.getSkill(id).tags.indexOf('gold') >= 0; }), 'gold-tagged skills (the Blessings table looks for them)');
    BARK_KEYS.forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ': 4-6 lines (' + lines.length + ')');
      lines.forEach(function (l) { t.ok(typeof l === 'string' && l.length > 0 && l.length <= 70, 'bark <= 70 chars: ' + l); texts.push(l); });
    });
    const all = BARK_KEYS.map(function (k) { return h.barks[k].join(' '); }).join(' ');
    t.ok(/Marwyn|Syllamin|Zarathor|Josiah|Marbles/.test(all), 'barks reference other heroes');
    t.ok(!DD.getStatus('buga_endorsed') && !DD.getStatus('buga_promise'), 'v1 statuses (Endorsed, promise debt) are gone');
    t.ok(!!DD.getSurface('buga_crumbs') && !!DD.getObject('buga_pork_barrel'), 'surface buga_crumbs, object buga_pork_barrel');
    texts.push(DD.getSurface('buga_crumbs').desc, DD.getObject('buga_pork_barrel').desc);
    const items = Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k]; }).filter(function (it) { return it.hero === 'buga'; });
    t.eq(items.length, 3, '3 hero items');
    t.ok(items.some(function (it) { return it.rarity === 'rare'; }) && items.some(function (it) { return it.rarity === 'legendary'; }), 'a rare and a legendary item');
    items.forEach(function (it) {
      t.ok(it.id.indexOf('buga_') === 0, 'item id prefix ' + it.id);
      t.ok(!(it.stats && it.stats.block), it.id + ': no stats.block (v2: no combat-start Block)');
      t.ok(!(it.hooks && (it.hooks.onCombatStart || it.hooks.modifyGuard)), it.id + ': no combat-start / Guard hooks');
      texts.push(it.desc);
    });
    // v1 mechanics are gone from every text the player reads
    texts.forEach(function (x) {
      t.ok(!/telegraph|\bGuard\b|Endorse|\bXP\b|planning|this round|intent/i.test(String(x)), 'no v1 mechanics in: ' + x);
    });
    // every def this file registers carries the buga_ prefix
    ['skills', 'statuses', 'surfaces', 'objects', 'items', 'summons'].forEach(function (kind) {
      Object.keys(DD.defs[kind]).forEach(function (id) {
        const d = DD.defs[kind][id];
        if (d.owner === 'buga' || d.hero === 'buga' || /^buga/.test(id)) t.ok(id.indexOf('buga_') === 0, kind + ' ' + id + ' prefixed buga_');
      });
    });
    const s = arena({ heroes: [buga([])], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    t.eq(s.rules.length, 0, 'no combat rule is installed (v2: the passive is a plain hook)');
    t.eq(unit('buga').block, 0, 'no Block at the start of the fight');
    const reg = T.suites.filter(function (x) { return x.name === 'content: registry cross-references'; })[0];
    if (reg) {
      const fails = [];
      const fake = { seed: t.seed, ok: function (v, m) { if (!v) fails.push(m); }, eq: function (a, b, m) { if (a !== b) fails.push(m); },
        fail: function (m) { fails.push(m); }, log: function () {}, skip: function () {}, param: function (k, d) { return d; } };
      quietWarn(/^content advisory/, function () { reg.fn(fake); });
      t.ok(!fails.some(function (m) { return /buga/.test(String(m)); }), 'the content registry suite accepts the hero: ' + fails.filter(function (m) { return /buga/.test(m); }).join(' | '));
    }
  });

  // ---- passive -------------------------------------------------------------------------------------------
  T.suite('hero_buga: passive Skimming Off the Top (credit gold for allies\' kills, not his own)', function (t) {
    let s = arena({ heroes: [buga([]), { id: 'test_knight', x: 4, y: 4 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }, { id: 'test_grunt', x: 8, y: 8 }] });
    const b = unit('buga'), k = unit('test_knight');
    at(2, 5).hp = 2;
    let g0 = gold();
    t.ok(use(b, 'buga_pamphlet', { x: 2, y: 5 }) && !at(2, 5), 'Buga finishes a grunt himself');
    t.eq(gold() - g0, 0, 'his own kill: there is nobody to take the credit from');
    t.ok(toTurn(k), 'the knight\'s turn');
    at(5, 4).hp = 3;
    g0 = gold();
    const h0 = s.hype;
    t.ok(use(k, 'test_slash', { x: 5, y: 4 }) && !at(5, 4), 'the knight kills a grunt on his turn');
    t.eq(gold() - g0, 2, 'an ally\'s kill: +2 gold');
    t.eq(s.hype - h0, 8, 'normal kill Hype (the passive adds gold only)');
    t.ok(s.log.some(function (l) { return /takes full credit for Sir Testsalot's kill \(\+2 gold\)/.test(l.text); }), 'logged as Buga\'s credit');
    DD.Act.kill(b, null);
    t.ok(b.downed, 'Buga downed');
    g0 = gold();
    DD.Act.damage(k, unit('test_grunt'), 99);
    t.eq(gold(), g0, 'no credit while Buga is down');

    // a summon's kill, an environmental kill and a Burn tick are allies' kills too; two at once pay twice
    s = arena({ heroes: [buga([]), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_summoner', x: 0, y: 8 }, { id: 'test_mage', x: 0, y: 0 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }, { id: 'test_grunt', x: 2, y: 7 }, { id: 'test_grunt', x: 8, y: 1 }],
      terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; } });
    const hound = s.units.filter(function (u) { return u.defId === 'test_hound' && !u.dead; })[0];
    t.ok(!!hound, 'the summoner brought her hound');
    g0 = gold();
    if (hound) DD.Act.damage(hound, at(2, 7), 99);
    t.eq(gold() - g0, 2, 'a hero summon\'s kill: +2');
    const k2 = unit('test_knight');
    t.ok(toTurn(k2), 'the knight\'s turn');
    g0 = gold();
    const hy = s.hype;
    t.ok(use(k2, 'test_shield_bash', { x: 5, y: 4 }) && !at(5, 4) && !at(6, 4), 'the knight shoves a grunt into the pit');
    t.eq(gold() - g0, 2, 'an environmental kill by an ally: +2');
    t.eq(s.hype - hy, 20, 'and the usual environmental-kill Hype');
    const burning = at(7, 7);
    burning.hp = 1;
    DD.Act.addStatus(burning, 'burn', { stacks: 2 }, unit('test_mage'));
    g0 = gold();
    DD.Combat.endRound();
    t.ok(burning.dead, 'the mage\'s Burn finishes a grunt at the end of its turn');
    t.eq(gold() - g0, 2, 'a kill by an ally\'s Burn: +2');

    // a foe Buga bribed kills its friend on its own turn: Buga's credit; one charmed by somebody else: not his
    [['buga', 2], ['test_knight', 0]].forEach(function (c) {
      s = arena({ enemyAi: true, order: ['buga', 'test_grunt'], heroes: [buga([], 1, 4), { id: 'test_knight', x: 0, y: 0 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
      const ga = at(4, 4), gb = at(5, 4);
      DD.Act.addStatus(ga, 'charmed', { turns: 1 }, unit(c[0]));
      gb.hp = 3;
      g0 = gold();
      DD.Combat.endTurn();   // the charmed grunt's turn comes next: it stabs its friend
      t.ok(gb.dead, c[0] + ' charmed it: the charmed grunt kills its friend on its turn');
      t.eq(gold() - g0, c[1], 'charmed by ' + c[0] + ': ' + (c[1] ? 'Buga takes the credit (+2)' : 'not Buga\'s credit'));
      t.ok(!st(ga, 'charmed'), 'the charm covered exactly its one turn');
    });

    // enemy-side summons are not enemies to take credit for; two kills in one swing pay twice; the Chain pays 3
    s = arena({ heroes: [buga([]), { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 5, y: 3 }, { id: 'test_grunt', x: 5, y: 5 }] });
    const pup = DD.Act.summon(at(5, 4), 'test_hound', 7, 7, { noFx: true });
    t.ok(pup && pup.side === 'enemy' && pup.kind === 'summon', 'an enemy-side summon');
    g0 = gold();
    DD.Act.damage(unit('test_knight'), pup, 99);
    t.eq(gold(), g0, 'its death pays nothing');
    const k3 = unit('test_knight');
    toTurn(k3);
    at(5, 4).hp = 2; at(5, 3).hp = 2; at(5, 5).hp = 2;
    g0 = gold();
    t.ok(use(k3, 'test_cleave', { x: 5, y: 4 }) && !at(5, 4) && !at(5, 3) && !at(5, 5), 'the knight cleaves three grunts');
    t.eq(gold() - g0, 6, 'three kills, three credits (+6)');
    s = arena({ heroes: [buga([], 2, 4, { items: ['buga_chain_of_office'] }), { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    g0 = gold();
    DD.Act.damage(unit('test_knight'), at(5, 4), 99);
    t.eq(gold() - g0, 3, 'with the Chain of Office: +3 per credit');
  });

  // ---- basic + signature -----------------------------------------------------------------------------
  T.suite('hero_buga: Campaign Pamphlet and Toast of the Town (every ally swings, Empowered, for free)', function (t) {
    arena({ heroes: [buga([])], enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 7, y: 4 }] });
    let b = unit('buga');
    t.ok(cur() === b && b.ap === 3, 'Buga\'s turn, 3 AP');
    t.ok(valid(b, 'buga_pamphlet', { x: 6, y: 4 }) && !valid(b, 'buga_pamphlet', { x: 7, y: 4 }), 'range 4');
    t.ok(use(b, 'buga_pamphlet', { x: 6, y: 4 }), 'pamphlet thrown');
    t.eq(at(6, 4).hp, 10, '4 damage');
    t.eq(b.ap, 2, '1 AP');

    // the toast: knight (adjacent), mage (in bolt range) and cleric (in smite range) swing, Empowered; a far ally does not
    let s = arena({ heroes: [buga([], 1, 4), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 3, y: 7 }, { id: 'test_cleric', x: 6, y: 6 },
      { id: 'test_rogue', x: 0, y: 0 }], enemies: [{ id: 'test_brute', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    b = unit('buga');
    const knight = unit('test_knight'), mage = unit('test_mage'), cleric = unit('test_cleric'), rogue = unit('test_rogue'), brute = unit('test_brute');
    t.eq(can(b, 'buga_toast_of_the_town'), 'Needs 100 Hype.', 'needs 100 Hype');
    s.hype = 100;
    const ctx = DD.Targeting.buildCtx(b, b.signature, { x: 5, y: 4 });
    t.eq(ctx.tiles.length, 4, 'the area shows the foe and the 3 allies who will swing');
    const aps = [knight, mage, cleric, rogue].map(function (u) { return [u.ap, u.apBank || 0]; });
    const used = usage();
    t.ok(use(b, 'buga_toast_of_the_town', brute), 'Toast of the Town');
    t.eq(s.hype, 0, 'Hype spent');
    t.eq(b.ap, 1, '2 AP');
    t.eq(brute.maxHp - brute.hp, (8 - 1) + (6 - 1) + (6 - 1), 'slash 5 → 8, bolt 4 → 6, smite 4 → 6 (+50% each, minus 1 armor)');
    t.eq(JSON.stringify(used.filter(function (x) { return x.indexOf('buga:') < 0; }).sort()),
      JSON.stringify(['test_cleric:test_smite', 'test_knight:test_slash', 'test_mage:test_bolt']), 'each ally made its basic attack');
    t.ok([knight, mage, cleric].every(function (u) { return !st(u, 'empowered'); }), 'the Empowered swings used it up');
    t.ok(!st(rogue, 'empowered'), 'the rogue could not hit it: no swing, no Empowered');
    t.eq(JSON.stringify([knight, mage, cleric, rogue].map(function (u) { return [u.ap, u.apBank || 0]; })), JSON.stringify(aps), 'free: no ally spent or banked AP');
    t.ok(toTurn(knight) && knight.ap === 3, 'the knight still gets his full turn');
    // the target dies mid-toast: the rest keep their turn and get no Empowered
    s = arena({ heroes: [buga([], 1, 4), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 3, y: 7 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    s.hype = 100;
    at(5, 4).hp = 8;
    t.ok(use(unit('buga'), 'buga_toast_of_the_town', { x: 5, y: 4 }), 'toast at a grunt with 8 HP');
    t.ok(!unit('test_grunt') || unit('test_grunt').x === 8, 'the Empowered slash (8) finishes it');
    t.ok(!st(unit('test_mage'), 'empowered'), 'the mage never swung: no Empowered left over');
    t.ok(DD.Combat.state.log.some(function (l) { return /takes full credit for Sir Testsalot/.test(l.text); }), 'and Buga takes the credit for the toast\'s kill');
    // no ally in reach: not a target
    s = arena({ heroes: [buga([], 1, 4), { id: 'test_knight', x: 0, y: 8 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    s.hype = 100;
    t.ok(!valid(unit('buga'), 'buga_toast_of_the_town', { x: 5, y: 4 }), 'a foe no ally can hit is not a target');
    t.eq(can(unit('buga'), 'buga_toast_of_the_town'), 'No valid targets.', 'so the toast waits');
  });

  // ---- Delegate -------------------------------------------------------------------------------------------
  T.suite('hero_buga: Delegate (free basic attack now, best-placed ally, cooldown per own turn)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      arena({ heroes: [buga([sk('buga_delegate', lv)], 1, 4), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 3, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
      const b = unit('buga'), knight = unit('test_knight'), mage = unit('test_mage'), g = at(5, 4);
      const L = lvl('buga_delegate', lv);
      const ctx = DD.Targeting.buildCtx(b, slotOf(b, 'buga_delegate'), { x: 5, y: 4 });
      t.ok(ctx.tiles.some(function (p) { return p.x === knight.x && p.y === knight.y; }), 'L' + lv + ': the area shows the knight who will swing');
      t.eq(ctx.tiles.length, 1 + L.allies, 'L' + lv + ': target + ' + L.allies + ' ally tile(s)');
      const before = [knight.ap, knight.apBank || 0, mage.ap, mage.apBank || 0];
      t.ok(use(b, 'buga_delegate', g), 'L' + lv + ': delegate');
      const expected = 5 + (L.allies > 1 ? 4 : 0);
      t.eq(14 - g.hp, expected, 'L' + lv + ': damage ' + expected + ' (knight slash 5' + (L.allies > 1 ? ' + mage bolt 4' : '') + ')');
      t.eq(JSON.stringify([knight.ap, knight.apBank || 0, mage.ap, mage.apBank || 0]), JSON.stringify(before), 'L' + lv + ': free for the allies (no AP spent or banked)');
      t.eq(b.ap, 2, 'L' + lv + ': 1 AP for Buga');
      t.eq(slotOf(b, 'buga_delegate').cd, L.cd, 'L' + lv + ': cooldown ' + L.cd);
      // cooldown N = unusable during his next N turns
      for (let r = 1; r <= L.cd; r++) {
        DD.Combat.endRound();
        t.eq(can(b, 'buga_delegate'), 'On cooldown (' + (L.cd - r + 1) + ').', 'L' + lv + ': round ' + (r + 1) + ' still cooling down');
      }
      DD.Combat.endRound();
      t.eq(can(b, 'buga_delegate'), true, 'L' + lv + ': ready again in round ' + (L.cd + 2));
    });
    // the best placed ally: knight out of reach -> the mage shoots; a foe no ally reaches is no target
    arena({ heroes: [buga([sk('buga_delegate', 1)], 1, 4), { id: 'test_knight', x: 1, y: 8 }, { id: 'test_mage', x: 3, y: 6 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 1, y: 0 }] });
    let b = unit('buga');
    t.ok(!valid(b, 'buga_delegate', { x: 1, y: 0 }), 'a foe that no ally can reach is not a valid target');
    t.ok(use(b, 'buga_delegate', { x: 5, y: 4 }), 'delegate to the mage');
    t.eq(at(5, 4).hp, 10, 'the mage bolts it for 4');
    // the target dies mid-skill: the second ally does not swing at a corpse
    let s = arena({ heroes: [buga([sk('buga_delegate', 3)], 1, 4), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 3, y: 6 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    at(5, 4).hp = 5;
    const used = usage();
    const g0 = gold(), h0 = s.hype;
    t.ok(use(unit('buga'), 'buga_delegate', { x: 5, y: 4 }), 'Delegate III on a weak grunt');
    t.ok(!unit('test_grunt'), 'the knight finishes it');
    t.ok(used.indexOf('test_mage:test_bolt') < 0, 'the mage never had to swing');
    t.eq(gold() - g0, 2, 'Buga takes the credit for the delegated kill (+2)');
    t.eq(s.hype - h0, 8, 'kill Hype');
    // incapacitated or silenced allies are skipped; summons can be delegated
    arena({ heroes: [buga([sk('buga_delegate', 1)], 1, 4), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 3, y: 6 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    b = unit('buga');
    DD.Act.addStatus(unit('test_knight'), 'stun', { turns: 1 });
    DD.Act.addStatus(unit('test_mage'), 'silenced', { turns: 1 });
    t.ok(!valid(b, 'buga_delegate', { x: 5, y: 4 }), 'stunned knight and silenced mage (spell basic) cannot be delegated');
    DD.Act.removeStatus(unit('test_mage'), 'silenced');
    DD.Act.addStatus(unit('test_mage'), 'sheep', { turns: 1 });
    t.ok(!valid(b, 'buga_delegate', { x: 5, y: 4 }), 'a sheep cannot be delegated');
    s = arena({ heroes: [buga([sk('buga_delegate', 1)], 1, 4), { id: 'test_summoner', x: 7, y: 8 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    b = unit('buga');
    const hound = s.units.filter(function (u) { return u.kind === 'summon' && !u.dead; })[0];
    t.ok(!!hound, 'the summoner brought a hound');
    if (hound) {
      DD.Act.teleport(hound, 5, 5);
      const ap0 = hound.ap;
      t.ok(use(b, 'buga_delegate', { x: 5, y: 4 }), 'delegate to the hound');
      t.eq(at(5, 4).hp, 11, 'the hound bites for 3');
      t.eq(hound.ap, ap0, 'free for the hound');
    }
    // never the ally charmed by the target (0 damage); a hero Taunt elsewhere halves its estimate
    function deleg(prep) {
      arena({ heroes: [buga([sk('buga_delegate', 1)], 1, 4), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 3, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
      prep(unit('test_knight'), at(5, 4), at(8, 8));
      t.ok(use(unit('buga'), 'buga_delegate', { x: 5, y: 4 }), 'delegate');
      return at(5, 4);
    }
    t.eq(deleg(function (k, g) { DD.Act.addStatus(k, 'charmed', { turns: 1 }, g); }).hp, 10, 'knight charmed by the grunt: the mage bolts it (4)');
    t.eq(deleg(function (k, g, o) { DD.Act.addStatus(k, 'taunt', { turns: 1 }, o); }).hp, 10, 'knight Taunted elsewhere (slash halved): the mage is better placed');
    t.eq(deleg(function (k, g) { DD.Act.addStatus(k, 'taunt', { turns: 1 }, g); }).hp, 9, 'knight Taunted by the target: his full slash (5)');
  });

  // ---- Loitering Fine -----------------------------------------------------------------------------------------
  T.suite('hero_buga: Loitering Fine (damage + gold every time)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      arena({ heroes: [buga([sk('buga_fine', lv)])], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 2, y: 7 }] });
      const b = unit('buga'), g = at(5, 4);
      const L = lvl('buga_fine', lv);
      t.ok(valid(b, 'buga_fine', g) && !valid(b, 'buga_fine', { x: 6, y: 4 }), 'L' + lv + ': range 3');
      let g0 = gold();
      t.ok(use(b, 'buga_fine', g), 'L' + lv + ': fined');
      t.eq(14 - g.hp, L.dmg, 'L' + lv + ': ' + L.dmg + ' damage');
      t.eq(gold() - g0, L.gold, 'L' + lv + ': pockets ' + L.gold + ' gold');
      t.eq(b.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(slotOf(b, 'buga_fine').cd, 1, 'L' + lv + ': cooldown 1');
      DD.Combat.endRound();
      t.eq(can(b, 'buga_fine'), 'On cooldown (1).', 'L' + lv + ': not on his next turn');
      DD.Combat.endRound();
      g0 = gold();
      t.ok(use(b, 'buga_fine', g), 'L' + lv + ': two turns later, fined again');
      t.eq(gold() - g0, L.gold, 'L' + lv + ': every fine pays');
    });
    arena({ heroes: [buga([sk('buga_fine', 1)])], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    at(5, 4).hp = 2;
    const g0 = gold();
    t.ok(use(unit('buga'), 'buga_fine', { x: 5, y: 4 }) && !at(5, 4), 'a lethal fine');
    t.eq(gold() - g0, 2, 'still pays the fine (his own kill: no credit on top)');
  });

  // ---- Campaign Promise ----------------------------------------------------------------------------------------
  T.suite('hero_buga: Campaign Promise (0 AP: an ally gains AP on its next turn)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      arena({ heroes: [buga([sk('buga_promise', lv)]), { id: 'test_knight', x: 5, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const b = unit('buga'), k = unit('test_knight');
      const L = lvl('buga_promise', lv);
      t.ok(!valid(b, 'buga_promise', b), 'L' + lv + ': not on himself');
      t.ok(use(b, 'buga_promise', k), 'L' + lv + ': promise');
      t.eq(b.ap, 3, 'L' + lv + ': costs Buga 0 AP');
      t.eq(k.apBank, L.ap, 'L' + lv + ': banked for the knight\'s next turn (+' + L.ap + ')');
      t.eq(slotOf(b, 'buga_promise').cd, L.cd, 'L' + lv + ': cooldown ' + L.cd);
      t.ok(toTurn(k), 'L' + lv + ': the knight\'s turn');
      t.eq(k.ap, 3 + L.ap, 'L' + lv + ': ' + (3 + L.ap) + ' AP this turn');
      DD.Combat.endRound();
      t.ok(toTurn(k) && k.ap === 3, 'L' + lv + ': back to 3 AP the turn after (no strings attached)');
    });
    // a stunned ally loses its turn and the promise with it; range 5
    arena({ heroes: [buga([sk('buga_promise', 1)]), { id: 'test_knight', x: 5, y: 4 }, { id: 'test_mage', x: 7, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    const b = unit('buga'), k = unit('test_knight'), m = unit('test_mage');
    t.ok(valid(b, 'buga_promise', k) && valid(b, 'buga_promise', m), 'allies within 5');
    use(b, 'buga_promise', k);
    DD.Act.addStatus(k, 'stun', { turns: 1 }, null);
    DD.Combat.endTurn();
    t.eq(cur(), m, 'the stunned knight\'s turn passed by itself');
    t.ok(k.ap === 0 && (k.apBank || 0) === 0, 'and the promised AP went with it');
    arena({ heroes: [buga([sk('buga_promise', 1)], 1, 4), { id: 'test_knight', x: 7, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    t.ok(!valid(unit('buga'), 'buga_promise', unit('test_knight')), 'an ally 6 tiles away is out of range');
  });

  // ---- Human Shield --------------------------------------------------------------------------------------------
  T.suite('hero_buga: Human Shield (swap + Block until the ally\'s next turn)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      arena({ heroes: [buga([sk('buga_human_shield', lv)]), { id: 'test_knight', x: 5, y: 4 }, { id: 'test_mage', x: 6, y: 4 }, { id: 'test_cleric', x: 7, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const b = unit('buga'), k = unit('test_knight');
      const L = lvl('buga_human_shield', lv);
      t.eq(valid(b, 'buga_human_shield', unit('test_mage')), L.r >= 4, 'L' + lv + ': an ally 4 tiles away ' + (L.r >= 4 ? 'in' : 'out of') + ' range');
      t.eq(valid(b, 'buga_human_shield', unit('test_cleric')), L.r >= 5, 'L' + lv + ': an ally 5 tiles away ' + (L.r >= 5 ? 'in' : 'out of') + ' range');
      t.ok(use(b, 'buga_human_shield', k), 'L' + lv + ': swap');
      t.ok(b.x === 5 && b.y === 4 && k.x === 2 && k.y === 4, 'L' + lv + ': positions swapped');
      t.eq(k.block, L.block, 'L' + lv + ': the ally gains ' + L.block + ' Block');
      t.eq(b.ap, 2, 'L' + lv + ': 1 AP');
    });
    // the Block soaks the enemy turns that come before the ally's own turn, then expires at its turn start
    arena({ enemyAi: true, order: ['buga', 'test_grunt'], heroes: [buga([sk('buga_human_shield', 1)], 2, 4), { id: 'test_cleric', x: 5, y: 4 }],
      enemies: [{ id: 'test_grunt', x: 2, y: 5 }] });
    const b = unit('buga'), c = unit('test_cleric'), g = at(2, 5);
    DD.Act.addStatus(g, 'root', { turns: 1 }, b);   // it stays next to Buga's old tile
    t.ok(use(b, 'buga_human_shield', c), 'swap with the cleric, who now stands next to the grunt');
    let blockOnGruntTurn = -1;
    const off = DD.Events.on('turn:start', function (e) { if (e.unit === g) blockOnGruntTurn = c.block; });
    DD.Combat.endTurn();
    off();
    t.eq(blockOnGruntTurn, 4, 'the Block is up during the grunt\'s turn');
    t.eq(c.hp, c.maxHp, 'the grunt\'s 4-damage stab is soaked by the 4 Block');
    t.ok(cur() === c && c.block === 0, 'gone at the start of the cleric\'s own turn');
    // won't budge: immovable allies; never onto a pit
    arena({ heroes: [buga([sk('buga_human_shield', 1)]), { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    unit('test_knight').flags.immovable = true;
    t.ok(!valid(unit('buga'), 'buga_human_shield', unit('test_knight')), 'an immovable ally will not budge');
    arena({ heroes: [buga([sk('buga_human_shield', 1)]), { id: 'test_knight', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'pit'; } });
    const k = unit('test_knight');
    k.flags.flying = true;
    t.ok(DD.Act.teleport(k, 4, 4), 'a (now flying) knight hovers over the pit');
    t.ok(!valid(unit('buga'), 'buga_human_shield', k), 'Buga will not swap onto a pit');
    // a rooted Buga can still swap (a swap is not a move action)
    arena({ heroes: [buga([sk('buga_human_shield', 1)]), { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    DD.Act.addStatus(unit('buga'), 'root', { turns: 1 });
    t.ok(use(unit('buga'), 'buga_human_shield', unit('test_knight')) && unit('buga').x === 4, 'rooted Buga swaps anyway');
  });

  // ---- Bribe -------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: Bribe (gold for a Charm: it fights for you on its next turn(s); not bosses)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      arena({ heroes: [buga([sk('buga_bribe', lv)])], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }] });
      const b = unit('buga'), g = at(5, 4);
      const L = lvl('buga_bribe', lv);
      t.eq(valid(b, 'buga_bribe', { x: 6, y: 4 }), L.r >= 4, 'L' + lv + ': range ' + L.r);
      const g0 = gold();
      t.ok(use(b, 'buga_bribe', g), 'L' + lv + ': bribe');
      t.eq(g0 - gold(), L.gold, 'L' + lv + ': costs ' + L.gold + ' gold');
      t.ok(st(g, 'charmed') && st(g, 'charmed').turns === L.turns && st(g, 'charmed').source === b.id, 'L' + lv + ': Charmed by Buga for ' + L.turns + ' turn(s)');
      t.eq(slotOf(b, 'buga_bribe').cd, 3, 'L' + lv + ': cooldown 3');
      t.eq(b.ap, 2, 'L' + lv + ': 1 AP');
    });
    // on its next turn(s) it fights for you: it stabs its friend; the charm lasts exactly its L.turns own turns
    [1, 3].forEach(function (lv) {
      const s = arena({ enemyAi: true, order: ['buga', 'test_grunt'], heroes: [buga([sk('buga_bribe', lv)], 1, 4), { id: 'test_knight', x: 0, y: 0 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
      const ga = at(4, 4), gb = at(5, 4);
      DD.Act.addStatus(gb, 'root', { turns: 3 }, null);   // the friend stays put
      t.ok(use(unit('buga'), 'buga_bribe', ga), 'L' + lv + ': bribe the grunt');
      DD.Combat.endTurn();
      t.eq(gb.hp, 10, 'L' + lv + ': on its turn the bribed grunt stabs its friend (4)');
      t.eq(!!st(ga, 'charmed'), lv === 3, 'L' + lv + ': ' + (lv === 3 ? 'still Charmed for its second turn' : 'the charm covered exactly one turn'));
      if (lv === 3) {
        toTurn(unit('buga'));
        DD.Combat.endTurn();
        t.eq(gb.hp, 6, 'L3: and again on its second turn');
        t.ok(!st(ga, 'charmed'), 'L3: then it is over');
      }
      t.ok(!s.result && !DD.Combat.heroes().some(function (u) { return u.hp < u.maxHp; }), 'L' + lv + ': the bribed grunt never touched a hero');
    });
    // too poor; bosses have their own accountants; incorruptible and already-bought foes are not targets
    arena({ heroes: [buga([sk('buga_bribe', 1)])], enemies: [{ id: 'test_grunt', x: 5, y: 4 }], gold: 5 });
    t.ok(/gold/.test(String(can(unit('buga'), 'buga_bribe'))), 'too poor to bribe: ' + can(unit('buga'), 'buga_bribe'));
    arena({ heroes: [buga([sk('buga_bribe', 2)])], enemies: [{ id: 'test_boss', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], gold: 99 });
    t.ok(!valid(unit('buga'), 'buga_bribe', unit('test_boss')), 'a boss cannot be bribed');
    const ctx = DD.Targeting.buildCtx(unit('buga'), slotOf(unit('buga'), 'buga_bribe'), { x: 5, y: 4 });
    t.ok(/accountants/.test(String(DD.getSkill('buga_bribe').target.canTarget(ctx))), 'and says why');
    arena({ heroes: [buga([sk('buga_bribe', 1)])], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 5 }] });
    at(5, 4).flags.immune = ['charmed'];
    DD.Act.addStatus(at(4, 5), 'charmed', { turns: 1 }, unit('buga'));
    t.ok(!valid(unit('buga'), 'buga_bribe', { x: 5, y: 4 }) && !valid(unit('buga'), 'buga_bribe', { x: 4, y: 5 }), 'incorruptible / already bought foes are not targets');
  });

  // ---- Butter Up ------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: Butter Up (Empowered ally, Inspired at III, combo with Delegate)', function (t) {
    [[1, 8], [2, 8], [3, 9]].forEach(function (c) {
      const lv = c[0];
      arena({ heroes: [buga([sk('buga_butter_up', lv)]), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 6, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
      const b = unit('buga'), k = unit('test_knight'), g = at(5, 4);
      const L = lvl('buga_butter_up', lv);
      t.eq(valid(b, 'buga_butter_up', unit('test_mage')), L.r >= 4, 'L' + lv + ': range ' + L.r);
      t.ok(use(b, 'buga_butter_up', k), 'L' + lv + ': buttered');
      t.ok(st(k, 'empowered'), 'L' + lv + ': Empowered');
      t.eq(!!st(k, 'inspired'), !!L.inspire, 'L' + lv + ': Inspired only at III');
      t.eq(slotOf(b, 'buga_butter_up').cd, L.cd, 'L' + lv + ': cooldown ' + L.cd);
      t.ok(toTurn(k), 'L' + lv + ': the knight\'s turn');
      t.ok(use(k, 'test_slash', g), 'L' + lv + ': the knight swings');
      t.eq(14 - g.hp, c[1], 'L' + lv + ': slash 5 becomes ' + c[1]);
      t.ok(!st(k, 'empowered'), 'L' + lv + ': Empowered used up');
      if (L.inspire) {
        t.ok(st(k, 'inspired'), 'L3: Inspired for the rest of his turn');
        DD.Combat.endTurn();
        t.ok(!st(k, 'inspired'), 'L3: gone at the end of his turn (it covered exactly his next turn)');
      }
    });
    arena({ heroes: [buga([sk('buga_butter_up', 1), sk('buga_delegate', 1)], 1, 4), { id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    const b = unit('buga');
    use(b, 'buga_butter_up', unit('test_knight'));
    t.ok(use(b, 'buga_delegate', { x: 4, y: 4 }), 'then delegate');
    t.eq(at(4, 4).hp, 6, 'the free slash is buttered: 8 damage');
  });

  // ---- Red Tape -------------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: Red Tape (pull + Root for its next turn; pits, water, lava, immovable, edges)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      arena({ heroes: [buga([sk('buga_red_tape', lv)], 1, 4)], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }] });
      const b = unit('buga'), g = at(5, 4);
      const L = lvl('buga_red_tape', lv);
      t.ok(!valid(b, 'buga_red_tape', { x: 2, y: 4 }), 'L' + lv + ': not adjacent (range 2-' + L.r + ')');
      t.eq(valid(b, 'buga_red_tape', { x: 6, y: 5 }), L.r >= 6 ? true : false, 'L' + lv + ': 6 tiles is out of range');
      t.ok(use(b, 'buga_red_tape', g), 'L' + lv + ': lasso');
      t.eq(g.x, 3, 'L' + lv + ': pulled ' + Math.min(L.pull, 2) + ' (it stops at the grunt in the way)');
      t.ok(st(g, 'root') && st(g, 'root').turns === 1, 'L' + lv + ': Rooted for its next turn');
      const bump = L.pull > 2 ? 3 : 0;
      t.eq(14 - g.hp, bump, 'L' + lv + ': ' + (bump ? 'a 3-damage bump into the grunt in the way' : 'no damage (a clean pull)'));
      t.eq(b.ap, 2, 'L' + lv + ': 1 AP');
    });
    // a free lane: the full pull; the Root holds it through exactly its next turn
    arena({ enemyAi: true, heroes: [buga([sk('buga_red_tape', 1)], 1, 4)], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    let g = at(5, 4);
    t.ok(use(unit('buga'), 'buga_red_tape', g) && g.x === 3, 'pulled 2 tiles (to 2 away from Buga)');
    DD.Combat.endTurn();
    t.ok(g.x === 3 && g.y === 4 && unit('buga').hp === unit('buga').maxHp, 'Rooted: on its turn it could not walk up to Buga');
    t.ok(!st(g, 'root'), 'the Root ended with that turn');
    DD.Combat.endTurn();
    t.ok(DD.Grid.dist(g, unit('buga')) === 1, 'free again the turn after: it walks up to Buga');
    // red tape into hazards
    let s = arena({ heroes: [buga([sk('buga_red_tape', 1)], 1, 4)], enemies: [{ id: 'test_grunt', x: 4, y: 4 }],
      terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'pit'; } });
    const hype0 = s.hype;
    t.ok(use(unit('buga'), 'buga_red_tape', { x: 4, y: 4 }), 'lasso over a pit');
    t.ok(!unit('test_grunt'), 'pulled into the pit: YEET (no Root left on a corpse, no error)');
    t.eq(s.hype - hype0, 20, 'environmental kill Hype');
    arena({ heroes: [buga([sk('buga_red_tape', 1)], 1, 4)], enemies: [{ id: 'test_grunt', x: 4, y: 4 }],
      terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'water'; } });
    g = at(4, 4);
    use(unit('buga'), 'buga_red_tape', g);
    t.ok(st(g, 'wet'), 'dragged through water: Wet (lightning combo)');
    arena({ heroes: [buga([sk('buga_red_tape', 1)], 1, 4)], enemies: [{ id: 'test_grunt', x: 4, y: 4 }],
      terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'lava'; } });
    g = at(4, 4);
    use(unit('buga'), 'buga_red_tape', g);
    t.ok(g.dead || g.hp <= 14 - 8, 'dragged into lava: 8 fire damage (' + g.hp + ')');
    arena({ heroes: [buga([sk('buga_red_tape', 1)], 1, 4)], enemies: [{ id: 'test_brute', x: 4, y: 4 }] });
    const br = unit('test_brute');
    use(unit('buga'), 'buga_red_tape', br);
    t.ok(br.x === 4 && st(br, 'root'), 'immovable: not pulled, still Rooted');
    arena({ heroes: [buga([sk('buga_red_tape', 3)], 0, 4)], enemies: [{ id: 'test_grunt', x: 0, y: 0 }] });
    g = at(0, 0);
    use(unit('buga'), 'buga_red_tape', g);
    t.ok(g.x === 0 && g.y === 3, 'pulled down the map edge to Buga (0,3)');
  });

  // ---- Photo Op -------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: Photo Op (allies around Buga Inspired through their next turn, Hype at III)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const s = arena({ heroes: [buga([sk('buga_photo_op', lv)], 4, 4), { id: 'test_knight', x: 5, y: 5 }, { id: 'test_mage', x: 4, y: 7 }, { id: 'test_cleric', x: 0, y: 0 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 2 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const b = unit('buga'), k = unit('test_knight'), m = unit('test_mage'), c = unit('test_cleric');
      const L = lvl('buga_photo_op', lv);
      const h0 = s.hype;
      t.ok(use(b, 'buga_photo_op', b), 'L' + lv + ': photo op');
      t.eq(b.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(slotOf(b, 'buga_photo_op').cd, 2, 'L' + lv + ': cooldown 2');
      t.ok(st(k, 'inspired') && st(k, 'inspired').turns === 1, 'L' + lv + ': the ally 2 tiles away is Inspired');
      t.eq(!!st(m, 'inspired'), L.r >= 3, 'L' + lv + ': the ally 3 tiles away ' + (L.r >= 3 ? 'too' : 'is not in the picture'));
      t.ok(!st(c, 'inspired') && !st(b, 'inspired') && !st(at(4, 2), 'inspired'), 'L' + lv + ': far allies, Buga (behind the camera) and foes get nothing');
      const pictured = L.r >= 3 ? 2 : 1;
      t.eq(s.hype - h0, (L.hype || 0) * pictured, 'L' + lv + ': Hype ' + (L.hype || 0) + ' x ' + pictured);
      t.ok(toTurn(k) && st(k, 'inspired'), 'L' + lv + ': still Inspired on the knight\'s turn');
      DD.Combat.endTurn();
      t.ok(!st(k, 'inspired'), 'L' + lv + ': gone at the end of it');
    });
  });

  // ---- Pork Barrel --------------------------------------------------------------------------------------------------
  T.suite('hero_buga: Pork Barrel (lit object, blast at round end or when hit/lit, charges, credit)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      arena({ heroes: [buga([sk('buga_pork_barrel', lv)])], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 7, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const b = unit('buga');
      const L = lvl('buga_pork_barrel', lv);
      t.ok(!valid(b, 'buga_pork_barrel', { x: 5, y: 4 }), 'L' + lv + ': not on a unit');
      t.ok(use(b, 'buga_pork_barrel', { x: 6, y: 4 }), 'L' + lv + ': planted between three grunts');
      t.eq(b.ap, 1, 'L' + lv + ': 2 AP');
      const o = barrelAt(6, 4);
      t.ok(!!o && o.data.dmg === L.boom && o.data.fuse === 1 && o.data.owner === b.id, 'L' + lv + ': a lit barrel carrying ' + L.boom + ' boom');
      t.ok([[5, 4], [7, 4], [6, 5]].every(function (p) { return at(p[0], p[1]).hp === 14; }), 'L' + lv + ': no damage yet');
      const g0 = gold();
      DD.Act.damageObject(b, 6, 4, 1);
      t.ok(!barrelAt(6, 4), 'L' + lv + ': any hit pops it, even 1 damage');
      t.ok([[5, 4], [7, 4], [6, 5]].every(function (p) { const u = DD.Combat.state.units.filter(function (x) { return x.x === p[0] && x.y === p[1] && x.defId === 'test_grunt'; })[0]; return u && (u.dead ? L.boom >= 14 : 14 - u.hp === L.boom); }),
        'L' + lv + ': ' + L.boom + ' fire damage to each grunt next to it');
      t.eq(gold() - g0, L.gold || 0, 'L' + lv + ': kickbacks ' + (L.gold || 0) + ' gold');
      t.ok([[6, 4], [5, 4], [7, 4], [6, 5], [6, 3]].every(function (p) { return !DD.Grid.tile(p[0], p[1]).surface; }), 'L' + lv + ': just the blast, no lingering fire');
    });
    // the fuse: untouched, it blows at the end of the round (after every turn), credited to Buga
    [1, 3].forEach(function (lv) {
      const s = arena({ heroes: [buga([sk('buga_pork_barrel', lv)])], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 7, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const L = lvl('buga_pork_barrel', lv);
      const g = at(5, 4), g2 = at(7, 4);
      t.ok(use(unit('buga'), 'buga_pork_barrel', { x: 6, y: 4 }), 'L' + lv + ': plant');
      let standing = null;
      const off = DD.Events.on('round:end', function () { if (standing === null) standing = !!barrelAt(6, 4); });
      const g0 = gold(), h0 = s.hype;
      DD.Combat.endTurn();
      off();
      t.ok(!barrelAt(6, 4) && s.round === 2, 'L' + lv + ': nobody popped it, and it blew up at the end of round 1');
      t.eq(14 - (g.dead ? 0 : g.hp), Math.min(14, L.boom), 'L' + lv + ': the foe takes the blast');
      t.eq(14 - (g2.dead ? 0 : g2.hp), Math.min(14, L.boom), 'L' + lv + ': and so does its neighbour');
      const kills = [g, g2].filter(function (u) { return u.dead; }).length;
      t.eq(gold() - g0, L.gold || 0, 'L' + lv + ': kickbacks only (a fuse kill is Buga\'s own: no credit)');
      t.eq(s.hype - h0, 20 * kills, 'L' + lv + ': fuse kills are environmental kills (+20 Hype each)');
    });
    // charges: 2 per combat
    arena({ heroes: [buga([sk('buga_pork_barrel', 1)])], enemies: [{ id: 'test_brute', x: 6, y: 6 }] });
    let b = unit('buga');
    b.ap = 10;
    t.ok(use(b, 'buga_pork_barrel', { x: 4, y: 4 }), 'charge 1');
    slotOf(b, 'buga_pork_barrel').cd = 0;
    t.ok(use(b, 'buga_pork_barrel', { x: 3, y: 5 }), 'charge 2');
    slotOf(b, 'buga_pork_barrel').cd = 0;
    t.eq(can(b, 'buga_pork_barrel'), 'No charges left.', 'only 2 per combat');
    // no room on liquids, pits, objects or burning tiles
    arena({ heroes: [buga([sk('buga_pork_barrel', 1)])], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 4, y: 4, id: 'crate' }],
      surfaces: [{ x: 3, y: 5, id: 'fire', turns: 3 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 5) tl.t = 'water'; if (tl.x === 3 && tl.y === 3) tl.t = 'pit'; } });
    b = unit('buga');
    t.ok([[4, 4], [3, 5], [4, 5], [3, 3]].every(function (p) { return !valid(b, 'buga_pork_barrel', { x: p[0], y: p[1] }); }), 'not on a crate, fire, water or a pit');
    // an ally pops it: the ally's kill, so Buga takes the credit; the smasher eats the blast too
    arena({ heroes: [buga([]), { id: 'test_cleric', x: 5, y: 6 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }],
      objects: [{ x: 5, y: 5, id: 'buga_pork_barrel', data: { dmg: 8, fuse: 1 } }] });
    const cl = unit('test_cleric');
    DD.Grid.tile(5, 5).obj.data.owner = unit('buga').id;
    at(5, 4).hp = 8;
    t.ok(toTurn(cl), 'the cleric\'s turn');
    const smash = DD.Combat.interactions(cl).filter(function (o) { return o.kind === 'smash' && o.x === 5 && o.y === 5; })[0];
    t.ok(!!smash && smash.ap === 1, 'an adjacent hero is offered "Smash" on the barrel (1 AP)');
    const g0 = gold(), chp = cl.hp;
    t.ok(smash && DD.Combat.interact(cl, 5, 5), 'smashed');
    t.ok(!at(5, 4) && at(6, 5).hp === 6, 'the blast kills the grunt north (8 HP) and hits the one east for 8');
    t.eq(chp - cl.hp, 8, 'the smasher eats the blast too (8)');
    t.eq(gold() - g0, 2, 'the cleric\'s kill: Buga takes the credit (+2)');
    // chain reactions, fire, AutoPlay hints
    arena({ heroes: [buga([]), { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }],
      objects: [{ x: 6, y: 4, id: 'buga_pork_barrel', data: { dmg: 8 } }, { x: 7, y: 4, id: 'buga_pork_barrel', data: { dmg: 8 } }] });
    const gr = at(5, 4);
    DD.Act.push(unit('test_knight'), gr, { x: 1, y: 0 }, 2);
    t.ok(!barrelAt(6, 4) && !barrelAt(7, 4), 'a shove into the barrel pops it, and the blast chains to the next one');
    t.ok(gr.dead || gr.hp <= 14 - 3 - 8, 'the shoved grunt eats bump + blast');
    arena({ heroes: [buga([])], enemies: [{ id: 'test_grunt', x: 6, y: 5 }], objects: [{ x: 6, y: 4, id: 'buga_pork_barrel', data: { dmg: 8 } }] });
    DD.Act.applyElement(6, 4, 'fire', at(6, 5));
    t.ok(!barrelAt(6, 4) && at(6, 5).hp === 6, 'fire sets it off (8 to the grunt next to it)');
    arena({ heroes: [buga([]), { id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }], objects: [{ x: 5, y: 5, id: 'buga_pork_barrel', data: { dmg: 8 } }] });
    const def = DD.getObject('buga_pork_barrel');
    b = unit('buga');
    t.eq(def.autoplay(b, DD.Grid.tile(5, 5).obj, DD.Grid.tile(5, 5)), 8, 'AutoPlay pop hint: worth 8 with one foe next to it');
    DD.Act.teleport(unit('test_knight'), 4, 5);
    t.eq(def.autoplay(b, DD.Grid.tile(5, 5).obj, DD.Grid.tile(5, 5)), 0, 'not worth it with an ally in the blast');
    arena({ heroes: [buga([sk('buga_pork_barrel', 2)])], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }] });
    b = unit('buga');
    const pv = DD.getSkill('buga_pork_barrel').autoplayValue(DD.Targeting.buildCtx(b, slotOf(b, 'buga_pork_barrel'), { x: 5, y: 5 }));
    t.ok(Math.abs(pv - 2 * 10 * 0.6) < 1e-9, 'AutoPlay plant value: 60% of the blast per foe next to the spot (' + pv + ')');
  });

  // ---- Crumb Trail ---------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: Crumb Trail (flammable Slow surface: grounded foes Slowed on their next turn)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      arena({ heroes: [buga([sk('buga_crumbs', lv)], 1, 4)], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 4, y: 5 }, { id: 'test_grunt', x: 8, y: 0 }] });
      const b = unit('buga'), g = at(4, 4), g2 = at(4, 5), far = at(8, 0);
      const L = lvl('buga_crumbs', lv);
      t.ok(use(b, 'buga_crumbs', { x: 4, y: 4 }), 'L' + lv + ': scatter');
      t.eq(crumbTiles().length, 4 * L.r + 1, 'L' + lv + ': ' + (4 * L.r + 1) + ' crumb tiles');
      t.ok(crumbTiles().every(function (tl) { return tl.surface.turns === L.turns; }), 'L' + lv + ': for ' + L.turns + ' rounds');
      t.ok(DD.skillDesc(DD.getSkill('buga_crumbs'), lv, null).indexOf('for ' + L.turns + ' rounds') >= 0, 'L' + lv + ': the tooltip states the rounds');
      t.ok(st(g, 'slow') && st(g2, 'slow') && !st(far, 'slow'), 'L' + lv + ': the foes on the crumbs are Slowed');
      t.eq(DD.Combat.effectiveMov(g), 1, 'L' + lv + ': −2 move (3 → 1) on its next turn');
      t.eq(b.ap, 2, 'L' + lv + ': 1 AP');
      for (let r = 1; r < L.turns; r++) DD.Combat.endRound();
      t.eq(crumbTiles().length, 4 * L.r + 1, 'L' + lv + ': still there in round ' + L.turns);
      t.ok(st(g, 'slow'), 'L' + lv + ': a foe that keeps standing on them stays Slowed');
      DD.Combat.endRound();
      t.eq(crumbTiles().length, 0, 'L' + lv + ': swept up after ' + L.turns + ' rounds');
    });
    // the Slow lasts its next turn: a foe that leaves the crumbs walks at full speed again after that turn
    arena({ heroes: [buga([sk('buga_crumbs', 1)], 1, 4)], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    let g = at(4, 4);
    use(unit('buga'), 'buga_crumbs', { x: 4, y: 4 });
    DD.Act.teleport(g, 7, 7);
    let movOnTurn = -1;
    const off = DD.Events.on('turn:start', function (e) { if (e.unit === g && movOnTurn < 0) movOnTurn = DD.Combat.effectiveMov(g); });
    DD.Combat.endTurn();
    off();
    t.eq(movOnTurn, 1, 'Slowed on its turn');
    t.ok(!st(g, 'slow') && DD.Combat.effectiveMov(g) === 3, 'off the crumbs, the Slow ended with that turn');
    // walking in slows; fire races along the trail; water washes it away; never on liquids or other surfaces; flyers never
    let s = arena({ heroes: [buga([sk('buga_crumbs', 3)], 1, 4)], enemies: [{ id: 'test_grunt', x: 7, y: 7 }, { id: 'test_grunt', x: 4, y: 3 }],
      terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'water'; }, surfaces: [{ x: 4, y: 2, id: 'oil', turns: 5 }] });
    const fly = at(4, 3);
    fly.flags.flying = true;
    t.ok(use(unit('buga'), 'buga_crumbs', { x: 4, y: 4 }), 'a 9-tile cross');
    t.ok(!DD.Grid.tile(6, 4).surface, 'no crumbs on water');
    t.eq(DD.Grid.tile(4, 2).surface.id, 'oil', 'an existing surface is left alone');
    t.ok(!st(fly, 'slow'), 'a flyer hovering over the crumbs is not Slowed');
    g = at(7, 7);
    DD.Act.moveAlong(g, [{ x: 7, y: 6 }, { x: 7, y: 5 }, { x: 7, y: 4 }, { x: 6, y: 4 }, { x: 5, y: 4 }]);
    t.ok(st(g, 'slow'), 'walking into crumbs: Slowed');
    DD.Act.applyElement(3, 4, 'fire', unit('buga'));
    const burning = s.grid.tiles.filter(function (tl) { return tl.surface && tl.surface.id === 'fire'; }).length;
    t.ok(burning >= 6, 'fire races along the crumbs (' + burning + ' tiles burning)');
    arena({ heroes: [buga([sk('buga_crumbs', 1)], 1, 4)], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    use(unit('buga'), 'buga_crumbs', { x: 4, y: 4 });
    DD.Act.applyElement(4, 4, 'water', null);
    t.ok(!DD.Grid.tile(4, 4).surface, 'water washes crumbs away');
  });

  // ---- combos with other heroes ---------------------------------------------------------------------------------------------
  T.suite('hero_buga: combos with other heroes (Butter Up a big skill, crumbs + fire, Red Tape into a cleave, shove into a barrel)', function (t) {
    // Butter Up → the mage's Fire Fixture deals +50% to every foe it hits
    const dmg = [false, true].map(function (buttered) {
      arena({ heroes: [buga([sk('buga_butter_up', 1)], 1, 4), { id: 'test_mage', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 5, y: 5 }, { id: 'test_grunt', x: 5, y: 6 }] });
      if (buttered) use(unit('buga'), 'buga_butter_up', unit('test_mage'));
      toTurn(unit('test_mage'));
      use(unit('test_mage'), 'test_fireball', { x: 5, y: 5 });
      return 28 - at(5, 5).hp - at(5, 6).hp;
    });
    t.ok(dmg[1] > dmg[0] && dmg[1] >= Math.round(dmg[0] * 1.4), 'Butter Up + the mage\'s AoE: ' + dmg[0] + ' → ' + dmg[1] + ' total');
    // Crumb Trail → the mage's fire turns the whole trail into a fire field under the foes
    arena({ heroes: [buga([sk('buga_crumbs', 2)], 1, 4), { id: 'test_mage', x: 1, y: 7 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }, { id: 'test_grunt', x: 6, y: 4 }] });
    use(unit('buga'), 'buga_crumbs', { x: 4, y: 4 });
    toTurn(unit('test_mage'));
    use(unit('test_mage'), 'test_fireball', { x: 4, y: 6 });
    const fires = DD.Combat.state.grid.tiles.filter(function (tl) { return tl.surface && tl.surface.id === 'fire'; });
    t.ok(fires.length >= 9 && [[6, 4], [4, 2], [2, 4]].every(function (p) { const s = DD.Grid.tile(p[0], p[1]).surface; return s && s.id === 'fire'; }),
      'one fireball at the trail\'s end sets all of it ablaze (' + fires.length + ' tiles), out of the fireball\'s own reach');
    t.ok(st(at(6, 4), 'burn'), 'the grunt at the far end catches fire');
    // Red Tape → pull a foe into the row in front of the knight, Rooted there, and one cleave hits both grunts
    arena({ heroes: [buga([sk('buga_red_tape', 1)], 2, 4), { id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 6, y: 4 }] });
    const pulled = at(6, 4), other = at(4, 3);
    t.ok(use(unit('buga'), 'buga_red_tape', pulled), 'Red Tape on the far grunt');
    t.ok(pulled.x === 4 && pulled.y === 4 && st(pulled, 'root'), 'pulled to (4,4), next to its friend in front of the knight, and Rooted');
    toTurn(unit('test_knight'));
    t.ok(use(unit('test_knight'), 'test_cleave', { x: 4, y: 4 }), 'the knight cleaves the 3 tiles in front of him');
    t.ok(pulled.hp === 10 && other.hp === 10, 'one swing, both grunts (4 each)');
    // a shove into a lit Pork Barrel: the knight's kill, so the gold is Buga's
    arena({ heroes: [buga([sk('buga_pork_barrel', 1)], 3, 4), { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    t.ok(use(unit('buga'), 'buga_pork_barrel', { x: 7, y: 4 }), 'Buga plants a barrel behind the grunt');
    const shoved = at(5, 4);
    shoved.hp = 9;
    toTurn(unit('test_knight'));
    const g0 = gold();
    t.ok(use(unit('test_knight'), 'test_shield_bash', { x: 5, y: 4 }), 'the knight bashes the grunt into the barrel');
    t.ok(!barrelAt(7, 4) && shoved.dead, 'bash 4 + bump 3 + blast 8: the grunt is gone, so is the barrel');
    t.eq(gold() - g0, 2, 'the knight\'s kill, Buga\'s credit (+2)');
  });

  // ---- items -----------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: items (Pen marks, Chain of Office, Re-Election Toaster)', function (t) {
    arena({ heroes: [buga([], 2, 4, { items: ['buga_golden_pen'] }), { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    let b = unit('buga');
    t.ok(b.dmgBonus >= 0.1 - 1e-9, 'Pen: +10% damage');
    const g = at(5, 4);
    t.ok(use(b, 'buga_pamphlet', g), 'pamphlet');
    t.eq(g.hp, 10, 'Pen: the pamphlet still deals 4 (4.4 rounds down)');
    t.ok(st(g, 'marked') && st(g, 'marked').stacks === 2, 'Pen: the target is Marked (2)');
    toTurn(unit('test_knight'));
    use(unit('test_knight'), 'test_slash', g);
    t.eq(g.hp, 3, 'Pen: the knight\'s next hit deals 5 + 2');
    t.ok(!st(g, 'marked'), 'Pen: Mark used up');
    let s = arena({ heroes: [buga([], 2, 4, { items: ['buga_chain_of_office'] }), { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    t.eq(s.hype, 10, 'Chain: +10 Hype at combat start');
    const g0 = gold();
    DD.Act.damage(unit('test_knight'), at(5, 4), 99);
    t.eq(gold() - g0, 3, 'Chain: the credit pays 3 gold');
    s = arena({ heroes: [buga([], 2, 4, { items: ['buga_toaster'] }), { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    b = unit('buga');
    t.eq(b.maxHp, 24 + 4 * 2 + 6, 'Toaster: +6 max HP (32 at level 3)');
    t.eq(b.armor, 1, 'Toaster: +1 armor');
    t.eq(b.block, 0, 'Toaster: no starting Block (v2)');
    DD.Act.damage(at(3, 4), b, 999);
    t.ok(!b.downed && b.hp === Math.round(b.maxHp * 0.5), 'Toaster: DING! back up at 50% HP (' + b.hp + '/' + b.maxHp + ')');
    DD.Act.damage(at(3, 4), b, 999);
    t.ok(b.downed, 'Toaster: only once per combat');
  });

  // ---- v2 edge cases -----------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: v2 edge cases (whose turn, stunned, silenced, sheep, charmed, AP, empty targets)', function (t) {
    const kit = POOL.map(function (id) { return sk(id, 3); });
    function fresh() {
      return arena({ heroes: [buga(kit.slice(0, 4), 2, 4), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 2, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_archer', x: 6, y: 2 }] });
    }
    fresh();
    let b = unit('buga');
    b.skills = POOL.map(function (id) { return DD.Act.makeSlot(id, 3); });
    DD.Combat.endTurn();
    t.eq(can(b, 'buga_delegate'), 'Not Mayor Buga\'s turn.', 'only on his own turn');
    toTurn(b);
    DD.Act.addStatus(b, 'silenced', { turns: 1 });
    t.ok(POOL.every(function (id) { return DD.getSkill(id).kind !== 'spell'; }), 'no spell-kind skills in the kit');
    t.ok(can(b, 'buga_delegate') === true && DD.Combat.canUse(b, b.basic) === true, 'silenced: politicians cannot be silenced');
    DD.Act.removeStatus(b, 'silenced');
    DD.Act.addStatus(b, 'sheep', { turns: 1 });
    t.ok(/Baa/.test(can(b, 'buga_photo_op')), 'sheep: no skills');
    DD.Act.removeStatus(b, 'sheep');
    b.ap = 1;
    t.eq(can(b, 'buga_pork_barrel'), 'Not enough AP.', '2-AP skill with 1 AP');
    b.ap = 0;
    t.ok(can(b, 'buga_promise') === true, '0-AP Campaign Promise works with 0 AP');
    // stunned on his own turn: he loses his NEXT turn (it passes by itself)
    fresh();
    b = unit('buga');
    DD.Act.addStatus(b, 'stun', { turns: 1 });
    t.eq(can(b, 'buga_delegate'), 'Stunned!', 'stunned: no skills');
    DD.Combat.endRound();
    t.ok(DD.Combat.state.round === 2 && cur() === unit('test_knight') && b.ap === 0, 'round 2: his turn passed by itself, the knight is up');
    DD.Combat.endRound();
    t.ok(cur() === b && b.ap === 3 && !st(b, 'stun'), 'round 3: back in business');
    // charmed by the grunt: his own pamphlet does nothing to the charmer, but delegating still works (loophole!)
    fresh();
    b = unit('buga');
    b.skills = [DD.Act.makeSlot('buga_delegate', 2)];
    const g = at(5, 4);
    DD.Act.addStatus(b, 'charmed', { turns: 1 }, g);
    use(b, 'buga_pamphlet', g);
    t.eq(g.hp, 14, 'charmed Buga cannot hurt the charmer himself');
    t.ok(use(b, 'buga_delegate', g), 'but he can delegate');
    t.eq(g.hp, 9, 'the knight hits the charmer for him');
    DD.Combat.endRound();
    t.eq(b.ap, 2, 'Charmed through his next turn: 3 − 1 AP');
    // execute with a null target / empty tile / downed user never throws (swallowed errors fail this suite)
    fresh();
    b = unit('buga');
    POOL.concat(['buga_pamphlet', 'buga_toast_of_the_town']).forEach(function (id) {
      DD.Combat._action(function () {
        DD.Combat.resolveSkill(b, DD.Act.makeSlot(id, 3), { x: 0, y: 8 }, { pay: false });
        DD.Combat.resolveSkill(b, DD.Act.makeSlot(id, 2), null, { pay: false });
      });
    });
    t.ok(true, 'every skill tolerates empty and null targets');
    DD.Act.kill(b, null);
    POOL.forEach(function (id) {
      DD.Combat._action(function () { DD.Combat.resolveSkill(b, DD.Act.makeSlot(id, 1), { x: 5, y: 4 }, { pay: false }); });
    });
    t.ok(b.downed, 'a downed Buga running skills (scripted) does not crash');
    t.ok(T.contentHelpers ? T.contentHelpers.sanity(t, 'edge cases') : true, 'state sane');
  });

  // ---- previews ---------------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: previews predict reality exactly (incl. kills, credit, bumps, swings)', function (t) {
    const targets = {
      buga_pamphlet: { x: 5, y: 4 }, buga_delegate: { x: 5, y: 4 }, buga_fine: { x: 5, y: 4 }, buga_promise: { x: 4, y: 4 },
      buga_human_shield: { x: 4, y: 4 }, buga_bribe: { x: 5, y: 4 }, buga_butter_up: { x: 4, y: 4 }, buga_red_tape: { x: 5, y: 4 },
      buga_photo_op: { x: 2, y: 4 }, buga_pork_barrel: { x: 5, y: 5 }, buga_crumbs: { x: 5, y: 5 }, buga_toast_of_the_town: { x: 5, y: 4 },
    };
    let checked = 0;
    Object.keys(targets).forEach(function (id) {
      const def = DD.getSkill(id);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        const s = arena({ heroes: [buga([sk(id, lv)], 2, 4), { id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: 2, y: 6 }],
          enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 5, y: 6 }, { id: 'test_archer', x: 6, y: 2 }] });
        at(5, 4).hp = 5;
        s.hype = 100;
        const b = unit('buga');
        const sl = slotOf(b, id);
        const tg = targets[id];
        const fp = T.contentHelpers && T.contentHelpers.fingerprint ? T.contentHelpers.fingerprint(s) : '';
        const prev = DD.Combat.preview(b, sl, tg.x, tg.y);
        const fp2 = T.contentHelpers && T.contentHelpers.fingerprint ? T.contentHelpers.fingerprint(s) : '';
        t.eq(fp2, fp, id + ' L' + lv + ': preview leaves the fight untouched');
        t.ok(!prev.uncertain, id + ' L' + lv + ': no dice involved, so the preview is exact');
        const before = {};
        s.units.forEach(function (u) { before[u.id] = { hp: u.hp, dead: u.dead, downed: u.downed }; });
        const hype0 = s.hype;
        t.ok(DD.Combat.useSkill(b, sl, tg.x, tg.y), id + ' L' + lv + ': used');
        s.units.forEach(function (u) {
          const bf = before[u.id];
          if (!bf || bf.dead) return;
          const e = prev.perUnit[u.id];
          const said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
          t.eq(bf.hp - u.hp, said, id + ' L' + lv + ': ' + u.name + ' HP change as previewed');
          t.eq((u.dead && !bf.dead) || (u.downed && !bf.downed), !!(e && e.lethal), id + ' L' + lv + ': ' + u.name + ' lethal as previewed');
        });
        t.eq(s.hype - hype0, prev.hype, id + ' L' + lv + ': Hype as previewed');
        checked++;
      }
    });
    t.log('previews checked: ' + checked);
  });

  // ---- ranges: the "within N tiles" of every tooltip at every level is exactly the targeting range --------------------
  T.suite('hero_buga: every stated range is the real range (all levels)', function (t) {
    // [skill id, what it targets, regex that reads the max range out of the tooltip]
    const cases = [
      ['buga_pamphlet', 'foe', /within (\d+) tiles/], ['buga_delegate', 'foe', /within (\d+) tiles/], ['buga_fine', 'foe', /within (\d+) tiles/],
      ['buga_promise', 'ally', /within (\d+) tiles/], ['buga_human_shield', 'ally', /within (\d+) tiles/], ['buga_bribe', 'foe', /within (\d+) tiles/],
      ['buga_butter_up', 'ally', /within (\d+) tiles/], ['buga_red_tape', 'foe', /2-(\d+) tiles away/], ['buga_pork_barrel', 'tile', /within (\d+) tiles/],
      ['buga_crumbs', 'tile', /cross within (\d+)/], ['buga_toast_of_the_town', 'foe', /within (\d+) tiles/],
    ];
    cases.forEach(function (c) {
      const def = DD.getSkill(c[0]);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        const m = c[2].exec(DD.skillDesc(def, lv, null));
        t.ok(!!m, c[0] + ' L' + lv + ': the tooltip states a range');
        if (!m) continue;
        const r = +m[1];
        // Buga at (0,4) on an open 12x9 floor; the target r and r+1 tiles east (an ally beside a foe for the swings)
        [r, r + 1].forEach(function (d) {
          const heroes = [buga([sk(c[0], lv)], 0, 4)];
          const enemies = [{ id: 'test_grunt', x: 11, y: 0 }];
          if (c[1] === 'ally') heroes.push({ id: 'test_knight', x: d, y: 4 });
          if (c[1] === 'foe') enemies.push({ id: 'test_grunt', x: d, y: 4 });
          if (c[0] === 'buga_delegate' || c[0] === 'buga_toast_of_the_town') heroes.push({ id: 'test_knight', x: d, y: 5 });
          const s = arena({ w: 12, h: 9, heroes: heroes, enemies: enemies });
          s.hype = 100;
          t.eq(valid(unit('buga'), c[0], { x: d, y: 4 }), d === r, c[0] + ' L' + lv + ': ' + (d === r ? 'reaches' : 'not') + ' ' + d + ' tiles (tooltip: ' + r + ')');
        });
      }
    });
    arena({ heroes: [buga([sk('buga_red_tape', 1)], 0, 4)], enemies: [{ id: 'test_grunt', x: 1, y: 4 }, { id: 'test_grunt', x: 2, y: 4 }] });
    t.ok(!valid(unit('buga'), 'buga_red_tape', { x: 1, y: 4 }) && valid(unit('buga'), 'buga_red_tape', { x: 2, y: 4 }), 'Red Tape: 2 tiles is the minimum');
  });

  // ---- AutoPlay -----------------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: AutoPlay v2 battles (fixture party, acts 1-3, levels 1/3/5, skills used)', function (t) {
    const kits = {
      1: { 1: ['buga_delegate', 'buga_fine'], 2: ['buga_delegate', 'buga_fine'], 3: ['buga_delegate', 'buga_fine'] },
      3: { 1: ['buga_delegate', 'buga_fine', 'buga_promise', 'buga_red_tape'], 2: ['buga_delegate', 'buga_fine', 'buga_butter_up', 'buga_human_shield'],
        3: ['buga_delegate', 'buga_fine', 'buga_bribe', 'buga_crumbs'] },
      5: { 1: ['buga_delegate', 'buga_pork_barrel', 'buga_crumbs', 'buga_photo_op'], 2: ['buga_delegate', 'buga_bribe', 'buga_butter_up', 'buga_red_tape'],
        3: ['buga_fine', 'buga_promise', 'buga_human_shield', 'buga_photo_op'] },
    };
    const used = {};
    let battles = 0, wins = 0;
    [[1, 'normal'], [2, 'normal'], [3, 'normal'], [1, 'elite'], [2, 'elite'], [3, 'elite']].forEach(function (fight) {
      const act = fight[0], kind = fight[1];
      const kitAct = kind === 'elite' ? (act % 3) + 1 : act;   // elites get the other kits of their level
      [1, 3, 5].forEach(function (level) {
        const tag = 'act ' + act + ' ' + kind + ' L' + level;
        const enc = DD.getEncounter('test_a' + act + '_' + kind);
        if (!enc) { t.fail('fixture encounter test_a' + act + '_' + kind + ' missing'); return; }
        const sl = level >= 5 ? 2 : 1;
        const party = [
          DD.Combat.makeRunHero({ id: 'buga', level: level, skills: kits[level][kitAct].map(function (id) { return { id: id, level: sl }; }) }),
          DD.Combat.makeRunHero({ id: 'test_knight', level: level }), DD.Combat.makeRunHero({ id: 'test_cleric', level: level }),
          DD.Combat.makeRunHero({ id: 'test_mage', level: level }),
        ];
        const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('hb:' + tag + ':' + t.seed), difficulty: 'normal', act: act });
        const s = DD.Combat.start(setup, { seed: 'hb' + tag + t.seed, headless: true, difficulty: 'normal', gold: 60, kind: kind });
        t.ok(s.phase === 'deploy' || !!s.order, tag + ': the fight opens (deployment or rolled)');
        const mine = {};
        DD.Act.addRule({ id: 'hb_usage', name: 'Usage counter', hooks: { onSkillUsed: function (ctx) {
          if (DD.Act.simulating || !ctx || !ctx.user || ctx.user.defId !== 'buga') return;
          mine[ctx.skill.id] = (mine[ctx.skill.id] || 0) + 1;
        } } });
        const res = DD.AutoPlay.runBattle(30);
        battles++;
        if (res.result === 'victory') wins++;
        t.ok(!!s.order && s.initMode === 'roll', tag + ': initiative was rolled');
        const n = Object.keys(mine).reduce(function (a, k) { return a + mine[k]; }, 0);
        Object.keys(mine).forEach(function (k) { used[k] = (used[k] || 0) + mine[k]; });
        t.ok(n > 0 || DD.Combat.heroes().filter(function (u) { return u.defId === 'buga'; })[0].downed, tag + ': Buga acted (' + JSON.stringify(mine) + ')');
        t.ok(!!res.result || res.timeout, tag + ': battle resolved');
        t.ok(T.contentHelpers ? T.contentHelpers.sanity(t, 'autoplay ' + tag) : true, tag + ': state sane');
        t.log(tag + ': ' + res.result + ' in ' + res.rounds + ' rounds, gold ' + s.sandboxGold + ', Buga used ' + JSON.stringify(mine));
      });
    });
    const distinct = Object.keys(used).filter(function (k) { return POOL.indexOf(k) >= 0; });
    t.log('battles ' + battles + ', wins ' + wins + ', usage ' + JSON.stringify(used));
    t.ok(distinct.length >= 6, 'AutoPlay used ' + distinct.length + ' different pool skills: ' + distinct.join(', '));
    t.ok((used.buga_delegate || 0) >= 3, 'Delegate is a staple (' + (used.buga_delegate || 0) + ' uses)');
  });

  // ---- painters --------------------------------------------------------------------------------------------------------------------
  T.suite('hero_buga: sprite, portrait, pork barrel and crumbs painters', function (t) {
    if (!DD.Sprites) { t.skip('no DD.Sprites'); return; }
    const h = DD.getHero('buga');
    const c = document.createElement('canvas');
    c.width = 120; c.height = 120;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    function inked() {
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
      return n;
    }
    [['idle'], ['attack', 0.5], ['cast'], ['hurt'], ['downed']].forEach(function (p) {
      [1, -1].forEach(function (facing) {
        ctx.clearRect(0, 0, 120, 120);
        DD.Sprites.draw(ctx, h.sprite, 60, 100, 2, { t: 1.3, pose: p[0], poseT: p[1], facing: facing, walk: 0.3, statuses: new Set(['stun', 'burn']) });
        t.ok(inked() > 800, 'pose ' + p[0] + ' facing ' + facing + ' paints the toast');
      });
    });
    const m = DD.Sprites.metrics(h.sprite);
    t.ok(m.height >= 38 && m.height <= 48, 'about 40 px tall at zoom 1 (' + m.height + ')');
    const pc = DD.Sprites.portrait('buga', 64);
    const pd = pc.getContext('2d').getImageData(0, 0, 64, 64).data;
    let face = 0;
    for (let i = 0; i < pd.length; i += 4) if (pd[i] > 180 && pd[i + 1] > 120 && pd[i + 2] < 140) face++;
    t.ok(face > 150, 'portrait shows a lot of golden toast (' + face + ' px)');
    if (DD.Render && DD.Render.drawObjectAt) {
      ctx.clearRect(0, 0, 120, 120);
      DD.Render.drawObjectAt(ctx, { id: 'buga_pork_barrel', hp: 1, maxHp: 1, data: { dmg: 8 } }, 60, 90, 1.5, {});
      t.ok(inked() > 300, 'the pork barrel paints');
    }
    if (DD.Iso && DD.Iso.painter) {
      ctx.clearRect(0, 0, 120, 120);
      ctx.save(); ctx.translate(60, 60);
      DD.getSurface('buga_crumbs').draw(DD.Iso.painter(ctx, { tile: { x: 3, y: 5 } }), { id: 'buga_crumbs', turns: 3, data: {} }, 0);
      ctx.restore();
      t.ok(inked() > 100, 'crumbs paint');
    }
  });
})();
