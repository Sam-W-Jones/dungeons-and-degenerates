/* Dungeons and Degenerates — tests/content/hero_marwyn.js
 * Suites "hero_marwyn: …" for js/data/heroes/marwyn.js (owner: hero-marwyn), v2 (initiative, no telegraphs, no Guard,
 * one verb per skill): the hero def and its simplicity budget, the MAGNIFICENCE passive (one gain rule, the surge on
 * the next skill), every skill at every level in DD.Combat.sandbox fights (desc == effect, enemies acting on their own
 * turns, durations per own turn), the signature, the 3 items, HUD previews, v2 edge cases, attacks of opportunity (his
 * basic strikes foes that walk away; his leap / throws / pull / knockback never provoke) and AutoPlay battles (party
 * marwyn + test knight / cleric / mage) against the fixture encounters at levels 1 / 3 / 5, every use of his skills in
 * them audited (the passive's one rule, HUD previews == what happened).
 * Run: bash tools/test.sh "suite=hero_marwyn&isolate=heroes/marwyn,hero_marwyn"
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const POOL = ['mrw_war_cry', 'mrw_yeet', 'mrw_cleave', 'mrw_headbutt', 'mrw_hero_landing', 'mrw_gun_show', 'mrw_rage',
    'mrw_magnetism', 'mrw_keg_stand'];
  const ALL_SKILLS = ['mrw_ginger_snap', 'mrw_behold'].concat(POOL);
  const ITEMS = ['mrw_yeet_gauntlets', 'mrw_loincloth', 'mrw_hand_mirror'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const HE = ['Zarathor', 'Syllamin', 'Marbles', 'Marwyn', 'Josiah', 'Corelos', 'Slate', 'Buga', 'Betty', 'Basanos', 'Valdris',
    'Hjalmar', 'Pebbles'];
  const SHE = ['Ellaria', 'Sparrow', 'Kiri'];
  const OTHERS = /Syllamin|Zarathor|Marbles|Ellaria|Josiah|Sparrow|Corelos|Slate|Buga|Kiri|Betty|Basanos|Valdris|Hjalmar|Pebbles/;
  const EAST = { x: 1, y: 0 };

  // ---- helpers -----------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  /**
   * Sandbox that never ends on its own (custom objective), 9×9 stone, heroes first in the initiative order. Enemies
   * pass every turn unless cfg.ai (then they act on their turns, round 1 included).
   */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = (cfg.heroes || [{ x: 2, y: 4 }]).map(function (h) {
      return Object.assign({ id: 'marwyn', level: 1, skills: [] }, h);
    });
    const base = {
      w: 9, h: 9, seed: 7, enemies: [],
      objective: { type: 'custom', text: 'Marwyn test' }, encounter: { id: 'mrw_test_arena', checkObjective: function () { return null; } },
    };
    if (!cfg.ai) base.enemyAi = false;
    DD.Combat.sandbox(Object.assign(base, cfg, { heroes: heroes }));
    return DD.Combat.state;
  }
  function M() { return DD.Combat.heroes().filter(function (u) { return u.defId === 'marwyn'; })[0]; }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function foes() { return DD.Combat.enemies(); }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function setT(x, y, t) { tile(x, y).t = t; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function stacks(u) { return DD.Marwyn.stacksOf(u); }
  function setStacks(u, n) {
    DD.Act.removeStatus(u, 'mrw_magnificence', { silent: true });
    if (n > 0) DD.Act.addStatus(u, 'mrw_magnificence', { stacks: n, silent: true }, u);
  }
  function dead(defId) { return DD.Combat.state.units.filter(function (u) { return u.defId === defId && u.dead; }).length; }
  function keys(list) { return list.map(function (p) { return p.x + ',' + p.y; }).join(' '); }
  /** Hype gains (amount, reason) recorded while fn runs (exact, unlike the pool, which surges such as The Crowd Goes Wild also feed). */
  function hypeGains(fn) {
    const list = [], orig = DD.Act.gainHype;
    DD.Act.gainHype = function (n, why) { list.push({ n: n, why: String(why || '') }); return orig.apply(this, arguments); };
    try { fn(); } finally { DD.Act.gainHype = orig; }
    return list;
  }
  function surgeHype(gains) { return gains.filter(function (g) { return /^MAGNIFICENT SURGE/.test(g.why); }).map(function (g) { return g.n; }).join(','); }
  /** The slot Marwyn uses for a skill (basic / signature, or a fresh socket at a level). */
  function give(u, id, level) {
    if (id === 'mrw_ginger_snap') return u.basic;
    if (id === 'mrw_behold') return u.signature;
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
  /** Wild-magic surges fired while fn runs. */
  function surges(fn) {
    const list = [];
    const off = DD.Events.on('wildmagic:surge', function (e) { list.push(e); });
    try { fn(); } finally { off(); }
    return list;
  }
  /** HP + Block of every melee hit Marwyn lands while fn runs (real ones only). */
  function meleeDealt(fn) {
    const out = [];
    A().addRule({ id: 'mrw_melee_probe', name: 'probe', hooks: { onTakeDamage: function (d) {
      if (!A().simulating && d.source && d.source.defId === 'marwyn' && (d.tags || []).indexOf('melee') >= 0) out.push(d.dealt + d.blocked);
    } } });
    try { fn(); } finally { A().removeRule('mrw_melee_probe'); }
    return out;
  }
  /** HP + Block every unit loses to hostile hits while fn runs (real ones only, not previews): { unitId: n }. */
  function hitsTaken(fn) {
    const out = {};
    A().addRule({ id: 'mrw_hit_probe', name: 'probe', hooks: { onTakeDamage: function (d) {
      if (A().simulating || !d.source || !d.target || !DD.Grid.hostile(d.source, d.target)) return;
      out[d.target.id] = (out[d.target.id] || 0) + d.dealt + d.blocked;
    } } });
    try { fn(); } finally { A().removeRule('mrw_hit_probe'); }
    return out;
  }
  /**
   * Preview, use for real, then compare HP changes / KOs / movement / Hype. A certain preview is exact; one whose
   * outcome rolls dice (a MAGNIFICENT SURGE) is uncertain and never shows the real roll.
   */
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
    let surged = 0;
    const off = DD.Events.on('wildmagic:surge', function () { surged++; });
    let ok = false;
    try { ok = use(t, u, sl, x, y, label); } finally { off(); }
    if (!ok) return;
    if (surged) t.ok(prev.uncertain, label + ': the surge it set off hides behind a "?" in the preview');
    if (prev.uncertain) {
      t.ok(Object.keys(prev.perUnit).every(function (k) { return prev.perUnit[k].uncertain; }), label + ': every badge of the uncertain preview says "?"');
      return;
    }
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
  /** Words of a text, numbers not counted (DESIGN §6: "about 12 words + numbers"). */
  function words(s) { return String(s).split(/\s+/).filter(function (w) { return /[A-Za-z]/.test(w); }).length; }
  function shapeOf(s) { return String(s).replace(/[0-9]+/g, '#'); }
  function sentences(s) { return String(s).split(/(?<=[.!?])\s+/); }

  // ---- 1. definition ------------------------------------------------------------------------------------
  T.suite('hero_marwyn: hero definition, pool, simplicity budget, barks, items, sprite', function (t) {
    const h = DD.getHero('marwyn');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.ok(h.name === 'Marwyn' && h.epithet === 'the Magnificent' && h.race === 'Human' && h.cls === 'Barbarian', 'name, epithet, race, class');
    t.ok(h.complexity >= 1 && h.complexity <= 3 && h.role && h.blurb.length > 60 && /^#[0-9a-f]{6}$/i.test(h.color), 'role, complexity, blurb, color');
    t.eq(h.unlock, null, 'available from the start (v2: every hero is unlocked)');
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov >= 3 && h.stats.mov <= 5, 'stats in DESIGN §5 ranges');
    t.eq(h.stats.init, 0, 'initiative modifier 0');
    t.ok(!('block' in h.stats), 'no starting Block stat');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth');
    t.ok(!h.flags.immovable, 'not immovable (that is Slate\'s thing)');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['mrw_war_cry', 'mrw_yeet']), 'starts with LOOK AT MARWYN! and YEET');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'pool of 9 (DESIGN v2: 8-10 sharper skills)');
    const basic = DD.getSkill(h.basic), sig = DD.getSkill(h.signature);
    t.ok(basic && basic.ap === 1 && basic.levels[0].dmg >= 4 && basic.levels[0].dmg <= 6 && !basic.cooldown, 'basic: 1 AP, 4-6 damage');
    t.ok(sig && sig.hype === 100 && sig.levels.length === 1 && sig.levels[0].block > 0 && sig.area.shape === 'all_foes', 'signature: 100 Hype, one big effect on every foe');
    const aps = {};
    POOL.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'marwyn' && s.levels.length === 3, id + ': registered, owner, 3 levels');
      if (!s) return;
      aps[s.ap] = 1;
      t.ok(typeof s.icon === 'string' && s.icon.length > 0 && s.icon.length <= 4, id + ': one emoji icon');
      t.ok(s.flavor && s.flavor.length <= 120, id + ': flavor ≤ 120');
      t.ok(['attack', 'spell', 'buff', 'heal', 'summon', 'move', 'utility'].indexOf(s.kind) >= 0 && s.tags.length > 0, id + ': kind + tags');
      for (let lv = 1; lv <= 3; lv++) {
        const dn = DD.skillDesc(s, lv, null), du = DD.skillDesc(s, lv, { id: 'x', items: [], statuses: [] });
        t.ok(dn && !/undefined|NaN|\[object/.test(dn) && du === dn, id + ' L' + lv + ': desc works without a user');
      }
      t.ok(DD.skillDesc(s, 1, null) !== DD.skillDesc(s, 2, null) && DD.skillDesc(s, 2, null) !== DD.skillDesc(s, 3, null), id + ': every level reads differently');
    });
    t.ok(aps[1] && aps[2] && aps[3], 'AP mix of 1, 2 and 3');
    t.ok(DD.getSkill('mrw_keg_stand').charges === 2 && DD.getSkill('mrw_magnetism').cooldown >= 3 && DD.getSkill('mrw_rage').cooldown >= 3, 'a big skill with charges, long cooldowns on the big ones');
    // DESIGN §6 "Simplicity": one breath per desc, no if/else, II = bigger numbers, III = bigger numbers or ONE rider
    ALL_SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = DD.skillDesc(s, lv, null);
        t.ok(words(d) <= 24, id + ' L' + lv + ': the desc reads in one breath (' + words(d) + ' words): ' + d);
        t.ok(!/\bif\b|otherwise|unless|instead|telegraph|intent|\bGuard\b|fizzle/i.test(d), id + ' L' + lv + ': no if/else clauses, no v1 mechanics');
      }
      if (s.levels.length !== 3) return;
      const a = shapeOf(DD.skillDesc(s, 1, null)), b = shapeOf(DD.skillDesc(s, 2, null)), c = shapeOf(DD.skillDesc(s, 3, null));
      t.eq(b, a, id + ': level II only changes numbers');
      const head = a.replace(/\.$/, '');
      t.ok(c === a || (c.indexOf(head) === 0 && words(c.slice(head.length)) <= 8), id + ': level III changes numbers or adds ONE short rider (' + c + ')');
    });
    Object.keys(DD.defs.skills).forEach(function (k) { if (DD.defs.skills[k].owner === 'marwyn') t.ok(ALL_SKILLS.indexOf(k) >= 0, 'skill id ' + k + ' is mrw_ and known'); });
    ['mrw_magnificence', 'mrw_rage'].forEach(function (k) { t.ok(!!DD.getStatus(k) && /^mrw_/.test(k), 'status ' + k); });
    t.ok(words(h.passive.desc) <= 45 && !/telegraph|intent|Guard|push/i.test(h.passive.desc), 'passive: one rule, short: ' + h.passive.desc);
    // barks: every key 4-6 lines, ≤ 70 chars, MAGNIFICENT in capitals, other heroes named
    let others = 0, caps = 0;
    BARK_KEYS.forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ': 4-6 lines (' + lines.length + ')');
      lines.forEach(function (l) {
        t.ok(typeof l === 'string' && l.length > 0 && l.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(l) + ' (' + l.length + ')');
        if (OTHERS.test(l)) others++;
        if (/MARWYN|MAGNIFICEN/.test(l)) caps++;
      });
    });
    ['surge', 'maxed', 'taunt', 'yeet', 'landing', 'flex', 'opportunity'].forEach(function (k) {
      t.ok((h.barks[k] || []).length >= 3 && h.barks[k].every(function (l) { return l.length <= 70; }), 'extra bark key ' + k);
    });
    t.ok(others >= 8, 'barks name other heroes now and then, the new ones too (' + others + ')');
    ['Kiri', 'Betty', 'Basanos', 'Valdris', 'Hjalmar', 'Pebbles'].forEach(function (n) {
      let named = false;
      for (const k in h.barks) if (h.barks[k].some(function (l) { return l.indexOf(n) >= 0; })) named = true;
      t.ok(named, 'a bark for the newer party member ' + n);
    });
    t.ok(caps >= 15, 'MAGNIFICENT, in capitals, a lot (' + caps + ')');
    // every player-facing text: no removed mechanics, pronouns as confirmed by the user
    const texts = [h.blurb, h.role, h.passive.name, h.passive.desc];
    for (const k in h.barks) Array.prototype.push.apply(texts, h.barks[k]);
    ALL_SKILLS.forEach(function (id) { const s = DD.getSkill(id); texts.push(s.name, s.flavor); for (let lv = 1; lv <= s.levels.length; lv++) texts.push(DD.skillDesc(s, lv, null)); });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); if (it) texts.push(it.name, it.desc, it.flavor); });
    ['mrw_magnificence', 'mrw_rage'].forEach(function (k) { [1, 5].forEach(function (n) { texts.push(DD.getStatus(k).desc({ id: k, stacks: n, turns: 1, data: {} })); }); });
    texts.forEach(function (x) {
      t.ok(!/telegraph|intent|\bGuard\b|fizzle|redirect/i.test(x), 'no v1 mechanics in ' + JSON.stringify(x));
      sentences(x).forEach(function (sn) {
        const he = HE.some(function (n) { return n !== 'Marwyn' && sn.indexOf(n) >= 0; }), she = SHE.some(function (n) { return sn.indexOf(n) >= 0; });
        if (she && !he) t.ok(!/\b(he|him|his|himself)\b/i.test(sn.replace(/Marwyn[^,.!?]*/g, '')), 'pronouns (she/her): ' + sn);
        if (he && !she) t.ok(!/\b(she|her|hers|herself)\b/i.test(sn), 'pronouns (he/him): ' + sn);
      });
    });
    // items
    const rar = {};
    ITEMS.forEach(function (id) {
      const it = DD.getItem(id);
      t.ok(it && it.hero === 'marwyn' && it.desc && it.flavor && it.flavor.length <= 120, 'item ' + id + ' registered for Marwyn');
      if (!it) return;
      rar[it.rarity] = 1;
      t.ok(!it.stats.block && !(it.hooks && (it.hooks.onCombatStart || it.hooks.onRoundStart)), 'item ' + id + ': no starting shield or start-of-fight bonus');
      t.ok(words(it.desc) <= 16, 'item ' + id + ': one clear rule (' + it.desc + ')');
    });
    t.ok(rar.rare && rar.legendary, 'a rare and a legendary item');
    // sprite (+ overlay at 3 and 5 stacks) and portrait
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 160;
    const ctx = cv.getContext('2d');
    const p0 = DD.problems.length;
    ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) { DD.Sprites.draw(ctx, h.sprite, 80, 140, 2, { t: 0.5, pose: pose }); });
    const fake = { id: 'fake', defId: 'marwyn', kind: 'hero', side: 'hero', x: 0, y: 0, hp: 9, maxHp: 9, flags: {}, data: {},
      statuses: [{ id: 'mrw_magnificence', stacks: 3, turns: -1, data: {} }] };
    DD.Sprites.draw(ctx, h.sprite, 80, 140, 2, { t: 0.5, unit: fake });
    fake.statuses[0].stacks = 5;
    DD.Sprites.draw(ctx, h.sprite, 80, 140, 2, { t: 0.9, unit: fake });
    const px = ctx.getImageData(0, 0, 160, 160).data;
    let ink = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) ink++;
    t.ok(ink > 2000, 'sprite paints pixels (' + ink + ')');
    t.eq(DD.problems.length, p0, 'no sprite warnings (overlay included)');
    t.ok(DD.Sprites.metrics(h.sprite).height > 44, 'huge: taller than a medium humanoid');
    const por = DD.Sprites.portrait('marwyn', 64);
    t.ok(por && por.width === 64, 'portrait renders');
  });

  // ---- 2. passive -------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: MAGNIFICENCE (one gain rule; the surge belongs to the next skill)', function (t) {
    fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }] });
    let m = M();
    const g = at(3, 4);
    t.eq(stacks(m), 0, 'starts at 0');
    use(t, m, m.basic, 3, 4, 'Ginger Snap');
    t.ok(g.hp === 9 && stacks(m) === 1, 'a hit: 5 damage, +1 MAGNIFICENCE');
    use(t, m, m.basic, 3, 4, 'Ginger Snap 2');
    t.ok(g.hp === 4 && stacks(m) === 2, 'MAGNIFICENCE adds no damage (still 5); +1 again');
    A().damage(at(2, 5), m, 3);
    A().damage(null, m, 2, { cause: 'terrain' });
    t.eq(stacks(m), 2, 'being hit adds nothing (one gain rule)');
    use(t, m, m.basic, 3, 4, 'Ginger Snap kill');
    t.ok(g.dead && stacks(m) === 3, 'a kill is just a skill that reached a foe: +1');
    DD.Combat.endTurn();
    t.eq(stacks(m), 3, 'the meter never decays between turns');
    // no damage bonus at any meter level (real pipeline; brute: armor 1)
    [0, 3, 5].forEach(function (n) {
      fight({ enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
      setStacks(M(), n);
      A().damage(M(), foes()[0], 10);
      t.eq(50 - foes()[0].hp, 9, n + ' MAGNIFICENCE: 10 damage stays 10 (−1 armor)');
    });
    fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    DD.Marwyn.addStacks(M(), 9);
    t.eq(stacks(M()), 5, 'capped at 5');
    // the rule: a skill with a foe in its area adds 1 (once), whatever it does; no foe in its area, nothing
    fight({ heroes: [{ x: 4, y: 4, skills: ['mrw_war_cry'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    m = M();
    use(t, m, m.skills[0], 4, 4, 'War Cry, nobody near');
    t.eq(stacks(m), 0, 'no foe in its area: no MAGNIFICENCE');
    fight({ heroes: [{ x: 4, y: 4, skills: ['mrw_war_cry'] }], enemies: [{ id: 'test_grunt', x: 4, y: 2 }, { id: 'test_grunt', x: 5, y: 4 }] });
    m = M();
    use(t, m, m.skills[0], 4, 4, 'War Cry, 2 foes near');
    t.eq(stacks(m), 1, 'two foes in its area: +1 (once per skill)');
    fight({ heroes: [{ x: 1, y: 4, skills: ['mrw_yeet'] }, { id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 0 }] });
    m = M();
    use(t, m, m.skills[0], 2, 4, 'YEET an ally over open floor');
    t.eq(stacks(m), 0, 'YEET of an ally that reaches no foe: nothing');
    fight({ heroes: [{ x: 1, y: 4, skills: ['mrw_yeet'] }, { id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    m = M();
    use(t, m, m.skills[0], 2, 4, 'YEET an ally into a foe');
    t.ok(stacks(m) === 1 && at(4, 4).hp === 14 - 6, 'YEET of an ally into a foe: the crash reaches it, +1');
    fight({ heroes: [{ x: 4, y: 4, skills: ['mrw_keg_stand'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    m = M();
    use(t, m, m.skills[0], 4, 4, 'Keg Stand splashing a foe');
    t.ok(stacks(m) === 1 && has(at(5, 4), 'wet'), 'a splash that reaches a foe counts: +1');
    fight({ enemies: [{ id: 'test_minion', x: 4, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], consumables: ['test_firebomb'] });
    m = M();
    setStacks(m, 4);
    let sg = surges(function () { t.ok(DD.Combat.useConsumable(m, 0, 4, 4), 'firebomb thrown'); });
    t.ok(sg.length === 0 && stacks(m) === 4, 'a consumable is not a skill: no gain, no surge');
    // filling the meter does not surge; the NEXT skill does (good wild magic + exactly 10 party Hype), then the meter resets
    fight({ enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    m = M();
    setStacks(m, 4);
    sg = surges(function () { use(t, m, m.basic, 3, 4, 'basic at 4'); });
    t.ok(sg.length === 0 && stacks(m) === 5, 'the skill that fills the meter does not surge (now 5)');
    t.ok(DD.Combat.state.log.some(function (l) { return /MAXIMUM MAGNIFICENCE/.test(l.text); }), 'the full meter is announced');
    let gains = [], dealt = [];
    sg = surges(function () { gains = hypeGains(function () { dealt = meleeDealt(function () { use(t, m, m.basic, 3, 4, 'basic at 5'); }); }); });
    t.ok(sg.length === 1 && sg[0].good === true && sg[0].source === 'mrw_magnificence', 'the NEXT skill unleashes one good surge');
    t.eq(surgeHype(gains), '10', '... and the party gains 10 Hype');
    t.eq(dealt.join(','), '4', 'the surging hit is a normal hit (5 − 1 armor)');
    t.eq(stacks(m), 1, 'the meter resets, then that hit adds 1');
    t.ok(DD.Combat.state.log.some(function (l) { return /MAGNIFICENT SURGE/.test(l.text); }), 'surge logged');
    // Ginger Rage at 5: it surges first, then its own +2 lands
    fight({ heroes: [{ x: 2, y: 4, skills: ['mrw_rage'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    m = M();
    setStacks(m, 5);
    sg = surges(function () { use(t, m, m.skills[0], 2, 4, 'Ginger Rage at 5'); });
    t.ok(sg.length === 1 && stacks(m) === 2, 'Ginger Rage at 5 surges, then gains its 2 (' + stacks(m) + ')');
    fight({ heroes: [{ x: 2, y: 4, skills: ['mrw_rage'] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    m = M();
    setStacks(m, 3);
    sg = surges(function () { use(t, m, m.skills[0], 2, 4, 'Ginger Rage at 3'); });
    t.ok(sg.length === 0 && stacks(m) === 5, 'Ginger Rage at 3: no surge yet, the meter is full');
    // the winning blow at 5: no surge after the victory (no banner, wild magic or Hype); the meter just stays full
    DD.Combat.sandbox({ w: 9, h: 9, seed: 7, enemyAi: false, heroes: [{ id: 'marwyn', x: 2, y: 4, level: 1 }], enemies: [{ id: 'test_minion', x: 3, y: 4, hpMult: 0.5 }] });
    m = M();
    setStacks(m, 5);
    gains = [];
    sg = surges(function () { gains = hypeGains(function () { use(t, m, m.basic, 3, 4, 'winning blow at 5'); }); });
    t.ok(DD.Combat.state.result === 'victory' && sg.length === 0 && stacks(m) === 5, 'winning blow at 5: victory, no surge');
    t.ok(!surgeHype(gains) && !DD.Combat.state.log.some(function (l) { return /MAGNIFICENT SURGE/.test(l.text); }), '... no surge Hype, nothing logged');
    // surges: always from the good table, varied, and picked with the combat RNG (same seed → same surge)
    let good = 0, n = 0;
    const ids = [];
    for (let i = 0; i < 40; i++) {
      fight({ seed: 100 + i, enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 6, y: 6 }] });
      const mm = M();
      setStacks(mm, 5);
      const e = DD.Marwyn.surge(mm, DD.Combat.state.rng);
      t.eq(e.length, 1, 'one effect per surge (seed ' + (100 + i) + ')');
      if (e[0]) { n++; ids.push(e[0].id); if (e[0].good === true) good++; }
      t.eq(stacks(mm), 0, 'a surge empties the meter (seed ' + (100 + i) + ')');
    }
    t.ok(n === 40 && good === 40, 'every surge is a good one (' + good + '/' + n + ')');
    t.ok(new Set(ids).size >= 6, 'and varied (' + new Set(ids).size + ' different)');
    t.log('surges: ' + good + '/' + n + ' good, ' + new Set(ids).size + ' different');
    fight({ seed: 104, enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 6, y: 6 }] });
    setStacks(M(), 5);
    t.eq(DD.Marwyn.surge(M(), DD.Combat.state.rng)[0].id, ids[4], 'deterministic per combat seed');
  });

  // ---- 3. basic + Cleave ---------------------------------------------------------------------------------
  T.suite('hero_marwyn: Ginger Snap and Glorious Cleave at every level', function (t) {
    fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let m = M();
    t.ok(!valid(m, m.basic, 4, 4) && valid(m, m.basic, 3, 4), 'basic: adjacent foes only');
    use(t, m, m.basic, 3, 4, 'basic');
    t.ok(foes()[0].hp === 9 && m.ap === 2 && m.basic.cd === 0, 'basic: 5 damage, 1 AP, no cooldown');
    [5, 6, 7].forEach(function (dmg, i) {
      const lv = i + 1;
      fight({ enemies: [{ id: 'test_grunt', x: 3, y: 3 }, { id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }, { id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 1, y: 4 }] });
      m = M();
      const top = at(3, 3), mid = at(3, 4), bot = at(3, 5), behind = at(4, 4), back = at(1, 4);
      const sl = give(m, 'mrw_cleave', lv);
      use(t, m, sl, 3, 4, 'Cleave L' + lv);
      if (lv < 3) {
        t.ok(top.hp === 14 - dmg && mid.hp === 14 - dmg && bot.hp === 14 - dmg && behind.hp === 14, 'Cleave L' + lv + ': ' + dmg + ' to each of the 3 in front, not behind');
        t.ok(top.x === 3 && mid.x === 3 && bot.x === 3, 'Cleave L' + lv + ': no knockback');
      } else {
        t.ok(top.hp === 7 && bot.hp === 7 && top.x === 4 && bot.x === 4, 'Cleave III: 7 damage and knocked back 1');
        t.ok(mid.x === 3 && mid.hp === 14 - 7 - 3 && behind.hp === 11, 'Cleave III: the middle one bumps into the foe behind (3 each)');
      }
      t.eq(back.hp, 14, 'nothing behind Marwyn');
      t.ok(m.ap === 1 && sl.cd === 1, 'Cleave: 2 AP, cooldown 1');
      t.eq(stacks(m), 1, 'one MAGNIFICENCE per skill, however many it hits');
      DD.Combat.endTurn();
      t.eq(DD.Combat.canUse(m, sl), 'On cooldown (1).', 'Cleave: blocked on his next turn');
      DD.Combat.endTurn();
      t.eq(sl.cd, 0, 'Cleave: ready again the turn after');
    });
  });

  // ---- 4. LOOK AT MARWYN! ---------------------------------------------------------------------------------------
  T.suite('hero_marwyn: LOOK AT MARWYN! at every level (Taunt works on the foes\' own turns)', function (t) {
    [[4, 2, 2], [6, 2, 2], [8, 3, 4]].forEach(function (e, i) {
      const lv = i + 1;
      fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 2 }, { id: 'test_grunt', x: 5, y: 3 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_grunt', x: 4, y: 7 }, { id: 'test_grunt', x: 8, y: 8 }] });
      const m = M();
      const sl = give(m, 'mrw_war_cry', lv);
      use(t, m, sl, 4, 4, 'War Cry L' + lv);
      t.eq(m.block, e[0], 'War Cry L' + lv + ': ' + e[0] + ' Block');
      const taunted = foes().filter(function (f) { return has(f, 'taunt') && st(f, 'taunt').source === m.id; });
      t.eq(taunted.length, e[2], 'War Cry L' + lv + ': the ' + e[2] + ' foes within ' + e[1] + ' are Taunted');
      t.ok(taunted.every(function (f) { return DD.Grid.dist(f, m) <= e[1]; }), 'nobody beyond the radius');
      t.ok(m.ap === 2 && sl.cd === 2, 'War Cry: 1 AP, cooldown 2');
      t.eq(stacks(m), 1, 'the audience is worth 1 MAGNIFICENCE');
    });
    // a grunt stands between Marwyn and a wounded mage; on its turn it finishes the mage, unless Marwyn shouted first
    function brawl(shout) {
      fight({ ai: true, heroes: [{ x: 2, y: 4, skills: ['mrw_war_cry'] }, { id: 'test_mage', x: 4, y: 4, hp: 3 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      const m = M(), mage = hero('test_mage'), g = at(3, 4);
      if (shout) use(t, m, m.skills[0], 2, 4, 'War Cry before the grunt acts');
      let blockOnItsTurn = -1;
      const off = DD.Events.on('turn:start', function (ev) { if (ev.unit === g) blockOnItsTurn = m.block; });
      let hits = {};
      try { hits = hitsTaken(function () { DD.Combat.endRound(); }); } finally { off(); }
      return { m: m, mage: mage, g: g, hits: hits, block: blockOnItsTurn };
    }
    const calm = brawl(false), loud = brawl(true);
    t.ok(calm.hits[calm.mage.id] > 0, 'control: without the shout the grunt goes for the wounded mage');
    t.ok(!loud.hits[loud.mage.id] && loud.mage.hp === 3, 'Taunted: on its turn it leaves the mage alone');
    t.eq(loud.hits[loud.m.id], 4, '... and stabs Marwyn instead');
    t.ok(loud.block === 4 && loud.m.hp === loud.m.maxHp, 'his Block still stood on the grunt\'s turn and ate the stab');
    t.ok(DD.Combat.current() === loud.m && DD.Combat.state.round === 2 && loud.m.block === 0, 'his own next turn: the Block is gone');
    t.ok(!has(loud.g, 'taunt'), 'the Taunt ended with the grunt\'s turn');
  });

  // ---- 5. YEET -----------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: YEET at every level (walls, units, edges, pits, lava, water, allies, push hooks)', function (t) {
    [{ push: 3, crash: 6 }, { push: 3, crash: 8 }, { push: 4, crash: 10 }].forEach(function (lv, i) {
      const n = i + 1;
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
      let m = M(), g = at(2, 4), sl = give(m, 'mrw_yeet', n);
      t.ok(new RegExp(' ' + lv.push + ' tiles away.* ' + lv.crash + ' damage').test(DD.skillDesc(DD.getSkill('mrw_yeet'), n, m)), 'YEET L' + n + ': desc says ' + lv.push + ' tiles and ' + lv.crash + ' damage');
      use(t, m, sl, 2, 4, 'YEET L' + n + ' open');
      t.ok(g.x === 2 + lv.push && g.hp === 14, 'YEET L' + n + ': thrown ' + lv.push + ' tiles, no damage on open floor');
      t.ok(m.ap === 1 && sl.cd === 2, 'YEET: 2 AP, cooldown 2');
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
      setT(4, 4, 'wall');
      m = M(); g = at(2, 4); sl = give(m, 'mrw_yeet', n);
      use(t, m, sl, 2, 4, 'YEET L' + n + ' wall');
      t.ok(g.x === 3 && g.hp === 14 - lv.crash, 'YEET L' + n + ': crash into a wall: ' + lv.crash + ' damage');
      t.ok(!has(g, 'stun'), 'YEET L' + n + ': no extra rider (no Stun)');
      fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
      m = M(); g = at(2, 4); sl = give(m, 'mrw_yeet', n);
      const other = at(5, 4);
      use(t, m, sl, 2, 4, 'YEET L' + n + ' unit');
      t.ok(g.x === 4 && g.hp === 14 - lv.crash && other.hp === 14 - lv.crash, 'YEET L' + n + ': both take ' + lv.crash + ' in a unit crash');
    });
    fight({ heroes: [{ x: 6, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    let m = M(), sl = give(m, 'mrw_yeet', 1);
    use(t, m, sl, 7, 4, 'YEET edge');
    t.ok(foes()[0].x === 8 && foes()[0].hp === 8, 'map edge: a crash after 1 tile');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
    m = M(); sl = give(m, 'mrw_yeet', 1);
    use(t, m, sl, 2, 4, 'YEET barrel');
    t.ok(!tile(4, 4).obj && dead('test_grunt') === 1 && DD.Combat.state.hype === 20, 'crash into an explosive barrel: KABOOM, environmental kill');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    setT(4, 4, 'pit');
    m = M(); sl = give(m, 'mrw_yeet', 1);
    use(t, m, sl, 2, 4, 'YEET pit');
    t.ok(dead('test_grunt') === 1 && DD.Combat.state.hype === 20 && stacks(m) === 1, 'pit: YEETED, +20 Hype, +1 MAGNIFICENCE');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    setT(3, 4, 'lava');
    m = M(); sl = give(m, 'mrw_yeet', 1);
    use(t, m, sl, 2, 4, 'YEET lava');
    t.ok(foes()[0].x === 5 && foes()[0].hp === 6 && has(foes()[0], 'burn'), 'lava on the way: 8 fire + Burn');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    setT(5, 4, 'water');
    m = M(); sl = give(m, 'mrw_yeet', 1);
    use(t, m, sl, 2, 4, 'YEET water');
    t.ok(foes()[0].x === 5 && has(foes()[0], 'wet'), 'water: lands Wet (a setup for lightning)');
    // friend or foe; immovable and empty tiles are not targets; bosses climb out of pits
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 0 }] });
    m = M(); sl = give(m, 'mrw_yeet', 1);
    t.ok(valid(m, sl, 2, 4), 'allies can be YEETed');
    use(t, m, sl, 2, 4, 'YEET ally');
    t.ok(hero('test_knight').x === 5 && hero('test_knight').hp === hero('test_knight').maxHp, 'the knight flies 3 tiles, unhurt on open floor');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_brute', x: 2, y: 4 }, { id: 'test_boss', x: 1, y: 5 }] });
    m = M(); sl = give(m, 'mrw_yeet', 1);
    t.ok(!valid(m, sl, 2, 4), 'immovable foes are not valid targets');
    t.ok(/Too heavy/.test(String(DD.getSkill('mrw_yeet').target.canTarget(DD.Targeting.buildCtx(m, sl, { x: 2, y: 4 })))), '... with a reason');
    t.ok(!valid(m, sl, 1, 3) && !valid(m, sl, 0, 4), 'empty tiles are not valid targets');
    setT(1, 7, 'pit');
    use(t, m, sl, 1, 5, 'YEET boss');
    const b = foes().filter(function (u) { return u.defId === 'test_boss'; })[0];
    t.ok(b && !b.dead && b.hp === b.maxHp - Math.ceil(b.maxHp * 0.25), 'bosses climb out of the pit (−25%)');
    // HUD area = the flight path: the thrown unit, its path and the crash tile
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 4, y: 4 }] });
    m = M(); sl = give(m, 'mrw_yeet', 1);
    t.eq(keys(DD.Targeting.buildCtx(m, sl, { x: 2, y: 4 }).tiles), '2,4 3,4 4,4', 'area shows the thrown unit, its path and the crash tile');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }], terrain: function (tl) { if (tl.y === 4 && tl.x >= 3) tl.t = 'ice'; } });
    m = M(); sl = give(m, 'mrw_yeet', 1);
    const iceArea = keys(DD.Targeting.buildCtx(m, sl, { x: 2, y: 4 }).tiles);
    use(t, m, sl, 2, 4, 'YEET on ice');
    t.eq(iceArea, '2,4 3,4 4,4 5,4 6,4', 'ice: the area includes the slide tile');
    t.eq(foes()[0].x, 6, '... where the unit really lands (3 + 1 slide)');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }],
      terrain: function (tl) { if (tl.y === 4 && tl.x === 5) tl.t = 'ice'; } });
    m = M(); sl = give(m, 'mrw_yeet', 1);
    const slideCrash = keys(DD.Targeting.buildCtx(m, sl, { x: 2, y: 4 }).tiles);
    use(t, m, sl, 2, 4, 'YEET slide into a unit');
    t.ok(slideCrash === '2,4 3,4 4,4 5,4 6,4' && at(5, 4) && at(5, 4).hp === 8 && at(6, 4).hp === 8, 'a slide that ends in a crash: shown, and both take 6');
    // push hooks (items such as Barrel Armor): the HUD path asks the same modifyPush hooks the real throw does
    fight({ heroes: [{ x: 1, y: 4 }, { id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 0 }] });
    A().addRule({ id: 'mrw_rule_roll', name: 'Rolling', hooks: { modifyPush: function (p) { if (p.unit && p.unit.defId === 'test_knight') p.dist += 1; } } });
    m = M(); sl = give(m, 'mrw_yeet', 1);
    const push0 = DD.FX.push;
    const rolled = keys(DD.Targeting.buildCtx(m, sl, { x: 2, y: 4 }).tiles);
    t.ok(DD.FX.push === push0 && !DD.Act.simulating, 'the HUD query asked the hooks quietly and put FX / logs back');
    use(t, m, sl, 2, 4, 'YEET with a +1 push hook');
    t.ok(rolled === '2,4 3,4 4,4 5,4 6,4' && hero('test_knight').x === 6, 'a modifyPush hook (+1) shows in the HUD path and in the landing (' + rolled + ')');
    A().removeRule('mrw_rule_roll');
  });

  // the engine hook added by hero-marwyn's v1 core fix (Marwyn no longer uses it; Barrel Armor and the kit do): keep it honest
  T.suite('hero_marwyn: modifyPush core hook (regression: cancel, lengthen, payload, immovable first)', function (t) {
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    const g = at(2, 4);
    A().addRule({ id: 'mrw_rule_push', name: 'Sticky', hooks: { modifyPush: function (p) {
      if (p.unit && p.unit.defId === 'test_grunt') { if (p.dist === 1) p.cancel = true; else p.dist += 1; }
    } } });
    let r = A().push(M(), g, EAST, 1);
    t.ok(r.moved === 0 && g.x === 2 && g.hp === 14, 'cancel stops the push (no bump)');
    r = A().push(M(), g, EAST, 2);
    t.ok(r.moved === 3 && g.x === 5, 'dist can grow too');
    A().removeRule('mrw_rule_push');
    let seen = null;
    A().addRule({ id: 'mrw_rule_spy', name: 'Spy', hooks: { modifyPush: function (p) { seen = p; } } });
    A().push(M(), g, EAST, 1);
    t.ok(seen && seen.unit === g && seen.src === M() && seen.dir.x === 1 && seen.dist === 1 && seen.cancel === false, 'payload { unit, src, dir, dist, cancel }');
    t.ok(M().x === 1 && A().push(g, M(), { x: -1, y: 0 }, 1).moved === 1 && M().x === 0, 'Marwyn himself is pushed the full distance (v2: no push resistance)');
    seen = null;
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_brute', x: 2, y: 4 }] });
    A().addRule({ id: 'mrw_rule_spy2', name: 'Spy', hooks: { modifyPush: function (p) { seen = p; } } });
    A().push(M(), foes()[0], EAST, 2);
    t.eq(seen, null, 'immovable is decided before the hook');
  });

  // ---- 6. Use Your Head ----------------------------------------------------------------------------------------
  T.suite('hero_marwyn: Use Your Head at every level (Stun: the foe loses exactly its next turn)', function (t) {
    [[7, 3], [8, 3], [10, 2]].forEach(function (e, i) {
      const n = i + 1;
      fight({ ai: true, enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      const m = M(), g = at(3, 4), sl = give(m, 'mrw_headbutt', n);
      use(t, m, sl, 3, 4, 'Headbutt L' + n);
      t.eq(g.hp, 14 - e[0], 'Headbutt L' + n + ': ' + e[0] + ' damage');
      t.ok(has(g, 'stun') && st(g, 'stun').turns === 1, 'Headbutt: Stunned for its next turn');
      t.ok(m.hp === m.maxHp - 2 && m.ap === 1, 'Headbutt: 2 AP + 2 HP');
      t.eq(sl.cd, e[1], 'Headbutt L' + n + ': cooldown ' + e[1]);
      DD.Combat.endTurn();
      t.ok(m.hp === m.maxHp - 2 && !has(g, 'stun') && DD.Combat.state.round === 2, 'its turn passed without a stab; the Stun ended with it');
      DD.Combat.endTurn();
      t.eq(m.hp, m.maxHp - 2 - 4, 'exactly one lost turn: it stabs on the next one');
    });
    fight({ heroes: [{ x: 2, y: 4, hp: 1 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    t.eq(DD.Combat.canUse(M(), give(M(), 'mrw_headbutt', 1)), 'Not enough HP.', 'Headbutt needs HP to spare');
    // the combo with boss wind-ups (DESIGN §9): a Stun interrupts one at once
    fight({ ai: true, heroes: [{ x: 2, y: 4, skills: ['mrw_headbutt'] }], enemies: [{ id: 'test_boss', x: 3, y: 4 }] });
    const boss = foes()[0], m = M();
    DD.AI.windUp(boss, 'test_boss_meteor', m, { label: 'Meteor of Regression' });
    t.eq(boss.intents.length, 1, 'setup: the boss winds up a meteor on Marwyn');
    use(t, m, m.skills[0], 3, 4, 'Headbutt the boss');
    t.ok(boss.intents.length === 0 && has(boss, 'stun'), 'the Stun interrupts the wind-up at once');
    const hp0 = m.hp;
    DD.Combat.endTurn();
    t.eq(m.hp, hp0, 'no meteor, no slam: the boss lost its turn');
  });

  // ---- 7. Hero Landing -------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: Hero Landing at every level (leap, Taunt the foes next to him)', function (t) {
    [3, 4, 5].forEach(function (leap, i) {
      const n = i + 1;
      fight({ heroes: [{ x: 0, y: 4 }], enemies: [{ id: 'test_grunt', x: leap + 1, y: 4 }, { id: 'test_grunt', x: leap, y: 3 }, { id: 'test_grunt', x: leap + 2, y: 4 }, { id: 'test_archer', x: 8, y: 0 }] });
      const m = M(), sl = give(m, 'mrw_hero_landing', n);
      const nextA = at(leap + 1, 4), nextB = at(leap, 3), farC = at(leap + 2, 4), archer = at(8, 0);
      t.ok(valid(m, sl, leap, 4), 'L' + n + ': a free tile ' + leap + ' away');
      t.ok(!valid(m, sl, leap + 1, 4) && !valid(m, sl, leap, 5) && !valid(m, sl, 0, 4), 'L' + n + ': not onto a unit, not beyond ' + leap + ', not his own tile');
      use(t, m, sl, leap, 4, 'Hero Landing L' + n);
      t.ok(m.x === leap && m.y === 4, 'L' + n + ': leaps ' + leap + ' tiles');
      t.ok([nextA, nextB].every(function (f) { return has(f, 'taunt') && st(f, 'taunt').source === m.id; }), 'L' + n + ': the foes next to where he lands are Taunted');
      t.ok(!has(farC, 'taunt') && !has(archer, 'taunt'), 'foes further away are not');
      t.ok(m.ap === 1 && sl.cd === 2 && m.block === 0, 'Hero Landing: 2 AP, cooldown 2, nothing else');
      t.eq(stacks(m), 1, '+1 MAGNIFICENCE');
    });
    // never into lava, fire or a pit; rooted = no leap
    fight({ heroes: [{ x: 0, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    let m = M(), sl = give(m, 'mrw_hero_landing', 1);
    setT(3, 4, 'lava'); setT(2, 3, 'pit');
    A().setSurface(1, 5, 'fire', 3);
    t.ok(!valid(m, sl, 3, 4) && !valid(m, sl, 2, 3) && !valid(m, sl, 1, 5) && valid(m, sl, 2, 5) && valid(m, sl, 1, 4), 'never into lava, a pit or fire');
    const why = DD.getSkill('mrw_hero_landing').target.canTarget(DD.Targeting.buildCtx(m, sl, { x: 3, y: 4 }));
    t.ok(/THAT/.test(String(why)), 'with a reason: ' + why);
    A().addStatus(m, 'root', { turns: 1 });
    t.ok(/Rooted/.test(String(DD.Combat.canUse(m, sl))), 'rooted: no leaping');
    // v2: the landing's Taunt saves the wounded mage from the grunt's turn
    fight({ ai: true, heroes: [{ x: 0, y: 4, skills: ['mrw_hero_landing'] }, { id: 'test_mage', x: 4, y: 5, hp: 3 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    m = M();
    const mage = hero('test_mage');
    use(t, m, m.skills[0], 3, 4, 'Hero Landing next to the grunt');
    const hits = hitsTaken(function () { DD.Combat.endRound(); });
    t.ok(!hits[mage.id] && hits[m.id] === 4, 'on its turn the Taunted grunt stabs Marwyn, not the wounded mage');
  });

  // ---- 8. Gun Show ---------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: Gun Show at every level (Root the audience, Thorns)', function (t) {
    [2, 3, 4].forEach(function (th, i) {
      const n = i + 1;
      fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 4, y: 6 }] });
      const m = M(), sl = give(m, 'mrw_gun_show', n);
      use(t, m, sl, 4, 4, 'Gun Show L' + n);
      t.ok(has(at(5, 4), 'root') && has(at(4, 3), 'root') && st(at(5, 4), 'root').source === m.id, 'Gun Show L' + n + ': every adjacent foe is Rooted');
      t.ok(!has(at(4, 6), 'root'), 'a foe 2 tiles away is not');
      t.ok(st(m, 'thorns') && st(m, 'thorns').stacks === th, 'Gun Show L' + n + ': Thorns ' + th);
      t.ok(m.ap === 2 && sl.cd === 2 && m.block === 0, 'Gun Show: 1 AP, cooldown 2, no Block');
      t.eq(stacks(m), 1, '+1 MAGNIFICENCE');
    });
    // v2: the Rooted grunt can't walk over to the wounded mage, so it stabs Marwyn and eats the Thorns
    fight({ ai: true, heroes: [{ x: 4, y: 4, skills: [{ id: 'mrw_gun_show', level: 1 }] }, { id: 'test_mage', x: 7, y: 4, hp: 3 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    const m = M(), mage = hero('test_mage'), g = at(5, 4);
    use(t, m, m.skills[0], 4, 4, 'Gun Show');
    const hits = hitsTaken(function () { DD.Combat.endRound(); });
    t.ok(g.x === 5 && g.y === 4 && !hits[mage.id], 'Rooted: the grunt stayed put and never reached the mage');
    t.ok(hits[m.id] === 4 && g.hp === 14 - 2, 'it stabbed Marwyn and took Thorns 2 back');
    t.ok(!has(g, 'root'), 'the Root ended with the grunt\'s turn');
    t.ok(DD.Combat.current() === m && st(m, 'thorns') && st(m, 'thorns').turns === 1, 'the Thorns last through his next turn');
    m.ap = 0;
    DD.Combat.endTurn();
    t.ok(!has(m, 'thorns'), '... and end with it');
  });

  // ---- 9. Ginger Rage ---------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: Ginger Rage at every level', function (t) {
    [2, 3, 4].forEach(function (red, i) {
      const n = i + 1;
      fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
      const m = M(), g = foes()[0], sl = give(m, 'mrw_rage', n);
      use(t, m, sl, 4, 4, 'Rage L' + n);
      t.ok(st(m, 'mrw_rage') && st(m, 'mrw_rage').stacks === red, 'Rage L' + n + ': −' + red + ' per hit');
      t.eq(stacks(m), 2, 'Rage L' + n + ': +2 MAGNIFICENCE');
      t.ok(m.ap === 2 && sl.cd === 3, 'Rage: 1 AP, cooldown 3');
      let hp = m.hp;
      A().damage(g, m, 6);
      t.eq(hp - m.hp, 6 - red, 'Rage: a 6-damage hit deals ' + (6 - red));
      hp = m.hp;
      A().damage(g, m, 5, { cause: 'bump' });
      t.eq(hp - m.hp, 5 - red, 'Rage: bumps count as hits');
      hp = m.hp;
      A().damage(g, m, 2, { cause: 'status' });
      t.eq(hp - m.hp, 2, 'Rage: status damage is not reduced');
      hp = m.hp;
      A().damage(g, m, 1);
      t.eq(hp - m.hp, 0, 'Rage: small hits are fully absorbed');
      DD.Combat.endTurn();
      t.ok(has(m, 'mrw_rage') && DD.Combat.state.round === 2, 'still raging through his next turn');
      DD.Combat.endTurn();
      t.ok(!has(m, 'mrw_rage'), 'gone once that turn ended');
    });
  });

  // ---- 10. Center of Attention -------------------------------------------------------------------------------------
  T.suite('hero_marwyn: Center of Attention at every level (pull the crowd in, Taunt it)', function (t) {
    [[3, 2], [4, 2], [4, 3]].forEach(function (e, i) {
      const n = i + 1;
      fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 1 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 0, y: 4 }, { id: 'test_grunt', x: 0, y: 0 }] });
      const m = M(), sl = give(m, 'mrw_magnetism', n);
      const north = at(4, 1), diag = at(6, 5), close = at(5, 4), west = at(0, 4), far = at(0, 0);
      use(t, m, sl, 4, 4, 'Magnetism L' + n);
      t.ok(north.x === 4 && north.y === 3, 'Magnetism L' + n + ': north foe pulled next to him');
      t.ok(diag.x === 4 && diag.y === 5, 'Magnetism L' + n + ': off-axis foe pulled along its long axis');
      t.ok(close.x === 5 && close.y === 4, 'adjacent foe stays put');
      t.eq(west.x, e[0] === 3 ? 0 : 4 - (e[1] === 3 ? 1 : 2), 'Magnetism L' + n + ': the foe 4 tiles west ' + (e[0] === 3 ? 'is out of range' : 'is pulled ' + e[1]));
      t.ok([north, diag, close].every(function (f) { return has(f, 'taunt') && st(f, 'taunt').source === m.id; }) && has(west, 'taunt') === (e[0] >= 4), 'everybody in range is Taunted');
      t.ok(far.x === 0 && far.y === 0 && !has(far, 'taunt'), 'out of range: untouched');
      t.ok(m.ap === 0 && sl.cd === 3, 'Magnetism: 3 AP, cooldown 3');
      t.eq(stacks(m), 1, '+1 MAGNIFICENCE (once)');
      t.ok(foes().every(function (f) { return f.hp === 14; }), 'no collisions, no damage');
    });
    // gathered for a payoff: a Cleave hits the 3 foes it pulled into a row
    fight({ heroes: [{ x: 4, y: 4, skills: [{ id: 'mrw_magnetism', level: 2 }, 'mrw_cleave'] }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }, { id: 'test_grunt', x: 7, y: 3 }, { id: 'test_grunt', x: 7, y: 5 }] });
    let m = M();
    use(t, m, m.skills[0], 4, 4, 'Magnetism II, then...');
    t.ok(at(5, 4) && at(5, 3) && at(5, 5), 'three foes lined up in front of him (' + keys(foes()) + ')');
    m.ap = 2;
    use(t, m, m.skills[1], 5, 4, '... Glorious Cleave');
    t.ok(foes().every(function (f) { return f.hp === 14 - 5; }), 'the Cleave hits all three');
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 1 }, { id: 'test_grunt', x: 8, y: 8 }] });
    m = M();
    let sl = give(m, 'mrw_magnetism', 1);
    setT(4, 2, 'pit');
    use(t, m, sl, 4, 4, 'Magnetism into a pit');
    t.ok(dead('test_grunt') === 1 && DD.Combat.state.hype === 20, 'pulled into a pit: environmental kill');
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 1 }] });
    m = M(); sl = give(m, 'mrw_magnetism', 1);
    A().addStatus(m, 'silenced', { turns: 1 });
    t.eq(DD.Combat.canUse(m, sl), 'Silenced!', 'Magnetism is wild magic: Silence blocks it');
    A().removeStatus(m, 'silenced');
    m.ap = 2;
    t.eq(DD.Combat.canUse(m, sl), 'Not enough AP.', 'Magnetism needs all 3 AP');
  });

  // ---- 11. Keg Stand ---------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: Keg Stand at every level (heal, water, Wet sets up lightning)', function (t) {
    [[4, 1], [6, 1], [8, 2]].forEach(function (e, i) {
      const n = i + 1;
      fight({ heroes: [{ x: 4, y: 4, hp: 20 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }] });
      const m = M(), sl = give(m, 'mrw_keg_stand', n);
      A().setSurface(4, 3, 'fire', 3);
      setT(3, 4, 'lava');
      use(t, m, sl, 4, 4, 'Keg Stand L' + n);
      t.eq(m.hp, 20 + e[0], 'Keg Stand L' + n + ': heals ' + e[0]);
      t.ok(tile(5, 4).surface && tile(5, 4).surface.id === 'water' && has(at(5, 4), 'wet'), 'a puddle under the adjacent foe: Wet');
      t.eq(has(at(4, 6), 'wet'), e[1] >= 2, 'Keg Stand L' + n + ': radius ' + e[1]);
      t.ok(tile(4, 3).surface && tile(4, 3).surface.id === 'water', 'fire goes out (now a puddle)');
      t.eq(tile(3, 4).t, 'obsidian', 'lava cools into obsidian');
      t.ok(has(m, 'wet'), 'Marwyn is moist');
      t.ok(m.ap === 2 && sl.cd === 1 && sl.uses === 1, 'Keg Stand: 1 AP, cooldown 1, uses a charge');
    });
    // the setup: the next lightning hit on a Wet foe deals +50%
    fight({ heroes: [{ x: 4, y: 4, skills: ['mrw_keg_stand'] }, { id: 'test_mage', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 7, y: 7, hpMult: 3 }] });
    let m = M();
    use(t, m, m.skills[0], 4, 4, 'Keg Stand');
    const wet = at(5, 4), dry = at(7, 7), mage = hero('test_mage');
    t.eq(A().damage(mage, wet, 6, { element: 'lightning' }) - A().damage(mage, dry, 6, { element: 'lightning' }), 3, 'lightning on the Wet foe: 9 instead of 6');
    fight({ heroes: [{ x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    m = M();
    const sl = give(m, 'mrw_keg_stand', 1);
    use(t, m, sl, 4, 4, 'keg 1');
    DD.Combat.endTurn();
    t.eq(DD.Combat.canUse(m, sl), 'On cooldown (1).', 'cooldown 1: not on his next turn');
    DD.Combat.endTurn();
    use(t, m, sl, 4, 4, 'keg 2');
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.eq(DD.Combat.canUse(m, sl), 'No charges left.', 'only 2 kegs per fight');
  });

  // ---- 12. signature ---------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: BEHOLD, MARWYN! (signature: every foe Taunted, 15 Block)', function (t) {
    fight({ ai: true, heroes: [{ x: 1, y: 4 }, { id: 'test_mage', x: 3, y: 1, hp: 3 }],
      enemies: [{ id: 'test_grunt', x: 4, y: 1 }, { id: 'test_grunt', x: 2, y: 4 }, { id: 'test_archer', x: 8, y: 6 }] });
    const s = DD.Combat.state, m = M(), sl = m.signature, mage = hero('test_mage');
    t.eq(DD.Combat.canUse(m, sl), 'Needs 100 Hype.', 'needs 100 Hype');
    s.hype = 100;
    t.ok(valid(m, sl, 1, 4) && DD.Targeting.validTargets(m, sl).length === 1, 'targets: himself');
    t.eq(keys(DD.Targeting.buildCtx(m, sl, { x: 1, y: 4 }).tiles.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; })), '4,1 2,4 8,6', 'its area: every foe on the board');
    use(t, m, sl, 1, 4, 'BEHOLD');
    t.ok(foes().every(function (f) { return has(f, 'taunt') && st(f, 'taunt').source === m.id; }), 'EVERY enemy is Taunted (even the far archer)');
    t.ok(m.block === 15 && s.hype === 0 && m.ap === 1, '15 Block; 100 Hype and 2 AP spent');
    t.eq(stacks(m), 1, '+1 MAGNIFICENCE');
    t.ok(s.log.some(function (l) { return /unleashes BEHOLD, MARWYN!/.test(l.text); }), 'signature logged');
    const hits = hitsTaken(function () { DD.Combat.endRound(); });
    t.ok(!hits[mage.id] && mage.hp === 3, 'on their turns nobody touches the wounded mage next to a grunt');
    t.ok(hits[m.id] >= 4 && m.hp === m.maxHp, 'they go for Marwyn, and his Block eats it (' + hits[m.id] + ')');
    fight({ heroes: [{ x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    const m2 = M();
    DD.Combat.state.hype = 100;
    setStacks(m2, 5);
    const sg = surges(function () { use(t, m2, m2.signature, 1, 4, 'BEHOLD at 5'); });
    t.ok(sg.length === 1 && stacks(m2) === 1, 'at 5 MAGNIFICENCE it surges, then adds its own 1');
  });

  // ---- 13. items --------------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: items (gauntlets, loincloth, hand mirror)', function (t) {
    fight({ heroes: [{ x: 1, y: 4, items: ['mrw_yeet_gauntlets'] }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    let m = M();
    t.ok(m.items.indexOf('mrw_yeet_gauntlets') >= 0 && Math.abs(m.dmgBonus - 0.05) < 1e-9, 'gauntlets equipped (+5% damage)');
    const yeet = DD.getSkill('mrw_yeet');
    t.ok(/ 5 tiles away/.test(DD.skillDesc(yeet, 1, m)) && / 3 tiles away/.test(DD.skillDesc(yeet, 1, null)), 'YEET desc shows the extra 2 tiles for him (base without a user)');
    const ysl = give(m, 'mrw_yeet', 1);
    t.eq(DD.Targeting.buildCtx(m, ysl, { x: 2, y: 4 }).tiles.length, 6, 'the HUD flight path shows the extra tiles too');
    use(t, m, ysl, 2, 4, 'YEET + gauntlets');
    t.ok(foes()[0].x === 7 && foes()[0].hp === 14, 'thrown 5 tiles');
    fight({ heroes: [{ x: 1, y: 4, items: ['mrw_yeet_gauntlets'] }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }] });
    setT(6, 4, 'wall');
    m = M();
    use(t, m, give(m, 'mrw_yeet', 1), 2, 4, 'YEET + gauntlets (wall)');
    t.ok(foes()[0].x === 5 && foes()[0].hp === 14 - 6, 'the crash is the usual 6');
    // loincloth
    fight({ heroes: [{ x: 4, y: 4, items: ['mrw_loincloth'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 5 }] });
    m = M();
    t.eq(m.maxHp, 35 + 6, 'loincloth: +6 max HP');
    const g1 = at(5, 4), g2 = at(4, 5);
    let hp = m.hp;
    A().damage(g1, m, 4);
    t.eq(hp - m.hp, 4, 'untaunted: full damage');
    A().addStatus(g1, 'taunt', { turns: 1 }, m);
    A().addStatus(g2, 'taunt', { turns: 1 }, g1);
    hp = m.hp;
    A().damage(g1, m, 4);
    t.eq(hp - m.hp, 3, 'taunted by Marwyn: 25% less (4 → 3)');
    hp = m.hp;
    A().damage(g2, m, 4);
    t.eq(hp - m.hp, 4, 'taunted by someone else: full damage');
    // mirror: two different good effects per surge, still 10 Hype; nothing at combat start
    fight({ heroes: [{ x: 4, y: 4, items: ['mrw_hand_mirror'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    t.eq(stacks(M()), 0, 'mirror: no head start (nothing at combat start)');
    let pairs = 0;
    for (let i = 0; i < 12; i++) {
      fight({ seed: 300 + i, heroes: [{ x: 4, y: 4, items: ['mrw_hand_mirror'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
      m = M();
      setStacks(m, 5);
      let e = [];
      const gains = hypeGains(function () { e = DD.Marwyn.surge(m, DD.Combat.state.rng); });
      if (e.length === 2 && e[0].id !== e[1].id && e.every(function (x) { return x.good === true; })) pairs++;
      t.eq(surgeHype(gains), '10', 'mirror: still 10 Hype per surge (seed ' + (300 + i) + ')');
    }
    t.eq(pairs, 12, 'mirror: every surge unleashes two different good effects');
    fight({ heroes: [{ x: 2, y: 4, items: ['mrw_hand_mirror'] }], enemies: [{ id: 'test_brute', x: 3, y: 4 }] });
    m = M();
    setStacks(m, 5);
    const sg = surges(function () { use(t, m, m.basic, 3, 4, 'basic at 5 with the mirror'); });
    t.eq(sg.length, 2, 'a real surge with the mirror: two wild magic effects');
    // review fix: when the first effect wins the fight, the second is skipped (no duck summoned after the victory)
    DD.Combat.sandbox({ w: 9, h: 9, seed: 7, enemyAi: false, heroes: [{ id: 'marwyn', x: 2, y: 4, level: 1, items: ['mrw_hand_mirror'] }], enemies: [{ id: 'test_grunt', x: 6, y: 4, hpMult: 0.3 }] });
    m = M();
    setStacks(m, 5);
    const WM = DD.WildMagic, pool0 = WM.pool, rng = DD.Combat.state.rng;
    const ownWeighted = Object.prototype.hasOwnProperty.call(rng, 'weighted'), weighted0 = rng.weighted;
    const wm = function (id) { return WM.list().filter(function (d) { return d.id === id; })[0]; };
    WM.pool = function () { return [wm('wm_smite'), wm('wm_duck')]; };
    rng.weighted = function (list) { return list[0]; };
    let won = [];
    try { won = DD.Marwyn.surge(m, rng); } finally { WM.pool = pool0; if (ownWeighted) rng.weighted = weighted0; else delete rng.weighted; }
    t.ok(DD.Combat.state.result === 'victory' && won.length === 1 && won[0].id === 'wm_smite', 'mirror: Smite wins the fight, so the second effect is skipped (' + won.map(function (e) { return e.id; }) + ')');
    t.ok(!DD.Combat.state.units.some(function (u) { return u.defId === 'wm_duck'; }), '... no duck appears after the victory');
    // review v2 (pass 2): when the first effect takes the second one's target away (BEES! finishes the last non-boss foe
    // while the boss stands, so Baa-d Luck has nobody to turn into a sheep), the mirror rolls another good effect that
    // still applies, and the banner names the two that went off
    fight({ heroes: [{ x: 2, y: 4, items: ['mrw_hand_mirror'] }], enemies: [{ id: 'test_boss', x: 8, y: 8 }, { id: 'test_minion', x: 4, y: 4, hpMult: 0.2 }] });
    m = M();
    setStacks(m, 5);
    const minion = at(4, 4), rng2 = DD.Combat.state.rng, banner0 = DD.FX.banner;
    const own2 = Object.prototype.hasOwnProperty.call(rng2, 'weighted'), weighted2 = rng2.weighted;
    let firstPool = true, ban = null, two = [];
    WM.pool = function () { if (firstPool) { firstPool = false; return [wm('wm_bees'), wm('wm_baa')]; } return pool0.apply(WM, arguments); };
    rng2.weighted = function (list) { return list[0]; };
    DD.FX.banner = function () { const ev = banner0.apply(this, arguments); if (!ban) ban = ev; return ev; };
    try { two = DD.Marwyn.surge(m, rng2); } finally { WM.pool = pool0; DD.FX.banner = banner0; if (own2) rng2.weighted = weighted2; else delete rng2.weighted; }
    const ids2 = two.map(function (e) { return e.id; });
    t.ok(minion.dead && !DD.Combat.state.result, 'setup: BEES! finished the minion, the boss still stands');
    t.ok(two.length === 2 && ids2[0] === 'wm_bees' && ids2[1] !== 'wm_baa' && ids2[1] !== 'wm_bees' && two.every(function (e) { return e.good === true; }),
      'mirror: a second good effect still goes off, re-rolled instead of the fizzled Baa-d Luck (' + ids2 + ')');
    t.ok(!foes().some(function (f) { return has(f, 'sheep'); }), '... and nobody turned into a sheep');
    t.eq(ban && ban.sub, two.map(function (e) { return e.icon + ' ' + e.name; }).join(' + '), 'the banner names the two effects that went off');
    ITEMS.forEach(function (id, i) {
      DD.Combat.start({ grid: DD.Combat.emptyGrid(9, 9),
        heroes: [{ runHero: DD.Combat.makeRunHero({ id: 'marwyn', level: 3, items: [id], skills: [{ id: 'mrw_yeet', level: 2 }, { id: 'mrw_war_cry', level: 2 }, { id: 'mrw_hero_landing', level: 1 }] }), x: 1, y: 4 },
          { id: 'test_knight', x: 1, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_archer', x: 7, y: 6 }] }, { seed: 40 + i, headless: true });
      const r = DD.AutoPlay.runBattle(12);
      t.ok(r.rounds > 0 && r.result === 'victory', id + ': short AutoPlay battle won (' + r.result + ', ' + r.rounds + ' rounds)');
    });
  });

  // ---- 14. previews ---------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: HUD previews match reality (every skill, every level, incl. surges)', function (t) {
    function arena(seed) {
      fight({ seed: seed, heroes: [{ x: 4, y: 4 }, { id: 'test_knight', x: 3, y: 4 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_archer', x: 4, y: 7 }, { id: 'test_minion', x: 4, y: 2 }],
        objects: [{ x: 7, y: 4, id: 'barrel_explosive' }],
        terrain: function (tl) { if (tl.x === 8 && tl.y === 4) tl.t = 'pit'; if (tl.x === 6 && tl.y === 3) tl.t = 'lava'; } });
      DD.Combat.state.hype = 100;
      M().ap = 9;
      return M();
    }
    let checks = 0;
    ALL_SKILLS.forEach(function (id) {
      const def = DD.getSkill(id);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        [0, 5].forEach(function (stk) {
          const seed = 11 + lv + stk;
          let m = arena(seed);
          let sl = give(m, id, lv);
          const targets = DD.Targeting.validTargets(m, sl);
          targets.forEach(function (tg) { t.tryRun(id + ' preview ' + tg.x + ',' + tg.y, function () { DD.Targeting.preview(m, sl, tg); }); });
          targets.slice(0, 3).forEach(function (tg, j) {
            m = arena(seed);
            sl = give(m, id, lv);
            setStacks(m, stk);
            previewMatches(t, m, sl, tg.x, tg.y, id + ' L' + lv + ' @' + tg.x + ',' + tg.y + ' stacks ' + stk + ' #' + j);
            checks++;
          });
        });
      }
    });
    t.ok(checks > 60, 'preview checks: ' + checks);
  });

  // ---- 15. v2 edge cases -------------------------------------------------------------------------------------------
  T.suite('hero_marwyn: v2 edge cases (stun, silence, sheep, charm, AP, deaths mid-skill, edges, own-turn durations)', function (t) {
    function full() {
      fight({ heroes: [{ x: 4, y: 4, skills: ['mrw_cleave', 'mrw_yeet', 'mrw_magnetism', 'mrw_gun_show'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }] });
      DD.Combat.state.hype = 100;
      return M();
    }
    let m = full();
    A().addStatus(m, 'silenced', { turns: 1 });
    t.eq(DD.Combat.canUse(m, m.skills[2]), 'Silenced!', 'silenced: the wild-magic spell is blocked');
    t.ok(DD.Combat.canUse(m, m.skills[0]) === true && DD.Combat.canUse(m, m.basic) === true && DD.Combat.canUse(m, m.signature) === true, 'silenced: attacks and the signature still work');
    ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (sid) {
      m = full();
      A().addStatus(m, sid, { turns: 1 });
      t.ok(DD.Combat.slotsOf(m).every(function (sl) { return DD.Combat.canUse(m, sl) !== true; }), sid + ': no skills');
    });
    // stunned on his own turn: his NEXT turn passes by itself (0 AP), then he is back with 3 AP
    m = full();
    A().addStatus(m, 'stun', { turns: 1 }, at(5, 4));
    DD.Combat.endTurn();
    t.ok(DD.Combat.state.round === 3 && DD.Combat.current() === m && m.ap === 3 && !has(m, 'stun'), 'stunned: one turn lost, back in round 3 with 3 AP');
    // charmed by the grunt: can't hurt it; −1 AP on his next turn
    m = full();
    const g = at(5, 4);
    A().addStatus(m, 'charmed', { turns: 1 }, g);
    use(t, m, m.basic, 5, 4, 'basic on the charmer');
    t.eq(g.hp, 14, 'charmed: no damage to the charmer');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === m && m.ap === 2, 'charmed: 2 AP on his next turn');
    m = full();
    m.ap = 1;
    t.eq(DD.Combat.canUse(m, m.skills[0]), 'Not enough AP.', '1 AP: no Cleave');
    t.eq(DD.Combat.canUse(m, m.basic), true, '1 AP: the basic is fine');
    m.ap = 2;
    t.eq(DD.Combat.canUse(m, m.skills[2]), 'Not enough AP.', '2 AP: no Center of Attention');
    // not his turn: nothing works
    fight({ heroes: [{ x: 4, y: 4, skills: ['mrw_war_cry'] }, { id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    m = M();
    DD.Combat.endTurn();
    t.ok(/Not Marwyn's turn/.test(String(DD.Combat.canUse(m, m.skills[0]))), 'on the knight\'s turn: "Not Marwyn\'s turn."');
    // deaths mid-skill
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'mrw_cleave', level: 3 }] }], enemies: [{ id: 'test_minion', x: 3, y: 3 }, { id: 'test_minion', x: 3, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }] });
    m = M();
    use(t, m, m.skills[0], 3, 4, 'Cleave III killing minions');
    t.ok(dead('test_minion') === 2 && at(4, 5) && at(4, 5).hp === 7, 'dead foes are skipped, the living one is knocked back');
    t.eq(stacks(m), 1, 'kills or not: +1 MAGNIFICENCE');
    // Cleave III's knockback is a real push: into a pit (environmental kill) and into water (Wet)
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'mrw_cleave', level: 3 }] }], enemies: [{ id: 'test_grunt', x: 3, y: 3 }, { id: 'test_grunt', x: 3, y: 5 }, { id: 'test_grunt', x: 8, y: 8 }] });
    setT(4, 3, 'pit'); setT(4, 5, 'water');
    m = M();
    const hype0 = DD.Combat.state.hype;
    use(t, m, m.skills[0], 3, 4, 'Cleave III between a pit and a pond');
    t.ok(dead('test_grunt') === 1 && DD.Combat.state.hype - hype0 >= 20, 'knocked into the pit: an environmental kill (+20 Hype)');
    t.ok(at(4, 5) && at(4, 5).hp === 7 && has(at(4, 5), 'wet'), 'knocked into the water: 7 damage and Wet');
    fight({ heroes: [{ x: 1, y: 4, skills: ['mrw_yeet'] }], enemies: [{ id: 'test_minion', x: 2, y: 4, hpMult: 0.5 }, { id: 'test_grunt', x: 3, y: 4 }] });
    m = M();
    use(t, m, m.skills[0], 2, 4, 'YEET a 3-HP minion into a grunt');
    t.ok(dead('test_minion') === 1 && at(3, 4).hp === 8, 'the thrown foe dies on impact; the other still takes its crash');
    fight({ heroes: [{ x: 2, y: 4, hp: 1 }, { id: 'test_knight', x: 0, y: 0 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    m = M();
    A().addStatus(at(3, 4), 'thorns', { stacks: 3, turns: 2 }, at(3, 4));
    use(t, m, m.basic, 3, 4, 'basic into Thorns at 1 HP');
    t.ok(m.downed && at(3, 4).hp === 9 && stacks(m) === 0 && !m.data.mrwPending, 'Marwyn drops to the Thorns mid-skill: the hit landed, no gain, nothing pending');
    // every skill straight into execute with empty / odd targets
    fight({ heroes: [{ x: 4, y: 4, hp: 30 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    m = M();
    DD.Combat.state.hype = 100;
    ALL_SKILLS.forEach(function (id) {
      const sl = give(m, id, 3);
      [{ x: 4, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 4 }, null].forEach(function (p) {
        t.tryRun(id + ' execute with target ' + JSON.stringify(p), function () {
          DD.Combat._action(function () { DD.Combat.resolveSkill(m, sl, p, { pay: false }); });
        });
      });
    });
    t.ok(!m.dead && !m.downed, 'nothing exploded');
    // map edges and corners
    fight({ heroes: [{ x: 0, y: 0, skills: ['mrw_yeet', 'mrw_hero_landing', 'mrw_magnetism', 'mrw_cleave'] }], enemies: [{ id: 'test_grunt', x: 1, y: 0 }, { id: 'test_grunt', x: 0, y: 1 }] });
    m = M();
    m.skills.forEach(function (sl) { t.tryRun(sl.id + ' targets in the corner', function () { DD.Targeting.validTargets(m, sl); }); });
    use(t, m, m.skills[0], 1, 0, 'YEET along the top edge');
    t.ok(at(4, 0) && at(4, 0).defId === 'test_grunt', 'along the edge works');
    use(t, m, m.basic, 0, 1, 'basic in the corner');
    // own-turn durations (v2): debuffs on foes cover their next turn; his buffs last through his next turn; Block until
    // the start of his next turn
    fight({ heroes: [{ x: 4, y: 4, skills: [{ id: 'mrw_war_cry', level: 1 }, { id: 'mrw_gun_show', level: 1 }, { id: 'mrw_headbutt', level: 1 }, { id: 'mrw_rage', level: 1 }] }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }] });
    m = M();
    m.ap = 9;
    const e1 = at(5, 4), e2 = at(4, 3);
    use(t, m, m.skills[2], 5, 4, 'Headbutt');
    use(t, m, m.skills[1], 4, 4, 'Gun Show');
    use(t, m, m.skills[0], 4, 4, 'War Cry');
    use(t, m, m.skills[3], 4, 4, 'Ginger Rage');
    const seen = {};
    const off = DD.Events.on('turn:start', function (ev) {
      if (ev.unit === e1 || ev.unit === e2) seen[ev.unit.id] = { block: m.block, taunt: has(ev.unit, 'taunt'), root: has(ev.unit, 'root'), stun: has(ev.unit, 'stun') };
    });
    try { DD.Combat.endTurn(); } finally { off(); }
    t.ok(seen[e1.id] && seen[e1.id].stun && seen[e1.id].taunt && seen[e1.id].root && seen[e2.id].taunt && seen[e2.id].root, 'on the foes\' turns: Stun, Taunt and Root are up');
    t.ok(seen[e1.id].block === 4 && seen[e2.id].block === 4, 'his Block stood through every enemy turn');
    t.ok(!has(e1, 'stun') && !has(e1, 'taunt') && !has(e1, 'root') && !has(e2, 'taunt') && !has(e2, 'root'), 'each debuff ended with that foe\'s turn');
    t.ok(DD.Combat.current() === m && m.block === 0 && has(m, 'thorns') && has(m, 'mrw_rage'), 'his next turn: Block gone, Thorns and Rage still up');
    m.ap = 0;
    DD.Combat.endTurn();
    t.ok(!has(m, 'thorns') && !has(m, 'mrw_rage'), 'Thorns and Rage end with that turn');
  });

  // ---- 16. attacks of opportunity (DESIGN §4.2) ------------------------------------------------------------------
  /** 'opportunity:attack' events while fn runs: [{ a: attacker defId, m: mover defId, skill }]. */
  function opportunities(fn) {
    const seen = [];
    const off = DD.Events.on('opportunity:attack', function (e) { seen.push({ a: e.attacker.defId, m: e.mover.defId, skill: e.skillId }); });
    try { fn(); } finally { off(); }
    return seen;
  }
  /** Bark keys asked for through maybeBark while fn runs (the line itself is a cosmetic roll). */
  function barkKeys(fn) {
    const keys = [], mb = DD.Act.maybeBark;
    DD.Act.maybeBark = function (u, key) { keys.push(key); return mb.apply(this, arguments); };
    try { fn(); } finally { DD.Act.maybeBark = mb; }
    return keys;
  }

  T.suite('hero_marwyn: attacks of opportunity (he holds the line; his leap, throws, pulls and knockbacks never provoke)', function (t) {
    // Ginger Snap is his attack of opportunity: a foe that walks away from him takes one, once per round
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 5 }] });
    let m = M();
    const g1 = at(3, 4), g2 = at(2, 5);
    t.eq(A().opportunitySlot(m), m.basic, 'his melee basic attack is his attack of opportunity');
    let asked = [];
    let seen = opportunities(function () { asked = barkKeys(function () { DD.AI.moveTo(g1, 6, 4); }); });
    t.ok(seen.length === 1 && seen[0].a === 'marwyn' && seen[0].m === 'test_grunt' && seen[0].skill === 'mrw_ginger_snap', 'the grunt walks away: Ginger Snap (' + JSON.stringify(seen) + ')');
    t.ok(g1.hp === 14 - 5 && g1.x === 6, '5 damage, and it walks on');
    t.ok(m.ap === 3 && !(m.basic.uses > 0) && !m.basic.usedThisTurn, 'free: no AP, no use');
    t.eq(stacks(m), 1, 'it reached a foe: +1 MAGNIFICENCE (holding the line pumps him up)');
    t.ok(asked.indexOf('opportunity') >= 0, 'he may shout about it (bark key "opportunity")');
    seen = opportunities(function () { DD.AI.moveTo(g2, 2, 8); });
    t.ok(seen.length === 0 && g2.hp === 14, 'one per round: the second grunt leaves unpunished');
    DD.Combat.endTurn();
    t.ok(DD.Combat.state.round === 2 && DD.Combat.current() === m, 'round 2, his turn');
    A().teleport(g2, 2, 5);
    seen = opportunities(function () { DD.AI.moveTo(g2, 2, 8); });
    t.ok(seen.length === 1 && g2.hp === 9 && stacks(m) === 2, 'a new round, a new swing (+1 again)');
    // at a full meter the swing is "his next skill": it surges (good wild magic, +10 Hype) on the foe's turn
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    m = M();
    setStacks(m, 5);
    let gains = [];
    let sg = surges(function () { gains = hypeGains(function () { DD.AI.moveTo(at(3, 4), 6, 4); }); });
    t.ok(sg.length === 1 && sg[0].good === true && sg[0].source === 'mrw_magnificence', 'at 5 MAGNIFICENCE the attack of opportunity surges (one good effect)');
    t.eq(surgeHype(gains), '10', '... +10 party Hype');
    t.eq(stacks(m), 1, '... the meter resets, then the swing adds 1');
    DD.Combat.sandbox({ w: 9, h: 9, seed: 7, enemyAi: false, heroes: [{ id: 'marwyn', x: 2, y: 4, level: 1 }], enemies: [{ id: 'test_minion', x: 3, y: 4, hpMult: 0.5 }] });
    m = M();
    setStacks(m, 5);
    sg = surges(function () { DD.AI.moveTo(foes()[0], 6, 4); });
    t.ok(DD.Combat.state.result === 'victory' && sg.length === 0 && stacks(m) === 5, 'a swing that wins the fight: victory, no surge');
    // walking away from a foe provokes it (the move preview says so); being hit adds nothing
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    m = M();
    const e = DD.Combat.reachable(m).get('0,4');
    t.ok(e && e.provokes.length === 1, 'walking away from the grunt provokes it');
    const pv = DD.Combat.provokes(m, 0, 4);
    t.ok(pv.length === 1 && pv[0].skillId === 'test_grunt_stab' && pv[0].dmg === 4, 'the move preview: a 4-damage stab (' + JSON.stringify(pv) + ')');
    let hp = m.hp;
    seen = opportunities(function () { t.ok(DD.Combat.move(m, 0, 4), 'he walks away anyway'); });
    t.ok(seen.length === 1 && m.hp === hp - 4 && m.x === 0 && m.y === 4, 'stabbed on the way out (4), walk finished');
    t.eq(stacks(m), 0, 'being hit adds no MAGNIFICENCE');
    // Ginger Rage softens that stab, Gun Show's Thorns answer it (rooted foes still swing)
    fight({ heroes: [{ x: 2, y: 4, skills: ['mrw_rage', 'mrw_gun_show'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    m = M();
    let g = at(3, 4);
    use(t, m, m.skills[0], 2, 4, 'Ginger Rage');
    use(t, m, m.skills[1], 2, 4, 'Gun Show');
    hp = m.hp;
    DD.Combat.move(m, 0, 4);
    t.ok(m.hp === hp - 2 && m.x === 0, 'Ginger Rage: the stab on the way out deals 2 (4 − 2)');
    t.eq(g.hp, 14 - 2, 'and the rooted grunt eats Thorns 2 for it');
    // the Loincloth: a foe he Taunted stabs him for 25% less on the way out too
    fight({ heroes: [{ x: 2, y: 4, items: ['mrw_loincloth'], skills: ['mrw_war_cry'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    m = M();
    use(t, m, m.skills[0], 2, 4, 'War Cry');
    m.block = 0;
    hp = m.hp;
    DD.Combat.move(m, 0, 4);
    t.eq(hp - m.hp, 3, 'Loincloth: the Taunted grunt\'s stab deals 3 instead of 4');
    // mobility never provokes: his leap, his throws, his pull and his knockback
    fight({ heroes: [{ x: 2, y: 4, skills: ['mrw_hero_landing'] }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 2, y: 3 }, { id: 'test_grunt', x: 1, y: 4 }] });
    m = M();
    hp = m.hp;
    seen = opportunities(function () { use(t, m, m.skills[0], 2, 7, 'Hero Landing out of three grunts'); });
    t.ok(seen.length === 0 && m.hp === hp && m.x === 2 && m.y === 7, 'Hero Landing: a leap never provokes (out of three grunts, not a scratch)');
    fight({ heroes: [{ x: 2, y: 4, skills: ['mrw_yeet'] }, { id: 'test_mage', x: 2, y: 5, hp: 5 }], enemies: [{ id: 'test_grunt', x: 3, y: 5 }, { id: 'test_grunt', x: 1, y: 5 }] });
    m = M();
    const mage = hero('test_mage');
    seen = opportunities(function () { use(t, m, m.skills[0], 2, 5, 'YEET the pinned mage'); });
    t.ok(seen.length === 0 && mage.hp === 5 && mage.x === 2 && mage.y === 8, 'YEET: a throw never provokes (the wounded mage flies out from between two grunts unhurt)');
    fight({ heroes: [{ x: 4, y: 4, skills: ['mrw_magnetism'] }, { id: 'test_knight', x: 4, y: 0 }], enemies: [{ id: 'test_grunt', x: 4, y: 1 }] });
    m = M();
    g = at(4, 1);
    seen = opportunities(function () { use(t, m, m.skills[0], 4, 4, 'Center of Attention'); });
    t.ok(seen.length === 0 && g.x === 4 && g.y === 3 && g.hp === 14, 'Center of Attention: a pull never provokes (no swing from the knight it was next to)');
    fight({ heroes: [{ x: 2, y: 4, skills: [{ id: 'mrw_cleave', level: 3 }] }, { id: 'test_knight', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    m = M();
    g = at(3, 4);
    seen = opportunities(function () { use(t, m, m.skills[0], 3, 4, 'Cleave III'); });
    t.ok(seen.length === 0 && g.x === 4 && g.hp === 14 - 7, 'Glorious Cleave III: a knockback never provokes (7 damage, knocked off the knight, no swing)');
    // the combo: LOOK AT MARWYN! drags a foe off the knight it was fighting, through the knight's attack of opportunity
    function drag(shout) {
      fight({ ai: true, heroes: [{ x: 2, y: 4, skills: ['mrw_war_cry'] }, { id: 'test_knight', x: 5, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
      const mm = M(), k = hero('test_knight'), gg = at(4, 4);
      if (shout) use(t, mm, mm.skills[0], 2, 4, 'War Cry at the grunt 2 tiles away');
      let hits = {};
      const ev = opportunities(function () { hits = hitsTaken(function () { DD.Combat.endRound(); }); });
      return { m: mm, k: k, g: gg, seen: ev, hits: hits };
    }
    const calm = drag(false), loud = drag(true);
    t.ok(calm.seen.length === 0 && calm.g.x === 4 && calm.hits[calm.k.id] > 0, 'control: the grunt sticks to the knight next to it');
    t.ok(loud.seen.length === 1 && loud.seen[0].a === 'test_knight' && loud.seen[0].m === 'test_grunt', 'Taunted: it walks off the knight and eats his attack of opportunity');
    t.ok(loud.g.hp === 14 - 5 && DD.Grid.dist(loud.g, loud.m) === 1 && !loud.hits[loud.k.id], '... 5 damage on its way to Marwyn; the knight is left alone');
    t.eq(loud.hits[loud.m.id], 4, '... and it stabs Marwyn (into his Block)');
    // the other half of the combo: a foe he Taunted only strikes its taunter, so a pinned ally walks away from it for free
    function pinned(shout) {
      fight({ heroes: [{ x: 2, y: 4, skills: ['mrw_war_cry'] }, { id: 'test_mage', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
      const mm = M(), mg = hero('test_mage');
      if (shout) use(t, mm, mm.skills[0], 2, 4, 'War Cry at the grunt pinning the mage');
      DD.Combat.endTurn();
      const pv = DD.Combat.provokes(mg, 6, 7), hp0 = mg.hp;
      const ev = opportunities(function () { t.ok(DD.Combat.move(mg, 6, 7), 'the mage walks off the grunt'); });
      return { pv: pv, ev: ev, lost: hp0 - mg.hp, at: mg.x + ',' + mg.y };
    }
    const stuck = pinned(false), freed = pinned(true);
    t.ok(stuck.pv.length === 1 && stuck.ev.length === 1 && stuck.lost === 4, 'control: walking off the grunt costs the mage its stab (4)');
    t.ok(freed.pv.length === 0 && freed.ev.length === 0 && freed.lost === 0 && freed.at === '6,7', 'Taunted by Marwyn: the grunt only strikes him, so the mage walks away unhurt (the move preview agrees)');
    // no swing while he is incapacitated, nor at the foe that charmed him
    ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (sid) {
      fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      const gg = at(3, 4);
      A().addStatus(M(), sid, { turns: 1 });
      const ev = opportunities(function () { DD.AI.moveTo(gg, 6, 4); });
      t.ok(ev.length === 0 && gg.hp === 14, sid + ': no attack of opportunity');
    });
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    g = at(3, 4);
    A().addStatus(M(), 'charmed', { turns: 1 }, g);
    seen = opportunities(function () { DD.AI.moveTo(g, 6, 4); });
    t.ok(seen.length === 0 && g.hp === 14, 'charmed by the grunt: he lets his charmer go');
    // the "opportunity" bark belongs to reactions only
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    m = M();
    asked = barkKeys(function () { use(t, m, m.basic, 3, 4, 'Ginger Snap on his own turn'); });
    t.ok(asked.indexOf('opportunity') < 0, 'a Ginger Snap on his own turn never asks for the "opportunity" bark (' + asked.join(',') + ')');
  });

  // ---- 17. AutoPlay battles -------------------------------------------------------------------------------------
  /**
   * Invariants on every real use of his skills while fn runs (review v2): the passive's one rule (a full meter surges
   * unless the fight is decided, the meter resets, then +1 if a foe was in the area, +2 more for Ginger Rage; nothing
   * else moves it) and, for each skill AutoPlay picks, the HUD preview == what happened (HP, KOs, movement, Hype).
   * Nested uses (one of his skills resolving inside another) are skipped. → { acc, accBad, prev, prevBad, bad }
   */
  function audited(fn) {
    const out = { acc: 0, accBad: 0, prev: 0, prevBad: 0, bad: [] };
    const rs0 = DD.Combat.resolveSkill, us0 = DD.Combat.useSkill;
    let depth = 0, nested = false, surgeCount = 0;
    const off = DD.Events.on('wildmagic:surge', function (e) { if (e.source === 'mrw_magnificence') surgeCount++; });
    DD.Combat.resolveSkill = function (unit, slotOrDef, target, opts) {
      const r = DD.Targeting.resolve(slotOrDef), def = r && r.def;
      if (A().simulating || !unit || unit.defId !== 'marwyn' || !def || DD.getSkill(def.id) !== def) return rs0.apply(this, arguments);
      if (depth > 0) nested = true;
      const ctx0 = DD.Targeting.buildCtx(unit, slotOrDef, target, opts && opts.extra);
      const before = stacks(unit), s0 = surgeCount, decided0 = !!DD.Combat.state.result;
      depth++;
      let res;
      try { res = rs0.apply(this, arguments); } finally { depth--; }
      if (depth > 0) return res;
      if (nested) { nested = false; return res; }
      if (unit.dead || unit.downed) return res;
      const surged = surgeCount > s0;
      const expect = Math.min(5, (surged ? 0 : before) + (ctx0 && ctx0.foes.length ? 1 : 0) +
        (def.id === 'mrw_rage' ? DD.skillLevel(def, r.level).stacks : 0));
      const problem = before >= 5 && !surged && !DD.Combat.state.result ? 'a full meter did not surge' :
        before < 5 && surged ? 'surged below a full meter (' + before + ')' :
        decided0 && surged ? 'surged after the fight was decided' :
        stacks(unit) !== expect ? 'MAGNIFICENCE ' + before + ' → ' + stacks(unit) + ', expected ' + expect : '';
      out.acc++;
      if (problem) { out.accBad++; out.bad.push(def.id + (opts && opts.extra && opts.extra.opportunity ? ' (attack of opportunity)' : '') + ': ' + problem); }
      return res;
    };
    DD.Combat.useSkill = function (unit, slot, x, y) {
      if (A().simulating || !unit || unit.defId !== 'marwyn') return us0.apply(this, arguments);
      const s = DD.Combat.state, prev = DD.Combat.preview(unit, slot, x, y), hype0 = s.hype, before = {};
      s.units.forEach(function (o) { before[o.id] = { hp: o.hp, dead: !!o.dead, downed: !!o.downed, x: o.x, y: o.y }; });
      const ok = us0.apply(this, arguments);
      if (!ok || !prev || prev.uncertain) return ok;
      out.prev++;
      const id = (slot && slot.id) + ' @' + x + ',' + y + ': ';
      s.units.forEach(function (o) {
        const b = before[o.id], e = prev.perUnit[o.id];
        if (!b || b.dead) return;
        const ko = (o.dead && !b.dead) || (o.downed && !b.downed);
        const lost = b.hp - o.hp, shown = e ? (e.dmg || 0) - (e.heal || 0) : 0;
        if (lost !== shown) { out.prevBad++; out.bad.push(id + o.name + ' HP ' + lost + ', preview ' + shown); }
        if (ko !== !!(e && e.lethal)) { out.prevBad++; out.bad.push(id + o.name + ' KO ' + ko + ', preview ' + !!(e && e.lethal)); }
        if (!o.dead && !ko && (o.x !== b.x || o.y !== b.y) !== !!(e && e.moved)) { out.prevBad++; out.bad.push(id + o.name + ' movement differs from the preview'); }
      });
      if (s.hype - hype0 !== prev.hype) { out.prevBad++; out.bad.push(id + 'Hype ' + (s.hype - hype0) + ', preview ' + prev.hype); }
      return ok;
    };
    try { fn(); } finally { DD.Combat.resolveSkill = rs0; DD.Combat.useSkill = us0; off(); }
    return out;
  }
  function battles(t, plans) {
    const totals = {};
    const audit = { acc: 0, accBad: 0, prev: 0, prevBad: 0, bad: [] };
    let fought = 0, wins = 0, skillUses = 0, turned = 0;
    plans.forEach(function (p, i) {
      const enc = DD.getEncounter(p.enc);
      if (!enc) { t.fail('fixture encounter ' + p.enc + ' missing'); return; }
      const party = ['marwyn', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
        if (id === 'marwyn') return DD.Combat.makeRunHero({ id: id, level: p.level, skills: p.skills.map(function (s) { return { id: s[0], level: s[1] }; }) });
        const h = DD.getHero(id);
        return DD.Combat.makeRunHero({ id: id, level: p.level, skills: h.startingSkills.map(function (sid) { return { id: sid, level: Math.min(3, 1 + Math.floor(p.level / 3)) }; }) });
      });
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('mrw-ap-' + i + ':' + t.seed), difficulty: 'normal', act: enc.act });
      DD.Combat.start(setup, { seed: 900 + i, headless: true, difficulty: 'normal', kind: enc.kind });
      const counts = {};
      let turns = 0;
      A().addRule({ id: 'mrw_usage_probe', name: 'Usage probe', hooks: { onSkillUsed: function (ctx) {
        if (A().simulating || !ctx.user || ctx.user.defId !== 'marwyn' || !ctx.skill || !DD.getSkill(ctx.skill.id)) return;
        counts[ctx.skill.id] = (counts[ctx.skill.id] || 0) + 1;
      } } });
      const off = DD.Events.on('turn:start', function (ev) { if (ev.unit && ev.unit.defId === 'marwyn') turns++; });
      let r = null;
      try {
        const a = audited(function () { r = DD.AutoPlay.runBattle(30); });
        ['acc', 'accBad', 'prev', 'prevBad'].forEach(function (k) { audit[k] += a[k]; });
        a.bad.forEach(function (b) { audit.bad.push(p.enc + ' L' + p.level + ' ' + b); });
      } finally { off(); }
      fought++;
      if (r.result === 'victory') wins++;
      if (turns > 0) turned++;
      Object.keys(counts).forEach(function (k) { totals[k] = (totals[k] || 0) + counts[k]; if (k !== 'mrw_ginger_snap') skillUses += counts[k]; });
      t.ok(r.rounds > 0 && !r.timeout, p.enc + ' L' + p.level + ': finished (' + r.result + ' in ' + r.rounds + ' rounds)');
      t.ok(!!DD.Combat.state.order && DD.Combat.state.order.length > 0, p.enc + ' L' + p.level + ': initiative was rolled');
      t.log(p.enc + ' L' + p.level + ' → ' + r.result + ' in ' + r.rounds + ' rounds; Marwyn ' + turns + ' turns: ' + JSON.stringify(counts));
      A().removeRule('mrw_usage_probe');
    });
    t.log('audit: ' + audit.acc + ' uses accounted, ' + audit.prev + ' certain previews compared');
    t.eq(audit.accBad, 0, 'MAGNIFICENCE follows its one rule on every use in these fights' + (audit.bad.length ? ': ' + audit.bad.slice(0, 4).join(' | ') : ''));
    t.eq(audit.prevBad, 0, 'every skill AutoPlay picked did what its HUD preview said' + (audit.bad.length ? ': ' + audit.bad.slice(0, 4).join(' | ') : ''));
    t.ok(audit.acc >= 2 * fought && audit.prev >= fought, 'the audit saw his skills in use (' + audit.acc + ' uses, ' + audit.prev + ' previews)');
    return { totals: totals, fought: fought, wins: wins, uses: skillUses, turned: turned };
  }

  T.suite('hero_marwyn: AutoPlay battles, act 1 (level 1)', function (t) {
    const start = [['mrw_war_cry', 1], ['mrw_yeet', 1]];
    const res = battles(t, [
      { enc: 'test_a1_normal', level: 1, skills: start },
      { enc: 'test_a1_elite', level: 1, skills: start },
      { enc: 'test_a1_boss', level: 1, skills: start },
      { enc: 'test_a1_totems', level: 1, skills: start },
      { enc: 'test_a1_normal', level: 1, skills: [['mrw_war_cry', 1], ['mrw_yeet', 1], ['mrw_cleave', 1]] },
    ]);
    t.log('totals: ' + JSON.stringify(res.totals) + ' · wins ' + res.wins + '/' + res.fought);
    t.eq(res.turned, res.fought, 'Marwyn takes turns in every fight');
    t.ok(res.uses >= 5, 'he uses his skills, not just the basic attack (' + res.uses + ')');
    t.ok(res.totals.mrw_war_cry > 0 && res.totals.mrw_yeet > 0, 'both starting skills get used');
    t.ok(res.wins >= 3, 'the party mostly wins (' + res.wins + '/' + res.fought + ')');
  });

  T.suite('hero_marwyn: AutoPlay battles, acts 2-3 (levels 3 / 5)', function (t) {
    const res = battles(t, [
      { enc: 'test_a2_normal', level: 3, skills: [['mrw_war_cry', 2], ['mrw_yeet', 1], ['mrw_headbutt', 1]] },
      { enc: 'test_a2_elite', level: 3, skills: [['mrw_war_cry', 1], ['mrw_gun_show', 2], ['mrw_cleave', 1]] },
      { enc: 'test_a2_boss', level: 3, skills: [['mrw_war_cry', 1], ['mrw_headbutt', 2], ['mrw_rage', 1]] },
      { enc: 'test_a2_keg', level: 3, skills: [['mrw_war_cry', 1], ['mrw_yeet', 2], ['mrw_hero_landing', 1]] },
      { enc: 'test_a3_normal', level: 5, skills: [['mrw_war_cry', 2], ['mrw_yeet', 2], ['mrw_keg_stand', 1], ['mrw_hero_landing', 2]] },
      { enc: 'test_a3_elite', level: 5, skills: [['mrw_war_cry', 2], ['mrw_cleave', 2], ['mrw_headbutt', 2], ['mrw_magnetism', 1]] },
      { enc: 'test_a3_boss', level: 5, skills: [['mrw_war_cry', 3], ['mrw_gun_show', 2], ['mrw_rage', 2], ['mrw_headbutt', 2]] },
      { enc: 'test_a3_survive', level: 5, skills: [['mrw_yeet', 3], ['mrw_cleave', 2], ['mrw_magnetism', 2], ['mrw_keg_stand', 2]] },
    ]);
    t.log('totals: ' + JSON.stringify(res.totals) + ' · wins ' + res.wins + '/' + res.fought);
    t.eq(res.turned, res.fought, 'Marwyn takes turns in every fight');
    t.ok(res.uses >= 10, 'he uses his skills (' + res.uses + ')');
    t.ok(Object.keys(res.totals).filter(function (k) { return k !== 'mrw_ginger_snap'; }).length >= 6, 'many different skills used (' + Object.keys(res.totals).length + ')');
    t.ok(res.wins >= 6, 'the party mostly wins (' + res.wins + '/' + res.fought + ')');
  });

  // YEET has no dmg number, so AutoPlay's quick pass (which picks the move + skill options worth an exact dry run) only
  // sees a throw through YEET's autoplayValue hint
  T.suite('hero_marwyn: AutoPlay walks up and YEETs a foe into a pit (the throw hint)', function (t) {
    const hint = DD.getSkill('mrw_yeet').autoplayValue;
    t.ok(typeof hint === 'function', 'YEET has an autoplayValue hint');
    fight({ heroes: [{ x: 3, y: 4, skills: ['mrw_yeet'] }, { id: 'test_knight', x: 3, y: 5 }],
      enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 3, y: 7 }, { id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 8, y: 0 }] });
    setT(6, 4, 'pit');
    let m = M(), sl = give(m, 'mrw_yeet', 1);
    const ctxAt = function (x, y) { return DD.Targeting.buildCtx(m, sl, { x: x, y: y }); };
    t.eq(hint(ctxAt(4, 4)), 14 + 15, 'a foe thrown into the pit: worth its HP + a kill');
    t.eq(hint(ctxAt(3, 5)), -1.5 * 6 + 6, 'an ally thrown into a foe: the crash hurts a friend (−1.5 × 6) and a foe (+6)');
    t.eq(hint(ctxAt(2, 4)), 6, 'a foe thrown into the map edge after 2 tiles: one crash');
    const exact = ctxAt(4, 4);
    exact.autoplay = { preview: {} };
    t.eq(hint(exact), 0, 'the exact pass measures the real throw: the hint adds nothing there');
    // plenty of plain hits on offer (they fill the quick pass's shortlist), one throw into a pit two steps away
    fight({ heroes: [{ x: 1, y: 4, skills: ['mrw_yeet'] }],
      enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 1, y: 2 }, { id: 'test_grunt', x: 2, y: 6 }, { id: 'test_grunt', x: 0, y: 6 }, { id: 'test_grunt', x: 8, y: 0 }] });
    setT(6, 4, 'pit');
    m = M();
    const g = at(4, 4);
    DD.AutoPlay.takeTurn();
    t.ok(g.dead && m.x === 3 && m.y === 4 && DD.Combat.state.stats.envKills === 1, 'AutoPlay walked next to the grunt and YEETed it into the pit (Marwyn at ' + m.x + ',' + m.y + ')');
  });

  // AutoPlay's gain counts a Taunt as 1 and Block as 0.1 a point, and its quick estimate of a leap ignores the Taunt:
  // without these two hints BEHOLD and Hero Landing were never used in campaign sims
  T.suite('hero_marwyn: AutoPlay hints (Hero Landing bodyguards a wounded ally, BEHOLD when the party is in trouble)', function (t) {
    const landing = DD.getSkill('mrw_hero_landing').autoplayValue, behold = DD.getSkill('mrw_behold').aiScore;
    t.ok(typeof landing === 'function' && typeof behold === 'function', 'Hero Landing has an autoplayValue hint, BEHOLD an aiScore');
    // the mage acts first in the order, then Marwyn; the grunt next to the 4-HP mage acts before her next turn
    function rescue(skills) {
      fight({ ai: true, heroes: [{ id: 'test_mage', x: 5, y: 4, hp: 4 }, { x: 3, y: 3, skills: skills }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 8, y: 0 }] });
      DD.Combat.endTurn();
      return M();
    }
    let m = rescue(['mrw_hero_landing']);
    let sl = m.skills[0];
    t.ok(DD.Combat.current() === m, 'Marwyn\'s turn');
    const ctxAt = function (x, y) { return DD.Targeting.buildCtx(m, sl, { x: x, y: y }); };
    t.eq(landing(ctxAt(6, 3)), 3, 'a landing next to the grunt that is on the mage: 3');
    t.eq(landing(ctxAt(3, 1)), 0, 'a landing next to nobody: 0');
    const exact = ctxAt(6, 3);
    exact.autoplay = { preview: {} };
    t.eq(landing(exact), 0, 'the exact pass measures the real leap: the hint adds nothing there');
    A().addStatus(at(6, 4), 'taunt', { turns: 1 }, m);
    t.eq(landing(ctxAt(6, 3)), 0, 'a foe he already Taunted is not worth another landing');
    m = rescue(['mrw_hero_landing']);
    const mage = hero('test_mage'), g = at(6, 4);
    DD.AutoPlay.takeTurn();
    t.ok(m.x === 6 && m.y === 3 && has(g, 'taunt') && st(g, 'taunt').source === m.id, 'AutoPlay leapt next to the grunt and Taunted it (Marwyn at ' + m.x + ',' + m.y + ')');
    const hits = hitsTaken(function () { DD.Combat.endTurn(); });
    t.ok(!hits[mage.id] && !mage.downed, 'the wounded mage survives the grunt\'s turn');
    // BEHOLD: 4 per foe that is not next to him and not Taunted by him yet
    fight({ heroes: [{ id: 'test_mage', x: 6, y: 4, hp: 8 }, { x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }, { id: 'test_grunt', x: 7, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_grunt', x: 1, y: 2 }] });
    DD.Combat.endTurn();
    m = M();
    const ctxB = function () { return DD.Targeting.buildCtx(m, m.signature, { x: m.x, y: m.y }); };
    t.eq(behold(ctxB()), 3 * 4, 'BEHOLD hint: the 3 grunts on the mage count, the one next to him does not');
    A().addStatus(at(6, 3), 'taunt', { turns: 1 }, m);
    t.eq(behold(ctxB()), 2 * 4, 'a grunt he already Taunted no longer counts');
    A().removeStatus(at(6, 3), 'taunt');
    DD.Combat.state.hype = 100;
    DD.AutoPlay.takeTurn();
    t.ok(DD.Combat.state.hype === 0 && foes().every(function (f) { return has(f, 'taunt') && st(f, 'taunt').source === m.id; }), 'AutoPlay unleashed BEHOLD with three grunts around the wounded mage (Hype ' + DD.Combat.state.hype + ')');
  });

  // ---- v2 requests (user, Nov 3): flyers ignore the floor, barrels ---------------------------------------------
  T.suite('hero_marwyn: v2 requests — Keg Stand puddles miss flyers, his axe and his head set barrels off (in his face)', function (t) {
    // 1. Keg Stand splashes the FLOOR: grounded units there get Wet, a flyer above the puddle stays dry
    fight({ heroes: [{ x: 4, y: 4, skills: ['mrw_keg_stand'] }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }] });
    let m = M();
    const walker = at(5, 4), flyer = at(3, 4);
    flyer.flags = Object.assign({}, flyer.flags, { flying: true });   // test setup: a flying foe
    use(t, m, m.skills[0], 4, 4, 'Keg Stand between a walker and a flyer');
    t.ok(has(walker, 'wet') && !has(flyer, 'wet'), 'the walker is Wet, the flyer is not (the desc says grounded units)');
    t.ok(tile(3, 4).surface && tile(3, 4).surface.id === 'water', 'the puddle is under the flyer all the same');
    t.ok(/grounded units there get Wet/.test(DD.skillDesc(DD.getSkill('mrw_keg_stand'), 1, null)), 'Keg Stand desc: grounded units');
    // YEET's flight path and the AutoPlay throw hint read hazards per unit: lava under a flyer's path is no threat to it
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'lava'; } });
    const f = at(3, 4);
    t.ok(DD.Grid.hazardAt(5, 4, f) !== null, 'lava is a hazard for the walking grunt');
    f.flags = Object.assign({}, f.flags, { flying: true });
    t.eq(DD.Grid.hazardAt(5, 4, f), null, 'and none once it flies');

    // 2. barrels: Ginger Snap whacks an adjacent one (he is in the blast); Use Your Head too, paying its 2 HP
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 3, y: 4, id: 'barrel_explosive' }] });
    m = M();
    const g = at(4, 4);
    t.ok(DD.Targeting.validTargets(m, m.basic).some(function (q) { return q.obj && q.x === 3 && q.y === 4; }), 'Ginger Snap: the adjacent barrel is a target');
    const pv = DD.Combat.preview(m, m.basic, 3, 4);
    t.ok(pv.detonates === 'barrel_explosive' && pv.perUnit[m.id].dmg === 8 && pv.perUnit[g.id].dmg === 8, 'preview: 8 to Marwyn and 8 to the grunt');
    use(t, m, m.basic, 3, 4, 'Ginger Snap at the barrel');
    t.ok(!tile(3, 4).obj && m.hp === m.maxHp - 8 && g.hp === 6 && m.ap === 2, 'KABOOM: both take 8, 1 AP (he calls it "a close shave")');
    fight({ heroes: [{ x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 3, y: 4, id: 'barrel_explosive' }] });
    m = M();
    const sl = give(m, 'mrw_headbutt', 1);
    use(t, m, sl, 3, 4, 'Use Your Head on the barrel');
    t.ok(!tile(3, 4).obj && m.hp === m.maxHp - 2 - 8 && m.ap === 1 && sl.cd === 3, 'he pays 2 HP, then eats the 8; 2 AP, cooldown 3 (no Stun on a barrel)');
  });
})();
