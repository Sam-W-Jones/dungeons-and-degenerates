/* Dungeons and Degenerates — tests/content/hero_josiah.js
 * Suites 'hero_josiah: …' for js/data/heroes/josiah.js (v2: initiative turns, no telegraphs, no Guard, one-verb skills,
 * attacks of opportunity): registration (the v2 hero def and a simple kit), the passive (his raven, contagious Poison,
 * the extra pocket), every skill at every level in DD.Combat.sandbox fights (numbers == desc, statuses lasting exactly
 * their owners' turns), the raven, the items, the signature, combos with other heroes (fixture knight / mage), HUD
 * previews == reality, v2 edge cases, attacks of opportunity (his reach-2 cane never makes them, the raven's Peck does,
 * dives and blasts never provoke) and AutoPlay battles with ['josiah', 'test_knight', 'test_cleric', 'test_mage']
 * against the fixture encounters of acts 1-3 at L1/3/5.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const POOL = ['jos_plague_flask', 'jos_draught', 'jos_raven_dive', 'jos_leeches', 'jos_miasma', 'jos_quarantine', 'jos_vaccinate',
    'jos_volatile', 'jos_murder', 'jos_salts'];
  const ALL_SKILLS = POOL.concat(['jos_cane', 'jos_pandemic', 'jos_peck', 'jos_omen']);
  const ITEMS = ['jos_beak_mask', 'jos_raven_treats', 'jos_alembic', 'jos_plague_bell'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const OTHERS = /Zarathor|Syllamin|Marbles|Marwyn|Ellaria|corgi|Sparrow|Corelos|Slate|Buga|Kiri|Betty|Basanos|Valdris|Hjalmar|Pebbles/;
  /** Words of the v1 rules (telegraphs, intents, Guard, XP) that no Josiah text may use any more. */
  const V1_WORDS = /telegraph|intent|\bguard\b|\bXP\b|planning|this round only/i;
  const CLOUD = [[4, 4], [3, 4], [5, 4], [4, 3], [4, 5]];

  // ---- helpers ----------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function S() { return DD.Combat.state; }
  function loaded(t) {
    if (DD.getHero('josiah') && DD.getSkill('jos_cane') && DD.getHero('test_knight') && DD.getHero('test_mage')) return true;
    t.skip('josiah (or the test fixtures) not loaded');
    return false;
  }
  function jos() { return S().units.filter(function (u) { return u.defId === 'josiah' && !u.dead; })[0]; }
  function raven(owner) {
    owner = owner || jos();
    return S().units.filter(function (u) { return !u.dead && !u.downed && u.defId === 'jos_raven' && u.ownerId === owner.id; })[0] || null;
  }
  function ravens() { return S().units.filter(function (u) { return !u.dead && u.defId === 'jos_raven'; }); }
  function unitOf(defId) { return S().units.filter(function (u) { return u.defId === defId && !u.dead; })[0] || null; }
  function knight() { return unitOf('test_knight'); }
  function mage() { return unitOf('test_mage'); }
  function stacks(u, id) { const s = A().getStatus(u, id); return s ? s.stacks : 0; }
  function turnsOf(u, id) { const s = A().getStatus(u, id); return s ? s.turns : 0; }
  function has(u, id) { return A().hasStatus(u, id); }
  function surf(x, y) { const tl = DD.Grid.tile(x, y); return tl && tl.surface ? tl.surface.id : null; }
  function seedOf(t, k) { return DD.util.hash(String(t.seed) + ':jos:' + k) % 1000000 + 1; }
  function foes() { return DD.Combat.enemies(); }
  function snapHp() { const o = {}; S().units.forEach(function (u) { if (!u.dead) o[u.id] = u.hp; }); return o; }
  function hpDiff(before) { const o = {}; S().units.forEach(function (u) { if (before[u.id] !== undefined) o[u.id] = before[u.id] - u.hp; }); return o; }
  function allTexts(h) {
    const out = [h.blurb, h.role, h.passive.desc];
    ALL_SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      for (let lv = 1; lv <= s.levels.length; lv++) out.push(DD.skillDesc(s, lv, null));
      out.push(s.flavor);
    });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); out.push(it.desc, it.flavor); });
    out.push(DD.getStatus('jos_vaccinated').desc({ turns: 1, stacks: 1 }), DD.getSurface('jos_miasma').desc, DD.getSummon('jos_raven').desc);
    Object.keys(h.barks).forEach(function (k) { Array.prototype.push.apply(out, h.barks[k]); });
    return out;
  }

  /**
   * Sandbox that never ends on its own. Josiah first at (1,4) unless cfg.heroes; heroes act in the listed order, then the
   * enemies (initiative 'heroesFirst'), so it is Josiah's turn, round 1. Enemies never act unless cfg.ai (then from
   * round 1 on). cfg: heroes | allies, enemies, terrain, objects, surfaces, items, level, run, objective, order,
   * ravenAt ({x,y} to move the raven there, null to remove it).
   */
  function fight(cfg) {
    cfg = cfg || {};
    const heroes = cfg.heroes || [{ id: 'josiah', x: 1, y: 4, level: cfg.level || 1, items: cfg.items || [] }].concat(cfg.allies || []);
    DD.Combat.sandbox({
      w: cfg.w || 9, h: cfg.h || 9, seed: cfg.seed || 7, enemyAi: cfg.ai ? undefined : false,
      objective: cfg.objective || { type: 'custom' },
      encounter: cfg.objective ? null : { id: 'jos_test', checkObjective: function () { return null; } },
      heroes: heroes, enemies: cfg.enemies || [], objects: cfg.objects, surfaces: cfg.surfaces, terrain: cfg.terrain, run: cfg.run,
      order: cfg.order,
    });
    const j = jos();
    const r = j ? raven(j) : null;
    if (r && cfg.ravenAt === null) A().kill(r, null, { force: true });
    else if (r && cfg.ravenAt) A().teleport(r, cfg.ravenAt.x, cfg.ravenAt.y, { fx: false, noEnter: true });
    if (j && DD.Combat.isTurnOf(j)) j.ap = 10;
    return j;
  }
  /** Socket a skill at a level (basic / signature / summon slots are reused). */
  function give(u, id, level) {
    if (u.basic && u.basic.id === id) { u.basic.level = level || 1; return u.basic; }
    if (u.signature && u.signature.id === id) { u.signature.level = level || 1; return u.signature; }
    if (u.kind === 'summon') { const sl = u.skills.filter(function (x) { return x.id === id; })[0]; sl.level = level || 1; return sl; }
    const slot = A().makeSlot(id, level || 1);
    u.skills = [slot];
    return slot;
  }
  /** Use a skill (it must be usable and the target valid); returns the AP spent, or -1 when the use was refused. */
  function cast(t, u, id, level, x, y, label) {
    const slot = give(u, id, level);
    const ap0 = u.ap;
    const why = DD.Combat.canUse(u, slot);
    if (why !== true) { t.fail((label || id) + ': canUse said ' + JSON.stringify(why)); return -1; }
    const ok = DD.Combat.useSkill(u, slot, x, y);
    t.ok(ok, (label || id + ' L' + level) + ' used at ' + x + ',' + y);
    return ok ? ap0 - u.ap : -1;
  }

  // ---- registration ---------------------------------------------------------------------------------------
  T.suite('hero_josiah: registration (v2 hero def, one-verb kit, barks, raven, items, statuses)', function (t) {
    if (!loaded(t)) return;
    const h = DD.getHero('josiah');
    t.eq(h.name, 'Josiah', 'name');
    ['epithet', 'race', 'cls', 'role', 'blurb'].forEach(function (k) { t.ok(typeof h[k] === 'string' && h[k].length > 2, 'hero.' + k); });
    const sentences = h.blurb.split(/[.!?](\s|$)/).filter(function (s) { return s && s.trim().length > 3; }).length;
    t.ok(sentences >= 2 && sentences <= 3, 'blurb has 2-3 sentences (' + sentences + ')');
    t.ok(h.complexity >= 1 && h.complexity <= 3, 'complexity 1-3');
    t.ok(/^#[0-9a-f]{6}$/i.test(h.color), 'UI colour');
    t.eq(h.unlock, null, 'v2: available from the start (unlock: null)');
    t.eq(h.stats.init, 0, 'v2: initiative modifier 0 (stats.init)');
    t.eq(JSON.stringify(h.flags), '{"noOpportunity":true}', 'v2: he never makes attacks of opportunity (flags.noOpportunity)');
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov >= 3 && h.stats.mov <= 5 && !h.stats.block, 'L1 stats in the DESIGN range, no starting Block');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth +3-5 HP');
    t.eq(h.consumableSlots, 1, 'consumableSlots: 1 (read by DD.Run)');
    t.eq(h.basic, 'jos_cane', 'basic');
    t.eq(h.signature, 'jos_pandemic', 'signature');
    const basic = DD.getSkill('jos_cane'), sig = DD.getSkill('jos_pandemic');
    t.ok(basic.ap === 1 && basic.levels[0].dmg >= 4 && basic.levels[0].dmg <= 6, 'basic: 1 AP, 4-6 damage');
    // tooltips list the tags ("Basic attack · Melee" would promise a line-holder): his reach-2 cane is tagged 'reach'
    t.ok(basic.tags.indexOf('melee') < 0 && basic.tags.indexOf('reach') >= 0, 'v2: House Call is tagged reach, not melee (' + basic.tags.join(',') + ')');
    t.eq(sig.hype, 100, 'signature costs 100 Hype');
    t.ok(sig.levels[0].dmg + sig.levels[0].poison * (sig.levels[0].poison + 1) / 2 >= 15, 'signature: 15+ damage with its Poison');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['jos_plague_flask', 'jos_draught']), 'two starting skills');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'skill pool');
    t.ok(h.skillPool.length >= 8 && h.skillPool.length <= 10, 'v2: a pool of 8-10 skills (' + h.skillPool.length + ')');
    t.ok(!DD.getSkill('jos_tonic'), 'v2: Untested Tonic (AP + Inspired + a Poison side effect) was cut');
    t.eq(JSON.stringify(h.summons), JSON.stringify(['jos_raven']), 'summons listed');
    // the passive: one rule (contagion), his raven and the extra pocket; nothing hidden in its hooks
    t.eq(h.passive.name, 'Unlicensed Apothecary', 'passive name');
    t.ok(/raven/i.test(h.passive.desc) && /contagious/i.test(h.passive.desc) && /\+1 consumable slot/.test(h.passive.desc), 'passive text: raven, contagion, +1 slot');
    t.eq(Object.keys(h.passive.hooks).join(','), 'onCombatStart', 'passive hooks: onCombatStart only (v2: no brewing, no damage riders)');
    t.ok(h.passive.desc.split(/\s+/).length <= 26, 'passive reads in one breath (' + h.passive.desc.split(/\s+/).length + ' words)');

    // skills: ids, owners, 3 levels, exact + different descs, short descs, emoji icons, AP mix, big skills
    const aps = {};
    ALL_SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      if (!t.ok(!!s, 'skill ' + id + ' registered')) return;
      t.ok(/^jos_/.test(id), id + ': jos_ prefix');
      t.ok(s.icon && !/[A-Za-z0-9]/.test(s.icon) && Array.from(s.icon).length <= 3, id + ': one emoji icon (' + s.icon + ')');
      t.ok(s.flavor && s.flavor.length <= 120, id + ': flavor ≤ 120 chars');
      if (POOL.indexOf(id) >= 0) {
        t.eq(s.owner, 'josiah', id + ': owner');
        t.eq(s.levels.length, 3, id + ': three levels');
        aps[s.ap] = (aps[s.ap] || 0) + 1;
        // II = bigger numbers, III = bigger numbers or ONE added rider: never more than one new key per level
        for (let lv = 2; lv <= 3; lv++) {
          const added = Object.keys(s.levels[lv - 1]).filter(function (k) { return !(k in s.levels[lv - 2]); });
          t.ok(added.length <= (lv === 3 ? 1 : 0), id + ' L' + lv + ': at most ' + (lv === 3 ? 'one added rider' : 'bigger numbers') + ' (' + added.join(',') + ')');
        }
      }
      const seen = {};
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = DD.skillDesc(s, lv, null);
        t.ok(d && !/undefined|NaN|\[object/.test(d), id + ' L' + lv + ' desc with no user');
        const words = d.split(/\s+/).length;
        t.ok(words <= 24, id + ' L' + lv + ': reads in one breath (' + words + ' words): ' + d);
        const L = s.levels[lv - 1];
        ['dmg', 'sick', 'heal', 'poison', 'mark', 'pct', 'push', 'root', 'vuln', 'turns', 'block'].forEach(function (k) {
          if (typeof L[k] === 'number' && L[k] > 0) t.ok(new RegExp('(^|[^0-9])' + L[k] + '(?![0-9])').test(d), id + ' L' + lv + ' desc shows ' + k + ' ' + L[k] + ': ' + d);
        });
        t.ok(!seen[d], id + ' L' + lv + ' desc differs from the previous levels');
        seen[d] = 1;
      }
    });
    t.ok(aps[1] && aps[2] && aps[3], 'AP mix of 1, 2 and 3 (' + JSON.stringify(aps) + ')');
    t.eq(DD.getSkill('jos_salts').charges, 1, 'Smelling Salts: once per combat');
    t.ok(DD.getSkill('jos_murder').cooldown >= 3 && DD.getSkill('jos_murder').ap === 3, 'Murder of Crows: the big 3 AP skill');
    allTexts(h).forEach(function (s) { if (V1_WORDS.test(s)) t.fail('v1 rules text left over: ' + JSON.stringify(s)); });

    // barks
    BARK_KEYS.forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ': 4-6 lines (' + lines.length + ')');
    });
    let cameo = 0;
    Object.keys(h.barks).forEach(function (k) {
      h.barks[k].forEach(function (b) {
        t.ok(typeof b === 'string' && b.length > 0 && b.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(b));
        if (OTHERS.test(b)) cameo++;
      });
    });
    t.ok(cameo >= 10, 'barks name other heroes now and then (' + cameo + ')');
    ['Valdris', 'Hjalmar', 'Pebbles'].forEach(function (n) {
      t.ok(Object.keys(h.barks).some(function (k) { return h.barks[k].some(function (b) { return b.indexOf(n) >= 0; }); }), 'a cameo for the new recruit ' + n);
    });
    // pronouns (the user's list: she/her for Ellaria, Sparrow and Kiri, he/him for everyone else): no line pairs a
    // name with the other set
    const HE = /Zarathor|Syllamin|Marbles|Marwyn|Josiah|Corelos|Slate|Buga|Betty|Basanos|Valdris|Hjalmar|Pebbles/, SHE = /Ellaria|Sparrow|Kiri/;
    allTexts(h).forEach(function (s) {
      if (HE.test(s) && !SHE.test(s) && /\b(she|her|hers|herself)\b/i.test(s)) t.fail('pronouns: ' + JSON.stringify(s));
      if (SHE.test(s) && !HE.test(s) && /\b(he|him|his|himself)\b/i.test(s)) t.fail('pronouns: ' + JSON.stringify(s));
    });
    t.ok(Array.isArray(h.barks.raven_down) && h.barks.raven_down.length >= 3, 'raven_down barks');

    // the raven
    const rv = DD.getSummon('jos_raven');
    t.ok(rv && rv.flags.flying && rv.sprite.base === 'flyer' && rv.sprite.shape.body === 'bird' && rv.ap === 2 && rv.hp === 10, 'raven: a 10 HP, 2 AP flying bird');
    t.eq(JSON.stringify(rv.skills), JSON.stringify(['jos_peck', 'jos_omen']), 'raven skills Peck + Ill Omen');
    t.ok(DD.getSkill('jos_peck').owner === 'summon' && DD.getSkill('jos_omen').owner === 'summon', 'raven skills owned by summon');
    // user request (Nov 3): Josiah's raven is always Onyx; one name keeps the summon's one RNG draw (seeded fights unchanged)
    t.eq(JSON.stringify(rv.names), '["Onyx"]', 'the raven is always called Onyx');
    t.eq(rv.name, 'Raven', 'its title stays Raven (the HUD shows "Onyx (Raven)")');
    t.eq(Object.keys(rv.hooks || {}).join(','), 'onDeath', 'raven hooks: only its owner\'s grief');

    // items, status, surface
    const items = ITEMS.map(DD.getItem);
    t.ok(items.every(function (it) { return it && it.hero === 'josiah' && !(it.stats && it.stats.block); }), 'four Josiah items, no starting Block');
    t.eq(items.map(function (it) { return it.slot; }).join(','), 'armor,trinket,trinket,weapon', 'item slots');
    t.eq(items.map(function (it) { return it.rarity; }).join(','), 'rare,rare,rare,legendary', 'item rarities');
    t.eq(Object.keys(DD.getItem('jos_alembic').hooks).join(','), 'onCombatEnd', 'the Alembic brews after fights');
    ['jos_beak_mask', 'jos_raven_treats', 'jos_plague_bell'].forEach(function (id) { t.eq(Object.keys(DD.getItem(id).hooks || {}).length, 0, id + ': no hooks of its own (one plain effect)'); });
    const vac = DD.getStatus('jos_vaccinated');
    t.ok(vac && vac.type === 'buff' && (vac.decay || 'turnEnd') === 'turnEnd' && vac.defaultTurns === 1 && typeof vac.hooks.modifyStatus === 'function', 'status jos_vaccinated: a buff counted in its owner\'s turns');
    const mi = DD.getSurface('jos_miasma');
    t.ok(mi && !mi.blocksLos && mi.airborne && typeof mi.draw === 'function' && typeof mi.drawVolume === 'function' && mi.react.fire.spread, 'surface jos_miasma: flammable, airborne, does not block sight');
    t.ok(typeof mi.hazard === 'function' && mi.hazard(null, null) === true && !mi.onTurnEnd, 'surface jos_miasma: a hazard for its brewer\'s foes, no end-of-turn dose');

    // every id this file registers is jos_-prefixed
    ['skills', 'statuses', 'items', 'summons', 'surfaces', 'objects', 'consumables', 'enemies'].forEach(function (kind) {
      Object.keys(DD.defs[kind]).forEach(function (id) { if (/^jos/.test(id)) t.ok(/^jos_/.test(id), kind + ' ' + id + ' prefixed jos_'); });
    });

    // sprite + portrait
    const sp = h.sprite;
    t.ok(sp.head.face === 'plague_mask' && sp.head.hat === 'plague' && sp.outfit === 'coat' && sp.offhand === 'flask' &&
      sp.aura.kind === 'smoke' && typeof sp.overlay === 'function', 'sprite: plague mask, plague hat, coat, flask, smoke');
    if (T.contentHelpers && T.contentHelpers.spriteProblems) {
      t.eq(T.contentHelpers.spriteProblems(sp).length, 0, 'hero SpriteSpec valid');
      t.eq(T.contentHelpers.spriteProblems(rv.sprite).length, 0, 'raven SpriteSpec valid');
    }
    if (DD.Sprites && DD.Sprites.portrait) {
      const cv = DD.Sprites.portrait('josiah', 64);
      t.ok(cv && cv.width > 0, 'portrait canvas');
      if (cv && cv.getContext) {
        const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let lit = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
        t.ok(lit > 500, 'portrait has pixels (' + lit + ')');
      }
      const m = DD.Sprites.metrics('josiah');
      t.ok(m.height >= 36 && m.height <= 48, 'about 40 px tall at zoom 1 (' + Math.round(m.height) + ')');
    }
  });

  // ---- passive -----------------------------------------------------------------------------------------
  T.suite('hero_josiah: passive — his raven, contagious Poison, the extra pocket', function (t) {
    if (!loaded(t)) return;
    // the raven at the start, scaling with Josiah's level; it has no turn of its own: it acts on his
    [[1, 1, 10], [3, 1, 12], [4, 2, 13], [5, 2, 14], [7, 3, 16], [10, 3, 19]].forEach(function (c) {
      const j = fight({ level: c[0], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
      const r = raven(j);
      if (!t.ok(!!r, 'L' + c[0] + ': raven summoned at combat start')) return;
      t.eq(DD.Grid.dist(r, j), 1, 'L' + c[0] + ': it starts next to Josiah');
      t.eq(r.kind + '/' + r.side, 'summon/hero', 'player-side summon');
      t.ok(r.flags.flying, 'flying');
      t.eq(r.skills.map(function (s) { return s.level; }).join(','), c[1] + ',' + c[1], 'L' + c[0] + ': raven skills at level ' + c[1]);
      t.eq(r.maxHp, c[2], 'L' + c[0] + ': raven max HP ' + c[2]);
      t.eq(r.name, 'Onyx', 'L' + c[0] + ': the raven is Onyx');
      t.ok(!DD.Combat.order().some(function (e) { return e.unitId === r.id; }), 'L' + c[0] + ': no initiative entry of its own');
      t.ok(DD.Combat.isTurnOf(r) && r.ap === 2, 'L' + c[0] + ': on Josiah\'s turn the raven has its 2 AP');
      t.eq(S().rules.filter(function (x) { return x.id === 'jos_contagion'; }).length, 1, 'Contagion rule active');
    });
    // the raven acts on Josiah's turn only
    let j = fight({ allies: [{ id: 'test_knight', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 2, y: 3 }] });
    let r = raven(j);
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === knight(), 'the knight\'s turn');
    t.ok(r.ap === 0 && /^Not .+'s turn\.$/.test(String(DD.Combat.canUse(r, give(r, 'jos_peck', 1)))), 'the raven waits for Josiah\'s turn (' + DD.Combat.canUse(r, give(r, 'jos_peck', 1)) + ')');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === j && S().round === 2 && r.ap === 2, 'round 2, Josiah\'s turn: the raven has 2 AP again');
    // two Josiahs: two ravens, one Contagion rule
    fight({ heroes: [{ id: 'josiah', x: 1, y: 2 }, { id: 'josiah', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    t.eq(ravens().length, 2, 'every Josiah brings his own raven');
    t.eq(S().rules.filter(function (x) { return x.id === 'jos_contagion'; }).length, 1, 'only one Contagion rule');

    // contagion: a Poisoned foe dies -> adjacent foes catch its stacks; others and allies don't
    j = fight({ enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 5, y: 5 }, { id: 'test_grunt', x: 7, y: 7 }],
      ravenAt: { x: 5, y: 3 } });
    let f = foes();
    A().addStatus(f[0], 'poison', { stacks: 3 }, j);
    A().kill(f[0], j);
    t.ok(f[0].dead, 'patient zero dies');
    t.eq(stacks(f[1], 'poison'), 3, 'east neighbour catches Poison 3');
    t.eq(stacks(f[2], 'poison'), 3, 'south neighbour catches Poison 3');
    t.eq(stacks(f[3], 'poison'), 0, 'a far foe is fine');
    t.eq(stacks(raven(j), 'poison'), 0, 'the adjacent raven (an ally) is not infected');
    t.ok(S().log.some(function (l) { return /The plague spreads from/.test(l.text); }), 'logged');
    A().addStatus(f[1], 'poison', { stacks: 2 }, j);
    A().kill(f[3], j);
    t.eq(stacks(f[1], 'poison'), 5, 'Poison stacks add up; a foe without Poison spreads nothing');
    A().kill(f[1], j);
    t.eq(stacks(f[2], 'poison'), 3, 'diagonal is not adjacent: unchanged');
    // Josiah down: no contagion
    j = fight({ enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }], allies: [{ id: 'test_knight', x: 1, y: 6 }] });
    f = foes();
    A().addStatus(f[0], 'poison', { stacks: 3 }, j);
    A().kill(j, null);
    t.ok(j.downed, 'Josiah is downed');
    A().kill(f[0], null);
    t.eq(stacks(f[1], 'poison'), 0, 'no contagion while Josiah is down');
    // v2 chain reaction: every foe ticks at its OWN turn start: the tick that kills patient zero infects the next foe
    // in the order before that foe's own tick
    j = fight({ enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }], ravenAt: null });
    f = foes();
    f[0].hp = 2;
    A().addStatus(f[0], 'poison', { stacks: 3 }, j);
    DD.Combat.endTurn();
    t.ok(f[0].dead, 'the Poison tick kills patient zero at its turn start');
    t.eq(f[1].hp, 14 - 3, 'its neighbour caught Poison 3 and ticked at its own turn start');
    t.eq(stacks(f[1], 'poison'), 2, 'then Poison −1');
    // the payoff is shared: an ally's kill spreads the Poison just the same
    j = fight({ allies: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: null });
    f = foes();
    f[0].hp = 3;
    A().addStatus(f[0], 'poison', { stacks: 4 }, j);
    DD.Combat.endTurn();
    const k = knight();
    t.ok(DD.Combat.current() === k, 'the knight\'s turn');
    t.ok(DD.Combat.useSkill(k, k.basic, 4, 4), 'the knight finishes the Poisoned grunt');
    t.ok(f[0].dead && stacks(f[1], 'poison') === 4, 'its neighbour catches all 4 stacks (' + stacks(f[1], 'poison') + ')');

    // the extra pocket: +1 consumable slot with Josiah in the party (DD.Run)
    if (DD.Run && typeof DD.Run.newRun === 'function') {
      try {
        DD.Run.newRun(['test_knight', 'test_cleric', 'test_mage'], 'normal', 99);
        t.eq(DD.Run.state.maxConsumables, 3, 'party without Josiah: 3 consumable slots');
        DD.Run.newRun(['josiah', 'test_knight', 'test_cleric', 'test_mage'], 'normal', 99);
        t.eq(DD.Run.state.maxConsumables, 4, 'party with Josiah: 4 consumable slots');
      } finally { DD.Run.clear(); }
    }
  });

  // ---- items -----------------------------------------------------------------------------------------------
  T.suite('hero_josiah: items — Beak Mask, Raven Treats, Portable Alembic, Plague Bell', function (t) {
    if (!loaded(t)) return;
    // Herb-Stuffed Beak Mask: +4 HP and +1 stack on every Poison he applies (skills and contagion) — nothing else
    let j = fight({ items: ['jos_beak_mask'], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: null });
    t.eq(j.maxHp, 26 + 4, 'Beak: +4 max HP');
    let f = foes();
    cast(t, j, 'jos_plague_flask', 1, 4, 4, 'Beak flask');
    t.eq(stacks(f[0], 'poison') + '/' + stacks(f[1], 'poison'), '4/4', 'Beak: Plague Flask Poisons 3 + 1');
    t.ok(/Poisoned 4/.test(DD.skillDesc(DD.getSkill('jos_plague_flask'), 1, j)), 'Beak: the flask desc shows Poisoned 4');
    t.ok(/Poisoned 3/.test(DD.skillDesc(DD.getSkill('jos_miasma'), 1, j)) && /Poisoned 5/.test(DD.skillDesc(DD.getSkill('jos_pandemic'), 1, j)), 'Beak: Miasma and Pandemic descs show +1');
    A().kill(f[0], null);
    t.eq(stacks(f[1], 'poison'), 4 + 5, 'Beak: the contagion spreads 4 + 1 on top of its own 4');
    t.ok(!!A().addStatus(j, 'poison', { stacks: 2 }, f[1]), 'Beak: it does not make him immune (one effect only)');

    // Suspicious Raven Treats: double max HP for his raven (on top of the level scaling); Peck unchanged
    [[1, 20], [4, 26], [10, 38]].forEach(function (c) {
      fight({ level: c[0], items: ['jos_raven_treats'], enemies: [{ id: 'test_grunt', x: 7, y: 7 }] });
      t.eq(raven(jos()).maxHp, c[1], 'Treats at L' + c[0] + ': raven ' + c[1] / 2 + ' × 2 = ' + c[1] + ' HP');
    });
    j = fight({ items: ['jos_raven_treats'], enemies: [{ id: 'test_grunt', x: 2, y: 3 }] });
    t.ok(DD.Combat.useSkill(raven(j), give(raven(j), 'jos_peck', 1), 2, 3), 'treated raven pecks');
    t.eq(foes()[0].hp, 14 - 2, 'Treats: Peck still 2');

    // Portable Alembic: after a won fight, 50% to brew a random potion into the party's bag (only with the Alembic)
    function won(seed, run, items) {
      const jj = fight({ seed: seed, run: run, items: items, objective: { type: 'killAll' }, enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
      A().kill(foes()[0], jj);
      return S();
    }
    let brewed = 0, dry = 0, plain = 0;
    const liquid = Object.keys(DD.defs.consumables).filter(function (k) {
      const c = DD.getConsumable(k);
      return k.indexOf('test_') !== 0 && /potion|draught|drink|flask|tonic|elixir|brew|antidote|water|jar|juice|courage|tea|philt|vial|bottle|soda|ale/i.test(k + ' ' + c.name);
    });
    for (let i = 0; i < 24; i++) {
      const run = { gold: 0, consumables: [], maxConsumables: 4, difficulty: 'normal' };
      const s = won(seedOf(t, 'brew' + i), run, ['jos_alembic']);
      t.eq(s.result, 'victory', 'won fight ' + i);
      if (run.consumables.length) {
        brewed++;
        t.ok(!!DD.getConsumable(run.consumables[0]), 'brewed a registered consumable (' + run.consumables[0] + ')');
        if (liquid.length) t.ok(liquid.indexOf(run.consumables[0]) >= 0, 'brewed something liquid (' + run.consumables[0] + ')');
      } else dry++;
      const runB = { gold: 0, consumables: [], maxConsumables: 4 };
      won(seedOf(t, 'brew' + i), runB, []);
      plain += runB.consumables.length;
    }
    t.log('the Alembic brewed after ' + brewed + '/24 victories');
    t.ok(brewed >= 4 && dry >= 4, 'about half the victories brew (' + brewed + '/24)');
    t.eq(plain, 0, 'without the Alembic Josiah brews nothing (v2: the passive no longer does)');
    let brewedFull = 0, brewedLoss = 0, brewedDown = 0;
    for (let i = 0; i < 8; i++) {
      const runB = { gold: 0, consumables: ['test_potion', 'test_potion', 'test_potion', 'test_potion'], maxConsumables: 4 };
      won(seedOf(t, 'full' + i), runB, ['jos_alembic']);
      brewedFull += runB.consumables.length - 4;
      const runC = { gold: 0, consumables: [], maxConsumables: 4 };
      fight({ seed: seedOf(t, 'loss' + i), run: runC, items: ['jos_alembic'], objective: { type: 'killAll' }, enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
      A().kill(jos(), null);
      t.eq(S().result, 'defeat', 'defeat');
      brewedLoss += runC.consumables.length;
      const runD = { gold: 0, consumables: [], maxConsumables: 4 };
      const jd = fight({ seed: seedOf(t, 'brew' + i), run: runD, items: ['jos_alembic'], objective: { type: 'killAll' }, enemies: [{ id: 'test_grunt', x: 6, y: 4 }],
        allies: [{ id: 'test_knight', x: 1, y: 6 }] });
      A().kill(jd, null);
      A().kill(foes()[0], null);
      brewedDown += runD.consumables.length;
    }
    t.eq(brewedFull, 0, 'no brewing into a full bag');
    t.ok(/50% chance .*\(if the bag has room\)\.$/.test(DD.getItem('jos_alembic').desc), 'the Alembic desc says 50% and "if the bag has room"');
    t.eq(brewedLoss, 0, 'no brewing after a defeat');
    t.ok(brewedDown > 0, 'the Alembic brews after a won fight even while Josiah is down (' + brewedDown + '/8)');
    t.eq((won(seedOf(t, 'norun'), null, ['jos_alembic']).consumables || []).length, 0, 'sandbox fight without a run: nothing brewed');
    if (DD.Run && typeof DD.Run.newRun === 'function') {
      try {
        DD.Run.newRun(['josiah', 'test_knight', 'test_cleric', 'test_mage'], 'normal', 99);
        let got = null;
        for (let i = 0; i < 12 && !got; i++) {
          DD.Run.state.consumables = [];
          won(seedOf(t, 'live' + i), DD.Run.state, ['jos_alembic']);
          got = DD.Run.state.consumables[0] || null;
        }
        t.ok(!!got && !!DD.getConsumable(got), 'a brew lands in the live run inventory (' + got + ')');
        t.ok(S().log.some(function (l) { return /brews/.test(l.text); }), 'the brew is logged');
      } finally { DD.Run.clear(); }
    }

    // The Plague Bell: +10% damage and the contagion reaches every foe within 2 tiles (no Hype any more: one effect)
    j = fight({ items: ['jos_plague_bell'], ravenAt: null, enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 7, y: 4 }, { id: 'test_grunt', x: 6, y: 5 },
      { id: 'test_grunt', x: 8, y: 4 }, { id: 'test_grunt', x: 5, y: 7 }] });
    t.ok(Math.abs(j.dmgBonus - 0.1) < 1e-9, 'Bell: +10% damage');
    t.ok(/within 2 tiles/.test(S().rules.filter(function (x) { return x.id === 'jos_contagion'; })[0].desc), 'Bell: the Contagion chip says "within 2 tiles"');
    f = foes();
    A().addStatus(f[0], 'poison', { stacks: 3 }, j);
    A().kill(f[0], null);
    t.eq([1, 2, 3, 4].map(function (i) { return stacks(f[i], 'poison'); }).join(','), '3,3,0,0', 'Bell: foes 2 tiles away (straight or diagonal) catch it; 3 tiles away do not');
    t.eq(S().hype, 0, 'Bell: no Hype of its own');
    j = fight({ enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 7, y: 4 }], ravenAt: null });
    t.ok(/adjacent foes/.test(S().rules.filter(function (x) { return x.id === 'jos_contagion'; })[0].desc), 'no Bell: the chip says "adjacent foes"');
    A().addStatus(foes()[0], 'poison', { stacks: 3 }, j);
    A().kill(foes()[0], null);
    t.eq(stacks(foes()[0], 'poison'), 0, 'no Bell: 2 tiles away is safe');
  });

  // ---- starters ----------------------------------------------------------------------------------------
  T.suite('hero_josiah: House Call, Plague Flask, Mostly Medicine at every level', function (t) {
    if (!loaded(t)) return;
    // basic: 4 damage up to 2 tiles away, 6 to a Poisoned foe
    let j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 1, y: 6 }, { id: 'test_grunt', x: 4, y: 4 }], ravenAt: null });
    let f = foes();
    t.eq(cast(t, j, 'jos_cane', 1, 3, 4), 1, 'House Call costs 1 AP');
    t.eq(f[0].hp, 10, 'House Call: 4 damage at range 2');
    A().addStatus(f[1], 'poison', { stacks: 1 }, j);
    cast(t, j, 'jos_cane', 1, 1, 6);
    t.eq(f[1].hp, 8, 'House Call: 6 to a Poisoned foe');
    t.ok(!DD.Targeting.isValidTarget(j, j.basic, 4, 4), 'range 3 is out of reach');

    // Plague Flask: foes in radius 1 only: damage + Poison; cooldown 2 (usable again on his round-4 turn); min range 2
    [[2, 3], [3, 4], [4, 5]].forEach(function (c, i) {
      const lv = i + 1;
      j = fight({ enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 6, y: 4 }], ravenAt: { x: 4, y: 3 } });
      f = foes();
      const r = raven(j);
      t.eq(cast(t, j, 'jos_plague_flask', lv, 4, 4), 2, 'Plague Flask costs 2 AP');
      t.eq(f[0].hp + '/' + f[1].hp, (14 - c[0]) + '/' + (14 - c[0]), 'L' + lv + ': ' + c[0] + ' poison damage in radius 1');
      t.eq(stacks(f[0], 'poison') + '/' + stacks(f[1], 'poison'), c[1] + '/' + c[1], 'L' + lv + ': Poisoned ' + c[1]);
      t.eq(f[2].hp + '/' + stacks(f[2], 'poison'), '14/0', 'L' + lv + ': outside the radius untouched');
      t.eq(r.hp + '/' + stacks(r, 'poison'), r.maxHp + '/0', 'L' + lv + ': allies in the area are spared');
      t.ok(!has(f[0], 'weak'), 'L' + lv + ': no Weak any more (v2: one rider)');
      t.ok(!DD.Targeting.isValidTarget(j, j.skills[0], 2, 4), 'min range 2');
      const sl = j.skills[0];
      const ok = [];
      for (let round = 2; round <= 4; round++) { DD.Combat.endTurn(); ok.push(S().round + ':' + (DD.Combat.canUse(j, sl) === true)); }
      t.eq(ok.join(' '), '2:false 3:false 4:true', 'L' + lv + ': cooldown 2 = his next 2 turns');
    });

    // Mostly Medicine: heal 7 / 9 / 11, self or an ally within 3; nothing else (debuffs stay)
    [7, 9, 11].forEach(function (heal, i) {
      const lv = i + 1;
      j = fight({ allies: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
      const k = knight();
      k.hp = 10;
      A().addStatus(k, 'weak', { turns: 2 }, null);
      t.eq(cast(t, j, 'jos_draught', lv, 3, 4), 1, 'Mostly Medicine costs 1 AP');
      t.eq(k.hp, 10 + heal, 'L' + lv + ': heals ' + heal);
      t.ok(has(k, 'weak'), 'L' + lv + ': no cleanse (v2: that is Vaccinate\'s job)');
      j.hp = 5;
      j.skills[0].cd = 0;
      cast(t, j, 'jos_draught', lv, 1, 4, 'drink it yourself');
      t.eq(j.hp, 5 + heal, 'L' + lv + ': self-heal');
      t.eq(j.skills[0].cd, 1, 'cooldown 1');
    });
    j = fight({ allies: [{ id: 'test_knight', x: 5, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }] });
    t.ok(!DD.Targeting.isValidTarget(j, give(j, 'jos_draught', 1), 5, 4), 'Mostly Medicine: 4 tiles is out of reach');
  });

  // ---- raven ---------------------------------------------------------------------------------------------
  T.suite('hero_josiah: the raven — Peck, Ill Omen, Raven Dive (landing, re-summon, Dazzle at III)', function (t) {
    if (!loaded(t)) return;
    [2, 3, 4].forEach(function (dmg, i) {
      const lv = i + 1;
      const j = fight({ enemies: [{ id: 'test_grunt', x: 2, y: 3 }, { id: 'test_grunt', x: 4, y: 4 }] });
      const r = raven(j);
      t.eq(r.x + ',' + r.y, '1,3', 'raven starts north of Josiah');
      const f = foes();
      t.ok(DD.Combat.useSkill(r, give(r, 'jos_peck', lv), 2, 3), 'Peck L' + lv);
      t.eq(f[0].hp, 14 - dmg, 'Peck L' + lv + ': ' + dmg + ' damage');
      const om = give(r, 'jos_omen', lv);
      t.ok(DD.Combat.useSkill(r, om, 4, 4), 'Ill Omen L' + lv);
      t.eq(stacks(f[1], 'marked'), dmg + 1, 'Ill Omen L' + lv + ': Marked ' + (dmg + 1));
      t.eq(r.ap, 0, 'Peck + Ill Omen = the raven\'s 2 AP');
      t.eq(om.cd, 1, 'Ill Omen has cooldown 1');
    });
    // Marked: the next hit is bigger, once
    let j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    let r = raven(j);
    let f = foes();
    t.ok(DD.Combat.useSkill(r, give(r, 'jos_omen', 1), 3, 4), 'omen');
    cast(t, j, 'jos_cane', 1, 3, 4);
    t.eq(f[0].hp, 14 - 4 - 3, 'Marked +3 on the next hit');
    t.eq(stacks(f[0], 'marked'), 0, 'mark consumed');
    // ...or on the next damage of any kind: a Poison tick takes the Mark too (so the desc says "damage", not "hit")
    t.ok(/the next damage it takes is \+3/.test(DD.skillDesc(DD.getSkill('jos_omen'), 1, null)), 'Ill Omen desc: "the next damage it takes is +3"');
    t.ok(/Marked 3\.$/.test(DD.skillDesc(DD.getSkill('jos_murder'), 3, null)), 'Murder of Crows III desc: "Marked 3"');
    j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    r = raven(j);
    f = foes();
    A().addStatus(f[0], 'poison', { stacks: 2 }, j);
    t.ok(DD.Combat.useSkill(r, give(r, 'jos_omen', 1), 3, 4), 'omen on a Poisoned grunt');
    DD.Combat.endTurn();
    t.eq((14 - f[0].hp) + ' ' + stacks(f[0], 'marked'), '5 0', 'its Poison tick at its turn start takes the Mark: 2 + 3');

    // Raven Dive: lands next to the foe, 4 / 5 / 6 damage; III: Dazzled for exactly its next turn
    [4, 5, 6].forEach(function (dmg, i) {
      const lv = i + 1;
      j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
      r = raven(j);
      f = foes();
      t.eq(cast(t, j, 'jos_raven_dive', lv, 6, 4), 1, 'Raven Dive costs 1 AP');
      t.eq(r.x + ',' + r.y, '6,3', 'L' + lv + ': the raven lands next to the foe (nearest free side)');
      t.eq(f[0].hp, 14 - dmg, 'L' + lv + ': ' + dmg + ' damage');
      t.eq(r.ap, 2, 'L' + lv + ': the raven keeps its own AP');
      t.ok(/cooldown/i.test(DD.Combat.canUse(j, j.skills[0])), 'cooldown 1');
      t.eq(has(f[0], 'dazzled'), lv === 3, 'L' + lv + ': ' + (lv === 3 ? 'Dazzled' : 'no Dazzle below III'));
      if (lv !== 3) return;
      let during = null;
      const off = DD.Events.on('turn:start', function (e) { if (e.unit === f[0]) during = has(f[0], 'dazzled'); });
      try { DD.Combat.endTurn(); } finally { off(); }
      t.ok(during === true && !has(f[0], 'dazzled'), 'L3: Dazzled through its next turn, gone at that turn\'s end');
    });
    // no raven: Onyx comes back to answer the call (next to the target), and it still pecks
    t.ok(/^Onyx \(called back if gone\) swoops/.test(DD.skillDesc(DD.getSkill('jos_raven_dive'), 1, null)), 'the desc says Onyx comes back');
    j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 4 }], ravenAt: null });
    t.eq(ravens().length, 0, 'raven gone');
    f = foes();
    cast(t, j, 'jos_raven_dive', 1, 6, 4, 'dive without a raven');
    t.eq(ravens().length, 1, 'a new raven was summoned');
    t.eq(raven(j).name, 'Onyx', 'the re-summoned raven is still Onyx (ravens are like that)');
    t.eq(DD.Grid.dist(raven(j), f[0]), 1, 'right next to the target');
    t.eq(f[0].hp, 10, 'and it still pecks for 4');
    t.eq(raven(j).ap, 0, 'a fresh raven arrives with 0 AP');
    t.ok(!DD.Combat.order().some(function (e) { return e.unitId === raven(j).id; }), 'and it acts on Josiah\'s turn (no initiative roll)');
    // landing avoids pits, and with no free side the raven pecks from where it is
    j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 4 }], terrain: function (tl) { if (tl.x === 6 && tl.y === 3) tl.t = 'pit'; } });
    cast(t, j, 'jos_raven_dive', 1, 6, 4, 'dive near a pit');
    t.eq(raven(j).x + ',' + raven(j).y, '5,4', 'the raven prefers solid ground to hovering over a pit');
    j = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }, { id: 'test_grunt', x: 7, y: 8 }, { id: 'test_grunt', x: 8, y: 7 }], ravenAt: { x: 4, y: 4 } });
    j.x = 4; j.y = 8; // move Josiah in range (test setup, not a game action)
    f = foes();
    cast(t, j, 'jos_raven_dive', 1, 8, 8, 'dive into a corner');
    t.eq(raven(j).x + ',' + raven(j).y, '4,4', 'corner foe fully surrounded: the raven swoops and returns');
    t.eq(f[0].hp, 10, 'corner foe still takes 4');
    // a stunned / sheep raven can't dive (nor call the flock)
    ['stun', 'sheep'].forEach(function (st) {
      j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
      A().addStatus(raven(j), st, { turns: 1 }, null);
      t.eq(DD.Combat.canUse(j, give(j, 'jos_raven_dive', 1)), 'Onyx is indisposed.', st + ' raven: Raven Dive refused');
      t.eq(DD.Combat.canUse(j, give(j, 'jos_murder', 1)), 'Onyx is indisposed.', st + ' raven: Murder of Crows refused');
    });
    // the raven dies: Josiah is upset (and nothing breaks)
    j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 4 }] });
    A().kill(raven(j), foes()[0]);
    t.eq(ravens().length, 0, 'raven killed');
    t.eq(S().hype, 0, 'a killed raven gives no Hype');
  });

  // ---- miasma --------------------------------------------------------------------------------------------
  T.suite('hero_josiah: Plague Miasma — the cloud, its doses, a hazard for foes only, fire', function (t) {
    if (!loaded(t)) return;
    [[2, 2], [3, 2], [3, 3]].forEach(function (c, i) {
      const lv = i + 1;
      const j = fight({ enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }], ravenAt: { x: 4, y: 5 } });
      const f = foes(), r = raven(j);
      t.eq(cast(t, j, 'jos_miasma', lv, 4, 4), 2, 'Miasma costs 2 AP');
      t.eq(CLOUD.filter(function (p) { return surf(p[0], p[1]) === 'jos_miasma'; }).length, 5, 'L' + lv + ': radius 1 of Miasma');
      t.eq(DD.Grid.tile(4, 4).surface.turns, c[1], 'L' + lv + ': lasts ' + c[1] + ' rounds');
      t.eq(stacks(f[0], 'poison'), c[0], 'L' + lv + ': a foe inside is Poisoned ' + c[0]);
      t.eq(stacks(r, 'poison'), 0, 'L' + lv + ': the raven inside is fine');
      t.eq(stacks(f[1], 'poison'), 0, 'L' + lv + ': foes outside are fine');
      t.ok(DD.Grid.los({ x: 2, y: 4 }, { x: 6, y: 4 }), 'L' + lv + ': v2 — it does not block line of sight');
      t.eq(j.skills[0].cd, 3, 'cooldown 3');
    });
    // a foe pushed in gets a dose; a foe staying inside gets nothing more; the cloud lasts exactly 2 rounds
    let j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 4, y: 3 }], ravenAt: null });
    let f = foes();
    cast(t, j, 'jos_miasma', 1, 4, 4);
    t.eq(stacks(f[1], 'poison'), 2, 'foe standing in it: Poisoned 2');
    A().push(j, f[0], { x: -1, y: 0 }, 1);
    t.eq(f[0].x + ',' + stacks(f[0], 'poison'), '5,2', 'a foe pushed into the cloud: Poisoned 2');
    DD.Combat.endTurn();
    t.eq(stacks(f[1], 'poison'), 1, 'its own turn: tick (−1), no extra dose for staying inside');
    t.eq(surf(4, 4), 'jos_miasma', 'still there in round 2');
    DD.Combat.endTurn();
    t.eq(surf(4, 4), null, 'L1 cloud gone after 2 rounds');
    // every Miasma tile a foe enters doses it again (the desc says so): shoved 2 tiles through the cloud = Poisoned 2 + 2
    t.ok(/Poisoned 2, and again on each Miasma tile they enter/.test(DD.skillDesc(DD.getSkill('jos_miasma'), 1, null)), 'the desc says each tile entered doses again');
    j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
    f = foes();
    cast(t, j, 'jos_miasma', 1, 4, 4);
    A().push(j, f[0], { x: -1, y: 0 }, 2);
    t.eq(f[0].x + ',' + stacks(f[0], 'poison'), '4,4', 'pushed through 2 Miasma tiles: Poisoned 4');
    A().push(j, f[0], { x: 0, y: 1 }, 1);
    t.eq(f[0].y + ',' + stacks(f[0], 'poison'), '5,6', 'moved to another Miasma tile inside the cloud: 2 more');
    // a hazard for its brewer's foes only (AI paths avoid it; heroes and the raven walk through)
    j = fight({ allies: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }] });
    cast(t, j, 'jos_miasma', 1, 4, 4);
    t.eq(DD.Grid.hazardAt(4, 4, foes()[0]), 'jos_miasma', 'a hazard for the grunt');
    t.eq(DD.Grid.hazardAt(4, 4, j) + '/' + DD.Grid.hazardAt(4, 4, knight()) + '/' + DD.Grid.hazardAt(4, 4, raven(j)), 'null/null/null', 'not for Josiah, his allies or his raven');
    t.ok(!(DD.Grid.hazardDamage(4, 4, knight())) && DD.Grid.hazardDamage(4, 4, foes()[0]).enter > 0, 'hazard numbers for foes only');
    A().teleport(knight(), 4, 4);
    t.eq(stacks(knight(), 'poison'), 0, 'an ally walking in is fine');
    // a charmed foe fights for the heroes this turn: the cloud leaves it alone
    const g = foes()[0];
    t.eq(stacks(g, 'poison'), 2, 'the grunt was in the cloud when it appeared: Poisoned 2');
    A().addStatus(g, 'charmed', { turns: 1 }, j);
    A().teleport(g, 6, 6);
    A().teleport(g, 4, 5);
    t.eq(stacks(g, 'poison'), 2, 'charmed, it walks back in: no second dose');
    A().removeStatus(g, 'charmed');
    A().teleport(g, 6, 6);
    A().teleport(g, 4, 5);
    t.eq(stacks(g, 'poison'), 4, 'uncharmed, it walks back in: Poisoned 2 more');
    // fire ignites the whole cloud (Burn for everyone inside, allies included); no cloud over open flames
    j = fight({ allies: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 5, y: 4 }], ravenAt: null });
    f = foes();
    cast(t, j, 'jos_miasma', 1, 4, 4);
    A().applyElement(4, 3, 'fire', j);
    t.eq(CLOUD.filter(function (p) { return surf(p[0], p[1]) === 'fire'; }).length, 5, 'fire spreads through the whole cloud');
    t.ok(has(f[0], 'burn'), 'the foe inside burns');
    t.ok(has(knight(), 'burn'), 'so does the ally inside (careful!)');
    j = fight({ enemies: [{ id: 'test_grunt', x: 7, y: 7 }], surfaces: [{ x: 4, y: 3, id: 'fire', turns: 3 }], ravenAt: null });
    cast(t, j, 'jos_miasma', 1, 4, 4);
    t.eq(surf(4, 3) + '/' + surf(4, 4), 'fire/jos_miasma', 'no cloud over open flames');
  });

  // ---- leeches, quarantine, vaccinate -------------------------------------------------------------------
  T.suite('hero_josiah: Prescribe Leeches, Quarantine, Vaccinate at every level (own-turn durations)', function (t) {
    if (!loaded(t)) return;
    // Leeches: damage, Josiah heals the HP the foe lost (his own drain: allies are not healed)
    [6, 8, 10].forEach(function (dmg, i) {
      const lv = i + 1;
      const j = fight({ allies: [{ id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], ravenAt: null });
      const k = knight(), f = foes();
      k.hp = 12; j.hp = 12;
      t.eq(cast(t, j, 'jos_leeches', lv, 3, 4), 2, 'Leeches costs 2 AP');
      t.eq(f[0].hp, 14 - dmg, 'L' + lv + ': ' + dmg + ' damage');
      t.eq(j.hp, 12 + dmg, 'L' + lv + ': Josiah heals ' + dmg);
      t.eq(k.hp, 12, 'L' + lv + ': the wounded ally is not healed');
      t.eq(j.skills[0].cd, 2, 'cooldown 2');
    });
    let j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }], ravenAt: null });
    let f = foes();
    A().addBlock(f[0], 4);
    j.hp = 10;
    cast(t, j, 'jos_leeches', 1, 3, 4, 'leech through Block');
    t.eq(j.hp, 12, 'heal = HP the foe actually lost (6 − 4 Block)');
    j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }], ravenAt: null });
    cast(t, j, 'jos_leeches', 1, 3, 4, 'at full HP');
    t.eq(j.hp, j.maxHp, 'unhurt: nothing to heal');

    // Quarantine: Rooted + Vulnerable, counted in the foe's own turns; its neighbours are left alone (v2)
    [[1, 2], [1, 3], [2, 3]].forEach(function (c, i) {
      const lv = i + 1;
      j = fight({ ai: true, enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: { x: 4, y: 3 } });
      f = foes();
      const r = raven(j);
      t.eq(cast(t, j, 'jos_quarantine', lv, 4, 4), 1, 'Quarantine costs 1 AP');
      t.eq(turnsOf(f[0], 'root') + '/' + turnsOf(f[0], 'vulnerable'), c[0] + '/' + c[1], 'L' + lv + ': Root ' + c[0] + ', Vulnerable ' + c[1]);
      t.eq(f[1].x + ',' + f[1].y + ' ' + r.x + ',' + r.y, '5,4 4,3', 'L' + lv + ': nobody is pushed');
      A().kill(r, null, { force: true });
      A().kill(f[1], null);
      const pos = [];
      const off = DD.Events.on('turn:end', function (e) { if (e.unit === f[0]) pos.push(f[0].x + ',' + f[0].y + (has(f[0], 'root') ? ' rooted' : ' free')); });
      try { DD.Combat.endTurn(); DD.Combat.endTurn(); } finally { off(); }
      t.eq(pos.join(' | '), '4,4 ' + (c[0] === 2 ? 'rooted' : 'free') + ' | ' + (c[0] === 2 ? '4,4 free' : '2,4 free'),
        'L' + lv + ': it stays put for ' + c[0] + ' of its turns, then walks over (' + pos.join(' | ') + ')');
      t.eq(turnsOf(f[0], 'vulnerable'), c[1] - 2, 'L' + lv + ': Vulnerable ticked once per own turn (' + (c[1] - 2) + ' left)');
    });
    // without Quarantine the same grunt walks straight over on its first turn
    j = fight({ ai: true, enemies: [{ id: 'test_grunt', x: 4, y: 4 }], ravenAt: null });
    DD.Combat.endTurn();
    t.eq(foes()[0].x + ',' + foes()[0].y, '2,4', 'control: an unrooted grunt closes in at once');
    // Vulnerable: +25% from everyone
    j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }], ravenAt: null });
    f = foes();
    cast(t, j, 'jos_quarantine', 1, 3, 4);
    cast(t, j, 'jos_cane', 1, 3, 4, 'cane on a vulnerable foe');
    t.eq(14 - f[0].hp, 5, 'Vulnerable: 4 × 1.25 = 5');

    // Vaccinate: cure all debuffs, immune to new ones for 1 / 2 of its own turns, III: +5 Block
    [[1, 0], [2, 0], [2, 5]].forEach(function (c, i) {
      const lv = i + 1;
      j = fight({ allies: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
      const k = knight();
      ['weak', 'vulnerable', 'poison'].forEach(function (id) { A().addStatus(k, id, { stacks: 2, turns: 2 }, null); });
      t.eq(cast(t, j, 'jos_vaccinate', lv, 3, 4), 1, 'Vaccinate costs 1 AP');
      t.ok(!has(k, 'weak') && !has(k, 'vulnerable') && !has(k, 'poison'), 'L' + lv + ': all debuffs removed');
      t.eq(k.block, c[1], 'L' + lv + ': +' + c[1] + ' Block');
      t.eq(A().addStatus(k, 'stun', { turns: 1 }, null), null, 'L' + lv + ': immune to a new debuff');
      t.ok(!!A().addStatus(k, 'inspired', { turns: 1 }, null), 'L' + lv + ': buffs still land');
      // heroesFirst: Josiah, the knight, then the foes. Its turns are what count.
      const left = [];
      for (let n = 0; n < 4; n++) { DD.Combat.endTurn(); left.push((DD.Combat.current() === k ? 'K' : 'J') + (has(k, 'jos_vaccinated') ? '+' : '-')); }
      t.eq(left.join(' '), c[0] === 1 ? 'K+ J- K- J-' : 'K+ J+ K+ J-', 'L' + lv + ': immune through ' + c[0] + ' of its turns (' + left.join(' ') + ')');
    });
    // on himself, on his own turn: III lasts through his next 2 turns; its Block lasts until his next turn starts
    j = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
    cast(t, j, 'jos_vaccinate', 3, 1, 4, 'vaccinate himself');
    let during = -1;
    const off = DD.Events.on('turn:start', function (e) { if (e.unit.side === 'enemy') during = j.block; });
    try { DD.Combat.endTurn(); } finally { off(); }
    t.eq(during + '/' + j.block, '5/0', 'his Block covers the foes\' turns, then expires at his turn start');
    const self = ['R' + S().round + (has(j, 'jos_vaccinated') ? '+' : '-')];
    for (let n = 0; n < 2; n++) { DD.Combat.endTurn(); self.push('R' + S().round + (has(j, 'jos_vaccinated') ? '+' : '-')); }
    t.eq(self.join(' '), 'R2+ R3+ R4-', 'self-cast III: immune through his next 2 turns (' + self.join(' ') + ')');
    // v2: a stunned hero loses its next turn — curing the stun before that turn gives it back
    [false, true].forEach(function (cure) {
      j = fight({ allies: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
      const k = knight();
      A().addStatus(k, 'stun', { turns: 1 }, foes()[0]);
      if (cure) cast(t, j, 'jos_vaccinate', 1, 3, 4, 'vaccinate the stunned knight');
      DD.Combat.endTurn();
      if (cure) t.ok(DD.Combat.current() === k && k.ap === 3, 'cured: the knight gets his turn with 3 AP');
      else t.ok(DD.Combat.current() === j && S().round === 2, 'not cured: the knight\'s turn passed, it is Josiah\'s again in round 2');
    });
  });

  // ---- volatile, murder, salts --------------------------------------------------------------------------
  T.suite('hero_josiah: Volatile Brew, Murder of Crows, Smelling Salts at every level', function (t) {
    if (!loaded(t)) return;
    // Volatile Brew: everything in radius 1 (allies too) takes fire damage, then is pushed outward
    [[5, 1], [6, 1], [7, 2]].forEach(function (c, i) {
      const lv = i + 1;
      const j = fight({ allies: [{ id: 'test_cleric', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: null });
      const f = foes(), k = unitOf('test_cleric');
      t.eq(cast(t, j, 'jos_volatile', lv, 4, 4), 2, 'Volatile Brew costs 2 AP');
      t.eq((14 - f[0].hp) + '/' + (14 - f[1].hp) + '/' + (k.maxHp - k.hp), c[0] + '/' + c[0] + '/' + c[0], 'L' + lv + ': ' + c[0] + ' fire damage to all three (ally too)');
      t.eq(f[1].x + ',' + f[1].y, (5 + c[1]) + ',4', 'L' + lv + ': the east unit flies ' + c[1] + ' east');
      t.eq(k.x + ',' + k.y, '4,' + (5 + c[1]), 'L' + lv + ': the south unit flies ' + c[1] + ' south');
      t.eq(f[0].x + ',' + f[0].y, (4 + c[1]) + ',4', 'L' + lv + ': the one in the middle is blown away from Josiah');
      t.eq(j.skills[0].cd, 2, 'cooldown 2');
    });
    // v2: one rider (the push). The blast no longer ignites the ground: oil, his own cloud and barrels are left alone
    let j = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }], ravenAt: null,
      surfaces: [{ x: 4, y: 3, id: 'oil', turns: 5 }, { x: 4, y: 2, id: 'oil', turns: 5 }],
      objects: [{ x: 5, y: 4, id: 'barrel_explosive' }] });
    cast(t, j, 'jos_volatile', 1, 4, 4, 'brew on oil + barrel');
    t.eq([surf(4, 3), surf(4, 2)].join(','), 'oil,oil', 'v2: the oil does not catch');
    t.ok(!!DD.Grid.tile(5, 4).obj, 'v2: the explosive barrel stays put (it is not a unit)');
    t.ok(!/ignit/i.test(DD.skillDesc(DD.getSkill('jos_volatile'), 3, null)), 'the desc promises no ignition');
    j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
    cast(t, j, 'jos_miasma', 1, 5, 4, 'a cloud first');
    cast(t, j, 'jos_volatile', 1, 3, 4, 'then a bomb at its edge');
    t.eq(CLOUD.map(function (p) { return surf(p[0] + 1, p[1]); }).join(','), 'jos_miasma,jos_miasma,jos_miasma,jos_miasma,jos_miasma', 'v2: his cloud does not ignite either');
    // self-combo: the blast throws a foe INTO his cloud, and entering it doses it
    j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
    let f = foes();
    cast(t, j, 'jos_miasma', 1, 5, 4, 'a cloud beyond the foe');
    t.eq(stacks(f[0], 'poison'), 0, 'the foe stands outside the cloud');
    cast(t, j, 'jos_volatile', 1, 3, 4, 'the bomb blows it into the cloud');
    t.eq(f[0].x + ',' + f[0].y + ' ' + (14 - f[0].hp) + ' ' + stacks(f[0], 'poison'), '4,4 5 2', 'blown 1 tile into the cloud: 5 damage + Poisoned 2');
    // III blasts it 2 tiles: through two Miasma tiles, and the preview says so
    j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
    f = foes();
    cast(t, j, 'jos_miasma', 1, 5, 4, 'a cloud beyond the foe');
    j.x = 1; j.y = 2; // out of the blast, the bomb lands west of the foe (test setup)
    const vol = give(j, 'jos_volatile', 3);
    const pv = DD.Combat.preview(j, vol, 2, 4).perUnit[f[0].id] || {};
    cast(t, j, 'jos_volatile', 3, 2, 4, 'Volatile Brew III blows it through the cloud');
    t.eq(f[0].x + ',' + f[0].y + ' ' + (28 - f[0].hp) + ' ' + stacks(f[0], 'poison'), '5,4 7 4', 'blown 2 tiles through the cloud: 7 damage + Poisoned 2 + 2');
    t.ok(/Poisoned 4/.test(pv.text || ''), 'the preview shows Poisoned 4 (' + pv.text + ')');
    // pushes: a pit (YEET), lava, water, the map edge
    j = fight({ enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 5 }, { id: 'test_grunt', x: 4, y: 3 }], ravenAt: null,
      terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; if (tl.x === 4 && tl.y === 6) tl.t = 'lava'; if (tl.x === 4 && tl.y === 2) tl.t = 'water'; } });
    f = foes();
    cast(t, j, 'jos_volatile', 1, 4, 4, 'brew next to a pit, lava and water');
    t.ok(f[0].dead, 'blown into the pit: YEET');
    t.ok(S().hype >= 20, 'environmental kill: +20 Hype (' + S().hype + ')');
    t.ok(f[1].dead || f[1].hp < 14 - 5, 'blown into lava: more than the blast');
    t.ok(has(f[2], 'wet'), 'blown into water: Wet');
    j = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 4 }], ravenAt: null });
    f = foes();
    j.x = 4; j.y = 4; // in range of the map edge (test setup)
    cast(t, j, 'jos_volatile', 1, 7, 4, 'blast at the map edge');
    t.eq(f[0].x + ',' + (14 - f[0].hp), '8,8', 'pushed into the map edge: 5 + 3 bump');

    // Murder of Crows: foes within 2 of the raven (+ Marked at III); 3 AP; needs the raven
    [[7, 0], [9, 0], [10, 3]].forEach(function (c, i) {
      const lv = i + 1;
      j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 5 }, { id: 'test_grunt', x: 8, y: 4 }, { id: 'test_grunt', x: 6, y: 7 }], ravenAt: { x: 6, y: 4 } });
      f = foes();
      t.eq(cast(t, j, 'jos_murder', lv, j.x, j.y), 3, 'Murder of Crows costs 3 AP');
      t.eq((14 - f[0].hp) + '/' + (14 - f[1].hp), c[0] + '/' + c[0], 'L' + lv + ': ' + c[0] + ' damage to foes within 2 of the raven');
      t.eq(f[2].hp, 14, 'L' + lv + ': 3 tiles away is safe');
      t.eq(stacks(f[0], 'marked') + '/' + stacks(f[1], 'marked'), c[1] + '/' + c[1], 'L' + lv + ': Marked ' + c[1]);
      t.ok(!has(f[0], 'dazzled'), 'L' + lv + ': no Dazzle any more (v2: one rider, at III)');
      t.eq(S().hype, 4, 'L' + lv + ': two foes hit: +4 Hype');
      t.eq(j.skills[0].cd, 3, 'cooldown 3');
    });
    j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }], ravenAt: null });
    t.eq(DD.Combat.canUse(j, give(j, 'jos_murder', 1)), 'Needs Onyx.', 'no raven: no flock');
    cast(t, j, 'jos_raven_dive', 1, 3, 4, 'Raven Dive calls a new one');
    j.skills = [];
    t.eq(DD.Combat.canUse(j, give(j, 'jos_murder', 1)), true, 'and the flock can gather again');
    // AutoPlay calls the flock when its raven sits in a crowd (the whole turn for 3 × 7)
    j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 3 }, { id: 'test_grunt', x: 6, y: 5 }, { id: 'test_grunt', x: 7, y: 4 }], ravenAt: { x: 6, y: 4 } });
    give(j, 'jos_murder', 1);
    j.ap = 3;
    DD.AutoPlay.takeTurn();
    t.ok(j.skills[0].cd === 3 && foes().every(function (x) { return x.hp <= 14 - 7; }), 'AutoPlay casts Murder of Crows on the crowd (' + foes().map(function (x) { return x.hp; }).join(',') + ')');

    // Smelling Salts: revive at range at 30 / 40 / 50%, once per combat; v2: the ally then acts on its own turn
    [30, 40, 50].forEach(function (pct, i) {
      const lv = i + 1;
      j = fight({ allies: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
      const k = knight();
      A().kill(k, null);
      t.ok(k.downed, 'knight down');
      t.eq(cast(t, j, 'jos_salts', lv, 4, 4), 1, 'Smelling Salts costs 1 AP');
      t.ok(!k.downed, 'L' + lv + ': back up from 3 tiles away');
      t.eq(k.hp, Math.round(k.maxHp * pct / 100), 'L' + lv + ': at ' + pct + '% HP');
      t.eq(k.ap, 0, 'L' + lv + ': no AP outside its turn');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && k.ap === 3, 'L' + lv + ': its own turn comes with full AP');
      DD.Combat.endTurn();
      A().kill(k, null);
      t.eq(DD.Combat.canUse(j, j.skills[0]), 'No charges left.', 'L' + lv + ': once per combat');
    });
    j = fight({ allies: [{ id: 'test_knight', x: 6, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
    A().kill(knight(), null);
    t.ok(!DD.Targeting.isValidTarget(j, give(j, 'jos_salts', 1), 6, 4), 'Smelling Salts: range 4 (5 tiles is too far)');
    // AutoPlay (core fix in js/engine/autoplay.js) revives with the Salts (1 AP, 30%) instead of walking over to Help Up
    j = fight({ allies: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
    give(j, 'jos_salts', 1);
    j.ap = 3;
    A().kill(knight(), null);
    DD.AutoPlay.takeTurn();
    t.ok(!knight().downed && knight().hp === Math.round(knight().maxHp * 0.3), 'AutoPlay casts Smelling Salts on a downed ally (' + knight().hp + ' HP)');
    t.eq(j.skills[0].uses, 1, 'the charge is spent');
  });

  // ---- signature ---------------------------------------------------------------------------------------------
  T.suite('hero_josiah: Pandemic (signature)', function (t) {
    if (!loaded(t)) return;
    let j = fight({ allies: [{ id: 'test_knight', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 4, y: 1 }, { id: 'test_grunt', x: 6, y: 6 }, { id: 'test_grunt', x: 8, y: 2 }] });
    const k = knight();
    A().addStatus(k, 'weak', { turns: 2 }, null);
    const sl = give(j, 'jos_pandemic', 1);
    t.eq(DD.Combat.canUse(j, sl), 'Needs 100 Hype.', 'needs 100 Hype');
    S().hype = 100;
    t.eq(cast(t, j, 'jos_pandemic', 1, j.x, j.y), 2, 'Pandemic costs 2 AP');
    const f = foes();
    t.eq(f.map(function (x) { return 14 - x.hp; }).join(','), '8,8,8', 'every foe takes 8');
    t.eq(f.map(function (x) { return stacks(x, 'poison'); }).join(','), '4,4,4', 'every foe Poisoned 4');
    t.ok(has(k, 'weak'), 'v2: one effect — allies are not cleansed any more');
    t.eq(S().hype, 4, 'Hype spent (then +4 for hitting 2+ foes)');
    t.ok(S().log.some(function (l) { return /unleashes Pandemic/.test(l.text); }), 'signature logged');
    // with the Beak Mask: Poisoned 5; and its Poison feeds the contagion when they fall
    j = fight({ items: ['jos_beak_mask'], enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: null });
    S().hype = 100;
    cast(t, j, 'jos_pandemic', 1, j.x, j.y, 'Pandemic with the Mask');
    t.eq(foes().map(function (x) { return stacks(x, 'poison'); }).join(','), '5,5', 'Beak: Poisoned 5');
    A().kill(foes()[0], null);
    t.eq(stacks(foes()[0], 'poison'), 5 + 6, 'a Pandemic victim spreads its 5 (+1 Mask) to its neighbour');
  });

  // ---- combos ---------------------------------------------------------------------------------------------
  T.suite('hero_josiah: combos with other heroes (fire on his cloud, shoves into it, Vulnerable, Marked, contagion, Dazzle vs attacks of opportunity)', function (t) {
    if (!loaded(t)) return;
    const party = [{ id: 'test_knight', x: 3, y: 4 }, { id: 'test_mage', x: 1, y: 6 }];
    // 1. setup: Plague Miasma → payoff: the mage's Fire Fixture on one edge ignites the whole cloud
    let j = fight({ allies: [{ id: 'test_knight', x: 1, y: 2 }, { id: 'test_mage', x: 1, y: 6 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 5, y: 5 }], ravenAt: null });
    let f = foes();
    cast(t, j, 'jos_miasma', 1, 5, 4, 'Josiah: Plague Miasma');
    DD.Combat.endTurn(); DD.Combat.endTurn();
    const m = mage();
    t.ok(DD.Combat.current() === m, 'the mage\'s turn');
    t.ok(DD.Combat.useSkill(m, give(m, 'test_fireball', 1), 4, 4), 'the mage drops a Fire Fixture on the cloud\'s edge');
    t.eq([[5, 4], [4, 4], [6, 4], [5, 3], [5, 5]].filter(function (p) { return surf(p[0], p[1]) === 'fire'; }).length, 5, 'the whole cloud goes up');
    t.ok(has(f[1], 'burn') && stacks(f[1], 'poison') === 2, 'the grunt at the far side (outside the fireball) is Poisoned AND Burning');
    // 2. setup: Plague Miasma → payoff: the knight's Shield Bash shoves a foe into the cloud (entering it doses it)
    j = fight({ allies: [{ id: 'test_knight', x: 2, y: 3 }, { id: 'test_mage', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 3 }], ravenAt: null });
    f = foes();
    cast(t, j, 'jos_miasma', 1, 5, 4, 'Josiah: Plague Miasma');
    t.eq(stacks(f[0], 'poison'), 0, 'the grunt is outside the cloud');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === knight(), 'the knight\'s turn');
    t.ok(DD.Combat.useSkill(knight(), give(knight(), 'test_shield_bash', 1), 3, 3), 'the knight bashes the grunt east');
    t.eq(f[0].x + ',' + f[0].y + ' ' + stacks(f[0], 'poison'), '5,3 2', 'shoved 2 tiles into the cloud: Poisoned 2');
    // 3. setup: Quarantine (Vulnerable) → payoff: the knight's slash +25%
    j = fight({ allies: party, enemies: [{ id: 'test_grunt', x: 4, y: 4 }], ravenAt: null });
    f = foes();
    cast(t, j, 'jos_quarantine', 1, 4, 4, 'Josiah: Quarantine');
    DD.Combat.endTurn();
    t.ok(DD.Combat.useSkill(knight(), knight().basic, 4, 4), 'the knight slashes');
    t.eq(14 - f[0].hp, 6, 'Test Slash 5 × 1.25 = 6');
    // 4. setup: the raven's Ill Omen (Marked) → payoff: the mage's bolt +3
    j = fight({ allies: [{ id: 'test_knight', x: 1, y: 2 }, { id: 'test_mage', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
    f = foes();
    t.ok(DD.Combat.useSkill(raven(j), give(raven(j), 'jos_omen', 1), 4, 4), 'the raven stares');
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.ok(DD.Combat.useSkill(mage(), give(mage(), 'test_bolt', 1), 4, 4), 'the mage fires a bolt');
    t.eq(14 - f[0].hp, 4 + 3, 'bolt 4 + Marked 3');
    // 5. Murder of Crows III marks the flock's victims → the knight's slash +3
    j = fight({ allies: party, enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 2 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: { x: 5, y: 3 } });
    f = foes();
    cast(t, j, 'jos_murder', 3, j.x, j.y, 'Josiah: Murder of Crows III');
    DD.Combat.endTurn();
    t.ok(DD.Combat.useSkill(knight(), knight().basic, 4, 4), 'the knight slashes the marked grunt');
    t.eq(28 - f[0].hp, 10 + 5 + 3, 'Murder III 10, then slash 5 + Marked 3');
    // 6. Contagion pays off for anyone: Plague Flask → the knight's kill spreads it
    j = fight({ allies: party, enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: null });
    f = foes();
    f[0].hp = 3;
    cast(t, j, 'jos_plague_flask', 1, 5, 4, 'Josiah: Plague Flask');
    DD.Combat.endTurn();
    t.ok(DD.Combat.useSkill(knight(), knight().basic, 4, 4), 'the knight finishes the poisoned grunt');
    t.ok(f[0].dead && stacks(f[1], 'poison') === 6, 'its neighbour catches its Poison 3 on top of its own 3 (' + stacks(f[1], 'poison') + ')');
    // 7. v2 attacks of opportunity: Raven Dive III Dazzles the grunt pinning the mage → she walks away unpunished
    [false, true].forEach(function (dazzle) {
      j = fight({ allies: [{ id: 'test_mage', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
      f = foes();
      cast(t, j, 'jos_raven_dive', dazzle ? 3 : 2, 4, 4, 'Josiah: Raven Dive ' + (dazzle ? 'III' : 'II'));
      DD.Combat.endTurn();
      const m = mage();
      t.ok(DD.Combat.current() === m, 'the mage\'s turn');
      const hp = m.hp, said = DD.Combat.provokes(m, 4, 7).length;
      t.ok(DD.Combat.move(m, 4, 7), 'the mage steps away from the grunt');
      t.eq(said + ' ' + (hp - m.hp), dazzle ? '0 0' : '1 4', dazzle ? 'Dazzled: no attack of opportunity (preview and reality)' : 'control: the grunt stabs her as she leaves (4)');
    });
  });

  // ---- previews -----------------------------------------------------------------------------------------
  T.suite('hero_josiah: HUD previews predict the real outcome (incl. contagion chains, pits, the raven)', function (t) {
    if (!loaded(t)) return;
    /** Busy board: poisoned foes in a clump (contagion), a pit, water, oil, a crate, a hurt + downed ally. */
    function board(opts) {
      opts = opts || {};
      const j = fight({
        seed: seedOf(t, 'preview'), items: opts.items,
        allies: [{ id: 'test_knight', x: 2, y: 4 }, { id: 'test_cleric', x: 2, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 4, y: 5 }, { id: 'test_minion', x: 5, y: 5 },
          { id: 'test_archer', x: 7, y: 2 }],
        terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'pit'; if (tl.x === 3 && tl.y === 7) tl.t = 'water'; },
        surfaces: [{ x: 4, y: 3, id: 'oil', turns: 5 }], objects: [{ x: 3, y: 2, id: 'crate' }], ravenAt: opts.ravenless ? null : { x: 5, y: 3 },
      });
      const f = foes();
      f.forEach(function (x, i) { A().addStatus(x, 'poison', { stacks: 2 + i }, j); });
      f[3].hp = 2; f[0].hp = 6;
      knight().hp = 9;
      A().kill(unitOf('test_cleric'), null);
      S().hype = opts.hype === undefined ? 100 : opts.hype;
      j.ap = 10;
      return j;
    }
    function check(id, lv, p, opts, label) {
      const def = DD.getSkill(id);
      const j = board(opts);
      const user = def.owner === 'summon' ? raven(j) : j;
      const slot = give(user, id, lv);
      const fp = T.contentHelpers && T.contentHelpers.fingerprint ? T.contentHelpers.fingerprint(S()) : null;
      const prev = DD.Combat.preview(user, slot, p.x, p.y);
      if (fp) t.eq(T.contentHelpers.fingerprint(S()), fp, label + ': preview leaves the fight untouched');
      const hp0 = snapHp(), hype0 = S().hype, pz0 = {}, down0 = {};
      S().units.forEach(function (u) { pz0[u.id] = stacks(u, 'poison'); down0[u.id] = u.dead || u.downed; });
      const n0 = S().units.length;
      t.ok(DD.Combat.useSkill(user, slot, p.x, p.y), label + ' used');
      const lost = hpDiff(hp0);
      const bad = [];
      Object.keys(hp0).forEach(function (uid) {
        const e = prev.perUnit[uid];
        const said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
        if (said !== lost[uid]) bad.push(uid + ' said ' + said + ' real ' + lost[uid]);
        const u = DD.Combat.byId(uid);
        const fell = !!(u.dead || u.downed) && !down0[uid];
        if (fell !== !!(e && e.lethal)) bad.push(uid + ' lethal said ' + !!(e && e.lethal) + ' real ' + fell);
        const gotPoison = stacks(u, 'poison') > pz0[uid]; // the dead keep their statuses (so does the preview)
        if (gotPoison !== !!(e && e.statuses && e.statuses.indexOf('poison') >= 0)) bad.push(uid + ' poison said ' + !gotPoison + ' real ' + gotPoison);
      });
      if (S().hype - hype0 !== prev.hype) bad.push('hype said ' + prev.hype + ' real ' + (S().hype - hype0));
      const born = S().units.length - n0;
      if (born !== (prev.spawned || []).length) bad.push('spawned said ' + (prev.spawned || []).length + ' real ' + born);
      t.eq(bad.join('; '), '', label + ': preview == reality');
    }
    /** The most crowded targets first (that's where chains happen), plus one quiet one. */
    function picks(id, lv, opts, n) {
      const def = DD.getSkill(id);
      const j = board(opts);
      const user = def.owner === 'summon' ? raven(j) : j;
      const slot = give(user, id, lv);
      const scored = DD.Targeting.validTargets(user, slot).map(function (p) {
        const ctx = DD.Targeting.pure(function () { return DD.Targeting.buildCtx(user, slot, p); });
        return { p: p, n: ctx.units.length };
      }).sort(function (a, b) { return b.n - a.n; });
      const out = scored.slice(0, n).map(function (e) { return e.p; });
      if (scored.length > n) out.push(scored[scored.length - 1].p);
      return out;
    }
    let checked = 0;
    ALL_SKILLS.forEach(function (id) {
      for (let lv = 1; lv <= DD.getSkill(id).levels.length; lv++) {
        picks(id, lv, {}, 3).forEach(function (p) { check(id, lv, p, {}, id + ' L' + lv + ' @' + p.x + ',' + p.y); checked++; });
      }
    });
    t.ok(checked >= 80, 'previews checked: ' + checked);
    t.log('previews checked: ' + checked);
    // a raven-less Josiah: Raven Dive's new raven is in the preview
    picks('jos_raven_dive', 1, { ravenless: true }, 1).forEach(function (p) { check('jos_raven_dive', 1, p, { ravenless: true }, 'raven-less dive @' + p.x + ',' + p.y); });
    // with his combat items (Bell: +10% and the 2-tile contagion; Mask: +1 Poison; Treats: a big raven), every skill at
    // its top level: HP, KOs, Hype, summons and who catches Poison all as previewed
    const GEAR = ['jos_plague_bell', 'jos_beak_mask', 'jos_raven_treats'];
    let itemChecks = 0;
    ALL_SKILLS.forEach(function (id) {
      const lv = DD.getSkill(id).levels.length;
      const opts = { items: GEAR, hype: id === 'jos_pandemic' ? 100 : 40 };
      picks(id, lv, opts, 2).slice(0, 2).forEach(function (p) { check(id, lv, p, opts, id + ' L' + lv + ' with his items @' + p.x + ',' + p.y); itemChecks++; });
    });
    t.ok(itemChecks >= 20, 'previews with items checked: ' + itemChecks);
  });

  // ---- edge cases ---------------------------------------------------------------------------------------
  T.suite('hero_josiah: v2 edge cases (whose turn, silence, stun, sheep, charm, AP, empty and dying targets, edges)', function (t) {
    if (!loaded(t)) return;
    // not his turn: nothing works, the raven waits too
    let j = fight({ heroes: [{ id: 'test_knight', x: 1, y: 2 }, { id: 'josiah', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    t.ok(DD.Combat.current() === knight(), 'the knight acts first');
    POOL.concat(['jos_cane']).forEach(function (id) { t.eq(DD.Combat.canUse(j, give(j, id, 1)), 'Not Josiah\'s turn.', 'not his turn: ' + id + ' refused'); });
    t.ok(/^Not .+'s turn\.$/.test(String(DD.Combat.canUse(raven(j), give(raven(j), 'jos_peck', 1)))), 'not his turn: the raven waits');
    // silence only stops the spells (Murder of Crows, Ill Omen); stun / sheep / sleep / frozen stop everything
    j = fight({ allies: [{ id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 4, y: 6 }], ravenAt: { x: 3, y: 3 } });
    A().addStatus(j, 'silenced', { turns: 2 }, null);
    POOL.concat(['jos_cane']).forEach(function (id) {
      const ok = DD.Combat.canUse(j, give(j, id, 1));
      if (id === 'jos_murder') t.eq(ok, 'Silenced!', 'silenced: Murder of Crows (a spell) refused');
      else if (id !== 'jos_salts') t.eq(ok, true, 'silenced: ' + id + ' still works (it is chemistry, not magic)');
    });
    A().addStatus(raven(j), 'silenced', { turns: 2 }, null);
    t.eq(DD.Combat.canUse(raven(j), give(raven(j), 'jos_omen', 1)), 'Silenced!', 'silenced raven: no Ill Omen');
    t.eq(DD.Combat.canUse(raven(j), give(raven(j), 'jos_peck', 1)), true, 'silenced raven: still pecks');
    ['stun', 'sheep', 'sleep', 'frozen'].forEach(function (st) {
      j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
      A().addStatus(j, st, { turns: 2 }, null);
      ALL_SKILLS.slice(0, 12).forEach(function (id) {
        const ok = DD.Combat.canUse(j, give(j, id, 1));
        t.ok(ok !== true, st + ': ' + id + ' refused (' + ok + ')');
      });
    });
    // v2: a stun applied on his own turn costs him his next turn — but his raven still gets its turn
    j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    A().addStatus(j, 'stun', { turns: 1 }, foes()[0]);
    DD.Combat.endTurn();
    t.ok(S().round === 2 && DD.Combat.current() === j && j.ap === 0 && raven(j).ap === 2, 'round 2: Josiah stunned (0 AP), the raven acts on his turn');
    t.ok(DD.Combat.canUse(j, j.basic) !== true && DD.Combat.canUse(raven(j), give(raven(j), 'jos_omen', 1)) === true, 'he can\'t act, the raven can');
    DD.Combat.endTurn();
    t.ok(S().round === 3 && j.ap === 3 && !has(j, 'stun'), 'round 3: back to normal');
    // without a raven, his stunned turn passes by itself
    j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }], ravenAt: null });
    A().addStatus(j, 'stun', { turns: 1 }, foes()[0]);
    DD.Combat.endTurn();
    t.ok(S().round === 3 && DD.Combat.current() === j && j.ap === 3, 'no raven: the stunned turn passes (round 3, 3 AP)');
    // charmed by a foe: can't hurt the charmer (Plague Flask does nothing to it, Poison included), still hurts others
    j = fight({ enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: null });
    let f = foes();
    A().addStatus(j, 'charmed', { turns: 2 }, f[0]);
    cast(t, j, 'jos_plague_flask', 1, 4, 4, 'charmed flask');
    t.eq(f[0].hp + '/' + f[1].hp, '14/12', 'charmed: no damage to the charmer, the other foe takes 2');
    t.eq(stacks(f[0], 'poison') + '/' + stacks(f[1], 'poison'), '0/3', 'charmed: no Poison on the charmer either (damage on a timer)');
    // not enough AP
    j = fight({ enemies: [{ id: 'test_grunt', x: 3, y: 4 }] });
    j.ap = 2;
    t.eq(DD.Combat.canUse(j, give(j, 'jos_murder', 1)), 'Not enough AP.', 'Murder of Crows needs 3 AP');
    j.ap = 1;
    t.eq(DD.Combat.canUse(j, give(j, 'jos_plague_flask', 1)), 'Not enough AP.', 'Plague Flask needs 2 AP');
    t.eq(DD.Combat.canUse(j, give(j, 'jos_cane', 1)), true, 'the cane needs 1');
    // executes with nobody on the target tile (null targetUnit) and on map corners: nothing breaks
    j = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }], w: 7, h: 7 });
    ALL_SKILLS.forEach(function (id) {
      for (let lv = 1; lv <= DD.getSkill(id).levels.length; lv++) {
        [{ x: 0, y: 0 }, { x: 6, y: 6 }, { x: 3, y: 3 }].forEach(function (p) {
          const user = DD.getSkill(id).owner === 'summon' ? raven(j) : j;
          if (!user) return;
          const slot = give(user, id, lv);
          const r = t.tryRun(id + ' @' + p.x + ',' + p.y, function () {
            return DD.Combat._action(function () { return DD.Combat.resolveSkill(user, slot, p, { pay: false }); });
          });
          t.ok(r !== undefined, id + ' L' + lv + ' resolves on an empty / corner tile');
        });
      }
    });
    // the target dies mid-skill
    j = fight({ allies: [{ id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_minion', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: null });
    f = foes();
    f[0].hp = 1;
    cast(t, j, 'jos_plague_flask', 1, 4, 4, 'flask kills the minion');
    t.ok(f[0].dead && stacks(f[0], 'poison') === 0, 'dead minion gets no Poison');
    t.eq(stacks(f[1], 'poison'), 3, 'its neighbour still does');
    j = fight({ enemies: [{ id: 'test_minion', x: 3, y: 4 }], ravenAt: null });
    f = foes();
    f[0].hp = 3;
    j.hp = 5;
    cast(t, j, 'jos_leeches', 1, 3, 4, 'leeches kill the minion');
    t.ok(f[0].dead && j.hp === 8, 'a dying patient donates only the 3 HP it had');
    j = fight({ enemies: [{ id: 'test_minion', x: 6, y: 4 }, { id: 'test_grunt', x: 7, y: 4 }] });
    f = foes();
    f[0].hp = 3;
    cast(t, j, 'jos_raven_dive', 3, 6, 4, 'dive III kills');
    t.ok(f[0].dead && !has(f[0], 'dazzled'), 'killed by the dive: no Dazzle on a corpse');
    j = fight({ enemies: [{ id: 'test_minion', x: 4, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }], ravenAt: null });
    f = foes();
    f[0].hp = 2;
    cast(t, j, 'jos_volatile', 1, 4, 4, 'brew kills the middle');
    t.ok(f[0].dead && f[1].x === 6, 'dead middle unit is not pushed; the living one is');
    j = fight({ enemies: [{ id: 'test_minion', x: 4, y: 4 }], ravenAt: null });
    f = foes();
    f[0].hp = 1;
    A().addStatus(f[0], 'marked', { stacks: 1 }, null);
    cast(t, j, 'jos_quarantine', 1, 4, 4, 'quarantine a doomed minion');
    t.ok(has(f[0], 'root') && has(f[0], 'vulnerable') && f[0].hp === 1, 'Quarantine deals no damage (the mark stays)');
    // the flying raven may land over water and pits, and the summon never ends on an occupied or wall tile
    j = fight({ enemies: [{ id: 'test_grunt', x: 6, y: 4 }], ravenAt: null,
      terrain: function (tl) { if (tl.x === 6 && (tl.y === 3 || tl.y === 5)) tl.t = 'deep_water'; if (tl.x === 5 && tl.y === 4) tl.t = 'wall'; if (tl.x === 7 && tl.y === 4) tl.t = 'pit'; } });
    cast(t, j, 'jos_raven_dive', 1, 6, 4, 'dive over the deep end');
    const r = raven(j);
    t.ok(!!r && DD.Grid.isWalkable(r.x, r.y, r) && DD.Grid.dist(r, foes()[0]) <= 2, 'the new raven hovers somewhere sensible (' + (r && r.x + ',' + r.y) + ')');
    if (T.contentHelpers && T.contentHelpers.sanity) T.contentHelpers.sanity(t, 'edge cases');
  });

  // ---- attacks of opportunity ----------------------------------------------------------------------------
  T.suite('hero_josiah: attacks of opportunity (walking off a foe provokes, his cane never strikes, the raven does, dives and blasts never provoke)', function (t) {
    if (!loaded(t)) return;
    let aoo = 0;
    const off = DD.Events.on('opportunity:attack', function () { aoo++; });
    try {
      // 1. Josiah walks away from an adjacent grunt: the move preview warns him, the grunt stabs once (4), he walks on
      let j = fight({ enemies: [{ id: 'test_grunt', x: 2, y: 4 }], ravenAt: { x: 7, y: 7 } });
      let g = foes()[0];
      t.eq(DD.Combat.provokes(j, 1, 7).map(function (p) { return p.unitId + ':' + p.dmg; }).join(','), g.id + ':4', 'move preview: the grunt would stab for 4');
      aoo = 0;
      t.ok(DD.Combat.move(j, 1, 7), 'Josiah walks off');
      t.eq(j.x + ',' + j.y + ' ' + (j.maxHp - j.hp) + ' ' + aoo, '1,7 4 1', 'stabbed once (4) as he leaves, then he walks on');
      t.eq(g.oppRound, S().round, 'the grunt spent its attack of opportunity for the round');
      t.ok(!DD.Combat.canUndo(), 'a move that provoked can\'t be undone');

      // 2. his cane reaches 2 tiles, so it is not a melee basic: foes walk away from him for free
      j = fight({ enemies: [{ id: 'test_grunt', x: 2, y: 4 }], ravenAt: null });
      g = foes()[0];
      t.eq(DD.Act.opportunitySlot(j), null, 'House Call (reach 2) makes no attacks of opportunity');
      aoo = 0;
      t.ok(DD.AI.moveTo(g, 5, 4), 'the grunt walks away from Josiah');
      t.eq(g.hp + ' ' + aoo, '14 0', 'unpunished');
      // ...even when Dazzle shrinks the cane to reach 1 (a melee basic by the rule): flags.noOpportunity
      j = fight({ enemies: [{ id: 'test_grunt', x: 2, y: 4 }], ravenAt: null });
      g = foes()[0];
      A().addStatus(j, 'dazzled', { turns: 2 }, g);
      t.eq(DD.Targeting.range(j, DD.getSkill('jos_cane'), 1).join('-'), '1-1', 'Dazzled: the cane reaches 1 tile');
      t.eq(DD.Act.opportunityOf(j, g), null, 'Dazzled Josiah still makes no attacks of opportunity');
      aoo = 0;
      t.ok(DD.AI.moveTo(g, 5, 4), 'the grunt walks away from the Dazzled Josiah');
      t.eq(g.hp + ' ' + aoo, '14 0', 'unpunished');

      // 3. the raven's Peck is melee: a foe walking away from it is pecked (raven skill level 2 from Josiah L4: 3)
      [[1, 2], [4, 3]].forEach(function (c) {
        j = fight({ level: c[0], enemies: [{ id: 'test_grunt', x: 5, y: 4 }, { id: 'test_grunt', x: 5, y: 6 }], ravenAt: { x: 5, y: 5 } });
        const r = raven(j), f = foes();
        const sl = DD.Act.opportunitySlot(r);
        t.eq(sl && sl.id, 'jos_peck', 'L' + c[0] + ': the raven strikes with Peck');
        t.ok(DD.AI.moveTo(f[0], 8, 4), 'L' + c[0] + ': a grunt walks away from the raven');
        t.eq(14 - f[0].hp, c[1], 'L' + c[0] + ': pecked for ' + c[1] + ' on its way out');
        t.ok(DD.AI.moveTo(f[1], 8, 6), 'L' + c[0] + ': the second grunt leaves too');
        t.eq(f[1].hp, 14, 'L' + c[0] + ': at most one attack of opportunity per round');
        DD.Combat.endTurn();
        t.ok(S().round === 2 && DD.Combat.current() === j, 'L' + c[0] + ': round 2');
        A().teleport(f[1], 5, 6, { fx: false, noEnter: true });
        t.ok(DD.AI.moveTo(f[1], 8, 6), 'L' + c[0] + ': it tries again in round 2');
        t.eq(14 - f[1].hp, c[1], 'L' + c[0] + ': a new round, a new peck');
      });
      // ...not while it is stunned, asleep, frozen or a sheep
      ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (st) {
        j = fight({ enemies: [{ id: 'test_grunt', x: 5, y: 4 }], ravenAt: { x: 5, y: 5 } });
        A().addStatus(raven(j), st, { turns: 1 }, null);
        t.ok(DD.AI.moveTo(foes()[0], 8, 4), st + ' raven: the grunt walks away');
        t.eq(foes()[0].hp, 14, st + ' raven: no peck');
      });

      // 4. Raven Dive moves the raven by teleport: leaving a foe's side that way never provokes...
      j = fight({ enemies: [{ id: 'test_grunt', x: 2, y: 3 }, { id: 'test_grunt', x: 6, y: 4 }] });
      let r = raven(j);
      let f = foes();
      t.eq(r.x + ',' + r.y + ' ' + DD.Grid.dist(r, f[0]), '1,3 1', 'the raven starts next to a grunt');
      aoo = 0;
      cast(t, j, 'jos_raven_dive', 1, 6, 4, 'dive at the far grunt');
      t.eq(DD.Grid.dist(r, f[1]) + ' ' + r.hp + '/' + r.maxHp + ' ' + aoo, '1 10/10 0', 'the raven swooped away untouched');
      // ...while walking (flying) off a foe is a move action like any other
      j = fight({ enemies: [{ id: 'test_grunt', x: 2, y: 3 }] });
      r = raven(j);
      aoo = 0;
      t.ok(DD.Combat.move(r, 1, 0), 'the raven flies off on its own wings');
      t.eq((r.maxHp - r.hp) + ' ' + aoo, '4 1', 'stabbed as it leaves (4)');

      // 5. Volatile Brew's pushes never provoke: the knight and the raven are blown off the grunt (and it off them)
      j = fight({ allies: [{ id: 'test_knight', x: 4, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }], ravenAt: { x: 4, y: 3 } });
      g = foes()[0];
      aoo = 0;
      cast(t, j, 'jos_volatile', 1, 4, 4, 'bomb the scrum');
      t.eq(knight().x + ',' + knight().y + ' ' + raven(j).x + ',' + raven(j).y + ' ' + g.x + ',' + g.y, '4,6 4,2 5,4', 'everyone blown apart');
      t.eq(aoo + ' ' + (knight().oppRound || 0) + ' ' + (raven(j).oppRound || 0) + ' ' + (g.oppRound || 0), '0 0 0 0', 'no attack of opportunity on anyone');

      // 6. Raven Dive III Dazzles: a Dazzled foe strikes nobody as they leave, through its next turn
      j = fight({ enemies: [{ id: 'test_grunt', x: 2, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], ravenAt: { x: 7, y: 1 } });
      g = foes()[0];
      cast(t, j, 'jos_raven_dive', 3, 2, 4, 'Raven Dive III on the grunt next to him');
      t.ok(has(g, 'dazzled'), 'Dazzled');
      aoo = 0;
      t.eq(DD.Combat.provokes(j, 1, 7).length, 0, 'move preview: nothing provoked');
      t.ok(DD.Combat.move(j, 1, 7), 'Josiah strolls off');
      t.eq((j.maxHp - j.hp) + ' ' + aoo, '0 0', 'Dazzled: no stab');
      DD.Combat.endTurn();
      t.ok(S().round === 2 && !has(g, 'dazzled'), 'round 2: the Dazzle wore off at the end of the grunt\'s turn');
      A().teleport(j, 1, 4, { fx: false, noEnter: true });
      t.ok(DD.Combat.move(j, 1, 7), 'he tries the same stroll in round 2');
      t.eq(j.maxHp - j.hp, 4, 'and gets stabbed');

      // 7. Quarantine's Root keeps a foe from walking off, not from striking (Root is not a stun)
      j = fight({ enemies: [{ id: 'test_grunt', x: 2, y: 4 }], ravenAt: { x: 2, y: 5 } });
      g = foes()[0];
      cast(t, j, 'jos_quarantine', 1, 2, 4, 'Quarantine the grunt next to him');
      t.ok(!DD.AI.moveTo(g, 5, 4) && g.x === 2 && g.hp === 14, 'Rooted: it can\'t walk away from the raven (no peck either)');
      t.ok(DD.Combat.move(j, 1, 7), 'Josiah walks off');
      t.eq(j.maxHp - j.hp, 4, 'a Rooted grunt still stabs him as he leaves');
    } finally { off(); }
    if (T.contentHelpers && T.contentHelpers.sanity) T.contentHelpers.sanity(t, 'attacks of opportunity');
  });

  // ---- AutoPlay ------------------------------------------------------------------------------------------
  T.suite('hero_josiah: AutoPlay battles with the fixture party, acts 1-3 at L1/3/5 (and his kit gets used)', function (t) {
    if (!loaded(t)) return;
    const counts = {};
    const orig = DD.Combat.useSkill;
    DD.Combat.useSkill = function (unit, slot) {
      const ok = orig.apply(DD.Combat, arguments);
      if (ok && unit && (unit.defId === 'josiah' || unit.defId === 'jos_raven') && slot) counts[slot.id] = (counts[slot.id] || 0) + 1;
      return ok;
    };
    let wins = 0, total = 0, cursor = 0;
    const rows = [];
    const extras = POOL.slice(2);
    try {
      [1, 2, 3].forEach(function (act) {
        [1, 3, 5].forEach(function (lvl) {
          ['normal', 'elite', 'boss'].forEach(function (kind) {
            const enc = DD.getEncounter('test_a' + act + '_' + kind);
            if (!enc) return;
            // v2 leveling (one level-up per won fight): L3 = one new skill, L5 = two and some upgrades
            const nx = lvl >= 5 ? 2 : lvl >= 3 ? 1 : 0;
            const mine = POOL.slice(0, 2);
            for (let i = 0; i < nx; i++) mine.push(extras[(cursor + i) % extras.length]);
            cursor += nx;
            const sl = lvl >= 5 ? 2 : 1;
            const party = [DD.Combat.makeRunHero({ id: 'josiah', level: lvl, skills: mine.map(function (id) { return { id: id, level: sl }; }) })]
              .concat(['test_knight', 'test_cleric', 'test_mage'].map(function (id) { return DD.Combat.makeRunHero({ id: id, level: lvl, skillLevel: sl }); }));
            const rng = DD.RNG(seedOf(t, 'auto' + act + lvl + kind));
            const setup = DD.Encounter.build(enc, party, { rng: rng, difficulty: 'normal', act: act });
            DD.Combat.start(setup, { seed: rng.int(1, 1e9), headless: true, difficulty: 'normal', kind: kind });
            t.ok(!!raven(jos()), 'raven present in ' + enc.id);
            const res = DD.AutoPlay.runBattle(30);
            total++;
            if (res.result === 'victory') wins++;
            rows.push('A' + act + ' L' + lvl + ' ' + kind + ' [' + mine.slice(2).map(function (id) { return id.slice(4); }).join(', ') + ']: ' + res.result + ' in ' + res.rounds);
            t.ok(!res.timeout, enc.id + ' at L' + lvl + ' finished (' + res.result + ')');
            if (T.contentHelpers && T.contentHelpers.sanity) T.contentHelpers.sanity(t, enc.id + ' L' + lvl);
          });
        });
      });
    } finally { DD.Combat.useSkill = orig; }
    rows.forEach(function (r) { t.log(r); });
    t.log('wins ' + wins + '/' + total + ' · skill uses ' + JSON.stringify(counts));
    t.ok(wins >= Math.ceil(total * 0.5), 'the test party wins at least half its fights (' + wins + '/' + total + ')');
    ['jos_cane', 'jos_plague_flask', 'jos_draught', 'jos_peck'].forEach(function (id) { t.ok(counts[id] > 0, id + ' used by AutoPlay (' + (counts[id] || 0) + ')'); });
    const used = ALL_SKILLS.filter(function (id) { return counts[id] > 0; });
    t.ok(used.length >= 10, 'most of the kit gets used (' + used.length + '/' + ALL_SKILLS.length + ': ' + used.join(' ') + ')');
  });

  // ---- v2 requests (user, Nov 3) -------------------------------------------------------------------------
  /** How many draws `fn` takes from the fight's RNG (the stream is put back where fn left it). */
  function draws(fn) {
    const r = S().rng, s0 = r.getState();
    fn();
    const s1 = r.getState();
    r.setState(s0);
    let n = 0;
    while (r.getState() !== s1 && n < 20) { r.next(); n++; }
    r.setState(s1);
    return n;
  }
  T.suite('hero_josiah: v2 requests — Onyx, a cloud still reaches flyers, poison-proof foes, barrels, Mostly Medicine gets the downed up', function (t) {
    if (!loaded(t)) return;
    // 1. the raven is always Onyx: at combat start, re-summoned, for every Josiah; one RNG draw for the name, as before
    let j = fight({ heroes: [{ id: 'josiah', x: 1, y: 2 }, { id: 'josiah', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 7, y: 4 }] });
    t.eq(ravens().map(function (r) { return r.name; }).join(','), 'Onyx,Onyx', 'two Josiahs, two Onyxes (ravens are like that)');
    const rdef = DD.getSummon('jos_raven');
    t.eq(draws(function () { A().newSummonUnit(rdef, j, 0, 0, {}); }) - draws(function () { A().newSummonUnit(rdef, j, 0, 0, { name: 'X' }); }), 1,
      'naming Onyx still takes exactly one draw (seeded fights are unchanged)');
    const h = DD.getHero('josiah');
    t.ok(/Onyx/.test(h.passive.desc) && /Onyx/.test(rdef.desc) && /Onyx/.test(DD.getItem('jos_raven_treats').desc) &&
      /Onyx/.test(DD.skillDesc(DD.getSkill('jos_murder'), 1, null)), 'the passive, the raven, the Treats and Murder of Crows name Onyx');
    t.ok(h.barks.downed.indexOf('Tell Onyx... he was right...') >= 0 && h.barks.start.indexOf('Onyx, take notes. Mostly on their weak spots.') >= 0,
      'his barks call the raven Onyx');
    t.ok(!allTexts(h).some(function (s) { return /\b(my|the) raven\b/i.test(s) && !/Onyx/.test(s); }), 'no text says "my raven" / "the raven" without his name');

    // 2. Plague Miasma is a cloud (airborne): it doses flyers too, and poison-proof foes see no hazard in it
    j = fight({ enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 6, y: 2 }, { id: 'test_grunt', x: 7, y: 7 }], ravenAt: { x: 8, y: 0 } });
    let f = foes();
    f[0].flags = Object.assign({}, f[0].flags, { flying: true });   // test setup: two flying foes and a poison-proof one
    f[1].flags = Object.assign({}, f[1].flags, { flying: true });
    f[2].resist = Object.assign({}, f[2].resist, { poison: 0 });
    t.ok(DD.Grid.isFlying(f[0]) && !DD.Grid.feelsFloor(f[0]), 'setup: a flyer');
    cast(t, j, 'jos_miasma', 1, 4, 4);
    t.eq(stacks(f[0], 'poison'), 2, 'a flyer caught in the cloud is Poisoned 2 (a gas, not a floor)');
    t.ok(!!DD.Grid.hazardAt(3, 4, f[1]), 'a flying foe still sees the cloud as a hazard');
    A().moveAlong(f[1], [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 3 }]);
    t.eq(f[1].x + ',' + f[1].y + ' ' + stacks(f[1], 'poison'), '4,3 2', 'a flyer flying into the cloud is dosed on entry');
    t.eq(DD.getSurface('jos_miasma').hazardStatus, 'poison', 'the cloud declares what it does (hazardStatus: poison)');
    t.eq(DD.Grid.hazardAt(3, 4, f[2]), null, 'a poison-proof foe sees no hazard in it (it would path straight through)');
    t.ok(!!DD.Grid.hazardAt(3, 4, null) && !!DD.Grid.hazardAt(5, 4, f[1]), 'everyone else still does');
    // the raven flies over floor puddles and fire (engine: flyers ignore the floor) but not over his own side's cloud rules
    j = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }], surfaces: [{ x: 5, y: 4, id: 'fire', turns: 3 }, { x: 5, y: 5, id: 'poison', turns: 3 }],
      ravenAt: { x: 4, y: 4 } });
    let r = raven(j);
    A().moveAlong(r, [{ x: 5, y: 4 }, { x: 5, y: 5 }]);
    t.eq(r.hp + '/' + has(r, 'burn') + '/' + has(r, 'poison'), r.maxHp + '/false/false', 'Onyx flies over fire and poison puddles untouched');
    DD.Combat.endTurn();
    t.eq(r.hp + '/' + has(r, 'poison'), r.maxHp + '/false', 'and hovering over the puddle at turn end does nothing either');

    // 3. barrels: House Call (reach 2) sets one off; the raven's Peck too; Raven Dive at a barrel spends its AP and cooldown
    j = fight({ enemies: [{ id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 3, y: 4, id: 'barrel_explosive' }], ravenAt: { x: 8, y: 0 } });
    f = foes();
    let sl = give(j, 'jos_cane', 1);
    t.ok(DD.Targeting.validTargets(j, sl).some(function (q) { return q.obj && q.x === 3 && q.y === 4; }), 'House Call can be aimed at the barrel 2 tiles away');
    let pv = DD.Targeting.preview(j, sl, { x: 3, y: 4 });
    t.ok(pv.detonates === 'barrel_explosive' && pv.perUnit[f[0].id] && pv.perUnit[f[0].id].dmg === 8 && !pv.perUnit[j.id],
      'preview: it detonates, 8 to the grunt next to it, Josiah 2 tiles away is safe');
    t.eq(cast(t, j, 'jos_cane', 1, 3, 4, 'House Call at the barrel'), 1, 'it costs the poke\'s 1 AP');
    t.ok(!DD.Grid.tile(3, 4).obj && f[0].hp === 6 && f[1].hp === 14 && j.hp === j.maxHp, 'KABOOM: the barrel is gone, the grunt next to it took 8');
    j = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 5, y: 2, id: 'barrel_explosive' }], ravenAt: { x: 5, y: 3 } });
    r = raven(j);
    sl = give(r, 'jos_peck', 1);
    t.ok(DD.Combat.useSkill(r, sl, 5, 2), 'Onyx pecks the barrel');
    t.ok(!DD.Grid.tile(5, 2).obj && r.hp === r.maxHp - 8, 'it goes off in his face: Onyx eats the 8 fire himself (' + r.hp + '/' + r.maxHp + ')');
    j = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 4, y: 6, id: 'barrel_explosive' }], ravenAt: { x: 8, y: 0 } });
    sl = give(j, 'jos_raven_dive', 1);
    t.ok(DD.Targeting.validTargets(j, sl).some(function (q) { return q.obj && q.x === 4 && q.y === 6; }), 'Raven Dive can be aimed at a barrel');
    t.eq(cast(t, j, 'jos_raven_dive', 1, 4, 6, 'Raven Dive at the barrel'), 1, 'it costs 1 AP');
    t.ok(!DD.Grid.tile(4, 6).obj && j.skills[0].cd === 1, 'the barrel is gone and Raven Dive is on cooldown');
    // Prescribe Leeches at a barrel: the blast, but no drain (there was nothing to drink)
    j = fight({ enemies: [{ id: 'test_grunt', x: 8, y: 8 }], objects: [{ x: 3, y: 5, id: 'barrel_explosive' }], ravenAt: { x: 8, y: 0 } });
    j.hp = j.maxHp - 5;
    t.eq(cast(t, j, 'jos_leeches', 1, 3, 5, 'Leeches at the barrel'), 2, 'Leeches costs 2 AP');
    t.ok(!DD.Grid.tile(3, 5).obj && j.hp === j.maxHp - 5, 'the barrel blows, Josiah drains nothing from it');

    // 4. Mostly Medicine aimed at a downed ally gets it up with the healed HP (preview "UP! N HP"); it acts on its own slot
    [7, 9, 11].forEach(function (heal, i) {
      const lv = i + 1;
      j = fight({ allies: [{ id: 'test_knight', x: 3, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], ravenAt: null });
      const k = knight();
      A().kill(k, null);
      t.ok(k.downed, 'L' + lv + ': knight down');
      sl = give(j, 'jos_draught', lv);
      const at = DD.Targeting.validTargets(j, sl).filter(function (q) { return q.x === 3 && q.y === 4; })[0];
      t.ok(!!at && at.revive === true, 'L' + lv + ': the downed knight is a target for the potion (revive)');
      pv = DD.Targeting.preview(j, sl, { x: 3, y: 4 });
      const e = pv.perUnit[k.id];
      t.ok(!!e && e.revived && e.heal === heal && e.text.indexOf('UP! ' + heal + ' HP') >= 0, 'L' + lv + ': preview "UP! ' + heal + ' HP" (' + (e && e.text) + ')');
      t.eq(cast(t, j, 'jos_draught', lv, 3, 4), 1, 'L' + lv + ': 1 AP');
      t.ok(!k.downed && k.hp === heal && k.ap === 0, 'L' + lv + ': back up at ' + heal + ' HP with 0 AP (' + k.hp + ')');
      t.ok(S().log.some(function (l) { return /back up \(\d+ HP\), thanks to Josiah/.test(l.text); }), 'L' + lv + ': the normal revive line');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && k.ap === 3, 'L' + lv + ': its own turn comes with full AP');
    });
    // Leeches' self-heal (lifesteal) never gets anybody up; a dead raven is not "downed"
    j = fight({ allies: [{ id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_grunt', x: 3, y: 4 }], ravenAt: null });
    A().kill(knight(), null);
    cast(t, j, 'jos_leeches', 1, 3, 4);
    t.ok(knight().downed, 'Prescribe Leeches heals Josiah only: the downed knight stays down');
  });
})();
