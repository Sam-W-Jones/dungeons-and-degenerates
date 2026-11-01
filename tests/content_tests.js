/* Dungeons and Degenerates — tests/content_tests.js
 * GENERIC validation of every registered piece of content (heroes, skills, statuses, items, consumables,
 * enemies, summons, encounters, terrain/objects/surfaces, scars, events, narration): registry cross-references,
 * SpriteSpecs, numbers that resolve at every level, desc() at every level (showing its damage/heal numbers),
 * three meaningful levels for socketable skills, every hero/generic/summon skill executed at every level against
 * several targets (its HUD preview must leave the state untouched and predict the real outcome exactly, or, when dice
 * are rolled, be flagged uncertain without giving the roll away), every consumable used, every item equipped in a
 * short autoplay battle, every status applied and ticked, every enemy taking its turns for 3 rounds and every
 * encounter built and auto-battled (param n) — both with HONEST AREAS checked (v2: AI actions happen at once; an AI
 * action or a boss wind-up may only hit units that stood in its area, i.e. its marked tiles for a wind-up).
 * Failures name the content id. Soft design notes (balance ranges, odd damage numbers) are reported as
 * "content advisory" warnings under the suite instead of failing it.
 * Suites are prefixed "content:". Works with only the test_ fixtures registered.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  const SKILL_KINDS = ['attack', 'spell', 'buff', 'heal', 'summon', 'move', 'utility'];
  const TARGET_TYPES = ['unit', 'tile', 'self', 'dir'];
  const FILTERS = [undefined, null, 'enemy', 'ally', 'allyOrSelf', 'any', 'notSelf', 'empty', 'emptyOrUnit', 'downedAlly', 'object'];
  const SHAPES = ['single', 'circle', 'square', 'ring', 'cross', 'line', 'cone', 'row', 'adjacent', 'all_foes', 'all_allies', 'custom'];
  const ANCHORS = ['self', 'ground', 'unit'];
  const TIERS = ['minion', 'normal', 'elite', 'boss'];
  const STYLES = ['melee', 'ranged', 'support', 'coward', 'summoner', 'kamikaze'];
  const HOOKS = ['onCombatStart', 'onCombatEnd', 'onRoundStart', 'onTurnStart', 'onTurnEnd', 'onMove', 'onEnterTile', 'onSkillUsed',
    'modifyCost', 'modifyRange', 'modifyOutgoingDamage', 'modifyIncomingDamage', 'onDealDamage', 'onTakeDamage', 'onKill', 'onDeath',
    'onDowned', 'onHealed', 'onStatusApplied', 'onAllyDeath', 'modifyStatus', 'modifyPush' /* core fix: hero-marwyn */,
    // phase 4 engine hooks (ARCHITECTURE §5.3) + the shared aura-threat query read by AutoPlay and the HUD
    'modifyFinalDamage', 'preventDeath', 'onAnyDeath', 'onAllyDowned', 'modifyHeal', 'modifyMoveCost', 'modifyOutgoingPush',
    'onCostPaid', 'threatAt',
    // v2: initiative rolls (modifyGuard is gone with Guard: a content hook named so is reported as unknown)
    'modifyInitiative'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const ENEMY_BARK_KEYS = ['spawn', 'attack', 'hurt', 'death'];
  const UNIT_FLAGS = ['flying', 'hop', 'large', 'immovable', 'stunImmune', 'invulnerable', 'untargetable', 'immune'];
  const NARRATION_KEYS = ['combat_start', 'elite_start', 'boss_start', 'victory', 'defeat', 'kill', 'env_kill', 'overkill', 'multi_kill',
    'hero_downed', 'hero_revived', 'hero_death', 'level_up', 'signature', 'round_start', 'enemy_turn', 'shop_greet', 'shop_buy', 'shop_broke',
    'shop_leave', 'tavern_greet', 'rest', 'recruit', 'map_enter', 'act_intro_1', 'act_intro_2', 'act_intro_3', 'act_clear', 'treasure', 'tips',
    'gameover_title', 'victory_title', 'run_start', 'idle_dm'];
  // DESIGN §5 targets (HP per act and tier), with some slack; outside them is an advisory, not a failure
  const ENEMY_HP = { minion: [[6, 9], [10, 14], [14, 18]], normal: [[12, 20], [20, 30], [28, 40]], elite: [[45, 70], [80, 110], [120, 150]],
    boss: [[150, 200], [260, 320], [420, 520]] };
  const SPRITE = {
    base: ['humanoid', 'quadruped', 'blob', 'flyer', 'swarm', 'construct', 'custom'],
    build: ['tiny', 'slim', 'normal', 'stocky', 'huge'],
    outfit: ['robe', 'tunic', 'armor', 'furs', 'coat', 'rags', 'dress', 'none'],
    ears: ['none', 'elf', 'goblin', 'rabbit', 'rabbit_floppy', 'cat', 'dog', 'bear', 'pointy', 'rat'],
    horns: ['none', 'tiefling', 'ram', 'demon', 'antlers', 'unicorn'],
    hair: ['none', 'short', 'long', 'wild', 'mohawk', 'bun', 'ponytail', 'braids'],
    // [integration fix, enemies-act1 request] 'tentacles' / 'mushroom': extras the sprite painter supports (sprites.js OPTIONS)
    beard: ['none', 'stubble', 'short', 'long', 'wild', 'tentacles'],
    hat: ['none', 'wizard', 'hood', 'crown', 'tophat', 'plague', 'helmet', 'viking', 'beret', 'flowers', 'bandana', 'mortarboard', 'cowl', 'mushroom'],
    face: ['none', 'plague_mask', 'skull', 'bandit_mask', 'glasses', 'monocle', 'sunglasses', 'eyepatch'],
    eyes: ['normal', 'glow', 'angry', 'sleepy', 'big', 'cyclops', 'none'],
    mouth: ['none', 'smile', 'grin', 'fangs', 'tusks', 'frown', 'open', 'gold_teeth'],
    wings: ['none', 'fairy', 'bat', 'bird', 'demon'],
    tail: ['none', 'devil', 'rabbit', 'cat', 'lizard', 'dog', 'rat'],
    mainhand: ['none', 'staff', 'sword', 'greatsword', 'axe', 'greataxe', 'dagger', 'bow', 'crossbow', 'lute', 'book', 'wand', 'cane', 'flask', 'scythe', 'club', 'spear', 'orb', 'torch', 'scroll', 'quill', 'hammer'],
    offhand: ['none', 'shield', 'flask', 'book', 'orb', 'torch', 'lantern', 'scroll', 'dagger'],
    bling: ['chain', 'rings', 'earrings', 'crown', 'grill', 'bracelets'],
    extras: ['scarf', 'cape', 'belt', 'bandolier', 'sash', 'pouches', 'satchel', 'collar'],
    aura: ['flames', 'glow', 'sparkles', 'smoke', 'runes', 'blood', 'notes', 'leaves', 'bubbles'],
  };

  const CANON = {
    terrain: ['stone', 'cobble', 'dirt', 'grass', 'wood', 'sand', 'moss', 'crypt', 'obsidian', 'felt', 'paper', 'gold', 'carpet', 'grate', 'marble',
      'wall', 'pit', 'water', 'deep_water', 'lava', 'mud', 'ice', 'rubble', 'bridge'],
    objects: ['crate', 'barrel', 'barrel_explosive', 'keg', 'pillar', 'rock', 'tree', 'dead_tree', 'bush', 'mushroom', 'gravestone', 'coffin',
      'statue', 'lever', 'pressure_plate', 'chest', 'fountain', 'brazier', 'spikes', 'totem', 'bookshelf', 'candles', 'mirror', 'd20', 'soda_can',
      'pencil', 'gold_pile', 'bones', 'fence', 'pipe', 'valve'],
    surfaces: ['fire', 'poison', 'water', 'oil', 'ice', 'blood', 'web', 'steam', 'smoke', 'holy', 'electric', 'cheeto'],
  };

  function all(kind) { const bag = DD.defs[kind]; return Object.keys(bag).map(function (k) { return bag[k]; }); }
  function isTest(id) { return String(id).indexOf('test_') === 0; }
  function badText(s) { return typeof s !== 'string' || !s.trim() || /undefined|NaN|\[object /.test(s); }
  function key(p) { return p.x + ',' + p.y; }
  function quote(s) { s = String(s); return '"' + (s.length > 90 ? s.slice(0, 87) + '...' : s) + '"'; }

  /** Report soft notes (design ranges, odd numbers) as one warning line under the suite, never as a failure. */
  function advise(label, notes) {
    notes = notes.filter(function (x, i) { return notes.indexOf(x) === i; });
    if (!notes.length) return;
    DD.warn('content advisory — ' + label + ' (' + notes.length + '): ' + notes.slice(0, 10).join(' · ') + (notes.length > 10 ? ' · … ' + (notes.length - 10) + ' more' : ''));
  }

  /** The number appears as a number of its own in the text ("Deal 9 fire damage" mentions 9, "19" does not). */
  function mentions(text, n) {
    const s = String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^0-9.])' + s + '(?![0-9])').test(String(text));
  }

  /** A stand-in user for resolving per-level numbers ((L, user) => ...) outside a fight. */
  const PROBE = { id: 'probe', name: 'Probe', defId: 'probe', kind: 'hero', side: 'hero', hp: 20, maxHp: 20, ap: 3, maxAp: 3, mov: 4, level: 3,
    block: 0, armor: 0, x: 0, y: 0, statuses: [], flags: {}, data: {}, skills: [], items: [], scars: [], tags: [], resist: {},
    dmgBonus: 0, healBonus: 0, rangeBonus: 0, intents: [], facing: 1, init: 0, apBank: 0 };

  /** Problems with a SpriteSpec (array of strings). */
  function spriteProblems(spec) {
    const p = [];
    if (!spec || typeof spec !== 'object') return ['missing sprite'];
    if (SPRITE.base.indexOf(spec.base) < 0) p.push('base "' + spec.base + '"');
    if (spec.scale !== undefined && !(typeof spec.scale === 'number' && spec.scale > 0 && spec.scale < 5)) p.push('scale');
    if (spec.palette !== undefined && (typeof spec.palette !== 'object' || !spec.palette)) p.push('palette');
    if (spec.base === 'custom' && typeof spec.draw !== 'function') p.push('custom base without draw()');
    ['build', 'outfit', 'wings', 'tail', 'mainhand', 'offhand'].forEach(function (k) {
      if (spec[k] !== undefined && SPRITE[k].indexOf(spec[k]) < 0) p.push(k + ' "' + spec[k] + '"');
    });
    if (spec.head) ['ears', 'horns', 'hair', 'beard', 'hat', 'face', 'eyes', 'mouth'].forEach(function (k) {
      if (spec.head[k] !== undefined && SPRITE[k].indexOf(spec.head[k]) < 0) p.push('head.' + k + ' "' + spec.head[k] + '"');
    });
    ['bling', 'extras'].forEach(function (k) {
      if (spec[k] !== undefined) {
        if (!Array.isArray(spec[k])) p.push(k + ' not an array');
        else spec[k].forEach(function (v) { if (SPRITE[k].indexOf(v) < 0) p.push(k + ' "' + v + '"'); });
      }
    });
    if (spec.aura && SPRITE.aura.indexOf(spec.aura.kind) < 0) p.push('aura.kind "' + spec.aura.kind + '"');
    if (spec.overlay !== undefined && spec.overlay !== null && typeof spec.overlay !== 'function') p.push('overlay not a function');
    return p;
  }
  T.contentHelpers = { spriteProblems: spriteProblems };

  function hookProblems(hooks, label) {
    const p = [];
    if (!hooks) return p;
    if (typeof hooks !== 'object') return [label + ': hooks is not an object'];
    for (const k in hooks) {
      if (typeof hooks[k] !== 'function') p.push(label + ': hook ' + k + ' is not a function');
      else if (HOOKS.indexOf(k) < 0) p.push(label + ': unknown hook name "' + k + '"');
    }
    return p;
  }

  function call(fn, args) {
    try { return { v: fn.apply(null, args) }; } catch (e) { return { err: e && e.message ? e.message : String(e) }; }
  }

  /** Per-level numbers of a skill (costs, cooldown, range, area size) as the engine resolves them: [problems]. */
  function levelProblems(s) {
    const p = [];
    for (let lv = 1; lv <= s.levels.length; lv++) {
      const L = s.levels[lv - 1];
      if (!L || typeof L !== 'object' || Array.isArray(L)) { p.push('levels[' + (lv - 1) + '] is not an object'); continue; }
      ['ap', 'hpCost', 'cooldown'].forEach(function (k) {
        const r = typeof s[k] === 'function' ? call(s[k], [L, PROBE]) : { v: s[k] };
        if (r.err) p.push('L' + lv + ' ' + k + '(L, user) threw: ' + r.err);
        else if (typeof r.v !== 'number' || !isFinite(r.v) || r.v < 0) p.push('L' + lv + ' ' + k + ' resolves to ' + JSON.stringify(r.v));
      });
      const tg = s.target || {};
      if (tg.range !== undefined && tg.type !== 'self' && tg.type !== 'dir') {
        const r = typeof tg.range === 'function' ? call(tg.range, [L, PROBE]) : { v: tg.range };
        const v = r.v;
        const ok = typeof v === 'number' ? isFinite(v) && v >= 0 :
          Array.isArray(v) && v.length === 2 && v.every(function (x) { return typeof x === 'number' && isFinite(x) && x >= 0; }) && v[0] <= v[1];
        if (r.err) p.push('L' + lv + ' target.range(L, user) threw: ' + r.err);
        else if (!ok) p.push('L' + lv + ' target.range resolves to ' + JSON.stringify(v) + ' (want [min, max] with min ≤ max)');
      }
      if (s.area && s.area.size !== undefined) {
        const r = typeof s.area.size === 'function' ? call(s.area.size, [L, PROBE]) : { v: s.area.size };
        if (r.err) p.push('L' + lv + ' area.size(L, user) threw: ' + r.err);
        else if (typeof r.v !== 'number' || !isFinite(r.v) || r.v < 0) p.push('L' + lv + ' area.size resolves to ' + JSON.stringify(r.v));
      }
    }
    return p;
  }

  /** What a level looks like to the player: description + resolved cost, cooldown, range and area size. */
  function levelFace(s, lv) {
    const L = DD.skillLevel(s, lv);
    const res = function (v) { return typeof v === 'function' ? call(v, [L, PROBE]).v : v; };
    return JSON.stringify([DD.skillDesc(s, lv, null), res(s.ap), res(s.hpCost), res(s.cooldown), res(s.target && s.target.range), res(s.area && s.area.size)]);
  }

  /** Socketable skills: a hero's pool or generic (learnable via tomes). They level I → II → III. */
  function socketable(s) {
    if (isTest(s.id)) return false;
    if (s.owner === 'generic') return true;
    const h = DD.getHero(s.owner);
    return !!h && (h.skillPool || []).indexOf(s.id) >= 0;
  }

  T.suite('content: registry cross-references', function (t) {
    const heroes = all('heroes'), skills = all('skills'), enemies = all('enemies'), summons = all('summons');
    const notes = [];
    // [integration fix] the validator's sprite whitelist accepts every option the painter supports (no drift)
    if (DD.Sprites && DD.Sprites.OPTIONS) Object.keys(SPRITE).forEach(function (k) {
      (DD.Sprites.OPTIONS[k] || []).forEach(function (v) { t.ok(SPRITE[k].indexOf(v) >= 0, 'sprite option ' + k + ' "' + v + '" (sprites.js) is accepted by the content validator'); });
    });
    t.ok(heroes.length >= 4, 'at least 4 heroes (' + heroes.length + ')');
    heroes.forEach(function (h) {
      const L = 'hero ' + h.id;
      t.ok(h.stats && h.stats.hp > 0 && h.stats.ap > 0 && h.stats.mov > 0, L + ': stats');
      t.ok(h.growth && typeof h.growth.hp === 'number', L + ': growth.hp');
      [h.basic, h.signature].forEach(function (sid, i) {
        const s = DD.getSkill(sid);
        t.ok(!!s, L + ': ' + (i ? 'signature' : 'basic') + ' skill "' + sid + '" exists');
        if (s) t.ok(s.owner === h.id || s.owner === 'generic', L + ': ' + sid + ' owner matches');
      });
      const sig = DD.getSkill(h.signature);
      if (sig) t.eq(sig.hype, 100, L + ': signature costs 100 Hype');
      const basic = DD.getSkill(h.basic);
      if (basic) t.ok(!basic.hype && !basic.charges, L + ': basic attack ' + h.basic + ' needs no Hype and has no charge limit (it is always available)');
      t.ok(Array.isArray(h.startingSkills) && h.startingSkills.length === 2, L + ': exactly 2 starting skills');
      t.ok(Array.isArray(h.skillPool) && h.skillPool.length >= 2, L + ': skill pool');
      if (!isTest(h.id)) t.ok(h.skillPool.length >= 9 && h.skillPool.length <= 11, L + ': pool of 9-11 skills (' + h.skillPool.length + ')');
      (h.startingSkills || []).forEach(function (sid) { t.ok((h.skillPool || []).indexOf(sid) >= 0, L + ': starting skill ' + sid + ' is in the pool'); });
      (h.skillPool || []).forEach(function (sid) {
        const s = DD.getSkill(sid);
        t.ok(!!s, L + ': pool skill "' + sid + '" exists');
        if (s) t.ok(s.owner === h.id, L + ': pool skill ' + sid + ' owner "' + s.owner + '"');
        if (s) t.ok(sid !== h.basic && sid !== h.signature, L + ': basic/signature are never socketed (' + sid + ')');
        if (s && s.hype > 0) t.fail(L + ': pool skill ' + sid + ' costs Hype (only the signature does)');
      });
      t.eq(new Set(h.skillPool || []).size, (h.skillPool || []).length, L + ': no duplicate pool entries');
      (h.summons || []).forEach(function (sid) { t.ok(!!DD.getSummon(sid), L + ': summon "' + sid + '" exists'); });
      t.ok(h.passive && !badText(h.passive.name) && !badText(h.passive.desc), L + ': passive name + desc');
      hookProblems(h.passive && h.passive.hooks, L).forEach(function (p) { t.fail(p); });
      // ARCHITECTURE §3.1: null | { act: N } | { boss: enemyId } (boss unlocks: surgical fix by hero-buga, see docs/notes/hero-buga.md)
      t.ok(h.unlock === null || (h.unlock && ([1, 2, 3].indexOf(h.unlock.act) >= 0 || (typeof h.unlock.boss === 'string' && h.unlock.boss.length > 0))), L + ': unlock');
      spriteProblems(h.sprite).forEach(function (p) { t.fail(L + ' sprite: ' + p); });
      const minBarks = isTest(h.id) ? 1 : 3;
      BARK_KEYS.forEach(function (k) {
        t.ok(h.barks && Array.isArray(h.barks[k]) && h.barks[k].length >= minBarks, L + ': barks.' + k + ' needs ' + minBarks + '+ lines (DESIGN §6: 3-6), has ' + (h.barks && Array.isArray(h.barks[k]) ? h.barks[k].length : 0));
      });
      if (h.barks) for (const k in h.barks) (h.barks[k] || []).forEach(function (line) { t.ok(typeof line === 'string' && line.length <= 90, L + ': bark length ' + JSON.stringify(line)); });
      if (h.stats && h.stats.init !== undefined) t.ok(typeof h.stats.init === 'number' && isFinite(h.stats.init), L + ': stats.init is a number (initiative modifier)');
      if (!isTest(h.id) && h.stats) {
        if (h.stats.hp < 20 || h.stats.hp > 36) notes.push(L + ' HP ' + h.stats.hp + ' (DESIGN 20-36)');
        if (h.stats.init !== undefined && (h.stats.init < -2 || h.stats.init > 4)) notes.push(L + ' initiative ' + h.stats.init + ' (DESIGN −2..+4)');
        if (h.stats.ap !== 3) notes.push(L + ' AP ' + h.stats.ap + ' (DESIGN 3)');
        if (h.stats.mov < 3 || h.stats.mov > 5) notes.push(L + ' move ' + h.stats.mov + ' (DESIGN 3-5)');
      }
      for (const f in (h.flags || {})) if (UNIT_FLAGS.indexOf(f) < 0) notes.push(L + ' flag "' + f + '" is not read by the engine (' + UNIT_FLAGS.join('/') + ')');
    });
    const owners = { generic: 1, enemy: 1, summon: 1 };
    heroes.forEach(function (h) { owners[h.id] = 1; });
    skills.forEach(function (s) {
      const L = 'skill ' + s.id;
      t.ok(owners[s.owner], L + ': owner "' + s.owner + '" is a hero id / generic / enemy / summon');
      t.ok(SKILL_KINDS.indexOf(s.kind) >= 0, L + ': kind "' + s.kind + '"');
      t.ok(Array.isArray(s.tags), L + ': tags');
      t.ok(typeof s.execute === 'function', L + ': execute');
      t.ok(s.target && TARGET_TYPES.indexOf(s.target.type) >= 0, L + ': target.type');
      if (s.target) t.ok(FILTERS.indexOf(s.target.filter) >= 0, L + ': target.filter "' + s.target.filter + '"');
      const shape = (s.area && s.area.shape) || 'single';
      t.ok(SHAPES.indexOf(shape) >= 0, L + ': area.shape "' + shape + '"');
      if (shape === 'custom') t.ok(typeof s.area.fn === 'function', L + ': custom area fn');
      t.ok(ANCHORS.indexOf(s.anchor) >= 0, L + ': anchor "' + s.anchor + '"');
      t.ok(Array.isArray(s.levels) && s.levels.length >= 1 && s.levels.length <= 3, L + ': 1-3 levels');
      ['ap', 'hpCost', 'cooldown'].forEach(function (k) { t.ok(typeof s[k] === 'number' || typeof s[k] === 'function', L + ': ' + k); });
      t.ok(typeof s.charges === 'number' && typeof s.hype === 'number', L + ': charges/hype');
      t.ok(typeof s.icon === 'string' && s.icon.length > 0, L + ': icon');
      ['canUse', 'aiScore', 'preview'].forEach(function (k) { t.ok(s[k] === null || s[k] === undefined || typeof s[k] === 'function', L + ': ' + k); });
      if (Array.isArray(s.levels)) levelProblems(s).forEach(function (p) { t.fail(L + ': ' + p); });
      if (s.anchor === 'unit' && s.owner === 'enemy' && s.target && s.target.type !== 'unit') notes.push(L + ": anchor 'unit' on a " + s.target.type + '-target skill (it tracks whoever stands on the tile, else falls back to ground)');
    });
    // socketable skills level I → II → III, and every level must look different to the player
    skills.filter(socketable).forEach(function (s) {
      const L = 'skill ' + s.id;
      if (!Array.isArray(s.levels) || s.levels.length !== 3) { t.fail(L + ': socketable skills need 3 levels (I → II → III, DESIGN §1/§6); it has ' + (s.levels ? s.levels.length : 0)); return; }
      const f = [1, 2, 3].map(function (lv) { return levelFace(s, lv); });
      if (f[0] === f[1]) t.fail(L + ': levels I and II look identical (same description, cost, cooldown, range and area) — upgrading must change something visible');
      if (f[1] === f[2]) t.fail(L + ': levels II and III look identical (same description, cost, cooldown, range and area) — upgrading must change something visible');
    });
    enemies.forEach(function (e) {
      const L = 'enemy ' + e.id;
      t.ok([1, 2, 3].indexOf(e.act) >= 0, L + ': act');
      t.ok(TIERS.indexOf(e.tier) >= 0, L + ': tier');
      t.ok(e.hp > 0 && e.mov >= 0, L + ': hp/mov');
      t.ok(Array.isArray(e.skills), L + ': skills');
      (e.skills || []).forEach(function (sid) {
        const s = DD.getSkill(sid);
        t.ok(!!s, L + ': skill "' + sid + '" exists');
        if (s) t.ok(s.owner === 'enemy', L + ': skill ' + sid + ' has owner enemy');
      });
      const ai = e.ai;
      t.ok(ai === 'default' || typeof ai === 'function' || (ai && typeof ai === 'object' && STYLES.indexOf(ai.style) >= 0) || STYLES.indexOf(ai) >= 0, L + ': ai');
      if (e.tier === 'boss') t.ok(e.boss && !badText(e.boss.title || 'x'), L + ': boss info');
      if (e.init !== undefined) t.ok(typeof e.init === 'number' && isFinite(e.init), L + ': init is a number (initiative modifier)');
      if (e.turnsPerRound !== undefined) t.ok([1, 2, 3, 4].indexOf(e.turnsPerRound) >= 0, L + ': turnsPerRound 1-4');
      t.ok(Array.isArray(e.gold) || typeof e.gold === 'number', L + ': gold');
      hookProblems(e.hooks, L).forEach(function (p) { t.fail(p); });
      spriteProblems(e.sprite).forEach(function (p) { t.fail(L + ' sprite: ' + p); });
      for (const k in (e.resist || {})) t.ok(typeof e.resist[k] === 'number' && e.resist[k] >= 0, L + ': resist.' + k);
      for (const k in (e.barks || {})) {
        const lines = e.barks[k];
        t.ok(Array.isArray(lines) && lines.every(function (b) { return typeof b === 'string' && b.length > 0 && b.length <= 90; }), L + ': barks.' + k + ' is a list of short strings');
      }
      if (!/^(test_|wm_)/.test(e.id)) {
        ENEMY_BARK_KEYS.forEach(function (k) { if (!e.barks || !Array.isArray(e.barks[k]) || e.barks[k].length < 2) notes.push(L + ' barks.' + k + ' (DESIGN §8: 2-4 lines)'); });
        const band = ENEMY_HP[e.tier] && ENEMY_HP[e.tier][e.act - 1];
        if (band && (e.hp < band[0] * 0.8 || e.hp > band[1] * 1.25)) notes.push(L + ' HP ' + e.hp + ' (DESIGN act ' + e.act + ' ' + e.tier + ': ' + band[0] + '-' + band[1] + ')');
      }
      for (const f in (e.flags || {})) if (UNIT_FLAGS.indexOf(f) < 0) notes.push(L + ' flag "' + f + '" is not read by the engine');
    });
    summons.forEach(function (m) {
      const L = 'summon ' + m.id;
      t.ok(m.hp > 0 && typeof m.ap === 'number', L + ': hp/ap');
      (m.skills || []).forEach(function (sid) {
        const s = DD.getSkill(sid);
        t.ok(!!s, L + ': skill "' + sid + '" exists');
        if (s) t.ok(s.owner === 'summon' || owners[s.owner], L + ': skill ' + sid + ' owner');
      });
      if (m.names !== undefined) t.ok(Array.isArray(m.names) && m.names.every(function (n) { return !badText(n); }), L + ': names is a list of strings');
      hookProblems(m.hooks, L).forEach(function (p) { t.fail(p); });
      spriteProblems(m.sprite).forEach(function (p) { t.fail(L + ' sprite: ' + p); });
    });
    all('encounters').forEach(function (en) {
      const L = 'encounter ' + en.id;
      t.ok([1, 2, 3].indexOf(en.act) >= 0 && ['normal', 'elite', 'boss'].indexOf(en.kind) >= 0, L + ': act/kind');
      t.ok(en.map && (en.map.layout || en.map.w || en.map.theme), L + ': map');
      t.ok(Array.isArray(en.enemies) && en.enemies.length > 0, L + ': enemies');
      (en.enemies || []).forEach(function (e) {
        t.ok(!!DD.getEnemy(e.id), L + ': enemy "' + e.id + '" exists');
        t.ok(typeof e.n === 'number' || (Array.isArray(e.n) && e.n[0] <= e.n[1]) || e.n === undefined, L + ': n');
      });
      (en.reinforcements || []).forEach(function (w) { (w.enemies || []).forEach(function (e) { t.ok(!!DD.getEnemy(e.id), L + ': reinforcement "' + e.id + '" exists'); }); });
      const otype = typeof en.objective === 'string' ? en.objective : (en.objective || {}).type;
      t.ok(['killAll', 'boss', 'survive', 'destroy', 'protect', 'custom'].indexOf(otype) >= 0, L + ': objective');
      if (otype === 'custom') t.ok(typeof en.checkObjective === 'function' || typeof (en.objective || {}).check === 'function', L + ': custom objective needs checkObjective(state)');
      if (en.kind === 'boss') t.ok(en.enemies.some(function (e) { const d = DD.getEnemy(e.id); return d && d.tier === 'boss'; }), L + ': has a boss');
      (en.enemies || []).forEach(function (e) { const d = DD.getEnemy(e.id); if (d && !/^(test_|mgt_|mg_)/.test(en.id) && d.act !== en.act) notes.push(L + ' (act ' + en.act + ') uses ' + e.id + ' (act ' + d.act + ')'); });
    });
    [1, 2, 3].forEach(function (act) {
      ['normal', 'elite', 'boss'].forEach(function (kind) {
        t.ok(all('encounters').some(function (en) { return en.act === act && en.kind === kind; }), 'an encounter for act ' + act + ' ' + kind);
      });
    });
    all('items').forEach(function (it) {
      const L = 'item ' + it.id;
      t.ok(['weapon', 'armor', 'trinket'].indexOf(it.slot) >= 0 && ['common', 'rare', 'legendary', 'cursed'].indexOf(it.rarity) >= 0, L + ': slot/rarity');
      for (const k in (it.stats || {})) t.ok(['hp', 'ap', 'mov', 'armor', 'dmg', 'heal', 'range', 'block', 'hype', 'init'].indexOf(k) >= 0 && typeof it.stats[k] === 'number' && isFinite(it.stats[k]), L + ': stat ' + k);
      // v2: nobody starts a fight with Block, so stats.block does nothing any more (the next content pass converts it)
      if (it.stats && it.stats.block) notes.push(L + ': stats.block ' + it.stats.block + ' is ignored in v2 (no combat-start Block)');
      if (it.hero) t.ok(!!DD.getHero(it.hero), L + ': hero restriction exists');
      t.ok(!badText(it.desc) && !badText(it.name), L + ': name/desc');
      hookProblems(it.hooks, L).forEach(function (p) { t.fail(p); });
      if (it.stats && (Math.abs(it.stats.dmg || 0) >= 2 || Math.abs(it.stats.heal || 0) >= 2)) t.fail(L + ': stats.dmg / stats.heal are fractions (0.1 = +10%), got ' + JSON.stringify(it.stats));
    });
    all('consumables').forEach(function (c) {
      const L = 'consumable ' + c.id;
      t.ok(typeof c.execute === 'function' && c.target && TARGET_TYPES.indexOf(c.target.type) >= 0, L + ': target + execute');
      t.ok(typeof c.ap === 'number', L + ': ap');
      if (c.target) t.ok(FILTERS.indexOf(c.target.filter) >= 0, L + ': target.filter "' + c.target.filter + '"');
      const shape = (c.area && c.area.shape) || 'single';
      t.ok(SHAPES.indexOf(shape) >= 0, L + ': area.shape "' + shape + '"');
    });
    all('statuses').forEach(function (s) {
      t.ok(['buff', 'debuff'].indexOf(s.type) >= 0 && ['stack', 'refresh', 'none'].indexOf(s.stacking) >= 0, 'status ' + s.id + ': type/stacking');
      t.ok(['turnEnd', 'turnStart', 'never'].indexOf(s.decay || 'turnEnd') >= 0, 'status ' + s.id + ': decay "' + s.decay + '"');
      hookProblems(s.hooks, 'status ' + s.id).forEach(function (p) { t.fail(p); });
    });
    all('scars').forEach(function (s) { hookProblems(s.hooks, 'scar ' + s.id).forEach(function (p) { t.fail(p); }); t.ok(!badText(s.desc), 'scar ' + s.id + ': desc'); });
    all('terrain').forEach(function (d) { t.ok(d.colors || d.color, 'terrain ' + d.id + ': colors'); });
    all('objects').forEach(function (d) {
      t.ok(d.color || d.colors || typeof d.draw === 'function', 'object ' + d.id + ': color/colors/draw for the renderer fallback');
      t.ok(!badText(d.desc), 'object ' + d.id + ': desc');
      if (d.interact) t.ok(typeof d.interact.fn === 'function' && !badText(d.interact.label || 'Use'), 'object ' + d.id + ': interact');
    });
    CANON.terrain.forEach(function (id) { t.ok(!!DD.getTerrain(id), 'canonical terrain ' + id); });
    CANON.objects.forEach(function (id) { t.ok(!!DD.getObject(id), 'canonical object ' + id); });
    CANON.surfaces.forEach(function (id) { t.ok(!!DD.getSurface(id), 'canonical surface ' + id); });
    all('surfaces').forEach(function (d) { t.ok(typeof d.color === 'string' && !badText(d.desc), 'surface ' + d.id + ': color/desc'); });
    all('events').forEach(function (ev) {
      const L = 'event ' + ev.id;
      t.ok(Array.isArray(ev.choices) && ev.choices.length >= 1, L + ': choices');
      (ev.choices || []).forEach(function (ch, i) { t.ok(!badText(ch.label) && typeof ch.resolve === 'function', L + ': choice ' + i); });
    });
    const narr = DD.defs.narration;
    // [integration fix, bosses-act2 request] "is the narrator pack loaded?" keys off a narrator-owned key instead of
    // "more than 10 keys registered", so isolated runs of content files with many keys of their own (bosses) still pass.
    if (narr.idle_dm || narr.gameover_title) NARRATION_KEYS.forEach(function (k) { t.ok(narr[k] && narr[k].length > 0, 'narration key ' + k); });
    else t.log('narrator pack (js/data/narrator.js) not loaded: core narration key check skipped');
    advise('registry', notes);
  });

  T.suite('content: descriptions at every level (and they show their numbers)', function (t) {
    const probe = { id: 'probe', name: 'Probe', hp: 20, maxHp: 20, statuses: [], flags: {}, x: 0, y: 0, side: 'hero', kind: 'hero', data: {} };
    all('skills').forEach(function (s) {
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = DD.skillDesc(s, lv, probe);
        t.ok(!badText(d), 'skill ' + s.id + ' L' + lv + ' desc: ' + JSON.stringify(d));
        const dn = DD.skillDesc(s, lv, null);
        t.ok(!badText(dn), 'skill ' + s.id + ' L' + lv + ' desc without a user: ' + JSON.stringify(dn));
        // ARCHITECTURE §3.2: "Damage numbers in desc must match execute" — the level's own numbers must be shown
        const L = DD.skillLevel(s, lv);
        ['dmg', 'heal'].forEach(function (k) {
          if (typeof L[k] === 'number' && L[k] > 0 && !badText(dn) && !mentions(dn, L[k])) {
            t.fail('skill ' + s.id + ' L' + lv + ': desc does not show its ' + k + ' ' + L[k] + ' — ' + quote(dn));
          }
        });
      }
      if (s.flavor) t.ok(typeof s.flavor === 'string' && s.flavor.length <= 160, 'skill ' + s.id + ' flavor length');
    });
    all('consumables').forEach(function (c) {
      const d = typeof c.desc === 'function' ? DD.safe('desc of ' + c.id, c.desc, c, [DD.skillLevel(c, 1), probe]) : c.desc;
      t.ok(!badText(d), 'consumable ' + c.id + ' desc');
    });
    all('statuses').forEach(function (s) {
      [{ stacks: 1, turns: 1 }, { stacks: 3, turns: -1 }].forEach(function (o) {
        const d = DD.safe('status desc ' + s.id, s.desc, s, [{ id: s.id, stacks: o.stacks, turns: o.turns, source: null, data: {} }]);
        t.ok(!badText(d), 'status ' + s.id + ' desc');
      });
    });
    all('heroes').forEach(function (h) { t.ok(!badText(h.blurb) && !badText(h.name), 'hero ' + h.id + ' name/blurb'); });
    all('enemies').forEach(function (e) { t.ok(!badText(e.desc), 'enemy ' + e.id + ' desc'); });
  });

  // ---- execution helpers ------------------------------------------------------------------------------
  function realHeroIds() {
    const ids = Object.keys(DD.defs.heroes).filter(function (k) { return !isTest(k); });
    return ids.length ? ids : Object.keys(DD.defs.heroes);
  }
  function anyHeroId(not) { const ids = realHeroIds().filter(function (k) { return k !== not; }); return ids[0] || not; }

  /** Units sane: finite numbers, HP within bounds, in bounds, no two living units sharing a tile. */
  function sanity(t, label) {
    const s = DD.Combat.state;
    const seen = {};
    let ok = true;
    s.units.forEach(function (u) {
      ['hp', 'maxHp', 'block', 'ap', 'x', 'y'].forEach(function (k) {
        if (typeof u[k] !== 'number' || !isFinite(u[k])) { ok = false; t.fail(label + ': ' + u.name + '.' + k + ' = ' + u[k]); }
      });
      if (u.hp < 0 || u.hp > u.maxHp) { ok = false; t.fail(label + ': ' + u.name + ' hp ' + u.hp + '/' + u.maxHp); }
      (u.statuses || []).forEach(function (st) {
        if (!DD.getStatus(st.id) || !isFinite(st.stacks) || !isFinite(st.turns)) { ok = false; t.fail(label + ': bad status on ' + u.name + ' ' + JSON.stringify(st)); }
      });
      if (u.dead) return;
      if (!DD.Grid.inBounds(u.x, u.y)) { ok = false; t.fail(label + ': ' + u.name + ' out of bounds'); }
      else if (!u.downed && !DD.Grid.isWalkable(u.x, u.y, u)) { ok = false; t.fail(label + ': ' + u.name + ' stands on an unwalkable tile ' + key(u) + ' (' + DD.Grid.tile(u.x, u.y).t + ')'); }
      const k = key(u);
      if (seen[k]) { ok = false; t.fail(label + ': ' + u.name + ' shares ' + k + ' with ' + seen[k]); }
      seen[k] = u.name;
    });
    if (!isFinite(s.hype) || s.hype < 0 || s.hype > 100) { ok = false; t.fail(label + ': hype ' + s.hype); }
    return ok;
  }
  T.contentHelpers.sanity = sanity;

  /** Everything a HUD preview could leak into (units, slots, tiles, objects, Hype, log, RNG, gold, stats...). */
  function fingerprint(s) {
    return JSON.stringify([
      s.units.map(function (u) {
        return [u.id, u.x, u.y, u.hp, u.maxHp, u.block, u.ap, !!u.dead, !!u.downed, (u.statuses || []).map(function (st) { return [st.id, st.stacks, st.turns]; }),
          (u.intents || []).length, DD.Combat.slotsOf(u).map(function (sl) { return [sl.id, sl.cd, sl.uses]; }), u.data];
      }),
      s.grid.tiles.map(function (tl) { return [tl.t, tl.h, tl.surface && [tl.surface.id, tl.surface.turns], tl.obj && [tl.obj.id, tl.obj.hp, tl.obj.data]]; }),
      s.hype, s.log.length, s.rng.getState(), s.sandboxGold, (s.consumables || []).slice(), s.stats, s.round, s.phase, s.rules.length, s.data, s.result,
      s.order, s.turnIndex, s.current, s.turn, s.joining, s.units.map(function (u) { return u.apBank || 0; }),
      s.run ? [s.run.gold, (s.run.consumables || []).slice()] : null,
    ]);
  }
  function firstDiff(a, b) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return '…' + a.slice(Math.max(0, i - 50), i + 30) + '… became …' + b.slice(Math.max(0, i - 50), i + 30) + '…';
  }
  T.contentHelpers.fingerprint = fingerprint;

  /** Per-unit HP/down state + Hype before a use, to compare with the preview afterwards. */
  function outcomeBefore(s) {
    const units = {};
    s.units.forEach(function (u) { units[u.id] = { hp: u.hp, dead: !!u.dead, downed: !!u.downed }; });
    return { units: units, hype: s.hype };
  }
  /**
   * Differences between what a preview predicted and what really happened. A certain preview is exact; an uncertain
   * one (the outcome rolled dice: it shows other rolls' expected outcome, never the real roll) only has to be
   * well-formed: every entry flagged uncertain, finite numbers, min ≤ mean ≤ max.
   */
  function previewMismatches(prev, s, before) {
    if (prev && prev.uncertain) return uncertainProblems(prev);
    const out = [];
    const sign = function (n) { return n > 0 ? '−' + n : n < 0 ? '+' + -n : '±0'; };
    s.units.forEach(function (u) {
      const b = before.units[u.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[u.id];
      const real = b.hp - u.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
      if (real !== said) out.push(u.name + ' HP ' + sign(real) + ' for real, preview said ' + sign(said));
      const down = (u.dead && !b.dead) || (u.downed && !b.downed);
      if (down !== !!(e && e.lethal)) out.push(u.name + (down ? ' went down, the preview did not say so' : ' was predicted to go down but did not'));
    });
    const born = s.units.filter(function (u) { return !before.units[u.id] && !u.dead; }).length;
    if (born !== (prev.spawned || []).length) out.push(born + ' unit(s) appeared for real, preview said ' + (prev.spawned || []).length);
    if (s.hype - before.hype !== prev.hype) out.push('Hype ' + (s.hype - before.hype) + ' for real, preview said ' + prev.hype);
    return out;
  }
  function uncertainProblems(prev) {
    const out = [];
    Object.keys(prev.perUnit || {}).forEach(function (id) {
      const e = prev.perUnit[id];
      if (!e.uncertain) out.push(id + ': entry of an uncertain preview not flagged uncertain');
      ['dmg', 'heal', 'blocked', 'block'].forEach(function (k) {
        if (!isFinite(e[k]) || e[k] < 0) out.push(id + ': ' + k + ' = ' + e[k]);
        if (e[k + 'Min'] !== undefined && !(e[k + 'Min'] <= e[k] && e[k] <= e[k + 'Max'])) out.push(id + ': ' + k + ' ' + e[k] + ' outside ' + e[k + 'Min'] + '–' + e[k + 'Max']);
      });
      if (!/^\?/.test(e.text || '')) out.push(id + ': text "' + e.text + '" lacks the "?"');
    });
    if (!isFinite(prev.hype)) out.push('hype = ' + prev.hype);
    return out;
  }
  T.contentHelpers.uncertainProblems = uncertainProblems;

  /** 9×9 arena: user hero at (4,4), ally (3,4), downed ally (4,3), foes around, objects, water, a pit. */
  function arena(heroId, seed) {
    const ally = anyHeroId(heroId);
    const downed = Object.keys(DD.defs.heroes).filter(function (k) { return k !== heroId && k !== ally; })[0] || 'test_cleric';
    const s = DD.Combat.sandbox({
      w: 9, h: 9, seed: seed || 3, noPlan: true,
      objective: { type: 'custom', text: 'Arena' }, encounter: { id: 'content_arena', checkObjective: function () { return null; } },
      heroes: [{ id: heroId, x: 4, y: 4, level: 3 }, { id: ally, x: 3, y: 4, level: 3 }, { id: downed, x: 4, y: 3, level: 3 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_archer', x: 4, y: 7 }, { id: 'test_brute', x: 7, y: 2 }],
      objects: [{ x: 2, y: 2, id: 'crate' }, { x: 3, y: 5, id: 'barrel' }, { x: 6, y: 1, id: 'barrel_explosive' }, { x: 1, y: 7, id: 'lever' }],
      terrain: function (tl) { if (tl.x === 1 && tl.y <= 2) tl.t = 'water'; if (tl.x === 8 && tl.y === 8) tl.t = 'pit'; if (tl.x === 2 && tl.y === 6) tl.h = 1; },
      gold: 50, consumables: [],
    });
    const third = s.units.filter(function (u) { return u.kind === 'hero'; })[2];
    if (third) DD.Act.kill(third, null);
    return s;
  }
  T.contentHelpers.arena = arena;

  function spread(list, n) {
    if (list.length <= n) return list.slice();
    if (n <= 1) return n === 1 ? [list[Math.floor(list.length / 2)]] : [];
    const out = [];
    for (let i = 0; i < n; i++) out.push(list[Math.round(i * (list.length - 1) / (n - 1))]);
    return out;
  }

  /**
   * Up to n targets worth trying: the ones whose area holds the most foes (or units / objects) first, plus one
   * that holds nobody when there is one (execute must tolerate ctx.targetUnit === null and empty areas).
   */
  function pickTargets(user, slotOrDef, n) {
    const list = DD.Targeting.validTargets(user, slotOrDef);
    if (list.length <= n) return list;
    const scored = list.map(function (p, i) {
      const ctx = DD.Targeting.pure(function () { return DD.Targeting.buildCtx(user, slotOrDef, p); });
      const objs = ctx ? ctx.tiles.filter(function (q) { const tl = DD.Grid.tile(q.x, q.y); return tl && tl.obj; }).length : 0;
      return { p: p, i: i, v: ctx ? ctx.foes.length * 100 + ctx.units.length * 10 + objs : 0 };
    });
    const busy = scored.filter(function (e) { return e.v > 0; }).sort(function (a, b) { return b.v - a.v || a.i - b.i; });
    const idle = scored.filter(function (e) { return e.v === 0; });
    const out = busy.slice(0, idle.length ? n - 1 : n).map(function (e) { return e.p; });
    if (idle.length) out.push(idle[Math.floor(idle.length / 2)].p);
    return out.length >= n ? out : out.concat(spread(list.filter(function (p) { return out.indexOf(p) < 0; }), n - out.length));
  }
  function objectHp(s) {
    let n = 0;
    s.grid.tiles.forEach(function (tl) { if (tl.obj) n += 1000 + (tl.obj.hp || 0); });
    return n;
  }

  /** The unit + slot that will use a skill in a fresh arena. */
  function userFor(skill, level) {
    let heroId = DD.getHero(skill.owner) ? skill.owner : anyHeroId(null);
    if (skill.owner === 'summon') {
      const owner = Object.keys(DD.defs.heroes).filter(function (k) { const h = DD.getHero(k); return (h.summons || []).some(function (sid) { const sm = DD.getSummon(sid); return sm && (sm.skills || []).indexOf(skill.id) >= 0; }); })[0];
      heroId = owner || anyHeroId(null);
    }
    const s = arena(heroId, 3);
    const hero = s.units.filter(function (u) { return u.kind === 'hero' && u.defId === heroId; })[0];
    let user = hero;
    let slot;
    if (skill.owner === 'summon') {
      const sid = Object.keys(DD.defs.summons).filter(function (k) { return (DD.getSummon(k).skills || []).indexOf(skill.id) >= 0; })[0];
      DD.Combat.party().filter(function (u) { return u.kind === 'summon'; }).forEach(function (u) { DD.Act.kill(u, null); });
      user = sid ? DD.Act.summon(hero, sid, 5, 3, { ready: true, level: level, noFx: true }) : null;
      if (!user) return null;
      slot = DD.Combat.slotsOf(user).filter(function (sl) { return sl.id === skill.id; })[0];
      slot.level = level;
    } else if (hero.basic && hero.basic.id === skill.id) { slot = hero.basic; slot.level = level; }
    else if (hero.signature && hero.signature.id === skill.id) { slot = hero.signature; slot.level = level; }
    else { slot = DD.Act.makeSlot(skill.id, level); hero.skills = [slot]; }
    user.ap = 10;
    s.hype = 100;
    return { state: s, user: user, slot: slot, hero: hero };
  }

  /** Arm a rule on the current fight that records damage `user` deals (for the skill-execution notes). */
  function damageProbe(user) {
    const rec = { hits: 0, bases: [] };
    DD.Act.addRule({ id: 'content_damage_probe', name: 'Damage Probe', hooks: { onTakeDamage: function (d) {
      if (d.source !== user || d.target === user) return;
      rec.hits++;
      if (d.cause === 'skill') rec.bases.push(d.base);
    } } });
    return rec;
  }
  function levelNumbers(L) { return Object.keys(L || {}).map(function (k) { return L[k]; }).filter(function (v) { return typeof v === 'number'; }); }

  /** Run fn and report whether it called Math.random (allowed for cosmetics only; game logic must use ctx.rng). */
  function usesMathRandom(fn) {
    const orig = Math.random;
    let used = false;
    Math.random = function () { used = true; return orig(); };
    try { fn(); } finally { Math.random = orig; }
    return used;
  }

  T.suite('content: hero, generic and summon skills execute at every level (previews exact and side-effect free)', function (t) {
    const skills = all('skills').filter(function (s) { return s.owner !== 'enemy'; });
    let runs = 0;
    const noTarget = [], noDamage = [], notes = [], reported = {};
    skills.forEach(function (s) {
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const probe = userFor(s, lv);
        if (!probe) { t.fail('skill ' + s.id + ': no unit can use it (summon owner missing)'); continue; }
        const targets = pickTargets(probe.user, probe.slot, 3);
        if (!targets.length) { noTarget.push(s.id + ' L' + lv + ' (' + DD.Combat.canUse(probe.user, probe.slot) + ')'); continue; }
        const L = DD.skillLevel(s, lv);
        let hits = 0;
        targets.forEach(function (tg) {
          const u = userFor(s, lv);
          const st = DD.Combat.state;
          const label = 'skill ' + s.id + ' L' + lv + ' @' + tg.x + ',' + tg.y;
          // 1. the HUD previews on every hover: it must not change the real fight
          const fp = fingerprint(st);
          const prev = DD.Combat.preview(u.user, u.slot, tg.x, tg.y);
          const fp2 = fingerprint(st);
          if (fp2 !== fp) t.fail(label + ': its HUD preview changed the real combat state ' + firstDiff(fp, fp2));
          // 2. the real use
          const before = outcomeBefore(st);
          const objs = objectHp(st);
          const rec = damageProbe(u.user);
          const rolled = usesMathRandom(function () {
            const ok = DD.Combat.canUse(u.user, u.slot) === true && DD.Combat.useSkill(u.user, u.slot, tg.x, tg.y);
            if (!ok) DD.Combat._action(function () { DD.Combat.resolveSkill(u.user, u.slot, tg, { pay: true }); });
          });
          if (rolled && !reported['rnd:' + s.id]) { reported['rnd:' + s.id] = 1; notes.push(s.id + ' calls Math.random() while resolving (cosmetics only: game logic must use ctx.rng)'); }
          DD.Act.removeRule('content_damage_probe');
          hits += rec.hits + (objectHp(st) !== objs ? 1 : 0);
          const nums = levelNumbers(L);
          rec.bases.forEach(function (b) { if (nums.length && nums.indexOf(b) < 0) notes.push(s.id + ' L' + lv + ' dealt a base ' + b + ' (level numbers ' + JSON.stringify(L) + ')'); });
          // 3. the preview runs the same code on a copy: it must predict the outcome exactly, unless dice were rolled
          //    (then it is uncertain: other rolls' expected outcome, flagged "?", never the real roll)
          if (typeof s.preview !== 'function') {
            previewMismatches(prev, st, before).forEach(function (m) {
              t.fail(label + ': preview ≠ reality: ' + m + ' (Math.random / DD.rng / module state in execute? FX.call callbacks must be visual-only)');
            });
          }
          // 4. summons a hero's own skill creates must be listed in hero.summons (codex, tests)
          const owner = DD.getHero(s.owner);
          if (owner) {
            st.units.filter(function (x) { return !before.units[x.id] && x.kind === 'summon' && x.defId !== 'wm_duck'; }).forEach(function (x) {
              if ((owner.summons || []).indexOf(x.defId) >= 0 || reported['sum:' + s.id + x.defId]) return;
              reported['sum:' + s.id + x.defId] = 1;
              t.fail('hero ' + owner.id + ': skill ' + s.id + ' summons "' + x.defId + '", which is missing from hero.summons');
            });
          }
          runs++;
          t.ok(sanity(t, label), label + ': state sane');
          if (!DD.Combat.state.result) { DD.Combat.endRound(); sanity(t, label + ' (after a round)'); }
        });
        if (typeof L.dmg === 'number' && L.dmg > 0 && !hits) noDamage.push(s.id + ' L' + lv);
      }
    });
    t.ok(runs > 0, 'executed ' + runs + ' skill uses');
    t.log('skill executions: ' + runs);
    if (noTarget.length) t.log('no valid target in the arena (not executed): ' + noTarget.join(', '));
    if (noDamage.length) notes.push('levels[].dmg but no damage dealt in the arena: ' + noDamage.join(', '));
    advise('skills', notes);
  });

  T.suite('content: consumables are usable (previews exact and side-effect free)', function (t) {
    const list = all('consumables');
    if (!list.length) { t.skip('no consumables registered yet'); return; }
    list.forEach(function (c) {
      const heroId = anyHeroId(null);
      let s = arena(heroId, 5);
      let user = s.units.filter(function (u) { return u.kind === 'hero' && u.defId === heroId; })[0];
      s.consumables = [c.id];
      user.ap = 10;
      const targets = pickTargets(user, c, 2);
      if (!targets.length) { t.log('consumable ' + c.id + ': no target in the arena'); return; }
      targets.forEach(function (tg) {
        s = arena(heroId, 5);
        user = s.units.filter(function (u) { return u.kind === 'hero' && u.defId === heroId; })[0];
        s.consumables = [c.id];
        user.ap = 10;
        const label = 'consumable ' + c.id + ' @' + tg.x + ',' + tg.y;
        const fp = fingerprint(s);
        const prev = DD.Targeting.preview(user, c, tg);
        const fp2 = fingerprint(s);
        if (fp2 !== fp) t.fail(label + ': its HUD preview changed the real combat state ' + firstDiff(fp, fp2));
        const before = outcomeBefore(s);
        t.ok(DD.Combat.useConsumable(user, 0, tg.x, tg.y), label + ' used');
        t.eq(DD.Combat.consumables().indexOf(c.id), -1, 'consumable ' + c.id + ' removed from the inventory');
        if (typeof c.preview !== 'function') previewMismatches(prev, s, before).forEach(function (m) { t.fail(label + ': preview ≠ reality: ' + m); });
        sanity(t, label);
        if (!DD.Combat.state.result) DD.Combat.endRound();
        sanity(t, label + ' (after a round)');
      });
    });
  });

  T.suite('content: items equipped in a short autoplay battle', function (t) {
    const items = all('items');
    if (!items.length) { t.skip('no items registered yet'); return; }
    items.forEach(function (it, i) {
      const heroId = it.hero && DD.getHero(it.hero) ? it.hero : realHeroIds()[i % realHeroIds().length];
      const rh = DD.Combat.makeRunHero({ id: heroId, level: 3, items: [it.id] });
      DD.Combat.start({
        grid: DD.Combat.emptyGrid(9, 9), heroes: [{ runHero: rh, x: 1, y: 4 }, { id: anyHeroId(heroId), x: 1, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_archer', x: 7, y: 6 }],
      }, { seed: 11 + i, headless: true });
      const u = DD.Combat.heroes()[0];
      t.ok(u.items.indexOf(it.id) >= 0, 'item ' + it.id + ' equipped');
      t.eq(u.maxHp, Math.max(1, Math.round(DD.Combat.heroStats(rh).maxHp)), 'item ' + it.id + ': stats applied');
      DD.AutoPlay.runBattle(6);
      t.ok(sanity(t, 'item ' + it.id), 'item ' + it.id + ' battle');
    });
  });

  T.suite('content: every status applied and ticked', function (t) {
    all('statuses').forEach(function (st) {
      DD.Combat.sandbox({ w: 8, h: 8, seed: 2, noPlan: true, objective: { type: 'custom' }, encounter: { id: 'content_status', checkObjective: function () { return null; } },
        heroes: [{ id: anyHeroId(null), x: 1, y: 1 }, { id: anyHeroId(anyHeroId(null)), x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 2, y: 1 }, { id: 'test_archer', x: 6, y: 6 }] });
      const h = DD.Combat.heroes()[0], e = DD.Combat.enemies()[0];
      DD.Act.addStatus(h, st.id, { stacks: 2, turns: 2 }, e);
      DD.Act.addStatus(e, st.id, { stacks: 2, turns: 2 }, h);
      for (let i = 0; i < 2 && !DD.Combat.state.result; i++) DD.Combat.endRound();
      t.ok(sanity(t, 'status ' + st.id), 'status ' + st.id + ' applied + ticked');
    });
  });

  // ---- honest areas (v2: AI actions happen at once; boss wind-ups are the only telegraphs) ---------------------------
  /**
   * While fn runs, every damage an AI action deals (cause 'skill') must land on a unit that stood inside that action's
   * area (DD.AI.intentTiles) when it started to resolve: for a wind-up those are its marked tiles, for an action done at
   * once the area its skill declares (what the HUD's threat shading and AutoPlay's reach model assume). Dazzled /
   * confused / charmed / taunted attackers are exempt (their attack moves or turns). Call w.arm() after each fight
   * starts (rules belong to a fight). Returns { violations, notes, actions, windups }.
   */
  function watchAreas(fn) {
    const w = { violations: [], notes: [], actions: 0, windups: 0 };
    const AI = DD.AI, orig = AI.executeIntent;
    let cur = null;
    AI.executeIntent = function (unit, intent) {
      if (!unit || !intent || !DD.Combat.state) return orig.apply(AI, arguments);
      const loose = ['dazzled', 'confused', 'charmed', 'taunt'].some(function (id) { return DD.Act.hasStatus(unit, id); });
      const pos = {};
      DD.Combat.state.units.forEach(function (u) { if (!u.dead) pos[u.id] = key(u); });
      const prev = cur;
      cur = { unit: unit, intent: intent, tiles: loose ? null : AI.intentTiles(unit, intent).map(key), pos: pos };
      w.actions++;
      if (intent.windup) w.windups++;
      try { return orig.apply(AI, arguments); } finally { cur = prev; }
    };
    w.arm = function () {
      DD.Act.addRule({ id: 'content_area_watch', name: 'Area Watch', hooks: { onTakeDamage: function (d) {
        if (!cur || d.source !== cur.unit || d.cause !== 'skill' || d.target === cur.unit) return;
        const label = 'enemy ' + cur.unit.defId + ' skill ' + cur.intent.skillId + (cur.intent.windup ? ' (wind-up)' : '');
        const at = cur.pos[d.target.id];
        if (cur.tiles && at && cur.tiles.indexOf(at) < 0) {
          w.violations.push(label + ' hit ' + d.target.name + ' at ' + at + ', outside its ' + (cur.intent.windup ? 'marked tiles' : 'area') + ' [' + cur.tiles.join(' ') +
            '] — damage only units in ctx.tiles / ctx.foes, or widen the skill\'s area so it shows');
        }
        const def = DD.getSkill(cur.intent.skillId);
        const L = def ? DD.skillLevel(def, cur.intent.level || 1) : {};
        const nums = levelNumbers(L);
        if (nums.length && nums.indexOf(d.base) < 0) w.notes.push(label + ' dealt a base ' + d.base + ' (level numbers ' + JSON.stringify(L) + ')');
      } } });
    };
    try { fn(w); } finally { AI.executeIntent = orig; }
    return w;
  }
  T.contentHelpers.watchAreas = watchAreas;
  T.contentHelpers.watchTelegraphs = watchAreas;   // pre-v2 name (content test files)

  function uniq(list) { return list.filter(function (x, i) { return list.indexOf(x) === i; }); }

  T.suite('content: every enemy takes its turns for 3 rounds (areas and wind-ups honest)', function (t) {
    const team = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue'].filter(function (k) { return DD.getHero(k); });
    const notes = [];
    let actions = 0, windups = 0;
    all('enemies').forEach(function (def) {
      const w = watchAreas(function (w) {
        DD.Combat.sandbox({ w: 11, h: 11, seed: 4, objective: { type: 'custom' }, encounter: { id: 'content_enemy', checkObjective: function () { return null; } },
          heroes: team.map(function (id, i) { return { id: id, x: 1 + (i % 2), y: 3 + i, level: 4 }; }),
          enemies: [{ id: def.id, x: 7, y: 5 }] });
        w.arm();
        const s = DD.Combat.state;
        const e = s.units.filter(function (u) { return u.defId === def.id; })[0];
        let acted = false, turns = 0;
        DD.Act.addRule({ id: 'content_acted', name: 'Acted', hooks: { onSkillUsed: function (ctx) { if (ctx.user === e) acted = true; } } });
        const off = DD.Events.on('turn:start', function (ev) { if (ev.unit === e) turns++; });
        try { for (let r = 0; r < 3 && !s.result; r++) DD.Combat.endRound(); } finally { off(); }
        t.ok(sanity(t, 'enemy ' + def.id), 'enemy ' + def.id + ' ran 3 rounds');
        t.ok(turns > 0 || (e && e.dead) || !!s.result, 'enemy ' + def.id + ' got its turns (initiative entry)');
        if ((def.skills || []).length) t.ok(acted || (e && e.dead), 'enemy ' + def.id + ' used a skill within 3 rounds (an enemy that never acts: no valid targets, or a skill the default AI cannot aim? give it aiScore or a custom planner)');
      });
      actions += w.actions; windups += w.windups;
      uniq(w.violations).forEach(function (v) { t.fail(v); });
      Array.prototype.push.apply(notes, uniq(w.notes));
    });
    t.log('enemy actions resolved under the area watch: ' + actions + ' (' + windups + ' wind-ups)');
    advise('enemy damage numbers', uniq(notes));
  });

  T.suite('content: encounters build and auto-battle (areas and wind-ups honest)', function (t) {
    const encs = all('encounters');
    if (!DD.Encounter || typeof DD.Encounter.build !== 'function') { t.skip('DD.Encounter not available'); return; }
    if (!encs.length) { t.skip('no encounters registered'); return; }
    const n = Math.max(1, +(t.param('n', 1)) || 1);
    const pool = realHeroIds();
    const rng = DD.RNG('content-encounters:' + t.seed);
    const notes = [];
    let wins = 0, total = 0, rounds = 0, timeouts = 0;
    encs.forEach(function (en) {
      let won = 0, rsum = 0;
      for (let i = 0; i < n; i++) {
        const ids = rng.sample(pool, Math.min(4, pool.length));
        while (ids.length < 4) ids.push(pool[ids.length % pool.length]);
        const lvl = en.act === 1 ? 2 : en.act === 2 ? 5 : 8;
        const party = ids.map(function (id) {
          const h = DD.getHero(id);
          const extra = (h.skillPool || []).filter(function (sid) { return h.startingSkills.indexOf(sid) < 0; }).slice(0, en.act === 1 ? 1 : 2);
          const sl = Math.min(3, 1 + Math.floor(lvl / 3));
          return DD.Combat.makeRunHero({ id: id, level: lvl, skills: h.startingSkills.concat(extra).map(function (sid) { return { id: sid, level: sl }; }) });
        });
        const setup = DD.safe('Encounter.build ' + en.id, DD.Encounter.build, DD.Encounter, [en, party, { rng: DD.RNG(rng.int(1, 1e9)), difficulty: 'normal', act: en.act }]);
        if (!setup || !setup.grid) { t.fail('encounter ' + en.id + ': build failed'); continue; }
        const want = typeof en.objective === 'string' ? en.objective : (en.objective && en.objective.type) || 'killAll';
        t.eq(setup.objective && setup.objective.type, want, 'encounter ' + en.id + ': objective "' + want + '" survives the build (a fallback to killAll means a missing boss / objId on the map)');
        t.eq(setup.heroes.length, party.length, 'encounter ' + en.id + ': every hero gets a deploy tile');
        const w = watchAreas(function (w) {
          DD.Combat.start(setup, { seed: rng.int(1, 1e9), headless: true, difficulty: 'normal', kind: en.kind });
          w.arm();
          const s = DD.Combat.state;
          t.ok(DD.Combat.heroes().length > 0 && DD.Combat.enemies().length > 0, 'encounter ' + en.id + ': units placed');
          if (en.kind === 'boss') t.ok(s.units.some(function (u) { return u.side === 'enemy' && DD.Act.isBoss(u) && !u.dead; }), 'encounter ' + en.id + ': the boss is on the board');
          s.units.forEach(function (u) { if (!u.dead) t.ok(DD.Grid.isWalkable(u.x, u.y, u), 'encounter ' + en.id + ': ' + u.name + ' on a walkable tile'); });
          sanity(t, 'encounter ' + en.id + ' start');
          const res = DD.AutoPlay.runBattle(30);
          t.ok(!!s.order && s.order.length > 0, 'encounter ' + en.id + ': initiative was rolled');
          sanity(t, 'encounter ' + en.id + ' end');
          total++; rounds += res.rounds; rsum += res.rounds;
          if (res.result === 'victory') { wins++; won++; }
          if (res.timeout) timeouts++;
        });
        uniq(w.violations).forEach(function (v) { t.fail('encounter ' + en.id + ': ' + v); });
        Array.prototype.push.apply(notes, uniq(w.notes));
      }
      t.log(en.id + ' (' + en.act + '/' + en.kind + '): won ' + won + '/' + n + ', avg rounds ' + (rsum / n).toFixed(1));
    });
    t.log('TOTAL: won ' + wins + '/' + total + ' (' + Math.round(100 * wins / Math.max(1, total)) + '%), avg rounds ' + (rounds / Math.max(1, total)).toFixed(1) + ', timeouts ' + timeouts);
    t.ok(total > 0, 'battles fought');
    advise('encounter damage numbers', uniq(notes));
  });
})();
