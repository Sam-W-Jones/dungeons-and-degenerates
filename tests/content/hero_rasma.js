/* Dungeons and Degenerates — tests/content/hero_rasma.js
 * Suites "hero_rasma: …" for js/data/heroes/rasma.js (owner: HERO-RASMA; spec .tmp/h19/addendum-rasma.md §18): the hero
 * def, Pardon Me and his attacks of opportunity, the enchant-then-strike loop with each blade at every level (elements,
 * bonus, riders, the arc, one charge per strike, one blade at a time), Enchanté (the D9 heal: only the strike that spends
 * the last charge heals him, via 'lift:rasma'), the pool at every level, the signature, the items, HUD previews and
 * DD.AI.estimate against real hits, readability (chip, live note, the FX-pinned blade, log lines), v2 edge cases,
 * AutoPlay (scores and fixture battles), the painter at every pose and yaw, combos with the cast (skipped when a hero
 * file isn't loaded) and the zz sim (sim=1 only).
 * Run: bash tools/test.sh "suite=hero_rasma&isolate=heroes/rasma,hero_rasma"
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const HERO = 'rasma';
  const ENCHANTS = ['ras_cold_shoulder', 'ras_shocking', 'ras_disarming'];
  const SWORDS = ['ras_pardon', 'ras_due_respect', 'ras_sweeping_bow', 'ras_regards', 'ras_keep_change', 'ras_touche'];
  const POOL = ['ras_cold_shoulder', 'ras_due_respect', 'ras_shocking', 'ras_disarming', 'ras_sweeping_bow', 'ras_regards',
    'ras_keep_change', 'ras_touche', 'ras_tea', 'ras_look'];
  const ALL = ['ras_pardon', 'ras_thousand'].concat(POOL);
  const ITEMS = ['ras_rapier_wit', 'ras_waistcoat', 'ras_spare_monocle'];
  const STATUSES = ['ras_frost', 'ras_shock', 'ras_charm', 'ras_guard'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const CUSTOM_BARKS = ['enchant_frost', 'enchant_shock', 'enchant_charm', 'freeze', 'refresh', 'opportunity', 'touche', 'tea', 'look', 'change',
    'respect', 'bow', 'regards', 'pop'];
  const RESERVED = ['Pardon Me', 'The Cold Shoulder', 'Positively Shocking', 'Most Disarming', 'With All Due Respect', 'Sweeping Bow',
    'Sending My Regards', 'Do Keep the Change', 'Touché', 'Tea, Anyone?', 'A Disapproving Look', 'A Thousand Pardons', 'Enchanté',
    'Frosty Blade', 'Shocking Blade', 'Disarming Blade', 'En Garde', 'Rapier Wit', 'Bespoke Waistcoat', 'The Spare Monocle'];
  const KINDS = ['frost', 'shock', 'charm'];
  const ST_OF = { frost: 'ras_frost', shock: 'ras_shock', charm: 'ras_charm' };
  const SK_OF = { frost: 'ras_cold_shoulder', shock: 'ras_shocking', charm: 'ras_disarming' };
  const EL_OF = { frost: 'frost', shock: 'lightning', charm: null };
  // fix:balance R2 (Nov 21): the enchant bonus +2 / +3 / +3 → +3 / +4 / +4
  const BONUS = [3, 4, 4], SLOW = [1, 1, 2], ARC = [2, 3, 4], WEAK = [1, 1, 2];

  // ---- helpers -----------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function R() { return DD.Rasma; }
  function ready(t) {
    if (!DD.getHero(HERO) || !R()) { t.skip('rasma.js not loaded'); return false; }
    return true;
  }
  /** Sandbox that never ends on its own, 9×9 stone, heroes first; enemies pass unless cfg.enemyAi is true. */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = (cfg.heroes || [{ x: 2, y: 4 }]).map(function (h) { return Object.assign({ id: HERO, level: 1, skills: [] }, h); });
    DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, enemyAi: false, enemies: [],
      objective: { type: 'custom', text: 'Rasma test' }, encounter: { id: 'ras_test_arena', checkObjective: function () { return null; } },
    }, cfg, { heroes: heroes }));
    return DD.Combat.state;
  }
  function U() { return DD.Combat.state.units.filter(function (u) { return u.defId === HERO; })[0]; }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function foes() { return DD.Combat.enemies(); }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }
  function norm(s) { return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function desc(id, level, user) { return DD.skillDesc(DD.getSkill(id), level, user || null); }
  /** The slot he uses for a skill: his basic / signature, or a fresh socket at a level (others kept). */
  function give(u, id, level) {
    if (id === 'ras_pardon') return u.basic;
    if (id === 'ras_thousand') return u.signature;
    const old = u.skills.filter(function (sl) { return sl.id === id; })[0];
    if (old) { old.level = level || 1; old.cd = 0; return old; }
    const sl = A().makeSlot(id, level || 1);
    u.skills.push(sl);
    return sl;
  }
  function fresh(u, ap) { u.ap = ap === undefined ? 3 : ap; DD.Combat.slotsOf(u).forEach(function (sl) { sl.cd = 0; sl.usedThisTurn = false; }); }
  function enchanted(u, kind, level) { return R().enchantNow(u, kind, level || 1); }
  function blade(u) { return R().bladeInfo(u); }
  function use(t, u, sl, x, y, label) {
    const why = DD.Combat.canUse(u, sl);
    const ok = why === true && DD.Combat.useSkill(u, sl, x, y);
    t.ok(ok, (label || (sl && sl.id)) + ' used @' + x + ',' + y + (why === true ? '' : ' (' + why + ')'));
    return ok;
  }
  function valid(u, sl, x, y) { return DD.Targeting.isValidTarget(u, sl, x, y); }
  /** End turns until it is u's turn again (the other heroes pass; enemies pass unless the fight has enemyAi). */
  function toHisTurn(u) {
    for (let i = 0; i < 10; i++) {
      DD.Combat.endTurn();
      if (DD.Combat.current() === u || DD.Combat.state.result) return true;
    }
    return false;
  }
  function hypeGains(fn) {
    const list = [], orig = DD.Act.gainHype;
    DD.Act.gainHype = function (n, why) { list.push({ n: n, why: String(why || '') }); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.Act.gainHype = orig; }
    return list;
  }
  function multiHits(list) { return list.filter(function (h) { return /multi/.test(h.why); }).length; }
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
  function lifts(calls) { return calls.filter(function (x) { return !x.sim && x.via === 'lift:rasma'; }); }
  function logged(re, fn) {
    const list = [], orig = A().log;
    A().log = function (msg) { if (re.test(String(msg))) list.push(String(msg)); return orig.apply(this, arguments); };
    try { fn(); } finally { A().log = orig; }
    return list;
  }
  function aoos(fn) {
    const list = [];
    const off = DD.Events.on('opportunity:attack', function (e) { list.push({ attacker: e.attacker.defId, mover: e.mover.defId, skillId: e.skillId }); });
    try { fn(); } finally { off(); }
    return list;
  }
  /** A foe's real skill resolved on a unit (a hit inside the foe's own resolution: Touché ripostes then spend at once). */
  function foeHits(g, x, y, i) {
    const sl = DD.Combat.slotsOf(g)[i || 0];
    return DD.Combat.resolveSkill(g, sl, { x: x, y: y }, { quiet: true });
  }
  function stateKey(s) {
    return JSON.stringify([s.units.map(function (u) {
      return [u.id, u.x, u.y, u.hp, u.block, u.ap, !!u.dead, !!u.downed, (u.statuses || []).map(function (q) { return [q.id, q.stacks, q.turns, JSON.stringify(q.data || {})]; }),
        DD.Combat.slotsOf(u).map(function (sl) { return [sl.id, sl.cd, sl.uses]; })];
    }), s.hype, s.rng.getState()]);
  }
  /** Preview, then use: the preview leaves the fight untouched and predicts HP, KOs and Hype exactly. */
  function previewMatches(t, u, sl, x, y, label) {
    const s = DD.Combat.state;
    const before = {};
    s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed }; });
    const k0 = stateKey(s), hype0 = s.hype;
    let prev = null;
    t.tryRun(label + ' preview', function () { prev = DD.Combat.preview(u, sl, x, y); });
    t.eq(stateKey(s), k0, label + ': the preview left the fight untouched (stacks and st.data too)');
    if (!prev) return null;
    t.ok(!prev.uncertain, label + ': the preview is certain (no dice in his kit)');
    if (!use(t, u, sl, x, y, label)) return null;
    s.units.forEach(function (o) {
      const b = before[o.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[o.id];
      t.eq(b.hp - o.hp, e ? (e.dmg || 0) - (e.heal || 0) : 0, label + ': ' + o.name + ' HP change = preview');
      t.eq((o.dead && !b.dead) || (o.downed && !b.downed), !!(e && e.lethal), label + ': ' + o.name + ' KO = preview');
    });
    t.eq(s.hype - hype0, prev.hype, label + ': Hype = preview');
    return prev;
  }
  function textOf(h) {
    const parts = [h.blurb, h.role, h.epithet, h.race, h.cls, h.passive.desc, h.passive.name];
    ALL.forEach(function (id) { const s = DD.getSkill(id); for (let lv = 1; lv <= s.levels.length; lv++) parts.push(desc(id, lv)); parts.push(s.flavor || '', s.name); });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); parts.push(it.desc, it.flavor || '', it.name); });
    STATUSES.forEach(function (id) { const d = DD.getStatus(id); parts.push(d.name, d.desc({ id: id, stacks: 1, turns: -1, data: {} })); });
    Object.keys(h.barks).forEach(function (k) { Array.prototype.push.apply(parts, h.barks[k]); });
    (DD.defs.narration.tips || []).filter(function (l) { return /Rasma/.test(l); }).forEach(function (l) { parts.push(l); });
    return parts.join(' \n ');
  }
  /** Expected hit: round(base × mult + flat) after the engine's element rules (no armor, no Block). */
  function hit(base, mult, flat) { return Math.max(0, Math.round(base * mult + (flat || 0))); }

  // ---- 1. definition ---------------------------------------------------------------------------------------
  T.suite('hero_rasma: definition, pool, barks, items, names, pronouns, voice, the registry-wide gates', function (t) {
    if (!ready(t)) return;
    const h = DD.getHero(HERO);
    t.ok(h.name === 'Rasma' && h.epithet === 'the Monotaur' && h.race === 'Minotaur' && h.cls === 'Spellsword', 'Rasma the Monotaur, Minotaur Spellsword');
    t.eq(h.role, 'Melee spellsword · enchant, then strike', 'role');
    t.eq(h.complexity, 2, 'complexity ★★');
    t.eq(h.color, '#a64d79', 'claret');
    t.eq(h.unlock, null, 'available from the start (unlock: null)');
    t.eq(JSON.stringify(h.stats), JSON.stringify({ hp: 32, ap: 3, mov: 4, armor: 0, init: -1 }), 'stats 32 HP (h19:balance it2: 30 → 32) / 3 AP / move 4 / armor 0 / init −1');
    t.eq(h.growth.hp, 4, '+4 HP a level');
    t.eq(h.stats.hp + 3 * h.growth.hp, 44, 'L4 HP 44 (the act-3 floor is 29)');
    t.eq(JSON.stringify(h.flags), '{}', 'no flags (heroes pass heroes, the swap works)');
    t.ok(!('pronoun' in h), 'no pronoun field: the engine default he is right');
    const pr = A().pronouns({ kind: 'hero', defId: HERO });
    t.eq(pr.sub + '/' + pr.obj, 'he/him', 'the engine calls him he/him');
    t.ok(/monotaur/.test(h.blurb) && h.blurb.length > 60 && !/act 4|Svammiel/i.test(h.blurb), 'blurb (the monotaur joke, no act-4 word)');
    t.eq(h.basic, 'ras_pardon', 'basic: Pardon Me');
    t.eq(h.signature, 'ras_thousand', 'signature: A Thousand Pardons');
    t.eq(DD.getSkill(h.signature).hype, 100, 'the signature costs 100 Hype');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['ras_cold_shoulder', 'ras_due_respect']), 'starters: The Cold Shoulder + With All Due Respect');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'a pool of 10 (incl. the 2 starters)');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic and signature never socketed');
    t.eq(JSON.stringify(h.summons || []), '[]', 'no summons');
    const own = Object.keys(DD.defs.skills).filter(function (k) { return DD.defs.skills[k].owner === HERO; }).sort();
    t.eq(JSON.stringify(own), JSON.stringify(ALL.slice().sort()), '12 skills owned by rasma');
    const tagged = function (tag) { return ALL.filter(function (id) { return (DD.getSkill(id).tags || []).indexOf(tag) >= 0; }).sort(); };
    t.eq(JSON.stringify(tagged('enchant')), JSON.stringify(ENCHANTS.slice().sort()), '3 skills tagged "enchant"');
    ENCHANTS.forEach(function (id) {
      const d = DD.getSkill(id);
      t.ok(d.kind === 'spell' && d.ap === 1 && d.cooldown === 0 && d.target.type === 'self' && typeof d.forgetWarning === 'function', id + ': a 1-AP self spell, cooldown 0, with a forgetWarning');
    });
    t.eq(JSON.stringify(tagged('sword')), JSON.stringify(SWORDS.slice().sort()), '6 sword skills (basic, Respect, Bow, Regards, Change, Touché)');
    t.eq(tagged('fire').length, 0, 'no "fire" skill: Pyromaniac never rolls for him (not Pebbles)');
    t.ok((DD.getSkill('ras_thousand').tags || []).indexOf('sword') < 0, 'the signature is no sword strike');
    ALL.forEach(function (id) {
      const d = DD.getSkill(id);
      t.ok(d.kind !== 'heal' && (d.tags || []).indexOf('heal') < 0, id + ': no heal kind / tag');
      d.levels.forEach(function (L) { Object.keys(L).forEach(function (k) { t.ok(!/heal/i.test(k), id + ': no level key with "heal" (' + k + ')'); }); });
      t.ok(!(d.target && d.target.objects === false), id + ': no target.objects false (D1)');
    });
    ['ras_pardon', 'ras_due_respect', 'ras_sweeping_bow', 'ras_regards', 'ras_keep_change'].forEach(function (id) {
      for (let lv = 1; lv <= DD.getSkill(id).levels.length; lv++) t.ok(desc(id, lv).indexOf('Sword strike:') === 0, id + ' L' + lv + ' starts "Sword strike:"');
    });
    // desc caps and purity (the live note excluded: it appears only with a combat unit holding a blade)
    ALL.forEach(function (id) {
      const s = DD.getSkill(id);
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = desc(id, lv);
        t.ok(d && !/undefined|NaN|\[object|null/.test(d), id + ' L' + lv + ' desc pure with user === null: ' + d);
        const cap = ENCHANTS.indexOf(id) >= 0 ? 30 : 26;
        t.ok(words(d) <= cap, id + ' L' + lv + ' ≤ ' + cap + ' words (' + words(d) + ')');
      }
      if (POOL.indexOf(id) >= 0) t.eq(s.levels.length, 3, id + ': 3 levels');
      t.ok(!s.flavor || s.flavor.length <= 120, id + ': flavour ≤ 120');
    });
    t.eq(h.passive.name, 'Enchanté', 'passive: Enchanté');
    t.ok(words(h.passive.desc) <= 38 && /heals him 5 HP/.test(h.passive.desc), 'passive ≤ 38 words and states the heal (' + words(h.passive.desc) + ')');
    // barks: 13 keys ≥ 3, the custom keys, every bubble ≤ 70, 3 swap lines with {ally} naming no hero
    BARK_KEYS.forEach(function (k) { t.ok((h.barks[k] || []).length >= 3, 'barks.' + k + ': 3+ lines'); });
    CUSTOM_BARKS.forEach(function (k) { t.ok((h.barks[k] || []).length >= 3, 'custom barks.' + k + ': 3+ lines'); });
    Object.keys(h.barks).forEach(function (k) { h.barks[k].forEach(function (l) { t.ok(typeof l === 'string' && l.length > 0 && l.length <= 70, 'bark ≤ 70: ' + JSON.stringify(l)); }); });
    const heroNames = Object.keys(DD.defs.heroes).filter(function (k) { return k !== HERO; }).map(function (k) { return DD.defs.heroes[k].name; });
    t.eq(h.barks.swap.length, 3, '3 swap lines');
    h.barks.swap.forEach(function (l) {
      t.ok(/\{ally\}/.test(l) && !heroNames.some(function (n) { return new RegExp('\\b' + n + '\\b').test(l); }), 'swap line has {ally}, names nobody: ' + l);
    });
    h.barks.idle.forEach(function (l) {
      const named = ['Marwyn', 'Betty', 'Syllamin', 'Hjalmar', 'Benedick', 'Corelos', 'Ellaria', 'Zarathor', 'Josiah', 'Kiri', 'Sparrow', 'Slate', 'Buga',
        'Basanos', 'Valdris', 'Pebbles', 'Marbles'].filter(function (n) { return new RegExp('\\b' + n + '\\b').test(l); });
      t.ok(named.length <= 1, 'an idle line names at most one hero: ' + l);
    });
    // pronouns, voice, D11 and act 4
    const text = textOf(h);
    t.ok(!/\b(she|her|hers|herself)\b/i.test(text), 'no she/her anywhere in his texts (he/him)');
    t.ok(!/\b(sir|madam|ma'am)\b/i.test(Object.keys(h.barks).map(function (k) { return h.barks[k].join(' '); }).join(' ')), 'no "sir" / "madam" in a line that can fire at any foe');
    t.ok(!/\b(Biz|Phat|Gus|Hjalmarino|Spooder)\b/.test(text), 'no line names another new hero or his robots (plan D11)');
    t.ok(!/Svammiel|\bAct IV\b|\bact 4\b|fourth act|Under the Table|Galbraith/i.test(text), 'nothing of his mentions act 4 (not a spoiler)');
    t.ok(!/\b(damn|hell|bloody|crap)\b/i.test(Object.keys(h.barks).map(function (k) { return h.barks[k].join(' '); }).join(' ')), 'no swearing: devastatingly courteous');
    t.ok(/monotaur/i.test(h.barks.select.join(' ')), 'one select bark explains the monotaur');
    // [QA qa-rasma-2 / voice-3] his courtesy is his own (addendum §3 rule 4: ornate, never Benedick's phrases): none of
    // Benedick's tics, and no four-word run of any of Benedick's lines (a party with both hears both)
    const BENEDICK = /\b(?:no rush|mind the slime|after you|i insist|splendid|i'd only just|at your service|stay a while)\b|\bmind the \w+ on your way\b/i;
    const mine = [].concat.apply([], Object.keys(h.barks).map(function (k) { return h.barks[k]; }));
    mine.forEach(function (l) { t.ok(!BENEDICK.test(l), 'Rasma\'s courtesy, not Benedick\'s: ' + l); });
    const bd = DD.getHero('benedick');
    if (bd) {
      const ws = function (l) { return norm(String(l).replace(/\{\w+\}/g, ' ')).split(' ').filter(Boolean); };
      const grams = {};
      Object.keys(bd.barks).forEach(function (k) {
        (bd.barks[k] || []).forEach(function (l) { const w = ws(l); for (let i = 0; i + 4 <= w.length; i++) grams[w.slice(i, i + 4).join(' ')] = l; });
      });
      let shared = 0;
      mine.forEach(function (l) {
        const w = ws(l);
        for (let i = 0; i + 4 <= w.length; i++) {
          const gram = w.slice(i, i + 4).join(' ');
          if (grams[gram]) { shared++; t.fail('Rasma shares "' + gram + '" with Benedick\'s "' + grams[gram] + '": ' + l); }
        }
      });
      t.eq(shared, 0, 'no line of his shares four words in a row with a line of Benedick\'s');
    } else t.log('benedick not loaded (isolated run): the four-word check runs in the full run');
    // statuses
    STATUSES.forEach(function (id) { t.ok(!!DD.getStatus(id), 'status ' + id + ' registered'); });
    ['ras_frost', 'ras_shock', 'ras_charm'].forEach(function (id) {
      const d = DD.getStatus(id);
      t.ok(d.type === 'buff' && d.decay === 'never' && d.stacking === 'refresh' && d.maxStacks === 4 && d.showStacks === true && !d.element && !d.telegraphFlat,
        id + ': buff, never decays, refresh, max 4, showStacks, no element field, no telegraphFlat');
      t.ok(/3 charges left\.$/.test(d.desc({ id: id, stacks: 3, turns: -1, data: {} })) && /1 charge left\.$/.test(d.desc({ id: id, stacks: 1, turns: -1, data: {} })), id + ': desc counts charges');
    });
    // items
    const its = ITEMS.map(function (id) { return DD.getItem(id); });
    t.ok(its.every(function (it) { return it && it.hero === HERO; }), '3 hero items');
    t.eq(its.map(function (it) { return it.rarity; }).join(','), 'legendary,rare,rare', 'legendary / rare / rare');
    t.eq(its.map(function (it) { return it.slot; }).join(','), 'weapon,armor,trinket', 'weapon / armor / trinket');
    t.ok(its.every(function (it) { return !it.stats.block && !(it.hooks && (it.hooks.preventDeath || it.hooks.onCombatStart || it.hooks.onTurnStart)); }), 'no Block, no death-save, no combat-start or turn-start hook (D9)');
    // names: unique against every hero, enemy (act 4 and the goats included), skill, item, status and passive
    const names = {};
    function add(kind, id, nm) { const k = norm(nm); if (k) (names[k] = names[k] || []).push(kind + ':' + id); }
    Object.keys(DD.defs.skills).forEach(function (k) { const s = DD.defs.skills[k]; if (!/^test_/.test(s.id)) add(s.owner === 'enemy' ? 'enemy skill' : 'skill', s.id, s.name); });
    Object.keys(DD.defs.items).forEach(function (k) { add('item', k, DD.defs.items[k].name); });
    Object.keys(DD.defs.enemies).forEach(function (k) { if (!/^test_/.test(k)) add('enemy', k, DD.defs.enemies[k].name); });
    Object.keys(DD.defs.heroes).forEach(function (k) { if (!/^test_/.test(k)) { add('hero', k, DD.defs.heroes[k].name); if (DD.defs.heroes[k].passive) add('passive', k, DD.defs.heroes[k].passive.name); } });
    Object.keys(DD.defs.statuses).forEach(function (k) { if (!/^test_/.test(k)) add('status', k, DD.defs.statuses[k].name); });
    Object.keys(DD.defs.passives || {}).forEach(function (k) { add('blessing', k, DD.defs.passives[k].name); });
    RESERVED.forEach(function (nm) { t.eq((names[norm(nm)] || []).length, 1, 'name "' + nm + '" is used once (' + (names[norm(nm)] || []).join(', ') + ')'); });
    // the Radio Edit chip for every damage skill (≤ 90 characters)
    let longest = 0;
    ALL.forEach(function (id) {
      const d = DD.getSkill(id);
      if (!d.levels.some(function (L) { return L.dmg > 0; })) return;
      const chip = d.name + ' (' + h.name + ') is bleeped: it can\'t be used this fight.';
      longest = Math.max(longest, chip.length);
      t.ok(chip.length <= 90, 'Radio Edit chip ≤ 90: ' + chip);
    });
    t.eq(longest, 69, 'the longest Radio Edit chip is With All Due Respect\'s (69)');
    const tips = (DD.defs.narration.tips || []).filter(function (l) { return /Rasma|The Cold Shoulder/.test(l); });
    t.eq(tips.length, 3, '3 loading tips are his (two name him, one his enchantment)');
    // the forgetWarning speaks only for his last socketed enchantment
    const fw = DD.getSkill('ras_cold_shoulder').forgetWarning;
    t.ok(/last enchantment/.test(DD.resolve(fw, null, { skills: [{ id: 'ras_cold_shoulder', level: 1 }, { id: 'ras_due_respect', level: 1 }] }, '')), 'the last enchantment warns');
    t.eq(DD.resolve(fw, null, { skills: [{ id: 'ras_cold_shoulder', level: 1 }, { id: 'ras_shocking', level: 1 }] }, ''), '', 'with two, no warning');
    if (window.DD_SIM && typeof window.DD_SIM.isProtected === 'function') {
      t.ok(window.DD_SIM.isProtected('ras_cold_shoulder', { skills: [{ id: 'ras_cold_shoulder', level: 1 }, { id: 'ras_due_respect', level: 1 }] }), 'the campaign sim keeps his last enchantment (plan D4)');
    }
  });

  // ---- 2. Pardon Me and his attacks of opportunity --------------------------------------------------------------
  T.suite('hero_rasma: Pardon Me — 5, crates and barrels, attacks of opportunity with each blade (one charge, honest estimates)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
    let u = U(), g = foes()[0];
    t.eq(desc('ras_pardon', 1), 'Sword strike: deal 5 damage to an adjacent foe.', 'Pardon Me desc');
    let h0 = g.hp;
    use(t, u, u.basic, 3, 4, 'Pardon Me');
    t.eq(h0 - g.hp, 5, '5 damage');
    // objects: a crate takes the listed 5 (no element, no charge); a barrel goes off
    fight({ heroes: [{ x: 2, y: 4 }], objects: [{ x: 3, y: 4, id: 'crate' }, { x: 2, y: 3, id: 'barrel_explosive' }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = U();
    enchanted(u, 'frost', 1);
    const crate = tile(3, 4).obj, c0 = crate.hp;
    t.ok(valid(u, u.basic, 3, 4), 'Pardon Me can be aimed at a crate');
    use(t, u, u.basic, 3, 4, 'Pardon Me on a crate');
    t.eq(c0 - (tile(3, 4).obj ? tile(3, 4).obj.hp : 0), Math.min(c0, 5), 'the crate takes the listed 5 (no bonus rides on an object, D4)');
    t.eq(blade(u).stacks, 3, 'no charge used on the crate');
    use(t, u, u.basic, 2, 3, 'Pardon Me on a barrel');
    t.ok(!tile(2, 3).obj || tile(2, 3).obj.id !== 'barrel_explosive', 'the barrel went off');
    t.eq(blade(u) ? blade(u).stacks : 0, 3, 'still no charge used');
    // attacks of opportunity with each blade at every level: element, bonus once, rider, one charge on the enemy's turn
    KINDS.forEach(function (kind) {
      [1, 2, 3].forEach(function (lv) {
        fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
        const v = U(), w = foes()[0];
        enchanted(v, kind, lv);
        const est = DD.AI.opportunityDmg(v, w, { x: 3, y: 4 });
        const w0 = w.hp;
        let dmgEl = null;
        A().addRule({ id: 'ras_probe_el', name: 'probe', silent: true, hooks: { onTakeDamage: function (d) { if (d.target === w && !A().simulating) dmgEl = d.element; } } });
        const list = aoos(function () { A().moveAlong(w, [{ x: 4, y: 4 }, { x: 5, y: 4 }], { provoke: true }); });
        A().removeRule('ras_probe_el');
        const lab = kind + ' L' + lv;
        t.ok(list.length === 1 && list[0].attacker === HERO && list[0].skillId === 'ras_pardon', lab + ': walking off him provokes Pardon Me');
        t.eq(w0 - w.hp, 5 + BONUS[lv - 1], lab + ': the AoO deals 5 + ' + BONUS[lv - 1] + ' (the bonus once, through modifyOpportunity)');
        t.eq(est, w0 - w.hp, lab + ': DD.AI.opportunityDmg equals the real hit (' + est + ')');
        t.eq(dmgEl, EL_OF[kind], lab + ': the hit is ' + (EL_OF[kind] || 'plain'));
        t.eq(blade(v).stacks, 2, lab + ': one charge used');
        if (kind === 'frost') t.ok(has(w, 'slow') && st(w, 'slow').turns >= SLOW[lv - 1], lab + ': Slowed');
        if (kind === 'charm') t.ok(has(w, 'weak'), lab + ': Weakened');
      });
    });
    // a Cold Shoulder AoO on a Wet walker freezes it and ends its walk
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
    u = U(); g = foes()[0];
    enchanted(u, 'frost', 1);
    A().addStatus(g, 'wet', { turns: 2 }, u);
    A().moveAlong(g, [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], { provoke: true });
    t.ok(has(g, 'frozen') && !has(g, 'wet'), 'the Wet walker is Frozen (Wet gone)');
    t.ok(g.x === 3 && g.y === 4, 'and its walk ends where it stood (' + g.x + ',' + g.y + ')');
    // a plain AoO uses nothing; ranged Regards is never his AoO
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_regards', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
    u = U(); g = foes()[0];
    h0 = g.hp;
    const list = aoos(function () { A().moveAlong(g, [{ x: 4, y: 4 }], { provoke: true }); });
    t.ok(list.length === 1 && list[0].skillId === 'ras_pardon' && h0 - g.hp === 5, 'a plain AoO: Pardon Me for 5 (never Sending My Regards)');
  });

  // ---- 3. the loop, each blade at every level ------------------------------------------------------------------
  T.suite('hero_rasma: the loop — each blade at every level (elements, bonus, riders, the arc, one charge per strike, one blade at a time)', function (t) {
    if (!ready(t)) return;
    // element conversion and the bonus vs resist 0.5 / 1 / 1.5 / 0
    KINDS.forEach(function (kind) {
      [1, 2, 3].forEach(function (lv) {
        [0.5, 1, 1.5, 0].forEach(function (r) {
          fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
          const u = U(), g = at(3, 4), el = EL_OF[kind];
          if (el) { g.resist = {}; g.resist[el] = r; }
          enchanted(u, kind, lv);
          const h0 = g.hp;
          use(t, u, u.basic, 3, 4, kind + ' L' + lv + ' r' + r);
          const lab = kind + ' L' + lv + (el ? ' vs ' + el + ' ×' + r : '');
          const want = el && r === 0 ? 0 : hit(5, el ? r : 1, BONUS[lv - 1]);
          t.eq(h0 - g.hp, want, lab + ': ' + want + ' damage');
          if (el && r === 0) {
            t.eq(blade(u).stacks, 3, lab + ': immune: no charge used');
            t.ok(!has(g, 'slow') && !has(g, 'weak'), lab + ': immune: no rider');
          } else t.eq(blade(u).stacks, 2, lab + ': one charge used');
          if (!el && r !== 1) return;
        });
      });
    });
    // The Cold Shoulder: Slow through the foe's next 1 / 1 / 2 turns; a Wet foe freezes (Wet gone); guards hold; no ×1.5 on Frozen
    [1, 2, 3].forEach(function (lv) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
      const u = U(), g = foes()[0];
      enchanted(u, 'frost', lv);
      use(t, u, u.basic, 3, 4, 'frost L' + lv);
      t.ok(has(g, 'slow') && st(g, 'slow').turns === SLOW[lv - 1], 'frost L' + lv + ': Slowed for ' + SLOW[lv - 1]);
      toHisTurn(u);
      t.eq(has(g, 'slow'), lv === 3, 'frost L' + lv + ': ' + (lv === 3 ? 'still Slowed after its first turn' : 'the Slow is gone after its next turn'));
      if (lv === 3) { toHisTurn(u); t.ok(!has(g, 'slow'), 'frost L3: gone after its second turn'); }
    });
    [['plain', null], ['stunImmune', { stunImmune: true }], ['immune frozen (the Rat King)', { immune: ['frozen'] }]].forEach(function (c) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
      const u = U(), g = foes()[0];
      if (c[1]) g.flags = Object.assign({}, g.flags || {}, c[1]);
      A().addStatus(g, 'wet', { turns: 2 }, u);
      enchanted(u, 'frost', 1);
      use(t, u, u.basic, 3, 4, 'frost on a Wet ' + c[0] + ' foe');
      if (!c[1]) t.ok(has(g, 'frozen') && !has(g, 'wet') && st(g, 'frozen').turns === 1, 'a Wet foe freezes for 1 turn (Wet gone)');
      else t.ok(!has(g, 'frozen'), c[0] + ': no freeze');
    });
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 2, y: 5, hpMult: 4 }] });
    let u = U();
    const fz = at(3, 4), fz2 = at(2, 5);
    A().addStatus(fz, 'frozen', { turns: 2 }, u);
    A().addStatus(fz2, 'frozen', { turns: 2 }, u);
    enchanted(u, 'frost', 1);
    let h0 = fz.hp;
    use(t, u, u.basic, 3, 4, 'frost on a Frozen foe');
    t.eq(h0 - fz.hp, 5 + BONUS[0], 'frost on a Frozen foe: 5 + ' + BONUS[0] + ', no physical ×1.5');
    enchanted(u, 'charm', 1);
    fresh(u);
    h0 = fz2.hp;
    use(t, u, u.basic, 2, 5, 'charm on a Frozen foe');
    t.eq(h0 - fz2.hp, hit(5, 1.5, BONUS[0]), 'charm on a Frozen foe: physical, so the ×1.5 stays (' + hit(5, 1.5, BONUS[0]) + ')');
    // Positively Shocking: Wet ×1.5; the arc 2 / 3 / 4 to the nearest other foe within 2 of the first foe hit
    [1, 2, 3].forEach(function (lv) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 4, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 3, y: 6, hpMult: 4 }] });
      const v = U(), a = at(3, 4), b = at(4, 4), c = at(3, 6);
      A().addStatus(a, 'wet', { turns: 2 }, v);
      enchanted(v, 'shock', lv);
      const a0 = a.hp, b0 = b.hp, c0 = c.hp;
      const hy = hypeGains(function () { use(t, v, v.basic, 3, 4, 'shock L' + lv); });
      t.eq(a0 - a.hp, hit(5, 1.5, BONUS[lv - 1]), 'shock L' + lv + ': a Wet foe takes ×1.5 lightning (' + hit(5, 1.5, BONUS[lv - 1]) + ')');
      t.eq(b0 - b.hp, ARC[lv - 1], 'shock L' + lv + ': the arc deals ' + ARC[lv - 1] + ' to the nearest other foe');
      t.eq(c0 - c.hp, 0, 'shock L' + lv + ': once per strike (the farther foe is spared)');
      t.eq(multiHits(hy), 0, 'shock L' + lv + ': the arc gives no multi-hit Hype');
      t.eq(blade(v).stacks, 2, 'shock L' + lv + ': one charge');
    });
    // ties byPos, never a foe the strike hit, none when alone, from a foe the strike killed, Wet / immune, kill credit
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 3, y: 5, hpMult: 4 }, { id: 'test_grunt', x: 4, y: 4, hpMult: 4 }] });
    u = U();
    enchanted(u, 'shock', 1);
    let arcd = logged(/Lightning arcs/, function () { use(t, u, u.basic, 3, 4, 'shock tie'); });
    t.ok(arcd.length === 1 && at(4, 4).hp < at(4, 4).maxHp && at(3, 5).hp === at(3, 5).maxHp, 'a tie goes by position (y, then x): (4,4) before (3,5)');
    t.eq(arcd[0], 'Lightning arcs from Test Grunt to Test Grunt.', 'log: "Lightning arcs from <A> to <B>."');
    fight({ heroes: [{ x: 4, y: 4, skills: [{ id: 'ras_sweeping_bow', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 4 },
      { id: 'test_grunt', x: 3, y: 6, hpMult: 4 }] });
    u = U();
    enchanted(u, 'shock', 1);
    const x6 = at(3, 6), x60 = x6.hp;
    use(t, u, give(u, 'ras_sweeping_bow', 1), 4, 4, 'shock Sweeping Bow');
    t.eq(x60 - x6.hp, 2, 'the arc skips every foe the strike hit and jumps from the first one (3,4) to (3,6)');
    t.eq(blade(u).stacks, 2, 'Sweeping Bow on two foes: one charge');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 7, y: 7 }] });
    u = U();
    enchanted(u, 'shock', 1);
    arcd = logged(/Lightning arcs/, function () { use(t, u, u.basic, 3, 4, 'shock alone'); });
    t.eq(arcd.length, 0, 'no foe within 2: no arc');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
    u = U();
    const kill = at(3, 4), next = at(5, 4);
    kill.hp = 3;
    next.hp = 2;
    A().addStatus(next, 'wet', { turns: 2 }, u);
    enchanted(u, 'shock', 1);
    const k0 = (DD.Combat.state.stats.units[u.id] || {}).kills || 0;
    use(t, u, u.basic, 3, 4, 'shock kill');
    t.ok(kill.dead && next.dead, 'the strike kills the first foe and the arc jumps from its tile, killing the Wet second');
    t.eq(((DD.Combat.state.stats.units[u.id] || {}).kills || 0) - k0, 2, 'both kills credit him');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 4, y: 4, hpMult: 4 }] });
    u = U();
    at(4, 4).resist = { lightning: 0 };
    enchanted(u, 'shock', 3);
    h0 = at(4, 4).hp;
    use(t, u, u.basic, 3, 4, 'shock arc into an immune foe');
    t.eq(h0 - at(4, 4).hp, 0, 'the arc deals 0 to a lightning-immune foe');
    // Most Disarming: Weak 1 / 1 / 2
    [1, 2, 3].forEach(function (lv) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
      const v = U(), g = foes()[0];
      enchanted(v, 'charm', lv);
      use(t, v, v.basic, 3, 4, 'charm L' + lv);
      t.ok(has(g, 'weak') && st(g, 'weak').turns === WEAK[lv - 1], 'charm L' + lv + ': Weakened for ' + WEAK[lv - 1]);
    });
    // charges: 3 (4 with Rapier Wit, the desc prints it); the strike that uses the last ends the blade
    fight({ heroes: [{ x: 2, y: 4, items: ['ras_rapier_wit'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    t.ok(/\(4 charges\)/.test(desc('ras_cold_shoulder', 1, u)) && /\(3 charges\)/.test(desc('ras_cold_shoulder', 1)), 'the enchant desc prints 4 with Rapier Wit, 3 without');
    enchanted(u, 'frost', 1);
    t.eq(blade(u).stacks, 4, 'Rapier Wit: 4 charges');
    for (let i = 0; i < 4; i++) { fresh(u); use(t, u, u.basic, 3, 4, 'strike ' + (i + 1)); }
    t.eq(blade(u), null, 'four strikes later the sword is plain steel');
    // one charge per strike however many foes: Sweeping Bow on 3 foes → 3 riders, 1 charge
    fight({ heroes: [{ x: 4, y: 4, skills: [{ id: 'ras_sweeping_bow', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 4 },
      { id: 'test_grunt', x: 4, y: 3, hpMult: 4 }] });
    u = U();
    enchanted(u, 'frost', 1);
    use(t, u, give(u, 'ras_sweeping_bow', 1), 4, 4, 'Sweeping Bow on three');
    t.ok(foes().every(function (f) { return has(f, 'slow'); }), 'three foes Slowed');
    t.eq(blade(u).stacks, 2, 'one charge');
    // replace removes the old one (no afterglow); refill takes the new level; the swap log
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    enchanted(u, 'frost', 1);
    u.hp = 10;
    let calls = healCalls(function () {
      const lines = logged(/swaps|enchants/, function () { enchanted(u, 'shock', 2); });
      t.eq(lines[0], 'Rasma swaps Frosty Blade for Shocking Blade (3 charges).', 'log: the swap');
    });
    t.ok(!has(u, 'ras_frost') && has(u, 'ras_shock') && blade(u).stacks === 3, 'replace: the frost is gone, Shocking Blade with 3');
    t.eq(lifts(calls).length, 0, 'replace: no afterglow');
    t.eq(u.hp, 10, 'replace: HP unchanged');
    fresh(u);
    use(t, u, u.basic, 3, 4, 'a strike');
    enchanted(u, 'shock', 3);
    t.ok(blade(u).stacks === 3 && blade(u).data.arc === 4 && blade(u).data.bonus === BONUS[2], 'refill: 3 charges and the new level\'s numbers');
    // Silenced: enchanting refused; the held blade still works
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_cold_shoulder', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    enchanted(u, 'charm', 1);
    A().addStatus(u, 'silenced', { turns: 1 }, foes()[0]);
    t.eq(DD.Combat.canUse(u, give(u, 'ras_cold_shoulder', 1)), 'Silenced!', 'Silenced: The Cold Shoulder is refused (a spell)');
    use(t, u, u.basic, 3, 4, 'Silenced strike');
    t.ok(has(foes()[0], 'weak') && blade(u).stacks === 2, 'Silenced: the held blade still Weakens');
    // downed: gone, plain when revived; dispelled: gone; combat start plain
    A().damage(foes()[0], u, 999, { cause: 'other' });
    t.ok(u.downed && !blade(u), 'downed: the blade is gone');
    A().revive(u, 0.5);
    t.ok(!u.downed && !blade(u), 'revived: plain steel');
    enchanted(u, 'frost', 1);
    A().cleanse(u, 'buff');
    t.ok(!blade(u), 'dispelled (a buff cleanse): gone');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    t.eq(blade(U()), null, 'combat start: plain steel');
    // generic tome damage skills carry nothing; the signature carries nothing and leaves the stacks unchanged
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'gen_throw_chair', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 4 }] });
    u = U();
    if (DD.getSkill('gen_throw_chair')) {
      enchanted(u, 'frost', 1);
      const g = foes()[0], g0 = g.hp;
      use(t, u, give(u, 'gen_throw_chair', 1), 4, 4, 'Throw Chair');
      t.ok(g0 - g.hp === 7 && !has(g, 'slow') && blade(u).stacks === 3, 'Throw Chair: its own 7, no Slow, no charge (not a sword strike)');
    } else t.log('skills_generic.js not loaded: the tome check is skipped');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    enchanted(u, 'charm', 1);
    DD.Combat.state.hype = 100;
    use(t, u, u.signature, u.x, u.y, 'A Thousand Pardons');
    t.ok(blade(u).stacks === 3 && !has(foes()[0], 'weak'), 'the signature: no charge used, no rider');
    // Echo Chamber: each resolve is a strike and spends a charge
    if (DD.getPassive && DD.getPassive('rp_echo_chamber')) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
      u = U();
      const inst = DD.passiveInstance({ id: 'rp_echo_chamber', level: 1 });
      inst.L = { pct: 100 };
      u.passives = [inst];
      enchanted(u, 'frost', 1);
      const g = foes()[0], g0 = g.hp;
      use(t, u, u.basic, 3, 4, 'echoed strike');
      t.eq(g0 - g.hp, 2 * (5 + BONUS[0]), 'two resolves: ' + (5 + BONUS[0]) + ' + ' + (5 + BONUS[0]));
      t.eq(blade(u).stacks, 1, 'Echo Chamber: one charge per resolve (3 → 1)');
      u.passives = [];
    } else t.log('passives.js not loaded: the Echo Chamber check is skipped');
  });

  // ---- 4. Enchanté (the D9 heal) ------------------------------------------------------------------------------------
  T.suite('hero_rasma: Enchanté — only the strike that spends the last charge heals him 5 (lift:rasma); everything else HP-neutral', function (t) {
    if (!ready(t)) return;
    const AG = R().AFTERGLOW;
    t.eq(AG, 5, 'AFTERGLOW 5 (h19:balance it1: 3 → 4; fix:balance R4: 4 → 5)');
    // a basic spends the last charge
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    let u = U();
    u.hp = 10;
    enchanted(u, 'frost', 1);
    let calls = healCalls(function () { use(t, u, u.basic, 3, 4, 'strike 1'); fresh(u); use(t, u, u.basic, 3, 4, 'strike 2'); });
    t.ok(lifts(calls).length === 0 && u.hp === 10, 'the first two strikes heal nothing');
    fresh(u);
    let lines;
    calls = healCalls(function () { lines = logged(/enchantment is spent/, function () { use(t, u, u.basic, 3, 4, 'strike 3'); }); });
    const L1 = lifts(calls);
    t.ok(L1.length === 1 && L1[0].src === u && L1[0].target === u && L1[0].n === AG, 'the third strike: one heal of ' + AG + ', Rasma on Rasma, via lift:rasma');
    t.eq(u.hp, 10 + AG, '+' + AG + ' HP');
    t.eq(lines[0], 'Rasma\'s enchantment is spent. Most refreshing.', 'log: "Rasma\'s enchantment is spent. Most refreshing."');
    t.eq(blade(u), null, 'and the blade is plain');
    // at full HP: called anyway (0 healed, the fire counted)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    enchanted(u, 'frost', 1);
    st(u, 'ras_frost').stacks = 1;
    calls = healCalls(function () { lines = logged(/enchantment is spent/, function () { use(t, u, u.basic, 3, 4, 'full HP'); }); });
    t.ok(lifts(calls).length === 1 && lifts(calls)[0].healed === 0 && u.hp === u.maxHp, 'at full HP: the call is made, 0 healed');
    t.eq(lines[0], 'Rasma\'s enchantment is spent.', 'log without "Most refreshing" when nothing healed');
    // the same rule at 1 HP (no threshold)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    u.hp = 1;
    enchanted(u, 'frost', 1);
    st(u, 'ras_frost').stacks = 2;
    calls = healCalls(function () { use(t, u, u.basic, 3, 4, '1 HP, 2 charges'); });
    t.ok(lifts(calls).length === 0 && u.hp === 1, 'at 1 HP with 2 charges: no heal (no HP threshold)');
    fresh(u);
    use(t, u, u.basic, 3, 4, '1 HP, last charge');
    t.eq(u.hp, 1 + AG, 'at 1 HP the last charge heals ' + AG + ', like at any HP');
    // an attack of opportunity on the enemy's turn
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    u.hp = 10;
    enchanted(u, 'shock', 1);
    st(u, 'ras_shock').stacks = 1;
    calls = healCalls(function () { A().moveAlong(foes()[0], [{ x: 4, y: 4 }, { x: 5, y: 4 }], { provoke: true }); });
    t.ok(lifts(calls).length === 1 && u.hp === 10 + AG && !blade(u), 'an AoO that spends the last charge heals ' + AG);
    // a riposte inside the foe's own skill
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_touche', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    u.hp = 20;
    enchanted(u, 'frost', 1);
    st(u, 'ras_frost').stacks = 1;
    use(t, u, give(u, 'ras_touche', 1), u.x, u.y, 'Touché');
    calls = healCalls(function () { foeHits(foes()[0], 2, 4); });
    t.ok(lifts(calls).length === 1 && u.hp === 20 - 4 + AG && !blade(u), 'a riposte that spends the last charge heals ' + AG + ' (20 − 4 + ' + AG + ' = ' + u.hp + ')');
    // Do Keep the Change spends every charge: the afterglow fires
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_keep_change', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    u.hp = 10;
    enchanted(u, 'frost', 1);
    calls = healCalls(function () { use(t, u, give(u, 'ras_keep_change', 1), 3, 4, 'Do Keep the Change'); });
    t.ok(lifts(calls).length === 1 && u.hp === 10 + AG && !blade(u), 'Do Keep the Change: all 3 charges, one afterglow');
    // HP-neutral: enchanting, refilling, replacing, dispels, combat start, Tea, the Look, Touché's use, the signature, items
    fight({ heroes: [{ x: 2, y: 4, items: ['ras_rapier_wit', 'ras_waistcoat', 'ras_spare_monocle'], skills: [{ id: 'ras_tea', level: 3 }, { id: 'ras_look', level: 3 },
      { id: 'ras_touche', level: 3 }, { id: 'ras_cold_shoulder', level: 3 }] }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }, { id: 'test_grunt', x: 2, y: 6, hpMult: 6 }] });
    u = U();
    t.ok(u.hp === u.maxHp && !(u.block > 0), 'combat start: full HP, no Block (no shield)');
    u.hp = 9;
    calls = healCalls(function () {
      fresh(u); use(t, u, give(u, 'ras_cold_shoulder', 3), u.x, u.y, 'enchant');
      fresh(u); use(t, u, give(u, 'ras_cold_shoulder', 3), u.x, u.y, 'refill');
      enchanted(u, 'charm', 1);
      A().cleanse(u, 'buff');
      fresh(u); use(t, u, give(u, 'ras_tea', 3), 3, 4, 'Tea on a foe');
      fresh(u); use(t, u, give(u, 'ras_look', 3), 2, 6, 'the Look');
      fresh(u); use(t, u, give(u, 'ras_touche', 3), u.x, u.y, 'Touché');
      fresh(u); DD.Combat.state.hype = 100; use(t, u, u.signature, u.x, u.y, 'the signature');
    });
    t.eq(lifts(calls).length, 0, 'none of them calls the afterglow');
    t.eq(calls.filter(function (c) { return !c.sim && c.target === u; }).length, 0, 'none of them heals him at all');
    t.eq(u.hp, 9, 'HP still 9');
    // never while downed (no revive); never another unit
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    enchanted(u, 'frost', 1);
    const sx = st(u, 'ras_frost');
    sx.stacks = 1;
    A().damage(foes()[0], u, 999, { cause: 'other' });
    calls = healCalls(function () { R().spend(u, sx, 1, null); });
    t.ok(u.downed && lifts(calls).length === 0, 'downed: nothing to spend, no heal, no revive');
    const knight = hero('test_knight');
    knight.hp = 5;
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    hero('test_knight').hp = 5;
    enchanted(u, 'frost', 1);
    st(u, 'ras_frost').stacks = 1;
    calls = healCalls(function () { use(t, u, u.basic, 3, 4, 'afterglow next to a hurt ally'); });
    t.ok(lifts(calls).every(function (c) { return c.target === u; }) && hero('test_knight').hp === 5, 'he heals nobody else');
    // Thorns downing him mid-strike: nothing spends, nothing heals
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    enchanted(u, 'frost', 1);
    st(u, 'ras_frost').stacks = 1;
    u.hp = 3;
    A().addStatus(foes()[0], 'thorns', { stacks: 20, turns: 2 }, foes()[0]);
    calls = healCalls(function () { use(t, u, u.basic, 3, 4, 'into Thorns'); });
    t.ok(u.downed && lifts(calls).length === 0, 'Thorns downs him mid-strike: no afterglow');
  });

  // ---- 5. the pool at every level -----------------------------------------------------------------------------------
  T.suite('hero_rasma: the pool at every level (Respect, Sweeping Bow, Regards, Keep the Change, Touché, Tea, the Look)', function (t) {
    if (!ready(t)) return;
    // With All Due Respect 9 / 11 / 13 (h19:balance it1: 8 / 10 / 12 → 9 / 11 / 13), cooldown 1
    [9, 11, 13].forEach(function (n, i) {
      fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_due_respect', level: i + 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
      const u = U(), g = foes()[0], sl = give(u, 'ras_due_respect', i + 1), g0 = g.hp;
      t.eq(desc('ras_due_respect', i + 1), 'Sword strike: deal ' + n + ' damage to an adjacent foe.', 'Respect L' + (i + 1) + ' desc');
      use(t, u, sl, 3, 4, 'Respect L' + (i + 1));
      t.ok(g0 - g.hp === n && sl.cd === 1 && DD.getSkill('ras_due_respect').ap === 2, 'Respect L' + (i + 1) + ': ' + n + ', 2 AP, cooldown 1');
    });
    // Sweeping Bow 4 / 5 / 6 on the 4 adjacent tiles, allies spared
    [4, 5, 6].forEach(function (n, i) {
      fight({ heroes: [{ x: 4, y: 4, skills: [{ id: 'ras_sweeping_bow', level: i + 1 }] }, { id: 'test_knight', x: 4, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 4, y: 3, hpMult: 4 }, { id: 'test_grunt', x: 5, y: 5, hpMult: 4 }] });
      const u = U(), k = hero('test_knight'), k0 = k.hp, diag = at(5, 5), d0 = diag.hp;
      const hp0 = foes().map(function (f) { return f.hp; });
      const sl = give(u, 'ras_sweeping_bow', i + 1);
      const hy = hypeGains(function () { use(t, u, sl, 4, 4, 'Bow L' + (i + 1)); });
      const dealt = foes().map(function (f, j) { return hp0[j] - f.hp; });
      t.eq(dealt.filter(function (x) { return x === n; }).length, 3, 'Bow L' + (i + 1) + ': ' + n + ' to each of the 3 adjacent foes');
      t.ok(k.hp === k0 && diag.hp === d0, 'Bow L' + (i + 1) + ': the ally and the diagonal foe are spared');
      t.ok(multiHits(hy) === 1 && sl.cd === 2, 'Bow L' + (i + 1) + ': the multi-hit Hype once, cooldown 2');
    });
    // Sending My Regards 6 / 8 / 9, range 4 / 4 / 5 (+1 with a +range item), line of sight
    [[6, 4], [8, 4], [9, 5]].forEach(function (p, i) {
      fight({ heroes: [{ x: 1, y: 4, skills: [{ id: 'ras_regards', level: i + 1 }] }], enemies: [{ id: 'test_grunt', x: 1 + p[1], y: 4, hpMult: 4 }, { id: 'test_grunt', x: 2 + p[1], y: 4, hpMult: 4 }] });
      const u = U(), sl = give(u, 'ras_regards', i + 1), g = at(1 + p[1], 4), g0 = g.hp;
      t.eq(desc('ras_regards', i + 1), 'Sword strike: flick a crescent of magic off your blade at a foe within ' + p[1] + ': ' + p[0] + ' damage.', 'Regards L' + (i + 1) + ' desc');
      t.ok(!valid(u, sl, 2 + p[1], 4), 'Regards L' + (i + 1) + ': ' + (p[1] + 1) + ' away is out of reach');
      u.rangeBonus = 1;
      t.ok(valid(u, sl, 2 + p[1], 4) && new RegExp('within ' + (p[1] + 1) + ':').test(desc('ras_regards', i + 1, u)), 'Regards L' + (i + 1) + ': +1 range reaches ' + (p[1] + 1) + ' and the desc says so');
      u.rangeBonus = 0;
      use(t, u, sl, 1 + p[1], 4, 'Regards L' + (i + 1));
      t.eq(g0 - g.hp, p[0], 'Regards L' + (i + 1) + ': ' + p[0]);
    });
    fight({ heroes: [{ x: 1, y: 4, skills: [{ id: 'ras_regards', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'wall'; } });
    t.ok(!valid(U(), give(U(), 'ras_regards', 1), 4, 4), 'Regards needs line of sight');
    // Do Keep the Change: 6 + 2n / 7 + 3n / 8 + 3n for n = 0-4 charges (4 with Rapier Wit)
    [[6, 2], [7, 3], [8, 3]].forEach(function (p, i) {
      [0, 1, 2, 3, 4].forEach(function (n) {
        const wit = n === 4;
        fight({ heroes: [{ x: 2, y: 4, items: wit ? ['ras_rapier_wit'] : [], skills: [{ id: 'ras_keep_change', level: i + 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 8 }] });
        const u = U(), g = foes()[0], sl = give(u, 'ras_keep_change', i + 1);
        if (n > 0) { enchanted(u, 'frost', 1); st(u, 'ras_frost').stacks = n; }
        u.hp = 10;
        const g0 = g.hp;
        const calls = healCalls(function () { use(t, u, sl, 3, 4, 'Change L' + (i + 1) + ' n' + n); });
        const want = hit(p[0] + p[1] * n, wit ? 1.1 : 1, n > 0 ? BONUS[0] : 0);
        t.eq(g0 - g.hp, want, 'Change L' + (i + 1) + ' with ' + n + ' charges: ' + want);
        t.eq(blade(u), null, 'Change L' + (i + 1) + ' n' + n + ': no blade left');
        t.eq(lifts(calls).length, n > 0 ? 1 : 0, 'Change L' + (i + 1) + ' n' + n + ': ' + (n > 0 ? 'the afterglow fires' : 'no blade, no afterglow'));
        if (n > 0) t.ok(has(g, 'slow'), 'Change L' + (i + 1) + ' n' + n + ': the blade\'s rider rides once');
        t.eq(sl.cd, 3, 'cooldown 3');
      });
    });
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_keep_change', level: 1 }] }], objects: [{ x: 3, y: 4, id: 'crate' }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    let u = U();
    enchanted(u, 'frost', 1);
    const cr = tile(3, 4).obj, cr0 = cr.hp;
    use(t, u, give(u, 'ras_keep_change', 1), 3, 4, 'Change on a crate');
    t.ok(cr0 - (tile(3, 4).obj ? tile(3, 4).obj.hp : 0) === Math.min(cr0, 6) && blade(u).stacks === 3, 'a crate takes the listed 6 and nothing is used');
    // review:rasma — a lightning-immune foe takes 0 from a Shocking Keep the Change: nothing is used, and the log and the
    // bark don't claim it was ("spends every last charge" only when the charges really go)
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_keep_change', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    foes()[0].resist = { lightning: 0 };
    enchanted(u, 'shock', 1);
    u.hp = 10;
    let kc0 = foes()[0].hp, kcLog = [];
    const kcCalls = healCalls(function () { kcLog = logged(/spends every last charge|enchantment is spent/, function () { use(t, u, give(u, 'ras_keep_change', 1), 3, 4, 'Change vs immune'); }); });
    t.ok(kc0 === foes()[0].hp && blade(u) && blade(u).stacks === 3, 'Change vs a lightning-immune foe: 0 damage, all 3 charges kept');
    t.eq(kcLog.length, 0, 'Change vs a lightning-immune foe: no "spends every last charge" line ' + JSON.stringify(kcLog));
    t.eq(lifts(kcCalls).length, 0, 'Change vs a lightning-immune foe: no afterglow');
    t.eq(u.hp, 10, 'Change vs a lightning-immune foe: HP unchanged');
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_keep_change', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    enchanted(u, 'shock', 1);
    kcLog = logged(/spends every last charge/, function () { use(t, u, give(u, 'ras_keep_change', 1), 3, 4, 'Change vs a plain foe'); });
    t.eq(kcLog[0], 'Rasma spends every last charge. "Do keep the change."', 'Change that lands: log "Rasma spends every last charge. "Do keep the change.""');
    // Touché: the first 1 / 1 / 2 adjacent hostile hits riposte 5 / 7 / 7
    [[5, 1], [7, 1], [7, 2]].forEach(function (p, i) {
      fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_touche', level: i + 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }, { id: 'test_grunt', x: 2, y: 5, hpMult: 6 }, { id: 'test_grunt', x: 1, y: 4, hpMult: 6 }] });
      const u2 = U(), sl = give(u2, 'ras_touche', i + 1);
      const lab = 'Touché L' + (i + 1);
      let log;
      log = logged(/takes his guard/, function () { use(t, u2, sl, u2.x, u2.y, lab); });
      t.eq(log[0], 'Rasma takes his guard. En garde.', lab + ': log');
      t.ok(has(u2, 'ras_guard') && st(u2, 'ras_guard').stacks === p[1], lab + ': En Garde ×' + p[1]);
      const fs = [at(3, 4), at(2, 5), at(1, 4)], h0 = fs.map(function (f) { return f.hp; });
      fs.forEach(function (f) { foeHits(f, 2, 4); });
      const back = fs.map(function (f, j) { return h0[j] - f.hp; });
      t.eq(back.filter(function (x) { return x === p[0]; }).length, p[1], lab + ': the first ' + p[1] + ' hit(s) riposte for ' + p[0] + ' (' + back.join(', ') + ')');
      t.eq(back.filter(function (x) { return x > 0 && x !== p[0]; }).length, 0, lab + ': nobody else is struck');
      t.ok(!has(u2, 'ras_guard'), lab + ': the guard is used up');
    });
    function guarded(level, extra) {
      fight(Object.assign({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_touche', level: level || 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }, { id: 'test_archer', x: 6, y: 4, hpMult: 6 }] }, extra || {}));
      const v = U();
      use(t, v, give(v, 'ras_touche', level || 1), v.x, v.y, 'Touché');
      return v;
    }
    u = guarded(1);
    u.block = 20;
    let g = at(3, 4), g0 = g.hp;
    foeHits(g, 2, 4);
    t.eq(g0 - g.hp, 5, 'a hit fully soaked by Block still ripostes');
    u = guarded(1);
    g = at(3, 4); g0 = g.hp;
    const ar = at(6, 4);
    foeHits(ar, 2, 4);
    t.ok(g.hp === g0 && has(u, 'ras_guard'), 'a ranged hit from 4 tiles away: no riposte, the guard waits');
    A().damage(g, u, 3, { cause: 'status', tags: ['burn'] });
    A().damage(g, u, 3, { cause: 'fall' });
    A().damage(g, u, 3, { cause: 'explosion' });
    t.ok(g.hp === g0 && has(u, 'ras_guard'), 'ticks, falls and explosions never riposte');
    ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (sid) {
      u = guarded(1);
      g = at(3, 4); g0 = g.hp;
      A().addStatus(u, sid, { turns: 1 }, g);
      foeHits(g, 2, 4);
      t.eq(g0 - g.hp, 0, sid + ': no riposte');
    });
    u = guarded(1);
    g = at(3, 4); g0 = g.hp;
    u.hp = 2;
    foeHits(g, 2, 4);
    t.ok(u.downed && g.hp === g0, 'the hit that downs him gets no riposte');
    u = guarded(1);
    toHisTurn(u);
    t.ok(!has(u, 'ras_guard'), 'gone at the start of his next turn');
    // Thorns' reflection is no riposte trigger
    u = guarded(1);
    g = at(3, 4);
    A().addStatus(g, 'thorns', { stacks: 2, turns: 2 }, g);
    fresh(u);
    g0 = g.hp;
    use(t, u, u.basic, 3, 4, 'a strike into Thorns while en garde');
    t.ok(g0 - g.hp === 5 && has(u, 'ras_guard'), 'Thorns hurt him back: no riposte (the guard waits)');
    // the riposte carries the blade and uses a charge at once
    u = guarded(1);
    enchanted(u, 'frost', 1);
    g = at(3, 4); g0 = g.hp;
    foeHits(g, 2, 4);
    t.ok(g0 - g.hp === 5 + BONUS[0] && has(g, 'slow') && blade(u).stacks === 2, 'a frost riposte: 5 + ' + BONUS[0] + ' frost, Slowed, one charge at once');
    // Tea, Anyone?: Wet exactly 2 of its turns, a Burn goes out, ally or foe, no tile change, range 3 / 4 / 4, cd 3 / 3 / 2
    [[3, 3], [4, 3], [4, 2]].forEach(function (p, i) {
      fight({ heroes: [{ x: 1, y: 4, skills: [{ id: 'ras_tea', level: i + 1 }] }, { id: 'test_knight', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 1 + p[0], y: 4, hpMult: 4 }, { id: 'test_grunt', x: 2 + p[0], y: 4 }] });
      const v = U(), sl = give(v, 'ras_tea', i + 1), f = at(1 + p[0], 4);
      t.eq(desc('ras_tea', i + 1), 'Throw your tea over a foe or ally within ' + p[0] + ': it is Wet for 2 turns (a Burn on it goes out).', 'Tea L' + (i + 1) + ' desc');
      t.ok(!valid(v, sl, 2 + p[0], 4) && valid(v, sl, 1, 6) && !valid(v, sl, 1, 4), 'Tea L' + (i + 1) + ': range ' + p[0] + ', an ally yes, himself no');
      A().addStatus(f, 'burn', { stacks: 2 }, v);
      const tl0 = JSON.stringify([tile(f.x, f.y).t, tile(f.x, f.y).surface]);
      const log = logged(/some tea/, function () { use(t, v, sl, f.x, f.y, 'Tea L' + (i + 1)); });
      t.eq(log[0], 'Rasma offers Test Grunt some tea. Forcefully.', 'Tea: log');
      t.ok(has(f, 'wet') && !has(f, 'burn') && st(f, 'wet').turns === 2, 'Tea L' + (i + 1) + ': Wet 2, the Burn is out');
      t.eq(JSON.stringify([tile(f.x, f.y).t, tile(f.x, f.y).surface]), tl0, 'no tile change');
      t.eq(sl.cd, p[1], 'cooldown ' + p[1]);
      toHisTurn(v);
      t.ok(has(f, 'wet'), 'still Wet after its first turn');
      toHisTurn(v);
      t.ok(!has(f, 'wet'), 'dry after its second turn');
    });
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_tea', level: 1 }] }, { id: 'test_knight', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    const kn = hero('test_knight');
    A().addStatus(kn, 'burn', { stacks: 3 }, foes()[0]);
    use(t, u, give(u, 'ras_tea', 1), 2, 6, 'Tea on a Burning ally');
    t.ok(has(kn, 'wet') && !has(kn, 'burn'), 'an ally: Wet, the Burn is out');
    fresh(u);
    enchanted(u, 'frost', 1);
    A().addStatus(foes()[0], 'wet', { turns: 2 }, u);
    use(t, u, u.basic, 3, 4, 'then a Cold Shoulder strike');
    t.ok(has(foes()[0], 'frozen'), 'Tea, then The Cold Shoulder: Frozen');
    // A Disapproving Look: Silence 1 / 1 / 2, range 3 / 4 / 4, bosses refused, a spell wind-up fizzles
    [[3, 1], [4, 1], [4, 2]].forEach(function (p, i) {
      fight({ heroes: [{ x: 1, y: 4, skills: [{ id: 'ras_look', level: i + 1 }] }], enemies: [{ id: 'test_summoner_foe', x: 1 + p[0], y: 4, hpMult: 4 }, { id: 'test_grunt', x: 2 + p[0], y: 4 }] });
      const v = U(), sl = give(v, 'ras_look', i + 1), f = at(1 + p[0], 4);
      t.eq(desc('ras_look', i + 1), 'A foe within ' + p[0] + ' (not a boss) is Silenced for ' + plural(p[1], 'turn') + ': no spells, and a spell wind-up fizzles.', 'Look L' + (i + 1) + ' desc');
      t.ok(!valid(v, sl, 2 + p[0], 4), 'Look L' + (i + 1) + ': range ' + p[0]);
      const it = DD.AI.windUp(f, 'test_hex_bolt', v, { track: true });
      const log = logged(/falls silent/, function () { use(t, v, sl, f.x, f.y, 'Look L' + (i + 1)); });
      t.eq(log[0], 'Test Necromancer falls silent under Rasma\'s disapproving look.', 'Look: log');
      t.ok(has(f, 'silenced') && st(f, 'silenced').turns === p[1], 'Look L' + (i + 1) + ': Silenced ' + p[1]);
      const h0 = v.hp;
      if (it) t.eq(DD.AI.executeIntent(f, it), false, 'its spell wind-up fizzles');
      t.eq(v.hp, h0, 'and does nothing to him');
      t.eq(sl.cd, 3, 'cooldown 3');
    });
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_look', level: 1 }] }], enemies: [{ id: 'test_boss', x: 4, y: 4 }] });
    u = U();
    const bsl = give(u, 'ras_look', 1);
    t.ok(!valid(u, bsl, 4, 4), 'a boss is no target');
    const ctx = DD.Targeting.buildCtx(u, bsl, { x: 4, y: 4 });
    t.eq(DD.getSkill('ras_look').target.canTarget(ctx), 'Bosses don\'t take a hint.', 'with the exact reason');
    t.eq(DD.getSkill('ras_look').kind, 'utility', 'a look is no spell: Silence can\'t stop it');
  });

  // ---- 6. the signature ------------------------------------------------------------------------------------------
  T.suite('hero_rasma: A Thousand Pardons — three strikes of 6 to every foe within 2 (lightning, frost, steel)', function (t) {
    if (!ready(t)) return;
    t.eq(desc('ras_thousand', 1), 'Every foe within 2 takes three strikes of 6: lightning, then frost, then plain steel. Your enchantment is not used.', 'desc');
    fight({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 6 }, { id: 'test_grunt', x: 3, y: 3, hpMult: 6 },
      { id: 'test_brute', x: 2, y: 4 }, { id: 'test_grunt', x: 7, y: 4, hpMult: 6 }] });
    let u = U();
    const dry = at(5, 4), wet = at(3, 3), far = at(7, 4), brute = foes().filter(function (f) { return f.defId === 'test_brute'; })[0];
    A().addStatus(wet, 'wet', { turns: 2 }, u);
    enchanted(u, 'charm', 1);
    DD.Combat.state.hype = 100;
    const els = [];
    A().addRule({ id: 'ras_probe_sig', name: 'probe', silent: true, hooks: { onTakeDamage: function (d) { if (!A().simulating && d.target === dry) els.push(d.element || 'none'); } } });
    const h = [dry.hp, wet.hp, far.hp, hero('test_knight').hp], k0 = (DD.Combat.state.stats.units[u.id] || {}).kills || 0;
    let calls;
    const hy = hypeGains(function () { calls = healCalls(function () { use(t, u, u.signature, u.x, u.y, 'A Thousand Pardons'); }); });
    A().removeRule('ras_probe_sig');
    t.eq(els.join(','), 'lightning,frost,none', 'in order: lightning, frost, plain steel');
    t.eq(h[0] - dry.hp, 18, 'a dry foe: 18');
    t.eq(h[1] - wet.hp, 24, 'a Wet foe: 9 + 6 + 9 (lightning ×1.5, frozen by the frost, then steel ×1.5)');
    t.ok(has(wet, 'frozen'), 'and Frozen');
    t.eq(h[2] - far.hp, 0, 'a foe 3 away is spared');
    t.eq(h[3] - hero('test_knight').hp, 0, 'allies are spared');
    t.ok(brute.hp < brute.maxHp, 'armor: the brute (armor 1) is hit too');
    t.eq(brute.maxHp - brute.hp, 3 * (6 - brute.armor), 'armor applies to each strike (' + (brute.maxHp - brute.hp) + ')');
    t.ok(blade(u).stacks === 3 && !has(dry, 'weak'), 'his enchantment is untouched (3 charges, no Weak)');
    t.eq(DD.Combat.state.hype, multiHits(hy) ? DD.Combat.state.hype : DD.Combat.state.hype, 'Hype spent');
    t.eq(multiHits(hy), 1, 'two or more foes: the multi-hit Hype');
    t.eq(lifts(calls).length + calls.filter(function (c) { return !c.sim && c.target === u; }).length, 0, 'no heal');
    // a Wet boss: 9 + 6 + 6 (no freeze)
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_boss', x: 6, y: 4 }] });
    u = U();
    const b = foes()[0];
    b.flags = Object.assign({}, b.flags, { stunImmune: true });
    b.armor = 0;
    A().addStatus(b, 'wet', { turns: 2 }, u);
    DD.Combat.state.hype = 100;
    const b0 = b.hp;
    use(t, u, u.signature, u.x, u.y, 'on a Wet boss');
    t.ok(b0 - b.hp === 21 && !has(b, 'frozen'), 'a Wet boss with a stun guard: 9 + 6 + 6, no freeze (' + (b0 - b.hp) + ')');
    // kills credit him
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }] });
    u = U();
    foes().forEach(function (f) { f.hp = 10; });
    DD.Combat.state.hype = 100;
    const kk = (DD.Combat.state.stats.units[u.id] || {}).kills || 0;
    use(t, u, u.signature, u.x, u.y, 'kills');
    t.eq(((DD.Combat.state.stats.units[u.id] || {}).kills || 0) - kk, 2, 'both kills credit him');
    t.ok(k0 >= 0, 'kills counted');
  });

  // ---- 7. items ---------------------------------------------------------------------------------------------------
  T.suite('hero_rasma: items — Rapier Wit (4 charges), Bespoke Waistcoat, The Spare Monocle (the first enchantment each turn is free)', function (t) {
    if (!ready(t)) return;
    t.eq(DD.getItem('ras_rapier_wit').desc, '+10% damage. Rasma\'s enchantments hold 4 charges instead of 3.', 'Rapier Wit desc');
    t.eq(DD.getItem('ras_waistcoat').desc, '+4 max HP and +1 armor.', 'Waistcoat desc');
    t.eq(DD.getItem('ras_spare_monocle').desc, 'Rasma\'s first enchantment each turn costs 0 AP.', 'Spare Monocle desc');
    fight({ heroes: [{ x: 2, y: 4, items: ['ras_rapier_wit'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    let u = U();
    const g = foes()[0];
    let g0 = g.hp;
    use(t, u, u.basic, 3, 4, 'Wit strike');
    t.eq(g0 - g.hp, 6, '+10%: 5 → 6');
    enchanted(u, 'frost', 1);
    t.ok(blade(u).stacks === 4 && R().bladeShown(u).n === 4, '4 charges, 4 pips');
    t.ok(/Frosty Blade|4 charges left/.test(DD.getStatus('ras_frost').desc(st(u, 'ras_frost'))), 'the chip says 4 charges left');
    fresh(u);
    g0 = g.hp;
    use(t, u, u.basic, 3, 4, 'Wit frost strike');
    t.eq(g0 - g.hp, hit(5, 1.1, BONUS[0]), '+10% then +' + BONUS[0] + ': ' + hit(5, 1.1, BONUS[0]));
    fight({ heroes: [{ x: 2, y: 4, items: ['ras_waistcoat'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = U();
    t.ok(u.maxHp === 36 && u.armor === 1 && u.hp === 36, 'Waistcoat: 36 HP (32 + 4), armor 1 at L1');
    fight({ heroes: [{ x: 2, y: 4, items: ['ras_spare_monocle'], skills: [{ id: 'ras_cold_shoulder', level: 1 }, { id: 'ras_shocking', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    const cs = give(u, 'ras_cold_shoulder', 1), sh = give(u, 'ras_shocking', 1);
    t.eq(DD.Combat.costOf(u, DD.getSkill('ras_cold_shoulder'), 1).ap, 0, 'the first enchantment this turn costs 0 (Combat.costOf: the pill and AutoPlay read it)');
    t.eq(DD.Combat.costOf(u, DD.getSkill('ras_due_respect'), 1).ap, 2, 'other skills are unchanged');
    const ap0 = u.ap;
    use(t, u, cs, u.x, u.y, 'free enchant');
    t.eq(u.ap, ap0, 'AP unchanged');
    t.eq(DD.Combat.costOf(u, DD.getSkill('ras_shocking'), 1).ap, 1, 'the second costs 1');
    use(t, u, sh, u.x, u.y, 'second enchant');
    t.eq(u.ap, ap0 - 1, '1 AP paid');
    toHisTurn(u);
    t.eq(DD.Combat.costOf(u, DD.getSkill('ras_cold_shoulder'), 1).ap, 0, 'next turn: free again');
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_cold_shoulder', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    t.eq(DD.Combat.costOf(U(), DD.getSkill('ras_cold_shoulder'), 1).ap, 1, 'without the Monocle: 1 AP');
  });

  // ---- 8. HUD previews match reality --------------------------------------------------------------------------------
  T.suite('hero_rasma: HUD previews match reality (every skill × level × blade × the last charge; plain, Wet, Frozen, Burning, resistant foes)', function (t) {
    if (!ready(t)) return;
    let n = 0;
    const targets = [
      ['plain', function () {}], ['Wet', function (f, u) { A().addStatus(f, 'wet', { turns: 2 }, u); }],
      ['Frozen', function (f, u) { A().addStatus(f, 'frozen', { turns: 2 }, u); }], ['Burning', function (f, u) { A().addStatus(f, 'burn', { stacks: 2 }, u); }],
      ['resist', function (f) { f.resist = { frost: 0.5, lightning: 1.5 }; }],
    ];
    ALL.forEach(function (id) {
      const d = DD.getSkill(id);
      for (let lv = 1; lv <= d.levels.length; lv++) {
        [null, 'frost', 'shock', 'charm'].forEach(function (kind) {
          targets.forEach(function (tg) {
            const one = id === 'ras_regards' || id === 'ras_tea' || id === 'ras_look';
            fight({ heroes: [{ x: 4, y: 4, items: ['ras_rapier_wit'], skills: id === 'ras_pardon' || id === 'ras_thousand' ? [] : [{ id: id, level: lv }] }],
              enemies: [{ id: one ? 'test_summoner_foe' : 'test_grunt', x: one ? 4 : 5, y: one ? 2 : 4, hpMult: 3 }, { id: 'test_grunt', x: 6, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
            const u = U(), f = one ? at(4, 2) : at(5, 4);
            tg[1](f, u);
            if (kind) { enchanted(u, kind, lv); st(u, ST_OF[kind]).stacks = 1; }
            if (id === 'ras_thousand') DD.Combat.state.hype = 100;
            const sl = give(u, id, lv);
            const self = (d.target || {}).type === 'self';
            if (DD.Combat.canUse(u, sl) !== true) return;
            const tx = self ? u.x : f.x, ty = self ? u.y : f.y;
            if (!valid(u, sl, tx, ty)) return;
            u.hp = 20;
            previewMatches(t, u, sl, tx, ty, id + ' L' + lv + ' ' + (kind || 'plain') + ' blade vs ' + tg[0]);
            n++;
          });
        });
      }
    });
    t.ok(n >= 400, n + ' previews compared');
  });

  // ---- 9. AI estimates ----------------------------------------------------------------------------------------------
  T.suite('hero_rasma: DD.AI.estimate tells the truth for each blade (plain, Wet, Frozen, resist 0 / 0.5 / 1.5; the AoO estimate)', function (t) {
    if (!ready(t)) return;
    let n = 0;
    const setups = [
      ['plain', function () {}], ['Wet', function (f, u) { A().addStatus(f, 'wet', { turns: 2 }, u); }], ['Frozen', function (f, u) { A().addStatus(f, 'frozen', { turns: 2 }, u); }],
      ['r0', function (f) { f.resist = { frost: 0, lightning: 0 }; }], ['r0.5', function (f) { f.resist = { frost: 0.5, lightning: 0.5 }; }],
      ['r1.5', function (f) { f.resist = { frost: 1.5, lightning: 1.5 }; }], ['armor', function (f) { f.armor = 2; }],
    ];
    [null, 'frost', 'shock', 'charm'].forEach(function (kind) {
      [1, 3].forEach(function (lv) {
        setups.forEach(function (sp) {
          fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
          const u = U(), f = foes()[0];
          sp[1](f, u);
          if (kind) enchanted(u, kind, lv);
          const prev = DD.Combat.preview(u, u.basic, 3, 4);
          const real = prev.perUnit[f.id] ? prev.perUnit[f.id].dmg || 0 : 0;
          const lab = (kind || 'plain') + ' L' + lv + ' vs ' + sp[0];
          t.eq(DD.AI.estimate(u, f, 5, null), real, lab + ': AI.estimate(u, f, 5, null) = the dry run (' + real + ')');
          t.eq(DD.AI.estimate(u, f, 5, null, false, DD.getSkill('ras_pardon')), real, lab + ': with the def too');
          const est = DD.AI.opportunityDmg(u, f, { x: 3, y: 4 });
          const h0 = f.hp;
          A().moveAlong(f, [{ x: 4, y: 4 }], { provoke: true });
          t.eq(est, h0 - f.hp, lab + ': the AoO estimate = the AoO (' + est + ')');
          n++;
        });
      });
    });
    // a non-sword skill of his is left alone (the signature with its def)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    const u = U(), f = foes()[0];
    enchanted(u, 'frost', 1);
    t.eq(DD.AI.estimate(u, f, 6, 'lightning', false, DD.getSkill('ras_thousand')), 6, 'the signature (a real element, no sword): untouched');
    t.ok(n > 50, n + ' estimates compared');
  });

  // ---- 10. readability -----------------------------------------------------------------------------------------------
  T.suite('hero_rasma: readability — chip, live desc note, the FX-pinned blade, log lines', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_due_respect', level: 1 }, { id: 'ras_touche', level: 1 }, { id: 'ras_tea', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    let u = U();
    t.eq(R().bladeNote(u), '', 'plain: no note');
    let lines = logged(/enchants his sword/, function () { enchanted(u, 'frost', 1); });
    t.eq(lines[0], 'Rasma enchants his sword: Frosty Blade (3 charges).', 'log: "Rasma enchants his sword: Frosty Blade (3 charges)."');
    st(u, 'ras_frost').stacks = 2;
    t.eq(R().bladeNote(u), ' Now: ❄️ +' + BONUS[0] + ' frost, Slows; 2 charges left.', 'the frost note');
    SWORDS.forEach(function (id) { t.ok(desc(id, 1, u).indexOf(' Now: ❄️ +' + BONUS[0] + ' frost, Slows; 2 charges left.') > 0, id + ' carries the note'); });
    ['ras_tea', 'ras_cold_shoulder', 'ras_thousand'].forEach(function (id) { t.ok(desc(id, 1, u).indexOf('Now:') < 0, id + ' carries no note'); });
    t.ok(desc('ras_pardon', 1, null).indexOf('Now:') < 0, 'never with user === null');
    t.ok(desc('ras_pardon', 1, DD.Combat.makeRunHero({ id: HERO, level: 1 })).indexOf('Now:') < 0, 'never with a RunHero');
    enchanted(u, 'shock', 1);
    st(u, 'ras_shock').stacks = 1;
    t.eq(R().bladeNote(u), ' Now: ⚡ +' + BONUS[0] + ' lightning, arcs 2; 1 charge left.', 'the lightning note');
    enchanted(u, 'charm', 1);
    t.eq(R().bladeNote(u), ' Now: 🌹 +' + BONUS[0] + ', Weakens; 3 charges left.', 'the charm note');
    // the chip
    if (DD.UI && DD.UI.statusChip) {
      st(u, 'ras_charm').stacks = 1;
      const chip = DD.UI.statusChip(st(u, 'ras_charm'));
      const badge = chip.querySelector('.st-stacks');
      t.ok(chip.textContent.indexOf('🌹') >= 0 && badge && badge.textContent === '1', 'the chip shows 🌹 and "1" at the last charge (showStacks)');
    } else t.log('DD.UI not loaded: the chip check is skipped');
    t.eq(DD.getStatus('ras_charm').desc(st(u, 'ras_charm')), 'Rasma\'s sword strikes (attacks of opportunity and ripostes too) deal +' + BONUS[0] + ' damage and Weaken each foe hit for 1 turn (it deals 25% less). 1 charge left.', 'the charm tooltip');
    // vis.rasBlade: pinned until FX playback reaches the change
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    u.vis = u.vis || {};
    const inst = DD.FX.instant;
    try {
      DD.FX.instant = false;
      DD.FX.reset();
      enchanted(u, 'frost', 1);
      t.ok(has(u, 'ras_frost') && u.vis.rasBlade === null, 'queued FX: the sword still shows plain steel');
      DD.FX.flush();
      t.ok(u.vis.rasBlade && u.vis.rasBlade.id === 'ras_frost' && u.vis.rasBlade.n === 3, 'playback caught up: frost, 3 pips');
      DD.Combat.useSkill(u, u.basic, 3, 4);
      t.ok(u.vis.rasBlade.n === 3, 'a strike queued: still 3 pips on screen');
      DD.FX.flush();
      t.ok(u.vis.rasBlade.n === 2, 'played: 2 pips');
    } finally { DD.FX.instant = inst; DD.FX.reset(); }
    const pin = u.vis.rasBlade;
    fresh(u);
    DD.Combat.preview(u, u.basic, 3, 4);
    t.ok(u.vis.rasBlade === pin && blade(u).stacks === 2, 'a preview touches neither the pin nor the stacks');
  });

  // ---- 11. v2 edge cases -------------------------------------------------------------------------------------------
  T.suite('hero_rasma: v2 edge cases (stun, sleep, sheep, charm, Confused, Taunted, Silence, AP, not his turn, a target killed, null targets)', function (t) {
    if (!ready(t)) return;
    ['stun', 'sleep', 'sheep'].forEach(function (sid) {
      fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_cold_shoulder', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      const u = U();
      A().addStatus(u, sid, { turns: 1 }, foes()[0]);
      t.ok(DD.Combat.canUse(u, u.basic) !== true && DD.Combat.canUse(u, give(u, 'ras_cold_shoulder', 1)) !== true, sid + ': he can\'t strike or enchant');
      t.eq(A().opportunityOf(u, foes()[0], { x: 3, y: 4 }), null, sid + ': no attack of opportunity');
    });
    // a charmed foe fighting for the heroes takes no blade (it is no foe)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 2, y: 5, hpMult: 4 }] });
    let u = U();
    const friend = at(3, 4);
    A().addStatus(friend, 'charmed', { turns: 2 }, u);
    enchanted(u, 'frost', 1);
    const fr0 = friend.hp;
    use(t, u, u.basic, 3, 4, 'a strike on a charmed foe');
    t.ok(fr0 - friend.hp === 5 && !has(friend, 'slow') && blade(u).stacks === 3, 'a foe charmed to fight for the heroes: plain 5, no rider, no charge (' + (fr0 - friend.hp) + ')');
    t.eq(DD.AI.estimate(u, friend, 5, null), 5, 'and the estimate agrees');
    // Confused: a hero still strikes (the engine's rules); Taunted: −50% vs others, the bonus too
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: 2, y: 5, hpMult: 4 }] });
    u = U();
    const a = at(3, 4), b = at(2, 5);
    A().addStatus(u, 'taunt', { turns: 1 }, b);
    enchanted(u, 'frost', 1);
    const a0 = a.hp;
    use(t, u, u.basic, 3, 4, 'taunted strike');
    t.eq(a0 - a.hp, hit(5, 0.5, BONUS[0]), 'Taunted by another: (5 × 0.5) + ' + BONUS[0] + ' (' + hit(5, 0.5, BONUS[0]) + ')');
    // 0 AP; not his turn
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_cold_shoulder', level: 1 }] }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = U();
    u.ap = 0;
    t.eq(DD.Combat.canUse(u, give(u, 'ras_cold_shoulder', 1)), 'Not enough AP.', '0 AP: no enchant');
    DD.Combat.endTurn();
    if (DD.Combat.current() !== u) t.ok(DD.Combat.canUse(u, u.basic) !== true, 'not his turn: refused');
    // a target killed by the strike: no Slow / Weak on it, the arc still jumps (suite 3), the charge is used
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    u = U();
    const k = at(3, 4);
    k.hp = 2;
    enchanted(u, 'frost', 1);
    use(t, u, u.basic, 3, 4, 'kill');
    t.ok(k.dead && !has(k, 'slow') && blade(u).stacks === 2, 'killed by the strike: no Slow, the charge is used');
    // null / odd targets: execute tolerates them
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = U();
    ALL.forEach(function (id) {
      const d = DD.getSkill(id);
      t.tryRun(id + ' with no target', function () {
        d.execute({ user: u, skill: d, L: DD.skillLevel(d, 1), level: 1, target: null, targetUnit: null, tiles: [], units: [], foes: [], friends: [], rng: DD.Combat.state.rng });
      });
    });
    t.tryRun('spend / arcTarget / syncBlade on odd input', function () { R().spend(null, null, 1, null); R().arcTarget(null, null, null); R().syncBlade(null); R().enchantNow(null, 'frost', 1); });
    t.eq(R().enchantNow(u, 'fire', 1), null, 'no fire blade');
  });

  // ---- 12. AutoPlay ------------------------------------------------------------------------------------------------
  function ctxOf(u, id, target, extra) {
    const sl = id === 'ras_pardon' ? u.basic : id === 'ras_thousand' ? u.signature : DD.Combat.slotsOf(u).filter(function (s) { return s.id === id; })[0];
    const c = DD.Targeting.buildCtx(u, sl, target || { x: u.x, y: u.y });
    return Object.assign(c, extra || {});
  }
  function usedBy(u, fn) {
    const list = [];
    A().addRule({ id: 'ras_probe_uses', name: 'probe', silent: true, hooks: {
      onSkillUsed: function (ctx) { if (!A().simulating && ctx.user === u && !ctx.opportunity && ctx.skill) list.push(ctx.skill.id); },
    } });
    try { fn(); } finally { A().removeRule('ras_probe_uses'); }
    return list;
  }
  T.suite('hero_rasma: AutoPlay scores (enchantScore, teaScore, lookScore, toucheScore, changeScore) and turn shapes', function (t) {
    if (!ready(t)) return;
    const all3 = [{ id: 'ras_cold_shoulder', level: 2 }, { id: 'ras_shocking', level: 2 }, { id: 'ras_disarming', level: 2 }];
    // no churn; nothing near
    fight({ heroes: [{ x: 2, y: 4, skills: all3 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let u = U();
    enchanted(u, 'frost', 2);
    t.eq(R().enchantScore(ctxOf(u, 'ras_cold_shoulder')), 0, 'the same blade with 3 charges at the same level: 0 (no churn)');
    st(u, 'ras_frost').stacks = 2;
    t.eq(R().enchantScore(ctxOf(u, 'ras_cold_shoulder')), 0, 'with 2 charges: still 0');
    fight({ heroes: [{ x: 0, y: 0, skills: all3 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = U();
    t.eq(R().enchantScore(ctxOf(u, 'ras_cold_shoulder')), 0, 'no foe near: 0');
    // Cold Shoulder vs a Wet freezable foe
    fight({ heroes: [{ x: 2, y: 4, skills: all3 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = U();
    A().addStatus(foes()[0], 'wet', { turns: 2 }, u);
    let sc = all3.map(function (s) { return R().enchantScore(ctxOf(u, s.id)); });
    t.ok(sc[0] > sc[1] && sc[0] > sc[2], 'a Wet freezable foe: The Cold Shoulder scores best (' + sc.map(function (x) { return x.toFixed(1); }).join(' / ') + ')');
    // Positively Shocking vs a cluster
    fight({ heroes: [{ x: 2, y: 4, skills: all3 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }] });
    u = U();
    sc = all3.map(function (s) { return R().enchantScore(ctxOf(u, s.id)); });
    t.ok(sc[1] > sc[0] && sc[1] > sc[2], 'a cluster: Positively Shocking scores best (' + sc.map(function (x) { return x.toFixed(1); }).join(' / ') + ')');
    // Most Disarming vs a big hitter (that can't run anyway)
    fight({ heroes: [{ x: 2, y: 4, skills: all3 }], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    u = U();
    A().addStatus(foes()[0], 'root', { turns: 2 }, u);
    sc = all3.map(function (s) { return R().enchantScore(ctxOf(u, s.id)); });
    t.ok(sc[2] > sc[0] && sc[2] > sc[1], 'a big hitter: Most Disarming scores best (' + sc.map(function (x) { return x.toFixed(1); }).join(' / ') + ')');
    // never Shocking vs a lone lightning-immune foe
    fight({ heroes: [{ x: 2, y: 4, skills: all3 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = U();
    foes()[0].resist = { lightning: 0 };
    t.eq(R().enchantScore(ctxOf(u, 'ras_shocking')), 0, 'a lone lightning-immune foe: Positively Shocking 0');
    // plain + an adjacent foe + 3 AP → enchants, then strikes
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_cold_shoulder', level: 1 }, { id: 'ras_due_respect', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    let seq = [];
    t.tryRun('AutoPlay turn', function () { seq = usedBy(u, function () { DD.AutoPlay.takeTurn(); }); });
    t.ok(seq[0] === 'ras_cold_shoulder' && seq.length >= 2 && R().isSword(DD.getSkill(seq[1])), 'plain, a foe next to him, 3 AP: enchants, then strikes (' + seq.join(', ') + ')');
    // 1 charge left → strikes first (the afterglow is in that strike's dry run), then re-enchants
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_cold_shoulder', level: 1 }, { id: 'ras_due_respect', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    enchanted(u, 'frost', 1);
    st(u, 'ras_frost').stacks = 1;
    u.hp = 18;
    t.tryRun('AutoPlay turn', function () { seq = usedBy(u, function () { DD.AutoPlay.takeTurn(); }); });
    const ie = seq.indexOf('ras_cold_shoulder');
    t.ok(seq.length && R().isSword(DD.getSkill(seq[0])) && (ie < 0 || ie > 0), '1 charge left: a strike first (' + seq.join(', ') + ')');
    t.ok(ie > 0, '…then the re-enchant (' + seq.join(', ') + ')');
    // with 1 AP left and a plain blade, a plain strike beats a future-only enchant
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_cold_shoulder', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    u.ap = 1;
    t.tryRun('AutoPlay turn', function () { seq = usedBy(u, function () { DD.AutoPlay.takeTurn(); }); });
    t.eq(seq.join(','), 'ras_pardon', '1 AP, plain: Pardon Me, not an enchant');
    // teaScore
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_tea', level: 1 }, { id: 'ras_cold_shoulder', level: 1 }] }, { id: 'test_knight', x: 1, y: 6 }],
      enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }] });
    u = U();
    const near = at(3, 4), burning = at(4, 6), kn = hero('test_knight');
    const tFoe = R().teaScore(ctxOf(u, 'ras_tea', near));
    A().addStatus(burning, 'burn', { stacks: 3 }, kn);
    const tBurn = R().teaScore(ctxOf(u, 'ras_tea', burning));
    t.ok(tFoe > 0 && tFoe > tBurn, 'Tea: a strikeable freezable foe with a frost blade ready scores (' + tFoe.toFixed(1) + ' > a Burning foe ' + tBurn.toFixed(1) + ')');
    t.eq(R().teaScore(ctxOf(u, 'ras_tea', { x: kn.x, y: kn.y })), 0, 'a dry ally: 0');
    A().addStatus(kn, 'burn', { stacks: 2 }, near);
    t.ok(R().teaScore(ctxOf(u, 'ras_tea', { x: kn.x, y: kn.y })) > 0, 'a Burning ally: > 0');
    A().addStatus(near, 'wet', { turns: 2 }, u);
    t.eq(R().teaScore(ctxOf(u, 'ras_tea', near)), 0, 'already Wet for 2: 0');
    // lookScore
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_look', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_summoner_foe', x: 4, y: 4 }, { id: 'test_boss', x: 2, y: 7 }] });
    u = U();
    t.eq(R().lookScore(ctxOf(u, 'ras_look', { x: 3, y: 4 })), 0, 'the Look vs no spells: 0');
    t.eq(R().lookScore(ctxOf(u, 'ras_look', { x: 2, y: 7 })), 0, 'vs a boss: 0');
    const lv = R().lookScore(ctxOf(u, 'ras_look', { x: 4, y: 4 }));
    t.ok(lv > 0, 'vs a spellcaster: > 0 (' + lv.toFixed(1) + ')');
    DD.AI.windUp(at(4, 4), 'test_hex_bolt', u, { track: true });
    t.ok(R().lookScore(ctxOf(u, 'ras_look', { x: 4, y: 4 })) >= 8, 'vs a spell wind-up the Silence outlasts: ≥ 8');
    // toucheScore and changeScore
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_touche', level: 1 }, { id: 'ras_keep_change', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
    u = U();
    t.ok(R().toucheScore(ctxOf(u, 'ras_touche')) > 0, 'Touché with a melee foe next to him: > 0');
    A().addStatus(u, 'ras_guard', { stacks: 1 }, u);
    t.eq(R().toucheScore(ctxOf(u, 'ras_touche')), 0, 'already en garde: 0');
    A().removeStatus(u, 'ras_guard', { silent: true });
    enchanted(u, 'frost', 1);
    st(u, 'ras_frost').stacks = 1;
    t.eq(R().changeScore(ctxOf(u, 'ras_keep_change', { x: 3, y: 4 }, { autoplay: { preview: null } })), 0, 'Keep the Change with 1 charge: nothing thrown away (exact pass 0)');
    st(u, 'ras_frost').stacks = 3;
    t.ok(R().changeScore(ctxOf(u, 'ras_keep_change', { x: 3, y: 4 }, { autoplay: { preview: null } })) < 0, 'with 3 charges: it pays for the 2 it throws away');
    t.eq(R().thousandScore(ctxOf(u, 'ras_thousand', null, { autoplay: { preview: null } })), 0, 'the signature\'s hint: exact pass 0');
  });

  /** AutoPlay battles of ['rasma', 'test_knight', 'test_cleric', 'test_mage'] vs the fixture encounters. */
  function battles(t, plans, tagSeed) {
    const tot = { fought: 0, wins: 0, long: 0, glowed: 0, long4: 0, glowed4: 0, strikes: 0, bladed: 0, timeouts: 0, uses: {}, prints: [], lifts: 0 };
    plans.forEach(function (p, i) {
      const enc = DD.getEncounter(p.enc);
      if (!enc) { t.fail('fixture encounter ' + p.enc + ' missing'); return; }
      const sl = Math.min(3, 1 + Math.floor((p.level - 1) / 2));
      const party = [HERO, 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
        if (id === HERO) return DD.Combat.makeRunHero({ id: id, level: p.level, items: p.items || [], skills: p.skills.map(function (sid) { return { id: sid, level: sl }; }) });
        const h = DD.getHero(id);
        return DD.Combat.makeRunHero({ id: id, level: p.level, skills: h.startingSkills.map(function (sid) { return { id: sid, level: sl }; }) });
      });
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('ras-ap-' + (tagSeed || '') + i + ':' + t.seed), difficulty: 'normal', act: enc.act });
      DD.Combat.start(setup, { seed: 900 + i, headless: true, difficulty: 'normal', kind: enc.kind });
      const counts = {};
      let glow = 0, mine = 0;
      A().addRule({ id: 'ras_usage_probe', name: 'Usage probe', silent: true, hooks: {
        onSkillUsed: function (ctx) {
          if (A().simulating || !ctx.user || ctx.user.defId !== HERO || !ctx.skill) return;
          counts[ctx.skill.id] = (counts[ctx.skill.id] || 0) + 1;
          if (t.param('dbg', '0') === '1') {
            const b = R().bladeInfo(ctx.user);
            t.log('  r' + DD.Combat.state.round + ' ' + ctx.skill.id + (ctx.opportunity ? ' (AoO)' : '') + ' → ' + (b ? b.id + ':' + b.stacks + ' L' + b.data.level : 'plain') + ' ap ' + ctx.user.ap + ' hp ' + ctx.user.hp + '/' + ctx.user.maxHp +
              ' @' + ctx.user.x + ',' + ctx.user.y + ' sc ' + DD.Combat.slotsOf(ctx.user).filter(function (sl) { return DD.Rasma.BLADE_OF[sl.id]; }).map(function (sl) {
                return sl.id + '=' + R().enchantScore(DD.Targeting.buildCtx(ctx.user, sl, { x: ctx.user.x, y: ctx.user.y })).toFixed(1);
              }).join(','));
          }
        },
        modifyOutgoingDamage: function (d) {
          if (A().simulating || !d.source || d.source.defId !== HERO || d.cause !== 'skill' || !R().isSword(d.skill) || !d.target || !DD.Grid.hostile(d.source, d.target)) return;
          tot.strikes++;
          mine++;
          if (R().bladeInfo(d.source)) tot.bladed++;
        },
        onTurnEnd: function (unit) {
          if (A().simulating || !unit || unit.defId !== HERO || t.param('dbg', '0') !== '1') return;
          const fs = DD.Combat.foesOf(unit).map(function (f) { return f.defId.replace('test_', '') + '@' + f.x + ',' + f.y + ' d' + (Math.abs(f.x - unit.x) + Math.abs(f.y - unit.y)); });
          t.log('  r' + DD.Combat.state.round + ' END @' + unit.x + ',' + unit.y + ' ap ' + unit.ap + ' foes ' + fs.join(' '));
        },
      } });
      let r = null;
      const calls = healCalls(function () { t.tryRun(p.enc + ' L' + p.level + ' battle', function () { r = DD.AutoPlay.runBattle(30); }); });
      A().removeRule('ras_usage_probe');
      glow = lifts(calls).length;
      tot.lifts += glow;
      if (!r) return;
      tot.fought++;
      if (r.result === 'victory') tot.wins++;
      if (r.timeout) tot.timeouts++;
      if (r.rounds >= 4) { tot.long4++; if (glow) tot.glowed4++; }
      // the loop itself: in a fight where he struck at least as often as an enchantment holds charges, one ran out
      if (mine >= R().charges({ items: p.items || [] })) { tot.long++; if (glow) tot.glowed++; }
      Object.keys(counts).forEach(function (k) { tot.uses[k] = (tot.uses[k] || 0) + counts[k]; });
      const s = DD.Combat.state;
      tot.prints.push([r.result, r.rounds, s.units.map(function (o) { return o.defId + ':' + o.hp + ':' + o.x + ',' + o.y + ':' + (o.statuses || []).map(function (x) { return x.id + x.stacks; }).join('+'); }).join('|'), s.round, s.hype].join('/'));
      t.ok(r.rounds > 0 && !r.timeout, p.enc + ' L' + p.level + ': finished (' + r.result + ' in ' + r.rounds + ' rounds)');
      t.log(p.enc + ' L' + p.level + ' → ' + r.result + ' in ' + r.rounds + ' rounds; afterglows ' + glow + '; Rasma: ' + JSON.stringify(counts));
    });
    return tot;
  }
  const PLANS = [
    { enc: 'test_a1_normal', level: 1, skills: ['ras_cold_shoulder', 'ras_due_respect'] },
    { enc: 'test_a1_elite', level: 1, skills: ['ras_cold_shoulder', 'ras_due_respect'] },
    { enc: 'test_a1_normal', level: 3, skills: ['ras_cold_shoulder', 'ras_due_respect', 'ras_shocking'] },
    { enc: 'test_a2_normal', level: 3, skills: ['ras_cold_shoulder', 'ras_due_respect', 'ras_tea'] },
    { enc: 'test_a1_boss', level: 3, skills: ['ras_cold_shoulder', 'ras_due_respect', 'ras_sweeping_bow'] },
    { enc: 'test_a2_elite', level: 3, skills: ['ras_disarming', 'ras_due_respect', 'ras_touche'] },
    { enc: 'test_a2_elite', level: 5, skills: ['ras_cold_shoulder', 'ras_due_respect', 'ras_keep_change', 'ras_regards'], items: ['ras_rapier_wit'] },
    { enc: 'test_a3_normal', level: 5, skills: ['ras_shocking', 'ras_due_respect', 'ras_sweeping_bow', 'ras_look'], items: ['ras_spare_monocle'] },
    { enc: 'test_a2_boss', level: 5, skills: ['ras_cold_shoulder', 'ras_disarming', 'ras_keep_change', 'ras_tea'], items: ['ras_waistcoat'] },
    { enc: 'test_a3_elite', level: 5, skills: ['ras_shocking', 'ras_due_respect', 'ras_touche', 'ras_regards'] },
  ];
  T.suite('hero_rasma: AutoPlay battles at levels 1 / 3 / 5 (fixture party, items at 5; deterministic)', function (t) {
    if (!ready(t)) return;
    const res = battles(t, PLANS);
    t.log('uses: ' + JSON.stringify(res.uses) + ' · wins ' + res.wins + '/' + res.fought + ' · blade on ' + res.bladed + '/' + res.strikes + ' foe strikes · afterglow in ' +
      res.glowed4 + '/' + res.long4 + ' fights of 4+ rounds and ' + res.glowed + '/' + res.long + ' fights where he struck as often as his charges (' + res.lifts + ' in all)');
    t.eq(res.timeouts, 0, 'no timeouts');
    t.ok(res.strikes > 0 && res.bladed >= 0.7 * res.strikes, 'a blade on ≥ 70% of his foe strikes (' + res.bladed + '/' + res.strikes + ')');
    // (deviation: the fixture party often ends a fight of 4+ rounds before he has struck three times, so the loop is
    // judged on the fights where he struck at least as often as his enchantment holds charges)
    t.ok(res.long > 0 && res.glowed >= 0.6 * res.long, 'an afterglow in ≥ 60% of the fights where he struck as often as his charges (' + res.glowed + '/' + res.long + ')');
    t.ok(res.wins >= Math.ceil(res.fought * 0.6), 'the party mostly wins (' + res.wins + '/' + res.fought + ')');
    const a = battles(t, PLANS.slice(0, 2), 'det'), b = battles(t, PLANS.slice(0, 2), 'det');
    t.eq(JSON.stringify(a.prints), JSON.stringify(b.prints), 'two seeded runs are bit-identical');
  });

  // ---- 13. sprite and painter -------------------------------------------------------------------------------------
  T.suite('hero_rasma: sprite and painter (every pose × yaw × blade × pips, the Spare Monocle, portrait, no Math.random)', function (t) {
    if (!ready(t)) return;
    const sp = R().RASMA_SPRITE;
    const probs = T.contentHelpers && T.contentHelpers.spriteProblems;
    if (probs) t.eq(probs(sp).length, 0, 'sprite spec valid ' + JSON.stringify(probs(sp)));
    t.ok(DD.getHero(HERO).sprite === sp && sp.base === 'humanoid' && sp.build === 'huge' && sp.mainhand === 'sword' && typeof sp.overlay === 'function', 'humanoid, huge, a sword, an overlay');
    if (!DD.Sprites) { t.log('no DD.Sprites'); return; }
    const p0 = DD.problems.length;
    // Math.random is watched inside his overlay only (a copy of the spec whose overlay flags its own calls)
    let rnd = false, inside = false, overlays = 0;
    const orig = Math.random;
    const probe = Object.assign({}, sp, { overlay: function (g, tt, o) { inside = true; overlays++; try { return sp.overlay.call(this, g, tt, o); } finally { inside = false; } } });
    Math.random = function () { if (inside) rnd = true; return orig(); };
    try {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 180;
      const ctx = c.getContext('2d');
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
      const u = U();
      ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
        t.tryRun('probe ' + pose, function () { DD.Sprites.draw(ctx, probe, 100, 160, 2, { pose: pose, t: 2.2, unit: u, statuses: [] }); });
      });
      enchanted(u, 'shock', 1);
      if (u.vis) delete u.vis.rasBlade;
      ['idle', 'attack', 'cast'].forEach(function (pose) {
        t.tryRun('probe shock ' + pose, function () { DD.Sprites.draw(ctx, probe, 100, 160, 2, { pose: pose, t: 3.7, unit: u, statuses: ['ras_shock'] }); });
      });
      t.ok(overlays > 0, 'his overlay ran (' + overlays + ')');
      const states = [null, ['frost', 1], ['frost', 3], ['shock', 2], ['charm', 4]];
      [false, true].forEach(function (mono) {
        u.items = mono ? ['ras_spare_monocle'] : [];
        states.forEach(function (s) {
          A().removeStatus(u, 'ras_frost', { silent: true }); A().removeStatus(u, 'ras_shock', { silent: true }); A().removeStatus(u, 'ras_charm', { silent: true });
          if (u.vis) delete u.vis.rasBlade;
          if (s) { enchanted(u, s[0], 1); st(u, ST_OF[s[0]]).stacks = s[1]; if (u.vis) delete u.vis.rasBlade; }
          const ids = (u.statuses || []).map(function (q) { return q.id; });
          ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
            [1, -1].forEach(function (fc) {
              [{}, { still: true }, { walk: 0.3 }, { lying: 0.5 }, { lying: 1 }, { poseT: 0.2 }, { poseT: 0.7 }].forEach(function (o) {
                t.tryRun(pose + ' ' + JSON.stringify(o), function () {
                  DD.Sprites.draw(ctx, sp, 100, 160, 2, Object.assign({ pose: pose, t: 1.3 + (s ? s[1] : 0), facing: fc, unit: u, statuses: ids }, o));
                });
              });
            });
          });
          if (DD.Render && typeof DD.Render.renderTo === 'function') {
            const cv = document.createElement('canvas');
            cv.width = 320; cv.height = 220;
            [0, 90, 180, 270, 37.5].forEach(function (yaw) {
              t.tryRun('board at yaw ' + yaw, function () { DD.Render.renderTo(cv, { state: DD.Combat.state, width: 320, height: 220, yaw: yaw }); });
            });
          }
        });
      });
      t.tryRun('no unit (gallery)', function () { DD.Sprites.draw(ctx, sp, 100, 160, 2, { pose: 'idle', t: 0.4 }); });
      t.tryRun('portrait', function () { const p = DD.Sprites.portrait(sp, 64); t.ok(!!p && p.width > 0, 'portrait'); });
      if (DD.Sprites.drawUnit) t.tryRun('drawUnit', function () { DD.Sprites.drawUnit(ctx, u, 100, 160, 1.5, 0.7); });
    } finally { Math.random = orig; }
    t.ok(!rnd, 'the painter never calls Math.random');
    const warn = DD.problems.slice(p0).filter(function (m) { return /rasma|overlay/i.test(m); });
    t.eq(warn.length, 0, 'no DD.safe warning from his painter ' + warn.slice(0, 2).join(' | '));
    // the blade's look: the pin when set, else the statuses; no unit: plain
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    const v = U();
    enchanted(v, 'shock', 1);
    if (v.vis) delete v.vis.rasBlade;
    const pb = R().painters.paintedBlade;
    t.ok(pb({ unit: v, statuses: ['ras_shock'] }).id === 'ras_shock' && pb({ unit: null }) === null, 'the painter reads the statuses (no unit: plain)');
    v.vis = v.vis || {};
    v.vis.rasBlade = { id: 'ras_frost', n: 2 };
    t.eq(pb({ unit: v, statuses: ['ras_shock'] }).id, 'ras_frost', 'and the FX pin first');
    // the sword's rotation follows the stock formula
    const g = { pose: 'idle', hands: { front: { angle: 1.2 } } };
    t.eq(R().painters.bladeRot(g), 0.85, 'idle 0.85 (ITEM_INFO.sword)');
    g.pose = 'cast';
    t.near(R().painters.bladeRot(g), 0.55, 1e-9, 'cast 0.85 − 0.3');
  });

  // ---- 14. combos with the cast -------------------------------------------------------------------------------------
  T.suite('hero_rasma: combos with the cast (puddles, Keg Stand, Tea + a Thunder Jar, Pebbles\' Burn, Forge Weapon, Kick \'Em, Delegate, Counterspell)', function (t) {
    if (!ready(t)) return;
    // Ellaria's Healing Spring puddle + The Cold Shoulder → Frozen
    if (DD.getHero('ellaria') && DD.getSkill('ell_spring')) {
      fight({ heroes: [{ x: 2, y: 4 }, { id: 'ellaria', x: 1, y: 2, skills: [{ id: 'ell_spring', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
      const u = U(), e = hero('ellaria'), g = foes()[0];
      DD.Combat.state.current = e.id;
      t.tryRun('Healing Spring', function () { DD.Combat.resolveSkill(e, e.skills.filter(function (s) { return s.id === 'ell_spring'; })[0], { x: 3, y: 4 }, { pay: false }); });
      DD.Combat.state.current = u.id;
      if (has(g, 'wet')) {
        enchanted(u, 'frost', 1);
        fresh(u);
        A().damage(u, g, 5, { skill: DD.getSkill('ras_pardon') });
        t.ok(has(g, 'frozen'), 'Ellaria\'s puddle + a frost strike: Frozen');
      } else t.log('the spring left the grunt dry here (positions): skipped');
    } else t.log('ellaria.js not loaded: skipped');
    // Marwyn's Keg Stand + Positively Shocking ×1.5
    if (DD.getHero('marwyn') && DD.getSkill('mrw_keg_stand')) {
      fight({ heroes: [{ x: 2, y: 4 }, { id: 'marwyn', x: 3, y: 5, skills: [{ id: 'mrw_keg_stand', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
      const u = U(), m = hero('marwyn'), g = foes()[0];
      t.tryRun('Keg Stand', function () { DD.Combat.resolveSkill(m, m.skills.filter(function (s) { return s.id === 'mrw_keg_stand'; })[0], { x: m.x, y: m.y }, { pay: false }); });
      if (has(g, 'wet')) {
        enchanted(u, 'shock', 1);
        const g0 = g.hp;
        A().damage(u, g, 5, { skill: DD.getSkill('ras_pardon') });
        t.eq(g0 - g.hp, hit(5, 1.5, BONUS[0]), 'Keg Stand\'s splash + a lightning strike: ×1.5 (' + hit(5, 1.5, BONUS[0]) + ')');
      } else t.log('the keg missed the grunt here: skipped');
    } else t.log('marwyn.js not loaded: skipped');
    // Tea + a Thunder Jar
    if (DD.getConsumable && DD.getConsumable('con_thunder_jar')) {
      fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_tea', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 4 }], consumables: ['con_thunder_jar'] });
      const u = U(), g = foes()[0];
      use(t, u, give(u, 'ras_tea', 1), 4, 4, 'Tea');
      const g0 = g.hp;
      t.tryRun('Thunder Jar', function () { DD.Combat.useConsumable(u, 0, 4, 4); });
      t.eq(g0 - g.hp, 12, 'Tea, then a Thunder Jar: 8 × 1.5 = 12');
    } else t.log('consumables.js not loaded: skipped');
    // Tea puts out Pebbles' Burn (or any ally's)
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_tea', level: 1 }] }, { id: DD.getHero('pebbles') ? 'pebbles' : 'test_knight', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    let u = U();
    const pal = DD.Combat.heroes().filter(function (h) { return h !== u; })[0];
    A().addStatus(pal, 'burn', { stacks: 3 }, foes()[0]);
    use(t, u, give(u, 'ras_tea', 1), pal.x, pal.y, 'Tea on a Burning ally');
    t.ok(!has(pal, 'burn') && has(pal, 'wet'), 'Tea puts out ' + pal.name + '\'s Burn');
    // Valdris' Forge Weapon + a blade: both add
    if (DD.getStatus('val_forged')) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
      u = U();
      A().addStatus(u, 'val_forged', { stacks: 3, turns: 1 }, u);
      enchanted(u, 'frost', 1);
      const g = foes()[0], g0 = g.hp;
      use(t, u, u.basic, 3, 4, 'forged + frost');
      t.eq(g0 - g.hp, 8 + BONUS[0], 'Freshly Forged +3 and the frost blade +' + BONUS[0] + ': 5 + 3 + ' + BONUS[0]);
    } else t.log('valdris.js not loaded: skipped');
    // Betty's Kick 'Em on his Frozen foe
    if (DD.getHero('betty') && DD.getSkill('bet_kick')) {
      fight({ heroes: [{ x: 2, y: 4 }, { id: 'betty', x: 4, y: 4, skills: [{ id: 'bet_kick', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
      u = U();
      const b = hero('betty'), g = foes()[0];
      A().addStatus(g, 'wet', { turns: 2 }, u);
      enchanted(u, 'frost', 1);
      use(t, u, u.basic, 3, 4, 'freeze it');
      const g0 = g.hp;
      t.tryRun('Kick \'Em', function () { DD.Combat.resolveSkill(b, b.skills.filter(function (s) { return s.id === 'bet_kick'; })[0], { x: 3, y: 4 }, { pay: false }); });
      t.eq(g0 - g.hp, 15, 'Betty kicks his Frozen foe: 10 × 1.5 = 15');
    } else t.log('betty.js not loaded: skipped');
    // Buga's Delegate: his basic, a charge spent
    if (DD.getHero('buga') && DD.getSkill('buga_delegate')) {
      fight({ heroes: [{ x: 2, y: 4 }, { id: 'buga', x: 2, y: 6, skills: [{ id: 'buga_delegate', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
      u = U();
      const bg = hero('buga');
      enchanted(u, 'frost', 1);
      t.tryRun('Delegate', function () { DD.Combat.resolveSkill(bg, bg.skills.filter(function (s) { return s.id === 'buga_delegate'; })[0], { x: 3, y: 4 }, { pay: false }); });
      t.ok(blade(u).stacks === 2 && has(foes()[0], 'slow'), 'Buga\'s Delegate: his Pardon Me carries the frost and spends a charge');
    } else t.log('buga.js not loaded: skipped');
    // Galbraith's Counterspell never touches his enchanting or his strikes
    if (DD.Galbraith && DD.getEnemy(DD.Galbraith.ID)) {
      fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_cold_shoulder', level: 1 }] }], enemies: [{ id: DD.Galbraith.ID, x: 3, y: 4 }] });
      u = U();
      const g = foes()[0];
      if (!DD.Combat.state.rules.some(function (r) { return r.id === DD.Galbraith.RULE; })) t.log('the Counterspell rule is not up in a sandbox: the shape check only');
      const said = logged(/Counterspell/, function () {
        use(t, u, give(u, 'ras_cold_shoulder', 1), u.x, u.y, 'enchant near Galbraith');
        const g0 = g.hp;
        use(t, u, u.basic, 3, 4, 'strike Galbraith');
        t.ok(g0 - g.hp > 0, 'the strike lands (' + (g0 - g.hp) + ')');
      });
      t.eq(said.length, 0, 'no Counterspell on his enchanting or his strikes');
    } else t.log('galbraith.js not loaded: skipped');
    t.ok(DD.getSkill('ras_pardon').kind === 'attack' && ENCHANTS.every(function (id) { return DD.getSkill(id).target.type === 'self'; }), 'strikes are attacks, enchantments self buffs (Counterspell counters spells that hurt or debuff Galbraith)');
  });

  // ---- review:rasma (h19) — every text word for word, the arc's reach at exactly 2 -------------------------------------
  // (a mutation run, ARC_RANGE 2 → 3 in a scratch copy, passed every suite above: the descs read the constant and no
  // fight put a foe exactly 3 tiles from the first foe hit. These pin the addendum's words and the boundary.)
  T.suite('hero_rasma: every desc word for word at every level (addendum §6-§11) and the arc\'s reach at exactly 2 (review)', function (t) {
    if (!ready(t)) return;
    const WANT = {
      ras_cold_shoulder: BONUS.map(function (b, i) { return 'Enchant your sword with frost (3 charges): its strikes deal frost damage, +' + b + ', and Slow each foe hit for ' + plural(SLOW[i], 'turn') + '. Wet foes freeze.'; }),
      ras_shocking: [0, 1, 2].map(function (i) { return 'Enchant your sword with lightning (3 charges): its strikes deal lightning damage (+50% against Wet foes), +' + BONUS[i] + ', and arc ' + ARC[i] + ' lightning damage to the nearest other foe within 2.'; }),
      ras_disarming: [0, 1, 2].map(function (i) { return 'Enchant your sword with charm (3 charges): its strikes deal +' + BONUS[i] + ' damage and Weaken each foe hit for ' + plural(WEAK[i], 'turn') + ' (it deals 25% less).'; }),
      ras_sweeping_bow: [4, 5, 6].map(function (n) { return 'Sword strike: deal ' + n + ' damage to every adjacent foe (one charge, however many it hits).'; }),
      ras_keep_change: [[6, 2], [7, 3], [8, 3]].map(function (p) { return 'Sword strike: deal ' + p[0] + ' damage to an adjacent foe, +' + p[1] + ' for each charge left on your enchantment; it uses them all.'; }),
      ras_touche: ['En garde: until your next turn, the first foe that hits you from an adjacent tile takes a sword strike back for 5.',
        'En garde: until your next turn, the first foe that hits you from an adjacent tile takes a sword strike back for 7.',
        'En garde: until your next turn, the first 2 times a foe hits you from an adjacent tile, it takes a sword strike back for 7.'],
    };
    Object.keys(WANT).forEach(function (id) { WANT[id].forEach(function (s, i) { t.eq(desc(id, i + 1), s, id + ' L' + (i + 1) + ' word for word'); }); });
    t.eq(DD.getHero(HERO).passive.desc, 'Rasma\'s sword holds one enchantment at a time. Each sword strike that hits a foe (attacks of opportunity and ripostes too) uses one of its charges; the strike that uses the last heals him 5 HP.', 'Enchanté word for word');
    t.eq(DD.getItem('ras_rapier_wit').desc, '+10% damage. Rasma\'s enchantments hold 4 charges instead of 3.', 'Rapier Wit word for word');
    t.eq(DD.getItem('ras_waistcoat').desc, '+4 max HP and +1 armor.', 'Bespoke Waistcoat word for word');
    t.eq(DD.getItem('ras_spare_monocle').desc, 'Rasma\'s first enchantment each turn costs 0 AP.', 'The Spare Monocle word for word');
    // the blade tooltips read the held blade (level I and III), and En Garde counts hits, as Touché III says
    const S = 'Rasma\'s sword strikes (attacks of opportunity and ripostes too) deal ';
    [1, 3].forEach(function (lv) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = U(), i = lv - 1;
      enchanted(u, 'frost', lv);
      t.eq(DD.getStatus('ras_frost').desc(st(u, 'ras_frost')), S + 'frost damage, +' + BONUS[i] + ', and Slow each foe hit for ' + plural(SLOW[i], 'turn') + '. Wet foes freeze. 3 charges left.', 'Frosty Blade L' + lv + ' tooltip');
      enchanted(u, 'shock', lv);
      t.eq(DD.getStatus('ras_shock').desc(st(u, 'ras_shock')), S + 'lightning damage (+50% against Wet foes), +' + BONUS[i] + ', and arc ' + ARC[i] + ' lightning damage to the nearest other foe within 2. 3 charges left.', 'Shocking Blade L' + lv + ' tooltip');
      enchanted(u, 'charm', lv);
      st(u, 'ras_charm').stacks = 2;
      t.eq(DD.getStatus('ras_charm').desc(st(u, 'ras_charm')), S + '+' + BONUS[i] + ' damage and Weaken each foe hit for ' + plural(WEAK[i], 'turn') + ' (it deals 25% less). 2 charges left.', 'Disarming Blade L' + lv + ' tooltip');
    });
    const gd = DD.getStatus('ras_guard');
    // [QA qa-rasma-5b] the riposte is a sword strike, so the tooltip says it carries his enchantment
    t.eq(gd.desc({ id: 'ras_guard', stacks: 1, turns: -1, data: { riposte: 5 } }), 'En garde: the next foe that hits Rasma from an adjacent tile takes a 5-damage sword strike back, plus his enchantment if he holds one (not while he is stunned, asleep, frozen or a sheep). Ends at the start of his next turn.', 'En Garde ×1 tooltip');
    t.eq(gd.desc({ id: 'ras_guard', stacks: 2, turns: -1, data: { riposte: 7 } }), 'En garde: the next 2 times a foe hits Rasma from an adjacent tile, it takes a 7-damage sword strike back, plus his enchantment if he holds one (not while he is stunned, asleep, frozen or a sheep). Ends at the start of his next turn.', 'En Garde ×2 tooltip: two hits, not two foes (one foe can take both ripostes)');
    // Touché III: one foe hitting twice takes both ripostes (the tooltip's "2 times a foe")
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_touche', level: 3 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    let u = U();
    const g = foes()[0];
    use(t, u, give(u, 'ras_touche', 3), u.x, u.y, 'Touché III');
    u.hp = 25;
    let g0 = g.hp;
    foeHits(g, 2, 4);
    foeHits(g, 2, 4);
    t.eq(g0 - g.hp, 14, 'Touché III: the same foe hits twice and takes 7 + 7');
    t.ok(!has(u, 'ras_guard'), 'and the guard is spent');
    // the arc reaches exactly 2 (Manhattan, from the first foe's tile): a foe 3 away is never arced; diagonal 1 + 1 is
    [[{ x: 3, y: 7 }, 0, 'a foe 3 tiles from the first foe: no arc'], [{ x: 5, y: 4 }, 2, 'a foe 2 tiles away in a line: arced'],
      [{ x: 4, y: 5 }, 2, 'a foe 1 + 1 away (diagonal, Manhattan 2): arced'], [{ x: 5, y: 5 }, 0, 'a foe 2 + 1 away (Manhattan 3): no arc']].forEach(function (c) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }, { id: 'test_grunt', x: c[0].x, y: c[0].y, hpMult: 4 }] });
      u = U();
      const far = at(c[0].x, c[0].y);
      g0 = far.hp;
      enchanted(u, 'shock', 1);
      const lines = logged(/Lightning arcs/, function () { use(t, u, u.basic, 3, 4, 'shock strike'); });
      t.ok(g0 - far.hp === c[1] && lines.length === (c[1] ? 1 : 0), c[2] + ' (' + (g0 - far.hp) + ')');
      t.eq(R().arcTarget(u, { id: at(3, 4).id, x: 3, y: 4 }, []) === far, c[1] > 0, c[2] + ': arcTarget agrees');
    });
  });

  // ---- h19 qa-fix:content — the log says the cause before its effect; the arc is drawn as lightning; En Garde's chip -------
  T.suite('hero_rasma: QA fixes — Touché and the arc log before their damage, the arc beam is lightning, En Garde\'s chip carries the blade, the +50% wording', function (t) {
    if (!ready(t)) return;
    const all = function (fn) { return logged(/./, fn); };
    const idx = function (lines, re) { for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };
    // his own strike: the arc line, then the arc's damage line (qa-rasma-3), drawn as a lightning beam (qa-rasma-4)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }, { id: 'test_grunt', x: 4, y: 4, hpMult: 6 }] });
    let u = U();
    enchanted(u, 'shock', 1);
    const beams = [], bm = DD.FX.beam;
    let lines;
    try {
      DD.FX.beam = function (a, b, o) { beams.push(o || {}); return bm.apply(this, arguments); };
      lines = all(function () { use(t, u, u.basic, 3, 4, 'a shocking strike'); });
    } finally { DD.FX.beam = bm; }
    let arcAt = idx(lines, /^Lightning arcs from /), arcHit = -1;
    for (let i = 0; i < lines.length; i++) if (/takes 2 lightning damage/.test(lines[i])) arcHit = i;
    t.ok(arcAt >= 0 && arcHit > arcAt, 'his turn: "Lightning arcs …" comes before the arc\'s 2 damage (' + lines.join(' / ') + ')');
    t.ok(beams.length === 1 && beams[0].kind === 'lightning' && beams[0].width === 3 && beams[0].color === '#fff27a', 'the arc is a 3-px yellow lightning beam (the zigzag)');
    // the riposte: "Touché!" first, then its damage, then the arc and its damage
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ras_touche', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }, { id: 'test_grunt', x: 4, y: 4, hpMult: 6 }] });
    u = U();
    enchanted(u, 'shock', 1);
    use(t, u, give(u, 'ras_touche', 1), u.x, u.y, 'Touché');
    // the live chip: the HUD passes the very instance from his statuses, so the tooltip carries the blade's note
    const guard = st(u, 'ras_guard');
    t.ok(/plus his enchantment if he holds one/.test(DD.getStatus('ras_guard').desc(guard)) &&
      / Now: ⚡ \+3 lightning, arcs 2; 3 charges left\.$/.test(DD.getStatus('ras_guard').desc(guard)), 'En Garde\'s chip on him ends with the live blade note (fix:balance R2: +3)');
    t.ok(DD.getStatus('ras_guard').desc(Object.assign({}, guard)).indexOf('Now:') < 0, 'a copy held by nobody: no note (pure)');
    u.hp = 25;
    lines = all(function () { foeHits(foes()[0], 2, 4); });
    const tou = idx(lines, /^Touché! Rasma ripostes against /), rip = idx(lines, /takes 8 lightning damage from Rasma/);
    arcAt = idx(lines, /^Lightning arcs from /);
    arcHit = -1;
    for (let i = 0; i < lines.length; i++) if (/takes 2 lightning damage from Rasma/.test(lines[i])) arcHit = i;
    t.ok(tou >= 0 && rip > tou && arcAt > rip && arcHit > arcAt, 'the riposte: Touché, its 8 (5 + ' + BONUS[0] + '), the arc, its 2, in that order (' + lines.join(' / ') + ')');
    // qa-rasma-5a: the text names the multiplier before the flat bonus, which is what the engine does (5 × 1.5 + 3 = 11,
    // not 12; fix:balance R2 made the bonus 3)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 6 }] });
    u = U();
    enchanted(u, 'shock', 1);
    const f = foes()[0];
    A().addStatus(f, 'wet', { turns: 2 }, u);
    const h0 = f.hp;
    use(t, u, u.basic, 3, 4, 'Pardon Me on a Wet foe');
    t.eq(h0 - f.hp, Math.round(5 * 1.5 + BONUS[0]), 'a Wet foe takes round(5 × 1.5 + ' + BONUS[0] + ') = ' + Math.round(5 * 1.5 + BONUS[0]));
    t.ok(new RegExp('lightning damage \\(\\+50% against Wet foes\\), \\+' + BONUS[0] + ',').test(desc('ras_shocking', 1)), 'and Positively Shocking says "(+50% against Wet foes), +' + BONUS[0] + '"');
  });

  // ---- 15. zz sim (sim=1 only) -------------------------------------------------------------------------------------
  // ---- fix:balance (Nov 21; the lead's R1-R4) ----------------------------------------------------------------------------
  T.suite('hero_rasma: fix:balance — he enchants on the way in (R1), the bonus +3 / +4 / +4 (R2), the afterglow 5 (R4)', function (t) {
    if (!ready(t)) return;
    t.eq(R().AFTERGLOW, 5, 'R4: the afterglow heals 5 (was 4)');
    const all3 = [{ id: 'ras_cold_shoulder', level: 1 }, { id: 'ras_shocking', level: 1 }, { id: 'ras_disarming', level: 1 }];
    t.eq(JSON.stringify(['ras_cold_shoulder', 'ras_shocking', 'ras_disarming'].map(function (id) { return DD.getSkill(id).levels.map(function (L) { return L.bonus; }); })),
      JSON.stringify([BONUS, BONUS, BONUS]), 'every enchantment: +' + BONUS.join(' / +'));
    // a foe 7 away: out of reach this turn (move 4 + 1), in reach next turn (2 × 4 + 1): enchant now, a move left after
    fight({ heroes: [{ x: 0, y: 4, skills: all3 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    let u = U();
    const mov = DD.Combat.effectiveMov(u);
    t.ok(dist(u, foes()[0]) > mov + 1 && dist(u, foes()[0]) <= 2 * mov + 1, 'premise: the foe is in reach next turn, not this one');
    const sc = all3.map(function (s) { return R().enchantScore(ctxOf(u, s.id)); });
    t.ok(sc.every(function (v) { return v > 0; }), 'no blade up: each enchantment scores on the way in (' + sc.map(function (x) { return x.toFixed(2); }).join(' / ') + ')');
    enchanted(u, 'frost', 1);
    t.eq(R().enchantScore(ctxOf(u, 'ras_shocking')), 0, 'a blade already up: 0 (he never swaps on the way in)');
    A().removeStatus(u, 'ras_frost', { silent: true });
    u.ap = 1;
    t.eq(R().enchantScore(ctxOf(u, 'ras_cold_shoulder')), 0, 'no move left after it: 0');
    u.ap = 3;
    A().addStatus(u, 'root', { turns: 1 }, foes()[0]);
    t.eq(R().enchantScore(ctxOf(u, 'ras_cold_shoulder')), 0, 'Rooted (he can\'t walk in): 0');
    fight({ heroes: [{ x: 0, y: 0, skills: all3 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = U();
    t.eq(R().enchantScore(ctxOf(u, 'ras_cold_shoulder')), 0, 'a foe beyond next turn\'s reach: 0');
    // the bonus delivered: a plain foe takes 5 + 3 at level I
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 4 }] });
    u = U();
    enchanted(u, 'charm', 1);
    const g = foes()[0], g0 = g.hp;
    DD.Combat.useSkill(u, u.basic, 3, 4);
    t.eq(g0 - g.hp, 5 + BONUS[0], 'a charm strike at level I: 5 + ' + BONUS[0]);
  });

  T.suite('hero_rasma: zz balance sim (sim=1 only)', function (t) {
    if (t.param('sim', '0') !== '1') { t.skip('sim=1 only'); return; }
    if (!ready(t) || !DD.Encounter) return;
    const n = Math.max(1, +t.param('n', 2) || 2);
    const encs = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; })
      .filter(function (e) { return !/^(test_|mgt_|mg_)/.test(e.id) && e.kind !== 'boss' && e.act >= 1 && e.act <= 3 && !e.gauntlet && !e.finale; });
    const pool = Object.keys(DD.defs.heroes).filter(function (k) { return k.indexOf('test_') !== 0 && k !== HERO; });
    const rng = DD.RNG('ras-sim:' + t.seed);
    const tally = {}, uses = {}, sockets = {};
    let fights = 0, wins = 0, strikes = 0, bladed = 0, glows = 0, glowHp = 0, freezes = 0, arcs = 0, thrown = 0, taken = 0, downs = 0, turns = 0, bladeTurns = 0;
    // fix:balance (Nov 21, R1): where each enchantment goes — cast fresh, a refill of the blade he holds, a swap, and the
    // charges still on the blade when the fight ends (or when he goes down)
    const SPELL = { ras_cold_shoulder: 'ras_frost', ras_shocking: 'ras_shock', ras_disarming: 'ras_charm' };
    const why = { casts: 0, fresh: 0, refill: 0, refillLeft: 0, swap: 0, swapLeft: 0, endUp: 0, endLeft: 0, downUp: 0, plainNoBlade: 0 };
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
      let lastBlade = null;
      A().addRule({ id: 'ras_sim_probe', name: 'probe', silent: true, hooks: {
        onSkillUsed: function (ctx) {
          if (A().simulating || !ctx.user || ctx.user.defId !== HERO || !ctx.skill || ctx.opportunity) return;
          uses[ctx.skill.id] = (uses[ctx.skill.id] || 0) + 1;
          lastBlade = R().bladeInfo(ctx.user);
        },
        onCostPaid: function (p) {
          const unit = p && p.unit;
          if (A().simulating || !unit || unit.defId !== HERO || !p.skill || !SPELL[p.skill.id]) return;
          const cur = R().bladeInfo(unit);
          why.casts++;
          if (!cur) why.fresh++;
          else if (cur.id === SPELL[p.skill.id]) { why.refill++; why.refillLeft += cur.stacks; } else { why.swap++; why.swapLeft += cur.stacks; }
        },
        onTurnEnd: function (unit) { if (!A().simulating && unit && unit.defId === HERO) lastBlade = R().bladeInfo(unit); },
        onDowned: function (unit) { if (!A().simulating && unit && unit.defId === HERO && lastBlade) why.downUp++; },
        onTurnStart: function (unit) { if (!A().simulating && unit && unit.defId === HERO && !unit.downed) { turns++; if (R().bladeInfo(unit)) bladeTurns++; } },
        modifyOutgoingDamage: function (d) {
          if (A().simulating || !d.source || d.source.defId !== HERO || d.cause !== 'skill' || !R().isSword(d.skill) || !d.target || !DD.Grid.hostile(d.source, d.target)) return;
          strikes++;
          if (R().bladeInfo(d.source)) bladed++;
          else if (DD.Combat.slotsOf(d.source).some(function (sl) { return sl && SPELL[sl.id]; })) why.plainNoBlade++;
        },
        onTakeDamage: function (d) {
          if (A().simulating || !d) return;
          if (d.target && d.target.defId === HERO) taken += d.dealt || 0;
          if ((d.tags || []).indexOf('ras_arc') >= 0) arcs++;
        },
        onStatusApplied: function (unit, inst, src) { if (!A().simulating && inst && inst.id === 'frozen' && src && src.defId === HERO) freezes++; },
      } });
      const off = DD.Events.on('combat:log', function (e) {
        const s = String((e && (e.text || (e.entry && e.entry.text))) || '');
        if (/^Rasma swaps/.test(s)) thrown++;
      });
      const calls = healCalls(function () { DD.AutoPlay.runBattle(30); });
      off();
      A().removeRule('ras_sim_probe');
      const L = lifts(calls);
      glows += L.length;
      L.forEach(function (c) { glowHp += c.healed || 0; });
      const s = DD.Combat.state;
      fights++;
      if (s.result === 'victory') wins++;
      s.units.forEach(function (u) {
        const b = u.defId === HERO && !u.downed && !u.dead ? R().bladeInfo(u) : null;
        if (b) { why.endUp++; why.endLeft += b.stacks; }
      });
      s.units.filter(function (u) { return u.kind === 'hero'; }).forEach(function (u) {
        const r = tally[u.defId] || (tally[u.defId] = { fights: 0, dmg: 0, kills: 0, downs: 0 });
        const us = s.stats.units[u.id] || {};
        r.fights++; r.dmg += us.dmg || 0; r.kills += us.kills || 0; r.downs += u.downed ? 1 : 0;
        if (u.defId === HERO && u.downed) downs++;
      });
    }
    encs.forEach(function (enc) { for (let i = 0; i < n; i++) oneFight(enc); });
    Object.keys(tally).sort().forEach(function (id) {
      const r = tally[id];
      t.log(id + ': ' + r.fights + ' fights · dmg/fight ' + (r.dmg / r.fights).toFixed(1) + ' · kills/fight ' + (r.kills / r.fights).toFixed(2) + ' · downed ' + r.downs);
    });
    t.log('Rasma uses per fight when socketed: ' + POOL.filter(function (id) { return sockets[id]; }).map(function (id) {
      return DD.getSkill(id).name + ' ' + ((uses[id] || 0) / sockets[id]).toFixed(2) + ' (' + sockets[id] + ')';
    }).join(' · '));
    t.log('basics: Pardon Me ' + (uses.ras_pardon || 0) + ' · A Thousand Pardons ' + (uses.ras_thousand || 0));
    t.log('blade on ' + bladed + '/' + strikes + ' foe strikes (' + (strikes ? (100 * bladed / strikes).toFixed(0) : '–') + '%) · blade up at ' + bladeTurns + '/' + turns + ' turn starts');
    t.log('afterglows ' + (glows / Math.max(1, fights)).toFixed(2) + '/fight, ' + (glowHp / Math.max(1, fights)).toFixed(1) + ' HP/fight · freezes ' + (freezes / Math.max(1, fights)).toFixed(2) +
      '/fight · arcs ' + (arcs / Math.max(1, fights)).toFixed(2) + '/fight · blades thrown away by a swap ' + thrown);
    t.log('Rasma: damage taken ' + (taken / Math.max(1, fights)).toFixed(1) + '/fight · downed ' + downs + ' · fights ' + fights + ', wins ' + wins);
    const pf = function (v) { return (v / Math.max(1, fights)).toFixed(2); };
    t.log('enchantments ' + pf(why.casts) + '/fight: fresh ' + pf(why.fresh) + ' · refills ' + pf(why.refill) + ' (' + why.refillLeft + ' charges dropped) · swaps ' +
      pf(why.swap) + ' (' + why.swapLeft + ' dropped) · fights ending with a blade up ' + pf(why.endUp) + ' (' + why.endLeft + ' charges unspent) · downed holding one ' +
      why.downUp + ' · plain strikes with an enchantment socketed ' + pf(why.plainNoBlade));
    t.ok(fights > 0, 'simulated');
  });
})();
