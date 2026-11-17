/* Dungeons and Degenerates — tests/content/boss_coven.js
 * Suites "boss_coven: …" for js/data/bosses/coven.js (THE COVEN, encounter boss_coven, plan .tmp/v3/design.md §3.4 /
 * §5.3 / §6.2): the registry and the encounter, the arena, the shared turn (E1: one entry, Mildred → Granny → Brine, the
 * split when the Eye drops), every skill against its desc, the Rite (Brew, Stir the Pot, the Hero Pie wind-up, its
 * interrupts, the tip), the Stirring Spots (held, held through a swap, the cook's AI), Hex Threads (geometry, sight,
 * damage, once a round, threatAt, zones), Into the Pot and the Swamp Gas Bubbles, Svammiel's The Floor Is Lava, the
 * voice (lengths, pronouns, named lines, banter, mourning), robustness and AutoPlay battles (real=1: random real parties
 * at L5.5 against the plan's band). Works isolated (&isolate=coven): the fixture heroes stand in for the party.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const ENC = 'boss_coven';
  const IDS = ['cov_mildred', 'cov_granny', 'cov_brine'];
  const NAMES = { cov_mildred: 'Cousin Mildred', cov_granny: 'Granny Gristle', cov_brine: 'Auntie Brine' };
  const SPOTS = ['7,4', '6,5', '8,5', '7,6'];
  const LV = 5.5;

  // ---- helpers --------------------------------------------------------------------------------------------------
  function C() { return DD.Coven; }
  function S() { return DD.Combat.state; }
  function ready(t) {
    if (!DD.Coven || !DD.getEncounter(ENC)) { t.skip('js/data/bosses/coven.js not loaded'); return false; }
    if (!DD.getHero('test_knight')) { t.skip('needs tests/fixtures.js'); return false; }
    return true;
  }
  function act(fn) { return DD.Combat._action(fn); }
  /** Run heroes at a level (5.5 = alternately 5 and 6, plan §7.1's author band), skills as the rotation would give them. */
  function partyAt(level, ids) {
    return (ids || PARTY).map(function (id, i) {
      const h = DD.getHero(id);
      const lv = level % 1 ? (i % 2 ? Math.ceil(level) : Math.floor(level)) : level;
      const boons = Math.max(0, lv - 1), learn = Math.min(2, boons);
      const list = h.startingSkills.concat(h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, learn));
      const skills = list.map(function (s) { return { id: s, level: 1 }; });
      for (let k = 0, up = boons - learn; up > 0 && k < 12; k++) {
        const sk = skills[k % skills.length];
        if (sk.level < Math.min(3, DD.getSkill(sk.id).levels.length)) { sk.level++; up--; }
      }
      return DD.Combat.makeRunHero({ id: id, level: lv, skills: skills });
    });
  }
  /** BAL (V3): the author bands measure the content numbers, so a real=1 author sim runs without DD.Balance's act-4
   *  campaign rows (the act row and this encounter's row, boss_dm.js's bare() pattern); balance=1 keeps them. */
  function bareRows(on, start) {
    const B = DD.Balance, k = DD.MAX_ACT;
    if (!on || !B || DD.params.balance === '1') return start();
    const a = B.act && B.act[k], row = B.encounters && B.encounters[ENC];
    if (a) B.act[k] = { hp: 1, dmg: 1 };
    if (row) delete B.encounters[ENC];
    try { return start(); } finally { if (a) B.act[k] = a; if (row) B.encounters[ENC] = row; }
  }
  /** The real encounter. Default: a scripted fight (no deployment, heroes first, no cameo). opts.real: the real path. */
  function startFight(seed, opts) {
    opts = opts || {};
    const diff = opts.diff || 'normal';
    const setup = DD.Encounter.build(ENC, partyAt(opts.level || LV, opts.ids), { rng: DD.RNG('cov:' + seed), difficulty: diff, act: 4 });
    const o = { seed: seed, headless: true, difficulty: diff, kind: 'boss' };
    if (!opts.cameo) o.cameo = false;
    if (!opts.real) { o.sandbox = true; o.initiative = 'heroesFirst'; }
    return DD.Combat.start(setup, o);
  }
  function unit(defId) { return S().units.filter(function (u) { return u.defId === defId && !u.dead; })[0]; }
  function heroes() { return S().units.filter(function (u) { return u.kind === 'hero' && !u.dead; }); }
  function put(u, x, y) { return u.x === x && u.y === y ? true : DD.Act.teleport(u, x, y, { noEnter: true, fx: false }); }
  /** Move every hero far from the cauldron (the deploy rows' corners), so tests place only the ones they need. */
  function park(list) {
    const corners = [[1, 12], [2, 12], [12, 12], [11, 12], [0, 11], [13, 11]];
    (list || heroes()).forEach(function (h, i) { put(h, corners[i][0], corners[i][1]); });
  }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function key(p) { return p.x + ',' + p.y; }
  function D() { return C().data(S()); }
  /** Damage records (target, base, dealt, cause, skill, element) while fn runs. */
  function hits(fn) {
    const out = [];
    DD.Act.addRule({ id: 'test_cov_hits', name: 'Test hits', silent: true, hooks: { onTakeDamage: function (d) {
      out.push({ target: d.target, base: d.base, dealt: d.dealt, cause: d.cause, skill: d.skill ? d.skill.id : null, element: d.element, amount: d.amount });
    } } });
    try { fn(); } finally { DD.Act.removeRule('test_cov_hits'); }
    out.of = function (u) { return out.filter(function (h) { return h.target === u; }); };
    return out;
  }
  function useNow(u, id, target) { return act(function () { return DD.AI.useNow(u, id, target); }); }
  function land(u, it) { return act(function () { return DD.AI.executeIntent(u, it); }); }
  function windup(u, id) { return (u.intents || []).filter(function (i) { return i.skillId === id; })[0] || null; }
  function bare(u) { u.armor = 0; u.block = 0; (u.statuses || []).slice().forEach(function (st) { DD.Act.removeStatus(u, st.id, { silent: true }); }); }
  function sentences(s) { return String(s).split(/(?<=[.!?…])\s+|\n/); }
  function m() { return (DD.Combat.state && DD.Combat.state.difficulty && DD.Combat.state.difficulty.dmg) || 1; }
  /** A skill's level-1 numbers (the descs and the hits read them). */
  function Lv(id) { return DD.skillLevel(DD.getSkill(id), 1); }
  /** A scripted fight with the AI off and the heroes parked: the board the mechanics tests start from. */
  function board(seed) {
    const s = startFight(seed);
    s.aiOff = true;
    park();
    heroes().forEach(bare);
    return s;
  }

  // ---- registry and the encounter --------------------------------------------------------------------------------
  T.suite('boss_coven: registry, the three hags and the encounter', function (t) {
    if (!ready(t)) return;
    let total = 0;
    IDS.forEach(function (id) {
      const d = DD.getEnemy(id);
      if (!t.ok(!!d, id + ' registered')) return;
      t.eq(d.name, NAMES[id], id + ': the plan\'s name');
      t.ok(d.act === 4 && d.tier === 'elite' && !d.boss, id + ': an act-4 elite with no boss field (squad rules, plan §3.0.1)');
      t.ok(d.tags.indexOf('coven') >= 0, id + ': tagged coven');
      t.eq(d.pronoun, 'she', id + ': pronoun she (plan §0.2)');
      t.ok(typeof d.ai === 'function' && !!d.passive && typeof d.passive.desc === 'function', id + ': a custom planner and a live passive line');
      t.ok(typeof d.desc === 'string' && d.desc.length > 60, id + ': a codex desc');
      t.ok((d.skills || []).indexOf('cov_stir') >= 0, id + ': every hag can Stir the Pot');
      total += d.hp;
    });
    t.eq(JSON.stringify(IDS.map(function (id) { return DD.getEnemy(id).hp; })), JSON.stringify(IDS.map(function (id) { return C().N.hp[id]; })), 'the defs read DD.Coven.N.hp');
    t.ok(total >= 300 && total <= 340, 'squad total ' + total + ' HP (plan §3.4: 320)');
    t.ok(DD.getEnemy('cov_mildred').flags.flying === true, 'Mildred flies (Granny\'s broom)');
    t.ok(!DD.getEnemy('cov_mildred').actsWithOwner && DD.getEnemy('cov_granny').actsWithOwner === true && DD.getEnemy('cov_brine').actsWithOwner === true,
      'Granny and Brine act with their owner (E1); Mildred holds the turn');
    t.eq(DD.getEnemy('cov_mildred').init, 1, 'Mildred: initiative +1 (the Coven\'s entry)');
    t.eq(DD.getEnemy('cov_granny').armor, 1, 'Granny: armor 1');
    const e = DD.getEncounter(ENC);
    t.eq(e.name, 'Tea with the Coven', 'encounter name');
    t.ok(e.shortName === 'The Coven' && e.shortName.length <= 24, 'shortName "The Coven"');
    t.ok(e.act === 4 && e.kind === 'boss' && e.weight === 0, 'act 4, a boss fight, weight 0 (only the gauntlet places it)');
    t.ok(e.gauntlet && e.gauntlet.lane === 'coven' && e.gauntlet.order === 4 && e.gauntlet.hint === 'Hold the cauldron. Break their line of sight.',
      'gauntlet lane coven, order 4, the hint');
    t.ok(e.icon === '🫖' && e.banner === false, 'icon 🫖, banner false (the cameo shows it)');
    t.ok(e.cameo && e.cameo.start === 'svam_cameo_coven' && e.cameo.cheat === 'svam_cameo_lava', 'cameo: announcer svam_cameo_coven, cheat svam_cameo_lava');
    t.ok(e.reward && e.reward.goldMult === 0.9 && e.reward.itemRarity === 'rare', 'reward: a guaranteed rare, boss gold × 0.9 (lead patch P5)');
    t.eq(JSON.stringify(e.objective.bossIds), JSON.stringify(IDS), 'objective.bossIds names the three');
    t.ok(e.objective.type === 'boss' && !e.objective.bossId, 'a squad boss objective (no boss-tier unit needed)');
    Object.keys(C().SK).forEach(function (k) { const s = DD.getSkill(C().SK[k]); t.ok(!!s && s.owner === 'enemy', C().SK[k] + ': an enemy skill'); });
    t.ok(DD.getSkill('cov_pie').windupOnly === true && DD.getSkill('cov_thread').windupOnly === true, 'the Hero Pie and the thread are never used at once');
    t.ok(/^Wind-up/.test(DD.skillDesc(DD.getSkill('cov_pie'), 1, null)), 'the Hero Pie\'s desc says it is a wind-up');
    // the codex things (plan §5.8): the Family Cauldron and the Eye; spots, bubbles and the cottage stay out
    t.ok(DD.getObject('cov_cauldron').codex === true && DD.getObject('cov_the_eye').codex === true, 'the codex lists the Family Cauldron and the Eye');
    t.ok(/Cousin Mildred has it\. She is USING it\./.test(DD.getObject('cov_the_eye').desc), 'the Eye\'s codex line (plan §5.3)');
    ['cov_spot', 'cov_bubble', 'cov_cottage'].forEach(function (id) { t.ok(DD.getObject(id).codex === false, id + ' stays out of the codex'); });
    t.ok(DD.getObject('cov_bubble').volatile === true && /Explodes/.test(DD.getObject('cov_bubble').desc), 'the Swamp Gas Bubble is volatile and says so');
    t.ok(DD.getObject('cov_cauldron').hp === 0 && DD.getObject('cov_spot').hp === 0, 'the cauldron and the spots can\'t be broken');
  });

  // ---- the arena ------------------------------------------------------------------------------------------------
  T.suite('boss_coven: the bog garden (layout, spawns, cauldron, spots, bubbles, the Eye, the chip)', function (t) {
    if (!ready(t)) return;
    const s = startFight(1);
    const g = s.grid;
    t.ok(g.w === 14 && g.h === 13, 'a 14 × 13 arena');
    t.eq(key(unit('cov_mildred')), '7,2', 'Mildred spawns at (7,2)');
    t.eq(key(unit('cov_granny')), '4,4', 'Granny spawns at (4,4)');
    t.eq(key(unit('cov_brine')), '10,4', 'Brine spawns at (10,4)');
    const tl = function (x, y) { return DD.Grid.tile(x, y); };
    t.ok(tl(7, 5).obj && tl(7, 5).obj.id === 'cov_cauldron', 'the Family Cauldron at (7,5)');
    t.eq(key(C().pot(s)), '7,5', 'DD.Coven.pot');
    t.eq(C().spots(s).map(key).sort().join(' '), SPOTS.slice().sort().join(' '), 'four Stirring Spots: the cauldron\'s neighbours');
    t.eq(g.tiles.filter(function (x) { return x.obj && x.obj.id === 'cov_bubble'; }).map(key).sort().join(' '), ['2,3', '13,3', '5,8', '10,8'].sort().join(' '), 'four Swamp Gas Bubbles');
    t.ok(tl(2, 1).obj && tl(2, 1).obj.id === 'cov_cottage' && DD.Grid.blocksLos(2, 1), 'the gingerbread cottage at (2,1) blocks sight');
    t.eq(g.tiles.filter(function (x) { return x.obj && x.obj.id === 'tree'; }).length, 6, 'six gnarled trees');
    t.ok(tl(0, 5).t === 'water' && tl(13, 6).t === 'water' && tl(6, 1).t === 'water', 'the pools');
    t.ok(tl(3, 0).t === 'cov_bog' && tl(5, 5).t === 'cov_bog' && DD.Grid.terrain(tl(5, 5)).cost === 2, 'bog (cost 2)');
    t.ok(heroes().every(function (u) { return u.y >= 10; }), 'the heroes deploy at the south end');
    // the cameo's lava patch (x 6-8, y 7-9) is plain walkable floor without objects
    let patch = 0;
    for (let y = 7; y <= 9; y++) for (let x = 6; x <= 8; x++) { const q = tl(x, y); if (q && !q.obj && DD.Grid.terrain(q).walkable !== false && !DD.Grid.terrain(q).liquid) patch++; }
    t.eq(patch, 9, 'the Floor Is Lava patch: 9 open floor tiles on the path to the cauldron');
    const d = D();
    t.ok(!!d && d.brew === 0 && d.eye === true && !d.pie && !d.tipped, 'state.data.coven: Brew 0, the Eye held');
    t.ok(has(unit('cov_mildred'), 'cov_eye'), 'Mildred wears The Eye');
    t.ok(unit('cov_granny').ownerId === unit('cov_mildred').id && unit('cov_brine').ownerId === unit('cov_mildred').id, 'Granny and Brine are owned by Mildred (E1)');
    const r = s.rules.filter(function (x) { return x.id === 'cov_coven'; })[0];
    t.ok(!!r && r.icon === '🧪' && r.name === 'Brew 0/6 · threads 3', 'the live chip: ' + (r && r.name));
    t.ok(!!r && r.desc === C().ruleDesc(), 'the chip\'s desc is the rule text');
    t.ok(/^Brew 0\/6\./.test(s.objective.flavor), 'the objective flavour line shows the Brew');
    t.ok(/Coven \(3 left\)/.test(s.objective.text), 'objective text: ' + s.objective.text);
    t.ok(S().log.some(function (l) { return /Granny Gristle: "Oh, visitors!/.test(l.text); }), 'Granny\'s intro line');
    t.eq((s.data.zones || []).filter(function (z) { return /^cov_thread:/.test(z.id); }).length, 3, 'three thread zones (E8: state.data.zones)');
  });

  // ---- E1: one entry, the split -----------------------------------------------------------------------------------
  T.suite('boss_coven: one shared turn (E1) — Mildred → Granny → Brine; her death drops the Eye and splits the turn', function (t) {
    if (!ready(t)) return;
    const s = startFight(2);
    const mi = unit('cov_mildred'), gr = unit('cov_granny'), br = unit('cov_brine');
    const hagEntries = function () { return (s.order || []).filter(function (e) { const u = DD.Combat.byId(e.unitId); return u && IDS.indexOf(u.defId) >= 0; }); };
    t.ok(hagEntries().length === 1 && hagEntries()[0].unitId === mi.id, 'one initiative entry for the Coven: Mildred\'s');
    t.ok(DD.Combat.turnOwner(gr) === mi && DD.Combat.turnOwner(br) === mi, 'Granny and Brine act on Mildred\'s turn');
    t.eq(DD.Combat.groupOf(mi).map(function (u) { return u.defId; }).join(','), IDS.join(','), 'the turn group: Mildred, Granny, Brine');
    // who acts, in which order, over one round
    const seen = [], orig = DD.AI.act;
    DD.AI.act = function (u) { if (IDS.indexOf(u.defId) >= 0) seen.push(u.defId); return orig.apply(DD.AI, arguments); };
    try { act(function () { DD.Combat.endRound(); }); } finally { DD.AI.act = orig; }
    t.eq(seen.slice(0, 3).join(','), IDS.join(','), 'round 1: Mildred, then Granny, then Brine (' + seen.join(',') + ')');
    t.eq(seen.length, 3, 'each hag acts once a round');
    // Mildred falls: the Eye rolls under the dresser
    s.aiOff = true;
    const h = heroes()[0];
    act(function () { DD.Act.kill(mi, h); });
    t.ok(mi.dead && D().eye === false && D().stats.eyeDropped === 1, 'the Eye is dropped');
    t.ok(S().log.some(function (l) { return /The Eye rolls under the dresser\. Granny Gristle and Auntie Brine take their own turns from the next round\./.test(l.text); }),
      'the log says so');
    act(function () { DD.Combat.endRound(); });
    const after = hagEntries().map(function (e) { return DD.Combat.byId(e.unitId).defId; }).sort();
    t.eq(after.join(','), ['cov_brine', 'cov_granny'].join(','), 'from the next round Granny and Brine have entries of their own');
    t.ok(DD.Combat.turnOwner(gr) === gr && DD.Combat.turnOwner(br) === br, 'each hag owns her turn now');
  });

  // ---- the skills -------------------------------------------------------------------------------------------------
  T.suite('boss_coven: the skills — Bedtime Hex, Night Terror, Cheek Pinch, Eat Your Greens, Undertow, I Was Beautiful Once', function (t) {
    if (!ready(t)) return;
    board(3);
    const mi = unit('cov_mildred'), gr = unit('cov_granny'), br = unit('cov_brine');
    const [a, b, c] = heroes();
    const f = m();
    // Bedtime Hex: Asleep until the end of the Coven's next turn (whatever the order, it loses its next turn)
    put(a, 7, 6); put(mi, 7, 2);
    t.ok(DD.Grid.los(mi, a) && DD.Grid.dist(mi, a) <= 5, 'setup: a hero 4 tiles from Mildred, in sight');
    useNow(mi, 'cov_bedtime', a);
    const sl = a.statuses.filter(function (x) { return x.id === 'sleep'; })[0];
    t.ok(!!sl && sl.turns === -1 && sl.data.covSleep === true && DD.Act.isStunned(a), 'Bedtime Hex: Asleep (until the Coven wakes it)');
    act(function () { C().turnEnd(mi); });
    t.ok(has(a, 'sleep'), 'still asleep at the end of the Coven turn it was cast in');
    act(function () { DD.Combat.endRound(); });
    t.ok(!has(a, 'sleep'), 'awake at the end of the Coven\'s next turn (' + S().round + ')');
    useNow(mi, 'cov_bedtime', a);
    // Night Terror: its number, or the sleeper's number (and it wakes up); the reach estimate shows the sleeper's
    const reach = DD.AI.reachOf(mi);
    const rv = reach.units.get ? reach.units.get(a.id) : null;
    t.eq(rv, Math.round(Lv('cov_terror').sleepDmg * f), 'Night Terror\'s reach on the sleeper reads ' + Math.round(Lv('cov_terror').sleepDmg * f) + ' (the skill\'s telegraphFlat)');
    let hs = hits(function () { useNow(mi, 'cov_terror', a); });
    t.ok(hs.of(a).length === 1 && hs.of(a)[0].base === Lv('cov_terror').sleepDmg && hs.of(a)[0].element === 'psychic', 'Night Terror on a sleeper: base sleepDmg, psychic');
    t.ok(!has(a, 'sleep'), 'and it wakes up');
    hs = hits(function () { useNow(mi, 'cov_terror', a); });
    t.ok(hs.of(a).length === 1 && hs.of(a)[0].base === Lv('cov_terror').dmg, 'Night Terror on an awake hero: base dmg');
    // Cheek Pinch: damage and Rooted through its next turn
    put(gr, 3, 8); put(b, 4, 8);
    hs = hits(function () { useNow(gr, 'cov_pinch', b); });
    t.ok(hs.of(b).length === 1 && hs.of(b)[0].base === Lv('cov_pinch').dmg, 'Cheek Pinch: its number');
    const rt = b.statuses.filter(function (x) { return x.id === 'root'; })[0];
    t.ok(!!rt && rt.turns === 1, 'Cheek Pinch: Rooted, 1 turn');
    t.ok(DD.Act.opportunitySlot(gr) && DD.Act.opportunitySlot(gr).id === 'cov_pinch', 'Cheek Pinch is Granny\'s attack of opportunity');
    // Eat Your Greens: damage, the ground within 1 of the target turns to bog (walkable ground only)
    bare(b); put(b, 4, 9); put(gr, 4, 12);
    const want = DD.Grid.shape('circle', { x: 4, y: 9 }, null, 1).filter(function (q) {
      const tt = DD.Grid.tile(q.x, q.y), td = DD.Grid.terrain(tt);
      return tt.t !== 'cov_bog' && !(tt.obj && DD.Grid.objBlocksMove(tt.obj)) && td.walkable !== false && !td.liquid;
    }).map(key).sort();
    hs = hits(function () { useNow(gr, 'cov_greens', b); });
    t.ok(hs.of(b).length === 1 && hs.of(b)[0].base === Lv('cov_greens').dmg, 'Eat Your Greens: its number');
    t.ok(want.length === 5 && want.every(function (k) { const p = k.split(','); return DD.Grid.tile(+p[0], +p[1]).t === 'cov_bog'; }), 'the ground within 1 turns to bog (' + want.join(' ') + ')');
    t.ok(DD.Grid.tile(4, 9).t === 'cov_bog', 'the target\'s own tile too');
    const nearTree = C().bogTiles({ x: 3, y: 7 }).map(key);
    t.ok(nearTree.indexOf('2,7') < 0 && nearTree.indexOf('3,7') >= 0, 'next to a tree: the tree\'s tile is no ground for bog (' + nearTree.join(' ') + ')');
    t.ok(C().bogTiles({ x: 1, y: 5 }).every(function (q) { return !DD.Grid.terrain(DD.Grid.tile(q.x, q.y)).liquid; }), 'nor is a pool');
    // Undertow: damage and pulled 2 toward Brine
    bare(c); put(c, 12, 4); put(br, 8, 4);
    hs = hits(function () { useNow(br, 'cov_undertow', c); });
    t.ok(hs.of(c).length === 1 && hs.of(c)[0].base === Lv('cov_undertow').dmg, 'Undertow: its number');
    t.eq(key(c), '10,4', 'Undertow: pulled 2 tiles toward her');
    // I Was Beautiful Once: Confused, every foe within 2 that can see her
    bare(a); bare(b); bare(c);
    put(br, 11, 9); put(a, 12, 9); put(b, 11, 10); put(c, 1, 11);
    useNow(br, 'cov_visage', br);
    t.ok(has(a, 'confused') && has(b, 'confused') && !has(c, 'confused'), 'I Was Beautiful Once: the two heroes next to her are Confused, the far one not');
    const cf = a.statuses.filter(function (x) { return x.id === 'confused'; })[0];
    t.ok(!!cf && cf.turns === 1, 'Confused for 1 turn');
    // sight: a hero behind the cottage
    board(4);
    const br2 = unit('cov_brine'), h2 = heroes()[0];
    put(br2, 2, 2); put(h2, 2, 0);
    t.ok(!DD.Grid.los(h2, br2) && DD.Grid.dist(h2, br2) === 2, 'setup: 2 tiles away, the cottage in between');
    useNow(br2, 'cov_visage', br2);
    t.ok(!has(h2, 'confused'), 'a hero who can\'t see her is not Confused');
    // descs at every level show their numbers (the content suite checks the dmg; the riders here)
    const dz = function (id) { return DD.skillDesc(DD.getSkill(id), 1, null); };
    t.eq(dz('cov_bedtime'), 'A foe within 5 falls Asleep until the end of the Coven\'s next turn, so it loses its next turn (damage wakes it).', 'Bedtime Hex desc');
    t.eq(dz('cov_terror'), 'Deal ' + Lv('cov_terror').dmg + ' psychic damage to a foe within 5, or ' + Lv('cov_terror').sleepDmg + ' if it is asleep (it wakes up).', 'Night Terror desc');
    t.eq(dz('cov_pinch'), 'Deal ' + Lv('cov_pinch').dmg + ' damage to an adjacent foe and Root it through its next turn.', 'Cheek Pinch desc');
    t.eq(dz('cov_greens'), 'Fling mud at a foe within 4: ' + Lv('cov_greens').dmg + ' damage, and the ground within 1 of it turns to bog for the rest of the fight.', 'Eat Your Greens desc');
    t.eq(dz('cov_undertow'), 'Deal ' + Lv('cov_undertow').dmg + ' damage to a foe within 4 and pull it 2 tiles toward her.', 'Undertow desc');
    t.eq(dz('cov_pie'), 'Wind-up (Brew 6): next Coven turn the cauldron boils over: ' + Lv('cov_pie').dmg + ' damage to each hero and hero summon, and each is ' +
      'Slowed (−1 AP) on its next turn; the Brew resets. Interrupt the cook (stun, sleep, freeze, sheep) and the Brew drops to 3; tip the cauldron and it fizzles.', 'Hero Pie desc');
    // the plan's numbers after the author sims (docs/notes/boss-coven.md): every squad hit in the act-4 band (7-11)
    ['cov_terror', 'cov_pinch', 'cov_greens', 'cov_undertow', 'cov_thread'].forEach(function (id) { t.ok(Lv(id).dmg >= 7 && Lv(id).dmg <= 11, id + ': ' + Lv(id).dmg + ' in the band 7-11'); });
    t.eq(dz('cov_visage'), 'Every foe within 2 that can see her is Confused through its next turn (moving costs 2 AP).', 'I Was Beautiful Once desc');
    t.eq(dz('cov_stir'), 'Next to the cauldron (Brew below 6): the Brew rises by 1 and she sips 6 HP.', 'Stir the Pot desc');
    // the fight's scaled numbers (P3): the passive lines read DD.AI.fightLevel
    const pm = DD.getEnemy('cov_granny').passive.desc(unit('cov_granny'));
    t.ok(pm.indexOf('Cheek Pinch (' + DD.AI.fightLevel(DD.getSkill('cov_pinch'), 1, unit('cov_granny')).dmg + ',') >= 0, 'Granny\'s passive prints the fight\'s Pinch number');
  });

  // ---- Stir the Pot, the Hero Pie ---------------------------------------------------------------------------------
  T.suite('boss_coven: the Rite — Stir the Pot, Brew 6, the Hero Pie wind-up, its landing and every interrupt', function (t) {
    if (!ready(t)) return;
    let s = board(5);
    let mi = unit('cov_mildred'), gr = unit('cov_granny');
    // Stir the Pot: only on a spot next to an upright cauldron, below Brew 6
    t.eq(C().stirWhy(gr), 'Only from a Stirring Spot next to the cauldron.', 'off the spots: refused with a reason');
    t.ok(!DD.AI.api(gr).canUse(gr, 'cov_stir'), 'the AI can\'t pick it off a spot');
    put(gr, 6, 5);
    t.ok(DD.AI.api(gr).canUse(gr, 'cov_stir'), 'on a spot it can');
    gr.hp = gr.maxHp - 10;
    useNow(gr, 'cov_stir', gr);
    t.ok(D().brew === 1 && gr.hp === gr.maxHp - 4, 'Stir the Pot: Brew +1 and she sips 6 HP (Brew ' + D().brew + ', HP ' + gr.hp + '/' + gr.maxHp + ')');
    t.ok(D().stats.stirs === 1, 'stat: stirs');
    const r = s.rules.filter(function (x) { return x.id === 'cov_coven'; })[0];
    t.ok(/^Brew 1\/6/.test(r.name) && /^Brew 1\/6/.test(s.objective.flavor), 'the chip and the flavour line follow the Brew');
    C().setBrew(6);
    t.eq(C().stirWhy(gr), 'The Brew is ready: it only needs the cook.', 'at Brew 6 nobody stirs');
    // Brew 6 at the end of the Coven's turn: the Eye-holder winds up the Hero Pie
    act(function () { C().turnEnd(mi); });
    const it = windup(mi, 'cov_pie');
    t.ok(!!it && D().pie && D().pie.unitId === mi.id, 'the Eye-holder winds up the Hero Pie');
    t.eq(DD.AI.intentTiles(mi, it).length, s.grid.w * s.grid.h, 'its marked tiles: the whole board');
    t.ok(/Hero Pie is cooking/.test(s.objective.flavor), 'the flavour line warns');
    act(function () { C().turnEnd(mi); });
    t.eq((mi.intents || []).filter(function (i) { return i.skillId === 'cov_pie'; }).length, 1, 'one pie at a time');
    // the landing: each hero and hero summon takes the marked number and is Slowed; the Brew resets
    const show = DD.AI.intentDmg(mi, it);
    t.eq(show, Math.round(Lv('cov_pie').dmg * m()), 'the wind-up shows ' + show);
    const hs = hits(function () { land(mi, it); });
    t.ok(heroes().every(function (h) { return hs.of(h).length === 1 && hs.of(h)[0].dealt === show; }), 'every hero takes exactly what the wind-up showed (' + show + ')');
    t.ok(heroes().every(function (h) { const sw = h.statuses.filter(function (x) { return x.id === 'slow'; })[0]; return !!sw && sw.turns === 1; }), 'every hero is Slowed for its next turn');
    t.ok(!hs.some(function (x) { return IDS.indexOf(x.target.defId) >= 0; }), 'no hag is hit');
    t.ok(D().brew === 0 && !D().pie && D().stats.pieLanded === 1, 'the Brew resets');
    // a stun on the cook: the Brew drops to 3
    [['stun', 'stun'], ['sleep', 'sleep'], ['frozen', 'frozen'], ['sheep', 'sheep']].forEach(function (k) {
      s = board(6);
      mi = unit('cov_mildred');
      C().setBrew(6);
      act(function () { C().turnEnd(mi); });
      t.ok(!!windup(mi, 'cov_pie'), k[0] + ': the pie is cooking');
      act(function () { DD.Act.addStatus(mi, k[1], { turns: 1 }, heroes()[0]); });
      t.ok(!windup(mi, 'cov_pie') && !D().pie && D().brew === 3, k[0] + ' on the cook: interrupted, Brew 3 (Brew ' + D().brew + ')');
    });
    // the cook falls: the pie dies with her, the Brew stays (Into the Pot: +2, capped)
    s = board(7);
    mi = unit('cov_mildred');
    C().setBrew(6);
    act(function () { C().turnEnd(mi); });
    act(function () { DD.Act.kill(mi, heroes()[0]); });
    t.ok(!D().pie && D().brew === 6, 'the cook falls: no pie, Brew 6 stays');
    // the next Coven turn (each hag's own now): the next hag cooks
    gr = unit('cov_granny');
    act(function () { DD.Combat.endRound(); });
    t.ok(DD.Combat.turnOwner(gr) === gr, 'Granny has her own turn now');
    act(function () { C().turnEnd(gr); });
    t.ok(!!windup(gr, 'cov_pie'), 'Granny winds up the pie at the end of her own turn');
    // a charmed or stunned Eye-holder: the next hag of the turn cooks
    s = board(8);
    mi = unit('cov_mildred'); gr = unit('cov_granny');
    act(function () { DD.Act.addStatus(mi, 'stun', { turns: 1 }, heroes()[0]); });
    C().setBrew(6);
    act(function () { C().turnEnd(mi); });
    t.ok(!windup(mi, 'cov_pie') && !!windup(gr, 'cov_pie'), 'the Eye-holder stunned: Granny cooks instead');
  });

  // ---- the cauldron -----------------------------------------------------------------------------------------------
  T.suite('boss_coven: the Family Cauldron — Tip Over (2 AP): the pie fizzles, the splash, upright after the next round', function (t) {
    if (!ready(t)) return;
    const s = board(9);
    const mi = unit('cov_mildred'), gr = unit('cov_granny'), br = unit('cov_brine');
    const h = heroes()[0];
    act(function () { DD.Combat.giveTurnTo(h); });
    put(h, 7, 6); put(gr, 6, 5); put(br, 8, 5);
    h.ap = 3; h.block = 0;   // the fixture knight gains 3 Block on his round-1 turn
    [gr, br].forEach(bare);
    const ix = DD.Combat.interactions(h).filter(function (x) { return x.x === 7 && x.y === 5; })[0];
    t.ok(!!ix && ix.label === 'Tip Over' && ix.ap === 2 && ix.kind === 'object', 'next to it: Tip Over, 2 AP');
    C().setBrew(6);
    act(function () { C().turnEnd(mi); });
    t.ok(!!windup(mi, 'cov_pie'), 'the pie is cooking');
    t.ok(C().tipValue(h, C().pot(s).obj, C().pot(s), s, 'interact') > 30, 'AutoPlay: tipping during the pie is worth a lot (' + C().tipValue(h, C().pot(s).obj, C().pot(s), s, 'interact') + ')');
    const hp = { h: h.hp, gr: gr.hp, br: br.hp };
    const ok = DD.Combat.interact(h, 7, 5);
    t.ok(ok && h.ap === 1, 'Tip Over costs 2 AP');
    t.ok(!windup(mi, 'cov_pie') && !D().pie && D().brew === 0, 'the pie fizzles and the Brew drops to 0');
    t.ok(h.hp === hp.h - 8 && gr.hp === hp.gr - 8 && br.hp === hp.br - 8, 'everyone within 1 takes 8 (the tipper included): ' + [hp.h - h.hp, hp.gr - gr.hp, hp.br - br.hp].join('/'));
    t.ok([h, gr, br].every(function (u) { const p = u.statuses.filter(function (x) { return x.id === 'poison'; })[0]; return p && p.stacks === 2; }), 'and is Poisoned 2');
    t.ok(D().tipped === s.round + 1 && D().stats.tipped === 1 && D().stats.pieTipped === 1, 'tipped until the end of the next round');
    t.eq(C().stirWhy(gr), 'The cauldron is tipped over.', 'nobody can stir a tipped cauldron');
    t.ok(!DD.Combat.interactions(h).some(function (x) { return x.label === 'Tip Over'; }), 'a tipped cauldron can\'t be tipped again');
    t.ok(/tipped over/.test(s.objective.flavor) && /tipped over/.test(C().pot(s).obj.label), 'the flavour line and the cauldron\'s label say so');
    act(function () { DD.Combat.endRound(); });
    t.ok(!!D().tipped, 'still tipped after this round');
    act(function () { DD.Combat.endRound(); });
    t.ok(!D().tipped && C().upright(s), 'upright again at the end of the next round');
    t.ok(S().log.some(function (l) { return /rights itself/.test(l.text); }), 'the log says so');
    // AutoPlay hints: nothing below Brew 3, a high Brew is worth tipping, minus the splash on the party
    C().setBrew(2);
    t.eq(C().tipValue(h, C().pot(s).obj, C().pot(s), s, 'interact'), 0, 'Brew 2: not worth tipping');
    C().setBrew(5);
    t.ok(C().tipValue(h, C().pot(s).obj, C().pot(s), s, 'interact') > 0, 'Brew 5 with two hags on the spots: worth it');
    t.eq(C().tipValue(h, C().pot(s).obj, C().pot(s), s, 'break'), 0, 'the hint prices the interaction only');
  });

  // ---- the spots, the cook, the swap ------------------------------------------------------------------------------
  T.suite('boss_coven: the Stirring Spots — the cook takes one and stirs, a hero holds one (also through a swap), Brine drags', function (t) {
    if (!ready(t)) return;
    let s = board(10);
    let gr = unit('cov_granny');
    // AutoPlay's hint for a free spot a hag could take this round: 4 + 3 × Brew
    const sp = DD.Grid.tile(6, 5);
    t.eq(C().spotValue(heroes()[0], sp.obj, sp, s, 'step'), 4, 'a free spot within Granny\'s reach at Brew 0: worth 4');
    C().setBrew(2);
    t.eq(C().spotValue(heroes()[0], sp.obj, sp, s, 'step'), 10, 'at Brew 2: worth 10');
    t.eq(C().spotValue(heroes()[0], sp.obj, sp, s, 'break'), 0, 'the hint prices stepping on it only');
    C().setBrew(0);
    act(function () { DD.AI.act(gr); });
    t.ok(C().onSpot(gr), 'Granny (the cook) walks to a free spot (' + key(gr) + ')');
    t.eq(D().brew, 0, 'she can\'t stir in the turn she arrives');
    act(function () { DD.AI.act(gr); });
    t.eq(D().brew, 1, 'next turn she stirs');
    // busy: a hero next to her while the Brew is below 3 → she pinches instead; at 3+ she stirs anyway
    const h = heroes()[0];
    bare(h);
    const free = DD.Grid.neighbors(gr.x, gr.y).filter(function (n) { return DD.Grid.isFree(n.x, n.y) && !(n.obj && n.obj.id === 'cov_spot'); })[0];
    put(h, free.x, free.y);
    const hp = h.hp;
    act(function () { DD.AI.act(gr); });
    t.ok(D().brew === 1 && h.hp < hp, 'a hero next to her at Brew 1: she fights (Brew ' + D().brew + ', ' + (hp - h.hp) + ' damage)');
    C().setBrew(3);
    act(function () { DD.AI.act(gr); });
    t.eq(D().brew, 4, 'at Brew 3 she stirs anyway');
    // every spot held by a hero: nobody stirs
    s = board(11);
    gr = unit('cov_granny');
    heroes().forEach(function (u, i) { put(u, +SPOTS[i].split(',')[0], +SPOTS[i].split(',')[1]); });
    act(function () { DD.AI.act(gr); });
    act(function () { DD.AI.act(gr); });
    t.ok(D().brew === 0 && !C().onSpot(gr), 'heroes on all four spots: Granny never stirs');
    // a spot held through a swap: the ally who steps in holds it
    s = board(12);
    const [a, b] = heroes();
    put(a, 7, 6); put(b, 7, 7);
    act(function () { DD.Combat.giveTurnTo(a); });
    a.ap = 3;
    t.eq(DD.Combat.canSwap(a, 7, 7), true, 'the spot-holder can swap with the ally next to him');
    t.ok(DD.Combat.swap(a, 7, 7), 'the swap move');
    t.ok(key(b) === '7,6' && key(a) === '7,7' && C().onSpot(b), 'the ally now holds the spot: it never came free');
    t.ok((S().stats.swaps || 0) >= 1, 'stats.swaps counts it (E12)');
    // D2: an immovable spot-holder can start the swap, an ally can't move him
    s = board(13);
    const [c, d] = heroes();
    put(c, 6, 5); put(d, 6, 6);
    c.flags.immovable = true;
    DD.Act.touch();
    act(function () { DD.Combat.giveTurnTo(d); });
    d.ap = 3;
    t.ok(typeof DD.Combat.canSwap(d, 6, 5) === 'string', 'an ally can\'t swap an immovable spot-holder off (' + DD.Combat.canSwap(d, 6, 5) + ')');
    act(function () { DD.Combat.giveTurnTo(c); });
    c.ap = 3;
    t.eq(DD.Combat.canSwap(c, 6, 6), true, 'the immovable hero can start the swap himself (D2)');
    // Brine drags a spot-holder off
    s = board(14);
    const br = unit('cov_brine'), e = heroes()[0];
    put(e, 8, 5); put(br, 11, 5);
    const ex = { x: e.x, y: e.y };
    act(function () { DD.AI.act(br); });
    t.ok(!C().onSpot(e) && (e.x !== ex.x || e.y !== ex.y), 'Brine\'s Undertow drags the hero off the spot (now at ' + key(e) + ')');
    t.ok(D().stats.dragged >= 1, 'stat: dragged');
  });

  // ---- Hex Threads ------------------------------------------------------------------------------------------------
  T.suite('boss_coven: Hex Threads — the line, range and sight, who weaves, damage + Weakened once a round, threatAt, zones', function (t) {
    if (!ready(t)) return;
    t.eq(C().lineTiles({ x: 4, y: 4 }, { x: 10, y: 4 }).map(key).join(' '), '5,4 6,4 7,4 8,4 9,4', 'a straight thread: the tiles between');
    const diag = C().lineTiles({ x: 0, y: 0 }, { x: 3, y: 3 });
    t.ok(diag.length >= 2 && diag.every(function (p) { return !(p.x === 0 && p.y === 0) && !(p.x === 3 && p.y === 3); }), 'endpoints excluded');
    let s = board(15);
    let mi = unit('cov_mildred'), gr = unit('cov_granny'), br = unit('cov_brine');
    t.eq(C().threads(s).length, 3, 'at the start: three threads');
    // range: Brine 8+ tiles from both
    put(br, 13, 11);
    t.eq(C().threads(s).length, 1, 'Brine out of range: one thread left');
    put(br, 10, 4);
    // sight: a tree in the way cuts it
    put(gr, 0, 7); put(br, 4, 7); put(mi, 13, 0);
    t.ok(!DD.Grid.los(gr, br), 'setup: the tree at (2,7) between Granny and Brine');
    t.eq(C().threads(s).length, 0, 'no sight, no thread');
    // who weaves: stunned / asleep / frozen / charmed / sheep hags drop out
    s = board(16);
    mi = unit('cov_mildred'); gr = unit('cov_granny'); br = unit('cov_brine');
    ['stun', 'sleep', 'frozen', 'charmed', 'sheep'].forEach(function (id) {
      act(function () { DD.Act.addStatus(br, id, { turns: 1 }, heroes()[0]); });
      t.eq(C().threads(s).length, 1, id + ' on Brine: only Mildred and Granny weave');
      act(function () { DD.Act.removeStatus(br, id, { silent: true }); });
    });
    t.eq(C().threads(s).length, 3, 'all three again');
    t.ok(/threads 3$/.test(s.rules.filter(function (x) { return x.id === 'cov_coven'; })[0].name), 'the chip counts the threads');
    // damage: a hero on the Granny–Brine line, another on two lines at once
    const [h1, h2] = heroes();
    put(h1, 6, 4);   // on Granny (4,4) – Brine (10,4) only
    const both = C().threads(s).filter(function (th) { return th.tiles.some(function (p) { return p.x === 8 && p.y === 3; }); });
    put(h2, 8, 3);
    const onTwo = C().threads(s).filter(function (th) { return th.tiles.some(function (p) { return p.x === h2.x && p.y === h2.y; }); }).length;
    t.ok(both.length >= 1, 'setup: (8,3) is on a thread');
    // threatAt matches the hit (pure)
    const tg = function (u) { return DD.Hooks.fire('threatAt', gr, gr, u, { x: u.x, y: u.y }); };
    const th1 = tg(h1);
    t.ok(th1 && th1.dmg === DD.AI.estimate(gr, h1, Lv('cov_thread').dmg, 'psychic') && th1.label === 'Hex Thread', 'threatAt (Granny heads that thread): ' + JSON.stringify(th1));
    t.eq(DD.Hooks.fire('threatAt', br, br, h1, { x: h1.x, y: h1.y }) || 0, 0, 'Brine does not report the same thread twice');
    const hs = hits(function () { act(function () { C().turnEnd(mi); }); });
    t.ok(hs.of(h1).length === 1 && hs.of(h1)[0].base === Lv('cov_thread').dmg && hs.of(h1)[0].element === 'psychic' && hs.of(h1)[0].dealt === th1.dmg,
      'a hero on one thread: the thread\'s psychic number, as threatAt said (' + JSON.stringify(hs.of(h1)[0]) + ')');
    t.eq(hs.of(h2).length, onTwo, 'a hero on ' + onTwo + ' threads takes ' + onTwo + ' hits');
    t.ok([h1, h2].every(function (u) { const w = u.statuses.filter(function (x) { return x.id === 'weak'; })[0]; return w && w.turns === 1; }), 'Weakened through its next turn');
    t.ok(!hs.some(function (x) { return IDS.indexOf(x.target.defId) >= 0; }), 'hags are never hit by their threads');
    const again = hits(function () { act(function () { C().turnEnd(mi); }); });
    t.eq(again.length, 0, 'a thread fires at most once a round');
    s.round++;
    const next = hits(function () { act(function () { C().turnEnd(mi); }); });
    t.ok(next.of(h1).length === 1, 'next round it fires again');
    // after the split: the threads touching the hag whose turn ended
    s = board(17);
    mi = unit('cov_mildred'); gr = unit('cov_granny'); br = unit('cov_brine');
    act(function () { DD.Act.kill(mi, heroes()[0]); });
    act(function () { DD.Combat.endRound(); });
    const [k1] = heroes();
    put(k1, 7, 4);
    const split = hits(function () { act(function () { C().turnEnd(gr); }); });
    t.ok(split.of(k1).length === 1, 'split: the Granny–Brine thread fires at the end of Granny\'s own turn');
    const split2 = hits(function () { act(function () { C().turnEnd(br); }); });
    t.eq(split2.of(k1).length, 0, '…and not again at the end of Brine\'s (once a round)');
    // zones (E8) and smoke
    s = board(18);
    const zones = (s.data.zones || []).filter(function (z) { return /^cov_thread:/.test(z.id); });
    t.ok(zones.length === 3 && zones.every(function (z) { return z.tiles.length && z.line && z.line.length === 2 && z.color; }), 'three thread zones with tiles and a line');
    const gb = C().threads(s).filter(function (th) { return th.a.defId === 'cov_granny' && th.b.defId === 'cov_brine'; })[0];
    act(function () { DD.Act.setSurface(gb.tiles[1].x, gb.tiles[1].y, 'smoke', 2); });
    t.ok(!C().threads(s).some(function (th) { return th.a.defId === 'cov_granny' && th.b.defId === 'cov_brine'; }), 'smoke on the line cuts the thread');
  });

  // ---- Into the Pot, bubbles, mourning ----------------------------------------------------------------------------
  T.suite('boss_coven: Into the Pot (+2 a fallen hag), Swamp Gas Bubbles (10 fire + smoke), the last hag, the defeat', function (t) {
    if (!ready(t)) return;
    let s = board(19);
    const gr = unit('cov_granny'), br = unit('cov_brine'), mi = unit('cov_mildred');
    const h = heroes()[0];
    act(function () { DD.Act.kill(gr, h); });
    t.ok(D().brew === 2 && D().stats.intoPot === 1, 'Granny falls: Brew +2');
    t.ok(S().log.some(function (l) { return /Granny Gristle's spirit dives into the cauldron: Brew \+2\./.test(l.text); }), 'the log says so');
    t.ok(DD.Combat.turnOwner(br) === mi, 'Granny\'s fall doesn\'t split the turn');
    act(function () { DD.Act.kill(br, h); });
    t.ok(D().brew === 4 && D().last === true, 'Brine falls: Brew 4; one hag left');
    act(function () { DD.Act.kill(mi, h); });
    t.eq(s.result, 'victory', 'all three down: victory');
    t.ok(S().log.some(function (l) { return /baby Svammiel in a bonnet|cottage finally goes quiet/.test(l.text); }), 'the cov_death narration');
    // bubbles: shot by a hero, 10 fire within 1 and smoke there
    s = board(20);
    const a = heroes().filter(function (u) { return u.defId === 'test_mage'; })[0];
    const b = heroes().filter(function (u) { return u !== a; })[0];
    const g2 = unit('cov_granny');
    bare(a); bare(b); bare(g2);
    put(g2, 4, 8); put(b, 5, 9); put(a, 5, 11);
    act(function () { DD.Combat.giveTurnTo(a); });
    a.ap = 3;
    const q = DD.Targeting.validTargets(a, a.basic).filter(function (p) { return p.x === 5 && p.y === 8; })[0];
    t.ok(!!q && q.detonates === true, 'a hero can aim at a bubble (volatile)');
    const hs = hits(function () { DD.Combat.useSkill(a, a.basic, 5, 8); });
    t.ok(!DD.Grid.tile(5, 8).obj, 'it pops');
    t.ok(hs.of(g2).length === 1 && hs.of(g2)[0].base === 10 && hs.of(g2)[0].element === 'fire', 'Granny next to it takes 10 fire');
    t.ok(hs.of(b).length === 1 && hs.of(b)[0].base === 10, 'so does the hero next to it');
    t.ok(DD.Grid.shape('circle', { x: 5, y: 8 }, null, 1).every(function (p) { const tt = DD.Grid.tile(p.x, p.y); return tt.surface && tt.surface.id === 'smoke' && tt.surface.turns === 2; }),
      'smoke within 1, until the end of the next round');
    t.eq(D().stats.bubbles, 1, 'stat: bubbles');
  });

  // ---- Svammiel's cameo cheat ---------------------------------------------------------------------------------------
  T.suite('boss_coven: Svammiel\'s The Floor Is Lava (the start cameo\'s cheat) — 9 tiles, 3 rounds, restored; the pie stays honest', function (t) {
    if (!ready(t)) return;
    const cam = DD.getCameo && DD.getCameo('svammiel');
    if (!cam || !DD.Cameo || DD.Cameo.stub || !cam.cheats || !cam.cheats.svam_cameo_lava) { t.skip('Svammiel\'s cameo / cameo.js not loaded (isolate=coven,svammiel)'); return; }
    const before = {};
    for (let y = 7; y <= 9; y++) for (let x = 6; x <= 8; x++) before[x + ',' + y] = null;
    const s = startFight(21, { cameo: true });
    const rule = s.rules.filter(function (r) { return r.id === 'cameo:svam_cameo_lava'; })[0];
    t.ok(!!rule && rule.cheat === true, 'the start cameo applies The Floor Is Lava');
    t.eq(rule && rule.desc, 'The patch on the path to the cauldron is lava until the end of round 3. Hags don\'t burn.', 'its exact desc');
    const lava = Object.keys(before).filter(function (k) { const p = k.split(','); return DD.Grid.tile(+p[0], +p[1]).t === 'lava'; });
    t.eq(lava.length, 9, 'x 6-8, y 7-9: 9 tiles of lava');
    t.ok(S().log.some(function (l) { return /Svammiel cheats: The Floor Is Lava\./.test(l.text); }), 'the cheat is logged');
    // the pie's number stays honest with the cheat on
    s.aiOff = true;
    const mi = unit('cov_mildred');
    heroes().forEach(bare);
    C().setBrew(6);
    act(function () { C().turnEnd(mi); });
    const it = windup(mi, 'cov_pie');
    const show = DD.AI.intentDmg(mi, it);
    const victims = heroes().filter(function (h) { return DD.Grid.tile(h.x, h.y).t !== 'lava'; });
    const hs = hits(function () { land(mi, it); });
    t.ok(victims.every(function (h) { return hs.of(h).filter(function (x) { return x.skill === 'cov_pie'; }).every(function (x) { return x.dealt === show; }); }), 'the Hero Pie deals what it shows with the cheat on');
    for (let r = 0; r < 3 && !s.result; r++) act(function () { DD.Combat.endRound(); });
    t.ok(!s.rules.some(function (r) { return r.id === 'cameo:svam_cameo_lava'; }), 'the rule ends after round 3');
    t.eq(Object.keys(before).filter(function (k) { const p = k.split(','); return DD.Grid.tile(+p[0], +p[1]).t === 'lava'; }).length, 0, 'and the floor is restored');
    t.ok(DD.Grid.tile(6, 7).t === 'cov_bog' && DD.Grid.tile(8, 8).t === 'moss', 'bog and moss, as they were');
    // QA FIGHTS-06: shoved across his lava, a hag takes nothing (the cheat taxes the party, not the Coven); a hero still burns
    const s2 = startFight(22, { cameo: true });
    s2.aiOff = true;
    const gr = unit('cov_granny'), hz = heroes()[0];
    const free = function (x, y) { const tl = DD.Grid.tile(x, y); return !!tl && !DD.Grid.unitAt(x, y) && !tl.obj && DD.Grid.isWalkable(x, y, gr); };
    // a clear lane: a free tile next to the patch, then three free lava tiles straight across it
    let lane = null;
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {
      for (let k = 6; k <= 8 && !lane; k++) {
        const from = d[0] ? { x: d[0] > 0 ? 5 : 9, y: k } : { x: k, y: d[1] > 0 ? 6 : 10 };
        const ok = free(from.x, from.y) && [1, 2, 3].every(function (i) { const x = from.x + d[0] * i, y = from.y + d[1] * i; return free(x, y) && DD.Grid.tile(x, y).t === 'lava'; });
        if (ok) lane = { from: from, dir: { x: d[0], y: d[1] } };
      }
    });
    if (t.ok(!!gr && !!lane, 'Granny Gristle and a clear lane across the lava (' + JSON.stringify(lane) + ')')) {
      DD.Act.teleport(gr, lane.from.x, lane.from.y, { noEnter: true, fx: false });
      const hp0 = gr.hp;
      act(function () { DD.Act.push(hz, gr, lane.dir, 3); });
      t.ok(DD.Grid.tile(gr.x, gr.y).t === 'lava' && gr.hp === hp0 && !DD.Act.hasStatus(gr, 'burn'),
        'shoved across it (now at ' + gr.x + ',' + gr.y + '): no damage, no Burn (' + (hp0 - gr.hp) + ' lost)');
      bare(hz);
      const h0 = hz.hp;
      DD.Act.teleport(hz, lane.from.x, lane.from.y, { noEnter: true, fx: false });
      act(function () { DD.Act.push(gr, hz, lane.dir, 1); });
      t.ok(hz.hp < h0 && DD.Grid.tile(hz.x, hz.y).t === 'lava', 'a hero shoved onto it still burns (' + (h0 - hz.hp) + ')');
    }
  });

  // ---- voice ------------------------------------------------------------------------------------------------------
  T.suite('boss_coven: voice — lengths, she / her only, named lines (Benedick\'s verbatim), banter, mourning, narration', function (t) {
    if (!ready(t)) return;
    const lines = [];
    IDS.forEach(function (id) {
      const d = DD.getEnemy(id);
      Object.keys(d.barks).forEach(function (k) { d.barks[k].forEach(function (l) { lines.push([id + '.' + k, l]); }); });
      (C().NAMED[id] || []).forEach(function (p) { lines.push([id + '.named.' + p[0], p[1]]); });
    });
    C().BANTER.forEach(function (b, i) { b.forEach(function (l) { lines.push(['banter ' + i + ' ' + l[0], l[1]]); }); });
    lines.forEach(function (x) {
      t.ok(x[1].length <= 70, x[0] + ': a bubble line ≤ 70 (' + x[1].length + ') "' + x[1] + '"');
      t.ok(!/^[a-z][a-z0-9_]*$/.test(x[1]), x[0] + ': not mistaken for a bark key');
    });
    const texts = lines.slice();
    IDS.forEach(function (id) {
      const d = DD.getEnemy(id);
      texts.push([id + ' desc', d.desc]);
      texts.push([id + ' passive', d.passive.desc(null)]);
    });
    Object.keys(C().SK).forEach(function (k) {
      const s = DD.getSkill(C().SK[k]);
      texts.push([s.id + ' desc', DD.skillDesc(s, 1, null)]);
      texts.push([s.id + ' flavor', s.flavor]);
    });
    texts.push(['cov_eye status', DD.getStatus('cov_eye').desc({ stacks: 1, turns: -1, data: {} })]);
    ['cov_cauldron', 'cov_spot', 'cov_bubble', 'cov_cottage', 'cov_the_eye'].forEach(function (id) { texts.push([id, DD.getObject(id).desc]); });
    texts.push(['cov_bog', DD.getTerrain('cov_bog').desc]);
    texts.push(['rule', C().ruleDesc()]);
    ['cov_tip', 'cov_eye', 'cov_pie_windup', 'cov_pie', 'cov_tipped', 'cov_death'].forEach(function (k) {
      const pool = DD.defs.narration[k] || [];
      t.ok(pool.length >= 2, k + ': 2+ lines');
      pool.forEach(function (l) { texts.push([k, l]); t.ok(l.length <= 160, k + ': narration ≤ 160 (' + l.length + ')'); });
    });
    texts.push(['encounter intro', DD.getEncounter(ENC).intro]);
    // pronoun sweep (plan §8.4): a sentence naming exactly one hag uses only she / her
    const HE = /\b(he|him|his|himself)\b/i;
    const WORD = { cov_mildred: 'Mildred', cov_granny: 'Granny', cov_brine: 'Brine' };
    let swept = 0;
    texts.forEach(function (x) {
      sentences(x[1]).forEach(function (sent) {
        const who = IDS.filter(function (id) { return new RegExp('\\b' + WORD[id] + '\\b').test(sent); });
        if (who.length !== 1 || /Svammiel|Svammy/.test(sent)) return;
        swept++;
        t.ok(!HE.test(sent), x[0] + ': she / her for ' + NAMES[who[0]] + ' in "' + sent + '"');
      });
    });
    t.ok(swept >= 10, 'the sweep saw ' + swept + ' sentences naming one hag');
    const SCREEN = /\b(?:top|bottom)[- ](?:left|right)\b|\b(?:up|down) the screen\b|\btoward the (?:top|bottom)\b|\bscreen[- ](?:left|right)\b/i;
    texts.forEach(function (x) { t.ok(!SCREEN.test(x[1]), x[0] + ': no screen-direction words'); });
    // named lines: real heroes named exactly; Granny's Benedick line verbatim (plan §5.3)
    const ROSTER = { marbles: 'Professor Marbles', betty: 'Betty', ellaria: 'Ellaria', benedick: 'Benedick', pebbles: 'Pebbles', hjalmar: 'Hjalmar',
      syllamin: 'Syllamin', basanos: 'Basanos' };
    IDS.forEach(function (id) {
      (C().NAMED[id] || []).forEach(function (p) {
        const h = DD.getHero(p[0]);
        const nm = h ? h.name : ROSTER[p[0]];
        if (!t.ok(!!nm, id + ': named line for a real hero (' + p[0] + ')')) return;
        t.ok(p[1].indexOf(nm) >= 0, id + ': the named line names ' + nm + ' exactly: "' + p[1] + '"');
      });
    });
    t.ok(C().NAMED.cov_granny.some(function (p) { return p[0] === 'benedick' && p[1] === 'Benedick, dearie! I\'ve a lovely garlic butter for you.'; }), 'Granny\'s Benedick line, verbatim');
    // the party filter by hero id: no named line without its hero in the fight
    DD.Combat.sandbox({ w: 9, h: 9, seed: 3, noPlan: true, enemyAi: false, cameo: false, heroes: [{ id: 'test_mage', x: 1, y: 1 }], enemies: [{ id: 'cov_granny', x: 5, y: 5 }] });
    let leaked = 0;
    for (let i = 0; i < 40; i++) if (C().namedLine(unit('cov_granny'))) leaked++;
    t.eq(leaked, 0, 'no named line without its hero in the fight');
    // mourning: each fallen sister has a mourner in each of the other two; nobody mourns herself
    IDS.forEach(function (fallen) {
      const k = 'mourn_' + fallen.replace('cov_', '');
      const by = IDS.filter(function (id) { return id !== fallen && (DD.getEnemy(id).barks[k] || []).length > 0; });
      t.eq(by.length, 2, NAMES[fallen] + ' falls: both sisters can mourn');
      t.ok(!DD.getEnemy(fallen).barks[k], NAMES[fallen] + ' does not mourn herself');
    });
    C().BANTER.forEach(function (b, i) { t.ok(b.length >= 2 && b.length <= 5 && b.every(function (l) { return IDS.indexOf(l[0]) >= 0; }), 'banter ' + i + ': 2-5 lines by hags'); });
    t.ok(C().BANTER.some(function (b) { return b.some(function (l) { return /Baba Yaga/.test(l[1]); }); }), 'a nod to Skylla\'s patron Baba Yaga');
    t.ok(C().BANTER.some(function (b) { return b.some(function (l) { return /Svammy/.test(l[1]); }); }), 'they call him Svammy');
    t.ok(C().BANTER[0].map(function (l) { return l[1]; }).join(' | ') === 'Who\'s got the Eye? | Mildred had it last. | Ugh, I\'m USING it.', 'V\'s banter 1 describes the mechanic');
    DD.defs.narration.cov_tip.forEach(function (l) { t.ok(/^DM \(whispering\): ".+"$/.test(l), 'the demoted DM whispers the tip: ' + l); });
    t.ok(DD.defs.narration.cov_tip.some(function (l) { return /stirring spots/.test(l); }) && DD.defs.narration.cov_tip.some(function (l) { return /Tip it over/.test(l); }), 'the plan\'s two tips');
    IDS.forEach(function (id) { ['spawn', 'attack', 'hurt', 'death', 'last', 'stir', 'tipped'].forEach(function (k) { t.ok((DD.getEnemy(id).barks[k] || []).length >= 1, id + ': barks.' + k); }); });
  });

  // ---- robustness -------------------------------------------------------------------------------------------------
  T.suite('boss_coven: robustness — each hag alone, charmed and sheeped turns, previews leave no trace', function (t) {
    if (!ready(t)) return;
    IDS.forEach(function (id) {
      DD.Combat.sandbox({ w: 11, h: 11, seed: 9, cameo: false, objective: { type: 'custom' }, encounter: { id: 'cov_alone', checkObjective: function () { return null; } },
        heroes: PARTY.map(function (h, i) { return { id: h, x: 1 + (i % 2), y: 3 + i, level: 5 }; }), enemies: [{ id: id, x: 7, y: 5 }] });
      let used = 0;
      const e = unit(id);
      DD.Act.addRule({ id: 'test_cov_used', name: 'used', silent: true, hooks: { onSkillUsed: function (ctx) { if (ctx.user === e) used++; } } });
      for (let r = 0; r < 3 && !S().result; r++) act(function () { DD.Combat.endRound(); });
      DD.Act.removeRule('test_cov_used');
      t.ok(used > 0 || e.dead, id + ': alone in a bare sandbox (no cauldron), she acts (' + used + ' skills in 3 rounds)');
      t.ok(!C().data(S()), 'no Coven state outside the Coven\'s fight');
    });
    board(22);
    const h = heroes()[0];
    put(unit('cov_granny'), 6, 5);
    put(unit('cov_brine'), 8, 5);
    IDS.forEach(function (id) {
      const u = unit(id);
      act(function () { DD.Act.addStatus(u, 'charmed', { turns: 1 }, h); });
      act(function () { DD.AI.act(u); });
      act(function () { DD.Act.removeStatus(u, 'charmed', { silent: true }); DD.Act.addStatus(u, 'sheep', { turns: 1 }, h); });
      act(function () { DD.AI.act(u); });
      act(function () { DD.Act.removeStatus(u, 'sheep', { silent: true }); });
    });
    t.ok(D().brew === 0, 'a charmed hag never stirs');
    // previews (dry runs) of lethal hits on every hag change nothing (Into the Pot, the Eye, mourning)
    const s3 = board(23);
    const mage = heroes().filter(function (u) { return u.defId === 'test_mage'; })[0] || heroes()[0];
    const look = function () {
      return JSON.stringify({ d: s3.data.coven, zones: s3.data.zones, dead: s3.units.map(function (u) { return u.dead; }), log: s3.log.length,
        rules: s3.rules.map(function (r) { return r.name; }) });
    };
    const snap = look();
    let previewed = 0;
    IDS.forEach(function (id) {
      const u = unit(id), hp0 = u.hp;
      const spot = DD.Grid.neighbors(u.x, u.y).filter(function (n) { return DD.Grid.isFree(n.x, n.y); })[0];
      if (!spot || !put(mage, spot.x, spot.y)) return;
      const q = DD.Targeting.validTargets(mage, mage.basic).filter(function (p) { return p.x === u.x && p.y === u.y; })[0];
      if (!q) return;
      u.hp = 1;
      act(function () { DD.Targeting.preview(mage, mage.basic, q); });
      u.hp = hp0;
      previewed++;
    });
    t.ok(previewed >= 2, previewed + ' lethal previews');
    t.eq(look(), snap, 'previews of lethal hits change nothing (the Brew, the Eye, the zones, the log)');
    t.ok(IDS.every(function (id) { return !!unit(id); }), 'and nobody died for real');
    // threatAt is pure (no RNG, no state change)
    const before = JSON.stringify([s3.rng.getState(), s3.mutations]);
    DD.Hooks.fire('threatAt', unit('cov_granny'), unit('cov_granny'), mage, { x: 6, y: 4 });
    t.eq(JSON.stringify([s3.rng.getState(), s3.mutations]), before, 'threatAt is pure');
  });

  // ---- Benedick's slime (plan §4.12: squad members are elites, so his slime stops a hag) ------------------------------
  T.suite('boss_coven: Benedick\'s Snail Slime stops a hag on her way to a spot (elites get stuck)', function (t) {
    if (!ready(t)) return;
    const slime = DD.getSurface && DD.getSurface('ben_slime');
    if (!DD.getHero('benedick') || !slime) { t.skip('Benedick (js/data/heroes/benedick.js) not landed yet'); return; }
    const s = board(24);
    const gr = unit('cov_granny');
    put(gr, 4, 4);
    act(function () { DD.Act.setSurface(5, 4, slime.id, 3); DD.Grid.tile(5, 4).surface.data = { src: heroes()[0].id }; });
    act(function () { DD.AI.act(gr); });
    t.ok(!C().onSpot(gr), 'Granny is stuck short of the spot (' + key(gr) + ')');
    // review (V3): the hags are elites, so the slime is a stop for the walkers; Mildred rides Granny's broom over it
    const mi = unit('cov_mildred'), br = unit('cov_brine');
    const stops = function (u) { const sn = DD.Grid.snagAt(5, 4, u); return !!sn && sn.stops; };
    t.ok(stops(gr) && stops(br), 'a stop for Granny Gristle and Auntie Brine (elites, grounded)');
    t.ok(!stops(mi), 'no snag for Cousin Mildred (she flies)');
    t.ok(put(gr, 12, 9), 'Granny out of the way');
    put(br, 2, 4);
    act(function () { DD.Act.moveAlong(br, [{ x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], { action: false }); });
    t.ok(br.x === 5 && br.y === 4, 'Auntie Brine walking across it stops on the slime (' + key(br) + ')');
  });

  // ---- AutoPlay battles -------------------------------------------------------------------------------------------
  T.suite('boss_coven: AutoPlay battles (fixture party; real=1: random real parties at L5.5 against the plan\'s band)', function (t) {
    if (!ready(t)) return;
    const real = t.param('real', '0') === '1';
    const pool = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    if (real && pool.length < 4) { t.skip('real=1 needs the hero files (isolate=coven,heroes)'); return; }
    const n = Math.max(1, +(t.param('n', real ? 20 : 2)) || 1);
    const level = +(t.param('level', LV)) || LV;
    const rng = DD.RNG('cov-sims:' + t.seed);
    let wins = 0, rounds = 0, timeouts = 0, downs = 0;
    const eng = { stirs: 0, full: 0, pies: 0, pieLanded: 0, pieStopped: 0, pieTipped: 0, tipped: 0, threads: 0, threadHits: 0, spotsHeld: 0,
      intoPot: 0, eyeDropped: 0, sleeps: 0, terrors: 0, bubbles: 0, bogged: 0, dragged: 0 };
    const taken = {}, dealt = { heroes: 0, other: 0, healed: 0 }, died = {}, diedAt = {}, uses = {};
    // tuning probes (BAL): hpx=<HP factor>, knobs=key:value,… (DD.Coven.N), lv=skill.key:value,… (level-1 numbers)
    const hpx = +(t.param('hpx', 1)) || 1, saved = {}, savedN = Object.assign({}, C().N);
    IDS.forEach(function (id) { saved[id] = DD.getEnemy(id).hp; DD.getEnemy(id).hp = Math.round(saved[id] * hpx); });
    String(t.param('knobs', '')).split(',').filter(Boolean).forEach(function (kv) { const p = kv.split(':'); if (p[0] in C().N) C().N[p[0]] = +p[1]; });
    const savedLv = [];
    String(t.param('lv', '')).split(',').filter(Boolean).forEach(function (kv) {
      const p = kv.split(':'), q = p[0].split('.'), def = DD.getSkill(q[0]);
      if (!def || !def.levels[0] || !(q[1] in def.levels[0])) return;
      savedLv.push([def, q[1], def.levels[0][q[1]]]);
      def.levels[0][q[1]] = +p[1];
    });
    try {
      for (let i = 0; i < n; i++) {
        // party=a,b,c,d pins the party (the draw still happens, so the fights keep their seeds)
        const drawn = real ? rng.sample(pool, 4) : PARTY;
        const ids = t.param('party', '') ? String(t.param('party')).split(',') : drawn;
        const s = bareRows(real, function () { return startFight('sim' + i, { real: true, level: level, ids: ids, cameo: t.param('cameo', '0') === '1' }); });
        DD.Act.addRule({ id: 'test_cov_diag', name: 'diag', silent: true, hooks: {
          onTakeDamage: function (d) {
            if (!d.target || DD.Act.simulating) return;
            if (d.target.kind === 'hero') { const k = d.skill ? d.skill.id : d.cause; taken[k] = (taken[k] || 0) + (d.dealt || 0); }
            else if (IDS.indexOf(d.target.defId) >= 0) { if (d.source && d.source.side === 'hero') dealt.heroes += d.dealt || 0; else dealt.other += d.dealt || 0; }
          },
          onHealed: function (u, amount) { if (!DD.Act.simulating && u && IDS.indexOf(u.defId) >= 0) dealt.healed += amount || 0; },
          onSkillUsed: function (ctx) { if (!DD.Act.simulating && ctx && ctx.user && IDS.indexOf(ctx.user.defId) >= 0) uses[ctx.skill.id] = (uses[ctx.skill.id] || 0) + 1; },
          onDeath: function (u) { if (!DD.Act.simulating && u && IDS.indexOf(u.defId) >= 0) u.data.covDiedAt = S().round; },
        } });
        const res = DD.AutoPlay.runBattle(40);
        s.units.forEach(function (u) {
          if (IDS.indexOf(u.defId) < 0) return;
          const k = u.defId.replace('cov_', '');
          died[k] = (died[k] || 0) + (u.dead ? 1 : 0);
          diedAt[k] = (diedAt[k] || 0) + (u.dead ? (u.data.covDiedAt || res.rounds) : res.rounds);
        });
        rounds += res.rounds;
        if (res.result === 'victory') wins++;
        if (res.timeout) timeouts++;
        downs += s.stats.downs || 0;
        const st = C().stats(s);
        Object.keys(eng).forEach(function (k) { eng[k] += st[k] || 0; });
        if (t.param('fights')) t.log('#' + i + ' ' + ids.join(',') + ': ' + res.result + ' in ' + res.rounds + ' rounds, ' + JSON.stringify(st));
      }
    } finally {
      IDS.forEach(function (id) { DD.getEnemy(id).hp = saved[id]; });
      Object.assign(C().N, savedN);
      savedLv.forEach(function (x) { x[0].levels[0][x[1]] = x[2]; });
    }
    if (hpx !== 1 || t.param('knobs') || t.param('lv')) t.log('probe: hpx ' + hpx + ', knobs ' + t.param('knobs', '-') + ', lv ' + t.param('lv', '-'));
    const pct = Math.round(100 * wins / n);
    t.log('Coven at L' + level + ' (' + (real ? 'random real parties' : 'fixture party') + '): won ' + wins + '/' + n + ' (' + pct + '%), avg rounds ' +
      (rounds / n).toFixed(1) + ', downs ' + (downs / n).toFixed(2) + ', timeouts ' + timeouts);
    const per = function (o) { const r = {}; Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).forEach(function (k) { r[k] = +(o[k] / n).toFixed(1); }); return JSON.stringify(r); };
    t.log('engagement per fight ' + per(eng));
    t.log('damage to heroes by source per fight ' + per(taken) + ' · to the Coven ' + per(dealt));
    t.log('hag uses per fight ' + per(uses) + ' · deaths ' + JSON.stringify(died) + ' · mean round down (or the fight\'s end) ' + per(diedAt));
    t.eq(timeouts, 0, 'no timeouts');
    if (!real) return;
    t.ok(pct >= 45 && pct <= 90, 'author band (plan §7.2: 45-90%; target 66-74% at L5.5): ' + pct + '%');
    t.ok(eng.stirs > 0 && eng.threadHits > 0, 'the hags stir and the threads bite');
    t.ok(eng.tipped + eng.spotsHeld > 0, 'puzzle engagement: the cauldron tipped or the spots held (tipped ' + eng.tipped + ', spots held ' + eng.spotsHeld + ')');
  });

  // ---- review (V3) ---------------------------------------------------------------------------------------------------------
  /**
   * Review (V3, Nov 15): whole fights of the real door through the real path (deployment, initiative, Svammiel's start
   * cameo and its cheat), real heroes (Benedick in the first party once he has landed), every enemy action under the
   * content suite's area watch. rn=<fights> (default 2), rdiff=<difficulty>.
   */
  T.suite('boss_coven: review (V3) — real parties (Benedick in one), the start cameo on: every hit inside its marked tiles, the fight ends', function (t) {
    if (!ready(t)) return;
    const watch = T.contentHelpers && T.contentHelpers.watchAreas;
    const pool = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    if (!watch || pool.length < 4) { t.skip('needs the hero files and content_tests.js (a full run)'); return; }
    const n = Math.max(1, +(t.param('rn', 2)) || 1);
    const rng = DD.RNG('cov-review:' + t.seed);
    let ended = 0;
    for (let i = 0; i < n; i++) {
      const ids = rng.sample(pool, 4);
      if (i === 0 && DD.getHero('benedick') && ids.indexOf('benedick') < 0) ids[0] = 'benedick';
      let res = null, s = null;
      const w = watch(function (ww) {
        s = startFight('review' + i, { real: true, level: 5.5, ids: ids, cameo: true, diff: t.param('rdiff', 'normal') });
        ww.arm();
        res = DD.AutoPlay.runBattle(40);
      });
      w.violations.forEach(function (v) { t.fail('#' + i + ' ' + ids.join(',') + ': ' + v); });
      if (res && res.result) ended++;
      t.log('#' + i + ' ' + ids.join(',') + ': ' + (res && res.result) + ' in ' + (res && res.rounds) + ' rounds, ' + w.actions + ' enemy actions (' + w.windups +
        ' wind-ups) watched, cheats ' + ((s && s.stats && s.stats.cheats) || 0));
    }
    t.eq(ended, n, 'every fight ends (no timeout)');
  });
})();
