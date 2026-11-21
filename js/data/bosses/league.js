/* Dungeons and Degenerates — js/data/bosses/league.js
 * Act IV door 2 (V3, plan .tmp/v3/design.md §3.2, §5.3, §5.4, §6.2): THE LLLLLLLLLLEEEEEEEEEEEAAAAAAAAAAAAGUUUUUUUUUUUUUEEEEEEEEE
 * OF VILLAINY, encounter 'boss_league' (theme a4_lair, "The League's Clubhouse", 15 × 13). The user's own Evil Champions
 * as an anti-party of five elites, each on its own initiative (322 HP in all: N.hp; squad rules of plan §3.0.1: no `boss`
 * field, the encounter names the squad in objective.bossIds):
 *   Kelek (wizard, he) — the rapacious leader, forever after his rival Ringlerun's Staff of Power. Evil Missiles (3
 *     curving bolts), the Unspeakable Fireball wind-up; half damage while Warduke stands next to him (Meat Shield).
 *   Warduke (the barbarian slot, he) — a heartless mercenary under a dread helm. Skull Splitter, Hero Punt (a throw into
 *     walls, heroes and the Shark Tank); Bodyguard targeting; below half HP Unreasonable (immovable, +3).
 *   Skylla (warlock, she) — pact with Baba Yaga. Eldritch Blah (pull), Hex of Mild Inconvenience (Vulnerable);
 *     Expendable Friends: once a fight a killing blow kills the nearest other member instead.
 *   Zarak (rogue, he) — an orc assassin everyone calls a dwarf (he is NOT a dwarf). Immovable, Shin Splitter, Tunnel
 *     Ambush (a dash), Sneak Attack (Audible): +4 next to another member.
 *   Zargash (cleric of Orcus, he) — Smite, Unholy Water (Tap) on the most hurt member, Spiteful Revival (a wind-up that
 *     prays a fallen member back up from its body, twice a fight).
 * Shared: Villain Hype (a fight rule: +10 a round, +20 a downed hero, +10 a fallen member; at 100 the frontman winds up
 * The Theme Song: psychic damage per singing member on the marked tiles, the Villain Podium counts twice), Too Evil to
 * Drown (a fall costs 20 HP and Bleed 3, never a death), bodies (10 HP: break them), the Trapdoor Lever (drops the podium
 * into the Shark Tank), Evil Powder Kegs. DD.League.name(level) stretches the user's 56-letter word (§5.4).
 * All fight state lives in state.data.league (previews and dry runs copy it); cosmetic picks use DD.rng only.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  // ---- ids ------------------------------------------------------------------------------------------------------
  const KELEK = 'lg_kelek', WARDUKE = 'lg_warduke', SKYLLA = 'lg_skylla', ZARAK = 'lg_zarak', ZARGASH = 'lg_zargash';
  const FRONT = [KELEK, WARDUKE, SKYLLA, ZARGASH, ZARAK];   // The Theme Song's frontman: the first one standing
  const ENC = 'boss_league', TAG = 'league', RULE = 'lg_hype';
  const BODY = 'lg_body', LEVER = 'lg_lever', TABLE = 'lg_table', TANK = 'lg_shark_tank', PODIUM = 'lg_podium';
  const FLOOR = 'lg_marble', CARPET = 'lg_carpet';
  const SK = { skull: 'lg_skull', punt: 'lg_punt', shins: 'lg_shins', tunnel: 'lg_tunnel', missiles: 'lg_missiles',
    fireball: 'lg_fireball', theme: 'lg_theme', blah: 'lg_blah', hex: 'lg_hex', smite: 'lg_smite', water: 'lg_water', revival: 'lg_revival' };
  const ST = { shield: 'lg_meat_shield', unreasonable: 'lg_unreasonable' };
  const SHORT = { lg_kelek: 'kelek', lg_warduke: 'warduke', lg_skylla: 'skylla', lg_zarak: 'zarak', lg_zargash: 'zargash' };

  // ---- knobs (BAL tunes these; the descs read them) ---------------------------------------------------------------
  const N = {
    // plan §3.2's 60 / 95 / 65 / 70 / 75 (365) −12% after the author sims (docs/notes/boss-league.md): 322
    hp: { lg_kelek: 53, lg_warduke: 84, lg_skylla: 57, lg_zarak: 62, lg_zargash: 66 },
    unreasonable: 3, sneak: 4, tank: 20, tankBleed: 3, body: 10, raiseFrac: 0.5, bodyHint: 12, bodyHintPending: 30,
    hypeMax: 100, hypeRound: 10, hypeDown: 20, hypeFall: 10,
    leverReset: 3, unionRules: false, banterChance: 0.3, banterGap: 2, namedChance: 0.35,
  };
  // AI movement styles (DD.AI.targetBonus): brutes stick to the hero next to them, casters keep their distance, the
  // orc dives the weak
  const MELEE = { style: 'melee', keepDistance: 0 };
  const SNIPER = { style: 'ranged', keepDistance: 3 };
  const KITER = { style: 'ranged', keepDistance: 2 };
  const DIVER = { style: 'assassin', keepDistance: 0 };

  // ---- the name (plan §5.4: the user's letters l×10, e×11, a×12, g, u×13, e×9) --------------------------------------
  const RUNS = [['L', 'l', 10], ['e', 'e', 11], ['a', 'a', 12], ['g', 'g', 1], ['u', 'u', 13], ['e', 'e', 9]];
  const LEVELS = 13;
  /** The stretched word at level n (1-13): every letter run capped at n letters. Level 1 = "League". */
  function word(level) {
    const n = Math.max(1, Math.min(LEVELS, Math.round(+level) || 1));
    let w = '';
    RUNS.forEach(function (r) { const k = Math.min(r[2], n); w += r[0] + new Array(k).join(r[1]); });
    return w;
  }
  function leagueName(level) { return 'The ' + word(level) + ' of Villainy'; }
  const FULL = leagueName(LEVELS);
  const FRAMES = [];
  for (let i = 1; i <= LEVELS; i++) FRAMES.push(leagueName(i));

  // ---- small helpers --------------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function isLeague(u) { return !!u && (u.tags || []).indexOf(TAG) >= 0; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function quiet() { return !!(DD.Act && DD.Act.simulating); }
  function incapacitated(u) { return !active(u) || DD.Act.isStunned(u) || has(u, 'sheep'); }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  function lvl(id) { const s = DD.getSkill(id); return (s && DD.skillLevel(s, 1)) || {}; }
  /** A skill's numbers as THIS fight deals them for a live unit (DD.AI.fightLevel), the raw level without one. */
  function liveLvl(id, u) {
    const s = DD.getSkill(id);
    if (!s) return {};
    return u && u.side && DD.AI && DD.AI.fightLevel && S() ? DD.AI.fightLevel(s, 1, u) : DD.skillLevel(s, 1);
  }
  /** Every living League member of the fight (any side: a charmed member is still a member). */
  function members(s) {
    s = s || S();
    return s ? s.units.filter(function (u) { return active(u) && isLeague(u); }) : [];
  }
  function memberOf(defId, s) { return members(s).filter(function (u) { return u.defId === defId; })[0] || null; }
  function tileOf(p) { return p ? G().tile(p.x, p.y) : null; }
  function onPodium(p) { const t = tileOf(p); return !!t && t.tag === 'podium'; }
  /** The League's fight memory (created by the encounter's onStart; absent in a bare sandbox). */
  function LD(s) { s = s || S(); return s && s.data ? s.data.league || null : null; }
  function stat(key, n) { const d = LD(); if (d) d.stats[key] = (d.stats[key] || 0) + (n === undefined ? 1 : n); }
  function bark(u, key, chance) { if (!quiet() && active(u)) A().maybeBark(u, key, chance === undefined ? 1 : chance); }
  /** A named line for a hero in this fight (the party filter, with the hero ids spelled out: a hero whose file has not
   *  landed yet is never "present"). */
  function namedLine(u) {
    const s = S(), def = DD.getEnemy(u.defId), list = (def && def.named) || [];
    if (!s) return '';
    const here = {};
    s.units.forEach(function (x) { if (x.kind === 'hero' && active(x)) here[x.defId] = 1; });
    const ok = list.filter(function (p) { return here[p[0]]; });
    return ok.length ? ok[Math.floor(DD.rng.next() * ok.length)][1] : '';
  }
  function sayNamed(u, chance) {
    if (quiet() || !active(u) || DD.rng.next() >= chance) return '';
    const line = namedLine(u);
    if (line) A().bark(u, line);
    return line;
  }
  /** Warduke (active) standing next to p. */
  function wardukeNext(p, s) {
    const w = memberOf(WARDUKE, s);
    return !!w && w !== p && dist(w, p) === 1;
  }
  /** Another active League member (not `not`, not the victim) next to the victim: Zarak's Sneak Attack. */
  function flanked(victim, not, at) {
    if (!victim) return false;
    const p = at || victim;
    return members().some(function (m) { return m !== not && m !== victim && dist(m, p) === 1; });
  }
  /** The unit an intent of `unit` would land on right now (pure; wind-up numbers). */
  function intentVictim(unit, intent) {
    const p = DD.AI.intentTarget(unit, intent);
    const v = p ? G().unitAt(p.x, p.y) : null;
    return active(v) && G().hostile(unit, v) ? v : null;
  }
  function pendingWindup(u) { return ((u && u.intents) || []).some(function (i) { return i && i.windup; }); }
  function windupOf(u, id) { return ((u && u.intents) || []).filter(function (i) { return i && i.skillId === id; })[0] || null; }
  function mult(u) {
    // the attacker multipliers of DD.AI.intentDmg (Weak, Inspired, Empowered, item damage, the fight's difficulty)
    let m = 1;
    if (has(u, 'weak')) m *= 0.75;
    if (has(u, 'inspired')) m *= 1.25;
    if (has(u, 'empowered')) m *= 1.5;
    if (u.dmgBonus) m *= 1 + u.dmgBonus;
    const s = S();
    if (u.side === 'enemy' && s && s.difficulty) m *= s.difficulty.dmg || 1;
    return m;
  }
  function fightDmg() { const s = S(); return (s && s.difficulty && Number(s.difficulty.dmg)) || 1; }

  // =================================================================================================================
  // Villain Hype (a fight rule), the frontman and The Theme Song
  // =================================================================================================================
  // the chip prints icon + ' ' + name (combat_hud ruleChips): the name carries no icon of its own ("🎤 Villain Hype 40/100")
  function hypeName(n) { return 'Villain Hype ' + n + '/' + N.hypeMax; }
  function hypeDesc() {
    return '+' + N.hypeRound + ' at the end of each round, +' + N.hypeDown + ' per hero downed, +' + N.hypeFall + ' per League member that falls. At ' +
      N.hypeMax + ' the frontman (the first one standing of Kelek, Warduke, Skylla, Zargash and Zarak) winds up The Theme Song on that member\'s turn, ' +
      'and the meter resets.';
  }
  function hypeRule(s) { return s ? s.rules.filter(function (r) { return r.id === RULE; })[0] || null : null; }
  /** Add Villain Hype (only in the League's own fight: the rule is there). */
  function addHype(n, why) {
    const s = S(), d = LD(s);
    if (!d || !d.on || !(n > 0)) return;
    const before = d.hype;
    d.hype = Math.min(N.hypeMax, d.hype + n);
    syncHype(s);
    if (before < N.hypeMax && d.hype >= N.hypeMax && !quiet()) {
      const f = frontman(s);
      const pos = f && A().pronouns ? A().pronouns(f).pos : 'a';
      A().log('Villain Hype hits ' + N.hypeMax + (why ? ' (' + why + ')' : '') + ': the League is about to sing' + (f ? '. ' + f.name + ' clears ' + pos + ' throat' : '') + '.', 'enemy');
      if (f) DD.FX.text(f, '🎤 HYPE ' + N.hypeMax + '!', { color: '#9bff3a', size: 16 });
    }
  }
  function syncHype(s) {
    const r = hypeRule(s), d = LD(s);
    if (!r || !d) return;
    r.name = hypeName(d.hype);
    r.desc = hypeDesc();
    r.hype = d.hype;
    A().touch();
  }
  function frontman(s) {
    s = s || S();
    for (let i = 0; i < FRONT.length; i++) { const m = memberOf(FRONT[i], s); if (m) return m; }
    return null;
  }
  function sings(m) { return active(m) && isLeague(m) && !DD.Act.isStunned(m) && !has(m, 'charmed') && !has(m, 'sheep'); }
  /** Singing voices right now: every member that sings, the ones on the Villain Podium twice. */
  function songCount(s) {
    let n = 0;
    members(s).forEach(function (m) { if (sings(m)) n += onPodium(m) ? 2 : 1; });
    return n;
  }
  /** The tiles within the song's reach of a singer (walls and blocking objects left out). */
  function songTiles(s) {
    s = s || S();
    if (!s) return [];
    const r = lvl(SK.theme).r || 3, out = [], singers = members(s).filter(sings);
    s.grid.tiles.forEach(function (t) {
      const td = G().terrain(t);
      if (td && td.walkable === false && !td.liquid && !td.pit) return;
      if (t.obj && G().objBlocksMove(t.obj)) return;
      if (singers.some(function (m) { return dist(m, t) <= r; })) out.push({ x: t.x, y: t.y });
    });
    return out;
  }
  /** The song's flat on top of one voice: (voices − 1) × the per-voice number of this fight (DD.AI.fightLevel's). */
  function songFlat(s) {
    const n = songCount(s);
    return (n - 1) * Math.round((lvl(SK.theme).dmg || 0) * fightDmg());
  }
  /** At 100 Villain Hype, at the start of the frontman's turn: the wind-up (instead of any other wind-up this turn). */
  function maybeLeadSong(unit, api) {
    const s = S(), d = LD(s);
    if (!d || !d.on || d.hype < N.hypeMax || frontman(s) !== unit) return false;
    if (has(unit, 'charmed') || has(unit, 'sheep') || pendingWindup(unit) || incapacitated(unit)) return false;
    const tiles = songTiles(s);
    if (!tiles.length) return false;
    const it = api.windUp(unit, SK.theme, { x: unit.x, y: unit.y }, { anchor: 'ground', tiles: tiles, label: 'The Theme Song',
      banner: 'The League takes a deep breath. Get out of the red!' });
    if (!it) return false;
    d.hype = 0;
    syncHype(s);
    stat('songs');
    bark(unit, 'song');
    return true;
  }

  // =================================================================================================================
  // Bodies, Spiteful Revival, deaths, mourning
  // =================================================================================================================
  /** The nearest free floor tile for a body: its own tile first (no unit, no object, no drop, no wall). */
  function bodySpot(x, y) {
    const s = S();
    if (!s) return null;
    const g = s.grid, max = g.w + g.h;
    for (let r = 0; r <= max; r++) {
      const ring = [];
      for (let dy = -r; dy <= r; dy++) {
        const k = r - Math.abs(dy);
        [k, -k].forEach(function (dx, i) { if (i === 0 || k !== 0) ring.push({ x: x + dx, y: y + dy }); });
      }
      ring.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], t = G().tile(p.x, p.y);
        if (!t || t.obj || G().unitAt(p.x, p.y) || G().isDrop(p.x, p.y)) continue;
        const td = G().terrain(t);
        if (!td || td.walkable === false || td.liquid) continue;
        return p;
      }
    }
    return null;
  }
  function placeBody(u) {
    const p = bodySpot(u.x, u.y);
    if (!p) return null;
    const o = A().placeObject(p.x, p.y, BODY, { label: u.name + '\'s Body (Dramatically Posed)', data: { defId: u.defId, name: u.name } });
    if (o) {
      stat('bodies');
      if (!quiet()) A().log(u.name + ' strikes a dramatic pose on the way down. The body stays (' + N.body + ' HP): break it, or Zargash prays it back up.', 'enemy');
    }
    return o;
  }
  function bodyTiles(s) {
    s = s || S();
    return s ? s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === BODY && t.obj.data && DD.getEnemy(t.obj.data.defId); }) : [];
  }
  /** Zargash can still raise someone: alive and a Spiteful Revival left. */
  function canRaise(s) {
    const z = memberOf(ZARGASH, s);
    if (!z) return null;
    const sl = (z.skillSlots || []).filter(function (x) { return x.id === SK.revival; })[0];
    const def = DD.getSkill(SK.revival);
    return sl && def && (sl.uses || 0) < def.charges ? z : null;
  }
  /** AutoPlay: a body is worth breaking while Zargash can pray it up (a raise pending on it: right now). */
  function bodyValue(unit, obj, tile, state) {
    const s = state || S();
    const z = canRaise(s);
    if (!z || !tile) return 0;
    const it = windupOf(z, SK.revival);
    if (it && it.abs && it.abs.x === tile.x && it.abs.y === tile.y) return N.bodyHintPending;
    return N.bodyHint;
  }
  function bodyBroken(o, tile, src) {
    stat('broken');
    if (quiet()) return;
    const who = (o.data && o.data.name) || 'Somebody';
    A().log(who + '\'s body is broken: no comeback for ' + who + (src && src.name ? ' (' + src.name + ')' : '') + '.', 'hero');
    DD.FX.text({ x: tile.x, y: tile.y }, 'NO SEQUEL!', { color: '#9bff3a', size: 15 });
  }

  /** Too Evil to Drown: dropped into the Shark Tank (a fall), a member takes 20 and Bleeds instead of dying. */
  function drowned(u) {
    A().addStatus(u, 'bleed', { stacks: N.tankBleed }, null);
    stat('drowned');
    if (quiet()) return;
    DD.FX.text(u, 'TOO EVIL TO DROWN!', { color: '#9bff3a', size: 15 });
    A().log(u.name + ' is Too Evil to Drown: ' + N.tank + ' damage and Bleed ' + N.tankBleed + ', and climbs out of the Shark Tank.', 'enemy');
    bark(u, 'drowned', 0.8);
  }

  /** A member fell: a body, Villain Hype, one living member mourns (cosmetic), the last one standing speaks up. */
  function fallen(u) {
    const s = S(), d = LD(s);
    placeBody(u);
    addHype(N.hypeFall, u.name + ' fell');
    if (quiet()) return;
    const left = members(s);
    if (!left.length) {
      if (d && !d.over) { d.over = true; A().narrate('league_death', {}); }
      return;
    }
    const key = 'mourn_' + SHORT[u.defId];
    const mourners = left.filter(function (m) { const def = DD.getEnemy(m.defId); return def && def.barks && def.barks[key] && !has(m, 'sheep'); });
    if (mourners.length) A().bark(mourners[Math.floor(DD.rng.next() * mourners.length)], key);
    if (left.length === 1 && d && !d.last) { d.last = true; bark(left[0], 'last'); }
  }

  // Expendable Friends (Skylla): the nearest other member takes the blow (ties: lowest HP, then the frontman order)
  function expendableVictim(u) {
    return members().filter(function (m) { return m !== u; }).sort(function (a, b) {
      return dist(a, u) - dist(b, u) || a.hp - b.hp || FRONT.indexOf(a.defId) - FRONT.indexOf(b.defId) || (a.id < b.id ? -1 : 1);
    })[0] || null;
  }

  /** Before a member dies: Too Evil to Drown (falls), then Skylla's Expendable Friends (once a fight). */
  function preventDeathOf(unit, d) {
    if (d && d.cause === 'fall') {
      const before = Math.max(0, unit.hp || 0) + (Number(d.dealt) || 0);
      unit.hp = Math.max(1, (before > 0 ? before : unit.maxHp) - N.tank);
      d.lgDrown = true;
      return true;
    }
    if (unit.defId !== SKYLLA) return undefined;
    const ld = LD();
    if (ld ? ld.expended : unit.data.lgExpended) return undefined;
    const v = expendableVictim(unit);
    if (!v) return undefined;
    if (ld) ld.expended = true; else unit.data.lgExpended = true;
    unit.hp = 1;
    d.lgSwap = v.id;
    return true;
  }
  function deathPrevented(unit, d) {
    if (d && d.lgDrown) { drowned(unit); return; }
    if (!d || !d.lgSwap) return;
    const v = DD.Combat.byId(d.lgSwap);
    stat('expended');
    if (!quiet()) {
      DD.FX.text(unit, 'EXPENDABLE FRIENDS!', { color: '#c77dff', size: 16 });
      if (v) A().log('Skylla sidesteps the killing blow. It lands on ' + v.name + ' instead. She is not sorry.', 'enemy');
      bark(unit, 'expendable');
    }
    if (active(v)) A().kill(v, d.credit || d.source || null, { cause: 'other', text: 'EXPENDABLE!' });
  }

  // ---- Union Rules (a knob, off by default: a member that was just stunned shrugs off the next stun) -----------------
  function unionCancel(m) {
    if (!N.unionRules || !m || !m.unit || !A().isStunLike(m.id)) return;
    const g = m.unit.data && m.unit.data.lgUnion;
    if (!g) return;
    m.cancel = true;
    if (!quiet()) DD.FX.text(m.unit, '📜 Union Rules: shrugs it off', { color: '#e8e2c8', size: 14 });
  }
  function unionArm(unit, st) {
    if (!N.unionRules || !st || !A().isStunLike(st.id)) return;
    const s = S();
    unit.data.lgUnion = { turn: s ? s.turn : 0, lost: false };
  }
  function unionTick(unit) {
    const g = unit.data && unit.data.lgUnion, s = S();
    if (!g || !s || s.turn <= g.turn) return;
    if (!g.lost) g.lost = true; else unit.data.lgUnion = null;
  }

  // ---- passives that follow the unit's state ---------------------------------------------------------------------
  /** Warduke below half HP: Unreasonable (immovable, +3); healed above half, reasonable again. */
  function syncUnreasonable(u) {
    if (!u || u.defId !== WARDUKE || u.dead) return;
    const want = active(u) && u.hp < u.maxHp / 2;
    const on = has(u, ST.unreasonable);
    if (want && !on) {
      A().addStatus(u, ST.unreasonable, { turns: -1 }, u);
      u.flags.immovable = true;
      A().touch();
      if (!quiet()) { A().log('Warduke is Unreasonable now: immovable, and his hits deal +' + N.unreasonable + ' damage.', 'enemy'); bark(u, 'unreasonable'); }
    } else if (!want && on) A().removeStatus(u, ST.unreasonable, { silent: quiet() });
  }
  /** Passive statuses a member wears (also after a Spiteful Revival or a dispel). */
  function ensure(u) {
    if (!active(u)) return;
    if (u.defId === KELEK && !has(u, ST.shield)) A().addStatus(u, ST.shield, { turns: -1, silent: true }, u);
    if (u.defId === WARDUKE) syncUnreasonable(u);
  }

  // ---- the member hooks (every member: the def's own hooks merged over these) ---------------------------------------
  function hooksFor(extra) {
    const base = {
      onCombatStart: function (unit) { ensure(unit); },
      onTurnStart: function (unit) { ensure(unit); },
      onTurnEnd: function (unit) { unionTick(unit); },
      preventDeath: function (unit, d) { return preventDeathOf(unit, d); },
      onDeathPrevented: function (unit, d) { deathPrevented(unit, d); },
      onDeath: function (unit) { fallen(unit); },
      modifyStatus: function (m) { unionCancel(m); },
      onStatusApplied: function (unit, st) { unionArm(unit, st); },
      // The Theme Song: one voice is the skill's own number, every further voice rides on d.flat (the wind-up's
      // telegraphFlat shows the same number)
      modifyOutgoingDamage: function (d) {
        if (d.cause !== 'skill' || d.opportunity || !d.skill) return;
        if (d.skill.id === SK.theme) d.flat += songFlat();
        if (d.source && d.source.defId === ZARAK && (d.skill.id === SK.shins || d.skill.id === SK.tunnel) && flanked(d.target, d.source)) d.flat += N.sneak;
      },
    };
    return Object.assign(base, extra || {});
  }

  // =================================================================================================================
  // Skills
  // =================================================================================================================
  function lunge(ctx) { if (ctx.target) DD.FX.lunge(ctx.user, ctx.target); }
  function hitFoes(ctx, dmg, opts) {
    const hit = [];
    ctx.foes.forEach(function (f) { if (active(f)) { A().damage(ctx.user, f, dmg, opts); hit.push(f); } });
    return hit;
  }
  function attackBark(u) { if (!quiet() && !sayNamed(u, 0.12)) A().maybeBark(u, 'attack', 0.25); }

  // -- Warduke --
  /** Bodyguard: a hero next to Kelek, Skylla or Zargash is worth more to him. */
  function bodyguardScore(ctx) {
    const v = ctx.targetUnit;
    if (!v) return 0;
    return members().some(function (m) { return m.defId !== WARDUKE && m.defId !== ZARAK && dist(m, v) === 1; }) ? 6 : 0;
  }
  /** Where a punt would take the victim: { fell, crash: 'unit'|'object'|'wall'|null, at: {x,y} } (no side effects). */
  function puntPath(user, v, steps) {
    const dir = U.dirTo(user, v);
    const res = { fell: false, crash: null, at: { x: v.x, y: v.y }, unit: null };
    if (!dir.x && !dir.y) return res;
    for (let i = 0; i < steps; i++) {
      const nx = res.at.x + dir.x, ny = res.at.y + dir.y;
      const t = G().tile(nx, ny);
      if (!t) { res.crash = 'wall'; break; }
      const o = G().unitAt(nx, ny);
      if (o) { res.crash = 'unit'; res.unit = o; break; }
      if (t.obj && G().objBlocksMove(t.obj)) { res.crash = 'object'; break; }
      if (!G().isFlying(v) && G().isDrop(nx, ny)) { res.fell = true; res.at = { x: nx, y: ny }; break; }
      const td = G().terrain(t);
      if (td.walkable === false) { res.crash = 'wall'; break; }
      if (!G().canStep(v, res.at, { x: nx, y: ny })) { res.crash = 'wall'; break; }
      res.at = { x: nx, y: ny };
    }
    return res;
  }
  function onFireballTiles(p) {
    const k = memberOf(KELEK);
    const it = k && windupOf(k, SK.fireball);
    return !!it && DD.AI.intentTiles(k, it).some(function (q) { return q.x === p.x && q.y === p.y; });
  }
  function puntScore(ctx) {
    const v = ctx.targetUnit;
    if (!v || A().isImmovable(v)) return -20;
    const r = puntPath(ctx.user, v, ctx.L.dist);
    let sc = bodyguardScore(ctx) - 8;
    if (r.fell) sc += v.kind === 'hero' ? 22 : 0;
    if (r.crash === 'unit' && r.unit && G().hostile(ctx.user, r.unit)) sc += 14;
    else if (r.crash === 'unit') sc -= 6;
    else if (r.crash) sc += 7;
    if (!r.fell && onFireballTiles(r.at)) sc += 12;
    return sc;
  }
  eskill({ id: SK.skull, name: 'Skull Splitter', icon: '⚔️', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 11 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'Billed per skull. He offers volume discounts. Nobody has ever asked for one.',
    aiScore: bodyguardScore,
    execute: function (ctx) { lunge(ctx); attackBark(ctx.user); hitFoes(ctx, ctx.L.dmg); } });
  eskill({ id: SK.punt, name: 'Hero Punt', icon: '🦶', kind: 'attack', tags: ['melee', 'push'], anchor: 'self', cooldown: 2,
    levels: [{ dist: 3, crash: 7 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Punt an adjacent foe ' + L.dist + ' tiles away; on a crash, it and what it hits take ' + L.crash + ' damage.'; },
    flavor: 'A separate line item on the invoice. Kicking is extra.',
    aiScore: puntScore,
    execute: function (ctx) {
      lunge(ctx);
      bark(ctx.user, 'punt', 0.5);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        const r = A().push(ctx.user, f, U.dirTo(ctx.user, f), ctx.L.dist, { bump: ctx.L.crash });
        if (r && r.fell) stat('punted');
      });
    } });

  // -- Zarak --
  function sneakFlat(unit, intent) { return flanked(intentVictim(unit, intent), unit) ? N.sneak : 0; }
  function sneakScore(ctx) { return ctx.targetUnit && flanked(ctx.targetUnit, ctx.user) ? N.sneak : 0; }
  /** Where Tunnel Ambush pops up next to the victim: the free, safe tile closest to Zarak (then reading order). */
  function landingFor(user, v) {
    if (!user || !v) return null;
    const out = U.DIRS.map(function (d) { return { x: v.x + d.x, y: v.y + d.y }; }).filter(function (p) {
      if (p.x === user.x && p.y === user.y) return true;
      return G().isFree(p.x, p.y, user) && !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y, user);
    });
    out.sort(function (a, b) { return dist(a, user) - dist(b, user) || a.y - b.y || a.x - b.x; });
    return out[0] || null;
  }
  eskill({ id: SK.shins, name: 'Shin Splitter', icon: '🗡️', kind: 'attack', tags: ['melee', 'bleed'], anchor: 'self',
    levels: [{ dmg: 8, bleed: 2 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Bleed ' + L.bleed + '.'; },
    flavor: 'He goes for the shins. He insists this is an orc tradition. It is a dwarf tradition.',
    telegraphFlat: sneakFlat, aiScore: sneakScore,
    execute: function (ctx) {
      lunge(ctx);
      attackBark(ctx.user);
      hitFoes(ctx, ctx.L.dmg).forEach(function (f) { if (active(f)) A().addStatus(f, 'bleed', { stacks: ctx.L.bleed }, ctx.user); });
    } });
  eskill({ id: SK.tunnel, name: 'Tunnel Ambush', icon: '⛏️', kind: 'attack', tags: ['move'], anchor: 'unit', cooldown: 3, fromStand: true,
    levels: [{ dmg: 10, r: 6 }],
    target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: false,
      canTarget: function (ctx) { return landingFor(ctx.user, ctx.targetUnit) ? true : 'No room to pop up next to it.'; } },
    desc: function (L) {
      return 'Burrow and pop up next to a foe within ' + L.r + ' (no line of sight needed; a dash never provokes): ' + L.dmg +
        ' damage, and it is Slowed through its next turn.';
    },
    flavor: 'Orcs tunnel, he says. Mostly to get away from people calling him a dwarf.',
    telegraphFlat: sneakFlat, aiScore: sneakScore,
    execute: function (ctx) {
      const u = ctx.user, v = ctx.targetUnit;
      const p = landingFor(u, v);
      if (!active(v) || !p) { if (!quiet()) A().log(u.name + ' tunnels... and finds no room to pop up.', 'enemy'); return; }
      if (p.x !== u.x || p.y !== u.y) {
        DD.FX.particles(u, { kind: 'dust', count: 12 });
        if (!A().teleport(u, p.x, p.y, { fx: true })) return;
        DD.FX.particles(p, { kind: 'dust', count: 12 });
      }
      bark(u, 'tunnel', 0.5);
      DD.FX.lunge(u, v);
      A().damage(u, v, ctx.L.dmg);
      if (active(v)) A().addStatus(v, 'slow', { turns: 1 }, u);
      stat('tunnels');
    } });

  // -- Kelek --
  /** Evil Missiles' targets: up to 3 foes within reach (DD.AI.targetsFor: stealth and taunt), lowest HP first. */
  function missileFoes(user, state) {
    const s = state || S();
    if (!s || !user) return [];
    const L = lvl(SK.missiles);
    const pool = DD.AI && DD.AI.targetsFor ? DD.AI.targetsFor(user) : s.units.filter(function (o) { return active(o) && G().hostile(user, o); });
    return pool.filter(function (o) { return active(o) && dist(o, user) <= L.r; })
      .sort(function (a, b) { return a.hp - b.hp || dist(a, user) - dist(b, user) || (a.id < b.id ? -1 : 1); }).slice(0, L.n);
  }
  eskill({ id: SK.missiles, name: 'Evil Missiles', icon: '✨', kind: 'spell', tags: ['ranged', 'magic'], anchor: 'self',
    levels: [{ dmg: 4, n: 3, r: 6 }], target: { type: 'self' },
    area: { shape: 'custom', fn: function (ctx) { return missileFoes(ctx.user, ctx.state).map(function (o) { return { x: o.x, y: o.y }; }); } },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to each of up to ' + L.n + ' foes within ' + L.r + '. The bolts curve: no line of sight needed.'; },
    flavor: 'Unlicensed. The licence belongs to Ringlerun, along with everything else Kelek wants.',
    execute: function (ctx) {
      attackBark(ctx.user);
      ctx.foes.forEach(function (f, i) { DD.FX.projectile(ctx.user, f, { kind: 'orb', color: '#9bff3a', parallel: i > 0 }); });
      hitFoes(ctx, ctx.L.dmg);
    } });
  eskill({ id: SK.fireball, name: 'Unspeakable Fireball', icon: '🔥', kind: 'spell', tags: ['fire', 'aoe'], anchor: 'ground', cooldown: 2, windupOnly: true,
    levels: [{ dmg: 16, r: 2, range: 7 }],
    target: { type: 'tile', range: function (L) { return [0, L.range]; }, filter: 'any', los: true },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) {
      return 'Wind-up: next turn a fireball bursts in radius ' + L.r + ' around a tile within ' + L.range + ': ' + L.dmg +
        ' fire damage to every unit there, League included.';
    },
    flavor: 'He refuses to say its name. He will, however, describe it at length.',
    execute: function (ctx) {
      const c = ctx.target || ctx.user;
      DD.FX.explosion(c, { radius: ctx.L.r, color: '#9bff3a' });
      DD.FX.shake(8, 320);
      if (!quiet()) A().log('The Unspeakable Fireball goes off. Kelek speaks of it at length anyway.', 'enemy');
      stat('fireballs');
      ctx.units.forEach(function (v) { if (active(v)) A().damage(ctx.user, v, ctx.L.dmg, { element: 'fire', tags: ['fireball'] }); });
    } });
  eskill({ id: SK.theme, name: 'The Theme Song', icon: '🎤', kind: 'attack', tags: ['aoe', 'psychic', 'song'], anchor: 'ground', windupOnly: true,
    levels: [{ dmg: 5, r: 3 }], target: { type: 'tile', range: [0, 99], filter: 'any', los: false },
    area: { shape: 'custom', fn: function (ctx) { return songTiles(ctx.state); } },
    desc: function (L) {
      return 'Wind-up: the League sings its own name. Next turn every foe on the marked tiles (within ' + L.r + ' of a singing member when the song ' +
        'starts) takes ' + L.dmg + ' psychic damage per singing member (members on the Villain Podium count twice). Dead, stunned, asleep, frozen, ' +
        'charmed or sheeped members don\'t sing.';
    },
    flavor: 'The lyrics are just the name. All fifty-six letters of it. In harmony, more or less.',
    telegraphFlat: function () { return songFlat(); },
    execute: function (ctx) {
      const n = songCount(ctx.state);
      if (n <= 0) { if (!quiet()) A().log('The Theme Song fizzles: nobody is left to sing it.', 'enemy'); return; }
      DD.FX.banner('🎤 THE THEME SONG', { sub: '♪ L-E-A-G-U-E... and some more letters... of Villainy! ♪ (' + n + ' voice' + (n === 1 ? '' : 's') + ')', color: '#9bff3a', ms: 1000 });
      DD.FX.particles(ctx.user, { kind: 'notes', count: 16 });
      stat('songLanded');
      // a song carries the same from any height (no high ground: the number on the marked tiles is the hit)
      const hits = hitFoes(ctx, ctx.L.dmg, { element: 'psychic', tags: ['song'], noHighGround: true });
      hits.forEach(function () { stat('songHits'); });
      // QA FIGHTS-10: the narration matches the outcome (stepping out of the red is the counter)
      if (!quiet()) A().narrate(hits.length ? 'league_song' : 'league_song_whiff', {});
    } });

  // -- Skylla --
  /** Where Eldritch Blah's pull leaves the victim (no side effects). */
  function pullEnd(user, v, n) {
    const dir = U.dirTo(v, user);
    let at = { x: v.x, y: v.y };
    for (let i = 0; i < n; i++) {
      const nx = at.x + dir.x, ny = at.y + dir.y;
      if (nx === user.x && ny === user.y) break;
      const t = G().tile(nx, ny);
      if (!t || G().unitAt(nx, ny) || (t.obj && G().objBlocksMove(t.obj)) || G().terrain(t).walkable === false || G().isDrop(nx, ny)) break;
      if (!G().canStep(v, at, { x: nx, y: ny })) break;
      at = { x: nx, y: ny };
    }
    return at;
  }
  function blahScore(ctx) {
    const v = ctx.targetUnit;
    if (!v || A().isImmovable(v)) return 0;
    const at = pullEnd(ctx.user, v, ctx.L.pull);
    const combo = members().some(function (m) { return (m.defId === WARDUKE || m.defId === ZARAK) && dist(m, at) === 1; });
    return combo ? 5 : 0;
  }
  eskill({ id: SK.blah, name: 'Eldritch Blah', icon: '🌀', kind: 'spell', tags: ['ranged', 'pull'], anchor: 'unit',
    levels: [{ dmg: 8, pull: 2, r: 6 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe within ' + L.r + ' and pull it ' + L.pull + ' tiles toward her.'; },
    flavor: 'Like Eldritch Blast, but she couldn\'t be bothered to finish the word.',
    aiScore: blahScore,
    execute: function (ctx) {
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.beam(ctx.user, f, { color: '#c77dff', width: 3 });
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().pull(ctx.user, f, ctx.user, ctx.L.pull);
      });
    } });
  eskill({ id: SK.hex, name: 'Hex of Mild Inconvenience', icon: '🧿', kind: 'spell', tags: ['ranged', 'debuff'], anchor: 'unit', cooldown: 2,
    levels: [{ turns: 2, r: 6 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'A foe within ' + L.r + ' is Vulnerable (+25% damage taken) for its next ' + L.turns + ' turns.'; },
    flavor: 'Baba Yaga taught her this one. It was meant for door-to-door salesmen.',
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.beam(ctx.user, f, { color: '#c77dff', width: 2 });
        A().addStatus(f, 'vulnerable', { turns: ctx.L.turns }, ctx.user);
      });
      bark(ctx.user, 'attack', 0.25);
    } });

  // -- Zargash --
  eskill({ id: SK.smite, name: 'Smite of Disapproval', icon: '🔨', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 8 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'Orcus disapproves of you. Zargash is merely the delivery service.',
    execute: function (ctx) { lunge(ctx); attackBark(ctx.user); hitFoes(ctx, ctx.L.dmg, { element: 'necrotic' }); } });
  eskill({ id: SK.water, name: 'Unholy Water (Tap)', icon: '🚰', kind: 'heal', tags: ['heal'], anchor: 'unit', cooldown: 1,
    levels: [{ heal: 12, r: 5 }],
    target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'ally', los: false, revive: false,
      canTarget: function (ctx) { return ctx.targetUnit && ctx.targetUnit !== ctx.user && isLeague(ctx.targetUnit) ? true : 'Only another League member.'; } },
    desc: function (L) { return 'Heal another League member within ' + L.r + ' for ' + L.heal + ' HP.'; },
    flavor: 'Blessed by Orcus. Bottled from the tap. Nobody asks which one.',
    execute: function (ctx) {
      const v = ctx.targetUnit;
      if (!active(v)) return;
      DD.FX.projectile(ctx.user, v, { kind: 'flask', color: '#7a2a8a' });
      A().heal(ctx.user, v, ctx.L.heal);
      bark(ctx.user, 'heal', 0.5);
    } });
  eskill({ id: SK.revival, name: 'Spiteful Revival', icon: '💀', kind: 'spell', tags: ['revive'], anchor: 'ground', charges: 2, windupOnly: true,
    levels: [{ r: 4 }], target: { type: 'tile', range: function (L) { return [0, L.r]; }, filter: 'any', los: false },
    desc: function (L) {
      return 'Wind-up: next turn the League member whose body lies on the marked tile (within ' + L.r + ' of him) gets back up with half its max HP. ' +
        'Break the body or interrupt him to stop it. Twice per fight.';
    },
    flavor: 'Raising the dead is literally his god\'s whole thing. Orcus charges overtime.',
    execute: function (ctx) {
      const u = ctx.user, at = (ctx.intent && ctx.intent.abs) || ctx.target;
      const t = tileOf(at);
      const body = t && t.obj && t.obj.id === BODY ? t.obj : null;
      const defId = body && body.data && body.data.defId;
      if (!body || !DD.getEnemy(defId)) {
        stat('fizzled');
        if (!quiet()) A().log('Spiteful Revival fizzles: there is no body left to raise.', 'enemy');
        return;
      }
      A().removeObject(at.x, at.y);
      const m = A().spawn(defId, at.x, at.y, { silent: true });
      if (!m) { A().placeObject(at.x, at.y, BODY, body); stat('fizzled'); return; }
      m.hp = Math.max(1, Math.ceil(m.maxHp * N.raiseFrac));
      m.data.raised = true;
      A().touch();
      ensure(m);
      stat('raised');
      DD.FX.particles(m, { kind: 'runes', count: 16 });
      if (!quiet()) {
        DD.FX.text(m, 'BACK FROM THE DEAD!', { color: '#ff5a3a', size: 16 });
        A().log(u.name + ' prays ' + m.name + ' back up (' + m.hp + ' HP). Orcus accepts the overtime.', 'enemy');
        bark(m, 'raised');
      }
    } });

  // =================================================================================================================
  // Statuses
  // =================================================================================================================
  DD.registerStatus({ id: ST.shield, name: 'Meat Shield', icon: '🛡️', color: '#9bff3a', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    takenMult: function (st, u) { return u && wardukeNext(u) ? 0.5 : 1; },
    desc: function () { return 'Takes half damage while Warduke stands next to him.'; } });
  DD.registerStatus({ id: ST.unreasonable, name: 'Unreasonable', icon: '😤', color: '#ff5a3a', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () { return 'Below half HP and furious about it: immovable, and his skill hits deal +' + N.unreasonable + ' damage.'; },
    telegraphFlat: function () { return N.unreasonable; },
    onRemove: function (unit) { const def = DD.getEnemy(unit.defId); unit.flags.immovable = !!(def && def.flags && def.flags.immovable); DD.Act.touch(); },
    hooks: {
      modifyOutgoingDamage: function (d) { if (d.cause === 'skill' && !d.opportunity) d.flat += N.unreasonable; },
      // on an attack of opportunity the +3 rides on o.flat (the move preview and path choice see it; once per o)
      modifyOpportunity: function (o) {
        if (!o.attacker || o.lgUnr || !DD.Act.hasStatus(o.attacker, ST.unreasonable)) return;
        o.lgUnr = true;
        o.flat += N.unreasonable;
      },
    } });

  // =================================================================================================================
  // Terrain and objects
  // =================================================================================================================
  function drawFin(g, t) {
    if (!t || (t.x * 7 + t.y * 3) % 4 !== 0) return;
    const k = (g.t || 0) * 1.3 + t.x;
    const sx = Math.sin(k) * 7;
    g.ellipse(sx, 1, 9, 3.5, 'rgba(220,240,255,0.25)');
    g.poly([[sx - 5, 2], [sx + 1, -9], [sx + 4, 2]], '#4a5566', 'rgba(20,24,32,0.8)');
  }
  DD.registerTerrain({ id: TANK, name: 'The Shark Tank', walkable: false, liquid: 'deep',
    colors: { top: '#1d4a6e', left: '#163a57', right: '#112e45' },
    desc: 'Impassable. Anyone pushed or dropped in sinks: heroes lose 25% of max HP and climb out at the edge; League members are Too Evil to ' +
      'Drown (' + N.tank + ' damage and Bleed ' + N.tankBleed + ', then they climb out). The shark is unionised.',
    react: { fire: { surface: 'steam', turns: 1 }, frost: { terrain: 'ice', melt: TANK }, lightning: { shock: true } },
    draw: drawFin });
  DD.registerTerrain({ id: FLOOR, name: 'Black Marble', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#2b2433', left: '#201a28', right: '#18131f' },
    desc: 'Black marble, polished nightly by henchmen. Evil has a cleaning budget.',
    draw: function (g, t) {
      if (!t || (t.x * 5 + t.y * 3) % 3 !== 0) return;
      g.line(-14, -2, 2, 4, 'rgba(220,210,255,0.16)', 0.8);
      g.line(2, 4, 12, 1, 'rgba(220,210,255,0.12)', 0.6);
    } });
  DD.registerTerrain({ id: CARPET, name: 'Villainous Carpet', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#3d1d57', left: '#2d1541', right: '#231034' },
    desc: 'A purple runway for dramatic entrances, with acid-green trim. Dry-clean only.',
    draw: function (g) { g.diamond(0, 0, 27, 13.5, null, 'rgba(155,255,58,0.3)'); } });
  DD.registerTerrain({ id: PODIUM, name: 'The Villain Podium', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#4a2468', left: '#341848', right: '#2a123a' },
    desc: 'Two levels up, with a spotlight. A League member singing The Theme Song here counts twice. There is a trapdoor (see the Trapdoor Lever).',
    draw: function (g) { g.diamond(0, 0, 26, 13, null, 'rgba(155,255,58,0.55)'); g.diamond(0, 0, 18, 9, null, 'rgba(155,255,58,0.25)'); } });

  function drawBody(g, obj) {
    const t = g.t || 0;
    g.ellipse(0, 2, 15, 5.5, 'rgba(0,0,0,0.3)');
    g.ellipse(0, -2, 13, 5, '#3a1a52', true);                          // the cape, draped
    g.line(-9, -3.5, 7, -0.5, '#9bff3a', 2.4);                          // the League sash
    g.circle(-10, -5, 3.6, '#d9c7b8', true);                           // head
    g.ellipse(-10.5, -8.4, 3.2, 1.6, '#d9c7b8', true, -0.4);          // a hand over the brow
    g.text('L', 2, -4.6, 5, '#14240a');
    if (Math.sin(t * 1.7) > 0.6) g.text('*sigh*', 4, -14, 5, 'rgba(255,255,255,0.75)', { bold: false });
  }
  DD.registerObject({ id: BODY, name: 'Villain\'s Body (Dramatically Posed)', blocksMove: true, blocksLos: false, hp: N.body, height: 0.35,
    color: '#3a1a52', targetable: true,
    desc: 'A fallen League member, posed for maximum drama: ' + N.body + ' HP, blocks movement but not sight. Zargash can pray it back up (Spiteful ' +
      'Revival); any single-target damage skill can break it, and then it stays down.',
    autoplay: function (unit, obj, tile, state, how) { return how && how !== 'break' ? 0 : bodyValue(unit, obj, tile, state); },
    onDestroyed: function (o, tile, src) { bodyBroken(o, tile, src); },
    draw: drawBody });

  /** Everyone on the Villain Podium (not flying) drops into the nearest Shark Tank tile; the engine climbs them out. */
  function trapdoor(src) {
    const s = S();
    if (!s) return 0;
    const tank = s.grid.tiles.filter(function (t) { return t.t === TANK; });
    if (!tank.length) return 0;
    const victims = s.units.filter(function (u) { return active(u) && onPodium(u) && !G().isFlying(u); });
    victims.forEach(function (u) {
      if (!active(u)) return;
      const to = tank.slice().sort(function (a, b) { return dist(a, u) - dist(b, u) || a.y - b.y || a.x - b.x; })[0];
      const from = { x: u.x, y: u.y };
      u.x = to.x; u.y = to.y;
      A().touch();
      DD.FX.jump(u, from, to);
      stat('dropped');
      A().fall(u, src || null);
    });
    return victims.length;
  }
  function pullLever(unit, o) {
    const s = S();
    o.data.usedRound = s ? s.round || 1 : 1;
    stat('lever');
    DD.FX.shake(6, 300);
    if (!quiet()) {
      DD.FX.text(unit, 'KA-CHUNK!', { color: '#9bff3a', size: 16 });
      A().narrate('league_trapdoor', {});
    }
    const n = trapdoor(unit);
    if (!quiet() && !n) A().log('The trapdoor opens under an empty podium. Somewhere, a shark sighs.', 'system');
  }
  function leverValue(unit, obj) {
    if (!obj || (obj.data && obj.data.usedRound)) return 0;
    const s = S();
    if (!s) return 0;
    let v = 0;
    s.units.forEach(function (u) {
      if (!active(u) || !onPodium(u) || G().isFlying(u)) return;
      if (isLeague(u) && G().hostile(unit, u)) v += 25;
      else if (!G().hostile(unit, u)) v -= 15;
    });
    return v;
  }
  function drawLever(g, obj) {
    const used = !!(obj && obj.data && obj.data.usedRound);
    g.ellipse(0, 2, 14, 6, 'rgba(0,0,0,0.3)');
    g.box(0, 0, 10, 5, 9, { top: '#3a2a4a', left: '#2a1c36', right: '#21152b' }, true);
    const a = used ? 0.75 : -0.75, ex = Math.sin(a) * 15, ey = -9 - Math.cos(a) * 14;
    g.line(0, -9, ex, ey, '#1a1014', 3.6);
    g.line(0, -9, ex, ey, '#c9b037', 2);
    g.circle(ex, ey, 3.2, used ? '#777777' : '#9bff3a', true);
    g.rect(-9, -26, 18, 7, '#f3ecd6', true, 1);
    g.text('TRAPDOOR', 0, -22.5, 3.6, '#7a1020');
  }
  DD.registerObject({ id: LEVER, name: 'Trapdoor Lever', blocksMove: true, blocksLos: false, hp: 0, height: 0.9, color: '#9bff3a', yawAware: true,
    desc: 'Pull it (1 AP, from next to it): the Villain Podium\'s trapdoor opens. Everyone standing on the podium drops into the Shark Tank (heroes: 25% ' +
      'of max HP and Wet; League members: ' + N.tank + ' damage and Bleed ' + N.tankBleed + ') and climbs out at the tank\'s edge. Flyers stay put. It ' +
      'resets at the end of the third round after.',
    init: function (o) { if (!o.data.usedRound) o.data.usedRound = 0; },
    available: function (o) { return !(o.data && o.data.usedRound); },
    interact: { ap: 1, label: 'Pull the Trapdoor Lever', fn: function (unit, o) { pullLever(unit, o); } },
    autoplay: function (unit, obj, tile, state, how) { return how && how !== 'interact' ? 0 : leverValue(unit, obj); },
    draw: drawLever });

  function drawTable(g) {
    g.ellipse(0, 3, 26, 9, 'rgba(0,0,0,0.25)');
    g.box(0, 0, 24, 12, 13, { top: '#2a1838', left: '#1e1028', right: '#170c1f' }, true);
    g.diamond(0, -13, 20, 10, null, 'rgba(155,255,58,0.6)');
  }
  DD.registerObject({ id: TABLE, name: 'Evil Conference Table', blocksMove: true, blocksLos: false, hp: 0, height: 0.45, color: '#2a1838', yawAware: true,
    desc: 'Blocks movement, not sight. Minutes of the last meeting: "Item one: EVIL (unanimous). Item two: whose turn it is to bring snacks (tabled)."',
    draw: drawTable });

  // =================================================================================================================
  // AI (each member on its own initiative entry)
  // =================================================================================================================
  /** Stand spots: here + the move action's reachable tiles (never a lethal walk). */
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
  /** The best spot by value(p) (−Infinity = never) minus its walk's price; null when none is allowed. */
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
  /** Walk to a spot (a move action). Returns true when it ended there. */
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
  /** The engine's best attack among `skills`: walk there, then use it (re-aimed if a reaction cut the walk short). */
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
  function nearestFoe(p, foes) { let d = Infinity; foes.forEach(function (f) { d = Math.min(d, dist(f, p)); }); return d; }
  function adjacentFoes(p, foes) { return foes.filter(function (f) { return dist(f, p) === 1; }).length; }

  // -- Kelek: keep 3 away (next to Warduke and on the podium if he can), missiles now, the fireball wind-up --
  function fireballCenter(unit) {
    const def = DD.getSkill(SK.fireball), L = lvl(SK.fireball);
    const foes = DD.AI.targetsFor(unit).filter(active);
    if (foes.length < 2) return null;
    const seen = {}, cands = [];
    foes.forEach(function (f) {
      for (let dy = -L.r; dy <= L.r; dy++) for (let dx = -(L.r - Math.abs(dy)); dx <= L.r - Math.abs(dy); dx++) {
        const p = { x: f.x + dx, y: f.y + dy }, k = p.x + ',' + p.y;
        if (seen[k] || !G().inBounds(p.x, p.y)) continue;
        seen[k] = 1;
        if (dist(p, unit) > L.range || !G().los(unit, p)) continue;
        cands.push(p);
      }
    });
    let best = null;
    cands.forEach(function (p) {
      let heroes = 0, friends = 0;
      DD.Targeting.area(unit, def, 1, p).forEach(function (q) {
        const o = G().unitAt(q.x, q.y);
        if (!active(o)) return;
        if (G().hostile(unit, o)) heroes++; else friends++;
      });
      if (heroes < 2) return;
      const sc = heroes * 2 - friends;
      if (!best || sc > best.sc || (sc === best.sc && dist(p, unit) < dist(best.p, unit))) best = { p: p, sc: sc };
    });
    return best && best.sc > 0 ? best.p : null;
  }
  function kelekTurn(unit, api) {
    const led = maybeLeadSong(unit, api);
    if (incapacitated(unit)) return;
    const foes = api.foes(unit);
    if (!foes.length) return;
    const missiles = api.canUse(unit, SK.missiles);
    const L = lvl(SK.missiles);
    const spot = bestSpot(unit, api, function (p) {
      let v = 0;
      if (missiles) v += Math.min(L.n, foes.filter(function (f) { return dist(f, p) <= L.r; }).length) * L.dmg;
      const near = nearestFoe(p, foes);
      if (near < 3) v -= (3 - near) * 4;
      if (wardukeNext(p)) v += 3;
      if (onPodium(p)) v += 2;
      return v;
    });
    if (spot) walkTo(unit, spot);
    if (incapacitated(unit)) return;
    if (missiles && missileFoes(unit).length) api.act(unit, SK.missiles, unit);
    if (incapacitated(unit) || led || pendingWindup(unit) || !api.canUse(unit, SK.fireball)) return;
    const c = fireballCenter(unit);
    if (c && api.windUp(unit, SK.fireball, c, { anchor: 'ground', label: 'Unspeakable Fireball' })) bark(unit, 'fireball', 0.7);
  }

  // -- Warduke: the engine's melee planner (Bodyguard and punt landings ride on aiScore) --
  function wardukeTurn(unit, api) {
    maybeLeadSong(unit, api);
    if (incapacitated(unit)) return;
    if (!doBest(unit, api, [SK.skull, SK.punt], MELEE)) api.approach(unit, MELEE);
  }

  // -- Zarak: Tunnel Ambush when nobody is next to him, else the diver's shins --
  function zarakTurn(unit, api) {
    maybeLeadSong(unit, api);
    if (incapacitated(unit)) return;
    const foes = api.foes(unit);
    if (!adjacentFoes(unit, foes) && api.canUse(unit, SK.tunnel)) {
      const b = api.bestAttack(unit, { skills: [SK.tunnel], style: DIVER, noMove: true });
      if (b) { fire(unit, api, b); return; }
    }
    if (!doBest(unit, api, [SK.shins], DIVER)) api.approach(unit, DIVER);
  }

  // -- Skylla: the Hex on Warduke's (or Zarak's) engaged foe, else Eldritch Blah (pulls toward the brutes) --
  function hexVictim(unit) {
    const brutes = members().filter(function (m) { return m.defId === WARDUKE || m.defId === ZARAK; });
    return DD.AI.targetsFor(unit).filter(function (f) {
      return active(f) && !has(f, 'vulnerable') && brutes.some(function (b) { return dist(b, f) === 1; });
    }).sort(function (a, b) { return a.hp - b.hp || (a.id < b.id ? -1 : 1); })[0] || null;
  }
  function skyllaTurn(unit, api) {
    maybeLeadSong(unit, api);
    if (incapacitated(unit)) return;
    const foes = api.foes(unit);
    if (api.canUse(unit, SK.hex)) {
      const v = hexVictim(unit), L = lvl(SK.hex);
      if (v) {
        const spot = bestSpot(unit, api, function (p) {
          if (dist(p, v) > L.r || !G().los(p, v)) return -Infinity;
          const near = nearestFoe(p, foes);
          return near < 2 ? -(2 - near) * 4 : 0;
        });
        if (spot) {
          walkTo(unit, spot);
          if (incapacitated(unit)) return;
          if (active(v) && dist(unit, v) <= L.r && G().los(unit, v)) { api.act(unit, SK.hex, v); return; }
          if (!doBest(unit, api, [SK.blah], KITER, true)) return;
          return;
        }
      }
    }
    if (!doBest(unit, api, [SK.blah], KITER)) api.approach(unit, KITER);
  }

  // -- Zargash: a revival if a body is in reach, else Unholy Water on the most hurt member, else Smite --
  const RAISE_PRIORITY = { lg_kelek: 5, lg_skylla: 4, lg_warduke: 4, lg_zarak: 3 };
  function tryRevival(unit, api) {
    if (pendingWindup(unit) || !api.canUse(unit, SK.revival)) return { done: false, moved: false };
    const L = lvl(SK.revival), bodies = bodyTiles();
    if (!bodies.length) return { done: false, moved: false };
    const foes = api.foes(unit);
    const spot = bestSpot(unit, api, function (p) {
      let v = -Infinity;
      bodies.forEach(function (b) { if (dist(p, b) <= L.r) v = Math.max(v, 10 + (RAISE_PRIORITY[b.obj.data.defId] || 2)); });
      return isFinite(v) ? v - adjacentFoes(p, foes) * 3 : v;
    });
    if (!spot) return { done: false, moved: false };
    const moved = !spot.here;
    walkTo(unit, spot);
    if (incapacitated(unit)) return { done: true, moved: moved };
    const pick = bodyTiles().filter(function (b) { return dist(unit, b) <= L.r; })
      .sort(function (a, b) { return (RAISE_PRIORITY[b.obj.data.defId] || 2) - (RAISE_PRIORITY[a.obj.data.defId] || 2) || dist(a, unit) - dist(b, unit) || a.y - b.y || a.x - b.x; })[0];
    if (!pick) return { done: false, moved: moved };
    const it = api.windUp(unit, SK.revival, { x: pick.x, y: pick.y }, { anchor: 'ground', tiles: [{ x: pick.x, y: pick.y }], label: 'Spiteful Revival' });
    if (it) bark(unit, 'raise');
    return { done: !!it, moved: moved };
  }
  function tryMend(unit, api, noMove) {
    if (!api.canUse(unit, SK.water)) return false;
    const L = lvl(SK.water);
    const hurt = members().filter(function (m) { return m !== unit && m.maxHp - m.hp >= L.heal; })
      .sort(function (a, b) { return (b.maxHp - b.hp) - (a.maxHp - a.hp) || (a.id < b.id ? -1 : 1); });
    if (!hurt.length) return false;
    const v = hurt[0], foes = api.foes(unit);
    let spot = { x: unit.x, y: unit.y, here: true };
    if (!noMove) {
      spot = bestSpot(unit, api, function (p) { return dist(p, v) <= L.r && dist(p, v) >= 1 ? -adjacentFoes(p, foes) * 3 : -Infinity; });
      if (!spot) return false;
      walkTo(unit, spot);
      if (incapacitated(unit)) return true;
    }
    if (dist(unit, v) > L.r || dist(unit, v) < 1 || !active(v)) return false;
    return api.act(unit, SK.water, v);
  }
  function zargashTurn(unit, api) {
    const led = maybeLeadSong(unit, api);
    if (incapacitated(unit)) return;
    let moved = false;
    if (!led) {
      const r = tryRevival(unit, api);
      if (r.done || incapacitated(unit)) return;
      moved = r.moved;
    }
    if (tryMend(unit, api, moved)) return;
    if (incapacitated(unit)) return;
    if (doBest(unit, api, [SK.smite], MELEE, moved)) return;
    if (!moved) api.approach(unit, MELEE);
  }

  // =================================================================================================================
  // Voice
  // =================================================================================================================
  // named lines: [hero id, line] — only a hero who is in the fight is named (namedLine)
  const NAMED = {
    lg_kelek: [
      ['syllamin', 'A bard, Syllamin? Interrupting MY monologue? Twice?!'],
      ['corelos', 'Corelos! You\'ll sign anything. Sign your staff over to me.'],
      ['zarathor', 'Zarathor! All that bling, and not one Staff of Power?'],
      ['ellaria', 'A druid\'s staff, Ellaria? Mine now. The corgis can stay.'],
      ['marbles', 'No staff, Professor Marbles? Then you\'re no use to me.'],
    ],
    lg_warduke: [
      ['marwyn', 'Marwyn. All shouting, no invoice. Amateur.'],
      ['slate', 'Slate. No face either. I respect that.'],
      ['betty', 'Betty. Horns on the head? Mine come on a helmet. Professional.'],
      ['basanos', 'Basanos. A monster hunter? I hunt hunters. Better pay.'],
      ['pebbles', 'A dog, Pebbles? ...No. I don\'t pet on the clock.'],
      // h19 (addendum-gus §20.4: any member, he; the League's professional)
      ['gus', 'The League of Villainy has a snack policy, Phat Gus. It\'s NO.'],
    ],
    lg_skylla: [
      ['zarathor', 'Two warlocks, Zarathor. Only one of us has a decent patron.'],
      ['syllamin', 'A bard, Syllamin? Please stop. I\'m begging. Flatly.'],
      ['kiri', 'Ghost arrows, Kiri. Cute. Mine are just curses.'],
      ['ellaria', 'Corgis, Ellaria? Baba\'s hut eats corgis. ...Kidding. Mostly.'],
      ['sparrow', 'Blood magic, Sparrow? So messy. Curses don\'t stain.'],
    ],
    lg_zarak: [
      ['benedick', 'A snail! At least nobody calls YOU a dwarf, Benedick!'],
      ['betty', 'Betty! A goat with a beard! See? Beards aren\'t a dwarf thing!'],
      ['marwyn', 'Marwyn! Huge beard! Nobody calls YOU a dwarf! Unfair!'],
      ['slate', 'You\'re a golem, Slate. You don\'t get to call ME short.'],
      ['hjalmar', 'Short and sneaky, Hjalmar? Respect. You\'re no dwarf either.'],
      // h19 (addendum-rasma §19.4, addendum-biz §19.4)
      ['rasma', 'A minotaur with a monocle! And they call ME a dwarf, Rasma?'],
      ['biz', 'That tin monkey called me a dwarf, Biz! Tell it I\'m an ORC!'],
    ],
    lg_zargash: [
      ['valdris', 'A cleric with good hair, Valdris. A sin. A vanity sin.'],
      ['josiah', 'A doctor, Josiah! I raise the dead. You just make more.'],
      ['basanos', 'Bad dog, Basanos. Very bad dog. Orcus approves.'],
      ['ellaria', 'Healing with corgis, Ellaria? Heresy. Adorable heresy.'],
    ],
  };
  function named(id) { return NAMED[id].map(function (p) { return p[1]; }); }

  // banter: [speaker def id, line] scripts, at a round start (30%, at most every other round), every speaker standing
  const BANTER = [
    [[KELEK, 'Behold, the Lllleeeeaaaaguuuueeee of Villainy!'], [WARDUKE, 'The League.'], [SKYLLA, 'It\'s longer than that.'],
      [WARDUKE, 'I\'m not paid by the letter.'], [SKYLLA, '...Fair.']],
    [[ZARAK, 'Nobody heard me sneak in.'], [SKYLLA, 'We all heard the dwarf, Zarak.'], [ZARAK, 'I am an ORC!']],
    [[ZARGASH, 'Bless this violence.'], [KELEK, 'Evilly!'], [ZARGASH, 'That\'s what I said.']],
    [[WARDUKE, 'My fee just doubled.'], [KELEK, 'The loot splits five ways. All five ways are me.'], [WARDUKE, 'Then it triples.']],
    [[SKYLLA, 'Can we go home?'], [KELEK, 'Evil never goes home!'], [SKYLLA, 'Baba\'s hut has legs. It could walk us home.']],
    [[KELEK, 'Dwarf! Flank them!'], [ZARAK, 'ORC!'], [KELEK, 'Orc! Flank them!'], [ZARAK, '...Thank you.']],
    [[KELEK, 'Phase four of my plan!'], [SKYLLA, 'We skipped phase three.'], [KELEK, 'Phase three is stealing Ringlerun\'s staff. Pending.']],
    [[ZARGASH, 'I am unforgiving.'], [WARDUKE, 'I am unpaid.'], [SKYLLA, 'I\'m unbothered.'], [ZARAK, 'And I\'m... an orc!'],
      [SKYLLA, 'Nobody asked, dwarf.']],
    [[WARDUKE, 'Kelek. The helm stays on.'], [KELEK, 'I didn\'t ask.'], [WARDUKE, 'You were going to.']],
    [[ZARGASH, 'Orcus put me on hold again.'], [SKYLLA, 'Baba never puts me on hold.'], [ZARGASH, 'Show-off.']],
  ];
  function banter(s) {
    const d = LD(s);
    if (!d || quiet() || s.round < 2 || s.round - d.banterRound < N.banterGap || DD.rng.next() >= N.banterChance) return false;
    const ok = BANTER.map(function (b, i) { return i; }).filter(function (i) {
      return !d.banter[i] && BANTER[i].every(function (l) { const m = memberOf(l[0], s); return m && !has(m, 'sheep'); });
    });
    if (!ok.length) return false;
    const i = ok[Math.floor(DD.rng.next() * ok.length)];
    d.banter[i] = 1;
    d.banterRound = s.round;
    BANTER[i].forEach(function (l, k) {
      const m = memberOf(l[0], s);
      if (!m) return;
      if (k > 0 && !DD.FX.instant) DD.FX.wait(550);
      A().bark(m, l[1]);
      A().log(m.name + ': "' + l[1] + '"', 'enemy');
    });
    return true;
  }
  function rollCall(s) {
    A().narrate('league_rollcall', {});
    FRONT.forEach(function (id) {
      const m = memberOf(id, s);
      if (m && !sayNamed(m, N.namedChance)) A().bark(m, 'spawn');
    });
  }

  // =================================================================================================================
  // Enemies
  // =================================================================================================================
  function sashOverlay(g) {
    if (g.pose === 'downed') return;
    g.line(-5.5, -20, 5, -8.5, '#9bff3a', 2.2);
    g.circle(-1.2, -14.8, 2.2, '#14240a', '#9bff3a');
    g.text('L', -1.2, -14.8, 3, '#9bff3a');
  }
  function kelekOverlay(g, t) {
    sashOverlay(g);
    const h = g.head;
    if (h) {
      const tw = Math.sin(t * 3) * 0.6;   // the waxed mustache twirls
      g.line(h.x - 0.5, h.y + h.r * 0.45, h.x - h.r * 0.95, h.y + h.r * 0.25 - tw, '#e8e2d8', 1.3);
      g.line(h.x + 0.5, h.y + h.r * 0.45, h.x + h.r * 0.95, h.y + h.r * 0.25 - tw, '#e8e2d8', 1.3);
      g.circle(h.x - h.r * 1.02, h.y + h.r * 0.1 - tw, 0.9, null, '#e8e2d8');
      g.circle(h.x + h.r * 1.02, h.y + h.r * 0.1 - tw, 0.9, null, '#e8e2d8');
    }
    const f = g.hands && g.hands.front;
    if (f) { g.rect(f.x + 1.5, f.y - 9, 7, 3.6, '#f3ecd6', '#1a1014', 0.5); g.text('MINE', f.x + 5, f.y - 7.2, 2.4, '#7a1020'); }
  }
  function wardukeOverlay(g, t) {
    sashOverlay(g);
    const h = g.head;
    if (!h) return;
    // the dread helm's faceplate: no face, ever
    g.rect(h.x - h.r * 0.8, h.y - h.r * 0.35, h.r * 1.6, h.r * 1.05, '#2e323c', '#1a1014', 1);
    g.line(h.x - h.r * 0.55, h.y + h.r * 0.05, h.x + h.r * 0.55, h.y + h.r * 0.05, '#0a0a0e', 1.4);
    g.line(h.x, h.y + h.r * 0.05, h.x, h.y + h.r * 0.6, '#0a0a0e', 1.2);
    const glow = 0.7 + 0.3 * Math.sin(t * 2.5);
    g.circle(h.x - h.r * 0.28, h.y + h.r * 0.03, 0.9, 'rgba(255,58,42,' + glow.toFixed(2) + ')', null);
    g.circle(h.x + h.r * 0.28, h.y + h.r * 0.03, 0.9, 'rgba(255,58,42,' + glow.toFixed(2) + ')', null);
    // bat-wing fins on the helm
    g.poly([[h.x - h.r * 0.8, h.y - h.r * 0.2], [h.x - h.r * 1.9, h.y - h.r * 1.2], [h.x - h.r * 1.3, h.y - h.r * 0.5], [h.x - h.r * 1.7, h.y - h.r * 0.1]], '#3c4150', '#1a1014');
    g.poly([[h.x + h.r * 0.8, h.y - h.r * 0.2], [h.x + h.r * 1.9, h.y - h.r * 1.2], [h.x + h.r * 1.3, h.y - h.r * 0.5], [h.x + h.r * 1.7, h.y - h.r * 0.1]], '#3c4150', '#1a1014');
  }
  function skyllaOverlay(g, t) {
    sashOverlay(g);
    // the pact token: a tiny hut on chicken legs, bobbing at her shoulder
    const bob = Math.sin(t * 2.4) * 1.2, x = -11, y = -30 + bob;
    const step = Math.sin(t * 6) * 0.8;
    g.line(x - 1.2, y + 2.5, x - 1.6 - step, y + 6, '#f2c94c', 0.8);
    g.line(x + 1.2, y + 2.5, x + 1.6 + step, y + 6, '#f2c94c', 0.8);
    g.rect(x - 2.6, y - 2, 5.2, 4.5, '#7a5230', '#1a1014', 0.4);
    g.poly([[x - 3.4, y - 2], [x, y - 5.2], [x + 3.4, y - 2]], '#4a3020', '#1a1014');
    g.rect(x - 0.7, y - 0.6, 1.4, 1.4, '#ffd76a', null);
  }
  function zarakOverlay(g, t) {
    sashOverlay(g);
    const h = g.head;
    if (!h) return;
    // braids threaded with lockpicks and gold beads, and the brass bell on the helm (stealth: audible)
    [-0.45, 0.45].forEach(function (k) {
      const bx = h.x + h.r * k;
      g.line(bx, h.y + h.r * 0.9, bx + k * 1.5, h.y + h.r * 2.2, '#5a3a1e', 1.6);
      g.circle(bx + k * 1.5, h.y + h.r * 2.25, 0.8, '#d4af37', null);
      g.line(bx + k * 0.6, h.y + h.r * 1.3, bx + k * 2.6, h.y + h.r * 1.1, '#b8c0cc', 0.5);
    });
    const sw = Math.sin(t * 4) * 0.8;
    g.line(h.x + h.r * 0.2, h.y - h.r * 1.05, h.x + h.r * 0.5 + sw, h.y - h.r * 1.55, '#7a8794', 0.6);
    g.circle(h.x + h.r * 0.5 + sw, h.y - h.r * 1.6, 1.3, '#d4af37', '#1a1014');
  }
  function zargashOverlay(g, t) {
    sashOverlay(g);
    const f = g.hands && g.hands.front;
    if (!f) return;
    // the skull on his mace (Orcus's taste in décor)
    const glow = 0.5 + 0.3 * Math.sin(t * 2);
    g.circle(f.x + 2, f.y - 10, 2.6, '#efe6d2', '#1a1014');
    g.circle(f.x + 1.2, f.y - 10.3, 0.6, 'rgba(255,90,58,' + glow.toFixed(2) + ')', null);
    g.circle(f.x + 2.8, f.y - 10.3, 0.6, 'rgba(255,90,58,' + glow.toFixed(2) + ')', null);
  }

  const TOO_EVIL = 'Too Evil to Drown: a fall into the Shark Tank costs ' + N.tank + ' HP and Bleed ' + N.tankBleed + ', never a death. ';
  function bodyLine() { return 'A fallen member leaves a body (' + N.body + ' HP): break it, or Zargash prays the member back up.'; }
  function songLine(u) {
    return 'The Theme Song: at ' + N.hypeMax + ' Villain Hype the frontman leads it, ' + liveLvl(SK.theme, u).dmg + ' psychic damage per singing member. ';
  }

  DD.registerEnemy({ id: KELEK, name: 'Kelek', act: 4, tier: 'elite', pronoun: 'he', hp: N.hp[KELEK], mov: 3, armor: 0, init: 1,
    tags: [TAG, 'wizard'], flags: {}, resist: {},
    sprite: { base: 'humanoid', scale: 1.12, build: 'slim', outfit: 'robe',
      palette: { skin: '#d9c7b8', cloth: '#3a1a52', cloth2: '#9bff3a', hair: '#e8e2d8', eye: '#9bff3a', metal: '#c9b037', accent: '#9bff3a', hat: '#2b1240', staff: '#4a3020' },
      head: { hat: 'wizard', beard: 'long', eyes: 'glow', mouth: 'grin' }, mainhand: 'staff', extras: ['cape'],
      aura: { kind: 'smoke', color: '#9bff3a' }, overlay: kelekOverlay },
    skills: [SK.missiles, SK.fireball], ai: kelekTurn, aiStyle: SNIPER, xp: 15, gold: [5, 9],
    passive: { name: 'Meat Shield', icon: '🛡️', desc: function (u) {
      const Lm = liveLvl(SK.missiles, u), Lf = liveLvl(SK.fireball, u);
      return 'On his turn he keeps 3 tiles from the heroes (next to Warduke and on the Villain Podium when he can), fires Evil Missiles (' + Lm.dmg +
        ' damage to each of up to ' + Lm.n + ' foes within ' + Lm.r + ', no line of sight needed) and winds up the Unspeakable Fireball (' + Lf.dmg +
        ' in radius ' + Lf.r + ') where it catches 2+ heroes. Takes half damage while Warduke stands next to him. The frontman: ' + songLine(u) +
        TOO_EVIL + bodyLine();
    } },
    hooks: hooksFor(),
    barks: {
      spawn: ['I am Kelek, leader of the League! Hand over your staves.', 'Behold: the Lllleeeeaaaaguuuueeee of— I\'ll finish it later.',
        'Is that a staff? It\'s mine now. Everything is mine now.'],
      attack: ['Evil Missiles! They curve. Like my ambitions.', 'Your loot is my loot. Your staff is ESPECIALLY my loot.',
        'This one\'s for Ringlerun! Not literally. I hate Ringlerun.', 'Mine! Also mine. That? Mine.'],
      hurt: ['You scuffed my robe! It\'s not even my robe!', 'Ringlerun never gets hit. Ringlerun has the Staff of Power.',
        'Warduke! Next to me! That\'s an order! And an invoice!'],
      death: ['The Staff of Power... should have been... mine...', 'Tell Ringlerun... he can keep it... no, don\'t tell him that...'],
      fireball: ['The Unspeakable Fireball! I won\'t say its name. I\'ll describe it.', 'Stand still. It\'s more dramatic if you stand still.'],
      song: ['Everyone! From the top! LLLEEEAAAGUE!', 'Places, villains! Five, six, seven, eight!'],
      raised: ['I\'m BACK! And I want my staff! It wasn\'t mine, but still!', 'Death? A minor setback. Like Ringlerun.'],
      drowned: ['My robe! It\'s dry-clean only!', '*glub* The shark has my hat!'],
      last: ['Alone at last. Time for the REAL monologue.', 'Fine. I\'ll be the whole League. All fifty-six letters of it.'],
      mourn_warduke: ['My meat shield! Revise the plan!', 'Warduke! Who blocks for me now?!'],
      mourn_skylla: ['Skylla! Who will roll her eyes at me now?'],
      mourn_zarak: ['The dwarf! ...Fine, the ORC. He\'d want me to say orc.'],
      mourn_zargash: ['Our healer! Whose plan was THAT?!'],
      named: named(KELEK),
    },
    named: NAMED[KELEK],
    desc: 'The League\'s leader (self-appointed, unanimously contested). A wizard who wants every staff he sees, and one above all: the Staff of ' +
      'Power, which belongs to his rival Ringlerun, who will not lend it. Curving Evil Missiles, the Unspeakable Fireball wind-up, and half damage ' +
      'while Warduke stands next to him. Pull him off his bodyguard.' });

  DD.registerEnemy({ id: WARDUKE, name: 'Warduke', act: 4, tier: 'elite', pronoun: 'he', hp: N.hp[WARDUKE], mov: 4, armor: 1, init: 0,
    tags: [TAG, 'mercenary'], flags: {}, resist: {},
    sprite: { base: 'humanoid', scale: 1.42, build: 'huge', outfit: 'armor',
      palette: { skin: '#3a3036', cloth: '#2a2030', cloth2: '#9bff3a', metal: '#5a5f6e', eye: '#ff3a2a', accent: '#9bff3a', hat: '#3c4150', hair: '#1a1418' },
      head: { hat: 'helmet', horns: 'demon', eyes: 'glow', mouth: 'none' }, mainhand: 'sword', offhand: 'shield', extras: ['cape'],
      overlay: wardukeOverlay },
    skills: [SK.skull, SK.punt], ai: wardukeTurn, aiStyle: MELEE, xp: 15, gold: [5, 9],
    passive: { name: 'Bodyguard', icon: '🪖', desc: function (u) {
      const Ls = liveLvl(SK.skull, u), Lp = lvl(SK.punt);
      return 'On his turn he goes for whoever stands next to Kelek, Skylla or Zargash, otherwise the hero next to him: Skull Splitter (' + Ls.dmg +
        ') or a Hero Punt (' + Lp.dist + ' tiles; ' + Lp.crash + ' to both on a crash) into a wall, a hero, the Shark Tank or a pending fireball. Walk away ' +
        'from him and he swings (attack of opportunity). Below half HP he is Unreasonable: immovable and +' + N.unreasonable + ' damage. ' + TOO_EVIL + bodyLine();
    } },
    hooks: hooksFor({
      onTakeDamage: function (d) { syncUnreasonable(d.target); },
      onHealed: function (unit) { syncUnreasonable(unit); },
    }),
    barks: {
      spawn: ['Warduke. Paid in advance. Nothing personal.', '*muffled* The helm stays on. Don\'t ask.', 'The League pays by the hero. I\'m counting.'],
      attack: ['Skull Splitter. Billed hourly.', '*clang* That\'s a professional swing.', 'Hold still. Clean ones pay a bonus.',
        'Nothing personal. It\'s in the contract.'],
      hurt: ['That\'s hazard pay.', '*muffled grunt* Adding it to the invoice.', 'Dent the helm and you pay for the helm.'],
      death: ['Contract... terminated...', 'Don\'t... take... the helm... off...'],
      punt: ['Punted. That\'s a separate fee.', 'Field goal. Invoice to follow.'],
      unreasonable: ['Now I\'m charging double.', 'Overtime. UNREASONABLE overtime.'],
      song: ['Fine. I\'ll sing. Union scale.', '*muffled singing, very much on key*'],
      raised: ['Back on the clock.', 'Death doesn\'t void the contract.'],
      drowned: ['*glub* ...The helm stays on.', 'Sharks. Not in the contract.'],
      last: ['Last one standing. "The League." I\'m not paid by the letter.', 'Last one. Contract says finish the job.'],
      mourn_kelek: ['Boss is down. Who signs my cheques now?'],
      mourn_skylla: ['She paid on time. I\'ll miss that.'],
      mourn_zarak: ['Small one\'s down. Still not a dwarf, apparently.'],
      mourn_zargash: ['No cleric. Danger pay applies.'],
      named: named(WARDUKE),
    },
    named: NAMED[WARDUKE],
    desc: 'A heartless mercenary who fills the League\'s barbarian slot for an hourly rate. Nobody has seen his face; the dread helm stays on in the ' +
      'bath. He goes for whoever bothers the casters, punts heroes into walls, friends and the Shark Tank, and below half HP he is Unreasonable: ' +
      'immovable and +' + N.unreasonable + ' damage.' });

  DD.registerEnemy({ id: SKYLLA, name: 'Skylla', act: 4, tier: 'elite', pronoun: 'she', hp: N.hp[SKYLLA], mov: 4, armor: 0, init: 2,
    tags: [TAG, 'warlock'], flags: {}, resist: {},
    sprite: { base: 'humanoid', scale: 1.05, build: 'slim', outfit: 'dress',
      palette: { skin: '#e9d3e6', cloth: '#2a0f3d', cloth2: '#9bff3a', hair: '#120d18', eye: '#c77dff', accent: '#c77dff', metal: '#c9b037', wand: '#5a3a24' },
      head: { hair: 'long', eyes: 'sleepy', mouth: 'frown', face: 'sunglasses' }, mainhand: 'wand', extras: ['cape'],
      aura: { kind: 'smoke', color: '#c77dff' }, overlay: skyllaOverlay },
    skills: [SK.blah, SK.hex], ai: skyllaTurn, aiStyle: KITER, xp: 15, gold: [5, 9],
    passive: { name: 'Expendable Friends', icon: '🔮', desc: function (u) {
      const Lb = liveLvl(SK.blah, u), Lh = lvl(SK.hex);
      return 'On her turn she keeps 2 tiles from the heroes: a Hex of Mild Inconvenience (Vulnerable, ' + Lh.turns + ' turns) on a hero next to Warduke ' +
        'or Zarak, else Eldritch Blah (' + Lb.dmg + ', pulled ' + Lb.pull + ' tiles toward her, ideally next to a brute). Once per fight, the blow that ' +
        'would kill her kills the nearest other League member instead and leaves her at 1 HP. She is not sorry. ' + TOO_EVIL + bodyLine();
    } },
    hooks: hooksFor(),
    barks: {
      spawn: ['Ugh. Heroes. Fine.', 'My patron is Baba Yaga. Yes, that one. No, you can\'t meet her.', 'Baba says I have to be evil today. So.'],
      attack: ['Eldritch blah.', 'Cursed you. Didn\'t even look up.', 'Baba Yaga sends her regards. And a curse.', 'Come here. ...Closer. There.'],
      hurt: ['Rude.', 'I\'m telling Baba. Her hut has legs. It kicks.', 'Okay, now I\'m slightly bothered.'],
      death: ['Ugh. Fine. ...Tell Baba I did my chores.', 'I\'m not mad. I\'m dead. Different thing.'],
      expendable: ['Sorry, not sorry.', 'Teamwork!', 'You were closest. Them\'s the rules.'],
      song: ['We\'re doing the song? ...Fine. Ahem.', 'One verse. ONE.'],
      raised: ['Ugh. Resurrected. My least favourite chore.', 'Back. Baba says I\'m not allowed to be dead yet.'],
      drowned: ['Wet. Great. Baba will love that.', 'The shark has better manners than you.'],
      last: ['Last one standing. Ugh. Responsibility.', 'Just me? The Lleeaaguuee. Of Villainy. Whatever.'],
      mourn_kelek: ['Finally, some quiet.'],
      mourn_warduke: ['Never took the helm off. Now I\'m a little curious.'],
      mourn_zarak: ['We all heard that, dwarf. ...Sorry. Orc.'],
      mourn_zargash: ['Great. Who heals us now?'],
      named: named(SKYLLA),
    },
    named: NAMED[SKYLLA],
    desc: 'The League\'s warlock, pact-bound to Baba Yaga, the Mother of all Witches (the Coven are family; she doesn\'t visit). Pulls heroes next to ' +
      'the brutes with Eldritch Blah and hexes them Vulnerable. Once a fight she sidesteps a killing blow onto the nearest other member: line her up ' +
      'next to a full-health friend and let the friend have it.' });

  DD.registerEnemy({ id: ZARAK, name: 'Zarak', act: 4, tier: 'elite', pronoun: 'he', hp: N.hp[ZARAK], mov: 4, armor: 1, init: 3,
    tags: [TAG, 'orc'], flags: { immovable: true }, resist: {},
    sprite: { base: 'humanoid', scale: 0.95, build: 'stocky', outfit: 'armor',
      palette: { skin: '#7a9a5a', cloth: '#3b2a3f', cloth2: '#9bff3a', hair: '#5a3a1e', metal: '#7a8794', eye: '#ffcc33', accent: '#d4af37' },
      head: { hat: 'viking', beard: 'long', eyes: 'angry', mouth: 'tusks' }, mainhand: 'dagger', offhand: 'dagger', extras: ['pouches', 'belt'],
      overlay: zarakOverlay },
    skills: [SK.shins, SK.tunnel], ai: zarakTurn, aiStyle: DIVER, xp: 15, gold: [5, 9],
    passive: { name: 'Short and Sturdy (an Orc)', icon: '🧔', desc: function (u) {
      const Ls = liveLvl(SK.shins, u), Lt = liveLvl(SK.tunnel, u);
      return 'On his turn he dives the weakest hero he can reach: Shin Splitter (' + Ls.dmg + ', Bleed ' + Ls.bleed + '), or, with nobody next to him, ' +
        'Tunnel Ambush (' + Lt.dmg + ' and Slowed, popping up next to a foe within ' + Lt.r + '). Can\'t be pushed, pulled, thrown or swapped. Sneak ' +
        'Attack (Audible): +' + N.sneak + ' damage to a foe that stands next to another League member. Everyone calls him the dwarf. He is an orc. ' +
        TOO_EVIL + bodyLine();
    } },
    hooks: hooksFor({
      // Sneak Attack on an attack of opportunity rides on o.flat (the move preview shows it; once per o)
      modifyOpportunity: function (o) {
        if (!o.attacker || o.attacker.defId !== ZARAK || o.lgSneak !== undefined) return;
        o.lgSneak = flanked(o.mover, o.attacker, o.from) ? N.sneak : 0;
        o.flat += o.lgSneak;
      },
    }),
    barks: {
      spawn: ['Zarak. ORC assassin. O. R. C.', 'Before anyone says it: I am NOT a dwarf.', 'You didn\'t hear me arrive. Orcs are stealthy.'],
      attack: ['Shins! Orcs go for the shins. It\'s an ORC thing.', 'Sneak attack! ...Why is everyone looking at my beard?',
        'Surprise! It\'s an orc! Not a dwarf! An ORC!', 'Stab. Stab. That\'s orc for "hello".'],
      tunnel: ['Tunnelling! Orcs tunnel! Lots of... orcs... tunnel.', '*rumble* Not mining! It\'s an AMBUSH!'],
      hurt: ['Oi! Mind the beard! ...It\'s an ORC beard!', 'That\'s a grudge. Orcs hold grudges too, you know.', 'Who said dwarf? I HEARD dwarf!'],
      death: ['Tell them... I was... an orc...', 'Bury me... as an orc... NOT under a mountain...'],
      song: ['From the top! And no "dwarf" in the second verse!', 'Everybody sing! Orcs have GREAT voices!'],
      raised: ['Back! Still an orc! STILL AN ORC!', 'Death couldn\'t keep me down. Orcs are hardy. Not dwarves. ORCS.'],
      drowned: ['Orcs can swim! ...Badly!', 'I\'m not sinking. I\'m dense. ORC dense.'],
      last: ['Just me. Nobody calls the last one a dwarf. Right? RIGHT?', 'The Llleeeaaaguuueee! See? I counted. Orcs count.'],
      mourn_kelek: ['Who\'s going to explain the plan now?'],
      mourn_warduke: ['The big one\'s down! Who\'s going to reach the high shelves?'],
      mourn_skylla: ['She called me a dwarf. ...I\'ll still miss her.'],
      mourn_zargash: ['Who\'ll raise us now? ...Oh. Nobody.'],
      named: named(ZARAK),
    },
    named: NAMED[ZARAK],
    desc: 'An unconscionable orc assassin. He is short, stocky, armoured, heavily bearded and wears a horned helm, so everyone, Svammiel included, ' +
      'calls him the dwarf, and he furiously insists he is an orc. He can\'t be pushed, pulled or swapped, tunnels up next to stragglers, and his ' +
      'Sneak Attack (Audible: there is a bell on his helmet) hits harder next to another member.' });

  DD.registerEnemy({ id: ZARGASH, name: 'Zargash', act: 4, tier: 'elite', pronoun: 'he', hp: N.hp[ZARGASH], mov: 3, armor: 2, init: -1,
    tags: [TAG, 'cleric'], flags: {}, resist: {},
    sprite: { base: 'humanoid', scale: 1.1, build: 'stocky', outfit: 'robe',
      palette: { skin: '#b9a99a', cloth: '#1a1418', cloth2: '#8a1020', hair: '#3a3a3a', metal: '#8a8a8a', eye: '#ff5a3a', accent: '#9bff3a', book: '#4a1018', horn: '#d8cfb8' },
      head: { horns: 'ram', hair: 'short', eyes: 'angry', mouth: 'frown' }, mainhand: 'club', offhand: 'book', overlay: zargashOverlay },
    skills: [SK.smite, SK.water, SK.revival], ai: zargashTurn, aiStyle: { style: 'support', keepDistance: 0 }, xp: 15, gold: [5, 9],
    passive: { name: 'Smug Halo', icon: '😇', desc: function (u) {
      const Lw = lvl(SK.water), Ls = liveLvl(SK.smite, u), Lr = lvl(SK.revival);
      return 'On his turn: if a fallen member\'s body lies within ' + Lr.r + ' of a tile he can reach, he winds up Spiteful Revival (it gets back up ' +
        'with half its max HP; twice a fight); else he heals the most hurt other member missing ' + Lw.heal + '+ HP (Unholy Water, ' + Lw.heal +
        '); else he Smites a hero next to him (' + Ls.dmg + '). Break the bodies or interrupt the prayer. ' + TOO_EVIL;
    } },
    hooks: hooksFor(),
    barks: {
      spawn: ['Zargash, cleric of Orcus. Let us prey.', 'My soul? Corrupted beyond redemption. I checked. Twice.',
        'Orcus be with you. Orcus be ON you, actually.'],
      attack: ['Smite! For not holding the door!', 'Orcus disapproves of you. I\'m just the messenger.', 'Repent! Too late. Smite!'],
      heal: ['Get up, sinner. We\'re not done sinning.', 'Unholy water. From the tap. Still works.'],
      raise: ['Orcus! One more, please. I\'ll take the overtime.', 'Rise! Death is a phase. Orcus says so.',
        'Get up. Death is for people without a cleric.'],
      hurt: ['That\'s a sin. Against ME. The worst kind.', 'I\'d pray for you, but I pray to Orcus. Bad news.'],
      death: ['Orcus... save me a seat... a bad one...', 'Redemption...? No. Still no. Fine...'],
      song: ['Hymn number six-six-six. From the top.', 'Sing, sinners! Orcus is listening! He\'s not, but sing!'],
      drowned: ['Orcus does not do baptisms. Noted.', 'Unholy water. From the tank. Still works.'],
      last: ['I am the last. I forgive myself. No. I don\'t.', 'The L-E-A-G-U-E. I know my scripture.'],
      mourn_kelek: ['Orcus will take him. Orcus takes anyone.'],
      mourn_warduke: ['Get up, Warduke. That\'s an unholy order.'],
      mourn_skylla: ['Baba Yaga will want her back. Awkward.'],
      mourn_zarak: ['Rest, little dwarf. ...He\'d hate that. Good.'],
      named: named(ZARGASH),
    },
    named: NAMED[ZARGASH],
    desc: 'The League\'s cleric, sworn to Orcus, prince of undeath; his soul is corrupted beyond redemption and he holds grudges as a hobby. He heals ' +
      'the most hurt villain with unholy water (from the tap) and, twice a fight, prays a fallen one back up from its body. Break the bodies. ' +
      'Kill him first.' });

  // =================================================================================================================
  // The arena and the encounter
  // =================================================================================================================
  const LAYOUT = [
    'wwXwwwwwwwwwXww',
    'wwwwwwP3Pwwwwww',
    'www4www5wwwXwww',
    'wwwww1www2wwwww',
    '##d###===####SS',
    '.......r.....SS',
    '..p....r....pSS',
    '.....ttttt...SS',
    'L....ttttt...SS',
    '..p....r....pSS',
    '.......r.......',
    '...HHHHHHHHH...',
    '....HHHHHHH....',
  ];
  const SPAWN = { terrain: 'marble', h: 1, zone: 'enemy' };

  function encStart(state) {
    state.data.league = {
      on: true, hype: 0, expended: false, banterRound: -9, banter: {}, rolled: false, tipped: false, last: false, over: false,
      stats: { bodies: 0, broken: 0, raised: 0, fizzled: 0, songs: 0, songLanded: 0, songHits: 0, expended: 0, drowned: 0, lever: 0, dropped: 0,
        fireballs: 0, punted: 0, tunnels: 0 },
    };
    A().addRule({ id: RULE, name: hypeName(0), icon: '🎤', desc: hypeDesc(), turns: -1, silent: true, hype: 0,
      hooks: { onDowned: function (unit) { if (unit && unit.kind === 'hero') addHype(N.hypeDown, unit.name + ' is down'); } } });
    A().log('Kelek: "Behold! The ' + word(LEVELS) + '—" (Kelek takes a breath.) "—of Villainy!"', 'enemy');
  }
  function encRoundStart(state) {
    const d = LD(state);
    if (!d || quiet()) return;
    if (!d.rolled) {
      d.rolled = true;
      rollCall(state);
      if (!d.tipped) { d.tipped = true; A().narrate('league_tip', {}); }
      return;
    }
    banter(state);
  }
  function encRoundEnd(state) {
    const d = LD(state);
    if (!d) return;
    addHype(N.hypeRound, 'the round is over');
    state.grid.tiles.forEach(function (t) {
      const o = t.obj;
      if (!o || o.id !== LEVER || !o.data || !o.data.usedRound) return;
      if (state.round >= o.data.usedRound + N.leverReset) {
        o.data.usedRound = 0;
        A().touch();
        if (!quiet()) A().log('Ka-chunk: the trapdoor under the Villain Podium resets. Somebody installed a very good spring.', 'system');
      }
    });
  }

  DD.registerEncounter({ id: ENC, act: 4, kind: 'boss', name: FULL, shortName: leagueName(1), icon: '🦹', weight: 0, minDepth: 0,
    gauntlet: { lane: 'league', order: 2, hint: 'Five of them: control and area damage.' },
    banner: false,
    cameo: { start: 'svam_cameo_league', cheat: 'svam_nepotism', interjections: true, frames: FRAMES.slice() },
    intro: 'A villain clubhouse with a secret entrance, a less secret entrance and a sign that says NO HEROES (THIS MEANS YOU). Five thrones. ' +
      'Five villains. One very long banner.',
    map: {
      theme: 'a4_lair', layout: LAYOUT,
      legend: {
        '.': { terrain: FLOOR },
        'r': { terrain: CARPET },
        'w': { terrain: 'marble', h: 1 },
        'X': { terrain: 'marble', h: 1, obj: { id: 'barrel_explosive', label: 'Evil Powder Keg' } },
        'P': { terrain: PODIUM, h: 2, tag: 'podium' },
        '3': { terrain: PODIUM, h: 2, tag: 'podium', zone: 'enemy' },
        '1': SPAWN, '2': SPAWN, '4': SPAWN, '5': SPAWN,
        '#': { terrain: 'wall', h: 1 },
        'd': { terrain: CARPET, h: 1 },
        '=': { terrain: CARPET, h: 1 },
        'S': { terrain: TANK },
        't': { terrain: FLOOR, obj: { id: TABLE } },
        'p': { terrain: FLOOR, obj: 'pillar' },
        'L': { terrain: FLOOR, obj: { id: LEVER } },
        'H': { terrain: FLOOR, zone: 'hero' },
      },
    },
    enemies: [{ id: WARDUKE, n: 1, mark: '1' }, { id: ZARAK, n: 1, mark: '2' }, { id: KELEK, n: 1, mark: '3' }, { id: SKYLLA, n: 1, mark: '4' },
      { id: ZARGASH, n: 1, mark: '5' }],
    // E10: the squad (bossIds). bossId names the leader as well: until MAPGEN's buildObjective keeps a squad boss objective
    // without a boss-tier unit, it would fall back to killAll (docs/notes/boss-league.md, Deviations)
    objective: { type: 'boss', bossIds: [KELEK, WARDUKE, SKYLLA, ZARAK, ZARGASH], bossId: KELEK, squadName: leagueName(3),
      flavor: 'Break the bodies, or the cleric prays them back up.' },
    onStart: encStart, onRoundStart: encRoundStart, onRoundEnd: encRoundEnd,
    reward: { goldMult: 0.9, itemRarity: 'rare' } });

  // =================================================================================================================
  // Narration (the act-4 DM narrates demoted, whispering)
  // =================================================================================================================
  DD.registerNarration('league_tip', [
    'DM (whispering): "Break the bodies, or the cleric prays them back up."',
    'DM (whispering): "Kill the cleric first. He holds grudges, and he heals."',
  ]);
  DD.registerNarration('league_rollcall', [
    'The League of Villainy does its roll call. It takes a while. The name alone takes most of it.',
    'Five villains strike five poses. One of them is still saying the name.',
  ]);
  DD.registerNarration('league_song', [
    'The League sings its own name. All of it. Every letter. Some of the letters twice.',
    'The Theme Song hits like a pop song you can\'t get out of your head, because it is in your head, hitting you.',
  ]);
  // the Theme Song lands on nobody (every hero stepped out of the red)
  DD.registerNarration('league_song_whiff', [
    'The League sings its own name to an empty room. They take a bow anyway, and clap for themselves.',
    'The Theme Song hits every marked tile and no heroes. The League blames the acoustics.',
  ]);
  DD.registerNarration('league_trapdoor', [
    'Ka-chunk. The Villain Podium opens like a bad plot twist. The shark looks up, hopeful.',
    'Every villain has a trapdoor. Very few remember which lever it is. Today, somebody did.',
  ]);
  DD.registerNarration('league_death', [
    'The League of Villainy is disbanded. Their banner, finally exhausted, sags to the floor. It takes a full minute.',
    'Five villains down. Somewhere, Ringlerun locks the Staff of Power in a cupboard and sleeps soundly for the first time in years.',
  ]);

  // =================================================================================================================
  // Public helpers (the name for META-UI / RENDER, tests, sims)
  // =================================================================================================================
  DD.League = {
    LEVELS: LEVELS, FULL: FULL, SHORT: leagueName(1), N: N, SK: SK, ST: ST, ENC: ENC, MEMBERS: FRONT.slice(), FRONT: FRONT,
    BODY: BODY, LEVER: LEVER, TANK: TANK, PODIUM: PODIUM, RULE: RULE, NAMED: NAMED, BANTER: BANTER,
    CODEX_NOTE: '(full name: 56 letters in \'League\' alone; the members disagree on the count)',
    /** "The League of Villainy" (level 1) … the full 72-character name (level 13): every letter run capped at level. */
    name: leagueName,
    word: word,
    /** The widest level whose name fits in maxChars characters (at least level 1). */
    fit: function (maxChars) {
      for (let n = LEVELS; n > 1; n--) if (leagueName(n).length <= maxChars) return leagueName(n);
      return leagueName(1);
    },
    /** The stretch animation's text frames, level 1 → 13 (the cameo banner's `frames`). */
    frames: function () { return FRAMES.slice(); },
    hype: function (s) { const d = LD(s); return d ? d.hype : 0; },
    addHype: addHype,
    frontman: frontman, songCount: songCount, songTiles: songTiles, songFlat: songFlat,
    members: members, bodyTiles: bodyTiles, expendableVictim: expendableVictim, landingFor: landingFor, missileFoes: missileFoes,
    fireballCenter: fireballCenter, trapdoor: trapdoor, puntPath: puntPath, ensure: ensure, namedLine: namedLine,
    /** Puzzle engagement this fight (sims): bodies, broken, raised, songs, lever, drops, … */
    stats: function (s) { const d = LD(s); return d ? Object.assign({}, d.stats) : {}; },
  };
})();
