/* Dungeons and Degenerates — js/engine/cameo.js
 * DD.Cameo (ARCHITECTURE §3.13, §5.11; V3 plan §4.1): cameo actors — Svammiel — who show up in fights they are not
 * (necessarily) in. One tested place plays the twist on the DM's table, the start of every act-4 fight (banner, roast,
 * a comeback, the announced cheat), the mid-fight interjections and their budget, and routes every line to barks when
 * the actor stands on the board himself. Lines come from narration pools, picked with the cosmetic RNG (DD.rng) and
 * remembered per run (run.flags.cameo) so they don't repeat; only a cheat's `apply` may draw from state.rng. Nothing
 * plays while DD.Act.simulating (previews, dry runs) or in a fight with state.noCameo.
 */
(function () {
  'use strict';
  const DD = window.DD;

  // ms: Full; short: Settings "Short"; Log only pushes no FX at all. Interjections count toward the budget.
  const STYLES = {
    entrance: { ms: 4500, short: 2000, blocking: true },                       // the twist on the DM's table
    swoop: { ms: 2500, cheatMs: 3300, short: 1200, blocking: true },           // the start cameo (3.3 s with a cheat card)
    bubble: { ms: 0, life: 2600, blocking: false, interjection: true },        // a bust + small bubble, never waited for
    quip: { ms: 0, blocking: false, interjection: true, noFx: true },          // log + HUD caption only
    shadow: { ms: 900, short: 500, blocking: true, silent: true },             // a winged silhouette, no line
  };
  // the tokens each trigger fills (a line using any other token is never picked)
  const TOKENS = {
    start: ['hero', 'name', 'enemy', 'n'], round: ['n', 'enemy'], heroDowned: ['hero', 'enemy', 'n'],
    kill: ['hero', 'enemy', 'n'], signature: ['hero', 'enemy', 'n'], windupCancel: ['hero', 'enemy', 'n'],
    victory: ['enemy', 'n'], say: ['hero', 'name', 'enemy', 'n'],
  };
  // engine events → trigger names
  const EVENTS = {
    'combat:ready': 'start', 'round:start': 'round', 'unit:downed': 'heroDowned', 'unit:died': 'kill',
    'skill:used': 'signature', 'windup:cancel': 'windupCancel', 'combat:end': 'victory',
  };
  const KEY_RE = /^[a-z][a-z0-9_]*(@a\d+)?$/;
  const RULE_RED = '#ff4a3a';

  function S() { return DD.Combat ? DD.Combat.state : null; }
  function quiet() { return !!(DD.Act && DD.Act.simulating); }
  function num(v, d) { const n = +v; return isFinite(n) ? n : d; }
  function knobs() {
    const c = (DD.Balance && DD.Balance.cameo) || {};
    return { perFight: num(c.perFight, 3), perRound: num(c.perRound, 1), minGap: num(c.minGap, 2), comeback: num(c.comeback, 0.6) };
  }
  /** Settings "Svammiel's cameos": 'full' | 'short' | 'log' (Log only: no FX). */
  function setting() {
    const st = DD.Meta && DD.Meta.data && DD.Meta.data.settings;
    const v = st && st.cameos;
    return v === 'short' || v === 'log' ? v : 'full';
  }
  /** This fight's cameo memory (previews copy it with state.data). */
  function data(s) {
    const d = s.data || (s.data = {});
    const c = d.cameo || (d.cameo = { log: [], used: 0, lastRound: 0, fired: {} });
    if (!Array.isArray(c.log)) c.log = [];
    if (!c.fired) c.fired = {};
    if (!c.downed) c.downed = {};
    return c;
  }
  /** The run's cameo memory (run.flags.cameo, saved with the run); a fight without a run keeps its own. */
  function mem(s) {
    let m;
    if (s.run) {
      const f = s.run.flags || (s.run.flags = {});
      m = f.cameo && typeof f.cameo === 'object' ? f.cameo : (f.cameo = {});
    } else {
      const d = data(s);
      m = d.mem || (d.mem = {});
    }
    if (!m.lines || typeof m.lines !== 'object') m.lines = {};
    ['heroes', 'situations', 'cheats'].forEach(function (k) { if (!Array.isArray(m[k])) m[k] = []; });
    if (m.bribe !== 0 && m.bribe !== 1) m.bribe = m.bribe ? 1 : 0;
    return m;
  }
  /** The fight's act: the run's, else the encounter's (0 = none). */
  function actOf(s) {
    const a = Math.floor(+(s.run && s.run.act ? s.run.act : s.encounter && s.encounter.act));
    return isFinite(a) && a > 0 ? a : 0;
  }
  function cfgOf(s) { return s.encounter ? s.encounter.cameo : undefined; }
  /** The prefix of an actor's own pools: svam_generic, svam_bribe, svam_reason, svam_quip_<cheat>, svam_counter_<cheat>. */
  function prefixOf(def) {
    if (typeof def.linePrefix === 'string') return def.linePrefix;
    const m = /^([a-z0-9]+_)/.exec(def.roastPrefix || '');
    return m ? m[1] : def.id + '_';
  }
  function opponent(s) {
    const enc = s.encounter;
    if (enc && (enc.shortName || enc.name)) return enc.shortName || enc.name;
    const b = DD.Combat.bossUnits ? DD.Combat.bossUnits(s)[0] : null;
    return b ? b.name : 'the boss';
  }
  function stop(t) { t = String(t || '').trim(); return !t || /[.!?…"')]$/.test(t) ? t : t + '.'; }

  // ---- lines ---------------------------------------------------------------------------------------------
  function poolOf(key) {
    const k = DD.narrationKey ? DD.narrationKey(key) : key;
    return { key: k, lines: (DD.defs.narration && DD.defs.narration[k]) || [] };
  }
  function tokensOk(line, vars) {
    const re = /\{(\w+)\}/g;
    let m;
    while ((m = re.exec(line))) { const v = vars[m[1]]; if (v === undefined || v === null || v === '') return false; }
    return true;
  }
  function fill(line, vars) { return line.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? String(vars[k]) : m; }); }
  /**
   * A line of `key`: not naming a hero who is missing from this fight (DD.Act.partyLines), every token filled by vars,
   * not used this run (the key's memory resets once its eligible lines are used up); the cosmetic RNG picks.
   */
  function pick(s, key, vars) {
    if (!key || typeof key !== 'string') return null;
    const p = poolOf(key), all = p.lines;
    if (!all.length) return null;
    vars = vars || {};
    const party = DD.Act.partyLines(all);
    const ok = [];
    for (let i = 0; i < all.length; i++) if (party.indexOf(all[i]) >= 0 && tokensOk(all[i], vars)) ok.push(i);
    if (!ok.length) return null;
    const m = mem(s);
    let used = Array.isArray(m.lines[p.key]) ? m.lines[p.key] : (m.lines[p.key] = []);
    let fresh = ok.filter(function (i) { return used.indexOf(i) < 0; });
    if (!fresh.length) { used = m.lines[p.key] = []; fresh = ok; }
    const i = fresh[Math.floor(DD.rng.next() * fresh.length) % fresh.length];
    used.push(i);
    return { key: p.key, index: i, text: fill(all[i], vars) };
  }
  function hasLines(key) { return poolOf(key).lines.length > 0; }

  // ---- budget (interjections: bubble / quip) ---------------------------------------------------------------
  function budgetOk(s, d) {
    const k = knobs();
    if (d.used >= k.perFight) return false;
    if (d.used > 0) {
      if (s.round === d.lastRound) return (d.roundUsed || 0) < k.perRound;
      if (s.round - d.lastRound < k.minGap) return false;
    }
    return true;
  }
  function spend(s, d) {
    d.roundUsed = d.used > 0 && d.lastRound === s.round ? (d.roundUsed || 0) + 1 : 1;
    d.used++;
    d.lastRound = s.round;
  }

  // ---- output ---------------------------------------------------------------------------------------------
  function logLine(def, text, extra) {
    if (text) DD.Act.log(text, 'cameo', Object.assign({ speaker: def.name, actor: def.id }, extra || {}));
  }
  function record(s, def, entry, count) {
    data(s).log.push(Object.assign({ round: s.round, actor: def.id, key: null, text: '', style: 'bubble', cheat: null }, entry));
    if (count !== false) s.stats.cameos = (s.stats.cameos || 0) + 1;
  }
  /** A bark on the actor's own unit (his fight) or a hero's comeback. Literal text, never a bark key. */
  function bark(unit, text) {
    if (!unit || !text) return;
    if (/^[a-z][a-z0-9_]*$/.test(text)) DD.FX.bark(unit, text);
    else DD.Act.bark(unit, text);
  }
  /** One `cameo` FX event (ARCHITECTURE §7.4); none with Settings "Log only" or for a quip. */
  function fxEvent(def, style, fields) {
    const st = STYLES[style];
    if (!st || st.noFx || setting() === 'log') return null;
    const ms = setting() === 'short' && st.short !== undefined ? st.short : st.ms;
    return DD.FX.push(Object.assign({
      type: 'cameo', actor: def.id, name: def.name, title: def.title, icon: def.icon, color: def.color, enemy: def.enemy,
      style: style, banner: null, text: '', speaker: def.name, cheat: null, bribe: null, ms: ms, parallel: !st.blocking,
    }, fields || {}));
  }

  // ---- one cameo -------------------------------------------------------------------------------------------
  /** Play one line (or a silent shadow): budget, line, log, routing, FX, memory. → { text, key, style } | null. */
  function playOne(def, keyOrText, opts) {
    opts = opts || {};
    const s = S();
    if (!s || !def || quiet() || s.noCameo) return null;
    if (s.result && !opts.afterEnd) return null;
    const style = STYLES[opts.style] ? opts.style : 'bubble', st = STYLES[style];
    const d = data(s);
    const budgeted = !!st.interjection && !opts.force;
    if (budgeted && !budgetOk(s, d)) return null;
    const raw = keyOrText === undefined || keyOrText === null ? '' : String(keyOrText);
    let key = null, text = raw;
    if (raw && KEY_RE.test(raw)) {
      key = raw;
      const p = pick(s, key, Object.assign({ n: s.round, enemy: opponent(s) }, opts.vars || {}));
      if (!p) return null;
      key = p.key;
      text = p.text;
    }
    if (!text && !st.silent) return null;
    if (budgeted) spend(s, d);
    const speaker = opts.speaker || def.name;
    logLine(def, text, { speaker: speaker, style: style, key: key });
    record(s, def, { key: key, text: text, style: style });
    const unit = Cameo.present(s, def.id);
    if (unit) bark(unit, opts.bubble || text);
    else fxEvent(def, style, { banner: opts.banner || null, text: opts.bubble || text, speaker: speaker });
    if (opts.cheat) cheatNow(def, opts.cheat, {});
    return { text: text, key: key, style: style };
  }

  /** The hero a situation is about (it may name one by unit, unit id or hero id), if that hero is in this fight. */
  function heroOfSituation(s, sit) {
    for (let i = 0; i < s.units.length; i++) {
      const u = s.units[i];
      if (u.kind !== 'hero' || u.dead) continue;
      if (u === sit.unit || (sit.unitId && u.id === sit.unitId) || (sit.heroId && u.defId === sit.heroId)) return u;
    }
    return null;
  }

  /**
   * The start cameo (plan §4.1): the banner (encounter name, the announcer line as its sub), the roast (a situation, else
   * a hero not roasted yet this run, else generic), maybe that hero's comeback, then the encounter's cheat (or the Bribe
   * line), routed to barks when the actor is on the board. One FX event. → { text, key, style } | null.
   */
  function startCameo(def, tr, cfg) {
    const s = S();
    const m = mem(s);
    const style = STYLES[tr.style] && !STYLES[tr.style].interjection ? tr.style : 'swoop';
    const heroes = s.units.filter(function (u) { return u.kind === 'hero' && !u.dead; });
    const vars = { n: s.round, enemy: opponent(s) };
    if (heroes[0]) vars.hero = heroes[0].name;
    const annKey = cfg && cfg.start !== undefined ? cfg.start : tr.key;
    const ann = typeof annKey === 'string' ? pick(s, annKey, vars) : null;
    let roast = null, about = null;
    if (typeof def.situation === 'function') {
      const sit = DD.safe('cameo ' + def.id + ' situation', def.situation, def, [s, s.run || null, m.situations.slice()]);
      if (sit && typeof sit.key === 'string' && m.situations.indexOf(sit.key) < 0) {
        const u = heroOfSituation(s, sit);
        const p = pick(s, sit.key, Object.assign({}, vars, u ? { hero: u.name } : {}, sit.vars || {}));
        if (p) { roast = p; about = u; m.situations.push(sit.key); }
      }
    }
    if (!roast && def.roastPrefix) {
      const left = heroes.filter(function (u) { return m.heroes.indexOf(u.defId) < 0 && hasLines(def.roastPrefix + u.defId); });
      while (!roast && left.length) {
        const u = left.splice(Math.floor(DD.rng.next() * left.length) % left.length, 1)[0];
        const p = pick(s, def.roastPrefix + u.defId, Object.assign({}, vars, { hero: u.name }));
        if (p) { roast = p; about = u; m.heroes.push(u.defId); }
      }
    }
    if (!roast) roast = pick(s, prefixOf(def) + 'generic', vars);
    let back = null;
    if (about && def.comebackPrefix && DD.rng.next() < knobs().comeback) back = pick(s, def.comebackPrefix + about.defId, { hero: about.name, enemy: vars.enemy, n: vars.n });
    // the cheat: the encounter's (or the trigger's) — it applies even when no line pool has landed yet
    const cheatId = cfg && cfg.cheat !== undefined ? cfg.cheat : tr.cheat;
    const hasCheat = !!(cheatId && def.cheats && def.cheats[cheatId]);
    if (!ann && !roast && !hasCheat) return null;
    const main = roast || ann || { key: null, text: '' };
    // log, memory, routing
    if (ann) logLine(def, ann.text, { style: style, key: ann.key });
    if (roast) logLine(def, roast.text, { style: style, key: roast.key });
    record(s, def, { key: main.key, text: main.text, style: style });
    const entry = data(s).log[data(s).log.length - 1];
    const unit = Cameo.present(s, def.id);
    let evt = null;
    if (unit) { if (ann) bark(unit, ann.text); if (roast) bark(unit, roast.text); }
    else {
      const enc = s.encounter || {};
      const frames = cfg && (typeof cfg.frames === 'function' ? DD.safe('cameo frames', cfg.frames, cfg, [s]) : cfg.frames);
      evt = fxEvent(def, style, {
        banner: { title: enc.name || '', sub: ann ? def.name + ': "' + ann.text + '"' : '', fit: true, frames: Array.isArray(frames) ? frames.slice() : null },
        text: roast ? roast.text : '',
      });
    }
    if (back && about) bark(about, back.text);
    // a Bribe buys the cheat off (and is spent)
    if (hasCheat) {
      if (m.bribe) {
        m.bribe = 0;
        const b = pick(s, prefixOf(def) + 'bribe', vars);
        const t = b ? b.text : 'A bribe? Fine. No rule this time.';
        logLine(def, t, { style: style, key: b ? b.key : null, bribe: true });
        if (evt) evt.bribe = t;
        else if (unit) bark(unit, t);
      } else {
        const info = cheatNow(def, cheatId, { fold: !unit });
        if (info && info.card) {
          entry.cheat = cheatId;
          if (evt) {
            evt.cheat = info.card;
            if (setting() !== 'short' && STYLES[style].cheatMs) evt.ms = STYLES[style].cheatMs;
          }
        }
      }
    }
    return { text: main.text, key: main.key, style: style };
  }

  // ---- cheats ----------------------------------------------------------------------------------------------
  /**
   * Apply + announce a cheat: when → apply (may fill the desc: return the string or set ctx.desc; return false = no
   * cheat) → a silent rule 'cameo:<id>' (hooks, onAdd / onRemove / telegraphFlat copied) → the log line with a Reason,
   * the DM's counter whisper, stats and run memory → the banner (folded into the start cameo's card, else its own).
   * In a preview / dry run only the effect and the rule happen. → { rule, card } | null.
   */
  function cheatNow(def, cheatId, opts) {
    opts = opts || {};
    const s = S();
    const ch = def && def.cheats ? def.cheats[cheatId] : null;
    if (!s || !ch) {
      if (s && def && !quiet()) DD.warn('DD.Cameo.cheat: ' + def.id + ' has no cheat "' + cheatId + '"');
      return null;
    }
    if (s.result) return null;
    if (typeof ch.when === 'function' && !DD.safe('cheat ' + cheatId + ' when', ch.when, ch, [s])) return null;
    const name = ch.name || cheatId, icon = ch.icon || def.icon;
    const ctx = { state: s, actor: def, cheat: ch, id: cheatId, name: name, desc: String(ch.desc || ''), opts: opts };
    if (typeof ch.apply === 'function') {
      const r = DD.safe('cheat ' + cheatId + ' apply', ch.apply, ch, [s, ctx]);
      if (r === false) return null;
      if (typeof r === 'string' && r) ctx.desc = r;
    }
    const rounds = Math.round(num(ch.rounds, -1));
    const rule = { id: 'cameo:' + cheatId, name: icon + ' ' + name, icon: icon, desc: String(ctx.desc || ''), turns: rounds,
      hooks: ch.hooks || {}, cheat: true, source: def.id, silent: true, next: !!ch.next, cheatId: cheatId };
    ['onAdd', 'onRemove', 'telegraphFlat'].forEach(function (k) { if (typeof ch[k] === 'function') rule[k] = ch[k]; });
    const added = DD.Act.addRule(rule);
    if (quiet()) return { rule: added, card: null };
    const m = mem(s);
    const reason = pick(s, prefixOf(def) + 'reason', {});
    // the quip: the actor's pool for this cheat, else the cheat's own `quips` list (cosmetic RNG either way)
    let quip = pick(s, prefixOf(def) + 'quip_' + cheatId, {});
    if (!quip && Array.isArray(ch.quips) && ch.quips.length) quip = { key: null, text: String(ch.quips[Math.floor(DD.rng.next() * ch.quips.length) % ch.quips.length]) };
    const counter = pick(s, prefixOf(def) + 'counter_' + cheatId, {});
    const why = String(reason ? reason.text : 'none').trim();
    logLine(def, def.icon + ' ' + def.name + ' cheats: ' + name + '. ' + stop(rule.desc) + ' Reason: ' + (/[.!?…]$/.test(why) ? why : why + '.'),
      { cheat: cheatId });
    if (counter) DD.Act.log(counter.text, 'narrator');
    s.stats.cheats = (s.stats.cheats || 0) + 1;
    m.cheats.push(cheatId);
    const card = { id: cheatId, name: name, icon: icon, desc: rule.desc, quip: quip ? quip.text : '' };
    if (!opts.fold) {
      record(s, def, { key: quip ? quip.key : null, text: rule.desc, style: 'cheat', cheat: cheatId }, false);
      if (setting() !== 'log') {
        if (!DD.FX.instant) DD.FX.banner(String(def.name).toUpperCase() + '\'S RULE: ' + name, { sub: rule.desc, color: RULE_RED });
        const unit = Cameo.present(s, def.id);
        if (unit) bark(unit, card.quip);
        else fxEvent(def, 'bubble', { text: card.quip, cheat: card });
      }
    }
    return { rule: added, card: card };
  }

  // ---- the API ---------------------------------------------------------------------------------------------
  const Cameo = {
    stub: false,
    STYLES: STYLES,
    TOKENS: TOKENS,
    EVENTS: EVENTS,

    /**
     * Dispatch the triggers of every registered cameo for an engine event ('combat:ready', 'round:start', …) or a
     * trigger name ('start', 'round', …). Returns how many cameos played.
     */
    fire: function (event, payload) {
      const s = S();
      if (!s || !s.units || quiet() || s.noCameo) return 0;
      const on = EVENTS[event] || event;
      const defs = DD.defs.cameos || {};
      const ids = Object.keys(defs).filter(function (id) { return (defs[id].triggers || []).some(function (tr) { return tr && tr.on === on; }); });
      if (!ids.length) return 0;
      const cfg = cfgOf(s);
      if (cfg === false) return 0;
      const conf = cfg && typeof cfg === 'object' ? cfg : null;
      payload = payload || {};
      // the triggers this fight and event could match (pure checks: a fight none can match keeps no cameo memory)
      const act = actOf(s), enc = s.encounter, kind = (enc && enc.kind) || s.kind;
      const cands = [];
      ids.forEach(function (id) {
        const def = defs[id];
        if (conf && conf.actor && conf.actor !== id) return;
        (def.triggers || []).forEach(function (tr, i) {
          if (!tr || tr.on !== on) return;
          if (on === 'start' ? conf && conf.start === false : conf && conf.interjections === false) return;
          if (tr.act !== undefined && [].concat(tr.act).indexOf(act) < 0) return;
          if (tr.kind && [].concat(tr.kind).indexOf(kind) < 0) return;
          if (tr.encounter && (!enc || [].concat(tr.encounter).indexOf(enc.id) < 0)) return;
          if (tr.from !== undefined && s.round < tr.from) return;
          if (tr.squad) {
            const sq = s.objective && s.objective.bossIds;
            if (!Array.isArray(sq) || !payload.unit || sq.indexOf(payload.unit.defId) < 0) return;
          }
          cands.push({ def: def, tr: tr, tid: tr.id || id + ':' + i });
        });
      });
      if (!cands.length) return 0;
      // event-level checks, read-only: a fight where no trigger can play keeps no cameo memory (review V3: the act-3
      // DM's fight under a 3-act knob used to get an empty state.data.cameo from the twist / shadow triggers)
      const d0 = s.data && s.data.cameo;
      switch (on) {
        case 'start': if (d0 && d0.started) return 0; break;
        case 'heroDowned': {
          // review (V3, NARRATIVE's ask): an onDowned / onAllyDowned hook that stood the hero right back up (the event
          // comes after those hooks) is no down to heckle; that hero's first real down still is
          const u = payload.unit;
          if (!u || u.kind !== 'hero' || !u.downed || (d0 && d0.downed && d0.downed[u.id])) return 0;
          break;
        }
        case 'signature': if (!payload.skill || !(payload.skill.hype >= 100)) return 0; break;
        case 'windupCancel': if (payload.reason === 'death') return 0; break;
        case 'victory': if ((payload.result || s.result) !== 'victory') return 0; break;
        default: break;
      }
      // the triggers that can play now: not a `once` that already played, `when` true (pure checks, in trigger order)
      const live = cands.filter(function (c) {
        if (c.tr.once && d0 && d0.fired && d0.fired[c.tid]) return false;
        return typeof c.tr.when !== 'function' || !!DD.safe('cameo trigger ' + c.tid + ' when', c.tr.when, c.tr, [s, payload]);
      });
      if (!live.length) return 0;
      const d = data(s);
      if (on === 'start') d.started = true;
      if (on === 'heroDowned') d.downed[payload.unit.id] = 1;   // a hero's first down (played or refused by the budget)
      const vars = eventVars(s, on, payload);
      let n = 0;
      live.forEach(function (c) {
        const def = c.def, tr = c.tr, tid = c.tid;
        if (tr.once && d.fired[tid]) return;
        let played = null;
        if (on === 'start') played = startCameo(def, tr, conf);
        else {
          const key = typeof tr.keyOf === 'function' ? DD.safe('cameo trigger ' + tid + ' keyOf', tr.keyOf, tr, [s, payload]) : tr.key;
          if (!key && tr.style !== 'shadow') return;
          played = playOne(def, key || '', { style: tr.style, vars: vars, force: !!tr.force, afterEnd: on === 'victory', banner: tr.banner || null, bubble: tr.bubble || null });
        }
        if (!played) return;
        d.fired[tid] = true;
        n++;
        if (typeof tr.then === 'function') DD.safe('cameo trigger ' + tid + ' then', tr.then, tr, [s, payload, played]);
      });
      return n;
    },

    /** One cameo now: opts { style ('bubble'), vars, cheat, force, speaker, banner, bubble }. Returns the line ('' if none). */
    play: function (actorId, keyOrText, opts) {
      const r = playOne(DD.getCameo(actorId), keyOrText, opts);
      return r ? r.text : '';
    },

    /** A scripted interjection from content (phase changes, the goats' bear): budgeted unless opts.force. */
    say: function (actorId, key, vars, opts) {
      opts = opts || {};
      const r = playOne(DD.getCameo(actorId), key, { style: opts.style || 'bubble', vars: vars || {}, force: !!opts.force, speaker: opts.speaker });
      return r ? r.text : '';
    },

    /** Apply + announce one of the actor's cheats (also his own fight's: a direct call works with noCameo). → rule | null. */
    cheat: function (actorId, cheatId, opts) {
      const info = cheatNow(DD.getCameo(actorId), cheatId, opts || {});
      return info ? info.rule : null;
    },

    /** The fight is not the campaign's last act: the run's act (a sandbox: the encounter's act) < DD.finalAct(). */
    campaignGoesOn: function (state) {
      const s = state || S();
      if (!s) return false;
      const act = s.run ? s.run.act : s.encounter && s.encounter.act;
      return Number(act) > 0 && Number(act) < DD.finalAct();
    },

    /** The actor's unit on the board (his own fight), if any. */
    present: function (state, actorId) {
      const s = state || S(), def = DD.getCameo(actorId);
      if (!s || !s.units || !def || !def.enemy) return null;
      for (let i = 0; i < s.units.length; i++) if (s.units[i].defId === def.enemy && !s.units[i].dead) return s.units[i];
      return null;
    },

    /** This fight's cameos: [{ round, actor, key, text, style, cheat }]. */
    history: function (state) {
      const s = state || S();
      const c = s && s.data && s.data.cameo;
      return c && Array.isArray(c.log) ? c.log.slice() : [];
    },

    /** The interjection budget of this fight: { used, left, lastRound }. */
    budget: function (state) {
      const s = state || S();
      const c = s && s.data && s.data.cameo;
      const used = c ? c.used || 0 : 0;
      return { used: used, left: Math.max(0, knobs().perFight - used), lastRound: c ? c.lastRound || 0 : 0 };
    },

    /** The key of one of an actor's own pools ('generic', 'bribe', 'reason', 'quip_<cheat>', 'counter_<cheat>'). */
    keyOf: function (actorId, name) { const def = DD.getCameo(actorId); return def ? prefixOf(def) + name : ''; },

    /** Settings "Svammiel's cameos" as the engine reads it: 'full' | 'short' | 'log'. */
    setting: setting,
  };

  /** The tokens an event fills: {n} the round, {enemy} the opponent / the foe it is about, {hero} the hero it is about. */
  function eventVars(s, on, p) {
    const v = { n: s.round, enemy: opponent(s) };
    const u = p && p.unit;
    const killer = p && p.killerId ? DD.Combat.byId(p.killerId) : null;
    switch (on) {
      case 'round': v.n = p.round || s.round; break;
      // friendly fire or a self-own keeps {enemy} the opponent (as actions.js narrates hero_downed_friendly)
      case 'heroDowned': if (u) v.hero = u.name; if (killer && killer !== u && killer.side !== u.side) v.enemy = killer.name; break;
      case 'kill': if (u) v.enemy = u.name; if (killer && killer.side === 'hero') v.hero = killer.name; break;
      case 'signature': if (u) v.hero = u.name; break;
      case 'windupCancel': {
        if (u) v.enemy = u.name;
        const c = DD.Combat.current ? DD.Combat.current() : null;
        if (c && c.side === 'hero') v.hero = c.name;
        break;
      }
      default: break;
    }
    return v;
  }

  DD.Cameo = Cameo;

  // the triggers ride on the engine's events (subscribed once everything is loaded)
  DD.afterLoad(function () {
    Object.keys(EVENTS).forEach(function (ev) { DD.Events.on(ev, function (p) { Cameo.fire(ev, p); }); });
  });
})();
