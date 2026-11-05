/* Dungeons and Degenerates — tests/content/hero_betty.js
 * Suites "hero_betty: …" for js/data/heroes/betty.js (owner: hero-betty), written for v2 (initiative order, one turn per
 * unit, no telegraphs, no Guard; durations count the owner's own turns; attacks of opportunity). Covers the definition,
 * the Eats Anything passive, every skill at every level (desc == effect in sandbox fights), the signature, the 3 items,
 * exact HUD previews, attacks of opportunity (his hammer holds the line, You Shall Not Pasture!, walking away from a foe
 * provokes, his charges / leaps / flips never do), v2 edge cases (stunned / silenced / sheep / charmed Betty, targets
 * dying mid-skill, pits / lava / water / edges, AP, statuses lasting exactly the right own turns) and AutoPlay battles at
 * levels 1 / 3 / 5.
 * Run: bash tools/test.sh "suite=hero_betty&isolate=heroes/betty,hero_betty"
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const POOL = ['bet_ram', 'bet_headbutt', 'bet_horn_toss', 'bet_bleat', 'bet_stomp', 'bet_goat_yoga', 'bet_snack', 'bet_mountain_goat', 'bet_kick',
    'bet_pasture'];
  const ALL_SKILLS = ['bet_family_hammer', 'bet_goat'].concat(POOL);
  const ITEMS = ['bet_grandmas_mallet', 'bet_name_plate', 'bet_cowbell'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const EXTRA_BARKS = ['ram', 'toss', 'bleat', 'eat', 'opportunity', 'pasture'];

  // ---- helpers -----------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function S() { return DD.Combat.state; }
  /** Sandbox that never ends on its own (custom objective), heroes first, enemies frozen unless cfg.enemyAi is given. */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = (cfg.heroes || [{ x: 2, y: 4 }]).map(function (h) { return Object.assign({ id: 'betty', level: 1, skills: [] }, h); });
    DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, enemies: [], enemyAi: false,
      objective: { type: 'custom', text: 'Betty test' }, encounter: { id: 'bet_test_arena', checkObjective: function () { return null; } },
    }, cfg, { heroes: heroes }));
    return S();
  }
  function B() { return DD.Combat.heroes().filter(function (u) { return u.defId === 'betty'; })[0]; }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function foes() { return DD.Combat.enemies(); }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function dead(defId) { return S().units.filter(function (u) { return u.defId === defId && u.dead; }).length; }
  function pos(u) { return u.x + ',' + u.y; }
  /** The slot Betty uses for a skill (basic / signature, or a fresh socket at a level). */
  function give(u, id, level) {
    if (id === 'bet_family_hammer') return u.basic;
    if (id === 'bet_goat') return u.signature;
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
  function valid(u, sl, x, y) { return DD.Targeting.isValidTarget(u, sl, x, y); }
  /** The reason canTarget gives for a tile (or true). */
  function why(u, sl, x, y) {
    const def = DD.getSkill(sl.id);
    const ctx = DD.Targeting.buildCtx(u, sl, { x: x, y: y });
    return def.target.canTarget(ctx);
  }
  /** Hype gains (amount, reason) recorded while fn runs. */
  function hypeGains(fn) {
    const list = [], orig = DD.Act.gainHype;
    DD.Act.gainHype = function (n, w) { list.push({ n: n, why: String(w || '') }); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.Act.gainHype = orig; }
    return list;
  }
  function sumOf(list, re) { return list.filter(function (g) { return re.test(g.why); }).reduce(function (a, g) { return a + g.n; }, 0); }
  /** A Hype number from DD.Balance (the balance role may retune it), with the engine's fallback. */
  function HY(k) { const h = DD.Balance && DD.Balance.hype; return h && typeof h[k] === 'number' ? h[k] : { kill: 8, envKill: 20, multiHit: 4 }[k]; }
  /**
   * Preview, then use for real, then compare HP changes / KOs / movement / Hype. Betty's kit rolls no dice, so every
   * preview must be certain and exact (passive heals included).
   */
  function previewMatches(t, u, sl, x, y, label) {
    const s = S();
    const before = {};
    s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed, x: o.x, y: o.y }; });
    const hype0 = s.hype, rng0 = s.rng.getState();
    let prev = null;
    t.tryRun(label + ' preview', function () { prev = DD.Combat.preview(u, sl, x, y); });
    t.ok(!!prev && s.rng.getState() === rng0 && s.hype === hype0 &&
      s.units.every(function (o) { const b = before[o.id]; return b && b.hp === o.hp && b.x === o.x && b.y === o.y; }), label + ': preview left the fight untouched');
    if (!prev) return null;
    t.ok(!prev.uncertain, label + ': certain preview (no dice in Betty\'s kit)');
    if (!use(t, u, sl, x, y, label)) return prev;
    s.units.forEach(function (o) {
      const b = before[o.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[o.id];
      t.eq(b.hp - o.hp, e ? (e.dmg || 0) - (e.heal || 0) : 0, label + ': ' + o.name + ' HP change = preview');
      t.eq((o.dead && !b.dead) || (o.downed && !b.downed), !!(e && e.lethal), label + ': ' + o.name + ' KO = preview');
      if (!o.dead && !(e && e.lethal)) t.eq(o.x !== b.x || o.y !== b.y, !!(e && e.moved), label + ': ' + o.name + ' movement = preview');
    });
    t.eq(s.hype - hype0, prev.hype, label + ': Hype = preview');
    return prev;
  }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }
  // ---- attacks of opportunity helpers ----
  const SPR = { base: 'humanoid', scale: 0.9, palette: { skin: '#6fa04a', cloth: '#7a4a2a' } };
  const TEMP_BARKS = { spawn: ['Gotta go!'], attack: ['Hi-yah!'], hurt: ['Ow!'], death: ['Bye!'] };
  /** Register throwaway enemy defs for one suite; they are removed again even if the suite throws. */
  function withTemp(defs, fn) {
    defs.forEach(function (d) { DD.registerEnemy(d); });
    try { return fn(); } finally { defs.forEach(function (d) { delete DD.defs.enemies[d.id]; }); }
  }
  /** A goblin whose turn is always one walk 3 tiles east (a move action: it provokes like any walk). */
  function runner(id) {
    return { id: id, name: 'Test Runner', act: 1, tier: 'normal', hp: 14, mov: 4, armor: 0, tags: ['goblin'], sprite: SPR,
      skills: ['test_grunt_stab'], xp: 1, gold: [0, 0], barks: TEMP_BARKS, desc: 'A test goblin that always runs east.',
      ai: function (unit, api) { api.moveTo(unit, Math.min(api.state.grid.w - 1, unit.x + 3), unit.y); } };
  }
  /** A diver (AI style 'assassin': goes for the weakest hero, shrugs off attacks of opportunity unless lethal). */
  function shank(id) {
    return { id: id, name: 'Test Shank', act: 1, tier: 'normal', hp: 14, mov: 3, armor: 0, tags: ['goblin'], sprite: SPR,
      skills: ['test_grunt_stab'], ai: 'assassin', xp: 1, gold: [0, 0], barks: TEMP_BARKS, desc: 'A test goblin that dives the squishy.' };
  }
  /** The attacks of opportunity made while fn runs: [{ a: attacker defId, m: mover defId, skill }]. */
  function opportunities(fn) {
    const seen = [];
    const off = DD.Events.on('opportunity:attack', function (e) { seen.push({ a: e.attacker.defId, m: e.mover.defId, skill: e.skillId }); });
    try { fn(); } finally { off(); }
    return seen;
  }
  /** Everything Betty says or is described with (pronoun checks). */
  function bettyTexts() {
    const h = DD.getHero('betty');
    const out = [h.blurb, h.passive.desc, h.role];
    for (const k in h.barks) out.push.apply(out, h.barks[k]);
    ALL_SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      for (let lv = 1; lv <= s.levels.length; lv++) out.push(DD.skillDesc(s, lv, null));
      out.push(s.flavor);
    });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); out.push(it.desc, it.flavor); });
    return out;
  }

  // ---- 1. definition ------------------------------------------------------------------------------------
  T.suite('hero_betty: definition, pool, barks, items, sprite', function (t) {
    const h = DD.getHero('betty');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.ok(h.name === 'Betty' && h.epithet === 'the G.O.A.T.' && h.race === 'Goatfolk' && h.cls === 'Warrior', 'name, epithet, race, class');
    t.ok(h.complexity >= 1 && h.complexity <= 3 && h.role && h.blurb.length > 60 && /^#[0-9a-f]{6}$/i.test(h.color), 'role, complexity, blurb, color');
    t.ok(/family name/i.test(h.blurb), 'blurb: "It\'s a family name."');
    t.eq(h.unlock, null, 'available from the start (unlock: null)');
    t.eq(JSON.stringify(h.stats), JSON.stringify({ hp: 32, ap: 3, mov: 4, armor: 0, init: 1 }), 'stats: 32 HP, 3 AP, move 4, init +1 (DESIGN §6)');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth +3-5 HP');
    t.ok(h.flags.hop === true && !h.flags.immovable && !h.flags.flying, 'hop (goats climb), not immovable, not flying');
    t.eq(h.startingSkills.join(','), 'bet_ram,bet_headbutt', 'starts with Ramming Speed! and Butt Out');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'pool of 10 (DESIGN §6 v2: 8-10, 2 starting)');
    t.ok(h.startingSkills.every(function (id) { return h.skillPool.indexOf(id) >= 0; }), 'starters are in the pool');
    t.eq((h.summons || []).length, 0, 'no summons');
    const basic = DD.getSkill(h.basic), sig = DD.getSkill(h.signature);
    t.ok(basic && basic.ap === 1 && basic.levels[0].dmg >= 4 && basic.levels[0].dmg <= 6 && !basic.cooldown && !basic.charges, 'basic: 1 AP, 4-6 damage, always available');
    t.ok(sig && sig.hype === 100 && sig.levels[0].dmg >= 15 && sig.levels[0].dmg <= 25, 'signature: 100 Hype, 15-25 damage');
    POOL.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'betty' && s.levels.length === 3, id + ': registered, owner betty, 3 levels');
      if (!s) return;
      t.ok(typeof s.icon === 'string' && s.icon.length > 0 && s.icon.length <= 4, id + ': one emoji icon');
      t.ok(s.flavor && s.flavor.length <= 120, id + ': flavor ≤ 120');
      t.ok(s.kind !== 'spell', id + ': not a spell (Silence never stops a goat)');
      const face = [1, 2, 3].map(function (lv) {
        return DD.skillDesc(s, lv, null) + ' | cd ' + DD.resolve(s.cooldown, DD.skillLevel(s, lv), null, 0);
      });
      t.ok(face[0] !== face[1] && face[1] !== face[2], id + ': every level reads differently (desc or cooldown)');
    });
    ALL_SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = DD.skillDesc(s, lv, null);
        t.ok(d && !/undefined|NaN|\[object/.test(d), id + ' L' + lv + ': desc works without a user');
        t.ok(words(d) <= 25, id + ' L' + lv + ': desc reads in one breath (' + words(d) + ' words): ' + d);
      }
    });
    t.ok(words(h.passive.desc) <= 25 && /4 HP/.test(h.passive.desc), 'passive: one rule, one breath, exact number');
    Object.keys(DD.defs.skills).forEach(function (k) { if (DD.defs.skills[k].owner === 'betty') t.ok(ALL_SKILLS.indexOf(k) >= 0, 'skill ' + k + ' is known'); });
    // his icons share the action bar with each other and with any generic skill he learns from a tome
    const icons = ALL_SKILLS.map(function (id) { return DD.getSkill(id).icon; });
    t.eq(new Set(icons).size, icons.length, 'his ' + icons.length + ' skills have different icons');
    const genIcons = Object.keys(DD.defs.skills).filter(function (k) { return DD.defs.skills[k].owner === 'generic'; })
      .map(function (k) { return DD.defs.skills[k].icon; });
    t.eq(ALL_SKILLS.filter(function (id) { return genIcons.indexOf(DD.getSkill(id).icon) >= 0; }).join(','), '',
      'no icon of his is a generic skill\'s (' + genIcons.length + ' generic skills loaded)');
    Object.keys(DD.defs.statuses).forEach(function (k) { if (/^bet_/.test(k)) t.eq(k, 'bet_pasture', 'one custom status (' + k + '): You Shall Not Pasture!'); });
    const ps = DD.getStatus('bet_pasture');
    t.ok(ps && ps.name === 'Territorial' && ps.type === 'buff' && ps.decay === 'turnStart' && ps.defaultTurns === 1 &&
      typeof ps.hooks.modifyOpportunity === 'function' && typeof ps.hooks.onOpportunityAttack === 'function',
    'bet_pasture "Territorial": a buff until the start of his next turn, attack-of-opportunity hooks');
    t.ok(/\+3 damage and Root.*until his next turn\.$/.test(ps.desc({ stacks: 3, turns: 1 })), 'bet_pasture: status tooltip shows its bonus and that it lasts until his next turn');
    // barks: every key 4-6 lines, ≤ 70 chars (his extra keys too); the voice (kid, bleats, family name)
    let kid = 0, baa = 0;
    BARK_KEYS.concat(EXTRA_BARKS).forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ': 4-6 lines (' + lines.length + ')');
    });
    t.eq(Object.keys(h.barks).sort().join(','), BARK_KEYS.concat(EXTRA_BARKS).sort().join(','), 'bark keys: the standard ones + his skills\' extras');
    for (const k in h.barks) {
      h.barks[k].forEach(function (l) {
        t.ok(typeof l === 'string' && l.length > 0 && l.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(l) + ' (' + l.length + ')');
        if (/\bkids?\b/i.test(l)) kid++;
        if (/BAAA/i.test(l)) baa++;
      });
    }
    t.ok(kid >= 8, 'calls everyone "kid" (' + kid + ')');
    t.ok(baa >= 5, 'bleats mid-sentence (' + baa + ')');
    t.ok(h.barks.select.some(function (l) { return /family name/i.test(l); }) && h.barks.idle.some(function (l) { return /family name/i.test(l); }), '"It\'s a family name." is a running gag');
    // his own lines (review): never repeated across his keys; a line word for word another character's is reported as an
    // advisory (a warning, not a failure: the copy may be in someone else's file)
    const norm = function (l) { return String(l).toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim(); };
    const own = {};
    for (const k in h.barks) h.barks[k].forEach(function (l) { own[norm(l)] = (own[norm(l)] || 0) + 1; });
    t.eq(Object.keys(own).filter(function (n) { return own[n] > 1; }).join(' | '), '', 'no bark of his is repeated');
    ['heroes', 'enemies', 'summons'].forEach(function (bag) {
      Object.keys(DD.defs[bag] || {}).forEach(function (id) {
        const b = id === 'betty' ? null : DD.defs[bag][id].barks;
        for (const k in (b || {})) {
          (Array.isArray(b[k]) ? b[k] : [b[k]]).forEach(function (l) {
            if (own[norm(l)]) DD.warn('hero_betty advisory — ' + id + '.' + k + ' copies a Betty line: "' + l + '"');
          });
        }
      });
    });
    // pronouns: Betty is he/him everywhere
    bettyTexts().forEach(function (s) { t.ok(!/\b(she|her|hers|herself)\b/i.test(String(s)), 'he/him for Betty: ' + JSON.stringify(s)); });
    t.ok(/\bhe\b/i.test(h.passive.desc) && /\bhim\b/.test(DD.skillDesc(DD.getSkill('bet_horn_toss'), 1, null)), 'he/him in the rules text');
    // items: 3 for Betty, a rare and a legendary, one-sentence mechanics
    const rar = {};
    ITEMS.forEach(function (id) {
      const it = DD.getItem(id);
      t.ok(it && it.hero === 'betty' && it.desc && it.flavor && it.flavor.length <= 120, 'item ' + id + ' registered for Betty');
      if (!it) return;
      rar[it.rarity] = 1;
      t.ok(!(it.stats && it.stats.block), 'item ' + id + ': no starting Block (v2)');
    });
    t.ok(rar.rare && rar.legendary, 'a rare and a legendary item');
    // sprite (every pose, walking, downed) and portrait
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 160;
    const ctx = cv.getContext('2d');
    const p0 = DD.problems.length;
    ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) { DD.Sprites.draw(ctx, h.sprite, 80, 140, 2, { t: 0.5, pose: pose }); });
    DD.Sprites.draw(ctx, h.sprite, 80, 140, 2, { t: 0.7, walk: 0.3, facing: -1 });
    const px = ctx.getImageData(0, 0, 160, 160).data;
    let ink = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) ink++;
    t.ok(ink > 2000, 'sprite paints pixels (' + ink + ')');
    t.eq(DD.problems.length, p0, 'no sprite warnings (overlay included)');
    t.ok(h.sprite.head.horns === 'ram' && h.sprite.mainhand === 'hammer' && typeof h.sprite.overlay === 'function', 'ram horns, hammer, goat overlay');
    const por = DD.Sprites.portrait('betty', 64);
    t.ok(por && por.width === 64, 'portrait renders');
    // in a fight: init +1, hop
    fight({ heroes: [{ x: 2, y: 4 }] });
    const b = B();
    t.ok(b.init === 1 && b.flags.hop === true && b.maxHp === 32 && b.mov === 4, 'unit: init +1, hop, 32 HP, move 4');
  });

  // ---- 2. passive ---------------------------------------------------------------------------------------------
  T.suite('hero_betty: Eats Anything (every kill and every object his skills break heals 4)', function (t) {
    t.eq(DD.Betty.EAT_HEAL, 4, 'heals 4');
    // a kill with the basic attack
    fight({ heroes: [{ x: 2, y: 4, hp: 20 }, { id: 'test_knight', x: 6, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 7, y: 6 }],
      objects: [{ x: 2, y: 3, id: 'barrel' }, { x: 1, y: 4, id: 'crate' }] });
    let b = B();
    const g = at(3, 4);
    g.hp = 5;
    use(t, b, b.basic, 3, 4, 'hammer the grunt');
    t.ok(g.dead, 'grunt dead');
    t.eq(b.hp, 24, 'killed a foe: 20 → 24 (he eats its lunch)');
    // a broken object (barrel 5 HP)
    use(t, b, b.basic, 2, 3, 'hammer the barrel');
    t.ok(!tile(2, 3).obj, 'barrel broken');
    t.eq(b.hp, 28, 'broke an object: 24 → 28 (he eats the barrel)');
    // a hit that does not break the crate (6 HP) heals nothing
    use(t, b, b.basic, 1, 4, 'hammer the crate');
    t.ok(tile(1, 4).obj && tile(1, 4).obj.hp === 1, 'crate at 1 HP');
    t.eq(b.hp, 28, 'no break, no snack');
    // an ally's kill feeds the ally, not Betty
    DD.Combat.endTurn();
    const k = hero('test_knight');
    t.ok(DD.Combat.current() === k, 'knight\'s turn');
    const g2 = at(7, 6);
    g2.hp = 2;
    t.ok(DD.Combat.useSkill(k, k.basic, 7, 6) && g2.dead, 'the knight kills a grunt');
    t.eq(b.hp, 28, 'Betty did not eat the knight\'s kill');

    // Ramming Speed! crashes a goblin into an explosive barrel: the barrel breaks (+4), the blast kills the goblin (+4)
    fight({ heroes: [{ x: 2, y: 4, hp: 10 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
    b = B();
    const sl = give(b, 'bet_ram', 1);
    let gains = [];
    gains = hypeGains(function () { use(t, b, sl, 3, 4, 'ram into the barrel'); });
    t.ok(!tile(4, 4).obj && dead('test_grunt') === 1, 'KABOOM: barrel gone, grunt gone (6 ram + 3 crash + 8 blast)');
    t.eq(b.hp, 18, 'ate the barrel and the goblin\'s lunch: 10 → 18');
    t.eq(sumOf(gains, /environmental/), HY('envKill'), 'an environmental kill: +' + HY('envKill') + ' Hype');

    // a paid skill that breaks two objects heals twice; hits that break nothing heal nothing
    fight({ heroes: [{ x: 4, y: 4, hp: 10, level: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 3, hpMult: 3 }],
      objects: [{ x: 5, y: 4, id: 'barrel_explosive' }, { x: 6, y: 4, id: 'barrel_explosive' }] });
    b = B();
    const ham = b.basic;
    use(t, b, ham, 5, 4, 'hammer an explosive barrel (it chains into the next)');
    t.ok(!tile(5, 4).obj && !tile(6, 4).obj, 'both barrels gone (chain explosion)');
    t.eq(b.hp, 10 - 8 + 4 + 4, 'Betty ate 2 barrels (+8) and took the first blast (−8)');

    // the preview shows the snack
    fight({ heroes: [{ x: 2, y: 4, hp: 20 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    b = B();
    at(3, 4).hp = 3;
    const prev = DD.Combat.preview(b, b.basic, 3, 4);
    t.ok(prev.perUnit[b.id] && prev.perUnit[b.id].heal === 4 && prev.perUnit[at(3, 4).id].lethal, 'HUD preview: KO + Betty +4 HP');
    t.ok((b.data || {}).betObjects === undefined, 'the preview left no bookmark on the real Betty');
    // a kill through a use that was not paid (another hero's skill making Betty swing) still feeds him
    DD.Combat._action(function () { DD.Combat.resolveSkill(b, b.basic, { x: 3, y: 4 }, { pay: false }); });
    t.ok(dead('test_grunt') === 1 && b.hp === 24, 'an unpaid swing that kills still heals (the kill is his)');
    // a free re-use right after a paid one, same turn (an Echo Chamber echo), that breaks an object: he eats it too
    fight({ heroes: [{ x: 2, y: 4, hp: 20 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 3, y: 4, id: 'crate' }, { x: 2, y: 3, id: 'barrel' }] });
    b = B();
    use(t, b, b.basic, 3, 4, 'hammer the crate (6 HP)');
    t.ok(tile(3, 4).obj && tile(3, 4).obj.hp === 1 && b.hp === 20, 'cracked, not broken: no snack yet');
    DD.Combat._action(function () { DD.Combat.resolveSkill(b, b.basic, { x: 3, y: 4 }, { pay: false }); });
    t.ok(!tile(3, 4).obj && b.hp === 24, 'the echo breaks the crate: he eats it (+4)');
    // a consumable is not one of his skills: one that breaks an object is no snack (its kills still are)
    const flask = { id: 'bet_test_flask', name: 'Test Flask', icon: '🍾', ap: 1, target: { type: 'tile', range: [1, 5], los: false },
      execute: function (ctx) { DD.Act.damageObject(ctx.user, ctx.target.x, ctx.target.y, 99); } };
    DD.Combat._action(function () { DD.Combat.resolveSkill(b, flask, { x: 2, y: 3 }, { pay: true, consumable: true }); });
    t.ok(!tile(2, 3).obj && b.hp === 24, 'a consumable smashed the barrel: no snack');
    if (DD.getConsumable('con_bad_decisions')) {
      fight({ heroes: [{ x: 1, y: 1, hp: 20 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 4, y: 1, id: 'barrel_explosive' }],
        consumables: ['con_bad_decisions'] });
      b = B();
      t.ok(DD.Combat.useConsumable(b, 0, 4, 1) && !tile(4, 1).obj, 'Flask of Bad Decisions sets off the explosive barrel');
      t.eq(b.hp, 20, 'the flask is not one of his skills: no snack');
    }
    // full HP: nothing to heal, nothing breaks
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    b = B();
    at(3, 4).hp = 2;
    use(t, b, b.basic, 3, 4, 'kill at full HP');
    t.eq(b.hp, b.maxHp, 'full HP stays full');
  });

  // ---- 3. basic + Ramming Speed! ---------------------------------------------------------------------------------
  T.suite('hero_betty: The Family Hammer and Ramming Speed! at every level (pits, lava, water, edges, allies)', function (t) {
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 3 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }],
      objects: [{ x: 1, y: 4, id: 'crate' }, { x: 2, y: 5, id: 'lever' }] });
    let b = B();
    t.ok(valid(b, b.basic, 3, 4) && valid(b, b.basic, 1, 4), 'hammer: an adjacent foe or a breakable crate');
    t.ok(!valid(b, b.basic, 2, 3) && !valid(b, b.basic, 2, 5) && !valid(b, b.basic, 4, 4), 'hammer: not an ally, a lever (unbreakable) or a foe 2 tiles away');
    t.eq(why(b, b.basic, 2, 5), 'Nothing there to hit (or eat).', 'reason for an unbreakable object');
    use(t, b, b.basic, 3, 4, 'hammer');
    t.eq(at(3, 4).hp, 14 - 5, 'hammer: 5 damage');
    use(t, b, b.basic, 1, 4, 'hammer the crate');
    t.eq(tile(1, 4).obj.hp, 6 - 5, 'hammer: 5 damage to the crate');

    // Ramming Speed! at every level: charge, hit, push
    [{ dmg: 6, range: 3, push: 2 }, { dmg: 8, range: 3, push: 2 }, { dmg: 9, range: 4, push: 3 }].forEach(function (L, i) {
      const lv = i + 1, gx = 1 + L.range;
      fight({ w: 12, heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: gx, y: 4, hpMult: 2 }] });
      b = B();
      const sl = give(b, 'bet_ram', lv);
      const g = at(gx, 4);
      t.ok(valid(b, sl, gx, 4) && !valid(b, sl, gx + 1, 4) && !valid(b, sl, gx, 5), 'L' + lv + ': straight line, range ' + L.range);
      t.eq(DD.skillDesc(DD.getSkill('bet_ram'), lv, b), 'Charge up to ' + L.range + ' tiles in a straight line. The first foe in the way takes ' + L.dmg +
        ' damage and is pushed ' + L.push + ' tiles.', 'L' + lv + ': desc');
      use(t, b, sl, gx, 4, 'L' + lv + ' ram');
      t.eq(pos(b), (gx - 1) + ',4', 'L' + lv + ': charged ' + (L.range - 1) + ' tiles up to the foe');
      t.eq(g.hp, 28 - L.dmg, 'L' + lv + ': ' + L.dmg + ' damage');
      t.eq(pos(g), (gx + L.push) + ',4', 'L' + lv + ': pushed ' + L.push);
      t.eq(sl.cd, 2, 'L' + lv + ': cooldown 2');
      t.eq(b.ap, 1, 'L' + lv + ': 2 AP');
    });
    // a foe beyond the range: he just charges (no hit)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    b = B();
    let sl = give(b, 'bet_ram', 1);
    use(t, b, sl, 4, 4, 'ram at an empty tile');
    t.ok(pos(b) === '4,4' && at(5, 4).hp === 14, 'dashed 3 tiles, the foe on the 4th was not in the way');
    // allies and obstacles stop him before them
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], objects: [{ x: 3, y: 6, id: 'crate' }] });
    b = B();
    sl = give(b, 'bet_ram', 1);
    use(t, b, sl, 4, 4, 'ram through an ally');
    t.ok(pos(b) === '2,4' && at(4, 4).hp === 14 && pos(hero('test_knight')) === '3,4', 'stopped before the ally, nobody hurt');
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 7 }], objects: [{ x: 3, y: 6, id: 'crate' }] });
    b = B();
    sl = give(b, 'bet_ram', 1);
    t.ok(valid(b, sl, 3, 5), 'can still dash up to the crate');
    use(t, b, sl, 3, 7, 'ram past a crate');
    t.ok(pos(b) === '3,5' && at(3, 7).hp === 14, 'stopped at the crate');
    // goats climb: a 2-level step is fine, 3 is a wall
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], terrain: function (tl) { if (tl.y === 4 && tl.x >= 2) tl.h = 2; } });
    b = B();
    sl = give(b, 'bet_ram', 1);
    const g0 = at(4, 4);
    use(t, b, sl, 4, 4, 'ram uphill (2 levels)');
    t.ok(pos(b) === '3,4' && g0.hp === 14 - 6, 'charged up 2 levels (hop) and hit (same height: no high-ground bonus)');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], terrain: function (tl) { if (tl.y === 4 && tl.x >= 2) tl.h = 3; } });
    b = B();
    sl = give(b, 'bet_ram', 1);
    t.ok(!valid(b, sl, 4, 4) && why(b, sl, 4, 4) === 'Something is in the way.', 'a 3-level cliff stops the charge before it starts');

    // pushes into a pit (YEET), lava, water, deep water, a wall and the map edge
    function rammed(cfgT, objs, hpMult) {
      fight({ heroes: [{ x: 2, y: 4, hp: 20 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: hpMult || 1 }], terrain: cfgT, objects: objs || [] });
      const bb = B(), s2 = give(bb, 'bet_ram', 1);
      const gg = at(3, 4);
      const gains = hypeGains(function () { use(t, bb, s2, 3, 4, 'ram'); });
      return { b: bb, g: gg, gains: gains };
    }
    let r = rammed(function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; });
    t.ok(r.g.dead && dead('test_grunt') === 1, 'pit: YEET');
    t.eq(sumOf(r.gains, /environmental/), HY('envKill'), 'pit: environmental kill Hype');
    t.eq(r.b.hp, 24, 'pit: Betty eats its lunch (+4)');
    r = rammed(function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'lava'; }, null, 2);
    t.ok(pos(r.g) === '5,4' && r.g.hp === 28 - 6 - 8 && has(r.g, 'burn'), 'lava: 8 fire + Burn');
    r = rammed(function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'water'; });
    t.ok(pos(r.g) === '5,4' && has(r.g, 'wet') && r.g.hp === 8, 'water: Wet');
    r = rammed(function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'deep_water'; });
    t.ok(r.g.dead, 'deep water: it sinks');
    r = rammed(function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'wall'; });
    t.ok(pos(r.g) === '4,4' && r.g.hp === 14 - 6 - 3, 'wall: stops after 1 tile, 3 bump damage');
    fight({ heroes: [{ x: 6, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    b = B();
    sl = give(b, 'bet_ram', 1);
    use(t, b, sl, 7, 4, 'ram at the map edge');
    t.ok(pos(at(8, 4)) === '8,4' && at(8, 4).hp === 14 - 6 - 3, 'map edge: pushed 1, then BONK (3)');
    // a foe pushed into another foe: both bump
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
    b = B();
    sl = give(b, 'bet_ram', 1);
    const g1 = at(3, 4), g2 = at(4, 4);
    use(t, b, sl, 3, 4, 'ram into a crowd');
    t.ok(g1.hp === 14 - 6 - 3 && g2.hp === 14 - 3 && pos(g1) === '3,4', 'crowd: both take 3 from the crash');
    // the rammed foe dies from the hit: no push, no error
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    b = B();
    sl = give(b, 'bet_ram', 1);
    at(3, 4).hp = 4;
    use(t, b, sl, 3, 4, 'ram a nearly dead goblin');
    t.ok(dead('test_grunt') === 1 && pos(b) === '2,4', 'dead on impact, Betty stays next to where it stood');
    // AI hint: a bonus only when the push line really ends in a pit / hazard (not for a pit beside the foe)
    function ramHint(pitX, pitY) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], terrain: function (tl) { if (tl.x === pitX && tl.y === pitY) tl.t = 'pit'; } });
      const bb = B(), s2 = give(bb, 'bet_ram', 1);
      return DD.getSkill('bet_ram').aiScore(DD.Targeting.buildCtx(bb, s2, { x: 3, y: 4 }));
    }
    t.ok(ramHint(5, 4) > 0 && ramHint(4, 4) > 0, 'aiScore: a pit 1 or 2 tiles down the push line');
    t.ok(ramHint(3, 5) === 0 && ramHint(6, 4) === 0, 'aiScore: nothing for a pit beside the foe or past the push');
    // rooted / not enough AP
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    b = B();
    sl = give(b, 'bet_ram', 1);
    A().addStatus(b, 'root', { turns: 1 }, null);
    t.eq(DD.Combat.canUse(b, sl), 'Rooted: no running start.', 'rooted: no charge');
    A().removeStatus(b, 'root', { silent: true });
    b.ap = 1;
    t.eq(DD.Combat.canUse(b, sl), 'Not enough AP.', '1 AP: not enough for a 2-AP charge');
  });

  // ---- 4. Butt Out + Kick 'Em ---------------------------------------------------------------------------------
  T.suite('hero_betty: Butt Out and Kick \'Em While They\'re Down at every level', function (t) {
    [{ dmg: 6, cd: 3 }, { dmg: 7, cd: 3 }, { dmg: 9, cd: 2 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], enemyAi: true });
      const b = B(), sl = give(b, 'bet_headbutt', lv), g = at(3, 4);
      t.eq(DD.skillDesc(DD.getSkill('bet_headbutt'), lv, null), 'Deal ' + L.dmg + ' damage to an adjacent foe and Stun it (it skips its next turn).', 'L' + lv + ': desc');
      use(t, b, sl, 3, 4, 'L' + lv + ' Butt Out');
      t.ok(g.hp === 14 - L.dmg && has(g, 'stun'), 'L' + lv + ': ' + L.dmg + ' damage + Stun');
      t.eq(sl.cd, L.cd, 'L' + lv + ': cooldown ' + L.cd);
      // the stun costs it exactly its next turn
      let acted = false;
      A().addRule({ id: 'bet_probe', name: 'probe', hooks: { onSkillUsed: function (ctx) { if (ctx.user === g) acted = true; } } });
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === b && S().round === 2, 'L' + lv + ': round 2, Betty again');
      t.ok(!acted && b.hp === b.maxHp, 'L' + lv + ': the stunned goblin skipped its turn');
      t.ok(!has(g, 'stun'), 'L' + lv + ': the stun ended with that turn');
      DD.Combat.endTurn();
      t.ok(acted && b.hp === b.maxHp - 4, 'L' + lv + ': next round it stabs again');
      A().removeRule('bet_probe');
    });
    // a Stun interrupts a boss wind-up
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_boss', x: 3, y: 4 }] });
    let b = B();
    let sl = give(b, 'bet_headbutt', 1);
    const boss = at(3, 4);
    const w = DD.AI.windUp(boss, 'test_boss_meteor', { x: 2, y: 4 }, { label: 'Meteor' });
    t.ok(!!w && boss.intents.length === 1, 'the boss winds up a meteor');
    use(t, b, sl, 3, 4, 'Butt Out the boss');
    t.ok(has(boss, 'stun') && boss.intents.length === 0, 'BONK: the wind-up is interrupted');

    // Kick 'Em While They're Down at every level
    [{ dmg: 5, down: 10 }, { dmg: 6, down: 12 }, { dmg: 7, down: 14 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 3, y: 4, hpMult: 3 },
        { id: 'test_grunt', x: 4, y: 3, hpMult: 3 }, { id: 'test_grunt', x: 4, y: 5, hpMult: 3 }] });
      b = B();
      sl = give(b, 'bet_kick', lv);
      t.eq(DD.skillDesc(DD.getSkill('bet_kick'), lv, null), 'Deal ' + L.dmg + ' damage to an adjacent foe, or ' + L.down +
        ' if it is Stunned or Rooted (asleep, frozen and held count too).', 'L' + lv + ': desc');
      const plain = at(5, 4), stunned = at(3, 4), rooted = at(4, 3), asleep = at(4, 5);
      A().addStatus(stunned, 'stun', { turns: 1 }, b);
      A().addStatus(rooted, 'root', { turns: 1 }, b);
      A().addStatus(asleep, 'sleep', { turns: 2 }, b);
      [[plain, L.dmg, 'standing'], [stunned, L.down, 'Stunned'], [rooted, L.down, 'Rooted'], [asleep, L.down, 'asleep']].forEach(function (c) {
        sl.cd = 0; b.ap = 3;
        const hp0 = c[0].hp;
        use(t, b, sl, c[0].x, c[0].y, 'L' + lv + ' kick (' + c[2] + ')');
        t.eq(hp0 - c[0].hp, c[1], 'L' + lv + ': ' + c[2] + ' foe takes ' + c[1]);
      });
      t.ok(!has(asleep, 'sleep'), 'L' + lv + ': the kick woke it up');
      t.eq(sl.cd, 1, 'L' + lv + ': cooldown 1');
    });
    // frozen counts (and frozen takes +50% physical on top)
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }] });
    b = B();
    sl = give(b, 'bet_kick', 1);
    A().addStatus(at(5, 4), 'frozen', { turns: 1 }, b);
    use(t, b, sl, 5, 4, 'kick a frozen goblin');
    t.eq(at(5, 4).hp, 42 - 15, 'frozen: 10 × 1.5 = 15');
  });

  // ---- 5. Head Over Heels -----------------------------------------------------------------------------------------
  T.suite('hero_betty: Head Over Heels at every level (landing, pits, lava, water, blocked, durations)', function (t) {
    [{ turns: 1 }, { turns: 2 }, { turns: 2, dmg: 5 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
      const b = B(), sl = give(b, 'bet_horn_toss', lv), g = at(4, 4);
      t.eq(DD.skillDesc(DD.getSkill('bet_horn_toss'), lv, null), 'Flip an adjacent foe over Betty onto the tile behind him.' +
        (L.dmg ? ' It takes ' + L.dmg + ' damage and is' : ' It is') + ' Vulnerable (+25% damage taken) for ' + L.turns + ' turn' + (L.turns > 1 ? 's' : '') + '.', 'L' + lv + ': desc');
      const area = DD.Targeting.buildCtx(b, sl, { x: 4, y: 4 }).tiles.map(function (p) { return p.x + ',' + p.y; }).join(' ');
      t.eq(area, '4,4 2,4', 'L' + lv + ': the HUD area shows the foe and where it lands');
      use(t, b, sl, 4, 4, 'L' + lv + ' toss');
      t.eq(pos(g), '2,4', 'L' + lv + ': flipped over Betty');
      t.eq(pos(b), '3,4', 'L' + lv + ': Betty stays put');
      t.eq(g.hp, 14 - (L.dmg || 0), 'L' + lv + ': ' + (L.dmg || 0) + ' damage');
      t.ok(has(g, 'vulnerable') && st(g, 'vulnerable').turns === L.turns, 'L' + lv + ': Vulnerable for ' + L.turns);
      t.eq(b.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(sl.cd, 2, 'L' + lv + ': cooldown 2');
      // Vulnerable counts the goblin's own turns
      DD.Combat.endTurn();
      t.eq(has(g, 'vulnerable'), L.turns > 1, 'L' + lv + ': after its first turn' + (L.turns > 1 ? ', still Vulnerable' : ', gone'));
      DD.Combat.endTurn();
      t.ok(!has(g, 'vulnerable'), 'L' + lv + ': gone after ' + L.turns + ' of its turns');
    });
    // Vulnerable: the party hits it 25% harder
    fight({ heroes: [{ x: 3, y: 4 }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }] });
    let b = B(), sl = give(b, 'bet_horn_toss', 1);
    const gv = at(4, 4);
    use(t, b, sl, 4, 4, 'toss next to the knight');
    DD.Combat.endTurn();
    const k = hero('test_knight');
    t.ok(DD.Combat.current() === k && DD.Grid.dist(k, gv) === 1, 'the knight\'s turn, the goblin landed next to him');
    t.ok(DD.Combat.useSkill(k, k.basic, gv.x, gv.y), 'knight slashes');
    t.eq(gv.hp, 28 - Math.round(5 * 1.25), 'Vulnerable: 5 → 6 from the knight');
    // landings: pit (YEET), lava, water, deep water
    function toss(terrain, hpMult, enemyId) {
      fight({ heroes: [{ x: 3, y: 4, hp: 20 }], enemies: [{ id: enemyId || 'test_grunt', x: 4, y: 4, hpMult: hpMult || 1 }], terrain: terrain });
      const bb = B(), s2 = give(bb, 'bet_horn_toss', 1), gg = at(4, 4);
      const gains = hypeGains(function () { use(t, bb, s2, 4, 4, 'toss'); });
      return { b: bb, g: gg, gains: gains };
    }
    let r = toss(function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'pit'; });
    t.ok(r.g.dead, 'pit behind Betty: YEET');
    t.ok(sumOf(r.gains, /environmental/) === HY('envKill') && r.b.hp === 24, 'pit: environmental kill Hype, and Betty eats its lunch');
    t.ok(!has(r.g, 'vulnerable'), 'a dead goblin gets no status');
    r = toss(function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'lava'; }, 2);
    t.ok(pos(r.g) === '2,4' && r.g.hp === 28 - 8 && has(r.g, 'burn') && has(r.g, 'vulnerable'), 'lava: 8 fire + Burn, then Vulnerable');
    r = toss(function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'lava'; });
    t.ok(r.g.dead || r.g.hp === 6, 'lava on a plain goblin');
    r = toss(function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'water'; });
    t.ok(has(r.g, 'wet') && has(r.g, 'vulnerable'), 'water: Wet + Vulnerable');
    r = toss(function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'deep_water'; });
    t.ok(r.g.dead, 'deep water: it sinks');
    // a boss climbs out of the pit (25% max HP) and is Vulnerable
    r = toss(function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'pit'; }, 1, 'test_boss');
    t.ok(!r.g.dead && r.g.hp === 120 - 30 && has(r.g, 'vulnerable'), 'boss: falls, climbs out (−30), Vulnerable');
    // no room behind him: an ally, a wall, a crate, the map edge; immovable foes
    fight({ heroes: [{ x: 3, y: 4 }, { id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_brute', x: 3, y: 5 }],
      objects: [{ x: 3, y: 3, id: 'crate' }] });
    b = B();
    sl = give(b, 'bet_horn_toss', 1);
    t.ok(!valid(b, sl, 4, 4), 'ally behind Betty: no toss');
    t.eq(why(b, sl, 4, 4), 'No room behind Betty to land it.', 'reason: no room');
    t.ok(!valid(b, sl, 3, 5) && why(b, sl, 3, 5) === 'Too heavy to flip. Betty checked.', 'immovable brute: too heavy');
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'wall'; } });
    b = B();
    sl = give(b, 'bet_horn_toss', 1);
    t.ok(!valid(b, sl, 4, 4), 'wall behind: no toss');
    fight({ heroes: [{ x: 0, y: 4 }], enemies: [{ id: 'test_grunt', x: 1, y: 4 }] });
    b = B();
    sl = give(b, 'bet_horn_toss', 1);
    t.ok(!valid(b, sl, 1, 4), 'map edge behind: no toss');
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], objects: [{ x: 2, y: 4, id: 'barrel' }] });
    b = B();
    sl = give(b, 'bet_horn_toss', 1);
    t.ok(!valid(b, sl, 4, 4), 'a barrel behind: no toss');
    // every direction works (N/S/E/W)
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }] });
    b = B();
    sl = give(b, 'bet_horn_toss', 1);
    const gn = at(4, 3);
    use(t, b, sl, 4, 3, 'toss from the north');
    t.eq(pos(gn), '4,5', 'north → lands south of Betty');
  });

  // ---- 6. Bleat, Stomp, Goat Yoga ------------------------------------------------------------------------------
  T.suite('hero_betty: Bleat of Defiance, Stomping Grounds and Goat Yoga at every level', function (t) {
    [{ r: 2, cd: 2 }, { r: 3, cd: 2 }, { r: 3, cd: 1 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 4, y: 7 }, { id: 'test_archer', x: 8, y: 8 }] });
      const b = B(), sl = give(b, 'bet_bleat', lv);
      t.eq(DD.skillDesc(DD.getSkill('bet_bleat'), lv, null), 'BAAAH! Every foe within ' + L.r + ' tiles is Taunted: on its next turn it must attack Betty.', 'L' + lv + ': desc');
      use(t, b, sl, 4, 4, 'L' + lv + ' bleat');
      const near = at(6, 4), mid = at(4, 7), far = at(8, 8);
      t.ok(has(near, 'taunt') && st(near, 'taunt').source === b.id, 'L' + lv + ': the goblin 2 tiles away is Taunted by Betty');
      t.eq(has(mid, 'taunt'), L.r >= 3, 'L' + lv + ': the goblin 3 tiles away ' + (L.r >= 3 ? 'too' : 'is out of range'));
      t.ok(!has(far, 'taunt'), 'L' + lv + ': the archer 8 tiles away is not');
      t.eq(sl.cd, L.cd, 'L' + lv + ': cooldown ' + L.cd);
      t.eq(b.ap, 2, 'L' + lv + ': 1 AP');
    });
    // a Taunted goblin must attack Betty on its next turn (it would rather finish the wounded knight)
    fight({ heroes: [{ x: 3, y: 4 }, { id: 'test_knight', x: 5, y: 4, hp: 3 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], enemyAi: true });
    let b = B();
    const k = hero('test_knight');
    let sl = give(b, 'bet_bleat', 1);
    use(t, b, sl, 3, 4, 'bleat');
    DD.Combat.endTurn();           // → the knight
    DD.Combat.endTurn();           // → the goblin acts, → round 2
    t.ok(b.hp === b.maxHp - 4 && k.hp === 3 && !k.downed, 'Taunted: it stabbed Betty, not the knight on 3 HP');
    t.ok(!has(at(4, 4), 'taunt'), 'the Taunt ended with its turn');
    DD.Combat.endTurn();
    DD.Combat.endTurn();
    t.ok(k.downed || k.hp < 3, 'next round it goes for the wounded knight again');

    // Stomping Grounds at every level
    [4, 5, 6].forEach(function (dmg, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 4, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 3 }, { id: 'test_grunt', x: 5, y: 5 }, { id: 'test_grunt', x: 6, y: 4 }] });
      b = B();
      sl = give(b, 'bet_stomp', lv);
      t.eq(DD.skillDesc(DD.getSkill('bet_stomp'), lv, null), 'Deal ' + dmg + ' damage to every foe on the 8 tiles around Betty and Slow them (−2 move on their next turn).', 'L' + lv + ': desc');
      const e1 = at(5, 4), diag = at(3, 3), diag2 = at(5, 5), far = at(6, 4);
      const gains = hypeGains(function () { use(t, b, sl, 4, 4, 'L' + lv + ' stomp'); });
      t.ok(e1.hp === 14 - dmg && diag.hp === 14 - dmg && diag2.hp === 14 - dmg, 'L' + lv + ': ' + dmg + ' to the adjacent and diagonal foes');
      t.ok(has(e1, 'slow') && has(diag, 'slow') && st(e1, 'slow').turns === 1, 'L' + lv + ': Slowed for 1 turn');
      t.ok(far.hp === 14 && !has(far, 'slow'), 'L' + lv + ': 2 tiles away: untouched');
      t.ok(hero('test_knight').hp === hero('test_knight').maxHp && !has(hero('test_knight'), 'slow'), 'L' + lv + ': the ally next to him is fine');
      t.eq(sumOf(gains, /multi-hit/), HY('multiHit'), 'L' + lv + ': hit 3 foes: multi-hit Hype');
      t.eq(DD.Combat.effectiveMov(e1), 1, 'L' + lv + ': move 3 → 1');
      t.ok(sl.cd === 2 && b.ap === 1, 'L' + lv + ': 2 AP, cooldown 2');
      DD.Combat.endRound();
      t.ok(!has(e1, 'slow') && DD.Combat.effectiveMov(e1) === 3, 'L' + lv + ': the Slow is gone after its turn');
    });

    // Goat Yoga at every level: self or an adjacent ally; the Block lasts until the start of its owner's next turn
    [6, 8, 10].forEach(function (block, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 5, y: 4 }, { id: 'test_cleric', x: 7, y: 4 }], enemies: [{ id: 'test_grunt', x: 1, y: 1 }] });
      b = B();
      sl = give(b, 'bet_goat_yoga', lv);
      t.eq(DD.skillDesc(DD.getSkill('bet_goat_yoga'), lv, null), 'Betty or an adjacent ally gains ' + block + ' Block (until the start of its next turn).', 'L' + lv + ': desc');
      t.ok(valid(b, sl, 4, 4) && valid(b, sl, 5, 4) && !valid(b, sl, 7, 4) && !valid(b, sl, 1, 1), 'L' + lv + ': Betty or an adjacent ally');
      use(t, b, sl, 5, 4, 'L' + lv + ' yoga on the knight');
      t.eq(hero('test_knight').block, block, 'L' + lv + ': knight +' + block + ' Block');
      sl.cd = 0;
      use(t, b, sl, 4, 4, 'L' + lv + ' yoga on himself');
      t.eq(b.block, block, 'L' + lv + ': Betty +' + block + ' Block');
    });
    // Block timing: through the enemy's turn, gone at Betty's next turn start
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }], enemyAi: true });
    b = B();
    sl = give(b, 'bet_goat_yoga', 1);
    use(t, b, sl, 4, 4, 'yoga');
    let during = -1;
    const off = DD.Events.on('turn:start', function (e) { if (e.unit && e.unit.side === 'enemy') during = b.block; });
    DD.Combat.endTurn();
    off();
    t.eq(during, 6, 'Block held through the goblin\'s turn start');
    t.ok(b.hp === b.maxHp, 'the stab hit the Block (6 → 2)');
    t.eq(b.block, 0, 'gone at the start of Betty\'s next turn');
  });

  // ---- 7. Five-Second Rule + Mountain Goat ------------------------------------------------------------------------
  T.suite('hero_betty: Five-Second Rule and Mountain Goat at every level', function (t) {
    [{ heal: 6 }, { heal: 8 }, { heal: 8, cleanse: 1 }].forEach(function (L, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 4, y: 4, hp: 10 }], enemies: [{ id: 'test_grunt', x: 1, y: 1 }] });
      const b = B(), sl = give(b, 'bet_snack', lv);
      A().addStatus(b, 'poison', { stacks: 3 }, at(1, 1));
      A().addStatus(b, 'weak', { turns: 2 }, at(1, 1));
      t.eq(DD.skillDesc(DD.getSkill('bet_snack'), lv, null), 'Betty eats something off the floor: heal ' + L.heal + ' HP' +
        (L.cleanse ? ' and remove one debuff (he eats that too)' : '') + '.', 'L' + lv + ': desc');
      use(t, b, sl, 4, 4, 'L' + lv + ' snack');
      t.eq(b.hp, 10 + L.heal, 'L' + lv + ': +' + L.heal + ' HP');
      const left = b.statuses.filter(function (s) { return DD.getStatus(s.id).type === 'debuff'; }).length;
      t.eq(left, L.cleanse ? 1 : 2, 'L' + lv + ': ' + (L.cleanse ? 'one debuff eaten' : 'debuffs stay'));
      t.ok(sl.cd === 3 && b.ap === 2, 'L' + lv + ': 1 AP, cooldown 3');
    });
    [3, 4, 5].forEach(function (leap, i) {
      const lv = i + 1;
      fight({ w: 11, h: 9, heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 1 + leap + 1, y: 4 }],
        terrain: function (tl) { if (tl.x === 2 && tl.y >= 3 && tl.y <= 5) tl.t = 'wall'; if (tl.x === 1 + leap && tl.y === 4) tl.h = 4; },
        objects: [{ x: 1, y: 3, id: 'crate' }] });
      const b = B(), sl = give(b, 'bet_mountain_goat', lv);
      t.eq(DD.skillDesc(DD.getSkill('bet_mountain_goat'), lv, null), 'Leap to an empty tile up to ' + leap + ' tiles away, whatever its height and whatever is in between.', 'L' + lv + ': desc');
      t.ok(valid(b, sl, 1 + leap, 4) && !valid(b, sl, 2 + leap, 4), 'L' + lv + ': range ' + leap + ' (over a wall, onto a 4-level pillar)');
      t.ok(!valid(b, sl, 1, 3) && !valid(b, sl, 2, 4), 'L' + lv + ': not onto a crate or a wall');
      use(t, b, sl, 1 + leap, 4, 'L' + lv + ' leap');
      t.eq(pos(b), (1 + leap) + ',4', 'L' + lv + ': landed on top');
      t.ok(b.ap === 2 && sl.cd === 2, 'L' + lv + ': 1 AP, cooldown 2');
      // the payoff: high ground (+25%)
      const g = at(2 + leap, 4);
      use(t, b, b.basic, g.x, g.y, 'L' + lv + ' hammer from 4 levels up');
      t.eq(g.hp, 14 - Math.round(5 * 1.25), 'L' + lv + ': high ground: 5 → 6');
    });
    fight({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 4, y: 6 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }], terrain: function (tl) { if (tl.x === 4 && tl.y === 2) tl.t = 'pit'; } });
    const b = B(), sl = give(b, 'bet_mountain_goat', 1);
    t.ok(!valid(b, sl, 4, 6) && !valid(b, sl, 6, 4) && !valid(b, sl, 4, 2), 'not onto an ally, a foe or a pit');
    A().addStatus(b, 'root', { turns: 1 }, null);
    t.eq(DD.Combat.canUse(b, sl), 'Rooted: even goats need their legs.', 'rooted: no leap');
  });

  // ---- 8. G.O.A.T. -------------------------------------------------------------------------------------------------
  T.suite('hero_betty: G.O.A.T. (signature: trample a line, Stun everyone in it)', function (t) {
    fight({ w: 10, heroes: [{ x: 1, y: 4, hp: 10 }, { id: 'test_knight', x: 3, y: 4 }],
      enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 9, y: 4 }] });
    let b = B();
    let sl = b.signature;
    S().hype = 99;
    t.eq(DD.Combat.canUse(b, sl), 'Needs 100 Hype.', '100 Hype needed');
    S().hype = 100;
    t.ok(valid(b, sl, 7, 4) && !valid(b, sl, 8, 4) && !valid(b, sl, 7, 5), 'straight line, range 6');
    t.eq(DD.skillDesc(DD.getSkill('bet_goat'), 1, null), 'Charge up to 6 tiles in a straight line, right through every foe in the way: each takes 15 damage and is Stunned.', 'desc');
    const a1 = at(2, 4), a2 = at(5, 4), a3 = at(6, 4), out = at(9, 4), k = hero('test_knight');
    const gains = hypeGains(function () { use(t, b, sl, 7, 4, 'G.O.A.T.'); });
    t.ok(a1.hp === 28 - 15 && a2.hp === 28 - 15 && has(a1, 'stun') && has(a2, 'stun'), 'two tough goblins: 15 each + Stunned');
    t.ok(a3.dead, 'the plain goblin is flattened');
    t.ok(out.hp === 14 && !has(out, 'stun'), 'the goblin past the 6 tiles is fine');
    t.ok(k.hp === k.maxHp && pos(k) === '3,4', 'the knight in the way is stepped over, unharmed');
    t.eq(pos(b), '7,4', 'Betty ends on the furthest free tile');
    t.eq(b.hp, 14, 'one kill: Eats Anything +4');
    t.ok(sumOf(gains, /spent/) === -100 && sumOf(gains, /multi-hit/) === HY('multiHit') && sumOf(gains, /^kill$/) === HY('kill'), 'paid 100 Hype, multi-hit + kill Hype');
    t.eq(b.ap, 1, '2 AP');
    // the Stuns cost them exactly their next turn
    DD.Combat.endTurn();
    DD.Combat.endTurn();
    t.ok(!has(a1, 'stun') && !has(a2, 'stun'), 'Stuns gone after their turns');
    // a wall stops the charge; occupied tiles at the end: he stops short; nothing free: he stays
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 6, y: 4 }],
      terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'wall'; } });
    b = B();
    S().hype = 100;
    use(t, b, b.signature, 7, 4, 'G.O.A.T. into a wall');
    t.ok(pos(b) === '4,4' && at(3, 4).hp === 13 && at(6, 4).hp === 14, 'the wall stopped him at 4,4; nobody behind it was hit');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 4, y: 4, hpMult: 3 }] });
    b = B();
    S().hype = 100;
    use(t, b, b.signature, 4, 4, 'G.O.A.T. into a wall of goblins');
    t.ok(pos(b) === '2,4' && at(3, 4).hp === 42 - 15 && at(4, 4).hp === 42 - 15, 'both trampled, Betty stops on the last free tile (2,4)');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 3 }] });
    b = B();
    S().hype = 100;
    use(t, b, b.signature, 2, 4, 'G.O.A.T. at point blank');
    t.ok(pos(b) === '1,4' && at(2, 4).hp === 27 && has(at(2, 4), 'stun'), 'no free tile: he stays, the goblin is trampled anyway');
    // nobody in the way: just a very dramatic sprint; rooted: no
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    b = B();
    S().hype = 100;
    use(t, b, b.signature, 5, 4, 'G.O.A.T. at nothing');
    t.eq(pos(b), '5,4', 'sprinted 4 tiles');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    b = B();
    S().hype = 100;
    A().addStatus(b, 'root', { turns: 1 }, null);
    t.eq(DD.Combat.canUse(b, b.signature), 'Rooted: even the G.O.A.T. needs legs.', 'rooted');
    // a boss in the line: trampled + Stunned (its wind-up interrupted)
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_boss', x: 3, y: 4 }] });
    b = B();
    S().hype = 100;
    const boss = at(3, 4);
    DD.AI.windUp(boss, 'test_boss_meteor', { x: 1, y: 4 }, { label: 'Meteor' });
    use(t, b, b.signature, 5, 4, 'G.O.A.T. through the boss');
    t.ok(boss.hp === 120 - 14 && has(boss, 'stun') && boss.intents.length === 0 && pos(b) === '5,4', 'boss: 15 (−1 armor), Stunned, wind-up interrupted, Betty behind it');
  });

  // ---- 9. items ------------------------------------------------------------------------------------------------
  T.suite('hero_betty: items (mallet, breastplate, cowbell)', function (t) {
    // Great-Grandma Betty's Mallet: +10% damage, pushes +1
    fight({ heroes: [{ x: 2, y: 4, items: ['bet_grandmas_mallet'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 2, y: 3 }] });
    let b = B();
    t.ok(b.items.indexOf('bet_grandmas_mallet') >= 0 && DD.Betty.hasItem(b, 'bet_grandmas_mallet'), 'equipped');
    const sl = give(b, 'bet_ram', 1);
    t.ok(/pushed 3 tiles\.$/.test(DD.skillDesc(DD.getSkill('bet_ram'), 1, b)), 'Ram desc shows the extra tile: ' + DD.skillDesc(DD.getSkill('bet_ram'), 1, b));
    use(t, b, sl, 3, 4, 'ram with the mallet');
    t.ok(pos(at(6, 4)) === '6,4' && at(6, 4).hp === 28 - Math.round(6 * 1.1), 'pushed 3, 6 × 1.1 = 7 damage');
    use(t, b, b.basic, 2, 3, 'hammer with the mallet');
    t.eq(at(2, 3).hp, 14 - Math.round(5 * 1.1), 'basic 5 × 1.1 = 6 (rounded)');
    // Breastplate That Says BETTY: +6 HP, +1 armor
    fight({ heroes: [{ x: 2, y: 4, items: ['bet_name_plate'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], enemyAi: true });
    b = B();
    t.ok(b.maxHp === 38 && b.armor === 1 && b.block === 0, '38 max HP, 1 armor, no starting Block');
    DD.Combat.endTurn();
    t.eq(b.hp, 38 - 3, 'a 4-damage stab hurts 3');
    // Championship Cowbell: once per turn a kill gives 1 AP
    fight({ heroes: [{ x: 4, y: 4, items: ['bet_cowbell'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }] });
    b = B();
    foes().forEach(function (f) { f.hp = 3; });
    use(t, b, b.basic, 5, 4, 'first kill');
    t.eq(b.ap, 3, '3 − 1 + 1: DING');
    use(t, b, b.basic, 3, 4, 'second kill');
    t.eq(b.ap, 2, 'second kill this turn: no extra AP');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === b && b.ap === 3, 'next turn: 3 AP');
    use(t, b, b.basic, 4, 3, 'kill next turn');
    t.eq(b.ap, 3, 'a new turn: DING again');
    t.ok(/outside his turn: \+1 AP on his next turn/.test(DD.getItem('bet_cowbell').desc), 'desc says what a kill outside his turn gives');
    // a kill on an ally's turn (another hero's skill makes him swing, e.g. Buga's Delegate) also waits for his next turn
    fight({ heroes: [{ id: 'test_knight', x: 2, y: 6 }, { x: 4, y: 4, items: ['bet_cowbell'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    b = B();
    t.ok(DD.Combat.current() === hero('test_knight'), 'the knight\'s turn');
    at(5, 4).hp = 3;
    DD.Combat._action(function () { DD.Combat.resolveSkill(b, b.basic, { x: 5, y: 4 }, { pay: false }); });
    t.ok(dead('test_grunt') === 1 && b.apBank === 1, 'a delegated swing kills on the knight\'s turn: DING, +1 AP banked');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === b && b.ap === 4, 'his turn: 4 AP');
    // a kill on a foe's turn (his attack of opportunity on a runner) rings too: the AP waits for his next turn
    withTemp([runner('bet_test_runner')], function () {
      fight({ heroes: [{ x: 3, y: 4, items: ['bet_cowbell'] }], enemies: [{ id: 'bet_test_runner', x: 4, y: 4 }], enemyAi: true });
      b = B();
      at(4, 4).hp = 4;
      DD.Combat.endTurn();
      t.ok(dead('bet_test_runner') === 1, 'it ran on its turn and his attack of opportunity killed it');
      t.ok(DD.Combat.current() === b && S().round === 2 && b.ap === 4, 'DING on its turn: 4 AP on his next turn');
    });
  });

  // ---- 10. previews ------------------------------------------------------------------------------------------
  T.suite('hero_betty: HUD previews match reality (every skill, every level)', function (t) {
    function arena(extra) {
      return fight(Object.assign({ w: 10, h: 9, heroes: [{ x: 3, y: 4, hp: 20, level: 3 }, { id: 'test_knight', x: 3, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 3, y: 3, hpMult: 2 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_archer', x: 8, y: 4 }],
        terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'pit'; if (tl.x === 9 && tl.y === 4) tl.t = 'lava'; },
        objects: [{ x: 3, y: 5, id: 'barrel' }] }, extra || {}));
    }
    const cases = [
      ['bet_family_hammer', 4, 4], ['bet_family_hammer', 3, 5], ['bet_ram', 4, 4], ['bet_headbutt', 4, 4], ['bet_horn_toss', 4, 4],
      ['bet_bleat', 3, 4], ['bet_stomp', 3, 4], ['bet_goat_yoga', 3, 4], ['bet_snack', 3, 4], ['bet_mountain_goat', 4, 2], ['bet_kick', 3, 3],
      ['bet_pasture', 3, 4], ['bet_goat', 8, 4],
    ];
    cases.forEach(function (c) {
      const def = DD.getSkill(c[0]);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        arena();
        const b = B();
        S().hype = 100;
        const sl = give(b, c[0], lv);
        if (c[0] === 'bet_kick') A().addStatus(at(3, 3), 'root', { turns: 1 }, b);
        if (c[0] === 'bet_snack') A().addStatus(b, 'poison', { stacks: 2 }, at(4, 4));
        previewMatches(t, b, sl, c[1], c[2], c[0] + ' L' + lv);
      }
    });
    // a ram that crashes a goblin into an explosive barrel (env kill + two snacks) and a G.O.A.T. that kills
    fight({ heroes: [{ x: 2, y: 4, hp: 10 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
    let b = B();
    let prev = previewMatches(t, b, give(b, 'bet_ram', 1), 3, 4, 'ram into a barrel');
    t.ok(prev && prev.perUnit[b.id].heal === 8, 'preview: +8 for Betty (barrel + lunch)');
    fight({ heroes: [{ x: 1, y: 4, hp: 10 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
    b = B();
    S().hype = 100;
    prev = previewMatches(t, b, b.signature, 6, 4, 'G.O.A.T. kills two');
    t.ok(prev && prev.perUnit[b.id].moved && prev.perUnit[b.id].heal === 8, 'preview: Betty moves and eats twice');
    // his own way through a hazard (review): a charge over lava, a leap onto it, a trample that ends on it — the preview
    // shows his burns exactly
    function lava(lx, cfg) {
      return fight(Object.assign({ heroes: [{ x: 1, y: 4, hp: 20 }], terrain: function (tl) { if (tl.x === lx && tl.y === 4) tl.t = 'lava'; } }, cfg));
    }
    lava(2, { enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }] });
    b = B();
    prev = previewMatches(t, b, give(b, 'bet_ram', 1), 4, 4, 'ram over lava');
    t.ok(prev && prev.perUnit[b.id] && prev.perUnit[b.id].dmg === 8 && has(b, 'burn') && pos(b) === '3,4', 'ram over lava: he runs through it (8 + Burn), as previewed');
    lava(3, { enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    b = B();
    prev = previewMatches(t, b, give(b, 'bet_mountain_goat', 1), 3, 4, 'leap onto lava');
    t.ok(prev && prev.perUnit[b.id] && prev.perUnit[b.id].dmg === 8 && pos(b) === '3,4', 'leap onto lava: 8, as previewed');
    lava(5, { enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 8, y: 8 }] });
    b = B();
    S().hype = 100;
    prev = previewMatches(t, b, b.signature, 5, 4, 'G.O.A.T. ending on lava');
    t.ok(prev && pos(b) === '5,4' && prev.perUnit[b.id] && prev.perUnit[b.id].dmg === 8, 'G.O.A.T. that ends on lava: 8, as previewed');
  });

  // ---- 11. v2 edge cases ----------------------------------------------------------------------------------------
  T.suite('hero_betty: v2 edge cases (stunned, silenced, sheep, charmed, AP, deaths mid-skill, durations)', function (t) {
    // stunned (by an enemy, during his own turn): he loses his NEXT turn, nothing else
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    let b = B();
    const k = hero('test_knight');
    A().addStatus(b, 'stun', { turns: 1 }, at(7, 7));
    t.ok(DD.Combat.canUse(b, b.basic) === 'Stunned!' || DD.Combat.canUse(b, b.basic) === 'No valid targets.', 'stunned: his skills are refused (or have nothing to hit)');
    DD.Combat.endTurn();          // → knight
    DD.Combat.endTurn();          // → goblin (frozen AI) → round 2: Betty is stunned, his turn passes → knight
    t.ok(DD.Combat.current() === k && S().round === 2, 'round 2: Betty\'s stunned turn passed by itself, the knight acts');
    t.ok(!has(b, 'stun') && b.ap === 0, 'the stun is gone, his AP with it');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === b && b.ap === 3, 'round 3: back to normal');
    // silenced: nothing in his kit is a spell
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    b = B();
    A().addStatus(b, 'silenced', { turns: 1 }, at(3, 4));
    ['bet_ram', 'bet_headbutt', 'bet_bleat', 'bet_stomp', 'bet_snack', 'bet_kick', 'bet_pasture'].forEach(function (id) {
      const sl = give(b, id, 1);
      t.eq(DD.Combat.canUse(b, sl), true, 'silenced: ' + id + ' still works (goats don\'t do spells)');
    });
    // sheep: a goat turned into a sheep does nothing but wander
    A().addStatus(b, 'sheep', { turns: 1 }, at(3, 4));
    t.eq(DD.Combat.canUse(b, b.basic), 'Baa. (Sheep can only move.)', 'sheep: no hammer');
    t.eq(DD.Combat.canUse(b, give(b, 'bet_bleat', 1)), 'Baa. (Sheep can only move.)', 'sheep: not even a bleat (a baa)');
    A().removeStatus(b, 'sheep', { silent: true });
    // charmed by the goblin: −1 AP next turn and he can't hurt it (pushing it is fine)
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    b = B();
    const g = at(3, 4);
    A().addStatus(b, 'charmed', { turns: 1 }, g);
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === b && b.ap === 2, 'charmed: 2 AP on his next turn');
    const ram = give(b, 'bet_ram', 1);
    use(t, b, ram, 3, 4, 'charmed ram');
    t.ok(g.hp === 14 && pos(g) === '5,4', 'charmed: 0 damage to the charmer, the push still happens');
    // not enough AP
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    b = B();
    b.ap = 1;
    ['bet_ram', 'bet_headbutt', 'bet_stomp'].forEach(function (id) { t.eq(DD.Combat.canUse(b, give(b, id, 1)), 'Not enough AP.', '1 AP: ' + id + ' needs 2'); });
    S().hype = 100;
    t.eq(DD.Combat.canUse(b, b.signature), 'Not enough AP.', '1 AP: G.O.A.T. needs 2');
    ['bet_horn_toss', 'bet_bleat', 'bet_goat_yoga', 'bet_snack', 'bet_mountain_goat', 'bet_kick', 'bet_pasture'].forEach(function (id) {
      t.eq(DD.Combat.canUse(b, give(b, id, 1)), true, '1 AP: ' + id + ' is fine');
    });
    t.eq(DD.Combat.canUse(b, b.basic), true, '1 AP: the hammer is fine');
    b.ap = 0;
    t.eq(DD.Combat.canUse(b, give(b, 'bet_pasture', 1)), 'Not enough AP.', '0 AP: not even a stance');
    // not his turn
    fight({ heroes: [{ id: 'test_knight', x: 2, y: 6 }, { x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    b = B();
    t.eq(DD.Combat.canUse(b, b.basic), 'Not Betty\'s turn.', 'the knight\'s turn: Betty waits');
    // targets dying mid-skill: a toss into lava that kills, a stomp that kills, a kick that kills
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 3, y: 3 }, { id: 'test_grunt', x: 3, y: 5 }],
      terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'lava'; } });
    b = B();
    at(4, 4).hp = 5;
    use(t, b, give(b, 'bet_horn_toss', 3), 4, 4, 'toss into lava');
    t.ok(dead('test_grunt') === 1, 'it died in the lava: no Vulnerable, no damage on a corpse, no error');
    at(3, 3).hp = 2; at(3, 5).hp = 2;
    b.ap = 3;
    use(t, b, give(b, 'bet_stomp', 1), 3, 4, 'stomp the survivors');
    t.eq(dead('test_grunt'), 3, 'stomp: both flattened, no Slow on corpses');
    t.ok(DD.Combat.state.units.filter(function (u) { return u.dead && u.statuses.some(function (s) { return s.id === 'slow' || s.id === 'vulnerable'; }); }).length === 0, 'no statuses on the dead');
    // an empty bleat, an empty stomp: fine
    fight({ heroes: [{ x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    b = B();
    use(t, b, give(b, 'bet_bleat', 1), 1, 1, 'bleat at nobody');
    use(t, b, give(b, 'bet_stomp', 1), 1, 1, 'stomp at nobody');
    t.ok(at(8, 8).hp === 14 && !has(at(8, 8), 'taunt'), 'nothing happens to the far goblin');
    // downed: no actions; the knight helps him up and he acts on his own slot
    fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
    b = B();
    A().damage(at(7, 7), b, 99, {});
    t.ok(b.downed && DD.Combat.canUse(b, b.basic) !== true, 'downed: no hammer');
    DD.Combat.endTurn();
    const kn = hero('test_knight');
    t.ok(DD.Combat.current() === kn && DD.Combat.interact(kn, 2, 4) && !b.downed, 'the knight helps Betty up');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === b && b.ap === 3, 'next round Betty acts on his own slot with 3 AP');
  });

  // ---- 12. durations (own turns) --------------------------------------------------------------------------------
  T.suite('hero_betty: statuses last exactly the right own turns (Stun, Slow, Taunt, Vulnerable, Block)', function (t) {
    // enemies act after Betty this time: the debuffs from his turn cover each foe's next turn, then they are gone
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 3, y: 4, hpMult: 3 },
      { id: 'test_grunt', x: 4, y: 3, hpMult: 3 }, { id: 'test_grunt', x: 5, y: 5, hpMult: 3 }] });
    const b = B();
    const e = at(5, 4), w = at(3, 4), n = at(4, 3), s = at(5, 5);
    b.ap = 9;
    use(t, b, give(b, 'bet_headbutt', 1), 5, 4, 'stun east');
    use(t, b, give(b, 'bet_stomp', 1), 4, 4, 'slow everyone');
    use(t, b, give(b, 'bet_bleat', 1), 4, 4, 'taunt everyone');
    use(t, b, give(b, 'bet_horn_toss', 2), 4, 3, 'flip north (Vulnerable 2)');
    t.ok(has(e, 'stun') && has(w, 'slow') && has(s, 'slow') && has(w, 'taunt') && has(s, 'taunt') && has(n, 'vulnerable') && pos(n) === '4,5', 'setup: Stun, Slow, Taunt, Vulnerable');
    const seen = {};
    const off = DD.Events.on('turn:end', function (ev) {
      if (!ev.unit || ev.unit.side !== 'enemy') return;
      seen[ev.unit.id] = (seen[ev.unit.id] || 0) + 1;
    });
    DD.Combat.endTurn();
    t.ok(!has(e, 'stun') && !has(w, 'slow') && !has(w, 'taunt') && !has(e, 'slow') && !has(s, 'taunt'), 'after each foe\'s one turn: Stun, Slow, Taunt gone');
    t.ok(seen[e.id] === 1 && seen[w.id] === 1, 'each foe had exactly one turn');
    t.ok(has(n, 'vulnerable') && st(n, 'vulnerable').turns === 1, 'Vulnerable 2: one turn left');
    DD.Combat.endTurn();
    off();
    t.ok(!has(n, 'vulnerable'), 'Vulnerable 2: gone after its second turn');
    // rolled initiative with enemies first: a Stun from Betty's turn still costs the goblin the turn right after
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }], initiative: 'enemiesFirst', enemyAi: true });
    const b2 = B();
    t.ok(DD.Combat.current() === b2 && S().round === 1 && b2.hp === b2.maxHp - 4, 'enemies first: the goblin already stabbed (round 1)');
    use(t, b2, give(b2, 'bet_headbutt', 1), 5, 4, 'stun it');
    DD.Combat.endTurn();
    t.ok(S().round === 2 && DD.Combat.current() === b2 && b2.hp === b2.maxHp - 4, 'round 2: its turn (before Betty) was skipped');
    t.ok(!has(at(5, 4), 'stun'), 'and the stun went with it');
  });

  // ---- 12b. combos with other heroes (fixture party) ----------------------------------------------------------------
  T.suite('hero_betty: combos (sleep → Kick \'Em, a ram into water → lightning Stun, a toss → Vulnerable)', function (t) {
    // the cleric's Boring Sermon (Asleep) sets up Kick 'Em While They're Down
    fight({ heroes: [{ id: 'test_cleric', x: 2, y: 2 }, { x: 4, y: 3 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 5, y: 4, hpMult: 2 }] });
    const c = hero('test_cleric');
    let b = B();
    const sermon = A().makeSlot('test_sleep_hymn', 1);
    c.skills = [sermon];
    t.ok(DD.Combat.current() === c && DD.Combat.useSkill(c, sermon, 4, 4), 'the cleric preaches at the goblins');
    const g = at(4, 4);
    t.ok(has(g, 'sleep') && has(at(5, 4), 'sleep') && !has(b, 'sleep'), 'both goblins asleep, Betty awake (foes only)');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === b, 'Betty\'s turn');
    use(t, b, give(b, 'bet_kick', 1), 4, 4, 'kick the sleeper');
    t.ok(g.hp === 28 - 10 && !has(g, 'sleep'), '10, not 5 (and it woke up)');

    // a ram into water (Wet) → the mage's Chain Zap: +50% lightning, the puddle shocks it (Stunned) → it loses its turn
    function zapped(water) {
      fight({ heroes: [{ x: 2, y: 4 }, { id: 'test_mage', x: 3, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 3 }], enemyAi: true,
        terrain: function (tl) { if (water && tl.x === 5 && tl.y === 4) tl.t = 'water'; } });
      const bb = B(), m = hero('test_mage'), gg = at(3, 4);
      use(t, bb, give(bb, 'bet_ram', 1), 3, 4, 'ram' + (water ? ' into the puddle' : ''));
      DD.Combat.endTurn();
      const zap = A().makeSlot('test_chain_zap', 1);
      m.skills = [zap];
      const hp0 = gg.hp;
      t.ok(DD.Combat.current() === m && pos(gg) === '5,4' && DD.Combat.useSkill(m, zap, 5, 4), 'the mage zaps it at 5,4');
      return { g: gg, lost: hp0 - gg.hp, b: bb };
    }
    const dry = zapped(false), wet = zapped(true);
    t.ok(!has(dry.g, 'wet') && !has(dry.g, 'stun'), 'dry: a plain zap');
    t.ok(has(wet.g, 'wet') && has(wet.g, 'stun'), 'in the puddle: Wet, then shocked (Stunned)');
    t.ok(wet.lost > dry.lost + 4, 'Wet + shock: ' + wet.lost + ' vs ' + dry.lost + ' damage');
    const hp1 = wet.b.hp;
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === wet.b && wet.b.hp === hp1 && !has(wet.g, 'stun'), 'the shocked goblin lost its turn (Betty untouched)');

    // Head Over Heels drops a foe next to the knight, Vulnerable: his Wide Cleave hits it 25% harder
    fight({ heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 3, y: 2 }], enemies: [{ id: 'test_grunt', x: 4, y: 5, hpMult: 2 }] });
    b = B();
    const v = at(4, 5);
    use(t, b, give(b, 'bet_horn_toss', 1), 4, 5, 'toss it north');
    t.ok(pos(v) === '4,3' && has(v, 'vulnerable'), 'landed at 4,3, next to the knight, Vulnerable');
    DD.Combat.endTurn();
    const k = hero('test_knight'), cleave = A().makeSlot('test_cleave', 1);
    k.skills = [cleave];
    const hp2 = v.hp, base = DD.getSkill('test_cleave').levels[0].dmg;
    t.ok(DD.Combat.current() === k && DD.Combat.useSkill(k, cleave, 4, 2), 'the knight cleaves east');
    t.eq(hp2 - v.hp, Math.round(base * 1.25), 'cleave ' + base + ' × 1.25');
  });

  // ---- 12c. attacks of opportunity ----------------------------------------------------------------------------------
  T.suite('hero_betty: attacks of opportunity (his hammer holds the line; walking away provokes; charges, leaps and flips never do)', function (t) {
    // his hammer is melee: it is his attack of opportunity
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    let b = B(), g = at(4, 4);
    t.ok(A().opportunitySlot(b) === b.basic, 'The Family Hammer (melee) is his attack of opportunity');
    t.eq(DD.AI.opportunityDmg(b, g, { x: 4, y: 4 }), 5, 'the AI knows walking away from him costs 5');
    t.ok(DD.AI.engaged(g).indexOf(b) >= 0, 'the goblin next to him is engaged');
    let seen = opportunities(function () { DD.AI.moveTo(g, 7, 4); });
    t.ok(seen.length === 1 && seen[0].a === 'betty' && seen[0].m === 'test_grunt' && seen[0].skill === 'bet_family_hammer', 'it walks away: Betty swings');
    t.ok(g.hp === 14 - 5 && pos(g) === '7,4', '5 damage, and it walks on (a plain hit does not stop it)');
    t.eq(b.oppRound, S().round, 'his swing of this round is spent');
    A().teleport(g, 4, 4);
    seen = opportunities(function () { DD.AI.moveTo(g, 7, 4); });
    t.ok(seen.length === 0 && g.hp === 9, 'once per round');
    DD.Combat.endRound();
    t.ok(S().round === 2 && DD.Combat.current() === b, 'round 2');
    A().teleport(g, 4, 4);
    seen = opportunities(function () { DD.AI.moveTo(g, 7, 4); });
    t.ok(seen.length === 1 && g.hp === 4, 'a new round: a new swing');
    // a swing that kills feeds Eats Anything
    fight({ heroes: [{ x: 3, y: 4, hp: 20 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    b = B(); g = at(4, 4);
    g.hp = 5;
    const gains = hypeGains(function () { DD.AI.moveTo(g, 7, 4); });
    t.ok(g.dead && b.hp === 24, 'the swing kills it: he eats its lunch (20 → 24)');
    t.eq(sumOf(gains, /^kill$/), HY('kill'), 'kill Hype');

    // walking away from a foe provokes it; the move preview knows; that move can't be undone
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    b = B(); g = at(4, 4);
    const reach = DD.Combat.reachable(b).get('0,4');
    t.ok(reach && reach.provokes && reach.provokes.length === 1 && reach.provokes[0] === g.id, 'the walk to 0,4 provokes the goblin');
    const pv = DD.Combat.provokes(b, 0, 4);
    t.ok(pv.length === 1 && pv[0].unitId === g.id && pv[0].dmg === 4, 'HUD: "provokes 1" (its Stab, 4)');
    seen = opportunities(function () { t.ok(DD.Combat.move(b, 0, 4), 'Betty walks off'); });
    t.ok(seen.length === 1 && seen[0].a === 'test_grunt' && seen[0].m === 'betty', 'the goblin stabs him in the back');
    t.ok(b.hp === 32 - 4 && pos(b) === '0,4', '−4, and he walks on');
    t.ok(!DD.Combat.canUndo(), 'a move that provoked can\'t be undone');

    // his charges, leaps and flips never provoke (that is what they are for)
    function noProvoke(label, cfg, act) {
      fight(cfg);
      const bb = B();
      S().hype = 100;
      const hp0 = bb.hp;
      const ev = opportunities(function () { act(bb); });
      t.eq(ev.length, 0, label + ': no attack of opportunity');
      return { b: bb, hp0: hp0 };
    }
    let r = noProvoke('Ramming Speed! away from a goblin', { heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] },
      function (bb) { use(t, bb, give(bb, 'bet_ram', 1), 1, 4, 'ram west'); });
    t.ok(pos(r.b) === '1,4' && r.b.hp === r.hp0, 'Ramming Speed!: dashed 3 tiles off, unhurt');
    r = noProvoke('Mountain Goat out of two goblins', { heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }] },
      function (bb) { use(t, bb, give(bb, 'bet_mountain_goat', 1), 2, 5, 'leap away'); });
    t.ok(pos(r.b) === '2,5' && r.b.hp === r.hp0, 'Mountain Goat: leapt clear, unhurt');
    r = noProvoke('G.O.A.T. out of a crowd', { heroes: [{ x: 4, y: 4 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 4, y: 5 }] },
    function (bb) { use(t, bb, bb.signature, 0, 4, 'G.O.A.T. west'); });
    t.ok(pos(r.b) === '0,4' && r.b.hp === r.hp0, 'G.O.A.T.: charged out, unhurt');
    r = noProvoke('Head Over Heels past the knight', { heroes: [{ x: 3, y: 4 }, { id: 'test_knight', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] },
      function (bb) { use(t, bb, give(bb, 'bet_horn_toss', 1), 4, 4, 'flip'); });
    t.ok(at(2, 4) && at(2, 4).defId === 'test_grunt' && at(2, 4).hp === 14 && hero('test_knight').oppRound !== S().round,
      'flipped away from the knight\'s side: a throw, so no slash from the knight');

    // a stunned, sleeping, sheep or downed Betty swings at nobody
    ['stun', 'sleep', 'sheep'].forEach(function (id) {
      fight({ heroes: [{ x: 3, y: 4 }, { id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
      const bb = B(), gg = at(4, 4);
      A().addStatus(bb, id, { turns: 1 }, gg);
      const ev = opportunities(function () { DD.AI.moveTo(gg, 7, 4); });
      t.ok(ev.length === 0 && gg.hp === 14 && pos(gg) === '7,4', id + ': no swing, it strolls off');
    });
    fight({ heroes: [{ x: 3, y: 4 }, { id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    b = B(); g = at(4, 4);
    A().damage(g, b, 99, {});
    seen = opportunities(function () { DD.AI.moveTo(g, 7, 4); });
    t.ok(b.downed && seen.length === 0 && g.hp === 14, 'downed: no swing');
    // charmed: never at his charmer, still at anyone else
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 3, y: 3 }] });
    b = B(); g = at(4, 4);
    const g2 = at(3, 3);
    A().addStatus(b, 'charmed', { turns: 1 }, g);
    seen = opportunities(function () { DD.AI.moveTo(g, 7, 4); });
    t.ok(seen.length === 0 && g.hp === 14, 'charmed: no swing at his charmer');
    seen = opportunities(function () { DD.AI.moveTo(g2, 3, 0); });
    t.ok(seen.length === 1 && g2.hp === 9, '...the other goblin still gets the hammer');

    // combos: a foe Stunned by Butt Out or Taunted by his Bleat lets an ally walk away for free
    fight({ heroes: [{ x: 3, y: 4 }, { id: 'test_knight', x: 5, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }] });
    b = B();
    use(t, b, give(b, 'bet_headbutt', 1), 4, 4, 'Butt Out');
    DD.Combat.endTurn();
    let k = hero('test_knight');
    t.ok(DD.Combat.current() === k && DD.Combat.provokes(k, 8, 4).length === 0, 'Stunned, the goblin threatens nobody: the knight\'s walk provokes nothing');
    seen = opportunities(function () { DD.Combat.move(k, 8, 4); });
    t.ok(seen.length === 0 && k.hp === k.maxHp && pos(k) === '8,4', 'the knight walks off unhurt');
    fight({ heroes: [{ x: 3, y: 4 }, { id: 'test_knight', x: 5, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    b = B();
    use(t, b, give(b, 'bet_bleat', 1), 3, 4, 'Bleat of Defiance');
    DD.Combat.endTurn();
    k = hero('test_knight');
    t.ok(DD.Combat.current() === k && DD.Combat.provokes(k, 8, 4).length === 0, 'Taunted by Betty, it only strikes Betty: the knight\'s walk provokes nothing');
    seen = opportunities(function () { DD.Combat.move(k, 8, 4); });
    t.ok(seen.length === 0 && k.hp === k.maxHp, 'the knight disengages for free');
    DD.Combat.giveTurnTo(b);
    t.ok(DD.Combat.current() === b && DD.Combat.provokes(b, 0, 4).length === 1, '...but Betty walking away from it would still provoke it');
  });

  T.suite('hero_betty: You Shall Not Pasture! at every level (+N on his attacks of opportunity, the walker is Rooted)', function (t) {
    [3, 5, 7].forEach(function (bonus, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 3, y: 3, hpMult: 2 }] });
      const b = B(), sl = give(b, 'bet_pasture', lv), g = at(4, 4), g2 = at(3, 3);
      t.eq(DD.skillDesc(DD.getSkill('bet_pasture'), lv, null), 'Until his next turn, Betty\'s attacks of opportunity deal +' + bonus +
        ' damage and Root the foe where it stands.', 'L' + lv + ': desc');
      t.eq(DD.AI.opportunityDmg(b, g, { x: 4, y: 4 }), 5, 'L' + lv + ': before: a plain 5');
      use(t, b, sl, 3, 4, 'L' + lv + ' plant the hooves');
      const s0 = st(b, 'bet_pasture');
      t.ok(s0 && s0.stacks === bonus && s0.turns === 1 && s0.source === b.id, 'L' + lv + ': the stance is up (+' + bonus + ')');
      t.ok(b.ap === 2 && sl.cd === 1, 'L' + lv + ': 1 AP, cooldown 1');
      t.eq(DD.AI.opportunityDmg(b, g, { x: 4, y: 4 }), 5 + bonus, 'L' + lv + ': the AI (and every estimate) sees ' + (5 + bonus));
      const seen = opportunities(function () { DD.AI.moveTo(g, 7, 4); });
      t.ok(seen.length === 1 && g.hp === 28 - 5 - bonus, 'L' + lv + ': the goblin walks away and takes ' + (5 + bonus));
      t.ok(has(g, 'root') && st(g, 'root').source === b.id && pos(g) === '4,4', 'L' + lv + ': Rooted where it stands: its walk ends next to Betty');
      const seen2 = opportunities(function () { DD.AI.moveTo(g2, 3, 0); });
      t.ok(seen2.length === 0 && g2.hp === 28 && !has(g2, 'root') && pos(g2) === '3,0', 'L' + lv + ': still one swing a round: the second goblin gets away');
    });

    // it lasts through every foe's turn until the start of his next one (foes acting before him next round included)
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], initiative: 'enemiesFirst' });
    let b = B();
    const g = at(4, 4);
    t.ok(DD.Combat.current() === b && S().round === 1, 'enemies first: round 1, Betty acts after the goblin');
    const sl = give(b, 'bet_pasture', 1);
    use(t, b, sl, 3, 4, 'stance');
    let during = null;
    const off = DD.Events.on('turn:start', function (e) {
      if (e.unit === g && S().round === 2) during = { up: has(b, 'bet_pasture'), dmg: DD.AI.opportunityDmg(b, g, { x: g.x, y: g.y }) };
    });
    DD.Combat.endTurn();
    off();
    t.ok(!!during && during.up && during.dmg === 8, 'round 2, the goblin\'s turn (before his): still planted, 8 to walk away');
    t.ok(DD.Combat.current() === b && S().round === 2 && !has(b, 'bet_pasture'), 'gone at the start of his next turn');
    t.ok(DD.Combat.canUse(b, sl) !== true, 'cooldown 1: not this turn');
    DD.Combat.endTurn();
    t.ok(S().round === 3 && DD.Combat.canUse(b, sl) === true, 'round 3: ready again');

    // on the walker's own turn: the Root covers the rest of that turn and its next one; Kick 'Em cashes in
    withTemp([runner('bet_test_runner')], function () {
      fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'bet_test_runner', x: 4, y: 4, hpMult: 2 }], enemyAi: true });
      const bb = B(), rn = at(4, 4);
      use(t, bb, give(bb, 'bet_pasture', 1), 3, 4, 'stance');
      let ev = opportunities(function () { DD.Combat.endTurn(); });
      t.ok(ev.length === 1 && rn.hp === 28 - 8 && pos(rn) === '4,4', 'on its turn it ran: 8 damage, Rooted on the spot');
      t.ok(has(rn, 'root') && st(rn, 'root').turns === 1, 'Rooted on its own turn: it still covers its next turn');
      t.ok(DD.Combat.current() === bb && S().round === 2, 'round 2, Betty');
      use(t, bb, give(bb, 'bet_kick', 1), 4, 4, 'Kick \'Em While They\'re Down');
      t.eq(rn.hp, 28 - 8 - 10, 'Rooted: the kick deals 10, not 5');
      ev = opportunities(function () { DD.Combat.endTurn(); });
      t.ok(ev.length === 0 && pos(rn) === '4,4' && !has(rn, 'root'), 'its next turn: Rooted, it could not run; the Root ended with that turn');
      ev = opportunities(function () { DD.Combat.endTurn(); });
      t.ok(ev.length === 1 && pos(rn) === '7,4' && rn.hp === 28 - 8 - 10 - 5, 'the turn after: it runs, a plain swing (5) and no Root without the stance');
    });

    // divers: the stance pins an assassin that leaves him for the squishy; a lethal swing keeps it from trying at all
    withTemp([shank('bet_test_shank')], function () {
      function dive(stanceLv, hp) {
        fight({ heroes: [{ x: 3, y: 4 }, { id: 'test_mage', x: 4, y: 1, hp: 3 }], enemies: [{ id: 'bet_test_shank', x: 4, y: 4 }], enemyAi: true });
        const bb = B(), m = hero('test_mage'), a = at(4, 4);
        if (hp) a.hp = hp;
        if (stanceLv) use(t, bb, give(bb, 'bet_pasture', stanceLv), 3, 4, 'stance L' + stanceLv);
        const ev = opportunities(function () { DD.Combat.endTurn(); DD.Combat.endTurn(); });   // → the mage → the assassin
        return { b: bb, m: m, a: a, ev: ev };
      }
      let d = dive(0);
      t.ok(DD.AI.isDiver(d.a), 'the test shank is a diver');
      t.ok(d.m.downed && d.a.hp === 14 - 5 && d.ev.length === 1, 'no stance: it takes the 5 and dives the 3-HP mage');
      d = dive(1);
      t.ok(!d.m.downed && d.m.hp === 3 && pos(d.a) === '4,4' && has(d.a, 'root') && d.a.hp === 14 - 8, 'stance: 8 and Rooted, the mage is safe');
      t.eq(d.b.hp, 32 - 4, 'stuck next to Betty, it stabs Betty instead');
      d = dive(0, 10);
      t.ok(d.m.downed && d.a.hp === 5, 'no stance, a 10-HP shank: 5 won\'t drop it, it dives');
      d = dive(3, 10);
      t.ok(!d.m.downed && d.ev.length === 0 && d.a.hp === 10 && pos(d.a) === '4,4', 'stance III: 12 would drop it, so it never tries');
    });

    // the bonus is his alone: a foe's swing at him stays plain, and he is not Rooted
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    b = B();
    use(t, b, give(b, 'bet_pasture', 3), 3, 4, 'stance III');
    t.eq(DD.Combat.provokes(b, 0, 4)[0].dmg, 4, 'his own walk away provokes a plain Stab (4)');
    DD.Combat.move(b, 0, 4);
    t.ok(b.hp === 32 - 4 && !has(b, 'root') && pos(b) === '0,4', 'stabbed for 4, not Rooted, walked on');
    // a lethal swing: the goblin is eaten, not Rooted
    fight({ heroes: [{ x: 3, y: 4, hp: 20 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    b = B();
    const gl = at(4, 4);
    gl.hp = 8;
    use(t, b, give(b, 'bet_pasture', 1), 3, 4, 'stance');
    DD.AI.moveTo(gl, 7, 4);
    t.ok(gl.dead && b.hp === 24 && !gl.statuses.some(function (s) { return s.id === 'root'; }), 'an 8-damage swing kills it: eaten (+4), no Root on a corpse');
    // sheep / stunned: no stance; AI value: next to a diver or an archer, not in the open
    fight({ heroes: [{ x: 3, y: 4 }], enemies: [{ id: 'test_archer', x: 4, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    b = B();
    const ps = give(b, 'bet_pasture', 1), def = DD.getSkill('bet_pasture');
    const near = def.aiScore(DD.Targeting.buildCtx(b, ps, { x: 3, y: 4 }));
    A().teleport(at(4, 4), 6, 6);
    const far = def.aiScore(DD.Targeting.buildCtx(b, ps, { x: 3, y: 4 }));
    t.ok(near >= 4 && far < 0, 'aiScore: worth it next to an archer that wants to step back (' + near + '), not in the open (' + far + ')');
    A().addStatus(b, 'sheep', { turns: 1 }, at(8, 8));
    t.eq(DD.Combat.canUse(b, ps), 'Baa. (Sheep can only move.)', 'a sheep plants no hooves');
    // AutoPlay: in the open he walks to the fight instead of planting his hooves on an empty field
    fight({ w: 11, heroes: [{ x: 1, y: 4, skills: [{ id: 'bet_pasture', level: 1 }] }], enemies: [{ id: 'test_grunt', x: 9, y: 4 }] });
    b = B();
    const x0 = b.x;
    DD.AutoPlay.takeTurn();
    t.ok(!has(b, 'bet_pasture') && b.x > x0, 'AutoPlay in the open: no stance, he heads for the goblin (x ' + x0 + ' → ' + b.x + ')');
  });

  // ---- 13. AutoPlay battles -------------------------------------------------------------------------------------
  T.suite('hero_betty: AutoPlay battles at levels 1 / 3 / 5 (fixture encounters, skills used)', function (t) {
    const plans = [
      { enc: 'test_a1_normal', level: 1, sl: 1, skills: ['bet_ram', 'bet_headbutt'] },
      { enc: 'test_a1_elite', level: 1, sl: 1, skills: ['bet_ram', 'bet_headbutt'] },
      { enc: 'test_a1_normal', level: 3, sl: 2, skills: ['bet_ram', 'bet_headbutt', 'bet_stomp', 'bet_kick'] },
      { enc: 'test_a2_normal', level: 3, sl: 2, skills: ['bet_horn_toss', 'bet_bleat', 'bet_kick', 'bet_mountain_goat'] },
      { enc: 'test_a1_boss', level: 3, sl: 2, skills: ['bet_ram', 'bet_headbutt', 'bet_goat_yoga', 'bet_snack'] },
      { enc: 'test_a2_elite', level: 5, sl: 2, skills: ['bet_ram', 'bet_headbutt', 'bet_pasture', 'bet_kick'] },
      { enc: 'test_a3_normal', level: 5, sl: 3, skills: ['bet_ram', 'bet_bleat', 'bet_stomp', 'bet_snack'] },
      { enc: 'test_a2_boss', level: 5, sl: 3, skills: ['bet_headbutt', 'bet_kick', 'bet_horn_toss', 'bet_pasture'] },
      { enc: 'test_a3_elite', level: 5, sl: 3, skills: ['bet_ram', 'bet_stomp', 'bet_bleat', 'bet_mountain_goat'] },
    ];
    const totals = {};
    let fought = 0, wins = 0, skillUses = 0, aooBy = 0, aooOn = 0;
    plans.forEach(function (p, i) {
      const enc = DD.getEncounter(p.enc);
      if (!enc) { t.fail('fixture encounter ' + p.enc + ' missing'); return; }
      const party = ['betty', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
        if (id === 'betty') return DD.Combat.makeRunHero({ id: id, level: p.level, skills: p.skills.map(function (sid) { return { id: sid, level: p.sl }; }) });
        const h = DD.getHero(id);
        return DD.Combat.makeRunHero({ id: id, level: p.level, skills: h.startingSkills.map(function (sid) { return { id: sid, level: p.sl }; }) });
      });
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('bet-ap-' + i + ':' + t.seed), difficulty: 'normal', act: enc.act });
      DD.Combat.start(setup, { seed: 700 + i, headless: true, difficulty: 'normal', kind: enc.kind });
      const counts = {};
      let moves = 0, turns = 0;
      A().addRule({ id: 'bet_usage_probe', name: 'Usage probe', hooks: {
        onSkillUsed: function (ctx) {
          if (A().simulating || !ctx.user || ctx.user.defId !== 'betty' || !ctx.skill || !DD.getSkill(ctx.skill.id)) return;
          counts[ctx.skill.id] = (counts[ctx.skill.id] || 0) + 1;
        },
        onMove: function (u) { if (!A().simulating && u && u.defId === 'betty') moves++; },
      } });
      const offTurn = DD.Events.on('turn:start', function (e) { if (e.unit && e.unit.defId === 'betty') turns++; });
      const offOpp = DD.Events.on('opportunity:attack', function (e) {
        if (A().simulating) return;
        if (e.attacker && e.attacker.defId === 'betty') aooBy++;
        if (e.mover && e.mover.defId === 'betty') aooOn++;
      });
      let r;
      try { r = DD.AutoPlay.runBattle(30); } finally { offTurn(); offOpp(); }
      fought++;
      if (r.result === 'victory') wins++;
      t.ok(!!S().order && S().order.length > 0, p.enc + ' L' + p.level + ': initiative was rolled');
      Object.keys(counts).forEach(function (k) { totals[k] = (totals[k] || 0) + counts[k]; if (k !== 'bet_family_hammer') skillUses += counts[k]; });
      t.ok(r.rounds > 0 && !r.timeout && !!r.result, p.enc + ' L' + p.level + ': finished (' + r.result + ' in ' + r.rounds + ' rounds)');
      // short act-1 fights can be over before Betty (init +1, often rolling last) reaches the far side: he must at least
      // take his turns and close in
      t.ok(turns > 0 && (Object.keys(counts).length > 0 || moves > 0 || (B() && B().downed)), p.enc + ' L' + p.level + ': Betty took his turns (moved or used skills)');
      t.ok(T.contentHelpers && T.contentHelpers.sanity ? T.contentHelpers.sanity(t, 'battle ' + p.enc) : true, p.enc + ': state sane');
      t.log(p.enc + ' L' + p.level + ' → ' + r.result + ' in ' + r.rounds + ' rounds; Betty: ' + turns + ' turns, ' + moves + ' moves, ' + JSON.stringify(counts));
      A().removeRule('bet_usage_probe');
    });
    t.log('won ' + wins + '/' + fought + '; Betty\'s skill uses: ' + JSON.stringify(totals) + '; attacks of opportunity by him ' + aooBy + ', on him ' + aooOn);
    t.ok(fought === plans.length, 'every battle fought');
    t.ok(wins >= Math.ceil(fought / 2), 'the party wins most fixture fights (' + wins + '/' + fought + ')');
    t.ok(skillUses >= 8, 'Betty uses his skills, not just the hammer (' + skillUses + ')');
    t.ok((totals.bet_ram || 0) + (totals.bet_headbutt || 0) > 0, 'the starting skills get used');
    t.ok(Object.keys(totals).filter(function (k) { return k !== 'bet_family_hammer'; }).length >= 4, 'at least 4 different skills used across the battles');
  });

  // ---- balance sim (manual: tools/test.sh "suite=hero_betty: zz&sim=1&n=3"; enc=<id> for one encounter, trace=1 prints
  //      his AutoPlay decisions in the first fight, fixtures=1 for the fixture party) -------------------------------------
  T.suite('hero_betty: zz balance sim (sim=1 only)', function (t) {
    if (t.param('sim', '0') !== '1') { t.skip('sim=1 only'); return; }
    if (!DD.Encounter) { t.skip('no encounters'); return; }
    const n = Math.max(1, +t.param('n', 2) || 2);
    const only = t.param('enc', '');
    const fixtureParty = t.param('fixtures', '0') === '1';
    const encs = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; }).filter(function (e) {
      if (only) return e.id === only;
      return fixtureParty ? /^test_a\d_(normal|elite)$/.test(e.id) : !/^(test_|mgt_|mg_)/.test(e.id) && e.kind !== 'boss';
    });
    const pool = Object.keys(DD.defs.heroes).filter(function (k) { return k.indexOf('test_') !== 0 && k !== 'betty'; });
    const rng = DD.RNG('bet-sim:' + t.seed);
    const tally = {}, uses = {}, sockets = {};
    const me = { aooBy: 0, aooOn: 0, aooKills: 0 };
    let fights = 0, wins = 0, traced = false;
    // every hero's turns, and the ones spent only walking (no skill used): is Betty held back more than the others?
    const turnsOf = {}, cur = {};
    const offTurn = DD.Events.on('turn:start', function (e) {
      if (!e.unit || e.unit.kind !== 'hero') return;
      const r = turnsOf[e.unit.defId] || (turnsOf[e.unit.defId] = { turns: 0, idle: 0 });
      r.turns++;
      cur[e.unit.id] = { acts: 0, moves: 0 };
    });
    const offEnd = DD.Events.on('turn:end', function (e) {
      const c = e.unit && cur[e.unit.id];
      if (c && !c.acts && c.moves) turnsOf[e.unit.defId].idle++;
    });
    const offOpp = DD.Events.on('opportunity:attack', function (e) {
      if (A().simulating) return;
      if (e.attacker && e.attacker.defId === 'betty') me.aooBy++;
      if (e.mover && e.mover.defId === 'betty') me.aooOn++;
    });
    function oneFight(enc) {
      const others = fixtureParty || pool.length < 3 ? ['test_knight', 'test_cleric', 'test_mage'] : rng.sample(pool, 3);
      const ids = rng.shuffle(['betty'].concat(others));
      const lvl = enc.act === 1 ? 2 : enc.act === 2 ? 3 : 5;
      const party = ids.map(function (id) {
        const h = DD.getHero(id);
        const extra = (h.skillPool || []).filter(function (sid) { return h.startingSkills.indexOf(sid) < 0; });
        const pick = rng.sample(extra, enc.act === 1 ? 1 : 2);
        const sl = Math.min(3, 1 + Math.floor((lvl - 1) / 2));
        if (id === 'betty') h.startingSkills.concat(pick).forEach(function (sid) { sockets[sid] = (sockets[sid] || 0) + 1; });
        return DD.Combat.makeRunHero({ id: id, level: lvl, skills: h.startingSkills.concat(pick).map(function (sid) { return { id: sid, level: sl }; }) });
      });
      const setup = DD.safe('build ' + enc.id, DD.Encounter.build, DD.Encounter, [enc, party, { rng: DD.RNG(rng.int(1, 1e9)), difficulty: 'normal', act: enc.act }]);
      if (!setup || !setup.grid) return;
      DD.Combat.start(setup, { seed: rng.int(1, 1e9), headless: true, difficulty: 'normal', kind: enc.kind });
      A().addRule({ id: 'bet_sim_probe', name: 'Sim probe', hooks: {
        onSkillUsed: function (ctx) {
          if (A().simulating || !ctx.user || ctx.opportunity) return;
          if (cur[ctx.user.id]) cur[ctx.user.id].acts++;
          if (ctx.user.defId === 'betty') uses[ctx.skill.id] = (uses[ctx.skill.id] || 0) + 1;
        },
        onMove: function (u) { if (!A().simulating && u && cur[u.id]) cur[u.id].moves++; },
        onKill: function (d) { if (!A().simulating && d && d.credit && d.credit.defId === 'betty' && d.opportunity) me.aooKills++; },
      } });
      const tr = t.param('trace', '0') === '1' && !traced;
      if (tr) { DD.AutoPlay.trace = true; DD.AutoPlay.log = []; }
      let res;
      try { res = DD.AutoPlay.runBattle(30); } finally { DD.AutoPlay.trace = false; }
      if (tr) {
        traced = true;
        t.log('trace ' + enc.id + ': ' + DD.AutoPlay.log.filter(function (l) { return l.unit === 'betty'; }).map(function (l) {
          return 'r' + l.round + ' ' + l.what + (l.skill ? ' ' + l.skill : '') + (l.target ? '@' + l.target.x + ',' + l.target.y : '') + (l.total !== null ? ' (' + l.total + ')' : '');
        }).join(' | '));
      }
      const s = DD.Combat.state;
      fights++;
      if (res.result === 'victory') wins++;
      s.units.filter(function (u) { return u.kind === 'hero'; }).forEach(function (u) {
        const r = tally[u.defId] || (tally[u.defId] = { fights: 0, dmg: 0, taken: 0, kills: 0, downs: 0 });
        const us = s.stats.units[u.id] || {};
        r.fights++; r.dmg += us.dmg || 0; r.taken += us.taken || 0; r.kills += us.kills || 0; r.downs += u.downed ? 1 : 0;
      });
      A().removeRule('bet_sim_probe');
    }
    try {
      encs.forEach(function (enc) { for (let i = 0; i < n; i++) oneFight(enc); });
    } finally { offTurn(); offEnd(); offOpp(); }
    Object.keys(tally).sort().forEach(function (id) {
      const r = tally[id], tu = turnsOf[id] || { turns: 0, idle: 0 };
      t.log(id + ': ' + r.fights + ' fights · dmg/fight ' + (r.dmg / r.fights).toFixed(1) + ' · taken/fight ' + (r.taken / r.fights).toFixed(1) +
        ' · kills/fight ' + (r.kills / r.fights).toFixed(2) + ' · downed ' + r.downs + ' · walk-only turns ' + tu.idle + '/' + tu.turns +
        ' (' + Math.round(100 * tu.idle / Math.max(1, tu.turns)) + '%)');
    });
    t.log('Betty uses per fight when socketed: ' + POOL.filter(function (id) { return sockets[id]; }).map(function (id) {
      return DD.getSkill(id).name + ' ' + ((uses[id] || 0) / sockets[id]).toFixed(2) + ' (' + sockets[id] + ')';
    }).join(' · '));
    t.log('hammer ' + (uses.bet_family_hammer || 0) + ' · G.O.A.T. ' + (uses.bet_goat || 0));
    t.log('attacks of opportunity: by him ' + me.aooBy + ' (' + (me.aooBy / Math.max(1, fights)).toFixed(2) + '/fight, ' + me.aooKills + ' kills) · on him ' + me.aooOn);
    t.log('fights ' + fights + ', wins ' + wins + ' (' + Math.round(100 * wins / Math.max(1, fights)) + '%)');
    t.ok(fights > 0, 'simulated');
  });

  // ---- v2 requests (Nov 3): barrels ----------------------------------------------------------------------------------
  T.suite('hero_betty: v2 requests — Butt Out and Kick \'Em set off an explosive barrel (no Stun: nothing to stun) and he eats what is left', function (t) {
    ['bet_headbutt', 'bet_kick'].forEach(function (id) {
      fight({ heroes: [{ x: 2, y: 4, hp: 20 }], objects: [{ x: 3, y: 4, id: 'barrel_explosive' }], enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const b = B(), sl = give(b, id, 1), g = at(4, 4), g0 = g.hp, b0 = b.hp;
      t.ok(DD.Targeting.validTargets(b, sl).some(function (q) { return q.obj === 'barrel_explosive' && q.x === 3 && q.y === 4; }), id + ': can be aimed at the adjacent barrel');
      const prev = DD.Combat.preview(b, sl, 3, 4);
      t.eq(prev.detonates, 'barrel_explosive', id + ': the preview detonates it');
      const heals = [], orig = DD.Act.heal;
      DD.Act.heal = function (src, tg, n) { const r = orig.apply(this, arguments); if (tg === b) heals.push(r); return r; };
      try { use(t, b, sl, 3, 4, id + ' at a barrel'); } finally { DD.Act.heal = orig; }
      t.ok(!tile(3, 4).obj, id + ': the barrel went off');
      t.ok(g.hp < g0 && !has(g, 'stun') && g.x === 4, id + ': the grunt next to it takes the blast, and no Stun from the skill');
      t.eq(heals.length === 1 && heals[0], 4, id + ': Eats Anything: the barrel his skill broke heals him 4');
      t.eq(b0 - b.hp, (prev.perUnit[b.id].dmg || 0) - (prev.perUnit[b.id].heal || 0), id + ': Betty\'s HP (blast − snack) as previewed (' + (b0 - b.hp) + ')');
      t.eq(g0 - g.hp, prev.perUnit[g.id].dmg, id + ': the grunt\'s as previewed');
      t.eq(b.ap, 3 - DD.Combat.costOf(b, DD.getSkill(id), 1).ap, id + ': its AP is paid');
      t.ok(sl.cd > 0, id + ': and its cooldown');
    });
  });
})();
