/* Dungeons and Degenerates — tests/content/hero_ellaria.js
 * Suites 'hero_ellaria: …' for js/data/heroes/ellaria.js (v2: initiative turns, no telegraphs, no Guard, no starting
 * Block, durations per own turn, attacks of opportunity): the hero def and its simplicity rules, passive Pack Leader,
 * Thorn Whip / Chomp, every pool skill at every level (desc == effect vs armor-free fixture foes: damage, heals,
 * statuses and their exact own-turn durations, displacement into pits / lava / water / brambles / map edges, summons,
 * costs, cooldowns, charges), the combos with other heroes' elements, the corgi summon, attacks of opportunity (corgis
 * and the Absolute Unit hold the line, her swaps / dashes / pulls / pushes never provoke), the signature, the hero
 * items, v2 edge cases, previews and AutoPlay battles at levels 1 / 3 / 5.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const POOL = ['ell_summon_corgi', 'ell_spring', 'ell_roots', 'ell_barkskin', 'ell_good_boy', 'ell_fetch', 'ell_zoomies',
    'ell_switcheroo', 'ell_wildshape'];
  const IDS = ['ell_thorn_whip', 'ell_chomp'].concat(POOL, ['ell_release', 'ell_corgi_bite', 'ell_corgi_bark']);
  const ITEMS = ['ell_good_stick', 'ell_shedding_robe', 'ell_flower_crown'];

  // ---- helpers ------------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  /** Hero-skill sandbox: AI units always pass; heroes first, so it is the first listed hero's turn in round 1. */
  function quiet(cfg) {
    return DD.Combat.sandbox(Object.assign({ w: 9, h: 9, seed: 7, enemyAi: false, objective: { type: 'custom', text: 'Testing' },
      encounter: { id: 'ell_test', checkObjective: function () { return null; } } }, cfg || {}));
  }
  /** The same, but the enemies take real turns. */
  function live(cfg) { return quiet(Object.assign({ enemyAi: true }, cfg || {})); }
  function E(x, y, id) { return { id: id || 'test_grunt', x: x, y: y }; }
  function ell(i) { return DD.Combat.heroes().filter(function (u) { return u.defId === 'ellaria'; })[i || 0]; }
  function heroOf(id) { return DD.Combat.heroes().filter(function (u) { return u.defId === id; })[0]; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function surf(x, y) { const s = tile(x, y).surface; return s ? s.id : null; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  function dist(a, b) { return DD.Grid.dist(a, b); }
  function corgis(owner) { return DD.Ellaria.corgisOf(owner || ell()); }
  /** Remove every corgi silently (no death hooks) so a test can place its own. */
  function clearCorgis() {
    DD.Combat.state.units.forEach(function (u) { if (u.defId === 'ell_corgi' && !u.dead) { u.dead = true; u.hp = 0; } });
  }
  function addCorgi(owner, x, y) {
    return DD.Act.summon(owner, 'ell_corgi', x, y, { ready: true, noFx: true, silent: true, hpMult: DD.Ellaria.corgiHp(owner) / 9 });
  }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (s) { return s.id === id; })[0]; }
  function giveSlot(u, id, level) {
    let s = slotOf(u, id);
    if (!s) { s = DD.Act.makeSlot(id, level || 1); u.skills.push(s); }
    if (level) s.level = level;
    return s;
  }
  function use(u, id, x, y, level) {
    const s = id === 'basic' ? u.basic : id === 'signature' ? u.signature : giveSlot(u, id, level);
    return DD.Combat.useSkill(u, s, x, y);
  }
  function wall(list) { return function (tl) { list.forEach(function (p) { if (tl.x === p[0] && tl.y === p[1]) tl.t = p[2] || 'wall'; }); }; }
  function hypeNow() { return DD.Combat.state.hype; }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }
  /** HP deltas that the preview of a skill predicts vs what really happens; returns mismatch strings. */
  function previewVsReal(u, slot, x, y) {
    const s = DD.Combat.state;
    const prev = DD.Combat.preview(u, slot, x, y);
    const before = {};
    s.units.forEach(function (o) { if (!o.dead) before[o.id] = { hp: o.hp, down: !!o.downed }; });
    const born = s.units.length;
    const hype0 = s.hype;
    const ok = DD.Combat.useSkill(u, slot, x, y);
    const out = ok ? [] : ['skill not used'];
    if (prev.uncertain) out.push('preview uncertain (no dice in this kit)');
    s.units.forEach(function (o) {
      const b = before[o.id];
      if (!b) return;
      const e = prev.perUnit[o.id];
      const real = b.hp - o.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
      if (real !== said) out.push(o.name + ' ' + real + ' vs preview ' + said);
      const down = !!o.dead || (!!o.downed && !b.down);
      if (down !== !!(e && e.lethal)) out.push(o.name + ' lethal mismatch');
    });
    const spawned = s.units.slice(born).filter(function (o) { return !o.dead; }).length;
    if (spawned !== (prev.spawned || []).length) out.push(spawned + ' summoned vs preview ' + (prev.spawned || []).length);
    if (s.hype - hype0 !== prev.hype) out.push('Hype ' + (s.hype - hype0) + ' vs preview ' + prev.hype);
    return out;
  }

  // ---- definition ------------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: hero definition, simplicity and texts', function (t) {
    const h = DD.getHero('ellaria');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    ['name', 'epithet', 'race', 'cls', 'role', 'blurb', 'color'].forEach(function (k) { t.ok(typeof h[k] === 'string' && h[k].length > 0, 'field ' + k); });
    t.eq(h.unlock, null, 'available from the start (unlock: null)');
    t.eq(h.stats.init, 1, 'initiative modifier +1');
    t.ok(h.complexity >= 1 && h.complexity <= 3, 'complexity 1-3');
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov >= 3 && h.stats.mov <= 5, 'stats in DESIGN ranges');
    t.ok(!h.stats.block, 'no starting Block stat');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth +3-5 HP');
    t.eq(h.basic, 'ell_thorn_whip', 'basic');
    t.eq(h.signature, 'ell_release', 'signature');
    t.eq(h.startingSkills.join(','), 'ell_summon_corgi,ell_spring', 'exactly 2 starting skills: Summon Corgi + Healing Spring');
    t.eq(h.skillPool.join(','), POOL.join(','), 'pool of 9 (DESIGN v2: 8-10)');
    t.eq(h.summons.join(','), 'ell_corgi', 'summons listed');
    t.ok(h.passive && h.passive.name === 'Pack Leader' && typeof h.passive.hooks.onCombatStart === 'function', 'passive with hooks');
    t.ok(!h.passive.hooks.modifyGuard, 'no Guard hook');
    ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'].forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ' has 4-6 lines (' + lines.length + ')');
      lines.forEach(function (l) { t.ok(l.length <= 70, 'bark ≤ 70 chars: ' + l); });
    });
    const allBarks = Object.keys(h.barks).map(function (k) { return h.barks[k].join(' '); }).join(' ');
    const others = ['Zarathor', 'Syllamin', 'Marbles', 'Marwyn', 'Josiah', 'Slate', 'Mayor', 'Betty', 'Basanos', 'Valdris', 'Hjalmar', 'Pebbles'];
    t.ok(others.filter(function (n) { return allBarks.indexOf(n) >= 0; }).length >= 8, 'barks reference other heroes, the new ones too');
    // pronouns as the user confirmed them (MEMORY): Sparrow and Kiri are she; every other hero is he
    Object.keys(h.barks).forEach(function (k) {
      h.barks[k].forEach(function (l) {
        if (/Sparrow|Kiri/.test(l)) t.ok(!/\b(he|him|his)\b/i.test(l), 'pronouns (she): ' + l);
        if (/Zarathor|Syllamin|Marbles|Marwyn|Josiah|Corelos|Slate|Buga|Mayor|Betty|Basanos|Valdris|Hjalmar|Pebbles/.test(l)) {
          t.ok(!/\b(she|her|hers)\b/i.test(l), 'pronouns (he): ' + l);
        }
      });
    });
    // every registered def resolves at every level, with and without a user; numbers shown; one breath long
    const texts = [h.blurb, h.role, h.passive.desc, allBarks];
    const breath = [];
    IDS.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s, 'skill ' + id + ' registered');
      if (!s) return;
      t.ok(typeof s.icon === 'string' && s.icon.length >= 1 && s.icon.length <= 4, id + ': one emoji icon');
      t.ok(s.flavor && s.flavor.length <= 120, id + ': flavor ≤ 120');
      texts.push(s.flavor);
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d0 = DD.skillDesc(s, lv, null);
        texts.push(d0);
        t.ok(d0 && !/undefined|NaN|\[object/.test(d0), id + ' L' + lv + ' desc (no user): ' + d0);
        t.ok(words(d0) <= 21, id + ' L' + lv + ' desc reads in one breath (' + words(d0) + ' words)');
        if (lv === 1 || lv === s.levels.length) breath.push(words(d0) + ' · ' + id + ' L' + lv + ': ' + d0);
        const L = DD.skillLevel(s, lv);
        if (L.dmg) t.ok(new RegExp('(^|[^0-9])' + L.dmg + '([^0-9]|$)').test(d0), id + ' L' + lv + ' desc shows dmg ' + L.dmg);
        if (L.heal) t.ok(new RegExp('(^|[^0-9])' + L.heal + '([^0-9]|$)').test(d0), id + ' L' + lv + ' desc shows heal ' + L.heal);
      }
    });
    t.ok(words(h.passive.desc) <= 20, 'passive reads in one breath (' + words(h.passive.desc) + ' words)');
    breath.push(words(h.passive.desc) + ' · passive: ' + h.passive.desc);
    breath.forEach(function (l) { t.log(l); });
    POOL.forEach(function (id) { t.eq(DD.getSkill(id).levels.length, 3, id + ': 3 levels'); });
    const aps = POOL.map(function (id) { return DD.getSkill(id).ap; });
    t.ok(aps.indexOf(1) >= 0 && aps.indexOf(2) >= 0, 'mix of 1 and 2 AP skills');
    t.eq(DD.getSkill('ell_wildshape').charges, 1, 'Wild Shape is the big once-per-fight skill');
    t.eq(DD.getSkill('ell_release').hype, 100, 'signature costs 100 Hype');
    const basic = DD.getSkill('ell_thorn_whip');
    t.ok(basic.ap === 1 && basic.levels[0].dmg >= 4 && basic.levels[0].dmg <= 6, 'basic: 1 AP, 4-6 damage');
    t.ok(!!DD.getStatus('ell_absolute_unit') && !!DD.getSurface('ell_bramble') && !!DD.getSummon('ell_corgi'), 'status, surface and summon registered');
    texts.push(DD.getStatus('ell_absolute_unit').desc({ turns: 1 }), DD.getSurface('ell_bramble').desc, DD.getSummon('ell_corgi').desc);
    const items = ITEMS.map(DD.getItem);
    t.ok(items.every(function (it) { return it && it.hero === 'ellaria'; }), '3 hero items restricted to Ellaria');
    t.ok(items.some(function (it) { return it.rarity === 'rare'; }) && items.some(function (it) { return it.rarity === 'legendary'; }), 'a rare and a legendary item');
    items.forEach(function (it) {
      texts.push(it.desc, it.flavor);
      t.ok(!(it.stats && it.stats.block) && !(it.hooks && it.hooks.onCombatStart), it.id + ': no starting shield');
    });
    // v2: nothing promises removed mechanics
    texts.forEach(function (x) { t.ok(!/telegraph|guard|intent/i.test(String(x)), 'no telegraph / Guard wording: ' + String(x).slice(0, 60)); });
    t.ok(DD.Sprites && DD.Sprites.portrait('ellaria', 64), 'portrait renders');
    const m = DD.Sprites.metrics('ellaria');
    t.ok(m.height >= 34 && m.height <= 48, 'Ellaria ~40 px tall (' + m.height.toFixed(1) + ')');
  });

  // ---- passive ---------------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: passive Pack Leader (starting corgi, AVENGE BISCUIT)', function (t) {
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, level: 5 }], enemies: [E(7, 4)] });
    let e = ell();
    const c = corgis()[0];
    t.eq(corgis().length, 1, 'starts with one corgi');
    t.ok(c && dist(c, e) <= 2, 'corgi within 2 tiles');
    t.ok(c && c.x > e.x, 'corgi stands on the foe-facing side');
    t.eq(c.maxHp, 13, 'corgi HP = 8 + Ellaria level 5');
    t.eq(c.ownerId, e.id, 'owned by Ellaria');
    t.ok(c.name !== 'Corgi' && c.title === 'Corgi', 'corgi gets a name (' + c.name + ')');
    t.ok(DD.Combat.current() === e && c.ap === 2, 'her turn: the corgi acts on it with 2 AP');
    t.ok(e.block === 0 && c.block === 0, 'no starting shield (0 Block)');
    // names stay unique among living corgis even when other content summons one with a taken name
    const twin = DD.Act.summon(e, 'ell_corgi', 1, 6, { name: c.name, noFx: true, silent: true });
    t.ok(twin && twin.name !== c.name && twin.name.length > 0, 'a second "' + c.name + '" is renamed (' + (twin && twin.name) + ')');
    // deployment: the corgi starts inside the zone, can be redeployed and has no AP before her turn
    DD.Combat.sandbox({ w: 9, h: 9, seed: 3, deploy: true, deployTiles: [{ x: 1, y: 3 }, { x: 1, y: 4 }, { x: 1, y: 5 }, { x: 0, y: 4 }],
      heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(7, 4)], enemyAi: false });
    const dc = corgis()[0];
    t.ok(DD.Combat.state.deploy.active && dc && DD.Combat.state.deploy.tiles.some(function (p) { return p.x === dc.x && p.y === dc.y; }), 'starting corgi inside the deploy zone');
    t.eq(dc.ap, 0, 'no AP before initiative (it acts on her turn)');
    const free = DD.Combat.state.deploy.tiles.filter(function (p) { return !at(p.x, p.y); })[0];
    t.ok(free && DD.Combat.deployMove(dc, free.x, free.y), 'the corgi can be redeployed');
    // a corgi falls on her turn: the party is Inspired until the end of each one's next turn; no Hype rider any more
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }, { id: 'test_knight', x: 2, y: 6 }], enemies: [E(7, 7)], terrain: wall([[6, 7], [7, 6], [6, 6]]) });
    e = ell();
    const k = heroOf('test_knight');
    const c2 = addCorgi(e, 3, 3);
    const h0 = hypeNow();
    A().kill(corgis()[0], null);
    t.eq(hypeNow(), h0, 'no Hype for a fallen corgi (v2: one rule)');
    t.ok(has(e, 'inspired') && has(k, 'inspired') && has(c2, 'inspired'), 'Ellaria, allies and corgis are Inspired');
    t.ok(st(k, 'inspired').turns === 1 && st(e, 'inspired').turns === 1, 'turns: 1 (their next turn)');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === k && has(k, 'inspired') && has(e, 'inspired'), 'the knight\'s turn: he is Inspired, so is Ellaria (it began on her own turn)');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === e && !has(k, 'inspired'), 'round 2: the knight\'s Inspired ended with his turn');
    t.ok(has(e, 'inspired') && has(c2, 'inspired'), 'round 2: Ellaria and her corgi are still Inspired on her next turn');
    DD.Combat.endTurn();
    t.ok(!has(e, 'inspired') && !has(c2, 'inspired'), 'gone after the end of her next turn');
    // a corgi falls on an enemy turn: Inspired covers her next turn exactly
    live({ heroes: [{ id: 'ellaria', x: 1, y: 1 }, { id: 'test_knight', x: 1, y: 7 }], enemies: [E(5, 4)] });
    e = ell(); clearCorgis();
    const c3 = addCorgi(e, 4, 4);
    c3.hp = 1;
    t.ok(DD.Combat.useSkill(c3, slotOf(c3, 'ell_corgi_bark'), c3.x, c3.y), 'the corgi barks at the grunt');
    DD.Combat.endTurn();
    DD.Combat.endTurn();
    t.ok(c3.dead, 'the taunted grunt killed the corgi on its turn');
    t.ok(DD.Combat.current() === e && has(e, 'inspired') && st(e, 'inspired').turns === 1, 'round 2: Ellaria is Inspired for this turn');
    t.ok(has(heroOf('test_knight'), 'inspired'), 'the knight too');
    DD.Combat.endTurn();
    t.ok(!has(e, 'inspired'), 'gone at the end of her turn');
    // someone else's summon: no rally; a corgi other content gives another hero: no rally (Pack Leader is Ellaria's)
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }, { id: 'test_knight', x: 2, y: 6 }, { id: 'test_summoner', x: 1, y: 7 }], enemies: [E(7, 7)] });
    e = ell();
    const kn = heroOf('test_knight');
    const hound = DD.Combat.party().filter(function (u) { return u.defId === 'test_hound'; })[0];
    A().kill(hound, null);
    t.ok(!has(kn, 'inspired'), 'another summoner\'s hound does not count');
    const stray = DD.Act.summon(kn, 'ell_corgi', 4, 6, { noFx: true, silent: true });
    t.ok(stray && stray.ownerId === kn.id, 'a corgi owned by the knight');
    A().kill(stray, null);
    t.ok(!has(kn, 'inspired') && !has(e, 'inspired'), 'the knight\'s corgi does not trigger Pack Leader');
    // one rule, no hidden clause: a corgi that falls while Ellaria is downed still rallies the party
    A().kill(e, null);
    t.ok(e.downed, 'Ellaria downed');
    const lastCorgi = corgis(e)[0];
    t.ok(!!lastCorgi, 'her corgi fights on while she is down');
    A().kill(lastCorgi, null);
    t.ok(has(kn, 'inspired') && st(kn, 'inspired').turns === 1, 'AVENGE BISCUIT even while she is down: the knight is Inspired');
    t.ok(!has(e, 'inspired'), 'the downed Ellaria herself gets nothing');
  });

  // ---- basic attacks -------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: Thorn Whip and Chomp', function (t) {
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(4, 4), E(5, 2), E(8, 8)] });
    clearCorgis();
    const e = ell();
    const g = at(4, 4);
    t.ok(!DD.Targeting.isValidTarget(e, e.basic, 5, 2), 'range 3 (a foe 5 away is not a target)');
    t.ok(use(e, 'basic', 4, 4), 'Thorn Whip used');
    t.eq(g.hp, 10, '4 damage');
    t.eq(g.x, 3, 'pulled 1 tile toward Ellaria');
    t.eq(e.ap, 2, 'costs 1 AP');
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(3, 4), E(8, 8)], terrain: wall([[2, 4]]) });
    t.ok(!DD.Targeting.isValidTarget(ell(), ell().basic, 3, 4), 'needs line of sight');
    // an adjacent foe has nowhere to be pulled: 4 damage, no bump
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(2, 4), E(8, 8)] });
    clearCorgis();
    const adj = at(2, 4);
    t.ok(use(ell(), 'basic', 2, 4) && adj.hp === 10 && adj.x === 2, 'adjacent foe: 4 damage, stays put, no bump');
    // pulled across a pit: YEET
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(4, 4), E(8, 8)], terrain: wall([[3, 4, 'pit']]) });
    clearCorgis();
    const h0 = hypeNow();
    t.ok(use(ell(), 'basic', 4, 4), 'whip over the pit');
    t.ok(at(3, 4) === null && DD.Combat.state.stats.envKills === 1, 'pulled into the pit and yeeted');
    t.eq(hypeNow() - h0, 20, '+20 Hype for the environmental kill');
    // the target dies to the damage: no pull, no error
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(4, 4), E(8, 8)] });
    clearCorgis();
    at(4, 4).hp = 3;
    const v = at(4, 4);
    t.ok(use(ell(), 'basic', 4, 4) && v.dead, 'killed mid-skill without errors');
    // Chomp (Absolute Unit basic) per level
    [7, 9, 10].forEach(function (dmg, i) {
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(2, 4), E(8, 8)] });
      clearCorgis();
      const f = at(2, 4);
      t.ok(use(ell(), 'ell_chomp', 2, 4, i + 1), 'Chomp L' + (i + 1));
      t.eq(f.hp, 14 - dmg, 'Chomp L' + (i + 1) + ': ' + dmg + ' damage');
      t.eq(f.x, 3, 'Chomp L' + (i + 1) + ': knockback 1');
    });
    // knocked into a wall / off the map edge: bump 3; into lava: 8 fire + Burn
    quiet({ heroes: [{ id: 'ellaria', x: 7, y: 4 }], enemies: [E(8, 4), E(1, 1)] });
    clearCorgis();
    const ed = at(8, 4);
    t.ok(use(ell(), 'ell_chomp', 8, 4, 1) && ed.x === 8 && ed.hp === 14 - 7 - 3, 'Chomp at the map edge: 7 + bump 3');
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 2, y: 4, hpMult: 2 }, E(8, 8)], terrain: wall([[3, 4, 'lava']]) });
    clearCorgis();
    const lv = at(2, 4);
    t.ok(use(ell(), 'ell_chomp', 2, 4, 1) && lv.x === 3 && lv.hp === 28 - 7 - 8 && has(lv, 'burn'), 'Chomp into lava: 7 + 8 fire + Burn');
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(2, 4), E(8, 8)], terrain: wall([[3, 4, 'lava']]) });
    clearCorgis();
    const lk = at(2, 4), h1 = hypeNow();
    t.ok(use(ell(), 'ell_chomp', 2, 4, 1) && lk.dead && DD.Combat.state.stats.envKills === 1 && hypeNow() - h1 === 20, 'Chomped into lava for the kill: an environmental kill (+20 Hype)');
  });

  // ---- Summon Corgi ---------------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: Summon Corgi (levels, pack limit, cooldown, the corgi)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, level: 4, skills: [{ id: 'ell_summon_corgi', level: lv }] }], enemies: [E(8, 8)] });
      clearCorgis();
      const e = ell();
      const s = slotOf(e, 'ell_summon_corgi');
      t.ok(!DD.Targeting.isValidTarget(e, s, 4, 4), 'L' + lv + ': range 2');
      t.ok(DD.Combat.useSkill(e, s, 2, 5), 'L' + lv + ': summoned');
      const c = at(2, 5);
      t.ok(c && c.defId === 'ell_corgi' && c.ownerId === e.id, 'L' + lv + ': a corgi on the tile');
      t.eq(c.maxHp, 12, 'L' + lv + ': HP 8 + level 4');
      t.eq(slotOf(c, 'ell_corgi_bite').id + ':' + DD.skillLevel(DD.getSkill('ell_corgi_bite'), 1).dmg, 'ell_corgi_bite:3', 'L' + lv + ': Bite 3');
      t.ok(!!slotOf(c, 'ell_corgi_bark'), 'L' + lv + ': can Bark');
      t.eq(c.ap, lv === 3 ? 2 : 0, 'L' + lv + ': ' + (lv === 3 ? 'acts right away' : 'arrives with 0 AP'));
      t.eq(s.cd, [3, 2, 2][lv - 1], 'L' + lv + ': cooldown');
      t.eq(e.ap, 1, 'L' + lv + ': 2 AP');
      t.ok(DD.skillDesc(DD.getSkill('ell_summon_corgi'), lv, e).indexOf('12 HP') >= 0, 'L' + lv + ': desc shows the real HP for this Ellaria');
      DD.Combat.endTurn();
      t.eq(c.ap, 2, 'L' + lv + ': 2 AP on her next turn');
    });
    // review: never onto lava, fire, poison or spikes (the summon preview can't show the burn; a sacrificed corgi would
    // also be a 2-AP party Inspire); brambles (her side walks through) and shallow water are fine
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_summon_corgi'] }], enemies: [E(8, 8)], terrain: wall([[2, 4, 'lava'], [1, 5, 'water']]),
      surfaces: [{ x: 1, y: 3, id: 'fire', turns: 3 }, { x: 0, y: 4, id: 'poison', turns: 3 }, { x: 3, y: 4, id: 'ell_bramble', turns: 3 }],
      objects: [{ x: 1, y: 6, id: 'spikes' }] });
    clearCorgis();
    const hs = slotOf(ell(), 'ell_summon_corgi');
    const okAt = function (x, y) { return DD.Targeting.isValidTarget(ell(), hs, x, y); };
    t.ok(!okAt(2, 4) && !okAt(1, 3) && !okAt(0, 4) && !okAt(1, 6), 'no corgi onto lava, fire, poison or spikes');
    t.ok(okAt(3, 4) && okAt(1, 5), 'brambles and shallow water are fine');
    t.ok(DD.Combat.useSkill(ell(), hs, 3, 4) && at(3, 4) && at(3, 4).defId === 'ell_corgi', 'summoned into the brambles');
    // pack limit 3
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_summon_corgi'] }], enemies: [E(8, 8)] });
    const e = ell();
    addCorgi(e, 1, 6); addCorgi(e, 0, 6);
    t.eq(corgis().length, 3, 'three corgis');
    t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_summon_corgi')), 'The pack is full (3 corgis).', 'pack limit');
    // cooldown 3 (L1): used in round 1, usable again in round 5; cooldown 2 (L2): round 4
    [[1, '[false,false,false,true]'], [2, '[false,false,true]']].forEach(function (cs) {
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: [{ id: 'ell_summon_corgi', level: cs[0] }] }], enemies: [E(8, 8)] });
      clearCorgis();
      const e2 = ell(), s2 = slotOf(e2, 'ell_summon_corgi');
      t.ok(DD.Combat.useSkill(e2, s2, 2, 1), 'L' + cs[0] + ': summoned in round 1');
      const ready = [];
      for (let r = 2; r <= (cs[0] === 1 ? 5 : 4); r++) { DD.Combat.endTurn(); ready.push(DD.Combat.canUse(e2, s2) === true); }
      t.eq(JSON.stringify(ready), cs[1], 'L' + cs[0] + ': usable again in round ' + (cs[0] === 1 ? 5 : 4));
    });
  });

  // ---- Healing Spring -----------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: Healing Spring (heal, puddles, lava, fire; lightning and frost combos)', function (t) {
    [5, 6, 8].forEach(function (heal, i) {
      const lv = i + 1;
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: [{ id: 'ell_spring', level: lv }] }, { id: 'test_knight', x: 3, y: 4 }],
        enemies: [E(4, 4), E(8, 8)], terrain: wall([[3, 5, 'lava']]), surfaces: [{ x: 3, y: 3, id: 'fire', turns: 3 }] });
      clearCorgis();
      const e = ell(), k = heroOf('test_knight'), g = at(4, 4);
      k.hp = 10;
      t.ok(use(e, 'ell_spring', 3, 4), 'L' + lv + ': used');
      t.eq(k.hp, 10 + heal, 'L' + lv + ': ally heals ' + heal);
      t.ok(!has(k, 'wet') && !surf(3, 4), 'L' + lv + ': no puddle under the ally (not soaked)');
      t.ok(has(g, 'wet') && surf(4, 4) === 'water', 'L' + lv + ': puddle under the foe, which is Wet');
      t.eq(surf(2, 4), 'water', 'L' + lv + ': puddle on an empty tile');
      t.ok(!surf(3, 3), 'L' + lv + ': the water puts the fire out');
      t.eq(tile(3, 5).t, 'obsidian', 'L' + lv + ': lava cooled to obsidian');
      t.eq(g.hp, 14, 'L' + lv + ': no damage to foes');
      t.ok(e.ap === 1 && slotOf(e, 'ell_spring').cd === 2, 'L' + lv + ': 2 AP, cooldown 2');
    });
    // combo: lightning electrifies the puddles (Wet foe: 4 × 1.5, Stunned: it loses its next turn); the ally beside is spared
    live({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_spring'] }, { id: 'test_knight', x: 3, y: 4 }], enemies: [E(4, 4)] });
    clearCorgis();
    t.ok(use(ell(), 'ell_spring', 4, 4), 'spring on a foe next to the knight');
    const g = at(4, 4), k = heroOf('test_knight');
    const khp = k.hp;
    A().applyElement(4, 5, 'lightning', ell());
    t.ok(has(g, 'stun') && g.hp === 14 - Math.round(4 * 1.5), 'lightning shocks the pool: the Wet foe takes 6 and is Stunned');
    t.eq(k.hp, khp, 'the knight (no puddle under him) is not shocked');
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.ok(g.x === 4 && g.y === 4 && k.hp === khp && !has(g, 'stun'), 'the stunned grunt lost its turn (no move, no stab), then the stun ended');
    // combo: frost freezes a soaked foe and turns its puddle to ice
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_spring'] }, { id: 'test_mage', x: 1, y: 6 }], enemies: [E(4, 4)] });
    clearCorgis();
    t.ok(use(ell(), 'ell_spring', 4, 4), 'spring on a foe');
    A().applyElement(4, 4, 'frost', heroOf('test_mage'));
    t.ok(has(at(4, 4), 'frozen') && surf(4, 4) === 'ice', 'frost: the Wet foe is Frozen, the puddle is ice');
    // "yourself and allies": she heals too when she stands in it (range 0: on herself), and no puddle under her
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_spring'] }], enemies: [E(8, 8)] });
    clearCorgis();
    ell().hp = 10;
    t.ok(use(ell(), 'ell_spring', 1, 4) && ell().hp === 15 && !surf(1, 4) && !has(ell(), 'wet'), 'on herself: heals 5, stays dry');
    // heal bonus (Flower Crown +15%)
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_spring'], items: ['ell_flower_crown'] }, { id: 'test_knight', x: 2, y: 4 }], enemies: [E(8, 8)] });
    clearCorgis();
    heroOf('test_knight').hp = 10;
    t.ok(use(ell(), 'ell_spring', 2, 4), 'spring with the crown');
    t.eq(heroOf('test_knight').hp, 16, '5 × 1.15 rounds to 6');
  });

  // ---- Entangling Roots ----------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: Entangling Roots and Brambles', function (t) {
    const AREA = [[4, 4], [3, 4], [5, 4], [4, 3], [4, 5]];
    [[3, 2], [4, 2], [5, 3]].forEach(function (L, i) {
      const lv = i + 1;
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: [{ id: 'ell_roots', level: lv }] }, { id: 'test_knight', x: 1, y: 7 }],
        enemies: [E(4, 4), E(5, 4), E(8, 8)] });
      clearCorgis();
      const e = ell(), g1 = at(4, 4), g2 = at(5, 4), g3 = at(8, 8);
      t.ok(!DD.Targeting.isValidTarget(e, slotOf(e, 'ell_roots'), 2, 4), 'L' + lv + ': min range 2');
      const h0 = hypeNow();
      t.ok(use(e, 'ell_roots', 4, 4), 'L' + lv + ': cast');
      t.ok(g1.hp === 14 - L[0] && g2.hp === 14 - L[0], 'L' + lv + ': ' + L[0] + ' damage to both foes caught');
      t.ok(st(g1, 'root') && st(g1, 'root').turns === 1 && st(g2, 'root').turns === 1, 'L' + lv + ': caught foes Rooted (their next turn)');
      t.eq(hypeNow() - h0, 4, 'L' + lv + ': +4 Hype for hitting 2 foes');
      t.ok(e.ap === 1 && slotOf(e, 'ell_roots').cd === 2, 'L' + lv + ': 2 AP, cooldown 2');
      t.ok(AREA.every(function (p) { const s = tile(p[0], p[1]).surface; return s && s.id === 'ell_bramble' && s.turns === L[1] && s.data.dmg === L[0]; }),
        'L' + lv + ': Brambles for ' + L[1] + ' rounds in radius 1');
      // a foe that enters is pricked and rooted; Ellaria's side walks through
      t.ok(A().teleport(g3, 4, 5), 'L' + lv + ': a foe enters the brambles');
      t.ok(g3.hp === 14 - L[0] && has(g3, 'root'), 'L' + lv + ': ' + L[0] + ' damage + Rooted on entry');
      const k = heroOf('test_knight');
      const kh = k.hp;
      t.ok(A().teleport(k, 4, 3) && k.hp === kh && !has(k, 'root'), 'L' + lv + ': heroes pass through unharmed');
      const c = addCorgi(e, 3, 6);
      t.ok(A().teleport(c, 3, 4) && c.hp === c.maxHp && !has(c, 'root'), 'L' + lv + ': so do corgis');
      // the root covers the foe's next turn; the brambles count rounds
      DD.Combat.endRound();
      t.ok(!has(g1, 'root') && !has(g2, 'root'), 'L' + lv + ': the root ended with the foes\' turn');
      t.ok(g1.hp === 14 - L[0] && g2.hp === 14 - L[0], 'L' + lv + ': "caught or entering": no further damage for staying in them');
      t.eq(surf(4, 4), 'ell_bramble', 'L' + lv + ': brambles still there in round 2');
      for (let r = 2; r <= L[1]; r++) DD.Combat.endRound();
      t.ok(!surf(4, 4), 'L' + lv + ': brambles gone after ' + L[1] + ' rounds');
    });
    // fire spreads through the whole patch (the Zarathor combo)
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_roots'] }], enemies: [E(8, 8)] });
    clearCorgis();
    t.ok(use(ell(), 'ell_roots', 4, 4), 'brambles on empty ground (no target unit)');
    A().applyElement(3, 4, 'fire', null);
    t.ok(AREA.every(function (p) { return surf(p[0], p[1]) === 'fire'; }), 'fire spreads through every bramble');
    // brambles don't grow in a fire; foes standing in it are still caught
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_roots'] }], enemies: [E(4, 4), E(8, 8)], surfaces: [{ x: 4, y: 4, id: 'fire', turns: 3 }] });
    clearCorgis();
    t.ok(use(ell(), 'ell_roots', 4, 4) && surf(4, 4) === 'fire' && surf(3, 4) === 'ell_bramble', 'the fire tile keeps its fire');
    t.ok(at(4, 4).hp === 11 && has(at(4, 4), 'root'), 'the foe in the fire is caught anyway');
    // a hazard only for the other side: the AI routes around, heroes and AutoPlay walk through
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_roots'] }], enemies: [E(7, 4), E(8, 8)] });
    clearCorgis();
    t.ok(use(ell(), 'ell_roots', 4, 4), 'brambles');
    t.ok(DD.Grid.hazardAt(4, 4, at(7, 4)) === 'ell_bramble' && DD.Grid.hazardAt(4, 4, ell()) === null && DD.Grid.hazardAt(4, 4, null) === null,
      'brambles are a hazard for foes only');
    // a walk into them stops right there (Rooted)
    const w = at(7, 4);
    A().moveAlong(w, [{ x: 6, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }]);
    t.ok(w.x === 5 && w.y === 4 && w.hp === 11 && has(w, 'root'), 'a foe walking in stops at the first bramble: 3 damage + Rooted');
    // pulled through brambles by Thorn Whip: pricked on the way (the pull still goes on)
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_roots'] }], enemies: [E(3, 4), E(8, 8)], surfaces: [{ x: 2, y: 4, id: 'ell_bramble', turns: 2 }] });
    clearCorgis();
    const p = at(3, 4);
    t.ok(use(ell(), 'basic', 3, 4) && p.x === 2 && p.hp === 14 - 4 - 3 && has(p, 'root'), 'whipped into brambles (no level: 3): 4 + 3 and Rooted');
    // silence blocks the spell
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_roots'] }], enemies: [E(4, 4)] });
    A().addStatus(ell(), 'silenced', { turns: 1 }, null);
    t.eq(DD.Combat.canUse(ell(), slotOf(ell(), 'ell_roots')), 'Silenced!', 'Silenced blocks Entangling Roots');
  });

  // ---- Barkskin / Good Boy ---------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: Barkskin and Who\'s a Good Boy?', function (t) {
    [[5, 2], [7, 2], [9, 3]].forEach(function (L, i) {
      const lv = i + 1;
      // the knight acts first, then Ellaria shields him for the enemy's turn
      quiet({ heroes: [{ id: 'test_knight', x: 3, y: 4 }, { id: 'ellaria', x: 1, y: 4, skills: [{ id: 'ell_barkskin', level: lv }] }], enemies: [E(4, 4), E(8, 8)] });
      clearCorgis();
      DD.Combat.endTurn();
      const e = ell(), k = heroOf('test_knight'), g = at(4, 4);
      t.ok(DD.Combat.current() === e, 'L' + lv + ': Ellaria\'s turn');
      const b0 = k.block;
      t.ok(use(e, 'ell_barkskin', 3, 4), 'L' + lv + ': used on an ally');
      t.eq(k.block - b0, L[0], 'L' + lv + ': +' + L[0] + ' Block');
      t.ok(st(k, 'thorns') && st(k, 'thorns').stacks === L[1] && st(k, 'thorns').turns === 1, 'L' + lv + ': Thorns ' + L[1] + ' through his next turn');
      t.ok(e.ap === 2 && slotOf(e, 'ell_barkskin').cd === 1, 'L' + lv + ': 1 AP, cooldown 1');
      // the grunt's turn: it must stab the knight; Block soaks it, the thorns bite back
      A().addStatus(g, 'taunt', { turns: 1 }, k);
      DD.Combat.state.aiOff = false;
      const khp = k.hp;
      DD.Combat.endTurn();
      t.eq(g.hp, 14 - L[1], 'L' + lv + ': the stabbing grunt takes ' + L[1] + ' thorns damage');
      t.eq(k.hp, khp, 'L' + lv + ': the Block soaked the stab');
      DD.Combat.state.aiOff = true;
      t.ok(DD.Combat.current() === k && k.block === 0 && has(k, 'thorns'), 'L' + lv + ': round 2, his turn: Block gone at its start, Thorns still up');
      DD.Combat.endTurn();
      t.ok(!has(k, 'thorns'), 'L' + lv + ': Thorns gone after his next turn');
      t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_barkskin')), 'On cooldown (1).', 'L' + lv + ': cooldown: not on her next turn');
      DD.Combat.endRound();
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === e && DD.Combat.canUse(e, slotOf(e, 'ell_barkskin')) === true, 'L' + lv + ': usable again two turns later');
    });
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_barkskin'] }], enemies: [E(8, 8)] });
    const self = ell();
    t.ok(use(self, 'ell_barkskin', 1, 4) && self.block === 5 && st(self, 'thorns').turns === 1, 'on herself: 5 Block, Thorns');
    DD.Combat.endTurn();
    t.ok(self.block === 0 && has(self, 'thorns'), 'her next turn: Block reset at its start, Thorns still up (applied on her own turn)');
    DD.Combat.endTurn();
    t.ok(!has(self, 'thorns'), 'Thorns gone after her next turn');
    [[3, 2], [5, 2], [6, 1]].forEach(function (L, i) {
      const lv = i + 1;
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: [{ id: 'ell_good_boy', level: lv }] }, { id: 'test_knight', x: 3, y: 4 }], enemies: [E(4, 4), E(8, 8)] });
      const e = ell(), k = heroOf('test_knight'), g = at(4, 4);
      k.hp = 20;
      t.ok(use(e, 'ell_good_boy', 3, 4), 'Good Boy L' + lv);
      t.eq(k.hp, 20 + L[0], 'Good Boy L' + lv + ': heals ' + L[0]);
      t.ok(has(k, 'empowered'), 'Good Boy L' + lv + ': Empowered');
      t.ok(e.ap === 2 && slotOf(e, 'ell_good_boy').cd === L[1], 'Good Boy L' + lv + ': 1 AP, cooldown ' + L[1]);
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && DD.Combat.useSkill(k, k.basic, 4, 4), 'Good Boy L' + lv + ': the knight attacks on his turn');
      t.eq(g.hp, 14 - Math.round(5 * 1.5), 'Good Boy L' + lv + ': Empowered slash 5 → 8');
      t.ok(!has(k, 'empowered'), 'Good Boy L' + lv + ': Empowered consumed');
    });
    // a treat for a corgi: its next bite is +50%
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_good_boy'] }], enemies: [E(4, 4), E(8, 8)] });
    clearCorgis();
    const c = addCorgi(ell(), 3, 4);
    t.ok(use(ell(), 'ell_good_boy', 3, 4), 'treat for a corgi');
    t.ok(DD.Combat.useSkill(c, slotOf(c, 'ell_corgi_bite'), 4, 4) && at(4, 4).hp === 14 - Math.round(3 * 1.5), 'Empowered bite: 3 → 5');
  });

  // ---- Fetch! -------------------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: Fetch!', function (t) {
    [[3, 2], [4, 3], [5, 3]].forEach(function (L, i) {
      const lv = i + 1;
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: [{ id: 'ell_fetch', level: lv }] }], enemies: [E(6, 4), E(8, 8)] });
      clearCorgis();
      const e = ell(), g = at(6, 4);
      t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_fetch')), 'Needs a corgi.', 'L' + lv + ': needs a corgi');
      const c = addCorgi(e, 2, 2);
      t.ok(!DD.Targeting.isValidTarget(e, slotOf(e, 'ell_fetch'), 8, 8), 'L' + lv + ': range 6');
      t.ok(use(e, 'ell_fetch', 6, 4), 'L' + lv + ': fetched');
      t.eq(g.hp, 14 - L[0], 'L' + lv + ': bitten for ' + L[0]);
      t.eq(g.x, 6 - L[1], 'L' + lv + ': dragged ' + L[1] + ' tiles toward Ellaria');
      t.eq(dist(c, g), 1, 'L' + lv + ': the corgi ends next to its prize');
      t.ok(e.ap === 2 && slotOf(e, 'ell_fetch').cd === 2, 'L' + lv + ': 1 AP, cooldown 2');
      t.eq(c.ap, 2, 'L' + lv + ': the dash is free for the corgi (it keeps its AP)');
    });
    // the nearest corgi does the job
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(6, 4), E(8, 8)] });
    clearCorgis();
    const far = addCorgi(ell(), 0, 0), near = addCorgi(ell(), 6, 1);
    t.ok(use(ell(), 'ell_fetch', 6, 4), 'fetch with two corgis');
    t.ok(far.x === 0 && far.y === 0 && dist(near, at(4, 4)) === 1, 'the nearest corgi fetched');
    // dragged into a pit
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(6, 4), E(8, 8)], terrain: wall([[4, 4, 'pit']]) });
    clearCorgis();
    addCorgi(ell(), 6, 2);
    const g = at(6, 4);
    t.ok(use(ell(), 'ell_fetch', 6, 4) && g.dead && DD.Combat.state.stats.envKills === 1, 'dragged into a pit: YEET');
    // dragged through brambles: bite 3 + pricked 3, Rooted where it lands
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(6, 4), E(8, 8)], surfaces: [{ x: 5, y: 4, id: 'ell_bramble', turns: 2 }] });
    clearCorgis();
    addCorgi(ell(), 6, 2);
    const b = at(6, 4);
    t.ok(use(ell(), 'ell_fetch', 6, 4) && b.x === 4 && b.hp === 14 - 3 - 3 && has(b, 'root'), 'dragged through the brambles: 3 + 3 and Rooted');
    // the bite kills: no drag, no errors
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(6, 4), E(8, 8)] });
    clearCorgis();
    addCorgi(ell(), 6, 2);
    at(6, 4).hp = 2;
    const v = at(6, 4);
    t.ok(use(ell(), 'ell_fetch', 6, 4) && v.dead, 'bite kills, drag skipped');
    // corridor: walls N and S of the foe, a friend behind it; only the lane tile toward Ellaria is free
    const corridor = { heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(6, 4), E(7, 4), E(8, 8)], terrain: wall([[6, 3], [6, 5]]) };
    quiet(corridor);
    clearCorgis();
    const far2 = addCorgi(ell(), 1, 1);
    const g2 = at(6, 4);
    t.ok(use(ell(), 'ell_fetch', 6, 4), 'corridor fetch with a far corgi');
    t.ok(g2.hp === 11 && g2.x === 4 && far2.hp === far2.maxHp && dist(far2, g2) === 1,
      'the corgi takes the only spot (in the lane), bites for 3, backs up and drags the foe 2 tiles (foe ' + g2.x + ',' + g2.y + ' corgi ' + far2.x + ',' + far2.y + ')');
    quiet(corridor);
    clearCorgis();
    const lane = addCorgi(ell(), 5, 4);
    const g3 = at(6, 4);
    t.ok(use(ell(), 'ell_fetch', 6, 4), 'corridor fetch with the corgi in the lane');
    t.ok(g3.hp === 11 && g3.x === 4 && lane.x === 3 && lane.hp === lane.maxHp, 'bite 3, no bump: the corgi backs up 2 tiles and the foe follows');
    // the corgi can't back up (Ellaria right behind it): it bites, but there is no drag and no self-bump
    quiet({ heroes: [{ id: 'ellaria', x: 4, y: 4, skills: ['ell_fetch'] }], enemies: [E(6, 4), E(7, 4), E(8, 8)], terrain: wall([[6, 3], [6, 5]]) });
    clearCorgis();
    const stuck = addCorgi(ell(), 5, 4);
    const g4 = at(6, 4);
    t.ok(use(ell(), 'ell_fetch', 6, 4) && g4.hp === 11 && g4.x === 6 && stuck.hp === stuck.maxHp && stuck.x === 5, 'no room to back up: bite only, nobody bumped');
    // a foe with no free tile beside it can't be fetched
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(6, 4), E(7, 4), E(5, 4), E(8, 8)], terrain: wall([[6, 3], [6, 5]]) });
    clearCorgis();
    addCorgi(ell(), 1, 1);
    const fs = slotOf(ell(), 'ell_fetch');
    t.ok(!DD.Targeting.isValidTarget(ell(), fs, 6, 4) && DD.Targeting.isValidTarget(ell(), fs, 5, 4), 'boxed-in foe: not a valid target (its neighbours still are)');
    const pv = DD.Combat.preview(ell(), fs, 5, 4);
    t.ok(pv.perUnit[at(5, 4).id] && pv.perUnit[at(5, 4).id].dmg === 3, 'preview of a corridor fetch shows the bite');
    // review: two corgis equally near, one on the drag lane: that one fetches (backs up), so nobody drags a foe into a packmate
    quiet({ heroes: [{ id: 'ellaria', x: 4, y: 5, skills: [{ id: 'ell_fetch', level: 3 }] }], enemies: [E(2, 7), E(1, 7), E(6, 7)] });
    clearCorgis();
    const side = addCorgi(ell(), 2, 6), onLane = addCorgi(ell(), 3, 7);
    const tg = at(2, 7);
    t.ok(use(ell(), 'ell_fetch', 2, 7, 3), 'fetch with a corgi beside the foe and one on its drag lane');
    t.ok(side.hp === side.maxHp && onLane.hp === onLane.maxHp, 'no corgi bumped (' + side.hp + ', ' + onLane.hp + ')');
    t.ok(tg.hp === 14 - 5 && tg.x === 4 && tg.y === 7 && dist(onLane, tg) === 1, 'bite 5, the lane corgi gets out of the way and the foe is dragged 2 tiles (' + tg.x + ',' + tg.y + ')');
    // review: a stunned / asleep / frozen / sheep corgi can't fetch (it can't act): the next able corgi goes, or nobody
    ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (sid) {
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(6, 4), E(8, 8)] });
      clearCorgis();
      const near = addCorgi(ell(), 6, 3), far = addCorgi(ell(), 1, 1);
      A().addStatus(near, sid, { turns: 1 }, null);
      const g = at(6, 4);
      t.ok(use(ell(), 'ell_fetch', 6, 4), sid + ': fetched');
      t.ok(near.x === 6 && near.y === 3 && dist(far, g) === 1 && g.hp === 11 && g.x === 4, sid + ': the ' + sid + ' corgi stays put; the able one dashes in, bites and drags');
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(6, 4), E(8, 8)] });
      clearCorgis();
      A().addStatus(addCorgi(ell(), 6, 3), sid, { turns: 1 }, null);
      t.eq(DD.Combat.canUse(ell(), slotOf(ell(), 'ell_fetch')), 'Your corgis can\'t act right now.', sid + ': no corgi can act: refused');
    });
  });

  // ---- Zoomies -------------------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: Zoomies', function (t) {
    [[4, 1], [5, 1], [6, 2]].forEach(function (L, i) {
      const lv = i + 1;
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: [{ id: 'ell_zoomies', level: lv }] }], enemies: [E(4, 4), E(6, 6), E(8, 0)] });
      clearCorgis();
      const e = ell(), g1 = at(4, 4), g2 = at(6, 6), g3 = at(8, 0);
      t.eq(DD.Combat.canUse(e, giveSlot(e, 'ell_zoomies', lv)), 'Needs a corgi.', 'L' + lv + ': needs a corgi');
      const idle = addCorgi(e, 1, 3);
      t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_zoomies')), 'No foe next to a corgi.', 'L' + lv + ': no foe next to a corgi: refused (no wasted AP)');
      idle.dead = true; idle.hp = 0;
      addCorgi(e, 3, 4); addCorgi(e, 6, 5); addCorgi(e, 4, 5);
      const h0 = hypeNow();
      t.ok(use(e, 'ell_zoomies', 1, 1, lv), 'L' + lv + ': zoom');
      t.eq(g1.hp, 14 - L[0], 'L' + lv + ': foe next to two corgis is hit once (' + L[0] + ')');
      t.eq(g1.x, 4 + L[1], 'L' + lv + ': pushed ' + L[1] + ' away from the first corgi');
      t.ok(g2.hp === 14 - L[0] && g2.y === 6 + L[1], 'L' + lv + ': second foe hit and pushed');
      t.eq(g3.hp, 14, 'L' + lv + ': far foe untouched');
      t.eq(hypeNow() - h0, 4, 'L' + lv + ': +4 Hype (2+ foes)');
      t.ok(e.ap === 1 && slotOf(e, 'ell_zoomies').cd === 2, 'L' + lv + ': 2 AP, cooldown 2');
    });
    // pushed into lava, into the map edge, into deep water, into brambles
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: ['ell_zoomies'] }], enemies: [E(4, 4), E(8, 7), E(2, 7), E(0, 8)],
      terrain: wall([[5, 4, 'lava'], [2, 8, 'deep_water']]) });
    clearCorgis();
    addCorgi(ell(), 3, 4); addCorgi(ell(), 7, 7); addCorgi(ell(), 2, 6);
    const lv = at(4, 4), edge = at(8, 7), dw = at(2, 7);
    t.ok(use(ell(), 'ell_zoomies', 1, 1), 'zoomies by the lava');
    t.ok(lv.x === 5 && lv.hp === 14 - 4 - 8 && has(lv, 'burn'), 'pushed into lava: 8 fire damage + Burn');
    t.ok(edge.x === 8 && edge.hp === 14 - 4 - 3, 'pushed into the map edge: bump 3');
    t.ok(dw.dead, 'pushed into deep water: SPLOOSH');
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: ['ell_zoomies'] }], enemies: [E(4, 4), E(8, 8)], terrain: wall([[5, 4, 'water']]) });
    clearCorgis();
    addCorgi(ell(), 3, 4);
    const sw = at(4, 4);
    t.ok(use(ell(), 'ell_zoomies', 1, 1) && sw.x === 5 && sw.hp === 10 && has(sw, 'wet'), 'pushed into shallow water: soaked (Wet), ready for lightning');
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: ['ell_zoomies'] }], enemies: [E(4, 4), E(8, 8)], surfaces: [{ x: 5, y: 4, id: 'ell_bramble', turns: 2 }] });
    clearCorgis();
    addCorgi(ell(), 3, 4);
    const br = at(4, 4);
    t.ok(use(ell(), 'ell_zoomies', 1, 1) && br.x === 5 && br.hp === 14 - 4 - 3 && has(br, 'root'), 'pushed into brambles: 4 + 3 and Rooted');
    // a foe killed by the lap is not pushed (no error)
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: ['ell_zoomies'] }], enemies: [E(4, 4), E(8, 8)] });
    clearCorgis();
    addCorgi(ell(), 3, 4);
    at(4, 4).hp = 3;
    const kd = at(4, 4);
    t.ok(use(ell(), 'ell_zoomies', 1, 1) && kd.dead, 'killed by the zoomies, nothing to push');
    // review: a corgi that can't act (stunned / asleep / frozen / sheep) doesn't zoom
    ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (sid) {
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: ['ell_zoomies'] }], enemies: [E(4, 4), E(6, 6), E(8, 0)] });
      clearCorgis();
      const zz = addCorgi(ell(), 3, 4);
      A().addStatus(zz, sid, { turns: 1 }, null);
      t.eq(DD.Combat.canUse(ell(), slotOf(ell(), 'ell_zoomies')), 'Your corgis can\'t act right now.', sid + ': the only corgi can\'t act: refused');
      addCorgi(ell(), 6, 5);
      const g1 = at(4, 4), g2 = at(6, 6);
      t.ok(use(ell(), 'ell_zoomies', 1, 1) && g1.hp === 14 && g1.x === 4 && g2.hp === 10 && g2.y === 7, sid + ': only the able corgi zooms');
    });
    // review: a foe next to two corgis is shoved by the one whose lane holds no friend (corgi W's lane = the knight)
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: ['ell_zoomies'] }, { id: 'test_knight', x: 5, y: 4 }], enemies: [E(4, 4), E(8, 8)] });
    clearCorgis();
    const zw = addCorgi(ell(), 3, 4), zs = addCorgi(ell(), 4, 5);
    const zk = heroOf('test_knight'), zf = at(4, 4);
    const pz = DD.Combat.preview(ell(), slotOf(ell(), 'ell_zoomies'), 1, 1);
    t.ok(!pz.perUnit[zk.id] || !pz.perUnit[zk.id].dmg, 'preview: no friendly bump');
    t.ok(use(ell(), 'ell_zoomies', 1, 1) && zf.x === 4 && zf.y === 3 && zf.hp === 10, 'pushed north, away from corgi S (4 damage, no bump)');
    t.ok(zk.hp === zk.maxHp && zw.hp === zw.maxHp && zs.hp === zs.maxHp, 'the knight and both corgis are untouched');
    // ...but squeezed between two corgis there is no clear lane: the shared bump rule (both take 3; the preview says so)
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: ['ell_zoomies'] }], enemies: [E(4, 4), E(8, 8)] });
    clearCorgis();
    const pa = addCorgi(ell(), 3, 4), pb = addCorgi(ell(), 5, 4);
    const pf = at(4, 4);
    t.ok(use(ell(), 'ell_zoomies', 1, 1) && pf.hp === 14 - 4 - 3 && pa.hp + pb.hp === pa.maxHp + pb.maxHp - 3, 'pincer: 4 + bump 3 on the foe, bump 3 on one corgi');
  });

  // ---- The Ol' Switcheroo ------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: The Ol\' Switcheroo', function (t) {
    [[4, 2], [6, 2], [8, 1]].forEach(function (L, i) {
      const lv = i + 1;
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: [{ id: 'ell_switcheroo', level: lv }] }, { id: 'test_knight', x: 1, y: 6 }], enemies: [E(8, 8)] });
      clearCorgis();
      const e = ell();
      t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_switcheroo')), 'Needs a corgi.', 'L' + lv + ': needs a corgi');
      const c = addCorgi(e, 7, 1);
      t.eq(JSON.stringify(DD.Targeting.validTargets(e, slotOf(e, 'ell_switcheroo'))), '[{"x":7,"y":1}]', 'L' + lv + ': only her corgis, at any distance');
      t.ok(use(e, 'ell_switcheroo', 7, 1), 'L' + lv + ': swapped');
      t.ok(e.x === 7 && e.y === 1 && c.x === 1 && c.y === 4, 'L' + lv + ': positions swapped');
      t.eq(c.block, L[0], 'L' + lv + ': corgi gains ' + L[0] + ' Block');
      t.ok(e.ap === 2 && slotOf(e, 'ell_switcheroo').cd === L[1], 'L' + lv + ': 1 AP, cooldown ' + L[1]);
    });
    // the escape: Ellaria in a grunt's face swaps with a far corgi; on its turn the grunt can only bite the corgi
    live({ heroes: [{ id: 'ellaria', x: 4, y: 4, skills: ['ell_switcheroo'] }], enemies: [E(5, 4)] });
    clearCorgis();
    const e0 = ell(), c0 = addCorgi(e0, 0, 8);
    t.ok(use(e0, 'ell_switcheroo', 0, 8), 'switcheroo out of the grunt\'s reach');
    const hp0 = e0.hp, chp = c0.hp + c0.block;
    DD.Combat.endTurn();
    t.ok(e0.hp === hp0 && c0.hp + c0.block < chp, 'the corgi took the stab instead (' + chp + ' → ' + (c0.hp + c0.block) + ')');
    t.eq(c0.block, 0, 'its Block lasted through the enemy turn, then reset at her turn start');
  });

  // ---- Wild Shape ----------------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: Wild Shape: Absolute Unit', function (t) {
    [[1, 7], [1, 9], [2, 10]].forEach(function (L, i) {
      const lv = i + 1;
      quiet({ heroes: [{ id: 'ellaria', x: 3, y: 4, level: 3, skills: [{ id: 'ell_wildshape', level: lv }, 'ell_switcheroo'] }],
        enemies: [E(4, 4), E(3, 6), E(8, 8)] });
      clearCorgis();
      const e = ell(), g1 = at(4, 4), g2 = at(3, 6);
      const hp0 = e.hp;
      t.ok(use(e, 'ell_wildshape', 3, 4, lv), 'L' + lv + ': shapeshift');
      t.ok(st(e, 'ell_absolute_unit') && st(e, 'ell_absolute_unit').turns === L[0], 'L' + lv + ': Absolute Unit (turns ' + L[0] + ')');
      t.ok(e.flags.immovable && e.sprite && e.sprite.base === 'quadruped' && e.sprite === DD.Ellaria.GIANT_SPRITE, 'L' + lv + ': immovable giant corgi sprite');
      const said = DD.Combat.state.log.map(function (l) { return l.text; });
      t.ok(said.indexOf('Ellaria is an Absolute Unit.') >= 0 && said.indexOf('Ellaria is Absolute Unit.') < 0, 'L' + lv + ': the log says "Ellaria is an Absolute Unit."');
      t.ok(e.basic.id === 'ell_chomp' && e.basic.level === lv, 'L' + lv + ': Thorn Whip becomes Chomp L' + lv);
      t.ok(e.block === 0 && e.hp === hp0 && !has(g1, 'taunt') && !has(g2, 'taunt') && !has(e, 'regen'), 'L' + lv + ': one verb: no Block, taunt or Regen riders');
      t.eq(e.ap, 2, 'L' + lv + ': 1 AP (review: 2 AP left nothing to Chomp with)');
      t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_wildshape')), 'No charges left.', 'L' + lv + ': once per fight');
      t.eq(A().push(g1, e, { x: -1, y: 0 }, 2).moved, 0, 'L' + lv + ': can\'t be pushed');
      t.ok(DD.Combat.useSkill(e, e.basic, 4, 4) && g1.hp === 14 - L[1] && g1.x === 5, 'L' + lv + ': Chomp hits for ' + L[1] + ' and knocks back 1');
      // the cast turn still has room for a second Chomp (or a walk up to a foe first)
      t.ok(A().teleport(g1, 4, 4) && DD.Combat.useSkill(e, e.basic, 4, 4) && e.ap === 0 && (g1.dead || g1.hp === 14 - 2 * L[1]),
        'L' + lv + ': shapeshift + two Chomps in the cast turn');
      // it lasts through her next L[0] turn(s); an enemy turn after that sees an elf again
      const seen = [];
      const off = DD.Events.on('turn:start', function (ev) { if (ev.unit && ev.unit.side === 'enemy' && ev.unit === g2) seen.push(!!e.flags.immovable); });
      try {
        for (let r = 0; r < L[0]; r++) {
          DD.Combat.endTurn();
          t.ok(has(e, 'ell_absolute_unit') && e.basic.id === 'ell_chomp' && e.flags.immovable, 'L' + lv + ': still a corgi on her turn ' + (r + 2));
        }
        DD.Combat.endTurn();
      } finally { off(); }
      t.ok(!has(e, 'ell_absolute_unit') && !e.sprite && !e.flags.immovable && e.basic.id === 'ell_thorn_whip', 'L' + lv + ': back to elf after her next ' + L[0] + ' turn(s)');
      t.eq(JSON.stringify(seen), JSON.stringify(seen.map(function (x, k) { return k < L[0]; })), 'L' + lv + ': enemy turns saw the corgi only while it lasted (' + JSON.stringify(seen) + ')');
    });
    // downed while shapeshifted: the form ends at once; switcheroo still works on an Absolute Unit
    quiet({ heroes: [{ id: 'ellaria', x: 3, y: 4, skills: ['ell_wildshape', 'ell_switcheroo'] }, { id: 'test_knight', x: 1, y: 1 }], enemies: [E(8, 8)] });
    clearCorgis();
    const e = ell();
    const c = addCorgi(e, 6, 6);
    t.ok(use(e, 'ell_wildshape', 3, 4), 'shapeshift');
    t.ok(use(e, 'ell_switcheroo', 6, 6) && e.x === 6 && c.x === 3, 'an Absolute Unit can still switcheroo');
    A().kill(e, null);
    t.ok(e.downed && !e.sprite && e.basic.id === 'ell_thorn_whip' && !e.flags.immovable && !has(e, 'ell_absolute_unit'), 'downed: back to elf');
    // the form also ends when the status is cleansed, and at the end of the fight
    quiet({ heroes: [{ id: 'ellaria', x: 3, y: 4, skills: ['ell_wildshape'] }], enemies: [E(8, 8)] });
    const e2 = ell();
    t.ok(use(e2, 'ell_wildshape', 3, 4), 'shapeshift');
    A().cleanse(e2, 'buff');
    DD.Combat.endTurn();
    t.ok(!e2.sprite && e2.basic.id === 'ell_thorn_whip' && !e2.flags.immovable, 'dispelled: back to elf by her next turn');
    quiet({ heroes: [{ id: 'ellaria', x: 3, y: 4, skills: ['ell_wildshape'] }], enemies: [E(4, 4)] });
    const e3 = ell();
    t.ok(use(e3, 'ell_wildshape', 3, 4), 'shapeshift');
    DD.Combat.finish('victory');
    t.ok(!e3.sprite && e3.basic.id === 'ell_thorn_whip' && !e3.flags.immovable, 'combat end: back to elf');
  });

  // ---- signature ---------------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: signature Release the Corgis!', function (t) {
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, level: 3, skills: ['ell_summon_corgi'] }], enemies: [E(4, 4), E(6, 2, 'test_archer'), E(7, 7)] });
    const e = ell();
    addCorgi(e, 0, 0); addCorgi(e, 0, 8);
    t.eq(corgis().length, 3, 'pack already full');
    t.eq(DD.Combat.canUse(e, e.signature), 'Needs 100 Hype.', 'needs 100 Hype');
    DD.Combat.state.hype = 100;
    const before = corgis().length;
    t.ok(use(e, 'signature', 1, 4), 'RELEASE THE CORGIS!');
    const fresh = corgis().slice(before);
    t.eq(fresh.length, 3, 'one corgi per foe (pack limit ignored)');
    const foes = DD.Combat.enemies();
    t.ok(foes.every(function (f) { return f.hp === f.maxHp - 6; }), 'every foe bitten for 6');
    t.ok(foes.every(function (f) {
      const tt = st(f, 'taunt');
      const src = tt && DD.Combat.byId(tt.source);
      return src && src.defId === 'ell_corgi' && dist(src, f) === 1 && tt.turns === 1;
    }), 'every foe Taunted for 1 turn by the corgi next to it');
    t.ok(fresh.every(function (c) { return c.ap === 0; }), 'the pounce is their action: the new corgis arrive with 0 AP');
    t.eq(hypeNow(), 4, 'Hype spent (+4 for hitting 2+ foes)');
    t.eq(e.ap, 1, '2 AP');
    e.ap = 3;
    t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_summon_corgi')), 'The pack is full (3 corgis).', 'Summon Corgi waits until the pack is back to 2');
    e.ap = 1;
    const names = corgis().map(function (c) { return c.name; });
    t.eq(names.filter(function (n, i) { return names.indexOf(n) === i; }).length, names.length, 'every corgi in the pack has its own name (' + names.join(', ') + ')');
    DD.Combat.endTurn();
    t.ok(fresh.filter(function (c) { return !c.dead; }).every(function (c) { return c.ap === 2; }), 'the pouncers act from her next turn (2 AP)');
    t.ok(foes.every(function (f) { return !has(f, 'taunt'); }), 'the taunts ended with the foes\' turns');
    // v2: on its turn the taunted foe must attack its corgi, not the knight next to it
    live({ heroes: [{ id: 'ellaria', x: 1, y: 1 }, { id: 'test_knight', x: 3, y: 4 }], enemies: [E(4, 4)] });
    clearCorgis();
    DD.Combat.state.hype = 100;
    t.ok(use(ell(), 'signature', 1, 1), 'pounce on the grunt next to the knight');
    const pouncer = corgis()[0], k = heroOf('test_knight');
    const khp = k.hp, php = pouncer.hp;
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.ok(k.hp === khp && pouncer.hp === php - 4, 'the grunt stabbed its corgi (' + php + ' → ' + pouncer.hp + '), not the knight');
    // at most 6, nearest first; a boxed-in foe is skipped
    const foesCfg = [E(2, 0), E(0, 2), E(3, 1), E(1, 4), E(4, 3), E(5, 4), E(8, 8)];
    quiet({ heroes: [{ id: 'ellaria', x: 0, y: 0 }], enemies: foesCfg });
    clearCorgis();
    DD.Combat.state.hype = 100;
    t.ok(use(ell(), 'signature', 0, 0), 'big pounce');
    t.eq(corgis().length, 6, 'at most 6 corgis');
    t.eq(at(8, 8).hp, 14, 'the farthest foe is left alone');
    t.ok(DD.Combat.enemies().filter(function (f) { return f.hp === 8; }).length === 6, 'the 6 nearest foes are bitten');
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1 }], enemies: [E(7, 7), E(4, 1)], terrain: wall([[6, 7], [8, 7], [7, 6], [7, 8]]) });
    clearCorgis();
    DD.Combat.state.hype = 100;
    t.ok(use(ell(), 'signature', 1, 1), 'pounce with a walled-in foe');
    t.ok(at(7, 7).hp === 14 && at(4, 1).hp === 8 && corgis().length === 1, 'no room next to the walled-in foe: skipped');
    // the bite kills: no taunt on a corpse, no error
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1 }], enemies: [E(4, 1), E(8, 8)] });
    clearCorgis();
    DD.Combat.state.hype = 100;
    at(4, 1).hp = 5;
    const vic = at(4, 1);
    t.ok(use(ell(), 'signature', 1, 1) && vic.dead && at(8, 8).hp === 8, 'a pounce kills one foe, the other is bitten');
    // every foe walled in: the button refuses instead of eating 100 Hype for nothing
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1 }], enemies: [E(7, 7)], terrain: wall([[6, 7], [8, 7], [7, 6], [7, 8]]) });
    DD.Combat.state.hype = 100;
    t.eq(DD.Combat.canUse(ell(), ell().signature), 'No room next to any foe.', 'no foe has room: Release the Corgis is disabled');
    t.eq(hypeNow(), 100, 'and the Hype is kept');
  });

  // ---- corgi skills ---------------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: corgi Bite and Bark Bark Bark', function (t) {
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1 }, { id: 'test_knight', x: 5, y: 4 }], enemies: [E(4, 4), E(3, 6), E(8, 8)] });
    clearCorgis();
    const c = addCorgi(ell(), 3, 4);
    const g1 = at(4, 4), g2 = at(3, 6);
    t.ok(DD.Combat.useSkill(c, slotOf(c, 'ell_corgi_bite'), 4, 4), 'bite');
    t.eq(g1.hp, 11, 'Bite: 3 damage');
    t.ok(DD.Combat.useSkill(c, slotOf(c, 'ell_corgi_bark'), 3, 4), 'bark');
    t.ok(st(g1, 'taunt') && st(g1, 'taunt').source === c.id && st(g1, 'taunt').turns === 1, 'adjacent foe Taunted for its next turn');
    t.ok(!has(g2, 'taunt'), 'a foe 2 tiles away is not');
    t.ok(c.block === 0 && slotOf(c, 'ell_corgi_bark').cd === 2 && c.ap === 0, 'no Block rider; cooldown 2; 1 AP each');
    t.eq(DD.Combat.canUse(c, slotOf(c, 'ell_corgi_bite')), 'Not enough AP.', 'two actions a turn');
    // v2: on its turn the taunted grunt must stab the corgi, even with the knight right beside it
    A().kill(g2, null);
    DD.Combat.state.aiOff = false;
    const k = heroOf('test_knight');
    const khp = k.hp, chp = c.hp;
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.ok(k.hp === khp && c.hp === chp - 4, 'the taunted grunt stabbed the corgi (' + chp + ' → ' + c.hp + '), not the knight');
    t.ok(!has(g1, 'taunt'), 'the taunt ended with its turn');
    // corgis act only on Ellaria's turn
    t.ok(DD.Combat.current() === ell() && DD.Combat.useSkill(c, slotOf(c, 'ell_corgi_bite'), 4, 4), 'round 2, her turn: the corgi bites again');
    DD.Combat.state.aiOff = true;
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === k && DD.Combat.canUse(c, slotOf(c, 'ell_corgi_bite')) !== true, 'the knight\'s turn: the corgi waits for Ellaria\'s');
  });

  // ---- attacks of opportunity ---------------------------------------------------------------------------------------
  T.suite('hero_ellaria: attacks of opportunity (corgis hold the line, the Absolute Unit Chomps, her moves that never provoke)', function (t) {
    const round = function () { return DD.Combat.state.round; };
    let strikes = [];
    const off = DD.Events.on('opportunity:attack', function (ev) { strikes.push(ev.attacker.name + '>' + ev.mover.name + ':' + ev.skillId); });
    try {
      // Thorn Whip is ranged: elf-form Ellaria makes no attacks of opportunity, and walking away from a grunt provokes it
      quiet({ heroes: [{ id: 'ellaria', x: 2, y: 4 }], enemies: [E(3, 4), E(8, 8)] });
      clearCorgis();
      let e = ell(), g = at(3, 4);
      t.eq(DD.Act.opportunitySlot(e), null, 'elf form: no attack of opportunity (Thorn Whip is ranged)');
      const pv = DD.Combat.provokes(e, 0, 4);
      t.ok(pv.length === 1 && pv[0].unitId === g.id && pv[0].dmg === 4, 'the move preview says the walk provokes the grunt\'s Stab (4)');
      let hp0 = e.hp;
      t.ok(DD.Combat.move(e, 0, 4), 'she walks away from the grunt');
      t.ok(e.x === 0 && e.y === 4 && e.hp === hp0 - 4, 'the grunt stabs her as she leaves (4); the walk goes on');
      t.eq(g.oppRound, round(), 'its reaction is spent for the round');
      t.ok(!DD.Combat.canUndo(), 'a move that provoked cannot be undone');
      quiet({ heroes: [{ id: 'ellaria', x: 2, y: 4 }], enemies: [E(3, 4), E(8, 8)] });
      clearCorgis();
      g = at(3, 4);
      strikes = [];
      DD.AI.moveTo(g, 6, 4);
      t.ok(g.x === 6 && g.hp === 14 && !strikes.length, 'a grunt walks away from elf-form Ellaria unpunished');
      // a corgi holds the line: a foe that walks away from it gets bitten (3), once per round; next round again
      quiet({ heroes: [{ id: 'ellaria', x: 0, y: 0 }], enemies: [E(4, 4), E(4, 6), E(8, 8)] });
      clearCorgis();
      const c = addCorgi(ell(), 4, 5);
      t.eq(DD.Act.opportunitySlot(c).id, 'ell_corgi_bite', 'the corgi strikes with Bite');
      const g1 = at(4, 4), g2 = at(4, 6);
      strikes = [];
      DD.AI.moveTo(g1, 7, 4);
      t.ok(g1.hp === 11 && g1.x === 7, 'the grunt walking away is bitten for 3, its walk goes on');
      t.ok(strikes.length === 1 && strikes[0].indexOf('ell_corgi_bite') > 0 && c.oppRound === round(), 'one corgi attack of opportunity, logged');
      DD.AI.moveTo(g2, 7, 6);
      t.ok(g2.hp === 14 && g2.x === 7 && strikes.length === 1, 'at most one per round: the second walker gets away');
      DD.Combat.endRound();
      t.ok(A().teleport(g2, 4, 6) && DD.AI.moveTo(g2, 6, 6) && g2.hp === 11, 'round 2: the corgi bites again');
      // the bite downs the walker: the walk ends there, a kill for the party
      quiet({ heroes: [{ id: 'ellaria', x: 0, y: 0 }], enemies: [E(4, 4), E(8, 8)] });
      clearCorgis();
      addCorgi(ell(), 4, 5);
      const v = at(4, 4);
      v.hp = 2;
      const h0 = hypeNow();
      DD.AI.moveTo(v, 7, 4);
      t.ok(v.dead && hypeNow() - h0 === 8, 'the corgi\'s bite kills the walker (+8 Hype)');
      // stunned / asleep / sheep corgis can't; nor a corgi already spent
      ['stun', 'sleep', 'sheep'].forEach(function (sid) {
        quiet({ heroes: [{ id: 'ellaria', x: 0, y: 0 }], enemies: [E(4, 4), E(8, 8)] });
        clearCorgis();
        const cc = addCorgi(ell(), 4, 5);
        A().addStatus(cc, sid, { turns: 1 }, null);
        const w = at(4, 4);
        DD.AI.moveTo(w, 7, 4);
        t.ok(w.hp === 14 && w.x === 7, 'a corgi with ' + sid + ' makes no attack of opportunity');
      });
      // an Empowered corgi's free bite neither uses nor spends the treat: its next Bite does
      quiet({ heroes: [{ id: 'ellaria', x: 2, y: 4, skills: ['ell_good_boy'] }], enemies: [E(4, 4), E(4, 6), E(8, 8)] });
      clearCorgis();
      const ec = addCorgi(ell(), 4, 5);
      t.ok(use(ell(), 'ell_good_boy', 4, 5) && has(ec, 'empowered'), 'treat: the corgi is Empowered');
      DD.AI.moveTo(at(4, 4), 7, 4);
      t.ok(at(7, 4).hp === 11 && has(ec, 'empowered'), 'its attack of opportunity bites for 3 and keeps Empowered');
      t.ok(DD.Combat.useSkill(ec, slotOf(ec, 'ell_corgi_bite'), 4, 6) && at(4, 6).hp === 14 - Math.round(3 * 1.5), 'its next Bite is the Empowered one (5)');
      // the Absolute Unit: Chomp is melee, so foes that walk away are Chomped and knocked back (their walk ends)
      quiet({ heroes: [{ id: 'ellaria', x: 2, y: 4, skills: ['ell_wildshape'] }], enemies: [E(3, 4), E(8, 8)] });
      clearCorgis();
      e = ell(); g = at(3, 4);
      t.ok(use(e, 'ell_wildshape', 2, 4), 'shapeshift');
      t.eq(DD.Act.opportunitySlot(e).id, 'ell_chomp', 'Absolute Unit: Chomp is her attack of opportunity');
      DD.AI.moveTo(g, 3, 1);
      t.ok(g.hp === 14 - 7 && g.x === 4 && g.y === 4, 'the walker is Chomped (7) and knocked back 1: its walk ends there (' + g.x + ',' + g.y + ')');
      // ...with a pit behind it, walking away from an Absolute Unit is a YEET (environmental kill, +20 Hype)
      quiet({ heroes: [{ id: 'ellaria', x: 2, y: 4, skills: ['ell_wildshape'] }], enemies: [E(3, 4), E(8, 8)], terrain: wall([[4, 4, 'pit']]) });
      clearCorgis();
      t.ok(use(ell(), 'ell_wildshape', 2, 4), 'shapeshift next to a grunt with a pit behind it');
      const py = at(3, 4), ph = hypeNow();
      DD.AI.moveTo(py, 3, 1);
      t.ok(py.dead && DD.Combat.state.stats.envKills === 1 && hypeNow() - ph === 20, 'Chomped into the pit as it tries to leave: YEET (+20 Hype)');
      // her escapes never provoke: The Ol' Switcheroo (a swap) out of two grunts
      quiet({ heroes: [{ id: 'ellaria', x: 4, y: 4, skills: ['ell_switcheroo'] }], enemies: [E(5, 4), E(4, 5), E(8, 8)] });
      clearCorgis();
      e = ell();
      const far = addCorgi(e, 0, 8);
      hp0 = e.hp;
      strikes = [];
      t.ok(use(e, 'ell_switcheroo', 0, 8) && e.x === 0 && e.y === 8, 'switcheroo away from two grunts');
      t.ok(e.hp === hp0 && far.hp === far.maxHp && !strikes.length, 'a swap provokes nothing');
      // Fetch!: the corgi dashes away from the grunt beside it without provoking
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(3, 1), E(6, 4), E(8, 8)] });
      clearCorgis();
      const fc = addCorgi(ell(), 3, 2);
      strikes = [];
      t.ok(use(ell(), 'ell_fetch', 6, 4), 'fetch the far grunt');
      t.ok(fc.hp === fc.maxHp && !strikes.length && at(4, 4) && at(4, 4).hp === 11, 'the dash and the drag provoke nothing; the grunt is bitten and dragged');
      // Thorn Whip pulls a foe away from a corgi: forced movement never provokes
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(4, 4), E(8, 8)] });
      clearCorgis();
      addCorgi(ell(), 5, 4);
      strikes = [];
      t.ok(use(ell(), 'basic', 4, 4) && at(3, 4) && at(3, 4).hp === 10 && !strikes.length, 'whipped away from the corgi: 4 damage, no bite');
      // Zoomies push foes away from the pack: no attacks of opportunity either
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, skills: ['ell_zoomies'] }], enemies: [E(4, 4), E(8, 8)] });
      clearCorgis();
      addCorgi(ell(), 3, 4);
      strikes = [];
      t.ok(use(ell(), 'ell_zoomies', 1, 1) && at(5, 4) && at(5, 4).hp === 10 && !strikes.length, 'zoomed 1 tile away: 4 damage, no bite');
      // combo: a corgi's Bark lets Ellaria slip away (a taunted foe only strikes its taunter)...
      quiet({ heroes: [{ id: 'ellaria', x: 3, y: 4 }], enemies: [E(4, 4), E(8, 8)] });
      clearCorgis();
      e = ell(); g = at(4, 4);
      const bc = addCorgi(e, 4, 5);
      t.ok(DD.Combat.useSkill(bc, slotOf(bc, 'ell_corgi_bark'), 4, 5) && has(g, 'taunt'), 'the corgi barks: the grunt is Taunted');
      hp0 = e.hp;
      t.eq(DD.Combat.provokes(e, 1, 4).length, 0, 'the move preview: walking away provokes nothing now');
      t.ok(DD.Combat.move(e, 1, 4) && e.x === 1 && e.hp === hp0, 'Ellaria walks away untouched');
      // ...but the corgi itself does not get away with it
      const bhp = bc.hp;
      t.ok(DD.Combat.move(bc, 4, 7) && bc.hp === bhp - 4, 'the corgi walking off is stabbed by the grunt it taunted');
      // Barkskin's Thorns answer an attack of opportunity too
      quiet({ heroes: [{ id: 'ellaria', x: 2, y: 4, skills: ['ell_barkskin'] }], enemies: [E(3, 4), E(8, 8)] });
      clearCorgis();
      e = ell(); g = at(3, 4);
      t.ok(use(e, 'ell_barkskin', 2, 4), 'Barkskin on herself');
      t.ok(DD.Combat.move(e, 0, 4) && g.hp === 14 - 2 && e.block === 5 - 4, 'the stab lands on her Block and the thorns prick the grunt for 2');
      // AI: a grunt engaged with a corgi sticks to it rather than walking past to the mage (control: no corgi)
      [true, false].forEach(function (withCorgi) {
        live({ heroes: [{ id: 'ellaria', x: 0, y: 8 }, { id: 'test_mage', x: 4, y: 1 }], enemies: [E(4, 4)] });
        clearCorgis();
        const guard = withCorgi ? addCorgi(ell(), 4, 5) : null;
        const mage = heroOf('test_mage'), gg = at(4, 4);
        const mhp = mage.hp, ghp = guard ? guard.hp : 0;
        DD.Combat.endTurn(); DD.Combat.endTurn();
        t.log((withCorgi ? 'with a corgi' : 'no corgi') + ': grunt at ' + gg.x + ',' + gg.y + (guard ? ', corgi ' + ghp + '→' + guard.hp : '') +
          ', mage ' + mhp + '→' + mage.hp);
        if (withCorgi) t.ok(guard.hp < ghp && mage.hp === mhp, 'the grunt next to the corgi stabs the corgi; the mage is safe');
        else t.ok(mage.hp < mhp, 'control: with no corgi in its face, the grunt walks up and stabs the mage');
      });
    } finally { off(); }
  });

  // ---- items ---------------------------------------------------------------------------------------------------------
  T.suite('hero_ellaria: hero items', function (t) {
    // The Good Stick
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 1, items: ['ell_good_stick'] }], enemies: [E(4, 4), E(8, 8)] });
    clearCorgis();
    const e = ell();
    t.ok(Math.abs(e.dmgBonus - 0.1) < 1e-9, 'Good Stick: +10% damage');
    const c = addCorgi(e, 3, 4);
    t.ok(DD.Combat.useSkill(c, slotOf(c, 'ell_corgi_bite'), 4, 4) && at(4, 4).hp === 14 - 5, 'Good Stick: corgi bites for 3 + 2');
    // ...and every corgi attack Ellaria orders: round(base × 1.1) + 2 (Thorn Whip, her own attack, only gets the 10%)
    [['ell_fetch', 4, 4, 3], ['ell_zoomies', 1, 4, 4], ['basic', 4, 4, 4]].forEach(function (cs) {
      [false, true].forEach(function (stick) {
        quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, items: stick ? ['ell_good_stick'] : [] }], enemies: [E(4, 4), E(8, 8)] });
        clearCorgis();
        addCorgi(ell(), 4, 3);
        const f = at(4, 4);
        t.ok(use(ell(), cs[0], cs[1], cs[2]), cs[0] + (stick ? ' with' : ' without') + ' the stick');
        const want = stick ? Math.round(cs[3] * 1.1) + (cs[0] === 'basic' ? 0 : 2) : cs[3];
        t.eq(f.maxHp - f.hp, want, cs[0] + (stick ? ' with' : ' without') + ' the Good Stick: ' + want + ' damage');
      });
    });
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, items: ['ell_good_stick'] }], enemies: [E(4, 4), E(8, 8)] });
    DD.Combat.state.hype = 100;
    t.ok(use(ell(), 'signature', 1, 4) && at(4, 4).hp === 14 - (Math.round(6 * 1.1) + 2), 'Good Stick: Release the Corgis bites for round(6 × 1.1) + 2 = 9');
    // ...and the corgis' attacks of opportunity (they are Bites)
    quiet({ heroes: [{ id: 'ellaria', x: 0, y: 0, items: ['ell_good_stick'] }], enemies: [E(4, 4), E(8, 8)] });
    clearCorgis();
    addCorgi(ell(), 4, 5);
    DD.AI.moveTo(at(4, 4), 7, 4);
    t.eq(at(7, 4).hp, 14 - 5, 'Good Stick: a corgi\'s attack of opportunity bites for 3 + 2');
    // Robe of Perpetual Shedding: a melee attacker is Dazzled until the end of its next turn; an archer is not
    live({ heroes: [{ id: 'ellaria', x: 4, y: 4, items: ['ell_shedding_robe'] }], enemies: [E(5, 4), E(4, 8, 'test_archer')] });
    clearCorgis();
    const r = ell(), g = at(5, 4), a = at(4, 8);
    t.eq(r.maxHp, 30, 'Robe: +4 max HP');
    A().addStatus(g, 'taunt', { turns: 1 }, r);
    const hp0 = r.hp;
    DD.Combat.endTurn();
    t.ok(r.hp < hp0, 'Robe: Ellaria was hit (' + hp0 + ' → ' + r.hp + ')');
    t.ok(has(g, 'dazzled') && st(g, 'dazzled').turns === 1, 'Robe: the melee attacker is Dazzled (its next turn too)');
    t.ok(!has(a, 'dazzled'), 'Robe: the archer is not');
    DD.Combat.state.aiOff = true;
    DD.Combat.endTurn();
    t.ok(!has(g, 'dazzled'), 'Robe: the Dazzle ended with the grunt\'s next turn');
    // an attack of opportunity is a melee hit too: the grunt that stabs her as she walks off is Dazzled
    quiet({ heroes: [{ id: 'ellaria', x: 4, y: 4, items: ['ell_shedding_robe'] }], enemies: [E(5, 4), E(8, 8)] });
    clearCorgis();
    const rr = ell(), rg = at(5, 4);
    const rhp = rr.hp;
    t.ok(DD.Combat.move(rr, 1, 4) && rr.hp === rhp - 4 && has(rg, 'dazzled'), 'Robe: the attacker of opportunity is Dazzled');
    t.eq(st(rg, 'dazzled').turns, 1, 'Robe: through its next turn');
    // Flower Crown of the Corgi Queen
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, items: ['ell_flower_crown'], skills: ['ell_summon_corgi'] }], enemies: [E(8, 8)] });
    const q = ell();
    t.eq(DD.Ellaria.packMax(q), 3, 'Crown: the pack stays at 3');
    t.ok(Math.abs(q.healBonus - 0.15) < 1e-9, 'Crown: +15% healing');
    addCorgi(q, 1, 6); addCorgi(q, 1, 7);
    A().kill(corgis(q)[0], null);
    A().kill(corgis(q)[0], null);
    t.eq(corgis(q).length, 1, 'two corgis fell');
    DD.Combat.endTurn();
    t.eq(corgis(q).length, 2, 'Crown: one new corgi at the start of her next turn');
    const newest = corgis(q)[corgis(q).length - 1];
    t.ok(newest.ap === 2 && dist(newest, q) <= 2, 'Crown: the new corgi arrives next to Ellaria, ready');
    DD.Combat.endTurn();
    t.eq(corgis(q).length, 2, 'Crown: no further corgis without new losses');
    t.ok(DD.Combat.canUse(q, slotOf(q, 'ell_summon_corgi')) === true, 'Crown: a 3rd corgi can still be summoned');
    // a full pack (after the signature) gets no extra corgi
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, items: ['ell_flower_crown'] }], enemies: [E(4, 4), E(6, 6), E(4, 7), E(7, 2)] });
    DD.Combat.state.hype = 100;
    t.ok(use(ell(), 'signature', 1, 4), 'a big pack');
    const n0 = corgis().length;
    A().kill(corgis()[0], null);
    DD.Combat.endTurn();
    t.eq(corgis().length, n0 - 1, 'Crown: the pack is still over 3, nobody new bounds in');
    // a corgi lost while she is downed: the new one bounds in at the start of her first turn back on her feet
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, items: ['ell_flower_crown'] }, { id: 'test_knight', x: 1, y: 6 }], enemies: [E(8, 8)] });
    const dq = ell();
    A().kill(dq, null);
    A().kill(corgis(dq)[0], null);
    t.ok(dq.downed && corgis(dq).length === 0, 'Crown: downed, and her corgi fell');
    DD.Combat.endTurn();
    t.eq(corgis(dq).length, 0, 'Crown: nothing while she is down');
    t.ok(A().revive(dq, 0.25) && !dq.downed, 'the knight helps her up');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === dq && corgis(dq).length === 1 && corgis(dq)[0].ap === 2, 'Crown: her next turn starts with a new, ready corgi');
  });

  // ---- v2 edge cases & previews ------------------------------------------------------------------------------------
  T.suite('hero_ellaria: v2 edge cases (stun, sheep, silence, charm, AP, whose turn) and previews', function (t) {
    function scene() {
      quiet({ heroes: [{ id: 'ellaria', x: 2, y: 4, level: 4, skills: ['ell_spring', 'ell_roots', 'ell_fetch', 'ell_zoomies'] }, { id: 'test_knight', x: 1, y: 5 }],
        enemies: [E(5, 4), E(6, 5), E(4, 7, 'test_archer'), E(8, 1)] });
      clearCorgis();
      addCorgi(ell(), 3, 4);
      return ell();
    }
    let e = scene();
    A().addStatus(e, 'stun', { turns: 1 }, at(5, 4));
    t.eq(DD.Combat.canUse(e, e.basic), 'Stunned!', 'stunned: no skills');
    // a stun from an enemy costs her next turn; her corgi still acts on it
    e = scene();
    const pup = corgis()[0];
    DD.Combat.endTurn();
    A().addStatus(e, 'stun', { turns: 1 }, at(5, 4));
    DD.Combat.endRound();
    t.ok(DD.Combat.current() === e && e.ap === 0 && pup.ap === 2, 'round 2: stunned Ellaria has 0 AP, her corgi 2');
    t.ok(DD.Combat.useSkill(pup, slotOf(pup, 'ell_corgi_bite'), 4, 4) === false && DD.Combat.useSkill(pup, slotOf(pup, 'ell_corgi_bark'), pup.x, pup.y), 'the corgi barks on her lost turn');
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.ok(DD.Combat.current() === e && e.ap === 3 && !has(e, 'stun'), 'round 3: back to 3 AP');
    e = scene();
    A().addStatus(e, 'sheep', { turns: 1 }, null);
    t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_spring')), 'Baa. (Sheep can only move.)', 'sheep: no skills');
    e = scene();
    A().addStatus(e, 'silenced', { turns: 1 }, null);
    t.ok(DD.Combat.canUse(e, slotOf(e, 'ell_roots')) === 'Silenced!' && DD.Combat.canUse(e, slotOf(e, 'ell_spring')) === true &&
      DD.Combat.canUse(e, e.basic) === true, 'silenced: only the spell is blocked');
    e = scene();
    e.ap = 1;
    t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_spring')), 'Not enough AP.', 'not enough AP');
    e = scene();
    const charmer = at(5, 4);
    A().addStatus(e, 'charmed', { turns: 1 }, charmer);
    clearCorgis();
    t.ok(use(e, 'basic', 5, 4) && charmer.hp === 14, 'charmed: Thorn Whip can\'t hurt the charmer');
    // only on her own turn
    e = scene();
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === heroOf('test_knight') && DD.Combat.canUse(e, e.basic) === 'Not Ellaria\'s turn.', 'not her turn: refused');
    // tile skills on empty tiles (no target unit)
    e = scene();
    t.ok(use(e, 'ell_spring', 2, 1), 'Healing Spring on an empty area');
    e.ap = 3;
    t.ok(use(e, 'ell_roots', 3, 1), 'Entangling Roots on an empty area');
    // previews predict reality exactly (no dice anywhere in this kit)
    const cases = [['basic', 5, 4], ['ell_spring', 4, 5], ['ell_roots', 5, 5], ['ell_fetch', 6, 5], ['ell_zoomies', 2, 4, function (u) { addCorgi(u, 5, 3); addCorgi(u, 6, 6); }],
      ['ell_barkskin', 1, 5], ['ell_good_boy', 1, 5], ['ell_switcheroo', 3, 4], ['ell_wildshape', 2, 4], ['ell_summon_corgi', 2, 3], ['signature', 2, 4],
      ['ell_chomp', 3, 4, function (u) { clearCorgis(); A().teleport(at(5, 4), 3, 4); }]];
    cases.forEach(function (cs) {
      const u = scene();
      if (cs[3]) cs[3](u);
      DD.Combat.state.hype = 100;
      u.ap = 10;
      const s = cs[0] === 'basic' ? u.basic : cs[0] === 'signature' ? u.signature : giveSlot(u, cs[0], 2);
      const mism = previewVsReal(u, s, cs[1], cs[2]);
      t.ok(!mism.length, 'preview = reality for ' + cs[0] + (mism.length ? ': ' + mism.join('; ') : ''));
    });
    // corgi skill previews
    let u = scene();
    clearCorgis();
    let c = addCorgi(u, 4, 4);
    let mm = previewVsReal(c, slotOf(c, 'ell_corgi_bite'), 5, 4);
    t.ok(!mm.length, 'preview = reality for the corgi bite' + (mm.length ? ': ' + mm.join('; ') : ''));
    u = scene();
    clearCorgis();
    c = addCorgi(u, 4, 4);
    const p = DD.Combat.preview(c, slotOf(c, 'ell_corgi_bark'), c.x, c.y);
    t.ok(p.perUnit[at(5, 4).id] && p.perUnit[at(5, 4).id].statuses.indexOf('taunt') >= 0, 'bark preview shows the taunt');
    mm = previewVsReal(c, slotOf(c, 'ell_corgi_bark'), c.x, c.y);
    t.ok(!mm.length, 'preview = reality for the bark');
    // a preview never leaks into the real fight
    const e3 = scene();
    const snap = function () {
      return JSON.stringify([DD.Combat.state.units.map(function (o) { return [o.id, o.x, o.y, o.hp, o.block, o.statuses.length, !!o.sprite, o.name]; }),
        DD.Combat.state.grid.tiles.map(function (tl) { return tl.surface ? tl.surface.id : 0; }), DD.Combat.state.rng.getState()]);
    };
    const s0 = snap();
    DD.Combat.state.hype = 100;
    ['ell_wildshape', 'ell_fetch', 'ell_roots', 'ell_spring', 'ell_summon_corgi'].forEach(function (id) {
      const sl = giveSlot(e3, id, 1);
      DD.Targeting.validTargets(e3, sl).forEach(function (q) { DD.Combat.preview(e3, sl, q.x, q.y); });
    });
    DD.Targeting.validTargets(e3, e3.signature).forEach(function (q) { DD.Combat.preview(e3, e3.signature, q.x, q.y); });
    DD.Combat.state.hype = 0;
    t.eq(snap(), s0, 'previews leave the fight untouched (units, surfaces, RNG)');
    t.ok(e3.basic.id === 'ell_thorn_whip' && !e3.data.ellShape, 'Wild Shape preview did not transform the real Ellaria');
  });

  // ---- AutoPlay ------------------------------------------------------------------------------------------------------
  const LOADOUTS = {
    1: { 1: [{ id: 'ell_summon_corgi', level: 1 }, { id: 'ell_spring', level: 1 }],
      3: [{ id: 'ell_summon_corgi', level: 1 }, { id: 'ell_spring', level: 1 }, { id: 'ell_roots', level: 1 }, { id: 'ell_fetch', level: 1 }],
      5: [{ id: 'ell_summon_corgi', level: 2 }, { id: 'ell_zoomies', level: 1 }, { id: 'ell_wildshape', level: 1 }, { id: 'ell_barkskin', level: 1 }] },
    2: { 1: [{ id: 'ell_summon_corgi', level: 1 }, { id: 'ell_spring', level: 1 }],
      3: [{ id: 'ell_summon_corgi', level: 1 }, { id: 'ell_good_boy', level: 1 }, { id: 'ell_zoomies', level: 1 }, { id: 'ell_roots', level: 1 }],
      5: [{ id: 'ell_summon_corgi', level: 2 }, { id: 'ell_fetch', level: 2 }, { id: 'ell_wildshape', level: 1 }, { id: 'ell_switcheroo', level: 1 }] },
    3: { 1: [{ id: 'ell_summon_corgi', level: 1 }, { id: 'ell_spring', level: 1 }],
      3: [{ id: 'ell_summon_corgi', level: 1 }, { id: 'ell_barkskin', level: 1 }, { id: 'ell_fetch', level: 1 }, { id: 'ell_good_boy', level: 1 }],
      5: [{ id: 'ell_spring', level: 2 }, { id: 'ell_roots', level: 2 }, { id: 'ell_zoomies', level: 2 }, { id: 'ell_switcheroo', level: 1 }] },
  };
  function battles(t, act) {
    const results = [];
    [1, 3, 5].forEach(function (lvl) {
      ['normal', 'elite', 'boss'].forEach(function (kind, ki) {
        const enc = DD.getEncounter('test_a' + act + '_' + kind);
        if (!enc) { t.fail('fixture encounter test_a' + act + '_' + kind + ' missing'); return; }
        const seed = 1000 * act + 10 * lvl + ki + (+t.seed || 0);
        const party = [DD.Combat.makeRunHero({ id: 'ellaria', level: lvl, skills: LOADOUTS[act][lvl] })].concat(['test_knight', 'test_cleric', 'test_mage'].map(function (id) {
          return DD.Combat.makeRunHero({ id: id, level: lvl });
        }));
        const setup = DD.Encounter.build(enc, party, { rng: DD.RNG(seed), difficulty: 'normal', act: act });
        DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: kind });
        t.ok(corgis(ell()).length === 1, 'act ' + act + ' L' + lvl + ' ' + kind + ': starts with a corgi');
        const res = DD.AutoPlay.runBattle(30);
        const s = DD.Combat.state;
        t.ok(!!s.order && s.order.some(function (en) { return DD.Combat.byId(en.unitId) && DD.Combat.byId(en.unitId).defId === 'ellaria'; }), 'act ' + act + ' L' + lvl + ' ' + kind + ': Ellaria rolled initiative');
        const sane = s.units.every(function (u) { return isFinite(u.hp) && u.hp >= 0 && u.hp <= u.maxHp && isFinite(u.x) && isFinite(u.y); });
        t.ok(sane, 'act ' + act + ' L' + lvl + ' ' + kind + ': state sane');
        t.ok(res.result === 'victory' || res.result === 'defeat' || res.timeout, 'act ' + act + ' L' + lvl + ' ' + kind + ': battle resolves');
        results.push('L' + lvl + ' ' + kind + ': ' + (res.result || 'timeout') + ' in ' + res.rounds);
      });
    });
    t.log('act ' + act + ': ' + results.join(' · '));
  }
  function counting(fn) {
    const used = {};
    const orig = DD.Combat.useSkill;
    DD.Combat.useSkill = function (unit, slot) {
      const ok = orig.apply(this, arguments);
      if (ok && unit && slot && (unit.defId === 'ellaria' || unit.defId === 'ell_corgi')) used[slot.id] = (used[slot.id] || 0) + 1;
      return ok;
    };
    try { fn(used); } finally { DD.Combat.useSkill = orig; }
    return used;
  }
  T.suite('hero_ellaria: AutoPlay releases the corgis when the Hype is there', function (t) {
    [[E(4, 4), E(5, 2), E(6, 6)], [E(3, 4), E(4, 5), E(6, 2), E(7, 7)]].forEach(function (foes, k) {
      live({ heroes: [{ id: 'ellaria', x: 1, y: 4, level: 3 }, { id: 'test_knight', x: 1, y: 6, level: 3 }], enemies: foes });
      DD.Combat.state.hype = 100;
      const n0 = corgis().length;
      const used = counting(function () { DD.AutoPlay.takeTurn(); });
      t.log('scene ' + k + ': ' + JSON.stringify(used) + ', Hype left ' + DD.Combat.state.hype);
      t.ok(used.ell_release === 1 && corgis().length >= n0 + foes.length - 1, 'scene ' + k + ': RELEASE THE CORGIS! (' + n0 + ' → ' + corgis().length + ' corgis)');
    });
  });

  [1, 2, 3].forEach(function (act) {
    T.suite('hero_ellaria: AutoPlay battles act ' + act + ' (party ellaria + fixtures, L1/3/5)', function (t) {
      // attacks of opportunity by / on her pack (the corgis hold the line)
      const aoo = { byCorgi: 0, byEllaria: 0, onCorgi: 0, onEllaria: 0 };
      const off = DD.Events.on('opportunity:attack', function (ev) {
        const a = ev.attacker && ev.attacker.defId, m = ev.mover && ev.mover.defId;
        if (a === 'ell_corgi') aoo.byCorgi++;
        if (a === 'ellaria') aoo.byEllaria++;
        if (m === 'ell_corgi') aoo.onCorgi++;
        if (m === 'ellaria') aoo.onEllaria++;
      });
      let used;
      try { used = counting(function () { battles(t, act); }); } finally { off(); }
      t.log('act ' + act + ' skill uses: ' + JSON.stringify(used));
      t.log('act ' + act + ' attacks of opportunity: ' + JSON.stringify(aoo));
      const kinds = Object.keys(used);
      t.ok((used.ell_thorn_whip || 0) + (used.ell_chomp || 0) > 0, 'act ' + act + ': Ellaria attacks');
      t.ok(used.ell_corgi_bite > 0, 'act ' + act + ': corgis bite');
      t.ok(kinds.filter(function (k) { return POOL.indexOf(k) >= 0; }).length >= 3, 'act ' + act + ': at least 3 different pool skills used (' + kinds.join(', ') + ')');
    });
  });

  // ---- v2 requests (user, Nov 3): heals on the downed, barrels, flyers --------------------------------------------
  T.suite('hero_ellaria: v2 requests — a Good Boy treat gets the downed up, barrels (not for Fetch!), flyers over Brambles', function (t) {
    // 1. Who's a Good Boy? aimed at a downed ally: up with the treat's HP (preview "UP! N HP"), then Empowered
    [3, 5, 6].forEach(function (heal, i) {
      const lv = i + 1;
      quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: [{ id: 'ell_good_boy', level: lv }] }, { id: 'test_knight', x: 4, y: 4 }], enemies: [E(8, 8)] });
      clearCorgis();
      const e = ell(), k = heroOf('test_knight');
      A().kill(k, null);
      t.ok(k.downed, 'L' + lv + ': knight down');
      const tg = DD.Targeting.validTargets(e, slotOf(e, 'ell_good_boy')).filter(function (q) { return q.x === 4 && q.y === 4; })[0];
      t.ok(!!tg && tg.revive === true, 'L' + lv + ': the downed knight is a target (revive)');
      const pv = DD.Combat.preview(e, slotOf(e, 'ell_good_boy'), 4, 4);
      const pe = pv.perUnit[k.id];
      t.ok(!!pe && pe.revived && pe.heal === heal && pe.text.indexOf('UP! ' + heal + ' HP') >= 0 && pe.statuses.indexOf('empowered') >= 0,
        'L' + lv + ': preview "UP! ' + heal + ' HP" and Empowered (' + (pe && pe.text) + ')');
      t.ok(use(e, 'ell_good_boy', 4, 4), 'L' + lv + ': treat thrown at the downed knight');
      t.ok(!k.downed && k.hp === heal && k.ap === 0 && has(k, 'empowered'), 'L' + lv + ': up at ' + heal + ' HP, 0 AP, Empowered (' + k.hp + ')');
      t.ok(e.ap === 2, 'L' + lv + ': 1 AP');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && k.ap === 3, 'L' + lv + ': the knight acts on his own slot with full AP');
    });
    // Healing Spring is an area heal: it never gets anyone up (the downed ally in it stays down, the standing one heals)
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_spring'] }, { id: 'test_knight', x: 3, y: 4 }, { id: 'test_mage', x: 4, y: 3 }], enemies: [E(8, 8)] });
    clearCorgis();
    A().kill(heroOf('test_knight'), null);
    heroOf('test_mage').hp = 10;
    t.ok(use(ell(), 'ell_spring', 4, 4), 'Healing Spring next to a downed knight');
    t.ok(heroOf('test_knight').downed && heroOf('test_mage').hp === 15, 'area heal: the downed knight stays down, the mage heals 5');

    // 2. barrels: Thorn Whip and a corgi's Bite set one off; Fetch! is never aimed at one (no corgi dash, no drag)
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_fetch'] }], enemies: [E(5, 5), E(8, 8)], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
    clearCorgis();
    let e = ell();
    addCorgi(e, 2, 6);
    t.eq(DD.Combat.canUse(e, slotOf(e, 'ell_fetch')), true, 'Fetch! is ready (a corgi stands by)');
    t.ok(!DD.Targeting.validTargets(e, slotOf(e, 'ell_fetch')).some(function (q) { return q.obj; }), 'Fetch! never targets a barrel (target.objects: false)');
    t.ok(DD.Targeting.validTargets(e, e.basic).some(function (q) { return q.obj && q.x === 4 && q.y === 4; }), 'Thorn Whip can be aimed at the barrel 3 tiles away');
    const pv = DD.Combat.preview(e, e.basic, 4, 4);
    t.ok(pv.detonates === 'barrel_explosive' && pv.perUnit[at(5, 5).id] === undefined, 'preview: it detonates (the diagonal foe is outside radius 1)');
    t.ok(use(e, 'basic', 4, 4) && !tile(4, 4).obj && e.ap === 2 && e.x === 1, 'whipped barrel: KABOOM, 1 AP, nothing pulled');
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4 }], enemies: [E(5, 5), E(8, 8)], objects: [{ x: 4, y: 5, id: 'barrel_explosive' }] });
    clearCorgis();
    e = ell();
    const pup = addCorgi(e, 3, 5);
    t.ok(DD.Combat.useSkill(pup, slotOf(pup, 'ell_corgi_bite'), 4, 5), 'a corgi bites the barrel');
    t.ok(!tile(4, 5).obj && at(5, 5).hp === 6 && pup.hp === pup.maxHp - 8, 'the barrel blows: 8 to the foe beside it and 8 to the very good, very brave corgi');

    // 3. flyers: Brambles are a floor effect (a flying foe pushed or flying through is not pricked, sees no hazard),
    // but the cast itself catches a flyer standing in the area
    quiet({ heroes: [{ id: 'ellaria', x: 1, y: 4, skills: ['ell_roots'] }], enemies: [E(4, 4), E(8, 2), E(8, 8)] });
    clearCorgis();
    e = ell();
    const fl = at(4, 4), fl2 = at(8, 2);
    fl.flags = Object.assign({}, fl.flags, { flying: true });   // test setup: flying foes
    fl2.flags = Object.assign({}, fl2.flags, { flying: true });
    t.ok(use(e, 'ell_roots', 4, 4), 'Entangling Roots on a flyer');
    t.ok(fl.hp === 11 && has(fl, 'root'), 'caught by the cast: 3 damage and Rooted (the spell is aimed at it)');
    t.eq(DD.Grid.hazardAt(4, 3, fl2) + '/' + DD.Grid.hazardAt(4, 3, at(8, 8)), 'null/ell_bramble', 'the patch is no hazard for a flyer, still one for a walker');
    A().moveAlong(fl2, [{ x: 7, y: 2 }, { x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 3 }]);
    t.ok(fl2.x === 4 && fl2.y === 3 && fl2.hp === 14 && !has(fl2, 'root'), 'a flyer flies into the brambles untouched (' + fl2.x + ',' + fl2.y + ' ' + fl2.hp + ')');
    t.ok(A().teleport(at(8, 8), 5, 4) && at(5, 4).hp === 11 && has(at(5, 4), 'root'), 'a walker entering is still pricked and Rooted');
  });
})();
