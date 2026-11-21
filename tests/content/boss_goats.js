/* Dungeons and Degenerates — tests/content/boss_goats.js
 * Suites "boss_goats: …" for js/data/bosses/goats.js (V3, the fifth act-4 door; the normative spec is
 * .tmp/v3/addendum-goats.md §21): THE RAPPING GOATS — the registry, the Barn Burner arena, every skill against its desc,
 * the shared Verse (bars started / finished / hung, preview = result), Bar None (wind-up, landing, interrupt, fizzle,
 * miss, re-point), call-outs (Betty first), the Mic Stand's Clap Back, the Tribute, the bear on the goats' combined half
 * HP (and its fallback), the bass and the Speaker Stacks, honesty and determinism, Svammiel's Radio Edit at this door,
 * the voice lint (lengths, names, pronouns, the tone guard), sprites at five yaws, robustness and AutoPlay battles
 * (real=1: random real parties at L5.5 against the plan's band). Works isolated (&isolate=goats): the fixture heroes
 * stand in for the party; the real-hero checks run in the full suite (or &isolate=goats,heroes).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const ENC = 'boss_goats';
  const BILLY = 'rap_billy', KID = 'rap_kid', TURNIP = 'rap_turnip', URSA = 'rap_ursa';
  const CREW = [BILLY, KID, TURNIP, URSA];
  const LV = 5.5;
  // the user's roster (the lint also covers heroes not loaded in an isolated run); the registry's names win when present
  const ROSTER = { zarathor: 'Zarathor', syllamin: 'Syllamin', marbles: 'Professor Marbles', marwyn: 'Marwyn', ellaria: 'Ellaria',
    josiah: 'Josiah', sparrow: 'Sparrow', corelos: 'Corelos', slate: 'Slate', buga: 'Mayor Buga', kiri: 'Kiri', betty: 'Betty',
    basanos: 'Basanos', valdris: 'Valdris', hjalmar: 'Hjalmar', pebbles: 'Pebbles', benedick: 'Benedick',
    rasma: 'Rasma', biz: 'Biz', gus: 'Phat Gus' };   // h19: their bars land before their hero files (plan D5)
  const SHE = { ellaria: 1, sparrow: 1, kiri: 1 };
  // the addendum's tone guard (§3, §17): no mock dialect, and the fur colour is never a joke
  const DIALECT = /(^|[^a-z'])(yo|ain't|homie|dawg|bruh|finna|gonna|wanna|gotta|y'all|ya)([^a-z']|$)/i;
  const PARK = [[0, 2], [1, 2], [2, 2], [3, 2], [11, 2], [12, 2], [13, 2], [14, 2], [0, 3], [1, 3], [12, 13], [13, 13], [14, 13]];

  // ---- helpers --------------------------------------------------------------------------------------------------
  function G() { return DD.Goats; }
  function S() { return DD.Combat.state; }
  function R() { return S().data.rap; }
  function ready(t) {
    if (!DD.Goats || !DD.getEncounter(ENC)) { t.skip('js/data/bosses/goats.js not loaded'); return false; }
    if (!DD.getHero('test_knight')) { t.skip('needs tests/fixtures.js'); return false; }
    return true;
  }
  function act(fn) { return DD.Combat._action(fn); }
  /** A party at a level; a fractional level (5.5) splits it (half at 5, half at 6). */
  function partyAt(level, ids) {
    return (ids || PARTY).map(function (id, i) {
      const lv = Math.floor(level) + (level % 1 && i % 2 ? 1 : 0);
      const h = DD.getHero(id);
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
  /** The real encounter. Default: scripted (no deployment, heroes first, no cameo). opts.real: the real path. */
  function startFight(seed, opts) {
    opts = opts || {};
    const diff = opts.diff || 'normal';
    const setup = DD.Encounter.build(ENC, partyAt(opts.level || LV, opts.ids), { rng: DD.RNG('rap:' + seed), difficulty: diff, act: 4 });
    const o = { seed: seed, headless: true, difficulty: diff, kind: 'boss' };
    if (!opts.cameo) o.cameo = false;
    if (opts.run) o.run = opts.run;
    if (!opts.real) { o.sandbox = true; o.initiative = 'heroesFirst'; }
    return DD.Combat.start(setup, o);
  }
  /** A scripted fight: the enemies' planners off, every hero bare (no armor, no Block), units placed by def id. */
  function scene(seed, place, opts) {
    const s = startFight(seed, opts);
    s.aiOff = true;
    heroes().forEach(bare);
    if (place) arrange(place);
    return s;
  }
  function who(defId) { return S().units.filter(function (u) { return u.defId === defId && !u.dead; })[0] || null; }
  function heroes() { return S().units.filter(function (u) { return u.kind === 'hero'; }); }
  function freePark() {
    return PARK.filter(function (p) { const t = DD.Grid.tile(p[0], p[1]); return t && !t.obj && !DD.Grid.unitAt(p[0], p[1]); })[0];
  }
  function pos(u, x, y) {
    if (!u) return false;
    if (u.x === x && u.y === y) return true;
    const o = DD.Grid.unitAt(x, y);
    if (o && o !== u) { const p = freePark(); DD.Act.teleport(o, p[0], p[1], { noEnter: true, fx: false }); }
    return DD.Act.teleport(u, x, y, { noEnter: true, fx: false });
  }
  function arrange(m) { Object.keys(m).forEach(function (k) { pos(who(k), m[k][0], m[k][1]); }); G().sync(S()); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function bare(u) {
    u.armor = 0; u.block = 0;
    (u.statuses || []).slice().forEach(function (st) { if (st.id.indexOf('rap_') !== 0) DD.Act.removeStatus(u, st.id, { silent: true }); });
  }
  function F() { return (S().difficulty && Number(S().difficulty.dmg)) || 1; }
  /** What Act.damage deals from an enemy: round(base × the fight's damage factor + flat). */
  function exp(base, flat) { return Math.round(base * F() + (flat || 0)); }
  function useNow(u, id, target, opts) { return act(function () { return DD.AI.useNow(u, id, target, opts); }); }
  function windup(u, id) { return ((u && u.intents) || []).filter(function (i) { return i.skillId === id; })[0] || null; }
  /** u's turn now (sandbox giveTurnTo: start-of-turn ticks and wind-ups, its planner unless the AI is off, its turn end). */
  function turn(u) { return act(function () { return DD.Combat.giveTurnTo(u); }); }
  function play() { return act(function () { return DD.Combat.endRound(); }); }
  /** u's planner alone (no other unit acts), then its turn-end hooks (the Golden Mic's wind-up check). */
  function plan(u) { act(function () { DD.AI.act(u); }); act(function () { DD.Hooks.fire('onTurnEnd', u, u); }); }
  function kill(u, by) { return act(function () { return DD.Act.kill(u, by || heroes()[0]); }); }
  function hit(src, u, n, opts) { return act(function () { return DD.Act.damage(src, u, n, opts || {}); }); }
  function logHas(re) { return S().log.some(function (l) { return re.test(l.text); }); }
  function logCount(re) { return S().log.filter(function (l) { return re.test(l.text); }).length; }
  function setVerse(n) { R().verse = n; G().sync(S()); }
  function sk(id) { return DD.getSkill(id); }
  function previewDmg(u, id, v) {
    const p = DD.Targeting.preview(u, sk(id), { x: v.x, y: v.y });
    return p.perUnit[v.id] ? p.perUnit[v.id].dmg : 0;
  }
  function estimate(u, id, v) { const d = sk(id); return DD.AI.estimate(u, v, DD.skillLevel(d, 1).dmg, d.target && (d.tags || []).indexOf('psychic') >= 0 ? 'psychic' : null, false, d); }
  function hpLost(v, fn) { const h0 = v.hp, b0 = v.block || 0; fn(); return (h0 - v.hp) + (b0 - (v.block || 0)); }
  function nameWords(name) { return String(name).split(/[^A-Za-z]+/).filter(function (w) { return w.length >= 3 && /^[A-Z]/.test(w); }); }
  function rosterNames() {
    const out = Object.assign({}, ROSTER);
    Object.keys(DD.defs.heroes).forEach(function (id) { if (!/^test_/.test(id)) out[id] = DD.defs.heroes[id].name; });
    return out;
  }
  /** Hero ids whose name words appear in text (whole word, exact case). */
  function namedIn(text, names) {
    const out = [];
    Object.keys(names).forEach(function (id) {
      if (nameWords(names[id]).some(function (w) { return new RegExp('(^|[^A-Za-z])' + w + '([^A-Za-z]|$)').test(text); })) out.push(id);
    });
    return out;
  }
  function pool(key) { return (DD.defs.narration && DD.defs.narration[key]) || []; }

  // ---- registry and the encounter ----------------------------------------------------------------------------------
  T.suite('boss_goats: registry — the crew (elites, no boss field), skills, statuses, terrains, the rule, objects, the encounter', function (t) {
    if (!ready(t)) return;
    const N = G().N;
    const want = { rap_billy: ['Billy Bleatz', N.billy, 1, 4, 0], rap_kid: ['Lil\' Kid', N.kid, 0, 5, 3], rap_turnip: ['DJ Turnip', N.turnip, 0, 4, 1],
      rap_ursa: ['Ursa Verse', N.ursa, 1, 4, -1] };
    let goats = 0;
    CREW.forEach(function (id) {
      const d = DD.getEnemy(id), w = want[id];
      if (!t.ok(!!d, id + ' registered')) return;
      t.eq(d.name, w[0], id + ': name');
      t.ok(d.act === 4 && d.tier === 'elite' && !d.boss, id + ': an act-4 elite with NO boss field (squad rules: a boss field would make him a boss)');
      t.eq(d.pronoun, 'he', id + ': he (the user, Nov 12)');
      t.ok((d.tags || []).indexOf('goats') >= 0, id + ': tagged goats (the bear is crew too)');
      t.ok(d.hp === w[1] && d.hp >= 60 && d.hp <= 115, id + ': HP ' + d.hp + ' = N (the act-4 band 60-115)');
      t.eq([d.armor, d.mov, d.init].join(','), [w[2], w[3], w[4]].join(','), id + ': armor, move, initiative (addendum §6, move 4 after the author sims)');
      t.ok(d.xp === 6 && JSON.stringify(d.gold) === '[3,6]', id + ': xp 6, gold 3-6');
      t.ok(typeof d.ai === 'function' && !!d.passive && typeof d.passive.desc === 'function' && !d.actsWithOwner, id + ': a custom planner, a live passive line, its own initiative entry');
      t.ok(typeof d.desc === 'string' && d.desc.length >= 40 && d.desc.length <= 120, id + ': a codex desc ≤ 120');
      if (id !== URSA) goats += d.hp;
    });
    t.ok(DD.getEnemy(URSA).flags.large === true && DD.getEnemy(URSA).sprite.scale > DD.getEnemy(BILLY).sprite.scale, 'the bear is large (and the biggest sprite)');
    t.eq(goats, N.billy + N.kid + N.turnip, 'the three goats\' combined HP is N\'s (' + goats + '; the spec\'s 255)');
    t.log('crew HP: goats ' + goats + ', with the bear ' + (goats + N.ursa) + ' (band: squad total 320-365)');
    // skills: exact descs (addendum §7), read from the levels
    const rider = 'At the Called-Out hero, while the Verse has room, it starts a bar or finishes another crew member\'s open bar (+' + N.punch + ' damage).';
    const descs = {
      rap_hook: 'Deal ' + N.hook + ' damage to an adjacent foe and knock it back ' + N.hookKb + ' tiles.',
      rap_gruff: 'Deal ' + N.gruff + ' psychic damage to a foe within 5 he can see. ' + rider,
      rap_kid_stuff: 'Deal ' + N.kidStuff + ' damage to an adjacent foe.',
      rap_what: 'Yell at a foe within ' + N.whatRange + ', no line of sight needed: ' + N.what + ' psychic damage. ' + rider,
      rap_scratch: 'Deal ' + N.scratch + ' psychic damage to a foe within 5 he can see. ' + rider,
      rap_bass: 'Wind-up: next turn the bass drops on the marked squares (one colour of the dance floor): ' + N.bass + ' damage to each hero and hero summon there.',
      rap_block: 'Deal ' + N.block + ' damage to an adjacent foe and Root it through its next turn.',
      rap_big_words: 'Deal ' + N.words + ' psychic damage to a foe within 5 he can see. At the Called-Out hero, while the Verse has room, it is a whole bar on its own (an open bar stays open).',
    };
    Object.keys(descs).forEach(function (id) {
      const d = sk(id);
      if (!t.ok(!!d && d.owner === 'enemy', id + ' registered (enemy skill)')) return;
      t.eq(d.desc(DD.skillLevel(d, 1)), descs[id], id + ': exact desc');
    });
    const bn = sk('rap_bar_none');
    t.ok(bn && bn.windupOnly && bn.target.los === false && JSON.stringify(bn.target.range) === '[1,30]' && bn.anchor === 'unit', 'Bar None: wind-up only, range 1-30, no line of sight, tracks a unit');
    t.eq(bn.levels.map(function (L) { return L.dmg; }).join('/'), N.barNone.join('/'), 'Bar None I / II = ' + N.barNone.join(' / '));
    [1, 2].forEach(function (lv) {
      t.eq(bn.desc(DD.skillLevel(bn, lv)), 'Wind-up: next turn the verse lands on the Called-Out hero, wherever it stands: ' + N.barNone[lv - 1] +
        ' psychic damage, and it is Weakened through its next turn. The Verse resets.', 'Bar None ' + (lv === 1 ? 'I' : 'II') + ': exact desc');
    });
    t.ok(sk('rap_bass').windupOnly && sk('rap_big_words').cooldown === 1, 'the bass is a wind-up; Big Words cd 1');
    t.ok(['rap_gruff', 'rap_what', 'rap_scratch', 'rap_big_words'].every(function (id) { return sk(id).tags.indexOf('diss') >= 0; }) &&
      ['rap_hook', 'rap_kid_stuff', 'rap_block', 'rap_bar_none', 'rap_bass'].every(function (id) { return sk(id).tags.indexOf('diss') < 0; }), 'the disses (and only they) are tagged diss');
    t.ok(sk('rap_what').target.los === false && sk('rap_gruff').target.los === true && sk('rap_scratch').target.los === true, 'WHAT?! needs no sight; Gruff Talk and Scratch That do');
    t.eq(JSON.stringify(DD.getEnemy(BILLY).skills) + JSON.stringify(DD.getEnemy(KID).skills) + JSON.stringify(DD.getEnemy(TURNIP).skills) + JSON.stringify(DD.getEnemy(URSA).skills),
      '["rap_hook","rap_gruff"]["rap_what","rap_kid_stuff"]["rap_scratch"]["rap_block","rap_big_words"]', 'slots (wind-ups are not slots)');
    // statuses, terrains, objects
    const co = DD.getStatus('rap_called_out'), gm = DD.getStatus('rap_golden_mic');
    t.ok(co && co.type === 'debuff' && co.decay === 'never' && gm && gm.type === 'buff' && gm.decay === 'never', 'Called Out (debuff) and Golden Mic (buff): display tokens that never decay');
    ['rap_stage', 'rap_gold', 'rap_pink'].forEach(function (id) {
      const tr = DD.getTerrain(id);
      t.ok(tr && tr.walkable && tr.cost === 1 && !tr.blocksLos && typeof tr.draw === 'function', id + ': walkable plank terrain, cost 1, drawn');
    });
    const mic = DD.getObject('rap_mic_stand'), spk = DD.getObject('rap_speaker'), bale = DD.getObject('rap_bale');
    t.ok(mic && mic.hp === 0 && mic.targetable === false && mic.blocksMove && !mic.blocksLos && mic.interact.ap === 1 && mic.interact.label === 'Clap Back', 'the Mic Stand: indestructible, Clap Back for 1 AP');
    t.eq(mic.desc, 'Clap Back (1 AP, next to the stand, once per round, while the goats have a verse going; not the Called-Out hero): you become the ' +
      'Called-Out hero, the open bar hangs, a Bar None being wound up turns on you, and the crowd tips the party ' + N.clapHype + ' Hype. ' +
      'Syllamin\'s clap back also deals ' + N.syllaminClap + ' psychic damage to each crew member who can see him.', 'the Mic Stand desc (addendum §9)');
    t.ok(spk && spk.hp === N.speakerHp && spk.targetable === true && spk.blocksLos && spk.yawAware && spk.desc.indexOf(N.speakerHp + ' HP') >= 0 &&
      /any single-target damage skill can break it/.test(spk.desc), 'Speaker Stack: ' + N.speakerHp + ' HP, aimable, the uniform object words');
    t.ok(bale && bale.hp === N.baleHp && bale.targetable === true && bale.react.fire.destroy && bale.desc.indexOf(N.baleHp + ' HP') >= 0 &&
      /any single-target damage skill can break it/.test(bale.desc) && /fire burns it away/.test(bale.desc), 'Hay Bale: ' + N.baleHp + ' HP, burns');
    ['rap_mound', 'rap_lump'].forEach(function (id) { const o = DD.getObject(id); t.ok(o && o.hp === 0 && o.targetable === false && o.blocksLos, id + ': indestructible cover, never aimed'); });
    // the encounter
    const e = DD.getEncounter(ENC);
    t.ok(e.act === 4 && e.kind === 'boss' && e.weight === 0, 'act 4, a boss fight, weight 0 (never a random pick)');
    t.ok(e.gauntlet && e.gauntlet.lane === 'goats' && e.gauntlet.order === 5 && e.gauntlet.hint === 'A bar takes two goats: shut one up. Or take the mic.', 'gauntlet lane goats, order 5, the hint');
    t.ok(e.name === 'The Rapping Goats' && e.shortName === 'The Rapping Goats' && e.shortName.length <= 24 && e.icon === '🐐', 'the user\'s name, shortName, 🐐');
    t.ok(e.banner === false && e.cameo && e.cameo.start === 'svam_cameo_goats' && e.cameo.cheat === 'svam_cameo_radio', 'banner: false; the cameo pools and the Radio Edit (the user\'s pick, Nov 13)');
    t.eq(JSON.stringify(e.objective.bossIds), JSON.stringify(CREW), 'objective: a squad of the four (the bear counts from his entrance)');
    t.ok(e.reward && e.reward.goldMult === 0.9 && e.reward.itemRarity === 'rare', 'door reward goldMult 0.9 + a rare (lead patch P5)');
    t.ok(e.map.theme === 'a4_barn' && e.rules.length === 1 && e.rules[0].id === 'rap_verse' && e.rules[0].turns === -1, 'theme a4_barn, one rule: the Verse');
    t.ok(e.intro.length <= 160 && /black goats/.test(e.intro), 'the intro (the only place the fur colour is said)');
    if (DD.Themes && DD.Themes.has && DD.Themes.has('a4_barn')) {
      const th = DD.Themes.get('a4_barn');
      t.ok(th.name === 'The Barn Burner' && th.act === 4, 'theme a4_barn "The Barn Burner" (MAPGEN)');
      const m = DD.MapGen.generate({ theme: 'a4_barn', w: 12, h: 12, rng: DD.RNG('barn') });
      t.ok(m && m.grid && m.grid.tiles.length === 144, 'and it generates');
    } else t.log('theme a4_barn not registered yet (MAPGEN): the fight uses the fallback theme');
  });

  // ---- the arena ------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: the Barn Burner — layout, the gold / pink dance floor, the stage, cover that hides, deploy distances', function (t) {
    if (!ready(t)) return;
    const s = scene(1);
    t.ok(s.grid.w === 15 && s.grid.h === 14, '15 × 14');
    const floor = s.grid.tiles.filter(function (x) { return x.tag === 'dancefloor' || x.t === 'rap_gold' || x.t === 'rap_pink'; });
    const gold = floor.filter(function (x) { return x.t === 'rap_gold'; }), pink = floor.filter(function (x) { return x.t === 'rap_pink'; });
    t.ok(floor.length === 39 && gold.length === 23 && pink.length === 16, 'the dance floor: 39 squares, 23 gold and 16 pink (' + floor.length + ' / ' + gold.length + ' / ' + pink.length + ')');
    t.ok(gold.every(function (x) { return (x.x + x.y) % 2 === 1; }) && pink.every(function (x) { return (x.x + x.y) % 2 === 0; }), 'a checkerboard: gold on odd x + y, pink on even');
    t.ok(floor.every(function (x) { return !x.obj && x.h === 0 && DD.Grid.dist(x, { x: 7, y: 6 }) <= 4; }), 'h0, no object, within 4 of the Mic Stand');
    const st = G().stand(s);
    t.ok(st && st.x === 7 && st.y === 6, 'the Mic Stand at (7,6)');
    t.ok([[7, 5], [6, 6], [8, 6], [7, 7]].every(function (p) { return DD.Grid.tile(p[0], p[1]).t === 'rap_pink'; }), 'its four neighbours are pink (mind the bass when you clap back)');
    const stage = s.grid.tiles.filter(function (x) { return x.t === 'rap_stage'; });
    t.ok(stage.length === 15 && stage.every(function (x) { return x.x >= 5 && x.x <= 9 && x.y <= 2 && x.h === (x.x === 7 && x.y === 1 ? 2 : 1); }), 'the hayloft stage h1 (x 5-9, y 0-2), the DJ dais h2');
    const objs = function (id) { return s.grid.tiles.filter(function (x) { return x.obj && x.obj.id === id; }).map(function (x) { return x.x + ',' + x.y; }).sort(); };
    t.eq(objs('rap_speaker').join(' '), '10,1 4,1', 'two Speaker Stacks');
    t.eq(objs('rap_mound').join(' '), '0,0 0,1 1,0', 'three Hay Mounds');
    t.eq(objs('rap_lump').join(' '), '1,1', 'the Snoring Lump in the corner');
    t.eq(objs('rap_bale').length, 9, 'nine Hay Bales');
    const posts = s.grid.tiles.filter(function (x) { return x.obj && x.obj.id === 'pillar'; });
    t.ok(posts.length === 4 && posts.every(function (x) { return x.obj.label === 'Barn Post'; }), 'four Barn Posts');
    const pos0 = { rap_billy: '7,4', rap_kid: '12,6', rap_turnip: '7,1' };
    Object.keys(pos0).forEach(function (id) { const u = who(id); t.eq(u && u.x + ',' + u.y, pos0[id], id + ' starts at ' + pos0[id]); });
    t.ok(!who(URSA), 'no bear yet');
    const deploy = s.grid.tiles.filter(function (x) { return x.zone === 'hero'; });
    t.eq(deploy.length, 20, '20 deploy tiles');
    t.ok(deploy.every(function (x) { return DD.Grid.dist(x, { x: 7, y: 4 }) >= 7 && DD.Grid.dist(x, { x: 7, y: 1 }) >= 7; }), 'deploy is 7+ tiles from Billy and the dais (round 1 is an approach)');
    // each bale and post hides at least one walkable tile from the dais or Billy's start
    const eyes = [{ x: 7, y: 1 }, { x: 7, y: 4 }];
    const walk = s.grid.tiles.filter(function (x) { return DD.Grid.passable ? !x.obj : !x.obj; });
    // the three bales stacked in the far corner (13,0), (14,0), (14,1) are hay storage against the walls: nothing walkable
    // lies behind them (deviation noted in docs/notes/boss-goats.md); every other bale and post is cover
    const corner = { '13,0': 1, '14,0': 1, '14,1': 1 };
    const cover = s.grid.tiles.filter(function (x) { return x.obj && (x.obj.id === 'rap_bale' || x.obj.id === 'pillar') && !corner[x.x + ',' + x.y]; });
    t.eq(cover.length, 10, 'six floor bales and four posts are cover');
    // (eye, tile) pairs out of sight, with and without the piece of cover
    const hidden = function () { let n = 0; walk.forEach(function (w) { eyes.forEach(function (e) { if (!DD.Grid.los(e, w)) n++; }); }); return n; };
    cover.forEach(function (c) {
      const before = hidden();
      const o = c.obj;
      c.obj = null;
      const after = hidden();
      c.obj = o;
      t.ok(before > after, o.id + ' at ' + c.x + ',' + c.y + ' hides ' + (before - after) + ' tile(s) from the dais or Billy\'s start');
    });
    t.ok(s.rules.some(function (r) { return r.id === 'rap_verse'; }) && s.data.rap && s.data.rap.holder === who(BILLY).id, 'the Verse rule is in, the Golden Mic on Billy');
  });

  // ---- skills against their descs ----------------------------------------------------------------------------------------
  T.suite('boss_goats: skills — desc == execute (hook, Headliner, sight, WHAT?! through a post, Writer\'s Block, Big Words, the bass, Bar None I / II)', function (t) {
    if (!ready(t)) return;
    const N = G().N;
    // Catchy Hook: 9 and a knockback of 2
    scene(2, { test_knight: [1, 13], test_mage: [4, 13], rap_billy: [3, 13] });
    const mg = who('test_mage'), b = who(BILLY);
    t.eq(estimate(b, 'rap_hook', mg), exp(N.hook), 'Catchy Hook estimate ' + exp(N.hook));
    t.eq(hpLost(mg, function () { useNow(b, 'rap_hook', mg); }), exp(N.hook), 'Catchy Hook deals ' + exp(N.hook));
    t.ok(mg.x === 4 + N.hookKb && mg.y === 13, 'and knocks the foe back ' + N.hookKb + ' tiles (' + mg.x + ',' + mg.y + ')');
    // Headliner: +2 to a foe next to the Mic Stand (a non-mark hero: no verse in it), estimate = preview = result
    scene(3, { test_mage: [7, 5], rap_billy: [7, 3] });
    const m2 = who('test_mage'), b2 = who(BILLY);
    t.ok(R().mark !== m2.id, 'the mage is not the Called-Out hero');
    const e2 = estimate(b2, 'rap_gruff', m2), p2 = previewDmg(b2, 'rap_gruff', m2);
    const d2 = hpLost(m2, function () { useNow(b2, 'rap_gruff', m2); });
    t.ok(d2 === exp(N.gruff, N.micGuard) && e2 === d2 && p2 === d2, 'Headliner: Gruff Talk next to the stand ' + d2 + ' = estimate ' + e2 + ' = preview ' + p2 + ' (' + N.gruff + ' + ' + N.micGuard + ')');
    pos(m2, 5, 5);
    const d3 = hpLost(m2, function () { useNow(b2, 'rap_gruff', m2); });
    t.eq(d3, exp(N.gruff), 'away from the stand: ' + exp(N.gruff));
    // sight: a Barn Post between (3,8) and (3,10)
    scene(4, { test_mage: [3, 10], rap_billy: [3, 8], rap_kid: [2, 8], rap_turnip: [4, 8] });
    const m4 = who('test_mage');
    t.ok(!DD.Grid.los({ x: 3, y: 8 }, m4), 'the post at (3,9) blocks the line');
    t.ok(!DD.Targeting.isValidTarget(who(BILLY), sk('rap_gruff'), 3, 10), 'Gruff Talk needs sight');
    t.ok(!DD.Targeting.isValidTarget(who(TURNIP), sk('rap_scratch'), 4, 10) || DD.Grid.los(who(TURNIP), m4), 'Scratch That needs sight');
    pos(who(KID), 3, 8); pos(who(BILLY), 2, 8);
    t.ok(DD.Targeting.isValidTarget(who(KID), sk('rap_what'), 3, 10), 'WHAT?! needs none');
    t.eq(hpLost(m4, function () { useNow(who(KID), 'rap_what', m4); }), exp(N.what), 'WHAT?! through the post: ' + exp(N.what) + ' psychic');
    // Writer's Block and Big Words (the bear, brought in by his entrance)
    scene(5, { test_knight: [6, 13], test_mage: [4, 13] });
    act(function () { G().entrance(); });
    const bear = who(URSA);
    if (!t.ok(!!bear && bear.x === 1 && bear.y === 1, 'the entrance spawns the bear at (1,1)')) return;
    pos(bear, 3, 13);
    const m5 = who('test_mage');
    t.eq(hpLost(m5, function () { useNow(bear, 'rap_block', m5); }), exp(N.block), 'Writer\'s Block deals ' + exp(N.block));
    const rt = DD.Act.getStatus(m5, 'root');
    t.ok(rt && rt.turns === 1, 'and Roots it through its next turn');
    const kn = who('test_knight');
    t.eq(R().mark, kn.id, 'the knight is called out');
    const open0 = R().open = { by: who(KID).id, line: null };
    t.eq(hpLost(kn, function () { useNow(bear, 'rap_big_words', kn); }), exp(N.words), 'Big Words deals ' + exp(N.words) + ' (no punchline: a whole bar on its own)');
    t.ok(R().verse === 1 && R().open && R().open.by === open0.by, 'Big Words: +1 bar alone, the open bar stays open');
    // the bass: 10 on the marked colour only, never the crew
    scene(6, { test_knight: [6, 3], test_cleric: [5, 4], test_mage: [7, 3], test_rogue: [12, 13] });
    const tn = who(TURNIP);
    S().aiOff = false;
    turn(tn);
    S().aiOff = true;
    const it = windup(tn, 'rap_bass');
    if (!t.ok(!!it, 'DJ Turnip winds up the bass')) return;
    const gold = G().danceTiles(S(), 'gold');
    t.ok(it.tiles.length === gold.length && it.tiles.every(function (p) { return gold.some(function (q) { return q.x === p.x && q.y === p.y; }); }), 'on the gold squares (2 heroes there, 1 on pink): ' + it.tiles.length + ' tiles');
    // V3.1 polish (QA FIGHTS-13): the wind-up washes its squares in the colour its hint names (the gold tiles' own top),
    // so the marked squares read gold, not the default red-over-gold salmon
    const goldTop = DD.getTerrain && DD.getTerrain('rap_gold') ? DD.getTerrain('rap_gold').colors.top : null;
    t.ok(it.data && it.data.hint === 'Bass → gold squares' && !!goldTop && it.data.tint === goldTop, 'the hint names gold and the tint is the gold squares\' colour (' + (it.data && it.data.tint) + ')');
    const pinkTop = DD.getTerrain && DD.getTerrain('rap_pink') ? DD.getTerrain('rap_pink').colors.top : null;
    t.ok(!!pinkTop && pinkTop !== goldTop, 'the pink squares have their own colour for a pink bass (' + pinkTop + ')');
    t.eq(DD.AI.intentDmg(tn, it), exp(N.bass), 'the marked number ' + exp(N.bass));
    const bl = who(BILLY);
    t.eq(DD.Grid.tile(bl.x, bl.y).t, 'rap_gold', 'Billy dances on a gold square');
    const k6 = who('test_knight'), c6 = who('test_cleric'), m6 = who('test_mage');
    const h0 = [k6.hp, c6.hp, m6.hp, bl.hp];
    turn(tn);
    t.ok(h0[0] - k6.hp === exp(N.bass) && h0[1] - c6.hp === exp(N.bass), 'the bass drops ' + exp(N.bass) + ' on each hero on gold');
    t.ok(h0[2] === m6.hp && h0[3] === bl.hp, 'nothing on pink, nothing on the crew (they dance on the beat)');
    // Bar None I (Billy) and II (the bear): the number on the mark, Weakened through its next turn
    [[BILLY, 1], [URSA, 2]].forEach(function (c) {
      scene(7 + c[1], { test_knight: [3, 13] });
      if (c[0] === URSA) act(function () { G().entrance(); });
      const h = who(c[0]), k = who('test_knight');
      t.eq(R().holder, h.id, h.name + ' holds the Golden Mic');
      setVerse(3);
      turn(h);
      const bi = windup(h, 'rap_bar_none');
      if (!t.ok(!!bi && bi.level === c[1] && bi.unitId === k.id, h.name + ' winds up Bar None ' + (c[1] === 1 ? 'I' : 'II') + ' on the Called-Out hero')) return;
      const marked = DD.AI.intentDmg(h, bi);
      t.eq(marked, exp(N.barNone[c[1] - 1]), 'marked ' + marked);
      bare(k);
      const d = hpLost(k, function () { turn(h); });
      t.eq(d, marked, 'lands ' + d + ' (= the mark)');
      const wk = DD.Act.getStatus(k, 'weak');
      t.ok(wk && wk.turns === 1, 'Weakened through its next turn');
      t.ok(R().verse === 0 && !R().pending && R().stats.barNone === 1, 'the Verse resets');
    });
  });

  // ---- bars ----------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: bars — A starts, B finishes (+3, preview = result, high ground, Weakened), no self-rhymes, Block counts, caps, charm, taunt', function (t) {
    if (!ready(t)) return;
    const N = G().N;
    const place = { test_knight: [7, 13], test_mage: [2, 13], test_cleric: [12, 13], test_rogue: [13, 13], rap_billy: [7, 11], rap_kid: [9, 12], rap_turnip: [5, 12] };
    scene(10, place);
    const k = who('test_knight'), kid = who(KID), b = who(BILLY), tn = who(TURNIP);
    t.eq(R().mark, k.id, 'the knight (most max HP) is called out');
    t.eq(hpLost(k, function () { useNow(kid, 'rap_what', k); }), exp(N.what), 'WHAT?! at the Called-Out hero: ' + exp(N.what) + ' (starting a bar adds nothing)');
    t.ok(R().open && R().open.by === kid.id && R().verse === 0 && R().stats.started === 1, 'Lil\' Kid starts a bar');
    t.ok(logHas(/Lil' Kid starts a bar about Sir Testsalot\./), 'logged');
    // Billy finishes: +3 in the same hit; preview, estimate and result agree
    const pr = previewDmg(b, 'rap_gruff', k), es = estimate(b, 'rap_gruff', k);
    const rapBefore = JSON.stringify(R()), logN = S().log.length;
    t.eq(JSON.stringify(R()), rapBefore, 'the preview left the verse alone');
    t.eq(S().log.length, logN, 'and the log');
    const dd = hpLost(k, function () { useNow(b, 'rap_gruff', k); });
    t.ok(dd === exp(N.gruff, N.punch) && pr === dd && es === dd, 'Billy finishes it: ' + dd + ' = ' + N.gruff + ' + ' + N.punch + ' (preview ' + pr + ', estimate ' + es + ')');
    t.ok(R().verse === 1 && !R().open && R().stats.bars === 1, 'Verse 1/3, no bar open');
    t.ok(logHas(/Billy Bleatz finishes it: \+3 damage\. Verse 1\/3\./), 'logged');
    const rule = S().rules.filter(function (r) { return r.id === 'rap_verse'; })[0];
    t.ok(/^📝 Verse 1\/3 → Sir Testsalot$/.test(rule.name), 'the chip reads "' + rule.name + '"');
    t.ok(/Now: 1\/3 on Sir Testsalot; no bar open\. Golden Mic: Billy Bleatz\.$/.test(rule.desc), 'the chip tooltip carries the verse so far');
    t.ok(/Crew \d+\/\d+ · something in the hay wakes at \d+/.test(S().objective.flavor), 'objective flavour: ' + S().objective.flavor);
    // a goat can't rhyme with himself
    useNow(kid, 'rap_what', k);
    const d2 = hpLost(k, function () { useNow(kid, 'rap_what', k); });
    t.ok(d2 === exp(N.what) && R().open.by === kid.id && R().verse === 1, 'the starter\'s second diss adds no +3 and leaves his bar open');
    // the finisher on high ground, then Weakened: still preview = result
    scene(11, { test_knight: [6, 4], test_mage: [2, 13], rap_billy: [6, 2], rap_kid: [9, 6] });
    const k2 = who('test_knight'), b2 = who(BILLY), kid2 = who(KID);
    useNow(kid2, 'rap_what', k2);
    t.ok(DD.Grid.tile(6, 2).h > DD.Grid.tile(6, 4).h, 'Billy on the stage (high ground)');
    const pr2 = previewDmg(b2, 'rap_gruff', k2), d4 = hpLost(k2, function () { useNow(b2, 'rap_gruff', k2); });
    t.ok(pr2 === d4 && d4 === Math.round(N.gruff * F() * 1.25 + N.punch), 'high ground: preview ' + pr2 + ' = result ' + d4);
    useNow(kid2, 'rap_what', k2);
    act(function () { DD.Act.addStatus(b2, 'weak', { turns: 2 }); });
    const pr3 = previewDmg(b2, 'rap_gruff', k2), es3 = estimate(b2, 'rap_gruff', k2), d5 = hpLost(k2, function () { useNow(b2, 'rap_gruff', k2); });
    t.ok(pr3 === d5 && es3 === d5 && d5 === Math.round(N.gruff * F() * 1.25 * 0.75 + N.punch), 'a Weakened finisher on high ground: preview ' + pr3 + ' = estimate ' + es3 + ' = result ' + d5);
    t.eq(R().verse, 2, 'two bars');
    // Block still counts (the line was delivered); Invulnerable doesn't
    scene(12, place);
    const k3 = who('test_knight'), kid3 = who(KID), b3 = who(BILLY);
    k3.block = 50;
    useNow(kid3, 'rap_what', k3);
    t.ok(k3.block < 50 && R().open && R().open.by === kid3.id, 'a diss soaked by Block still starts a bar');
    useNow(b3, 'rap_gruff', k3);
    t.ok(R().verse === 1, 'and a soaked finisher still finishes it');
    k3.block = 0;
    act(function () { DD.Act.addStatus(k3, 'invulnerable', { turns: 1 }); });
    useNow(kid3, 'rap_what', k3);
    t.ok(!R().open, 'an Invulnerable hero takes nothing: no bar');
    act(function () { DD.Act.removeStatus(k3, 'invulnerable', { silent: true }); });
    // a full verse or a pending Bar None takes no bars (and no punchline)
    setVerse(3);
    useNow(kid3, 'rap_what', k3);
    t.ok(!R().open && R().verse === 3, 'Verse full: no bar starts');
    setVerse(2);
    R().pending = b3.id;
    useNow(kid3, 'rap_what', k3);
    t.ok(!R().open && R().verse === 2, 'Bar None pending: no bar starts');
    R().pending = null;
    // a diss at anyone else does nothing to the verse
    const mg = who('test_mage');
    pos(mg, 8, 13);
    useNow(kid3, 'rap_what', mg);
    t.ok(!R().open, 'a diss at a hero who is not called out builds nothing');
    // charmed: he fights for the heroes, no bar, no punchline
    useNow(kid3, 'rap_what', k3);
    act(function () { DD.Act.addStatus(b3, 'charmed', { turns: 1 }, mg); });
    t.eq(estimate(b3, 'rap_gruff', k3), exp(N.gruff), 'a charmed goat\'s estimate has no punchline');
    useNow(b3, 'rap_gruff', k3);
    t.ok(R().verse === 2 && R().open && R().open.by === kid3.id, 'a charmed goat finishes nothing');
    act(function () { DD.Act.removeStatus(b3, 'charmed', { silent: true }); });
    // taunted: he must attack his taunter; a bar only when the taunter is the Called-Out hero
    scene(13, { test_knight: [7, 13], test_mage: [3, 11], test_cleric: [12, 13], test_rogue: [13, 13], rap_billy: [6, 9], rap_kid: [9, 12], rap_turnip: [1, 3] });
    const k4 = who('test_knight'), m4 = who('test_mage'), b4 = who(BILLY), kid4 = who(KID);
    useNow(kid4, 'rap_what', k4);
    act(function () { DD.Act.addStatus(b4, 'taunt', { turns: 1 }, m4); });
    const mh = m4.hp;
    plan(b4);
    t.ok(m4.hp < mh && R().verse === 0 && R().open && R().open.by === kid4.id, 'taunted by another hero: Billy hits the taunter, the bar stays open');
    act(function () { DD.Act.removeStatus(b4, 'taunt', { silent: true }); DD.Act.addStatus(b4, 'taunt', { turns: 1 }, k4); });
    pos(b4, 6, 9);
    plan(b4);
    t.ok(R().verse === 1 && !R().open, 'taunted by the Called-Out hero: the bar is finished');
  });

  // ---- hangs ---------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: hangs — at the starter\'s next turn (stunned too), at his fall, on every change of the Called-Out hero', function (t) {
    if (!ready(t)) return;
    const place = { test_knight: [7, 13], test_mage: [2, 13], rap_billy: [7, 11], rap_kid: [9, 12], rap_turnip: [5, 12] };
    scene(20, place);
    const k = who('test_knight'), kid = who(KID);
    useNow(kid, 'rap_what', k);
    turn(kid);
    t.ok(!R().open && R().stats.hung === 1 && R().verse === 0, 'the starter\'s next turn begins: his bar hangs');
    t.ok(logHas(/Lil' Kid's bar hangs in the air\. Awkward\./), 'logged');
    useNow(kid, 'rap_what', k);
    act(function () { DD.Act.addStatus(kid, 'stun', { turns: 1 }); });
    turn(kid);
    t.ok(!R().open && R().stats.hung === 2, 'also when that turn is a stunned one');
    scene(21, place);
    const k2 = who('test_knight'), kid2 = who(KID);
    useNow(kid2, 'rap_what', k2);
    kill(kid2);
    t.ok(!R().open && R().stats.hung === 1, 'the starter falls: his bar hangs');
    scene(22, place);
    const kid3 = who(KID), k3 = who('test_knight');
    useNow(kid3, 'rap_what', k3);
    act(function () { G().callOut(who('test_mage'), 'test'); });
    t.ok(!R().open && R().mark === who('test_mage').id && R().stats.hung === 1, 'the Called-Out hero changes: the bar hangs');
    t.ok(!has(k3, 'rap_called_out') && has(who('test_mage'), 'rap_called_out'), 'the 🗣️ token moves');
  });

  // ---- Bar None --------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: Bar None — wound up at 3 bars, never by a silenced holder, tracks, lands, a new call-out by damage (summons count for owners)', function (t) {
    if (!ready(t)) return;
    const N = G().N;
    const place = { test_knight: [7, 13], test_mage: [2, 13], test_cleric: [12, 13], test_rogue: [13, 13], rap_billy: [7, 9], rap_kid: [9, 12], rap_turnip: [5, 12] };
    scene(30, place);
    const k = who('test_knight'), b = who(BILLY), kid = who(KID);
    setVerse(2);
    turn(b);
    t.ok(!windup(b, 'rap_bar_none') && !R().pending, 'Verse 2: no Bar None');
    setVerse(3);
    turn(kid);
    t.ok(!windup(kid, 'rap_bar_none'), 'only the Golden Mic holder winds it up');
    turn(b);
    const it = windup(b, 'rap_bar_none');
    t.ok(it && it.unitId === k.id && R().pending === b.id && !R().landed, 'Verse 3: Billy winds up Bar None at the end of his turn, tracking the Called-Out hero');
    t.ok(logHas(/Billy Bleatz winds up Bar None/), 'the engine logs the wind-up');
    const rule = S().rules.filter(function (r) { return r.id === 'rap_verse'; })[0];
    t.eq(rule.name, '📝 BAR NONE ⏳ → Sir Testsalot', 'the chip');
    t.ok(/Now: Bar None ⏳ on Sir Testsalot \(Billy Bleatz\)\.$/.test(rule.desc), 'the tooltip');
    useNow(kid, 'rap_what', k);
    t.ok(!R().open && R().verse === 3, 'no bars while Bar None is pending');
    pos(k, 10, 13);
    const tp = DD.AI.intentTarget(b, it);
    t.ok(tp && tp.x === 10 && tp.y === 13, 'it follows the hero');
    // the new call-out: the hero who hurt the crew most since the last call-out; a summon's damage counts for its owner
    const mg = who('test_mage'), cl = who('test_cleric');
    let hound = null;
    act(function () { hound = DD.Act.summon(mg, 'test_hound', 3, 13, { silent: true }); });
    t.ok(!!hound, 'the mage\'s hound');
    hit(cl, who(TURNIP), 6);
    hit(hound, who(TURNIP), 9);
    t.ok(R().dealt[mg.id] === 9 && R().dealt[cl.id] === 6 && !R().dealt[hound.id], 'the hound\'s damage is credited to the mage');
    bare(k);
    const d = hpLost(k, function () { turn(b); });
    t.eq(d, exp(N.barNone[0]), 'Bar None lands ' + d);
    t.ok(R().verse === 0 && !R().pending && R().landed && R().mark === mg.id && has(mg, 'rap_called_out'), 'the Verse resets and the mage (9 by his hound) is called out');
    t.ok(logHas(/Bar None lands on Sir Testsalot\. The crowd goes OOOH\. The goats call out Wizzy McTest\./), 'logged');
    t.ok(JSON.stringify(R().dealt) === '{}', 'the tally resets with every call-out');
    // ties: the most max HP, then party order; summons and downed heroes are never called out
    R().dealt = {};
    R().dealt[hound.id] = 99;
    const next = G().pickNext(S());
    t.ok(next && next.kind === 'hero', 'a summon is never picked');
    const top = heroes().filter(function (h) { return !h.downed; }).sort(function (a, c) { return c.maxHp - a.maxHp; })[0];
    t.eq(next.id, top.id, 'nobody hurt the crew: the most max HP (' + top.name + ')');
    scene(31, null, { ids: ['test_mage', 'test_rogue'], level: 5 });
    t.ok(who('test_mage').maxHp === who('test_rogue').maxHp && R().mark === who('test_mage').id, 'equal max HP: party order (the mage first)');
    // never wound up by a stunned, asleep, frozen, sheeped or charmed holder
    ['stun', 'sleep', 'frozen', 'sheep', 'charmed'].forEach(function (id, i) {
      scene(32 + i, place);
      const h = who(BILLY);
      setVerse(3);
      act(function () { DD.Act.addStatus(h, id, { turns: 2 }, who('test_mage')); });
      turn(h);
      t.ok(!windup(h, 'rap_bar_none') && !R().pending, id + ': no Bar None');
    });
    // he finished the third bar himself (his own planner): wound up at the end of that turn
    scene(40, { test_knight: [7, 13], test_mage: [2, 13], test_cleric: [12, 13], test_rogue: [13, 13], rap_billy: [7, 9], rap_kid: [9, 12], rap_turnip: [1, 3] });
    setVerse(2);
    useNow(who(KID), 'rap_what', who('test_knight'));
    plan(who(BILLY));
    t.ok(R().stats.bars === 1 && R().verse === 3 && windup(who(BILLY), 'rap_bar_none'), 'Billy finishes the third bar and winds up in the same turn');
  });

  T.suite('boss_goats: Bar None — interrupted, fizzled (stealth, a downed hero), a Dazzled miss, the holder killed (Tribute, the mic passes)', function (t) {
    if (!ready(t)) return;
    const place = { test_knight: [7, 13], test_mage: [2, 13], test_cleric: [12, 13], test_rogue: [13, 13], rap_billy: [7, 9], rap_kid: [9, 12], rap_turnip: [5, 12] };
    const cancels = [];
    const on = function (e) { cancels.push(e && e.reason); };
    DD.Events.on('windup:cancel', on);
    try {
      ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (id, i) {
        scene(50 + i, place);
        const b = who(BILLY);
        setVerse(3);
        turn(b);
        t.ok(!!windup(b, 'rap_bar_none'), id + ': wound up');
        const n0 = cancels.length;
        act(function () { DD.Act.addStatus(b, id, { turns: 1 }, who('test_mage')); });
        t.ok(!windup(b, 'rap_bar_none') && R().verse === 0 && !R().pending && R().stats.cut === 1, id + ' on the holder: Bar None falls flat, the Verse is dead');
        t.ok(cancels.length > n0, id + ': the engine\'s windup:cancel fires (Svammiel\'s svam_countered can hear it)');
        t.ok(logHas(/Bar None falls flat\. The verse is dead\./), id + ': logged');
      });
    } finally { DD.Events.off('windup:cancel', on); }
    // the Called-Out hero stealths: it fizzles at the landing, the Verse resets at the holder's turn end
    scene(55, place);
    const b = who(BILLY), k = who('test_knight');
    setVerse(3);
    turn(b);
    act(function () { DD.Act.addStatus(k, 'stealth', { turns: 3 }); });
    t.eq(S().rules.filter(function (r) { return r.id === 'rap_verse'; })[0].name, '📝 BAR NONE ⏳ → nobody', 'the chip knows it has lost the hero');
    const hp = k.hp;
    turn(b);
    t.ok(k.hp === hp && R().verse === 0 && !R().pending && R().stats.fizzled === 1 && R().mark === k.id, 'stealthed: it fizzles, the Verse resets, no new call-out');
    // [review] the chip follows the tracked hero back: stealth broken, or a Help Up, before the landing (no hook fires on a
    // revive: the chip re-reads at every turn boundary), so it never says "nobody" about a hero it will hit
    scene(61, place);
    const b6 = who(BILLY), k6 = who('test_knight');
    const chip6 = function () { return S().rules.filter(function (r) { return r.id === 'rap_verse'; })[0].name; };
    setVerse(3);
    turn(b6);
    act(function () { DD.Act.addStatus(k6, 'stealth', { turns: 3 }); });
    t.eq(chip6(), '📝 BAR NONE ⏳ → nobody', 'stealthed: → nobody');
    act(function () { DD.Act.removeStatus(k6, 'stealth'); });
    t.eq(chip6(), '📝 BAR NONE ⏳ → Sir Testsalot', 'stealth broken before the landing: the chip names him again');
    k6.hp = 1;
    hit(who(KID), k6, 20);
    t.ok(k6.downed && chip6() === '📝 BAR NONE ⏳ → nobody', 'downed: → nobody');
    act(function () { DD.Act.revive(k6, 0.5); });
    turn(who('test_mage'));
    t.eq(chip6(), '📝 BAR NONE ⏳ → Sir Testsalot', 'helped up: by the next turn boundary the chip names him again');
    const hp6 = k6.hp;
    turn(b6);
    t.ok(k6.hp < hp6 && R().stats.barNone === 1, 'and Bar None lands on him (the engine tracks a revived hero)');
    // the Called-Out hero goes down: reset, a new call-out, the pending wind-up fizzles
    scene(56, place);
    const b2 = who(BILLY), k2 = who('test_knight');
    setVerse(3);
    turn(b2);
    k2.hp = 1;
    hit(who(KID), k2, 20);
    t.ok(k2.downed && R().verse === 0 && R().mark && R().mark !== k2.id && !has(k2, 'rap_called_out'), 'the hero goes down: the Verse resets and someone else is called out');
    t.ok(R().pending === b2.id, 'the wind-up still waits (it will fizzle)');
    turn(b2);
    t.ok(!R().pending && R().stats.fizzled === 1 && R().verse === 0, 'and fizzles at the landing');
    // a Dazzled holder's skewed landing on an empty tile: a miss, the Verse resets, no new call-out
    scene(57, place);
    const b3 = who(BILLY), k3 = who('test_knight');
    setVerse(3);
    turn(b3);
    act(function () { DD.Act.addStatus(b3, 'dazzled', { turns: 3 }); });
    const it = windup(b3, 'rap_bar_none');
    it.skew = { off: { x: 0, y: -1 } };
    t.ok(!DD.Grid.unitAt(7, 12), 'the tile it now lands on is empty');
    const hp3 = k3.hp;
    turn(b3);
    t.ok(k3.hp === hp3 && R().verse === 0 && !R().pending && R().stats.missed === 1 && R().mark === k3.id, 'a Dazzled miss: nobody hit, the Verse resets, the call-out stays');
    t.ok(logHas(/Bar None lands on an empty tile\./), 'logged');
    // [review] charmed AFTER the wind-up: wind-ups ignore charm (the engine's rule, as the bass), so it lands exactly as
    // marked (it used to show 22 on the hero and then land on nobody: the hostility check saw the charm)
    scene(59, place);
    const b5 = who(BILLY), k5 = who('test_knight');
    setVerse(3);
    turn(b5);
    act(function () { DD.Act.addStatus(b5, 'charmed', { turns: 1 }, who('test_mage')); });
    const w5 = DD.AI.windups().filter(function (w) { return w.skillId === 'rap_bar_none'; })[0];
    const shown5 = w5 ? w5.dmg : -1;
    t.ok(!!windup(b5, 'rap_bar_none') && R().pending === b5.id && S().rules.filter(function (r) { return r.id === 'rap_verse'; })[0].name === '📝 BAR NONE ⏳ → Sir Testsalot',
      'charm does not interrupt Bar None (stun-likes and sheep do); the chip still names the hero');
    const d5 = hpLost(k5, function () { turn(b5); });
    t.ok(d5 > 0 && d5 === shown5 && d5 === exp(G().N.barNone[0]) && has(k5, 'weak') && R().verse === 0 && !R().pending && R().stats.barNone === 1 && !R().stats.missed,
      'a charmed holder\'s Bar None lands as marked: ' + d5 + ' = the number shown (' + shown5 + '), Weakened, the Verse resets');
    // the holder killed with Bar None pending: reset, then the Tribute, then the mic passes (Billy → Lil' Kid)
    scene(58, place);
    const b4 = who(BILLY);
    setVerse(3);
    turn(b4);
    kill(b4);
    t.ok(!R().pending && R().verse === 1 && R().stats.tributes === 1, 'Billy falls mid-wind-up: Verse 0, then the Tribute: 1');
    t.eq(R().holder, who(KID).id, 'the Golden Mic passes to Lil\' Kid');
    t.ok(has(who(KID), 'rap_golden_mic'), 'with its 🎙️ token');
  });

  // ---- call-outs ------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: call-outs — Betty first (his line), else the most max HP; tokens survive a cleanse; the spotlight zone', function (t) {
    if (!ready(t)) return;
    scene(60);
    const k = who('test_knight');
    t.ok(R().mark === k.id && has(k, 'rap_called_out'), 'no Betty: the most max HP is called out at the start (during deployment)');
    t.ok(has(who(BILLY), 'rap_golden_mic'), 'Billy holds the Golden Mic');
    const z = (S().data.zones || []).filter(function (x) { return x.id === 'rap_spotlight'; })[0];
    t.ok(z && z.tiles[0].x === k.x && z.tiles[0].y === k.y, 'a spotlight zone on the Called-Out hero (E8, state.data.zones)');
    act(function () { DD.Act.cleanse(k, 'debuff'); DD.Act.cleanse(who(BILLY), 'buff'); });
    t.ok(has(k, 'rap_called_out') && has(who(BILLY), 'rap_golden_mic'), 'a cleanse or a dispel never desyncs the board: the tokens come straight back');
    t.ok(!heroes().some(function (h) { return h !== k && has(h, 'rap_called_out'); }), 'one Called-Out hero');
    if (!DD.getHero('betty')) { t.log('betty not loaded (isolated run): the Betty-first check runs in the full suite'); return; }
    scene(61, null, { ids: ['test_knight', 'betty', 'test_mage', 'test_rogue'] });
    const bt = who('betty');
    t.ok(R().mark === bt.id, 'Betty in the party: Betty first (' + bt.maxHp + ' max HP vs the knight\'s ' + who('test_knight').maxHp + ')');
    t.ok(logHas(/Billy Bleatz: "There's only one G\.O\.A\.T\. in this barn\. It's three of us\."/), 'Billy\'s line');
  });

  // ---- the Clap Back ------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: the Clap Back — 1 AP, heroes only, not the Called-Out hero, once a round, needs a verse; the heat moves, +10 Hype', function (t) {
    if (!ready(t)) return;
    const N = G().N;
    const place = { test_knight: [7, 7], test_mage: [6, 6], test_cleric: [8, 6], test_rogue: [12, 13], rap_billy: [7, 3], rap_kid: [10, 9], rap_turnip: [5, 12] };
    scene(70, place);
    const k = who('test_knight'), mg = who('test_mage'), cl = who('test_cleric');
    const clapOf = function (u) { return DD.Combat.interactions(u).filter(function (o) { return o.label === 'Clap Back'; })[0] || null; };
    turn(mg);
    t.ok(!clapOf(mg), 'no verse going: no Clap Back');
    useNow(who(KID), 'rap_what', k);
    const opt = clapOf(mg);
    t.ok(opt && opt.ap === 1 && opt.x === 7 && opt.y === 6, 'a bar open: the mage next to the stand can clap back for 1 AP');
    turn(k);
    t.ok(!clapOf(k), 'never the Called-Out hero');
    turn(mg);
    const hype = S().hype || 0, ap = mg.ap;
    t.ok(DD.Combat.interact(mg, 7, 6), 'the mage claps back');
    t.ok(R().mark === mg.id && has(mg, 'rap_called_out') && !has(k, 'rap_called_out'), 'the clapper is the Called-Out hero now');
    t.ok(!R().open && R().stats.hung === 1 && R().stats.claps === 1, 'the open bar hangs');
    t.ok((S().hype || 0) - hype === N.clapHype && ap - mg.ap === 1, 'the crowd tips ' + N.clapHype + ' Hype; it cost 1 AP');
    t.ok(logHas(/Wizzy McTest claps back at the Mic Stand! The verse is about Wizzy McTest now\. The crowd tips 10 Hype\./), 'logged');
    setVerse(1);
    turn(cl);
    t.ok(!clapOf(cl), 'once a round for the whole party');
    play();
    turn(cl);
    t.ok(!!clapOf(cl), 'next round, again');
    const hound = act(function () { return DD.Act.summon(cl, 'test_hound', 7, 5, { silent: true }); });
    t.ok(hound && !DD.getObject('rap_mic_stand').available(DD.Grid.tile(7, 6).obj, hound), 'a summon never claps back');
    // a pending Bar None turns on the clapper (and Headliner shows on the number: the clapper stands next to the stand)
    scene(71, place);
    const b = who(BILLY), k2 = who('test_knight'), m2 = who('test_mage');
    setVerse(3);
    turn(b);
    const it = windup(b, 'rap_bar_none');
    t.eq(it && it.unitId, k2.id, 'Bar None on the knight');
    turn(m2);
    DD.Combat.interact(m2, 7, 6);
    t.ok(it.unitId === m2.id && R().mark === m2.id, 'the clap re-points it at the clapper');
    const marked = DD.AI.intentDmg(b, it);
    t.eq(marked, exp(N.barNone[0], N.micGuard), 'its number: ' + N.barNone[0] + ' + Headliner ' + N.micGuard + ' (the clapper is next to the stand)');
    const kh = k2.hp, d = hpLost(m2, function () { turn(b); });
    t.ok(d === marked && k2.hp === kh, 'it lands on the clapper (' + d + '), the knight is spared');
    // Syllamin's clap back: 6 psychic to each crew member who can see him, and only those
    if (!DD.getHero('syllamin')) { t.log('syllamin not loaded (isolated run): his clap back runs in the full suite'); return; }
    scene(72, { syllamin: [6, 6], test_knight: [7, 7], test_mage: [12, 13], test_rogue: [13, 13], rap_billy: [7, 3], rap_kid: [3, 10], rap_turnip: [5, 12] }, { ids: ['test_knight', 'syllamin', 'test_mage', 'test_rogue'] });
    const sy = who('syllamin');
    bare(sy);
    act(function () { G().callOut(who('test_knight'), 'test'); });
    setVerse(1);
    const sees = function (u) { return DD.Grid.los(u, sy); };
    t.ok(sees(who(BILLY)) && !sees(who(KID)), 'Billy sees him; Lil\' Kid hides behind the post');
    const hp0 = {};
    CREW.forEach(function (id) { const u = who(id); if (u) { u.armor = 0; hp0[id] = u.hp; } });
    turn(sy);
    const est = DD.AI.estimate(sy, who(BILLY), N.syllaminClap, 'psychic');
    t.ok(DD.Combat.interact(sy, 7, 6), 'Syllamin claps back');
    t.ok(hp0[BILLY] - who(BILLY).hp === est && est > 0 && hp0[KID] === who(KID).hp, 'he does this professionally: Billy takes ' + est + ' psychic (estimate) = ' + (hp0[BILLY] - who(BILLY).hp) + ', the hidden Kid nothing');
    t.eq(hp0[TURNIP] - who(TURNIP).hp, sees(who(TURNIP)) ? hp0[BILLY] - who(BILLY).hp : 0, 'DJ Turnip: by sight');
  });

  // ---- the Tribute -------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: the Tribute — each fallen member adds a bar (the bear too), capped at 3, never while Bar None is pending', function (t) {
    if (!ready(t)) return;
    scene(80);
    setVerse(1);
    kill(who(TURNIP));
    t.ok(R().verse === 2 && R().stats.tributes === 1, 'DJ Turnip falls: Verse 2');
    t.ok(logHas(/Tribute to DJ Turnip: \+1 bar\. Verse 2\/3\./), 'logged');
    setVerse(3);
    kill(who(KID));
    t.ok(R().verse === 3 && R().stats.tributes === 1, 'a full verse stays full');
    t.ok(!!who(URSA) && R().holder === who(URSA).id, '(the goats at half: the bear is here and holds the mic)');
    setVerse(1);
    kill(who(URSA));
    t.ok(R().verse === 2 && R().stats.tributes === 2, 'the bear falls: a tribute for him too');
    t.eq(R().holder, who(BILLY).id, 'and the mic goes back to Billy');
    t.ok(logHas(/Billy Bleatz: "Mic's back where it belongs\. Thanks, big guy\."/), 'with his line');
    scene(81);
    setVerse(3);
    turn(who(BILLY));
    t.ok(R().pending === who(BILLY).id, 'Bar None pending');
    kill(who(TURNIP));
    t.ok(R().verse === 3 && R().stats.tributes === 0 && R().pending === who(BILLY).id, 'no tribute while it is pending');
  });

  // ---- the bear ----------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: the bear — the stir at 65%, FEAT. URSA VERSE inside the hit that crosses combined half, a full round of notice, the mic', function (t) {
    if (!ready(t)) return;
    const N = G().N;
    scene(90);
    const b = who(BILLY), kid = who(KID), tn = who(TURNIP), mg = who('test_mage');
    const tot = G().crewTotals(S());
    t.ok(tot.max === b.maxHp + kid.maxHp + tn.maxHp && tot.half === Math.floor(tot.max * N.bearAt) && tot.stir === Math.floor(tot.max * N.stirAt), 'combined ' + tot.hp + '/' + tot.max + ', half ' + tot.half + ', stir ' + tot.stir);
    b.hp -= tot.hp - tot.stir - 1;
    hit(mg, b, 1);
    t.ok(R().bear === 'stirring' && !who(URSA), 'at 65%: the hay stirs, no bear yet');
    t.ok(logHas(/Something big is stirring in the hay\./), 'logged');
    hit(mg, b, 1);
    t.eq(logCount(/Something big is stirring/), 1, 'once');
    t.ok(/the hay is waking up/.test(S().objective.flavor), 'flavour: ' + S().objective.flavor);
    kid.hp = Math.min(kid.hp, 30); tn.hp = Math.min(tn.hp, 30);
    b.hp = G().crewTotals(S()).half + 1 - kid.hp - tn.hp;
    G().sync(S());
    t.eq(G().crewTotals(S()).hp, G().crewTotals(S()).half + 1, 'one above half');
    const order0 = S().order.length, round = S().round;
    hit(mg, b, 1);
    const bear = who(URSA);
    t.ok(!!bear && R().bear === 'here' && bear.x === 1 && bear.y === 1, 'the hit that crosses half: Ursa Verse joins at (1,1) at once');
    t.ok(!S().grid.tiles.some(function (x) { return x.obj && (x.obj.id === 'rap_mound' || x.obj.id === 'rap_lump'); }), 'the mounds and the Snoring Lump are gone (the corner opens)');
    t.ok(R().holder === bear.id && has(bear, 'rap_golden_mic') && !has(b, 'rap_golden_mic'), 'he takes the Golden Mic');
    t.ok(logHas(/Ursa Verse joins the fight!/) && logHas(/Billy Bleatz: "Wait, that's MY mic-"/) && logHas(/Ursa Verse: "It's a feature, William\."/), 'the hand-over');
    t.eq(S().objective.flavor, '🐻 Ursa Verse holds the Golden Mic', 'the flavour line');
    t.ok(!S().order.some(function (e) { return e.unitId === bear.id; }) && S().order.length === order0 && S().round === round, 'no turn this round');
    play();
    t.ok(S().order.some(function (e) { return e.unitId === bear.id; }), 'he acts from the next round');
    t.eq(R().stats.bearRound, round, 'stats.bearRound');
    // a pending Bar None stays on its winder at its level; then the bear's is level II; his death returns the mic
    scene(91);
    const b2 = who(BILLY);
    setVerse(3);
    turn(b2);
    act(function () { G().entrance(); });
    const u2 = who(URSA), it = windup(b2, 'rap_bar_none');
    t.ok(it && it.level === 1 && R().pending === b2.id && R().holder === u2.id, 'Billy\'s Bar None stays his, level I');
    const k = who('test_knight');
    bare(k);
    t.eq(hpLost(k, function () { turn(b2); }), exp(N.barNone[0]), 'and lands ' + exp(N.barNone[0]));
    setVerse(3);
    turn(u2);
    const it2 = windup(u2, 'rap_bar_none');
    t.ok(it2 && it2.level === 2 && DD.AI.intentDmg(u2, it2) === exp(N.barNone[1]), 'the bear\'s Bar None II: ' + exp(N.barNone[1]));
    kill(u2);
    t.ok(R().holder === b2.id && !R().pending && R().verse === 1, 'the bear falls: the wind-up dies with him (tribute 1), the mic goes back to Billy');
    // a brutal fight: the line is half of the LIVE max
    scene(92, null, { diff: 'brutal' });
    const t3 = G().crewTotals(S());
    t.ok(t3.max !== 255 && t3.half === Math.floor(t3.max / 2), 'brutal: combined max ' + t3.max + ', half ' + t3.half);
    const b3 = who(BILLY);
    who(KID).hp = 20; who(TURNIP).hp = 20;
    b3.hp = t3.half + 1 - 40;
    hit(who('test_mage'), b3, 1);
    t.ok(!!who(URSA), 'the bear comes exactly at half');
    // one area hit from 60% to nothing: the bear is in first, the fight goes on until he falls
    scene(93);
    [BILLY, KID, TURNIP].forEach(function (id) { const u = who(id); u.hp = Math.ceil(u.maxHp * 0.6); });
    G().sync(S());
    const mg4 = who('test_mage');
    act(function () { [BILLY, KID, TURNIP].forEach(function (id) { DD.Act.damage(mg4, who(id), 999); }); });
    t.ok(!who(BILLY) && !who(KID) && !who(TURNIP) && !!who(URSA) && !S().result, 'all three goats fall in one action: the bear is already in, no victory');
    kill(who(URSA), mg4);
    t.eq(S().result, 'victory', 'the bear falls: victory');
    t.ok(logHas(/The beat stops|Herd Mentality drop their mics/), 'the goats\' defeat narration');
    // the spawn fails (fallback, expected never to fire): the last goat holds at 1 HP until a round-start retry
    scene(94);
    const spawn = DD.Act.spawn;
    DD.Act.spawn = function () { return null; };
    let held = false;
    try {
      kill(who(KID));
      kill(who(TURNIP));
      t.eq(R().bear, 'due', 'the bear is due (the spawn failed)');
      const b5 = who(BILLY);
      hit(who('test_mage'), b5, 999);
      held = !b5.dead && b5.hp === 1;
      t.ok(held, 'Not before the feature! The last goat holds at 1 HP');
      t.ok(logHas(/Billy Bleatz: "Not before the feature!"/), 'his line');
    } finally { DD.Act.spawn = spawn; }
    play();
    t.ok(R().bear === 'here' && !!who(URSA), 'the round-start retry brings the bear');
    kill(who(BILLY));
    t.ok(!who(BILLY) && !S().result, 'then Billy can fall, and the bear fights on');
  });

  // ---- QA fixes (Nov 17) ------------------------------------------------------------------------------------------------
  T.suite('boss_goats: QA FIGHTS-09 / voice-2 — the bear never acts before every hero had a turn since he came in; his entrance with Billy gone', function (t) {
    if (!ready(t)) return;
    const def = DD.getEnemy(URSA), init0 = def.init;
    try {
      // a rolled fight, half crossed in the round's last hero turn: a high roll puts him ahead of the heroes next round
      [[30, true], [-30, false]].forEach(function (c) {
        def.init = c[0];
        const setup = DD.Encounter.build(ENC, partyAt(LV), { rng: DD.RNG('rap:f09' + c[0]), difficulty: 'normal', act: 4 });
        DD.Combat.start(setup, { seed: 'f09' + c[0], headless: true, difficulty: 'normal', kind: 'boss', sandbox: true, initiative: 'roll', cameo: false });
        const s = S();
        s.aiOff = true;
        heroes().forEach(bare);
        let last = -1;
        s.order.forEach(function (e, i) { const u = DD.Combat.byId(e.unitId); if (u && u.kind === 'hero') last = i; });
        s.turnIndex = last; s.current = s.order[last].unitId;
        const b = who(BILLY), kid = who(KID), tn = who(TURNIP);
        kid.hp = 30; tn.hp = 30; b.hp = G().crewTotals(S()).half + 1 - 60;
        G().sync(S());
        hit(who('test_mage'), b, 1);
        const bear = who(URSA);
        if (!t.ok(!!bear, 'init ' + c[0] + ': the bear joins')) return;
        t.eq(has(bear, 'rap_mic_check'), c[1], 'init ' + c[0] + ': ' + (c[1] ? 'he would act first next round: Mic Check' : 'every hero acts before him: no Mic Check'));
        if (c[1]) {
          const hp = heroes().map(function (h) { return h.hp; });
          act(function () { DD.AI.act(bear); });
          t.ok(heroes().every(function (h, i) { return h.hp === hp[i]; }) && !(bear.intents || []).length, 'his Mic Check turn: no attack, no wind-up');
          t.ok(logHas(/Ursa Verse: "Testing\. Five syllables\./), 'his mic-check line');
        }
        play();
        const ib = S().order.findIndex(function (e) { return e.unitId === bear.id; });
        const ahead = S().order.slice(0, ib).filter(function (e) { const u = DD.Combat.byId(e.unitId); return u && u.kind === 'hero'; }).length;
        t.eq(ahead < heroes().length, c[1], 'init ' + c[0] + ': ' + ahead + ' of ' + heroes().length + ' heroes ahead of him next round');
        if (c[1]) t.ok(!has(bear, 'rap_mic_check'), 'the Mic Check is over after his first turn');
      });
    } finally { def.init = init0; }
    // voice-2: Billy fell first; the bear walks in with nobody to answer him
    scene(95);
    kill(who(BILLY));
    const kid2 = who(KID), tn2 = who(TURNIP);
    if (G().crewTotals(S()).hp > G().crewTotals(S()).half) {
      kid2.hp = G().crewTotals(S()).half + 1 - tn2.hp;
      G().sync(S());
      hit(who('test_mage'), kid2, 1);
    }
    t.ok(!!who(URSA), 'the bear joins without Billy');
    t.ok(logHas(/Ursa Verse: "Who woke me\? \.\.\.Ah\. A verse needs finishing\."/) && !logHas(/It's a feature, William/), 'his solo line, never "It\'s a feature, William."');
  });

  T.suite('boss_goats: QA voice-8 / HERO-7 — no diss at a hero\'s wound, no joke Svammiel already told about the same hero', function (t) {
    t.ok(!pool('rap_diss_syllamin').some(function (l) { return /mother/i.test(l); }), 'Syllamin: no jab at his mother (a backstory wound)');
    t.ok(!pool('rap_close_marbles').concat(pool('rap_diss_marbles')).some(function (l) { return /nobody remembers you/i.test(l); }), 'Marbles: forgetful, never forgettable');
    // HERO-7: the goats' Benedick bar and Svammiel's Benedick roast (both play in act 4) don't tell the same joke. (Shared
    // catchphrases stay on purpose: Betty's G.O.A.T., Valdris's "Mind the hair", Kiri the Half-There, a good boy.)
    const both = function (re) { return pool('svam_hero_benedick').some(function (l) { return re.test(l); }) && pool('rap_diss_benedick').concat(pool('rap_close_benedick')).some(function (l) { return re.test(l); }); };
    t.ok(!both(/last tuesday/i), 'Benedick: the "last Tuesday" joke is Svammiel\'s alone');
    // h19: the same split for heroes 18-20 (addendum-rasma §19.3, addendum-biz §19.3, addendum-gus §18 / §20.3). Each joke
    // has one owner: `svam` never appears in the goats' bars or closers, `goats` never in Svammiel's roasts.
    // [h19 QA voice-2] the plan's split (§1.2) gives Svammiel the apologies ("sorry" too) and the stress eating; the goats
    // take Touché and Fine, Have One in their place
    const SPLIT = {
      rasma: { svam: [/monotaur/i, /apologi[sz]|\bsorry\b/i, /smudge/i], goats: [/\b(?:tea)?cup\b|china/i, /\bblue\b|\byellow\b|\brose\b/i, /cold shoulder/i, /touch[ée]/i] },
      biz: { svam: [/warrant/i, /reboot|off and on/i, /hid(?:e|ing) behind/i, /cold-blooded/i, /recall/i],
        goats: [/rapping/i, /Spooder/, /tribute|knock-?off|homage/i, /button/i] },
      gus: { svam: [/storage/i, /\brent\b/i, /stress/i], goats: [/\bbur(?:y|ies|ied|ying)\b/i, /have one/i] },
    };
    Object.keys(SPLIT).forEach(function (id) {
      const svam = pool('svam_hero_' + id), goats = pool('rap_diss_' + id).concat(pool('rap_close_' + id));
      if (!svam.length || !goats.length) { t.fail(id + ': Svammiel\'s roasts and the goats\' bars both land from day one (plan D5)'); return; }
      SPLIT[id].svam.forEach(function (re) {
        t.ok(svam.some(function (l) { return re.test(l); }) && !goats.some(function (l) { return re.test(l); }), id + ': ' + re + ' is Svammiel\'s joke alone');
      });
      SPLIT[id].goats.forEach(function (re) {
        t.ok(goats.some(function (l) { return re.test(l); }) && !svam.some(function (l) { return re.test(l); }), id + ': ' + re + ' is the goats\' joke alone');
      });
    });
    // [h19 QA voice-10] villains never aim at Phat Gus's body (the user, Nov 18): no roundness pun ("rolled in" on the
    // round squirrel whose own bark is "Rolling, rolling, rolling."), no "fat" (his word only)
    const gusBars = pool('rap_diss_gus').concat(pool('rap_close_gus'));
    t.ok(gusBars.length > 0, 'Phat Gus has bars');
    gusBars.forEach(function (l) { t.ok(!/\broll(?:s|ed|ing)?\b|\bround(?:er)?\b|\bspher|\bfat\b|\bchubby\b|\bbelly\b/i.test(l), 'Phat Gus: no body joke from the goats: "' + l + '"'); });
  });

  // ---- the bass and the Speaker Stacks -------------------------------------------------------------------------------------
  T.suite('boss_goats: Turnip the Bass — the colour with more heroes (ties: the Called-Out hero\'s), every other turn, speakers, never the mic', function (t) {
    if (!ready(t)) return;
    const N = G().N;
    scene(100, { test_knight: [6, 3], test_cleric: [7, 3], test_mage: [8, 3], test_rogue: [12, 13] });
    // (6,3) gold, (7,3) pink, (8,3) gold → gold 2 : pink 1
    t.eq(G().pickColour(S()), 'gold', 'two heroes on gold, one on pink: gold');
    arrange({ test_knight: [7, 3], test_cleric: [6, 3], test_mage: [12, 12] });
    t.eq(G().colourOf(7, 3), 'pink', '(7,3) is pink');
    t.eq(G().pickColour(S()), 'pink', 'a tie (1 : 1): the Called-Out hero\'s colour (pink)');
    arrange({ test_knight: [3, 13], test_cleric: [4, 13] });
    t.eq(G().pickColour(S()), 'gold', 'nobody on the floor: gold');
    t.eq(G().danceTiles(S(), 'gold').length + '/' + G().danceTiles(S(), 'pink').length, '23/16', 'the colours mark 23 / 16 squares');
    // every other turn: wind-up, land (and Scratch That), wind-up
    arrange({ test_knight: [7, 3], test_cleric: [8, 13], test_mage: [12, 12] });
    const tn = who(TURNIP);
    S().aiOff = false;
    turn(tn);
    const it1 = windup(tn, 'rap_bass');
    t.ok(it1 && it1.tiles.length === 16, 'turn 1: the bass on pink (the knight\'s colour)');
    turn(tn);
    t.ok(!windup(tn, 'rap_bass'), 'turn 2: it lands; no new bass');
    turn(tn);
    t.ok(!!windup(tn, 'rap_bass'), 'turn 3: the bass again');
    t.eq(R().stats.bass, 2, 'stats.bass');
    // both speakers broken: a pending bass still lands, then no more
    S().aiOff = true;
    const k = who('test_knight');
    pos(k, 6, 4);
    t.eq(G().colourOf(6, 4), 'pink', 'the knight steps onto pink');
    act(function () { DD.Act.destroyObject(4, 1, k); DD.Act.destroyObject(10, 1, k); });
    t.ok(G().speakers(S()) === 0 && R().stats.speakers === 2, 'both Speaker Stacks broken');
    t.ok(logHas(/The last Speaker Stack goes down\. The beat stops\./), 'logged');
    const hp = k.hp;
    turn(tn);
    t.eq(hp - k.hp, exp(N.bass), 'the pending bass still lands (' + exp(N.bass) + ')');
    S().aiOff = false;
    turn(tn); turn(tn); turn(tn);
    t.ok(!windup(tn, 'rap_bass') && R().stats.bass === 2, 'no speakers: no more bass');
    S().aiOff = true;
    // DJ Turnip never holds the Golden Mic
    t.ok(G().HOLDERS.indexOf(TURNIP) < 0, 'he is not on the holder list');
    scene(101);
    kill(who(BILLY));
    t.eq(R().holder, who(KID).id, 'Billy down: Lil\' Kid');
    const kidU = who(KID);
    act(function () { DD.Act.kill(kidU, heroes()[0]); });
    const bear = who(URSA);
    t.ok(!!bear && R().holder === bear.id, 'Lil\' Kid down (the goats at half): the bear');
    kill(bear);
    t.ok(R().holder === null && !has(who(TURNIP), 'rap_golden_mic'), 'the bear down: nobody holds it (never DJ Turnip)');
    // AutoPlay hints: speakers worth breaking while the DJ lives, bales never
    scene(102);
    const spkTile = DD.Grid.tile(4, 1);
    t.ok(DD.getObject('rap_speaker').autoplay(who('test_mage'), spkTile.obj, spkTile, S(), 'break') === 6, 'a speaker is worth 6 to break');
    act(function () { DD.Act.destroyObject(10, 1, who('test_mage')); });
    t.ok(DD.getObject('rap_speaker').autoplay(who('test_mage'), spkTile.obj, spkTile, S(), 'break') === 12, 'the last one 12');
    kill(who(TURNIP));
    t.ok(DD.getObject('rap_speaker').autoplay(who('test_mage'), spkTile.obj, spkTile, S(), 'break') === 0, 'no DJ: 0');
    t.eq(DD.getObject('rap_bale').autoplay, 0, 'AutoPlay never breaks its own cover');
  });

  // ---- honesty and determinism -----------------------------------------------------------------------------------------------
  T.suite('boss_goats: honesty — previews leave no trace, threat shading shows the punchline, the line picks never touch state.rng', function (t) {
    if (!ready(t)) return;
    const N = G().N;
    scene(110, { test_knight: [7, 13], test_mage: [2, 13], test_cleric: [12, 13], test_rogue: [13, 13], rap_billy: [7, 9], rap_kid: [9, 12], rap_turnip: [5, 12] });
    const k = who('test_knight'), b = who(BILLY), kid = who(KID);
    const reach0 = DD.AI.reachOf(b).units.get(k.id) || 0;
    useNow(kid, 'rap_what', k);
    const reach1 = DD.AI.reachOf(b).units.get(k.id) || 0;
    t.ok(reach0 === Math.max(exp(N.hook), exp(N.gruff)) && reach1 === Math.max(exp(N.hook), exp(N.gruff, N.punch)),
      'threat shading: Billy\'s best number on the Called-Out hero counts the punchline once a bar is open (' + reach0 + ' → ' + reach1 + ')');
    const fp = T.contentHelpers && T.contentHelpers.fingerprint;
    const snap = JSON.stringify(R()), logN = S().log.length, rng = S().rng.getState(), fpr = fp ? fp(S()) : '';
    DD.Targeting.preview(b, sk('rap_gruff'), { x: k.x, y: k.y });
    DD.Targeting.preview(kid, sk('rap_what'), { x: k.x, y: k.y });
    DD.Targeting.preview(who('test_mage'), who('test_mage').basic, { x: kid.x, y: kid.y });
    t.ok(JSON.stringify(R()) === snap && S().log.length === logN && S().rng.getState() === rng && (!fp || fp(S()) === fpr), 'previews change nothing (the verse, stats, the log, the RNG)');
    const r0 = S().rng.getState();
    useNow(b, 'rap_gruff', k);
    setVerse(1);
    useNow(kid, 'rap_what', k);
    useNow(b, 'rap_gruff', k);
    t.eq(S().rng.getState(), r0, 'couplets, echoes and barks pick with the cosmetic RNG: state.rng untouched');
    t.ok(R().stats.bars === 2 && S().log.some(function (l) { return l.text.indexOf('Billy Bleatz: "') === 0; }), 'the verse is logged as bubbles too (Log only and AutoPlay players read it)');
    // the couplet pair: the setup on the starter, the punchline on the finisher, the same line of the same hero
    scene(111, { test_knight: [7, 13], test_mage: [2, 13], rap_billy: [7, 9], rap_kid: [9, 12], rap_turnip: [5, 12] });
    const k2 = who('test_knight');
    useNow(who(KID), 'rap_what', k2);
    const line = R().open.line;
    useNow(who(BILLY), 'rap_gruff', k2);
    const pair = line ? line : [];
    t.ok(pair.length === 2 && logHas(new RegExp('Lil\' Kid: "' + pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"')) &&
      logHas(new RegExp('Billy Bleatz: "' + pair[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"')), 'the Kid barks the setup, Billy the punchline: ' + pair.join(' / '));
  });

  // ---- Svammiel's Radio Edit at this door ---------------------------------------------------------------------------------------
  T.suite('boss_goats: Svammiel\'s Radio Edit here (needs cameo.js + svammiel.js) — the §15.1 skill, the exact chip, refused all fight, honest previews, the Bribe', function (t) {
    if (!ready(t)) return;
    const cam = DD.getCameo && DD.getCameo('svammiel');
    if (!cam || !DD.Cameo || DD.Cameo.stub || !cam.cheats || !cam.cheats.svam_cameo_radio) { t.skip('the cameo core (RULES) or svammiel.js (C5) is not loaded'); return; }
    const s = startFight(120, { cameo: true });
    s.aiOff = true;
    const rule = s.rules.filter(function (r) { return r.id === 'cameo:svam_cameo_radio'; })[0];
    if (!t.ok(!!rule && rule.cheat === true && rule.turns === -1, 'the start cameo applies the Radio Edit for the whole fight')) return;
    // the pick, recomputed here from addendum §15.1
    let best = null;
    heroes().forEach(function (u, ui) {
      (u.skills || []).forEach(function (sl, si) {
        const d = sk(sl.id);
        if (!d || (d.tags || []).indexOf('shapeshift') >= 0 || (d.hype || 0) > 0 || (u.basic && u.basic.id === d.id) || (u.signature && u.signature.id === d.id)) return;
        if ((d.target && d.target.filter === 'downedAlly') || (DD.Targeting.revivesWith && DD.Targeting.revivesWith(u, sl))) return;
        const L = DD.skillLevel(d, sl.level || 1), dmg = +DD.resolve(L.dmg, L, u, 0) || 0;
        if (!(dmg > 0)) return;
        const c = { u: u, d: d, lv: sl.level || 1, dmg: dmg, ui: ui, si: si };
        if (!best || c.lv > best.lv || (c.lv === best.lv && (c.dmg > best.dmg || (c.dmg === best.dmg && (c.ui < best.ui || (c.ui === best.ui && c.si < best.si)))))) best = c;
      });
    });
    t.ok(best && s.data.cameoRadio && s.data.cameoRadio.unitId === best.u.id && s.data.cameoRadio.skillId === best.d.id, 'it bleeps ' + (best && best.d.name + ' (' + best.u.name + ')'));
    const want = best.d.name + ' (' + best.u.name + ') is bleeped: it can\'t be used this fight.';
    t.eq(rule.desc, want, 'the chip\'s exact desc');
    t.ok(want.length <= 90, 'within 90 characters');
    t.ok(S().log.some(function (l) { return l.text.indexOf('😈 Svammiel cheats: Radio Edit. ' + want + ' Reason: ') === 0; }), 'the log line with a Reason');
    // refused all fight (rounds 1, 5, 10; after a cooldown reset); every other skill of the party usable
    const u = best.u, slot = u.skills.filter(function (x) { return x.id === best.d.id; })[0];
    [1, 5, 10].forEach(function (r) {
      while (S().round < r && !S().result) play();
      turn(u);
      u.ap = u.maxAp || 3;
      const why = DD.Combat.canUse(u, slot);
      t.ok(typeof why === 'string' && /Bleeped by Svammiel \(Radio Edit\)\.|Not enough AP\./.test(why), 'round ' + S().round + ': refused ("' + why + '")');
      act(function () { DD.Act.resetCooldowns(u); });
      u.ap = u.maxAp || 3;
      t.ok(DD.Combat.canUse(u, slot) === why, 'round ' + S().round + ': a cooldown reset does not undo it');
    });
    const others = u.skills.filter(function (x) { return x.id !== best.d.id; });
    t.ok(others.every(function (x) { const w = DD.Combat.canUse(u, x); return !w || !/Bleeped|Radio Edit/.test(w); }), 'his other skills are never refused by it');
    // the crew's previews are unchanged by it (it changes no damage)
    const k = who('test_knight'), kid = who(KID);
    if (kid && k && !k.downed) {
      bare(k);
      const spot = S().grid.tiles.filter(function (x) { const dd = DD.Grid.dist(x, k); return dd >= 2 && dd <= 4 && !x.obj && !DD.Grid.unitAt(x.x, x.y) && x.h === DD.Grid.tile(k.x, k.y).h; })[0];
      pos(kid, spot.x, spot.y);
      const p = estimate(kid, 'rap_what', k), d = hpLost(k, function () { useNow(kid, 'rap_what', k); });
      t.ok(d > 0 && p === d, 'with the Radio Edit on, the crew\'s estimates still equal the hits (' + p + ' / ' + d + ')');
    }
    // AutoPlay never uses it
    let used = 0;
    DD.Act.addRule({ id: 'test_rap_radio', name: 'w', silent: true, hooks: { onSkillUsed: function (ctx) { if (!DD.Act.simulating && ctx.user === u && ctx.skill && ctx.skill.id === best.d.id) used++; } } });
    try { S().aiOff = false; DD.AutoPlay.runBattle(12); } finally { DD.Act.removeRule('test_rap_radio'); }
    t.eq(used, 0, 'AutoPlay never plays the bleeped skill');
    // a Bribe skips it (and is spent)
    const run = { act: 4, flags: { cameo: { bribe: 1 } }, consumables: [], gold: 0, difficulty: 'normal' };
    const s2 = startFight(121, { cameo: true, run: run });
    t.ok(!s2.rules.some(function (r) { return r.id === 'cameo:svam_cameo_radio'; }) && !s2.data.cameoRadio && run.flags.cameo.bribe === 0, 'a Bribe buys it off and is spent');
    // every registered hero × damage skill fits the chip (90 characters)
    const long = [];
    Object.keys(DD.defs.heroes).forEach(function (hid) {
      const h = DD.defs.heroes[hid];
      (h.skillPool || []).concat(h.startingSkills || []).forEach(function (id) {
        const d = sk(id);
        if (!d) return;
        const txt = d.name + ' (' + h.name + ') is bleeped: it can\'t be used this fight.';
        if (txt.length > 90) long.push(txt.length + ': ' + txt);
      });
    });
    t.eq(long.length, 0, 'every hero × skill chip ≤ 90 characters' + (long.length ? ': ' + long.join(' | ') : ''));
  });

  // ---- voice ---------------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: voice — every hero ≥ 4 couplets / 2 closers / 2 comebacks, lengths, names, pronouns, the tone guard, unique names', function (t) {
    if (!ready(t)) return;
    const names = rosterNames();
    const longest = Object.keys(names).map(function (id) { return names[id]; }).sort(function (a, b) { return b.length - a.length; })[0];
    const fill = function (s) { return String(s).replace(/\{hero\}/g, longest); };
    const bubbles = [];   // [label, text]
    // coverage: every registered real hero (an 18th hero fails loudly), and the user's roster
    const real = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    const ids = Object.keys(ROSTER).concat(real.filter(function (id) { return !ROSTER[id]; }));
    ids.forEach(function (id) {
      const d = pool('rap_diss_' + id), c = pool('rap_close_' + id), b = pool('rap_back_' + id);
      t.ok(d.length >= 4 && c.length >= 2 && b.length >= 2, id + ': ' + d.length + ' couplets, ' + c.length + ' closers, ' + b.length + ' comebacks');
      const others = Object.assign({}, names);
      delete others[id];
      d.forEach(function (line, i) {
        const parts = line.split('|');
        t.ok(parts.length === 2 && parts[0] && parts[1], id + ' couplet ' + i + ': setup|punchline');
        t.ok(namedIn(parts[0], { x: names[id] }).length === 1, id + ' couplet ' + i + ': the setup names ' + names[id]);
        bubbles.push(['diss ' + id, parts[0]], ['diss ' + id, parts[1]]);
      });
      c.forEach(function (x) { bubbles.push(['close ' + id, x]); });
      b.forEach(function (x) { bubbles.push(['back ' + id, x]); });
      d.concat(c).concat(b).forEach(function (x) {
        const bad = namedIn(x, others);
        if (bad.length) t.fail(id + ': names another hero (' + bad.join(', ') + '): ' + x);
      });
      // pronouns about the hero (the diss and the closer talk about him or her)
      d.concat(c).forEach(function (x) {
        if (SHE[id] && /(^|[^a-z'])(he|him|his|himself)([^a-z']|$)/i.test(x)) t.fail(id + ' is she/her: ' + x);
        if (!SHE[id] && /(^|[^a-z'])(she|her|hers|herself)([^a-z']|$)/i.test(x)) t.fail(id + ' is he/him: ' + x);
      });
    });
    real.forEach(function (id) { t.ok(pool('rap_diss_' + id).length >= 4, 'registered hero ' + id + ' has couplets'); });
    // generic pools: no hero word, no Mayor / Professor
    ['rap_diss_generic', 'rap_close_generic', 'rap_back_generic'].forEach(function (key) {
      const p = pool(key);
      t.ok(p.length >= 3, key + ': ' + p.length + ' lines');
      p.forEach(function (x) {
        const bad = namedIn(x, names);
        if (bad.length || /\b(Mayor|Professor)\b/.test(x)) t.fail(key + ' names a hero: ' + x);
        x.split('|').forEach(function (h) { bubbles.push([key, fill(h)]); });
      });
    });
    // barks, fight keys, banter, moments, the one-off lines
    CREW.forEach(function (eid) {
      const bk = DD.getEnemy(eid).barks;
      Object.keys(bk).forEach(function (key) {
        bk[key].forEach(function (x) {
          bubbles.push([eid + '.' + key, x]);
          const nm = namedIn(x, names);
          if (key === 'named') t.ok(nm.length === 1, eid + ' named line names exactly one hero: ' + x);
          else if (nm.length) t.fail(eid + '.' + key + ' names a hero outside the named key: ' + x);
        });
      });
    });
    ['rap_hang', 'rap_windup', 'rap_cut', 'rap_clapped', 'rap_bear_chant', 'rap_lump'].forEach(function (key) {
      t.ok(pool(key).length >= 2, key + ' pool');
      pool(key).forEach(function (x) { bubbles.push([key, x]); if (namedIn(x, names).length) t.fail(key + ' names a hero: ' + x); });
    });
    G().BANTER.forEach(function (bset, i) {
      const nm = [];
      bset.lines.forEach(function (l) { bubbles.push(['banter ' + i, l[1]]); namedIn(l[1], names).forEach(function (h) { if (nm.indexOf(h) < 0) nm.push(h); }); t.ok(CREW.indexOf(l[0]) >= 0, 'banter ' + i + ': a crew speaker'); });
      t.ok(nm.length === 0 || (nm.length === 1 && bset.hero === nm[0]), 'banter ' + i + ': a hero named only behind its gate (' + (nm.join(',') || 'none') + ')');
    });
    Object.keys(G().MOMENTS).forEach(function (k) { G().MOMENTS[k].forEach(function (l) { bubbles.push(['moment ' + k, l[1]]); }); });
    const L = G().LINE;
    Object.keys(L).forEach(function (k) {
      if (typeof L[k] === 'string') { if (k !== 'featBanner' && k !== 'groupBanner' && k !== 'groupSub') bubbles.push(['line ' + k, L[k]]); }
      else Object.keys(L[k]).forEach(function (x) { t.ok(L[k][x].length <= 90, 'banner sub ≤ 90: ' + L[k][x]); });
    });
    t.ok(L.featBanner.length <= 28 && L.groupBanner.length <= 28 && L.groupSub.length <= 90, 'banners ≤ 28, subs ≤ 90');
    bubbles.forEach(function (b) {
      const x = fill(b[1]);
      if (x.length > 70) t.fail(b[0] + ': ' + x.length + ' > 70: ' + x);
      if (DIALECT.test(x)) t.fail(b[0] + ': dialect marker: ' + x);
      if (/\bblack\b/i.test(x)) t.fail(b[0] + ': the fur colour is never a joke: ' + x);
      if (/\{(?!hero\})/.test(b[1]) || /\{hero\}/.test(b[1]) && !/generic/.test(b[0])) t.fail(b[0] + ': a token outside the generic pools: ' + b[1]);
    });
    t.ok(bubbles.length > 250, bubbles.length + ' bubbles linted (≤ 70, no dialect, no colour joke, no stray token)');
    // narration and codex
    ['goats_stir', 'goats_feat', 'goats_death', 'goats_tip'].forEach(function (key) {
      t.ok(pool(key).length >= 1 && pool(key).every(function (x) { return x.length <= 160 && !/\bblack\b/i.test(x) && !DIALECT.test(x) && !/(^|[^a-z'])(she|her)([^a-z']|$)/i.test(x); }), key + ': narration ≤ 160');
    });
    t.eq(pool('goats_tip').length, 2, 'two DM whispers');
    const codex = CREW.map(function (id) { return DD.getEnemy(id).desc; }).concat(G().CODEX.entries.map(function (e) { return e.text; }));
    t.ok(codex.length === 8 && codex.every(function (x) { return x.length <= 120 && !/(^|[^a-z'])(she|her)([^a-z']|$)/i.test(x); }), 'eight codex entries ≤ 120 (he / him)');
    t.eq(G().CODEX.group, 'The Rapping Goats (Herd Mentality, feat. Ursa Verse)', 'the codex group header');
    // mechanics texts: no colour, no dialect
    const mech = [];
    Object.keys(DD.defs.skills).filter(function (id) { return id.indexOf('rap_') === 0; }).forEach(function (id) { const d = sk(id); d.levels.forEach(function (Lv) { mech.push(d.desc(Lv)); }); mech.push(d.flavor || ''); });
    CREW.forEach(function (id) { mech.push(DD.getEnemy(id).passive.desc(null)); });
    ['rap_mic_stand', 'rap_speaker', 'rap_bale', 'rap_mound', 'rap_lump'].forEach(function (id) { mech.push(DD.getObject(id).desc); });
    mech.push(DD.getStatus('rap_called_out').desc(), DD.getStatus('rap_golden_mic').desc(), G().verseDesc(null));
    t.ok(mech.every(function (x) { return !/\bblack\b/i.test(x) && !DIALECT.test(x) && !/(^|[^a-z'])(she|her)([^a-z']|$)/i.test(x); }), mech.length + ' mechanics texts: no colour, no dialect, crew he');
    // names: unique against every other registered name (and the hero-side names the plan reserves)
    const RESERVED = ['Mic Drop', 'Diss Track', 'Hype Man', 'Mosh Pit', 'Encore!', 'Heckle', 'Roasted', 'Your Mom Joke', 'Power Ballad', 'G.O.A.T.',
      'Bleat of Defiance', 'Eats Anything', 'Slow Burn', 'I\'ll Wait', 'Shellacking', 'Open Mic Night (Hostile)'];
    const mine = [];
    CREW.forEach(function (id) { mine.push(DD.getEnemy(id).name); });
    Object.keys(DD.defs.skills).filter(function (id) { return id.indexOf('rap_') === 0; }).forEach(function (id) { mine.push(sk(id).name); });
    ['rap_called_out', 'rap_golden_mic'].forEach(function (id) { mine.push(DD.getStatus(id).name); });
    ['rap_mic_stand', 'rap_speaker', 'rap_bale', 'rap_mound', 'rap_lump'].forEach(function (id) { mine.push(DD.getObject(id).name); });
    const others = {};
    RESERVED.forEach(function (n) { others[n.toLowerCase()] = 'reserved'; });
    ['heroes', 'enemies', 'skills', 'statuses', 'objects', 'items', 'consumables'].forEach(function (k) {
      Object.keys(DD.defs[k] || {}).forEach(function (id) { if (id.indexOf('rap_') !== 0 && DD.defs[k][id] && DD.defs[k][id].name) others[String(DD.defs[k][id].name).toLowerCase()] = k + ':' + id; });
    });
    mine.forEach(function (n) { t.ok(!others[n.toLowerCase()], 'the name "' + n + '" is unique' + (others[n.toLowerCase()] ? ' (taken by ' + others[n.toLowerCase()] + ')' : '')); });
    t.eq(mine.filter(function (n, i) { return mine.indexOf(n) !== i; }).length, 0, 'and unique among the goats\' own');
  });

  // ---- sprites -------------------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: sprites and props — four crew sprites, every pose, five yaws, the mic on the holder, the bear the biggest, no painter errors', function (t) {
    if (!ready(t)) return;
    if (!DD.Sprites || !DD.Iso || typeof document === 'undefined') { t.skip('no renderer'); return; }
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const p0 = (DD.problems || []).length, w0 = (DD.errors || []).length;
    scene(130);
    act(function () { G().entrance(); });
    const bbox = function () {
      const d = ctx.getImageData(0, 0, 256, 256).data;
      let top = 256, bot = -1, l = 256, r = -1;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if (d[(y * 256 + x) * 4 + 3] > 20) { if (y < top) top = y; if (y > bot) bot = y; if (x < l) l = x; if (x > r) r = x; }
      return { h: bot - top, w: r - l };
    };
    let n = 0;
    [0, 90, 180, 270, 37.5].forEach(function (yaw) {
      DD.Iso.withYaw(yaw, function () {
        const size = {};
        CREW.forEach(function (id) {
          const spec = DD.getEnemy(id).sprite, u = who(id);
          ['idle', 'attack', 'hurt', 'cast'].forEach(function (pose) {
            [0, 0.7, 2.3].forEach(function (tt) {
              ctx.clearRect(0, 0, 256, 256);
              DD.Sprites.draw(ctx, spec, 128, 230, 1, { t: tt, pose: pose, unit: tt > 1 ? null : u, facing: tt > 1 ? -1 : 1 });
              n++;
            });
          });
          ctx.clearRect(0, 0, 256, 256);
          DD.Sprites.draw(ctx, spec, 128, 230, 1, { t: 0, pose: 'idle', unit: u });
          size[id] = bbox();
        });
        t.ok(CREW.every(function (id) { return id === URSA || (size[URSA].h > size[id].h && size[URSA].w >= size[id].w); }),
          'yaw ' + yaw + ': the bear is the biggest (' + CREW.map(function (id) { return id.slice(4) + ' ' + size[id].w + '×' + size[id].h; }).join(', ') + ')');
        const gp = DD.Iso.painter(ctx, { t: 1.3, yawAware: false });
        const gy = DD.Iso.painter(ctx, { t: 1.3, yawAware: true });
        ctx.clearRect(0, 0, 256, 256);
        DD.getObject('rap_mic_stand').draw(gp, { id: 'rap_mic_stand', hp: 0, maxHp: 0, data: {} }, 1.3);
        DD.getObject('rap_speaker').draw(gy, { id: 'rap_speaker', hp: 12, maxHp: 12, data: {} }, 1.3);
        DD.getObject('rap_bale').draw(gp, { id: 'rap_bale', hp: 6, maxHp: 6, data: {} }, 1.3);
        DD.getObject('rap_bale').draw(gp, { id: 'rap_bale', hp: 2, maxHp: 6, data: {} }, 1.3);
        DD.getObject('rap_mound').draw(gp, { id: 'rap_mound', hp: 0, maxHp: 0, data: {} }, 1.3);
        DD.getObject('rap_lump').draw(gp, { id: 'rap_lump', hp: 0, maxHp: 0, data: {} }, 1.3);
        ['rap_stage', 'rap_gold', 'rap_pink'].forEach(function (id) { DD.getTerrain(id).draw(gp, { x: 3, y: 4 }, 1.3); });
      });
    });
    t.eq(n, 5 * 4 * 4 * 3, n + ' sprite draws');
    t.eq((DD.problems || []).length - p0, 0, 'no sprite problems');
    t.eq((DD.errors || []).length - w0, 0, 'no swallowed painter errors');
    const pt = DD.Sprites.portrait ? DD.Sprites.portrait(URSA, 64) : null;
    t.ok(!DD.Sprites.portrait || !!pt, 'a portrait');
    t.ok(DD.getEnemy(URSA).sprite.palette.skin !== DD.getEnemy(BILLY).sprite.palette.skin && DD.getEnemy(BILLY).sprite.palette.skin === '#2b2730', 'charcoal goats (never Betty\'s brown and white), a brown bear');
  });

  // ---- robustness ---------------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: robustness — each member alone in a bare sandbox acts, every wind-up honest under the area watch', function (t) {
    if (!ready(t)) return;
    CREW.forEach(function (id) {
      DD.Combat.sandbox({ w: 11, h: 11, seed: 4, cameo: false, objective: { type: 'custom' }, encounter: { id: 'rap_alone', checkObjective: function () { return null; } },
        heroes: PARTY.map(function (h, i) { return { id: h, x: 1 + (i % 2), y: 3 + i, level: 4 }; }), enemies: [{ id: id, x: 7, y: 5 }] });
      let used = 0;
      const me = who(id);
      DD.Act.addRule({ id: 'test_rap_used', name: 'used', silent: true, hooks: { onSkillUsed: function (ctx) { if (ctx.user === me) used++; } } });
      for (let r = 0; r < 3 && !S().result; r++) play();
      DD.Act.removeRule('test_rap_used');
      t.ok(used > 0 || (me.intents || []).length > 0, id + ' alone acts (' + used + ' skills in 3 rounds)');
    });
    const watch = T.contentHelpers && T.contentHelpers.watchAreas;
    if (!watch) { t.log('content_tests helpers not loaded: the area watch is skipped'); return; }
    let res = null;
    const w = watch(function (ww) {
      startFight(131, { real: true });
      ww.arm();
      res = DD.AutoPlay.runBattle(40);
    });
    w.violations.forEach(function (v) { t.fail(v); });
    t.ok(w.actions > 0, w.actions + ' actions watched (' + w.windups + ' wind-ups), ' + (res && res.result) + ' in ' + (res && res.rounds) + ' rounds');
  });

  // ---- AutoPlay battles ------------------------------------------------------------------------------------------------------------
  T.suite('boss_goats: AutoPlay battles (fixture party; real=1: random real parties at L5.5 against the plan\'s band, with puzzle engagement)', function (t) {
    if (!ready(t)) return;
    const real = t.param('real', '0') === '1';
    const pool0 = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    if (real && pool0.length < 4) { t.skip('real=1 needs the hero files (isolate=goats,heroes)'); return; }
    const n = Math.max(1, +(t.param('n', real ? 20 : 2)) || 1);
    const level = +(t.param('level', LV)) || LV;
    const cameo = t.param('cameo', '0') === '1';
    const rng = DD.RNG('rap-sims:' + t.seed);
    let wins = 0, rounds = 0, timeouts = 0, downs = 0, reached = 0, arrived = 0;
    const eng = {};
    const taken = {}, uses = {}, turns = {}, idle = {}, acted = {};
    // tuning probes (BAL): knobs=key:value,… (DD.Goats.N numbers), hpx=<HP factor of the four>
    const N = G().N, savedN = JSON.parse(JSON.stringify(N)), hpx = +(t.param('hpx', 1)) || 1, saved = {};
    String(t.param('knobs', '')).split(',').filter(Boolean).forEach(function (kv) { const p = kv.split(':'); if (p[0] in N && typeof N[p[0]] === 'number') N[p[0]] = +p[1]; });
    CREW.forEach(function (id) { const d = DD.getEnemy(id); saved[id] = d.hp; d.hp = Math.round(d.hp * hpx); });
    // hp=billy:110,kid:85 (one member's HP); lv=rap_gruff.dmg:9,… (a skill's level-1 numbers; rap_bar_none.dmg2: level II)
    String(t.param('hp', '')).split(',').filter(Boolean).forEach(function (kv) { const p = kv.split(':'), d = DD.getEnemy('rap_' + p[0]); if (d) d.hp = +p[1]; });
    const savedMov = {};
    CREW.forEach(function (id) { savedMov[id] = DD.getEnemy(id).mov; });
    String(t.param('mov', '')).split(',').filter(Boolean).forEach(function (kv) { const p = kv.split(':'), d = DD.getEnemy('rap_' + p[0]); if (d) d.mov = +p[1]; });
    const savedLv = [];
    String(t.param('lv', '')).split(',').filter(Boolean).forEach(function (kv) {
      const p = kv.split(':'), q = p[0].split('.'), sd = sk(q[0]);
      const li = /2$/.test(q[1]) ? 1 : 0, key = q[1].replace(/2$/, '');
      if (!sd || !sd.levels[li] || !(key in sd.levels[li])) return;
      savedLv.push([sd, li, key, sd.levels[li][key]]);
      sd.levels[li][key] = +p[1];
    });
    try {
      for (let i = 0; i < n; i++) {
        const ids = real ? rng.sample(pool0, 4) : PARTY;
        const s = bareRows(real, function () { return startFight('sim' + i, { real: true, level: level, ids: ids, cameo: cameo }); });
        let half = false;
        DD.Act.addRule({ id: 'test_rap_diag', name: 'diag', silent: true, hooks: {
          onTakeDamage: function (d) {
            if (DD.Act.simulating || !d.target) return;
            if (d.target.kind === 'hero') { const k = d.skill ? d.skill.id : d.cause; taken[k] = (taken[k] || 0) + (d.dealt || 0); }
            const tt = G().crewTotals(S());
            if (tt.max && tt.hp <= tt.half) half = true;
          },
          onSkillUsed: function (ctx) {
            if (DD.Act.simulating || !ctx || !ctx.user || CREW.indexOf(ctx.user.defId) < 0 || !ctx.skill) return;
            uses[ctx.skill.id] = (uses[ctx.skill.id] || 0) + 1;
            acted[ctx.user.id] = true;
          },
          onTurnEnd: function (u) {
            if (DD.Act.simulating || !u || CREW.indexOf(u.defId) < 0) return;
            turns[u.defId] = (turns[u.defId] || 0) + 1;
            if (!acted[u.id] && !(u.intents || []).some(function (x) { return x.round === S().round; })) idle[u.defId] = (idle[u.defId] || 0) + 1;
            acted[u.id] = false;
          },
        } });
        const res = DD.AutoPlay.runBattle(40);
        rounds += res.rounds;
        if (res.result === 'victory') wins++;
        if (res.timeout) timeouts++;
        downs += s.stats.downs || 0;
        const st = G().stats(s);
        Object.keys(st).forEach(function (k) { if (typeof st[k] === 'number') eng[k] = (eng[k] || 0) + st[k]; });
        if (half) { reached++; if (st.bear === 'here') arrived++; }
        if (t.param('fights')) t.log('#' + i + ' ' + ids.join(',') + ': ' + res.result + ' in ' + res.rounds + ' rounds, ' + JSON.stringify(st));
        if (t.param('trace') && i === 0) S().log.forEach(function (l) { t.log('  [' + (l.round || '') + '] ' + l.text); });
      }
    } finally {
      Object.keys(savedN).forEach(function (k) { N[k] = savedN[k]; });
      CREW.forEach(function (id) { DD.getEnemy(id).hp = saved[id]; DD.getEnemy(id).mov = savedMov[id]; });
      savedLv.forEach(function (x) { x[0].levels[x[1]][x[2]] = x[3]; });
    }
    const pct = Math.round(100 * wins / n);
    const per = function (o) { const r = {}; Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).forEach(function (k) { r[k] = Math.round(10 * o[k] / n) / 10; }); return JSON.stringify(r); };
    t.log('Rapping Goats at L' + level + ' (' + (real ? 'random real parties' : 'fixture party') + (cameo ? ', with the start cameo' : '') + '): won ' + wins + '/' + n + ' (' + pct + '%), avg rounds ' +
      (rounds / n).toFixed(1) + ', downs ' + (downs / n).toFixed(2) + ', timeouts ' + timeouts + ', the bear ' + arrived + '/' + reached + ' of the fights that reached half');
    t.log('engagement per fight: ' + per(eng));
    t.log('damage to heroes by source per fight: ' + per(taken));
    t.log('crew skill uses per fight: ' + per(uses) + ' · turns ' + per(turns) + ' · turns with no action ' + per(idle));
    if (hpx !== 1 || t.param('knobs') || t.param('hp') || t.param('lv')) t.log('probe: hpx ' + hpx + ', knobs ' + t.param('knobs', '-') + ', hp ' + t.param('hp', '-') + ', lv ' + t.param('lv', '-'));
    t.eq(timeouts, 0, 'no timeouts');
    t.eq(arrived, reached, 'the bear arrives in every fight that reaches half');
    if (!real) return;
    t.ok(pct >= 45 && pct <= 90, 'author band (plan §7.1: 66-74% at L5.5; this check 45-90%): ' + pct + '%');
    t.ok(eng.hung > 0 && eng.claps > 0 && (eng.cut + eng.fizzled) > 0, 'the puzzle happens (hung ' + eng.hung + ', claps ' + eng.claps + ', Bar None cut ' + eng.cut + ' / fizzled ' + eng.fizzled + ')');
  });
})();
