/* Dungeons and Degenerates — tests/content/hero_sparrow.js
 * Suites "hero_sparrow: …" for js/data/heroes/sparrow.js (v2: initiative turns, no telegraphs, no Guard, simple kit):
 * registry data, numbers and barks; the simplicity rules (one verb + at most one rider per skill, measured by what
 * each execute really does; short descs; honest levels); the Blood Price passive (an adjacent Bleeding foe pays her HP
 * costs); every skill at every level against armor-free fixture foes (damage, statuses, displacement, summons, costs,
 * cooldowns, charges) and how its effect plays out on the enemies' own turns; the signature; the items; combos with
 * fixture allies; v2 edge cases (silenced / stunned / sheep / charmed user, not her turn, targets dying mid-skill, pits,
 * lava, water, map edges, AP, statuses lasting exactly the right own turns); previews against reality; sprites; and
 * AutoPlay battles with ['sparrow', 'test_knight', 'test_cleric', 'test_mage'] vs fixture encounters at levels 1/3/5.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  const POOL = ['spa_hemoglob', 'spa_juicebox', 'spa_papercuts', 'spa_spray', 'spa_scab', 'spa_goblinmode', 'spa_puppet',
    'spa_twin', 'spa_blooddrive', 'spa_veinglory'];
  const HERO_SKILLS = POOL.concat(['spa_basic', 'spa_signature']);
  const CLONE_SKILLS = ['spa_clone_shiv', 'spa_clone_taunt'];
  const ITEMS = ['spa_shiv_of_sharing', 'spa_scab_mail', 'spa_donor_card'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const V1_WORDS = /telegraph|intent|\bGuard\b|fizzle|redirect|Blood Frenzy|frenzy/i;

  // ---- helpers ------------------------------------------------------------------------------------------
  function sk(id) { return DD.getSkill(id); }
  function L(id, lv) { return DD.skillLevel(sk(id), lv); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function stacks(u, id) { const st = DD.Act.getStatus(u, id); return st ? st.stacks : 0; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function surf(x, y) { const tl = DD.Grid.tile(x, y); return tl && tl.surface ? tl.surface.id : null; }
  function passive() { return DD.getHero('sparrow').passive; }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0]; }

  /**
   * Sandbox with Sparrow at cfg.at (default (2, 4)), her turn first (heroesFirst). Enemies pass every turn unless
   * cfg.ai (then they act on their turns, round 1 included). cfg: { at, level, skills: [[id, lv]...], items, hp, enemies,
   * heroes (extra, after her), terrain, objects, surfaces, w, h, seed, ai, order }. Returns { s, spa, slot(id) }.
   */
  function arena(cfg) {
    cfg = cfg || {};
    const p = cfg.at || [2, 4];
    const skills = (cfg.skills || []).map(function (e) { return { id: e[0], level: e[1] || 1 }; });
    const heroes = [{ id: 'sparrow', x: p[0], y: p[1], level: cfg.level || 1, skills: skills, items: cfg.items || [], hp: cfg.hp }]
      .concat(cfg.heroes || []);
    const s = DD.Combat.sandbox({
      w: cfg.w || 9, h: cfg.h || 9, seed: cfg.seed || 7, enemyAi: cfg.ai ? undefined : false, order: cfg.order,
      objective: { type: 'custom', text: 'Sparrow test' }, encounter: { id: 'spa_test_arena', checkObjective: function () { return null; } },
      heroes: heroes, enemies: cfg.enemies || [], terrain: cfg.terrain, objects: cfg.objects, surfaces: cfg.surfaces,
    });
    const spa = s.units.filter(function (u) { return u.defId === 'sparrow'; })[0];
    return { s: s, spa: spa, slot: function (id) { return slotOf(spa, id); } };
  }
  function E(x, y, id, hpMult) { return { id: id || 'test_grunt', x: x, y: y, hpMult: hpMult }; }

  /** Use a slot for real (canUse + valid target), failing the test with the reason otherwise. */
  function use(t, u, slot, x, y, label) {
    const ok = DD.Combat.canUse(u, slot);
    if (ok !== true) { t.fail((label || (slot && slot.id)) + ': canUse says ' + ok); return false; }
    const r = DD.Combat.useSkill(u, slot, x, y);
    if (!r) t.fail((label || slot.id) + ': useSkill refused target ' + x + ',' + y);
    return r;
  }
  /** Resolve a skill straight to execute (no costs, no turn check), as the content smoke tests do. */
  function resolve(u, slotOrDef, target) {
    return DD.Combat._action(function () { return DD.Combat.resolveSkill(u, slotOrDef, target, {}); });
  }

  /** Run fn while recording attacks of opportunity as 'attacker>mover' def ids (event 'opportunity:attack'). */
  function opps(fn) {
    const seen = [];
    const off = DD.Events.on('opportunity:attack', function (e) { seen.push(e.attacker.defId + '>' + e.mover.defId); });
    try { fn(); } finally { off(); }
    return seen.join(' ');
  }

  /** Per-unit HP before an action, to compare with a preview afterwards. */
  function hpMap(s) { const m = {}; s.units.forEach(function (u) { m[u.id] = { hp: u.hp, dead: !!u.dead, downed: !!u.downed }; }); return m; }
  function previewProblems(prev, s, before) {
    const out = [];
    s.units.forEach(function (u) {
      const b = before[u.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[u.id];
      const real = b.hp - u.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
      if (real !== said) out.push(u.name + ': real HP change ' + (-real) + ', preview ' + (-said));
      const down = (u.dead && !b.dead) || (u.downed && !b.downed);
      if (down !== !!(e && e.lethal)) out.push(u.name + ': lethal mismatch');
    });
    return out;
  }
  function stateKey(s) {
    return JSON.stringify([s.units.map(function (u) {
      return [u.id, u.x, u.y, u.hp, u.block, u.ap, u.apBank || 0, !!u.dead, (u.statuses || []).map(function (st) { return [st.id, st.stacks, st.turns]; }),
        DD.Combat.slotsOf(u).map(function (sl) { return [sl.id, sl.cd, sl.uses]; })];
    }), s.grid.tiles.map(function (tl) { return [tl.t, tl.surface && tl.surface.id, tl.obj && tl.obj.hp]; }), s.hype, s.rng.getState(), s.log.length,
    s.turn, s.current]);
  }
  /** Preview then use: the preview must leave the fight untouched and match reality exactly (no dice in her kit). */
  function previewThenUse(t, u, slot, x, y, label) {
    const s = DD.Combat.state;
    const k0 = stateKey(s);
    const prev = DD.Combat.preview(u, slot, x, y);
    t.eq(stateKey(s), k0, label + ': preview leaves the fight untouched');
    t.ok(prev && !prev.uncertain, label + ': preview is exact (no dice)');
    const before = hpMap(s);
    const hype0 = s.hype;
    use(t, u, slot, x, y, label);
    if (prev) {
      previewProblems(prev, s, before).forEach(function (m) { t.fail(label + ': preview ≠ reality: ' + m); });
      t.eq(s.hype - hype0, prev.hype, label + ': preview Hype matches');
    }
    return prev || { perUnit: {} };
  }

  /**
   * What a skill's execute does at the top level, as verbs: damage, heal, block, displace (push / pull), move
   * (teleport), summon, terrain, ap, cleanse and status:<id>. Engine follow-ups (a push's Bleed tick, a bump, a
   * kill's Hype) happen inside those calls and are not counted; neither is the blood price (paid with the costs).
   */
  const VERB = { damage: 'damage', heal: 'heal', addBlock: 'block', push: 'displace', pull: 'displace', knockback: 'displace',
    teleport: 'move', swap: 'move', moveAlong: 'move', summon: 'summon', spawn: 'summon', setSurface: 'terrain', applyElement: 'terrain',
    splash: 'terrain', setTerrain: 'terrain', setHeight: 'terrain', placeObject: 'terrain', removeObject: 'terrain', explode: 'terrain',
    gainAp: 'ap', cleanse: 'cleanse', removeStatus: 'cleanse', resetCooldowns: 'ap', setCooldown: 'ap', addStatus: 'status' };
  function census(def, fn) {
    const orig = {}, seen = {};
    let depth = 0, inExec = false;
    const exec = def.execute;
    def.execute = function () { inExec = true; try { return exec.apply(this, arguments); } finally { inExec = false; } };
    Object.keys(VERB).forEach(function (n) {
      if (typeof DD.Act[n] !== 'function') return;
      orig[n] = DD.Act[n];
      DD.Act[n] = function () {
        if (inExec && depth === 0) {
          let v = VERB[n];
          if (n === 'addStatus') v = 'status:' + arguments[1];
          if (n === 'damage' && !(+arguments[2] > 0)) v = null;
          if (v) seen[v] = (seen[v] || 0) + 1;
        }
        depth++;
        try { return orig[n].apply(this, arguments); } finally { depth--; }
      };
    });
    try { fn(); } finally {
      Object.keys(orig).forEach(function (n) { DD.Act[n] = orig[n]; });
      def.execute = exec;
    }
    return Object.keys(seen).sort().join('+');
  }

  // ---- registry & data --------------------------------------------------------------------------------------
  T.suite('hero_sparrow: registry, numbers, descriptions and barks (v2)', function (t) {
    const h = DD.getHero('sparrow');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.eq(h.name, 'Sparrow', 'name');
    t.ok(h.epithet && h.race === 'Goblin' && h.cls === 'Blood Mage' && h.role && h.blurb.length > 60, 'identity + blurb');
    t.eq(h.unlock, null, 'available from the start (v2: every hero def has unlock: null)');
    t.eq(h.stats.init, 3, 'initiative modifier +3 (a quick little goblin)');
    t.ok(h.stats.hp >= 20 && h.stats.hp <= 36 && h.stats.ap === 3 && h.stats.mov >= 3 && h.stats.mov <= 5, 'L1 stats in DESIGN range');
    t.ok(!h.stats.block, 'no starting Block (v2: nobody starts a fight with Block)');
    t.ok(h.growth.hp >= 3 && h.growth.hp <= 5, 'growth in range');
    t.eq(h.startingSkills.length, 2, 'exactly 2 starting skills');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'pool contents');
    t.ok(h.skillPool.length >= 9 && h.skillPool.length <= 10, 'pool of 9-10 (DESIGN v2: 8-10; registry suite: 9-11)');
    h.startingSkills.forEach(function (id) { t.ok(h.skillPool.indexOf(id) >= 0, id + ' starter in pool'); });
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic/signature not in pool');
    t.eq(sk(h.signature).hype, 100, 'signature costs 100 Hype');
    const b = L(h.basic, 1);
    t.ok(b.dmg >= 4 && b.dmg <= 6 && sk(h.basic).ap === 1, 'basic 1 AP, 4-6 dmg');
    t.eq(JSON.stringify(h.summons), JSON.stringify(['spa_clone']), 'summons listed');
    // every skill: prefix, one emoji icon, 3 levels for the pool, exact descs that show their numbers
    const aps = {};
    HERO_SKILLS.concat(CLONE_SKILLS).forEach(function (id) {
      const d = sk(id);
      t.ok(!!d, id + ' registered');
      if (!d) return;
      t.ok(id.indexOf('spa_') === 0, id + ' prefixed');
      t.ok(typeof d.icon === 'string' && d.icon.length > 0 && d.icon.length <= 3, id + ' one emoji icon');
      if (POOL.indexOf(id) >= 0) {
        t.eq(d.levels.length, 3, id + ' has 3 levels');
        aps[d.ap] = 1;
        t.eq(d.owner, 'sparrow', id + ' owner');
      }
      for (let lv = 1; lv <= d.levels.length; lv++) {
        const txt = DD.skillDesc(d, lv, null);
        t.ok(txt && !/undefined|NaN|\[object/.test(txt), id + ' L' + lv + ' desc with null user');
        const Lv = DD.skillLevel(d, lv);
        ['dmg', 'heal', 'block', 'bleed', 'push', 'hp', 'r', 'len', 'per', 'thorns'].forEach(function (k) {
          if (typeof Lv[k] !== 'number' || !(Lv[k] > 0)) return;
          if (id === 'spa_twin' && k === 'r' && Lv.r === 1) { t.ok(/next to it/.test(txt), id + ' L' + lv + ' desc: radius 1 reads "next to it"'); return; }
          t.ok(new RegExp('(^|[^0-9])' + Lv[k] + '([^0-9]|$)').test(txt), id + ' L' + lv + ' desc shows ' + k + ' ' + Lv[k]);
        });
      }
      t.ok(!d.flavor || d.flavor.length <= 120, id + ' flavor ≤ 120');
    });
    t.ok(aps[1] && aps[2] && aps[3], 'pool mixes 1, 2 and 3 AP skills');
    t.ok(POOL.some(function (id) { return sk(id).charges > 0; }) && POOL.some(function (id) { return sk(id).cooldown >= 3; }), 'big skills: charges / long cooldowns');
    t.ok(POOL.filter(function (id) { const c = sk(id).hpCost; return typeof c === 'function' || c > 0; }).length >= 6, 'many skills cost HP');
    // barks: every key 4-6 lines of ≤ 70 characters, some name other heroes (incl. the v2 newcomers)
    let named = 0;
    BARK_KEYS.forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ' has 4-6 lines (' + lines.length + ')');
      lines.forEach(function (line) {
        t.ok(typeof line === 'string' && line.length > 0 && line.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(line) + ' (' + line.length + ')');
        if (/Zarathor|Syllamin|Marbles|Marwyn|Ellaria|Josiah|Corelos|Slate|Buga|Kiri|Betty|Basanos|Valdris|Hjalmar|Pebbles/.test(line)) named++;
      });
    });
    t.ok(named >= 8, 'barks reference other heroes (' + named + ')');
    ['Valdris', 'Hjalmar', 'Pebbles'].forEach(function (n) {
      t.ok(BARK_KEYS.some(function (k) { return (h.barks[k] || []).some(function (line) { return line.indexOf(n) >= 0; }); }), 'a bark for the newcomer ' + n);
    });
    // her extra key: barks when she makes an attack of opportunity
    const opp = h.barks.opportunity || [];
    t.ok(opp.length >= 4 && opp.length <= 6 && opp.every(function (line) { return line.length > 0 && line.length <= 70; }), 'barks.opportunity: 4-6 short lines');
    // nothing left over from v1: no frenzy chip, no telegraph / Guard wording anywhere she shows text
    t.ok(!DD.getStatus('spa_frenzy'), 'the v1 Blood Frenzy chip is gone (the passive is one rule now)');
    const texts = [h.blurb, h.role, h.passive.name, h.passive.desc, DD.getSummon('spa_clone').desc];
    HERO_SKILLS.concat(CLONE_SKILLS).forEach(function (id) { for (let lv = 1; lv <= sk(id).levels.length; lv++) texts.push(DD.skillDesc(sk(id), lv, null)); });
    ITEMS.forEach(function (id) { texts.push(DD.getItem(id).desc); });
    BARK_KEYS.concat(['opportunity']).forEach(function (k) { (h.barks[k] || []).forEach(function (line) { texts.push(line); }); });
    texts.forEach(function (txt) { t.ok(!V1_WORDS.test(txt), 'no v1 mechanics in ' + JSON.stringify(String(txt).slice(0, 60))); });
    // the passive: one rule, two hooks (waive the cost, the donor pays) + the HUD's exact payer query
    t.eq(h.passive.name, 'Blood Price', 'passive name');
    t.ok(/adjacent Bleeding foe/.test(h.passive.desc) && /HP costs/.test(h.passive.desc), 'passive desc: the one rule');
    t.eq(Object.keys(h.passive.hooks).sort().join(','), 'modifyCost,onCostPaid', 'passive hooks: modifyCost + onCostPaid only');
    t.eq(typeof h.passive.hpPayer, 'function', 'passive.hpPayer for the HUD "paid by" pill');
    // summon and items
    const c = DD.getSummon('spa_clone');
    t.ok(c && c.hp === 8 && c.ap === 2 && c.skills.length === 2 && c.names.length >= 4, 'Blood Clone summon');
    ITEMS.forEach(function (id) {
      const it = DD.getItem(id);
      t.ok(it && it.hero === 'sparrow' && it.desc && it.flavor, id + ' item registered for Sparrow');
      t.ok(it && !(it.stats && it.stats.block), id + ': no stats.block (ignored in v2)');
      t.ok(it && it.desc.split(/\.\s+/).filter(Boolean).length === 1, id + ': one rule (' + (it && it.desc) + ')');
    });
    t.eq(DD.getItem('spa_donor_card').rarity, 'legendary', 'a legendary item');
    t.ok(DD.getItem('spa_shiv_of_sharing').rarity === 'rare' && DD.getItem('spa_scab_mail').rarity === 'rare', 'rare items');
    if (DD.Sprites && DD.Sprites.portrait) {
      const cv = t.tryRun('portrait', function () { return DD.Sprites.portrait('sparrow', 64); });
      t.ok(cv && cv.width > 0, 'portrait renders');
    }
  });

  // ---- simplicity ------------------------------------------------------------------------------------------
  T.suite('hero_sparrow: simplicity — one verb + at most one rider, one-breath descs, honest levels', function (t) {
    // 1. every desc reads in one breath: ≤ 22 words, ≤ 2 sentences, no if/else clauses
    HERO_SKILLS.concat(CLONE_SKILLS).forEach(function (id) {
      for (let lv = 1; lv <= sk(id).levels.length; lv++) {
        const d = DD.skillDesc(sk(id), lv, null);
        const words = d.split(/\s+/).filter(Boolean).length;
        const sentences = 1 + (d.match(/[.!?]\s+[A-Z0-9]/g) || []).length;
        t.ok(words <= 22, id + ' L' + lv + ' desc ≤ 22 words (' + words + '): ' + d);
        t.ok(sentences <= 2, id + ' L' + lv + ' desc ≤ 2 sentences (' + sentences + ')');
        t.ok(!/\b(if|unless|otherwise|instead|except|then)\b/i.test(d), id + ' L' + lv + ' desc has no if/else clauses');
      }
    });
    const pdesc = passive().desc;
    t.ok(pdesc.split(/\s+/).length <= 20 && (pdesc.match(/\./g) || []).length === 1, 'passive: one sentence (' + pdesc + ')');
    // 2. what each execute really does: a primary verb plus at most one rider (one status / displacement / move)
    const want = {
      spa_basic: 'damage+status:bleed', spa_signature: 'damage+status:bleed', spa_hemoglob: 'damage+status:bleed',
      spa_juicebox: 'damage+heal', spa_papercuts: 'damage+status:bleed', spa_spray: 'damage+status:dazzled',
      spa_scab: ['block', 'block', 'block+status:thorns'], spa_goblinmode: 'move+status:stealth', spa_puppet: 'displace',
      spa_twin: 'status:taunt+summon', spa_blooddrive: 'heal+status:empowered', spa_veinglory: 'damage+move',
      spa_clone_shiv: 'damage+status:bleed', spa_clone_taunt: 'status:taunt',
    };
    const where = {
      spa_basic: [3, 4], spa_signature: null, spa_hemoglob: [5, 4], spa_juicebox: [3, 4], spa_papercuts: [4, 4], spa_spray: [3, 4],
      spa_scab: null, spa_goblinmode: [2, 8], spa_puppet: [2, 3], spa_twin: [4, 4], spa_blooddrive: [1, 4], spa_veinglory: [5, 4],
      spa_clone_shiv: [5, 4], spa_clone_taunt: null,
    };
    Object.keys(want).forEach(function (id) {
      const def = sk(id);
      for (let lv = 1; lv <= def.levels.length; lv++) {
        const a = arena({ heroes: [{ id: 'test_knight', x: 1, y: 4, hp: 12 }],
          enemies: [E(3, 4, 'test_grunt', 3), E(5, 4, 'test_grunt', 3), E(4, 5, 'test_grunt', 3), E(2, 2, 'test_archer')] });
        DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 2 }, null);
        DD.Act.addStatus(at(5, 4), 'bleed', { stacks: 1 }, null);
        a.spa.hp = 15;
        let user = a.spa;
        if (def.owner === 'summon') user = DD.Act.summon(a.spa, 'spa_clone', 4, 4, { level: lv, noFx: true });
        if (!user) { t.fail(id + ': no clone to use it'); continue; }
        const slot = DD.Act.makeSlot(id, lv);
        const p = where[id];
        const got = census(def, function () { resolve(user, slot, p ? { x: p[0], y: p[1] } : { x: user.x, y: user.y }); });
        const exp = Array.isArray(want[id]) ? want[id][lv - 1] : want[id];
        t.eq(got, exp, id + ' L' + lv + ' does exactly: ' + exp);
        const verbs = got.split('+').filter(Boolean);
        t.ok(verbs.length <= 2 && verbs.filter(function (v) { return v.indexOf('status:') === 0; }).length <= 1, id + ' L' + lv + ': one verb + at most one rider (' + got + ')');
      }
    });
    t.ok(Object.keys(want).length === HERO_SKILLS.length + CLONE_SKILLS.length, 'every skill of hers is in the verb table');
    // 3. levels: II = bigger numbers (same keys); III = bigger numbers OR one added rider (not both: DESIGN §6)
    POOL.forEach(function (id) {
      const lv = sk(id).levels;
      for (let i = 1; i < lv.length; i++) {
        const a = lv[i - 1], b = lv[i];
        const added = Object.keys(b).filter(function (k) { return a[k] === undefined; });
        const lost = Object.keys(a).filter(function (k) { return b[k] === undefined || (typeof a[k] === 'number' && !(b[k] >= a[k])); });
        const up = Object.keys(a).some(function (k) { return typeof a[k] === 'number' && b[k] > a[k]; });
        t.eq(lost.length, 0, id + ' level ' + (i + 1) + ' keeps every number of level ' + i);
        t.ok(i === 1 ? added.length === 0 && up : (added.length === 0 && up) || (added.length === 1 && !up),
          id + ' level ' + (i + 1) + (i === 1 ? ': bigger numbers' : ': bigger numbers or one added rider, not both') + ' (added ' + added.join(',') + ', bigger ' + up + ')');
      }
    });
  });

  // ---- passive -----------------------------------------------------------------------------------------------
  T.suite('hero_sparrow: Blood Price — an adjacent Bleeding foe pays her HP costs', function (t) {
    // an adjacent Bleeding foe pays; the target is elsewhere
    let a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(3, 4, 'test_grunt', 3), E(2, 7, 'test_grunt', 3)] });
    const donor = at(3, 4), target = at(2, 7);
    t.eq(DD.Combat.costOf(a.spa, sk('spa_hemoglob'), 1).hp, 2, 'no Bleeding foe: she pays 2');
    t.eq(passive().hpPayer(a.spa, sk('spa_hemoglob'), 1), null, 'hpPayer: nobody else pays');
    DD.Act.addStatus(donor, 'bleed', { stacks: 1 }, a.spa);
    t.eq(DD.Combat.costOf(a.spa, sk('spa_hemoglob'), 1).hp, 0, 'costOf shows 0 HP with a donor adjacent');
    t.eq(passive().hpPayer(a.spa, sk('spa_hemoglob'), 1), donor, 'hpPayer names the donor (HUD "paid by")');
    // (the HUD's own suite "hud: Blood Price donor" checks the pill with a mounted HUD; it asks passive.hpPayer)
    const d0 = donor.hp, t0 = target.hp;
    const prev = previewThenUse(t, a.spa, a.slot('spa_hemoglob'), 2, 7, 'donor pays');
    t.eq(prev.perUnit[donor.id] && prev.perUnit[donor.id].dmg, 2, 'the preview shows the donor paying 2');
    t.eq(a.spa.hp, 22, 'Sparrow keeps her HP');
    t.eq(d0 - donor.hp, 2, 'the donor pays the 2 HP');
    t.eq(t0 - target.hp, 6, 'the target takes the glob');
    // a Bleeding foe 2 tiles away is no donor
    a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(4, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(at(4, 4), 'bleed', { stacks: 2 }, a.spa);
    t.eq(DD.Combat.costOf(a.spa, sk('spa_hemoglob'), 1).hp, 2, 'a foe 2 tiles away is no donor');
    use(t, a.spa, a.slot('spa_hemoglob'), 4, 4, 'self-paid');
    t.eq(a.spa.hp, 20, 'paid 2 herself');
    // at 1 HP: blocked without a donor, free with one; the one with the most Bleed pays on a tie
    a = arena({ skills: [['spa_scab', 1]], enemies: [E(3, 4, 'test_grunt', 3), E(1, 4, 'test_grunt', 3)] });
    a.spa.hp = 1;
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_scab')), 'Not enough HP.', 'at 1 HP she cannot pay');
    DD.Act.addStatus(at(1, 4), 'bleed', { stacks: 1 }, null);
    DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 3 }, null);
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_scab')), true, 'a donor makes it usable at 1 HP');
    const w0 = at(1, 4).hp, e0 = at(3, 4).hp;
    use(t, a.spa, a.slot('spa_scab'), 2, 4, 'scab at 1 HP');
    t.ok(a.spa.hp === 1 && a.spa.block === 8, 'still 1 HP, got the Block');
    t.eq(e0 - at(3, 4).hp, 3, 'the donor with the most Bleed pays (tie on distance)');
    t.eq(at(1, 4).hp, w0, 'the other one does not');
    // invulnerable foes do not donate; Block and armor do not stop the blood price
    a = arena({ skills: [['spa_scab', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 1 }, null);
    DD.Act.addStatus(at(3, 4), 'invulnerable', { turns: 2 }, null);
    t.eq(DD.Combat.costOf(a.spa, sk('spa_scab'), 1).hp, 3, 'an invulnerable Bleeding foe is no donor');
    DD.Act.removeStatus(at(3, 4), 'invulnerable', { silent: true });
    at(3, 4).block = 10;
    const hb = at(3, 4).hp;
    use(t, a.spa, a.slot('spa_scab'), 2, 4, 'blood price through Block');
    t.ok(hb - at(3, 4).hp === 3 && at(3, 4).block === 10, 'Block does not stop the blood price');
    a = arena({ skills: [['spa_scab', 1]], enemies: [E(3, 4, 'test_brute')] });
    const brute = at(3, 4);
    DD.Act.addStatus(brute, 'bleed', { stacks: 1 }, null);
    const br0 = brute.hp;
    use(t, a.spa, a.slot('spa_scab'), 2, 4, 'blood price vs armor');
    t.eq(br0 - brute.hp, 3, 'armor does not shrink it either (armored brute pays exactly 3)');
    // a donor that dies paying: the skill still resolves, nobody else pays
    a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(3, 4), E(6, 4, 'test_grunt', 3)] });
    const frail = at(3, 4);
    frail.hp = 2;
    DD.Act.addStatus(frail, 'bleed', { stacks: 1 }, null);
    const far0 = at(6, 4).hp;
    use(t, a.spa, a.slot('spa_hemoglob'), 6, 4, 'donor dies');
    t.ok(frail.dead && a.spa.hp === 22, 'the donor bled out paying, Sparrow paid nothing');
    t.eq(far0 - at(6, 4).hp, 6, 'the glob still lands');
    // the donor IS the target and dies paying: the skill fizzles cleanly
    a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(3, 4), E(8, 8)] });
    const f3 = at(3, 4);
    f3.hp = 1;
    DD.Act.addStatus(f3, 'bleed', { stacks: 1 }, null);
    use(t, a.spa, a.slot('spa_hemoglob'), 3, 4, 'target pays and dies');
    t.ok(f3.dead && a.spa.hp === 22 && !DD.Combat.state.result, 'target died paying, no errors, the fight goes on');
    // the charmer is no donor (a charmed hero can't hurt her charmer); another adjacent Bleeding foe still is
    a = arena({ skills: [['spa_scab', 1], ['spa_hemoglob', 1]], enemies: [E(3, 4, 'test_grunt', 3), E(2, 5, 'test_grunt', 3), E(6, 4, 'test_grunt', 3)] });
    const charmer = at(3, 4), other = at(2, 5), far = at(6, 4);
    DD.Act.addStatus(charmer, 'bleed', { stacks: 2 }, null);
    DD.Act.addStatus(a.spa, 'charmed', { turns: 1 }, charmer);
    t.eq(DD.Combat.costOf(a.spa, sk('spa_scab'), 1).hp, 3, 'charmed: the charmer is no donor');
    const c0 = charmer.hp;
    previewThenUse(t, a.spa, a.slot('spa_scab'), 2, 4, 'charmed scab');
    t.ok(charmer.hp === c0 && a.spa.hp === 19, 'the charmer loses nothing, Sparrow pays 3');
    DD.Act.addStatus(other, 'bleed', { stacks: 1 }, null);
    t.eq(DD.Combat.costOf(a.spa, sk('spa_hemoglob'), 1).hp, 0, 'charmed: another adjacent Bleeding foe still donates');
    const o0 = other.hp, fr0 = far.hp;
    previewThenUse(t, a.spa, a.slot('spa_hemoglob'), 6, 4, 'charmed glob');
    t.ok(o0 - other.hp === 2 && charmer.hp === c0 && a.spa.hp === 19 && fr0 - far.hp === 6, 'the other foe pays 2, the glob lands');
    // a resolve that pays no costs (a free "make an attack" effect, a preview by def) charges nobody
    a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(3, 4, 'test_grunt', 3), E(6, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 1 }, null);
    const n0 = at(3, 4).hp, m0 = at(6, 4).hp;
    resolve(a.spa, a.slot('spa_hemoglob'), { x: 6, y: 4 });
    t.ok(at(3, 4).hp === n0 && m0 - at(6, 4).hp === 6, 'no payment, no blood price (the glob still lands)');
    const pv = DD.Targeting.preview(a.spa, sk('spa_hemoglob'), { x: 6, y: 4 });
    t.ok(!pv.perUnit[at(3, 4).id] || !pv.perUnit[at(3, 4).id].dmg, 'a preview by def (no payment) shows no blood price');
    // drawing blood wakes a sleeping donor (damage wakes sleepers): the preview shows it before she casts
    a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(3, 4, 'test_grunt', 3), E(6, 4, 'test_grunt', 3)] });
    const sleeper = at(3, 4);
    DD.Act.addStatus(sleeper, 'bleed', { stacks: 1 }, null);
    DD.Act.addStatus(sleeper, 'sleep', { turns: 2 }, null);
    const ps = DD.Combat.preview(a.spa, a.slot('spa_hemoglob'), 6, 4).perUnit[sleeper.id];
    t.ok(ps && ps.dmg === 2 && ps.removed.indexOf('sleep') >= 0, 'preview: the sleeping donor pays 2 and wakes');
    // the blood price is status damage: it doesn't break her Stealth
    a = arena({ skills: [['spa_scab', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 1 }, null);
    DD.Act.addStatus(a.spa, 'stealth', { turns: 1 }, a.spa);
    use(t, a.spa, a.slot('spa_scab'), 2, 4, 'scab while stealthed');
    t.ok(has(a.spa, 'stealth') && at(3, 4).hp === 39, 'the donor paid 3, she is still Stealthed');
    // no free lunch: every skill of hers with an HP cost charges the adjacent donor when the HUD shows it free
    const priced = [['spa_hemoglob', 6, 4], ['spa_papercuts', 6, 4], ['spa_spray', 3, 4], ['spa_scab', 2, 4], ['spa_puppet', 2, 3],
      ['spa_twin', 3, 5], ['spa_blooddrive', 2, 6], ['spa_veinglory', 4, 4], ['spa_signature', 2, 4]];
    const withCost = POOL.concat(['spa_signature']).filter(function (id) { return id === 'spa_signature' || sk(id).hpCost; });
    t.eq(priced.map(function (p) { return p[0]; }).sort().join(','), withCost.sort().join(','), 'every HP-cost skill is covered');
    priced.forEach(function (p) {
      const b = arena({ skills: p[0] === 'spa_signature' ? [] : [[p[0], 1]], heroes: [{ id: 'test_knight', x: 2, y: 6, hp: 10 }],
        enemies: [E(1, 4, 'test_grunt', 3), E(4, 4, 'test_grunt', 3), E(6, 4, 'test_grunt', 3)] });
      const dn = at(1, 4);
      DD.Act.addStatus(dn, 'bleed', { stacks: 1 }, null);
      if (p[0] === 'spa_signature') b.s.hype = 100;
      const slot = p[0] === 'spa_signature' ? b.spa.signature : b.slot(p[0]);
      const def = sk(p[0]);
      const raw = DD.resolve(def.hpCost, DD.skillLevel(def, 1), b.spa, 0);
      t.eq(DD.Combat.costOf(b.spa, def, 1).hp, 0, p[0] + ': shown free with a donor');
      const dd0 = dn.hp;
      use(t, b.spa, slot, p[1], p[2], p[0] + ' with a donor');
      t.ok(b.spa.hp === 22 && dd0 - dn.hp >= raw && raw > 0, p[0] + ': the donor paid ' + (dd0 - dn.hp) + ' (cost ' + raw + '), Sparrow ' + b.spa.hp);
    });
    // a skill that isn't hers (a generic HP-cost skill from a tome) is paid by her as usual
    a = arena({ enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 1 }, null);
    const foreign = { id: 'x_blood_pact', owner: 'generic', kind: 'spell', ap: 1, hpCost: 3, levels: [{}], target: { type: 'self' }, execute: function () {} };
    t.eq(DD.Combat.costOf(a.spa, foreign, 1).hp, 3, 'a non-Sparrow HP cost is not waived (nobody would pay it)');
    t.eq(passive().hpPayer(a.spa, foreign, 1), null, 'and hpPayer names nobody for it');
    t.eq(DD.Combat.costOf(a.spa, sk('spa_scab'), 1).hp, 0, 'her own still is');
    // desc == effect with the passive: no desc promises it is her own blood (a donor in reach pays any of her HP costs)
    HERO_SKILLS.forEach(function (id) {
      for (let lv = 1; lv <= sk(id).levels.length; lv++) {
        t.ok(!/\b(your|her) own blood\b/i.test(DD.skillDesc(sk(id), lv, null)), id + ' L' + lv + ': desc does not say it is her own blood');
      }
    });
  });

  // ---- skills -------------------------------------------------------------------------------------------------
  T.suite('hero_sparrow: Shiv Happens and Hemo-Glob (and Bleed on the enemy\'s turn)', function (t) {
    let a = arena({ enemies: [E(3, 4, 'test_grunt', 3)] });
    const f = at(3, 4), f0 = f.hp;
    previewThenUse(t, a.spa, a.spa.basic, 3, 4, 'basic');
    t.eq(f0 - f.hp, L('spa_basic', 1).dmg, 'basic damage');
    t.eq(stacks(f, 'bleed'), 1, 'basic Bleed 1');
    t.eq(a.spa.ap, 2, 'basic costs 1 AP');
    t.eq(DD.Combat.targets(a.spa, a.spa.basic).length, 1, 'basic is melee only');
    [1, 2, 3].forEach(function (lv) {
      const b = arena({ skills: [['spa_hemoglob', lv]], enemies: [E(6, 4, 'test_grunt', 3)] });
      const g = at(6, 4), g0 = g.hp;
      const Lv = L('spa_hemoglob', lv);
      previewThenUse(t, b.spa, b.slot('spa_hemoglob'), 6, 4, 'hemoglob L' + lv);
      t.eq(g0 - g.hp, Lv.dmg, 'L' + lv + ' damage ' + Lv.dmg);
      t.eq(stacks(g, 'bleed'), Lv.bleed, 'L' + lv + ' Bleed ' + Lv.bleed);
      t.eq(b.spa.hp, 20, 'L' + lv + ' costs 2 HP');
      t.eq(b.spa.ap, 2, 'L' + lv + ' costs 1 AP');
      t.eq(DD.Combat.canUse(b.spa, b.slot('spa_hemoglob')), 'On cooldown (1).', 'L' + lv + ' cooldown 1');
    });
    // cooldown 1 in own turns: unusable on her next turn, usable the one after
    a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(6, 4, 'test_grunt', 5)] });
    use(t, a.spa, a.slot('spa_hemoglob'), 6, 4, 'cd round 1');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === a.spa && DD.Combat.canUse(a.spa, a.slot('spa_hemoglob')) !== true, 'not usable on her next turn');
    DD.Combat.endTurn();
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_hemoglob')), true, 'usable the turn after');
    // range 5 + line of sight
    a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(8, 4), E(2, 7)], terrain: function (tl) { if (tl.x === 2 && tl.y === 6) tl.t = 'wall'; } });
    const tg = DD.Combat.targets(a.spa, a.slot('spa_hemoglob')).map(function (p) { return p.x + ',' + p.y; });
    t.ok(tg.indexOf('8,4') < 0, 'distance 6 is out of range');
    t.ok(tg.indexOf('2,7') < 0, 'a wall blocks line of sight');
    // v2: the Bleeding grunt walks up on its own turn: the walk costs its stacks and leaves blood; Bleed −1 at its turn end
    a = arena({ ai: true, skills: [['spa_hemoglob', 2]], enemies: [E(6, 4, 'test_grunt', 3)] });
    const g = at(6, 4);
    DD.Act.addStatus(g, 'bleed', { stacks: 1 }, a.spa);
    use(t, a.spa, a.slot('spa_hemoglob'), 6, 4, 'glob a far grunt');
    t.eq(stacks(g, 'bleed'), 2, 'Bleed 1 + 1 = 2 stacks');
    const gh = g.hp, sh = a.spa.hp;
    DD.Combat.endTurn();
    t.ok(g.x === 3 && g.y === 4, 'on its turn it walked up to her');
    t.eq(gh - g.hp, 2, 'the walk cost it its 2 Bleed stacks');
    t.ok(surf(3, 4) === 'blood', 'it left blood where it stopped');
    t.eq(stacks(g, 'bleed'), 1, 'Bleed −1 at the end of its own turn');
    t.eq(sh - a.spa.hp, 4, 'and stabbed her (no telegraph, it acts at once)');
  });

  T.suite('hero_sparrow: Juice Box', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_juicebox', lv);
      const a = arena({ skills: [['spa_juicebox', lv]], enemies: [E(4, 4, 'test_grunt', 4)] });
      const f = at(4, 4);
      DD.Act.addStatus(f, 'bleed', { stacks: 3 }, a.spa);
      a.spa.hp = 6;
      const f0 = f.hp;
      previewThenUse(t, a.spa, a.slot('spa_juicebox'), 4, 4, 'juice box L' + lv);
      const dealt = f0 - f.hp;
      t.eq(dealt, Lv.dmg + Lv.per * 3, 'L' + lv + ' damage = ' + Lv.dmg + ' + ' + Lv.per + ' × 3 Bleed');
      t.eq(a.spa.hp, 6 + Math.ceil(dealt / 2), 'L' + lv + ' heals half the damage dealt, rounded up');
      t.eq(stacks(f, 'bleed'), 3, 'L' + lv + ' the Bleed stays on it (a donor and the next payoff)');
      t.ok(!has(f, 'stun'), 'L' + lv + ' no faint any more (v2-simple)');
      t.eq(a.spa.ap, 1, 'L' + lv + ' costs 2 AP');
      t.eq(a.slot('spa_juicebox').cd, 2, 'L' + lv + ' cooldown 2');
      t.eq(DD.Combat.costOf(a.spa, sk('spa_juicebox'), lv).hp, 0, 'L' + lv + ' costs no HP');
    });
    // no Bleed: base damage only; range 2
    const b = arena({ skills: [['spa_juicebox', 1]], enemies: [E(2, 6, 'test_grunt', 4), E(5, 4)] });
    const g = at(2, 6), g0 = g.hp;
    b.spa.hp = 10;
    use(t, b.spa, b.slot('spa_juicebox'), 2, 6, 'juice no bleed');
    t.eq(g0 - g.hp, L('spa_juicebox', 1).dmg, 'no Bleed: base damage');
    t.eq(b.spa.hp, 10 + Math.ceil(L('spa_juicebox', 1).dmg / 2), 'heals half of it');
    const c = arena({ skills: [['spa_juicebox', 1]], enemies: [E(5, 4)] });
    t.ok(DD.Combat.targets(c.spa, c.slot('spa_juicebox')).every(function (p) { return Math.abs(p.x - 2) + Math.abs(p.y - 4) <= 2; }), 'range 2');
    t.eq(DD.Combat.canUse(c.spa, c.slot('spa_juicebox')), 'No valid targets.', 'a foe 3 tiles away is out of reach');
    // killing the target: heals from the HP actually drained
    const d = arena({ skills: [['spa_juicebox', 1]], enemies: [E(3, 4)] });
    at(3, 4).hp = 3;
    d.spa.hp = 10;
    use(t, d.spa, d.slot('spa_juicebox'), 3, 4, 'juice kill');
    t.eq(d.spa.hp, 10 + 2, 'heal = half of the 3 HP actually drained (rounded up)');
    // full HP: nothing to heal, no overheal
    const e = arena({ skills: [['spa_juicebox', 3]], enemies: [E(3, 4, 'test_grunt', 3)] });
    use(t, e.spa, e.slot('spa_juicebox'), 3, 4, 'juice at full HP');
    t.eq(e.spa.hp, e.spa.maxHp, 'no overheal at full HP');
  });

  T.suite('hero_sparrow: Thousand Paper Cuts and Say It, Don\'t Spray It (Dazzle on the enemy\'s turn)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_papercuts', lv);
      const a = arena({ skills: [['spa_papercuts', lv]], heroes: [{ id: 'test_knight', x: 5, y: 3 }],
        enemies: [E(5, 4, 'test_grunt', 3), E(6, 4, 'test_grunt', 3), E(5, 5, 'test_grunt', 3), E(7, 4, 'test_grunt', 3)] });
      const knight = at(5, 3), k0 = knight.hp;
      const hit = [at(5, 4), at(6, 4), at(5, 5)], miss = at(7, 4);
      const h0 = hit.map(function (u) { return u.hp; }), m0 = miss.hp;
      previewThenUse(t, a.spa, a.slot('spa_papercuts'), 5, 4, 'paper cuts L' + lv);
      hit.forEach(function (u, i) {
        t.eq(h0[i] - u.hp, Lv.dmg, 'L' + lv + ' foe ' + i + ' takes ' + Lv.dmg);
        t.eq(stacks(u, 'bleed'), Lv.bleed, 'L' + lv + ' foe ' + i + ' Bleed ' + Lv.bleed);
      });
      t.eq(miss.hp, m0, 'L' + lv + ' radius 1 only');
      t.eq(knight.hp, k0, 'L' + lv + ' allies are spared');
      t.eq(a.spa.hp, 20, 'L' + lv + ' costs 2 HP');
      t.eq(a.spa.ap, 1, 'L' + lv + ' costs 2 AP');
      t.eq(a.slot('spa_papercuts').cd, 2, 'L' + lv + ' cooldown 2');
      t.eq(a.s.hype, 4, 'L' + lv + ' 3 foes in one skill: +4 Hype');
    });
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_spray', lv);
      // cone east from (2,4): row 1 = (3,4); row 2 = (4,3),(4,4),(4,5); row 3 = (5,2..6)
      const a = arena({ skills: [['spa_spray', lv]], enemies: [E(3, 4, 'test_grunt', 3), E(4, 5, 'test_grunt', 3), E(5, 3, 'test_grunt', 3)] });
      const e1 = at(3, 4), e2 = at(4, 5), e3 = at(5, 3);
      const h = [e1.hp, e2.hp, e3.hp];
      previewThenUse(t, a.spa, a.slot('spa_spray'), 3, 4, 'spray L' + lv);
      t.eq(h[0] - e1.hp, Lv.dmg, 'L' + lv + ' row 1 hit for ' + Lv.dmg);
      t.eq(h[1] - e2.hp, Lv.dmg, 'L' + lv + ' row 2 hit');
      t.ok(has(e1, 'dazzled') && has(e2, 'dazzled'), 'L' + lv + ' Dazzled');
      t.eq(h[2] - e3.hp, Lv.len >= 3 ? Lv.dmg : 0, 'L' + lv + ' cone length ' + Lv.len);
      t.eq(surf(4, 4), null, 'L' + lv + ' no blood splatter any more (one rider: Dazzle)');
      t.eq(a.spa.hp, 20, 'L' + lv + ' costs 2 HP');
    });
    // v2: the dazzled grunt acts on its own turn and its stab lands 1 tile off; Dazzle wears off with that turn
    [11, 12, 13, 14].forEach(function (seed) {
      const b = arena({ ai: true, seed: seed, skills: [['spa_spray', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
      const e = at(3, 4);
      use(t, b.spa, b.slot('spa_spray'), 3, 4, 'spray vs grunt (seed ' + seed + ')');
      const hp0 = b.spa.hp;
      DD.Combat.endTurn();
      t.eq(b.spa.hp, hp0, 'seed ' + seed + ': the dazzled stab misses her');
      t.ok(!has(e, 'dazzled'), 'seed ' + seed + ': Dazzled wore off at the end of its turn');
      DD.Combat.endTurn();
      t.eq(b.spa.hp, hp0 - 4, 'seed ' + seed + ': its next stab lands');
    });
  });

  T.suite('hero_sparrow: Scab Armor, Goblin Mode and Blood Drive (v2 durations)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_scab', lv);
      const a = arena({ skills: [['spa_scab', lv]], enemies: [E(3, 4)] });
      previewThenUse(t, a.spa, a.slot('spa_scab'), 2, 4, 'scab L' + lv);
      t.eq(a.spa.block, Lv.block, 'L' + lv + ' Block ' + Lv.block);
      t.eq(a.spa.hp, 19, 'L' + lv + ' costs 3 HP');
      t.eq(stacks(a.spa, 'thorns'), Lv.thorns || 0, 'L' + lv + ' Thorns ' + (Lv.thorns || 0));
      t.eq(a.slot('spa_scab').cd, 2, 'L' + lv + ' cooldown 2');
    });
    // Block from her turn soaks the enemy turns of the round, then expires at the start of her next turn
    let b = arena({ ai: true, skills: [['spa_scab', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    use(t, b.spa, b.slot('spa_scab'), 2, 4, 'scab vs grunt');
    let during = -1;
    let off = DD.Events.on('turn:end', function (e) { if (e.unit && e.unit.side === 'enemy') during = b.spa.block; });
    DD.Combat.endTurn();
    off();
    t.eq(during, 4, 'the grunt\'s 4 on its turn came off the Block (8 → 4)');
    t.eq(b.spa.hp, 19, 'no HP lost to it');
    t.eq(b.spa.block, 0, 'Block expired at the start of her next turn');
    // Scab Armor III: Thorns bite on the enemy's turn and last exactly through her next turn
    b = arena({ ai: true, skills: [['spa_scab', 3]], enemies: [E(3, 4, 'test_grunt', 3)] });
    use(t, b.spa, b.slot('spa_scab'), 2, 4, 'scab III');
    const g = at(3, 4), g0 = g.hp;
    DD.Combat.endTurn();
    t.eq(g0 - g.hp, 3, 'Thorns 3 bit the grunt when it stabbed her');
    t.ok(has(b.spa, 'thorns'), 'Thorns still up during her next turn');
    DD.Combat.endTurn();
    t.ok(!has(b.spa, 'thorns'), 'gone after her next turn');
    t.eq(g0 - g.hp, 3, 'so its second stab took no thorns');
    // Goblin Mode: teleport + Stealth, every level
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_goblinmode', lv);
      const a = arena({ skills: [['spa_goblinmode', lv]], w: 11, enemies: [E(10, 8)] });
      const tg = DD.Combat.targets(a.spa, a.slot('spa_goblinmode'));
      t.ok(tg.every(function (p) { return Math.abs(p.x - 2) + Math.abs(p.y - 4) <= Lv.r; }) && tg.some(function (p) { return Math.abs(p.x - 2) + Math.abs(p.y - 4) === Lv.r; }), 'L' + lv + ' range ' + Lv.r);
      previewThenUse(t, a.spa, a.slot('spa_goblinmode'), 2 + Lv.r, 4, 'goblin mode L' + lv);
      t.ok(a.spa.x === 2 + Lv.r && a.spa.y === 4, 'L' + lv + ' teleported');
      t.ok(has(a.spa, 'stealth'), 'L' + lv + ' Stealthed');
      t.eq(a.slot('spa_goblinmode').cd, 3, 'L' + lv + ' cooldown 3');
      t.ok(a.spa.hp === 22 && a.spa.ap === 2, 'L' + lv + ' 1 AP, no HP');
    });
    // v2: on their turns enemies ignore her; Stealth lasts through her next turn and ends with it
    b = arena({ ai: true, skills: [['spa_goblinmode', 1]], enemies: [E(2, 8, 'test_archer'), E(4, 1)] });
    const archer = at(2, 8);
    use(t, b.spa, b.slot('spa_goblinmode'), 5, 4, 'goblin mode vs archer');
    const hp0 = b.spa.hp;
    DD.Combat.endTurn();
    t.eq(b.spa.hp, hp0, 'the archer and the grunt ignore her on their turns');
    t.ok(has(b.spa, 'stealth') && DD.Combat.current() === b.spa, 'still Stealthed on her next turn');
    t.ok(DD.AI.targetsFor(archer).indexOf(b.spa) < 0, 'not a target for the AI');
    DD.Combat.endTurn();
    t.ok(!has(b.spa, 'stealth'), 'Stealth ends with her next turn');
    // attacking reveals her
    b = arena({ skills: [['spa_goblinmode', 1]], enemies: [E(6, 4, 'test_grunt', 3)] });
    use(t, b.spa, b.slot('spa_goblinmode'), 5, 4, 'goblin mode next to a grunt');
    use(t, b.spa, b.spa.basic, 6, 4, 'stab from the shadows');
    t.ok(!has(b.spa, 'stealth'), 'dealing damage reveals her');
    // Blood Drive: heal + Empowered on an ally; the ally's next hit (on its own turn) is +50%
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_blooddrive', lv);
      const a = arena({ skills: [['spa_blooddrive', lv]], heroes: [{ id: 'test_knight', x: 5, y: 4, hp: 10 }], enemies: [E(6, 4, 'test_grunt', 3)] });
      const k = at(5, 4);
      previewThenUse(t, a.spa, a.slot('spa_blooddrive'), 5, 4, 'blood drive L' + lv);
      t.eq(k.hp, 10 + Lv.heal, 'L' + lv + ' heals ' + Lv.heal);
      t.ok(has(k, 'empowered'), 'L' + lv + ' Empowered');
      t.eq(a.spa.hp, 19, 'L' + lv + ' costs 3 HP');
      DD.Combat.endTurn();
      t.eq(DD.Combat.current(), k, 'L' + lv + ' the knight\'s turn comes next');
      const g2 = at(6, 4), g20 = g2.hp;
      use(t, k, k.basic, 6, 4, 'empowered knight L' + lv);
      t.eq(g20 - g2.hp, Math.round(5 * 1.5), 'L' + lv + ' the ally\'s next hit deals +50%');
      t.ok(!has(k, 'empowered'), 'L' + lv + ' Empowered spent');
    });
    const d = arena({ skills: [['spa_blooddrive', 1]], enemies: [E(6, 4)] });
    t.ok(DD.Combat.canUse(d.spa, d.slot('spa_blooddrive')) !== true, 'Blood Drive needs an ally (not herself)');
    // Empowered waits for the ally's next damaging skill, however many turns that takes
    const e = arena({ skills: [['spa_blooddrive', 1]], heroes: [{ id: 'test_knight', x: 5, y: 4 }], enemies: [E(8, 8)] });
    use(t, e.spa, e.slot('spa_blooddrive'), 5, 4, 'blood drive, no target for him');
    DD.Combat.endRound(); DD.Combat.endRound();
    t.ok(has(at(5, 4), 'empowered'), 'Empowered still waiting two rounds later');
  });

  T.suite('hero_sparrow: Blood Puppet Show', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_puppet', lv);
      // Sparrow (1,4): b1 (2,2) 3 tiles, b2 (3,2) 4 tiles, far (6,4) 5 tiles, still (2,6) not bleeding
      const a = arena({ skills: [['spa_puppet', lv]], at: [1, 4], w: 12,
        enemies: [E(2, 2, 'test_grunt', 3), E(3, 2, 'test_grunt', 3), E(2, 6, 'test_grunt', 3), E(6, 4, 'test_grunt', 3)] });
      const b1 = at(2, 2), b2 = at(3, 2), still = at(2, 6), far = at(6, 4);
      DD.Act.addStatus(b1, 'bleed', { stacks: 1 }, a.spa);
      DD.Act.addStatus(b2, 'bleed', { stacks: 2 }, a.spa);
      DD.Act.addStatus(far, 'bleed', { stacks: 1 }, a.spa);
      const h1 = b1.hp, h2 = b2.hp;
      previewThenUse(t, a.spa, a.slot('spa_puppet'), 2, 4, 'puppet L' + lv);
      t.eq(b1.x, 2 + Lv.push, 'L' + lv + ' first foe dragged ' + Lv.push);
      t.eq(b2.x, 3 + Lv.push, 'L' + lv + ' second foe dragged ' + Lv.push);
      t.eq(h1 - b1.hp, 1, 'L' + lv + ' the drag makes it bleed (1)');
      t.eq(h2 - b2.hp, 2, 'L' + lv + ' the drag makes it bleed (2)');
      t.ok(surf(b1.x, b1.y) === 'blood' && surf(b2.x, b2.y) === 'blood', 'L' + lv + ' leaving blood where they stop');
      t.ok(still.x === 2 && still.y === 6, 'L' + lv + ' non-bleeding foes stay');
      t.eq(far.x, Lv.r >= 5 ? 6 + Lv.push : 6, 'L' + lv + ' range ' + Lv.r + ' (foe 5 tiles away ' + (Lv.r >= 5 ? 'dragged' : 'untouched') + ')');
      t.eq(a.spa.hp, 20, 'L' + lv + ' costs 2 HP');
      t.eq(a.spa.ap, 2, 'L' + lv + ' costs 1 AP');
    });
    // nobody bleeding: no valid target, with a clear reason
    let b = arena({ skills: [['spa_puppet', 1]], enemies: [E(4, 4), E(7, 4)] });
    t.eq(DD.Combat.canUse(b.spa, b.slot('spa_puppet')), 'No Bleeding foe within 4 tiles.', 'needs a Bleeding foe in range');
    DD.Act.addStatus(at(7, 4), 'bleed', { stacks: 1 }, null);
    t.eq(DD.Combat.canUse(b.spa, b.slot('spa_puppet')), 'No Bleeding foe within 4 tiles.', 'a Bleeding foe 5 tiles away is out of range');
    DD.Act.addStatus(at(4, 4), 'bleed', { stacks: 1 }, null);
    t.eq(DD.Combat.canUse(b.spa, b.slot('spa_puppet')), true, 'usable once one is in range');
    // into a pit (YEET, env kill Hype) and against the map edge (level III: range 5, drag 3)
    b = arena({ skills: [['spa_puppet', 3]], enemies: [E(5, 4, 'test_grunt', 3), E(6, 3, 'test_grunt', 3)],
      terrain: function (tl) { if (tl.x === 7 && tl.y === 4) tl.t = 'pit'; } });
    DD.Act.addStatus(at(5, 4), 'bleed', { stacks: 1 }, b.spa);
    DD.Act.addStatus(at(6, 3), 'bleed', { stacks: 1 }, b.spa);
    const pitFoe = at(5, 4), edge = at(6, 3);
    const hype0 = b.s.hype;
    use(t, b.spa, b.slot('spa_puppet'), 3, 4, 'puppet east');
    t.ok(pitFoe.dead, 'dragged into the pit: YEET');
    t.eq(b.s.hype - hype0, 20, 'environmental kill: +20 Hype');
    t.ok(edge.x === 8 && edge.hp === 42 - 1 - 3, 'stopped by the map edge: bleed 1 + bump 3 (' + edge.x + ', ' + edge.hp + ')');
    // lava and water
    let c = arena({ skills: [['spa_puppet', 1]], enemies: [E(4, 3, 'test_grunt', 3), E(8, 8)], terrain: function (tl) { if (tl.x === 4 && tl.y === 1) tl.t = 'lava'; } });
    const up = at(4, 3);
    DD.Act.addStatus(up, 'bleed', { stacks: 1 }, c.spa);
    use(t, c.spa, c.slot('spa_puppet'), 2, 3, 'puppet north');
    t.ok(up.y === 1 && has(up, 'burn') && up.hp === 42 - 8 - 1, 'dragged into lava: 8 fire + Burn, then bleeds 1');
    t.eq(at(8, 8).x, 8, 'non-bleeding foe untouched');
    c = arena({ skills: [['spa_puppet', 1]], enemies: [E(4, 5, 'test_grunt', 3)], terrain: function (tl) { if (tl.x === 4 && tl.y === 7) tl.t = 'water'; } });
    const down = at(4, 5);
    DD.Act.addStatus(down, 'bleed', { stacks: 1 }, c.spa);
    use(t, c.spa, c.slot('spa_puppet'), 2, 5, 'puppet south');
    t.ok(down.y === 7 && has(down, 'wet'), 'dragged into water: Wet');
    // a wall stops the drag with a bonk
    const d = arena({ skills: [['spa_puppet', 3]], enemies: [E(4, 4, 'test_grunt', 3)], terrain: function (tl) { if (tl.x === 6 && tl.y === 4) tl.t = 'wall'; } });
    const wf = at(4, 4);
    DD.Act.addStatus(wf, 'bleed', { stacks: 1 }, d.spa);
    use(t, d.spa, d.slot('spa_puppet'), 3, 4, 'puppet into wall');
    t.ok(wf.x === 5 && wf.hp === 42 - 3 - 1, 'wall: stops after 1 tile, bump 3 + bleed 1');
    // v2: dragged out of its reach (move 3 + a 1-tile stab), the grunt can't hit her on its turn
    const e = arena({ ai: true, skills: [['spa_puppet', 3]], enemies: [E(4, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(at(4, 4), 'bleed', { stacks: 1 }, e.spa);
    use(t, e.spa, e.slot('spa_puppet'), 3, 4, 'puppet the grunt away');
    t.ok(!!at(7, 4), 'the grunt was dragged 3 tiles east: 5 tiles from her');
    const eh = e.spa.hp;
    DD.Combat.endTurn();
    t.eq(e.spa.hp, eh, 'out of its reach: no hit on its turn');
  });

  T.suite('hero_sparrow: Evil Twin and the Blood Clone (Taunt on the enemy\'s turn)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_twin', lv);
      const a = arena({ skills: [['spa_twin', lv]], enemies: [E(4, 3, 'test_grunt', 3), E(5, 4, 'test_grunt', 3), E(7, 7)] });
      previewThenUse(t, a.spa, a.slot('spa_twin'), 4, 4, 'evil twin L' + lv);
      const c = at(4, 4);
      t.ok(c && c.defId === 'spa_clone' && c.kind === 'summon' && c.side === 'hero', 'L' + lv + ' Blood Clone summoned');
      t.eq(c && c.maxHp, Lv.hp, 'L' + lv + ' clone HP ' + Lv.hp);
      t.eq(c && c.skills[0].level, lv, 'L' + lv + ' clone skills at level ' + lv);
      t.ok(has(at(4, 3), 'taunt') && has(at(5, 4), 'taunt'), 'L' + lv + ' adjacent foes Taunted');
      t.eq(DD.Act.getStatus(at(4, 3), 'taunt').source, c.id, 'L' + lv + ' the clone is the taunter');
      t.eq(has(at(7, 7), 'taunt'), false, 'L' + lv + ' far foe not taunted');
      t.eq(a.spa.hp, 18, 'L' + lv + ' costs 4 HP');
      t.eq(a.spa.ap, 1, 'L' + lv + ' costs 2 AP');
    });
    // radius 2 at level III
    let a = arena({ skills: [['spa_twin', 3]], enemies: [E(4, 6, 'test_grunt', 3)] });
    use(t, a.spa, a.slot('spa_twin'), 4, 4, 'twin III radius');
    t.ok(has(at(4, 6), 'taunt'), 'L3 taunts foes 2 tiles from the clone');
    // v2 taunt: on its turn the grunt must attack the clone, not Sparrow; the Taunt ends with that turn
    a = arena({ ai: true, skills: [['spa_twin', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    const g = at(3, 4);
    use(t, a.spa, a.slot('spa_twin'), 3, 5, 'twin decoy');
    const clone = at(3, 5);
    const s0 = a.spa.hp, c0 = clone.hp;
    DD.Combat.endTurn();
    t.eq(a.spa.hp, s0, 'Sparrow is not hit');
    t.eq(c0 - clone.hp, 4, 'the clone takes the stab');
    t.ok(!has(g, 'taunt'), 'the Taunt wore off at the end of its turn');
    // the clone arrives with 0 AP and acts on her next turn with its 2 AP (summons act on their owner's turn)
    [1, 2, 3].forEach(function (lv) {
      const b = arena({ skills: [['spa_twin', lv]], enemies: [E(5, 4, 'test_grunt', 3), E(4, 7, 'test_grunt', 3)] });
      use(t, b.spa, b.slot('spa_twin'), 4, 4, 'twin for kit L' + lv);
      const c = at(4, 4);
      t.eq(c.ap, 0, 'L' + lv + ' clone arrives with 0 AP');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === b.spa && DD.Combat.isTurnOf(c) && c.ap === 2, 'L' + lv + ' on her next turn the clone acts too, with 2 AP');
      const shiv = slotOf(c, 'spa_clone_shiv'), tnt = slotOf(c, 'spa_clone_taunt');
      const e = at(5, 4), e0 = e.hp, b0 = stacks(e, 'bleed');
      t.ok(DD.Combat.useSkill(c, shiv, 5, 4), 'L' + lv + ' clone shiv');
      t.eq(e0 - e.hp, L('spa_clone_shiv', lv).dmg, 'L' + lv + ' shiv damage');
      t.eq(stacks(e, 'bleed'), b0 + 1, 'L' + lv + ' shiv Bleed 1');
      t.ok(DD.Combat.useSkill(c, tnt, 4, 4), 'L' + lv + ' clone taunt');
      const r = L('spa_clone_taunt', lv).r;
      t.eq(has(at(4, 7), 'taunt'), r >= 3, 'L' + lv + ' Hey, Ugly! radius ' + r + ' (foe 3 tiles away)');
      t.eq(DD.Combat.canUse(c, tnt), 'On cooldown (1).', 'L' + lv + ' Hey, Ugly! cooldown 1');
    });
    // charges: 2 per fight; cooldown 1 (her next turn), usable the turn after
    a = arena({ skills: [['spa_twin', 1]], enemies: [E(8, 8, 'test_minion')] });
    use(t, a.spa, a.slot('spa_twin'), 3, 4, 'charge 1');
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_twin')), 'On cooldown (1).', 'cooldown 1');
    DD.Combat.endTurn();
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_twin')), 'On cooldown (1).', 'still cooling on her next turn');
    DD.Combat.endTurn();
    const spot2 = DD.Combat.targets(a.spa, a.slot('spa_twin'))[0];
    if (spot2) use(t, a.spa, a.slot('spa_twin'), spot2.x, spot2.y, 'charge 2');
    else t.fail('no tile for the second clone');
    DD.Combat.endTurn(); DD.Combat.endTurn();
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_twin')), 'No charges left.', '2 charges per fight');
    // a clone that dies just splats: no hidden death pop (v2-simple)
    a = arena({ skills: [['spa_twin', 2]], enemies: [E(5, 4, 'test_grunt', 3), E(6, 6)] });
    use(t, a.spa, a.slot('spa_twin'), 4, 4, 'twin to pop');
    const cl = at(4, 4);
    DD.Act.damage(at(5, 4), cl, 99);
    t.ok(cl.dead, 'clone dies');
    t.ok(!has(at(5, 4), 'bleed') && surf(4, 4) === null && surf(3, 4) === null, 'no Bleed or blood splash from its death');
  });

  T.suite('hero_sparrow: Vein Glory', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_veinglory', lv);
      const a = arena({ skills: [['spa_veinglory', lv]], enemies: [E(5, 4, 'test_grunt', 4), E(2, 7, 'test_grunt', 4)] });
      const f = at(5, 4), f0 = f.hp;
      previewThenUse(t, a.spa, a.slot('spa_veinglory'), 5, 4, 'vein glory L' + lv);
      t.ok(a.spa.x === 4 && a.spa.y === 4, 'L' + lv + ' darted next to it');
      t.eq(f0 - f.hp, Lv.dmg, 'L' + lv + ' damage ' + Lv.dmg);
      t.eq(a.spa.hp, 18, 'L' + lv + ' costs 4 HP');
      t.eq(a.spa.ap, 0, 'L' + lv + ' costs 3 AP');
      t.eq(a.slot('spa_veinglory').cd, 3, 'L' + lv + ' cooldown 3');
      // an adjacent Bleeding target is also the donor: it pays the 4 HP blood price on top
      const b = arena({ skills: [['spa_veinglory', lv]], enemies: [E(3, 4, 'test_grunt', 4)] });
      const g = at(3, 4), g0 = g.hp;
      DD.Act.addStatus(g, 'bleed', { stacks: 1 }, null);
      use(t, b.spa, b.slot('spa_veinglory'), 3, 4, 'vein glory adjacent bleeding L' + lv);
      t.eq(g0 - g.hp, Lv.dmg + 4, 'L' + lv + ' ' + Lv.dmg + ' + the 4 HP blood price it paid');
      t.ok(b.spa.hp === 22 && b.spa.x === 2 && b.spa.y === 4, 'L' + lv + ' Sparrow paid nothing and did not need to dash');
    });
    // a kill gives nothing extra any more (no refund): just the kill
    let a = arena({ skills: [['spa_veinglory', 1]], enemies: [E(5, 4), E(8, 8)] });
    at(5, 4).hp = 10;
    use(t, a.spa, a.slot('spa_veinglory'), 5, 4, 'vein kill');
    t.ok(a.spa.ap === 0 && a.s.hype === 8, 'kill: 0 AP left, +8 Hype as usual');
    // needs a landing spot; not enough AP; range 3
    a = arena({ skills: [['spa_veinglory', 1]], enemies: [E(5, 4), E(4, 4), E(6, 4), E(5, 3), E(5, 5)] });
    t.ok(DD.Combat.targets(a.spa, a.slot('spa_veinglory')).every(function (p) { return !(p.x === 5 && p.y === 4); }), 'a surrounded foe is no target');
    a.spa.ap = 2;
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_veinglory')), 'Not enough AP.', '3 AP needed');
    a = arena({ skills: [['spa_veinglory', 1]], enemies: [E(6, 4)] });
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_veinglory')), 'No valid targets.', 'a foe 4 tiles away is out of range');
    // a foe against the map edge: she lands on the one free side
    a = arena({ at: [0, 4], skills: [['spa_veinglory', 1]], enemies: [E(0, 1, 'test_grunt', 3), E(1, 1, 'test_grunt', 3)] });
    use(t, a.spa, a.slot('spa_veinglory'), 0, 1, 'vein glory into the corner');
    t.ok(a.spa.x === 0 && a.spa.y === 2 && at(0, 1).hp === 42 - L('spa_veinglory', 1).dmg, 'landed below it, on the map, and gutted it');
  });

  T.suite('hero_sparrow: Crimson Tide (signature)', function (t) {
    const Ls = L('spa_signature', 1);
    let a = arena({ at: [4, 4], heroes: [{ id: 'test_knight', x: 3, y: 4 }],
      enemies: [E(5, 4, 'test_grunt', 3), E(4, 1, 'test_grunt', 3), E(5, 6, 'test_grunt', 3), E(8, 8, 'test_grunt', 3)] });
    t.eq(DD.Combat.canUse(a.spa, a.spa.signature), 'Needs 100 Hype.', 'needs Hype');
    a.s.hype = 100;
    const near = at(5, 4), top = at(4, 1), diag = at(5, 6), out = at(8, 8), knight = at(3, 4);
    const k0 = knight.hp;
    t.eq(DD.Combat.costOf(a.spa, sk('spa_signature'), 1).hp, 11, 'the HUD shows the half-HP cost (11)');
    const prev = previewThenUse(t, a.spa, a.spa.signature, 4, 4, 'crimson tide');
    t.ok(prev && prev.perUnit[near.id], 'preview shows the wave');
    t.eq(a.spa.hp, 11, 'costs half her HP (22 → 11)');
    t.eq(a.spa.ap, 1, 'costs 2 AP');
    t.eq(a.s.hype, 4, 'spent 100 Hype (+4 for hitting 2+ foes)');
    [near, top, diag].forEach(function (f, i) {
      t.eq(f.hp, 42 - Ls.dmg, 'foe ' + i + ' takes ' + Ls.dmg);
      t.eq(stacks(f, 'bleed'), Ls.bleed, 'foe ' + i + ' Bleed ' + Ls.bleed);
    });
    t.ok(near.x === 5 && top.y === 1 && diag.y === 6, 'nobody is swept around (one rider: Bleed)');
    t.eq(out.hp, 42, 'foe 8 tiles away untouched');
    t.eq(knight.hp, k0, 'the adjacent ally is spared');
    t.ok(DD.Grid.shape('circle', { x: 4, y: 4 }, null, 2).every(function (p) { return surf(p.x, p.y) === null; }), 'no blood flood any more');
    // at 1 HP it is free (half of 1 rounds down to 0)
    a = arena({ at: [4, 4], hp: 1, enemies: [E(5, 4, 'test_grunt', 3)] });
    a.s.hype = 100;
    t.eq(DD.Combat.costOf(a.spa, sk('spa_signature'), 1).hp, 0, 'at 1 HP the cost is 0');
    use(t, a.spa, a.spa.signature, 4, 4, 'tide at 1 HP');
    t.ok(a.spa.hp === 1 && at(5, 4).hp === 42 - Ls.dmg, 'still 1 HP, the wave hits');
    // a Bleeding foe next to her pays half her HP instead
    a = arena({ at: [4, 4], enemies: [E(5, 4, 'test_grunt', 3), E(4, 2, 'test_grunt', 3)] });
    a.s.hype = 100;
    DD.Act.addStatus(at(5, 4), 'bleed', { stacks: 1 }, null);
    use(t, a.spa, a.spa.signature, 4, 4, 'tide with a donor');
    t.eq(a.spa.hp, 22, 'Sparrow keeps her HP');
    t.eq(at(5, 4).hp, 42 - 11 - Ls.dmg, 'the donor pays 11, then takes the wave');
    t.eq(stacks(at(5, 4), 'bleed'), 1 + Ls.bleed, 'and keeps bleeding (1 + 3)');
    // kills mid-wave: no errors
    a = arena({ at: [4, 4], enemies: [E(5, 4), E(4, 3, 'test_grunt', 3)] });
    a.s.hype = 100;
    at(5, 4).hp = 5;
    use(t, a.spa, a.spa.signature, 4, 4, 'tide kills');
    t.ok(at(5, 4) === null && at(4, 3).hp === 42 - Ls.dmg, 'one drowned in blood, the other took the wave');
  });

  // ---- items ---------------------------------------------------------------------------------------------------
  T.suite('hero_sparrow: items', function (t) {
    // Shiv of Sharing: every Bleed she applies +1 stack; the descs follow; no other bonus
    let a = arena({ items: ['spa_shiv_of_sharing'], skills: [['spa_hemoglob', 3], ['spa_papercuts', 1]],
      enemies: [E(3, 4, 'test_grunt', 3), E(6, 4, 'test_grunt', 3), E(4, 6, 'test_grunt', 3)] });
    t.ok(a.spa.items.indexOf('spa_shiv_of_sharing') >= 0 && !a.spa.dmgBonus, 'equipped, no damage bonus');
    t.ok(/Bleed 2\./.test(DD.skillDesc(sk('spa_basic'), 1, a.spa)) && /Bleed 1\./.test(DD.skillDesc(sk('spa_basic'), 1, null)), 'basic desc: Bleed 2 with the shiv, 1 without');
    t.ok(/Bleed 3\./.test(DD.skillDesc(sk('spa_hemoglob'), 3, a.spa)) && /gains Bleed 4\./.test(DD.skillDesc(sk('spa_signature'), 1, a.spa)), 'Hemo-Glob III / Crimson Tide descs follow');
    use(t, a.spa, a.spa.basic, 3, 4, 'shiv basic');
    t.ok(stacks(at(3, 4), 'bleed') === 2 && 42 - at(3, 4).hp === 4, 'basic: 4 damage, Bleed 2');
    use(t, a.spa, a.slot('spa_hemoglob'), 6, 4, 'shiv glob');
    t.ok(stacks(at(6, 4), 'bleed') === 3 && 42 - at(6, 4).hp === 9, 'Hemo-Glob III: 9 damage, Bleed 3');
    a.spa.ap = 3;
    use(t, a.spa, a.slot('spa_papercuts'), 4, 6, 'shiv paper cuts');
    t.eq(stacks(at(4, 6), 'bleed'), 3, 'Paper Cuts I: Bleed 3 with the shiv');
    // Bloodsucker's Bib (id spa_scab_mail): stepping into blood while hurt slurps it up (3 HP), by any means
    let b = arena({ items: ['spa_scab_mail'], enemies: [E(8, 8)], surfaces: [{ x: 3, y: 4, id: 'blood', turns: 4 }] });
    t.ok(DD.Combat.move(b.spa, 3, 4), 'step into blood at full HP');
    t.ok(b.spa.hp === 22 && surf(3, 4) === 'blood', 'full HP: no slurp, the blood stays for later');
    b = arena({ items: ['spa_scab_mail'], enemies: [E(8, 8)], surfaces: [{ x: 3, y: 4, id: 'blood', turns: 4 }, { x: 4, y: 4, id: 'blood', turns: 4 }] });
    b.spa.hp = 10;
    t.ok(DD.Combat.move(b.spa, 4, 4), 'walk across two blood tiles');
    t.eq(b.spa.hp, 10 + 3 + 3, 'healed 3 per blood tile walked through');
    t.ok(surf(3, 4) === null && surf(4, 4) === null, 'both puddles slurped');
    b = arena({ items: ['spa_scab_mail'], enemies: [E(8, 8)], surfaces: [{ x: 3, y: 4, id: 'blood', turns: 4 }] });
    b.spa.hp = 10;
    DD.Act.push(null, b.spa, { x: 1, y: 0 }, 1);
    t.eq(b.spa.hp, 13, 'pushed into blood: slurp');
    b = arena({ items: ['spa_scab_mail'], skills: [['spa_goblinmode', 1]], enemies: [E(8, 8)], surfaces: [{ x: 5, y: 4, id: 'blood', turns: 4 }] });
    b.spa.hp = 10;
    use(t, b.spa, b.slot('spa_goblinmode'), 5, 4, 'goblin mode into blood');
    t.eq(b.spa.hp, 13, 'teleported into blood: slurp');
    b = arena({ enemies: [E(8, 8)], surfaces: [{ x: 3, y: 4, id: 'blood', turns: 4 }] });
    b.spa.hp = 10;
    DD.Combat.move(b.spa, 3, 4);
    t.ok(b.spa.hp === 10 && surf(3, 4) === 'blood', 'without the Bib blood is just gross');
    // Organ Donor Card: a Bleeding foe up to 3 tiles away pays (exactly the cost)
    a = arena({ items: ['spa_donor_card'], skills: [['spa_scab', 1]], enemies: [E(5, 4, 'test_grunt', 3), E(8, 8)] });
    t.eq(a.s.hype, 0, 'no combat-start Hype bonus any more (one rule)');
    DD.Act.addStatus(at(5, 4), 'bleed', { stacks: 1 }, null);
    t.eq(DD.Combat.costOf(a.spa, sk('spa_scab'), 1).hp, 0, 'a donor 3 tiles away counts');
    t.eq(passive().hpPayer(a.spa, sk('spa_scab'), 1), at(5, 4), 'hpPayer names it');
    previewThenUse(t, a.spa, a.slot('spa_scab'), 2, 4, 'donor card scab');
    t.ok(42 - at(5, 4).hp === 3 && a.spa.hp === 22, 'the far donor pays the 3 HP, she pays nothing');
    a = arena({ items: ['spa_donor_card'], skills: [['spa_scab', 1]], enemies: [E(6, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(at(6, 4), 'bleed', { stacks: 1 }, null);
    t.eq(DD.Combat.costOf(a.spa, sk('spa_scab'), 1).hp, 3, '4 tiles is too far even with the card');
    // equipping via a run hero
    const rh = DD.Combat.makeRunHero({ id: 'sparrow', level: 3, items: ITEMS });
    t.ok(rh.items.weapon === 'spa_shiv_of_sharing' && rh.items.armor === 'spa_scab_mail' && rh.items.trinket === 'spa_donor_card', 'one item per slot');
  });

  // ---- combos with other heroes ------------------------------------------------------------------------------
  T.suite('hero_sparrow: combos with other heroes (Bleed setups, drags into an AoE, Empowered, donors)', function (t) {
    // 1. her Bleed + an ally's shove: the knight's Shield Bash pushes a Bleeding foe, which bleeds and leaves a trail
    let a = arena({ skills: [['spa_hemoglob', 3]], heroes: [{ id: 'test_knight', x: 4, y: 3 }], enemies: [E(4, 4, 'test_grunt', 3)] });
    const g = at(4, 4);
    use(t, a.spa, a.slot('spa_hemoglob'), 4, 4, 'glob for the knight');
    DD.Combat.endTurn();
    const k = at(4, 3);
    t.eq(DD.Combat.current(), k, 'the knight\'s turn');
    const g0 = g.hp;
    use(t, k, slotOf(k, 'test_shield_bash'), 4, 4, 'shield bash the Bleeding grunt');
    t.ok(g.y === 6 && g0 - g.hp === 4 + 2, 'pushed 2 tiles: 4 bash + its 2 Bleed stacks');
    t.eq(surf(4, 6), 'blood', 'a blood trail where it landed');
    // 2. Blood Puppet Show lines two Bleeding foes up for the knight's Wide Cleave (one swing hits both, +4 Hype)
    a = arena({ at: [5, 1], skills: [['spa_puppet', 1]], heroes: [{ id: 'test_knight', x: 5, y: 5 }],
      enemies: [E(4, 2, 'test_grunt', 3), E(6, 2, 'test_grunt', 3)] });
    const l = at(4, 2), r = at(6, 2);
    DD.Act.addStatus(l, 'bleed', { stacks: 1 }, a.spa);
    DD.Act.addStatus(r, 'bleed', { stacks: 1 }, a.spa);
    use(t, a.spa, a.slot('spa_puppet'), 5, 2, 'puppet them south');
    t.ok(l.y === 4 && r.y === 4, 'both dragged into the knight\'s row');
    DD.Combat.endTurn();
    const kn = at(5, 5), l0 = l.hp, r0 = r.hp, hype0 = a.s.hype;
    use(t, kn, slotOf(kn, 'test_cleave'), 5, 4, 'cleave the lined-up pair');
    t.ok(l0 - l.hp === 4 && r0 - r.hp === 4 && a.s.hype - hype0 === 4, 'one cleave hit both (+4 Hype)');
    // 3. Blood Drive: the mage's next fireball is Empowered on every target it hits
    a = arena({ skills: [['spa_blooddrive', 1]], heroes: [{ id: 'test_mage', x: 2, y: 6 }], enemies: [E(6, 6, 'test_grunt', 3), E(6, 7, 'test_grunt', 3)] });
    use(t, a.spa, a.slot('spa_blooddrive'), 2, 6, 'blood drive the mage');
    DD.Combat.endTurn();
    const m = at(2, 6), f1 = at(6, 6), f2 = at(6, 7), h1 = f1.hp, h2 = f2.hp;
    use(t, m, slotOf(m, 'test_fireball'), 6, 6, 'empowered fireball');
    t.ok(h1 - f1.hp === Math.round(5 * 1.5 + 1) && h2 - f2.hp === Math.round(5 * 1.5 + 1), 'both foes took the +50% (' + (h1 - f1.hp) + ', ' + (h2 - f2.hp) + ')');
    // 4. Puppet Show into water, then the mage's Chain Zap electrifies the pool: Wet ×1.5 and a stun
    a = arena({ skills: [['spa_puppet', 1]], heroes: [{ id: 'test_mage', x: 1, y: 7, skills: [{ id: 'test_chain_zap', level: 1 }] }], enemies: [E(4, 5, 'test_grunt', 3)],
      terrain: function (tl) { if (tl.x === 4 && (tl.y === 6 || tl.y === 7)) tl.t = 'water'; } });
    const wg = at(4, 5);
    DD.Act.addStatus(wg, 'bleed', { stacks: 1 }, a.spa);
    use(t, a.spa, a.slot('spa_puppet'), 2, 5, 'puppet into the pool');
    t.ok(wg.y === 7 && has(wg, 'wet'), 'dragged into the water: Wet');
    DD.Combat.endTurn();
    const mg = at(1, 7), w0 = wg.hp;
    use(t, mg, slotOf(mg, 'test_chain_zap'), 4, 7, 'chain zap the wet grunt');
    t.ok(w0 - wg.hp >= Math.round(5 * 1.5) && has(wg, 'stun'), 'lightning on Wet: ' + (w0 - wg.hp) + ' damage and Stunned');
    // 5. an ally's Bleed makes a donor too: the rogue's stab, then Sparrow casts for free
    a = arena({ skills: [['spa_hemoglob', 1]], heroes: [{ id: 'test_rogue', x: 3, y: 5 }], order: ['test_rogue'],
      enemies: [E(3, 4, 'test_grunt', 3), E(6, 4, 'test_grunt', 3)] });
    const rogue = at(3, 5);
    t.eq(DD.Combat.current(), rogue, 'the rogue acts first');
    use(t, rogue, rogue.basic, 3, 4, 'rogue stab (Bleed 1)');
    DD.Combat.endTurn();
    t.eq(DD.Combat.current(), a.spa, 'then Sparrow');
    const dn = at(3, 4), dn0 = dn.hp;
    t.eq(DD.Combat.costOf(a.spa, sk('spa_hemoglob'), 1).hp, 0, 'the rogue\'s Bleed made it her donor');
    use(t, a.spa, a.slot('spa_hemoglob'), 6, 4, 'free glob');
    t.ok(a.spa.hp === 22 && dn0 - dn.hp === 2, 'the rogue\'s victim paid her 2 HP');
    // 6. v2 attacks of opportunity: Say It, Don't Spray It Dazzles the grunt pinning the mage, who walks off it for free
    [false, true].forEach(function (spray) {
      const b = arena({ skills: [['spa_spray', 1]], heroes: [{ id: 'test_mage', x: 3, y: 5 }], enemies: [E(3, 4, 'test_grunt', 3)] });
      if (spray) use(t, b.spa, b.slot('spa_spray'), 3, 4, 'spray the grunt next to the mage');
      DD.Combat.endTurn();
      const mg2 = at(3, 5), hp0 = mg2.hp;
      t.eq(DD.Combat.current(), mg2, 'the mage\'s turn');
      const seen = opps(function () { DD.Combat.move(mg2, 3, 8); });
      if (spray) t.ok(seen === '' && mg2.hp === hp0 && mg2.y === 8, 'Dazzled: the mage disengages without an attack of opportunity');
      else t.ok(seen === 'test_grunt>test_mage' && mg2.hp === hp0 - 4, 'control: without the spray the grunt stabs the mage as she leaves');
    });
  });

  // ---- attacks of opportunity (v2) -------------------------------------------------------------------------------
  T.suite('hero_sparrow: attacks of opportunity (her Shiv holds the line; teleports, dashes and drags never provoke)', function (t) {
    // 1. her own move away from an adjacent grunt provokes its stab: previewed, the walk goes on, no undo
    let a = arena({ enemies: [E(3, 4, 'test_grunt', 3)] });
    const g = at(3, 4);
    const e = DD.Combat.reachable(a.spa).get('0,4');
    t.ok(e && e.provokes.length === 1 && e.provokes[0] === g.id, 'walking away from it provokes the grunt');
    const pv = DD.Combat.provokes(a.spa, 0, 4);
    t.ok(pv.length === 1 && pv[0].skillId === 'test_grunt_stab' && pv[0].dmg === 4, 'the move preview names its stab for 4 (' + JSON.stringify(pv) + ')');
    let ok = false;
    t.eq(opps(function () { ok = DD.Combat.move(a.spa, 0, 4); }), 'test_grunt>sparrow', 'the grunt strikes as she leaves');
    t.ok(ok && a.spa.hp === 18 && a.spa.x === 0 && a.spa.ap === 2, 'stabbed for 4 (as previewed), she walks on, 1 AP');
    t.ok(!DD.Combat.canUndo(), 'a move that provoked cannot be undone');
    // 2. Goblin Mode teleports out of the same spot for free; Stealthed, her next walk slips away too
    a = arena({ skills: [['spa_goblinmode', 1]], enemies: [E(3, 4, 'test_grunt', 3), E(6, 4, 'test_grunt', 3)] });
    t.eq(opps(function () { use(t, a.spa, a.slot('spa_goblinmode'), 5, 4, 'goblin mode out'); }), '', 'Goblin Mode (a teleport) never provokes');
    t.ok(a.spa.hp === 22 && a.spa.x === 5 && a.spa.y === 4, 'out without a scratch, next to the other grunt');
    t.eq(opps(function () { DD.Combat.move(a.spa, 5, 1); }), '', 'Stealthed: walking off the second grunt provokes nothing');
    t.ok(a.spa.hp === 22 && a.spa.y === 1, 'still unscratched');
    // 3. Vein Glory darts from one foe to another: a dash never provokes
    a = arena({ skills: [['spa_veinglory', 1]], enemies: [E(3, 4, 'test_grunt', 3), E(2, 7, 'test_grunt', 3)] });
    const far = at(2, 7);
    t.eq(opps(function () { use(t, a.spa, a.slot('spa_veinglory'), 2, 7, 'vein glory away'); }), '', 'Vein Glory (a dash) never provokes');
    t.ok(a.spa.hp === 18 && a.spa.x === 2 && a.spa.y === 6 && far.hp === 42 - L('spa_veinglory', 1).dmg, 'only the 4 HP price; landed next to the other grunt and gutted it');
    // 4. dragging her Bleeding neighbour off her (Blood Puppet Show) is a push: no Shiv for her either
    a = arena({ skills: [['spa_puppet', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    const pg = at(3, 4);
    DD.Act.addStatus(pg, 'bleed', { stacks: 1 }, a.spa);
    t.eq(opps(function () { use(t, a.spa, a.slot('spa_puppet'), 3, 4, 'puppet the neighbour away'); }), '', 'a drag is no move action: nobody strikes');
    t.ok(pg.x === 5 && pg.hp === 42 - 2 - 1 && a.spa.oppRound !== a.s.round, 'it paid her 2 HP price and bled 1 on the drag; her reaction is unused');
    // 5. a foe walking off her: Shiv Happens for free (4 + Bleed 1), then its walk makes it bleed
    a = arena({ enemies: [E(3, 4, 'test_grunt', 3)] });
    const w = at(3, 4);
    t.eq(DD.Act.opportunitySlot(a.spa), a.spa.basic, 'her attack of opportunity is Shiv Happens (a melee basic attack)');
    t.eq(DD.AI.opportunityDmg(a.spa, w), L('spa_basic', 1).dmg, 'the AI prices it at her basic damage (4)');
    const ap0 = a.spa.ap, uses0 = a.spa.basic.uses || 0;
    t.eq(opps(function () { DD.AI.moveTo(w, 6, 4); }), 'sparrow>test_grunt', 'she strikes as it leaves');
    t.ok(w.x === 6 && w.hp === 42 - 4 - 1 && stacks(w, 'bleed') === 1 && surf(6, 4) === 'blood', 'shivved (4 + Bleed 1), then the walk made it bleed 1 and leave blood (' + w.hp + ')');
    t.ok(a.spa.ap === ap0 && (a.spa.basic.uses || 0) === uses0 && !a.spa.basic.usedThisTurn && a.spa.oppRound === a.s.round, 'free: no AP, no use; her reaction is spent for the round');
    // 6. the Shiv of Sharing: her attack of opportunity Bleeds 2
    a = arena({ items: ['spa_shiv_of_sharing'], enemies: [E(3, 4, 'test_grunt', 3)] });
    const sv = at(3, 4);
    DD.AI.moveTo(sv, 6, 4);
    t.ok(stacks(sv, 'bleed') === 2 && sv.hp === 42 - 4 - 2, 'with the Shiv of Sharing: Bleed 2 (and the walk bleeds 2)');
    // 7. at most one per round; a new round refreshes it
    a = arena({ enemies: [E(3, 4, 'test_grunt', 3), E(2, 5, 'test_grunt', 3)] });
    const f1 = at(3, 4), f2 = at(2, 5);
    t.eq(opps(function () { DD.AI.moveTo(f1, 6, 4); DD.AI.moveTo(f2, 2, 8); }), 'sparrow>test_grunt', 'one attack of opportunity per round: only the first grunt is shivved');
    t.eq(f2.hp, 42, 'the second one walks off untouched');
    DD.Combat.endTurn();
    t.ok(a.s.round === 2 && DD.Combat.current() === a.spa, 'round 2, her turn');
    DD.Act.teleport(f2, 2, 5);
    t.eq(opps(function () { DD.AI.moveTo(f2, 2, 8); }), 'sparrow>test_grunt', 'a new round: she strikes again');
    // 8. locked out: stunned / asleep / frozen / sheep / downed make none; silenced still does (the Shiv is no spell)
    ['stun', 'sleep', 'frozen', 'sheep'].forEach(function (id) {
      const b = arena({ enemies: [E(3, 4, 'test_grunt', 3)] });
      DD.Act.addStatus(b.spa, id, { turns: 1 }, null);
      t.eq(opps(function () { DD.AI.moveTo(at(3, 4), 6, 4); }), '', id + ': no attack of opportunity');
    });
    let b = arena({ heroes: [{ id: 'test_cleric', x: 8, y: 8 }], enemies: [E(3, 4, 'test_grunt', 3)] });
    b.spa.hp = 1;
    DD.Act.damage(null, b.spa, 5, { cause: 'other' });
    t.ok(b.spa.downed, 'downed');
    t.eq(opps(function () { DD.AI.moveTo(at(3, 4), 6, 4); }), '', 'downed: no attack of opportunity');
    b = arena({ enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(b.spa, 'silenced', { turns: 1 }, null);
    t.eq(opps(function () { DD.AI.moveTo(at(3, 4), 6, 4); }), 'sparrow>test_grunt', 'silenced: her Shiv is no spell, she still strikes');
    // 9. charmed: never her charmer, any other foe
    b = arena({ enemies: [E(3, 4, 'test_grunt', 3), E(2, 5, 'test_grunt', 3)] });
    const charmer = at(3, 4), other = at(2, 5);
    DD.Act.addStatus(b.spa, 'charmed', { turns: 1 }, charmer);
    t.eq(opps(function () { DD.AI.moveTo(charmer, 6, 4); }), '', 'charmed: she never strikes her charmer');
    t.eq(opps(function () { DD.AI.moveTo(other, 2, 8); }), 'sparrow>test_grunt', 'but another foe walking off her still gets shivved');
    // 10. Say It, Don't Spray It: a Dazzled foe makes no attack of opportunity, so she walks off for free
    a = arena({ skills: [['spa_spray', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    use(t, a.spa, a.slot('spa_spray'), 3, 4, 'spray the neighbour');
    t.eq(opps(function () { DD.Combat.move(a.spa, 0, 4); }), '', 'Dazzled: it can\'t strike as she leaves');
    t.ok(a.spa.hp === 20 && a.spa.x === 0, 'only the 2 HP spray price');
    // 11. Evil Twin: a foe Taunted by the clone lets her go; the clone shivs foes that walk off it
    a = arena({ skills: [['spa_twin', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    const tg = at(3, 4);
    use(t, a.spa, a.slot('spa_twin'), 3, 5, 'twin next to the grunt');
    const cl = at(3, 5);
    t.ok(cl && has(tg, 'taunt'), 'the grunt is Taunted by the clone');
    t.eq(opps(function () { DD.Combat.move(a.spa, 0, 4); }), '', 'Taunted by her clone, it only strikes the clone: she walks away');
    t.eq(a.spa.hp, 18, 'she only paid the 4 HP');
    t.eq(cl && DD.Act.opportunitySlot(cl) && DD.Act.opportunitySlot(cl).id, 'spa_clone_shiv', 'the clone strikes with Copycat Shiv');
    t.eq(opps(function () { DD.AI.moveTo(tg, 6, 4); }), 'spa_clone>test_grunt', 'the grunt walking off the clone gets shivved');
    t.ok(tg.hp === 42 - L('spa_clone_shiv', 1).dmg - 1 && stacks(tg, 'bleed') === 1, 'Copycat Shiv 3 + Bleed 1, and the walk bleeds 1 (' + tg.hp + ')');
    // 12. a lethal attack of opportunity ends her walk on the tile she tried to leave
    a = arena({ heroes: [{ id: 'test_cleric', x: 8, y: 8 }], enemies: [E(3, 4, 'test_grunt', 3)] });
    a.spa.hp = 3;
    DD.Combat.move(a.spa, 0, 4);
    t.ok(a.spa.downed && a.spa.x === 2 && a.spa.y === 4 && !a.s.result, 'downed by the stab, she stays where she was; the fight goes on');
    // 13. holding the line: an engaged Bleeding grunt sticks to her on its turn, so it is still her donor next turn
    a = arena({ ai: true, at: [3, 4], order: ['sparrow', 'test_grunt'], skills: [['spa_hemoglob', 1]], heroes: [{ id: 'test_mage', x: 4, y: 1, hp: 10 }],
      enemies: [E(4, 4, 'test_grunt', 3)] });
    const brute = at(4, 4);
    DD.Act.addStatus(brute, 'bleed', { stacks: 2 }, a.spa);
    const mage = at(4, 1), m0 = mage.hp, s0 = a.spa.hp;
    DD.Combat.endTurn();
    t.ok(brute.x === 4 && brute.y === 4 && a.spa.hp === s0 - 4 && mage.hp === m0, 'on its turn it stabbed her and stayed (' + brute.x + ',' + brute.y + '; mage ' + mage.hp + ')');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === a.spa && has(brute, 'bleed'), 'her next turn: still next to her, still Bleeding');
    t.eq(DD.Combat.costOf(a.spa, sk('spa_hemoglob'), 1).hp, 0, 'so it pays for her Hemo-Glob');
  });

  // ---- edge cases ------------------------------------------------------------------------------------------------
  T.suite('hero_sparrow: edge cases (status-locked user, not her turn, empty targets, deaths, edges, durations)', function (t) {
    const spells = ['spa_hemoglob', 'spa_juicebox', 'spa_papercuts', 'spa_spray', 'spa_puppet'];
    const others = ['spa_scab', 'spa_goblinmode', 'spa_twin', 'spa_blooddrive', 'spa_veinglory'];
    t.ok(spells.every(function (id) { return sk(id).kind === 'spell'; }) && sk('spa_signature').kind === 'spell', 'blood magic is spells');
    t.ok(others.every(function (id) { return sk(id).kind !== 'spell'; }), 'the rest are not');
    let a = arena({ skills: [['spa_hemoglob', 1], ['spa_juicebox', 1], ['spa_papercuts', 1], ['spa_spray', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(a.spa, 'silenced', { turns: 1 }, null);
    ['spa_hemoglob', 'spa_juicebox', 'spa_papercuts', 'spa_spray'].forEach(function (id) { t.eq(DD.Combat.canUse(a.spa, a.slot(id)), 'Silenced!', 'silenced: ' + id + ' blocked'); });
    t.eq(DD.Combat.canUse(a.spa, a.spa.basic), true, 'silenced: the shiv still works');
    a = arena({ skills: [['spa_scab', 1], ['spa_goblinmode', 1], ['spa_veinglory', 1], ['spa_twin', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(a.spa, 'silenced', { turns: 1 }, null);
    ['spa_scab', 'spa_goblinmode', 'spa_veinglory', 'spa_twin'].forEach(function (id) { t.eq(DD.Combat.canUse(a.spa, a.slot(id)), true, 'silenced: ' + id + ' is not a spell'); });
    a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(a.spa, 'stun', { turns: 1 }, null);
    t.eq(DD.Combat.canUse(a.spa, a.spa.basic), 'Stunned!', 'stunned');
    a = arena({ skills: [['spa_hemoglob', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(a.spa, 'sleep', { turns: 1 }, null);
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_hemoglob')), 'Asleep. Zzz.', 'asleep');
    a = arena({ skills: [['spa_juicebox', 1]], enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Act.addStatus(a.spa, 'sheep', { turns: 1 }, null);
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_juicebox')), 'Baa. (Sheep can only move.)', 'sheep');
    // v2: a stun from an enemy's turn costs her the next turn (it passes by itself), then she is back
    a = arena({ ai: true, skills: [['spa_hemoglob', 1]], enemies: [E(7, 7)] });
    DD.Act.addStatus(a.spa, 'stun', { turns: 1 }, at(7, 7));
    DD.Combat.endTurn();
    t.ok(DD.Combat.state.round === 3 && DD.Combat.current() === a.spa && !has(a.spa, 'stun') && a.spa.ap === 3, 'stunned through her round-2 turn, acting again in round 3');
    // charmed by the grunt: she can't hurt it (Juice Box drains nothing), other foes are fair game
    a = arena({ skills: [['spa_juicebox', 1]], enemies: [E(3, 4, 'test_grunt', 3), E(2, 5, 'test_grunt', 3)] });
    DD.Act.addStatus(a.spa, 'charmed', { turns: 1 }, at(3, 4));
    a.spa.hp = 10;
    use(t, a.spa, a.slot('spa_juicebox'), 3, 4, 'charmed juice');
    t.ok(at(3, 4).hp === 42 && a.spa.hp === 10, 'charmed: no damage to the charmer, nothing to drink');
    use(t, a.spa, a.spa.basic, 2, 5, 'charmed shiv elsewhere');
    t.eq(at(2, 5).hp, 42 - 4, 'charmed: other foes are fair game');
    // not her turn: another hero's turn locks her skills
    a = arena({ skills: [['spa_hemoglob', 1]], heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [E(3, 4, 'test_grunt', 3)] });
    DD.Combat.endTurn();
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_hemoglob')), 'Not Sparrow\'s turn.', 'the knight\'s turn: not hers');
    t.eq(DD.Combat.useSkill(a.spa, a.slot('spa_hemoglob'), 3, 4), false, 'useSkill refuses');
    // every skill tolerates an empty / missing target on a near-empty board (resolveSkill straight to execute)
    a = arena({ enemies: [E(8, 8)] });
    HERO_SKILLS.concat(CLONE_SKILLS).forEach(function (id) {
      const slot = DD.Act.makeSlot(id, 3);
      t.tryRun(id + ' empty tile', function () { resolve(a.spa, slot, { x: 0, y: 0 }); });
      t.tryRun(id + ' null target', function () { resolve(a.spa, DD.getSkill(id), null); });
    });
    t.ok(DD.Combat.state && !DD.Combat.state.result, 'nothing exploded');
    // targets dying mid-skill: Paper Cuts kills one foe, the rest resolve; Puppet Show bleeds one to death mid-drag
    a = arena({ skills: [['spa_papercuts', 1]], enemies: [E(5, 4), E(6, 4, 'test_grunt', 3)] });
    at(5, 4).hp = 2;
    const fr = at(5, 4);
    use(t, a.spa, a.slot('spa_papercuts'), 5, 4, 'paper cuts kill');
    t.ok(fr.dead && !has(fr, 'bleed'), 'dead foe gets no Bleed');
    t.eq(stacks(at(6, 4), 'bleed'), 2, 'the other foe still bleeds');
    a = arena({ skills: [['spa_puppet', 1]], enemies: [E(5, 4), E(4, 3, 'test_grunt', 3)] });
    const weak = at(5, 4), tough = at(4, 3);
    weak.hp = 1;
    DD.Act.addStatus(weak, 'bleed', { stacks: 2 }, a.spa);
    DD.Act.addStatus(tough, 'bleed', { stacks: 1 }, a.spa);
    use(t, a.spa, a.slot('spa_puppet'), 3, 4, 'puppet a frail foe');
    t.ok(weak.dead && tough.x === 6, 'the frail one bled out on the way, the other was still dragged');
    // map corner: Goblin Mode targets stay on the board; Hemo-Glob from the corner; no landing in pits
    a = arena({ at: [0, 0], skills: [['spa_goblinmode', 3], ['spa_hemoglob', 1]], enemies: [E(0, 3)] });
    t.ok(DD.Combat.targets(a.spa, a.slot('spa_goblinmode')).every(function (p) { return DD.Grid.inBounds(p.x, p.y); }), 'teleport targets in bounds');
    use(t, a.spa, a.slot('spa_hemoglob'), 0, 3, 'corner glob');
    a = arena({ skills: [['spa_goblinmode', 1]], enemies: [E(8, 8)], terrain: function (tl) { if (tl.x === 4 && tl.y === 4) tl.t = 'pit'; if (tl.x === 3 && tl.y === 3) tl.t = 'wall'; } });
    const gt = DD.Combat.targets(a.spa, a.slot('spa_goblinmode')).map(function (p) { return p.x + ',' + p.y; });
    t.ok(gt.indexOf('4,4') < 0 && gt.indexOf('3,3') < 0, 'no teleporting into a pit or a wall');
    // not enough AP
    a = arena({ skills: [['spa_juicebox', 1]], enemies: [E(3, 4)] });
    a.spa.ap = 1;
    t.eq(DD.Combat.canUse(a.spa, a.slot('spa_juicebox')), 'Not enough AP.', '2 AP needed');
    // Bleed from her (status on a foe, decay 'never'): −1 at the end of each of its own turns, not hers
    a = arena({ enemies: [E(3, 4, 'test_grunt', 3)] });
    use(t, a.spa, a.spa.basic, 3, 4, 'shiv for the clock');
    DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 1 }, a.spa);
    t.eq(stacks(at(3, 4), 'bleed'), 2, 'Bleed 2 after her turn');
    DD.Combat.endTurn();
    t.eq(stacks(at(3, 4), 'bleed'), 1, 'one of its own turns later: Bleed 1');
    DD.Combat.endTurn();
    t.ok(!has(at(3, 4), 'bleed'), 'two of its turns later: gone');
  });

  // ---- previews -----------------------------------------------------------------------------------------------------
  T.suite('hero_sparrow: previews match reality for every skill (with and without a donor)', function (t) {
    const cases = [
      ['spa_basic', 1, function () { return [3, 4]; }],
      ['spa_hemoglob', 3, function () { return [5, 4]; }],
      ['spa_juicebox', 3, function () { DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 3 }, null); return [3, 4]; }],
      ['spa_papercuts', 3, function () { return [4, 4]; }],
      ['spa_spray', 3, function () { return [3, 4]; }],
      ['spa_scab', 3, function (a) { return [a.spa.x, a.spa.y]; }],
      ['spa_goblinmode', 3, function () { return [2, 8]; }],
      ['spa_puppet', 3, function () { DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 2 }, null); DD.Act.addStatus(at(5, 4), 'bleed', { stacks: 1 }, null); return [2, 3]; }],
      ['spa_twin', 3, function () { return [2, 6]; }],
      ['spa_blooddrive', 3, function () { return [1, 4]; }],
      ['spa_veinglory', 3, function () { return [5, 4]; }],
      ['spa_signature', 1, function (a) { a.s.hype = 100; return [a.spa.x, a.spa.y]; }],
    ];
    t.eq(cases.length, HERO_SKILLS.length, 'every skill of hers is covered');
    cases.forEach(function (c) {
      [false, true].forEach(function (donor) {
        const a = arena({ skills: c[0] === 'spa_basic' || c[0] === 'spa_signature' ? [] : [[c[0], c[1]]], heroes: [{ id: 'test_knight', x: 1, y: 4, hp: 12 }],
          enemies: [E(3, 4, 'test_grunt', 2), E(5, 4, 'test_grunt', 2), E(4, 5, 'test_minion'), E(2, 2, 'test_archer')] });
        if (donor) { a.spa.hp = 7; DD.Act.addStatus(at(3, 4), 'bleed', { stacks: 1 }, null); }
        const p = c[2](a);
        const slot = c[0] === 'spa_basic' ? a.spa.basic : c[0] === 'spa_signature' ? a.spa.signature : a.slot(c[0]);
        if (DD.Combat.canUse(a.spa, slot) !== true) { t.fail(c[0] + ': not usable in the preview arena (' + DD.Combat.canUse(a.spa, slot) + ')'); return; }
        previewThenUse(t, a.spa, slot, p[0], p[1], c[0] + (donor ? ' (with a donor)' : ''));
      });
    });
    // Targeting.preview by def (HUD path for skills by def) never throws
    const a = arena({ skills: [['spa_puppet', 1]], enemies: [E(3, 4)] });
    t.tryRun('Targeting.preview by def', function () { return DD.Targeting.preview(a.spa, DD.getSkill('spa_puppet'), { x: 3, y: 4 }); });
  });

  // ---- sprites -----------------------------------------------------------------------------------------------------
  T.suite('hero_sparrow: sprites paint in every pose and facing', function (t) {
    if (!(DD.Sprites && DD.Sprites.draw && typeof document !== 'undefined')) { t.skip('no sprite painter'); return; }
    const p0 = DD.problems.length;
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 120;
    const g = cv.getContext('2d');
    ['sparrow', 'spa_clone'].forEach(function (id) {
      const spec = (DD.getHero(id) || DD.getSummon(id)).sprite;
      ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
        [1, -1].forEach(function (facing) {
          g.clearRect(0, 0, 120, 120);
          t.tryRun(id + ' ' + pose, function () { DD.Sprites.draw(g, spec, 60, 100, 2, { t: 1.3, pose: pose, poseT: 0.5, facing: facing }); });
          const px = g.getImageData(0, 0, 120, 120).data;
          let n = 0;
          for (let k = 3; k < px.length; k += 4) if (px[k] > 0) n++;
          t.ok(n > 300, id + ' ' + pose + ' facing ' + facing + ' paints (' + n + ' px)');
        });
      });
    });
    t.eq(DD.problems.slice(p0).filter(function (w) { return /sparrow|spa_clone|Sprite/.test(w); }).join(' | '), '', 'no sprite warnings');
  });

  // ---- AutoPlay ----------------------------------------------------------------------------------------------------
  T.suite('hero_sparrow: AutoPlay battles (v2 initiative), fixture acts 1-3 at levels 1 / 3 / 5', function (t) {
    const loadouts = {
      1: [['spa_hemoglob', 1], ['spa_juicebox', 1]],
      3: [['spa_hemoglob', 2], ['spa_juicebox', 1], ['spa_papercuts', 1]],
      5: [['spa_hemoglob', 2], ['spa_juicebox', 2], ['spa_papercuts', 1], ['spa_puppet', 1]],
    };
    const fights = [];
    [1, 2, 3].forEach(function (act) {
      [1, 3, 5].forEach(function (lvl) { fights.push({ act: act, level: lvl, kind: { 1: 'normal', 3: 'elite', 5: 'boss' }[lvl], skills: loadouts[lvl] }); });
    });
    // the rest of the pool in real fights too
    fights.push({ act: 2, level: 5, kind: 'normal', skills: [['spa_spray', 2], ['spa_scab', 1], ['spa_goblinmode', 1], ['spa_veinglory', 1]] });
    fights.push({ act: 3, level: 5, kind: 'elite', skills: [['spa_twin', 2], ['spa_blooddrive', 1], ['spa_hemoglob', 1], ['spa_veinglory', 2]] });
    fights.push({ act: 1, level: 3, kind: 'elite', skills: [['spa_twin', 1], ['spa_spray', 1], ['spa_puppet', 1]] });
    const used = {};
    const orig = DD.Combat.useSkill;
    const results = [];
    let wins = 0, seedN = 0;
    DD.Combat.useSkill = function (unit, slot) {
      const r = orig.apply(this, arguments);
      if (r && unit && slot && (unit.defId === 'sparrow' || unit.defId === 'spa_clone')) used[slot.id] = (used[slot.id] || 0) + 1;
      return r;
    };
    try {
      fights.forEach(function (f) {
        const enc = DD.getEncounter('test_a' + f.act + '_' + f.kind);
        if (!enc) { t.fail('fixture encounter missing: act ' + f.act + ' ' + f.kind); return; }
        const party = ['sparrow', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
          if (id === 'sparrow') return DD.Combat.makeRunHero({ id: id, level: f.level, skills: f.skills.map(function (e) { return { id: e[0], level: e[1] }; }) });
          const h = DD.getHero(id);
          return DD.Combat.makeRunHero({ id: id, level: f.level, skills: h.skillPool.slice(0, 4).map(function (sid) { return { id: sid, level: Math.min(3, 1 + Math.floor(f.level / 4)) }; }) });
        });
        const seed = (Number(t.seed) || 1) * 31 + (++seedN) * 7919;
        const setup = DD.Encounter.build(enc, party, { rng: DD.RNG(seed), difficulty: 'normal', act: f.act });
        DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: enc.kind });
        const r = DD.AutoPlay.runBattle(30);
        const s = DD.Combat.state;
        const spa = s.units.filter(function (u) { return u.defId === 'sparrow'; })[0];
        const label = 'act ' + f.act + ' L' + f.level + ' ' + f.kind;
        t.ok(!!s.order && s.order.some(function (e) { return e.unitId === spa.id; }), label + ': Sparrow rolled initiative');
        t.ok(spa && isFinite(spa.hp) && spa.hp >= 0 && spa.hp <= spa.maxHp && spa.block >= 0, label + ': Sparrow sane');
        t.ok(r.result === 'victory' || r.result === 'defeat' || r.timeout, label + ': battle ends (' + r.result + ', ' + r.rounds + ' rounds)');
        if (r.result === 'victory') wins++;
        results.push(label + ' ' + enc.id + ': ' + (r.result || 'timeout') + ' in ' + r.rounds + ' (Sparrow ' + (spa.downed ? 'downed' : spa.hp + '/' + spa.maxHp) +
          ', dealt ' + ((s.stats.units[spa.id] || {}).dmg || 0) + ')');
      });
      // a full Hype bar with foes all around: AutoPlay unleashes the signature on her turn
      const a = arena({ at: [4, 4], level: 5, enemies: [E(4, 2, 'test_grunt', 3), E(6, 4, 'test_grunt', 3), E(2, 4, 'test_grunt', 3), E(4, 7, 'test_grunt', 3)] });
      a.s.hype = 100;
      const before = used.spa_signature || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.spa_signature || 0) > before, 'AutoPlay uses Crimson Tide with 100 Hype and 4 foes in reach');
    } finally { DD.Combat.useSkill = orig; }
    const ids = Object.keys(used);
    t.log(results.join(' | '));
    t.log('Sparrow + clone skill uses: ' + ids.map(function (k) { return k + '×' + used[k]; }).join(', '));
    t.ok((used.spa_basic || 0) > 0, 'basic attack used');
    t.ok((used.spa_hemoglob || 0) > 0 && (used.spa_juicebox || 0) > 0, 'both starting skills used');
    const poolUsed = ids.filter(function (k) { return POOL.indexOf(k) >= 0; });
    t.ok(poolUsed.length >= 6, 'at least 6 different pool skills used by AutoPlay (' + poolUsed.join(', ') + ')');
    t.ok(wins >= Math.ceil(fights.length * 0.6), 'the party wins most fixture fights (' + wins + '/' + fights.length + ')');
  });

  // ---- v2 requests (user, Nov 3): heals on the downed, barrels, flyers --------------------------------------------
  T.suite('hero_sparrow: v2 requests — Blood Drive gets the downed up, barrels (not for Vein Glory), a flying Sparrow can\'t slurp', function (t) {
    // 1. Blood Drive aimed at a downed ally: up with its HP (preview "UP! N HP" = reality), then Empowered; she pays 3 HP
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('spa_blooddrive', lv);
      const a = arena({ skills: [['spa_blooddrive', lv]], heroes: [{ id: 'test_knight', x: 5, y: 4 }], enemies: [E(8, 8)] });
      const k = at(5, 4);
      DD.Act.kill(k, null);
      t.ok(k.downed, 'L' + lv + ': knight down');
      const tg = DD.Targeting.validTargets(a.spa, a.slot('spa_blooddrive')).filter(function (q) { return q.x === 5 && q.y === 4; })[0];
      t.ok(!!tg && tg.revive === true, 'L' + lv + ': the downed knight is a target (revive)');
      const pv = previewThenUse(t, a.spa, a.slot('spa_blooddrive'), 5, 4, 'blood drive on the downed L' + lv);
      const pe = pv.perUnit[k.id];
      t.ok(!!pe && pe.revived && pe.text.indexOf('UP! ' + Lv.heal + ' HP') >= 0, 'L' + lv + ': preview "UP! ' + Lv.heal + ' HP" (' + (pe && pe.text) + ')');
      t.ok(!k.downed && k.hp === Lv.heal && k.ap === 0 && has(k, 'empowered'), 'L' + lv + ': up at ' + Lv.heal + ' HP, 0 AP, Empowered');
      t.eq(a.spa.hp, 19, 'L' + lv + ': she paid 3 HP (a blood transfusion, technically)');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && k.ap === 3, 'L' + lv + ': the knight acts on his own slot with full AP');
    });
    // Juice Box (a drain on a foe) and the Bib never revive anybody
    const j = arena({ skills: [['spa_juicebox', 1]], heroes: [{ id: 'test_knight', x: 2, y: 5 }], enemies: [E(3, 4), E(8, 8)] });
    DD.Act.kill(at(2, 5), null);
    j.spa.hp = 10;
    use(t, j.spa, j.slot('spa_juicebox'), 3, 4, 'juice box next to a downed knight');
    t.ok(at(2, 5).downed && j.spa.hp === 13, 'Juice Box heals her only: the knight stays down');

    // 2. barrels: Shiv Happens sets an adjacent one off (she is in the blast); Vein Glory is never aimed at one
    const b = arena({ skills: [['spa_veinglory', 1]], enemies: [E(4, 5), E(8, 8)], objects: [{ x: 3, y: 4, id: 'barrel_explosive' }, { x: 5, y: 2, id: 'barrel_explosive' }] });
    t.ok(!DD.Targeting.validTargets(b.spa, b.slot('spa_veinglory')).some(function (q) { return q.obj; }), 'Vein Glory never targets a barrel (target.objects: false)');
    t.ok(DD.Targeting.validTargets(b.spa, b.spa.basic).some(function (q) { return q.obj && q.x === 3 && q.y === 4; }), 'Shiv Happens: the adjacent barrel is a target');
    const g = at(4, 5);
    previewThenUse(t, b.spa, b.spa.basic, 3, 4, 'shiv at the barrel');
    t.ok(!DD.Grid.tile(3, 4).obj && b.spa.hp === 22 - 8 && g.hp === 14 && stacks(g, 'bleed') === 0,
      'KABOOM: Sparrow eats 8; the diagonal foe is outside radius 1 and nothing Bleeds (no riders on a barrel)');

    // 3. a flying Sparrow (status wings, items or a Blessing) floats over blood: the Bib slurps nothing
    const f = arena({ items: ['spa_scab_mail'], enemies: [E(8, 8)], surfaces: [{ x: 3, y: 4, id: 'blood', turns: 4 }, { x: 4, y: 4, id: 'blood', turns: 4 }] });
    f.spa.hp = 10;
    f.spa.flags = Object.assign({}, f.spa.flags, { flying: true });   // test setup: she flies
    t.ok(DD.Combat.move(f.spa, 4, 4), 'a flying Sparrow crosses two puddles');
    t.ok(f.spa.hp === 10 && surf(3, 4) === 'blood' && surf(4, 4) === 'blood', 'no slurp: the blood is on the floor, she is not');
    f.spa.flags.flying = false;
    DD.Act.teleport(f.spa, 3, 4);
    t.eq(f.spa.hp, 13, 'landed (no wings): stepping into the puddle slurps it again');
  });
})();
