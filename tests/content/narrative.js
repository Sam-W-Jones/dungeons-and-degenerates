/* Dungeons and Degenerates — tests/content/narrative.js
 * Suites "narrative: …" for js/data/events.js (ev_*) and js/data/narrator.js (narration + tips).
 *  - events: registry shape and copy; every choice of every event resolved through the real event API (DD.Run) over
 *    several seeds, its outcome checked against its hint (gold, HP, XP, items, consumables, skills, scars, Blessings,
 *    fights) and every random branch reached; gold costs gate their choices; hero events offered only with their hero
 *    and still safe without; queued event fights start and auto-battle through the real engine.
 *  - narration: every §3.10 key has 8+ lines, tokens only where every caller fills them (static), and in practice
 *    (DD.narrate is recorded during real fights and run flows), 30+ tips, and the tips' numbers re-checked in-engine.
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
    slate: 'ev_sla_noisy_kids', buga: 'ev_buga_reelection',
  };
  // second events for the two newest heroes (DESIGN §11 offers two ideas each)
  const HERO_EXTRA = { ev_sla_sculptor: 'slate', ev_buga_toaster_cult: 'buga' };
  function heroEventList() {
    const out = Object.keys(HERO_EVENTS).map(function (h) { return { hero: h, id: HERO_EVENTS[h] }; });
    Object.keys(HERO_EXTRA).forEach(function (id) { out.push({ hero: HERO_EXTRA[id], id: id }); });
    return out;
  }
  const HERO_NAMES = {
    zarathor: 'Zarathor', syllamin: 'Syllamin', marbles: 'Professor Marbles', marwyn: 'Marwyn', ellaria: 'Ellaria',
    josiah: 'Josiah', sparrow: 'Sparrow', corelos: 'Corelos', slate: 'Slate', buga: 'Mayor Buga',
  };
  // ARCHITECTURE §3.10
  const NARRATION_KEYS = ['combat_start', 'elite_start', 'boss_start', 'victory', 'defeat', 'kill', 'env_kill', 'overkill', 'multi_kill',
    'hero_downed', 'hero_revived', 'hero_death', 'level_up', 'signature', 'round_start', 'enemy_turn', 'shop_greet', 'shop_buy', 'shop_broke',
    'shop_leave', 'tavern_greet', 'rest', 'recruit', 'map_enter', 'act_intro_1', 'act_intro_2', 'act_intro_3', 'act_clear', 'treasure', 'tips',
    'gameover_title', 'victory_title', 'run_start', 'idle_dm'];
  const POCKET_GOLD = 15;
  const CONSOLATION_XP = 15;
  const DEBT_SCAR = 'scar_owes_the_dm';   // Corelos' fine print
  // sentences ending twice ("Fetch!." / "Back In My Day....") when a name brings its own punctuation
  const BAD_PUNCT = /[!?…]\.|\.\.\.\./;
  // lowercase values engine callers can pass for a token (actions.js: hero_downed's culprit is 'gravity' without a source)
  const LOWER_FILLS = { hero_downed: { enemy: 'gravity' } };
  /** 5-word runs of a line (lowercase words, tokens kept), for near-repeat checks. */
  function grams(line) {
    const w = String(line).toLowerCase().replace(/[^a-z0-9{}' ]+/g, ' ').split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i + 5 <= w.length; i++) out.push(w.slice(i, i + 5).join(' '));
    return out;
  }
  /** Sentences of a rendered line that start with a lowercase letter. */
  function lowerStarts(line) {
    const s = String(line).replace(/\.\.\./g, '…');   // an ellipsis does not end the sentence ("okay, so..." in that tone)
    return (s.match(/(?:^|[.!?]["”)]?\s+)[a-z]\w*/g) || []).map(function (m) { return m.trim(); });
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
  /** A fresh run to clone from: act, 200 gold, empty pockets, no Blessings (no gold / XP / heal multipliers), every
   *  hero at about half HP, and hero #1 carrying two scars (for the scar-removal choices). */
  function baseRun(party, act, seed, opts) {
    opts = opts || {};
    DD.Run.newRun(party, 'normal', seed);
    const s = DD.Run.state;
    s.act = act || 1;
    s.gold = opts.gold !== undefined ? opts.gold : 200;
    s.consumables = [];
    s.party.forEach(function (rh) {
      rh.passives = [];
      rh.passiveRolls = [];
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
      xp: s.party.map(function (h) { return h.xp; }),
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
    const c = {
      label: label, b: b, a: a, out: out, s: s, st: star, alive: alive,
      gold: a.gold - b.gold,
      fight: a.queued,
      newItems: added(b.items, a.items),
      newCons: added(b.cons, a.cons),
      learns: a.learns - b.learns,
      ok: function (cond, msg) { return t.ok(cond, label + ': ' + msg); },
      eff: function (i) { return (a.hp[i] - b.hp[i]) - (a.max[i] - b.max[i]); },
      xp: function (i) { return a.xp[i] - b.xp[i]; },
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
    c.xpIs = function (i, n) { return c.ok(c.xp(i) === n, 'hero ' + i + ' gains ' + n + ' XP (got ' + c.xp(i) + ')'); };
    c.xpAll = function (n) { alive.forEach(function (i) { c.xpIs(i, n); }); };
    c.noXp = function (except) { alive.forEach(function (i) { if (i !== except) c.xpIs(i, 0); }); };
    c.noFight = function () { return c.ok(!c.fight && !(out && out.combat), 'no fight queued'); };
    c.fightIs = function (kind) {
      return c.ok(!!c.fight && c.fight.kind === kind && c.fight.act === s.act && !!out && !!out.combat && out.combat.kind === kind,
        'a ' + kind + ' fight of act ' + s.act + ' is queued (' + JSON.stringify(c.fight) + ')');
    };
    c.noItems = function () { return c.ok(c.newItems.length === 0, 'no item gained (' + c.newItems.join(',') + ')'); };
    c.noCons = function () { return c.ok(c.newCons.length === 0, 'no consumable gained'); };
    c.noScars = function () { alive.forEach(function (i) { c.ok(c.newScars(i).length === 0 && c.lostScars(i).length === 0, 'hero ' + i + ' scars unchanged'); }); };
    c.noBless = function () { alive.forEach(function (i) { c.ok(c.blessed(i) === 0, 'hero ' + i + ' rolls no Blessing'); }); };
    c.noSkills = function () { alive.forEach(function (i) { c.ok(c.lvl(i) === 0 && c.nsk(i) === 0, 'hero ' + i + ' skills unchanged'); }); c.ok(c.learns === 0, 'no learn queued'); };
    /** One hero rolled on the Table (a new Blessing level, or the consolation XP when the table had nothing). Returns
     *  the XP that roll gave that hero (0 or CONSOLATION_XP). */
    c.blessXp = function (i) {
      if (c.blessed(i) === 1) return 0;
      c.ok(c.blessed(i) === 0, 'hero ' + i + ' rolled at most once (' + c.blessed(i) + ')');
      return CONSOLATION_XP;
    };
    /** Upgrade (or, maxed out, the consolation XP). Returns the XP it gave. */
    c.upgradeXp = function (i) {
      if (c.nsk(i) === 0 && c.lvl(i) === 1) return 0;
      c.ok(c.nsk(i) === 0 && c.lvl(i) === 0, 'hero ' + i + ' upgrades a skill (levels ' + c.lvl(i) + ', skills ' + c.nsk(i) + ')');
      return CONSOLATION_XP;
    };
    /** Learn (socketed or queued), else upgrade, else the consolation XP. Returns the XP it gave. */
    c.learnXp = function (i) {
      if (c.nsk(i) === 1 && c.lvl(i) === 1) return 0;
      if (c.nsk(i) === 0 && c.lvl(i) === 0 && c.learns === 1) return 0;
      return c.upgradeXp(i);
    };
    /** Exactly one living hero matches pred(i); returns it. */
    c.one = function (pred, what) {
      const hit = alive.filter(pred);
      c.ok(hit.length === 1, 'exactly one hero ' + what + ' (' + hit.join(',') + ')');
      return hit.length ? hit[0] : -1;
    };
    /** A random hero learned (or queued, or upgraded, or took the consolation XP); nobody else gained XP. */
    c.learnOne = function (what) {
      let i;
      if (c.learns === 1) {
        const q = s.learnQueue[s.learnQueue.length - 1];
        i = s.party.findIndex(function (h) { return h.id === q.heroId; });
      } else i = c.one(function (k) { return c.nsk(k) !== 0 || c.lvl(k) !== 0 || c.xp(k) !== 0; }, what);
      if (i >= 0) { c.xpIs(i, c.learnXp(i)); c.noXp(i); }
      return i;
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
        c.noXp(); c.noFight(); c.noItems(); c.noBless();
        if (c.gold === 75) { c.hpSame(); return 'nat20'; }
        if (c.gold === 25) { c.hpSame(); return 'win'; }
        c.goldIs(-25);
        if (c.anyHpChange()) { c.hurtAll(5); return 'nat1'; }
        return 'lose';
      } },
      { branches: ['bless', 'fight'], check: function (c) {
        c.goldIs(0); c.hpSame(); c.noItems(); c.noScars();
        if (c.fight) { c.fightIs('normal'); c.noXp(); c.noBless(); return 'fight'; }
        c.noFight();
        const i = c.one(function (k) { return c.blessed(k) === 1 || c.xp(k) === CONSOLATION_XP; }, 'rolls on the Table');
        if (i >= 0) { c.xpIs(i, c.blessXp(i)); c.noXp(i); }
        return 'bless';
      } },
      det(function (c) { c.goldIs(0); c.xpAll(6); c.hpSame(); c.noFight(); c.noItems(); }),
    ],
    ev_session_cancelled: [
      det(function (c) { c.healAll(0.4); c.goldIs(0); c.noXp(); c.noFight(); }),
      det(function (c) { c.goldIs(45); c.hurtAll(0.1); c.noXp(); c.noFight(); }),
      { branches: ['calm', 'fight'], check: function (c) {
        c.xpAll(12); c.goldIs(0); c.hpSame(); c.noItems();
        if (c.fight) { c.fightIs('normal'); return 'fight'; }
        c.noFight(); return 'calm';
      } },
    ],
    ev_snack_run: [
      det(function (c) { c.goldIs(-25); c.healAll(0.5); c.noXp(); c.noFight(); }),
      { branches: ['tasty', 'sick'], check: function (c) {
        c.goldIs(0); c.noXp(); c.noFight();
        if (c.alive.some(function (i) { return c.eff(i) > 0; })) { c.healAll(0.25); return 'tasty'; }
        c.hurtAll(0.1); return 'sick';
      } },
      det(function (c) { c.potions(1, 0); c.fightIs('normal'); c.hpSame(); c.noXp(); }),
    ],
    ev_trap_hallway: [
      det(function (c) { c.xpAll(8); c.goldIs(15); c.hpSame(); c.noFight(); }),
      { branches: ['coin', 'floor'], check: function (c) {
        c.noXp(); c.noFight();
        if (c.gold === 70) { c.hpSame(); return 'coin'; }
        c.goldIs(0); c.hurtAll(0.2); return 'floor';
      } },
      det(function (c) {
        let best = -1;
        c.alive.forEach(function (i) { if (best < 0 || c.b.hp[i] > c.b.hp[best]) best = i; });
        c.hurt(best, 0.25); c.hpSame(best); c.goldIs(35); c.noXp(); c.noFight();
      }),
    ],
    ev_mimic_meeting: [
      det(function (c) { c.xpAll(12); c.goldIs(0); c.hpSame(); c.noFight(); }),
      det(function (c) {
        const i = c.one(function (k) { return c.eff(k) < 0; }, 'is hugged');
        if (i >= 0) { c.hurt(i, 0.3); c.hpSame(i); }
        c.partyItem('rare'); c.goldIs(0); c.noXp(); c.noFight();
      }),
      { branches: ['chest', 'doug'], check: function (c) {
        c.noXp(); c.hpSame(); c.noItems();
        if (c.fight) { c.fightIs('elite'); c.goldIs(0); return 'doug'; }
        c.goldIs(40); c.noFight(); return 'chest';
      } },
    ],
    ev_goblin_mlm: [
      det(function (c) { c.potions(2, -30); c.noXp(); c.hpSame(); c.noFight(); }),
      { branches: ['natural', 'collapse'], check: function (c) {
        c.noXp(); c.hpSame(); c.noFight();
        if (c.gold === 70) return 'natural';
        c.goldIs(-40); return 'collapse';
      } },
      det(function (c) { c.goldIs(20); c.xpAll(5); c.hpSame(); c.noFight(); }),
    ],
    ev_cursed_clearance: [
      det(function (c) { c.goldIs(-15); c.partyItem('cursed'); c.noXp(); c.hpSame(); c.noFight(); }),
      { branches: ['clean', 'haunted'], check: function (c) {
        c.goldIs(-45); c.partyItem('rare'); c.noXp(); c.noFight();
        const hit = c.alive.filter(function (i) { return c.newScars(i).length > 0; });
        if (!hit.length) return 'clean';
        c.scarOn(hit[0]); return 'haunted';
      } },
      det(function (c) {
        c.xpAll(10); c.goldIs(0); c.noFight();
        const scarred = c.alive.filter(function (i) { return c.b.scars[i].length > 0; });
        const lost = c.alive.filter(function (i) { return c.lostScars(i).length > 0; });
        if (scarred.length) {
          c.ok(lost.length === 1 && c.lostScars(lost[0]).length === 1, 'one scar removed');
          if (lost.length) c.ok(c.lostScars(lost[0])[0] === c.b.scars[lost[0]][c.b.scars[lost[0]].length - 1], 'their latest scar');
        } else c.ok(lost.length === 0, 'nothing to remove');
      }),
    ],
    ev_wizard_did_it: [
      { branches: ['clean', 'backfire'], check: function (c) {
        c.goldIs(0); c.hpSame(); c.noFight(); c.noItems();
        const i = c.one(function (k) { return c.lvl(k) !== 0 || c.xp(k) !== 0; }, 'is pointed at');
        if (i < 0) return 'clean';
        c.xpIs(i, c.upgradeXp(i)); c.noXp(i);
        const scarred = c.alive.filter(function (k) { return c.newScars(k).length > 0; });
        if (!scarred.length) return 'clean';
        c.scarOn(i); return 'backfire';
      } },
      { branches: ['rich', 'butterflies'], check: function (c) {
        c.noXp(); c.hpSame(); c.noFight();
        if (c.gold > 0) { c.goldIs(70); return 'rich'; }
        c.goldIs(-30); return 'butterflies';
      } },
      det(function (c) { c.potions(1, 0); c.noXp(); c.hpSame(); c.noFight(); }),
    ],
    ev_fountain_youth: [
      { branches: ['fine', 'puberty'], check: function (c) {
        c.healAll(1); c.goldIs(0); c.noXp(); c.noFight();
        const hit = c.alive.filter(function (i) { return c.newScars(i).length > 0; });
        if (!hit.length) return 'fine';
        c.scarOn(hit[0]); return 'puberty';
      } },
      det(function (c) { c.potions(2, 0); c.noXp(); c.hpSame(); c.noFight(); }),
      { branches: ['king', 'frog'], check: function (c) {
        c.goldIs(0); c.noXp(); c.hpSame(); c.noFight();
        if (c.newItems.length) { c.partyItem('legendary'); c.noScars(); return 'king'; }
        const hit = c.alive.filter(function (i) { return c.newScars(i).length > 0; });
        c.ok(hit.length === 1, 'the kisser gains a scar');
        if (hit.length) c.scarOn(hit[0]);
        return 'frog';
      } },
    ],
    ev_career_fair: [
      det(function (c) { c.xpAll(20); c.hurtAll(0.15); c.goldIs(0); c.noFight(); }),
      det(function (c) { c.learnOne('attends'); c.goldIs(0); c.hpSame(); c.noFight(); }),
      { branches: ['clean', 'caught'], check: function (c) {
        c.goldIs(30); c.noXp(); c.hpSame();
        if (c.fight) { c.fightIs('normal'); return 'caught'; }
        c.noFight(); return 'clean';
      } },
    ],
    ev_overdue_book: [
      det(function (c) { c.learnOne('reads'); c.goldIs(0); c.hpSame(); c.noFight(); }),
      det(function (c) { c.goldIs(-40); c.xpAll(15); c.healAll(0.2); c.noFight(); }),
      det(function (c) {
        const i = c.one(function (k) { return c.blessed(k) === 1 || c.xp(k) === CONSOLATION_XP; }, 'absorbs the book');
        if (i >= 0) { c.xpIs(i, c.blessXp(i)); c.noXp(i); }
        c.fightIs('elite'); c.goldIs(0); c.hpSame();
      }),
    ],
    ev_owlbear_daycare: [
      det(function (c) { c.hurtAll(0.2); c.potions(1, 50); c.noXp(); c.noFight(); }),
      { branches: ['nap', 'mama'], check: function (c) {
        c.healAll(0.35); c.goldIs(0); c.noXp();
        if (c.fight) { c.fightIs('elite'); return 'mama'; }
        c.noFight(); return 'nap';
      } },
      det(function (c) { c.xpAll(10); c.fightIs('normal'); c.goldIs(0); c.hpSame(); }),
    ],
    ev_retcon: [
      det(function (c) { c.healAll(0.6); c.goldIs(0); c.noXp(); c.noFight(); }),
      det(function (c) {
        const total = c.b.scars.reduce(function (n, sc, i) { return n + (c.alive.indexOf(i) >= 0 ? sc.length : 0); }, 0);
        const lost = c.alive.reduce(function (n, i) { return n + c.lostScars(i).length; }, 0);
        c.ok(lost === Math.min(2, total), 'removes min(2, scars) = ' + Math.min(2, total) + ' (got ' + lost + ')');
        c.goldIs(total ? 0 : 40); c.noXp(); c.noFight();
      }),
      det(function (c) { c.partyItem('rare'); c.fightIs('normal'); c.goldIs(0); c.noXp(); c.hpSame(); }),
    ],
    ev_rules_lawyer: [
      det(function (c) {
        let who = -1;
        c.alive.forEach(function (i) { if (c.b.scars[i].length && (who < 0 || c.b.scars[i].length > c.b.scars[who].length)) who = i; });
        c.ok(who >= 0 && c.a.scars[who].length === 0, 'the most scarred hero loses every scar');
        c.alive.forEach(function (i) { if (i !== who) c.ok(c.lostScars(i).length === 0, 'hero ' + i + ' keeps its scars'); });
        c.goldIs(-45); c.noXp(); c.noFight();
      }),
      { branches: ['won', 'countersued'], check: function (c) {
        c.noXp(); c.hpSame();
        if (c.fight) { c.fightIs('elite'); c.goldIs(0); return 'countersued'; }
        c.goldIs(100); c.noFight(); return 'won';
      } },
      det(function (c) {
        c.goldIs(-25);
        const i = c.one(function (k) { return c.blessed(k) === 1 || c.xp(k) === CONSOLATION_XP; }, 'gets the loophole');
        if (i >= 0) { c.xpIs(i, c.blessXp(i)); c.noXp(i); }
        c.hpSame(); c.noFight();
      }),
    ],
    ev_infernal_dmv: [
      det(function (c) { c.xpAll(25); c.hurtAll(0.2); c.goldIs(0); c.noFight(); }),
      det(function (c) { c.partyItem('rare'); c.fightIs('normal'); c.goldIs(0); c.noXp(); c.hpSame(); }),
      det(function (c) {
        c.goldIs(-50); c.healAll(0.3); c.noFight();
        const i = c.one(function (k) { return c.lvl(k) !== 0 || c.xp(k) !== 0; }, 'trains');
        if (i >= 0) { c.xpIs(i, c.upgradeXp(i)); c.noXp(i); }
      }),
    ],
    ev_dragon_yard_sale: [
      det(function (c) { c.goldIs(-1); c.partyItem('common'); c.noXp(); c.hpSame(); c.noFight(); }),
      det(function (c) { c.goldIs(-120); c.partyItem('legendary'); c.noXp(); c.hpSame(); c.noFight(); }),
      { branches: ['charmed', 'offended'], check: function (c) {
        c.goldIs(0); c.noXp(); c.noFight();
        if (c.newItems.length) { c.partyItem('legendary'); c.hpSame(); return 'charmed'; }
        c.hurtAll(0.25); return 'offended';
      } },
    ],
    ev_dm_notes: [
      { branches: ['safe', 'caught'], check: function (c) {
        c.xpAll(20); c.goldIs(0); c.hpSame();
        if (c.fight) { c.fightIs('elite'); return 'caught'; }
        c.noFight(); return 'safe';
      } },
      det(function (c) {
        const i = c.one(function (k) { return c.blessed(k) === 1 || c.xp(k) === CONSOLATION_XP; }, 'swaps the dice');
        if (i >= 0) { c.xpIs(i, c.blessXp(i)); c.noXp(i); }
        c.hurtAll(0.1); c.goldIs(0); c.noFight();
      }),
      det(function (c) { c.healAll(0.5); c.goldIs(0); c.noXp(); c.noFight(); }),
    ],

    // ---- hero events (c.st = the hero's party index) ----
    ev_zar_bling_merchant: [
      det(function (c) { c.goldIs(-50); c.heroItem(c.st, 'rare'); c.noXp(); c.hpSame(); c.noFight(); }),
      { branches: ['free', 'boom'], check: function (c) {
        c.noXp(); c.noFight();
        if (c.newItems.length) { c.heroItem(c.st, 'rare'); c.goldIs(0); c.hpSame(); return 'free'; }
        c.hurt(c.st, 0.25); c.hpSame(c.st); c.goldIs(0); c.noScars();
        c.ok(c.out.text.indexOf('loses ' + (-c.eff(c.st)) + ' HP') >= 0, 'the outcome names the HP lost (' + (-c.eff(c.st)) + ')');
        return 'boom';
      } },
      det(function (c) { c.xpIs(c.st, 15); c.noXp(c.st); c.goldIs(0); c.hpSame(); c.noFight(); }),
    ],
    ev_syl_rap_battle: [
      { branches: ['win', 'choke'], check: function (c) {
        c.hpSame(); c.noFight(); c.noItems();
        if (c.gold === 30) { c.xpIs(c.st, c.upgradeXp(c.st)); c.noXp(c.st); c.noScars(); return 'win'; }
        c.goldIs(0); c.scarOn(c.st); c.noXp(); c.noSkills(); return 'choke';
      } },
      det(function (c) { c.xpAll(12); c.goldIs(0); c.hpSame(); c.noFight(); }),
      det(function (c) { c.xpIs(c.st, c.blessXp(c.st)); c.noXp(c.st); c.fightIs('normal'); c.goldIs(0); c.hpSame(); }),
    ],
    ev_mar_lost_marbles: [
      det(function (c) { c.xpIs(c.st, c.learnXp(c.st)); c.noXp(c.st); c.fightIs('normal'); c.goldIs(0); c.hpSame(); }),
      det(function (c) { c.goldIs(-30); c.xpIs(c.st, c.upgradeXp(c.st)); c.noXp(c.st); c.hpSame(); c.noFight(); }),
      det(function (c) { c.heal(c.st, 1); c.hpSame(c.st); c.xpIs(c.st, 10); c.noXp(c.st); c.goldIs(0); c.noFight(); }),
    ],
    ev_mrw_mirror: [
      det(function (c) { c.xpIs(c.st, c.blessXp(c.st)); c.noXp(c.st); c.goldIs(0); c.hpSame(); c.noFight(); }),
      { branches: ['shatter', 'unlucky'], check: function (c) {
        c.goldIs(0); c.noXp(); c.hpSame(); c.noFight();
        if (c.newItems.length) { c.heroItem(c.st, 'rare'); c.noScars(); return 'shatter'; }
        c.scarOn(c.st); return 'unlucky';
      } },
      det(function (c) {
        c.xpIs(c.st, 25); c.noXp(c.st); c.goldIs(0); c.noFight();
        c.ok(c.eff(c.st) === 0, 'Marwyn keeps his HP');
        c.alive.forEach(function (i) { if (i !== c.st) c.hurt(i, 0.1); });
      }),
    ],
    ev_ell_lost_corgi: [
      det(function (c) { c.goldIs(45); c.xpAll(8); c.hpSame(); c.noFight(); }),
      det(function (c) { c.xpIs(c.st, c.learnXp(c.st)); c.noXp(c.st); c.goldIs(0); c.hpSame(); c.noFight(); }),
      { branches: ['dig', 'gnolls'], check: function (c) {
        c.goldIs(0); c.noXp(); c.hpSame();
        if (c.fight) { c.fightIs('normal'); c.noItems(); return 'gnolls'; }
        c.heroItem(c.st, 'rare'); c.noFight(); return 'dig';
      } },
    ],
    ev_jos_rat_union: [
      det(function (c) { c.potions(2, -35); c.xpIs(c.st, c.upgradeXp(c.st)); c.noXp(c.st); c.hpSame(); c.noFight(); }),
      det(function (c) { c.hurtAll(0.1); c.xpIs(c.st, c.blessXp(c.st)); c.noXp(c.st); c.goldIs(0); c.noFight(); }),
      det(function (c) { c.xpIs(c.st, 15); c.noXp(c.st); c.fightIs('normal'); c.goldIs(0); c.hpSame(); }),
    ],
    ev_spa_blood_bank: [
      det(function (c) { c.hurt(c.st, 0.3); c.hpSame(c.st); c.goldIs(45); c.noXp(); c.noFight(); }),
      det(function (c) { c.goldIs(-30); c.healAll(0.5); c.noXp(); c.noFight(); }),
      det(function (c) { c.heroItem(c.st, 'rare'); c.fightIs('elite'); c.goldIs(0); c.noXp(); c.hpSame(); }),
    ],
    ev_cor_fine_print: [
      det(function (c) {
        c.xpIs(c.st, c.upgradeXp(c.st) + c.blessXp(c.st)); c.noXp(c.st); c.goldIs(0); c.hpSame(); c.noFight();
        // the fine print: the debt scar (a random one if he already owes)
        c.scarOn(c.st);
        const owed = c.b.scars[c.st].indexOf(DEBT_SCAR) >= 0;
        if (DD.getScar(DEBT_SCAR)) c.ok((c.newScars(c.st)[0] === DEBT_SCAR) !== owed, 'fine print: ' + c.newScars(c.st).join(',') + (owed ? ' (already owed)' : ''));
      }),
      det(function (c) { c.xpAll(12); c.hurt(c.st, 0.25); c.hpSame(c.st); c.goldIs(0); c.noFight(); }),
      det(function (c) { c.xpIs(c.st, c.learnXp(c.st)); c.noXp(c.st); c.fightIs('normal'); c.goldIs(0); c.hpSame(); }),
    ],
    ev_sla_noisy_kids: [
      det(function (c) { c.potions(1, 0); c.xpIs(c.st, c.blessXp(c.st)); c.noXp(c.st); c.hpSame(); c.noFight(); }),
      det(function (c) { c.heal(c.st, 1); c.hpSame(c.st); c.xpIs(c.st, 20); c.noXp(c.st); c.goldIs(0); c.noFight(); }),
      { branches: ['fine', 'dad'], check: function (c) {
        c.xpIs(c.st, c.learnXp(c.st)); c.noXp(c.st); c.goldIs(0); c.hpSame();
        if (c.fight) { c.fightIs('normal'); return 'dad'; }
        c.noFight(); return 'fine';
      } },
    ],
    ev_sla_sculptor: [
      det(function (c) { c.hurt(c.st, 0.25); c.hpSame(c.st); c.xpIs(c.st, c.upgradeXp(c.st)); c.noXp(c.st); c.goldIs(0); c.noFight(); }),
      det(function (c) { c.xpIs(c.st, 15); c.noXp(c.st); c.goldIs(0); c.hpSame(); c.noFight(); }),
      det(function (c) { c.goldIs(-25); c.xpIs(c.st, c.blessXp(c.st)); c.noXp(c.st); c.hpSame(); c.noFight(); }),
    ],
    ev_buga_toaster_cult: [
      { branches: ['quiet', 'heretic'], check: function (c) {
        c.goldIs(60); c.noXp(); c.hpSame(); c.noItems();
        if (c.fight) { c.fightIs('normal'); return 'heretic'; }
        c.noFight(); return 'quiet';
      } },
      det(function (c) { c.healAll(0.3); c.xpIs(c.st, c.blessXp(c.st)); c.noXp(c.st); c.goldIs(0); c.noFight(); }),
      { branches: ['golden', 'crispy'], check: function (c) {
        c.goldIs(0); c.noXp(); c.noFight();
        if (c.newItems.length) { c.heal(c.st, 1); c.hpSame(c.st); c.heroItem(c.st, 'rare'); c.noScars(); return 'golden'; }
        c.hurt(c.st, 0.3); c.hpSame(c.st); c.scarOn(c.st); return 'crispy';
      } },
    ],
    ev_buga_reelection: [
      det(function (c) { c.goldIs(70); c.scarOn(c.st); c.noXp(); c.hpSame(); c.noFight(); }),
      det(function (c) { c.goldIs(-30); c.xpIs(c.st, 10 + c.upgradeXp(c.st)); c.alive.forEach(function (i) { if (i !== c.st) c.xpIs(i, 10); }); c.hpSame(); c.noFight(); }),
      { branches: ['landslide', 'riot'], check: function (c) {
        c.goldIs(0); c.noXp(); c.hpSame();
        if (c.fight) { c.fightIs('normal'); c.noItems(); return 'riot'; }
        c.heroItem(c.st, 'rare'); c.noFight(); return 'landslide';
      } },
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
    t.ok(evs.length >= 29, evs.length + ' events registered (ev_*)');
    const acts = { 1: 0, 2: 0, 3: 0 };
    evs.forEach(function (ev) {
      const L = 'event ' + ev.id;
      t.ok(typeof ev.title === 'string' && ev.title.length >= 4 && ev.title.length <= 40, L + ': title "' + ev.title + '"');
      t.ok(typeof ev.icon === 'string' && ev.icon.length > 0 && ev.icon.length <= 4, L + ': one emoji icon');
      t.ok(Array.isArray(ev.acts) && ev.acts.length && ev.acts.every(function (a) { return a >= 1 && a <= 3; }), L + ': acts ' + JSON.stringify(ev.acts));
      t.ok(ev.unique !== false, L + ': unique');
      const text = typeof ev.text === 'function' ? ev.text(null) : ev.text;
      t.ok(typeof text === 'string' && text.length >= 120 && text.length <= 600 && !BAD_TEXT.test(text), L + ': text (' + (text || '').length + ' chars)');
      const sentences = (String(text).match(/[.!?]["”)]?(?=\s+["“A-Z(]|\s*$)/g) || []).length;
      t.ok(sentences >= 2 && sentences <= 5, L + ': ' + sentences + ' sentences (DESIGN: 2-5)');
      t.ok(Array.isArray(ev.choices) && ev.choices.length >= 2 && ev.choices.length <= 3, L + ': 2-3 choices');
      ev.choices.forEach(function (ch, i) {
        t.ok(typeof ch.label === 'string' && ch.label.length >= 3 && ch.label.length <= 40, L + ' choice ' + i + ': label "' + ch.label + '"');
        t.ok(typeof ch.hint === 'string' && ch.hint.length >= 8 && ch.hint.length <= 170 && !BAD_TEXT.test(ch.hint), L + ' choice ' + i + ': hint "' + ch.hint + '"');
        t.ok(typeof ch.resolve === 'function', L + ' choice ' + i + ': resolve');
      });
      t.ok(ev.choices.some(function (ch) { return /\d+%|Pay \d+ gold|loses?|Fight|scar/i.test(ch.hint); }), L + ': at least one risk / reward trade');
      t.ok(ev.choices.some(function (ch) { return !/^Pay /.test(ch.hint); }), L + ': at least one choice is free');
      ev.acts.forEach(function (a) { if (!ev.hero) acts[a]++; });
    });
    [1, 2, 3].forEach(function (a) { t.ok(acts[a] >= 8, 'act ' + a + ' has ' + acts[a] + ' generic events'); });
    // at least one hero event per hero, gated on that hero and showing its portrait
    heroEventList().forEach(function (he) {
      const hid = he.hero;
      const ev = DD.getEvent(he.id);
      if (!t.ok(ev, hid + ': hero event ' + he.id)) return;
      t.eq(ev.hero, hid, hid + ': event portrait hero');
      t.ok(typeof ev.requires === 'function', hid + ': requires its hero');
      t.ok(ev.acts.length === 3, hid + ': offered in every act');
      t.ok(ev.choices.every(function (ch) { return ch.hint.indexOf(HERO_NAMES[hid]) >= 0 || /every hero|Every hero|Pay \d+ gold|Fight|gain \d+ gold|Gain \d+ gold|random consumable/.test(ch.hint); }),
        hid + ': hints name the hero they reward');
      t.ok(ev.choices.some(function (ch) { return ch.hint.indexOf(HERO_NAMES[hid]) >= 0; }), hid + ': at least one choice rewards ' + HERO_NAMES[hid]);
    });
    t.eq(evs.filter(function (ev) { return ev.hero; }).length, heroEventList().length, 'hero events: ' + heroEventList().length);
    Object.keys(HERO_EVENTS).forEach(function (hid) {
      t.ok(evs.some(function (ev) { return ev.hero === hid; }), hid + ': has a hero event');
    });
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

  T.suite('narrative: events — fallbacks (full pockets, full sockets, no scars)', function (t) {
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
      // everything maxed and nothing left to learn: the consolation XP
      const s3 = fromBase(base, 'maxed');
      const r3 = s3.party[0];
      s3.party.slice(1).forEach(function (h) { h.dead = true; h.hp = 0; });
      const own = DD.Run.learnableSkills(0);
      own.forEach(function (id) { r3.skills.push({ id: id, level: 1 }); });
      r3.skills.forEach(function (k) { k.level = (DD.getSkill(k.id) && DD.getSkill(k.id).levels.length) || 1; });
      if (!DD.Run.learnableSkills(0, { generic: true }).length) {
        DD.Run.openEvent('ev_overdue_book', null, { noShow: true });
        const xp0 = r3.xp;
        const out = DD.Run.chooseEventOption(0);
        t.eq(r3.xp - xp0, CONSOLATION_XP, 'nothing to learn or upgrade: ' + CONSOLATION_XP + ' XP instead');
        t.ok(/XP instead/.test(out.text), 'and the outcome says so');
      } else t.log('generic skills registered: the consolation path is unreachable for this hero');
      // retcon without scars pays out
      const clean = baseRun(party, 2, 'narr:clean:' + t.seed, { scars: false });
      const s4 = fromBase(clean, 'retcon');
      DD.Run.openEvent('ev_retcon', null, { noShow: true });
      const g4 = s4.gold;
      DD.Run.chooseEventOption(1);
      t.eq(s4.gold - g4, 40, 'retcon without scars: 40 gold');
      // Dale without scars leaves a note
      fromBase(clean, 'dale');
      DD.Run.openEvent('ev_cursed_clearance', null, { noShow: true });
      t.ok(/polite note/.test(DD.Run.chooseEventOption(2).text), 'Dale without scars: polite note');

      // a skill name with its own punctuation ("Fetch!") still ends the sentence once
      const s5 = fromBase(base, 'punct');
      s5.party.slice(1).forEach(function (h) { h.dead = true; h.hp = 0; });
      const renamed = DD.Run.learnableSkills(0).map(function (id) { const d = DD.getSkill(id); const was = d.name; d.name = was + '!'; return { d: d, was: was }; });
      try {
        if (renamed.length && s5.party[0].skills.length < 4) {
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
    t.eq(N.KEYS.slice().sort().join(','), NARRATION_KEYS.slice().sort().join(','), 'the token table covers exactly the §3.10 keys');
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
      // every line fills cleanly with its callers' vars
      const vars = { hero: 'Zarathor', enemy: 'Goblin Grunt', n: 12, gold: 30, name: 'Sparrow' };
      const some = {};
      (N.TOKENS[k] || []).forEach(function (tk) { some[tk] = vars[tk]; });
      mine.forEach(function (l) { t.ok(!/\{\w+\}/.test(DD.util.fmt(l, some)), k + ': fills "' + l + '"'); });
      // no sentence starts lowercase, even with the lowercase values a caller can pass ('gravity' for a culprit-less down)
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
      // combat_start / elite_start / boss_start
      sb({ heroes: [H(1, 4)], enemies: [E(7, 7)], kind: 'elite' });
      sb({ heroes: [H(1, 4)], enemies: [E(7, 7)], kind: 'boss' });
      sb({ w: 10, h: 10, heroes: [H(1, 4), H(1, 6, 'test_mage')],
        enemies: [E(5, 5), E(6, 6), E(7, 1), E(7, 3), E(8, 8), E(6, 2), E(5, 8), E(4, 1)], kind: 'normal' });
      const h = DD.Combat.heroes()[0];
      // round_start + enemy_turn (enemies do not plan in the sandbox)
      DD.Combat.endTurn();
      DD.Combat.endTurn();
      // signature
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

      // screens: they pass no vars
      if (DD.UI && typeof DD.UI.narrate === 'function') {
        ['map_enter', 'act_intro_1', 'act_intro_2', 'act_intro_3', 'tips', 'gameover_title', 'victory_title', 'shop_greet', 'shop_buy',
          'shop_broke', 'shop_leave', 'tavern_greet', 'victory', 'defeat', 'act_clear'].forEach(function (k) { DD.UI.narrate(k, {}, []); });
      }
      // keys with no caller yet: a future caller passing nothing must still get clean lines
      ['hero_death', 'level_up', 'idle_dm'].forEach(function (k) { DD.narrate(k, {}, DD.rng); });
    });
    const T2 = DD.Narrator.TOKENS;
    const keys = {};
    /** The line came from one of my templates (other authors may share a key). */
    function mineLine(c) { return (DD.Narrator.LINES[c.key] || []).some(function (l) { return DD.util.fmt(l, c.vars) === c.line; }); }
    calls.forEach(function (c) {
      keys[c.key] = true;
      if (!(c.key in T2)) return;   // other authors' own keys
      t.ok(typeof c.line === 'string' && c.line.length > 0 && !/\{\w+\}/.test(c.line), c.key + ': "' + c.line + '"');
      T2[c.key].forEach(function (tk) { t.ok(c.vars[tk] !== undefined, c.key + ': the caller fills {' + tk + '} (vars ' + JSON.stringify(c.vars) + ')'); });
      if (mineLine(c)) t.eq(lowerStarts(c.line).length, 0, c.key + ': sentences start uppercase ("' + c.line + '")');
    });
    t.ok(calls.some(function (c) { return c.key === 'hero_downed' && c.vars.enemy === 'gravity'; }), 'a culprit-less down was narrated (enemy: gravity)');
    const expected = ['combat_start', 'elite_start', 'boss_start', 'kill', 'overkill', 'env_kill', 'multi_kill', 'round_start', 'enemy_turn',
      'treasure', 'hero_downed', 'hero_revived', 'victory', 'defeat', 'run_start', 'shop_greet', 'shop_broke', 'shop_buy', 'tavern_greet', 'rest',
      'act_clear', 'hero_death', 'level_up', 'idle_dm'];
    if (DD.Combat.heroes().length) expected.push('signature');
    if (DD.UI && DD.UI.narrate) expected.push('map_enter', 'act_intro_1', 'tips', 'gameover_title', 'victory_title', 'shop_leave');
    expected.forEach(function (k) { t.ok(keys[k], k + ' was narrated in practice'); });
    t.ok(keys.recruit || !Object.keys(DD.defs.heroes).length, 'recruit was narrated in practice');
    t.log(calls.length + ' narration calls recorded over ' + Object.keys(keys).length + ' keys');
  });

  // ---- the tips are true ---------------------------------------------------------------------------------------
  T.suite('narrative: tips — 30+ and their numbers checked in-engine', function (t) {
    const tips = (DD.Narrator && DD.Narrator.LINES.tips) || [];
    t.ok(tips.length >= 30, tips.length + ' tips');
    if (!DD.Combat || !DD.Act) { t.skip('engine not loaded'); return; }
    const A = DD.Act;
    function sb(cfg) { return DD.Combat.sandbox(Object.assign({ w: 8, h: 8, seed: 'tips:' + t.seed, noPlan: true }, cfg)); }
    function H(x, y, id) { return { id: id || 'test_knight', x: x, y: y }; }
    function E(x, y, id) { return { id: id || 'test_grunt', x: x, y: y }; }
    function hero(i) { return DD.Combat.heroes()[i || 0]; }
    function foe(i) { return DD.Combat.enemies()[i || 0]; }
    function tip(re) { const hit = tips.filter(function (x) { return re.test(x); }); t.eq(hit.length, 1, 'one tip matches ' + re); return hit[0]; }
    const savedRng = DD.rng;
    DD.rng = DD.RNG('tips:' + t.seed);
    try {
      // Guard
      tip(/\+2 Block for every AP left/);
      sb({ heroes: [H(1, 1)], enemies: [E(6, 6)] });
      hero().ap = 3;
      const block0 = hero().block;
      let guard = -1;
      const off = DD.Events.on('turn:enemy', function () { guard = hero().block - block0; });
      DD.Combat.endTurn();
      off();
      t.eq(guard, 6, 'Guard: 3 AP left -> +6 Block');
      // Poison ignores Block, Burn does not
      tip(/Poison ignores Block\. Burn does not/);
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
      // pits, bump, lava
      tip(/Non-boss enemies pushed into a pit/);
      tip(/fall into a pit lose 25% of their max HP/);
      tip(/bump damage \(usually 3\)/);
      tip(/Lava deals 8 fire damage and Burn 2/);
      sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
      DD.Grid.tile(3, 3).t = 'pit';
      A.push(hero(), foe(), { x: 1, y: 0 }, 1);
      t.ok(DD.Combat.state.units.filter(function (u) { return u.side === 'enemy'; })[0].dead, 'pit: YEET');
      t.eq(DD.Combat.state.hype, 20, 'environmental kill: +20 Hype');
      sb({ heroes: [H(2, 3)], enemies: [E(1, 3)] });
      DD.Grid.tile(3, 3).t = 'pit';
      const hh = hero(), max = hh.maxHp;
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
      // intent anchors: 'self' attacks move with a pushed enemy, 'ground' ones keep their tiles
      tip(/Attacks anchored to an enemy move with it/);
      tip(/ground-targeted ones stay on their red tiles when you push the attacker/);
      if (DD.AI && DD.AI.makeIntent && DD.AI.intentTiles) {
        sb({ heroes: [H(1, 3)], enemies: [E(3, 3)] });
        const gr = foe();
        const gdef = DD.getEnemy(gr.defId);
        const sk = gdef && gdef.skills && gdef.skills[0];
        const onGround = DD.AI.makeIntent(gr, sk, hero(), { anchor: 'ground', noCooldown: true, noAdd: true });
        const onSelf = DD.AI.makeIntent(gr, sk, hero(), { anchor: 'self', noCooldown: true, noAdd: true });
        const key = function (ts) { return (ts || []).map(function (p) { return p.x + ',' + p.y; }).sort().join(' '); };
        const g0 = key(DD.AI.intentTiles(gr, onGround)), s0 = key(DD.AI.intentTiles(gr, onSelf));
        A.push(hero(), gr, { x: 0, y: 1 }, 1);
        t.ok(gr.y === 4 && g0.length > 0, 'the attacker was pushed');
        t.eq(key(DD.AI.intentTiles(gr, onGround)), g0, 'a ground-targeted attack keeps its tiles');
        t.ok(key(DD.AI.intentTiles(gr, onSelf)) !== s0, 'an enemy-anchored attack moves with it (' + s0 + ' -> ' + key(DD.AI.intentTiles(gr, onSelf)) + ')');
      }
      // Hype: kill +8, multi-hit +4
      tip(/Kills give \+8 Hype\. Environmental kills .* give \+20 instead/);
      tip(/2 or more foes gives \+4 Hype/);
      sb({ heroes: [H(1, 3)], enemies: [E(2, 3), E(5, 5), E(6, 6)] });
      A.damage(hero(), foe(), 99, { cause: 'skill' });
      t.eq(DD.Combat.state.hype, 8, 'kill: +8 Hype');
      A.beginSkill(hero(), DD.getSkill(hero().basic.id));
      DD.Combat.enemies().filter(function (u) { return !u.dead; }).forEach(function (u) { A.damage(hero(), u, 1, { cause: 'skill' }); });
      A.endSkill();
      t.eq(DD.Combat.state.hype, 12, 'a skill hitting 2 foes: +4 Hype');
      // high ground
      tip(/higher ground deal 25% more damage/);
      sb({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
      DD.Grid.tile(1, 3).h = 1;
      const f = foe();
      A.damage(hero(), f, 8, { cause: 'skill' });
      t.eq(f.maxHp - f.hp, 10, 'high ground: 8 -> 10');
      // Help Up
      tip(/Help Up a downed hero for 2 AP\. They return with 25%/);
      sb({ heroes: [H(1, 3), H(1, 4, 'test_mage')], enemies: [E(7, 7)] });
      const down = hero(1);
      A.damage(null, down, 999, { cause: 'other' });
      const helper = hero(0);
      helper.ap = 3;
      const opt = DD.Combat.interactions(helper).filter(function (o) { return o.kind === 'helpUp'; })[0];
      t.ok(opt && opt.ap === 2, 'Help Up costs 2 AP');
      if (opt) DD.Combat.interact(helper, opt.x, opt.y);
      t.ok(!down.downed && down.hp === Math.round(down.maxHp * 0.25), 'Help Up: back at 25% max HP');
      // shocked water
      tip(/4 lightning damage \(6 if Wet\) and a Stun/);
      sb({ heroes: [H(0, 0)], enemies: [E(3, 3), E(4, 3)] });
      DD.Grid.tile(3, 3).t = 'water';
      DD.Grid.tile(4, 3).t = 'water';
      A.addStatus(foe(1), 'wet', { turns: 2 });
      A.applyElement(3, 3, 'lightning', hero());
      t.ok(foe(0).maxHp - foe(0).hp === 4 && A.hasStatus(foe(0), 'stun'), 'shock: 4 + Stun');
      t.ok(foe(1).maxHp - foe(1).hp === 6 && A.hasStatus(foe(1), 'stun'), 'shock: 6 if Wet');
      // explosive barrel
      tip(/Explosive barrels .* 8 fire damage/);
      sb({ heroes: [H(0, 0)], enemies: [E(3, 2)] });
      A.placeObject(3, 3, 'barrel_explosive');
      A.damageObject(hero(), 3, 3, 99);
      t.eq(foe().maxHp - foe().hp, 8, 'barrel: 8 fire damage next to it');
      // Smash
      tip(/Smash objective objects .* 1 AP for 5 damage/);
      sb({ heroes: [H(2, 2)], enemies: [E(7, 7)], objective: { type: 'destroy', objId: 'totem', count: 1 } });
      A.placeObject(3, 2, 'totem');
      const sm = DD.Combat.interactions(hero()).filter(function (o) { return o.kind === 'smash'; })[0];
      t.ok(sm && sm.ap === 1 && sm.dmg === 5, 'Smash: 1 AP, 5 damage');
      // fountain
      tip(/Fountains heal 10 HP for 1 AP/);
      sb({ heroes: [H(2, 2)], enemies: [E(7, 7)] });
      A.placeObject(3, 2, 'fountain');
      hero().hp = 5;
      hero().ap = 3;
      DD.Combat.interact(hero(), 3, 2);
      t.ok(hero().hp === 15 && hero().ap === 2, 'fountain: +10 HP for 1 AP');
      // Frozen +50% physical, Marked +stacks, sleep wakes, stun does not
      tip(/Frozen units take 50% more physical damage/);
      tip(/Marked unit takes extra damage from the next hit, equal to its Mark stacks/);
      tip(/Sleeping units wake up when damaged\. Stunned ones do not/);
      sb({ heroes: [H(0, 0)], enemies: [E(3, 3), E(5, 5), E(6, 6)] });
      const [fz, mk, zz] = DD.Combat.enemies().slice(0, 3);
      [fz, mk, zz].forEach(function (u) { u.maxHp = u.hp = 40; });
      A.addStatus(fz, 'frozen', { turns: 1 });
      A.damage(hero(), fz, 10, { cause: 'skill' });
      t.eq(fz.maxHp - fz.hp, 15, 'frozen: 10 -> 15');
      A.addStatus(mk, 'marked', { stacks: 3 });
      A.damage(hero(), mk, 4, { cause: 'skill' });
      t.ok(mk.maxHp - mk.hp === 7 && !A.hasStatus(mk, 'marked'), 'marked: +3 once');
      A.addStatus(zz, 'sleep', { turns: 2 });
      A.addStatus(mk, 'stun', { turns: 1 });
      A.damage(hero(), zz, 1, { cause: 'skill' });
      A.damage(hero(), mk, 1, { cause: 'skill' });
      t.ok(!A.hasStatus(zz, 'sleep') && A.hasStatus(mk, 'stun'), 'damage wakes the sleeper, not the stunned');
      // difficulty
      tip(/Brutal: enemies get 25% more HP and 20% more damage/);
      const D = DD.Combat.DIFFICULTY;
      t.ok(D && D.brutal.hp === 1.25 && D.brutal.dmg === 1.2, 'brutal multipliers');
      // armor
      tip(/Armor reduces each attack by its value, down to a minimum of 1/);
      sb({ heroes: [H(0, 0)], enemies: [E(3, 3)] });
      foe().armor = 5;
      A.damage(hero(), foe(), 3, { cause: 'skill' });
      t.eq(foe().maxHp - foe().hp, 1, 'armor: min 1');
      A.addStatus(foe(), 'poison', { stacks: 2 });
      const hp1 = foe().hp;
      DD.Hooks.fire('onTurnStart', foe(), foe());
      t.eq(hp1 - foe().hp, 2, 'poison ignores armor');
      // Marbles hops, Josiah's pocket (only when the real heroes are loaded)
      const mar = DD.getHero('marbles');
      tip(/Professor Marbles can hop up 2 levels/);
      if (mar && mar.skillPool && mar.flags) t.ok(mar.flags.hop === true, 'Marbles has the hop flag');
      const jos = DD.getHero('josiah');
      tip(/Josiah adds a fourth/);
      if (jos && jos.skillPool && jos.startingSkills && jos.basic && jos.basic.indexOf('jos') === 0) t.ok((jos.consumableSlots || (jos.passive && jos.passive.consumableSlots)) === 1, 'Josiah adds one pocket');
    } finally {
      DD.rng = savedRng;
    }
    // run-layer numbers
    runLab(t, function () {
      tip(/rest \(35% heal for everyone and one scar treated\)/);
      tip(/Clearing an act heals every hero for 50%/);
      tip(/The party shares 3 consumable pockets/);
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
      // still down when the fight is won: 1 HP + a Scar, one down, half XP; the third down writes them out
      tip(/Heroes still down when a fight is won get up at 1 HP with a Scar/);
      tip(/counts as a down\. The third one writes them out of the campaign/);
      tip(/Heroes who end a fight downed only get half XP/);
      if (!DD.Combat || !DD.Encounter) return;
      const r = DD.Run.newRun(companions(), 'normal', 'tips:down:' + t.seed);
      r.party.forEach(function (rh) { rh.passives = []; rh.passiveRolls = []; rh.hp = DD.Run.heroStats(rh).maxHp; });
      const rh0 = r.party[0];
      function wonWithHero0Down() {
        const xp0 = r.party.map(function (h) { return h.xp; });
        DD.Run.startCombat({ act: 1, kind: 'normal' }, 'normal');
        const u0 = DD.Combat.heroes().filter(function (u) { return u.runHero === rh0 || u.defId === rh0.id; })[0];
        DD.Act.damage(null, u0, 999, { cause: 'other' });
        t.ok(u0.downed, 'hero 0 is down');
        DD.Combat.finish('victory');
        return xp0;
      }
      const xp0 = wonWithHero0Down();
      const data = r.pending && r.pending.type === 'rewards' ? r.pending.data : null;
      if (!t.ok(data, 'the won fight moved on to rewards')) return;
      t.ok(rh0.hp === 1 && rh0.scars.length === 1 && rh0.downs === 1 && !rh0.dead, 'won while down: 1 HP, a Scar, one down (' + JSON.stringify({ hp: rh0.hp, scars: rh0.scars, downs: rh0.downs }) + ')');
      t.eq(rh0.xp - xp0[0], Math.floor(data.xp / 2), 'won while down: half XP');
      r.party.forEach(function (h, i) { if (data.downed.indexOf(i) < 0) t.eq(h.xp - xp0[i], data.xp, 'hero ' + i + ' (up): full XP'); });
      rh0.downs = 2;
      wonWithHero0Down();
      t.ok(rh0.dead, 'the third down writes them out of the campaign');
    });
  });
})();
