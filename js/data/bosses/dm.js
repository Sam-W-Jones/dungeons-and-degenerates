/* Dungeons and Degenerates — js/data/bosses/dm.js
 * The final boss of Act 3: THE DUNGEON MASTER, fought on his actual table (theme dm_table, encounter 'boss_dm').
 *   Phase 1 "Session Zero": invulnerable behind a 3-panel DM Screen (smash the panels: the screen falls on him),
 *     a random House Rule every round (state.rules), Random Encounters (cameo minis of real enemies from every act,
 *     picked at runtime, falling back to the dm_cameo_* minis), Rocks Fall (delayed crosses), Fudged Rolls.
 *   Phase 2 "The Railroad" (2/3 HP): trains thunder down the pencilled lanes, telegraphed a round ahead; a Track
 *     Switch pulled while a train is due diverts it onto the DM's own row.
 *   Phase 3 "Rocks Fall, Everyone Dies" (1/3 HP): a 3-round countdown wipe. Cite all three Player's Handbooks (or
 *     stun him) to stop it. Crossing a threshold flips the phase at once; a second one in the same round hits Plot
 *     Armor (no skipping phases, no dying before phase 3).
 * Every bit of boss state lives in the DM unit's `data` (previews and deployment rewinds copy it).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const DM_ID = 'dungeon_master';
  const PANEL = 'dm_screen_panel', SWITCH = 'dm_track_switch', BOOK = 'dm_handbook', TRACK = 'dm_track', STACK = 'dm_book_stack';
  const RULE_ID = 'dm_house_rule';
  const STUN_LIKE = ['stun', 'sleep', 'frozen'];
  const OWN_CAMEOS = ['dm_cameo_goblin', 'dm_cameo_skeleton', 'dm_cameo_imp'];
  // other content that must never be picked as a cameo: tests, wild magic, synthetic, other bosses' adds, mine
  const NOT_CAMEO = /^(test_|wm_|mg_|mgt_|dm_|grim_|rat_|lich_|iris_)/;
  const SOUTH = { x: 0, y: 1 };
  const N = {
    hp: 480, panelHp: 10, screenDrop: 60, divert: 40, lawyered: 55,
    cameoAlive: 3, cameoPer: 2, cameoTotal: 6, cameoHp: 16, books: 3, doomRounds: 3,
    p2: 2 / 3, p3: 1 / 3,          // phase thresholds (fractions of max HP)
    rolls1: 2, rolls2: 2, rolls3: 2,   // Fudged Rolls per round in each phase (phase 2: one fewer on Plot Hook rounds)
  };

  // ---- small helpers ----------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function stunned(u) { for (let i = 0; i < STUN_LIKE.length; i++) if (has(u, STUN_LIKE[i])) return true; return false; }
  function isDM(u) { return !!u && u.defId === DM_ID; }
  function round() { const s = S(); return s ? s.round : 0; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /** The living DM of the current fight (looked up every time: previews swap DD.Combat.state). */
  function findDM() {
    const s = S();
    if (!s) return null;
    for (let i = 0; i < s.units.length; i++) if (isDM(s.units[i]) && !s.units[i].dead) return s.units[i];
    return null;
  }
  /** Boss state on the DM unit (created on first use). */
  function boss(u) {
    const d = u.data || (u.data = {});
    if (!d.phase) {
      d.phase = 1; d.screenDown = false; d.hadScreen = false; d.armored = false; d.ownInv = false;
      d.p1 = 0; d.p2 = 0; d.p3 = 0; d.cameos = 0; d.books = 0; d.booksNeeded = N.books; d.doom = null; d.stunGuard = -1; d.divert = null;
      d.stats = { panels: 0, screen: 0, rules: 0, cameos: 0, switches: 0, diverted: 0, books: 0, lawyered: 0, doomFired: 0, stuns: 0 };
    }
    return d;
  }
  function tiles() { const s = S(); return s ? s.grid.tiles : []; }
  function objTiles(id) { return tiles().filter(function (t) { return t.obj && t.obj.id === id; }); }
  function panelsLeft() { return objTiles(PANEL).filter(function (t) { return t.obj.hp > 0; }).length; }
  function tagged(tag) { return tiles().filter(function (t) { return t.tag === tag; }).map(function (t) { return { x: t.x, y: t.y }; }); }
  function rowTiles(y, grid) {
    const g = grid || (S() && S().grid);
    const out = [];
    if (!g) return out;
    for (let x = 0; x < g.w; x++) out.push({ x: x, y: y });
    return out;
  }
  function allTiles(state) {
    const st = state || S();
    return st ? st.grid.tiles.map(function (t) { return { x: t.x, y: t.y }; }) : [];
  }
  function onTiles(list, p) { for (let i = 0; i < list.length; i++) if (list[i].x === p.x && list[i].y === p.y) return true; return false; }
  function pending(u, skillId) { return (u.intents || []).some(function (i) { return i.skillId === skillId && (i.delay > 0 || i.pending); }); }
  function threshold(u, phase) { return Math.ceil(u.maxHp * (phase === 2 ? N.p2 : N.p3)); }
  /** HP the DM can't drop below in a phase (Plot Armor): the next phase's threshold, none in phase 3. */
  function floorOf(u, phase) { return phase === 1 ? threshold(u, 2) : phase === 2 ? threshold(u, 3) : 0; }
  /** HP the DM can't drop below in his current phase (Plot Armor). */
  function floorHp(u) { return floorOf(u, boss(u).phase); }
  function ruleActive(key) { const s = S(); return !!s && s.rules.some(function (r) { return r.id === RULE_ID && r.key === key; }); }
  function flanked(u) {
    if (!active(u)) return false;
    let n = 0;
    U.DIRS.forEach(function (d) { const o = DD.Grid.unitAt(u.x + d.x, u.y + d.y); if (active(o) && DD.Grid.hostile(u, o)) n++; });
    return n >= 2;
  }

  /** Train lanes: the pencilled tracks of the arena, else (sandboxes) full rows 2 and 4 tiles from the DM. */
  function lanes(dm) {
    const out = [];
    ['lane1', 'lane2', 'lane3'].forEach(function (k) { const l = tagged(k); if (l.length) out.push(l); });
    if (out.length) return out;
    const g = S().grid;
    [2, 4, -2, -4, 6].forEach(function (off) {
      const y = (dm ? dm.y : 0) + off;
      if (y >= 0 && y < g.h && out.length < 3) out.push(rowTiles(y, g));
    });
    return out;
  }

  // ---- the DM's dice (cosmetic: the giant d20s next to him show his "rolls") ----------------------------------
  function setDie(tag, value) {
    tiles().forEach(function (t) {
      if (t.tag === tag && t.obj && t.obj.id === 'd20') { t.obj.data.value = value; DD.FX.tile(t.x, t.y, 'pulse', { color: '#ffd34d' }); }
    });
  }

  // ---- objective subtitle: the puzzle instructions on screen ------------------------------------------------------
  function updateFlavor(dm) {
    const s = S();
    if (!s || !s.objective || !dm) return;
    const d = boss(dm);
    let text;
    const left = panelsLeft();
    if (d.phase === 1 && !d.screenDown && left > 0) text = 'Smash the DM Screen (' + plural(left, 'panel') + ' left): he can\'t be hurt behind it.';
    else if (d.armored) text = 'PLOT ARMOR: he can\'t drop below ' + floorHp(dm) + ' HP this round. Next round, phase ' + (d.phase + 1) + '.';
    else if (d.phase === 1) text = 'Screen\'s down! Knock him to 2/3 HP before he finds his notes.';
    else if (d.phase === 2) text = 'The Railroad: dodge the trains, or pull a Track Switch while one is due to divert it onto him.';
    else if (d.doom && d.doom.active && !d.doom.solved) {
      // same count as the telegraph (⏳N = fires at the end of round now+N)
      const r = d.doom.at - s.round;
      text = 'ROCKS FALL at the end of ' + (r > 0 ? 'round ' + d.doom.at + ' (⏳' + r + ')' : 'THIS round') + '! Cite all ' + d.booksNeeded +
        ' Player\'s Handbooks (' + d.books + '/' + d.booksNeeded + '), or stun him to buy a round.';
    } else text = 'He\'s out of rules to bend. Finish him!';
    s.objective.flavor = text;
    DD.Act.touch();
  }

  // ---- invulnerability: the screen (unremovable flag + status for the HUD/AI) and Plot Armor ----------------------
  function syncShield(dm) {
    const d = boss(dm);
    if (d.hadScreen && !d.screenDown && panelsLeft() === 0) screenDown(dm, null);
    const screened = d.hadScreen && !d.screenDown;
    dm.flags.invulnerable = screened;
    const want = screened || d.armored;
    const hasInv = has(dm, 'invulnerable');
    if (want && !hasInv) DD.Act.addStatus(dm, 'invulnerable', { turns: -1, silent: true }, dm);
    else if (!want && hasInv && d.ownInv) DD.Act.removeStatus(dm, 'invulnerable', { silent: true });
    d.ownInv = want;
  }

  /** The last panel falls: the screen collapses onto the DM (damage + stun + Exposed for the rest of phase 1). */
  function screenDown(dm, src) {
    const d = boss(dm);
    if (d.screenDown) return;
    d.screenDown = true;
    d.stats.screen = round();
    dm.flags.invulnerable = false;
    if (has(dm, 'invulnerable')) DD.Act.removeStatus(dm, 'invulnerable', { text: 'Exposed!' });
    d.ownInv = false;
    DD.FX.banner('SCREEN DOWN!', { sub: 'His notes, his snacks and his fudged dice are all exposed', color: '#ffd34d', ms: 1100 });
    DD.FX.shake(10, 420);
    DD.FX.particles(dm, { kind: 'dust', count: 22 });
    DD.Act.log('The DM Screen collapses onto the Dungeon Master!', 'hero');
    DD.Act.narrate('dm_screen', {});
    DD.Act.bark(dm, 'screen');
    DD.Act.withCredit(src || null, function () { DD.Act.damage(null, dm, N.screenDrop, { cause: 'other', tags: ['dm_screen'] }); });
    if (active(dm)) DD.Act.addStatus(dm, 'stun', { turns: 1 }, dm);
    if (active(dm) && boss(dm).phase === 1) DD.Act.addStatus(dm, 'dm_exposed', { turns: -1 }, src || null);
    updateFlavor(dm);
  }
  function screened(dm) { const d = boss(dm); return d.hadScreen && !d.screenDown; }

  const PANEL_INFO = [
    { label: 'DM Screen (Left Panel)', secret: 'Encounter tables. Every single row says "goblins".' },
    { label: 'DM Screen (Center Panel)', secret: 'A doodle of the party. Everyone in it is on fire.' },
    { label: 'DM Screen (Right Panel)', secret: '"If they win: pretend this was the plan all along."' },
  ];
  function panelFallen(o, tile, src) {
    const dm = findDM();
    const info = PANEL_INFO[(o.data && o.data.idx) || 0] || PANEL_INFO[0];
    DD.Act.log('A panel of the DM Screen falls over. Behind it: ' + info.secret, 'hero');
    DD.FX.text(tile, 'Peek!', { color: '#ffd34d', size: 15 });
    if (!dm) return;
    const d = boss(dm);
    d.stats.panels++;
    const left = panelsLeft();
    if (left === 0) screenDown(dm, src);
    else {
      DD.FX.text(dm, plural(left, 'panel') + ' left!', { color: '#ffd34d', size: 15 });
      DD.Act.bark(dm, 'screen');
      updateFlavor(dm);
    }
  }
  /** AutoPlay hint: breaking the screen is worth a lot while it shields him (the last panel most). */
  function panelValue(o) {
    const dm = findDM();
    if (!dm || !(o.hp > 0) || boss(dm).screenDown) return 0;
    return panelsLeft() <= 1 ? 45 : 30;
  }

  // ---- phase 2 puzzle: Track Switches -------------------------------------------------------------------------
  /** The train due THIS enemy turn that has not been diverted yet (or null). */
  function divertable(dm) {
    if (!dm || boss(dm).phase < 2) return null;
    return (dm.intents || []).filter(function (i) { return i.skillId === 'dm_railroad' && !(i.delay > 0) && !(i.data && i.data.diverted); })[0] || null;
  }
  const DIVERTED = 'The Railroad: DIVERTED onto the DM!';
  function copyTiles(list) { return list.map(function (p) { return { x: p.x, y: p.y }; }); }
  function divertedIntent(dm) {
    return (dm.intents || []).filter(function (i) { return i.skillId === 'dm_railroad' && i.data && i.data.diverted; })[0] || null;
  }
  function switchTracks(unit, o, tile) {
    const dm = findDM();
    const it = divertable(dm);
    if (!it) { DD.FX.text(tile, 'No train due.', { color: '#d0d0d0', size: 14 }); return; }
    it.tiles = rowTiles(dm.y);
    it.abs = { x: dm.x, y: dm.y };
    it.autoTiles = false;
    it.data = Object.assign({}, it.data, { diverted: true, switcherId: unit.id, unstoppable: true });
    it.label = DIVERTED;
    // from now on it is the party's train: recorded so his stun / taunt / dazzle can't call it off or turn it
    boss(dm).divert = { round: round(), tiles: copyTiles(it.tiles), abs: { x: dm.x, y: dm.y }, lane: it.data.lane, dir: it.data.dir, switcherId: unit.id };
    o.data.on = !o.data.on;
    o.data.used = (o.data.used || 0) + 1;
    boss(dm).stats.switches++;
    DD.FX.tile(tile.x, tile.y, 'pulse', { color: '#ff5a3c' });
    DD.FX.text(tile, '*KA-CHUNK*', { color: '#ffd34d', size: 16 });
    DD.FX.sound('click');
    DD.Act.log(unit.name + ' throws the track switch: the incoming train is diverted onto the Dungeon Master\'s row!', 'hero');
    DD.Act.narrate('dm_switch', { hero: unit.name });
    DD.Act.bark(dm, 'diverted');
    DD.Act.touch();
  }
  /**
   * After any status lands on him: the engine has just cancelled (stun-likes) or re-aimed (taunt) his intents, so put
   * the diverted train's telegraph back exactly where the switch sent it.
   */
  function pinDiverted(dm) {
    const dv = boss(dm).divert;
    if (!dv || dv.round !== round() || !active(dm)) return;
    let it = divertedIntent(dm);
    if (!it) {
      it = DD.AI.makeIntent(dm, 'dm_railroad', dv.abs, { anchor: 'ground', tiles: dv.tiles, noCooldown: true, label: DIVERTED,
        data: { lane: dv.lane, dir: dv.dir, diverted: true, switcherId: dv.switcherId } });
      if (!it) return;
    }
    it.anchor = 'ground'; it.abs = { x: dv.abs.x, y: dv.abs.y }; it.tiles = copyTiles(dv.tiles); it.autoTiles = false;
    it.delay = 0; it.pending = true; it.label = DIVERTED;
    it.data.unstoppable = true;   // AI.describe: no "Incapacitated: this will not happen." on this one
    DD.Act.touch();
  }
  /** Start of his turn: the diverted train runs first, stunned, taunted, dazzled or not (it isn't his attack any more). */
  function runDiverted(dm) {
    const d = boss(dm), dv = d.divert;
    if (!dv || dv.round !== round() || !active(dm)) return;
    d.divert = null;
    let it = divertedIntent(dm);
    if (it) dm.intents.splice(dm.intents.indexOf(it), 1);
    else it = { skillId: 'dm_railroad', anchor: 'ground', abs: dv.abs, tiles: copyTiles(dv.tiles), delay: 0, level: 1, label: DIVERTED,
      data: { lane: dv.lane, dir: dv.dir, diverted: true, switcherId: dv.switcherId } };
    const slot = (dm.skillSlots || []).filter(function (sl) { return sl.id === 'dm_railroad'; })[0];
    DD.Combat.resolveSkill(dm, slot || DD.getSkill('dm_railroad'), { x: dv.abs.x, y: dv.abs.y },
      { extra: { isIntent: true, intent: it, tiles: copyTiles(dv.tiles), dir: { x: dv.dir < 0 ? -1 : 1, y: 0 } } });
    DD.Act.touch();
  }

  // ---- phase 3 puzzle: Player's Handbooks ---------------------------------------------------------------------
  const PAGES = [
    { n: 143, rule: 'Rocks cannot fall indoors. The table is indoors.' },
    { n: 7, rule: 'The DM must give a saving throw. Any saving throw.' },
    { n: 288, rule: 'A rule of cool beats a rule of rocks.' },
  ];
  function doomOn(d) { return !!(d && d.doom && d.doom.active && !d.doom.solved); }
  function bookUsable(o) {
    const dm = findDM();
    return !!dm && doomOn(boss(dm)) && !(o.data && o.data.used);
  }
  function citeBook(unit, o, tile) {
    const dm = findDM();
    if (!dm || !bookUsable(o)) { DD.FX.text(tile, 'Not now.', { color: '#d0d0d0', size: 14 }); return; }
    const d = boss(dm);
    o.data.used = true;
    d.books++;
    d.stats.books++;
    const page = PAGES[(o.data.page || 0) % PAGES.length];
    DD.FX.particles(tile, { kind: 'glitter', count: 16, color: '#ffe680' });
    DD.FX.text(tile, 'OBJECTION! (p. ' + page.n + ')', { color: '#ffe680', size: 16 });
    DD.Act.log(unit.name + ' cites the Player\'s Handbook, page ' + page.n + ': "' + page.rule + '" (' + d.books + '/' + d.booksNeeded + ')', 'hero');
    if (d.books >= d.booksNeeded) rulesLawyered(dm, unit);
    else {
      DD.FX.text(dm, d.books + '/' + d.booksNeeded + ' objections', { color: '#ffe680', size: 15 });
      DD.Act.bark(dm, 'objection');
      updateFlavor(dm);
    }
    DD.Act.touch();
  }
  /** All three books cited: the countdown is cancelled for good and the rocks fall on HIM. */
  function rulesLawyered(dm, hero) {
    const d = boss(dm);
    d.doom.solved = true;
    d.doom.active = false;
    d.stats.lawyered = round();
    dm.intents = dm.intents.filter(function (i) { return i.skillId !== 'dm_tpk'; });
    DD.Act.touch();
    DD.FX.banner('RULES-LAWYERED!', { sub: 'Page 143: the rocks fall on the DM instead', color: '#ffe680', ms: 1100 });
    DD.FX.shake(12, 450);
    DD.FX.projectile({ x: dm.x, y: dm.y, h: 9 }, dm, { kind: 'rock', arc: false, size: 2.4, ms: 300 });
    DD.FX.explosion(dm, { radius: 1, color: '#b9a98a' });
    DD.Act.narrate('dm_objection', { hero: hero ? hero.name : 'The party' });
    DD.Act.bark(dm, 'lawyered');
    DD.Act.withCredit(hero || null, function () { DD.Act.damage(null, dm, N.lawyered, { cause: 'other', tags: ['rocks'] }); });
    if (active(dm)) DD.Act.addStatus(dm, 'stun', { turns: 1 }, dm);
    if (active(dm)) DD.Act.addStatus(dm, 'dm_exposed', { turns: -1 }, hero || null);
    updateFlavor(dm);
  }
  /** Three books near the party, spread apart (book marks of the arena, else free tiles around the heroes). */
  function placeBooks(dm) {
    const heroes = DD.Combat.active('hero').filter(function (h) { return h.kind === 'hero'; });
    const free = function (p) { const t = DD.Grid.tile(p.x, p.y); return !!t && !t.obj && DD.Grid.isFree(p.x, p.y) && !DD.Grid.isDrop(p.x, p.y); };
    let cands = tagged('book').filter(free);
    if (cands.length < N.books) {
      // fallback: free tiles near the party that someone can actually walk up to
      const reach = {};
      heroes.forEach(function (h) {
        reach[h.x + ',' + h.y] = 1;
        DD.Grid.reachable(h, 40, { ignoreUnits: true }).forEach(function (e) { reach[e.x + ',' + e.y] = 1; });
      });
      const usable = function (p) { return U.DIRS.some(function (dd) { return reach[(p.x + dd.x) + ',' + (p.y + dd.y)]; }); };
      const extra = [];
      heroes.forEach(function (h) { DD.Grid.emptyTilesNear(h.x, h.y, 4).forEach(function (p) { if (free(p) && DD.Grid.dist(p, h) >= 2 && usable(p) && !onTiles(extra, p)) extra.push(p); }); });
      cands = cands.concat(extra);
    }
    const near = function (p) { let b = 99; heroes.forEach(function (h) { b = Math.min(b, DD.Grid.dist(p, h)); }); return b; };
    const dmd = function (p) { return DD.Grid.dist(p, dm); };
    cands.sort(function (a, b) { return Math.abs(near(a) - 3) - Math.abs(near(b) - 3) || dmd(b) - dmd(a) || a.y - b.y || a.x - b.x; });
    const picks = [];
    for (let gap = 4; gap >= 1 && picks.length < N.books; gap--) {
      cands.forEach(function (p) {
        if (picks.length >= N.books || onTiles(picks, p)) return;
        if (picks.every(function (q) { return DD.Grid.dist(p, q) >= gap; })) picks.push(p);
      });
    }
    picks.forEach(function (p, i) {
      DD.Act.placeObject(p.x, p.y, BOOK, { label: 'Player\'s Handbook (p. ' + PAGES[i % PAGES.length].n + ')', data: { page: i, used: false } });
      DD.FX.particles(p, { kind: 'glitter', count: 12, color: '#ffe680' });
      DD.FX.tile(p.x, p.y, 'glow', { color: '#ffe680' });
    });
    return picks.length;
  }

  // ---- house rules: rolled on the giant d20 every round (state.rules, one at a time) -----------------------------
  const HOUSE_RULES = [
    { key: 'milestone', lo: 1, hi: 2, good: 0, icon: '🫠', name: 'Milestone XP', desc: 'No effect whatsoever. He just likes saying it.', hooks: {} },
    { key: 'exploding', lo: 3, hi: 5, good: 0, icon: '💥', name: 'Exploding Dice', desc: 'Every attack deals +2 damage (both sides).',
      hooks: { modifyOutgoingDamage: function (d) { if (d.cause === 'skill') d.flat += 2; } } },
    { key: 'snacks', lo: 6, hi: 7, good: 1, icon: '🍕', name: 'Snack Break', desc: 'Everyone except the DM heals 4 HP at the start of their turn.',
      hooks: { onTurnStart: function (unit) { if (active(unit) && !isDM(unit)) DD.Act.heal(null, unit, 4, { cause: 'status' }); } } },
    { key: 'los', lo: 8, hi: 9, good: -1, icon: '📏', name: 'Strict Line of Sight', desc: 'Heroes\' ranged skills get -1 max range.',
      hooks: { modifyRange: function (r) { if (r.unit && r.unit.side === 'hero' && r.max >= 2) r.max = Math.max(r.min, r.max - 1); } } },
    { key: 'ac', lo: 10, hi: 11, good: -1, icon: '🛡️', name: 'Armor Class Is Back', desc: 'Every attack deals 2 less damage (both sides).',
      hooks: { modifyIncomingDamage: function (d) { if (d.cause === 'skill') d.flat -= 2; } } },
    { key: 'flank', lo: 12, hi: 13, good: 0, icon: '🎯', name: 'Flanking Rules', desc: 'A unit next to 2 or more of its foes takes +25% damage from attacks.',
      hooks: { modifyIncomingDamage: function (d) { if (d.cause === 'skill' && flanked(d.target)) d.mult *= 1.25; } } },
    { key: 'cheeto', lo: 14, hi: 15, good: -1, icon: '🧀', name: 'Cheeto Fingers', desc: 'Every tile the DM\'s attacks hit gets Cheeto dust (Slowed on entry).', hooks: {} },
    { key: 'fiat', lo: 16, hi: 17, good: -1, icon: '😈', name: 'DM Fiat', desc: 'The DM\'s attacks deal +4 damage.',
      hooks: { modifyOutgoingDamage: function (d) { if (d.cause === 'skill' && isDM(d.source)) d.flat += 4; } } },
    { key: 'inspire', lo: 18, hi: 19, good: 1, icon: '🌟', name: 'Inspiration for Everyone', desc: 'Heroes start their turn Inspired (+25% damage).',
      hooks: { onTurnStart: function (unit) { if (active(unit) && unit.kind === 'hero') DD.Act.addStatus(unit, 'inspired', { turns: 1 }, null); } } },
    { key: 'speed', lo: 20, hi: 20, good: 1, icon: '⚡', name: 'Speed Factor Initiative', desc: 'Heroes gain +1 AP at the start of their turn.',
      hooks: { onTurnStart: function (unit) { if (active(unit) && unit.kind === 'hero' && !stunned(unit)) DD.Act.gainAp(unit, 1); } } },
  ];
  function ruleFor(roll) {
    for (let i = 0; i < HOUSE_RULES.length; i++) if (roll >= HOUSE_RULES[i].lo && roll <= HOUSE_RULES[i].hi) return HOUSE_RULES[i];
    return HOUSE_RULES[0];
  }
  /** Same outgoing multiplier as the engine's telegraph (ai.js outMult). */
  function outMult(u) {
    let m = 1;
    if (has(u, 'weak')) m *= 0.75;
    if (has(u, 'inspired')) m *= 1.25;
    if (has(u, 'empowered')) m *= 1.5;
    if (u.dmgBonus) m *= 1 + u.dmgBonus;
    if (u.side === 'enemy') { const s = S(); m *= (s && s.difficulty && s.difficulty.dmg) || 1; }
    return m;
  }
  /**
   * Telegraph truth for every enemy, his cameos too: the engine adds a rule's telegraphFlat(unit, intent, rule) to each
   * telegraph (phase 4; before, only his own skills showed the rule and the cameos lied). Exploding Dice +2, Armor
   * Class Is Back −2, Flanking Rules' +25% on a tracked target that is flanked right now. A ⏳ intent fires under a
   * later round's rule: base number. docs/notes/boss-dm.md
   */
  function ruleFlat(unit, intent, r) {
    if (!r || !unit || (intent && intent.delay > 0)) return 0;
    if (r.key === 'exploding') return 2;
    if (r.key === 'ac') return -2;
    if (r.key === 'flank' && intent && intent.anchor === 'unit') {
      const v = DD.Combat.byId(intent.unitId), def = DD.getSkill(intent.skillId);
      const L = def ? DD.skillLevel(def, intent.level || 1) : null;
      if (v && L && L.dmg > 0 && flanked(v)) { const b = L.dmg * outMult(unit); return Math.round(b * 1.25) - Math.round(b); }
    }
    return 0;
  }
  /** His own skills (skill-level telegraphFlat, added by AI.intentDmg like d.flat): DM Fiat's +4 is his alone. */
  function houseFlat(unit, intent) {
    const s = S();
    const r = s && s.rules.filter(function (x) { return x.id === RULE_ID; })[0];
    if (!r || !unit || (intent && intent.delay > 0)) return 0;
    return r.key === 'fiat' && isDM(unit) ? 4 : 0;
  }
  /** Rules Lawyering: a new house rule for this round. From phase 2 on he rerolls anything that helps you. */
  function rollHouseRule(dm, forced) {
    const s = S();
    const d = boss(dm);
    let roll = forced || s.rng.int(1, 20);
    let rule = ruleFor(roll);
    let fudged = false;
    if (!forced && d.phase >= 2 && rule.good > 0) {
      roll = s.rng.int(1, 20);
      rule = ruleFor(roll);
      fudged = true;
    }
    setDie('die_rule', roll);
    DD.Act.addRule({ id: RULE_ID, name: 'House Rule: ' + rule.name, icon: rule.icon, desc: rule.desc + ' (Rolled a ' + roll + '. Lasts this round.)',
      hooks: rule.hooks, turns: 1, key: rule.key, roll: roll, telegraphFlat: ruleFlat });
    d.stats.rules++;
    d.lastRule = rule.key;
    DD.FX.text(dm, rule.icon + ' ' + rule.name + (fudged ? ' (re-rolled!)' : ''), { color: '#ffd34d', size: 15 });
    // the chip, this floating text and the log already show the rule; the narrator caption sits over his intent
    // bubbles for seconds at the start of the player phase, so it only introduces house rules (round 1), then now and then
    if (fudged) DD.Act.log('The DM didn\'t like his first roll, so he rolls again. Behind no screen. In front of everyone.', 'narrator');
    else if (round() <= 1 || DD.rng.next() < 0.25) DD.Act.narrate('dm_rule', { name: rule.name, n: roll });
    DD.Act.maybeBark(dm, 'rule', 0.5);
    return rule;
  }

  // ---- random encounters: cameo minis -----------------------------------------------------------------------------
  /** Real minion/normal enemies by act, read from the registry at runtime (the act authors' enemies). */
  function cameoPool() {
    const out = { 1: [], 2: [], 3: [] };
    Object.keys(DD.defs.enemies).sort().forEach(function (id) {
      const e = DD.defs.enemies[id];
      if (!e || NOT_CAMEO.test(id) || e.boss || !out[e.act] || !Array.isArray(e.skills) || !e.skills.length || !e.sprite) return;
      if (e.tier === 'minion' || (e.tier === 'normal' && e.act < 3)) out[e.act].push(id);
    });
    return out;
  }
  function pickCameo(rng) {
    const pool = cameoPool();
    const acts = [1, 2, 3].filter(function (a) { return pool[a].length; });
    if (!acts.length) {
      const id = OWN_CAMEOS[rng.int(0, OWN_CAMEOS.length - 1)];
      return { id: id, act: 3, hpMult: 1, own: true };
    }
    const act = acts[rng.int(0, acts.length - 1)];
    const id = pool[act][rng.int(0, pool[act].length - 1)];
    // a mini is a mini: every cameo comes out at about act-3 minion toughness, whatever it was in its own act
    const hp = (DD.getEnemy(id) || {}).hp || N.cameoHp;
    return { id: id, act: act, hpMult: U.clamp(N.cameoHp / hp, 0.4, 1.6), own: false };
  }
  /** "Unpainted" copy of a sprite: every palette colour as grey primer. */
  const GREY_KEYS = ['skin', 'cloth', 'cloth2', 'hair', 'metal', 'eye', 'accent'];
  function unpainted(spec) {
    if (!spec || typeof spec !== 'object') return spec;
    const pal = {};
    const src = spec.palette || {};
    GREY_KEYS.forEach(function (k) { if (!src[k]) pal[k] = '#9a98a2'; });
    for (const k in src) {
      const c = U.parseColor(src[k]);
      if (!c) { pal[k] = src[k]; continue; }
      const v = Math.round(78 + (c.r * 0.3 + c.g * 0.59 + c.b * 0.11) * 0.5);
      const hx = ('0' + Math.min(255, v).toString(16)).slice(-2);
      pal[k] = '#' + hx + hx + ('0' + Math.min(255, v + 6).toString(16)).slice(-2);
    }
    return Object.assign({}, spec, { palette: pal });
  }
  function cameoSpots(dm, n) {
    const s = S();
    const heroes = s.units.filter(function (u) { return active(u) && u.side === 'hero'; });
    const far = function (p) { return heroes.every(function (h) { return DD.Grid.dist(p, h) >= 2; }); };
    // only tiles the party can walk to: never inside his sealed alcove (a mini there could neither leave nor be reached)
    const walker = heroes.filter(function (h) { return h.kind === 'hero' && !DD.Grid.isFlying(h); })[0] || heroes[0];
    const reach = walker ? DD.Grid.reachable(walker, 999, { ignoreUnits: true }) : null;
    const open = function (p) { return !reach || reach.has(p.x + ',' + p.y); };
    const ok = function (p) { return DD.Grid.isFree(p.x, p.y) && !DD.Grid.isDrop(p.x, p.y) && !DD.Grid.hazardAt(p.x, p.y) && far(p) && open(p); };
    const marks = s.rng.shuffle(tagged('cameo'));
    let spots = marks.filter(ok);
    // marks taken: next to a mark (his side of the table, in view), then anywhere near him
    const more = function (list) { list.forEach(function (p) { if (spots.length < n && ok(p) && !onTiles(spots, p)) spots.push(p); }); };
    marks.forEach(function (m) { more(DD.Grid.emptyTilesNear(m.x, m.y, 2)); });
    if (spots.length < n) more(DD.Grid.emptyTilesNear(dm.x, dm.y, 5));
    return spots.slice(0, n);
  }
  /** Minis on the table: everything on his side but him (a cameo's split slimes and reassembled skeletons count too). */
  function cameoCount() { return S().units.filter(function (u) { return active(u) && u.side === 'enemy' && !isDM(u); }).length; }
  /** Whatever a cameo left behind (split slimes, a reassembled skeleton, a summoned add) came out of his mini box too. */
  function adoptMinis(dm) {
    S().units.forEach(function (u) {
      if (!active(u) || u === dm || u.side !== 'enemy' || isDM(u) || (u.data && u.data.dmCameo)) return;
      const def = DD.getEnemy(u.defId);
      u.data = u.data || {};
      u.data.dmCameo = true;
      u.data.cameoAct = (def && def.act) || 3;
      if (def && !u.sprite && OWN_CAMEOS.indexOf(def.id) < 0) u.sprite = unpainted(def.sprite);
    });
  }
  /** Random Encounter: up to 2 cameo minis (3 alive at most, 6 per fight). Returns how many arrived. */
  function randomEncounter(dm) {
    const s = S();
    const d = boss(dm);
    if (has(dm, 'charmed')) return 0;
    const n = Math.min(N.cameoPer, N.cameoAlive - cameoCount(), N.cameoTotal - d.cameos);
    if (n <= 0) return 0;
    const spots = cameoSpots(dm, n);
    const names = [];
    spots.forEach(function (p) {
      const pick = pickCameo(s.rng);
      const def = DD.getEnemy(pick.id);
      const u = DD.Act.spawn(pick.id, p.x, p.y, { hpMult: pick.hpMult });
      if (!u) return;
      u.data.dmCameo = true;
      u.data.cameoAct = pick.act;
      if (!pick.own && def) u.sprite = unpainted(def.sprite);
      DD.FX.text(u, '🎲 Cameo from Act ' + pick.act + '!', { color: '#ffd34d', size: 14 });
      names.push(u.name);
    });
    if (!names.length) return 0;
    d.cameos += names.length;
    d.stats.cameos += names.length;
    DD.FX.text(dm, '🎲 Random Encounter!', { color: '#ffd34d', size: 17 });
    DD.Act.log('Random Encounter! The DM digs out ' + names.join(' and ') + ' from his box of minis.', 'enemy');
    DD.Act.narrate('dm_cameo', { name: names[0], n: names.length });
    DD.Act.maybeBark(dm, 'cameo', 0.6);
    return names.length;
  }

  // ---- phases -----------------------------------------------------------------------------------------------------
  /** midTurn: the threshold was crossed by a hit (not at round start), so the doom countdown gets a full 3 rounds. */
  function enterPhase(dm, phase, midTurn) {
    const d = boss(dm);
    d.phase = phase;
    d.phaseRound = round();
    d.lastShift = round();
    d.stats['phase' + phase] = round();
    d.armored = false;
    if (has(dm, 'dm_exposed')) DD.Act.removeStatus(dm, 'dm_exposed', { text: 'Notes recovered' });
    if (phase === 2) {
      DD.FX.banner('PHASE 2: THE RAILROAD', { sub: '"You WILL go where the story goes."', color: '#ffb347', ms: 1200 });
      DD.Act.log('PHASE 2: The Railroad. Trains will thunder down the pencilled tracks, one lane per round.', 'enemy');
      DD.Act.narrate('dm_phase2', {});
      DD.Act.bark(dm, 'phase2');
    } else if (phase === 3) {
      d.doom = { active: true, solved: false, at: round() + N.doomRounds - (midTurn ? 0 : 1), fired: 0 };
      d.books = 0;
      const placed = placeBooks(dm);
      // a crowded table may not fit all three: the ones that did appear are enough
      d.booksNeeded = Math.max(1, Math.min(N.books, placed));
      DD.FX.banner('PHASE 3: ROCKS FALL, EVERYONE DIES', { sub: 'Cite all ' + d.booksNeeded + ' Player\'s Handbooks before the countdown ends!', color: '#ff6b5a', ms: 1300 });
      DD.Act.log('PHASE 3: Rocks Fall, Everyone Dies. In ' + N.doomRounds + ' rounds every hero takes ' + doomDmg() + ' damage, unless the party cites all ' +
        d.booksNeeded + ' Player\'s Handbooks (' + placed + ' just appeared). Stunning him buys a round.', 'enemy');
      DD.Act.narrate('dm_phase3', {});
      DD.Act.bark(dm, 'phase3');
    }
    DD.FX.shake(8, 380);
    updateFlavor(dm);
  }
  function doomDmg() { return DD.getSkill('dm_tpk').levels[0].dmg; }
  /** Phase transitions at the HP thresholds (idempotent; phases are never skipped). */
  function syncPhase(dm) {
    const d = boss(dm);
    const want = dm.hp <= threshold(dm, 3) ? 3 : dm.hp <= threshold(dm, 2) ? 2 : 1;
    while (d.phase < want) enterPhase(dm, d.phase + 1);
  }

  // ---- hooks on the DM ------------------------------------------------------------------------------------------
  const HOOKS = {
    onCombatStart: function (unit) {
      const d = boss(unit);
      // unshare legend data and name the panels (left to right)
      objTiles(PANEL).sort(function (a, b) { return a.x - b.x || a.y - b.y; }).forEach(function (t, i) {
        t.obj.data = Object.assign({}, t.obj.data, { idx: Math.min(i, PANEL_INFO.length - 1) });
        t.obj.label = PANEL_INFO[Math.min(i, PANEL_INFO.length - 1)].label;
      });
      objTiles(SWITCH).forEach(function (t) { t.obj.data = Object.assign({}, t.obj.data, { on: false, used: 0 }); });
      setDie('die_rule', 20);
      setDie('die_fudge', 1);
      DD.Act.bark(unit, 'spawn');
      d.hadScreen = panelsLeft() > 0;
      syncShield(unit);
      updateFlavor(unit);
    },
    onRoundStart: function (unit) {
      // Plot Armor only ever lasts until the next round: if a healer topped him back above the floor, the phase
      // doesn't flip below, and without this he'd stay invulnerable forever (soft-lock)
      const d = boss(unit);
      if (d.armored && !(d.armoredAt >= round())) d.armored = false;
      adoptMinis(unit);
      syncPhase(unit);
      syncShield(unit);
      if (!stunned(unit)) rollHouseRule(unit);
      else DD.Act.log('The DM is too dazed to invent a house rule this round. Freedom!', 'narrator');
      updateFlavor(unit);
    },
    /** Stun guard: after a stun he can't be stunned again during the next round (his own puzzle stuns always land). */
    modifyStatus: function (m) {
      if (!isDM(m.unit) || STUN_LIKE.indexOf(m.id) < 0 || m.src === m.unit) return;
      const d = boss(m.unit);
      if (round() <= d.stunGuard) {
        m.cancel = true;
        DD.FX.text(m.unit, 'Not again! (stun-proof)', { color: '#dddddd', size: 14 });
      }
    },
    /** His turn starts: a diverted train runs first, whatever state he is in (see runDiverted). */
    onTurnStart: function (unit) { if (isDM(unit)) runDiverted(unit); },
    onStatusApplied: function (unit, st) {
      if (!isDM(unit) || !st) return;
      pinDiverted(unit);   // a stun just cancelled (a taunt re-aimed) his intents: the diverted train stays put
      if (STUN_LIKE.indexOf(st.id) < 0) return;
      const d = boss(unit);
      d.stats.stuns++;
      d.stunGuard = round() + (st.fresh ? 2 : 1);
      if (doomOn(d)) {
        d.doom.at++;
        DD.FX.text(unit, 'He lost his place in his notes! (+1 round)', { color: '#ffe680', size: 15 });
        DD.Act.log('Stunned, the DM loses his place in his notes: Rocks Fall, Everyone Dies is pushed back a round.', 'hero');
      }
      DD.Act.maybeBark(unit, 'stunned', 0.7);
      updateFlavor(unit);
    },
    /**
     * [phase 4, engine modifyFinalDamage] Plot Armor clamps the hit itself (after armor, before Block) instead of
     * healing him back after it: one hit carries him at most down to the floor that will hold (the next phase's floor
     * when this hit turns the phase over, this phase's if it already turned this round). onTakeDamage below still turns
     * the phase and raises the armor; its heal-back is only a safety net now. So lifesteal, damage stats, the log and
     * the damage number all see the HP he really lost. docs/notes/boss-dm.md
     */
    modifyFinalDamage: function (dd) {
      const u = dd.target;
      if (!isDM(u) || u.dead) return;
      const d = boss(u);
      const fl0 = floorHp(u);
      if (fl0 <= 0) return;
      const absorb = dd.ignoreBlock ? 0 : Math.min(u.block || 0, dd.amount);
      const after = u.hp - (dd.amount - absorb);
      if (after > fl0) return;
      const fl = d.lastShift !== round() ? floorOf(u, d.phase + 1) : fl0;
      if (fl > 0 && after < fl) dd.amount = Math.max(0, u.hp - fl + absorb);
    },
    /**
     * Crossing a threshold turns the phase over at once (the damage carries on down to the next floor); a second
     * threshold in the same round hits Plot Armor: he can't drop below it until the next round's phase change.
     */
    onTakeDamage: function (dd) {
      const u = dd.target;
      if (!isDM(u) || u.dead) return;
      const d = boss(u);
      if (floorHp(u) <= 0 || u.hp > floorHp(u)) return;
      if (d.lastShift !== round()) enterPhase(u, d.phase + 1, true);
      const fl = floorHp(u);
      if (fl > 0 && u.hp <= fl) {
        if (u.hp < fl) DD.Act.heal(null, u, fl - u.hp, { silent: true, cause: 'status' });
        if (!d.armored) {
          d.armored = true;
          d.armoredAt = round();
          d.ownInv = true;
          if (!has(u, 'invulnerable')) DD.Act.addStatus(u, 'invulnerable', { turns: -1, silent: true }, u);
          DD.FX.text(u, 'PLOT ARMOR!', { color: '#ffe680', size: 18 });
          DD.Act.log('Plot armor! The DM refuses to drop below ' + fl + ' HP until next round.', 'enemy');
          updateFlavor(u);
        }
      }
      syncShield(u);
    },
    onDeath: function (unit) {
      DD.Act.removeRule(RULE_ID);
      DD.FX.banner('THE DM YIELDS', { sub: '"Fine. FINE. You win. Same time next week?"', color: '#ffd34d', ms: 1400 });
      DD.Act.narrate('dm_defeat', {});
      DD.Act.log('The Dungeon Master: "Fine. FINE. You win. Same time next week?"', 'enemy');
    },
  };

  // ---- the planner ------------------------------------------------------------------------------------------------
  function heroFirst(list) { const h = list.filter(function (u) { return u.kind === 'hero'; }); return h.length ? h : list; }
  function inReach(unit, api, skillId, f) {
    const def = DD.getSkill(skillId);
    const rg = DD.Targeting.range(unit, def, 1);
    const dd = api.dist(unit, f);
    return dd >= rg[0] && dd <= rg[1] && (def.target.los === false || api.los(unit, f));
  }
  /** Fudged Rolls: tracking shots at the n weakest targets (heroes first). Behind his screen he needs no line of sight. */
  function planRolls(unit, api, foes, n) {
    const sid = screened(unit) ? 'dm_secret_roll' : 'dm_fudged_roll';
    const list = foes.filter(function (f) { return inReach(unit, api, sid, f); });
    list.sort(function (a, b) {
      return (a.kind === 'hero' ? 0 : 1) - (b.kind === 'hero' ? 0 : 1) || (a.hp + (a.block || 0)) - (b.hp + (b.block || 0)) || api.dist(unit, a) - api.dist(unit, b);
    });
    list.slice(0, n).forEach(function (f) { api.addIntent(unit, sid, f, { anchor: 'unit' }); });
    return Math.min(n, list.length);
  }
  /** Rocks Fall: crosses around (up to) n heroes keeping their distance (the melee crowd gets shoved instead), next round. */
  function planRocks(unit, api, foes, n) {
    const pool = api.rng.shuffle(heroFirst(foes));
    const crowd = function (u) { return foes.filter(function (o) { return o !== u && api.dist(o, u) <= 2; }).length; };
    const near = function (u) { return api.dist(u, unit) <= 2 ? 1 : 0; };
    pool.sort(function (a, b) { return near(a) - near(b) || crowd(b) - crowd(a); });
    const centers = [];
    pool.forEach(function (f) { if (centers.length < n && !centers.some(function (c) { return api.dist(c, f) <= 2; })) centers.push({ x: f.x, y: f.y }); });
    if (!centers.length) return false;
    const out = [];
    centers.forEach(function (c) {
      DD.Grid.shape('cross', c, null, 1).forEach(function (p) { if (!onTiles(out, p) && !(p.x === unit.x && p.y === unit.y)) out.push(p); });
    });
    api.addIntent(unit, 'dm_rocks_fall', centers[0], { anchor: 'ground', tiles: out, delay: 1, data: { centers: centers } });
    return true;
  }
  /** The Railroad: the busiest lane without a train on it gets one next round. */
  function planTrain(unit, api, foes) {
    const d = boss(unit);
    const ls = lanes(unit);
    const busy = {};
    (unit.intents || []).forEach(function (i) { if (i.skillId === 'dm_railroad' && i.data && i.data.lane !== undefined) busy[i.data.lane] = 1; });
    let best = -1, bestSc = -1;
    ls.forEach(function (lane, i) {
      if (busy[i]) return;
      let sc = ((i + d.p2 + d.p3) % ls.length === 0) ? 0.5 : 0;
      foes.forEach(function (f) {
        if (onTiles(lane, f)) sc += f.kind === 'hero' ? 3 : 1;
        else if (lane.some(function (p) { return api.dist(p, f) === 1; })) sc += 1;
      });
      if (sc > bestSc) { bestSc = sc; best = i; }
    });
    if (best < 0) return false;
    const lane = ls[best];
    api.addIntent(unit, 'dm_railroad', lane[Math.floor(lane.length / 2)], { anchor: 'ground', tiles: lane, delay: 1,
      label: 'The Railroad (Track ' + (best + 1) + ')', data: { lane: best, dir: round() % 2 ? 1 : -1 } });
    return true;
  }
  function planHook(unit, api, foes) {
    const list = heroFirst(foes).filter(function (f) { return inReach(unit, api, 'dm_plot_hook', f); });
    list.sort(function (a, b) { return api.dist(unit, b) - api.dist(unit, a); });
    if (!list.length) return false;
    api.addIntent(unit, 'dm_plot_hook', list[0], { anchor: 'unit' });
    return true;
  }
  function planDoom(unit, api) {
    const d = boss(unit);
    if (!doomOn(d) || pending(unit, 'dm_tpk')) return;
    const delay = U.clamp(d.doom.at - api.state.round, 0, N.doomRounds - 1);
    api.addIntent(unit, 'dm_tpk', { x: unit.x, y: unit.y }, { anchor: 'ground', tiles: allTiles(api.state), delay: delay });
  }

  function dmPlan(unit, api) {
    const d = boss(unit);
    syncPhase(unit);
    syncShield(unit);
    const foes = api.foes(unit);
    if (!foes.length) return;
    if (d.phase === 1) {
      d.p1++;
      if (!(d.p1 % 3 === 1 && randomEncounter(unit)) && !pending(unit, 'dm_rocks_fall')) planRocks(unit, api, foes, 3);
      planRolls(unit, api, foes, N.rolls1);
    } else if (d.phase === 2) {
      d.p2++;
      planTrain(unit, api, foes);
      if (d.p2 % 2 === 1) planHook(unit, api, foes);
      planRolls(unit, api, foes, d.p2 % 2 === 1 ? N.rolls2 - 1 : N.rolls2);
      if (d.p2 % 3 === 0) randomEncounter(unit);
    } else {
      d.p3++;
      planDoom(unit, api);
      if (d.p3 % 2 === 0) planTrain(unit, api, foes);
      else if (!pending(unit, 'dm_rocks_fall')) planRocks(unit, api, foes, 3);
      planRolls(unit, api, foes, N.rolls3);
      if (d.p3 % 3 === 0) randomEncounter(unit);
    }
    // crowding him (2+ foes adjacent) gets everyone shoved off the table, at most every other round
    const close = foes.filter(function (f) { return api.dist(f, unit) === 1; }).length;
    if (close >= 2 && api.state.round - (d.lastShove || -9) >= 2) {
      d.lastShove = api.state.round;
      api.addIntent(unit, 'dm_get_off', unit, { anchor: 'self' });
    }
    updateFlavor(unit);
  }

  // ---- FX painters (visual only) --------------------------------------------------------------------------------
  function isoPt(x, y, z, ax, ay, a, b, h) { return [x + (ax * a - 32 * b) * z, y + (ay * a + 16 * b) * z - h * z]; }
  /** Iso block in a frame where a runs along the travel axis and b across it (toward +y). */
  function isoBlock(c, x, y, z, dir, a0, a1, b0, b1, h, top, side, end) {
    const ax = 32 * dir, ay = 16 * dir;
    const P = function (a, b, hh) { return isoPt(x, y, z, ax, ay, a, b, hh); };
    const face = function (pts, fill) {
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = '#1a1014'; c.lineWidth = 1.2 * z; c.stroke();
    };
    const ea = dir > 0 ? a1 : a0;   // the end facing +x is the visible one
    face([P(ea, b0, 0), P(ea, b1, 0), P(ea, b1, h), P(ea, b0, h)], end);
    face([P(a0, b1, 0), P(a1, b1, 0), P(a1, b1, h), P(a0, b1, h)], side);
    face([P(a0, b0, h), P(a1, b0, h), P(a1, b1, h), P(a0, b1, h)], top);
  }
  function drawTrain(c, x, y, p, view, evt) {
    const z = view.zoom || 1, dir = evt.dirX < 0 ? -1 : 1;
    const ax = 32 * dir, ay = 16 * dir;
    const P = function (a, b, h) { return isoPt(x, y, z, ax, ay, a, b, h); };
    c.save();
    // smoke puffs trailing behind the chimney
    for (let k = 0; k < 5; k++) {
      const q = P(-0.15 - k * 0.32, -0.05, 34 + k * 6);
      c.fillStyle = 'rgba(235,235,240,' + (0.55 - k * 0.09) + ')';
      c.beginPath(); c.arc(q[0], q[1], (5 + k * 2.4) * z, 0, Math.PI * 2); c.fill();
    }
    const coal = function () { isoBlock(c, x, y, z, dir, -2.1, -1.2, -0.26, 0.26, 16, '#c9a24f', '#8a5a2b', '#6a4520'); };
    if (dir > 0) coal();                                                                          // behind: drawn first
    isoBlock(c, x, y, z, dir, -1.1, 0.25, -0.28, 0.28, 18, '#3a3f4a', '#c0392b', '#7a1f2b');      // boiler
    isoBlock(c, x, y, z, dir, -1.1, -0.55, -0.3, 0.3, 30, '#2a2e36', '#a8302a', '#6a1a1a');      // cab
    isoBlock(c, x, y, z, dir, -0.15, 0.05, -0.08, 0.08, 30, '#222', '#333', '#111');             // chimney
    if (dir < 0) coal();                                                                          // westbound: in front
    const wheel = function (a) { const w = P(a, 0.3, 4); c.fillStyle = '#ffd34d'; c.strokeStyle = '#1a1014'; c.lineWidth = 1.2 * z; c.beginPath(); c.arc(w[0], w[1], 4.5 * z, 0, Math.PI * 2); c.fill(); c.stroke(); };
    [-1.9, -1.4, -0.8, -0.3, 0.1].forEach(wheel);
    const lamp = P(0.27, 0.1, 13);
    c.fillStyle = 'rgba(255,240,150,0.95)'; c.beginPath(); c.arc(lamp[0], lamp[1], 3.4 * z, 0, Math.PI * 2); c.fill();
    const label = P(-0.45, 0.3, 11);
    c.font = 'bold ' + Math.round(7 * z) + 'px "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffe9a8'; c.fillText('PLOT', label[0], label[1]);
    c.restore();
  }
  function drawDieProjectile(c, x, y, p, view) {
    const z = view.zoom || 1, r = 7 * z, a = p * 9;
    c.save(); c.translate(x, y - 10 * z); c.rotate(a);
    c.beginPath();
    for (let k = 0; k < 6; k++) { const t = -Math.PI / 2 + k * Math.PI / 3; if (k) c.lineTo(Math.cos(t) * r, Math.sin(t) * r); else c.moveTo(Math.cos(t) * r, Math.sin(t) * r); }
    c.closePath(); c.fillStyle = '#7a3fc0'; c.fill(); c.strokeStyle = '#1a1014'; c.lineWidth = 1.4 * z; c.stroke();
    c.rotate(-a);
    c.font = 'bold ' + Math.round(7 * z) + 'px "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffe08a'; c.fillText('19', 0, 0.5 * z);
    c.restore();
  }
  function trainFx(lane, dir) {
    if (!lane.length) return;
    const xs = lane.map(function (p) { return p.x; });
    const y = lane[0].y, x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    const from = dir < 0 ? { x: x1 + 2, y: y, h: 0 } : { x: x0 - 2, y: y, h: 0 };
    const to = dir < 0 ? { x: x0 - 2, y: y, h: 0 } : { x: x1 + 2, y: y, h: 0 };
    DD.FX.text(lane[Math.floor(lane.length / 2)], 'CHOO CHOO!', { color: '#ffb347', size: 18 });
    DD.FX.projectile(from, to, { kind: 'custom', draw: drawTrain, dirX: dir < 0 ? -1 : 1, arc: false, ms: 70 * (x1 - x0 + 5), sound: 'roar', trail: false });
    DD.FX.shake(7, 420);
  }

  // ---- skills -----------------------------------------------------------------------------------------------------
  /** The DM's attack damage: exact numbers (his dais never adds a high-ground bonus). */
  function dmHit(ctx, victim, amount, tags) { return DD.Act.damage(ctx.user, victim, amount, { noHighGround: true, tags: tags || [] }); }
  function cheetoTrail(list) {
    if (!ruleActive('cheeto')) return;
    list.forEach(function (p) { const t = DD.Grid.tile(p.x, p.y); if (t && !t.surface && !t.obj) DD.Act.setSurface(p.x, p.y, 'cheeto', 2); });
  }
  function scripted() { return 'Only the Dungeon Master\'s own script uses this.'; }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; def.telegraphFlat = houseFlat; return DD.registerSkill(def); }

  function rollExecute(ctx) {
    DD.Act.maybeBark(ctx.user, 'attack', 0.3);
    const face = ctx.rng.int(1, 7);
    setDie('die_fudge', face);
    DD.FX.text(ctx.user, 'Rolled a ' + face + '... "that hits."', { color: '#ffe08a', size: 14 });
    if (ctx.targetUnit) DD.FX.projectile(ctx.user, ctx.targetUnit, { kind: 'custom', draw: drawDieProjectile, arc: 40, ms: 360, sound: 'hit' });
    ctx.foes.forEach(function (f) { if (active(f)) dmHit(ctx, f, ctx.L.dmg, ['dice']); });
    cheetoTrail(ctx.tiles);
  }
  eskill({ id: 'dm_fudged_roll', name: 'Fudged Roll', icon: '🎲', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 15 }], target: { type: 'unit', range: [1, 14], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the tracked target. Break line of sight (soda cans, dice) and it whiffs.'; },
    flavor: 'He rolled a 3. He says it was a 19. Now that the screen is gone, everyone saw it was a 3.',
    execute: rollExecute });
  eskill({ id: 'dm_secret_roll', name: 'Roll Behind the Screen', icon: '🎲', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 15 }], target: { type: 'unit', range: [1, 14], filter: 'enemy', los: false },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the tracked target. Rolled behind the DM Screen, so it needs no line of sight. Break the screen!'; },
    flavor: '*clatter* "...Hm. Interesting." *writes something down*',
    execute: rollExecute });

  eskill({ id: 'dm_rocks_fall', name: 'Rocks Fall', icon: '🪨', kind: 'attack', tags: ['aoe'], anchor: 'ground',
    levels: [{ dmg: 26 }], target: { type: 'tile', range: [0, 40], filter: 'any', los: false }, area: { shape: 'cross', size: 1 },
    canUse: scripted,
    desc: function (L) { return 'When the countdown ends, deal ' + L.dmg + ' damage to every unit on the marked tiles (his own minis too) and leave rubble.'; },
    flavor: '"Rocks fall." He doesn\'t even look up from his phone.',
    execute: function (ctx) {
      const centers = (ctx.intent && ctx.intent.data && ctx.intent.data.centers) || (ctx.target ? [ctx.target] : []);
      centers.forEach(function (c, i) { DD.FX.projectile({ x: c.x, y: c.y, h: 10 }, c, { kind: 'rock', arc: false, size: 2.2, ms: 260, parallel: i > 0 }); });
      DD.FX.shake(9, 380);
      ctx.units.forEach(function (v) { if (v !== ctx.user && active(v)) dmHit(ctx, v, ctx.L.dmg, ['rocks']); });
      centers.forEach(function (c) {
        DD.FX.particles(c, { kind: 'dust', count: 16 });
        const t = DD.Grid.tile(c.x, c.y);
        if (t && !t.tag && !t.obj && DD.Grid.terrain(t).walkable !== false && !DD.Grid.terrain(t).liquid && t.t !== TRACK) DD.Act.setTerrain(c.x, c.y, 'rubble');
      });
      cheetoTrail(ctx.tiles);
    } });

  eskill({ id: 'dm_railroad', name: 'The Railroad', icon: '🚂', kind: 'attack', tags: ['aoe', 'push'], anchor: 'ground',
    levels: [{ dmg: 28, push: 1, self: N.divert }], target: { type: 'tile', range: [0, 40], filter: 'any', los: false },
    area: { shape: 'custom', fn: function (ctx) { return ctx.target && ctx.state ? rowTiles(ctx.target.y, ctx.state.grid) : []; } },
    canUse: scripted,
    desc: function (L) {
      return 'A train thunders down the marked lane: ' + L.dmg + ' damage to every unit on it (his minis too), knocked ' + L.push +
        ' tile south. Pull a Track Switch while it is due to divert it onto the DM\'s row: ' + L.self + ' damage to him, and he is Vulnerable until the end of his next turn. ' +
        'A diverted train runs even if he is stunned.';
    },
    flavor: 'The 4:15 Plot Express. It does not stop for side quests.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, it = ctx.intent;
      const dv = !!(it && it.data && it.data.diverted);
      trainFx(ctx.tiles, it && it.data ? it.data.dir : 1);
      if (!dv) DD.Act.maybeBark(u, 'attack', 0.4);
      const victims = [];
      ctx.tiles.forEach(function (p) { const v = DD.Grid.unitAt(p.x, p.y); if (active(v) && v !== u && victims.indexOf(v) < 0) victims.push(v); });
      victims.forEach(function (v) {
        if (!active(v)) return;
        dmHit(ctx, v, L.dmg, ['train']);
        if (active(v)) DD.Act.push(u, v, SOUTH, L.push);
      });
      if (dv && active(u) && onTiles(ctx.tiles, u)) {
        const hero = DD.Combat.byId(it.data.switcherId);
        boss(u).stats.diverted++;
        DD.FX.text(u, 'RUN OVER BY HIS OWN PLOT!', { color: '#ffb347', size: 17 });
        DD.Act.log('The Dungeon Master is flattened by his own railroad.', 'hero');
        DD.Act.withCredit(hero || null, function () { DD.Act.damage(null, u, L.self, { cause: 'other', tags: ['train'] }); });
        if (active(u)) DD.Act.addStatus(u, 'vulnerable', { turns: 2 }, hero || null);
      }
      cheetoTrail(ctx.tiles);
    } });

  eskill({ id: 'dm_plot_hook', name: 'Plot Hook', icon: '🪝', kind: 'attack', tags: ['ranged', 'pull'], anchor: 'unit',
    levels: [{ dmg: 10, pull: 3 }], target: { type: 'unit', range: [2, 14], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the tracked target and pull it ' + L.pull + ' tiles toward the DM. The plot is THIS way.'; },
    flavor: 'You see a mysterious old man in a tavern. You are going to talk to him. You do not have a choice.',
    execute: function (ctx) {
      const v = ctx.targetUnit;
      if (v) DD.FX.beam(ctx.user, v, { color: '#d9c48a', width: 3 });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        dmHit(ctx, f, ctx.L.dmg, ['hook']);
        if (active(f)) DD.Act.pull(ctx.user, f, ctx.user, ctx.L.pull);
      });
      cheetoTrail(ctx.tiles);
    } });

  eskill({ id: 'dm_get_off', name: 'Get Off My Table', icon: '🖐️', kind: 'attack', tags: ['melee', 'aoe', 'push'], anchor: 'self',
    levels: [{ dmg: 13, push: 2 }], target: { type: 'self' }, area: { shape: 'adjacent' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every foe next to the DM and knock them back ' + L.push + ' tiles.'; },
    flavor: 'Elbows. Off. The. Table.',
    execute: function (ctx) {
      DD.FX.shake(5, 250);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.lunge(ctx.user, f);
        dmHit(ctx, f, ctx.L.dmg, ['shove']);
        if (active(f)) DD.Act.knockback(ctx.user, f, ctx.L.push);
      });
      cheetoTrail(ctx.tiles);
    } });

  eskill({ id: 'dm_tpk', name: 'Rocks Fall, Everyone Dies', icon: '☠️', kind: 'attack', tags: ['aoe'], anchor: 'ground',
    levels: [{ dmg: 60 }], target: { type: 'tile', range: [0, 60], filter: 'any', los: false },
    area: { shape: 'custom', fn: function (ctx) { return allTiles(ctx.state); } },
    canUse: scripted,
    desc: function (L) {
      return 'When the countdown ends, deal ' + L.dmg + ' damage to every hero and summon on the table. Cite all ' + N.books +
        ' Player\'s Handbooks (1 AP each) to cancel it for good; stunning the DM pushes it back 1 round.';
    },
    flavor: 'The oldest rule in the book. He is not sorry.',
    execute: function (ctx) {
      const u = ctx.user, d = boss(u);
      DD.FX.banner('ROCKS FALL', { sub: 'Everyone dies.', color: '#ff6b5a', ms: 1000 });
      DD.FX.shake(16, 700);
      ctx.foes.forEach(function (f, i) { DD.FX.projectile({ x: f.x, y: f.y, h: 12 }, f, { kind: 'rock', arc: false, size: 2.6, ms: 280, parallel: i > 0 }); });
      ctx.foes.forEach(function (f) { if (active(f)) dmHit(ctx, f, ctx.L.dmg, ['rocks']); });
      d.stats.doomFired++;
      if (d.doom) { d.doom.fired = (d.doom.fired || 0) + 1; d.doom.at = ctx.state.round + N.doomRounds; }
      // charmed, his "foes" are his own minis: the party is spared this time (the countdown restarts anyway)
      DD.Act.log(has(u, 'charmed') ? 'Charmed, the DM drops the rocks on his own minis instead. (He is already restarting the countdown.)'
        : 'Rocks fall. Everyone dies. (He is already restarting the countdown.)', 'enemy');
    } });

  // cameo minis (fallback when no real act enemies are registered)
  eskill({ id: 'dm_cameo_stab', name: 'Generic Stab', icon: '🗡️', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 7 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the adjacent target.'; },
    flavor: 'Stat block: "goblin, but angrier".',
    execute: function (ctx) { DD.Act.maybeBark(ctx.user, 'attack', 0.25); if (ctx.target) DD.FX.lunge(ctx.user, ctx.target); ctx.foes.forEach(function (f) { if (active(f)) DD.Act.damage(ctx.user, f, ctx.L.dmg); }); } });
  eskill({ id: 'dm_cameo_bone', name: 'Bone Toss', icon: '🦴', kind: 'attack', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: 6 }], target: { type: 'unit', range: [2, 4], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to the tracked target.'; },
    flavor: 'It throws its own femur. Some assembly required.',
    execute: function (ctx) { DD.Act.maybeBark(ctx.user, 'attack', 0.25); if (ctx.targetUnit) DD.FX.projectile(ctx.user, ctx.targetUnit, { kind: 'bone' }); ctx.foes.forEach(function (f) { if (active(f)) DD.Act.damage(ctx.user, f, ctx.L.dmg); }); } });
  eskill({ id: 'dm_cameo_ember', name: 'Blister-Pack Ember', icon: '🔥', kind: 'attack', tags: ['ranged', 'fire'], anchor: 'unit',
    levels: [{ dmg: 6 }], target: { type: 'unit', range: [1, 4], filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to the tracked target.'; },
    flavor: 'Fired straight through the plastic. Collectors weep.',
    execute: function (ctx) { DD.Act.maybeBark(ctx.user, 'attack', 0.25); if (ctx.targetUnit) DD.FX.projectile(ctx.user, ctx.targetUnit, { kind: 'fireball' }); ctx.foes.forEach(function (f) { if (active(f)) DD.Act.damage(ctx.user, f, ctx.L.dmg, { element: 'fire' }); }); } });

  // ---- terrain & objects ------------------------------------------------------------------------------------------
  DD.registerTerrain({ id: TRACK, name: 'Pencilled Train Tracks', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#e3dfcc', left: '#bdb8a5', right: '#a29d8b' },
    desc: 'Somebody drew train tracks on the battle map. In pencil. With menace. During The Railroad, trains run here.',
    draw: function (g) {
      const c = g.ctx;
      c.save();
      c.transform(32, 16, -32, 16, 0, 0);
      c.fillStyle = 'rgba(120,88,56,0.55)';
      [-0.375, -0.125, 0.125, 0.375].forEach(function (u) { c.fillRect(u - 0.05, -0.32, 0.1, 0.64); });
      c.strokeStyle = 'rgba(70,70,82,0.9)'; c.lineWidth = 0.05;
      c.beginPath(); c.moveTo(-0.5, -0.2); c.lineTo(0.5, -0.2); c.moveTo(-0.5, 0.2); c.lineTo(0.5, 0.2); c.stroke();
      c.restore();
    } });

  function P(u, v, h) { return [32 * (u - v), 16 * (u + v) - (h || 0)]; }
  function drawPanel(g, obj, t) {
    const c = g.ctx, H = 32, v0 = -0.02, v1 = 0.07, A = -0.47, B = 0.47;
    g.ellipse(0, 3, 24, 9, 'rgba(0,0,0,0.28)');
    g.poly([P(A, v0, H), P(B, v0, H), P(B, v1, H), P(A, v1, H)], '#d8c9a8', true);
    g.poly([P(B, v0), P(B, v1), P(B, v1, H), P(B, v0, H)], '#4a1019', true);
    g.poly([P(A, v1), P(B, v1), P(B, v1, H), P(A, v1, H)], '#7a1f2b', true);
    g.poly([P(A + 0.05, v1, 3), P(B - 0.05, v1, 3), P(B - 0.05, v1, H - 3), P(A + 0.05, v1, H - 3)], null, '#e8b84a');
    const m = P(0, v1, H / 2);
    c.save();
    c.translate(m[0], m[1]);
    c.transform(1, 0.5, 0, 1, 0, 0);
    // a heroic (if wonky) dragon and the logo
    c.fillStyle = '#e8b84a';
    c.beginPath(); c.moveTo(-9, 3); c.quadraticCurveTo(-2, -9, 6, -4); c.lineTo(11, -9); c.lineTo(9, -1); c.quadraticCurveTo(2, 6, -9, 3); c.fill();
    c.beginPath(); c.moveTo(-2, -3); c.lineTo(-6, -12); c.lineTo(2, -5); c.fill();
    c.font = 'bold 7px "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffe9a8'; c.fillText('DM', 0, 10);
    c.restore();
    if (obj.maxHp > 0 && obj.hp < obj.maxHp) {
      const k = 1 - obj.hp / obj.maxHp;
      g.line(P(-0.2, v1, H * 0.9)[0], P(-0.2, v1, H * 0.9)[1], P(0.05, v1, H * (0.9 - 0.5 * k))[0], P(0.05, v1, H * (0.9 - 0.5 * k))[1], '#1a1014', 1.4);
      if (k > 0.4) g.line(P(0.25, v1, H * 0.2)[0], P(0.25, v1, H * 0.2)[1], P(0.1, v1, H * 0.6)[0], P(0.1, v1, H * 0.6)[1], '#1a1014', 1.2);
    }
  }
  function drawBook(g, obj, t) {
    const used = !!(obj.data && obj.data.used);
    const live = !used && bookUsable(obj);
    if (live) g.glow(0, -8, 30, '#ffe680', 0.28 + 0.16 * Math.sin(t * 5));
    g.ellipse(0, 3, 19, 8, 'rgba(0,0,0,0.28)');
    if (!used) {
      g.box(0, 0, 17, 8.5, 9, { top: '#b0302a', left: '#f2ead6', right: '#e2d7bd' }, true);
      g.diamond(0, -9, 11, 5.5, null, '#e8b84a');
      g.text('PHB', 0, -9, 7, '#ffe9a8', { stroke: '#5a1010', strokeWidth: 2 });
      if (live) g.text('!', 0, -24 - 2 * Math.abs(Math.sin(t * 4)), 13, '#ffe680', { stroke: '#3a2a10', strokeWidth: 3 });
    } else {
      g.poly([P(-0.3, -0.2, 3), P(0, -0.2, 6), P(0, 0.2, 6), P(-0.3, 0.2, 3)], '#f6efdc', true);
      g.poly([P(0, -0.2, 6), P(0.3, -0.2, 3), P(0.3, 0.2, 3), P(0, 0.2, 6)], '#ece2c8', true);
      g.text('✔', 0, -14, 12, '#7be04a', { stroke: '#1a3a10', strokeWidth: 3 });
    }
  }
  function drawSwitch(g, obj, t) {
    const live = !!divertable(findDM());
    if (live) g.glow(0, -18, 30, '#ff5a3c', 0.25 + 0.2 * Math.sin(t * 6));
    g.ellipse(0, 3, 15, 7, 'rgba(0,0,0,0.28)');
    g.box(0, 0, 10, 5, 5, { top: '#6a6f78', left: '#4d525a', right: '#3d4148' }, true);
    const on = !!(obj.data && obj.data.on);
    g.line(0, -5, on ? 9 : -9, -19, '#2a2a30', 3.2);
    g.circle(on ? 9 : -9, -19, 2.6, '#ff5a3c', true);
    g.line(6, -2, 6, -38, '#e8e2d0', 2.6);
    g.line(-2, -42, 14, -30, '#ffffff', 3.4);
    g.line(14, -42, -2, -30, '#ffffff', 3.4);
    g.line(-2, -42, 14, -30, '#c0392b', 1.2);
    g.line(14, -42, -2, -30, '#c0392b', 1.2);
    g.text('RR', 6, -23, 6, '#1a1014', { bold: true });
  }

  DD.registerObject({ id: PANEL, name: 'DM Screen Panel', blocksMove: true, blocksLos: false, hp: N.panelHp, height: 1.1, color: '#7a1f2b', smashable: true,
    desc: 'Destructible (' + N.panelHp + ' HP; adjacent heroes can Smash it for 1 AP, 5 damage). While any panel stands the DM can\'t be hurt and ' +
      'rolls without needing line of sight. Drop all three and the screen falls on him: ' + N.screenDrop + ' damage, Stunned, Exposed.',
    autoplay: function (unit, obj) { return panelValue(obj); },
    onDestroyed: function (o, tile, src) { panelFallen(o, tile, src); },
    draw: drawPanel });

  function drawStack(g, obj, t) {
    const books = [['#2d4f8a', 7], ['#8e2b2b', 6], ['#3b6b3f', 7], ['#6a4a8c', 5]];
    const k = ((obj.data && obj.data.seed) || 0) % 2;
    g.ellipse(0, 3, 20, 9, 'rgba(0,0,0,0.28)');
    let y = 0;
    books.forEach(function (b, i) {
      const off = ((i + k) % 2 ? 1.5 : -1.5);
      g.box(off, y, 17 - i, 8.5 - i * 0.5, b[1], { top: g.shade(b[0], 0.15), left: '#efe6cf', right: g.shade(b[0], -0.2) }, true);
      y -= b[1];
    });
    g.text('D&D', 1, y - 1, 5.5, '#ffe9a8', { stroke: '#2a1a10', strokeWidth: 1.6 });
  }
  DD.registerObject({ id: STACK, name: 'Stack of Sourcebooks', blocksMove: true, blocksLos: false, hp: 0, height: 0.75, color: '#2d4f8a',
    desc: 'Blocks movement but not sight: knee-high, alphabetised, never read. Guarding his side of the table.',
    draw: drawStack });

  DD.registerStatus({ id: 'dm_exposed', name: 'Exposed', icon: '📖', color: '#ffd34d', type: 'debuff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () { return 'Takes 50% more damage: his defences (and notes) are out in the open. Screen down: until Phase 2. Rules-lawyered: for good.'; },
    // [phase 4] declared, not hooked: the engine applies it to all damage like the hook did, and DD.AI.estimate (enemy
    // planning, AutoPlay's quick score) now sees it too. docs/notes/boss-dm.md
    takenMult: 1.5 });
  DD.registerObject({ id: SWITCH, name: 'Track Switch', blocksMove: true, blocksLos: false, hp: 0, height: 1.2, color: '#c0392b',
    desc: 'Interact (1 AP) while a train is due THIS turn (red lane): it is diverted onto the DM\'s own row (' + N.divert + ' damage to him, Vulnerable). ' +
      'Trains run from phase 2 on; it works whenever one is due.',
    available: function (o) { return !!divertable(findDM()); },
    interact: { ap: 1, label: 'Switch Tracks', fn: function (unit, o, tile) { switchTracks(unit, o, tile); } },
    autoplay: function () { return divertable(findDM()) ? 34 : 0; },
    draw: drawSwitch });
  DD.registerObject({ id: BOOK, name: 'Player\'s Handbook', blocksMove: true, blocksLos: false, hp: 0, height: 0.6, color: '#b0302a',
    desc: 'Interact (1 AP): cite the rules. Cite all three while "Rocks Fall, Everyone Dies" counts down to cancel it: the rocks fall on the DM instead (' +
      N.lawyered + ' damage, Stunned, Exposed for the rest of the fight).',
    available: function (o) { return bookUsable(o); },
    interact: { ap: 1, label: 'Cite the Rules', fn: function (unit, o, tile) { citeBook(unit, o, tile); } },
    autoplay: function (unit, o) { return bookUsable(o) ? 40 : 0; },
    draw: drawBook });

  // ---- sprites ------------------------------------------------------------------------------------------------------
  const GREY = { skin: '#a9a7b0', cloth: '#8f8d97', cloth2: '#7d7b85', hair: '#8f8d97', metal: '#b9b7c1', eye: '#55535d', accent: '#c9c7d1', outline: '#2b2a31' };
  function dmOverlay(g, t) {
    // a "DM" hoodie logo (his favourite shirt) and two giant dice orbiting his head
    g.circle(0.5, -15.5, 4.4, '#ffd34d', null);
    g.text('DM', 0.5, -15.3, 4.4, '#3b3550', null);
    for (let k = 0; k < 2; k++) {
      const a = t * 1.6 + k * Math.PI;
      const x = Math.cos(a) * 21, y = -50 + Math.sin(a) * 6;
      const r = 5.2;
      const pts = [];
      for (let i = 0; i < 6; i++) { const q = -Math.PI / 2 + i * Math.PI / 3 + a * 0.5; pts.push([x + Math.cos(q) * r, y + Math.sin(q) * r]); }
      g.poly(pts, k ? '#c0392b' : '#7a3fc0');
      g.text(k ? '1' : '20', x, y + 0.3, 4.2, '#ffe08a', null);
    }
  }
  const DM_SPRITE = {
    base: 'humanoid', scale: 2.0, build: 'huge', outfit: 'coat',
    palette: { skin: '#f1c9a5', cloth: '#3b3550', cloth2: '#ff8a1f', hair: '#5a3a26', metal: '#ffd34d', eye: '#2b2233', accent: '#ff8a1f',
      outline: '#1a1014', hat: '#5b2a86', beard: '#5a3a26', book: '#7a1f2b' },
    head: { size: 1.05, hair: 'wild', beard: 'stubble', hat: 'wizard', face: 'glasses', eyes: 'normal', mouth: 'grin' },
    mainhand: 'book', offhand: 'flask', extras: ['cape'],
    aura: { kind: 'sparkles', color: '#ffd34d' },
    overlay: dmOverlay,
  };
  function blisterPack(g, t) {
    g.rect(-12, -36, 24, 6, '#c9a24f', true, 1.5);
    g.circle(0, -33, 1.6, '#3a2a10', null);
    g.text('NEW!', 0, -26, 4.5, '#ff5a3c', null);
    g.rect(-11, -30, 22, 30, 'rgba(220,240,255,0.16)', 'rgba(220,240,255,0.65)', 5);
    g.line(-7, -26, -7, -6, 'rgba(255,255,255,0.55)', 1.4);
  }

  // ---- enemies ------------------------------------------------------------------------------------------------------
  DD.registerEnemy({ id: 'dm_cameo_goblin', name: 'Unpainted Goblin Mini', act: 3, tier: 'minion', hp: 16, mov: 4, armor: 0,
    tags: ['goblin', 'mini', 'cameo'], skills: ['dm_cameo_stab'], ai: { style: 'melee' }, xp: 2, gold: [1, 3],
    sprite: { base: 'humanoid', mini: true, scale: 0.85, build: 'slim', outfit: 'rags', palette: GREY,
      head: { ears: 'goblin', eyes: 'angry', mouth: 'fangs', blush: false }, mainhand: 'dagger' },
    barks: { spawn: ['I was in the bottom of the box!', 'Paint me like one of your elves.'], attack: ['Generic stab!', 'Stab, stab!'],
      hurt: ['My primer!', 'You chipped me!'], death: ['Back... in the box...', 'Never got painted...'] },
    desc: 'A goblin miniature from session one. The DM has been "about to paint it" for six years.' });
  DD.registerEnemy({ id: 'dm_cameo_skeleton', name: 'Skeleton Mini (Some Assembly Required)', act: 3, tier: 'minion', hp: 14, mov: 3, armor: 0,
    tags: ['undead', 'mini', 'cameo'], skills: ['dm_cameo_bone'], ai: { style: 'ranged', keepDistance: 3 }, xp: 2, gold: [1, 3],
    sprite: { base: 'humanoid', mini: true, scale: 0.85, build: 'slim', outfit: 'none', palette: GREY,
      head: { face: 'skull', eyes: 'glow', blush: false }, mainhand: 'club' },
    barks: { spawn: ['Rattle rattle. Where are my instructions?', 'I am missing a piece.'], attack: ['Femur incoming!', 'Catch!'],
      hurt: ['That was load-bearing!', 'Ow, my spare rib.'], death: ['Pieces everywhere...', 'Choking hazard...'] },
    desc: 'Came in a bag of thirty. Twenty-nine are still in the bag.' });
  DD.registerEnemy({ id: 'dm_cameo_imp', name: 'Imp Mini (Still in Blister Pack)', act: 3, tier: 'minion', hp: 14, mov: 4, armor: 0,
    tags: ['demon', 'mini', 'cameo'], flags: { flying: true }, skills: ['dm_cameo_ember'], ai: { style: 'ranged', keepDistance: 2 }, xp: 2, gold: [1, 3],
    sprite: { base: 'flyer', scale: 0.8, shape: { body: 'imp' }, palette: { skin: '#b9b7c1', eye: '#ff5a3c', accent: '#c9c7d1', outline: '#2b2a31' },
      head: { horns: 'demon', mouth: 'fangs' }, overlay: blisterPack },
    barks: { spawn: ['Mint condition! Do NOT open!', 'I am worth more in the package.'], attack: ['Pew! Through the plastic!', 'Hot!'],
      hurt: ['You creased my card!', 'My resale value!'], death: ['Opened... worthless now...', 'Out of the box, out of time.'] },
    desc: 'A collector\'s edition imp. Opening the package halves its value, which is why it is still fighting inside it.' });

  DD.registerEnemy({ id: DM_ID, name: 'The Dungeon Master', act: 3, tier: 'boss', hp: N.hp, mov: 0, armor: 0,
    tags: ['boss', 'human', 'dm'], flags: { large: true, immovable: true }, resist: { poison: 0.5 },
    sprite: DM_SPRITE,
    skills: ['dm_fudged_roll', 'dm_secret_roll', 'dm_rocks_fall', 'dm_railroad', 'dm_plot_hook', 'dm_get_off', 'dm_tpk'],
    ai: dmPlan, xp: 60, gold: [90, 110], hooks: HOOKS,
    barks: {
      spawn: ['So. You actually made it. Give me five minutes, I need to prep.', 'Welcome to the final session. No, you can\'t level up first.',
        'Roll for initiative. Actually, don\'t. I already did.'],
      attack: ['That\'s a hit. Don\'t ask what I rolled.', 'I\'ll allow it. For me.', 'Natural 20. Trust me.', 'Make a saving throw. Kidding. It hits.'],
      hurt: ['Okay, ow. Who allowed flanking?', 'That\'s... technically legal.', 'I\'m writing that down.', 'You\'re supposed to lose here!'],
      death: ['Fine. FINE. You win. Same time next week?', 'Fine. FINE. You win. Same time next week? *sniff*'],
      phase2: ['You WILL go where the story goes.', 'All aboard the plot!', 'No side quests. The train leaves NOW.'],
      phase3: ['Rocks fall.', 'Rocks fall. Everyone dies. I prepped this.', 'I didn\'t want to do this. Yes I did.'],
      screen: ['My notes! Don\'t read my notes!', 'Okay, that\'s a spoiler. Unsee it.', 'Who touched my screen?!'],
      rule: ['House rule!', 'New house rule. Effective immediately.', 'Page one of my binder says...', 'I\'m the DM. It\'s a rule now.'],
      cameo: ['Random encounter! What? It was on the table.', 'Remember this guy? From session one?', 'I had extra minis.'],
      diverted: ['Wait, who drew a switch on my map?!', 'That is MY railroad!'],
      objection: ['That\'s not what that rule means.', 'Stop reading the book!'],
      lawyered: ['...okay, page 143 does say that.', 'WHO BROUGHT THE HANDBOOKS?'],
      stunned: ['I need a snack break.', 'Hold on, I lost my page.'],
    },
    desc: 'The final boss. Has run this campaign for eleven years and three editions. Fudges every roll, owns every sourcebook ' +
      'and is secretly very proud of you. Invulnerable behind his screen; plot armor between phases.',
    boss: { title: 'Master of the Table', intro: '"So. You actually made it." The Dungeon Master peers over his screen. "Give me a second. I need to prep."', music: null } });

  // ---- the arena: the DM's actual table -------------------------------------------------------------------------------
  //  R cameo spawns · S sourcebook stacks · D/G his dice · B the DM · W screen panels · Y track switches · 1-2 train lanes
  //  K book spots (phase 3) · c soda can · p pencil · d d20 · o Cheeto dust · H deploy
  //  (the cameo marks sit on the flanks of his end of the table: the back row is hidden under the HUD's objective bar
  //  and combat log on the default camera)
  const LAYOUT = [
    '..............',
    '...c.SSSSS.c..',
    'R....SDoGS..R.',
    'RR...S.B.S..RR',
    '...Y.SWWWS.Y..',
    '11111111111111',
    '..c.K.p.p.K.c.',
    '...d.K...K.d..',
    '22222222222222',
    '..K..HHHHH..K.',
    '....HHHHHHH...',
  ];
  const HEIGHTS = [
    '22222222222222',
    '11111111111111',
    '11111111111111',
    '11111111111111',
    '11111111111111',
    '00000000000000',
    '00000000000000',
    '00000000000000',
    '00000000000000',
    '00000000000000',
    '00000000000000',
  ];
  DD.registerEncounter({ id: 'boss_dm', act: 3, kind: 'boss', name: 'Behind the DM Screen', weight: 1, minDepth: 0,
    intro: 'The final session. The table is sticky, the dice are judging you, and the Dungeon Master has the high ground: a chair.',
    map: { theme: 'dm_table', layout: LAYOUT, heights: HEIGHTS, legend: {
      'S': { terrain: 'paper', obj: { id: STACK } },
      'B': { terrain: 'paper', zone: 'enemy', tag: 'boss_spawn' },
      'W': { terrain: 'paper', obj: { id: PANEL } },
      'D': { terrain: 'paper', obj: { id: 'd20', label: 'The DM\'s House Rules d20' }, mark: 'die_rule' },
      'G': { terrain: 'paper', obj: { id: 'd20', label: 'The DM\'s Fudging d20' }, mark: 'die_fudge' },
      'Y': { obj: { id: SWITCH } },
      'c': { obj: 'soda_can' },
      'p': { obj: 'pencil' },
      'd': { obj: 'd20' },
      '1': { terrain: TRACK, mark: 'lane1' },
      '2': { terrain: TRACK, mark: 'lane2' },
      'K': { mark: 'book' },
      'R': { mark: 'cameo' },
      'o': { surface: 'cheeto' },
    } },
    enemies: [{ id: DM_ID, n: 1 }],
    onStart: function () { DD.Act.narrate('dm_start', {}); },
    objective: { type: 'boss', flavor: 'Smash the DM Screen first: he can\'t be hurt behind it.' },
    reward: { goldMult: 1.5, itemRarity: 'legendary' } });

  // ---- narration (the narrator IS the DM) --------------------------------------------------------------------------
  // boss_start is shared by every boss fight: only a generic line here; the finale's own hint is dm_start
  DD.registerNarration('boss_start', [
    'The DM dims the lights and puts on the boss music. From his phone. On speaker.',
  ]);
  DD.registerNarration('dm_start', [
    'DM: "I have waited all campaign for this. Nothing gets past my screen. Unless somebody knocks it over. Which nobody will."',
    'DM: "That screen is three panels of cardboard and it is load-bearing. Emotionally. Please do not smash it."',
  ]);
  DD.registerNarration('dm_phase2', [
    'The DM stands up. "You are going where the plot goes. On rails."',
    'Train tracks appear on the battle map, drawn in pencil, with menace.',
  ]);
  DD.registerNarration('dm_phase3', [
    'The DM closes his binder. "Rocks fall." A long pause. "Everyone dies. In three rounds."',
    'The DM is out of plot. He reaches for the rocks. Somebody find a rulebook. NOW.',
  ]);
  DD.registerNarration('dm_screen', [
    'The screen collapses. His notes read: "if they win, pretend this was the plan."',
    'Screen down! Behind it: four energy drinks, a cold pizza and a d20 that only rolls 20s.',
  ]);
  DD.registerNarration('dm_rule', [
    'The DM rolls on his House Rules table. A {n}: {name}.',
    '"New house rule," announces the DM. {name}. Nobody agreed to this.',
    'The DM flips to a sticky note in his binder: {name}.',
  ]);
  DD.registerNarration('dm_cameo', [
    'Random encounter! The DM rummages in his mini box and slams {name} onto the table.',
    'The DM pulls out an old mini from session one. It still has bite marks.',
  ]);
  DD.registerNarration('dm_switch', [
    '{hero} flips the track switch. The DM watches his own railroad turn on him.',
    '{hero} redirects the plot. Literally.',
  ]);
  DD.registerNarration('dm_objection', [
    '{hero} cites page 143. The DM checks. It\'s real. He hates it.',
    'OBJECTION SUSTAINED. The rocks reconsider their life choices and fall on the DM.',
  ]);
  DD.registerNarration('dm_defeat', [
    'The DM sighs, shuffles his notes and smiles. Secretly, he is so proud of you.',
    'The DM slumps behind the wreckage of his screen. Somewhere, a d20 rolls a natural 20.',
  ]);

  // test / debug hooks (no game logic depends on them)
  DD.BossDM = { N: N, HOUSE_RULES: HOUSE_RULES, LAYOUT: LAYOUT, findDM: findDM, boss: boss, lanes: lanes, divertable: divertable,
    panelsLeft: panelsLeft, rollHouseRule: rollHouseRule, randomEncounter: randomEncounter, cameoPool: cameoPool, unpainted: unpainted,
    syncPhase: syncPhase, syncShield: syncShield, floorHp: floorHp, threshold: threshold };
})();
