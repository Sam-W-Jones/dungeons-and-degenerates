/* Dungeons and Degenerates — tests/content/hero_syllamin.js
 * Suites "hero_syllamin: …" for js/data/heroes/syllamin.js (v2: initiative turns, no telegraphs, no Guard, simple
 * skills): the hero def and kit shape, the Heckler passive (Roasted / Emotional Damage / Hype), the basic, every pool
 * skill at every level (desc == effect, durations counted in the owner's own turns), cast ranges and line of sight,
 * the combos with other heroes, the Diss Track signature, the three items, edge cases (silenced / stunned / asleep /
 * sheep / charmed user, too little AP, targets dying mid-skill, pits, lava, water, map edges, flying), attacks of
 * opportunity, exact previews and AutoPlay v2 battles.
 * Uses the test_ fixtures (tests/fixtures.js). Deterministic: fixed sandbox seeds.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const HERO = 'syllamin';
  const POOL = ['syl_heckle', 'syl_power_ballad', 'syl_hype_man', 'syl_shriek', 'syl_glitter_bomb', 'syl_lullaby', 'syl_encore',
    'syl_fae_blink', 'syl_mosh_pit', 'syl_mic_drop'];
  const SPELLS = ['syl_heckle', 'syl_power_ballad', 'syl_shriek', 'syl_lullaby', 'syl_signature'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const OTHER_HEROES = ['Zarathor', 'Marbles', 'Marwyn', 'Ellaria', 'Josiah', 'Sparrow', 'Corelos', 'Slate', 'Buga', 'Kiri', 'Betty', 'Basanos',
    'Valdris', 'Hjalmar', 'Pebbles'];
  const NEW_HEROES = ['Kiri', 'Betty', 'Basanos', 'Valdris', 'Hjalmar', 'Pebbles'];
  const SHE_HER = ['Ellaria', 'Sparrow', 'Kiri'];   // every other hero is he/him (user-confirmed)

  // ---- helpers ---------------------------------------------------------------------------------------------
  function ready() { return !!DD.getHero(HERO) && !!DD.getHero('test_knight'); }
  function guard(t) { if (!ready()) { t.skip('syllamin or the test fixtures are not loaded'); return false; } return true; }

  /**
   * Sandbox that never ends by itself (custom objective). v2 defaults: initiative 'heroesFirst' (heroes in the listed
   * order, then enemies), so it is the first hero's turn of round 1; enemies pass every turn unless cfg.enemyAi is true.
   */
  function sb(cfg) {
    return DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 7, enemyAi: false,
      objective: { type: 'custom', text: 'Syllamin test' },
      encounter: { id: 'syl_test_arena', checkObjective: function () { return null; } },
    }, cfg || {}));
  }
  function S(x, y, extra) { return Object.assign({ id: HERO, x: x, y: y }, extra || {}); }
  function H(id, x, y, extra) { return Object.assign({ id: id, x: x, y: y }, extra || {}); }
  function E(id, x, y, hpMult) { return { id: id, x: x, y: y, hpMult: hpMult }; }
  function syl() { return DD.Combat.heroes().filter(function (u) { return u.defId === HERO; })[0]; }
  function hero(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function stacks(u) { const s = st(u, 'syl_roasted'); return s ? s.stacks : 0; }
  function key(p) { return p.x + ',' + p.y; }
  function keys(list) { return list.map(key).sort().join(' '); }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (s) { return s.id === id; })[0]; }
  /** Socket exactly one skill (at a level) on the unit; returns the slot. */
  function socket(u, id, level) { const s = DD.Act.makeSlot(id, level || 1); u.skills = [s]; return s; }
  function use(u, slot, x, y) { return DD.Combat.useSkill(u, slot, x, y); }
  function setT(x, y, t) { DD.Grid.tile(x, y).t = t; }
  function cur() { return DD.Combat.current(); }
  function round() { return DD.Combat.state.round; }
  function hype() { return DD.Combat.state.hype; }
  function desc(id, lv) { return DD.skillDesc(DD.getSkill(id), lv, null); }
  /** End hero turns (AI turns resolve inside) until it is hero u's turn; false if it never comes. */
  function toTurn(u) {
    for (let i = 0; i < 40 && cur() !== u && !DD.Combat.state.result; i++) DD.Combat.endTurn();
    return cur() === u;
  }
  /** Run fn(unit) at the start of every turn of `unit` until off() is called (inspect state between turns). */
  function atTurnStart(unit, fn) { return DD.Events.on('turn:start', function (e) { if (e.unit === unit) fn(e.unit); }); }
  function logSince(n, re) { return DD.Combat.state.log.slice(n).some(function (e) { return re.test(e.text); }); }
  function CH() { return T.contentHelpers || {}; }
  function sane(t, label) { return CH().sanity ? CH().sanity(t, label) : true; }
  function warnings() { return DD.problems.length; }

  // ---- registry ----------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: hero def, kit shape, barks, items', function (t) {
    if (!guard(t)) return;
    const h = DD.getHero(HERO);
    t.eq(h.name, 'Syllamin', 'name');
    t.ok(h.epithet && h.race === 'Faerie' && h.cls === 'Bard' && h.role && h.blurb.length > 40, 'epithet / race / class / role / blurb');
    t.eq(h.unlock, null, 'available from the start (v2: every hero)');
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov >= 3 && h.stats.mov <= 5, 'L1 stats in DESIGN range');
    t.eq(h.stats.init, 4, 'initiative modifier +4 (a quick faerie)');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth +3-5 HP');
    t.ok(h.flags.flying === true, 'flying');
    t.ok(/^#[0-9a-f]{6}$/i.test(h.color), 'UI colour');
    t.eq(h.startingSkills.length, 2, 'exactly 2 starting skills');
    h.startingSkills.forEach(function (id) { t.ok(h.skillPool.indexOf(id) >= 0, 'starter ' + id + ' in pool'); });
    t.ok(h.skillPool.length >= 9 && h.skillPool.length <= 10, 'pool of 9-10 (DESIGN §6 v2: 8-10; the content registry: 9-11)');
    t.eq(JSON.stringify(h.skillPool.slice().sort()), JSON.stringify(POOL.slice().sort()), 'pool matches the documented kit');
    // v2 wording: no telegraphs, intents or Guard anywhere the player reads
    const v1Words = /telegraph|intent|\bguard\b|redirect|re-aim/i;
    [h.role, h.blurb, h.passive.desc].forEach(function (s) { t.ok(!v1Words.test(s), 'no v1 mechanics in "' + s.slice(0, 40) + '…"'); });
    t.ok(!/\b(she|her|hers|herself)\b/i.test(h.blurb + ' ' + h.passive.desc), 'he/him in the blurb and passive');
    const all = POOL.concat([h.basic, h.signature]);
    const apCosts = {};
    let big = 0;
    all.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === HERO && id.indexOf('syl_') === 0, id + ': registered, owned, prefixed');
      if (!s) return;
      t.ok(typeof s.icon === 'string' && s.icon.length > 0 && s.icon.length <= 3, id + ': one emoji icon');
      t.ok(['attack', 'spell', 'buff', 'heal', 'summon', 'move', 'utility'].indexOf(s.kind) >= 0 && Array.isArray(s.tags), id + ': kind/tags');
      t.eq(s.kind === 'spell', SPELLS.indexOf(id) >= 0, id + ': ' + (SPELLS.indexOf(id) >= 0 ? 'a spell (Silence stops it)' : 'not a spell'));
      t.ok(typeof s.flavor === 'string' && s.flavor.length > 10 && s.flavor.length <= 120, id + ': flavor ≤ 120');
      t.ok(typeof s.canUse !== 'function', id + ': no hidden canUse rules (Silence is the engine\'s spell rule)');
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const L = DD.skillLevel(s, lv);
        const ap = typeof s.ap === 'function' ? s.ap(L, null) : s.ap;
        apCosts[ap] = 1;
        [null, { id: 'probe', name: 'Probe', statuses: [], items: [], flags: {}, data: {}, x: 0, y: 0, side: 'hero', kind: 'hero' }].forEach(function (user) {
          const d = DD.skillDesc(s, lv, user);
          t.ok(d.length > 15 && !/undefined|NaN|\[object/.test(d), id + ' L' + lv + ' desc ' + (user ? 'with' : 'without') + ' a user: ' + d);
          if (L.dmg) t.ok(new RegExp('(^|[^0-9])' + L.dmg + '([^0-9]|$)').test(d), id + ' L' + lv + ' desc shows its damage ' + L.dmg);
        });
        // DESIGN §6 Simplicity: one breath, no if/else chains, no v1 mechanics
        const d = desc(id, lv);
        const words = d.split(/\s+/).length;
        t.ok(words <= 26, id + ' L' + lv + ': desc reads in one breath (' + words + ' words): ' + d);
        t.ok(!/\b(if|otherwise|unless|else)\b/i.test(d), id + ' L' + lv + ': no if/else clauses');
        t.ok(!v1Words.test(d), id + ' L' + lv + ': no telegraph / intent / Guard wording');
      }
      if (POOL.indexOf(id) >= 0) {
        t.eq(s.levels.length, 3, id + ': 3 levels');
        if (s.charges > 0 || DD.resolve(s.cooldown, DD.skillLevel(s, 1), null, 0) >= 3) big++;
      }
    });
    t.ok(apCosts[1] && apCosts[2] && apCosts[3], 'AP costs mix 1, 2 and 3 (' + Object.keys(apCosts).join(',') + ')');
    t.ok(big >= 2, 'at least two big skills with charges or a long cooldown (' + big + ')');
    const basic = DD.getSkill(h.basic), sig = DD.getSkill(h.signature);
    t.ok(basic.ap === 1 && basic.levels[0].dmg >= 4 && basic.levels[0].dmg <= 6 && !basic.hype && !basic.charges, 'basic: 1 AP, 4-6 damage, always available');
    t.ok(sig.hype === 100 && sig.levels[0].dmg * sig.levels[0].verses >= 12, 'signature: 100 Hype, big damage');
    // barks: every key, 4-6 lines, ≤ 70 characters, and the party gets name-dropped
    const lines = [];
    BARK_KEYS.forEach(function (k) {
      const b = h.barks[k] || [];
      t.ok(b.length >= 4 && b.length <= 6, 'barks.' + k + ': 4-6 lines (' + b.length + ')');
      b.forEach(function (line) { lines.push(line); t.ok(line.length <= 70, 'bark ≤ 70 chars: ' + line); });
    });
    const named = OTHER_HEROES.filter(function (n) { return lines.some(function (l) { return l.indexOf(n) >= 0; }); });
    t.ok(named.length >= 8, 'barks reference other heroes by name (' + named.join(', ') + ')');
    NEW_HEROES.forEach(function (n) { t.ok(named.indexOf(n) >= 0, 'the new heroes get roasted too: ' + n); });
    // pronouns: a line that names a hero never misgenders them (she/her: Ellaria, Sparrow, Kiri; he/him: everyone else)
    lines.forEach(function (l) {
      OTHER_HEROES.forEach(function (n) {
        if (l.indexOf(n) < 0) return;
        const wrong = SHE_HER.indexOf(n) >= 0 ? /\b(he|him|his|himself)\b/i : /\b(she|her|hers|herself)\b/i;
        t.ok(!wrong.test(l), 'pronouns for ' + n + ': ' + l);
      });
    });
    t.ok(!h.flags.noProvoke && !h.flags.noOpportunity, 'no hidden attack-of-opportunity flags (the rule applies to him as written)');
    t.ok(lines.some(function (l) { return /#\$%&|@#\$%/.test(l); }), 'swears are bleeped');
    t.ok(!lines.some(function (l) { return v1Words.test(l); }), 'no bark talks about telegraphs or Guard');
    // passive, status, surface, items
    t.ok(h.passive.name === 'Heckler' && typeof h.passive.hooks.onDealDamage === 'function', 'passive Heckler with hooks');
    t.eq(Object.keys(h.passive.hooks).join(','), 'onDealDamage', 'the passive is one rule (one hook)');
    const roasted = DD.getStatus('syl_roasted');
    t.ok(roasted && roasted.type === 'debuff' && roasted.maxStacks === 3 && roasted.decay === 'never', 'status syl_roasted: debuff, 3 stacks, sticks');
    t.ok(/Roasted 2\/3/.test(roasted.desc({ stacks: 2, turns: -1 })), 'Roasted desc shows its stacks');
    t.ok(!roasted.telegraphFlat && !(roasted.hooks && roasted.hooks.modifyOutgoingDamage), 'v2: Roasted is a pure countdown (no hidden damage change)');
    const glitter = DD.getSurface('syl_glitter');
    t.ok(glitter && glitter.slide === true && !glitter.onEnter && typeof glitter.draw === 'function' && glitter.react.fire, 'surface syl_glitter: slippery only, burns');
    const items = Object.keys(DD.defs.items).map(function (k) { return DD.getItem(k); }).filter(function (it) { return it.hero === HERO; });
    t.eq(items.length, 3, 'three hero items');
    t.ok(items.some(function (it) { return it.rarity === 'rare'; }) && items.some(function (it) { return it.rarity === 'legendary'; }), 'a rare and a legendary item');
    items.forEach(function (it) {
      t.ok(it.id.indexOf('syl_') === 0 && it.desc.length > 10 && it.flavor.length > 10, 'item ' + it.id + ' text');
      t.ok(!(it.stats && it.stats.block) && !(it.hooks && (it.hooks.modifyGuard || it.hooks.onCombatStart)), 'item ' + it.id + ': no starting shield, no Guard');
      t.ok(!v1Words.test(it.desc), 'item ' + it.id + ': no v1 wording');
    });
    t.ok(DD.Syllamin && typeof DD.Syllamin.roast === 'function' && typeof DD.Syllamin.blinkSpot === 'function' && !DD.Syllamin.heckleCandidates, 'public helpers (no intent tools)');
    // the sprite: tiny, winged, a lute, an overlay (mohawk/ears) that paints without warnings
    const sp = h.sprite;
    t.ok(sp.scale >= 0.6 && sp.scale <= 0.7 && sp.build === 'tiny' && sp.wings === 'fairy' && sp.mainhand === 'lute' && sp.outfit !== 'dress', 'tiny faerie bard sprite (he/him: a coat)');
    if (DD.Sprites && typeof document !== 'undefined') {
      const w0 = warnings();
      const c = document.createElement('canvas'); c.width = 160; c.height = 160;
      ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
        DD.Sprites.draw(c.getContext('2d'), sp, 80, 140, 3, { t: 1.3, pose: pose, facing: pose === 'hurt' ? -1 : 1 });
      });
      const p = DD.Sprites.portrait(HERO, 64);
      t.ok(p && p.width > 0, 'portrait renders');
      t.eq(warnings(), w0, 'sprite + portrait paint without warnings');
    }
    // in a fight: his initiative modifier is +4 and he starts with no Block
    sb({ heroes: [S(1, 1)], enemies: [E('test_grunt', 7, 7)] });
    t.eq(syl().init, 4, 'unit init +4');
    t.eq(syl().block, 0, 'no combat-start Block');
  });

  // ---- passive -----------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Heckler — Roasted, Emotional Damage, Hype, own-turn durations', function (t) {
    if (!guard(t)) return;
    const s = sb({ enemyAi: true, heroes: [S(3, 4), H('test_cleric', 1, 1)], enemies: [E('test_grunt', 4, 4, 3), E('test_grunt', 8, 8)] });
    const me = syl(), cleric = hero('test_cleric'), g = at(4, 4), g2 = at(8, 8);
    t.eq(cur(), me, 'his turn first (heroesFirst)');
    t.eq(g.hp, 42, 'tanky grunt (hpMult 3)');
    t.ok(use(me, me.basic, 4, 4), 'Your Mom Joke');
    t.eq(g.hp, 37, 'basic deals 5');
    t.eq(stacks(g), 1, 'a hit Roasts 1');
    t.eq(me.ap, 2, 'basic costs 1 AP');
    // v2: Roasted changes nothing by itself (a countdown, no hidden damage penalty)
    let hp = cleric.hp;
    DD.Act.damage(g, cleric, 4);
    t.eq(cleric.hp, hp - 4, 'a Roasted foe still deals its full damage');
    use(me, me.basic, 4, 4);
    t.eq(stacks(g), 2, 'Roasted 2');
    const hype0 = hype(), log0 = s.log.length;
    use(me, me.basic, 4, 4);
    t.ok(!has(g, 'syl_roasted'), 'Emotional Damage clears Roasted');
    t.ok(has(g, 'stun') && st(g, 'stun').turns === 1, 'Emotional Damage: Stunned for 1 turn');
    t.eq(hype() - hype0, DD.Syllamin.EMO_HYPE, 'the party gains exactly 6 Hype');
    t.ok(logSince(log0, /EMOTIONAL DAMAGE/), 'logged');
    // the stun costs exactly its next turn: the grunt next to him does nothing this round, stabs him the next
    hp = me.hp;
    const n1 = s.log.length;
    DD.Combat.endTurn(); // the cleric
    t.eq(cur(), cleric, 'the cleric\'s turn');
    DD.Combat.endTurn(); // the grunts, then round 2
    t.ok(round() === 2 && cur() === me, 'round 2, his turn');
    t.ok(logSince(n1, /Test Grunt loses the turn \(Stunned\)/) && me.hp === hp, 'the stunned grunt lost its turn');
    t.ok(!has(g, 'stun'), 'the stun ended with that turn');
    DD.Combat.endRound();
    t.eq(me.hp, hp - 4, 'round 2: it stabs him again');
    // Roasted sticks across rounds and melts down again later (no once-per-round rule)
    DD.Syllamin.roast(me, g2, 1);
    DD.Combat.endRound(); DD.Combat.endRound();
    t.eq(stacks(g2), 1, 'a single stack sticks around for rounds');
    const hype1 = hype();
    DD.Syllamin.roast(me, g, 3);
    DD.Syllamin.roast(me, g, 3);
    t.ok(has(g, 'stun') && stacks(g) === 0, 'melts down twice in one turn: still one stun');
    t.eq(hype() - hype1, 12, 'each Emotional Damage pays its 6 Hype');
    // allies are never Roasted; only skill damage roasts (a bump into the map edge is not his words)
    DD.Act.damage(me, cleric, 3, { skill: DD.getSkill('syl_basic') });
    t.ok(!has(cleric, 'syl_roasted'), 'allies are never Roasted');
    t.eq(DD.Syllamin.roast(me, cleric, 3), null, 'the public roast helper refuses his own ally too');
    t.ok(!has(cleric, 'syl_roasted') && !has(cleric, 'stun'), 'no stacks, no meltdown on a friend');
    t.ok(sane(t, 'passive'), 'state sane');
    sb({ heroes: [S(1, 4)], enemies: [E('test_grunt', 8, 4)] });
    const g3 = at(8, 4), hp3 = g3.hp;
    DD.Act.push(syl(), g3, { x: 1, y: 0 }, 2);
    t.ok(g3.hp === hp3 - 3 && stacks(g3) === 0, 'bump damage (3) does not Roast');
    // elites and bosses: Weakened for their next 2 turns instead of Stunned
    const s2 = sb({ heroes: [S(1, 4)], enemies: [E('test_brute', 4, 2), E('test_boss', 4, 6)] });
    const brute = at(4, 2), boss = at(4, 6);
    const h2 = s2.hype;
    DD.Syllamin.roast(syl(), brute, 3);
    DD.Syllamin.roast(syl(), boss, 3);
    t.ok(!has(brute, 'stun') && st(brute, 'weak').turns === 2 && !has(brute, 'syl_roasted'), 'elite: Weakened 2 turns, stacks clear');
    t.ok(!has(boss, 'stun') && st(boss, 'weak').turns === 2, 'boss: Weakened 2 turns, not stunned');
    t.eq(s2.hype - h2, 12, 'elite and boss meltdowns still hype the crowd');
    DD.Combat.endRound();
    t.ok(st(brute, 'weak') && st(brute, 'weak').turns === 1, 'after its 1st turn: 1 turn of Weak left');
    DD.Combat.endRound();
    t.ok(!has(brute, 'weak') && !has(boss, 'weak'), 'after its 2nd turn: gone');
    // a stun-immune foe: the engine refuses the stun ("Immune!"), the stacks still clear and the Hype still comes
    const s3 = sb({ heroes: [S(1, 4)], enemies: [E('test_grunt', 4, 4)] });
    const rock = at(4, 4);
    rock.flags.stunImmune = true;
    const h3 = s3.hype, w0 = warnings();
    DD.Syllamin.roast(syl(), rock, 3);
    t.ok(!has(rock, 'stun') && !has(rock, 'syl_roasted') && s3.hype - h3 === 6 && warnings() === w0, 'stun-immune: no stun, stacks cleared, +6 Hype');
  });

  // ---- sprite hover (review core fix: a flying unit keeps its spec's numeric hover) ----------------------------------
  T.suite('hero_syllamin: he hovers at his own height in game (clears the unit in front)', function (t) {
    if (!guard(t)) return;
    if (!DD.Sprites || typeof DD.Sprites.metrics !== 'function') { t.skip('no sprite module'); return; }
    sb({ heroes: [S(2, 2)], enemies: [E('test_grunt', 6, 6)] });
    const spec = DD.getHero(HERO).sprite;
    t.ok(spec.hover >= 16, 'spec hover is high enough to clear a medium unit\'s head and HP bar (' + spec.hover + ')');
    const m = DD.Sprites.metrics(syl());
    t.near(m.hover, spec.hover * spec.scale, 1e-6, 'his flying unit uses the spec hover (' + m.hover + ' px at zoom 1)');
    t.near(DD.Sprites.metrics(HERO).hover, m.hover, 1e-6, 'same height for the def id (gallery / portraits)');
    t.eq(DD.Sprites.metrics({ base: 'humanoid', scale: 1, hover: true }).hover, 7, 'hover: true without a number keeps the default 7');
    t.eq(DD.Sprites.metrics({ base: 'humanoid', scale: 1, hover: 12 }).hover, 12, 'a numeric hover is used as is');
  });

  // ---- basic -------------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Your Mom Joke (basic)', function (t) {
    if (!guard(t)) return;
    sb({ heroes: [S(1, 1)], enemies: [E('test_grunt', 5, 1), E('test_grunt', 6, 1), E('test_archer', 1, 4)] });
    const me = syl();
    t.eq(desc('syl_basic', 1), 'Deal 5 psychic damage to a foe up to 4 tiles away.', 'desc');
    const targets = DD.Combat.targets(me, me.basic).map(key);
    t.ok(targets.indexOf('5,1') >= 0 && targets.indexOf('6,1') < 0 && targets.indexOf('1,4') >= 0, 'range 4 (' + targets.join(' ') + ')');
    setT(1, 3, 'wall');
    t.ok(DD.Combat.targets(me, me.basic).map(key).indexOf('1,4') < 0, 'needs line of sight');
    const g = at(5, 1);
    const rec = [];
    DD.Act.addRule({ id: 'syl_test_el', name: 'Element', hooks: { onTakeDamage: function (d) { rec.push(d.element); } } });
    use(me, me.basic, 5, 1); use(me, me.basic, 5, 1);
    t.eq(g.hp, 4, 'two jokes: 10 damage');
    t.eq(rec[0], 'psychic', 'psychic damage');
    const h0 = hype();
    use(me, me.basic, 5, 1);
    t.ok(g.dead, 'the third joke kills the 14 HP grunt');
    t.eq(hype() - h0, 8, 'a kill: +8 Hype (no meltdown on a corpse)');
    t.eq(me.ap, 0, '1 AP each');
    t.eq(DD.Combat.canUse(me, me.basic), 'Not enough AP.', 'out of AP');
    t.eq(slotOf(me, 'syl_basic').cd, 0, 'no cooldown');
  });

  // ---- Heckle ------------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Heckle — damage + Charm: on its next turn the foe fights for the party', function (t) {
    if (!guard(t)) return;
    const DMG = [4, 5, 6];
    [1, 2, 3].forEach(function (lv) {
      // the heckled grunt stands next to its friend; nobody can reach Syllamin this round
      sb({ enemyAi: true, heroes: [S(1, 4)], enemies: [E('test_grunt', 5, 4, 3), E('test_grunt', 6, 4, 2), E('test_grunt', 8, 8)] });
      const me = syl(), a = at(5, 4), b = at(6, 4);
      const slot = socket(me, 'syl_heckle', lv);
      t.eq(desc('syl_heckle', lv), 'Deal ' + DMG[lv - 1] + ' psychic damage to a foe up to ' + (lv === 3 ? 5 : 4) + ' tiles away and Charm it: on its next turn it fights for your side.', 'L' + lv + ': desc');
      t.ok(use(me, slot, 5, 4), 'L' + lv + ': Heckle used');
      t.eq(me.ap, 1, 'L' + lv + ': costs 2 AP');
      t.eq(slot.cd, 2, 'L' + lv + ': cooldown 2');
      t.eq(a.hp, 42 - DMG[lv - 1], 'L' + lv + ': deals ' + DMG[lv - 1]);
      t.eq(stacks(a), 1, 'L' + lv + ': the hit Roasts');
      const ch = st(a, 'charmed');
      t.ok(ch && ch.turns === 1 && ch.source === me.id, 'L' + lv + ': Charmed for 1 turn by Syllamin');
      t.ok(DD.Combat.targets(me, me.basic).map(key).indexOf('5,4') >= 0, 'L' + lv + ': a charmed foe can still be joked at');
      const hpB = b.hp, hpMe = me.hp;
      DD.Combat.endTurn(); // the grunts' turns, then round 2
      t.ok(round() === 2 && cur() === me, 'L' + lv + ': round 2');
      t.eq(b.hp, hpB - 4, 'L' + lv + ': on its turn the charmed grunt stabbed its own friend');
      t.eq(me.hp, hpMe, 'L' + lv + ': and nobody stabbed Syllamin');
      t.ok(!has(a, 'charmed'), 'L' + lv + ': the charm ended with that turn');
    });
    // range: L1/L2 4 tiles, L3 5
    sb({ heroes: [S(0, 4)], enemies: [E('test_grunt', 5, 4)] });
    t.ok(DD.Combat.targets(syl(), socket(syl(), 'syl_heckle', 3)).map(key).indexOf('5,4') >= 0, 'L3 range 5');
    t.ok(DD.Combat.targets(syl(), socket(syl(), 'syl_heckle', 1)).map(key).indexOf('5,4') < 0, 'L1 range 4');
    // a heckle that kills charms nobody; a charm-immune foe takes the damage and stays itself
    sb({ heroes: [S(2, 4)], enemies: [E('test_grunt', 5, 4, 0.2), E('test_grunt', 5, 5)] });
    const weak = at(5, 4), other = at(5, 5);
    t.eq(weak.hp, 3, '3 HP victim');
    t.ok(use(syl(), socket(syl(), 'syl_heckle', 1), 5, 4) && weak.dead, 'Heckle kills it');
    t.ok(!DD.Combat.state.units.some(function (u) { return has(u, 'charmed'); }), 'a dead foe is not charmed (nobody is)');
    other.flags.immune = ['charmed'];
    syl().ap = 3; syl().skills[0].cd = 0;
    t.ok(use(syl(), syl().skills[0], 5, 5), 'Heckle a charm-immune foe');
    t.ok(other.hp === 14 - 4 && !has(other, 'charmed'), 'charm-immune: 4 damage, no charm');
    t.ok(sane(t, 'heckle'), 'state sane');
  });

  // ---- Power Ballad -------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Power Ballad — Inspired through the right own turns', function (t) {
    if (!guard(t)) return;
    const R = [2, 3, 3], TURNS = [1, 1, 2];
    [1, 2, 3].forEach(function (lv) {
      sb({ heroes: [S(4, 4), H('test_knight', 4, 6), H('test_cleric', 4, 7), H('test_mage', 1, 1)], enemies: [E('test_grunt', 8, 8)] });
      const me = syl(), knight = hero('test_knight'), cleric = hero('test_cleric'), mage = hero('test_mage');
      const slot = socket(me, 'syl_power_ballad', lv);
      t.eq(desc('syl_power_ballad', lv), 'You and allies within ' + R[lv - 1] + ' tiles are Inspired (+25% damage) for ' + TURNS[lv - 1] + ' turn' + (TURNS[lv - 1] > 1 ? 's' : '') + '.', 'L' + lv + ': desc');
      t.ok(use(me, slot, 4, 4), 'L' + lv + ': used');
      t.eq(me.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(slot.cd, 2, 'L' + lv + ': cooldown 2');
      t.ok(has(me, 'inspired') && has(knight, 'inspired'), 'L' + lv + ': himself + the ally 2 tiles away Inspired');
      t.eq(has(cleric, 'inspired'), lv >= 2, 'L' + lv + ': the ally 3 tiles away ' + (lv >= 2 ? 'included (radius 3)' : 'out of radius 2'));
      t.ok(!has(mage, 'inspired'), 'L' + lv + ': far ally untouched');
      // the knight (turns: 1 from Syllamin's turn) keeps it through his own next turn, which comes later this round
      DD.Combat.endTurn();
      t.ok(cur() === knight && has(knight, 'inspired'), 'L' + lv + ': the knight\'s turn: Inspired');
      DD.Combat.endTurn();
      t.eq(has(knight, 'inspired'), lv === 3, 'L' + lv + ': after the knight\'s turn ' + (lv === 3 ? '1 turn left' : 'gone'));
      // Syllamin's own (fresh) Inspired: the rest of this turn + his next N turns
      toTurn(me);
      t.ok(round() === 2 && has(me, 'inspired'), 'L' + lv + ': still Inspired on his next turn');
      DD.Combat.endRound();
      t.eq(has(me, 'inspired'), lv === 3, 'L' + lv + ': round 3: ' + (lv === 3 ? 'still Inspired (2 turns)' : 'gone'));
      DD.Combat.endRound();
      t.ok(!has(me, 'inspired') && !has(knight, 'inspired'), 'L' + lv + ': round 4: all gone');
    });
    // Inspired really adds 25%; cooldown 2 (round r → usable again in round r + 3); Silence stops the singing
    sb({ heroes: [S(4, 4), H('test_knight', 4, 5)], enemies: [E('test_grunt', 5, 5)] });
    const me = syl(), knight = hero('test_knight'), g = at(5, 5);
    const slot = socket(me, 'syl_power_ballad', 1);
    use(me, slot, 4, 4);
    t.ok(DD.Combat.canUse(me, slot) !== true, 'on cooldown');
    DD.Combat.endTurn();
    t.ok(DD.Combat.useSkill(knight, knight.basic, 5, 5), 'the knight slashes on his turn');
    t.eq(g.hp, 14 - 6, 'Inspired knight slashes for round(5 × 1.25) = 6');
    toTurn(me); t.ok(round() === 2 && DD.Combat.canUse(me, slot) !== true, 'still on cooldown in round 2');
    DD.Combat.endRound(); t.ok(round() === 3 && DD.Combat.canUse(me, slot) !== true, 'still on cooldown in round 3');
    DD.Combat.endRound(); t.ok(round() === 4 && DD.Combat.canUse(me, slot) === true, 'usable again in round 4');
    DD.Act.addStatus(me, 'silenced', { turns: 1 });
    t.eq(DD.Combat.canUse(me, slot), 'Silenced!', 'silenced: a song is a spell');
  });

  // ---- Hype Man ------------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Hype Man — +AP banked for the ally\'s next turn, Empowered', function (t) {
    if (!guard(t)) return;
    const GAIN = [1, 1, 2], CD = [2, 1, 1];
    [1, 2, 3].forEach(function (lv) {
      sb({ heroes: [S(2, 2), H('test_knight', 4, 4), H('test_mage', 8, 8)], enemies: [E('test_grunt', 5, 4)] });
      const me = syl(), knight = hero('test_knight');
      const slot = socket(me, 'syl_hype_man', lv);
      t.eq(desc('syl_hype_man', lv), 'An ally up to 5 tiles away gains ' + GAIN[lv - 1] + ' AP on its next turn and is Empowered (its next damaging skill deals +50%).', 'L' + lv + ': desc');
      const tg = DD.Combat.targets(me, slot).map(key);
      t.ok(tg.indexOf('4,4') >= 0 && tg.indexOf('8,8') < 0, 'L' + lv + ': ally within 5 only');
      t.ok(use(me, slot, 4, 4), 'L' + lv + ': used');
      t.eq(me.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(slot.cd, CD[lv - 1], 'L' + lv + ': cooldown ' + CD[lv - 1]);
      t.ok(knight.ap === 0 && knight.apBank === GAIN[lv - 1], 'L' + lv + ': not the knight\'s turn: +' + GAIN[lv - 1] + ' AP banked');
      t.ok(has(knight, 'empowered'), 'L' + lv + ': Empowered');
      DD.Combat.endTurn();
      t.ok(cur() === knight && knight.ap === 3 + GAIN[lv - 1] && knight.apBank === 0, 'L' + lv + ': his turn: ' + (3 + GAIN[lv - 1]) + ' AP');
      const g = at(5, 4);
      DD.Combat.useSkill(knight, knight.basic, 5, 4);
      t.eq(g.hp, 14 - 8, 'L' + lv + ': Empowered slash round(5 × 1.5) = 8');
      t.ok(!has(knight, 'empowered'), 'L' + lv + ': Empowered is used up');
      // cooldown N: used in round 1 → usable again in round 1 + N + 1
      toTurn(me);
      t.ok(round() === 2 && DD.Combat.canUse(me, slot) !== true, 'L' + lv + ': round 2: on cooldown');
      DD.Combat.endRound();
      t.eq(DD.Combat.canUse(me, slot) === true, CD[lv - 1] === 1, 'L' + lv + ': round 3: ' + (CD[lv - 1] === 1 ? 'usable again (cooldown 1)' : 'still on cooldown (cooldown 2)'));
    });
    // a stunned / sheep ally would waste it: not a valid target
    sb({ heroes: [S(2, 2), H('test_knight', 4, 4)], enemies: [E('test_grunt', 7, 7)] });
    const me = syl(), knight = hero('test_knight');
    const slot = socket(me, 'syl_hype_man', 1);
    DD.Act.addStatus(knight, 'stun', { turns: 1 });
    t.eq(DD.Combat.targets(me, slot).length, 0, 'a stunned ally is not a valid target');
    DD.Act.removeStatus(knight, 'stun');
    DD.Act.addStatus(knight, 'sheep', { turns: 1 });
    t.eq(DD.Combat.targets(me, slot).length, 0, 'a sheep is not a valid target');
    DD.Act.removeStatus(knight, 'sheep');
    DD.Act.addStatus(me, 'silenced', { turns: 1 });
    t.eq(DD.Combat.canUse(me, slot), true, 'silenced: shouting still works (not a spell)');
  });

  // ---- Discordant Shriek ---------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Discordant Shriek — cone, pushes, pits, lava, water, edges, glitter', function (t) {
    if (!guard(t)) return;
    const DMG = [4, 5, 6];
    [1, 2, 3].forEach(function (lv) {
      const s = sb({ heroes: [S(2, 4)], enemies: [E('test_grunt', 3, 4), E('test_grunt', 4, 3), E('test_grunt', 5, 5)] });
      const me = syl(), f1 = at(3, 4), f2 = at(4, 3), f3 = at(5, 5);
      const slot = socket(me, 'syl_shriek', lv);
      const push = lv === 3 ? 2 : 1;
      t.eq(desc('syl_shriek', lv), 'Deal ' + DMG[lv - 1] + ' psychic damage to foes in a ' + (lv === 3 ? 3 : 2) + '-deep cone and push them ' + push + ' tile' + (push > 1 ? 's' : '') + ' away.', 'L' + lv + ': desc');
      const ctx = DD.Targeting.buildCtx(me, slot, { x: 3, y: 4 });
      t.eq(ctx.tiles.length, lv === 3 ? 9 : 4, 'L' + lv + ': cone ' + (lv === 3 ? 3 : 2) + ' deep');
      t.ok(use(me, slot, 3, 4), 'L' + lv + ': used');
      t.eq(me.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(slot.cd, 2, 'L' + lv + ': cooldown 2');
      t.ok(f1.hp === 14 - DMG[lv - 1] && f2.hp === 14 - DMG[lv - 1], 'L' + lv + ': ' + DMG[lv - 1] + ' damage each');
      t.ok(f2.x === 4 + push && f2.y === 3, 'L' + lv + ': far foe pushed ' + push + ' east (' + key(f2) + ')');
      t.ok(f1.x === 3 + push && f1.y === 4, 'L' + lv + ': near foe pushed ' + push + ' east (' + key(f1) + ')');
      t.eq(f3.hp, lv === 3 ? 14 - 6 : 14, 'L' + lv + ': the third row only at L3');
      t.ok(stacks(f1) === 1 && stacks(f2) === 1, 'L' + lv + ': Roasts');
      t.ok(s.hype >= 4, 'L' + lv + ': multi-hit Hype');
    });
    // pit: YEET (+20 Hype environmental kill)
    let s = sb({ heroes: [S(2, 4)], enemies: [E('test_grunt', 3, 4), E('test_grunt', 8, 8)], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'pit'; } });
    let me = syl(), f = at(3, 4);
    use(me, socket(me, 'syl_shriek', 1), 3, 4);
    t.ok(f.dead && s.hype >= 20 && s.stats.envKills === 1, 'pushed into a pit: YEET (+20 Hype)');
    // lava
    sb({ heroes: [S(2, 4)], enemies: [E('test_grunt', 3, 4)], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'lava'; } });
    me = syl(); f = at(3, 4);
    use(me, socket(me, 'syl_shriek', 1), 3, 4);
    t.ok(f.hp < 14 - 4 && (f.dead || has(f, 'burn')), 'pushed into lava: burns (' + f.hp + ' HP)');
    // water: Wet (the Electric Lute / an ally's lightning then deals +50%)
    sb({ heroes: [S(2, 4)], enemies: [E('test_grunt', 3, 4)], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'water'; } });
    me = syl(); f = at(3, 4);
    use(me, socket(me, 'syl_shriek', 1), 3, 4);
    t.ok(f.x === 4 && has(f, 'wet'), 'pushed into water: Wet');
    // map edge: bump 3, no extra Roast from the bump
    sb({ heroes: [S(7, 4)], enemies: [E('test_grunt', 8, 4)] });
    me = syl(); f = at(8, 4);
    use(me, socket(me, 'syl_shriek', 1), 8, 4);
    t.ok(f.x === 8 && f.hp === 14 - 4 - 3, 'map edge: bump for 3 (' + f.hp + ')');
    t.eq(stacks(f), 1, 'the bump does not Roast');
    // two foes in a row: the far one moves first, so both are pushed as the desc says (no bump between them)
    sb({ heroes: [S(2, 4)], enemies: [E('test_grunt', 3, 4), E('test_grunt', 4, 4)] });
    me = syl();
    const front = at(3, 4), back = at(4, 4);
    t.ok(use(me, socket(me, 'syl_shriek', 1), 3, 4), 'shriek down a row of two');
    t.ok(key(front) === '4,4' && key(back) === '5,4', 'both pushed 1 tile (' + key(front) + ' ' + key(back) + ')');
    t.ok(front.hp === 14 - 4 && back.hp === 14 - 4, 'only the shriek\'s 4 each: the front one never bumps into the back one');
    // glitter is slippery: the push slides one extra tile (and Glitter does nothing else)
    sb({ heroes: [S(2, 4)], enemies: [E('test_grunt', 3, 4)] });
    me = syl(); f = at(3, 4);
    DD.Act.setSurface(4, 4, 'syl_glitter', 3);
    use(me, socket(me, 'syl_shriek', 1), 3, 4);
    t.ok(f.x === 5 && f.y === 4 && !has(f, 'dazzled'), 'pushed onto glitter: slides 1 extra (' + key(f) + ')');
    // a foe killed by the shriek is not pushed; a shriek at nothing off the map edge is fine
    sb({ heroes: [S(2, 4)], enemies: [E('test_grunt', 3, 4, 0.2), E('test_grunt', 8, 8)] });
    f = at(3, 4);
    use(syl(), socket(syl(), 'syl_shriek', 1), 3, 4);
    t.ok(f.dead && f.x === 3, 'a foe killed by the shriek is not pushed');
    sb({ heroes: [S(8, 4)], enemies: [E('test_grunt', 1, 1)] });
    me = syl();
    const w0 = warnings();
    const vt = DD.Combat.targets(me, socket(me, 'syl_shriek', 3)).map(key);
    t.ok(vt.indexOf('9,4') < 0, 'no off-map direction');
    t.ok(use(me, me.skills[0], 7, 4), 'shriek at nothing');
    t.eq(warnings(), w0, 'no warnings');
  });

  // ---- Glitter Bomb --------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Glitter Bomb — Dazzle + slippery Glitter (allies\' pushes slide further)', function (t) {
    if (!guard(t)) return;
    const R = [1, 1, 2], GL = [2, 3, 3];
    [1, 2, 3].forEach(function (lv) {
      sb({ heroes: [S(1, 4), H('test_cleric', 2, 6)], enemies: [E('test_grunt', 5, 4), E('test_grunt', 5, 5), E('test_grunt', 7, 4)],
        surfaces: [{ x: 5, y: 3, id: 'oil', turns: 5 }] });
      const me = syl(), cleric = hero('test_cleric');
      const a = at(5, 4), b = at(5, 5), c = at(7, 4);
      const slot = socket(me, 'syl_glitter_bomb', lv);
      t.eq(desc('syl_glitter_bomb', lv), 'Dazzle foes in radius ' + R[lv - 1] + ' and leave slippery Glitter there for ' + GL[lv - 1] + ' rounds (not over other surfaces).', 'L' + lv + ': desc');
      t.ok(use(me, slot, 5, 4), 'L' + lv + ': used');
      t.eq(me.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(slot.cd, 2, 'L' + lv + ': cooldown 2');
      t.ok(a.hp === 14 && b.hp === 14, 'L' + lv + ': no damage (a pure setup)');
      t.ok(st(a, 'dazzled') && st(a, 'dazzled').turns === 1 && has(b, 'dazzled'), 'L' + lv + ': Dazzled for 1 turn');
      t.eq(has(c, 'dazzled'), lv === 3, 'L' + lv + ': foe 2 tiles away ' + (lv === 3 ? 'caught by radius 2' : 'outside radius 1'));
      const g44 = DD.Grid.tile(4, 4).surface;
      t.ok(g44 && g44.id === 'syl_glitter' && g44.turns === GL[lv - 1], 'L' + lv + ': glitter for ' + GL[lv - 1] + ' rounds');
      t.eq(DD.Grid.tile(5, 3).surface.id, 'oil', 'L' + lv + ': other surfaces are not covered');
      t.eq(!!DD.Grid.tile(6, 5).surface, lv === 3, 'L' + lv + ': radius ' + R[lv - 1]);
      // Glitter lasts its rounds, then it is gone
      for (let r = 0; r < GL[lv - 1] - 1; r++) DD.Combat.endRound();
      t.ok(DD.Grid.tile(4, 4).surface && DD.Grid.tile(4, 4).surface.id === 'syl_glitter', 'L' + lv + ': still there in round ' + GL[lv - 1]);
      DD.Combat.endRound();
      t.ok(!DD.Grid.tile(4, 4).surface, 'L' + lv + ': gone after ' + GL[lv - 1] + ' rounds');
      if (lv === 1) {
        // walking through glitter does nothing (only pushes slide); fire burns it away
        DD.Act.setSurface(4, 6, 'syl_glitter', 3);
        DD.Act.moveAlong(cleric, [{ x: 3, y: 6 }, { x: 4, y: 6 }]);
        t.ok(!has(cleric, 'dazzled') && key(cleric) === '4,6', 'walking through glitter: no effect');
        DD.Act.applyElement(4, 6, 'fire', null, { noUnits: true });
        t.ok(!DD.Grid.tile(4, 6).surface || DD.Grid.tile(4, 6).surface.id !== 'syl_glitter', 'fire burns glitter away');
      }
    });
    // combo: an ally's push slides 1 extra tile on glitter (the knight's Shield Bash: push 2 → 3)
    sb({ heroes: [S(1, 5), H('test_knight', 2, 4, { skills: [{ id: 'test_shield_bash', level: 1 }] })], enemies: [E('test_grunt', 3, 4), E('test_grunt', 8, 8)] });
    const knight = hero('test_knight'), g = at(3, 4);
    t.ok(use(syl(), socket(syl(), 'syl_glitter_bomb', 1), 5, 4), 'glitter around (5,4)');
    DD.Combat.endTurn();
    t.ok(DD.Combat.useSkill(knight, slotOf(knight, 'test_shield_bash'), 3, 4), 'the knight bashes the grunt east');
    t.eq(key(g), '6,4', 'pushed 2 onto glitter, slid 1 more: (6,4)');
    // a Dazzled foe's next attack lands 1 tile off (a real AI turn), the one after is back to normal
    sb({ enemyAi: true, heroes: [S(1, 4), H('test_cleric', 4, 4)], enemies: [E('test_grunt', 5, 4)] });
    const me = syl(), cleric = hero('test_cleric'), gr = at(5, 4);
    t.ok(use(me, socket(me, 'syl_glitter_bomb', 1), 6, 4) && has(gr, 'dazzled'), 'the grunt next to the cleric is Dazzled');
    const hp = cleric.hp;
    DD.Combat.endRound();
    t.eq(cleric.hp, hp, 'its stab landed 1 tile off');
    t.ok(!has(gr, 'dazzled'), 'Dazzle ended with its turn');
    DD.Combat.endRound();
    t.ok(cleric.hp < hp, 'round 2: it hits again');
  });

  // ---- Lullaby of Mediocrity -----------------------------------------------------------------------------------
  T.suite('hero_syllamin: Lullaby of Mediocrity — sleep for the right own turns, damage wakes, Marked at III', function (t) {
    if (!guard(t)) return;
    const TURNS = [1, 2, 2];
    [1, 2, 3].forEach(function (lv) {
      sb({ enemyAi: true, heroes: [S(2, 5), H('test_cleric', 4, 4)], enemies: [E('test_grunt', 5, 4, 2), E('test_grunt', 4, 5, 2), E('test_grunt', 8, 8)] });
      const me = syl(), cleric = hero('test_cleric');
      const a = at(5, 4), b = at(4, 5), c = at(8, 8);
      const slot = socket(me, 'syl_lullaby', lv);
      t.eq(desc('syl_lullaby', lv), 'Foes in radius 1 fall Asleep for ' + TURNS[lv - 1] + ' turn' + (TURNS[lv - 1] > 1 ? 's' : '') + ' (damage wakes them up)' + (lv === 3 ? ' and are Marked 3' : '') + '.', 'L' + lv + ': desc');
      t.ok(use(me, slot, 5, 5), 'L' + lv + ': used');
      t.eq(slot.cd, 3, 'L' + lv + ': cooldown 3');
      t.eq(me.ap, 1, 'L' + lv + ': 2 AP');
      t.ok(has(a, 'sleep') && has(b, 'sleep') && !has(c, 'sleep'), 'L' + lv + ': foes in radius 1 sleep');
      t.eq(st(a, 'sleep').turns, TURNS[lv - 1], 'L' + lv + ': for ' + TURNS[lv - 1] + ' turn(s)');
      t.eq(st(a, 'marked') ? st(a, 'marked').stacks : 0, lv === 3 ? 3 : 0, 'L' + lv + ': Marked ' + (lv === 3 ? 3 : 0));
      const hpC = cleric.hp, hpMe = me.hp;
      DD.Combat.endRound();
      t.ok(cleric.hp === hpC && me.hp === hpMe, 'L' + lv + ': round 1: the sleepers skipped their turns');
      t.eq(has(a, 'sleep'), lv >= 2, 'L' + lv + ': ' + (lv >= 2 ? 'still asleep in round 2' : 'awake after one turn'));
      if (lv === 1) {
        DD.Combat.endRound();
        t.ok(cleric.hp + me.hp < hpC + hpMe, 'L1: round 2: awake and attacking');
        return;
      }
      const before = a.hp;
      use(me, me.basic, a.x, a.y);
      t.ok(!has(a, 'sleep'), 'L' + lv + ': damage wakes it');
      t.eq(before - a.hp, lv === 3 ? 5 + 3 : 5, 'L' + lv + ': ' + (lv === 3 ? 'rude awakening: Marked +3' : 'plain hit'));
      t.ok(has(b, 'sleep'), 'L' + lv + ': its neighbour sleeps on');
      DD.Combat.endRound();
      t.ok(!has(b, 'sleep'), 'L' + lv + ': gone after its 2nd lost turn');
    });
  });

  // ---- Encore! -------------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Encore! — resets an ally\'s cooldowns for its next turn', function (t) {
    if (!guard(t)) return;
    const AP = [2, 1, 1];
    [1, 2, 3].forEach(function (lv) {
      // the knight acts first (heroesFirst, listed first), Syllamin second
      sb({ heroes: [H('test_knight', 4, 4, { skills: [{ id: 'test_shield_bash', level: 1 }] }), S(2, 4)], enemies: [E('test_grunt', 5, 4, 3)] });
      const me = syl(), knight = hero('test_knight');
      const slot = socket(me, 'syl_encore', lv);
      const bash = slotOf(knight, 'test_shield_bash');
      t.eq(desc('syl_encore', lv), 'Reset every skill cooldown of an ally up to 5 tiles away' + (lv === 3 ? ' and it gains 1 AP on its next turn' : '') + '. 2 uses per combat.', 'L' + lv + ': desc');
      t.eq(DD.Combat.targets(me, slot).length, lv === 3 ? 1 : 0, 'L' + lv + ': ' + (lv === 3 ? 'always worth it (+1 AP)' : 'nothing to encore yet'));
      t.ok(cur() === knight && DD.Combat.useSkill(knight, bash, 5, 4), 'L' + lv + ': the knight bashes on his turn');
      DD.Combat.endTurn();
      t.ok(cur() === me && bash.cd > 0, 'L' + lv + ': Syllamin\'s turn, the bash is on cooldown');
      t.ok(use(me, slot, 4, 4), 'L' + lv + ': Encore!');
      t.eq(me.ap, 3 - AP[lv - 1], 'L' + lv + ': costs ' + AP[lv - 1] + ' AP');
      t.eq(bash.cd, 0, 'L' + lv + ': cooldown reset');
      t.eq(knight.apBank, lv === 3 ? 1 : 0, 'L' + lv + ': ' + (lv === 3 ? '+1 AP banked' : 'no AP'));
      toTurn(knight);
      t.ok(round() === 2 && DD.Combat.canUse(knight, bash) === true, 'L' + lv + ': round 2: the knight can bash again (it would still be cooling down)');
      t.eq(knight.ap, 3 + (lv === 3 ? 1 : 0), 'L' + lv + ': knight AP ' + (3 + (lv === 3 ? 1 : 0)));
      t.ok(DD.Combat.useSkill(knight, bash, knight.x + 1, knight.y), 'L' + lv + ': knight bashes again');
      if (lv === 2) {
        DD.Combat.endTurn();
        t.ok(use(me, slot, knight.x, knight.y), 'L2: second use');
        me.ap = 3;
        t.eq(DD.Combat.canUse(me, slot), 'No charges left.', 'L2: 2 uses per combat');
      }
    });
    // a cooldown that runs out by the ally's next turn anyway is nothing to encore (no wasted charge); III still is (+1 AP)
    sb({ heroes: [H('test_knight', 4, 4, { skills: [{ id: 'test_shield_bash', level: 1 }] }), S(2, 4)], enemies: [E('test_grunt', 5, 4, 3)] });
    const me = syl(), knight = hero('test_knight'), bash = slotOf(knight, 'test_shield_bash');
    const enc = socket(me, 'syl_encore', 1);
    t.ok(DD.Combat.useSkill(knight, bash, 5, 4), 'round 1: the knight bashes (cooldown 1)');
    DD.Combat.endTurn();
    t.eq(DD.Combat.targets(me, enc).map(key).join(' '), '4,4', 'round 1: the bash would still be cooling down on his next turn: a target');
    DD.Combat.endRound();
    t.ok(cur() === knight && DD.Combat.canUse(knight, bash) !== true, 'round 2: the knight\'s bash is still cooling down');
    DD.Combat.endTurn();
    t.ok(cur() === me && bash.cd === 1, 'round 2, Syllamin\'s turn: 1 turn of cooldown left');
    t.eq(DD.Combat.targets(me, enc).length, 0, 'it ends when the knight\'s next turn starts anyway: not a target');
    t.eq(DD.Combat.targets(me, socket(me, 'syl_encore', 3)).length, 1, 'III: still a target (+1 AP)');
    toTurn(knight);
    t.ok(round() === 3 && DD.Combat.canUse(knight, bash) === true, 'round 3: the knight bashes again without any encore');
  });

  // ---- targeting (the tooltip shows these; the descs give the ally ranges) ---------------------------------------
  T.suite('hero_syllamin: targeting — cast ranges and line of sight at every level', function (t) {
    if (!guard(t)) return;
    // id: [[min, max] per level], needs line of sight
    const TABLE = {
      syl_basic: [[[1, 4]], true],
      syl_heckle: [[[1, 4], [1, 4], [1, 5]], true],
      syl_hype_man: [[[1, 5], [1, 5], [1, 5]], false],
      syl_glitter_bomb: [[[1, 5], [1, 5], [1, 5]], true],
      syl_lullaby: [[[1, 4], [1, 4], [1, 4]], true],
      syl_encore: [[[1, 5], [1, 5], [1, 5]], false],
      syl_fae_blink: [[[2, 6], [2, 7], [2, 8]], false],
      syl_mosh_pit: [[[1, 5], [1, 5], [1, 5]], true],
      syl_mic_drop: [[[1, 4], [1, 4], [1, 4]], false],
    };
    sb({ heroes: [S(1, 1)], enemies: [E('test_grunt', 8, 8)] });
    const me = syl();
    Object.keys(TABLE).forEach(function (id) {
      const def = DD.getSkill(id);
      TABLE[id][0].forEach(function (r, i) {
        t.eq(JSON.stringify(DD.Targeting.range(me, def, i + 1)), JSON.stringify(r), id + ' L' + (i + 1) + ': range ' + r.join('-'));
      });
      t.eq(!!def.target.los, TABLE[id][1], id + ': ' + (TABLE[id][1] ? 'needs' : 'ignores') + ' line of sight');
    });
    ['syl_power_ballad', 'syl_signature'].forEach(function (id) { t.eq(DD.getSkill(id).target.type, 'self', id + ': centred on himself'); });
    t.eq(DD.getSkill('syl_shriek').target.type, 'dir', 'syl_shriek: a direction');
    // "an ally up to 5 tiles away" at the edge: 5 is in, 6 is out (Hype Man, Encore III)
    sb({ heroes: [S(1, 1), H('test_knight', 6, 1), H('test_cleric', 1, 7)], enemies: [E('test_grunt', 8, 8)] });
    ['syl_hype_man', 'syl_encore'].forEach(function (id) {
      const tg = DD.Combat.targets(syl(), socket(syl(), id, 3)).map(key);
      t.ok(tg.indexOf('6,1') >= 0 && tg.indexOf('1,7') < 0, id + ': the ally 5 tiles away is in reach, the one 6 away is not (' + tg.join(' ') + ')');
    });
  });

  // ---- Fae Blink -----------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Fae Blink — pulls an ally to his side with Block until its next turn', function (t) {
    if (!guard(t)) return;
    const BLOCK = [3, 4, 6], RANGE = [6, 7, 8];
    [1, 2, 3].forEach(function (lv) {
      // order: Syllamin, the grunt, then the mage: the Block covers the grunt's turn and ends at the mage's
      sb({ heroes: [S(1, 1), H('test_mage', 4, 4), H('test_cleric', 2, 1), H('test_knight', 8, 1)], enemies: [E('test_grunt', 8, 8)],
        order: [HERO, 'test_grunt', 'test_mage'] });
      const me = syl(), mage = hero('test_mage'), grunt = at(8, 8);
      const slot = socket(me, 'syl_fae_blink', lv);
      t.eq(desc('syl_fae_blink', lv), 'Teleport an ally 2-' + RANGE[lv - 1] + ' tiles away to a free tile next to you. It gains ' + BLOCK[lv - 1] + ' Block.', 'L' + lv + ': desc');
      const tg = DD.Combat.targets(me, slot).map(key);
      t.ok(tg.indexOf('4,4') >= 0, 'L' + lv + ': ally 6 away is in range');
      t.ok(tg.indexOf('2,1') < 0, 'L' + lv + ': an adjacent ally is not (min range 2)');
      t.eq(tg.indexOf('8,1') >= 0, RANGE[lv - 1] >= 7, 'L' + lv + ': ally 7 away ' + (RANGE[lv - 1] >= 7 ? 'in range' : 'out of range'));
      t.eq(keys(DD.Targeting.buildCtx(me, slot, { x: 4, y: 4 }).tiles), '1,2', 'L' + lv + ': area shows the landing tile');
      t.ok(use(me, slot, 4, 4), 'L' + lv + ': used');
      t.ok(mage.x === 1 && mage.y === 2, 'L' + lv + ': landed on the free tile next to him nearest to it (' + key(mage) + ')');
      t.eq(mage.block, BLOCK[lv - 1], 'L' + lv + ': +' + BLOCK[lv - 1] + ' Block');
      t.eq(me.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(slot.cd, 2, 'L' + lv + ': cooldown 2');
      let during = -1;
      const off = atTurnStart(grunt, function () { during = mage.block; });
      DD.Combat.endTurn();
      off();
      t.eq(during, BLOCK[lv - 1], 'L' + lv + ': the Block is still there on the grunt\'s turn');
      t.ok(cur() === mage && mage.block === 0, 'L' + lv + ': gone at the start of the mage\'s own turn');
    });
    // hazards are avoided, even when the burning tile is the one nearest to the ally; no room → no target
    sb({ heroes: [S(1, 1), H('test_knight', 1, 5)], enemies: [E('test_grunt', 8, 8)], surfaces: [{ x: 1, y: 2, id: 'fire', turns: 3 }] });
    let me = syl(), knight = hero('test_knight');
    t.ok(!!DD.Grid.hazardAt(1, 2, knight), '(the nearest tile next to him is on fire)');
    t.ok(use(me, socket(me, 'syl_fae_blink', 1), 1, 5), 'blink the knight over');
    t.ok(key(knight) !== '1,2' && DD.Grid.dist(knight, me) === 1 && !has(knight, 'burn') && knight.hp === knight.maxHp,
      'it lands on a safe tile next to him, not in the fire (' + key(knight) + ')');
    sb({ heroes: [S(0, 0), H('test_knight', 4, 4)], enemies: [E('test_grunt', 8, 8)], objects: [{ x: 1, y: 0, id: 'crate' }, { x: 0, y: 1, id: 'crate' }] });
    me = syl(); knight = hero('test_knight');
    t.eq(DD.Combat.targets(me, socket(me, 'syl_fae_blink', 3)).length, 0, 'boxed in: no valid target');
    // a ground ally never lands on a pit next to him (he can hover over it)
    sb({ heroes: [S(4, 4), H('test_knight', 8, 4)], enemies: [E('test_grunt', 0, 8)],
      terrain: function (tl) { if (Math.abs(tl.x - 4) + Math.abs(tl.y - 4) === 1 && tl.x !== 4) tl.t = 'pit'; } });
    me = syl(); knight = hero('test_knight');
    t.ok(use(me, socket(me, 'syl_fae_blink', 1), 8, 4), 'blink past pits');
    t.ok(!DD.Grid.isPit(knight.x, knight.y) && !knight.downed && knight.hp === knight.maxHp, 'landed on solid ground (' + key(knight) + ')');
    // hovering in a ring of pits (and deep water): nowhere for a ground ally to land, so no target
    sb({ heroes: [S(4, 4), H('test_knight', 8, 4)], enemies: [E('test_grunt', 0, 8)],
      terrain: function (tl) { if (Math.abs(tl.x - 4) + Math.abs(tl.y - 4) === 1) tl.t = tl.x === 4 && tl.y === 3 ? 'deep_water' : 'pit'; } });
    t.eq(DD.Combat.targets(syl(), socket(syl(), 'syl_fae_blink', 1)).length, 0, 'ringed by pits: no ground ally can be blinked into one');
  });

  // ---- Mosh Pit ------------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Mosh Pit — pulls foes together (into an ally\'s AoE)', function (t) {
    if (!guard(t)) return;
    const DMG = [2, 3, 3];
    [1, 2, 3].forEach(function (lv) {
      const s = sb({ heroes: [S(1, 3)], enemies: [E('test_grunt', 4, 6), E('test_grunt', 6, 4), E('test_grunt', 2, 4), E('test_grunt', 4, 7)] });
      const me = syl();
      const a = at(4, 6), b = at(6, 4), c = at(2, 4), d = at(4, 7);
      const slot = socket(me, 'syl_mosh_pit', lv);
      t.eq(desc('syl_mosh_pit', lv), 'Foes within ' + (lv === 3 ? 3 : 2) + ' tiles of the target tile take ' + DMG[lv - 1] + ' damage and are pulled up to ' + (lv === 3 ? 2 : 1) + ' tile' + (lv === 3 ? 's' : '') + ' toward it.', 'L' + lv + ': desc');
      t.ok(use(me, slot, 4, 4), 'L' + lv + ': used');
      t.eq(me.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(slot.cd, 2, 'L' + lv + ': cooldown 2');
      t.ok(key(a) === '4,5' && key(b) === '5,4' && key(c) === '3,4', 'L' + lv + ': foes 2 away pulled next to the centre (' + [a, b, c].map(key).join(' ') + ')');
      t.ok(a.hp <= 14 - DMG[lv - 1] && b.hp === 14 - DMG[lv - 1] && c.hp === 14 - DMG[lv - 1], 'L' + lv + ': ' + DMG[lv - 1] + ' damage each');
      if (lv < 3) t.ok(key(d) === '4,7' && d.hp === 14, 'L' + lv + ': foe 3 away untouched');
      else {
        // radius 3, pull 2: d slides in behind a and bumps it
        t.ok(key(d) === '4,6' && d.hp === 14 - 3 - 3 && a.hp === 14 - 3 - 3, 'L3: radius 3, pull 2, collision bump 3 both (' + key(d) + ' ' + d.hp + '/' + a.hp + ')');
      }
      t.ok(stacks(b) === 1 && s.hype >= 4, 'L' + lv + ': Roasts + multi-hit Hype');
    });
    // a foe on the centre tile takes the damage and stays; a foe killed by the damage is not pulled
    sb({ heroes: [S(1, 3)], enemies: [E('test_grunt', 4, 4), E('test_grunt', 4, 6, 0.1)] });
    const me = syl(), centre = at(4, 4), weak = at(4, 6);
    use(me, socket(me, 'syl_mosh_pit', 1), 4, 4);
    t.ok(key(centre) === '4,4' && centre.hp === 12, 'centre foe: hit, not moved');
    t.ok(weak.dead && key(weak) === '4,6', 'a foe killed by the mosh is not dragged around');
    // hazards on the way in: a foe dragged across a pit falls in (YEET), one dragged onto lava burns
    const sp = sb({ heroes: [S(1, 3)], enemies: [E('test_grunt', 6, 4), E('test_grunt', 4, 6, 2), E('test_grunt', 8, 8)],
      terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; if (tl.x === 4 && tl.y === 5) tl.t = 'lava'; } });
    const faller = at(6, 4), roast = at(4, 6);
    t.ok(use(syl(), socket(syl(), 'syl_mosh_pit', 1), 4, 4), 'a mosh pit between a pit and a lava pool');
    t.ok(faller.dead && sp.stats.envKills === 1, 'the foe pulled across the pit falls in: YEET');
    t.ok(key(roast) === '4,5' && roast.hp < 28 - 2 && has(roast, 'burn'), 'the foe pulled onto the lava burns (' + roast.hp + ' HP)');
    // "up to": nobody is pulled onto the target tile itself, so around a real pit the crowd gathers at its edge
    sb({ heroes: [S(1, 3)], enemies: [E('test_grunt', 5, 4), E('test_grunt', 4, 6), E('test_grunt', 8, 8)],
      terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'pit'; } });
    const edge = at(5, 4), back = at(4, 6);
    t.ok(use(syl(), socket(syl(), 'syl_mosh_pit', 1), 4, 4), 'a mosh pit centred on a pit');
    t.ok(key(edge) === '5,4' && edge.hp === 12 && !edge.dead, 'the foe at the edge is as close as it gets: it stays (' + key(edge) + ')');
    t.ok(key(back) === '4,5' && back.hp === 12 && !back.dead, 'the foe 2 away is pulled to the edge (' + key(back) + ')');
    // ...where a push finishes the job (Discordant Shriek: YEET)
    syl().ap = 3;
    syl().skills.push(DD.Act.makeSlot('syl_shriek', 1));
    t.ok(DD.Act.teleport(syl(), 6, 4), '(he hops over to the far side)');
    t.ok(use(syl(), syl().skills[1], 5, 4) && edge.dead, 'Shriek shoves the gathered foe into the pit');
    // combo: the mage's radius-1 Fire Fixture on the pit's centre catches the whole crowd afterwards
    sb({ heroes: [S(1, 3), H('test_mage', 2, 7, { skills: [{ id: 'test_fireball', level: 1 }] })],
      enemies: [E('test_grunt', 4, 6, 2), E('test_grunt', 6, 4, 2), E('test_grunt', 2, 4, 2)] });
    const mage = hero('test_mage'), fb = slotOf(mage, 'test_fireball');
    const caught = function () { return DD.Targeting.buildCtx(mage, fb, { x: 4, y: 4 }).foes.length; };
    t.eq(caught(), 0, 'before: a fireball on (4,4) hits nobody');
    t.ok(use(syl(), socket(syl(), 'syl_mosh_pit', 1), 4, 4), 'MOSH!');
    t.eq(caught(), 3, 'after: it catches all three');
    DD.Combat.endTurn();
    t.ok(DD.Combat.useSkill(mage, fb, 4, 4), 'the mage drops the fireball on them');
    t.ok(DD.Combat.enemies().every(function (e) { return e.hp <= 28 - 2 - 6; }), 'everyone in the pit burns');
  });

  // ---- Mic Drop ------------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: Mic Drop — big hit + Stun, once per combat, no line of sight, interrupts a wind-up', function (t) {
    if (!guard(t)) return;
    const DMG = [15, 18, 22];
    [1, 2, 3].forEach(function (lv) {
      const s = sb({ enemyAi: true, heroes: [S(3, 4)], enemies: [E('test_grunt', 4, 4, 3), E('test_grunt', 4, 5), E('test_grunt', 8, 8)] });
      const me = syl(), tg = at(4, 4), next = at(4, 5);
      const slot = socket(me, 'syl_mic_drop', lv);
      t.eq(desc('syl_mic_drop', lv), 'Once per combat: deal ' + DMG[lv - 1] + ' damage to a foe up to 4 tiles away (no line of sight needed) and Stun it.', 'L' + lv + ': desc');
      t.ok(use(me, slot, 4, 4), 'L' + lv + ': used');
      t.eq(me.ap, 0, 'L' + lv + ': 3 AP');
      t.eq(tg.hp, 42 - DMG[lv - 1], 'L' + lv + ': ' + DMG[lv - 1] + ' damage');
      t.eq(next.hp, 14, 'L' + lv + ': no splash');
      t.ok(st(tg, 'stun') && st(tg, 'stun').turns === 1 && stacks(tg) === 1, 'L' + lv + ': Stunned for 1 turn, Roasted 1');
      t.eq(s.hype, 0, 'L' + lv + ': one foe hit: no multi-hit Hype');
      const n0 = s.log.length;
      DD.Combat.endTurn();
      t.ok(logSince(n0, /Test Grunt loses the turn \(Stunned\)/) && !has(tg, 'stun'), 'L' + lv + ': it lost its next turn, then the stun ended');
      me.ap = 3;
      t.eq(DD.Combat.canUse(me, slot), 'No charges left.', 'L' + lv + ': once per combat');
    });
    // over walls (no LOS needed), not past 4 tiles
    sb({ heroes: [S(1, 4)], enemies: [E('test_grunt', 4, 4), E('test_grunt', 6, 4)], terrain: function (tl) { if (tl.x === 2) tl.t = 'wall'; } });
    const me = syl();
    const tgs = DD.Combat.targets(me, socket(me, 'syl_mic_drop', 1)).map(key);
    t.ok(tgs.indexOf('4,4') >= 0 && tgs.indexOf('6,4') < 0, 'drops over walls, range 4');
    // a real Stun for elites (unlike Emotional Damage), and the boss's wound-up meteor is interrupted
    sb({ heroes: [S(2, 4), H('test_cleric', 2, 6)], enemies: [E('test_brute', 5, 3), E('test_boss', 4, 6)] });
    const brute = at(5, 3), boss = at(4, 6);
    t.ok(use(syl(), socket(syl(), 'syl_mic_drop', 1), brute.x, brute.y) && has(brute, 'stun'), 'elite: Stunned');
    const w = DD.AI.windUp(boss, 'test_boss_meteor', { x: 2, y: 6 }, { label: 'Meteor of Regression' });
    t.ok(w && boss.intents.length === 1, 'the boss winds up its meteor');
    let cancelled = null;
    const off = DD.Events.on('windup:cancel', function (e) { if (e.unit === boss) cancelled = e; });
    syl().ap = 3;
    syl().skills = [DD.Act.makeSlot('syl_mic_drop', 1)];
    t.ok(use(syl(), syl().skills[0], boss.x, boss.y), 'Mic Drop on the boss');
    off();
    t.ok(has(boss, 'stun') && boss.intents.length === 0 && !!cancelled, 'the Stun interrupts the wind-up (windup:cancel)');
  });

  // ---- Diss Track (signature) -----------------------------------------------------------------------------------
  T.suite('hero_syllamin: Diss Track (signature) — 3 verses, mass Emotional Damage', function (t) {
    if (!guard(t)) return;
    const s = sb({ w: 10, h: 10, enemyAi: true, heroes: [S(1, 1), H('test_cleric', 2, 1)],
      enemies: [E('test_grunt', 1, 2), E('test_grunt', 7, 2), E('test_grunt', 2, 8), E('test_boss', 8, 8)] });
    const me = syl(), cleric = hero('test_cleric');
    const grunts = DD.Combat.enemies().filter(function (u) { return u.defId === 'test_grunt'; });
    const boss = DD.Combat.enemies().filter(function (u) { return u.defId === 'test_boss'; })[0];
    t.eq(desc('syl_signature', 1), '3 verses: every foe takes 4 psychic damage per verse (12 total). Each verse Roasts.', 'desc');
    s.hype = 99;
    t.eq(DD.Combat.canUse(me, me.signature), 'Needs 100 Hype.', 'needs 100 Hype');
    s.hype = 100;
    t.ok(use(me, me.signature, me.x, me.y), 'Diss Track dropped');
    t.eq(me.ap, 1, '2 AP');
    grunts.forEach(function (g, i) {
      t.eq(g.hp, 14 - 12, 'grunt ' + i + ': 3 verses × 4 = 12');
      t.ok(has(g, 'stun') && !has(g, 'syl_roasted'), 'grunt ' + i + ': Emotional Damage (Stunned)');
    });
    t.eq(boss.hp, 120 - 9, 'boss (armor 1): 3 × 3');
    t.ok(has(boss, 'weak') && !has(boss, 'stun'), 'boss: Weakened, not stunned');
    t.eq(s.hype, 4 * 6 + 4, 'Hype after: 4 Emotional Damages (6 each) + multi-hit 4');
    t.eq(cleric.hp, cleric.maxHp, 'allies untouched');
    // the grunt next to him lost its next turn
    const hp = me.hp + cleric.hp;
    DD.Combat.endTurn();
    DD.Combat.endTurn();
    t.ok(round() === 2 && me.hp + cleric.hp >= hp - 0, 'the stunned grunt next to him did nothing');
    // a verse that kills stops hitting the dead; Silence stops the track
    const s2 = sb({ heroes: [S(1, 1)], enemies: [E('test_grunt', 5, 5, 0.3), E('test_grunt', 6, 6)] });
    s2.hype = 100;
    const me2 = syl(), weakling = at(5, 5), other = at(6, 6);
    t.ok(use(me2, me2.signature, 1, 1), 'used again');
    t.ok(weakling.dead && other.hp === 2, 'kills mid-track, the rest still hears all 3 verses');
    // "every foe" means every foe at each verse: one that shows up mid-track (a split slime, a reinforcement) hears the rest
    const s4 = sb({ heroes: [S(1, 1)], enemies: [E('test_grunt', 5, 5, 0.3), E('test_grunt', 6, 6)] });
    s4.hype = 100;
    const doomed = at(5, 5);
    let late = null;
    DD.Act.addRule({ id: 'syl_test_split', name: 'Split', hooks: { onAnyDeath: function (u, dead) {
      if (dead === doomed && !late) late = DD.Act.spawn('test_grunt', 8, 1);
    } } });
    t.ok(use(syl(), syl().signature, 1, 1) && doomed.dead && !!late, 'verse 1 kills the weakling, and a new grunt shows up');
    t.ok(late && late.hp === 14 - 8 && stacks(late) === 2, 'the newcomer hears verses 2 and 3: 8 damage, Roasted 2 (' + (late && late.hp) + ')');
    const s3 = sb({ heroes: [S(1, 1)], enemies: [E('test_grunt', 5, 5)] });
    s3.hype = 100;
    DD.Act.addStatus(syl(), 'silenced', { turns: 1 });
    t.eq(DD.Combat.canUse(syl(), syl().signature), 'Silenced!', 'silenced: no diss track');
  });

  // ---- items ---------------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: items — Electric Lute, Studded Jacket, Platinum Diss Mixtape', function (t) {
    if (!guard(t)) return;
    // Electric Lute: +10% damage, lightning jokes (Wet ×1.5), electrified water
    sb({ heroes: [S(1, 4, { items: ['syl_electric_lute'] })], enemies: [E('test_grunt', 4, 4), E('test_grunt', 4, 3)] });
    let me = syl();
    const rec = [];
    DD.Act.addRule({ id: 'syl_test_rec', name: 'Recorder', hooks: { onTakeDamage: function (d) { rec.push(d.element); } } });
    const dry = at(4, 4), wet = at(4, 3);
    DD.Act.addStatus(wet, 'wet', { turns: 2 });
    use(me, me.basic, 4, 4);
    t.eq(dry.hp, 14 - 6, 'lute: round(5 × 1.1) = 6');
    t.eq(rec[rec.length - 1], 'lightning', 'lute: the joke is lightning damage');
    use(me, me.basic, 4, 3);
    t.eq(wet.hp, 14 - 8, 'lute: Wet foe takes round(5 × 1.1 × 1.5) = 8');
    sb({ heroes: [S(1, 4, { items: ['syl_electric_lute'] }), H('test_cleric', 1, 6)], enemies: [E('test_grunt', 4, 4), E('test_grunt', 4, 5), E('test_grunt', 7, 7)],
      terrain: function (tl) { if (tl.x === 4 && (tl.y === 4 || tl.y === 5)) tl.t = 'water'; } });
    me = syl();
    const w1 = at(4, 4), w2 = at(4, 5), dryFoe = at(7, 7);
    use(me, me.basic, 4, 4);
    t.ok(has(w1, 'stun') && has(w2, 'stun') && !has(dryFoe, 'stun'), 'lute: the water body is electrified (stuns everyone in it)');
    t.eq(w2.hp, 14 - 4, 'lute: 4 shock damage through the water');
    t.eq(stacks(w2), 0, 'shock damage is not a skill hit: no Roast');
    t.ok(/allies too/.test(DD.getItem('syl_electric_lute').desc), 'lute desc warns that allies in the water get shocked');
    sb({ heroes: [S(1, 4, { items: ['syl_electric_lute'] }), H('test_cleric', 4, 6)], enemies: [E('test_grunt', 4, 4, 2)],
      terrain: function (tl) { if (tl.x === 4 && tl.y >= 4 && tl.y <= 6) tl.t = 'water'; } });
    me = syl();
    const pal = hero('test_cleric');
    DD.Act.addStatus(pal, 'wet', { turns: 2 });
    const palHp = pal.hp;
    use(me, me.basic, 4, 4);
    t.ok(has(pal, 'stun') && palHp - pal.hp === 6, 'lute: the ally in the water takes 4 × 1.5 = 6 and is Stunned (' + (palHp - pal.hp) + ')');
    // Studded Jacket: +4 HP, a comeback Roast on adjacent attackers (a real enemy turn); ranged attackers get nothing
    sb({ enemyAi: true, heroes: [S(4, 4, { items: ['syl_studded_jacket'] })], enemies: [E('test_grunt', 5, 4, 3), E('test_archer', 4, 8)] });
    me = syl();
    t.eq(me.maxHp, DD.getHero(HERO).stats.hp + 4, 'jacket: +4 max HP');
    const g = at(5, 4), archer = at(4, 8);
    let hp = me.hp;
    DD.Combat.endTurn();
    t.ok(me.hp < hp && stacks(g) === 1, 'jacket: the adjacent grunt stabbed him and got a comeback Roast');
    t.eq(stacks(archer), 0, 'jacket: the archer\'s arrow earns no comeback');
    // a comeback meltdown during the grunt's own turn: it loses its NEXT turn
    DD.Syllamin.roast(me, g, 1);
    t.eq(stacks(g), 2, 'grunt at 2 Roasted');
    hp = me.hp;
    DD.Combat.endTurn();
    t.ok(has(g, 'stun') && stacks(g) === 0, 'its stab drew the comeback that melted it down: Stunned');
    const meHp = me.hp;
    const n0 = DD.Combat.state.log.length;
    DD.Combat.endTurn();
    t.ok(logSince(n0, /Test Grunt loses the turn \(Stunned\)/) && !has(g, 'stun'), 'it lost its next turn (the stun was fresh on its own turn)');
    t.ok(me.hp >= meHp - 4, 'only the archer could hit him that round');
    // Platinum Diss Mixtape: +15 Hype at start, each Emotional Damage +4 more Hype
    const s = sb({ heroes: [S(1, 4, { items: ['syl_mixtape'] })], enemies: [E('test_grunt', 4, 4, 2), E('test_grunt', 5, 5), E('test_brute', 7, 2)] });
    me = syl();
    t.eq(s.hype, 15, 'mixtape: 15 Hype at combat start');
    DD.Syllamin.roast(me, at(4, 4), 3);
    t.eq(s.hype, 15 + 10, 'mixtape: 10 Hype per Emotional Damage');
    DD.Syllamin.roast(me, at(7, 2), 3);
    t.eq(s.hype, 15 + 20, 'mixtape: elites too');
    t.eq(stacks(at(5, 5)), 0, 'mixtape: no spreading roasts (one rule)');
  });

  // ---- edge cases -----------------------------------------------------------------------------------------------
  T.suite('hero_syllamin: edge cases — status-locked user, AP, turns, dying targets, null targets, flying', function (t) {
    if (!guard(t)) return;
    sb({ heroes: [S(2, 4), H('test_knight', 3, 6)], enemies: [E('test_grunt', 4, 4), E('test_grunt', 6, 6)] });
    const me = syl(), knight = hero('test_knight');
    // silenced: spells and songs are out, everything else works (the basic becomes a rude gesture)
    DD.Act.addStatus(me, 'silenced', { turns: 1 });
    POOL.forEach(function (id) {
      const slot = DD.Act.makeSlot(id, 1);
      me.skills = [slot];
      const r = DD.Combat.canUse(me, slot);
      if (SPELLS.indexOf(id) >= 0) t.eq(r, 'Silenced!', 'silenced: ' + id + ' is a spell');
      else t.ok(r !== 'Silenced!', 'silenced: ' + id + ' still works (' + r + ')');
    });
    t.eq(DD.Combat.canUse(me, me.basic), true, 'silenced: the basic still works');
    t.ok(use(me, me.basic, 4, 4), 'rude gesture lands');
    DD.Act.removeStatus(me, 'silenced');
    // stunned / asleep / sheep: nothing
    [['stun', 'Stunned!'], ['sleep', 'Asleep. Zzz.'], ['sheep', null]].forEach(function (p) {
      DD.Act.addStatus(me, p[0], { turns: 1 });
      const r = DD.Combat.canUse(me, me.basic);
      t.ok(r !== true && (!p[1] || r === p[1]), p[0] + ': ' + r);
      DD.Act.removeStatus(me, p[0]);
    });
    // charmed by a grunt: can't hurt it (and doesn't Roast it)
    const g = at(4, 4);
    DD.Act.addStatus(me, 'charmed', { turns: 1 }, g);
    const hp = g.hp, rs = stacks(g);
    me.ap = 3;
    use(me, me.basic, 4, 4);
    t.ok(g.hp === hp && stacks(g) === rs, 'charmed: 0 damage to the charmer, no Roast');
    t.eq(DD.Combat.turnAp(me), 2, 'charmed: −1 AP');
    DD.Act.removeStatus(me, 'charmed');
    // not enough AP
    me.ap = 2;
    me.skills = [DD.Act.makeSlot('syl_mic_drop', 1)];
    t.eq(DD.Combat.canUse(me, me.skills[0]), 'Not enough AP.', 'Mic Drop needs 3 AP');
    me.ap = 1;
    me.skills = [DD.Act.makeSlot('syl_heckle', 1)];
    t.eq(DD.Combat.canUse(me, me.skills[0]), 'Not enough AP.', 'Heckle needs 2 AP');
    // only on his own turn; unused AP is lost (no Guard, no Block)
    me.ap = 3;
    DD.Combat.endTurn();
    t.eq(cur(), knight, 'the knight\'s turn');
    t.eq(DD.Combat.canUse(me, me.basic), 'Not Syllamin\'s turn.', 'not his turn: no jokes');
    t.ok(me.ap === 0 && me.block === 0, 'his 3 unused AP were lost: no Guard Block');
    toTurn(me);
    // stunned during his own turn (a trap, a thorn): his NEXT turn passes by itself (0 AP)
    DD.Act.addStatus(me, 'stun', { turns: 1 }, g);
    const r0 = round(), n0 = DD.Combat.state.log.length;
    DD.Combat.endTurn();
    t.ok(round() === r0 && cur() === knight && has(me, 'stun'), 'the rest of this round: still Stunned (it was fresh)');
    DD.Combat.endTurn();
    t.ok(round() === r0 + 1 && cur() === knight && !has(me, 'stun'), 'next round his turn was skipped, then the stun ended');
    t.ok(logSince(n0, /Syllamin loses the turn \(Stunned\)/), 'logged: "Syllamin loses the turn"');
    // every skill executed straight at an empty tile / with no target unit: no throw, no warnings
    toTurn(me);
    const w0 = warnings();
    [DD.getHero(HERO).basic, DD.getHero(HERO).signature].concat(POOL).forEach(function (id) {
      const def = DD.getSkill(id);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        const slot = DD.Act.makeSlot(id, lv);
        DD.Combat._action(function () { DD.Combat.resolveSkill(me, slot, { x: 0, y: 8 }, { pay: false }); });
        const ctx = DD.Targeting.buildCtx(me, slot, null);
        DD.safe('null target ' + id, def.execute, def, [ctx]);
      }
    });
    t.eq(warnings(), w0, 'empty-tile / null-target executions are harmless');
    // a target that dies mid-skill: no charm, no stun, no pull on a corpse
    ['syl_heckle', 'syl_mic_drop', 'syl_mosh_pit'].forEach(function (id) {
      sb({ heroes: [S(2, 4)], enemies: [E('test_grunt', 4, 4, 0.1), E('test_grunt', 8, 8)] });
      const v = at(4, 4);
      const w1 = warnings();
      t.ok(use(syl(), socket(syl(), id, 1), 4, id === 'syl_mosh_pit' ? 5 : 4), id + ': used on a 1 HP grunt');
      t.ok(v.dead && v.statuses.every(function (x) { return x.id !== 'charmed' && x.id !== 'stun'; }) && key(v) === '4,4' && warnings() === w1, id + ': it died, nothing else happened to it');
    });
    // flying: he can hover over a pit and deep water
    sb({ heroes: [S(1, 1)], enemies: [E('test_grunt', 8, 8)], terrain: function (tl) { if (tl.x === 2 && tl.y === 1) tl.t = 'pit'; if (tl.x === 3 && tl.y === 1) tl.t = 'deep_water'; } });
    const fly = syl();
    t.ok(DD.Combat.reachable(fly).has('2,1') && DD.Combat.reachable(fly).has('3,1'), 'pits and deep water are reachable');
    t.ok(DD.Combat.move(fly, 2, 1), 'moves over the pit');
    t.ok(!fly.downed && fly.hp === fly.maxHp && fly.x === 2, 'and hovers there unharmed');
    DD.Act.push(null, fly, { x: 1, y: 0 }, 1);
    t.ok(fly.x === 3 && !fly.downed && fly.hp === fly.maxHp, 'pushed over deep water: still flying');
    t.ok(sane(t, 'edge cases'), 'state sane');
  });

  // ---- attacks of opportunity (DESIGN §4.2) ---------------------------------------------------------------------
  T.suite('hero_syllamin: attacks of opportunity — walking off provokes; his control, pushes and Fae Blink unpin the party', function (t) {
    if (!guard(t)) return;
    const seen = [];
    const off = DD.Events.on('opportunity:attack', function (e) { seen.push(e.attacker.defId + '>' + e.mover.defId); });
    const fresh = function () { seen.length = 0; };
    /** Would `foe` strike `mover` stepping off its tile (south)? (a pure query, any turn) */
    const pinned = function (mover, foe) { return DD.Act.provokers(mover, [{ x: mover.x, y: mover.y + 1 }]).indexOf(foe) >= 0; };
    try {
      // he flies off from the grunt next to him: one free stab as he leaves; he never makes one (his basic is ranged)
      sb({ heroes: [S(3, 4)], enemies: [E('test_grunt', 4, 4)] });
      let me = syl(), g = at(4, 4);
      t.eq(DD.Act.opportunitySlot(me), null, 'a ranged basic: he never makes attacks of opportunity');
      const pv = DD.Combat.provokes(me, 0, 4);
      t.ok(pv.length === 1 && pv[0].unitId === g.id && pv[0].dmg === 4, 'the move preview: provokes the grunt (4) (' + JSON.stringify(pv) + ')');
      let hp = me.hp;
      fresh();
      t.ok(DD.Combat.move(me, 0, 4), 'he flies off');
      t.ok(me.hp === hp - 4 && key(me) === '0,4', 'stabbed for 4 on the way out, and he kept going (' + key(me) + ', ' + me.hp + ' HP)');
      t.eq(seen.join(' '), 'test_grunt>syllamin', 'exactly one attack of opportunity');
      t.eq(DD.Combat.canUndo(), false, 'a move that provoked can\'t be undone');
      // flying up next to a foe never provokes
      sb({ heroes: [S(1, 4)], enemies: [E('test_grunt', 4, 4)] });
      fresh();
      t.ok(DD.Combat.move(syl(), 3, 4) && seen.length === 0, 'moving next to a foe: no attack');
      // Studded Jacket: that stab is a foe damaging him from an adjacent tile → a comeback Roast (at 2 Roasted: a meltdown)
      sb({ heroes: [S(3, 4, { items: ['syl_studded_jacket'] })], enemies: [E('test_grunt', 4, 4)] });
      me = syl(); g = at(4, 4);
      t.ok(DD.Combat.move(me, 0, 4) && stacks(g) === 1, 'jacket: the attack of opportunity draws a comeback Roast');
      sb({ heroes: [S(3, 4, { items: ['syl_studded_jacket'] })], enemies: [E('test_grunt', 4, 4)] });
      me = syl(); g = at(4, 4);
      DD.Syllamin.roast(me, g, 2);
      hp = me.hp;
      t.ok(DD.Combat.move(me, 0, 4), 'he flies off from a Roasted 2 grunt');
      t.ok(has(g, 'stun') && stacks(g) === 0 && me.hp === hp - 4 && key(me) === '0,4', 'its stab draws the comeback that melts it down (Stunned); his walk goes on');
      // Fae Blink: the cleric pinned between two grunts is teleported out, nobody strikes
      sb({ heroes: [S(2, 2), H('test_cleric', 5, 4)], enemies: [E('test_grunt', 4, 4), E('test_grunt', 6, 4)] });
      me = syl();
      const cleric = hero('test_cleric');
      t.eq(DD.Act.provokers(cleric, [{ x: 5, y: 3 }]).length, 2, 'walking out, the cleric would provoke both grunts');
      hp = cleric.hp;
      fresh();
      t.ok(use(me, socket(me, 'syl_fae_blink', 1), 5, 4), 'Fae Blink on the pinned cleric');
      t.ok(DD.Grid.dist(cleric, me) === 1 && cleric.hp === hp && seen.length === 0, 'teleported out: no attack of opportunity (' + key(cleric) + ')');
      // Discordant Shriek: push the grunt off him, then walk away for free
      sb({ heroes: [S(3, 4)], enemies: [E('test_grunt', 4, 4)] });
      me = syl(); g = at(4, 4);
      t.ok(use(me, socket(me, 'syl_shriek', 1), 4, 4) && key(g) === '5,4', 'Shriek pushes the grunt out of reach');
      fresh();
      t.eq(DD.Combat.provokes(me, 0, 4).length, 0, 'the walk provokes nobody now');
      t.ok(DD.Combat.move(me, 0, 4) && seen.length === 0 && key(me) === '0,4', 'he walks off for free');
      // Mosh Pit drags a grunt away from the knight: a pull is not a move action (no free slash)
      sb({ heroes: [S(1, 1), H('test_knight', 4, 5)], enemies: [E('test_grunt', 4, 4)] });
      const knight = hero('test_knight');
      g = at(4, 4);
      t.ok(DD.Act.provokers(g, [{ x: 4, y: 3 }]).indexOf(knight) >= 0, 'walking off, the grunt would provoke the knight');
      fresh();
      t.ok(use(syl(), socket(syl(), 'syl_mosh_pit', 1), 4, 2) && key(g) === '4,3', 'Mosh Pit pulls it away from him');
      t.ok(seen.length === 0 && g.hp === 14 - 2 && knight.oppRound !== DD.Combat.state.round, 'no attack of opportunity on a pull');
      // his control switches a foe's attacks of opportunity off — Sleep (Lullaby), until its turn is slept away
      sb({ heroes: [S(3, 4), H('test_knight', 4, 5)], enemies: [E('test_grunt', 4, 4)] });
      me = syl(); g = at(4, 4);
      t.ok(pinned(me, g), 'before: the grunt pins him');
      t.ok(use(me, socket(me, 'syl_lullaby', 1), 4, 4) && has(g, 'sleep'), 'Lullaby: the grunt sleeps');
      t.ok(!pinned(me, g), 'asleep: no attack of opportunity');
      hp = me.hp;
      fresh();
      t.ok(DD.Combat.move(me, 0, 4) && seen.length === 0 && me.hp === hp, 'he walks off untouched');
      DD.Combat.endRound();
      t.ok(round() === 2 && !has(g, 'sleep') && pinned(hero('test_knight'), g), 'its turn slept away: awake, it pins the knight again');
      // Dazzle (Glitter Bomb): the cleric walks off on her turn
      sb({ heroes: [S(1, 4), H('test_cleric', 4, 4)], enemies: [E('test_grunt', 5, 4)] });
      me = syl();
      const c1 = hero('test_cleric');
      g = at(5, 4);
      t.ok(pinned(c1, g), 'before: the grunt pins the cleric');
      t.ok(use(me, socket(me, 'syl_glitter_bomb', 1), 6, 4) && has(g, 'dazzled'), 'Glitter Bomb: the grunt is Dazzled');
      t.ok(!pinned(c1, g), 'Dazzled: no attack of opportunity');
      DD.Combat.endTurn();
      hp = c1.hp;
      fresh();
      t.ok(cur() === c1 && DD.Combat.move(c1, 4, 2) && seen.length === 0 && c1.hp === hp, 'on her turn the cleric walks off untouched');
      // Charm (Heckle): no attacks on the party, but its own friend walking away from it gets stabbed
      sb({ heroes: [S(1, 4), H('test_cleric', 4, 4)], enemies: [E('test_grunt', 5, 4, 3), E('test_grunt', 5, 5)] });
      me = syl();
      const c2 = hero('test_cleric'), a = at(5, 4), b = at(5, 5);
      t.ok(use(me, socket(me, 'syl_heckle', 1), 5, 4) && has(a, 'charmed'), 'Heckle: the grunt next to the cleric is Charmed');
      t.ok(!pinned(c2, a), 'Charmed: no attack of opportunity on the party');
      hp = b.hp;
      fresh();
      DD.AI.moveTo(b, 7, 5);
      t.ok(seen.join(' ') === 'test_grunt>test_grunt' && b.hp === hp - 4, 'its friend walking away from it gets stabbed (' + seen.join(' ') + ')');
      // Stun (Emotional Damage): he walks off untouched
      sb({ heroes: [S(3, 4)], enemies: [E('test_grunt', 4, 4)] });
      me = syl(); g = at(4, 4);
      DD.Syllamin.roast(me, g, 2);
      t.ok(use(me, me.basic, 4, 4) && has(g, 'stun'), 'the third joke: Emotional Damage (Stunned)');
      t.ok(!pinned(me, g), 'Stunned: no attack of opportunity');
      hp = me.hp;
      fresh();
      t.ok(DD.Combat.move(me, 0, 4) && seen.length === 0 && me.hp === hp, 'he flies off untouched');
      t.ok(sane(t, 'attacks of opportunity'), 'state sane');
    } finally { off(); }
  });

  // ---- previews -------------------------------------------------------------------------------------------------
  /** Busy board so every skill has something to do (enemies frozen: previews are about his own turn). */
  function previewArena(seed) {
    const s = sb({ w: 10, h: 10, seed: seed, heroes: [S(2, 4), H('test_knight', 4, 4, { skills: [{ id: 'test_shield_bash', level: 1 }] }), H('test_cleric', 2, 7)],
      enemies: [E('test_grunt', 5, 4, 2), E('test_archer', 8, 2), E('test_archer', 8, 7), E('test_grunt', 5, 6), E('test_mortar', 9, 5)],
      surfaces: [{ x: 6, y: 5, id: 'oil', turns: 4 }, { x: 6, y: 6, id: 'oil', turns: 4 }],
      terrain: function (tl) { if (tl.x === 0 && tl.y === 0) tl.t = 'pit'; if (tl.x === 7 && tl.y === 4) tl.t = 'water'; } });
    const knight = hero('test_knight');
    slotOf(knight, 'test_shield_bash').cd = 2; // something for Encore (still cooling down on the knight's next turn)
    DD.Syllamin.roast(syl(), DD.Grid.unitAt(5, 6), 2); // a meltdown waiting to happen
    s.hype = 100;
    return { s: s, me: syl() };
  }
  T.suite('hero_syllamin: previews — side-effect free and exact', function (t) {
    if (!guard(t)) return;
    const fp = CH().fingerprint;
    let checked = 0;
    const items = [[], ['syl_electric_lute'], ['syl_mixtape']];
    [DD.getHero(HERO).basic, DD.getHero(HERO).signature].concat(POOL).forEach(function (id, n) {
      const def = DD.getSkill(id);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        const a0 = previewArena(31 + n);
        const slot0 = a0.me.basic.id === id ? a0.me.basic : a0.me.signature.id === id ? a0.me.signature : socket(a0.me, id, lv);
        const targets = DD.Combat.targets(a0.me, slot0).slice(0, 4);
        if (!targets.length) { t.fail(id + ' L' + lv + ': no target in the preview arena (' + DD.Combat.canUse(a0.me, slot0) + ')'); continue; }
        targets.forEach(function (tg, k) {
          const a = previewArena(31 + n);
          a.me.items = items[(n + k) % items.length].slice();
          const slot = a.me.basic.id === id ? a.me.basic : a.me.signature.id === id ? a.me.signature : socket(a.me, id, lv);
          const label = id + ' L' + lv + ' @' + key(tg) + (a.me.items.length ? ' [' + a.me.items[0] + ']' : '');
          const before = fp ? fp(a.s) : null;
          let prev = null;
          t.tryRun(label + ' preview', function () { prev = DD.Combat.preview(a.me, slot, tg.x, tg.y); });
          if (fp) t.eq(fp(a.s), before, label + ': preview leaves the real fight untouched');
          if (!prev) return;
          t.ok(!prev.uncertain, label + ': no dice, an exact preview');
          const hp0 = {}, down0 = {};
          a.s.units.forEach(function (u) { hp0[u.id] = u.hp; down0[u.id] = !!(u.dead || u.downed); });
          const hype0 = a.s.hype;
          t.ok(use(a.me, slot, tg.x, tg.y), label + ': used');
          a.s.units.forEach(function (u) {
            if (hp0[u.id] === undefined || down0[u.id]) return;
            const e = prev.perUnit[u.id];
            const said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
            t.eq(hp0[u.id] - u.hp, said, label + ': ' + u.name + ' HP change predicted');
            t.eq(!!(u.dead || u.downed), !!(e && e.lethal), label + ': ' + u.name + ' KO predicted');
          });
          t.eq(a.s.hype - hype0, prev.hype, label + ': Hype predicted');
          checked++;
        });
      }
    });
    t.ok(checked >= 60, 'previews checked against reality: ' + checked);
    t.log('previews checked: ' + checked);
  });

  // ---- AutoPlay ---------------------------------------------------------------------------------------------------
  /** Loadouts by party level, rotated over the fights so AutoPlay meets every pool skill (and every level). */
  const LOADOUTS = {
    1: [[['syl_heckle', 1], ['syl_power_ballad', 1]]],
    3: [
      [['syl_heckle', 2], ['syl_power_ballad', 1], ['syl_shriek', 1]],
      [['syl_heckle', 1], ['syl_mosh_pit', 1], ['syl_glitter_bomb', 1]],
      [['syl_power_ballad', 2], ['syl_hype_man', 1], ['syl_lullaby', 1]],
      [['syl_heckle', 1], ['syl_encore', 1], ['syl_fae_blink', 1]],
    ],
    5: [
      [['syl_heckle', 2], ['syl_mic_drop', 1], ['syl_mosh_pit', 2], ['syl_shriek', 2]],
      [['syl_lullaby', 2], ['syl_glitter_bomb', 2], ['syl_hype_man', 2], ['syl_fae_blink', 1]],
      [['syl_encore', 2], ['syl_power_ballad', 3], ['syl_heckle', 3], ['syl_mic_drop', 2]],
      [['syl_fae_blink', 2], ['syl_shriek', 3], ['syl_lullaby', 3], ['syl_hype_man', 3]],
    ],
  };
  const ITEMS = { 1: [], 3: ['syl_studded_jacket'], 5: ['syl_electric_lute', 'syl_mixtape'] };
  T.suite('hero_syllamin: AutoPlay v2 battles — fixture encounters at levels 1 / 3 / 5', function (t) {
    if (!guard(t)) return;
    if (!DD.Encounter || typeof DD.Encounter.build !== 'function') { t.skip('DD.Encounter not available'); return; }
    const rng = DD.RNG('hero_syllamin:v2');
    const used = {};
    let fights = 0, wins = 0, sylUses = 0, melts = 0, sylTurns = 0;
    const w0 = warnings();
    [[1, ['test_a1_normal', 'test_a1_elite', 'test_a1_boss', 'test_a1_totems']],
      [3, ['test_a2_normal', 'test_a2_elite', 'test_a2_boss', 'test_a2_keg']],
      [5, ['test_a3_normal', 'test_a3_elite', 'test_a3_boss', 'test_a3_survive']]].forEach(function (row) {
      const lvl = row[0];
      row[1].forEach(function (encId, i) {
        const en = DD.getEncounter(encId);
        if (!en) { t.fail(encId + ' is not registered'); return; }
        const loadout = LOADOUTS[lvl][i % LOADOUTS[lvl].length];
        const party = [
          DD.Combat.makeRunHero({ id: HERO, level: lvl, skills: loadout.map(function (p) { return { id: p[0], level: p[1] }; }),
            items: ITEMS[lvl].length ? [ITEMS[lvl][i % ITEMS[lvl].length]] : [] }),
          DD.Combat.makeRunHero({ id: 'test_knight', level: lvl }),
          DD.Combat.makeRunHero({ id: 'test_cleric', level: lvl }),
          DD.Combat.makeRunHero({ id: 'test_mage', level: lvl }),
        ];
        const setup = DD.Encounter.build(en, party, { rng: DD.RNG(rng.int(1, 1e9)), difficulty: 'normal', act: en.act });
        if (!setup || !setup.grid) { t.fail(encId + ': build failed'); return; }
        DD.Combat.start(setup, { seed: rng.int(1, 1e9), headless: true, difficulty: 'normal', kind: en.kind });
        const label = encId + ' @L' + lvl;
        const s = DD.Combat.state;
        DD.Act.addRule({ id: 'syl_test_usage', name: 'Usage', hooks: { onSkillUsed: function (ctx) {
          // previews run the same hooks on a cloned state: count real uses only
          if (DD.Act.simulating || !ctx || !ctx.user || ctx.user.defId !== HERO || ctx.isIntent) return;
          used[ctx.skill.id] = (used[ctx.skill.id] || 0) + 1;
          sylUses++;
        } } });
        const off = DD.Events.on('turn:start', function (e) { if (e.unit && e.unit.defId === HERO) sylTurns++; });
        let res = null;
        t.tryRun(label, function () { res = DD.AutoPlay.runBattle(30); });
        off();
        melts += s.log.filter(function (e) { return /EMOTIONAL DAMAGE/.test(e.text); }).length;
        fights++;
        if (res && res.result === 'victory') wins++;
        t.ok(res && !res.timeout, label + ': battle finished (' + (res && res.result) + ' in ' + (res && res.rounds) + ' rounds)');
        t.ok(!!s.order && s.order.some(function (e) { const u = DD.Combat.byId(e.unitId); return u && u.defId === HERO; }), label + ': he has an initiative entry');
        sane(t, label);
      });
    });
    t.eq(warnings(), w0, 'no warnings during the battles');
    t.eq(fights, 12, 'fights: ' + fights);
    const skills = Object.keys(used).filter(function (id) { return id !== 'syl_basic'; });
    const skillUses = skills.reduce(function (n, id) { return n + used[id]; }, 0);
    t.ok(sylTurns >= fights * 2, 'he gets his turns (' + sylTurns + ')');
    t.ok(sylUses > fights * 2, 'Syllamin acts in his fights (' + sylUses + ' uses)');
    t.ok(skills.length >= 5 && skillUses >= fights, 'AutoPlay uses many of his skills, not just the basic: ' + JSON.stringify(used));
    t.ok(melts >= 3, 'Emotional Damage happens in real fights (' + melts + ')');
    t.ok(wins >= fights - 2, 'the party wins (' + wins + '/' + fights + ')');
    t.log('wins ' + wins + '/' + fights + ' · meltdowns ' + melts + ' · uses ' + JSON.stringify(used));
  });

  T.suite('hero_syllamin: AutoPlay heckles the foe about to hit a wounded ally', function (t) {
    if (!guard(t)) return;
    // a wounded cleric with a tanky grunt next to it (and its friend behind): Heckle stops the hit and turns the grunt
    const s = sb({ seed: 21, enemyAi: true, heroes: [S(1, 4, { level: 3, skills: [{ id: 'syl_heckle', level: 2 }] }), H('test_cleric', 4, 4), H('test_knight', 1, 8)],
      enemies: [E('test_grunt', 5, 4, 3), E('test_grunt', 6, 4, 3)] });
    const cleric = hero('test_cleric');
    cleric.hp = 5;
    const used = [];
    DD.Act.addRule({ id: 'syl_test_pick', name: 'Pick', hooks: { onSkillUsed: function (ctx) {
      if (!DD.Act.simulating && ctx.user && ctx.user.defId === HERO) used.push(ctx.skill.id + '@' + key(ctx.target || {}));
    } } });
    DD.AutoPlay.takeTurn();
    t.ok(used.indexOf('syl_heckle@5,4') >= 0, 'AutoPlay heckled the grunt next to the cleric (' + used.join(', ') + ')');
    t.ok(has(at(5, 4), 'charmed') || has(at(5, 4), 'stun'), 'it will not hit the cleric on its turn');
    t.ok(s.round === 1 && sane(t, 'autoplay heckle'), 'state sane');
  });

  // ---- v2 requests (user, Nov 3): flyers ignore the floor, barrels ---------------------------------------------
  T.suite('hero_syllamin: v2 requests — four inches above every puddle (flyers ignore the floor), clouds still reach him, barrels', function (t) {
    if (!guard(t)) return;
    // 1. a born flyer: fire, poison, his own Glitter — none of it touches him; a steam cloud does
    sb({ heroes: [S(1, 4)], enemies: [E('test_grunt', 8, 8)],
      surfaces: [{ x: 2, y: 4, id: 'fire', turns: 3 }, { x: 3, y: 4, id: 'poison', turns: 3 }, { x: 4, y: 4, id: 'syl_glitter', turns: 3 }, { x: 5, y: 4, id: 'fire', turns: 3 }] });
    const s = syl();
    t.ok(DD.Grid.isFlying(s) && !DD.Grid.feelsFloor(s), 'Syllamin flies (flags.flying)');
    t.ok(DD.Combat.move(s, 5, 4), 'he flies over fire, poison and glitter');
    t.ok(s.hp === s.maxHp && !has(s, 'burn') && !has(s, 'poison'), 'no Burn, no Poison on the way');
    t.ok(DD.Grid.hazardAt(2, 4, s) === null && DD.Grid.hazardAt(3, 4, s) === null, 'and no hazard shading for him there');
    DD.Combat.endTurn();
    t.ok(toTurn(s) && s.hp === s.maxHp && !has(s, 'burn'), 'a whole round hovering over the fire: nothing');
    DD.Act.push(null, s, { x: -1, y: 0 }, 1);
    t.eq(key(s), '4,4', 'pushed onto his own Glitter: no extra slide (he glides over it)');
    // a cloud is not a floor: steam scalds a flyer too
    DD.Act.setSurface(3, 4, 'steam', 2);
    t.ok(DD.Grid.feelsSurface(s, 'steam') && !DD.Grid.feelsSurface(s, 'fire') && !DD.Grid.feelsSurface(s, 'syl_glitter'), 'clouds (airborne) reach him, floor surfaces don\'t');
    // a grounded foe pushed onto Glitter still slides; a flying one doesn't
    sb({ heroes: [S(1, 4)], enemies: [E('test_grunt', 3, 4), E('test_grunt', 3, 6), E('test_grunt', 8, 8)],
      surfaces: [{ x: 4, y: 4, id: 'syl_glitter', turns: 3 }, { x: 4, y: 6, id: 'syl_glitter', turns: 3 }] });
    const walker = at(3, 4), flyer = at(3, 6);
    flyer.flags = Object.assign({}, flyer.flags, { flying: true });   // test setup: a flying foe
    DD.Act.push(null, walker, { x: 1, y: 0 }, 1);
    DD.Act.push(null, flyer, { x: 1, y: 0 }, 1);
    t.eq(key(walker) + ' / ' + key(flyer), '5,4 / 4,6', 'Glitter: the walker slides 1 extra, the flyer stops where pushed (the desc says grounded)');
    t.ok(/grounded unit/.test(DD.getSurface('syl_glitter').desc), 'Glitter desc: grounded units slide');

    // 2. barrels: Your Mom Joke (his basic) and Mic Drop (no line of sight) set one off
    sb({ heroes: [S(1, 4)], enemies: [E('test_grunt', 5, 4), E('test_grunt', 8, 8)], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
    let u = syl();
    t.ok(DD.Targeting.validTargets(u, u.basic).some(function (q) { return q.obj && key(q) === '4,4'; }), 'Your Mom Joke can be aimed at the barrel');
    t.ok(use(u, u.basic, 4, 4) && !DD.Grid.tile(4, 4).obj && at(5, 4).hp === 6 && stacks(at(5, 4)) === 0,
      'the joke lands on a barrel: KABOOM, 8 to the foe beside it (blast damage is no roast: no Roasted stack)');
    sb({ heroes: [S(1, 4)], enemies: [E('test_grunt', 8, 8)], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }, { x: 3, y: 4, id: 'pillar' }] });
    u = syl();
    const mic = socket(u, 'syl_mic_drop', 1);
    t.ok(DD.Targeting.validTargets(u, mic).some(function (q) { return q.obj && key(q) === '4,4'; }), 'Mic Drop: a barrel behind a pillar (no line of sight needed)');
    t.ok(use(u, mic, 4, 4) && !DD.Grid.tile(4, 4).obj && u.ap === 0 && mic.uses === 1, 'mic dropped on the barrel: KABOOM, 3 AP, the once-per-combat charge spent');
    t.ok(sane(t, 'v2 requests'), 'state sane');
  });
})();
