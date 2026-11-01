/* Dungeons and Degenerates — tests/content/hero_zarathor.js
 * Suites 'hero_zarathor: …' for Zarathor, the Bedazzled (js/data/heroes/zarathor.js), v2 (initiative, own-turn
 * durations, no telegraphs, no Guard): the definition and its simplicity budget, every skill at every level in sandbox
 * fights (desc == effect: damage vs armor-free fixture foes, statuses and how many of their owner's turns they last,
 * displacement, summons, costs, cooldowns, charges, gold), the Drip Check passive, the signature, the items, previews vs
 * reality, edge cases (stunned / silenced / sheep / charmed user, not his turn, AP, deaths mid-skill, pits / lava / water,
 * map edges), combos with other heroes and AutoPlay battles at levels 1/3/5.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const ZAR = 'zarathor';
  const POOL = ['zar_fireball', 'zar_bling_throw', 'zar_hex', 'zar_bedazzle', 'zar_rebuke', 'zar_lasso', 'zar_strut',
    'zar_gold_plating', 'zar_statue', 'zar_wild_card'];
  const ALL_SKILLS = ['zar_basic', 'zar_signature'].concat(POOL);
  const STATUSES = ['zar_drip', 'zar_rebuke', 'zar_bedazzled'];
  const ITEMS = ['zar_ring_bling', 'zar_hellcard', 'zar_shades'];
  /** v1 mechanics that are gone in v2: no text of his may still promise them. */
  const REMOVED = /telegraph|intent|\bguard|planning phase|next round's attack|sparkle (counter|overload)|4th spell/i;

  // ---- helpers --------------------------------------------------------------------------------------------
  function ready(t) {
    if (DD.getHero(ZAR)) return true;
    t.skip('Zarathor is not loaded');
    return false;
  }
  /**
   * v2 sandbox that never ends on its own (custom objective), 9×9, 40 gold (Drip tier 0), heroes first in the listed
   * order (no dice): it is the first hero's turn, round 1. Enemies stand still unless cfg.enemyAi is true.
   */
  function fight(cfg) {
    return DD.Combat.sandbox(Object.assign({
      w: 9, h: 9, seed: 11, enemyAi: false, gold: 40,
      objective: { type: 'custom', text: 'Zarathor test' },
      encounter: { id: 'zar_test_arena', act: 1, checkObjective: function () { return null; } },
    }, cfg || {}));
  }
  function Z(x, y, skills, extra) { return Object.assign({ id: ZAR, x: x, y: y, level: 1, skills: skills || [] }, extra || {}); }
  function sk(id, level) { return { id: id, level: level || 1 }; }
  function E(x, y, id) { return { id: id || 'test_grunt', x: x, y: y }; }
  function H(id, x, y, extra) { return Object.assign({ id: id, x: x, y: y, level: 1 }, extra || {}); }
  function zar() { return DD.Combat.state.units.filter(function (u) { return u.defId === ZAR && !u.dead; })[0]; }
  function hero(id) { return DD.Combat.state.units.filter(function (u) { return u.defId === id && !u.dead; })[0]; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (s) { return s.id === id; })[0]; }
  function use(u, id, x, y) { const s = slotOf(u, id); return !!s && DD.Combat.useSkill(u, s, x, y); }
  function can(u, id) { const s = slotOf(u, id); return s ? DD.Combat.canUse(u, s) : 'no slot'; }
  function stacks(u, id) { const st = DD.Act.getStatus(u, id); return st ? st.stacks : 0; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function turnsOf(u, id) { const st = DD.Act.getStatus(u, id); return st ? st.turns : 0; }
  function surf(x, y) { const tl = DD.Grid.tile(x, y); return tl && tl.surface ? tl.surface.id : null; }
  function L(id, lv) { return DD.skillLevel(DD.getSkill(id), lv); }
  function desc(id, lv) { return DD.skillDesc(DD.getSkill(id), lv, null); }
  function valid(u, id, x, y) { const s = slotOf(u, id); return !!s && DD.Targeting.isValidTarget(u, s, x, y); }
  function cur() { return DD.Combat.current(); }
  function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }
  /** Damage events from `src` while fn runs: [{ target, element, amount, dealt, cause }]. */
  function recordHits(src, fn) {
    const out = [];
    DD.Act.addRule({ id: 'zar_test_rec', name: 'Recorder', hooks: { onTakeDamage: function (d) {
      if (d.source === src) out.push({ target: d.target, element: d.element, amount: d.amount, dealt: d.dealt, cause: d.cause });
    } } });
    try { fn(); } finally { DD.Act.removeRule('zar_test_rec'); }
    return out;
  }
  function surges(fn) {
    const list = [];
    const off = DD.Events.on('wildmagic:surge', function (e) { list.push(e); });
    try { fn(); } finally { off(); }
    return list;
  }
  /** Run fn and log, at the start ('s') and end ('e') of each of unit's own turns, whether it holds status id. */
  function statusByTurn(unit, id, fn) {
    const log = [];
    const a = DD.Events.on('turn:start', function (e) { if (e.unit === unit) log.push('s' + (has(unit, id) ? 1 : 0)); });
    const b = DD.Events.on('turn:end', function (e) { if (e.unit === unit) log.push('e' + (has(unit, id) ? 1 : 0)); });
    try { fn(); } finally { a(); b(); }
    return log.join(' ');
  }
  /** The log statusByTurn should show for a status that covers exactly n of the unit's turns, then one more turn. */
  function covers(n) {
    const out = [];
    for (let i = 1; i <= n; i++) out.push('s1', i < n ? 'e1' : 'e0');
    out.push('s0', 'e0');
    return out.join(' ');
  }
  function fingerprint(s) {
    return JSON.stringify([
      s.units.map(function (u) {
        return [u.id, u.x, u.y, u.hp, u.block, u.ap, u.apBank || 0, !!u.dead, !!u.downed, (u.statuses || []).map(function (st) { return [st.id, st.stacks, st.turns]; }),
          (u.intents || []).length, DD.Combat.slotsOf(u).map(function (sl) { return [sl.id, sl.cd, sl.uses]; }), u.data];
      }),
      s.grid.tiles.map(function (tl) { return [tl.t, tl.surface && [tl.surface.id, tl.surface.turns], tl.obj && [tl.obj.id, tl.obj.hp]]; }),
      s.hype, s.log.length, s.rng.getState(), s.sandboxGold, s.round, s.phase, s.current, s.turn, s.order,
    ]);
  }
  /** Numbers sane: finite, HP in bounds, nobody shares a tile or stands somewhere unwalkable. */
  function sane(t, label) {
    const s = DD.Combat.state, seen = {};
    let ok = true;
    s.units.forEach(function (u) {
      ['hp', 'maxHp', 'block', 'ap', 'x', 'y'].forEach(function (k) { if (typeof u[k] !== 'number' || !isFinite(u[k])) { ok = false; t.fail(label + ': ' + u.name + '.' + k + ' = ' + u[k]); } });
      if (u.hp < 0 || u.hp > u.maxHp) { ok = false; t.fail(label + ': ' + u.name + ' hp ' + u.hp + '/' + u.maxHp); }
      if (u.dead) return;
      const k = u.x + ',' + u.y;
      if (seen[k]) { ok = false; t.fail(label + ': ' + u.name + ' shares ' + k + ' with ' + seen[k]); }
      seen[k] = u.name;
      if (!u.downed && !DD.Grid.isWalkable(u.x, u.y, u)) { ok = false; t.fail(label + ': ' + u.name + ' on an unwalkable tile ' + k); }
    });
    if (!isFinite(s.hype) || s.hype < 0 || s.hype > 100) { ok = false; t.fail(label + ': hype ' + s.hype); }
    return ok;
  }

  // ---- definition ----------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: definition — v2 simple kit (stats, init, pool, passive, statuses, items, barks)', function (t) {
    if (!ready(t)) return;
    const h = DD.getHero(ZAR);
    t.eq(h.name, 'Zarathor', 'name');
    t.eq(h.epithet, 'the Bedazzled', 'epithet');
    t.ok(h.race === 'Tiefling' && h.cls === 'Warlock' && /fire/i.test(h.role) && /bling/i.test(h.role) && /wild magic/i.test(h.role), 'race / class / role: ' + h.role);
    t.ok(h.complexity >= 1 && h.complexity <= 3, 'complexity 1-3');
    t.eq(h.unlock, null, 'available from the start (v2: every hero is)');
    t.ok(/^#[0-9a-f]{6}$/i.test(h.color), 'UI colour');
    const sentences = (h.blurb.match(/[.!?](\s|$)/g) || []).length;
    t.ok(sentences >= 2 && sentences <= 3, 'blurb has 2-3 sentences (' + sentences + ')');
    t.ok(h.stats.hp === 24 && h.stats.ap === 3 && h.stats.mov === 4 && h.stats.armor === 0, 'DESIGN §6: ~24 HP, 3 AP, move 4');
    t.eq(h.stats.init, 1, 'v2: initiative modifier +1');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth +3-5 HP');
    t.ok(h.sprite && h.sprite.base === 'humanoid' && h.sprite.head.horns === 'tiefling' && h.sprite.tail === 'devil', 'tiefling sprite');
    t.ok(h.sprite.bling.indexOf('chain') >= 0 && h.sprite.head.face === 'sunglasses' && h.sprite.aura.kind === 'flames', 'bling, shades indoors, flames');
    t.eq(JSON.stringify(h.startingSkills), '["zar_fireball","zar_bling_throw"]', 'starts with fire and money');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'skill pool');
    t.ok(h.skillPool.length >= 9 && h.skillPool.length <= 10, 'pool of 9-10 (DESIGN v2: 8-10, content: 9-11)');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic / signature never socketed');
    t.eq(JSON.stringify(h.summons), '["zar_statue"]', 'summons listed');
    // the passive is ONE rule: gold → damage, counted at combat start and at the start of his turns
    t.ok(h.passive && h.passive.name === 'Drip Check', 'passive Drip Check');
    t.eq(Object.keys(h.passive.hooks).sort().join(','), 'onCombatStart,onTurnStart', 'passive hooks: the count only (no spell counter any more)');
    t.ok(/50 gold/.test(h.passive.desc) && /\+10%/.test(h.passive.desc) && /\+30%/.test(h.passive.desc) && words(h.passive.desc) <= 22, 'passive desc says the rule in one breath: ' + h.passive.desc);
    t.ok(!DD.getSkill('zar_chaos_bolt') && !DD.getStatus('zar_sparkle'), 'v1 Chaos Bolt (4-way element chain) and the Sparkle counter are gone');

    const aps = {}, kinds = {};
    let charged = 0, cooled = 0;
    ALL_SKILLS.forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === ZAR && id.indexOf('zar_') === 0, id + ' registered, owned, prefixed');
      if (!s) return;
      t.ok(typeof s.icon === 'string' && s.icon.length >= 1 && s.icon.length <= 3, id + ' has one emoji icon');
      t.ok(typeof s.flavor === 'string' && s.flavor.length > 0 && s.flavor.length <= 120, id + ' flavor ≤ 120');
      const want = id === 'zar_basic' || id === 'zar_signature' ? 1 : 3;
      t.eq(s.levels.length, want, id + ' levels');
      const faces = [];
      for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = desc(id, lv);
        t.ok(d && !/undefined|NaN|\[object/.test(d), id + ' L' + lv + ' desc without a user: ' + d);
        // DESIGN §6 Simplicity: the desc reads in one breath (about 12 words + numbers)
        t.ok(words(d) <= 26, id + ' L' + lv + ' desc is short (' + words(d) + ' words): ' + d);
        t.ok(!REMOVED.test(d), id + ' L' + lv + ' desc names no removed v1 mechanic');
        const Lv = DD.skillLevel(s, lv);
        ['dmg', 'gold', 'block', 'bonus', 'fire', 'len', 'pull', 'hp', 'turns', 'range', 'r'].forEach(function (k) {
          // a radius of 1 reads "next to it"
          if (typeof Lv[k] === 'number' && Lv[k] > (k === 'r' ? 1 : 0)) t.ok(new RegExp('(^|[^0-9])' + Lv[k] + '(?![0-9])').test(d), id + ' L' + lv + ' desc shows its ' + k + ' ' + Lv[k]);
        });
        faces.push(d);
      }
      if (want === 3) t.ok(faces[0] !== faces[1] && faces[1] !== faces[2], id + ': every level reads differently');
      if (s.hype) return;
      aps[DD.resolve(s.ap, s.levels[0], null, 1)] = 1;
      kinds[s.kind] = 1;
      if (s.charges) charged++;
      if (s.cooldown) cooled++;
    });
    t.eq(DD.getSkill('zar_signature').hype, 100, 'signature costs 100 Hype');
    const basic = DD.getSkill('zar_basic');
    t.ok(basic.ap === 1 && basic.levels[0].dmg >= 4 && basic.levels[0].dmg <= 6, 'basic: 1 AP, 4-6 damage');
    const sig = DD.getSkill('zar_signature');
    t.ok(sig.levels[0].dmg >= 15 && sig.levels[0].dmg <= 25, 'signature 15-25 damage');
    t.ok(aps[1] && aps[2], 'a mix of 1 and 2 AP costs');
    t.ok(charged === 2 && cooled >= 7, 'two big skills with charges (' + charged + '), the rest on cooldowns (' + cooled + ')');
    t.ok(kinds.spell && kinds.attack && kinds.buff && kinds.move && kinds.summon, 'kinds: ' + Object.keys(kinds).join(','));
    t.ok(DD.getSkill('zar_hex').tags.indexOf('vulnerable') >= 0 && DD.getSkill('zar_lasso').tags.indexOf('pull') >= 0, 'the combo setups are tagged (Vulnerable, pull)');

    STATUSES.forEach(function (id) {
      const st = DD.getStatus(id);
      t.ok(!!st && st.type === 'buff', 'status ' + id);
      if (st) [{ stacks: 1, turns: 1, data: {} }, { stacks: 3, turns: -1, data: { dmg: 9, bonus: 6 } }].forEach(function (inst) {
        const d = st.desc(inst);
        t.ok(typeof d === 'string' && d.length > 10 && !/undefined|NaN/.test(d) && !REMOVED.test(d), id + ' desc: ' + d);
      });
    });
    t.eq(DD.getStatus('zar_rebuke').decay, 'turnStart', 'the ward lasts until its owner\'s next turn starts');
    const statue = DD.getSummon('zar_statue');
    t.ok(statue && statue.flags.immovable && statue.ap === 0 && statue.mov === 0 && statue.sprite && statue.sprite.base === 'humanoid', 'statue summon');

    const items = ITEMS.map(function (id) { return DD.getItem(id); });
    t.ok(items.every(function (it) { return it && it.hero === ZAR && it.desc && it.flavor && !REMOVED.test(it.desc); }), '3 hero items with desc + flavor');
    t.ok(items.some(function (it) { return it.rarity === 'rare'; }) && items.some(function (it) { return it.rarity === 'legendary'; }), 'a rare and a legendary');
    t.ok(items.every(function (it) { return !(it.stats && it.stats.block) && !(it.hooks && (it.hooks.modifyGuard || it.hooks.onCombatStart)); }), 'v2: no starting Block, no Guard hooks');

    const names = ['Marwyn', 'Syllamin', 'Marbles', 'Josiah', 'Ellaria', 'Buga', 'Slate', 'Sparrow', 'Corelos', 'Kiri', 'Betty', 'Basanos'];
    let mentions = 0;
    ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'].forEach(function (k) {
      const lines = h.barks[k];
      t.ok(Array.isArray(lines) && lines.length >= 4 && lines.length <= 6, 'barks.' + k + ': 4-6 lines');
      (lines || []).forEach(function (l) {
        t.ok(typeof l === 'string' && l.length > 0 && l.length <= 70 && !REMOVED.test(l), 'bark ≤ 70 chars: ' + l);
        if (names.some(function (n) { return l.indexOf(n) >= 0; })) mentions++;
      });
    });
    t.ok(mentions >= 6, 'barks name other heroes now and then, new recruits included (' + mentions + ')');
    t.ok(!REMOVED.test(h.blurb) && !REMOVED.test(h.role) && !REMOVED.test(h.passive.desc), 'blurb / role / passive mention no removed mechanic');
    const ids = Object.keys(DD.defs.skills).concat(Object.keys(DD.defs.statuses), Object.keys(DD.defs.items), Object.keys(DD.defs.summons))
      .filter(function (id) { const d = DD.getSkill(id) || DD.getItem(id); return (d && d.owner === ZAR) || (d && d.hero === ZAR); });
    t.ok(ids.length >= 15 && ids.every(function (id) { return id.indexOf('zar_') === 0; }), 'every def is prefixed zar_ (' + ids.length + ')');
  });

  // ---- basic ---------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Eldritch Bling (5 fire within 4, ignites its tile)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [Z(1, 4)], enemies: [E(5, 4), E(6, 4), E(8, 8)], gold: 0,
      surfaces: [{ x: 5, y: 4, id: 'oil', turns: 5 }, { x: 6, y: 4, id: 'oil', turns: 5 }] });
    let z = zar();
    const g1 = at(5, 4), g2 = at(6, 4);
    t.ok(cur() === z && z.ap === 3 && DD.Combat.state.round === 1, 'v2: his turn, round 1, 3 AP');
    t.ok(DD.Targeting.isValidTarget(z, z.basic, 5, 4), 'reaches a foe 4 tiles away');
    t.ok(!DD.Targeting.isValidTarget(z, z.basic, 6, 4), 'but not one 5 tiles away');
    const hits = recordHits(z, function () { t.ok(DD.Combat.useSkill(z, z.basic, 5, 4), 'basic used'); });
    t.eq(z.ap, 2, '1 AP');
    t.eq(hits[0] && hits[0].element, 'fire', 'fire damage');
    t.eq(hits.filter(function (h) { return h.cause === 'skill'; }).length, 1, 'one hit');
    t.eq(g1.hp, 14 - 5 - 0, 'deals 5');
    t.ok(surf(5, 4) === 'fire' && surf(6, 4) === 'fire', 'its tile ignites: the oil slick goes up along its length');
    t.ok(has(g2, 'burn'), 'a foe standing in the burning slick catches fire');
    t.eq(slotOf(z, 'zar_basic').cd, 0, 'no cooldown');
    t.ok(DD.Combat.useSkill(z, z.basic, 5, 4), 'usable again the same turn');
    // a target on bare floor: damage, no Burn rider; water under it boils to steam (and the steam blocks his sight)
    fight({ heroes: [Z(1, 4)], enemies: [E(4, 4), E(3, 6), E(8, 8)], gold: 0, terrain: function (tl) { if (tl.x === 3 && tl.y === 6) tl.t = 'water'; } });
    z = zar();
    DD.Combat.useSkill(z, z.basic, 4, 4);
    t.ok(at(4, 4).hp === 9 && !has(at(4, 4), 'burn'), 'bare floor: 5 damage, no Burn');
    t.ok(DD.Combat.useSkill(z, z.basic, 3, 6), 'a foe standing in water');
    t.eq(surf(3, 6), 'steam', '...the water under it steams');
    // line of sight
    fight({ heroes: [Z(1, 4)], enemies: [E(4, 4), E(8, 8)], gold: 0, objects: [{ x: 2, y: 4, id: 'pillar' }] });
    t.ok(!DD.Targeting.isValidTarget(zar(), zar().basic, 4, 4), 'needs line of sight (a pillar blocks it)');
  });

  // ---- fireball ------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Gold-Plated Fireball (every level: radius-1 fire on foes only, ignites, cooldown 1)', function (t) {
    if (!ready(t)) return;
    let z;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('zar_fireball', lv);
      fight({ heroes: [Z(1, 4, [sk('zar_fireball', lv)]), H('test_knight', 4, 4)], enemies: [E(5, 4), E(5, 5), E(6, 4), E(5, 2), E(8, 8)], gold: 0 });
      z = zar();
      const knight = at(4, 4), far = at(5, 2), hit = [at(5, 4), at(5, 5), at(6, 4)];
      t.ok(!valid(z, 'zar_fireball', 7, 4), 'L' + lv + ': range 5');
      t.ok(use(z, 'zar_fireball', 5, 4), 'L' + lv + ': cast at range 4');
      hit.forEach(function (g) {
        t.eq(g.hp, 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' fire damage at ' + g.x + ',' + g.y);
        t.ok(!has(g, 'burn'), 'L' + lv + ': no Burn rider on bare floor (desc: damage + ignite)');
      });
      t.eq(knight.hp, knight.maxHp, 'L' + lv + ': the ally inside the blast is spared');
      t.eq(far.hp, 14, 'L' + lv + ': a foe 2 tiles from the centre is untouched');
      t.eq(z.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(DD.Combat.state.hype, 4, 'L' + lv + ': +4 Hype for hitting 2+ foes');
      t.ok(/cooldown/i.test(String(can(z, 'zar_fireball'))), 'L' + lv + ': not again this turn');
      // cooldown 1 = unusable during his next turn, back the turn after (own turns, v2)
      DD.Combat.endRound();
      z = zar();
      t.ok(cur() === z && DD.Combat.state.round === 2 && /cooldown/i.test(String(can(z, 'zar_fireball'))), 'L' + lv + ': round 2 (his next turn): still cooling down');
      DD.Combat.endRound();
      t.ok(DD.Combat.state.round === 3 && can(z, 'zar_fireball') === true, 'L' + lv + ': round 3: ready again');
    });
    // explosive barrel + water in the blast
    fight({ heroes: [Z(1, 4, [sk('zar_fireball', 1)])], enemies: [E(6, 4), E(8, 8)], gold: 0,
      objects: [{ x: 5, y: 4, id: 'barrel_explosive' }], terrain: function (tl) { if (tl.x === 5 && tl.y === 5) tl.t = 'water'; } });
    z = zar();
    t.ok(use(z, 'zar_fireball', 5, 4), 'fireball at an explosive barrel');
    t.eq(DD.Grid.tile(5, 4).obj, null, 'the barrel goes off');
    t.eq(at(6, 4).hp, 14 - 5 - 8, 'the foe beside it eats the fireball and the barrel');
    t.eq(surf(5, 5), 'steam', 'water in the blast boils into steam');
    // oil under a foe: the area ignites, the slick burns, the foe in it Burns
    fight({ heroes: [Z(1, 4, [sk('zar_fireball', 1)])], enemies: [E(5, 4), E(8, 8)], gold: 0,
      surfaces: [{ x: 5, y: 4, id: 'oil', turns: 5 }, { x: 6, y: 4, id: 'oil', turns: 5 }, { x: 7, y: 4, id: 'oil', turns: 5 }] });
    z = zar();
    use(z, 'zar_fireball', 5, 4);
    t.ok(surf(7, 4) === 'fire' && stacks(at(5, 4), 'burn') === 2, 'oil in the blast ignites along the slick; the foe in it gets Burn 2');
    // Wet foe: still takes the full fire damage
    fight({ heroes: [Z(1, 4, [sk('zar_fireball', 3)])], enemies: [E(5, 4)], gold: 0 });
    z = zar();
    DD.Act.addStatus(at(5, 4), 'wet', { turns: 2 });
    t.ok(use(z, 'zar_fireball', 5, 4) && at(5, 4).hp === 7, 'a Wet foe still takes 7');
    // map corner: the blast is clipped, nothing breaks
    fight({ heroes: [Z(2, 2, [sk('zar_fireball', 1)])], enemies: [E(0, 0), E(8, 8)], gold: 0 });
    z = zar();
    t.ok(use(z, 'zar_fireball', 0, 0), 'fireball into the corner');
    t.eq(at(0, 0).hp, 9, 'corner foe hit');
    t.ok(sane(t, 'corner fireball'), 'state sane');
  });

  // ---- throw money -------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Throw Money At It (every level: gold → hit + Dazzle for its next turn; broke; Hellcard)', function (t) {
    if (!ready(t)) return;
    let z;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('zar_bling_throw', lv);
      fight({ heroes: [Z(1, 4, [sk('zar_bling_throw', lv)])], enemies: [E(5, 4), E(6, 4), E(6, 5)], gold: 40 });
      z = zar();
      const tg = at(5, 4), side = at(6, 4);
      t.ok(!valid(z, 'zar_bling_throw', 6, 5), 'L' + lv + ': range 5');
      t.ok(use(z, 'zar_bling_throw', 5, 4), 'L' + lv + ': money thrown');
      t.eq(DD.Act.gold(), 40 - Lv.gold, 'L' + lv + ': spends ' + Lv.gold + ' gold');
      t.eq(tg.hp, 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage');
      t.ok(has(tg, 'dazzled'), 'L' + lv + ': target Dazzled');
      t.ok(side.hp === 14 && !has(side, 'dazzled'), 'L' + lv + ': only the target');
      t.ok(z.ap === 2 && slotOf(z, 'zar_bling_throw').cd === 1, 'L' + lv + ': 1 AP, cooldown 1');
      // v2: turns 1 from his turn = the target's next turn, gone when that turn ends
      t.eq(statusByTurn(tg, 'dazzled', function () { DD.Combat.endRound(); DD.Combat.endRound(); }), covers(1), 'L' + lv + ': Dazzled for exactly its next turn');
    });
    // a dazzled foe's attack on its turn lands a tile off: nobody is hit (no hero stands next to its victim)
    let missed = 0;
    for (let seed = 1; seed <= 6; seed++) {
      fight({ seed: seed, enemyAi: true, heroes: [Z(1, 4, [sk('zar_bling_throw', 1)]), H('test_cleric', 4, 4)], enemies: [E(5, 4)], gold: 40 });
      z = zar();
      const cleric = at(4, 4), grunt = at(5, 4);
      use(z, 'zar_bling_throw', 5, 4);
      const hp0 = [z.hp, cleric.hp];
      const hits = recordHits(grunt, function () { DD.Combat.endRound(); });
      if (hits.filter(function (h) { return h.target.side === 'hero'; }).length === 0 && z.hp === hp0[0] && cleric.hp === hp0[1]) missed++;
      t.ok(!has(grunt, 'dazzled'), 'seed ' + seed + ': the Dazzle is spent after its turn');
    }
    t.eq(missed, 6, 'a dazzled grunt never lands its stab on its next turn (' + missed + '/6)');
    // without the Dazzle it does hit (control)
    fight({ enemyAi: true, heroes: [Z(1, 4), H('test_cleric', 4, 4)], enemies: [E(5, 4)], gold: 40 });
    const cl = at(4, 4);
    DD.Combat.endRound();
    t.ok(cl.hp < cl.maxHp, 'control: an undazzled grunt stabs the cleric');

    // broke
    fight({ heroes: [Z(1, 4, [sk('zar_bling_throw', 1), sk('zar_gold_plating', 1)])], enemies: [E(5, 4)], gold: 4 });
    z = zar();
    const why = can(z, 'zar_bling_throw');
    t.ok(typeof why === 'string' && /broke/i.test(why), 'too broke to throw money: ' + why);
    t.ok(/broke/i.test(String(can(z, 'zar_gold_plating'))), 'too broke to gold-plate');
    t.ok(!use(z, 'zar_bling_throw', 5, 4), 'useSkill refuses');
    DD.Combat._action(function () { DD.Combat.resolveSkill(z, slotOf(z, 'zar_bling_throw'), { x: 5, y: 4 }, { pay: true }); });
    t.ok(at(5, 4).hp === 14 && DD.Act.gold() === 4 && !has(at(5, 4), 'dazzled'), 'forced through anyway: the card is declined, nothing happens');
    // Platinum Hellcard: the missing gold becomes an HP cost
    fight({ heroes: [Z(1, 4, [sk('zar_bling_throw', 1)], { items: ['zar_hellcard'] })], enemies: [E(5, 4)], gold: 2 });
    z = zar();
    const def = DD.getSkill('zar_bling_throw');
    t.eq(can(z, 'zar_bling_throw'), true, 'Hellcard: usable while short on gold');
    t.eq(DD.Combat.costOf(z, def, 1).hp, 3, 'the 3 missing gold show up as an HP cost');
    const hp0 = z.hp;
    t.ok(use(z, 'zar_bling_throw', 5, 4), 'charged to the card');
    t.eq(z.hp, hp0 - 3, 'paid 3 HP');
    t.eq(DD.Act.gold(), 0, 'and every last coin');
    t.eq(at(5, 4).hp, 14 - Math.round(8 * 1.1), 'Hellcard +10% damage');
    fight({ heroes: [Z(1, 4, [sk('zar_bling_throw', 1)], { items: ['zar_hellcard'] })], enemies: [E(5, 4)], gold: 40 });
    t.eq(DD.Combat.costOf(zar(), def, 1).hp, 0, 'no HP cost when the party can pay');
    fight({ heroes: [Z(1, 4, [sk('zar_bling_throw', 1)], { items: ['zar_hellcard'], hp: 1 })], enemies: [E(5, 4)], gold: 0 });
    t.eq(can(zar(), 'zar_bling_throw'), 'Not enough HP.', 'at 1 HP even the Hellcard says no');
    // the killing throw: no Dazzle on a corpse, no crash
    fight({ heroes: [Z(1, 4, [sk('zar_bling_throw', 1)])], enemies: [E(5, 4), E(8, 8)], gold: 40 });
    z = zar();
    const g = at(5, 4);
    g.hp = 3;
    t.ok(use(z, 'zar_bling_throw', 5, 4) && g.dead && !has(g, 'dazzled'), 'the target dies mid-skill: no Dazzle on a corpse');
  });

  // ---- tacky hex -----------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Tacky Hex (every level: Vulnerable for exactly its next N turns; III also hexes its neighbours)', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('zar_hex', lv);
      fight({ heroes: [Z(1, 4, [sk('zar_hex', lv)]), H('test_knight', 4, 4)], enemies: [E(5, 4), E(5, 5), E(6, 4), E(5, 2), E(7, 7)], gold: 0 });
      const z = zar(), knight = at(4, 4), tg = at(5, 4), near = [at(5, 5), at(6, 4)], far = at(5, 2);
      t.ok(!valid(z, 'zar_hex', 7, 7) && valid(z, 'zar_hex', 6, 4), 'L' + lv + ': range 5');
      t.ok(use(z, 'zar_hex', 5, 4), 'L' + lv + ': hexed');
      t.ok(has(tg, 'vulnerable') && turnsOf(tg, 'vulnerable') === Lv.turns, 'L' + lv + ': Vulnerable for ' + Lv.turns + ' turns');
      near.forEach(function (f) { t.eq(has(f, 'vulnerable'), !!Lv.r, 'L' + lv + ': the foe next to it at ' + f.x + ',' + f.y + (Lv.r ? ' is hexed too' : ' is not')); });
      t.ok(!has(far, 'vulnerable'), 'L' + lv + ': a foe 2 tiles away is not');
      t.eq(tg.hp, 14, 'L' + lv + ': the hex itself deals no damage');
      t.ok(z.ap === 2 && slotOf(z, 'zar_hex').cd === 2, 'L' + lv + ': 1 AP, cooldown 2');
      // the knight acts next (heroes first): his 5-damage slash lands for 6 (+25%)
      DD.Combat.endTurn();
      t.ok(cur() === knight, 'L' + lv + ': the knight\'s turn');
      DD.Combat.useSkill(knight, knight.basic, 5, 4);
      t.eq(tg.hp, 14 - Math.round(5 * 1.25), 'L' + lv + ': an ally\'s 5 becomes 6 on the hexed foe');
      // exactly its next N turns (it ticks at the end of each of its own turns)
      const log = statusByTurn(tg, 'vulnerable', function () { for (let i = 0; i <= Lv.turns; i++) DD.Combat.endRound(); });
      t.eq(log, covers(Lv.turns), 'L' + lv + ': Vulnerable through exactly its next ' + Lv.turns + ' turns');
    });
    // a spell: Silenced says no
    fight({ heroes: [Z(1, 4, [sk('zar_hex', 1)])], enemies: [E(5, 4)], gold: 0 });
    DD.Act.addStatus(zar(), 'silenced', { turns: 1 });
    t.eq(can(zar(), 'zar_hex'), 'Silenced!', 'Silenced: no hex (it is a spell)');
  });

  // ---- bedazzle ------------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Bedazzle (every level: an ally\'s next damaging skill deals +N to each foe it hits)', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('zar_bedazzle', lv);
      fight({ heroes: [Z(1, 4, [sk('zar_bedazzle', lv)]), H('test_knight', 3, 4, { skills: ['test_cleave', 'test_war_shout'] })],
        enemies: [E(4, 4, 'test_brute'), E(4, 3), E(4, 5), E(8, 8)], gold: 0 });
      const z = zar(), k = at(3, 4), brute = at(4, 4), up = at(4, 3), down = at(4, 5);
      t.ok(!valid(z, 'zar_bedazzle', 1, 4), 'L' + lv + ': not on himself (allies only)');
      t.ok(!valid(z, 'zar_bedazzle', 4, 4), 'L' + lv + ': not on foes');
      t.ok(use(z, 'zar_bedazzle', 3, 4), 'L' + lv + ': knight bedazzled');
      t.ok(has(k, 'zar_bedazzled') && DD.Act.getStatus(k, 'zar_bedazzled').data.bonus === Lv.bonus, 'L' + lv + ': +' + Lv.bonus + ' stored');
      t.ok(z.ap === 2 && slotOf(z, 'zar_bedazzle').cd === 1, 'L' + lv + ': 1 AP, cooldown 1');
      DD.Combat.endTurn();
      t.ok(cur() === k && has(k, 'zar_bedazzled'), 'L' + lv + ': it waits for the knight\'s own turn');
      DD.Combat.useSkill(k, slotOf(k, 'test_war_shout'), 3, 4);
      t.ok(has(k, 'zar_bedazzled'), 'L' + lv + ': a non-damaging skill keeps it');
      DD.Combat.useSkill(k, slotOf(k, 'test_cleave'), 4, 4);
      t.eq(brute.hp, 50 - (4 + Lv.bonus - 1), 'L' + lv + ': cleave 4 +' + Lv.bonus + ' on the brute (−1 armor)');
      t.ok(up.hp === 14 - 4 - Lv.bonus && down.hp === 14 - 4 - Lv.bonus, 'L' + lv + ': and +' + Lv.bonus + ' on each other foe it hits');
      t.ok(!has(k, 'zar_bedazzled'), 'L' + lv + ': one skill, then the sparkles are spent');
      t.ok(!has(brute, 'burn') && !has(up, 'burn'), 'L' + lv + ': no hidden fire rider any more');
    });
    // multi-strike skills get the bonus once per foe; it waits across rounds until it is used
    const flurry = { id: 'zar_test_flurry', name: 'Test Flurry', icon: '🐾', kind: 'attack', tags: ['melee'], ap: 1, levels: [{ dmg: 9 }],
      target: { type: 'unit', range: [1, 1], filter: 'enemy' }, area: { shape: 'circle', size: 1 },
      execute: function (ctx) { for (let i = 0; i < 3; i++) ctx.foes.forEach(function (f) { DD.Act.damage(ctx.user, f, 3); }); } };
    [1, 3].forEach(function (lv) {
      const Lv = L('zar_bedazzle', lv);
      fight({ heroes: [Z(1, 4, [sk('zar_bedazzle', lv)]), H('test_knight', 3, 4)],
        enemies: [{ id: 'test_grunt', x: 4, y: 4, hpMult: 3 }, { id: 'test_grunt', x: 4, y: 5, hpMult: 3 }, E(8, 8)], gold: 0 });
      const z = zar(), k = at(3, 4), a = at(4, 4), b = at(4, 5);
      use(z, 'zar_bedazzle', 3, 4);
      DD.Combat.endRound();
      DD.Combat.endRound();
      t.ok(has(k, 'zar_bedazzled'), 'L' + lv + ': still bedazzled two rounds later (it lasts until used)');
      DD.Combat.endTurn();
      t.eq(cur(), k, 'the knight\'s turn');
      DD.Combat._action(function () { DD.Combat.resolveSkill(k, flurry, { x: 4, y: 4 }, { pay: false }); });
      t.eq(a.hp, a.maxHp - 9 - Lv.bonus, 'L' + lv + ': 3 strikes of 3 on the target: +' + Lv.bonus + ' once, not per strike');
      t.eq(b.hp, b.maxHp - 9 - Lv.bonus, 'L' + lv + ': the other foe hit gets its own +' + Lv.bonus + ' once');
      t.ok(!has(k, 'zar_bedazzled'), 'L' + lv + ': spent');
    });
  });

  // ---- hellish rebuke ----------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Hellish Rebuke (every level: attackers take N fire per hit until the ward\'s owner\'s next turn)', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('zar_rebuke', lv);
      // order: Zarathor, the grunts, then the knight (a ward on someone who acts before the enemies would end unused);
      // Zarathor stands out of the grunts' reach, so both go for the knight
      fight({ enemyAi: true, order: ['zarathor', 'test_grunt', 'test_grunt', 'test_knight'],
        heroes: [Z(0, 4, [sk('zar_rebuke', lv)]), H('test_knight', 4, 4)], enemies: [E(5, 4), E(4, 3)], gold: 0 });
      const z = zar(), k = at(4, 4), g1 = at(5, 4), g2 = at(4, 3);
      t.eq(JSON.stringify(DD.Targeting.range(z, DD.getSkill('zar_rebuke'), lv)), '[0,4]', 'L' + lv + ': range 4, himself included');
      t.ok(valid(z, 'zar_rebuke', 0, 4) && valid(z, 'zar_rebuke', 4, 4) && !valid(z, 'zar_rebuke', 4, 3), 'L' + lv + ': himself or an ally, never a foe');
      t.ok(use(z, 'zar_rebuke', 4, 4), 'L' + lv + ': knight warded');
      t.ok(has(k, 'zar_rebuke') && z.ap === 2 && slotOf(z, 'zar_rebuke').cd === 2, 'L' + lv + ': status, 1 AP, cooldown 2');
      let during = 0;
      const off = DD.Events.on('turn:start', function (e) { if (e.unit.side === 'enemy' && has(k, 'zar_rebuke')) during++; });
      DD.Combat.endTurn();
      off();
      t.eq(during, 2, 'L' + lv + ': the ward holds through both enemy turns');
      t.ok(cur() === k && !has(k, 'zar_rebuke'), 'L' + lv + ': it ends when the knight\'s own turn starts');
      t.eq(g1.hp, 14 - Lv.fire, 'L' + lv + ': the first stabber takes ' + Lv.fire + ' fire');
      t.eq(g2.hp, 14 - Lv.fire, 'L' + lv + ': so does the second (every enemy attack that hits)');
      t.ok(DD.Combat.state.log.some(function (e) { return /Hellish Rebuke/.test(e.text); }), 'L' + lv + ': logged');
    });
    // self-ward vs a Thorns foe: no loop; non-attack damage does not trigger it
    fight({ heroes: [Z(4, 4, [sk('zar_rebuke', 1)])], enemies: [E(5, 4), E(8, 8)], gold: 0 });
    let z = zar();
    const g = at(5, 4);
    use(z, 'zar_rebuke', 4, 4);
    DD.Act.damage(g, z, 3, { cause: 'other' });
    t.eq(g.hp, 14, 'non-attack damage does not trigger it');
    DD.Act.addStatus(g, 'thorns', { stacks: 2, turns: 3 });
    const zhp = z.hp;
    DD.AI.act(g);
    t.eq(g.hp, 9, 'self-ward: the stabber takes 5');
    t.eq(z.hp, zhp - 4 - 2, 'he takes the stab (4) and the thorns (2) once: no loop');
    // Zarathor goes down: the ward still bites, credited to the warded knight (a downed hero deals nothing)
    fight({ heroes: [Z(1, 4, [sk('zar_rebuke', 1)]), H('test_knight', 4, 4)], enemies: [E(5, 4), E(8, 8)], gold: 0 });
    z = zar();
    const k = at(4, 4), g3 = at(5, 4);
    use(z, 'zar_rebuke', 4, 4);
    DD.Act.kill(z, g3);
    t.ok(z.downed && has(k, 'zar_rebuke'), 'Zarathor is down, the ward stays');
    const kd0 = (DD.Combat.state.stats.units[k.id] || {}).dmg || 0;
    DD.AI.act(g3);
    t.eq(g3.hp, 14 - 5, 'the stabber still takes 5');
    t.eq(((DD.Combat.state.stats.units[k.id] || {}).dmg || 0) - kd0, 5, 'credited to the warded knight');
  });

  // ---- bling lasso -------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Bling Lasso (every level: damage + pull; pits, lava, water, bumps, immovable, map edge)', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('zar_lasso', lv);
      fight({ heroes: [Z(1, 4, [sk('zar_lasso', lv)])], enemies: [E(1 + Lv.range, 4), E(2 + Lv.range, 4), E(8, 8)], gold: 0 });
      const z = zar(), g = at(1 + Lv.range, 4);
      t.ok(!valid(z, 'zar_lasso', 2 + Lv.range, 4), 'L' + lv + ': range ' + Lv.range);
      t.ok(use(z, 'zar_lasso', 1 + Lv.range, 4), 'L' + lv + ': lassoed at range ' + Lv.range);
      t.eq(g.hp, 14 - Lv.dmg, 'L' + lv + ': ' + Lv.dmg + ' damage');
      t.eq(g.x, 1 + Lv.range - Lv.pull, 'L' + lv + ': pulled ' + Lv.pull);
      t.ok(!has(g, 'vulnerable'), 'L' + lv + ': no hidden status rider');
      t.ok(z.ap === 2 && slotOf(z, 'zar_lasso').cd === 2, 'L' + lv + ': 1 AP, cooldown 2');
    });
    fight({ heroes: [Z(1, 4, [sk('zar_lasso', 1)])], enemies: [E(4, 5), E(2, 4)], gold: 0 });
    t.ok(!valid(zar(), 'zar_lasso', 4, 5), 'straight lines only');
    t.ok(!valid(zar(), 'zar_lasso', 2, 4), 'not adjacent foes');
    // never pulls past him
    fight({ heroes: [Z(1, 4, [sk('zar_lasso', 3)])], enemies: [E(3, 4), E(8, 8)], gold: 0 });
    use(zar(), 'zar_lasso', 3, 4);
    t.ok(at(2, 4) && at(2, 4).defId === 'test_grunt', 'a foe 2 tiles away stops next to him');
    // pit: YEET
    fight({ heroes: [Z(1, 4, [sk('zar_lasso', 1)])], enemies: [E(5, 4), E(8, 8)], gold: 0, terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'pit'; } });
    let z = zar(), g = at(5, 4);
    use(z, 'zar_lasso', 5, 4);
    t.ok(g.dead, 'pulled into a pit: YEET');
    t.ok(DD.Combat.state.stats.envKills === 1 && DD.Combat.state.hype >= 20, 'environmental kill (+20 Hype)');
    // lava
    fight({ heroes: [Z(1, 4, [sk('zar_lasso', 1)])], enemies: [E(5, 4), E(8, 8)], gold: 0, terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'lava'; } });
    z = zar(); g = at(5, 4);
    use(z, 'zar_lasso', 5, 4);
    t.ok(g.x === 2 && g.hp === 14 - 3 - 8 && stacks(g, 'burn') === 2, 'dragged through lava: 8 fire + Burn 2');
    // water
    fight({ heroes: [Z(1, 4, [sk('zar_lasso', 1)])], enemies: [E(5, 4), E(8, 8)], gold: 0, terrain: function (tl) { if (tl.x === 2 && tl.y === 4) tl.t = 'water'; } });
    z = zar(); g = at(5, 4);
    use(z, 'zar_lasso', 5, 4);
    t.ok(g.x === 2 && has(g, 'wet'), 'pulled into water: Wet');
    // bump into a unit on the way
    fight({ heroes: [Z(1, 4, [sk('zar_lasso', 1)]), H('test_cleric', 3, 4)], enemies: [E(5, 4), E(8, 8)], gold: 0 });
    z = zar(); g = at(5, 4);
    const cleric = at(3, 4);
    use(z, 'zar_lasso', 5, 4);
    t.ok(g.x === 4 && g.hp === 14 - 3 - 3 && cleric.hp === cleric.maxHp - 3, 'blocked by a unit: BONK both');
    // immovable
    fight({ heroes: [Z(1, 4, [sk('zar_lasso', 1)])], enemies: [E(5, 4, 'test_brute'), E(8, 8)], gold: 0 });
    z = zar(); g = at(5, 4);
    use(z, 'zar_lasso', 5, 4);
    t.ok(g.x === 5 && g.hp === 50 - 2, 'immovable: hurt (−1 armor) but stays put');
    // the target dies to the hit: no pull, no crash
    fight({ heroes: [Z(1, 4, [sk('zar_lasso', 1)])], enemies: [E(5, 4), E(8, 8)], gold: 0 });
    z = zar(); g = at(5, 4);
    g.hp = 2;
    t.ok(use(z, 'zar_lasso', 5, 4) && g.dead && g.x === 5, 'target dies mid-skill: nothing is pulled');
    // along the map edge
    fight({ heroes: [Z(0, 0, [sk('zar_lasso', 2)])], enemies: [E(0, 5), E(8, 8)], gold: 0 });
    z = zar();
    t.ok(use(z, 'zar_lasso', 0, 5) && at(0, 2) && at(0, 2).defId === 'test_grunt', 'along the map edge: pulled 3 up the column');
    t.ok(sane(t, 'edge lasso'), 'state sane');
    // strut trail + lasso: dragged through his own fire
    fight({ heroes: [Z(4, 4, [sk('zar_strut', 1), sk('zar_lasso', 2)])], enemies: [E(6, 4), E(8, 8)], gold: 0 });
    z = zar(); g = at(6, 4);
    t.ok(use(z, 'zar_strut', 1, 4), 'strut west, leaving fire at 4,4 3,4 2,4');
    t.ok(use(z, 'zar_lasso', 6, 4), 'then lasso the foe through it');
    t.ok(g.x === 3 && g.hp === 14 - 4 && stacks(g, 'burn') === 4, 'Burn 2 per fire tile entered (' + stacks(g, 'burn') + ')');
  });

  // ---- fabulous strut ------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Fabulous Strut (every level: straight dash, fire on every tile he leaves; blocked paths, edges)', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('zar_strut', lv);
      fight({ heroes: [Z(1, 4, [sk('zar_strut', lv)])], enemies: [E(8, 8)], gold: 0 });
      const z = zar();
      t.ok(!valid(z, 'zar_strut', 2 + Lv.len, 4), 'L' + lv + ': at most ' + Lv.len + ' tiles');
      t.ok(!valid(z, 'zar_strut', 2, 5), 'L' + lv + ': straight lines only');
      t.ok(use(z, 'zar_strut', 1 + Lv.len, 4), 'L' + lv + ': strut ' + Lv.len);
      t.eq(z.x, 1 + Lv.len, 'L' + lv + ': arrives');
      let trail = 0;
      for (let x = 1; x < 1 + Lv.len; x++) if (surf(x, 4) === 'fire' && DD.Grid.tile(x, 4).surface.turns === Lv.turns) trail++;
      t.eq(trail, Lv.len, 'L' + lv + ': fire (' + Lv.turns + ' rounds) on every tile left behind');
      t.eq(surf(1 + Lv.len, 4), null, 'L' + lv + ': not under his own feet');
      t.ok(z.ap === 2 && slotOf(z, 'zar_strut').cd === 2, 'L' + lv + ': 1 AP, cooldown 2');
      // the trail counts ROUNDS (surfaces tick at round end)
      for (let r = 1; r < Lv.turns; r++) DD.Combat.endRound();
      t.eq(surf(1, 4), 'fire', 'L' + lv + ': still burning after ' + (Lv.turns - 1) + ' round end(s)');
      DD.Combat.endRound();
      t.eq(surf(1, 4), null, 'L' + lv + ': out after ' + Lv.turns + ' round ends');
    });
    // blocked: unit, object, cliff; rooted / held
    fight({ heroes: [Z(1, 4, [sk('zar_strut', 1)])], enemies: [E(3, 4), E(8, 8)], gold: 0, objects: [{ x: 1, y: 2, id: 'crate' }],
      terrain: function (tl) { if (tl.x === 1 && tl.y === 6) tl.h = 2; } });
    let z = zar();
    t.ok(valid(z, 'zar_strut', 2, 4) && !valid(z, 'zar_strut', 4, 4), 'cannot strut through a foe');
    t.ok(valid(z, 'zar_strut', 1, 3) && !valid(z, 'zar_strut', 1, 1), 'cannot strut through a crate');
    t.ok(valid(z, 'zar_strut', 1, 5) && !valid(z, 'zar_strut', 1, 7), 'cannot strut up a 2-level cliff');
    DD.Act.addStatus(z, 'root', { turns: 1 });
    t.ok(/move/i.test(String(can(z, 'zar_strut'))), 'rooted: ' + can(z, 'zar_strut'));
    // oil ignites, water steams (and soaks him)
    fight({ heroes: [Z(1, 4, [sk('zar_strut', 1)])], enemies: [E(8, 8)], gold: 0,
      surfaces: [{ x: 2, y: 4, id: 'oil', turns: 5 }, { x: 2, y: 5, id: 'oil', turns: 5 }, { x: 2, y: 6, id: 'oil', turns: 5 }],
      terrain: function (tl) { if (tl.x === 3 && tl.y === 4) tl.t = 'water'; } });
    z = zar();
    t.ok(use(z, 'zar_strut', 4, 4), 'strut over oil and water');
    t.ok(surf(2, 4) === 'fire' && surf(2, 6) === 'fire', 'the oil slick goes up along its whole length');
    t.eq(surf(3, 4), 'steam', 'the puddle boils to steam');
    t.ok(has(z, 'wet'), 'and he walked through it (Wet)');
    // map edge
    fight({ heroes: [Z(8, 4, [sk('zar_strut', 3)])], enemies: [E(0, 0)], gold: 0 });
    z = zar();
    const targets = DD.Combat.targets(z, slotOf(z, 'zar_strut'));
    t.ok(targets.length > 0 && targets.every(function (p) { return DD.Grid.inBounds(p.x, p.y) && p.x <= 8; }), 'at the east edge only in-bounds targets (' + targets.length + ')');
    // a foe walking into the trail Burns; the AI's own walk steps around it (hazard)
    fight({ heroes: [Z(4, 4, [sk('zar_strut', 1)])], enemies: [E(6, 4), E(8, 8)], gold: 0 });
    z = zar();
    use(z, 'zar_strut', 1, 4);
    const g = at(6, 4);
    DD.Act.moveAlong(g, [{ x: 5, y: 4 }, { x: 4, y: 4 }]);
    t.eq(stacks(g, 'burn'), 2, 'walking into the trail: Burn 2');
    t.ok(DD.Grid.hazardAt(3, 4, g), 'the trail is a hazard the AI paths around');
  });

  // ---- gold plating --------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Gold Plating (every level: gold → Block until its owner\'s next turn)', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('zar_gold_plating', lv);
      fight({ heroes: [Z(1, 4, [sk('zar_gold_plating', lv)]), H('test_cleric', 3, 4)], enemies: [E(8, 8)], gold: 40 });
      const z = zar(), c = at(3, 4);
      t.ok(!valid(z, 'zar_gold_plating', 5, 5) || !at(5, 5), 'L' + lv + ': range 4');
      t.ok(use(z, 'zar_gold_plating', 1, 4), 'L' + lv + ': gold-plates himself');
      t.eq(z.block, Lv.block, 'L' + lv + ': +' + Lv.block + ' Block');
      t.eq(DD.Act.gold(), 40 - Lv.gold, 'L' + lv + ': costs ' + Lv.gold + ' gold');
      t.ok(z.ap === 2 && slotOf(z, 'zar_gold_plating').cd === 2, 'L' + lv + ': 1 AP, cooldown 2');
      t.ok(!has(z, 'thorns'), 'L' + lv + ': no hidden Thorns rider');
      // v2: the Block holds through the enemies' turns and ends when his own next turn starts
      let during = -1;
      const off = DD.Events.on('turn:start', function (e) { if (e.unit.side === 'enemy') during = z.block; });
      DD.Combat.endRound();
      off();
      t.eq(during, Lv.block, 'L' + lv + ': still there during the enemy turn');
      t.eq(z.block, 0, 'L' + lv + ': gone at the start of his next turn');
      t.ok(c.block === 0, 'L' + lv + ': (the cleric got none)');
    });
    // on an ally: it lasts until THAT ally's next turn (the cleric acts right after him, so it is gone at once)
    fight({ heroes: [Z(1, 4, [sk('zar_gold_plating', 1)]), H('test_cleric', 3, 4)], enemies: [E(8, 8)], gold: 40 });
    const c = at(3, 4);
    use(zar(), 'zar_gold_plating', 3, 4);
    t.eq(c.block, 8, 'the cleric is plated');
    DD.Combat.endTurn();
    t.ok(cur() === c && c.block === 0, 'and the plating falls off when her own turn starts (put it on someone who acts after the enemies)');
  });

  // ---- statue of me --------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Statue of Me (every level: a gold decoy that Taunts foes near it, now and at each of his turns)', function (t) {
    if (!ready(t)) return;
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('zar_statue', lv);
      fight({ enemyAi: true, heroes: [Z(1, 4, [sk('zar_statue', lv)]), H('test_knight', 4, 5), H('test_cleric', 2, 6)],
        enemies: [E(4, 4), E(5, 4, 'test_archer'), E(3, 6), E(6, 4), E(7, 7)], gold: 0 });
      const z = zar(), knight = at(4, 5), cleric = at(2, 6), A = at(4, 4), archer = at(5, 4), B = at(3, 6), C = at(6, 4), far = at(7, 7);
      t.ok(!valid(z, 'zar_statue', 5, 6), 'L' + lv + ': range 3');
      t.ok(use(z, 'zar_statue', 3, 4), 'L' + lv + ': statue unveiled');
      const st = at(3, 4);
      t.ok(st && st.defId === 'zar_statue' && st.kind === 'summon' && st.side === 'hero' && st.ownerId === z.id, 'L' + lv + ': a hero-side summon owned by Zarathor');
      t.ok(st.maxHp === Lv.hp && st.armor === 1 && st.ap === 0 && st.flags.immovable, 'L' + lv + ': ' + Lv.hp + ' HP, 1 armor, 0 AP, immovable');
      t.eq(z.ap, 1, 'L' + lv + ': 2 AP');
      [A, archer, B].forEach(function (f) {
        const s = DD.Act.getStatus(f, 'taunt');
        t.ok(s && s.source === st.id && s.turns === 1, 'L' + lv + ': ' + f.name + ' within 2 is Taunted by it');
      });
      t.eq(has(C, 'taunt'), Lv.r >= 3, 'L' + lv + ': a foe 3 tiles away ' + (Lv.r >= 3 ? 'is' : 'is not') + ' taunted (radius ' + Lv.r + ')');
      t.ok(!has(far, 'taunt'), 'L' + lv + ': far foes are not');
      z.ap = 3;
      t.eq(can(z, 'zar_statue'), 'No charges left.', 'L' + lv + ': once per combat');
      DD.Act.push(z, st, { x: 1, y: 0 }, 2);
      t.ok(st.x === 3 && st.y === 4, 'L' + lv + ': pushes do not budge it');
      // the enemies' turns: the taunted ones hit the statue, not the knight or the cleric next to them
      const k0 = knight.hp, c0 = cleric.hp, s0 = st.hp;
      DD.Combat.endRound();
      t.ok(knight.hp === k0 && cleric.hp === c0, 'L' + lv + ': the knight and the cleric are spared');
      t.ok(st.dead || st.hp <= s0 - 6, 'L' + lv + ': the statue eats the taunted attacks (' + s0 + ' → ' + (st.dead ? 'broken' : st.hp) + ')');
      // round 2, his turn: the statue taunted everyone near it again
      if (!st.dead) {
        const near = DD.Combat.enemies().filter(function (f) { return DD.Grid.dist(f, st) <= Lv.r; });
        t.ok(near.length > 0 && near.every(function (f) { const s = DD.Act.getStatus(f, 'taunt'); return s && s.source === st.id; }),
          'L' + lv + ': at the start of his turn every foe within ' + Lv.r + ' is Taunted again (' + near.length + ')');
      }
      t.ok(sane(t, 'statue L' + lv), 'L' + lv + ': state sane');
    });
    // a foe that walks into range is picked up at his next turn start; the unveil taunt lasts exactly its next turn
    fight({ heroes: [Z(1, 2, [sk('zar_statue', 1)])], enemies: [E(7, 4), E(4, 4), E(8, 8)], gold: 0 });
    const z = zar(), late = at(7, 4), early = at(4, 4);
    t.ok(use(z, 'zar_statue', 3, 3), 'unveiled at 3,3');
    const st = at(3, 3);
    t.ok(has(early, 'taunt') && !has(late, 'taunt'), 'only the foe within 2 is taunted at first');
    DD.Act.moveAlong(late, [{ x: 6, y: 4 }, { x: 5, y: 4 }]);
    t.ok(DD.Grid.dist(late, st) === 3 && !has(late, 'taunt'), 'walking closer does not taunt it mid-round');
    DD.Act.moveAlong(late, [{ x: 5, y: 3 }]);
    t.eq(statusByTurn(early, 'taunt', function () { DD.Combat.endRound(); }), 's1 e0', 'the unveil taunt covers exactly the foe\'s next turn');
    t.ok(has(late, 'taunt') && DD.Act.getStatus(late, 'taunt').source === st.id, 'the newcomer within 2 is Taunted at the start of his next turn');
    // the statue breaks: coins, no hidden explosion
    const e0 = early.hp;
    DD.Act.kill(st, early);
    t.ok(st.dead && early.hp === e0, 'it shatters into coins and hurts nobody');
    t.ok(sane(t, 'statue break'), 'state sane');
    // AutoPlay copes with a 0-AP summon on his turn
    fight({ heroes: [Z(1, 4, [sk('zar_statue', 1)])], enemies: [E(6, 4), E(7, 7)], gold: 0 });
    use(zar(), 'zar_statue', 2, 4);
    t.tryRun('autoplay with the statue', function () { DD.AutoPlay.takeTurn(); DD.Combat.endTurn(); DD.AutoPlay.takeTurn(); });
    t.ok(sane(t, 'statue autoplay'), 'state sane');
  });

  // ---- wild card -------------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Wild Card (every level: surges on demand; good from II, two at III; 2 per combat)', function (t) {
    if (!ready(t)) return;
    function arena(seed, lv) {
      return fight({ w: 12, h: 12, seed: seed, heroes: [Z(1, 1, [sk('zar_wild_card', lv)])], enemies: [E(10, 10), E(11, 9)], gold: 30 });
    }
    arena(3, 1);
    let z = zar();
    const ev = surges(function () { t.ok(use(z, 'zar_wild_card', 1, 1), 'L1: wild card played'); });
    t.ok(ev.length === 1 && ev[0].source === 'wild card' && ev[0].unitId === z.id, 'L1: one surge from the wild card');
    t.ok(z.ap === 2 && slotOf(z, 'zar_wild_card').cd === 1 && slotOf(z, 'zar_wild_card').uses === 1, '1 AP, cooldown 1, a charge used');
    t.ok(/cooldown/i.test(String(can(z, 'zar_wild_card'))) || z.ap < 1, 'cooldown 1');
    // charges: two uses per combat (rounds 1 and 3), then none
    DD.Combat.endRound(); DD.Combat.endRound();
    z = zar();
    if (z && cur() === z && DD.Combat.canUse(z, slotOf(z, 'zar_wild_card')) === true) {
      use(z, 'zar_wild_card', z.x, z.y);
      DD.Combat.endRound(); DD.Combat.endRound();
      z = zar();
      if (z && cur() === z && !z.downed && !has(z, 'sheep')) t.eq(can(z, 'zar_wild_card'), 'No charges left.', '2 uses per combat');
    }
    let any1 = 0, good2 = 0, good3 = 0, n3 = 0;
    const kinds = {};
    for (let seed = 1; seed <= 12; seed++) {
      arena(seed, 1);
      z = zar();
      surges(function () { use(z, 'zar_wild_card', 1, 1); }).forEach(function () { any1++; });
      arena(seed, 2);
      z = zar();
      surges(function () { use(z, 'zar_wild_card', 1, 1); }).forEach(function (e) { if (e.good === true) good2++; kinds[e.id] = 1; });
      arena(seed, 3);
      z = zar();
      surges(function () { use(z, 'zar_wild_card', 1, 1); }).forEach(function (e) { n3++; if (e.good === true) good3++; });
    }
    t.eq(any1, 12, 'L1: one surge of any kind every time');
    t.eq(good2, 12, 'L2: always a good surge (' + Object.keys(kinds).length + ' kinds seen)');
    t.ok(n3 === 24 && good3 === 24, 'L3: two good surges every time (' + good3 + '/' + n3 + ')');
    t.ok((DD.getSkill('zar_wild_card').tags || []).indexOf('random') >= 0 && DD.getSkill('zar_wild_card').kind === 'buff', "tagged 'random' (previews show ?), not a spell");
    t.ok(sane(t, 'wild card'), 'state sane');
  });

  // ---- passive -----------------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Drip Check passive (gold → damage, counted at the start of his turns; Ring)', function (t) {
    if (!ready(t)) return;
    [[0, 0], [49, 0], [50, 1], [99, 1], [100, 2], [149, 2], [150, 3], [400, 3]].forEach(function (c) {
      fight({ heroes: [Z(1, 4)], enemies: [E(4, 4)], gold: c[0] });
      const z = zar();
      t.eq(stacks(z, 'zar_drip'), c[1], c[0] + ' gold → Drip ' + c[1]);
      DD.Combat.useSkill(z, z.basic, 4, 4);
      t.eq(at(4, 4).hp, 14 - Math.round(5 * (1 + 0.1 * c[1])), c[0] + ' gold: basic deals ' + Math.round(5 * (1 + 0.1 * c[1])));
    });
    // counted at the start of each of his turns, not mid-turn
    fight({ heroes: [Z(1, 4, [sk('zar_bling_throw', 1)])], enemies: [E(4, 4, 'test_brute'), E(8, 8)], gold: 104 });
    let z = zar();
    t.eq(stacks(z, 'zar_drip'), 2, '104 gold: +20% (already shown before his first action)');
    use(z, 'zar_bling_throw', 4, 4);
    t.eq(DD.Act.gold(), 99, 'one money throw later the purse is under 100');
    t.eq(stacks(z, 'zar_drip'), 2, 'spending mid-turn keeps this turn\'s drip');
    t.eq(at(4, 4).hp, 50 - (Math.round(8 * 1.2) - 1), 'the throw itself hit at +20%');
    DD.Combat.endRound();
    z = zar();
    t.eq(stacks(z, 'zar_drip'), 1, 'next turn: 99 gold, +10%');
    t.ok(DD.Combat.state.log.some(function (e) { return /Drip Check/.test(e.text); }), 'drip changes are logged');
    DD.Act.gainGold(100);
    t.eq(stacks(z, 'zar_drip'), 1, 'income mid-turn waits for the next check too');
    DD.Combat.endRound();
    t.eq(stacks(zar(), 'zar_drip'), 3, 'rich again next turn: +30% (capped)');
    // only his own damage, all of it (the Rebuke's fire too)
    fight({ heroes: [Z(1, 4), H('test_knight', 4, 5)], enemies: [E(4, 4), E(8, 8)], gold: 150 });
    DD.Combat.endTurn();
    const k = hero('test_knight');
    DD.Combat.useSkill(k, k.basic, 4, 4);
    t.eq(at(4, 4).hp, 9, 'the drip is his alone: the knight still slashes for 5');
    // Ring of Excessive Bling: every 30 gold
    fight({ heroes: [Z(1, 4, [], { items: ['zar_ring_bling'] })], enemies: [E(8, 8)], gold: 60 });
    t.eq(stacks(zar(), 'zar_drip'), 2, 'Ring: 60 gold is already +20%');
    t.eq(DD.Zarathor.dripStep(zar()), 30, 'Ring: step 30');
    fight({ heroes: [Z(1, 4, [], { items: ['zar_ring_bling'] })], enemies: [E(8, 8)], gold: 900 });
    t.eq(stacks(zar(), 'zar_drip'), 3, 'Ring: still max +30%');
    // the readout: the purse now, the step and what the next check gives
    fight({ heroes: [Z(1, 4, [], { items: ['zar_ring_bling'] })], enemies: [E(8, 8)], gold: 75 });
    const dst = DD.Act.getStatus(zar(), 'zar_drip'), ddef = DD.getStatus('zar_drip');
    let txt = ddef.desc(dst);
    t.ok(/\+20% damage/.test(txt) && /per 30 gold/.test(txt) && /holds 75 gold/.test(txt) && /gives \+20%/.test(txt), 'Ring, 75 gold: ' + txt);
    DD.Act.spendGold(50);
    txt = ddef.desc(dst);
    t.ok(/\+20% damage/.test(txt) && /holds 25 gold/.test(txt) && /gives \+0%/.test(txt), 'spent mid-turn: this turn stays +20%, the readout warns: ' + txt);
    // one rule only: spells no longer count toward a surge
    fight({ heroes: [Z(1, 4)], enemies: [E(4, 4, 'test_brute'), E(8, 8)], gold: 0 });
    z = zar();
    const ev = surges(function () { for (let r = 0; r < 2; r++) { for (let i = 0; i < 3; i++) DD.Combat.useSkill(z, z.basic, 4, 4); DD.Combat.endRound(); } });
    t.eq(ev.length, 0, 'six spells, no Wild Surge (the v1 Sparkle counter is gone)');
  });

  // ---- signature ----------------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: Bling Supernova (signature: 18 fire in radius 2, Dazzle the survivors, ignite)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [Z(1, 4), H('test_knight', 3, 4)], enemies: [E(5, 4), E(6, 4), E(5, 6), E(4, 5, 'test_brute'), E(8, 8)], gold: 40,
      surfaces: [{ x: 7, y: 4, id: 'oil', turns: 5 }, { x: 8, y: 4, id: 'oil', turns: 5 }] });
    const z = zar(), s = DD.Combat.state, knight = at(3, 4), brute = at(4, 5), far = at(8, 8);
    t.eq(can(z, 'zar_signature'), 'Needs 100 Hype.', 'needs 100 Hype');
    s.hype = 100;
    const grunts = [at(5, 4), at(6, 4), at(5, 6)];
    t.ok(use(z, 'zar_signature', 5, 4), 'BLING SUPERNOVA');
    t.ok(grunts.every(function (g) { return g.dead; }), '18 fire: every grunt in radius 2 is gone');
    t.eq(brute.hp, 50 - 17, 'the brute takes 18 − 1 armor');
    t.ok(has(brute, 'dazzled'), 'survivors are Dazzled');
    t.eq(knight.hp, knight.maxHp, 'allies in the blast are spared');
    t.eq(far.hp, 14, 'foes outside radius 2 untouched');
    t.eq(surf(7, 4), 'fire', 'the area ignites (oil goes up)');
    t.eq(DD.Act.gold(), 40, 'no gold changes hands (the coins are just for show now)');
    t.eq(s.hype, 3 * 8 + 4, 'Hype: −100, then +8 per kill and +4 for the multi-hit');
    t.eq(z.ap, 1, '2 AP');
    t.eq(statusByTurn(brute, 'dazzled', function () { DD.Combat.endRound(); DD.Combat.endRound(); }), covers(1), 'the Dazzle covers exactly the brute\'s next turn');
    // silenced: no supernova (a spell)
    fight({ heroes: [Z(1, 4)], enemies: [E(5, 4)], gold: 0 });
    DD.Combat.state.hype = 100;
    DD.Act.addStatus(zar(), 'silenced', { turns: 1 });
    t.eq(can(zar(), 'zar_signature'), 'Silenced!', 'Silenced: no supernova');
  });

  // ---- items -------------------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: items (Ring of Excessive Bling, Platinum Hellcard, Shades of Indoor Brilliance)', function (t) {
    if (!ready(t)) return;
    fight({ heroes: [Z(1, 4, [], { items: ITEMS })], enemies: [E(4, 4)], gold: 0 });
    let z = zar();
    t.eq(z.items.length, 3, 'all three equipped (trinket, weapon, armor)');
    t.ok(Math.abs(z.dmgBonus - 0.15) < 1e-9, 'Ring +5% and Hellcard +10% damage');
    t.ok(z.maxHp === 30 && z.armor === 1, 'Shades: +6 max HP, +1 armor');
    t.eq(z.block, 0, 'v2: nobody starts the fight with Block');
    DD.Combat.useSkill(z, z.basic, 4, 4);
    t.eq(at(4, 4).hp, 14 - Math.round(5 * 1.15), 'item damage bonus applies');
    t.ok(ITEMS.every(function (id) { return DD.getItem(id).hero === ZAR; }), 'Zarathor only');
    t.eq(DD.getItem('zar_shades').rarity, 'legendary', 'Shades are legendary');
    // Shades: a grunt that stabs him is Dazzled through its NEXT turn, so that stab lands a tile off
    fight({ enemyAi: true, heroes: [Z(1, 4, [], { items: ['zar_shades'] })], enemies: [E(2, 4)], gold: 0 });
    z = zar();
    const g = at(2, 4), hp0 = z.hp;
    DD.Combat.endTurn();
    t.eq(z.hp, hp0 - 3, 'round 1: the grunt stabs him (4 − 1 armor)');
    t.ok(has(g, 'dazzled'), '...and is Dazzled by the shine');
    DD.Combat.endTurn();
    t.eq(z.hp, hp0 - 3, 'round 2: its stab lands a tile off');
    t.ok(!has(g, 'dazzled'), 'the Dazzle is gone after that turn');
    DD.Combat.endTurn();
    t.eq(z.hp, hp0 - 6, 'round 3: it hits again (and is dazzled again)');
    t.ok(has(g, 'dazzled'), 'a fresh Dazzle');
    // without the Shades: no Dazzle
    fight({ enemyAi: true, heroes: [Z(1, 4)], enemies: [E(2, 4)], gold: 0 });
    DD.Combat.endTurn();
    t.ok(!has(at(2, 4), 'dazzled') && zar().hp === zar().maxHp - 4, 'control: no Shades, no Dazzle');
    // non-attack damage from a foe (a thorns-like reflect) does not dazzle
    fight({ heroes: [Z(1, 4, [], { items: ['zar_shades'] })], enemies: [E(2, 4)], gold: 0 });
    DD.Act.damage(at(2, 4), zar(), 3, { cause: 'other' });
    t.ok(!has(at(2, 4), 'dazzled'), 'only attacks trigger the Shades');
  });

  // ---- previews -------------------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: previews never leak and match reality (every skill, every level)', function (t) {
    if (!ready(t)) return;
    // [skill, target x, y] from Zarathor at (2,4) with a knight at (3,5), grunts at (4,4) (5,4) (4,6), archer at (6,4)
    const aims = {
      zar_basic: [4, 4], zar_signature: [5, 4], zar_fireball: [5, 4], zar_bling_throw: [4, 4], zar_hex: [4, 4],
      zar_bedazzle: [3, 5], zar_rebuke: [3, 5], zar_lasso: [5, 4], zar_strut: [2, 1], zar_gold_plating: [3, 5],
      zar_statue: [2, 6], zar_wild_card: [2, 4],
    };
    let checks = 0;
    ALL_SKILLS.forEach(function (id) {
      const def = DD.getSkill(id);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        const label = id + ' L' + lv;
        fight({ seed: 7 + lv, heroes: [Z(2, 4, POOL.indexOf(id) >= 0 ? [sk(id, lv)] : []), H('test_knight', 3, 5)],
          enemies: [E(4, 4), E(5, 4), E(4, 6), E(6, 4, 'test_archer')], gold: 60 });
        const s = DD.Combat.state, z = zar();
        s.hype = 100;
        const slot = slotOf(z, id), aim = aims[id];
        if (!t.ok(DD.Combat.canUse(z, slot) === true && DD.Targeting.isValidTarget(z, slot, aim[0], aim[1]), label + ' usable at ' + aim)) continue;
        const fp = fingerprint(s);
        let prev = null;
        t.tryRun(label + ' preview', function () { prev = DD.Combat.preview(z, slot, aim[0], aim[1]); });
        t.eq(fingerprint(s), fp, label + ': the preview leaves the fight untouched');
        if (!prev) continue;
        const before = {};
        s.units.forEach(function (u) { before[u.id] = { hp: u.hp, dead: u.dead, downed: u.downed }; });
        const hype0 = s.hype, n0 = s.units.length;
        let used = false;
        const ev = surges(function () { used = use(z, id, aim[0], aim[1]); });
        t.ok(used, label + ' used');
        // a roll of the dice (Wild Card) is never given away: such a preview is uncertain
        if (ev.length) t.ok(prev.uncertain, label + ': the Wild Surge it set off hides behind a "?" in the preview');
        if (prev.uncertain) {
          t.ok(Object.keys(prev.perUnit).every(function (k) { return prev.perUnit[k].uncertain; }), label + ': every badge of the uncertain preview says "?"');
          checks++;
          continue;
        }
        s.units.forEach(function (u) {
          const b = before[u.id];
          if (!b || b.dead) return;
          const e = prev.perUnit[u.id];
          const real = b.hp - u.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
          t.eq(real, said, label + ': ' + u.name + ' HP change as previewed');
          t.eq((u.dead && !b.dead) || (u.downed && !b.downed), !!(e && e.lethal), label + ': ' + u.name + ' KO as previewed');
        });
        t.eq(s.units.filter(function (u, i) { return i >= n0 && !u.dead; }).length, (prev.spawned || []).length, label + ': spawns as previewed');
        t.eq(s.hype - hype0, prev.hype, label + ': Hype as previewed');
        checks++;
      }
    });
    t.ok(checks >= 32, 'preview checks: ' + checks);
    // the random skill says so; the deterministic ones do not
    fight({ heroes: [Z(2, 4, [sk('zar_wild_card', 1), sk('zar_hex', 1)])], enemies: [E(4, 4)], gold: 0 });
    t.ok(DD.Combat.preview(zar(), slotOf(zar(), 'zar_wild_card'), 2, 4).uncertain, 'Wild Card previews as uncertain');
    t.ok(!DD.Combat.preview(zar(), slotOf(zar(), 'zar_hex'), 4, 4).uncertain, 'Tacky Hex previews exactly (no dice in the kit but the Wild Card)');
    const pv = DD.Combat.preview(zar(), slotOf(zar(), 'zar_hex'), 4, 4).perUnit[at(4, 4).id];
    t.ok(pv && (pv.statuses || []).indexOf('vulnerable') >= 0, 'the hex preview shows the Vulnerable it adds');
  });

  // ---- edge cases ---------------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: v2 edge cases (stunned / silenced / sheep / charmed, not his turn, AP, null targets, lava)', function (t) {
    if (!ready(t)) return;
    function kit() {
      fight({ heroes: [Z(2, 4, [sk('zar_fireball', 1), sk('zar_bling_throw', 1), sk('zar_lasso', 1), sk('zar_strut', 1)]), H('test_knight', 2, 5)],
        enemies: [E(5, 4), E(8, 8)], gold: 60 });
      DD.Combat.state.hype = 100;
      return zar();
    }
    let z = kit();
    DD.Act.addStatus(z, 'silenced', { turns: 1 });
    t.eq(DD.Combat.canUse(z, z.basic), 'Silenced!', 'silenced: no Eldritch Bling (a spell)');
    t.eq(can(z, 'zar_fireball'), 'Silenced!', 'silenced: no Fireball');
    t.eq(can(z, 'zar_signature'), 'Silenced!', 'silenced: no Supernova');
    t.eq(can(z, 'zar_bling_throw'), true, 'silenced: money still talks');
    t.eq(can(z, 'zar_lasso'), true, 'silenced: the lasso works');
    t.eq(can(z, 'zar_strut'), true, 'silenced: so does the strut');
    // a stun applied during his own turn costs exactly his NEXT turn (v2)
    z = kit();
    DD.Act.addStatus(z, 'stun', { turns: 1 });
    t.ok(['zar_basic', 'zar_fireball', 'zar_bling_throw', 'zar_strut', 'zar_signature'].every(function (id) { return /Stunned/.test(String(can(z, id))); }), 'stunned: nothing');
    const k = hero('test_knight');
    let zTurns = 0;
    const off = DD.Events.on('turn:player', function (e) { if (e.unit === z) zTurns++; });
    DD.Combat.endTurn();
    t.eq(cur(), k, 'round 1: the knight\'s turn');
    DD.Combat.endTurn();
    t.ok(DD.Combat.state.round === 2 && cur() === k, 'round 2: his turn passes by itself (stunned), straight to the knight');
    DD.Combat.endTurn();
    off();
    t.ok(DD.Combat.state.round === 3 && cur() === z && z.ap === 3 && !has(z, 'stun'), 'round 3: he is back with 3 AP');
    t.eq(zTurns, 1, 'exactly one of his turns was lost');
    z = kit();
    DD.Act.addStatus(z, 'sheep', { turns: 1 });
    t.ok(['zar_basic', 'zar_bling_throw', 'zar_signature'].every(function (id) { return /Baa/.test(String(can(z, id))); }), 'sheep: baa');
    z = kit();
    z.ap = 1;
    t.eq(can(z, 'zar_fireball'), 'Not enough AP.', '1 AP: no fireball');
    t.eq(can(z, 'zar_signature'), 'Not enough AP.', '1 AP: no supernova');
    t.eq(DD.Combat.canUse(z, z.basic), true, '1 AP: the basic still works');
    // not his turn: the knight's turn refuses his skills
    z = kit();
    DD.Combat.endTurn();
    t.ok(/Not Zarathor's turn/.test(String(can(z, 'zar_bling_throw'))) && !use(z, 'zar_bling_throw', 5, 4), 'on the knight\'s turn: "Not Zarathor\'s turn."');
    t.eq(DD.Act.gold(), 60, 'nothing paid');
    // charmed by the grunt: can't hurt it; −1 AP on his next turn, gone after it
    z = kit();
    const g = at(5, 4);
    DD.Act.addStatus(z, 'charmed', { turns: 1 }, g);
    DD.Combat.useSkill(z, z.basic, 5, 4);
    t.eq(g.hp, 14, 'charmed: cannot damage the charmer');
    DD.Combat.endRound();
    t.ok(cur() === z && has(z, 'charmed') && z.ap === 2, 'charmed through his next turn: 2 AP');
    DD.Combat.endRound();
    t.ok(cur() === z && !has(z, 'charmed') && z.ap === 3, 'then free again');
    // null targets / empty tiles: every unit skill tolerates it, no gold spent on thin air
    z = kit();
    ['zar_basic', 'zar_bling_throw', 'zar_lasso'].forEach(function (id) {
      t.tryRun(id + ' on an empty tile', function () {
        DD.Combat._action(function () { DD.Combat.resolveSkill(z, slotOf(z, id), { x: 7, y: 1 }, { pay: true }); });
      });
    });
    t.eq(DD.Act.gold(), 60, 'no gold spent on thin air');
    fight({ heroes: [Z(2, 4, [sk('zar_hex', 3), sk('zar_bedazzle', 1), sk('zar_rebuke', 1), sk('zar_gold_plating', 1)])], enemies: [E(8, 8)], gold: 60 });
    z = zar();
    ['zar_hex', 'zar_bedazzle', 'zar_rebuke', 'zar_gold_plating'].forEach(function (id) {
      z.ap = 3;
      t.tryRun(id + ' on an empty tile', function () {
        DD.Combat._action(function () { DD.Combat.resolveSkill(z, slotOf(z, id), { x: 6, y: 1 }, { pay: true }); });
      });
    });
    t.eq(DD.Act.gold(), 60, 'gold plating on nobody costs nothing');
    t.ok(sane(t, 'null targets'), 'state sane');
    // Zarathor downed by his own strut through lava mid-path
    fight({ heroes: [Z(1, 4, [sk('zar_strut', 1)], { hp: 5 }), H('test_knight', 1, 6)], enemies: [E(8, 8)], gold: 0,
      terrain: function (tl) { if (tl.y === 4 && (tl.x === 2 || tl.x === 3)) tl.t = 'lava'; } });
    z = zar();
    t.tryRun('strut into lava', function () { use(z, 'zar_strut', 4, 4); });
    t.ok(z.downed, 'strutting through lava at 5 HP ends badly');
    t.tryRun('end the turn of a downed hero', function () { DD.Combat.endTurn(); });
    t.ok(sane(t, 'lava strut') && cur() === hero('test_knight'), 'the knight plays on');
    // the fight is won by his skill: no stray effects after the win (no surge, no crash)
    for (let seed = 1; seed <= 4; seed++) {
      DD.Combat.sandbox({ w: 9, h: 9, seed: seed, objective: { type: 'killAll' }, enemyAi: false, gold: 40,
        heroes: [Z(1, 4, [sk('zar_fireball', 1)]), H('test_knight', 2, 6)], enemies: [E(4, 4), E(5, 4)] });
      at(4, 4).hp = 3; at(5, 4).hp = 3;
      const ev = surges(function () { use(zar(), 'zar_fireball', 4, 4); });
      t.ok(DD.Combat.state.result === 'victory' && ev.length === 0, 'seed ' + seed + ': the winning fireball ends the fight cleanly');
    }
    t.eq(DD.Zarathor.wildSurge(zar(), 'test', true), null, 'no surge on demand once the fight is over');
  });

  // ---- combos ------------------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: combos with other heroes (Hex, Bedazzle, Lasso into a cleave, Statue → Fireball, Rebuke on a taunter, fire lane)', function (t) {
    if (!ready(t)) return;
    // Tacky Hex → every ally hits harder: knight 5 → 6, mage bolt 4 → 5
    fight({ heroes: [Z(1, 3, [sk('zar_hex', 1)]), H('test_knight', 4, 3), H('test_mage', 1, 6)], enemies: [E(4, 4, 'test_brute'), E(8, 8)], gold: 0 });
    let z = zar();
    const brute = at(4, 4);
    t.ok(use(z, 'zar_hex', 4, 4), 'Zarathor hexes the brute');
    DD.Combat.endTurn();
    const k = hero('test_knight'), m = hero('test_mage');
    t.ok(DD.Combat.useSkill(k, k.basic, 4, 4), 'the knight slashes it');
    DD.Combat.endTurn();
    t.ok(DD.Combat.useSkill(m, m.basic, 4, 4), 'the mage bolts it');
    t.eq(brute.hp, 50 - (6 - 1) - (5 - 1), 'Hex: slash 6 and bolt 5 (−1 armor each) instead of 5 and 4');
    // Bedazzle the knight → his cleave: +4 on each of three foes
    fight({ heroes: [Z(1, 4, [sk('zar_bedazzle', 1)]), H('test_knight', 3, 4, { skills: ['test_cleave'] })], enemies: [E(4, 3), E(4, 4), E(4, 5), E(8, 8)], gold: 0 });
    use(zar(), 'zar_bedazzle', 3, 4);
    DD.Combat.endTurn();
    const k2 = hero('test_knight');
    DD.Combat.useSkill(k2, slotOf(k2, 'test_cleave'), 4, 4);
    t.ok([at(4, 3), at(4, 4), at(4, 5)].every(function (f) { return f.hp === 14 - 8; }), 'Bedazzle: the cleave deals 4 +4 to all three');
    // Bling Lasso pulls an archer out of the back line into the knight's reach
    fight({ heroes: [Z(1, 4, [sk('zar_lasso', 3)]), H('test_knight', 2, 3)], enemies: [E(6, 4, 'test_archer'), E(8, 8)], gold: 0 });
    t.ok(use(zar(), 'zar_lasso', 6, 4), 'Lasso III on the archer 5 tiles away');
    const archer = DD.Combat.enemies().filter(function (e) { return e.defId === 'test_archer'; })[0];
    t.ok(archer.x === 2 && archer.y === 4 && archer.hp === 5, 'Lasso: 5 damage, the archer lands at 2,4, next to the knight');
    DD.Combat.endTurn();
    const k3 = hero('test_knight');
    t.ok(DD.Combat.useSkill(k3, k3.basic, 2, 4) && archer.dead, 'and the knight finishes it with one slash');
    // Statue → the foes come to it → a Fireball on the cluster
    fight({ enemyAi: true, heroes: [Z(1, 1, [sk('zar_statue', 2), sk('zar_fireball', 1)])], enemies: [E(5, 5), E(6, 4), E(4, 6), E(8, 8)], gold: 0 });
    z = zar();
    use(z, 'zar_statue', 3, 2);
    const statue = at(3, 2);
    t.ok(DD.Combat.enemies().filter(function (f) { return has(f, 'taunt'); }).length === 0, 'nobody close yet');
    DD.Act.moveAlong(at(5, 5), [{ x: 5, y: 4 }, { x: 5, y: 3 }]);
    DD.Act.moveAlong(at(4, 6), [{ x: 4, y: 5 }, { x: 4, y: 4 }]);
    DD.Combat.endRound();
    z = zar();
    const near = DD.Combat.enemies().filter(function (f) { return DD.Grid.dist(f, statue) <= 2 && has(f, 'taunt'); });
    t.ok(near.length >= 2, 'the statue taunted the foes that came near it (' + near.length + ')');
    let best = null, bestN = 0;
    DD.Combat.targets(z, slotOf(z, 'zar_fireball')).forEach(function (p) {
      const n = DD.Targeting.buildCtx(z, slotOf(z, 'zar_fireball'), p).foes.length;
      if (n > bestN) { bestN = n; best = p; }
    });
    t.ok(bestN >= 2 && use(z, 'zar_fireball', best.x, best.y), 'the Fireball catches ' + bestN + ' of them around the statue');
    // Rebuke on a taunter: the knight shouts (Taunt), Zarathor wards him, the taunted grunts roast themselves
    fight({ enemyAi: true, order: ['test_knight', 'zarathor'], heroes: [Z(0, 4, [sk('zar_rebuke', 2)]), H('test_knight', 4, 4, { skills: ['test_war_shout'] })],
      enemies: [E(5, 4), E(4, 6), E(2, 4)], gold: 0 });
    const k4 = hero('test_knight');
    t.eq(cur(), k4, 'the knight acts first');
    DD.Combat.useSkill(k4, slotOf(k4, 'test_war_shout'), 4, 4);
    t.ok(DD.Combat.enemies().every(function (f) { return has(f, 'taunt'); }), 'Mandatory Meeting: all three grunts are Taunted by the knight');
    DD.Combat.endTurn();
    t.ok(use(zar(), 'zar_rebuke', 4, 4), 'Zarathor wards the taunting knight (he acts after the grunts)');
    const foes = DD.Combat.enemies().slice();
    DD.Combat.endTurn();
    const roasted = foes.filter(function (f) { return f.dead || f.hp === 14 - 7; }).length;
    t.eq(roasted, 3, 'Taunt + Rebuke: every taunted grunt took 7 fire for hitting the knight');
    // Fabulous Strut lane + the knight's Shield Bash: shoved through the fire
    fight({ heroes: [Z(3, 4, [sk('zar_strut', 1)]), H('test_knight', 5, 4, { skills: ['test_shield_bash'] })], enemies: [E(4, 4), E(8, 8)], gold: 0 });
    t.ok(use(zar(), 'zar_strut', 3, 1), 'Zarathor struts north out of the fight');
    t.ok(surf(3, 4) === 'fire' && surf(3, 3) === 'fire', 'a fire lane down column 3');
    DD.Combat.endTurn();
    const k5 = hero('test_knight'), g5 = at(4, 4);
    t.ok(DD.Combat.useSkill(k5, slotOf(k5, 'test_shield_bash'), 4, 4), 'the knight bashes the grunt west');
    t.ok(g5.x === 2 && stacks(g5, 'burn') === 2, 'Strut + shove: pushed through the fire lane, it Burns (2)');
  });

  // ---- autoplay battles ------------------------------------------------------------------------------------------------------------
  T.suite('hero_zarathor: AutoPlay v2 battles at levels 1/3/5 (acts 1-3 + elites, no errors, his skills get used)', function (t) {
    if (!ready(t)) return;
    const loadouts = {
      1: [['zar_fireball', 1], ['zar_bling_throw', 1]],
      3: [['zar_fireball', 2], ['zar_bling_throw', 1], ['zar_hex', 1], ['zar_bedazzle', 1]],
      '5a': [['zar_fireball', 2], ['zar_statue', 1], ['zar_rebuke', 2], ['zar_lasso', 2]],
      '5b': [['zar_bling_throw', 2], ['zar_strut', 2], ['zar_gold_plating', 2], ['zar_wild_card', 2]],
      '5c': [['zar_hex', 2], ['zar_bedazzle', 2], ['zar_fireball', 3], ['zar_statue', 2]],
    };
    const plan = [];
    [1, 3, 5].forEach(function (lv, i) {
      [1, 2, 3].forEach(function (act) { plan.push({ act: act, lv: lv, kind: 'normal', load: lv === 5 ? ['5a', '5b', '5c'][act - 1] : lv }); });
      plan.push({ act: i + 1, lv: lv, kind: 'elite', load: lv === 5 ? '5b' : lv });
    });
    // two longer fights: the fixture boss (a wind-up, a phase change) at levels 3 and 5
    plan.push({ act: 1, lv: 3, kind: 'boss', load: 3 }, { act: 2, lv: 5, kind: 'boss', load: '5a' });
    const used = {};
    let battles = 0, wins = 0, rounds = 0;
    plan.forEach(function (p, i) {
      const enc = DD.getEncounter('test_a' + p.act + '_' + p.kind);
      if (!enc) { t.fail('fixture encounter test_a' + p.act + '_' + p.kind + ' missing'); return; }
      const party = [ZAR, 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
        return DD.Combat.makeRunHero(id === ZAR ? { id: id, level: p.lv, skills: loadouts[p.load].map(function (s) { return { id: s[0], level: s[1] }; }) } : { id: id, level: p.lv });
      });
      const label = 'act ' + p.act + ' ' + p.kind + ' L' + p.lv + ' (' + p.load + ')';
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('zar:' + t.seed + ':' + i), difficulty: 'normal', act: p.act });
      DD.Combat.start(setup, { seed: 'zar-auto-' + t.seed + '-' + i, headless: true, gold: 120, difficulty: 'normal', kind: p.kind });
      t.eq(DD.Combat.state.phase, 'deploy', label + ': opens in deployment (v2)');
      DD.Act.addRule({ id: 'zar_test_probe', name: 'Probe', hooks: { onSkillUsed: function (ctx) {
        if (!DD.Act.simulating && ctx.user && ctx.user.defId === ZAR) used[ctx.skill.id] = (used[ctx.skill.id] || 0) + 1;
      } } });
      let res = null;
      t.tryRun(label, function () { res = DD.AutoPlay.runBattle(30); });
      battles++;
      if (res && res.result === 'victory') wins++;
      rounds += res ? res.rounds : 0;
      t.ok(res && (res.result || res.timeout), label + ': finished (' + (res && res.result) + ', ' + (res && res.rounds) + ' rounds)');
      t.ok(DD.Combat.state.order && DD.Combat.state.order.length > 0, label + ': initiative was rolled');
      sane(t, label);
    });
    t.log('battles ' + battles + ', won ' + wins + ', avg rounds ' + (rounds / Math.max(1, battles)).toFixed(1) + ', uses ' + JSON.stringify(used));
    t.ok(used.zar_basic > 0 && used.zar_fireball > 0 && used.zar_bling_throw > 0, 'basic, fireball and money throws get used');
    t.ok(Object.keys(used).length >= 8, 'most of the kit gets used (' + Object.keys(used).length + ': ' + Object.keys(used).join(', ') + ')');
    t.ok(wins >= Math.ceil(battles / 2), 'the fixture party with Zarathor wins its share (' + wins + '/' + battles + ')');
  });

  /**
   * Diagnostic (zarsim=1; seeds=n, lv=level, acts=1,2): every registered real hero takes the same slot next to the fixture
   * knight / cleric / rogue (starters at II + 2 random pool skills at I, 60 gold) in the same real normal encounters;
   * logs per hero: wins, damage dealt per round, damage taken and downs per fight. Skipped unless asked for.
   */
  T.suite('hero_zarathor: slot comparison sim (diagnostic)', function (t) {
    if (t.param('zarsim', '0') !== '1') { t.skip('zarsim=1 to run the hero slot comparison sim'); return; }
    const seeds = Math.max(1, +t.param('seeds', 2) || 2), lv = Math.max(1, +t.param('lv', 3) || 3);
    const acts = String(t.param('acts', '1,2')).split(',').map(Number);
    const gold = Math.max(0, +t.param('gold', 60) || 0);
    const only = t.param('heroes', '') ? String(t.param('heroes', '')).split(',') : null;
    const heroes = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id) && (!only || only.indexOf(id) >= 0); });
    const bySkill = {}, casts = {};
    const encs = Object.keys(DD.defs.encounters).map(DD.getEncounter)
      .filter(function (e) { return !/^test_/.test(e.id) && e.kind === 'normal' && acts.indexOf(e.act) >= 0; });
    const rows = [];
    heroes.forEach(function (hid) {
      const def = DD.getHero(hid);
      const r = { id: hid, fights: 0, wins: 0, dmg: 0, rounds: 0, taken: 0, downs: 0, errors: 0 };
      encs.forEach(function (enc) {
        for (let s = 0; s < seeds; s++) {
          const key = 'zarsim:' + enc.id + ':' + s;
          const extra = DD.RNG(key + ':' + hid).sample(def.skillPool.filter(function (id) { return def.startingSkills.indexOf(id) < 0; }), 2);
          const skills = def.startingSkills.map(function (id) { return { id: id, level: 2 }; }).concat(extra.map(function (id) { return { id: id, level: 1 }; }));
          const party = [hid, 'test_knight', 'test_cleric', 'test_rogue'].map(function (id, i) {
            return DD.Combat.makeRunHero(i ? { id: id, level: lv } : { id: id, level: lv, skills: skills });
          });
          try {
            const setup = DD.Encounter.build(enc, party, { rng: DD.RNG(key), difficulty: 'normal', act: enc.act });
            DD.Combat.start(setup, { seed: key, headless: true, gold: gold, difficulty: 'normal', kind: 'normal' });
            const me = DD.Combat.state.units.filter(function (u) { return u.defId === hid && u.kind === 'hero'; })[0];
            let downs = 0;
            const off = DD.Events.on('unit:downed', function (e) { if (e && (e.unit === me || e.unitId === me.id)) downs++; });
            if (hid === ZAR) {
              DD.Act.addRule({ id: 'zar_sim_probe', name: 'Probe', hooks: {
                onTakeDamage: function (d) {
                  if (DD.Act.simulating || d.source !== me || !(d.dealt > 0)) return;
                  const k = d.skill ? d.skill.id : (d.tags || []).indexOf('rebuke') >= 0 ? 'zar_rebuke' : 'other:' + d.cause;
                  bySkill[k] = (bySkill[k] || 0) + d.dealt;
                },
                onSkillUsed: function (ctx) { if (!DD.Act.simulating && ctx.user === me) casts[ctx.skill.id] = (casts[ctx.skill.id] || 0) + 1; },
              } });
            }
            const res = DD.AutoPlay.runBattle(30);
            off();
            const st = DD.Combat.state.stats.units[me.id] || { dmg: 0, taken: 0 };
            r.fights++; r.wins += res.result === 'victory' ? 1 : 0; r.rounds += res.rounds; r.dmg += st.dmg; r.taken += st.taken; r.downs += downs;
          } catch (e) { r.errors++; t.log(hid + ' @ ' + enc.id + ': ' + e.message); }
        }
      });
      rows.push(r);
    });
    rows.sort(function (a, b) { return b.dmg / Math.max(1, b.rounds) - a.dmg / Math.max(1, a.rounds); });
    t.log(encs.length + ' encounters × ' + seeds + ' seeds, level ' + lv + ', acts ' + acts.join('+') + ', ' + gold + ' gold');
    if (Object.keys(casts).length) t.log('zarathor damage by skill ' + JSON.stringify(bySkill) + ' · casts ' + JSON.stringify(casts));
    rows.forEach(function (r) {
      t.log(r.id + ': won ' + r.wins + '/' + r.fights + ' · dmg/round ' + (r.dmg / Math.max(1, r.rounds)).toFixed(1) + ' · taken/fight ' +
        (r.taken / Math.max(1, r.fights)).toFixed(1) + ' · downs/fight ' + (r.downs / Math.max(1, r.fights)).toFixed(2) + ' · rounds/fight ' +
        (r.rounds / Math.max(1, r.fights)).toFixed(1) + (r.errors ? ' · errors ' + r.errors : ''));
    });
    t.ok(rows.every(function (r) { return !r.errors; }), 'no fight threw');
  });
})();
