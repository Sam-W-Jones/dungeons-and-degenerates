/* Dungeons and Degenerates — tests/content/hero_benedick.js
 * Suites "hero_benedick: …" for js/data/heroes/benedick.js (owner: HERO-BENEDICK; spec .tmp/v3/addendum-benedick.md §18):
 * the hero def, both basics, Coming Out of My Shell (the shell, the Dragonsnail, cooldowns, the D9 guard: withdrawing,
 * emerging and landing never change his HP), the safe landing, the slime trail (laid at turn end, three Undo cases),
 * Snail Slime's stop rule, every skill at every level in both forms, Snail Mail, The Inevitable, the items, HUD previews,
 * v2 edge cases, attacks of opportunity, AutoPlay (scores and fixture battles), the look following the statuses, the
 * painters at every yaw, combos with the cast (skipped when a hero file isn't loaded) and the zz sim (sim=1 only).
 * Run: bash tools/test.sh "suite=hero_benedick&isolate=heroes/benedick,hero_benedick"
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const HERO = 'benedick';
  const EITHER = ['ben_slime_line', 'ben_wait', 'ben_lettuce', 'ben_shellacking', 'ben_spit_shine', 'ben_mail'];
  const DRAGON_ONLY = ['ben_breath', 'ben_wing_it', 'ben_riddle'];
  const POOL = ['ben_shell'].concat(EITHER, DRAGON_ONLY);
  const ALL = ['ben_teeth', 'ben_slow_burn', 'ben_inevitable'].concat(POOL);
  const ITEMS = ['ben_mucin_serum', 'ben_racing_stripes', 'ben_dnd_sign'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const CUSTOM_BARKS = ['shell', 'emerge', 'land', 'glide', 'stuck', 'mail', 'delivery', 'breath', 'riddle', 'dnd'];
  const CAPS_BARKS = ['emerge', 'breath', 'riddle'];
  const RESERVED = ['Fourteen Thousand Teeth', 'Slow Burn', 'Coming Out of My Shell', 'Slime Line', 'I\'ll Wait', 'Lettuce Pray', 'Shellacking',
    'Spit Shine', 'Snail Mail', 'Morning Breath', 'Wing It', 'Riddle Me This', 'The Inevitable', 'A Sticky Situation', 'Snail Slime',
    'In His Shell', 'Dragonsnail'];

  // ---- helpers -----------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function Bn() { return DD.Benedick; }
  function ready(t) {
    if (!DD.getHero(HERO) || !Bn()) { t.skip('benedick.js not loaded'); return false; }
    return true;
  }
  /** Sandbox that never ends on its own, 9×9 stone, heroes first; enemies pass unless cfg.enemyAi is true. */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = (cfg.heroes || [{ x: 2, y: 4 }]).map(function (h) { return Object.assign({ id: HERO, level: 1, skills: [] }, h); });
    DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, enemyAi: false, enemies: [],
      objective: { type: 'custom', text: 'Benedick test' }, encounter: { id: 'ben_test_arena', checkObjective: function () { return null; } },
    }, cfg, { heroes: heroes }));
    return DD.Combat.state;
  }
  function B() { return DD.Combat.heroes().filter(function (u) { return u.defId === HERO; })[0]; }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function foes() { return DD.Combat.enemies(); }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function slime(x, y) { const tl = tile(x, y); return !!(tl && tl.surface && tl.surface.id === 'ben_slime'); }
  function slimeTiles() { return DD.Combat.state.grid.tiles.filter(function (tl) { return tl.surface && tl.surface.id === 'ben_slime'; }).map(function (tl) { return tl.x + ',' + tl.y; }).sort(); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }
  function norm(s) { return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function form(u) { return Bn().lookOf(u); }
  /** The slot Benedick uses for a skill: his basic / signature, or a fresh socket at a level (in the right form). */
  function give(u, id, level) {
    level = level || 1;
    if (id === 'ben_inevitable') return u.signature;
    Bn().enterForm(u, 'snail');
    if (id === 'ben_teeth') return u.basic;
    if (id === 'ben_slow_burn') { u.skills = [DD.Act.makeSlot('ben_shell', level)]; Bn().enterForm(u, 'dragon'); return u.basic; }
    const sl = DD.Act.makeSlot(id, level);
    if (DRAGON_ONLY.indexOf(id) >= 0) { u.skills = [DD.Act.makeSlot('ben_shell', 1), sl]; Bn().enterForm(u, 'dragon'); return sl; }
    u.skills = [sl];
    return sl;
  }
  function use(t, u, sl, x, y, label) {
    const why = DD.Combat.canUse(u, sl);
    const ok = why === true && DD.Combat.useSkill(u, sl, x, y);
    t.ok(ok, (label || sl.id) + ' used @' + x + ',' + y + (why === true ? '' : ' (' + why + ')'));
    return ok;
  }
  function valid(u, sl, x, y) { return DD.Targeting.isValidTarget(u, sl, x, y); }
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
    DD.Act.gainHype = function (n, why) { list.push({ n: n, why: String(why || '') }); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.Act.gainHype = orig; }
    return list;
  }
  /** Every heal aimed at u while fn runs (the D9 guard). */
  function healsOn(u, fn) {
    const list = [], orig = DD.Act.heal;
    DD.Act.heal = function (src, target, n) { if (target === u) list.push(n); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.Act.heal = orig; }
    return list;
  }
  function logged(re, fn) {
    const list = [], orig = A().log;
    A().log = function (msg) { if (re.test(String(msg))) list.push(String(msg)); return orig.apply(this, arguments); };
    try { fn(); } finally { A().log = orig; }
    return list;
  }
  function texts(fn) {
    const list = [], orig = DD.FX.text;
    DD.FX.text = function (at, txt) { list.push(String(txt)); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.FX.text = orig; }
    return list;
  }
  /** Skill ids u used (not reactions) while fn runs. */
  function usedBy(u, fn) {
    const list = [];
    A().addRule({ id: 'ben_probe_uses', name: 'Benedick probe', silent: true, hooks: {
      onSkillUsed: function (ctx) { if (!A().simulating && ctx.user === u && !ctx.opportunity && ctx.skill) list.push(ctx.skill.id); },
    } });
    try { fn(); } finally { A().removeRule('ben_probe_uses'); }
    return list;
  }
  /** Preview, use for real, then compare HP changes / KOs / movement / Hype (no dice in his kit: exact). */
  function previewMatches(t, u, sl, x, y, label) {
    const s = DD.Combat.state;
    const before = {};
    s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed, x: o.x, y: o.y }; });
    const hype0 = s.hype, rng0 = s.rng.getState();
    let prev = null;
    t.tryRun(label + ' preview', function () { prev = DD.Combat.preview(u, sl, x, y); });
    t.ok(!!prev && s.rng.getState() === rng0 && s.hype === hype0 &&
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
    t.eq(s.hype - hype0, prev.hype, label + ': Hype = preview');
  }
  /** Walls on rows y−1 and y+1 for x0..x1: a corridor along row y. */
  function corridor(y, x0, x1) {
    return function (tl) { if ((tl.y === y - 1 || tl.y === y + 1) && tl.x >= x0 && tl.x <= x1) tl.t = 'wall'; };
  }
  function textOf(h) {
    const parts = [h.blurb, h.role, h.passive.desc];
    ALL.forEach(function (id) { const s = DD.getSkill(id); for (let lv = 1; lv <= s.levels.length; lv++) parts.push(desc(id, lv)); parts.push(s.flavor || ''); });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); parts.push(it.desc, it.flavor || ''); });
    Object.keys(h.barks).forEach(function (k) { Array.prototype.push.apply(parts, h.barks[k]); });
    return parts.join(' \n ');
  }

  // ---- 1. definition --------------------------------------------------------------------------------------
  T.suite('hero_benedick: definition, pool, forms, barks, items, names, pronouns', function (t) {
    if (!ready(t)) return;
    const h = DD.getHero(HERO);
    // race: the spec's (restored in review V3: META-UI's Hall roster fits its two lines, ui fit suite)
    t.ok(h.name === 'Benedick' && h.epithet === 'the Inevitable' && h.race === 'Snail (Dragon, Allegedly)' && h.cls === 'Knight of the Margins',
      'Benedick the Inevitable, Snail (Dragon, Allegedly), Knight of the Margins');
    t.eq(h.role, 'Slow shell tank · a dragon in bursts', 'role');
    t.eq(h.complexity, 3, 'complexity ★★★');
    t.eq(h.color, '#5fcf9b', 'slime mint');
    t.eq(h.unlock, null, 'available from the start (unlock: null)');
    t.eq(JSON.stringify(h.stats), JSON.stringify({ hp: 28, ap: 3, mov: 2, armor: 2, init: -2 }), 'stats 28 HP / 3 AP / move 2 / armor 2 / init −2');
    t.eq(h.growth.hp, 4, '+4 HP a level');
    t.eq(JSON.stringify(h.flags), '{}', 'no flags: he flies only as the Dragonsnail (a status)');
    t.ok(/\bhe\b/.test(h.blurb) && /\bhe\b/.test(h.passive.desc), 'blurb and passive say "he"');
    t.ok(h.blurb.length > 60 && !/act 4|Svammiel/i.test(h.blurb), 'blurb (no act-4 spoiler)');
    t.eq(h.basic, 'ben_teeth', 'basic: Fourteen Thousand Teeth');
    t.eq(h.signature, 'ben_inevitable', 'signature: The Inevitable');
    t.eq(DD.getSkill(h.signature).hype, 100, 'the signature costs 100 Hype');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['ben_shell', 'ben_slime_line']), 'starters: Coming Out of My Shell + Slime Line');
    t.eq(JSON.stringify(h.skillPool.slice().sort()), JSON.stringify(POOL.slice().sort()), 'a pool of 10 (incl. the 2 starters)');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0 && h.skillPool.indexOf('ben_slow_burn') < 0, 'basics and the signature are never socketed');
    const own = Object.keys(DD.defs.skills).filter(function (k) { return DD.defs.skills[k].owner === HERO; }).sort();
    t.eq(JSON.stringify(own), JSON.stringify(ALL.slice().sort()), '13 skills owned by benedick');
    t.eq(JSON.stringify(h.skillPool.filter(function (id) { return (DD.getSkill(id).tags || []).indexOf('dragon') >= 0; }).sort()), JSON.stringify(DRAGON_ONLY.slice().sort()), 'exactly the 3 Dragonsnail skills are tagged "dragon"');
    t.ok((DD.getSkill('ben_shell').tags || []).indexOf('shapeshift') >= 0, 'the switch is tagged "shapeshift" (the sim never replaces it; the Radio Edit never bleeps it)');
    const kit = [h.basic, h.signature].concat(h.skillPool);
    t.eq(kit.filter(function (id) { return (DD.getSkill(id).tags || []).indexOf('fire') >= 0; }).join(','), 'ben_breath', 'exactly one "fire" skill in his def kit (Morning Breath; Slow Burn is a swapped basic): the Pyromaniac check never picks him');
    POOL.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(s.levels.length === 3, id + ': 3 levels');
      for (let lv = 1; lv <= 3; lv++) {
        const d = desc(id, lv);
        t.ok(!/undefined|NaN|\[object/.test(d), id + ' L' + lv + ' desc pure with user === null: ' + d);
        const cap = id === 'ben_shell' ? 42 : 28;
        t.ok(words(d) <= cap, id + ' L' + lv + ' desc ≤ ' + cap + ' words (' + words(d) + ')');
      }
      if (DRAGON_ONLY.indexOf(id) >= 0) t.ok(desc(id, 1).indexOf('Dragonsnail only:') === 0, id + ': its desc names its form');
    });
    t.ok(words(h.passive.desc) <= 34, 'passive ≤ 34 words (' + words(h.passive.desc) + ')');
    t.eq(h.passive.name, 'A Sticky Situation', 'passive: A Sticky Situation');
    // barks: 13 standard keys ≥ 3 lines, the custom keys, every bubble ≤ 70; the dragon's caps lines name nobody
    BARK_KEYS.forEach(function (k) { t.ok((h.barks[k] || []).length >= 3, 'barks.' + k + ': 3+ lines'); });
    CUSTOM_BARKS.forEach(function (k) { t.ok((h.barks[k] || []).length >= 2, 'custom barks.' + k + ': 2+ lines'); });
    Object.keys(h.barks).forEach(function (k) { h.barks[k].forEach(function (l) { t.ok(typeof l === 'string' && l.length > 0 && l.length <= 70, 'bark ≤ 70: ' + JSON.stringify(l)); }); });
    const heroNames = Object.keys(DD.defs.heroes).map(function (k) { return DD.defs.heroes[k].name; });
    CAPS_BARKS.forEach(function (k) {
      h.barks[k].forEach(function (l) {
        t.eq(l, l.toUpperCase(), 'dragon voice in caps: ' + l);
        t.ok(!heroNames.some(function (n) { return l.toUpperCase().indexOf(n.toUpperCase()) >= 0; }), 'a caps line names nobody: ' + l);
      });
    });
    // pronouns: he/him only
    const text = textOf(h);
    t.ok(!/\b(she|her|hers|herself)\b/i.test(text), 'no she/her anywhere in his texts (he/him)');
    t.ok(!/Svammiel|\bAct IV\b|\bact 4\b|fourth act|Under the Table/i.test(text), 'nothing of his mentions act 4 (not a spoiler)');
    // items
    const its = ITEMS.map(function (id) { return DD.getItem(id); });
    t.ok(its.every(function (it) { return it && it.hero === HERO; }), '3 hero items');
    t.eq(its.map(function (it) { return it.rarity; }).join(','), 'rare,rare,legendary', 'rare / rare / legendary');
    t.eq(its.map(function (it) { return it.slot; }).join(','), 'trinket,armor,weapon', 'trinket / armor / weapon');
    t.ok(its.every(function (it) { return !it.stats.block; }), 'no starting Block (v2)');
    // display names: unique against every other hero-side, item and enemy name; the reserved names stay his
    const names = {};
    function add(kind, id, nm) { const k = norm(nm); (names[k] = names[k] || []).push(kind + ':' + id); }
    Object.keys(DD.defs.skills).forEach(function (k) { const s = DD.defs.skills[k]; if (!/^test_/.test(s.id)) add(s.owner === 'enemy' ? 'enemy skill' : 'skill', s.id, s.name); });
    Object.keys(DD.defs.items).forEach(function (k) { add('item', k, DD.defs.items[k].name); });
    Object.keys(DD.defs.enemies).forEach(function (k) { if (!/^test_/.test(k)) add('enemy', k, DD.defs.enemies[k].name); });
    Object.keys(DD.defs.heroes).forEach(function (k) { add('hero', k, DD.defs.heroes[k].name); });
    ALL.forEach(function (id) { const n = norm(DD.getSkill(id).name); t.eq(names[n].length, 1, 'name "' + DD.getSkill(id).name + '" is used once (' + names[n].join(', ') + ')'); });
    ITEMS.forEach(function (id) { const n = norm(DD.getItem(id).name); t.eq(names[n].length, 1, 'item name "' + DD.getItem(id).name + '" is used once'); });
    RESERVED.forEach(function (nm) {
      const clash = (names[norm(nm)] || []).filter(function (x) { return /^enemy/.test(x); });
      t.eq(clash.join(', '), '', 'reserved name "' + nm + '": no enemy uses it');
    });
    // registered pieces
    t.ok(!!DD.getStatus('ben_in_shell') && DD.getStatus('ben_in_shell').takenMult === 0.5, 'status In His Shell: takenMult 0.5');
    t.ok(!!DD.getStatus('ben_dragon') && DD.getStatus('ben_dragon').flying === true && DD.getStatus('ben_dragon').skipFresh === false, 'status Dragonsnail: flying, skipFresh false');
    t.ok(!!DD.getSurface('ben_slime') && typeof DD.getSurface('ben_slime').stops === 'function', 'surface Snail Slime: a stop snag');
    t.ok(!!DD.getObject('ben_parcel') && DD.getObject('ben_parcel').targetable === false && DD.getObject('ben_parcel').blocksMove === false, 'object Snail Mail Parcel: non-blocking, not a target');
    const tips = (DD.defs.narration.tips || []).filter(function (l) { return /Benedick/.test(l); });
    t.ok(tips.length >= 3, '3 loading tips name him (' + tips.length + ')');
  });

  // ---- 2. basics ----------------------------------------------------------------------------------------------
  T.suite('hero_benedick: Fourteen Thousand Teeth and Slow Burn (desc == effect at every level; the slot follows the form)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }, { id: 'test_creeper', x: 2, y: 5 }] });
    let u = B();
    const g = foes().filter(function (f) { return f.defId === 'test_grunt'; })[0], plant = foes().filter(function (f) { return f.defId === 'test_creeper'; })[0];
    t.eq(u.basic.id, 'ben_teeth', 'a snail bites with Fourteen Thousand Teeth');
    t.eq(desc('ben_teeth', 1), 'Snail form: deal 5 damage to an adjacent foe (10 if it is a plant).', 'Teeth desc');
    let h0 = g.hp;
    use(t, u, u.basic, g.x, g.y, 'Teeth on a grunt');
    t.eq(h0 - g.hp, 5, '5 damage');
    h0 = plant.hp;
    const said = texts(function () { use(t, u, u.basic, plant.x, plant.y, 'Teeth on a plant'); });
    t.eq(h0 - plant.hp, 10, '10 damage to a plant (tag "plant")');
    t.ok(said.indexOf('Salad!') >= 0, '"Salad!"');
    // objects: a crate takes the listed 5 (no plant bonus on objects); an explosive barrel goes off
    fight({ heroes: [{ x: 2, y: 4 }], objects: [{ x: 3, y: 4, id: 'crate' }, { x: 2, y: 3, id: 'barrel_explosive' }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    const crate = tile(3, 4).obj, ch0 = crate.hp;
    t.ok(valid(u, u.basic, 3, 4), 'Teeth can be aimed at a crate');
    use(t, u, u.basic, 3, 4, 'Teeth on a crate');
    t.eq(ch0 - (tile(3, 4).obj ? tile(3, 4).obj.hp : 0), Math.min(ch0, 5), 'the crate takes 5');
    use(t, u, u.basic, 2, 3, 'Teeth on a barrel');
    t.ok(!tile(2, 3).obj || tile(2, 3).obj.id !== 'barrel_explosive', 'the barrel went off');
    // Slow Burn by the shell's level: 4 / 5 / 6 fire, Burn 1, range 3, line of sight
    [1, 2, 3].forEach(function (lv) {
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 2 }] });
      const v = B(), a = at(4, 4), far = at(5, 4);
      const sl = give(v, 'ben_slow_burn', lv);
      t.ok(sl.id === 'ben_slow_burn' && sl.level === lv && Bn().shellLevel(v) === lv, 'L' + lv + ' shell → Slow Burn L' + lv);
      t.eq(desc('ben_slow_burn', lv, v), 'Dragonsnail form: deal ' + (3 + lv) + ' fire damage to a foe within 3 and apply Burn 1.', 'Slow Burn L' + lv + ' desc');
      t.ok(!valid(v, sl, 5, 4), 'L' + lv + ': a foe 4 away is out of range');
      const a0 = a.hp;
      use(t, v, sl, 4, 4, 'Slow Burn L' + lv);
      t.eq(a0 - a.hp, 3 + lv, 'L' + lv + ': ' + (3 + lv) + ' fire damage');
      t.ok(has(a, 'burn') && st(a, 'burn').stacks === 1, 'L' + lv + ': Burn 1');
      t.ok(far && !has(far, 'burn'), 'only the target');
    });
    // +range (an item's rangeBonus) reaches 4 and the desc prints it
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    u = B();
    let sl = give(u, 'ben_slow_burn', 1);
    u.rangeBonus = 1;
    t.ok(valid(u, sl, 5, 4), '+1 range: 4 away is in reach');
    t.ok(/within 4 /.test(desc('ben_slow_burn', 1, u)), 'and the desc says "within 4" (' + desc('ben_slow_burn', 1, u) + ')');
    t.ok(/within 4,/.test(desc('ben_shell', 1, u)), 'so does Coming Out of My Shell (' + desc('ben_shell', 1, u) + ')');
    // line of sight; Wet stops the Burn
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 1, y: 6 }], terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'wall'; } });
    u = B();
    sl = give(u, 'ben_slow_burn', 1);
    t.ok(!valid(u, sl, 3, 4), 'no line of sight through a wall');
    const wet = at(1, 6);
    A().addStatus(wet, 'wet', { turns: 2 }, u);
    use(t, u, sl, 1, 6, 'Slow Burn on a Wet foe');
    t.ok(!has(wet, 'burn'), 'a Wet foe does not Burn');
    // the basic slot follows the form and keeps its bookkeeping
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_brute', x: 3, y: 4, hpMult: 5 }] });
    u = B();
    use(t, u, u.basic, 3, 4, 'Teeth 1');
    use(t, u, u.basic, 3, 4, 'Teeth 2');
    Bn().enterForm(u, 'dragon');
    t.ok(u.basic.id === 'ben_slow_burn' && u.basic.uses === 2 && u.basic.usedThisTurn === true, 'the Dragonsnail takes over the slot: 2 uses, used this turn');
    Bn().enterForm(u, 'snail');
    t.ok(u.basic.id === 'ben_teeth' && u.basic.uses === 2 && u.basic.cd === 0, 'and back: one slot, 2 uses');
  });

  // ---- 3. Coming Out of My Shell -------------------------------------------------------------------------------
  T.suite('hero_benedick: Coming Out of My Shell — all the AP, half damage, the Dragonsnail for 2 turns, cooldowns, the D9 guard', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const d = desc('ben_shell', lv);
      const want = lv < 3 ? 'Spend all your AP hiding in your shell: half damage until your next turn. Then burst out as the Dragonsnail for 2 turns: flying, +3 move, Slow Burn basic (' + (3 + lv) + ' fire damage within 3, Burn 1).' :
        'Spend all your AP hiding in your shell: half damage until your next turn. Then burst out (6 fire damage to adjacent foes) as the Dragonsnail for 2 turns: flying, +3 move, Slow Burn basic (6 fire damage within 3, Burn 1).';
      t.eq(d, want, 'L' + lv + ' desc (addendum §8, exact)');
    });
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell', 'ben_slime_line'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    const s = DD.Combat.state;
    let u = B();
    const g = foes()[0];
    u.hp = 20;
    const sh = u.skills[0];
    t.ok(DD.Combat.current() === u && u.ap === 3 && form(u) === 'snail' && u.mov === 2 && !u.sprite, 'his turn: a snail with 3 AP, move 2, the def look');
    let heals = healsOn(u, function () { use(t, u, sh, u.x, u.y, 'Coming Out of My Shell'); });
    t.eq(u.ap, 0, '1 AP + the rest: AP 0');
    t.ok(has(u, 'ben_in_shell') && form(u) === 'shell' && u.sprite === Bn().SHELL_SPRITE, 'In His Shell (the shell look)');
    t.eq(u.hp, 20, 'D9: withdrawing changes nothing about his HP');
    t.eq(sh.cd, 4, 'cooldown 4 at level I');
    // half damage: 10 → 5 → 3 after armor 2; the AI's estimate agrees
    t.eq(DD.AI.estimate(g, u, 10), 3, 'DD.AI.estimate: 10 → 5 → 3 (armor 2)');
    const h1 = u.hp;
    A().damage(g, u, 10, { cause: 'other' });
    t.eq(h1 - u.hp, 3, 'a 10-damage hit takes 3');
    u.hp = 20;
    // his next turn: the Dragonsnail
    let probe = [];
    heals = heals.concat(healsOn(u, function () {
      for (let i = 0; i < 5; i++) {
        toHisTurn(u);
        probe.push({ form: form(u), turns: st(u, 'ben_dragon') ? st(u, 'ben_dragon').turns : 0, mov: u.mov, basic: u.basic.id, hp: u.hp, fly: DD.Grid.isFlying(u), cd: sh.cd });
      }
    }));
    t.eq(probe.length, 5, 'five more turns of his');
    t.ok(probe[0].form === 'dragon' && probe[0].turns === 2 && probe[0].mov === 5 && probe[0].basic === 'ben_slow_burn' && probe[0].fly, 'turn 1: the Dragonsnail (flying, move 5, Slow Burn, 2 turns)');
    t.ok(probe[1].form === 'dragon' && probe[1].turns === 1, 'turn 2: still the Dragonsnail (1 turn left)');
    // V3.1 polish (QA HERO-5): the Dragonsnail opts into the turns badge, so the chip and the icon over him count down
    t.ok(DD.getStatus('ben_dragon').showTurns === true, 'ben_dragon sets showTurns (the HUD\'s countdown)');
    if (DD.UI && typeof DD.UI.statusChip === 'function') {
      const badge = function (n) { const b = DD.UI.statusChip({ id: 'ben_dragon', stacks: 1, turns: n }).querySelector('.st-turns'); return b ? b.textContent : null; };
      t.ok(badge(2) === '2' && badge(1) === '1', 'its chip reads 2, then 1 (' + badge(2) + ', ' + badge(1) + ')');
    }
    t.ok(probe[2].form === 'snail' && probe[2].mov === 2 && probe[2].basic === 'ben_teeth' && !probe[2].fly, 'turn 3: a snail again (move 2, Teeth, grounded)');
    t.eq(probe.map(function (p) { return p.cd; }).join(','), '4,3,2,1,0', 'cooldown 4: locked his next 4 turns, ready on the 5th');
    t.ok(probe.every(function (p) { return p.hp === 20; }) && u.hp === 20, 'D9: emerging and landing never change his HP (20 throughout)');
    t.eq(heals.length, 0, 'D9: no heal at all was aimed at him');
    t.ok(!u.sprite && form(u) === 'snail', 'the def look again');
    // levels II / III: cooldown 3
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'ben_shell', level: 2 }] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    u = B();
    use(t, u, u.skills[0], u.x, u.y, 'Shell II');
    probe = [];
    for (let i = 0; i < 4; i++) { toHisTurn(u); probe.push(u.skills[0].cd); }
    t.eq(probe.join(','), '3,2,1,0', 'level II: cooldown 3 (dragon 2 of 4 turns)');
    // gate texts
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell', 'ben_breath'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    t.eq(DD.Combat.canUse(u, u.skills[1]), Bn().DRAGON_GATE, 'a snail can\'t breathe fire: "' + Bn().DRAGON_GATE + '"');
    Bn().enterForm(u, 'dragon');
    t.eq(DD.Combat.canUse(u, u.skills[0]), 'Already out of his shell.', 'as the Dragonsnail: "Already out of his shell."');
    t.eq(DD.Combat.canUse(u, u.skills[1]), true, 'and the breath is ready');
    Bn().enterForm(u, 'shell');
    u.ap = 3;
    t.eq(DD.Combat.canUse(u, u.skills[0]), 'Already in his shell.', 'in the shell: "Already in his shell."');
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_breath'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    t.eq(DD.Combat.canUse(B(), B().skills[0]), Bn().DRAGON_GATE_NONE, 'without the switch socketed the lock says so');
    // III bursts out for 6 fire on adjacent foes only
    fight({ heroes: [{ x: 4, y: 4, skills: [{ id: 'ben_shell', level: 3 }] }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 6, y: 4 }] });
    u = B();
    const adj = [at(5, 4), at(4, 3)], far = at(6, 4), hp0 = adj.map(function (f) { return f.hp; }), hf = far.hp;
    use(t, u, u.skills[0], u.x, u.y, 'Shell III');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && Bn().isDragon(u), 'he bursts out');
    t.eq(adj.map(function (f, i) { return hp0[i] - f.hp; }).join(','), '6,6', '6 fire to each adjacent foe');
    t.eq(hf - far.hp, 0, 'nothing to a foe 2 away');
    t.eq(u.hp, u.maxHp, 'and no HP for him');
    // stunned in the shell: he still bursts out; the lost turn is dragon turn 1
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    u = B();
    use(t, u, u.skills[0], u.x, u.y, 'Shell');
    A().addStatus(u, 'stun', { turns: 1 }, foes()[0]);
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && Bn().isDragon(u) && st(u, 'ben_dragon').turns === 1, 'stunned: he burst out at the lost turn\'s start; it counted (1 dragon turn left)');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && form(u) === 'snail', 'and lands after his next turn');
    // downed in the shell: no dragon on revive; the cooldown stays spent
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    u = B();
    use(t, u, u.skills[0], u.x, u.y, 'Shell');
    A().damage(foes()[0], u, 200, { cause: 'other' });
    t.ok(u.downed && !has(u, 'ben_in_shell'), 'downed in the shell: the shell is gone');
    A().revive(u, 0.5);
    t.ok(!u.downed && form(u) === 'snail' && u.mov === 2 && u.basic.id === 'ben_teeth' && u.skills[0].cd > 0, 'revived: a snail, the cooldown still spent');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && form(u) === 'snail', 'nothing bursts at his next turn');
    // shell dispelled: no emergence
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    u = B();
    use(t, u, u.skills[0], u.x, u.y, 'Shell');
    A().cleanse(u, 'buff');
    t.ok(form(u) === 'snail' && !u.sprite, 'dispelled shell: the snail look at once');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && form(u) === 'snail' && u.skills[0].cd > 0, 'no Dragonsnail next turn; cooldown spent');
    // dragon dispelled: a snail at once
    Bn().enterForm(u, 'dragon');
    A().cleanse(u, 'buff');
    t.ok(form(u) === 'snail' && u.mov === 2 && u.basic.id === 'ben_teeth' && !DD.Grid.isFlying(u), 'dispelled Dragonsnail: a snail at once (move 2, Teeth, grounded)');
    // sheep in the shell: the burst still happens (a flying sheep)
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    u = B();
    use(t, u, u.skills[0], u.x, u.y, 'Shell');
    A().addStatus(u, 'sheep', { turns: 2 }, foes()[0]);
    DD.Combat.endTurn();
    t.ok(Bn().isDragon(u) && has(u, 'sheep') && DD.Grid.isFlying(u), 'a sheep in the shell bursts out anyway: a flying sheep');
    // Echo Chamber: a second resolve of the same use is a no-op
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    u = B();
    use(t, u, u.skills[0], u.x, u.y, 'Shell');
    const nSt = u.statuses.length;
    t.tryRun('echo', function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, u.skills[0], { x: u.x, y: u.y }, { pay: false }); }); });
    t.ok(u.statuses.length === nSt && u.ap === 0 && has(u, 'ben_in_shell'), 'an echo of the shell changes nothing');
    // a fight starts him a snail
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    u = B();
    t.ok(form(u) === 'snail' && u.mov === 2 && u.basic.id === 'ben_teeth' && !u.sprite && !Bn().isDragon(u), 'every fight starts him a snail');
    t.ok(s !== DD.Combat.state, 'fresh fight');
  });

  // ---- 4. safe landing --------------------------------------------------------------------------------------------
  T.suite('hero_benedick: the last Dragonsnail turn over a pit, deep water, lava or fire glides to safe ground first', function (t) {
    if (!ready(t)) return;
    const cases = [
      { label: 'a pit', terrain: 'pit' }, { label: 'deep water', terrain: 'deep_water' }, { label: 'lava', terrain: 'lava' }, { label: 'fire', surface: 'fire' },
    ];
    cases.forEach(function (c) {
      fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
        terrain: function (tl) { if (c.terrain && tl.x === 5 && tl.y === 4) tl.t = c.terrain; },
        surfaces: c.surface ? [{ x: 5, y: 4, id: c.surface, turns: 9 }] : [] });
      const u = B();
      Bn().enterForm(u, 'dragon');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === u && st(u, 'ben_dragon') && st(u, 'ben_dragon').turns === 1, c.label + ': his last Dragonsnail turn');
      t.ok(A().teleport(u, 5, 4, { fx: false }), c.label + ': he hovers over it');
      const h0 = u.hp;
      let glides = [];
      glides = logged(/glides down/, function () { DD.Combat.endTurn(); });
      t.ok(!(u.x === 5 && u.y === 4) && DD.Grid.dist(u, { x: 5, y: 4 }) === 1, c.label + ': he glided to the next tile (' + u.x + ',' + u.y + ')');
      t.eq(u.hp, h0, c.label + ': no fall, no tick: HP unchanged');
      t.ok(form(u) === 'snail' && !DD.Grid.isDrop(u.x, u.y) && !DD.Grid.hazardAt(u.x, u.y, u), c.label + ': a snail on safe ground');
      t.eq(glides.length, 1, c.label + ': one glide line');
    });
    // over plain floor he stays
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    let u = B();
    Bn().enterForm(u, 'dragon');
    DD.Combat.endTurn();
    A().teleport(u, 5, 4, { fx: false });
    DD.Combat.endTurn();
    t.ok(u.x === 5 && u.y === 4 && form(u) === 'snail', 'over the floor he just lands');
    // a dispel over a pit drops him (the engine rule: landed() runs before content hooks)
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } });
    u = B();
    Bn().enterForm(u, 'dragon');
    A().teleport(u, 5, 4, { fx: false });
    const h0 = u.hp;
    A().cleanse(u, 'buff');
    t.eq(h0 - u.hp, Math.ceil(u.maxHp * 0.25), 'dispelled over a pit: he falls (25% max HP) — documented, not fixed');
    t.ok(!DD.Grid.isDrop(u.x, u.y) && form(u) === 'snail', 'and climbs out a snail');
    // the Party Balloons keep him up: no glide
    if (DD.getItem('party_balloons')) {
      fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'], items: ['party_balloons'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } });
      u = B();
      Bn().enterForm(u, 'dragon');
      DD.Combat.endTurn();
      A().teleport(u, 5, 4, { fx: false });
      DD.Combat.endTurn();
      t.ok(u.x === 5 && u.y === 4 && form(u) === 'snail' && DD.Grid.isFlying(u), 'with balloons he floats on over the pit (no glide needed)');
    } else t.log('party_balloons not loaded (isolated run): balloon case skipped');
  });

  // ---- 5. the trail -----------------------------------------------------------------------------------------------
  T.suite('hero_benedick: A Sticky Situation — slime on the tiles he crawled off, laid at turn end (Undo still works)', function (t) {
    if (!ready(t)) return;
    function arena(extra) { return fight(Object.assign({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] }, extra || {})); }
    arena();
    let u = B();
    t.ok(DD.Combat.move(u, 3, 4), 'he crawls 2 tiles');
    t.eq(slimeTiles().join(' '), '', 'no slime mid-turn');
    t.ok(DD.Combat.canUndo(), 'the walk can still be undone');
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '1,4 2,4', 'his turn end: slime on the 2 tiles he crawled off, not under him');
    t.ok(tile(1, 4).surface.data.src === u.id && tile(1, 4).surface.turns === Bn().SLIME_TURNS - 1, 'his slime; 3 rounds (one ticked at the round end)');
    DD.Combat.endTurn();
    t.ok(slime(1, 4) && tile(1, 4).surface.turns === 1 && !slime(3, 4), 'still there in its third round');
    DD.Combat.endTurn();
    t.ok(!slime(1, 4) && !slime(2, 4), 'gone after 3 rounds');
    // Undo cases (exact for every undo the engine allows)
    arena();
    u = B();
    DD.Combat.move(u, 3, 4);
    t.ok(DD.Combat.undo(), 'walk + undo');
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '', 'walk + undo: no slime');
    arena();
    u = B();
    DD.Combat.move(u, 3, 4);
    DD.Combat.undo();
    t.ok(DD.Combat.move(u, 1, 6), 'then a walk elsewhere');
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '1,4 1,5', 'walk, undo, walk elsewhere: only the second walk');
    arena();
    u = B();
    DD.Combat.move(u, 2, 4);
    DD.Combat.move(u, 2, 6);
    t.ok(DD.Combat.undo() && u.x === 2 && u.y === 4, 'two walks, undo the second');
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '1,4', 'only the first walk');
    // after an Undo his recorded position follows him (RULES' move:undone): a shorter walk the same way, a teleport
    arena();
    u = B();
    DD.Combat.move(u, 3, 4);
    DD.Combat.undo();
    DD.Combat.move(u, 2, 4);
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '1,4', 'walk 2, undo, walk 1 the same way: only the start tile');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7, hpMult: 3 }] });
    u = B();
    DD.Combat.move(u, 3, 4);
    DD.Combat.undo();
    DD.Combat.state.hype = 100;
    use(t, u, u.signature, 7, 7, 'The Inevitable after an Undo');
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '', 'walk, undo, The Inevitable: no slime');
    // the swap move: his step in a swap is a crawl
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    t.ok(DD.Combat.swap(u, 2, 4), 'he swaps with the knight');
    DD.Combat.endTurn();
    t.ok(slime(1, 4) && !slime(2, 4), 'slime on the tile he swapped off (under the knight; heroes don\'t mind)');
    // never: pushes, teleports, The Inevitable, being swapped, flying
    arena();
    u = B();
    A().push(foes()[0], u, { x: 1, y: 0 }, 2);
    A().teleport(u, 1, 7);
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '', 'pushed and teleported: no slime');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 4, hpMult: 3 }] });
    u = B();
    DD.Combat.state.hype = 100;
    use(t, u, u.signature, 7, 4, 'The Inevitable');
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '', 'The Inevitable: no slime');
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    A().swapMove(hero('test_knight'), u, {});
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '', 'swapped by an ally: no slime');
    fight({ heroes: [{ x: 1, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    Bn().enterForm(u, 'dragon');
    DD.Combat.move(u, 4, 4);
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '', 'the Dragonsnail flies: no slime');
    if (DD.getItem('party_balloons')) {
      fight({ heroes: [{ x: 1, y: 4, items: ['party_balloons'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      u = B();
      DD.Combat.move(u, 3, 4);
      DD.Combat.endTurn();
      t.eq(slimeTiles().join(' '), '', 'floating on balloons: no slime');
    }
    // bare floor only: shallow water and another surface keep theirs
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'water'; },
      surfaces: [{ x: 1, y: 4, id: 'oil', turns: 9 }] });
    u = B();
    u.mov = 4;
    DD.Combat.move(u, 4, 4);
    DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '3,4', 'only the bare floor tile (water and oil keep theirs)');
    t.eq(tile(1, 4).surface.id, 'oil', 'the oil stays');
    // laySlime's rule directly
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 3, y: 3, id: 'crate' }],
      terrain: function (tl) { if (tl.x === 3 && tl.y === 5) tl.t = 'lava'; if (tl.x === 4 && tl.y === 5) tl.t = 'pit'; if (tl.x === 5 && tl.y === 5) tl.t = 'wall'; },
      surfaces: [{ x: 6, y: 5, id: 'fire', turns: 3 }] });
    u = B();
    [[3, 3, 'a crate'], [3, 5, 'lava'], [4, 5, 'a pit'], [5, 5, 'a wall'], [6, 5, 'fire']].forEach(function (c) {
      t.ok(!Bn().laySlime(c[0], c[1], 3, u), 'no slime on ' + c[2]);
    });
    // [review V3] a unit standing there doesn't matter (Spit Shine's 5 tiles include his own); the trail never lists it
    t.ok(Bn().laySlime(1, 4, 3, u), 'slime under him is bare floor too (Spit Shine covers all 5 tiles)');
    t.ok(Bn().laySlime(2, 2, 1, u) && Bn().laySlime(2, 2, 3, u) && tile(2, 2).surface.turns === 3, 'his own slime is refreshed');
  });

  // ---- 6. Snail Slime --------------------------------------------------------------------------------------------
  T.suite('hero_benedick: Snail Slime stops grounded non-boss foes that walk onto it (paths, previews, taunts)', function (t) {
    if (!ready(t)) return;
    // an AI walk down a corridor stops on it
    fight({ enemyAi: true, heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }], terrain: corridor(4, 3, 6) });
    let u = B(), g = foes()[0];
    Bn().laySlime(4, 4, 3, u);
    let reach = DD.Grid.reachable(g, 3);
    const e3 = reach.get('3,4');
    t.ok(!!e3 && e3.stop && e3.stop.x === 4 && e3.stop.y === 4, 'the move preview marks the stop on the way to 3,4');
    t.ok(!!DD.Grid.snagAt(4, 4, g) && !DD.Grid.snagAt(4, 4, u), 'Grid.snagAt reports it for the foe, not for him');
    const hp0 = u.hp;
    DD.Combat.endTurn();
    t.ok(g.x === 4 && g.y === 4, 'the grunt walked onto the slime and stopped (' + g.x + ',' + g.y + ')');
    t.eq(u.hp, hp0, 'and lost its attack');
    // Act.moveAlong (any walk) stops too
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }], terrain: corridor(4, 3, 6) });
    u = B(); g = foes()[0];
    Bn().laySlime(4, 4, 3, u);
    const said = texts(function () { A().moveAlong(g, [{ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 4 }], { provoke: true }); });
    t.ok(g.x === 4 && g.y === 4 && said.indexOf('Stuck!') >= 0, 'a scripted walk stops on it too ("Stuck!")');
    // who passes: heroes, hero summons, charmed foes, bosses, flyers, root-proof foes
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 1 }, { id: 'test_boss', x: 6, y: 6 }, { id: 'test_grunt', x: 7, y: 3 }, { id: 'test_grunt', x: 7, y: 5 }, { id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    Bn().laySlime(4, 4, 3, u);
    const kn = hero('test_knight'), boss = foes().filter(function (f) { return f.defId === 'test_boss'; })[0];
    const flyer = at(7, 3), proof = at(7, 5), charmed = at(6, 1);
    flyer.flags = Object.assign({}, flyer.flags, { flying: true });
    proof.flags = Object.assign({}, proof.flags, { immune: ['root'] });
    A().addStatus(charmed, 'charmed', { turns: 1 }, u);
    [[kn, 'a hero'], [boss, 'a boss'], [flyer, 'a flyer'], [proof, 'a root-proof foe'], [charmed, 'a charmed foe']].forEach(function (c) {
      t.ok(!Bn().sticks(c[0]) && !DD.Grid.snagAt(4, 4, c[0]), c[1] + ' passes');
    });
    t.ok(Bn().sticks(at(8, 8)), 'a plain grunt sticks');
    if (DD.getSummon('test_hound')) {
      const hound = A().summon(kn, 'test_hound', 3, 2);
      t.ok(!!hound && !Bn().sticks(hound), 'a hero summon passes');
    }
    // pushes and pulls never stop
    fight({ heroes: [{ x: 1, y: 4, skills: ['ben_slime_line'] }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    u = B(); g = foes()[0];
    Bn().laySlime(3, 4, 3, u);
    use(t, u, u.skills[0], 4, 4, 'Slime Line through slime');
    t.ok(g.x === 2 && g.y === 4, 'pulled across the slime: it lands next to him, not stuck (' + g.x + ',' + g.y + ')');
    // a foe that starts on a patch moves one slime tile a walk
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    u = B(); g = foes()[0];
    [[4, 4], [3, 4], [5, 4], [4, 3], [4, 5], [2, 4]].forEach(function (p) { Bn().laySlime(p[0], p[1], 3, u); });
    A().moveAlong(g, [{ x: 3, y: 4 }, { x: 2, y: 4 }], { provoke: true });
    t.ok(g.x === 3 && g.y === 4, 'off its own patch it steps freely, onto the next slime and stops');
    // equal-cost paths go round it
    fight({ heroes: [{ x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    u = B(); g = foes()[0];
    [[5, 4], [4, 4], [4, 3]].forEach(function (p) { Bn().laySlime(p[0], p[1], 3, u); });
    const path = DD.Grid.path(g, 2, 2);
    t.ok(!!path && path.length === 6 && !path.some(function (p) { return slime(p.x, p.y); }), 'an equal-cost path avoids every slime tile (' + JSON.stringify(path) + ')');
    // fire dries it
    DD.Act.applyElement(4, 4, 'fire', null);
    t.ok(!slime(4, 4), 'fire dries it up');
    // a taunted foe across the slime stops short and loses its attack
    fight({ enemyAi: true, heroes: [{ x: 1, y: 4, skills: ['ben_wait'] }, { id: 'test_knight', x: 1, y: 8 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 0 }],
      terrain: corridor(4, 3, 6) });
    u = B(); g = foes()[0];
    const kn2 = hero('test_knight');
    Bn().laySlime(3, 4, 3, u);
    use(t, u, u.skills[0], 5, 4, 'I\'ll Wait');
    t.ok(has(g, 'taunt'), 'taunted');
    const k0 = kn2.hp, b0 = u.hp;
    toHisTurn(u);
    t.ok(g.x === 3 && g.y === 4, 'it walked at him, stuck on the slime short of him (' + g.x + ',' + g.y + ')');
    t.ok(kn2.hp === k0 && u.hp === b0, 'and lost its attack (nobody hurt)');
  });

  // ---- 7. either-form skills ---------------------------------------------------------------------------------------
  T.suite('hero_benedick: Slime Line, I\'ll Wait, Lettuce Pray, Shellacking, Spit Shine at every level, in both forms', function (t) {
    if (!ready(t)) return;
    ['snail', 'dragon'].forEach(function (shape) {
      [1, 2, 3].forEach(function (lv) {
        const tag = shape + ' L' + lv;
        function setup(cfg, id) {
          fight(cfg);
          const u = B();
          const sl = give(u, id, lv);
          if (shape === 'dragon' && !Bn().isDragon(u)) Bn().enterForm(u, 'dragon');
          return { u: u, sl: sl };
        }
        // Slime Line
        const R = [3, 4, 4][lv - 1], PULL = [2, 2, 3][lv - 1], DMG = [3, 4, 5][lv - 1];
        let k = setup({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 1 + R, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 2, y: 2 }] }, 'ben_slime_line');
        t.eq(desc('ben_slime_line', lv), 'Deal ' + DMG + ' damage to a foe 2 to ' + R + ' tiles away and pull it ' + plural(PULL, 'tile') + ' toward you.', tag + ' Slime Line desc');
        let g = at(1 + R, 4), h0 = g.hp;
        t.ok(!valid(k.u, k.sl, 2, 2) || DD.Grid.dist(k.u, { x: 2, y: 2 }) >= 2, tag + ': range starts at 2');
        t.ok(!valid(k.u, k.sl, 2 + R, 4), tag + ': out of range past ' + R);
        use(t, k.u, k.sl, 1 + R, 4, tag + ' Slime Line');
        t.eq(h0 - g.hp, DMG, tag + ': ' + DMG + ' damage');
        t.eq(g.x, Math.max(2, 1 + R - PULL), tag + ': pulled ' + PULL + ' toward him (soft stop next to him)');
        // on a crate: the listed damage only
        k = setup({ heroes: [{ x: 1, y: 4 }], objects: [{ x: 4, y: 4, id: 'crate' }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] }, 'ben_slime_line');
        const c0 = tile(4, 4).obj.hp;
        use(t, k.u, k.sl, 4, 4, tag + ' Slime Line on a crate');
        t.eq(c0 - (tile(4, 4).obj ? tile(4, 4).obj.hp : 0), Math.min(c0, DMG), tag + ': the crate takes ' + DMG + ' and stays put');
        // I'll Wait
        const WR = [4, 5, 6][lv - 1], BLK = [4, 5, 6][lv - 1];
        k = setup({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 1 + WR, y: 4 }] }, 'ben_wait');
        t.eq(desc('ben_wait', lv), 'Taunt a foe within ' + WR + ' for its next turn and gain ' + BLK + ' Block.', tag + ' I\'ll Wait desc');
        g = at(1 + WR, 4);
        use(t, k.u, k.sl, g.x, g.y, tag + ' I\'ll Wait');
        t.ok(has(g, 'taunt') && st(g, 'taunt').source === k.u.id && k.u.block === BLK, tag + ': Taunt (his) and ' + BLK + ' Block');
        DD.Combat.endTurn();
        t.ok(!has(g, 'taunt') && k.u.block === 0, tag + ': the Taunt lasted its next turn; his Block until his next turn');
        // Lettuce Pray
        const LR = [1, 1, 2][lv - 1], LB = [4, 5, 6][lv - 1];
        k = setup({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 5, y: 4 }, { id: 'test_cleric', x: 6, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] }, 'ben_lettuce');
        t.eq(desc('ben_lettuce', lv), 'You and every ally within ' + plural(LR, 'tile') + ' gain ' + LB + ' Block.', tag + ' Lettuce Pray desc');
        use(t, k.u, k.sl, k.u.x, k.u.y, tag + ' Lettuce Pray');
        t.ok(k.u.block === LB && hero('test_knight').block === LB, tag + ': him and an ally 1 away: ' + LB + ' Block');
        t.eq(hero('test_cleric').block, LR >= 2 ? LB : 0, tag + ': an ally 2 away: ' + (LR >= 2 ? LB : 0));
        // Shellacking
        const SD = [8, 10, 12][lv - 1], ST = [1, 1, 2][lv - 1];
        k = setup({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] }, 'ben_shellacking');
        g = at(3, 4); h0 = g.hp;
        k.u.ap = 3;
        use(t, k.u, k.sl, 3, 4, tag + ' Shellacking');
        t.ok(h0 - g.hp === SD && has(g, 'dazzled') && st(g, 'dazzled').turns === ST, tag + ': ' + SD + ' damage, Dazzled ' + ST);
        // Spit Shine
        const SR = [3, 4, 5][lv - 1], SN = [3, 3, 4][lv - 1];
        k = setup({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], surfaces: [{ x: 1 + SR, y: 5, id: 'oil', turns: 9 }],
          terrain: function (tl) { if (tl.x === 1 + SR && tl.y === 3) tl.t = 'wall'; } }, 'ben_spit_shine');
        t.eq(desc('ben_spit_shine', lv), 'Cover a tile within ' + SR + ' and the 4 tiles around it in Snail Slime for ' + plural(SN, 'round') + ' (bare floor only).', tag + ' Spit Shine desc');
        t.ok(!valid(k.u, k.sl, 2 + SR, 4) || DD.Grid.dist(k.u, { x: 2 + SR, y: 4 }) <= SR, tag + ': range ' + SR);
        use(t, k.u, k.sl, 1 + SR, 4, tag + ' Spit Shine');
        const got = slimeTiles();
        const want = [[1 + SR, 4], [SR, 4], [2 + SR, 4]].map(function (p) { return p[0] + ',' + p[1]; }).sort();
        t.eq(got.join(' '), want.join(' '), tag + ': the cross, minus the wall and the oil tile (' + got.join(' ') + ')');
        t.ok(tile(1 + SR, 4).surface.turns === SN && tile(1 + SR, 5).surface.id === 'oil', tag + ': ' + SN + ' rounds; the oil kept');
      });
    });
  });

  // ---- 8. dragon skills ---------------------------------------------------------------------------------------------
  T.suite('hero_benedick: Morning Breath, Wing It and Riddle Me This at every level (Dragonsnail only)', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const tag = 'L' + lv;
      // Morning Breath: a cone, fire, Weak 1 turn, no floor change
      const DMG = [5, 6, 7][lv - 1], SIZE = [2, 2, 3][lv - 1];
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 4, y: 5, hpMult: 3 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 2, y: 6, hpMult: 3 }],
        surfaces: [{ x: 4, y: 3, id: 'oil', turns: 9 }] });
      let u = B();
      let sl = give(u, 'ben_breath', lv);
      t.eq(desc('ben_breath', lv), 'Dragonsnail only: deal ' + DMG + ' fire damage to every foe in a cone ' + SIZE + ' tiles deep; each is Weakened for 1 turn.', tag + ' Morning Breath desc');
      const near = at(3, 4), side = at(4, 5), far = at(5, 4), off = at(2, 6);
      const h = [near.hp, side.hp, far.hp, off.hp];
      use(t, u, sl, 3, 4, tag + ' Morning Breath');
      t.eq([h[0] - near.hp, h[1] - side.hp, h[2] - far.hp, h[3] - off.hp].join(','), [DMG, DMG, SIZE >= 3 ? DMG : 0, 0].join(','), tag + ': the cone (' + SIZE + ' deep) and nobody else');
      t.ok(has(near, 'weak') && st(near, 'weak').turns === 1 && has(side, 'weak'), tag + ': Weakened 1 turn');
      t.eq(tile(4, 3).surface && tile(4, 3).surface.id, 'oil', tag + ': no floor change (the oil in the cone stays oil)');
      Bn().enterForm(u, 'snail');
      u.ap = 3; sl.cd = 0;
      t.eq(DD.Combat.canUse(u, sl), Bn().DRAGON_GATE, tag + ': refused as a snail, with the exact text');
      // Wing It: adjacent foes, push, bumps, pits
      const WD = [2, 3, 4][lv - 1], WP = [2, 2, 3][lv - 1];
      fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 4, y: 3, hpMult: 3 }, { id: 'test_grunt', x: 3, y: 4 }],
        terrain: function (tl) { if (tl.x === 4 && tl.y === 1) tl.t = 'wall'; if (tl.x === 1 && tl.y === 4) tl.t = 'pit'; } });
      u = B();
      sl = give(u, 'ben_wing_it', lv);
      t.eq(desc('ben_wing_it', lv), 'Dragonsnail only: deal ' + WD + ' damage to every adjacent foe and push each one ' + plural(WP, 'tile') + ' away.', tag + ' Wing It desc');
      const e = at(5, 4), n = at(4, 3), w = at(3, 4), e0 = e.hp, n0 = n.hp;
      let gains = [];
      gains = hypeGains(function () { use(t, u, sl, u.x, u.y, tag + ' Wing It'); });
      t.ok(e0 - e.hp === WD && e.x === 5 + WP, tag + ': east foe: ' + WD + ' damage, pushed ' + WP);
      t.ok(n.y === 2 && n0 - n.hp === WD + 3, tag + ': north foe bumps the wall (' + (WD + 3) + ' with the bump)');
      t.ok(w.dead, tag + ': west foe YEETed into the pit');
      t.ok(gains.some(function (x) { return x.n > 0; }), tag + ': environmental Hype for the pit kill');
      // Riddle Me This: Stun, range, cooldown, guards, Silence
      const RR = [3, 4, 4][lv - 1], RC = [3, 3, 2][lv - 1];
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 1 + RR, y: 4 }, { id: 'test_grunt', x: 2 + RR, y: 4 }] });
      u = B();
      sl = give(u, 'ben_riddle', lv);
      t.eq(desc('ben_riddle', lv), 'Dragonsnail only: Stun a foe within ' + RR + ' (it skips its next turn).', tag + ' Riddle desc');
      t.ok(!valid(u, sl, 2 + RR, 4), tag + ': range ' + RR);
      const r = at(1 + RR, 4);
      use(t, u, sl, r.x, r.y, tag + ' Riddle');
      t.ok(has(r, 'stun') && sl.cd === RC, tag + ': Stunned; cooldown ' + RC);
    });
    // stunImmune and a boss stun guard (a modifyStatus veto) hold; Silence blocks it (a spell)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_boss', x: 4, y: 5 }] });
    let u = B();
    let sl = give(u, 'ben_riddle', 2);
    const imm = at(3, 4);
    imm.flags = Object.assign({}, imm.flags, { stunImmune: true });
    use(t, u, sl, 3, 4, 'Riddle on a stunImmune foe');
    t.ok(!has(imm, 'stun'), 'stunImmune holds');
    A().addRule({ id: 'ben_test_guard', name: 'Stun guard', silent: true, hooks: { modifyStatus: function (s) { if (s.unit && s.unit.tier === 'boss' && s.id === 'stun') s.cancel = true; } } });
    sl.cd = 0; u.ap = 3;
    const boss = foes().filter(function (f) { return f.tier === 'boss'; })[0];
    use(t, u, sl, boss.x, boss.y, 'Riddle on a guarded boss');
    t.ok(!has(boss, 'stun'), 'a boss stun guard holds');
    A().removeRule('ben_test_guard');
    sl.cd = 0; u.ap = 3;
    A().addStatus(u, 'silenced', { turns: 1 }, boss);
    t.eq(DD.Combat.canUse(u, sl), 'Silenced!', 'Silence blocks Riddle Me This (a spell)');
  });

  // ---- 9. Snail Mail -----------------------------------------------------------------------------------------------
  T.suite('hero_benedick: Snail Mail — a parcel bursts at the start of his next turn (shelled, stunned or a dragon too)', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const M = [9, 11, 13][lv - 1];
      t.eq(desc('ben_mail', lv), 'Post a parcel to a tile within 5 (no sight needed). At the start of your next turn, every foe on or next to it takes ' + M + ' damage.', 'L' + lv + ' desc');
      fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 5, y: 3 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 6, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 4, y: 5, hpMult: 3 }, { id: 'test_grunt', x: 7, y: 7, hpMult: 3 }],
        terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'wall'; } });
      const u = B();
      const sl = give(u, 'ben_mail', lv);
      const on = at(5, 4), next = at(6, 4), leaves = at(4, 5), arrives = at(7, 7), kn = hero('test_knight');
      const prev = DD.Combat.preview(u, sl, 5, 4);
      t.ok(prev && prev.perUnit[on.id] && prev.perUnit[on.id].dmg === 0 && prev.perUnit[on.id].text === '📦 ' + M + ' next turn', 'L' + lv + ': the preview reads "📦 ' + M + ' next turn" (armor 0), 0 damage now');
      const h = [on.hp, next.hp, leaves.hp, arrives.hp, kn.hp];
      use(t, u, sl, 5, 4, 'L' + lv + ' Snail Mail (no sight needed, under a foe)');
      t.ok(tile(5, 4).obj && tile(5, 4).obj.id === 'ben_parcel' && on.x === 5, 'L' + lv + ': the parcel sits under the foe');
      t.eq(on.hp, h[0], 'L' + lv + ': nothing now');
      A().teleport(leaves, 8, 1, { fx: false });
      A().teleport(arrives, 5, 5, { fx: false });
      toHisTurn(u);
      t.ok(DD.Combat.current() === u && !tile(5, 4).obj, 'L' + lv + ': delivered at his next turn start');
      t.eq([h[0] - on.hp, h[1] - next.hp, h[2] - leaves.hp, h[3] - arrives.hp, h[4] - kn.hp].join(','), [M, M, 0, M, 0].join(','),
        'L' + lv + ': ' + M + ' to foes on or next to it then (the one that left is spared, the one that arrived is hit, allies never)');
    });
    // refused on an object tile; no double post from an echo
    fight({ heroes: [{ x: 1, y: 4 }], objects: [{ x: 3, y: 4, id: 'crate' }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }], terrain: function (tl) { if (tl.x === 1 && tl.y === 6) tl.t = 'pit'; } });
    let u = B();
    let sl = give(u, 'ben_mail', 1);
    t.ok(!valid(u, sl, 3, 4) && !valid(u, sl, 1, 6), 'no parcel on a crate or into a pit');
    t.eq(DD.Targeting.validTargets(u, sl).filter(function (p) { return p.x === 3 && p.y === 4; }).length, 0, 'the crate tile is not offered');
    use(t, u, sl, 5, 4, 'post');
    t.tryRun('echo', function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, { x: 5, y: 4 }, { pay: false }); }); });
    t.eq(Bn().parcels(u).length, 1, 'an echo posts no second parcel');
    t.ok(!DD.Targeting.validTargets(u, u.basic).some(function (p) { return p.x === 5 && p.y === 4; }), 'the parcel is not a target');
    // delivered even stunned / shelled / a dragon; mail first, then the emergence
    ['stunned', 'shelled', 'dragon'].forEach(function (c) {
      fight({ heroes: [{ x: 1, y: 4, skills: ['ben_mail', 'ben_shell'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }] });
      const v = B(), g = foes()[0], g0 = g.hp;
      if (c === 'dragon') Bn().enterForm(v, 'dragon');
      use(t, v, v.skills[0], 5, 4, c + ': post');
      if (c === 'stunned') A().addStatus(v, 'stun', { turns: 1 }, g);
      if (c === 'shelled') use(t, v, v.skills[1], v.x, v.y, c + ': into the shell');
      const order = logged(/Snail Mail!|comes out of his shell/, function () { DD.Combat.endTurn(); });
      t.eq(g0 - g.hp, 9, c + ': delivered (9)');
      if (c === 'shelled') t.ok(order.length === 2 && /Snail Mail/.test(order[0]) && /comes out/.test(order[1]), 'shelled: the mail arrives first, then he comes out (' + order.join(' | ') + ')');
    });
    // kills credit him; returned to sender when he is down
    fight({ heroes: [{ x: 1, y: 4, skills: ['ben_mail'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    u = B();
    let g = foes()[0];
    g.hp = 5;
    use(t, u, u.skills[0], 5, 4, 'post on a 5-HP grunt');
    const gains = hypeGains(function () { DD.Combat.endTurn(); });
    t.ok(g.dead && (DD.Combat.state.stats.units[u.id] || {}).kills >= 1, 'the parcel kills it, credited to him');
    t.ok(gains.some(function (x) { return x.n > 0; }), 'Hype for the kill');
    fight({ heroes: [{ x: 1, y: 4, skills: ['ben_mail'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    u = B(); g = foes()[0];
    use(t, u, u.skills[0], 5, 4, 'post');
    const ret = logged(/returned to sender/, function () { A().damage(g, u, 200, { cause: 'other' }); });
    t.ok(u.downed && !Bn().parcels(u).length && !tile(5, 4).obj && ret.length === 1, 'downed: the parcel is returned to sender');
  });

  // ---- 10. The Inevitable --------------------------------------------------------------------------------------------
  T.suite('hero_benedick: The Inevitable — next to any foe, no sight needed: 18 damage and Stun', function (t) {
    if (!ready(t)) return;
    t.eq(desc('ben_inevitable', 1), 'Appear next to any foe on the battlefield (no line of sight needed): deal 18 damage and Stun it.', 'desc');
    t.eq(DD.getSkill('ben_inevitable').target.objects, false, 'never aimed at objects (named in DESIGN §4.2)');
    fight({ heroes: [{ x: 1, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 7, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 7, y: 1 }],
      objects: [{ x: 4, y: 7, id: 'crate' }],
      terrain: function (tl) { if (tl.x === 3 && tl.y >= 2 && tl.y <= 6) tl.t = 'wall'; if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; } });
    let u = B();
    const g = at(7, 4);
    t.eq(DD.Combat.canUse(u, u.signature), 'Needs 100 Hype.', 'needs 100 Hype');
    DD.Combat.state.hype = 100;
    t.ok(valid(u, u.signature, 7, 4), 'any range, through walls');
    t.ok(!valid(u, u.signature, 4, 7), 'not at a crate');
    const h0 = g.hp, b0 = u.hp, cd0 = u.skills[0].cd;
    use(t, u, u.signature, 7, 4, 'The Inevitable');
    t.ok(DD.Grid.dist(u, g) === 1 && !DD.Grid.isDrop(u.x, u.y), 'he arrives next to it, never in the pit (' + u.x + ',' + u.y + ')');
    t.ok(h0 - g.hp === 18 && has(g, 'stun'), '18 damage and Stunned');
    t.ok(u.hp === b0 && u.skills[0].cd === cd0, 'no heal; the switch\'s cooldown untouched');
    // boxed in: "No room to arrive."
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }, { id: 'test_grunt', x: 5, y: 6 }, { id: 'test_grunt', x: 7, y: 6 }, { id: 'test_grunt', x: 6, y: 5 }],
      terrain: function (tl) { if (tl.x === 6 && tl.y === 7) tl.t = 'wall'; } });
    u = B();
    DD.Combat.state.hype = 100;
    t.ok(!valid(u, u.signature, 6, 6), 'a boxed-in foe is no target');
    const why = DD.Targeting.buildCtx ? DD.getSkill('ben_inevitable').target.canTarget({ user: u, targetUnit: at(6, 6) }) : '';
    t.eq(why, 'No room to arrive.', '"No room to arrive."');
    // a boss takes it (armor 1) and the Stun; as the Dragonsnail he lands still flying
    fight({ heroes: [{ x: 1, y: 1, skills: ['ben_shell'] }], enemies: [{ id: 'test_boss', x: 6, y: 6 }] });
    u = B();
    Bn().enterForm(u, 'dragon');
    DD.Combat.state.hype = 100;
    const boss = foes()[0], bh = boss.hp;
    use(t, u, u.signature, 6, 6, 'The Inevitable as the Dragonsnail');
    t.ok(bh - boss.hp === 17 && has(boss, 'stun'), 'a boss: 17 after armor 1, Stunned');
    t.ok(Bn().isDragon(u) && DD.Grid.isFlying(u), 'still the Dragonsnail, flying');
  });

  // ---- 11. items ------------------------------------------------------------------------------------------------------
  T.suite('hero_benedick: items — Snail Mucin Serum (his only heal), Racing Stripes, Do Not Disturb Sign', function (t) {
    if (!ready(t)) return;
    t.eq(DD.getItem('ben_mucin_serum').desc, 'Whenever a foe gets stuck in Benedick\'s Snail Slime, he heals 3 HP.', 'Serum desc');
    t.eq(DD.getItem('ben_racing_stripes').desc, '+3 max HP and +1 move.', 'Stripes desc');
    t.eq(DD.getItem('ben_dnd_sign').desc, '+10% damage. Once per fight, a hit that would down you leaves you at 1 HP, hiding in your shell (as Coming Out of My Shell, without its cooldown).', 'Sign desc');
    // the Serum: +3 for each stuck foe, only with the item, never while he is down
    [true, false].forEach(function (withItem) {
      fight({ heroes: [{ x: 1, y: 4, items: withItem ? ['ben_mucin_serum'] : [] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }], terrain: corridor(4, 3, 6) });
      const u = B(), g = foes()[0];
      u.hp = 15;
      Bn().laySlime(4, 4, 3, u);
      A().moveAlong(g, [{ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 4 }], { provoke: true });
      t.eq(u.hp, withItem ? 18 : 15, (withItem ? 'with' : 'without') + ' the Serum: ' + (withItem ? '+3 HP' : 'no heal'));
    });
    fight({ heroes: [{ x: 1, y: 4, items: ['ben_mucin_serum'] }, { id: 'test_knight', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }], terrain: corridor(4, 3, 6) });
    let u = B(), g = foes()[0];
    Bn().laySlime(4, 4, 3, u);
    A().damage(g, u, 200, { cause: 'other' });
    A().moveAlong(g, [{ x: 5, y: 4 }, { x: 4, y: 4 }], { provoke: true });
    t.ok(u.downed && u.hp === 0 && g.x === 4, 'downed: the slime still holds, but no heal');
    // Racing Stripes: move 3 (6 as the Dragonsnail), +3 HP
    fight({ heroes: [{ x: 1, y: 4, items: ['ben_racing_stripes'], skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    t.ok(u.mov === 3 && u.maxHp === 31, 'Racing Stripes: move 3, 31 HP');
    Bn().enterForm(u, 'dragon');
    t.eq(u.mov, 6, 'and 6 as the Dragonsnail');
    // the Sign: once a fight, 1 HP in his shell at once; the AP goes; no cooldown used; the second down is real
    fight({ heroes: [{ x: 1, y: 4, items: ['ben_dnd_sign'], skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    u = B(); g = foes()[0];
    const heals = healsOn(u, function () { A().damage(g, u, 200, { cause: 'other' }); });
    t.ok(!u.downed && u.hp === 1 && Bn().inShell(u) && u.ap === 0, 'Do Not Disturb: 1 HP, in his shell at once, his AP gone');
    t.ok(u.skills[0].cd === 0 && heals.length === 0, 'no cooldown used; a death-save, not a heal');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && Bn().isDragon(u), 'he bursts out at his next turn start');
    A().damage(g, u, 200, { cause: 'other' });
    t.ok(u.downed, 'the second down is real (once a fight)');
    // a mid-walk down ends the walk
    fight({ heroes: [{ x: 1, y: 4, items: ['ben_dnd_sign'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], surfaces: [{ x: 2, y: 4, id: 'electric', turns: 9 }] });
    u = B();
    u.hp = 2;
    u.mov = 4;
    DD.Combat.move(u, 4, 4);
    t.ok(!u.downed && u.hp === 1 && u.x === 2 && u.y === 4 && Bn().inShell(u), 'downed mid-walk by a live current: the Sign stops the walk there, in his shell');
    // as the Dragonsnail: keeps flying under the shell; refreshed to 2 turns at his next turn start
    fight({ heroes: [{ x: 1, y: 4, items: ['ben_dnd_sign'], skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    u = B(); g = foes()[0];
    Bn().enterForm(u, 'dragon');
    DD.Combat.endTurn();
    t.eq(st(u, 'ben_dragon').turns, 1, 'his last Dragonsnail turn');
    A().damage(g, u, 200, { cause: 'other' });
    t.ok(u.hp === 1 && Bn().inShell(u) && Bn().isDragon(u) && DD.Grid.isFlying(u) && form(u) === 'shell', 'a floating shell: the dragon keeps flying');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === u && Bn().isDragon(u) && !Bn().inShell(u) && st(u, 'ben_dragon').turns === 2, 'his next turn: the Dragonsnail again, refreshed to 2 turns');
  });

  // ---- 12. previews ---------------------------------------------------------------------------------------------------
  T.suite('hero_benedick: HUD previews match reality (every skill, every level, both forms; hits on the shell)', function (t) {
    if (!ready(t)) return;
    function arena() {
      return fight({ heroes: [{ x: 3, y: 4, level: 3 }, { id: 'test_knight', x: 3, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_brute', x: 3, y: 3 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_archer', x: 2, y: 5 }, { id: 'test_grunt', x: 3, y: 1 }],
        terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } });
    }
    ALL.forEach(function (id) {
      const def = DD.getSkill(id);
      const shapes = DRAGON_ONLY.indexOf(id) >= 0 || id === 'ben_slow_burn' ? ['dragon'] : id === 'ben_teeth' || id === 'ben_shell' ? ['snail'] : ['snail', 'dragon'];
      shapes.forEach(function (shape) {
        for (let lv = 1; lv <= def.levels.length; lv++) {
          arena();
          const u = B();
          let sl = give(u, id, lv);
          if (shape === 'dragon' && !Bn().isDragon(u)) Bn().enterForm(u, 'dragon');
          DD.Combat.state.hype = 100;
          u.ap = 3;
          const targets = DD.Targeting.validTargets(u, sl);
          t.ok(targets.length > 0, id + ' ' + shape + ' L' + lv + ': has targets in the arena');
          targets.slice(0, 2).forEach(function (p, k) {
            arena();
            const v = B();
            sl = give(v, id, lv);
            if (shape === 'dragon' && !Bn().isDragon(v)) Bn().enterForm(v, 'dragon');
            DD.Combat.state.hype = 100;
            v.ap = 3;
            previewMatches(t, v, sl, p.x, p.y, id + ' ' + shape + ' L' + lv + ' #' + k);
          });
        }
      });
    });
    // enemy hits on the shell: estimate == preview of the enemy's skill == reality
    arena();
    const u = B(), g = at(4, 4);
    Bn().enterForm(u, 'shell');
    const est = DD.AI.estimate(g, u, 5, null, false, DD.getSkill('test_grunt_stab'));
    const h0 = u.hp;
    DD.Combat._action(function () { DD.Combat.resolveSkill(g, DD.getSkill('test_grunt_stab'), { x: u.x, y: u.y }, { pay: false }); });
    t.eq(h0 - u.hp, est, 'a grunt\'s stab on the shell: the estimate (' + est + ') is what he loses');
  });

  // ---- 13. edge cases ---------------------------------------------------------------------------------------------------
  T.suite('hero_benedick: v2 edge cases (stun, sleep, sheep, charm, Confused, Silence, AP, not his turn, deaths mid-skill, odd targets)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell', 'ben_riddle', 'ben_slime_line', 'ben_shellacking'] }, { id: 'test_knight', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
    let u = B();
    const g = at(3, 4);
    Bn().enterForm(u, 'dragon');
    A().addStatus(u, 'silenced', { turns: 1 }, g);
    t.eq(DD.Combat.canUse(u, u.skills[1]), 'Silenced!', 'Silenced: Riddle Me This (a spell) is blocked');
    t.ok(DD.Combat.canUse(u, u.skills[2]) === true && DD.Combat.canUse(u, u.basic) === true, 'and only that');
    A().removeStatus(u, 'silenced');
    A().addStatus(u, 'sheep', { turns: 1 }, g);
    t.ok(/^Baa/.test(DD.Combat.canUse(u, u.skills[2])) && /^Baa/.test(DD.Combat.canUse(u, u.basic)), 'a sheep: Baa');
    A().removeStatus(u, 'sheep');
    A().addStatus(u, 'sleep', { turns: 1 }, g);
    t.eq(DD.Combat.canUse(u, u.basic), 'Asleep. Zzz.', 'asleep');
    A().removeStatus(u, 'sleep');
    A().addStatus(u, 'stun', { turns: 1 }, g);
    t.eq(DD.Combat.canUse(u, u.basic), 'Stunned!', 'stunned');
    A().removeStatus(u, 'stun');
    A().addStatus(u, 'confused', { turns: 1 }, g);
    t.tryRun('confused', function () { t.eq(DD.Combat.moveApCost(u), 2, 'Confused: a move costs 2 AP'); DD.Combat.reachable(u); });
    A().removeStatus(u, 'confused');
    u.ap = 0;
    t.eq(DD.Combat.canUse(u, u.basic), 'Not enough AP.', '0 AP');
    u.ap = 3;
    DD.Combat.giveTurnTo(hero('test_knight'));
    t.ok(/Not .*turn/.test(String(DD.Combat.canUse(u, u.basic))), 'not his turn: refused (' + DD.Combat.canUse(u, u.basic) + ')');
    // charm: −1 AP, can't hurt the charmer
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    const c = foes()[0];
    A().addStatus(u, 'charmed', { turns: 1 }, c);
    DD.Combat.endTurn();
    t.eq(u.ap, 2, 'charmed: −1 AP');
    const c0 = c.hp;
    use(t, u, u.basic, c.x, c.y, 'Teeth vs the charmer');
    t.eq(c.hp, c0, 'no damage to the charmer');
    // deaths mid-skill
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B(); let f = foes()[0]; f.hp = 2;
    t.tryRun('Shellacking kill', function () { use(t, u, give(u, 'ben_shellacking', 1), 3, 4, 'Shellacking a 2-HP foe'); });
    t.ok(f.dead && !has(f, 'dazzled'), 'killed, no Dazzle on a corpse');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    u = B(); f = foes()[0]; f.hp = 1;
    t.tryRun('Slime Line kill', function () { use(t, u, give(u, 'ben_slime_line', 1), 4, 4, 'Slime Line a 1-HP foe'); });
    t.ok(f.dead && f.x === 4, 'killed, not pulled');
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    at(5, 4).hp = 1;
    t.tryRun('Wing It partial kill', function () { use(t, u, give(u, 'ben_wing_it', 1), 4, 4, 'Wing It with a 1-HP foe'); });
    t.ok(foes().length === 1 && foes()[0].x === 1, 'one dies, the other flies');
    // odd targets through the raw resolver never throw
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    ALL.forEach(function (id) {
      ['snail', 'dragon'].forEach(function (shape) {
        const sl = give(u, id, 1);
        if (shape === 'dragon') Bn().enterForm(u, 'dragon');
        [null, { x: 6, y: 6 }, { x: u.x, y: u.y }, { x: 3, y: 4 }, { x: 2, y: 5 }].forEach(function (p) {
          t.tryRun(id + ' ' + shape + ' execute with ' + JSON.stringify(p), function () { DD.Combat._action(function () { DD.Combat.resolveSkill(u, sl, p, { pay: false }); }); });
        });
      });
    });
    t.ok(!u.dead, 'nothing exploded');
    // the map corner
    fight({ heroes: [{ x: 0, y: 0, skills: ['ben_shell', 'ben_slime_line', 'ben_mail', 'ben_spit_shine'] }], enemies: [{ id: 'test_grunt', x: 1, y: 0 }, { id: 'test_grunt', x: 0, y: 3 }] });
    u = B();
    u.skills.concat([u.signature, u.basic]).forEach(function (sl) { t.tryRun(sl.id + ' targets in the corner', function () { DD.Targeting.validTargets(u, sl); }); });
  });

  // ---- 14. attacks of opportunity ------------------------------------------------------------------------------------
  function aoos(fn) {
    const list = [];
    const off = DD.Events.on('opportunity:attack', function (e) { list.push({ attacker: e.attacker && e.attacker.defId, mover: e.mover && e.mover.defId, skillId: e.skillId }); });
    try { fn(); } finally { off(); }
    return list;
  }
  T.suite('hero_benedick: attacks of opportunity (the snail bites walkers, even from the shell; the dragon never; forced moves never provoke)', function (t) {
    if (!ready(t)) return;
    ['snail', 'shell', 'dragon'].forEach(function (shape) {
      fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
      const u = B(), g = foes()[0];
      if (shape !== 'snail') Bn().enterForm(u, shape);
      const h0 = g.hp;
      const list = aoos(function () { A().moveAlong(g, [{ x: 4, y: 4 }, { x: 5, y: 4 }], { provoke: true }); });
      const his = list.filter(function (x) { return x.attacker === HERO; });
      if (shape === 'dragon') t.ok(!his.length && g.hp === h0 && !A().opportunityOf(u, g, { x: 3, y: 4 }), 'the Dragonsnail strikes nobody from the air');
      else t.ok(his.length === 1 && his[0].skillId === 'ben_teeth' && h0 - g.hp === 5, shape + ': Teeth bites the walker (5)');
    });
    // a stale melee slot on a dragon is cancelled (modifyOpportunity)
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let u = B();
    const g = foes()[0];
    Bn().enterForm(u, 'dragon');
    u.basic = A().makeSlot('ben_teeth', 1);
    t.eq(A().opportunityOf(u, g, { x: 3, y: 4 }), null, 'a stale Teeth slot on the Dragonsnail is cancelled');
    // his crawl provokes like any walk; pushes, pulls, Wing It and The Inevitable never do
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
    u = B();
    let list = aoos(function () { DD.Combat.move(u, 2, 6); });
    t.ok(list.some(function (x) { return x.mover === HERO && x.attacker === 'test_grunt'; }), 'crawling away provokes the grunt');
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 7, y: 7, hpMult: 3 }] });
    u = B();
    DD.Combat.state.hype = 100;
    list = aoos(function () { use(t, u, u.signature, 7, 7, 'The Inevitable away from a grunt'); });
    t.eq(list.length, 0, 'The Inevitable never provokes');
    fight({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }] });
    u = B();
    const sl = give(u, 'ben_wing_it', 1);
    list = aoos(function () { use(t, u, sl, u.x, u.y, 'Wing It'); });
    t.eq(list.length, 0, 'Wing It\'s push provokes nothing');
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    u = B();
    list = aoos(function () { use(t, u, give(u, 'ben_slime_line', 1), 4, 4, 'Slime Line'); });
    t.eq(list.length, 0, 'Slime Line\'s pull provokes nothing');
  });

  // ---- 15. AutoPlay -------------------------------------------------------------------------------------------------
  T.suite('hero_benedick: AutoPlay scores (the shell after acting, a snail out of reach, Snail Mail, Spit Shine)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell', 'ben_slime_line'] }], enemies: [{ id: 'test_grunt', x: 8, y: 4 }] });
    let u = B();
    const ctx = function (v, i, target) { return DD.Targeting.buildCtx(v, v.skills[i], target || { x: v.x, y: v.y }); };
    t.ok(Bn().shellScore(ctx(u, 0)) > 0, 'a snail with nothing in reach: shelling is worth something (' + Bn().shellScore(ctx(u, 0)).toFixed(1) + ')');
    Bn().enterForm(u, 'dragon');
    t.eq(Bn().shellScore(ctx(u, 0)), 0, 'as the Dragonsnail: 0');
    Bn().enterForm(u, 'shell');
    t.eq(Bn().shellScore(ctx(u, 0)), 0, 'in the shell: 0');
    // 3 AP, a killable foe next to him, another far off: bite first, then tuck in with the last AP
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell', 'ben_slime_line'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 4 }] });
    u = B();
    at(3, 4).hp = 5;
    let seq = [];
    t.tryRun('AutoPlay turn', function () { seq = usedBy(u, function () { DD.AutoPlay.takeTurn(); }); });
    t.ok(seq.indexOf('ben_teeth') >= 0 && seq.indexOf('ben_shell') === seq.length - 1 && seq.indexOf('ben_teeth') < seq.indexOf('ben_shell'), 'AutoPlay bites first, then shells with the last AP (' + seq.join(', ') + ')');
    // a snail out of reach shells
    fight({ heroes: [{ x: 0, y: 4, skills: ['ben_shell', 'ben_slime_line'] }], enemies: [{ id: 'test_grunt', x: 8, y: 4 }, { id: 'test_grunt', x: 8, y: 2 }] });
    u = B();
    t.tryRun('AutoPlay turn', function () { seq = usedBy(u, function () { DD.AutoPlay.takeTurn(); }); });
    t.ok(seq.indexOf('ben_shell') >= 0, 'a snail with nothing in reach tucks in (' + seq.join(', ') + ')');
    // Snail Mail prefers a foe that won't leave; Spit Shine is 0 with no foe within 4
    fight({ heroes: [{ x: 1, y: 4, skills: ['ben_mail', 'ben_spit_shine'] }], enemies: [{ id: 'test_grunt', x: 5, y: 2 }, { id: 'test_grunt', x: 5, y: 6 }] });
    u = B();
    A().addStatus(at(5, 2), 'stun', { turns: 1 }, u);
    const ms = Bn().mailScore(ctx(u, 0, { x: 5, y: 2 })), mf = Bn().mailScore(ctx(u, 0, { x: 5, y: 6 }));
    t.ok(ms > mf && mf > 0, 'Snail Mail: a stunned foe scores higher (' + ms.toFixed(1) + ' > ' + mf.toFixed(1) + ')');
    t.ok(Bn().spitScore(ctx(u, 1, { x: 1, y: 7 })) === 0 || DD.Combat.foesOf(u).some(function (f) { return DD.Grid.dist(f, { x: 1, y: 7 }) <= 4; }), 'Spit Shine: 0 with no foe within 4');
    fight({ heroes: [{ x: 0, y: 0, skills: ['ben_spit_shine'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    u = B();
    t.eq(Bn().spitScore(ctx(u, 0, { x: 2, y: 1 })), 0, 'Spit Shine far from every foe: 0');
    t.ok(Bn().spitScore(ctx(u, 0, { x: 2, y: 1 })) === 0, 'and pure');
  });

  /** AutoPlay battles of ['benedick', 'test_knight', 'test_cleric', 'test_mage'] vs the fixture encounters. */
  function battles(t, plans, tagSeed) {
    const tot = { fought: 0, wins: 0, long: 0, shelled: 0, stops: 0, mailHits: 0, timeouts: 0, uses: {}, dragonTurns: 0, turns: 0, prints: [] };
    plans.forEach(function (p, i) {
      const enc = DD.getEncounter(p.enc);
      if (!enc) { t.fail('fixture encounter ' + p.enc + ' missing'); return; }
      const sl = Math.min(3, 1 + Math.floor((p.level - 1) / 2));
      const party = [HERO, 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
        if (id === HERO) return DD.Combat.makeRunHero({ id: id, level: p.level, items: p.items || [], skills: p.skills.map(function (sid) { return { id: sid, level: sl }; }) });
        const h = DD.getHero(id);
        return DD.Combat.makeRunHero({ id: id, level: p.level, skills: h.startingSkills.map(function (sid) { return { id: sid, level: sl }; }) });
      });
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('ben-ap-' + (tagSeed || '') + i + ':' + t.seed), difficulty: 'normal', act: enc.act });
      DD.Combat.start(setup, { seed: 900 + i, headless: true, difficulty: 'normal', kind: enc.kind });
      const counts = {};
      let shelled = 0;
      A().addRule({ id: 'ben_usage_probe', name: 'Usage probe', silent: true, hooks: {
        onSkillUsed: function (ctx) {
          if (A().simulating || !ctx.user || ctx.user.defId !== HERO || !ctx.skill) return;
          counts[ctx.skill.id] = (counts[ctx.skill.id] || 0) + 1;
          if (ctx.skill.id === 'ben_shell') shelled++;
        },
        onTurnStart: function (unit) {
          if (A().simulating || !unit || unit.defId !== HERO || unit.downed) return;
          tot.turns++;
          if (Bn().isDragon(unit)) tot.dragonTurns++;
        },
        onTakeDamage: function (d) { if (!A().simulating && d && (d.tags || []).indexOf('parcel') >= 0 && d.dealt > 0) tot.mailHits++; },
      } });
      const offLog = DD.Events.on('combat:log', function (e) { if (e && /gets stuck in/.test(String(e.text || e.msg || (e.entry && e.entry.text) || ''))) tot.stops++; });
      let r = null;
      t.tryRun(p.enc + ' L' + p.level + ' battle', function () { r = DD.AutoPlay.runBattle(30); });
      offLog();
      A().removeRule('ben_usage_probe');
      if (!r) return;
      tot.fought++;
      if (r.result === 'victory') tot.wins++;
      if (r.timeout) tot.timeouts++;
      if (r.rounds >= 4) { tot.long++; if (shelled) tot.shelled++; }
      Object.keys(counts).forEach(function (k) { tot.uses[k] = (tot.uses[k] || 0) + counts[k]; });
      const s = DD.Combat.state;
      // the log length is left out: cosmetic narration (DD.rng) may add a line or not
      tot.prints.push([r.result, r.rounds, s.units.map(function (o) { return o.defId + ':' + o.hp + ':' + o.x + ',' + o.y + ':' + (o.statuses || []).map(function (x) { return x.id; }).join('+'); }).join('|'), s.round, s.hype].join('/'));
      const b = s.units.filter(function (o) { return o.defId === HERO; })[0];
      if (b) {
        const dr = Bn().isDragon(b), base = DD.Combat.heroStats(b.runHero).mov;
        t.ok(b.downed || (b.mov === base + (dr ? 3 : 0) && b.basic.id === (dr ? 'ben_slow_burn' : 'ben_teeth')), p.enc + ' L' + p.level + ': form bookkeeping consistent at the end (' + Bn().lookOf(b) + ', move ' + b.mov + ')');
      }
      t.ok(r.rounds > 0 && !r.timeout, p.enc + ' L' + p.level + ': finished (' + r.result + ' in ' + r.rounds + ' rounds)');
      t.log(p.enc + ' L' + p.level + ' → ' + r.result + ' in ' + r.rounds + ' rounds; Benedick: ' + JSON.stringify(counts));
    });
    return tot;
  }
  const PLANS = [
    { enc: 'test_a1_normal', level: 1, skills: ['ben_shell', 'ben_slime_line'] },
    { enc: 'test_a1_elite', level: 1, skills: ['ben_shell', 'ben_slime_line'] },
    { enc: 'test_a1_normal', level: 3, skills: ['ben_shell', 'ben_slime_line', 'ben_mail'] },
    { enc: 'test_a2_normal', level: 3, skills: ['ben_shell', 'ben_slime_line', 'ben_wait'] },
    { enc: 'test_a1_boss', level: 3, skills: ['ben_shell', 'ben_slime_line', 'ben_spit_shine'] },
    { enc: 'test_a2_elite', level: 3, skills: ['ben_shell', 'ben_shellacking', 'ben_breath'] },
    { enc: 'test_a2_elite', level: 5, skills: ['ben_shell', 'ben_mail', 'ben_breath', 'ben_riddle'], items: ['ben_dnd_sign'] },
    { enc: 'test_a3_normal', level: 5, skills: ['ben_shell', 'ben_slime_line', 'ben_wing_it', 'ben_mail'], items: ['ben_mucin_serum'] },
    { enc: 'test_a2_boss', level: 5, skills: ['ben_shell', 'ben_wait', 'ben_lettuce', 'ben_spit_shine'], items: ['ben_racing_stripes'] },
    { enc: 'test_a3_elite', level: 5, skills: ['ben_shell', 'ben_slime_line', 'ben_shellacking', 'ben_riddle'] },
  ];
  T.suite('hero_benedick: AutoPlay battles at levels 1 / 3 / 5 (fixture party, items at 5; deterministic)', function (t) {
    if (!ready(t)) return;
    const res = battles(t, PLANS);
    t.log('uses: ' + JSON.stringify(res.uses) + ' · wins ' + res.wins + '/' + res.fought + ' · shelled in ' + res.shelled + '/' + res.long + ' fights of 4+ rounds · dragon ' +
      res.dragonTurns + '/' + res.turns + ' turns · slime stops ' + res.stops + ' · parcel hits ' + res.mailHits);
    t.eq(res.timeouts, 0, 'no timeouts');
    t.ok(res.long === 0 || res.shelled >= 0.7 * res.long, 'the shell in ≥ 70% of fights of 4+ rounds (' + res.shelled + '/' + res.long + ')');
    t.ok(res.stops > 0, 'a slime stop somewhere in the batch (' + res.stops + ')');
    t.ok(res.mailHits > 0, 'a parcel hit somewhere in the batch (' + res.mailHits + ')');
    t.ok(res.dragonTurns > 0 && res.dragonTurns < res.turns, 'he fights in both forms (' + res.dragonTurns + '/' + res.turns + ')');
    t.ok(res.wins >= Math.ceil(res.fought * 0.6), 'the party mostly wins (' + res.wins + '/' + res.fought + ')');
    // two seeded runs are bit-identical
    const a = battles(t, PLANS.slice(0, 2), 'det'), b = battles(t, PLANS.slice(0, 2), 'det');
    t.eq(JSON.stringify(a.prints), JSON.stringify(b.prints), 'two seeded runs are bit-identical');
  });

  // ---- 16. the look ------------------------------------------------------------------------------------------------------
  T.suite('hero_benedick: the look follows the statuses (dispels, downs, the sheep, the Party Balloons, FX playback, previews)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let u = B();
    const shown = function () { return DD.Sprites && DD.Sprites.specFor ? DD.Sprites.specFor(u) : u.sprite; };
    t.ok(!u.sprite && (!DD.Sprites || shown() === Bn().SNAIL_SPRITE), 'a snail: the def look');
    Bn().enterForm(u, 'shell');
    t.ok(u.sprite === Bn().SHELL_SPRITE && (!DD.Sprites || shown() === Bn().SHELL_SPRITE), 'the shell look');
    Bn().enterForm(u, 'dragon');
    t.ok(u.sprite === Bn().DRAGON_SPRITE && (!DD.Sprites || shown() === Bn().DRAGON_SPRITE), 'the Dragonsnail look');
    A().addStatus(u, 'sheep', { turns: 1 }, foes()[0]);
    t.ok(u.sprite === Bn().DRAGON_SPRITE, 'a sheep keeps the look underneath (the engine paints the sheep)');
    if (DD.Sprites) t.tryRun('sheep draw', function () { const c = document.createElement('canvas'); c.width = 80; c.height = 80; DD.Sprites.drawUnit(c.getContext('2d'), u, 40, 70, 1, 0.5); });
    A().removeStatus(u, 'sheep');
    A().cleanse(u, 'buff');
    t.ok(!u.sprite && form(u) === 'snail', 'dispelled: the snail look');
    Bn().enterForm(u, 'shell');
    A().damage(foes()[0], u, 200, { cause: 'other' });
    t.ok(u.downed && !u.sprite, 'downed in the shell: the def look (he lies as a tipped shell)');
    // FX playback: the old look stays pinned until playback reaches the change
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    u = B();
    u.vis = u.vis || {};
    const inst = DD.FX.instant;
    try {
      DD.FX.instant = false;
      DD.FX.reset();
      Bn().enterForm(u, 'shell');
      t.ok(u.sprite === Bn().SHELL_SPRITE && u.vis.sprite === Bn().SNAIL_SPRITE, 'queued FX: the snail look is pinned on screen');
      DD.FX.flush();
      t.ok(!u.vis.sprite, 'playback caught up: the pin is dropped');
    } finally { DD.FX.instant = inst; DD.FX.reset(); }
    // previews never touch the real sprite or the pin
    const pin = u.vis.sprite;
    Bn().enterForm(u, 'snail');
    u.ap = 3;
    u.skills[0].cd = 0;
    DD.Combat.preview(u, u.skills[0], u.x, u.y);
    t.ok(!u.sprite && u.vis.sprite === pin && form(u) === 'snail', 'a shell preview leaves him and his look alone');
    // the Party Balloons wrap every look
    if (DD.getItem('party_balloons') && DD.Sprites && DD.Sprites.metrics) {
      fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'], items: ['party_balloons'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
      u = B();
      t.ok(shown().itemBalloons && shown().look === 'snail', 'balloons on the snail');
      use(t, u, u.skills[0], u.x, u.y, 'shell with balloons');
      t.ok(shown().itemBalloons && shown().look === 'shell', 'balloons on the shell');
      DD.Combat.endTurn();
      t.ok(shown().itemBalloons && shown().look === 'dragon', 'balloons on the Dragonsnail');
    } else t.log('party_balloons not loaded (isolated run): the wrapper check is skipped');
  });

  // ---- 17. sprites and painters -------------------------------------------------------------------------------------------
  T.suite('hero_benedick: sprites and painters (three looks × poses at five yaws, portraits, BRB / LATE, slime, parcel, streak)', function (t) {
    if (!ready(t)) return;
    const probs = T.contentHelpers && T.contentHelpers.spriteProblems;
    const specs = [Bn().SNAIL_SPRITE, Bn().SHELL_SPRITE, Bn().DRAGON_SPRITE];
    if (probs) specs.forEach(function (sp) { t.eq(probs(sp).length, 0, sp.look + ' sprite valid ' + JSON.stringify(probs(sp))); });
    t.ok(DD.getHero(HERO).sprite === Bn().SNAIL_SPRITE && Bn().DRAGON_SPRITE.scale > 1 && Bn().DRAGON_SPRITE.hover === 7, 'the def look is the snail; the Dragonsnail is bigger and hovers 7');
    if (!DD.Sprites) { t.log('no DD.Sprites'); return; }
    // every look × pose × facing, with a fillText spy for the painted words
    const said = [], proto = CanvasRenderingContext2D.prototype, orig = proto.fillText;
    proto.fillText = function (s) { said.push(String(s)); return orig.apply(this, arguments); };
    try {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 140;
      const ctx = c.getContext('2d');
      specs.forEach(function (sp) {
        ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
          [1, -1].forEach(function (fc) {
            [{}, { still: true }, { walk: 0.3 }, { lying: 0.5 }, { poseT: 0.7 }].forEach(function (o) {
              t.tryRun(sp.look + ' ' + pose, function () { DD.Sprites.draw(ctx, sp, 80, 120, 2, Object.assign({ pose: pose, t: 1.3, facing: fc }, o)); });
            });
          });
        });
        t.tryRun(sp.look + ' portrait', function () { const p = DD.Sprites.portrait(sp, 64); t.ok(!!p && p.width > 0, sp.look + ': portrait'); });
      });
      t.ok(said.indexOf('BRB') >= 0, 'the shell\'s sign reads BRB (g.text: never mirrored)');
      // the board at five yaws: him in each look, slime (fresh and last-round), a parcel, the streak FX handler
      if (DD.Render && typeof DD.Render.renderTo === 'function') {
        fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell', 'ben_mail'] }, { id: 'test_knight', x: 4, y: 6 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
        const u = B();
        Bn().laySlime(3, 4, 3, u);
        Bn().laySlime(3, 5, 1, u);
        A().placeObject(5, 5, 'ben_parcel', { data: { dmg: 9, src: u.id } });
        const cv = document.createElement('canvas');
        cv.width = 320; cv.height = 220;
        ['snail', 'shell', 'dragon'].forEach(function (look) {
          Bn().enterForm(u, look);
          [0, 90, 180, 270, 37.5].forEach(function (yaw) {
            t.tryRun(look + ' at yaw ' + yaw, function () { DD.Render.renderTo(cv, { state: DD.Combat.state, width: 320, height: 220, yaw: yaw }); });
          });
        });
        t.ok(said.indexOf('LATE') >= 0, 'the parcel\'s tag reads LATE');
      }
      // the painters called directly (tile-local, yaw-free) and the streak at five moments
      const g = { ctx: document.createElement('canvas').getContext('2d') };
      if (DD.Iso && DD.Iso.painter) {
        const cv2 = document.createElement('canvas');
        cv2.width = cv2.height = 100;
        const gp = DD.Iso.painter(cv2.getContext('2d'), { t: 1, tile: { x: 3, y: 4 }, ground: true });
        t.tryRun('drawSlime', function () { Bn().painters.drawSlime(gp, { id: 'ben_slime', turns: 3, data: {} }, 1); Bn().painters.drawSlime(gp, { id: 'ben_slime', turns: 1, data: {} }, 2); });
        t.tryRun('drawParcel', function () { Bn().painters.drawParcel(gp, { id: 'ben_parcel', data: {} }, 1); });
      }
      const view = { zoom: 1.5, toScreen: function (x, y, h) { return { x: (x - y) * 32 + 160, y: (x + y) * 16 - (h || 0) * 12 + 40 }; } };
      [0, 0.25, 0.5, 0.75, 1].forEach(function (p) {
        t.tryRun('streak at ' + p, function () { Bn().painters.drawStreak(g.ctx, 40, 60, p, view, { to: { x: 6, y: 4, h: 0 } }); });
      });
    } finally { proto.fillText = orig; }
  });

  // ---- 18. combos with the cast -------------------------------------------------------------------------------------------
  T.suite('hero_benedick: combos with the cast (Valdris, Bark-B-Q, Betty\'s Kick \'Em, Hjalmar\'s traps, a pinned foe)', function (t) {
    if (!ready(t)) return;
    let ran = 0;
    // Valdris +3 on a Slow-Burned foe
    if (DD.getHero('valdris')) {
      fight({ heroes: [{ x: 1, y: 4, skills: ['ben_shell'] }, { id: 'valdris', x: 4, y: 3 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 5, y: 3, hpMult: 3 }] });
      const u = B(), v = hero('valdris'), burned = at(4, 4), plain = at(5, 3);
      Bn().enterForm(u, 'dragon');
      use(t, u, u.basic, 4, 4, 'Slow Burn');
      DD.Combat.giveTurnTo(v);
      const b0 = burned.hp, p0 = plain.hp;
      use(t, v, v.basic, 4, 4, 'Valdris on the burning foe');
      use(t, v, v.basic, 5, 3, 'Valdris on a cold foe');
      t.eq((b0 - burned.hp) - (p0 - plain.hp), 3, 'Valdris: +3 on the Slow-Burned foe');
      ran++;
    }
    // Bark-B-Q finds a Slow-Burned foe
    if (DD.getHero('pebbles') && DD.getSkill('peb_bbq')) {
      fight({ heroes: [{ x: 1, y: 4, skills: ['ben_shell'] }, { id: 'pebbles', x: 3, y: 4, skills: ['peb_bbq'] }], enemies: [{ id: 'test_grunt', x: 3, y: 5, hpMult: 3 }] });
      const u = B(), p = hero('pebbles');
      Bn().enterForm(u, 'dragon');
      use(t, u, u.basic, 3, 5, 'Slow Burn');
      DD.Combat.giveTurnTo(p);
      t.eq(DD.Combat.canUse(p, p.skills[0]), true, 'Bark-B-Q finds the burning foe');
      ran++;
    }
    // Betty's Kick 'Em doubles on a Riddled foe
    if (DD.getHero('betty') && DD.getSkill('bet_kick')) {
      fight({ heroes: [{ x: 1, y: 4 }, { id: 'betty', x: 3, y: 5, skills: ['bet_kick'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }] });
      const u = B(), b = hero('betty'), g = at(3, 4);
      const sl = give(u, 'ben_riddle', 1);
      use(t, u, sl, 3, 4, 'Riddle');
      DD.Combat.giveTurnTo(b);
      const h0 = g.hp;
      use(t, b, b.skills[0], 3, 4, 'Kick \'Em');
      t.eq(h0 - g.hp, DD.skillLevel(DD.getSkill('bet_kick'), 1).down, 'Kick \'Em While They\'re Down: the big number on a Riddled foe');
      ran++;
    }
    // a Hjalmar trap springs on a foe pulled onto it by Slime Line
    if (DD.getHero('hjalmar') && DD.getObject('hja_bear_trap')) {
      fight({ heroes: [{ x: 1, y: 4 }, { id: 'hjalmar', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
      const u = B(), g = at(4, 4), hj = hero('hjalmar');
      A().placeObject(2, 4, 'hja_bear_trap', { data: { src: hj.id, owner: hj.id } });
      use(t, u, give(u, 'ben_slime_line', 1), 4, 4, 'Slime Line onto a bear trap');
      t.ok(g.x === 2 && (has(g, 'root') || !tile(2, 4).obj), 'the pulled foe springs Hjalmar\'s trap');
      ran++;
    }
    // Snail Mail on a pinned (Rooted) foe: it can't leave, the parcel lands
    fight({ heroes: [{ x: 1, y: 4, skills: ['ben_mail'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }], enemyAi: true });
    const u = B(), g = foes()[0];
    A().addStatus(g, 'root', { turns: 1 }, u);
    t.ok(Bn().mailScore(DD.Targeting.buildCtx(u, u.skills[0], { x: 5, y: 4 })) > 7, 'AutoPlay sees a Rooted foe as a sure delivery');
    use(t, u, u.skills[0], 5, 4, 'post on a Rooted foe');
    const g0 = g.hp;
    DD.Combat.endTurn();
    t.ok(g0 - g.hp >= 9 && g.x === 5, 'the parcel lands on the pinned foe');
    t.log(ran + ' cast combos ran (the rest need their hero files)');
  });

  // ---- 18b. review (V3) regressions ----------------------------------------------------------------------------------
  T.suite('hero_benedick: review (V3) — Spit Shine covers all 5 tiles, the Snail Mail preview is the hit that lands, the Sign mid-walk, a stunned last flight', function (t) {
    if (!ready(t)) return;
    // Spit Shine on the tile next to him: his own tile is one of the 5 (desc: "a tile ... and the 4 tiles around it")
    [1, 3].forEach(function (lv) {
      fight({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 5, y: 5 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = B();
      const sl = give(u, 'ben_spit_shine', lv);
      use(t, u, sl, 5, 4, 'L' + lv + ' Spit Shine next to him');
      t.eq(slimeTiles().join(' '), ['4,4', '5,3', '5,4', '5,5', '6,4'].sort().join(' '), 'L' + lv + ': all 5 tiles, his own and an ally\'s included');
      // and the trail keeps it (refreshed) when he crawls off; heroes walk it freely
      const r0 = tile(4, 4).surface.turns;
      t.ok(DD.Combat.move(u, 3, 4), 'L' + lv + ': he crawls off it');
      DD.Combat.endTurn();
      t.ok(slime(4, 4) && tile(4, 4).surface.turns >= Math.min(r0, 3), 'L' + lv + ': the tile he crawled off keeps (or refreshes) its slime');
    });
    // the Snail Mail preview prints what the parcel will take off: its armor, his Weak, a cheat's takenMult — and the
    // foe's Block, which is gone by the delivery (Block expires at the start of its own turn), is not counted
    [1, 2, 3].forEach(function (lv) {
      const M = [9, 11, 13][lv - 1];
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_brute', x: 5, y: 4 }, { id: 'test_grunt', x: 5, y: 5, hpMult: 3 }] });
      const u = B();
      const sl = give(u, 'ben_mail', lv);
      const brute = at(5, 4), grunt = at(5, 5);
      A().addStatus(brute, 'stun', { turns: 3 }, u);
      A().addStatus(grunt, 'stun', { turns: 3 }, u);
      A().addStatus(u, 'weak', { turns: 3 }, brute);
      A().addStatus(grunt, 'ben_in_shell', { silent: true }, null);   // any takenMult status (a cheat's would read the same)
      brute.block = 5;
      const prev = DD.Combat.preview(u, sl, 5, 4);
      const want = {};
      [brute, grunt].forEach(function (f) { want[f.id] = Bn().mailHit(u, f, M); });
      t.ok(want[brute.id] < M && want[grunt.id] < M, 'L' + lv + ': armor / Weak / takenMult cut the number (' + want[brute.id] + ', ' + want[grunt.id] + ' of ' + M + ')');
      [brute, grunt].forEach(function (f) {
        const e = prev && prev.perUnit[f.id];
        t.ok(e && e.dmg === 0 && e.text === '📦 ' + want[f.id] + ' next turn', 'L' + lv + ': ' + f.name + ' preview "' + (e && e.text) + '", 0 now');
      });
      const h = [brute.hp, grunt.hp];
      use(t, u, sl, 5, 4, 'L' + lv + ' post');
      toHisTurn(u);
      t.eq((h[0] - brute.hp) + ',' + (h[1] - grunt.hp), want[brute.id] + ',' + want[grunt.id], 'L' + lv + ': what landed = the preview (Block 5 expired first)');
    });
    // the Do Not Disturb Sign on his own walk: the attack of opportunity that would down him ends the walk, drains the
    // AP he had left, shells him; the tile he crawled off gets slime at his turn end; he bursts out next turn, 1 HP
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'], items: ['ben_dnd_sign'] }], enemies: [{ id: 'test_grunt', x: 3, y: 5 }] });
    let u = B();
    u.hp = 1;
    const cd0 = u.skills[0].cd;
    t.ok(DD.Combat.move(u, 2, 6), 'he crawls past the grunt and away (an attack of opportunity as he leaves 2,5)');
    t.ok(u.x === 2 && u.y === 5 && u.hp === 1 && Bn().inShell(u) && u.ap === 0, 'the Sign: 1 HP, in his shell, the walk ended where the strike landed (' + u.x + ',' + u.y + '), AP 0');
    t.ok(!DD.Combat.canUndo(), 'no Undo after the save');
    if (DD.Combat.current() === u) DD.Combat.endTurn();
    t.eq(slimeTiles().join(' '), '2,4', 'slime on the tile he crawled off');
    toHisTurn(u);
    t.ok(DD.Combat.current() === u && Bn().isDragon(u) && u.hp === 1 && u.skills[0].cd === cd0, 'next turn: the Dragonsnail at 1 HP, the switch\'s cooldown untouched');
    // stunned at the start of his last Dragonsnail turn, hovering over a pit: the lost turn still ends with the glide
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }],
      terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } });
    u = B();
    Bn().enterForm(u, 'dragon');
    A().teleport(u, 5, 4, { fx: false });
    A().addStatus(u, 'stun', { turns: 1 }, null);
    const h0 = u.hp;
    const lines = logged(/loses the turn|glides down/, function () { DD.Combat.endTurn(); DD.Combat.endTurn(); });
    t.ok(lines.length === 2 && /loses the turn/.test(lines[0]) && /glides down/.test(lines[1]), 'a stunned last flight: the turn is lost, then he glides (' + lines.join(' | ') + ')');
    t.ok(u.hp === h0 && !DD.Grid.isDrop(u.x, u.y) && form(u) === 'snail', 'no fall: a snail on safe ground');
  });

  // ---- 19. zz sim (sim=1 only) ---------------------------------------------------------------------------------------------
  // ---- QA fixes (Nov 17) ------------------------------------------------------------------------------------------------
  T.suite('hero_benedick: QA HERO-2/4/6 — the slime texts name the spiders, the shell shows its half on the hit, the form speaks', function (t) {
    if (!ready(t)) return;
    // HERO-2: "spiders" in the texts is exact while the only root-proof foes are spiders, and every non-boss spider is root-proof
    const enemies = Object.keys(DD.defs.enemies).map(function (k) { return DD.defs.enemies[k]; }).filter(function (e) { return !/^test_/.test(e.id) && e.tier !== 'boss'; });
    const proof = enemies.filter(function (e) { return e.flags && Array.isArray(e.flags.immune) && e.flags.immune.indexOf('root') >= 0; });
    const spiders = enemies.filter(function (e) { return (e.tags || []).indexOf('spider') >= 0; });
    t.ok(proof.every(function (e) { return (e.tags || []).indexOf('spider') >= 0; }), 'every root-proof foe is a spider: ' + proof.map(function (e) { return e.name; }).join(', '));
    t.ok(spiders.every(function (e) { return proof.indexOf(e) >= 0; }), 'every spider is root-proof: ' + spiders.map(function (e) { return e.name; }).join(', '));
    const h = DD.getHero(HERO);
    t.ok(/bosses and spiders aside/.test(h.passive.desc) && words(h.passive.desc) <= 34, 'the passive names them (' + words(h.passive.desc) + ' words)');
    t.ok(/not bosses or spiders/.test(DD.getSurface('ben_slime').desc), 'the surface names them');
    t.ok((DD.defs.narration.tips || []).some(function (l) { return /Benedick's slime stops any grounded foe \(not a boss or a spider\)/.test(l); }), 'the loading tip names them');
    if (DD.getEnemy('a1_spider')) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'a1_spider', x: 6, y: 4 }] });
      t.ok(!Bn().sticks(foes()[0]), 'the Cellar Spider walks through (sticks: false), as the texts say');
    }
    // HERO-4: a hit on the shell says "halved" on the hit itself
    fight({ heroes: [{ x: 2, y: 4, skills: ['ben_shell'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    const u = B(), g = foes()[0];
    Bn().withdraw(u, null, 'test');
    t.ok(has(u, 'ben_in_shell'), 'in his shell');
    const texts = [];
    const orig = DD.FX.text;
    DD.FX.text = function (who, text) { if (who === u) texts.push(String(text)); return orig.apply(this, arguments); };
    try {
      DD.Combat._action(function () { A().damage(g, u, 6, { cause: 'other' }); });
      t.ok(texts.indexOf('🐚 halved') >= 0, 'the hit shows "🐚 halved" (' + texts.join(' | ') + ')');
      texts.length = 0;
      DD.Targeting.simulate(function () { A().damage(DD.Combat.byId(g.id), DD.Combat.byId(u.id), 6, { cause: 'other' }); return 0; });
      t.ok(texts.indexOf('🐚 halved') < 0, 'a dry run shows nothing');
    } finally { DD.FX.text = orig; }
    // HERO-6: move and kill follow the form; the dragon's lines are caps, ≤ 70, name nobody
    const FB = Bn().FORM_BARKS;
    t.eq(h.barks.move.join('|'), FB.snail.move.join('|'), 'a snail: the snail\'s move lines');
    Bn().enterForm(u, 'dragon');
    t.ok(Bn().isDragon(u), 'now a Dragonsnail');
    t.eq(h.barks.move.join('|') + '#' + h.barks.kill.join('|'), FB.dragon.move.join('|') + '#' + FB.dragon.kill.join('|'), 'a Dragonsnail: the dragon\'s move and kill lines');
    const names = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); }).map(function (id) { return DD.defs.heroes[id].name.split(' ')[0]; });
    FB.dragon.move.concat(FB.dragon.kill).forEach(function (l) {
      t.ok(l === l.toUpperCase() && l.length <= 70 && !names.some(function (n) { return n.length >= 3 && l.indexOf(n.toUpperCase()) >= 0; }), 'dragon line: ' + l);
    });
    t.ok(FB.snail.move.length >= 3 && FB.snail.kill.length >= 3 && FB.dragon.move.length >= 3 && FB.dragon.kill.length >= 3, '3+ lines each');
  });

  T.suite('hero_benedick: zz balance sim (sim=1 only)', function (t) {
    if (t.param('sim', '0') !== '1') { t.skip('sim=1 only'); return; }
    if (!ready(t) || !DD.Encounter) return;
    const n = Math.max(1, +t.param('n', 2) || 2);
    const encs = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; })
      .filter(function (e) { return !/^(test_|mgt_|mg_)/.test(e.id) && e.kind !== 'boss' && e.act >= 1 && e.act <= 3 && !e.gauntlet && !e.finale; });
    const pool = Object.keys(DD.defs.heroes).filter(function (k) { return k.indexOf('test_') !== 0 && k !== HERO; });
    const rng = DD.RNG('ben-sim:' + t.seed);
    const tally = {}, uses = {}, sockets = {};
    let fights = 0, wins = 0, hisTurns = 0, dragonTurns = 0, long = 0, shelledLong = 0, stops = 0, posts = 0, mailHits = 0, taken = 0, downs = 0, serum = 0;
    let shelledNow = false;
    // his turns and Dragonsnail turns are counted by the probe rule's onTurnStart (rules fire after his passive emerged him)
    const offLog = DD.Events.on('combat:log', function (e) {
      const s = String((e && (e.text || e.msg || (e.entry && e.entry.text))) || '');
      if (/gets stuck in/.test(s)) stops++;
      if (/moisturises/.test(s)) serum++;
    });
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
      shelledNow = false;
      A().addRule({ id: 'ben_sim_probe', name: 'probe', silent: true, hooks: {
        onSkillUsed: function (ctx) {
          if (A().simulating || !ctx.user || ctx.user.defId !== HERO || !ctx.skill || ctx.opportunity) return;
          uses[ctx.skill.id] = (uses[ctx.skill.id] || 0) + 1;
          if (ctx.skill.id === 'ben_shell') shelledNow = true;
          if (ctx.skill.id === 'ben_mail') posts++;
        },
        onTurnStart: function (unit) { if (!A().simulating && unit && unit.defId === HERO && !unit.downed) { hisTurns++; if (Bn().isDragon(unit)) dragonTurns++; } },
        onTakeDamage: function (d) {
          if (A().simulating || !d) return;
          if ((d.tags || []).indexOf('parcel') >= 0 && d.dealt > 0) mailHits++;
          if (d.target && d.target.defId === HERO) taken += d.dealt || 0;
        },
      } });
      const res = DD.AutoPlay.runBattle(30);
      A().removeRule('ben_sim_probe');
      const s = DD.Combat.state;
      fights++;
      if (res.result === 'victory') wins++;
      if (res.rounds >= 4) { long++; if (shelledNow) shelledLong++; }
      s.units.filter(function (u) { return u.kind === 'hero'; }).forEach(function (u) {
        const r = tally[u.defId] || (tally[u.defId] = { fights: 0, dmg: 0, kills: 0, downs: 0 });
        const us = s.stats.units[u.id] || {};
        r.fights++; r.dmg += us.dmg || 0; r.kills += us.kills || 0; r.downs += u.downed ? 1 : 0;
        if (u.defId === HERO && u.downed) downs++;
      });
    }
    try {
      encs.forEach(function (enc) { for (let i = 0; i < n; i++) oneFight(enc); });
    } finally { offLog(); }
    Object.keys(tally).sort().forEach(function (id) {
      const r = tally[id];
      t.log(id + ': ' + r.fights + ' fights · dmg/fight ' + (r.dmg / r.fights).toFixed(1) + ' · kills/fight ' + (r.kills / r.fights).toFixed(2) + ' · downed ' + r.downs);
    });
    t.log('Benedick uses per fight when socketed: ' + POOL.filter(function (id) { return sockets[id]; }).map(function (id) {
      return DD.getSkill(id).name + ' ' + ((uses[id] || 0) / sockets[id]).toFixed(2) + ' (' + sockets[id] + ')';
    }).join(' · '));
    t.log('basics: Teeth ' + (uses.ben_teeth || 0) + ' · Slow Burn ' + (uses.ben_slow_burn || 0) + ' · The Inevitable ' + (uses.ben_inevitable || 0));
    t.log('shell in ' + shelledLong + '/' + long + ' fights of 4+ rounds (' + (long ? (100 * shelledLong / long).toFixed(0) : '–') + '%) · dragon ' + dragonTurns + '/' + hisTurns + ' turns (' +
      (hisTurns ? (100 * dragonTurns / hisTurns).toFixed(0) : '–') + '%)');
    t.log('slime stops ' + stops + ' (' + (stops / Math.max(1, fights)).toFixed(2) + '/fight) · Serum heals ' + serum + ' · parcels ' + posts + ', foes hit ' + mailHits + ' (' + (mailHits / Math.max(1, posts)).toFixed(2) + '/post)');
    t.log('Benedick: damage taken ' + (taken / Math.max(1, fights)).toFixed(1) + '/fight · downed ' + downs + ' · fights ' + fights + ', wins ' + wins);
    t.ok(fights > 0, 'simulated');
  });
})();
