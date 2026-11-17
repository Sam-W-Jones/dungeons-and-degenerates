/* Dungeons and Degenerates — tests/content/events_act4.js
 * Suites "events_act4: …" for js/data/events_act4.js (V3, plan .tmp/v3/design.md §5.6, §8.4 NARRATIVE): the event stops
 * of Svammiel's gauntlet. Registry and copy (ev_a4_*, acts exactly [4], the v2 text and hint rules, exact "Pay N gold"
 * gates, no hero events, enough events for every event stop the registry's doors give); every choice resolved through
 * the real event API over several seeds and checked against its hint; no choice ever starts a fight (statically and in
 * practice); outcome texts name heroes without pronouns, read as sentences, and survive full pockets and 1-HP heroes;
 * offered only in act 4, so nothing here turns up before the twist.
 * Works in isolation (core + fixtures + this pack).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const POCKET_GOLD = 15;
  const CONSOLATION_GOLD = 30;
  const V1_TALK = /\bXP\b|experience points?|telegraph|(?:enemy|their|its) intents?\b|intent tiles|(?<!no )\bGuard\b|red tiles|what (?:it|they) will do/i;
  const BAD_TEXT = /undefined|NaN|\[object|\{\w+\}/;
  const BAD_PUNCT = /[!?…]\.|\.\.\.\./;
  const PLAN_LANES = ['gardener', 'league', 'galbraith', 'coven', 'goats'];
  const PLAN_EVENTS = ['ev_a4_support_group', 'ev_a4_suggestion_box', 'ev_a4_recruitment_drive', 'ev_a4_bake_sale', 'ev_a4_book_signing',
    'ev_a4_compost_heap', 'ev_a4_merch_table'];
  const GENDERED = /\b(?:he|him|his|himself|she|her|hers|herself)\b/i;

  function act4Events() {
    return Object.keys(DD.defs.events).filter(function (id) { return /^ev_a4_/.test(id); }).map(function (id) { return DD.defs.events[id]; });
  }
  function textOf(ev) { return typeof ev.text === 'function' ? DD.safe('event text', ev.text, ev, [null]) : ev.text; }
  function lowerStarts(line) {
    const s = String(line).replace(/\.\.\./g, '…').replace(/[!?](["”])(?=\s+[a-z])/g, '$1');
    return (s.match(/(?:^|[.!?]["”)]?\s+)[a-z]\w*/g) || []).map(function (m) { return m.trim(); });
  }
  function sentences(text) { return String(text).replace(/\.\.\./g, '…').split(/(?<=[.!?]["”)]?)\s+/); }
  /** The doors the registry gives (real gauntlet lanes), else the plan's five: the gauntlet has one event stop per door. */
  function doorCount() {
    const n = Object.keys(DD.defs.encounters).filter(function (id) {
      const e = DD.defs.encounters[id];
      return e && e.act === 4 && e.gauntlet && !/^test_/.test(id);
    }).length;
    return n || PLAN_LANES.length;
  }

  // ---- headless run lab (the narrative suite's, trimmed to what these events do) --------------------------------------
  function runLab(t, fn) {
    if (!DD.Run || !DD.Rewards || !DD.RunMap || !DD.Meta) { t.skip('run layer not loaded'); return undefined; }
    const savedUi = DD.Run.useUi;
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    DD.Run.useUi = false;
    try {
      return fn();
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
    }
  }
  function companions() {
    const fx = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue'].filter(function (id) { return DD.getHero(id); });
    return fx.length >= 4 ? fx : Object.keys(DD.defs.heroes).slice(0, 4);
  }
  /** An act-4 run to clone from: 200 gold, empty pockets, no Blessings, every hero at about half HP. */
  function baseRun(seed, opts) {
    opts = opts || {};
    DD.Run.newRun(companions(), 'normal', seed);
    const s = DD.Run.state;
    s.act = 4;
    s.gold = opts.gold !== undefined ? opts.gold : 200;
    s.consumables = [];
    s.party.forEach(function (rh, i) {
      rh.passives = [];
      rh.passiveRolls = [];
      rh.level = [2, 1, 2, 1][i] || 1;
      rh.pendingLevels = 0;
      rh.levelChoices = null;
      rh.scars = [];
      rh.hp = opts.hp !== undefined ? opts.hp : Math.max(1, Math.round(DD.Run.heroStats(rh).maxHp / 2));
    });
    return DD.util.deepClone(s);
  }
  function fromBase(base, k) {
    const s = DD.util.deepClone(base);
    s.rngState = (DD.util.hash('events_act4:' + k) >>> 0) || 1;
    DD.Run.state = s;
    return s;
  }
  function snap(s) {
    return {
      gold: s.gold,
      hp: s.party.map(function (h) { return h.hp; }),
      max: s.party.map(function (h) { return DD.Run.heroStats(h).maxHp; }),
      scars: s.party.map(function (h) { return h.scars.length; }),
      bless: s.party.map(function (h) { return (h.passives || []).reduce(function (a, p) { return a + (p.level || 1); }, 0) + (h.passiveRolls || []).length; }),
      lv: s.party.map(function (h) { return h.skills.reduce(function (a, k) { return a + k.level; }, 0); }),
      level: s.party.map(function (h) { return h.level; }),
      cons: s.consumables.length,
    };
  }
  /** Deltas and assertion helpers for one outcome. */
  function ctx(t, label, b, a, out) {
    const text = (out && out.text) || '';
    const alive = b.hp.map(function (x, i) { return i; });
    const c = { label: label, text: text, gold: a.gold - b.gold };
    c.ok = function (cond, msg) { return t.ok(cond, label + ': ' + msg); };
    c.eff = function (i) { return (a.hp[i] - b.hp[i]) - (a.max[i] - b.max[i]); };
    c.goldIs = function (n) { return c.ok(c.gold === n, 'gold ' + (n >= 0 ? '+' : '') + n + ' (got ' + c.gold + ')'); };
    c.healAll = function (f) {
      alive.forEach(function (i) {
        const want = Math.min(f >= 1 ? b.max[i] : Math.max(1, Math.round(b.max[i] * f)), b.max[i] - b.hp[i]);
        c.ok(c.eff(i) === want, 'hero ' + i + ' heals ' + f + ' (' + b.hp[i] + '/' + b.max[i] + ' -> ' + a.hp[i] + ')');
      });
    };
    c.hpSame = function (except) { alive.forEach(function (i) { if (i !== except) c.ok(c.eff(i) === 0, 'hero ' + i + ' HP unchanged'); }); };
    c.noScars = function () { c.ok(a.scars.every(function (n, i) { return n === b.scars[i]; }), 'no scars'); };
    c.noBless = function (except) { alive.forEach(function (i) { if (i !== except) c.ok(a.bless[i] === b.bless[i], 'hero ' + i + ' rolls no Blessing'); }); };
    c.noLevels = function () { c.ok(a.level.every(function (n, i) { return n === b.level[i]; }), 'nobody levels up'); };
    c.noSkills = function () { c.ok(a.lv.every(function (n, i) { return n === b.lv[i]; }), 'no skill changes'); };
    c.noCons = function () { c.ok(a.cons === b.cons, 'no consumable'); };
    /** The one hero hurt by n (event damage stops at 1 HP); everyone else unchanged. Returns that hero. */
    c.hurtOne = function (n) {
      const hit = alive.filter(function (i) { return c.eff(i) !== 0; });
      if (!hit.length) { c.ok(b.hp.some(function (h) { return h <= 1; }) && /already at 1 HP/.test(text), 'nobody hurt: only a 1-HP hero ("' + text + '")'); return -1; }
      c.ok(hit.length === 1 && -c.eff(hit[0]) === Math.min(n, b.hp[hit[0]] - 1), 'one hero loses ' + n + ' (' + hit.map(function (i) { return i + ': ' + c.eff(i); }).join(', ') + ')');
      c.ok(text.indexOf('loses ' + (-c.eff(hit[0])) + ' HP') >= 0, 'the outcome names the HP lost');
      return hit[0];
    };
    /** One hero rolled on the Table once, or the consolation gold. Returns the gold that paid. */
    c.blessOne = function () {
      const hit = alive.filter(function (i) { return a.bless[i] !== b.bless[i]; });
      if (!hit.length) { c.ok(/gold instead\./.test(text), 'nobody rolled: the consolation in the text'); return CONSOLATION_GOLD; }
      c.ok(hit.length === 1 && a.bless[hit[0]] - b.bless[hit[0]] === 1, 'one hero rolls on the Table once (' + hit.join(',') + ')');
      return 0;
    };
    /** One hero upgraded a skill, or the consolation gold. */
    c.upgradeOne = function () {
      const hit = alive.filter(function (i) { return a.lv[i] !== b.lv[i]; });
      if (!hit.length) { c.ok(/gold instead\./.test(text), 'nothing to upgrade: the consolation in the text'); return CONSOLATION_GOLD; }
      c.ok(hit.length === 1 && a.lv[hit[0]] - b.lv[hit[0]] === 1 && / is now [IVX]+\./.test(text), 'one hero upgrades one skill, named in the text');
      return 0;
    };
    /** One consumable, or POCKET_GOLD when the pockets were full. */
    c.potion = function (other) {
      if (a.cons === b.cons + 1) return c.goldIs(other || 0);
      c.ok(/Your pockets are full/.test(text), 'full pockets: said in the text');
      return c.goldIs((other || 0) + POCKET_GOLD);
    };
    c.scarOne = function (who) {
      const hit = alive.filter(function (i) { return a.scars[i] !== b.scars[i]; });
      c.ok(hit.length === 1 && a.scars[hit[0]] - b.scars[hit[0]] === 1 && (who === undefined || hit[0] === who), 'one hero gains one scar (' + hit.join(',') + ')');
      return hit[0];
    };
    return c;
  }
  function det(fn) { return { branches: ['ok'], check: function (c) { fn(c); return 'ok'; } }; }
  // what every choice must do (the hint, exactly)
  const SPEC = {
    ev_a4_support_group: [
      det(function (c) { c.healAll(0.2); c.goldIs(0); c.noScars(); c.noBless(); c.noCons(); }),
      det(function (c) { c.potion(0); c.hpSame(); c.noScars(); c.noBless(); }),
      det(function (c) { c.goldIs(25); c.hpSame(); c.noCons(); c.noScars(); }),
    ],
    ev_a4_suggestion_box: [
      det(function (c) { c.goldIs(c.blessOne()); c.hpSame(); c.noScars(); }),
      det(function (c) { c.healAll(0.1); c.goldIs(0); c.noScars(); c.noBless(); }),
      det(function (c) { c.goldIs(30); c.scarOne(); c.hpSame(); c.noBless(); }),
    ],
    ev_a4_recruitment_drive: [
      det(function (c) { c.goldIs(c.blessOne()); c.hpSame(); c.noScars(); }),
      det(function (c) { c.goldIs(20); c.hpSame(); c.noScars(); c.noBless(); }),
      det(function (c) { c.healAll(0.15); c.goldIs(0); c.noScars(); c.noBless(); }),
    ],
    ev_a4_bake_sale: [
      det(function (c) { c.goldIs(-10); c.healAll(0.25); c.noScars(); c.noBless(); }),
      det(function (c) {
        const who = c.scarOne();
        c.ok(who >= 0 && c.eff(who) >= 0, 'that hero heals (to full)');
        c.hpSame(who); c.goldIs(0); c.noBless();
      }),
      det(function (c) { c.potion(0); c.hpSame(); c.noScars(); c.noBless(); }),
    ],
    ev_a4_book_signing: [
      det(function (c) { c.goldIs(-40 + c.upgradeOne()); c.hpSame(); c.noScars(); c.noBless(); }),
      det(function (c) { const g = c.blessOne(); c.hurtOne(4); c.goldIs(g); c.noScars(); c.noSkills(); }),
      det(function (c) {
        c.goldIs(30); c.hpSame(); c.noScars(); c.noBless();
        // [review V3] the typo is a misspelling: "Galbraith" has one L (his own "one L..." death line), so the page has two
        c.ok(/"Galbraith" with two Ls/.test(c.text) && !/with one L\b/.test(c.text), 'the typo is a real misspelling');
      }),
    ],
    ev_a4_compost_heap: [
      det(function (c) { c.goldIs(35); c.hurtOne(6); c.noScars(); c.noBless(); }),
      det(function (c) { c.healAll(0.15); c.goldIs(0); c.noScars(); c.noBless(); }),
      det(function (c) { c.goldIs(c.blessOne()); c.hpSame(); c.noScars(); }),
    ],
    ev_a4_merch_table: [
      det(function (c) { c.goldIs(-20 + c.blessOne()); c.hpSame(); c.noScars(); }),
      det(function (c) { c.goldIs(30); c.hurtOne(5); c.noScars(); c.noBless(); }),
      det(function (c) { c.goldIs(0); c.hpSame(); c.noScars(); c.noBless(); c.noCons(); c.noLevels(); }),
    ],
  };

  // ---- registry and copy -----------------------------------------------------------------------------------------------
  T.suite('events_act4: registry and copy (ev_a4_*, acts [4], text and hint rules, gold gates, never a fight)', function (t) {
    const evs = act4Events();
    t.ok(evs.length >= 6, evs.length + ' act-4 events (plan §5.6: six, plus the Merch Table)');
    PLAN_EVENTS.forEach(function (id) { t.ok(!!DD.getEvent(id), id + ' registered'); });
    t.ok(evs.length >= doorCount(), evs.length + ' events for ' + doorCount() + ' event stops (the lobby and every intermission between doors)');
    const g = DD.Balance && DD.Balance.map && DD.Balance.map.gauntlet;
    t.ok(!!g && (g.lobby || []).indexOf('event') >= 0 && (g.between || []).indexOf('event') >= 0, 'the gauntlet has event stops in the lobby and between doors');
    evs.forEach(function (ev) {
      const L = ev.id;
      t.ok(/^ev_a4_[a-z0-9_]+$/.test(ev.id), L + ': id');
      t.eq(JSON.stringify(ev.acts), '[4]', L + ': acts [4] (never before the twist)');
      t.ok(!ev.hero && !ev.requires, L + ': no hero event, no requirement');
      t.ok(ev.unique !== false, L + ': unique');
      t.ok(typeof ev.title === 'string' && ev.title.length >= 4 && ev.title.length <= 40, L + ': title "' + ev.title + '"');
      t.ok(typeof ev.icon === 'string' && ev.icon.length > 0 && ev.icon.length <= 4, L + ': one emoji icon');
      const text = textOf(ev);
      t.ok(typeof text === 'string' && text.length >= 120 && text.length <= 600 && !BAD_TEXT.test(text), L + ': text (' + (text || '').length + ' chars)');
      const sentenceCount = (String(text).match(/[.!?]["”)]?(?=\s+["“A-Z(]|\s*$)/g) || []).length;
      t.ok(sentenceCount >= 2 && sentenceCount <= 5, L + ': ' + sentenceCount + ' sentences (2-5)');
      t.ok(Array.isArray(ev.choices) && ev.choices.length >= 2 && ev.choices.length <= 3, L + ': 2-3 choices');
      [ev.title, text].concat(ev.choices.map(function (c) { return c.label; }), ev.choices.map(function (c) { return c.hint; })).forEach(function (s) {
        t.ok(!V1_TALK.test(String(s)), L + ': no v1 talk in "' + s + '"');
        t.ok(!/\b(?:four|five|six) (?:mini-?bosses|doors)\b/i.test(String(s)), L + ': no count of doors in "' + s + '"');
      });
      ev.choices.forEach(function (ch, i) {
        t.ok(typeof ch.label === 'string' && ch.label.length >= 3 && ch.label.length <= 40, L + ' #' + i + ': label "' + ch.label + '"');
        t.ok(typeof ch.hint === 'string' && ch.hint.length >= 8 && ch.hint.length <= 170 && !BAD_TEXT.test(ch.hint), L + ' #' + i + ': hint "' + ch.hint + '"');
        t.ok(typeof ch.resolve === 'function', L + ' #' + i + ': resolve');
        t.ok(!/levels? up/.test(ch.hint), L + ' #' + i + ': no level-ups at an act-4 stop');
        // never a fight: no choice calls api.combat or returns { combat }
        t.ok(!/\bcombat\b/.test(String(ch.resolve)), L + ' #' + i + ': its resolve never mentions combat');
        t.ok(!/[Ff]ight a /.test(ch.hint), L + ' #' + i + ': its hint promises no fight');
        const pay = /^Pay (\d+) gold/.exec(ch.hint);
        t.ok(!pay || typeof ch.requires === 'function', L + ' #' + i + ': a gold cost is gated (requires)');
      });
      t.ok(ev.choices.some(function (ch) { return /\d+%|Pay \d+ gold|loses?|scar/i.test(ch.hint); }), L + ': at least one risk / reward trade');
      t.ok(ev.choices.some(function (ch) { return !/^Pay /.test(ch.hint); }), L + ': at least one choice is free');
    });
  });

  T.suite('events_act4: offered only in act 4 — and never before the twist', function (t) {
    if (!DD.RunMap || typeof DD.RunMap.eventAvailable !== 'function') { t.skip('runmap not loaded'); return; }
    const run = { seenEvents: [], gold: 200, party: [] };
    act4Events().forEach(function (ev) {
      [1, 2, 3].forEach(function (a) { t.ok(!DD.RunMap.eventAvailable(ev, a, run), ev.id + ': not offered in act ' + a); });
      t.ok(DD.RunMap.eventAvailable(ev, 4, run), ev.id + ': offered in act 4');
    });
    // the picker: an act-4 map stop draws only act-4 events, a classic stop never does
    if (typeof DD.RunMap.pickEvent === 'function') {
      for (let k = 0; k < 40; k++) {
        const e1 = DD.RunMap.pickEvent(2, DD.RNG('ea4:' + k), { run: run });
        if (e1) t.ok(!/^ev_a4_/.test(e1.id || e1), 'act 2 never draws an act-4 event (' + (e1.id || e1) + ')');
        const e4 = DD.RunMap.pickEvent(4, DD.RNG('ea4:4:' + k), { run: run });
        if (e4) t.ok(((DD.getEvent(e4.id || e4) || {}).acts || []).indexOf(4) >= 0, 'act 4 draws an act-4 event (' + (e4.id || e4) + ')');
      }
    }
  });

  // ---- outcomes --------------------------------------------------------------------------------------------------------
  T.suite('events_act4: every choice through the run API matches its hint and never queues a fight', function (t) {
    runLab(t, function () {
      const base = baseRun('ea4:' + t.seed);
      let resolved = 0;
      act4Events().forEach(function (ev) {
        const spec = SPEC[ev.id];
        if (!t.ok(spec && spec.length === ev.choices.length, ev.id + ': a checker for each of its ' + ev.choices.length + ' choices')) return;
        ev.choices.forEach(function (ch, ci) {
          for (let k = 0; k < 6; k++) {
            const s = fromBase(base, ev.id + ':' + ci + ':' + k);
            t.ok(DD.Run.openEvent(ev.id, null, { noShow: true }), ev.id + ': opens');
            const cur = DD.Run.currentEvent();
            if (!t.ok(cur && cur.choices[ci] && !cur.choices[ci].disabled, ev.id + ' #' + ci + ': available')) return;
            const b = snap(s);
            const out = DD.Run.chooseEventOption(ci);
            const label = ev.id + ' #' + ci + ' (' + ch.label + ') seed ' + k;
            if (!t.ok(out && typeof out.text === 'string' && out.text.length > 20 && !BAD_TEXT.test(out.text) && !BAD_PUNCT.test(out.text), label + ': outcome "' + (out && out.text) + '"')) continue;
            t.ok(!out.combat && !s.queuedCombat, label + ': no fight queued');
            t.eq(lowerStarts(out.text).join(' | '), '', label + ': sentences start uppercase in "' + out.text + '"');
            t.ok(!V1_TALK.test(out.text), label + ': no v1 talk');
            t.ok(s.gold >= 0 && s.party.every(function (h) { return h.dead || h.hp >= 1; }), label + ': gold >= 0 and nobody dies');
            spec[ci].check(ctx(t, label, b, snap(s), out));
            resolved++;
          }
        });
      });
      t.log(resolved + ' resolutions');
      // the gold gates: locked one short, open at the price
      act4Events().forEach(function (ev) {
        ev.choices.forEach(function (ch, i) {
          const m = /^Pay (\d+) gold/.exec(ch.hint);
          if (!m) return;
          const s = fromBase(base, 'gate:' + ev.id);
          s.gold = +m[1] - 1;
          DD.Run.openEvent(ev.id, null, { noShow: true });
          t.ok(DD.Run.currentEvent().choices[i].disabled, ev.id + ' #' + i + ': locked at ' + s.gold + ' gold');
          t.eq(DD.Run.chooseEventOption(i), null, ev.id + ' #' + i + ': a locked choice does not resolve');
          s.gold = +m[1];
          t.eq(DD.Run.currentEvent().choices[i].disabled, false, ev.id + ' #' + i + ': open at ' + s.gold + ' gold');
        });
      });
    });
  });

  T.suite('events_act4: outcomes name heroes without pronouns, and survive full pockets and 1-HP heroes', function (t) {
    runLab(t, function () {
      const names = companions().map(function (id) { return DD.getHero(id).name; });
      const anyCons = Object.keys(DD.defs.consumables).filter(function (id) { return !DD.defs.consumables[id].noDrop; })[0];
      [['ea4:half', {}], ['ea4:one', { hp: 1 }]].forEach(function (x) {
        const base = baseRun(x[0] + ':' + t.seed, x[1]);
        act4Events().forEach(function (ev) {
          ev.choices.forEach(function (ch, ci) {
            for (let k = 0; k < 4; k++) {
              const s = fromBase(base, x[0] + ':' + ev.id + ':' + ci + ':' + k);
              DD.Run.openEvent(ev.id, null, { noShow: true });
              const out = DD.Run.chooseEventOption(ci);
              if (!out) continue;
              // a sentence that names a hero uses no pronoun for anyone (random heroes: he or she), Blessing results aside
              sentences(out.text).forEach(function (sen) {
                if (!names.some(function (n) { return sen.indexOf(n) >= 0; }) || / gained | is now [IVX]+!| traded | passed on |Blessing/.test(sen)) return;
                t.ok(!GENDERED.test(sen), ev.id + ' #' + ci + ': no pronoun next to a hero\'s name in "' + sen + '"');
              });
              t.ok(out.text.indexOf('loses 0 HP') < 0, ev.id + ' #' + ci + ': never "loses 0 HP" (' + x[0] + ')');
              t.ok(s.party.every(function (h) { return h.hp >= 1; }), ev.id + ' #' + ci + ': nobody below 1 HP');
            }
          });
        });
      });
      // full pockets: every consumable reward sells for 15 gold and says so
      if (!anyCons) { t.log('no droppable consumable registered: the pocket check skipped'); return; }
      const base = baseRun('ea4:full:' + t.seed);
      act4Events().forEach(function (ev) {
        ev.choices.forEach(function (ch, ci) {
          if (!/consumable/.test(ch.hint)) return;
          const s = fromBase(base, 'full:' + ev.id + ':' + ci);
          while (s.consumables.length < s.maxConsumables) s.consumables.push(anyCons);
          const g0 = s.gold, c0 = s.consumables.length;
          DD.Run.openEvent(ev.id, null, { noShow: true });
          const out = DD.Run.chooseEventOption(ci);
          t.ok(out && /(?:[:;]\s+y|[.!?]\s+Y|^Y)our pockets are full/.test(out.text) && s.gold - g0 === POCKET_GOLD && s.consumables.length === c0,
            ev.id + ' #' + ci + ' with full pockets: sold for ' + POCKET_GOLD + ' gold ("' + (out && out.text) + '")');
        });
      });
    });
  });
})();
