/* Dungeons and Degenerates — tests/content/bosses_act2.js
 * Suites "bosses_act2: …" for the Act 2 bosses: Lich-tenstein (js/data/bosses/lich.js) and Dr. Iris
 * (js/data/bosses/beholder.js). Unit tests of every mechanic (damage == desc, patterns, phases, puzzles, caps,
 * control resistance, previews, telegraph honesty) plus AutoPlay balance sims with the fixture party at level 7.
 * Balance options for the sims: n=<fights>, telemetry=1, curve=1, trace=1, only=<i>, party=a,b,c,d,
 * tune=lichtenstein.hp=270;lich.N.interest=1;iris_eye_beam.dmg=12 (debug only).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const L = function () { return DD.Act2Bosses && DD.Act2Bosses.lich; };
  const I = function () { return DD.Act2Bosses && DD.Act2Bosses.iris; };

  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const LOADOUT = {
    test_knight: ['test_shield_bash', 'test_cleave', 'test_war_shout', 'test_guard_ally'],
    test_cleric: ['test_heal', 'test_bless', 'test_sanctuary', 'test_revive'],
    test_mage: ['test_fireball', 'test_frost_ray', 'test_cone_of_cold', 'test_chain_zap'],
    test_rogue: ['test_shiv', 'test_hook', 'test_swap', 'test_trap'],
  };

  // ---- helpers -----------------------------------------------------------------------------------------------------
  /** The fixture party at `level` with the debug loadout (starting skills + 2 pool skills, level 2 from L5). */
  function party(level) {
    const sl = level >= 5 ? 2 : 1;
    // ?party=a,b,c,d (balance runs only): real heroes with the same debug loadout as js/main.js
    const want = String(T.params.party || '').split(',').filter(function (id) { return id && DD.getHero(id); });
    if (want.length) {
      return want.map(function (id) {
        const h = DD.getHero(id);
        const ids = h.startingSkills.concat(h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, 2));
        return DD.Combat.makeRunHero({ id: id, level: level, skills: ids.map(function (s) { return { id: s, level: Math.min(sl, DD.getSkill(s).levels.length) }; }) });
      });
    }
    return PARTY.map(function (id) {
      return DD.Combat.makeRunHero({ id: id, level: level, skills: LOADOUT[id].map(function (s) { return { id: s, level: sl }; }) });
    });
  }
  /** Build + start a real boss encounter (opts go to Combat.start, e.g. { noPlan: true }). */
  function startBoss(encId, seed, level, opts) {
    const setup = DD.Encounter.build(DD.getEncounter(encId), party(level || 7), { rng: DD.RNG('bosses_act2:' + encId + ':' + seed), difficulty: 'normal', act: 2 });
    DD.Combat.start(setup, Object.assign({ seed: seed, headless: true, difficulty: 'normal', kind: 'boss' }, opts || {}));
    return DD.Combat.state;
  }
  function units(defId) { return DD.Combat.state.units.filter(function (u) { return u.defId === defId && !u.dead && !u.downed; }); }
  function hero(defId) { return units(defId)[0]; }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function key(p) { return p.x + ',' + p.y; }
  function ids(list) { return list.map(function (i) { return i.skillId.replace(/^(lich|iris)_/, '') + (i.delay ? '@' + i.delay : ''); }); }
  /** Plan an intent and resolve it at once (delay 0), like the enemy phase would. */
  function cast(u, skillId, target, opts) {
    const it = DD.AI.makeIntent(u, skillId, target, Object.assign({ noCooldown: true }, opts || {}));
    DD.AI.executeIntent(u, it);
    return it;
  }
  /** Teleport unit to (x, y), first clearing anything standing there. */
  function put(u, x, y) {
    const o = DD.Grid.unitAt(x, y);
    if (o && o !== u) DD.Act.teleport(o, DD.Grid.nearestFree(x, y).x, DD.Grid.nearestFree(x, y).y, { fx: false, noEnter: true });
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
  /** A free walkable tile next to (x, y) (for interacting with an object there). */
  function nextTo(x, y) {
    const n = DD.Grid.neighbors(x, y).filter(function (t) { return DD.Grid.isFree(t.x, t.y) && !DD.Grid.isDrop(t.x, t.y); });
    return n[0] ? { x: n[0].x, y: n[0].y } : null;
  }
  function interactAt(u, x, y) {
    const spot = nextTo(x, y);
    if (spot) put(u, spot.x, spot.y);
    u.ap = Math.max(u.ap, 3);
    return DD.Combat.interact(u, x, y);
  }
  function dmgRecorder() {
    const rec = [];
    DD.Act.addRule({ id: 'ba2_rec', name: 'Recorder', hooks: { onTakeDamage: function (d) { if (!DD.Act.simulating) rec.push({ target: d.target, base: d.base, dealt: d.dealt, cause: d.cause, src: d.source }); } } });
    return rec;
  }

  /**
   * Telegraph NUMBER honesty while fn runs: every enemy intent that lands must hit for exactly the number its telegraph
   * (DD.AI.describe) showed when the player ended the turn — the pipeline's attacker-side number, read the moment
   * modifyIncomingDamage fires (the target's Block / armor / Vulnerable come after). Returns { checked, bad }.
   */
  function watchNumbers(fn) {
    const out = { checked: 0, bad: [] };
    let snap = {}, cur = null;
    const take = function () {
      snap = {};
      DD.Combat.state.units.forEach(function (u) {
        if (!u.dead && u.side === 'enemy') (u.intents || []).forEach(function (it) { snap[it.id] = DD.AI.describe(u, it).dmg; });
      });
    };
    const off = DD.Events.on('turn:enemy', take);
    const exec = DD.AI.executeIntent, fire = DD.Hooks.fire;
    DD.AI.executeIntent = function (unit, intent) {
      if (!intent || intent.delay > 0) return exec.apply(DD.AI, arguments);
      const prev = cur;
      cur = { unit: unit, intent: intent, tele: snap[intent.id] };
      try { return exec.apply(DD.AI, arguments); } finally { cur = prev; }
    };
    DD.Hooks.fire = function (name, unit, d) {
      if (name === 'modifyIncomingDamage' && cur && d && d.source === cur.unit && d.cause === 'skill' && cur.tele !== undefined && !DD.Act.simulating) {
        out.checked++;
        const raw = Math.round(d.amount * d.mult + d.flat);
        if (raw !== cur.tele) out.bad.push(cur.intent.skillId + ': telegraph ' + cur.tele + ', hit ' + raw + ' (round ' + DD.Combat.state.round + ')');
      }
      return fire.apply(DD.Hooks, arguments);
    };
    try { fn(); } finally { off(); DD.AI.executeIntent = exec; DD.Hooks.fire = fire; }
    return out;
  }
  /** AutoPlay rounds where the boss gets Weakened (1 or 2 turns) in every other player phase, after it planned. */
  function weakenedAutoplay(boss, rounds) {
    const s = DD.Combat.state;
    for (let r = 0; r < rounds && !s.result; r++) {
      if (r % 2 === 0 && !boss.dead) DD.Act.addStatus(boss, 'weak', { turns: 1 + (r % 4 === 0 ? 1 : 0) }, null);
      DD.AutoPlay.takeTurn();
      if (!s.result) DD.Combat.endTurn();
    }
  }

  // ---- balance-tuning hook (debug only) ---------------------------------------------------------------------------
  /** ?tune=lichtenstein.hp=270;iris.N.gaze=3;iris_eye_beam.dmg=12 sets enemy def fields, a boss module's N or a skill's L1. */
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
  /** Damage telemetry rule: who hurt whom (by source def or cause). */
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
      return u.name.slice(0, 5) + '@' + u.x + ',' + u.y + ':' + u.hp + (u.intents && u.intents.length ? '[' + ids(u.intents).join(',') + ']' : '');
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
      const s = startBoss(encId, 1000 + i * 7919 + (+t.seed || 0), level);
      if (t.param('nopuzzle', '0') === '1') {
        s.grid.tiles.forEach(function (q) { if (q.obj && q.obj.id === 'mirror') q.obj.autoplay = function () { return 0; }; });
      }
      if (t.param('verbose', '0') === '1') t.log('#' + i + ' setup ' + setupSig(s));
      const rec = t.param('telemetry', '0') === '1' ? tracker(s) : null;
      let res;
      if (t.param('curve', '0') === '1' || t.param('trace', '0') === '1') {
        const curve = [];
        for (let g = 0; g < 31 && !s.result; g++) {
          const b = s.units.filter(function (u) { return u.tier === 'boss'; })[0];
          curve.push((b ? b.hp : 0) + '/' + s.units.filter(function (u) { return u.kind === 'hero' && !u.downed; }).reduce(function (a, h) { return a + h.hp; }, 0));
          if (t.param('trace', '0') === '1') t.log(shortState(s));
          DD.AutoPlay.takeTurn();
          if (!s.result) DD.Combat.endTurn();
        }
        t.log('curve boss/heroes: ' + curve.join(' '));
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
      per.push(st);
      for (const k in st) agg[k] = (agg[k] || 0) + st[k];
      if (t.param('verbose', '0') === '1') t.log('#' + i + ' ' + (res.result || 'timeout') + ' in ' + res.rounds + ' rounds ' + JSON.stringify(st));
    }
    const m = per.length || 1;
    t.log(encId + ': won ' + wins + '/' + m + ' (' + Math.round(100 * wins / m) + '%), avg rounds ' + (rounds / m).toFixed(1) + ', timeouts ' + timeouts +
      ', totals ' + JSON.stringify(agg));
    if (Object.keys(tb).length) {
      const avg = function (o) { const r = {}; Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).forEach(function (k) { r[k] = Math.round(o[k] / m); }); return r; };
      t.log('avg damage to the boss per fight: ' + JSON.stringify(avg(tb)));
      t.log('avg damage to heroes per fight: ' + JSON.stringify(avg(th)));
    }
    return { wins: wins, n: m, rate: wins / m, rounds: rounds / m, timeouts: timeouts, agg: agg, per: per };
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
    const s = startBoss('boss_lichtenstein', seed || 3, 7, Object.assign({ noPlan: true }, opts || {}));
    return { s: s, lich: L().findLich() };
  }
  function shelvesWith(role) { return L().shelves().filter(function (t) { return t.obj.data.role === role; }); }

  T.suite('bosses_act2: lich arena, roles and registry', function (t) {
    const def = DD.getEnemy('lichtenstein');
    t.ok(def && def.tier === 'boss' && def.act === 2 && def.boss && def.boss.title, 'lichtenstein is an act 2 boss with a title');
    t.ok(def.hp >= 260 && def.hp <= 320, 'HP in the act 2 boss range (' + def.hp + ')');
    t.ok(typeof def.ai === 'function', 'custom planner');
    const enc = DD.getEncounter('boss_lichtenstein');
    t.ok(enc && enc.kind === 'boss' && enc.act === 2 && enc.objective.type === 'boss' && !!enc.intro, 'boss encounter');
    const f = lichFight(3);
    const s = f.s;
    t.ok(f.lich && DD.Grid.tile(f.lich.x, f.lich.y).tag === 'boss_spawn', 'the lich starts on his spawn mark');
    t.eq(units('lich_intern').length, 2, 'two interns at the start');
    t.eq(L().shelves().length, 8, '8 Restricted Section Shelves');
    t.eq(shelvesWith('phylactery').length, 3, '3 phylacteries');
    t.eq(shelvesWith('mimic').length, 2, '2 mimics');
    t.eq(shelvesWith('empty').length, 3, '3 boring shelves');
    t.eq(s.grid.tiles.filter(function (q) { return q.obj && q.obj.id === 'lich_catalog'; }).length, 2, '2 card catalogs');
    t.ok(s.grid.tiles.some(function (q) { return q.tag === 'lich_chute'; }), 'the book-return chute (pit) is marked');
    // the phylacteries hide among the 6 shelves farthest from the deployment zone
    const zone = s.grid.tiles.filter(function (q) { return q.zone === 'hero'; });
    const depth = function (q) { let d = 99; zone.forEach(function (z) { d = Math.min(d, DD.Grid.dist(z, q)); }); return d; };
    const sorted = L().shelves().slice().sort(function (a, b) { return depth(b) - depth(a); });
    const cutoff = depth(sorted[5]);
    t.ok(shelvesWith('phylactery').every(function (q) { return depth(q) >= cutoff; }), 'phylacteries are deep in the library');
    t.ok(L().shelves().every(function (q) { return q.obj.label === 'Restricted Section Shelf' && !q.obj.data.revealed; }), 'roles are hidden at the start');
    t.ok(/Phylacteries shredded 0/.test(s.objective.flavor || ''), 'objective subtitle tracks the puzzle: ' + s.objective.flavor);
    // roles are dealt by the combat RNG
    const sigs = {};
    for (let k = 1; k <= 6; k++) { lichFight(k); sigs[L().shelves().map(function (q) { return q.obj.data.role[0]; }).join('')] = 1; }
    t.ok(Object.keys(sigs).length > 1, 'shelf roles vary between fights (' + Object.keys(sigs).length + ' layouts in 6 seeds)');
    t.ok(DD.defs.narration.lich_renew && DD.defs.narration.lich_phase2 && DD.defs.narration.lich_victory, 'narration keys registered');
  });

  T.suite('bosses_act2: lich skills deal exactly their desc damage', function (t) {
    const f = lichFight(4);
    const lich = f.lich;
    killAll('lich_intern');
    const mage = hero('test_mage'), rogue = hero('test_rogue');
    parkHeroes([mage, rogue]);
    put(lich, 7, 2);
    put(mage, 7, 5);
    // Overdue Notice: 11, + Late Fees
    const sk = DD.getSkill('lich_overdue_notice');
    t.ok(/\b11\b/.test(DD.skillDesc(sk, 1, null)), 'notice desc shows 11');
    let hp = mage.hp;
    cast(lich, 'lich_overdue_notice', mage, { anchor: 'unit' });
    t.eq(hp - mage.hp, 11, 'Overdue Notice deals 11');
    DD.Act.addStatus(lich, 'lich_late_fees', { stacks: 3, turns: -1, silent: true }, lich);
    t.eq(L().fees(lich), 3, 'fees 3');
    t.eq(L().teleDmg(lich, 11), 14, 'telegraph number includes the fees');
    hp = mage.hp;
    cast(lich, 'lich_overdue_notice', mage, { anchor: 'unit' });
    t.eq(hp - mage.hp, 14, 'Overdue Notice with Late Fees 3 deals 14');
    DD.Act.removeStatus(lich, 'lich_late_fees', { silent: true });
    // tracking: breaks line of sight -> fizzles
    const it = DD.AI.makeIntent(lich, 'lich_overdue_notice', mage, { anchor: 'unit', noCooldown: true });
    put(mage, 2, 5); // behind the shelf at (2,4)
    t.ok(!DD.Grid.los(lich, mage), 'the shelf at (2,4) hides the mage');
    hp = mage.hp;
    DD.AI.executeIntent(lich, it);
    t.eq(mage.hp, hp, 'no line of sight: the notice fizzles');
    // Bookfall: only marked squares
    put(mage, 6, 7); put(rogue, 7, 7);
    const reg = L().checkerRegion([mage, rogue]);
    const par = (mage.x + mage.y) % 2;
    const tiles = L().checkerTiles(reg, par);
    t.ok(tiles.some(function (p) { return p.x === mage.x && p.y === mage.y; }) && !tiles.some(function (p) { return p.x === rogue.x && p.y === rogue.y; }), 'checkerboard: mage on a marked square, rogue on an unmarked one');
    t.ok(tiles.every(function (p) { return (p.x + p.y) % 2 === par; }), 'every marked square has the same colour');
    const hm = mage.hp, hr = rogue.hp;
    cast(lich, 'lich_bookfall', { x: reg.cx, y: reg.cy }, { anchor: 'ground', tiles: tiles });
    t.eq(hm - mage.hp, 12, 'Bookfall deals 12 on a marked square');
    t.eq(rogue.hp, hr, 'Bookfall misses the unmarked square');
    // SHHHH!: radius 2, 10 + Silence; QUIET!!!: radius 3, 14
    const fresh = function () { [mage, rogue].forEach(function (h) { h.hp = h.maxHp; h.block = 0; h.statuses = []; }); };
    fresh();
    put(mage, 7, 4); put(rogue, 7, 6);
    const clerk = DD.Act.spawn('lich_intern', 8, 2, { noFx: true, silent: true });
    let a = mage.hp, b = rogue.hp;
    cast(lich, 'lich_shhh', lich, { anchor: 'self' });
    t.eq(a - mage.hp, 10, 'SHHHH! deals 10 within 2');
    t.ok(has(mage, 'silenced'), 'SHHHH! silences');
    t.eq(rogue.hp, b, 'SHHHH! misses 4 tiles away');
    t.ok(clerk && clerk.hp === clerk.maxHp, 'and spares his own staff (the desc says "each of his foes")');
    t.ok(/Each of his foes within 2 tiles/.test(DD.skillDesc(DD.getSkill('lich_shhh'), 1, null)), 'SHHHH! desc names who it hits');
    if (clerk) DD.Act.kill(clerk, null, { force: true });
    fresh();
    put(rogue, 7, 5);
    a = mage.hp; b = rogue.hp;
    cast(lich, 'lich_quiet', lich, { anchor: 'self' });
    t.eq(a - mage.hp, 14, 'QUIET!!! deals 14');
    t.eq(b - rogue.hp, 14, 'QUIET!!! reaches 3 tiles');
    t.ok(/\b14\b/.test(DD.skillDesc(DD.getSkill('lich_quiet'), 1, null)) && /\b3 tiles\b/.test(DD.skillDesc(DD.getSkill('lich_quiet'), 1, null)), 'QUIET!!! desc shows 14 and radius 3');
    // Final Notice: whole rows, 24
    fresh();
    put(mage, 5, 9); put(rogue, 5, 7);
    const row = []; for (let x = 0; x < f.s.grid.w; x++) if (DD.Grid.isWalkable(x, 9)) row.push({ x: x, y: 9 });
    a = mage.hp; b = rogue.hp;
    cast(lich, 'lich_final_notice', { x: 7, y: 9 }, { anchor: 'ground', tiles: row });
    t.eq(a - mage.hp, 24, 'Final Notice deals 24 on its row');
    t.eq(rogue.hp, b, 'Final Notice misses other rows');
    // aimed by the default AI (e.g. while charmed), Final Notice still covers two whole rows, as its desc says
    const fb = DD.Targeting.area(lich, DD.getSkill('lich_final_notice'), 1, { x: 7, y: 9 });
    const rowsHit = fb.map(function (p) { return p.y; }).filter(function (y, i, arr) { return arr.indexOf(y) === i; }).sort(function (a, b) { return a - b; });
    t.eq(rowsHit.join(), '9,10', 'fallback area: rows 9 and 10');
    t.ok(fb.length >= 2 * (f.s.grid.w - 2), 'whole rows (' + fb.length + ' tiles)');
    // intern stamp + mimic chomp
    fresh();
    const intern = DD.Act.spawn('lich_intern', 6, 9, { noFx: true, silent: true });
    a = mage.hp;
    cast(intern, 'lich_intern_stamp', mage, {});
    t.eq(a - mage.hp, 6, 'OVERDUE Stamp deals 6');
    t.ok(has(mage, 'marked') && DD.Act.getStatus(mage, 'marked').stacks === 3, 'and Marks 3');
    const mimic = DD.Act.spawn('lich_mimic', 4, 9, { noFx: true, silent: true });
    a = mage.hp;
    cast(mimic, 'lich_mimic_chomp', mage, {});
    t.eq(a - mage.hp, 7 + 3, 'Paperback Chomp deals 7 (+3 from the OVERDUE mark)');
    t.ok(has(mage, 'root'), 'and Roots');
    // every lich skill describes itself without a user at every level
    ['lich_overdue_notice', 'lich_bookfall', 'lich_shhh', 'lich_quiet', 'lich_interns', 'lich_final_notice', 'lich_intern_stamp', 'lich_mimic_chomp'].forEach(function (id) {
      const d = DD.getSkill(id);
      t.ok(d && d.levels.every(function (Lv, i) { const txt = DD.skillDesc(d, i + 1, null); return txt && (!Lv.dmg || new RegExp('\\b' + Lv.dmg + '\\b').test(txt)); }), id + ' desc shows its numbers');
    });
  });

  T.suite('bosses_act2: lich late fees and interest', function (t) {
    const f = lichFight(5);
    const lich = f.lich, hk = DD.getEnemy('lichtenstein').hooks, N = L().N;
    killAll('lich_intern');
    hk.onRoundStart(lich, 1);
    t.eq(L().fees(lich), 0, 'no fees in round 1');
    hk.onRoundStart(lich, 2);
    t.eq(L().fees(lich), N.feeRate, '+' + N.feeRate + ' in round 2');
    L().spawnInterns(lich, 1);
    hk.onRoundStart(lich, 3);
    t.eq(L().fees(lich), 2 * N.feeRate + 1, '+' + N.feeRate + ' and +1 per living intern (1)');
    killAll('lich_intern');
    L().waiveFees(lich);
    L().data(lich).phase = 2;
    hk.onRoundStart(lich, 4);
    t.eq(L().fees(lich), N.feeRate2, 'phase 2: +' + N.feeRate2 + ' a round');
    for (let r = 5; r <= 8; r++) hk.onRoundStart(lich, r);
    t.eq(L().fees(lich), N.feeCap, 'capped at ' + N.feeCap);
    t.ok(new RegExp('Grows by ' + N.feeRate + ' each round \\(' + N.feeRate2 + ' below half HP\\)').test(DD.getStatus('lich_late_fees').desc(DD.Act.getStatus(lich, 'lich_late_fees'))), 'status desc states the growth rates');
    // closing time: from round N.closing the cap lifts (no fight can stall forever)
    const s = f.s, r0 = s.round;
    s.round = N.closing;
    hk.onRoundStart(lich, N.closing);
    t.eq(L().fees(lich), N.feeCap + N.feeRate2, 'closing time: the fees grow past the cap');
    t.ok(L().data(lich).closing, 'closing time announced once');
    t.ok(/no max from round 13/.test(DD.getStatus('lich_late_fees').desc({ stacks: 3 })), 'the desc warns about closing time');
    s.round = r0;
    L().waiveFees(lich);
    L().addFees(lich, 20);
    t.eq(L().fees(lich), N.feeCap, 'before closing time the cap holds');
    // interest: ceil(fees × 0.75) per hero at the end of his turn, through Block
    const mage = hero('test_mage'), knight = hero('test_knight');
    DD.Act.addBlock(mage, 10);
    const heroes = DD.Combat.heroes().filter(function (h) { return !h.downed; });
    const before = heroes.map(function (h) { return h.hp; });
    hk.onTurnEnd(lich);
    const want = Math.ceil(N.feeCap * N.interest);
    t.ok(heroes.every(function (h, i) { return before[i] - h.hp === want; }), 'every hero pays ' + want + ' HP of interest');
    t.eq(mage.block, 10, 'interest ignores Block');
    t.ok(/pays 6 HP of interest/.test(DD.getStatus('lich_late_fees').desc(DD.Act.getStatus(lich, 'lich_late_fees'))), 'status desc states the interest');
    // a bone pile charges nothing; fees are waived by shredding (see the puzzle suite)
    L().waiveFees(lich);
    t.eq(L().fees(lich), 0, 'fees waived');
    const hp = knight.hp;
    hk.onTurnEnd(lich);
    t.eq(knight.hp, hp, 'no fees, no interest');
    // the planner's telegraphs carry the fees live (status telegraphFlat + DD.AI.intentDmg) and follow every change
    L().addFees(lich, 2);
    const mage2 = put(mage, 7, 5);
    put(lich, 7, 2);
    DD.AI.clearIntents(lich, false);
    DD.Act.resetCooldowns(lich);
    L().data(lich).turn = 0;
    DD.AI.plan(lich);
    const it = lich.intents.filter(function (i) { return i.skillId === 'lich_overdue_notice'; })[0];
    const fall = lich.intents.filter(function (i) { return i.skillId === 'lich_bookfall'; })[0];
    t.ok(it && fall, 'planned a notice and a Bookfall');
    t.ok(lich.intents.every(function (i) { return i.dmgAuto !== false; }), 'no frozen telegraph numbers: every intent uses the live value');
    t.eq(DD.AI.describe(lich, it).dmg, 13, 'telegraph shows 11 + 2');
    t.eq(DD.AI.describe(lich, fall).dmg, 14, 'the ⏳ Bookfall shows 12 + 2');
    L().waiveFees(lich);
    t.eq(DD.AI.describe(lich, it).dmg, 11, 'telegraph back to 11 when the fees are waived');
    // fees capped (addFees adds nothing): Weak on and off still moves every number, the ⏳ one included
    L().addFees(lich, 99);
    t.eq(L().fees(lich), N.feeCap, 'capped');
    DD.Act.addStatus(lich, 'weak', { turns: 1 }, mage);
    t.eq(DD.AI.describe(lich, fall).dmg, Math.round(12 * 0.75) + N.feeCap, 'a Weakened lich: the Bookfall telegraph drops to ' + (Math.round(12 * 0.75) + N.feeCap));
    DD.Act.removeStatus(lich, 'weak', { silent: true });
    t.eq(DD.AI.describe(lich, fall).dmg, 12 + N.feeCap, 'Weak gone before it lands: back to ' + (12 + N.feeCap));
  });

  T.suite('bosses_act2: lich pattern rotation and phase 2', function (t) {
    const f = lichFight(6);
    const lich = f.lich;
    killAll('lich_intern');
    const mage = hero('test_mage'), rogue = hero('test_rogue');
    parkHeroes([mage, rogue]);
    put(lich, 7, 2);
    put(mage, 7, 4); put(rogue, 8, 3);
    function planFresh() { DD.AI.clearIntents(lich, false); DD.Act.resetCooldowns(lich); killAll('lich_intern'); DD.AI.plan(lich); return ids(lich.intents); }
    const p1 = [planFresh(), planFresh(), planFresh(), planFresh()];
    t.log('phase 1: ' + JSON.stringify(p1));
    t.ok(p1[0].indexOf('overdue_notice') >= 0 && p1[0].indexOf('bookfall@1') >= 0, 'step 1: Overdue Notice + Bookfall (⏳1)');
    t.ok(p1[1].indexOf('shhh@1') >= 0 && p1[1].indexOf('interns') >= 0, 'step 2: SHHHH! (⏳1) + Unpaid Internship');
    t.eq(p1[2].filter(function (x) { return x === 'overdue_notice'; }).length, 2, 'step 3: Bulk Mailing (two notices)');
    t.eq(JSON.stringify(p1[3]), JSON.stringify(p1[0]), 'the rotation repeats');
    // a charging SHHHH! pins him in place
    DD.AI.clearIntents(lich, false);
    DD.AI.makeIntent(lich, 'lich_shhh', lich, { anchor: 'self', delay: 1, noCooldown: true });
    put(mage, 2, 9); put(rogue, 3, 9);
    const at = key(lich);
    DD.AI.plan(lich);
    t.eq(key(lich), at, 'he does not move while SHHHH! is charging');
    // phase 2 at half HP
    put(mage, 7, 4); put(rogue, 8, 3);
    lich.hp = Math.floor(lich.maxHp * 0.5);
    L().data(lich).turn = 0;
    const p2 = [planFresh(), planFresh(), planFresh()];
    t.log('phase 2: ' + JSON.stringify(p2));
    t.eq(L().data(lich).phase, 2, 'FINAL NOTICE: phase 2');
    t.ok(p2.every(function (l) { return l.filter(function (x) { return x === 'overdue_notice'; }).length === 2; }), 'phase 2: Bulk Mailing every turn');
    t.ok(p2[0].indexOf('bookfall@1') >= 0, 'Second Printing, wave 1: a checkerboard (⏳1)');
    t.ok(p2[1].indexOf('final_notice@1') >= 0, 'Final Notice (⏳1)');
    t.ok(p2[2].indexOf('quiet@1') >= 0, 'QUIET!!! (⏳1)');
    // the second printing covers the other squares of the same region
    planFresh(); // step 0 again: wave 1
    const w1 = lich.intents.filter(function (i) { return i.skillId === 'lich_bookfall'; })[0];
    DD.AI.executeIntent(lich, w1); // an enemy phase ticks it down: it lands next turn
    t.eq(w1.delay, 0, 'wave 1 is about to land');
    DD.AI.plan(lich); // the next planning keeps it and prints the other colour
    t.ok(lich.intents.some(function (i) { return i === w1; }), 'wave 1 kept');
    const waves = lich.intents.filter(function (i) { return i.skillId === 'lich_bookfall'; });
    t.eq(waves.length, 2, 'two waves');
    if (waves.length === 2) {
      const a = waves[0].tiles.map(key), b = waves[1].tiles.map(key);
      t.ok(a.every(function (k) { return b.indexOf(k) < 0; }), 'the waves never overlap');
      const pa = (waves[0].tiles[0].x + waves[0].tiles[0].y) % 2, pb = (waves[1].tiles[0].x + waves[1].tiles[0].y) % 2;
      t.ok(pa !== pb, 'opposite colours');
    }
    // every big hit is telegraphed a turn ahead: Bookfall / SHHHH! / QUIET!!! / Final Notice all plan with a delay
    t.ok(p1.concat(p2).every(function (l) { return l.every(function (x) { return !/^(bookfall|shhh|quiet|final_notice)$/.test(x); }); }), 'no area attack fires without a turn of warning');
  });

  T.suite('bosses_act2: lich puzzle: catalog, shelves, mimics, shredding', function (t) {
    const f = lichFight(7);
    const s = f.s, lich = f.lich;
    killAll('lich_intern');
    const mage = hero('test_mage'), rogue = hero('test_rogue'), knight = hero('test_knight');
    // the card catalog reveals the hidden phylactery nearest to the reader, once per round
    const cats = s.grid.tiles.filter(function (q) { return q.obj && q.obj.id === 'lich_catalog'; });
    const cat = cats[0];
    const spot = nextTo(cat.x, cat.y);
    put(mage, spot.x, spot.y);
    const ia = DD.Combat.interactions(mage).filter(function (x) { return x.x === cat.x && x.y === cat.y; })[0];
    t.ok(ia && ia.label === 'Look Up' && ia.ap === 1, 'Look Up (1 AP) offered next to the catalog');
    const hidden = L().hiddenPhylacteries().slice().sort(function (a, b) { return DD.Grid.dist(a, mage) - DD.Grid.dist(b, mage) || a.y - b.y || a.x - b.x; });
    t.ok(DD.AutoPlay && cat.obj && DD.getObject('lich_catalog').autoplay(mage, cat.obj) >= 10, 'AutoPlay hint: worth walking to');
    t.ok(DD.Combat.interact(mage, cat.x, cat.y), 'looked it up');
    t.ok(hidden[0].obj.data.revealed, 'the nearest hidden phylactery shelf glows');
    t.ok(/PHYLACTERY/.test(hidden[0].obj.label), 'its label says so: ' + hidden[0].obj.label);
    t.ok(/Search the glowing shelf/.test(s.objective.flavor), 'the subtitle moves on to the next step: ' + s.objective.flavor);
    t.eq(L().hiddenPhylacteries().length, 2, '2 still hidden');
    t.ok(!DD.Combat.interactions(mage).some(function (x) { return x.x === cat.x && x.y === cat.y; }), 'the catalog is jammed until next round');
    t.eq(DD.getObject('lich_catalog').autoplay(mage, cat.obj), 0, 'and its hint drops to 0');
    t.ok(DD.getObject('lich_catalog').autoplay(mage, cats[1].obj) > 0, 'the other catalog still works this round');
    // searching the revealed shelf: 25 damage, Stun, fees waived
    const shelf = hidden[0];
    t.eq(DD.getObject('lich_shelf').autoplay(rogue, shelf.obj), 48, 'a revealed phylactery is a top AutoPlay target');
    DD.Act.addStatus(lich, 'lich_late_fees', { stacks: 4, turns: -1, silent: true }, lich);
    DD.AI.makeIntent(lich, 'lich_overdue_notice', knight, { anchor: 'unit', noCooldown: true });
    const hp = lich.hp;
    t.ok(interactAt(rogue, shelf.x, shelf.y), 'searched the glowing shelf');
    t.eq(hp - lich.hp, L().N.phylactery, 'shredding a phylactery deals ' + L().N.phylactery);
    t.ok(has(lich, 'stun') && !lich.intents.length, 'and stuns him (his telegraphs are cancelled)');
    t.eq(L().fees(lich), 0, 'and waives the Late Fees');
    t.eq(L().fight().shredded, 1, '1 shredded');
    t.eq(L().phylacteryTiles().length, 2, '2 phylacteries left');
    t.ok(shelf.obj.data.searched && !DD.Combat.interactions(rogue).some(function (x) { return x.x === shelf.x && x.y === shelf.y; }), 'a searched shelf offers nothing more');
    t.eq(DD.getObject('lich_shelf').autoplay(rogue, shelf.obj), 0, 'its hint is 0');
    t.ok(/shredded 1 · left 2/.test(s.objective.flavor), 'objective subtitle updated: ' + s.objective.flavor);
    t.ok(/Look Up a Card Catalog/.test(s.objective.flavor), 'nothing glows any more: back to the catalog');
    // a mimic shelf bites
    const mim = shelvesWith('mimic')[0];
    const mhp = knight.hp;
    const mspot = nextTo(mim.x, mim.y);
    put(knight, mspot.x, mspot.y);
    knight.block = 0;
    knight.ap = 3;
    t.eq(DD.getObject('lich_shelf').autoplay(knight, mim.obj), 0, 'AutoPlay never gambles on an unrevealed shelf');
    t.ok(DD.Combat.interact(knight, mim.x, mim.y), 'searched a mimic shelf');
    const m = DD.Grid.unitAt(mim.x, mim.y);
    t.ok(m && m.defId === 'lich_mimic', 'IT\'S A MIMIC');
    t.eq(mhp - knight.hp, L().N.mimicSurprise - (knight.armor || 0), 'surprise bite (' + L().N.mimicSurprise + ', minus armor)');
    t.eq(L().fight().mimics, 1, 'mimic counted');
    // a boring shelf gives a small boon
    const dull = shelvesWith('empty')[0];
    mage.hp = mage.maxHp - 10; mage.block = 0;
    const b0 = mage.block, h0 = mage.hp;
    interactAt(mage, dull.x, dull.y);
    t.ok(mage.block === b0 + 5 || mage.hp === h0 + 5, 'a boring shelf: +5 Block or +5 HP');
    t.ok(/\+5 Block or \+5 HP/.test(DD.getObject('lich_shelf').desc), 'and the shelf desc says so');
    // breaking a phylactery shelf counts too
    const p2 = L().phylacteryTiles()[0];
    DD.Act.removeStatus(lich, 'stun', { silent: true });
    const hp2 = lich.hp;
    DD.Combat._action ? DD.Combat._action(function () { DD.Act.damageObject(mage, p2.x, p2.y, 8); }) : DD.Act.damageObject(mage, p2.x, p2.y, 8);
    t.ok(!tile(p2.x, p2.y).obj, 'the shelf is destroyed');
    t.eq(hp2 - lich.hp, L().N.phylactery, 'breaking a phylactery shelf shreds it (25 damage)');
    t.eq(L().fight().shredded, 2, '2 shredded');
    // breaking a mimic shelf releases the mimic
    const mim2 = shelvesWith('mimic')[0];
    DD.Act.damageObject(mage, mim2.x, mim2.y, 8);
    t.ok(DD.Grid.unitAt(mim2.x, mim2.y) && DD.Grid.unitAt(mim2.x, mim2.y).defId === 'lich_mimic', 'a broken mimic shelf releases its mimic');
  });

  T.suite('bosses_act2: lich bone pile, renewal and the final page', function (t) {
    let f = lichFight(8);
    let lich = f.lich;
    killAll('lich_intern');
    const knight = hero('test_knight');
    // lethal damage with phylacteries left: a pile of bones
    lich.hp = 5;
    DD.AI.makeIntent(lich, 'lich_overdue_notice', knight, { anchor: 'unit', noCooldown: true });
    DD.Act.damage(knight, lich, 20);
    t.ok(!lich.dead && lich.hp === 1, 'he collapses at 1 HP instead of dying');
    t.ok(has(lich, 'lich_bonepile') && has(lich, 'invulnerable'), 'Pile of Bones + Invulnerable');
    t.eq(lich.intents.length, 0, 'his telegraphs are gone');
    t.eq(DD.Act.damage(knight, lich, 50), 0, 'a pile of bones takes no damage');
    t.eq(L().phylacteryTiles().length, 3, 'collapsing does not burn a phylactery yet');
    t.eq(DD.Combat.state.result, null, 'the fight goes on');
    t.ok(/Pile of Bones and renews next turn/.test(DD.Combat.state.objective.flavor), 'the subtitle says what to do now: ' + DD.Combat.state.objective.flavor);
    // next planning: renewal (he was still in phase 1: the FINAL NOTICE banner comes with it)
    t.eq(L().data(lich).phase, 1, 'collapsed from phase 1');
    const logAt = DD.Combat.state.log.length;
    DD.AI.plan(lich);
    t.ok(DD.Combat.state.log.slice(logAt).some(function (l) { return /FINAL NOTICE/.test(l.text); }), 'renewing into phase 2 announces it');
    t.ok(!has(lich, 'lich_bonepile') && !has(lich, 'invulnerable'), 'reassembled');
    t.eq(lich.hp, Math.round(lich.maxHp * L().N.reformPct), 'renewed at 25% HP');
    t.eq(L().phylacteryTiles().length, 2, 'one phylactery burnt');
    t.eq(L().fight().spent, 1, 'spent 1');
    t.ok(L().shelves().some(function (q) { return q.obj.data.role === 'spent' && /Scorched/.test(q.obj.label); }), 'its shelf is scorched');
    t.ok(L().phylacteryTiles().some(function (q) { return q.obj.data.revealed; }), 'his soul\'s backup copy is revealed');
    t.eq(L().data(lich).phase, 2, 'renewed straight into phase 2');
    t.ok(lich.intents.length > 0, 'and he plans attacks again');
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
    // Mortal Again: the last phylactery shredded while he stands takes +50% damage for the rest of the fight
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
    t.ok(/left 0\. He is Mortal Again/.test(DD.Combat.state.objective.flavor), 'the subtitle says so (no stale catalog advice): ' + DD.Combat.state.objective.flavor);
    t.ok(/50% more damage/.test(DD.getStatus('lich_mortal').desc()), 'its desc states the bonus');
    lich.block = 0;
    const m0 = lich.hp;
    DD.Act.damage(null, lich, 10, { ignoreArmor: true });
    t.eq(m0 - lich.hp, Math.round(10 * (1 + L().N.mortal)), 'a 10-damage hit deals ' + Math.round(10 * (1 + L().N.mortal)));
    const kn = hero('test_knight');
    kn.ap = 3;
    const spot2 = nextTo(lich.x, lich.y);
    if (spot2) {
      put(kn, spot2.x, spot2.y);
      const pv = DD.Combat.preview(kn, kn.basic, lich.x, lich.y);
      const h1 = lich.hp;
      DD.Combat.useSkill(kn, kn.basic, lich.x, lich.y);
      t.eq(pv.perUnit[lich.id] && pv.perUnit[lich.id].dmg, h1 - lich.hp, 'hero previews include the Mortal bonus');
    }
    // a renewal that burns the LAST phylactery leaves him mortal too
    f = lichFight(18);
    lich = f.lich;
    const keep = L().phylacteryTiles()[0];
    L().shelves().forEach(function (q) { if (q !== keep && q.obj.data.role === 'phylactery') q.obj.data.role = 'empty'; });
    lich.hp = 2;
    DD.Act.damage(hero('test_knight'), lich, 9);
    t.ok(L().isBones(lich), 'collapsed with one phylactery left');
    DD.AI.plan(lich);
    t.ok(!L().isBones(lich) && L().phylacteryTiles().length === 0, 'renewed by burning the last one');
    t.ok(has(lich, 'lich_mortal'), 'and he is Mortal Again');
    // a dispelled Pile of Bones can't strand him invulnerable: he still renews at his next planning
    f = lichFight(19);
    lich = f.lich;
    lich.hp = 2;
    DD.Act.damage(hero('test_knight'), lich, 9);
    DD.Act.removeStatus(lich, 'lich_bonepile', { silent: true });
    t.ok(L().isBones(lich), 'still a pile of bones by his own records');
    DD.AI.plan(lich);
    t.ok(!has(lich, 'invulnerable') && lich.hp > 1, 'renewed and vulnerable again');
    // no phylacteries left: he simply dies
    f = lichFight(9);
    lich = f.lich;
    L().shelves().forEach(function (q) { if (q.obj.data.role === 'phylactery') q.obj.data.role = 'empty'; });
    lich.hp = 4;
    DD.Act.damage(hero('test_knight'), lich, 10);
    t.ok(lich.dead, 'without phylacteries he dies at 0 HP');
    // an instant kill still collapses him while phylacteries remain
    f = lichFight(10);
    lich = f.lich;
    // [phase 4, engine preventDeath] ...and none of a death happens first: no XP / gold tally, no kill Hype, no onKill,
    // no "is defeated!" log (the old onDeath un-kill came after all of them)
    const st0 = DD.Combat.state;
    const xp0 = st0.stats.xp || 0, gold0 = st0.stats.gold || 0, hype0 = st0.hype, logAt2 = st0.log.length;
    let kills = 0;
    DD.Act.addRule({ id: 'test_lich_kill_watch', name: 'test', hooks: { onKill: function (d) { if (d.target === lich) kills++; } } });
    DD.Act.kill(lich, hero('test_rogue'), { force: true });
    DD.Act.removeRule('test_lich_kill_watch');
    t.ok(!lich.dead && has(lich, 'lich_bonepile'), 'Act.kill on a renewable lich: a pile of bones instead');
    t.eq(DD.Combat.state.result, null, 'no premature victory');
    t.ok((st0.stats.xp || 0) === xp0 && (st0.stats.gold || 0) === gold0, 'no XP or gold tallied for a death that did not happen');
    t.eq(st0.hype, hype0, 'no kill Hype');
    t.eq(kills, 0, 'no onKill');
    t.ok(!st0.log.slice(logAt2).some(function (l) { return /is defeated/.test(l.text); }), 'no "is defeated!" line in the log');
  });

  T.suite('bosses_act2: lich minion caps and control resistance', function (t) {
    const f = lichFight(11);
    const lich = f.lich;
    t.eq(L().spawnInterns(lich, 10), 1, 'tops up to the cap only (2 alive + 1)');
    t.eq(units('lich_intern').length, L().N.internCap, 'never more than ' + L().N.internCap + ' interns');
    t.eq(L().spawnInterns(lich, 2), 0, 'at the cap: none');
    t.ok(units('lich_intern').every(function (u) { return DD.Grid.isWalkable(u.x, u.y, u); }), 'interns stand on walkable tiles');
    // over a long fight the cap holds
    const s = startBoss('boss_lichtenstein', 12, 7);
    let maxInterns = 0;
    for (let r = 0; r < 12 && !s.result; r++) {
      maxInterns = Math.max(maxInterns, units('lich_intern').length);
      DD.Combat.endTurn();
    }
    t.ok(maxInterns <= L().N.internCap, 'cap holds over 12 passive rounds (max ' + maxInterns + ')');
    // control: a stun buys him 2 turns of Speed-Reading
    const g = lichFight(13);
    const l2 = g.lich;
    t.ok(DD.Act.addStatus(l2, 'stun', { turns: 1 }, hero('test_knight')), 'the first stun lands');
    t.ok(has(l2, 'lich_focus'), 'Speed-Reading');
    DD.Act.removeStatus(l2, 'stun', { silent: true });
    t.eq(DD.Act.addStatus(l2, 'stun', { turns: 1 }, hero('test_knight')), null, 'a second stun is shrugged off');
    t.eq(DD.Act.addStatus(l2, 'frozen', { turns: 1 }, hero('test_knight')), null, 'so is freezing');
    t.eq(DD.Act.addStatus(l2, 'sleep', { turns: 2 }, hero('test_knight')), null, 'undead never sleep');
    // the puzzle's stun respects Speed-Reading (no stun-lock by shredding every round), its damage and waiver don't
    const ph = L().phylacteryTiles()[0];
    ph.obj.data.revealed = true;
    L().addFees(l2, 3);
    const hp0 = l2.hp;
    interactAt(hero('test_rogue'), ph.x, ph.y);
    t.ok(!has(l2, 'stun'), 'a phylactery shredded while he is Speed-Reading does not stun him');
    t.eq(hp0 - l2.hp, L().N.phylactery, 'but still deals ' + L().N.phylactery);
    t.eq(L().fees(l2), 0, 'and still waives the Late Fees');
    // a shred stun buys Speed-Reading like any other: the next shred can't stun either
    const g2 = lichFight(16);
    const l3 = g2.lich;
    const two = L().phylacteryTiles();
    two[0].obj.data.revealed = true; two[1].obj.data.revealed = true;
    interactAt(hero('test_rogue'), two[0].x, two[0].y);
    t.ok(has(l3, 'stun') && has(l3, 'lich_focus'), 'the first shred stuns him and he starts Speed-Reading');
    DD.Act.removeStatus(l3, 'stun', { silent: true });
    interactAt(hero('test_knight'), two[1].x, two[1].y);
    t.ok(!has(l3, 'stun'), 'a second shred right after does not stun him again');
    t.ok(/not while he is Speed-Reading/.test(DD.getObject('lich_shelf').desc), 'the shelf desc says so');
  });

  T.suite('bosses_act2: lich previews and telegraph honesty', function (t) {
    const f = lichFight(14);
    const lich = f.lich;
    const rogue = hero('test_rogue');
    const spot = nextTo(lich.x, lich.y);
    put(rogue, spot.x, spot.y);
    rogue.ap = 3;
    const slot = rogue.basic;
    const prev = DD.Combat.preview(rogue, slot, lich.x, lich.y);
    const hp = lich.hp;
    t.ok(prev && prev.perUnit[lich.id], 'a hero attack on the lich previews');
    DD.Combat.useSkill(rogue, slot, lich.x, lich.y);
    t.eq(prev.perUnit[lich.id].dmg, hp - lich.hp, 'preview == reality (' + (hp - lich.hp) + ')');
    // lethal with phylacteries left: the preview shows the collapse to 1 HP, not a kill
    lich.hp = 3;
    rogue.ap = 3;
    rogue.basic.cd = 0;
    const p2 = DD.Combat.preview(rogue, slot, lich.x, lich.y);
    t.ok(p2.perUnit[lich.id] && !p2.perUnit[lich.id].lethal && p2.perUnit[lich.id].dmg === 2, 'preview: 3 → 1 HP, not lethal');
    DD.Combat.useSkill(rogue, slot, lich.x, lich.y);
    t.ok(!lich.dead && lich.hp === 1, 'reality agrees');
    // AoE previews over the shelves don't throw
    const mage = hero('test_mage');
    const sh = L().shelves()[0];
    put(mage, sh.x, sh.y + 3 <= f.s.grid.h - 1 ? sh.y + 3 : sh.y - 3);
    mage.ap = 3;
    const fb = mage.skills.filter(function (q) { return q.id === 'test_fireball'; })[0];
    const tps = DD.Combat.targets(mage, fb);
    t.ok(t.tryRun('fireball previews', function () { tps.slice(0, 6).forEach(function (p) { DD.Combat.preview(mage, fb, p.x, p.y); }); return true; }), 'fireball previews near the shelves');
    // the NUMBERS on his telegraphs are what lands, with the Late Fees growing / capped / waived and a hero Weakening
    // him after he planned (for 1 or 2 turns, so some ⏳ attacks land after the Weak is gone)
    const nums = watchNumbers(function () {
      for (let k = 0; k < 3; k++) {
        startBoss('boss_lichtenstein', 40 + k, 7);
        weakenedAutoplay(L().findLich(), 14);
      }
    });
    t.ok(nums.checked > 20, 'checked ' + nums.checked + ' hits');
    t.eq(nums.bad.length, 0, 'every hit deals its telegraphed number' + (nums.bad.length ? ': ' + nums.bad.slice(0, 3).join('; ') : ''));
    // honesty: every enemy hit lands inside its telegraph over an AutoPlay fight
    const W = T.contentHelpers && T.contentHelpers.watchTelegraphs;
    if (!W) { t.log('content helpers not loaded: honesty check skipped'); return; }
    const w = W(function (w) {
      startBoss('boss_lichtenstein', 15, 7);
      w.arm();
      DD.AutoPlay.runBattle(12);
    });
    t.ok(w.intents > 10, 'watched ' + w.intents + ' intents');
    t.eq(w.violations.length, 0, 'telegraphs honest' + (w.violations.length ? ': ' + w.violations[0] : ''));
  });

  T.suite('bosses_act2: lich autoplay sims', function (t) {
    const n = +(t.param('n', 12)) || 12;
    const r = sims(t, 'boss_lichtenstein', n, 7, lichStats);
    t.eq(r.timeouts, 0, 'no timeouts');
    if (t.param('nopuzzle', '0') === '1') { t.log('puzzle ignored: ' + Math.round(r.rate * 100) + '% wins, ' + (r.agg.spent / r.n).toFixed(1) + ' renewals a fight'); return; }
    t.ok(r.per.every(function (st) { return st.lookups >= 1 && st.shredded >= 1; }), 'AutoPlay uses the Card Catalog and shreds phylacteries in every fight');
    t.ok(r.agg.shredded >= r.n * 2, 'on average 2+ phylacteries shredded per fight (' + (r.agg.shredded / r.n).toFixed(1) + ')');
    if (!t.param('tune', '') && !t.param('party', '')) t.ok(r.rate >= 0.2 && r.rate <= 0.85, 'win rate in the moderate band (' + Math.round(r.rate * 100) + '%)');
    t.ok(r.rounds <= 13, 'fights stay short (avg ' + r.rounds.toFixed(1) + ' rounds)');
  });

  // =================================================================================================================
  // Dr. Iris
  // =================================================================================================================
  function irisFight(seed, opts) {
    const s = startBoss('boss_dr_iris', seed || 3, 7, Object.assign({ noPlan: true }, opts || {}));
    return { s: s, iris: I().findIris() };
  }
  function mirrorAt(x, y) { const q = tile(x, y); return q && q.obj && q.obj.id === 'mirror' ? q.obj : null; }
  /** 9×9 sandbox: Dr. Iris at (4,4), heroes parked on the bottom row, optional objects. */
  function irisSandbox(objects) {
    DD.Combat.sandbox({
      w: 9, h: 9, seed: 7, noPlan: true, floor: 'marble',
      objective: { type: 'custom', text: 'Test' }, encounter: { id: 'ba2_iris_box', checkObjective: function () { return null; } },
      heroes: PARTY.map(function (id, i) { return { id: id, x: i, y: 8, level: 7 }; }),
      enemies: [{ id: 'dr_iris', x: 4, y: 4 }], objects: objects || [],
    });
    return I().findIris();
  }

  T.suite('bosses_act2: iris arena, registry and mirror setup', function (t) {
    const def = DD.getEnemy('dr_iris');
    t.ok(def && def.tier === 'boss' && def.act === 2 && def.boss && def.boss.title, 'dr_iris is an act 2 boss with a title');
    t.ok(def.hp >= 260 && def.hp <= 320, 'HP in range (' + def.hp + ')');
    t.ok(def.flags.immovable && def.flags.flying, 'she floats, anchored to her chair');
    const enc = DD.getEncounter('boss_dr_iris');
    t.ok(enc && enc.kind === 'boss' && enc.act === 2 && enc.objective.type === 'boss', 'boss encounter');
    const f = irisFight(3);
    t.ok(f.iris && f.iris.x === 6 && f.iris.y === 5, 'on her exam chair mid-room');
    t.eq(units('iris_floater').length, 1, 'one floater to start');
    const mirrors = f.s.grid.tiles.filter(function (q) { return q.obj && q.obj.id === 'mirror'; });
    t.eq(mirrors.length, 6, '6 Exam Mirrors');
    t.ok(mirrors.every(function (q) { return /^Exam Mirror \(2 quarter turns a round\)$/.test(q.obj.label) && typeof q.obj.autoplay === 'function' && typeof q.obj.onInteract === 'function' && typeof q.obj.available === 'function'; }), 'every mirror carries the puzzle callbacks, and its label states the turn budget');
    t.ok(['N', 'E', 'S', 'W'].every(function (n) { return !I().traceBeam(f.iris, { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } }[n]).self; }), 'no line bounces back at the start');
    // mirrors on her lines start 1-2 clockwise quarter turns short of facing her
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
  });

  T.suite('bosses_act2: iris beam tracing through mirrors and pillars', function (t) {
    const iris = irisSandbox([
      { x: 4, y: 1, id: 'mirror', data: { facing: 'S' } },
      { x: 7, y: 4, id: 'pillar' },
      { x: 4, y: 7, id: 'mirror', data: { facing: 'E' } },
      { x: 1, y: 4, id: 'mirror', data: { facing: 'E' } }, { x: 0, y: 4, id: 'mirror', data: { facing: 'E' } },
    ]);
    const tr = I().traceRay;
    let r = tr(iris, { x: 0, y: -1 });
    t.ok(r.self, 'north: the mirror facing south sends the ray straight back into her');
    t.eq(r.tiles.map(key).join(' '), '4,3 4,2 4,1 4,2 4,3 4,4', 'path out and back');
    r = tr(iris, { x: 1, y: 0 });
    t.eq(r.tiles.map(key).join(' '), '5,4 6,4', 'east: stopped by the pillar');
    r = tr(iris, { x: 0, y: 1 });
    t.eq(r.tiles.map(key).join(' '), '4,5 4,6 4,7 5,7 6,7 7,7 8,7', 'south: bent east by the mirror, out to the edge');
    t.ok(!r.self && r.mirrors.join() === '4,7', 'one bounce');
    r = tr(iris, { x: -1, y: 0 });
    t.ok(r.self, 'west: the mirror at 1,4 faces east, back into her');
    // the full beam: 3 rays, the side ones starting diagonally in front of her (her flanks stay safe)
    const b = I().traceBeam(iris, { x: 0, y: 1 });
    const ks = b.tiles.map(key);
    t.ok(ks.indexOf('3,5') >= 0 && ks.indexOf('5,5') >= 0, 'side rays start diagonally in front');
    t.ok(ks.indexOf('3,4') < 0 && ks.indexOf('5,4') < 0, 'the tiles beside her are safe');
    t.ok(ks.indexOf('3,8') >= 0 && ks.indexOf('5,8') >= 0, 'side rays run to the edge');
    t.ok(ks.indexOf('4,8') < 0, 'behind the south mirror is safe');
    // a mirror loop terminates
    irisSandbox([{ x: 4, y: 2, id: 'mirror', data: { facing: 'E' } }, { x: 6, y: 2, id: 'mirror', data: { facing: 'W' } }]);
    const loop = tr(I().findIris(), { x: 0, y: -1 });
    t.ok(loop.tiles.length < 40 && !loop.self, 'a mirror ping-pong terminates (' + loop.tiles.length + ' tiles)');
  });

  T.suite('bosses_act2: iris beam damage, reflection, flinch and nudge', function (t) {
    let iris = irisSandbox([{ x: 4, y: 1, id: 'mirror', data: { facing: 'S' } }]);
    const N = I().N;
    const mage = hero('test_mage'), rogue = hero('test_rogue');
    put(mage, 4, 6); put(rogue, 5, 6);
    const bdesc = DD.skillDesc(DD.getSkill('iris_eye_beam'), 1, null);
    t.ok(new RegExp('\\b' + N.beam + '\\b').test(bdesc) && new RegExp('\\b' + N.reflect + '\\b').test(bdesc), 'beam desc shows ' + N.beam + ' and ' + N.reflect);
    let a = mage.hp, b = rogue.hp;
    cast(iris, 'iris_eye_beam', { x: 4, y: 5 }, { anchor: 'self', dir: { x: 0, y: 1 } });
    t.eq(a - mage.hp, N.beam, 'a beam deals ' + N.beam + ' (central ray)');
    t.eq(b - rogue.hp, N.beam, 'and ' + N.beam + ' to the side ray');
    // reflection: her own beam, double-ish damage, she flinches (remaining intents cancelled), mirror remembered
    const mo = mirrorAt(4, 1);
    mo.data.turnedBy = rogue.id; mo.data.turnedAt = 1;
    const cone = DD.AI.makeIntent(iris, 'iris_antimagic', { x: 4, y: 5 }, { anchor: 'self', dir: { x: 0, y: 1 }, noCooldown: true });
    const it = DD.AI.makeIntent(iris, 'iris_eye_beam', { x: 4, y: 3 }, { anchor: 'self', dir: { x: 0, y: -1 }, noCooldown: true });
    const later = DD.AI.makeIntent(iris, 'iris_eye_beam', { x: 5, y: 4 }, { anchor: 'self', dir: { x: 1, y: 0 }, noCooldown: true });
    const ihp = iris.hp, rdmg = (DD.Combat.state.stats.units[rogue.id] || { dmg: 0 }).dmg;
    DD.AI.executeIntent(iris, it);
    t.eq(ihp - iris.hp, N.reflect, 'reflected: she takes ' + N.reflect);
    t.ok(iris.intents.indexOf(later) < 0, 'she flinches: her beams still to come fizzle');
    t.ok(iris.intents.indexOf(cone) >= 0, 'her other attacks are unaffected');
    DD.AI.clearIntents(iris, false);
    t.eq(I().fight().reflections, 1, 'reflection counted');
    t.eq(DD.Combat.state.stats.units[rogue.id].dmg - rdmg, N.reflect, 'credit goes to whoever angled the mirror');
    t.ok(I().data(iris).burned.indexOf('4,1') >= 0, 'the mirror is remembered');
    t.eq(I().nudgeMirrors(iris), 1, 'next planning she nudges it');
    t.eq(mo.data.facing, 'N', 'spun around (two quarter turns)');
    t.ok(!I().traceBeam(iris, { x: 0, y: -1 }).self, 'no longer lined up');
    // reflections never stun her (no lockout), and a dead-on line is never fired
    t.ok(!has(iris, 'stun'), 'no stun from a reflection');
    I().setFacing(mo, 'S');
    const d = I().data(iris);
    d.rot = 0; d.phase = 1;
    t.eq(I().beamDirs(d, iris).join(), 'E,S', 'she skips the line that already bounces back (N) for the next ones clockwise');
    d.phase = 2;
    t.eq(I().beamDirs(d, iris).join(), 'E,S,W', 'phase 2: three lines');
    // a beam crossing a floater hurts it too
    iris = irisSandbox([]);
    const fl = DD.Act.spawn('iris_floater', 4, 6, { noFx: true, silent: true });
    a = fl.hp;
    cast(iris, 'iris_eye_beam', { x: 4, y: 5 }, { anchor: 'self', dir: { x: 0, y: 1 } });
    t.eq(a - fl.hp, Math.min(a, N.beam), 'floaters in the line get hit too');
  });

  T.suite('bosses_act2: iris telegraph follows the mirrors (live, honest)', function (t) {
    const f = irisFight(21);
    const iris = f.iris;
    killAll('iris_floater');
    const knight = hero('test_knight'), mage = hero('test_mage');
    parkHeroes([knight, mage]);
    // a south beam: the south mirror (6,8) decides where it goes
    const south = mirrorAt(6, 8);
    I().setFacing(south, 'E');
    const it = DD.AI.makeIntent(iris, 'iris_eye_beam', { x: 6, y: 6 }, { anchor: 'self', dir: { x: 0, y: 1 }, noCooldown: true });
    const before = DD.AI.intentTiles(iris, it).map(key);
    t.ok(before.indexOf('8,8') >= 0 && before.indexOf('6,9') < 0, 'mirror facing east: the telegraph bends east along row 8');
    put(mage, 8, 8);
    put(knight, 6, 9);
    knight.ap = 3;
    // the knight turns the mirror from the tile below it: E -> S, the beam now runs down column 6
    t.ok(DD.Combat.interact(knight, 6, 8), 'rotated');
    t.eq(south.data.facing, 'S', 'now facing south');
    const after = DD.AI.intentTiles(iris, it).map(key);
    t.ok(after.indexOf('6,9') >= 0 && after.indexOf('8,8') < 0, 'the telegraph follows the mirror at once');
    knight.block = 0; mage.block = 0;
    const a = mage.hp, b = knight.hp;
    DD.AI.executeIntent(iris, it);
    t.eq(mage.hp, a, 'the old path is safe');
    t.eq(b - knight.hp, I().N.beam - (knight.armor || 0), 'the new path is hit (minus armor)');
    // two quarter turns per mirror per round (the label shows the budget in the tile inspect)
    t.ok(/1 more quarter turn this round/.test(south.label), 'label after one turn: ' + south.label);
    knight.ap = 3;
    t.ok(DD.Combat.interact(knight, 6, 8), 'second turn this round');
    t.ok(!DD.Combat.interactions(knight).some(function (x) { return x.x === 6 && x.y === 8; }), 'a third is refused');
    t.ok(/creaky/.test(south.label), 'label: creaky');
    t.eq(I().mirrorHint(knight, south), 0, 'and AutoPlay knows it');
    t.eq(I().fight().rotations, 2, 'rotations counted');
    south.onRoundEnd(south);
    t.ok(/2 quarter turns a round/.test(south.label), 'the label resets at the end of the round');
  });

  T.suite('bosses_act2: iris eye exam, anti-magic cone and disintegrate', function (t) {
    // the tumbling E: 17 cells in a 5×5 box, 4 distinct orientations, the gaps are safe
    const g = [0, 1, 2, 3].map(function (r) { return I().eGlyph(5, r).map(function (p) { return p.dx + ',' + p.dy; }).sort().join(' '); });
    t.ok(g.every(function (x) { return x.split(' ').length === 17; }), 'every E has 17 cells');
    t.eq(new Set(g).size, 4, '4 distinct orientations');
    const e0 = I().eGlyph(5, 0).map(function (p) { return p.dx + ',' + p.dy; });
    t.ok(['1,1', '2,1', '3,1', '4,1', '1,3', '2,3', '3,3', '4,3'].every(function (k) { return e0.indexOf(k) < 0; }), 'the two gaps of the E are safe');
    const iris = irisSandbox([{ x: 6, y: 2, id: 'pillar' }]);
    const mage = hero('test_mage'), rogue = hero('test_rogue'), cleric = hero('test_cleric');
    const tiles = I().examTiles(2, 2, 0, 5);
    t.ok(tiles.length === 17 && tiles.every(function (p) { return DD.Grid.inBounds(p.x, p.y); }), 'exam tiles inside the grid');
    put(mage, 0, 0); put(rogue, 1, 1); // (0,0) spine, (1,1) a gap
    let a = mage.hp, b = rogue.hp;
    cast(iris, 'iris_eye_exam', { x: 2, y: 2 }, { anchor: 'ground', tiles: tiles });
    t.eq(a - mage.hp, I().N.exam, 'Eye Exam deals ' + I().N.exam + ' on the E');
    t.eq(rogue.hp, b, 'the gap is safe');
    // anti-magic cone: 7 + Silenced
    put(mage, 4, 6); put(rogue, 0, 6);
    a = mage.hp; b = rogue.hp;
    cast(iris, 'iris_antimagic', { x: 4, y: 5 }, { anchor: 'self', dir: { x: 0, y: 1 } });
    t.eq(a - mage.hp, I().N.cone, 'Anti-Magic Cone deals ' + I().N.cone);
    t.ok(has(mage, 'silenced'), 'and Silences');
    t.eq(rogue.hp, b, 'outside the cone: nothing');
    // Disintegrate: charges for 2 enemy turns, then 26; a pillar between you and her saves you
    put(cleric, 4, 1);
    const it = DD.AI.makeIntent(iris, 'iris_disintegrate', cleric, { anchor: 'unit', delay: 2, noCooldown: true });
    const c0 = cleric.hp;
    DD.AI.executeIntent(iris, it);
    DD.AI.executeIntent(iris, it);
    t.eq(cleric.hp, c0, 'still charging after two counts');
    t.eq(it.delay, 0, 'charged');
    DD.AI.executeIntent(iris, it);
    t.eq(c0 - cleric.hp, I().N.disintegrate, 'Disintegrate deals ' + I().N.disintegrate);
    cleric.hp = cleric.maxHp;
    put(cleric, 7, 4);
    t.ok(DD.Grid.los(iris, cleric), 'targeted in the open');
    const it2 = DD.AI.makeIntent(iris, 'iris_disintegrate', cleric, { anchor: 'unit', noCooldown: true });
    put(cleric, 8, 0);
    t.ok(!DD.Grid.los(iris, cleric), 'then hides behind the pillar at (6,2)');
    const c1 = cleric.hp;
    DD.AI.executeIntent(iris, it2);
    t.eq(cleric.hp, c1, 'behind the pillar: Disintegrate fizzles');
  });

  T.suite('bosses_act2: iris pattern rotation and phase 2', function (t) {
    const f = irisFight(23);
    const iris = f.iris;
    killAll('iris_floater');
    const d = I().data(iris);
    d.rot = 0; d.turn = 0;
    function planFresh() { DD.AI.clearIntents(iris, false); DD.Act.resetCooldowns(iris); killAll('iris_floater'); DD.AI.plan(iris); return iris.intents; }
    // patients in the waiting area just south of her (in reach of the cone)
    const hs = DD.Combat.heroes();
    put(hs[0], 5, 7); put(hs[1], 6, 7); put(hs[2], 7, 7); put(hs[3], 6, 9);
    const seq = [];
    for (let i = 0; i < 4; i++) {
      const its = planFresh();
      seq.push({ beams: its.filter(function (x) { return x.skillId === 'iris_eye_beam'; }).map(function (x) { return x.label.slice(-2, -1); }).join(''), all: ids(its) });
    }
    t.log(JSON.stringify(seq));
    t.eq(seq.map(function (x) { return x.beams; }).join(' '), 'NE ES SW WN', 'the lighthouse turns clockwise, two lines at a time');
    t.ok(seq[0].all.indexOf('eye_exam@1') >= 0, 'step 1: Eye Exam (⏳1)');
    t.ok(seq[1].all.indexOf('antimagic') >= 0, 'step 2: Anti-Magic Cone');
    t.ok(seq[2].all.indexOf('disintegrate@2') >= 0 && seq[2].all.indexOf('next_patient') >= 0, 'step 3: Disintegrate (⏳2) + floaters');
    t.ok(seq[0].all.slice(-2).every(function (x) { return x === 'eye_beam'; }), 'beams are planned last (a reflection makes her flinch out of the rest)');
    // phase 2
    iris.hp = Math.floor(iris.maxHp * 0.5);
    d.turn = 0;
    const p2 = planFresh();
    t.eq(d.phase, 2, 'SECOND OPINION');
    t.eq(p2.filter(function (x) { return x.skillId === 'iris_eye_beam'; }).length, 3, 'three beams a turn');
    const heroes = DD.Combat.heroes();
    put(heroes[0], 1, 10); put(heroes[1], 2, 10); put(heroes[2], 11, 2); put(heroes[3], 12, 3);
    d.turn = 0;
    const p3 = planFresh();
    t.eq(p3.filter(function (x) { return x.skillId === 'iris_eye_exam'; }).length, 2, 'two Eye Exams for two groups of patients');
    t.ok(p3.filter(function (x) { return x.skillId === 'iris_eye_exam'; }).every(function (x) { return x.delay === 1; }), 'both telegraphed a turn ahead');
  });

  T.suite('bosses_act2: iris clinical gaze, x-ray, overtime and closing time', function (t) {
    const f = irisFight(25);
    const iris = f.iris, s = f.s, N = I().N;
    killAll('iris_floater');
    const hk = DD.getEnemy('dr_iris').hooks;
    const knight = hero('test_knight'), mage = hero('test_mage'), rogue = hero('test_rogue'), cleric = hero('test_cleric');
    put(mage, 6, 3);   // in sight, 2 tiles
    put(rogue, 2, 3);  // behind the pillar at (3,3), 6 tiles away
    put(knight, 12, 11); // far away
    put(cleric, 1, 11); // out of range, out of the way
    [mage, rogue, knight, cleric].forEach(function (h) { h.hp = h.maxHp; h.block = 0; });
    t.ok(!DD.Grid.los(iris, rogue) && DD.Grid.dist(iris, rogue) <= N.gazeRange, 'the rogue is in reach but behind the pillar');
    // the gaze is shown on her as a status with the live numbers
    t.ok(has(iris, 'iris_gaze'), 'Clinical Gaze is on her from the start');
    const gdesc = function () { return DD.getStatus('iris_gaze').desc(DD.Act.getStatus(iris, 'iris_gaze')); };
    t.ok(new RegExp('within ' + N.gazeRange + ' tiles takes ' + N.gaze + ' damage').test(gdesc()), 'status desc: ' + gdesc());
    t.ok(/Pillars and mirrors block her view/.test(gdesc()), 'and says what blocks it');
    t.ok(/Pillars and mirrors block her gaze/.test(s.objective.flavor), 'so does the objective subtitle: ' + s.objective.flavor);
    const hp = [mage.hp, rogue.hp, knight.hp];
    hk.onTurnEnd(iris);
    t.eq(hp[0] - mage.hp, N.gaze, 'a hero in sight within 6 takes ' + N.gaze);
    // dispel the status: no gaze that turn; she puts it back on at her next planning
    DD.Act.removeStatus(iris, 'iris_gaze', { silent: true });
    mage.hp = mage.maxHp;
    hk.onTurnEnd(iris);
    t.eq(mage.hp, mage.maxHp, 'dispelled: no gaze this turn');
    DD.AI.plan(iris);
    t.ok(has(iris, 'iris_gaze'), 'back at her next planning');
    DD.AI.clearIntents(iris, false);
    mage.hp = mage.maxHp;
    t.eq(rogue.hp, hp[1], 'behind a pillar: hidden');
    t.eq(knight.hp, hp[2], 'out of range: hidden');
    // phase 2: x-ray sees through pillars, not mirrors
    I().data(iris).phase = 2;
    [mage, rogue].forEach(function (h) { h.hp = h.maxHp; });
    hk.onTurnEnd(iris);
    t.eq(mage.maxHp - mage.hp, N.gaze2, 'phase 2 gaze: ' + N.gaze2);
    t.eq(rogue.maxHp - rogue.hp, N.gaze2, 'x-ray: the pillar no longer hides the rogue');
    put(rogue, 6, 9); // straight behind the south mirror (6,8)
    rogue.hp = rogue.maxHp;
    hk.onTurnEnd(iris);
    t.eq(rogue.hp, rogue.maxHp, 'a mirror still blocks the x-ray gaze');
    t.ok(/only mirrors block her view/.test(gdesc()), 'the status desc switches to X-ray');
    DD.AI.plan(iris);
    DD.AI.clearIntents(iris, false);
    t.ok(/X-ray gaze: only a mirror/.test(s.objective.flavor) && !/Pillars/.test(s.objective.flavor), 'the subtitle stops promising pillar cover: ' + s.objective.flavor);
    // overtime: +1 range a round after round N.overtime; closing time after round N.closing: no cover, +2 damage a round
    s.round = N.overtime + 4;
    t.eq(I().gazeRange(), N.gazeRange + 4, 'overtime: range ' + (N.gazeRange + 4) + ' in round ' + s.round);
    s.round = N.closing + 2;
    const late = N.gaze2 + 4;
    t.ok(new RegExp('takes ' + late + ' damage\\. Closing time').test(gdesc()), 'the status desc shows closing time: ' + gdesc());
    [rogue, knight].forEach(function (h) { h.hp = h.maxHp; });
    hk.onTurnEnd(iris);
    t.eq(rogue.maxHp - rogue.hp, late, 'closing time: through mirrors, ' + late + ' damage');
    t.eq(knight.maxHp - knight.hp, late, 'and everywhere in reach');
    DD.AI.plan(iris);
    DD.AI.clearIntents(iris, false);
    t.ok(new RegExp('Closing time: .*\\(' + late + ' damage a turn\\)').test(s.objective.flavor), 'closing time in the subtitle: ' + s.objective.flavor);
  });

  T.suite('bosses_act2: iris minion cap and squinting', function (t) {
    const f = irisFight(27);
    const iris = f.iris;
    t.eq(I().spawnFloaters(iris, 10), 2, 'tops up to the cap only');
    t.eq(units('iris_floater').length, I().N.floaterCap, 'never more than ' + I().N.floaterCap + ' floaters');
    t.eq(I().spawnFloaters(iris, 2), 0, 'at the cap: none');
    t.ok(units('iris_floater').every(function (u) { return u.flags.flying; }), 'floaters fly');
    // floater blur: 4 + dazzle
    const fl = units('iris_floater')[0], mage = hero('test_mage');
    const spot = nextTo(fl.x, fl.y);
    put(mage, spot.x, spot.y);
    const a = mage.hp;
    cast(fl, 'iris_floater_blur', mage, { anchor: 'unit' });
    t.eq(a - mage.hp, I().N.floaterDmg, 'Blurry Vision deals ' + I().N.floaterDmg);
    t.ok(has(mage, 'dazzled'), 'and Dazzles');
    // squint: one stun, then 3 turns of immunity
    t.ok(DD.Act.addStatus(iris, 'stun', { turns: 1 }, mage), 'the first stun lands');
    t.ok(has(iris, 'iris_squint'), 'she squints');
    DD.Act.removeStatus(iris, 'stun', { silent: true });
    t.eq(DD.Act.addStatus(iris, 'stun', { turns: 1 }, mage), null, 'a second stun is shrugged off');
    t.eq(DD.Act.addStatus(iris, 'sleep', { turns: 1 }, mage), null, 'doctors never sleep on the job');
    // over a long fight the cap holds
    const s = startBoss('boss_dr_iris', 28, 7);
    let maxF = 0;
    for (let r = 0; r < 10 && !s.result; r++) { maxF = Math.max(maxF, units('iris_floater').length); DD.Combat.endTurn(); }
    t.ok(maxF <= I().N.floaterCap, 'cap holds over 10 passive rounds (max ' + maxF + ')');
  });

  T.suite('bosses_act2: iris mirror hints for AutoPlay', function (t) {
    const iris = irisSandbox([{ x: 4, y: 1, id: 'mirror', data: { facing: 'E' } }]);
    I().setupClinic(DD.Combat.state);
    const mo = mirrorAt(4, 1);
    I().setFacing(mo, 'E');
    DD.AI.makeIntent(iris, 'iris_eye_beam', { x: 4, y: 3 }, { anchor: 'self', dir: { x: 0, y: -1 }, noCooldown: true });
    const knight = hero('test_knight');
    const h1 = I().mirrorHint(knight, mo);
    t.ok(h1 >= 20, 'one turn from bouncing her beam back: a strong hint (' + h1 + ')');
    put(knight, 3, 1);
    knight.ap = 3;
    t.ok(DD.Combat.interact(knight, 4, 1), 'turned');
    t.ok(I().traceBeam(iris, { x: 0, y: -1 }).self, 'lined up');
    t.eq(I().mirrorHint(knight, mo), 0, 'already lined up: hint 0');
    DD.Combat.state.round++; // a new round: two fresh quarter turns
    I().setFacing(mo, 'N');
    knight.ap = 3;
    t.ok(I().mirrorHint(knight, mo) > 0, 'two turns away: still worth it (two turns a round)');
    DD.Combat.interact(knight, 4, 1);
    t.ok(I().mirrorHint(knight, mo) > 0, 'one turn left this round, one turn away: still worth it');
    knight.ap = 3;
    DD.Combat.interact(knight, 4, 1);
    t.ok(I().traceBeam(iris, { x: 0, y: -1 }).self, 'lined up with the second turn');
    t.eq(I().mirrorHint(knight, mo), 0, 'lined up and out of turns: 0');
    DD.AI.clearIntents(iris, false);
    I().setFacing(mo, 'E');
    t.eq(I().mirrorHint(knight, mo), 0, 'no beam telegraphed: 0');
    // AutoPlay actually does it
    const f = irisFight(29);
    DD.AI.plan(f.iris);
    const rot0 = I().fight().rotations;
    for (let r = 0; r < 4 && !f.s.result; r++) { DD.AutoPlay.takeTurn(); DD.Combat.endTurn(); }
    t.ok(I().fight().rotations > rot0, 'AutoPlay turns mirrors (' + I().fight().rotations + ' turns in 4 rounds)');
  });

  T.suite('bosses_act2: iris previews and telegraph honesty', function (t) {
    const f = irisFight(31);
    const iris = f.iris;
    const rogue = hero('test_rogue');
    put(rogue, iris.x - 1, iris.y);
    rogue.ap = 3;
    const prev = DD.Combat.preview(rogue, rogue.basic, iris.x, iris.y);
    const hp = iris.hp;
    DD.Combat.useSkill(rogue, rogue.basic, iris.x, iris.y);
    t.ok(prev.perUnit[iris.id] && prev.perUnit[iris.id].dmg === hp - iris.hp, 'preview == reality (' + (hp - iris.hp) + ')');
    // telegraph numbers are live: a Weak applied after she planned lowers them at once, and a ⏳ Disintegrate planned
    // while she was Weak shows (and deals) the full number once the Weak is gone
    const g = irisFight(33);
    const ir = g.iris;
    killAll('iris_floater');
    const N = I().N;
    put(hero('test_mage'), ir.x, ir.y + 2);
    DD.Act.addStatus(ir, 'weak', { turns: 1 }, null);
    I().data(ir).turn = 2; // step 3: Disintegrate (⏳2) + floaters, then the beams
    DD.AI.plan(ir);
    const dis = ir.intents.filter(function (i) { return i.skillId === 'iris_disintegrate'; })[0];
    const beam = ir.intents.filter(function (i) { return i.skillId === 'iris_eye_beam'; })[0];
    t.ok(dis && beam, 'planned a Disintegrate and beams while Weak');
    t.ok(ir.intents.every(function (i) { return i.dmgAuto !== false; }), 'no frozen telegraph numbers');
    t.eq(DD.AI.describe(ir, dis).dmg, Math.round(N.disintegrate * 0.75), 'Weak: Disintegrate shows ' + Math.round(N.disintegrate * 0.75));
    DD.Act.removeStatus(ir, 'weak', { silent: true });
    t.eq(DD.AI.describe(ir, dis).dmg, N.disintegrate, 'Weak gone: it shows the full ' + N.disintegrate + ' again');
    DD.Act.addStatus(ir, 'weak', { turns: 1 }, null);
    t.eq(DD.AI.describe(ir, beam).dmg, Math.round(N.beam * 0.75), 'Weakened after planning: the beam shows ' + Math.round(N.beam * 0.75));
    const nums = watchNumbers(function () {
      for (let k = 0; k < 3; k++) {
        startBoss('boss_dr_iris', 44 + k, 7);
        weakenedAutoplay(I().findIris(), 14);
      }
    });
    t.ok(nums.checked > 20, 'checked ' + nums.checked + ' hits');
    t.eq(nums.bad.length, 0, 'every hit deals its telegraphed number' + (nums.bad.length ? ': ' + nums.bad.slice(0, 3).join('; ') : ''));
    const W = T.contentHelpers && T.contentHelpers.watchTelegraphs;
    if (!W) { t.log('content helpers not loaded: honesty check skipped'); return; }
    const w = W(function (w) {
      startBoss('boss_dr_iris', 32, 7);
      w.arm();
      DD.AutoPlay.runBattle(12);
    });
    t.ok(w.intents > 10, 'watched ' + w.intents + ' intents');
    t.eq(w.violations.length, 0, 'telegraphs honest (mirrors rotated mid-turn included)' + (w.violations.length ? ': ' + w.violations[0] : ''));
  });

  T.suite('bosses_act2: zz calibration', function (t) {
    if (!t.param('calib', '')) { t.skip('calib=<encounter id> only'); return; }
    sims(t, t.param('calib', ''), +(t.param('n', 12)) || 12, +(t.param('level', 7)) || 7, function (s) { return { downs: s.stats.downs || 0 }; });
    t.ok(true, 'ran');
  });

  T.suite('bosses_act2: iris autoplay sims', function (t) {
    const n = +(t.param('n', 12)) || 12;
    const r = sims(t, 'boss_dr_iris', n, 7, irisStats);
    t.eq(r.timeouts, 0, 'no timeouts');
    if (t.param('nopuzzle', '0') === '1') { t.log('puzzle ignored: ' + Math.round(r.rate * 100) + '% wins, ' + (r.agg.reflections / r.n).toFixed(1) + ' accidental reflections a fight'); return; }
    t.ok(r.per.every(function (st) { return st.reflections >= 1; }), 'AutoPlay bounces at least one beam back into her in every fight');
    t.ok(r.agg.reflections >= r.n * 2, 'on average 2+ reflections per fight (' + (r.agg.reflections / r.n).toFixed(1) + ')');
    if (!t.param('tune', '') && !t.param('party', '')) t.ok(r.rate >= 0.2 && r.rate <= 0.85, 'win rate in the moderate band (' + Math.round(r.rate * 100) + '%)');
    t.ok(r.rounds <= 13, 'fights stay short (avg ' + r.rounds.toFixed(1) + ' rounds)');
  });
})();
