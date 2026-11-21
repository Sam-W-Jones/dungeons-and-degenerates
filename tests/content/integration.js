/* Dungeons and Degenerates — tests/content/integration.js
 * Integration suites ("integration: ..."): checks that only make sense with every content area loaded together
 * (hero unlocks vs. bosses, act coverage, loot reachability, display-name clashes, hero events), regression tests for
 * the integrator's surgical core fixes (see docs/notes/content-digest.md), and a whole-campaign AutoPlay smoke run with
 * real heroes. V3 (plan .tmp/v3/design.md §8.4 "Integrator"): act coverage to DD.finalAct() (act 4 = the registry's L
 * lanes + a finale), the twist line on the act-3 boss's board only with the gauntlet on, the DM's cameo pool, the
 * pronoun sweep across every act-4 text, four-act campaigns, determinism of cosmetic pools and the sim's shapeshift rule.
 * h19 (plan .tmp/h19/plan.md §2.3): Rasma, Biz and Phat Gus in the roster and the pronoun sweep (Biz's constructs "it"),
 * the sim keeping their keystones, determinism with Biz's robots and Phat Gus's whispers, and the cross-new-hero combos.
 * Suites that need the full roster skip themselves in isolated runs (&isolate=...).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  function vals(o) { return Object.keys(o || {}).map(function (k) { return o[k]; }); }
  function isTest(id) { return /^(test_|mgt_|mg_|rt_|wm_|hudtest|vux|ui_)/.test(String(id)); }
  function realHeroes() { return Object.keys(DD.defs.heroes).filter(function (id) { return !isTest(id); }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  // v2: the heroes, all available from the start (DESIGN §3, user request), and the user's pronouns (SHE, the rest he).
  // V3: the roster itself is the registry (realHeroes()); the integrator adds a new hero here once he or she is
  // registered: Benedick, the 17th (he, the user, Nov 12); h19: Rasma, Biz and Phat Gus, the 18th-20th (all he/him, the
  // user, Nov 18), added once all three registered (an unregistered id here skips the whole cross-content suite)
  const ALL = ['zarathor', 'syllamin', 'marbles', 'marwyn', 'ellaria', 'josiah', 'sparrow', 'corelos', 'slate', 'buga',
    'kiri', 'betty', 'basanos', 'valdris', 'hjalmar', 'pebbles', 'benedick', 'rasma', 'biz', 'gus'];
  const SHE = { ellaria: 1, sparrow: 1, kiri: 1 };
  // h19 (plan D8): Biz's two constructs have no stated pronoun ("it" or none, never he / she, the user, Nov 18)
  const CONSTRUCTS = { biz: ['biz_hjalmarino', 'biz_spooder'] };
  function fullRoster() { return ALL.every(function (id) { return !!DD.getHero(id); }); }

  // ---- cross-content consistency ---------------------------------------------------------------------------------
  T.suite('integration: cross-content consistency (unlocks, acts, loot, names, hero events)', function (t) {
    if (!fullRoster() || !DD.getEnemy('dungeon_master')) { t.skip('needs every hero and boss file (isolated run)'); return; }
    // V3: the roster is the registry (a 17th, or an 18th, hero breaks no count); every hero below is checked, while ALL
    // stays the pronoun list (the integrator adds a new hero to it once he or she is registered)
    const REAL = realHeroes();
    // DESIGN §3 (v2): every hero is unlocked at the start and rolls initiative with stats.init (−2..+4)
    REAL.forEach(function (id) {
      const h = DD.getHero(id);
      t.eq(JSON.stringify(h.unlock || null), 'null', id + ': no unlock condition (v2)');
      t.ok(typeof h.stats.init === 'number' && h.stats.init >= -2 && h.stats.init <= 4, id + ': stats.init set in −2..+4 (' + h.stats.init + ')');
      const items = vals(DD.defs.items).filter(function (it) { return it.hero === id; });
      t.ok(items.length >= 3, id + ': three or more hero items (' + items.length + ')');
    });
    t.ok(REAL.length >= ALL.length && ALL.every(function (id) { return REAL.indexOf(id) >= 0; }), REAL.length + ' real heroes in the registry, every hero of the pronoun list among them');
    const unlisted = REAL.filter(function (id) { return ALL.indexOf(id) < 0; });
    if (unlisted.length) t.log('registered heroes not yet in the pronoun list ALL (integrator): ' + unlisted.join(', '));
    t.log(REAL.length + ' heroes in the registry (20 with the full h19 content): ' + REAL.join(', '));
    vals(DD.defs.items).forEach(function (it) { if (it.hero) t.ok(!!DD.getHero(it.hero), it.id + ': hero item names an existing hero'); });
    const encs = vals(DD.defs.encounters).filter(function (e) { return !isTest(e.id); });
    ['grimble', 'rat_king', 'lichtenstein', 'dr_iris', 'dungeon_master'].forEach(function (b) {
      const e = DD.getEnemy(b);
      t.ok(e && e.tier === 'boss', b + ' is a registered boss');
      t.ok(encs.some(function (en) { return en.kind === 'boss' && (en.enemies || []).some(function (x) { return x.id === b; }); }), b + ' has a boss encounter');
      if (DD.Meta.unlocksForBoss) t.eq(DD.Meta.unlocksForBoss(b).length, 0, b + ' unlocks nobody (v2: everyone starts unlocked)');
    });
    // every encounter's enemies (and waves) exist
    encs.forEach(function (e) {
      (e.enemies || []).forEach(function (x) { t.ok(!!DD.getEnemy(x.id), e.id + ': enemy ' + x.id + ' exists'); });
      (e.reinforcements || []).forEach(function (w) { (w.enemies || []).forEach(function (x) { t.ok(!!DD.getEnemy(x.id), e.id + ': wave enemy ' + x.id + ' exists'); }); });
    });
    // every act of the campaign (1..DD.finalAct()): the regular acts have normal, elite and boss fights (two bosses in
    // acts 1 and 2, the DM alone in act 3); a gauntlet act (V3 act 4) has L doors and one floor boss, L from the registry
    const BOSSES = { 1: ['grimble', 'rat_king'], 2: ['lichtenstein', 'dr_iris'], 3: ['dungeon_master'] };
    for (let act = 1; act <= DD.finalAct(); act++) {
      const of = function (kind) { return encs.filter(function (e) { return e.act === act && e.kind === kind; }); };
      const doors = encs.filter(function (e) { return e.act === act && e.gauntlet; });
      const finales = encs.filter(function (e) { return e.act === act && e.finale; });
      if (doors.length || finales.length) {
        const lanes = doors.map(function (e) { return e.gauntlet.lane; });
        t.ok(doors.length >= 1, 'act ' + act + ': a gauntlet of ' + doors.length + ' doors (' + lanes.join(', ') + ')');
        t.eq(lanes.filter(function (l, i) { return lanes.indexOf(l) === i; }).length, lanes.length, 'act ' + act + ': one door per lane');
        t.eq(finales.length, 1, 'act ' + act + ': one floor boss (finale)');
        t.eq(encs.filter(function (e) { return e.act === act && !e.gauntlet && !e.finale; }).length, 0, 'act ' + act + ': every fight is a door or the finale');
        doors.concat(finales).forEach(function (e) {
          t.ok(e.kind === 'boss' && e.weight === 0, e.id + ': a boss fight with weight 0 (only the gauntlet places it)');
          t.ok(typeof e.shortName === 'string' && e.shortName.length > 0 && e.shortName.length <= 24, e.id + ': a shortName for tight spots');
          if (e.map && e.map.theme) t.ok(!!(DD.Themes && DD.Themes[e.map.theme]), e.id + ': theme "' + e.map.theme + '" exists');
        });
        // L is the registry's: the run map's lanes are exactly these doors (real ones first, at most MAX_LANES)
        if (DD.RunMap && DD.RunMap.gauntletLanes) {
          const reg = DD.RunMap.gauntletLanes(act).map(function (l) { return l.id; }).filter(function (id) { return lanes.indexOf(id) >= 0; });
          t.eq(reg.slice().sort().join(','), lanes.slice().sort().join(','), 'act ' + act + ': the run map\'s gauntlet has the registry\'s ' + lanes.length + ' lanes (L = ' + lanes.length + '; 5 with the full V3 content)');
        }
        finales.forEach(function (e) {
          t.ok((e.enemies || []).some(function (x) { const d = DD.getEnemy(x.id); return d && d.tier === 'boss'; }), e.id + ': the floor boss is a boss-tier unit');
        });
        continue;
      }
      t.ok(of('normal').length >= 6, 'act ' + act + ': 6+ normal encounters (' + of('normal').length + ')');
      t.ok(of('elite').length >= 3, 'act ' + act + ': 3+ elite encounters (' + of('elite').length + ')');
      const bosses = of('boss').map(function (e) { return e.enemies.filter(function (x) { const d = DD.getEnemy(x.id); return d && d.tier === 'boss'; })[0].id; }).sort();
      t.eq(JSON.stringify(bosses), JSON.stringify(BOSSES[act].slice().sort()), 'act ' + act + ': boss lineup');
      of('normal').concat(of('elite'), of('boss')).forEach(function (e) {
        if (e.map && e.map.theme) t.ok(!!(DD.Themes && DD.Themes[e.map.theme]), e.id + ': theme "' + e.map.theme + '" exists');
      });
    }
    // player-facing names: hero/generic/summon skills, items, consumables, Blessings and scars never share a name
    const names = {};
    function add(kind, d, nm) { if (!d || isTest(d.id)) return; const k = norm(nm); (names[k] = names[k] || []).push(kind + ':' + d.id); }
    vals(DD.defs.skills).forEach(function (d) { if (d.owner !== 'enemy') add('skill', d, d.name); });
    vals(DD.defs.items).forEach(function (d) { add('item', d, d.name); });
    vals(DD.defs.consumables).forEach(function (d) { add('consumable', d, d.name); });
    vals(DD.defs.passives || {}).forEach(function (d) { add('passive', d, d.name); });
    vals(DD.defs.scars || {}).forEach(function (d) { add('scar', d, d.name); });
    Object.keys(names).forEach(function (k) { t.ok(names[k].length === 1, 'name "' + k + '" is used once: ' + names[k].join(', ')); });
    // loot: every consumable and generic skill can drop / be learned; every shared item can drop
    vals(DD.defs.consumables).filter(function (d) { return !isTest(d.id); }).forEach(function (d) {
      t.ok(!d.noDrop && (d.weight === undefined || d.weight > 0), d.id + ': can drop (rewards, shops)');
      t.ok(DD.Rewards.price('consumable', d.id) > 0, d.id + ': has a price');
    });
    vals(DD.defs.items).filter(function (d) { return !isTest(d.id); }).forEach(function (d) {
      t.ok(!d.noDrop && (d.weight === undefined || d.weight > 0), d.id + ': can drop (rewards, shops)');
    });
    const generic = vals(DD.defs.skills).filter(function (s) { return s.owner === 'generic' && !isTest(s.id); });
    t.ok(generic.length >= 12, '12+ generic skills (' + generic.length + ')');
    REAL.forEach(function (id) {
      const rh = DD.Combat.makeRunHero({ id: id, level: 1 });
      const learn = DD.Run.learnableFor(rh, { generic: true });
      t.ok(generic.every(function (g) { return learn.indexOf(g.id) >= 0; }), id + ': every generic skill is learnable from a tome');
      const own = DD.Run.learnableFor(rh, { generic: false });
      const pool = DD.getHero(id).skillPool.filter(function (s) { return DD.getHero(id).startingSkills.indexOf(s) < 0; });
      t.ok(pool.every(function (s) { return own.indexOf(s) >= 0; }), id + ': every pool skill is learnable');
    });
    // hero events: each hero has one, and they only name real heroes
    const evs = vals(DD.defs.events).filter(function (e) { return !isTest(e.id); });
    REAL.forEach(function (id) { t.ok(evs.some(function (e) { return e.hero === id; }), id + ': has a hero event'); });
    // V3 landing order (plan §4.12): NARRATIVE lands a new hero's event before the hero's file lands, so a hero the roster
    // is still waiting for is logged, not failed (any other unknown hero id still fails: a typo). Benedick has landed.
    // h19 (plan D5 / D6): the voice owner landed Rasma's, Biz's and Phat Gus's events from day one; all three hero files
    // have registered, so the list is empty again (a future hero's id goes here while his event lands first)
    const PENDING_HEROES = [];
    evs.forEach(function (e) {
      if (!e.hero) return;
      if (!DD.getHero(e.hero) && PENDING_HEROES.indexOf(e.hero) >= 0) { t.log(e.id + ': names ' + e.hero + ', whose hero file has not landed yet'); return; }
      t.ok(!!DD.getHero(e.hero), e.id + ': names an existing hero');
    });
    // pronouns (the user's own campaign characters): in every hero's text (barks, blurb, skills, hero items) and the
    // narration, a sentence that names exactly one hero uses that hero's pronouns; a hero's own skill / item text that
    // names nobody refers to its owner
    const named = [];
    ALL.forEach(function (id) {
      const nm = DD.getHero(id).name.split(/\s+/);
      named.push({ id: id, re: new RegExp('\\b(' + id.charAt(0).toUpperCase() + id.slice(1) + '|' + nm[nm.length - 1] + ')\\b') });
    });
    const strings = [];
    function walkStr(o, owner, path, depth) {
      if (o === null || o === undefined || depth > 6) return;
      if (typeof o === 'string') { strings.push({ s: o, owner: owner, path: path }); return; }
      if (typeof o !== 'object') return;
      Object.keys(o).forEach(function (k) { if (!/^(id|icon|sprite|color|tags|owner|hero|kind|skillPool|startingSkills|basic|signature)$/.test(k)) walkStr(o[k], owner, path + '.' + k, depth + 1); });
    }
    ALL.forEach(function (id) {
      const h = DD.getHero(id);
      walkStr({ blurb: h.blurb, epithet: h.epithet, barks: h.barks, role: h.role }, null, id, 0);
      vals(DD.defs.skills).filter(function (s) { return s.owner === id; }).forEach(function (s) {
        walkStr({ name: s.name, flavor: s.flavor }, id, s.id, 0);
        [1, 2, 3].forEach(function (lv) { strings.push({ s: DD.skillDesc(s, lv, null), owner: id, path: s.id + '.desc' }); });
      });
      vals(DD.defs.items).filter(function (it) { return it.hero === id; }).forEach(function (it) { walkStr({ name: it.name, desc: it.desc, flavor: it.flavor }, id, it.id, 0); });
    });
    walkStr(DD.defs.narration, null, 'narration', 0);
    const HE = /\b(he|him|his|himself)\b/i, SHE_RE = /\b(she|her|hers|herself)\b/i;
    let checked = 0;
    strings.forEach(function (x) {
      String(x.s).split(/(?<=[.!?…])\s+|\n/).forEach(function (sent) {
        const ids = named.filter(function (n) { return n.re.test(sent); }).map(function (n) { return n.id; });
        const who = ids.length === 1 ? ids[0] : (!ids.length ? x.owner : null);
        if (!who) return;
        checked++;
        t.ok(!(SHE[who] ? HE : SHE_RE).test(sent), x.path + ': pronouns for ' + who + ' (' + (SHE[who] ? 'she/her' : 'he/him') + ') in "' + sent.slice(0, 120) + '"');
      });
    });
    t.ok(checked > 300, 'pronoun sweep saw the heroes\' text (' + checked + ' sentences)');
    // h19 (plan D8): the constructs' OWN texts carry no gendered pronoun at all: the summon defs (name, names, desc, barks)
    // and their skills (name, flavor, the desc at levels 1-3). A sentence of their owner's text or the narration that
    // names a construct keeps the owner rule above (Biz he/him: his passive's "who act on his turn" is about Biz)
    const GENDERED = /\b(he|him|his|himself|she|her|hers|herself)\b/i;
    const botBad = [];
    let botTexts = 0;
    Object.keys(CONSTRUCTS).forEach(function (owner) {
      const h = DD.getHero(owner);
      t.eq((h.summons || []).slice().sort().join(','), CONSTRUCTS[owner].slice().sort().join(','), owner + ': his summons are exactly ' + CONSTRUCTS[owner].join(', '));
      CONSTRUCTS[owner].forEach(function (sid) {
        const sd = DD.getSummon(sid);
        if (!t.ok(!!sd, sid + ': a registered summon')) return;
        t.eq(sd.pronoun, 'it', sid + ' (' + (sd.names || [sd.name]).join(', ') + '): pronoun "it" (plan D8)');
        const texts = [];
        const add = function (s, path) { if (typeof s === 'string' && s) texts.push({ s: s, path: path }); };
        add(sd.name, sid + '.name');
        (sd.names || []).forEach(function (n, i) { add(n, sid + '.names[' + i + ']'); });
        add(typeof sd.desc === 'function' ? sd.desc(null) : sd.desc, sid + '.desc');
        Object.keys(sd.barks || {}).forEach(function (k) { [].concat(sd.barks[k] || []).forEach(function (b, i) { add(b, sid + '.barks.' + k + '[' + i + ']'); }); });
        t.ok((sd.skills || []).length >= 2, sid + ': its own skills (' + (sd.skills || []).join(', ') + ')');
        (sd.skills || []).forEach(function (kid) {
          const sk = DD.getSkill(kid);
          if (!t.ok(!!sk, sid + ': its skill ' + kid + ' is registered')) return;
          add(sk.name, kid + '.name');
          add(sk.flavor, kid + '.flavor');
          [1, 2, 3].forEach(function (lv) { add(DD.skillDesc(sk, lv, null), kid + '.desc' + lv); });
        });
        texts.forEach(function (x) { botTexts++; if (GENDERED.test(x.s)) botBad.push(x.path + ': "' + x.s.slice(0, 120) + '"'); });
      });
    });
    t.ok(botTexts >= 40, 'the construct sweep read ' + botTexts + ' texts of Hjalmarino, Spooder and their four skills');
    t.eq(botBad.length, 0, 'no he / him / his / she / her in a construct\'s own text: ' + botBad.slice(0, 8).join(' | '));
    t.ok(!GENDERED.test('*the key winds down*') && GENDERED.test('Spooder curls up his legs.') && GENDERED.test('Hjalmarino bangs her cymbals.'),
      'the construct sweep flags "his" and "her" and passes a pronoun-free bark');
    // narration: no line twice on the same key (several authors share keys like boss_start)
    Object.keys(DD.defs.narration).forEach(function (k) {
      const seen = {};
      DD.defs.narration[k].forEach(function (l) { const n = norm(l); t.ok(!seen[n], k + ': line used twice "' + l + '"'); seen[n] = 1; });
    });
  });

  // ---- core fix: a ×0 multiplier from charm / immunity also cancels flat bonuses -------------------------------------
  T.suite('integration: charm and element immunity also cancel flat damage bonuses (core fix)', function (t) {
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('needs tests/fixtures.js'); return; }
    const s = DD.Combat.sandbox({ w: 8, h: 6, seed: 'int-x0', noPlan: true,
      heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }, { id: 'test_grunt', x: 4, y: 4 }] });
    const k = s.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    const foes = s.units.filter(function (u) { return u.defId === 'test_grunt'; });
    k.hooks = { modifyOutgoingDamage: function (d) { d.flat += 3; } };  // like a +3 flat weapon (Whetstone, Lance, …)
    const hp0 = foes[0].hp;
    t.eq(DD.Act.damage(k, foes[0], 5, {}), 8, 'baseline: 5 + 3 flat');
    foes[0].hp = hp0;
    DD.Act.addStatus(k, 'charmed', { turns: 1 }, foes[0]);
    t.eq(DD.Act.damage(k, foes[0], 5, {}), 0, 'charmed: nothing reaches the charmer, flat bonus included');
    t.eq(foes[0].hp, hp0, 'charmer untouched');
    t.ok(DD.Act.damage(k, foes[1], 5, {}) > 0, 'charmed: other foes still take the hit');
    DD.Act.removeStatus(k, 'charmed', { silent: true });
    foes[0].resist = { fire: 0 };
    t.eq(DD.Act.damage(k, foes[0], 5, { element: 'fire' }), 0, 'fire-immune foe: no damage, flat bonus included');
    t.eq(DD.Act.damage(k, foes[0], 5, {}), 8, 'immunity is per element (a physical hit lands)');
    foes[0].hp = hp0;
    // the content idiom "set the exact damage" (mult 0 + flat in a target hook, e.g. the Rat King's flush) still works
    foes[1].hooks = { modifyIncomingDamage: function (d) { d.mult = 0; d.flat = 7; } };
    const hp1 = foes[1].hp;
    t.eq(DD.Act.damage(null, foes[1], 30, { cause: 'fall' }), Math.min(7, hp1), 'a hook can still set an exact amount (mult 0 + flat)');
  });

  // ---- core fix: AutoPlay prices hazards crossed on the way ----------------------------------------------------------
  T.suite('integration: AutoPlay never walks across lava to save a step (core fix)', function (t) {
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('needs tests/fixtures.js'); return; }
    // a lava wall at x = 2 with a stone gap at the top; the foe far east: only the lava tile (2,2) leads east this turn
    const s = DD.Combat.sandbox({ w: 12, h: 5, seed: 'int-lava', noPlan: true,
      heroes: [{ id: 'test_knight', x: 0, y: 2 }], enemies: [{ id: 'test_grunt', x: 11, y: 2 }],
      terrain: function (tile) { if (tile.x === 2 && tile.y > 0) tile.t = 'lava'; } });
    const k = s.units.filter(function (u) { return u.kind === 'hero'; })[0];
    const hp0 = k.hp;
    const lavaPath = DD.Combat.reachable(k).get('3,2');
    t.ok(lavaPath && lavaPath.path.some(function (p) { return p.x === 2 && p.y === 2; }), 'premise: the way east crosses the lava');
    let stepped = false;
    k.hooks = { onEnterTile: function (u, tile) { if (!DD.Act.simulating && tile && tile.t === 'lava') stepped = true; } };
    DD.AutoPlay.takeTurn();
    t.ok(!stepped && DD.Grid.tile(k.x, k.y).t !== 'lava', 'AutoPlay never sets foot on the lava (ended on ' + k.x + ',' + k.y + ')');
    t.eq(k.hp, hp0, 'no self-inflicted burns');
    t.ok(k.x > 0 || k.y !== 2, 'it still moved toward the fight');
  });

  // ---- core fix: AutoPlay walks over to downed allies and helps them up ----------------------------------------------
  T.suite('integration: AutoPlay walks over to a downed ally and helps them up (core fix)', function (t) {
    if (!DD.getHero('test_knight') || !DD.getHero('test_cleric') || !DD.getEnemy('test_grunt')) { t.skip('needs tests/fixtures.js'); return; }
    const s = DD.Combat.sandbox({ w: 10, h: 6, seed: 'int-rescue', noPlan: true,
      heroes: [{ id: 'test_knight', x: 5, y: 2 }, { id: 'test_cleric', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 9, y: 5 }] });
    const k = s.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    const c = s.units.filter(function (u) { return u.defId === 'test_cleric'; })[0];
    c.block = 0;
    DD.Act.damage(null, c, 999, { cause: 'other' });
    t.ok(c.downed, 'premise: the cleric is down, three tiles from the knight');
    t.eq(k.ap, 3, 'premise: the knight has 3 AP (move 1 + Help Up 2)');
    DD.AutoPlay.takeTurn();
    t.ok(!c.downed && c.hp > 0, 'the knight walked over and helped the cleric up (cleric HP ' + c.hp + ')');
    t.eq(Math.abs(k.x - c.x) + Math.abs(k.y - c.y), 1, 'the knight stands next to the cleric');
    // no rescue when Help Up would not be affordable after the walk
    const s2 = DD.Combat.sandbox({ w: 10, h: 6, seed: 'int-rescue2', noPlan: true,
      heroes: [{ id: 'test_knight', x: 5, y: 2 }, { id: 'test_cleric', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 9, y: 5 }] });
    const k2 = s2.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    const c2 = s2.units.filter(function (u) { return u.defId === 'test_cleric'; })[0];
    c2.block = 0;
    DD.Act.damage(null, c2, 999, { cause: 'other' });
    k2.ap = 2;
    DD.AutoPlay.takeTurn();
    t.ok(c2.downed, 'with 2 AP (walk + no Help Up) it does not waste the turn on a half rescue');
  });

  // ---- core fix: the combat HUD shows the party gold ----------------------------------------------------------------
  T.suite('integration: the combat HUD shows the party gold and follows it live (core fix)', function (t) {
    if (!DD.UI || !DD.UI.screens || !DD.UI.screens.combat || !DD.HUD) { t.skip('combat HUD not loaded'); return; }
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('needs tests/fixtures.js'); return; }
    try {
      DD.UI.closeAllModals('test');
      DD.Combat.sandbox({ w: 8, h: 8, seed: 11, theme: 'cellar', gold: 77,
        heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }] });
      DD.UI.show('combat');
      const r = DD.HUD.root();
      const g = r && r.querySelector('.hud-hype .hud-gold .hg-val');
      t.ok(!!g, 'gold chip next to the Hype meter');
      t.eq(g && g.textContent, '77', 'shows the party gold');
      DD.Act.gainGold(5); DD.Combat.changed(); // in play the skill's public action emits combat:changed
      t.eq(g && g.textContent, '82', 'follows gold gained mid-fight');
      DD.Act.loseGold(80); DD.Combat.changed();
      t.eq(g && g.textContent, '2', 'follows gold lost mid-fight (Levy, bribes)');
    } finally {
      DD.UI.closeAllModals('test');
      DD.UI.hideTooltip();
      if (DD.UI.current === 'combat') DD.UI.show('title');
    }
  });

  // ---- core fix: the rewards screen narrates a hero written out of the campaign ---------------------------------------
  T.suite('integration: the rewards screen gives a fallen hero the hero_death line (core fix)', function (t) {
    if (!DD.UI || !DD.UI.screens || !DD.UI.screens.rewards) { t.skip('rewards screen not loaded'); return; }
    const deaths = (DD.defs.narration.hero_death || []).slice();
    if (!deaths.length) { t.skip('no hero_death narration registered'); return; }
    const text = function () { const n = DD.UI.root && DD.UI.root.querySelector('.narration .narr-text'); return n ? n.textContent : ''; };
    try {
      DD.UI.show('rewards', { gold: 10, xp: 5, choices: [], kind: 'normal', deaths: [0], downed: [0], next: 'map' });
      t.ok(deaths.indexOf(text()) >= 0, 'a death shows a hero_death line: "' + text() + '"');
      DD.UI.show('rewards', { gold: 10, xp: 5, choices: [], kind: 'normal', deaths: [], next: 'map' });
      t.ok(text().length > 0 && deaths.indexOf(text()) < 0, 'a plain victory keeps the victory line');
      DD.UI.show('rewards', { gold: 10, xp: 5, choices: [], kind: 'normal', deaths: [0], text: 'Custom.', next: 'map' });
      t.eq(text(), 'Custom.', 'an explicit text (bosses, treasure) still wins');
    } finally {
      DD.UI.closeAllModals('test');
      DD.UI.show('title');
    }
    // the run layer writes the line into the rewards data when a hero is written out (third down in a won fight)
    if (!DD.getHero('test_knight') || !DD.Run || !DD.Combat) return;
    const savedUi = DD.Run.useUi, savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    try {
      DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], 'normal', 'int-death');
      const run = DD.Run.state;
      run.party[0].downs = 2;
      const enc = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; }).filter(function (e) { return /^test_/.test(e.id) && e.act === 1 && e.kind === 'normal'; })[0];
      t.ok(!!enc && !!DD.Run.startCombat(enc, 'normal'), 'premise: a run fight started');
      const cs = DD.Combat.state;
      const k = cs.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
      k.block = 0;
      DD.Act.damage(null, k, 999, { cause: 'other' });
      t.ok(k.downed, 'premise: the knight (2 downs already) is down');
      DD.Act.endCombat('victory');
      if (DD.FX && DD.FX.flush) DD.FX.flush();
      if (DD.Run.inCombat()) DD.Run.finishCombat('victory', cs);
      const d = DD.Run.rewards();
      t.ok(d && d.deaths.indexOf(0) >= 0 && run.party[0].dead, 'the knight is written out of the campaign');
      t.ok(d && deaths.indexOf(d.text) >= 0, 'the rewards data carries a hero_death line: "' + (d && d.text) + '"');
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
  });

  // ---- core fix: a lost objective with heroes standing is a lost fight, not a campaign-ending TPK ----------------------
  T.suite('integration: losing a protect objective loses the fight, not the campaign (core fix)', function (t) {
    if (!DD.getHero('test_knight') || !DD.getEncounter('test_a2_keg') || !DD.Run) { t.skip('needs tests/fixtures.js'); return; }
    const savedUi = DD.Run.useUi, savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    try {
      DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], 'normal', 'int-protect');
      const run = DD.Run.state;
      const gold0 = run.gold;
      const node = DD.Run.availableNodes()[0];
      run.nodeId = node.id;
      t.ok(!!DD.Run.startCombat('test_a2_keg', 'normal', { nodeId: node.id }), 'premise: a protect fight started');
      const cs = DD.Combat.state;
      const keg = cs.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'keg'; })[0];
      t.ok(!!keg, 'premise: the keg is on the map');
      DD.Act.damageObject(null, keg.x, keg.y, 999);
      DD.Combat.checkEnd();
      if (DD.FX && DD.FX.flush) DD.FX.flush();
      t.eq(cs.result, 'defeat', 'the keg broke: the fight is lost');
      if (DD.Run.inCombat()) DD.Run.finishCombat(cs.result, cs);
      t.ok(!run.over, 'the campaign goes on (the party is alive)');
      const d = DD.Run.rewards();
      // v2: no XP any more; a lost fight grants no rotation level-up either
      t.ok(d && d.kind === 'failed' && d.choices.length === 0 && d.gold === 0 && !(d.levelUps && d.levelUps.length), 'an "Objective Failed" step with no loot, gold or level-up');
      t.eq(run.gold, gold0, 'no gold paid');
      t.ok(run.map.nodes[node.id].done && run.map.nodes[node.id].result === 'defeat', 'the node is done (lost)');
      DD.Run.skipRewards();
      DD.Run.next();
      t.ok(!run.over && DD.Run.availableNodes().length > 0, 'the map continues');
      // a lost boss fight still ends the run, even with heroes standing
      DD.Run.startCombat('test_a1_boss', 'boss');
      const bs = DD.Combat.state;
      DD.Act.endCombat('defeat');
      if (DD.FX && DD.FX.flush) DD.FX.flush();
      if (DD.Run.inCombat()) DD.Run.finishCombat('defeat', bs);
      t.eq(run.over, 'defeat', 'a lost boss fight is still game over');
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
  });

  T.suite('integration: the HUD hands a lost objective to the "Objective Failed" rewards step (core fix)', async function (t) {
    if (!DD.UI || !DD.UI.screens || !DD.UI.screens.combat || !DD.HUD || !DD.getHero('test_knight') || !DD.Run) { t.skip('needs the HUD and tests/fixtures.js'); return; }
    const useUi = DD.Run.useUi, meta = DD.util.deepClone(DD.Meta.data);
    const s = DD.UI.settings(), unlock = s.unlockAll;
    try {
      DD.Run.useUi = true;
      s.unlockAll = true;
      DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], 'normal', 778);
      s.unlockAll = unlock;
      DD.Run.startCombat('test_a1_normal', 'normal');
      t.eq(DD.UI.current, 'combat', 'premise: the HUD runs the fight');
      DD.Combat.finish('defeat');   // heroes standing: what a broken keg looks like to the HUD
      for (let i = 0; i < 4 && DD.UI.current === 'combat'; i++) await new Promise(function (r) { setTimeout(r, 5); });
      t.eq(DD.UI.current, 'rewards', 'the HUD hands off to the rewards screen, not game over');
      t.ok(!DD.Run.state.over && DD.Run.rewards() && DD.Run.rewards().kind === 'failed', 'the run goes on with an Objective Failed step');
    } finally {
      s.unlockAll = unlock;
      DD.Run.useUi = useUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY || 'run');
      DD.Meta.data = meta;
      if (DD.Meta.save) DD.Meta.save();
      DD.UI.closeAllModals('test');
      DD.UI.show('title');
    }
  });

  // ---- core fix (v2 integrator): screens owned by META-UI / RUN no longer talk about locks or telegraphs ------------
  T.suite('integration: v2 screens have no unlock cheat, unlock progress or telegraph talk (core fix)', function (t) {
    const UI = DD.UI;
    if (!UI || !UI.screens || !UI.screens.settings || !UI.screens.gameover || !UI.screens.title || !fullRoster()) { t.skip('needs the UI and every hero file'); return; }
    const V1 = /(?<!Nobody )telegraph|red tiles|what (?:it|they) will do|Unused AP turns into Block|Unlock every hero|Heroes unlocked|🔒 Next|Unlock more heroes|unlocked hero|Delete unlocks|all unlocks/i;
    function screenText() { const s = UI.root.querySelector('.ui-screens'); return s ? s.textContent : ''; }
    try {
      UI.init();
      t.tryRun('settings', function () { UI.show('settings'); });
      t.ok(/Reset progress/i.test(screenText()), 'premise: the settings screen is up');
      t.ok(!V1.test(screenText()), 'settings: no unlock cheat (every hero starts unlocked)');
      t.tryRun('game over', function () { UI.show('gameover', { summary: { result: 'defeat', act: 1, party: [], stats: {} } }); });
      t.ok(!/Heroes unlocked|🔒/.test(screenText()), 'game over: no unlock progress bar');
      for (let i = 0; i < 6; i++) {
        t.tryRun('title ' + i, function () { UI.show('title'); });
        t.ok(!V1.test(screenText()), 'title ' + i + ': tagline and tip are v2 ("' + screenText().replace(/\s+/g, ' ').slice(0, 90) + '…")');
      }
    } finally {
      UI.show('title');
    }
  });

  // ---- whole campaigns ------------------------------------------------------------------------------------------------
  /**
   * Play one whole run headlessly (random nodes, sensible picks), every fight by AutoPlay. Returns a report. V3:
   * opts.startAct fast-forwards the fresh run there (DD.Run.startAtAct, level opts.level); the report also lists the
   * acts entered, the twist (an act clear with twist: true) and the doors fought in order.
   */
  function playCampaign(seed, party, opts) {
    opts = opts || {};
    const r = DD.RNG('int-camp:' + seed);
    const rep = { fights: 0, capped: [], errors: [], steps: 0, bosses: [], log: [], acts: [], twist: false, doors: [] };
    const S = function () { return DD.Run.state; };
    DD.Run.newRun(party, 'normal', 'int-camp' + seed);
    if (opts.startAct) DD.Run.startAtAct(opts.startAct, { level: opts.level || 5, gear: 'auto', noShow: true });
    function levels() {
      for (let g = 0; g < 200; g++) {
        const q = DD.Run.levelQueue();
        if (q.length) {
          const ch = DD.Run.levelUpChoices(q[0]);
          if (!ch.length) return;
          const c = ch.filter(function (x) { return x.type === 'upgrade'; })[0] || ch[0];
          let res = DD.Run.applyLevelChoice(q[0], c);
          if (!res.ok && res.needsReplace) res = DD.Run.applyLevelChoice(q[0], c, -1);
          if (!res.ok) { rep.errors.push('level choice refused: ' + res.reason); return; }
          continue;
        }
        const l = DD.Run.pendingLearns();
        if (l.length) { DD.Run.resolveLearn(l[0].index, -1); continue; }
        return;
      }
    }
    while (S() && !S().over && rep.steps++ < 250) {
      levels();
      if (rep.acts.indexOf(S().act) < 0) rep.acts.push(S().act);
      const avail = DD.Run.availableNodes();
      if (!avail.length) { rep.errors.push('no reachable node in act ' + S().act); break; }
      DD.Run.travel(r.pick(avail).id);
      for (let g = 0; g < 16 && S() && !S().over && S().pending; g++) {
        const p = S().pending;
        if (p.type === 'combat') {
          const cs = DD.Combat.state;
          if (p.data.kind === 'boss') rep.bosses.push(p.data.encounterId);
          if (p.data.lane) rep.doors.push(p.data.lane);
          rep.fights++;
          const enc0 = p.data.encounterId, kind0 = p.data.kind;
          DD.AutoPlay.runBattle(40);
          if (DD.FX && DD.FX.flush) DD.FX.flush();
          if (DD.Run.inCombat()) { rep.capped.push(p.data.encounterId); DD.Run.finishCombat('defeat', cs); }
          rep.log.push(kind0.charAt(0) + ':' + enc0 + (cs.result === 'victory' ? '' : '!') + ':' + cs.round);
        } else if (p.type === 'rewards') {
          const d = p.data;
          if (d.actClear && d.actClear.twist) rep.twist = true;
          let took = false;
          for (let i = 0; i < d.choices.length && !took; i++) took = DD.Run.takeReward(i, { replaceIdx: -1 }).ok;
          if (!took) DD.Run.skipRewards();
          DD.Run.next();
        } else if (p.type === 'event') {
          const ev = DD.Run.currentEvent();
          const open = ev ? ev.choices.filter(function (c) { return !c.disabled; }) : [];
          if (open.length && !ev.resolved) DD.Run.chooseEventOption(r.pick(open).index);
          DD.Run.next();
        } else if (p.type === 'tavern') {
          DD.Run.tavernRest();
          DD.Run.next();
        } else DD.Run.next();
      }
      const s = S();
      if (s) s.party.forEach(function (h, i) {
        if (h.skills.length > 4) rep.errors.push('hero ' + i + ' socketed ' + h.skills.length + ' skills');
        if (!h.dead && (h.hp < 0 || h.hp > DD.Run.heroStats(h).maxHp)) rep.errors.push('hero ' + i + ' HP ' + h.hp);
      });
    }
    rep.over = S() ? S().over : null;
    rep.act = S() ? S().act : 0;
    rep.cleared = S() ? S().stats.actsCleared || 0 : 0;
    rep.summary = S() ? S().summary || null : null;
    rep.stats = S() ? DD.util.deepClone(S().stats) : {};
    rep.map = S() && S().map ? { shape: S().map.shape, rows: S().map.rows, lanes: (S().map.lanes || []).map(function (l) { return l.id; }) } : null;
    return rep;
  }

  // ---- v2 requests (Nov 3, user): barrels, heals on the downed, the turning map — across every content file ----------
  T.suite('integration: v2 requests — exploding objects are volatile, aimed heals get the downed up, no screen-direction words', function (t) {
    if (!fullRoster() || !DD.getEnemy('test_grunt')) { t.skip('needs every hero file and tests/fixtures.js (isolated run)'); return; }
    // 1. an object that explodes when destroyed says so (volatile): any hero's single-target damage skill can set it off
    vals(DD.defs.objects).forEach(function (o) {
      if (isTest(o.id) || typeof o.onDestroyed !== 'function' || !/\bexplode\s*\(/.test(String(o.onDestroyed))) return;
      t.ok(o.volatile === true, o.id + ': it explodes when destroyed, so it is volatile');
    });
    // 2. every single-target heal a hero can aim at a downed ally gets them back up (no early return on the downed)
    const Tg = DD.Targeting;
    function standIn(def) {
      const h = DD.getHero(def.owner);
      return { id: 'standin', kind: 'hero', side: 'hero', dead: false, flags: {}, statuses: [], basic: h ? { id: h.basic, level: 1 } : null };
    }
    const heals = vals(DD.defs.skills).filter(function (d) { return !isTest(d.id) && d.owner !== 'enemy'; })
      .concat(vals(DD.defs.consumables).filter(function (d) { return !isTest(d.id); }))
      .filter(function (d) { return Tg.revivesWith(standIn(d), d); });
    let up = 0;
    heals.forEach(function (d) {
      const cons = DD.getConsumable(d.id) === d;
      const owner = DD.getHero(d.owner) ? d.owner : 'marwyn';
      const mate = owner === 'slate' ? 'marwyn' : 'slate';
      const s = DD.Combat.sandbox({ w: 9, h: 9, seed: 'int-up:' + d.id, noPlan: true,
        heroes: [{ id: owner, x: 4, y: 4, level: 3, skills: [] }, { id: mate, x: 5, y: 4, level: 3, skills: [] }],
        enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const u = s.units.filter(function (x) { return x.kind === 'hero' && x.defId === owner; })[0];
      const ally = s.units.filter(function (x) { return x.kind === 'hero' && x.defId === mate; })[0];
      let ref;
      // the top level (some heals mend the downed only from a later level: Temper III)
      if (cons) { s.consumables = [d.id]; ref = d; } else { ref = DD.Act.makeSlot(d.id, Array.isArray(d.levels) ? d.levels.length : 1); u.skills = [ref]; }
      DD.Act.kill(ally, null);
      const at = Tg.validTargets(u, ref).filter(function (p) { return p.x === ally.x && p.y === ally.y; })[0];
      if (!t.ok(!!at && at.revive === true, d.id + ': a downed adjacent ally is a target (revive)')) return;
      const why = cons ? DD.Combat.canUseConsumable(u, 0) : DD.Combat.canUse(u, ref);
      if (why !== true) { t.log(d.id + ': not usable in this arena (' + why + ')'); return; }
      const pv = Tg.preview(u, ref, at), e = pv && pv.perUnit[ally.id], exact = !!pv && !pv.uncertain;
      const ok = cons ? DD.Combat.useConsumable(u, 0, ally.x, ally.y) : DD.Combat.useSkill(u, ref, ally.x, ally.y);
      t.ok(ok && !ally.downed && ally.hp >= 1 && (!exact || (!!e && e.revived && e.heal === ally.hp)),
        d.id + ': aimed at a downed ally, it gets them up with the HP its preview promised (' + ally.hp + ' HP, preview ' + JSON.stringify(e) + ')');
      if (!ally.downed) up++;
    });
    t.ok(up >= 9, up + ' of ' + heals.length + ' revive-capable heals got a downed ally up: ' + heals.map(function (d) { return d.id; }).join(', '));
    // 3. the map turns now: no player text names a grid direction by where it sits on the screen
    const SCREEN = /\b(?:top|bottom)[- ](?:left|right)\b|\b(?:up|down) the screen\b|\btoward the (?:top|bottom)\b|\bscreen[- ](?:left|right)\b/i;
    const texts = [];
    function add(id, s) { if (typeof s === 'string') texts.push([id, s]); }
    vals(DD.defs.skills).forEach(function (d) {
      const n = Array.isArray(d.levels) && d.levels.length ? d.levels.length : 1;
      for (let lv = 1; lv <= n; lv++) add(d.id, DD.skillDesc(d, lv, null));
    });
    ['items', 'consumables', 'statuses', 'objects', 'surfaces', 'terrain', 'enemies', 'summons', 'heroes', 'scars', 'passives'].forEach(function (k) {
      vals(DD.defs[k]).forEach(function (d) {
        add(d.id, d.desc);
        if (d.passive) add(d.id + ' passive', d.passive.desc);
        // Blessings: desc(L) per level (the only function descs here; skills went through DD.skillDesc above)
        if (k === 'passives' && typeof d.desc === 'function' && Array.isArray(d.levels)) d.levels.forEach(function (L, i) { add(d.id + ' L' + (i + 1), d.desc(L)); });
      });
    });
    vals(DD.defs.events).forEach(function (ev) {
      add(ev.id, ev.text);
      (ev.choices || []).forEach(function (c, i) { add(ev.id + ' choice ' + i, c.label); add(ev.id + ' hint ' + i, c.hint); });
    });
    Object.keys(DD.defs.narration).forEach(function (k) { (DD.defs.narration[k] || []).forEach(function (l) { add('narration ' + k, l); }); });
    if (DD.WildMagic && DD.WildMagic.list) DD.WildMagic.list().forEach(function (w) { add(w.id, w.text); add(w.id + ' quip', w.quip); });
    const bad = texts.filter(function (x) { return SCREEN.test(x[1]); });
    t.eq(bad.map(function (x) { return x[0] + ': "' + x[1] + '"'; }).join(' | '), '', 'no screen-direction words in ' + texts.length + ' player texts');
    t.ok(/south/.test(DD.WildMagic.get('wm_continental_drift').text) && /compass/.test(DD.WildMagic.get('wm_continental_drift').text),
      'Continental Drift says south by the compass, not by the screen');
    // 4. Smite (Wrong Address) electrifies the water its target stands in: a flying target stands in none
    [false, true].forEach(function (fly) {
      const s = DD.Combat.sandbox({ w: 7, h: 5, seed: 'int-smite', noPlan: true,
        heroes: [{ id: 'test_knight', x: 0, y: 0 }, { id: 'test_mage', x: 3, y: 2 }], enemies: [{ id: 'test_grunt', x: 2, y: 2 }],
        terrain: function (tl) { if (tl.y === 2 && tl.x >= 1 && tl.x <= 4) tl.t = 'water'; } });
      const g = s.units.filter(function (u) { return u.defId === 'test_grunt'; })[0];
      const m = s.units.filter(function (u) { return u.defId === 'test_mage'; })[0];
      g.flags.flying = fly;
      DD.Combat._action(function () { DD.WildMagic.apply('wm_smite', s.units[0], { source: 'test' }); });
      t.ok(g.hp < g.maxHp, 'Smite: the ' + (fly ? 'flying' : 'wading') + ' grunt is struck');
      t.eq(DD.Act.hasStatus(m, 'stun'), !fly, 'Smite: the mage in the same pool is ' + (fly ? 'not shocked (a flyer stands in no water)' : 'shocked'));
    });
  });

  // ---- rules run (Nov 6, user: "objects should be targetable to break them") — across every content file ----------
  // The core objects (js/data/terrain.js) are the engine's; everything else with HP was placed by a content author.
  const CORE_OBJECTS = ['crate', 'barrel', 'barrel_explosive', 'keg', 'pillar', 'rock', 'tree', 'dead_tree', 'bush', 'mushroom',
    'gravestone', 'coffin', 'statue', 'bookshelf', 'candles', 'd20', 'soda_can', 'pencil', 'gold_pile', 'bones', 'fence', 'pipe',
    'totem', 'spikes', 'pressure_plate', 'lever', 'valve', 'mirror', 'chest', 'fountain', 'brazier'];
  T.suite('integration: rules run — every breakable content object decides targetable, its desc says so, and the party\'s aim agrees', function (t) {
    if (!fullRoster() || !DD.getEnemy('dungeon_master') || !DD.getHero('test_mage')) { t.skip('needs every content file and tests/fixtures.js (isolated run)'); return; }
    const Tg = DD.Targeting;
    const own = vals(DD.defs.objects).filter(function (o) { return !isTest(o.id) && CORE_OBJECTS.indexOf(o.id) < 0; });
    const breakables = own.filter(function (o) { return Number(o.hp) > 0; });
    t.ok(breakables.length >= 10, breakables.length + ' breakable content objects: ' + breakables.map(function (o) { return o.id; }).join(', '));
    const targets = [], optOuts = [];
    breakables.forEach(function (o) {
      const desc = String(o.desc || '');
      if (o.volatile) {
        // the barrel rule (Nov 5): aimed at, it goes off; nothing to decide
        t.ok(/explode/i.test(desc), o.id + ': volatile, and its desc says it explodes');
        return;
      }
      if (!t.ok(o.targetable === true || o.targetable === false, o.id + ': states its targetable decision (' + o.targetable + ')')) return;
      t.ok(new RegExp('\\b' + o.hp + ' HP\\b').test(desc), o.id + ': its desc gives its ' + o.hp + ' HP');
      if (o.targetable) t.ok(/any single-target damage skill can break it/i.test(desc), o.id + ': its desc says any single-target damage skill can break it (D1)');
      else t.ok(/can't be aimed|never aimed|never aim/i.test(desc), o.id + ': its desc says attacks are never aimed at it');
      (o.targetable ? targets : optOuts).push(o.id);
      // in play: the test mage's 4-damage bolt (range 1-5), from next to it and from 3 tiles away
      [1, 3].forEach(function (d) {
        const s = DD.Combat.sandbox({ w: 7, h: 5, seed: 'int-break:' + o.id + ':' + d, noPlan: true,
          heroes: [{ id: 'test_mage', x: 0, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
        const m = s.units.filter(function (u) { return u.defId === 'test_mage'; })[0];
        const label = o.id + ' ' + d + ' tile' + (d === 1 ? '' : 's') + ' away';
        if (!t.ok(!!DD.Act.placeObject(d, 2, o.id), label + ': placed')) return;
        const q = Tg.validTargets(m, m.basic).filter(function (p) { return p.x === d && p.y === 2; })[0];
        if (!o.targetable) { t.ok(!q, label + ': no target for the party (' + JSON.stringify(q || null) + ')'); return; }
        if (!t.ok(!!q && q.obj === o.id && q.dmg === 4 && q.breaks === (o.hp <= 4), label + ': a breakable target for the bolt\'s 4 (' + JSON.stringify(q || null) + ')')) return;
        const pv = Tg.preview(m, m.basic, q);
        const left = Math.max(0, o.hp - 4);
        t.ok(!!pv && !!pv.breaks && pv.breaks.left === left && pv.breaks.text.indexOf('Break: ' + o.name) === 0,
          label + ': the preview reads "' + (pv && pv.breaks && pv.breaks.text) + '"');
        if (d !== 3) return;
        const hit = DD.Combat.useSkill(m, m.basic, d, 2);
        const after = DD.Grid.tile(d, 2).obj;
        t.ok(!!hit && (left > 0 ? !!after && after.id === o.id && after.hp === left : !after || after.id !== o.id),
          label + ': the bolt does what the preview said (' + (after && after.id === o.id ? after.hp + ' HP left' : 'broken') + ')');
      });
    });
    t.log('content objects the party can aim at: ' + targets.join(', ') + ' · opted out: ' + optOuts.join(', '));
    // the decisions that make the puzzles: the DM's screen and the objects the party protects are no targets; the
    // destroy objectives and the Lich's shelves are
    ['dm_screen_panel', 'a2_coffee_machine', 'a3_snack_bowl'].forEach(function (id) { t.ok(optOuts.indexOf(id) >= 0, id + ' is opted out'); });
    ['a1_strike_fund', 'a2_chafing_dish', 'lich_shelf', 'grim_cabinet', 'a2_bone_pile'].forEach(function (id) { t.ok(targets.indexOf(id) >= 0, id + ' is a target'); });
  });

  T.suite('integration: whole campaigns with real heroes under AutoPlay (smoke)', function (t) {
    if (!fullRoster() || !DD.getEnemy('dungeon_master')) { t.skip('needs every hero and boss file (isolated run)'); return; }
    const savedUi = DD.Run.useUi, savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    try {
      const n = t.n || 2;
      for (let seed = 0; seed < n; seed++) {
        DD.Meta.reset(false);
        const party = DD.RNG('int-party:' + seed).shuffle(realHeroes()).slice(0, 4);
        t.ok(party.every(DD.Meta.isUnlocked), 'seed ' + seed + ': a fresh profile has every hero unlocked (v2)');
        const rep = t.tryRun('campaign ' + seed, function () { return playCampaign(seed, party); }) || { errors: ['threw'], capped: [] };
        t.eq(rep.errors.length, 0, 'seed ' + seed + ': no invariant violations ' + JSON.stringify(rep.errors.slice(0, 3)));
        t.ok(rep.over === 'victory' || rep.over === 'defeat', 'seed ' + seed + ': the run ends (' + rep.over + ' in act ' + rep.act + ')');
        // v2 is hard ("hard but fair") and this smoke picks nodes at random (elites at level 1 too): a run can end in act 1
        t.ok(rep.fights >= 2, 'seed ' + seed + ': real fights were played (' + rep.fights + ')');
        t.eq(rep.capped.length, 0, 'seed ' + seed + ': every fight finished under 40 rounds ' + JSON.stringify(rep.capped));
        if (rep.over === 'victory') t.eq(rep.cleared, DD.finalAct(), 'seed ' + seed + ': all ' + DD.finalAct() + ' acts cleared');
        t.log('seed ' + seed + ' [' + party.join(',') + ']: ' + rep.over + ' · act ' + rep.act + ' · ' + rep.fights + ' fights · ' + rep.log.join(' '));
      }
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
  });

  // =====================================================================================================================
  // V3: act 4 "Under the Table" and the 17th hero (plan .tmp/v3/design.md §8.4 "Integrator")
  // =====================================================================================================================
  const A4_PREFIX = /^(gard_|lg_|gal_|cov_|svam_|rap_)/;
  /** The real act-4 encounters (doors and the finale), or [] before the act-4 content lands. */
  function act4Encounters() {
    return vals(DD.defs.encounters).filter(function (e) { return !isTest(e.id) && (e.gauntlet || e.finale); });
  }
  /** The act the gauntlet lives in (the act of the real act-4 content), or 0. */
  function gauntletAct() { const e = act4Encounters()[0]; return e ? e.act : 0; }
  /** Run fn with the campaign knob at `acts` (try / finally: the knob is restored even if fn throws). */
  function withActs(acts, fn) {
    const snap = DD.Balance.snapshot();
    try {
      DD.Balance.campaign.acts = acts;
      return fn();
    } finally { DD.Balance.restore(snap); }
  }
  /** A headless run lab: no UI, instant FX, Meta and the save restored afterwards. */
  function runLab(fn) {
    const savedUi = DD.Run.useUi, savedInstant = DD.FX.instant, savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    DD.FX.instant = true;
    try {
      return fn();
    } finally {
      DD.Run.useUi = savedUi;
      DD.FX.instant = savedInstant;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    }
  }
  /** Travel to the current act's boss node and start that fight (the node before it gets a link to it). */
  function toBoss() {
    const s = DD.Run.state, boss = s.map.nodes[s.map.boss], before = s.map.layout[boss.row - 1][0];
    s.nodeId = before;
    s.map.nodes[before].links = [boss.id];
    return DD.Run.travel(boss.id);
  }
  function winFight() {
    DD.Act.endCombat('victory');
    if (DD.FX.flush) DD.FX.flush();
    if (DD.Run.inCombat()) DD.Run.finishCombat('victory', DD.Combat.state);
  }

  T.suite('integration: V3 — "I, SVAMMIEL, CONTROL ALL" plays on the act-3 boss\'s board with the gauntlet on, never without it', function (t) {
    const A4 = gauntletAct();
    if (!A4 || !fullRoster() || !DD.getCameo || !DD.getCameo('svammiel') || !DD.Run.startAtAct) { t.skip('needs every hero, the act-4 content and Svammiel\'s cameo (isolated run)'); return; }
    const party = realHeroes().slice(0, 4);
    const LINE = 'I, SVAMMIEL, CONTROL ALL';
    runLab(function () {
      [A4 - 1, A4].forEach(function (acts) {
        withActs(acts, function () {
          DD.Meta.reset(false);
          DD.Run.newRun(party, 'normal', 'int-twist-' + acts);
          DD.Run.startAtAct(A4 - 1, { level: 5, noShow: true });
          t.ok(toBoss(), 'acts ' + acts + ': the act-' + (A4 - 1) + ' boss fight starts');
          const cs = DD.Combat.state;
          t.ok((cs.encounter.enemies || []).some(function (x) { return x.id === 'dungeon_master'; }), 'acts ' + acts + ': it is the Dungeon Master (' + cs.encounter.id + ')');
          winFight();
          const said = cs.log.filter(function (l) { return String(l.text).indexOf(LINE) >= 0; });
          const run = DD.Run.state;
          if (acts < A4) {
            t.eq(said.length, 0, 'acts ' + acts + ': no "' + LINE + '" in his victory log');
            t.eq(run.over, 'victory', 'acts ' + acts + ': he ends the campaign');
            t.ok(!DD.Meta.isSeen('bosses', 'svammiel'), 'acts ' + acts + ': the spoiler gate stays shut');
          } else {
            t.ok(said.length >= 1 && said.some(function (l) { return l.cls === 'cameo' && l.speaker === 'Svammiel'; }), 'acts ' + acts + ': Svammiel says it on the DM\'s board (' + (said[0] && said[0].text) + ')');
            t.ok(!run.over && run.act === A4 && run.map.shape === 'gauntlet', 'acts ' + acts + ': the campaign goes on into the gauntlet (act ' + run.act + ', ' + run.map.shape + ')');
            const d = DD.Run.rewards();
            t.ok(!!d && !!d.actClear && d.actClear.twist === true, 'acts ' + acts + ': his loot comes with the twist act clear');
          }
        });
      });
    });
  });

  T.suite('integration: V3 — the DM\'s cameo pool never picks an act-4 enemy', function (t) {
    if (!DD.BossDM || typeof DD.BossDM.cameoPool !== 'function' || !gauntletAct()) { t.skip('needs dm.js and the act-4 content (isolated run)'); return; }
    const A4 = gauntletAct();
    const act4 = vals(DD.defs.enemies).filter(function (e) { return e.act >= A4; });
    t.ok(act4.some(function (e) { return e.tier === 'minion' && Array.isArray(e.skills) && e.skills.length && e.sprite; }),
      'premise: the act-4 content has minions the pool would otherwise take (' + act4.filter(function (e) { return e.tier === 'minion'; }).map(function (e) { return e.id; }).join(', ') + ')');
    [A4 - 1, A4].forEach(function (acts) {
      withActs(acts, function () {
        const pool = DD.BossDM.cameoPool();
        const ids = [];
        Object.keys(pool).forEach(function (a) { (pool[a] || []).forEach(function (id) { ids.push(id); }); });
        const bad = ids.filter(function (id) { const e = DD.getEnemy(id); return !e || e.act >= A4 || A4_PREFIX.test(id); });
        t.ok(ids.length > 0, 'acts ' + acts + ': the pool has ' + ids.length + ' enemies');
        t.eq(bad.join(','), '', 'acts ' + acts + ': none of them is an act-4 enemy');
        t.ok(Object.keys(pool).every(function (a) { return +a < A4; }), 'acts ' + acts + ': the pool lists acts ' + Object.keys(pool).join(', ') + ' only');
      });
    });
  });

  /**
   * The act-4 pronoun sweep (plan §0.2, §8.4): in every act-4 bark, desc, narration line, cameo line, event and line bank,
   * a sentence that names exactly one character (an act-4 villain, the DM or a hero) uses only that character's
   * pronouns; a sentence that names nobody in an enemy's own text (its barks, passive, desc, intro, its skills' descs)
   * uses that enemy's. Svammiel, Galbraith, Kelek, Warduke, Zarak, Zargash, Billy Bleatz, Lil' Kid, DJ Turnip, Ursa Verse
   * and the DM he; Skylla, the three hags (and Baba Yaga) she; the Gardener it. A speaker tag ("DM (whispering): ") is
   * not the sentence's subject and is dropped first.
   */
  T.suite('integration: V3 — pronoun sweep across every act-4 bark, desc, narration, cameo line and event', function (t) {
    const A4 = gauntletAct();
    if (!A4 || !fullRoster()) { t.skip('needs every hero and the act-4 content (isolated run)'); return; }
    const VILLAINS = [
      { id: 'svammiel', p: 'he', re: /\bSvamm(?:iel|y)\b/ },
      { id: 'gardener', p: 'it', re: /\bGardener\b/ },
      { id: 'kelek', p: 'he', re: /\bKelek\b/ },
      { id: 'warduke', p: 'he', re: /\bWarduke\b/ },
      { id: 'zarak', p: 'he', re: /\bZarak\b/ },
      { id: 'zargash', p: 'he', re: /\bZargash\b/ },
      { id: 'skylla', p: 'she', re: /\bSkylla\b/ },
      { id: 'galbraith', p: 'he', re: /\bGalbraith\b/ },
      { id: 'granny', p: 'she', re: /\b(?:Granny|Gristle)\b/ },
      { id: 'brine', p: 'she', re: /\bBrine\b/ },
      { id: 'mildred', p: 'she', re: /\bMildred\b/ },
      { id: 'billy', p: 'he', re: /\b(?:Billy|Bleatz)\b/ },
      { id: 'kid', p: 'he', re: /\bLil'? Kid\b/ },
      { id: 'turnip', p: 'he', re: /\bDJ Turnip\b|\bTurnip\b(?! the Bass)/ },
      { id: 'ursa', p: 'he', re: /\bUrsa\b|Paw-et Laureate/ },
      { id: 'dm', p: 'he', re: /\bDM\b|Dungeon Master/ },
      { id: 'baba', p: 'she', re: /\bBaba(?: Yaga)?\b/ },
      // named in the League's lines, with no pronoun given by the user: a sentence naming him is not checked
      { id: 'ringlerun', p: null, re: /\bRinglerun\b/ },
    ];
    const chars = VILLAINS.slice();
    realHeroes().forEach(function (id) {
      const nm = DD.getHero(id).name.split(/\s+/);
      chars.push({ id: id, p: SHE[id] ? 'she' : 'he', re: new RegExp('\\b(' + id.charAt(0).toUpperCase() + id.slice(1) + '|' + nm[nm.length - 1] + ')\\b') });
    });
    const OWNER = {   // an act-4 enemy def → its pronoun
    };
    const enemies = vals(DD.defs.enemies).filter(function (e) { return e.act === A4 && !isTest(e.id); });
    enemies.forEach(function (e) { OWNER[e.id] = e.pronoun || 'it'; });
    const HE = /\b(?:he|him|his|himself)\b/i, SHE_W = /\b(?:she|her|hers|herself)\b/i;
    const strings = [];
    function str(s, path, owner) { if (typeof s === 'string' && s) strings.push({ s: s, path: path, owner: owner || null }); }
    function walk(o, path, owner, depth) {
      if (o === null || o === undefined || depth > 7) return;
      if (typeof o === 'string') { str(o, path, owner); return; }
      if (typeof o !== 'object') return;
      Object.keys(o).forEach(function (k) {
        if (/^(id|icon|sprite|color|colour|tags|owner|hero|kind|sting|music|palette|overlay|layout|legend|LAYOUT|LAYOUT_LEGEND|SPRITES|key|style|lane|theme)$/.test(k)) return;
        walk(o[k], path + '.' + k, owner, depth + 1);
      });
    }
    function call(fn, arg) { try { return fn(arg); } catch (e) { return null; } }
    // 1. act-4 enemies: name, desc, passive, barks, named lines, boss intro / defeat; their skills' descs
    const skillOwner = {};
    enemies.forEach(function (e) {
      str(e.desc, e.id + '.desc', e.id);
      if (e.passive) str(typeof e.passive.desc === 'function' ? call(e.passive.desc, null) : e.passive.desc, e.id + '.passive', e.id);
      // a mourning bark (mourn_<member>) is about that member, not the speaker
      Object.keys(e.barks || {}).forEach(function (k) {
        const m = /^mourn_(\w+)$/.exec(k);
        walk(e.barks[k], e.id + '.barks.' + k, m && chars.some(function (c) { return c.id === m[1]; }) ? m[1] : e.id, 0);
      });
      walk(e.named, e.id + '.named', e.id, 0);
      if (e.boss && typeof e.boss === 'object') walk({ intro: e.boss.intro, defeat: e.boss.defeat, title: e.boss.title }, e.id + '.boss', e.id, 0);
      (e.skills || []).forEach(function (sid) { const id = typeof sid === 'string' ? sid : sid && sid.id; if (id) skillOwner[id] = skillOwner[id] ? 'shared' : e.id; });
    });
    vals(DD.defs.skills).filter(function (s) { return A4_PREFIX.test(s.id) || skillOwner[s.id]; }).forEach(function (s) {
      const owner = skillOwner[s.id] && skillOwner[s.id] !== 'shared' ? skillOwner[s.id] : null;
      str(s.name, s.id + '.name', null);
      const n = Array.isArray(s.levels) && s.levels.length ? s.levels.length : 1;
      for (let lv = 1; lv <= n; lv++) str(call(function () { return DD.skillDesc(s, lv, null); }), s.id + '.desc' + lv, owner);
    });
    // 2. act-4 statuses, objects, terrains, surfaces and encounters (descs, objective texts, intros)
    ['statuses', 'objects', 'terrain', 'surfaces'].forEach(function (k) {
      vals(DD.defs[k]).filter(function (d) { return A4_PREFIX.test(d.id); }).forEach(function (d) {
        str(d.name, d.id + '.name');
        str(typeof d.desc === 'function' ? call(d.desc, null) : d.desc, d.id + '.desc');
      });
    });
    act4Encounters().forEach(function (e) {
      walk({ name: e.name, shortName: e.shortName, intro: e.intro, teaser: e.teaser, objective: e.objective && { text: e.objective.text, flavor: e.objective.flavor },
        gauntlet: e.gauntlet && { hint: e.gauntlet.hint } }, e.id, null, 0);
    });
    // 3. every narration pool (the act-4 keys, the @a4 variants and the cameo pools among them)
    Object.keys(DD.defs.narration).forEach(function (k) { (DD.defs.narration[k] || []).forEach(function (l, i) { str(l, 'narration ' + k + '[' + i + ']'); }); });
    // 4. act-4 events (texts, choices, hints)
    vals(DD.defs.events).filter(function (ev) { return (ev.acts || []).indexOf(A4) >= 0; }).forEach(function (ev) {
      str(typeof ev.text === 'function' ? call(ev.text, null) : ev.text, ev.id + '.text');
      (ev.choices || []).forEach(function (c, i) { str(c.label, ev.id + '.choice' + i); str(c.hint, ev.id + '.hint' + i); });
    });
    // 5. the fight files' line banks (banter, disses, named lines, codex)
    ['League', 'Goats', 'Coven', 'Galbraith', 'Gardener', 'BossSvammiel', 'SvammielLines'].forEach(function (m) {
      const mod = DD[m];
      if (!mod) return;
      ['BANTER', 'NAMED', 'DISS', 'CLOSE', 'BACK', 'FIGHT', 'MOMENTS', 'LINE', 'CODEX', 'CODEX_NOTE', 'COUNTER_DESC'].forEach(function (k) { if (mod[k]) walk(mod[k], 'DD.' + m + '.' + k, null, 0); });
    });
    // the sweep
    const TAG = /^(?:DM \((?:whispering|demoted)\)|[A-Z][\w'.]*(?: [A-Z][\w'.]*){0,3}):\s+/;
    let checked = 0, byVillain = 0;
    const bad = [];
    function pronounOf(id) {
      if (!id) return null;
      if (OWNER[id]) return OWNER[id];
      const c = chars.filter(function (x) { return x.id === id; })[0];
      return c ? c.p : null;
    }
    function sweep(x, bad) {
      // the subject carries over within a text: "Calls him Svammy. He hates it." (a sentence that names nobody refers to the
      // last one-character sentence before it, else to the text's owner; after a two-character sentence it is unknown);
      // in an enemy's own text its own pronouns are always fine too ("Zarak guards her" in Skylla's passive)
      let ctx = x.owner;
      const own = pronounOf(x.owner);
      String(x.s).split(/(?<=[.!?…])\s+|\n/).forEach(function (raw) {
        const sent = raw.replace(TAG, '');
        const who = chars.filter(function (c) { return c.re.test(sent); });
        let p = null, name = null;
        if (who.length === 1) { p = who[0].p; name = ctx = who[0].id; } else if (!who.length && ctx) { p = pronounOf(ctx); name = ctx; } else if (who.length > 1) ctx = null;
        if (!p) return;
        checked++;
        if (VILLAINS.some(function (v) { return v.id === name; }) || OWNER[name]) byVillain++;
        const ok = [p, own];
        const wrong = (HE.test(sent) && ok.indexOf('he') < 0) || (SHE_W.test(sent) && ok.indexOf('she') < 0);
        if (wrong) bad.push(x.path + ' (' + name + ': ' + p + '): "' + sent.slice(0, 140) + '"');
      });
    }
    // the checker itself: it catches a wrong pronoun for each kind of character, and leaves a carried subject alone
    const probes = [
      ['Skylla sharpens his wand.', true], ['The Gardener loses her sun hat.', true], ['Billy Bleatz drops her mic.', true],
      ['Ursa Verse, the Paw-et Laureate, clears her throat.', true], ['Granny Gristle stirs his pot.', true], ['Svammiel fixes her dice.', true],
      ['Benedick withdraws into her shell.', true], ['Kiri draws his bow.', true], ['Svammiel laughs. He cheats.', false],
      ['Calls him Svammy. He hates it.', false], ['The Gardener prunes. It beeps.', false], ['Zarak and Skylla argue. She wins.', false],
    ];
    probes.forEach(function (pr) {
      const b = [];
      sweep({ s: pr[0], path: 'probe', owner: null }, b);
      t.eq(b.length > 0, pr[1], 'the sweep ' + (pr[1] ? 'flags' : 'accepts') + ' "' + pr[0] + '"');
    });
    t.eq((function () { const b = []; sweep({ s: 'Who will roll her eyes at me now?', path: 'probe', owner: 'skylla' }, b); return b.length; })(), 0, 'a mourning bark is about the member it mourns');
    strings.forEach(function (x) { sweep(x, bad); });
    t.log('pronoun sweep: ' + strings.length + ' texts, ' + checked + ' sentences checked, ' + byVillain + ' of them about an act-4 villain or the DM');
    t.ok(strings.length > 500 && checked > 400 && byVillain > 150, 'the sweep read ' + strings.length + ' texts, ' + checked + ' sentences with one character (' + byVillain + ' about an act-4 villain or the DM)');
    t.eq(bad.length, 0, 'every sentence uses its character\'s pronouns: ' + bad.slice(0, 12).join(' | ') + (bad.length > 12 ? ' … +' + (bad.length - 12) : ''));
    // every named act-4 villain def states its pronoun (lead patch P4) as the user gave it
    const want = { svam_svammiel: 'he', gard_gardener: 'it', lg_kelek: 'he', lg_warduke: 'he', lg_zarak: 'he', lg_zargash: 'he', lg_skylla: 'she', gal_galbraith: 'he',
      cov_granny: 'she', cov_brine: 'she', cov_mildred: 'she', rap_billy: 'he', rap_kid: 'he', rap_turnip: 'he', rap_ursa: 'he' };
    Object.keys(want).forEach(function (id) {
      const e = DD.getEnemy(id);
      if (!e) { t.log(id + ': not registered (renamed?)'); return; }
      t.eq(e.pronoun, want[id], e.name + ' (' + id + '): pronoun ' + want[id]);
    });
  });

  T.suite('integration: V3 — four-act campaigns with real heroes under AutoPlay: the twist, the gauntlet, the floor boss (smoke)', function (t) {
    const A4 = gauntletAct();
    if (!A4 || !fullRoster() || !DD.getEnemy('dungeon_master') || !DD.Run.startAtAct) { t.skip('needs every hero, boss and act-4 file (isolated run)'); return; }
    const lanes = act4Encounters().filter(function (e) { return e.gauntlet; }).map(function (e) { return e.gauntlet.lane; });
    const n = t.n || 1;
    runLab(function () {
      withActs(Math.max(A4, DD.finalAct()), function () {
        const L = DD.RunMap.gauntletLanes(A4).length;
        for (let seed = 0; seed < n; seed++) {
          // a: from the DM's act at level 5 (the twist, if the party beats him); b: from act 4 (the whole gauntlet)
          [{ startAct: A4 - 1, tag: 'a' }, { startAct: A4, tag: 'b' }].forEach(function (o) {
            DD.Meta.reset(false);
            const party = DD.RNG('int-a4:' + o.tag + seed).shuffle(realHeroes()).slice(0, 4);
            const rep = t.tryRun('campaign ' + o.tag + seed, function () { return playCampaign(1000 + seed, party, { startAct: o.startAct, level: 5 }); }) || { errors: ['threw'], capped: [], acts: [], doors: [], log: [] };
            const label = o.tag + seed + ' [' + party.join(',') + ']';
            t.eq(rep.errors.length, 0, label + ': no invariant violations ' + JSON.stringify(rep.errors.slice(0, 3)));
            t.ok(rep.over === 'victory' || rep.over === 'defeat', label + ': the run ends (' + rep.over + ' in act ' + rep.act + ')');
            t.eq(rep.capped.length, 0, label + ': every fight finished under 40 rounds ' + JSON.stringify(rep.capped));
            if (o.startAct < A4) {
              const reached = rep.acts.indexOf(A4) >= 0;
              t.eq(reached, rep.twist, label + ': the run reached act ' + A4 + ' exactly when the DM fell, through the twist (' + (reached ? 'twist' : rep.over + ' in act ' + rep.act) + ')');
            }
            if (rep.acts.indexOf(A4) >= 0) {
              t.ok(rep.map && rep.map.shape === 'gauntlet' && rep.map.rows === 2 * L + 2 && rep.map.lanes.length === L, label + ': act ' + A4 + ' is the gauntlet (' + JSON.stringify(rep.map) + ')');
              t.eq(rep.doors.filter(function (l, i) { return rep.doors.indexOf(l) === i; }).length, rep.doors.length, label + ': no door fought twice (' + rep.doors.join(' > ') + ')');
              t.ok(rep.doors.every(function (l) { return lanes.indexOf(l) >= 0 || /^test_/.test(l); }), label + ': every door is a registered lane');
            }
            if (rep.over === 'victory') {
              const sum = rep.summary || {};
              t.ok(sum.acts === DD.finalAct() && sum.floorBoss === true && rep.cleared === DD.finalAct(), label + ': a four-act win (acts ' + sum.acts + ', floor boss ' + sum.floorBoss + ')');
              t.ok((sum.gauntlet || []).length === L && sum.gauntletLanes === L && rep.stats.miniBosses === L, label + ': every one of the ' + L + ' doors beaten (' + (sum.gauntlet || []).join(' > ') + ')');
            }
            t.log(label + ': ' + rep.over + ' · act ' + rep.act + ' · ' + rep.fights + ' fights · ' + rep.log.join(' '));
          });
        }
      });
    });
  });

  T.suite('integration: V3 — determinism: more lines in the cosmetic pools leave an act-4 AutoPlay fight bit-identical (h19: also with Biz\'s robots and Phat Gus\'s whispers)', function (t) {
    const A4 = gauntletAct();
    if (!A4 || !fullRoster() || !DD.Run.startAtAct || !DD.getCameo || !DD.getCameo('svammiel')) { t.skip('needs every hero and the act-4 content (isolated run)'); return; }
    function fill(ids) {
      const p = ids.filter(function (id) { return !!DD.getHero(id); });
      while (p.length < 4) p.push(realHeroes().filter(function (id) { return p.indexOf(id) < 0; })[0]);
      return p;
    }
    // V3's party, then h19's (plan §2.3): Biz (two summons on his turn, the Hjalmar gag with Hjalmar there) and Phat Gus
    // (cosmetic whispers on every meal), each fight played twice with every cosmetic pool it can draw from grown by a line
    const PARTIES = [{ tag: 'v3', seed: 'int-determinism', party: fill(['betty', 'kiri', 'benedick', 'josiah']) },
      { tag: 'h19', seed: 'int-determinism-h19', party: fill(['biz', 'gus', 'hjalmar', 'josiah']) }];
    const lane = act4Encounters().filter(function (e) { return e.gauntlet && e.gauntlet.lane === 'goats'; }).length ? 'goats' : (act4Encounters().filter(function (e) { return e.gauntlet; })[0] || { gauntlet: {} }).gauntlet.lane;
    let party = PARTIES[0].party, runSeed = PARTIES[0].seed;
    /** One act-4 door fought by AutoPlay from a fresh run; returns what the mechanics left behind. */
    function play() {
      DD.Meta.reset(false);
      DD.Run.newRun(party, 'normal', runSeed);
      DD.Run.startAtAct(A4, { level: 5, gear: 'auto', noShow: true });
      const S = DD.Run.state;
      for (let g = 0; g < 4; g++) {
        const avail = DD.Run.availableNodes();
        const door = avail.filter(function (nd) { return nd.type === 'miniboss' && nd.lane === lane; })[0];
        if (door) { DD.Run.travel(door.id); break; }
        DD.Run.travel((avail.filter(function (nd) { return nd.type === 'tavern'; })[0] || avail[0]).id);
        for (let k = 0; k < 6 && S.pending && S.pending.type !== 'combat'; k++) DD.Run.next();
      }
      const cs = DD.Combat.state;
      if (!cs || !cs.encounter || !cs.encounter.gauntlet) return null;
      DD.AutoPlay.runBattle(40);
      if (DD.FX.flush) DD.FX.flush();
      return {
        enc: cs.encounter.id, result: cs.result || 'open', round: cs.round, rng: cs.rng.getState(), hype: cs.hype,
        units: cs.units.map(function (u) { return [u.defId, u.hp, u.x, u.y, !!u.dead, !!u.downed].join(':'); }).join(' '),
        cheats: cs.rules.filter(function (r) { return r.cheat; }).map(function (r) { return r.id; }).join(','),
        cameos: (cs.stats && cs.stats.cameos) || 0,
        bots: cs.units.filter(function (u) { return u.kind === 'summon' && CONSTRUCTS.biz.indexOf(u.defId) >= 0; }).length,
      };
    }
    /** Push a line onto an array pool; the undo pops it. */
    function grow(arr, line, added) {
      if (!Array.isArray(arr)) return;
      arr.push(line);
      added.push(function () { arr.pop(); });
    }
    runLab(function () {
      withActs(Math.max(A4, DD.finalAct()), function () {
        PARTIES.forEach(function (P) {
          party = P.party;
          runSeed = P.seed;
          const label = P.tag + ' [' + party.join(',') + ']';
          const a = play();
          if (!t.ok(!!a, label + ': premise: the ' + lane + ' door was fought (' + (a && a.enc) + ', ' + (a && a.result) + ' in round ' + (a && a.round) + ')')) return;
          // add a line to every cosmetic pool the fight can draw from: Svammiel's pools, the goats' bars, every act-4 bark;
          // h19: the party's own barks, every summon's barks (Biz's robots), Phat Gus's whispers and the Hjalmar gag's lines
          const added = [];
          Object.keys(DD.defs.narration).forEach(function (k) {
            if (!/^(svam_|rap_|goats_|league_|galbraith_|gard|cov_)/.test(k)) return;
            grow(DD.defs.narration[k], 'An extra line for the determinism check (' + k + ').', added);
          });
          vals(DD.defs.enemies).filter(function (e) { return e.act === A4 && e.barks; }).forEach(function (e) {
            Object.keys(e.barks).forEach(function (k) { grow(e.barks[k], 'An extra bark (' + k + ').', added); });
          });
          const before = added.length;
          if (P.tag === 'h19') {
            party.forEach(function (id) { const h = DD.getHero(id); Object.keys(h.barks || {}).forEach(function (k) { grow(h.barks[k], 'An extra hero bark (' + k + ').', added); }); });
            vals(DD.defs.summons).forEach(function (sd) { Object.keys(sd.barks || {}).forEach(function (k) { grow(sd.barks[k], 'An extra beep (' + k + ').', added); }); });
            if (DD.Gus) grow(DD.Gus.WHISPERS, '...an extra whisper...', added);
            if (DD.Biz) grow(DD.Biz.TIN_LINES, 'An extra tin-double line.', added);
          }
          let b = null;
          try { b = play(); } finally { added.forEach(function (undo) { undo(); }); }
          t.ok(added.length > 50, label + ': ' + added.length + ' cosmetic pools got an extra line (' + (added.length - before) + ' of them the party\'s, the summons\' and the h19 pools)');
          t.eq(JSON.stringify(b), JSON.stringify(a), label + ': the same fight, bit for bit: the result, round, combat RNG state, Hype, every unit\'s HP and tile, the cheats');
          t.ok(a.cameos > 0, label + ': Svammiel\'s cameo played in it (' + a.cameos + ' lines)');
          if (P.tag === 'h19') {
            t.ok(party.indexOf('biz') < 0 || a.units.indexOf(CONSTRUCTS.biz[0]) >= 0 || a.units.indexOf(CONSTRUCTS.biz[1]) >= 0,
              label + ': Biz\'s robots were on the board (' + a.bots + ' standing or scrapped at the end)');
            t.log(label + ': ' + a.enc + ' ' + a.result + ' in round ' + a.round + ' · ' + a.units);
          }
        });
      });
    });
  });

  T.suite('integration: V3 — the campaign sim never forgets a shapeshift skill (Benedick\'s shell, Basanos\'s Transform, Ellaria\'s Wild Shape) nor, h19, one whose forgetWarning speaks', function (t) {
    const S = window.DD_SIM;
    if (!S || typeof S.replaceIdx !== 'function') { t.skip('tests/sim/sim.js not loaded'); return; }
    const shapes = vals(DD.defs.skills).filter(function (d) { return !isTest(d.id) && (d.tags || []).indexOf('shapeshift') >= 0; });
    t.ok(shapes.length >= 1, shapes.length + ' skills tagged shapeshift: ' + shapes.map(function (d) { return d.id; }).join(', '));
    if (DD.getHero('benedick')) t.ok(shapes.some(function (d) { return d.owner === 'benedick'; }), 'Benedick\'s shell is among them');
    const filler = vals(DD.defs.skills).filter(function (d) { return d.owner === 'generic' && (d.tags || []).indexOf('shapeshift') < 0; }).slice(0, 3).map(function (d) { return d.id; });
    shapes.forEach(function (d) {
      // the transform at level I in socket 0 (v2's rule — lowest level, ties to the first — forgot exactly this one)
      const rh = { skills: [{ id: d.id, level: 1 }].concat(filler.map(function (id, i) { return { id: id, level: 1 + (i % 2) }; })) };
      const i = S.replaceIdx(rh);
      t.ok(i > 0 && rh.skills[i].id !== d.id && rh.skills[i].level === 1, d.id + ': a new skill replaces ' + (rh.skills[i] ? rh.skills[i].id : i) + ', not the transform');
    });
    if (shapes.length) t.eq(S.replaceIdx({ skills: shapes.slice(0, 4).map(function (d) { return { id: d.id, level: 1 }; }) }), -1, 'with nothing but shapeshift skills the sim skips the new one (-1)');

    // h19 (plan .tmp/h19/plan.md D4): a skill whose forgetWarning resolves non-empty for that RunHero is never forgotten
    // either, read as the level-up forget picker reads it (DD.resolve(def.forgetWarning, null, rh, '')): Rasma's last
    // enchantment, Biz's Overclock. Three temporary test_ skills, removed after the check.
    if (!t.ok(typeof S.warns === 'function' && typeof S.isProtected === 'function', 'DD_SIM.warns and DD_SIM.isProtected exist (h19 D4)')) return;
    const KEY = 'test_h19_keystone', LAST = 'test_h19_last', OTHER = 'test_h19_other';
    function kindCount(rh) { return ((rh && rh.skills) || []).filter(function (s) { const d = DD.getSkill(s.id); return !!d && (d.tags || []).indexOf('test_h19_kind') >= 0; }).length; }
    function tmp(def) { return DD.registerSkill(Object.assign({ owner: 'test_knight', kind: 'utility', target: { type: 'self' }, execute: function () {} }, def)); }
    function withFiller(first) { return { skills: first.concat(filler.map(function (id, i) { return { id: id, level: 1 + (i % 2) }; })) }; }
    try {
      tmp({ id: KEY, name: 'Test Keystone (h19)', forgetWarning: 'Without it nothing works.' });
      tmp({ id: LAST, name: 'Test Last of Its Kind (h19)', tags: ['test_h19_kind'],
        forgetWarning: function (L, rh) { return kindCount(rh) === 1 ? 'The last of its kind.' : ''; } });
      tmp({ id: OTHER, name: 'Test Another of Its Kind (h19)', tags: ['test_h19_kind'] });
      // a string warning: kept at level I in socket 0 (where v2's rule would forget it), like a transform
      const rhKey = withFiller([{ id: KEY, level: 1 }]), iKey = S.replaceIdx(rhKey);
      t.ok(iKey > 0 && rhKey.skills[iKey].id !== KEY && rhKey.skills[iKey].level === 1, KEY + ' (a string forgetWarning): a new skill replaces ' + (rhKey.skills[iKey] ? rhKey.skills[iKey].id : iKey) + ', not it');
      t.ok(!S.isShapeshift(KEY) && S.warns(KEY, rhKey) && S.isProtected(KEY, rhKey), KEY + ': protected by its warning, not by a tag');
      // an (L, rh) => string warning speaks for the RunHero it is about: the last of its kind is kept, one of two is not
      const rhLast = withFiller([{ id: LAST, level: 1 }]), iLast = S.replaceIdx(rhLast);
      t.ok(iLast > 0 && rhLast.skills[iLast].id !== LAST, LAST + ': the last of its kind is kept (the new skill replaces ' + (rhLast.skills[iLast] ? rhLast.skills[iLast].id : iLast) + ')');
      t.eq(String(DD.resolve(DD.getSkill(LAST).forgetWarning, null, rhLast, '')), 'The last of its kind.', 'the forget picker would show the same words for that RunHero');
      const rhTwo = { skills: [{ id: LAST, level: 1 }, { id: OTHER, level: 1 }].concat(filler.slice(0, 2).map(function (id) { return { id: id, level: 2 }; })) };
      t.eq(S.warns(LAST, rhTwo), false, 'with another of its kind socketed the warning is silent');
      t.eq(S.replaceIdx(rhTwo), 0, '…so the sim may forget it (lowest level, ties to the first: socket 0)');
      t.eq(S.replaceIdx({ skills: [{ id: KEY, level: 1 }, { id: LAST, level: 1 }] }), -1, 'with nothing but protected skills the sim skips the new one (-1)');
      t.eq(S.warns(filler[0], rhKey), false, filler[0] + ' (no forgetWarning) is not protected');
    } finally {
      [KEY, LAST, OTHER].forEach(function (id) { delete DD.defs.skills[id]; });
    }
    t.ok(!DD.getSkill(KEY) && !DD.getSkill(LAST) && !DD.getSkill(OTHER), 'the temporary test_ skills are gone');
    // the protected set of the 17 shipped heroes (logged, not pinned): the forgetWarning rule adds none of theirs, since
    // today only Basanos's Transform and Benedick's shell carry a warning and both are tagged 'shapeshift'
    const NEW = ['rasma', 'biz', 'gus'];
    const shipped = ALL.filter(function (id) { return NEW.indexOf(id) < 0 && !!DD.getHero(id); });
    const byTag = [], byWarn = [], added = [];
    shipped.forEach(function (hid) {
      const h = DD.getHero(hid);
      h.skillPool.concat(h.startingSkills.filter(function (s) { return h.skillPool.indexOf(s) < 0; })).forEach(function (sid) {
        const rh = { id: hid, level: 1, skills: [{ id: sid, level: 1 }] };
        const tag = S.isShapeshift(sid), warn = S.warns(sid, rh);
        if (tag) byTag.push(sid);
        if (warn) byWarn.push(sid);
        if (warn && !tag) added.push(sid);
      });
    });
    t.log(shipped.length + ' shipped heroes: protected by the tag ' + (byTag.join(', ') || 'none') + '; warned about ' + (byWarn.join(', ') || 'none') +
      '; added by the forgetWarning rule ' + (added.length ? added.join(', ') + ' (the protected set of the 17 CHANGED)' : 'none (the protected set of the 17 is unchanged)'));
    NEW.forEach(function (hid) {
      const h = DD.getHero(hid);
      if (!h) { t.log(hid + ': not registered yet (the wave-0 stub)'); return; }
      const own = h.skillPool.concat(h.startingSkills.filter(function (s) { return h.skillPool.indexOf(s) < 0; }));
      const warned = own.filter(function (sid) { return S.warns(sid, { id: hid, level: 1, skills: [{ id: sid, level: 1 }] }); });
      t.log(hid + ': skills a lone socket keeps by their forgetWarning: ' + (warned.join(', ') || 'none'));
    });
    // h19 integrator (plan D4): the rule keeps the real keystones of the new kits. Rasma's ONLY enchantment (the last of
    // its kind) at level I in socket 0, where v2's rule would forget it; with two enchantments socketed neither speaks;
    // Biz's Overclock always (a string warning); Phat Gus has no keystone to keep
    if (DD.getHero('rasma')) {
      const ENCH = ['ras_cold_shoulder', 'ras_shocking', 'ras_disarming'];
      t.ok(ENCH.every(function (id) { const d = DD.getSkill(id); return !!d && d.forgetWarning !== undefined; }), 'Rasma\'s three enchantments carry a forgetWarning');
      const rest = DD.getHero('rasma').skillPool.filter(function (id) { return ENCH.indexOf(id) < 0; }).slice(0, 3);
      ENCH.forEach(function (e) {
        const rh = { id: 'rasma', level: 1, skills: [{ id: e, level: 1 }].concat(rest.map(function (id, i) { return { id: id, level: 1 + (i % 2) }; })) };
        const i = S.replaceIdx(rh);
        t.ok(S.isProtected(e, rh) && i > 0 && rh.skills[i].id !== e && rh.skills[i].level === 1, e + ' (his only enchantment): kept; a new skill replaces ' + (rh.skills[i] ? rh.skills[i].id : i));
      });
      const two = { id: 'rasma', level: 1, skills: [{ id: ENCH[0], level: 1 }, { id: ENCH[1], level: 2 }].concat(rest.slice(0, 2).map(function (id) { return { id: id, level: 2 }; })) };
      t.ok(!S.isProtected(ENCH[0], two) && !S.isProtected(ENCH[1], two) && S.replaceIdx(two) === 0, 'with two enchantments neither is protected: the sim may forget the level-I one (socket 0)');
      t.eq(S.replaceIdx({ id: 'rasma', level: 1, skills: [{ id: ENCH[2], level: 1 }] }), -1, 'with his one enchantment the only socket, the sim skips the new skill (-1)');
    } else t.log('rasma: not registered (isolated run): his keystone check is skipped');
    if (DD.getHero('biz')) {
      const rest = DD.getHero('biz').skillPool.filter(function (id) { return id !== 'biz_overclock'; }).slice(0, 3);
      const rh = { id: 'biz', level: 1, skills: [{ id: 'biz_overclock', level: 1 }].concat(rest.map(function (id, i) { return { id: id, level: 1 + (i % 2) }; })) };
      const i = S.replaceIdx(rh);
      t.ok(!S.isShapeshift('biz_overclock') && S.warns('biz_overclock', rh) && i > 0 && rh.skills[i].id !== 'biz_overclock',
        'Biz\'s Overclock (his heal) is kept by its forgetWarning; a new skill replaces ' + (rh.skills[i] ? rh.skills[i].id : i));
    } else t.log('biz: not registered (isolated run): his keystone check is skipped');
    if (DD.getHero('gus')) {
      const g = DD.getHero('gus');
      t.eq(g.skillPool.filter(function (id) { return S.isProtected(id, { id: 'gus', level: 1, skills: [{ id: id, level: 1 }] }); }).join(','), '', 'Phat Gus: no protected skill (nothing for the sim to keep)');
    }
    // review-contract (h19): the report's keep count names both kinds (the counter is still G.shapeshiftKept)
    if (typeof S.reportText === 'function' && typeof S.tally === 'function') {
      const kept = S.tally().shapeshiftKept;
      t.ok(new RegExp('skill replacements that kept a protected skill \\(shapeshift or forgetWarning, h19 D4\\) ' + kept + '(?!\\d)').test(S.reportText([])),
        'the sim report counts shapeshift and forgetWarning keeps under one label (' + kept + ' so far)');
    }
  });

  // =====================================================================================================================
  // h19: heroes 18-20 together (plan .tmp/h19/plan.md §2.3; D11 keeps each new hero's own suite free of the others)
  // =====================================================================================================================
  T.suite('integration: h19 — Biz\'s robots with Phat Gus: Cymbal Crash sets up the 7-damage bite, Fine, Have One hastes Spooder, and a robot next to him is no foe to stress-eat at', function (t) {
    if (!DD.getHero('biz') || !DD.getHero('gus') || !DD.Biz || !DD.Gus || !DD.getEnemy('test_grunt')) { t.skip('needs biz.js, gus.js and tests/fixtures.js (isolated run)'); return; }
    function arena(enemies) {
      DD.Combat.sandbox({ w: 9, h: 9, seed: 'int-h19', enemyAi: false, noPlan: true,
        heroes: [{ id: 'biz', x: 1, y: 4, level: 1, skills: [] }, { id: 'gus', x: 5, y: 4, level: 1, skills: [] }], enemies: enemies,
        objective: { type: 'custom', text: 'h19 together' }, encounter: { id: 'int_h19_arena', checkObjective: function () { return null; } } });
      const biz = DD.Combat.heroes().filter(function (u) { return u.defId === 'biz'; })[0];
      const gus = DD.Combat.heroes().filter(function (u) { return u.defId === 'gus'; })[0];
      return { biz: biz, gus: gus, hj: DD.Biz.constructOf(biz, 'hjalmarino'), sp: DD.Biz.constructOf(biz, 'spooder') };
    }
    function put(u, x, y) { return !!u && ((u.x === x && u.y === y) || DD.Act.teleport(u, x, y, { fx: false, noEnter: true })); }
    function slot(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0] || null; }
    function use(u, sl, x, y, label) {
      const why = sl ? DD.Combat.canUse(u, sl) : 'no slot';
      const ok = why === true && DD.Combat.useSkill(u, sl, x, y);
      t.ok(ok, label + ' (@' + x + ',' + y + (why === true ? '' : ': ' + why) + ')');
      return ok;
    }
    function lifts(fn) {
      const list = [], orig = DD.Act.heal;
      DD.Act.heal = function (src, target, n, opts) {
        const got = orig.apply(this, arguments);
        if (!DD.Act.simulating && opts && /^lift:/.test(String(opts.via))) list.push(String(opts.via) + '>' + (target && target.defId));
        return got;
      };
      try { fn(); } finally { DD.Act.heal = orig; }
      return list;
    }
    // 1. Hjalmarino's Cymbal Crash on Biz's turn, then Phat Gus's Incisor Decision on his: 7 against the Confused grunt,
    //    5 against the plain one beside it
    let a = arena([{ id: 'test_grunt', x: 4, y: 4, hpMult: 5 }, { id: 'test_grunt', x: 6, y: 4, hpMult: 5 }]);
    if (!t.ok(!!(a.biz && a.gus && a.hj && a.sp), 'premise: Biz, Phat Gus and both robots are on the board')) return;
    const mad = DD.Grid.unitAt(4, 4), calm = DD.Grid.unitAt(6, 4);
    t.ok(put(a.hj, 4, 3), 'premise: Hjalmarino next to the first grunt');
    DD.Combat.giveTurnTo(a.biz);
    use(a.hj, slot(a.hj, 'biz_cymbal_crash'), 4, 4, 'Hjalmarino crashes its cymbals at the grunt');
    t.ok(DD.Act.hasStatus(mad, 'confused'), 'the grunt is Confused');
    DD.Combat.giveTurnTo(a.gus);
    const m0 = mad.hp, c0 = calm.hp;
    use(a.gus, a.gus.basic, 4, 4, 'Phat Gus bites the Confused grunt');
    use(a.gus, a.gus.basic, 6, 4, 'Phat Gus bites the plain grunt');
    t.eq(m0 - mad.hp, 7, 'Incisor Decision deals 7 to the foe Hjalmarino Confused');
    t.eq(c0 - calm.hp, 5, '…and 5 to one it did not');
    // 2. Fine, Have One on Spooder: Hasted, so it has 1 more AP on Biz's next turn
    a = arena([{ id: 'test_grunt', x: 8, y: 8 }]);
    t.ok(put(a.sp, 5, 5), 'premise: Spooder next to Phat Gus');
    DD.Combat.giveTurnTo(a.gus);
    DD.Gus.setCheeks(a.gus, 2);
    a.gus.skills = [DD.Act.makeSlot('gus_have_one', 1)];
    use(a.gus, a.gus.skills[0], 5, 5, 'Phat Gus gives Spooder an acorn (reluctantly)');
    t.ok(DD.Act.hasStatus(a.sp, 'haste'), 'Spooder is Hasted');
    for (let i = 0; i < 12 && DD.Combat.current() !== a.biz && !DD.Combat.state.result; i++) DD.Combat.endTurn();
    const spAp = a.sp.ap;
    t.eq(spAp, a.sp.maxAp + 1, 'Spooder has ' + (a.sp.maxAp + 1) + ' AP on Biz\'s next turn (' + spAp + ')');
    // 3. the robots are his allies: eating with only Hjalmarino next to him heals nothing; with a grunt there, 3
    a = arena([{ id: 'test_grunt', x: 5, y: 7, hpMult: 5 }]);
    t.ok(put(a.hj, 5, 3) && put(a.sp, 4, 4), 'premise: both robots next to Phat Gus, the grunt 3 tiles away');
    DD.Combat.giveTurnTo(a.gus);
    DD.Gus.setCheeks(a.gus, 2);
    a.gus.hp = a.gus.maxHp - 5;
    a.gus.skills = [DD.Act.makeSlot('gus_root_canal', 1)];
    let got = lifts(function () { use(a.gus, a.gus.skills[0], 5, 7, 'Root Canal with only robots next to him'); });
    t.eq(got.join(','), '', 'no stress eating: a robot next to him is no foe');
    const g = DD.Grid.unitAt(5, 7);
    t.ok(put(g, 6, 4), 'premise: the grunt walks up next to him');
    DD.Combat.giveTurnTo(a.gus);
    DD.Gus.setCheeks(a.gus, 2);
    a.gus.skills = [DD.Act.makeSlot('gus_root_canal', 1)];
    got = lifts(function () { use(a.gus, a.gus.skills[0], 6, 4, 'Root Canal with the grunt next to him'); });
    t.eq(got.join(','), 'lift:gus>gus', 'stress eating with the grunt next to him: one lift:gus on himself');
    t.log('h19 together: Cymbal Crash → bite ' + (m0 - mad.hp) + ' (plain ' + (c0 - calm.hp) + '), Spooder ' + spAp + ' AP after Fine, Have One');
  });
})();

// h19 QA fixes (QA FIXER, core cluster, Nov 20): the engine's preview names the AP Overclock gives (QA-BIZ-6) and the
// signature log line has one bang (QA-BIZ-8), on Biz's real kit.
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  T.suite('integration: h19 QA — Overclock\'s preview gives the robot "+N AP" (the level\'s grant, +1 with the Universal Remote) and the real use agrees; "Biz unleashes Spoodmarino!" has one bang', function (t) {
    if (!DD.getHero('biz') || !DD.Biz || !DD.getEnemy('test_grunt') || !DD.getSkill('biz_overclock')) { t.skip('needs biz.js and tests/fixtures.js (isolated run)'); return; }
    function arena(items) {
      DD.Combat.sandbox({ w: 9, h: 9, seed: 'int-h19-qa', enemyAi: false, noPlan: true,
        heroes: [{ id: 'biz', x: 1, y: 4, level: 1, skills: [], items: items || [] }], enemies: [{ id: 'test_grunt', x: 8, y: 8, hpMult: 5 }],
        objective: { type: 'custom', text: 'h19 qa' }, encounter: { id: 'int_h19_qa', checkObjective: function () { return null; } } });
      const biz = DD.Combat.heroes().filter(function (u) { return u.defId === 'biz'; })[0];
      return { biz: biz, sp: biz && DD.Biz.constructOf(biz, 'spooder'), hj: biz && DD.Biz.constructOf(biz, 'hjalmarino') };
    }
    // fix:balance B3 (Nov 21): N reads the level (1 since Overclock's 2 → 1), never a literal
    const grant = DD.getSkill('biz_overclock').levels[0].ap;
    [[[], grant], [['biz_universal_remote'], grant + 1]].forEach(function (c) {
      const a = arena(c[0]);
      const tag = c[0].length ? ' (Universal Remote)' : '';
      if (!t.ok(!!(a.biz && a.sp && a.hj), 'premise: Biz and both robots' + tag)) return;
      DD.Combat.giveTurnTo(a.biz);
      const sl = DD.Act.makeSlot('biz_overclock', 1);
      a.biz.skills = [sl];
      [a.sp, a.hj].forEach(function (robot) {
        sl.cd = 0; sl.usedThisTurn = false;
        a.biz.ap = Math.max(a.biz.ap || 0, 1);
        const p = DD.Combat.preview(a.biz, sl, robot.x, robot.y);
        const e = p.perUnit[robot.id];
        t.ok(!!e && e.ap === c[1] && !e.apNext && !p.uncertain && e.text.indexOf('+' + c[1] + ' AP') === 0,
          'aim at ' + robot.name + tag + ': ap ' + c[1] + ', "' + (e && e.text) + '"');
        t.ok(!p.perUnit[a.biz.id], 'no entry for Biz\'s own 1 AP' + tag);
        t.log('Overclock → ' + robot.name + tag + ': "' + (e && e.text) + '"');
        const ap0 = robot.ap;
        t.ok(DD.Combat.useSkill(a.biz, sl, robot.x, robot.y) && robot.ap === ap0 + c[1], 'the real Overclock gives ' + robot.name + ' ' + c[1] + ' AP' + tag);
      });
    });
    // the signature's log line: one bang
    const a = arena();
    if (!a.biz || !a.biz.signature) { t.ok(false, 'premise: Biz has his signature'); return; }
    const def = DD.getSkill(a.biz.signature.id);
    DD.Combat.giveTurnTo(a.biz);
    DD.Combat.state.hype = 100;
    a.biz.ap = Math.max(a.biz.ap || 0, 3);
    const pts = DD.Targeting.validTargets(a.biz, a.biz.signature);
    const n0 = DD.Combat.state.log.length;
    const ok = pts.length > 0 && DD.Combat.useSkill(a.biz, a.biz.signature, pts[0].x, pts[0].y);
    // h19:gate: match the skill's own name; the narrator's cosmetic signature pool (DD.rng) has an "unleashes" line too
    const line = DD.Combat.state.log.slice(n0).filter(function (l) { return l.text.indexOf(' unleashes ' + def.name) >= 0; })[0];
    t.ok(ok && !!line && line.text === a.biz.name + ' unleashes ' + def.name && !/!!/.test(line.text), 'logged "' + (line && line.text) + '"');
  });
})();
