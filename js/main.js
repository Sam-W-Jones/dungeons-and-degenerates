/* Dungeons and Degenerates — js/main.js
 * Boot (ARCHITECTURE §10.1): load meta + settings, init UI, start renderer + input on #game, then route the debug URL
 * params (debug=1) or show the title screen. Exposes DD.Main (settings application, debug combat/run helpers that the
 * HUD may use for "Restart") and, with debug=1, window.DDdbg console helpers.
 * Does nothing under the test harness (window.DD_TEST).
 */
(function () {
  'use strict';
  if (window.DD_TEST) return;
  const DD = window.DD;
  const P = DD.params || {};

  const Main = (DD.Main = {
    booted: false,
    speedMult: 1,        // fast=1 multiplies every animation speed setting by 4
    lastCombat: null,    // options of the last debug combat (for restart)
    lastResult: null,
    autoplay: false,
  });

  function warnToast(text) {
    DD.warn(text);
    if (DD.UI && DD.UI.toast) DD.UI.toast(text, { cls: 'bad', ms: 5000 });
  }

  // ---- settings --------------------------------------------------------------------------------------------------
  /** Push the persisted settings into the running systems (FX speed, audio). */
  Main.applySettings = function () {
    const s = DD.UI ? DD.UI.settings() : {};
    if (DD.FX) {
      const sp = +s.animSpeed > 0 ? +s.animSpeed : 1;
      DD.FX.speed = sp * Main.speedMult;
    }
    if (DD.Audio) {
      if (typeof DD.Audio.setVolume === 'function') DD.safe('Audio.setVolume', DD.Audio.setVolume, DD.Audio, [s.volume !== undefined ? +s.volume : 0.6]);
      if (typeof DD.Audio.mute === 'function') DD.safe('Audio.mute', DD.Audio.mute, DD.Audio, [s.sfx === false]);
    }
  };

  // ---- debug party / run helpers ------------------------------------------------------------------------------------
  function debugLevel() { return Math.max(1, Math.min(10, parseInt(P.level, 10) || 1)); }

  /** Hero ids from &party=..., topped up to 4 with unlocked (then any) heroes. */
  Main.debugPartyIds = function () {
    const want = String(P.party || '').split(',').map(function (s) { return s.trim(); }).filter(function (id) { return id && DD.getHero(id); });
    const pool = DD.UI.heroIds();
    const unlocked = pool.filter(function (id) { return DD.UI.isUnlocked(id); });
    const fill = unlocked.concat(pool);
    for (let i = 0; i < fill.length && want.length < 4; i++) if (want.indexOf(fill[i]) < 0) want.push(fill[i]);
    return want.slice(0, 4);
  };

  /** Skill loadout for a debug hero at `level`: starting skills, +1 pool skill at L3 and L5, upgrades every 4 levels. */
  function debugSkills(def, level) {
    const skills = (def.startingSkills || []).slice(0, 4);
    const extra = Math.min(2, Math.floor((level - 1) / 2));
    const pool = (def.skillPool || []).filter(function (id) { return skills.indexOf(id) < 0 && DD.getSkill(id); });
    for (let i = 0; i < extra && i < pool.length && skills.length < 4; i++) skills.push(pool[i]);
    const lv = 1 + Math.floor((level - 1) / 4);
    return skills.filter(function (id) { return DD.getSkill(id); }).map(function (id) {
      const s = DD.getSkill(id);
      return { id: id, level: Math.min(lv, s.maxLevel || 1) };
    });
  }

  /** RunHero for sandbox combats (no run): DD.Run.makeRunHero (auto-built) when available. */
  Main.makeRunHero = function (id, level) {
    const def = DD.getHero(id);
    if (!def) return null;
    level = level || 1;
    if (DD.Run && typeof DD.Run.makeRunHero === 'function') {
      const made = DD.safe('Run.makeRunHero', DD.Run.makeRunHero, DD.Run, [id, level]);
      if (made) return made;
    }
    // v2: no XP (one hero levels up per won fight); a debug hero is simply built at `level`
    const rh = {
      id: id, level: level, hp: 1, skills: debugSkills(def, level),
      items: { weapon: null, armor: null, trinket: null }, scars: [], downs: 0, dead: false, kills: 0,
    };
    rh.hp = DD.UI.heroStats(rh).maxHp;
    return rh;
  };

  /** Rebuild every hero of the current run at `level` (debug); their Blessings are rolled like a recruit's. */
  function levelRunParty(level) {
    const run = DD.UI.run();
    if (!run || level <= 1) return;
    run.party = run.party.map(function (rh) { return Main.makeRunHero(rh.id, level) || rh; });
    if (DD.Run && typeof DD.Run.autoRollPassives === 'function') run.party.forEach(function (rh, i) { DD.safe('Run.autoRollPassives', DD.Run.autoRollPassives, DD.Run, [i]); });
    if (DD.Run && typeof DD.Run.save === 'function') DD.safe('Run.save', DD.Run.save, DD.Run);
  }

  /** &passives=id[:level],id2 — give every debug hero these Blessings (handy for screenshots). */
  function debugPassives(run) {
    if (!P.passives || !DD.Run || typeof DD.Run.addPassive !== 'function') return;
    String(P.passives).split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (spec) {
      const parts = spec.split(':');
      if (!DD.getPassive(parts[0])) { warnToast('Debug: unknown passive "' + parts[0] + '".'); return; }
      run.party.forEach(function (rh, i) { DD.safe('Run.addPassive', DD.Run.addPassive, DD.Run, [i, parts[0], +parts[1] || 1]); });
    });
  }

  /** &passives= for sandbox fights (screen=combat, no run): the same Blessings on every RunHero, at full HP. */
  function debugCombatPassives(party) {
    if (!P.passives || !DD.Passives) return;
    const list = String(P.passives).split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (spec) {
      const parts = spec.split(':');
      if (DD.getPassive(parts[0])) return { id: parts[0], level: +parts[1] || 1 };
      warnToast('Debug: unknown passive "' + parts[0] + '".');
      return null;
    }).filter(Boolean);
    party.forEach(function (rh) {
      rh.passives = DD.Passives.sanitize((rh.passives || []).concat(list));
      rh.hp = DD.UI.heroStats(rh).maxHp;
    });
  }

  /** Create a debug run (party from &party, &level, &act, &seed, &difficulty). Returns the run state or null. */
  Main.debugRun = function () {
    if (DD.UI.run()) return DD.UI.run();
    if (!DD.Run || typeof DD.Run.newRun !== 'function') { warnToast('Debug: DD.Run is not available, cannot create a run.'); return null; }
    const ids = Main.debugPartyIds();
    if (ids.length < 1) { warnToast('Debug: no heroes registered (try &fixtures=1).'); return null; }
    const seed = P.seed !== undefined ? P.seed : undefined;
    const s = DD.UI.settings();
    const hadUnlock = s.unlockAll;
    s.unlockAll = true; // debug parties may include locked heroes
    DD.safe('Run.newRun', DD.Run.newRun, DD.Run, [ids, P.difficulty || 'normal', seed]);
    s.unlockAll = hadUnlock;
    const run = DD.UI.run();
    if (!run) { warnToast('Debug: DD.Run.newRun did not create a run.'); return null; }
    const act = Math.max(1, Math.min(3, parseInt(P.act, 10) || 1));
    if (act > 1 && DD.RunMap && typeof DD.RunMap.generate === 'function') {
      const map = DD.safe('RunMap.generate', DD.RunMap.generate, DD.RunMap, [act, DD.RNG(String(run.seed) + ':map:' + act), { run: run, exclude: run.fought || [] }]);
      if (map) { run.act = act; run.map = map; run.nodeId = null; run.visited = []; }
    }
    levelRunParty(debugLevel());
    debugPassives(run);
    if (P.gold !== undefined && isFinite(+P.gold)) run.gold = Math.max(0, +P.gold);
    if (DD.Events) DD.Events.emit('run:changed', {});
    return run;
  };

  /** Open the rewards screen as if a fight of `kind` was just won: gold + XP granted, a pending rewards step. */
  Main.debugRewards = function (kind) {
    const run = DD.UI.run();
    if (!run || !DD.Rewards || typeof DD.Rewards.combat !== 'function') { warnToast('Debug: rewards need a run and DD.Rewards.'); return false; }
    kind = kind || 'normal';
    const rw = DD.safe('Rewards.combat', DD.Rewards.combat, DD.Rewards, [kind, run.act, DD.Run.rng(), run]) || { gold: 0, xp: 0, choices: [] };
    if (rw.gold && typeof DD.Run.addGold === 'function') DD.safe('Run.addGold', DD.Run.addGold, DD.Run, [rw.gold]);
    const leveled = rw.xp && typeof DD.Run.grantXp === 'function' ? DD.safe('Run.grantXp', DD.Run.grantXp, DD.Run, [rw.xp]) || [] : [];
    const xpByHero = {};
    run.party.forEach(function (h, i) { if (!h.dead) xpByHero[i] = rw.xp; });
    const id = 'rwdbg' + Date.now();
    const data = {
      id: id, source: kind === 'boss' ? 'boss' : 'combat', kind: kind, act: run.act, gold: rw.gold, xp: rw.xp, xpByHero: xpByHero, leveled: leveled,
      downed: [], scars: [], deaths: [], kills: 0, encounterId: null, encounterName: '', actClear: null, text: '', taken: null, skipped: false,
      choices: (rw.choices || []).map(function (c, i) { return Object.assign({}, c, { rid: id + ':' + i }); }),
    };
    run.pending = { type: 'rewards', data: data };
    if (typeof DD.Run.save === 'function') DD.safe('Run.save', DD.Run.save, DD.Run);
    return DD.UI.show('rewards', data);
  };

  // ---- debug combat ---------------------------------------------------------------------------------------------------
  function pickEncounter(act, kind, rng) {
    if (P.encounter) {
      const e = DD.getEncounter(P.encounter);
      if (e) return e;
      warnToast('Debug: unknown encounter "' + P.encounter + '" — picking one instead.');
    }
    if (DD.Encounter && typeof DD.Encounter.pick === 'function') {
      const e = DD.safe('Encounter.pick', DD.Encounter.pick, DD.Encounter, [act, kind, rng, { depth: 99 }]);
      if (e) return e;
    }
    const all = Object.keys(DD.defs.encounters).map(function (k) { return DD.defs.encounters[k]; });
    const match = all.filter(function (e) { return e.act === act && e.kind === kind; });
    return rng.pick(match.length ? match : all) || null;
  }

  /**
   * Start a sandbox combat without a run (screen=combat). opts default to the URL params:
   * { party: [ids], level, act, kind, encounterId, seed, difficulty }.
   */
  Main.startDebugCombat = function (opts) {
    opts = opts || {};
    if (!DD.Combat || typeof DD.Combat.start !== 'function' || !DD.Encounter || typeof DD.Encounter.build !== 'function') {
      warnToast('Debug: combat engine not available.');
      DD.UI.show('title');
      return false;
    }
    const seed = opts.seed !== undefined ? opts.seed : (P.seed !== undefined ? P.seed : DD.newSeed());
    const rng = DD.RNG(seed + ':encounter');
    const act = opts.act || Math.max(1, Math.min(3, parseInt(P.act, 10) || 1));
    const kind = opts.kind || P.kind || 'normal';
    const level = opts.level || debugLevel();
    const ids = opts.party || Main.debugPartyIds();
    const enc = opts.encounterId ? DD.getEncounter(opts.encounterId) : pickEncounter(act, kind, rng);
    if (!enc) { warnToast('Debug: no encounter found for act ' + act + ' / ' + kind + '.'); DD.UI.show('title'); return false; }
    if (!ids.length) { warnToast('Debug: no heroes registered (try &fixtures=1).'); DD.UI.show('title'); return false; }
    const party = ids.map(function (id) { return Main.makeRunHero(id, level); }).filter(Boolean);
    debugCombatPassives(party);
    const difficulty = opts.difficulty || P.difficulty || 'normal';
    Main.lastCombat = { party: ids, level: level, act: enc.act || act, kind: enc.kind || kind, encounterId: enc.id, seed: seed, difficulty: difficulty };
    const setup = DD.safe('Encounter.build', DD.Encounter.build, DD.Encounter, [enc, party, { rng: rng, difficulty: difficulty, act: enc.act || act }]);
    if (!setup) { warnToast('Debug: failed to build encounter "' + enc.id + '".'); DD.UI.show('title'); return false; }
    if (DD.FX && DD.FX.reset) DD.FX.reset();
    const state = DD.safe('Combat.start', DD.Combat.start, DD.Combat, [setup, {
      seed: seed,
      difficulty: difficulty,
      onEnd: function (result) {
        Main.lastResult = result;
        if (window.console) console.info('[DD] debug combat ended: ' + result);
      },
    }]);
    if (!state) { warnToast('Debug: combat failed to start.'); DD.UI.show('title'); return false; }
    DD.UI.show('combat');
    return true;
  };

  /** Restart the last debug combat (same encounter + seed). Used by the HUD's no-run result modal. */
  Main.restartCombat = function () {
    if (!Main.lastCombat) return Main.startDebugCombat();
    return Main.startDebugCombat(Object.assign({}, Main.lastCombat));
  };

  // ---- autoplay -------------------------------------------------------------------------------------------------------
  /** Drive DD.AutoPlay whenever it is the player turn and FX are idle (any combat, run or sandbox). */
  Main.startAutoplay = function () {
    if (Main._autoTimer) return;
    Main.autoplay = true;
    let acted = '';
    Main._autoTimer = setInterval(function () {
      const C = DD.Combat;
      const st = C && C.state;
      if (!st || !DD.AutoPlay || typeof DD.AutoPlay.takeTurn !== 'function') return;
      if (st.phase === 'over' || (C.isOver && C.isOver())) {
        // Normally the HUD hands a finished run fight back to the run layer; without a HUD, autoplay does it.
        const R = DD.Run;
        if (!DD.UI.screens.combat && R && typeof R.inCombat === 'function' && R.inCombat() && !(DD.FX && DD.FX.busy())) {
          DD.safe('Run.finishCombat', R.finishCombat, R, [st.result, st]);
        }
        return;
      }
      if (DD.FX && DD.FX.busy()) return;
      if (C.isPlayerTurn && !C.isPlayerTurn()) return;
      // v2: one hero turn at a time (initiative), so play each turn (state.turn), not just each round's first one
      const key = st.id + ':' + (st.order ? 't' + (st.turn || 0) : 'deploy');
      if (acted !== key) { acted = key; DD.safe('AutoPlay.takeTurn', DD.AutoPlay.takeTurn, DD.AutoPlay); return; }
      if (C.isOver && C.isOver()) return;
      DD.safe('Combat.endTurn', C.endTurn, C);
    }, 150);
  };
  Main.stopAutoplay = function () {
    clearInterval(Main._autoTimer);
    Main._autoTimer = 0;
    Main.autoplay = false;
  };

  // ---- routing ----------------------------------------------------------------------------------------------------------
  function showGallery() {
    const which = P.gallery || 'all';
    if (DD.Gallery) {
      const fn = DD.Gallery.show || DD.Gallery.open || DD.Gallery.start;
      if (typeof fn === 'function') DD.safe('Gallery.show', fn, DD.Gallery, [which]);
    }
    if (DD.Render && typeof DD.Render.setScene === 'function') DD.safe('Render.setScene gallery', DD.Render.setScene, DD.Render, ['gallery']);
    DD.UI.show('gallery', { which: which });
  }

  function debugRunScreen(screen) {
    const run = Main.debugRun();
    if (!run) { DD.UI.show('title'); return; }
    switch (screen) {
      case 'map': DD.UI.show('map'); break;
      case 'shop': DD.UI.show('shop', { debug: true }); break;
      case 'tavern': DD.UI.show('tavern', { debug: true }); break;
      case 'party': DD.UI.show('party', { back: 'map' }); break;
      case 'event': {
        let id = P.event;
        if (id && !DD.getEvent(id)) { warnToast('Debug: unknown event "' + id + '".'); id = null; }
        if (!id) {
          const all = Object.keys(DD.defs.events);
          const real = all.filter(function (k) { return !DD.defs.events[k].fallback; });
          const inAct = real.filter(function (k) { const e = DD.defs.events[k]; return !e.acts || e.acts.indexOf(run.act) >= 0; });
          id = DD.rng.pick(inAct.length ? inAct : real.length ? real : all);
        }
        if (!id) { warnToast('Debug: no events registered.'); DD.UI.show('map'); break; }
        if (typeof DD.Run.openEvent === 'function' && DD.safe('Run.openEvent', DD.Run.openEvent, DD.Run, [id])) {
          if (DD.UI.current !== 'event') DD.UI.show('event', { eventId: id });
        } else DD.UI.show('event', { eventId: id });
        break;
      }
      case 'rewards': Main.debugRewards(P.kind || 'normal'); break;
      case 'levelup': {
        // Grant just enough XP for everyone to actually gain a level, then run the real flow.
        const alive = run.party.map(function (h, i) { return i; }).filter(function (i) { return !run.party[i].dead; });
        const need = alive.reduce(function (m, i) { const h = run.party[i]; return Math.max(m, DD.UI.xpForLevel((h.level || 1) + 1) - (h.xp || 0)); }, 0);
        let queue = null;
        if (need > 0 && isFinite(need) && typeof DD.Run.grantXp === 'function') queue = DD.safe('Run.grantXp', DD.Run.grantXp, DD.Run, [need]);
        DD.UI.show('levelup', { queue: Array.isArray(queue) && queue.length ? queue : alive });
        break;
      }
      case 'gameover': DD.UI.show('gameover', { debug: true }); break;
      case 'victory': DD.UI.show('victory', { act: run.act, final: P.final === '1' || run.act >= 3, debug: true }); break;
      default: DD.UI.show(screen);
    }
  }

  function route() {
    if (!DD.debug) { DD.UI.show('title'); return; }
    const screen = P.screen || (P.event ? 'event' : (P.encounter || P.kind) ? 'combat' : P.gallery ? 'gallery' : 'title');
    switch (screen) {
      case 'gallery': showGallery(); break;
      case 'combat': Main.startDebugCombat(); break;
      case 'map': case 'shop': case 'tavern': case 'party': case 'rewards': case 'levelup': case 'event': case 'gameover': case 'victory':
        debugRunScreen(screen); break;
      default:
        if (!DD.UI.screens[screen]) warnToast('Debug: unknown screen "' + screen + '".');
        if (!DD.UI.show(screen)) DD.UI.show('title');
    }
    if (P.autoplay === '1') Main.startAutoplay();
  }

  // ---- console helpers ------------------------------------------------------------------------------------------------
  function installDebugHelpers() {
    const run = function () { return DD.UI.run(); };
    const R = function (name) { return DD.Run && typeof DD.Run[name] === 'function' ? DD.Run[name].bind(DD.Run) : null; };
    window.DDdbg = {
      help: function () {
        const lines = [
          'DDdbg.show(id, params)    — show a UI screen',
          'DDdbg.run() / combat()    — current run / combat state',
          'DDdbg.newRun(ids?, diff?) — start a debug run',
          'DDdbg.gold(n) / xp(n)     — give gold / XP (prints level-ups)',
          'DDdbg.item(idOrRarity)    — give an item (id, or common|rare|legendary|cursed)',
          'DDdbg.consumable(id?)     — give a consumable',
          'DDdbg.skill(heroIdx, id)  — teach a skill (replace flow if full)',
          'DDdbg.heal() / scar(i)    — heal party / add a scar',
          'DDdbg.levelUp(i)          — open the level-up flow for hero i',
          'DDdbg.win() / lose()      — end the current combat',
          'DDdbg.fight(kindOrId)     — start a run combat (normal|elite|boss|encounter id)',
          'DDdbg.event(id?) / shop() / tavern() / rewards(kind?)',
          'DDdbg.passive(i, id, lvl) — give hero i a Blessing (random passive) at a level',
          'DDdbg.roll(i)             — hero i rolls on the Table of Questionable Blessings (shows the roll)',
          'DDdbg.table(i?)           — print the d100 table (slices) for hero i',
          'DDdbg.autoplay(on) / speed(x) / instant(on) / unlockAll(on)',
        ];
        if (window.console) console.info(lines.join('\n'));
        return lines.length + ' helpers';
      },
      show: function (id, params) { return DD.UI.show(id, params || {}); },
      run: run,
      combat: function () { return DD.Combat ? DD.Combat.state : null; },
      newRun: function (ids, diff) {
        if (!DD.Run) return null;
        DD.Run.newRun(ids || Main.debugPartyIds(), diff || 'normal');
        return run();
      },
      gold: function (n) { const f = R('addGold'); if (f) f(n === undefined ? 100 : n); return run() && run().gold; },
      xp: function (n) { const f = R('grantXp'); const lv = f ? f(n === undefined ? 25 : n) : null; if (lv && lv.length) DD.UI.show('levelup', { queue: lv }); return lv; },
      item: function (idOrRarity) {
        if (!run() || !DD.Run) return null;
        let id = idOrRarity;
        if (!id || !DD.getItem(id)) {
          const rr = DD.Rewards && DD.Rewards.randomItem ? DD.Rewards.randomItem({ rarity: idOrRarity || 'rare', act: run().act }, DD.Run.rng()) : null;
          id = rr && typeof rr === 'object' ? rr.id : rr;
        }
        if (id && R('addItem')) R('addItem')(id);
        return id;
      },
      consumable: function (id) {
        if (!run() || !DD.Run) return null;
        if (!id) { const c = DD.Rewards && DD.Rewards.randomConsumable ? DD.Rewards.randomConsumable(DD.Run.rng()) : null; id = c && typeof c === 'object' ? c.id : c; }
        return id && R('addConsumable') ? R('addConsumable')(id) : false;
      },
      skill: function (heroIdx, skillId) {
        DD.UI.chooseSkillSlot(heroIdx || 0, skillId, {}, function (ri) {
          if (ri === null) return;
          const f = R('learnSkill');
          if (f) f(heroIdx || 0, skillId, ri >= 0 ? ri : undefined);
        });
      },
      heal: function () { const f = R('healParty'); if (f) f(1); return true; },
      scar: function (i) { const f = R('addScar'); return f ? f(i || 0) : null; },
      levelUp: function (i) { return DD.UI.show('levelup', { queue: [i || 0] }); },
      win: function () { if (DD.Act && DD.Act.endCombat) DD.Act.endCombat('victory'); return true; },
      lose: function () { if (DD.Act && DD.Act.endCombat) DD.Act.endCombat('defeat'); return true; },
      fight: function (kindOrId) {
        if (!run() || !DD.Run || !DD.Run.startCombat) return false;
        const enc = DD.getEncounter(kindOrId) || pickEncounter(run().act, kindOrId || 'normal', DD.Run.rng());
        if (!enc) return false;
        DD.Run.startCombat(enc, enc.kind);
        return enc.id;
      },
      event: function (id) {
        id = id || DD.rng.pick(Object.keys(DD.defs.events));
        if (DD.Run && typeof DD.Run.openEvent === 'function' && DD.Run.openEvent(id)) return true;
        return DD.UI.show('event', { eventId: id });
      },
      shop: function () { return DD.UI.show('shop', { debug: true }); },
      tavern: function () { return DD.UI.show('tavern', { debug: true }); },
      rewards: function (kind) { return Main.debugRewards(kind || 'normal'); },
      passive: function (heroIdx, id, level) {
        const f = R('addPassive');
        const ok = f ? f(heroIdx || 0, id, level || 1) : false;
        if (!ok) warnToast('Debug: could not give passive "' + id + '" (unknown id, no run or dead hero).');
        return ok ? (run().party[heroIdx || 0].passives || []).slice() : null;
      },
      roll: function (heroIdx) {
        const f = R('grantRoll');
        const job = f ? f(heroIdx || 0, 'debug', {}) : null;
        if (!job) { warnToast('Debug: nothing to roll (no run, dead hero or an empty table).'); return null; }
        DD.UI.passiveRoll(heroIdx || 0, { onDone: function (res) { if (res && window.console) console.info('[DD] ' + res.text); } });
        return DD.Run.currentRoll(heroIdx || 0);
      },
      table: function (heroIdx) {
        if (!DD.Passives) return [];
        const rh = run() ? run().party[heroIdx || 0] : null;
        const rows = DD.Passives.table(rh).map(function (e) {
          return { d100: e.from === e.to ? String(e.from) : e.from + '-' + e.to, id: e.id, name: e.def.name, rarity: e.rarity, weight: e.weight, upgrade: e.upgrade ? 'to ' + e.level : '' };
        });
        if (window.console && console.table) console.table(rows);
        return rows;
      },
      autoplay: function (on) { if (on === false) Main.stopAutoplay(); else Main.startAutoplay(); return Main.autoplay; },
      speed: function (x) { Main.speedMult = 1; const s = DD.UI.settings(); s.animSpeed = +x || 1; Main.applySettings(); return DD.FX && DD.FX.speed; },
      instant: function (on) { if (DD.FX) { if (on !== false && DD.FX.flush) DD.FX.flush(); DD.FX.instant = on !== false; } return DD.FX && DD.FX.instant; },
      unlockAll: function (on) { DD.UI.settings().unlockAll = on !== false; if (DD.Meta && DD.Meta.save) DD.Meta.save(); return DD.UI.settings().unlockAll; },
      restart: Main.restartCombat,
    };
    if (window.console) console.info('[DD] debug mode — type DDdbg.help() for console helpers.');
  }

  /** Minimal overlay for the sprite gallery scene (debug only): label + way back to the title. */
  function registerGalleryScreen() {
    if (DD.UI.screens.gallery) return;
    DD.UI.screen('gallery', {
      history: false,
      mount: function (root, params) {
        const UI = DD.UI, el = UI.el;
        root.appendChild(el('div.gallery-bar.panel.slim', null,
          el('span.gb-label', null, 'Sprite Gallery — ' + ((params && params.which) || 'all')),
          UI.button('Title', function () { UI.show('title'); }, { cls: 'small ghost' })));
      },
    });
  }

  // ---- boot -----------------------------------------------------------------------------------------------------------
  function boot() {
    if (Main.booted) return;
    Main.booted = true;
    const loading = document.getElementById('boot-loading');
    // Headless captures barely advance the CSS animation timeline: show the settled UI (no entrance animations).
    if (/HeadlessChrome/.test(navigator.userAgent || '') || (DD.debug && P.static === '1')) document.documentElement.classList.add('static-ui');
    try {
      if (DD.Meta && typeof DD.Meta.load === 'function') DD.safe('Meta.load', DD.Meta.load, DD.Meta);
      if (DD.debug && P.unlockall === '1') DD.UI.settings().unlockAll = true;
      if (DD.debug && P.fast === '1') Main.speedMult = 4;
      Main.applySettings();
      if (DD.debug && P.instant === '1' && DD.FX) DD.FX.instant = true;
      DD.UI.init();
      const canvas = document.getElementById('game');
      if (canvas && DD.Render && typeof DD.Render.init === 'function') {
        DD.safe('Render.init', DD.Render.init, DD.Render, [canvas]);
        if (typeof DD.Render.start === 'function') DD.safe('Render.start', DD.Render.start, DD.Render);
      }
      if (canvas && DD.Input && typeof DD.Input.init === 'function') DD.safe('Input.init', DD.Input.init, DD.Input, [canvas]);
      if (DD.debug) { installDebugHelpers(); registerGalleryScreen(); }
      route();
    } finally {
      if (loading) {
        loading.style.transition = 'opacity .35s ease';
        loading.style.opacity = '0';
        loading.style.pointerEvents = 'none';
        setTimeout(function () { loading.style.display = 'none'; }, 380);
      }
    }
  }

  if (window.DD_LOADED) boot();
  else document.addEventListener('dd:loaded', boot);
})();
