/* Dungeons and Degenerates — tests/sim/sim.js (not a test suite; loaded by tests/sim/sim.html, run by tools/sim.sh)
 * Whole-campaign balance simulation: DD.Run + DD.AutoPlay play full 3-act runs with random 4-hero parties of every
 * hero (all unlocked), items, consumables and Blessings in play, one headless page, seeds one after another.
 * Params (URL query):
 *   seeds=N from=S        runs (seeds S..S+N-1)          diff=casual|normal|brutal
 *   maxr=30               round cap per fight             timeout=victory|defeat (how a capped fight ends)
 *   party=a,b,c,d         fixed party (else random 4 of all 10)
 *   route=smart|random    node choice: smart = shops when rich, taverns when hurt, elites when healthy (default)
 *   stop=N                end each run after clearing act N (quick act-1 / act-2 checks)
 *   bal=path:value,...    DD.Balance overrides for this page, e.g. bal=act.1.hp:1.3,hype.dealtPer:6,gold.fight.normal:[10,16]
 *   verbose=1             one line per run      json=1   raw per-fight records in #json
 * Output (#out): campaign win rate (Wilson 95% interval), act clears, levels at bosses, per-kind table (party HP lost,
 * rounds, short wins, fights with downs, signatures, Hype by source), encounter table, downs by cause, per-hero run
 * wins, skill usage, gold flow. Counting wrappers (Combat.useSkill etc.) are installed on this page only.
 * Policies: level-ups learn until 4 skills then upgrade (15% random); loot by a simple score; gear upgrades equipped;
 * shop: heal under 60% HP, items that beat a hero's gear (best rarity first), tomes for heroes with < 4 skills,
 * consumables with spare gold, a Blessing re-roll when rich; tavern: recruit over the dead, rest under 75% HP or with
 * 2+ scars, else train; events at random; every fight by DD.AutoPlay.runBattle(maxr).
 */
(function () {
  'use strict';
  const DD = window.DD;
  document.addEventListener('dd:loaded', function () { setTimeout(start, 30); });
  const P = DD.params;
  const SEEDS = +(P.seeds || 4), FROM = +(P.from || 0), DIFF = P.diff || 'normal', MAXR = +(P.maxr || 30);
  const ON_TIMEOUT = P.timeout || 'victory';
  const ROUTE = P.route || 'smart';
  const STOP = +(P.stop || 3);
  const out = [];
  const lines = [];
  const records = [];
  function r1(x) { return Math.round(x * 10) / 10; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function pct(a, b) { return b ? Math.round(100 * a / b) + '%' : '-'; }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
  /** Wilson 95% interval for k successes in n. */
  function wilson(k, n) {
    if (!n) return [0, 0];
    const z = 1.96, p = k / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }

  // ---- DD.Balance overrides (bal=path:value,...; values are JSON: numbers or [a,b]) -------------------------------
  function applyOverrides() {
    if (!P.bal) return [];
    const done = [];
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
  const G = {
    runs: 0, wins: 0, actEnter: [0, 0, 0, 0], actClear: [0, 0, 0, 0], lossAt: {}, lossTo: {}, fights: 0, timeouts: 0,
    levelsAtBoss: { 1: [], 2: [], 3: [] }, enc: {}, downs: {}, downsByAct: [0, 0, 0, 0], deaths: 0, heroes: {}, skills: {},
    socketed: {}, cons: {}, gold: { earned: 0, shopSpent: 0, shopVisits: 0, shopGoldIn: 0, eventDelta: 0, endGold: [], finalBossGold: [], bought: {}, fined: 0 },
    failed: 0, rewardsTaken: {}, levelChoices: {}, errors: [], warns: {}, bossFights: {}, fightMs: 0, runMs: [],
    kinds: {}, hypeBy: {}, dmgBy: {},
  };
  let curRun = null;      // per-run scratch
  let curFight = null;    // per-fight scratch

  function heroOf(u) {
    if (!u) return null;
    if (u.kind === 'hero') return u.defId;
    if (u.kind === 'summon' && u.ownerId && DD.Combat.state) {
      const o = DD.Combat.byId ? DD.Combat.byId(u.ownerId) : null;
      return o && o.kind === 'hero' ? o.defId : null;
    }
    return null;
  }
  function H(id) { return G.heroes[id] || (G.heroes[id] = { runs: 0, wins: 0, fights: 0, dmg: 0, kills: 0, taken: 0, heals: 0, downs: 0, deaths: 0, summonDmg: 0 }); }
  function K(key) {
    return G.kinds[key] || (G.kinds[key] = { n: 0, wins: 0, hpLost: [], taken: [], rounds: [], short: 0, withDowns: 0, downs: 0, sigs: 0, hype: 0, hype100: 0, timeouts: 0 });
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
    // telegraph accounting: damaging intents planned (player phase start) → still standing when the enemy phase
    // starts (not killed / stunned / cancelled) → executed and hurt a hero-side unit
    function liveIntents() {
      let n = 0;
      DD.Combat.active('enemy').forEach(function (u) {
        (u.intents || []).forEach(function (it) { if (!(it.delay > 0) && DD.AI.intentDmg(u, it) > 0) n++; });
      });
      return n;
    }
    DD.Events.on('turn:player', function () { if (!DD.Act.simulating && curFight) curFight.tele.planned += liveIntents(); });
    DD.Events.on('turn:enemy', function () { if (!DD.Act.simulating && curFight) curFight.tele.standing += liveIntents(); });
    const exec = DD.AI.executeIntent;
    DD.AI.executeIntent = function (unit, intent) {
      if (DD.Act.simulating || !curFight || !intent || intent.delay > 0) return exec.apply(this, arguments);
      const party = DD.Combat.party();
      const hp0 = party.reduce(function (a, u) { return a + u.hp + (u.block || 0); }, 0);
      const r = exec.apply(this, arguments);
      const hp1 = party.reduce(function (a, u) { return a + (u.dead || u.downed ? 0 : u.hp + (u.block || 0)); }, 0);
      if (hp1 < hp0) curFight.tele.hit++;
      return r;
    };
    const useCons = C.useConsumable;
    C.useConsumable = function (unit, index) {
      const id = (C.consumables() || [])[index];
      const ok = useCons.apply(this, arguments);
      if (ok && !DD.Act.simulating && id) { const cid = typeof id === 'object' ? id.id : id; G.cons[cid] = (G.cons[cid] || 0) + 1; }
      return ok;
    };
    const fire = DD.Hooks.fire;
    DD.Hooks.fire = function (name, unit) {
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
      return fire.apply(this, arguments);
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
          let lo = 0;
          rh.skills.forEach(function (s, k) { if (s.level < rh.skills[lo].level) lo = k; });
          res = DD.Run.applyLevelChoice(i, c, rh.skills[lo].level >= 2 ? -1 : lo);
        }
        if (!res.ok) { G.errors.push('level choice failed: ' + JSON.stringify(res).slice(0, 120)); break; }
        continue;
      }
      const l = DD.Run.pendingLearns();
      if (l.length) {
        const rh = S().party[l[0].heroIdx !== undefined ? l[0].heroIdx : 0];
        let ri = -1;
        if (rh && rh.skills.length >= 4) { let lo = 0; rh.skills.forEach(function (s, k) { if (s.level < rh.skills[lo].level) lo = k; }); ri = rh.skills[lo].level >= 2 ? -1 : lo; }
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
      if (c.type === 'skill' && hero && hero.skills.length >= 4) { let lo = 0; hero.skills.forEach(function (x, j) { if (x.level < hero.skills[lo].level) lo = j; }); ri = lo; }
      const res = DD.Run.takeReward(order[k], ri !== undefined ? { replaceIdx: ri } : {});
      took = res && res.ok;
      if (took) G.rewardsTaken[c.type] = (G.rewardsTaken[c.type] || 0) + 1;
    }
    if (!took) DD.Run.skipRewards();
    manageGear();
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
    const scars = s.party.reduce(function (a, h) { return a + (h.dead ? 0 : (h.scars || []).length); }, 0);
    if (partyHp() < 0.75 || scars >= 2) { DD.Run.tavernRest(); return; }
    const alive = DD.Run.aliveHeroes();
    for (let k = 0; k < alive.length; k++) {
      const hi = r.pick(alive);
      const ups = DD.Run.upgradableSkills(hi);
      if (ups.length) { DD.Run.tavernTrain(hi, r.pick(ups)); return; }
    }
    DD.Run.tavernRest();
  }

  /** Next map node: random, or 'smart' (shops when rich, taverns when hurt, elites only when healthy). */
  function pickNode(r, avail) {
    if (ROUTE === 'random' || avail.length === 1) return r.pick(avail);
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

  function fight() {
    const cs = DD.Combat.state;
    const s = S();
    const pd = s.pending.data;
    const encId = (cs && cs.encounter && cs.encounter.id) || pd.encounterId || '?';
    const kind = pd.kind || (cs && cs.kind) || '?';
    const heroes0 = cs.units.filter(function (u) { return u.kind === 'hero'; });
    const lvl = heroes0.reduce(function (a, u) { return a + (u.level || 1); }, 0) / Math.max(1, heroes0.length);
    const hp0 = heroes0.reduce(function (a, u) { return a + u.hp; }, 0), max0 = heroes0.reduce(function (a, u) { return a + u.maxHp; }, 0);
    curFight = { downs: 0, hypeMax: cs.hype || 0, sigs: 0, hype: {}, kind: kind, tele: { planned: 0, standing: 0, hit: 0 } };
    const act = s.act;
    const finalBoss = kind === 'boss' && act === 3;
    if (finalBoss) G.gold.finalBossGold.push(s.gold);
    if (kind === 'boss') G.levelsAtBoss[act].push(r1(lvl));
    const offHype = DD.Events.on('hype:changed', function (e) {
      if (DD.Act.simulating || !curFight || DD.Combat.state !== cs) return;
      curFight.hypeMax = Math.max(curFight.hypeMax, cs.hype || 0);
      if (e && e.delta > 0) { const k = e.reason || '?'; curFight.hype[k] = (curFight.hype[k] || 0) + e.delta; }
    });
    const t0 = performance.now();
    DD.safe('sim runBattle', DD.AutoPlay.runBattle, DD.AutoPlay, [MAXR]);
    G.fightMs += performance.now() - t0;
    if (DD.FX && DD.FX.flush) DD.FX.flush();
    let result = cs.result;
    let timeout = false;
    if (DD.Run.inCombat()) {
      timeout = true;
      G.timeouts++;
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
    const e = G.enc[encId] || (G.enc[encId] = { act: act, kind: kind, n: 0, wins: 0, rounds: 0, short: 0, timeouts: 0, hpLost: 0, lvl: 0, downs: 0, withDowns: 0, hype100: 0, hypeMax: 0, maxRounds: 0, sigs: 0 });
    e.n++; if (result === 'victory') e.wins++;
    e.hypeMax += curFight.hypeMax; if (curFight.hypeMax >= 100) e.hype100++;
    e.maxRounds = Math.max(e.maxRounds, cs.round);
    e.rounds += cs.round; if (cs.round <= 2 && result === 'victory') e.short++;
    if (timeout) e.timeouts++;
    e.hpLost += lost;
    e.lvl += lvl; e.downs += curFight.downs; if (curFight.downs) e.withDowns++;
    e.sigs += curFight.sigs;
    const k = K(kind), ka = K('a' + act + ' ' + kind);
    [k, ka].forEach(function (x) {
      x.n++; if (result === 'victory') x.wins++;
      x.hpLost.push(lost); x.taken.push(max0 ? taken / max0 : 0); x.rounds.push(cs.round);
      if (cs.round <= 2 && result === 'victory') x.short++;
      if (curFight.downs) x.withDowns++;
      x.downs += curFight.downs; x.sigs += curFight.sigs; x.hype += curFight.hypeMax; if (curFight.hypeMax >= 100) x.hype100++;
      if (timeout) x.timeouts++;
      x.tPlanned = (x.tPlanned || 0) + curFight.tele.planned; x.tStanding = (x.tStanding || 0) + curFight.tele.standing; x.tHit = (x.tHit || 0) + curFight.tele.hit;
    });
    Object.keys(curFight.hype).forEach(function (r) { const hk = kind + ':' + r; G.hypeBy[hk] = (G.hypeBy[hk] || 0) + curFight.hype[r]; });
    if (kind === 'boss') {
      const b = G.bossFights[encId] || (G.bossFights[encId] = { n: 0, wins: 0 });
      b.n++; if (result === 'victory') b.wins++;
    }
    if (result !== 'victory' && kind !== 'boss' && !DD.Run.state.over) G.failed++;
    G.fights++;
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
    heroes0.forEach(function (u) {
      (u.skills || []).forEach(function (sl) { const kk = u.defId + ':' + sl.id; G.socketed[kk] = (G.socketed[kk] || 0) + 1; });
      if (u.signature) { const kk = u.defId + ':' + u.signature.id; G.socketed[kk] = (G.socketed[kk] || 0) + 1; }
      if (u.basic) { const kk = u.defId + ':' + u.basic.id; G.socketed[kk] = (G.socketed[kk] || 0) + 1; }
    });
    if (P.json === '1') records.push({ seed: curRun.seed, act: act, kind: kind, enc: encId, result: result, rounds: cs.round, lost: r2(lost), downs: curFight.downs, sigs: curFight.sigs, hype: curFight.hype, lvl: r1(lvl) });
    curRun.fightLog.push(encId + (result === 'victory' ? '' : '!') + (timeout ? '(T)' : '') + ':' + cs.round);
    curFight = null;
  }

  function playStep(r) {
    for (let guard = 0; guard < 16 && S() && !S().over && S().pending; guard++) {
      const p = S().pending;
      if (p.type === 'combat') {
        if (!DD.Run.inCombat()) { G.errors.push('pending combat but not in combat (' + JSON.stringify(p.data).slice(0, 100) + ')'); DD.Run.resume(); if (!DD.Run.inCombat()) break; }
        fight();
      } else if (p.type === 'rewards') {
        if (p.data.actClear) curRun.cleared = p.data.actClear.act;
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

  function playRun(seed) {
    const r = DD.RNG('isim:' + seed);
    const all = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    const party = P.party ? String(P.party).split(',') : r.shuffle(all.slice()).slice(0, 4);
    DD.Meta.reset(false);
    DD.Meta.data.unlocked = all.slice();
    DD.Run.newRun(party, DIFF, 'isim' + seed);
    curRun = { seed: seed, party: party, act: 1, cleared: 0, fightLog: [], recruits: 0 };
    party.forEach(function (id) { H(id).runs++; });
    G.runs++;
    G.actEnter[1]++;
    let lastAct = 1;
    for (let steps = 0; S() && !S().over && steps < 200; steps++) {
      if (!resolveLevels(r)) G.errors.push('seed ' + seed + ': level choices never resolved');
      if (S().act > STOP) break;
      if (S().act !== lastAct) { lastAct = S().act; G.actEnter[lastAct]++; }
      curRun.act = S().act;
      const avail = DD.Run.availableNodes();
      if (!avail.length) { G.errors.push('seed ' + seed + ': stuck on act ' + S().act + ' node ' + S().nodeId); break; }
      DD.Run.travel(pickNode(r, avail).id);
      playStep(r);
    }
    const s = S();
    const cleared = s ? (s.stats.actsCleared || 0) : 0;
    const won = s && (s.over === 'victory' || (STOP < 3 && cleared >= STOP));
    if (won) { G.wins++; party.forEach(function (id) { H(id).wins++; }); }
    else {
      G.lossAt[(s ? s.act : '?') + ''] = (G.lossAt[(s ? s.act : '?') + ''] || 0) + 1;
      const last = curRun.fightLog[curRun.fightLog.length - 1] || '?';
      const enc = last.split(/[!:(]/)[0];
      G.lossTo[enc] = (G.lossTo[enc] || 0) + 1;
    }
    for (let a = 1; a <= 3; a++) if (cleared >= a) G.actClear[a]++;
    G.deaths += s ? s.stats.deaths || 0 : 0;
    s.party.forEach(function (h) { if (h.dead) H(h.id).deaths++; });
    G.gold.earned += s ? s.stats.goldEarned || 0 : 0;
    G.gold.endGold.push(s ? s.gold : 0);
    lines.push('seed ' + seed + ' [' + party.join(',') + '] ' + (won ? 'WIN' : 'LOSS act ' + s.act) + ' · levels ' + s.party.map(function (h) { return h.level; }).join('/') +
      ' · deaths ' + (s.stats.deaths || 0) + ' · gold ' + s.gold + ' (earned ' + (s.stats.goldEarned || 0) + ')' + ' · ' + curRun.fightLog.join(' '));
  }

  function kindLine(label, x) {
    return '  ' + label.padEnd(10) + ' n ' + String(x.n).padStart(4) + ' · win ' + pct(x.wins, x.n).padStart(4) +
      ' · HP lost ' + Math.round(100 * avg(x.hpLost)) + '% (gross ' + Math.round(100 * avg(x.taken)) + '%)' +
      ' · rounds ' + r1(avg(x.rounds)) + ' · ≤2-round wins ' + pct(x.short, x.n) + ' · fights with downs ' + pct(x.withDowns, x.n) +
      ' · downs/fight ' + r2(x.downs / Math.max(1, x.n)) + ' · signatures/fight ' + r2(x.sigs / Math.max(1, x.n)) +
      ' · hype max ' + Math.round(x.hype / Math.max(1, x.n)) + ' (100: ' + pct(x.hype100, x.n) + ')' + (x.timeouts ? ' · TIMEOUTS ' + x.timeouts : '') +
      ' · telegraphs/fight planned ' + r1((x.tPlanned || 0) / Math.max(1, x.n)) + ' → standing ' + r1((x.tStanding || 0) / Math.max(1, x.n)) + ' → hit ' + r1((x.tHit || 0) / Math.max(1, x.n));
  }

  function report(overrides) {
    out.length = 0;
    const ci = wilson(G.wins, G.runs);
    out.push('runs ' + G.runs + ' · difficulty ' + DIFF + ' · route ' + ROUTE + (STOP < 3 ? ' · stop after act ' + STOP : '') +
      ' · wins ' + G.wins + ' (' + pct(G.wins, G.runs) + ', 95% CI ' + Math.round(100 * ci[0]) + '–' + Math.round(100 * ci[1]) + '%)' +
      ' · fights ' + G.fights + ' · timeouts ' + G.timeouts + ' (cap ' + MAXR + ', as ' + ON_TIMEOUT + ') · avg fight ' + r1(G.fightMs / Math.max(1, G.fights)) + ' ms');
    out.push('overrides: ' + (overrides.length ? overrides.join(' ') : 'none'));
    for (let a = 1; a <= 3; a++) out.push('act ' + a + ': entered ' + G.actEnter[a] + ', cleared ' + G.actClear[a] + ' (' + pct(G.actClear[a], G.actEnter[a]) + ')');
    out.push('losses by act: ' + JSON.stringify(G.lossAt) + ' · lost to: ' + JSON.stringify(G.lossTo) + ' · objectives failed: ' + G.failed);
    [1, 2, 3].forEach(function (a) {
      const l = G.levelsAtBoss[a];
      out.push('party level at act ' + a + ' boss: avg ' + (l.length ? r1(avg(l)) : '-') + ' (n ' + l.length + ', min ' + (l.length ? Math.min.apply(null, l) : '-') + ', max ' + (l.length ? Math.max.apply(null, l) : '-') + ')');
    });
    out.push('boss fights: ' + Object.keys(G.bossFights).map(function (k) { const b = G.bossFights[k]; return k + ' ' + b.wins + '/' + b.n; }).join(' · '));
    out.push('\n== by fight kind (party HP lost = start HP − end HP over max, downed = 0; gross = HP damage taken over max)');
    ['normal', 'elite', 'boss'].forEach(function (k) { if (G.kinds[k]) out.push(kindLine(k, G.kinds[k])); });
    [1, 2, 3].forEach(function (a) { ['normal', 'elite', 'boss'].forEach(function (k) { const x = G.kinds['a' + a + ' ' + k]; if (x) out.push(kindLine('a' + a + ' ' + k, x)); }); });
    out.push('== Hype gained per fight by source:');
    ['normal', 'elite', 'boss'].forEach(function (k) {
      const n = G.kinds[k] ? G.kinds[k].n : 0;
      if (!n) return;
      const parts = Object.keys(G.hypeBy).filter(function (x) { return x.indexOf(k + ':') === 0; })
        .sort(function (a, b) { return G.hypeBy[b] - G.hypeBy[a]; })
        .map(function (x) { return x.slice(k.length + 1) + ' ' + r1(G.hypeBy[x] / n); });
      out.push('  ' + k.padEnd(7) + parts.join(' · '));
    });
    out.push('\n== encounters (n, win%, avg rounds, ≤2-round wins, timeouts, avg party HP lost, avg level, downs/fight, fights with downs, signatures/fight)');
    Object.keys(G.enc).sort(function (a, b) { const x = G.enc[a], y = G.enc[b]; return x.act - y.act || (x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : 0) || (a < b ? -1 : 1); }).forEach(function (k) {
      const e = G.enc[k];
      const flag = (e.wins < e.n ? ' LOSSES' : '') + (e.timeouts ? ' TIMEOUTS' : '') + (e.short / e.n > 0.1 ? ' SHORT' : '') + (e.rounds / e.n > 12 ? ' LONG' : '');
      out.push('  a' + e.act + ' ' + e.kind.padEnd(6) + ' ' + k.padEnd(28) + ' n ' + String(e.n).padStart(3) + ' · win ' + pct(e.wins, e.n).padStart(4) + ' · ' + r1(e.rounds / e.n) + ' rds (max ' + e.maxRounds + ') · short ' + pct(e.short, e.n) +
        ' · to ' + e.timeouts + ' · HP lost ' + Math.round(100 * e.hpLost / e.n) + '% · L' + r1(e.lvl / e.n) + ' · downs ' + r1(e.downs / e.n) + ' (' + pct(e.withDowns, e.n) + ') · sig ' + r2(e.sigs / e.n) + ' · hype ' + Math.round(e.hypeMax / e.n) + flag);
    });
    let totalDowns = 0;
    Object.keys(G.downs).forEach(function (k) { totalDowns += G.downs[k]; });
    out.push('\n== hero downs by cause (top 30, share of ' + totalDowns + ') · by act ' + JSON.stringify(G.downsByAct.slice(1)) + ' · permanent deaths ' + G.deaths);
    Object.keys(G.downs).sort(function (a, b) { return G.downs[b] - G.downs[a]; }).slice(0, 30).forEach(function (k) { out.push('  ' + String(G.downs[k]).padStart(4) + ' ' + pct(G.downs[k], totalDowns).padStart(4) + '  ' + k); });
    ['normal', 'elite', 'boss'].forEach(function (kind) {
      const n = G.kinds[kind] ? G.kinds[kind].n : 0;
      if (!n) return;
      const ks = Object.keys(G.dmgBy).filter(function (k) { return k.indexOf(kind + ' · ') === 0; }).sort(function (a, b) { return G.dmgBy[b] - G.dmgBy[a]; });
      let tot = 0;
      ks.forEach(function (k) { tot += G.dmgBy[k]; });
      out.push('== HP damage to heroes in ' + kind + ' fights (per fight; total ' + r1(tot / n) + '): ' +
        ks.slice(0, 14).map(function (k) { return k.slice(kind.length + 3) + ' ' + r1(G.dmgBy[k] / n); }).join(' · '));
    });
    const shares = Object.keys(G.heroes).map(function (k) { return G.heroes[k].runs ? G.heroes[k].wins / G.heroes[k].runs : 0; }).sort(function (a, b) { return a - b; });
    const median = shares.length ? (shares[(shares.length - 1) >> 1] + shares[shares.length >> 1]) / 2 : 0;
    out.push('\n== heroes (runs, run wins, fights, dmg/fight, summon dmg/fight, kills/fight, taken/fight, heals/fight, downs/fight, deaths) · median run-win share ' + Math.round(100 * median) + '%');
    Object.keys(G.heroes).sort().forEach(function (k) {
      const h = G.heroes[k];
      const f = Math.max(1, h.fights);
      const share = h.runs ? h.wins / h.runs : 0;
      out.push('  ' + k.padEnd(9) + ' runs ' + String(h.runs).padStart(3) + ' · wins ' + pct(h.wins, h.runs).padStart(4) + ' (' + (share >= median ? '+' : '') + Math.round(100 * (share - median)) + ') · fights ' + String(h.fights).padStart(4) + ' · dmg ' + r1(h.dmg / f) +
        ' (summons ' + r1(h.summonDmg / f) + ') · kills ' + r1(h.kills / f) + ' · taken ' + r1(h.taken / f) + ' · heals ' + r1(h.heals / f) + ' · downs ' + r2(h.downs / f) + ' · deaths ' + h.deaths);
    });
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
    out.push('== rewards taken: ' + JSON.stringify(G.rewardsTaken) + ' · level choices: ' + JSON.stringify(G.levelChoices));
    const gg = G.gold, n = Math.max(1, G.runs);
    out.push('== gold per run: earned ' + r1(gg.earned / n) + ' · spent in shops ' + r1(gg.shopSpent / n) + ' · shop visits ' + r1(gg.shopVisits / n) +
      ' (avg gold on entry ' + r1(gg.shopGoldIn / Math.max(1, gg.shopVisits)) + ') · event net ' + r1(gg.eventDelta / n) + ' · fined ' + r1(gg.fined / n) +
      ' · gold at the final boss ' + r1(avg(gg.finalBossGold)) + ' (n ' + gg.finalBossGold.length + ') · gold left at the end ' + r1(avg(gg.endGold)) + ' · bought ' + JSON.stringify(gg.bought));
    const errs = G.errors.slice(0, 15);
    out.push('\n== errors (' + G.errors.length + '): ' + errs.join(' | '));
    const probs = Object.keys(G.warns).sort(function (a, b) { return G.warns[b] - G.warns[a]; }).slice(0, 25);
    out.push('== DD.warn lines (' + probs.length + ' distinct):');
    probs.forEach(function (k) { out.push('  ' + G.warns[k] + '× ' + k); });
    if (P.verbose === '1') { out.push('\n== runs'); lines.forEach(function (l) { out.push('  ' + l); }); }
    document.getElementById('out').textContent = out.join('\n');
    if (P.json === '1') document.getElementById('json').textContent = JSON.stringify(records);
  }

  function start() {
    DD.headless = true;
    DD.FX.instant = true;
    if (DD.Storage && DD.Storage.useMemory) DD.Storage.useMemory(true);
    DD.Run.useUi = false;
    if (DD.UI && DD.UI.settings) DD.UI.settings().unlockAll = true;
    const overrides = applyOverrides();
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
