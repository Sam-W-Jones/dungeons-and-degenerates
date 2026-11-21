/* Dungeons and Degenerates — tests/content/hero_gus.js
 * Suites "hero_gus: …" for js/data/heroes/gus.js (owner: HERO-GUS; spec .tmp/h19/addendum-gus.md §19): the hero def,
 * the acorn loop (the drop, the BONK, the cap, downs, dispels), eating (paid in onCostPaid: object hits eat, echoes
 * don't, previews and dry runs pay on the copy, the pockets never change), stress eating (his one conditional heal and
 * the D9 guard), every skill at every level, the signature, the items, HUD previews, v2 edge cases, attacks of
 * opportunity, AutoPlay (prices, choices, fixture battles, determinism), the sprite and the six FX painters at every
 * yaw, combos with the cast (skipped when a hero file isn't loaded) and the zz sim (sim=1 only).
 * Run: bash tools/test.sh "suite=hero_gus&isolate=heroes/gus,hero_gus"
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const HERO = 'gus';
  const EATERS = ['gus_whispers', 'gus_root_canal', 'gus_hollow', 'gus_binge', 'gus_hole', 'gus_eyes'];
  const POOL = ['gus_whispers', 'gus_root_canal', 'gus_hollow', 'gus_binge', 'gus_hole', 'gus_eyes', 'gus_tree', 'gus_hangry', 'gus_have_one'];
  const ALL = ['gus_incisor', 'gus_acorn'].concat(POOL);
  const ITEMS = ['gus_nomnomicon', 'gus_cheeks_of_holding', 'gus_winter_coat'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const CUSTOM_BARKS = ['eat', 'stress', 'bonk', 'hangry', 'binge', 'share', 'hole', 'whisper', 'burp', 'confiscated', 'snackbowl'];
  const RESERVED = ['Phat Gus', 'Incisor Decision', 'Don\'t Listen to the Trees', 'Root Canal', 'The Hollow Hungers', 'All You Can Eat',
    'Down the Squirrel Hole', 'Too Many Eyes', 'The Tree That Isn\'t There', 'Hangry', 'Fine, Have One', 'The Acorn That Should Not Be',
    'The Woods Provide', 'Cheekful of Acorns', 'The Nom-Nom-Nomicon', 'Cheeks of Holding', 'Winter Coat (Built In)'];
  // D11: no line in his files names another new hero or a construct of another hero
  const OTHER_NEW = /\b(Rasma|Biz|Hjalmarino|Spooder)\b/;

  // ---- helpers -----------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function Gs() { return DD.Gus; }
  function ready(t) {
    if (!DD.getHero(HERO) || !Gs()) { t.skip('gus.js not loaded'); return false; }
    return true;
  }
  /** Sandbox that never ends on its own, 9×9 stone, heroes first; enemies pass unless cfg.enemyAi is true. */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = (cfg.heroes || [{ x: 2, y: 4 }]).map(function (h) { return Object.assign({ id: HERO, level: 1, skills: [] }, h); });
    DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, enemyAi: false, enemies: [],
      objective: { type: 'custom', text: 'Phat Gus test' }, encounter: { id: 'gus_test_arena', checkObjective: function () { return null; } },
    }, cfg, { heroes: heroes }));
    return DD.Combat.state;
  }
  function Gu() { return DD.Combat.heroes().filter(function (u) { return u.defId === HERO; })[0]; }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function foes() { return DD.Combat.enemies(); }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function n(u) { return Gs().cheeks(u); }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }
  function norm(s) { return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim(); }
  /** The slot he uses for a skill: his basic / signature (Hype filled), or a fresh socket at a level. */
  function give(u, id, level) {
    if (id === 'gus_acorn') { DD.Combat.state.hype = 100; return u.signature; }
    if (id === 'gus_incisor') return u.basic;
    const sl = DD.Act.makeSlot(id, level || 1);
    u.skills = [sl];
    return sl;
  }
  function use(t, u, sl, x, y, label) {
    const why = DD.Combat.canUse(u, sl);
    const ok = why === true && DD.Combat.useSkill(u, sl, x, y);
    t.ok(ok, (label || sl.id) + ' used @' + x + ',' + y + (why === true ? '' : ' (' + why + ')'));
    return ok;
  }
  /** End turns until it is u's turn again (the other heroes pass; enemies pass unless the fight has enemyAi). */
  function toHisTurn(u) {
    for (let i = 0; i < 8; i++) {
      DD.Combat.endTurn();
      if (DD.Combat.current() === u || DD.Combat.state.result) return true;
    }
    return false;
  }
  function desc(id, level, user) { return DD.skillDesc(DD.getSkill(id), level, user || null); }
  function hypeGains(fn) {
    const list = [], orig = DD.Act.gainHype;
    DD.Act.gainHype = function (k, why) { list.push({ n: k, why: String(why || '') }); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.Act.gainHype = orig; }
    return list;
  }
  /** Every DD.Act.heal call made while fn runs: [{ src, target, n, via, healed, sim }]. */
  function healCalls(fn) {
    const list = [], orig = DD.Act.heal;
    DD.Act.heal = function (src, target, k, opts) {
      const healed = orig.apply(this, arguments);
      list.push({ src: src, target: target, n: k, via: opts && opts.via, healed: healed, sim: !!DD.Act.simulating });
      return healed;
    };
    try { fn(); } finally { DD.Act.heal = orig; }
    return list;
  }
  function lifts(calls) { return calls.filter(function (x) { return !x.sim && x.via === 'lift:gus'; }); }
  function logged(re, fn) {
    const list = [], orig = A().log;
    A().log = function (msg) { if (re.test(String(msg))) list.push(String(msg)); return orig.apply(this, arguments); };
    try { fn(); } finally { A().log = orig; }
    return list;
  }
  function texts(fn) {
    const list = [], orig = DD.FX.text;
    DD.FX.text = function (where, txt) { list.push(String(txt)); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.FX.text = orig; }
    return list;
  }
  /** The bark keys he tries while fn runs (cosmetic rolls forced low, so every maybeBark speaks). */
  function barkKeys(u, fn) {
    const keys = [], b = A().bark, rn = DD.rng.next;
    A().bark = function (who, key) { if (who === u) keys.push(String(key)); return b.apply(this, arguments); };
    DD.rng.next = function () { return 0; };
    try { fn(); } finally { A().bark = b; DD.rng.next = rn; }
    return keys;
  }
  /** Skill ids u used (not reactions) while fn runs. */
  function usedBy(u, fn) {
    const list = [];
    A().addRule({ id: 'gus_probe_uses', name: 'Gus probe', silent: true, hooks: {
      onSkillUsed: function (ctx) { if (!A().simulating && ctx.user === u && !ctx.opportunity && ctx.skill) list.push(ctx.skill.id); },
    } });
    try { fn(); } finally { A().removeRule('gus_probe_uses'); }
    return list;
  }
  /** What onCostPaid saw for his uses while fn runs (after his passive: p.gusAte). */
  function payments(fn) {
    const list = [];
    A().addRule({ id: 'gus_probe_paid', name: 'Gus paid probe', silent: true, hooks: {
      onCostPaid: function (p) { if (!A().simulating && p && p.unit && p.unit.defId === HERO) list.push({ skill: p.skill && p.skill.id, ate: p.gusAte }); },
    } });
    try { fn(); } finally { A().removeRule('gus_probe_paid'); }
    return list;
  }
  /** Preview, use for real, then compare HP changes / KOs / movement / Hype (no dice in his kit: exact). */
  function previewMatches(t, u, sl, x, y, label) {
    const s = DD.Combat.state;
    const before = {};
    s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed, x: o.x, y: o.y }; });
    const hype0 = s.hype, rng0 = s.rng.getState(), n0 = n(u);
    let prev = null;
    t.tryRun(label + ' preview', function () { prev = DD.Combat.preview(u, sl, x, y); });
    t.ok(!!prev && s.rng.getState() === rng0 && s.hype === hype0 && n(u) === n0 &&
      s.units.every(function (o) { const b = before[o.id]; return b && b.hp === o.hp && b.x === o.x && b.y === o.y; }), label + ': preview left the fight (and his cheeks) untouched');
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
    t.eq(s.hype - hype0, prev.hype, label + ': Hype = preview');
  }
  function textOf(h) {
    const parts = [h.blurb, h.role, h.epithet, h.race, h.cls, h.passive.name, h.passive.desc];
    ALL.forEach(function (id) { const s = DD.getSkill(id); parts.push(s.name); for (let lv = 1; lv <= s.levels.length; lv++) parts.push(desc(id, lv)); parts.push(s.flavor || ''); });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); parts.push(it.name, it.desc, it.flavor || ''); });
    const cs = DD.getStatus('gus_cheeks');
    parts.push(cs.name, cs.desc({ stacks: 2, data: { cap: 3 } }));
    Object.keys(h.barks).forEach(function (k) { Array.prototype.push.apply(parts, h.barks[k]); });
    Array.prototype.push.apply(parts, Gs().WHISPERS);
    Array.prototype.push.apply(parts, myTips());
    return parts.join(' \n ');
  }
  function myTips() { return (DD.defs.narration.tips || []).filter(function (l) { return /Phat Gus/.test(l); }); }
  /** Walls on rows y−1 and y+1 for x0..x1: a corridor along row y. */
  function corridor(y, x0, x1) {
    return function (tl) { if ((tl.y === y - 1 || tl.y === y + 1) && tl.x >= x0 && tl.x <= x1) tl.t = 'wall'; };
  }

  // ---- 1. definition ----------------------------------------------------------------------------------------------
  T.suite('hero_gus: definition, pool, status, barks, items, names, pronouns (he/him), D11', function (t) {
    if (!ready(t)) return;
    const h = DD.getHero(HERO);
    t.ok(h.name === 'Phat Gus' && h.epithet === 'the Unfathomable' && h.race === 'Squirrel (Mostly Cheeks)' && h.cls === 'Snackromancer',
      'Phat Gus the Unfathomable, Squirrel (Mostly Cheeks), Snackromancer');
    t.ok(!/folk|squirrel-man|squirrel-person|druid/i.test([h.race, h.cls, h.role, h.blurb, h.epithet].join(' ')), 'an actual squirrel: never -folk, never a druid');
    t.eq(h.role, 'Eldritch control · runs on acorns', 'role');
    t.eq(h.complexity, 2, 'complexity ★★');
    t.eq(h.color, '#a05a9c', 'forest-at-midnight plum');
    t.eq(h.unlock, null, 'available from the start (unlock: null)');
    t.eq(h.pronoun, 'he', 'pronoun: he (the user, Nov 18)');
    t.eq(JSON.stringify(h.stats), JSON.stringify({ hp: 30, ap: 3, mov: 4, armor: 0, init: 2 }), 'stats 30 HP / 3 AP / move 4 / armor 0 / init +2');
    t.eq(h.growth.hp, 4, '+4 HP a level');
    t.ok(h.stats.hp + 3 * h.growth.hp === 42 && 42 >= 29, 'level 4: 42 HP (the act-3 floor is 29)');
    t.eq(JSON.stringify(h.flags), '{}', 'flags {}: no hop (he doesn\'t climb), not immovable, no pocket slot');
    t.ok(!h.consumableSlots && !(h.passive && h.passive.consumableSlots), 'no consumableSlots anywhere (the narrator tips stay true)');
    t.ok(/\bhe\b/.test(h.blurb) && /\bhe\b/.test(h.passive.desc), 'blurb and passive say "he"');
    t.eq(h.basic, 'gus_incisor', 'basic: Incisor Decision');
    t.eq(h.signature, 'gus_acorn', 'signature: The Acorn That Should Not Be');
    t.eq(DD.getSkill(h.signature).hype, 100, 'the signature costs 100 Hype');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['gus_whispers', 'gus_root_canal']), 'starters: Don\'t Listen to the Trees + Root Canal');
    t.eq(JSON.stringify(h.skillPool.slice().sort()), JSON.stringify(POOL.slice().sort()), 'a pool of 9 (the 2 starters included)');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic and signature are never socketed');
    const own = Object.keys(DD.defs.skills).filter(function (k) { return DD.defs.skills[k].owner === HERO; }).sort();
    t.eq(JSON.stringify(own), JSON.stringify(ALL.slice().sort()), '11 skills owned by gus');
    t.eq(JSON.stringify(h.summons), '[]', 'no summons (Proud Pet Parent never picks him)');
    const genIcons = Object.keys(DD.defs.skills).filter(function (k) { return DD.defs.skills[k].owner === 'generic'; }).map(function (k) { return DD.defs.skills[k].icon; });
    t.eq(ALL.filter(function (id) { return genIcons.indexOf(DD.getSkill(id).icon) >= 0; }).join(','), '', 'no skill of his wears a generic skill\'s icon (they share the action bar)');
    // review:phat-gus — an actual squirrel never has "hands" (the user, Nov 18): no hand emoji on his buttons (Fine,
    // Have One wore 🤲, which is also the Ambidextrous Blessing's icon)
    const HANDS = /🤲|🫴|🫳|🫱|🫲|✋|🤚|🖐|👐|🙌|👋|🤝|👏|🙏|🫶|✊|👊|🤛|🤜|👌|🤌|☝|👆|👇|👈|👉|🖕|🫵/u;
    t.eq(ALL.filter(function (id) { return HANDS.test(DD.getSkill(id).icon || ''); }).join(','), '', 'no skill of his shows hands (paws, cheeks and mouth only)');
    const cs = DD.getStatus('gus_cheeks');
    t.ok(!!cs && cs.type === 'buff' && cs.stacking === 'stack' && cs.decay === 'never' && cs.icon === '🌰' && cs.name === 'Cheekful of Acorns', 'status gus_cheeks: Cheekful of Acorns, a dispellable buff that never decays');
    t.eq(cs.showStacks, true, 'showStacks (H19-SEATS landed it): one acorn reads "1"');
    t.eq(cs.desc({ stacks: 2, data: { cap: 3 } }), 'Cheeks: 2 / 3 acorns. Skills that say Eat eat them; another falls in at the start of each of his turns.', 'status desc, word for word');
    // every skill: levels, pure descs, word caps; the eaters say their price first
    ALL.forEach(function (id) {
      const s = DD.getSkill(id);
      if (POOL.indexOf(id) >= 0) t.ok(s.levels.length === 3, id + ': 3 levels');
      const tags = s.tags || [];
      t.ok(tags.indexOf('fire') < 0 && tags.indexOf('heal') < 0 && tags.indexOf('drain') < 0 && s.kind !== 'heal', id + ': no fire / heal / drain tag, not kind heal');
      s.levels.forEach(function (L, i) { t.ok(!Object.keys(L).some(function (k) { return /heal/i.test(k); }), id + ' L' + (i + 1) + ': no level key about healing'); });
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = desc(id, lv);
        t.ok(!/undefined|NaN|\[object/.test(d) && d.length > 10, id + ' L' + lv + ' desc pure with user === null: ' + d);
        const cap = id === 'gus_acorn' ? 40 : 34;
        t.ok(words(d) <= cap, id + ' L' + lv + ' desc ≤ ' + cap + ' words (' + words(d) + ')');
        const eats = EATERS.indexOf(id) >= 0;
        t.ok(eats ? /^Eat (an acorn:|2 acorns:|every acorn)/.test(d) : !/^Eat\b/.test(d), id + ' L' + lv + (eats ? ': the price first' : ': no price (it eats nothing)'));
      }
    });
    t.eq(desc('gus_root_canal', 1), 'Eat an acorn: roots burst up under a foe within 4 (no sight needed): 5 damage, and it is Weakened for 1 turn.', 'Root Canal I, word for word');
    t.ok(words(h.passive.desc) <= 45, 'passive ≤ 45 words (' + words(h.passive.desc) + ')');
    t.eq(h.passive.name, 'The Woods Provide', 'passive: The Woods Provide');
    t.eq(h.passive.desc, 'An acorn falls into Phat Gus\'s cheeks at the start of each of his turns (they hold 3; he starts with 1). Stress eating: once per turn, ' +
      'if a foe is next to him after he eats, he heals 3 HP.', 'passive desc, word for word');
    t.eq(JSON.stringify(Object.keys(h.passive.hooks).sort()), JSON.stringify(['modifyOpportunity', 'onCombatStart', 'onCostPaid', 'onSkillUsed', 'onStatusRemoved', 'onTurnStart']),
      'passive hooks: the six on the known list');
    // barks: 13 standard keys with 3-6 lines, the custom keys, every bubble ≤ 70, swap with {ally} naming no hero
    BARK_KEYS.forEach(function (k) { t.ok((h.barks[k] || []).length >= 3 && h.barks[k].length <= 6, 'barks.' + k + ': 3-6 lines'); });
    CUSTOM_BARKS.forEach(function (k) { t.ok((h.barks[k] || []).length >= 2, 'custom barks.' + k + ': 2+ lines'); });
    let longestBark = 0;
    Object.keys(h.barks).forEach(function (k) { h.barks[k].forEach(function (l) { longestBark = Math.max(longestBark, l.length); t.ok(typeof l === 'string' && l.length > 0 && l.length <= 70, 'bark ≤ 70: ' + JSON.stringify(l)); }); });
    t.log('the longest bubble: ' + longestBark + ' characters');
    const heroWords = [];
    Object.keys(DD.defs.heroes).forEach(function (id) {
      if (/^test_/.test(id) || id === HERO) return;
      String(DD.getHero(id).name).split(/[^A-Za-z]+/).forEach(function (w) { if (w.length >= 3 && /^[A-Z]/.test(w) && w !== 'The') heroWords.push(w); });
    });
    t.ok(h.barks.swap.length >= 2 && h.barks.swap.every(function (l) {
      return /\{ally\}/.test(l) && !/\{(?!ally\})/.test(l) && !heroWords.some(function (w) { return new RegExp('\\b' + w + '\\b').test(l); });
    }), '2+ swap barks with {ally}, naming no hero');
    // pronouns, D11, tone
    const text = textOf(h);
    t.ok(!/\b(she|her|hers|herself)\b/i.test(text), 'no she/her anywhere in his texts (he/him)');
    t.ok(!OTHER_NEW.test(text), 'D11: no line names Rasma, Biz, Hjalmarino or Spooder');
    t.ok(!/Svammiel|\bAct IV\b|\bact 4\b|fourth act|Under the Table/i.test(text), 'nothing of his mentions act 4 (not a spoiler)');
    t.ok(!/\bdruid/i.test(text), 'never called a druid');
    t.ok(!text.split(/(?<=[.!?…])\s+|\n/).some(function (s) { return /\b(only|first)\b/i.test(s) && /confus|haste/i.test(s); }), 'D7: no sentence calls his Confused or Haste "the only" / "the first"');
    t.ok(!/\b(gore|blood|guts|entrails)\b/i.test(text), 'no gore');
    t.ok(Gs().WHISPERS.length >= 8 && Gs().WHISPERS.every(function (w) { return w === w.toLowerCase() && !heroWords.concat(['Gus', 'Phat']).some(function (x) { return w.indexOf(x) >= 0; }); }), 'the woods whisper in lowercase and name nobody');
    // items
    const its = ITEMS.map(function (id) { return DD.getItem(id); });
    t.ok(its.every(function (it) { return it && it.hero === HERO; }), '3 hero items');
    t.eq(its.map(function (it) { return it.slot + '/' + it.rarity; }).join(','), 'weapon/legendary,trinket/rare,armor/rare', 'legendary weapon, rare trinket, rare armor');
    t.ok(its.every(function (it) { return !it.stats.block && !it.stats.heal; }), 'no starting Block, no healing stat');
    t.eq(DD.getItem('gus_nomnomicon').desc, '+10% damage. Whenever Phat Gus eats, the book reads the recipe aloud: after that skill, the nearest awake foe within 3 takes 2 psychic damage per acorn eaten.', 'Nomicon desc');
    t.eq(DD.getItem('gus_cheeks_of_holding').desc, 'Phat Gus\'s cheeks hold 4 acorns, and he starts each fight with 2.', 'Cheeks of Holding desc');
    t.eq(DD.getItem('gus_winter_coat').desc, '+5 max HP. Stress eating heals Phat Gus 2 more HP (5 in all).', 'Winter Coat desc');
    // display names: unique against every hero-side, item, consumable, Blessing, scar, status and enemy name
    const names = {};
    function add(kind, id, nm) { if (/^test_/.test(id)) return; const k = norm(nm); (names[k] = names[k] || []).push(kind + ':' + id); }
    Object.keys(DD.defs.skills).forEach(function (k) { const s = DD.defs.skills[k]; add(s.owner === 'enemy' ? 'enemy skill' : 'skill', s.id, s.name); });
    Object.keys(DD.defs.items).forEach(function (k) { add('item', k, DD.defs.items[k].name); });
    Object.keys(DD.defs.consumables || {}).forEach(function (k) { add('consumable', k, DD.defs.consumables[k].name); });
    Object.keys(DD.defs.passives || {}).forEach(function (k) { add('passive', k, DD.defs.passives[k].name); });
    Object.keys(DD.defs.scars || {}).forEach(function (k) { add('scar', k, DD.defs.scars[k].name); });
    Object.keys(DD.defs.statuses || {}).forEach(function (k) { add('status', k, DD.defs.statuses[k].name); });
    Object.keys(DD.defs.enemies).forEach(function (k) { add('enemy', k, DD.defs.enemies[k].name); });
    Object.keys(DD.defs.summons || {}).forEach(function (k) { add('summon', k, DD.defs.summons[k].name); });
    Object.keys(DD.defs.heroes).forEach(function (k) { add('hero', k, DD.defs.heroes[k].name); });
    Object.keys(DD.defs.heroes).forEach(function (k) { const p = DD.defs.heroes[k].passive; if (p && p.name) add('hero passive', k, p.name); });
    RESERVED.forEach(function (nm) { const list = names[norm(nm)] || []; t.eq(list.length, 1, 'reserved name "' + nm + '" is used once (' + list.join(', ') + ')'); });
    // the Radio Edit chip: "<skill> (Phat Gus) is bleeped: it can't be used this fight." ≤ 90 characters
    const longest = ALL.map(function (id) { return (DD.getSkill(id).name + ' (' + h.name + ') is bleeped: it can\'t be used this fight.').length; }).sort(function (a, b) { return b - a; })[0];
    t.ok(longest <= 90, 'the Radio Edit chip fits (' + longest + ' ≤ 90)');
    t.eq((DD.getSkill('gus_tree').name + ' (' + h.name + ') is bleeped: it can\'t be used this fight.').length, 77, 'The Tree That Isn\'t There chip: 77');
    // tips and the sprite
    t.eq(myTips().length, 3, 'three loading tips name Phat Gus');
    const probs = T.contentHelpers && T.contentHelpers.spriteProblems;
    if (probs) t.eq(probs(h.sprite).length, 0, 'sprite spec valid ' + JSON.stringify(probs(h.sprite)));
    t.ok(h.sprite === Gs().GUS_SPRITE && h.sprite.base === 'custom' && typeof h.sprite.underlay === 'function', 'a custom painter with the murk underlay');
  });

  // ---- 2. the acorn supply --------------------------------------------------------------------------------------------
  T.suite('hero_gus: The Woods Provide — 1 acorn at combat start (2 with Cheeks of Holding), +1 at each of his turn starts (stunned, asleep, a sheep too), the BONK at the cap', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ id: 'test_knight', x: 0, y: 0 }, { x: 2, y: 4 }], order: ['test_knight'], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    let u = Gu();
    const k = hero('test_knight');
    t.ok(DD.Combat.current() === k, 'the knight acts first');
    t.eq(n(u), 1, 'combat start: 1 acorn');
    t.ok(st(u, 'gus_cheeks').stacks === 1 && st(u, 'gus_cheeks').data.cap === 3, 'the chip says 1 / 3');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && n(u) === 2, 'his turn start: one more falls in (2)');
    Gs().setCheeks(u, 3);
    let bonks = [];
    toHisTurn(u);
    bonks = logged(/bonks/, function () { Gs().drop(u); });
    t.ok(n(u) === 3 && bonks.length === 1 && /An acorn bonks Phat Gus on the head\. His cheeks are full, so it rolls away\./.test(bonks[0]), 'full cheeks: BONK, the count stays 3, the log line');
    // stunned, asleep, a sheep: the acorn still falls (onTurnStart fires for them)
    [['stun', 'stunned'], ['sleep', 'asleep'], ['sheep', 'a sheep']].forEach(function (c) {
      fight({ heroes: [{ id: 'test_knight', x: 0, y: 0 }, { x: 2, y: 4 }], order: ['test_knight'], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
      u = Gu();
      A().addStatus(u, c[0], { turns: 1 }, foes()[0]);
      DD.Combat.endTurn();
      t.eq(n(u), 2, c[1] + ' at his turn start: the acorn still falls (2)');
    });
    // Cheeks of Holding: start 2, hold 4
    fight({ heroes: [{ id: 'test_knight', x: 0, y: 0 }, { x: 2, y: 4, items: ['gus_cheeks_of_holding'] }], order: ['test_knight'], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    u = Gu();
    t.ok(n(u) === 2 && Gs().capOf(u) === 4 && st(u, 'gus_cheeks').data.cap === 4, 'Cheeks of Holding: starts with 2, the chip says / 4');
    Gs().setCheeks(u, 9);
    t.eq(n(u), 4, 'setCheeks clamps to the cap (4)');
    t.ok(logged(/bonks/, function () { Gs().drop(u); }).length === 1 && n(u) === 4, 'at 4 of 4 the next one bonks');
    t.eq(DD.Gus.passiveDesc(u), 'An acorn falls into Phat Gus\'s cheeks at the start of each of his turns (they hold 4; he starts with 2). Stress eating: once per turn, ' +
      'if a foe is next to him after he eats, he heals 3 HP.', 'the live passive text with the trinket');
    // downed: the engine clears his cheeks; no drop while down; revived: 0 until his next turn start
    fight({ heroes: [{ id: 'test_knight', x: 0, y: 0 }, { x: 2, y: 4 }], order: ['test_knight'], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = Gu();
    Gs().setCheeks(u, 3);
    A().damage(foes()[0], u, 200, { cause: 'other' });
    t.ok(u.downed && n(u) === 0 && !st(u, 'gus_cheeks'), 'downed: he dropped his acorns (no chip)');
    DD.Combat.endTurn();
    t.ok(u.downed && n(u) === 0, 'no drop while he is down');
    A().revive(u, 0.5);
    t.ok(!u.downed && n(u) === 0, 'revived: 0 acorns');
    toHisTurn(u);
    t.eq(n(u), 1, 'his next turn start: 1');
    // the chip is the count; absent at 0
    Gs().setCheeks(u, 0);
    t.ok(!st(u, 'gus_cheeks'), 'no chip at 0');
    Gs().setCheeks(u, 2);
    t.ok(st(u, 'gus_cheeks').stacks === 2 && n(u) === 2, 'the chip equals the count');
  });

  // ---- 3. eating ---------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: eating — each eater spends its acorns when paid (crates too), echoes eat nothing, previews and dry runs pay on the copy, the pockets never change, a dispel confiscates', function (t) {
    if (!ready(t)) return;
    const CASES = [
      { id: 'gus_root_canal', x: 3, y: 4, eat: 1 }, { id: 'gus_whispers', self: true, eat: 1 }, { id: 'gus_hollow', x: 3, y: 4, eat: 2 },
      { id: 'gus_binge', self: true, eat: 3 }, { id: 'gus_hole', x: 2, y: 7, eat: 1 }, { id: 'gus_eyes', x: 3, y: 4, eat: 1 },
    ];
    CASES.forEach(function (c) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
      const u = Gu();
      const sl = give(u, c.id, 1);
      Gs().setCheeks(u, 3);
      const pay = payments(function () { use(t, u, sl, c.self ? u.x : c.x, c.self ? u.y : c.y, c.id); });
      t.ok(n(u) === 3 - c.eat && pay.length === 1 && pay[0].ate === c.eat, c.id + ': eats exactly ' + c.eat + ' (3 → ' + n(u) + ')');
    });
    // spent without eating, gained, untouched
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    let u = Gu();
    Gs().setCheeks(u, 2);
    let pay = payments(function () { use(t, u, give(u, 'gus_have_one', 1), 2, 5, 'Fine, Have One'); });
    t.ok(n(u) === 1 && pay[0].ate === 0, 'Fine, Have One spends one without eating it (gusAte 0)');
    u.ap = 3;
    pay = payments(function () { use(t, u, give(u, 'gus_tree', 1), 3, 4, 'The Tree'); });
    t.ok(n(u) === 2 && !pay[0].ate, 'The Tree That Isn\'t There: +1, eats nothing');
    u.ap = 3;
    use(t, u, u.basic, 3, 4, 'Incisor');
    t.eq(n(u), 2, 'Incisor Decision eats nothing');
    // the refusals, word for word
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    u = Gu();
    const why = function (id, k) { Gs().setCheeks(u, k); u.ap = 3; return DD.Combat.canUse(u, give(u, id, 1)); };
    t.eq(why('gus_root_canal', 0), 'Needs 1 acorn (his cheeks hold 0).', 'Root Canal at 0');
    t.eq(why('gus_hollow', 1), 'Needs 2 acorns (his cheeks hold 1).', 'The Hollow Hungers at 1');
    t.eq(why('gus_binge', 0), 'Nothing to eat: his cheeks are empty.', 'All You Can Eat at 0');
    t.eq(why('gus_binge', 2), 'Nobody close enough to watch.', 'All You Can Eat with nobody in reach');
    t.eq(why('gus_have_one', 0), 'Needs an acorn to share (his cheeks hold 0).', 'Fine, Have One at 0');
    t.eq(why('gus_hangry', 1), 'Not hangry yet: his cheeks aren\'t empty.', 'Hangry with an acorn');
    t.ok(why('gus_whispers', 1) === true && why('gus_hollow', 2) === true && why('gus_hangry', 0) === true, 'enough: usable');
    // aimed at a crate it still eats (it was paid); a barrel too
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 5, y: 4, id: 'crate' }, { x: 2, y: 1, id: 'barrel_explosive' }] });
    u = Gu();
    let sl = give(u, 'gus_root_canal', 1);
    Gs().setCheeks(u, 3);
    t.ok(DD.Targeting.validTargets(u, sl).some(function (p) { return p.x === 5 && p.y === 4 && p.obj; }), 'Root Canal can be aimed at the crate (D1)');
    const crate0 = DD.Grid.tile(5, 4).obj.hp;
    use(t, u, sl, 5, 4, 'Root Canal at the crate');
    const cr = DD.Grid.tile(5, 4).obj;
    t.ok(n(u) === 2 && (!cr || cr.hp === crate0 - 5), 'the crate takes 5 and he still ate (3 → 2)');
    u.ap = 3; sl.cd = 0;
    use(t, u, sl, 2, 1, 'Root Canal at the barrel');
    t.ok(n(u) === 1 && !(DD.Grid.tile(2, 1).obj && DD.Grid.tile(2, 1).obj.id === 'barrel_explosive'), 'the barrel goes off and he ate (2 → 1)');
    // an Echo Chamber echo (resolveSkill unpaid with rpEcho) eats nothing; All You Can Eat's echo repeats the meal
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    u = Gu();
    const g = foes()[0];
    sl = give(u, 'gus_root_canal', 1);
    Gs().setCheeks(u, 2);
    let h0 = g.hp;
    DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, { x: 3, y: 4 }, { extra: { rpEcho: true } }); });
    t.ok(n(u) === 2 && h0 - g.hp === 5, 'a Root Canal echo hits (5) and eats nothing');
    sl = give(u, 'gus_binge', 1);
    u.ap = 3;
    h0 = g.hp;
    use(t, u, sl, u.x, u.y, 'All You Can Eat (2 acorns)');
    t.ok(n(u) === 0 && h0 - g.hp === 6 && Gs().mealOf(u, 'gus_binge') === 2, 'the binge: 2 acorns, 6 to the adjacent grunt');
    h0 = g.hp;
    let calls = healCalls(function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, { x: u.x, y: u.y }, { extra: { rpEcho: true } }); }); });
    t.ok(h0 - g.hp === 6 && n(u) === 0 && lifts(calls).length === 0, 'its echo repeats the meal (6), eats nothing, never stress-eats');
    // previews and AutoPlay-style dry runs pay on the copy: they show the spend and the heal, the real count never moves
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    u = Gu();
    u.hp = 10;
    sl = give(u, 'gus_root_canal', 1);
    Gs().setCheeks(u, 1);
    const pv = DD.Combat.preview(u, sl, 3, 4);
    const me = pv.perUnit[u.id] || {};
    t.ok(me.heal === 3 && (me.removed || []).indexOf('gus_cheeks') >= 0, 'the preview shows the last acorn going and the stress heal (+3)');
    t.ok(n(u) === 1 && u.hp === 10, 'the real count and HP never moved');
    const dry = DD.Targeting.simulate(function () {
      const su = DD.Combat.byId(u.id);
      DD.Combat.resolveSkill(su, su.skills[0], { x: 3, y: 4 }, { pay: true });
      return { left: Gs().cheeks(su), hp: su.hp };
    });
    t.ok(dry && dry.left === 0 && dry.hp === 13 && n(u) === 1 && u.hp === 10, 'a dry run (pay: true) eats on the copy only');
    // the party's pockets never change through a fight of eating (the run's Bucket of Ice Water is safe)
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 8 }, { id: 'test_grunt', x: 4, y: 3, hpMult: 8 }],
      consumables: ['con_ice_bucket', 'con_ice_bucket'] });
    u = Gu();
    const pockets0 = JSON.stringify(DD.Combat.consumables());
    t.ok(DD.Combat.consumables().length === 2, 'two buckets in the pockets');
    for (let r = 0; r < 3; r++) {
      EATERS.concat(['gus_have_one', 'gus_tree']).forEach(function (id) {
        Gs().setCheeks(u, 3);
        u.ap = 3;
        const s2 = give(u, id, 1);
        const tg = DD.Targeting.validTargets(u, s2)[0];
        if (tg && DD.Combat.canUse(u, s2) === true) DD.Combat.useSkill(u, s2, tg.x, tg.y);
      });
      toHisTurn(u);
    }
    t.eq(JSON.stringify(DD.Combat.consumables()), pockets0, 'three turns of every eater: the pockets are untouched');
    // a dispel of his buffs confiscates the acorns (FX + bark) and nothing else
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    u = Gu();
    Gs().setCheeks(u, 3);
    const hp0 = u.hp;
    let said = [];
    const keys = barkKeys(u, function () { said = texts(function () { A().cleanse(u, 'buff'); }); });
    t.ok(n(u) === 0 && !st(u, 'gus_cheeks') && said.indexOf('Acorns confiscated!') >= 0 && keys.indexOf('confiscated') >= 0 && u.hp === hp0,
      'a dispel takes the acorns: "Acorns confiscated!", the bark, nothing else');
    Gs().setCheeks(u, 1);
    said = texts(function () { Gs().setCheeks(u, 0); });
    t.ok(said.indexOf('Acorns confiscated!') < 0, 'eating the last one is not a confiscation');
  });

  // ---- 4. stress eating ---------------------------------------------------------------------------------------------------
  T.suite('hero_gus: stress eating (Nov 18) — his one conditional heal, after he eats with a foe next to him, once a turn; the D9 guard', function (t) {
    if (!ready(t)) return;
    t.eq(Gs().STRESS_HEAL, 3, 'STRESS_HEAL 3');
    // fires: Root Canal on the grunt next to him → +3 through one labelled call, src and target him
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    let u = Gu();
    u.hp = 10;
    let sl = give(u, 'gus_root_canal', 1);
    Gs().setCheeks(u, 3);
    let calls = healCalls(function () { use(t, u, sl, 3, 4, 'Root Canal next to a grunt'); });
    let l = lifts(calls);
    t.ok(u.hp === 13 && l.length === 1 && l[0].src === u && l[0].target === u && l[0].n === 3, 'one DD.Act.heal(Gus, Gus, 3, { via: \'lift:gus\' }): 10 → 13');
    t.ok(calls.filter(function (x) { return !x.sim; }).length === 1, 'and no other heal');
    // once per turn: a second eat this turn heals nothing; next turn it does again
    u.ap = 3; sl.cd = 0;
    calls = healCalls(function () { use(t, u, sl, 3, 4, 'Root Canal again'); });
    t.ok(lifts(calls).length === 0 && u.hp === 13, 'once per turn: the second eat heals nothing');
    toHisTurn(u);
    sl.cd = 0;
    calls = healCalls(function () { use(t, u, sl, 3, 4, 'Root Canal next turn'); });
    t.ok(lifts(calls).length === 1 && u.hp === 16, 'his next turn: +3 again (16)');
    // two acorns at once (The Hollow Hungers): one heal; the Winter Coat makes it 5
    [[[], 3], [['gus_winter_coat'], 5]].forEach(function (c) {
      fight({ heroes: [{ x: 2, y: 4, items: c[0] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
      const v = Gu();
      v.hp = 10;
      Gs().setCheeks(v, 3);
      t.eq(Gs().stressOf(v), c[1], (c[0].length ? 'with' : 'without') + ' the Winter Coat: stressOf = ' + c[1]);
      const cl = healCalls(function () { use(t, v, give(v, 'gus_hollow', 1), 3, 4, 'The Hollow Hungers'); });
      t.ok(lifts(cl).length === 1 && lifts(cl)[0].n === c[1] && v.hp === 10 + c[1], '2 acorns at once: one heal of ' + c[1]);
    });
    // no foe next to him: nothing
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 5 }] });
    u = Gu();
    u.hp = 10;
    Gs().setCheeks(u, 3);
    calls = healCalls(function () { use(t, u, give(u, 'gus_root_canal', 1), 5, 4, 'Root Canal at range'); });
    t.ok(lifts(calls).length === 0 && u.hp === 10, 'no foe next to him: no heal');
    // review:phat-gus — "next to him" is distance 1: a foe on the diagonal (distance 2) is not in his face
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 5, hpMult: 5 }, { id: 'test_grunt', x: 2, y: 6, hpMult: 5 }] });
    u = Gu();
    u.hp = 10;
    Gs().setCheeks(u, 3);
    calls = healCalls(function () { use(t, u, give(u, 'gus_root_canal', 1), 3, 5, 'Root Canal at a diagonal foe'); });
    t.ok(lifts(calls).length === 0 && u.hp === 10, 'foes on the diagonal and two tiles away are not next to him: no heal');
    // a charmed foe is on loan (no heal); an enemy-side minion counts
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 5, y: 5, hpMult: 5 }] });
    u = Gu();
    u.hp = 10;
    Gs().setCheeks(u, 3);
    A().addStatus(at(3, 4), 'charmed', { turns: 1 }, u);
    calls = healCalls(function () { use(t, u, give(u, 'gus_root_canal', 1), 5, 5, 'Root Canal, a charmed grunt next to him'); });
    t.ok(lifts(calls).length === 0 && u.hp === 10, 'a charmed foe next to him does not count');
    const minion = A().spawn('test_minion', 2, 5, { owner: foes()[1] });
    t.ok(!!minion, 'an enemy minion appears next to him');
    u.ap = 3;
    calls = healCalls(function () { use(t, u, give(u, 'gus_whispers', 1), u.x, u.y, 'Don\'t Listen with a minion next to him'); });
    t.ok(!minion || (lifts(calls).length === 1 && u.hp === 13), 'an enemy minion next to him counts (+3)');
    // Down the Squirrel Hole: into a crowd heals, out of one doesn't (not Kiri's heal)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 4, y: 6, hpMult: 5 }] });
    u = Gu();
    u.hp = 10;
    Gs().setCheeks(u, 3);
    calls = healCalls(function () { use(t, u, give(u, 'gus_hole', 1), 1, 7, 'the Hole out of melee'); });
    t.ok(lifts(calls).length === 0 && u.hp === 10, 'tunnelling OUT of melee heals nothing');
    toHisTurn(u);
    const s2 = give(u, 'gus_hole', 1);
    calls = healCalls(function () { use(t, u, s2, 4, 7, 'the Hole into a crowd'); });
    t.ok(lifts(calls).length === 1 && u.hp === 13, 'tunnelling next to a foe heals (+3)');
    // a skill that kills the only adjacent foe: the danger is gone, no heal; not Betty: no heal on a kill or a death
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 7, y: 7 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 6, y: 7 }] });
    u = Gu();
    u.hp = 10;
    at(3, 4).hp = 3;
    Gs().setCheeks(u, 3);
    calls = healCalls(function () { use(t, u, give(u, 'gus_root_canal', 1), 3, 4, 'Root Canal kills the only foe next to him'); });
    t.ok(lifts(calls).length === 0 && u.hp === 10, 'the kill took the danger away: no heal');
    // [QA gus-crate-stress-heal] an eater aimed at a crate still eats (the cost) but nothing rides on an object hit (DESIGN
    // D4, the tooltip's "and nothing else"): no stress eating, even with a foe next to him; the preview agrees; and the
    // turn's stress eating stays unused, so his next eat at a foe this turn heals
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 3, hpMult: 5 }], objects: [{ x: 5, y: 4, id: 'crate' }] });
    u = Gu();
    u.hp = 10;
    Gs().setCheeks(u, 3);
    let rc = give(u, 'gus_root_canal', 1);
    const cpv = DD.Combat.preview(u, rc, 5, 4);
    t.ok(!!cpv && !((cpv.perUnit[u.id] || {}).heal > 0), 'the crate preview shows no heal for him (no "💚 you heal")');
    calls = healCalls(function () { use(t, u, rc, 5, 4, 'Root Canal at a crate, a grunt next to him'); });
    t.ok(lifts(calls).length === 0 && u.hp === 10 && n(u) === 2, 'a crate with a foe next to him: still eats (3 → 2), no heal');
    u.ap = 3; rc.cd = 0;
    calls = healCalls(function () { use(t, u, rc, 2, 3, 'Root Canal at the grunt next to him, same turn'); });
    t.ok(lifts(calls).length === 1 && u.hp === 13, 'the crate did not use up the turn\'s stress eating: the next eat at a foe heals 3');
    // [QA gus-stress-spent-at-full-hp; fix:polish, Nov 21] the code follows the addendum's text, "once per turn, if a foe
    // is next to him after he eats, he heals 3 HP": the once a turn is the heal itself. A meal at full HP makes the 0-HP
    // call (no threshold) and leaves the turn's stress eating unused; a later meal that turn, once he is hurt, heals 3;
    // after that heal a third meal heals nothing; next turn it works again.
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    u = Gu();
    Gs().setCheeks(u, 3);
    rc = give(u, 'gus_root_canal', 1);
    t.eq(u.hp, u.maxHp, 'full HP');
    calls = healCalls(function () { use(t, u, rc, 3, 4, 'Root Canal at full HP'); });
    t.ok(lifts(calls).length === 1 && lifts(calls)[0].healed === 0 && lifts(calls)[0].n === 3, 'a meal at full HP with a foe next to him: one 0-HP lift:gus call of 3');
    t.ok(Gs().stressQuick({ user: u, skill: DD.getSkill('gus_root_canal'), target: { x: 3, y: 4 } }) === 0, 'AutoPlay\'s quick price at full HP: 0');
    u.hp -= 6;
    t.ok(Gs().stressQuick({ user: u, skill: DD.getSkill('gus_root_canal'), target: { x: 3, y: 4 } }) > 0, 'hurt: the quick price sees the heal still to come this turn');
    u.ap = 3; rc.cd = 0;
    let hpv = DD.Combat.preview(u, rc, 3, 4);
    t.eq((hpv && hpv.perUnit[u.id] || {}).heal || 0, 3, 'the preview of the second meal shows "you heal 3"');
    calls = healCalls(function () { use(t, u, rc, 3, 4, 'Root Canal again, hurt'); });
    t.ok(lifts(calls).length === 1 && lifts(calls)[0].healed === 3 && u.hp === u.maxHp - 3, 'the second meal that turn, hurt: +3 (the turn\'s one heal)');
    u.hp -= 4;
    u.ap = 3; rc.cd = 0;
    hpv = DD.Combat.preview(u, rc, 3, 4);
    t.ok(!((hpv && hpv.perUnit[u.id] || {}).heal > 0), 'after the heal, the preview of a third meal shows no heal');
    calls = healCalls(function () { use(t, u, rc, 3, 4, 'Root Canal a third time'); });
    t.ok(lifts(calls).length === 0 && u.hp === u.maxHp - 7, 'a third meal that turn heals nothing: once per turn');
    toHisTurn(u);
    rc.cd = 0;
    calls = healCalls(function () { use(t, u, rc, 3, 4, 'Root Canal next turn'); });
    t.ok(lifts(calls).length === 1 && lifts(calls)[0].healed === 3, 'his next turn: +3 again');
    // at 29 of 30 the heal restores 1 and is the turn's heal (no threshold: the same call, capped at his max HP)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    u = Gu();
    Gs().setCheeks(u, 3);
    rc = give(u, 'gus_root_canal', 1);
    u.hp = u.maxHp - 1;
    calls = healCalls(function () { use(t, u, rc, 3, 4, 'Root Canal 1 HP down'); });
    t.ok(lifts(calls).length === 1 && lifts(calls)[0].healed === 1 && u.hp === u.maxHp, '1 HP down: +1, the cap');
    u.hp -= 6;
    u.ap = 3; rc.cd = 0;
    calls = healCalls(function () { use(t, u, rc, 3, 4, 'Root Canal again'); });
    t.ok(lifts(calls).length === 0 && u.hp === u.maxHp - 6, 'that +1 was the turn\'s heal: the next meal heals nothing');
    const pdesc = DD.getHero(HERO).passive.desc;
    t.ok(/Stress eating: once per turn, if a foe is next to him after he eats, he heals 3 HP\.$/.test(pdesc), 'the passive says "once per turn, if a foe is next to him after he eats" (the addendum)');
    t.ok(!/first time/.test(pdesc) && DD.defs.narration.tips.some(function (l) { return /^Phat Gus heals when he eats with a foe next to him, once a turn\./.test(l); }),
      'no "first time" left; the tip says "once a turn"');
    // the actions that never heal: Fine, Have One, the signature's refill, the drop, The Tree, Hangry, the basic, a kill
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 8 }, { id: 'test_grunt', x: 1, y: 4 }] });
    u = Gu();
    u.hp = 10;
    calls = healCalls(function () {
      at(1, 4).hp = 2;
      use(t, u, u.basic, 1, 4, 'Incisor kills a grunt next to him');
      Gs().setCheeks(u, 2);
      u.ap = 3;
      use(t, u, give(u, 'gus_have_one', 1), 2, 5, 'Fine, Have One');
      u.ap = 3;
      use(t, u, give(u, 'gus_tree', 1), 3, 4, 'The Tree');
      Gs().setCheeks(u, 0);
      u.ap = 3;
      use(t, u, give(u, 'gus_hangry', 1), u.x, u.y, 'Hangry');
      u.ap = 3;
      use(t, u, give(u, 'gus_acorn'), 3, 4, 'the signature');
      Gs().setCheeks(u, 1);
      Gs().drop(u);
    });
    t.ok(calls.filter(function (x) { return !x.sim; }).length === 0 && u.hp === 10, 'Fine, Have One, The Tree, Hangry, the signature\'s refill, a kill and the drop never heal');
    // never while downed; never another unit; the same rule at 1 HP and at 29 (no threshold); at full HP one 0-HP call
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    u = Gu();
    const k = hero('test_knight');
    k.hp = 5;
    [[1, 4], [29, 30], [30, 30]].forEach(function (c, i) {
      if (i) toHisTurn(u);
      u.hp = c[0];
      Gs().setCheeks(u, 3);
      const s3 = give(u, 'gus_root_canal', 1);
      const cl = healCalls(function () { use(t, u, s3, 3, 4, 'Root Canal at ' + c[0] + ' HP'); });
      const lf = lifts(cl);
      t.ok(lf.length === 1 && lf[0].n === 3 && u.hp === c[1] && lf[0].target === u, 'at ' + c[0] + ' HP: one call of 3 → ' + u.hp + ' (no threshold)');
    });
    t.eq(k.hp, 5, 'the knight next to him is never healed');
    A().damage(at(3, 4), u, 200, { cause: 'other' });
    t.ok(u.downed && Gs().stressEat(u) === 0, 'downed: stressEat does nothing');
    // combat start: an acorn, no HP, no Block (no shield)
    fight({ heroes: [{ x: 2, y: 4, hp: 17 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = Gu();
    t.ok(u.hp === 17 && (u.block || 0) === 0 && n(u) === 2, 'combat start and his first turn: 17 HP, 0 Block, 2 acorns (HP- and Block-neutral)');
    // no button: with no foe next to him, no skill of his changes his HP
    fight({ heroes: [{ x: 1, y: 1 }, { id: 'test_knight', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6, hpMult: 5 }] });
    u = Gu();
    const bad = [];
    ALL.forEach(function (id) {
      Gs().setCheeks(u, id === 'gus_hangry' ? 0 : 3);
      u.hp = 12; u.ap = 3;
      DD.Combat.state.hype = 100;
      const s4 = give(u, id, 1);
      if (DD.Combat.canUse(u, s4) !== true) return;
      const tg = DD.Targeting.validTargets(u, s4)[0];
      if (!tg) return;
      DD.Combat.useSkill(u, s4, tg.x, tg.y);
      if (u.hp !== 12) bad.push(id + ' → ' + u.hp);
    });
    t.eq(bad.join(', '), '', 'no skill heals by itself (HP unchanged by every use with no foe next to him)');
  });

  // ---- 5. the basic ------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: Incisor Decision — 5, 7 against a Confused foe; crates and barrels; attacks of opportunity read 7 through o.flat, never 9', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 2, y: 3, hpMult: 5 }] });
    const u = Gu(), g = at(3, 4), c = at(2, 3);
    t.eq(desc('gus_incisor', 1), 'Deal 5 damage to an adjacent foe (7 if it is Confused).', 'desc');
    let h0 = g.hp;
    use(t, u, u.basic, 3, 4, 'Incisor');
    t.eq(h0 - g.hp, 5, '5 to a grunt');
    A().addStatus(c, 'confused', { turns: 1 }, u);
    h0 = c.hp;
    const said = texts(function () { use(t, u, u.basic, 2, 3, 'Incisor on a Confused grunt'); });
    t.ok(h0 - c.hp === 7 && said.indexOf('Snack-ident!') >= 0, '7 to a Confused grunt (Snack-ident!)');
    // crates take 5 (never the Confused bonus); a barrel detonates
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 3, y: 4, id: 'crate' }, { x: 2, y: 5, id: 'barrel_explosive' }] });
    const v = Gu();
    const cr0 = DD.Grid.tile(3, 4).obj.hp;
    use(t, v, v.basic, 3, 4, 'Incisor on a crate');
    const crate = DD.Grid.tile(3, 4).obj;
    t.ok(!crate || cr0 - crate.hp === 5, 'a crate takes 5');
    v.ap = 3;
    use(t, v, v.basic, 2, 5, 'Incisor on a barrel');
    t.ok(!(DD.Grid.tile(2, 5).obj && DD.Grid.tile(2, 5).obj.id === 'barrel_explosive'), 'a barrel detonates');
    // attacks of opportunity: a walker takes 5; a Confused walker 7; the AI's estimate reads the same
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 2, y: 3, hpMult: 5 }] });
    const w = Gu(), g1 = at(3, 4), g2 = at(2, 3);
    t.eq(DD.AI.opportunityDmg(w, g1, { x: 3, y: 4 }), 5, 'the AI expects 5 for leaving him');
    h0 = g1.hp;
    A().moveAlong(g1, [{ x: 4, y: 4 }, { x: 5, y: 4 }], { provoke: true });
    t.eq(h0 - g1.hp, 5, 'he bites a walker for 5');
    w.oppRound = null;   // one attack of opportunity a round: give him this round's back for the next walker
    A().addStatus(g2, 'confused', { turns: 1 }, w);
    const o = A().opportunityOf(w, g2, { x: 2, y: 3 });
    t.ok(!!o && o.flat === 2, 'a Confused walker: modifyOpportunity adds +2 (o.flat)');
    t.eq(DD.AI.opportunityDmg(w, g2, { x: 2, y: 3 }), 7, 'the AI expects 7, never 9');
    h0 = g2.hp;
    A().moveAlong(g2, [{ x: 2, y: 2 }, { x: 2, y: 1 }], { provoke: true });
    t.eq(h0 - g2.hp, 7, 'a Confused walker takes 7 (execute skips its own +2 on an attack of opportunity)');
    t.eq(n(w), 2, 'his attacks of opportunity eat nothing');
  });

  // ---- 6. Don't Listen to the Trees -------------------------------------------------------------------------------------------
  T.suite('hero_gus: Don\'t Listen to the Trees at every level — psychic, Confused for exactly the foe\'s next turn, Silence, cd 2, Hype', function (t) {
    if (!ready(t)) return;
    [[1, 2, 4], [2, 2, 5], [3, 3, 6]].forEach(function (c) {
      fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 4, y: 4 + c[1], hpMult: 5 }, { id: 'test_grunt', x: 4 - c[1] - 1, y: 4, hpMult: 5 }] });
      const u = Gu(), a = at(5, 4), b = at(4, 4 + c[1]), far = at(4 - c[1] - 1, 4);
      const sl = give(u, 'gus_whispers', c[0]);
      t.eq(desc('gus_whispers', c[0]), 'Eat an acorn: the trees whisper to every foe within ' + c[1] + ' of you: ' + c[2] + ' psychic damage, and each is Confused for 1 turn.', 'L' + c[0] + ' desc');
      const a0 = a.hp, b0 = b.hp, f0 = far.hp;
      const hy = hypeGains(function () { use(t, u, sl, u.x, u.y, 'Don\'t Listen L' + c[0]); });
      t.ok(a0 - a.hp === c[2] && b0 - b.hp === c[2] && far.hp === f0, 'L' + c[0] + ': ' + c[2] + ' to each foe within ' + c[1] + ', the one at ' + (c[1] + 1) + ' untouched');
      t.ok(has(a, 'confused') && has(b, 'confused') && !has(far, 'confused'), 'L' + c[0] + ': both Confused');
      t.ok(hy.some(function (x) { return x.why === 'multi-hit' && x.n > 0; }), 'L' + c[0] + ': Hype for hitting 2+ foes');
      t.eq(sl.cd, 2, 'L' + c[0] + ': cooldown 2');
    });
    // Confused covers exactly its next turn
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 5 }] });
    let u = Gu();
    const g = at(5, 4);
    use(t, u, give(u, 'gus_whispers', 1), 4, 4, 'Don\'t Listen');
    const seen = [];
    A().addRule({ id: 'gus_probe_conf', name: 'probe', silent: true, hooks: { onTurnStart: function (x) { if (x === g) seen.push(has(g, 'confused')); } } });
    try { DD.Combat.endTurn(); } finally { A().removeRule('gus_probe_conf'); }
    t.ok(seen[0] === true && !has(g, 'confused'), 'Confused during the grunt\'s next turn, gone after it');
    // Confused foes make no attacks of opportunity
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 5 }] });
    u = Gu();
    t.ok(!!A().opportunityOf(at(5, 4), u, { x: 4, y: 4 }), 'a grunt next to him would strike him for walking off');
    use(t, u, give(u, 'gus_whispers', 1), 4, 4, 'Don\'t Listen');
    t.eq(A().opportunityOf(at(5, 4), u, { x: 4, y: 4 }), null, 'Confused: it makes no attack of opportunity');
    // a Confused foe's wind-up turns (the engine's quarter turn)
    fight({ heroes: [{ x: 5, y: 4 }, { id: 'test_knight', x: 5, y: 1 }], enemies: [{ id: 'test_boss', x: 6, y: 4 }] });
    u = Gu();
    const boss = foes()[0];
    const wu = DD.AI.windUp(boss, 'test_boss_meteor', { x: 5, y: 1 });
    if (wu) {
      const before = JSON.stringify(DD.AI.intentTiles(boss, wu));
      use(t, u, give(u, 'gus_whispers', 1), u.x, u.y, 'Don\'t Listen on a winding boss');
      const after = JSON.stringify(DD.AI.intentTiles(boss, wu));
      t.ok(has(boss, 'confused') && before !== after, 'the boss\'s marked tiles turn to show where it will land');
    } else t.log('no wind-up made in the sandbox: the turning check is skipped');
    // Silence refuses it
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    u = Gu();
    const sl = give(u, 'gus_whispers', 1);
    A().addStatus(u, 'silenced', { turns: 1 }, foes()[0]);
    t.eq(DD.Combat.canUse(u, sl), 'Silenced!', 'a spell: Silence blocks it');
  });

  // ---- 7. Root Canal ----------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: Root Canal at every level — through a wall, Weakened, cd 1, the range a +range item gives', function (t) {
    if (!ready(t)) return;
    [[1, 4, 5, 1], [2, 5, 6, 1], [3, 5, 8, 2]].forEach(function (c) {
      // a wall between them: the roots need no sight
      fight({ heroes: [{ x: 1, y: 4, level: 5 }], enemies: [{ id: 'test_grunt', x: 1 + c[1], y: 4, hpMult: 5 }, { id: 'test_grunt', x: 2 + c[1], y: 4, hpMult: 5 }],
        terrain: function (tl) { if (tl.x === 2 && tl.y >= 2 && tl.y <= 6) tl.t = 'wall'; } });
      const u = Gu(), g = at(1 + c[1], 4), far = at(2 + c[1], 4);
      const sl = give(u, 'gus_root_canal', c[0]);
      Gs().setCheeks(u, 3);
      t.ok(!DD.Grid.los(u, g), 'L' + c[0] + ': no sight to the grunt');
      t.ok(DD.Targeting.isValidTarget(u, sl, g.x, g.y) && !DD.Targeting.isValidTarget(u, sl, far.x, far.y), 'L' + c[0] + ': in reach at ' + c[1] + ', not at ' + (c[1] + 1));
      const h0 = g.hp;
      use(t, u, sl, g.x, g.y, 'Root Canal L' + c[0]);
      const w = st(g, 'weak');
      t.ok(h0 - g.hp === c[2] && !!w && w.turns === c[3], 'L' + c[0] + ': ' + c[2] + ' damage and Weakened for ' + c[3]);
      t.eq(sl.cd, 1, 'L' + c[0] + ': cooldown 1');
    });
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    const u = Gu();
    t.ok(/within 4 /.test(desc('gus_root_canal', 1, u)), 'desc: within 4');
    u.rangeBonus = 1;
    t.ok(/within 5 /.test(desc('gus_root_canal', 1, u)) && /within 6 /.test(desc('gus_root_canal', 3, u)), 'with +1 range: within 5 (6 at III)');
    u.rangeBonus = 0;
  });

  // ---- 8. The Hollow Hungers ----------------------------------------------------------------------------------------------------
  T.suite('hero_gus: The Hollow Hungers — eats 2, refused with 1, 12 / 15 / 18 and Rooted, range 3 with sight, cd 2', function (t) {
    if (!ready(t)) return;
    [[1, 12], [2, 15], [3, 18]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 5 }] });
      const u = Gu(), g = at(4, 4);
      const sl = give(u, 'gus_hollow', c[0]);
      Gs().setCheeks(u, 2);
      t.ok(DD.Targeting.isValidTarget(u, sl, 4, 4) && !DD.Targeting.isValidTarget(u, sl, 5, 4), 'L' + c[0] + ': range 3');
      const h0 = g.hp;
      use(t, u, sl, 4, 4, 'Hollow L' + c[0]);
      const r = st(g, 'root');
      t.ok(h0 - g.hp === c[1] && !!r && r.turns === 1 && n(u) === 0, 'L' + c[0] + ': ' + c[1] + ' and Rooted for 1 turn; 2 acorns eaten');
      t.eq(sl.cd, 2, 'L' + c[0] + ': cooldown 2');
    });
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'wall'; } });
    const u = Gu();
    const sl = give(u, 'gus_hollow', 1);
    Gs().setCheeks(u, 2);
    t.ok(!DD.Targeting.isValidTarget(u, sl, 3, 4), 'it needs sight (a wall in the way)');
    Gs().setCheeks(u, 1);
    t.eq(DD.Combat.canUse(u, sl), 'Needs 2 acorns (his cheeks hold 1).', 'refused with 1 acorn');
  });

  // ---- 9. All You Can Eat ---------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: All You Can Eat — eats all, 3 / 4 / 4 per acorn, radius 1 / 1 / 2, the live desc, echoes, previews at 1-4 acorns', function (t) {
    if (!ready(t)) return;
    [[1, 3, 1], [2, 4, 1], [3, 4, 2]].forEach(function (c) {
      [1, 2, 3].forEach(function (k) {
        fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 4, y: 4 + c[2], hpMult: 5 }, { id: 'test_grunt', x: 4, y: 4 - c[2] - 1, hpMult: 5 }] });
        const u = Gu(), a = at(5, 4), b = at(4, 4 + c[2]), far = at(4, 4 - c[2] - 1);
        const sl = give(u, 'gus_binge', c[0]);
        Gs().setCheeks(u, k);
        t.ok(DD.skillDesc(DD.getSkill('gus_binge'), c[0], u).indexOf('(now: ' + k + ' acorn' + (k === 1 ? '' : 's') + ', ' + k * c[1] + ' each)') > 0, 'L' + c[0] + ' at ' + k + ': the live suffix');
        const a0 = a.hp, b0 = b.hp, f0 = far.hp;
        use(t, u, sl, u.x, u.y, 'binge L' + c[0] + ' at ' + k);
        t.ok(a0 - a.hp === k * c[1] && b0 - b.hp === k * c[1] && far.hp === f0 && n(u) === 0, 'L' + c[0] + ', ' + k + ' acorns: ' + k * c[1] + ' to each foe within ' + c[2] + ' (and all eaten)');
        t.eq(sl.cd, 2, 'cooldown 2');
      });
    });
    t.eq(desc('gus_binge', 1), 'Eat every acorn in your cheeks (at least 1): each foe next to you takes 3 psychic damage per acorn eaten.', 'L1 desc (no fight: no suffix)');
    t.eq(desc('gus_binge', 3), 'Eat every acorn in your cheeks (at least 1): each foe within 2 of you takes 4 psychic damage per acorn eaten.', 'L3 desc');
    // previews exact at 1-4 acorns (4 with Cheeks of Holding)
    [1, 2, 3, 4].forEach(function (k) {
      fight({ heroes: [{ x: 4, y: 4, items: k === 4 ? ['gus_cheeks_of_holding'] : [] }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
      const u = Gu();
      const sl = give(u, 'gus_binge', 1);
      Gs().setCheeks(u, k);
      const pv = DD.Combat.preview(u, sl, u.x, u.y);
      t.ok((pv.perUnit[at(5, 4).id] || {}).dmg === 3 * k, k + ' acorns: the preview shows ' + 3 * k);
      previewMatches(t, u, sl, u.x, u.y, 'binge at ' + k);
    });
  });

  // ---- 10. Down the Squirrel Hole ----------------------------------------------------------------------------------------------------
  T.suite('hero_gus: Down the Squirrel Hole — range 4 / 5 / 5 without sight, empty safe tiles, Rooted refuses it, never provokes, Confuses the foes by the hole he left', function (t) {
    if (!ready(t)) return;
    [[1, 4, 2], [2, 5, 2], [3, 5, 1]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 1, y: 3, hpMult: 5 }, { id: 'test_grunt', x: 8, y: 8 }],
        terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'wall'; } });
      const u = Gu();
      const sl = give(u, 'gus_hole', c[0]);
      Gs().setCheeks(u, 3);
      t.ok(DD.Targeting.isValidTarget(u, sl, 1 + c[1], 4) && !DD.Targeting.isValidTarget(u, sl, 2 + c[1], 4), 'L' + c[0] + ': range ' + c[1] + ' (past a wall: no sight needed)');
      const aoo = [];
      const off = DD.Events.on('opportunity:attack', function (e) { aoo.push(e); });
      try { use(t, u, sl, 1 + c[1], 4, 'Hole L' + c[0]); } finally { off(); }
      t.ok(u.x === 1 + c[1] && u.y === 4 && aoo.length === 0, 'L' + c[0] + ': he pops up there; leaving two grunts provoked nothing');
      t.ok(has(at(2, 4), 'confused') && has(at(1, 3), 'confused') && !has(at(8, 8), 'confused'), 'L' + c[0] + ': the foes next to the hole he left are Confused, the far one not');
      t.eq(st(at(2, 4), 'confused').turns, 1, 'Confused for 1 turn');
      t.eq(sl.cd, c[2], 'L' + c[0] + ': cooldown ' + c[2]);
    });
    // drops and hazards refused; occupied tiles never offered; Rooted refuses it
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }],
      terrain: function (tl) { if (tl.x === 2 && tl.y === 5) tl.t = 'pit'; if (tl.x === 3 && tl.y === 5) tl.t = 'lava'; } });
    const u = Gu();
    const sl = give(u, 'gus_hole', 1);
    Gs().setCheeks(u, 3);
    t.ok(!DD.Targeting.isValidTarget(u, sl, 2, 5) && !DD.Targeting.isValidTarget(u, sl, 3, 5), 'never a pit or lava');
    t.ok(!DD.Targeting.isValidTarget(u, sl, 1, 6) && !DD.Targeting.isValidTarget(u, sl, 3, 4), 'never an occupied tile');
    A().addStatus(u, 'root', { turns: 1 }, foes()[0]);
    t.eq(DD.Combat.canUse(u, sl), 'Rooted. Even the roots won\'t take you.', 'Rooted: refused');
  });

  // ---- 11. Too Many Eyes -----------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: Too Many Eyes — Marked 3 / 4 / 5 on every foe on or next to a tile within 5 with sight; marks add; Silence; cd 1', function (t) {
    if (!ready(t)) return;
    [[1, 3], [2, 4], [3, 5]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_grunt', x: 6, y: 7 }] });
      const u = Gu(), a = at(6, 4), b = at(6, 5), far = at(6, 7);
      A().addStatus(b, 'marked', { stacks: 2 }, u);
      const sl = give(u, 'gus_eyes', c[0]);
      Gs().setCheeks(u, 3);
      t.ok(DD.Targeting.isValidTarget(u, sl, 6, 4) && !DD.Targeting.isValidTarget(u, sl, 7, 4), 'L' + c[0] + ': a tile within 5');
      use(t, u, sl, 6, 4, 'Too Many Eyes L' + c[0]);
      t.ok(st(a, 'marked').stacks === c[1] && st(b, 'marked').stacks === c[1] + 2 && !has(far, 'marked'), 'L' + c[0] + ': Marked ' + c[1] + ' (2 more on the one already marked); the far one not');
      t.eq(sl.cd, 1, 'cooldown 1');
    });
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], terrain: function (tl) { if (tl.x === 2 && tl.y >= 3 && tl.y <= 5) tl.t = 'wall'; } });
    const u = Gu();
    const sl = give(u, 'gus_eyes', 1);
    Gs().setCheeks(u, 3);
    t.ok(!DD.Targeting.isValidTarget(u, sl, 4, 4), 'eyes need to see (a wall in the way)');
    A().addStatus(u, 'silenced', { turns: 1 }, foes()[0]);
    t.eq(DD.Combat.canUse(u, sl), 'Silenced!', 'a spell: Silence blocks it');
  });

  // ---- 12. The Tree That Isn't There ------------------------------------------------------------------------------------------------
  T.suite('hero_gus: The Tree That Isn\'t There — 4 / 5 / 6 on or next to a tile within 4, +1 acorn (none at the cap, no bonk), never eats, never heals', function (t) {
    if (!ready(t)) return;
    [[1, 4], [2, 5], [3, 6]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 4, y: 3, hpMult: 5 }, { id: 'test_grunt', x: 7, y: 4, hpMult: 5 }] });
      const u = Gu(), a = at(5, 4), b = at(4, 3), far = at(7, 4), k = hero('test_knight');
      const sl = give(u, 'gus_tree', c[0]);
      Gs().setCheeks(u, 1);
      u.hp = 20;
      const a0 = a.hp, b0 = b.hp, f0 = far.hp, k0 = k.hp;
      use(t, u, sl, 4, 4, 'Tree L' + c[0]);
      t.ok(a0 - a.hp === c[1] && b0 - b.hp === c[1] && far.hp === f0 && k.hp === k0, 'L' + c[0] + ': ' + c[1] + ' to each foe around the tile, nothing to the knight');
      t.ok(n(u) === 2 && u.hp === 20, 'L' + c[0] + ': +1 acorn, no heal');
      t.eq(sl.cd, 2, 'cooldown 2');
    });
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 5 }] });
    const u = Gu();
    Gs().setCheeks(u, 3);
    let said = [];
    const lines = logged(/bonks/, function () { said = texts(function () { use(t, u, give(u, 'gus_tree', 1), 4, 4, 'Tree at full cheeks'); }); });
    t.ok(n(u) === 3 && lines.length === 0 && said.indexOf('(cheeks full)') >= 0, 'at the cap: no gain, "(cheeks full)", no bonk line');
    t.ok(!DD.Targeting.isValidTarget(u, give(u, 'gus_tree', 1), 6, 4), 'range 4');
  });

  // ---- 13. Hangry -------------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: Hangry — empty cheeks only, 0 AP, Empowered spent by the next damaging skill (the basic too), III Inspired this turn only, cd 3 / 2 / 2', function (t) {
    if (!ready(t)) return;
    [[1, 3], [2, 2], [3, 2]].forEach(function (c) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
      const u = Gu(), g = foes()[0];
      const sl = give(u, 'gus_hangry', c[0]);
      Gs().setCheeks(u, 1);
      t.eq(DD.Combat.canUse(u, sl), 'Not hangry yet: his cheeks aren\'t empty.', 'L' + c[0] + ': refused with an acorn');
      Gs().setCheeks(u, 0);
      u.ap = 0;
      const keys = barkKeys(u, function () { use(t, u, sl, u.x, u.y, 'Hangry L' + c[0] + ' at 0 AP'); });
      t.ok(has(u, 'empowered') && u.ap === 0 && keys.indexOf('hangry') >= 0, 'L' + c[0] + ': 0 AP, Empowered, the bark');
      t.eq(sl.cd, c[1], 'L' + c[0] + ': cooldown ' + c[1]);
      t.eq(has(u, 'inspired'), c[0] === 3, 'L' + c[0] + ': Inspired only at III');
      u.ap = 3;
      const h0 = g.hp;
      use(t, u, u.basic, 3, 4, 'Incisor while Empowered');
      const want = Math.round(5 * 1.5 * (c[0] === 3 ? 1.25 : 1));
      t.ok(h0 - g.hp === want && !has(u, 'empowered'), 'L' + c[0] + ': the basic spends it (' + want + ')');
      if (c[0] === 3) { DD.Combat.endTurn(); t.ok(!has(u, 'inspired'), 'III: Inspired ends with this turn'); }
    });
    t.eq(desc('gus_hangry', 3), 'Only with empty cheeks: you are Empowered (your next damaging skill deals +50% damage) and Inspired until the end of this turn (+25% damage).', 'III desc');
  });

  // ---- 14. Fine, Have One ------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: Fine, Have One — Haste: +1 AP at exactly the ally\'s next turn start; never himself, the downed or the Hasted; range 1 / 2 / 3, cd 3 / 3 / 2; spent, no heal, no zap', function (t) {
    if (!ready(t)) return;
    [[1, 1, 3], [2, 2, 3], [3, 3, 2]].forEach(function (c) {
      fight({ heroes: [{ x: 2, y: 4, items: ['gus_nomnomicon'] }, { id: 'test_knight', x: 2 + c[1], y: 4 }, { id: 'test_cleric', x: 3 + c[1], y: 4 }],
        enemies: [{ id: 'test_grunt', x: 2, y: 3, hpMult: 5 }] });
      const u = Gu(), k = hero('test_knight'), cl = hero('test_cleric'), g = foes()[0];
      const sl = give(u, 'gus_have_one', c[0]);
      Gs().setCheeks(u, 2);
      u.hp = 10;
      t.ok(DD.Targeting.isValidTarget(u, sl, k.x, k.y) && !DD.Targeting.isValidTarget(u, sl, cl.x, cl.y) && !DD.Targeting.isValidTarget(u, sl, u.x, u.y), 'L' + c[0] + ': an ally within ' + c[1] + ', never himself');
      const g0 = g.hp;
      const calls = healCalls(function () { use(t, u, sl, k.x, k.y, 'Fine, Have One L' + c[0]); });
      t.ok(n(u) === 1 && has(k, 'haste') && calls.filter(function (x) { return !x.sim; }).length === 0 && g.hp === g0, 'L' + c[0] + ': an acorn spent, the knight Hasted, no heal, no Nomicon zap');
      t.eq(sl.cd, c[2], 'L' + c[0] + ': cooldown ' + c[2]);
      t.eq(DD.Combat.canUse(u, sl), 'On cooldown (' + c[2] + ').', 'on cooldown');
      toHisTurn(k);
      t.eq(k.ap, k.maxAp + 1, 'L' + c[0] + ': the knight starts his next turn with +1 AP');
      DD.Combat.endTurn();
      t.ok(!has(k, 'haste'), 'gone after that turn');
    });
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 3, y: 4 }, { id: 'test_cleric', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    const u = Gu(), k = hero('test_knight'), cl = hero('test_cleric');
    const sl = give(u, 'gus_have_one', 1);
    Gs().setCheeks(u, 3);
    A().addStatus(k, 'haste', { turns: 1 }, u);
    A().damage(foes()[0], cl, 200, { cause: 'other' });
    t.ok(!DD.Targeting.isValidTarget(u, sl, k.x, k.y) && !DD.Targeting.isValidTarget(u, sl, cl.x, cl.y), 'never an ally already Hasted, never a downed one');
    t.eq(desc('gus_have_one', 1), 'Give an ally next to you one of your acorns (reluctantly): it is Hasted for its next turn (+1 AP).', 'I desc');
    t.ok(/^Give an ally within 2 /.test(desc('gus_have_one', 2)) && /^Give an ally within 3 /.test(desc('gus_have_one', 3)), 'II / III descs');
  });

  // ---- 15. the signature ---------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: The Acorn That Should Not Be — any tile within 5 without sight, 16 and Confused to foes within 2, then the cheeks fill; 100 Hype; no heal, no zap', function (t) {
    if (!ready(t)) return;
    [[[], 3], [['gus_cheeks_of_holding', 'gus_nomnomicon'], 4]].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 4, items: c[0] }, { id: 'test_knight', x: 0, y: 0 }],
        enemies: [{ id: 'test_grunt', x: 6, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 5, y: 6, hpMult: 5 }, { id: 'test_grunt', x: 5, y: 7, hpMult: 5 }, { id: 'test_grunt', x: 2, y: 4, hpMult: 5 }],
        terrain: function (tl) { if (tl.x === 3 && tl.y >= 2 && tl.y <= 6) tl.t = 'wall'; } });
      const u = Gu(), a = at(6, 4), b = at(5, 6), far = at(5, 7), near = at(2, 4);
      const sl = give(u, 'gus_acorn');
      Gs().setCheeks(u, 0);
      u.hp = 10;
      t.ok(DD.Targeting.isValidTarget(u, sl, 5, 4) && !DD.Targeting.isValidTarget(u, sl, 7, 4), 'a tile within 5, past a wall');
      const a0 = a.hp, b0 = b.hp, f0 = far.hp, n0 = near.hp;
      let keys = [];
      const calls = healCalls(function () { keys = barkKeys(u, function () { use(t, u, sl, 5, 4, 'the signature'); }); });
      const want = Math.round(16 * (1 + (u.dmgBonus || 0)));
      t.ok(a0 - a.hp === want && b0 - b.hp === want && far.hp === f0 && near.hp === n0, want + ' (16' + (u.dmgBonus ? ' +10%' : '') + ') to each foe within 2 of the tile, nobody else (no zap)');
      t.ok(has(a, 'confused') && has(b, 'confused') && st(a, 'confused').turns === 1, 'Confused for 1 turn');
      t.ok(n(u) === c[1] && u.hp === 10 && lifts(calls).length === 0, 'then his cheeks fill to ' + c[1] + '; no heal');
      t.ok(keys.indexOf('burp') >= 0 && DD.Combat.state.hype < 100, 'the burp; 100 Hype spent');
    });
    t.ok(!DD.Targeting.aimsAtObjects(Gu(), Gu().signature), 'never aimed at an object');
  });

  // ---- 16. items -------------------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: items — the Nom-Nom-Nomicon (after the meal, the nearest awake foe within 3), Cheeks of Holding (4 / 2), Winter Coat (+5 HP, stress 5)', function (t) {
    if (!ready(t)) return;
    // the Nomicon: 2 per acorn to the nearest awake foe within 3, after the skill; never a sleeper; once per use
    fight({ heroes: [{ x: 2, y: 4, items: ['gus_nomnomicon'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 2, y: 2, hpMult: 5 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 5 }] });
    let u = Gu();
    const g = at(3, 4), sleeper = at(2, 2), third = at(5, 4);
    t.eq(u.dmgBonus, 0.1, '+10% damage');
    A().addStatus(g, 'sleep', { turns: 2 }, u);
    Gs().setCheeks(u, 3);
    const s0 = sleeper.hp, g0 = g.hp, t0 = third.hp;
    const order = [];
    A().addRule({ id: 'gus_probe_order', name: 'probe', silent: true, hooks: { onTakeDamage: function (d) { if (!A().simulating && d && d.target) order.push((d.tags || []).indexOf('nomicon') >= 0 ? 'zap:' + d.target.id : 'hit:' + d.target.id); } } });
    try { use(t, u, give(u, 'gus_hollow', 1), 5, 4, 'Hollow (2 acorns) at the far grunt'); } finally { A().removeRule('gus_probe_order'); }
    t.ok(g.hp === g0 && has(g, 'sleep'), 'the sleeper next to him is left asleep');
    t.eq(s0 - sleeper.hp, Math.round(2 * 2 * 1.1), 'the nearest awake foe within 3 takes 2 × 2 acorns (+10%)');
    t.eq(t0 - third.hp, Math.round(12 * 1.1), 'the skill\'s own hit first');
    t.ok(order.length === 2 && /^hit/.test(order[0]) && /^zap/.test(order[1]), 'after the skill, once per use (' + order.join(', ') + ')');
    // never on an echo; never on The Tree (it eats nothing)
    const sh = sleeper.hp;
    DD.Combat._action(function () { DD.Combat.resolveSkill(u, give(u, 'gus_root_canal', 1), { x: 5, y: 4 }, { extra: { rpEcho: true } }); });
    t.eq(sleeper.hp, sh, 'an echo never zaps');
    // review:phat-gus — "within 3": a foe 4 tiles away is never read to; at 3 it is (the zap is 2 × 1.1 → 2)
    fight({ heroes: [{ x: 2, y: 4, items: ['gus_nomnomicon'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4, hpMult: 5 }] });
    u = Gu();
    const g4 = foes()[0];
    Gs().setCheeks(u, 3);
    let h4 = g4.hp;
    use(t, u, give(u, 'gus_root_canal', 1), 6, 4, 'Root Canal at a foe 4 away (Nomicon)');
    t.eq(h4 - g4.hp, Math.round(5 * 1.1), 'a foe 4 tiles away: the roots only (6), no recipe');
    A().teleport(g4, 5, 4, { fx: false, noEnter: true });
    toHisTurn(u);
    h4 = g4.hp;
    const s4 = give(u, 'gus_root_canal', 1);
    use(t, u, s4, 5, 4, 'Root Canal at a foe 3 away (Nomicon)');
    t.eq(h4 - g4.hp, Math.round(5 * 1.1) + Math.round(2 * 1.1), 'a foe 3 tiles away: the roots (6), then the recipe (2)');
    // Cheeks of Holding: 4 / 2, a fifth cheek size
    fight({ heroes: [{ id: 'test_knight', x: 0, y: 0 }, { x: 2, y: 4, items: ['gus_cheeks_of_holding'] }], order: ['test_knight'], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    u = Gu();
    t.ok(n(u) === 2 && Gs().capOf(u) === 4 && Gs().startOf(u) === 2, 'Cheeks of Holding: starts with 2, holds 4');
    Gs().setCheeks(u, 4);
    t.eq(Gs().shownCheeks({ unit: u }), 4, 'the sprite reads 4 (its fifth cheek size)');
    t.ok(/\(now: 4 acorns, 12 each\)/.test(DD.skillDesc(DD.getSkill('gus_binge'), 1, u)), 'the live binge desc: 4 acorns, 12 each');
    // Winter Coat (Built In): +5 max HP, stress 5
    fight({ heroes: [{ x: 2, y: 4, items: ['gus_winter_coat'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    u = Gu();
    t.ok(u.maxHp === 35 && Gs().stressOf(u) === 5, 'the Winter Coat: 35 max HP, stress eating heals 5');
    t.ok(/he heals 5 HP\.$/.test(Gs().passiveDesc(u)), 'the live passive text says 5');
  });

  // ---- 17. HUD previews -------------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: HUD previews match reality (every skill × level × 0-4 acorns, with and without a foe next to him; stress heal and Nomicon included)', function (t) {
    if (!ready(t)) return;
    let checks = 0;
    function arena(variant, k) {
      const items = (variant === 'close' ? ['gus_nomnomicon'] : []).concat(k === 4 ? ['gus_cheeks_of_holding'] : []);
      const gus = variant === 'close' ? { x: 4, y: 4, level: 3, items: items } : { x: 1, y: 1, level: 3, items: items };
      return fight({ heroes: [gus, { id: 'test_knight', x: variant === 'close' ? 4 : 1, y: variant === 'close' ? 6 : 2 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_brute', x: 4, y: 3 }, { id: 'test_grunt', x: 6, y: 6 }, { id: 'test_archer', x: 7, y: 4 }] });
    }
    ALL.forEach(function (id) {
      const def = DD.getSkill(id);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        ['close', 'apart'].forEach(function (variant) {
          [0, 1, 2, 3, 4].forEach(function (k) {
            arena(variant, k);
            let u = Gu();
            let sl = give(u, id, lv);
            Gs().setCheeks(u, k);
            u.hp = 14; u.ap = 3;
            if (DD.Combat.canUse(u, sl) !== true) return;
            const tg = DD.Targeting.validTargets(u, sl);
            const p = tg.filter(function (q) { return !q.obj; })[0] || tg[0];
            if (!p) return;
            arena(variant, k);
            u = Gu();
            sl = give(u, id, lv);
            Gs().setCheeks(u, k);
            u.hp = 14; u.ap = 3;
            previewMatches(t, u, sl, p.x, p.y, id + ' L' + lv + ' ' + variant + ' at ' + k);
            checks++;
          });
        });
      }
    });
    t.ok(checks >= 120, checks + ' preview checks');
  });

  // ---- 18. v2 edge cases -----------------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: v2 edge cases (stun, sleep, sheep, charm, a Confused Gus, Silence, 0 AP, not his turn, null targets, deaths mid-skill, a cleanse)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4, skills: ['gus_whispers', 'gus_root_canal', 'gus_eyes', 'gus_hollow'] }, { id: 'test_knight', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
    let u = Gu();
    const g = at(3, 4);
    Gs().setCheeks(u, 3);
    A().addStatus(u, 'silenced', { turns: 1 }, g);
    t.ok(DD.Combat.canUse(u, u.skills[0]) === 'Silenced!' && DD.Combat.canUse(u, u.skills[2]) === 'Silenced!', 'Silenced: Don\'t Listen and Too Many Eyes (spells) are blocked');
    t.ok(DD.Combat.canUse(u, u.skills[1]) === true && DD.Combat.canUse(u, u.skills[3]) === true && DD.Combat.canUse(u, u.basic) === true, 'and only those two');
    A().removeStatus(u, 'silenced');
    A().addStatus(u, 'sheep', { turns: 1 }, g);
    t.ok(/^Baa/.test(DD.Combat.canUse(u, u.skills[1])) && /^Baa/.test(DD.Combat.canUse(u, u.basic)), 'a sheep: Baa');
    A().removeStatus(u, 'sheep');
    A().addStatus(u, 'sleep', { turns: 1 }, g);
    t.eq(DD.Combat.canUse(u, u.basic), 'Asleep. Zzz.', 'asleep');
    A().removeStatus(u, 'sleep');
    A().addStatus(u, 'stun', { turns: 1 }, g);
    t.eq(DD.Combat.canUse(u, u.basic), 'Stunned!', 'stunned');
    A().removeStatus(u, 'stun');
    A().addStatus(u, 'confused', { turns: 1 }, g);
    t.tryRun('confused', function () { t.eq(DD.Combat.moveApCost(u), 2, 'a Confused Gus: moving costs 2 AP'); DD.Combat.reachable(u); });
    A().removeStatus(u, 'confused');
    u.ap = 0;
    t.eq(DD.Combat.canUse(u, u.basic), 'Not enough AP.', '0 AP');
    u.ap = 3;
    DD.Combat.giveTurnTo(hero('test_knight'));
    t.ok(/Not .*turn/.test(String(DD.Combat.canUse(u, u.basic))), 'not his turn: refused (' + DD.Combat.canUse(u, u.basic) + ')');
    // his charm: −1 AP, can't hurt the charmer; eating and stress eating work as usual
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 3, hpMult: 5 }] });
    u = Gu();
    const c = at(3, 4), o = at(2, 3);
    A().addStatus(u, 'charmed', { turns: 1 }, c);
    DD.Combat.endTurn();
    t.eq(u.ap, 2, 'charmed: −1 AP');
    const c0 = c.hp;
    use(t, u, u.basic, c.x, c.y, 'Incisor vs the charmer');
    t.eq(c.hp, c0, 'no damage to the charmer');
    Gs().setCheeks(u, 2);
    u.hp = 10;
    use(t, u, give(u, 'gus_root_canal', 1), o.x, o.y, 'Root Canal while charmed');
    t.ok(n(u) === 1 && u.hp === 13, 'charmed: he still eats and stress-eats');
    // deaths mid-skill: no riders on corpses
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = Gu();
    let f = foes()[0];
    f.hp = 2;
    Gs().setCheeks(u, 3);
    t.tryRun('Root Canal kill', function () { use(t, u, give(u, 'gus_root_canal', 1), 3, 4, 'Root Canal a 2-HP foe'); });
    t.ok(f.dead && !has(f, 'weak'), 'killed, no Weakened on a corpse');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = Gu(); f = foes()[0]; f.hp = 2;
    Gs().setCheeks(u, 3);
    t.tryRun('Hollow kill', function () { use(t, u, give(u, 'gus_hollow', 1), 3, 4, 'Hollow a 2-HP foe'); });
    t.ok(f.dead && !has(f, 'root'), 'killed, no Root on a corpse');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = Gu(); f = foes()[0]; f.hp = 2;
    Gs().setCheeks(u, 3);
    t.tryRun('whisper kill', function () { use(t, u, give(u, 'gus_whispers', 1), u.x, u.y, 'Don\'t Listen with a 2-HP foe'); });
    t.ok(f.dead && !has(f, 'confused'), 'killed, no Confused on a corpse');
    // dying mid-turn: the passive's hooks on a downed Gus do nothing
    A().damage(foes()[0] || u, u, 200, { cause: 'other' });
    t.tryRun('downed hooks', function () { Gs().drop(u); Gs().stressEat(u); });
    t.ok(u.downed && n(u) === 0, 'downed: no drop, no stress');
    // odd targets through the raw resolver never throw
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = Gu();
    ALL.forEach(function (id) {
      const sl = give(u, id, 1);
      [null, { x: 6, y: 6 }, { x: u.x, y: u.y }, { x: 3, y: 4 }, { x: 2, y: 5 }].forEach(function (p) {
        Gs().setCheeks(u, 2);
        t.tryRun(id + ' execute with ' + JSON.stringify(p), function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, p, { pay: false }); }); });
        t.tryRun(id + ' paid with ' + JSON.stringify(p), function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, p, { pay: true }); }); });
      });
    });
    t.ok(!u.dead, 'nothing exploded');
    // the map corner; descs and canUse with no fight at all
    fight({ heroes: [{ x: 0, y: 0, skills: POOL.slice(0, 4) }], enemies: [{ id: 'test_grunt', x: 1, y: 0 }, { id: 'test_grunt', x: 0, y: 3 }] });
    u = Gu();
    u.skills.concat([u.signature, u.basic]).forEach(function (sl) { t.tryRun(sl.id + ' targets in the corner', function () { DD.Targeting.validTargets(u, sl); }); });
    const rh = DD.Combat.makeRunHero({ id: HERO, level: 1 });
    ALL.forEach(function (id) {
      const def = DD.getSkill(id);
      t.ok(typeof def.canUse !== 'function' || def.canUse({ user: rh, L: def.levels[0] }) === true, id + ': canUse outside a fight (party select) says yes');
    });
  });

  // ---- 19. attacks of opportunity -----------------------------------------------------------------------------------------------------------------------
  function aoos(fn) {
    const list = [];
    const off = DD.Events.on('opportunity:attack', function (e) { list.push({ attacker: e.attacker && e.attacker.defId, mover: e.mover && e.mover.defId, skillId: e.skillId }); });
    try { fn(); } finally { off(); }
    return list;
  }
  T.suite('hero_gus: attacks of opportunity (Incisor strikes walkers; walking off provokes; the Hole never does; reactions and Delegate never eat)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
    let u = Gu();
    const g = foes()[0];
    Gs().setCheeks(u, 2);
    const h0 = g.hp;
    let list = aoos(function () { A().moveAlong(g, [{ x: 4, y: 4 }, { x: 5, y: 4 }], { provoke: true }); });
    t.ok(list.length === 1 && list[0].attacker === HERO && list[0].skillId === 'gus_incisor' && h0 - g.hp === 5 && n(u) === 2, 'Incisor bites the walker (5); no acorn eaten');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
    u = Gu();
    list = aoos(function () { DD.Combat.move(u, 2, 6); });
    t.ok(list.some(function (x) { return x.mover === HERO && x.attacker === 'test_grunt'; }), 'walking away provokes the grunt');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 2, y: 3, hpMult: 3 }] });
    u = Gu();
    Gs().setCheeks(u, 2);
    list = aoos(function () { use(t, u, give(u, 'gus_hole', 1), 2, 7, 'the Hole out of two grunts'); });
    t.eq(list.length, 0, 'Down the Squirrel Hole never provokes');
    // Delegate (Mayor Buga's free basic) never eats
    if (DD.getHero('buga')) {
      fight({ heroes: [{ id: 'buga', x: 2, y: 2, skills: ['buga_delegate'] }, { x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }] });
      const b = hero('buga'), v = Gu(), f = foes()[0];
      Gs().setCheeks(v, 2);
      const f0 = f.hp;
      const pay = payments(function () { use(t, b, b.skills[0], f.x, f.y, 'Delegate'); });
      t.ok(f0 - f.hp >= 5 && n(v) === 2 && !pay.some(function (p) { return p.ate; }), 'a Delegated Incisor bites and eats nothing (' + (f0 - f.hp) + ')');
    } else t.log('buga.js not loaded (isolated run): the Delegate check is skipped');
  });

  // ---- 20. AutoPlay -------------------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: AutoPlay prices and choices (bite before eating, no Hollow on a 2-HP foe, Hangry on empty, no share to a stunned ally)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    let u = Gu();
    Gs().setCheeks(u, 1);
    t.ok(Gs().priceOf(u, 1) === 3 && Gs().priceOf(u, 2) === 6, 'priceOf at 1/3: 3 an acorn');
    A().damage(u, at(8, 8), 200, { cause: 'other' });
    t.ok(Gs().priceOf(u, 1) === 1 && Gs().priceOf(u, 2) === 2, 'one foe left: nothing to save them for (1 an acorn)');
    A().spawn('test_grunt', 8, 8);
    Gs().setCheeks(u, 3);
    t.ok(Gs().priceOf(u, 1) === 1 && Gs().priceOf(u, 2) === 4 && Gs().priceOf(u, 3) === 7, 'from full cheeks the first acorn costs 1 (the next drop would bonk)');
    t.ok(Gs().gainWorth(u, 1) === 0, 'gaining at the cap is worth nothing');
    Gs().setCheeks(u, 1);
    t.ok(Gs().gainWorth(u, 1) === 3 && Gs().gainWorth(u, 2) === 4.5, 'gainWorth: 3, the last slot 1.5');
    u.items = ['gus_cheeks_of_holding'];
    Gs().setCheeks(u, 3);
    t.ok(Gs().priceOf(u, 1) === 3 && Gs().gainWorth(u, 1) === 1.5, 'with Cheeks of Holding (4): 3 / 1.5 at 3 acorns');
    u.items = [];
    Gs().setCheeks(u, 2);
    const ctxOf = function (v, id, target) { const sl = give(v, id, 1); return DD.Targeting.buildCtx(v, sl, target || { x: v.x, y: v.y }); };
    t.eq(Gs().eatValue(ctxOf(u, 'gus_hollow', { x: 3, y: 4 })), -6, 'eatValue of the Hollow at 2: −6');
    t.eq(DD.getSkill('gus_root_canal').autoplayValue, Gs().eatValue, 'every eater carries eatValue');
    u.hp = 10;
    t.ok(Gs().stressQuick(ctxOf(u, 'gus_root_canal', { x: 3, y: 4 })) > 0, 'stressQuick: a foe next to him and HP missing');
    const cx = ctxOf(u, 'gus_root_canal', { x: 3, y: 4 });
    cx.autoplay = { preview: {} };
    t.eq(Gs().stressQuick(cx), 0, 'the exact pass prices nothing (its dry run heals for real)');
    // Fine, Have One: 0 on a stunned ally
    const k = hero('test_knight');
    A().addStatus(k, 'stun', { turns: 1 }, foes()[0]);
    t.eq(Gs().shareValue(ctxOf(u, 'gus_have_one', { x: k.x, y: k.y })), 0, 'shareValue 0 on a stunned ally');
    A().removeStatus(k, 'stun');
    Gs().setCheeks(u, 3);
    t.eq(Gs().shareValue(ctxOf(u, 'gus_have_one', { x: k.x, y: k.y })), 0.6 * 5 - 1, 'a ready knight: 0.6 × his best hit (5) − the acorn (1 from full cheeks)');
    // with 1 acorn and a 3-HP foe next to him, he bites rather than eats
    fight({ heroes: [{ x: 2, y: 4, skills: ['gus_whispers', 'gus_root_canal'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8, hpMult: 3 }] });
    u = Gu();
    Gs().setCheeks(u, 1);
    at(3, 4).hp = 3;
    let seq = [];
    t.tryRun('AutoPlay turn', function () { seq = usedBy(u, function () { DD.AutoPlay.takeTurn(); }); });
    t.ok(seq[0] === 'gus_incisor' && (!at(3, 4) || at(3, 4).dead || at(3, 4).defId !== 'test_grunt'), 'a 3-HP grunt next to him: Incisor first (' + seq.join(', ') + ')');
    // never The Hollow Hungers on a 2-HP foe
    fight({ heroes: [{ x: 1, y: 4, skills: ['gus_hollow', 'gus_root_canal'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8, hpMult: 3 }] });
    u = Gu();
    Gs().setCheeks(u, 3);
    at(3, 4).hp = 2;
    t.tryRun('AutoPlay turn', function () { seq = usedBy(u, function () { DD.AutoPlay.takeTurn(); }); });
    t.ok(seq.indexOf('gus_hollow') < 0, 'a 2-HP foe: no Hollow (' + seq.join(', ') + ')');
    // empty cheeks, AP and a damaging skill left: Hangry first
    fight({ heroes: [{ x: 2, y: 4, skills: ['gus_hangry', 'gus_root_canal'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    u = Gu();
    Gs().setCheeks(u, 0);
    t.tryRun('AutoPlay turn', function () { seq = usedBy(u, function () { DD.AutoPlay.takeTurn(); }); });
    const hi = seq.indexOf('gus_hangry');
    t.ok(hi >= 0 && seq.slice(hi + 1).indexOf('gus_incisor') >= 0, 'empty cheeks: Hangry, then a bite (' + seq.join(', ') + ')');
  });

  /** AutoPlay battles of ['gus', 'test_knight', 'test_cleric', 'test_mage'] vs the fixture encounters. */
  function battles(t, plans, tagSeed) {
    const tot = { fought: 0, wins: 0, timeouts: 0, eaten: 0, bonks: 0, stress: 0, stressHp: 0, turns: 0, uses: {}, prints: [], problems: 0 };
    plans.forEach(function (p, i) {
      const enc = DD.getEncounter(p.enc);
      if (!enc) { t.fail('fixture encounter ' + p.enc + ' missing'); return; }
      const sl = Math.min(3, 1 + Math.floor((p.level - 1) / 2));
      const party = [HERO, 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
        if (id === HERO) return DD.Combat.makeRunHero({ id: id, level: p.level, items: p.items || [], skills: p.skills.map(function (sid) { return { id: sid, level: sl }; }) });
        const h = DD.getHero(id);
        return DD.Combat.makeRunHero({ id: id, level: p.level, skills: h.startingSkills.map(function (sid) { return { id: sid, level: sl }; }) });
      });
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('gus-ap-' + (tagSeed || '') + i + ':' + t.seed), difficulty: 'normal', act: enc.act });
      DD.Combat.start(setup, { seed: 900 + i, headless: true, difficulty: 'normal', kind: enc.kind });
      const counts = {};
      A().addRule({ id: 'gus_usage_probe', name: 'Usage probe', silent: true, hooks: {
        onSkillUsed: function (ctx) { if (!A().simulating && ctx.user && ctx.user.defId === HERO && ctx.skill && !ctx.opportunity) counts[ctx.skill.id] = (counts[ctx.skill.id] || 0) + 1; },
        onCostPaid: function (q) { if (!A().simulating && q && q.unit && q.unit.defId === HERO && q.gusAte > 0) tot.eaten += q.gusAte; },
        onTurnStart: function (x) { if (!A().simulating && x && x.defId === HERO && !x.downed) tot.turns++; },
      } });
      const offLog = DD.Events.on('combat:log', function (e) { if (e && /bonks .* on the head/.test(String(e.text || ''))) tot.bonks++; });
      const p0 = DD.problems.length;
      let r = null;
      const calls = healCalls(function () { t.tryRun(p.enc + ' L' + p.level + ' battle', function () { r = DD.AutoPlay.runBattle(30); }); });
      offLog();
      A().removeRule('gus_usage_probe');
      tot.problems += DD.problems.length - p0;
      lifts(calls).forEach(function (x) { tot.stress++; tot.stressHp += x.healed || 0; });
      if (!r) return;
      tot.fought++;
      if (r.result === 'victory') tot.wins++;
      if (r.timeout) tot.timeouts++;
      Object.keys(counts).forEach(function (k) { tot.uses[k] = (tot.uses[k] || 0) + counts[k]; });
      const s = DD.Combat.state;
      tot.prints.push([r.result, r.rounds, s.units.map(function (o) { return o.defId + ':' + o.hp + ':' + o.x + ',' + o.y + ':' + (o.statuses || []).map(function (x) { return x.id + x.stacks; }).join('+'); }).join('|'), s.round, s.hype].join('/'));
      t.ok(r.rounds > 0 && !r.timeout, p.enc + ' L' + p.level + ': finished (' + r.result + ' in ' + r.rounds + ' rounds)');
      t.log(p.enc + ' L' + p.level + ' → ' + r.result + ' in ' + r.rounds + ' rounds; Phat Gus: ' + JSON.stringify(counts));
    });
    return tot;
  }
  const PLANS = [
    { enc: 'test_a1_normal', level: 1, skills: ['gus_whispers', 'gus_root_canal'] },
    { enc: 'test_a1_elite', level: 1, skills: ['gus_whispers', 'gus_root_canal'] },
    { enc: 'test_a1_normal', level: 3, skills: ['gus_whispers', 'gus_root_canal', 'gus_hollow'] },
    { enc: 'test_a2_normal', level: 3, skills: ['gus_whispers', 'gus_root_canal', 'gus_binge'] },
    { enc: 'test_a1_boss', level: 3, skills: ['gus_whispers', 'gus_root_canal', 'gus_hole'] },
    { enc: 'test_a2_elite', level: 3, skills: ['gus_whispers', 'gus_eyes', 'gus_tree'] },
    { enc: 'test_a2_elite', level: 5, skills: ['gus_whispers', 'gus_root_canal', 'gus_hollow', 'gus_hangry'], items: ['gus_nomnomicon'] },
    { enc: 'test_a3_normal', level: 5, skills: ['gus_root_canal', 'gus_binge', 'gus_have_one', 'gus_tree'], items: ['gus_cheeks_of_holding'] },
    { enc: 'test_a2_boss', level: 5, skills: ['gus_whispers', 'gus_hole', 'gus_eyes', 'gus_hollow'], items: ['gus_winter_coat'] },
    { enc: 'test_a3_elite', level: 5, skills: ['gus_whispers', 'gus_root_canal', 'gus_binge', 'gus_hangry'] },
  ];
  T.suite('hero_gus: AutoPlay battles at levels 1 / 3 / 5 (fixture party, items at 5): acorns eaten, bonks, a stress heal; deterministic', function (t) {
    if (!ready(t)) return;
    const res = battles(t, PLANS);
    const f = Math.max(1, res.fought);
    t.log('uses: ' + JSON.stringify(res.uses) + ' · wins ' + res.wins + '/' + res.fought + ' · acorns eaten ' + res.eaten + ' (' + (res.eaten / f).toFixed(2) + '/fight) · bonks ' +
      res.bonks + ' (' + (res.bonks / f).toFixed(2) + '/fight) · stress heals ' + res.stress + ' (' + res.stressHp + ' HP)');
    t.eq(res.timeouts, 0, 'no timeouts');
    t.eq(res.problems, 0, 'no warnings or swallowed errors');
    // the fixture fights last 2-3 rounds, so the campaign's "≥ 3 acorns a fight" (the zz sim and tools/sim.sh measure it)
    // reads here as the rate: he eats about every acorn that falls (one a turn, one at the start)
    t.ok(res.eaten >= 0.75 * res.turns, '≥ 0.75 acorns eaten per turn of his (' + res.eaten + ' in ' + res.turns + ' turns; ' + (res.eaten / f).toFixed(2) + ' a fight)');
    t.ok(res.bonks / f <= 1, '≤ 1 bonk a fight (' + (res.bonks / f).toFixed(2) + ')');
    t.ok(res.stress > 0, 'a stress heal somewhere in the batch (' + res.stress + ')');
    t.ok(res.wins >= Math.ceil(res.fought * 0.5), 'the party mostly wins (' + res.wins + '/' + res.fought + ')');
    // two seeded runs are bit-identical (the whispers are cosmetic: DD.rng)
    const a = battles(t, PLANS.slice(0, 2), 'det'), b = battles(t, PLANS.slice(0, 2), 'det');
    t.eq(JSON.stringify(a.prints), JSON.stringify(b.prints), 'two seeded runs are bit-identical');
  });

  // ---- 21. sprite and painters -----------------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: sprite and painters (every pose × cheeks 0-4, five yaws, the portrait, the cheek pin follows FX playback, six FX painters at every yaw)', function (t) {
    if (!ready(t)) return;
    const spec = Gs().GUS_SPRITE;
    if (!DD.Sprites) { t.log('no DD.Sprites'); return; }
    const p0 = DD.problems.length;
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 140;
    const ctx = cv.getContext('2d');
    [0, 1, 2, 3, 4].forEach(function (k) {
      const fake = { id: 'gus_fake', defId: HERO, kind: 'hero', statuses: k ? [{ id: 'gus_cheeks', stacks: k, data: { cap: k > 3 ? 4 : 3 } }] : [], items: k > 3 ? ['gus_cheeks_of_holding'] : [], vis: {} };
      ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
        [1, -1].forEach(function (fc) {
          [{}, { still: true }, { walk: 0.3 }, { walk: 0.95 }, { lying: 0.5 }, { poseT: 0.7 }, { blink: true }].forEach(function (o) {
            t.tryRun('pose ' + pose + ' cheeks ' + k, function () { DD.Sprites.draw(ctx, spec, 80, 120, 2, Object.assign({ pose: pose, t: 1.3 + k, facing: fc, unit: fake }, o)); });
          });
        });
      });
    });
    t.tryRun('portrait', function () { const p = DD.Sprites.portrait(spec, 64); t.ok(!!p && p.width > 0, 'a portrait'); });
    t.eq(Gs().shownCheeks({}), 1, 'the gallery and party select draw a plump 1');
    // the board at five yaws with his cheeks at 0..4
    if (DD.Render && typeof DD.Render.renderTo === 'function') {
      fight({ heroes: [{ x: 2, y: 4, items: ['gus_cheeks_of_holding'] }, { id: 'test_knight', x: 4, y: 6 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
      const u = Gu();
      const board = document.createElement('canvas');
      board.width = 320; board.height = 220;
      [0, 2, 4].forEach(function (k) {
        Gs().setCheeks(u, k);
        [0, 90, 180, 270, 37.5].forEach(function (yaw) {
          t.tryRun('board at yaw ' + yaw + ' with ' + k, function () { DD.Render.renderTo(board, { state: DD.Combat.state, width: 320, height: 220, yaw: yaw }); });
        });
      });
    }
    // the cheek pin: the sprite shows the old count until playback reaches the CHOMP, never after a flush
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    const u = Gu();
    u.vis = u.vis || {};
    const inst = DD.FX.instant;
    try {
      DD.FX.instant = false;
      DD.FX.reset();
      Gs().setCheeks(u, 3);
      DD.FX.flush();
      const sl = give(u, 'gus_root_canal', 1);
      use(t, u, sl, 3, 4, 'Root Canal with FX queued');
      t.ok(n(u) === 2 && DD.FX.busy() && Gs().shownCheeks({ unit: u }) === 3, 'queued FX: the cheeks still show 3');
      const q = DD.FX.queue;
      const iChomp = q.findIndex(function (e) { return e.type === 'text' && /CHOMP/.test(e.text); });
      let iCall = -1;
      q.forEach(function (e, i) { if (e.type === 'call' && i > iChomp) iCall = iCall < 0 ? i : iCall; });
      t.ok(iChomp >= 0 && iCall > iChomp, 'the cheek shrinks on the CHOMP, not before (' + iChomp + ' < ' + iCall + ')');
      DD.FX.flush();
      t.ok(!DD.FX.busy() && Gs().shownCheeks({ unit: u }) === 2 && u.vis.gusCheeks === null, 'playback caught up: 2, the pin dropped');
      u.vis.gusCheeks = 3;
      DD.FX.reset();
      t.eq(Gs().shownCheeks({ unit: u }), 2, 'a stale pin never sticks once the queue is idle');
    } finally { DD.FX.instant = inst; DD.FX.reset(); }
    // a preview never pins
    const pin = u.vis.gusCheeks;
    u.ap = 3;
    DD.Combat.preview(u, give(u, 'gus_root_canal', 1), 3, 4);
    t.ok(u.vis.gusCheeks === pin && n(u) === 2, 'a preview leaves the cheeks and the pin alone');
    // the six FX painters at every yaw and five moments
    const P = Gs().painters;
    ['drawRoots', 'drawMouth', 'drawHole', 'drawEye', 'drawTree', 'drawGiantAcorn'].forEach(function (name) {
      [0, 90, 180, 270, 37.5].forEach(function (yaw) {
        DD.Iso.withYaw(yaw, function () {
          const view = { zoom: 1.5, width: 320, height: 220, local: function (a, b) { return DD.Iso.local(a, b); },
            toScreen: function (x, y, h) { const w = DD.Iso.toWorld(x, y, h || 0); return { x: w.x * 1.5 + 160, y: w.y * 1.5 + 60 }; } };
          [0, 0.25, 0.5, 0.75, 1].forEach(function (p) { t.tryRun(name + ' yaw ' + yaw + ' p ' + p, function () { P[name](ctx, 80, 90, p, view, {}); }); });
        });
      });
      t.tryRun(name + ' without a view', function () { P[name](ctx, 80, 90, 0.5, null, {}); });
    });
    t.eq(DD.problems.length - p0, 0, 'no DD.safe warning from any of it' + (DD.problems.length > p0 ? ': ' + DD.problems.slice(p0, p0 + 3).join(' | ') : ''));
  });

  // ---- 22. combos with the cast ------------------------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: combos with the cast (Kick \'Em on a Hollow-Rooted foe, marks add, a Confused swing hits a friend, Haste on Marwyn and on a corgi)', function (t) {
    if (!ready(t)) return;
    let ran = 0;
    if (DD.getHero('betty')) {
      fight({ heroes: [{ x: 1, y: 4 }, { id: 'betty', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 5 }] });
      const u = Gu(), b = hero('betty'), g = foes()[0];
      Gs().setCheeks(u, 2);
      use(t, u, give(u, 'gus_hollow', 1), 4, 4, 'Hollow');
      DD.Combat.giveTurnTo(b);
      b.skills = [DD.Act.makeSlot('bet_kick', 1)];
      const h0 = g.hp;
      use(t, b, b.skills[0], 4, 4, 'Kick \'Em on the Rooted grunt');
      t.eq(h0 - g.hp, 10, 'Betty\'s Kick \'Em hits the Hollow-Rooted grunt for 10');
      ran++;
    }
    // Too Many Eyes adds to an earlier mark (any source's)
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 5 }] });
    let u = Gu();
    const g = foes()[0];
    A().addStatus(g, 'marked', { stacks: 3 }, hero('test_knight'));
    Gs().setCheeks(u, 2);
    use(t, u, give(u, 'gus_eyes', 1), 5, 4, 'Too Many Eyes on a marked grunt');
    t.eq(st(g, 'marked').stacks, 6, 'Marked 3 + 3 = 6');
    const h0 = g.hp;
    A().damage(hero('test_knight'), g, 4, { cause: 'other' });
    t.ok(h0 - g.hp === 10 && !has(g, 'marked'), 'the next hit takes all 6 extra');
    // a Confused grunt's swing turns a quarter and hits a friend
    fight({ enemyAi: true, heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 5, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 4, y: 3, hpMult: 5 }, { id: 'test_grunt', x: 4, y: 5, hpMult: 5 }] });
    u = Gu();
    const a = at(4, 4), n1 = at(4, 3), n2 = at(4, 5), k = hero('test_knight');
    Gs().setCheeks(u, 2);
    u.ap = 3;
    use(t, u, give(u, 'gus_whispers', 1), u.x, u.y, 'Don\'t Listen');
    A().removeStatus(n1, 'confused'); A().removeStatus(n2, 'confused');
    const k0 = k.hp, a1 = n1.hp, a2 = n2.hp;
    t.ok(has(a, 'confused'), 'the middle grunt is Confused');
    t.tryRun('the Confused grunt acts', function () { DD.Combat.giveTurnTo(a); });
    t.ok(n1.hp < a1 || n2.hp < a2 || k.hp === k0, 'its stab turned a quarter: a friend took it, or it found nobody (knight ' + (k0 - k.hp) + ', friends ' + (a1 - n1.hp) + ' / ' + (a2 - n2.hp) + ')');
    // Fine, Have One on Marwyn: 4 AP on his next turn
    if (DD.getHero('marwyn')) {
      fight({ heroes: [{ x: 2, y: 4 }, { id: 'marwyn', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
      u = Gu();
      const m = hero('marwyn');
      Gs().setCheeks(u, 2);
      use(t, u, give(u, 'gus_have_one', 1), 3, 4, 'Fine, Have One on Marwyn');
      toHisTurn(m);
      t.eq(m.ap, m.maxAp + 1, 'Marwyn starts his turn with ' + (m.maxAp + 1) + ' AP');
      ran++;
    }
    // Haste on a corgi: +1 AP on its owner's next turn
    if (DD.getHero('ellaria') && DD.getSummon && DD.getSummon('ell_corgi')) {
      fight({ heroes: [{ x: 2, y: 4 }, { id: 'ellaria', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
      u = Gu();
      const e = hero('ellaria');
      const corgi = A().summon(e, 'ell_corgi', 3, 4, { ready: true, noFx: true });
      if (corgi) {
        Gs().setCheeks(u, 2);
        use(t, u, give(u, 'gus_have_one', 1), 3, 4, 'Fine, Have One on a corgi');
        toHisTurn(e);
        t.eq(corgi.ap, corgi.maxAp + 1, 'the corgi gets +1 AP on Ellaria\'s next turn (' + corgi.ap + ')');
        ran++;
      }
    }
    t.log(ran + ' cross-hero combos ran (the rest need hero files not loaded here)');
  });

  // ---- h19 qa-fix:content ------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: QA fixes — full cheeks say so, the Hole\'s refusal names a real cause, Root Canal\'s log has no "It", brown crumbs, his own swap openers, "fat" is his word, the sprite\'s teeth and acorn', function (t) {
    if (!ready(t)) return;
    // gus-cap-promises / voice-8: at the cap the chip and The Tree say what happens next
    const cs = DD.getStatus('gus_cheeks');
    t.eq(cs.desc({ stacks: 3, data: { cap: 3 } }), 'Cheeks: 3 / 3 acorns. Skills that say Eat eat them; full: the next one bonks off his head, wasted. Eat one first.', 'the chip at 3 / 3');
    t.eq(cs.desc({ stacks: 4, data: { cap: 4 } }), 'Cheeks: 4 / 4 acorns. Skills that say Eat eat them; full: the next one bonks off his head, wasted. Eat one first.', 'the chip at 4 / 4 (Cheeks of Holding)');
    [1, 2, 3].forEach(function (lv) { t.ok(/One lands in your cheeks if there's room \(\+1 acorn\)\.$/.test(desc('gus_tree', lv)), 'The Tree L' + lv + ': "if there\'s room"'); });
    // gus-hole-engulfed-wording: Rooted says Rooted; any other hold says neither (it names no cause he doesn't have)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] });
    let u = Gu();
    const hole = give(u, 'gus_hole', 1);
    Gs().setCheeks(u, 3);
    if (DD.getStatus('a1_engulfed')) {
      A().addStatus(u, 'a1_engulfed', { turns: 1 }, foes()[0]);
      if (A().cantMove(u) && !A().hasStatus(u, 'root')) t.eq(DD.Combat.canUse(u, hole), 'Can\'t move right now. Even the roots won\'t take you.', 'Engulfed: no "Rooted."');
      else t.log('a1_engulfed did not hold him here: the wording check is skipped');
    } else t.log('act-1 content not loaded (isolated run): the Engulfed wording is checked in the full run');
    // gus-crate-stress-heal: the AI's quick pass prices no stress heal on an object either (the exact pass dry-runs it)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 3, hpMult: 5 }], objects: [{ x: 5, y: 4, id: 'crate' }] });
    u = Gu();
    u.hp = 10;
    Gs().setCheeks(u, 3);
    const rcs = give(u, 'gus_root_canal', 1);
    const octx = DD.Targeting.buildCtx(u, rcs, { x: 5, y: 4 }), fctx = DD.Targeting.buildCtx(u, rcs, { x: 2, y: 3 });
    t.ok(!!octx.targetObj && Gs().stressQuick(octx) === 0 && Gs().stressQuick(fctx) > 0, 'stressQuick: 0 aimed at the crate, > 0 at the grunt next to him');
    // voice-1: Root Canal's log puts no pronoun after the foe's name
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 5 }] });
    u = Gu();
    Gs().setCheeks(u, 3);
    const rl = logged(/Roots burst up/, function () { use(t, u, give(u, 'gus_root_canal', 1), 4, 4, 'Root Canal'); });
    t.eq(rl[0], 'Roots burst up under Test Grunt. No proper biting for a while.', 'the log line: no "It" after the name');
    // gus-gold-crumbs: eating throws brown crumbs and dark leaves, never the coins kind
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    u = Gu();
    Gs().setCheeks(u, 3);
    const kinds = [], pt = DD.FX.particles;
    try {
      DD.FX.particles = function (where, o) { if (where === u) kinds.push((o && o.kind) + ':' + (o && o.color)); return pt.apply(this, arguments); };
      use(t, u, give(u, 'gus_root_canal', 1), 3, 4, 'an eat');
      u.ap = 3;
      use(t, u, give(u, 'gus_binge', 1), u.x, u.y, 'All You Can Eat');
    } finally { DD.FX.particles = pt; }
    t.ok(kinds.length > 0 && kinds.every(function (k) { return k.indexOf('coins:') !== 0; }) && kinds.indexOf('dust:#8a5a2b') >= 0, 'crumbs: ' + kinds.join(', '));
    // voice-4: his swap openers are his own (no other hero's swap line opens the same way; not Betty's "coming through")
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
    t.ok(!/coming through|scoot over|after you/i.test(h.barks.swap.join(' ')), 'no "coming through", "Scoot over" or "After you"');
    // voice-9: "fat" only inside his own quoted words
    const fl = DD.getItem('gus_winter_coat').flavor;
    t.ok(/^"[^"]*\bfat\b[^"]*"/.test(fl) && !/\bfat\b/.test(fl.replace(/"[^"]*"/g, '')), 'the Winter Coat\'s "fat" is in his quote: ' + fl);
    // gus-sprite-tells-hidden: the teeth and the cheek-full acorn draw with a thin edge (never the default 1.9 stroke over
    // their fill), and the cheek grows past the head's edge from the first acorn
    if (!DD.Sprites) { t.log('no DD.Sprites: the sprite checks are skipped'); return; }
    const real = Gs().GUS_SPRITE, P = real.palette, calls = [];
    let lwIn = null, lwOut = null;
    const spy = Object.assign({}, real, { draw: function (g, tt, o) {
      const el = g.ellipse, rc = g.rect;
      lwIn = g.lw;
      g.ellipse = function (x, y, rx, ry, fill, stroke) { calls.push({ k: 'ellipse', x: x, y: y, rx: rx, fill: fill, stroke: stroke, lw: g.lw }); return el.apply(g, arguments); };
      g.rect = function (x, y, w, hh, fill, stroke) { calls.push({ k: 'rect', w: w, h: hh, fill: fill, stroke: stroke, lw: g.lw }); return rc.apply(g, arguments); };
      try { return real.draw(g, tt, o); } finally { lwOut = g.lw; delete g.ellipse; delete g.rect; }
    } });
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 140;
    const drawAt = function (k, pose) {
      calls.length = 0;
      const fake = { id: 'gus_fake', defId: HERO, kind: 'hero', statuses: k ? [{ id: 'gus_cheeks', stacks: k, data: { cap: 3 } }] : [], items: [], vis: {} };
      DD.Sprites.draw(cv.getContext('2d'), spy, 80, 120, 2, { pose: pose || 'idle', t: 1.3, facing: 1, unit: fake, still: true });
      return calls.filter(function (c) { return c.k === 'ellipse' && c.fill === P.cheek; })[0] || { rx: 0 };
    };
    const r0 = drawAt(0).rx, r1 = drawAt(1).rx, r2 = drawAt(2).rx;
    // the head circle sits at (7, -26) with r 9; the near cheek at (11, -21.5), 6.02 from its centre: it shows past the
    // head's edge (and its 1.9 outline) only when R clears about 3 + 1
    t.ok(r0 < 3 && r1 >= 4.5 && r2 - r1 >= 1.2, 'cheek radius at 0 / 1 / 2 acorns: ' + r0 + ' / ' + r1 + ' / ' + r2 + ' (1 already clears the head)');
    ['idle', 'attack'].forEach(function (pose) {
      drawAt(3, pose);
      const teeth = calls.filter(function (c) { return c.k === 'rect' && c.fill === P.tooth; });
      const nut = calls.filter(function (c) { return c.k === 'ellipse' && c.fill === P.nut && c.y > -21 && c.y < -18; });
      t.ok(teeth.length === 2 && teeth.every(function (c) { return c.lw <= 0.6 && c.w >= 1.5; }), pose + ': two teeth, 1.5+ wide, thin-edged (lw ' + teeth.map(function (c) { return c.lw; }).join(', ') + ')');
      t.ok(nut.length === 1 && nut[0].lw <= 0.6, pose + ': at the cap the acorn in his teeth shows (thin-edged)');
      t.eq(lwOut, lwIn, pose + ': the painter\'s line width is restored');
    });
    drawAt(2);
    t.eq(calls.filter(function (c) { return c.k === 'ellipse' && c.fill === P.nut && c.y > -21 && c.y < -18; }).length, 0, 'below the cap: no acorn in his teeth');
  });

  // ---- fix:polish (Nov 21): gus-passive-live-numbers --------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: polish — the passive\'s liveDesc prints his live numbers (Cheeks of Holding 4 / 2, the Winter Coat 5) where a hero is known; desc stays the base text', function (t) {
    if (!ready(t)) return;
    const pv = DD.getHero(HERO).passive;
    const text = function (cap, start, heal) {
      return 'An acorn falls into Phat Gus\'s cheeks at the start of each of his turns (they hold ' + cap + '; he starts with ' + start +
        '). Stress eating: once per turn, if a foe is next to him after he eats, he heals ' + heal + ' HP.';
    };
    t.ok(typeof pv.liveDesc === 'function', 'the passive has a liveDesc');
    t.eq(pv.desc, text(3, 1, 3), 'desc: the base text (party select, the Hall, recruit)');
    t.eq(pv.liveDesc(null), text(3, 1, 3), 'liveDesc(null): the base text');
    // RunHeroes (the party sheet) and combat units (the HUD), with and without his items
    [[[], [3, 1, 3]], [['gus_cheeks_of_holding'], [4, 2, 3]], [['gus_winter_coat'], [3, 1, 5]], [['gus_cheeks_of_holding', 'gus_winter_coat'], [4, 2, 5]]].forEach(function (c) {
      const rh = DD.Combat.makeRunHero({ id: HERO, items: c[0] });
      const want = text(c[1][0], c[1][1], c[1][2]);
      t.eq(pv.liveDesc(rh), want, 'RunHero with [' + c[0].join(', ') + ']: ' + c[1].join(' / '));
      if (DD.UI && typeof DD.UI.passiveText === 'function') t.eq(DD.UI.passiveText(pv, rh), want, 'DD.UI.passiveText reads it for the RunHero');
      fight({ heroes: [{ x: 2, y: 4, items: c[0] }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
      const u = Gu();
      t.eq(pv.liveDesc(u), want, 'combat unit with [' + c[0].join(', ') + ']');
      // desc == execute: the numbers it prints are the ones the rules use
      t.ok(Gs().capOf(u) === c[1][0] && Gs().startOf(u) === c[1][1] && Gs().stressOf(u) === c[1][2], 'and the rules agree (cap ' + Gs().capOf(u) +
        ', start ' + Gs().startOf(u) + ', stress ' + Gs().stressOf(u) + ')');
    });
    // the heal it prints is the heal he gets, through the HUD's own text path
    fight({ heroes: [{ x: 2, y: 4, items: ['gus_winter_coat'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }] });
    const u = Gu();
    u.hp = 10;
    Gs().setCheeks(u, 3);
    const calls = healCalls(function () { use(t, u, give(u, 'gus_root_canal', 1), 3, 4, 'Root Canal next to a grunt, Winter Coat on'); });
    const shown = DD.UI && DD.UI.passiveText ? DD.UI.passiveText(pv, u) : pv.liveDesc(u);
    t.ok(lifts(calls).length === 1 && u.hp === 15 && /he heals 5 HP\.$/.test(shown), 'the text says 5 and he heals 5 (' + u.hp + ')');
    t.ok(pure(function () { pv.liveDesc(u); pv.liveDesc(DD.Combat.makeRunHero({ id: HERO })); }), 'liveDesc is pure (no bookkeeping created or changed)');
    function pure(fn) {
      const before = JSON.stringify(u.data || {}) + '|' + Gs().cheeks(u);
      fn();
      return before === JSON.stringify(u.data || {}) + '|' + Gs().cheeks(u);
    }
  });

  // ---- 23. zz sim -------------------------------------------------------------------------------------------------------------------------------------------------------
  T.suite('hero_gus: zz balance sim (sim=1 only)', function (t) {
    if (t.param('sim', '0') !== '1') { t.skip('sim=1 only'); return; }
    if (!ready(t) || !DD.Encounter) return;
    const runs = Math.max(1, +t.param('n', 2) || 2);
    const encs = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; })
      .filter(function (e) { return !/^(test_|mgt_|mg_)/.test(e.id) && e.kind !== 'boss' && e.act >= 1 && e.act <= 3 && !e.gauntlet && !e.finale; });
    const pool = Object.keys(DD.defs.heroes).filter(function (k) { return k.indexOf('test_') !== 0 && k !== HERO; });
    const rng = DD.RNG('gus-sim:' + t.seed);
    const tally = {}, uses = {}, sockets = {};
    let fights = 0, wins = 0, eaten = 0, bonks = 0, confused = 0, nomicon = 0, taken = 0, downs = 0, stress = 0, stressHp = 0;
    const offLog = DD.Events.on('combat:log', function (e) { if (/bonks .* on the head/.test(String((e && e.text) || ''))) bonks++; });
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
      A().addRule({ id: 'gus_sim_probe', name: 'probe', silent: true, hooks: {
        onSkillUsed: function (ctx) { if (!A().simulating && ctx.user && ctx.user.defId === HERO && ctx.skill && !ctx.opportunity) uses[ctx.skill.id] = (uses[ctx.skill.id] || 0) + 1; },
        onCostPaid: function (p) { if (!A().simulating && p && p.unit && p.unit.defId === HERO && p.gusAte > 0) eaten += p.gusAte; },
        onStatusApplied: function (unit, s2, src) { if (!A().simulating && s2 && s2.id === 'confused' && src && src.defId === HERO) confused++; },
        onTakeDamage: function (d) {
          if (A().simulating || !d) return;
          if ((d.tags || []).indexOf('nomicon') >= 0) nomicon += d.dealt || 0;
          if (d.target && d.target.defId === HERO) taken += d.dealt || 0;
        },
      } });
      let res = null;
      const calls = healCalls(function () { res = DD.AutoPlay.runBattle(30); });
      A().removeRule('gus_sim_probe');
      lifts(calls).forEach(function (x) { stress++; stressHp += x.healed || 0; });
      const s = DD.Combat.state;
      fights++;
      if (res && res.result === 'victory') wins++;
      s.units.filter(function (u) { return u.kind === 'hero'; }).forEach(function (u) {
        const r = tally[u.defId] || (tally[u.defId] = { fights: 0, dmg: 0, kills: 0, downs: 0 });
        const us = s.stats.units[u.id] || {};
        r.fights++; r.dmg += us.dmg || 0; r.kills += us.kills || 0; r.downs += u.downed ? 1 : 0;
        if (u.defId === HERO && u.downed) downs++;
      });
    }
    try {
      encs.forEach(function (enc) { for (let i = 0; i < runs; i++) oneFight(enc); });
    } finally { offLog(); }
    const f = Math.max(1, fights);
    Object.keys(tally).sort().forEach(function (id) {
      const r = tally[id];
      t.log(id + ': ' + r.fights + ' fights · dmg/fight ' + (r.dmg / r.fights).toFixed(1) + ' · kills/fight ' + (r.kills / r.fights).toFixed(2) + ' · downed ' + r.downs);
    });
    t.log('Phat Gus uses per fight when socketed: ' + POOL.filter(function (id) { return sockets[id]; }).map(function (id) {
      return DD.getSkill(id).name + ' ' + ((uses[id] || 0) / sockets[id]).toFixed(2) + ' (' + sockets[id] + ')';
    }).join(' · '));
    t.log('basics: Incisor ' + (uses.gus_incisor || 0) + ' · The Acorn That Should Not Be ' + (uses.gus_acorn || 0));
    t.log('per fight: acorns eaten ' + (eaten / f).toFixed(2) + ' · bonks ' + (bonks / f).toFixed(2) + ' · stress heals ' + (stress / f).toFixed(2) + ' (' + (stressHp / f).toFixed(1) +
      ' HP) · foes Confused ' + (confused / f).toFixed(2) + ' · Nomicon damage ' + (nomicon / f).toFixed(2));
    t.log('Phat Gus: damage taken ' + (taken / f).toFixed(1) + '/fight · downed ' + downs + ' · fights ' + fights + ', wins ' + wins);
    t.ok(fights > 0, 'simulated');
  });


  // ---- 24. review:phat-gus (h19): the real Echo Chamber path, a sleeper and a charmed foe in his face, the HUD -----------
  T.suite('hero_gus: review (h19) — Echo Chamber at 100% on every eater (paid once, one heal at most, exact previews), a sleeper and a Heckled foe next to him, the HUD\'s ⛔ lines and the one-acorn chip', function (t) {
    if (!ready(t)) return;
    // Echo Chamber's own onSkillUsed path (not a hand-made resolve): the echo eats nothing, never stress-eats twice
    if (DD.getPassive && DD.getPassive('rp_echo_chamber') && DD.passiveInstance) {
      let ran = 0;
      EATERS.concat(['gus_have_one', 'gus_tree']).forEach(function (id) {
        [1, 3].forEach(function (lv) {
          fight({ heroes: [{ x: 4, y: 4, items: ['gus_nomnomicon'] }, { id: 'test_knight', x: 4, y: 6 }],
            enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 6 }, { id: 'test_brute', x: 4, y: 3, hpMult: 3 }, { id: 'test_grunt', x: 6, y: 6, hpMult: 6 }] });
          const u = Gu();
          const inst = DD.passiveInstance({ id: 'rp_echo_chamber', level: 1 });
          inst.L = { pct: 100 };   // the instance's own copy: always echoes, no RNG
          u.passives = [inst];
          const sl = give(u, id, lv);
          Gs().setCheeks(u, 3);
          u.hp = 14;
          const tg = DD.Targeting.validTargets(u, sl).filter(function (q) { return !q.obj; });
          const p = id === 'gus_hole' ? tg.filter(function (q) { return Gs().adjacentFoesAt(u, q).length; })[0] : tg[0];
          if (!p) return;   // Fine, Have One I reaches 1 tile: the knight stands 2 away
          let cl = [];
          const pay = payments(function () { cl = healCalls(function () { previewMatches(t, u, sl, p.x, p.y, 'echoed ' + id + ' L' + lv); }); });
          const eat = id === 'gus_binge' ? 3 : id === 'gus_hollow' ? 2 : id === 'gus_tree' ? -1 : 1;
          t.ok(pay.length === 1 && n(u) === Math.min(3, 3 - eat), 'echoed ' + id + ' L' + lv + ': paid once (' + pay.length + '), cheeks 3 → ' + n(u));
          t.ok(lifts(cl).length <= 1, 'echoed ' + id + ' L' + lv + ': at most one stress heal (' + lifts(cl).length + ')');
          ran++;
        });
      });
      t.ok(ran >= 12, ran + ' echoed uses checked');
    } else t.log('passives.js not loaded: the Echo Chamber check is skipped');
    // Syllamin's Lullaby: a sleeping foe next to him is still a foe in his face; the Nomicon never wakes it. Heckle: a
    // charmed foe is on loan (no heal)
    if (DD.getHero('syllamin') && DD.getSkill('syl_lullaby') && DD.getSkill('syl_heckle')) {
      fight({ heroes: [{ id: 'syllamin', x: 2, y: 1, skills: ['syl_lullaby', 'syl_heckle'] }, { x: 2, y: 4, items: ['gus_nomnomicon'] }], order: ['syllamin'],
        enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 2, y: 7, hpMult: 5 }] });
      const sy = hero('syllamin'), u = Gu(), g = at(3, 4), low = at(2, 7);
      t.ok(DD.Combat.current() === sy, 'Syllamin acts first');
      use(t, sy, sy.skills[0], 3, 3, 'Lullaby on the grunt next to Gus');
      t.ok(has(g, 'sleep'), 'the grunt next to him sleeps');
      toHisTurn(u);
      u.hp = 10;
      Gs().setCheeks(u, 2);
      const g0 = g.hp, l0 = low.hp;
      let cl = healCalls(function () { use(t, u, give(u, 'gus_root_canal', 1), 2, 7, 'Root Canal at a far grunt, a sleeper next to him'); });
      t.ok(lifts(cl).length === 1 && u.hp === 13, 'a sleeping foe next to him is still in his face: +3');
      t.ok(g.hp === g0 && has(g, 'sleep'), 'the Nomicon leaves the sleeper asleep');
      t.eq(l0 - low.hp, Math.round(5 * 1.1) + Math.round(2 * 1.1), 'the recipe goes to the nearest awake foe within 3 (the roots\' own target): 6 + 2');
      toHisTurn(sy);
      sy.skills[1].cd = 0;
      A().removeStatus(g, 'sleep');
      use(t, sy, sy.skills[1], 3, 4, 'Heckle the grunt next to Gus');
      if (has(g, 'charmed')) {
        toHisTurn(u);
        if (has(g, 'charmed')) {
          u.hp = 10;
          Gs().setCheeks(u, 2);
          cl = healCalls(function () { use(t, u, give(u, 'gus_root_canal', 1), 5, 4, 'Root Canal, a Heckled grunt next to him'); });
          t.ok(lifts(cl).length === 0 && u.hp === 10, 'a Heckled (charmed) foe next to him is on loan: no heal');
        } else t.log('the charm wore off before his turn: the loan check is skipped');
      } else t.log('Heckle did not charm (it died?): the loan check is skipped');
    } else t.log('syllamin.js not loaded: the Lullaby / Heckle checks are skipped');
    // the HUD (DD.HUD, the real button path): an eater he can't pay for is greyed with its exact ⛔ line; Hangry lights up
    // only at 0; one acorn prints "1" on the chip (showStacks)
    if (DD.UI && DD.UI.screens && DD.UI.screens.combat && DD.HUD && DD.Render && DD.Render.overlay) {
      try {
        DD.UI.closeAllModals('test');
        DD.Combat.sandbox({ w: 8, h: 8, seed: 11, theme: 'cellar', heroes: [{ id: HERO, x: 2, y: 4, skills: ['gus_root_canal', 'gus_hollow', 'gus_hangry'] }],
          enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
        DD.UI.show('combat');
        const u = Gu();
        const btn = function (nm) {
          return Array.prototype.slice.call(DD.HUD.root().querySelectorAll('.hud-bar .hud-skill')).filter(function (b) { return b.querySelector('.hs-name') && b.querySelector('.hs-name').textContent === nm; })[0];
        };
        const tipOf = function (node) { const c = node && node._ddTip ? node._ddTip.content : null; return typeof c === 'function' ? c(node) : c || ''; };
        Gs().setCheeks(u, 0);
        DD.HUD.refresh();
        const rc = btn('Root Canal'), hg = btn('Hangry');
        t.ok(!!rc && rc.classList.contains('is-disabled') && /⛔ Needs 1 acorn \(his cheeks hold 0\)\./.test(tipOf(rc)), 'HUD at 0: Root Canal greyed, "⛔ Needs 1 acorn (his cheeks hold 0)."');
        t.ok(!!hg && !hg.classList.contains('is-disabled'), 'HUD at 0: Hangry lights up');
        Gs().setCheeks(u, 1);
        DD.HUD.refresh();
        const ho = btn('The Hollow Hungers');
        t.ok(!!ho && ho.classList.contains('is-disabled') && /⛔ Needs 2 acorns \(his cheeks hold 1\)\./.test(tipOf(ho)), 'HUD at 1: the Hollow greyed with its shortfall');
        // (the tooltip is HTML: the apostrophe of "aren't" comes escaped)
        t.ok(btn('Hangry').classList.contains('is-disabled') && /⛔ Not hangry yet: his cheeks aren(?:'|&#39;|&#x27;)t empty\./.test(tipOf(btn('Hangry'))), 'HUD at 1: Hangry greyed, "⛔ Not hangry yet: his cheeks aren\'t empty."');
        t.ok(!btn('Root Canal').classList.contains('is-disabled'), 'HUD at 1: Root Canal ready');
        const chip = DD.UI.statusChip(A().getStatus(u, 'gus_cheeks'));
        t.ok(!!chip && /\b1\b/.test(chip.textContent || ''), 'one acorn: the chip prints "1" (' + (chip && chip.textContent) + ')');
      } finally { DD.UI.closeAllModals('test'); DD.UI.hideTooltip(); if (DD.UI.current === 'combat') DD.UI.show('title'); }
    } else t.log('no combat HUD loaded: the HUD check is skipped');
  });

  // ---- 25. review:phat-gus (h19): a rules watcher over AutoPlay battles with shipped parties (sim=1 only) -----------------
  T.suite('hero_gus: zz rules watcher (sim=1 only) — AutoPlay battles with shipped parties: every paid use, turn start and heal checked against his rules', function (t) {
    if (t.param('sim', '0') !== '1') { t.skip('sim=1 only'); return; }
    if (!ready(t) || !DD.Encounter) return;
    const issues = [];
    /** Wraps every real (not simulated) paid use of his and every DD.Act.heal while fn runs; returns the tallies. */
    function watch(fn) {
      const oR = DD.Combat.resolveSkill, oH = DD.Act.heal;
      // fix:polish (Nov 21): "once per turn" is the heal itself: a 0-HP call (full HP) leaves the turn's heal unused, and
      // after a call that healed nothing more that turn
      const healedTurn = {}, calls = {};
      const stat = { ate: 0, lifts: 0, liftHp: 0, turnStarts: 0, bonks: 0, dispels: 0 };
      DD.Act.heal = function (src, target, k, opts) {
        const r = oH.apply(this, arguments);
        if (DD.Act.simulating) return r;
        const via = opts && opts.via;
        if (via === 'lift:gus') {
          stat.lifts++; stat.liftHp += r || 0;
          if (!src || target !== src || src.defId !== HERO) issues.push('lift:gus on another unit');
          else {
            if (!Gs().adjacentFoesAt(src).length) issues.push('lift:gus with no foe next to him');
            if (healedTurn[src.id] === DD.Combat.state.turn) issues.push('lift:gus after the turn\'s heal');
            if (r > 0) healedTurn[src.id] = DD.Combat.state.turn;
            calls[src.id] = (calls[src.id] || 0) + 1;
            if (k !== Gs().stressOf(src)) issues.push('lift:gus asked ' + k);
          }
        } else if (src && src.defId === HERO && src.kind === 'hero') issues.push('a heal from his kit via ' + via);
        return r;
      };
      DD.Combat.resolveSkill = function (unit, ref, target, opts) {
        if (DD.Act.simulating || !unit || unit.defId !== HERO || !opts || !opts.pay || opts.consumable) return oR.apply(this, arguments);
        const r = DD.Targeting.resolve(ref), def = r && r.def;
        if (!def) return oR.apply(this, arguments);
        const before = n(unit), cap = Gs().capOf(unit), L = DD.skillLevel(def, r.level);
        const cost = def.owner !== HERO ? 0 : def.eatsAll ? before : Math.min(before, L.acorns | 0);
        const turn = DD.Combat.state.turn, stressed = healedTurn[unit.id] === turn, c0 = calls[unit.id] || 0;
        const pockets = JSON.stringify(DD.Combat.consumables());
        const ret = oR.apply(this, arguments);
        const after = n(unit);
        if (!unit.downed && !unit.dead) {
          const want = def.id === 'gus_tree' ? (ret && ret.objectHit ? before : Math.min(cap, before + 1)) : def.id === 'gus_acorn' ? cap : before - cost;
          if (after !== want) issues.push(def.id + ': cheeks ' + before + ' → ' + after + ' (want ' + want + ')');
        }
        if (after > cap) issues.push('cheeks over the cap');
        const ate = def.shares ? 0 : cost;
        stat.ate += ate;
        const fired = (calls[unit.id] || 0) > c0;
        // (an eater aimed at an object eats and nothing rides on it: no call, the turn's heal stays unused; DESIGN D4)
        if (ate > 0 && !stressed && !fired && !unit.downed && !(ret && ret.objectHit) && Gs().adjacentFoesAt(unit).length) {
          issues.push(def.id + ': ate ' + ate + ' with a foe next to him and the turn\'s heal unused, no stress heal call');
        }
        if (ate === 0 && fired) issues.push(def.id + ': a stress heal without eating');
        if (JSON.stringify(DD.Combat.consumables()) !== pockets) issues.push(def.id + ': the party\'s pockets changed');
        return ret;
      };
      const lastEnd = {};
      A().addRule({ id: 'gus_rules_watch', name: 'Gus rules watcher', silent: true, hooks: {
        onTurnEnd: function (x) { if (!A().simulating && x && x.defId === HERO) lastEnd[x.id] = n(x); },
        onTurnStart: function (x) {
          if (A().simulating || !x || x.defId !== HERO) return;
          stat.turnStarts++;
          if (lastEnd[x.id] === undefined) return;
          if (lastEnd[x.id] >= Gs().capOf(x)) stat.bonks++;
          const want = Math.min(Gs().capOf(x), lastEnd[x.id] + 1);
          if (n(x) !== want && !x.downed) issues.push('turn start: ' + lastEnd[x.id] + ' → ' + n(x) + ' (want ' + want + ')');
        },
        onDowned: function (x) { if (x && x.defId === HERO) delete lastEnd[x.id]; },
        // a dispel off his turn (the Rules Lawyer's OVERRULED!) confiscates the acorns: the next drop starts from 0
        onStatusRemoved: function (x, inst, reason) {
          if (A().simulating || !x || x.defId !== HERO || !inst || inst.id !== 'gus_cheeks' || DD.Combat.current() === x) return;
          if (reason === 'cleansed') stat.dispels++;
          if (lastEnd[x.id] !== undefined) lastEnd[x.id] = 0;
        },
      } });
      try { fn(); } finally { DD.Combat.resolveSkill = oR; DD.Act.heal = oH; A().removeRule('gus_rules_watch'); }
      return stat;
    }
    const encs = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; })
      .filter(function (e) { return !/^(test_|mgt_|mg_)/.test(e.id) && e.act >= 1 && e.act <= 3 && !e.gauntlet && !e.finale; });
    const PARTIES = [[HERO, 'betty', 'syllamin', 'josiah'], [HERO, 'corelos', 'slate', 'hjalmar'], [HERO, 'kiri', 'marwyn', 'ellaria']];
    const ITEMSETS = [[], ['gus_winter_coat'], ['gus_cheeks_of_holding'], ['gus_nomnomicon', 'gus_winter_coat']];
    const runs = Math.max(1, +t.param('n', 2) || 2);
    const rng = DD.RNG('gus-watch:' + t.seed);
    let fights = 0;
    PARTIES.forEach(function (ids, pi) {
      if (!ids.every(function (id) { return !!DD.getHero(id); })) { t.log('party ' + ids.join(',') + ' not loaded'); return; }
      const tot = { fights: 0, wins: 0, ate: 0, lifts: 0, liftHp: 0, turns: 0, bonks: 0, dispels: 0, problems: 0, timeouts: 0 };
      for (let i = 0; i < 4 * runs; i++) {
        const enc = encs[rng.int(0, encs.length - 1)];
        const lvl = enc.act === 1 ? 2 : enc.act === 2 ? 4 : 6;
        const party = ids.map(function (id) {
          const h = DD.getHero(id);
          const extra = (h.skillPool || []).filter(function (sid) { return h.startingSkills.indexOf(sid) < 0; });
          const sl = Math.min(3, 1 + Math.floor((lvl - 1) / 2));
          return DD.Combat.makeRunHero({ id: id, level: lvl, items: id === HERO ? ITEMSETS[(pi + i) % 4] : [],
            skills: h.startingSkills.concat(rng.sample(extra, 2)).map(function (sid) { return { id: sid, level: sl }; }) });
        });
        const setup = DD.safe('build ' + enc.id, DD.Encounter.build, DD.Encounter, [enc, party, { rng: DD.RNG(rng.int(1, 1e9)), difficulty: 'normal', act: enc.act }]);
        if (!setup || !setup.grid) continue;
        DD.Combat.start(setup, { seed: rng.int(1, 1e9), headless: true, difficulty: 'normal', kind: enc.kind });
        const p0 = DD.problems.length, gu = Gu();
        if (gu && !gu.downed && n(gu) !== Gs().startOf(gu)) issues.push('combat start: ' + n(gu) + ' acorns');
        let res = null;
        const st = watch(function () { res = DD.AutoPlay.runBattle(30); });
        tot.fights++; fights++;
        if (res && res.result === 'victory') tot.wins++;
        if (res && res.timeout) tot.timeouts++;
        ['ate', 'lifts', 'liftHp', 'bonks', 'dispels'].forEach(function (k) { tot[k] += st[k]; });
        tot.turns += st.turnStarts;
        tot.problems += DD.problems.length - p0;
      }
      const f = Math.max(1, tot.fights);
      t.log(ids.join(',') + ': ' + tot.fights + ' fights, ' + tot.wins + ' won, ' + tot.timeouts + ' timeouts · per fight: acorns eaten ' + (tot.ate / f).toFixed(2) +
        ' · lift:gus ' + (tot.lifts / f).toFixed(2) + ' fires, ' + (tot.liftHp / f).toFixed(1) + ' HP · bonks ' + (tot.bonks / f).toFixed(2) + ' · dispels ' + tot.dispels +
        ' · his turns ' + tot.turns + ' · problems ' + tot.problems);
      t.eq(tot.problems, 0, ids.join(',') + ': no warnings or swallowed errors');
    });
    t.eq(issues.slice(0, 12).join(' || '), '', 'no rule of his broken in ' + fights + ' AutoPlay battles (' + issues.length + ')');
  });
})();
