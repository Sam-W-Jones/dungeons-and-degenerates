/* Dungeons and Degenerates — tests/content/bosses_act2.js
 * Suites "bosses_act2: …" for the Act 2 bosses: Lich-tenstein (js/data/bosses/lich.js) and Dr. Iris
 * (js/data/bosses/beholder.js), v2 (initiative, boss wind-ups). Unit tests of every mechanic (damage == desc, wind-ups
 * land at the boss's next turn start and a stun interrupts them, rotations, phases, puzzles + AutoPlay hints, minion
 * caps, control resistance, previews, wind-up number / area honesty) on the real arenas (Encounter.build, started as a
 * sandbox so turns can be handed out), plus AutoPlay sims at the v2 level band (party level 4).
 * Sim options (debug; logs show with verbose=1): n=<fights>, level=<n>, real=1 (random real-hero parties; needs the hero
 * files loaded), fights=1 (a line per fight), party=a,b,c,d, telemetry=1 (damage by source), trace=1 (round by round),
 * only=<i>, nopuzzle=1, tune=lich.N.notice=8;lichtenstein.hp=240;iris_eye_beam.dmg=10 (enemy fields, a module's N, a
 * skill's level-1 numbers).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const L = function () { return DD.Act2Bosses && DD.Act2Bosses.lich; };
  const I = function () { return DD.Act2Bosses && DD.Act2Bosses.iris; };

  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const BAND = 4;   // DESIGN §5 v2: a party is about level 3-4 at the act 2 boss

  // ---- helpers -----------------------------------------------------------------------------------------------------
  /**
   * Run heroes at a v2 level: the 2 starting skills plus one boon per level gained (learn up to 2 more skills, then
   * upgrades, first skills first), like a party that levelled once per won fight.
   */
  function partyAt(level, ids) {
    return (ids || PARTY).map(function (id) {
      const h = DD.getHero(id);
      const boons = Math.max(0, level - 1);
      const learn = Math.min(2, boons);
      const list = h.startingSkills.concat(h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, learn));
      const skills = list.map(function (s) { return { id: s, level: 1 }; });
      for (let k = 0, up = boons - learn; up > 0 && k < 12; k++) {
        const sk = skills[k % skills.length];
        if (sk.level < Math.min(3, DD.getSkill(sk.id).levels.length)) { sk.level++; up--; }
      }
      return DD.Combat.makeRunHero({ id: id, level: level, skills: skills });
    });
  }
  function realHeroIds() { return Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); }); }
  /** The sim party: ?party=a,b,c,d, ?real=1 (4 random real heroes per fight), else the fixture party. */
  function simParty(t, level, i) {
    const want = String(t.param('party', '')).split(',').filter(function (id) { return id && DD.getHero(id); });
    if (want.length) return partyAt(level, want);
    if (t.param('real', '0') === '1' && realHeroIds().length >= 4) {
      const rng = DD.RNG('bosses_act2:party:' + i + ':' + (t.seed || 0));
      return partyAt(level, rng.sample(realHeroIds(), 4));
    }
    return partyAt(level);
  }
  /**
   * A real boss arena (Encounter.build + its onStart) started as a sandbox: no deployment, heroes first in a fixed order,
   * so turns can be handed out with DD.Combat.giveTurnTo. opts: { ai: true } (AI turns act), level, party, initiative.
   */
  function fight(encId, seed, opts) {
    opts = opts || {};
    const setup = DD.Encounter.build(DD.getEncounter(encId), opts.party || partyAt(opts.level || BAND),
      { rng: DD.RNG('bosses_act2:' + encId + ':' + seed), difficulty: 'normal', act: 2 });
    DD.Combat.start(setup, { seed: seed, headless: true, sandbox: true, kind: 'boss', initiative: opts.initiative || 'heroesFirst',
      enemyAi: opts.ai ? undefined : false });
    return DD.Combat.state;
  }
  /** A real fight as the game runs it (deployment, rolled initiative): for AutoPlay. */
  function realFight(encId, seed, party) {
    const setup = DD.Encounter.build(DD.getEncounter(encId), party || partyAt(BAND), { rng: DD.RNG('bosses_act2:' + encId + ':' + seed), difficulty: 'normal', act: 2 });
    DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: 'boss' });
    return DD.Combat.state;
  }
  function units(defId) { return DD.Combat.state.units.filter(function (u) { return u.defId === defId && !u.dead && !u.downed; }); }
  function hero(defId) { return units(defId)[0]; }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function key(p) { return p.x + ',' + p.y; }
  /** Do an enemy skill now (an action, no cooldown), like its turn would. */
  function now(u, skillId, target, opts) { return DD.AI.useNow(u, skillId, target, Object.assign({ noCooldown: true }, opts || {})); }
  /** Teleport unit to (x, y), first clearing anything standing there. */
  function put(u, x, y) {
    const o = DD.Grid.unitAt(x, y);
    if (o && o !== u) { const p = DD.Grid.nearestFree(x, y); DD.Act.teleport(o, p.x, p.y, { fx: false, noEnter: true }); }
    if (u.x !== x || u.y !== y) DD.Act.teleport(u, x, y, { fx: false, noEnter: true });
    return u;
  }
  /** Park every hero but `keep` in the bottom corner, far from everything. */
  function parkHeroes(keep) {
    const s = DD.Combat.state;
    const spots = [{ x: 1, y: s.grid.h - 1 }, { x: 2, y: s.grid.h - 1 }, { x: 3, y: s.grid.h - 1 }, { x: 4, y: s.grid.h - 1 }];
    let i = 0;
    s.units.filter(function (u) { return u.side === 'hero' && !u.dead && (keep || []).indexOf(u) < 0; }).forEach(function (u) {
      const p = spots[i++];
      if (p && DD.Grid.isFree(p.x, p.y)) put(u, p.x, p.y);
    });
  }
  function killAll(defId) { units(defId).forEach(function (u) { DD.Act.kill(u, null, { force: true }); }); }
  function fullHp(list) { list.forEach(function (h) { h.hp = h.maxHp; h.block = 0; h.statuses = []; }); }
  /** A free walkable tile next to (x, y) (to interact with an object there). */
  function nextTo(x, y) {
    const n = DD.Grid.neighbors(x, y).filter(function (q) { return DD.Grid.isFree(q.x, q.y) && !DD.Grid.isDrop(q.x, q.y); });
    return n[0] ? { x: n[0].x, y: n[0].y } : null;
  }
  /** Make it u's turn (sandbox), stand it next to (x, y) and interact. */
  function interactAt(u, x, y) {
    if (!DD.Combat.isTurnOf(u)) DD.Combat.giveTurnTo(u);
    const spot = nextTo(x, y);
    if (spot && DD.Grid.dist(u, { x: x, y: y }) !== 1) put(u, spot.x, spot.y);
    return DD.Combat.interact(u, x, y);
  }
  /** Damage, wind-ups and skill uses while recording (a fight rule + event listeners); rec.off() when done. */
  function recorder() {
    const rec = { hits: [], used: [], windups: [], cancels: [] };
    DD.Act.addRule({ id: 'ba2_rec', name: 'Recorder', hooks: {
      onTakeDamage: function (d) { if (!DD.Act.simulating) rec.hits.push({ target: d.target, base: d.base, dealt: d.dealt, cause: d.cause, src: d.source, skill: d.skill ? d.skill.id : null }); },
      onSkillUsed: function (ctx) { if (!DD.Act.simulating) rec.used.push({ user: ctx.user, skill: ctx.skill.id, windup: !!(ctx.intent && ctx.intent.windup) }); },
    } });
    const a = DD.Events.on('windup:start', function (e) { rec.windups.push({ unit: e.unit, skill: e.intent.skillId, intent: e.intent }); });
    const b = DD.Events.on('windup:cancel', function (e) { rec.cancels.push({ unit: e.unit, reason: e.reason }); });
    rec.off = function () { a(); b(); DD.Act.removeRule('ba2_rec'); };
    rec.clear = function () { rec.hits.length = 0; rec.used.length = 0; rec.windups.length = 0; rec.cancels.length = 0; };
    rec.dmgTo = function (u, skill) { return rec.hits.filter(function (h) { return h.target === u && (!skill || h.skill === skill); }).reduce(function (a2, h) { return a2 + h.dealt; }, 0); };
    rec.usedBy = function (u) { return rec.used.filter(function (x) { return x.user === u; }).map(function (x) { return x.skill; }); };
    return rec;
  }
  function pendingOf(u, skillId) { return (u.intents || []).filter(function (i) { return i.skillId === skillId; }); }

  /**
   * Wind-up NUMBER honesty while fn runs: every wind-up that lands must hit for exactly the number DD.AI.describe showed
   * at the end of the last hero-controlled turn before it — the pipeline's attacker-side number, read the moment
   * modifyIncomingDamage fires (the target's Block / armor / Vulnerable come after). Returns { checked, bad }.
   */
  function watchNumbers(fn) {
    const out = { checked: 0, bad: [] };
    let snap = {}, cur = null;
    const take = function (e) {
      if (!e || !e.unit || !DD.Combat.isPlayerControlled(e.unit) || !DD.Combat.state) return;
      DD.Combat.state.units.forEach(function (u) {
        if (!u.dead && u.side === 'enemy') (u.intents || []).forEach(function (it) { snap[it.id] = DD.AI.describe(u, it).dmg; });
      });
    };
    const off = DD.Events.on('turn:end', take);
    const exec = DD.AI.executeIntent, fire = DD.Hooks.fire;
    DD.AI.executeIntent = function (unit, intent) {
      if (!intent || !intent.windup) return exec.apply(DD.AI, arguments);
      const prev = cur;
      cur = { unit: unit, intent: intent, tele: snap[intent.id] };
      try { return exec.apply(DD.AI, arguments); } finally { cur = prev; }
    };
    DD.Hooks.fire = function (name, unit, d) {
      if (name === 'modifyIncomingDamage' && cur && d && d.source === cur.unit && d.cause === 'skill' && cur.tele !== undefined && !DD.Act.simulating) {
        out.checked++;
        const raw = Math.round(d.amount * d.mult + d.flat);
        if (raw !== cur.tele) out.bad.push(cur.intent.skillId + ': showed ' + cur.tele + ', hit ' + raw + ' (round ' + DD.Combat.state.round + ')');
      }
      return fire.apply(DD.Hooks, arguments);
    };
    try { fn(); } finally { off(); DD.AI.executeIntent = exec; DD.Hooks.fire = fire; }
    return out;
  }
  /**
   * Scripted wind-up honesty (AutoPlay dodges nearly every wind-up, so its fights check few hits): the boss takes `turns`
   * turns (giveTurnTo); after each, a hero stands on a marked tile of every wind-up it charged, tweak(k) changes a modifier
   * (Weak on / off, fees...) and the number DD.AI.describe shows then is what each of those hits must deal when it lands
   * at the boss's next turn start (attacker side, read at modifyIncomingDamage). Returns { checked, bad, windups }.
   */
  function scriptedHonesty(boss, turns, tweak) {
    const out = { checked: 0, bad: [], windups: 0 };
    let snap = {}, cur = null;
    const exec = DD.AI.executeIntent, fire = DD.Hooks.fire;
    DD.AI.executeIntent = function (unit, intent) {
      if (!intent || !intent.windup) return exec.apply(DD.AI, arguments);
      const prev = cur;
      cur = { unit: unit, intent: intent, tele: snap[intent.id] };
      try { return exec.apply(DD.AI, arguments); } finally { cur = prev; }
    };
    DD.Hooks.fire = function (name, unit, d) {
      if (name === 'modifyIncomingDamage' && cur && d && d.source === cur.unit && d.cause === 'skill' && cur.tele !== undefined && !DD.Act.simulating) {
        out.checked++;
        const raw = Math.round(d.amount * d.mult + d.flat);
        if (raw !== cur.tele) out.bad.push(cur.intent.skillId + ': showed ' + cur.tele + ', hit ' + raw);
      }
      return fire.apply(DD.Hooks, arguments);
    };
    try {
      for (let k = 0; k < turns && !DD.Combat.state.result && !boss.dead; k++) {
        DD.Combat.giveTurnTo(boss);
        if (DD.Combat.state.result || boss.dead) break;
        const heroes = DD.Combat.heroes().filter(function (h) { return !h.dead; });
        heroes.forEach(function (h) { h.downed = false; h.hp = h.maxHp; h.block = 0; h.statuses = []; });
        let i = 0;
        (boss.intents || []).forEach(function (it) {
          out.windups++;
          if (it.anchor === 'unit') return;   // tracked: it follows its target
          const free = DD.AI.intentTiles(boss, it).filter(function (p) { return DD.Grid.isFree(p.x, p.y) && DD.Grid.isWalkable(p.x, p.y); });
          const h = heroes[i++ % heroes.length];
          if (free.length && h) put(h, free[0].x, free[0].y);
        });
        if (tweak) tweak(k);
        snap = {};
        (boss.intents || []).forEach(function (it) { snap[it.id] = DD.AI.describe(boss, it).dmg; });
      }
    } finally { DD.AI.executeIntent = exec; DD.Hooks.fire = fire; }
    return out;
  }
  /** AutoPlay rounds where the boss gets Weakened (1 or 2 turns) on some hero turns, after it charged its wind-ups. */
  function weakenedAutoplay(boss, turns) {
    const s = DD.Combat.state;
    if (!s.order) DD.Combat.rollInitiative();
    for (let k = 0; k < turns && !s.result; k++) {
      if (k % 3 === 1 && !boss.dead) DD.Act.addStatus(boss, 'weak', { turns: 1 + (k % 2) }, null);
      DD.AutoPlay.takeTurn();
      if (!s.result) DD.Combat.endTurn();
    }
  }

  // ---- balance-tuning hook (debug only) ---------------------------------------------------------------------------
  /** ?tune=lichtenstein.hp=240;iris.N.gaze=3;iris_eye_beam.dmg=12 sets enemy def fields, a boss module's N or a skill's L1. */
  function applyTune(spec) {
    const undo = [];
    String(spec || '').split(';').filter(Boolean).forEach(function (kv) {
      const m = /^([\w.]+)=(-?[\d.]+)$/.exec(kv.trim());
      if (!m) return;
      const path = m[1].split('.'), v = +m[2];
      let obj = null, k = null;
      if (path.length === 2 && DD.getEnemy(path[0])) { obj = DD.getEnemy(path[0]); k = path[1]; }
      else if (path.length === 3 && path[1] === 'N' && DD.Act2Bosses[path[0]]) { obj = DD.Act2Bosses[path[0]].N; k = path[2]; }
      else if (path.length === 2 && DD.getSkill(path[0])) { obj = DD.getSkill(path[0]).levels[0]; k = path[1]; }
      if (!obj) return;
      const old = obj[k];
      obj[k] = v;
      undo.push(function () { obj[k] = old; });
    });
    return function () { undo.reverse().forEach(function (f) { f(); }); };
  }
  /** Damage telemetry rule: who hurt whom (by skill / cause and source). */
  function tracker(s) {
    const rec = { toBoss: {}, toHeroes: {} };
    s.rules.push({ id: 'ba2_tracker', name: 'Tracker', icon: '📈', desc: '', turns: -1, hooks: {
      onTakeDamage: function (d) {
        if (!d.dealt || DD.Act.simulating) return;
        const src = d.source ? (d.source.side === 'hero' ? 'heroes' : d.source.defId) : d.cause;
        if (d.target.tier === 'boss') rec.toBoss[d.cause + ':' + src] = (rec.toBoss[d.cause + ':' + src] || 0) + d.dealt;
        else if (d.target.side === 'hero') {
          const k = (d.skill ? d.skill.id : d.cause) + ':' + src;
          rec.toHeroes[k] = (rec.toHeroes[k] || 0) + d.dealt;
        }
      },
    } });
    return rec;
  }
  function shortState(s) {
    return 'R' + s.round + ' ' + s.units.filter(function (u) { return !u.dead; }).map(function (u) {
      return u.name.slice(0, 5) + '@' + u.x + ',' + u.y + ':' + u.hp + (u.intents && u.intents.length ? '[' + u.intents.map(function (i) { return i.skillId.replace(/^(lich|iris)_/, ''); }).join(',') + ']' : '');
    }).join(' ');
  }
  function sims(t, encId, n, level, statsFn) {
    const untune = applyTune(t.param('tune', ''));
    // ?nopuzzle=1 (balance runs only): AutoPlay ignores the puzzle objects (their hints read 0)
    const saved = [];
    if (t.param('nopuzzle', '0') === '1') {
      ['lich_shelf', 'lich_catalog'].forEach(function (id) {
        const d = DD.getObject(id);
        saved.push({ d: d, f: d.autoplay });
        d.autoplay = function () { return 0; };
      });
    }
    try { return simsInner(t, encId, n, level, statsFn); } finally {
      untune();
      saved.forEach(function (x) { x.d.autoplay = x.f; });
    }
  }
  function simsInner(t, encId, n, level, statsFn) {
    let wins = 0, rounds = 0, timeouts = 0;
    const agg = {}, tb = {}, th = {}, per = [];
    for (let i = 0; i < n; i++) {
      if (t.param('only', '') !== '' && +t.param('only', '') !== i) continue;
      const pt = simParty(t, level, i);
      const s = realFight(encId, 1000 + i * 7919 + (+t.seed || 0), pt);
      if (t.param('nopuzzle', '0') === '1') {
        s.grid.tiles.forEach(function (q) { if (q.obj && q.obj.id === 'mirror') q.obj.autoplay = function () { return 0; }; });
      }
      if (t.param('fights', '0') === '1') t.log('#' + i + ' party ' + pt.map(function (h) { return h.id; }).join(',') + ' setup ' + setupSig(s));
      const rec = t.param('telemetry', '0') === '1' ? tracker(s) : null;
      let res;
      if (t.param('trace', '0') === '1') {
        DD.Combat.rollInitiative();
        let lastRound = -1;
        for (let g = 0; g < 200 && !s.result && s.round <= 30; g++) {
          if (s.round !== lastRound) { lastRound = s.round; t.log(shortState(s)); }
          DD.AutoPlay.takeTurn();
          if (!s.result) DD.Combat.endTurn();
        }
        res = { result: s.result, rounds: s.round, timeout: !s.result };
      } else res = DD.AutoPlay.runBattle(30);
      if (rec) {
        for (const k in rec.toBoss) tb[k] = (tb[k] || 0) + rec.toBoss[k];
        for (const k in rec.toHeroes) th[k] = (th[k] || 0) + rec.toHeroes[k];
      }
      if (res.result === 'victory') wins++;
      if (res.timeout) timeouts++;
      rounds += res.rounds;
      const st = statsFn ? statsFn(s) : {};
      st.hpLost = Math.round(100 * (1 - s.units.filter(function (u) { return u.kind === 'hero'; }).reduce(function (a, h) { return a + (h.downed ? 0 : h.hp); }, 0) /
        Math.max(1, s.units.filter(function (u) { return u.kind === 'hero'; }).reduce(function (a, h) { return a + h.maxHp; }, 0))));
      per.push(st);
      for (const k in st) agg[k] = (agg[k] || 0) + st[k];
      if (t.param('fights', '0') === '1') t.log('#' + i + ' ' + (res.result || 'timeout') + ' in ' + res.rounds + ' rounds ' + JSON.stringify(st));
    }
    const m = per.length || 1;
    const avgOf = function (k) { return ((agg[k] || 0) / m).toFixed(1); };
    t.log(encId + ' (level ' + level + (t.param('real', '0') === '1' ? ', real heroes' : t.param('party', '') ? ', ' + t.param('party', '') : ', fixture party') + '): won ' + wins + '/' + m +
      ' (' + Math.round(100 * wins / m) + '%), avg rounds ' + (rounds / m).toFixed(1) + ', timeouts ' + timeouts + ', avg ' +
      Object.keys(agg).map(function (k) { return k + ' ' + avgOf(k); }).join(', '));
    if (Object.keys(tb).length) {
      const avg = function (o) { const r = {}; Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).forEach(function (k) { r[k] = Math.round(o[k] / m); }); return r; };
      t.log('avg damage to the boss per fight: ' + JSON.stringify(avg(tb)));
      t.log('avg damage to heroes per fight: ' + JSON.stringify(avg(th)));
    }
    return { wins: wins, n: m, rate: wins / m, rounds: rounds / m, timeouts: timeouts, agg: agg, per: per };
  }
  /**
   * The balance bands the sim suites guard (AutoPlay at the v2 level band, full HP, no items). Real heroes (real=1, with
   * the hero files loaded) are the target — hard but fair: a competent party wins most of the time and pays for it. The
   * fixture party (the default: isolated runs) hits far softer than real kits, so its band is a loose yardstick: not a
   * walk, and either won now and then or close (the boss left under 35% HP on average).
   */
  function checkBand(t, r, level, bossId) {
    if (t.param('tune', '') || t.param('party', '') || level !== BAND) return;
    const left = (r.agg.bossHp || 0) / r.n / Math.max(1, DD.getEnemy(bossId).hp);
    const pct = Math.round(r.rate * 100) + '%, ' + r.rounds.toFixed(1) + ' rounds, boss HP left ' + Math.round(left * 100) + '%';
    if (t.param('real', '0') === '1') {
      t.ok(r.rate >= 0.55 && r.rate <= 0.92, 'real heroes: win rate in the hard-but-fair band (' + pct + ')');
      t.ok(r.rounds <= 14, 'real heroes: fights stay reasonable (' + pct + ')');
    } else {
      t.ok(r.rate <= 0.95, 'fixture party: not a walk (' + pct + ')');
      t.ok(r.rate >= 0.15 || left <= 0.35, 'fixture party: winnable, or at least close (' + pct + ')');
      t.ok(r.rounds <= 20, 'fixture party: fights end (' + pct + ')');
    }
  }
  /** The fight's random setup (shelf roles / mirror angles + rotation offsets), for balance logs. */
  function setupSig(s) {
    const objs = s.grid.tiles.filter(function (q) { return q.obj && (q.obj.id === 'lich_shelf' || q.obj.id === 'mirror'); });
    const b = s.units.filter(function (u) { return u.tier === 'boss'; })[0];
    const d = b && b.data && b.data.iris;
    return objs.map(function (q) { return q.obj.id === 'mirror' ? q.obj.data.facing : (q.obj.data.role || '?')[0]; }).join('') +
      (d ? ' rot ' + d.rot + ' exam ' + d.exam : '') + ' rng ' + s.rng.getState();
  }
  function lichStats(s) {
    const fd = (s.data && s.data.lich) || {};
    const boss = s.units.filter(function (u) { return u.defId === 'lichtenstein'; })[0];
    return { lookups: fd.lookups || 0, shredded: fd.shredded || 0, spent: fd.spent || 0, mimics: fd.mimics || 0, bossHp: boss ? boss.hp : 0, downs: s.stats.downs || 0 };
  }
  function irisStats(s) {
    const fd = (s.data && s.data.iris) || {};
    const boss = s.units.filter(function (u) { return u.defId === 'dr_iris'; })[0];
    return { reflections: fd.reflections || 0, rotations: fd.rotations || 0, flinches: fd.flinches || 0, bossHp: boss ? boss.hp : 0, downs: s.stats.downs || 0 };
  }

  // =================================================================================================================
  // Lich-tenstein
  // =================================================================================================================
  function lichFight(seed, opts) {
    const s = fight('boss_lichtenstein', seed || 3, opts);
    return { s: s, lich: L().findLich() };
  }
  function shelvesWith(role) { return L().shelves().filter(function (q) { return q.obj.data.role === role; }); }

  T.suite('bosses_act2: lich arena, roles and registry', function (t) {
    const def = DD.getEnemy('lichtenstein'), N = L().N;
    t.ok(def && def.tier === 'boss' && def.act === 2 && def.boss && def.boss.title, 'lichtenstein is an act 2 boss with a title');
    t.ok(def.hp >= 200 && def.hp <= 320, 'HP ' + def.hp);
    t.ok(typeof def.ai === 'function' && !def.turnsPerRound, 'custom planner, one turn a round');
    t.eq(def.skills.join(), 'lich_overdue_notice,lich_interns', 'his skill list is what he does at once (reach / AutoPlay read it)');
    L().WINDUPS.forEach(function (id) {
      const sk = DD.getSkill(id);
      t.ok(sk && def.skills.indexOf(id) < 0 && def.desc.indexOf(sk.name) >= 0, id + ': a wind-up of his rotation (registered, named in his codex entry, not in his skill list)');
    });
    t.ok(def.passive && typeof def.passive.desc === 'function', 'an inspect-panel passive with live text');
    const enc = DD.getEncounter('boss_lichtenstein');
    t.ok(enc && enc.kind === 'boss' && enc.act === 2 && enc.objective.type === 'boss' && !!enc.intro, 'boss encounter');
    const f = lichFight(3);
    const s = f.s;
    t.ok(f.lich && DD.Grid.tile(f.lich.x, f.lich.y).tag === 'boss_spawn', 'the lich starts on his spawn mark');
    t.eq(units('lich_intern').length, 2, 'two interns at the start');
    t.eq(L().shelves().length, 8, '8 Restricted Section Shelves');
    t.eq(shelvesWith('phylactery').length, 3, '3 phylacteries');
    t.eq(shelvesWith('mimic').length, 2, '2 mimics');
    t.eq(shelvesWith('empty').length, 3, '3 plain shelves');
    t.eq(s.grid.tiles.filter(function (q) { return q.obj && q.obj.id === 'lich_catalog'; }).length, 2, '2 card catalogs');
    t.ok(s.grid.tiles.some(function (q) { return q.tag === 'lich_chute'; }), 'the book-return chute (pit) is marked');
    // the phylacteries hide among the 6 shelves farthest from the deployment zone
    const zone = s.grid.tiles.filter(function (q) { return q.zone === 'hero'; });
    const depth = function (q) { let d = 99; zone.forEach(function (z) { d = Math.min(d, DD.Grid.dist(z, q)); }); return d; };
    const sorted = L().shelves().slice().sort(function (a, b) { return depth(b) - depth(a); });
    const cutoff = depth(sorted[5]);
    t.ok(shelvesWith('phylactery').every(function (q) { return depth(q) >= cutoff; }), 'phylacteries are deep in the library');
    t.ok(L().shelves().every(function (q) { return q.obj.label === 'Restricted Section Shelf' && !q.obj.data.revealed; }), 'roles are hidden at the start');
    t.ok(/Phylacteries shredded 0/.test(s.objective.flavor || '') && /Card Catalog/.test(s.objective.flavor), 'objective subtitle tracks the puzzle: ' + s.objective.flavor);
    t.ok(/Next: Bookfall/.test(def.passive.desc(f.lich)) && /can't die/.test(def.passive.desc(f.lich)), 'the passive line names his rotation and the next step: ' + def.passive.desc(f.lich));
    t.ok(def.passive.desc(null).length > 20, 'the passive text copes without a unit');
    t.ok(L().fees(f.lich) === 0 && f.lich.block === 0, 'no fees and no Block at the start');
    const sigs = {};
    for (let k = 1; k <= 6; k++) { lichFight(k); sigs[L().shelves().map(function (q) { return q.obj.data.role[0]; }).join('')] = 1; }
    t.ok(Object.keys(sigs).length > 1, 'shelf roles vary between fights (' + Object.keys(sigs).length + ' layouts in 6 seeds)');
    t.ok(DD.defs.narration.lich_renew && DD.defs.narration.lich_phase2 && DD.defs.narration.lich_victory, 'narration keys registered');
    t.ok(N.notice >= 8 && N.final >= 18, 'numbers in the act 2 boss range (notice ' + N.notice + ', Final Notice ' + N.final + ')');
  });

  T.suite('bosses_act2: lich attacks deal exactly their desc damage', function (t) {
    const f = lichFight(4);
    const lich = f.lich, N = L().N;
    killAll('lich_intern');
    const mage = hero('test_mage'), rogue = hero('test_rogue');
    parkHeroes([mage, rogue]);
    put(lich, 7, 2);
    put(mage, 7, 5);
    // Overdue Notice (at once): 9, + Late Fees
    const sk = DD.getSkill('lich_overdue_notice');
    t.ok(new RegExp('\\b' + N.notice + '\\b').test(DD.skillDesc(sk, 1, null)), 'notice desc shows ' + N.notice);
    let hp = mage.hp;
    now(lich, 'lich_overdue_notice', mage, { anchor: 'unit' });
    t.eq(hp - mage.hp, N.notice, 'Overdue Notice deals ' + N.notice);
    DD.Act.addStatus(lich, 'lich_late_fees', { stacks: 3, turns: -1, silent: true }, lich);
    t.eq(L().fees(lich), 3, 'fees 3');
    t.eq(L().teleDmg(lich, N.notice), N.notice + 3, 'the shown number includes the fees');
    hp = mage.hp;
    now(lich, 'lich_overdue_notice', mage, { anchor: 'unit' });
    t.eq(hp - mage.hp, N.notice + 3, 'Overdue Notice with Late Fees 3 deals ' + (N.notice + 3));
    DD.Act.removeStatus(lich, 'lich_late_fees', { silent: true });
    // it's mail: no line of sight needed (a shelf between doesn't help), but it has a range
    fullHp([mage]);
    put(mage, 2, 5);
    t.ok(!DD.Grid.los(lich, mage), 'the shelf at (2,4) hides the mage');
    hp = mage.hp;
    now(lich, 'lich_overdue_notice', mage, { anchor: 'unit' });
    t.eq(hp - mage.hp, N.notice, 'out of sight: the notice still finds her');
    t.eq(L().noticeTarget(lich, [mage]), mage, 'and the planner may pick a foe out of sight');
    t.ok(/walls and shelves don't stop it/.test(DD.skillDesc(sk, 1, null)), 'the desc says so');
    put(mage, 1, 11);
    if (N.noticeRange >= 30) {
      t.eq(L().noticeTarget(lich, [mage]), mage, 'the far corner of the library (' + DD.Grid.dist(lich, mage) + ' tiles) is not far enough');
      t.ok(/to the nearest foe, however far/.test(DD.skillDesc(sk, 1, null)), 'the desc says "the nearest foe, however far"');
    } else {
      t.ok(DD.Grid.dist(lich, mage) > N.noticeRange, 'out of range (' + DD.Grid.dist(lich, mage) + ')');
      t.eq(L().noticeTarget(lich, [mage]), null, 'out of range: no notice');
    }
    // whom it goes to (review v2): the NEAREST foe, on a tie the one with the most HP — never "the weakest, anywhere"
    fullHp([mage, rogue]);
    put(mage, 7, 9); put(rogue, 7, 5);
    mage.hp = 3;
    t.eq((L().noticeTarget(lich, [mage, rogue]) || {}).name, rogue.name, 'the nearest foe gets the mail, not the 3-HP mage farther away');
    mage.hp = mage.maxHp; rogue.hp = 2;
    put(rogue, 8, 8);
    t.eq(DD.Grid.dist(lich, rogue), DD.Grid.dist(lich, mage), 'premise: a tie (' + DD.Grid.dist(lich, rogue) + ' tiles each)');
    t.eq((L().noticeTarget(lich, [mage, rogue]) || {}).name, mage.name, 'on a tie: the one with the most HP');
    t.ok(/on a tie, the one with the most HP/.test(DD.skillDesc(sk, 1, null)), 'the desc states the rule');
    fullHp([mage, rogue]);
    // Bookfall: only the marked squares
    fullHp([mage, rogue]);
    put(mage, 6, 7); put(rogue, 7, 7);
    const reg = L().checkerRegion([mage, rogue]);
    const par = (mage.x + mage.y) % 2;
    const tiles = L().checkerTiles(reg, par);
    t.ok(tiles.some(function (p) { return p.x === mage.x && p.y === mage.y; }) && !tiles.some(function (p) { return p.x === rogue.x && p.y === rogue.y; }), 'checkerboard: mage on a marked square, rogue on an unmarked one');
    t.ok(tiles.every(function (p) { return (p.x + p.y) % 2 === par; }), 'every marked square has the same colour');
    let a = mage.hp, b = rogue.hp;
    now(lich, 'lich_bookfall', { x: reg.cx, y: reg.cy }, { anchor: 'ground', tiles: tiles });
    t.eq(a - mage.hp, N.bookfall, 'Bookfall deals ' + N.bookfall + ' on a marked square');
    t.eq(rogue.hp, b, 'Bookfall misses the unmarked square');
    // SHHHH!: radius 2, 9 + Silence, spares his staff; QUIET!!!: radius 3, 12
    fullHp([mage, rogue]);
    put(mage, 7, 4); put(rogue, 7, 6);
    const clerk = DD.Act.spawn('lich_intern', 8, 2, { noFx: true, silent: true });
    a = mage.hp; b = rogue.hp;
    now(lich, 'lich_shhh', lich, { anchor: 'self' });
    t.eq(a - mage.hp, N.shhh, 'SHHHH! deals ' + N.shhh + ' within 2');
    t.ok(has(mage, 'silenced'), 'SHHHH! silences');
    t.eq(rogue.hp, b, 'SHHHH! misses 4 tiles away');
    t.ok(clerk && clerk.hp === clerk.maxHp, 'and spares his own staff (the desc says "each of his foes")');
    t.ok(/Each of his foes within 2 tiles/.test(DD.skillDesc(DD.getSkill('lich_shhh'), 1, null)), 'SHHHH! desc names who it hits');
    if (clerk) DD.Act.kill(clerk, null, { force: true });
    fullHp([mage, rogue]);
    put(rogue, 7, 5);
    a = mage.hp; b = rogue.hp;
    now(lich, 'lich_quiet', lich, { anchor: 'self' });
    t.eq(a - mage.hp, N.quiet, 'QUIET!!! deals ' + N.quiet);
    t.eq(b - rogue.hp, N.quiet, 'QUIET!!! reaches 3 tiles');
    // Final Notice: whole rows
    fullHp([mage, rogue]);
    put(mage, 5, 9); put(rogue, 5, 7);
    const row = []; for (let x = 0; x < f.s.grid.w; x++) if (DD.Grid.isWalkable(x, 9)) row.push({ x: x, y: 9 });
    a = mage.hp; b = rogue.hp;
    now(lich, 'lich_final_notice', { x: 7, y: 9 }, { anchor: 'ground', tiles: row });
    t.eq(a - mage.hp, N.final, 'Final Notice deals ' + N.final + ' on its row');
    t.eq(rogue.hp, b, 'Final Notice misses other rows');
    const fb = DD.Targeting.area(lich, DD.getSkill('lich_final_notice'), 1, { x: 7, y: 9 });
    const rowsHit = fb.map(function (p) { return p.y; }).filter(function (y, i, arr) { return arr.indexOf(y) === i; }).sort(function (x, y) { return x - y; });
    t.eq(rowsHit.join(), '9,10', 'fallback area (no explicit tiles): rows 9 and 10, like the desc');
    // intern stamp + mimic chomp
    fullHp([mage, rogue]);
    const intern = DD.Act.spawn('lich_intern', 6, 9, { noFx: true, silent: true });
    a = mage.hp;
    now(intern, 'lich_intern_stamp', mage, {});
    t.eq(a - mage.hp, N.internDmg, 'OVERDUE Stamp deals ' + N.internDmg);
    t.ok(has(mage, 'marked') && DD.Act.getStatus(mage, 'marked').stacks === N.internMark, 'and Marks ' + N.internMark);
    const mimic = DD.Act.spawn('lich_mimic', 4, 9, { noFx: true, silent: true });
    a = mage.hp;
    now(mimic, 'lich_mimic_chomp', mage, {});
    t.eq(a - mage.hp, N.mimicDmg + N.internMark, 'Paperback Chomp deals ' + N.mimicDmg + ' (+' + N.internMark + ' from the OVERDUE mark)');
    t.ok(has(mage, 'root'), 'and Roots');
    // every lich skill describes itself without a user and shows its numbers
    ['lich_overdue_notice', 'lich_bookfall', 'lich_shhh', 'lich_quiet', 'lich_interns', 'lich_final_notice', 'lich_intern_stamp', 'lich_mimic_chomp'].forEach(function (id) {
      const d = DD.getSkill(id);
      t.ok(d && d.levels.every(function (Lv, i) { const txt = DD.skillDesc(d, i + 1, null); return txt && (!Lv.dmg || new RegExp('\\b' + Lv.dmg + '\\b').test(txt)); }), id + ' desc shows its numbers');
    });
    // his minions hold the line: their basic (first) skill is melee, so walking away from them provokes
    t.ok(DD.Act.opportunitySlot(intern) && DD.Act.opportunitySlot(intern).id === 'lich_intern_stamp', 'a Work-Study Skeleton makes attacks of opportunity with its stamp');
    t.ok(DD.Act.opportunitySlot(mimic) && DD.Act.opportunitySlot(mimic).id === 'lich_mimic_chomp', 'so does a mimic');
    t.ok(!DD.Act.opportunitySlot(lich), 'the lich himself (a caster) makes none');
  });

  T.suite('bosses_act2: lich wind-ups land at the start of his next turn, a stun interrupts them', function (t) {
    const f = lichFight(5, { ai: true });
    const lich = f.lich, N = L().N;
    killAll('lich_intern');
    const mage = hero('test_mage'), rogue = hero('test_rogue'), cleric = hero('test_cleric'), knight = hero('test_knight');
    put(lich, 7, 2);
    put(mage, 6, 7); put(rogue, 7, 7); put(cleric, 8, 9); put(knight, 5, 9);
    const rec = recorder();
    L().data(lich).step = 0;
    t.eq(L().nextStep(lich), 'bookfall', 'his next step is a Bookfall');
    DD.Combat.giveTurnTo(lich);   // his turn: an Overdue Notice now + the Bookfall wind-up
    const fall = pendingOf(lich, 'lich_bookfall')[0];
    t.ok(fall && fall.windup && fall.turnsLeft === 1, 'Bookfall is a wind-up (⏳1)');
    t.ok(rec.windups.some(function (w) { return w.intent === fall; }), 'announced (windup:start)');
    t.ok(rec.usedBy(lich).indexOf('lich_overdue_notice') >= 0, 'the Overdue Notice was fired at once');
    t.eq(rec.hits.filter(function (h) { return h.skill === 'lich_bookfall'; }).length, 0, 'the Bookfall has not landed yet');
    t.ok(DD.AI.windups().some(function (w) { return w.intent === fall && w.tiles.length > 0; }), 'the HUD lists it with its marked tiles');
    t.eq(L().fees(lich), N.feeRate, 'his fees grew by ' + N.feeRate + ' at the end of his turn');
    t.eq(DD.AI.describe(lich, fall).dmg, N.bookfall + L().fees(lich), 'its number includes the fees, live');
    t.ok(DD.Combat.state.phase === 'player' && DD.Combat.isPlayerControlled(DD.Combat.current()), 'then the heroes get their turns');
    // the heroes answer: the mage stands on a marked square, the rogue steps off
    const marked = DD.AI.intentTiles(lich, fall);
    const mk = marked.filter(function (p) { return !DD.Grid.unitAt(p.x, p.y) || DD.Grid.unitAt(p.x, p.y) === mage; })[0];
    const reg = { x0: Math.min.apply(null, marked.map(function (p) { return p.x; })), y0: Math.min.apply(null, marked.map(function (p) { return p.y; })) };
    put(mage, mk.x, mk.y);
    let safe = null;
    for (let y = reg.y0; y <= reg.y0 + 6 && !safe; y++) for (let x = reg.x0; x <= reg.x0 + 6 && !safe; x++) {
      if (DD.Grid.isFree(x, y) && !marked.some(function (p) { return p.x === x && p.y === y; })) safe = { x: x, y: y };
    }
    put(rogue, safe.x, safe.y);
    put(cleric, 1, 11); put(knight, 2, 11);
    fullHp([mage, rogue]);
    const shown = DD.AI.describe(lich, fall).dmg;
    rec.clear();
    DD.Combat.giveTurnTo(lich);   // his next turn: it lands first
    t.eq(rec.dmgTo(mage, 'lich_bookfall'), shown, 'it landed on the mage for the number it showed (' + shown + ')');
    t.eq(rec.dmgTo(rogue, 'lich_bookfall'), 0, 'the rogue stepped off the marked squares');
    t.ok(!lich.intents.some(function (i) { return i === fall; }), 'gone once landed');
    t.ok(rec.windups.length === 1, 'and he charged the next step (' + rec.windups.map(function (w) { return w.skill; }).join() + ')');
    // a stun on a hero's turn interrupts the pending wind-up at once; he loses his next turn
    const next = lich.intents.slice();
    t.ok(next.length === 1 && next[0].windup, 'one wind-up pending: ' + next.map(function (i) { return i.skillId; }).join());
    rec.clear();
    t.ok(DD.Act.addStatus(lich, 'stun', { turns: 1 }, knight), 'stunned on a hero\'s turn');
    t.eq(lich.intents.length, 0, 'the wind-up is interrupted at once');
    t.eq(rec.cancels.length, 1, 'windup:cancel');
    t.ok(has(lich, 'lich_focus') && DD.Act.getStatus(lich, 'lich_focus').turns === N.focus, 'Speed-Reading for ' + N.focus + ' of his turns');
    DD.Combat.giveTurnTo(lich);
    t.eq(rec.usedBy(lich).length, 0, 'he lost the turn: no notice, no wind-up');
    t.eq(lich.intents.length, 0, 'nothing charged');
    t.ok(!has(lich, 'stun') && has(lich, 'lich_focus'), 'the stun wore off, Speed-Reading still on (' + DD.Act.getStatus(lich, 'lich_focus').turns + ' left)');
    t.eq(DD.Act.addStatus(lich, 'stun', { turns: 1 }, knight), null, 'Speed-Reading: the next stun is shrugged off');
    DD.Combat.giveTurnTo(lich);
    t.ok(rec.usedBy(lich).indexOf('lich_overdue_notice') >= 0, 'he acts again the turn after');
    t.eq(DD.Act.addStatus(lich, 'frozen', { turns: 1 }, knight), null, 'still Speed-Reading (freezing shrugged off too)');
    DD.Combat.giveTurnTo(lich);
    t.ok(!has(lich, 'lich_focus'), 'Speed-Reading ran out after the lost turn and his next 2');
    t.ok(DD.Act.addStatus(lich, 'stun', { turns: 1 }, knight), 'then a stun lands again');
    rec.off();
  });

  T.suite('bosses_act2: lich late fees', function (t) {
    const f = lichFight(6);
    const lich = f.lich, N = L().N;
    const st = function () { return DD.Act.getStatus(lich, 'lich_late_fees'); };
    t.eq(L().fees(lich), 0, 'no fees at the start');
    DD.Combat.giveTurnTo(lich);   // AI off: his turn passes, the fees still grow at its end
    t.eq(L().fees(lich), N.feeRate + 2, '+' + N.feeRate + ' at the end of his turn, +1 per living skeleton (2)');
    killAll('lich_intern');
    DD.Combat.giveTurnTo(lich);
    t.eq(L().fees(lich), 2 * N.feeRate + 2, '+' + N.feeRate + ' with no skeleton left');
    t.ok(new RegExp('His attacks deal \\+' + L().fees(lich) + ' damage').test(DD.getStatus('lich_late_fees').desc(st())), 'status desc shows the live bonus');
    const growth = 'gains ' + N.feeRate + ' more at the end of each of his turns (' + N.feeRate2 + ' below half HP), +1 per living';
    t.ok(DD.getStatus('lich_late_fees').desc(st()).indexOf(growth) >= 0, 'and how it grows');
    // below half HP (FINAL NOTICE) they grow faster
    L().data(lich).phase = 2;
    const f1 = L().fees(lich);
    DD.Combat.giveTurnTo(lich);
    t.eq(L().fees(lich) - f1, N.feeRate2, 'FINAL NOTICE: +' + N.feeRate2 + ' a turn');
    L().data(lich).phase = 1;
    t.ok(DD.getStatus('lich_late_fees').desc(null).length > 10, 'desc without an instance');
    // every hit of his gets the fees (flat, after the multipliers)
    const mage = hero('test_mage');
    parkHeroes([mage]);
    put(lich, 7, 2); put(mage, 7, 5);
    let hp = mage.hp;
    now(lich, 'lich_overdue_notice', mage, { anchor: 'unit' });
    t.eq(hp - mage.hp, N.notice + L().fees(lich), 'the notice deals ' + N.notice + ' + fees');
    // wind-up numbers carry the fees live and follow every change (no frozen number)
    const it = DD.AI.windUp(lich, 'lich_bookfall', { x: mage.x, y: mage.y }, { tiles: [{ x: mage.x, y: mage.y }], label: 'Bookfall' });
    t.ok(it && it.dmgAuto !== false, 'no frozen wind-up number');
    t.eq(DD.AI.describe(lich, it).dmg, N.bookfall + L().fees(lich), 'shows ' + N.bookfall + ' + fees');
    L().addFees(lich, 3);
    t.eq(DD.AI.describe(lich, it).dmg, N.bookfall + L().fees(lich), 'follows the fees');
    DD.Act.addStatus(lich, 'weak', { turns: 1 }, mage);
    t.eq(DD.AI.describe(lich, it).dmg, Math.round(N.bookfall * 0.75) + L().fees(lich), 'a Weakened lich: ' + (Math.round(N.bookfall * 0.75) + L().fees(lich)) + ' (fees after the multiplier, like the pipeline)');
    DD.Act.removeStatus(lich, 'weak', { silent: true });
    // no cap: the fees are his clock (shredding resets them, see the puzzle suite)
    const f0 = L().fees(lich);
    L().addFees(lich, 30);
    t.eq(L().fees(lich), f0 + 30, 'no cap');
    t.ok(L().waiveFees(lich) && L().fees(lich) === 0, 'waived');
    t.eq(DD.AI.describe(lich, it).dmg, N.bookfall, 'the wind-up shows the plain number again');
    DD.AI.clearIntents(lich, false);
    // a pile of bones collects no fees
    lich.hp = 3;
    DD.Act.damage(mage, lich, 10);
    t.ok(L().isBones(lich), 'collapsed');
    DD.Combat.state.aiOff = true;
    DD.Combat.giveTurnTo(lich);
    t.eq(L().fees(lich), 0, 'no fees while he is a pile of bones');
  });

  T.suite('bosses_act2: lich rotation and phase 2', function (t) {
    const f = lichFight(7, { ai: true });
    const lich = f.lich, N = L().N;
    killAll('lich_intern');
    const mage = hero('test_mage'), rogue = hero('test_rogue'), cleric = hero('test_cleric'), knight = hero('test_knight');
    const rec = recorder();
    // a lich in a quiet corner of his desk, the party close enough for a shout but nobody next to him (fees waived each
    // turn: unshredded, they snowball and would down the party mid-test)
    const place = function () {
      killAll('lich_intern');
      killAll('lich_mimic');
      L().waiveFees(lich);
      put(lich, 7, 2);
      put(mage, 7, 4); put(rogue, 9, 4); put(cleric, 5, 5); put(knight, 8, 7);
      DD.Combat.state.units.forEach(function (u) { if (u.side === 'hero') { u.hp = u.maxHp; u.downed = false; } });
    };
    const turn = function () {
      place();
      rec.clear();
      DD.Combat.giveTurnTo(lich);
      const ws = rec.windups.map(function (w) { return w.skill + (/2nd Printing/.test(w.intent.label) ? '+2nd' : ''); });
      return { used: rec.usedBy(lich).filter(function (id) { return id !== 'lich_overdue_notice'; }), windups: ws, notice: rec.usedBy(lich).indexOf('lich_overdue_notice') >= 0 };
    };
    L().data(lich).step = 0;
    t.eq(L().nextStep(lich), 'bookfall', 'the passive names the next step');
    const p1 = [turn(), turn(), turn(), turn(), turn()];
    t.log('phase 1: ' + JSON.stringify(p1));
    t.ok(p1.every(function (x) { return x.notice; }), 'an Overdue Notice every turn');
    t.eq(p1[0].windups.join(), 'lich_bookfall', 'step 1: Bookfall (wind-up)');
    t.eq(p1[1].windups.join(), 'lich_bookfall+2nd', 'step 2: its Second Printing (wind-up, after the first wave landed)');
    t.eq(p1[2].windups.join(), 'lich_shhh', 'step 3: SHHHH! (wind-up)');
    t.ok(p1[3].windups.length === 0 && p1[3].used.indexOf('lich_interns') >= 0, 'step 4: Unpaid Internship (at once, no wind-up)');
    t.eq(p1[4].windups.join(), 'lich_bookfall', 'the rotation repeats');
    t.ok(p1.every(function (x) { return x.windups.length <= 1; }), 'never more than one wind-up a turn');
    // SHHHH! needs a foe close by: else he drops another Bookfall
    killAll('lich_intern');
    L().data(lich).step = 2;
    DD.AI.clearIntents(lich, false);
    rec.clear();
    put(mage, 2, 9); put(rogue, 3, 9); put(cleric, 4, 9); put(knight, 5, 11);
    DD.Combat.giveTurnTo(lich);
    t.eq(rec.windups.map(function (w) { return w.skill; }).join(), 'lich_bookfall', 'nobody near him: Bookfall instead of SHHHH!');
    // silenced: no spells that turn (no notice, no Bookfall), but SHHHH! is a shout
    place();
    L().data(lich).step = 0;
    DD.AI.clearIntents(lich, false);
    DD.Act.addStatus(lich, 'silenced', { turns: 1 }, knight);
    rec.clear();
    DD.Combat.giveTurnTo(lich);
    t.ok(rec.usedBy(lich).indexOf('lich_overdue_notice') < 0, 'silenced: no Overdue Notice');
    t.eq(rec.windups.map(function (w) { return w.skill; }).join(), 'lich_shhh', 'silenced: a shout instead of the Bookfall spell');
    // phase 2 at half HP: FINAL NOTICE → Bookfall → its Second Printing → QUIET!!! → interns
    place();
    DD.AI.clearIntents(lich, false);
    lich.hp = Math.floor(lich.maxHp * 0.5);
    const logAt = DD.Combat.state.log.length;
    const p2 = [turn(), turn(), turn(), turn(), turn()];
    t.log('phase 2: ' + JSON.stringify(p2));
    t.eq(L().data(lich).phase, 2, 'FINAL NOTICE: phase 2');
    t.ok(DD.Combat.state.log.slice(logAt).some(function (l) { return /FINAL NOTICE/.test(l.text); }), 'announced');
    t.eq(p2[0].windups.join(), 'lich_final_notice', 'step 1: Final Notice (wind-up)');
    t.eq(p2[1].windups.join(), 'lich_bookfall', 'step 2: Bookfall');
    t.eq(p2[2].windups.join(), 'lich_bookfall+2nd', 'step 3: its Second Printing');
    t.eq(p2[3].windups.join(), 'lich_quiet', 'step 4: QUIET!!!');
    t.ok(p2[4].used.indexOf('lich_interns') >= 0, 'step 5: Unpaid Internship');
    t.ok(/QUIET!!!/.test(L().passiveText(lich)) && /Final Notice/.test(L().passiveText(lich)), 'the passive line shows the phase 2 rotation');
    // the Second Printing covers the other squares of the same region, after the first wave landed
    place();
    DD.AI.clearIntents(lich, false);
    L().data(lich).step = 1;
    rec.clear();
    DD.Combat.giveTurnTo(lich);
    const w1 = pendingOf(lich, 'lich_bookfall')[0];
    t.ok(w1 && w1.data && w1.data.reprint, 'a Bookfall remembers its region');
    const t1 = w1.tiles.map(key);
    rec.clear();
    DD.Combat.giveTurnTo(lich);   // wave 1 lands, then the Second Printing is charged
    t.ok(rec.used.some(function (x) { return x.skill === 'lich_bookfall' && x.windup; }), 'wave 1 landed');
    const w2 = pendingOf(lich, 'lich_bookfall')[0];
    t.ok(w2 && w2 !== w1 && /2nd Printing/.test(w2.label), 'the Second Printing is charged: ' + (w2 && w2.label));
    if (w2) {
      const t2 = w2.tiles.map(key);
      t.ok(t1.every(function (k) { return t2.indexOf(k) < 0; }), 'the waves never overlap');
      const pa = (w1.tiles[0].x + w1.tiles[0].y) % 2, pb = (w2.tiles[0].x + w2.tiles[0].y) % 2;
      t.ok(pa !== pb, 'opposite colours of one region');
    }
    // an interrupted first wave leaves no Second Printing behind: he shouts instead
    place();
    DD.AI.clearIntents(lich, false);
    L().data(lich).step = 1;
    DD.Combat.giveTurnTo(lich);
    t.ok(pendingOf(lich, 'lich_bookfall').length === 1, 'wave 1 charged');
    DD.AI.cancelIntents(lich, 'test');
    rec.clear();
    DD.Combat.giveTurnTo(lich);
    t.eq(rec.windups.map(function (w) { return w.skill; }).join(), 'lich_quiet', 'no wave landed: no Second Printing (QUIET!!! instead)');
    rec.off();
  });

  T.suite('bosses_act2: lich puzzle: catalog, shelves, mimics, shredding', function (t) {
    const f = lichFight(8, { ai: true });
    const s = f.s, lich = f.lich, N = L().N;
    killAll('lich_intern');
    const mage = hero('test_mage'), rogue = hero('test_rogue'), knight = hero('test_knight');
    // the card catalog reveals the hidden phylactery nearest to the reader, once per round
    const cats = s.grid.tiles.filter(function (q) { return q.obj && q.obj.id === 'lich_catalog'; });
    const cat = cats[0];
    DD.Combat.giveTurnTo(mage);
    const spot = nextTo(cat.x, cat.y);
    put(mage, spot.x, spot.y);
    const ia = DD.Combat.interactions(mage).filter(function (x) { return x.x === cat.x && x.y === cat.y; })[0];
    t.ok(ia && ia.label === 'Look Up' && ia.ap === 1, 'Look Up (1 AP) offered next to the catalog');
    const hidden = L().hiddenPhylacteries().slice().sort(function (a, b) { return DD.Grid.dist(a, mage) - DD.Grid.dist(b, mage) || a.y - b.y || a.x - b.x; });
    t.ok(DD.getObject('lich_catalog').autoplay(mage, cat.obj) >= 10, 'AutoPlay hint: worth walking to');
    t.ok(DD.Combat.interact(mage, cat.x, cat.y), 'looked it up');
    t.ok(hidden[0].obj.data.revealed, 'the nearest hidden phylactery shelf glows');
    t.ok(/PHYLACTERY/.test(hidden[0].obj.label), 'its label says so: ' + hidden[0].obj.label);
    t.ok(/Search the glowing shelf/.test(s.objective.flavor), 'the subtitle moves on to the next step: ' + s.objective.flavor);
    t.eq(L().hiddenPhylacteries().length, 2, '2 still hidden');
    t.ok(!DD.Combat.interactions(mage).some(function (x) { return x.x === cat.x && x.y === cat.y; }), 'the catalog is jammed until next round');
    t.eq(DD.getObject('lich_catalog').autoplay(mage, cat.obj), 0, 'and its hint drops to 0');
    t.ok(DD.getObject('lich_catalog').autoplay(mage, cats[1].obj) > 0, 'the other catalog still works this round');
    // he charges a wind-up; shredding the glowing shelf: 25 damage, fees waived, Stun (it interrupts the wind-up)
    put(lich, 7, 2);
    put(knight, 6, 4);
    L().data(lich).step = 1;   // SHHHH!
    DD.Combat.giveTurnTo(lich);
    t.ok(lich.intents.length === 1, 'a wind-up is pending: ' + lich.intents.map(function (i) { return i.skillId; }).join());
    killAll('lich_intern');
    const shelf = hidden[0];
    t.eq(DD.getObject('lich_shelf').autoplay(rogue, shelf.obj), 48, 'a revealed phylactery is a top AutoPlay target');
    L().addFees(lich, 4);
    const hp = lich.hp, fees = L().fees(lich);
    t.ok(fees > 0, 'he has fees (' + fees + ')');
    t.ok(interactAt(rogue, shelf.x, shelf.y), 'searched the glowing shelf');
    t.eq(hp - lich.hp, N.phylactery, 'shredding a phylactery deals ' + N.phylactery);
    t.ok(has(lich, 'stun') && !lich.intents.length, 'and stuns him: his wind-up is interrupted');
    t.eq(L().fees(lich), 0, 'and waives the Late Fees');
    t.eq(L().fight().shredded, 1, '1 shredded');
    t.eq(L().phylacteryTiles().length, 2, '2 phylacteries left');
    t.ok(shelf.obj.data.searched && !DD.Combat.interactions(rogue).some(function (x) { return x.x === shelf.x && x.y === shelf.y; }), 'a searched shelf offers nothing more');
    t.eq(DD.getObject('lich_shelf').autoplay(rogue, shelf.obj), 0, 'its hint is 0');
    t.ok(/shredded 1 · left 2/.test(s.objective.flavor), 'objective subtitle updated: ' + s.objective.flavor);
    t.ok(/Look Up a Card Catalog/.test(s.objective.flavor), 'nothing glows any more: back to the catalog');
    // a mimic shelf bites
    const mim = shelvesWith('mimic')[0];
    DD.Combat.giveTurnTo(knight);
    const mspot = nextTo(mim.x, mim.y);
    put(knight, mspot.x, mspot.y);
    knight.block = 0;
    const mhp = knight.hp;
    t.eq(DD.getObject('lich_shelf').autoplay(knight, mim.obj), 0, 'AutoPlay never gambles on an unrevealed shelf');
    t.ok(DD.Combat.interact(knight, mim.x, mim.y), 'searched a mimic shelf');
    const m = DD.Grid.unitAt(mim.x, mim.y);
    t.ok(m && m.defId === 'lich_mimic', 'IT\'S A MIMIC');
    t.eq(mhp - knight.hp, N.mimicSurprise - (knight.armor || 0), 'surprise bite (' + N.mimicSurprise + ', minus armor)');
    t.eq(L().fight().mimics, 1, 'mimic counted');
    // a plain shelf: a good book (+5 HP)
    const dull = shelvesWith('empty')[0];
    DD.Combat.giveTurnTo(mage);
    mage.hp = mage.maxHp - 10;
    const h0 = mage.hp;
    interactAt(mage, dull.x, dull.y);
    t.eq(mage.hp, h0 + N.boon, 'a plain shelf: +' + N.boon + ' HP');
    t.ok(new RegExp('\\+' + N.boon + ' HP').test(DD.getObject('lich_shelf').desc), 'and the shelf desc says so');
    // breaking a phylactery shelf counts too (Speed-Reading from the first shred: no second stun)
    const p2 = L().phylacteryTiles()[0];
    const hp2 = lich.hp;
    DD.Act.damageObject(mage, p2.x, p2.y, 8);
    t.ok(!tile(p2.x, p2.y).obj, 'the shelf is destroyed');
    t.eq(hp2 - lich.hp, N.phylactery, 'breaking a phylactery shelf shreds it (' + N.phylactery + ' damage)');
    t.eq(L().fight().shredded, 2, '2 shredded');
    t.ok(!has(lich, 'stun') || DD.Act.getStatus(lich, 'stun').turns > 0, 'Speed-Reading: no fresh stun from the second shred');
    // breaking a mimic shelf releases the mimic
    const mim2 = shelvesWith('mimic')[0];
    DD.Act.damageObject(mage, mim2.x, mim2.y, 8);
    t.ok(DD.Grid.unitAt(mim2.x, mim2.y) && DD.Grid.unitAt(mim2.x, mim2.y).defId === 'lich_mimic', 'a broken mimic shelf releases its mimic');
  });

  T.suite('bosses_act2: lich bone pile, reforming and the final page', function (t) {
    let f = lichFight(9, { ai: true });
    let lich = f.lich;
    const N = L().N;
    killAll('lich_intern');
    const knight = hero('test_knight');
    // lethal damage with phylacteries left: a pile of bones
    DD.Combat.giveTurnTo(lich);   // he charges something
    t.ok(lich.intents.length > 0, 'a wind-up pending');
    lich.hp = 5;
    const rec = recorder();
    DD.Act.damage(knight, lich, 20);
    t.ok(!lich.dead && lich.hp === 1, 'he collapses at 1 HP instead of dying');
    t.ok(has(lich, 'lich_bonepile') && has(lich, 'invulnerable'), 'Pile of Bones + Invulnerable');
    t.eq(lich.intents.length, 0, 'his wind-up is gone');
    t.ok(rec.cancels.length === 1, 'windup:cancel for the HUD');
    t.eq(DD.Act.damage(knight, lich, 50), 0, 'a pile of bones takes no damage');
    t.eq(L().phylacteryTiles().length, 3, 'collapsing does not burn a phylactery yet');
    t.eq(DD.Combat.state.result, null, 'the fight goes on');
    t.ok(/Pile of Bones and reforms on his next turn/.test(DD.Combat.state.objective.flavor), 'the subtitle says what to do now: ' + DD.Combat.state.objective.flavor);
    t.eq(L().data(lich).phase, 1, 'collapsed from phase 1');
    // his next turn: reforming is all he does
    const logAt = DD.Combat.state.log.length;
    rec.clear();
    DD.Combat.giveTurnTo(lich);
    t.ok(DD.Combat.state.log.slice(logAt).some(function (l) { return /FINAL NOTICE/.test(l.text); }), 'reforming into phase 2 announces it');
    t.ok(!has(lich, 'lich_bonepile') && !has(lich, 'invulnerable'), 'reformed');
    t.eq(lich.hp, Math.round(lich.maxHp * N.reformPct), 'at ' + Math.round(N.reformPct * 100) + '% HP');
    t.eq(L().phylacteryTiles().length, 2, 'one phylactery burnt');
    t.eq(L().fight().spent, 1, 'spent 1');
    t.ok(L().shelves().some(function (q) { return q.obj.data.role === 'spent' && /Scorched/.test(q.obj.label); }), 'its shelf is scorched');
    t.ok(L().phylacteryTiles().some(function (q) { return q.obj.data.revealed; }), 'his soul\'s backup copy is revealed');
    t.eq(L().data(lich).phase, 2, 'reformed straight into phase 2');
    t.eq(rec.usedBy(lich).length + rec.windups.length, 0, 'reforming took his whole turn (no attack, no wind-up)');
    rec.clear();
    DD.Combat.giveTurnTo(lich);
    t.ok(rec.windups.length === 1, 'he acts again on the turn after');
    rec.off();
    // shred both remaining phylacteries while he is a pile of bones: the last one finishes him
    lich.hp = 3;
    DD.Act.damage(knight, lich, 10);
    t.ok(has(lich, 'lich_bonepile'), 'collapsed again');
    const rest = L().phylacteryTiles();
    t.eq(rest.length, 2, '2 left');
    rest[0].obj.data.revealed = true; rest[1].obj.data.revealed = true;
    t.eq(DD.getObject('lich_shelf').autoplay(knight, rest[0].obj), 30, 'shredding while he is bones is still worth it');
    interactAt(knight, rest[0].x, rest[0].y);
    t.ok(!lich.dead && has(lich, 'lich_bonepile'), 'one shredded: still a pile of bones, one renewal fewer');
    t.eq(DD.getObject('lich_shelf').autoplay(knight, rest[1].obj), 140, 'the last page is the best move in the game');
    interactAt(knight, rest[1].x, rest[1].y);
    t.ok(lich.dead, 'the last phylactery shredded: he is dust');
    t.eq(DD.Combat.state.result, 'victory', 'victory');
    // Mortal Again: the last phylactery shredded while he stands: no more reforming (N.mortal, a declared damage-taken
    // bonus, is a balance knob: 0 now)
    f = lichFight(17);
    lich = f.lich;
    killAll('lich_intern');
    const ph3 = L().phylacteryTiles();
    ph3.forEach(function (q) { q.obj.data.revealed = true; });
    interactAt(hero('test_rogue'), ph3[0].x, ph3[0].y);
    interactAt(hero('test_knight'), ph3[1].x, ph3[1].y);
    t.ok(!has(lich, 'lich_mortal'), 'not mortal while a phylactery is left');
    interactAt(hero('test_mage'), ph3[2].x, ph3[2].y);
    t.ok(has(lich, 'lich_mortal'), 'the last one shredded: Mortal Again');
    t.ok(/left 0\. He is Mortal Again/.test(DD.Combat.state.objective.flavor), 'the subtitle says so: ' + DD.Combat.state.objective.flavor);
    t.ok(/can no longer reform/.test(DD.getStatus('lich_mortal').desc()), 'its desc states the rule');
    t.eq(DD.getStatus('lich_mortal').takenMult(), 1 + N.mortal, 'declared as takenMult (' + (1 + N.mortal) + ')');
    t.ok(N.mortal > 0 === /more damage/.test(DD.getStatus('lich_mortal').desc()), 'the desc mentions a damage bonus only when there is one');
    lich.block = 0;
    const m0 = lich.hp;
    DD.Act.damage(null, lich, 10, { ignoreArmor: true });
    t.eq(m0 - lich.hp, Math.round(10 * (1 + N.mortal)), 'a 10-damage hit deals ' + Math.round(10 * (1 + N.mortal)));
    lich.hp = 2;
    DD.Act.damage(null, lich, 10, { ignoreArmor: true });
    t.ok(lich.dead, 'mortal: 0 HP is the end');
    t.eq(DD.Combat.state.result, 'victory', 'victory');
    // previews of a hero hit on him are exact (the takenMult knob included)
    f = lichFight(20);
    lich = f.lich;
    DD.Act.addStatus(lich, 'lich_mortal', { turns: -1, silent: true }, null);
    const kn = hero('test_knight');
    DD.Combat.giveTurnTo(kn);
    const spot2 = nextTo(lich.x, lich.y);
    if (spot2) {
      put(kn, spot2.x, spot2.y);
      const pv = DD.Combat.preview(kn, kn.basic, lich.x, lich.y);
      const h1 = lich.hp;
      DD.Combat.useSkill(kn, kn.basic, lich.x, lich.y);
      t.eq(pv.perUnit[lich.id] && pv.perUnit[lich.id].dmg, h1 - lich.hp, 'hero previews on a mortal lich are exact');
    }
    // a reforming that burns the LAST phylactery leaves him mortal too
    f = lichFight(18);
    lich = f.lich;
    const keep = L().phylacteryTiles()[0];
    L().shelves().forEach(function (q) { if (q !== keep && q.obj.data.role === 'phylactery') q.obj.data.role = 'empty'; });
    lich.hp = 2;
    DD.Act.damage(hero('test_knight'), lich, 9);
    t.ok(L().isBones(lich), 'collapsed with one phylactery left');
    DD.AI.act(lich);
    t.ok(!L().isBones(lich) && L().phylacteryTiles().length === 0, 'reformed by burning the last one');
    t.ok(has(lich, 'lich_mortal'), 'and he is Mortal Again');
    // a dispelled Pile of Bones can't strand him invulnerable: he still reforms on his turn
    f = lichFight(19);
    lich = f.lich;
    lich.hp = 2;
    DD.Act.damage(hero('test_knight'), lich, 9);
    DD.Act.removeStatus(lich, 'lich_bonepile', { silent: true });
    t.ok(L().isBones(lich), 'still a pile of bones by his own records');
    DD.AI.act(lich);
    t.ok(!has(lich, 'invulnerable') && lich.hp > 1, 'reformed and vulnerable again');
    // no phylacteries left: he simply dies
    f = lichFight(10);
    lich = f.lich;
    L().shelves().forEach(function (q) { if (q.obj.data.role === 'phylactery') q.obj.data.role = 'empty'; });
    lich.hp = 4;
    DD.Act.damage(hero('test_knight'), lich, 10);
    t.ok(lich.dead, 'without phylacteries he dies at 0 HP');
    // an instant kill still collapses him while phylacteries remain — and none of a death happens first
    f = lichFight(11);
    lich = f.lich;
    const st0 = DD.Combat.state;
    const gold0 = st0.stats.gold || 0, hype0 = st0.hype, logAt2 = st0.log.length;
    let kills = 0;
    DD.Act.addRule({ id: 'test_lich_kill_watch', name: 'test', hooks: { onKill: function (d) { if (d.target === lich) kills++; } } });
    DD.Act.kill(lich, hero('test_rogue'), { force: true });
    DD.Act.removeRule('test_lich_kill_watch');
    t.ok(!lich.dead && has(lich, 'lich_bonepile'), 'Act.kill on a renewable lich: a pile of bones instead');
    t.eq(DD.Combat.state.result, null, 'no premature victory');
    t.eq(st0.stats.gold || 0, gold0, 'no gold tallied for a death that did not happen');
    t.eq(st0.hype, hype0, 'no kill Hype');
    t.eq(kills, 0, 'no onKill');
    t.ok(!st0.log.slice(logAt2).some(function (l) { return /is defeated/.test(l.text); }), 'no "is defeated!" line in the log');
  });

  T.suite('bosses_act2: lich minion caps and control resistance', function (t) {
    const f = lichFight(12);
    const lich = f.lich, N = L().N;
    t.eq(L().spawnInterns(lich, 10), 1, 'tops up to the cap only (2 alive + 1)');
    t.eq(units('lich_intern').length, N.internCap, 'never more than ' + N.internCap + ' interns');
    t.eq(L().spawnInterns(lich, 2), 0, 'at the cap: none');
    t.ok(units('lich_intern').every(function (u) { return DD.Grid.isWalkable(u.x, u.y, u); }), 'interns stand on walkable tiles');
    // over a long real fight (initiative rolled, everybody acting, the heroes passing) the cap holds
    const s = realFight('boss_lichtenstein', 12);
    DD.Combat.rollInitiative();
    let maxInterns = 0;
    for (let r = 0; r < 12 && !s.result; r++) {
      maxInterns = Math.max(maxInterns, units('lich_intern').length);
      DD.Combat.endRound();
    }
    t.ok(maxInterns <= N.internCap, 'cap holds over 12 passive rounds (max ' + maxInterns + ')');
    // control: a stun buys him Speed-Reading; undead never sleep
    const g = lichFight(13);
    const l2 = g.lich;
    t.ok(DD.Act.addStatus(l2, 'stun', { turns: 1 }, hero('test_knight')), 'the first stun lands');
    t.ok(has(l2, 'lich_focus'), 'Speed-Reading');
    t.ok(/can't be Stunned, Frozen or Charmed/.test(DD.getStatus('lich_focus').desc(DD.Act.getStatus(l2, 'lich_focus'))), 'its desc says what it blocks');
    DD.Act.removeStatus(l2, 'stun', { silent: true });
    t.eq(DD.Act.addStatus(l2, 'stun', { turns: 1 }, hero('test_knight')), null, 'a second stun is shrugged off');
    t.eq(DD.Act.addStatus(l2, 'frozen', { turns: 1 }, hero('test_knight')), null, 'so is freezing');
    t.eq(DD.Act.addStatus(l2, 'charmed', { turns: 1 }, hero('test_knight')), null, 'and charm');
    t.eq(DD.Act.addStatus(l2, 'sleep', { turns: 2 }, hero('test_knight')), null, 'undead never sleep');
    // the puzzle's stun respects Speed-Reading, its damage and waiver don't
    const ph = L().phylacteryTiles()[0];
    ph.obj.data.revealed = true;
    L().addFees(l2, 3);
    const hp0 = l2.hp;
    interactAt(hero('test_rogue'), ph.x, ph.y);
    t.ok(!has(l2, 'stun'), 'a phylactery shredded while he is Speed-Reading does not stun him');
    t.eq(hp0 - l2.hp, N.phylactery, 'but still deals ' + N.phylactery);
    t.eq(L().fees(l2), 0, 'and still waives the Late Fees');
    t.ok(/not while he is Speed-Reading/.test(DD.getObject('lich_shelf').desc), 'the shelf desc says so');
    // charmed (no Speed-Reading yet): on his turn he fights for the heroes — his notice goes to his own staff
    const c = lichFight(14, { ai: true });
    const l3 = c.lich;
    const intern = units('lich_intern')[0];
    put(l3, 7, 2);
    put(intern, 7, 4);
    t.ok(DD.Act.addStatus(l3, 'charmed', { turns: 1 }, hero('test_knight')), 'charmed');
    const rec = recorder();
    DD.Combat.giveTurnTo(l3);
    t.ok(rec.hits.some(function (h) { return h.src === l3 && h.target.side === 'enemy'; }) || rec.windups.length > 0, 'a charmed librarian turns on his own staff');
    t.ok(!rec.hits.some(function (h) { return h.src === l3 && h.target.side === 'hero' && h.cause === 'skill'; }), 'and leaves the heroes alone that turn');
    rec.off();
  });

  T.suite('bosses_act2: lich previews and wind-up honesty', function (t) {
    const f = lichFight(15);
    const lich = f.lich;
    const rogue = hero('test_rogue');
    DD.Combat.giveTurnTo(rogue);
    const spot = nextTo(lich.x, lich.y);
    put(rogue, spot.x, spot.y);
    const slot = rogue.basic;
    const prev = DD.Combat.preview(rogue, slot, lich.x, lich.y);
    const hp = lich.hp;
    t.ok(prev && prev.perUnit[lich.id], 'a hero attack on the lich previews');
    DD.Combat.useSkill(rogue, slot, lich.x, lich.y);
    t.eq(prev.perUnit[lich.id].dmg, hp - lich.hp, 'preview == reality (' + (hp - lich.hp) + ')');
    // lethal with phylacteries left: the preview shows the collapse to 1 HP, not a kill
    lich.hp = 3;
    DD.Combat.giveTurnTo(rogue);
    const p2 = DD.Combat.preview(rogue, slot, lich.x, lich.y);
    t.ok(p2.perUnit[lich.id] && !p2.perUnit[lich.id].lethal && p2.perUnit[lich.id].dmg === 2, 'preview: 3 → 1 HP, not lethal');
    DD.Combat.useSkill(rogue, slot, lich.x, lich.y);
    t.ok(!lich.dead && lich.hp === 1, 'reality agrees');
    // AoE previews over the shelves don't throw
    const mage = hero('test_mage');
    DD.Combat.giveTurnTo(mage);
    const sh = L().shelves()[0];
    put(mage, sh.x, sh.y + 3 <= f.s.grid.h - 1 ? sh.y + 3 : sh.y - 3);
    const fb = mage.skills.filter(function (q) { return q.id === 'test_fireball'; })[0];
    const tps = DD.Combat.targets(mage, fb);
    t.ok(t.tryRun('fireball previews', function () { tps.slice(0, 6).forEach(function (p) { DD.Combat.preview(mage, fb, p.x, p.y); }); return true; }), 'fireball previews near the shelves');
    // the NUMBERS on his wind-ups are what lands: heroes standing in every one of them, fees growing at his turn end,
    // added and waived between turns, a hero Weakening him for 1 or 2 turns, both phases
    const g = lichFight(21, { ai: true });
    const lich2 = g.lich;
    killAll('lich_intern');
    const nums = scriptedHonesty(lich2, 14, function (k) {
      killAll('lich_intern');
      killAll('lich_mimic');
      if (k === 6) lich2.hp = Math.floor(lich2.maxHp * 0.45);
      if (k % 3 === 1) DD.Act.addStatus(lich2, 'weak', { turns: 1 + (k % 2) }, hero('test_mage'));
      if (k % 4 === 2) L().addFees(lich2, 3);
      if (k % 5 === 4) L().waiveFees(lich2);
    });
    t.ok(nums.checked >= 12, 'checked ' + nums.checked + ' wind-up hits (' + nums.windups + ' wind-ups)');
    t.eq(nums.bad.length, 0, 'every wind-up hit deals the number it showed' + (nums.bad.length ? ': ' + nums.bad.slice(0, 3).join('; ') : ''));
    t.eq(L().data(lich2).phase, 2, 'both phases covered');
    // and over AutoPlay fights (heroes acting on their own, Weak now and then)
    const auto = watchNumbers(function () {
      for (let k = 0; k < 2; k++) {
        realFight('boss_lichtenstein', 40 + k);
        weakenedAutoplay(L().findLich(), 40);
      }
    });
    t.log('AutoPlay fights: ' + auto.checked + ' wind-up hits checked');
    t.eq(auto.bad.length, 0, 'AutoPlay fights: every wind-up hit deals the number it showed' + (auto.bad.length ? ': ' + auto.bad.slice(0, 3).join('; ') : ''));
    // areas: every hit of his (and his minions') lands inside the area it showed / declares
    const W = T.contentHelpers && T.contentHelpers.watchAreas;
    if (!W) { t.log('content helpers not loaded: area check skipped'); return; }
    const w = W(function (w) {
      realFight('boss_lichtenstein', 16);
      w.arm();
      DD.AutoPlay.runBattle(14);
    });
    t.ok(w.actions > 10 && w.windups > 2, 'watched ' + w.actions + ' actions, ' + w.windups + ' wind-ups');
    t.eq(w.violations.length, 0, 'areas honest' + (w.violations.length ? ': ' + w.violations[0] : ''));
  });

  T.suite('bosses_act2: lich autoplay sims', function (t) {
    const n = +(t.param('n', 12)) || 12;
    const level = +(t.param('level', BAND)) || BAND;
    const r = sims(t, 'boss_lichtenstein', n, level, lichStats);
    t.eq(r.timeouts, 0, 'no timeouts');
    if (t.param('nopuzzle', '0') === '1') { t.log('puzzle ignored: ' + Math.round(r.rate * 100) + '% wins, ' + (r.agg.spent / r.n).toFixed(1) + ' renewals a fight'); return; }
    t.ok(r.per.filter(function (st) { return st.lookups >= 1 && st.shredded >= 1; }).length >= Math.ceil(r.n * 0.75), 'AutoPlay uses the Card Catalog and shreds phylacteries in most fights');
    t.ok(r.agg.shredded >= r.n * 1.5, 'on average 1.5+ phylacteries shredded per fight (' + (r.agg.shredded / r.n).toFixed(1) + ')');
    checkBand(t, r, level, 'lichtenstein');
  });

  // =================================================================================================================
  // Dr. Iris
  // =================================================================================================================
  function irisFight(seed, opts) {
    const s = fight('boss_dr_iris', seed || 3, opts);
    return { s: s, iris: I().findIris() };
  }
  function mirrorAt(x, y) { const q = tile(x, y); return q && q.obj && q.obj.id === 'mirror' ? q.obj : null; }
  const DIR = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
  /** 9×9 sandbox: Dr. Iris at (4,4), heroes parked on the bottom row, optional objects (mirrors get the puzzle callbacks). */
  function irisSandbox(objects, opts) {
    DD.Combat.sandbox({
      w: 9, h: 9, seed: 7, floor: 'marble', enemyAi: opts && opts.ai ? undefined : false,
      objective: { type: 'custom', text: 'Test' }, encounter: { id: 'ba2_iris_box', checkObjective: function () { return null; } },
      heroes: PARTY.map(function (id, i) { return { id: id, x: i, y: 8, level: BAND }; }),
      enemies: [{ id: 'dr_iris', x: 4, y: 4 }], objects: objects || [],
    });
    return I().findIris();
  }
  /** Charge one ray now (on a hero's turn: it lands at her next turn start). */
  function chargeRay(iris, n) { return DD.AI.windUp(iris, 'iris_eye_beam', { x: iris.x + DIR[n].x, y: iris.y + DIR[n].y }, { anchor: 'self', dir: DIR[n], label: 'Optic Ray (' + n + ')' }); }

  T.suite('bosses_act2: iris arena, registry and mirror setup', function (t) {
    const def = DD.getEnemy('dr_iris');
    t.ok(def && def.tier === 'boss' && def.act === 2 && def.boss && def.boss.title, 'dr_iris is an act 2 boss with a title');
    t.ok(def.hp >= 200 && def.hp <= 320, 'HP ' + def.hp);
    t.ok(def.flags.immovable && def.flags.flying && !def.turnsPerRound, 'she floats, anchored to her chair, one turn a round');
    t.eq(def.skills.join(), 'iris_antimagic,iris_next_patient', 'her skill list is what she does at once');
    I().WINDUPS.forEach(function (id) {
      const sk = DD.getSkill(id);
      t.ok(sk && def.skills.indexOf(id) < 0 && def.desc.indexOf(sk.name) >= 0, id + ': a wind-up (registered, named in her codex entry, not in her skill list)');
    });
    t.ok(def.passive && /Clinical Gaze/.test(def.passive.name) && typeof def.passive.desc === 'function', 'her gaze is an inspect-panel passive');
    t.ok(def.hooks.threatAt && def.hooks.onTurnEnd, 'gaze hooks (end of turn + threatAt for AutoPlay / the HUD)');
    const enc = DD.getEncounter('boss_dr_iris');
    t.ok(enc && enc.kind === 'boss' && enc.act === 2 && enc.objective.type === 'boss', 'boss encounter');
    const f = irisFight(3);
    t.ok(f.iris && f.iris.x === 6 && f.iris.y === 5, 'on her exam chair mid-room');
    t.eq(units('iris_floater').length, 1, 'one floater to start');
    const mirrors = f.s.grid.tiles.filter(function (q) { return q.obj && q.obj.id === 'mirror'; });
    t.eq(mirrors.length, 6, '6 Exam Mirrors');
    t.ok(mirrors.every(function (q) { return /^Exam Mirror \(2 quarter turns a round\)$/.test(q.obj.label) && typeof q.obj.autoplay === 'function' && typeof q.obj.onInteract === 'function' && typeof q.obj.available === 'function'; }), 'every mirror carries the puzzle callbacks, and its label states the turn budget');
    t.ok(['N', 'E', 'S', 'W'].every(function (n) { return !I().traceBeam(f.iris, DIR[n]).self; }), 'no line bounces back at the start');
    const order = ['N', 'E', 'S', 'W'];
    mirrors.filter(function (q) { return q.x === f.iris.x || q.y === f.iris.y; }).forEach(function (q) {
      const home = q.x === f.iris.x ? (q.y < f.iris.y ? 'S' : 'N') : (q.x < f.iris.x ? 'E' : 'W');
      const k = (order.indexOf(home) - order.indexOf(q.obj.data.facing) + 4) % 4;
      t.ok(k === 1 || k === 2, 'mirror ' + q.x + ',' + q.y + ' is ' + k + ' turn(s) from lining up');
    });
    const sig = {};
    for (let k = 1; k <= 6; k++) { const g = irisFight(k); sig[g.s.grid.tiles.filter(function (q) { return q.obj && q.obj.id === 'mirror'; }).map(function (q) { return q.obj.data.facing; }).join('')] = 1; }
    t.ok(Object.keys(sig).length > 1, 'starting angles vary between fights');
    t.ok(DD.getObject('iris_chart') && DD.getObject('iris_chair'), 'clinic decor registered');
    t.ok(/Rotate an Exam Mirror/.test(f.s.objective.flavor) && /Pillars and mirrors block her gaze/.test(f.s.objective.flavor), 'objective subtitle: ' + f.s.objective.flavor);
  });

  T.suite('bosses_act2: iris beam tracing through mirrors and pillars', function (t) {
    const iris = irisSandbox([
      { x: 4, y: 1, id: 'mirror', data: { facing: 'S' } },
      { x: 7, y: 4, id: 'pillar' },
      { x: 4, y: 7, id: 'mirror', data: { facing: 'E' } },
      { x: 1, y: 4, id: 'mirror', data: { facing: 'E' } }, { x: 0, y: 4, id: 'mirror', data: { facing: 'E' } },
    ]);
    const tr = I().traceRay;
    let r = tr(iris, DIR.N);
    t.ok(r.self, 'north: the mirror facing south sends the ray straight back into her');
    t.eq(r.tiles.map(key).join(' '), '4,3 4,2 4,1 4,2 4,3 4,4', 'path out and back');
    r = tr(iris, DIR.E);
    t.eq(r.tiles.map(key).join(' '), '5,4 6,4', 'east: stopped by the pillar');
    r = tr(iris, DIR.S);
    t.eq(r.tiles.map(key).join(' '), '4,5 4,6 4,7 5,7 6,7 7,7 8,7', 'south: bent east by the mirror, out to the edge');
    t.ok(!r.self && r.mirrors.join() === '4,7', 'one bounce');
    r = tr(iris, DIR.W);
    t.ok(r.self, 'west: the mirror at 1,4 faces east, back into her');
    const b = I().traceBeam(iris, DIR.S);
    const ks = b.tiles.map(key);
    t.ok(ks.indexOf('3,5') >= 0 && ks.indexOf('5,5') >= 0, 'side rays start diagonally in front');
    t.ok(ks.indexOf('3,4') < 0 && ks.indexOf('5,4') < 0, 'the tiles beside her are safe');
    t.ok(ks.indexOf('3,8') >= 0 && ks.indexOf('5,8') >= 0, 'side rays run to the edge');
    t.ok(ks.indexOf('4,8') < 0, 'behind the south mirror is safe');
    irisSandbox([{ x: 4, y: 2, id: 'mirror', data: { facing: 'E' } }, { x: 6, y: 2, id: 'mirror', data: { facing: 'W' } }]);
    const loop = tr(I().findIris(), DIR.N);
    t.ok(loop.tiles.length < 40 && !loop.self, 'a mirror ping-pong terminates (' + loop.tiles.length + ' tiles)');
  });

  T.suite('bosses_act2: iris charged rays land at her next turn: damage, reflection, shatter and flinch', function (t) {
    let iris = irisSandbox([{ x: 4, y: 1, id: 'mirror', data: { facing: 'E' } }]);
    I().setupClinic(DD.Combat.state);
    const N = I().N;
    const mo = mirrorAt(4, 1);
    I().setFacing(mo, 'E');
    const mage = hero('test_mage'), rogue = hero('test_rogue'), knight = hero('test_knight');
    put(mage, 4, 6); put(rogue, 5, 6);
    const bdesc = DD.skillDesc(DD.getSkill('iris_eye_beam'), 1, null);
    t.ok(new RegExp('\\b' + N.beam + '\\b').test(bdesc) && new RegExp('\\b' + N.reflect + '\\b').test(bdesc) && /shatters/.test(bdesc), 'ray desc shows ' + N.beam + ', ' + N.reflect + ' and the shatter');
    // charged on a hero's turn: nothing happens until her next turn starts
    const rec = recorder();
    const south = chargeRay(iris, 'S');
    t.ok(south && south.windup && south.turnsLeft === 1, 'a charged ray is a wind-up');
    t.ok(DD.AI.intentTiles(iris, south).some(function (p) { return p.x === 4 && p.y === 6; }), 'its marked line covers the mage');
    t.eq(rec.dmgTo(mage, 'iris_eye_beam'), 0, 'nothing yet');
    DD.Combat.giveTurnTo(iris);   // AI off: her turn starts, the ray lands (her gaze comes at the end of it)
    t.eq(rec.dmgTo(mage, 'iris_eye_beam'), N.beam, 'it lands for ' + N.beam + ' (central ray)');
    t.eq(rec.dmgTo(rogue, 'iris_eye_beam'), N.beam, 'and ' + N.beam + ' on the side ray');
    // reflection: a hero turns the north mirror after she charged → her own ray hits HER, the mirror shatters, her other
    // rays fizzle
    DD.Combat.giveTurnTo(knight);
    const north = chargeRay(iris, 'N');
    const east = chargeRay(iris, 'E');
    t.ok(!I().traceBeam(iris, DIR.N).self, 'not lined up yet (mirror faces east)');
    t.ok(I().mirrorHint(rogue, mo) >= 20, 'AutoPlay sees the chance (' + I().mirrorHint(rogue, mo) + ')');
    t.ok(interactAt(rogue, 4, 1), 'the rogue turns the mirror');
    t.eq(mo.data.facing, 'S', 'now facing south: straight back at her');
    t.ok(I().traceBeam(iris, DIR.N).self && DD.AI.intentTiles(iris, north).some(function (p) { return p.x === iris.x && p.y === iris.y; }), 'the charged ray\'s marked line now runs back into her (live)');
    const ihp = iris.hp, rdmg = (DD.Combat.state.stats.units[rogue.id] || { dmg: 0 }).dmg;
    put(knight, 7, 4);   // on the east ray's line
    rec.clear();
    DD.Combat.giveTurnTo(iris);
    t.eq(ihp - iris.hp, N.reflect, 'REFLECTED: she takes ' + N.reflect);
    t.eq(I().fight().reflections, 1, 'reflection counted');
    t.eq(DD.Combat.state.stats.units[rogue.id].dmg - rdmg, N.reflect, 'credit goes to whoever angled the mirror');
    t.ok(!tile(4, 1).obj && I().fight().shattered === 1, 'the mirror shattered (each mirror reflects once)');
    t.ok(!iris.intents.some(function (i) { return i === east; }), 'she flinched: her east ray fizzled');
    t.eq(rec.dmgTo(knight, 'iris_eye_beam'), 0, 'so the knight on the east line is fine');
    t.eq(I().fight().flinches, 1, 'flinch counted');
    t.ok(!has(iris, 'stun'), 'no stun from a reflection (no lockout)');
    t.ok(!I().traceBeam(iris, DIR.N).self && I().traceBeam(iris, DIR.N).tiles.some(function (p) { return p.x === 4 && p.y === 0; }), 'the north line now runs on to the edge');
    // a line that already bounces back is never charged
    const iris2 = irisSandbox([{ x: 4, y: 1, id: 'mirror', data: { facing: 'S' } }]);
    I().setupClinic(DD.Combat.state);
    I().setFacing(mirrorAt(4, 1), 'S');
    const d = I().data(iris2);
    d.rot = 0; d.phase = 1;
    t.eq(I().beamDirs(d, iris2).join(), 'E,S', 'she skips the line that already bounces back (N) for the next ones clockwise');
    d.phase = 2;
    t.eq(I().beamDirs(d, iris2).join(), 'E,S,W', 'phase 2: three lines');
    // a ray crossing a floater hurts it too
    iris = irisSandbox([]);
    const fl = DD.Act.spawn('iris_floater', 4, 6, { noFx: true, silent: true });
    const a = fl.hp;
    chargeRay(iris, 'S');
    DD.Combat.giveTurnTo(iris);
    t.eq(a - fl.hp, Math.min(a, N.beam), 'floaters in the line get hit too');
    // a stun interrupts every charged wind-up
    iris = irisSandbox([]);
    chargeRay(iris, 'S'); chargeRay(iris, 'E');
    DD.AI.windUp(iris, 'iris_eye_exam', { x: 2, y: 2 }, { tiles: I().examTiles(2, 2, 0, 5) });
    t.eq(iris.intents.length, 3, 'three wind-ups charged');
    rec.clear();
    t.ok(DD.Act.addStatus(iris, 'stun', { turns: 1 }, hero('test_knight')), 'stunned');
    t.eq(iris.intents.length, 0, 'all interrupted at once');
    t.eq(rec.cancels.length, 1, 'windup:cancel');
    t.ok(has(iris, 'iris_squint'), 'and she squints');
    rec.off();
  });

  T.suite('bosses_act2: iris rays follow the mirrors (live, honest)', function (t) {
    const f = irisFight(21);
    const iris = f.iris;
    killAll('iris_floater');
    const knight = hero('test_knight'), mage = hero('test_mage');
    parkHeroes([knight, mage]);
    const south = mirrorAt(6, 8);
    I().setFacing(south, 'E');
    DD.Combat.giveTurnTo(knight);
    const it = chargeRay(iris, 'S');
    const before = DD.AI.intentTiles(iris, it).map(key);
    t.ok(before.indexOf('8,8') >= 0 && before.indexOf('6,9') < 0, 'mirror facing east: the marked line bends east along row 8');
    put(mage, 8, 8);
    put(knight, 6, 9);
    t.ok(DD.Combat.interact(knight, 6, 8), 'the knight turns the mirror from the tile below it');
    t.eq(south.data.facing, 'S', 'now facing south');
    const after = DD.AI.intentTiles(iris, it).map(key);
    t.ok(after.indexOf('6,9') >= 0 && after.indexOf('8,8') < 0, 'the marked line follows the mirror at once');
    t.ok(/1 more quarter turn this round/.test(south.label), 'label after one turn: ' + south.label);
    t.ok(DD.Combat.interact(knight, 6, 8), 'second turn this round');
    t.ok(!DD.Combat.interactions(knight).some(function (x) { return x.x === 6 && x.y === 8; }), 'a third is refused');
    t.ok(/creaky/.test(south.label), 'label: creaky');
    t.eq(I().mirrorHint(knight, south), 0, 'and AutoPlay knows it');
    t.eq(I().fight().rotations, 2, 'rotations counted');
    t.ok(DD.Combat.interact(knight, 6, 8) === false, 'no turn left');
    I().setFacing(south, 'S');   // back to the south line: down column 6
    knight.block = 0; mage.block = 0;
    const rec = recorder();
    DD.Combat.giveTurnTo(iris);   // AI off: the ray lands
    t.eq(rec.dmgTo(mage, 'iris_eye_beam'), 0, 'the old path is safe');
    t.eq(rec.dmgTo(knight, 'iris_eye_beam'), I().N.beam - (knight.armor || 0), 'the new path is hit (minus armor)');
    rec.off();
    south.onRoundEnd(south);
    t.ok(/2 quarter turns a round/.test(south.label), 'the label resets at the end of the round');
  });

  T.suite('bosses_act2: iris eye exam, anti-magic cone and disintegrate', function (t) {
    const g = [0, 1, 2, 3].map(function (r) { return I().eGlyph(5, r).map(function (p) { return p.dx + ',' + p.dy; }).sort().join(' '); });
    t.ok(g.every(function (x) { return x.split(' ').length === 17; }), 'every E has 17 cells');
    t.eq(new Set(g).size, 4, '4 distinct orientations');
    const e0 = I().eGlyph(5, 0).map(function (p) { return p.dx + ',' + p.dy; });
    t.ok(['1,1', '2,1', '3,1', '4,1', '1,3', '2,3', '3,3', '4,3'].every(function (k) { return e0.indexOf(k) < 0; }), 'the two gaps of the E are safe');
    const iris = irisSandbox([{ x: 6, y: 2, id: 'pillar' }]);
    const N = I().N;
    const mage = hero('test_mage'), rogue = hero('test_rogue'), cleric = hero('test_cleric');
    const tiles = I().examTiles(2, 2, 0, 5);
    t.ok(tiles.length === 17 && tiles.every(function (p) { return DD.Grid.inBounds(p.x, p.y); }), 'exam tiles inside the grid');
    put(mage, 0, 0); put(rogue, 1, 1);   // (0,0) spine, (1,1) a gap
    const ex = DD.AI.windUp(iris, 'iris_eye_exam', { x: 2, y: 2 }, { tiles: tiles, label: 'Eye Exam' });
    t.ok(ex && ex.windup, 'Eye Exam is a wind-up');
    const rec = recorder();
    DD.Combat.giveTurnTo(iris);   // AI off: it lands (her gaze at the end of the turn is a status hit, not counted here)
    t.eq(rec.dmgTo(mage, 'iris_eye_exam'), N.exam, 'Eye Exam lands for ' + N.exam + ' on the E');
    t.eq(rec.dmgTo(rogue, 'iris_eye_exam'), 0, 'the gap is safe');
    // anti-magic cone (at once): 9 + Silenced
    fullHp([mage, rogue, cleric]);
    put(mage, 4, 6); put(rogue, 0, 6);
    const a = mage.hp, b = rogue.hp;
    now(iris, 'iris_antimagic', { x: 4, y: 5 }, { anchor: 'self', dir: DIR.S });
    t.eq(a - mage.hp, N.cone, 'Anti-Magic Cone deals ' + N.cone);
    t.ok(has(mage, 'silenced'), 'and Silences');
    t.eq(rogue.hp, b, 'outside the cone: nothing');
    // Disintegrate: charges for 2 of her turns, then 26; breaking line of sight saves you
    DD.Combat.giveTurnTo(cleric);
    put(cleric, 4, 1);
    const it = DD.AI.windUp(iris, 'iris_disintegrate', cleric, { track: true, turns: 2, label: 'Disintegrate' });
    t.ok(it && it.turnsLeft === 2 && it.anchor === 'unit', 'tracking wind-up, 2 turns');
    rec.clear();
    DD.Combat.giveTurnTo(iris);
    t.eq(rec.dmgTo(cleric, 'iris_disintegrate'), 0, 'still charging after one of her turns');
    t.eq(it.turnsLeft, 1, 'one more turn');
    fullHp([cleric]);
    DD.Combat.giveTurnTo(iris);
    t.eq(rec.dmgTo(cleric, 'iris_disintegrate'), N.disintegrate, 'then Disintegrate deals ' + N.disintegrate);
    fullHp([cleric]);
    cleric.downed = false;
    put(cleric, 7, 4);
    t.ok(DD.Grid.los(iris, cleric), 'targeted in the open');
    DD.Combat.giveTurnTo(cleric);
    const it2 = DD.AI.windUp(iris, 'iris_disintegrate', cleric, { track: true, turns: 1, label: 'Disintegrate' });
    put(cleric, 8, 0);
    t.ok(cleric.x === 8 && cleric.y === 0 && !DD.Grid.los(iris, cleric), 'then hides behind the pillar at (6,2)');
    rec.clear();
    DD.Combat.giveTurnTo(iris);
    t.ok(!iris.intents.some(function (i) { return i === it2; }), 'resolved');
    t.eq(rec.dmgTo(cleric, 'iris_disintegrate'), 0, 'behind the pillar: Disintegrate fizzles');
    rec.off();
  });

  T.suite('bosses_act2: iris rotation and phase 2', function (t) {
    const f = irisFight(23, { ai: true });
    const iris = f.iris;
    const d = I().data(iris);
    const hs = DD.Combat.heroes();
    const rec = recorder();
    const place = function () {
      killAll('iris_floater');
      put(hs[0], 5, 7); put(hs[1], 6, 7); put(hs[2], 7, 7); put(hs[3], 6, 9);
      hs.forEach(function (h) { h.hp = h.maxHp; h.downed = false; });
      DD.Combat.slotsOf(iris).forEach(function (sl) { sl.cd = 0; sl.fresh = false; });
    };
    const turn = function () {
      place();
      rec.clear();
      DD.Combat.giveTurnTo(iris);
      return {
        rays: rec.windups.filter(function (w) { return w.skill === 'iris_eye_beam'; }).map(function (w) { return w.intent.label.slice(-2, -1); }).join(''),
        windups: rec.windups.filter(function (w) { return w.skill !== 'iris_eye_beam'; }).map(function (w) { return w.skill.replace('iris_', ''); }),
        now: rec.usedBy(iris).filter(function (id) { return !/eye_beam|eye_exam|disintegrate/.test(id); }).map(function (id) { return id.replace('iris_', ''); }),
      };
    };
    d.rot = 0; d.turn = 0;
    const seq = [turn(), turn(), turn(), turn()];
    t.log(JSON.stringify(seq));
    t.eq(seq.map(function (x) { return x.rays; }).join(' '), 'NE ES SW WN', 'the lighthouse turns clockwise, two lines a turn, every turn');
    t.eq(seq[0].windups.join(), 'eye_exam', 'step 1: Eye Exam (wind-up)');
    t.ok(seq[1].windups.length === 0 && seq[1].now.indexOf('antimagic') >= 0, 'step 2: Anti-Magic Cone (at once)');
    t.ok(seq[2].windups.join() === 'disintegrate' && seq[2].now.indexOf('next_patient') >= 0, 'step 3: Disintegrate (wind-up) + floaters (at once)');
    t.eq(seq[3].windups.join(), 'eye_exam', 'the rotation repeats');
    t.ok(rec.windups.length && rec.windups[rec.windups.length - 1].skill === 'iris_eye_beam', 'rays are charged last (a reflection only cancels rays)');
    // phase 2
    place();
    iris.hp = Math.floor(iris.maxHp * 0.5);
    const p2 = turn();
    t.eq(d.phase, 2, 'SECOND OPINION');
    t.eq(p2.rays.length, 3, 'three lines a turn');
    hs.forEach(function (h, i) { put(h, [1, 2, 11, 12][i], [10, 10, 2, 3][i]); });
    d.turn = 0;
    DD.AI.clearIntents(iris, false);
    rec.clear();
    DD.Combat.giveTurnTo(iris);
    const exams = rec.windups.filter(function (w) { return w.skill === 'iris_eye_exam'; });
    t.eq(exams.length, 2, 'two Eye Exams for two groups of patients');
    t.ok(exams.every(function (w) { return w.intent.windup && w.intent.turnsLeft === 1; }), 'both wind-ups');
    t.ok(/2 Eye Exams/.test(I().passiveText(iris)) && /3 lines/.test(I().passiveText(iris)), 'the passive line shows the phase 2 rotation');
    rec.off();
  });

  T.suite('bosses_act2: iris clinical gaze', function (t) {
    const f = irisFight(25);
    const iris = f.iris, s = f.s, N = I().N;
    killAll('iris_floater');
    const hk = DD.getEnemy('dr_iris').hooks;
    const knight = hero('test_knight'), mage = hero('test_mage'), rogue = hero('test_rogue'), cleric = hero('test_cleric');
    put(mage, 6, 3);     // in sight, 2 tiles
    put(rogue, 2, 3);    // behind the pillar at (3,3)
    put(knight, 6, 6);   // right next to her
    put(cleric, 6, 9);   // straight behind the south mirror (6,8)
    fullHp([mage, rogue, knight, cleric]);
    t.ok(DD.Grid.los(iris, mage) && !DD.Grid.los(iris, rogue) && !DD.Grid.los(iris, cleric) && DD.Grid.dist(iris, knight) === 1, 'premise: mage in sight, rogue behind a pillar, cleric behind a mirror, knight next to her');
    const desc = function () { return DD.getEnemy('dr_iris').passive.desc(iris); };
    t.ok(new RegExp('every hero she can see takes ' + N.gaze + ' damage, except right next to her').test(desc()), 'passive line: ' + desc());
    t.ok(/Pillars and mirrors block her view/.test(desc()) && new RegExp('From round ' + N.closing).test(desc()), 'and says what blocks it, and when that ends');
    const rec = recorder();
    hk.onTurnEnd(iris);
    const gz = function (u) { return rec.hits.filter(function (h) { return h.target === u && h.cause === 'status'; }).reduce(function (a, h) { return a + h.dealt; }, 0); };
    t.eq(gz(mage), N.gaze, 'a hero in sight takes ' + N.gaze);
    t.eq(gz(rogue), 0, 'behind a pillar: hidden');
    t.eq(gz(cleric), 0, 'behind a mirror: hidden');
    t.eq(gz(knight), 0, 'right next to her: a blur (she is far-sighted)');
    // no range limit: across the room is not far enough
    rec.clear();
    put(mage, 1, 10);
    t.ok(DD.Grid.los(iris, mage) && DD.Grid.dist(iris, mage) >= 9, 'premise: the mage across the room, still in sight');
    hk.onTurnEnd(iris);
    t.eq(gz(mage), N.gaze, 'gazed from across the room');
    // threatAt: exactly where the gaze would land, for AutoPlay and the HUD's aura shading
    t.eq(I().gazeThreat(iris, mage, { x: mage.x, y: mage.y }).dmg, N.gaze, 'threatAt on the mage\'s tile: ' + N.gaze);
    t.eq(I().gazeThreat(iris, mage, { x: rogue.x, y: rogue.y }), 0, 'threatAt behind the pillar: 0');
    t.eq(I().gazeThreat(iris, mage, { x: 6, y: 4 }), 0, 'threatAt next to her: 0');
    t.eq(DD.AutoPlay.auraAt(iris, mage, mage.x, mage.y).dmg, N.gaze, 'AutoPlay reads it');
    // stunned: no stare (she loses her turn) and no threat
    DD.Act.addStatus(iris, 'stun', { turns: 1 }, knight);
    rec.clear();
    hk.onTurnEnd(iris);
    t.eq(gz(mage), 0, 'a stunned Iris does not stare');
    t.eq(I().gazeThreat(iris, mage, { x: mage.x, y: mage.y }), 0, 'and threatens nothing');
    DD.Act.removeStatus(iris, 'stun', { silent: true });
    // phase 2: X-ray (pillars no longer hide you, mirrors still do), a harder stare
    I().data(iris).phase = 2;
    rec.clear();
    hk.onTurnEnd(iris);
    t.eq(gz(mage), N.gaze2, 'phase 2 gaze: ' + N.gaze2);
    t.eq(gz(rogue), N.gaze2, 'X-ray: the pillar no longer hides the rogue');
    t.eq(gz(cleric), 0, 'a mirror still blocks the X-ray gaze');
    t.ok(new RegExp('takes ' + N.gaze2 + ' damage').test(desc()) && /X-ray: only mirrors/.test(desc()), 'the passive shows the live rule: ' + desc());
    // closing time: nothing blocks it, +2 a round
    const r0 = s.round;
    s.round = N.closing + 1;
    rec.clear();
    hk.onTurnEnd(iris);
    t.eq(gz(cleric), N.gaze2 + 4, 'closing time (round ' + s.round + '): through mirrors too, ' + (N.gaze2 + 4));
    t.eq(gz(knight), 0, 'still a blur right next to her');
    t.ok(/Closing time: nothing blocks it/.test(desc()), 'the passive says so');
    s.round = r0;
    // in a real turn the gaze comes at the end of it (and the subtitle follows the phase)
    fullHp([mage, rogue, knight, cleric]);
    I().data(iris).phase = 1;
    rec.clear();
    DD.Combat.giveTurnTo(iris);
    t.eq(gz(mage), N.gaze, 'at the end of her turn (AI off: her turn still ends with the stare)');
    I().data(iris).phase = 2;
    DD.Combat.state.aiOff = false;
    DD.Combat.giveTurnTo(iris);
    t.ok(/X-ray gaze: only a mirror/.test(s.objective.flavor) && !/Pillars/.test(s.objective.flavor), 'the subtitle stops promising pillar cover: ' + s.objective.flavor);
    rec.off();
  });

  T.suite('bosses_act2: iris minion cap and squinting', function (t) {
    const f = irisFight(27);
    const iris = f.iris, N = I().N;
    t.eq(I().spawnFloaters(iris, 10), 2, 'tops up to the cap only');
    t.eq(units('iris_floater').length, N.floaterCap, 'never more than ' + N.floaterCap + ' floaters');
    t.eq(I().spawnFloaters(iris, 2), 0, 'at the cap: none');
    t.ok(units('iris_floater').every(function (u) { return u.flags.flying; }), 'floaters fly');
    const fl = units('iris_floater')[0], mage = hero('test_mage');
    const spot = nextTo(fl.x, fl.y);
    put(mage, spot.x, spot.y);
    const a = mage.hp;
    now(fl, 'iris_floater_blur', mage, { anchor: 'unit' });
    t.eq(a - mage.hp, N.floaterDmg, 'Blurry Vision deals ' + N.floaterDmg);
    t.ok(has(mage, 'dazzled'), 'and Dazzles');
    // squint: one stun, then the lost turn + her next 2 immune
    t.ok(DD.Act.addStatus(iris, 'stun', { turns: 1 }, mage), 'the first stun lands');
    t.ok(has(iris, 'iris_squint') && DD.Act.getStatus(iris, 'iris_squint').turns === N.focus, 'she squints (' + N.focus + ' turns)');
    DD.Act.removeStatus(iris, 'stun', { silent: true });
    t.eq(DD.Act.addStatus(iris, 'stun', { turns: 1 }, mage), null, 'a second stun is shrugged off');
    t.eq(DD.Act.addStatus(iris, 'charmed', { turns: 1 }, mage), null, 'and charm');
    t.eq(DD.Act.addStatus(iris, 'sleep', { turns: 1 }, mage), null, 'doctors never sleep on the job');
    t.ok(/can't be Stunned, Frozen or Charmed/.test(DD.getStatus('iris_squint').desc(DD.Act.getStatus(iris, 'iris_squint'))), 'squint desc');
    const s = realFight('boss_dr_iris', 28);
    DD.Combat.rollInitiative();
    let maxF = 0;
    for (let r = 0; r < 10 && !s.result; r++) { maxF = Math.max(maxF, units('iris_floater').length); DD.Combat.endRound(); }
    t.ok(maxF <= N.floaterCap, 'cap holds over 10 passive rounds (max ' + maxF + ')');
  });

  T.suite('bosses_act2: iris mirror hints read the charged rays (AutoPlay engages)', function (t) {
    const iris = irisSandbox([{ x: 4, y: 1, id: 'mirror', data: { facing: 'E' } }]);
    I().setupClinic(DD.Combat.state);
    const mo = mirrorAt(4, 1);
    I().setFacing(mo, 'E');
    const knight = hero('test_knight');
    t.eq(I().mirrorHint(knight, mo), 0, 'nothing charged: 0');
    chargeRay(iris, 'N');
    const h1 = I().mirrorHint(knight, mo);
    t.ok(h1 >= 20, 'a charged ray one turn from bouncing back: a strong hint (' + h1 + ')');
    DD.Combat.giveTurnTo(knight);
    put(knight, 3, 1);
    t.ok(DD.Combat.interact(knight, 4, 1), 'turned');
    t.ok(I().traceBeam(iris, DIR.N).self, 'lined up');
    t.eq(I().mirrorHint(knight, mo), 0, 'already lined up: hint 0');
    DD.Combat.state.round++;   // a new round: two fresh quarter turns
    I().setFacing(mo, 'N');
    t.ok(I().mirrorHint(knight, mo) > 0, 'two turns away: still worth it (two turns a round)');
    DD.Combat.giveTurnTo(knight);
    DD.Combat.interact(knight, 4, 1);
    t.ok(I().mirrorHint(knight, mo) > 0, 'one turn left this round, one turn away: still worth it');
    DD.Combat.interact(knight, 4, 1);
    t.ok(I().traceBeam(iris, DIR.N).self, 'lined up with the second turn');
    t.eq(I().mirrorHint(knight, mo), 0, 'lined up and out of turns: 0');
    DD.AI.clearIntents(iris, false);
    I().setFacing(mo, 'E');
    t.eq(I().mirrorHint(knight, mo), 0, 'no ray charged: 0');
    DD.Combat.state.round++;   // fresh quarter turns
    t.eq(I().mirrorHint(knight, mo), 0, 'nothing charged, one turn short of her line: already prepared, 0');
    I().setFacing(mo, 'N');
    t.ok(Math.abs(I().mirrorHint(knight, mo) - 0.3 * (I().N.reflect + I().N.beam)) < 1e-9, 'nothing charged, two turns short: worth preparing (' + I().mirrorHint(knight, mo) + ')');
    I().setFacing(mo, 'E');
    chargeRay(iris, 'N');
    DD.Act.addStatus(iris, 'stun', { turns: 1 }, knight);
    t.eq(I().mirrorHint(knight, mo), 0, 'a stunned Iris charges nothing: 0');
    // AutoPlay actually does it, in a real fight
    const s = realFight('boss_dr_iris', 29);
    DD.Combat.rollInitiative();
    for (let k = 0; k < 24 && !s.result && I().fight().reflections === 0; k++) { DD.AutoPlay.takeTurn(); if (!s.result) DD.Combat.endTurn(); }
    t.ok(I().fight().rotations > 0, 'AutoPlay turns mirrors (' + I().fight().rotations + ' quarter turns)');
    t.ok(I().fight().reflections > 0, 'and bounces a ray back into her (round ' + s.round + ')');
  });

  T.suite('bosses_act2: iris previews and wind-up honesty', function (t) {
    const f = irisFight(31);
    const iris = f.iris;
    const rogue = hero('test_rogue');
    DD.Combat.giveTurnTo(rogue);
    put(rogue, iris.x - 1, iris.y);
    const prev = DD.Combat.preview(rogue, rogue.basic, iris.x, iris.y);
    const hp = iris.hp;
    DD.Combat.useSkill(rogue, rogue.basic, iris.x, iris.y);
    t.ok(prev.perUnit[iris.id] && prev.perUnit[iris.id].dmg === hp - iris.hp, 'preview == reality (' + (hp - iris.hp) + ')');
    // wind-up numbers are live: a Weak after she charged lowers them at once; a Disintegrate charged while she was Weak
    // shows (and deals) the full number once the Weak is gone
    const g = irisFight(33);
    const ir = g.iris, N = I().N;
    killAll('iris_floater');
    DD.Act.addStatus(ir, 'weak', { turns: 1 }, null);
    const dis = DD.AI.windUp(ir, 'iris_disintegrate', hero('test_mage'), { track: true, turns: 2 });
    const ray = chargeRay(ir, 'S');
    t.ok(dis && ray && dis.dmgAuto !== false && ray.dmgAuto !== false, 'no frozen wind-up numbers');
    t.eq(DD.AI.describe(ir, dis).dmg, Math.round(N.disintegrate * 0.75), 'Weak: Disintegrate shows ' + Math.round(N.disintegrate * 0.75));
    DD.Act.removeStatus(ir, 'weak', { silent: true });
    t.eq(DD.AI.describe(ir, dis).dmg, N.disintegrate, 'Weak gone: it shows the full ' + N.disintegrate + ' again');
    DD.Act.addStatus(ir, 'weak', { turns: 1 }, null);
    t.eq(DD.AI.describe(ir, ray).dmg, Math.round(N.beam * 0.75), 'Weakened after charging: the ray shows ' + Math.round(N.beam * 0.75));
    // scripted: heroes standing in every charged wind-up, Weak on and off, both phases
    const h = irisFight(34, { ai: true });
    const ir2 = h.iris;
    const nums = scriptedHonesty(ir2, 12, function (k) {
      killAll('iris_floater');
      if (k === 5) ir2.hp = Math.floor(ir2.maxHp * 0.45);
      if (k % 3 === 1) DD.Act.addStatus(ir2, 'weak', { turns: 1 + (k % 2) }, hero('test_mage'));
    });
    t.ok(nums.checked >= 12, 'checked ' + nums.checked + ' wind-up hits (' + nums.windups + ' wind-ups)');
    t.eq(nums.bad.length, 0, 'every wind-up hit deals the number it showed' + (nums.bad.length ? ': ' + nums.bad.slice(0, 3).join('; ') : ''));
    t.eq(I().data(ir2).phase, 2, 'both phases covered');
    const auto = watchNumbers(function () {
      for (let k = 0; k < 2; k++) {
        realFight('boss_dr_iris', 44 + k);
        weakenedAutoplay(I().findIris(), 40);
      }
    });
    t.log('AutoPlay fights: ' + auto.checked + ' wind-up hits checked');
    t.eq(auto.bad.length, 0, 'AutoPlay fights: every wind-up hit deals the number it showed' + (auto.bad.length ? ': ' + auto.bad.slice(0, 3).join('; ') : ''));
    const W = T.contentHelpers && T.contentHelpers.watchAreas;
    if (!W) { t.log('content helpers not loaded: area check skipped'); return; }
    const w = W(function (w) {
      realFight('boss_dr_iris', 32);
      w.arm();
      DD.AutoPlay.runBattle(14);
    });
    t.ok(w.actions > 10 && w.windups > 5, 'watched ' + w.actions + ' actions, ' + w.windups + ' wind-ups');
    t.eq(w.violations.length, 0, 'areas honest (mirrors turned mid-fight included)' + (w.violations.length ? ': ' + w.violations[0] : ''));
  });

  T.suite('bosses_act2: iris autoplay sims', function (t) {
    const n = +(t.param('n', 12)) || 12;
    const level = +(t.param('level', BAND)) || BAND;
    const r = sims(t, 'boss_dr_iris', n, level, irisStats);
    t.eq(r.timeouts, 0, 'no timeouts');
    if (t.param('nopuzzle', '0') === '1') { t.log('puzzle ignored: ' + Math.round(r.rate * 100) + '% wins, ' + (r.agg.reflections / r.n).toFixed(1) + ' accidental reflections a fight'); return; }
    t.ok(r.per.filter(function (st) { return st.reflections >= 1; }).length >= Math.ceil(r.n * 0.75), 'AutoPlay bounces a ray back into her in most fights');
    t.ok(r.agg.reflections >= r.n * 1.5, 'on average 1.5+ reflections per fight (' + (r.agg.reflections / r.n).toFixed(1) + ')');
    checkBand(t, r, level, 'dr_iris');
  });

  T.suite('bosses_act2: lich review (v2): the bones never act or walk, the Second Printing always follows', function (t) {
    // a collapse in the middle of his own turn (a thorny knight's retaliation on his notice) ends that turn: a pile of
    // bones charges nothing (the wind-up would land, from the bones, before he reforms)
    const f = lichFight(5, { ai: true });
    const lich = f.lich;
    killAll('lich_intern');
    const knight = hero('test_knight');
    put(lich, 7, 2); put(knight, 7, 3);
    DD.Combat.heroes().forEach(function (h) { if (h !== knight) DD.Act.addStatus(h, 'stealth', { turns: 3 }, h); });
    DD.Act.addStatus(knight, 'thorns', { stacks: 10, turns: 3 }, knight);
    lich.hp = 3;
    L().data(lich).step = 0;
    let rec = recorder();
    DD.Combat.giveTurnTo(lich);
    t.ok(rec.usedBy(lich).indexOf('lich_overdue_notice') >= 0 && L().isBones(lich), 'premise: his notice hit the thorny knight and the thorns collapsed him');
    t.eq(rec.windups.length, 0, 'a pile of bones charges no wind-up');
    t.eq(lich.intents.length, 0, 'nothing pending from the bones');
    t.eq(DD.AI.reachOf(lich).tiles.size, 0, 'the HUD\'s reach line / threat shading: a pile of bones reaches nobody (his next turn is the reform)');
    rec.clear();
    DD.Combat.giveTurnTo(lich);
    t.ok(!L().isBones(lich) && rec.used.filter(function (x) { return x.user === lich; }).length === 0, 'his next turn is the reform, and nothing lands on anyone');
    t.ok(DD.AI.reachOf(lich).tiles.size > 0, 'reformed: his notices reach again');
    rec.clear();
    DD.Combat.giveTurnTo(lich);
    t.ok(rec.usedBy(lich).indexOf('lich_overdue_notice') >= 0, 'and the turn after he mails again');
    rec.off();
    // collapsed by an attack of opportunity on a walk: the pile of bones stays where it fell
    const f3 = lichFight(8, { ai: true });
    const l3 = f3.lich;
    killAll('lich_intern');
    const kn3 = hero('test_knight');
    put(l3, 7, 2); put(kn3, 7, 3);
    DD.Combat.giveTurnTo(l3);
    DD.AI.clearIntents(l3, false);
    t.ok(DD.Act.opportunitySlot(kn3), 'premise: the knight holds the line (melee basic)');
    l3.hp = 2;
    kn3.oppRound = 0;
    const walked = DD.Act.moveAlong(l3, [{ x: 8, y: 2 }, { x: 9, y: 2 }, { x: 10, y: 2 }], { provoke: true });
    t.ok(walked.provoked >= 1 && L().isBones(l3), 'the knight\'s attack of opportunity collapses him as he leaves');
    t.ok(l3.x === 7 && l3.y === 2 && walked.length === 0, 'and the bones stay put (walked ' + walked.length + ' tiles)');
    // collapsed on a hero's turn and then stunned (the reform turn lost): still no phantom threat until he reforms
    const f2 = lichFight(6, { ai: true });
    const l1 = f2.lich;
    killAll('lich_intern');
    l1.hp = 2;
    DD.Act.damage(knight, l1, 9);
    t.ok(L().isBones(l1) && DD.AI.reachOf(l1).tiles.size === 0, 'collapsed by a hero: no reach');
    t.ok(DD.Act.addStatus(l1, 'stun', { turns: 1 }, hero('test_knight')), 'the bones are stunned');
    DD.Combat.giveTurnTo(l1);
    t.ok(L().isBones(l1) && DD.AI.reachOf(l1).tiles.size === 0, 'the lost turn: still bones, still no reach');
    DD.Combat.giveTurnTo(l1);
    t.ok(!L().isBones(l1), 'then he reforms');
    // a fallback Bookfall (the SHHHH! step with nobody close) promises a Second Printing in its banner: it comes, and the
    // rotation resumes after it
    const g = lichFight(7, { ai: true });
    const l2 = g.lich;
    killAll('lich_intern');
    put(l2, 7, 2);
    DD.Combat.heroes().forEach(function (h, i) { put(h, 2 + i, 9); });
    L().data(l2).step = 2;
    rec = recorder();
    DD.Combat.giveTurnTo(l2);
    const w1 = pendingOf(l2, 'lich_bookfall')[0];
    t.ok(w1 && w1.data && w1.data.reprint && rec.windups.length === 1, 'premise: the SHHHH! step fell back to a Bookfall (its banner promises a Second Printing)');
    t.eq(L().nextStep(l2), 'reprint', 'the passive line names the Second Printing as his next step');
    t.ok(/Next: Second Printing/.test(L().passiveText(l2)), 'passive: ' + L().passiveText(l2));
    rec.clear();
    killAll('lich_intern');
    DD.Combat.giveTurnTo(l2);
    const w2 = pendingOf(l2, 'lich_bookfall')[0];
    t.ok(rec.used.some(function (x) { return x.skill === 'lich_bookfall' && x.windup; }), 'the first wave landed');
    t.ok(w2 && /2nd Printing/.test(w2.label), 'its Second Printing is charged (' + (w2 && w2.label) + ')');
    if (w2 && w1) t.ok(w2.tiles.every(function (p) { return !w1.tiles.some(function (q) { return q.x === p.x && q.y === p.y; }); }), 'on the other squares');
    t.eq(rec.usedBy(l2).indexOf('lich_interns'), -1, 'the interns wait');
    rec.clear();
    killAll('lich_intern');
    DD.Combat.giveTurnTo(l2);
    t.ok(rec.usedBy(l2).indexOf('lich_interns') >= 0 && rec.windups.length === 0, 'then the rotation resumes (Unpaid Internship)');
    // a phase change right after a first wave: the Second Printing first, then the Final Notice
    DD.AI.clearIntents(l2, false);
    killAll('lich_intern');
    L().data(l2).step = 0;
    DD.Combat.heroes().forEach(function (h, i) { h.hp = h.maxHp; h.downed = false; put(h, 5 + i, 7); });
    rec.clear();
    DD.Combat.giveTurnTo(l2);
    t.ok(pendingOf(l2, 'lich_bookfall').length === 1, 'a Bookfall charged in phase 1');
    l2.hp = Math.floor(l2.maxHp * 0.45);
    rec.clear();
    DD.Combat.giveTurnTo(l2);
    t.eq(L().data(l2).phase, 2, 'FINAL NOTICE');
    t.ok(pendingOf(l2, 'lich_bookfall').length === 1 && /2nd Printing/.test(pendingOf(l2, 'lich_bookfall')[0].label), 'the Second Printing still follows its first wave');
    rec.clear();
    DD.Combat.heroes().forEach(function (h) { h.hp = h.maxHp; h.downed = false; });
    killAll('lich_intern');
    DD.Combat.giveTurnTo(l2);
    t.eq(rec.windups.map(function (w) { return w.skill; }).join(), 'lich_final_notice', 'then the phase 2 rotation starts with the Final Notice');
    t.ok(/When a first wave lands, he charges its Second Printing/.test(DD.skillDesc(DD.getSkill('lich_bookfall'), 1, null)), 'the Bookfall desc says what really happens');
    // an interrupted first wave: the passive line stops promising the Second Printing (he shouts instead)
    DD.AI.clearIntents(l2, false);
    L().data(l2).phase = 1;
    L().data(l2).step = 0;
    put(l2, 7, 2);
    L().waiveFees(l2);
    DD.Combat.heroes().forEach(function (h, i) { h.hp = h.maxHp; h.downed = false; put(h, 5 + i, 4); });
    l2.hp = l2.maxHp;
    killAll('lich_intern');
    DD.Combat.giveTurnTo(l2);
    t.eq(L().nextStep(l2), 'reprint', 'a first wave pending: next, its Second Printing');
    DD.AI.cancelIntents(l2, 'test');
    t.eq(L().nextStep(l2), 'shhh', 'interrupted: next, SHHHH! (no wave, no reprint)');
    rec.clear();
    DD.Combat.giveTurnTo(l2);
    t.eq(rec.windups.map(function (w) { return w.skill; }).join(), 'lich_shhh', 'and so it is');
    rec.off();
    // the Overdue Notice goes to the nearest foe (the passive line names who gets it now); a taunt redirects it
    const h4 = lichFight(9, { ai: true });
    const l4 = h4.lich;
    killAll('lich_intern');
    const kn = hero('test_knight'), mg = hero('test_mage'), cl = hero('test_cleric'), ro = hero('test_rogue');
    put(l4, 7, 2); put(kn, 7, 4); put(mg, 2, 10); put(cl, 3, 10); put(ro, 4, 10);
    mg.hp = 2;
    t.ok(new RegExp('Overdue Notice to the nearest foe \\(now: ' + kn.name + '\\)').test(L().passiveText(l4)), 'passive: ' + L().passiveText(l4));
    rec = recorder();
    DD.Combat.giveTurnTo(l4);
    t.ok(rec.hits.some(function (h) { return h.target === kn && h.skill === 'lich_overdue_notice'; }), 'the knight in front of his desk gets the mail');
    t.ok(!mg.downed && mg.hp === 2, 'the 2-HP mage at the back is left alone');
    DD.AI.clearIntents(l4, false);
    L().waiveFees(l4);
    t.ok(DD.Act.addStatus(l4, 'taunt', { turns: 1 }, ro), 'the rogue taunts him from the back');
    rec.clear();
    DD.Combat.giveTurnTo(l4);
    t.ok(rec.hits.some(function (h) { return h.target === ro && h.skill === 'lich_overdue_notice'; }) && !rec.hits.some(function (h) { return h.target === kn && h.skill === 'lich_overdue_notice'; }), 'taunted: the notice goes to the taunter');
    rec.off();
  });

  T.suite('bosses_act2: review (v2): a collapse at his turn start leaves the heroes a turn; a reflection fizzles every other ray', function (t) {
    // his own landing wind-up collapses him at his turn start (a thorny knight on the Bookfall): the bones must not reform
    // in that same turn (the heroes get their turn to shred while he is bones)
    lichFight(4, { ai: true });
    const lich = L().findLich();
    killAll('lich_intern');
    const knight = hero('test_knight');
    put(lich, 7, 2); put(knight, 7, 3);
    DD.Combat.giveTurnTo(knight);
    t.ok(!!DD.AI.windUp(lich, 'lich_bookfall', { x: 7, y: 3 }, { tiles: [{ x: 7, y: 3 }], label: 'Bookfall' }), 'a Bookfall on the knight');
    DD.Act.addStatus(knight, 'thorns', { stacks: 6, turns: 3 }, knight);
    lich.hp = 3;
    const ph0 = L().phylacteryTiles().length;
    let rec = recorder();
    DD.Combat.giveTurnTo(lich);
    t.ok(L().isBones(lich), 'premise: the thorns collapsed him as his Bookfall landed');
    t.eq(L().data(lich).renewals, 0, 'he did not reform in the turn he collapsed');
    t.eq(L().phylacteryTiles().length, ph0, 'no phylactery burnt yet');
    t.eq(rec.windups.length + rec.usedBy(lich).filter(function (id) { return id !== 'lich_bookfall'; }).length, 0, 'and did nothing else');
    t.eq(DD.AI.reachOf(lich).tiles.size, 0, 'no reach while he is bones');
    DD.Combat.giveTurnTo(knight);
    DD.Combat.giveTurnTo(lich);
    t.ok(!L().isBones(lich) && L().data(lich).renewals === 1, 'his next turn: the reform');
    rec.off();
    // Dr. Iris: a ray that bounces back makes ALL her other charged rays fizzle, even ones charged before it
    DD.Combat.sandbox({
      w: 9, h: 9, seed: 7, floor: 'marble', enemyAi: false,
      objective: { type: 'custom', text: 'Test' }, encounter: { id: 'ba2_iris_box', checkObjective: function () { return null; } },
      heroes: PARTY.map(function (id, i) { return { id: id, x: i, y: 8, level: BAND }; }),
      enemies: [{ id: 'dr_iris', x: 4, y: 4 }], objects: [{ x: 7, y: 4, id: 'mirror', data: { facing: 'N' } }],
    });
    const iris = I().findIris();
    I().setupClinic(DD.Combat.state);
    const mo = mirrorAt(7, 4);
    I().setFacing(mo, 'N');
    const mage = hero('test_mage');
    put(mage, 4, 1);   // on the north line
    chargeRay(iris, 'N');   // charged first
    chargeRay(iris, 'E');   // charged second
    I().setFacing(mo, 'W'); // now the east ray comes straight back
    t.ok(I().traceBeam(iris, DIR.E).self, 'premise: the east line bounces back');
    rec = recorder();
    const ihp = iris.hp;
    DD.Combat.giveTurnTo(iris);
    t.eq(ihp - iris.hp, I().N.reflect, 'REFLECTED');
    t.eq(rec.dmgTo(mage, 'iris_eye_beam'), 0, 'her other ray (north, charged first) fizzled: the mage on it is not hit');
    t.eq(I().fight().flinches, 1, 'a flinch');
    rec.off();
  });

  /**
   * Balance probe (debug only, probe=1 with real=1): whom do his Overdue Notices hit in AutoPlay fights? (Review v2: with
   * the old "kills first" scoring half of them hit the lowest-HP hero, from anywhere, and they caused ~90% of the downs.)
   */
  T.suite('bosses_act2: zz probe notice targets', function (t) {
    if (t.param('probe', '') !== '1') { t.skip('probe=1 only'); return; }
    let n = 0, lowest = 0, downs = 0, revived = 0, melee = 0, total = 0;
    for (let i = 0; i < 24; i++) {
      const pt = simParty(t, BAND, i);
      const s = realFight('boss_lichtenstein', 1000 + i * 7919, pt);
      DD.Act.addRule({ id: 'probe_n', name: 'p', hooks: {
        modifyIncomingDamage: function (d) {
          if (DD.Act.simulating || !d.skill || d.skill.id !== 'lich_overdue_notice' || d.target.kind !== 'hero') return;
          n++;
          const act = DD.Combat.heroes().filter(function (h) { return !h.dead && !h.downed; });
          const minHp = Math.min.apply(null, act.map(function (h) { return h.hp; }));
          if (d.target.hp === minHp) lowest++;
          if (DD.Act.opportunitySlot(d.target)) melee++;
          if (d.target.hp <= d.target.maxHp * 0.3) revived++;
        },
        onTakeDamage: function (d) { if (!DD.Act.simulating && d.skill && d.skill.id === 'lich_overdue_notice' && d.dealt > 0 && d.target.kind === 'hero' && d.target.hp <= 0) downs++; },
      } });
      DD.AutoPlay.runBattle(30);
      total += s.stats.downs || 0;
    }
    t.log('notices ' + n + ', on the lowest-HP hero ' + lowest + ', on a melee hero ' + melee + ', on a hero at <=30% HP ' + revived + ', downs by notice ' + downs + ' of ' + total + ' downs');
    t.ok(n > 0, 'notices recorded');
  });

  T.suite('bosses_act2: zz calibration', function (t) {
    if (!t.param('calib', '')) { t.skip('calib=<encounter id> only'); return; }
    sims(t, t.param('calib', ''), +(t.param('n', 12)) || 12, +(t.param('level', BAND)) || BAND, function (s) { return { downs: s.stats.downs || 0 }; });
    t.ok(true, 'ran');
  });

  // ---- v2 user requests (Nov 3): flyers ignore everything on the floor (clouds still reach them) -----------------
  T.suite('bosses_act2: v2 requests (Nov 3) — Lich-tenstein, Dr. Iris and her floaters float over the floor', function (t) {
    const n0 = DD.problems.length;
    [['boss_lichtenstein', 'lichtenstein'], ['boss_dr_iris', 'dr_iris'], ['boss_dr_iris', 'iris_floater']].forEach(function (pair) {
      fight(pair[0], 41);
      const u = units(pair[1])[0];
      if (!u) { t.ok(false, pair[1] + ' is in ' + pair[0]); return; }
      t.ok(DD.Grid.isFlying(u), pair[1] + ' flies');
      // control: a walking hero ending its turn in fire gets Burned
      const k = hero('test_knight');
      if (!DD.Combat.isTurnOf(k)) DD.Combat.giveTurnTo(k);
      DD.Act.setSurface(k.x, k.y, 'fire', 3);
      DD.Combat.endTurn();
      t.ok(has(k, 'burn'), pair[1] + ' fight, control: the walking knight ends his turn in fire and Burns');
      // fire under the flyer: nothing at its turn end (a cloud is the only thing on a tile that reaches a flyer)
      const hp = u.hp;
      DD.Act.setSurface(u.x, u.y, 'fire', 3);
      t.eq(DD.Grid.hazardAt(u.x, u.y, u), null, pair[1] + ': fire under it is no hazard for it');
      DD.Combat.giveTurnTo(u);
      if (DD.Combat.isTurnOf(u)) DD.Combat.endTurn();
      t.ok(!has(u, 'burn') && u.hp === hp, pair[1] + ': ends its turn over fire without a Burn');
      t.ok(DD.Grid.feelsSurface(u, 'steam') && !DD.Grid.feelsSurface(u, 'fire'), pair[1] + ': steam (a cloud) still reaches it, fire does not');
    });
    t.eq(DD.problems.slice(n0).filter(function (p) { return /^Error in /.test(p); }).length, 0, 'no swallowed errors');
  });

  // ---- map rotation: box props turn with the board (rotation plan §7 P2: def.yawAware) ------------------------------
  /**
   * Pixels of an object def painted at `yaw` on a fresh 160×200 canvas (the feet at 80, 160; zoom 1.5), through the painter
   * the renderer hands it: the yawAware one when the def opts in, the billboard one when `billboard` is set.
   */
  function rotPx(id, inst, yaw, billboard) {
    const def = DD.getObject(id), cv = document.createElement('canvas');
    cv.width = 160; cv.height = 200;
    const c = cv.getContext('2d');
    c.translate(80, 160); c.scale(1.5, 1.5);
    const obj = Object.assign({ id: id, hp: 0, maxHp: 0, data: {} }, JSON.parse(JSON.stringify(inst || {})));
    DD.Iso.withYaw(yaw, function () {
      const g = DD.Iso.painter(c, { yawAware: !billboard && def.yawAware === true, t: 0.8 });
      g.obj = obj; g.tile = { x: 3, y: 4 }; g.zoom = 1.5; g.lw = 1.2; g.outline = '#1a1014';
      g.pal = def.colors || def.palette || {};
      def.draw.call(def, g, obj, 0.8);
    });
    return c.getImageData(0, 0, cv.width, cv.height).data;
  }
  function rotSame(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  /** Opaque pixels passing fn(r, g, b): how many, and their mean x (canvas px; the feet are at 80). */
  function rotCount(d, fn) {
    let n = 0, sx = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && fn(d[i], d[i + 1], d[i + 2])) { n++; sx += (i / 4) % 160; }
    return { n: n, x: n ? sx / n : 0 };
  }
  function rotHex(hex) {
    const v = parseInt(hex.slice(1), 16);
    return function (r, g, b) { return r === (v >> 16) && g === ((v >> 8) & 255) && b === (v & 255); };
  }
  /**
   * Each case [id, inst]: the def opts in; at yaw 0 its turning painter draws exactly the billboard pixels (opting in never
   * changes the default view); it paints at every angle without throwing, and turns (30° differs from 0°).
   */
  function rotTurns(t, cases) {
    const yaws = [30, 37.5, 45, 90, 120, 180, 225, 270, 315];
    cases.forEach(function (cs) {
      const id = cs[0], inst = cs[1] || {}, tag = id + ' ' + JSON.stringify(inst.data || {}) + (inst.hp ? ' (' + inst.hp + ' HP)' : '');
      t.ok(!!DD.getObject(id) && DD.getObject(id).yawAware === true, tag + ': opts in (yawAware)');
      const p0 = t.tryRun(tag + ' at 0°', function () { return rotPx(id, inst, 0); });
      t.ok(!!p0 && rotSame(p0, rotPx(id, inst, 0, true)), 'yaw 0: ' + tag + ' paints exactly what the billboard painter paints');
      const bad = [];
      yaws.forEach(function (y) {
        const p = t.tryRun(tag + ' at ' + y + '°', function () { return rotPx(id, inst, y); });
        if (!p || !rotCount(p, function () { return true; }).n) bad.push(y);
        else if (y === 30 && p0 && rotSame(p, p0)) bad.push('30 (did not turn)');
      });
      t.eq(bad.join(','), '', tag + ' paints at ' + yaws.join(' / ') + '° and turns with the map');
    });
  }

  T.suite('bosses_act2: the library furniture and the exam chair turn with the map (box props, yawAware)', function (t) {
    if (!DD.Iso || !DD.Iso.withYaw || !DD.getObject('lich_shelf') || !DD.getObject('iris_chair')) { t.skip('map views or boss content not loaded'); return; }
    const n0 = DD.problems.length;
    rotTurns(t, [['lich_shelf', {}], ['lich_shelf', { data: { searched: true } }], ['lich_shelf', { data: { searched: true, role: 'spent' } }],
      ['lich_shelf', { data: { revealed: true } }], ['lich_catalog', {}], ['lich_desk', {}], ['iris_chair', {}]]);
    // the OVERDUE sticker is on the shelf's south side: gone from the north (180°); every side holds books
    const red = rotHex('#c0263a');
    const s0 = rotCount(rotPx('lich_shelf', {}, 0), red).n, s180 = rotCount(rotPx('lich_shelf', {}, 180), red).n;
    t.ok(s0 > 5 && s180 === 0, 'the OVERDUE sticker is on the south side (' + s0 + ' / ' + s180 + ' px)');
    const cols = ['#8e2b2b', '#2d4f8a', '#3b6b3f', '#6a4a8c', '#b08a2a', '#2c6b6b', '#7a3a5a'].map(rotHex);
    const book = function (r, g, b) { return cols.some(function (f) { return f(r, g, b); }); };
    const b0 = rotCount(rotPx('lich_shelf', {}, 0), book).n, b180 = rotCount(rotPx('lich_shelf', {}, 180), book).n;
    t.ok(b0 > 50 && b180 > 50, 'books on the near sides and on the far ones (' + b0 + ' / ' + b180 + ' book px)');
    // the exam chair's seat, backrest and lamp turn with its base: the lamp is right of it by default, left of it at 180°
    const lamp = function (r, g, b) { return r > 215 && g > 225 && b > 225; };
    const l0 = rotCount(rotPx('iris_chair', {}, 0), lamp), l180 = rotCount(rotPx('iris_chair', {}, 180), lamp);
    t.ok(l0.n > 10 && l180.n > 10 && l0.x > 80 && l180.x < 80, 'the exam lamp swings round with the chair (x ' + l0.x.toFixed(1) + ' -> ' + l180.x.toFixed(1) + ')');
    t.eq(DD.problems.slice(n0).filter(function (p) { return /^Error in /.test(p); }).length, 0, 'no swallowed errors');
  }, { tags: ['render'] });
})();
