/* Dungeons and Degenerates — tests/sim/sim.js (not a test suite; loaded by tests/sim/sim.html, run by tools/sim.sh)
 * Whole-campaign balance simulation: DD.Run + DD.AutoPlay play full runs (DD.finalAct() acts: v2's three, or V3's four
 * with Svammiel's gauntlet) with random 4-hero parties drawn from every registered hero (all unlocked), items,
 * consumables and Blessings in play, one headless page, seeds one after another.
 * Params (URL query):
 *   seeds=N from=S        runs (seeds S..S+N-1)          diff=casual|normal|brutal
 *   maxr=30               round cap per fight             timeout=victory|defeat (how a capped fight ends)
 *   party=a,b,c,d         fixed party (else random 4 of all N registered heroes)
 *   route=smart|random    node choice: smart = shops when rich, taverns when hurt, elites when healthy (default)
 *   stop=N                end each run after clearing act N (quick act-1 / act-2 checks; default: the last act)
 *   acts=N                sugar for bal=campaign.acts:N (acts=3: the v2 comparison after the flip)
 *   start=N               each run fast-forwards to act N right after newRun (DD.Run.startAtAct: act-4-only sims);
 *   level=L gold=G          its party level and gold (a gauntlet act defaults to level 5 and 450 gold)
 *   order=random|fixed:a,b,…|lowhp   the gauntlet's door order: random (default); fixed: the first open lane in that list
 *                         (lanes left out follow in the registry's order); lowhp: the lane the party has the best record
 *                         against so far on this page (a weak "smart" player)
 *   cameo=0               Svammiel stays home: DD.Balance.cameo.off = 1 (no start cameo, no cameo cheat; his own fight's
 *                         cheats are its mechanics and stay), to measure what the cameo cheats cost
 *   bal=path:value,...    DD.Balance overrides for this page, e.g. bal=act.1.hp:1.3,hype.dealtPer:6,gold.fight.normal:[10,16]
 *   verbose=1             one line per run      json=1   raw per-fight records in #json
 *   healers=a,b           boss results are split by these heroes in the party (default ellaria,josiah); also the healer
 *                         groups of the heal-pass sections (e.g. healers=ellaria,josiah,valdris)
 *   dump=1                print the units left and the last 40 log lines of every fight that hit the round cap
 *   raw=1                 append "== raw tallies": R<TAB>key<TAB>value lines of additive counts (runs, wins, act clears,
 *                         per hero, per healer group, bosses, encounters, lanes), to merge 100-seed pages with a sum
 * Output (#out): campaign win rate (Wilson 95% interval) and its 3-act equivalent, act clears, levels at bosses, per-kind
 * table (party HP lost, rounds, short wins, fights with downs, signatures, Hype by source, attacks of opportunity, boss
 * wind-ups), encounter table, the gauntlet (per lane with each door's puzzle counters, by position 1..L, order
 * frequency), the Svammiel table, cameos and cheats per act-4 fight (an error line on any budget violation), act-4
 * deaths and rounds per run, downs by cause, per-hero run wins, skill usage, gold flow. Counting wrappers
 * (Combat.useSkill etc.) are installed on this page only.
 * Heal pass (Nov 18), own sections after "== heroes": "== healing per hero" (per fight the hero started: damage taken,
 * downs, fights ended down, permanent deaths, Block gained; HP healed RECEIVED by source - self (his or her own kit),
 * hero item, gear, Blessings / scars, consumables, allies (top givers), other - with the overheal on the hero and the
 * revives; HP healed DONE on other heroes (by channel), on himself / herself, on summons, its overheal, help-ups given),
 * "== hero shares" (run wins and act-(L-1) clears with Wilson intervals and the ratio to the median), "== where each
 * hero's runs end" (losses by act and the last fight), "== healer groups" (healers=: runs, wins, act clears, Svammiel,
 * what the losses lost to; 'none' = no healer in the starting party) and the permanent deaths by fight. The ledger
 * wraps DD.Act.heal / revive / addBlock, Combat.interact, DD.Hooks.fire / fireOwn / some and DD.safe (for the channel:
 * the innermost hook or execute frame) on this page only.
 * Stalls (balance audit, audit-4): a fight that hits the round cap is a STALL, neither a win nor a loss. timeout= only
 * decides how the run goes on; every win rate (encounters, fight kinds, bosses, lanes, the campaign, hero shares) leaves
 * stalls out of both sides, and the "== stalls" section lists each one. A run is a stalled run when its result hangs on a
 * stall's call (it won after one, or it ended on one); a run lost to a real fight after a stall is still a loss.
 * The tallies and the report are exposed as window.DD_SIM (tools suite in tests/docs_tests.js, integration suite); the
 * sim only starts on a page with a <pre id="out"> (tests/sim/sim.html), so the test page can load this file.
 * Policies: level-ups learn until 4 skills then upgrade (15% random); a new skill never replaces one tagged 'shapeshift'
 * (Benedick's shell, Basanos's Transform and Blood Moon, Ellaria's Wild Shape: plan §7.2); loot by a simple score; gear
 * upgrades equipped; shop: heal under 60% HP, the Bribe with 200+ gold (gauntlet shops; never with cameo=0: no door
 * cheat to skip), items that beat a hero's gear (best rarity first), tomes for heroes with < 4 skills, consumables with
 * spare gold, a Blessing re-roll when rich;
 * tavern: recruit over the dead, rest under 75% HP or with 2+ scars, else train; gauntlet stops: a tavern under 70% HP
 * or with 2+ scars, a shop with 120+ gold, else an event; events at random; every fight by DD.AutoPlay.runBattle(maxr).
 */
(function () {
  'use strict';
  const DD = window.DD;
  document.addEventListener('dd:loaded', function () { if (document.getElementById('out')) setTimeout(start, 30); });
  const P = DD.params || {};
  const SEEDS = +(P.seeds || 4), FROM = +(P.from || 0), DIFF = P.diff || 'normal', MAXR = +(P.maxr || 30);
  const ON_TIMEOUT = P.timeout || 'victory';
  const ROUTE = P.route || 'smart';
  const ORDER = String(P.order || 'random');
  const START = Math.max(1, Math.floor(+(P.start || 1)) || 1);
  const LEVEL = P.level ? Math.floor(+P.level) || null : null;
  const GOLD = P.gold !== undefined && P.gold !== '' && isFinite(+P.gold) ? +P.gold : null;
  const HEALERS = String(P.healers || 'ellaria,josiah').split(',');
  // the last act and the stop: read from DD.finalAct() once the page's overrides are in (start()); these defaults serve
  // the tools suite, which calls the tallies without start()
  let FINAL = DD.finalAct();
  let STOP = +(P.stop || FINAL);
  const out = [];
  const lines = [];
  const records = [];
  function r1(x) { return Math.round(x * 10) / 10; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function pct(a, b) { return b ? Math.round(100 * a / b) + '%' : '-'; }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
  function inc(o, k, n) { o[k] = (o[k] || 0) + (n === undefined ? 1 : n); }
  /** Wilson 95% interval for k successes in n. */
  function wilson(k, n) {
    if (!n) return [0, 0];
    const z = 1.96, p = k / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }
  function ci(k, n) { const w = wilson(k, n); return Math.round(100 * w[0]) + '–' + Math.round(100 * w[1]) + '%'; }

  // ---- DD.Balance overrides (bal=path:value,...; values are JSON: numbers or [a,b]) -------------------------------
  function applyOverrides() {
    const done = [];
    // acts=N and cameo=0 are sugar for two knobs (plan §7.2; cameo=0 is lead patch P14's page-wide switch)
    if (P.acts !== undefined && P.acts !== '') { DD.Balance.set('campaign.acts', +P.acts); done.push('campaign.acts=' + (+P.acts)); }
    if (String(P.cameo) === '0') { DD.Balance.set('cameo.off', 1); done.push('cameo.off=1'); }
    if (!P.bal) return done;
    // split on commas that are not inside [ ]
    const parts = [];
    let depth = 0, cur = '';
    String(P.bal).split('').forEach(function (ch) {
      if (ch === '[' || ch === '{') depth++;
      if (ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    });
    if (cur) parts.push(cur);
    parts.forEach(function (p) {
      const i = p.indexOf(':');
      if (i < 0) return;
      const path = p.slice(0, i).trim();
      let v = p.slice(i + 1).trim();
      try { v = JSON.parse(v); } catch (e) { /* keep the string */ }
      DD.Balance.set(path, v);
      done.push(path + '=' + JSON.stringify(v));
    });
    return done;
  }

  // ---- tallies -----------------------------------------------------------------------------------------------------
  // timeouts = stalled fights (they hit the round cap); stalledRuns = runs whose result hangs on one; stalls = the list
  function zeros() { const a = []; for (let i = 0; i <= Math.max(FINAL, DD.MAX_ACT || 0); i++) a.push(0); return a; }
  function newTally() {
    const lv = {};
    for (let a = 1; a <= Math.max(FINAL, DD.MAX_ACT || 0); a++) lv[a] = [];
    return {
      runs: 0, wins: 0, stalledRuns: 0, actEnter: zeros(), actClear: zeros(), lossAt: {}, lossTo: {}, fights: 0, timeouts: 0,
      levelsAtBoss: lv, enc: {}, downs: {}, downsByAct: zeros(), deaths: 0, heroes: {}, skills: {},
      socketed: {}, cons: {}, gold: { earned: 0, shopSpent: 0, shopVisits: 0, shopGoldIn: 0, eventDelta: 0, endGold: [], endGoldWon: [], finalBossGold: [], bought: {}, fined: 0 },
      failed: 0, rewardsTaken: {}, levelChoices: {}, errors: [], warns: {}, dumps: [], stalls: [], bossFights: {}, fightMs: 0, runMs: [],
      kinds: {}, hypeBy: {}, dmgBy: {},
      // V3: the gauntlet (per lane, per position 1..L, the order), Svammiel, the cameos, act-4 deaths and run length
      lanes: {}, pos: {}, firstDoor: {}, orders: {}, svam: null, cameo: { fights: 0, cameos: 0, cheats: 0, starts: 0, over: 0, early: 0, byLane: {} },
      a4: { runs: 0, deaths: [], rounds: [], twist: 0, dmWins: 0 }, runRounds: [], shapeshiftKept: 0,
      // heal pass: runs by healer group (healers=), permanent deaths by the fight they happened in
      groups: {}, fallenAt: {},
    };
  }
  let G = newTally();
  let curRun = null;      // per-run scratch
  let curFight = null;    // per-fight scratch

  /** A fight's outcome: 'stall' when it hit the round cap (whatever timeout= then called it), else 'win' | 'loss'. */
  function fightOutcome(result, timeout) { return timeout ? 'stall' : result === 'victory' ? 'win' : 'loss'; }
  /** A run's outcome: 'stall' when its result hangs on a stall's call (won after one, or ended on one). */
  function runOutcome(won, stalls, endedOnStall) {
    if (stalls > 0 && (won || endedOnStall)) return 'stall';
    return won ? 'win' : 'loss';
  }
  /** Win rate over the decided fights / runs of a tally { n, wins, timeouts }: stalls count on neither side. */
  function winPct(wins, n, stalls) { return pct(wins, n - (stalls || 0)); }

  function heroOf(u) {
    if (!u) return null;
    if (u.kind === 'hero') return u.defId;
    if (u.kind === 'summon' && u.ownerId && DD.Combat.state) {
      const o = DD.Combat.byId ? DD.Combat.byId(u.ownerId) : null;
      return o && o.kind === 'hero' ? o.defId : null;
    }
    return null;
  }
  // heal pass (Nov 18): the healing ledger (rcv / from / rcvOver / done / doneBy / doneOver / rev / helpUps / block),
  // fights ended down, permanent deaths from the run's fallen list, act-(L-1) clears and where the hero's runs end
  function H(id) {
    return G.heroes[id] || (G.heroes[id] = { runs: 0, wins: 0, fights: 0, dmg: 0, kills: 0, taken: 0, heals: 0, downs: 0, deaths: 0, summonDmg: 0, oppMade: 0, oppTaken: 0,
      rcv: {}, from: {}, src: {}, rcvOver: 0, done: {}, doneBy: {}, doneOver: 0, rev: {}, helpUps: 0, block: 0, endDown: 0, fallen: 0, aPrev: 0, losses: 0, lossAct: {}, lossTo: {} });
  }
  function K(key) {
    return G.kinds[key] || (G.kinds[key] = { n: 0, wins: 0, hpLost: [], taken: [], rounds: [], short: 0, withDowns: 0, downs: 0, sigs: 0, hype: 0, hype100: 0, timeouts: 0,
      oppHero: 0, oppEnemy: 0, oppDmgH: 0, oppDmgE: 0, wuStart: 0, wuCancel: 0, wuLand: 0, wuHit: 0, wuDmg: 0 });
  }
  /** A gauntlet tally row (a lane, a position, Svammiel). */
  function row() { return { n: 0, wins: 0, timeouts: 0, rounds: [], lost: [], start: [], lvl: [], downs: 0, withDowns: 0, short: 0, eng: {}, engN: 0, bear: 0, bearWins: 0, bearRounds: [], phases: {}, caught: 0, caughtWins: 0 }; }
  const KINDS = ['normal', 'elite', 'miniboss', 'boss'];
  /** The fight-kind label: a gauntlet door is a 'miniboss' (the run's node type) though the engine plays it as a boss. */
  function kindLabel(k) { return k === 'miniboss' ? 'mini' : k; }

  // ---- the shapeshift rule (plan §7.2, addendum-benedick V14) -----------------------------------------------------
  /** True for a skill tagged 'shapeshift' (a transform the sim must never forget: Benedick's shell, Basanos's Transform
   *  and Blood Moon, Ellaria's Wild Shape). */
  function isShapeshift(id) { const d = DD.getSkill(id); return !!(d && Array.isArray(d.tags) && d.tags.indexOf('shapeshift') >= 0); }
  /** The socket a new skill replaces: the lowest-level skill not tagged 'shapeshift' (ties → the first); -1 when every
   *  socketed skill is one (then the new skill is skipped). */
  function replaceIdx(rh) {
    const list = (rh && rh.skills) || [];
    let lo = -1, naive = -1;
    list.forEach(function (s, k) {
      if (naive < 0 || s.level < list[naive].level) naive = k;
      if (!isShapeshift(s.id) && (lo < 0 || s.level < list[lo].level)) lo = k;
    });
    if (naive >= 0 && naive !== lo) G.shapeshiftKept++;   // v2's rule (lowest level, ties → the first) would have forgotten it
    return lo;
  }

  // ---- counting wrappers (this page only) ----------------------------------------------------------------------------
  function patch() {
    const C = DD.Combat;
    const useSkill = C.useSkill;
    C.useSkill = function (unit, slot) {
      const ok = useSkill.apply(this, arguments);
      if (ok && !DD.Act.simulating && curFight) {
        const hid = heroOf(unit);
        const sid = slot && (slot.id || slot);
        if (hid && sid) {
          const k = hid + ':' + sid;
          G.skills[k] = (G.skills[k] || 0) + 1;
          if (unit.kind === 'hero' && unit.signature && unit.signature.id === sid) curFight.sigs++;
        }
      }
      return ok;
    };
    // v2 wind-up accounting (bosses / elite signatures): announced → interrupted (stun, sleep, death...) → landed and
    // hurt a hero-side unit (with the HP + Block it cost them)
    DD.Events.on('windup:start', function () { if (!DD.Act.simulating && curFight) curFight.wu.start++; });
    DD.Events.on('windup:cancel', function () { if (!DD.Act.simulating && curFight) curFight.wu.cancel++; });
    const exec = DD.AI.executeIntent;
    DD.AI.executeIntent = function (unit, intent) {
      if (DD.Act.simulating || !curFight || !intent || !intent.windup) return exec.apply(this, arguments);
      const party = DD.Combat.party();
      const hp0 = party.reduce(function (a, u) { return a + (u.dead || u.downed ? 0 : u.hp + (u.block || 0)); }, 0);
      const r = exec.apply(this, arguments);
      const hp1 = party.reduce(function (a, u) { return a + (u.dead || u.downed ? 0 : u.hp + (u.block || 0)); }, 0);
      if (r) curFight.wu.land++;
      if (hp1 < hp0) { curFight.wu.hit++; curFight.wu.dmg += hp0 - hp1; }
      return r;
    };
    // attacks of opportunity: who made them (hero side / enemy side) and the HP + Block they cost the mover
    DD.Events.on('opportunity:attack', function (e) {
      if (DD.Act.simulating || !curFight || !e) return;
      const a = e.attacker, m = e.mover;
      if (a && a.side === 'hero') curFight.opp.hero++; else curFight.opp.enemy++;
      const ha = heroOf(a), hm = heroOf(m);
      if (ha) H(ha).oppMade++;
      if (hm) H(hm).oppTaken++;
    });
    const useCons = C.useConsumable;
    C.useConsumable = function (unit, index) {
      const id = (C.consumables() || [])[index];
      const ok = useCons.apply(this, arguments);
      if (ok && !DD.Act.simulating && id) { const cid = typeof id === 'object' ? id.id : id; G.cons[cid] = (G.cons[cid] || 0) + 1; }
      return ok;
    };
    const fire = DD.Hooks.fire;
    DD.Hooks.fire = function (name, unit) {
      if (name === 'onTakeDamage' && !DD.Act.simulating && curFight && unit && (arguments[2] || {}).opportunity) {
        const d = arguments[2];
        if (d.dealt > 0) { if (unit.side === 'hero') curFight.opp.dmgOnHeroes += d.dealt; else curFight.opp.dmgOnEnemies += d.dealt; }
      }
      if (name === 'onTakeDamage' && !DD.Act.simulating && curFight && unit && unit.kind === 'hero') {
        const d = arguments[2] || {};
        if (d.dealt > 0) {
          const src = d.credit || d.source;
          const who = src ? (src.side === 'hero' ? 'FRIENDLY' : (src.defId || src.id)) : 'env';
          const k = curFight.kind + ' · ' + who + ' · ' + ((d.skill && d.skill.id) || d.cause || '?');
          G.dmgBy[k] = (G.dmgBy[k] || 0) + d.dealt;
        }
      }
      if (name === 'onDowned' && !DD.Act.simulating && curFight && unit && unit.kind === 'hero') {
        const d = arguments[3] || {};
        const src = d.credit || d.source;
        const who = src ? (src.kind === 'hero' || src.kind === 'summon' ? 'FRIENDLY:' + (src.defId || src.id) : (src.defId || src.id)) : 'none';
        const how = (d.skill && d.skill.id) || d.cause || '?';
        const k = who + ' · ' + how;
        G.downs[k] = (G.downs[k] || 0) + 1;
        G.downsByAct[curRun.act] = (G.downsByAct[curRun.act] || 0) + 1;
        H(unit.defId).downs++;
        curFight.downs++;
      }
      if (!curFight) return fire.apply(this, arguments);
      // the healing ledger: whose hooks are firing, and the heal asked for once every modifyHeal hook has had its say
      ownerStack.push(unit);
      try {
        const res = fire.apply(this, arguments);
        const h = arguments[2];
        if (name === 'modifyHeal' && healFrames.length && h && typeof h === 'object') healFrames[healFrames.length - 1].want = h.cancel ? 0 : Math.max(0, Math.round(+h.amount || 0));
        return res;
      } finally { ownerStack.pop(); }
    };
    ['fireOwn', 'some'].forEach(function (k) {
      const f = DD.Hooks[k];
      if (typeof f !== 'function') return;
      DD.Hooks[k] = function (name, unit) {
        if (!curFight) return f.apply(this, arguments);
        ownerStack.push(unit);
        try { return f.apply(this, arguments); } finally { ownerStack.pop(); }
      };
    });
    patchLedger();
  }

  // ---- the healing ledger (heal pass, Nov 18): who healed whom, through what ----------------------------------------
  // Every combat heal goes through DD.Act.heal(src, target, amount): the channel is the innermost DD.safe frame (a hook
  // of an item / hero passive / Blessing / scar / status / rule, a skill's or a consumable's execute, else the
  // environment), the giver is src (summons credited to their owner), or for a src-less item / passive / Blessing / scar
  // hook the unit whose hooks are firing. Overheal = the heal asked for (after modifyHeal) minus the HP it gave.
  const safeStack = [], ownerStack = [], healFrames = [];
  let interactBy = null;
  /** { k: skill | consumable | item | passive | blessing | scar | status | rule | def | instance | env | none, id } */
  function healChannel() {
    for (let i = safeStack.length - 1; i >= 0; i--) {
      const l = String(safeStack[i]);
      let m = /^hook \S+ \((.*)\)$/.exec(l);
      if (m) {
        const s = m[1];
        const pre = [['item ', 'item'], ['passive of ', 'passive'], ['random passive ', 'blessing'], ['status ', 'status'],
          ['scar ', 'scar'], ['rule ', 'rule'], ['instance hooks of ', 'instance'], ['hooks of ', 'def']];
        for (let j = 0; j < pre.length; j++) if (s.indexOf(pre[j][0]) === 0) return { k: pre[j][1], id: s.slice(pre[j][0].length) };
        return { k: 'env', id: s };
      }
      if ((m = /^execute of (.+)$/.exec(l))) return { k: DD.defs.consumables[m[1]] ? 'consumable' : 'skill', id: m[1] };
      if (/^wild surge /.test(l)) return { k: 'skill', id: l.slice(11) };
      if (/^(desc of|canUse of|aiScore of|DD\.resolve)/.test(l)) continue;
      if (l === 'sim runBattle') return { k: 'none', id: null };
      return { k: 'env', id: l };
    }
    return { k: 'none', id: null };
  }
  const OWNER_CH = { item: 1, passive: 1, blessing: 1, scar: 1, instance: 1, def: 1 };
  /** The unit behind a heal: src when it is a unit, else (item / passive / Blessing / scar hooks) the hooks' owner. */
  function giverOf(src, ch) {
    if (src && typeof src === 'object' && (src.kind === 'hero' || src.kind === 'summon' || src.kind === 'enemy' || src.side)) return src;
    return OWNER_CH[ch.k] ? ownerStack[ownerStack.length - 1] || null : null;
  }
  function isHeroItem(id) { const d = id && DD.getItem(id); return !!(d && d.hero); }
  /** The received column of a heal: self (the hero's own kit), heroItem, gear, bless (Blessings, scars), cons, ally, other. */
  function rcvColumn(ch, giverHero, targetHero) {
    if (ch.k === 'item') return isHeroItem(ch.id) ? 'heroItem' : 'gear';
    if (ch.k === 'consumable') return 'cons';
    if (ch.k === 'blessing' || ch.k === 'scar') return 'bless';
    if (giverHero && giverHero === targetHero) return 'self';
    return giverHero ? 'ally' : 'other';
  }
  /** Count one heal (got = HP gained, want = HP asked for or null when it never got that far, revived = it stood a downed
   *  hero up). Exposed as DD_SIM.ledgerHeal for the tools suite (it then passes ch). */
  function ledgerHeal(src, target, got, want, revived, ch) {
    if (!target || target.side !== 'hero') return;
    ch = ch || healChannel();
    const g = heroOf(giverOf(src, ch));
    const tid = target.kind === 'hero' ? target.defId : null;
    const over = !revived && want !== null && want !== undefined ? Math.max(0, want - got) : 0;
    if (tid) {
      const h = H(tid);
      const col = rcvColumn(ch, g, tid);
      inc(h.rcv, col, got);
      if (col === 'ally') inc(h.from, g, got);
      else if (got > 0) inc(h.src, col + ':' + ch.k + ':' + (ch.id || '-'), got);
      h.rcvOver += over;
      if (revived) inc(h.rev, 'aimed');
    }
    if (g) {
      const gh = H(g);
      const to = tid === g ? 'self' : tid ? 'others' : 'summons';
      inc(gh.done, to, got);
      if (to === 'others') inc(gh.doneBy, ch.k, got);
      gh.doneOver += over;
    }
  }
  function patchLedger() {
    const safe = DD.safe;
    DD.safe = function (label) {
      if (!curFight) return safe.apply(this, arguments);
      safeStack.push(label);
      try { return safe.apply(this, arguments); } finally { safeStack.pop(); }
    };
    const heal = DD.Act.heal;
    DD.Act.heal = function (src, target) {
      if (DD.Act.simulating || !curFight || !target) return heal.apply(this, arguments);
      const frame = { want: null }, wasDown = !!target.downed;
      healFrames.push(frame);
      let got;
      try { got = heal.apply(this, arguments); } finally { healFrames.pop(); }
      ledgerHeal(src, target, +got || 0, frame.want, wasDown && !target.downed && got > 0);
      return got;
    };
    // revives that are not a heal: a help-up (Combat.interact) or a hook (Phoenix jacket, a Blessing)
    const interact = DD.Combat.interact;
    DD.Combat.interact = function (unit) {
      const prev = interactBy;
      interactBy = unit;
      try { return interact.apply(this, arguments); } finally { interactBy = prev; }
    };
    const revive = DD.Act.revive;
    DD.Act.revive = function (target) {
      const ok = revive.apply(this, arguments);
      if (ok && !DD.Act.simulating && curFight && !healFrames.length && target && target.kind === 'hero') {
        const ch = healChannel();
        const by = interactBy && interactBy !== target ? interactBy : null;
        const col = by ? 'helpUp' : ch.k === 'item' ? 'item' : ch.k === 'blessing' || ch.k === 'scar' ? 'bless' : 'other';
        const h = H(target.defId);
        inc(h.rev, col);
        inc(h.rev, col + 'Hp', target.hp || 0);
        const g = heroOf(by);
        if (g && g !== target.defId) H(g).helpUps++;
      }
      return ok;
    };
    const addBlock = DD.Act.addBlock;
    DD.Act.addBlock = function (target) {
      const n = addBlock.apply(this, arguments);
      if (n > 0 && !DD.Act.simulating && curFight && target && target.kind === 'hero') H(target.defId).block += n;
      return n;
    };
  }

  // ---- policies --------------------------------------------------------------------------------------------------------
  const RANK = { common: 1, rare: 2, legendary: 3, cursed: 0 };
  function S() { return DD.Run.state; }
  function partyHp() {
    const s = S();
    const alive = s.party.filter(function (h) { return !h.dead; });
    return alive.reduce(function (a, h) { return a + h.hp / DD.Run.heroStats(h).maxHp; }, 0) / Math.max(1, alive.length);
  }
  function scarCount() { return S().party.reduce(function (a, h) { return a + (h.dead ? 0 : (h.scars || []).length); }, 0); }
  function inGauntlet() { return !!(DD.Run.inGauntlet && DD.Run.inGauntlet()); }

  function resolveLevels(r) {
    for (let guard = 0; guard < 200; guard++) {
      const q = DD.Run.levelQueue();
      if (q.length) {
        const i = q[0];
        const rh = S().party[i];
        const ch = DD.Run.levelUpChoices(i);
        if (!ch.length) break;
        let c = null;
        const learn = ch.filter(function (x) { return x.type === 'skill'; });
        const up = ch.filter(function (x) { return x.type === 'upgrade'; });
        const perk = ch.filter(function (x) { return x.type === 'perk'; });
        if (r.next() < 0.15) c = r.pick(ch);
        else if (learn.length && rh.skills.length < 4) c = learn[0];
        else if (up.length) c = r.pick(up);
        else if (perk.length) c = r.pick(perk);
        else c = ch[0];
        G.levelChoices[c.type] = (G.levelChoices[c.type] || 0) + 1;
        let res = DD.Run.applyLevelChoice(i, c);
        if (!res.ok && res.needsReplace) {
          const lo = replaceIdx(rh);
          res = DD.Run.applyLevelChoice(i, c, lo < 0 || rh.skills[lo].level >= 2 ? -1 : lo);
        }
        if (!res.ok) { G.errors.push('level choice failed: ' + JSON.stringify(res).slice(0, 120)); break; }
        continue;
      }
      const l = DD.Run.pendingLearns();
      if (l.length) {
        const rh = S().party[l[0].heroIdx !== undefined ? l[0].heroIdx : 0];
        let ri = -1;
        if (rh && rh.skills.length >= 4) { const lo = replaceIdx(rh); ri = lo < 0 || rh.skills[lo].level >= 2 ? -1 : lo; }
        DD.Run.resolveLearn(l[0].index, ri);
        continue;
      }
      return true;
    }
    return false;
  }

  /** Equip bag items where they beat what a living hero wears (never cursed over something). */
  function manageGear() {
    const s = S();
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      s.inventory.slice().forEach(function (id) {
        const d = DD.getItem(id);
        if (!d) return;
        let best = -1, bestGain = 0;
        s.party.forEach(function (rh, i) {
          if (rh.dead || !DD.Run.canEquip(i, id)) return;
          const cur = rh.items[d.slot] ? DD.getItem(rh.items[d.slot]) : null;
          const gain = (cur ? -RANK[cur.rarity] - (cur.hero === rh.id ? 0.5 : 0) : 0.5) + RANK[d.rarity] + (d.hero === rh.id ? 0.5 : 0);
          if (d.rarity === 'cursed' && cur) return;
          if (gain > bestGain) { bestGain = gain; best = i; }
        });
        if (best >= 0) { DD.Run.equip(best, id); changed = true; }
      });
      if (!changed) break;
    }
  }

  function takeRewards(r, p) {
    const d = p.data;
    const order = d.choices.map(function (c, i) { return i; });
    const s = S();
    const hurt = s.party.some(function (h) { return !h.dead && h.hp < DD.Run.heroStats(h).maxHp * 0.5; });
    function score(c) {
      const rh = c.heroId ? s.party[DD.Run.indexOf(c.heroId)] : null;
      switch (c.type) {
        case 'item': { const it = DD.getItem(c.id); return it ? 3 + RANK[it.rarity] - (it.rarity === 'cursed' ? 2 : 0) : 0; }
        case 'upgrade': return 4.5;
        case 'skill': return rh && rh.skills.length < 4 ? 5 : 1.5;
        case 'consumable': return s.consumables.length < s.maxConsumables ? 2 : 0;
        case 'gold': return 2.5;
        case 'heal': return hurt ? 5.5 : 0.5;
        default: return 1;
      }
    }
    order.sort(function (a, b) { return score(d.choices[b]) + r.float(0, 1.2) - score(d.choices[a]) - r.float(0, 1.2); });
    let took = false;
    for (let k = 0; k < order.length && !took; k++) {
      const c = d.choices[order[k]];
      const hero = c.heroId ? s.party[DD.Run.indexOf(c.heroId)] : null;
      let ri;
      // a full hero forgets his lowest-level skill, never a 'shapeshift' one (plan §7.2); with only those, no skill
      if (c.type === 'skill' && hero && hero.skills.length >= 4) { ri = replaceIdx(hero); if (ri < 0) continue; }
      const res = DD.Run.takeReward(order[k], ri !== undefined ? { replaceIdx: ri } : {});
      took = res && res.ok;
      if (took) G.rewardsTaken[c.type] = (G.rewardsTaken[c.type] || 0) + 1;
    }
    if (!took) DD.Run.skipRewards();
    manageGear();
  }

  /** The Bribe with 200+ gold, never while Svammiel stays home (cameo=0: there is no door cheat to skip). */
  function wantsBribe(svc, gold) {
    if (!svc || svc.id !== 'bribe' || (DD.Balance.cameo && DD.Balance.cameo.off)) return false;
    return gold >= 200 && gold >= svc.price;
  }
  function shopVisit(r, p) {
    const s = S();
    G.gold.shopVisits++;
    G.gold.shopGoldIn += s.gold;
    const g0 = s.gold;
    const inv = p.data;
    const hpFrac = partyHp();
    function tryBuy(section, i, opts) {
      const res = DD.Run.buy(section, i, opts || {});
      if (res && res.ok) { G.gold.bought[section] = (G.gold.bought[section] || 0) + 1; return true; }
      return false;
    }
    (inv.services || []).forEach(function (svc, i) {
      if (svc.id === 'heal' && hpFrac < 0.6 && s.gold >= svc.price) tryBuy('services', i);
      if (svc.id === 'scar' && s.gold >= svc.price + 60 && s.party.some(function (h) { return !h.dead && h.scars && h.scars.length; })) tryBuy('services', i);
    });
    // V3 gauntlet shops: the Bribe (Svammiel skips the next door's cheat) with 200+ gold (plan §7.2)
    (inv.services || []).forEach(function (svc, i) {
      if (wantsBribe(svc, s.gold) && tryBuy('services', i)) inc(G.gold.bought, 'bribe');
    });
    // items: best rarity first, if someone can wear it and it beats their gear
    const items = (inv.items || []).map(function (e, i) { return { e: e, i: i }; }).filter(function (x) { const d = DD.getItem(x.e.id); return d && d.rarity !== 'cursed'; });
    items.sort(function (a, b) { return RANK[DD.getItem(b.e.id).rarity] - RANK[DD.getItem(a.e.id).rarity]; });
    items.forEach(function (x) {
      const d = DD.getItem(x.e.id);
      const wearer = s.party.findIndex(function (rh, i) {
        if (rh.dead || !DD.Run.canEquip(i, d.id)) return false;
        const cur = rh.items[d.slot] ? DD.getItem(rh.items[d.slot]) : null;
        return !cur || RANK[cur.rarity] < RANK[d.rarity];
      });
      if (wearer >= 0 && s.gold >= x.e.price) tryBuy('items', x.i, { heroIdx: wearer });
    });
    (inv.tomes || []).forEach(function (e, i) {
      const idx = DD.Run.indexOf(e.heroId);
      const rh = idx >= 0 ? s.party[idx] : null;
      if (rh && !rh.dead && rh.skills.length < 4 && s.gold >= e.price + 10) tryBuy('tomes', i);
    });
    (inv.consumables || []).forEach(function (e, i) {
      if (s.consumables.length < s.maxConsumables && s.gold >= e.price + 30) tryBuy('consumables', i);
    });
    // a Blessing re-roll when rich and someone carries a weak one (cursed or common level I)
    (inv.services || []).forEach(function (svc, i) {
      if (svc.id !== 'reroll' || svc.sold || s.gold < svc.price + 100 || !DD.Passives) return;
      const weak = s.party.some(function (h) {
        return !h.dead && (h.passives || []).some(function (q) { const d = DD.getPassive(q.id); return d && (d.rarity === 'cursed' || (d.rarity === 'common' && q.level === 1)); });
      });
      if (weak) tryBuy('services', i);
    });
    G.gold.shopSpent += g0 - s.gold;
    manageGear();
  }

  function tavernVisit(r) {
    const s = S();
    const deadIdx = s.party.findIndex(function (h) { return h.dead; });
    if (deadIdx >= 0) {
      const c = DD.Run.recruitCandidates();
      if (c.length) { DD.Run.tavernRecruit(r.pick(c), deadIdx); curRun.recruits++; return; }
    }
    if (partyHp() < 0.75 || scarCount() >= 2) { DD.Run.tavernRest(); return; }
    const alive = DD.Run.aliveHeroes();
    for (let k = 0; k < alive.length; k++) {
      const hi = r.pick(alive);
      const ups = DD.Run.upgradableSkills(hi);
      if (ups.length) { DD.Run.tavernTrain(hi, r.pick(ups)); return; }
    }
    DD.Run.tavernRest();
  }

  /** A gauntlet door (order=random | fixed:a,b,… | lowhp). */
  function pickDoor(r, doors) {
    if (doors.length === 1) return doors[0];
    if (ORDER.indexOf('fixed:') === 0) {
      const list = ORDER.slice(6).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      const reg = (S().map.lanes || []).map(function (l) { return l.id; });
      const rank = function (n) { const i = list.indexOf(n.lane); return i >= 0 ? i : list.length + Math.max(0, reg.indexOf(n.lane)); };
      return doors.slice().sort(function (a, b) { return rank(a) - rank(b); })[0];
    }
    if (ORDER === 'lowhp') {
      // the lane with the best record on this page so far (decided fights; a 1-in-2 prior for an unseen lane)
      let best = null, bestV = -Infinity;
      doors.forEach(function (n) {
        const x = G.lanes[n.lane];
        const v = x ? (x.wins + 1) / (x.n - x.timeouts + 2) : 0.5;
        const w = v + r.float(0, 0.001);
        if (w > bestV) { bestV = w; best = n; }
      });
      return best;
    }
    return r.pick(doors);
  }
  /** A gauntlet stop (plan §7.2): a tavern under 70% HP or with 2+ scars, a shop with 120+ gold, else an event. */
  function pickStop(r, avail) {
    const by = function (t) { return avail.filter(function (n) { return n.type === t; })[0]; };
    const want = partyHp() < 0.7 || scarCount() >= 2 ? ['tavern', 'shop', 'event'] : S().gold >= 120 ? ['shop', 'event', 'tavern'] : ['event', 'tavern', 'shop'];
    for (let i = 0; i < want.length; i++) if (by(want[i])) return by(want[i]);
    return r.pick(avail);
  }

  /** Next map node: random, or 'smart' (shops when rich, taverns when hurt, elites only when healthy); the gauntlet's
   *  doors follow order=, its stops pickStop. */
  function pickNode(r, avail) {
    if (avail.length === 1) return avail[0];
    const doors = avail.filter(function (n) { return n.type === 'miniboss'; });
    if (doors.length) return pickDoor(r, doors);
    if (ROUTE === 'random') return r.pick(avail);
    if (inGauntlet()) return pickStop(r, avail);
    const s = S(), hp = partyHp(), gold = s.gold;
    let best = avail[0], bestScore = -Infinity;
    avail.forEach(function (n) {
      let v = 0;
      switch (n.type) {
        case 'elite': v = hp >= 0.75 ? 0.5 : hp < 0.5 ? -2.5 : -0.8; break;
        case 'shop': v = gold >= 150 ? 2 : gold >= 90 ? 1 : gold < 50 ? -1.5 : 0; break;
        case 'tavern': v = hp < 0.6 ? 2 : 0; break;
        case 'treasure': v = 0.8; break;
        case 'event': v = 0.2; break;
        default: v = 0;
      }
      v += r.float(0, 1.5);
      if (v > bestScore) { bestScore = v; best = n; }
    });
    return best;
  }

  // ---- a door's puzzle counters (each fight file's stats(state)); labels for the gauntlet table --------------------------
  const LANE_STATS = {
    gardener: { mod: 'Gardener', cols: [['jams', 'gnome jams'], ['drums', 'drums'], ['vinesKilled', 'vines weeded'], ['gourdsPopped', 'gourds popped'], ['mows', 'mows'], ['mowHits', 'mow hits'], ['overgrowth', 'Overgrowth'], ['healed', 'healed']] },
    league: { mod: 'League', cols: [['bodies', 'bodies'], ['broken', 'bodies broken'], ['raised', 'raised'], ['songs', 'songs'], ['songHits', 'song hits'], ['lever', 'lever'], ['dropped', 'dropped'], ['expended', 'Expendable']] },
    galbraith: { mod: 'Galbraith', cols: [['counters', 'Counterspells'], ['rests', 'rests'], ['restDmg', 'rest dmg'], ['crystals', 'crystals broken'], ['encore', 'Encore'], ['meteorHits', 'meteor hits'], ['pwLanded', 'Power Words'], ['regen', 'crystal heal']] },
    coven: { mod: 'Coven', cols: [['stirs', 'stirs'], ['pies', 'pies'], ['pieLanded', 'pies landed'], ['tipped', 'tipped'], ['spotsHeld', 'spots held'], ['threadHits', 'thread hits'], ['eyeDropped', 'Eye dropped'], ['sleeps', 'sleeps']] },
    goats: { mod: 'Goats', cols: [['hung', 'bars hung'], ['claps', 'Clap Backs'], ['barNone', 'Bar None landed'], ['cut', 'interrupted'], ['fizzled', 'fizzled'], ['speakers', 'speakers broken'], ['tributes', 'tributes'], ['bassHits', 'bass hits']] },
  };
  function laneStats(lane, cs) {
    const spec = LANE_STATS[lane];
    const mod = spec ? DD[spec.mod] : null;
    if (!mod || typeof mod.stats !== 'function') return null;
    try { return mod.stats(cs) || null; } catch (e) { G.errors.push('stats of lane ' + lane + ' threw: ' + e); return null; }
  }

  function fight() {
    const cs = DD.Combat.state;
    const s = S();
    const pd = s.pending.data;
    const encId = (cs && cs.encounter && cs.encounter.id) || pd.encounterId || '?';
    const enc = (cs && cs.encounter) || DD.getEncounter(encId) || {};
    const lane = pd.lane || (enc.gauntlet && enc.gauntlet.lane) || null;
    const pos = pd.gauntlet && typeof pd.gauntlet.index === 'number' ? pd.gauntlet.index + 1 : null;
    const kind = lane ? 'miniboss' : (pd.kind || (cs && cs.kind) || '?');
    const heroes0 = cs.units.filter(function (u) { return u.kind === 'hero'; });
    const lvl = heroes0.reduce(function (a, u) { return a + (u.level || 1); }, 0) / Math.max(1, heroes0.length);
    const hp0 = heroes0.reduce(function (a, u) { return a + u.hp; }, 0), max0 = heroes0.reduce(function (a, u) { return a + u.maxHp; }, 0);
    curFight = { downs: 0, hypeMax: cs.hype || 0, sigs: 0, hype: {}, kind: kind,
      opp: { hero: 0, enemy: 0, dmgOnHeroes: 0, dmgOnEnemies: 0 }, wu: { start: 0, cancel: 0, land: 0, hit: 0, dmg: 0 } };
    const act = s.act;
    const finalBoss = kind === 'boss' && act === FINAL;
    if (finalBoss) G.gold.finalBossGold.push(s.gold);
    if (kind === 'boss' && G.levelsAtBoss[act]) G.levelsAtBoss[act].push(r1(lvl));
    const offHype = DD.Events.on('hype:changed', function (e) {
      if (DD.Act.simulating || !curFight || DD.Combat.state !== cs) return;
      curFight.hypeMax = Math.max(curFight.hypeMax, cs.hype || 0);
      if (e && e.delta > 0) { const k = e.reason || '?'; curFight.hype[k] = (curFight.hype[k] || 0) + e.delta; }
    });
    const fallen0 = (s.fallen || []).length;
    const t0 = performance.now();
    DD.safe('sim runBattle', DD.AutoPlay.runBattle, DD.AutoPlay, [MAXR]);
    G.fightMs += performance.now() - t0;
    if (DD.FX && DD.FX.flush) DD.FX.flush();
    let result = cs.result;
    let timeout = false;
    if (DD.Run.inCombat()) {
      timeout = true;   // a stall (recordFight counts it)
      // dump=1: what a capped fight looked like (units left, the last log lines) for stall hunting
      if (P.dump === '1') {
        const left = cs.units.filter(function (u) { return !u.dead; }).map(function (u) {
          return u.name + ' ' + u.hp + '/' + u.maxHp + (u.downed ? ' DOWN' : '') + ' at ' + u.x + ',' + u.y;
        });
        G.dumps.push('seed ' + curRun.seed + ' ' + encId + ' r' + cs.round + ': ' + left.join(', ') + '\n      ' +
          cs.log.slice(-40).map(function (l) { return 'r' + l.round + ' ' + l.text; }).join('\n      '));
      }
      DD.Act.endCombat(ON_TIMEOUT === 'defeat' ? 'defeat' : 'victory');
      if (DD.FX && DD.FX.flush) DD.FX.flush();
      if (DD.Run.inCombat()) DD.Run.finishCombat(ON_TIMEOUT === 'defeat' ? 'defeat' : 'victory', cs);
      result = cs.result || ON_TIMEOUT;
    }
    if (typeof offHype === 'function') offHype();
    const heroes1 = cs.units.filter(function (u) { return u.kind === 'hero'; });
    const hp1 = heroes1.reduce(function (a, u) { return a + (u.downed || u.dead ? 0 : u.hp); }, 0);
    const st = cs.stats && cs.stats.units || {};
    const taken = heroes1.reduce(function (a, u) { return a + ((st[u.id] && st[u.id].taken) || 0); }, 0);
    const lost = max0 ? (hp0 - hp1) / max0 : 0;
    const f = {
      seed: curRun.seed, act: act, kind: kind, encId: encId, result: result, timeout: timeout, round: cs.round,
      lost: lost, taken: max0 ? taken / max0 : 0, start: max0 ? hp0 / max0 : 0, lvl: lvl,
      downs: curFight.downs, sigs: curFight.sigs, hypeMax: curFight.hypeMax, hype: curFight.hype, opp: curFight.opp, wu: curFight.wu,
      healer: heroes0.some(function (u) { return HEALERS.indexOf(u.defId) >= 0; }), runOver: !!DD.Run.state.over,
      left: timeout ? cs.units.filter(function (u) { return !u.dead; }).map(function (u) { return u.name + ' ' + u.hp + '/' + u.maxHp + (u.downed ? ' DOWN' : ''); }).join(', ') : '',
    };
    const outcome = recordFight(f);
    recordAct4(f, outcome, cs, enc, lane, pos);
    if (outcome === 'stall') curRun.stalls++;
    curRun.lastStalled = outcome === 'stall';
    curRun.rounds[act] = (curRun.rounds[act] || 0) + cs.round;
    // per-hero numbers from the combat stats (summons credited to their owner)
    cs.units.forEach(function (u) {
      const hid = heroOf(u);
      const x = st[u.id];
      if (!hid || !x) return;
      const h = H(hid);
      h.dmg += x.dmg || 0; h.kills += x.kills || 0; h.heals += x.heals || 0;
      if (u.kind === 'hero') h.taken += x.taken || 0; else h.summonDmg += x.dmg || 0;
    });
    heroes0.forEach(function (u) { H(u.defId).fights++; });
    // heal pass: who ended a fight the party did not lose down (a scar, or a death at the third), and permanent deaths
    if (outcome !== 'loss') heroes1.forEach(function (u) { if (u.downed || u.dead) H(u.defId).endDown++; });
    const rs = S();
    if (rs && rs.fallen && rs.fallen.length > fallen0) rs.fallen.slice(fallen0).forEach(function (id) { H(id).fallen++; inc(G.fallenAt, encId); });
    if (enc.finale) {
      const ids = heroes0.map(function (u) { return u.defId; });
      groupsOf(ids).forEach(function (k) { const g = GR(k); g.sv.n++; if (outcome === 'win') g.sv.wins++; if (outcome === 'stall') g.sv.timeouts++; });
    }
    heroes0.forEach(function (u) {
      (u.skills || []).forEach(function (sl) { const kk = u.defId + ':' + sl.id; G.socketed[kk] = (G.socketed[kk] || 0) + 1; });
      if (u.signature) { const kk = u.defId + ':' + u.signature.id; G.socketed[kk] = (G.socketed[kk] || 0) + 1; }
      if (u.basic) { const kk = u.defId + ':' + u.basic.id; G.socketed[kk] = (G.socketed[kk] || 0) + 1; }
    });
    if (P.json === '1') records.push({ seed: curRun.seed, act: act, kind: kind, enc: encId, lane: lane, pos: pos, result: result, outcome: outcome, rounds: cs.round, lost: r2(lost), downs: curFight.downs, sigs: curFight.sigs, hype: curFight.hype, lvl: r1(lvl) });
    curRun.fightLog.push(encId + (result === 'victory' ? '' : '!') + (timeout ? '(T)' : '') + ':' + cs.round);
    curFight = null;
  }

  /**
   * V3 tallies of one fight: a gauntlet door (per lane with its puzzle counters, per position), Svammiel (his
   * phases, CAUGHT, Rulings, dice, falls, pencil, cheats), the cameos of every fight (start cameo, cheats, the budget)
   * and an error line for a cameo memory outside the acts that may have one (the ship-dark check).
   */
  function recordAct4(f, outcome, cs, enc, lane, pos) {
    const win = outcome === 'win';
    function add(x) {
      x.n++; if (win) x.wins++; if (outcome === 'stall') x.timeouts++;
      x.rounds.push(f.round); x.lost.push(f.lost); x.start.push(f.start); x.lvl.push(f.lvl);
      x.downs += f.downs; if (f.downs) x.withDowns++; if (f.round <= 2 && win) x.short++;
    }
    if (lane) {
      const x = G.lanes[lane] || (G.lanes[lane] = row());
      add(x);
      const p = G.pos[pos || 0] || (G.pos[pos || 0] = row());
      add(p);
      if (pos === 1) inc(G.firstDoor, lane);
      const eng = laneStats(lane, cs);
      if (eng) {
        x.engN++;
        Object.keys(eng).forEach(function (k) { if (typeof eng[k] === 'number') inc(x.eng, k, eng[k]); });
        if (lane === 'goats' && eng.bear === 'here') { x.bear++; if (win) x.bearWins++; if (eng.bearRound) x.bearRounds.push(eng.bearRound); }
      }
    }
    if (enc.finale) {
      const x = G.svam || (G.svam = row());
      add(x);
      const sv = cs.data && cs.data.svam;
      if (sv) {
        inc(x.phases, sv.phase || 1);
        if (sv.caught) { x.caught++; if (win) x.caughtWins++; }
        x.engN++;
        Object.keys(sv.stats || {}).forEach(function (k) { if (typeof sv.stats[k] === 'number') inc(x.eng, k, sv.stats[k]); });
      }
    }
    // cameos: every fight of a gauntlet act (doors and the finale); a cameo memory anywhere else but the act-3 boss is a leak
    const cm = cs.data && cs.data.cameo;
    const a4 = !!(lane || enc.finale);
    if (a4) {
      const c = G.cameo;
      c.fights++;
      c.cameos += (cs.stats && cs.stats.cameos) || 0;
      c.cheats += (cs.stats && cs.stats.cheats) || 0;
      if (cm && cm.started) c.starts++;
      const k = lane || 'finale';
      const b = c.byLane[k] || (c.byLane[k] = { n: 0, cheats: 0, cameos: 0, starts: 0 });
      b.n++; b.cheats += (cs.stats && cs.stats.cheats) || 0; b.cameos += (cs.stats && cs.stats.cameos) || 0; if (cm && cm.started) b.starts++;
    }
    // the boss right before a gauntlet act may carry one (the twist, his shadow); with the gauntlet off, nobody may
    const twistBoss = f.kind === 'boss' && f.act === FINAL - 1 && gauntletFinal();
    if (cm) {
      const perFight = (DD.Balance.cameo && DD.Balance.cameo.perFight) || 3;
      if ((cm.used || 0) > perFight) { G.cameo.over++; G.errors.push('seed ' + f.seed + ' ' + f.encId + ': ' + cm.used + ' interjections (budget ' + perFight + ')'); }
      if (!a4 && !twistBoss) { G.cameo.early++; G.errors.push('seed ' + f.seed + ' ' + f.encId + ' (act ' + f.act + '): a cameo memory outside the gauntlet and the boss before it'); }
    }
    if (twistBoss && win) G.a4.dmWins++;
  }
  /** True when the campaign's last act is a gauntlet (V3's act 4 with the knob flipped). */
  function gauntletFinal() { return !!(DD.RunMap && DD.RunMap.isGauntlet && DD.RunMap.isGauntlet(FINAL)); }

  /**
   * Count one fight into the tallies. f: { seed, act, kind, encId, result ('victory' | 'defeat'), timeout (it hit the
   * round cap), round, lost, taken, start (party HP fractions), lvl, downs, sigs, hypeMax, hype {reason: n}, opp, wu,
   * healer (a starting healer in the party), runOver, left (who was standing, for the stall list) }. A stall counts in
   * n and timeouts but never in wins: every win rate is wins / (n − timeouts). Returns the outcome.
   */
  function recordFight(f) {
    const outcome = fightOutcome(f.result, f.timeout);
    const win = outcome === 'win';
    const opp = f.opp || { hero: 0, enemy: 0, dmgOnHeroes: 0, dmgOnEnemies: 0 }, wu = f.wu || { start: 0, cancel: 0, land: 0, hit: 0, dmg: 0 };
    const e = G.enc[f.encId] || (G.enc[f.encId] = { act: f.act, kind: f.kind, n: 0, wins: 0, rounds: 0, short: 0, timeouts: 0, hpLost: 0, lvl: 0, downs: 0, withDowns: 0, hype100: 0, hypeMax: 0, maxRounds: 0, sigs: 0 });
    e.n++; if (win) e.wins++;
    e.hypeMax += f.hypeMax || 0; if (f.hypeMax >= 100) e.hype100++;
    e.maxRounds = Math.max(e.maxRounds, f.round);
    e.rounds += f.round; if (f.round <= 2 && win) e.short++;
    if (outcome === 'stall') e.timeouts++;
    e.hpLost += f.lost || 0;
    e.lvl += f.lvl || 0; e.downs += f.downs || 0; if (f.downs) e.withDowns++;
    e.sigs += f.sigs || 0;
    const k = K(f.kind), ka = K('a' + f.act + ' ' + f.kind);
    [k, ka].forEach(function (x) {
      x.n++; if (win) x.wins++;
      x.hpStart = (x.hpStart || 0) + (f.start || 0);
      x.hpLost.push(f.lost || 0); x.taken.push(f.taken || 0); x.rounds.push(f.round);
      if (f.round <= 2 && win) x.short++;
      if (f.downs) x.withDowns++;
      x.downs += f.downs || 0; x.sigs += f.sigs || 0; x.hype += f.hypeMax || 0; if (f.hypeMax >= 100) x.hype100++;
      if (outcome === 'stall') x.timeouts++;
      x.oppHero += opp.hero; x.oppEnemy += opp.enemy; x.oppDmgH += opp.dmgOnHeroes; x.oppDmgE += opp.dmgOnEnemies;
      x.wuStart += wu.start; x.wuCancel += wu.cancel; x.wuLand += wu.land; x.wuHit += wu.hit; x.wuDmg += wu.dmg;
    });
    Object.keys(f.hype || {}).forEach(function (r) { const hk = f.kind + ':' + r; G.hypeBy[hk] = (G.hypeBy[hk] || 0) + f.hype[r]; });
    if (f.kind === 'boss') {
      const b = G.bossFights[f.encId] || (G.bossFights[f.encId] = { n: 0, wins: 0, timeouts: 0, hp: 0, h: { n: 0, wins: 0, timeouts: 0 }, x: { n: 0, wins: 0, timeouts: 0 } });
      b.n++; if (win) b.wins++; if (outcome === 'stall') b.timeouts++;
      b.hp += f.start || 0;
      // split by a starting healer in the party (healers=ellaria,josiah by default: the two heroes who start with an ally heal)
      const hb = f.healer ? b.h : b.x;
      hb.n++; if (win) hb.wins++; if (outcome === 'stall') hb.timeouts++;
    }
    if (outcome === 'loss' && f.kind !== 'boss' && f.kind !== 'miniboss' && !f.runOver) G.failed++;
    if (outcome === 'stall') {
      G.timeouts++;
      G.stalls.push({ seed: f.seed, act: f.act, kind: f.kind, enc: f.encId, round: f.round, as: f.result, left: f.left || '' });
    }
    G.fights++;
    return outcome;
  }

  /** The healer groups a lineup falls in: each of healers= it includes, else 'none'. */
  function groupsOf(ids) {
    const g = HEALERS.filter(function (h) { return (ids || []).indexOf(h) >= 0; });
    return g.length ? g : ['none'];
  }
  function GR(k) {
    return G.groups[k] || (G.groups[k] = { runs: 0, wins: 0, stalled: 0, clear: zeros(), sv: { n: 0, wins: 0, timeouts: 0 }, lossAt: {}, lossTo: {} });
  }

  /**
   * Count one finished run. r: { seed, party: [ids], won, stalls (its stalled fights), endedOnStall, act, cleared,
   * startAct (the act it started in: 1, or start=N), lastEnc (the last fight's encounter id), deaths, dead: [ids],
   * goldEarned, gold }. Act clears count progress as the run went (a stall's call included), from the act it started
   * in; the run's win / loss leaves out a stalled run. Returns the run's outcome.
   */
  function finishRun(r) {
    const outcome = runOutcome(r.won, r.stalls || 0, r.endedOnStall);
    const groups = groupsOf(r.party).concat(['all']).map(GR);
    groups.forEach(function (g) { g.runs++; });
    if (outcome === 'win') { G.wins++; r.party.forEach(function (id) { H(id).wins++; }); groups.forEach(function (g) { g.wins++; }); }
    else if (outcome === 'stall') {
      G.stalledRuns++;
      r.party.forEach(function (id) { const h = H(id); h.runs--; h.stalled = (h.stalled || 0) + 1; });
      groups.forEach(function (g) { g.stalled++; });
    } else {
      const at = (r.act || '?') + '', to = r.lastEnc || '?';
      G.lossAt[at] = (G.lossAt[at] || 0) + 1;
      G.lossTo[to] = (G.lossTo[to] || 0) + 1;
      // heal pass: where the runs of each starting hero and of each healer group end
      r.party.forEach(function (id) { const h = H(id); h.losses++; inc(h.lossAct, at); inc(h.lossTo, to); });
      groups.forEach(function (g) { inc(g.lossAt, at); inc(g.lossTo, to); });
    }
    for (let a = r.startAct || 1; a <= FINAL; a++) if ((r.cleared || 0) >= a) { G.actClear[a]++; groups.forEach(function (g) { g.clear[a]++; }); }
    // the act-(L-1) equivalent per hero (act 3 cleared in a four-act campaign), over every run the hero started
    if (FINAL > 1 && (r.cleared || 0) >= FINAL - 1) r.party.forEach(function (id) { H(id).aPrev++; });
    G.deaths += r.deaths || 0;
    (r.dead || []).forEach(function (id) { H(id).deaths++; });
    G.gold.earned += r.goldEarned || 0;
    G.gold.endGold.push(r.gold || 0);
    if (outcome === 'win') G.gold.endGoldWon.push(r.gold || 0);
    return outcome;
  }

  function playStep(r) {
    for (let guard = 0; guard < 16 && S() && !S().over && S().pending; guard++) {
      const p = S().pending;
      if (p.type === 'combat') {
        if (!DD.Run.inCombat()) { G.errors.push('pending combat but not in combat (' + JSON.stringify(p.data).slice(0, 100) + ')'); DD.Run.resume(); if (!DD.Run.inCombat()) break; }
        fight();
      } else if (p.type === 'rewards') {
        if (p.data.actClear) {
          curRun.cleared = p.data.actClear.act;
          if (p.data.actClear.twist) G.a4.twist++;
        }
        if (p.data.failed) G.gold.fined += p.data.goldLost || 0;
        takeRewards(r, p);
        DD.Run.next();
      } else if (p.type === 'event') {
        const ev = DD.Run.currentEvent();
        if (ev && !ev.resolved) {
          const open = ev.choices.filter(function (c) { return !c.disabled; });
          const g0 = S().gold;
          if (open.length) DD.Run.chooseEventOption(r.pick(open).index);
          G.gold.eventDelta += S().gold - g0;
        }
        DD.Run.next();
      } else if (p.type === 'shop') {
        shopVisit(r, p);
        DD.Run.next();
      } else if (p.type === 'tavern') {
        tavernVisit(r);
        DD.Run.next();
      } else {
        DD.Run.next();
      }
    }
  }

  /** Every registered hero but the test fixtures (the random parties draw 4 of them). */
  function allHeroes() { return Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); }); }

  function playRun(seed) {
    const r = DD.RNG('isim:' + seed);
    const all = allHeroes();
    const party = P.party ? String(P.party).split(',') : r.shuffle(all.slice()).slice(0, 4);
    DD.Meta.reset(false);
    DD.Meta.data.unlocked = all.slice();
    DD.Run.newRun(party, DIFF, 'isim' + seed);
    curRun = { seed: seed, party: party, act: 1, startAct: 1, cleared: 0, fightLog: [], recruits: 0, stalls: 0, lastStalled: false, rounds: {}, deaths4: null };
    // start=N: fast-forward to act N (a gauntlet act defaults to level 5 and 450 gold, plan §7.2)
    if (START > 1) {
      const gaunt = DD.RunMap.isGauntlet && DD.RunMap.isGauntlet(Math.min(START, FINAL));
      const opts = { gear: 'auto', noShow: true };
      if (LEVEL || gaunt) opts.level = LEVEL || 5;
      if (GOLD !== null || gaunt) opts.gold = GOLD !== null ? GOLD : 450;
      DD.Run.startAtAct(START, opts);
      curRun.startAct = S().act;
      curRun.cleared = S().act - 1;
    }
    party.forEach(function (id) { H(id).runs++; });
    G.runs++;
    let lastAct = S().act;
    G.actEnter[lastAct]++;
    function entered(a) { if (DD.RunMap.isGauntlet && DD.RunMap.isGauntlet(a) && inGauntlet()) { G.a4.runs++; curRun.deaths4 = S().stats.deaths || 0; } }
    entered(lastAct);
    for (let steps = 0; S() && !S().over && steps < 250; steps++) {
      if (!resolveLevels(r)) G.errors.push('seed ' + seed + ': level choices never resolved');
      if (S().act > STOP) break;
      if (S().act !== lastAct) { lastAct = S().act; G.actEnter[lastAct]++; entered(lastAct); }
      curRun.act = S().act;
      const avail = DD.Run.availableNodes();
      if (!avail.length) { G.errors.push('seed ' + seed + ': stuck on act ' + S().act + ' node ' + S().nodeId); break; }
      DD.Run.travel(pickNode(r, avail).id);
      playStep(r);
    }
    const s = S();
    const cleared = s ? (s.stats.actsCleared || 0) : 0;
    const won = !!s && (s.over === 'victory' || (STOP < FINAL && cleared >= STOP));
    const last = curRun.fightLog[curRun.fightLog.length - 1] || '?';
    // V3: the gauntlet's order (a full one), act-4 deaths and rounds, run length
    const order = s && Array.isArray(s.flags.gauntlet) ? s.flags.gauntlet.slice() : [];
    if (s && s.map && s.map.lanes && order.length === s.map.lanes.length && order.length) inc(G.orders, order.join('>'));
    if (curRun.deaths4 !== null) { G.a4.deaths.push((s.stats.deaths || 0) - curRun.deaths4); G.a4.rounds.push(curRun.rounds[s.act] || 0); }
    G.runRounds.push(Object.keys(curRun.rounds).reduce(function (a, k) { return a + curRun.rounds[k]; }, 0));
    const outcome = finishRun({
      seed: seed, party: party, won: won, stalls: curRun.stalls, endedOnStall: !won && curRun.lastStalled && !!s && !!s.over,
      act: s ? s.act : '?', cleared: cleared, startAct: curRun.startAct, lastEnc: last.split(/[!:(]/)[0], deaths: s ? s.stats.deaths || 0 : 0,
      dead: s ? s.party.filter(function (h) { return h.dead; }).map(function (h) { return h.id; }) : [],
      goldEarned: s ? s.stats.goldEarned || 0 : 0, gold: s ? s.gold : 0,
    });
    const label = outcome === 'stall' ? 'STALL (' + (won ? 'won' : 'lost act ' + s.act) + ' on a capped fight\'s call)' : won ? 'WIN' : 'LOSS act ' + s.act;
    lines.push('seed ' + seed + ' [' + party.join(',') + '] ' + label + ' · levels ' + s.party.map(function (h) { return h.level; }).join('/') +
      ' · deaths ' + (s.stats.deaths || 0) + ' · gold ' + s.gold + ' (earned ' + (s.stats.goldEarned || 0) + ')' + (order.length ? ' · doors ' + order.join('>') : '') + ' · ' + curRun.fightLog.join(' '));
  }

  function kindLine(label, x) {
    return '  ' + label.padEnd(10) + ' n ' + String(x.n).padStart(4) + ' · win ' + winPct(x.wins, x.n, x.timeouts).padStart(4) +
      ' · start HP ' + Math.round(100 * (x.hpStart || 0) / Math.max(1, x.n)) + '%' +
      ' · HP lost ' + Math.round(100 * avg(x.hpLost)) + '% (gross ' + Math.round(100 * avg(x.taken)) + '%)' +
      ' · rounds ' + r1(avg(x.rounds)) + ' · ≤2-round wins ' + pct(x.short, x.n) + ' · fights with downs ' + pct(x.withDowns, x.n) +
      ' · downs/fight ' + r2(x.downs / Math.max(1, x.n)) + ' · signatures/fight ' + r2(x.sigs / Math.max(1, x.n)) +
      ' · hype max ' + Math.round(x.hype / Math.max(1, x.n)) + ' (100: ' + pct(x.hype100, x.n) + ')' + (x.timeouts ? ' · TIMEOUTS ' + x.timeouts : '') +
      '\n' + ''.padEnd(13) + 'attacks of opportunity/fight: by heroes ' + r2(x.oppHero / Math.max(1, x.n)) + ' (' + r1(x.oppDmgE / Math.max(1, x.n)) + ' dmg)' +
      ' · by enemies ' + r2(x.oppEnemy / Math.max(1, x.n)) + ' (' + r1(x.oppDmgH / Math.max(1, x.n)) + ' dmg)' +
      (x.wuStart ? ' · wind-ups/fight ' + r1(x.wuStart / x.n) + ' (interrupted ' + r1(x.wuCancel / x.n) + ', landed ' + r1(x.wuLand / x.n) +
        ', hit someone ' + r1(x.wuHit / x.n) + ', ' + r1(x.wuDmg / x.n) + ' HP+Block)' : '');
  }

  /** "w/n" of the decided fights, plus "(+k stalled)" when some hit the round cap. */
  function decided(x) { return x.wins + '/' + (x.n - (x.timeouts || 0)) + (x.timeouts ? ' (+' + x.timeouts + ' stalled)' : ''); }
  /** One gauntlet row: n, win % (decided), rounds, party HP lost, downs, ≤ 2-round wins, timeouts, level, start HP. */
  function gauntletCells(x) {
    return 'n ' + String(x.n).padStart(3) + ' · win ' + winPct(x.wins, x.n, x.timeouts).padStart(4) + ' (' + decided(x) + ', CI ' + ci(x.wins, x.n - x.timeouts) + ')' +
      ' · rounds ' + r1(avg(x.rounds)) + ' · HP lost ' + Math.round(100 * avg(x.lost)) + '% · downs ' + r2(x.downs / Math.max(1, x.n)) +
      ' (' + pct(x.withDowns, x.n) + ') · ≤2-round wins ' + pct(x.short, x.n) + ' · timeouts ' + x.timeouts +
      ' · L' + r1(avg(x.lvl)) + ' · start HP ' + Math.round(100 * avg(x.start)) + '%';
  }

  /** The V3 report sections: act 4 (the gauntlet per lane and by position, the order, Svammiel, cameos, deaths, length). */
  function act4Lines() {
    const lanes = Object.keys(G.lanes);
    if (!lanes.length && !G.svam && !G.a4.runs && !G.cameo.fights) return;
    out.push('\n== act 4 (' + FINAL + ' acts): entered ' + G.actEnter[FINAL] + ' · cleared ' + G.actClear[FINAL] + ' (' + pct(G.actClear[FINAL], G.actEnter[FINAL]) + ', CI ' + ci(G.actClear[FINAL], G.actEnter[FINAL]) + ')' +
      (G.a4.dmWins ? ' · the twist after ' + G.a4.twist + ' of ' + G.a4.dmWins + ' act-' + (FINAL - 1) + ' boss wins' : '') +
      ' · permanent deaths per act-4 run ' + r2(avg(G.a4.deaths)) + ' (n ' + G.a4.deaths.length + ')' +
      ' · rounds of fighting per act-4 run ' + r1(avg(G.a4.rounds)) + ' (max ' + (G.a4.rounds.length ? Math.max.apply(null, G.a4.rounds) : '-') + ')');
    let all = row();
    lanes.forEach(function (k) { const x = G.lanes[k]; ['n', 'wins', 'timeouts', 'downs', 'withDowns', 'short'].forEach(function (f) { all[f] += x[f]; }); ['rounds', 'lost', 'start', 'lvl'].forEach(function (f) { all[f] = all[f].concat(x[f]); }); });
    const allPct = (all.n - all.timeouts) ? all.wins / (all.n - all.timeouts) : 0;
    out.push('== the gauntlet by lane (doors: n, win % of decided fights, rounds, party HP lost, downs/fight (fights with downs), ≤2-round wins, timeouts, avg level, party HP at the start)');
    out.push('  ' + 'all doors'.padEnd(10) + ' ' + gauntletCells(all));
    lanes.sort().forEach(function (k) {
      const x = G.lanes[k];
      out.push('  ' + k.padEnd(10) + ' ' + gauntletCells(x));
      const spec = LANE_STATS[k];
      const n = Math.max(1, x.engN);
      const cols = spec ? spec.cols : Object.keys(x.eng).map(function (f) { return [f, f]; });
      if (x.engN) out.push(''.padEnd(13) + 'per fight: ' + cols.map(function (c) { return c[1] + ' ' + r2((x.eng[c[0]] || 0) / n); }).join(' · ') +
        (k === 'goats' ? ' · the bear arrived in ' + x.bear + '/' + x.n + ' fights (' + x.bearWins + '/' + x.wins + ' wins), round ' + r1(avg(x.bearRounds)) : ''));
      else out.push(''.padEnd(13) + '(no puzzle counters: ' + (spec ? 'DD.' + spec.mod + '.stats missing' : 'unknown lane') + ')');
    });
    out.push('== the gauntlet by position (1..L; the plan: no position worse than −6 points against all doors, ' + Math.round(100 * allPct) + '%)');
    Object.keys(G.pos).map(Number).sort(function (a, b) { return a - b; }).forEach(function (p) {
      const x = G.pos[p];
      const w = (x.n - x.timeouts) ? x.wins / (x.n - x.timeouts) : 0;
      out.push('  ' + ('door ' + p).padEnd(10) + ' ' + gauntletCells(x) + ' · ' + (w >= allPct ? '+' : '') + Math.round(100 * (w - allPct)) + ' points');
    });
    const orders = Object.keys(G.orders).sort(function (a, b) { return G.orders[b] - G.orders[a]; });
    out.push('== order (' + ORDER + '): first door ' + JSON.stringify(G.firstDoor) + ' · full gauntlets ' + orders.reduce(function (a, k) { return a + G.orders[k]; }, 0) +
      ' in ' + orders.length + ' orders' + (orders.length ? ': ' + orders.slice(0, 8).map(function (k) { return k + ' ×' + G.orders[k]; }).join(' · ') : ''));
    if (G.svam) {
      const x = G.svam, n = Math.max(1, x.engN), e = x.eng;
      const ph = Object.keys(x.phases).sort().map(function (k) { return 'phase ' + k + ' ' + pct(x.phases[k], x.engN); }).join(', ');
      out.push('== Svammiel (the finale): ' + gauntletCells(x));
      out.push(''.padEnd(13) + 'ended in ' + ph + ' · CAUGHT ' + pct(x.caught, x.engN) + ' of fights, ' + pct(x.caughtWins, x.wins) + ' of wins' +
        ' · per fight: Rulings ' + r2((e.rulings || 0) / n) + ' · Rigged Dice ' + r2((e.rigged || 0) / n) + ' · Master Dice ' + r2((e.master || 0) / n) +
        ' · falls ' + r2((e.falls || 0) / n) + ' · pencil HP ' + r1((e.pencil || 0) / n) + ' · round cheats ' + r2((e.cheats || 0) / n) + ' · snap cheats ' + r2((e.snaps || 0) / n) +
        ' · panels dropped ' + r2((e.drops || 0) / n) + ' · imps ' + r2((e.imps || 0) / n));
      const lv = G.levelsAtBoss[FINAL] || [];
      out.push(''.padEnd(13) + 'gold at Svammiel ' + r1(avg(G.gold.finalBossGold)) + ' (n ' + G.gold.finalBossGold.length + ') · party level at Svammiel ' + r1(avg(lv)));
    }
    const c = G.cameo;
    out.push('== cameos (act-4 fights): ' + c.fights + ' fights · start cameo in ' + c.starts + ' (' + pct(c.starts, c.fights) + ') · cameos/fight ' + r2(c.cameos / Math.max(1, c.fights)) +
      ' · cheats/fight ' + r2(c.cheats / Math.max(1, c.fights)) + ' · over budget ' + c.over + ' · cameo memory before act 4 ' + c.early +
      (Object.keys(c.byLane).length ? ' · by fight: ' + Object.keys(c.byLane).sort().map(function (k) { const b = c.byLane[k]; return k + ' cheats ' + r2(b.cheats / b.n) + ', cameos ' + r2(b.cameos / b.n); }).join(' · ') : ''));
  }

  /** The report lines (also DD_SIM.reportText). Win rates leave stalls out of both sides (audit-4). */
  function reportLines(overrides) {
    out.length = 0;
    const runsDecided = G.runs - G.stalledRuns;
    const cw = wilson(G.wins, runsDecided);
    const nHeroes = allHeroes().length;
    out.push('runs ' + G.runs + ' · difficulty ' + DIFF + ' · route ' + ROUTE + ' · ' + FINAL + ' acts' + (START > 1 ? ' · start act ' + START + (LEVEL ? ' level ' + LEVEL : '') + (GOLD !== null ? ' gold ' + GOLD : '') : '') +
      (STOP < FINAL ? ' · stop after act ' + STOP : '') + ' · parties ' + (P.party ? P.party : 'random 4 of all ' + nHeroes + ' heroes') +
      (Object.keys(G.lanes).length ? ' · door order ' + ORDER : '') + (DD.Balance.cameo && DD.Balance.cameo.off ? ' · cameos off' : '') +
      ' · wins ' + G.wins + ' (' + pct(G.wins, runsDecided) + ', 95% CI ' + Math.round(100 * cw[0]) + '–' + Math.round(100 * cw[1]) + '%)' +
      (gauntletFinal() && START < FINAL && STOP >= FINAL - 1 ? ' · ' + (FINAL - 1) + '-act equivalent (act ' + (FINAL - 1) + ' cleared) ' + G.actClear[FINAL - 1] +
        ' (' + pct(G.actClear[FINAL - 1], G.runs) + ', CI ' + ci(G.actClear[FINAL - 1], G.runs) + ')' : '') +
      ' · stalled runs ' + G.stalledRuns + ' (in no win rate)' +
      ' · fights ' + G.fights + ' · timeouts ' + G.timeouts + ' (cap ' + MAXR + ', as ' + ON_TIMEOUT + ': stalls, in no win rate) · avg fight ' + r1(G.fightMs / Math.max(1, G.fights)) + ' ms');
    out.push('overrides: ' + (overrides.length ? overrides.join(' ') : 'none'));
    for (let a = 1; a <= FINAL; a++) if (G.actEnter[a] || a >= START) out.push('act ' + a + ': entered ' + G.actEnter[a] + ', cleared ' + G.actClear[a] + ' (' + pct(G.actClear[a], G.actEnter[a]) + ')');
    out.push('losses by act: ' + JSON.stringify(G.lossAt) + ' · lost to: ' + JSON.stringify(G.lossTo) + ' · objectives failed: ' + G.failed);
    for (let a = 1; a <= FINAL; a++) {
      const l = G.levelsAtBoss[a] || [];
      if (!l.length && a < START) continue;
      out.push('party level at act ' + a + ' boss: avg ' + (l.length ? r1(avg(l)) : '-') + ' (n ' + l.length + ', min ' + (l.length ? Math.min.apply(null, l) : '-') + ', max ' + (l.length ? Math.max.apply(null, l) : '-') + ')');
    }
    out.push('boss fights: ' + Object.keys(G.bossFights).map(function (k) { return k + ' ' + decided(G.bossFights[k]); }).join(' · '));
    out.push('boss fights by a starting healer (' + HEALERS.join('/') + ') in the party · party HP at the start: ' + Object.keys(G.bossFights).map(function (k) {
      const b = G.bossFights[k];
      return k + ' with ' + decided(b.h) + ' (' + winPct(b.h.wins, b.h.n, b.h.timeouts) + '), without ' + decided(b.x) + ' (' + winPct(b.x.wins, b.x.n, b.x.timeouts) + ') · start HP ' + Math.round(100 * b.hp / Math.max(1, b.n)) + '%';
    }).join(' · '));
    act4Lines();
    out.push('\n== by fight kind (party HP lost = start HP − end HP over max, downed = 0; gross = HP damage taken over max; mini = a gauntlet door)');
    KINDS.forEach(function (k) { if (G.kinds[k]) out.push(kindLine(kindLabel(k), G.kinds[k])); });
    for (let a = 1; a <= FINAL; a++) KINDS.forEach(function (k) { const x = G.kinds['a' + a + ' ' + k]; if (x) out.push(kindLine('a' + a + ' ' + kindLabel(k), x)); });
    out.push('== Hype gained per fight by source:');
    KINDS.forEach(function (k) {
      const n = G.kinds[k] ? G.kinds[k].n : 0;
      if (!n) return;
      const parts = Object.keys(G.hypeBy).filter(function (x) { return x.indexOf(k + ':') === 0; })
        .sort(function (a, b) { return G.hypeBy[b] - G.hypeBy[a]; })
        .map(function (x) { return x.slice(k.length + 1) + ' ' + r1(G.hypeBy[x] / n); });
      out.push('  ' + kindLabel(k).padEnd(7) + parts.join(' · '));
    });
    out.push('\n== encounters (n, win%, avg rounds, ≤2-round wins, timeouts, avg party HP lost, avg level, downs/fight, fights with downs, signatures/fight)');
    Object.keys(G.enc).sort(function (a, b) { const x = G.enc[a], y = G.enc[b]; return x.act - y.act || (x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : 0) || (a < b ? -1 : 1); }).forEach(function (k) {
      const e = G.enc[k];
      const flag = (e.wins < e.n - e.timeouts ? ' LOSSES' : '') + (e.timeouts ? ' TIMEOUTS' : '') + (e.short / e.n > 0.1 ? ' SHORT' : '') + (e.rounds / e.n > 12 ? ' LONG' : '');
      out.push('  a' + e.act + ' ' + kindLabel(e.kind).padEnd(6) + ' ' + k.padEnd(28) + ' n ' + String(e.n).padStart(3) + ' · win ' + winPct(e.wins, e.n, e.timeouts).padStart(4) + ' · ' + r1(e.rounds / e.n) + ' rds (max ' + e.maxRounds + ') · short ' + pct(e.short, e.n) +
        ' · to ' + e.timeouts + ' · HP lost ' + Math.round(100 * e.hpLost / e.n) + '% · L' + r1(e.lvl / e.n) + ' · downs ' + r1(e.downs / e.n) + ' (' + pct(e.withDowns, e.n) + ') · sig ' + r2(e.sigs / e.n) + ' · hype ' + Math.round(e.hypeMax / e.n) + flag);
    });
    let totalDowns = 0;
    Object.keys(G.downs).forEach(function (k) { totalDowns += G.downs[k]; });
    out.push('\n== hero downs by cause (top 30, share of ' + totalDowns + ') · by act ' + JSON.stringify(G.downsByAct.slice(1, FINAL + 1)) + ' · permanent deaths ' + G.deaths);
    Object.keys(G.downs).sort(function (a, b) { return G.downs[b] - G.downs[a]; }).slice(0, 30).forEach(function (k) { out.push('  ' + String(G.downs[k]).padStart(4) + ' ' + pct(G.downs[k], totalDowns).padStart(4) + '  ' + k); });
    KINDS.forEach(function (kind) {
      const n = G.kinds[kind] ? G.kinds[kind].n : 0;
      if (!n) return;
      const ks = Object.keys(G.dmgBy).filter(function (k) { return k.indexOf(kind + ' · ') === 0; }).sort(function (a, b) { return G.dmgBy[b] - G.dmgBy[a]; });
      let tot = 0;
      ks.forEach(function (k) { tot += G.dmgBy[k]; });
      out.push('== HP damage to heroes in ' + kindLabel(kind) + ' fights (per fight; total ' + r1(tot / n) + '): ' +
        ks.slice(0, 14).map(function (k) { return k.slice(kind.length + 3) + ' ' + r1(G.dmgBy[k] / n); }).join(' · '));
    });
    const shares = Object.keys(G.heroes).map(function (k) { return G.heroes[k].runs ? G.heroes[k].wins / G.heroes[k].runs : 0; }).sort(function (a, b) { return a - b; });
    const median = shares.length ? (shares[(shares.length - 1) >> 1] + shares[shares.length >> 1]) / 2 : 0;
    out.push('\n== heroes (runs, run wins, fights, dmg/fight, summon dmg/fight, kills/fight, taken/fight, heals/fight, downs/fight, deaths, attacks of opportunity made / suffered per fight) · median run-win share ' + Math.round(100 * median) + '%');
    Object.keys(G.heroes).sort().forEach(function (k) {
      const h = G.heroes[k];
      const f = Math.max(1, h.fights);
      const share = h.runs ? h.wins / h.runs : 0;
      out.push('  ' + k.padEnd(9) + ' runs ' + String(h.runs).padStart(3) + ' · wins ' + pct(h.wins, h.runs).padStart(4) + ' (' + (share >= median ? '+' : '') + Math.round(100 * (share - median)) + ') · fights ' + String(h.fights).padStart(4) + ' · dmg ' + r1(h.dmg / f) +
        ' (summons ' + r1(h.summonDmg / f) + ') · kills ' + r1(h.kills / f) + ' · taken ' + r1(h.taken / f) + ' · heals ' + r1(h.heals / f) + ' · downs ' + r2(h.downs / f) + ' · deaths ' + h.deaths +
        ' · AoO ' + r2(h.oppMade / f) + '/' + r2(h.oppTaken / f) + (h.stalled ? ' · stalled runs ' + h.stalled : ''));
    });
    healLines(median);
    out.push('\n== skill usage per hero (uses per fight socketed; * = never used while socketed ≥ 10 fights)');
    const byHero = {};
    Object.keys(G.socketed).forEach(function (k) { const hid = k.split(':')[0]; (byHero[hid] = byHero[hid] || []).push(k); });
    Object.keys(byHero).sort().forEach(function (hid) {
      const ks = byHero[hid].sort(function (a, b) { return (G.skills[b] || 0) / G.socketed[b] - (G.skills[a] || 0) / G.socketed[a]; });
      out.push('  ' + hid + ': ' + ks.map(function (k) {
        const u = G.skills[k] || 0, n = G.socketed[k];
        return k.split(':')[1] + ' ' + r1(u / n) + '/' + n + (u === 0 && n >= 10 ? '*' : '');
      }).join(' · '));
    });
    out.push('\n== consumables used: ' + JSON.stringify(G.cons));
    out.push('== rewards taken: ' + JSON.stringify(G.rewardsTaken) + ' · level choices: ' + JSON.stringify(G.levelChoices) + ' · skill replacements that kept a shapeshift skill ' + G.shapeshiftKept);
    const gg = G.gold, n = Math.max(1, G.runs);
    out.push('== gold per run: earned ' + r1(gg.earned / n) + ' · spent in shops ' + r1(gg.shopSpent / n) + ' · shop visits ' + r1(gg.shopVisits / n) +
      ' (avg gold on entry ' + r1(gg.shopGoldIn / Math.max(1, gg.shopVisits)) + ') · event net ' + r1(gg.eventDelta / n) + ' · fined ' + r1(gg.fined / n) +
      ' · gold at the final boss ' + r1(avg(gg.finalBossGold)) + ' (n ' + gg.finalBossGold.length + ') · gold left at the end ' + r1(avg(gg.endGold)) +
      ' (won runs ' + r1(avg(gg.endGoldWon)) + ', n ' + gg.endGoldWon.length + ') · bought ' + JSON.stringify(gg.bought));
    out.push('== run length: rounds of fighting per run ' + r1(avg(G.runRounds)) + ' (max ' + (G.runRounds.length ? Math.max.apply(null, G.runRounds) : '-') + ')');
    const errs = G.errors.slice(0, 15);
    out.push('\n== errors (' + G.errors.length + '): ' + errs.join(' | '));
    // audit-4: every fight that hit the round cap, for the gate (always printed; dump=1 adds the logs below)
    out.push('\n== stalls (' + G.stalls.length + ' fights hit the round cap ' + MAXR + ' and count as neither a win nor a loss; ' + G.stalledRuns + ' stalled runs)');
    G.stalls.forEach(function (x) {
      out.push('  seed ' + x.seed + ' · a' + x.act + ' ' + x.kind + ' ' + x.enc + ' · round ' + x.round + ' · called a ' + (x.as || ON_TIMEOUT) + (x.left ? ' · standing: ' + x.left : ''));
    });
    if (G.dumps.length) out.push('\n== capped fights (dump=1)\n  ' + G.dumps.join('\n  '));
    const probs = Object.keys(G.warns).sort(function (a, b) { return G.warns[b] - G.warns[a]; }).slice(0, 25);
    out.push('== DD.warn lines (' + probs.length + ' distinct):');
    probs.forEach(function (k) { out.push('  ' + G.warns[k] + '× ' + k); });
    if (P.verbose === '1') { out.push('\n== runs'); lines.forEach(function (l) { out.push('  ' + l); }); }
    if (P.raw === '1') rawLines();
    return out.slice();
  }

  /** "k/n (p%, CI a–b%)" for k successes in n decided. */
  function rate(k, n) { return k + '/' + n + ' (' + pct(k, n) + (n ? ', CI ' + ci(k, n) : '') + ')'; }
  const RCV_COLS = [['self', 'self'], ['heroItem', 'hero item'], ['gear', 'gear'], ['bless', 'Blessings'], ['cons', 'consumables'], ['ally', 'allies'], ['other', 'other']];
  /** The heal pass sections: the healing ledger per hero, the act-(L-1) share, where each hero's runs end, healer groups. */
  function healLines(median) {
    const ids = Object.keys(G.heroes).sort();
    if (!ids.length) return;
    out.push('\n== healing per hero (per fight the hero started · received = HP healed on the hero, by source: self = his or her own kit, hero item, gear, ' +
      'Blessings / scars, consumables, allies (their kits; top givers in [ ]), other (enemies, the map, nobody) · overheal = heal asked minus HP gained · ' +
      'done = HP healed by the hero (and summons) on other heroes, on himself / herself, on summons · revived = help-ups and item / Blessing revives received; ' +
      'ended down = fights not lost that he or she ended downed · perm deaths = the third down, any act · block = Block gained)');
    ids.forEach(function (k) {
      const h = G.heroes[k];
      const f = Math.max(1, h.fights);
      const rcvTot = RCV_COLS.reduce(function (a, c) { return a + (h.rcv[c[0]] || 0); }, 0);
      const doneTot = (h.done.others || 0) + (h.done.self || 0) + (h.done.summons || 0);
      const from = Object.keys(h.from).sort(function (a, b) { return h.from[b] - h.from[a]; }).slice(0, 3).map(function (x) { return x + ' ' + r1(h.from[x] / f); }).join(', ');
      const by = Object.keys(h.doneBy).sort(function (a, b) { return h.doneBy[b] - h.doneBy[a]; }).map(function (x) { return x + ' ' + r1(h.doneBy[x] / f); }).join(', ');
      const revN = ['helpUp', 'item', 'bless', 'other'].reduce(function (a, c) { return a + (h.rev[c] || 0); }, 0);
      const srcs = Object.keys(h.src).sort(function (a, b) { return h.src[b] - h.src[a]; }).slice(0, 5).map(function (x) { return x + ' ' + r1(h.src[x] / f); }).join(' · ');
      out.push('  ' + k.padEnd(9) + ' fights ' + String(h.fights).padStart(4) + ' · taken ' + r1(h.taken / f) + ' · downs ' + r2(h.downs / f) + ' · ended down ' + r2(h.endDown / f) +
        ' · perm deaths ' + h.fallen + ' (' + r2(h.fallen / f) + '/fight) · block ' + r1(h.block / f) +
        '\n' + ''.padEnd(13) + 'received ' + r1(rcvTot / f) + ': ' + RCV_COLS.map(function (c) { return c[1] + ' ' + r1((h.rcv[c[0]] || 0) / f) + (c[0] === 'ally' && from ? ' [' + from + ']' : ''); }).join(' · ') +
        ' · overheal on ' + pron(k) + ' ' + r1(h.rcvOver / f) + ' (' + pct(h.rcvOver, rcvTot + h.rcvOver) + ') · revived ' + r2(revN / f) + (h.rev.aimed ? ' (+ ' + r2(h.rev.aimed / f) + ' by an aimed heal)' : '') +
        '\n' + ''.padEnd(13) + 'done ' + r1(doneTot / f) + ': others ' + r1((h.done.others || 0) / f) + (by ? ' (' + by + ')' : '') + ' · self ' + r1((h.done.self || 0) / f) + ' · summons ' + r1((h.done.summons || 0) / f) +
        ' · overheal ' + r1(h.doneOver / f) + ' (' + pct(h.doneOver, doneTot + h.doneOver) + ') · help-ups given ' + r2(h.helpUps / f) +
        (srcs ? '\n' + ''.padEnd(13) + 'top non-ally sources (column:channel:id per fight): ' + srcs : ''));
    });
    // the run-win share and the act-(L-1) share with intervals and the ratio to the median
    const prev = FINAL - 1;
    const sh = ids.map(function (k) { const h = G.heroes[k]; return h.runs ? h.wins / h.runs : 0; }).sort(function (a, b) { return a - b; });
    const ap = ids.map(function (k) { const h = G.heroes[k], n = h.runs + (h.stalled || 0); return n ? h.aPrev / n : 0; }).sort(function (a, b) { return a - b; });
    const medA = ap.length ? (ap[(ap.length - 1) >> 1] + ap[ap.length >> 1]) / 2 : 0;
    const med = median !== undefined ? median : sh.length ? (sh[(sh.length - 1) >> 1] + sh[sh.length >> 1]) / 2 : 0;
    out.push('\n== hero shares (run wins of decided runs the hero started · act ' + prev + ' cleared of every run the hero started · ×median) · median run-win share ' + Math.round(100 * med) + '% · median act-' + prev + ' share ' + Math.round(100 * medA) + '%');
    ids.forEach(function (k) {
      const h = G.heroes[k], n = h.runs + (h.stalled || 0);
      if (!n) return;
      out.push('  ' + k.padEnd(9) + ' wins ' + rate(h.wins, h.runs).padEnd(28) + ' ×' + (med ? r2(h.wins / Math.max(1, h.runs) / med) : '-') +
        ' · act ' + prev + ' cleared ' + rate(h.aPrev, n).padEnd(28) + ' ×' + (medA ? r2(h.aPrev / n / medA) : '-'));
    });
    out.push('\n== where each hero\'s runs end (decided losses of the runs the hero started: by act, and the top 5 last fights)');
    ids.forEach(function (k) {
      const h = G.heroes[k];
      if (!h.losses) return;
      out.push('  ' + k.padEnd(9) + ' losses ' + String(h.losses).padStart(3) + ' · by act ' + Object.keys(h.lossAct).sort().map(function (a) { return a + ': ' + h.lossAct[a]; }).join(', ') +
        ' · to ' + Object.keys(h.lossTo).sort(function (a, b) { return h.lossTo[b] - h.lossTo[a]; }).slice(0, 5).map(function (e) { return e + ' ' + h.lossTo[e] + ' (' + pct(h.lossTo[e], h.losses) + ')'; }).join(' · '));
    });
    const gk = HEALERS.concat(['none', 'all']).filter(function (k) { return G.groups[k]; });
    if (gk.length) {
      out.push('\n== healer groups (healers=' + HEALERS.join(',') + '; a run counts in each group its starting party fits, none = no healer, all = every run; Svammiel: the lineup of the fight)');
      gk.forEach(function (k) {
        const g = G.groups[k];
        const dec = g.runs - g.stalled;
        const clears = []; for (let a = 1; a <= FINAL; a++) clears.push(a + ' ' + pct(g.clear[a], g.runs));
        const lost = Object.keys(g.lossTo).sort(function (a, b) { return g.lossTo[b] - g.lossTo[a]; }).slice(0, 6).map(function (e) { return e + ' ' + g.lossTo[e]; }).join(' · ');
        out.push('  ' + (k === 'none' || k === 'all' ? k : 'with ' + k).padEnd(13) + ' runs ' + String(g.runs).padStart(4) + ' · wins ' + rate(g.wins, dec) + (g.stalled ? ' (+' + g.stalled + ' stalled)' : '') +
          ' · act cleared ' + clears.join(', ') + (g.sv.n ? ' · Svammiel ' + rate(g.sv.wins, g.sv.n - g.sv.timeouts) : '') +
          (lost ? '\n' + ''.padEnd(16) + 'lost to: ' + lost : ''));
      });
    }
    const fa = Object.keys(G.fallenAt).sort(function (a, b) { return G.fallenAt[b] - G.fallenAt[a]; });
    if (fa.length) out.push('== permanent deaths by fight (top 12): ' + fa.slice(0, 12).map(function (e) { return e + ' ' + G.fallenAt[e]; }).join(' · '));
  }
  /** him / her for a hero id (the pronoun table: DD.Act.pronouns). */
  function pron(id) {
    try { return DD.Act.pronouns({ kind: 'hero', defId: id }).obj; } catch (e) { return 'them'; }
  }

  /** raw=1: additive counts (R<TAB>key<TAB>value) to merge pages with a sum (.tmp scripts); no rates, no lists. */
  function rawLines() {
    out.push('\n== raw tallies (raw=1: R<TAB>key<TAB>value, additive across pages)');
    function emit(prefix, o) {
      Object.keys(o || {}).forEach(function (k) {
        const v = o[k], key = prefix + '.' + String(k).replace(/[\s\t]+/g, '_');
        if (typeof v === 'number') { if (isFinite(v) && v) out.push('R\t' + key + '\t' + r2(v)); }
        else if (v && typeof v === 'object' && !Array.isArray(v)) emit(key, v);
      });
    }
    function arr(prefix, a) { (a || []).forEach(function (v, i) { if (typeof v === 'number' && v) out.push('R\t' + prefix + '.' + i + '\t' + v); }); }
    emit('g', { runs: G.runs, wins: G.wins, stalledRuns: G.stalledRuns, fights: G.fights, timeouts: G.timeouts, deaths: G.deaths, failed: G.failed });
    arr('actEnter', G.actEnter); arr('actClear', G.actClear); arr('downsByAct', G.downsByAct);
    emit('lossAt', G.lossAt); emit('lossTo', G.lossTo); emit('fallenAt', G.fallenAt); emit('downs', G.downs);
    Object.keys(G.heroes).forEach(function (k) { emit('hero.' + k, G.heroes[k]); });
    Object.keys(G.groups).forEach(function (k) {
      const g = G.groups[k];
      emit('grp.' + k, { runs: g.runs, wins: g.wins, stalled: g.stalled, sv: g.sv, lossAt: g.lossAt, lossTo: g.lossTo });
      arr('grp.' + k + '.clear', g.clear);
    });
    Object.keys(G.bossFights).forEach(function (k) { emit('boss.' + k, G.bossFights[k]); });
    Object.keys(G.enc).forEach(function (k) { const e = G.enc[k]; emit('enc.' + k, { n: e.n, wins: e.wins, timeouts: e.timeouts, downs: e.downs, withDowns: e.withDowns }); });
    Object.keys(G.lanes).forEach(function (k) { const x = G.lanes[k]; emit('lane.' + k, { n: x.n, wins: x.wins, timeouts: x.timeouts, downs: x.downs, withDowns: x.withDowns }); });
    if (G.svam) emit('svam', { n: G.svam.n, wins: G.svam.wins, timeouts: G.svam.timeouts, downs: G.svam.downs, withDowns: G.svam.withDowns, caught: G.svam.caught });
    emit('a4', { runs: G.a4.runs });
    emit('err', { errors: G.errors.length, warns: Object.keys(G.warns).reduce(function (a, k) { return a + G.warns[k]; }, 0), stalls: G.stalls.length });
  }

  function report(overrides) {
    reportLines(overrides);
    document.getElementById('out').textContent = out.join('\n');
    if (P.json === '1') document.getElementById('json').textContent = JSON.stringify(records);
  }

  // the tallies and the report, for the tools suite (tests/docs_tests.js) and the integration suite: reset() starts a
  // fresh tally; replaceIdx(runHero) is the socket a new skill would replace (never a 'shapeshift' one, -1 = skip it)
  window.DD_SIM = {
    fightOutcome: fightOutcome, runOutcome: runOutcome, recordFight: recordFight, finishRun: finishRun,
    replaceIdx: replaceIdx, isShapeshift: isShapeshift, LANE_STATS: LANE_STATS, wantsBribe: wantsBribe,
    ledgerHeal: ledgerHeal, rcvColumn: rcvColumn, groupsOf: groupsOf,
    reset: function () { FINAL = DD.finalAct(); G = newTally(); return G; }, tally: function () { return G; },
    startRun: function (party) { G.runs++; G.actEnter[1]++; (party || []).forEach(function (id) { H(id).runs++; }); },
    reportText: function (overrides) { return reportLines(overrides || []).join('\n'); },
  };

  function start() {
    DD.headless = true;
    DD.FX.instant = true;
    if (DD.Storage && DD.Storage.useMemory) DD.Storage.useMemory(true);
    DD.Run.useUi = false;
    if (DD.UI && DD.UI.settings) DD.UI.settings().unlockAll = true;
    const overrides = applyOverrides();
    FINAL = DD.finalAct();
    STOP = +(P.stop || FINAL);
    G = newTally();
    patch();
    const warn = DD.warn;
    DD.warn = function (msg) { const k = String(msg).replace(/\d+/g, '#').slice(0, 160); G.warns[k] = (G.warns[k] || 0) + 1; return warn.apply(this, arguments); };
    let i = 0;
    function step() {
      if (i >= SEEDS) { report(overrides); document.title = 'DONE'; return; }
      const t0 = performance.now();
      try { playRun(FROM + i); } catch (e) { G.errors.push('seed ' + (FROM + i) + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e)); }
      G.runMs.push(performance.now() - t0);
      i++;
      if (i % 5 === 0) report(overrides);
      setTimeout(step, 0);
    }
    step();
  }
})();
