/* Dungeons and Degenerates — js/data/bosses/goats.js
 * Act IV's fifth door (V3, plan .tmp/v3/design.md §3.7; the normative spec is .tmp/v3/addendum-goats.md): THE RAPPING
 * GOATS, encounter 'boss_goats' (theme a4_barn, "The Barn Burner", 15 × 14). The crew calls itself Herd Mentality, all he:
 * (Numbers below are N's as shipped after the author sims; docs/notes/boss-goats.md has the table.)
 *   Billy Bleatz (the MC; holds the Golden Mic) — Catchy Hook (9 + knockback 2), Gruff Talk (a diss, 10, sight);
 *     Headliner: +2 to a foe next to the Mic Stand.
 *   Lil' Kid (the hype goat) — Kid Stuff (9), WHAT?! (a diss, 8, range 6, no line of sight needed: he yells from cover).
 *   DJ Turnip — Scratch That (a diss, 9, sight); Turnip the Bass (a wind-up on one colour of the dance floor, every other
 *     turn while a Speaker Stack stands and a hero is on the floor). Never holds the mic.
 *   Ursa Verse, the Paw-et Laureate (the bear lyricist) — wakes in the hay when the three goats' COMBINED HP falls to half:
 *     Writer's Block (11 + Root), Big Words (11, a whole bar on its own); takes the Golden Mic (Bar None II).
 * The Verse (a fight rule, rap_verse): one shared verse about the Called-Out hero. A diss at him or her starts a bar; a diss
 * from a DIFFERENT crew member finishes it (+3, mirrored in estimateDealt; +1 bar). An open bar hangs when its starter's
 * next turn begins, when he falls, or when the Called-Out hero changes. At 3 bars the Golden Mic holder winds up Bar None
 * (22 / 26 psychic + Weakened, no line of sight needed). The Mic Stand's Clap Back moves the verse onto the clapper (and
 * re-points a pending Bar None). Each fallen member adds a bar (the Tribute). Every member is an elite on his own
 * initiative entry, with no boss field (squad rules). No crew healing at all.
 * All fight state lives in state.data.rap (previews and dry runs copy it); cosmetic picks use DD.rng only, never in a
 * dry run. Every rap line is original; the goats' tone guard (no dialect, never the fur colour) is linted by the suite.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  // ---- ids ------------------------------------------------------------------------------------------------------
  const BILLY = 'rap_billy', KID = 'rap_kid', TURNIP = 'rap_turnip', URSA = 'rap_ursa';
  const GOATS = [BILLY, KID, TURNIP];                 // the three whose combined HP wakes the bear
  const CREW = [BILLY, KID, TURNIP, URSA];
  const HOLDERS = [URSA, BILLY, KID];                 // who takes the Golden Mic, in order (DJ Turnip never)
  const SHORT = { rap_billy: 'billy', rap_kid: 'kid', rap_turnip: 'turnip', rap_ursa: 'ursa' };
  const ENC = 'boss_goats', TAG = 'goats', RULE = 'rap_verse';
  const SK = { hook: 'rap_hook', gruff: 'rap_gruff', kidStuff: 'rap_kid_stuff', what: 'rap_what', scratch: 'rap_scratch',
    bass: 'rap_bass', block: 'rap_block', words: 'rap_big_words', barNone: 'rap_bar_none' };
  const ST = { called: 'rap_called_out', mic: 'rap_golden_mic', check: 'rap_mic_check' };
  const OBJ = { mic: 'rap_mic_stand', speaker: 'rap_speaker', bale: 'rap_bale', mound: 'rap_mound', lump: 'rap_lump' };
  const TER = { stage: 'rap_stage', gold: 'rap_gold', pink: 'rap_pink' };

  // ---- knobs (addendum §16; BAL tunes these, the descs read them) --------------------------------------------------
  const N = {
    // retuned by the author sims (L5.5: the addendum's 105 / 70 / 80, hits 8 / 6 / 7 / 10 and Bar None 18 / 22 won 100%)
    billy: 110, kid: 85, turnip: 90, ursa: 110,
    hook: 9, hookKb: 2, gruff: 10, gruffRange: 5, kidStuff: 9, what: 8, whatRange: 6, scratch: 9, scratchRange: 5,
    bass: 10, block: 11, words: 11, wordsRange: 5, punch: 3, micGuard: 2, barNone: [22, 26],
    verseMax: 3, tribute: 1, bearAt: 0.5, stirAt: 0.65, clapHype: 10, syllaminClap: 6, speakerHp: 12, baleHp: 6,
    unionRules: false,
    // cosmetic pacing (never read by the rules)
    echoChance: 0.35, banterChance: 0.3, banterGap: 2, namedChance: 0.12, attackBark: 0.25,
  };
  const MELEE = { style: 'melee', keepDistance: 0 };
  const KITER = { style: 'ranged', keepDistance: 2 };
  const DJ = { style: 'ranged', keepDistance: 3 };
  const C = { gold: '#d9b44a', pink: '#ff3fb4', fur: '#2b2730', muzzle: '#5a5560', eye: '#e8a33a', hoof: '#16131a', barn: '#7a2418' };
  // the dance floor's two colours as their tiles' tops: the bass wind-up washes its squares in the colour its hint names
  const FLOOR_TINT = { gold: C.gold, pink: '#e83aa3' };
  // one-off bubbles said from the fight logic (addendum §8, §11, §17.5; the suite lints them with the pools)
  const LINE = {
    micCheck: 'Mic check. One, two. One, two. ...Three goats.',
    bettyFirst: 'There\'s only one G.O.A.T. in this barn. It\'s three of us.',
    micBack: 'Mic\'s back where it belongs. Thanks, big guy.',
    kidMic: 'I have the mic? I HAVE THE MIC! ...WHAT do I do?',
    handover: 'Wait, that\'s MY mic-',
    feature: 'It\'s a feature, William.',
    // QA voice-2: his entrance when Billy is gone (nobody to answer)
    featureSolo: 'Who woke me? ...Ah. A verse needs finishing.',
    // QA FIGHTS-09: his Mic Check turn
    bearCheck: 'Testing. Five syllables. Then seven. Then five. ...We\'re live.',
    notBefore: 'Not before the feature!',
    speakerOne: 'My speaker! ...I still have the other one. Don\'t look at it.',
    speakerLast: 'Not BOTH speakers! ...Fine. I\'ll just hum it.',
    featBanner: 'FEAT. URSA VERSE',
    featSub: { rap_kid: 'Lil\' Kid: "Wake up, big man! It\'s your verse!"', rap_billy: 'Billy Bleatz: "Ladies and gentlemen... the BEAR."',
      rap_turnip: 'DJ Turnip: "Turn it down. He likes it quiet."' },
    groupBanner: 'THE RAPPING GOATS', groupSub: 'Billy Bleatz · Lil\' Kid · DJ Turnip',
  };

  // ---- small helpers ----------------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return !!u && DD.Act.hasStatus(u, id); }
  function byId(id) { return id && DD.Combat ? DD.Combat.byId(id) : null; }
  function quiet() { return !!(DD.Act && DD.Act.simulating); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function isCrew(u) { return !!u && u.kind === 'enemy' && CREW.indexOf(u.defId) >= 0; }
  function isGoat(u) { return !!u && u.kind === 'enemy' && GOATS.indexOf(u.defId) >= 0; }
  function incapacitated(u) { return !active(u) || DD.Act.isStunned(u) || has(u, 'sheep'); }
  function canSing(u) { return active(u) && !DD.Act.isStunned(u) && !has(u, 'sheep') && !has(u, 'charmed'); }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  function lvl(id, level) { const s = DD.getSkill(id); return (s && DD.skillLevel(s, level || 1)) || {}; }
  /** A skill's numbers as THIS fight deals them for a live unit (DD.AI.fightLevel), the raw level without one. */
  function liveLvl(id, u, level) {
    const s = DD.getSkill(id);
    if (!s) return {};
    return u && u.side && DD.AI && DD.AI.fightLevel && S() ? DD.AI.fightLevel(s, level || 1, u) : DD.skillLevel(s, level || 1);
  }
  function fightDmg() { const s = S(); return (s && s.difficulty && Number(s.difficulty.dmg)) || 1; }
  function pick(list) { return list && list.length ? list[Math.floor(DD.rng.next() * list.length)] : ''; }
  function pool(key) { return (DD.defs.narration && DD.defs.narration[key]) || []; }
  function fill(line, hero) { return String(line).replace(/\{hero\}/g, hero ? hero.name : 'you'); }
  /** The fight's verse state (created by the encounter's onStart; absent in a bare sandbox). */
  function RD(s) { s = s || S(); return s && s.data ? s.data.rap || null : null; }
  function stat(key, n) { const R = RD(); if (R) R.stats[key] = (R.stats[key] || 0) + (n === undefined ? 1 : n); }
  function members(s) {
    s = s || S();
    return s ? s.units.filter(function (u) { return active(u) && isCrew(u); }) : [];
  }
  function memberOf(defId, s) { return members(s).filter(function (u) { return u.defId === defId; })[0] || null; }
  function heroes(s) {
    s = s || S();
    return s ? s.units.filter(function (u) { return u.kind === 'hero' && active(u); }) : [];
  }
  /** The hero a damage source counts for: a hero, or a hero summon's owner. */
  function heroOf(u) {
    if (!u) return null;
    if (u.kind === 'hero') return u;
    if (u.kind === 'summon' && u.side === 'hero' && u.ownerId) { const o = byId(u.ownerId); return o && o.kind === 'hero' ? o : null; }
    return null;
  }
  function windupOf(u, id) { return ((u && u.intents) || []).filter(function (i) { return i && i.skillId === id; })[0] || null; }
  function markUnit(s) { const R = RD(s); return R && R.mark ? byId(R.mark) : null; }
  function holderUnit(s) { const R = RD(s); return R && R.holder ? byId(R.holder) : null; }
  /** The Mic Stand's tile (the live board; null in a sandbox without it). */
  function stand(s) {
    s = s || S();
    if (!s || !s.grid) return null;
    const R = RD(s);
    if (R && R.stand) { const t = G().tile(R.stand.x, R.stand.y); if (t && t.obj && t.obj.id === OBJ.mic) return t; }
    return s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === OBJ.mic; })[0] || null;
  }
  function nextToStand(p) { const t = stand(); return !!(t && p && dist(t, p) === 1); }
  /** A bubble that is also logged (Log-only and AutoPlay players read the verse too). */
  function say(u, text, cls) {
    if (quiet() || !active(u) || !text) return '';
    A().bark(u, text);
    A().log(u.name + ': "' + text + '"', cls || (u.kind === 'hero' ? 'hero' : 'enemy'));
    return text;
  }
  /** A line of a bark key, said (and logged) by u. */
  function sayKey(u, key) {
    if (quiet() || !active(u)) return '';
    const def = DD.getEnemy(u.defId);
    const lines = def && def.barks && def.barks[key] ? A().partyLines(def.barks[key]) : [];
    return say(u, pick(lines));
  }
  function later(ms) { if (!quiet() && DD.FX && !DD.FX.instant) DD.FX.wait(ms); }
  function sound(name) { if (!quiet()) DD.FX.sound(name); }

  // =================================================================================================================
  // The verse state, the tokens, the chip
  // =================================================================================================================
  function fresh() {
    return { verse: 0, mark: null, open: null, holder: null, pending: null, landed: false, dealt: {}, clapRound: 0,
      bear: 'asleep', firstCall: true, used: {}, moments: {}, banter: {}, banterRound: -9, tipped: false, rolled: false,
      last: false, over: false, stand: null,
      stats: { bars: 0, started: 0, hung: 0, barNone: 0, cut: 0, fizzled: 0, missed: 0, claps: 0, tributes: 0, bearRound: 0,
        speakers: 0, bass: 0, bassHits: 0, words: 0 } };
  }
  /** A token status (display only): kept as the OLDEST status of its unit, so a limited cleanse takes real debuffs first. */
  function addToken(u, id) {
    if (!active(u) || has(u, id)) return;
    const inst = A().addStatus(u, id, { turns: -1, silent: true }, null);
    if (!inst || !u.statuses) return;
    const i = u.statuses.indexOf(inst);
    if (i > 0) { u.statuses.splice(i, 1); u.statuses.unshift(inst); A().touch(); }
  }
  function dropToken(u, id) { if (u && has(u, id)) A().removeStatus(u, id, { silent: true, reason: 'rap' }); }

  function verseDesc(R, s) {
    const base = 'The goats rap one verse at a time about the Called-Out hero. A diss at that hero starts a bar; a diss from a different crew member ' +
      'finishes it (+' + N.punch + ' damage, +1 bar). An open bar hangs, unfinished, when its starter\'s next turn begins, when he falls, or when the ' +
      'Called-Out hero changes. At ' + N.verseMax + ' bars the Golden Mic holder winds up Bar None at the end of his turn; no bars are added while the ' +
      'Verse is full or Bar None is pending. Bar None landing resets the Verse and calls out the hero who hurt the crew most since the last ' +
      'call-out; interrupting it, killing its holder, or Bar None missing (the hero stealthed, or a skewed landing on an empty tile) resets the ' +
      'Verse. If the Called-Out hero goes down, the Verse resets and the goats call out someone else. When a crew member falls, the rest add a bar ' +
      'in his memory.';
    if (!R) return base;
    const m = byId(R.mark), h = byId(R.holder), p = byId(R.pending);
    if (R.pending) { const v = pendingOn(R); return base + ' Now: Bar None ⏳ on ' + (v ? v.name : 'nobody (it will miss)') + ' (' + (p ? p.name : '?') + ').'; }
    const o = R.open ? byId(R.open.by) : null;
    return base + ' Now: ' + R.verse + '/' + N.verseMax + ' on ' + (m ? m.name : 'nobody') + ';' +
      (o ? ' ' + o.name + '\'s bar is open (another crew member can finish it).' : ' no bar open.') +
      ' Golden Mic: ' + (h ? h.name : 'nobody') + '.';
  }
  /** The unit a pending Bar None tracks now (the Called-Out hero, or a clapper); null once it has lost its mark. */
  function pendingOn(R) {
    const it = R && R.pending ? windupOf(byId(R.pending), SK.barNone) : null;
    const v = it && it.unitId ? byId(it.unitId) : null;
    return active(v) && !has(v, 'stealth') ? v : null;
  }
  function verseName(R) {
    if (!R) return '📝 Verse 0/' + N.verseMax;
    const m = byId(R.mark);
    if (R.pending) { const v = pendingOn(R); return '📝 BAR NONE ⏳ → ' + (v ? v.name : 'nobody'); }
    const o = R.open ? byId(R.open.by) : null;
    return '📝 Verse ' + R.verse + '/' + N.verseMax + (m ? ' → ' + m.name : '') + (o ? ' · open: ' + o.name : '');
  }
  /** The three goats' combined HP (a fallen goat counts 0) and their summed live max HP. */
  function crewTotals(s) {
    s = s || S();
    let hp = 0, max = 0;
    (s ? s.units : []).forEach(function (u) {
      if (!isGoat(u)) return;
      max += u.maxHp || 0;
      if (!u.dead) hp += Math.max(0, u.hp || 0);
    });
    return { hp: hp, max: max, half: Math.floor(max * N.bearAt), stir: Math.floor(max * N.stirAt) };
  }
  function flavorOf(R, s) {
    const t = crewTotals(s);
    if (R && R.bear === 'here') {
      const h = holderUnit(s);
      return h ? (h.defId === URSA ? '🐻 Ursa Verse holds the Golden Mic' : '🎙️ ' + h.name + ' holds the Golden Mic') : '🐐 The barn goes quiet';
    }
    if (R && (R.bear === 'stirring' || R.bear === 'due')) return '🐐 Crew ' + t.hp + '/' + t.max + ' · the hay is waking up (' + t.half + ')';
    return '🐐 Crew ' + t.hp + '/' + t.max + ' · something in the hay wakes at ' + t.half;
  }
  /** The chip (live name + desc), the objective flavour line, the spotlight zone: everything the board shows of the verse. */
  function sync(s) {
    s = s || S();
    if (!s) return;
    const R = RD(s);
    const r = (s.rules || []).filter(function (x) { return x.id === RULE; })[0];
    if (r) { r.name = verseName(R); r.desc = verseDesc(R, s); r.verse = R ? R.verse : 0; }
    if (s.objective && R) s.objective.flavor = flavorOf(R, s);
    if (R) {
      const m = byId(R.mark);
      const zones = (s.data.zones || []).filter(function (z) { return !z || z.id !== 'rap_spotlight'; });
      if (active(m)) zones.push({ id: 'rap_spotlight', tiles: [{ x: m.x, y: m.y }], color: '#ffd23f', label: '🗣️' });
      s.data.zones = zones;
    }
    A().touch();
  }

  // =================================================================================================================
  // Call-outs, the mic, bars and hangs
  // =================================================================================================================
  /** The hero with the most damage dealt to the crew since the last call-out; ties: the most max HP, then party order. */
  function pickNext(s) {
    s = s || S();
    const R = RD(s), hs = heroes(s);
    if (!hs.length) return null;
    return hs.map(function (h, i) { return { h: h, i: i, d: (R && R.dealt[h.id]) || 0 }; })
      .sort(function (a, b) { return b.d - a.d || b.h.maxHp - a.h.maxHp || a.i - b.i; })[0].h;
  }
  /** The first call-out: Betty when he is in the party, else the most max HP (ties: party order). */
  function firstMark(s) {
    const hs = heroes(s);
    const betty = hs.filter(function (h) { return h.defId === 'betty'; })[0];
    if (betty) return betty;
    return hs.map(function (h, i) { return { h: h, i: i }; }).sort(function (a, b) { return b.h.maxHp - a.h.maxHp || a.i - b.i; })[0].h || null;
  }
  /** An open bar hangs (unfinished). */
  function hang(s) {
    const R = RD(s);
    if (!R || !R.open) return;
    const starter = byId(R.open.by);
    R.open = null;
    stat('hung');
    if (!quiet()) {
      if (active(starter)) {
        A().bark(starter, pick(pool('rap_hang')));
        A().log(starter.name + '\'s bar hangs in the air. Awkward.', 'enemy');
      } else A().log('The open bar hangs in the air. Awkward.', 'enemy');
    }
  }
  /** The goats call out hero h: the open bar hangs, the 🗣️ token moves, the damage tally resets. */
  function callOut(s, h, why) {
    const R = RD(s);
    if (!R) return null;
    const prev = byId(R.mark);
    const changed = !h || !prev || prev.id !== h.id;
    if (changed) hang(s);
    if (prev && changed) dropToken(prev, ST.called);
    R.mark = h ? h.id : null;
    R.dealt = {};
    R.firstCall = false;
    if (h) {
      addToken(h, ST.called);
      if (!quiet() && changed) {
        DD.FX.text(h, '🗣️ CALLED OUT', { color: C.gold, size: 16 });
        if (why !== 'clap') A().log('The goats call out ' + h.name + '. The verse is about ' + A().pronouns(h).obj + ' now.', 'enemy');
      }
    }
    sync(s);
    return h;
  }
  /** The Golden Mic goes to u (the 🎙️ token follows it). */
  function setHolder(s, u) {
    const R = RD(s);
    if (!R) return;
    const prev = byId(R.holder);
    if (prev && (!u || prev.id !== u.id)) dropToken(prev, ST.mic);
    R.holder = u ? u.id : null;
    if (u) addToken(u, ST.mic);
    sync(s);
  }
  /** Ursa Verse while he stands, then Billy Bleatz, then Lil' Kid; DJ Turnip never. */
  function pickHolder(s) {
    for (let i = 0; i < HOLDERS.length; i++) { const m = memberOf(HOLDERS[i], s); if (m) return m; }
    return null;
  }
  function passMic(s, why) {
    const R = RD(s);
    if (!R) return;
    const next = pickHolder(s), prev = byId(R.holder);
    if (next && prev && next.id === prev.id) return;
    setHolder(s, next);
    if (quiet() || !next) return;
    if (why === 'bear') return;
    if (prev && prev.defId === URSA && next.defId === BILLY) say(next, LINE.micBack);
    else if (next.defId === KID) say(next, LINE.kidMic);
    A().log('The Golden Mic passes to ' + next.name + '.', 'enemy');
  }
  /** The verse has room: not full, no Bar None pending. */
  function room(R) { return !!R && R.verse < N.verseMax && !R.pending; }
  /** att's diss at target would FINISH another member's open bar (the +3 punchline). Pure. */
  function wouldFinish(att, target, skill) {
    const R = RD();
    if (!R || !att || !target || !skill || skill.id === SK.words || (skill.tags || []).indexOf('diss') < 0) return false;
    if (!isCrew(att) || has(att, 'charmed') || R.mark !== target.id || !room(R)) return false;
    return !!R.open && R.open.by !== att.id;
  }
  /** What a diss at target would do to the verse: 'finish' | 'start' | 'words' | null. Pure. */
  function dissKind(att, target, skill) {
    const R = RD();
    if (!R || !att || !target || !skill || !isCrew(att) || has(att, 'charmed') || R.mark !== target.id || !room(R)) return null;
    if (skill.id === SK.words) return 'words';
    if ((skill.tags || []).indexOf('diss') < 0) return null;
    if (!R.open) return 'start';
    return R.open.by !== att.id ? 'finish' : null;
  }
  /** A couplet for hero h: [setup, punchline], picked with the cosmetic RNG (no repeat within a fight per hero). */
  function couplet(R, h) {
    if (quiet() || !h) return null;
    const own = pool('rap_diss_' + h.defId), used = R.used[h.defId] || (R.used[h.defId] = []);
    const free = own.map(function (l, i) { return i; }).filter(function (i) { return used.indexOf(i) < 0; });
    let line;
    if (free.length) {
      const i = free[Math.floor(DD.rng.next() * free.length)];
      used.push(i);
      line = own[i];
    } else line = fill(pick(pool('rap_diss_generic')), h);
    const parts = String(line || '').split('|');
    return parts.length === 2 ? parts : null;
  }
  /** Lil' Kid's cosmetic echo after a finished bar (35%). */
  function echo(s, finisher) {
    const kid = memberOf(KID, s);
    if (quiet() || !kid || kid === finisher || !canSing(kid) || DD.rng.next() >= N.echoChance) return;
    later(450);
    A().bark(kid, pick(DD.getEnemy(KID).barks.echo || []));
  }
  /** After a diss hit landed on the Called-Out hero (delivered: HP or Block lost). kind came from dissKind before it. */
  function afterDiss(s, u, v, kind) {
    const R = RD(s);
    if (!R || !kind || R.mark !== (v && v.id) || !room(R)) return;
    if (kind === 'start' && !R.open && active(u)) {
      const c = couplet(R, v);
      R.open = { by: u.id, line: c };
      stat('started');
      if (!quiet()) {
        if (c) say(u, c[0]);
        A().log(u.name + ' starts a bar about ' + v.name + '.', 'enemy');
        if (DD.FX) DD.FX.tile(v.x, v.y, 'pulse', { color: C.gold });
      }
    } else if (kind === 'finish' && R.open && R.open.by !== u.id) {
      const c = R.open.line || couplet(R, v);
      R.open = null;
      R.verse = Math.min(N.verseMax, R.verse + 1);
      stat('bars');
      if (!quiet()) {
        if (c && active(u)) say(u, c[1]);
        DD.FX.text(v, '+1 BAR', { color: C.pink, size: 17 });
        A().log(u.name + ' finishes it: +' + N.punch + ' damage. Verse ' + R.verse + '/' + N.verseMax + '.', 'enemy');
        echo(s, u);
      }
    } else if (kind === 'words') {
      R.verse = Math.min(N.verseMax, R.verse + 1);
      stat('bars');
      stat('words');
      if (!quiet()) {
        const c = couplet(R, v);
        if (c && active(u)) { say(u, c[0]); later(700); say(u, c[1]); }
        DD.FX.text(v, '+1 BAR', { color: C.pink, size: 17 });
        A().log(u.name + ' writes a whole bar on his own. Verse ' + R.verse + '/' + N.verseMax + '.', 'enemy');
      }
    }
    sync(s);
  }
  /** One diss hit: damage, then the verse. */
  function dissHit(ctx, dmg) {
    const u = ctx.user, v = ctx.targetUnit || (ctx.target ? G().unitAt(ctx.target.x, ctx.target.y) : null);
    if (!active(v)) return 0;
    const s = S(), kind = dissKind(u, v, ctx.skill);
    const hp0 = v.hp, bl0 = v.block || 0;
    const dealt = A().damage(u, v, dmg, { element: 'psychic' });
    const delivered = (hp0 - Math.max(0, v.hp)) > 0 || (bl0 - (v.block || 0)) > 0;
    if (delivered && kind) afterDiss(s, u, v, kind);
    return dealt;
  }

  // =================================================================================================================
  // Bar None: the wind-up, the landing, interrupts, fizzles
  // =================================================================================================================
  function barNoneLevel(u) { return u && u.defId === URSA ? 2 : 1; }
  function barNoneDmg(u) { return Math.round((N.barNone[barNoneLevel(u) - 1] || N.barNone[0]) * fightDmg()); }
  /** End of the holder's turn: a lost Bar None resets the verse; a full verse winds it up. */
  function holderTurnEnd(s, unit) {
    const R = RD(s);
    if (!R) return;
    if (R.pending === unit.id && !windupOf(unit, SK.barNone)) {
      // it fizzled (the mark went down or stealthed) or a skewed landing found nobody
      R.verse = 0;
      R.pending = null;
      stat('fizzled');
      if (R.missed) stat('missed');
      R.missed = false;
      if (!quiet()) A().log('Bar None misses its mark. The verse starts over.', 'enemy');
      sync(s);
    }
    if (unit.id !== R.holder || R.verse < N.verseMax || R.pending || !canSing(unit)) return;
    const m = markUnit(s);
    if (!active(m)) return;
    const it = DD.AI.windUp(unit, SK.barNone, m, { anchor: 'unit', track: true, level: barNoneLevel(unit), label: 'Bar None',
      data: { hint: 'Bar None → ' + m.name } });
    if (!it) return;
    R.pending = unit.id;
    R.landed = false;
    if (!quiet()) say(unit, pick(pool('rap_windup')));
    sync(s);
  }
  /** A stun-like or sheep landed on the holder: the engine dropped Bar None; the verse is dead. */
  function checkCut(s, unit) {
    const R = RD(s);
    if (!R || R.pending !== unit.id || windupOf(unit, SK.barNone)) return;
    R.verse = 0;
    R.pending = null;
    stat('cut');
    if (!quiet()) {
      A().bark(unit, pick(pool('rap_cut')));
      A().log('Bar None falls flat. The verse is dead.', 'enemy');
    }
    sync(s);
  }
  function closerFor(h) {
    const own = pool('rap_close_' + h.defId);
    return own.length ? pick(own) : fill(pick(pool('rap_close_generic')), h);
  }

  // =================================================================================================================
  // The bear: the stir, the entrance (inside the damage that crosses half), the fallback
  // =================================================================================================================
  function stir(s) {
    const R = RD(s);
    if (!R || R.bear !== 'asleep') return;
    R.bear = 'stirring';
    if (quiet()) return;
    const lump = s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === OBJ.lump; })[0];
    if (lump) {
      DD.FX.particles({ x: lump.x, y: lump.y }, { kind: 'dust', count: 14 });
      DD.FX.text({ x: lump.x, y: lump.y }, pick(pool('rap_lump')), { color: '#e8d9b0', size: 13 });
    }
    sound('roar');
    A().narrate('goats_stir', {});
    A().log('Something big is stirring in the hay.', 'enemy');
  }
  function bearSpot(s) {
    const marks = DD.Encounter && DD.Encounter.marks ? DD.Encounter.marks(s) || {} : {};
    if (marks.bear && marks.bear[0]) return marks.bear[0];
    const lump = s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === OBJ.lump; })[0];
    if (lump) return { x: lump.x, y: lump.y };
    const tagged = s.grid.tiles.filter(function (t) { return t.tag === 'bear'; })[0];
    if (tagged) return { x: tagged.x, y: tagged.y };
    const far = members(s)[0];
    return far ? { x: far.x, y: far.y } : { x: 0, y: 0 };
  }
  /**
   * QA FIGHTS-09: a full round of notice. He joins next round at his rolled place; when that place would come before a
   * hero who hasn't had a turn since he walked in (the turn under way doesn't count), his first turn is a Mic Check
   * (a status: the HUD shows it, his turn reads it). Fixed initiative modes put a joiner last: never.
   */
  function needsMicCheck(s, bear) {
    const C = DD.Combat;
    if (!s || !s.order || !C || !bear) return false;
    const e = (s.joining || []).filter(function (j) { return j.unitId === bear.id; })[0];
    if (!e) return false;
    const ctrl = function (x) { return C.isPlayerControlled ? C.isPlayerControlled(x) : x.side === 'hero'; };
    const acts = function (x) { return !!x && !x.dead && (!x.downed || (C.groupOf ? C.groupOf(x).some(active) : false)); };
    const waiting = {};
    s.order.forEach(function (o) { const x = byId(o.unitId); if (x && ctrl(x) && acts(x)) waiting[x.id] = true; });
    s.order.slice(Math.max(-1, s.turnIndex) + 1).forEach(function (o) { const x = byId(o.unitId); if (x) delete waiting[x.id]; });
    // next round, ahead of him: a higher total, or the same total with as much init (heroes win the tie)
    const t = Number(e.total) || 0, ini = Number(e.init) || 0;
    s.order.forEach(function (o) {
      const x = byId(o.unitId);
      if (x && ctrl(x) && (o.total > t || (o.total === t && (Number(o.init) || 0) >= ini))) delete waiting[x.id];
    });
    return Object.keys(waiting).length > 0;
  }
  /** FEAT. URSA VERSE: the hay opens, the bear spawns (he acts from the next round), the mic is his. */
  function entrance(s) {
    const R = RD(s);
    if (!R || R.bear === 'here') return null;
    const at = bearSpot(s);
    s.grid.tiles.forEach(function (t) { if (t.obj && (t.obj.id === OBJ.mound || t.obj.id === OBJ.lump)) A().removeObject(t.x, t.y); });
    const bear = A().spawn(URSA, at.x, at.y, { silent: true });
    if (!bear) {
      if (R.bear !== 'due' && !quiet()) A().log('The hay rumbles, but nothing can get out yet. "' + LINE.notBefore + '"', 'enemy');
      R.bear = 'due';
      sync(s);
      return null;
    }
    R.bear = 'here';
    R.stats.bearRound = s.round || 0;
    const billy = memberOf(BILLY, s), goat = billy || memberOf(KID, s) || memberOf(TURNIP, s);
    setHolder(s, bear);
    if (needsMicCheck(s, bear)) { A().addStatus(bear, ST.check, { turns: 1, silent: true }, null); stat('micChecks'); }
    if (!quiet()) {
      A().log('Ursa Verse joins the fight!', 'enemy');
      // the sub from a living goat (the Kid first: he is the one who yells it)
      const subBy = memberOf(KID, s) || billy || memberOf(TURNIP, s);
      DD.FX.banner(LINE.featBanner, { sub: subBy ? LINE.featSub[subBy.defId] : '', color: C.gold });
      sound('bass_drop');
      DD.FX.shake(6, 360);
      DD.FX.particles(bear, { kind: 'dust', count: 24 });
      if (goat) A().bark(goat, pick(pool('rap_bear_chant')));
      if (billy) { say(billy, LINE.handover); say(bear, LINE.feature); } else say(bear, LINE.featureSolo);
      A().narrate('goats_feat', {});
      if (DD.Cameo && typeof DD.Cameo.say === 'function' && DD.getCameo && DD.getCameo('svammiel')) DD.Cameo.say('svammiel', 'svam_phase_goats');
    }
    sync(s);
    return bear;
  }
  /** Inside every hit on a goat (and every crew death): the stir at 65%, the bear at combined half. */
  function checkBear(s) {
    const R = RD(s);
    if (!R || R.bear === 'here') return;
    const t = crewTotals(s);
    if (!t.max) return;
    if (R.bear === 'asleep' && t.hp <= t.stir) stir(s);
    if ((R.bear === 'asleep' || R.bear === 'stirring') && t.hp <= t.half) entrance(s);
  }

  // =================================================================================================================
  // Tributes, the last one standing, the end
  // =================================================================================================================
  function memberDown(s, dead) {
    const R = RD(s);
    if (!R) return;
    if (R.open && R.open.by === dead.id) hang(s);
    if (R.pending === dead.id) { R.verse = 0; R.pending = null; stat('cut'); }
    checkBear(s);
    const left = members(s);
    if (left.length && !R.pending && N.tribute > 0 && R.verse < N.verseMax) {
      R.verse = Math.min(N.verseMax, R.verse + N.tribute);
      stat('tributes');
      if (!quiet()) {
        const key = 'tribute_' + SHORT[dead.defId];
        const mourners = left.filter(function (m) { const d = DD.getEnemy(m.defId); return d && d.barks && d.barks[key] && canSing(m); });
        if (mourners.length) sayKey(pick(mourners), key);
        A().log('Tribute to ' + dead.name + ': +' + N.tribute + ' bar. Verse ' + R.verse + '/' + N.verseMax + '.', 'enemy');
      }
    }
    if (!R.holder || R.holder === dead.id || !active(byId(R.holder))) passMic(s, 'fell');
    if (!quiet()) {
      if (!left.length && !R.over) { R.over = true; A().narrate('goats_death', {}); }
      else if (left.length === 1 && !R.last && R.bear === 'here') { R.last = true; sayKey(left[0], 'last'); }
    }
    sync(s);
  }

  // =================================================================================================================
  // Moments and banter (cosmetic, once a fight each)
  // =================================================================================================================
  const MOMENTS = {
    goat: [[KID, 'HE\'S... THE ACTUAL G.O.A.T.?!'], [BILLY, '...Grandpa would\'ve liked him.']],
    wolf: [[KID, 'WOLF! WOLF!'], [TURNIP, 'Nobody ever believes us!']],
    dragon: [[KID, 'The snail\'s a DRAGON now?!'], [BILLY, 'Still a snail. Keep rapping.']],
    diss: [[BILLY, 'A diss track? In OUR barn?'], [KID, 'BOO! ...It\'s good though!']],
  };
  function moment(s, key) {
    const R = RD(s);
    if (!R || quiet() || R.moments[key] || !MOMENTS[key]) return false;
    const lines = MOMENTS[key];
    if (!lines.every(function (l) { const m = memberOf(l[0], s); return m && !has(m, 'sheep'); })) return false;
    R.moments[key] = true;
    lines.forEach(function (l, i) { if (i) later(700); say(memberOf(l[0], s), l[1]); });
    return true;
  }
  // banter: { lines: [[speaker def id, line]], when: 'asleep' | 'here', hero: gate hero id }
  const BANTER = [
    { lines: [[BILLY, 'Is this mic on?'], [KID, 'IT\'S ON!'], [TURNIP, 'It\'s been on the whole time.'], [BILLY, 'Then why\'s nobody clapping?']] },
    { lines: [[KID, 'Can I do the next verse?'], [BILLY, 'You do the WHAT, Kid.'], [KID, '...WHAT!'], [BILLY, 'Exactly.']] },
    { lines: [[TURNIP, 'Anybody seen my headphones?'], [KID, 'They\'re on your head.'], [TURNIP, '...I ate the other ones.']] },
    { lines: [[BILLY, 'What rhymes with \'hero\'?'], [KID, 'Zero!'], [TURNIP, 'Nero?'], [BILLY, 'Zero. We\'re going with zero.']] },
    { when: 'asleep', lines: [[KID, 'Who\'s in the hay?'], [BILLY, 'Nobody\'s in the hay.'], [KID, 'The hay is snoring.'], [BILLY, 'Don\'t wake the hay, Kid.']] },
    { when: 'asleep', lines: [[BILLY, 'Who wrote this verse?'], [TURNIP, 'The bear wrote it.'], [BILLY, 'Don\'t tell them about the bear.']] },
    { when: 'here', lines: [[URSA, 'A haiku for the heroes.'], [URSA, 'You came to the barn.'], [URSA, 'We had a verse about you.'], [URSA, 'Now you are the verse.']] },
    { when: 'here', lines: [[KID, 'Ursa, do the thing!'], [URSA, 'Which thing?'], [KID, 'The THING!'], [URSA, 'I am a poet, Kid. Be specific.']] },
    { lines: [[BILLY, 'Svammiel says we\'re his house band.'], [KID, 'He doesn\'t pay us.'], [BILLY, 'He pays us in exposure.']] },
    { hero: 'betty', lines: [[BILLY, 'There he is. Betty. The so-called G.O.A.T.'], [KID, 'He\'s so cool.'], [BILLY, 'KID.']] },
    { hero: 'benedick', lines: [[KID, 'Is that snail coming over here?'], [BILLY, 'Give him a minute.'], [TURNIP, 'Give him ten.']] },
    { hero: 'syllamin', lines: [[BILLY, 'Syllamin. The Roastmaster General.'], [TURNIP, 'He\'s tiny.'], [BILLY, 'Tiny, but he\'s got bars. Diss him first.']] },
  ];
  function banterOk(s, b) {
    const R = RD(s);
    if (b.when === 'asleep' && R.bear === 'here') return false;
    if (b.when === 'here' && R.bear !== 'here') return false;
    if (b.hero && !heroes(s).some(function (h) { return h.defId === b.hero; })) return false;
    const texts = b.lines.map(function (l) { return l[1]; });
    if (A().partyLines(texts).length !== texts.length) return false;
    return b.lines.every(function (l) { const m = memberOf(l[0], s); return m && canSing(m); });
  }
  function banter(s) {
    const R = RD(s);
    if (!R || quiet() || s.round < 2 || s.round - R.banterRound < N.banterGap || DD.rng.next() >= N.banterChance) return false;
    const ok = BANTER.map(function (b, i) { return i; }).filter(function (i) { return !R.banter[i] && banterOk(s, BANTER[i]); });
    if (!ok.length) return false;
    const i = pick(ok);
    R.banter[i] = 1;
    R.banterRound = s.round;
    BANTER[i].lines.forEach(function (l, k) { if (k) later(700); say(memberOf(l[0], s), l[1]); });
    return true;
  }

  // =================================================================================================================
  // The Verse rule (encounter.rules, copied per fight)
  // =================================================================================================================
  const VERSE_RULE = {
    id: RULE, name: '📝 Verse 0/' + N.verseMax, icon: '📝', turns: -1, desc: verseDesc(null),
    hooks: {
      onTurnStart: function (unit) {
        const s = S(), R = RD(s);
        if (!R) return;
        // a pending Bar None's hero can come back without a hook firing (Help Up, stealth broken by an attack): the chip
        // re-reads whom it tracks at every turn boundary, so it never says "nobody" about a hero it will hit
        if (R.pending && !quiet()) sync(s);
        if (!isCrew(unit)) return;
        if (R.open && R.open.by === unit.id) { hang(s); sync(s); }
      },
      onTurnEnd: function (unit) {
        const s = S(), R = RD(s);
        if (!R) return;
        if (isCrew(unit)) holderTurnEnd(s, unit);
        if (R.pending && !quiet()) sync(s);
      },
      onStatusApplied: function (unit, st) {
        const s = S(), R = RD(s);
        if (!R || !unit || !st || st.id === ST.called || st.id === ST.mic) return;
        if (isCrew(unit)) { checkCut(s, unit); return; }
        if (R.pending && st.id === 'stealth') sync(s);   // the chip shows a Bar None that has lost its hero
        if (unit.kind !== 'hero' || quiet()) return;
        if (st.id === 'bas_wolf') moment(s, 'wolf');
        else if (st.id === 'ben_dragon') moment(s, 'dragon');
      },
      onStatusRemoved: function (unit, st, reason) {
        const s = S(), R = RD(s);
        if (!R || !unit || !st || reason === 'rap' || !active(unit)) return;
        if (R.pending && st.id === 'stealth') sync(s);   // the hero is trackable again: the chip names it again
        if (st.id === ST.called && R.mark === unit.id) addToken(unit, ST.called);
        else if (st.id === ST.mic && R.holder === unit.id) addToken(unit, ST.mic);
      },
      onTakeDamage: function (d) {
        const s = S(), R = RD(s);
        if (!R || !d || !isCrew(d.target)) return;
        if (d.dealt > 0) { const h = heroOf(d.credit || d.source); if (h) R.dealt[h.id] = (R.dealt[h.id] || 0) + d.dealt; }
        if (isGoat(d.target)) checkBear(s);
        sync(s);
      },
      onDowned: function (unit) {
        const s = S(), R = RD(s);
        if (!R || !unit || unit.id !== R.mark) return;
        R.verse = 0;
        callOut(s, pickNext(s), 'down');
      },
      onEnterTile: function (unit) {
        const R = RD();
        if (R && unit && unit.id === R.mark) sync();
      },
      onAnyDeath: function (_u, dead) {
        const s = S();
        if (!RD(s) || !isCrew(dead)) return;
        memberDown(s, dead);
      },
      // the last goat can't fall before the bear has made his entrance ("Not before the feature!")
      preventDeath: function (unit, d) {
        const s = S(), R = RD(s);
        if (!R || !isGoat(unit) || R.bear === 'here' || (d && d.cause === 'fall')) return undefined;
        if (members(s).filter(isGoat).some(function (g) { return g !== unit; })) return undefined;
        entrance(s);
        if (R.bear === 'here') return undefined;
        if (!(unit.hp > 0)) unit.hp = 1;
        return true;
      },
      onDeathPrevented: function (unit) {
        const R = RD();
        if (R && isGoat(unit) && R.bear === 'due' && !quiet()) { DD.FX.text(unit, LINE.notBefore.toUpperCase(), { color: C.gold, size: 15 }); say(unit, LINE.notBefore); }
      },
      onSkillUsed: function (ctx) {
        const s = S(), R = RD(s);
        if (!R || quiet() || !ctx || !ctx.user || ctx.user.kind !== 'hero' || !ctx.skill) return;
        if (ctx.skill.id === 'bet_goat' && (ctx.foes || []).some(isCrew)) moment(s, 'goat');
        else if (ctx.skill.id === 'syl_signature') moment(s, 'diss');
      },
    },
  };

  // =================================================================================================================
  // Skills (descs read the levels: the HUD prints them with the fight's damage factor)
  // =================================================================================================================
  const RIDER = 'At the Called-Out hero, while the Verse has room, it starts a bar or finishes another crew member\'s open bar (+' + N.punch + ' damage).';
  function lunge(ctx) { if (ctx.targetUnit && !quiet()) DD.FX.lunge(ctx.user, ctx.targetUnit); }
  function attackBark(u) {
    if (quiet()) return;
    if (DD.rng.next() < N.namedChance && A().bark(u, 'named')) return;
    A().maybeBark(u, 'attack', N.attackBark);
  }
  /** The AI's extra value of a diss (aiScore): +14 to finish a bar, +8 to start one (the Big Words: +14, a whole bar). */
  function dissScore(ctx) {
    const k = dissKind(ctx.user, ctx.targetUnit, ctx.skill);
    return k === 'finish' || k === 'words' ? 14 : k === 'start' ? 8 : 0;
  }
  function onStage(p) { const t = p && G().tile(p.x, p.y); return !!t && t.t === TER.stage; }
  /** The per-victim flat of a crew skill (the punchline, Headliner) for wind-up numbers and threat shading. Pure. */
  function crewTelegraph(id) {
    return function (unit, intent) { const v = intentVictim(unit, intent); return v ? crewFlat(unit, v, DD.getSkill(id)) : 0; };
  }

  eskill({ id: SK.hook, name: 'Catchy Hook', icon: '🪝', kind: 'attack', tags: ['melee', 'push'], anchor: 'self',
    levels: [{ dmg: N.hook, kb: N.hookKb }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and knock it back ' + L.kb + ' tiles.'; },
    flavor: 'Once it\'s in your head, it\'s in your ribs.',
    telegraphFlat: crewTelegraph(SK.hook),
    aiScore: function (ctx) {
      let v = ctx.targetUnit && nextToStand(ctx.targetUnit) ? 4 : 0;
      const st = stand();
      if (st && dist(ctx.user, st) <= 3) v += 1;
      return v;
    },
    execute: function (ctx) {
      lunge(ctx);
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().knockback(ctx.user, f, ctx.L.kb);
      });
    } });
  eskill({ id: SK.gruff, name: 'Gruff Talk', icon: '🗯️', kind: 'attack', tags: ['ranged', 'psychic', 'diss'], anchor: 'unit',
    levels: [{ dmg: N.gruff, r: N.gruffRange }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' psychic damage to a foe within ' + L.r + ' he can see. ' + RIDER; },
    flavor: 'Grandpa got past a troll with this voice. It runs in the family.',
    telegraphFlat: crewTelegraph(SK.gruff),
    aiScore: function (ctx) { const st = stand(); return dissScore(ctx) + (st && dist(ctx.user, st) <= 3 ? 1 : 0); },
    execute: function (ctx) { attackBark(ctx.user); dissHit(ctx, ctx.L.dmg); } });
  eskill({ id: SK.kidStuff, name: 'Kid Stuff', icon: '🦶', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: N.kidStuff }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'A headbutt from a goat who has not grown into his horns yet. It still counts.',
    execute: function (ctx) {
      lunge(ctx);
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) { if (active(f)) A().damage(ctx.user, f, ctx.L.dmg); });
    } });
  eskill({ id: SK.what, name: 'WHAT?!', icon: '📣', kind: 'attack', tags: ['ranged', 'psychic', 'diss'], anchor: 'unit',
    levels: [{ dmg: N.what, r: N.whatRange }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: false },
    desc: function (L) { return 'Yell at a foe within ' + L.r + ', no line of sight needed: ' + L.dmg + ' psychic damage. ' + RIDER; },
    flavor: 'Volume is a flow. Lil\' Kid has a lot of flow.',
    telegraphFlat: crewTelegraph(SK.what),
    aiScore: dissScore,
    execute: function (ctx) { attackBark(ctx.user); dissHit(ctx, ctx.L.dmg); } });
  eskill({ id: SK.scratch, name: 'Scratch That', icon: '💿', kind: 'attack', tags: ['ranged', 'psychic', 'diss'], anchor: 'unit',
    levels: [{ dmg: N.scratch, r: N.scratchRange }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' psychic damage to a foe within ' + L.r + ' he can see. ' + RIDER; },
    flavor: 'A record scratch aimed at your self-esteem. The record has a bite out of it.',
    telegraphFlat: crewTelegraph(SK.scratch),
    aiScore: function (ctx) { return dissScore(ctx) + (onStage(ctx.user) ? 2 : 0); },
    execute: function (ctx) { attackBark(ctx.user); dissHit(ctx, ctx.L.dmg); } });
  eskill({ id: SK.bass, name: 'Turnip the Bass', icon: '🔊', kind: 'attack', tags: ['aoe', 'windup'], anchor: 'ground', cooldown: 1, windupOnly: true,
    levels: [{ dmg: N.bass }], target: { type: 'tile', range: [0, 99], filter: 'any', los: false },
    area: { shape: 'custom', fn: function (ctx) { return danceTiles(ctx && ctx.state, pickColour(ctx && ctx.state)); } },
    desc: function (L) { return 'Wind-up: next turn the bass drops on the marked squares (one colour of the dance floor): ' + L.dmg + ' damage to each hero and hero summon there.'; },
    flavor: 'The beat drops. So do you, if you stand on the wrong colour.',
    execute: function (ctx) {
      const u = ctx.user;
      stat('bassLanded');
      if (!quiet()) {
        sound('bass_drop');
        DD.FX.shake(4, 260);
        (ctx.tiles || []).forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'pulse', { parallel: i > 0 }); });
      }
      const seen = {};
      (ctx.tiles || []).forEach(function (p) {
        const v = G().unitAt(p.x, p.y);
        if (!active(v) || seen[v.id] || isCrew(v) || v.side !== 'hero') return;
        seen[v.id] = 1;
        A().damage(u, v, ctx.L.dmg, { tags: ['bass'], noHighGround: true });
        stat('bassHits');
      });
    } });
  eskill({ id: SK.block, name: 'Writer\'s Block', icon: '✒️', kind: 'attack', tags: ['melee', 'root'], anchor: 'self',
    levels: [{ dmg: N.block }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Root it through its next turn.'; },
    flavor: 'He has had writer\'s block for eleven years. Now so do you.',
    aiScore: function (ctx) { const R = RD(); return R && ctx.targetUnit && ctx.targetUnit.id === R.mark ? 6 : 0; },
    execute: function (ctx) {
      lunge(ctx);
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().addStatus(f, 'root', { turns: 1 }, ctx.user);
      });
    } });
  eskill({ id: SK.words, name: 'Big Words', icon: '📖', kind: 'attack', tags: ['ranged', 'psychic', 'diss'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: N.words, r: N.wordsRange }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' psychic damage to a foe within ' + L.r + ' he can see. At the Called-Out hero, while the Verse has room, it is a ' +
        'whole bar on its own (an open bar stays open).';
    },
    flavor: 'Sesquipedalian. He looked it up. He wrote it in the margin. He is very proud.',
    aiScore: dissScore,
    execute: function (ctx) { attackBark(ctx.user); dissHit(ctx, ctx.L.dmg); } });
  /**
   * The unit a crew wind-up would land on now: a hero or hero summon. Side, not G().hostile: wind-ups ignore charm (the
   * engine's rule, as the bass), so a holder charmed after winding up still lands Bar None on the hero it marks. Pure.
   */
  function intentVictim(unit, intent) {
    const p = DD.AI.intentTarget(unit, intent);
    const v = p ? G().unitAt(p.x, p.y) : null;
    return active(v) && v.side === 'hero' ? v : null;
  }
  eskill({ id: SK.barNone, name: 'Bar None', icon: '🎤', kind: 'attack', tags: ['psychic', 'verse', 'windup'], anchor: 'unit', windupOnly: true,
    levels: [{ dmg: N.barNone[0] }, { dmg: N.barNone[1] }],
    target: { type: 'unit', range: [1, 30], filter: 'enemy', los: false },
    desc: function (L) {
      return 'Wind-up: next turn the verse lands on the Called-Out hero, wherever it stands: ' + L.dmg + ' psychic damage, and it is Weakened ' +
        'through its next turn. The Verse resets.';
    },
    flavor: 'Three bars and a closer. The closer is about you. Everybody goes OOOH.',
    // Headliner rides on Billy's Bar None too: the wind-up number shows it (a hero next to the Mic Stand)
    telegraphFlat: function (unit, intent) { const v = intentVictim(unit, intent); return unit && unit.defId === BILLY && v && nextToStand(v) ? N.micGuard : 0; },
    execute: function (ctx) {
      const u = ctx.user, s = S(), R = RD(s);
      const level = (ctx.intent && ctx.intent.level) || ctx.level || 1;
      const L = DD.skillLevel(ctx.skill, level);
      const v = ctx.target ? G().unitAt(ctx.target.x, ctx.target.y) : null;
      // the hero side, not G().hostile: a charmed holder's wind-up still lands as marked (wind-ups ignore charm)
      if (!active(v) || v.side !== 'hero') {
        // a skewed landing on a tile with no hero: a miss (the holder's turn end resets the verse)
        if (R) { R.missed = true; sync(s); }
        if (!quiet()) { DD.FX.text(ctx.target || u, 'Bar None... to nobody.', { color: '#d0d0d0', size: 14 }); A().log('Bar None lands on an empty tile. Nobody heard it.', 'enemy'); }
        return;
      }
      if (!quiet()) {
        DD.FX.beam(u, v, { color: C.gold, width: 3 });
        DD.FX.text(v, 'BAR NONE!', { color: C.gold, size: 20 });
        sound('crowd_ooh');
      }
      const closer = !quiet() ? closerFor(v) : '';
      const markBefore = R ? R.mark : null;
      A().damage(u, v, L.dmg, { element: 'psychic', noHighGround: true });
      if (active(v)) A().addStatus(v, 'weak', { turns: 1 }, u);
      if (!R) return;
      R.landed = true;
      R.verse = 0;
      R.pending = null;
      stat('barNone');
      if (!quiet() && closer) say(u, closer);
      // the new call-out (§8.2 rule 2), unless the hit downed the Called-Out hero (the down already called out the next)
      if (R.mark === markBefore) {
        const next = pickNext(s);
        if (!quiet()) A().log('Bar None lands on ' + v.name + '. The crowd goes OOOH.' + (next ? ' The goats call out ' + next.name + '.' : ''), 'enemy');
        callOut(s, next, 'barnone');
      } else {
        if (!quiet()) A().log('Bar None lands on ' + v.name + '. The crowd goes OOOH.', 'enemy');
        sync(s);
      }
    } });

  // =================================================================================================================
  // Statuses (display tokens of state.data.rap)
  // =================================================================================================================
  DD.registerStatus({ id: ST.called, name: 'Called Out', icon: '🗣️', color: C.gold, type: 'debuff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () {
      const R = RD(), h = holderUnit();
      const n = R ? R.verse : 0;
      const dmg = h ? barNoneDmg(h) : Math.round(N.barNone[0] * fightDmg());
      return 'The goats\' verse is about you (' + n + '/' + N.verseMax + '). Their disses at you build it; at ' + N.verseMax + ' bars the Golden Mic ' +
        'winds up Bar None on you (' + dmg + ' psychic damage). Another hero can clap back at the Mic Stand to take the heat.';
    } });
  DD.registerStatus({ id: ST.mic, name: 'Golden Mic', icon: '🎙️', color: C.gold, type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () { return 'Holds the Golden Mic: with the Verse at ' + N.verseMax + ' and no Bar None pending, he winds up Bar None at the end of his turn.'; } });
  DD.registerStatus({ id: ST.check, name: 'Mic Check', icon: '🎤', color: C.gold, type: 'debuff', stacking: 'none', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function () { return 'Just walked in: his first turn is a mic check, so every hero gets a turn before he acts.'; } });

  // =================================================================================================================
  // The dance floor (two terrains), the stage, the bass
  // =================================================================================================================
  /** A plank tile in yaw-0 tile px (the renderer warps it onto the view): seams along one grid axis. */
  function planks(g, color, glow) {
    const c = g.ctx;
    c.save();
    c.transform(32, 16, -32, 16, 0, 0);
    if (glow) { c.fillStyle = glow; c.fillRect(-0.4, -0.4, 0.8, 0.8); }
    c.strokeStyle = color; c.lineWidth = 0.025;
    c.beginPath();
    [-0.25, 0, 0.25].forEach(function (u) { c.moveTo(u, -0.5); c.lineTo(u, 0.5); });
    c.stroke();
    c.restore();
  }
  DD.registerTerrain({ id: TER.stage, name: 'Hayloft Stage', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#5a3a22', left: '#432b19', right: '#36220f' },
    desc: 'The hayloft stage: darker planks with a string of lights along the edge. One step up (the DJ dais two).',
    draw: function (g, t) {
      planks(g, 'rgba(20,10,4,0.55)', null);
      const c = g.ctx, k = (g.t || 0) * 2 + (t ? t.x * 0.7 + t.y : 0);
      c.save();
      c.transform(32, 16, -32, 16, 0, 0);
      [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].forEach(function (p, i) {
        const a = 0.45 + 0.4 * Math.sin(k + i * 1.7);
        c.fillStyle = 'rgba(255,214,120,' + a.toFixed(2) + ')';
        c.beginPath(); c.arc(p[0], p[1], 0.05, 0, Math.PI * 2); c.fill();
      });
      c.restore();
    } });
  DD.registerTerrain({ id: TER.gold, name: 'Gold Square', walkable: true, cost: 1, blocksLos: false,
    colors: { top: C.gold, left: '#a8862f', right: '#8a6d22' },
    desc: 'A gold square of the dance floor (lit planks). Turnip the Bass drops on one colour at a time: gold or pink.',
    draw: function (g) { planks(g, 'rgba(90,60,10,0.35)', 'rgba(255,236,160,0.28)'); } });
  DD.registerTerrain({ id: TER.pink, name: 'Pink Square', walkable: true, cost: 1, blocksLos: false,
    colors: { top: FLOOR_TINT.pink, left: '#b42b7e', right: '#8e2064' },
    desc: 'A pink square of the dance floor (lit planks). Turnip the Bass drops on one colour at a time: gold or pink.',
    draw: function (g) { planks(g, 'rgba(70,10,40,0.35)', 'rgba(255,190,232,0.26)'); } });
  function colourOf(t) { return t && t.t === TER.gold ? 'gold' : t && t.t === TER.pink ? 'pink' : null; }
  /** Every square of one colour ('gold' | 'pink') of the dance floor. */
  function danceTiles(s, colour) {
    s = s || S();
    if (!s || !s.grid) return [];
    return s.grid.tiles.filter(function (t) { return colourOf(t) === colour; }).map(function (t) { return { x: t.x, y: t.y }; });
  }
  /** The colour with the most heroes and hero summons on it; ties: the Called-Out hero's colour, then gold. */
  function pickColour(s) {
    s = s || S();
    if (!s || !s.grid) return 'gold';
    const n = { gold: 0, pink: 0 };
    s.units.forEach(function (u) {
      if (!active(u) || u.side !== 'hero') return;
      const c = colourOf(G().tile(u.x, u.y));
      if (c) n[c]++;
    });
    if (n.gold !== n.pink) return n.gold > n.pink ? 'gold' : 'pink';
    const m = markUnit(s), mc = m ? colourOf(G().tile(m.x, m.y)) : null;
    return mc || 'gold';
  }
  function speakersStanding(s) { s = s || S(); return s ? s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === OBJ.speaker; }).length : 0; }
  function bassPending(s) {
    s = s || S();
    const dj = s ? s.units.filter(function (u) { return u.defId === TURNIP && active(u); })[0] : null;
    return dj ? windupOf(dj, SK.bass) : null;
  }
  function pendingColour(s) {
    const it = bassPending(s);
    if (!it || !it.tiles || !it.tiles.length) return null;
    return colourOf(G().tile(it.tiles[0].x, it.tiles[0].y));
  }

  // =================================================================================================================
  // Objects
  // =================================================================================================================
  // ---- the Mic Stand: Clap Back ----
  function verseGoing(R) { return !!R && (R.verse >= 1 || !!R.open || !!R.pending); }
  function clapAvailable(o, unit) {
    const s = S(), R = RD(s);
    return !!R && !!unit && unit.kind === 'hero' && active(unit) && unit.id !== R.mark && R.clapRound !== s.round && verseGoing(R);
  }
  function clapBack(unit) {
    const s = S(), R = RD(s);
    if (!R || !active(unit)) return;
    callOut(s, unit, 'clap');
    if (R.pending) {
      const h = byId(R.pending), it = windupOf(h, SK.barNone);
      if (h && it) DD.AI.redirectIntent(h, it, unit);
    }
    R.clapRound = s.round;
    stat('claps');
    A().gainHype(N.clapHype, 'clap back');
    const st = stand(s);
    if (!quiet()) {
      if (st) DD.FX.text({ x: st.x, y: st.y }, '+' + N.clapHype + ' Hype', { color: C.pink, size: 16 });
      sound('crowd_ooh');
      const own = pool('rap_back_' + unit.defId);
      say(unit, own.length ? pick(own) : pick(pool('rap_back_generic')));
      const crew = members(s).filter(canSing);
      if (crew.length) { later(600); say(pick(crew), pick(pool('rap_clapped'))); }
      A().log(unit.name + ' claps back at the Mic Stand! The verse is about ' + unit.name + ' now. The crowd tips ' + N.clapHype + ' Hype.', 'hero');
    }
    if (unit.defId === 'syllamin') {
      // "he does this professionally": every crew member who can see him takes it
      members(s).filter(function (m) { return G().los(m, unit); }).forEach(function (m) {
        if (active(m)) A().damage(unit, m, N.syllaminClap, { element: 'psychic', noHighGround: true });
      });
    }
    sync(s);
  }
  /** AutoPlay's value of clapping back now (the Hype, or taking the heat off a hero about to drop). */
  function clapValue(unit, obj, tile, state, how) {
    if (how && how !== 'interact') return 0;
    if (!clapAvailable(obj, unit)) return 0;
    const s = state || S(), R = RD(s), m = markUnit(s);
    let v = 4;
    if (R.pending && m) {
      const h = byId(R.pending), it = windupOf(h, SK.barNone);
      const D = h && it ? DD.AI.intentDmg(h, it) : barNoneDmg(h);
      if (m.hp <= D + 8 && unit.hp >= D + 10 && unit.hp >= unit.maxHp * 0.6) v = 30;
    } else if (m && m.hp < m.maxHp * 0.4 && unit.hp > unit.maxHp * 0.7 && unit.maxHp >= m.maxHp) v = 10;
    if (pendingColour(s) === 'pink') v -= 10;
    return v;
  }
  function drawMic(g) {
    const t = g.t || 0;
    g.ellipse(0, 2, 22, 10, 'rgba(255,214,90,' + (0.16 + 0.06 * Math.sin(t * 2)).toFixed(2) + ')');   // the spotlight
    g.ellipse(0, 1, 8, 3.6, '#5d6470', true);                                                             // weighted base
    g.ellipse(0, 0, 6, 2.6, '#9aa3ad');
    g.line(0, 0, 0, -30, '#1a1014', 3);
    g.line(0, 0, 0, -30, '#c9ced6', 1.6);
    g.line(0, -30, 4, -34, '#c9ced6', 1.6);
    g.circle(5, -36, 3.4, '#2e323c', true);
    g.circle(5, -36, 2.2, '#8a919c');
    g.line(3.4, -37.4, 6.6, -34.6, 'rgba(255,255,255,0.5)', 0.6);
  }
  DD.registerObject({ id: OBJ.mic, name: 'The Mic Stand', blocksMove: true, blocksLos: false, hp: 0, height: 1.1, color: '#9aa3ad', targetable: false,
    desc: 'Clap Back (1 AP, next to the stand, once per round, while the goats have a verse going; not the Called-Out hero): you become the ' +
      'Called-Out hero, the open bar hangs, a Bar None being wound up turns on you, and the crowd tips the party ' + N.clapHype + ' Hype. ' +
      'Syllamin\'s clap back also deals ' + N.syllaminClap + ' psychic damage to each crew member who can see him.',
    available: clapAvailable,
    interact: { ap: 1, label: 'Clap Back', fn: function (unit) { clapBack(unit); } },
    autoplay: clapValue,
    draw: drawMic });

  // ---- Speaker Stacks ----
  function speakerValue(unit, obj, tile, state, how) {
    if (how && how !== 'break') return 0;
    const s = state || S();
    if (!s || !s.units.some(function (u) { return u.defId === TURNIP && active(u); })) return 0;
    return speakersStanding(s) <= 1 ? 12 : 6;
  }
  function drawSpeaker(g) {
    const t = g.t || 0, pulse = bassPending() ? 1 + 0.12 * Math.sin(t * 14) : 1;
    g.ellipse(0, 2, 18, 8, 'rgba(0,0,0,0.3)');
    g.box(0, 0, 14, 7, 34, { top: '#3a3440', left: '#26222b', right: '#1c1920' }, true);
    g.faces(0, 0, 14, 7).forEach(function (f) {
      [[0.5, 24, 3.2], [0.5, 11, 5]].forEach(function (k) {
        const p = f.at(k[0], k[1]);
        g.ellipse(p[0], p[1], k[2] * pulse * 0.85, k[2] * pulse, '#0f0d12', 'rgba(150,140,160,0.8)');
        g.ellipse(p[0], p[1], k[2] * 0.35, k[2] * 0.4, '#4a4452');
      });
      if (f.dir === 'S') {
        const q = f.at(0.18, 30);
        g.circle(q[0], q[1], 2, '#b48ad6');
        g.line(q[0], q[1] - 2, q[0] - 1.2, q[1] - 4, '#6fbf5a', 1);
        g.line(q[0], q[1] - 2, q[0] + 1.2, q[1] - 4, '#6fbf5a', 1);
      }
    });
  }
  DD.registerObject({ id: OBJ.speaker, name: 'Speaker Stack', blocksMove: true, blocksLos: true, hp: N.speakerHp, height: 1.2, color: '#26222b',
    yawAware: true, targetable: true,
    desc: 'The bass comes out of these: while one stands, DJ Turnip can drop the bass. Destructible (' + N.speakerHp + ' HP): any single-target damage skill can break it.',
    autoplay: speakerValue,
    onDestroyed: function () {
      stat('speakers');
      if (quiet()) return;
      const s = S(), dj = s && s.units.filter(function (u) { return u.defId === TURNIP && active(u); })[0];
      A().log(speakersStanding(s) ? 'A Speaker Stack goes down in a shower of sparks. The other one is still thumping.' :
        'The last Speaker Stack goes down. The beat stops. DJ Turnip looks personally betrayed.', 'hero');
      if (dj) say(dj, speakersStanding(s) ? LINE.speakerOne : LINE.speakerLast);
    },
    draw: drawSpeaker });

  // ---- hay: bales (cover that burns), mounds and the Snoring Lump ----
  function drawBale(g, obj) {
    g.ellipse(0, 2, 15, 7, 'rgba(0,0,0,0.28)');
    g.cylinder(0, 0, 12, 6, 18, '#c99b3a', '#e2bf63', true);
    g.ellipse(0, -18, 8, 4, null, 'rgba(140,100,30,0.6)');
    g.ellipse(0, -18, 4, 2, null, 'rgba(140,100,30,0.5)');
    g.line(-12, -6, 12, -6, '#7a4a1e', 1.2);
    g.line(-12, -12, 12, -12, '#7a4a1e', 1.2);
    if (obj && obj.hp < obj.maxHp) g.line(-4, -14, 3, -4, 'rgba(60,30,10,0.7)', 1);
  }
  DD.registerObject({ id: OBJ.bale, name: 'Hay Bale', blocksMove: true, blocksLos: true, hp: N.baleHp, height: 0.8, color: '#c99b3a', targetable: true,
    desc: 'Blocks movement and line of sight. Destructible (' + N.baleHp + ' HP): any single-target damage skill can break it; fire burns it away and leaves its ' +
      'tile on fire for 2 rounds.',
    react: { fire: { destroy: true } },
    autoplay: 0,
    onDestroyed: function (o, tile) { if (tile) A().setSurface(tile.x, tile.y, 'fire', 2); },
    draw: drawBale });
  /** A filled (and outlined) path on the world painter, which has no g.path. */
  function heap(g, top, fill) {
    const c = g.ctx;
    c.beginPath(); c.moveTo(-24, 2); c.quadraticCurveTo(-18, top + 2, 0, top); c.quadraticCurveTo(18, top + 2, 24, 2); c.closePath();
    c.fillStyle = fill; c.fill();
    c.strokeStyle = g.outline; c.lineWidth = g.lw; c.lineJoin = 'round'; c.stroke();
  }
  function drawMound(g) {
    g.ellipse(0, 2, 26, 11, 'rgba(0,0,0,0.25)');
    heap(g, -28, '#c9a043');
    [[-14, -6, -18, -14], [-4, -18, -8, -26], [6, -12, 10, -22], [16, -4, 21, -10]].forEach(function (l) { g.line(l[0], l[1], l[2], l[3], '#e8c96a', 1.1); });
  }
  DD.registerObject({ id: OBJ.mound, name: 'Hay Mound', blocksMove: true, blocksLos: true, hp: 0, height: 0.9, color: '#c9a043', targetable: false,
    desc: 'A mountain of hay. Something in the corner is snoring.', draw: drawMound });
  function drawLump(g) {
    const t = g.t || 0, b = Math.sin(t * 1.3) * 1.4;
    g.ellipse(0, 2, 28, 12, 'rgba(0,0,0,0.25)');
    heap(g, -32 - b, '#c9a043');
    g.circle(-10, -26 - b, 4.2, '#6b4426', true);                // a brown ear
    g.circle(-10, -26 - b, 2, '#c9a27a');
    g.ellipse(16, -2, 6, 3.5, '#6b4426', true);                  // a paw
    [-2, 0, 2].forEach(function (k) { g.line(16 + k * 1.6, -4, 16 + k * 1.6, -1.5, '#3a2414', 0.8); });
    [[-4, -20, -8, -28], [8, -14, 12, -24]].forEach(function (l) { g.line(l[0], l[1] - b, l[2], l[3] - b, '#e8c96a', 1.1); });
    const z = ((t * 0.6) % 1);
    g.text('Z', 6 + z * 8, -36 - z * 16, 7 + z * 4, 'rgba(255,255,255,' + (0.9 - z * 0.8).toFixed(2) + ')', { stroke: 'rgba(20,10,4,0.6)', strokeWidth: 2 });
  }
  DD.registerObject({ id: OBJ.lump, name: 'The Snoring Lump', blocksMove: true, blocksLos: true, hp: 0, height: 1, color: '#c9a043', targetable: false,
    desc: 'Something very large is hibernating under the hay. It snores in rhyme.', draw: drawLump });

  // =================================================================================================================
  // AI (each member on its own initiative entry; the diss values ride on aiScore)
  // =================================================================================================================
  function spots(unit, api) {
    const out = [{ x: unit.x, y: unit.y, cost: 0, path: [], aoo: 0, risk: 0, here: true }];
    if (A().cantMove(unit)) return out;
    api.reachable(unit).forEach(function (e) {
      const risk = DD.AI.pathRisk(unit, e);
      const aoo = api.aooCost(unit, e);
      if (risk.lethal || aoo === Infinity) return;
      out.push({ x: e.x, y: e.y, cost: e.cost || 0, path: e.path, aoo: aoo, risk: risk.penalty || 0, here: false });
    });
    return out;
  }
  function bestSpot(unit, api, value) {
    let best = null;
    const ox = unit.x, oy = unit.y;
    try {
      spots(unit, api).forEach(function (p) {
        unit.x = p.x; unit.y = p.y;
        const v = value(p);
        if (!isFinite(v)) return;
        const sc = v - p.aoo - p.risk - p.cost * 0.15 + (p.here ? 0.25 : 0);
        if (!best || sc > best.score) best = Object.assign({}, p, { score: sc });
      });
    } finally { unit.x = ox; unit.y = oy; }
    return best;
  }
  function walkTo(unit, p) {
    if (!p || p.here || (p.x === unit.x && p.y === unit.y)) return true;
    DD.AI.moveTo(unit, p.x, p.y, p.path);
    return unit.x === p.x && unit.y === p.y;
  }
  function fire(unit, api, b) {
    const def = DD.getSkill(b.skillId);
    const tu = G().unitAt(b.target.x, b.target.y);
    const aim = def && def.target && def.target.type === 'unit' && active(tu) ? tu : b.target;
    return api.act(unit, b.skillId, aim);
  }
  /** The engine's best attack among `skills` (aiScore adds the diss values): walk there, then use it. */
  function doBest(unit, api, skills, style, noMove) {
    let b = api.bestAttack(unit, { skills: skills, style: style, noMove: !!noMove });
    if (!b) return false;
    if (b.moveTo.x !== unit.x || b.moveTo.y !== unit.y) {
      DD.AI.moveTo(unit, b.moveTo.x, b.moveTo.y, b.path);
      if (incapacitated(unit)) return true;
      if (unit.x !== b.moveTo.x || unit.y !== b.moveTo.y) {
        b = api.bestAttack(unit, { skills: skills, style: style, noMove: true });
        if (!b) return true;
      }
    }
    fire(unit, api, b);
    return true;
  }
  /** Nothing in reach: walk toward the Called-Out hero (Billy ends within 3 of the Mic Stand when he can). */
  function approachMark(unit, api, style, nearStand) {
    const m = markUnit(), st = stand();
    if (!active(m) || has(unit, 'charmed') || DD.AI.activeTaunter(unit)) return api.approach(unit, style);
    const foes = api.foes(unit);
    const spot = bestSpot(unit, api, function (p) {
      let v = -dist(p, m) * 2;
      if (G().los(p, m)) v += 3;
      if (nearStand && st && dist(p, st) <= 3) v += 6;
      if (style.keepDistance > 0) foes.forEach(function (f) { const d = dist(f, p); if (d < style.keepDistance) v -= (style.keepDistance - d) * 4; });
      return v;
    });
    if (spot && !spot.here) return walkTo(unit, spot);
    return api.approach(unit, style);
  }
  function billyTurn(unit, api) {
    if (incapacitated(unit)) return;
    if (doBest(unit, api, [SK.hook, SK.gruff], MELEE)) return;
    approachMark(unit, api, MELEE, true);
  }
  /** How exposed a tile is to the hero side: foes within 2 (he keeps his distance) and foes that could see him there. */
  function exposure(p) {
    let v = 0;
    (S() ? S().units : []).forEach(function (h) {
      if (!active(h) || h.side !== 'hero') return;
      const d = dist(h, p);
      if (d <= 2) v += 3;
      if (d <= 9 && G().los(h, p)) v += 2;
    });
    return v;
  }
  /** Lil' Kid: WHAT?! needs no sight ("Can't see me? Can still HEAR me!"), so he yells from where the heroes can't see him. */
  function kidTurn(unit, api) {
    if (incapacitated(unit)) return;
    const b = api.bestAttack(unit, { skills: [SK.what, SK.kidStuff], style: KITER });
    if (b && b.skillId === SK.what && !has(unit, 'charmed') && !DD.AI.activeTaunter(unit) && !A().cantMove(unit)) {
      const tu = G().unitAt(b.target.x, b.target.y), r = DD.Targeting.range(unit, DD.getSkill(SK.what), 1);
      const spot = active(tu) ? bestSpot(unit, api, function (p) { const d = dist(p, tu); return d >= r[0] && d <= r[1] ? -exposure(p) : -Infinity; }) : null;
      if (spot) {
        walkTo(unit, spot);
        if (incapacitated(unit)) return;
        const b2 = api.bestAttack(unit, { skills: [SK.what, SK.kidStuff], style: KITER, noMove: true });
        if (b2) fire(unit, api, b2);
        return;
      }
    }
    if (doBest(unit, api, [SK.what, SK.kidStuff], KITER)) return;
    approachMark(unit, api, KITER, false);
  }
  /** Heroes and hero summons standing on the dance floor. */
  function floorHeroes(s) {
    s = s || S();
    return s ? s.units.filter(function (u) { return active(u) && u.side === 'hero' && !!colourOf(G().tile(u.x, u.y)); }).length : 0;
  }
  /** DJ Turnip: the bass (every other turn, while a Speaker Stack stands and a hero is on the floor) as his action, else Scratch That. */
  function turnipTurn(unit, api) {
    if (incapacitated(unit)) return;
    const s = S();
    const canBass = !has(unit, 'charmed') && !bassPending(s) && speakersStanding(s) > 0 && !(unit.data.bassCd > 0) && floorHeroes(s) > 0;
    if (canBass) {
      const foes = api.foes(unit);
      const spot = bestSpot(unit, api, function (p) {
        let v = onStage(p) ? 2 : 0;
        foes.forEach(function (f) { const d = dist(f, p); if (d < DJ.keepDistance) v -= (DJ.keepDistance - d) * 4; });
        return v;
      });
      if (spot) walkTo(unit, spot);
      if (incapacitated(unit)) return;
      const colour = pickColour(s), tiles = danceTiles(s, colour), st = stand(s);
      const at = st ? { x: st.x, y: st.y } : tiles[0];
      const it = api.windUp(unit, SK.bass, at, { anchor: 'ground', tiles: tiles, label: 'Turnip the Bass', noCooldown: true,
        data: { hint: 'Bass → ' + colour + ' squares', tint: FLOOR_TINT[colour] } });
      if (it) {
        unit.data.bassCd = 2;
        stat('bass');
        if (!quiet()) sayKey(unit, 'bass');
      }
      return;
    }
    if (doBest(unit, api, [SK.scratch], DJ)) return;
    approachMark(unit, api, DJ, false);
  }
  function ursaTurn(unit, api) {
    if (incapacitated(unit)) return;
    // his first turn, when it comes before some hero had a turn since he walked in: a mic check (FIGHTS-09)
    if (has(unit, ST.check)) {
      if (!quiet()) { DD.FX.text(unit, '🎤 Mic check…', { color: C.gold, size: 14 }); say(unit, LINE.bearCheck); }
      return;
    }
    if (doBest(unit, api, [SK.block, SK.words], MELEE)) return;
    approachMark(unit, api, MELEE, false);
  }

  // =================================================================================================================
  // The crew's own hooks (every member): the punchline, Headliner, the squad fall rule, the DJ's cooldown
  // =================================================================================================================
  /** The flat a crew member adds to a hit: +3 when the diss finishes another member's bar; Billy's Headliner +2. */
  function crewFlat(att, target, skill) {
    let f = wouldFinish(att, target, skill) ? N.punch : 0;
    if (att && att.defId === BILLY && target && nextToStand(target)) f += N.micGuard;
    return f;
  }
  function crewHooks(extra) {
    const base = {
      modifyOutgoingDamage: function (d) {
        if (d.cause !== 'skill' || !d.source || !d.target) return;
        d.flat += crewFlat(d.source, d.target, d.skill);
      },
      estimateDealt: function (e) { if (e && e.attacker && e.target) e.flat += crewFlat(e.attacker, e.target, e.skill); },
      // squad rules (plan §3.0.1): a fall never kills a member; he takes 25% of his max HP and climbs out
      preventDeath: function (unit, d) {
        if (!d || d.cause !== 'fall') return undefined;
        const before = Math.max(0, unit.hp || 0) + (Number(d.dealt) || 0);
        unit.hp = Math.max(1, (before > 0 ? before : unit.maxHp) - Math.ceil(unit.maxHp * 0.25));
        return true;
      },
    };
    return Object.assign(base, extra || {});
  }

  // =================================================================================================================
  // Voice: per-hero couplets, closers, comebacks (registered as narration so the lints cover them); barks
  // =================================================================================================================
  // couplets "setup|punchline": the starter barks the setup, the finisher the punchline (addendum §17.2, verbatim)
  const DISS = {
    zarathor: ['Zarathor sold his soul for unlimited bling,|still waiting on \'unlimited\'. Still waiting on the ring.',
      'Zarathor throws money at problems, that\'s the plan,|we eat paper, buddy. Thanks for lunch, big man.',
      'Zarathor\'s chains got more weight than his rhymes,|he doesn\'t walk on stage, he just jingles. Every time.',
      'Wild magic, Zarathor? You never know what you\'ll get,|neither do we. That\'s the best thing you\'ve done yet.'],
    syllamin: ['Syllamin\'s four inches of glitter and spite,|we\'d diss you to your face, but you\'re out of our sight.',
      'Roastmaster General Syllamin? General of what?|A thimble? We\'ve seen bigger flies on a mutt.',
      'Syllamin plays the lute at a rap battle? Bold.|Strum it, small fry. We\'ll eat the strings when the song gets old.',
      'Your Mom Joke, Syllamin? That\'s your opening line?|Our moms are goats. They ate the joke. They\'re fine.'],
    marbles: ['Professor Marbles, do you know what day it is?|Don\'t strain yourself, gramps. You\'ll forget the quiz.',
      'Marbles lost his marbles, now he\'s lost in this rhyme,|we\'d help him find them, but we ate them. Every time.',
      'Old rabbit Marbles, grandmaster of the fist,|forgot this verse already. We\'ll send him a list.',
      'Marbles hops two ledges, then forgets why he came,|we wrote you a whole verse. You won\'t remember the name.'],
    marwyn: ['Marwyn talks about Marwyn like Marwyn\'s a show,|and Marwyn\'s the only fan in the Marwyn front row!',
      'Seven feet of Marwyn, every inch of it loud,|louder than our speakers, smaller than the crowd.',
      'Marwyn bottles up his MAGNIFICENCE inside,|that\'s not wild magic leaking, big man. That\'s pride.',
      'Big ginger beard, Marwyn, you could lose a goat in it,|we checked. There\'s a goat in it. Gary, you can quit.'],
    ellaria: ['Ellaria brought corgis to a rap battle. Cute.|Short legs, short bars. Even the dogs are on mute.',
      'Ellaria\'s Absolute Unit is a corgi, extra large,|still a loaf, ma\'am. A bigger loaf. We\'re still in charge.',
      'Ellaria says corgis fix everything they touch,|they fixed our snack table. Ate it. Thanks so much.',
      'Elf druid Ellaria, one with the trees,|we\'re one with the trees too. We eat the bark and the leaves.'],
    josiah: ['Josiah\'s a doctor? Show us the license, doc.|The raven\'s got the brains. You\'ve got a beak and a smock.',
      'Josiah\'s coat is full of vials with no labels,|we asked what\'s in them. He said \'medicine.\' Fables.',
      'Josiah\'s cures are worse than the disease,|get a second opinion. Ask the bird. Pretty please.',
      'Josiah\'s potions taste like a swamp in a can,|we\'re goats, so we\'ll drink it. Worst doctor in the land.'],
    sparrow: ['Sparrow pays for every spell with her own blood,|\'it\'s not a phase,\' she says. That\'s what phases say, bud.',
      'Sparrow wears eyeliner, spikes and a frown,|we\'ve got horns, kid. Edgiest herd in town.',
      'Sparrow pays in blood like she\'s too cool for coin,|we take gold, Sparrow. Bleeding\'s not how you join.',
      'Sparrow made an Evil Twin to back up her verse,|now there\'s two of her, and the second one\'s worse!'],
    corelos: ['Corelos signs any contract slid across the table,|so sign this diss, Corelos. Initial here. It\'s fatal.',
      'Corelos paints his runes where he thinks we\'ll walk,|we\'re goats, man. We climb. Your floor plan\'s just chalk.',
      'Corelos buys his power on credit, signs in red,|the dead pay your tab? Then pay us. We\'re not dead.',
      'Corelos signs anything you put in his hand,|so sign this one: \'I lost to a goat band.\''],
    slate: ['Slate shushed a library for nine hundred years,|so this barn\'s his nightmare. LOUD bars. Cheers.',
      'Slate gets angry when you touch him, even heals,|we\'re not touching you, rock. Just dissing. How\'s it feel?',
      'Slate\'s runes glow whenever he gets mad,|they\'ve glowed all night. Best review we\'ve ever had.',
      'Slate yells \'get off my lawn\' at the whole crowd,|we\'re goats, Slate. Lawns are lunch. We\'re allowed.'],
    buga: ['Mayor Buga\'s a toast who ran on one promise:|\'more gold for Mayor Buga.\' At least the bread was honest.',
      'Buga never fights, he just points and takes the credit,|you\'re breakfast, Mayor. Butter side down. We said it.',
      'Mayor Buga\'s lightly buttered and he runs a town,|we\'re goats, pal. We eat bread. Mayor, sit down.',
      'Buga\'s crust is golden, but his promises are stale,|sourdough politics: every vote\'s for sale!'],
    kiri: ['Kiri\'s half-elf, half-there, and half-asleep,|so which half is the elf one? ...Too deep?',
      'Kiri steps through stone like it isn\'t even there,|she\'ll step right out of this verse. Fine. We don\'t care.',
      'Kiri vanishes mid-conversation, every time,|so she won\'t even hear the punchline. Shame. Good line.',
      'Kiri shoots through walls \'cause she can\'t aim straight,|phases through the door and still shows up late!'],
    betty: ['Betty calls himself the G.O.A.T. Respect. We\'re goats too,|three of us, kid. Not one of us named Betty. Ooh.',
      'Betty eats crates and loot and the DM\'s notes,|we eat records, kid. Who\'s the real goat? Cast your votes.',
      'Betty calls everybody \'kid\' like he\'s old and wise,|we ARE kids, Betty. One of us is named Kid. Surprise!',
      'Grandpa got past a troll on a bridge, Betty. True story.|\'Nobody gets past Betty\'? We just did. Sorry.'],
    basanos: ['Basanos hunts monsters, but he\'s one too,|who\'s a good boy? Not you. ...Okay, maybe you.',
      'Basanos says sorry every time he swings that sword,|then he howls at the moon. Make up your mind, my lord.',
      'Basanos turns into a wolf when things get rough,|we\'re goats. We\'ve seen wolves. You\'re not scary enough.',
      'Half a man, half a wolf, Basanos, all apology,|you howl at the moon, and the moon says \'not me\'.'],
    valdris: ['Valdris forges armour in the middle of a fight,|but the thing he polishes most is that hair. Nice and tight.',
      'Valdris strikes while the iron\'s hot, he swears,|then checks his hair in the hammer, between prayers.',
      'Valdris hammers dents out while you\'re still inside,|that\'s not healing, pal. That\'s a blacksmith joyride.',
      'Valdris: a hammer in one hand, a hairbrush in the other,|he tempers the steel, then moisturises. Brother.'],
    hjalmar: ['Hjalmar leaves banana peels all over the floor,|we\'ve got hooves, monkey. And we ate them. Got more?',
      'Hjalmar steals hats and gold and dignity too,|can\'t steal ours, monkey. We\'re goats. Joke\'s on you.',
      'Hjalmar never says sorry, and he means it, he\'s proud,|we never say sorry either. We just say it LOUD.',
      'Hjalmar laughs at his own jokes, every one,|somebody has to, Hjalmar. The rest of us are done.'],
    pebbles: ['Pebbles fetched a stick and brought us back a torch,|we said fetch the beat, boy. Not set fire to the porch.',
      'Pebbles is a fire dog, a very good boy,|keep that tail off the hay bales, boy. This barn\'s our joy.',
      'Pebbles loves everyone, even goats on the mic,|that\'s the problem, boy. You can\'t diss what you like.',
      'Who\'s a good boy? Pebbles, we\'ve got to be real,|you are. You ARE. ...Dang it. Can\'t diss him. Next deal.'],
    benedick: ['Benedick the snail showed up to battle. Finally.|We dropped this track in the spring. He made the remix. Technically.',
      'Benedick turns into a dragonsnail, so he says,|a dragon with a shell? That\'s a snail going through a phase.',
      'Benedick leaves a trail of slime across the stage,|that\'s not a flow, man. That\'s a mop. Turn the page.',
      'Slow flow, Benedick, slime all over the floor,|we brought salt to the cypher. You want some more?'],
    generic: ['{hero}, step up. You got a verse? ...No?|Then sit back down, pal. This barn\'s not your show.',
      'We heard about {hero}. We were not impressed.|Four acts in, and still dressed like the rest.',
      '{hero} came to the barn to battle the crew,|we\'d write you a diss, but the hay\'s more fun to chew.',
      'You rolled for initiative, we rolled for the beat,|you got a two, we got a twenty, and the twenty\'s on repeat.',
      'Nice armour, {hero}, bet it came with a quest,|we\'re goats. We\'ll eat the quest. And the armour. And the rest.',
      'You brought a character sheet, we brought a rhyme book,|your sheet\'s got a backstory. Our bars got a hook.',
      'Came under the table looking for some glory,|found three goats and a very short story.',
      'Look who came under the table, standing all proud,|quietest thing in this barn, and the barn is LOUD!'],
  };
  // closers: the line Bar None lands with (§17.3)
  const CLOSE = {
    zarathor: ['All that bling, Zarathor, and still can\'t buy a crit!', 'Rich in sequins, broke in bars. Next!'],
    syllamin: ['Cute lute, Syllamin. Shame it\'s louder than your bars!', 'Only bard in the barn who needs a booster seat to boo!'],
    marbles: ['He lost his Marbles! Now he\'s just Professor!', 'Remember us, Marbles? No? Don\'t worry. We\'ll remind you. LOUDLY.'],
    marwyn: ['Marwyn THE MAGNIFI-CAN\'T!', 'You\'re not magnificent, Marwyn. You\'re just LOUD!'],
    ellaria: ['Ellaria\'s best verse is a corgi going \'boof\'!', 'We\'d diss her more, but the corgis are too cute!'],
    josiah: ['Even Josiah\'s bird wants a second opinion!', 'That\'s not a doctor. That\'s a beak with a clipboard!'],
    sparrow: ['That\'s not blood magic, Sparrow. That\'s a paper cut!', 'Juice Box? Sparrow, you ARE the juice box!'],
    corelos: ['Corelos, your bars are like your deals: all fine print!', 'We\'d diss Corelos more, but he\'d just sign for it!'],
    slate: ['Retired? Slate, nobody HIRED you!', 'Rock bottom? Slate, you ARE rock bottom!'],
    buga: ['Buga, you\'re toast! ...That one wrote itself.', 'Vote Buga? We\'d rather vote for the crumbs!'],
    kiri: ['Which half\'s the ranger, Kiri? Neither! Both left!', 'Ghost arrows, Kiri, ghost ranger, ghost of a career!'],
    betty: ['You\'re not the G.O.A.T., Betty. You\'re the goat CHEESE!', '\'It\'s a family name\'? Betty, the family wants it back!'],
    basanos: ['Sit, Basanos! ...Not a dog? The fleas say otherwise!', 'We\'re goats, Basanos. We\'ve been chased by better dogs!'],
    valdris: ['Mind the hair? Valdris, mind the BARS!', 'Valdris is well-conditioned. His bars are not!'],
    hjalmar: ['Monkey business, Hjalmar? This is GOAT business!', 'Hjalmar, your pranks are so old, we already ate them!'],
    pebbles: ['Good boy, Pebbles! Bad idea! GOOD BOY THOUGH!', 'Sit, Pebbles! Stay! ...Stop, drop and ROLL!'],
    benedick: ['You\'re not slow, Benedick. You\'re just... loading!', 'Dragonsnail, Benedick? That\'s a slug in a party hat!'],
    generic: ['{hero}, your whole career\'s an opening act!', 'The end. Applause. Not for you, {hero}.', 'And THAT is why they call it Bar None.',
      'Three bars and a closer. That\'s a wrap, {hero}.'],
  };
  // Clap Back comebacks, barked by the clapper (§17.4)
  const BACK = {
    zarathor: ['You eat paper? Eat my receipts. All of them. Bon appetit.', 'My bars are gold-plated. Literally. I had them done.'],
    syllamin: ['Goats. GOATS. I\'ve been roasted by better cheese.', 'Stand back. The Roastmaster General has the floor.'],
    marbles: ['In my day we rhymed with our FISTS. ...What day is it?', 'I\'ve already forgotten your names. That\'s the review.'],
    marwyn: ['Marwyn DOES NOT RAP. Marwyn IS THE BEAT.', 'THE BEARD HAS HEARD ENOUGH.'],
    ellaria: ['My corgis have more rhythm than your whole barn.', 'Corgi, say something mean. ...Good boy. Devastating.'],
    josiah: ['Prescription: two bars of silence, three times a day.', 'Onyx says your flow is terminal. He\'s rarely wrong.'],
    sparrow: ['It\'s NOT a phase. Your career is a phase.', 'I bleed for my spells. You bleed for nothing. Lame.'],
    corelos: ['Sign here, here and here. You just agreed to lose.', 'Read the fine print, goat. It says \'you\'re done\'.'],
    slate: ['Shh.', 'Hmph. Get off my stage.'],
    buga: ['Vote Buga! The goats are hereby banned from winning.', 'As your mayor, I ban this verse. Gold, please.'],
    kiri: ['Elf one or human one? The one that\'s leaving.', 'I\'m half-there. Lucky me. I only heard half of that.'],
    betty: ['Kid. KID. There\'s only one G.O.A.T. in this barn.', 'It\'s a family name, kid. Say it right or eat hay.'],
    basanos: ['Sorry. Sorry! ...No. Actually, not sorry. AWOO.', 'Sorry in advance. *growl* That was the advance.'],
    valdris: ['Mind the hair. Unlike your verse, it has volume.', 'I\'ve forged better bars than that. Iron ones.'],
    hjalmar: ['I put a whoopee cushion on your mic. You\'re welcome.', 'Hee hee hee! HAHAHA! ...What was the diss again?'],
    pebbles: ['Bork! BORK! ...Bork. (He says your bars are stale.)', 'Pebbles has a verse! The verse is \'good boy\'! BORK!'],
    benedick: ['Fourteen thousand teeth, gentlemen. Fourteen thousand.', 'Patience, goats. I always get there. And I get the last word.'],
    generic: ['Yeah? Well... your mic\'s off.', 'That\'s it? That\'s the verse?', 'I\'ve heard better from a chicken. A shy chicken.'],
  };
  Object.keys(DISS).forEach(function (k) { DD.registerNarration('rap_diss_' + k, DISS[k]); });
  Object.keys(CLOSE).forEach(function (k) { DD.registerNarration('rap_close_' + k, CLOSE[k]); });
  Object.keys(BACK).forEach(function (k) { DD.registerNarration('rap_back_' + k, BACK[k]); });
  // fight keys (content bubbles; §17.5)
  const FIGHT = {
    rap_hang: ['...and, uh... ...Yeah.', '...rhymes with... hold on. HOLD ON.', '...somebody finish that. ANYBODY.', '...that\'s where the bar ends. On purpose. It\'s art.'],
    rap_windup: ['Last bar coming. Hold my chain.', 'This next one\'s a classic. You\'re in it.', 'Mic\'s hot. Somebody\'s about to get cooked.'],
    rap_cut: ['You can\'t stop the verse! ...You stopped the verse.', 'Hey! I was in the middle of a BAR!'],
    rap_clapped: ['OHHHHHH!', 'Okay. OKAY. Respect. Still dissing you.', 'Wait, wait, rewind that.', 'Hold my hay. HOLD MY HAY.'],
    rap_bear_chant: ['BEAR! BEAR! BEAR!', 'Ladies and gentlemen... the BEAR.', 'Turn it down. He likes it quiet. Then he doesn\'t.'],
    rap_lump: ['*snore* ...rhymes with \'orange\'... *snore*', '*a deep voice, mumbling a rhyme scheme*', '*pages turning somewhere in the hay*'],
  };
  Object.keys(FIGHT).forEach(function (k) { DD.registerNarration(k, FIGHT[k]); });
  // the act-4 DM narrates demoted, whispering (§17.7)
  DD.registerNarration('goats_stir', ['The hay in the corner rolls over and mumbles something that rhymes with \'orange\'. The goats exchange a look.']);
  DD.registerNarration('goats_feat', ['The hay in the corner sits up. It is a bear in a beret, holding a notebook the size of a door. The goats bow.']);
  DD.registerNarration('goats_death', [
    'The beat stops. The hay settles. Somewhere a needle skips on a record nobody will ever finish. The barn is quiet.',
    'Herd Mentality drop their mics. The bear closes his notebook. Their last verse lies on the floor. It rhymes \'hero\' with \'zero\'.',
  ]);
  DD.registerNarration('goats_tip', [
    'DM (whispering): "A bar takes two goats. Shut one up between the start and the finish."',
    'DM (whispering): "Grab the mic stand and the verse turns on you. Let the sturdy one take the heat."',
  ]);

  // =================================================================================================================
  // Art: the goats on Betty's overlay pattern (charcoal fur, never Betty's brown and white), the bear lyricist
  // =================================================================================================================
  function holdsMic(g, gallery) {
    const u = g.unit;
    if (!u) return !!gallery;
    return (u.statuses || []).some(function (s) { return s && s.id === ST.mic; });
  }
  /** A gold mic with a short cord at the mouth (on the bear: a honey-jar mic). */
  function drawGoldenMic(g, honey) {
    const H = g.head;
    if (!H) return;
    const r = H.r, x = H.x + r * 0.95, y = H.y + r * 0.75;
    g.line(x, y, x - r * 0.25, y + r * 0.85, '#1a1014', 2.4);
    g.line(x, y, x - r * 0.25, y + r * 0.85, honey ? '#b07a2a' : '#d4af37', 1.4);
    if (honey) {
      g.rect(x - 2.6, y - 4.2, 5.2, 5, '#e8a33a', g.outline, 1.2);
      g.rect(x - 2.9, y - 5.2, 5.8, 1.6, '#7a4a1e', null, 0.6);
    } else {
      g.circle(x, y - 1.2, 2.6, '#f2d16b', g.outline);
      g.line(x - 1.6, y - 1.6, x + 1.6, y - 1.6, 'rgba(120,90,20,0.8)', 0.5);
    }
    g.glow(x, y - 1, 7, '#ffd23f', 0.35);
  }
  /** The goat details on top of the humanoid: muzzle, nostrils, goatee tuft, horizontal pupils (unless shaded), hooves. */
  function goatFace(g, t, o, shades) {
    const H = g.head;
    if (!H) return;
    const r = H.r, pal = g.pal, lying = o && o.lying > 0.5;
    const walk = o && typeof o.walk === 'number' ? Math.sin(o.walk * Math.PI * 2) : 0;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1, sw = side * walk, x = side * 3.6 + sw * 1.3, lift = Math.max(0, sw) * 1.4;
      g.line(x + 2.2, -2.9 - lift, x + 2.2, -0.3 - lift, '#08060a', 0.7);
    }
    const fx = r * 0.24, mx = H.x + fx + r * 0.06, my = H.y + r * 0.5;
    g.ellipse(mx, my, r * 0.44, r * 0.3, C.muzzle, null);
    g.ellipse(mx - r * 0.13, my - r * 0.1, r * 0.07, r * 0.05, '#120f14', null);
    g.ellipse(mx + r * 0.13, my - r * 0.1, r * 0.07, r * 0.05, '#120f14', null);
    if (!lying && (g.pose === 'attack' || g.pose === 'hurt' || g.pose === 'cast')) g.ellipse(mx, my + r * 0.12, r * 0.13, r * 0.11, '#3a0f17', null);
    else g.arc(mx, my + r * 0.02, r * 0.14, 0.2 * Math.PI, 0.8 * Math.PI, '#120f14', Math.max(0.7, r * 0.07));
    g.path(function (c) {
      c.moveTo(mx - r * 0.2, my + r * 0.24);
      c.quadraticCurveTo(mx - r * 0.2, my + r * 0.62, mx + r * 0.02, my + r * 0.8);
      c.quadraticCurveTo(mx + r * 0.16, my + r * 0.55, mx + r * 0.2, my + r * 0.24);
      c.closePath();
    }, '#4a4452', g.outline, g.lw * 0.7);
    if (shades || lying || g.blink || g.pose === 'hurt') return;
    const ey = H.y + r * 0.1, d = r * 0.36;
    [[-1, 0.9], [1, 1]].forEach(function (e) {
      const k = e[1], ex = H.x + fx + e[0] * d, rx = r * 0.155 * k, ry = r * 0.215 * k;
      g.ellipse(ex + rx * 0.15, ey + ry * 0.05, rx * 0.75, ry * 0.7, pal.eye, null);
      g.rect(ex - rx * 0.45, ey - ry * 0.08, rx * 1.2, ry * 0.3, '#1a1014', null, ry * 0.12);
      g.circle(ex + rx * 0.3, ey - ry * 0.4, Math.max(0.45, rx * 0.36), '#ffffff', null);
    });
  }
  function notes(g, t, k) {
    const H = g.head;
    if (!H) return;
    const a = (t * 0.8 + k) % 1;
    g.note(H.x - H.r * 1.2, H.y - H.r * 1.2 - a * 8, 2.4, 'rgba(255,63,180,' + (1 - a).toFixed(2) + ')');
    g.note(H.x + H.r * 1.1, H.y - H.r * 0.9 - ((a + 0.5) % 1) * 8, 2, 'rgba(217,180,74,' + (1 - ((a + 0.5) % 1)).toFixed(2) + ')');
  }
  function billyOverlay(g, t, o) {
    const H = g.head;
    if (!H) return;
    const r = H.r;
    goatFace(g, t, o, true);
    // round sunglasses indoors (gold rims: dark lenses vanish on charcoal fur)
    if (!(o && o.lying > 0.5)) {
      const ey = H.y + r * 0.1, ex0 = H.x + r * 0.24;
      g.line(ex0 - r * 0.2, ey, ex0 + r * 0.2, ey, '#d4af37', Math.max(0.6, r * 0.06));
      [-1, 1].forEach(function (s) {
        g.circle(ex0 + s * r * 0.36, ey, r * 0.2, '#0d0b10', '#d4af37');
        g.circle(ex0 + s * r * 0.36 - r * 0.07, ey - r * 0.07, Math.max(0.4, r * 0.05), 'rgba(255,255,255,0.75)', null);
      });
    }
    // gold horn rings (barnyard bling)
    [-1, 1].forEach(function (s) { g.ellipse(H.x + s * r * 0.82, H.y - r * 0.48, r * 0.16, r * 0.24, '#d4af37', g.outline, 0.3 * s); });
    // a red neckerchief under the goatee
    const ny = H.y + r * 0.95;
    g.poly([[H.x - r * 0.7, ny], [H.x + r * 0.7, ny], [H.x + r * 0.05, ny + r * 0.75]], '#b8262a', g.outline);
    // the cowbell on a chain
    g.line(H.x - r * 0.55, ny + 0.6, H.x - r * 0.05, ny + r * 1.25, '#d4af37', 1.2);
    g.line(H.x + r * 0.55, ny + 0.6, H.x + r * 0.05, ny + r * 1.25, '#d4af37', 1.2);
    const by = ny + r * 1.3, sw = Math.sin(t * 3) * 0.6;
    g.poly([[H.x - r * 0.24 + sw, by], [H.x + r * 0.24 + sw, by], [H.x + r * 0.34 + sw, by + r * 0.5], [H.x - r * 0.34 + sw, by + r * 0.5]], '#c9a227', g.outline);
    g.circle(H.x + sw, by + r * 0.55, r * 0.08, '#3a2a10', null);
    if (holdsMic(g, true)) drawGoldenMic(g, false);
  }
  function kidOverlay(g, t, o) {
    const H = g.head;
    if (!H) return;
    const r = H.r;
    // tiny horn nubs
    [-1, 1].forEach(function (s) { g.poly([[H.x + s * r * 0.32, H.y - r * 0.82], [H.x + s * r * 0.5, H.y - r * 1.28], [H.x + s * r * 0.62, H.y - r * 0.74]], '#c9b48a', g.outline); });
    goatFace(g, t, o, false);
    // a magenta sweatband
    g.rect(H.x - r * 0.95, H.y - r * 0.62, r * 1.9, r * 0.26, C.pink, g.outline, r * 0.1);
    // a feed-funnel megaphone at the front hand, a "#1" foam finger at the back one
    const f = g.hands && g.hands.front, b = g.hands && g.hands.back;
    if (f) g.poly([[f.x, f.y - 1.4], [f.x + 7, f.y - 4.2], [f.x + 7, f.y + 2.8], [f.x, f.y + 1.4]], '#9aa3ad', g.outline);
    if (b) {
      g.rect(b.x - 3, b.y - 10, 6, 8, C.gold, g.outline, 1.4);
      g.text('#1', b.x, b.y - 6, 3.4, '#5a1030', null);
    }
    const R = RD();
    if (g.unit && R && R.open) notes(g, t, 0);
    if (holdsMic(g, false)) drawGoldenMic(g, false);
  }
  function turnipOverlay(g, t, o) {
    const H = g.head;
    if (!H) return;
    const r = H.r;
    goatFace(g, t, o, false);
    // a half-eaten record in his mouth
    const mx = H.x + r * 0.62, my = H.y + r * 0.62;
    g.circle(mx, my, r * 0.34, '#1e1b22', g.outline);
    g.circle(mx, my, r * 0.11, '#b48ad6', null);
    g.circle(mx + r * 0.3, my - r * 0.18, r * 0.12, g.pal.skin, null);
    // headphones: a band over the head, turnip-shaped ear cups with leafy tufts
    g.arc(H.x, H.y - r * 0.1, r * 1.02, Math.PI * 1.08, Math.PI * 1.92, '#2e2a33', 1.8);
    [-1, 1].forEach(function (s) {
      const cx = H.x + s * r * 0.98, cy = H.y + r * 0.05;
      g.ellipse(cx, cy, r * 0.3, r * 0.36, '#f2ecf6', g.outline);
      g.ellipse(cx, cy + r * 0.1, r * 0.3, r * 0.22, '#9a5ac8', null);
      g.line(cx, cy - r * 0.34, cx - r * 0.12, cy - r * 0.62, '#4f9a3c', 1.1);
      g.line(cx, cy - r * 0.34, cx + r * 0.14, cy - r * 0.6, '#6fbf5a', 1.1);
    });
    // a turntable at the waist
    g.rect(-6.5, -9.5, 13, 3.4, '#2e2a33', g.outline, 0.8);
    g.ellipse(-1.5, -10.2, 4, 1.4, '#1e1b22', null);
    g.circle(-1.5, -10.2, 0.8, C.gold, null);
    if (g.unit && bassPending()) notes(g, t, 0.3);
  }
  function ursaOverlay(g, t, o) {
    const H = g.head;
    if (!H) return;
    const r = H.r, lying = o && o.lying > 0.5;
    // a bear muzzle and nose
    const mx = H.x + r * 0.3, my = H.y + r * 0.42;
    g.ellipse(mx, my, r * 0.42, r * 0.3, '#c9a27a', null);
    g.ellipse(mx + r * 0.05, my - r * 0.12, r * 0.15, r * 0.1, '#1a1014', null);
    if (!lying) g.arc(mx + r * 0.02, my + r * 0.04, r * 0.12, 0.2 * Math.PI, 0.8 * Math.PI, '#3a2414', Math.max(0.7, r * 0.07));
    // a quill behind one ear
    g.line(H.x - r * 0.7, H.y - r * 0.5, H.x - r * 1.25, H.y - r * 1.35, '#f4ecdc', 1.6);
    g.line(H.x - r * 0.9, H.y - r * 0.8, H.x - r * 1.15, H.y - r * 1.1, '#cfc4ae', 0.7);
    // the notebook says RHYMES
    const f = g.hands && g.hands.front;
    if (f) g.text('RHYMES', f.x + 1, f.y - 5, 2.6, '#f4ecdc', null);
    if (holdsMic(g, false)) drawGoldenMic(g, true);
  }
  function goatPalette(extra) {
    return Object.assign({ skin: C.fur, ear: C.fur, inner: C.muzzle, horn: '#c9b48a', hair: C.fur, beard: '#4a4452', eye: C.eye, pants: '#3a3440',
      boots: C.hoof, tail: C.fur, outline: '#120f14', metal: '#d4af37', accent: C.pink, leather: '#4a3424', belt: '#3a2a1a' }, extra || {});
  }
  const SPRITES = {
    rap_billy: { base: 'humanoid', scale: 1.25, build: 'stocky', outfit: 'coat',
      palette: goatPalette({ cloth: '#3d4a5c', cloth2: C.gold }),
      head: { size: 1.02, ears: 'goblin', horns: 'ram', face: 'sunglasses', eyes: 'normal', mouth: 'none', blush: false },
      tail: 'dog', extras: ['belt'], overlay: billyOverlay },
    rap_kid: { base: 'humanoid', scale: 0.85, build: 'slim', outfit: 'tunic',
      palette: goatPalette({ cloth: C.pink, cloth2: C.gold }),
      head: { size: 1.08, ears: 'goblin', horns: 'none', eyes: 'big', mouth: 'none', blush: false },
      tail: 'dog', overlay: kidOverlay },
    rap_turnip: { base: 'humanoid', scale: 1, build: 'normal', outfit: 'tunic',
      palette: goatPalette({ cloth: '#6a4c93', cloth2: C.gold }),
      head: { size: 1, ears: 'goblin', horns: 'ram', eyes: 'sleepy', mouth: 'none', blush: false },
      tail: 'dog', overlay: turnipOverlay },
    rap_ursa: { base: 'humanoid', scale: 1.7, build: 'huge', outfit: 'coat',
      palette: { skin: '#6b4426', ear: '#6b4426', inner: '#c9a27a', hair: '#6b4426', cloth: '#2b2d42', cloth2: C.gold, hat: '#26222b', eye: '#2b1a10',
        pants: '#2b2d42', boots: '#3a2414', metal: '#c9b037', accent: C.gold, book: '#7a2418', outline: '#140c08' },
      head: { size: 1.05, ears: 'bear', hat: 'beret', face: 'glasses', eyes: 'normal', mouth: 'none', blush: false },
      mainhand: 'book', extras: ['scarf'], bounds: { l: -44, r: 44, t: -68, b: 16 }, portrait: { x: 2, y: -34, r: 15 }, overlay: ursaOverlay },
  };

  // =================================================================================================================
  // Enemies (tier elite, own initiative entries, NO boss field: squad rules)
  // =================================================================================================================
  const FALL = 'A fall never kills him: he takes 25% of his max HP and climbs out.';
  DD.registerEnemy({ id: BILLY, name: 'Billy Bleatz', act: 4, tier: 'elite', pronoun: 'he', hp: N.billy, mov: 4, armor: 1, init: 0,
    tags: [TAG, 'goat', 'mc'], flags: {}, resist: {}, sprite: SPRITES.rap_billy,
    skills: [SK.hook, SK.gruff], ai: billyTurn, aiStyle: MELEE, xp: 6, gold: [3, 6],
    passive: { name: 'Headliner', icon: '🎙️', desc: function (u) {
      const Lh = liveLvl(SK.hook, u), Lg = liveLvl(SK.gruff, u);
      return 'Holds the Golden Mic until Ursa Verse shows up, and gets it back if the bear falls. Guards the Mic Stand: +' + N.micGuard + ' damage to a ' +
        'foe standing next to it. On his turn: Gruff Talk (' + Lg.dmg + ', a diss) at the Called-Out hero when it builds the verse, else Catchy Hook (' +
        Lh.dmg + ' and a knockback of ' + Lh.kb + ') on a hero next to him. Walk away from him and the hook swings (attack of opportunity). ' + FALL;
    } },
    hooks: crewHooks(),
    barks: {
      spawn: ['Mic check. One, two. One, two. ...Three goats.', 'Billy Bleatz in the barn! Somebody hold my chain.', 'Grandpa got past a troll. You\'re not even a troll.'],
      attack: ['Horns up!', 'That\'s the hook. It\'s catchy. You\'re caught.', 'Off my stage!', 'Step to the mic, step to the horns.'],
      hurt: ['Watch the chain!', 'Off the beat, but okay.', 'That\'s a heckle. I\'ll allow it.'],
      death: ['Tell the crowd... I was... the headliner...', 'Mic... check... one... ...two...'],
      named: ['Betty! Don\'t call me kid, kid.', 'Syllamin! Finally, an MC! ...A small one.', 'Marwyn, you\'re loud. Good. Get louder. Lose louder.'],
      last: ['Just me? Fine. Solo album.'],
      tribute_kid: ['Lil\' Kid! Who goes WHAT now?! ...What?'],
      tribute_turnip: ['DJ Turnip! Who\'s going to spin?! ...Put on the radio.'],
      tribute_ursa: ['The bear\'s down! Somebody get that bear some honey!'],
    },
    desc: 'The MC of Herd Mentality. Holds the Golden Mic and won\'t let go. Real name William. Do not call him William.' });

  DD.registerEnemy({ id: KID, name: 'Lil\' Kid', act: 4, tier: 'elite', pronoun: 'he', hp: N.kid, mov: 5, armor: 0, init: 3,
    tags: [TAG, 'goat', 'hype'], flags: {}, resist: {}, sprite: SPRITES.rap_kid,
    skills: [SK.what, SK.kidStuff], ai: kidTurn, aiStyle: KITER, xp: 6, gold: [3, 6],
    passive: { name: 'Ad-Lib Kid', icon: '📣', desc: function (u) {
      const Lw = liveLvl(SK.what, u), Lk = liveLvl(SK.kidStuff, u);
      return 'His WHAT?! needs no line of sight: hiding from him doesn\'t work. Takes the Golden Mic only when Billy Bleatz and the bear are gone. ' +
        'On his turn: WHAT?! (' + Lw.dmg + ', a diss, within ' + Lw.r + ') at the Called-Out hero when it builds the verse, else Kid Stuff (' + Lk.dmg +
        ') on a hero next to him, else WHAT?! at the weakest hero in reach. He keeps 2 tiles from the heroes. ' + FALL;
    } },
    hooks: crewHooks(),
    barks: {
      spawn: ['WHAT! WHAT! ...What are we doing? WHAT!', 'Lil\' Kid in the house! The barn! The house barn!', 'Hype goat reporting for hype!'],
      attack: ['WHAT?!', 'Say it LOUDER! I\'LL say it louder!', 'Can\'t see me? Can still HEAR me!', 'Kid stuff!'],
      hurt: ['Ow! OW! ...Yeah! No. Ow.', 'That\'s not hype! That\'s the opposite of hype!', 'I\'m telling Billy!'],
      death: ['Was that... a good verse...? WHAT...?', 'Hype... goat... down...'],
      named: ['Betty knows who I am? BETTY KNOWS WHO I AM!', 'Hjalmar! A menace! I love him! I mean: BOO!', 'Pebbles! Good boy! WHO\'S A GOOD BOY! ...Wrong crowd.'],
      echo: ['WHAT!', 'OHHH!', 'SAID IT!', 'BAAA!'],
      last: ['Last one left?! ...Is it too late to go to school?'],
      tribute_billy: ['BILLY! Who holds the mic now?! ...Me? ME?!'],
      tribute_turnip: ['Turnip went down! The beat went down! EVERYTHING went down!'],
      tribute_ursa: ['Ursa Verse. Two verses. Legend.'],
    },
    desc: 'The hype goat. Too young to rap, too loud to stop. Thinks anyone who says \'kid\' is a fan.' });

  DD.registerEnemy({ id: TURNIP, name: 'DJ Turnip', act: 4, tier: 'elite', pronoun: 'he', hp: N.turnip, mov: 4, armor: 0, init: 1,
    tags: [TAG, 'goat', 'dj'], flags: {}, resist: {}, sprite: SPRITES.rap_turnip,
    skills: [SK.scratch], ai: turnipTurn, aiStyle: DJ, xp: 6, gold: [3, 6],
    hooks: crewHooks({
      onTurnStart: function (unit) { if (unit.data.bassCd > 0) { unit.data.bassCd--; DD.Act.touch(); } },
    }),
    passive: { name: 'On the Ones and Twos', icon: '🎚️', desc: function (u) {
      const Lb = liveLvl(SK.bass, u), Ls = liveLvl(SK.scratch, u);
      return 'Every other turn, while a Speaker Stack stands and a hero is on the dance floor, he winds up Turnip the Bass (' + Lb.dmg + ') on the ' +
        'dance-floor colour with the most heroes on it. The crew dances on the beat: it never hurts them. He never takes the Golden Mic. Otherwise Scratch That (' + Ls.dmg +
        ', a diss, within ' + Ls.r + '), from the stage when he can. ' + FALL;
    } },
    barks: {
      spawn: ['Turnip the bass! TURNIP THE BASS!', 'DJ Turnip on the decks. And under the decks. Eating them.', 'Hold on, I\'m finding the beat. ...Found it. Ate it.'],
      attack: ['Scratch that.', 'Rewind! Rewind!', 'This one\'s a deep cut.'],
      bass: ['Wait for it... wait for it...', 'Bass incoming. Mind the squares!'],
      hurt: ['You scratched my record!', 'Skipping! I\'m SKIPPING!', 'Not the headphones!'],
      death: ['The needle... is off... the record...', 'Fade... out...'],
      named: ['Pebbles, stay off the hay. I\'m begging. Good boy.', 'Marwyn, you\'re louder than my bass. That\'s illegal.', 'Syllamin, nice lute. Is it on vinyl?'],
      last: ['Just the DJ? Okay. Putting on a slow one.'],
      tribute_billy: ['Billy... this next track\'s for you. It\'s the same track.'],
      tribute_kid: ['No more ad-libs. The silence is deafening. And nice.'],
    },
    desc: 'The DJ. Spins records, then eats them. Has never once finished a song.' });

  DD.registerEnemy({ id: URSA, name: 'Ursa Verse', act: 4, tier: 'elite', pronoun: 'he', hp: N.ursa, mov: 4, armor: 1, init: -1,
    tags: [TAG, 'bear', 'poet'], flags: { large: true }, resist: {}, sprite: SPRITES.rap_ursa,
    skills: [SK.block, SK.words], ai: ursaTurn, aiStyle: MELEE, xp: 6, gold: [3, 6],
    passive: { name: 'Feature Verse', icon: '📜', desc: function (u) {
      const Lb = liveLvl(SK.barNone, u, 2), Lw = liveLvl(SK.words, u), Lk = liveLvl(SK.block, u);
      return 'Woke up when the goats fell to half their combined health. Holds the Golden Mic while he stands: his Bar None deals ' + Lb.dmg + '. Big ' +
        'Words (' + Lw.dmg + ') makes a whole bar on its own. On his turn: Big Words at the Called-Out hero, else Writer\'s Block (' + Lk.dmg +
        ' and Root) on a hero next to him. Walk away from him and he swings (attack of opportunity). ' + FALL;
    } },
    hooks: crewHooks(),
    barks: {
      spawn: ['Who woke me? ...Ah. A verse needs finishing.', 'I was hibernating. Mid-sonnet. This had better rhyme.', 'Hello. I\'m a lyricist. I\'ll be brief. I won\'t be brief.'],
      attack: ['Writer\'s block! It\'s a real block!', 'Allow me to elaborate. At length.', 'Consider this a footnote.', 'Red pen!'],
      hurt: ['Rude. Also, unrhymed.', 'A critic. How original.', 'My notebook! Mind the notebook!'],
      death: ['Back to... hibernation... wake me... for the encore...', '...I never got to the bridge.'],
      named: ['Ellaria. A corgi the size of a bear. I respect commitment.', 'Benedick. A fellow poet of patience.', 'Slate. A fellow lover of quiet. Shh. I\'ll shh too.'],
      last: ['Alone again. A poet\'s natural state.'],
    },
    desc: 'The Paw-et Laureate. Hibernates in the hay, ghostwrites every verse, wears a turtleneck to a rap battle.' });

  // =================================================================================================================
  // The arena and the encounter (15 × 14; addendum §5)
  // =================================================================================================================
  const LAYOUT = [
    'MM...=====...bb',
    'MZ..S==3==S...b',
    '.....=====.....',
    '...p..gkg..p...',
    '.b...gk1kg...b.',
    '....gkgkgkg....',
    '...gkgkOkgkg2..',
    '....gkgkgkg....',
    '.b...gkgkg...b.',
    '...p..gkg..p...',
    '.....b.g.b.....',
    '...HHHHHHHHH...',
    '..HHHHHHHHHHH..',
    '...............',
  ];
  const FLOOR = 'floor';
  const LEGEND = {
    '.': { terrain: FLOOR },
    '=': { terrain: TER.stage, h: 1 },
    '3': { terrain: TER.stage, h: 2, mark: 'turnip', zone: 'enemy' },
    'S': { terrain: FLOOR, obj: { id: OBJ.speaker } },
    'M': { terrain: FLOOR, obj: { id: OBJ.mound } },
    'Z': { terrain: FLOOR, obj: { id: OBJ.lump }, mark: 'bear' },
    'b': { terrain: FLOOR, obj: { id: OBJ.bale } },
    'p': { terrain: FLOOR, obj: { id: 'pillar', label: 'Barn Post' } },
    'O': { terrain: FLOOR, obj: { id: OBJ.mic }, mark: 'mic' },
    '1': { terrain: TER.gold, tag: 'dancefloor', mark: 'billy', zone: 'enemy' },
    '2': { terrain: FLOOR, mark: 'kid', zone: 'enemy' },
    'g': { terrain: TER.gold, tag: 'dancefloor' },
    'k': { terrain: TER.pink, tag: 'dancefloor' },
    'H': { terrain: FLOOR, zone: 'hero' },
  };

  function encStart(s) {
    s.data.rap = fresh();
    const R = s.data.rap;
    const st = stand(s);
    if (st) R.stand = { x: st.x, y: st.y };
    setHolder(s, pickHolder(s));
    const billy = memberOf(BILLY, s);
    const first = heroes(s).length ? firstMark(s) : null;
    callOut(s, first, 'start');
    if (!quiet()) {
      if (billy) say(billy, LINE.micCheck);
      if (billy && first && first.defId === 'betty') say(billy, LINE.bettyFirst);
      // the group banner only when Svammiel's start cameo won't show the fight's name
      const cameo = DD.Cameo && !DD.Cameo.stub && DD.getCameo && DD.getCameo('svammiel') && s.encounter && s.encounter.cameo !== false;
      if (s.noCameo || !cameo) {
        DD.FX.banner(LINE.groupBanner, { sub: LINE.groupSub, color: C.gold });
        sound('scratch');
      }
    }
    sync(s);
  }
  function encRoundStart(s) {
    const R = RD(s);
    if (!R) return;
    if (R.bear === 'due') entrance(s);
    if (quiet()) return;
    if (!R.rolled) {
      R.rolled = true;
      [KID, TURNIP].forEach(function (id) { const m = memberOf(id, s); if (m && DD.rng.next() < 0.8) sayKey(m, 'spawn'); });
      if (!R.tipped) { R.tipped = true; A().narrate('goats_tip', {}); }
      return;
    }
    banter(s);
  }

  DD.registerEncounter({ id: ENC, act: 4, kind: 'boss', weight: 0, minDepth: 0,
    name: 'The Rapping Goats', shortName: 'The Rapping Goats', icon: '🐐',
    gauntlet: { lane: 'goats', order: 5, hint: 'A bar takes two goats: shut one up. Or take the mic.' },
    banner: false,
    cameo: { start: 'svam_cameo_goats', cheat: 'svam_cameo_radio', interjections: true },
    teaser: '🐐 The Rapping Goats — three goats, one mic, a verse about each of you. (feat. ???)',
    intro: 'A barn under the floorboards, done up as a club: hay bales, speaker stacks, a mic stand in a chalk ring. Three black goats are doing a sound check.',
    map: { theme: 'a4_barn', layout: LAYOUT, legend: LEGEND },
    enemies: [{ id: BILLY, n: 1, mark: 'billy' }, { id: KID, n: 1, mark: 'kid' }, { id: TURNIP, n: 1, mark: 'turnip' }],
    rules: [VERSE_RULE],
    objective: { type: 'boss', bossIds: [BILLY, KID, TURNIP, URSA], flavor: '🐐 Crew ' + (N.billy + N.kid + N.turnip) + '/' + (N.billy + N.kid + N.turnip) + ' · something in the hay wakes at ' + Math.floor((N.billy + N.kid + N.turnip) * N.bearAt) },
    onStart: encStart, onRoundStart: encRoundStart,
    reward: { goldMult: 0.9, itemRarity: 'rare' } });

  // =================================================================================================================
  // Public helpers (tests, sims, META-UI's codex, QA)
  // =================================================================================================================
  DD.Goats = {
    N: N, SK: SK, ST: ST, OBJ: OBJ, TER: TER, ENC: ENC, RULE: RULE, TAG: TAG, IDS: CREW.slice(), GOATS: GOATS.slice(), HOLDERS: HOLDERS.slice(),
    LAYOUT: LAYOUT.slice(), DISS: DISS, CLOSE: CLOSE, BACK: BACK, FIGHT: FIGHT, BANTER: BANTER, MOMENTS: MOMENTS, SPRITES: SPRITES,
    RIDER: RIDER, VERSE_RULE: VERSE_RULE, LINE: LINE, LAYOUT_LEGEND: LEGEND,
    // the codex group and the four object / item entries (addendum §17.7; META-UI reads them for the Act IV codex)
    CODEX: {
      group: 'The Rapping Goats (Herd Mentality, feat. Ursa Verse)',
      entries: [
        { id: OBJ.mic, name: 'The Mic Stand', icon: '🎤', text: 'The battle mic. Clap back here and the verse turns on you. Brave. Unwise. Brave.' },
        { id: ST.mic, name: 'The Golden Mic', icon: '🎙️', text: 'The crew\'s one good microphone. Whoever holds it closes the verse. Billy holds it. The bear holds it better.' },
        { id: OBJ.speaker, name: 'Speaker Stack', icon: '🔊', text: 'Two speaker stacks and one DJ. Break both and the beat stops.' },
        { id: OBJ.bale, name: 'Hay Bale', icon: '🌾', text: 'A round hay bale. Hides you from a diss. Burns like a diss.' },
      ],
    },
    /** The fight's verse state (or null). */
    rap: function (s) { return RD(s); },
    /** Puzzle engagement this fight (sims): bars, hangs, Bar None landed / cut / fizzled, claps, tributes, the bear's round … */
    stats: function (s) { const R = RD(s); return R ? Object.assign({ bear: R.bear }, R.stats) : {}; },
    crewTotals: crewTotals, pickNext: pickNext, firstMark: firstMark, pickHolder: pickHolder,
    callOut: function (h, why) { return callOut(S(), h, why); },
    setHolder: function (u) { setHolder(S(), u); },
    hang: function () { hang(S()); sync(S()); },
    sync: sync, entrance: function () { return entrance(S()); }, checkBear: function () { checkBear(S()); },
    danceTiles: danceTiles, pickColour: pickColour, colourOf: function (x, y) { return colourOf(G().tile(x, y)); },
    stand: stand, speakers: speakersStanding, bassPending: bassPending,
    wouldFinish: wouldFinish, dissKind: dissKind, clapAvailable: function (u) { return clapAvailable(null, u); }, clapValue: clapValue,
    barNoneDmg: barNoneDmg, verseName: verseName, verseDesc: verseDesc, flavor: function (s) { s = s || S(); return flavorOf(RD(s), s); },
  };
})();
