/* Dungeons and Degenerates — tests/content/hero_biz.js
 * Suites "hero_biz: …" for js/data/heroes/biz.js (owner: HERO-BIZ; spec .tmp/h19/addendum-biz.md §18): the hero def,
 * the Rivet Gun, Batteries Included (deploy, scrap, the Scrap Heap, the timed reboot), both constructs at Mk I-III, every
 * Biz skill at every level, the items, HUD previews, v2 edge cases, attacks of opportunity and the Hjalmar gag, AutoPlay
 * (scores and fixture battles), the painters at every yaw, combos with the cast (skipped when a file isn't loaded), the
 * conditional heal (Nov 18, D9: the bask is his ONE heal) and the zz sim (sim=1 only).
 * Run: bash tools/test.sh "suite=hero_biz&isolate=heroes/biz,hero_biz"
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const HERO = 'biz';
  const POOL = ['biz_duct_tape', 'biz_overclock', 'biz_reboot', 'biz_red_button', 'biz_hide', 'biz_firmware', 'biz_www', 'biz_zip_line', 'biz_synergy'];
  const OWN = ['biz_rivet_gun', 'biz_spoodmarino'].concat(POOL);
  const BOT_SKILLS = ['biz_monkey_wrench', 'biz_cymbal_crash', 'biz_pew_pew', 'biz_thwip'];
  const ITEMS = ['biz_universal_remote', 'biz_warranty', 'biz_spare_tail'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const CUSTOM_BARKS = ['overclock', 'bask', 'scrap_hjalmarino', 'scrap_spooder', 'reboot', 'boom', 'firmware', 'web', 'zip', 'hide', 'tape', 'tail',
    'warranty', 'tin_double'];
  const BOT_BARKS = ['spawn', 'select', 'attack', 'hurt', 'death'];
  const RESERVED = ['Rivet Gun', 'Duct Tape', 'Overclock', 'Turn It Off and On Again', 'Big Red Button', 'Nothing to See Here', 'Firmware Update',
    'World Wide Web', 'Zip Line', 'Synergy', 'Spoodmarino!', 'Monkey Wrench', 'Cymbal Crash', 'Pew Pew', 'Thwip!', 'Batteries Included',
    'Overclocked', 'Updated', 'Rebuilding', 'Booting Up', 'Scrap Heap', 'Hjalmarino', 'Spooder', 'Mechanical Monkey', 'Mechanical Spider', 'Universal Remote',
    'Extended Warranty', 'Spare Tail'];

  // ---- helpers -----------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function Bz() { return DD.Biz; }
  function ready(t) {
    if (!DD.getHero(HERO) || !Bz()) { t.skip('biz.js not loaded'); return false; }
    return true;
  }
  /** Sandbox that never ends on its own, 9×9 stone, heroes first; enemies pass unless cfg.enemyAi is true. */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = (cfg.heroes || [{ x: 2, y: 4 }]).map(function (h) { return Object.assign({ id: HERO, level: 1, skills: [] }, h); });
    DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, enemyAi: false, enemies: [],
      objective: { type: 'custom', text: 'Biz test' }, encounter: { id: 'biz_test_arena', checkObjective: function () { return null; } },
    }, cfg, { heroes: heroes }));
    return DD.Combat.state;
  }
  function B() { return DD.Combat.heroes().filter(function (u) { return u.defId === HERO; })[0]; }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function hj(u) { return Bz().constructOf(u || B(), 'hjalmarino'); }
  function sp(u) { return Bz().constructOf(u || B(), 'spooder'); }
  function foes() { return DD.Combat.enemies(); }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }
  function norm(s) { return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim(); }
  /** Move a unit to (x, y) (a test setup: no tile effects); the tile must be free. */
  function put(t, u, x, y) {
    if (!u) { t.fail('put: no unit'); return null; }
    if (u.x === x && u.y === y) return u;
    const ok = A().teleport(u, x, y, { fx: false, noEnter: true });
    if (!ok) t.fail('put ' + u.name + ' on ' + x + ',' + y + ' (not free)');
    return u;
  }
  /** Both constructs to the given tiles (an [x, y] each, or null to leave one). */
  function bots(t, h, s) {
    // park them on free tiles that are neither target first, so the two moves never collide
    const want = [h, s].filter(Boolean).map(function (p) { return p[0] + ',' + p[1]; });
    const spare = DD.Combat.state.grid.tiles.filter(function (tl) { return DD.Grid.isFree(tl.x, tl.y) && want.indexOf(tl.x + ',' + tl.y) < 0; })
      .sort(function (a, b) { return (b.x + b.y) - (a.x + a.y) || b.y - a.y; });
    [[hj(), h], [sp(), s]].forEach(function (p) {
      const c = p[0], to = p[1];
      if (!c || (to && c.x === to[0] && c.y === to[1])) return;
      const q = spare.shift();
      if (q) A().teleport(c, q.x, q.y, { fx: false, noEnter: true });
    });
    if (h && hj()) put(t, hj(), h[0], h[1]);
    if (s && sp()) put(t, sp(), s[0], s[1]);
  }
  /** The slot Biz uses for a skill: his basic / signature, or a fresh socket at a level (only that one socketed). */
  function give(u, id, level) {
    level = level || 1;
    if (id === 'biz_rivet_gun') return u.basic;
    if (id === 'biz_spoodmarino') return u.signature;
    const sl = DD.Act.makeSlot(id, level);
    u.skills = [sl];
    return sl;
  }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0]; }
  function use(t, u, sl, x, y, label) {
    const why = DD.Combat.canUse(u, sl);
    const ok = why === true && DD.Combat.useSkill(u, sl, x, y);
    t.ok(ok, (label || (sl && sl.id)) + ' used @' + x + ',' + y + (why === true ? '' : ' (' + why + ')'));
    return ok;
  }
  function valid(u, sl, x, y) { return DD.Targeting.isValidTarget(u, sl, x, y); }
  /** End turns until it is u's turn again (the other heroes pass; enemies pass unless the fight has enemyAi). */
  function toHisTurn(u) {
    for (let i = 0; i < 12; i++) {
      DD.Combat.endTurn();
      if (DD.Combat.current() === u || DD.Combat.state.result) return true;
    }
    return false;
  }
  function desc(id, level, user) { return DD.skillDesc(DD.getSkill(id), level, user || null); }
  function ctxFor(u, sl, target) { return DD.Targeting.buildCtx(u, sl, target); }
  function canTarget(u, sl, target) {
    const d = DD.getSkill(sl.id), c = ctxFor(u, sl, target);
    return d.target.canTarget ? d.target.canTarget(c) : true;
  }
  function hypeGains(fn) {
    const list = [], orig = DD.Act.gainHype;
    DD.Act.gainHype = function (n, why) { list.push({ n: n, why: String(why || '') }); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.Act.gainHype = orig; }
    return list;
  }
  /** Every DD.Act.heal call made while fn runs: [{ src, target, n, via, healed, sim }]. */
  function healCalls(fn) {
    const list = [], orig = DD.Act.heal;
    DD.Act.heal = function (src, target, n, opts) {
      const healed = orig.apply(this, arguments);
      list.push({ src: src, target: target, n: n, via: opts && opts.via, healed: healed, sim: !!DD.Act.simulating });
      return healed;
    };
    try { fn(); } finally { DD.Act.heal = orig; }
    return list;
  }
  function lifts(calls) { return calls.filter(function (x) { return !x.sim && x.via === 'lift:biz'; }); }
  function logged(re, fn) {
    const list = [], orig = A().log;
    A().log = function (msg) { if (re.test(String(msg))) list.push(String(msg)); return orig.apply(this, arguments); };
    try { fn(); } finally { A().log = orig; }
    return list;
  }
  /** Bark keys / texts tried on units while fn runs (the cosmetic rolls forced low, so every roll "speaks"). */
  function barks(fn) {
    const out = [], b = A().bark, rn = DD.rng.next;
    A().bark = function (who, key) { out.push({ who: who, key: String(key) }); return b.apply(this, arguments); };
    DD.rng.next = function () { return 0; };
    try { fn(); } finally { A().bark = b; DD.rng.next = rn; }
    return out;
  }
  /** Preview, use for real, then compare HP changes / KOs / movement / births / Hype (no dice in his kit: exact). */
  function previewMatches(t, u, sl, x, y, label) {
    const s = DD.Combat.state;
    const before = {};
    s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed, x: o.x, y: o.y }; });
    const hype0 = s.hype, rng0 = s.rng.getState(), n0 = s.units.length;
    let prev = null;
    t.tryRun(label + ' preview', function () { prev = DD.Combat.preview(u, sl, x, y); });
    t.ok(!!prev && s.rng.getState() === rng0 && s.hype === hype0 && s.units.length === n0 &&
      s.units.every(function (o) { const b = before[o.id]; return b && b.hp === o.hp && b.x === o.x && b.y === o.y; }), label + ': preview left the fight untouched');
    if (!prev) return;
    t.ok(!prev.uncertain, label + ': the preview is certain (no dice in his kit)');
    if (!use(t, u, sl, x, y, label)) return;
    s.units.forEach(function (o) {
      const b = before[o.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[o.id];
      t.eq(b.hp - o.hp, e ? (e.dmg || 0) - (e.heal || 0) : 0, label + ': ' + o.name + ' HP change = preview');
      t.eq((o.dead && !b.dead) || (o.downed && !b.downed), !!(e && e.lethal), label + ': ' + o.name + ' KO = preview');
      if (!o.dead && !(e && e.lethal)) t.eq(o.x !== b.x || o.y !== b.y, !!(e && e.moved), label + ': ' + o.name + ' movement = preview');
    });
    const born = s.units.filter(function (o) { return !before[o.id] && !o.dead; }).length;
    t.eq(born, (prev.spawned || []).length, label + ': units built = preview');
    t.eq(s.hype - hype0, prev.hype, label + ': Hype = preview');
  }
  /** Every Biz text a player reads (hero, skills, items, statuses, the object, tips): for name / pronoun lints. */
  function bizTexts() {
    const h = DD.getHero(HERO), parts = [h.blurb, h.role, h.passive.desc];
    OWN.forEach(function (id) { const s = DD.getSkill(id); for (let lv = 1; lv <= s.levels.length; lv++) parts.push(desc(id, lv)); parts.push(s.flavor || ''); });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); parts.push(it.desc, it.flavor || ''); });
    Object.keys(h.barks).forEach(function (k) { Array.prototype.push.apply(parts, h.barks[k]); });
    [Bz().OVER, Bz().UPDATED, Bz().REBUILD, Bz().BOOT].forEach(function (id) { parts.push(DD.getStatus(id).desc({ data: { bask: 3, flat: 1, list: [{ name: 'Spooder', left: 2 }] } })); });
    parts.push(DD.getStatus(Bz().BOOT).desc({ data: { ready: true } }));
    parts.push(DD.getObject(Bz().SCRAP).desc);
    Array.prototype.push.apply(parts, Bz().TIN_LINES);
    return parts;
  }
  /** The constructs' own texts (plan D8): summon name / names / desc / barks, their four skills' name / flavor / descs. */
  function botTexts() {
    const parts = [];
    [Bz().HJ, Bz().SP].forEach(function (id) {
      const d = DD.getSummon(id);
      parts.push(d.name, d.desc);
      Array.prototype.push.apply(parts, d.names || []);
      Object.keys(d.barks || {}).forEach(function (k) { Array.prototype.push.apply(parts, d.barks[k]); });
    });
    BOT_SKILLS.forEach(function (id) { const s = DD.getSkill(id); parts.push(s.name, s.flavor || ''); for (let lv = 1; lv <= 3; lv++) parts.push(desc(id, lv)); });
    return parts;
  }

  // ---- 1. definition --------------------------------------------------------------------------------------
  T.suite('hero_biz: definition, pool, constructs, barks, items, names, pronouns', function (t) {
    if (!ready(t)) return;
    const h = DD.getHero(HERO);
    t.ok(h.name === 'Biz' && h.epithet === 'the Subcontractor' && h.race === 'Lizardfolk' && h.cls === 'Artificer', 'Biz the Subcontractor, Lizardfolk Artificer');
    t.eq(h.role, 'Robot commander · hides behind bots', 'role (35 characters)');
    t.eq(h.complexity, 3, 'complexity ★★★');
    t.eq(h.color, '#3a86d4', 'blueprint blue');
    t.eq(h.unlock, null, 'available from the start (unlock: null)');
    t.eq(h.pronoun, 'he', 'pronoun he');
    t.eq(JSON.stringify(h.stats), JSON.stringify({ hp: 22, ap: 3, mov: 4, armor: 0, init: -1 }), 'stats 22 HP / 3 AP / move 4 / armor 0 / init −1');
    t.eq(h.growth.hp, 3, '+3 HP a level');
    t.ok(h.stats.hp + 3 * h.growth.hp >= 29, 'L4 HP ' + (h.stats.hp + 3 * h.growth.hp) + ' ≥ the act-3 floor of 29');
    t.eq(JSON.stringify(h.flags), '{}', 'no flags');
    t.ok(/\bhe\b/.test(h.blurb) && /\bhis\b/.test(h.passive.desc), 'blurb and passive say he / his');
    t.ok(/lizard-man/.test(h.blurb) && /Hjalmarino/.test(h.blurb) && /Spooder/.test(h.blurb), 'the blurb keeps the user\'s "lizard-man" and names both robots');
    t.eq(h.basic, 'biz_rivet_gun', 'basic: Rivet Gun');
    t.eq(h.signature, 'biz_spoodmarino', 'signature: Spoodmarino!');
    t.eq(DD.getSkill(h.signature).hype, 100, 'the signature costs 100 Hype');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['biz_duct_tape', 'biz_overclock']), 'starters in this order: Duct Tape, Overclock (the sim forgets socket 0 first)');
    t.eq(JSON.stringify(h.skillPool.slice().sort()), JSON.stringify(POOL.slice().sort()), 'a pool of 9 (incl. the 2 starters)');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic and signature never socketed');
    const own = Object.keys(DD.defs.skills).filter(function (k) { return DD.defs.skills[k].owner === HERO; }).sort();
    t.eq(JSON.stringify(own), JSON.stringify(OWN.slice().sort()), '11 skills owned by biz');
    t.eq(JSON.stringify(h.summons), JSON.stringify([Bz().HJ, Bz().SP]), 'summons: both constructs');
    const hjd = DD.getSummon(Bz().HJ), spd = DD.getSummon(Bz().SP);
    t.ok(hjd.name === 'Mechanical Monkey' && hjd.names.join() === 'Hjalmarino' && hjd.hp === Bz().KINDS.hjalmarino.defHp && hjd.armor === 0 && hjd.ap === 2 && hjd.mov === 4, 'Hjalmarino def');
    t.ok(spd.name === 'Mechanical Spider' && spd.names.join() === 'Spooder' && spd.hp === Bz().KINDS.spooder.defHp && spd.armor === 0 && spd.ap === 2 && spd.mov === 4, 'Spooder def');
    t.ok(hjd.pronoun === 'it' && spd.pronoun === 'it', 'both constructs: pronoun "it"');
    t.ok(hjd.flags.hop === true && hjd.resist.poison === 0, 'Hjalmarino hops and can\'t be poisoned');
    t.ok(spd.flags.immune.indexOf('root') >= 0 && spd.resist.poison === 0, 'Spooder: Root-proof, poison-proof');
    t.eq(JSON.stringify(hjd.skills), JSON.stringify(['biz_monkey_wrench', 'biz_cymbal_crash']), 'Hjalmarino lists its two skills');
    t.eq(JSON.stringify(spd.skills), JSON.stringify(['biz_pew_pew', 'biz_thwip']), 'Spooder lists its two skills');
    BOT_SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'summon' && s.levels.length === 3, id + ': owner summon, 3 levels (the model)');
      t.ok([hjd, spd].some(function (d) { return d.skills.indexOf(id) >= 0; }), id + ': listed in its summon def');
    });
    t.eq(Object.keys(DD.defs.skills).filter(function (k) { return /^biz_/.test(k) && DD.defs.skills[k].owner === 'summon'; }).sort().join(), BOT_SKILLS.slice().sort().join(), '4 construct skills');
    [[Bz().OVER, 'Overclocked'], [Bz().UPDATED, 'Updated'], [Bz().REBUILD, 'Rebuilding'], [Bz().BOOT, 'Booting Up']].forEach(function (p) { t.eq((DD.getStatus(p[0]) || {}).name, p[1], 'status ' + p[0]); });
    const heap = DD.getObject(Bz().SCRAP);
    t.ok(heap && heap.name === 'Scrap Heap' && heap.blocksMove === false && heap.targetable === false && heap.hp === 0, 'object biz_scrap: Scrap Heap, blocksMove false (explicit), untargetable, hp 0');
    t.ok(/Turn It Off and On Again/.test(heap.desc), 'the heap\'s desc names the skill that reboots it now');
    // items
    const its = ITEMS.map(DD.getItem);
    t.ok(its.every(function (it) { return it && it.hero === HERO; }), '3 hero items');
    t.eq(its.map(function (it) { return it.rarity + '/' + it.slot; }).join(), 'rare/weapon,rare/trinket,legendary/armor', 'rare weapon, rare trinket, legendary armor');
    t.eq(its[0].desc, '+10% damage. Overclock gives 1 more AP (2 instead of 1).', 'Universal Remote desc');
    t.eq(its[1].desc, 'The first time each of your constructs is scrapped in a fight, it reboots at the start of your next turn instead (with a third of its HP).', 'Extended Warranty desc');
    t.eq(its[2].desc, '+4 max HP. Once per fight, a hit that would down you leaves you at 1 HP instead: you drop your tail and scurry to the safest free tile within 3.', 'Spare Tail desc');
    t.ok(its[0].stats.dmg === 0.1 && its[2].stats.hp === 4 && Object.keys(its[1].stats).length === 0, 'item stats');
    // D9 guard: nothing healing in his kit's definitions
    OWN.concat(BOT_SKILLS).forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(s.kind !== 'heal' && s.kind !== 'spell' && (s.tags || []).indexOf('fire') < 0 && (s.tags || []).indexOf('heal') < 0, id + ': no heal / spell kind, no fire / heal tag');
      t.ok(s.levels.every(function (L) { return L.heal === undefined; }), id + ': no level key "heal"');
    });
    t.ok(DD.getSkill('biz_overclock').levels.every(function (L) { return L.bask > 0; }), 'Overclock\'s heal number is the key "bask"');
    t.ok(DD.getSkill('biz_red_button').levels.every(function (L) { return L.boom > 0 && L.dmg === undefined; }), 'the Button\'s number is "boom", never "dmg"');
    const fw = DD.resolve(DD.getSkill('biz_overclock').forgetWarning, null, DD.Combat.makeRunHero({ id: HERO, level: 3 }), '');
    t.ok(typeof fw === 'string' && fw.length > 20, 'Overclock carries a forgetWarning (the sim never forgets it, plan D4)');
    // descs pure with user === null, word caps
    OWN.forEach(function (id) {
      const s = DD.getSkill(id);
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = desc(id, lv);
        t.ok(!/undefined|NaN|\[object/.test(d), id + ' L' + lv + ' desc pure with user === null: ' + d);
        const cap = id === 'biz_spoodmarino' ? 34 : id === 'biz_overclock' ? 30 : 28;
        t.ok(words(d) <= cap, id + ' L' + lv + ' desc ≤ ' + cap + ' words (' + words(d) + ')');
      }
    });
    // fix:balance B2: + the clause on booting up (41 words; the addendum's cap was 40)
    t.ok(words(h.passive.desc) <= 42, 'passive ≤ 42 words (' + words(h.passive.desc) + ')');
    t.eq(h.passive.name, 'Batteries Included', 'passive: Batteries Included');
    t.eq(desc('biz_overclock', 1), 'One of your constructs within 3 gains 1 AP now and runs hot: end this turn next to it and you bask on its engine, healing 3 HP.', 'Overclock I, word for word');
    t.eq(desc('biz_duct_tape', 1), 'You or one of your constructs within 3 gains 5 Block.', 'Duct Tape I, word for word');
    t.eq(desc('biz_rivet_gun', 1), 'Deal 3 damage to a foe within 3.', 'Rivet Gun, word for word');
    // barks: 13 standard keys ≥ 3, swap ≥ 2 with {ally} naming no hero, the custom keys, the robots' keys; every bubble ≤ 70
    const heroNames = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); }).map(function (id) { return DD.getHero(id).name; });
    const longest = heroNames.concat(['Professor Marbles']).reduce(function (a, b) { return b.length > a.length ? b : a; }, '');
    const fill = function (l) { return String(l).replace(/\{downed\}|\{ally\}/g, longest); };
    BARK_KEYS.forEach(function (k) { t.ok((h.barks[k] || []).length >= 3, 'barks.' + k + ': 3+ lines'); });
    CUSTOM_BARKS.forEach(function (k) { t.ok((h.barks[k] || []).length >= 2, 'custom barks.' + k + ': 2+ lines'); });
    t.ok(h.barks.swap.length >= 2 && h.barks.swap.every(function (l) { return /\{ally\}/.test(l); }), 'swap: 2+ lines, each with {ally}');
    const nameWords = [];
    heroNames.forEach(function (n) { String(n).split(/[^A-Za-z]+/).forEach(function (w) { if (w.length >= 3 && /^[A-Z]/.test(w) && w !== 'The') nameWords.push(w); }); });
    t.ok(h.barks.swap.every(function (l) { return !nameWords.some(function (w) { return new RegExp('\\b' + w + '\\b').test(l.replace('{ally}', '')); }); }), 'no swap line names a hero');
    Object.keys(h.barks).forEach(function (k) { h.barks[k].forEach(function (l) { t.ok(fill(l).length <= 70, 'bubble ≤ 70: ' + fill(l)); }); });
    [hjd, spd].forEach(function (d) {
      BOT_BARKS.forEach(function (k) { t.ok((d.barks[k] || []).length >= 3, d.names[0] + ' barks.' + k + ': 3+ lines'); });
      Object.keys(d.barks).forEach(function (k) { d.barks[k].forEach(function (l) { t.ok(l.length <= 70, 'bubble ≤ 70: ' + l); }); });
    });
    Bz().TIN_LINES.forEach(function (l) { t.ok(l.length <= 70, 'Hjalmar\'s gag line ≤ 70: ' + l); });
    // pronouns (plan D8): Biz he/him (never she/her); the constructs' own texts carry no gendered pronoun at all
    bizTexts().forEach(function (s) { t.ok(!/\b(she|her|hers|herself)\b/i.test(s), 'no she/her in Biz\'s texts: ' + s); });
    botTexts().forEach(function (s) { t.ok(!/\b(he|him|his|himself|she|her|hers|herself)\b/i.test(s), 'no gendered pronoun in a construct text: ' + s); });
    // review:biz: the chip and the heap speak about a robot ("Spooder reboots in 2 of his turns" read as Spooder's turns)
    const chipText = DD.getStatus(Bz().REBUILD).desc({ data: { list: [{ name: 'Hjalmarino', left: 2 }, { name: 'Spooder', left: 1 }] } });
    t.eq(chipText, 'Hjalmarino reboots in 2 of Biz\'s turns. Spooder reboots at the start of Biz\'s next turn.', 'the 🔧 chip\'s tooltip, word for word');
    [chipText, DD.getObject(Bz().SCRAP).desc].forEach(function (s) { t.ok(!/\b(he|him|his|himself)\b/i.test(s), 'a robot\'s chip / heap text says "Biz\'s", never he / his: ' + s); });
    // D11: no line of his names Rasma or Phat Gus (or their kits); D7: Cymbal Crash is never "the first / only" Confuse
    bizTexts().concat(botTexts()).forEach(function (s) {
      t.ok(!/\b(Rasma|Phat|Gus|monotaur)\b/i.test(s), 'D11: no other new hero named: ' + s);
      t.ok(!/\b(first|only)\b[^.]*\bConfus/i.test(s), 'D7: no "first / only Confuse": ' + s);
    });
    t.ok(!/wind-?up/i.test(RESERVED.join(' ')), 'no display name says "Wind-Up" (a boss telegraph term)');
    // names: unique against every hero, summon, enemy, generic, item, passive, status, object and fixture name
    const mine = {};
    RESERVED.forEach(function (n) { mine[norm(n)] = n; });
    const clash = [];
    const check = function (kind, id, nm) { if (/^biz_/.test(id) || !nm) return; if (mine[norm(nm)]) clash.push(kind + ' ' + id + ' "' + nm + '"'); };
    Object.keys(DD.defs.heroes).forEach(function (id) { if (id !== HERO) check('hero', id, DD.getHero(id).name); });
    ['skills', 'items', 'summons', 'enemies', 'statuses', 'objects', 'passives', 'consumables'].forEach(function (bag) {
      Object.keys(DD.defs[bag] || {}).forEach(function (id) { const d = DD.defs[bag][id]; check(bag, id, d.name); (d.names || []).forEach(function (n) { check(bag, id, n); }); });
    });
    t.eq(clash.join(' | '), '', 'his display names are used by nobody else (' + RESERVED.length + ' names)');
    t.eq(new Set(RESERVED.map(norm)).size, RESERVED.length, 'and are distinct among themselves');
    t.ok(RESERVED.every(function (n) {
      return Object.keys(DD.defs.skills).some(function (k) { return DD.defs.skills[k].name === n; }) || [hjd, spd].some(function (d) { return d.name === n || d.names.indexOf(n) >= 0; }) ||
        ITEMS.some(function (k) { return DD.getItem(k).name === n; }) || [Bz().OVER, Bz().UPDATED, Bz().REBUILD, Bz().BOOT].some(function (k) { return DD.getStatus(k).name === n; }) ||
        heap.name === n || h.passive.name === n;
    }), 'every reserved name is one of his');
    // the Radio Edit chip for his one pool damage skill
    const chip = 'Synergy (Biz) is bleeped: it can\'t be used this fight.';
    t.ok(chip.length <= 90, 'Radio Edit chip ≤ 90 (' + chip.length + ')');
    t.eq(desc('biz_red_button', 1), 'Once per fight: one of your constructs, anywhere, self-destructs. Every foe next to it takes 8 damage. It is scrapped (and reboots as usual).', 'Big Red Button I, word for word');
  });

  // ---- 2. Rivet Gun -------------------------------------------------------------------------------------------
  T.suite('hero_biz: Rivet Gun — 3 within 3 (+range items), sight, crates, barrels, it reveals his Stealth', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 2 }], objects: [{ x: 1, y: 7, id: 'crate' }, { x: 2, y: 2, id: 'barrel_explosive' }] });
    let u = B();
    bots(t, [8, 6], [7, 7]);
    const g = at(4, 4), far = at(5, 2);
    t.ok(valid(u, u.basic, 4, 4) && !valid(u, u.basic, 5, 2), 'a foe 3 away yes, 5 away no');
    use(t, u, u.basic, 4, 4, 'Rivet Gun');
    t.eq(g.hp, 11, 'the grunt takes 3');
    t.ok(u.basic.id === 'biz_rivet_gun' && !(DD.getSkill('biz_rivet_gun').tags.indexOf('ranged') < 0), 'tagged ranged: he makes no attacks of opportunity');
    t.eq(A().opportunitySlot(u), null, 'no attack-of-opportunity slot');
    const crate = tile(1, 7).obj, hp0 = crate.hp;
    t.ok(valid(u, u.basic, 1, 7), 'a crate within 3 can be aimed at (D1)');
    use(t, u, u.basic, 1, 7, 'Rivet Gun at the crate');
    t.eq(hp0 - (tile(1, 7).obj ? tile(1, 7).obj.hp : 0), Math.min(3, hp0), 'the crate takes 3');
    t.ok(valid(u, u.basic, 2, 2), 'an explosive barrel within 3 can be aimed at');
    use(t, u, u.basic, 2, 2, 'Rivet Gun at the barrel');
    t.ok(!tile(2, 2).obj || tile(2, 2).obj.id !== 'barrel_explosive', 'the barrel goes off');
    t.eq(far.hp, 14, 'the far grunt was never in range');
    // +range items: the Yardstick reaches 4 and the desc says so; a wall blocks the line
    fight({ heroes: [{ x: 1, y: 4, items: DD.getItem('yardstick') ? ['yardstick'] : [] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 1, y: 1 }],
      terrain: function (tl) { if (tl.x === 1 && tl.y === 2) tl.t = 'wall'; } });
    u = B();
    bots(t, [8, 6], [7, 7]);
    if (DD.getItem('yardstick')) {
      t.ok(valid(u, u.basic, 5, 4), 'with the Yardstick: 4 away');
      t.eq(desc('biz_rivet_gun', 1, u), 'Deal 3 damage to a foe within 4.', 'the desc prints 4');
    } else t.log('items.js not loaded (isolated run): the Yardstick check runs in the full suite');
    t.ok(!valid(u, u.basic, 1, 1), 'no line of sight through a wall');
    // Stealth: his own rivet reveals him
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    bots(t, [8, 6], [7, 7]);
    A().addStatus(u, 'stealth', { turns: 1 }, u);
    use(t, u, u.basic, 3, 4, 'Rivet Gun while Stealthed');
    t.ok(!has(u, 'stealth'), 'he dealt damage himself: Revealed');
  });

  // ---- 3. Batteries Included: deploy ------------------------------------------------------------------------------
  T.suite('hero_biz: Batteries Included — both robots unpacked at combat start (zone, sides, Mk by level, AP, no doubling, no room)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    let u = B(), m = hj(), s = sp();
    t.ok(!!m && !!s, 'both constructs on the board');
    t.ok(dist(m, u) <= 2 && dist(s, u) <= 2, 'within 2 of him');
    t.ok(m.name === 'Hjalmarino' && s.name === 'Spooder', 'names exact');
    t.ok(m.title === 'Mk I' && s.title === 'Mk I', 'titles: "Mk I" (the HUD card\'s badge: short, so the name keeps its room)');
    const HJ1 = Bz().KINDS.hjalmarino.base + 2, SP1 = Bz().KINDS.spooder.base + 2;   // level 1 (the fix:balance suite pins the bases)
    t.ok(m.maxHp === HJ1 && m.hp === HJ1 && s.maxHp === SP1 && s.hp === SP1, 'HP ' + HJ1 + ' / ' + SP1 + ' at level 1');
    t.ok(m.armor === 0 && s.armor === 0, 'armor 0 / 0 (h19:balance it3: Hjalmarino 1 → 0)');
    t.ok(m.resist.poison === 0 && s.resist.poison === 0 && A().immuneTo(m, 'poison'), 'poison-proof');
    t.ok(m.flags.hop && !s.flags.hop, 'Hjalmarino hops');
    t.ok(A().immuneTo(s, 'root') && !A().immuneTo(m, 'root'), 'Spooder can\'t be Rooted');
    t.ok(dist(m, at(7, 4)) < dist(s, at(7, 4)), 'Hjalmarino on the foe\'s side (' + m.x + ',' + m.y + '), Spooder behind (' + s.x + ',' + s.y + ')');
    t.eq(dist(s, u), 1, 'Spooder next to him');
    t.ok(m.skills.every(function (sl) { return sl.level === 1; }) && s.skills.every(function (sl) { return sl.level === 1; }), 'skill levels 1 (Mk I)');
    t.ok(m.sprite === Bz().MONKEY_LOOKS[0] && s.sprite === Bz().SPIDER_LOOKS[0] && m.sprite.mk === 1, 'the Mk I looks');
    t.ok(m.ownerId === u.id && s.ownerId === u.id && m.kind === 'summon' && m.side === 'hero', 'his, hero-side summons');
    t.ok(DD.Combat.current() === u && m.ap === 2 && s.ap === 2, 'his turn: each robot has its own 2 AP');
    t.ok(DD.Combat.state.order.every(function (e) { return e.unitId !== m.id && e.unitId !== s.id; }), 'no initiative entries of their own');
    t.eq(DD.Combat.groupOf(u).map(function (x) { return x.name; }).join(), 'Biz,Hjalmarino,Spooder', 'they act on his turn (his group)');
    // Mk by level (Mk II from 4, Mk III from 7: h19:balance it2, 3 / 6 → 4 / 7): HP KINDS base + 2L (fix:balance B5: 4 / 3)
    t.eq(JSON.stringify(Bz().MK_AT), '[4,7]', 'MK_AT 4 / 7');
    const KB = Bz().KINDS;
    [[2, 1], [3, 1], [4, 2], [6, 2], [7, 3]].map(function (c) { return [c[0], c[1], KB.hjalmarino.base + 2 * c[0], KB.spooder.base + 2 * c[0]]; }).forEach(function (c) {
      fight({ heroes: [{ x: 2, y: 4, level: c[0] }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
      const a = hj(), b = sp();
      t.ok(a.maxHp === c[2] && b.maxHp === c[3], 'level ' + c[0] + ': HP ' + c[2] + ' / ' + c[3]);
      t.ok(a.title === 'Mk ' + ['', 'I', 'II', 'III'][c[1]] && b.title === a.title && a.skills[0].level === c[1] && b.skills[1].level === c[1] &&
        a.sprite.mk === c[1] && b.sprite.mk === c[1], 'level ' + c[0] + ': Mk ' + c[1] + ' (title, skill levels, look)');
      t.eq(Bz().mkOf(B()), c[1], 'mkOf');
    });
    // a deploy zone: both start inside it (redeployable), with 0 AP until his turn
    const zone = [{ x: 1, y: 3 }, { x: 1, y: 4 }, { x: 1, y: 5 }, { x: 2, y: 3 }, { x: 2, y: 5 }, { x: 2, y: 4 }];
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }], deploy: true, deployTiles: zone });
    u = B(); m = hj(); s = sp();
    const inZone = function (p) { return zone.some(function (z) { return z.x === p.x && z.y === p.y; }); };
    t.ok(DD.Combat.state.phase === 'deploy' && inZone(m) && inZone(s), 'inside the deploy zone (' + m.x + ',' + m.y + ' / ' + s.x + ',' + s.y + ')');
    t.ok(m.ap === 0 && s.ap === 0, '0 AP before initiative');
    DD.Combat.rollInitiative();
    t.ok(DD.Combat.current() === u && hj().ap === 2 && sp().ap === 2, '2 AP each when his turn starts');
    // review:biz (h19): a strip zone (a boss map's) with no free zone tile within 2 of him once Hjalmarino is out: Spooder
    // still starts in the zone, on its free tile nearest him (outside it, deployment could never move it: deployMove)
    const strip = [{ x: 2, y: 8 }, { x: 3, y: 8 }, { x: 4, y: 8 }, { x: 7, y: 8 }];
    fight({ heroes: [{ x: 3, y: 8 }, { id: 'test_knight', x: 2, y: 8 }], enemies: [{ id: 'test_grunt', x: 4, y: 1 }], deploy: true, deployTiles: strip });
    m = hj(); s = sp();
    t.ok(m.x === 4 && m.y === 8 && s.x === 7 && s.y === 8, 'a strip zone: Hjalmarino on its tile within 2, Spooder on its free tile nearest him (' +
      m.x + ',' + m.y + ' / ' + s.x + ',' + s.y + ')');
    t.ok(!!DD.Combat.deployMove(s, 4, 8) && s.x === 4 && s.y === 8 && m.x === 7, 'deployment can move it (a swap inside the zone)');
    // a pre-placed robot is not doubled
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }], summons: [{ id: Bz().HJ, x: 3, y: 6, owner: HERO }] });
    t.eq(Bz().constructsOf(B()).filter(function (c) { return c.defId === Bz().HJ; }).length, 1, 'a sandbox Hjalmarino: no second one');
    t.ok(!!sp(), 'Spooder still unpacked');
    // no room: boxed in by walls, the log says so and nothing breaks
    let lines = [];
    t.tryRun('no room', function () {
      lines = logged(/No room to unpack/, function () {
        fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
          terrain: function (tl) { if (Math.abs(tl.x - 4) + Math.abs(tl.y - 4) <= 2 && !(tl.x === 4 && tl.y === 4)) tl.t = 'wall'; } });
      });
    });
    t.ok(lines.indexOf('No room to unpack Hjalmarino. It stays in the box.') >= 0 && lines.indexOf('No room to unpack Spooder. It stays in the box.') >= 0, 'both: "No room to unpack …. It stays in the box."');
    t.eq(Bz().constructsOf(B()).length, 0, 'no robots, no heaps, no timers');
    t.tryRun('a turn with no robots', function () { toHisTurn(B()); });
    t.eq(JSON.stringify(Bz().scrapTimers(B())), JSON.stringify({ hjalmarino: null, spooder: null }), 'nothing to reboot');
  });

  // ---- 4. scrap and the timed reboot ---------------------------------------------------------------------------------
  T.suite('hero_biz: scrap and the timed reboot — the Scrap Heap, the 🔧 chip, 3 of his turns, a third of its HP, never a heal', function (t) {
    if (!ready(t)) return;
    // h19:balance it1: the reboot timer 2 → 3 (the addendum's second "too strong" knob)
    t.eq(Bz().SCRAP_TURNS, 3, 'SCRAP_TURNS 3 (h19:balance it1: 2 → 3)');
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    let u = B();
    bots(t, [4, 4], [2, 6]);
    let calls = [];
    const lines = logged(/scrap|reboots/i, function () { calls = healCalls(function () { Bz().scrap(u, 'hjalmarino'); }); });
    const h0 = tile(4, 4).obj;
    t.ok(!hj() && h0 && h0.id === 'biz_scrap' && h0.data.kind === 'hjalmarino' && h0.data.left === 3 && h0.data.owner === u.id, 'a Scrap Heap where it fell (left 3)');
    t.ok(DD.Grid.isWalkable(4, 4, u) && DD.Grid.isFree(4, 4), 'non-blocking: anyone may stand on it');
    t.ok(!DD.Targeting.objectTargetable || DD.Targeting.objectTargetable(h0) === false || DD.getObject('biz_scrap').targetable === false, 'untargetable');
    t.eq(lines[0], 'Hjalmarino is scrap! It reboots in 3 of Biz\'s turns.', 'the log line');
    t.eq(JSON.stringify(Bz().scrapTimers(u)), JSON.stringify({ hjalmarino: 3, spooder: null }), 'timer 3');
    t.ok(has(u, 'biz_rebuilding') && st(u, 'biz_rebuilding').turns === 3, 'the 🔧 chip on him shows 3');
    t.eq(DD.getStatus('biz_rebuilding').desc(st(u, 'biz_rebuilding')), 'Hjalmarino reboots in 3 of Biz\'s turns.', 'the chip\'s tooltip (Biz\'s turns, never "his": the robot is "it")');
    t.eq(calls.length, 0, 'no heal call');
    A().explode(null, 4, 4, { radius: 1, dmg: 8, element: null });
    t.ok(tile(4, 4).obj && tile(4, 4).obj.id === 'biz_scrap', 'the heap survives an explosion (hp 0)');
    toHisTurn(u);
    t.ok(!hj() && Bz().scrapTimers(u).hjalmarino === 2 && tile(4, 4).obj.data.left === 2 && st(u, 'biz_rebuilding').turns === 2, 'his next turn: 2 left (heap digit and chip follow)');
    toHisTurn(u);
    t.ok(!hj() && Bz().scrapTimers(u).hjalmarino === 1 && tile(4, 4).obj.data.left === 1 && st(u, 'biz_rebuilding').turns === 1, 'his second turn: 1 left');
    t.ok(/at the start of Biz's next turn/.test(DD.getStatus('biz_rebuilding').desc(st(u, 'biz_rebuilding'))), 'the chip says "at the start of Biz\'s next turn"');
    let back = null, rl = [];
    calls = healCalls(function () { rl = logged(/from the scrap/, function () { toHisTurn(u); }); });
    back = hj();
    t.ok(!!back && back.x === 4 && back.y === 4, 'the start of his third turn after: it reboots at the heap');
    t.eq(Bz().REBOOT_FRAC, 1 / 3, 'REBOOT_FRAC 1 / 3 (h19:balance it4: half → a third)');
    t.ok(back && back.maxHp === Bz().KINDS.hjalmarino.base + 2 && back.hp === Math.ceil(back.maxHp / 3), 'with a third of its HP, rounded up (' + (back && back.hp) + '/' + (back && back.maxHp) + ')');
    t.eq(rl[0], 'Biz reboots Hjalmarino from the scrap (a third of its HP). It is booting up.', 'the reboot log line');
    // fix:balance B2 (the lead, Nov 21): it sits the turn it comes back out (it used to act at once with 2 AP)
    t.ok(back && back.ap === 0 && has(back, 'biz_booting') && Bz().justBack(back), 'booting up: 0 AP, the ⏳ chip, back this turn');
    t.eq(DD.getStatus('biz_booting').desc(st(back, 'biz_booting')), 'Just rebooted and booting up: it can\'t act or be overclocked until Biz\'s next turn.', 'the chip\'s tooltip');
    const ocb = DD.Act.makeSlot('biz_overclock', 1);
    u.skills = [ocb];
    t.eq(canTarget(u, ocb, { x: back.x, y: back.y }), 'Hjalmarino is still booting up. Overclock it next turn.', 'Overclock refuses it this turn');
    t.ok(!valid(u, ocb, back.x, back.y), 'not a valid Overclock target');
    t.ok(!tile(4, 4).obj && !has(u, 'biz_rebuilding') && Bz().scrapTimers(u).hjalmarino === null, 'heap, chip and timer gone');
    t.eq(calls.filter(function (c) { return !c.sim; }).length, 0, 'a reboot is a rebuild: no DD.Act.heal on anyone');
    DD.Combat.endTurn();
    t.ok(!has(back, 'biz_booting'), 'the chip is gone at his turn end');
    toHisTurn(u);
    t.ok(back.ap === 2 && !Bz().justBack(back) && valid(u, ocb, back.x, back.y), 'his next turn: it acts (2 AP) and can be overclocked');
    // scrapped during his own turn (the Button) → the same third turn; a foe on the heap → the nearest free safe tile
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [4, 4], [2, 6]);
    Bz().scrap(u, 'spooder');
    t.ok(tile(2, 6).obj && tile(2, 6).obj.data.kind === 'spooder', 'Spooder\'s heap');
    toHisTurn(u);
    toHisTurn(u);
    put(t, foes()[0], 2, 6);
    toHisTurn(u);
    const sb = sp();
    t.ok(!!sb && dist(sb, { x: 2, y: 6 }) === 1, 'a foe stands on the heap: it reboots on the nearest free safe tile (' + (sb && sb.x) + ',' + (sb && sb.y) + ')');
    t.ok(!tile(2, 6).obj, 'the heap is gone');
    // a pit death: the heap lies on the nearest floor
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [5, 5], [2, 6]);
    tile(5, 5).t = 'pit';
    Bz().scrap(u, 'hjalmarino');
    const rec = Bz().data(u).scrap.hjalmarino;
    t.ok(rec && rec.at && !(rec.at.x === 5 && rec.at.y === 5) && dist(rec.at, { x: 5, y: 5 }) === 1 && tile(rec.at.x, rec.at.y).obj.id === 'biz_scrap', 'fell into a pit: the heap is on the nearest floor (' + (rec && rec.at && rec.at.x + ',' + rec.at.y) + ')');
    // a heap never overwrites another object; a replaced heap is re-placed at his turn start
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [5, 5], [2, 6]);
    A().placeObject(5, 5, 'pressure_plate');
    Bz().scrap(u, 'hjalmarino');
    t.ok(tile(5, 5).obj && tile(5, 5).obj.id === 'pressure_plate', 'the pressure plate stays');
    const at1 = Bz().data(u).scrap.hjalmarino.at;
    t.ok(at1 && dist(at1, { x: 5, y: 5 }) === 1 && tile(at1.x, at1.y).obj.id === 'biz_scrap', 'the heap goes next to it');
    A().removeObject(at1.x, at1.y);
    A().placeObject(at1.x, at1.y, 'crate');
    toHisTurn(u);
    const at2 = Bz().data(u).scrap.hjalmarino.at;
    t.ok(tile(at1.x, at1.y).obj.id === 'crate' && at2 && tile(at2.x, at2.y).obj && tile(at2.x, at2.y).obj.id === 'biz_scrap' && tile(at2.x, at2.y).obj.data.left === 2,
      'a crate replaced the heap: at his turn start the heap is back on the nearest free floor (' + (at2 && at2.x + ',' + at2.y) + ')');
    // Biz downed: nothing ticks; up again: it resumes; both scrapped and Biz down: his slot passes, nothing breaks
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [4, 4], [2, 6]);
    Bz().scrap(u, 'hjalmarino');
    A().damage(foes()[0], u, 999, { cause: 'other' });
    t.ok(u.downed, 'Biz is down');
    t.tryRun('turns while he is down', function () { for (let i = 0; i < 6; i++) DD.Combat.endTurn(); });
    t.eq(Bz().scrapTimers(u).hjalmarino, 3, 'the timer paused at 3');
    A().revive(u, 0.5);
    toHisTurn(u);
    t.eq(Bz().scrapTimers(u).hjalmarino, 2, 'up again: it resumes (2)');
    Bz().scrap(u, 'spooder');
    A().damage(foes()[0], u, 999, { cause: 'other' });
    t.tryRun('both scrapped and Biz down', function () { for (let i = 0; i < 6; i++) DD.Combat.endTurn(); });
    t.ok(!DD.Combat.state.result || DD.Combat.state.result, 'no crash');
    // no room to reboot: retried at his next turn start with the log line
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [6, 5], [2, 1]);
    Bz().scrap(u, 'hjalmarino');
    toHisTurn(u);
    toHisTurn(u);
    const walls = [];
    DD.Combat.state.grid.tiles.forEach(function (tl) { if (dist(tl, { x: 6, y: 5 }) <= 3 && !DD.Grid.unitAt(tl.x, tl.y)) { walls.push([tl, tl.t]); tl.t = 'lava'; } });
    let nr = [];
    t.tryRun('no room', function () { nr = logged(/No room to reboot/, function () { toHisTurn(u); }); });
    t.ok(nr[0] === 'No room to reboot Hjalmarino. Biz needs a bigger garage.' && !hj() && Bz().scrapTimers(u).hjalmarino === 0, 'no room: the log line, it waits at 0');
    walls.forEach(function (w) { w[0].t = w[1]; });
    toHisTurn(u);
    t.ok(!!hj(), 'room again: it reboots at his next turn start');
    // combat end clears everything; a dispelled chip reappears; the model is factory (an Update is lost)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [3, 4], [2, 6]);
    A().addStatus(hj(), 'biz_updated', { silent: true }, u);
    Bz().scrap(u, 'hjalmarino');
    A().cleanse(u, 'buff', 9);
    t.ok(!has(u, 'biz_rebuilding'), 'a dispel takes the chip');
    DD.Combat.endTurn();
    t.ok(has(u, 'biz_rebuilding'), 'his turn end re-syncs it');
    toHisTurn(u); toHisTurn(u); toHisTurn(u);
    t.ok(!!hj() && !has(hj(), 'biz_updated'), 'rebooted with factory settings: not Updated');
    A().endCombat('victory');
    t.ok(!u.data || !u.data.biz, 'combat end clears his bookkeeping');
  });

  // ---- 5. Hjalmarino ------------------------------------------------------------------------------------------------
  T.suite('hero_biz: Hjalmarino at Mk I-III — Monkey Wrench 2/3/4 (fix:balance B4) (its attacks of opportunity), Cymbal Crash Confused, cd 3/2/1, hops', function (t) {
    if (!ready(t)) return;
    [[1, 1], [Bz().MK_AT[0], 2], [Bz().MK_AT[1], 3]].forEach(function (c) {
      const L = c[0], mk = c[1], dmg = 1 + mk;   // fix:balance B4: 3 / 4 / 5 → 2 / 3 / 4
      fight({ heroes: [{ x: 1, y: 4, level: L }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 6, y: 6, hpMult: 3 }],
        objects: [{ x: 4, y: 2, id: 'crate' }, { x: 2, y: 2, id: 'barrel_explosive' }] });
      const u = B(), m = hj();
      bots(t, [3, 4], [1, 6]);
      const g = at(4, 4), h0 = g.hp;
      use(t, m, m.skills[0], 4, 4, 'Monkey Wrench Mk ' + mk);
      t.eq(h0 - g.hp, dmg, 'Mk ' + mk + ': ' + dmg + ' damage (armor 0 grunt)');
      t.eq(desc('biz_monkey_wrench', mk), 'Deal ' + dmg + ' damage to an adjacent foe.', 'desc Mk ' + mk);
      put(t, m, 3, 2);
      const cr = tile(4, 2).obj, ch = cr.hp;
      t.ok(valid(m, m.skills[0], 4, 2), 'Mk ' + mk + ': a crate can be wrenched');
      use(t, m, m.skills[0], 4, 2, 'Wrench the crate');
      t.eq(ch - (tile(4, 2).obj ? tile(4, 2).obj.hp : 0), Math.min(dmg, ch), 'the crate takes the listed ' + dmg);
      // its attack of opportunity on a walker (and the HUD's "provokes N" equals reality); Updated adds its flat
      put(t, m, 3, 4);
      m.oppRound = 0;
      const est = DD.AI.opportunityDmg(m, g, { x: 4, y: 4 });
      const hp1 = g.hp;
      A().moveAlong(g, [{ x: 5, y: 4 }], { provoke: true });
      t.eq(hp1 - g.hp, dmg, 'Mk ' + mk + ': it hits a foe walking away for ' + dmg);
      t.eq(est, dmg, 'the estimate said ' + est);
      put(t, g, 4, 4);
      A().addStatus(m, 'biz_updated', { silent: true }, u).data.flat = mk === 1 ? 1 : 2;
      DD.Combat.state.round++;
      const est2 = DD.AI.opportunityDmg(m, g, { x: 4, y: 4 }), hp2 = g.hp;
      A().moveAlong(g, [{ x: 5, y: 4 }], { provoke: true });
      t.ok(hp2 - g.hp === dmg + (mk === 1 ? 1 : 2) && est2 === hp2 - g.hp, 'Updated: the attack of opportunity hits ' + (hp2 - g.hp) + ' (estimate ' + est2 + ')');
      // Cymbal Crash: Confused for its next turn, cooldown 3/2/1
      put(t, g, 4, 4);
      m.ap = 2;
      use(t, m, m.skills[1], 4, 4, 'Cymbal Crash Mk ' + mk);
      t.ok(has(g, 'confused') && st(g, 'confused').turns === 1, 'Confused (1 turn)');
      t.eq(m.skills[1].cd, [0, 3, 2, 1][mk], 'cooldown ' + [0, 3, 2, 1][mk]);
      t.ok(!valid(m, m.skills[1], 6, 6), 'only an adjacent foe');
      // a Confused foe makes no attack of opportunity
      put(t, sp(), 5, 4);
      const sh = sp().hp;
      A().moveAlong(sp(), [{ x: 5, y: 3 }], { provoke: true });
      t.eq(sp().hp, sh, 'a Confused foe lets Spooder walk off');
    });
    // hop: up 2 levels
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.h = 2; } });
    bots(t, [3, 4], [3, 5]);
    t.ok(DD.Grid.canStep(hj(), { x: 3, y: 4 }, { x: 4, y: 4 }) && !DD.Grid.canStep(sp(), { x: 3, y: 5 }, { x: 4, y: 4 }), 'Hjalmarino climbs 2 levels; Spooder doesn\'t');
    // h19:balance it3: Cymbal Crash takes non-bosses only (the addendum's sixth "too strong" knob)
    t.eq(desc('biz_cymbal_crash', 1), 'An adjacent foe (not a boss) is Confused for its next turn: its attacks turn a random quarter turn and may hit its friends.', 'Cymbal Crash desc, word for word');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_boss', x: 4, y: 4 }] });
    bots(t, [3, 4], [1, 6]);
    const bm = hj(), boss = at(4, 4);
    bm.ap = 2;
    t.ok(!valid(bm, bm.skills[1], 4, 4), 'a boss next to it is no target');
    t.eq(DD.getSkill('biz_cymbal_crash').target.canTarget(DD.Targeting.buildCtx(bm, bm.skills[1], { x: 4, y: 4 })), 'Bosses have heard the cymbals before.', 'with the exact reason');
    t.tryRun('an echo on a boss', function () { DD.Combat._action(function () { DD.Combat.resolveSkill(bm, bm.skills[1], { x: 4, y: 4 }, { pay: false }); }); });
    t.ok(!has(boss, 'confused'), 'a forced resolve on a boss confuses nothing');
  });

  // ---- 6. Spooder -----------------------------------------------------------------------------------------------------
  T.suite('hero_biz: Spooder at Mk I-III — Pew Pew 2/2/3 (fix:balance B4) within 3, Thwip! Rooted (cd 3/2/2, range 3/3/4), no web surface, no attacks of opportunity', function (t) {
    if (!ready(t)) return;
    [[1, 1], [Bz().MK_AT[0], 2], [Bz().MK_AT[1], 3]].forEach(function (c) {
      const mk = c[1], dmg = [0, 2, 2, 3][mk];   // fix:balance B4: 2 / 3 / 4 → 2 / 2 / 3 (never below 2)
      fight({ heroes: [{ x: 1, y: 1, level: c[0] }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 1, y: 8, hpMult: 3 }],
        objects: [{ x: 2, y: 6, id: 'crate' }] });
      const s = sp();
      bots(t, [8, 0], [1, 4]);
      const g = at(4, 4), h0 = g.hp;
      t.ok(valid(s, s.skills[0], 4, 4) && !valid(s, s.skills[0], 1, 8), 'within 3, not 4');
      use(t, s, s.skills[0], 4, 4, 'Pew Pew Mk ' + mk);
      t.eq(h0 - g.hp, dmg, 'Mk ' + mk + ': ' + dmg + ' damage');
      t.eq(desc('biz_pew_pew', mk), 'Deal ' + dmg + ' damage to a foe within 3.', 'desc');
      const cr = tile(2, 6).obj, ch = cr.hp;
      use(t, s, s.skills[0], 2, 6, 'Pew Pew at a crate');
      t.eq(ch - (tile(2, 6).obj ? tile(2, 6).obj.hp : 0), Math.min(dmg, ch), 'the crate takes ' + dmg);
      s.ap = 2;
      const range = [0, 3, 3, 4][mk];
      t.eq(valid(s, s.skills[1], 1, 8), range >= 4, 'Thwip! range ' + range + ' (a foe 4 away: ' + (range >= 4) + ')');
      use(t, s, s.skills[1], 4, 4, 'Thwip! Mk ' + mk);
      t.ok(has(g, 'root') && st(g, 'root').turns === 1, 'Rooted for its next turn');
      t.eq(s.skills[1].cd, [0, 3, 2, 2][mk], 'cooldown ' + [0, 3, 2, 2][mk]);
      t.eq(DD.Combat.state.grid.tiles.filter(function (tl) { return tl.surface && tl.surface.id === 'web'; }).length, 0, 'no web surface laid');
      t.eq(desc('biz_thwip', mk), 'A foe within ' + range + ' is Rooted for its next turn (no move actions).', 'Thwip! desc');
    });
    // a wall blocks its shots; no attacks of opportunity; Root and enemy webs don't hold it
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }], terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'wall'; } });
    let s = sp();
    bots(t, [8, 0], [2, 4]);
    t.ok(!valid(s, s.skills[0], 4, 4), 'no line of sight through a wall');
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }], surfaces: [{ x: 4, y: 6, id: 'web', turns: 3 }] });
    s = sp();
    bots(t, [8, 0], [4, 5]);
    t.eq(A().opportunitySlot(s), null, 'Spooder has no attack-of-opportunity slot');
    const g = at(4, 4), gh = g.hp;
    A().moveAlong(g, [{ x: 5, y: 4 }], { provoke: true });
    t.eq(g.hp, gh, 'a foe walks off Spooder untouched');
    t.eq(A().addStatus(s, 'root', { turns: 1 }, g), null, 'Root doesn\'t stick');
    A().moveAlong(s, [{ x: 4, y: 6 }, { x: 4, y: 7 }], { provoke: true });
    t.ok(s.x === 4 && s.y === 7, 'it walks across an enemy web');
  });

  // ---- 7. Duct Tape -----------------------------------------------------------------------------------------------------
  T.suite('hero_biz: Duct Tape — Block 5/6/8 within 3/3/4 on Biz or his robots only, gone at his next turn start', function (t) {
    if (!ready(t)) return;
    [[1, 5, 3], [2, 6, 3], [3, 8, 4]].forEach(function (c) {
      fight({ heroes: [{ x: 0, y: 0 }, { id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = B(), sl = give(u, 'biz_duct_tape', c[0]);
      bots(t, [c[2], 0], [0, c[2] + 1]);
      t.eq(desc('biz_duct_tape', c[0], u), 'You or one of your constructs within ' + c[2] + ' gains ' + c[1] + ' Block.', 'desc ' + c[0]);
      use(t, u, sl, 0, 0, 'Duct Tape ' + c[0] + ' on himself');
      t.eq(u.block, c[1], 'Biz gains ' + c[1] + ' Block');
      sl.cd = 0; u.ap = 3;
      t.ok(valid(u, sl, hj().x, hj().y) && !valid(u, sl, sp().x, sp().y), 'a robot ' + c[2] + ' away yes, ' + (c[2] + 1) + ' away no');
      use(t, u, sl, hj().x, hj().y, 'Duct Tape on Hjalmarino');
      t.eq(hj().block, c[1], 'Hjalmarino gains ' + c[1] + ' Block');
      t.ok(!valid(u, sl, 1, 1), 'never on an ally hero');
      t.eq(canTarget(u, sl, { x: 1, y: 1 }), 'Only Biz or his robots.', 'the refusal text');
      t.eq(sl.cd, 1, 'cooldown 1');
      toHisTurn(u);
      t.ok(u.block === 0 && hj().block === 0, 'gone at his next turn start');
    });
  });

  // ---- 8. Overclock and the bask ----------------------------------------------------------------------------------------
  T.suite('hero_biz: Overclock — +1 AP now (2 with the Remote; fix:balance B3), refusals, this turn only, cd 2/2/1, the bask 3/4/4 via lift:biz', function (t) {
    if (!ready(t)) return;
    [[1, 3, 3, 2], [2, 4, 3, 2], [3, 4, 4, 1]].forEach(function (c) {
      const lv = c[0], bask = c[1], R = c[2], cd = c[3];
      fight({ heroes: [{ x: 0, y: 0 }, { id: 'test_knight', x: 8, y: 8 }], enemies: [{ id: 'test_grunt', x: 3, y: 0, hpMult: 3 }] });
      const u = B(), sl = give(u, 'biz_overclock', lv);
      bots(t, [1, 0], [0, R + 1]);
      const m = hj();
      t.eq(desc('biz_overclock', lv, u), 'One of your constructs within ' + R + ' gains 1 AP now and runs hot: end this turn next to it and you bask on its engine, healing ' + bask + ' HP.', 'desc ' + lv);
      m.ap = 0;
      use(t, u, sl, m.x, m.y, 'Overclock ' + lv);
      t.eq(m.ap, 1, 'Hjalmarino gains 1 AP it can spend now (fix:balance B3: 2 → 1)');
      t.ok(has(m, 'biz_overclocked') && st(m, 'biz_overclocked').data.bask === bask && st(m, 'biz_overclocked').data.src === u.id, 'Overclocked (bask ' + bask + ')');
      t.eq(sl.cd, cd, 'cooldown ' + cd);
      t.ok(!valid(u, sl, sp().x, sp().y), 'a robot ' + (R + 1) + ' away: out of range');
      put(t, sp(), 0, R);
      sl.cd = 0; u.ap = 3;
      t.ok(valid(u, sl, sp().x, sp().y), 'a robot ' + R + ' away: in range');
      sl.cd = cd;
      // spend it now
      put(t, m, 2, 0);
      t.ok(DD.Combat.canUse(m, m.skills[0]) === true, 'it can act with the new AP now');
      u.hp = 10;
      const calls = healCalls(function () { DD.Combat.endTurn(); });
      t.ok(!has(m, 'biz_overclocked'), 'Overclocked lasts exactly this turn');
      t.eq(u.hp, 10 + 0, 'ended the turn 2 away from it: no bask (' + u.hp + ')');
      t.eq(lifts(calls).length, 0, 'no lift:biz call');
    });
    // the bask: next to it at his turn end → +3 (I) / +4 (II, III); one DD.Act.heal(biz, biz, n, { via: 'lift:biz' })
    [[1, 3], [2, 4], [3, 4]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
      const u = B(), sl = give(u, 'biz_overclock', c[0]);
      bots(t, [2, 4], [1, 5]);
      use(t, u, sl, 2, 4, 'Overclock ' + c[0]);
      u.hp = 10;
      let lines = [];
      const calls = healCalls(function () { lines = logged(/basks/, function () { DD.Combat.endTurn(); }); });
      const l = lifts(calls);
      t.ok(u.hp === 10 + c[1] && l.length === 1 && l[0].src === u && l[0].target === u && l[0].n === c[1], 'level ' + c[0] + ': he basks, +' + c[1] + ' (one lift:biz call)');
      t.eq(lines[0], 'Biz basks on Hjalmarino\'s hot engine.', 'the log');
    });
    // once a turn: two overclocked robots next to him heal once (the bigger number)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    let u = B();
    u.skills = [DD.Act.makeSlot('biz_overclock', 1), DD.Act.makeSlot('biz_overclock', 2)];
    bots(t, [2, 4], [1, 5]);
    use(t, u, u.skills[0], 2, 4, 'Overclock I on Hjalmarino');
    use(t, u, u.skills[1], 1, 5, 'Overclock II on Spooder');
    u.hp = 10;
    let calls = healCalls(function () { DD.Combat.endTurn(); });
    t.ok(lifts(calls).length === 1 && u.hp === 14, 'two hot robots: one bask, the bigger number (+4)');
    // nothing when the robot was scrapped, when someone else overclocked it, when Biz is downed; full HP: a 0-HP call, no log
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    u = B();
    const sl = give(u, 'biz_overclock', 1);
    bots(t, [2, 4], [1, 5]);
    use(t, u, sl, 2, 4, 'Overclock');
    Bz().scrap(u, 'hjalmarino');
    u.hp = 10;
    calls = healCalls(function () { DD.Combat.endTurn(); });
    t.ok(lifts(calls).length === 0 && u.hp === 10, 'scrapped before his turn end: no bask');
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    u = B();
    bots(t, [2, 4], [1, 5]);
    const fake = A().addStatus(hj(), 'biz_overclocked', { turns: 1, silent: true }, hero('test_knight'));
    fake.data = { bask: 3, src: hero('test_knight').id };
    u.hp = 10;
    calls = healCalls(function () { DD.Combat.endTurn(); });
    t.ok(lifts(calls).length === 0 && u.hp === 10, 'overclocked by someone else: no bask');
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    u = B();
    use(t, u, give(u, 'biz_overclock', 1), hj().x, hj().y, 'Overclock');
    bots(t, [2, 4], [1, 5]);
    A().damage(foes()[0], u, 999, { cause: 'other' });
    calls = healCalls(function () { DD.Combat.endTurn(); });
    t.ok(u.downed && lifts(calls).length === 0 && u.hp === 0, 'downed: no call, still down (never a revive)');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    u = B();
    bots(t, [2, 4], [1, 5]);
    use(t, u, give(u, 'biz_overclock', 1), 2, 4, 'Overclock');
    let lines = [];
    calls = healCalls(function () { lines = logged(/basks/, function () { DD.Combat.endTurn(); }); });
    t.ok(lifts(calls).length === 1 && lifts(calls)[0].healed === 0 && u.hp === u.maxHp && !lines.length, 'full HP: one 0-HP call, no log');
    // refusals (exact texts): Biz, a hero, a foe, someone else's robot, a stunned / asleep / frozen / sheep robot
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 1, y: 5 }], enemies: [{ id: 'test_grunt', x: 2, y: 3 }] });
    u = B();
    const oc = give(u, 'biz_overclock', 1);
    bots(t, [2, 4], [1, 3]);
    const other = A().summon(hero('test_knight'), Bz().SP, 0, 5, { noFx: true, silent: true });
    t.ok(!!other, 'the knight owns a stray Spooder (other content)');
    [[1, 4, 'Biz'], [1, 5, 'a hero'], [2, 3, 'a foe'], [0, 5, 'someone else\'s robot']].forEach(function (p) {
      t.eq(canTarget(u, oc, { x: p[0], y: p[1] }), 'Only Biz\'s robots.', p[2] + ': "Only Biz\'s robots."');
      t.ok(!valid(u, oc, p[0], p[1]), p[2] + ': not a valid target');
    });
    ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (sid) {
      A().addStatus(hj(), sid, { turns: 1 }, foes()[0]);
      t.eq(canTarget(u, oc, { x: 2, y: 4 }), 'Hjalmarino can\'t act right now.', sid + ': "Hjalmarino can\'t act right now."');
      A().removeStatus(hj(), sid, { silent: true });
    });
    // the Universal Remote: 3 AP, and the desc says so (unit and RunHero)
    fight({ heroes: [{ x: 1, y: 4, items: ['biz_universal_remote'] }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    u = B();
    bots(t, [2, 4], [1, 5]);
    hj().ap = 0;
    use(t, u, give(u, 'biz_overclock', 1), 2, 4, 'Overclock with the Remote');
    t.eq(hj().ap, 2, 'with the Remote: +2 AP');
    t.ok(/gains 2 AP now/.test(desc('biz_overclock', 1, u)) && /gains 2 AP now/.test(desc('biz_overclock', 1, DD.Combat.makeRunHero({ id: HERO, items: ['biz_universal_remote'] }))), 'the desc says 2 AP (unit and RunHero)');
  });

  // ---- 9. Turn It Off and On Again -----------------------------------------------------------------------------------------
  T.suite('hero_biz: Turn It Off and On Again — at its heap, anywhere, full HP, factory model, III acts at once, cd 3/2/2', function (t) {
    if (!ready(t)) return;
    [[1, 3, false], [2, 2, false], [3, 2, true]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 1, level: Bz().MK_AT[0] }], enemies: [{ id: 'test_grunt', x: 8, y: 0 }], terrain: function (tl) { if (tl.x === 4 && tl.y <= 6) tl.t = 'wall'; } });
      const u = B(), sl = give(u, 'biz_reboot', c[0]);
      bots(t, [7, 7], [1, 2]);
      t.eq(DD.Combat.canUse(u, sl), 'Nothing to reboot. Everything works. Suspicious.', 'nothing scrapped: the refusal');
      A().addStatus(hj(), 'biz_updated', { silent: true }, u);
      Bz().scrap(u, 'hjalmarino');
      t.ok(valid(u, sl, 7, 7) && !valid(u, sl, 6, 7) && DD.Targeting.validTargets(u, sl).length === 1, 'the heap (far, behind a wall) is the one target');
      t.eq(canTarget(u, sl, { x: 6, y: 7 }), 'Pick one of your Scrap Heaps.', 'elsewhere: the refusal');
      let calls = [];
      const lines = logged(/off and on again/, function () { calls = healCalls(function () { use(t, u, sl, 7, 7, 'Turn It Off and On Again ' + c[0]); }); });
      const m = hj();
      t.ok(!!m && m.x === 7 && m.y === 7 && m.hp === m.maxHp && m.maxHp === Bz().KINDS.hjalmarino.base + 2 * Bz().MK_AT[0], 'rebooted at the heap with full HP (' + (m && m.hp) + ')');
      t.ok(m && m.title === 'Mk II' && !has(m, 'biz_updated'), 'the model for his level, factory settings (not Updated)');
      t.eq(m ? m.ap : -1, c[2] ? 2 : 0, c[2] ? 'III: it acts at once' : 'I / II: it acts from his next turn');
      // fix:balance B2: booting up (I / II: the chip says no actions; III acts), and no Overclock on it this turn at any level
      t.ok(m && has(m, 'biz_booting') && st(m, 'biz_booting').data.ready === c[2] && Bz().justBack(m), 'the ⏳ chip (' + (c[2] ? 'it acts' : 'booting up') + ')');
      u.skills = [sl, DD.Act.makeSlot('biz_overclock', 1)];
      u.ap = 3;
      t.ok(m && !valid(u, u.skills[1], m.x, m.y), 'Overclock refuses it this turn');
      t.ok(!tile(7, 7).obj && Bz().scrapTimers(u).hjalmarino === null && !has(u, 'biz_rebuilding'), 'heap, timer and chip cleared');
      t.eq(sl.cd, c[1], 'cooldown ' + c[1]);
      t.eq(lines[0], 'Biz turns Hjalmarino off and on again. It works!', 'the log');
      t.eq(calls.filter(function (x) { return !x.sim; }).length, 0, 'no heal call');
      t.eq(desc('biz_reboot', c[0]), 'Reboot one of your scrapped constructs at its Scrap Heap, anywhere on the field, with full HP.' +
        (c[2] ? ' It acts at once (but can\'t be overclocked this turn).' : ' It spends this turn booting up (no actions, no Overclock).'), 'desc ' + c[0]);
      // an echo is a no-op
      const n0 = DD.Combat.state.units.length;
      t.tryRun('echo', function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, { x: 7, y: 7 }, { pay: false }); }); });
      t.eq(DD.Combat.state.units.length, n0, 'a second resolve builds nothing');
    });
    // both scrapped: the player picks by heap; a heap-less scrap can't be targeted and still reboots by the timer
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    let u = B();
    bots(t, [6, 6], [1, 2]);
    // shallow water on and around Hjalmarino: no floor for a heap within 3
    DD.Combat.state.grid.tiles.forEach(function (tl) { if (dist(tl, { x: 6, y: 6 }) <= 3) tl.t = 'water'; });
    Bz().scrap(u, 'hjalmarino');
    t.ok(Bz().data(u).scrap.hjalmarino && Bz().data(u).scrap.hjalmarino.at === null, 'no floor within 3: scrapped without a heap');
    const sl = give(u, 'biz_reboot', 1);
    t.eq(DD.Combat.canUse(u, sl), 'Nothing to reboot. Everything works. Suspicious.', 'nothing to click: the skill refuses');
    toHisTurn(u); toHisTurn(u); toHisTurn(u);
    t.ok(!!hj() && dist(hj(), u) <= 2, 'the timer still reboots it next to him (' + (hj() && hj().x + ',' + hj().y) + ')');
  });

  // ---- 10. Big Red Button -------------------------------------------------------------------------------------------------
  T.suite('hero_biz: Big Red Button — 8/10/12 to each foe next to a robot, allies never, no kill credit or damage stat for the self-destruct', function (t) {
    if (!ready(t)) return;
    [[1, 8], [2, 10], [3, 12]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 1 }, { id: 'test_knight', x: 5, y: 3 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 5, y: 5, hpMult: 3 }] });
      const u = B(), sl = give(u, 'biz_red_button', c[0]);
      bots(t, [5, 4], [1, 2]);
      const m = hj(), a = at(4, 4), b = at(5, 5), k = hero('test_knight');
      const ha = a.hp, hb = b.hp, hk = k.hp;
      t.ok(valid(u, sl, 5, 4) && !valid(u, sl, 1, 1) && !valid(u, sl, 5, 3) && !valid(u, sl, 4, 4), 'only his robots (anywhere)');
      t.eq(canTarget(u, sl, { x: 5, y: 3 }), 'Only your own robots have the button.', 'the refusal text');
      const stat = A().statOf(m), d0 = stat.dmg, k0 = stat.kills;
      let lines = [];
      const bk = barks(function () { lines = logged(/KABOOM|scrap/, function () { use(t, u, sl, 5, 4, 'Big Red Button ' + c[0]); }); });
      t.ok(ha - a.hp === c[1] && hb - b.hp === c[1], 'each adjacent foe takes ' + c[1]);
      t.eq(k.hp, hk, 'the knight next to it is never hit');
      t.ok(m.dead && !hj(), 'Hjalmarino is gone');
      t.eq(stat.dmg - d0, 2 * c[1], 'its damage stat counts the blast only (' + (stat.dmg - d0) + '), not the self-destruct');
      t.eq(stat.kills, k0, 'no kill credit for the self-destruct');
      t.ok(tile(5, 4).obj && tile(5, 4).obj.id === 'biz_scrap' && Bz().scrapTimers(u).hjalmarino === 3, 'scrapped: a heap and the timer (3)');
      t.eq(lines[0], 'Biz presses the big red button. Hjalmarino goes KABOOM. It reboots in 3 of Biz\'s turns.', 'the log');
      t.ok(bk.some(function (x) { return x.who === u && x.key === 'boom'; }), 'his "boom" bark');
      t.eq(DD.Combat.canUse(u, sl), 'No charges left.', 'once per fight');
    });
    // the robot is the source: Updated + N; Hype on a kill; Stealth survives; works on a stunned / sheep / Invulnerable robot
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 6, y: 4, hpMult: 3 }] });
    let u = B(), sl = give(u, 'biz_red_button', 1);
    bots(t, [5, 4], [1, 2]);
    A().addStatus(hj(), 'biz_updated', { silent: true }, u).data.flat = 2;
    A().addStatus(hj(), 'sheep', { turns: 1 }, at(4, 4));
    A().addStatus(hj(), 'invulnerable', { turns: 1 }, u);
    A().addStatus(u, 'stealth', { turns: 1 }, u);
    at(4, 4).hp = 9;
    const far = at(6, 4), hf = far.hp;
    const hype = hypeGains(function () { use(t, u, sl, 5, 4, 'the Button on a sheep, Invulnerable, Updated robot'); });
    t.eq(hf - far.hp, 10, 'Updated +2: 10');
    t.ok(!at(4, 4) || at(4, 4).dead || foes().length === 1, 'the 9-HP grunt dies');
    t.ok(hype.some(function (x) { return /kill/.test(x.why); }), 'the kill Hype');
    t.ok(!hj(), 'a sheep that was Invulnerable still went KABOOM');
    t.ok(has(u, 'stealth'), 'his Stealth survives (the robot dealt the damage)');
    // a preview equals reality
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }] });
    u = B(); sl = give(u, 'biz_red_button', 2);
    bots(t, [5, 4], [1, 2]);
    previewMatches(t, u, sl, 5, 4, 'the Button');
    // the Warranty counts a Button scrap
    fight({ heroes: [{ x: 1, y: 1, items: ['biz_warranty'] }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    u = B(); sl = give(u, 'biz_red_button', 1);
    bots(t, [5, 4], [1, 2]);
    use(t, u, sl, 5, 4, 'the Button with the Warranty');
    t.eq(Bz().scrapTimers(u).hjalmarino, 1, 'a Warranty claim: back at his next turn start');
  });

  // ---- 11. Nothing to See Here ---------------------------------------------------------------------------------------------
  T.suite('hero_biz: Nothing to See Here — Stealth 1/1/2 of his turns (cd 3/2/3); his robots\' hits and commands don\'t break it, his own hits do', function (t) {
    if (!ready(t)) return;
    [[1, 1, 3], [2, 1, 2], [3, 2, 3]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
      const u = B(), sl = give(u, 'biz_hide', c[0]);
      bots(t, [3, 4], [1, 5]);
      const lines = logged(/holds very still/, function () { use(t, u, sl, 1, 4, 'Nothing to See Here ' + c[0]); });
      t.ok(has(u, 'stealth'), 'Stealthed');
      t.eq(sl.cd, c[2], 'cooldown ' + c[2]);
      t.eq(lines[0], 'Biz holds very still. He is a wall now.', 'the log');
      for (let i = 0; i < c[1]; i++) { toHisTurn(u); t.ok(has(u, 'stealth'), 'still Stealthed at the start of his turn ' + (i + 1)); }
      DD.Combat.endTurn();
      t.ok(!has(u, 'stealth'), 'gone after ' + c[1] + ' of his turns');
      t.eq(desc('biz_hide', c[0]), 'You are Stealthed through your next ' + (c[1] > 1 ? c[1] + ' turns' : 'turn') + ' (enemies ignore you). Your constructs\' attacks don\'t break it; yours do.', 'desc');
    });
    // what keeps it and what breaks it
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 6 }, { id: 'test_grunt', x: 6, y: 6, hpMult: 6 }] });
    const u = B();
    bots(t, [3, 4], [2, 4]);
    u.skills = ['biz_duct_tape', 'biz_overclock', 'biz_firmware', 'biz_www'].map(function (id) { return DD.Act.makeSlot(id, 3); });
    A().addStatus(u, 'stealth', { turns: 2 }, u);
    const keep = function (label, fn) { u.ap = 9; fn(); t.ok(has(u, 'stealth'), label + ': still Stealthed'); };
    keep('Monkey Wrench', function () { use(t, hj(), hj().skills[0], 4, 4, 'Wrench'); });
    keep('Pew Pew', function () { use(t, sp(), sp().skills[0], 4, 4, 'Pew'); });
    keep('Duct Tape', function () { use(t, u, u.skills[0], 1, 4, 'Tape'); });
    keep('Overclock', function () { use(t, u, u.skills[1], 3, 4, 'Overclock'); });
    keep('Firmware Update', function () { use(t, u, u.skills[2], 3, 4, 'Firmware'); });
    keep('World Wide Web', function () { put(t, sp(), 4, 5); use(t, u, u.skills[3], u.x, u.y, 'Web'); });
    // enemy single-target skills skip him
    const g = at(4, 4);
    put(t, u, 4, 3);
    const tgts = DD.Targeting.validTargets(g, g.skillSlots[0]);
    t.ok(!tgts.some(function (p) { return p.x === 4 && p.y === 3; }), 'a foe\'s single-target skill can\'t pick him');
    put(t, u, 1, 4);
    u.skills = [DD.Act.makeSlot('biz_synergy', 1)];
    u.ap = 9;
    use(t, u, u.skills[0], 4, 4, 'Synergy');
    t.ok(!has(u, 'stealth'), 'Synergy (his own hit) reveals him');
  });

  // ---- 12. Firmware Update -------------------------------------------------------------------------------------------------
  T.suite('hero_biz: Firmware Update — +1/+2/+2 on every hit of that robot (attacks of opportunity, the Button, Spoodmarino), range 1/1/3, one each', function (t) {
    if (!ready(t)) return;
    [[1, 1, 1], [2, 2, 1], [3, 2, 3]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6, hpMult: 4 }] });
      const u = B(), sl = give(u, 'biz_firmware', c[0]);
      bots(t, [1 + c[2], 1], [1, 1 + c[2] + 1]);
      t.ok(!valid(u, sl, sp().x, sp().y), 'a robot ' + (c[2] + 1) + ' away: out of range');
      t.ok(valid(u, sl, hj().x, hj().y), 'a robot ' + c[2] + ' away: in range');
      use(t, u, sl, hj().x, hj().y, 'Firmware Update ' + c[0]);
      const s0 = st(hj(), 'biz_updated');
      t.ok(!!s0 && s0.data.flat === c[1], 'Updated +' + c[1]);
      t.eq(s0 ? DD.getStatus('biz_updated').telegraphFlat(s0) : 0, c[1], 'telegraphFlat: the estimates see +' + c[1]);
      put(t, hj(), 5, 6);
      const g = at(6, 6), h0 = g.hp;
      use(t, hj(), hj().skills[0], 6, 6, 'Wrench');
      const wr = DD.getSkill('biz_monkey_wrench').levels[0].dmg;   // fix:balance B4: 2 (was 3)
      t.eq(h0 - g.hp, wr + c[1], 'Monkey Wrench Mk I deals ' + (wr + c[1]));
      sl.cd = 0; u.ap = 3;
      t.ok(!valid(u, sl, 5, 6) || DD.Combat.canUse(u, sl) !== true, 'already updated: not a target');
      t.eq(canTarget(u, sl, { x: 5, y: 6 }), 'Hjalmarino is already up to date.', 'the refusal text');
      t.eq(desc('biz_firmware', c[0]), (c[2] > 1 ? 'A construct within 3' : 'An adjacent construct') + ' deals +' + c[1] +
        ' damage with every hit for the rest of the fight (attacks of opportunity too). One update each.', 'desc ' + c[0]);
    });
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 1, y: 5 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    const u = B(), sl = give(u, 'biz_firmware', 3);
    bots(t, [2, 4], [1, 3]);
    t.eq(canTarget(u, sl, { x: 1, y: 5 }), 'Only Biz\'s robots.', 'a hero: refused');
    // Spoodmarino carries the flat too
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 4 }] });
    const v = B();
    bots(t, [3, 4], [1, 2]);
    A().addStatus(hj(), 'biz_updated', { silent: true }, v).data.flat = 2;
    DD.Combat.state.hype = 100;
    const g = at(4, 4), h0 = g.hp;
    use(t, v, v.signature, v.x, v.y, 'Spoodmarino!');
    t.eq(h0 - g.hp, 14, 'Spoodmarino from the Updated monkey: 12 + 2');
  });

  // ---- 13. World Wide Web --------------------------------------------------------------------------------------------------
  T.suite('hero_biz: World Wide Web — every foe within 1/1/2 of Spooder Rooted (allies never), cd 3/2/2, refusals, the area', function (t) {
    if (!ready(t)) return;
    [[1, 1, 3], [2, 1, 2], [3, 2, 2]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 1 }, { id: 'test_knight', x: 4, y: 3 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }, { id: 'test_grunt', x: 7, y: 7 }] });
      const u = B(), sl = give(u, 'biz_www', c[0]);
      bots(t, [8, 0], [4, 4]);
      const near = at(5, 4), two = at(4, 6), far = at(7, 7);
      const area = DD.Targeting.area(u, sl, c[0], { x: u.x, y: u.y });
      t.ok(area.some(function (p) { return p.x === 5 && p.y === 4; }) && !area.some(function (p) { return p.x === 4 && p.y === 3; }) && !area.some(function (p) { return p.x === 4 && p.y === 4; }),
        'the area: tiles around Spooder that hold no friend');
      const lines = logged(/spins a World Wide Web/, function () { use(t, u, sl, u.x, u.y, 'World Wide Web ' + c[0]); });
      t.ok(has(near, 'root') && st(near, 'root').turns === 1, 'the foe next to Spooder is Rooted');
      t.eq(has(two, 'root'), c[1] >= 2, 'a foe 2 away: ' + (c[1] >= 2 ? 'Rooted (III)' : 'not'));
      t.ok(!has(far, 'root') && !has(hero('test_knight'), 'root'), 'a far foe and the knight: never');
      t.eq(sl.cd, c[2], 'cooldown ' + c[2]);
      t.eq(lines[0], 'Spooder spins a World Wide Web: ' + (c[1] >= 2 ? '2 foes' : '1 foe') + ' stuck.', 'the log');
      t.eq(desc('biz_www', c[0]), c[1] > 1 ? 'Every foe within 2 tiles of Spooder is Rooted for its next turn.' : 'Every foe next to Spooder is Rooted for its next turn.', 'desc');
    });
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    const u = B(), sl = give(u, 'biz_www', 1);
    bots(t, [8, 0], [2, 2]);
    t.eq(DD.Combat.canUse(u, sl), 'No foe next to Spooder.', 'no foe in the area');
    // review:biz: III reaches 2 tiles, and its refusal says so
    const sl3 = DD.Act.makeSlot('biz_www', 3);
    u.skills = [sl, sl3];
    t.eq(DD.Combat.canUse(u, sl3), 'No foe within 2 tiles of Spooder.', 'III, no foe within 2: the refusal names its reach');
    put(t, foes()[0], 4, 2);
    t.ok(DD.Combat.canUse(u, sl3) === true && DD.Combat.canUse(u, sl) === 'No foe next to Spooder.', 'a foe 2 from Spooder: III may cast, I may not');
    put(t, foes()[0], 5, 4);
    u.skills = [sl];
    A().addStatus(sp(), 'stun', { turns: 1 }, foes()[0]);
    t.eq(DD.Combat.canUse(u, sl), 'Spooder can\'t move a leg right now.', 'a stunned Spooder');
    Bz().scrap(u, 'spooder');
    t.eq(DD.Combat.canUse(u, sl), 'Spooder is scrap. Turn it off and on again.', 'a scrapped Spooder');
    // a root-proof foe shrugs it off
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    const v = B(), s2 = give(v, 'biz_www', 1);
    bots(t, [8, 0], [4, 4]);
    at(5, 4).flags = Object.assign({}, at(5, 4).flags, { immune: ['root'] });
    use(t, v, s2, v.x, v.y, 'the web on a root-proof foe');
    t.ok(!has(at(5, 4), 'root'), 'root-proof: unaffected');
    t.eq(Bz().webScore(ctxFor(v, s2, { x: v.x, y: v.y })), 0, 'webScore counts only foes it can Root');
  });

  // ---- 14. Zip Line -------------------------------------------------------------------------------------------------------
  T.suite('hero_biz: Zip Line — Spooder reels Biz or an ally within 4/5/5 next to it, never provoking; refusals; cd 2/2/1', function (t) {
    if (!ready(t)) return;
    [[1, 4, 2], [2, 5, 2], [3, 5, 1]].forEach(function (c) {
      fight({ heroes: [{ x: 4, y: 0 }, { id: 'test_knight', x: 0, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 0, hpMult: 3 }] });
      const u = B(), sl = give(u, 'biz_zip_line', c[0]);
      bots(t, [8, 8], [4, c[1]]);
      t.eq(desc('biz_zip_line', c[0]), 'Spooder reels you or an ally within ' + c[1] + ' tiles of it onto a free tile next to it, without provoking attacks of opportunity.', 'desc');
      t.ok(valid(u, sl, 4, 0), 'Biz ' + c[1] + ' tiles from Spooder: a target');
      const hp0 = u.hp;
      const lines = logged(/reels/, function () { use(t, u, sl, 4, 0, 'Zip Line ' + c[0]); });
      t.ok(dist(u, sp()) === 1 && u.hp === hp0, 'Biz lands next to Spooder (' + u.x + ',' + u.y + '), and the grunt he left got no attack of opportunity');
      t.eq(lines[0], 'Spooder reels Biz in on a silk line.', 'the log');
      t.eq(sl.cd, c[2], 'cooldown ' + c[2]);
      sl.cd = 0; u.ap = 3;
      const k = hero('test_knight');
      t.eq(valid(u, sl, k.x, k.y), dist(k, sp()) <= c[1], 'the knight ' + dist(k, sp()) + ' away');
    });
    fight({ heroes: [{ x: 4, y: 0 }, { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    let u = B(), sl = give(u, 'biz_zip_line', 1);
    bots(t, [0, 8], [4, 5]);
    t.eq(canTarget(u, sl, { x: 4, y: 5 }), 'Spooder can\'t reel itself.', 'itself');
    t.eq(canTarget(u, sl, { x: 4, y: 4 }), 'Already next to Spooder.', 'already next to it');
    put(t, hero('test_knight'), 0, 0);
    t.eq(canTarget(u, sl, { x: 0, y: 0 }), 'Too far from Spooder.', 'too far');
    put(t, hero('test_knight'), 4, 2);
    hero('test_knight').flags.immovable = true;
    t.eq(canTarget(u, sl, { x: 4, y: 2 }), 'Sir Testsalot is immovable.', 'immovable');
    hero('test_knight').flags.immovable = false;
    // the preview shows the move; no room next to Spooder
    previewMatches(t, u, sl, 4, 2, 'Zip Line on the knight');
    fight({ heroes: [{ x: 5, y: 2 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
      terrain: function (tl) { if (dist(tl, { x: 5, y: 5 }) === 1) tl.t = 'wall'; } });
    u = B(); sl = give(u, 'biz_zip_line', 1);
    bots(t, [0, 8], [5, 5]);
    t.eq(canTarget(u, sl, { x: 5, y: 2 }), 'No room next to Spooder.', 'no room');
    // refusals of canUse
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B(); sl = give(u, 'biz_zip_line', 1);
    A().addStatus(sp(), 'sheep', { turns: 1 }, foes()[0]);
    t.eq(DD.Combat.canUse(u, sl), 'Spooder can\'t move a leg right now.', 'a sheep Spooder');
    Bz().scrap(u, 'spooder');
    t.eq(DD.Combat.canUse(u, sl), 'Spooder is scrap. Turn it off and on again.', 'a scrapped Spooder');
  });

  // ---- 15. Synergy ---------------------------------------------------------------------------------------------------------
  T.suite('hero_biz: Synergy — 4 / 7 / 10 by robots next to the foe (II 5/9/13, III 6/11/16), a stunned or sheep robot counts, a crate takes the listed 4/5/6', function (t) {
    if (!ready(t)) return;
    [[1, 4, 3], [2, 5, 4], [3, 6, 5]].forEach(function (c) {
      [0, 1, 2].forEach(function (n) {
        fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
        const u = B(), sl = give(u, 'biz_synergy', c[0]);
        bots(t, n >= 1 ? [4, 5] : [8, 8], n >= 2 ? [4, 3] : [0, 8]);
        if (n === 2) A().addStatus(sp(), 'sheep', { turns: 1 }, at(4, 4));
        const g = at(4, 4), h0 = g.hp;
        use(t, u, sl, 4, 4, 'Synergy ' + c[0] + ' with ' + n);
        t.eq(h0 - g.hp, c[1] + c[2] * n, 'level ' + c[0] + ', ' + n + ' robots next to it' + (n === 2 ? ' (one a sheep)' : '') + ': ' + (c[1] + c[2] * n));
      });
      t.eq(desc('biz_synergy', c[0]), 'Deal ' + c[1] + ' damage to a foe within 4, +' + c[2] + ' for each of your constructs next to it.', 'desc ' + c[0]);
    });
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 4, y: 4, id: 'crate' }] });
    const u = B(), sl = give(u, 'biz_synergy', 3);
    bots(t, [4, 5], [4, 3]);
    const cr = tile(4, 4).obj, ch = cr.hp;
    use(t, u, sl, 4, 4, 'Synergy at a crate');
    t.eq(ch - (tile(4, 4).obj ? tile(4, 4).obj.hp : 0), Math.min(6, ch), 'the crate takes the listed 6 (D4: no combo on an object)');
    // a scrapped one doesn't count
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    const v = B(), s2 = give(v, 'biz_synergy', 1);
    bots(t, [4, 5], [4, 3]);
    Bz().scrap(v, 'spooder');
    const g = at(4, 4), h0 = g.hp;
    use(t, v, s2, 4, 4, 'Synergy with one scrapped');
    t.eq(h0 - g.hp, 7, 'a heap next to the foe adds nothing: 7');
    t.eq(Bz().synergyScore(Object.assign(ctxFor(v, s2, { x: 4, y: 4 }), { autoplay: { preview: true } })), 0, 'synergyScore: 0 in the exact pass');
  });

  // ---- 16. Spoodmarino! -------------------------------------------------------------------------------------------------------
  T.suite('hero_biz: Spoodmarino! — scrapped robots reboot at full HP (no AP), then 12 + Rooted once per foe within 2 of a robot', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 1, y: 1 }, { id: 'test_knight', x: 0, y: 8 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 5, hpMult: 3 }, { id: 'test_grunt', x: 3, y: 6, hpMult: 3 }, { id: 'test_grunt', x: 1, y: 6, hpMult: 3 },
        { id: 'test_grunt', x: 8, y: 0, hpMult: 3 }] });
    const u = B();
    bots(t, [4, 5], [2, 5]);
    Bz().scrap(u, 'hjalmarino');
    DD.Combat.state.hype = 100;
    const a = at(5, 5), b = at(3, 6), c3 = at(1, 6), far = at(8, 0), ha = a.hp, hb = b.hp, hf = far.hp, uh = u.hp;
    let lines = [];
    const calls = healCalls(function () { lines = logged(/SPOODMARINO/, function () { use(t, u, u.signature, u.x, u.y, 'Spoodmarino!'); }); });
    const m = hj();
    t.ok(!!m && m.x === 4 && m.y === 5 && m.hp === m.maxHp && m.ap === 0, 'Hjalmarino rebooted at its heap with full HP and no AP this turn');
    t.ok(m && has(m, 'biz_booting') && Bz().justBack(m) && !Bz().justBack(sp()), 'it is booting up (fix:balance B2); Spooder, never scrapped, is not');
    t.eq(desc('biz_spoodmarino', 1), 'Your scrapped constructs reboot at their Scrap Heaps with full HP (booting up). Then every foe within 2 tiles of one of your ' +
      'constructs takes 12 damage and is Rooted for its next turn.', 'desc, word for word');
    t.ok(ha - a.hp === 12 && hb - b.hp === 12, 'each foe within 2 of a robot takes 12, once (the one near both too)');
    t.ok(has(a, 'root') && has(b, 'root'), 'and is Rooted');
    t.ok(far.hp === hf && !has(far, 'root'), 'a far foe: nothing');
    t.eq(DD.Combat.state.hype, 0, '100 Hype spent');
    t.eq(lines[0], 'Hjalmarino climbs onto Spooder. SPOODMARINO!', 'the log');
    t.ok(u.hp === uh && lifts(calls).length === 0 && calls.filter(function (x) { return !x.sim; }).length === 0, 'no heal');
    // the credit is the nearest robot (ties: Hjalmarino)
    const sm = A().statOf(m).dmg, ss = A().statOf(sp()).dmg;
    t.ok(sm === 24 && ss === 12 && has(c3, 'root'), 'credit: the nearest robot (Hjalmarino ' + sm + ': the foe next to it and the tie 2 from both; Spooder ' + ss + ')');
    // nothing left to combine
    let lines2 = [];
    t.tryRun('no room fight', function () {
      lines2 = logged(/No room/, function () {
        fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
          terrain: function (tl) { if (Math.abs(tl.x - 4) + Math.abs(tl.y - 4) <= 2 && !(tl.x === 4 && tl.y === 4)) tl.t = 'wall'; } });
      });
    });
    DD.Combat.state.hype = 100;
    t.eq(DD.Combat.canUse(B(), B().signature), 'Nothing left to combine.', 'no robot and no heap: "Nothing left to combine." (' + lines2.length + ' no-room lines)');
    t.ok(words(desc('biz_spoodmarino', 1)) <= 34, 'desc ≤ 34 words');
  });

  // ---- 17. items ------------------------------------------------------------------------------------------------------------
  T.suite('hero_biz: items — Universal Remote, Extended Warranty, Spare Tail (a death-save, once a fight)', function (t) {
    if (!ready(t)) return;
    // the Remote: +10% damage for Biz
    fight({ heroes: [{ x: 1, y: 4, items: ['biz_universal_remote'] }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    let u = B();
    bots(t, [4, 5], [4, 3]);
    t.ok(Math.abs(u.dmgBonus - 0.1) < 1e-9, '+10% damage');
    const g = at(4, 4), h0 = g.hp;
    use(t, u, give(u, 'biz_synergy', 1), 4, 4, 'Synergy (10) with the Remote');
    t.eq(h0 - g.hp, 11, '10 × 1.1 = 11');
    // the Warranty: each kind's first scrap reboots at his next turn start (a third of its HP); the second waits 3
    fight({ heroes: [{ x: 1, y: 4, items: ['biz_warranty'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [3, 4], [1, 5]);
    let bk = barks(function () { Bz().scrap(u, 'hjalmarino'); });
    t.eq(Bz().scrapTimers(u).hjalmarino, 1, 'first scrap: 1');
    t.ok(bk.some(function (x) { return x.key === 'warranty'; }), 'the warranty bark');
    toHisTurn(u);
    t.ok(!!hj() && hj().hp === Math.ceil(hj().maxHp / 3), 'back at his next turn start with a third of its HP');
    Bz().scrap(u, 'hjalmarino');
    t.eq(Bz().scrapTimers(u).hjalmarino, 3, 'its second scrap: 3');
    Bz().scrap(u, 'spooder');
    t.eq(Bz().scrapTimers(u).spooder, 1, 'Spooder\'s first: 1');
    // the Spare Tail: +4 HP; once per fight 1 HP and a scurry ≤ 3 to the safest tile; the second down is real
    fight({ heroes: [{ x: 4, y: 4, items: ['biz_spare_tail'] }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 5 }] });
    u = B();
    bots(t, [8, 8], [0, 8]);
    t.eq(u.maxHp, 26, '+4 max HP (26)');
    let lines = [];
    const calls = healCalls(function () { lines = logged(/drops his tail/, function () { A().damage(at(5, 4), u, 999, { cause: 'skill' }); }); });
    t.ok(!u.downed && u.hp === 1, 'a hit that would down him: 1 HP');
    t.ok(dist(u, { x: 4, y: 4 }) <= 3 && !(u.x === 4 && u.y === 4), 'he scurried ' + dist(u, { x: 4, y: 4 }) + ' tiles (' + u.x + ',' + u.y + ')');
    t.ok(foes().every(function (f) { return dist(f, u) > 1; }), 'to a tile with no foe next to it');
    t.eq(lines[0], 'Biz drops his tail and scurries off at 1 HP. It\'ll grow back.', 'the log');
    t.eq(calls.filter(function (x) { return !x.sim; }).length, 0, 'a death-save, not a heal');
    A().damage(foes()[0], u, 999, { cause: 'other' });
    t.ok(u.downed, 'the second down is real');
    // a mid-walk down ends the walk
    fight({ heroes: [{ x: 4, y: 4, items: ['biz_spare_tail'] }], enemies: [{ id: 'test_brute', x: 5, y: 4 }] });
    u = B();
    bots(t, [8, 8], [0, 8]);
    u.hp = 2;
    t.tryRun('walk', function () { DD.Combat.move(u, 4, 7); });
    t.ok(!u.downed && u.hp === 1 && !(u.x === 4 && u.y === 7), 'the brute\'s attack of opportunity would down him mid-walk: tail, and the walk ends (' + u.x + ',' + u.y + ')');
  });

  // ---- 18. HUD previews ---------------------------------------------------------------------------------------------------
  T.suite('hero_biz: HUD previews match reality (every Biz skill × level, every construct skill × Mk, side-effect free)', function (t) {
    if (!ready(t)) return;
    function arena(level) {
      fight({ heroes: [{ x: 2, y: 4, level: level || 1 }, { id: 'test_knight', x: 1, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 5, y: 5, hpMult: 2 }, { id: 'test_archer', x: 6, y: 3 }] });
      bots(t, [4, 5], [2, 3]);
      return B();
    }
    [1, 2, 3].forEach(function (lv) {
      let u = arena();
      previewMatches(t, u, u.basic, 4, 4, 'Rivet Gun');
      u = arena(); previewMatches(t, u, give(u, 'biz_duct_tape', lv), 4, 5, 'Duct Tape ' + lv);
      u = arena(); previewMatches(t, u, give(u, 'biz_overclock', lv), 4, 5, 'Overclock ' + lv);
      u = arena(); previewMatches(t, u, give(u, 'biz_red_button', lv), 4, 5, 'Big Red Button ' + lv);
      u = arena(); previewMatches(t, u, give(u, 'biz_hide', lv), 2, 4, 'Nothing to See Here ' + lv);
      u = arena(); previewMatches(t, u, give(u, 'biz_firmware', lv), 2, 3, 'Firmware Update ' + lv);
      u = arena(); put(t, sp(), 4, 3); previewMatches(t, u, give(u, 'biz_www', lv), 2, 4, 'World Wide Web ' + lv);
      u = arena(); put(t, sp(), 4, 6); previewMatches(t, u, give(u, 'biz_zip_line', lv), 1, 6, 'Zip Line ' + lv);
      u = arena(); previewMatches(t, u, give(u, 'biz_synergy', lv), 4, 4, 'Synergy ' + lv);
      u = arena(); Bz().scrap(u, 'hjalmarino'); previewMatches(t, u, give(u, 'biz_reboot', lv), 4, 5, 'Turn It Off and On Again ' + lv);
    });
    let u = arena();
    Bz().scrap(u, 'spooder');
    DD.Combat.state.hype = 100;
    previewMatches(t, u, u.signature, 2, 4, 'Spoodmarino!');
    [1, 3, 6].forEach(function (L) {
      u = arena(L);
      previewMatches(t, hj(), hj().skills[0], 4, 4, 'Monkey Wrench at L' + L);
      u = arena(L); previewMatches(t, hj(), hj().skills[1], 4, 4, 'Cymbal Crash at L' + L);
      u = arena(L); previewMatches(t, sp(), sp().skills[0], 4, 4, 'Pew Pew at L' + L);
      u = arena(L); previewMatches(t, sp(), sp().skills[1], 4, 4, 'Thwip! at L' + L);
    });
    // a foe's hit on a robot (enemy AI estimate equals the real hit)
    u = arena();
    const g = at(4, 4), m = hj(), sl = g.skillSlots[0];
    const pv = DD.Targeting.preview(g, sl, { x: m.x, y: m.y });
    const h0 = m.hp;
    DD.Combat._action(function () { DD.Combat.resolveSkill(g, sl, { x: m.x, y: m.y }, { pay: false }); });
    t.eq(h0 - m.hp, pv.perUnit[m.id] ? pv.perUnit[m.id].dmg : 0, 'a grunt\'s stab on Hjalmarino: the preview equals the hit (armor 0)');
  });

  // ---- 19. v2 edge cases ----------------------------------------------------------------------------------------------------
  T.suite('hero_biz: v2 edge cases (stun, sleep, sheep, charm, Confused, Silence, AP, not his turn, null targets, a dying robot, downed Biz, Help Up)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 1, y: 4, skills: ['biz_duct_tape', 'biz_overclock', 'biz_synergy', 'biz_hide'] }, { id: 'test_knight', x: 0, y: 0 }],
      enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    const u = B();
    bots(t, [3, 4], [1, 5]);
    [['stun', 'Stunned!'], ['sleep', 'Asleep. Zzz.'], ['sheep', 'Baa. (Sheep can only move.)']].forEach(function (c) {
      A().addStatus(u, c[0], { turns: 1 }, foes()[0]);
      t.eq(DD.Combat.canUse(u, u.skills[1]), c[1], c[0] + ': "' + c[1] + '"');
      A().removeStatus(u, c[0], { silent: true });
    });
    A().addStatus(u, 'silenced', { turns: 1 }, foes()[0]);
    t.ok(DD.Combat.canUse(u, u.skills[1]) === true && DD.Combat.canUse(u, u.basic) === true, 'Silenced: nothing of his is a spell, nothing blocked');
    A().removeStatus(u, 'silenced', { silent: true });
    A().addStatus(u, 'confused', { turns: 1 }, foes()[0]);
    t.eq(DD.Combat.moveApCost(u), 2, 'Confused: moving costs him 2 AP');
    A().removeStatus(u, 'confused', { silent: true });
    A().addStatus(u, 'charmed', { turns: 1 }, foes()[0]);
    const g = at(4, 4), h0 = g.hp;
    t.tryRun('charmed rivet', function () { if (DD.Combat.canUse(u, u.basic) === true) DD.Combat.useSkill(u, u.basic, 4, 4); });
    t.eq(g.hp, h0, 'Charmed: he can\'t hurt his charmer');
    A().removeStatus(u, 'charmed', { silent: true });
    u.ap = 0;
    t.eq(DD.Combat.canUse(u, u.skills[0]), 'Not enough AP.', '0 AP');
    u.ap = 3;
    // null targets: an empty tile never throws
    ['biz_duct_tape', 'biz_overclock', 'biz_firmware', 'biz_red_button', 'biz_zip_line', 'biz_synergy', 'biz_reboot'].forEach(function (id) {
      t.tryRun(id + ' on an empty tile', function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, DD.Act.makeSlot(id, 1), { x: 7, y: 1 }, { pay: false }); }); });
    });
    // a robot dying mid-skill: the Button on a robot at 1 HP whose blast meets thorns
    A().addStatus(g, 'thorns', { stacks: 20, turns: 2 }, g);
    hj().hp = 1;
    t.tryRun('the Button into thorns', function () { use(t, u, give(u, 'biz_red_button', 1), 3, 4, 'the Button next to a thorny foe'); });
    t.ok(!hj(), 'the robot is gone either way, no crash');
    // not his turn
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() !== u && DD.Combat.canUse(u, u.basic) !== true, 'not his turn: refused (' + DD.Combat.canUse(u, u.basic) + ')');
    // Biz downed while the robots act; a robot Helps Biz Up
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    const v = B();
    bots(t, [2, 4], [1, 5]);
    A().damage(foes()[0], v, 999, { cause: 'other' });
    t.ok(v.downed, 'Biz down');
    toHisTurn(v);
    t.ok(DD.Combat.current() === v && hj().ap === 2, 'his slot still comes up: the robots act');
    const help = DD.Combat.interactions(hj()).filter(function (o) { return o.kind === 'helpUp'; })[0];
    t.ok(!!help, 'Hjalmarino can Help Up');
    t.ok(help && DD.Combat.interact(hj(), help.x, help.y) && !v.downed, 'a robot Helps Biz Up');
  });

  // ---- 20. attacks of opportunity and the gag -------------------------------------------------------------------------------
  T.suite('hero_biz: attacks of opportunity (Hjalmarino only; reels, scurries, reboots, the signature and a robot-started swap never provoke) and the Hjalmar gag', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    const u = B();
    bots(t, [4, 5], [4, 3]);
    const g = at(4, 4);
    t.ok(!!A().opportunityOf(hj(), g, { x: 4, y: 4 }, { x: 5, y: 4 }), 'Hjalmarino would strike a walker');
    t.eq(A().opportunityOf(sp(), g, { x: 4, y: 4 }, { x: 5, y: 4 }), null, 'Spooder never');
    t.eq(A().opportunityOf(u, g, { x: 4, y: 4 }, { x: 5, y: 4 }), null, 'Biz never');
    // a robot-started swap: the mover provokes, Biz doesn't
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    const v = B();
    bots(t, [2, 4], [0, 8]);
    const vh = v.hp, mh = hj().hp;
    t.ok(DD.Combat.swap(hj(), 3, 4), 'Hjalmarino swaps with Biz');
    t.ok(v.x === 2 && v.y === 4 && v.hp === vh, 'Biz is out of melee and took nothing');
    t.ok(hj().hp <= mh, 'the monkey (the mover) is the one that could be struck');
    // a reboot or the signature next to a foe provokes nothing (no move action)
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    const w = B();
    bots(t, [4, 5], [0, 8]);
    Bz().scrap(w, 'hjalmarino');
    toHisTurn(w);
    toHisTurn(w);
    const gh = at(4, 4).hp;
    toHisTurn(w);
    t.ok(!!hj() && at(4, 4).hp === gh, 'a reboot next to a foe: no strike either way');
    // the tin double: only with Hjalmar active, once a fight, never while simulating, no state.rng draw
    if (!DD.getHero('hjalmar')) { t.log('hjalmar not loaded (isolated run): the gag is checked in the full run'); return; }
    let said = [];
    const run = function (party) {
      fight({ heroes: party, enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const s = DD.Combat.state, r0 = s.rng.getState();
      return { s: s, r0: r0 };
    };
    // force the roll low: the gag plays at Biz's first turn start (it already started in the sandbox: replay through the hook)
    const go = function (party, roll) {
      const r = run(party);
      const b = B();
      Bz().data(b).tin = false;
      const out = [], bk = A().bark, rn = DD.rng.next;
      A().bark = function (who, key) { out.push({ who: who.defId || who.name, key: String(key) }); return bk.apply(this, arguments); };
      DD.rng.next = function () { return roll; };
      try { Bz().tinDouble(b); Bz().tinDouble(b); } finally { A().bark = bk; DD.rng.next = rn; }
      return { out: out, rng: r.s.rng.getState() === r.r0 };
    };
    said = go([{ x: 1, y: 4 }, { id: 'hjalmar', x: 1, y: 6 }], 0.1);
    t.ok(said.out.length === 3 && said.out[0].who === 'hjalmar' && Bz().TIN_LINES.indexOf(said.out[0].key) >= 0 && said.out[1].key === 'spawn' && said.out[2].key === 'tin_double',
      'with Hjalmar: his line, the monkey\'s laugh, Biz\'s homage (' + said.out.map(function (x) { return x.who + ':' + x.key; }).join(' / ') + ')');
    t.ok(said.rng, 'no state.rng draw');
    said = go([{ x: 1, y: 4 }, { id: 'hjalmar', x: 1, y: 6 }], 0.9);
    t.eq(said.out.length, 0, 'a roll of 0.5+: nothing (50%)');
    said = go([{ x: 1, y: 4 }, { id: 'test_knight', x: 1, y: 6 }], 0.1);
    t.eq(said.out.length, 0, 'without Hjalmar: nothing');
    const r = run([{ x: 1, y: 4 }, { id: 'hjalmar', x: 1, y: 6 }]);
    const b = B();
    Bz().data(b).tin = false;
    const out = [], bk = A().bark;
    A().bark = function () { out.push(1); return bk.apply(this, arguments); };
    const sim = A().simulating;
    try { A().simulating = true; Bz().tinDouble(b); } finally { A().simulating = sim; A().bark = bk; }
    t.ok(out.length === 0 && !Bz().data(b).tin, 'never while simulating (' + !!r + ')');
    // the idle line naming Hjalmar plays only with him in the party
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    const idle = A().partyLines(DD.getHero(HERO).barks.idle);
    t.ok(!idle.some(function (l) { return /^Hjalmar,/.test(l); }), 'without Hjalmar the "Hjalmar, …" idle line is filtered out');
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'hjalmar', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    t.ok(A().partyLines(DD.getHero(HERO).barks.idle).some(function (l) { return /^Hjalmar,/.test(l); }), 'with him it can play');
  });

  // ---- 21. AutoPlay -------------------------------------------------------------------------------------------------------
  T.suite('hero_biz: AutoPlay hooks (Overclock, the bask end tile, the Button\'s ally-KO coupling, web, zip, hide, tape, firmware, synergy)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 8, y: 8 }] });
    let u = B();
    u.skills = ['biz_overclock', 'biz_duct_tape', 'biz_hide', 'biz_firmware'].map(function (id) { return DD.Act.makeSlot(id, 1); });
    bots(t, [3, 4], [1, 5]);
    const oc = function (c) { return Bz().overclockScore(ctxFor(u, u.skills[0], { x: c.x, y: c.y })); };
    t.eq(Bz().bestHit(hj(), 2), 4, 'bestHit: Monkey Wrench ×2 next to the foe = 4 (fix:balance B4)');
    t.eq(Bz().bestHit(hj(), 0), 0, 'bestHit with no AP: 0');
    const v1 = oc(hj());
    t.ok(v1 > 0, 'Overclock on a robot with a foe in reach: ' + v1.toFixed(1));
    A().addStatus(hj(), 'stun', { turns: 1 }, foes()[0]);
    t.eq(oc(hj()), 0, 'on a stunned robot: 0');
    A().removeStatus(hj(), 'stun', { silent: true });
    put(t, hj(), 1, 8);
    const v2 = oc(hj());
    t.ok(v2 < v1, 'a robot with nothing in reach scores lower (' + v2.toFixed(1) + ' < ' + v1.toFixed(1) + ')');
    // the bask term: in full for a robot next to him that can hit from where it stands; a robot that must walk will leave
    put(t, hj(), 2, 4);
    t.ok(!Bz().staysPut(hj()), 'next to him, 2 from the foe: it has to walk (staysPut false)');
    let full = oc(hj());
    u.hp = 8;
    let hurt = oc(hj());
    t.ok(Math.abs(hurt - full - 0.4 * DD.AutoPlay.healWorth(u, 3)) < 1e-9, 'hurt, next to a robot that will walk off: + 0.4 × healWorth(Biz, 3) (' + (hurt - full).toFixed(2) + ')');
    put(t, foes()[0], 3, 4);
    t.ok(Bz().staysPut(hj()), 'a foe next to it: it hits from where it stands (staysPut true)');
    hurt = oc(hj());
    u.hp = u.maxHp;
    full = oc(hj());
    t.ok(Math.abs(hurt - full - 1.5 * DD.AutoPlay.healWorth(Object.assign({}, u, { hp: 8 }), 3)) < 1e-9, 'hurt, next to a robot that stays: + 1.5 × healWorth(Biz, 3) (' + (hurt - full).toFixed(2) + ')');
    put(t, foes()[0], 4, 4);
    u.hp = 8;
    // baskEnd: > 0 only next to his Overclocked robot, 0 after a bask this turn
    const be = DD.getHero(HERO).passive.autoplayEnd;
    t.eq(be(u, 1, 4), 0, 'nothing overclocked: 0');
    A().addStatus(hj(), 'biz_overclocked', { turns: 1, silent: true }, u).data = { bask: 3, src: u.id };
    t.ok(be(u, 1, 4) > 0 && be(u, 2, 5) > 0 && be(u, 0, 4) === 0, 'next to the hot robot: ' + be(u, 1, 4).toFixed(2) + '; two away: 0');
    t.ok(Math.abs(DD.AutoPlay.restAt(u, 1, 4) - be(u, 1, 4)) < 1e-9, 'AutoPlay reads it (restAt)');
    Bz().data(u).basked = DD.Combat.state.turn;
    t.eq(be(u, 1, 4), 0, 'after a bask this turn: 0');
    Bz().data(u).basked = -1;
    u.hp = u.maxHp;
    t.eq(be(u, 1, 4), 0, 'at full HP: 0');
    // the Button: −20 with fewer than 2 foes and no kill; the exact pass undoes the ally-KO price
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 6, y: 4, hpMult: 3 }] });
    u = B();
    u.skills = [DD.Act.makeSlot('biz_red_button', 1)];
    bots(t, [3, 4], [1, 2]);
    const bctx = function (exact) { const c = ctxFor(u, u.skills[0], { x: hj().x, y: hj().y }); if (exact) c.autoplay = { preview: true }; return c; };
    t.eq(Bz().boomValue(bctx(false)), -20, 'one foe next to it, no kill: −20');
    put(t, hj(), 5, 4);
    const loss = 4 + 0.3 * hj().hp + 2 * Bz().bestHit(hj(), hj().maxAp || 2);
    t.ok(Math.abs(Bz().boomValue(bctx(true)) - (40 + 1.5 * hj().hp - loss)) < 1e-9, 'two foes next to it, the exact pass: 40 + 1.5 × HP − its real loss (' + Bz().boomValue(bctx(true)).toFixed(1) + ')');
    t.ok(Math.abs(Bz().boomValue(bctx(false)) - (16 - loss)) < 1e-9, 'the quick pass: the blast (2 × 8) − the loss (' + Bz().boomValue(bctx(false)).toFixed(1) + ')');
    foes().forEach(function (f) { f.hp = 8; });
    t.ok(Bz().boomValue(bctx(false)) > 0, 'two killable foes: the quick pass likes it (' + Bz().boomValue(bctx(false)).toFixed(1) + ')');
    // AutoPlay presses the Button with two foes next to Hjalmarino (pins the 40 / 1.5 coupling)
    fight({ heroes: [{ x: 1, y: 1 }, { id: 'test_knight', x: 0, y: 8 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 5, y: 5 }] });
    u = B();
    u.skills = [DD.Act.makeSlot('biz_red_button', 1)];
    bots(t, [5, 4], [0, 4]);
    foes().forEach(function (f) { f.hp = 8; });
    let pressed = false;
    A().addRule({ id: 'biz_probe_button', name: 'probe', silent: true, hooks: { onSkillUsed: function (ctx) { if (!A().simulating && ctx.skill && ctx.skill.id === 'biz_red_button') pressed = true; } } });
    try { t.tryRun('AutoPlay turn', function () { DD.AutoPlay.takeTurn(); }); } finally { A().removeRule('biz_probe_button'); }
    t.ok(pressed, 'AutoPlay presses the Button with three 8-HP foes next to Hjalmarino');
    // web / zip / hide / tape / firmware / synergy
    fight({ heroes: [{ x: 1, y: 1 }, { id: 'test_knight', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 2, y: 6 }] });
    u = B();
    u.skills = ['biz_www', 'biz_zip_line', 'biz_hide', 'biz_duct_tape'].map(function (id) { return DD.Act.makeSlot(id, 1); });
    bots(t, [8, 0], [4, 4]);
    t.ok(Math.abs(Bz().webScore(ctxFor(u, u.skills[0], { x: 1, y: 1 })) - 1.2) < 1e-9, 'webScore: 1.2 a foe it can Root');
    A().addStatus(at(5, 4), 'root', { turns: 1 }, sp());
    t.eq(Bz().webScore(ctxFor(u, u.skills[0], { x: 1, y: 1 })), 0, 'an already Rooted foe: 0');
    const z = Bz().zipScore(ctxFor(u, u.skills[1], { x: 1, y: 6 }));
    t.ok(isFinite(z), 'zipScore is a number (' + z.toFixed(2) + ')');
    t.eq(Bz().zipScore(ctxFor(u, u.skills[1], { x: 4, y: 4 })), 0, 'zipScore on Spooder itself: 0');
    A().addStatus(u, 'stealth', { turns: 1 }, u);
    t.eq(Bz().hideScore(ctxFor(u, u.skills[2], { x: 1, y: 1 })), 0, 'hideScore when Stealthed: 0');
    t.eq(Bz().tapeScore(ctxFor(u, u.skills[3], { x: 1, y: 6 })), 0, 'tapeScore on a hero: 0');
    const fws = Bz().firmwareScore(ctxFor(u, DD.Act.makeSlot('biz_firmware', 1), { x: 4, y: 4 }));
    t.ok(fws > 0, 'firmwareScore on a fresh robot: ' + fws.toFixed(1));
    A().addStatus(sp(), 'biz_updated', { silent: true }, u);
    t.eq(Bz().firmwareScore(ctxFor(u, DD.Act.makeSlot('biz_firmware', 1), { x: 4, y: 4 })), 0, 'already Updated: 0');
    t.eq(DD.getSkill('biz_overclock').aiScore, Bz().overclockScore, 'Overclock carries overclockScore');
    t.eq(DD.getSkill('biz_red_button').autoplayValue, Bz().boomValue, 'the Button carries boomValue');
  });

  /** AutoPlay battles of ['biz', 'test_knight', 'test_cleric', 'test_mage'] vs the fixture encounters. */
  function battles(t, plans, tagSeed) {
    const tot = { fought: 0, wins: 0, long: 0, overclocked: 0, basks: 0, reboots: 0, scraps: 0, controlled: 0, timeouts: 0, uses: {}, botTurns: 0, botActs: 0, prints: [] };
    plans.forEach(function (p, i) {
      const enc = DD.getEncounter(p.enc);
      if (!enc) { t.fail('fixture encounter ' + p.enc + ' missing'); return; }
      const sl = Math.min(3, 1 + Math.floor((p.level - 1) / 2));
      const party = [HERO, 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
        if (id === HERO) return DD.Combat.makeRunHero({ id: id, level: p.level, items: p.items || [], skills: p.skills.map(function (sid) { return { id: sid, level: sl }; }) });
        const h = DD.getHero(id);
        return DD.Combat.makeRunHero({ id: id, level: p.level, skills: h.startingSkills.map(function (sid) { return { id: sid, level: sl }; }) });
      });
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('biz-ap-' + (tagSeed || '') + i + ':' + t.seed), difficulty: 'normal', act: enc.act });
      DD.Combat.start(setup, { seed: 900 + i, headless: true, difficulty: 'normal', kind: enc.kind });
      const counts = {};
      let over = 0;
      A().addRule({ id: 'biz_usage_probe', name: 'Usage probe', silent: true, hooks: {
        onSkillUsed: function (ctx) {
          if (A().simulating || !ctx.user || !ctx.skill || ctx.opportunity) return;
          const owner = ctx.user.defId === HERO ? ctx.user : ctx.user.ownerId ? DD.Combat.byId(ctx.user.ownerId) : null;
          if (!owner || owner.defId !== HERO) return;
          counts[ctx.skill.id] = (counts[ctx.skill.id] || 0) + 1;
          if (ctx.skill.id === 'biz_overclock') over++;
          if (ctx.user !== owner) tot.botActs++;
        },
        onStatusApplied: function (u, inst) { if (!A().simulating && u && u.side === 'enemy' && inst && (inst.id === 'confused' || inst.id === 'root')) tot.controlled++; },
      } });
      const offLog = DD.Events.on('combat:log', function (e) {
        const s = String((e && (e.text || e.msg || (e.entry && e.entry.text))) || '');
        if (/basks on/.test(s)) tot.basks++;
        if (/reboots .* from the scrap|off and on again/.test(s)) tot.reboots++;
        if (/is scrap!|goes KABOOM/.test(s)) tot.scraps++;
      });
      let r = null;
      t.tryRun(p.enc + ' L' + p.level + ' battle', function () { r = DD.AutoPlay.runBattle(30); });
      offLog();
      A().removeRule('biz_usage_probe');
      if (!r) return;
      tot.fought++;
      if (r.result === 'victory') tot.wins++;
      if (r.timeout) tot.timeouts++;
      if (r.rounds >= 4) { tot.long++; if (over) tot.overclocked++; }
      Object.keys(counts).forEach(function (k) { tot.uses[k] = (tot.uses[k] || 0) + counts[k]; });
      const s = DD.Combat.state;
      tot.prints.push([r.result, r.rounds, s.units.map(function (o) { return o.defId + ':' + o.hp + ':' + o.x + ',' + o.y + ':' + (o.statuses || []).map(function (x) { return x.id; }).join('+'); }).join('|'), s.round, s.hype].join('/'));
      t.ok(r.rounds > 0 && !r.timeout, p.enc + ' L' + p.level + ': finished (' + r.result + ' in ' + r.rounds + ' rounds)');
      t.log(p.enc + ' L' + p.level + ' → ' + r.result + ' in ' + r.rounds + ' rounds; Biz side: ' + JSON.stringify(counts));
    });
    return tot;
  }
  const PLANS = [
    { enc: 'test_a1_normal', level: 1, skills: ['biz_duct_tape', 'biz_overclock'] },
    { enc: 'test_a1_elite', level: 1, skills: ['biz_duct_tape', 'biz_overclock'] },
    { enc: 'test_a1_normal', level: 4, skills: ['biz_duct_tape', 'biz_overclock', 'biz_red_button'] },
    { enc: 'test_a2_normal', level: 4, skills: ['biz_duct_tape', 'biz_overclock', 'biz_www'] },
    { enc: 'test_a1_boss', level: 4, skills: ['biz_duct_tape', 'biz_overclock', 'biz_synergy'] },
    { enc: 'test_a2_elite', level: 4, skills: ['biz_overclock', 'biz_reboot', 'biz_firmware'] },
    { enc: 'test_a2_elite', level: 7, skills: ['biz_overclock', 'biz_zip_line', 'biz_hide', 'biz_red_button'], items: ['biz_spare_tail'] },
    { enc: 'test_a3_normal', level: 7, skills: ['biz_duct_tape', 'biz_overclock', 'biz_reboot', 'biz_www'], items: ['biz_warranty'] },
    { enc: 'test_a2_boss', level: 7, skills: ['biz_overclock', 'biz_firmware', 'biz_synergy', 'biz_red_button'], items: ['biz_universal_remote'] },
    { enc: 'test_a3_elite', level: 7, skills: ['biz_duct_tape', 'biz_overclock', 'biz_hide', 'biz_zip_line'] },
  ];
  T.suite('hero_biz: AutoPlay battles at levels 1 / 4 / 7 (Mk I / II / III; fixture party, items at 7; deterministic)', function (t) {
    if (!ready(t)) return;
    const res = battles(t, PLANS);
    t.log('uses: ' + JSON.stringify(res.uses) + ' · wins ' + res.wins + '/' + res.fought + ' · Overclock in ' + res.overclocked + '/' + res.long + ' fights of 4+ rounds · basks ' +
      res.basks + ' · scraps ' + res.scraps + ' · reboots ' + res.reboots + ' · Confused / Rooted foes ' + res.controlled + ' · robot actions ' + res.botActs);
    t.eq(res.timeouts, 0, 'no timeouts');
    t.ok(res.long === 0 || res.overclocked >= 0.7 * res.long, 'Overclock in ≥ 70% of fights of 4+ rounds (' + res.overclocked + '/' + res.long + ')');
    t.ok(res.basks > 0, 'a bask somewhere in the batch (' + res.basks + ')');
    // h19:balance it1: with the timer at 3 these short fixture fights end before a timed reboot (suites 4 and 9 pin the reboot)
    t.ok(res.reboots + res.scraps > 0, 'a scrap or a reboot somewhere in the batch (scraps ' + res.scraps + ', reboots ' + res.reboots + ')');
    t.ok(res.controlled > 0, 'a Confused or Rooted foe somewhere (' + res.controlled + ')');
    t.ok(res.botActs > res.fought * 3, 'the robots act (' + res.botActs + ' actions)');
    t.ok(res.wins >= Math.ceil(res.fought * 0.6), 'the party mostly wins (' + res.wins + '/' + res.fought + ')');
    const a = battles(t, PLANS.slice(0, 2), 'det'), b = battles(t, PLANS.slice(0, 2), 'det');
    t.eq(JSON.stringify(a.prints), JSON.stringify(b.prints), 'two seeded runs are bit-identical');
  });

  // ---- 22. sprites and painters ------------------------------------------------------------------------------------------
  T.suite('hero_biz: sprites and painters (Biz, both robots × Mk × poses at five yaws, Overclocked / Updated looks, portraits, the heap, the combo FX)', function (t) {
    if (!ready(t)) return;
    const probs = T.contentHelpers && T.contentHelpers.spriteProblems;
    const specs = [Bz().BIZ_SPRITE].concat(Bz().MONKEY_LOOKS, Bz().SPIDER_LOOKS);
    if (probs) specs.forEach(function (sp0, i) { t.eq(probs(sp0).length, 0, 'sprite ' + i + ' valid ' + JSON.stringify(probs(sp0))); });
    t.ok(DD.getHero(HERO).sprite === Bz().BIZ_SPRITE && DD.getSummon(Bz().HJ).sprite === Bz().MONKEY_LOOKS[0] && DD.getSummon(Bz().SP).sprite === Bz().SPIDER_LOOKS[0], 'the def looks are Mk I');
    t.ok(Bz().MONKEY_LOOKS.map(function (s) { return s.mk; }).join() === '1,2,3' && Bz().SPIDER_LOOKS.map(function (s) { return s.mk; }).join() === '1,2,3', 'three looks each, carrying mk');
    if (!DD.Sprites) { t.log('no DD.Sprites'); return; }
    const said = [], proto = CanvasRenderingContext2D.prototype, orig = proto.fillText;
    proto.fillText = function (s) { said.push(String(s)); return orig.apply(this, arguments); };
    const p0 = DD.problems.length;
    try {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 140;
      const ctx = c.getContext('2d');
      specs.forEach(function (sp0, i) {
        ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
          [1, -1].forEach(function (fc) {
            [{}, { still: true }, { walk: 0.3 }, { lying: 0.5 }, { poseT: 0.7 }, { statuses: new Set(['biz_overclocked', 'biz_updated']) }].forEach(function (o) {
              t.tryRun('spec ' + i + ' ' + pose, function () { DD.Sprites.draw(ctx, sp0, 80, 120, 2, Object.assign({ pose: pose, t: 1.3, facing: fc }, o)); });
            });
          });
        });
        [26, 30, 64].forEach(function (size) { t.tryRun('portrait ' + i + ' @' + size, function () { const p = DD.Sprites.portrait(sp0, size); t.ok(!!p && p.width > 0, 'portrait ' + i + ' @' + size); }); });
      });
      // the board at five yaws: Biz, both robots (Overclocked, Updated), both heaps with digits 2 and 1
      if (DD.Render && typeof DD.Render.renderTo === 'function') {
        fight({ heroes: [{ x: 2, y: 4, level: 6 }, { id: 'test_knight', x: 4, y: 6 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
        const u = B();
        A().addStatus(hj(), 'biz_overclocked', { turns: 1, silent: true }, u);
        A().addStatus(sp(), 'biz_updated', { silent: true }, u);
        A().placeObject(5, 5, 'biz_scrap', { data: { owner: 'nobody', kind: 'hjalmarino', left: 2 } });
        A().placeObject(5, 2, 'biz_scrap', { data: { owner: 'nobody', kind: 'spooder', left: 1 } });
        const cv = document.createElement('canvas');
        cv.width = 320; cv.height = 220;
        [0, 90, 180, 270, 37.5].forEach(function (yaw) {
          t.tryRun('board at yaw ' + yaw, function () { DD.Render.renderTo(cv, { state: DD.Combat.state, width: 320, height: 220, yaw: yaw }); });
        });
        t.ok(said.indexOf('2') >= 0 && said.indexOf('1') >= 0, 'the heaps\' tags print their digits');
      }
      if (DD.Iso && DD.Iso.painter) {
        const cv2 = document.createElement('canvas');
        cv2.width = cv2.height = 100;
        const gp = DD.Iso.painter(cv2.getContext('2d'), { t: 1, tile: { x: 3, y: 4 } });
        ['hjalmarino', 'spooder'].forEach(function (k) {
          [0, 1, 2].forEach(function (left) {
            t.tryRun('drawScrap ' + k + ' ' + left, function () { Bz().painters.drawScrap(gp, { id: 'biz_scrap', data: { kind: k, left: left } }, 1.7 * left); });
          });
        });
      }
      const g2 = document.createElement('canvas').getContext('2d');
      const view = { zoom: 1.5, toScreen: function (x, y, h) { return { x: (x - y) * 32 + 160, y: (x + y) * 16 - (h || 0) * 12 + 40 }; } };
      [0, 0.25, 0.5, 0.75, 1].forEach(function (p) { t.tryRun('combo at ' + p, function () { Bz().painters.drawCombo(g2, 40, 60, p, view, {}); }); });
    } finally { proto.fillText = orig; }
    const warns = DD.problems.slice(p0).filter(function (w) { return /biz|sprite|draw|overlay/i.test(w); });
    t.eq(warns.length, 0, 'no painter warning (' + warns.slice(0, 3).join(' | ') + ')');
  });

  // ---- 23. shared content and combos ----------------------------------------------------------------------------------------
  T.suite('hero_biz: combos with the cast and shared content (Proud Pet Parent, Dog Treats, Steve, Party Balloons, Kick \'Em, Snail Mail, Zip Line delivers Marwyn)', function (t) {
    if (!ready(t)) return;
    let ran = 0;
    if (DD.getPassive && DD.getPassive('rp_proud_pet_parent')) {
      ran++;
      fight({ heroes: [{ x: 1, y: 4, passives: [{ id: 'rp_proud_pet_parent', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = B();
      t.ok(hj().maxHp === Bz().KINDS.hjalmarino.base + 6 && sp().maxHp === Bz().KINDS.spooder.base + 6 && Math.abs(hj().dmgBonus - 0.1) < 1e-9, 'Proud Pet Parent: both robots +4 HP and +10% (level-1 HP + 4 each)');
      Bz().scrap(u, 'spooder');
      toHisTurn(u); toHisTurn(u); toHisTurn(u);
      t.ok(!!sp() && sp().maxHp === Bz().KINDS.spooder.base + 6, 'a rebooted Spooder is buffed again at the next hook (' + (sp() && sp().maxHp) + ')');
    } else t.log('rp_proud_pet_parent not loaded');
    if (DD.getItem('dog_treat_bandolier')) {
      ran++;
      fight({ heroes: [{ x: 1, y: 4, items: ['dog_treat_bandolier'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = B();
      hj().hp = 4; sp().hp = 4;
      toHisTurn(u);
      t.ok(hj().hp > 4 && sp().hp > 4, 'the Bandolier of Dog Treats tops up both robots (' + hj().hp + ' / ' + sp().hp + ')');
    }
    if (DD.getItem('hireling_contract')) {
      ran++;
      fight({ heroes: [{ x: 1, y: 4, items: ['hireling_contract'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const n = DD.Combat.state.units.filter(function (o) { return o.kind === 'summon' && o.ownerId === B().id && !o.dead; }).length;
      t.ok(n >= 2, 'Steve and two robots: ' + n + ' summons (the HUD folds 3 into mini cards)');
    }
    if (DD.getItem('party_balloons')) {
      ran++;
      fight({ heroes: [{ x: 1, y: 4, items: ['party_balloons'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = B();
      bots(t, [2, 4], [1, 5]);
      use(t, u, give(u, 'biz_overclock', 1), 2, 4, 'Overclock with balloons');
      u.hp = 10;
      DD.Combat.endTurn();
      t.eq(u.hp, 13, 'flying on Party Balloons, he still basks next to the hot robot');
    }
    if (DD.getHero('betty') && DD.getSkill('bet_kick')) {
      ran++;
      t.log('Betty loaded: Kick \'Em on a Thwip!-Rooted foe is checked by Betty\'s own suite (Rooted is Rooted)');
    }
    if (DD.getHero('marwyn')) {
      ran++;
      fight({ heroes: [{ x: 1, y: 1 }, { id: 'marwyn', x: 1, y: 8 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] });
      const u = B();
      bots(t, [8, 0], [4, 7]);
      use(t, u, give(u, 'biz_zip_line', 2), 1, 8, 'Zip Line on Marwyn');
      t.ok(dist(hero('marwyn'), sp()) === 1, 'Zip Line delivers Marwyn next to the fight (' + hero('marwyn').x + ',' + hero('marwyn').y + ')');
    }
    t.log(ran + ' combo checks ran');
    t.ok(true, 'combos');
  });

  // ---- 24. conditional heal (Nov 18) ---------------------------------------------------------------------------------------
  T.suite('hero_biz: conditional heal (Nov 18) — the bask is his only HP gain, no shield, no threshold, never a revive, never a robot', function (t) {
    if (!ready(t)) return;
    // HP at combat start equals max, no Block
    fight({ heroes: [{ x: 1, y: 4, level: 3, items: ['biz_spare_tail', 'biz_warranty'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    let u = B();
    t.ok(u.hp === u.maxHp && u.block === 0, 'combat start: full HP, no Block (no shield)');
    // the same bask at 21/22 and at 3/22 (no threshold)
    [[21, 22], [3, 6]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      u = B();
      bots(t, [2, 4], [1, 5]);
      use(t, u, give(u, 'biz_overclock', 1), 2, 4, 'Overclock');
      u.hp = c[0];
      const calls = healCalls(function () { DD.Combat.endTurn(); });
      t.ok(u.hp === c[1] && lifts(calls).length === 1 && lifts(calls)[0].n === 3, 'at ' + c[0] + '/22 the bask is the same 3 (→ ' + u.hp + ')');
    });
    // nothing else in the kit gives him HP; no Act.heal ever aims at a robot
    fight({ heroes: [{ x: 1, y: 1, items: ['biz_warranty', 'biz_spare_tail'] }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 6 }, { id: 'test_grunt', x: 6, y: 4, hpMult: 6 }] });
    u = B();
    bots(t, [2, 1], [1, 2]);
    u.hp = 10;
    u.skills = ['biz_duct_tape', 'biz_firmware', 'biz_red_button', 'biz_reboot'].map(function (id) { return DD.Act.makeSlot(id, 3); });
    let calls = healCalls(function () {
      u.ap = 9;
      use(t, u, u.skills[0], 1, 2, 'Duct Tape');
      use(t, u, u.skills[1], 2, 1, 'Firmware Update');
      use(t, u, u.skills[2], 2, 1, 'the Button');
      use(t, u, u.skills[3], 2, 1, 'Turn It Off and On Again');
      DD.Combat.state.hype = 100;
      Bz().scrap(u, 'spooder');
      use(t, u, u.signature, u.x, u.y, 'Spoodmarino!');
    });
    t.eq(u.hp, 10, 'Duct Tape, Firmware Update, the Button, a reboot, a Warranty claim and Spoodmarino: his HP unchanged');
    t.eq(calls.filter(function (x) { return !x.sim; }).length, 0, 'not one DD.Act.heal call');
    // a whole AutoPlay battle: every heal of his kit is lift:biz on Biz himself; none ever on a construct
    const rh = DD.Combat.makeRunHero({ id: HERO, level: 3, skills: POOL.slice(0, 4).map(function (id) { return { id: id, level: 2 }; }) });
    const setup = DD.Encounter.build(DD.getEncounter('test_a1_normal'), [rh, DD.Combat.makeRunHero({ id: 'test_knight', level: 3 })], { rng: DD.RNG('biz-heal:' + t.seed), difficulty: 'normal', act: 1 });
    DD.Combat.start(setup, { seed: 77, headless: true, difficulty: 'normal' });
    calls = healCalls(function () { t.tryRun('battle', function () { DD.AutoPlay.runBattle(25); }); });
    const real = calls.filter(function (x) { return !x.sim; });
    t.ok(real.every(function (x) { return x.target && !Bz().kindOf(x.target); }), 'no heal ever lands on a robot (' + real.length + ' heals in the battle)');
    t.ok(lifts(calls).every(function (x) { return x.src && x.src.defId === HERO && x.target === x.src; }), 'every lift:biz heals Biz himself (' + lifts(calls).length + ')');
    // never a revive: a downed Biz next to his hot robot gets no call (checked in the Overclock suite too)
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [2, 4], [1, 5]);
    use(t, u, give(u, 'biz_overclock', 1), 2, 4, 'Overclock');
    A().damage(foes()[0], u, 999, { cause: 'other' });
    calls = healCalls(function () { Bz().bask(u); DD.Combat.endTurn(); });
    t.ok(u.downed && lifts(calls).length === 0, 'downed: no bask, no revive');
  });

  // ---- h19 qa-fix:content -------------------------------------------------------------------------------------------------
  T.suite('hero_biz: QA fixes — the heap names its robot and turns, Spoodmarino!\'s area is where they reboot, one signature bark, each robot skill its own sound, the tin double\'s laugh, his own swap and move lines', function (t) {
    if (!ready(t)) return;
    // QA-BIZ-1: the hover label (the tile inspect prints obj.label) names the robot and the turns, and follows the countdown
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    let u = B();
    bots(t, [4, 4], [2, 6]);
    Bz().scrap(u, 'hjalmarino');
    t.eq(tile(4, 4).obj.label, 'Hjalmarino\'s Scrap Heap (reboots in 3 of Biz\'s turns)', 'placed: the label names the robot and 3 turns');
    toHisTurn(u);
    t.eq(tile(4, 4).obj.label, 'Hjalmarino\'s Scrap Heap (reboots in 2 of Biz\'s turns)', 'his next turn: 2');
    toHisTurn(u);
    t.eq(tile(4, 4).obj.label, 'Hjalmarino\'s Scrap Heap (reboots at the start of Biz\'s next turn)', 'then: his next turn');
    // other content replaced the heap: syncHeaps re-places it with the label
    A().removeObject(4, 4);
    Bz().syncHeaps(u);
    const moved = Bz().heapOf(u, 'hjalmarino');
    t.ok(!!moved && moved.label === 'Hjalmarino\'s Scrap Heap (reboots at the start of Biz\'s next turn)', 're-placed heap keeps its label');
    t.eq(Bz().heapLabel(u, 'spooder', 0), 'Spooder\'s Scrap Heap (reboots as soon as there is room)', 'no room yet: "as soon as there is room"');
    // the tag's digit is twice the old size and carries no outline stroke (painter spy)
    const texts = [], g0 = { ctx: { save: function () {}, restore: function () {} } };
    ['ellipse', 'arc', 'circle', 'line', 'poly', 'rect'].forEach(function (k) { g0[k] = function () { return g0; }; });
    g0.text = function (s, x, y, size, col, stroke) { texts.push({ s: s, size: size, stroke: stroke }); return g0; };
    Bz().painters.drawScrap(g0, { data: { kind: 'hjalmarino', left: 3 } }, 0);
    t.ok(texts.length === 1 && texts[0].s === '3' && texts[0].size >= 9 && texts[0].stroke === null, 'the heap\'s digit: size ' + (texts[0] && texts[0].size) + ', no outline blob');
    // QA-BIZ-3: the highlight is centred where each scrapped robot will actually reboot (its heap tile is taken here)
    fight({ heroes: [{ x: 1, y: 1 }, { id: 'test_knight', x: 0, y: 8 }],
      enemies: [{ id: 'test_grunt', x: 7, y: 7, hpMult: 3 }, { id: 'test_grunt', x: 8, y: 0, hpMult: 3 }, { id: 'test_grunt', x: 6, y: 1, hpMult: 3 }] });
    u = B();
    bots(t, [4, 5], [1, 7]);
    Bz().scrap(u, 'hjalmarino');
    put(t, foes()[0], 4, 5);                                    // a foe stands on the non-blocking heap
    DD.Combat.state.hype = 100;
    const spots = Bz().rebootSpots(u), spot = spots[0];
    t.ok(spots.length === 1 && spot && !(spot.x === 4 && spot.y === 5), 'the heap tile is taken: it reboots next to it (' + (spot && spot.x + ',' + spot.y) + ')');
    const area = Bz().comboArea({ user: u }), inArea = function (p) { return area.some(function (q) { return q.x === p.x && q.y === p.y; }); };
    let all = true;
    for (let x = 0; x < 9; x++) for (let y = 0; y < 9; y++) if (Math.abs(x - spot.x) + Math.abs(y - spot.y) <= 2 && DD.Grid.tile(x, y)) all = all && inArea({ x: x, y: y });
    t.ok(all, 'every tile within 2 of the reboot spot is highlighted');
    const hp0 = foes().map(function (f) { return f.hp; });
    let sig = 0;
    const bk = A().bark;
    try {
      A().bark = function (who, key) { if (who === u && key === 'signature') sig++; return bk.apply(this, arguments); };
      use(t, u, u.signature, u.x, u.y, 'Spoodmarino!');
    } finally { A().bark = bk; }
    t.ok(!!hj() && hj().x === spot.x && hj().y === spot.y, 'Hjalmarino rebooted on the predicted tile');
    foes().forEach(function (f, i) { if (f.hp < hp0[i]) t.ok(inArea(f), 'a foe it hit (' + f.x + ',' + f.y + ') was inside the highlight'); });
    t.eq(sig, 1, 'QA-BIZ-7: one "signature" bark per cast (the engine\'s)');
    // a heap-less record reboots next to Biz: the highlight covers that spot too
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [1, 1], [7, 1]);
    Bz().scrap(u, 'hjalmarino');
    const rec = Bz().data(u).scrap.hjalmarino;
    if (rec.at) A().removeObject(rec.at.x, rec.at.y);
    rec.at = null;
    const near = Bz().rebootSpots(u)[0];
    const area2 = Bz().comboArea({ user: u });
    t.ok(!!near && dist(near, u) <= 2 && area2.some(function (q) { return q.x === near.x && q.y === near.y; }), 'a heap-less robot: its spot next to Biz is in the highlight');
    // voice-6: each robot skill barks its own pool (and every pool stays pronoun-free)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 6 }] });
    u = B();
    bots(t, [3, 4], [4, 2]);
    const keys = [], mb = A().maybeBark;
    try {
      A().maybeBark = function (who, key) { keys.push((who.defId === Bz().HJ ? 'hj:' : who.defId === Bz().SP ? 'sp:' : '?:') + key); return mb.apply(this, arguments); };
      const m = hj(), s = sp();
      use(t, m, m.skills[0], 4, 4, 'Monkey Wrench');
      use(t, m, m.skills[1], 4, 4, 'Cymbal Crash');
      use(t, s, s.skills[0], 4, 4, 'Pew Pew');
      use(t, s, s.skills[1], 4, 4, 'Thwip!');
    } finally { A().maybeBark = mb; }
    t.eq(keys.filter(function (k) { return k.indexOf('?:') !== 0; }).join(','), 'hj:wrench,hj:cymbal,sp:pew,sp:thwip', 'each skill rolls its own bark key');
    const HD = DD.getSummon ? DD.getSummon(Bz().HJ) : DD.defs.summons[Bz().HJ], SD = DD.getSummon ? DD.getSummon(Bz().SP) : DD.defs.summons[Bz().SP];
    t.ok(!/thwip|pew/i.test(HD.barks.wrench.concat(HD.barks.cymbal).join(' ')) && !/clang|wrench|thwip/i.test(SD.barks.pew.join(' ')) && !/pew|clang/i.test(SD.barks.thwip.join(' ')),
      'no pool makes another skill\'s sound');
    // voice-5: the laughing complaint comes after the monkey laughs
    if (DD.getHero('hjalmar')) {
      fight({ heroes: [{ x: 1, y: 4 }, { id: 'hjalmar', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      u = B();
      Bz().data(u).tin = false;
      const said = [], rolls = [0.1, 0.99], rn = DD.rng.next;
      try {
        A().bark = function (who, key) { said.push((who.defId === 'hjalmar' ? 'hjalmar' : who.defId === Bz().HJ ? 'monkey' : who.defId) + ':' + key); return bk.apply(this, arguments); };
        DD.rng.next = function () { return rolls.length ? rolls.shift() : 0.5; };
        Bz().tinDouble(u);
      } finally { A().bark = bk; DD.rng.next = rn; }
      t.eq(said.join(' / '), 'monkey:' + Bz().TIN_LAUGH + ' / hjalmar:Why is it laughing like me?! Stop that! / biz:tin_double', 'the monkey laughs, then Hjalmar objects, then Biz explains');
    } else t.log('hjalmar not loaded (isolated run): the laugh order is checked in the full run');
    // voice-4: his swap and move lines are his own (no opener another hero's swap line uses; not Valdris's "Coming through")
    const h = DD.getHero(HERO);
    const opener = function (l) { return norm(String(l).replace(/\{ally\}/g, 'ally')).split(' ').slice(0, 2).join(' '); };
    const others = {};
    Object.keys(DD.defs.heroes).forEach(function (k) {
      if (k === HERO || /^test_/.test(k)) return;
      ((DD.defs.heroes[k].barks || {}).swap || []).forEach(function (l) { others[opener(l)] = k; });
    });
    // ("Swap, {ally}" / "{ally}, swap" is the verb itself, a roster-wide formula: only the other openers must be his own)
    const generic = function (o) { return /^(?:swap ally|ally swap)$/.test(o); };
    h.barks.swap.forEach(function (l) { t.ok(generic(opener(l)) || !others[opener(l)], 'swap opener "' + opener(l) + '" is his own' + (others[opener(l)] ? ' (also ' + others[opener(l)] + ')' : '') + ': ' + l); });
    t.ok(!/coming through|mind the|pardon me/i.test(h.barks.move.concat(h.barks.swap).join(' ')), 'no "Coming through", "Mind the …" or "Pardon me" in his move and swap lines');
    // one heap per kind: a second robot of a kind (other content built it while the first one's record waited) that falls
    // on the first one's heap replaces it there, never leaving two heaps or a heap on the nearest free tile (the content
    // suite's barrel check: a Hjalmarino summoned onto its old heap wrenched a barrel, and the new heap filled the hole)
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    bots(t, [5, 3], [1, 7]);
    A().kill(hj(), null);
    const m2 = A().summon(u, Bz().HJ, 5, 3, { ready: true, level: 1, noFx: true });
    t.ok(!!m2 && m2.x === 5 && m2.y === 3, 'a second Hjalmarino stands on the first one\'s heap');
    A().kill(m2, null);
    const heaps = DD.Combat.state.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === Bz().SCRAP && tl.obj.data.kind === 'hjalmarino'; });
    t.ok(heaps.length === 1 && heaps[0].x === 5 && heaps[0].y === 3, 'one Hjalmarino heap, where it fell (' + heaps.map(function (tl) { return tl.x + ',' + tl.y; }).join(' ') + ')');
  });

  // ---- fix:polish (Nov 21): QA-BIZ-4's content half — the bask cue (passive.turnEndNote) ------------------------------------
  T.suite('hero_biz: polish — turnEndNote says where his turn has to end for the bask (his tile, a robot\'s hovered move), and the bask agrees; pure; the comments', function (t) {
    if (!ready(t)) return;
    const pv = DD.getHero(HERO).passive;
    t.ok(typeof pv.turnEndNote === 'function', 'the passive has a turnEndNote');
    const note = function (u, x, y, moved) { return pv.turnEndNote(u, x, y, moved); };
    // no robot running hot: nothing to say anywhere
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    let u = B();
    bots(t, [2, 4], [1, 6]);
    u.hp = 10;
    t.ok(note(u, 1, 4) === '' && note(u, 3, 4) === '' && note(u, 1, 5) === '', 'no Overclocked robot: no note');
    // Overclock I on Hjalmarino (2,4): next to it "+3 HP", elsewhere "won't bask here"
    use(t, u, give(u, 'biz_overclock', 1), 2, 4, 'Overclock I on Hjalmarino');
    t.eq(note(u, 1, 4), '♨️ Biz basks on Hjalmarino\'s hot engine: +3 HP', 'next to it (1,4)');
    t.eq(note(u, 2, 5), '♨️ Biz basks on Hjalmarino\'s hot engine: +3 HP', 'next to it (2,5)');
    t.eq(note(u, 1, 3), '♨️ Biz won\'t bask here: not next to Hjalmarino', 'a diagonal (1,3) is not next to it');
    t.eq(note(u, 0, 4), '♨️ Biz won\'t bask here: not next to Hjalmarino', 'two tiles away');
    // the robot's hovered move: it counts as standing on the hovered tile, Biz where he stands
    t.eq(note(u, 1, 4, { unit: hj(), x: 5, y: 5 }), '♨️ Biz won\'t bask here: not next to Hjalmarino', 'Hjalmarino walking off to 5,5: no bask where Biz stands');
    t.eq(note(u, 0, 4, { unit: hj(), x: 0, y: 5 }), '♨️ Biz basks on Hjalmarino\'s hot engine: +3 HP', 'Hjalmarino walking next to him: the bask');
    t.eq(note(u, 1, 4, { unit: sp(), x: 5, y: 5 }), '♨️ Biz basks on Hjalmarino\'s hot engine: +3 HP', 'Spooder (not hot) moving changes nothing');
    // the HP is what the bask restores now: 2 HP down → "+2 HP"; full HP → "nothing to heal (full HP)"
    u.hp = u.maxHp - 2;
    t.eq(note(u, 1, 4), '♨️ Biz basks on Hjalmarino\'s hot engine: +2 HP', '2 HP down: +2');
    u.hp = u.maxHp;
    t.eq(note(u, 1, 4), '♨️ Biz basks on Hjalmarino\'s hot engine: nothing to heal (full HP)', 'full HP: nothing to heal');
    // pure: no bookkeeping or status changes, no heal call
    u.hp = 10;
    const snap = function () { return JSON.stringify(Bz().data(u)) + '|' + u.hp + '|' + JSON.stringify(st(hj(), 'biz_overclocked').data); };
    const s0 = snap();
    const calls = healCalls(function () { note(u, 1, 4); note(u, 7, 7); note(u, 0, 4, { unit: hj(), x: 0, y: 5 }); });
    t.ok(snap() === s0 && calls.length === 0, 'pure: nothing changes, no heal is called');
    // the note agrees with the real bask: where it says "basks" his turn end heals that much, where it says "won't" nothing
    let lines = [];
    let cl = healCalls(function () { lines = logged(/basks/, function () { DD.Combat.endTurn(); }); });
    t.ok(u.hp === 13 && lifts(cl).length === 1 && lines.length === 1, 'he ended on 1,4 ("+3 HP"): +3 (13)');
    t.eq(note(u, 1, 4), '', 'after his turn end nothing runs hot: no note');
    fight({ heroes: [{ x: 0, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    u = B();
    bots(t, [2, 4], [1, 6]);
    use(t, u, give(u, 'biz_overclock', 1), 2, 4, 'Overclock I on Hjalmarino, Biz two tiles off');
    u.hp = 10;
    t.eq(note(u, u.x, u.y), '♨️ Biz won\'t bask here: not next to Hjalmarino', 'where he stands: "won\'t bask here"');
    cl = healCalls(function () { DD.Combat.endTurn(); });
    t.ok(u.hp === 10 && lifts(cl).length === 0, 'and his turn end heals nothing');
    // two robots running hot: the bigger number, as the bask takes it; both named when he is next to neither
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    u = B();
    u.skills = [DD.Act.makeSlot('biz_overclock', 1), DD.Act.makeSlot('biz_overclock', 2)];
    bots(t, [2, 4], [1, 5]);
    use(t, u, u.skills[0], 2, 4, 'Overclock I on Hjalmarino');
    use(t, u, u.skills[1], 1, 5, 'Overclock II on Spooder');
    u.hp = 10;
    t.eq(note(u, 1, 4), '♨️ Biz basks on Spooder\'s hot engine: +4 HP', 'next to both: the bigger bask (Spooder\'s 4)');
    t.eq(note(u, 2, 3), '♨️ Biz basks on Hjalmarino\'s hot engine: +3 HP', 'next to Hjalmarino only: 3');
    t.eq(note(u, 5, 1), '♨️ Biz won\'t bask here: not next to Hjalmarino or Spooder', 'next to neither: both named');
    // someone else's overclock, a downed Biz, a scrapped robot: no note
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    u = B();
    bots(t, [2, 4], [1, 5]);
    const fake = A().addStatus(hj(), 'biz_overclocked', { turns: 1, silent: true }, hero('test_knight'));
    fake.data = { bask: 3, src: hero('test_knight').id };
    t.eq(note(u, 1, 4), '', 'overclocked by someone else: no note');
    A().removeStatus(hj(), 'biz_overclocked', { silent: true });
    use(t, u, give(u, 'biz_overclock', 1), 2, 4, 'Overclock');
    Bz().scrap(u, 'hjalmarino');
    t.eq(note(u, 1, 4), '', 'the hot robot was scrapped: no note');
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    u = B();
    bots(t, [2, 4], [1, 5]);
    use(t, u, give(u, 'biz_overclock', 1), 2, 4, 'Overclock');
    A().damage(foes()[0], u, 999, { cause: 'other' });
    t.ok(u.downed && note(u, 1, 4) === '', 'downed: no note');
    // the HUD reads it through DD.HUD.turnEndNote when the combat screen is up (hud_tests covers the hint, panel and End Turn)
    t.ok(typeof DD.Biz.baskNote === 'function', 'DD.Biz.baskNote is a function');
    // the stale comments (gate "small things left"): the header's Mk bands read MK_AT; no line names another new hero (D11)
    let src = null;
    try {
      const x = new XMLHttpRequest();
      x.open('GET', (window.DD_BASE || '../') + 'js/data/heroes/biz.js', false);
      if (x.overrideMimeType) x.overrideMimeType('text/plain; charset=utf-8');
      x.send();
      if ((x.status === 0 || x.status === 200) && x.responseText) src = x.responseText;
    } catch (e) { src = null; }
    if (!src) { t.log('this page can\'t read js/data/heroes/biz.js: the comment checks run through tools/test.sh'); return; }
    t.ok(src.indexOf('Mk II from ' + Bz().MK_AT[0] + ', Mk III from ' + Bz().MK_AT[1]) >= 0 && !/follows his level \(3 \/ 6\)/.test(src),
      'the header says Mk II from ' + Bz().MK_AT[0] + ', Mk III from ' + Bz().MK_AT[1] + ' (MK_AT), not "3 / 6"');
    t.ok(!/\b(Rasma|Phat|Gus|monotaur)\b/i.test(src), 'D11: no line of biz.js (comments included) names another new hero');
  });

  // ---- 25. zz balance sim (sim=1 only) --------------------------------------------------------------------------------------
  // ---- fix:balance (Nov 21; the lead's B1-B5) ---------------------------------------------------------------------------
  T.suite('hero_biz: fix:balance — the robots\' warm term (B1), Booting Up (B2), the passive and tip word for word', function (t) {
    if (!ready(t)) return;
    const h = DD.getHero(HERO);
    t.eq(h.passive.desc, 'Starts each fight with Hjalmarino (a mechanical monkey) and Spooder (a mechanical spider), who act on his turn. ' +
      'A scrapped one reboots at its Scrap Heap on his third turn after (a third of its HP) and sits that turn out.', 'the passive, word for word');
    // the numbers this pass settled (B3 Overclock +1 AP, B4 the robots' basics 1 less, never below 2; B5 robot HP)
    t.ok(DD.getSkill('biz_overclock').levels.every(function (L) { return L.ap === 1; }) && Bz().OC_AP === 1, 'B3: Overclock gives 1 AP at every level (was 2)');
    t.eq(DD.getSkill('biz_monkey_wrench').levels.map(function (L) { return L.dmg; }).join(' / '), '2 / 3 / 4', 'B4: Monkey Wrench 2 / 3 / 4 (was 3 / 4 / 5)');
    t.eq(DD.getSkill('biz_pew_pew').levels.map(function (L) { return L.dmg; }).join(' / '), '2 / 2 / 3', 'B4: Pew Pew 2 / 2 / 3 (was 2 / 3 / 4; never below 2)');
    const K = Bz().KINDS;
    t.ok(K.hjalmarino.base === 4 && K.spooder.base === 3 && K.hjalmarino.per === 2 && K.spooder.per === 2, 'B5: robot HP 4 + 2L / 3 + 2L (was 6 / 4 + 2L; the floors)');
    t.ok(K.hjalmarino.defHp === K.hjalmarino.base + K.hjalmarino.per && K.spooder.defHp === K.spooder.base + K.spooder.per, 'the defs\' HP is level 1\'s');
    t.ok((DD.defs.narration.tips || []).indexOf('A scrapped robot reboots at its Scrap Heap three of Biz\'s turns later and spends that turn booting up. ' +
      'Turn It Off and On Again does it now.') >= 0, 'the reboot tip, word for word');
    // B1: a hot robot's attack from a tile next to Biz is worth his bask (in full once he can't move, a third while he can)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    const u = B();
    u.skills = [DD.Act.makeSlot('biz_overclock', 1)];
    bots(t, [2, 4], [1, 6]);
    const m = hj(), wrench = DD.getSkill('biz_monkey_wrench');
    t.ok(typeof wrench.aiScore === 'function' && DD.getSkill('biz_pew_pew').aiScore === Bz().warmScore && wrench.aiScore === Bz().warmScore, 'Monkey Wrench and Pew Pew carry the warm term');
    const w = function () { return Bz().warmScore(ctxFor(m, m.skills[0], { x: 4, y: 4 })); };
    t.eq(w(), 0, 'not overclocked: 0');
    use(t, u, u.skills[0], 2, 4, 'Overclock');
    t.eq(w(), 0, 'Biz at full HP: 0 (nothing to bask for)');
    u.hp = 10;
    const hw = DD.AutoPlay.healWorth(u, 3);
    u.ap = 2;
    t.ok(Math.abs(w() - hw / 3) < 1e-9, 'hurt, he can still move: a third of healWorth (' + w().toFixed(2) + ')');
    u.ap = 0;
    t.ok(Math.abs(w() - hw) < 1e-9, 'hurt, no AP left: healWorth in full (' + w().toFixed(2) + ')');
    const away = DD.Combat.state.units.filter(function (x) { return x === m; })[0];
    const ox = away.x;
    away.x = 3;
    t.eq(w(), 0, 'attacking from a tile not next to him: 0');
    away.x = ox;
    // B2: a Warranty claim (back next turn) boots up too
    fight({ heroes: [{ x: 1, y: 4, items: ['biz_warranty'] }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    const v = B();
    bots(t, [4, 4], [2, 6]);
    Bz().scrap(v, 'spooder');
    toHisTurn(v);
    const back = sp();
    t.ok(!!back && back.ap === 0 && has(back, 'biz_booting'), 'a Warranty claim: back at his next turn start, booting up (0 AP)');
    toHisTurn(v);
    t.ok(back.ap === 2 && !has(back, 'biz_booting'), 'and acts the turn after');
  });

  T.suite('hero_biz: zz balance sim (sim=1 only)', function (t) {
    if (t.param('sim', '0') !== '1') { t.skip('sim=1 only'); return; }
    if (!ready(t) || !DD.Encounter) return;
    const n = Math.max(1, +t.param('n', 2) || 2);
    const encs = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; })
      .filter(function (e) { return !/^(test_|mgt_|mg_)/.test(e.id) && e.kind !== 'boss' && e.act >= 1 && e.act <= 3 && !e.gauntlet && !e.finale; });
    const pool = Object.keys(DD.defs.heroes).filter(function (k) { return k.indexOf('test_') !== 0 && k !== HERO; });
    const rng = DD.RNG('biz-sim:' + t.seed);
    const uses = {}, sockets = {};
    let fights = 0, wins = 0, long = 0, overLong = 0, basks = 0, baskHp = 0, scraps = 0, reboots = 0, backBefore = 0, bizDmg = 0, botDmg = 0, taken = 0, downs = 0;
    // fix:balance (Nov 21, B1): why a hurt Biz's Overclock turn ends without the bask — the robot walked off after his
    // last action ('left'), he kept AP and stayed away ('apLeft'), or he was never next to it after acting ('far')
    const diag = { turns: 0, next: 0, gone: 0, hurt: 0, hurtNext: 0, left: 0, apLeft: 0, far: 0 };
    function oneFight(enc) {
      const others = pool.length >= 3 ? rng.sample(pool, 3) : ['test_knight', 'test_cleric', 'test_mage'];
      const ids = rng.shuffle([HERO].concat(others));
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
      let over = false, scrapNow = 0, backNow = 0, hotTurn = -1, trace = null;
      // Biz's tile and AP after his latest action this Overclock turn, and where the hot robot stood then
      const note = function (u) {
        const c = trace && DD.Combat.byId(trace.hot);
        trace.b = { x: u.x, y: u.y, ap: u.ap || 0 };
        trace.c = c && !c.dead ? { x: c.x, y: c.y } : null;
      };
      A().addRule({ id: 'biz_sim_probe', name: 'probe', silent: true, hooks: {
        onSkillUsed: function (ctx) {
          if (A().simulating || !ctx.user || ctx.user.defId !== HERO || !ctx.skill || ctx.opportunity) return;
          uses[ctx.skill.id] = (uses[ctx.skill.id] || 0) + 1;
          if (ctx.skill.id === 'biz_overclock') { over = true; hotTurn = DD.Combat.state.turn; trace = { hot: ctx.targetUnit && ctx.targetUnit.id }; }
          if (trace && hotTurn === DD.Combat.state.turn) note(ctx.user);
        },
        onMove: function (u) { if (!A().simulating && u && u.defId === HERO && trace && hotTurn === DD.Combat.state.turn) note(u); },
        // rules fire after his passive: the bask (if any) has happened
        onTurnEnd: function (u) {
          if (A().simulating || !u || u.defId !== HERO || hotTurn !== DD.Combat.state.turn) return;
          diag.turns++;
          const hot = Bz().constructsOf(u).filter(function (c) { const x = st(c, 'biz_overclocked'); return x && x.data && x.data.src === u.id; });
          if (!hot.length) { diag.gone++; return; }
          const next = hot.some(function (c) { return dist(c, u) === 1; });
          const hurt = u.hp < u.maxHp || (Bz().data(u) && Bz().data(u).basked === DD.Combat.state.turn && u.hp === u.maxHp);
          if (next) diag.next++;
          if (!hurt) return;
          diag.hurt++;
          if (next) diag.hurtNext++;
          else if (trace && trace.b && trace.c && dist(trace.b, trace.c) === 1) diag.left++;
          else if (trace && trace.b && trace.b.ap > 0) diag.apLeft++;
          else diag.far++;
        },
        onTakeDamage: function (d) { if (!A().simulating && d && d.target && d.target.defId === HERO) taken += d.dealt || 0; },
      } });
      const offLog = DD.Events.on('combat:log', function (e) {
        const s = String((e && (e.text || e.msg || (e.entry && e.entry.text))) || '');
        if (/is scrap!|goes KABOOM/.test(s)) { scraps++; scrapNow++; }
        if (/reboots .* from the scrap|off and on again|climbs onto Spooder/.test(s)) { reboots++; backNow++; }
      });
      const calls = healCalls(function () { DD.AutoPlay.runBattle(30); });
      offLog();
      A().removeRule('biz_sim_probe');
      lifts(calls).forEach(function (x) { basks++; baskHp += x.healed; });
      backBefore += Math.min(scrapNow, backNow);
      const s = DD.Combat.state;
      fights++;
      if (s.result === 'victory') wins++;
      if (s.round >= 4) { long++; if (over) overLong++; }
      s.units.forEach(function (u) {
        const us = s.stats.units[u.id] || {};
        if (u.defId === HERO) { bizDmg += us.dmg || 0; if (u.downed) downs++; }
        else if (Bz().kindOf(u) && DD.Combat.byId(u.ownerId) && DD.Combat.byId(u.ownerId).defId === HERO) botDmg += us.dmg || 0;
      });
    }
    encs.forEach(function (enc) { for (let i = 0; i < n; i++) oneFight(enc); });
    const f = Math.max(1, fights);
    t.log('fights ' + fights + ', wins ' + wins + ' · robots\' share of Biz-side damage ' + (100 * botDmg / Math.max(1, botDmg + bizDmg)).toFixed(0) + '% (target 55-75%)');
    t.log('Overclock in ' + overLong + '/' + long + ' fights of 4+ rounds · basks (lift:biz) ' + (basks / f).toFixed(2) + '/fight, ' + (baskHp / f).toFixed(1) + ' HP/fight (T8n 0.8-2, 3-8)');
    t.log('Overclock turns ' + diag.turns + ': ended next to the hot robot ' + diag.next + ' · the hot robot scrapped first ' + diag.gone + ' · Biz hurt at turn end (or healed to full by the bask) ' + diag.hurt);
    t.log('hurt Overclock turns ' + diag.hurt + ': basked ' + diag.hurtNext + ' · the robot walked off after his last action ' + diag.left +
      ' · he kept AP and stayed away ' + diag.apLeft + ' · never next to it after acting ' + diag.far);
    t.log('scraps ' + (scraps / f).toFixed(2) + '/fight (0.5-1.5) · back before the end ' + (scraps ? (100 * backBefore / scraps).toFixed(0) : '–') + '% · Biz taken ' + (taken / f).toFixed(1) + '/fight · downed ' + downs);
    t.log('uses per fight when socketed: ' + POOL.filter(function (id) { return sockets[id]; }).map(function (id) { return DD.getSkill(id).name + ' ' + ((uses[id] || 0) / sockets[id]).toFixed(2); }).join(' · '));
    t.ok(fights > 0, 'simulated');
  });
})();
