/* Dungeons and Degenerates — tests/content/narrative.js
 * Suites "narrative: …" for js/data/events.js (ev_*) and js/data/narrator.js (narration + tips), v2.
 *  - events: registry shape and copy (2-5 sentences, exact hints, no XP / telegraph / Guard talk, the hero's own
 *    pronouns); every choice of every event resolved through the real event API (DD.Run) over several seeds and
 *    checked against its hint (gold, HP, level-ups through the DM's rotation or named, items, consumables, skills,
 *    scars, Blessings, fights, consolation gold), every random branch reached; gold costs gate their choices; hero
 *    events offered only with their hero and still safe without; the rotation itself (lowest level first, the DM's
 *    die in the text, named level-ups rare); fallbacks (full pockets / sockets, everything maxed, max level, no scars);
 *    queued event fights start and auto-battle through the real engine.
 *  - narration: every key (ARCHITECTURE §3.10 plus the v2 engine key 'initiative') has 8+ lines, tokens only where
 *    every caller fills them (static, and in practice: DD.narrate recorded during real fights and run flows), no v1
 *    talk, no pronouns for {hero}; 30+ tips, each one re-checked in-engine (or listed as checked against the source).
 * Works in isolation (core + fixtures + these files): missing real heroes are stood in by fixture clones.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const HERO_EVENTS = {
    zarathor: 'ev_zar_bling_merchant', syllamin: 'ev_syl_rap_battle', marbles: 'ev_mar_lost_marbles', marwyn: 'ev_mrw_mirror',
    ellaria: 'ev_ell_lost_corgi', josiah: 'ev_jos_rat_union', sparrow: 'ev_spa_blood_bank', corelos: 'ev_cor_fine_print',
    slate: 'ev_sla_noisy_kids', buga: 'ev_buga_reelection', kiri: 'ev_kir_lost_and_found', betty: 'ev_bet_family_reunion',
    basanos: 'ev_bas_somebody_ate_dolly', valdris: 'ev_val_forge_god', hjalmar: 'ev_hja_prank_king', pebbles: 'ev_peb_best_in_show',
  };
  // second events for Slate and Mayor Buga (DESIGN §11 offers two ideas each)
  const HERO_EXTRA = { ev_sla_sculptor: 'slate', ev_buga_toaster_cult: 'buga' };
  function heroEventList() {
    const out = Object.keys(HERO_EVENTS).map(function (h) { return { hero: h, id: HERO_EVENTS[h] }; });
    Object.keys(HERO_EXTRA).forEach(function (id) { out.push({ hero: HERO_EXTRA[id], id: id }); });
    return out;
  }
  const HERO_NAMES = {
    zarathor: 'Zarathor', syllamin: 'Syllamin', marbles: 'Professor Marbles', marwyn: 'Marwyn', ellaria: 'Ellaria',
    josiah: 'Josiah', sparrow: 'Sparrow', corelos: 'Corelos', slate: 'Slate', buga: 'Mayor Buga', kiri: 'Kiri', betty: 'Betty',
    basanos: 'Basanos', valdris: 'Valdris', hjalmar: 'Hjalmar', pebbles: 'Pebbles',
  };
  // the user's pronouns: she/her for these three, he/him for every other hero
  const SHE = ['ellaria', 'sparrow', 'kiri'];
  const HE_WORDS = ['he', 'him', 'his', 'himself'];
  const SHE_WORDS = ['she', 'her', 'hers', 'herself'];
  const THEY_WORDS = ['they', 'them', 'their', 'theirs', 'themselves', 'themself'];
  // named level-ups jump the rotation: rare, and only in that hero's own event
  const NAMED_LEVEL_UPS = ['ev_mrw_mirror', 'ev_jos_rat_union', 'ev_bas_somebody_ate_dolly'];
  const ROTATION_HINT = 'One hero levels up (the DM rolls among the lowest-level heroes).';
  // ARCHITECTURE §3.10 + the v2 engine key (combat.js / combat_hud.js narrate 'initiative' with { hero }) + 'objective_failed'
  // (a lost objective while heroes stand: requested from combat.js, whose 'defeat' lines are about a TPK)
  const NARRATION_KEYS = ['combat_start', 'elite_start', 'boss_start', 'victory', 'defeat', 'kill', 'env_kill', 'overkill', 'multi_kill',
    'hero_downed', 'hero_revived', 'hero_death', 'level_up', 'signature', 'round_start', 'enemy_turn', 'shop_greet', 'shop_buy', 'shop_broke',
    'shop_leave', 'tavern_greet', 'rest', 'recruit', 'map_enter', 'act_intro_1', 'act_intro_2', 'act_intro_3', 'act_clear', 'treasure', 'tips',
    'gameover_title', 'victory_title', 'run_start', 'idle_dm', 'initiative', 'objective_failed'];
  const POCKET_GOLD = 15;
  const CONSOLATION_GOLD = 30;
  const DEBT_SCAR = 'scar_owes_the_dm';   // Corelos' fine print
  const EGO_SCAR = 'scar_bruised_ego';    // Valdris' haircut
  // v1 talk that must be gone in v2: XP, telegraphs / intents, Guard, red intent tiles, "enemies show what they will do"
  const V1_TALK = /\bXP\b|experience points?|telegraph|(?:enemy|their|its) intents?\b|intent tiles|(?<!no )\bGuard\b|red tiles|what (?:it|they) will do/i;
  // sentences ending twice ("Fetch!." / "Back In My Day....") when a name brings its own punctuation
  const BAD_PUNCT = /[!?…]\.|\.\.\.\./;
  // lowercase values engine callers can pass for a token: hero_downed's culprit is 'gravity' without a source, the
  // initiative roll names 'the party' when no hero rolled
  const LOWER_FILLS = { hero_downed: { enemy: 'gravity' }, initiative: { hero: 'the party' } };
  /** 5-word runs of a line (lowercase words, tokens kept), for near-repeat checks. */
  function grams(line) {
    const w = String(line).toLowerCase().replace(/[^a-z0-9{}' ]+/g, ' ').split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i + 5 <= w.length; i++) out.push(w.slice(i, i + 5).join(' '));
    return out;
  }
  /** Sentences of a rendered line that start with a lowercase letter. */
  function lowerStarts(line) {
    // an ellipsis does not end the sentence ("okay, so..." in that tone), nor does a quoted cry ('screams "THIEF!" and')
    const s = String(line).replace(/\.\.\./g, '…').replace(/[!?](["”])(?=\s+[a-z])/g, '$1');
    return (s.match(/(?:^|[.!?]["”)]?\s+)[a-z]\w*/g) || []).map(function (m) { return m.trim(); });
  }
  function sentences(text) { return String(text).replace(/\.\.\./g, '…').split(/(?<=[.!?]["”)]?)\s+/); }
  /** Sentences where a pronoun after `name` (same sentence) is not the hero's own. Blessing roll results (run-layer
   *  text) are skipped. */
  function wrongPronouns(text, name, heroId) {
    const bad = SHE.indexOf(heroId) >= 0 ? HE_WORDS : SHE_WORDS;
    return sentences(text).filter(function (sen) {
      const at = sen.indexOf(name);
      if (at < 0 || / gained | is now [IVX]+!| traded | passed on /.test(sen)) return false;
      const words = sen.slice(at + name.length).toLowerCase().match(/[a-z]+/g) || [];
      return words.some(function (w) { return bad.indexOf(w) >= 0; });
    });
  }
  const RARITY_CHAIN = { legendary: ['legendary', 'rare', 'common'], rare: ['rare', 'common', 'legendary'], common: ['common', 'rare', 'legendary'], cursed: ['cursed', 'common', 'rare'] };
  const BAD_TEXT = /undefined|NaN|\[object|\{\w+\}/;

  function ours() { return Object.keys(DD.defs.events).filter(function (id) { return id.indexOf('ev_') === 0; }).map(function (id) { return DD.defs.events[id]; }); }
  function added(before, after) {
    const count = {};
    before.forEach(function (x) { count[x] = (count[x] || 0) + 1; });
    const out = [];
    after.forEach(function (x) { if (count[x]) count[x]--; else out.push(x); });
    return out;
  }

  // ---- headless run lab -----------------------------------------------------------------------------------
  /** Real hero ids missing from the registry (isolated runs) get a fixture clone under that id. Returns a restore fn. */
  function standIns() {
    const tpl = Object.keys(DD.defs.heroes).filter(function (id) { return id.indexOf('test_') === 0; })[0];
    const made = [];
    Object.keys(HERO_EVENTS).forEach(function (id) {
      if (DD.defs.heroes[id] || !tpl) return;
      DD.defs.heroes[id] = Object.assign({}, DD.defs.heroes[tpl], { id: id, name: HERO_NAMES[id], unlock: null });
      made.push(id);
    });
    return function () { made.forEach(function (id) { delete DD.defs.heroes[id]; }); };
  }
  /** Fixture companions (4) when loaded, else any registered heroes. */
  function companions(exclude) {
    const fx = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue', 'test_summoner'].filter(function (id) { return DD.getHero(id) && id !== exclude; });
    const pool = fx.length >= 4 ? fx : Object.keys(DD.defs.heroes).filter(function (id) { return id !== exclude; });
    return pool.slice(0, 4);
  }
  /** Run fn with the run layer headless; Run / Meta / storage / stand-ins are restored afterwards. */
  function runLab(t, fn) {
    if (!DD.Run || !DD.Rewards || !DD.RunMap || !DD.Meta) { t.skip('run layer not loaded'); return undefined; }
    const savedUi = DD.Run.useUi;
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    const restore = standIns();
    DD.Run.useUi = false;
    try {
      return fn();
    } finally {
      restore();
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
    }
  }
  /** A fresh run to clone from: act, 200 gold, empty pockets, no Blessings (no gold / heal multipliers), uneven levels
   *  (default [2, 1, 2, 1]: the DM's rotation must pick hero 1 or 3), every hero at about half HP, and hero #1 carrying
   *  two scars (for the scar-removal choices). */
  function baseRun(party, act, seed, opts) {
    opts = opts || {};
    DD.Run.newRun(party, 'normal', seed);
    const s = DD.Run.state;
    const levels = opts.levels || [2, 1, 2, 1];
    s.act = act || 1;
    s.gold = opts.gold !== undefined ? opts.gold : 200;
    s.consumables = [];
    s.party.forEach(function (rh, i) {
      rh.passives = [];
      rh.passiveRolls = [];
      rh.level = levels[i] || 1;
      rh.pendingLevels = 0;
      rh.levelChoices = null;
      rh.hp = Math.max(1, Math.round(DD.Run.heroStats(rh).maxHp / 2));
    });
    const scars = Object.keys(DD.defs.scars).slice(0, 2);
    if (opts.scars !== false && s.party[1] && scars.length === 2) {
      s.party[1].scars = scars.slice();
      s.party[1].hp = Math.max(1, Math.round(DD.Run.heroStats(s.party[1]).maxHp / 2));
    }
    return DD.util.deepClone(s);
  }
  /** Install a copy of base as the live run with its own RNG stream k. */
  function fromBase(base, k) {
    const s = DD.util.deepClone(base);
    s.rngState = (DD.util.hash('narrative:' + k) >>> 0) || 1;
    DD.Run.state = s;
    return s;
  }
  function snap(s) {
    return {
      gold: s.gold,
      hp: s.party.map(function (h) { return h.hp; }),
      max: s.party.map(function (h) { return DD.Run.heroStats(h).maxHp; }),
      level: s.party.map(function (h) { return h.level; }),
      scars: s.party.map(function (h) { return h.scars.slice(); }),
      nsk: s.party.map(function (h) { return h.skills.length; }),
      lv: s.party.map(function (h) { return h.skills.reduce(function (a, k) { return a + k.level; }, 0); }),
      bless: s.party.map(function (h) {
        return (h.passives || []).reduce(function (a, p) { return a + (p.level || 1); }, 0) + (h.passiveRolls || []).length;
      }),
      // a level gained also rolls on the Table (resolved at once headless) when the table has anything for the hero
      rollable: s.party.map(function (h) { return !!DD.Passives && DD.Passives.table(h).length > 0; }),
      items: DD.Rewards.ownedItems(s),
      equipped: s.party.map(function (h) { return Object.assign({}, h.items); }),
      bag: s.inventory.slice(),
      cons: s.consumables.slice(),
      learns: s.learnQueue.length,
      queued: s.queuedCombat ? Object.assign({}, s.queuedCombat) : null,
    };
  }
  function amountOf(M, x) { return x > 0 && x < 1 ? Math.max(1, Math.round(M * x)) : Math.round(x); }
  function healAmount(M, f) { return f <= 1 ? Math.max(1, Math.round(M * f)) : Math.round(f); }

  /** Items a random roll could produce for the party (heroId: one hero's view), mirroring DD.Rewards.randomItem. */
  function eligibleItems(s, heroId) {
    const ids = heroId ? [heroId] : s.party.filter(function (h) { return !h.dead; }).map(function (h) { return h.id; });
    return Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k]; }).filter(function (d) {
      return d && ['weapon', 'armor', 'trinket'].indexOf(d.slot) >= 0 && !d.noDrop && (!d.hero || ids.indexOf(d.hero) >= 0);
    });
  }

  /** The outcome context handed to a checker: deltas + assertion helpers. Branch checks return a branch name. */
  function makeCtx(t, label, b, a, out, s, star) {
    const alive = [];
    s.party.forEach(function (h, i) { if (!h.dead) alive.push(i); });
    const text = (out && out.text) || '';
    const c = {
      label: label, b: b, a: a, out: out, s: s, st: star, alive: alive,
      gold: a.gold - b.gold,
      fight: a.queued,
      newItems: added(b.items, a.items),
      newCons: added(b.cons, a.cons),
      learns: a.learns - b.learns,
      ok: function (cond, msg) { return t.ok(cond, label + ': ' + msg); },
      eff: function (i) { return (a.hp[i] - b.hp[i]) - (a.max[i] - b.max[i]); },
      up: function (i) { return a.level[i] - b.level[i]; },
      lvl: function (i) { return a.lv[i] - b.lv[i]; },
      nsk: function (i) { return a.nsk[i] - b.nsk[i]; },
      blessed: function (i) { return (a.bless[i] - b.bless[i]) - (b.rollable[i] ? a.level[i] - b.level[i] : 0); },
      newScars: function (i) { return added(b.scars[i], a.scars[i]); },
      lostScars: function (i) { return added(a.scars[i], b.scars[i]); },
    };
    c.goldIs = function (n) { return c.ok(c.gold === n, 'gold ' + (n >= 0 ? '+' : '') + n + ' (got ' + c.gold + ')'); };
    c.healOk = function (i, f) {
      const room = b.max[i] - b.hp[i];
      return [b.max[i], a.max[i]].some(function (M) { return c.eff(i) === Math.min(healAmount(M, f), room); });
    };
    c.hurtOk = function (i, x) {
      const loss = -c.eff(i);
      const hps = [b.hp[i], b.hp[i] + a.max[i] - b.max[i]];
      return [b.max[i], a.max[i]].some(function (M) { return hps.some(function (h) { return loss === Math.min(amountOf(M, x), Math.max(0, h - 1)); }); });
    };
    c.healAll = function (f) { alive.forEach(function (i) { c.ok(c.healOk(i, f), 'hero ' + i + ' heals ' + f + ' (' + b.hp[i] + '/' + b.max[i] + ' -> ' + a.hp[i] + '/' + a.max[i] + ')'); }); };
    c.hurtAll = function (x) { alive.forEach(function (i) { c.ok(c.hurtOk(i, x), 'hero ' + i + ' loses ' + x + ' (' + b.hp[i] + '/' + b.max[i] + ' -> ' + a.hp[i] + '/' + a.max[i] + ')'); }); };
    c.heal = function (i, f) { c.ok(c.healOk(i, f), 'hero ' + i + ' heals ' + f + ' (' + b.hp[i] + ' -> ' + a.hp[i] + ')'); };
    c.hurt = function (i, x) { c.ok(c.hurtOk(i, x), 'hero ' + i + ' loses ' + x + ' (' + b.hp[i] + ' -> ' + a.hp[i] + ')'); };
    c.hpSame = function (except) {
      alive.forEach(function (i) { if (except === undefined || (Array.isArray(except) ? except.indexOf(i) < 0 : i !== except)) c.ok(c.eff(i) === 0, 'hero ' + i + ' HP unchanged (' + b.hp[i] + ' -> ' + a.hp[i] + ')'); });
    };
    c.anyHpChange = function () { return alive.some(function (i) { return c.eff(i) !== 0; }); };
    // ---- level-ups (v2: no XP) ----
    c.levelText = function (i) { return DD.Run.heroName(i) + ' levels up to level ' + a.level[i] + '.'; };
    c.noLevels = function (except) {
      alive.forEach(function (i) { if (i !== except) c.ok(c.up(i) === 0, 'hero ' + i + ' does not level up (' + b.level[i] + ' -> ' + a.level[i] + ')'); });
    };
    /** A named level-up: hero i gains exactly one level (even ahead of the rotation), nobody else, and the text says so. */
    c.named = function (i) {
      c.ok(c.up(i) === 1, 'hero ' + i + ' levels up once (' + b.level[i] + ' -> ' + a.level[i] + ')');
      c.noLevels(i);
      c.ok(text.indexOf(c.levelText(i)) >= 0, 'the outcome names the level-up ("' + c.levelText(i) + '")');
    };
    /** A rotation level-up: exactly one living hero gains one level, drawn among the lowest-level heroes; the text names
     *  them (with the DM's die when several were in the running). Returns that hero. */
    c.rotation = function () {
      const up = alive.filter(function (i) { return c.up(i) !== 0; });
      if (!c.ok(up.length === 1 && c.up(up[0]) === 1, 'exactly one hero levels up (' + up.map(function (i) { return i + ': ' + b.level[i] + ' -> ' + a.level[i]; }).join(', ') + ')')) return -1;
      const low = Math.min.apply(null, alive.map(function (i) { return b.level[i]; }));
      const n = alive.filter(function (i) { return b.level[i] === low; }).length;
      c.ok(b.level[up[0]] === low, 'the DM rolled among the lowest-level heroes (hero ' + up[0] + ' was level ' + b.level[up[0]] + ', lowest ' + low + ')');
      c.ok(text.indexOf(c.levelText(up[0])) >= 0, 'the outcome names the level-up ("' + c.levelText(up[0]) + '")');
      c.ok(n < 2 || (n === 2 ? /flips a coin for it: (heads|tails)!/ : new RegExp('rolls a d' + n + ' for it: [1-' + n + ']!')).test(text), 'the DM\'s die for ' + n + ' candidates is in the text');
      return up[0];
    };
    c.noFight = function () { return c.ok(!c.fight && !(out && out.combat), 'no fight queued'); };
    c.fightIs = function (kind) {
      return c.ok(!!c.fight && c.fight.kind === kind && c.fight.act === s.act && !!out && !!out.combat && out.combat.kind === kind,
        'a ' + kind + ' fight of act ' + s.act + ' is queued (' + JSON.stringify(c.fight) + ')');
    };
    c.noItems = function () { return c.ok(c.newItems.length === 0, 'no item gained (' + c.newItems.join(',') + ')'); };
    c.noCons = function () { return c.ok(c.newCons.length === 0, 'no consumable gained'); };
    c.noScars = function () { alive.forEach(function (i) { c.ok(c.newScars(i).length === 0 && c.lostScars(i).length === 0, 'hero ' + i + ' scars unchanged'); }); };
    c.noBless = function (except) { alive.forEach(function (i) { if (i !== except) c.ok(c.blessed(i) === 0, 'hero ' + i + ' rolls no Blessing'); }); };
    c.noSkills = function () { alive.forEach(function (i) { c.ok(c.lvl(i) === 0 && c.nsk(i) === 0, 'hero ' + i + ' skills unchanged'); }); c.ok(c.learns === 0, 'no learn queued'); };
    // ---- the consolation gold (nothing left to roll / upgrade / learn): each returns the gold it paid ----
    function consolation(what) {
      c.ok(/gold instead\./.test(text), what + ': the consolation gold is in the text');
      return CONSOLATION_GOLD;
    }
    /** Hero i rolled on the Table once (and nobody else did), or took the consolation gold. */
    c.blessGold = function (i) {
      c.noBless(i);
      if (c.blessed(i) === 1) return 0;
      c.ok(c.blessed(i) === 0, 'hero ' + i + ' rolled at most once (' + c.blessed(i) + ')');
      return consolation('hero ' + i + ' rolled no Blessing');
    };
    /** Hero i upgraded one skill, or took the consolation gold. */
    c.upgradeGold = function (i) {
      if (c.nsk(i) === 0 && c.lvl(i) === 1) return 0;
      c.ok(c.nsk(i) === 0 && c.lvl(i) === 0, 'hero ' + i + ' upgrades a skill (levels ' + c.lvl(i) + ', skills ' + c.nsk(i) + ')');
      return consolation('hero ' + i + ' upgraded nothing');
    };
    /** Hero i learned (socketed or queued), else upgraded, else took the consolation gold. */
    c.learnGold = function (i) {
      if (c.nsk(i) === 1 && c.lvl(i) === 1) return 0;
      if (c.nsk(i) === 0 && c.lvl(i) === 0 && c.learns === 1) return 0;
      return c.upgradeGold(i);
    };
    /** Exactly one living hero matches pred(i); returns it. */
    c.one = function (pred, what) {
      const hit = alive.filter(pred);
      c.ok(hit.length === 1, 'exactly one hero ' + what + ' (' + hit.join(',') + ')');
      return hit.length ? hit[0] : -1;
    };
    /** A random hero rolled on the Table (or the DM paid the consolation). Returns { i, gold }. */
    c.blessAny = function () {
      const hit = alive.filter(function (k) { return c.blessed(k) !== 0; });
      if (!hit.length) return { i: -1, gold: consolation('nobody rolled') };
      c.ok(hit.length === 1 && c.blessed(hit[0]) === 1, 'one hero rolled once (' + hit.map(function (k) { return k + ': ' + c.blessed(k); }).join(', ') + ')');
      return { i: hit[0], gold: 0 };
    };
    /** A random hero upgraded a skill (or the DM paid the consolation). Returns { i, gold }. */
    c.upgradeAny = function () {
      const hit = alive.filter(function (k) { return c.lvl(k) !== 0 || c.nsk(k) !== 0; });
      if (!hit.length) return { i: -1, gold: consolation('nobody upgraded') };
      c.ok(hit.length === 1, 'one hero trains (' + hit.join(',') + ')');
      return { i: hit[0], gold: c.upgradeGold(hit[0]) };
    };
    /** A random hero learned (or queued, or upgraded, or the DM paid the consolation). Returns { i, gold }. */
    c.learnAny = function () {
      if (c.learns === 1) {
        const q = s.learnQueue[s.learnQueue.length - 1];
        return { i: s.party.findIndex(function (h) { return h.id === q.heroId; }), gold: 0 };
      }
      const hit = alive.filter(function (k) { return c.lvl(k) !== 0 || c.nsk(k) !== 0; });
      if (!hit.length) return { i: -1, gold: consolation('nobody learned') };
      c.ok(hit.length === 1, 'one hero learns (' + hit.join(',') + ')');
      return { i: hit[0], gold: c.learnGold(hit[0]) };
    };
    c.scarOn = function (i) {
      alive.forEach(function (k) { c.ok(c.newScars(k).length === (k === i ? 1 : 0), 'hero ' + k + ' new scars: ' + c.newScars(k).join(',')); });
    };
    /** A party item of `rarity` (requested rarity whenever one exists); cursed ones stay in the bag. */
    c.partyItem = function (rarity) {
      c.ok(c.newItems.length === 1, 'exactly one item gained (' + c.newItems.join(',') + ')');
      const d = DD.getItem(c.newItems[0]);
      if (!d) return null;
      const elig = eligibleItems(s, null);
      const want = RARITY_CHAIN[rarity].filter(function (r) { return elig.some(function (e) { return e.rarity === r; }); })[0];
      c.ok(d.rarity === want, 'item ' + d.id + ' is ' + d.rarity + ' (expected ' + want + ')');
      if (d.rarity === 'cursed') c.ok(a.bag.indexOf(d.id) >= 0, 'cursed item stays in the bag');
      return d;
    };
    /** An item of `rarity` for hero i: its own unowned item of that rarity if one exists, else any it can use;
     *  equipped on it when the slot was free. */
    c.heroItem = function (i, rarity) {
      c.ok(c.newItems.length === 1, 'exactly one item gained (' + c.newItems.join(',') + ')');
      const d = DD.getItem(c.newItems[0]);
      if (!d) return null;
      const rh = s.party[i];
      const own = Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k]; }).filter(function (x) {
        return x.hero === rh.id && x.rarity === rarity && !x.noDrop && b.items.indexOf(x.id) < 0;
      });
      if (own.length) c.ok(d.hero === rh.id && d.rarity === rarity, 'hero ' + i + ' gets one of its own ' + rarity + ' items (got ' + d.id + ')');
      else {
        const elig = eligibleItems(s, rh.id);
        const want = RARITY_CHAIN[rarity].filter(function (r) { return elig.some(function (e) { return e.rarity === r; }); })[0];
        c.ok(d.rarity === want && (!d.hero || d.hero === rh.id), 'item ' + d.id + ' (' + d.rarity + ') usable by hero ' + i + ', expected ' + want);
      }
      if (d.rarity !== 'cursed' && !b.equipped[i][d.slot]) c.ok(a.equipped[i][d.slot] === d.id, 'equipped on hero ' + i + ' (its ' + d.slot + ' slot was free)');
      c.ok(text.indexOf(d.name) >= 0, 'the outcome names ' + d.name);
      return d;
    };
    /** n consumables, each one that does not fit sold for POCKET_GOLD; goldOther = the rest of the gold change. */
    c.potions = function (n, goldOther) {
      const any = Object.keys(DD.defs.consumables).some(function (k) { return !DD.defs.consumables[k].noDrop; });
      const fit = any ? Math.min(n, Math.max(0, s.maxConsumables - b.cons.length)) : 0;
      c.ok(c.newCons.length === fit, n + ' consumable(s): ' + fit + ' fit (got ' + c.newCons.length + ')');
      c.goldIs((goldOther || 0) + POCKET_GOLD * (n - fit));
    };
    return c;
  }

  // ---- what every choice must do (checkers return the branch they observed) --------------------------------------
  function det(fn) { return { branches: ['ok'], check: function (c) { fn(c); return 'ok'; } }; }
  const SPEC = {
    ev_dice_goblin: [
      { branches: ['win', 'lose'], optional: ['nat20', 'nat1'], check: function (c) {
        c.noLevels(); c.noFight(); c.noItems(); c.noBless();
        if (c.gold === 75) { c.hpSame(); return 'nat20'; }
        if (c.gold === 25) { c.hpSame(); return 'win'; }
        c.goldIs(-25);
        if (c.anyHpChange()) { c.hurtAll(5); return 'nat1'; }
        return 'lose';
      } },
      { branches: ['bless', 'fight'], check: function (c) {
        c.hpSame(); c.noItems(); c.noScars(); c.noLevels();
        if (c.fight) { c.fightIs('normal'); c.noBless(); c.goldIs(0); return 'fight'; }
        c.noFight();
        c.goldIs(c.blessAny().gold);
        return 'bless';
      } },
      det(function (c) { c.healAll(0.15); c.goldIs(0); c.noLevels(); c.noFight(); c.noItems(); }),
    ],
    ev_session_cancelled: [
      det(function (c) { c.healAll(0.5); c.goldIs(0); c.noLevels(); c.noFight(); }),
      det(function (c) { c.goldIs(50); c.hurtAll(0.1); c.noLevels(); c.noFight(); }),
      { branches: ['calm', 'fight'], check: function (c) {
        c.rotation(); c.goldIs(0); c.hpSame(); c.noItems();
        if (c.fight) { c.fightIs('normal'); return 'fight'; }
        c.noFight(); return 'calm';
      } },
    ],
    ev_snack_run: [
      det(function (c) { c.goldIs(-25); c.healAll(0.5); c.noLevels(); c.noFight(); }),
      { branches: ['tasty', 'sick'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.noFight();
        if (c.alive.some(function (i) { return c.eff(i) > 0; })) { c.healAll(0.25); return 'tasty'; }
        c.hurtAll(0.1); return 'sick';
      } },
      det(function (c) { c.potions(1, 0); c.fightIs('normal'); c.hpSame(); c.noLevels(); }),
    ],
    ev_trap_hallway: [
      det(function (c) { c.goldIs(25); c.hpSame(); c.noLevels(); c.noFight(); }),
      { branches: ['coin', 'floor'], check: function (c) {
        c.noLevels(); c.noFight();
        if (c.gold === 70) { c.hpSame(); return 'coin'; }
        c.goldIs(0); c.hurtAll(0.2); return 'floor';
      } },
      det(function (c) {
        let best = -1;
        c.alive.forEach(function (i) { if (best < 0 || c.b.hp[i] > c.b.hp[best]) best = i; });
        c.hurt(best, 0.25); c.hpSame(best); c.goldIs(35); c.noLevels(); c.noFight();
      }),
    ],
    ev_mimic_meeting: [
      det(function (c) { c.rotation(); c.hurtAll(0.1); c.goldIs(0); c.noFight(); }),
      det(function (c) {
        const i = c.one(function (k) { return c.eff(k) < 0; }, 'is hugged');
        if (i >= 0) { c.hurt(i, 0.3); c.hpSame(i); }
        c.partyItem('rare'); c.goldIs(0); c.noLevels(); c.noFight();
      }),
      { branches: ['chest', 'doug'], check: function (c) {
        c.noLevels(); c.hpSame(); c.noItems();
        if (c.fight) { c.fightIs('elite'); c.goldIs(0); return 'doug'; }
        c.goldIs(40); c.noFight(); return 'chest';
      } },
    ],
    ev_goblin_mlm: [
      det(function (c) { c.potions(2, -30); c.noLevels(); c.hpSame(); c.noFight(); }),
      { branches: ['natural', 'collapse'], check: function (c) {
        c.noLevels(); c.hpSame(); c.noFight();
        if (c.gold === 70) return 'natural';
        c.goldIs(-40); return 'collapse';
      } },
      det(function (c) { c.goldIs(30); c.noLevels(); c.hpSame(); c.noFight(); }),
    ],
    ev_cursed_clearance: [
      det(function (c) { c.goldIs(-15); c.partyItem('cursed'); c.noLevels(); c.hpSame(); c.noFight(); }),
      { branches: ['clean', 'haunted'], check: function (c) {
        c.goldIs(-45); c.partyItem('rare'); c.noLevels(); c.noFight();
        const hit = c.alive.filter(function (i) { return c.newScars(i).length > 0; });
        if (!hit.length) return 'clean';
        c.scarOn(hit[0]); return 'haunted';
      } },
      det(function (c) {
        c.noLevels(); c.noFight(); c.hpSame();
        const scarred = c.alive.filter(function (i) { return c.b.scars[i].length > 0; });
        const lost = c.alive.filter(function (i) { return c.lostScars(i).length > 0; });
        if (scarred.length) {
          c.ok(lost.length === 1 && c.lostScars(lost[0]).length === 1, 'one scar removed');
          if (lost.length) c.ok(c.lostScars(lost[0])[0] === c.b.scars[lost[0]][c.b.scars[lost[0]].length - 1], 'their latest scar');
          c.goldIs(0);
        } else { c.ok(lost.length === 0, 'nothing to remove'); c.goldIs(25); }
      }),
    ],
    ev_wizard_did_it: [
      { branches: ['clean', 'backfire'], check: function (c) {
        c.hpSame(); c.noFight(); c.noItems(); c.noLevels();
        const r = c.upgradeAny();
        c.goldIs(r.gold);
        const scarred = c.alive.filter(function (k) { return c.newScars(k).length > 0; });
        if (!scarred.length) return 'clean';
        if (r.i >= 0) c.scarOn(r.i); else c.ok(scarred.length === 1, 'one hero is scarred');
        return 'backfire';
      } },
      { branches: ['rich', 'butterflies'], check: function (c) {
        c.noLevels(); c.hpSame(); c.noFight();
        if (c.gold > 0) { c.goldIs(70); return 'rich'; }
        c.goldIs(-30); return 'butterflies';
      } },
      det(function (c) { c.potions(1, 0); c.noLevels(); c.hpSame(); c.noFight(); }),
    ],
    ev_fountain_youth: [
      { branches: ['fine', 'puberty'], check: function (c) {
        c.healAll(1); c.goldIs(0); c.noLevels(); c.noFight();
        const hit = c.alive.filter(function (i) { return c.newScars(i).length > 0; });
        if (!hit.length) return 'fine';
        c.scarOn(hit[0]); return 'puberty';
      } },
      det(function (c) { c.potions(2, 0); c.noLevels(); c.hpSame(); c.noFight(); }),
      { branches: ['king', 'frog'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.hpSame(); c.noFight();
        if (c.newItems.length) { c.partyItem('legendary'); c.noScars(); return 'king'; }
        const hit = c.alive.filter(function (i) { return c.newScars(i).length > 0; });
        c.ok(hit.length === 1, 'the kisser gains a scar');
        if (hit.length) c.scarOn(hit[0]);
        return 'frog';
      } },
    ],
    ev_career_fair: [
      det(function (c) { c.rotation(); c.hurtAll(0.15); c.goldIs(0); c.noFight(); }),
      det(function (c) { c.goldIs(c.learnAny().gold); c.hpSame(); c.noFight(); c.noLevels(); }),
      { branches: ['clean', 'caught'], check: function (c) {
        c.goldIs(30); c.noLevels(); c.hpSame();
        if (c.fight) { c.fightIs('normal'); return 'caught'; }
        c.noFight(); return 'clean';
      } },
    ],
    ev_overdue_book: [
      det(function (c) { c.goldIs(c.learnAny().gold); c.hpSame(); c.noFight(); c.noLevels(); }),
      det(function (c) { c.goldIs(-40); c.healAll(0.2); c.rotation(); c.noFight(); }),
      det(function (c) { c.goldIs(c.blessAny().gold); c.fightIs('elite'); c.hpSame(); c.noLevels(); }),
    ],
    ev_owlbear_daycare: [
      det(function (c) { c.hurtAll(0.2); c.potions(1, 50); c.noLevels(); c.noFight(); }),
      { branches: ['nap', 'mama'], check: function (c) {
        c.healAll(0.35); c.goldIs(0); c.noLevels();
        if (c.fight) { c.fightIs('elite'); return 'mama'; }
        c.noFight(); return 'nap';
      } },
      det(function (c) { c.goldIs(30); c.fightIs('normal'); c.hpSame(); c.noLevels(); c.noItems(); }),
    ],
    ev_retcon: [
      det(function (c) { c.healAll(0.6); c.goldIs(0); c.noLevels(); c.noFight(); }),
      det(function (c) {
        const total = c.b.scars.reduce(function (n, sc, i) { return n + (c.alive.indexOf(i) >= 0 ? sc.length : 0); }, 0);
        const lost = c.alive.reduce(function (n, i) { return n + c.lostScars(i).length; }, 0);
        c.ok(lost === Math.min(2, total), 'removes min(2, scars) = ' + Math.min(2, total) + ' (got ' + lost + ')');
        c.goldIs(total ? 0 : 40); c.noLevels(); c.noFight();
      }),
      det(function (c) { c.partyItem('rare'); c.fightIs('normal'); c.goldIs(0); c.noLevels(); c.hpSame(); }),
    ],
    ev_rules_lawyer: [
      det(function (c) {
        let who = -1;
        c.alive.forEach(function (i) { if (c.b.scars[i].length && (who < 0 || c.b.scars[i].length > c.b.scars[who].length)) who = i; });
        c.ok(who >= 0 && c.a.scars[who].length === 0, 'the most scarred hero loses every scar');
        c.alive.forEach(function (i) { if (i !== who) c.ok(c.lostScars(i).length === 0, 'hero ' + i + ' keeps its scars'); });
        c.goldIs(-45); c.noLevels(); c.noFight();
      }),
      { branches: ['won', 'countersued'], check: function (c) {
        c.noLevels(); c.hpSame();
        if (c.fight) { c.fightIs('elite'); c.goldIs(0); return 'countersued'; }
        c.goldIs(100); c.noFight(); return 'won';
      } },
      det(function (c) { c.goldIs(-25 + c.blessAny().gold); c.hpSame(); c.noFight(); c.noLevels(); }),
    ],
    ev_infernal_dmv: [
      det(function (c) { c.rotation(); c.hurtAll(0.2); c.goldIs(0); c.noFight(); }),
      det(function (c) { c.partyItem('rare'); c.fightIs('normal'); c.goldIs(0); c.noLevels(); c.hpSame(); }),
      det(function (c) { c.healAll(0.3); c.noFight(); c.noLevels(); c.goldIs(-50 + c.upgradeAny().gold); }),
    ],
    ev_dragon_yard_sale: [
      det(function (c) { c.goldIs(-1); c.partyItem('common'); c.noLevels(); c.hpSame(); c.noFight(); }),
      det(function (c) { c.goldIs(-120); c.partyItem('legendary'); c.noLevels(); c.hpSame(); c.noFight(); }),
      { branches: ['charmed', 'offended'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.noFight();
        if (c.newItems.length) { c.partyItem('legendary'); c.hpSame(); return 'charmed'; }
        c.hurtAll(0.25); return 'offended';
      } },
    ],
    ev_dm_notes: [
      { branches: ['safe', 'caught'], check: function (c) {
        c.rotation(); c.goldIs(0); c.hpSame();
        if (c.fight) { c.fightIs('elite'); return 'caught'; }
        c.noFight(); return 'safe';
      } },
      det(function (c) { c.goldIs(c.blessAny().gold); c.hurtAll(0.1); c.noFight(); c.noLevels(); }),
      det(function (c) { c.healAll(0.5); c.goldIs(0); c.noLevels(); c.noFight(); }),
    ],

    // ---- hero events (c.st = the hero's party index) ----
    ev_zar_bling_merchant: [
      det(function (c) { c.goldIs(-50); c.heroItem(c.st, 'rare'); c.noLevels(); c.hpSame(); c.noFight(); }),
      { branches: ['free', 'boom'], check: function (c) {
        c.noLevels(); c.noFight();
        if (c.newItems.length) { c.heroItem(c.st, 'rare'); c.goldIs(0); c.hpSame(); return 'free'; }
        c.hurt(c.st, 0.25); c.hpSame(c.st); c.goldIs(0); c.noScars();
        c.ok(c.out.text.indexOf('loses ' + (-c.eff(c.st)) + ' HP') >= 0, 'the outcome names the HP lost (' + (-c.eff(c.st)) + ')');
        return 'boom';
      } },
      det(function (c) { c.goldIs(25); c.noLevels(); c.hpSame(); c.noFight(); c.noItems(); }),
    ],
    ev_syl_rap_battle: [
      { branches: ['win', 'choke'], check: function (c) {
        c.hpSame(); c.noFight(); c.noItems(); c.noLevels();
        if (!c.newScars(c.st).length) { c.goldIs(30 + c.upgradeGold(c.st)); c.noScars(); return 'win'; }
        c.goldIs(0); c.scarOn(c.st); c.noSkills(); return 'choke';
      } },
      det(function (c) { c.rotation(); c.hurtAll(0.1); c.goldIs(0); c.noFight(); }),
      det(function (c) { c.goldIs(c.blessGold(c.st)); c.noLevels(); c.fightIs('normal'); c.hpSame(); }),
    ],
    ev_mar_lost_marbles: [
      det(function (c) { c.goldIs(c.learnGold(c.st)); c.noLevels(); c.fightIs('normal'); c.hpSame(); }),
      det(function (c) { c.goldIs(-30 + c.upgradeGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
      det(function (c) { c.heal(c.st, 1); c.hpSame(c.st); c.goldIs(c.blessGold(c.st)); c.noLevels(); c.noFight(); }),
    ],
    ev_mrw_mirror: [
      det(function (c) { c.goldIs(c.blessGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
      { branches: ['shatter', 'unlucky'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.hpSame(); c.noFight();
        if (c.newItems.length) { c.heroItem(c.st, 'rare'); c.noScars(); return 'shatter'; }
        c.scarOn(c.st); return 'unlucky';
      } },
      det(function (c) {
        c.named(c.st); c.goldIs(0); c.noFight();
        c.ok(c.eff(c.st) === 0, 'Marwyn keeps his HP');
        c.alive.forEach(function (i) { if (i !== c.st) c.hurt(i, 0.2); });
      }),
    ],
    ev_ell_lost_corgi: [
      det(function (c) { c.goldIs(60); c.noLevels(); c.hpSame(); c.noFight(); }),
      det(function (c) { c.goldIs(c.learnGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
      { branches: ['dig', 'gnolls'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.hpSame();
        if (c.fight) { c.fightIs('normal'); c.noItems(); return 'gnolls'; }
        c.heroItem(c.st, 'rare'); c.noFight(); return 'dig';
      } },
    ],
    ev_jos_rat_union: [
      det(function (c) { c.potions(2, -35 + c.upgradeGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
      det(function (c) { c.hurtAll(0.1); c.goldIs(c.blessGold(c.st)); c.noLevels(); c.noFight(); }),
      det(function (c) { c.named(c.st); c.fightIs('normal'); c.goldIs(0); c.hpSame(); }),
    ],
    ev_spa_blood_bank: [
      det(function (c) { c.hurt(c.st, 0.3); c.hpSame(c.st); c.goldIs(45); c.noLevels(); c.noFight(); }),
      det(function (c) { c.goldIs(-30); c.healAll(0.5); c.noLevels(); c.noFight(); }),
      det(function (c) { c.heroItem(c.st, 'rare'); c.fightIs('elite'); c.goldIs(0); c.noLevels(); c.hpSame(); }),
    ],
    ev_cor_fine_print: [
      det(function (c) {
        c.goldIs(c.upgradeGold(c.st) + c.blessGold(c.st)); c.noLevels(); c.hpSame(); c.noFight();
        // the fine print: the debt scar (a random one if he already owes)
        c.scarOn(c.st);
        const owed = c.b.scars[c.st].indexOf(DEBT_SCAR) >= 0;
        if (DD.getScar(DEBT_SCAR)) c.ok((c.newScars(c.st)[0] === DEBT_SCAR) !== owed, 'fine print: ' + c.newScars(c.st).join(',') + (owed ? ' (already owed)' : ''));
      }),
      det(function (c) { c.rotation(); c.hurt(c.st, 0.25); c.hpSame(c.st); c.goldIs(0); c.noFight(); }),
      det(function (c) { c.goldIs(c.learnGold(c.st)); c.noLevels(); c.fightIs('normal'); c.hpSame(); }),
    ],
    ev_sla_noisy_kids: [
      det(function (c) { c.potions(1, c.blessGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
      det(function (c) { c.heal(c.st, 1); c.hpSame(c.st); c.goldIs(c.upgradeGold(c.st)); c.noLevels(); c.noFight(); }),
      { branches: ['fine', 'dad'], check: function (c) {
        c.goldIs(c.learnGold(c.st)); c.noLevels(); c.hpSame();
        if (c.fight) { c.fightIs('normal'); return 'dad'; }
        c.noFight(); return 'fine';
      } },
    ],
    ev_sla_sculptor: [
      det(function (c) { c.hurt(c.st, 0.25); c.hpSame(c.st); c.goldIs(c.upgradeGold(c.st)); c.noLevels(); c.noFight(); }),
      det(function (c) { c.heal(c.st, 1); c.hpSame(c.st); c.goldIs(20); c.noLevels(); c.noFight(); c.noSkills(); }),
      det(function (c) { c.goldIs(-25 + c.blessGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
    ],
    ev_buga_toaster_cult: [
      { branches: ['quiet', 'heretic'], check: function (c) {
        c.goldIs(60); c.noLevels(); c.hpSame(); c.noItems();
        if (c.fight) { c.fightIs('normal'); return 'heretic'; }
        c.noFight(); return 'quiet';
      } },
      det(function (c) { c.healAll(0.3); c.goldIs(c.blessGold(c.st)); c.noLevels(); c.noFight(); }),
      { branches: ['golden', 'crispy'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.noFight();
        if (c.newItems.length) { c.heal(c.st, 1); c.hpSame(c.st); c.heroItem(c.st, 'rare'); c.noScars(); return 'golden'; }
        c.hurt(c.st, 0.3); c.hpSame(c.st); c.scarOn(c.st); return 'crispy';
      } },
    ],
    ev_buga_reelection: [
      det(function (c) { c.goldIs(70); c.scarOn(c.st); c.noLevels(); c.hpSame(); c.noFight(); }),
      det(function (c) { c.healAll(0.2); c.goldIs(-30 + c.upgradeGold(c.st)); c.noLevels(); c.noFight(); }),
      { branches: ['landslide', 'riot'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.hpSame();
        if (c.fight) { c.fightIs('normal'); c.noItems(); return 'riot'; }
        c.heroItem(c.st, 'rare'); c.noFight(); return 'landslide';
      } },
    ],
    ev_kir_lost_and_found: [
      det(function (c) { c.goldIs(-30 + c.upgradeGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
      { branches: ['found', 'luggage'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.hpSame();
        if (c.fight) { c.fightIs('normal'); c.noItems(); return 'luggage'; }
        c.heroItem(c.st, 'rare'); c.noFight(); return 'found';
      } },
      det(function (c) { c.goldIs(c.blessGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
    ],
    ev_bet_family_reunion: [
      { branches: ['heirloom', 'potato'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.noFight();
        if (c.newItems.length) { c.heroItem(c.st, 'rare'); c.hpSame(); return 'heirloom'; }
        c.hurt(c.st, 0.3); c.hpSame(c.st); return 'potato';
      } },
      det(function (c) { c.healAll(0.35); c.goldIs(0); c.noLevels(); c.noFight(); c.noItems(); }),
      det(function (c) { c.goldIs(c.learnGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
    ],
    ev_bas_somebody_ate_dolly: [
      det(function (c) { c.goldIs(-40); c.heroItem(c.st, 'rare'); c.noLevels(); c.hpSame(); c.noFight(); }),
      det(function (c) { c.named(c.st); c.fightIs('normal'); c.goldIs(0); c.hpSame(); }),
      { branches: ['bounty', 'pitchfork'], check: function (c) {
        c.noLevels(); c.noFight(); c.noItems();
        if (c.gold === 45) { c.hpSame(); return 'bounty'; }
        c.goldIs(0); c.hurt(c.st, 0.25); c.hpSame(c.st); return 'pitchfork';
      } },
    ],
    ev_val_forge_god: [
      det(function (c) {
        c.heroItem(c.st, 'legendary'); c.goldIs(0); c.noLevels(); c.noFight();
        c.scarOn(c.st);
        const had = c.b.scars[c.st].indexOf(EGO_SCAR) >= 0;
        if (DD.getScar(EGO_SCAR)) c.ok((c.newScars(c.st)[0] === EGO_SCAR) !== had, 'the haircut: ' + c.newScars(c.st).join(',') + (had ? ' (ego already bruised)' : ''));
      }),
      det(function (c) { c.hurt(c.st, 0.25); c.hpSame(c.st); c.partyItem('rare'); c.goldIs(0); c.noLevels(); c.noFight(); }),
      det(function (c) { c.goldIs(c.blessGold(c.st)); c.noLevels(); c.hpSame(); c.noFight(); }),
    ],
    ev_hja_prank_king: [
      { branches: ['crowned', 'pies'], check: function (c) {
        c.goldIs(0); c.noLevels(); c.noFight();
        if (c.newItems.length) { c.heroItem(c.st, 'rare'); c.hpSame(); return 'crowned'; }
        c.hurtAll(0.15); return 'pies';
      } },
      det(function (c) { c.goldIs(c.learnGold(c.st)); c.noLevels(); c.fightIs('normal'); c.hpSame(); }),
      det(function (c) {
        c.goldIs(c.blessGold(c.st)); c.noLevels(); c.noFight();
        c.ok(c.eff(c.st) === 0, 'Hjalmar keeps his HP');
        c.alive.forEach(function (i) { if (i !== c.st) c.hurt(i, 0.1); });
      }),
    ],
    ev_peb_best_in_show: [
      { branches: ['best', 'arson'], check: function (c) {
        c.noLevels(); c.noFight(); c.hpSame();
        if (c.newItems.length) { c.heroItem(c.st, 'rare'); c.goldIs(0); return 'best'; }
        c.goldIs(-30); c.noItems(); return 'arson';
      } },
      { branches: ['calm', 'hellhounds'], check: function (c) {
        c.goldIs(c.learnGold(c.st)); c.noLevels(); c.hpSame();
        if (c.fight) { c.fightIs('normal'); return 'hellhounds'; }
        c.noFight(); return 'calm';
      } },
      det(function (c) { c.healAll(0.3); c.goldIs(0); c.noLevels(); c.noFight(); c.noItems(); }),
    ],
  };

  /** Resolve every choice of `def` from `base` over seeds until every required branch was seen; check each outcome. */
  function exercise(t, def, base, star, stats) {
    const spec = SPEC[def.id];
    if (!t.ok(spec && spec.length === def.choices.length, def.id + ': has a checker for each of its ' + def.choices.length + ' choices')) return;
    def.choices.forEach(function (choice, ci) {
      const sp = spec[ci];
      const need = sp.branches.slice();
      const seen = {};
      const maxSeeds = need.length > 1 || (sp.optional && sp.optional.length) ? 48 : 2;
      for (let k = 0; k < maxSeeds; k++) {
        const s = fromBase(base, def.id + ':' + ci + ':' + k);
        DD.Run.openEvent(def.id, null, { noShow: true });
        const ev = DD.Run.currentEvent();
        if (!t.ok(ev && ev.choices[ci] && !ev.choices[ci].disabled, def.id + ' choice ' + ci + ' is available')) return;
        const b = snap(s);
        const out = DD.Run.chooseEventOption(ci);
        const label = def.id + ' #' + ci + ' (' + choice.label + ') seed ' + k;
        if (!t.ok(out && typeof out.text === 'string' && out.text.length > 20 && !BAD_TEXT.test(out.text) && !BAD_PUNCT.test(out.text), label + ': outcome text "' + (out && out.text) + '"')) continue;
        t.ok(out.text.indexOf('steps in') < 0, label + ': no stand-in needed');
        t.ok(!V1_TALK.test(out.text), label + ': no v1 talk in "' + out.text + '"');
        t.eq(lowerStarts(out.text).join(' | '), '', label + ': sentences start uppercase in "' + out.text + '"');
        if (def.hero) t.eq(wrongPronouns(out.text, HERO_NAMES[def.hero], def.hero).join(' | '), '', label + ': ' + HERO_NAMES[def.hero] + '\'s own pronouns');
        const a = snap(s);
        t.ok(s.gold >= 0 && s.party.every(function (h) { return h.dead || h.hp >= 1; }), label + ': gold >= 0 and nobody dies');
        const branch = sp.check(makeCtx(t, label, b, a, out, s, star));
        t.ok(need.indexOf(branch) >= 0 || (sp.optional || []).indexOf(branch) >= 0, label + ': known branch ' + branch);
        seen[branch] = (seen[branch] || 0) + 1;
        stats.resolved++;
        if (need.every(function (n) { return seen[n]; }) && k >= 1 && !(sp.optional && sp.optional.some(function (o) { return !seen[o]; }) && k < 24)) break;
      }
      need.forEach(function (n) { t.ok(seen[n], def.id + ' #' + ci + ': branch "' + n + '" reached (seen ' + JSON.stringify(seen) + ')'); });
      if (sp.optional) t.log(def.id + ' #' + ci + ' branches seen: ' + JSON.stringify(seen));
      stats.branches += Object.keys(seen).length;
    });
  }

  // =================================================================================================================
  // Events
  // =================================================================================================================

  T.suite('narrative: events — registry, copy and hero events', function (t) {
    const evs = ours();
    t.ok(evs.length >= 35, evs.length + ' events registered (ev_*)');
    const acts = { 1: 0, 2: 0, 3: 0 };
    evs.forEach(function (ev) {
      const L = 'event ' + ev.id;
      t.ok(typeof ev.title === 'string' && ev.title.length >= 4 && ev.title.length <= 40, L + ': title "' + ev.title + '"');
      t.ok(typeof ev.icon === 'string' && ev.icon.length > 0 && ev.icon.length <= 4, L + ': one emoji icon');
      t.ok(Array.isArray(ev.acts) && ev.acts.length && ev.acts.every(function (a) { return a >= 1 && a <= 3; }), L + ': acts ' + JSON.stringify(ev.acts));
      t.ok(ev.unique !== false, L + ': unique');
      const text = typeof ev.text === 'function' ? ev.text(null) : ev.text;
      t.ok(typeof text === 'string' && text.length >= 120 && text.length <= 600 && !BAD_TEXT.test(text), L + ': text (' + (text || '').length + ' chars)');
      const sentenceCount = (String(text).match(/[.!?]["”)]?(?=\s+["“A-Z(]|\s*$)/g) || []).length;
      t.ok(sentenceCount >= 2 && sentenceCount <= 5, L + ': ' + sentenceCount + ' sentences (DESIGN: 2-5)');
      t.ok(Array.isArray(ev.choices) && ev.choices.length >= 2 && ev.choices.length <= 3, L + ': 2-3 choices');
      // v2: no XP, telegraphs, intents or Guard anywhere in the copy
      [ev.title, text].concat(ev.choices.map(function (ch) { return ch.label; }), ev.choices.map(function (ch) { return ch.hint; })).forEach(function (s) {
        t.ok(!V1_TALK.test(String(s)), L + ': no v1 talk in "' + s + '"');
      });
      ev.choices.forEach(function (ch, i) {
        t.ok(typeof ch.label === 'string' && ch.label.length >= 3 && ch.label.length <= 40, L + ' choice ' + i + ': label "' + ch.label + '"');
        t.ok(typeof ch.hint === 'string' && ch.hint.length >= 8 && ch.hint.length <= 170 && !BAD_TEXT.test(ch.hint), L + ' choice ' + i + ': hint "' + ch.hint + '"');
        t.ok(typeof ch.resolve === 'function', L + ' choice ' + i + ': resolve');
        t.ok(!/levels? up/.test(ch.hint) || ch.hint.indexOf(ROTATION_HINT) >= 0 || /^[A-Z][\w ]+ levels up\./.test(ch.hint), L + ' choice ' + i + ': a level-up is either the rotation or a named hero ("' + ch.hint + '")');
      });
      t.ok(ev.choices.some(function (ch) { return /\d+%|Pay \d+ gold|loses?|Fight|scar/i.test(ch.hint); }), L + ': at least one risk / reward trade');
      t.ok(ev.choices.some(function (ch) { return !/^Pay /.test(ch.hint); }), L + ': at least one choice is free');
      ev.acts.forEach(function (a) { if (!ev.hero) acts[a]++; });
    });
    [1, 2, 3].forEach(function (a) { t.ok(acts[a] >= 8, 'act ' + a + ' has ' + acts[a] + ' generic events'); });
    // at least one hero event per hero, gated on that hero, showing its portrait, using its pronouns
    heroEventList().forEach(function (he) {
      const hid = he.hero;
      const ev = DD.getEvent(he.id);
      if (!t.ok(ev, hid + ': hero event ' + he.id)) return;
      t.eq(ev.hero, hid, hid + ': event portrait hero');
      t.eq(ev.weight, 2, hid + ': hero events turn up a little more often (weight 2)');
      t.ok(typeof ev.requires === 'function', hid + ': requires its hero');
      t.ok(ev.acts.length === 3, hid + ': offered in every act');
      t.ok(ev.choices.every(function (ch) { return ch.hint.indexOf(HERO_NAMES[hid]) >= 0 || /every hero|Every hero|Pay \d+ gold|Fight|gain \d+ gold|Gain \d+ gold|random consumable|One hero levels up/.test(ch.hint); }),
        hid + ': hints name the hero they reward');
      t.ok(ev.choices.some(function (ch) { return ch.hint.indexOf(HERO_NAMES[hid]) >= 0; }), hid + ': at least one choice rewards ' + HERO_NAMES[hid]);
      const copy = [ev.text].concat(ev.choices.map(function (ch) { return ch.hint; }));
      copy.forEach(function (s) { t.eq(wrongPronouns(s, HERO_NAMES[hid], hid).join(' | '), '', hid + ': ' + (SHE.indexOf(hid) >= 0 ? 'she/her' : 'he/him') + ' in "' + s.slice(0, 60) + '…"'); });
    });
    t.eq(evs.filter(function (ev) { return ev.hero; }).length, heroEventList().length, 'hero events: ' + heroEventList().length);
    Object.keys(HERO_EVENTS).forEach(function (hid) {
      t.ok(evs.some(function (ev) { return ev.hero === hid; }), hid + ': has a hero event');
    });
    // the six heroes of the v2 roster have exactly one event each, and theirs is about them
    ['kiri', 'betty', 'basanos', 'valdris', 'hjalmar', 'pebbles'].forEach(function (hid) {
      const evh = evs.filter(function (ev) { return ev.hero === hid; });
      t.eq(evh.length, 1, hid + ': one event');
      if (evh[0]) t.ok(evh[0].text.indexOf(HERO_NAMES[hid]) >= 0, hid + ': the event text features ' + HERO_NAMES[hid]);
    });
    t.ok(/"It's a family name[.,]"/.test((DD.getEvent('ev_bet_family_reunion') || {}).text || ''), 'Betty: "It\'s a family name."');
    // ids are unique and prefixed
    t.ok(evs.every(function (ev) { return /^ev_[a-z0-9_]+$/.test(ev.id); }), 'ids are ev_snake_case');
  });

  T.suite('narrative: events — text, requires and gold costs through the run API', function (t) {
    runLab(t, function () {
      const party = companions();
      const base = baseRun(party, 1, 'narr:req:' + t.seed);
      ours().forEach(function (ev) {
        const act = ev.acts[0];
        const s = fromBase(base, 'req:' + ev.id);
        s.act = act;
        // generic events are offered in their acts; hero events only with their hero
        t.eq(DD.RunMap.eventAvailable(ev, act, s), !ev.hero, ev.id + ': available to a fixture party: ' + !ev.hero);
        if (!ev.hero) t.ok(!DD.RunMap.eventAvailable(ev, [1, 2, 3].filter(function (a) { return ev.acts.indexOf(a) < 0; })[0] || 99, s) || ev.acts.length === 3, ev.id + ': not offered outside its acts');
        t.ok(DD.Run.openEvent(ev.id, null, { noShow: true }), ev.id + ': opens');
        const cur = DD.Run.currentEvent();
        t.ok(cur && cur.id === ev.id && cur.text.length > 50 && !BAD_TEXT.test(cur.text) && cur.title === ev.title, ev.id + ': currentEvent text');
        ev.choices.forEach(function (ch, i) {
          const m = /^Pay (\d+) gold/.exec(ch.hint);
          if (!m) { t.ok(!cur.choices[i].disabled, ev.id + ' #' + i + ': free choice enabled'); return; }
          const cost = +m[1];
          t.ok(typeof ch.requires === 'function', ev.id + ' #' + i + ': a gold cost needs requires()');
          s.gold = cost - 1;
          t.ok(DD.Run.currentEvent().choices[i].disabled, ev.id + ' #' + i + ': locked at ' + (cost - 1) + ' gold');
          t.eq(DD.Run.chooseEventOption(i), null, ev.id + ' #' + i + ': a locked choice does not resolve');
          s.gold = cost;
          const scarNeeded = /scarred hero/.test(ch.hint);
          t.eq(DD.Run.currentEvent().choices[i].disabled, false, ev.id + ' #' + i + ': open at ' + cost + ' gold' + (scarNeeded ? ' (with a scarred hero)' : ''));
          s.gold = 200;
        });
      });
      // the scar-gated appeal locks without scars
      const clean = baseRun(party, 3, 'narr:noscar:' + t.seed, { scars: false });
      fromBase(clean, 'noscar');
      DD.Run.openEvent('ev_rules_lawyer', null, { noShow: true });
      t.ok(DD.Run.currentEvent().choices[0].disabled, 'ev_rules_lawyer #0: needs a scarred hero');
    });
  });

  function generic(t, acts) {
    runLab(t, function () {
      const party = companions();
      const stats = { resolved: 0, branches: 0 };
      ours().filter(function (ev) { return !ev.hero && acts.indexOf(ev.acts[0]) >= 0; }).forEach(function (ev) {
        const base = baseRun(party, ev.acts[0], 'narr:' + t.seed + ':' + ev.id);
        exercise(t, ev, base, -1, stats);
      });
      t.log(stats.resolved + ' resolutions, ' + stats.branches + ' branches');
      t.ok(stats.resolved > 0, 'resolved something');
    });
  }
  T.suite('narrative: generic events (acts 1+) — outcomes match their hints', function (t) { generic(t, [1]); });
  T.suite('narrative: generic events (acts 2-3) — outcomes match their hints', function (t) { generic(t, [2, 3]); });

  T.suite('narrative: events — every outcome gives the real heroes their own pronouns', function (t) {
    runLab(t, function () {
      // mostly she/her heroes, so a stray "he ... his" after a hero's name shows up (and one he/him for the reverse)
      const mixed = ['kiri', 'ellaria', 'sparrow', 'betty'];
      let checkedN = 0;
      ours().forEach(function (ev) {
        const party = ev.hero ? [ev.hero].concat(mixed.filter(function (h) { return h !== ev.hero; })).slice(0, 4) : mixed;
        const base = baseRun(party, ev.acts[0], 'narr:pron:' + t.seed + ':' + ev.id);
        ev.choices.forEach(function (ch, ci) {
          for (let k = 0; k < 8; k++) {
            const s = fromBase(base, 'pron:' + ev.id + ':' + ci + ':' + k);
            DD.Run.openEvent(ev.id, null, { noShow: true });
            const out = DD.Run.chooseEventOption(ci);
            if (!out) continue;
            s.party.forEach(function (rh) {
              if (!HERO_NAMES[rh.id]) return;
              const bad = wrongPronouns(out.text, HERO_NAMES[rh.id], rh.id);
              t.eq(bad.join(' | '), '', ev.id + ' #' + ci + ' seed ' + k + ': ' + HERO_NAMES[rh.id] + ' (' + (SHE.indexOf(rh.id) >= 0 ? 'she' : 'he') + ')');
            });
            checkedN++;
          }
        });
      });
      t.log(checkedN + ' outcomes checked');
    });
  });

  T.suite('narrative: hero events — outcomes with and without the hero', function (t) {
    runLab(t, function () {
      const stats = { resolved: 0, branches: 0 };
      heroEventList().forEach(function (he) {
        const hid = he.hero;
        const def = DD.getEvent(he.id);
        if (!t.ok(def && DD.getHero(hid), hid + ': event ' + he.id + ' + hero')) return;
        const party = [hid].concat(companions(hid).slice(0, 3));
        const base = baseRun(party, 1, 'narr:' + t.seed + ':' + hid);
        DD.Run.state = DD.util.deepClone(base);
        t.ok(DD.RunMap.eventAvailable(def, 1, DD.Run.state), hid + ': offered while ' + HERO_NAMES[hid] + ' is in the party');
        exercise(t, def, base, 0, stats);
        // a dead hero does not count
        const dead = DD.util.deepClone(base);
        dead.party[0].dead = true;
        dead.party[0].hp = 0;
        t.ok(!DD.RunMap.eventAvailable(def, 1, dead), hid + ': not offered once ' + HERO_NAMES[hid] + ' is dead');
        // without the hero: not offered, and a forced open still resolves every choice with a stand-in
        const without = baseRun(companions(hid), 1, 'narr:' + t.seed + ':no-' + hid);
        DD.Run.state = DD.util.deepClone(without);
        t.ok(!DD.RunMap.eventAvailable(def, 1, DD.Run.state), hid + ': not offered without ' + HERO_NAMES[hid]);
        def.choices.forEach(function (ch, ci) {
          const s = fromBase(without, 'no:' + hid + ':' + ci);
          DD.Run.openEvent(def.id, null, { noShow: true });
          const out = t.tryRun(def.id + ' #' + ci + ' without the hero', function () { return DD.Run.chooseEventOption(ci); });
          t.ok(out && out.text.indexOf('steps in') > 0 && !BAD_TEXT.test(out.text), def.id + ' #' + ci + ' without ' + hid + ': a stand-in steps in ("' + (out && out.text.slice(0, 80)) + '")');
          t.ok(s.gold >= 0 && s.party.every(function (h) { return h.hp >= 1; }), def.id + ' #' + ci + ' without the hero: state sane');
        });
      });
      t.log(stats.resolved + ' resolutions, ' + stats.branches + ' branches');
    });
  });

  T.suite('narrative: events — level-ups go through the DM\'s rotation (named ones are rare)', function (t) {
    // static: which hints promise a level-up
    const rotation = [];
    const named = [];
    ours().forEach(function (ev) {
      ev.choices.forEach(function (ch, i) {
        if (ch.hint.indexOf(ROTATION_HINT) >= 0) rotation.push(ev.id + ' #' + i);
        const m = /^([A-Z][\w ]+) levels up\./.exec(ch.hint);
        if (m) named.push({ ev: ev, i: i, who: m[1] });
      });
    });
    t.ok(rotation.length >= 6 && rotation.length <= 12, rotation.length + ' rotation level-ups: ' + rotation.join(', '));
    t.ok(named.length >= 1 && named.length <= 4, 'named level-ups are rare: ' + named.length);
    named.forEach(function (n) { t.ok(n.ev.hero && HERO_NAMES[n.ev.hero] === n.who, n.ev.id + ' #' + n.i + ': a named level-up only for its own hero (' + n.who + ')'); });
    t.eq(named.map(function (n) { return n.ev.id; }).sort().join(','), NAMED_LEVEL_UPS.slice().sort().join(','), 'the named level-ups');
    runLab(t, function () {
      const party = companions();
      /** Resolve choice ci of event id from base over n seeds; returns [{ idx, text }] of the heroes who leveled. */
      function roll(base, id, ci, n, tag) {
        const out = [];
        for (let k = 0; k < n; k++) {
          const s = fromBase(base, tag + ':' + k);
          DD.Run.openEvent(id, null, { noShow: true });
          const before = s.party.map(function (h) { return h.level; });
          const r = DD.Run.chooseEventOption(ci);
          const ups = [];
          s.party.forEach(function (h, i) { if (h.level !== before[i]) ups.push(i); });
          out.push({ ups: ups, text: (r && r.text) || '', s: s, before: before });
        }
        return out;
      }
      // two heroes behind: always one of them, both over the seeds, and the DM flips a coin
      const two = roll(baseRun(party, 1, 'narr:rot2:' + t.seed, { levels: [3, 2, 2, 3] }), 'ev_session_cancelled', 2, 24, 'rot2');
      t.ok(two.every(function (r) { return r.ups.length === 1 && (r.ups[0] === 1 || r.ups[0] === 2); }), 'two behind: always hero 1 or 2 (' + two.map(function (r) { return r.ups.join('+'); }).join(' ') + ')');
      t.ok(two.some(function (r) { return r.ups[0] === 1; }) && two.some(function (r) { return r.ups[0] === 2; }), 'two behind: both get a turn over the seeds');
      t.ok(two.every(function (r) { return /flips a coin for it: (heads|tails)!/.test(r.text); }), 'two behind: the DM flips a coin');
      // everyone level: a d4 over the whole party, every face over the seeds
      const all = roll(baseRun(party, 1, 'narr:rot4:' + t.seed, { levels: [1, 1, 1, 1] }), 'ev_mimic_meeting', 0, 40, 'rot4');
      const hit = {};
      all.forEach(function (r) { if (r.ups.length === 1) hit[r.ups[0]] = true; });
      t.ok(all.every(function (r) { return r.ups.length === 1 && /rolls a d4 for it: [1-4]!/.test(r.text); }), 'level party: one hero, the DM rolls a d4');
      t.eq(Object.keys(hit).length, 4, 'level party: every hero is drawn over the seeds (' + Object.keys(hit).join(',') + ')');
      // one hero behind: that hero, no die
      const one = roll(baseRun(party, 1, 'narr:rot1:' + t.seed, { levels: [4, 4, 3, 4] }), 'ev_infernal_dmv', 0, 4, 'rot1');
      t.ok(one.every(function (r) { return r.ups.length === 1 && r.ups[0] === 2 && !/ for it: /.test(r.text); }), 'one behind: always that hero, no roll');
      t.ok(one.every(function (r) { return r.text.indexOf(DD.Run.heroName(2) + ' levels up to level 4.') >= 0; }), 'one behind: the text names the new level');
      // level-ups resolve last: a rotation choice's HP cost is a share of the max HP shown when the player chose
      [['ev_infernal_dmv', 0, 0.2], ['ev_mimic_meeting', 0, 0.1], ['ev_career_fair', 0, 0.15], ['ev_syl_rap_battle', 1, 0.1]].forEach(function (x) {
        if (!DD.getEvent(x[0])) return;
        const ls = fromBase(baseRun(party, 1, 'narr:last:' + t.seed, { levels: [4, 4, 3, 4] }), 'last:' + x[0]);
        const lh = ls.party[2];
        const m0 = DD.Run.heroStats(lh).maxHp, h0 = lh.hp;
        DD.Run.openEvent(x[0], null, { noShow: true });
        DD.Run.chooseEventOption(x[1]);
        const grew = DD.Run.heroStats(lh).maxHp - m0;
        const want = Math.min(Math.max(1, Math.round(m0 * x[2])), h0 - 1);
        t.ok(lh.level === 4 && grew > 0 && h0 - (lh.hp - grew) === want, x[0] + ': the leveled hero loses ' + x[2] + ' of the max HP before the level-up (' +
          m0 + ' max, ' + h0 + ' -> ' + lh.hp + ', grew ' + grew + ', expected -' + want + ')');
      });
      // a named level-up jumps the rotation (it is that hero's event); the party is still at most two levels apart
      if (DD.getHero('marwyn')) {
        const mb = baseRun(['marwyn'].concat(companions('marwyn').slice(0, 3)), 1, 'narr:named:' + t.seed, { levels: [3, 2, 2, 2] });
        const m = roll(mb, 'ev_mrw_mirror', 2, 3, 'named');
        t.ok(m.every(function (r) { return r.ups.length === 1 && r.ups[0] === 0 && r.s.party[0].level === 4; }), 'Marwyn levels up to 4 although others are at 2');
      }
      // a level-up from an event is a real one: HP growth now, a pending level-up choice for the level-up screen
      const g = roll(baseRun(party, 1, 'narr:grow:' + t.seed, { levels: [2, 1, 2, 2] }), 'ev_session_cancelled', 2, 1, 'grow')[0];
      const rh = g.s.party[1];
      t.ok(g.ups[0] === 1 && rh.level === 2 && rh.pendingLevels === 1, 'the leveled hero has a level-up choice waiting (' + rh.pendingLevels + ')');
    });
  });

  T.suite('narrative: events — fallbacks (full pockets, full sockets, max level, no scars)', function (t) {
    runLab(t, function () {
      const party = companions();
      // full pockets: every consumable is sold for 15 gold
      const anyCons = Object.keys(DD.defs.consumables)[0];
      const base = baseRun(party, 2, 'narr:fb:' + t.seed);
      if (anyCons) {
        const s = fromBase(base, 'pockets');
        while (s.consumables.length < s.maxConsumables) s.consumables.push(anyCons);
        DD.Run.openEvent('ev_fountain_youth', null, { noShow: true });
        const g0 = s.gold, c0 = s.consumables.length;
        const out = DD.Run.chooseEventOption(1);
        t.eq(s.gold - g0, 2 * POCKET_GOLD, 'full pockets: both flasks sold for ' + POCKET_GOLD + ' gold each');
        t.eq(s.consumables.length, c0, 'full pockets: nothing added');
        t.ok(/sell/.test(out.text), 'full pockets: the outcome says so ("' + out.text.slice(-60) + '")');
      }
      // four sockets: a learned skill waits for the forget-or-skip prompt
      const s2 = fromBase(base, 'sockets');
      const rh = s2.party[0];
      DD.Run.learnableSkills(0).forEach(function (id) { if (rh.skills.length < 4) rh.skills.push({ id: id, level: 1 }); });
      if (rh.skills.length === 4 && DD.Run.learnableSkills(0).length) {
        s2.party.slice(1).forEach(function (h) { h.dead = true; h.hp = 0; });   // the reader is hero 0
        DD.Run.openEvent('ev_overdue_book', null, { noShow: true });
        const before = s2.learnQueue.length;
        const out = DD.Run.chooseEventOption(0);
        t.eq(s2.learnQueue.length, before + 1, 'four sockets: the new skill is queued');
        t.ok(/forget a skill/.test(out.text), 'four sockets: the outcome explains the prompt');
      } else t.log('fixture hero pool too small for the queued-learn check');
      // everything maxed and nothing left to learn: the consolation gold
      const s3 = fromBase(base, 'maxed');
      const r3 = s3.party[0];
      s3.party.slice(1).forEach(function (h) { h.dead = true; h.hp = 0; });
      const own = DD.Run.learnableSkills(0);
      own.forEach(function (id) { r3.skills.push({ id: id, level: 1 }); });
      r3.skills.forEach(function (k) { k.level = (DD.getSkill(k.id) && DD.getSkill(k.id).levels.length) || 1; });
      if (!DD.Run.learnableSkills(0, { generic: true }).length) {
        DD.Run.openEvent('ev_overdue_book', null, { noShow: true });
        const g3 = s3.gold;
        const out = DD.Run.chooseEventOption(0);
        t.eq(s3.gold - g3, CONSOLATION_GOLD, 'nothing to learn or upgrade: ' + CONSOLATION_GOLD + ' gold instead');
        t.ok(/gold instead\./.test(out.text), 'and the outcome says so');
      } else t.log('generic skills registered: the consolation path is unreachable for this hero');
      // everyone at the max level: a rotation level-up pays the consolation instead
      const top = DD.Run.MAX_LEVEL || 10;
      const maxed = baseRun(party, 1, 'narr:top:' + t.seed, { levels: [top, top, top, top] });
      const s5 = fromBase(maxed, 'top');
      DD.Run.openEvent('ev_mimic_meeting', null, { noShow: true });
      const g5 = s5.gold;
      const out5 = DD.Run.chooseEventOption(0);
      t.ok(s5.party.every(function (h) { return h.level === top; }) && s5.gold - g5 === CONSOLATION_GOLD && /already at the max level, so the DM slides over \d+ gold instead\./.test(out5.text),
        'everyone maxed: ' + CONSOLATION_GOLD + ' gold instead of a level ("' + out5.text.slice(-90) + '")');
      // a named hero at the max level: the same
      if (DD.getHero('josiah')) {
        const jb = baseRun(['josiah'].concat(companions('josiah').slice(0, 3)), 1, 'narr:jtop:' + t.seed, { levels: [top, 1, 1, 1] });
        const sj = fromBase(jb, 'jtop');
        DD.Run.openEvent('ev_jos_rat_union', null, { noShow: true });
        const gj = sj.gold;
        const outj = DD.Run.chooseEventOption(2);
        t.ok(sj.party.every(function (h, i) { return h.level === (i ? 1 : top); }) && sj.gold - gj === CONSOLATION_GOLD && /Josiah is already at the max level/.test(outj.text),
          'a maxed named hero: the consolation, nobody else levels ("' + outj.text.slice(0, 120) + '")');
      }
      // retcon without scars pays out
      const clean = baseRun(party, 2, 'narr:clean:' + t.seed, { scars: false });
      const s4 = fromBase(clean, 'retcon');
      DD.Run.openEvent('ev_retcon', null, { noShow: true });
      const g4 = s4.gold;
      DD.Run.chooseEventOption(1);
      t.eq(s4.gold - g4, 40, 'retcon without scars: 40 gold');
      // Dale without scars leaves a note (and some ghost money)
      const sd = fromBase(clean, 'dale');
      DD.Run.openEvent('ev_cursed_clearance', null, { noShow: true });
      const gd = sd.gold;
      t.ok(/polite note/.test(DD.Run.chooseEventOption(2).text) && sd.gold - gd === 25, 'Dale without scars: polite note and 25 gold');

      // a skill name with its own punctuation ("Fetch!") still ends the sentence once
      const s6 = fromBase(base, 'punct');
      s6.party.slice(1).forEach(function (h) { h.dead = true; h.hp = 0; });
      const renamed = DD.Run.learnableSkills(0).map(function (id) { const d = DD.getSkill(id); const was = d.name; d.name = was + '!'; return { d: d, was: was }; });
      try {
        if (renamed.length && s6.party[0].skills.length < 4) {
          DD.Run.openEvent('ev_overdue_book', null, { noShow: true });
          const out = DD.Run.chooseEventOption(0);
          t.ok(out && /learns [^.]+!$/.test(out.text) && !BAD_PUNCT.test(out.text), 'a name ending in "!" ends the sentence once ("' + (out && out.text.slice(-50)) + '")');
        } else t.log('no learnable skill for the punctuation check');
      } finally { renamed.forEach(function (r) { r.d.name = r.was; }); }

      // two of the same consumable read "two X", not "X and X"
      const droppable = Object.keys(DD.defs.consumables).filter(function (id) { return !DD.defs.consumables[id].noDrop; });
      if (droppable.length) {
        const saved = DD.defs.consumables;
        const one = {};
        one[droppable[0]] = saved[droppable[0]];
        DD.defs.consumables = one;
        try {
          fromBase(base, 'tally');
          DD.Run.openEvent('ev_fountain_youth', null, { noShow: true });
          const nm = one[droppable[0]].name;
          const out = DD.Run.chooseEventOption(1);
          t.ok(out && out.text.indexOf('two ' + nm) >= 0 && out.text.indexOf(nm + ' and ' + nm) < 0, 'duplicates are counted ("' + (out && out.text.slice(-60)) + '")');
        } finally { DD.defs.consumables = saved; }
      }

      // every consumable reward still reads as a sentence when the pockets are full
      if (anyCons) {
        ours().filter(function (ev) { return ev.choices.some(function (ch) { return /consumable/.test(ch.hint); }); }).forEach(function (ev) {
          const p = ev.hero ? [ev.hero].concat(companions(ev.hero).slice(0, 3)) : party;
          const b2 = baseRun(p, ev.acts[0], 'narr:full:' + t.seed + ':' + ev.id);
          ev.choices.forEach(function (ch, ci) {
            if (!/consumable/.test(ch.hint)) return;
            const s = fromBase(b2, 'full:' + ev.id + ':' + ci);
            while (s.consumables.length < s.maxConsumables) s.consumables.push(anyCons);
            DD.Run.openEvent(ev.id, null, { noShow: true });
            const out = DD.Run.chooseEventOption(ci);
            const ok = !!out && /(?:[:;]\s+y|[.!?]\s+Y|^Y)our pockets are full/.test(out.text) && !BAD_PUNCT.test(out.text);
            t.ok(ok, ev.id + ' #' + ci + ' with full pockets: "' + (out && out.text) + '"');
          });
        });
      }

      // Zarathor's exploding cart at 1 HP (event damage never goes below 1): no "loses 0 HP"
      if (DD.getHero('zarathor')) {
        const zb = baseRun(['zarathor'].concat(companions('zarathor').slice(0, 3)), 1, 'narr:zar1:' + t.seed);
        zb.party[0].hp = 1;
        let boom = null;
        for (let k = 0; k < 24 && !boom; k++) {
          const s = fromBase(zb, 'zar1:' + k);
          DD.Run.openEvent('ev_zar_bling_merchant', null, { noShow: true });
          const out = DD.Run.chooseEventOption(1);
          if (out && /explodes/.test(out.text)) boom = { out: out, hp: s.party[0].hp };
        }
        t.ok(boom && boom.hp === 1 && boom.out.text.indexOf('loses 0 HP') < 0 && /already at 1 HP/.test(boom.out.text),
          'the cart explodes on a 1-HP Zarathor: "' + (boom && boom.out.text) + '"');
      }

      // Corelos already owes the DM: the fine print finds him another scar
      if (DD.getScar(DEBT_SCAR) && DD.getHero('corelos')) {
        const cb = baseRun(['corelos'].concat(companions('corelos').slice(0, 3)), 1, 'narr:owes:' + t.seed);
        const s7 = fromBase(cb, 'owes');
        s7.party[0].scars = [DEBT_SCAR];
        DD.Run.openEvent('ev_cor_fine_print', null, { noShow: true });
        const out = DD.Run.chooseEventOption(0);
        const sc = s7.party[0].scars;
        t.ok(sc.length === 2 && sc[0] === DEBT_SCAR && sc[1] !== DEBT_SCAR && out.text.indexOf(DD.getScar(sc[1]).name) >= 0,
          'already owes: another scar, named in the outcome (' + sc.join(',') + ')');
      }
      // Valdris's ego is already bruised: the haircut costs him another scar
      if (DD.getScar(EGO_SCAR) && DD.getHero('valdris')) {
        const vb = baseRun(['valdris'].concat(companions('valdris').slice(0, 3)), 1, 'narr:ego:' + t.seed);
        const s8 = fromBase(vb, 'ego');
        s8.party[0].scars = [EGO_SCAR];
        DD.Run.openEvent('ev_val_forge_god', null, { noShow: true });
        const out = DD.Run.chooseEventOption(0);
        const sc = s8.party[0].scars;
        t.ok(sc.length === 2 && sc[0] === EGO_SCAR && sc[1] !== EGO_SCAR && out.text.indexOf(DD.getScar(sc[1]).name) >= 0,
          'ego already bruised: another scar, named in the outcome (' + sc.join(',') + ')');
      }
    });
  });

  T.suite('narrative: event fights start and auto-battle', function (t) {
    if (!DD.AutoPlay || !DD.Combat || !DD.Encounter) { t.skip('engine not loaded'); return; }
    runLab(t, function () {
      const party = companions();
      [['ev_snack_run', 2, 2, 'normal'], ['ev_overdue_book', 2, 2, 'elite']].forEach(function (x) {
        const base = baseRun(party, x[1], 'narr:fight:' + t.seed + ':' + x[0]);
        const s = fromBase(base, 'fight:' + x[0]);
        s.party.forEach(function (h) { h.hp = DD.Run.heroStats(h).maxHp; });
        DD.Run.openEvent(x[0], null, { noShow: true });
        const out = DD.Run.chooseEventOption(x[2]);
        t.ok(out && out.combat && out.combat.kind === x[3], x[0] + ': queues a ' + x[3] + ' fight');
        const cs = DD.Run.startQueuedCombat();
        if (!t.ok(cs && DD.Combat.state === cs, x[0] + ': the fight starts')) return;
        t.eq(cs.kind, x[3], x[0] + ': fight kind');
        const enc = cs.encounter;
        t.ok(enc && enc.kind === x[3] && enc.act === x[1], x[0] + ': encounter ' + (enc && enc.id) + ' matches act ' + x[1] + ' / ' + x[3]);
        const res = DD.AutoPlay.runBattle(30);
        t.ok(res && (res.result === 'victory' || res.result === 'defeat'), x[0] + ': auto-battle ends (' + JSON.stringify(res) + ')');
        t.ok(DD.Run.state.over || (DD.Run.state.pending && DD.Run.state.pending.type === 'rewards'), x[0] + ': the run moves on to rewards (or the end)');
        t.eq(DD.Run.state.queuedCombat, null, x[0] + ': the queued fight is consumed');
      });
    });
  });

  // =================================================================================================================
  // Narration
  // =================================================================================================================

  T.suite('narrative: narration — every key, line counts, tokens (static)', function (t) {
    const N = DD.Narrator;
    if (!t.ok(N && N.TOKENS && N.LINES, 'DD.Narrator')) return;
    t.eq(N.KEYS.slice().sort().join(','), NARRATION_KEYS.slice().sort().join(','), 'the token table covers exactly the §3.10 keys + initiative + objective_failed');
    // a lost objective is not a TPK: its lines never say everybody is down, and the TPK key keeps its punchlines
    (N.LINES.objective_failed || []).forEach(function (l) {
      t.ok(!/total party kill|\bTPK\b|everybody is down|campaign ended|spare character sheets/i.test(l), 'objective_failed: the party still stands in "' + l + '"');
    });
    NARRATION_KEYS.forEach(function (k) {
      const mine = N.LINES[k] || [];
      const min = k === 'tips' ? 30 : 8;
      t.ok(mine.length >= min, k + ': ' + mine.length + ' lines (>= ' + min + ')');
      const reg = DD.defs.narration[k] || [];
      t.ok(mine.every(function (l) { return reg.indexOf(l) >= 0; }), k + ': registered');
      t.eq(mine.filter(function (l, i) { return mine.indexOf(l) !== i; }).length, 0, k + ': no duplicate lines');
      const maxLen = k === 'tips' ? 140 : /title/.test(k) ? 50 : 150;
      mine.forEach(function (l) {
        t.ok(typeof l === 'string' && l.trim() === l && l.length >= 8 && l.length <= maxLen && !/undefined|NaN/.test(l), k + ': line length/shape "' + l + '" (' + l.length + ')');
        t.ok(!V1_TALK.test(l), k + ': no v1 talk (XP, telegraphs, intents, Guard, red tiles) in "' + l + '"');
      });
      t.eq(N.badTokens(k, mine).length, 0, k + ': my lines only use tokens its callers fill ' + JSON.stringify(N.TOKENS[k]) + ' — ' + N.badTokens(k, mine).join(' | '));
      // other authors' lines on the same keys: advisory only
      const others = reg.filter(function (l) { return mine.indexOf(l) < 0; });
      const theirs = N.badTokens(k, others);
      if (theirs.length) DD.warn('content advisory — narration "' + k + '" has lines with unfilled tokens: ' + theirs.slice(0, 3).join(' | '));
      // variety: none of my lines repeats 5 words in a row of another line on its key (mine: a failure; theirs: advisory).
      // Tips are exempt: they repeat exact mechanics phrasing on purpose ("25% of their max HP").
      if (k !== 'tips') mine.forEach(function (l, i) {
        const g = grams(l);
        const twin = mine.filter(function (o, j) { return j !== i && grams(o).some(function (x) { return g.indexOf(x) >= 0; }); });
        t.eq(twin.length, 0, k + ': "' + l + '" is not a near-repeat of ' + JSON.stringify(twin));
        const near = others.filter(function (o) { return grams(o).some(function (x) { return g.indexOf(x) >= 0; }); });
        if (near.length) DD.warn('content advisory — narration "' + k + '": "' + l + '" nearly repeats "' + near[0] + '"');
      });
      // a line that names {hero} never guesses a pronoun for them (callers pass a name only; heroes are he or she)
      mine.forEach(function (l) {
        sentences(l).forEach(function (sen) {
          const at = sen.indexOf('{hero}');
          if (at < 0) return;
          const words = sen.slice(at).toLowerCase().match(/[a-z]+/g) || [];
          const bad = words.filter(function (w) { return HE_WORDS.indexOf(w) >= 0 || SHE_WORDS.indexOf(w) >= 0 || THEY_WORDS.indexOf(w) >= 0; });
          t.eq(bad.join(','), '', k + ': no pronoun for {hero} in "' + sen + '"');
        });
      });
      // every line fills cleanly with its callers' vars
      const vars = { hero: 'Zarathor', enemy: 'Goblin Grunt', n: 12, gold: 30, name: 'Sparrow' };
      const some = {};
      (N.TOKENS[k] || []).forEach(function (tk) { some[tk] = vars[tk]; });
      mine.forEach(function (l) { t.ok(!/\{\w+\}/.test(DD.util.fmt(l, some)), k + ': fills "' + l + '"'); });
      // no sentence starts lowercase, even with the lowercase values a caller can pass ('gravity', 'the party')
      const low = Object.assign({}, some, LOWER_FILLS[k] || {});
      mine.forEach(function (l) {
        const line = DD.util.fmt(l, low);
        t.eq(lowerStarts(line).length, 0, k + ': sentences start uppercase ("' + line + '")');
      });
    });
    // lines that use a token actually use it somewhere (kill lines name both sides)
    ['kill', 'env_kill', 'overkill'].forEach(function (k) {
      t.ok(N.LINES[k].every(function (l) { return /\{hero\}/.test(l) && /\{enemy\}/.test(l); }), k + ': every line names {hero} and {enemy}');
    });
    t.ok(N.LINES.overkill.every(function (l) { return /\{n\}/.test(l); }), 'overkill lines show the overkill {n}');
    t.ok(N.LINES.round_start.every(function (l) { return /\{n\}/.test(l); }), 'round_start lines show the round {n}');
    t.ok(N.LINES.multi_kill.every(function (l) { return /\{n\}/.test(l); }), 'multi_kill lines show the count {n}');
    t.ok(N.LINES.recruit.every(function (l) { return /\{hero\}/.test(l); }), 'recruit lines name the recruit');
    t.ok(N.LINES.signature.every(function (l) { return /\{hero\}/.test(l); }), 'signature lines name the hero');
    // v2 talk is in: initiative, monsters acting on their turn, wind-ups, attacks of opportunity, the leveling roll
    const all = NARRATION_KEYS.filter(function (k) { return k !== 'tips'; }).reduce(function (acc, k) { return acc.concat(N.LINES[k] || []); }, []).join(' \n ');
    [/initiative/i, /attack of opportunity/i, /wind(?:ing|s)? up|wind-ups/i, /their turn comes up|monster turn/i, /levels? up/i, /Unused AP/i, /Alt/].forEach(function (re) {
      t.ok(re.test(all), 'the DM talks v2: ' + re);
    });
    // DD.narrate end to end
    const line = DD.narrate('kill', { hero: 'Marwyn', enemy: 'a mimic' }, DD.RNG(t.seed));
    t.ok(/Marwyn/.test(line) && /a mimic/.test(line), 'DD.narrate fills tokens: "' + line + '"');
  });

  /** Record every DD.narrate call while fn runs, with a cosmetic RNG that always rolls low (every gate passes). */
  function recordNarration(fn) {
    const calls = [];
    const real = DD.narrate;
    const savedRng = DD.rng;
    const low = DD.RNG(4242);
    low.next = function () { return 0.01; };
    DD.narrate = function (key, vars, rng) {
      const line = real.call(DD, key, vars, rng);
      calls.push({ key: key, vars: Object.assign({}, vars || {}), line: line });
      return line;
    };
    DD.rng = low;
    try { fn(calls); } finally { DD.narrate = real; DD.rng = savedRng; }
    return calls;
  }

  T.suite('narrative: narration tokens are filled in practice (engine, run, screens)', function (t) {
    if (!DD.Combat || !DD.Act || !DD.Run) { t.skip('engine / run not loaded'); return; }
    const A = DD.Act;
    function sb(cfg) { return DD.Combat.sandbox(Object.assign({ w: 9, h: 9, seed: 'narr:' + t.seed, noPlan: true }, cfg)); }
    function H(x, y, id) { return { id: id || 'test_knight', x: x, y: y }; }
    function E(x, y, id) { return { id: id || 'test_grunt', x: x, y: y }; }
    function foes() { return DD.Combat.enemies().filter(function (u) { return !u.dead; }); }
    const calls = recordNarration(function () {
      // combat_start / elite_start / boss_start (+ initiative, fixed and rolled)
      sb({ heroes: [H(1, 4)], enemies: [E(7, 7)], kind: 'elite' });
      sb({ heroes: [H(1, 4)], enemies: [E(7, 7)], kind: 'boss', initiative: 'roll' });
      sb({ w: 10, h: 10, heroes: [H(1, 4), H(1, 6, 'test_mage')],
        enemies: [E(5, 5), E(6, 6), E(7, 1), E(7, 3), E(8, 8), E(6, 2), E(5, 8), E(4, 1)], kind: 'normal' });
      const h = DD.Combat.heroes()[0];
      // round_start + enemy_turn: the heroes pass, the monsters' turns come up (they pass their round-1 turns)
      DD.Combat.endRound();
      DD.Combat.endRound();
      // signature (on the first hero's own turn)
      if (DD.Combat.current() !== h && DD.Combat.giveTurnTo) DD.Combat.giveTurnTo(h);
      DD.Combat.state.hype = 100;
      h.ap = 3;
      if (h.signature) DD.Combat.useSkill(h, h.signature, h.x, h.y);
      // treasure (in-combat chest)
      const spot = DD.Grid.emptyTilesNear(h.x, h.y, 1).filter(function (p) { return !DD.Grid.unitAt(p.x, p.y); })[0];
      if (spot) { A.placeObject(spot.x, spot.y, 'chest'); h.ap = 3; DD.Combat.interact(h, spot.x, spot.y); }
      // hero_downed + hero_revived
      const m = DD.Combat.heroes()[1];
      A.damage(foes()[0] || null, m, 999, { cause: 'skill' });
      A.revive(m, 0.25);
      // a down with nobody to credit (lava, burn ticks): the engine names the culprit 'gravity'
      A.damage(null, m, 999, { cause: 'terrain' });
      A.revive(m, 0.25);
      // overkill, kill, env_kill
      A.damage(h, foes()[0], 99, { cause: 'skill' });
      const f1 = foes()[0];
      A.damage(h, f1, f1.hp, { cause: 'skill' });
      const f2 = foes().filter(function (f) { return f.x < 9 && !DD.Grid.unitAt(f.x + 1, f.y); })[0];
      DD.Grid.tile(f2.x + 1, f2.y).t = 'pit';
      A.push(h, f2, { x: 1, y: 0 }, 1);
      // multi_kill (3 kills inside one skill)
      A.beginSkill(h, DD.getSkill(h.basic.id));
      foes().slice(0, 3).forEach(function (f) { A.damage(h, f, f.hp, { cause: 'skill' }); });
      A.endSkill();
      // victory
      foes().forEach(function (f) { A.damage(h, f, f.hp + 50, { cause: 'skill' }); });
      // defeat
      sb({ heroes: [H(1, 4)], enemies: [E(2, 4)], kind: 'normal' });
      A.damage(foes()[0], DD.Combat.heroes()[0], 999, { cause: 'skill' });

      // run layer
      runLab(t, function () {
        const s = DD.Run.newRun(companions(), 'normal', 'narr:run:' + t.seed);
        function visit(type) {
          const id = 'narr_' + type + '_' + Object.keys(s.map.nodes).length;
          s.map.nodes[id] = { id: id, row: 0, col: 0, type: type, links: [], done: false };
          s.nodeId = null;
          s.map.start = [id];
          DD.Run.travel(id);
        }
        visit('shop');
        s.gold = 0;
        DD.Run.buy('items', 0);
        s.gold = 999;
        DD.Run.buy('items', 0);
        visit('tavern');
        DD.Run.tavernRest();
        visit('tavern');
        const cand = DD.Run.recruitCandidates()[0];
        if (cand) DD.Run.tavernRecruit(cand, 0);
        visit('treasure');
        DD.Run.next();
        s.map.nodes[s.map.boss].result = 'victory';
        DD.Run.completeAct({ noShow: true });
        s.party.forEach(function (rh) { rh.hp = DD.Run.heroStats(rh).maxHp; });
        DD.Run.startCombat({ act: s.act, kind: 'normal' }, 'normal');
        if (DD.AutoPlay && DD.Run.inCombat()) DD.AutoPlay.runBattle(30);
      });

      // screens: they pass no vars (the HUD's dice tray names the first hero)
      if (DD.UI && typeof DD.UI.narrate === 'function') {
        ['map_enter', 'act_intro_1', 'act_intro_2', 'act_intro_3', 'tips', 'gameover_title', 'victory_title', 'shop_greet', 'shop_buy',
          'shop_broke', 'shop_leave', 'tavern_greet', 'victory', 'defeat', 'act_clear', 'hero_death', 'level_up', 'idle_dm'].forEach(function (k) { DD.UI.narrate(k, {}, []); });
        DD.UI.narrate('initiative', { hero: 'the party' }, []);
      }
    });
    const T2 = DD.Narrator.TOKENS;
    const keys = {};
    /** The template of mine that produced the line (other authors may share a key), or null. */
    function myTemplate(c) { return (DD.Narrator.LINES[c.key] || []).filter(function (l) { return DD.util.fmt(l, c.vars) === c.line; })[0] || null; }
    /** Filled values starting uppercase are masked ('Biscuit Jr.' must not end a sentence); lowercase ones are kept. */
    function masked(vars) {
      const out = {};
      Object.keys(vars).forEach(function (k) { const v = String(vars[k]); out[k] = /^[a-z]/.test(v) ? v : 'Xx'; });
      return out;
    }
    calls.forEach(function (c) {
      keys[c.key] = true;
      if (!(c.key in T2)) return;   // other authors' own keys
      t.ok(typeof c.line === 'string' && c.line.length > 0 && !/\{\w+\}/.test(c.line), c.key + ': "' + c.line + '"');
      T2[c.key].forEach(function (tk) { t.ok(c.vars[tk] !== undefined, c.key + ': the caller fills {' + tk + '} (vars ' + JSON.stringify(c.vars) + ')'); });
      const tpl = myTemplate(c);
      if (tpl) t.eq(lowerStarts(DD.util.fmt(tpl, masked(c.vars))).length, 0, c.key + ': sentences start uppercase ("' + c.line + '")');
    });
    t.ok(calls.some(function (c) { return c.key === 'hero_downed' && c.vars.enemy === 'gravity'; }), 'a culprit-less down was narrated (enemy: gravity)');
    t.ok(calls.some(function (c) { return c.key === 'initiative' && typeof c.vars.hero === 'string'; }), 'the engine narrates the initiative roll with the first hero');
    const expected = ['combat_start', 'elite_start', 'boss_start', 'initiative', 'kill', 'overkill', 'env_kill', 'multi_kill', 'round_start', 'enemy_turn',
      'treasure', 'hero_downed', 'hero_revived', 'victory', 'defeat', 'run_start', 'shop_greet', 'shop_broke', 'shop_buy', 'tavern_greet', 'rest',
      'act_clear'];
    if (DD.Combat.heroes().length) expected.push('signature');
    if (DD.UI && DD.UI.narrate) expected.push('map_enter', 'act_intro_1', 'tips', 'gameover_title', 'victory_title', 'shop_leave', 'hero_death', 'level_up', 'idle_dm');
    expected.forEach(function (k) { t.ok(keys[k], k + ' was narrated in practice'); });
    t.ok(keys.recruit || !Object.keys(DD.defs.heroes).length, 'recruit was narrated in practice');
    t.log(calls.length + ' narration calls recorded over ' + Object.keys(keys).length + ' keys');
  });

  // ---- the tips are true (v2) ------------------------------------------------------------------------------------
  // Tips checked against the source rather than in-engine: HUD keys / panels, and the random direction of a Dazzled /
  // Confused attack. The map-turning tip: js/render/input.js (middle drag, Q / R, Home).
  const SOURCE_ONLY = [/^Space rolls initiative/, /^The initiative tracker shows/, /^Inspect an enemy/, /^A Dazzled enemy/,
    /^Summoned allies vanish/, /^Can't see a tile\? Hold the mouse wheel and drag to turn the map\. Q and R turn it 90 degrees, Home/];

  T.suite('narrative: tips — 30+, every one true in v2 (checked in-engine)', function (t) {
    const tips = (DD.Narrator && DD.Narrator.LINES.tips) || [];
    t.ok(tips.length >= 30, tips.length + ' tips');
    if (!DD.Combat || !DD.Act || !DD.AI) { t.skip('engine not loaded'); return; }
    const A = DD.Act;
    const C = DD.Combat;
    const checked = {};
    function sb(cfg) { return C.sandbox(Object.assign({ w: 9, h: 9, seed: 'tips:' + t.seed, enemyAi: false }, cfg)); }
    function H(x, y, id) { return { id: id || 'test_knight', x: x, y: y }; }
    function E(x, y, id) { return { id: id || 'test_grunt', x: x, y: y }; }
    function hero(i) { return C.heroes()[i || 0]; }
    function foe(i) { return C.enemies()[i || 0]; }
    function tip(re) { const hit = tips.filter(function (x) { return re.test(x); }); t.eq(hit.length, 1, 'one tip matches ' + re); if (hit[0]) checked[hit[0]] = true; return hit[0]; }
    function section(name, fn) { t.tryRun('tips: ' + name, fn); }
    function zone(list) { return list.map(function (p) { return { x: p[0], y: p[1] }; }); }
    function count(name, pred) {
      let n = 0;
      const off = DD.Events.on(name, function (e) { if (!pred || pred(e)) n++; });
      return { n: function () { return n; }, off: off };
    }
    const savedRng = DD.rng;
    DD.rng = DD.RNG('tips:' + t.seed);
    try {
      // ---- initiative & turns ----
      section('initiative', function () {
        tip(/^Every fight opens with a roll for initiative: d20 plus each unit's modifier\. The order holds for the whole fight/);
        sb({ initiative: 'roll', heroes: [H(1, 1), H(1, 3, 'test_mage')], enemies: [E(7, 7), E(7, 5, 'test_coward')] });
        const order = C.state.order || [];
        t.eq(order.length, 4, 'everyone rolled');
        t.ok(order.every(function (e) { return e.roll >= 1 && e.roll <= 20 && e.total === e.roll + e.init; }), 'd20 + modifier (' + order.map(function (e) { return e.roll + '+' + e.init; }).join(' ') + ')');
        const ids = order.map(function (e) { return e.unitId; }).join(',');
        C.endRound();
        C.endRound();
        t.eq(C.state.order.map(function (e) { return e.unitId; }).join(','), ids, 'the same order two rounds later');
        // ties: the higher modifier first, then the heroes
        tip(/^Initiative ties go to the higher modifier, then to the heroes/);
        sb({ initiative: 'roll', deploy: true, deployTiles: zone([[1, 1], [1, 2]]), heroes: [H(1, 1, 'test_mage')], enemies: [E(7, 7), E(7, 5)] });
        const st = C.state;
        const mg = hero(), ea = foe(0), eb = foe(1);
        mg.init = 0; ea.init = 1; eb.init = 0;
        const want = {};
        want[mg.id] = 11; want[ea.id] = 10; want[eb.id] = 11;   // every total is 11
        const queue = st.units.filter(function (u) { return !u.dead && u.kind !== 'summon'; }).map(function (u) { return want[u.id]; });
        const realInt = st.rng.int;
        st.rng.int = function (lo, hi) { return lo === 1 && hi === 20 && queue.length ? queue.shift() : realInt.call(st.rng, lo, hi); };
        try { C.rollInitiative(); } finally { st.rng.int = realInt; }
        t.eq(C.state.order.map(function (e) { return e.unitId; }).join(','), [ea.id, mg.id, eb.id].join(','), 'all on 11: the +1 goblin, then the hero, then the +0 goblin');
      });
      section('deployment', function () {
        tip(/^Before the initiative roll, place and swap heroes anywhere in the green deployment zone for free/);
        sb({ deploy: true, deployTiles: zone([[1, 1], [1, 2], [2, 1], [2, 2]]), heroes: [H(1, 1), H(1, 2, 'test_mage')], enemies: [E(7, 7)] });
        const k = hero(0), m = hero(1);
        t.ok(C.isDeploying() && C.state.round === 0, 'deployment: round 0');
        t.ok(C.deployMove(k, 2, 2) && k.x === 2 && k.y === 2, 'place: free');
        t.ok(C.deployMove(k, 1, 2) && k.x === 1 && k.y === 2 && m.x === 2 && m.y === 2, 'swap with an ally: free');
        t.ok(!C.deployMove(k, 5, 5), 'only inside the green zone');
        t.ok(C.isDeploying() && !C.state.order, 'still nothing rolled');
      });
      section('one turn each, summons on their owner\'s turn', function () {
        tip(/^Everyone takes one turn per round in initiative order \(a few bosses take two\)\. Summons act on their owner's turn/);
        sb({ heroes: [H(1, 1, 'test_summoner'), H(1, 4, 'test_mage')], enemies: [E(7, 7)], summons: [{ id: 'test_hound', x: 2, y: 1, owner: 'test_summoner' }] });
        const owner = hero(0), other = hero(1);
        const hound = C.units().filter(function (u) { return u.kind === 'summon' && !u.dead; })[0];
        t.ok(hound && C.turnGroup().indexOf(hound) >= 0 && C.isTurnOf(hound), 'the hound acts on its owner\'s turn');
        t.ok(!(C.state.order || []).some(function (e) { return hound && e.unitId === hound.id; }), 'it has no initiative entry of its own');
        t.ok(C.state.order.filter(function (e) { return e.unitId === owner.id; }).length === 1, 'one entry per unit');
        C.endTurn();
        t.ok(C.current() === other && hound && !C.isTurnOf(hound), 'on the other hero\'s turn it waits');
        // a boss with turnsPerRound: 2 (the act 1 bosses) gets two entries a round
        const bd = DD.getEnemy('test_boss');
        const had = bd.turnsPerRound;
        bd.turnsPerRound = 2;
        try {
          sb({ initiative: 'roll', heroes: [H(1, 1, 'test_mage')], enemies: [E(7, 7, 'test_boss')] });
          t.eq(C.state.order.filter(function (e) { return e.unitId === foe().id; }).length, 2, 'a two-turn boss: two entries a round');
        } finally { if (had === undefined) delete bd.turnsPerRound; else bd.turnsPerRound = had; }
        ['grimble', 'rat_king'].forEach(function (id) {
          const d = DD.getEnemy(id);
          if (d && d.tier === 'boss') t.eq(d.turnsPerRound, 2, id + ' takes two turns a round');
        });
      });
      section('unused AP is lost, Block', function () {
        tip(/^Unused AP is lost when a turn ends\. There is no Guard/);
        tip(/^Nobody starts a fight with Block\. You earn it mid-fight, and it lasts until the start of its owner's next turn/);
        sb({ deploy: true, deployTiles: zone([[1, 1], [1, 2]]), heroes: [H(1, 1, 'test_mage')], enemies: [E(7, 7)] });
        const mg = hero();
        mg.block = 7;
        foe().block = 4;
        C.rollInitiative();
        t.ok(mg.block === 0 && foe().block === 0, 'rolling initiative wipes every starting Block');
        t.ok(C.current() === mg && mg.ap === 3, 'her turn, 3 AP');
        A.addBlock(mg, 5);
        let during = null, apThen = null;
        const off = DD.Events.on('turn:start', function (e) { if (e.unit && e.unit.side === 'enemy' && during === null) { during = mg.block; apThen = mg.ap; } });
        C.endTurn();
        off();
        t.eq(during, 5, 'Block from her turn holds through the monster\'s turn');
        t.eq(apThen, 0, 'her unused AP is gone at the end of her turn (no Guard)');
        t.ok(C.current() === mg && mg.block === 0 && mg.ap === 3 && !(mg.apBank > 0), 'her next turn: Block gone, 3 AP, nothing banked from the leftovers');
      });
      section('monsters act without warning', function () {
        tip(/^Monsters act the moment their turn comes up, without warning\. Only bosses and a few elites wind up their big moves first/);
        sb({ enemyAi: true, heroes: [H(3, 3, 'test_mage')], enemies: [E(4, 3)] });
        const mg = hero(), gr = foe();
        t.eq(gr.intents.length, 0, 'nothing announced ahead');
        const hp = mg.hp;
        C.endTurn();
        t.ok(mg.hp < hp && gr.intents.length === 0, 'its turn came up and it simply hit her (' + hp + ' -> ' + mg.hp + ')');
      });
      section('threat shading', function () {
        tip(/^Hold Alt \(or press T\) for threat shading/);
        sb({ heroes: [H(1, 4, 'test_mage')], enemies: [E(5, 4)] });
        const map = DD.AI.threatMap('hero');
        t.ok(map.get('2,4') && map.get('2,4').dmg > 0, 'a tile the grunt can reach this turn is shaded');
        t.ok(!map.get('0,0'), 'a tile out of its reach is not');
      });
      section('banked AP', function () {
        tip(/^AP you give an ally outside their turn is banked/);
        sb({ heroes: [H(1, 1, 'test_mage'), H(1, 3, 'test_cleric')], enemies: [E(7, 7)] });
        const ally = hero(1);
        A.gainAp(ally, 1);
        t.ok(ally.apBank === 1 && !(ally.ap > 0), 'banked, not spendable now');
        C.endTurn();
        t.ok(C.current() === ally && ally.ap === C.turnAp(ally) + 1, 'added at the start of the ally\'s turn (' + ally.ap + ')');
      });
      section('arrivals', function () {
        tip(/^Monsters that appear mid-round roll initiative on arrival and act from the next round/);
        sb({ heroes: [H(1, 1, 'test_mage')], enemies: [E(7, 7)] });
        const mn = A.spawn('test_minion', 6, 6);
        t.ok(mn && C.joining().some(function (e) { return e.unitId === mn.id; }), 'it rolls on arrival and waits');
        t.ok(mn && !C.state.order.some(function (e) { return e.unitId === mn.id; }), 'not in this round\'s order');
        C.endRound();
        t.ok(mn && C.state.order.some(function (e) { return e.unitId === mn.id; }), 'in the order from the next round');
      });
      // ---- control ----
      section('debuffs cover the next turn', function () {
        tip(/^A debuff you apply on your turn covers the enemy's next turn/);
        sb({ enemyAi: true, heroes: [H(1, 4, 'test_mage')], enemies: [E(5, 4)] });
        const g = foe();
        A.addStatus(g, 'root', { turns: 1 }, hero());
        C.endTurn();
        t.ok(g.x === 5 && g.y === 4, 'rooted through its turn: it could not walk to her');
        t.ok(!A.hasStatus(g, 'root'), 'gone at the end of that turn');
      });
      section('stun and freeze', function () {
        tip(/^A Stunned enemy skips its whole next turn\. So does a Frozen one/);
        sb({ enemyAi: true, heroes: [H(3, 3, 'test_mage')], enemies: [E(4, 3), E(3, 4)] });
        const mg = hero(), g1 = foe(0), g2 = foe(1);
        A.addStatus(g1, 'stun', { turns: 1 }, mg);
        A.addStatus(g2, 'frozen', { turns: 1 }, mg);
        const hp = mg.hp;
        C.endTurn();
        t.eq(mg.hp, hp, 'neither of them hit her');
        t.ok(!A.hasStatus(g1, 'stun') && !A.hasStatus(g2, 'frozen'), 'both wore off with that turn');
        C.endTurn();
        t.ok(mg.hp < hp, 'next round they swing again');
      });
      section('sleep vs stun', function () {
        tip(/^Sleeping units wake up when damaged\. Stunned ones do not/);
        sb({ heroes: [H(0, 0)], enemies: [E(3, 3), E(5, 5)] });
        const zz = foe(0), st = foe(1);
        [zz, st].forEach(function (u) { u.maxHp = u.hp = 40; });
        A.addStatus(zz, 'sleep', { turns: 2 });
        A.addStatus(st, 'stun', { turns: 1 });
        A.damage(hero(), zz, 1, { cause: 'skill' });
        A.damage(hero(), st, 1, { cause: 'skill' });
        t.ok(!A.hasStatus(zz, 'sleep') && A.hasStatus(st, 'stun'), 'damage wakes the sleeper, not the stunned');
      });
      section('taunt', function () {
        tip(/^A Taunted enemy must attack its taunter if it can reach it, and walks toward it if it can't/);
        sb({ heroes: [H(3, 3, 'test_mage'), H(5, 3, 'test_cleric')], enemies: [E(4, 3)] });
        const mg = hero(0), cl = hero(1), g = foe();
        A.addStatus(g, 'taunt', { turns: 1 }, cl);
        const hm = mg.hp, hc = cl.hp + cl.block;
        DD.AI.act(g);
        t.ok(mg.hp === hm && cl.hp + cl.block < hc, 'it hits the taunter, not the hero next to it');
        sb({ heroes: [H(3, 3, 'test_mage'), H(8, 8, 'test_cleric')], enemies: [E(4, 3)] });
        const m2 = hero(0), c2 = hero(1), g2 = foe();
        A.addStatus(g2, 'taunt', { turns: 1 }, c2);
        const d0 = DD.Grid.dist(g2, c2), h2 = m2.hp;
        DD.AI.act(g2);
        t.ok(DD.Grid.dist(g2, c2) < d0 && m2.hp <= h2, 'out of reach: it walks toward its taunter (' + d0 + ' -> ' + DD.Grid.dist(g2, c2) + ')');
      });
      section('charm', function () {
        tip(/^A Charmed enemy fights for your side on its next turn/);
        sb({ heroes: [H(3, 4, 'test_mage')], enemies: [E(4, 4), E(5, 4)] });
        const mg = hero(), c1 = foe(0), c2 = foe(1);
        A.addStatus(c1, 'charmed', { turns: 1 }, mg);
        const hm = mg.hp, h2 = c2.hp;
        DD.AI.act(c1);
        t.ok(c2.hp < h2 && mg.hp === hm, 'the charmed goblin hits its friend, not the hero next to it');
      });
      // ---- boss wind-ups ----
      section('wind-ups land at the start of the boss\'s next turn', function () {
        tip(/^Wind-ups mark their tiles in red with a ⏳ and land at the start of their owner's next turn \(⏳2: the one after\)/);
        sb({ enemyAi: true, heroes: [H(2, 2, 'test_mage')], enemies: [E(7, 7, 'test_boss')] });
        const boss = foe(), mg = hero();
        const w = DD.AI.windUp(boss, 'test_boss_meteor', { x: 2, y: 2 }, { label: 'Meteor' });
        t.ok(w && DD.AI.windups().some(function (x) { return x.unitId === boss.id && x.tiles.some(function (p) { return p.x === 2 && p.y === 2; }); }), 'announced on her tile');
        const hp = mg.hp;
        C.endTurn();
        t.ok(mg.hp < hp && !boss.intents.some(function (i) { return i.skillId === 'test_boss_meteor'; }), 'it landed at the boss\'s turn start (' + hp + ' -> ' + mg.hp + ')');
        // the same, but she walks out first
        sb({ enemyAi: true, heroes: [H(2, 2, 'test_mage')], enemies: [E(7, 7, 'test_boss')] });
        const b2 = foe(), m2 = hero();
        DD.AI.windUp(b2, 'test_boss_meteor', { x: 2, y: 2 }, { label: 'Meteor' });
        t.ok(C.move(m2, 2, 6), 'she walks out');
        const hp2 = m2.hp;
        C.endTurn();
        t.eq(m2.hp, hp2, 'out of the marked tiles: nothing');
        // ⏳2 (Disintegrate, the act 1 bosses' two-turn rounds): not on its next turn, on the one after
        sb({ heroes: [H(2, 2, 'test_mage')], enemies: [E(7, 7, 'test_boss')] });
        const b3 = foe(), m3 = hero();
        DD.AI.windUp(b3, 'test_boss_meteor', { x: 2, y: 2 }, { turns: 2, noCooldown: true });
        const hp3 = m3.hp;
        C.endTurn();
        t.ok(m3.hp === hp3 && b3.intents.length === 1 && b3.intents[0].turnsLeft === 1, '⏳2: its next turn only counts down (' + hp3 + ' -> ' + m3.hp + ')');
        C.endTurn();
        t.ok(m3.hp < hp3 && b3.intents.length === 0, '⏳2: it lands at the start of the turn after (' + hp3 + ' -> ' + m3.hp + ')');
      });
      section('wind-ups are interrupted', function () {
        tip(/^Stun, Sleep or Freeze whoever is winding up and the wind-up is interrupted on the spot, if it sticks\. Bosses can't be sheeped/);
        // an elite's signature wind-up too
        sb({ heroes: [H(2, 2, 'test_mage')], enemies: [E(3, 2, 'test_brute')] });
        const brute = foe();
        DD.AI.windUp(brute, 'test_smash', hero(), { anchor: 'self', noCooldown: true });
        t.eq(brute.intents.length, 1, 'elite: winding up');
        A.addStatus(brute, 'stun', { turns: 1 }, hero());
        t.eq(brute.intents.length, 0, 'elite: stunned, interrupted at once');
        ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (id) {
          sb({ heroes: [H(2, 2, 'test_mage')], enemies: [E(7, 7, 'test_boss')] });
          const boss = foe();
          DD.AI.windUp(boss, 'test_boss_meteor', { x: 2, y: 2 }, { noCooldown: true });
          t.eq(boss.intents.length, 1, id + ': winding up');
          A.addStatus(boss, id, { turns: 1 }, hero());
          if (id === 'sheep') t.ok(!A.hasStatus(boss, 'sheep') && boss.intents.length === 1, 'a boss refuses the sheep: still winding up');
          else t.eq(boss.intents.length, 0, id + ': interrupted at once');
        });
        // a stun-immune boss refuses the stun, so its wind-up goes on ("if the status sticks")
        sb({ heroes: [H(2, 2, 'test_mage')], enemies: [E(7, 7, 'test_boss')] });
        const guard = foe();
        guard.flags.stunImmune = true;
        DD.AI.windUp(guard, 'test_boss_meteor', { x: 2, y: 2 }, { noCooldown: true });
        A.addStatus(guard, 'stun', { turns: 1 }, hero());
        t.ok(!A.hasStatus(guard, 'stun') && guard.intents.length === 1, 'stun-immune: the stun does not stick, the wind-up goes on');
      });
      section('wind-up anchors', function () {
        tip(/^Wind-ups aimed at the floor stay put\. Ones aimed from the monster itself move with it when you shove it/);
        sb({ heroes: [H(3, 4, 'test_mage')], enemies: [E(4, 4, 'test_boss')] });
        const boss = foe(), mg = hero();
        const onGround = DD.AI.makeIntent(boss, 'test_boss_meteor', { x: 3, y: 4 }, { anchor: 'ground', noCooldown: true, noAdd: true });
        const onSelf = DD.AI.makeIntent(boss, 'test_boss_slam', mg, { anchor: 'self', noCooldown: true, noAdd: true });
        const key = function (ts) { return (ts || []).map(function (p) { return p.x + ',' + p.y; }).sort().join(' '); };
        const g0 = key(DD.AI.intentTiles(boss, onGround)), s0 = key(DD.AI.intentTiles(boss, onSelf));
        A.push(mg, boss, { x: 1, y: 0 }, 1);
        t.ok(boss.x === 5 && g0.length > 0 && s0.length > 0, 'the boss was shoved');
        t.eq(key(DD.AI.intentTiles(boss, onGround)), g0, 'aimed at the floor: same tiles');
        t.ok(key(DD.AI.intentTiles(boss, onSelf)) !== s0, 'aimed from the boss: moved with it (' + s0 + ' -> ' + key(DD.AI.intentTiles(boss, onSelf)) + ')');
      });
      section('tracking wind-ups fizzle', function () {
        tip(/^A wind-up that tracks a hero can fizzle/);
        sb({ enemyAi: true, heroes: [H(3, 3, 'test_mage')], enemies: [E(8, 8, 'test_boss')] });
        const boss = foe(), mg = hero();
        const w = DD.AI.windUp(boss, 'test_boss_meteor', mg, { track: true });
        t.ok(w && w.anchor === 'unit', 'it tracks her');
        A.addStatus(mg, 'stealth', { turns: 2 }, mg);
        const hp = mg.hp;
        C.endTurn();
        t.ok(mg.hp === hp && !boss.intents.some(function (i) { return i.skillId === 'test_boss_meteor'; }), 'she slipped into stealth: it fizzled');
      });
      // ---- attacks of opportunity ----
      section('attacks of opportunity', function () {
        tip(/^Walking away from a melee foe gives it a free attack of opportunity\. Each unit makes at most one per round/);
        tip(/^Bad move\? Press Z to undo it, as long as nothing else happened since and it provoked no attack of opportunity/);
        sb({ heroes: [H(3, 4, 'test_mage')], enemies: [E(4, 4)] });
        const mg = hero(), gr = foe();
        const aoo = count('opportunity:attack', function (e) { return e.attacker === gr; });
        const hp = mg.hp;
        t.ok(C.move(mg, 1, 4), 'she walks away');
        t.ok(aoo.n() === 1 && mg.hp < hp, 'the grunt gets a free hit (' + hp + ' -> ' + mg.hp + ')');
        t.ok(!C.canUndo(), 'a move that provoked can\'t be undone');
        t.ok(C.move(mg, 3, 4), 'back next to it (stepping in never provokes)');
        t.eq(aoo.n(), 1, 'stepping next to it: nothing');
        t.ok(C.move(mg, 1, 4), 'and away again');
        t.eq(aoo.n(), 1, 'its one attack of opportunity this round is spent');
        aoo.off();
        sb({ heroes: [H(1, 1, 'test_mage')], enemies: [E(7, 7)] });
        const m2 = hero();
        t.ok(C.move(m2, 1, 3) && C.canUndo() && C.undo() && m2.y === 1, 'an ordinary move can be undone');
      });
      section('what never provokes', function () {
        tip(/^Pushes, pulls, teleports, swaps, jumps and dashing skills never provoke attacks of opportunity\. Only walking does/);
        sb({ heroes: [H(3, 4, 'test_mage'), H(1, 1)], enemies: [E(4, 4)] });
        const mg = hero(0), kn = hero(1), gr = foe();
        const aoo = count('opportunity:attack');
        A.push(kn, mg, { x: -1, y: 0 }, 1);
        A.teleport(mg, 3, 4);
        A.teleport(mg, 0, 8);
        A.teleport(mg, 3, 4);
        A.swap(mg, kn, { force: true });
        A.swap(mg, kn, { force: true });
        const path = [{ x: 3, y: 5 }, { x: 3, y: 6 }, { x: 3, y: 7 }];
        A.moveAlong(mg, path);
        t.eq(aoo.n(), 0, 'push, teleports, swaps and a dash past the grunt: no attack of opportunity');
        aoo.off();
        t.ok(gr && !gr.dead, 'the grunt is still there');
      });
      section('melee holds the line', function () {
        tip(/^Melee heroes hold the line: an enemy next to one would rather keep swinging than walk past/);
        sb({ heroes: [H(4, 5), H(2, 4, 'test_mage')], enemies: [E(4, 4)] });
        const kn = hero(0), mg = hero(1), gr = foe();
        kn.block = 0;
        mg.hp = 5;   // hurt, but not a sure kill
        const hk = kn.hp, hm = mg.hp;
        DD.AI.act(gr);
        t.ok(kn.hp < hk && mg.hp === hm, 'the goblin keeps hitting the knight next to it, not the hurt wizard it could walk to');
      });
      section('enemies provoke too', function () {
        tip(/^It works both ways: an enemy that walks away from your melee heroes eats a free hit too/);
        sb({ heroes: [H(3, 4)], enemies: [E(4, 4, 'test_archer')] });
        const kn = hero(), ar = foe();
        const aoo = count('opportunity:attack', function (e) { return e.attacker === kn && e.mover === ar; });
        const hp = ar.hp;
        DD.AI.moveTo(ar, 7, 4);
        t.ok(aoo.n() === 1 && ar.hp < hp, 'the archer backing off eats the knight\'s free hit');
        aoo.off();
      });
      section('who makes and provokes none', function () {
        tip(/^Stunned, sleeping, frozen and sheeped units make no attacks of opportunity, and stealthed units provoke none/);
        sb({ heroes: [H(3, 4, 'test_mage')], enemies: [E(4, 4)] });
        const mg = hero(), gr = foe();
        t.ok(!!A.opportunityOf(gr, mg), 'normally it would strike');
        ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (id) {
          A.addStatus(gr, id, { turns: 1 }, mg);
          t.ok(!A.opportunityOf(gr, mg), id + ': no attack of opportunity');
          A.removeStatus(gr, id);
        });
        A.addStatus(mg, 'stealth', { turns: 1 }, mg);
        t.ok(!A.opportunityOf(gr, mg), 'stealthed: she provokes none');
      });
      section('divers', function () {
        tip(/^Sneaky enemies dive the weakest hero\. Everything else hits what it can reach/);
        t.ok(DD.AI.isDiver('assassin') && DD.AI.isDiver('skirmisher') && !DD.AI.isDiver('melee') && !DD.AI.isDiver('ranged'), 'assassins and skirmishers dive; brutes and archers don\'t');
      });
      section('paths dodge attacks of opportunity', function () {
        // the red path and ⚔ marks are the HUD's (combat_hud.js provokeInfo / overlay previews); the paths are the engine's
        tip(/^Paths dodge attacks of opportunity when they can\. Hover a tile first: a red path with ⚔ marks shows who still gets a free hit/);
        sb({ heroes: [H(2, 4, 'test_mage')], enemies: [E(4, 4)] });
        const mg = hero();
        const e = C.reachable(mg).get('4,6');
        t.ok(e && !(e.provokes || []).length && !e.path.some(function (p) { return p.x === 3 && p.y === 4; }),
          'past the grunt: the walk goes round its reach (' + JSON.stringify(e && e.path) + ')');
        const hp = mg.hp;
        t.ok(C.move(mg, 4, 6) && mg.hp === hp, 'and nothing strikes');
        sb({ heroes: [H(3, 4, 'test_mage')], enemies: [E(4, 4)] });
        const m2 = hero();
        const pv = C.provokes(m2, 1, 4) || [];
        t.ok(pv.length === 1 && pv[0].unitId === foe().id && pv[0].dmg > 0, 'no way round from next to it: the preview names who strikes and how hard (' + JSON.stringify(pv) + ')');
      });
      // ---- battlefield ----
      section('pits, bumps, lava', function () {
        tip(/^Non-boss enemies pushed into a pit/);
        tip(/fall into a pit lose 25% of their max HP/);
        tip(/bump damage \(usually 3\)/);
        tip(/^Lava deals 8 fire damage and Burn 2/);
        sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
        DD.Grid.tile(3, 3).t = 'pit';
        A.push(hero(), foe(), { x: 1, y: 0 }, 1);
        t.ok(C.state.units.filter(function (u) { return u.side === 'enemy'; })[0].dead, 'pit: YEET');
        t.eq(C.state.hype, 20, 'environmental kill: +20 Hype');
        sb({ heroes: [H(2, 3)], enemies: [E(1, 3)] });
        DD.Grid.tile(3, 3).t = 'pit';
        const hh = hero(), max = hh.maxHp;
        hh.block = 0;
        A.push(foe(), hh, { x: 1, y: 0 }, 1);
        t.eq(hh.hp, max - Math.ceil(max * 0.25), 'a hero in a pit loses 25% of max HP');
        sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
        DD.Grid.tile(3, 3).t = 'wall';
        A.push(hero(), foe(), { x: 1, y: 0 }, 1);
        t.eq(foe().hp, foe().maxHp - 3, 'blocked push: 3 bump damage');
        sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
        DD.Grid.tile(3, 3).t = 'lava';
        A.push(hero(), foe(), { x: 1, y: 0 }, 1);
        t.ok(foe().hp === foe().maxHp - 8 && A.getStatus(foe(), 'burn').stacks === 2, 'lava: 8 fire damage + Burn 2');
      });
      section('water, lightning, steam, ice, oil, webs', function () {
        tip(/^Water puts out Burn and makes units Wet\. Wet units can't Burn and take 50% more lightning damage/);
        sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
        DD.Grid.tile(3, 3).t = 'water';
        const g = foe();
        A.addStatus(g, 'burn', { stacks: 3 });
        A.push(hero(), g, { x: 1, y: 0 }, 1);
        t.ok(!A.hasStatus(g, 'burn') && A.hasStatus(g, 'wet'), 'into the water: Burn out, Wet in');
        A.addStatus(g, 'burn', { stacks: 2 });
        t.ok(!A.hasStatus(g, 'burn'), 'Wet: no Burn');
        const hp = g.hp;
        A.damage(hero(), g, 4, { element: 'lightning', cause: 'skill' });
        t.eq(hp - g.hp, 6, 'Wet: 4 lightning -> 6');
        tip(/4 lightning damage \(6 if Wet\) and a Stun/);
        sb({ heroes: [H(0, 0)], enemies: [E(3, 3), E(4, 3)] });
        DD.Grid.tile(3, 3).t = 'water';
        DD.Grid.tile(4, 3).t = 'water';
        A.addStatus(foe(1), 'wet', { turns: 2 });
        A.applyElement(3, 3, 'lightning', hero());
        t.ok(foe(0).maxHp - foe(0).hp === 4 && A.hasStatus(foe(0), 'stun'), 'shock: 4 + Stun');
        t.ok(foe(1).maxHp - foe(1).hp === 6 && A.hasStatus(foe(1), 'stun'), 'shock: 6 if Wet');
        tip(/^Fire boils water into steam, which blocks line of sight until the end of the round/);
        sb({ heroes: [H(0, 0)], enemies: [E(7, 7)] });
        DD.Grid.tile(4, 4).t = 'water';
        A.applyElement(4, 4, 'fire', hero());
        const tl = DD.Grid.tile(4, 4);
        t.ok(tl.surface && tl.surface.id === 'steam' && DD.Grid.blocksLos(4, 4), 'steam, and it blocks line of sight');
        C.endRound();
        t.ok(!(DD.Grid.tile(4, 4).surface && DD.Grid.tile(4, 4).surface.id === 'steam'), 'gone when the round ends');
        tip(/^Frost freezes water into ice, and pushed units slide one extra tile on ice/);
        sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
        DD.Grid.tile(3, 3).t = 'water';
        A.applyElement(3, 3, 'frost', hero());
        t.eq(DD.Grid.tile(3, 3).t, 'ice', 'frost: water -> ice');
        A.push(hero(), foe(), { x: 1, y: 0 }, 1);
        t.eq(foe().x, 4, 'pushed 1 onto ice: slid one tile further');
        tip(/^Fire ignites oil, and the flames race along the entire slick/);
        sb({ heroes: [H(0, 0)], enemies: [E(8, 8)] });
        [[3, 2], [4, 2], [5, 2]].forEach(function (p) { A.setSurface(p[0], p[1], 'oil', 5); });
        A.applyElement(3, 2, 'fire', hero());
        t.ok([[3, 2], [4, 2], [5, 2]].every(function (p) { const s = DD.Grid.tile(p[0], p[1]).surface; return s && s.id === 'fire'; }), 'the whole slick burns');
        tip(/^Webs root whoever walks into them\. Fire burns them away/);
        sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
        A.setSurface(3, 3, 'web', 4);
        A.push(hero(), foe(), { x: 1, y: 0 }, 1);
        t.ok(A.hasStatus(foe(), 'root'), 'into the web: rooted');
        A.setSurface(5, 5, 'web', 4);
        A.applyElement(5, 5, 'fire', hero());
        t.ok(DD.Grid.tile(5, 5).surface && DD.Grid.tile(5, 5).surface.id === 'fire', 'fire burns the web');
      });
      section('barrels, high ground, climbing', function () {
        tip(/^Explosive barrels .* 8 fire damage/);
        sb({ heroes: [H(0, 0)], enemies: [E(3, 2)] });
        A.placeObject(3, 3, 'barrel_explosive');
        A.damageObject(hero(), 3, 3, 99);
        t.eq(foe().maxHp - foe().hp, 8, 'barrel: 8 fire damage next to it');
        tip(/^Skills used from higher ground deal 25% more damage/);
        sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
        DD.Grid.tile(1, 3).h = 1;
        const f = foe();
        A.damage(hero(), f, 8, { cause: 'skill' });
        t.eq(f.maxHp - f.hp, 10, 'high ground: 8 -> 10');
        tip(/^Climbing costs 1 extra move per level, and most heroes step up only 1 level at a time\. Flyers ignore/);
        sb({ heroes: [H(1, 1)], enemies: [E(7, 7)] });
        const k = hero();
        DD.Grid.tile(2, 1).h = 1;
        DD.Grid.tile(1, 2).h = 2;
        DD.Grid.tile(3, 3).t = 'mud';
        t.eq(DD.Grid.stepCost(k, { x: 1, y: 1 }, { x: 2, y: 1 }), 2, 'one level up: +1 move');
        t.ok(!DD.Grid.canStep(k, { x: 1, y: 1 }, { x: 1, y: 2 }), 'two levels in one step: no');
        k.flags.flying = true;
        t.ok(DD.Grid.canStep(k, { x: 1, y: 1 }, { x: 1, y: 2 }) && DD.Grid.stepCost(k, { x: 1, y: 1 }, { x: 2, y: 1 }) === 1 &&
          DD.Grid.stepCost(k, { x: 3, y: 2 }, { x: 3, y: 3 }) === 1, 'a flyer ignores height and mud');
        k.flags.flying = false;
        k.flags.hop = true;
        t.ok(DD.Grid.canStep(k, { x: 1, y: 1 }, { x: 1, y: 2 }), 'a hopper takes two levels in one step');
        tip(/^Professor Marbles, Betty and Hjalmar hop up 2 levels in a single step/);
        ['marbles', 'betty', 'hjalmar'].forEach(function (id) {
          const d = DD.getHero(id);
          if (d && d.skillPool && d.basic && d.basic.indexOf('test_') !== 0) t.ok(d.flags && d.flags.hop === true, id + ' has the hop flag');
        });
      });
      section('Smash, fountains', function () {
        tip(/^Adjacent heroes can Smash objective objects .* 1 AP for 5 damage/);
        sb({ heroes: [H(2, 2)], enemies: [E(7, 7)], objective: { type: 'destroy', objId: 'totem', count: 1 } });
        A.placeObject(3, 2, 'totem');
        const sm = C.interactions(hero()).filter(function (o) { return o.kind === 'smash'; })[0];
        t.ok(sm && sm.ap === 1 && sm.dmg === 5, 'Smash: 1 AP, 5 damage');
        tip(/^Fountains heal 10 HP for 1 AP/);
        sb({ heroes: [H(2, 2)], enemies: [E(7, 7)] });
        A.placeObject(3, 2, 'fountain');
        hero().hp = 5;
        hero().ap = 3;
        C.interact(hero(), 3, 2);
        t.ok(hero().hp === 15 && hero().ap === 2, 'fountain: +10 HP for 1 AP');
        t.ok(!C.interactions(hero()).some(function (o) { return o.x === 3 && o.y === 2 && o.kind !== 'smash'; }), 'one sip per fight');
      });
      // ---- damage & Hype ----
      section('Hype', function () {
        tip(/^Kills give \+8 Hype\. Environmental kills .* give \+20 instead/);
        tip(/2 or more foes gives \+4 Hype/);
        tip(/^Signatures cost 100 Hype\. Hype starts every fight at 0/);
        sb({ heroes: [H(1, 3)], enemies: [E(2, 3), E(5, 5), E(6, 6)] });
        t.eq(C.state.hype, 0, 'Hype starts at 0');
        A.damage(hero(), foe(), 99, { cause: 'skill' });
        t.eq(C.state.hype, 8, 'kill: +8 Hype');
        A.beginSkill(hero(), DD.getSkill(hero().basic.id));
        C.enemies().filter(function (u) { return !u.dead; }).forEach(function (u) { A.damage(hero(), u, 1, { cause: 'skill' }); });
        A.endSkill();
        t.eq(C.state.hype, 12, 'a skill hitting 2 foes: +4 Hype');
        const sig = DD.getSkill(hero().signature.id);
        t.ok(sig && sig.hype === 100, 'the signature costs 100 Hype');
      });
      section('poison, burn, bleed, marked, frozen, armor', function () {
        tip(/^Poison ignores Block\. Burn does not/);
        sb({ heroes: [H(1, 1)], enemies: [E(6, 6)] });
        const g = foe();
        g.block = 10;
        A.addStatus(g, 'poison', { stacks: 3 });
        DD.Hooks.fire('onTurnStart', g, g);
        t.ok(g.hp === g.maxHp - 3 && g.block === 10, 'poison goes through Block');
        A.addStatus(g, 'burn', { stacks: 3 });
        const hp0 = g.hp;
        DD.Hooks.fire('onTurnEnd', g, g);
        t.ok(g.hp === hp0 && g.block === 7, 'burn is soaked by Block');
        tip(/^Bleeding units take damage every time they move or get pushed/);
        sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
        A.addStatus(foe(), 'bleed', { stacks: 3 });
        A.push(hero(), foe(), { x: 1, y: 0 }, 1);
        t.eq(foe().maxHp - foe().hp, 3, 'pushed while bleeding: 3 damage');
        tip(/Marked unit takes extra damage from the next hit, equal to its Mark stacks/);
        tip(/^Frozen units take 50% more physical damage/);
        sb({ heroes: [H(0, 0)], enemies: [E(3, 3), E(5, 5)] });
        const fz = foe(0), mk = foe(1);
        [fz, mk].forEach(function (u) { u.maxHp = u.hp = 40; });
        A.addStatus(fz, 'frozen', { turns: 1 });
        A.damage(hero(), fz, 10, { cause: 'skill' });
        t.eq(fz.maxHp - fz.hp, 15, 'frozen: 10 -> 15');
        A.addStatus(mk, 'marked', { stacks: 3 });
        A.damage(hero(), mk, 4, { cause: 'skill' });
        t.ok(mk.maxHp - mk.hp === 7 && !A.hasStatus(mk, 'marked'), 'marked: +3 once');
        tip(/^Armor reduces each attack by its value, down to a minimum of 1/);
        sb({ heroes: [H(0, 0)], enemies: [E(3, 3)] });
        foe().armor = 5;
        A.damage(hero(), foe(), 3, { cause: 'skill' });
        t.eq(foe().maxHp - foe().hp, 1, 'armor: min 1');
        A.addStatus(foe(), 'poison', { stacks: 2 });
        const hp1 = foe().hp;
        DD.Hooks.fire('onTurnStart', foe(), foe());
        t.eq(hp1 - foe().hp, 2, 'poison ignores armor');
      });
      section('difficulty', function () {
        tip(/^Brutal: enemies get 25% more HP and 20% more damage/);
        const D = C.DIFFICULTY;
        t.ok(D && D.brutal.hp === 1.25 && D.brutal.dmg === 1.2, 'brutal multipliers');
      });
      // ---- downs ----
      section('Help Up', function () {
        tip(/^An adjacent ally can Help Up a downed hero for 2 AP\. They get up with 25% of their max HP and act on their next turn/);
        sb({ heroes: [H(1, 3), H(1, 4, 'test_mage')], enemies: [E(7, 7)] });
        const down = hero(1), helper = hero(0);
        A.damage(null, down, 999, { cause: 'other' });
        t.ok(down.downed && C.state.order.some(function (e) { return e.unitId === down.id; }), 'downed, and still in the initiative order');
        helper.ap = 3;
        const opt = C.interactions(helper).filter(function (o) { return o.kind === 'helpUp'; })[0];
        t.ok(opt && opt.ap === 2, 'Help Up costs 2 AP');
        if (opt) C.interact(helper, opt.x, opt.y);
        t.ok(!down.downed && down.hp === Math.round(down.maxHp * 0.25), 'back at 25% max HP');
        C.endTurn();
        t.ok(C.current() === down && down.ap === 3, 'and acting on their own next turn');
      });
      // ---- v2 requests (Nov 3): heals on the downed, barrels, flyers ----
      section('heals get the downed up', function () {
        tip(/^Aim a single-target heal at a downed ally and they get up with the healed HP\. Help Up is for/);
        sb({ heroes: [H(1, 3, 'test_cleric'), H(3, 3, 'test_mage')], enemies: [E(7, 7)] });
        const cl = hero(0), down = hero(1), sl = A.makeSlot('test_heal', 1);
        cl.skills = [sl];
        A.damage(null, down, 999, { cause: 'other' });
        t.ok(down.downed && C.useSkill(cl, sl, down.x, down.y), 'a single-target heal aimed at the downed mage');
        t.ok(!down.downed && down.hp === 7, 'the mage is up with the healed HP (7)');
      });
      section('shoot the barrel', function () {
        tip(/^Shoot the barrel: aim any single-target attack at an explosive barrel in range and it goes off\. Blast kills are environmental: \+20 Hype/);
        sb({ heroes: [H(1, 3, 'test_mage')], enemies: [E(4, 4), E(8, 8)] });
        A.placeObject(4, 3, 'barrel_explosive');
        const m = hero(), g = foe(0), hype0 = C.state.hype;
        g.hp = 5;
        t.ok(DD.Targeting.isValidTarget(m, m.basic, 4, 3) && C.useSkill(m, m.basic, 4, 3), 'the basic attack, aimed at the barrel');
        t.ok(!DD.Grid.tile(4, 3).obj && g.dead, 'the barrel goes off and takes the grunt with it');
        t.eq(C.state.hype - hype0, 20, 'a blast kill is environmental: +20 Hype');
      });
      section('flyers ignore the floor', function () {
        tip(/^Flyers ignore everything on the floor, good and bad: fire, puddles, traps, plates, holy ground\. Clouds and explosions still get them/);
        sb({ heroes: [H(1, 3)], enemies: [E(7, 7)] });
        const f = hero();
        f.flags.flying = true;
        A.setSurface(2, 3, 'fire', 3);
        A.setSurface(3, 3, 'water', 3);
        A.placeObject(4, 3, 'spikes');
        A.placeObject(5, 3, 'pressure_plate');
        A.moveAlong(f, [{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }]);
        t.ok(f.x === 5 && f.hp === f.maxHp && f.statuses.length === 0, 'a flyer crosses fire, a puddle and spikes untouched');
        const plate = DD.Grid.tile(5, 3).obj;
        t.ok(!!plate && !(plate.data && plate.data.pressed), 'and never presses the plate');
        A.setSurface(5, 3, 'holy', 3);
        f.hp = 10;
        C.endTurn();
        t.eq(f.hp, 10, 'Holy Ground does not heal it either');
        t.ok(DD.Grid.feelsSurface(f, 'steam') && DD.Grid.feelsSurface(f, 'smoke'), 'clouds still reach it');
        A.placeObject(6, 3, 'barrel_explosive');
        A.damageObject(null, 6, 3, 99);
        t.ok(f.hp < 10, 'and so does an explosion');
      });
      // ---- pockets & heroes (real content when loaded) ----
      section('pockets', function () {
        const jos = DD.getHero('josiah');
        tip(/Josiah adds a fourth/);
        if (jos && jos.skillPool && jos.startingSkills && jos.basic && jos.basic.indexOf('jos') === 0) t.ok((jos.consumableSlots || (jos.passive && jos.passive.consumableSlots)) === 1, 'Josiah adds one pocket');
        sb({ heroes: [H(1, 1, 'test_summoner')], enemies: [E(7, 7)], summons: [{ id: 'test_hound', x: 2, y: 1, owner: 'test_summoner' }], consumables: Object.keys(DD.defs.consumables).slice(0, 1) });
        const hound = C.units().filter(function (u) { return u.kind === 'summon' && !u.dead; })[0];
        if (hound && C.consumables().length) t.ok(C.canUseConsumable(hound, 0) !== true, 'a hound can\'t drink a potion ("' + C.canUseConsumable(hound, 0) + '")');
      });
    } finally {
      DD.rng = savedRng;
    }
    // ---- run-layer numbers ----
    runLab(t, function () {
      tip(/rest \(35% heal for everyone and one scar treated\)/);
      tip(/^Clearing an act heals every hero for 50%/);
      tip(/^The party shares 3 consumable pockets/);
      const s = DD.Run.newRun(companions(), 'normal', 'tips:run:' + t.seed);
      t.eq(s.maxConsumables, 3, '3 pockets for a fixture party');
      s.party.forEach(function (rh) { rh.passives = []; rh.passiveRolls = []; rh.hp = 1; });
      s.party[0].scars = Object.keys(DD.defs.scars).slice(0, 1);
      const id = 'narr_tavern';
      s.map.nodes[id] = { id: id, row: 0, col: 0, type: 'tavern', links: [], done: false };
      s.nodeId = null;
      s.map.start = [id];
      DD.Run.travel(id);
      DD.Run.tavernRest();
      s.party.forEach(function (rh, i) { t.eq(rh.hp, Math.min(DD.Run.heroStats(rh).maxHp, 1 + Math.max(1, Math.round(DD.Run.heroStats(rh).maxHp * 0.35))), 'rest heals hero ' + i + ' 35%'); });
      t.eq(s.party[0].scars.length, 0, 'rest treats a scar');
      s.party.forEach(function (rh) { rh.hp = 1; });
      s.map.nodes[s.map.boss].result = 'victory';
      DD.Run.completeAct({ noShow: true });
      s.party.forEach(function (rh, i) { t.eq(rh.hp, Math.min(DD.Run.heroStats(rh).maxHp, 1 + Math.max(1, Math.round(DD.Run.heroStats(rh).maxHp * 0.5))), 'act clear heals hero ' + i + ' 50%'); });
      // leveling: one hero per won fight, the lowest level first; recruits join at the lowest level
      tip(/^After every won fight the DM rolls to see who levels up\. The lowest-level heroes always go first/);
      tip(/^Leveling is slow: one hero per won fight/);
      tip(/^Recruits join at the lowest level among the heroes who stay/);
      tip(/^Each level-up rolls on the Table of Questionable Blessings, then you pick 1 of 3/);
      tip(/^Heroes socket 4 skills/);
      tip(/^Heroes hold up to 4 Blessings/);
      t.eq(DD.Run.levelUpsPerWin('normal'), 1, 'one level-up per won fight');
      t.eq(DD.Run.MAX_SKILLS, 4, '4 skill sockets');
      if (DD.Passives) t.eq(DD.Passives.MAX, 4, '4 Blessing slots');
      const lv = DD.Run.newRun(companions(), 'normal', 'tips:lv:' + t.seed);
      lv.party.forEach(function (rh, i) { rh.passives = []; rh.passiveRolls = []; rh.level = [3, 2, 2, 3][i] || 2; });
      t.eq(DD.Run.levelUpCandidates().join(','), '1,2', 'the DM rolls among the lowest-level heroes');
      const one = DD.Run.levelUp();
      t.ok(one && (one.heroIdx === 1 || one.heroIdx === 2) && lv.party[one.heroIdx].level === 3, 'the level-up went to one of them');
      t.ok(lv.party[one.heroIdx].pendingLevels === 1 && DD.Run.levelUpChoices(one.heroIdx).length === 3, 'it leaves a pick of 3 for the level-up screen');
      t.eq(DD.Run.recruitLevel(0), 2, 'a recruit replacing hero 0 joins at the lowest level of the others');
      // still down when the fight is won: 1 HP (plus any level-up's growth), a Scar, one down; the third writes them out
      tip(/^Heroes still down when a fight is won get up at 1 HP with a Scar/);
      tip(/counts as a down\. The third one writes them out of the campaign/);
      if (!DD.Combat || !DD.Encounter) return;
      const r = DD.Run.newRun(companions(), 'normal', 'tips:down:' + t.seed);
      r.party.forEach(function (rh) { rh.passives = []; rh.passiveRolls = []; rh.hp = DD.Run.heroStats(rh).maxHp; });
      const rh0 = r.party[0];
      function wonWithHero0Down() {
        const lv0 = r.party.map(function (h) { return h.level; });
        const max0 = DD.Run.heroStats(rh0).maxHp;
        DD.Run.startCombat({ act: 1, kind: 'normal' }, 'normal');
        if (C.isDeploying()) C.rollInitiative();
        const u0 = C.heroes().filter(function (u) { return u.runHero === rh0 || u.defId === rh0.id; })[0];
        A.damage(null, u0, 999, { cause: 'other' });
        t.ok(u0.downed, 'hero 0 is down');
        C.finish('victory');
        return { lv: lv0, max: max0 };
      }
      const before = wonWithHero0Down();
      const data = r.pending && r.pending.type === 'rewards' ? r.pending.data : null;
      if (!t.ok(data, 'the won fight moved on to rewards')) return;
      const growth = DD.Run.heroStats(rh0).maxHp - before.max;
      t.ok(rh0.hp === 1 + growth && rh0.scars.length === 1 && rh0.downs === 1 && !rh0.dead, 'won while down: 1 HP (+' + growth + ' if the level-up landed on them), a Scar, one down (' + JSON.stringify({ hp: rh0.hp, scars: rh0.scars, downs: rh0.downs }) + ')');
      t.eq(r.party.reduce(function (n, h, i) { return n + (h.level - before.lv[i]); }, 0), 1, 'the won fight leveled exactly one hero');
      t.ok(data.levelUps && data.levelUps.length === 1, 'the rewards step announces that level-up');
      rh0.downs = 2;
      wonWithHero0Down();
      t.ok(rh0.dead, 'the third down writes them out of the campaign');
    });
    // every tip is checked above, or against the source
    tips.forEach(function (x) { t.ok(checked[x] || SOURCE_ONLY.some(function (re) { return re.test(x); }), 'tip checked: "' + x + '"'); });
    t.log(Object.keys(checked).length + ' of ' + tips.length + ' tips checked in-engine');
  });
})();
