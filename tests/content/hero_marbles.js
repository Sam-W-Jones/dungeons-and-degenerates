/* Dungeons and Degenerates — tests/content/hero_marbles.js
 * Suites "hero_marbles: …" for js/data/heroes/marbles.js (Professor Marbles, v2 kit): registration and the simplicity
 * rules, every skill at every level in sandbox fights (desc == effect: damage vs armor-free fixture foes, statuses and
 * how many of their owner's turns they last, displacement, costs, cooldowns, charges), the Loose Marbles surface, the
 * Absent-Minded Mastery passive, the signature, the hero items, previews, v2 edge cases (whose turn, stunned / sheep /
 * silenced / charmed user, dying targets, pits / lava / water / edges, wind-ups interrupted) and AutoPlay v2 battles
 * with the fixture party. Needs tests/fixtures.js (test_ heroes / enemies / encounters).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const HERO = 'marbles';
  const POOL = ['mar_whack', 'mar_scatter', 'mar_punch', 'mar_flurry', 'mar_backinmyday', 'mar_lecture', 'mar_carrot', 'mar_leap',
    'mar_hook', 'mar_waxon'];
  const ALL = POOL.concat(['mar_jab', 'mar_signature']);

  // ---- helpers ------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function ready() { return !!DD.getHero(HERO) && !!DD.getEnemy('test_grunt') && !!DD.getHero('test_knight'); }
  /**
   * Sandbox fight that never ends by itself: Marbles (cfg.me) + allies + enemies, heroes first in initiative (no dice),
   * so it is Marbles' turn in round 1. Enemies never act unless cfg.ai (then they take every turn from round 1).
   */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = [Object.assign({ id: HERO, x: 1, y: 1, level: 3 }, cfg.me || {})].concat(cfg.allies || []);
    return DD.Combat.sandbox({
      w: cfg.w || 8, h: cfg.h || 8, seed: cfg.seed || 7, enemyAi: cfg.ai ? undefined : false,
      initiative: cfg.initiative, order: cfg.order,
      objective: { type: 'custom', text: 'Marbles test' }, encounter: { id: 'mar_test_arena', checkObjective: function () { return null; } },
      heroes: heroes, enemies: cfg.enemies || [], objects: cfg.objects, surfaces: cfg.surfaces, terrain: cfg.terrain, gold: cfg.gold,
    });
  }
  function me() { return DD.Combat.heroes().filter(function (u) { return u.defId === HERO; })[0]; }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function round() { return DD.Combat.state.round; }
  function mine() { return DD.Combat.current() === me(); }
  /** Forget whatever the passive rolled this turn (cost assertions must not see a free skill). */
  function blank(u) { A().removeStatus(u, 'mar_remembered', { silent: true }); }
  /** Socket exactly one skill at a level (passive roll cleared). */
  function sock(u, id, level) { const sl = DD.Act.makeSlot(id, level || 1); u.skills = [sl]; blank(u); return sl; }
  function use(u, sl, x, y) { return DD.Combat.useSkill(u, sl, x, y); }
  function surf(x, y) { const tl = tile(x, y); return tl && tl.surface ? tl.surface.id : null; }
  function L(id, lv) { return DD.skillLevel(DD.getSkill(id), lv); }
  function desc(id, lv) { return DD.skillDesc(DD.getSkill(id), lv || 1, null); }
  function cost(u, id, lv) { return DD.Combat.costOf(u, DD.getSkill(id), lv || 1).ap; }
  function sane(t, label) {
    if (T.contentHelpers && T.contentHelpers.sanity) return T.contentHelpers.sanity(t, label);
    return true;
  }
  function guard(t) {
    if (!ready()) { t.skip('Professor Marbles or the test fixtures are not loaded'); return false; }
    return true;
  }
  function fp(s) { return T.contentHelpers && T.contentHelpers.fingerprint ? T.contentHelpers.fingerprint(s) : JSON.stringify(s.units.map(function (u) { return [u.x, u.y, u.hp, u.ap, u.statuses.length]; })); }
  let probes = 0;
  /** Run fn on every turn start of `unit` (after its start-of-turn hooks: rules fire last). Returns the off switch. */
  function onTurnOf(unit, fn) {
    const id = 'mar_probe_' + (++probes);
    A().addRule({ id: id, name: 'Probe', hooks: { onTurnStart: function (u) { if (u === unit) fn(u); } } });
    return function () { A().removeRule(id); };
  }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }

  // ---- registration ---------------------------------------------------------------------------------------
  T.suite('hero_marbles: registration, numbers and barks', function (t) {
    if (!guard(t)) return;
    const h = DD.getHero(HERO);
    t.eq(h.name, 'Professor Marbles', 'name');
    t.eq(h.unlock, null, 'available from the start (v2: every hero unlock: null)');
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov >= 3 && h.stats.mov <= 5, 'stats in DESIGN ranges');
    t.eq(h.stats.init, 2, 'initiative modifier +2 (stats.init)');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth +3-5 HP');
    t.ok(h.flags.hop === true, 'hop flag (climbs 2 levels)');
    ['epithet', 'race', 'cls', 'role', 'blurb', 'color'].forEach(function (k) { t.ok(typeof h[k] === 'string' && h[k].length > 2, 'hero.' + k); });
    t.ok(h.complexity >= 1 && h.complexity <= 3, 'complexity');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['mar_whack', 'mar_scatter']), 'starting skills');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'skill pool (10)');
    t.ok(h.skillPool.length >= 9 && h.skillPool.length <= 10, 'pool of 9-10 (DESIGN v2: 8-10; registry: 9-11)');
    ['mar_thumper'].forEach(function (id) { t.ok(!DD.getSkill(id), 'cut from the v2 kit: ' + id); });
    t.ok(!DD.getStatus('mar_forgot'), 'no "Senior Moment" status any more (the passive is one rule)');
    const basic = DD.getSkill(h.basic), sig = DD.getSkill(h.signature);
    t.ok(basic && basic.ap === 1 && basic.levels[0].dmg >= 4 && basic.levels[0].dmg <= 6, 'basic: 1 AP, 4-6 damage');
    t.ok(sig && sig.hype === 100, 'signature costs 100 Hype');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic/signature not in the pool');
    const kinds = {}, aps = {};
    ALL.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && id.indexOf('mar_') === 0 && s.owner === HERO, id + ': registered, prefixed, owned');
      if (!s) return;
      kinds[s.kind] = 1;
      t.ok(typeof s.icon === 'string' && s.icon.length >= 1 && s.icon.length <= 4, id + ': one emoji icon');
      t.ok(typeof s.flavor === 'string' && s.flavor.length > 5 && s.flavor.length <= 120, id + ': flavor ≤ 120 chars');
      t.ok(s.name.length <= 22, id + ': name fits the action bar (' + s.name + ')');
      if (POOL.indexOf(id) >= 0) t.eq(s.levels.length, 3, id + ': 3 levels');
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = DD.skillDesc(s, lv, null);
        t.ok(d.length > 10 && !/undefined|NaN|\[object/.test(d), id + ' L' + lv + ': desc with user null: ' + d);
        // DESIGN §6 Simplicity: one verb (+ at most one rider), reads in one breath, no if/else chains, no v1 terms
        t.ok(words(d) <= 25, id + ' L' + lv + ': desc reads in one breath (' + words(d) + ' words): ' + d);
        t.ok(!/\b(if|unless|otherwise|instead|then also)\b/i.test(d), id + ' L' + lv + ': no if/else clauses: ' + d);
        t.ok(!/telegraph|intent|guard|planning|\bXP\b/i.test(d + ' ' + s.flavor), id + ' L' + lv + ': no v1 terms (telegraph, intent, Guard, XP)');
        aps[DD.resolve(s.ap, s.levels[lv - 1], null, 1)] = 1;
      }
    });
    t.ok(aps[1] && aps[2] && aps[3], 'AP costs mix 1, 2 and 3');
    t.ok(kinds.attack && kinds.buff && kinds.heal && kinds.move && kinds.spell && kinds.utility, 'kinds: attack/buff/heal/move/spell/utility');
    t.ok(h.skillPool.some(function (id) { return DD.getSkill(id).charges > 0; }), 'a skill with charges (Carrot Toss)');
    t.ok(h.skillPool.some(function (id) { return DD.resolve(DD.getSkill(id).cooldown, DD.getSkill(id).levels[0], null, 0) >= 3; }), 'a skill with a long cooldown');
    // v2 wording: control effects speak of the foe's next turn, not of telegraphs
    t.ok(/loses its next turn/.test(desc('mar_punch')) && /loses its next turn/.test(desc('mar_signature')), 'Stun descs: it loses its next turn');
    t.ok(/on their next turn they must attack him/.test(desc('mar_backinmyday')), 'Taunt desc: on their next turn they must attack him');
    t.ok(/Asleep for 2 turns/.test(desc('mar_lecture')), 'Lecture desc: Asleep for 2 turns');
    t.ok(/Vulnerable for their next turn/.test(desc('mar_scatter')), 'Scatter desc: Vulnerable for their next turn');
    t.ok(/Grounded foes/.test(desc('mar_scatter')), 'Scatter desc: grounded foes only (flyers never slip)');
    t.ok(/on its next turn/.test(desc('mar_waxon', 3)), 'Wax On III: the AP comes on its next turn (v2 banking)');
    // barks
    const KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature',
      'opportunity'];
    let all = '';
    KEYS.forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ': 4-6 lines (' + lines.length + ')');
      lines.forEach(function (b) { t.ok(typeof b === 'string' && b.length > 0 && b.length <= 70, 'bark ≤ 70 chars: ' + b); all += b + ' '; });
    });
    const named = ['Josiah', 'Zarathor', 'Ellaria', 'Marwyn', 'Sparrow', 'Syllamin', 'Slate', 'Buga', 'Kiri', 'Betty', 'Basanos',
      'Valdris', 'Hjalmar', 'Pebbles'].filter(function (n) { return all.indexOf(n) >= 0; });
    t.ok(named.length >= 10, 'barks mention other heroes (' + named.join(', ') + ')');
    ['Valdris', 'Hjalmar', 'Pebbles'].forEach(function (n) { t.ok(all.indexOf(n) >= 0, 'barks greet the new party member ' + n); });
    t.ok(!/telegraph|\bguard\b|\bXP\b/i.test(all + ' ' + h.blurb + ' ' + h.role + ' ' + h.passive.desc), 'no v1 mechanics in barks / blurb / role / passive');
    t.ok(/walks off/.test(h.blurb), 'blurb: he punishes foes that walk away (attacks of opportunity)');
    // pronouns (the user's list: Ellaria, Sparrow and Kiri are she; every other hero is he): the lines naming them use no
    // wrong pronoun
    KEYS.forEach(function (k) {
      (h.barks[k] || []).forEach(function (b) {
        if (/Kiri|Ellaria|Sparrow/.test(b)) t.ok(!/\b(he|him|his|himself)\b/i.test(b), 'pronouns: ' + b);
        if (/Betty|Basanos|Valdris|Hjalmar|Pebbles|Syllamin|Josiah|Zarathor|Marwyn|Slate|Buga|Corelos/.test(b)) t.ok(!/\b(she|her|hers|herself)\b/i.test(b), 'pronouns: ' + b);
      });
    });
    // passive, surface, statuses, items
    t.ok(h.passive && h.passive.name === 'Absent-Minded Mastery' && typeof h.passive.hooks.onTurnStart === 'function', 'passive with an onTurnStart hook');
    t.ok(words(h.passive.desc) <= 25 && !/forget|\+1 AP/i.test(h.passive.desc), 'passive: one clear rule (' + h.passive.desc + ')');
    const sf = DD.getSurface('mar_marbles');
    t.ok(sf && typeof sf.onEnter === 'function' && typeof sf.draw === 'function' && !sf.slide && !sf.hazard, 'mar_marbles surface: slip + painter (no slide, not an AI hazard)');
    t.ok(DD.getStatus('mar_remembered') && DD.getStatus('mar_remembered').type === 'buff', 'mar_remembered status');
    const items = Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k]; }).filter(function (it) { return it.hero === HERO; });
    t.eq(items.map(function (it) { return it.id; }).sort().join(','), 'mar_cane,mar_pills,mar_robes', 'three hero items');
    t.ok(items.some(function (it) { return it.rarity === 'rare'; }) && items.some(function (it) { return it.rarity === 'legendary'; }), 'a rare and a legendary item');
    items.forEach(function (it) {
      t.ok(!(it.stats && it.stats.block) && !(it.hooks && it.hooks.onCombatStart), it.id + ': no starting Block (v2)');
      t.ok(!/telegraph|guard|combat start/i.test(it.desc), it.id + ': v2 wording (' + it.desc + ')');
    });
    t.ok(typeof DD.Marbles === 'object' && typeof DD.Marbles.slip === 'function' && typeof DD.Marbles.scatter === 'function', 'DD.Marbles public helpers');
    if (DD.Sprites && DD.Sprites.portrait) {
      const p = t.tryRun('portrait', function () { return DD.Sprites.portrait(HERO, 64); });
      t.ok(p && p.width > 0, 'portrait renders');
      const m = DD.Sprites.metrics(HERO);
      t.ok(m && m.height >= 28 && m.height <= 48, 'sprite height ~40 px at zoom 1 (' + (m && m.height) + ')');
    }
    t.eq(DD.problems.filter(function (p) { return /marbles|mar_/.test(p) && /Sprite|unknown|duplicate|missing/.test(p); }).length, 0, 'no sprite / registry warnings');
  });

  // ---- basic + Walking Stick Whack ------------------------------------------------------------------------
  T.suite('hero_marbles: Doddering Jab and Walking Stick Whack', function (t) {
    if (!guard(t)) return;
    fight({ w: 10, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2 }] });
    let u = me(), g = at(2, 2);
    t.ok(mine() && round() === 1 && u.ap === 3, 'his turn, round 1, 3 AP');
    blank(u);
    const keys = [], mb0 = DD.Act.maybeBark;
    DD.Act.maybeBark = function (unit, key) { keys.push(key); return ''; };
    try { t.ok(use(u, u.basic, 2, 2), 'jab used'); } finally { DD.Act.maybeBark = mb0; }
    t.ok(keys.indexOf('opportunity') < 0, 'a jab on his own turn: no attack-of-opportunity bark');
    t.eq(g.hp, 9, 'jab: 5 damage');
    t.eq(u.ap, 2, 'jab: 1 AP');
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_whack', lv);
      fight({ w: 10, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2 }] });
      u = me(); g = at(2, 2);
      const sl = sock(u, 'mar_whack', lv);
      t.ok(desc('mar_whack', lv).indexOf(Lv.dmg + ' damage') >= 0 && desc('mar_whack', lv).indexOf('push it ' + Lv.push) >= 0, 'whack L' + lv + ': desc says ' + Lv.dmg + ' + push ' + Lv.push);
      t.eq(cost(u, 'mar_whack', lv), 1, 'whack L' + lv + ': 1 AP');
      t.ok(use(u, sl, 2, 2), 'whack L' + lv + ' used');
      t.eq(g.hp, 14 - Lv.dmg, 'whack L' + lv + ': ' + Lv.dmg + ' damage');
      t.eq(g.x, 2 + Lv.push, 'whack L' + lv + ': pushed ' + Lv.push);
      t.eq(sl.cd, 1, 'whack L' + lv + ': cooldown 1');
      t.eq(DD.Combat.canUse(u, sl), 'On cooldown (1).', 'whack L' + lv + ': not again this turn');
      DD.Combat.endTurn();
      t.ok(mine() && round() === 2, 'whack L' + lv + ': round 2, his turn again');
      t.eq(DD.Combat.canUse(u, sl), 'On cooldown (1).', 'whack L' + lv + ': still cooling down during his next turn');
      DD.Combat.endTurn();
      t.ok(round() === 3 && sl.cd === 0, 'whack L' + lv + ': off cooldown in round 3');
    });
    // foes only: allies, empty tiles and objects are not targets
    fight({ w: 10, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 1, y: 3 }], objects: [{ x: 1, y: 1, id: 'crate' }] });
    u = me();
    const wsl = sock(u, 'mar_whack', 1);
    t.eq(JSON.stringify(DD.Targeting.validTargets(u, wsl)), JSON.stringify([{ x: 1, y: 3 }]), 'whack: only the adjacent foe is a target');
    // map edge: a blocked push bumps for 3
    fight({ w: 6, h: 3, me: { x: 3, y: 1 }, enemies: [{ id: 'test_grunt', x: 4, y: 1 }] });
    u = me(); g = at(4, 1);
    use(u, sock(u, 'mar_whack', 1), 4, 1);
    t.ok(g.x === 5 && g.hp === 14 - 5 - 3, 'edge: moved 1, bumped for 3 (hp ' + g.hp + ')');
    // into another foe: both bump
    fight({ w: 8, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 2, y: 1 }, { id: 'test_grunt', x: 4, y: 1 }] });
    u = me(); g = at(2, 1);
    const g2 = at(4, 1);
    use(u, sock(u, 'mar_whack', 1), 2, 1);
    t.ok(g.x === 3 && g.hp === 14 - 5 - 3 && g2.hp === 14 - 3, 'pushed into a friend: both take the 3 bump');
    // pit: YEET (environmental kill, +20 Hype)
    fight({ w: 8, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 2, y: 1 }, { id: 'test_grunt', x: 7, y: 2 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 1) tl.t = 'pit'; } });
    u = me(); g = at(2, 1);
    const hype0 = DD.Combat.state.hype;
    use(u, sock(u, 'mar_whack', 1), 2, 1);
    t.ok(g.dead && DD.Combat.state.stats.envKills === 1 && DD.Combat.state.hype === hype0 + 20, 'pushed into a pit: yeeted, env kill, +20 Hype');
    // lava and water at the end of the push
    fight({ w: 8, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 2, y: 1 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 1) tl.t = 'lava'; } });
    u = me(); g = at(2, 1);
    use(u, sock(u, 'mar_whack', 1), 2, 1);
    t.ok(g.x === 4 && g.hp === 14 - 5 - 8 && has(g, 'burn'), 'pushed into lava: 8 fire + Burn');
    fight({ w: 8, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 2, y: 1 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 1) tl.t = 'water'; } });
    u = me(); g = at(2, 1);
    use(u, sock(u, 'mar_whack', 1), 2, 1);
    t.ok(g.x === 4 && has(g, 'wet'), 'pushed into water: Wet');
    // immovable elite: damage, no push
    fight({ w: 8, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_brute', x: 2, y: 1 }] });
    u = me(); g = at(2, 1);
    use(u, sock(u, 'mar_whack', 1), 2, 1);
    t.ok(g.x === 2 && g.hp === 50 - 4, 'immovable brute: 5 - 1 armor, stays put');
    // the whack kills: no push, no throw
    fight({ w: 8, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 2, y: 1 }, { id: 'test_grunt', x: 7, y: 2 }] });
    u = me(); g = at(2, 1);
    g.hp = 3;
    t.ok(use(u, sock(u, 'mar_whack', 1), 2, 1) && g.dead, 'whack kills: the push is skipped cleanly');
    t.ok(sane(t, 'whack'), 'state sane');
  });

  // ---- Marble Scatter + the Loose Marbles surface ------------------------------------------------------------
  T.suite('hero_marbles: Marble Scatter and Loose Marbles', function (t) {
    if (!guard(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_scatter', lv);
      fight({ w: 11, h: 11, me: { x: 5, y: 2 }, allies: [{ id: 'test_knight', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 5, y: 5 }, { id: 'test_grunt', x: 9, y: 9 }] });
      const u = me(), g = at(5, 5), k = hero('test_knight');
      const sl = sock(u, 'mar_scatter', lv);
      const area = DD.Targeting.area(u, DD.getSkill('mar_scatter'), lv, { x: 5, y: 5 });
      const n = Lv.shape === 'square' ? 9 : 5;
      t.eq(area.length, n, 'scatter L' + lv + ': ' + n + ' tiles');
      t.ok(desc('mar_scatter', lv).indexOf(Lv.turns + ' rounds') >= 0 && desc('mar_scatter', lv).indexOf(n === 9 ? '3x3' : '5-tile') >= 0, 'scatter L' + lv + ': desc says ' + n + ' tiles, ' + Lv.turns + ' rounds');
      t.ok(use(u, sl, 5, 5), 'scatter L' + lv + ' used');
      t.eq(u.ap, 2, 'scatter L' + lv + ': 1 AP');
      t.eq(sl.cd, 2, 'scatter L' + lv + ': cooldown 2');
      const tl = tile(5, 5);
      t.ok(tl.surface && tl.surface.id === 'mar_marbles' && tl.surface.turns === Lv.turns && tl.surface.data.src === u.id,
        'scatter L' + lv + ': marbles for ' + Lv.turns + ' rounds, credited');
      t.eq(area.filter(function (p) { return surf(p.x, p.y) === 'mar_marbles'; }).length, area.length, 'scatter L' + lv + ': every area tile has marbles');
      t.eq(surf(6, 6), n === 9 ? 'mar_marbles' : null, 'scatter L' + lv + ': corner tile only for the 3x3');
      t.ok(g.hp === 14 && has(g, 'vulnerable') && st(g, 'vulnerable').turns === 1 && st(g, 'vulnerable').source === u.id,
        'scatter L' + lv + ': the foe under it slips: Vulnerable for its next turn, no damage');
      t.ok(g.x === 5 && g.y === 5, 'scatter L' + lv + ': a foe slipping in place is not moved');
      t.ok(k.hp === k.maxHp && !has(k, 'vulnerable'), 'scatter L' + lv + ': heroes never slip');
      t.ok(!has(at(9, 9), 'vulnerable'), 'scatter L' + lv + ': far foe untouched');
      // the payoff: Vulnerable = +25% from every hero (the knight's 5-damage slash hits for 6)
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k, 'scatter L' + lv + ': the knight\'s turn');
      t.ok(DD.Combat.useSkill(k, k.basic, 5, 5) && g.hp === 14 - 6, 'scatter L' + lv + ': the knight hits the Vulnerable foe for 6 (5 × 1.25)');
    });
    // range [0, 4] with LOS: his own tile is fine, 5 away is not
    fight({ w: 11, h: 11, me: { x: 5, y: 5 }, enemies: [{ id: 'test_grunt', x: 9, y: 9 }] });
    let u = me();
    let sl = sock(u, 'mar_scatter', 1);
    t.ok(DD.Targeting.isValidTarget(u, sl, 5, 5) && DD.Targeting.isValidTarget(u, sl, 5, 9) && !DD.Targeting.isValidTarget(u, sl, 5, 10), 'range 0-4');
    // never buries another surface
    A().setSurface(6, 5, 'oil', 5);
    use(u, sl, 5, 5);
    t.ok(surf(6, 5) === 'oil' && surf(4, 5) === 'mar_marbles', 'other surfaces stay (oil stays oil)');
    // re-scattering never shortens marbles already there
    DD.Marbles.scatter(u, [{ x: 5, y: 4 }], { turns: 4 });
    DD.Marbles.scatter(null, [{ x: 5, y: 4 }], { turns: 2 });
    t.ok(tile(5, 4).surface.turns === 4 && tile(5, 4).surface.data.src === u.id, 'shorter marbles on top keep the longer ones (and the credit)');
    DD.Marbles.scatter(u, [{ x: 5, y: 4 }], { turns: 6 });
    t.eq(tile(5, 4).surface.turns, 6, 'a longer scatter refreshes the duration');
    // no marbles in pits, walls or lava
    fight({ w: 7, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 6, y: 2 }],
      terrain: function (tl) { if (tl.x === 3 && tl.y === 1) tl.t = 'pit'; if (tl.x === 3 && tl.y === 0) tl.t = 'lava'; if (tl.x === 4 && tl.y === 1) tl.t = 'wall'; } });
    u = me();
    use(u, sock(u, 'mar_scatter', 3), 3, 1);
    t.ok(!surf(3, 1) && !surf(3, 0) && !surf(4, 1) && surf(2, 1) === 'mar_marbles', 'no marbles in a pit, lava or a wall');
    // pushed across marbles: slips (Vulnerable) and keeps going — no extra slide
    fight({ w: 10, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 2, y: 1, hpMult: 3 }] });
    u = me();
    let g = at(2, 1);
    DD.Marbles.scatter(u, [{ x: 3, y: 1 }], { turns: 3 });
    use(u, sock(u, 'mar_whack', 1), 2, 1);
    t.eq(g.x, 4, 'pushed 2 across the marbles: no slide');
    t.eq(g.hp, 42 - 5, 'whack 5, no slip damage');
    t.ok(has(g, 'vulnerable') && st(g, 'vulnerable').turns === 1, 'pushed over marbles: slipped, Vulnerable for its next turn');
    t.eq(surf(3, 1), 'mar_marbles', 'the marbles stay');
    // a walking enemy slips on its own turn: Vulnerable through its NEXT turn (gained on its own turn: fresh), not stopped
    fight({ w: 9, h: 1, me: { x: 0, y: 0 }, enemies: [{ id: 'test_grunt', x: 6, y: 0 }], ai: true });
    u = me();
    g = at(6, 0);
    DD.Marbles.scatter(u, [{ x: 4, y: 0 }], { turns: 3 });
    let during = null;
    const off = onTurnOf(g, function () { during = has(g, 'vulnerable'); });
    DD.Combat.endTurn();
    t.ok(mine() && round() === 2, 'round 2, his turn');
    t.eq(g.x, 3, 'the grunt walked its full 3 tiles over the marbles (a slip does not stop it)');
    t.ok(has(g, 'vulnerable'), 'it slipped on its own turn: still Vulnerable for the heroes\' turn');
    t.eq(surf(4, 0), 'mar_marbles', 'the marbles stay after a slip');
    DD.Combat.endTurn();
    off();
    t.eq(during, true, 'Vulnerable during its next turn too');
    t.ok(!has(g, 'vulnerable'), 'gone after that turn (1 own turn after the slip)');
    // the enemy AI walks into marbles (they are a trap, not a hazard it avoids)
    fight({ w: 9, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 5, y: 1 }], ai: true });
    u = me();
    g = at(5, 1);
    DD.Marbles.scatter(u, [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 1 }], { turns: 3 });
    const hp0 = u.hp;
    DD.Combat.endTurn();
    t.ok(DD.Grid.dist(g, u) === 1 && has(g, 'vulnerable') && u.hp < hp0, 'it walks over the marbles, slips and still stabs him');
    // flyers, heroes and summons never slip; slip() returns false
    fight({ w: 6, h: 3, me: { x: 1, y: 1 }, allies: [{ id: 'test_knight', x: 2, y: 1 }], enemies: [{ id: 'test_grunt', x: 3, y: 1 }] });
    u = me(); g = at(3, 1);
    DD.Marbles.scatter(u, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
    t.ok(!DD.Marbles.slip(u, tile(1, 1)) && !DD.Marbles.slip(hero('test_knight'), tile(2, 1)), 'heroes: no slip');
    g.flags.flying = true;
    t.ok(!DD.Marbles.slip(g, tile(3, 1)) && !has(g, 'vulnerable'), 'flyers: no slip');
    g.flags.flying = false;
    t.ok(DD.Marbles.slip(g, tile(3, 1)) && has(g, 'vulnerable'), 'grounded enemy: slips');
    t.ok(!DD.Marbles.slip(g, tile(4, 1)), 'no marbles, no slip');
    // cast on a flyer and a walker: only the grounded one slips (the desc says "Grounded foes")
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 3, y: 2 }, { id: 'test_grunt', x: 3, y: 3 }] });
    u = me();
    const flyer = at(3, 2), walker = at(3, 3);
    flyer.flags.flying = true;
    t.ok(use(u, sock(u, 'mar_scatter', 1), 3, 2), 'scatter on a flyer');
    t.ok(!has(flyer, 'vulnerable') && has(walker, 'vulnerable'), 'the flyer floats over the marbles; the walker next to it slips');
    // marbles run out: 3 rounds (surfaces count rounds)
    fight({ w: 9, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 8, y: 2 }] });
    u = me();
    DD.Marbles.scatter(u, [{ x: 0, y: 0 }], { turns: 3 });
    DD.Combat.endRound(); DD.Combat.endRound();
    t.ok(surf(0, 0) === 'mar_marbles' && round() === 3, 'still there in round 3');
    DD.Combat.endRound();
    t.eq(surf(0, 0), null, 'gone after 3 rounds');
    t.ok(sane(t, 'scatter'), 'state sane');
  });

  // ---- Rabbit Punch + Flurry of Paws ----------------------------------------------------------------------
  T.suite('hero_marbles: Rabbit Punch and Flurry of Paws', function (t) {
    if (!guard(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_punch', lv);
      fight({ w: 8, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 2, y: 3 }], enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 3 }], ai: true });
      const u = me(), g = at(2, 2), k = hero('test_knight');
      const sl = sock(u, 'mar_punch', lv);
      t.ok(desc('mar_punch', lv).indexOf(Lv.dmg + ' damage') >= 0, 'punch L' + lv + ': desc says ' + Lv.dmg);
      t.eq(cost(u, 'mar_punch', lv), 2, 'punch L' + lv + ': 2 AP');
      t.ok(use(u, sl, 2, 2), 'punch L' + lv + ' used');
      t.eq(g.hp, 42 - Lv.dmg, 'punch L' + lv + ': ' + Lv.dmg + ' damage');
      t.ok(has(g, 'stun') && st(g, 'stun').turns === 1, 'punch L' + lv + ': Stunned (1 turn)');
      t.eq(sl.cd, Lv.cd, 'punch L' + lv + ': cooldown ' + Lv.cd);
      const khp = k.hp, uhp = u.hp;
      let acted = false;
      A().addRule({ id: 'mar_acted', hooks: { onSkillUsed: function (ctx) { if (ctx.user === g) acted = true; } } });
      DD.Combat.endRound();
      t.ok(mine() && round() === 2, 'punch L' + lv + ': round 2, his turn');
      t.ok(!acted && k.hp >= khp && u.hp === uhp, 'punch L' + lv + ': the stunned grunt lost its turn (nobody hit)');
      t.ok(!has(g, 'stun'), 'punch L' + lv + ': the stun wore off with that lost turn');
      t.eq(DD.Combat.canUse(u, sl), 'On cooldown (' + Lv.cd + ').', 'punch L' + lv + ': still cooling down in round 2');
      for (let r = 0; r < Lv.cd - 1; r++) DD.Combat.endRound();
      t.eq(DD.Combat.canUse(u, sl) === true, false, 'punch L' + lv + ': unusable during his next ' + Lv.cd + ' turns');
      DD.Combat.endRound();
      t.eq(DD.Combat.canUse(u, sl), true, 'punch L' + lv + ': ready in round ' + (Lv.cd + 2));
      t.ok(acted, 'punch L' + lv + ': the grunt fought again after the stun');
    });
    // a stun interrupts a boss wind-up at once (v2 counterplay)
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_boss', x: 2, y: 2 }] });
    let u = me();
    const boss = at(2, 2);
    const w = DD.AI.windUp(boss, 'test_boss_meteor', { x: 1, y: 2 }, { label: 'Meteor' });
    t.ok(w && boss.intents.length === 1, 'the boss winds up a meteor');
    use(u, sock(u, 'mar_punch', 1), 2, 2);
    t.ok(has(boss, 'stun') && boss.intents.length === 0, 'Rabbit Punch: stunned, the wind-up is interrupted');
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_flurry', lv);
      t.eq(Lv.dmg, Lv.hit * Lv.hits, 'flurry L' + lv + ': total = hits × damage');
      t.ok(desc('mar_flurry', lv).indexOf(Lv.hits + ' times for ' + Lv.hit + ' damage') >= 0, 'flurry L' + lv + ': desc says ' + Lv.hits + ' × ' + Lv.hit);
      fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 3 }] });
      u = me();
      const g = at(2, 2);
      const sl = sock(u, 'mar_flurry', lv);
      let hits = 0;
      A().addRule({ id: 'mar_count', hooks: { onTakeDamage: function (d) { if (d.target === g && d.source === u) hits++; } } });
      t.ok(use(u, sl, 2, 2), 'flurry L' + lv + ' used');
      t.eq(g.hp, 42 - Lv.dmg, 'flurry L' + lv + ': ' + Lv.dmg + ' damage');
      t.eq(hits, Lv.hits, 'flurry L' + lv + ': ' + Lv.hits + ' strikes');
      t.ok(u.ap === 1 && sl.cd === 1, 'flurry L' + lv + ': 2 AP, cooldown 1');
    });
    // the target drops mid-flurry: the remaining strikes are lost (it strikes one foe, nothing else)
    fight({ w: 8, h: 5, me: { x: 2, y: 2 }, enemies: [{ id: 'test_grunt', x: 3, y: 2 }, { id: 'test_grunt', x: 2, y: 3 }, { id: 'test_grunt', x: 7, y: 4 }] });
    u = me();
    const a = at(3, 2), b = at(2, 3);
    a.hp = 4;
    t.ok(use(u, sock(u, 'mar_flurry', 1), 3, 2), 'flurry on a nearly dead foe');
    t.ok(a.dead && b.hp === 14, 'the target dies on the 2nd strike; the neighbour is untouched');
    // armor bites every strike; thorns bite back every strike
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_brute', x: 2, y: 2 }] });
    u = me();
    const br = at(2, 2);
    use(u, sock(u, 'mar_flurry', 1), 2, 2);
    t.eq(br.hp, 50 - 3 * 2, 'armor 1 against each of 3 strikes');
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 3 }] });
    u = me();
    A().addStatus(at(2, 2), 'thorns', { stacks: 1, turns: 2 });
    const hp = u.hp;
    use(u, sock(u, 'mar_flurry', 1), 2, 2);
    t.eq(u.hp, hp - 3, 'thorns 1 bites back 3 times');
    // combo: Marble Scatter's Vulnerable makes every strike count (3 × round(3 × 1.25) = 12)
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 3 }] });
    u = me();
    u.skills = [DD.Act.makeSlot('mar_scatter', 1), DD.Act.makeSlot('mar_flurry', 1)];
    blank(u);
    use(u, u.skills[0], 2, 2);
    use(u, u.skills[1], 2, 2);
    t.eq(at(2, 2).hp, 42 - 12, 'scatter + flurry: 12 instead of 9');
    // every level beats the one before it at armor 0, 1 and 2
    [0, 1, 2].forEach(function (armor) {
      const dealt = [];
      [1, 2, 3].forEach(function (lv) {
        fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 5 }] });
        const v = me(), g = at(2, 2);
        g.armor = armor;
        const hp0 = g.hp;
        use(v, sock(v, 'mar_flurry', lv), 2, 2);
        dealt.push(hp0 - g.hp);
        const Lv = L('mar_flurry', lv);
        t.eq(hp0 - g.hp, Lv.hits * Math.max(1, Lv.hit - armor), 'flurry L' + lv + ' vs armor ' + armor + ': ' + Lv.hits + ' × (' + Lv.hit + ' − armor)');
      });
      t.ok(dealt[1] > dealt[0] && dealt[2] > dealt[1], 'flurry vs armor ' + armor + ': each level beats the one before (' + dealt + ')');
    });
    t.ok(sane(t, 'punch/flurry'), 'state sane');
  });

  // ---- Back In My Day + Lecture ------------------------------------------------------------------------
  T.suite('hero_marbles: Back In My Day and Lecture', function (t) {
    if (!guard(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_backinmyday', lv);
      fight({ w: 9, h: 7, me: { x: 3, y: 3 }, allies: [{ id: 'test_mage', x: 5, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 5, y: 3 }, { id: 'test_grunt', x: 8, y: 6 }] });
      const u = me(), g1 = at(4, 3), g2 = at(5, 3);
      const sl = sock(u, 'mar_backinmyday', lv);
      t.ok(desc('mar_backinmyday', lv).indexOf(Lv.block + ' Block') >= 0, 'back in my day L' + lv + ': desc says ' + Lv.block + ' Block');
      t.ok(use(u, sl, 3, 3), 'back in my day L' + lv + ' used');
      t.eq(u.block, Lv.block, 'L' + lv + ': +' + Lv.block + ' Block');
      t.ok(!has(u, 'thorns'), 'L' + lv + ': no Thorns any more (one rider)');
      t.ok(has(g1, 'taunt') && st(g1, 'taunt').source === u.id && st(g1, 'taunt').turns === 1, 'L' + lv + ': adjacent foe Taunted for its next turn');
      t.eq(has(g2, 'taunt'), Lv.r >= 2, 'L' + lv + ': foe 2 tiles away taunted only at III');
      t.ok(!has(at(8, 6), 'taunt'), 'L' + lv + ': far foe untouched');
      t.ok(u.ap === 2 && sl.cd === 2, 'L' + lv + ': 1 AP, cooldown 2');
    });
    // v2 taunt: on its turn the taunted grunt must attack him, not the mage it could kill; his Block soaks it and lasts
    // exactly until the start of his next turn
    function tauntFight(taunt) {
      fight({ w: 8, h: 5, me: { x: 2, y: 2 }, allies: [{ id: 'test_mage', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }], ai: true });
      const u = me(), g = at(3, 2), mage = hero('test_mage');
      mage.hp = 4;
      if (taunt) use(u, sock(u, 'mar_backinmyday', 1), 2, 2);
      let block = -1;
      const off = onTurnOf(g, function () { block = u.block; });
      const uhp = u.hp;
      DD.Combat.endRound();
      off();
      return { u: u, mage: mage, block: block, lost: uhp - u.hp };
    }
    const free = tauntFight(false);
    t.ok(free.mage.downed || free.mage.hp < 4, 'control: untaunted, the grunt stabs the 4-HP mage');
    const tt = tauntFight(true);
    t.ok(tt.mage.hp === 4 && !tt.mage.downed, 'taunted: the grunt leaves the mage alone');
    t.eq(tt.block, 4, 'his 4 Block is still up on the grunt\'s turn');
    t.eq(tt.lost, 0, 'the stab (4) lands on him and his Block soaks it');
    t.ok(mine() && tt.u.block === 0, 'his Block is gone at the start of his next turn');
    t.ok(!has(at(3, 2), 'taunt'), 'the taunt ended with the grunt\'s turn');

    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_lecture', lv);
      fight({ w: 9, h: 5, me: { x: 2, y: 2 }, enemies: [{ id: 'test_grunt', x: 3, y: 2 }, { id: 'test_grunt', x: 4, y: 2 }, { id: 'test_grunt', x: 8, y: 4 }] });
      const u = me();
      const near = at(3, 2), mid = at(4, 2), far = at(8, 4);
      const sl = sock(u, 'mar_lecture', lv);
      t.eq(cost(u, 'mar_lecture', lv), Lv.ap, 'lecture L' + lv + ': ' + Lv.ap + ' AP');
      t.ok(use(u, sl, 2, 2), 'lecture L' + lv + ' used');
      t.eq(u.ap, 3 - Lv.ap, 'lecture L' + lv + ': AP paid');
      t.ok(has(near, 'sleep') && st(near, 'sleep').turns === Lv.turns, 'lecture L' + lv + ': adjacent foe Asleep ' + Lv.turns + ' turns');
      t.eq(has(mid, 'sleep'), Lv.r >= 2, 'lecture L' + lv + ': foe 2 away asleep only from II');
      t.ok(!has(far, 'sleep'), 'lecture L' + lv + ': far foe awake');
      t.eq(sl.cd, 3, 'lecture L' + lv + ': cooldown 3');
      // v2: Asleep for 2 turns = the sleeper loses its next 2 turns, then wakes and fights
      fight({ w: 9, h: 5, me: { x: 2, y: 2 }, enemies: [{ id: 'test_grunt', x: 3, y: 2 }], ai: true });
      const v = me(), sleeper = at(3, 2);
      use(v, sock(v, 'mar_lecture', lv), 2, 2);
      const myHp = v.hp;
      DD.Combat.endTurn();
      t.ok(mine() && has(sleeper, 'sleep') && v.hp === myHp, 'lecture L' + lv + ': round 2: it slept through its turn');
      DD.Combat.endTurn();
      t.ok(mine() && !has(sleeper, 'sleep') && v.hp === myHp, 'lecture L' + lv + ': round 3: it slept through 2 turns, now awake');
      DD.Combat.endTurn();
      t.ok(v.hp < myHp, 'lecture L' + lv + ': its 3rd turn: awake and stabbing again');
    });
    // damage wakes them; silence stops the lecture (it is a spell); sleep interrupts a wind-up
    fight({ w: 9, h: 5, me: { x: 2, y: 2 }, enemies: [{ id: 'test_grunt', x: 3, y: 2 }] });
    let u = me();
    use(u, sock(u, 'mar_lecture', 3), 2, 2);
    use(u, u.basic, 3, 2);
    t.ok(!has(at(3, 2), 'sleep'), 'a jab wakes the sleeper');
    fight({ w: 9, h: 5, me: { x: 2, y: 2 }, enemies: [{ id: 'test_grunt', x: 3, y: 2 }] });
    u = me();
    const lsl = sock(u, 'mar_lecture', 1);
    A().addStatus(u, 'silenced', { turns: 1 });
    t.eq(DD.Combat.canUse(u, lsl), 'Silenced!', 'silenced: no lecture (it is a spell)');
    t.eq(DD.Combat.canUse(u, u.basic), true, 'silenced: the jab still works');
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_boss', x: 2, y: 2 }] });
    u = me();
    const boss = at(2, 2);
    DD.AI.windUp(boss, 'test_boss_meteor', { x: 1, y: 2 }, { label: 'Meteor' });
    use(u, sock(u, 'mar_lecture', 1), 1, 2);
    t.ok(has(boss, 'sleep') && boss.intents.length === 0, 'Lecture: the boss nods off and its wind-up is interrupted');
    t.ok(sane(t, 'bimd/lecture'), 'state sane');
  });

  // ---- Carrot Toss + Hare-Brained Leap + Vaudeville Hook + Wax On, Wax Off ---------------------------------
  T.suite('hero_marbles: Carrot Toss, Hare-Brained Leap, Vaudeville Hook, Wax On Wax Off', function (t) {
    if (!guard(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_carrot', lv);
      fight({ w: 8, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 4, y: 2 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
      const u = me(), k = hero('test_knight');
      k.hp = 10;
      const sl = sock(u, 'mar_carrot', lv);
      t.ok(desc('mar_carrot', lv).indexOf(Lv.heal + ' HP') >= 0, 'carrot L' + lv + ': desc says ' + Lv.heal);
      t.ok(use(u, sl, 4, 2), 'carrot L' + lv + ' used');
      t.eq(k.hp, 10 + Lv.heal, 'carrot L' + lv + ': heals ' + Lv.heal);
      t.eq(sl.cd, 0, 'carrot L' + lv + ': no cooldown');
      u.hp = u.maxHp - 20;
      t.ok(use(u, sl, 1, 2), 'carrot L' + lv + ': munch it himself');
      t.eq(u.hp, u.maxHp - 20 + Lv.heal, 'carrot L' + lv + ': self heal');
      t.ok(use(u, sl, 4, 2), 'third carrot');
      t.eq(DD.Combat.canUse(u, sl), 'No charges left.', 'carrot L' + lv + ': 3 per fight');
      DD.Combat.endRound();
      t.eq(DD.Combat.canUse(u, sl), 'No charges left.', 'carrot L' + lv + ': still none next round');
    });
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 6, y: 2 }], enemies: [{ id: 'test_grunt', x: 8, y: 4 }] });
    t.ok(!DD.Targeting.isValidTarget(me(), sock(me(), 'mar_carrot', 1), 6, 2), 'carrot: range 4');
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_leap', lv);
      fight({ w: 11, h: 3, me: { x: 1, y: 1 }, enemies: [{ id: 'test_grunt', x: 10, y: 2 }] });
      const u = me();
      const sl = sock(u, 'mar_leap', lv);
      t.ok(DD.Targeting.isValidTarget(u, sl, 1 + Lv.r, 1) && !DD.Targeting.isValidTarget(u, sl, 2 + Lv.r, 1), 'leap L' + lv + ': range ' + Lv.r);
      tile(1 + Lv.r, 1).h = 3;
      t.ok(use(u, sl, 1 + Lv.r, 1), 'leap L' + lv + ': onto a 3-level ledge');
      t.ok(u.x === 1 + Lv.r && u.ap === 2 && sl.cd === 2, 'leap L' + lv + ': landed, 1 AP, cooldown 2');
    });
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 5, y: 2 }, { id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 2, y: 2 }] });
    let u = me();
    const e1 = at(5, 2), e2 = at(4, 3), e3 = at(2, 2);
    use(u, sock(u, 'mar_leap', 3), 4, 2);
    t.ok(u.x === 4 && e1.hp === 11 && e2.hp === 11 && e1.x === 5 && e2.y === 3, 'leap III: over a foe, THUMP 3 to both neighbours (no push)');
    t.eq(e3.hp, 14, 'leap III: the foe he jumped over is not adjacent any more: untouched');
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 5, y: 2 }] });
    u = me();
    use(u, sock(u, 'mar_leap', 1), 4, 2);
    t.eq(at(5, 2).hp, 14, 'leap I: no thump');
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 8, y: 4 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 2) tl.t = 'pit'; } });
    u = me();
    const lsl = sock(u, 'mar_leap', 1);
    t.ok(!DD.Targeting.isValidTarget(u, lsl, 3, 2) && DD.Targeting.isValidTarget(u, lsl, 4, 2), 'leap: over a pit, never into it');

    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_hook', lv);
      fight({ w: 9, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 1 + Lv.range, y: 2 }, { id: 'test_grunt', x: 3, y: 4 }] });
      u = me();
      const g = at(1 + Lv.range, 2);
      const sl = sock(u, 'mar_hook', lv);
      t.ok(desc('mar_hook', lv).indexOf('2-' + Lv.range) >= 0 && desc('mar_hook', lv).indexOf(Lv.dmg + ' damage') >= 0, 'hook L' + lv + ': desc says range 2-' + Lv.range + ', ' + Lv.dmg);
      t.ok(!DD.Targeting.isValidTarget(u, sl, 3, 4), 'hook L' + lv + ': straight lines only');
      t.ok(!DD.Targeting.isValidTarget(u, sl, 2 + Lv.range, 2), 'hook L' + lv + ': max range ' + Lv.range);
      t.ok(use(u, sl, g.x, g.y), 'hook L' + lv + ' used at range ' + Lv.range);
      t.eq(g.hp, 14 - Lv.dmg, 'hook L' + lv + ': ' + Lv.dmg + ' damage');
      t.eq(g.x, 2, 'hook L' + lv + ': yanked next to him');
      t.ok(u.ap === 2 && sl.cd === 2, 'hook L' + lv + ': 1 AP, cooldown 2');
    });
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 4, y: 2 }], enemies: [{ id: 'test_grunt', x: 8, y: 4 }] });
    u = me();
    t.ok(!DD.Targeting.isValidTarget(u, sock(u, 'mar_hook', 1), 4, 2), 'hook: foes only (no allies)');
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 4, y: 2 }, { id: 'test_grunt', x: 8, y: 4 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 2) tl.t = 'pit'; } });
    u = me();
    use(u, sock(u, 'mar_hook', 1), 4, 2);
    t.ok(at(4, 2) === null && at(3, 2) === null && DD.Combat.state.stats.envKills === 1, 'hooked across a pit: yeet');
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_brute', x: 4, y: 2 }] });
    u = me();
    use(u, sock(u, 'mar_hook', 1), 4, 2);
    t.ok(at(4, 2) && at(4, 2).hp === 50 - 2, 'immovable brute: 3 − 1 armor, not pulled');
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 4, y: 2 }, { id: 'test_grunt', x: 2, y: 2 }] });
    u = me();
    use(u, sock(u, 'mar_hook', 1), 4, 2);
    t.ok(at(3, 2) && at(3, 2).hp === 14 - 3 - 3 && at(2, 2).hp === 14 - 3, 'a foe in the way: the hooked one bumps into it (3 each)');
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 4, y: 2 }] });
    u = me();
    at(4, 2).hp = 3;
    t.ok(use(u, sock(u, 'mar_hook', 1), 4, 2) && !at(4, 2) && !at(2, 2), 'the hook kills: no pull, no throw');

    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_waxon', lv);
      fight({ w: 9, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 1 + Lv.range, y: 2 }], enemies: [{ id: 'test_grunt', x: 2 + Lv.range, y: 2 }] });
      u = me();
      const k = hero('test_knight'), g = at(2 + Lv.range, 2);
      const sl = sock(u, 'mar_waxon', lv);
      t.ok(!DD.Targeting.isValidTarget(u, sl, 1, 2), 'wax on L' + lv + ': not himself');
      t.ok(DD.Targeting.isValidTarget(u, sl, k.x, k.y), 'wax on L' + lv + ': an ally ' + DD.Grid.dist(u, k) + ' tiles away');
      t.ok(use(u, sl, k.x, k.y), 'wax on L' + lv + ' used');
      t.ok(has(k, 'empowered'), 'wax on L' + lv + ': Empowered');
      t.eq(k.apBank || 0, Lv.ap || 0, 'wax on L' + lv + ': ' + (Lv.ap ? '+1 AP banked for its next turn' : 'no AP'));
      t.ok(u.ap === 2 && sl.cd === 2, 'wax on L' + lv + ': 1 AP, cooldown 2');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k, 'wax on L' + lv + ': the knight\'s turn');
      t.eq(k.ap, 3 + (Lv.ap || 0), 'wax on L' + lv + ': the knight starts with ' + (3 + (Lv.ap || 0)) + ' AP');
      DD.Combat.useSkill(k, k.basic, g.x, g.y);
      t.eq(g.hp, 14 - 8, 'wax on L' + lv + ': the knight\'s 5-damage slash hits for 8 (+50%)');
      t.ok(!has(k, 'empowered'), 'wax on L' + lv + ': used up');
    });
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 5, y: 2 }], enemies: [{ id: 'test_grunt', x: 8, y: 4 }] });
    u = me();
    t.ok(!DD.Targeting.isValidTarget(u, sock(u, 'mar_waxon', 1), 5, 2), 'wax on I: allies within 3 only');
    t.ok(sane(t, 'carrot/leap/hook/waxon'), 'state sane');
  });

  // ---- the passive -----------------------------------------------------------------------------------------
  T.suite('hero_marbles: Absent-Minded Mastery', function (t) {
    if (!guard(t)) return;
    const skills = [{ id: 'mar_flurry', level: 1 }, { id: 'mar_punch', level: 1 }, { id: 'mar_backinmyday', level: 1 }, { id: 'mar_lecture', level: 1 }];
    fight({ w: 9, h: 5, me: { x: 2, y: 2, skills: skills }, enemies: [{ id: 'test_grunt', x: 3, y: 2, hpMult: 20 }], seed: 21 });
    let u = me();
    let rem = st(u, 'mar_remembered');
    t.ok(rem && rem.data.ids.length === 1 && skills.some(function (s) { return s.id === rem.data.ids[0]; }), 'round 1: remembers one socketed skill');
    t.ok(DD.Combat.state.log.some(function (e) { return /suddenly remembers/.test(e.text); }), 'log line');
    t.ok(/costs 0 AP/.test(DD.getStatus('mar_remembered').desc(rem)) && DD.getStatus('mar_remembered').desc(rem).indexOf(DD.getSkill(rem.data.ids[0]).name) >= 0, 'status tooltip names the skill');
    const id = rem.data.ids[0];
    const base = DD.resolve(DD.getSkill(id).ap, DD.skillLevel(DD.getSkill(id), 1), u, 1);
    t.eq(cost(u, id, 1), 0, 'remembered skill costs 0 AP');
    const sl = u.skills.filter(function (s) { return s.id === id; })[0];
    u.ap = 0;
    t.eq(DD.Combat.canUse(u, sl), true, 'usable with 0 AP left');
    t.ok(use(u, sl, id === 'mar_backinmyday' || id === 'mar_lecture' ? 2 : 3, 2), 'used for free');
    t.eq(u.ap, 0, 'no AP spent');
    t.ok(sl.cd > 0, 'the free use still starts its cooldown');
    t.ok(!has(u, 'mar_remembered'), 'remembered status used up');
    t.eq(cost(u, id, 1), base, 'only the first use is free');
    // 60 turns: exactly one remembered every turn (cooldowns cleared), never anything else changes a cost
    let turns = 0, bad = 0;
    const seen = {};
    for (let i = 0; i < 60; i++) {
      u.skills.forEach(function (s) { s.cd = 0; s.fresh = false; });
      DD.Combat.endTurn();
      u = me();
      if (!u || DD.Combat.state.result) break;
      turns++;
      const r = st(u, 'mar_remembered');
      if (!r || r.data.ids.length !== 1) { bad++; continue; }
      seen[r.data.ids[0]] = 1;
      u.skills.forEach(function (s) {
        const d = DD.getSkill(s.id);
        const want = s.id === r.data.ids[0] ? 0 : DD.resolve(d.ap, DD.skillLevel(d, 1), u, 1);
        if (cost(u, s.id, 1) !== want) bad++;
      });
      u.hp = u.maxHp;
    }
    t.ok(turns >= 50, 'ran ' + turns + ' turns');
    t.eq(bad, 0, 'every turn: exactly one free skill, every other skill at its normal cost (no forgetting)');
    t.eq(Object.keys(seen).length, 4, 'over 60 turns each of the 4 sockets came up (' + Object.keys(seen).join(', ') + ')');
    // skills on cooldown are never remembered; nothing ready → nothing remembered
    fight({ w: 9, h: 5, me: { x: 2, y: 2, skills: skills }, enemies: [{ id: 'test_grunt', x: 7, y: 4 }], seed: 3 });
    u = me();
    let onCd = 0;
    for (let i = 0; i < 12; i++) {
      u.skills.forEach(function (s) { s.cd = s.id === 'mar_flurry' ? 0 : 5; s.fresh = false; });
      DD.Combat.endTurn();
      u = me();
      const r = st(u, 'mar_remembered');
      if (!r || r.data.ids[0] !== 'mar_flurry') onCd++;
    }
    t.eq(onCd, 0, 'only the ready skill is ever remembered');
    // a cooldown that ends this very turn counts as ready (the tick comes after his turn-start hook)
    fight({ w: 9, h: 5, me: { x: 2, y: 2, skills: [{ id: 'mar_flurry', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 7, y: 4 }], seed: 3 });
    u = me();
    u.skills[0].cd = 1; u.skills[0].fresh = false;
    DD.Combat.endTurn();
    t.ok(has(me(), 'mar_remembered') && me().skills[0].cd === 0, 'a skill coming off cooldown this turn can be remembered');
    me().skills[0].cd = 5;
    DD.Combat.endTurn();
    t.ok(!has(me(), 'mar_remembered'), 'all on cooldown: nothing to remember');
    // charges spent → not remembered
    fight({ w: 9, h: 5, me: { x: 2, y: 2, skills: [{ id: 'mar_carrot', level: 1 }, { id: 'mar_whack', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 7, y: 4 }], seed: 5 });
    u = me();
    u.skills[0].uses = 3;
    let carrots = 0;
    for (let i = 0; i < 8; i++) { DD.Combat.endTurn(); const r = st(me(), 'mar_remembered'); if (r && r.data.ids[0] === 'mar_carrot') carrots++; }
    t.eq(carrots, 0, 'out of carrots: never remembered');
    // silenced at his turn start (it lasts through that turn): his spell is not ready, so it is never the free skill
    function hushRolls(silence) {
      fight({ w: 9, h: 5, me: { x: 2, y: 2, skills: [{ id: 'mar_lecture', level: 1 }, { id: 'mar_whack', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 7, y: 4 }], seed: 5 });
      const out = { lecture: 0, whack: 0 };
      for (let i = 0; i < 12; i++) {
        const v = me();
        v.skills.forEach(function (s) { s.cd = 0; s.fresh = false; });
        A().removeStatus(v, 'silenced', { silent: true });
        if (silence) A().addStatus(v, 'silenced', { turns: 1 });
        DD.Combat.endTurn();
        const r = st(me(), 'mar_remembered');
        if (silence && !has(me(), 'silenced')) return null;
        if (r && r.data.ids[0] === 'mar_lecture') out.lecture++;
        if (r && r.data.ids[0] === 'mar_whack') out.whack++;
      }
      return out;
    }
    const loud = hushRolls(false), hushed = hushRolls(true);
    t.ok(loud && loud.lecture > 0, 'control: not silenced, Lecture comes up (' + JSON.stringify(loud) + ')');
    t.ok(hushed && hushed.lecture === 0 && hushed.whack === 12, 'silenced: Lecture (a spell) is never remembered, Walking Stick Whack every turn (' + JSON.stringify(hushed) + ')');
    // stunned / sheep at his turn start: no roll (a stun from an enemy costs his next turn)
    fight({ w: 9, h: 5, me: { x: 2, y: 2 }, enemies: [{ id: 'test_grunt', x: 7, y: 4 }], seed: 5 });
    u = me();
    const log = [];
    const off = onTurnOf(u, function (v) { log.push([round(), has(v, 'mar_remembered'), v.ap]); });
    A().addStatus(u, 'stun', { turns: 1 });
    DD.Combat.endTurn();
    A().addStatus(me(), 'sheep', { turns: 1 });
    DD.Combat.endTurn();
    DD.Combat.endTurn();
    off();
    t.eq(JSON.stringify(log.slice(0, 2)), JSON.stringify([[2, false, 0], [3, true, 3]]), 'stunned in round 1: round 2 passes with no memory and 0 AP; round 3 he remembers again');
    t.eq(JSON.stringify(log[2]), JSON.stringify([4, false, 3]), 'a sheep remembers nothing (round 4)');
    // the memory is for this turn only: gone at his turn end, before any enemy turn, with no popups
    fight({ w: 9, h: 5, me: { x: 2, y: 2, skills: skills }, enemies: [{ id: 'test_grunt', x: 8, y: 4, hpMult: 20 }], seed: 21, ai: true });
    u = me();
    let leftovers = 0, rolled = 0;
    const g = at(8, 4);
    const off2 = onTurnOf(g, function () { if (has(me(), 'mar_remembered')) leftovers++; });
    const evts = [], push0 = DD.FX.push;
    DD.FX.push = function (e) { evts.push(e); return push0.apply(DD.FX, arguments); };
    try {
      for (let i = 0; i < 8; i++) {
        const m = me();
        m.skills.forEach(function (s) { s.cd = 0; s.fresh = false; });
        if (has(m, 'mar_remembered')) rolled++;
        m.hp = m.maxHp;
        DD.Combat.endTurn();
      }
    } finally { DD.FX.push = push0; off2(); }
    t.ok(rolled >= 7, 'memories rolled (' + rolled + ')');
    t.eq(leftovers, 0, 'the memory is gone before the enemy\'s turn');
    t.eq(evts.filter(function (e) { return e && e.type === 'status' && e.statusId === 'mar_remembered'; }).length, 0, 'no status popups (the 💡 text says it all)');
    // determinism: same seed, same memories
    function rolls(seed) {
      fight({ w: 9, h: 5, me: { x: 2, y: 2, skills: skills }, enemies: [{ id: 'test_grunt', x: 7, y: 4 }], seed: seed });
      const out = [];
      for (let i = 0; i < 6; i++) {
        const v = me();
        v.skills.forEach(function (s) { s.cd = 0; s.fresh = false; });
        out.push((st(v, 'mar_remembered') || { data: { ids: [] } }).data.ids.join('+'));
        DD.Combat.endTurn();
      }
      return out.join(',');
    }
    t.eq(rolls(77), rolls(77), 'same seed, same memories (state.rng only)');
    // basic and signature are never remembered (only sockets); not his turn → no roll
    fight({ w: 9, h: 5, me: { x: 2, y: 2, skills: [] }, enemies: [{ id: 'test_grunt', x: 7, y: 4 }], seed: 5 });
    t.ok(!has(me(), 'mar_remembered'), 'no sockets: nothing to remember');
    fight({ w: 9, h: 5, me: { x: 2, y: 2, skills: skills }, allies: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }], seed: 5 });
    DD.Combat.endTurn();
    blank(me());
    DD.Hooks.fire('onTurnStart', me(), me());
    t.ok(!has(me(), 'mar_remembered'), 'a turn-start hook fired by hand on the knight\'s turn rolls nothing');
    t.ok(sane(t, 'passive'), 'state sane');
  });

  // ---- the signature --------------------------------------------------------------------------------------
  T.suite('hero_marbles: Forgot I Was Retired (signature)', function (t) {
    if (!guard(t)) return;
    const Ls = L('mar_signature', 1);
    fight({ w: 10, h: 9, me: { x: 3, y: 4 }, allies: [{ id: 'test_knight', x: 2, y: 4 }],
      enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 5, y: 5, hpMult: 2 }, { id: 'test_grunt', x: 3, y: 1, hpMult: 2 },
        { id: 'test_grunt', x: 7, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 9, y: 8, hpMult: 2 }], ai: true });
    let u = me();
    const k = hero('test_knight');
    const near = [at(4, 4), at(5, 5), at(3, 1)], far = [at(7, 4), at(9, 8)];
    t.eq(DD.Combat.canUse(u, u.signature), 'Needs 100 Hype.', 'needs 100 Hype');
    DD.Combat.state.hype = 100;
    t.ok(use(u, u.signature, 3, 4), 'signature used');
    t.eq(DD.Combat.state.hype, 4, 'Hype spent (then +4 for hitting 2+ foes)');
    t.eq(u.ap, 1, '2 AP');
    t.ok(near.every(function (f) { return f.hp === 28 - Ls.dmg && has(f, 'stun'); }), 'every foe within 3 tiles: ' + Ls.dmg + ' damage + Stunned');
    t.ok(far.every(function (f) { return f.hp === 28 && !has(f, 'stun'); }), 'foes 4+ tiles away untouched');
    t.ok(k.hp === k.maxHp && !has(k, 'stun'), 'allies untouched');
    t.ok(u.x === 3 && u.y === 4, 'he is back in his chair (he does not move)');
    // v2: the stunned foes lose their next turn; the far ones walk up and fight
    let acted = {};
    A().addRule({ id: 'mar_acted', hooks: { onSkillUsed: function (ctx) { if (ctx.user && ctx.user.side === 'enemy') acted[ctx.user.id] = 1; } } });
    DD.Combat.endRound();
    t.ok(near.every(function (f) { return !acted[f.id] && !has(f, 'stun'); }), 'the stunned foes lost their turn, then the stun wore off');
    // a lone foe: one strike, no chain
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 4, y: 2, hpMult: 3 }] });
    u = me();
    DD.Combat.state.hype = 100;
    use(u, u.signature, 1, 2);
    t.ok(at(4, 2).hp === 42 - Ls.dmg && has(at(4, 2), 'stun') && DD.Combat.state.hype === 0, 'a single foe 3 away: 8 + Stun (no Hype back)');
    // stun-immune foes take the damage but not the stun; Invulnerable ones shrug the damage off
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 3 }, { id: 'test_grunt', x: 1, y: 3, hpMult: 3 }] });
    u = me();
    at(2, 2).flags.stunImmune = true;
    A().addStatus(at(1, 3), 'invulnerable', { turns: 2 });
    DD.Combat.state.hype = 100;
    use(u, u.signature, 1, 2);
    t.ok(at(2, 2).hp === 42 - Ls.dmg && !has(at(2, 2), 'stun'), 'stun-immune: damaged, not stunned');
    t.ok(at(1, 3).hp === 42 && has(at(1, 3), 'stun'), 'Invulnerable: no damage (the status says so), still stunned');
    // wind-ups within 3 are interrupted
    fight({ w: 8, h: 6, me: { x: 1, y: 2 }, enemies: [{ id: 'test_boss', x: 3, y: 2 }] });
    u = me();
    const boss = at(3, 2);
    DD.AI.windUp(boss, 'test_boss_meteor', { x: 1, y: 2 }, { label: 'Meteor' });
    DD.Combat.state.hype = 100;
    use(u, u.signature, 1, 2);
    t.ok(has(boss, 'stun') && boss.intents.length === 0, 'the boss is stunned and its wind-up interrupted');
    // downed mid-signature by thorns: stops cleanly
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 3 }, { id: 'test_grunt', x: 3, y: 3 }] });
    u = me();
    A().addStatus(at(2, 2), 'thorns', { stacks: 9, turns: 2 });
    u.hp = 2;
    DD.Combat.state.hype = 100;
    t.ok(use(u, u.signature, 1, 2), 'signature into thorns');
    t.ok(u.downed && at(2, 2).hp === 42 - Ls.dmg && at(3, 3).hp === 14, 'downed by the first foe\'s thorns: the blur stops (the next foe is untouched)');
    t.ok(sane(t, 'signature'), 'state sane');
  });

  // ---- items ---------------------------------------------------------------------------------------------
  T.suite('hero_marbles: hero items', function (t) {
    if (!guard(t)) return;
    // Cane: +10% damage, pushes and pulls +1 tile (a pull still stops next to him)
    fight({ w: 10, h: 5, me: { x: 1, y: 2, items: ['mar_cane'] }, enemies: [{ id: 'test_grunt', x: 2, y: 2 }, { id: 'test_grunt', x: 4, y: 4 }] });
    let u = me();
    t.ok(u.items.indexOf('mar_cane') >= 0 && Math.abs(u.dmgBonus - 0.1) < 1e-9, 'cane equipped (+10%)');
    let g = at(2, 2);
    use(u, sock(u, 'mar_whack', 1), 2, 2);
    t.ok(g.x === 5 && g.hp === 14 - 6, 'cane: whack pushes 3 and hits for round(5 × 1.1) = 6');
    fight({ w: 10, h: 5, me: { x: 1, y: 2, items: ['mar_cane'] }, enemies: [{ id: 'test_grunt', x: 5, y: 2 }] });
    u = me();
    g = at(5, 2);
    t.ok(!DD.Targeting.isValidTarget(u, sock(u, 'mar_hook', 1), 5, 2), 'cane does not extend the hook\'s range');
    g.x = 4;
    use(u, u.skills[0], 4, 2);
    t.ok(g.x === 2 && g.hp === 14 - 3, 'cane: the hook still lands it next to him (never past), round(3 × 1.1) = 3');
    // pushes only (the desc says so): a 1-tile pull he is the source of (a pull Blessing such as Gravitational Ego)
    // stays 1 tile
    t.ok(/His pushes move units 1 tile further\.$/.test(DD.defs.items.mar_cane.desc) && !/pull/i.test(DD.defs.items.mar_cane.desc), 'cane desc: pushes only');
    fight({ w: 10, h: 5, me: { x: 1, y: 2, items: ['mar_cane'] }, enemies: [{ id: 'test_grunt', x: 5, y: 2 }] });
    u = me();
    g = at(5, 2);
    A().pull(u, g, { x: u.x, y: u.y }, 1);
    t.eq(g.x, 4, 'cane: a 1-tile pull toward him still moves it 1 tile');
    A().knockback(u, g, 1);
    t.eq(g.x, 6, 'cane: a 1-tile push away from him moves it 2');
    // the knight pushing a foe gets no bonus (the cane only lengthens HIS pushes)
    fight({ w: 10, h: 5, me: { x: 1, y: 1, items: ['mar_cane'] }, allies: [{ id: 'test_knight', x: 1, y: 3, skills: [{ id: 'test_shield_bash', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 2, y: 3 }] });
    DD.Combat.endTurn();
    const kn = hero('test_knight');
    DD.Combat.useSkill(kn, kn.skills[0], 2, 3);
    t.eq(at(4, 3) && at(4, 3).defId, 'test_grunt', 'the knight\'s Shield Bash pushes 2 as usual');
    // Robes: +5 HP, marbles around him at the end of each of his turns (other surfaces stay), until the end of next round
    fight({ w: 9, h: 9, me: { x: 4, y: 4, items: ['mar_robes'] }, enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = me();
    t.eq(u.maxHp, DD.getHero(HERO).stats.hp + DD.getHero(HERO).growth.hp * 2 + 5, 'robes: +5 max HP');
    t.ok(!surf(5, 4), 'no marbles before his first turn ends (nothing at combat start)');
    A().setSurface(4, 3, 'oil', 5);
    DD.Combat.endTurn();
    t.ok(surf(5, 4) === 'mar_marbles' && surf(3, 4) === 'mar_marbles' && surf(4, 5) === 'mar_marbles' && surf(4, 3) === 'oil', 'robes: marbles on the free sides (oil kept)');
    t.ok(tile(5, 4).surface.turns === 1 && tile(5, 4).surface.data.src === u.id, 'robes: placed for 2 rounds, 1 left in round 2, credited');
    t.ok(DD.Combat.move(u, 4, 7), 'round 2: he walks away over his own marbles (heroes never slip)');
    t.ok(!has(u, 'vulnerable'), 'no slip for him');
    DD.Combat.endTurn();
    t.ok(!surf(5, 4) && surf(4, 6) === 'mar_marbles', 'robes: the old marbles ran out at the end of round 2; new ones around his new tile');
    // Robes v2: a foe walking up to him slips (Vulnerable) and still attacks
    fight({ w: 9, h: 3, me: { x: 1, y: 1, items: ['mar_robes'] }, enemies: [{ id: 'test_grunt', x: 5, y: 1 }], ai: true });
    u = me();
    g = at(5, 1);
    DD.Combat.endTurn();
    t.ok(DD.Grid.dist(g, u) === 1 && has(g, 'vulnerable'), 'robes: the grunt stepping next to him slips (Vulnerable)');
    // Pills: 2 remembered every turn, both free
    const skills = [{ id: 'mar_flurry', level: 1 }, { id: 'mar_punch', level: 1 }, { id: 'mar_backinmyday', level: 1 }];
    fight({ w: 9, h: 5, me: { x: 2, y: 2, items: ['mar_pills'], skills: skills }, enemies: [{ id: 'test_grunt', x: 3, y: 2, hpMult: 20 }], seed: 9 });
    t.eq(DD.Combat.state.hype, 0, 'pills: no Hype stat any more (one rule)');
    let twos = 0;
    for (let i = 0; i < 20; i++) {
      u = me();
      u.hp = u.maxHp;
      u.skills.forEach(function (s) { s.cd = 0; s.fresh = false; });
      const r = st(u, 'mar_remembered');
      if (r && r.data.ids.length === 2 && r.data.ids[0] !== r.data.ids[1]) twos++;
      DD.Combat.endTurn();
    }
    t.eq(twos, 20, 'pills: 2 different skills remembered every turn');
    u = me();
    const ids = st(u, 'mar_remembered').data.ids;
    t.ok(cost(u, ids[0], 1) === 0 && cost(u, ids[1], 1) === 0, 'pills: both free');
    fight({ w: 9, h: 5, me: { x: 2, y: 2, items: ['mar_pills'], skills: [{ id: 'mar_flurry', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 3, y: 2 }], seed: 9 });
    t.eq(st(me(), 'mar_remembered').data.ids.join(','), 'mar_flurry', 'pills with one socket: that one');
    t.ok(sane(t, 'items'), 'state sane');
  });

  // ---- previews -------------------------------------------------------------------------------------------
  T.suite('hero_marbles: previews are exact and side-effect free', function (t) {
    if (!guard(t)) return;
    let checks = 0;
    function arena() {
      fight({ w: 9, h: 9, seed: 13, me: { x: 4, y: 4 }, allies: [{ id: 'test_knight', x: 3, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }, { id: 'test_archer', x: 4, y: 1 }, { id: 'test_grunt', x: 6, y: 5 }],
        objects: [{ x: 2, y: 2, id: 'crate' }], terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; if (tl.x === 4 && tl.y === 7) tl.t = 'lava'; } });
      const u = me();
      u.ap = 6;
      DD.Combat.state.hype = 100;
      hero('test_knight').hp = 20;
      return u;
    }
    ALL.forEach(function (id) {
      for (let lv = 1; lv <= DD.getSkill(id).levels.length; lv++) {
        let u = arena();
        let sl = id === 'mar_jab' ? u.basic : id === 'mar_signature' ? u.signature : sock(u, id, lv);
        const targets = DD.Targeting.validTargets(u, sl).slice(0, 6);
        targets.forEach(function (tg) {
          u = arena();
          sl = id === 'mar_jab' ? u.basic : id === 'mar_signature' ? u.signature : sock(u, id, lv);
          const s = DD.Combat.state;
          const before = fp(s);
          const prev = t.tryRun('preview ' + id, function () { return DD.Combat.preview(u, sl, tg.x, tg.y); });
          t.eq(fp(s), before, id + ' L' + lv + ' @' + tg.x + ',' + tg.y + ': preview leaves the fight untouched');
          t.ok(prev && !prev.uncertain, id + ' L' + lv + ': no dice, so the preview is exact (not "?")');
          const hp = {};
          s.units.forEach(function (x) { hp[x.id] = x.hp; });
          t.ok(use(u, sl, tg.x, tg.y), id + ' L' + lv + ' @' + tg.x + ',' + tg.y + ': used');
          s.units.forEach(function (x) {
            const e = prev && prev.perUnit[x.id];
            const said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
            if (hp[x.id] - x.hp !== said) t.fail(id + ' L' + lv + ' @' + tg.x + ',' + tg.y + ': ' + x.name + ' HP change ' + (hp[x.id] - x.hp) + ' but preview said ' + said);
          });
          checks++;
        });
      }
    });
    t.ok(checks > 60, 'preview checks: ' + checks);
    // a remembered skill previews at its free cost and the preview does not use up the memory
    const u = arena();
    const sl = sock(u, 'mar_flurry', 1);
    const rs = A().addStatus(u, 'mar_remembered', { turns: 1, silent: true }, u);
    rs.data = { ids: ['mar_flurry'], used: {} };
    u.ap = 0;
    const p = DD.Combat.preview(u, sl, 5, 4);
    t.ok(p && p.perUnit[at(5, 4).id] && p.perUnit[at(5, 4).id].dmg === 9, 'flurry preview at a free cost with 0 AP');
    t.ok(has(u, 'mar_remembered'), 'preview does not use up the memory');
  });

  // ---- v2 edge cases --------------------------------------------------------------------------------------
  T.suite('hero_marbles: v2 edge cases (turns, stun, sheep, charm, AP, nulls, edges)', function (t) {
    if (!guard(t)) return;
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2 }] });
    let u = me();
    const sl = sock(u, 'mar_flurry', 1);
    A().addStatus(u, 'stun', { turns: 1 });
    t.eq(DD.Combat.canUse(u, sl), 'Stunned!', 'stunned: no skills');
    A().removeStatus(u, 'stun');
    A().addStatus(u, 'sleep', { turns: 1 });
    t.eq(DD.Combat.canUse(u, sl), 'Asleep. Zzz.', 'asleep: no skills');
    A().removeStatus(u, 'sleep');
    A().addStatus(u, 'sheep', { turns: 1 });
    t.eq(DD.Combat.canUse(u, sl), 'Baa. (Sheep can only move.)', 'sheep: no skills');
    t.eq(DD.Combat.canUse(u, u.basic), 'Baa. (Sheep can only move.)', 'sheep: no jab either');
    A().removeStatus(u, 'sheep');
    u.ap = 1;
    t.eq(DD.Combat.canUse(u, sl), 'Not enough AP.', 'not enough AP');
    t.eq(DD.Combat.canUse(u, u.basic), true, 'the 1-AP jab still works');
    // whose turn: on the knight's turn Marbles can't act
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 2, y: 2 }] });
    u = me();
    const wsl = sock(u, 'mar_whack', 1);
    DD.Combat.endTurn();
    t.eq(DD.Combat.canUse(u, wsl), 'Not Professor Marbles\'s turn.', 'not his turn: refused');
    t.ok(!use(u, wsl, 2, 2) && at(2, 2).hp === 14, 'and nothing happens');
    // in deployment: roll for initiative first
    DD.Combat.sandbox({ w: 8, h: 5, seed: 3, deploy: true, deployTiles: [{ x: 1, y: 2 }, { x: 1, y: 3 }], enemyAi: false,
      heroes: [{ id: HERO, x: 1, y: 2, level: 1 }], enemies: [{ id: 'test_grunt', x: 2, y: 2 }],
      objective: { type: 'custom' }, encounter: { id: 'mar_deploy', checkObjective: function () { return null; } } });
    u = me();
    t.eq(DD.Combat.canUse(u, u.basic), 'Roll for initiative first!', 'deployment: roll first');
    t.ok(!has(u, 'mar_remembered'), 'deployment: no memory yet (nothing before his first turn)');
    DD.Combat.rollInitiative();
    t.ok(mine() && has(me(), 'mar_remembered'), 'after the roll: his first turn, and he remembers a starting skill');
    // a rolled fight: d20 + 2
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 6, y: 2 }], initiative: 'roll', seed: 11 });
    const entry = DD.Combat.order().filter(function (e) { return e.unitId === me().id; })[0];
    t.ok(me().init === 2 && entry && entry.init === 2 && entry.total === entry.roll + 2 && entry.roll >= 1 && entry.roll <= 20,
      'rolled initiative: d20 + 2 (' + (entry && entry.roll) + ' + 2)');
    // charmed by the grunt: can't hurt it
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2 }] });
    u = me();
    const g = at(2, 2);
    A().addStatus(u, 'charmed', { turns: 1 }, g);
    use(u, sock(u, 'mar_flurry', 1), 2, 2);
    t.eq(g.hp, 14, 'charmed: no damage to the charmer');
    // nulls: every skill executed with no target / an empty far tile must not throw
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2 }] });
    u = me();
    ALL.forEach(function (id) {
      [1, 2, 3].forEach(function (lv) {
        const s = DD.getSkill(id);
        if (lv > s.levels.length) return;
        const ctx = DD.Targeting.buildCtx(u, DD.Act.makeSlot(id, lv), null);
        t.tryRun(id + ' L' + lv + ' with a null target', function () { DD.Combat._action(function () { s.execute(ctx); }); });
        const ctx2 = DD.Targeting.buildCtx(u, DD.Act.makeSlot(id, lv), { x: 7, y: 4 });
        t.tryRun(id + ' L' + lv + ' at an empty far tile', function () { DD.Combat._action(function () { s.execute(ctx2); }); });
      });
    });
    t.ok(sane(t, 'null targets'), 'null / far targets: no throws, sane state');
    // a dead target captured in a ctx
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2 }, { id: 'test_grunt', x: 6, y: 4 }] });
    u = me();
    const victim = at(2, 2);
    ['mar_punch', 'mar_flurry', 'mar_hook', 'mar_jab', 'mar_signature', 'mar_whack', 'mar_waxon', 'mar_carrot'].forEach(function (id) {
      const ctx = DD.Targeting.buildCtx(u, DD.Act.makeSlot(id, 1), { x: 2, y: 2 });
      if (!victim.dead) A().kill(victim, u);
      t.tryRun(id + ' on a dead target', function () { DD.Combat._action(function () { DD.getSkill(id).execute(ctx); }); });
    });
    t.ok(sane(t, 'dead target'), 'dead targets: no throws');
    // corner of the map: everything stays in bounds
    fight({ w: 5, h: 5, me: { x: 0, y: 0 }, enemies: [{ id: 'test_grunt', x: 1, y: 0 }, { id: 'test_grunt', x: 0, y: 1 }] });
    u = me();
    ['mar_scatter', 'mar_lecture', 'mar_backinmyday'].forEach(function (id) {
      const s2 = sock(u, id, 3);
      u.ap = 3;
      const tg = DD.Targeting.validTargets(u, s2)[0];
      t.ok(tg && use(u, s2, tg.x, tg.y), id + ' III from the corner');
    });
    t.eq(DD.Targeting.validTargets(u, sock(u, 'mar_whack', 1)).length, 2, 'whack from the corner: the 2 adjacent foes');
    u.ap = 3;
    use(u, sock(u, 'mar_whack', 1), 1, 0);
    t.ok(at(3, 0) && at(3, 0).defId === 'test_grunt', 'whacked along the edge: 2 tiles');
    t.ok(sane(t, 'corner'), 'corner: sane');
    // hop: he climbs 2 levels where the knight can't
    fight({ w: 6, h: 3, me: { x: 1, y: 1 }, allies: [{ id: 'test_knight', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 5, y: 0 }],
      terrain: function (tl) { if (tl.x === 2 && tl.y >= 1) tl.h = 2; } });
    t.ok(DD.Combat.reachable(me()).has('2,1'), 'hop: Marbles climbs a 2-level ledge');
    DD.Combat.endTurn();
    t.ok(!DD.Combat.reachable(hero('test_knight')).has('2,2'), 'the knight cannot');
    // durations count the foe's OWN turns: with the grunt acting first in each round, a Vulnerable from his turn covers
    // the grunt's next turn (in round 2) and ends with it
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 5 }], initiative: 'enemiesFirst' });
    u = me();
    const gr = at(2, 2);
    t.ok(DD.Combat.order()[0].unitId === gr.id && mine(), 'enemies first: the grunt already passed round 1, now his turn');
    use(u, sock(u, 'mar_scatter', 1), 2, 2);
    let vul = null;
    const off = onTurnOf(gr, function () { vul = has(gr, 'vulnerable'); });
    DD.Combat.endTurn();
    off();
    t.ok(mine() && round() === 2 && vul === true && !has(gr, 'vulnerable'), 'Vulnerable during its round-2 turn, gone after it');
    // Block from Back In My Day lasts through every enemy turn of the round and ends at his next turn start
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2 }, { id: 'test_grunt', x: 6, y: 4 }], ai: true });
    u = me();
    const hp6 = u.hp;
    use(u, sock(u, 'mar_backinmyday', 2), 1, 2);
    const seenBlock = [];
    const offs = DD.Combat.enemies().map(function (e) { return onTurnOf(e, function () { seenBlock.push(me().block); }); });
    DD.Combat.endTurn();
    offs.forEach(function (f) { f(); });
    t.eq(JSON.stringify(seenBlock), '[6,2]', 'Block up through both enemy turns: 6, then 2 after the taunted grunt\'s 4-damage stab');
    t.ok(mine() && me().block === 0 && me().hp === hp6, 'no HP lost; his Block resets at the start of his next turn');
    t.ok(sane(t, 'edge cases'), 'state sane');
  });

  // ---- attacks of opportunity (v2, DESIGN §4.2) ---------------------------------------------------------------
  /** Run fn while recording 'opportunity:attack' events: [{ a: attacker defId, m: mover defId, skill }]. */
  function opportunities(fn) {
    const seen = [];
    const off = DD.Events.on('opportunity:attack', function (e) { seen.push({ a: e.attacker.defId, m: e.mover.defId, skill: e.skillId }); });
    try { fn(); } finally { off(); }
    return seen;
  }

  T.suite('hero_marbles: attacks of opportunity (he holds the line; leaps, shoves and hooks never provoke)', function (t) {
    if (!guard(t)) return;
    // Marbles next to a grunt (Stab 4), a far knight so a down never ends the fight
    function duel(extra) {
      fight(Object.assign({ w: 9, h: 5, me: { x: 2, y: 2 }, allies: [{ id: 'test_knight', x: 8, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }] }, extra || {}));
      blank(me());
      return { u: me(), g: at(3, 2) };
    }
    // 1. walking away from an adjacent foe provokes its free attack; the walk goes on; no undo
    let d = duel();
    let u = d.u, g = d.g;
    const e = DD.Combat.reachable(u).get('0,2');
    t.ok(e && e.provokes.length === 1 && e.provokes[0] === g.id, 'walking away from the grunt: the move preview says it provokes the grunt');
    const pv = DD.Combat.provokes(u, 0, 2);
    t.ok(pv.length === 1 && pv[0].skillId === 'test_grunt_stab' && pv[0].dmg === 4, 'Combat.provokes: its Stab, for 4 (' + JSON.stringify(pv) + ')');
    let hp = u.hp;
    let seen = opportunities(function () { t.ok(DD.Combat.move(u, 0, 2), 'he walks away'); });
    t.ok(seen.length === 1 && seen[0].a === 'test_grunt' && seen[0].m === HERO, 'attack of opportunity: the grunt on him (' + JSON.stringify(seen) + ')');
    t.ok(u.hp === hp - 4 && u.x === 0 && u.y === 2, 'stabbed for 4; the walk goes on to the tile');
    t.ok(!DD.Combat.canUndo(), 'a move that provoked can\'t be undone');
    // a lethal one: downed on the tile he tried to leave
    d = duel();
    d.u.hp = 3;
    DD.Combat.move(d.u, 0, 2);
    t.ok(d.u.downed && d.u.x === 2 && d.u.y === 2, 'a stab that downs him ends the walk where it started');
    // 2. his mobility never provokes: Hare-Brained Leap (a leap), Walking Stick Whack (a shove), Vaudeville Hook (a pull)
    d = duel();
    hp = d.u.hp;
    seen = opportunities(function () { t.ok(use(d.u, sock(d.u, 'mar_leap', 1), 0, 2), 'he leaps away from the grunt'); });
    t.ok(!seen.length && d.u.hp === hp && d.u.x === 0 && !d.g.oppRound, 'Hare-Brained Leap: no attack of opportunity');
    d = duel();
    hp = d.u.hp;
    seen = opportunities(function () { use(d.u, sock(d.u, 'mar_whack', 1), 3, 2); });
    t.ok(!seen.length && d.g.x === 5 && !d.u.oppRound, 'Walking Stick Whack: the shoved grunt provokes nothing (pushes are no move action)');
    t.eq(DD.Combat.reachable(d.u).get('0,2').provokes.length, 0, 'shoved out of reach: walking away is free now');
    DD.Combat.move(d.u, 0, 2);
    t.eq(d.u.hp, hp, 'no stab');
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 4, y: 2 }] });
    u = me(); g = at(4, 2);
    const kn = hero('test_knight');
    seen = opportunities(function () { use(u, sock(u, 'mar_hook', 1), 4, 2); });
    t.ok(!seen.length && g.x === 2 && g.hp === 14 - 3 && !kn.oppRound, 'Vaudeville Hook: yanked past the knight, no attack of opportunity on a pull');
    t.ok(DD.AI.engaged(g).indexOf(u) >= 0, 'hooked next to him, the grunt is engaged: walking away would cost it a Jab');
    // 3. he strikes foes that walk away from him: a free Doddering Jab, once per round
    fight({ w: 9, h: 6, me: { x: 2, y: 2 }, allies: [{ id: 'test_knight', x: 8, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }, { id: 'test_grunt', x: 2, y: 3 }] });
    u = me();
    const a = at(3, 2), b = at(2, 3);
    t.ok(DD.Act.opportunitySlot(u) === u.basic, 'his attack of opportunity is his basic attack (Doddering Jab is melee)');
    t.eq(DD.AI.opportunityDmg(u, a), 5, 'the AI prices it at 5');
    const ap0 = u.ap;
    const barked = [], mb0 = DD.Act.maybeBark;
    DD.Act.maybeBark = function (unit, key) { if (unit === u) barked.push(key); return ''; };
    try {
      seen = opportunities(function () { DD.AI.moveTo(a, 6, 2); });
    } finally { DD.Act.maybeBark = mb0; }
    t.ok(seen.length === 1 && seen[0].a === HERO && seen[0].skill === 'mar_jab', 'the grunt walking away gets the Jab (' + JSON.stringify(seen) + ')');
    t.ok(barked.indexOf('opportunity') >= 0, 'and maybe a "Class is NOT dismissed!" bark (' + barked.join(', ') + ')');
    t.ok(a.hp === 14 - 5 && a.x === 6, '5 damage, and it walks on');
    t.ok(u.ap === ap0 && !u.basic.cd, 'free: no AP, no cooldown');
    t.eq(u.oppRound, round(), 'his reaction is spent for this round');
    seen = opportunities(function () { DD.AI.moveTo(b, 0, 4); });
    t.ok(!seen.length && b.hp === 14 && b.x === 0, 'a second grunt slips away the same round: at most one per round');
    DD.Combat.endRound();
    t.ok(mine() && round() === 2, 'round 2, his turn');
    A().teleport(b, 2, 3);
    seen = opportunities(function () { DD.AI.moveTo(b, 0, 4); });
    t.ok(seen.length === 1 && b.hp === 14 - 5, 'a new round: he strikes again');
    // the combo: a Vulnerable foe (Marble Scatter) takes round(5 × 1.25) = 6 from the Jab
    d = duel();
    use(d.u, sock(d.u, 'mar_scatter', 1), 3, 2);
    t.ok(has(d.g, 'vulnerable'), 'the grunt slipped on the marbles');
    DD.AI.moveTo(d.g, 6, 2);
    t.eq(d.g.hp, 14 - 6, 'walking off the marbles: the Jab hits the Vulnerable grunt for 6');
    // 4. no attack of opportunity while he is stunned / asleep / a sheep / downed, nor on his charmer
    ['stun', 'sleep', 'sheep'].forEach(function (id) {
      const v = duel();
      A().addStatus(v.u, id, { turns: 1 });
      t.eq(DD.Act.opportunityOf(v.u, v.g), null, id + ': he makes none');
      DD.AI.moveTo(v.g, 6, 2);
      t.eq(v.g.hp, 14, id + ': the grunt walks away unpunished');
    });
    d = duel();
    A().addStatus(d.u, 'charmed', { turns: 1 }, d.g);
    t.eq(DD.Act.opportunityOf(d.u, d.g), null, 'charmed by the grunt: no swing at his charmer');
    d = duel();
    d.u.hp = 1;
    A().damage(null, d.u, 5, { cause: 'other' });
    t.ok(d.u.downed, 'downed');
    seen = opportunities(function () { DD.AI.moveTo(d.g, 6, 2); });
    t.eq(seen.length, 0, 'downed: no attack of opportunity');
    // 5. his control lets the party disengage for free: stunned, asleep and taunted foes don't strike the leavers
    d = duel();
    use(d.u, sock(d.u, 'mar_punch', 1), 3, 2);
    hp = d.u.hp;
    t.eq(DD.Combat.reachable(d.u).get('0,2').provokes.length, 0, 'Rabbit Punch: the stunned grunt can\'t strike');
    DD.Combat.move(d.u, 0, 2);
    t.eq(d.u.hp, hp, 'he strolls off untouched');
    d = duel();
    use(d.u, sock(d.u, 'mar_lecture', 3), 2, 2);
    hp = d.u.hp;
    DD.Combat.move(d.u, 0, 2);
    t.ok(d.u.x === 0 && d.u.hp === hp && has(d.g, 'sleep'), 'Lecture: he tiptoes away from the sleeper (no stab, it sleeps on)');
    function mageLeaves(taunt) {
      fight({ w: 9, h: 6, me: { x: 2, y: 2 }, allies: [{ id: 'test_mage', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }] });
      const v = me(), mage = hero('test_mage');
      if (taunt) use(v, sock(v, 'mar_backinmyday', 1), 2, 2);
      DD.Combat.endTurn();
      const mhp = mage.hp;
      const n = DD.Combat.current() === mage ? DD.Combat.reachable(mage).get('5,4').provokes.length : -1;
      DD.Combat.move(mage, 5, 4);
      return { n: n, lost: mhp - mage.hp, at: mage.x + ',' + mage.y };
    }
    const free = mageLeaves(false);
    t.ok(free.n === 1 && free.lost === 4, 'control: the mage leaving the grunt is stabbed (' + JSON.stringify(free) + ')');
    const tt = mageLeaves(true);
    t.ok(tt.n === 0 && tt.lost === 0 && tt.at === '5,4', 'Back In My Day: the grunt taunted by him only strikes him, the mage walks away free (' + JSON.stringify(tt) + ')');
    fight({ w: 9, h: 7, me: { x: 3, y: 3 }, allies: [{ id: 'test_knight', x: 8, y: 6 }],
      enemies: [{ id: 'test_grunt', x: 4, y: 3, hpMult: 2 }, { id: 'test_grunt', x: 3, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 2, y: 3, hpMult: 2 }] });
    u = me();
    DD.Combat.state.hype = 100;
    use(u, u.signature, 3, 3);
    hp = u.hp;
    seen = opportunities(function () { DD.Combat.move(u, 3, 0); });
    t.ok(!seen.length && u.hp === hp && u.y === 0, 'Forgot I Was Retired: three stunned foes, and he walks out of the middle of them for free');
    // 6. reach-aware foes: a grunt engaged with him keeps swinging at him, not at the 4-HP mage two tiles away
    fight({ w: 9, h: 5, me: { x: 2, y: 2 }, allies: [{ id: 'test_mage', x: 5, y: 2 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }], ai: true });
    u = me();
    const mage = hero('test_mage');
    mage.hp = 4;
    hp = u.hp;
    DD.Combat.endRound();
    t.ok(mage.hp === 4 && u.hp === hp - 4 && at(3, 2), 'he holds the line: the grunt stays and stabs him (mage ' + mage.hp + ' HP, Marbles −' + (hp - u.hp) + ')');
    t.ok(sane(t, 'opportunity'), 'state sane');
  });

  // ---- AutoPlay ------------------------------------------------------------------------------------------
  T.suite('hero_marbles: AutoPlay v2 battles at levels 1/3/5', function (t) {
    if (!guard(t)) return;
    if (!DD.Encounter || typeof DD.Encounter.build !== 'function') { t.skip('no DD.Encounter'); return; }
    const RUNS = [
      { level: 1, skills: [['mar_whack', 1], ['mar_scatter', 1]], encs: ['test_a1_normal', 'test_a1_normal'] },
      { level: 3, skills: [['mar_whack', 2], ['mar_scatter', 1], ['mar_punch', 1]], encs: ['test_a1_normal', 'test_a1_elite', 'test_a1_boss'] },
      { level: 3, skills: [['mar_hook', 1], ['mar_flurry', 1], ['mar_carrot', 1]], encs: ['test_a2_normal', 'test_a1_elite'] },
      { level: 5, skills: [['mar_punch', 2], ['mar_flurry', 2], ['mar_lecture', 1], ['mar_backinmyday', 1]], encs: ['test_a2_normal', 'test_a2_elite', 'test_a2_boss'], hype: true },
      { level: 5, skills: [['mar_hook', 2], ['mar_leap', 2], ['mar_waxon', 1], ['mar_scatter', 2]], encs: ['test_a3_normal', 'test_a3_elite', 'test_a3_boss'], hype: true },
    ];
    const used = {};
    const orig = DD.Combat.useSkill;
    let fights = 0, wins = 0, rounds = 0, charge = false;
    DD.Combat.useSkill = function (unit, slot) {
      const ok = orig.apply(DD.Combat, arguments);
      if (ok && unit && unit.defId === HERO && slot) used[slot.id] = (used[slot.id] || 0) + 1;
      return ok;
    };
    // a charged signature on each of his turns (the fixture allies' signatures share the party's Hype): does AutoPlay use it?
    const offCharge = DD.Events.on('turn:start', function (e) { if (charge && e.unit && e.unit.defId === HERO && DD.Combat.state) DD.Combat.state.hype = 100; });
    try {
      RUNS.forEach(function (run, ri) {
        const party = ['marbles', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
          if (id !== HERO) return DD.Combat.makeRunHero({ id: id, level: run.level });
          return DD.Combat.makeRunHero({ id: id, level: run.level, skills: run.skills.map(function (p) { return { id: p[0], level: p[1] }; }) });
        });
        run.encs.forEach(function (encId, ei) {
          const enc = DD.getEncounter(encId);
          if (!enc) return;
          const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('mar-auto-' + ri + '-' + ei), difficulty: 'normal', act: enc.act });
          DD.Combat.start(setup, { seed: 100 + ri * 7 + ei, headless: true, difficulty: 'normal', kind: enc.kind });
          charge = !!run.hype;
          const res = DD.AutoPlay.runBattle(30);
          charge = false;
          fights++; rounds += res.rounds;
          if (res.result === 'victory') wins++;
          sane(t, 'autoplay L' + run.level + ' ' + encId);
          t.ok(res.result === 'victory' || res.result === 'defeat' || res.timeout, 'L' + run.level + ' ' + encId + ': battle finished (' + res.result + ', ' + res.rounds + ' rounds)');
          t.log('L' + run.level + ' ' + encId + ' [' + run.skills.map(function (p) { return p[0] + p[1]; }).join(' ') + ']: ' + res.result + ' in ' + res.rounds + ' rounds');
        });
      });
    } finally { DD.Combat.useSkill = orig; offCharge(); }
    const socketed = Object.keys(used).filter(function (id) { return POOL.indexOf(id) >= 0; });
    t.log('Marbles skill uses: ' + JSON.stringify(used) + ' · fights ' + fights + ', wins ' + wins + ', avg rounds ' + (rounds / Math.max(1, fights)).toFixed(1));
    t.ok(fights >= 12, 'fought ' + fights + ' battles');
    t.ok(wins >= fights * 0.5, 'the party wins most fixture fights (' + wins + '/' + fights + ')');
    t.ok((used.mar_jab || 0) > 0, 'basic attack used');
    t.ok((used.mar_signature || 0) > 0, 'signature used when charged');
    t.ok(socketed.length >= 8, 'at least 8 of the 10 pool skills used by AutoPlay (' + socketed.join(', ') + ')');
  });

  T.suite('hero_marbles: AutoPlay reads his kit (signature, free skill, wind-up interrupt)', function (t) {
    if (!guard(t)) return;
    // three foes within 3 tiles and 100 Hype: the signature is the play
    fight({ w: 9, h: 9, me: { x: 4, y: 4, skills: [{ id: 'mar_whack', level: 1 }] }, allies: [{ id: 'test_cleric', x: 0, y: 8 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }, { id: 'test_grunt', x: 2, y: 4 }], ai: true });
    let u = me();
    DD.Combat.state.hype = 100;
    const used = [];
    const orig = DD.Combat.useSkill;
    DD.Combat.useSkill = function (unit, slot) { const ok = orig.apply(DD.Combat, arguments); if (ok && unit === u) used.push(slot.id); return ok; };
    try { DD.AutoPlay.takeTurn(); } finally { DD.Combat.useSkill = orig; }
    t.ok(used.indexOf('mar_signature') >= 0, 'AutoPlay fires Forgot I Was Retired into 3 foes (' + used.join(', ') + ')');
    t.ok(DD.Combat.enemies().every(function (f) { return f.dead || has(f, 'stun'); }), 'and they are all Stunned');
    // the remembered skill is free for AutoPlay too: with 1 AP left it still uses the free 2-AP Rabbit Punch
    fight({ w: 9, h: 5, me: { x: 1, y: 2, skills: [{ id: 'mar_punch', level: 1 }] }, enemies: [{ id: 'test_grunt', x: 2, y: 2, hpMult: 3 }], ai: true });
    u = me();
    t.ok(has(u, 'mar_remembered') && st(u, 'mar_remembered').data.ids[0] === 'mar_punch', 'he remembers Rabbit Punch');
    u.ap = 1;
    DD.AutoPlay.takeTurn();
    t.ok(has(at(2, 2), 'stun'), 'AutoPlay punches for free with 1 AP left');
    // a boss winding up next to him gets punched out of it
    fight({ w: 9, h: 5, me: { x: 1, y: 2, skills: [{ id: 'mar_punch', level: 1 }] }, allies: [{ id: 'test_knight', x: 1, y: 3 }],
      enemies: [{ id: 'test_boss', x: 2, y: 2 }], ai: true });
    u = me();
    const boss = at(2, 2);
    DD.AI.windUp(boss, 'test_boss_meteor', { x: 1, y: 3 }, { label: 'Meteor' });
    DD.AutoPlay.takeTurn();
    t.ok(boss.intents.length === 0, 'AutoPlay interrupts the boss\'s wind-up (stun)');
    t.ok(sane(t, 'autoplay reads'), 'state sane');
  });

  // ---- v2 requests (user, Nov 3): heals on the downed, barrels, flyers --------------------------------------------
  T.suite('hero_marbles: v2 requests — a carrot gets a downed ally up, his fists set barrels off, flyers float over marbles', function (t) {
    if (!guard(t)) return;
    // 1. Carrot Toss aimed at a downed ally: back up with the carrot's HP (preview "UP! N HP"), a charge spent, 1 AP
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('mar_carrot', lv);
      fight({ w: 8, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 4, y: 2 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
      const u = me(), k = hero('test_knight');
      A().kill(k, null);
      t.ok(k.downed, 'carrot L' + lv + ': knight down');
      const sl = sock(u, 'mar_carrot', lv);
      const tg = DD.Targeting.validTargets(u, sl).filter(function (q) { return q.x === 4 && q.y === 2; })[0];
      t.ok(!!tg && tg.revive === true, 'carrot L' + lv + ': the downed knight is a target (revive)');
      const pv = DD.Targeting.preview(u, sl, { x: 4, y: 2 });
      const e = pv.perUnit[k.id];
      t.ok(!!e && e.revived && e.heal === Lv.heal && e.text.indexOf('UP! ' + Lv.heal + ' HP') >= 0, 'carrot L' + lv + ': preview "UP! ' + Lv.heal + ' HP" (' + (e && e.text) + ')');
      const ap0 = u.ap;
      t.ok(use(u, sl, 4, 2), 'carrot L' + lv + ' thrown at the downed knight');
      t.ok(!k.downed && k.hp === Lv.heal && k.ap === 0, 'carrot L' + lv + ': up at ' + Lv.heal + ' HP, 0 AP (' + k.hp + ')');
      t.eq(ap0 - u.ap + '/' + sl.uses, '1/1', 'carrot L' + lv + ': 1 AP and one of his 3 carrots');
      t.ok(DD.Combat.state.log.some(function (l) { return /back up \(\d+ HP\), thanks to Professor Marbles/.test(l.text); }), 'carrot L' + lv + ': the normal revive line');
    });
    // out of range stays out of range; his own Help Up skills are untouched (Help Up is an interaction)
    fight({ w: 9, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 6, y: 2 }], enemies: [{ id: 'test_grunt', x: 8, y: 4 }] });
    A().kill(hero('test_knight'), null);
    t.ok(!DD.Targeting.isValidTarget(me(), sock(me(), 'mar_carrot', 1), 6, 2), 'carrot: a downed ally 5 tiles away is out of range');
    // Wax On (a buff, no heal) can't be aimed at the downed
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, allies: [{ id: 'test_knight', x: 3, y: 2 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    A().kill(hero('test_knight'), null);
    t.ok(!DD.Targeting.isValidTarget(me(), sock(me(), 'mar_waxon', 1), 3, 2), 'Wax On is not a heal: no target on the downed');

    // 2. barrels: the Jab sets an adjacent one off (he is in the blast), the Hook one 2+ tiles away in a line
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 3, y: 3 }, { id: 'test_grunt', x: 7, y: 4 }], objects: [{ x: 2, y: 3, id: 'barrel_explosive' }] });
    let u = me();
    const g = at(3, 3);
    let sl = sock(u, 'mar_jab', 1);
    t.ok(DD.Targeting.validTargets(u, sl).some(function (q) { return q.obj && q.x === 2 && q.y === 3; }) === false, 'Jab: a diagonal barrel is not adjacent');
    u.x = 2; u.y = 4; // test setup: under the barrel
    t.ok(DD.Targeting.validTargets(u, sl).some(function (q) { return q.obj && q.x === 2 && q.y === 3; }), 'Jab: an adjacent barrel is a target');
    const pv = DD.Targeting.preview(u, sl, { x: 2, y: 3 });
    t.ok(pv.detonates === 'barrel_explosive' && pv.perUnit[u.id] && pv.perUnit[u.id].dmg === 8 && pv.perUnit[g.id] && pv.perUnit[g.id].dmg === 8,
      'preview: it blows up in his face too (8 each)');
    t.ok(use(u, sl, 2, 3), 'Jab at the barrel');
    t.ok(!tile(2, 3).obj && u.hp === u.maxHp - 8 && g.hp === 6, 'KABOOM: Marbles and the grunt next to it take 8 each');
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 5, y: 1 }, { id: 'test_grunt', x: 7, y: 4 }], objects: [{ x: 4, y: 2, id: 'barrel_explosive' }] });
    u = me();
    sl = sock(u, 'mar_hook', 1);
    t.ok(DD.Targeting.validTargets(u, sl).some(function (q) { return q.obj && q.x === 4 && q.y === 2; }), 'Hook: a barrel 3 tiles away in a line');
    t.ok(use(u, sl, 4, 2) && !tile(4, 2).obj && at(5, 1).hp === 14 && u.hp === u.maxHp && sl.cd === 2, 'Hook at the barrel: it goes off where it stands (nothing yanked, a diagonal foe is outside radius 1), cooldown 2');

    // 3. flyers: a flying foe pushed across his marbles never slips (the engine and his slip check agree)
    fight({ w: 8, h: 5, me: { x: 1, y: 2 }, enemies: [{ id: 'test_grunt', x: 2, y: 2 }, { id: 'test_grunt', x: 7, y: 4 }],
      surfaces: [{ x: 3, y: 2, id: 'mar_marbles', turns: 3 }, { x: 4, y: 2, id: 'mar_marbles', turns: 3 }] });
    u = me();
    const fl = at(2, 2);
    fl.flags = Object.assign({}, fl.flags, { flying: true });
    t.ok(use(u, sock(u, 'mar_whack', 1), 2, 2), 'whack a flyer across the marbles');
    t.ok(fl.x === 4 && !has(fl, 'vulnerable'), 'it sails over both marble tiles: no slip (' + fl.x + ',' + fl.y + ')');
    t.ok(sane(t, 'v2 requests'), 'state sane');
  });

  // ---- balance sim (manual: tools/test.sh "suite=hero_marbles: zz&sim=1&n=3") ---------------------------------
  T.suite('hero_marbles: zz balance sim (sim=1 only)', function (t) {
    if (t.param('sim', '0') !== '1') { t.skip('sim=1 only'); return; }
    if (!guard(t) || !DD.Encounter) return;
    const n = Math.max(1, +t.param('n', 2) || 2);
    const encs = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; })
      .filter(function (e) { return !/^(test_|mgt_|mg_)/.test(e.id) && e.kind !== 'boss'; });
    const pool = Object.keys(DD.defs.heroes).filter(function (k) { return k.indexOf('test_') !== 0 && k !== HERO; });
    const rng = DD.RNG('mar-sim:' + t.seed);
    const tally = {}, uses = {}, sockets = {};
    let fights = 0, wins = 0, free = 0, hisTurns = 0;
    // his skill uses (and the free ones: the remembered skill), per fight in which the skill was socketed
    const orig = DD.Combat.useSkill;
    DD.Combat.useSkill = function (unit, slot) {
      const ap0 = unit ? unit.ap : 0;
      const ok = orig.apply(DD.Combat, arguments);
      if (ok && unit && unit.defId === HERO && slot) {
        uses[slot.id] = (uses[slot.id] || 0) + 1;
        if (POOL.indexOf(slot.id) >= 0 && unit.ap === ap0) free++;
      }
      return ok;
    };
    const offTurns = DD.Events.on('turn:start', function (e) { if (e.unit && e.unit.defId === HERO) hisTurns++; });
    // attacks of opportunity: made by him (his Jab on foes walking off) and suffered by him (his own walks)
    const opp = { by: 0, on: 0 };
    const offOpp = DD.Events.on('opportunity:attack', function (e) {
      if (e.attacker && e.attacker.defId === HERO) opp.by++;
      if (e.mover && e.mover.defId === HERO) opp.on++;
    });
    function oneFight(enc) {
      const others = pool.length >= 3 ? rng.sample(pool, 3) : ['test_knight', 'test_cleric', 'test_mage'];
      const ids = rng.shuffle([HERO].concat(others));
      // v2 slow leveling: about level 2 in act 1, 3-4 in act 2, 5 in act 3 (DESIGN §5)
      const lvl = enc.act === 1 ? 2 : enc.act === 2 ? 3 : 5;
      const party = ids.map(function (id) {
        const h = DD.getHero(id);
        const extra = (h.skillPool || []).filter(function (sid) { return h.startingSkills.indexOf(sid) < 0; });
        const pick = rng.sample(extra, enc.act === 1 ? 1 : 2);
        const sl = Math.min(3, 1 + Math.floor((lvl - 1) / 2));
        if (id === HERO) h.startingSkills.concat(pick).forEach(function (sid) { sockets[sid] = (sockets[sid] || 0) + 1; });
        return DD.Combat.makeRunHero({ id: id, level: lvl, skills: h.startingSkills.concat(pick).map(function (sid) { return { id: sid, level: sl }; }) });
      });
      const setup = DD.safe('build ' + enc.id, DD.Encounter.build, DD.Encounter, [enc, party, { rng: DD.RNG(rng.int(1, 1e9)), difficulty: 'normal', act: enc.act }]);
      if (!setup || !setup.grid) return;
      DD.Combat.start(setup, { seed: rng.int(1, 1e9), headless: true, difficulty: 'normal', kind: enc.kind });
      const res = DD.AutoPlay.runBattle(30);
      const s = DD.Combat.state;
      fights++;
      if (res.result === 'victory') wins++;
      s.units.filter(function (u) { return u.kind === 'hero'; }).forEach(function (u) {
        const r = tally[u.defId] || (tally[u.defId] = { fights: 0, dmg: 0, kills: 0, downs: 0 });
        const us = s.stats.units[u.id] || {};
        r.fights++; r.dmg += us.dmg || 0; r.kills += us.kills || 0; r.downs += u.downed ? 1 : 0;
      });
    }
    try {
      encs.forEach(function (enc) { for (let i = 0; i < n; i++) oneFight(enc); });
    } finally { DD.Combat.useSkill = orig; offTurns(); offOpp(); }
    Object.keys(tally).sort().forEach(function (id) {
      const r = tally[id];
      t.log(id + ': ' + r.fights + ' fights · dmg/fight ' + (r.dmg / r.fights).toFixed(1) + ' · kills/fight ' + (r.kills / r.fights).toFixed(2) + ' · downed ' + r.downs);
    });
    t.log('Marbles uses per fight when socketed: ' + POOL.filter(function (id) { return sockets[id]; }).map(function (id) {
      return DD.getSkill(id).name + ' ' + ((uses[id] || 0) / sockets[id]).toFixed(2) + ' (' + sockets[id] + ')';
    }).join(' · '));
    t.log('jab ' + (uses.mar_jab || 0) + ' · signature ' + (uses.mar_signature || 0) + ' · free (remembered) uses ' + free + ' in ' + hisTurns + ' of his turns');
    t.log('attacks of opportunity: by him ' + opp.by + ' (' + (opp.by / Math.max(1, fights)).toFixed(2) + '/fight) · on him ' + opp.on + ' (' + (opp.on / Math.max(1, fights)).toFixed(2) + '/fight)');
    t.log('fights ' + fights + ', wins ' + wins);
    t.ok(fights > 0, 'simulated');
  });
})();
