/* Dungeons and Degenerates — tests/content/svammiel_lines.js
 * Suites "svammiel_lines: …" for js/data/svammiel_lines.js (V3, plan .tmp/v3/design.md §5.2, §8.4 NARRATIVE): Svammiel's
 * cameo pools. The twist line is exactly the user's; every hero of the registry (and of the V3 roster) has roasts,
 * comebacks and a twist reaction, so a new hero fails loudly until it gets its own; every door lane, situation,
 * interjection, sulk, bribe, reason and cheat has its pool; bubbles ≤ 70 characters, the DM's counters ≤ 160; tokens only
 * where the cameo trigger fills them; the party filter's lint (a line about a hero names exactly that hero in exact case,
 * every other line names none, "Mayor" and "Professor" included); pronouns for the heroes and every act-4 villain; the
 * goats' tone guard; the svammiel cameo def finds a pool for each of its triggers, cheats and doors; a run of start
 * cameos never repeats a line (the real DD.Cameo, every door, the finale, every hero rotated); act-4 display names are
 * unique against the hero side, the classic enemies and Benedick's reserved names.
 * Works in isolation (core + fixtures + this pack): missing heroes are stood in by fixture clones under their real names.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  // the V3 roster (plan §0.2): every hero needs pools from day one; DD.defs.heroes adds any later hero
  const ROSTER = {
    zarathor: 'Zarathor', syllamin: 'Syllamin', marbles: 'Professor Marbles', marwyn: 'Marwyn', ellaria: 'Ellaria', josiah: 'Josiah',
    sparrow: 'Sparrow', corelos: 'Corelos', slate: 'Slate', buga: 'Mayor Buga', kiri: 'Kiri', betty: 'Betty', basanos: 'Basanos',
    valdris: 'Valdris', hjalmar: 'Hjalmar', pebbles: 'Pebbles', benedick: 'Benedick',
  };
  const SHE_HEROES = ['ellaria', 'sparrow', 'kiri'];
  // the plan's five doors (§2.2); the registry's lanes are added when their encounters are loaded
  const PLAN_LANES = ['gardener', 'league', 'galbraith', 'coven', 'goats'];
  // svammiel.js situation(): the 19 situations it can name (plan §4.1, V §6.2), and the token each one fills
  const SITS = { fallen: ['name'], recruit: ['hero'], first: [], last_mini: [], debt: ['hero'], downed_last: ['hero'], mvp: ['hero'], flawless: [],
    from_tavern: [], from_shop: [], from_event: [], hurt: [], fresh: [], rich: [], broke: [], scarred: ['hero'], swapped: [], brutal: [], casual: [] };
  // the cheats of the plan (§3.0.2 and §3.5), by svammiel.js id: each has quips and the DM's counter from day one
  const PLAN_CHEATS = ['svam_green_thumb', 'svam_nepotism', 'svam_cameo_one', 'svam_cameo_lava', 'svam_cameo_radio', 'svam_lava', 'svam_bonus',
    'svam_no_healing', 'svam_ban', 'svam_tilt', 'svam_rule_zero', 'svam_panel_swap', 'svam_moving_costs', 'svam_swap', 'svam_wander',
    'svam_no_signatures', 'svam_hype_tax', 'svam_reroll', 'svam_nat1', 'svam_nat20', 'svam_go_twice', 'svam_scheduling', 'svam_no_more_floor',
    'svam_retcon', 'svam_real_dice'];
  // the tokens each trigger fills (js/engine/cameo.js TOKENS, narrowed to what every call passes)
  const TRIGGER_TOKENS = { start: ['enemy', 'n'], comeback: [], heroDowned: ['hero', 'enemy', 'n'], kill: ['enemy', 'n'], signature: ['hero', 'enemy', 'n'],
    windupCancel: ['enemy', 'n'], round: ['n', 'enemy'], victory: ['enemy', 'n'], none: [] };
  // the environmental kill always has a hero killer (its trigger's `when`), so it may name {hero}
  const KEY_TOKENS = { svam_env_kill: ['hero', 'enemy', 'n'] };
  // Benedick's lines, the Benedick addendum §19.2 (verbatim)
  const BENEDICK = {
    roast: ['Benedick! I started this fight last Tuesday. Glad you could make it.', 'A dragon, Benedick? You\'re a snail with a business card.',
      'I salted the floor for you, Benedick. ...Kidding. Or AM I?', 'Two-turn wings, Benedick? Mine are permanent. Read the fine print.',
      'You carry your house everywhere, Benedick. I OWN the floor it\'s on.', 'Benedick, I\'ve seen glaciers with more initiative.'],
    back: ['I\'m not slow. I\'m inevitable. There\'s a difference.', 'You own the floor. I\'ve slimed it. We\'ll call it even.',
      'Keep talking. I\'ll get to you. I always get there.'],
    react: ['Another boss? Splendid. I\'d only just arrived for this one.'],
  };
  // the goats addendum §15 (verbatim): the announcer, the Radio Edit, the bear's entrance, the sulk, the R4 callback
  const GOATS = {
    svam_cameo_goats: ['Give it up for my house band! Three goats, one mic, zero chill.', 'Live from under the table: HERD! MENTALITY!',
      'They wrote a verse about each of you. Lots of rhymes for \'dead\'.', 'I\'m the host, the judge AND the crowd. Guess who wins tonight?',
      'Tonight\'s topic: you. Every bar is about you. Enjoy.', 'The judges are ready. The judge is me. I scored it this morning.',
      'Welcome to the barn. The goats run it. I take the door money.', 'Whatever you do, don\'t wake what\'s in the hay. Trust me.'],
    svam_quip_svam_cameo_radio: ['Radio edit! That skill had language in it.', 'Bleep! Your best move is off the air. Family show.'],
    svam_counter_svam_cameo_radio: ['DM (whispering): "One move is off the air for this fight. Play the rest of the set."'],
    svam_phase_goats: ['A BEAR? Who booked a bear? ...Me. I\'m a big fan.', 'FEATURE! I booked him with your money!'],
    svam_sulk_goats: ['My house band! Who\'s going to play my birthday now?', 'Herd Mentality is on hiatus. Creative differences. With you.'],
  };
  const R4_CALLBACK = 'Another bleep! You loved the radio edit, so I made a remix.';
  const BRIBE = ['Gold? For ME? ...This changes nothing. It changes one thing.', 'Bribery! My love language. Fine. No rule this time.',
    'I\'ll allow it. I\'m also pocketing it.'];
  // Benedick's reserved display names (plan §4.12): no act-4 def reuses one
  const RESERVED = ['Fourteen Thousand Teeth', 'Slow Burn', 'Coming Out of My Shell', 'Slime Line', 'I\'ll Wait', 'Lettuce Pray', 'Shellacking',
    'Spit Shine', 'Snail Mail', 'Morning Breath', 'Wing It', 'Riddle Me This', 'The Inevitable', 'A Sticky Situation', 'Snail Slime', 'In His Shell',
    'Dragonsnail'];
  // the act-4 families (ids): Svammiel, the Gardener, the League, Galbraith, the Coven, the Rapping Goats
  const A4_ID = /^(svam|gard|lg|gal|cov|rap)_/;
  // the act-4 cast and their pronouns (plan §0.2): a sentence naming exactly one of them never uses the other gender
  const HE = ['he', 'him', 'his', 'himself'], SHE = ['she', 'her', 'hers', 'herself'];
  const VILLAINS = [
    { who: 'Svammiel', re: /\bSvammiel\b/, bad: SHE }, { who: 'the Gardener', re: /\bGardener\b/, bad: HE.concat(SHE) },
    { who: 'Galbraith', re: /\bGalbraith\b/, bad: SHE }, { who: 'Skylla', re: /\bSkylla\b/, bad: HE },
    { who: 'Kelek', re: /\bKelek\b/, bad: SHE }, { who: 'Zarak', re: /\bZarak\b/, bad: SHE }, { who: 'Warduke', re: /\bWarduke\b/, bad: SHE },
    { who: 'Zargash', re: /\bZargash\b/, bad: SHE }, { who: 'Granny Gristle', re: /\bGranny\b/, bad: HE },
    { who: 'Auntie Brine', re: /\bAuntie Brine\b|\bBrine\b/, bad: HE }, { who: 'Cousin Mildred', re: /\bMildred\b/, bad: HE },
    { who: 'Billy Bleatz', re: /\bBilly\b/, bad: SHE }, { who: 'Lil\' Kid', re: /\bLil' Kid\b/, bad: SHE },
    { who: 'DJ Turnip', re: /\bTurnip\b/, bad: SHE }, { who: 'Ursa Verse', re: /\bUrsa\b/, bad: SHE }, { who: 'the DM', re: /\bthe DM\b|\bThe DM\b/, bad: SHE },
  ];
  // the goats' tone guard (addendum §3): no dialect markers, never the fur colour
  const DIALECT = /\b(?:yo|ain't|homie|dawg|bruh|finna|gonna)\b/i;
  const V1_TALK = /\bXP\b|experience points?|telegraph|(?:enemy|their|its) intents?\b|intent tiles|(?<!no )\bGuard\b|red tiles|what (?:it|they) will do/i;
  const BAD_PUNCT = /[!?…]\.|\.\.\.\./;

  function SL() { return DD.SvammielLines; }
  function pool(k) { return DD.defs.narration[k] || []; }
  function realIds() { return Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); }); }
  /** The V3 roster plus every registered (non-test) hero. */
  function allHeroIds() { return Object.keys(ROSTER).concat(realIds().filter(function (id) { return !ROSTER[id]; })); }
  function nameOf(id) { const d = /^test_/.test(id) ? null : DD.getHero(id); return d && d.name ? d.name : ROSTER[id] || id; }
  /** The party filter's words for a name (actions.js heroNameTests): capitalised, 3+ letters, not "The". */
  function wordsOf(name) { return String(name).split(/[^A-Za-z]+/).filter(function (w) { return w.length >= 3 && /^[A-Z]/.test(w) && w !== 'The'; }); }
  let NAME_RES = null;
  function nameRes() {
    const ids = allHeroIds();
    if (NAME_RES && NAME_RES.n === ids.length) return NAME_RES.list;
    NAME_RES = { n: ids.length, list: ids.map(function (id) { return { id: id, re: new RegExp('\\b(' + wordsOf(nameOf(id)).join('|') + ')\\b') }; }) };
    return NAME_RES.list;
  }
  /** Hero ids a line names (case-sensitive, whole words: what DD.Act.partyLines sees). */
  function heroesIn(line) { return nameRes().filter(function (h) { return h.re.test(String(line)); }).map(function (h) { return h.id; }); }
  function sentences(text) { return String(text).replace(/\.\.\./g, '…').split(/(?<=[.!?…]["”)']?)\s+/); }
  function lowerStarts(line) {
    const s = String(line).replace(/\.\.\./g, '…').replace(/[!?](["”])(?=\s+[a-z])/g, '$1');
    return (s.match(/(?:^|[.!?]["”)']?\s+)[a-z]\w*/g) || []).map(function (m) { return m.trim(); });
  }
  function tokensOf(line) { const out = []; String(line).replace(/\{(\w+)\}/g, function (m, k) { if (out.indexOf(k) < 0) out.push(k); return m; }); return out; }
  function fill(line, vars) { return String(line).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? String(vars[k]) : m; }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ''); }
  /** Words after `re`'s match in each sentence that are in `bad` (a wrong pronoun for whoever the sentence names). */
  function wrongAfter(text, re, bad) {
    const out = [];
    sentences(text).forEach(function (sen) {
      const m = re.exec(sen);
      if (!m) return;
      const words = sen.slice(m.index + m[0].length).toLowerCase().match(/[a-z]+/g) || [];
      if (words.some(function (w) { return bad.indexOf(w) >= 0; })) out.push(sen);
    });
    return out;
  }
  /** Every key this file owns, with its kind ('bubble' | 'log') and the tokens its lines may use. */
  function catalogue() {
    const C = SL();
    const out = [];
    const tokensFor = function (k) {
      if (KEY_TOKENS[k]) return KEY_TOKENS[k];
      const m = /^svam_sit_(.+)$/.exec(k);
      if (m) return (SITS[m[1]] || []);
      if (/^svam_hero_/.test(k)) return ['hero'];
      return TRIGGER_TOKENS[C.TRIGGER[k]] || [];
    };
    C.all().forEach(function (k) { out.push({ key: k, kind: C.KEYS.counter.indexOf(k) >= 0 ? 'log' : 'bubble', tokens: tokensFor(k) }); });
    return out;
  }
  /** Real hero ids missing from the registry get a fixture clone under that id and name. Returns a restore fn. */
  function standIns() {
    const tpl = DD.getHero('test_knight') ? 'test_knight' : Object.keys(DD.defs.heroes).filter(function (id) { return /^test_/.test(id); })[0];
    const made = [];
    Object.keys(ROSTER).forEach(function (id) {
      if (DD.defs.heroes[id] || !tpl) return;
      DD.defs.heroes[id] = Object.assign({}, DD.defs.heroes[tpl], { id: id, name: ROSTER[id], unlock: null });
      made.push(id);
    });
    return function () { made.forEach(function (id) { delete DD.defs.heroes[id]; }); };
  }
  /** The door lanes: the registry's real gauntlet lanes (by gauntlet.order), else the plan's five. */
  function doorLanes() {
    const encs = Object.keys(DD.defs.encounters).map(function (id) { return DD.defs.encounters[id]; })
      .filter(function (e) { return e && e.act === 4 && e.gauntlet && e.gauntlet.lane && !/^test_/.test(e.id); })
      .sort(function (a, b) { return (a.gauntlet.order || 0) - (b.gauntlet.order || 0) || (a.id < b.id ? -1 : 1); });
    const lanes = encs.map(function (e) { return e.gauntlet.lane; });
    return lanes.length ? lanes : PLAN_LANES.slice();
  }

  // ---- the twist ----------------------------------------------------------------------------------------------------
  T.suite('svammiel_lines: the twist is exactly the user\'s line, and every hero can react to it', function (t) {
    if (!t.ok(SL(), 'DD.SvammielLines (js/data/svammiel_lines.js)')) return;
    t.eq(JSON.stringify(pool('svam_twist')), JSON.stringify(['You thought this was over? I, SVAMMIEL, CONTROL ALL.']),
      'svam_twist: exactly one line, the user\'s words (plan §5.1)');
    t.ok(pool('svam_twist_panel').length >= 3, 'svam_twist_panel: his Twist-panel lines (V §4.3 step 7)');
    allHeroIds().forEach(function (id) {
      const r = pool('svam_twist_react_' + id);
      t.ok(r.length >= 1, id + ': a twist reaction (' + r.length + ')');
      r.forEach(function (l) { t.eq(heroesIn(l).filter(function (h) { return h !== id; }).join(','), '', id + ': the reaction names no other hero ("' + l + '")'); });
    });
    const def = DD.getCameo ? DD.getCameo('svammiel') : null;
    if (def) {
      const tw = (def.triggers || []).filter(function (tr) { return tr && tr.key === 'svam_twist'; })[0];
      t.ok(!!tw && tw.on === 'victory' && tw.style === 'entrance', 'the svammiel cameo plays svam_twist at the act-3 victory (entrance)');
    } else t.log('svammiel.js not loaded: the twist trigger check skipped');
  });

  // ---- heroes -------------------------------------------------------------------------------------------------------
  T.suite('svammiel_lines: every hero (the V3 roster and the registry) has 6+ roasts, 3+ comebacks and a reaction; named in exact case', function (t) {
    const ids = allHeroIds();
    t.ok(ids.length >= Object.keys(ROSTER).length, ids.length + ' heroes: the V3 roster and every registered hero');
    realIds().forEach(function (id) { t.ok(pool('svam_hero_' + id).length > 0, id + ' (registered): Svammiel has lines for this hero (a new hero needs its own)'); });
    ids.forEach(function (id) {
      const name = nameOf(id);
      const roast = pool('svam_hero_' + id), back = pool('svam_back_' + id);
      t.ok(roast.length >= 6, id + ': ' + roast.length + ' roasts (>= 6)');
      t.ok(back.length >= 3, id + ': ' + back.length + ' comebacks (>= 3)');
      roast.forEach(function (l) {
        const named = heroesIn(l);
        t.ok(named.length === 1 && named[0] === id, id + ': the roast names ' + name + ' (exact case) and nobody else: "' + l + '" (' + named.join(',') + ')');
        t.ok(!/\{\w+\}/.test(l), id + ': a roast spells the name out (no token): "' + l + '"');
      });
      back.forEach(function (l) { t.eq(heroesIn(l).filter(function (h) { return h !== id; }).join(','), '', id + ': the comeback names no other hero ("' + l + '")'); });
      // the hero's own pronouns, in roasts about them
      const bad = SHE_HEROES.indexOf(id) >= 0 ? HE : SHE;
      const re = new RegExp('\\b(' + wordsOf(name).join('|') + ')\\b');
      roast.forEach(function (l) { t.eq(wrongAfter(l, re, bad).join(' | '), '', id + ': ' + (bad === HE ? 'she/her' : 'he/him') + ' in "' + l + '"'); });
    });
    // Benedick, from day one (his hero file may land later)
    t.eq(JSON.stringify(pool('svam_hero_benedick')), JSON.stringify(BENEDICK.roast), 'svam_hero_benedick: the addendum §19.2 roasts');
    t.eq(JSON.stringify(pool('svam_back_benedick')), JSON.stringify(BENEDICK.back), 'svam_back_benedick: his comebacks');
    t.eq(JSON.stringify(pool('svam_twist_react_benedick')), JSON.stringify(BENEDICK.react), 'svam_twist_react_benedick: his reaction');
    // the Marvin gag lives in Marwyn's roasts only, and Marwyn gets the last word
    const marvin = Object.keys(DD.defs.narration).filter(function (k) { return /^svam_/.test(k) && k !== 'svam_hero_marwyn' && k !== 'svam_back_marwyn' && pool(k).some(function (l) { return /\bMarvin\b/.test(l); }); });
    t.eq(marvin.join(','), '', '"Marvin" only in Marwyn\'s own pools');
  });

  // ---- doors, situations, interjections, cheats ----------------------------------------------------------------------
  T.suite('svammiel_lines: the doors, situations, interjections, sulks, bribes, reasons, quips and counters (counts and exact lines)', function (t) {
    const lanes = PLAN_LANES.concat(doorLanes().filter(function (l) { return PLAN_LANES.indexOf(l) < 0; }));
    lanes.forEach(function (lane) {
      t.ok(pool('svam_cameo_' + lane).length >= 6, lane + ': ' + pool('svam_cameo_' + lane).length + ' announcer lines (>= 6)');
      t.ok(pool('svam_sulk_' + lane).length >= 2, lane + ': ' + pool('svam_sulk_' + lane).length + ' sulks (>= 2)');
    });
    PLAN_LANES.forEach(function (lane) { t.eq(pool('svam_cameo_' + lane).length, 8, lane + ': 8 announcer lines (plan §5.2)'); });
    // every registered door names a pool that exists (its cameo.start), and its cheat
    Object.keys(DD.defs.encounters).map(function (id) { return DD.defs.encounters[id]; })
      .filter(function (e) { return e && e.act === 4 && (e.gauntlet || e.finale) && !/^test_/.test(e.id); }).forEach(function (e) {
        const c = e.cameo;
        if (!c || typeof c.start !== 'string') return;
        t.ok(pool(c.start).length >= (e.finale ? 1 : 6), e.id + ': its announcer pool ' + c.start + ' has ' + pool(c.start).length + ' lines');
        if (c.cheat) t.ok(PLAN_CHEATS.indexOf(c.cheat) >= 0 || pool('svam_quip_' + c.cheat).length >= 2, e.id + ': its cheat ' + c.cheat + ' has quips');
      });
    // the goats' pools (addendum §15) and the R4 callback, verbatim
    Object.keys(GOATS).forEach(function (k) { t.eq(JSON.stringify(pool(k)), JSON.stringify(GOATS[k]), k + ': the goats addendum §15, verbatim'); });
    t.ok(pool('svam_quip_svam_ban').indexOf(R4_CALLBACK) >= 0, 'the R4 Skill Ban quips call back to the Radio Edit');
    // situations: every one svammiel.js can name, 1-3 lines
    Object.keys(SITS).forEach(function (k) {
      const n = pool('svam_sit_' + k).length;
      t.ok(n >= 1 && n <= 3, 'svam_sit_' + k + ': ' + n + ' lines (1-3)');
    });
    t.eq(pool('svam_generic').length, 8, 'svam_generic: 8 lines');
    // [review V3] an interjection that can fire in every fight of the act (svam_long plays in most: act-4 fights run long)
    // needs a line per fight, or the run's memory resets the pool and repeats it (a 2-line svam_long repeated in 11 of 12
    // simulated runs); the squad interjection needs one per squad door. Counts come from the registry (doors + the finale).
    const doors = Object.keys(DD.defs.encounters).map(function (id) { return DD.defs.encounters[id]; })
      .filter(function (e) { return e && e.act === 4 && e.gauntlet && !/^test_/.test(e.id); });
    const fights = Math.max(PLAN_LANES.length, doors.length) + 1;
    const squads = Math.max(3, doors.filter(function (e) { return e.objective && Array.isArray(e.objective.bossIds) && e.objective.bossIds.length > 1; }).length);
    ['svam_phase', 'svam_down', 'svam_env_kill', 'svam_signature', 'svam_long', 'svam_countered'].forEach(function (k) {
      t.ok(pool(k).length >= fights, k + ': ' + pool(k).length + ' interjections (>= ' + fights + ', one per fight of the act)');
    });
    t.ok(pool('svam_member_down').length >= squads, 'svam_member_down: ' + pool('svam_member_down').length + ' lines (>= ' + squads + ' squad doors)');
    // the bubble can land after an instant revive (onDowned hooks run before unit:downed): a line is about the fall
    t.eq(pool('svam_down').filter(function (l) { return /\b(?:is|are) (?:napping|down|lying|asleep)\b|\bstill\b|\bStay\.$/.test(l); }).join(' | '), '',
      'svam_down: no line says the hero is still lying there');
    // his own fight routes these to his barks: a wind-up line never names whose it was (he would name himself)
    t.eq(pool('svam_countered').filter(function (l) { return /\{enemy\}/.test(l); }).join(' | '), '', 'svam_countered: no {enemy} (his own wind-up in his fight)');
    t.eq(JSON.stringify(pool('svam_bribe')), JSON.stringify(BRIBE), 'svam_bribe: the plan §5.2 lines');
    t.eq(pool('svam_reason').length, 16, 'svam_reason: 16 reasons (V §7.1)');
    t.ok(pool('svam_reason').every(function (l) { return l.length <= 40 && !/[.]$/.test(l) && !/^Reason/i.test(l); }), 'reasons are fragments: the cheat line adds "Reason: " and the period');
    // cheats: two quips and the DM's counter each (the plan's list, and anything svammiel.js adds)
    const def = DD.getCameo ? DD.getCameo('svammiel') : null;
    const cheats = PLAN_CHEATS.concat(def ? Object.keys(def.cheats || {}).filter(function (id) { return PLAN_CHEATS.indexOf(id) < 0; }) : []);
    cheats.forEach(function (id) {
      t.ok(pool('svam_quip_' + id).length >= 2, id + ': ' + pool('svam_quip_' + id).length + ' quips (>= 2)');
      const c = pool('svam_counter_' + id);
      t.ok(c.length === 1 && /^DM \(whispering\): ".+"$/.test(c[0]), id + ': the DM\'s counter whisper ("' + c[0] + '")');
    });
  });

  // ---- shape --------------------------------------------------------------------------------------------------------
  T.suite('svammiel_lines: shape (bubbles ≤ 70, counters ≤ 160, tokens their trigger fills, uppercase starts, no v1 talk, no repeats)', function (t) {
    if (!SL()) { t.skip('js/data/svammiel_lines.js not loaded'); return; }
    const longest = allHeroIds().map(nameOf).sort(function (a, b) { return b.length - a.length; })[0] || 'Professor Marbles';
    const cat = catalogue();
    t.ok(cat.length > 100, cat.length + ' pools');
    cat.forEach(function (c) {
      const lines = pool(c.key);
      t.ok(lines.length > 0, c.key + ': registered');
      t.eq(lines.filter(function (l, i) { return lines.indexOf(l) !== i; }).length, 0, c.key + ': no duplicate lines');
      lines.forEach(function (l) {
        const max = c.kind === 'log' ? 160 : 70;
        t.ok(typeof l === 'string' && l.trim() === l && l.length >= 2 && l.length <= max, c.key + ': ' + l.length + ' characters (max ' + max + '): "' + l + '"');
        const filledLong = fill(l, { hero: longest, name: longest, enemy: 'The League of Villainy', n: 12 });
        t.ok(c.kind === 'log' || filledLong.length <= 92, c.key + ': filled with the longest names it still fits two bubble lines (' + filledLong.length + ')');
        const bad = tokensOf(l).filter(function (k) { return c.tokens.indexOf(k) < 0; });
        t.eq(bad.join(','), '', c.key + ': only the tokens its trigger fills ' + JSON.stringify(c.tokens) + ' in "' + l + '"');
        if (c.key === 'svam_reason') return;   // fragments after "Reason: "
        const f = fill(l, { hero: 'Xx', name: 'Xx', enemy: 'Xx', n: 3 });
        t.eq(lowerStarts(f).join(','), '', c.key + ': sentences start uppercase ("' + f + '")');
        t.ok(!V1_TALK.test(l) && !BAD_PUNCT.test(l) && !/undefined|NaN/.test(l), c.key + ': no v1 talk or doubled punctuation in "' + l + '"');
        // a hero named through a token gets no pronoun
        sentences(l).forEach(function (sen) {
          const at = sen.search(/\{(hero|name)\}/);
          if (at < 0) return;
          const words = sen.slice(at).toLowerCase().match(/[a-z]+/g) || [];
          t.eq(words.filter(function (w) { return HE.indexOf(w) >= 0 || SHE.indexOf(w) >= 0 || /^(they|them|their)$/.test(w); }).join(','), '',
            c.key + ': no pronoun for a token-named hero in "' + sen + '"');
        });
      });
    });
    // no line twice across Svammiel's pools (a run would repeat it): every svam_* key, other owners' included
    const seen = {};
    const dups = [];
    Object.keys(DD.defs.narration).filter(function (k) { return /^svam_/.test(k); }).forEach(function (k) {
      pool(k).forEach(function (l) {
        const n = norm(l);
        if (n.length < 12) return;   // reasons and one-word fragments
        if (seen[n] && seen[n] !== k) dups.push(k + ' / ' + seen[n] + ': "' + l + '"');
        else seen[n] = k;
      });
    });
    t.eq(dups.join(' | '), '', 'no line appears in two svam_* pools');
    // no count of doors or heroes (they come from the registry)
    const counted = [];
    cat.forEach(function (c) { pool(c.key).forEach(function (l) { if (/\b(?:four|five|six|sixteen|seventeen) (?:mini-?bosses|doors|rooms|heroes|toys|favourites)\b|\b(?:three|four|five) down\b/i.test(l)) counted.push(c.key + ': "' + l + '"'); }); });
    t.eq(counted.join(' | '), '', 'no count of doors or heroes');
  });

  // ---- the party filter --------------------------------------------------------------------------------------------
  T.suite('svammiel_lines: the party filter — lines about a hero name that hero; every other line names nobody ("Mayor", "Professor" included)', function (t) {
    if (!SL()) { t.skip('js/data/svammiel_lines.js not loaded'); return; }
    const C = SL();
    const own = C.KEYS.roast.concat(C.KEYS.back, C.KEYS.react);
    C.all().filter(function (k) { return own.indexOf(k) < 0; }).forEach(function (k) {
      pool(k).forEach(function (l) {
        t.eq(heroesIn(l).join(','), '', k + ': names no hero ("' + l + '")');
        t.ok(!/\b(?:Mayor|Professor)\b/.test(l), k + ': no "Mayor" / "Professor" ("' + l + '")');
      });
    });
    // in a fight: DD.Act.partyLines keeps a hero's roasts only while that hero is in it; the rest always pass
    if (!DD.Combat || !DD.Act || !DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('needs the engine and tests/fixtures.js'); return; }
    const restore = standIns();
    try {
      DD.Combat.sandbox({ w: 6, h: 6, seed: 'svl:filter', cameo: false, enemyAi: false, noPlan: true,
        heroes: [{ id: 'kiri', x: 1, y: 1 }, { id: 'betty', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
      t.eq(DD.Act.partyLines(pool('svam_hero_marwyn')).length, 0, 'no Marwyn: none of his roasts');
      t.eq(DD.Act.partyLines(pool('svam_hero_kiri')).length, pool('svam_hero_kiri').length, 'Kiri is here: all of hers');
      t.eq(DD.Act.partyLines(pool('svam_hero_buga')).length, 0, 'no Mayor Buga: none of his ("Buga" and "Mayor" both count)');
      ['svam_generic', 'svam_cameo_league', 'svam_sit_first', 'svam_bribe', 'svam_quip_svam_ban', 'svam_counter_svam_lava'].forEach(function (k) {
        t.eq(DD.Act.partyLines(pool(k)).length, pool(k).length, k + ': every line passes the party filter');
      });
    } finally { restore(); }
  });

  // ---- pronouns and tone ---------------------------------------------------------------------------------------------
  /** Every line V3's narrative owns: Svammiel's pools, the act-4 narration keys and variants, the act-4 events. */
  function v3Texts() {
    const out = [];
    if (SL()) SL().all().forEach(function (k) { pool(k).forEach(function (l) { out.push([k, l]); }); });
    const N = DD.Narrator;
    if (N && N.V3_KEYS) N.V3_KEYS.forEach(function (k) { (N.LINES[k] || []).forEach(function (l) { out.push([k, l]); }); });
    if (N && N.VARIANTS) Object.keys(N.VARIANTS).forEach(function (k) { N.VARIANTS[k].forEach(function (l) { out.push([k, l]); }); });
    Object.keys(DD.defs.events).filter(function (id) { return /^ev_a4_/.test(id); }).forEach(function (id) {
      const ev = DD.getEvent(id);
      out.push([id, ev.title], [id, typeof ev.text === 'function' ? DD.safe('event text', ev.text, ev, [null]) : ev.text]);
      ev.choices.forEach(function (c) { out.push([id, c.label], [id, c.hint]); });
    });
    return out;
  }
  T.suite('svammiel_lines: pronouns — Svammiel he, the Gardener it, Skylla and the hags she, the League, Galbraith, the goats and the bear he', function (t) {
    const texts = v3Texts();
    t.ok(texts.length > 300, texts.length + ' V3 texts');
    let named = 0;
    texts.forEach(function (x) {
      sentences(x[1]).forEach(function (sen) {
        const who = VILLAINS.filter(function (v) { return v.re.test(sen); });
        const heroes = heroesIn(sen);
        if (who.length !== 1 || heroes.length) return;   // one character, or the pronouns could be anyone's
        named++;
        t.eq(wrongAfter(sen, who[0].re, who[0].bad).join(''), '', x[0] + ': pronouns for ' + who[0].who + ' in "' + sen + '"');
      });
    });
    t.ok(named > 30, named + ' sentences name one act-4 character');
    // other owners' act-4 pools: advisory (their own suites and the integrator's sweep hold them)
    const theirs = [];
    Object.keys(DD.defs.narration).filter(function (k) { return /^(gard|league|lg|gal|cov|goats|rap)_/.test(k); }).forEach(function (k) {
      pool(k).forEach(function (l) {
        sentences(l).forEach(function (sen) {
          const who = VILLAINS.filter(function (v) { return v.re.test(sen); });
          if (who.length === 1 && !heroesIn(sen).length && wrongAfter(sen, who[0].re, who[0].bad).length) theirs.push(k + ': "' + sen + '"');
        });
      });
    });
    if (theirs.length) t.log('advisory — other act-4 pools with a pronoun to check: ' + theirs.slice(0, 5).join(' | '));
  });

  T.suite('svammiel_lines: tone — original lines, no dialect markers, never the goats\' fur colour; Zarak is the dwarf (he says orc)', function (t) {
    const texts = v3Texts();
    texts.forEach(function (x) {
      t.ok(!DIALECT.test(x[1]), x[0] + ': no dialect markers in "' + x[1] + '"');
      t.ok(!/\bblack\b/i.test(x[1]), x[0] + ': never the word "black" in "' + x[1] + '"');
    });
    // the user's running gag (Nov 6): everyone, Svammiel included, calls Zarak the dwarf; he insists he is an orc
    const zarak = texts.filter(function (x) { return /\bZarak\b/.test(x[1]); });
    t.ok(zarak.some(function (x) { return /dwarf/.test(x[1]); }) && zarak.some(function (x) { return /\borc\b|ORC/.test(x[1]); }), 'Zarak: the dwarf, says everyone; an orc, says Zarak');
    t.ok(!texts.some(function (x) { return /\b(?:Maleficio|Thorgrim|Kragg|Hexanne|Vileheart)\b/.test(x[1]); }), 'the League has the user\'s names (no draft names left)');
  });

  // ---- the cameo def finds every pool --------------------------------------------------------------------------------
  T.suite('svammiel_lines: the svammiel cameo finds a pool for each of its triggers, cheats, situations and doors', function (t) {
    const def = DD.getCameo ? DD.getCameo('svammiel') : null;
    if (!def) { t.skip('js/data/bosses/svammiel.js (C5) not loaded'); return; }
    t.eq(def.roastPrefix, 'svam_hero_', 'roastPrefix');
    t.eq(def.comebackPrefix, 'svam_back_', 'comebackPrefix');
    if (DD.Cameo && !DD.Cameo.stub && typeof DD.Cameo.keyOf === 'function') {
      ['generic', 'bribe', 'reason'].forEach(function (n) { t.eq(DD.Cameo.keyOf('svammiel', n), 'svam_' + n, 'DD.Cameo.keyOf: ' + n + ' → svam_' + n); });
    }
    (def.triggers || []).forEach(function (tr, i) {
      if (!tr) return;
      if (typeof tr.key === 'string') t.ok(pool(tr.key).length > 0, 'trigger ' + (tr.id || i) + ' (' + tr.on + '): ' + tr.key + ' has lines');
      if (typeof tr.keyOf === 'function' && tr.on === 'victory' && tr.act === 4) {
        doorLanes().forEach(function (lane) {
          const k = DD.safe('sulk keyOf', tr.keyOf, tr, [{ encounter: { act: 4, gauntlet: { lane: lane } } }, { result: 'victory' }]);
          t.ok(typeof k === 'string' && pool(k).length >= 2, 'the victory quip at the ' + lane + ' door: ' + k);
        });
      }
    });
    Object.keys(def.cheats || {}).forEach(function (id) {
      t.ok(pool('svam_quip_' + id).length >= 2 && pool('svam_counter_' + id).length === 1, id + ': quips and the counter whisper');
    });
    Object.keys(SITS).forEach(function (k) { t.ok(pool('svam_sit_' + k).length > 0, 'svam_sit_' + k + ' (the situation can fire)'); });
  });

  // ---- a run never repeats a line ------------------------------------------------------------------------------------
  T.suite('svammiel_lines: a run of start cameos never repeats a line (every door, the finale, every hero rotated)', function (t) {
    if (!DD.Cameo || DD.Cameo.stub || !DD.getCameo('svammiel') || !DD.Combat || !DD.Act) { t.skip('needs js/engine/cameo.js and the svammiel cameo (svammiel.js)'); return; }
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('needs tests/fixtures.js'); return; }
    const restore = standIns();
    const savedRun = DD.Run ? DD.Run.state : null;
    const realBark = DD.Act.bark;
    const savedRng = DD.rng;
    let barks = [];
    DD.Act.bark = function (unit, text) { if (typeof text === 'string' && !/^[a-z][a-z0-9_]*$/.test(text)) barks.push(text); return realBark.apply(DD.Act, arguments); };
    try {
      if (DD.Run) DD.Run.state = null;
      const heroes = Object.keys(ROSTER).concat(realIds().filter(function (id) { return !ROSTER[id]; })).filter(function (id) { return !!DD.getHero(id); });
      // the registry's doors, plus the plan's five while some are still missing (a partial build would test one door)
      const lanes = doorLanes().concat(PLAN_LANES.filter(function (l) { return doorLanes().indexOf(l) < 0; }));
      const runs = Math.max(6, Math.ceil(heroes.length / 4) + 2);
      const roasted = {};
      let fights = 0;
      for (let r = 0; r < runs; r++) {
        DD.rng = DD.RNG('svl:run:' + r);
        // even runs are quiet (few situations: the hero roasts get the airtime), odd runs are busy (every situation can fire)
        const busy = r % 2 === 1;
        const party = [0, 1, 2, 3].map(function (i) { return heroes[(r * 4 + i) % heroes.length]; });
        const out = heroes.filter(function (id) { return party.indexOf(id) < 0; });
        const run = { act: 4, flags: { cameo: {} }, consumables: [], gold: busy ? [20, 300][r % 4 === 1 ? 0 : 1] : 120,
          difficulty: busy ? ['brutal', 'casual'][(r >> 1) % 2] : 'normal',
          party: party.map(function (id, i) { return { id: id, dead: false, hp: 10, scars: !busy ? [] : i === 1 ? ['scar_a', 'scar_b'] : i === 2 ? ['scar_owes_the_dm'] : [] }; }),
          fallen: busy ? [out[0]] : [], map: { lanes: lanes.map(function (l) { return { id: l }; }), beaten: [] } };
        const said = [];
        lanes.concat(['']).forEach(function (lane, k) {
          const fin = !lane;
          run.flags.lastStop = !busy ? null : k === 1 ? { type: 'tavern', used: 'recruit', heroId: party[3] } : ['tavern', 'shop', 'event'][(k + r) % 3];
          run.flags.lastFight = busy && k ? { downed: [party[k % 4]], mvp: party[(k + 1) % 4], flawless: k === 2, swaps: k === 3 ? 1 : 0 } : undefined;
          const enc = { id: 'zz_svl_' + (fin ? 'finale' : lane), act: 4, kind: 'boss', name: 'Test ' + (lane || 'floor'), shortName: 'Test ' + (lane || 'floor'),
            objective: { type: 'killAll' }, cameo: { actor: 'svammiel', start: fin ? 'svam_finale_open' : 'svam_cameo_' + lane, cheat: null } };
          if (fin) enc.finale = true; else enc.gauntlet = { lane: lane, order: k + 1 };
          barks = [];
          DD.Combat.sandbox({ w: 9, h: 7, seed: 'svl:' + r + ':' + k, encounter: enc, run: run, enemyAi: false, noPlan: true,
            heroes: party.map(function (id, i) { return { id: id, x: 1, y: 1 + i }; }), enemies: [{ id: 'test_grunt', x: 7, y: 3 }] });
          const s = DD.Combat.state;
          const lines = s.log.filter(function (l) { return l.cls === 'cameo' && !l.cheat && !l.bribe; }).map(function (l) { return l.text; });
          t.ok(fin || pool('svam_cameo_' + lane).indexOf(lines[0]) >= 0, 'run ' + r + ', the ' + (lane || 'finale') + ' door: the announcer line first ("' + lines[0] + '")');
          t.ok(lines.length >= (fin && !pool('svam_finale_open').length ? 1 : 2), 'run ' + r + ', ' + (lane || 'finale') + ': an announcer line and a roast (' + lines.length + ')');
          said.push.apply(said, lines.concat(barks));
          fights++;
          if (!fin) { run.map.beaten.push(lane); run.flags.gauntlet = run.map.beaten.slice(); }
        });
        (run.flags.cameo.heroes || []).forEach(function (id) { roasted[id] = true; });
        const dup = said.filter(function (x, i) { return said.indexOf(x) !== i; });
        t.eq(dup.join(' | '), '', 'run ' + r + ' (' + party.join(', ') + '): ' + said.length + ' lines, none twice');
        t.ok((run.flags.cameo.situations || []).length >= 2, 'run ' + r + ': situations fired (' + (run.flags.cameo.situations || []).join(', ') + ')');
      }
      t.log(fights + ' start cameos over ' + runs + ' runs; heroes roasted: ' + Object.keys(roasted).length + ' of ' + heroes.length);
      t.ok(Object.keys(roasted).length >= Math.min(heroes.length, 8), 'the rotation roasts most of the roster (' + Object.keys(roasted).length + ')');
    } finally {
      DD.Act.bark = realBark;
      DD.rng = savedRng;
      if (DD.Run) DD.Run.state = savedRun;
      restore();
    }
  });

  // ---- display names -------------------------------------------------------------------------------------------------
  T.suite('svammiel_lines: act-4 display names are unique (the hero side, the classic enemies, other doors, Benedick\'s reserved names)', function (t) {
    const a4 = [];       // { fam, id, name }
    const others = {};   // norm(name) -> where
    function other(name, where) { const n = norm(name); if (n && !others[n]) others[n] = where; }
    ['skills', 'statuses', 'objects', 'surfaces', 'enemies', 'summons', 'items', 'consumables', 'passives', 'scars'].forEach(function (reg) {
      Object.keys(DD.defs[reg] || {}).forEach(function (id) {
        const d = DD.defs[reg][id];
        if (!d || /^test/.test(id) || /^test/.test(String(d.owner || ''))) return;
        if (A4_ID.test(id)) a4.push({ fam: id.split('_')[0], id: reg + ' ' + id, name: d.name });
        else other(d.name, reg + ' ' + id);
      });
    });
    Object.keys(DD.defs.heroes).forEach(function (id) {
      if (/^test_/.test(id)) return;
      const h = DD.getHero(id);
      other(h.name, 'hero ' + id);
      if (h.passive && h.passive.name) other(h.passive.name, 'hero ' + id + ' passive');
    });
    RESERVED.forEach(function (n) { other(n, 'Benedick (reserved)'); });
    const def = DD.getCameo ? DD.getCameo('svammiel') : null;
    if (def) Object.keys(def.cheats || {}).forEach(function (id) { a4.push({ fam: 'svam', id: 'cheat ' + id, name: def.cheats[id].name }); });
    const famOf = {};
    a4.forEach(function (x) { const n = norm(x.name); if (!n) return; (famOf[n] = famOf[n] || []).push(x); });
    const clashes = [];
    a4.forEach(function (x) {
      const n = norm(x.name);
      if (!n) return;
      if (others[n]) clashes.push(x.id + ' "' + x.name + '" = ' + others[n]);
      const cross = famOf[n].filter(function (y) { return y.fam !== x.fam; });
      if (cross.length) clashes.push(x.id + ' "' + x.name + '" = ' + cross.map(function (y) { return y.id; }).join('/'));
    });
    t.log(a4.length + ' act-4 names checked against ' + Object.keys(others).length + ' others');
    t.eq(clashes.filter(function (c, i) { return clashes.indexOf(c) === i; }).join(' | '), '', 'no act-4 display name reuses another\'s');
  });

  // ---- QA (Nov 17): counters match their cards; none speaks of "this round" before the round it means ----------------------
  T.suite('svammiel_lines: QA voice-1 / FIGHTS-05 — the counters match their cards and their timing', function (t) {
    // voice-1: That's a 1 Now at Galbraith turns the first big hit ON him into a 1, not his own
    const one = pool('svam_counter_svam_cameo_one')[0] || '';
    t.ok(/first big hit on him this fight/.test(one) && !/his first big hit/.test(one), 'That\'s a 1 Now (cameo): "' + one + '"');
    // FIGHTS-05: a counter whispered at the announcement (a round ahead) never says "this round" / "before the round ends"
    const B = DD.BossSvammiel;
    if (!B) { t.skip('svammiel.js not loaded'); return; }
    Object.keys(B.CHEATS).forEach(function (id) {
      const def = B.CHEATS[id];
      if (def.snap || def.phase) return;
      const line = pool('svam_counter_' + id)[0] || def.counter || '';
      if (def.whisper === 'live') t.ok(!!line, id + ': whispered as its round starts: "' + line + '"');
      else t.ok(!/this round|before the round ends|before the round turns|you had a round/i.test(line), id + ': whispered at the announcement, timeless: "' + line + '"');
    });
    // the Coven's lava cameo: the counter tells the party it spares the hags (FIGHTS-06)
    t.ok(/never burns a hag/.test(pool('svam_counter_svam_cameo_lava')[0] || ''), 'the lava cameo counter: it spares the hags');
  });
})();
