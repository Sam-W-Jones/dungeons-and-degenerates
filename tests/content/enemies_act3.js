/* Dungeons and Degenerates — tests/content/enemies_act3.js
 * Suites "enemies_act3: …" for js/data/enemies/act3.js under v2 (initiative, enemies act at once on their turn, only the
 * elites' signature moves wind up): registry + sprites + initiative modifiers, every enemy skill fired as an action now
 * (damage and riders == desc), the gimmicks (imp blink + marks, fire floors, charm / confuse for the hero's next turn,
 * piercing beams with friendly fire and the overtime nap, dispel + silence, d20 tables, shield wall until each ally's
 * turn, hoard guarding + Block at the end of the dragon's turns / thieves / stolen gold, the three wind-ups and their
 * counterplay, monologue interrupt + yank-and-swing + intermission, compounding debt per own turn), every enemy's turns
 * (it acts, uses its gimmick, damage only inside its areas, no wind-ups for non-elites), previews vs reality, odd
 * conditions (no swallowed warnings), encounter objectives under initiative, no one-shots at the act's level band, and
 * AutoPlay sims with the fixture party at levels 4-6 (results logged with verbose=1; more seeds with sims=N).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const TEAM = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const ENEMIES = ['a3_imp_influencer', 'a3_hell_hound', 'a3_mind_flayer', 'a3_eyeball_intern', 'a3_rules_lawyer', 'a3_nat1_golem',
    'a3_kobold_shield', 'a3_succubus_coach', 'a3_backup_dancer', 'a3_red_dragon', 'a3_death_knight', 'a3_pit_fiend'];
  const ELITES = ['a3_red_dragon', 'a3_death_knight', 'a3_pit_fiend'];
  // each elite's one announced wind-up (DESIGN §8 v2: everything else every enemy does happens at once on its turn)
  const SIGNATURE = { a3_red_dragon: 'a3_dragon_breath', a3_death_knight: 'a3_dk_monologue', a3_pit_fiend: 'a3_fiend_audit' };
  const ENCOUNTERS = ['a3_hellhound_walkies', 'a3_influencer_collab', 'a3_self_help_seminar', 'a3_trial_by_combat', 'a3_cursed_dice_night',
    'a3_kobold_pep_rally', 'a3_snack_heist', 'a3_intern_orientation', 'a3_hoarders_lair', 'a3_very_dramatic_entrance', 'a3_tax_season'];
  const HP_BAND = { minion: [14, 18], normal: [28, 40], elite: [120, 150] };
  const SCALE_BAND = { minion: [0.7, 0.9], normal: [0.9, 1.15], elite: [1.3, 1.6] };
  const BAND = [4, 5, 6];   // act-3 hero levels with v2's one level-up per won fight (DESIGN §5: about 5 at the DM)

  // ---- helpers ---------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  /** Sandbox that never ends by itself (custom objective); AI units always pass unless cfg.enemyAi is set. */
  function quiet(cfg) {
    return DD.Combat.sandbox(Object.assign({ w: 9, h: 9, seed: 7, enemyAi: false, objective: { type: 'custom', text: 'Testing' },
      encounter: { id: 'a3t_quiet', checkObjective: function () { return null; } } }, cfg || {}));
  }
  /** Same, but the AI plays its turns (cfg.initiative 'enemiesFirst' → they have acted when it returns). */
  function live(cfg) { return quiet(Object.assign({ enemyAi: true }, cfg || {})); }
  function H(id, x, y, extra) { return Object.assign({ id: id || 'test_mage', x: x, y: y, level: 5 }, extra || {}); }
  function E(id, x, y) { return { id: id, x: x, y: y }; }
  function units(defId) { return DD.Combat.state.units.filter(function (u) { return u.defId === defId && !u.dead; }); }
  function one(defId, i) { return units(defId)[i || 0]; }
  function L(skillId) { return DD.skillLevel(DD.getSkill(skillId), 1); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function st(u, id) { return DD.Act.getStatus(u, id); }
  /** An AI action now (v2: what an enemy does on its turn). Returns true if it resolved (false: it fizzled). */
  function act(u, skillId, target) { const it = DD.AI.useNow(u, skillId, target, {}); return !!(it && it.resolved); }
  function windup(u, skillId) { return (u.intents || []).filter(function (i) { return i.windup && (!skillId || i.skillId === skillId); })[0] || null; }
  function key(p) { return p.x + ',' + p.y; }
  function keys(list) { return list.map(key).sort().join(' '); }
  function area(u, skillId, target) { return DD.Targeting.area(u, DD.getSkill(skillId), 1, target); }
  /** Skills `u` used while fn ran (onSkillUsed), in order. */
  function used(u, fn) {
    const list = [];
    DD.Act.addRule({ id: 'a3t_used', name: 'Used', hooks: { onSkillUsed: function (ctx) { if (ctx.user === u) list.push(ctx.skill.id); } } });
    try { fn(); } finally { DD.Act.removeRule('a3t_used'); }
    return list;
  }
  /** Advance the combat RNG until pred(rng) holds for the next draws; the state is left right before them. */
  function rig(pred) {
    const r = DD.Combat.state.rng;
    for (let i = 0; i < 4000; i++) {
      const s0 = r.getState();
      const ok = pred(r);
      r.setState(s0);
      if (ok) return true;
      r.next();
    }
    return false;
  }
  function warningsSince(n) { return DD.problems.slice(n); }
  function totalHp(list) { return list.reduce(function (a, u) { return a + u.hp; }, 0); }
  /** A fixture party at an act-3 level: 4 skills (2 starting + 2 pool), (level − 3) of them upgraded to II. */
  function bandParty(level) {
    return TEAM.map(function (hid) {
      const h = DD.getHero(hid);
      const extra = (h.skillPool || []).filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, 2);
      return DD.Combat.makeRunHero({ id: hid, level: level, skills: h.startingSkills.concat(extra).map(function (s, k) { return { id: s, level: k < level - 3 ? 2 : 1 }; }) });
    });
  }

  // =========================================================================================================
  T.suite('enemies_act3: registry, numbers, initiative, barks and sprites', function (t) {
    const before = DD.problems.length;
    ENEMIES.forEach(function (id) {
      const e = DD.getEnemy(id);
      if (!t.ok(!!e, 'enemy ' + id + ' registered')) return;
      t.eq(e.act, 3, id + ': act 3');
      const band = HP_BAND[e.tier];
      t.ok(band && e.hp >= band[0] && e.hp <= band[1], id + ': HP ' + e.hp + ' inside the DESIGN §5 act-3 ' + e.tier + ' band');
      t.ok(e.skills.length >= 1 && e.skills.length <= 3, id + ': 1-3 skills');
      t.ok(typeof e.init === 'number' && e.init >= -2 && e.init <= 4, id + ': an explicit initiative modifier (' + e.init + ')');
      e.skills.forEach(function (sid) {
        const s = DD.getSkill(sid);
        if (!t.ok(!!s, id + ': skill ' + sid + ' exists')) return;
        t.ok(/^a3_/.test(sid) && s.owner === 'enemy' && s.ap === 0, sid + ': a3_ id, owner enemy, ap 0');
        const d0 = DD.skillDesc(s, 1, null);
        t.ok(d0.length > 10 && !/undefined|NaN/.test(d0), sid + ': desc works without a user');
        const Lv = DD.skillLevel(s, 1);
        if (Lv.dmg) t.ok(new RegExp('(^|[^0-9])' + Lv.dmg + '(?![0-9])').test(d0), sid + ': desc shows its damage ' + Lv.dmg);
        if (Lv.r && s.target && typeof s.target.range === 'function') t.ok(new RegExp('up to ' + Lv.r + ' tiles').test(d0), sid + ': desc states its range ' + Lv.r);
        t.ok(['self', 'ground', 'unit'].indexOf(s.anchor) >= 0, sid + ': anchor');
        // v2: no telegraph wording; only the elites' signature moves are wind-ups (and say so)
        t.ok(!/telegraph|tracked|after a .*delay|charges for a round|for a round, then/i.test(d0), sid + ': no v1 telegraph wording: ' + d0);
        const sig = SIGNATURE[id] === sid;
        t.ok(/^Wind-up:/.test(d0) === sig, sid + (sig ? ': the signature desc starts with "Wind-up:"' : ': acts at once (no "Wind-up:")'));
      });
      ['spawn', 'attack', 'hurt', 'death'].forEach(function (k) {
        const lines = e.barks && e.barks[k];
        t.ok(Array.isArray(lines) && lines.length >= 2 && lines.length <= 4, id + ': barks.' + k + ' has 2-4 lines');
      });
      Object.keys(e.barks || {}).forEach(function (k) {
        e.barks[k].forEach(function (b) { t.ok(typeof b === 'string' && b.length > 0 && b.length <= 70, id + ': bark ≤ 70 chars: ' + JSON.stringify(b)); });
      });
      t.ok(typeof e.desc === 'string' && e.desc.length > 40 && !/telegraph/i.test(e.desc), id + ': codex desc (no telegraphs)');
      if (e.passive) {
        const pd = typeof e.passive.desc === 'function' ? e.passive.desc(null) : e.passive.desc;
        t.ok(e.passive.name && typeof pd === 'string' && pd.length > 20 && !/undefined|NaN/.test(pd), id + ': inspect-panel passive "' + e.passive.name + '"');
      }
      const sb = SCALE_BAND[e.tier];
      t.ok(sb && e.sprite.scale >= sb[0] && e.sprite.scale <= sb[1], id + ': sprite scale ' + e.sprite.scale + ' fits its tier');
      if (T.contentHelpers && T.contentHelpers.spriteProblems) T.contentHelpers.spriteProblems(e.sprite).forEach(function (p) { t.fail(id + ' sprite: ' + p); });
    });
    // quick pests act early, lumbering brutes late (DESIGN §4.1)
    const init = function (id) { return DD.getEnemy(id).init; };
    t.ok(init('a3_imp_influencer') >= 3 && init('a3_hell_hound') >= 2 && init('a3_backup_dancer') >= 2, 'imps, hounds and dancers are quick');
    t.ok(init('a3_nat1_golem') <= -2 && init('a3_death_knight') < 0, 'the golem lumbers, the Death Knight is fashionably late');
    ['a3_imp_influencer', 'a3_red_dragon', 'a3_death_knight', 'a3_pit_fiend'].forEach(function (id) { t.ok(!!DD.getEnemy(id).passive, id + ': its gimmick is an inspect-panel passive'); });
    // anchors are mixed across the roster, and silhouettes are distinct
    const anchors = {};
    ENEMIES.forEach(function (id) { DD.getEnemy(id).skills.forEach(function (sid) { anchors[DD.getSkill(sid).anchor] = 1; }); });
    t.ok(anchors.self && anchors.ground && anchors.unit, 'self, ground and unit anchors all used');
    const looks = ENEMIES.map(function (id) {
      const s = DD.getEnemy(id).sprite;
      return JSON.stringify([s.base, s.shape, s.build, s.outfit, s.head, s.palette && s.palette.skin, s.mainhand, s.wings]);
    });
    t.eq(new Set(looks).size, looks.length, 'every sprite spec is distinct');
    ['a3_thief', 'a3_monologue', 'a3_debt', 'a3_unshakeable'].forEach(function (id) { t.ok(!!DD.getStatus(id), 'status ' + id); });
    ['a3_hoard_pile', 'a3_snack_bowl'].forEach(function (id) { t.ok(!!DD.getObject(id) && typeof DD.getObject(id).draw === 'function', 'object ' + id + ' with a painter'); });
    // every sprite paints in every pose without warnings (custom painter + overlays)
    if (DD.Sprites && typeof document !== 'undefined') {
      const cv = document.createElement('canvas');
      cv.width = 160; cv.height = 160;
      const c = cv.getContext('2d');
      ENEMIES.forEach(function (id) {
        ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
          c.clearRect(0, 0, 160, 160);
          DD.Sprites.draw(c, DD.getEnemy(id).sprite, 80, 130, 1.5, { t: 1.3, pose: pose, facing: pose === 'hurt' ? -1 : 1, id: id });
        });
        const px = c.getImageData(0, 0, 160, 160).data;
        let ink = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i] > 0) ink++;
        t.ok(ink > 200, id + ': sprite paints pixels (' + ink + ')');
      });
      if (DD.Render && typeof DD.Render.drawObjectAt === 'function') {
        ['a3_hoard_pile', 'a3_snack_bowl'].forEach(function (id) { DD.Render.drawObjectAt(c, id, 80, 100, 1.5, {}); });
      }
    }
    t.eq(warningsSince(before).length, 0, 'no warnings while painting: ' + warningsSince(before).slice(0, 3).join(' | '));
  });

  T.suite('enemies_act3: encounter roster', function (t) {
    const all = Object.keys(DD.defs.encounters).filter(function (k) { return /^a3_/.test(k); }).map(function (k) { return DD.getEncounter(k); });
    t.eq(all.length, ENCOUNTERS.length, 'every a3_ encounter is listed in this test');
    const kinds = { normal: 0, elite: 0 }, objectives = {}, themes = {};
    let layouts = 0;
    ENCOUNTERS.forEach(function (id) {
      const en = DD.getEncounter(id);
      if (!t.ok(!!en, 'encounter ' + id)) return;
      t.ok(en.act === 3 && (en.kind === 'normal' || en.kind === 'elite'), id + ': act 3 normal/elite');
      kinds[en.kind]++;
      objectives[(en.objective || {}).type] = 1;
      themes[en.map.theme] = 1;
      if (en.map.layout) layouts++;
      else t.ok(en.map.w >= 9 && en.map.w <= 13 && en.map.h >= 9 && en.map.h <= 13, id + ': size 9-13');
      t.ok(en.name && en.intro && en.intro.length > 30, id + ': name + narrator intro');
      let lo = 0, hi = 0;
      en.enemies.forEach(function (e) { const n = Array.isArray(e.n) ? e.n : [e.n, e.n]; lo += n[0]; hi += n[1]; });
      if (en.kind === 'normal') t.ok(lo >= 4 && hi <= 6, id + ': 4-6 enemies (' + lo + '-' + hi + ')');
      else {
        t.ok(en.enemies.some(function (e) { return DD.getEnemy(e.id).tier === 'elite'; }), id + ': has an elite');
        t.eq(en.reward && en.reward.itemRarity, 'rare', id + ': rare item reward');
        t.ok((en.minDepth || 0) >= 2, id + ': elites from row 2');
      }
      en.enemies.concat([].concat.apply([], (en.reinforcements || []).map(function (w) { return w.enemies; }))).forEach(function (e) {
        t.ok(/^a3_/.test(e.id) && DD.getEnemy(e.id).act === 3, id + ': uses act-3 enemy ' + e.id);
      });
    });
    t.ok(kinds.normal >= 7 && kinds.normal <= 8 && kinds.elite >= 3 && kinds.elite <= 4, '7-8 normal + 3-4 elite (' + kinds.normal + ' + ' + kinds.elite + ')');
    t.ok(objectives.killAll && objectives.survive && objectives.destroy && objectives.protect, 'objectives vary: ' + Object.keys(objectives).join(', '));
    t.ok(themes.hellscape && themes.hoard && themes.dm_table, 'every act-3 theme used');
    t.ok(layouts >= 2 && layouts <= 3, '2-3 handcrafted layouts (' + layouts + ')');
  });

  // =========================================================================================================
  T.suite('enemies_act3: minions and normals hit for exactly what their desc says', function (t) {
    // Imp: Go Live (fire + Mark, 6 tiles, no line of sight), Hot Take (consumes the Mark)
    quiet({ w: 11, heroes: [H('test_mage', 4, 4)], enemies: [E('a3_imp_influencer', 1, 4)] });
    let imp = one('a3_imp_influencer'), mage = DD.Combat.heroes()[0], hp = mage.hp;
    t.ok(act(imp, 'a3_imp_golive', mage), 'Go Live! resolves at once');
    t.eq(hp - mage.hp, L('a3_imp_golive').dmg, 'Go Live deals ' + L('a3_imp_golive').dmg + ' fire');
    t.eq(st(mage, 'marked') && st(mage, 'marked').stacks, L('a3_imp_golive').mark, 'and Marks ' + L('a3_imp_golive').mark);
    hp = mage.hp;
    act(imp, 'a3_imp_hottake', mage);
    t.eq(hp - mage.hp, L('a3_imp_hottake').dmg + L('a3_imp_golive').mark, 'Hot Take ' + L('a3_imp_hottake').dmg + ' + the ' + L('a3_imp_golive').mark + ' Mark');
    t.ok(!has(mage, 'marked'), 'Mark consumed');
    DD.Grid.tile(3, 4).t = 'wall';
    A().teleport(mage, 1 + L('a3_imp_golive').r, 4);
    hp = mage.hp;
    t.ok(act(imp, 'a3_imp_golive', mage) && hp - mage.hp === L('a3_imp_golive').dmg, 'Go Live! reaches ' + L('a3_imp_golive').r + ' tiles, through a wall');
    A().teleport(mage, 2 + L('a3_imp_golive').r, 4);
    hp = mage.hp;
    t.ok(!act(imp, 'a3_imp_golive', mage) && mage.hp === hp, '...not ' + (L('a3_imp_golive').r + 1));

    // Hell Hound: breath cone (friends too) + fire floor; bite (also objects)
    quiet({ heroes: [H('test_mage', 3, 4), H('test_rogue', 4, 5)], enemies: [E('a3_hell_hound', 2, 4), E('a3_imp_influencer', 4, 3)] });
    const hound = one('a3_hell_hound');
    imp = one('a3_imp_influencer');
    const [m2, rogue] = DD.Combat.heroes();
    const hp0 = [m2.hp, rogue.hp, imp.hp];
    t.eq(keys(area(hound, 'a3_hound_breath', { x: 3, y: 4 })), '3,4 4,3 4,4 4,5', 'breath: a 2-deep cone of 4 tiles');
    act(hound, 'a3_hound_breath', { x: 3, y: 4 });
    t.eq(hp0[0] - m2.hp, L('a3_hound_breath').dmg, 'breath: fire to the mage');
    t.eq(hp0[1] - rogue.hp, L('a3_hound_breath').dmg, 'breath: fire to the rogue');
    t.eq(hp0[2] - imp.hp, Math.round(L('a3_hound_breath').dmg * 0.5), 'breath: friends too (imp resists fire: half)');
    t.ok(['3,4', '4,3', '4,4', '4,5'].every(function (k) { const p = k.split(','); const tl = DD.Grid.tile(+p[0], +p[1]); return tl.surface && tl.surface.id === 'fire'; }), 'the cone burns');
    hp = m2.hp;
    act(hound, 'a3_hound_bite', { x: 3, y: 4 });
    t.eq(hp - m2.hp, L('a3_hound_bite').dmg, 'Chew Toy bites for ' + L('a3_hound_bite').dmg);
    // "the floor there burns until the end of next round" (surfaces count rounds)
    quiet({ heroes: [H('test_mage', 8, 8)], enemies: [E('a3_hell_hound', 2, 4)] });
    const s0 = DD.Combat.state;
    act(one('a3_hell_hound'), 'a3_hound_breath', { x: 3, y: 4 });
    DD.Combat.endRound();
    t.ok(s0.round === 2 && DD.Grid.tile(4, 4).surface && DD.Grid.tile(4, 4).surface.id === 'fire', 'next round: the cone is still burning');
    DD.Combat.endRound();
    t.ok(s0.round === 3 && !DD.Grid.tile(4, 4).surface, '...and it is out the round after');
    // Pounce: leaps next to a target up to 4 away; not beyond, not while Rooted
    quiet({ heroes: [H('test_mage', 6, 4)], enemies: [E('a3_hell_hound', 2, 4)] });
    const hp1 = one('a3_hell_hound'), mp = DD.Combat.heroes()[0];
    hp = mp.hp;
    t.ok(act(hp1, 'a3_hound_pounce', mp) && hp - mp.hp === L('a3_hound_pounce').dmg && DD.Grid.dist(hp1, mp) === 1, 'Pounce: leaps 4 tiles next to it and bites');
    A().teleport(mp, 8, 8);
    hp = mp.hp;
    const at = { x: hp1.x, y: hp1.y };
    t.ok(!act(hp1, 'a3_hound_pounce', mp) && mp.hp === hp && hp1.x === at.x && hp1.y === at.y, 'out of reach (5+ tiles): it fizzles and stays put');
    A().teleport(mp, hp1.x + 2, hp1.y);
    A().addStatus(hp1, 'root', { turns: 1 });
    hp = mp.hp;
    act(hp1, 'a3_hound_pounce', mp);
    t.ok(mp.hp === hp && hp1.x === at.x, 'a Rooted hound can\'t leap');
    quiet({ heroes: [H('test_mage', 7, 7)], enemies: [E('a3_hell_hound', 2, 4)], objects: [{ x: 3, y: 4, id: 'a3_snack_bowl' }] });
    act(one('a3_hell_hound'), 'a3_hound_bite', { x: 3, y: 4 });
    t.eq(DD.Grid.tile(3, 4).obj.hp, DD.getObject('a3_snack_bowl').hp - L('a3_hound_bite').dmg, 'the bite also chews objects (snack bowl −' + L('a3_hound_bite').dmg + ')');
    t.eq(DD.getEnemy('a3_hell_hound').resist.fire, 0, 'hell hounds are fire-immune');

    // Mind Flayer: cone + Confused; advice + Charm (charmed hero can't hurt him, −1 AP)
    quiet({ heroes: [H('test_mage', 4, 4), H('test_rogue', 3, 6)], enemies: [E('a3_mind_flayer', 2, 4)] });
    const fl = one('a3_mind_flayer');
    const [m3, r3] = DD.Combat.heroes();
    hp = m3.hp;
    t.eq(area(fl, 'a3_flayer_blast', { x: 3, y: 4 }).length, 9, 'Hustle Culture: 3-deep cone, 9 tiles');
    act(fl, 'a3_flayer_blast', { x: 3, y: 4 });
    t.eq(hp - m3.hp, L('a3_flayer_blast').dmg, 'blast: psychic damage');
    t.ok(has(m3, 'confused') && st(m3, 'confused').turns === 1, 'blast: Confused for 1 turn');
    t.eq(DD.Combat.moveApCost(m3), 2, 'confused hero: moving costs 2 AP');
    hp = r3.hp;
    act(fl, 'a3_flayer_advice', r3);
    t.eq(hp - r3.hp, L('a3_flayer_advice').dmg, 'advice: psychic damage');
    t.ok(has(r3, 'charmed') && st(r3, 'charmed').source === fl.id, 'advice: Charmed by the Life Coach');
    t.eq(DD.Combat.turnAp(r3), r3.maxAp - 1, 'charmed hero: −1 AP on its turn');
    const flHp = fl.hp;
    A().damage(r3, fl, 6);
    t.eq(fl.hp, flHp, 'a charmed hero can\'t damage the charmer');

    // Eyeball Intern: piercing stare hits coworkers; the overtime beam fires at once down 8 tiles, then it passes out
    quiet({ w: 11, h: 9, heroes: [H('test_mage', 3, 4), H('test_rogue', 9, 4)], enemies: [E('a3_eyeball_intern', 1, 4), E('a3_imp_influencer', 5, 4)] });
    const eye = one('a3_eyeball_intern');
    imp = one('a3_imp_influencer');
    const [m4, r4] = DD.Combat.heroes();
    let hp4 = [m4.hp, imp.hp, r4.hp];
    t.eq(keys(area(eye, 'a3_eye_stare', m4)), '2,4 3,4 4,4 5,4 6,4', 'stare: a 5-tile ray through the target');
    act(eye, 'a3_eye_stare', m4);
    t.ok(hp4[0] - m4.hp === L('a3_eye_stare').dmg && hp4[1] - imp.hp === L('a3_eye_stare').dmg && r4.hp === hp4[2], 'stare: the mage AND the coworker imp, nothing past 5 tiles');
    // the ray bends toward a target off the row, and stops at walls
    A().teleport(m4, 3, 6);
    const ray = area(eye, 'a3_eye_stare', m4).map(key);
    t.ok(ray.indexOf('3,6') >= 0 && ray.indexOf('2,5') >= 0 && ray.length >= 3, 'the ray bends toward a target that left the row: ' + ray.join(' '));
    DD.Grid.tile(2, 5).t = 'wall';
    t.ok(area(eye, 'a3_eye_stare', m4).length <= 1 || !DD.Grid.los(eye, m4), 'walls stop the ray');
    DD.Grid.tile(2, 5).t = 'stone';
    A().teleport(m4, 3, 4);
    imp.hp = imp.maxHp;
    hp4 = [m4.hp, imp.hp, r4.hp];
    t.eq(area(eye, 'a3_eye_overtime', { x: 2, y: 4 }).length, L('a3_eye_overtime').len, 'overtime: an 8-tile line');
    t.ok(act(eye, 'a3_eye_overtime', { x: 2, y: 4 }) && eye.intents.length === 0, 'overtime: fires at once (no charging, nothing pending)');
    t.ok([hp4[0] - m4.hp, hp4[1] - imp.hp, hp4[2] - r4.hp].every(function (d) { return d === L('a3_eye_overtime').dmg; }), 'overtime: ' + L('a3_eye_overtime').dmg + ' to the mage, the coworker and the rogue 8 tiles out');
    t.ok(has(eye, 'stun') && DD.AI.reachOf(eye).tiles.size === 0, 'then it passes out: Stunned (no reach on its next turn)');
    t.ok(DD.AI.act(eye) === false, 'it loses that turn');

    // Rules Lawyer: OBJECTION! strips buffs (even Invulnerable) + Silence, no damage; Motion pushes 2 (into pits)
    quiet({ w: 11, heroes: [H('test_mage', 4, 4)], enemies: [E('a3_rules_lawyer', 1, 4)] });
    const law = one('a3_rules_lawyer');
    const m5 = DD.Combat.heroes()[0];
    ['inspired', 'invulnerable', 'haste', 'weak'].forEach(function (id) { A().addStatus(m5, id, { turns: 2 }); });
    hp = m5.hp;
    act(law, 'a3_lawyer_objection', m5);
    t.ok(!has(m5, 'inspired') && !has(m5, 'invulnerable') && !has(m5, 'haste'), 'OBJECTION! strips every buff');
    t.ok(has(m5, 'weak'), '...but not debuffs');
    t.eq(m5.hp, hp, 'and deals no damage (desc: no damage number)');
    t.ok(has(m5, 'silenced') && st(m5, 'silenced').turns === 1, 'and Silences for 1 turn');
    A().removeStatus(m5, 'silenced');
    DD.Grid.tile(3, 4).t = 'wall';
    A().teleport(m5, 1 + L('a3_lawyer_objection').r, 4);
    t.ok(act(law, 'a3_lawyer_objection', m5) && has(m5, 'silenced'), 'it reaches ' + L('a3_lawyer_objection').r + ' tiles, through a wall');
    A().removeStatus(m5, 'silenced');
    A().teleport(m5, 2 + L('a3_lawyer_objection').r, 4);
    t.ok(!act(law, 'a3_lawyer_objection', m5) && !has(m5, 'silenced'), '...not further');
    quiet({ heroes: [H('test_mage', 3, 4)], enemies: [E('a3_rules_lawyer', 2, 4)] });
    const law2 = one('a3_rules_lawyer'), m6 = DD.Combat.heroes()[0];
    hp = m6.hp;
    act(law2, 'a3_lawyer_motion', m6);
    t.ok(hp - m6.hp === L('a3_lawyer_motion').dmg && m6.x === 5 && m6.y === 4, 'Motion to Dismiss: damage, pushed 2 tiles');
    quiet({ heroes: [H('test_mage', 3, 4)], enemies: [E('a3_rules_lawyer', 2, 4)], terrain: function (tl) { if (tl.x === 5 && tl.y === 4) tl.t = 'pit'; } });
    const law3 = one('a3_rules_lawyer'), m7 = DD.Combat.heroes()[0];
    const ctxPit = DD.Targeting.buildCtx(law3, law3.skillSlots[1], { x: 3, y: 4 });
    t.ok(DD.getSkill('a3_lawyer_motion').aiScore(ctxPit) >= 10, 'the AI values shoving a hero into a pit');
    hp = m7.hp;
    act(law3, 'a3_lawyer_motion', m7);
    t.eq(hp - m7.hp, L('a3_lawyer_motion').dmg + Math.ceil(m7.maxHp * 0.25), 'shoved into the pit: damage + 25% max HP');

    // Kobold Dragonshield: Shield Wall (self + adjacent allies), Pointy Stick (first unit in 2)
    quiet({ heroes: [H('test_mage', 7, 7)], enemies: [E('a3_kobold_shield', 3, 3), E('a3_hell_hound', 4, 3), E('a3_imp_influencer', 3, 2), E('a3_eyeball_intern', 5, 5)] });
    const kob = one('a3_kobold_shield');
    act(kob, 'a3_kobold_wall', kob);
    const blk = L('a3_kobold_wall').block;
    t.ok(kob.block === blk && one('a3_hell_hound').block === blk && one('a3_imp_influencer').block === blk, 'Shield Wall: ' + blk + ' Block to itself and adjacent allies');
    t.eq(one('a3_eyeball_intern').block, 0, 'nobody further away');
    quiet({ heroes: [H('test_mage', 5, 4), H('test_rogue', 3, 6)], enemies: [E('a3_kobold_shield', 3, 4)] });
    const k2 = one('a3_kobold_shield'), [m8, r8] = DD.Combat.heroes();
    hp = m8.hp;
    act(k2, 'a3_kobold_spear', { x: 4, y: 4 });
    t.eq(hp - m8.hp, L('a3_kobold_spear').dmg, 'Pointy Stick reaches 2 tiles');
    A().teleport(r8, 4, 4);
    hp = m8.hp;
    const hpr = r8.hp;
    act(k2, 'a3_kobold_spear', { x: 4, y: 4 });
    t.ok(m8.hp === hp && hpr - r8.hp === L('a3_kobold_spear').dmg, '...but stops at the first unit');

    // Succubus: pickup line (psychic + Charm), pep talk (others within 3 Inspired for 2 turns)
    quiet({ w: 11, heroes: [H('test_mage', 4, 4)], enemies: [E('a3_succubus_coach', 1, 4), E('a3_hell_hound', 1, 6), E('a3_kobold_shield', 1, 8)] });
    const suc = one('a3_succubus_coach'), m9 = DD.Combat.heroes()[0];
    hp = m9.hp;
    act(suc, 'a3_succubus_line', m9);
    t.ok(hp - m9.hp === L('a3_succubus_line').dmg && has(m9, 'charmed'), 'Terrible Pickup Line: psychic damage + Charmed');
    act(suc, 'a3_succubus_pep', suc);
    t.ok(has(one('a3_hell_hound'), 'inspired') && st(one('a3_hell_hound'), 'inspired').turns === L('a3_succubus_pep').turns, 'pep talk: ally within 3 Inspired for 2 turns');
    t.ok(!has(suc, 'inspired') && !has(one('a3_kobold_shield'), 'inspired'), '...not herself, not an ally 4 tiles away');

    // Backup Dancer: shimmies up to 2 tiles next to its target, then kicks
    quiet({ heroes: [H('test_mage', 3, 4)], enemies: [E('a3_backup_dancer', 2, 4)] });
    const dan = one('a3_backup_dancer'), m10 = DD.Combat.heroes()[0];
    hp = m10.hp;
    act(dan, 'a3_dancer_kick', m10);
    t.eq(hp - m10.hp, L('a3_dancer_kick').dmg, 'Kick Ball Change: adjacent kick');
    A().teleport(m10, 4, 4);
    hp = m10.hp;
    act(dan, 'a3_dancer_kick', m10);
    t.ok(hp - m10.hp === L('a3_dancer_kick').dmg && DD.Grid.dist(dan, m10) === 1, 'a target 2 away: it shimmies over and kicks');
    t.ok(A().teleport(dan, 2, 2) && A().teleport(m10, 5, 2), 'dancer 3 tiles from the mage');
    hp = m10.hp;
    const danAt = key(dan);
    t.ok(!act(dan, 'a3_dancer_kick', m10) && m10.hp === hp && key(dan) === danAt, '3 tiles away: out of shimmy range, it fizzles and stays put');
    A().teleport(m10, 4, 2);
    A().addStatus(dan, 'root', { turns: 1 });
    hp = m10.hp;
    act(dan, 'a3_dancer_kick', m10);
    t.ok(m10.hp === hp && key(dan) === danAt, 'Rooted: no shimmy, no kick');
    // leaps never land on a tile that would kill the leaper (the only free tile next to the hero is lava)
    quiet({ heroes: [H('test_mage', 4, 4)], enemies: [E('a3_backup_dancer', 6, 4)],
      terrain: function (tl) { if ((tl.x === 3 && tl.y === 4) || (tl.x === 4 && tl.y === 3) || (tl.x === 4 && tl.y === 5)) tl.t = 'wall'; if (tl.x === 5 && tl.y === 4) tl.t = 'lava'; } });
    const dl = one('a3_backup_dancer'), ml = DD.Combat.heroes()[0];
    dl.hp = 6;
    hp = ml.hp;
    act(dl, 'a3_dancer_kick', ml);
    t.ok(!dl.dead && dl.x === 6 && ml.hp === hp, 'a 6-HP dancer refuses to shimmy into lava (no kick)');
    dl.hp = dl.maxHp;
    act(dl, 'a3_dancer_kick', ml);
    t.ok(dl.x === 5 && hp - ml.hp === L('a3_dancer_kick').dmg, 'at full HP it braves the lava and kicks');
  });

  // =========================================================================================================
  T.suite('enemies_act3: statuses from enemy turns last through the victim\'s next turn', function (t) {
    // the Life Coach's advice and blast, used on ITS turn: they cover the hero's next turn, then they are gone
    [['a3_flayer_advice', 'charmed'], ['a3_flayer_blast', 'confused']].forEach(function (c) {
      quiet({ w: 11, h: 9, heroes: [H('test_mage', 3, 4)], enemies: [E('a3_mind_flayer', 5, 4)] });
      const s = DD.Combat.state, fl = one('a3_mind_flayer'), mage = DD.Combat.heroes()[0];
      let n = 0;
      const off = DD.Events.on('turn:start', function (e) { if (e.unit === fl && !n++) act(fl, c[0], c[0] === 'a3_flayer_blast' ? { x: 4, y: 4 } : mage); });
      DD.Combat.endTurn();   // the mage passes; the flayer's turn: the skill lands on the mage
      off();
      t.ok(s.round === 2 && DD.Combat.current() === mage && has(mage, c[1]), c[0] + ': round 2, the mage\'s turn: ' + c[1]);
      if (c[1] === 'charmed') {
        t.eq(mage.ap, mage.maxAp - 1, 'charmed: this turn has 1 less AP');
        const fhp = fl.hp;
        t.ok(DD.Combat.useSkill(mage, mage.basic, fl.x, fl.y) && fl.hp === fhp, '...and the bolt can\'t hurt the charmer');
      } else t.eq(DD.Combat.moveApCost(mage), 2, 'confused: moving costs 2 AP this turn');
      DD.Combat.endTurn();
      t.ok(s.round === 3 && !has(mage, c[1]), c[0] + ': round 3: it covered exactly that one turn');
    });

    // the overtime nap (applied on its own turn) costs the eyeball exactly its next turn
    live({ w: 11, h: 9, initiative: 'enemiesFirst', heroes: [H('test_mage', 2, 4), H('test_rogue', 4, 4)], enemies: [E('a3_eyeball_intern', 8, 4)] });
    const eye = one('a3_eyeball_intern');
    const [m2, r2] = DD.Combat.heroes();
    t.ok(m2.hp === m2.maxHp - L('a3_eye_overtime').dmg && r2.hp === r2.maxHp - L('a3_eye_overtime').dmg, 'round 1: two heroes in its line: the overtime beam, at once');
    t.ok(has(eye, 'stun') && eye.intents.length === 0, 'it passed out (nothing pending)');
    const hp2 = [m2.hp, r2.hp];
    DD.Combat.endRound();
    t.ok(m2.hp === hp2[0] && r2.hp === hp2[1] && !has(eye, 'stun'), 'round 2: it slept through its turn, then woke up');
    DD.Combat.endRound();
    t.ok(m2.hp + r2.hp < hp2[0] + hp2[1], 'round 3: it is back at work (a plain stare)');

    // Inspired from the pep talk lasts for each ally's next 2 turns
    quiet({ heroes: [H('test_mage', 8, 8)], enemies: [E('a3_succubus_coach', 1, 4), E('a3_hell_hound', 2, 4)] });
    const hound = one('a3_hell_hound');
    act(one('a3_succubus_coach'), 'a3_succubus_pep', one('a3_succubus_coach'));
    DD.Combat.endRound();
    t.ok(has(hound, 'inspired'), 'after one of its turns the hound is still Inspired');
    DD.Combat.endRound();
    t.ok(!has(hound, 'inspired'), 'gone after its second');

    // Shield Wall Block stays on each ally until the start of that ally's next turn
    quiet({ heroes: [H('test_mage', 8, 8)], enemies: [E('a3_kobold_shield', 3, 3), E('a3_hell_hound', 4, 3)] });
    const kob = one('a3_kobold_shield'), h2 = one('a3_hell_hound');
    act(kob, 'a3_kobold_wall', kob);
    let during = -1;
    const off = DD.Events.on('turn:start', function (e) { if (e.unit === h2 && during < 0) during = h2.block; });
    DD.Combat.endRound();
    off();
    t.eq(during, L('a3_kobold_wall').block, 'the hound still had the Block when its turn began');
    t.eq(h2.block, 0, 'and lost it at its turn start');
  });

  // =========================================================================================================
  T.suite('enemies_act3: the Natural 1 Golem rolls its d20 table', function (t) {
    function golemFight() {
      quiet({ heroes: [H('test_mage', 3, 4)], enemies: [E('a3_nat1_golem', 2, 4)] });
      return { g: one('a3_nat1_golem'), h: DD.Combat.heroes()[0] };
    }
    const Lr = L('a3_golem_roll');
    [[1, 0], [5, Lr.low], [9, Lr.low], [10, Lr.dmg], [19, Lr.dmg], [20, Lr.crit]].forEach(function (c) {
      const f = golemFight();
      t.ok(rig(function (r) { return r.int(1, 20) === c[0]; }), 'rigged a ' + c[0]);
      const hp = f.h.hp, ghp = f.g.hp;
      act(f.g, 'a3_golem_roll', { x: 3, y: 4 });
      t.eq(hp - f.h.hp, c[1], 'roll ' + c[0] + ' deals ' + c[1]);
      if (c[0] === 1) {
        t.eq(ghp - f.g.hp, Lr.oops, 'natural 1: it hits itself for ' + Lr.oops + ' (armor ignored)');
        t.ok(has(f.g, 'stun'), 'natural 1: and is Stunned');
      }
    });
    // the dice lob: doubles = 16, otherwise 8, to every unit within 1 of the target (friends too)
    [true, false].forEach(function (dbl) {
      quiet({ heroes: [H('test_mage', 5, 4)], enemies: [E('a3_nat1_golem', 1, 4), E('a3_imp_influencer', 5, 5)] });
      const g = one('a3_nat1_golem'), h = DD.Combat.heroes()[0], imp = one('a3_imp_influencer');
      t.eq(area(g, 'a3_golem_toss', h).length, 5, 'the dice land in radius 1 around the target');
      t.ok(rig(function (r) { return (r.int(1, 6) === r.int(1, 6)) === dbl; }), 'rigged ' + (dbl ? 'doubles' : 'no doubles'));
      const hp = h.hp, ihp = imp.hp;
      act(g, 'a3_golem_toss', h);
      const want = dbl ? L('a3_golem_toss').doubles : L('a3_golem_toss').dmg;
      t.ok(hp - h.hp === want && ihp - imp.hp === want, 'dice land for ' + want + ' on everyone in radius 1');
    });
    // "never the golem itself": a lob at a hero standing next to it
    quiet({ heroes: [H('test_mage', 3, 4)], enemies: [E('a3_nat1_golem', 2, 4)] });
    const gs = one('a3_nat1_golem'), hs = DD.Combat.heroes()[0];
    const ghp = gs.hp, hhp = hs.hp;
    act(gs, 'a3_golem_toss', hs);
    t.ok(gs.hp === ghp && hhp - hs.hp >= L('a3_golem_toss').dmg, 'the golem is inside the splash but never hits itself');
    // its turn: a hero within a step → the d20 swing; far away → the dice lob (no wind-up either way)
    quiet({ w: 11, h: 9, heroes: [H('test_mage', 3, 4)], enemies: [E('a3_nat1_golem', 4, 4)] });
    let g = one('a3_nat1_golem');
    let did = used(g, function () { DD.AI.act(g); });
    t.ok(did.length === 1 && did[0] === 'a3_golem_roll' && g.intents.length === 0, 'adjacent: Roll to Hit, at once (' + did.join(', ') + ')');
    quiet({ w: 11, h: 9, heroes: [H('test_mage', 1, 4)], enemies: [E('a3_nat1_golem', 8, 4)] });
    g = one('a3_nat1_golem');
    did = used(g, function () { DD.AI.act(g); });
    t.ok(did.length === 1 && did[0] === 'a3_golem_toss', 'out of melee reach: the dice lob (' + did.join(', ') + ')');
    did = used(g, function () { DD.AI.act(g); });
    t.ok(did.length <= 1 && did.indexOf('a3_golem_toss') < 0, 'the lob is on cooldown next turn: it lumbers closer instead');
  });

  // =========================================================================================================
  T.suite('enemies_act3: imp blinks instead of walking', function (t) {
    // a wall the whole way down: walking can't get past it, a blink can
    const wallX = function (tl) { if (tl.x === 8) tl.t = 'wall'; };
    quiet({ w: 11, h: 11, terrain: wallX, heroes: [H('test_knight', 1, 5), H('test_mage', 2, 7)], enemies: [E('a3_imp_influencer', 9, 5)] });
    const imp = one('a3_imp_influencer');
    const from = { x: imp.x, y: imp.y };
    const hp = totalHp(DD.Combat.heroes());
    const did = used(imp, function () { DD.AI.act(imp); });
    const d = DD.Grid.dist(from, imp);
    t.ok(imp.x < 8 && d > 0 && d <= 5, 'blinked ' + d + ' tiles (≤ 5) across a wall it can\'t walk through');
    t.ok(did.length === 1 && totalHp(DD.Combat.heroes()) < hp && imp.intents.length === 0, 'and shot a hero at once (' + did.join(', ') + ')');
    t.ok(DD.Combat.foesOf(imp).every(function (h) { return DD.Grid.dist(h, imp) > 1; }), 'it keeps out of melee reach');
    quiet({ w: 11, h: 11, terrain: wallX, heroes: [H('test_knight', 1, 5)], enemies: [E('a3_imp_influencer', 9, 5)] });
    const imp2 = one('a3_imp_influencer');
    A().addStatus(imp2, 'root', { turns: 1 });
    DD.AI.act(imp2);
    t.ok(imp2.x === 9 && imp2.y === 5, 'rooted imps can\'t blink');
  });

  // =========================================================================================================
  T.suite('enemies_act3: every enemy takes sensible turns (acts at once, areas honest, no wind-ups but the elites\')', function (t) {
    const watch = T.contentHelpers && T.contentHelpers.watchAreas;
    ENEMIES.forEach(function (id) {
      const run = function (w) {
        live({ w: 11, h: 11, seed: 4, heroes: TEAM.map(function (h, i) { return H(h, 1 + (i % 2), 3 + i); }),
          enemies: [E(id, 7, 5), E('a3_hell_hound', 8, 7)], gold: 30 });
        if (w) w.arm();
        const s = DD.Combat.state, u = one(id);
        const winds = [], skills = [];
        let stray = 0;
        const offW = DD.Events.on('windup:start', function (e) { if (e.unit === u) winds.push(e.intent.skillId); });
        const offE = DD.Events.on('turn:end', function (e) { if (e.unit === u && windup(u) && !SIGNATURE[id]) stray++; });
        DD.Act.addRule({ id: 'a3t_sk', name: 'Skills', hooks: { onSkillUsed: function (ctx) { if (ctx.user === u) skills.push(ctx.skill.id); } } });
        try { for (let r = 0; r < 3 && !s.result && !u.dead; r++) DD.Combat.endRound(); } finally { offW(); offE(); }
        t.ok(skills.length > 0 || u.dead, id + ': used its skills within 3 rounds (' + skills.join(', ') + ')');
        t.ok(skills.every(function (sid) { return DD.getEnemy(id).skills.indexOf(sid) >= 0; }), id + ': only its own skills');
        if (SIGNATURE[id]) t.ok(winds.every(function (sid) { return sid === SIGNATURE[id]; }), id + ': its only wind-up is ' + SIGNATURE[id] + ' (' + winds.join(', ') + ')');
        else t.ok(!winds.length && !stray, id + ': never winds up (everything happens on its turn)');
      };
      if (watch) {
        const w = watch(run);
        w.violations.forEach(function (v) { t.fail(id + ': ' + v); });
      } else run(null);
    });
  });

  // =========================================================================================================
  /** Hoard piles within 3 tiles of p (what the dragon basks in). */
  function pilesNear(p) {
    return DD.Combat.state.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'a3_hoard_pile' && DD.Grid.dist(tl, p) <= 3; }).length;
  }

  T.suite('enemies_act3: Young Red Dragon guards its hoard, hunts thieves, steals gold', function (t) {
    const HOARD = [{ x: 3, y: 0, id: 'a3_hoard_pile' }, { x: 7, y: 0, id: 'a3_hoard_pile' }, { x: 5, y: 1, id: 'a3_hoard_pile', data: { gold: 9 } }];
    const LEASH_Y = 4;   // the piles sit on rows 0-1: inside the leash means row 4 or above
    const lair = function (objects, opts) {
      opts = opts || {};
      quiet({ w: 11, h: 11, gold: 50, enemyAi: !!opts.ai, initiative: opts.first ? 'enemiesFirst' : undefined, heroes: [H('test_mage', 5, 10), H('test_knight', 2, 9)],
        enemies: [E('a3_red_dragon', 5, 2)], objects: objects });
      return one('a3_red_dragon');
    };
    // its turn (it acts first here): heroes out of reach → it settles where all 3 piles cover it and basks at its turn end
    let dragon = lair(HOARD, { ai: true, first: true });
    t.eq(pilesNear(dragon), 3, 'heroes out of reach: it settled where all 3 piles cover it (at ' + dragon.x + ',' + dragon.y + '), not at the edge of its leash');
    t.ok(dragon.intents.length === 0 && totalHp(DD.Combat.heroes()) === DD.Combat.heroes().reduce(function (a, u) { return a + u.maxHp; }, 0), '...nothing to bite or burn');
    t.eq(dragon.block, Math.min(15, 3 * pilesNear(dragon)), 'and basked at the end of its turn: 3 Block per pile within 3 (' + pilesNear(dragon) + ' piles)');
    let during = -1;
    const off = DD.Events.on('turn:start', function (e) { if (e.unit.side === 'hero' && during < 0) during = dragon.block; });
    DD.Combat.endRound();
    off();
    t.ok(during > 0, 'the hoard Block lasts through the heroes\' turns (' + during + ')');
    // a hero within reach of the leash: it winds up its breath from the hoard (or, breath spent, swoops out to bite)
    dragon = lair(HOARD);
    A().teleport(DD.Combat.heroes()[0], 5, 7);
    let did = used(dragon, function () { DD.AI.act(dragon); });
    t.ok(!!windup(dragon, 'a3_dragon_breath') && dragon.y <= LEASH_Y && pilesNear(dragon) >= 1, 'a hero within reach: it inhales from inside its leash (at ' + dragon.x + ',' + dragon.y + ')');
    dragon = lair(HOARD);
    A().teleport(DD.Combat.heroes()[0], 5, 7);
    A().setCooldown(dragon, 'a3_dragon_breath', 2);
    did = used(dragon, function () { DD.AI.act(dragon); });
    t.ok(did.indexOf('a3_dragon_bite') >= 0 && DD.Combat.heroes()[0].hp < DD.Combat.heroes()[0].maxHp, 'breath spent: it swoops out of its leash to bite (' + did.join(', ') + ')');
    dragon = lair([]);
    DD.AI.act(dragon);
    t.ok(dragon.y > LEASH_Y && dragon.block === 0, 'no hoard: it flies straight at the party (to ' + dragon.x + ',' + dragon.y + '), no Block');
    // a Thief in sight sends it off its hoard
    dragon = lair(HOARD);
    A().addStatus(DD.Combat.heroes()[0], 'a3_thief', {});
    DD.AI.act(dragon);
    t.ok(dragon.y > LEASH_Y, 'a Thief is loose: it leaves its hoard to hunt (to ' + dragon.x + ',' + dragon.y + ')');
    // HOARD_MAX caps the Block; a stunned dragon loses its turn but still basks at the end of it
    dragon = lair(HOARD.concat([{ x: 4, y: 3, id: 'a3_hoard_pile' }, { x: 6, y: 3, id: 'a3_hoard_pile' }, { x: 5, y: 4, id: 'a3_hoard_pile' }]), { ai: true });
    A().teleport(dragon, 5, 1);
    t.eq(pilesNear(dragon), 6, '6 piles within 3 of the dragon');
    A().addStatus(dragon, 'stun', { turns: 1 });
    DD.Combat.endRound();
    t.ok(dragon.x === 5 && dragon.y === 1 && !has(dragon, 'stun'), 'stunned: it lost its turn (no move), then the stun wore off');
    t.eq(dragon.block, 15, '...but it basked anyway: 6 piles in reach cap at 15 Block (not 18)');
    // a real lair: nobody starts with Block; the dragon gets its hoard Block at the end of its first turn
    const setup = DD.Encounter.build('a3_hoarders_lair', TEAM, { seed: 'lair-deploy', difficulty: 'normal', act: 3 });
    DD.Combat.start(setup, { seed: 9, headless: true, difficulty: 'normal', kind: 'elite' });
    const ld = one('a3_red_dragon');
    t.ok(DD.Combat.isDeploying() && ld.block === 0, 'Hoarder\'s Lair, deployment: no starting Block');
    const st0 = DD.Combat.state, hero = DD.Combat.heroes()[0];
    const free = st0.deploy.tiles.filter(function (p) { return !DD.Grid.unitAt(p.x, p.y); })[0];
    t.ok(free && DD.Combat.deployMove(hero, free.x, free.y) && ld.block === 0, 'deployment swaps grant nothing either');
    let basked = null;
    const offT = DD.Events.on('turn:end', function (e) { if (e.unit === ld && !basked) basked = { block: ld.block, piles: pilesNear(ld) }; });
    DD.Combat.rollInitiative();
    while (!basked && !st0.result && st0.round < 3) DD.Combat.endTurn();
    offT();
    t.ok(!!basked && basked.block === Math.min(15, 3 * basked.piles), 'its first turn ends with 3 Block per pile around it (' + (basked && basked.block) + ' Block, ' + (basked && basked.piles) + ' piles)');

    // pocketing: walk over a pile → its gold + Thief; AutoPlay values guarded piles
    quiet({ w: 11, h: 11, gold: 50, heroes: [H('test_mage', 5, 8), H('test_knight', 2, 8)], enemies: [E('a3_red_dragon', 5, 3)],
      objects: [{ x: 4, y: 1, id: 'a3_hoard_pile' }, { x: 7, y: 3, id: 'a3_hoard_pile' }, { x: 5, y: 6, id: 'a3_hoard_pile', data: { gold: 9 } },
        { x: 10, y: 10, id: 'a3_hoard_pile' }] });
    const s = DD.Combat.state;
    dragon = one('a3_red_dragon');
    const [mage] = DD.Combat.heroes();
    const pileDef = DD.getObject('a3_hoard_pile');
    t.ok(pileDef.autoplay(mage, DD.Grid.tile(5, 6).obj, DD.Grid.tile(5, 6)) >= 10, 'AutoPlay: a guarded pile is worth grabbing');
    t.ok(pileDef.autoplay(mage, DD.Grid.tile(10, 10).obj, DD.Grid.tile(10, 10)) < 10, '...an unguarded one is just gold');
    t.ok(DD.Combat.move(mage, 5, 6), 'the mage walks onto a pile');
    t.ok(!DD.Grid.tile(5, 6).obj && s.sandboxGold === 59, 'pile pocketed: +9 gold');
    t.ok(has(mage, 'a3_thief'), 'and the mage is branded a Thief');
    // thieves take +4, and the bite steals gold into a new pile
    t.ok(A().teleport(mage, 8, 9) && A().teleport(dragon, 8, 8), 'dragon next to the thief');
    let hp = mage.hp;
    act(dragon, 'a3_dragon_bite', mage);
    t.eq(hp - mage.hp, L('a3_dragon_bite').dmg + 4, 'Greedy Bite on a Thief: damage + 4');
    t.eq(s.sandboxGold, 59 - 5, 'and steals 5 gold');
    const piles = s.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'a3_hoard_pile'; });
    t.ok(piles.some(function (tl) { return DD.Grid.dist(tl, dragon) <= 2 && tl.obj.data.gold === 8; }), 'into a new hoard pile next to it (5 stolen + 3)');
    // the bite swoops up to 4 tiles to its target, not further
    t.ok(A().teleport(dragon, mage.x, mage.y - L('a3_dragon_bite').r), 'dragon exactly ' + L('a3_dragon_bite').r + ' tiles away');
    mage.hp = mage.maxHp;
    hp = mage.hp;
    act(dragon, 'a3_dragon_bite', mage);
    t.ok(hp - mage.hp === L('a3_dragon_bite').dmg + 4 && DD.Grid.dist(dragon, mage) === 1, 'the swoop reaches ' + L('a3_dragon_bite').r + ' tiles (as the desc says)');
    t.ok(A().teleport(dragon, 1, 1), 'dragon far away');
    hp = mage.hp;
    t.ok(!act(dragon, 'a3_dragon_bite', mage) && mage.hp === hp && dragon.x === 1 && dragon.y === 1, 'out of swoop range it fizzles');
    // an Invulnerable target keeps its purse: no theft, no new pile
    A().teleport(dragon, mage.x, mage.y - 1);
    const gold0 = s.sandboxGold, piles0 = s.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'a3_hoard_pile'; }).length;
    A().addStatus(mage, 'invulnerable', { turns: 1 });
    hp = mage.hp;
    act(dragon, 'a3_dragon_bite', mage);
    t.ok(mage.hp === hp && s.sandboxGold === gold0 && s.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'a3_hoard_pile'; }).length === piles0,
      'a bite that does not land steals nothing');
    A().removeStatus(mage, 'invulnerable');
    t.ok(/max 15/.test(DD.getEnemy('a3_red_dragon').desc) && /max 15/.test(DD.getObject('a3_hoard_pile').desc), 'the hoard Block cap is in the tooltips');
    t.ok(/9 in range now|\d+ in range now/.test(DD.getEnemy('a3_red_dragon').passive.desc(dragon)), 'the inspect panel counts the piles in range');

    // tail sweep
    quiet({ heroes: [H('test_mage', 4, 3), H('test_rogue', 3, 4)], enemies: [E('a3_red_dragon', 4, 4)] });
    const d3 = one('a3_red_dragon'), [m3, r3] = DD.Combat.heroes();
    hp = m3.hp;
    act(d3, 'a3_dragon_tail', d3);
    t.ok(hp - m3.hp === L('a3_dragon_tail').dmg && m3.y === 2 && r3.x === 2, 'Tail Sweep: damage to adjacent foes, pushed 1');
    // hoard Block shows up in previews exactly
    quiet({ w: 9, h: 9, heroes: [H('test_mage', 2, 4)], enemies: [E('a3_red_dragon', 5, 4)], objects: [{ x: 7, y: 7, id: 'a3_hoard_pile' }] });
    const mg = DD.Combat.heroes()[0], dr = one('a3_red_dragon');
    dr.block = 3;
    const prev = DD.Combat.preview(mg, mg.basic, dr.x, dr.y);
    const before = { hp: dr.hp, block: dr.block };
    DD.Combat.useSkill(mg, mg.basic, dr.x, dr.y);
    t.eq((prev.perUnit[dr.id] || { dmg: 0 }).dmg, before.hp - dr.hp, 'preview vs reality through the hoard Block');
  });

  // =========================================================================================================
  T.suite('enemies_act3: Hoard Breath winds up and lands at the start of the dragon\'s next turn', function (t) {
    const Lb = L('a3_dragon_breath');
    // the planner: a crowd in front → it winds up the breath (no swoop that turn) — the only wind-up it ever makes
    quiet({ w: 11, h: 11, seed: 3, heroes: TEAM.map(function (h, i) { return H(h, 3 + i, 8); }), enemies: [E('a3_red_dragon', 5, 2)] });
    const d4 = one('a3_red_dragon');
    const hp4 = totalHp(DD.Combat.heroes());
    const did = used(d4, function () { DD.AI.act(d4); });
    const br = windup(d4, 'a3_dragon_breath');
    t.ok(!!br && br.anchor === 'ground' && br.tiles.length === 9, 'the dragon winds up a 9-tile ground cone at the party');
    t.ok(did.indexOf('a3_dragon_bite') < 0 && totalHp(DD.Combat.heroes()) >= hp4 - L('a3_dragon_tail').dmg * 4, 'and does not swoop off its mark that turn (' + (did.join(', ') || 'nothing') + ')');
    const ds = DD.AI.describe(d4, br);
    t.ok(ds.windup && ds.dmg === Lb.dmg && /next turn/.test(ds.text), 'the HUD reads it as a wind-up for ' + Lb.dmg + ' at its next turn');

    // it lands on whoever still stands on the marked tiles, friends too; stepping out works; the floor burns
    quiet({ w: 11, h: 11, heroes: [H('test_mage', 5, 7), H('test_rogue', 6, 7), H('test_knight', 1, 1)], enemies: [E('a3_red_dragon', 5, 4), E('a3_kobold_shield', 4, 6)] });
    const d2 = one('a3_red_dragon'), [m2, r2, k2] = DD.Combat.heroes(), kob = one('a3_kobold_shield');
    const it = DD.AI.windUp(d2, 'a3_dragon_breath', { x: 5, y: 5 }, { label: 'Hoard Breath' });
    t.ok(it && it.tiles.length === 9 && keys(it.tiles).indexOf('5,7') >= 0 && keys(it.tiles).indexOf('6,7') >= 0, 'the marked cone covers both heroes');
    const hp0 = [m2.hp, r2.hp, kob.hp];
    t.ok(m2.hp === m2.maxHp, 'nothing happens yet');
    DD.Combat.endTurn();   // the rogue's turn: she steps out of the cone
    t.ok(DD.Combat.current() === r2 && DD.Combat.move(r2, 8, 8), 'the rogue steps out of the red on her turn');
    const r2hp = r2.hp;
    DD.Combat.endRound();
    t.ok(hp0[0] - m2.hp === Lb.dmg && r2.hp === r2hp, 'at the dragon\'s turn start: ' + Lb.dmg + ' fire to the mage who stayed, nothing to the rogue who left');
    t.eq(hp0[2] - Math.max(0, kob.hp), Math.max(1, Math.round(Lb.dmg * 0.5) - 1), 'friends too (kobold: fire 0.5, armor 1)');
    t.ok(DD.Grid.tile(5, 6).surface && DD.Grid.tile(5, 6).surface.id === 'fire', 'the cone burns');
    t.ok(!windup(d2) && k2.hp === k2.maxHp, 'it is spent; the knight far away never was in it');

    // a stun interrupts it at once (and the dragon becomes Unshakeable)
    quiet({ w: 11, h: 11, heroes: [H('test_mage', 5, 7)], enemies: [E('a3_red_dragon', 5, 4)] });
    const d5 = one('a3_red_dragon'), m5 = DD.Combat.heroes()[0];
    DD.AI.windUp(d5, 'a3_dragon_breath', { x: 5, y: 5 }, { label: 'Hoard Breath' });
    let cancelled = 0;
    const off = DD.Events.on('windup:cancel', function (e) { if (e.unit === d5) cancelled++; });
    A().addStatus(d5, 'stun', { turns: 1 }, m5);
    off();
    t.ok(!windup(d5) && cancelled === 1 && has(d5, 'a3_unshakeable'), 'stunned: the breath is interrupted (windup:cancel) and it is Unshakeable');
    DD.Combat.endRound();
    t.eq(m5.hp, m5.maxHp, 'nothing lands');
  });

  // =========================================================================================================
  T.suite('enemies_act3: Death Knight monologues, gets interrupted, calls an intermission', function (t) {
    const Lm = L('a3_dk_monologue');
    function dkFight(heroes, mk) {
      (mk || quiet)({ w: 11, h: 11, heroes: heroes || [H('test_mage', 5, 7), H('test_rogue', 6, 6), H('test_cleric', 9, 9)], enemies: [E('a3_death_knight', 5, 4)] });
      return one('a3_death_knight');
    }
    let dk = dkFight();
    DD.AI.act(dk);
    const mono = windup(dk, 'a3_dk_monologue');
    t.ok(!!mono && mono.anchor === 'self', 'two heroes nearby: he winds up a monologue (it moves with him)');
    t.ok(has(dk, 'a3_monologue'), 'and is Monologuing (shown as a status)');
    t.eq(DD.AI.intentTiles(dk, mono).length, DD.Grid.shape('circle', dk, null, Lm.r).length, 'its area: everything within ' + Lm.r + ' of him');
    // not interrupted: it lands at the start of his next turn
    const [mage, rogue, cleric] = DD.Combat.heroes();
    const near = [mage, rogue].filter(function (h) { return DD.Grid.dist(h, dk) <= Lm.r; });
    const hp = near.map(function (h) { return h.hp; }), chp = cleric.hp;
    A().damage(cleric, dk, Lm.brk - 1 + dk.armor);
    t.ok(!!windup(dk, 'a3_dk_monologue') && st(dk, 'a3_monologue').data.taken === Lm.brk - 1, (Lm.brk - 1) + ' damage (after armor) does not interrupt');
    t.ok(/\b1 more damage/.test(DD.getStatus('a3_monologue').desc(st(dk, 'a3_monologue'))), 'the status counts down what is left: ' + DD.getStatus('a3_monologue').desc(st(dk, 'a3_monologue')));
    DD.Combat.endRound();
    t.ok(near.every(function (h, i) { return hp[i] - h.hp === Lm.dmg; }) && cleric.hp === chp, 'it lands on every foe within ' + Lm.r + ', nobody further');
    t.ok(!has(dk, 'a3_monologue') && !windup(dk, 'a3_dk_monologue'), 'status cleared once it fires');
    t.ok(new RegExp(Lm.dmg + ' damage.*' + Lm.brk + '\\+ damage.*' + Lm.hype + ' Hype').test(DD.skillDesc(DD.getSkill('a3_dk_monologue'), 1, null)), 'desc states damage, threshold and Hype');
    // interrupted by damage: two hits that add up to the threshold (armor counted)
    dk = dkFight();
    DD.AI.act(dk);
    const hype = DD.Combat.state.hype;
    const half = Math.ceil(Lm.brk / 2);
    let cancels = 0;
    const off = DD.Events.on('windup:cancel', function (e) { if (e.unit === dk) cancels++; });
    A().damage(DD.Combat.heroes()[2], dk, half + dk.armor);
    t.ok(!!windup(dk, 'a3_dk_monologue'), half + ' damage: still talking');
    A().damage(DD.Combat.heroes()[2], dk, half + dk.armor);
    off();
    t.ok(!windup(dk, 'a3_dk_monologue') && cancels === 1, Lm.brk + '+ damage interrupts the monologue (windup:cancel)');
    t.ok(!has(dk, 'a3_monologue') && has(dk, 'vulnerable'), 'he is left Vulnerable');
    t.eq(DD.Combat.state.hype - hype, Lm.hype, '+' + Lm.hype + ' Hype for the heckle');
    // a stun or a silence stops it at once, and the status cleans itself up
    ['stun', 'silenced'].forEach(function (sid) {
      dk = dkFight();
      DD.AI.act(dk);
      A().addStatus(dk, sid, { turns: 1 }, DD.Combat.heroes()[0]);
      t.ok(!windup(dk) && !has(dk, 'a3_monologue'), sid + ': the monologue is cancelled at once');
      const hs = DD.Combat.heroes().map(function (h) { return h.hp; });
      DD.Combat.endRound();
      t.ok(DD.Combat.heroes().every(function (h, i) { return h.hp === hs[i]; }), sid + ': no blast at his turn start');
    });
    // real turns: he winds up on his turn, the heroes get theirs, it lands at his next turn start
    dk = dkFight(null, function (cfg) { return live(Object.assign({ initiative: 'enemiesFirst' }, cfg)); });
    t.ok(!!windup(dk, 'a3_dk_monologue') && DD.Combat.current().side === 'hero', 'round 1: he wound up on his turn; now the heroes act');
    t.ok(DD.AI.describe(dk, windup(dk)).dmg === Lm.dmg, 'the wind-up shows ' + Lm.dmg);
    // previews predict an interrupt exactly (Hype included)
    dk = dkFight();
    DD.AI.act(dk);
    st(dk, 'a3_monologue').data.taken = Lm.brk - 2;
    const m = DD.Combat.heroes()[0];
    const before = { hp: dk.hp, hype: DD.Combat.state.hype };
    const prev = DD.Combat.preview(m, m.basic, dk.x, dk.y);
    t.ok(has(dk, 'a3_monologue') && !!windup(dk), 'previewing changed nothing');
    t.ok(DD.Combat.useSkill(m, m.basic, dk.x, dk.y), 'mage bolts him');
    t.eq((prev.perUnit[dk.id] || { dmg: 0 }).dmg, before.hp - dk.hp, 'preview damage == reality');
    t.eq(prev.hype, DD.Combat.state.hype - before.hype, 'preview Hype (interrupt) == reality');
    t.ok(!windup(dk, 'a3_dk_monologue'), 'the 2 extra damage interrupted it');
    // intermission at half HP: two backup dancers when his turn starts, once; they roll in and act from the next round
    dk = dkFight([H('test_mage', 1, 9)]);
    dk.hp = Math.floor(dk.maxHp / 2);
    DD.Combat.endTurn();
    t.eq(units('a3_backup_dancer').length, 2, 'half HP: two Skeletal Backup Dancers take the stage at his turn start');
    t.ok(dk.data.intermission && units('a3_backup_dancer').every(function (u) { return DD.Combat.order().some(function (e) { return e.unitId === u.id; }); }), 'they joined the initiative order');
    DD.Combat.endTurn();
    t.eq(units('a3_backup_dancer').length, 2, 'only once');
    // swing + chain
    quiet({ heroes: [H('test_mage', 5, 4), H('test_rogue', 4, 3)], enemies: [E('a3_death_knight', 4, 4)] });
    const dk2 = one('a3_death_knight'), [m2, r2] = DD.Combat.heroes();
    const h2 = [m2.hp, r2.hp];
    act(dk2, 'a3_dk_cleave', m2);
    t.ok(h2[0] - m2.hp === L('a3_dk_cleave').dmg && r2.hp === h2[1], 'Overly Dramatic Swing hits the target and its sides only');
    quiet({ heroes: [H('test_mage', 8, 4)], enemies: [E('a3_death_knight', 4, 4)] });
    const dk3 = one('a3_death_knight'), m3 = DD.Combat.heroes()[0];
    const h3 = m3.hp;
    act(dk3, 'a3_dk_grip', m3);
    t.ok(h3 - m3.hp === L('a3_dk_grip').dmg && m3.x === 5 && m3.y === 4, 'Come Hither, Darling: frost damage and pulled 3 tiles next to him');
    // the spectral chain needs no line of sight and reaches 6 (but not an adjacent hero)
    quiet({ heroes: [H('test_mage', 5, 4)], enemies: [E('a3_death_knight', 1, 2)], terrain: function (tl) { if (tl.x === 3 && tl.y === 3) tl.t = 'wall'; } });
    const dk4 = one('a3_death_knight'), m4 = DD.Combat.heroes()[0];
    t.ok(!DD.Grid.los(dk4, m4) && DD.Grid.dist(dk4, m4) === 6, 'a wall between them, 6 tiles apart');
    let h4 = m4.hp;
    act(dk4, 'a3_dk_grip', m4);
    t.ok(h4 - m4.hp === L('a3_dk_grip').dmg && DD.Grid.dist(dk4, m4) < 6, 'the chain still grabs and pulls (no line of sight needed)');
    A().teleport(m4, 2, 2);
    h4 = m4.hp;
    t.ok(!act(dk4, 'a3_dk_grip', m4) && m4.hp === h4, 'a hero hugging him is too close to reel in (it fizzles)');
    // yank and swing: nobody in reach → the chain, then a swing at the same hero, on one turn
    quiet({ w: 11, h: 9, heroes: [H('test_mage', 9, 4)], enemies: [E('a3_death_knight', 2, 4)] });
    const dk5 = one('a3_death_knight'), m5 = DD.Combat.heroes()[0];
    const h5 = m5.hp;
    const did = used(dk5, function () { DD.AI.act(dk5); });
    t.eq(did.join(','), 'a3_dk_grip,a3_dk_cleave', 'out of reach: chain then swing (' + did.join(', ') + ')');
    t.ok(h5 - m5.hp === L('a3_dk_grip').dmg + L('a3_dk_cleave').dmg && DD.Grid.dist(dk5, m5) <= 2, 'reeled in, then swung at: ' + (h5 - m5.hp) + ' damage');
  });

  // =========================================================================================================
  T.suite('enemies_act3: Pit Fiend Accountant compounds Infernal Debt', function (t) {
    quiet({ w: 11, h: 11, heroes: [H('test_mage', 5, 7), H('test_rogue', 6, 7), H('test_knight', 1, 1)], enemies: [E('a3_pit_fiend', 5, 3)] });
    const fiend = one('a3_pit_fiend');
    const [mage, rogue] = DD.Combat.heroes();
    let hp = [mage.hp, rogue.hp];
    t.eq(area(fiend, 'a3_fiend_invoice', mage).length, 5, 'Itemized Invoice: a cross of 5 on its target');
    act(fiend, 'a3_fiend_invoice', mage);
    t.ok(hp[0] - mage.hp === L('a3_fiend_invoice').dmg && hp[1] - rogue.hp === L('a3_fiend_invoice').dmg, 'Itemized Invoice: fire on the cross');
    t.ok(st(mage, 'a3_debt').stacks === 2 && st(rogue, 'a3_debt').stacks === 2, 'and 2 Infernal Debt each');
    // interest at each hero's own turn start: lose Debt HP, Debt +1
    hp = [mage.hp, rogue.hp];
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === rogue && hp[1] - rogue.hp === 2 && st(rogue, 'a3_debt').stacks === 3, 'the rogue\'s turn start: loses 2, then the Debt grows to 3');
    t.ok(mage.hp === hp[0] && st(mage, 'a3_debt').stacks === 2, 'the mage pays nothing until her own turn');
    DD.Combat.endRound();
    t.ok(DD.Combat.current() === mage && hp[0] - mage.hp === 2 && st(mage, 'a3_debt').stacks === 3, 'her next turn start: loses 2, Debt 3');
    // paying it off by hitting him (skill hits; a damage-over-time tick credited to the hero is not a payment)
    A().damage(mage, fiend, 6, { cause: 'status', tags: ['poison'] });
    t.eq(st(mage, 'a3_debt').stacks, 3, 'a Poison tick on him pays nothing');
    A().damage(mage, fiend, 6, { cause: 'skill' });
    t.eq(st(mage, 'a3_debt').stacks, 1, 'each hit on the accountant pays off 2');
    A().damage(mage, fiend, 6, { cause: 'skill' });
    t.ok(!has(mage, 'a3_debt'), 'paid in full');
    A().addStatus(rogue, 'a3_debt', { stacks: 9 }, fiend);
    t.eq(st(rogue, 'a3_debt').stacks, 5, 'Debt caps at 5');
    // smack + audit (the line runs perpendicular to the way he faces: from (5,2) both heroes on row 6 are "south")
    quiet({ w: 11, h: 11, heroes: [H('test_mage', 5, 3), H('test_rogue', 2, 6), H('test_cleric', 8, 6), H('test_knight', 9, 9)], enemies: [E('a3_pit_fiend', 5, 2)] });
    const f2 = one('a3_pit_fiend');
    const [m2, r2, c2, k2] = DD.Combat.heroes();
    hp = m2.hp;
    act(f2, 'a3_fiend_smack', m2);
    t.ok(hp - m2.hp === L('a3_fiend_smack').dmg && st(m2, 'a3_debt').stacks === 1, 'Fiscal Smackdown: damage + 1 Debt');
    A().teleport(m2, 0, 0);
    const did = used(f2, function () { DD.AI.act(f2); });
    const audit = windup(f2, 'a3_fiend_audit');
    t.ok(!!audit && audit.anchor === 'ground', 'his turn: he winds up an audit');
    const lineTiles = DD.AI.intentTiles(f2, audit).map(key);
    t.ok(lineTiles.indexOf(key(r2)) >= 0 && lineTiles.indexOf(key(c2)) >= 0, 'on the line holding two heroes (row 6)');
    t.eq(lineTiles.length, 11, 'the whole line across the arena');
    t.ok(did.length === 1 && did[0] !== 'a3_fiend_audit', '...and makes one attack in the same turn (' + did.join(', ') + ')');
    const afterAct = [r2.hp, c2.hp, k2.hp];
    DD.Combat.endRound();
    t.ok([r2, c2].every(function (u, i) { return afterAct[i] - u.hp >= L('a3_fiend_audit').dmg; }), 'the audit hits both heroes on the line at his turn start');
    t.eq(k2.hp, afterAct[2], 'the knight off the line is not audited');
    t.ok([r2, c2].every(function (u) { return st(u, 'a3_debt') && st(u, 'a3_debt').stacks >= 1; }), 'and adds Debt');
    // stepping off the marked line dodges it
    quiet({ w: 11, h: 11, heroes: [H('test_rogue', 2, 6), H('test_cleric', 8, 6)], enemies: [E('a3_pit_fiend', 5, 2)] });
    const f3 = one('a3_pit_fiend'), [r3, c3] = DD.Combat.heroes();
    DD.AI.windUp(f3, 'a3_fiend_audit', { x: 2, y: 6 }, { label: 'Hostile Audit' });
    t.ok(DD.Combat.move(r3, 2, 8), 'the rogue steps off the line on her turn');
    const hp3 = [r3.hp, c3.hp];
    DD.Combat.endRound();
    t.ok(r3.hp === hp3[0] && hp3[1] - c3.hp === L('a3_fiend_audit').dmg, 'only the cleric who stayed gets audited');
    // debts forgiven when he dies
    A().kill(f2, k2);
    t.ok(!DD.Combat.heroes().some(function (h) { return has(h, 'a3_debt'); }), 'his death forgives every debt');
    t.ok(DD.getEnemy('a3_pit_fiend').flags.immovable, 'immovable');
  });

  // =========================================================================================================
  T.suite('enemies_act3: elites shrug off back-to-back stuns (Unshakeable, per own turn)', function (t) {
    ELITES.forEach(function (id) {
      quiet({ heroes: [H('test_mage', 1, 1)], enemies: [E(id, 5, 5)] });
      const e = one(id);
      t.ok(!!A().addStatus(e, 'stun', { turns: 1 }), id + ': the first stun lands');
      t.ok(has(e, 'a3_unshakeable') && st(e, 'a3_unshakeable').turns === 2, id + ': then it is Unshakeable for 2 turns');
      A().removeStatus(e, 'stun');
      t.eq(A().addStatus(e, 'sleep', { turns: 1 }), null, id + ': a second stun-like (sleep) is shrugged off');
      t.eq(A().addStatus(e, 'frozen', { turns: 1 }), null, id + ': so is frozen');
      t.ok(!!A().addStatus(e, 'weak', { turns: 1 }), id + ': other debuffs still land');
      DD.Combat.endRound();
      t.ok(has(e, 'a3_unshakeable') && st(e, 'a3_unshakeable').turns === 1, id + ': one of its turns later: 1 turn left');
      DD.Combat.endRound();
      t.ok(!has(e, 'a3_unshakeable'), id + ': Unshakeable wears off after 2 of its turns');
      t.ok(!!A().addStatus(e, 'stun', { turns: 1 }), id + ': stunnable again');
      A().removeStatus(e, 'stun');
      A().cleanse(e, 'buff');
      t.ok(!!A().addStatus(e, 'stun', { turns: 1 }), id + ': dispelling Unshakeable re-opens the window');
    });
    // so a stun interrupts one wind-up, but the next one inside that window stands
    quiet({ w: 11, h: 11, heroes: [H('test_mage', 5, 7)], enemies: [E('a3_red_dragon', 5, 4)] });
    const d = one('a3_red_dragon');
    DD.AI.windUp(d, 'a3_dragon_breath', { x: 5, y: 5 }, {});
    A().addStatus(d, 'stun', { turns: 1 });
    t.ok(!windup(d), 'the stun interrupted the breath');
    DD.AI.windUp(d, 'a3_dragon_breath', { x: 5, y: 5 }, {});
    t.eq(A().addStatus(d, 'stun', { turns: 1 }), null, 'a second stun is shrugged off');
    t.ok(!!windup(d), '...so the second breath stands: dodge it');
    quiet({ heroes: [H('test_mage', 1, 1)], enemies: [E('a3_hell_hound', 5, 5)] });
    const h = one('a3_hell_hound');
    A().addStatus(h, 'stun', { turns: 1 });
    A().removeStatus(h, 'stun');
    t.ok(!has(h, 'a3_unshakeable') && !!A().addStatus(h, 'stun', { turns: 1 }), 'regular enemies can be stun-locked');
  });

  // =========================================================================================================
  T.suite('enemies_act3: hero previews match reality against act-3 gimmicks', function (t) {
    const cases = [
      { label: 'Shield Wall Block', setup: function () {
        quiet({ heroes: [H('test_mage', 2, 4)], enemies: [E('a3_kobold_shield', 5, 4)] });
        const k = one('a3_kobold_shield'); act(k, 'a3_kobold_wall', k); return k;
      } },
      { label: 'Debt payoff', setup: function () {
        quiet({ heroes: [H('test_mage', 2, 4)], enemies: [E('a3_pit_fiend', 5, 4)] });
        A().addStatus(DD.Combat.heroes()[0], 'a3_debt', { stacks: 3 }, one('a3_pit_fiend')); return one('a3_pit_fiend');
      } },
      { label: 'Thief bolting a dragon', setup: function () {
        quiet({ heroes: [H('test_mage', 2, 4)], enemies: [E('a3_red_dragon', 5, 4)] });
        A().addStatus(DD.Combat.heroes()[0], 'a3_thief', {}); return one('a3_red_dragon');
      } },
      { label: 'charmed by the Life Coach', setup: function () {
        quiet({ heroes: [H('test_mage', 2, 4)], enemies: [E('a3_mind_flayer', 5, 4)] });
        A().addStatus(DD.Combat.heroes()[0], 'charmed', { turns: 1 }, one('a3_mind_flayer')); return one('a3_mind_flayer');
      } },
    ];
    cases.forEach(function (c) {
      const target = c.setup();
      const m = DD.Combat.heroes()[0];
      const prev = DD.Combat.preview(m, m.basic, target.x, target.y);
      const before = { hp: target.hp, block: target.block, debt: (st(m, 'a3_debt') || { stacks: 0 }).stacks, hype: DD.Combat.state.hype };
      t.ok(DD.Combat.useSkill(m, m.basic, target.x, target.y), c.label + ': bolt fired');
      const e = prev.perUnit[target.id] || { dmg: 0, blocked: 0 };
      t.eq(e.dmg, before.hp - target.hp, c.label + ': preview HP damage == reality');
      t.eq(e.blocked || 0, before.block - target.block, c.label + ': preview Block == reality');
      if (c.label === 'Debt payoff') t.eq((st(m, 'a3_debt') || { stacks: 0 }).stacks, before.debt - 2, c.label + ': the hit paid 2 Debt');
    });
    // Spirit Fingers (a rule, not a status): the preview applies the −2 too (a real fight: the first hero acts first)
    const setup = DD.Encounter.build('a3_kobold_pep_rally', ['test_mage', 'test_knight', 'test_cleric', 'test_rogue'], { seed: 'pep-preview', difficulty: 'normal', act: 3 });
    DD.Combat.start(setup, { seed: 5, headless: true, difficulty: 'normal', deploy: false, initiative: 'heroesFirst' });
    const mg = DD.Combat.current();
    t.ok(mg && mg.defId === 'test_mage', 'the mage has the first turn');
    const foe = DD.Combat.enemies().filter(function (u) { return DD.Grid.dist(u, mg) <= 5; })[0] || DD.Combat.enemies()[0];
    A().teleport(foe, mg.x + (mg.x > 1 ? -1 : 1), mg.y) || A().teleport(foe, mg.x, mg.y + (mg.y > 1 ? -1 : 1));
    foe.block = 0;
    const pv = DD.Combat.preview(mg, mg.basic, foe.x, foe.y);
    const fhp = foe.hp;
    t.ok(DD.Combat.useSkill(mg, mg.basic, foe.x, foe.y), 'Spirit Fingers: bolt fired');
    t.eq((pv.perUnit[foe.id] || { dmg: 0 }).dmg, fhp - foe.hp, 'Spirit Fingers: preview == reality (' + (fhp - foe.hp) + ')');
    // an Unshakeable elite: a sleep preview shows no Sleep, and none lands
    quiet({ heroes: [H('test_cleric', 2, 4, { skills: [{ id: 'test_sleep_hymn', level: 1 }] })], enemies: [E('a3_pit_fiend', 5, 4)] });
    const pf = one('a3_pit_fiend'), cl = DD.Combat.heroes()[0];
    A().addStatus(pf, 'a3_unshakeable', { turns: 2 });
    const slot = cl.skills.filter(function (s) { return s.id === 'test_sleep_hymn'; })[0];
    const pv2 = DD.Combat.preview(cl, slot, pf.x, pf.y);
    t.ok(!((pv2.perUnit[pf.id] || {}).statuses || []).some(function (x) { return x === 'sleep'; }), 'the preview knows the sleep will be shrugged off');
    t.ok(DD.Combat.useSkill(cl, slot, pf.x, pf.y) && !has(pf, 'sleep'), '...and it is');
  });

  // =========================================================================================================
  // Every act-3 skill fired (twice: the second time on a resolved / moved / dead target) and every planner run under odd
  // conditions on the user or the board, wind-ups described, then two rounds played with the AI on: no swallowed "Error in".
  T.suite('enemies_act3: skills and planners survive odd conditions', function (t) {
    const before = DD.problems.length;
    const conds = ['none', 'charmed', 'silenced', 'dazzled', 'confused', 'taunt', 'root', 'sheep', 'stun', 'targetDead', 'targetGone', 'stealth', 'edge', 'pits', 'invuln'];
    let runs = 0;
    ENEMIES.forEach(function (id) {
      DD.getEnemy(id).skills.forEach(function (sid) {
        conds.forEach(function (c) {
          const terrain = c === 'pits' ? function (tl) { if ((tl.x + tl.y) % 3 === 0 && !(tl.x === 4 && tl.y === 4)) tl.t = 'pit'; } : null;
          const ex = c === 'edge' ? 0 : 4, ey = c === 'edge' ? 0 : 4;
          quiet({ w: 9, h: 9, gold: 20, terrain: terrain, enemyAi: true, noPlan: true,
            heroes: [H('test_knight', ex + 1, ey), H('test_mage', ex + 2, ey + 1), H('test_rogue', ex, ey + 2), H('test_cleric', 8, 8)],
            enemies: [E(id, ex, ey), E('a3_kobold_shield', 6, 2)], objects: [{ x: 7, y: 7, id: 'a3_hoard_pile' }] });
          const u = one(id), hero = DD.Combat.heroes()[0];
          if (!t.ok(!!u, id + ' spawned (' + c + ')')) return;
          const sk = DD.getSkill(sid), tt = sk.target.type;
          let target = tt === 'self' ? u : tt === 'dir' ? { x: u.x + 1, y: u.y } : tt === 'tile' ? { x: hero.x, y: hero.y } : hero;
          if (tt === 'unit' && DD.Targeting.range(u, sk, 1)[0] >= 2) { A().teleport(DD.Combat.heroes()[1], u.x + 2, u.y + 1); target = DD.Combat.heroes()[1]; }
          const ally = DD.Combat.heroes()[3];
          switch (c) {
            case 'charmed': case 'silenced': case 'dazzled': case 'confused': case 'root': case 'sheep': case 'stun': A().addStatus(u, c, { turns: 1 }, hero); break;
            case 'taunt': A().addStatus(u, 'taunt', { turns: 1 }, ally); break;
            case 'targetDead': if (target && target.hp !== undefined && target !== u) A().kill(target, null); break;
            case 'targetGone': if (target && target.hp !== undefined && target !== u) A().teleport(target, 8, 0); break;
            case 'stealth': DD.Combat.heroes().forEach(function (h) { A().addStatus(h, 'stealth', { turns: 2 }); }); break;
            case 'invuln': DD.Combat.heroes().forEach(function (h) { A().addStatus(h, 'invulnerable', { turns: 2 }); }); break;
          }
          if (SIGNATURE[id] === sid) { DD.AI.windUp(u, sid, target, {}); (u.intents || []).forEach(function (it) { DD.AI.describe(u, it); DD.AI.intentTiles(u, it); }); }
          DD.AI.useNow(u, sid, target, {});
          DD.AI.useNow(u, sid, target, {});
          DD.AI.act(u);
          DD.AI.act(u);
          (u.intents || []).forEach(function (it) { DD.AI.describe(u, it); DD.AI.intentTiles(u, it); });
          DD.AI.reachOf(u);
          DD.Combat.endRound();
          DD.Combat.endRound();
          runs++;
        });
      });
    });
    const errs = warningsSince(before);
    t.eq(errs.length, 0, runs + ' runs without warnings: ' + errs.slice(0, 4).join(' | '));
    // any act-3 enemy can be dropped into a running fight (the DM's Random Encounter cameos them)
    const b2 = DD.problems.length;
    ENEMIES.forEach(function (id) {
      const setup = DD.Encounter.build('a3_hellhound_walkies', TEAM, { seed: 'cameo:' + id, difficulty: 'normal', act: 3 });
      DD.Combat.start(setup, { seed: 3, headless: true, difficulty: 'normal' });
      DD.Combat.rollInitiative();
      const p = DD.Grid.randomEmptyTile(DD.Combat.state.rng);
      const u = A().spawn(id, p.x, p.y);
      t.ok(!!u && DD.Combat.joining().some(function (e) { return e.unitId === u.id; }), id + ' spawned mid-fight and rolled initiative');
      const res = DD.AutoPlay.runBattle(12);
      t.ok(!!res, id + ': the fight plays on');
    });
    t.eq(warningsSince(b2).length, 0, 'cameos without warnings: ' + warningsSince(b2).slice(0, 4).join(' | '));
  });

  // =========================================================================================================
  T.suite('enemies_act3: every encounter builds on 5+ seeds', function (t) {
    ENCOUNTERS.forEach(function (id) {
      const en = DD.getEncounter(id);
      const want = (en.objective || {}).type || 'killAll';
      for (let seed = 1; seed <= 6; seed++) {
        const setup = DD.Encounter.build(en, TEAM, { seed: id + ':' + seed, difficulty: 'normal', act: 3 });
        const label = id + ' seed ' + seed;
        if (!t.ok(setup && setup.grid, label + ': built')) continue;
        const v = DD.MapGen.validate({ grid: setup.grid, heroZone: setup.heroZone, enemyZone: setup.enemyZone }, { layout: !!en.map.layout });
        t.ok(v.ok, label + ': valid map ' + v.problems.slice(0, 2).join('; '));
        t.eq(setup.objective.type, want, label + ': objective ' + want + ' kept');
        t.eq(setup.heroes.length, 4, label + ': 4 heroes placed');
        let lo = 0, hi = 0;
        en.enemies.forEach(function (e) { const n = Array.isArray(e.n) ? e.n : [e.n, e.n]; lo += n[0]; hi += n[1]; });
        t.ok(setup.enemies.length >= lo && setup.enemies.length <= hi, label + ': ' + setup.enemies.length + ' enemies placed');
        const tile = function (p) { return setup.grid.tiles[p.y * setup.grid.w + p.x]; };
        setup.enemies.concat(setup.heroes).forEach(function (p) { t.ok(DD.MapGen.isSafeTile(tile(p)), label + ': unit on a safe tile ' + key(p)); });
        if (want === 'destroy') t.eq(setup.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === en.objective.objId; }).length, en.objective.count, label + ': totems on the map');
        if (want === 'protect') t.eq(setup.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === en.objective.objId; }).length, 1, label + ': the snack bowl is on the map');
        if (id === 'a3_hoarders_lair') t.eq(setup.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'a3_hoard_pile'; }).length, 5, label + ': 5 hoard piles');
      }
    });
    // the Pep Rally rule: totems standing → enemies take 2 less
    const setup = DD.Encounter.build('a3_kobold_pep_rally', TEAM, { seed: 'pep', difficulty: 'normal', act: 3 });
    DD.Combat.start(setup, { seed: 5, headless: true, difficulty: 'normal' });
    const k = DD.Combat.enemies()[0], h = DD.Combat.heroes()[0];
    k.block = 0;
    let hp = k.hp;
    A().damage(h, k, 6 + k.armor);
    t.eq(hp - k.hp, 4, 'Spirit Fingers: 6 → 4 while a totem stands');
    t.ok(DD.Combat.state.grid.tiles.some(function (tl) { return tl.obj && tl.obj.label === 'Pep Rally Totem'; }), 'totems are labelled');
    DD.Combat.state.grid.tiles.forEach(function (tl) { if (tl.obj && tl.obj.id === 'totem') A().removeObject(tl.x, tl.y); });
    hp = k.hp;
    A().damage(h, k, 6 + k.armor);
    t.eq(hp - k.hp, 6, 'no totems: full damage');
  });

  // =========================================================================================================
  T.suite('enemies_act3: objectives and waves work under initiative', function (t) {
    function fight(id, seed, opts) {
      const setup = DD.Encounter.build(id, bandParty(5), { seed: id + ':obj' + seed, difficulty: 'normal', act: 3 });
      return DD.Combat.start(setup, Object.assign({ seed: seed, headless: true, difficulty: 'normal', kind: DD.getEncounter(id).kind }, opts || {}));
    }
    // survive 5 rounds: won at the end of round 5 (the enemies pass: nobody falls), the round-3 imps roll in at round 3
    let s = fight('a3_self_help_seminar', 11, { enemyAi: false });
    t.ok(DD.Combat.isDeploying(), 'the seminar opens in deployment');
    DD.Combat.rollInitiative();
    t.ok(s.round === 1 && !!s.order, 'initiative rolled: round 1');
    const imps0 = units('a3_imp_influencer').length;
    DD.Combat.endRound(); DD.Combat.endRound();
    t.ok(s.round === 3 && units('a3_imp_influencer').length === imps0 + 2, 'round 3: two late imps arrived');
    t.ok(units('a3_imp_influencer').every(function (u) { return s.order.some(function (e) { return e.unitId === u.id; }); }), '...and act this round (arrivals at a round start get an entry at once)');
    for (let i = 0; i < 3 && !s.result; i++) DD.Combat.endRound();
    t.ok(s.result === 'victory' && s.round === 5, 'survived: victory at the end of round 5 (' + s.result + ', round ' + s.round + ')');
    // a reinforcement that acts: Trial by Combat's bailiff hound arrives at round 3 and takes a turn that round
    s = fight('a3_trial_by_combat', 12, { enemyAi: false });
    DD.Combat.rollInitiative();
    DD.Combat.endRound();
    t.eq(units('a3_hell_hound').length, 0, 'no hound before round 3');
    let hTurns = 0;
    const off = DD.Events.on('turn:start', function (e) { if (e.unit.defId === 'a3_hell_hound' && e.round === 3) hTurns++; });
    DD.Combat.endRound(); DD.Combat.endRound();
    off();
    t.ok(units('a3_hell_hound').length === 1 && hTurns === 1, 'round 3: the bailiff\'s hound joined and took its turn that round');
    // destroy: smashing the three totems wins at once, enemies or not
    s = fight('a3_kobold_pep_rally', 13);
    DD.Combat.rollInitiative();
    const totems = s.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'totem'; });
    t.eq(totems.length, 3, 'three totems');
    totems.forEach(function (tl) { if (!s.result) A().destroyObject(tl.x, tl.y, DD.Combat.heroes()[0]); });
    DD.Combat.checkEnd();
    t.ok(s.result === 'victory' && DD.Combat.enemies().length > 0, 'all three down: victory with the kobolds still standing');
    // protect: the hounds go for the bowl on their turn; losing it ends the session
    s = fight('a3_snack_heist', 14, { deploy: false, initiative: 'heroesFirst' });
    const bowl = s.grid.tiles.filter(function (tl) { return tl.obj && tl.obj.id === 'a3_snack_bowl'; })[0];
    t.ok(!!bowl && !s.result, 'the bowl is on the table');
    const hound = DD.Combat.enemies().filter(function (u) { return u.defId === 'a3_hell_hound'; })[0];
    const spot = DD.Grid.emptyTilesNear(bowl.x, bowl.y, 1).filter(function (p) { return DD.Grid.dist(p, bowl) === 1; })[0];
    if (t.ok(!!spot && A().teleport(hound, spot.x, spot.y), 'a hound next to the bowl')) {
      const bhp = bowl.obj.hp;
      DD.AI.act(hound);
      t.ok(!bowl.obj || bowl.obj.hp < bhp, 'on its turn it goes for the cheese puffs (' + bhp + ' → ' + (bowl.obj ? bowl.obj.hp : 'gone') + ')');
    }
    if (bowl.obj) A().destroyObject(bowl.x, bowl.y, hound);
    DD.Combat.checkEnd();
    t.eq(s.result, 'defeat', 'the bowl is gone: the session is over');
  });

  // =========================================================================================================
  T.suite('enemies_act3: no enemy turn one-shots a fresh act-3 hero', function (t) {
    // the frailest fixture hero at the bottom of the act-3 band (level 4) and the biggest single-turn hit of each enemy
    const frail = Math.min.apply(null, TEAM.map(function (id) { const h = DD.getHero(id); return h.stats.hp + h.growth.hp * (BAND[0] - 1); }));
    const top = function (sid) { const Lv = L(sid); return Math.max(Lv.dmg || 0, Lv.crit || 0, Lv.doubles || 0); };
    const turnMax = {
      a3_red_dragon: Math.max(top('a3_dragon_bite'), top('a3_dragon_tail')) + 4,              // one attack a turn (+4 on a Thief)
      a3_death_knight: top('a3_dk_grip') + top('a3_dk_cleave'),                                // yank and swing
      a3_pit_fiend: Math.max(top('a3_fiend_smack'), top('a3_fiend_invoice')) + 1,              // one attack (+ the Debt it adds)
    };
    ENEMIES.forEach(function (id) {
      const max = turnMax[id] || Math.max.apply(null, DD.getEnemy(id).skills.map(function (sid) { return SIGNATURE[id] === sid ? 0 : top(sid); }));
      t.ok(max < frail, id + ': its biggest turn (' + max + ', wind-ups aside) leaves a full-HP level-4 hero standing (' + frail + ' HP)');
    });
    // and nothing lands in round 1 that was not visible: wind-ups need a turn first
    ELITES.forEach(function (id) {
      live({ w: 11, h: 11, initiative: 'enemiesFirst', heroes: TEAM.map(function (h, i) { return H(h, 3 + i, 7, { level: 4 }); }), enemies: [E(id, 5, 3)] });
      const e = one(id), w = windup(e);
      t.ok(!w || DD.Combat.heroes().every(function (h) { return h.hp > 0; }), id + ': round 1 leaves every hero standing' + (w ? ' (its wind-up waits for their turns)' : ''));
    });
  });

  // =========================================================================================================
  /** AutoPlay the fixture party (act-3 band) through an encounter: { result, rounds, taken, byEnemies, timeout, ... }. */
  function sim(id, seed, level) {
    const en = DD.getEncounter(id);
    const setup = DD.Encounter.build(id, bandParty(level), { seed: 'sim:' + seed, difficulty: 'normal', act: 3 });
    DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: en.kind });
    const s = DD.Combat.state;
    const maxHp = DD.Combat.heroes().reduce(function (a, u) { return a + u.maxHp; }, 0);
    const protect = en.objective && en.objective.type === 'protect' ? en.objective.objId : null;
    const objHp = function () { let n = 0; s.grid.tiles.forEach(function (tl) { if (tl.obj && tl.obj.id === protect) n += tl.obj.hp; }); return n; };
    const obj0 = protect ? objHp() : 0;
    const res = DD.AutoPlay.runBattle(30);
    let taken = 0, byEnemies = 0;
    DD.Combat.heroes().forEach(function (u) { taken += (s.stats.units[u.id] || { taken: 0 }).taken; });
    s.units.forEach(function (u) { if (u.side === 'enemy') byEnemies += (s.stats.units[u.id] || { dmg: 0 }).dmg; });
    return { result: res.result, rounds: res.rounds, taken: taken, byEnemies: byEnemies, maxHp: maxHp, timeout: res.timeout,
      downs: s.stats.downs || 0, objLost: protect ? obj0 - objHp() : 0, windups: s.log.filter(function (e) { return /winds up/.test(e.text); }).length };
  }
  T.a3sim = sim;

  function simSuite(kind) {
    return function (t) {
      const n = Math.max(1, +t.param('sims', 3));
      const rng = DD.RNG('a3-sims:' + kind + ':' + t.seed);
      let wins = 0, total = 0;
      ENCOUNTERS.filter(function (id) { return DD.getEncounter(id).kind === kind; }).forEach(function (id) {
        let w = 0, rounds = 0, taken = 0, byEnemies = 0, downs = 0, maxHp = 0, objLost = 0, windups = 0;
        for (let i = 0; i < n; i++) {
          const seed = rng.int(1, 1e9), lvl = BAND[i % BAND.length];
          const r = sim(id, seed, lvl);
          t.ok(!r.timeout, id + ': no timeout (' + r.rounds + ' rounds; seed ' + seed + ', level ' + lvl + ')');
          t.ok(r.rounds >= 2, id + ': not decided in round 1 (seed ' + seed + ')');
          if (r.result === 'victory') w++;
          rounds += r.rounds; taken += r.taken; byEnemies += r.byEnemies; downs += r.downs; maxHp += r.maxHp; objLost += r.objLost; windups += r.windups;
        }
        wins += w; total += n;
        t.log(id + ': won ' + w + '/' + n + ', avg rounds ' + (rounds / n).toFixed(1) + ', avg damage taken ' + Math.round(taken / n) +
          ' (' + Math.round(100 * taken / maxHp) + '% of party HP; ' + Math.round(byEnemies / n) + ' dealt by enemies), downs ' + (downs / n).toFixed(1) +
          (windups ? ', wind-ups ' + (windups / n).toFixed(1) : '') + (objLost ? ', protected object lost ' + Math.round(objLost / n) + ' HP' : ''));
      });
      t.log(kind + ' TOTAL (fixture party, levels ' + BAND.join('-') + '): won ' + wins + '/' + total);
    };
  }
  T.suite('enemies_act3: AutoPlay sims — normal encounters (fixture party L4-6)', simSuite('normal'));
  T.suite('enemies_act3: AutoPlay sims — elite encounters (fixture party L4-6)', simSuite('elite'));

  // Diagnostic (only with ?a3real=1&verbose=1): random parties of REAL heroes at the act-3 band (levels 4-6).
  if (T.params && T.params.a3real) {
    T.suite('enemies_act3: real-hero sims (diagnostic)', function (t) {
      const pool = Object.keys(DD.defs.heroes).filter(function (k) { return !/^test_/.test(k); });
      if (pool.length < 4) { t.skip('fewer than 4 real heroes registered'); return; }
      const n = Math.max(1, +(T.params.sims || 6));
      const rng = DD.RNG('a3-real:' + t.seed);
      ENCOUNTERS.forEach(function (id) {
        const en = DD.getEncounter(id);
        let wins = 0, rounds = 0, taken = 0, maxHp = 0, downs = 0;
        for (let i = 0; i < n; i++) {
          const lvl = BAND[i % BAND.length];
          const party = rng.sample(pool, 4).map(function (hid) {
            const h = DD.getHero(hid);
            const extra = (h.skillPool || []).filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, 2);
            return DD.Combat.makeRunHero({ id: hid, level: lvl, skills: h.startingSkills.concat(extra).map(function (s, k) { return { id: s, level: k < lvl - 3 ? 2 : 1 }; }) });
          });
          const setup = DD.Encounter.build(en, party, { seed: 'real:' + i, difficulty: 'normal', act: 3 });
          DD.Combat.start(setup, { seed: rng.int(1, 1e9), headless: true, difficulty: 'normal', kind: en.kind });
          const s = DD.Combat.state;
          maxHp += DD.Combat.heroes().reduce(function (a, u) { return a + u.maxHp; }, 0);
          const res = DD.AutoPlay.runBattle(30);
          if (res.result === 'victory') wins++;
          rounds += res.rounds; downs += s.stats.downs || 0;
          DD.Combat.heroes().forEach(function (u) { taken += (s.stats.units[u.id] || { taken: 0 }).taken; });
          t.ok(!res.timeout, id + ': no timeout');
        }
        t.log(id + ' (' + en.kind + '): won ' + wins + '/' + n + ', avg rounds ' + (rounds / n).toFixed(1) + ', avg damage taken ' +
          Math.round(taken / n) + ' (' + Math.round(100 * taken / maxHp) + '% of party HP), downs ' + (downs / n).toFixed(1));
      });
    });
  }

  // Debug helper (only with ?a3debug=<encounter id>&bseed=N&verbose=1): one AutoPlay battle, map + condensed log.
  if (T.params && T.params.a3debug) {
    T.suite('enemies_act3: debug battle log', function (t) {
      const id = T.params.a3debug, seed = +(T.params.bseed || 1234), lvl = +(T.params.blevel || 5);
      const party = T.params.bparty ? String(T.params.bparty).split(',').map(function (hid) { return DD.Combat.makeRunHero({ id: hid, level: lvl }); }) : bandParty(lvl);
      const setup = DD.Encounter.build(id, party, { seed: 'sim:' + seed, difficulty: 'normal', act: 3 });
      DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: DD.getEncounter(id).kind });
      const s = DD.Combat.state;
      const rows = [];
      for (let y = 0; y < s.grid.h; y++) {
        let r = '';
        for (let x = 0; x < s.grid.w; x++) {
          const tl = DD.Grid.tile(x, y), u = DD.Grid.unitAt(x, y);
          r += u ? (u.side === 'hero' ? 'H' : 'e') : tl.obj ? 'o' : tl.t === 'pit' ? '_' : tl.t === 'lava' ? '^' : tl.t === 'wall' ? '#' : String(tl.h);
        }
        rows.push(r);
      }
      t.log('MAP ' + rows.join(' / '));
      const res = DD.AutoPlay.runBattle(30);
      t.log('ORDER ' + (s.order || []).map(function (e) { const u = DD.Combat.byId(e.unitId); return (u ? u.name : '?') + ' ' + e.total; }).join(' · '));
      t.log('RESULT ' + res.result + ' in ' + res.rounds + ' rounds; taken ' + DD.Combat.heroes().map(function (u) {
        return u.name + ' ' + JSON.stringify(s.stats.units[u.id] || null) + ' hp ' + u.hp + '/' + u.maxHp;
      }).join(', '));
      const byRound = {};
      s.log.forEach(function (e) { if (e.cls !== 'narrator') (byRound[e.round] = byRound[e.round] || []).push(e.text); });
      Object.keys(byRound).forEach(function (r) { t.log('R' + r + ': ' + byRound[r].join(' ¦ ')); });
    });
  }
})();
