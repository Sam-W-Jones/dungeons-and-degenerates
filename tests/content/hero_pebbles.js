/* Dungeons and Degenerates — tests/content/hero_pebbles.js
 * Suites "hero_pebbles: …" for js/data/heroes/pebbles.js (v2: initiative turns, no telegraphs, no Guard, attacks of
 * opportunity): registry data, texts and barks (he/him, simplicity), the sprite, the Hot Dog passive (fireproof; cosy in
 * fire), every skill at every level in sandbox fights (desc == effect: damage, Burn, statuses for exactly the right own
 * turns, displacement into pits / lava / water / walls / map edges, surfaces, costs, cooldowns, ranges), combos with the
 * party, the signature, the items, previews against reality, attacks of opportunity (walking off a foe provokes, his
 * dashes don't, foes walking off him get bitten), v2 edge cases (stunned / silenced / sheep / charmed Pebbles, targets
 * dying mid-skill, AP, turn order) and AutoPlay battles at levels 1 / 3 / 5.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  const POOL = ['peb_zoomies', 'peb_fetch', 'peb_chew_toy', 'peb_wag', 'peb_bork', 'peb_support', 'peb_this_is_fine', 'peb_bbq', 'peb_puppy_eyes'];
  const ALL = POOL.concat(['peb_basic', 'peb_signature']);
  const ITEMS = ['peb_extinguisher', 'peb_dog_bed', 'peb_collar'];
  const BARK_KEYS = ['select', 'start', 'move', 'kill', 'hurt', 'lowhp', 'downed', 'revive', 'ally_down', 'levelup', 'victory', 'idle', 'signature'];
  const FEM = /\b(she|her|hers|herself)\b/i;
  const SHE_HEROES = /\b(Ellaria|Sparrow|Kiri)\b/;

  // ---- helpers ------------------------------------------------------------------------------------------
  function sk(id) { return DD.getSkill(id); }
  function L(id, lv) { return DD.skillLevel(sk(id), lv); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function stacks(u, id) { const st = DD.Act.getStatus(u, id); return st ? st.stacks : 0; }
  function at(x, y) { return DD.Grid.unitAt(x, y); }
  function surf(x, y) { const tl = DD.Grid.tile(x, y); return tl && tl.surface ? tl.surface.id : null; }
  function surfTurns(x, y) { const tl = DD.Grid.tile(x, y); return tl && tl.surface ? tl.surface.turns : 0; }
  function hype() { return (DD.Balance && DD.Balance.hype) || { kill: 8, envKill: 20, multiHit: 4 }; }
  /** Hype gained == want, or ≥ want while the balance knobs also trickle Hype from damage dealt / taken. */
  function hypeIs(t, got, want, label) {
    if ((hype().dealtPer || 0) > 0 || (hype().takenPer || 0) > 0) t.ok(got >= want, label + ' (≥ ' + want + ', got ' + got + ')');
    else t.eq(got, want, label);
  }
  /** Terrain map for sandboxes: { 'x,y': terrainId | { t, h } }. */
  function terr(map) {
    return function (tl) {
      const v = map[tl.x + ',' + tl.y];
      if (!v) return;
      if (typeof v === 'string') tl.t = v; else Object.assign(tl, v);
    };
  }
  function E(x, y, id, hpMult) { return { id: id || 'test_grunt', x: x, y: y, hpMult: hpMult }; }

  /**
   * Sandbox with Pebbles at cfg.at (default 1,4) on a 9×9 floor; heroes first in the listed order (Pebbles, then
   * cfg.heroes), enemies pass unless cfg.ai. cfg: { at, level, skills: [[id, lv]], items, hp, enemies, heroes, terrain
   * (map), objects, surfaces, w, h, seed, ai }. Returns { s, p, slot(id), foes }.
   */
  function arena(cfg) {
    cfg = cfg || {};
    const pos = cfg.at || [1, 4];
    const skills = (cfg.skills || []).map(function (e) { return { id: e[0], level: e[1] || 1 }; });
    const heroes = [{ id: 'pebbles', x: pos[0], y: pos[1], level: cfg.level || 1, skills: skills, items: cfg.items || [], hp: cfg.hp }]
      .concat(cfg.heroes || []);
    const s = DD.Combat.sandbox({
      w: cfg.w || 9, h: cfg.h || 9, seed: cfg.seed || 7, enemyAi: !!cfg.ai,
      objective: { type: 'custom', text: 'Pebbles test' }, encounter: { id: 'peb_test_arena', checkObjective: function () { return null; } },
      heroes: heroes, enemies: cfg.enemies || [], terrain: cfg.terrain ? terr(cfg.terrain) : undefined, objects: cfg.objects, surfaces: cfg.surfaces,
    });
    const p = s.units.filter(function (u) { return u.defId === 'pebbles'; })[0];
    return {
      s: s, p: p,
      slot: function (id) { return DD.Combat.slotsOf(p).filter(function (sl) { return sl.id === id; })[0]; },
      foes: s.units.filter(function (u) { return u.side === 'enemy'; }),
    };
  }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0]; }

  /** Use a slot for real (canUse + valid target), failing the test with the reason otherwise. */
  function use(t, u, slot, x, y, label) {
    const ok = DD.Combat.canUse(u, slot);
    if (ok !== true) { t.fail((label || (slot && slot.id)) + ': canUse says ' + ok); return false; }
    const r = DD.Combat.useSkill(u, slot, x, y);
    if (!r) t.fail((label || slot.id) + ': useSkill refused target ' + x + ',' + y);
    return r;
  }
  function valid(u, slot, x, y) { return DD.Targeting.isValidTarget(u, slot, x, y); }

  function hpMap(s) { const m = {}; s.units.forEach(function (u) { m[u.id] = { hp: u.hp, dead: !!u.dead, downed: !!u.downed }; }); return m; }
  function previewProblems(prev, s, before) {
    if (prev.uncertain) return ['the preview is uncertain (Pebbles rolls no dice)'];
    const out = [];
    s.units.forEach(function (u) {
      const b = before[u.id];
      if (!b || b.dead) return;
      const e = prev.perUnit[u.id];
      const real = b.hp - u.hp, said = e ? (e.dmg || 0) - (e.heal || 0) : 0;
      if (real !== said) out.push(u.name + ': real HP change ' + (-real) + ', preview ' + (-said));
      const down = (u.dead && !b.dead) || (u.downed && !b.downed);
      if (down !== !!(e && e.lethal)) out.push(u.name + ': lethal mismatch');
      const moved = e && e.moved ? e.moved.x + ',' + e.moved.y : null;
      if (moved && moved !== u.x + ',' + u.y && !u.dead) out.push(u.name + ': preview moved it to ' + moved + ', it is at ' + u.x + ',' + u.y);
    });
    return out;
  }
  function stateKey(s) {
    return JSON.stringify([s.units.map(function (u) {
      return [u.id, u.x, u.y, u.hp, u.block, u.ap, !!u.dead, (u.statuses || []).map(function (st) { return [st.id, st.stacks, st.turns]; }),
        DD.Combat.slotsOf(u).map(function (sl) { return [sl.id, sl.cd, sl.uses]; }), u.data];
    }), s.grid.tiles.map(function (tl) { return [tl.t, tl.surface && [tl.surface.id, tl.surface.turns], tl.obj && tl.obj.hp]; }), s.hype, s.rng.getState(), s.log.length]);
  }
  /** Preview, then use: the preview must leave the fight untouched and predict HP, downs, moves and Hype exactly. */
  function previewThenUse(t, u, slot, x, y, label) {
    const s = DD.Combat.state;
    const k0 = stateKey(s);
    const prev = DD.Combat.preview(u, slot, x, y);
    t.eq(stateKey(s), k0, label + ': preview leaves the fight untouched');
    const before = hpMap(s);
    const hype0 = s.hype;
    use(t, u, slot, x, y, label);
    previewProblems(prev, s, before).forEach(function (m) { t.fail(label + ': preview ≠ reality: ' + m); });
    t.eq(s.hype - hype0, prev.hype, label + ': preview Hype matches');
    return prev;
  }
  /** Call fn(e) at each turn:start of a unit matching pred while body() runs. */
  function onTurns(pred, fn, body) {
    const off = DD.Events.on('turn:start', function (e) { if (pred(e.unit)) fn(e); });
    try { body(); } finally { off(); }
  }
  function textsOf(id) {
    const d = sk(id), out = [d.flavor || ''];
    for (let lv = 1; lv <= d.levels.length; lv++) out.push(DD.skillDesc(d, lv, null));
    return out;
  }
  function cdReason(u, slot) { return /cooldown/i.test(String(DD.Combat.canUse(u, slot))); }

  // ---- registry & data --------------------------------------------------------------------------------------
  T.suite('hero_pebbles: registry, identity, numbers, descriptions and barks', function (t) {
    const h = DD.getHero('pebbles');
    t.ok(!!h, 'hero registered');
    if (!h) return;
    t.eq(h.name, 'Pebbles', 'name');
    t.ok(h.epithet && h.race && h.cls && h.role && h.blurb.length > 60, 'identity + blurb');
    t.ok(h.complexity >= 1 && h.complexity <= 3 && /^#[0-9a-f]{6}$/i.test(h.color), 'complexity + colour');
    t.eq(h.unlock, null, 'available from the start (unlock: null, DESIGN v2)');
    t.eq(JSON.stringify(h.stats), JSON.stringify({ hp: 26, ap: 3, mov: 5, armor: 0, init: 3 }), 'L1 stats: 26 HP, 3 AP, move 5, initiative +3 (DESIGN brief)');
    t.eq(h.growth.hp, 4, 'growth +4 HP per level');
    t.eq(JSON.stringify(h.startingSkills), JSON.stringify(['peb_zoomies', 'peb_fetch']), 'starting skills: Hot Zoomies + Fetch Quest (zoomies and fetch)');
    t.eq(JSON.stringify(h.skillPool), JSON.stringify(POOL), 'pool of 9 (DESIGN v2: 8-10 besides basic and signature)');
    t.ok(h.skillPool.indexOf(h.basic) < 0 && h.skillPool.indexOf(h.signature) < 0, 'basic/signature not in pool');
    t.eq(JSON.stringify(h.summons || []), '[]', 'no summons');
    t.eq(sk(h.signature).hype, 100, 'signature costs 100 Hype');
    const b = L(h.basic, 1);
    t.ok(b.dmg >= 4 && b.dmg <= 6 && sk(h.basic).ap === 1 && !sk(h.basic).cooldown, 'basic: 1 AP, 4-6 damage, no cooldown');
    t.eq(JSON.stringify(sk(h.basic).target.range), '[1,1]', 'basic is melee (so it is his attack of opportunity)');
    t.ok(h.passive && h.passive.name === 'Hot Dog' && /fire/.test(h.passive.desc) && /lava/.test(h.passive.desc), 'passive Hot Dog (fire, lava)');
    t.eq(h.resist && h.resist.fire, 0, 'immune to fire damage (resist fire 0)');
    t.ok(h.flags && Array.isArray(h.flags.immune) && h.flags.immune.indexOf('burn') >= 0, 'immune to Burn');
    const aps = {};
    let words = 0;
    ALL.forEach(function (id) {
      const d = sk(id);
      t.ok(!!d, id + ' registered');
      if (!d) return;
      t.eq(d.owner, 'pebbles', id + ' owner');
      t.ok(typeof d.icon === 'string' && d.icon.length > 0 && d.icon.length <= 3, id + ' one emoji icon');
      t.ok(d.kind !== 'spell', id + ' is not a spell (a dog does not cast)');
      if (POOL.indexOf(id) >= 0) { t.eq(d.levels.length, 3, id + ' has 3 levels'); aps[d.ap] = 1; }
      for (let lv = 1; lv <= d.levels.length; lv++) {
        const txt = DD.skillDesc(d, lv, null);
        t.ok(txt && !/undefined|NaN|\[object/.test(txt), id + ' L' + lv + ' desc with a null user');
        const Lv = DD.skillLevel(d, lv);
        ['dmg', 'burn', 'len', 'push', 'pull', 'range', 'heal', 'r', 'turns'].forEach(function (k) {
          if (typeof Lv[k] === 'number' && Lv[k] > 0) t.ok(new RegExp('(^|[^0-9])' + Lv[k] + '([^0-9]|$)').test(txt), id + ' L' + lv + ' desc shows ' + k + ' ' + Lv[k]);
        });
        // DESIGN §6 Simplicity: one verb, read in one breath, no if/else clauses
        const n = txt.split(/\s+/).length;
        words = Math.max(words, n);
        // (review v2: ≤ 18 words; the signature, damage + a party-wide rider, ≤ 22)
        const cap = id === 'peb_signature' ? 22 : 18;
        t.ok(n <= cap, id + ' L' + lv + ' desc reads in one breath (' + n + ' ≤ ' + cap + ' words): ' + txt);
        t.ok(!/\bif\b|\bunless\b|\botherwise\b/i.test(txt), id + ' L' + lv + ' desc has no conditions: ' + txt);
        t.ok(!/telegraph|intent|guard|\bxp\b/i.test(txt), id + ' L' + lv + ' desc has no v1 words: ' + txt);
      }
      t.ok(!d.flavor || d.flavor.length <= 120, id + ' flavor ≤ 120');
    });
    t.log('longest desc: ' + words + ' words');
    t.ok(aps[1] && aps[2], 'pool mixes 1 and 2 AP skills');
    t.ok(POOL.some(function (id) { return DD.Combat.cooldownOf(null, sk(id), 1) >= 3; }), 'a long-cooldown skill');
    // Ellaria asked for names that don't collide with hers (Zoomies, Fetch!, Who's a Good Boy?)
    const names = ALL.map(function (id) { return sk(id).name; });
    ['Zoomies', 'Fetch!', 'Who\'s a Good Boy?'].forEach(function (n) { t.ok(names.indexOf(n) < 0, 'no skill named "' + n + '" (Ellaria has one)'); });
    // levels differ visibly (desc, cost, cooldown, range)
    POOL.forEach(function (id) {
      const face = [1, 2, 3].map(function (lv) {
        const d = sk(id), Lv = DD.skillLevel(d, lv);
        return JSON.stringify([DD.skillDesc(d, lv, null), DD.resolve(d.ap, Lv, null, 1), DD.resolve(d.cooldown, Lv, null, 0), DD.resolve(d.target.range, Lv, null, null)]);
      });
      t.ok(face[0] !== face[1] && face[1] !== face[2], id + ': every level looks different');
    });
    // barks: every key 4-6 lines of ≤ 70 characters, in his voice
    BARK_KEYS.concat(['opportunity']).forEach(function (k) {
      const lines = h.barks[k] || [];
      t.ok(lines.length >= 4 && lines.length <= 6, 'barks.' + k + ' has 4-6 lines (' + lines.length + ')');
      lines.forEach(function (line) {
        t.ok(typeof line === 'string' && line.length > 0 && line.length <= 70, 'bark ≤ 70 chars: ' + JSON.stringify(line));
        // no removed v1 mechanics in his voice either (review v2: "I'll guard!" read like the old Guard action)
        t.ok(!/\bguard|intent|telegraph|\bxp\b/i.test(line), 'bark names no v1 mechanic: ' + JSON.stringify(line));
        // she/her only about the heroes who are she/her (Ellaria, Sparrow, Kiri); Pebbles himself is he/him
        if (FEM.test(line)) t.ok(SHE_HEROES.test(line), 'she/her only for Ellaria / Sparrow / Kiri: ' + JSON.stringify(line));
      });
    });
    t.ok(h.barks.move.indexOf('SQUIRREL!') >= 0, 'SQUIRREL!');
    // pronouns: he/him in everything written about him
    const about = [h.blurb, h.passive.desc];
    ALL.forEach(function (id) { Array.prototype.push.apply(about, textsOf(id)); });
    ITEMS.forEach(function (id) { const it = DD.getItem(id); if (it) about.push(it.desc, it.flavor); });
    about.forEach(function (txt) { t.ok(!FEM.test(txt), 'he/him, never she/her: ' + JSON.stringify(txt)); });
    t.ok(/\bHe\b/.test(h.blurb) && /\bhe\b/.test(h.blurb), 'the blurb says "he"');
    // content he owns
    const items = Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k]; }).filter(function (it) { return it.hero === 'pebbles'; });
    t.eq(items.length, 3, 'three hero items');
    t.ok(items.some(function (it) { return it.rarity === 'rare'; }) && items.some(function (it) { return it.rarity === 'legendary'; }), 'a rare and a legendary item');
    t.ok(Object.keys(DD.defs.skills).filter(function (k) { return k.indexOf('peb_') === 0; }).length === ALL.length, 'every peb_ skill is his (no strays)');
  });

  T.suite('hero_pebbles: sprite and portrait', function (t) {
    const h = DD.getHero('pebbles');
    const probs = T.contentHelpers && T.contentHelpers.spriteProblems ? T.contentHelpers.spriteProblems(h.sprite) : [];
    t.eq(probs.length, 0, 'SpriteSpec valid: ' + probs.join(', '));
    t.ok(h.sprite.base === 'quadruped' && h.sprite.aura && h.sprite.aura.kind === 'glow', 'a glowing quadruped (his flames are drawn by the overlay, so his legs stay visible)');
    t.ok(h.sprite.head.eyes === 'big' && h.sprite.head.mouth === 'smile' && h.sprite.shape.snout === 'long', 'a happy dog face: big eyes, smile, long snout');
    t.ok((h.sprite.extras || []).indexOf('collar') >= 0, 'collar (with the PEBBLES tag in the overlay)');
    t.ok(typeof h.sprite.overlay === 'function' && typeof h.sprite.underlay === 'function', 'overlay (flame mane, ears, tail, tag) + underlay (firelight)');
    const p0 = DD.problems.length;
    const cv = document.createElement('canvas');
    cv.width = 200; cv.height = 200;
    const ctx = cv.getContext('2d');
    ['idle', 'attack', 'cast', 'hurt', 'downed'].forEach(function (pose) {
      [1, -1].forEach(function (facing) {
        t.tryRun('draw ' + pose + ' ' + facing, function () { DD.Sprites.draw(ctx, h.sprite, 100, 160, 2, { t: 1.3, pose: pose, facing: facing }); });
      });
    });
    t.tryRun('draw walking + Burning tint', function () { DD.Sprites.draw(ctx, h.sprite, 100, 160, 2, { t: 2.1, walk: 0.3, statuses: ['burn', 'wet'] }); });
    const port = DD.Sprites.portrait('pebbles', 64);
    t.ok(port && port.width === 64, 'portrait renders at 64 px');
    const px = port.getContext('2d').getImageData(0, 0, 64, 64).data;
    let opaque = 0, warm = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 200) opaque++;
      if (px[i + 3] > 200 && px[i] > 200 && px[i + 1] > 90 && px[i + 2] < 120) warm++;
    }
    t.ok(opaque > 1000, 'portrait is not blank (' + opaque + ' opaque px)');
    t.ok(warm > 150, 'portrait is fiery orange-yellow (' + warm + ' warm px)');
    t.eq(DD.problems.slice(p0).length, 0, 'no sprite warnings: ' + DD.problems.slice(p0).join(' | '));
  });

  // ---- passive -------------------------------------------------------------------------------------------------------
  T.suite('hero_pebbles: Hot Dog — fire can\'t hurt him; ending his turn on fire or lava heals him', function (t) {
    const a = arena({ at: [4, 4], enemies: [E(5, 4), E(4, 6), E(8, 8)], heroes: [{ id: 'test_mage', x: 1, y: 4, skills: [{ id: 'test_fireball', level: 1 }] }] });
    const p = a.p, g = a.foes[0], g2 = a.foes[1];
    t.eq(p.resist && p.resist.fire, 0, 'the unit carries the fire immunity');
    t.eq(DD.Act.damage(g, p, 9, { element: 'fire' }), 0, 'fire damage: nothing');
    t.eq(p.hp, 26, 'unhurt');
    t.ok(!DD.Act.addStatus(p, 'burn', { stacks: 4 }, g) && !has(p, 'burn'), 'Burn is refused');
    t.eq(DD.Act.damage(g, p, 3, {}), 3, 'a plain stab still hurts');
    t.eq(DD.Act.damage(g, p, 2, { element: 'frost' }), 2, 'so does frost');
    p.hp = 26;
    // a fire explosion next to him: the grunt in it takes 8, he takes nothing
    DD.Act.explode(null, 4, 5, { radius: 1, dmg: 8 });
    t.ok(p.hp === 26 && g2.hp === 14 - 8, 'an explosion (fire) hurts the grunt, not him');
    // the party's fire on top of him: the mage's Fire Fixture (hurts allies too) centred on his tile
    DD.Combat.endTurn();
    const mage = DD.Combat.current();
    t.eq(mage && mage.defId, 'test_mage', 'the mage acts next');
    use(t, mage, slotOf(mage, 'test_fireball'), 4, 4, 'Fire Fixture on Pebbles');
    t.ok(p.hp === 26 && g.hp === 14 - 6, 'Fire Fixture on his tile: Pebbles 0, the adjacent grunt 5 + 1 (' + g.hp + ')');
    // lava: walk in, stay, come out cosy
    const l = arena({ at: [1, 4], hp: 18, terrain: { '2,4': 'lava' }, enemies: [E(8, 8)] });
    t.ok(DD.Combat.move(l.p, 2, 4), 'he walks into lava');
    t.ok(l.p.x === 2 && l.p.hp === 18 && !has(l.p, 'burn'), 'lava on entry: no damage, no Burn');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === l.p && l.p.hp === 18 + 3, 'ending his turn on lava: +3 HP, and no lava damage (' + l.p.hp + ')');
    // fire surface: walk in, stay — heal at his turn end; one more turn there (stunned, the turn passes) heals again
    const f = arena({ at: [1, 4], hp: 12, surfaces: [{ x: 2, y: 4, id: 'fire', turns: 3 }], enemies: [E(8, 8)] });
    DD.Combat.move(f.p, 2, 4);
    t.ok(!has(f.p, 'burn') && f.p.hp === 12, 'into fire: no Burn');
    DD.Act.addStatus(f.p, 'stun', { turns: 1 }, f.foes[0]);
    const hpAt = {};
    onTurns(function (u) { return u === f.foes[0]; }, function (e) { hpAt[e.round] = f.p.hp; }, function () { DD.Combat.endTurn(); });
    t.eq(hpAt[1], 15, 'round 1: he ended his turn in fire, +3');
    t.eq(DD.Combat.state.round, 3, 'his stunned round-2 turn passed by itself');
    t.eq(hpAt[2], 18, 'and that turn ended in fire too: +3 more');
    t.eq(f.p.hp, 18, 'round 3: 18 HP');
    // not in fire: no heal; full HP: nothing to heal
    const n = arena({ at: [1, 4], hp: 12, enemies: [E(8, 8)] });
    DD.Combat.endTurn();
    t.eq(n.p.hp, 12, 'out of the fire: no heal');
    t.eq(DD.Pebbles.COZY_HEAL, 3, 'the passive\'s number is 3 (desc: "heals him 3 HP")');
    t.ok(/heals him 3 HP/.test(DD.getHero('pebbles').passive.desc), 'passive desc says 3');
    // enemy estimates know he is fireproof (the AI does not waste fire on him)
    t.eq(DD.AI.estimate(g, p, 10, 'fire'), 0, 'AI.estimate: fire vs Pebbles = 0');
  });

  // ---- basic ------------------------------------------------------------------------------------------------------
  T.suite('hero_pebbles: Spicy Nibble (basic) — 4 damage + Burn 1, three times a turn', function (t) {
    const a = arena({ at: [1, 4], enemies: [E(2, 4), E(1, 6)], heroes: [{ id: 'test_knight', x: 1, y: 3 }] });
    const p = a.p, g = a.foes[0], far = a.foes[1];
    t.ok(valid(p, p.basic, 2, 4) && !valid(p, p.basic, 1, 6), 'adjacent only');
    t.ok(!valid(p, p.basic, 1, 3), 'not at allies');
    use(t, p, p.basic, 2, 4, 'nibble 1');
    t.ok(g.hp === 10 && stacks(g, 'burn') === 1, '4 damage and Burn 1');
    t.eq(p.ap, 2, 'costs 1 AP');
    use(t, p, p.basic, 2, 4, 'nibble 2');
    use(t, p, p.basic, 2, 4, 'nibble 3');
    t.ok(g.hp === 2 && stacks(g, 'burn') === 3, 'three nibbles: 12 damage, Burn 3 (stacks add)');
    t.eq(DD.Combat.canUse(p, p.basic), 'Not enough AP.', 'then he is out of AP');
    DD.Combat.endRound();
    t.ok(g.dead && far.hp === 14, 'the Burn 3 ticks at the end of its turn: the grunt burns down (2 HP)');
    // Burn 1 ticks once and is gone
    const b = arena({ at: [1, 4], enemies: [E(2, 4)] });
    use(t, b.p, b.p.basic, 2, 4, 'single nibble');
    DD.Combat.endTurn();
    t.ok(b.foes[0].hp === 9 && !has(b.foes[0], 'burn'), 'Burn 1: 1 fire damage at the end of its turn, then gone');
    // Wet foes don't Burn (Ellaria's water is the anti-synergy)
    const w = arena({ at: [1, 4], enemies: [E(2, 4)] });
    DD.Act.addStatus(w.foes[0], 'wet', { turns: 2 }, null);
    use(t, w.p, w.p.basic, 2, 4, 'wet nibble');
    t.ok(w.foes[0].hp === 10 && !has(w.foes[0], 'burn'), 'a Wet foe takes the bite but does not Burn');
    // a kill is his (+kill Hype)
    const k = arena({ at: [1, 4], enemies: [E(2, 4), E(8, 8)] });
    k.foes[0].hp = 4;
    const h0 = DD.Combat.state.hype;
    use(t, k.p, k.p.basic, 2, 4, 'lethal nibble');
    t.ok(k.foes[0].dead, 'the target died mid-skill (no Burn on a corpse, no error)');
    hypeIs(t, DD.Combat.state.hype - h0, hype().kill, 'kill Hype');
  });

  // ---- attacks of opportunity ----------------------------------------------------------------------------------------
  T.suite('hero_pebbles: attacks of opportunity — walking off a foe provokes, his dashes and pulls don\'t, foes that walk off him get bitten', function (t) {
    // 1. he walks away from an adjacent grunt: it strikes once
    const a = arena({ at: [3, 4], skills: [['peb_zoomies', 1]], enemies: [E(4, 4)] });
    const p = a.p, g = a.foes[0];
    const e = DD.Combat.reachable(p).get('1,4');
    t.ok(e && e.provokes && e.provokes.indexOf(g.id) >= 0, 'the move preview knows the grunt would strike');
    t.eq(DD.Combat.provokes(p, 1, 4).length, 1, 'Combat.provokes: one attack of opportunity');
    t.ok(DD.Combat.move(p, 1, 4), 'he walks off');
    t.ok(p.x === 1 && p.hp === 26 - 4, 'the grunt stabbed him for 4 as he left (' + p.hp + ')');
    // 2. Hot Zoomies off the same grunt: a dash never provokes
    const z = arena({ at: [3, 4], skills: [['peb_zoomies', 1]], enemies: [E(4, 4)] });
    let struck = 0;
    const off = DD.Events.on('opportunity:attack', function () { struck++; });
    try { use(t, z.p, z.slot('peb_zoomies'), 1, 4, 'zoom off the grunt'); } finally { off(); }
    t.ok(z.p.x === 1 && z.p.hp === 26 && struck === 0, 'zoomies: no attack of opportunity');
    // a teleport off a foe (a wild surge, an ally's swap) never provokes either
    const tp = arena({ at: [3, 4], enemies: [E(4, 4)] });
    DD.Act.teleport(tp.p, 1, 6);
    t.ok(tp.p.x === 1 && tp.p.hp === 26 && tp.foes[0].oppRound !== DD.Combat.state.round, 'teleported off the grunt: no attack of opportunity');
    // 3. a grunt walks off him: Spicy Nibble for free (Burn included), at most once per round
    const b = arena({ at: [3, 4], enemies: [E(4, 4)] });
    const bg = b.foes[0];
    DD.AI.moveTo(bg, 7, 4);
    t.ok(bg.x !== 4 && bg.hp === 10 && stacks(bg, 'burn') === 1, 'it walks away and gets nibbled: 4 + Burn 1');
    t.eq(b.p.ap, 3, 'free: no AP');
    DD.Act.teleport(bg, 4, 4);
    DD.AI.moveTo(bg, 7, 4);
    t.eq(bg.hp, 10, 'only once per round');
    // 4. incapacitated Pebbles makes none
    ['stun', 'sleep', 'sheep'].forEach(function (id) {
      const c = arena({ at: [3, 4], enemies: [E(4, 4)] });
      DD.Act.addStatus(c.p, id, { turns: 1 }, c.foes[0]);
      DD.AI.moveTo(c.foes[0], 7, 4);
      t.eq(c.foes[0].hp, 14, id + ': no attack of opportunity');
    });
    // 5. pulls never provoke: Fetch Quest drags a grunt off the knight, the knight doesn't swing
    const f = arena({ at: [1, 4], skills: [['peb_fetch', 1]], enemies: [E(5, 4)], heroes: [{ id: 'test_knight', x: 5, y: 3 }] });
    const knight = at(5, 3);
    use(t, f.p, f.slot('peb_fetch'), 5, 4, 'fetch off the knight');
    t.ok(f.foes[0].x === 3 && f.foes[0].hp === 11 && knight.oppRound !== DD.Combat.state.round, 'pulled 2 tiles off the knight: no swing, just the fetch damage');
    // 6. holding the line: a grunt next to Pebbles keeps biting Pebbles instead of walking to the wounded mage
    const hl = arena({ at: [3, 4], ai: true, enemies: [E(4, 4)], heroes: [{ id: 'test_mage', x: 6, y: 6 }] });
    const mage = at(6, 6);
    mage.hp = 9;
    DD.Combat.endRound();
    t.ok(mage.hp === 9 && hl.p.hp === 26 - 4, 'the engaged grunt stabs Pebbles (' + hl.p.hp + ') and leaves the mage alone (' + mage.hp + ')');
  });

  // ---- pool skills ----------------------------------------------------------------------------------------------------
  T.suite('hero_pebbles: Hot Zoomies I-III — a dash along any path that leaves fire on every tile he leaves', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('peb_zoomies', lv);
      const a = arena({ at: [1, 4], skills: [['peb_zoomies', lv]], enemies: [E(8, 8)], heroes: [{ id: 'test_knight', x: 2, y: 4 }] });
      const p = a.p, slot = a.slot('peb_zoomies');
      t.ok(valid(p, slot, 1 + Lv.len, 4) && !valid(p, slot, 2 + Lv.len, 4), 'L' + lv + ': up to ' + Lv.len + ' tiles');
      t.ok(!valid(p, slot, 2, 4), 'L' + lv + ': not onto a unit');
      use(t, p, slot, 1 + Lv.len, 4, 'L' + lv);
      t.ok(p.x === 1 + Lv.len && p.y === 4 && p.hp === 26, 'L' + lv + ': zoomed past the knight to ' + p.x + ',4');
      t.eq(p.ap, 2, 'L' + lv + ': 1 AP');
      const lit = [1].concat(Array.from({ length: Lv.len - 2 }, function (_, i) { return 3 + i; }));
      t.ok(lit.every(function (x) { return surf(x, 4) === 'fire' && surfTurns(x, 4) === Lv.turns; }), 'L' + lv + ': fire (' + Lv.turns + ' rounds) on ' + lit.join(',') + ' (row 4)');
      t.eq(surf(2, 4), null, 'L' + lv + ': the knight he zoomed past keeps his feet unburnt');
      t.eq(surf(1 + Lv.len, 4), null, 'L' + lv + ': no fire under his own feet');
      // the fire lasts L.turns rounds, the cooldown 2 of his turns
      for (let r = 1; r < Lv.turns; r++) DD.Combat.endRound();
      t.eq(surf(1, 4), 'fire', 'L' + lv + ': still burning in round ' + Lv.turns);
      DD.Combat.endRound();
      t.eq(surf(1, 4), null, 'L' + lv + ': out after ' + Lv.turns + ' rounds');
    });
    // cooldown 2: unusable on his next two turns, back on the third
    const c = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(8, 8)] });
    use(t, c.p, c.slot('peb_zoomies'), 3, 4, 'cooldown');
    DD.Combat.endRound();
    t.ok(cdReason(c.p, c.slot('peb_zoomies')), 'round 2: cooling down');
    DD.Combat.endRound();
    t.ok(cdReason(c.p, c.slot('peb_zoomies')), 'round 3: cooling down');
    DD.Combat.endRound();
    t.eq(DD.Combat.canUse(c.p, c.slot('peb_zoomies')), true, 'round 4: ready again');
    // routes: around a wall (the path counts), through mud at full speed, never through foes or into pits
    const w = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], terrain: { '2,4': 'wall' }, enemies: [E(8, 8)] });
    t.ok(valid(w.p, w.slot('peb_zoomies'), 3, 4) && !valid(w.p, w.slot('peb_zoomies'), 4, 4), 'a wall: (3,4) is 4 tiles around it (ok), (4,4) would be 5');
    const m = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], terrain: { '2,4': 'mud', '3,4': 'mud', '4,4': 'mud' }, enemies: [E(8, 8)] });
    t.ok(valid(m.p, m.slot('peb_zoomies'), 5, 4), 'mud does not slow zoomies (every tile counts 1)');
    const corridor = {};
    for (let x = 0; x < 9; x++) { corridor[x + ',3'] = 'wall'; corridor[x + ',5'] = 'wall'; }
    const fb = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], terrain: corridor, enemies: [E(3, 4)] });
    t.ok(!valid(fb.p, fb.slot('peb_zoomies'), 4, 4), 'a foe in a corridor blocks the way (no zooming through foes)');
    // the route table is cached per board; a foe that walks into the corridor (a plain walk doesn't bump
    // state.mutations) must still block it — the cached route is not reused (review v2)
    const cw = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], terrain: Object.assign({}, corridor, { '3,5': 'floor' }), enemies: [E(3, 6), E(8, 8)] });
    t.ok(valid(cw.p, cw.slot('peb_zoomies'), 4, 4), 'corridor clear: (4,4) reachable (and the route is cached)');
    const cm0 = cw.s.mutations;
    DD.Act.moveAlong(cw.foes[0], [{ x: 3, y: 5 }, { x: 3, y: 4 }]);
    t.ok(cw.foes[0].x === 3 && cw.foes[0].y === 4, 'a grunt walks into the corridor (state.mutations ' + cm0 + ' → ' + cw.s.mutations + ')');
    t.ok(!valid(cw.p, cw.slot('peb_zoomies'), 4, 4) && !DD.Pebbles.zoomPath(cw.p, { x: 4, y: 4 }, 4), 'now the grunt blocks the corridor: no stale route through it');
    const pt = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], terrain: { '3,4': 'pit' }, enemies: [E(8, 8)] });
    t.ok(!valid(pt.p, pt.slot('peb_zoomies'), 3, 4), 'never into a pit');
    // the route: the fewest tiles that would hurt him, then the shortest (review: it used to take the first shortest
    // route, straight through a poison puddle, with a clean one right next to it)
    const route = function (u, x, y, len) { return (DD.Pebbles.zoomPath(u, { x: x, y: y }, len) || []).map(function (q) { return q.x + ',' + q.y; }).join(' '); };
    const pz = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(8, 8)], surfaces: [{ x: 2, y: 4, id: 'poison', turns: 3 }] });
    t.eq(route(pz.p, 2, 5, 4), '1,5 2,5', 'two equally short routes: the one without the poison puddle');
    t.eq(route(pz.p, 3, 4, 4).split(' ').length, 4, 'a 4-tile detour beats the 2-tile short cut through the puddle (' + route(pz.p, 3, 4, 4) + ')');
    use(t, pz.p, pz.slot('peb_zoomies'), 3, 4, 'zoom round the puddle');
    t.ok(pz.p.x === 3 && pz.p.y === 4 && !has(pz.p, 'poison'), 'he arrives without stepping in the poison');
    t.eq(surf(2, 4), 'poison', 'the puddle is untouched (the trail went round it)');
    [['spikes', 'object'], ['electric', 'surface']].forEach(function (c) {
      const cfg = { at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(8, 8)] };
      if (c[1] === 'object') cfg.objects = [{ x: 2, y: 4, id: c[0] }]; else cfg.surfaces = [{ x: 2, y: 4, id: c[0], turns: 3 }];
      t.eq(route(arena(cfg).p, 2, 5, 4), '1,5 2,5', c[0] + ': the route steps round it');
    });
    const sq = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(8, 8)], terrain: { '1,3': 'wall', '1,5': 'wall' }, surfaces: [{ x: 2, y: 4, id: 'poison', turns: 3 }] });
    use(t, sq.p, sq.slot('peb_zoomies'), 3, 4, 'no way round');
    t.ok(sq.p.x === 3 && has(sq.p, 'poison'), 'with no way round within reach he zooms through anyway (and gets Poisoned)');
    const lv = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(8, 8)], terrain: { '2,4': 'lava' } });
    t.eq(route(lv.p, 3, 4, 4), '2,4 3,4', 'lava doesn\'t count (he is fireproof): straight through it, no 4-tile detour');
    const fz = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(8, 8)], surfaces: [{ x: 2, y: 4, id: 'fire', turns: 3 }] });
    t.eq(route(fz.p, 3, 4, 4), '2,4 3,4', 'nor does fire: straight through it');
    // Rooted: no zoomies; Dazzled: one tile shorter
    const r = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(8, 8)] });
    DD.Act.addStatus(r.p, 'root', { turns: 1 }, r.foes[0]);
    t.ok(/Can't move/.test(String(DD.Combat.canUse(r.p, r.slot('peb_zoomies')))), 'Rooted: no zoomies');
    const dz = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(8, 8)] });
    DD.Act.addStatus(dz.p, 'dazzled', { turns: 1 }, dz.foes[0]);
    t.ok(valid(dz.p, dz.slot('peb_zoomies'), 4, 4) && !valid(dz.p, dz.slot('peb_zoomies'), 5, 4), 'Dazzled: 3 tiles');
    // oil on the way goes up along the whole slick, Burning the foes standing on it
    const o = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(3, 5)],
      surfaces: [{ x: 3, y: 4, id: 'oil', turns: 5 }, { x: 3, y: 5, id: 'oil', turns: 5 }] });
    use(t, o.p, o.slot('peb_zoomies'), 5, 4, 'through oil');
    t.ok(surf(3, 4) === 'fire' && surf(3, 5) === 'fire' && stacks(o.foes[0], 'burn') === 2, 'the slick ignites end to end; the grunt on it Burns 2');
    // fire on water: steam, not fire
    const wt = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], terrain: { '2,4': 'water' }, enemies: [E(8, 8)] });
    use(t, wt.p, wt.slot('peb_zoomies'), 4, 4, 'through water');
    t.ok(surf(2, 4) !== 'fire' && surf(1, 4) === 'fire', 'no fire on water (the start tile burns)');
  });

  T.suite('hero_pebbles: Fetch Quest I-III — damage + pull toward Pebbles (pits, lava, fire, walls, immovable)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('peb_fetch', lv);
      const a = arena({ at: [1, 4], skills: [['peb_fetch', lv]], enemies: [E(5, 4), E(2, 6), E(2 + Lv.range, 4)] });
      const p = a.p, g = a.foes[0], slot = a.slot('peb_fetch');
      t.eq(JSON.stringify(DD.Targeting.range(p, sk('peb_fetch'), lv)), JSON.stringify([2, Lv.range]), 'L' + lv + ': range 2-' + Lv.range);
      t.ok(valid(p, slot, 5, 4) && !valid(p, slot, 2 + Lv.range, 4), 'L' + lv + ': the grunt 4 away yes, the one ' + (1 + Lv.range) + ' away no');
      DD.Act.teleport(a.foes[1], 2, 4);
      t.ok(!valid(p, slot, 2, 4), 'L' + lv + ': not an adjacent foe (min range 2)');
      DD.Act.teleport(a.foes[1], 2, 6);
      use(t, p, slot, 5, 4, 'L' + lv);
      const want = Math.max(2, 5 - Lv.pull);
      t.ok(g.hp === 14 - Lv.dmg && g.x === want && g.y === 4, 'L' + lv + ': ' + Lv.dmg + ' damage, pulled ' + Lv.pull + ' to ' + g.x + ',4');
      t.eq(p.ap, 2, 'L' + lv + ': 1 AP');
      t.ok(cdReason(p, slot), 'L' + lv + ': cooldown');
    });
    // line of sight
    const ls = arena({ at: [1, 4], skills: [['peb_fetch', 1]], terrain: { '3,4': 'wall' }, enemies: [E(5, 4)] });
    t.ok(!valid(ls.p, ls.slot('peb_fetch'), 5, 4), 'needs line of sight');
    // through a pit: YEET (environmental kill, +envKill Hype)
    const pit = arena({ at: [1, 4], skills: [['peb_fetch', 1]], terrain: { '3,4': 'pit' }, enemies: [E(4, 4), E(8, 8)] });
    use(t, pit.p, pit.slot('peb_fetch'), 4, 4, 'pit');
    t.ok(pit.foes[0].dead, 'fetched straight into a pit');
    hypeIs(t, DD.Combat.state.hype, hype().envKill, 'environmental kill Hype');
    // across lava: burned on the way in
    const lv = arena({ at: [1, 4], skills: [['peb_fetch', 1]], terrain: { '3,4': 'lava' }, enemies: [E(5, 4)] });
    use(t, lv.p, lv.slot('peb_fetch'), 5, 4, 'lava');
    t.ok(lv.foes[0].x === 3 && lv.foes[0].hp === 14 - 3 - 8 && has(lv.foes[0], 'burn'), 'pulled onto lava: 3 + 8, Burning (' + lv.foes[0].hp + ')');
    // through fire: Burn 2
    const fi = arena({ at: [1, 4], skills: [['peb_fetch', 1]], surfaces: [{ x: 4, y: 4, id: 'fire', turns: 2 }], enemies: [E(5, 4)] });
    use(t, fi.p, fi.slot('peb_fetch'), 5, 4, 'fire');
    t.eq(stacks(fi.foes[0], 'burn'), 2, 'dragged through fire: Burn 2');
    // the immovable brute takes the bite (armor 1) and stays
    const im = arena({ at: [1, 4], skills: [['peb_fetch', 1]], enemies: [E(5, 4, 'test_brute')] });
    use(t, im.p, im.slot('peb_fetch'), 5, 4, 'immovable');
    t.ok(im.foes[0].x === 5 && im.foes[0].hp === 50 - 2, 'the brute: 3 − 1 armor, not moved');
    // diagonal: along the longer axis
    const dg = arena({ at: [1, 4], skills: [['peb_fetch', 1]], enemies: [E(4, 5)] });
    use(t, dg.p, dg.slot('peb_fetch'), 4, 5, 'diagonal');
    t.ok(dg.foes[0].x === 2 && dg.foes[0].y === 5, 'a foe 3 east 1 south comes 2 west');
    // fire damage: a fire-immune foe takes nothing, but it still comes when called
    const fp = arena({ at: [1, 4], skills: [['peb_fetch', 1]], enemies: [E(5, 4)] });
    fp.foes[0].resist = { fire: 0 };
    use(t, fp.p, fp.slot('peb_fetch'), 5, 4, 'fireproof foe');
    t.ok(fp.foes[0].hp === 14 && fp.foes[0].x === 3, 'a fire-immune foe: 0 damage, still pulled 2');
    // a lethal fetch: no pull, no error
    const d = arena({ at: [1, 4], skills: [['peb_fetch', 1]], enemies: [E(5, 4), E(8, 8)] });
    d.foes[0].hp = 3;
    use(t, d.p, d.slot('peb_fetch'), 5, 4, 'lethal');
    t.ok(d.foes[0].dead, 'the target died mid-skill');
  });

  T.suite('hero_pebbles: Chew Toy I-III — a big bite and Root for exactly its next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const dmg = L('peb_chew_toy', lv).dmg;
      const a = arena({ at: [1, 4], skills: [['peb_chew_toy', lv]], ai: true, enemies: [E(2, 4, 'test_grunt', 3), E(1, 6)], heroes: [{ id: 'test_mage', x: 6, y: 4 }] });
      const p = a.p, g = a.foes[0];
      t.ok(!valid(p, a.slot('peb_chew_toy'), 1, 6), 'L' + lv + ': adjacent foes only');
      use(t, p, a.slot('peb_chew_toy'), 2, 4, 'L' + lv);
      t.ok(g.hp === 42 - dmg && has(g, 'root'), 'L' + lv + ': ' + dmg + ' damage and Rooted');
      t.eq(p.ap, 1, 'L' + lv + ': 2 AP');
      let rooted = 0;
      onTurns(function (u) { return u === g; }, function () { if (has(g, 'root')) rooted++; }, function () {
        DD.Combat.endRound();
        t.ok(g.x === 2 && g.y === 4, 'L' + lv + ': on its turn it could not walk anywhere');
        t.ok(!has(g, 'root'), 'L' + lv + ': Root gone after its turn');
        DD.Combat.endRound();
      });
      t.eq(rooted, 1, 'L' + lv + ': Rooted on exactly one of its turns');
    });
    const d = arena({ at: [1, 4], skills: [['peb_chew_toy', 1]], enemies: [E(2, 4), E(8, 8)] });
    d.foes[0].hp = 5;
    use(t, d.p, d.slot('peb_chew_toy'), 2, 4, 'lethal');
    t.ok(d.foes[0].dead, 'a lethal chew: no Root on a corpse, no error');
    const c = arena({ at: [1, 4], skills: [['peb_chew_toy', 1]], enemies: [E(2, 4, 'test_grunt', 3)] });
    use(t, c.p, c.slot('peb_chew_toy'), 2, 4, 'cooldown');
    DD.Combat.endRound();
    t.ok(cdReason(c.p, c.slot('peb_chew_toy')), 'cooldown 1: not on his next turn');
    DD.Combat.endRound();
    t.eq(DD.Combat.canUse(c.p, c.slot('peb_chew_toy')), true, 'ready the turn after');
  });

  T.suite('hero_pebbles: Big Wag I-III — fire to every adjacent foe and a push (pits, lava, water, walls, edges, immovable)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('peb_wag', lv);
      const a = arena({ at: [4, 4], skills: [['peb_wag', lv]], enemies: [E(5, 4), E(3, 4), E(4, 3), E(4, 6)], heroes: [{ id: 'test_knight', x: 4, y: 5 }] });
      const f = a.foes, knight = at(4, 5);
      const h0 = DD.Combat.state.hype;
      use(t, a.p, a.slot('peb_wag'), 4, 4, 'L' + lv);
      t.eq([f[0].hp, f[1].hp, f[2].hp].join(','), [14 - Lv.dmg, 14 - Lv.dmg, 14 - Lv.dmg].join(','), 'L' + lv + ': ' + Lv.dmg + ' fire damage to each adjacent foe');
      t.ok(f[0].x === 5 + Lv.push && f[1].x === 3 - Lv.push && f[2].y === 3 - Lv.push, 'L' + lv + ': each pushed ' + Lv.push + ' away');
      t.ok(f[3].hp === 14 && f[3].y === 6, 'L' + lv + ': the foe 2 tiles away is untouched');
      t.ok(knight.hp === knight.maxHp && knight.x === 4 && knight.y === 5, 'L' + lv + ': the adjacent knight is neither hit nor pushed');
      hypeIs(t, DD.Combat.state.hype - h0, hype().multiHit, 'L' + lv + ': +' + hype().multiHit + ' Hype for hitting 2+ foes');
      t.eq(a.p.ap, 1, 'L' + lv + ': 2 AP');
    });
    const pit = arena({ at: [4, 4], skills: [['peb_wag', 1]], terrain: { '6,4': 'pit' }, enemies: [E(5, 4), E(8, 8)] });
    use(t, pit.p, pit.slot('peb_wag'), 4, 4, 'pit');
    t.ok(pit.foes[0].dead, 'wagged into a pit: YEET');
    const lava = arena({ at: [4, 4], skills: [['peb_wag', 1]], terrain: { '6,4': 'lava' }, enemies: [E(5, 4)] });
    use(t, lava.p, lava.slot('peb_wag'), 4, 4, 'lava');
    t.ok(lava.foes[0].hp === 14 - 4 - 8 && has(lava.foes[0], 'burn'), 'wagged into lava: 4 + 8 and Burning');
    const water = arena({ at: [4, 4], skills: [['peb_wag', 1]], terrain: { '6,4': 'water' }, enemies: [E(5, 4)] });
    use(t, water.p, water.slot('peb_wag'), 4, 4, 'water');
    t.ok(water.foes[0].x === 6 && has(water.foes[0], 'wet'), 'wagged into water: Wet (and now it can\'t Burn)');
    const wall = arena({ at: [4, 4], skills: [['peb_wag', 1]], terrain: { '6,4': 'wall' }, enemies: [E(5, 4)] });
    use(t, wall.p, wall.slot('peb_wag'), 4, 4, 'wall');
    t.ok(wall.foes[0].x === 5 && wall.foes[0].hp === 14 - 4 - 3, 'against a wall: stays, 4 + 3 bump');
    const edge = arena({ at: [7, 4], skills: [['peb_wag', 1]], enemies: [E(8, 4)] });
    use(t, edge.p, edge.slot('peb_wag'), 7, 4, 'edge');
    t.ok(edge.foes[0].x === 8 && edge.foes[0].hp === 14 - 4 - 3, 'at the map edge: bump instead');
    const im = arena({ at: [4, 4], skills: [['peb_wag', 1]], enemies: [E(5, 4, 'test_brute')] });
    use(t, im.p, im.slot('peb_wag'), 4, 4, 'immovable');
    t.ok(im.foes[0].x === 5 && im.foes[0].hp === 50 - 3, 'the immovable brute: 4 − 1 armor, stays');
    const fp = arena({ at: [4, 4], skills: [['peb_wag', 1]], enemies: [E(5, 4)] });
    fp.foes[0].resist = { fire: 0 };
    use(t, fp.p, fp.slot('peb_wag'), 4, 4, 'fireproof foe');
    t.ok(fp.foes[0].hp === 14 && fp.foes[0].x === 6, 'a fire-immune foe takes no damage but still gets wagged away');
    const kill = arena({ at: [4, 4], skills: [['peb_wag', 1]], enemies: [E(5, 4), E(3, 4)] });
    kill.foes[0].hp = 3;
    use(t, kill.p, kill.slot('peb_wag'), 4, 4, 'kill one');
    t.ok(kill.foes[0].dead && kill.foes[1].hp === 10 && kill.foes[1].x === 2, 'one foe dies mid-wag, the other still gets hit and pushed');
  });

  T.suite('hero_pebbles: Bork! I-III — every foe within r must attack Pebbles on exactly its next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('peb_bork', lv);
      const a = arena({ at: [1, 4], skills: [['peb_bork', lv]], ai: true, enemies: [E(3, 4), E(8, 8)], heroes: [{ id: 'test_mage', x: 3, y: 5 }] });
      const p = a.p, g = a.foes[0], out = a.foes[1], mage = at(3, 5);
      t.ok(DD.Grid.dist(p, out) > Lv.r, 'L' + lv + ': the second grunt stands outside ' + Lv.r);
      use(t, p, a.slot('peb_bork'), 1, 4, 'L' + lv);
      t.ok(has(g, 'taunt') && !has(out, 'taunt'), 'L' + lv + ': the grunt within ' + Lv.r + ' is Taunted, the one outside is not');
      t.eq(p.ap, 2, 'L' + lv + ': 1 AP');
      t.eq(DD.Combat.cooldownOf(p, sk('peb_bork'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      let taunted = 0;
      const mage0 = mage.hp, p0 = p.hp;
      onTurns(function (u) { return u === g; }, function () { if (has(g, 'taunt')) taunted++; }, function () {
        DD.Combat.endTurn();   // the mage's turn (passes), then the grunts
        DD.Combat.endTurn();
      });
      t.eq(taunted, 1, 'L' + lv + ': Taunted during exactly one of its turns');
      t.ok(!has(g, 'taunt'), 'L' + lv + ': gone after that turn');
      t.ok(mage.hp === mage0 && p.hp < p0, 'L' + lv + ': it left the mage next to it alone and went for Pebbles (' + p.hp + '/' + p0 + ')');
    });
    // a fire-breathing foe taunted onto him wastes its turn: the bomber's fire blast can't hurt him
    const b = arena({ at: [1, 4], skills: [['peb_bork', 1]], ai: true, enemies: [E(2, 4, 'test_bomber')], heroes: [{ id: 'test_knight', x: 6, y: 7 }] });
    use(t, b.p, b.slot('peb_bork'), 1, 4, 'bork the bomber');
    DD.Combat.endRound();
    t.ok(b.foes[0].dead && b.p.hp === 26, 'the taunted bomber blew itself up on Pebbles: 0 damage (fire)');
  });

  T.suite('hero_pebbles: Emotional Support Dog I-III — an adjacent ally heals and is Inspired through its next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const heal = L('peb_support', lv).heal;
      const a = arena({ at: [1, 4], skills: [['peb_support', lv]], enemies: [E(3, 4, 'test_grunt', 3), E(8, 8)],
        heroes: [{ id: 'test_knight', x: 2, y: 4 }, { id: 'test_mage', x: 1, y: 7 }] });
      const p = a.p, knight = at(2, 4), mage = at(1, 7), slot = a.slot('peb_support');
      knight.hp = 15;
      t.ok(valid(p, slot, 2, 4) && !valid(p, slot, 1, 7) && !valid(p, slot, 1, 4) && !valid(p, slot, 3, 4), 'L' + lv + ': adjacent allies only (not himself, not foes)');
      use(t, p, slot, 2, 4, 'L' + lv);
      t.ok(knight.hp === 15 + heal && has(knight, 'inspired'), 'L' + lv + ': +' + heal + ' HP and Inspired');
      t.eq(p.ap, 2, 'L' + lv + ': 1 AP');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === knight && has(knight, 'inspired'), 'L' + lv + ': still Inspired on his turn');
      use(t, knight, knight.basic, 3, 4, 'L' + lv + ' knight slash');
      t.eq(a.foes[0].hp, 42 - Math.round(5 * 1.25), 'L' + lv + ': the knight\'s 5 becomes 6');
      DD.Combat.endTurn();
      t.ok(!has(knight, 'inspired'), 'L' + lv + ': gone at the end of his turn');
      t.ok(mage.hp === mage.maxHp, 'L' + lv + ': (the mage was never involved)');
    });
    const c = arena({ at: [1, 4], skills: [['peb_support', 1]], heroes: [{ id: 'test_knight', x: 2, y: 4 }], enemies: [E(8, 8)] });
    use(t, c.p, c.slot('peb_support'), 2, 4, 'cooldown');
    t.eq(DD.Combat.cooldownOf(c.p, sk('peb_support'), 1), 2, 'cooldown 2');
  });

  T.suite('hero_pebbles: This Is Fine I-III — fire on his tile and around him (not under allies)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('peb_this_is_fine', lv);
      const a = arena({ at: [4, 4], hp: 20, skills: [['peb_this_is_fine', lv]], enemies: [E(5, 4), E(8, 8)], heroes: [{ id: 'test_knight', x: 4, y: 5 }] });
      const p = a.p, g = a.foes[0];
      use(t, p, a.slot('peb_this_is_fine'), 4, 4, 'L' + lv);
      const tiles = DD.Grid.shape('circle', { x: 4, y: 4 }, null, Lv.r);
      const lit = tiles.filter(function (q) { return surf(q.x, q.y) === 'fire'; });
      t.eq(lit.length, tiles.length - 1, 'L' + lv + ': all ' + (tiles.length - 1) + ' tiles within ' + Lv.r + ' are on fire, but not the knight\'s');
      t.ok(surf(4, 4) === 'fire' && surf(5, 4) === 'fire' && surf(4, 5) === null, 'L' + lv + ': his own tile and the grunt\'s burn; the knight\'s does not');
      t.ok(lit.every(function (q) { return surfTurns(q.x, q.y) === Lv.turns; }), 'L' + lv + ': for ' + Lv.turns + ' rounds');
      t.eq(p.ap, 2, 'L' + lv + ': 1 AP');
      t.ok(!has(g, 'burn'), 'L' + lv + ': setting fire under the grunt does not Burn it yet');
      DD.Combat.endRound();
      t.eq(p.hp, 23, 'L' + lv + ': he ended his turn in his own fire: +3 (Hot Dog)');
      t.eq(stacks(g, 'burn'), 1, 'L' + lv + ': the grunt ended its turn in the fire: Burn 1');
      t.eq(DD.Combat.cooldownOf(p, sk('peb_this_is_fine'), lv), 3, 'L' + lv + ': cooldown 3');
    });
    // oil next to him: the whole slick goes up (Burning whoever stands on it)
    const o = arena({ at: [4, 4], skills: [['peb_this_is_fine', 1]], enemies: [E(2, 4)],
      surfaces: [{ x: 3, y: 4, id: 'oil', turns: 5 }, { x: 2, y: 4, id: 'oil', turns: 5 }] });
    use(t, o.p, o.slot('peb_this_is_fine'), 4, 4, 'oil');
    t.ok(surf(2, 4) === 'fire' && stacks(o.foes[0], 'burn') === 2, 'oil within 1 ignites the slick: the grunt 2 tiles away Burns 2');
    // an explosive barrel next to him: KABOOM, and he is fine
    const x = arena({ at: [4, 4], skills: [['peb_this_is_fine', 1]], enemies: [E(5, 3)], objects: [{ x: 4, y: 3, id: 'barrel_explosive' }] });
    use(t, x.p, x.slot('peb_this_is_fine'), 4, 4, 'barrel');
    t.ok(!DD.Grid.tile(4, 3).obj && x.foes[0].hp < 14 && x.p.hp === 26, 'the barrel next to him explodes: the grunt is hurt (' + x.foes[0].hp + '), Pebbles is fine');
    // water next to him does not catch fire
    const w = arena({ at: [4, 4], skills: [['peb_this_is_fine', 1]], terrain: { '3,4': 'water' }, enemies: [E(8, 8)] });
    use(t, w.p, w.slot('peb_this_is_fine'), 4, 4, 'water');
    t.ok(surf(3, 4) !== 'fire' && surf(4, 4) === 'fire', 'no fire on water');
    // frozen deep water: the ice under the grunt melts and it sinks; the ice under Pebbles holds
    const ice = arena({ at: [4, 4], skills: [['peb_this_is_fine', 1]], enemies: [E(5, 4), E(8, 8)],
      terrain: { '4,4': { t: 'ice', melt: 'deep_water' }, '5,4': { t: 'ice', melt: 'deep_water' } } });
    use(t, ice.p, ice.slot('peb_this_is_fine'), 4, 4, 'ice');
    t.ok(ice.foes[0].dead && DD.Grid.tile(5, 4).t === 'deep_water', 'the grunt\'s ice melts back into deep water: it sinks');
    hypeIs(t, DD.Combat.state.hype, hype().envKill, 'an environmental kill');
    t.ok(ice.p.hp === 26 && DD.Grid.tile(4, 4).t === 'ice' && ice.p.x === 4, 'his own ice holds (he never melts the floor under himself)');
  });

  T.suite('hero_pebbles: Bark-B-Q I-III — fire damage to every Burning foe within 3 (and nobody else)', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('peb_bbq', lv);
      const a = arena({ at: [4, 4], skills: [['peb_bbq', lv]], enemies: [E(5, 4), E(4, 7), E(4, 8), E(2, 4)] });
      const p = a.p, f = a.foes, slot = a.slot('peb_bbq');
      t.eq(DD.Combat.canUse(p, slot), 'Nothing is on fire. Yet.', 'L' + lv + ': refused with nothing Burning');
      [f[0], f[1], f[2]].forEach(function (u) { DD.Act.addStatus(u, 'burn', { stacks: 2 }, p); });
      const h0 = DD.Combat.state.hype;
      use(t, p, slot, 4, 4, 'L' + lv);
      t.eq([f[0].hp, f[1].hp].join(','), [14 - Lv.dmg, 14 - Lv.dmg].join(','), 'L' + lv + ': ' + Lv.dmg + ' fire damage to the Burning foes within 3');
      t.eq(f[2].hp, 14, 'L' + lv + ': the Burning foe 4 tiles away is spared');
      t.eq(f[3].hp, 14, 'L' + lv + ': the foe that is not Burning is spared');
      t.ok(stacks(f[0], 'burn') === 2, 'L' + lv + ': the Burn stays');
      hypeIs(t, DD.Combat.state.hype - h0, hype().multiHit, 'L' + lv + ': +' + hype().multiHit + ' Hype for 2 foes');
      t.eq(p.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(DD.Combat.cooldownOf(p, sk('peb_bbq'), lv), 3, 'L' + lv + ': cooldown 3');
    });
    // his own setup: a nibble (Burn 1), then the barbecue — 3 AP of good-boy cooking
    const c = arena({ at: [1, 4], skills: [['peb_bbq', 1]], enemies: [E(2, 4)] });
    use(t, c.p, c.p.basic, 2, 4, 'nibble');
    use(t, c.p, c.slot('peb_bbq'), 1, 4, 'bbq');
    t.eq(c.foes[0].hp, 14 - 4 - 6, 'Spicy Nibble → Bark-B-Q: 4 + 6');
    // a Burning foe that is fireproof takes nothing
    const fp = arena({ at: [1, 4], skills: [['peb_bbq', 1]], enemies: [E(2, 4)] });
    DD.Act.addStatus(fp.foes[0], 'burn', { stacks: 1 }, fp.p);
    fp.foes[0].resist = { fire: 0 };
    use(t, fp.p, fp.slot('peb_bbq'), 1, 4, 'fireproof');
    t.eq(fp.foes[0].hp, 14, 'a fire-immune Burning foe: 0');
  });

  T.suite('hero_pebbles: Puppy Eyes I-III — Charm a foe (not a boss) for exactly its next turn', function (t) {
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('peb_puppy_eyes', lv);
      const a = arena({ at: [1, 4], skills: [['peb_puppy_eyes', lv]], ai: true, enemies: [E(1 + Lv.range, 4), E(2 + Lv.range, 4)] });
      const p = a.p, g = a.foes[0], friend = a.foes[1], slot = a.slot('peb_puppy_eyes');
      t.ok(valid(p, slot, 1 + Lv.range, 4) && !valid(p, slot, 2 + Lv.range, 4), 'L' + lv + ': range ' + Lv.range);
      use(t, p, slot, 1 + Lv.range, 4, 'L' + lv);
      t.ok(has(g, 'charmed'), 'L' + lv + ': Charmed');
      t.eq(p.ap, 1, 'L' + lv + ': 2 AP');
      t.eq(DD.Combat.cooldownOf(p, sk('peb_puppy_eyes'), lv), Lv.cd, 'L' + lv + ': cooldown ' + Lv.cd);
      t.ok(!valid(p, slot, 1 + Lv.range, 4) || DD.Combat.canUse(p, slot) !== true, 'L' + lv + ': not twice');
      let charmed = 0;
      const f0 = friend.hp;
      onTurns(function (u) { return u === g; }, function () { if (has(g, 'charmed')) charmed++; }, function () {
        DD.Combat.endTurn();
        t.ok(friend.hp < f0, 'L' + lv + ': on its turn it attacked its own friend (' + friend.hp + '/' + f0 + ')');
        t.ok(!has(g, 'charmed'), 'L' + lv + ': the charm is over after that turn');
        DD.Combat.endRound();
      });
      t.eq(charmed, 1, 'L' + lv + ': Charmed during exactly one of its turns');
    });
    // not bosses, not the already charmed, not the heartless
    const b = arena({ at: [1, 4], skills: [['peb_puppy_eyes', 1]], enemies: [E(3, 4, 'test_boss'), E(1, 6)] });
    t.ok(!valid(b.p, b.slot('peb_puppy_eyes'), 3, 4), 'bosses are immune to puppy eyes');
    const h = arena({ at: [1, 4], skills: [['peb_puppy_eyes', 1]], enemies: [E(3, 4)] });
    h.foes[0].flags.immune = ['charmed'];
    t.ok(!valid(h.p, h.slot('peb_puppy_eyes'), 3, 4), 'a charm-immune foe cannot be targeted');
  });

  // ---- combos with other heroes ------------------------------------------------------------------------------------------
  T.suite('hero_pebbles: combos — oil, fire trails, pulls into the party, fire on top of him', function (t) {
    // 1. he stands on oil and zooms off: the slick goes up under the grunts, then Bark-B-Q cooks them (3 AP)
    const o = arena({ at: [3, 4], skills: [['peb_zoomies', 1], ['peb_bbq', 1]], enemies: [E(4, 3, 'test_grunt', 2), E(4, 5, 'test_grunt', 2)],
      surfaces: [{ x: 3, y: 4, id: 'oil', turns: 5 }, { x: 4, y: 4, id: 'oil', turns: 5 }, { x: 4, y: 3, id: 'oil', turns: 5 }, { x: 4, y: 5, id: 'oil', turns: 5 }] });
    use(t, o.p, o.slot('peb_zoomies'), 2, 4, 'zoom off the oil');
    t.ok(o.foes.every(function (f) { return stacks(f, 'burn') === 2; }), 'the slick ignites: both grunts Burn 2');
    use(t, o.p, o.slot('peb_bbq'), 2, 4, 'barbecue');
    t.ok(o.foes.every(function (f) { return f.hp === 28 - 6; }), 'Bark-B-Q: 6 each');
    // 2. Hot Zoomies' trail + Fetch Quest: he zooms back toward the party, then fetches a grunt through his own fire
    const z = arena({ at: [3, 4], skills: [['peb_zoomies', 1], ['peb_fetch', 1]], enemies: [E(5, 4)] });
    use(t, z.p, z.slot('peb_zoomies'), 1, 4, 'zoom back');
    t.ok(surf(3, 4) === 'fire' && surf(2, 4) === 'fire', 'a fire trail behind him');
    use(t, z.p, z.slot('peb_fetch'), 5, 4, 'fetch through the trail');
    t.ok(z.foes[0].x === 3 && stacks(z.foes[0], 'burn') === 2, 'dragged into the fire trail: Burn 2');
    // 3. Fetch Quest pulls an archer off the back line, into the knight's reach
    const k = arena({ at: [1, 4], skills: [['peb_fetch', 1]], enemies: [E(5, 4, 'test_archer')], heroes: [{ id: 'test_knight', x: 3, y: 5 }] });
    use(t, k.p, k.slot('peb_fetch'), 5, 4, 'fetch the archer');
    DD.Combat.endTurn();
    const knight = DD.Combat.current();
    t.ok(knight && knight.defId === 'test_knight' && valid(knight, knight.basic, 3, 4), 'the archer lands next to the knight');
    use(t, knight, knight.basic, 3, 4, 'knight slash');
    t.eq(k.foes[0].hp, 10 - 3 - 5, 'fetch 3 + slash 5');
    // 4. fire on top of him: the mage drops Fire Fixture on Pebbles' tile; only the foes around him burn
    const f = arena({ at: [4, 4], enemies: [E(5, 4), E(3, 4)], heroes: [{ id: 'test_mage', x: 1, y: 4, skills: [{ id: 'test_fireball', level: 1 }] }] });
    DD.Combat.endTurn();
    use(t, DD.Combat.current(), slotOf(DD.Combat.current(), 'test_fireball'), 4, 4, 'fireball on the dog');
    t.ok(f.p.hp === 26 && f.foes.every(function (u) { return u.hp === 14 - 6; }), 'Pebbles 0, both grunts 6');
    // (Emotional Support Dog's Inspired on the party's big hitter: its own suite, the knight's 5 → 6)
  });

  // ---- signature --------------------------------------------------------------------------------------------------------
  T.suite('hero_pebbles: Hot Diggity Dog! — 16 to every foe within 2; Pebbles and every ally Inspired through their next turn', function (t) {
    const a = arena({ at: [4, 4], enemies: [E(5, 4), E(4, 6), E(3, 3), E(4, 7), E(7, 7)],
      heroes: [{ id: 'test_knight', x: 4, y: 5 }, { id: 'test_mage', x: 0, y: 0 }] });
    const p = a.p, f = a.foes, sig = p.signature, knight = at(4, 5), mage = at(0, 0);
    DD.Act.addStatus(f[4], 'charmed', { turns: 1 }, knight);   // a foe fighting for the party this turn
    DD.Combat.state.hype = 99;
    t.eq(DD.Combat.canUse(p, sig), 'Needs 100 Hype.', 'needs 100 Hype');
    DD.Combat.state.hype = 100;
    use(t, p, sig, 4, 4, 'signature');
    t.eq([f[0].hp, f[1].hp, f[2].hp].join(','), '0,0,0', 'every foe within 2 takes 16 (14 HP grunts: gone)');
    t.ok(f[0].dead && f[1].dead && f[2].dead, 'three grunts down');
    t.eq(f[3].hp, 14, 'the foe 3 away is spared');
    t.ok(f[4].hp === 14 && !has(f[4], 'inspired'), 'a foe charmed onto the party this turn is not Inspired (it is not his friend next turn)');
    t.eq(knight.hp, knight.maxHp, 'the ally in the blast is unharmed');
    t.ok(has(p, 'inspired') && has(knight, 'inspired') && has(mage, 'inspired'), 'Pebbles, the knight and the far-away mage are all Inspired');
    t.eq(p.ap, 1, '2 AP');
    // durations: everyone keeps it through their own next turn
    let kn = 0, mg = 0;
    onTurns(function (u) { return u === knight || u === mage; }, function (e) {
      if (e.unit === knight && has(knight, 'inspired')) kn++;
      if (e.unit === mage && has(mage, 'inspired')) mg++;
    }, function () { DD.Combat.endRound(); });
    t.ok(kn === 1 && mg === 1, 'the knight and the mage were Inspired on their turn');
    t.ok(!has(knight, 'inspired') && !has(mage, 'inspired'), 'and it ended with it');
    t.ok(DD.Combat.current() === p && has(p, 'inspired'), 'Pebbles is still Inspired on his next turn');
    DD.Combat.endTurn();
    t.ok(!has(p, 'inspired'), 'and it ends with that turn');
    // a big boss: the nova hurts, armor applies
    const b = arena({ at: [4, 4], enemies: [E(5, 4, 'test_boss')] });
    b.s.hype = 100;
    use(t, b.p, b.p.signature, 4, 4, 'boss');
    t.eq(b.foes[0].hp, 120 - 15, 'the boss takes 16 − 1 armor');
  });

  // ---- items ------------------------------------------------------------------------------------------------------------
  T.suite('hero_pebbles: items — Chewed-Up Fire Extinguisher, Fireproof Dog Bed, Collar of the Eternal Flame', function (t) {
    ITEMS.forEach(function (id) {
      const it = DD.getItem(id);
      t.ok(it && it.hero === 'pebbles' && it.desc && it.flavor && it.flavor.length <= 120, id + ' registered for Pebbles');
      t.ok(it && !it.stats.block, id + ': no combat-start Block (v2)');
    });
    // extinguisher: +10% damage, Spicy Nibble Burns 2
    const x = arena({ at: [1, 4], items: ['peb_extinguisher'], skills: [['peb_chew_toy', 1]], enemies: [E(2, 4, 'test_grunt', 3)] });
    t.ok(/Burn 2/.test(DD.skillDesc(sk('peb_basic'), 1, x.p)), 'with it, the nibble\'s desc says Burn 2');
    use(t, x.p, x.p.basic, 2, 4, 'extinguisher nibble');
    t.ok(x.foes[0].hp === 42 - Math.round(4 * 1.1) && stacks(x.foes[0], 'burn') === 2, 'nibble: ' + Math.round(4 * 1.1) + ' damage, Burn 2');
    use(t, x.p, x.slot('peb_chew_toy'), 2, 4, 'extinguisher chew');
    t.eq(x.foes[0].hp, 42 - 4 - Math.round(7 * 1.1), 'Chew Toy 7 → ' + Math.round(7 * 1.1));
    // dog bed: +6 HP, +1 armor, Hot Dog heals 5
    const d = arena({ at: [1, 4], items: ['peb_dog_bed'], surfaces: [{ x: 1, y: 4, id: 'fire', turns: 3 }], enemies: [E(8, 8)] });
    t.ok(d.p.maxHp === 32 && d.p.armor === 1, 'Dog Bed: 32 max HP, armor 1');
    d.p.hp = 20;
    DD.Combat.endTurn();
    t.eq(d.p.hp, 25, 'Dog Bed: Hot Dog heals 5 in fire');
    // collar: +4 HP; once per fight a lethal hit leaves him at 8
    const c = arena({ at: [1, 4], items: ['peb_collar'], enemies: [E(2, 4)] });
    t.eq(c.p.maxHp, 30, 'Collar: 30 max HP');
    DD.Act.damage(c.foes[0], c.p, 99, {});
    t.ok(!c.p.downed && c.p.hp === 8, 'a lethal hit: he flares back up at 8 HP');
    DD.Act.damage(c.foes[0], c.p, 99, {});
    t.ok(c.p.downed, 'the second time, he goes down (once per fight)');
    // a rolled fight: d20 + 3
    const rh = DD.Combat.makeRunHero({ id: 'pebbles', level: 1 });
    DD.Combat.start({ grid: DD.Combat.emptyGrid(8, 8), heroes: [{ runHero: rh, x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] }, { seed: 5, headless: true, initiative: 'roll' });
    const e = DD.Combat.state.order.filter(function (o) { return DD.Combat.byId(o.unitId).defId === 'pebbles'; })[0];
    t.ok(e && e.init === 3 && e.total === e.roll + 3, 'rolled initiative: d20 + 3');
  });

  // ---- previews -------------------------------------------------------------------------------------------------------
  T.suite('hero_pebbles: previews match reality for every skill at every level', function (t) {
    const burning = function (a) { a.foes.forEach(function (f) { DD.Act.addStatus(f, 'burn', { stacks: 2 }, a.p); }); };
    const cases = [
      { id: 'peb_basic', lv: 1, at: [1, 4], tg: [2, 4], enemies: [E(2, 4)] },
      { id: 'peb_basic', lv: 1, at: [1, 4], tg: [2, 4], enemies: [E(2, 4), E(8, 8)], hp: 3, note: 'lethal' },
      { id: 'peb_zoomies', tg: [4, 4], enemies: [E(8, 8)], surfaces: [{ x: 2, y: 4, id: 'oil', turns: 4 }] },
      { id: 'peb_zoomies', tg: [1, 2], enemies: [E(2, 4)], note: 'off a foe' },
      { id: 'peb_fetch', tg: [4, 4], enemies: [E(4, 4)], terrain: { '3,4': 'lava' } },
      { id: 'peb_fetch', tg: [4, 4], enemies: [E(4, 4), E(8, 8)], terrain: { '3,4': 'pit' }, note: 'pit' },
      { id: 'peb_chew_toy', tg: [2, 4], enemies: [E(2, 4)] },
      { id: 'peb_wag', tg: [4, 4], at: [4, 4], enemies: [E(5, 4), E(3, 4), E(4, 3)], terrain: { '6,4': 'lava' } },
      { id: 'peb_bork', tg: [1, 4], enemies: [E(3, 4)] },
      { id: 'peb_support', tg: [2, 4], enemies: [E(8, 8)], heroes: [{ id: 'test_knight', x: 2, y: 4, hp: 10 }] },
      { id: 'peb_this_is_fine', tg: [4, 4], at: [4, 4], enemies: [E(5, 4)], objects: [{ x: 4, y: 3, id: 'barrel_explosive' }] },
      { id: 'peb_bbq', tg: [4, 4], at: [4, 4], enemies: [E(5, 4), E(4, 6)], setup: burning },
      { id: 'peb_puppy_eyes', tg: [3, 4], enemies: [E(3, 4)] },
      { id: 'peb_signature', lv: 1, tg: [4, 4], at: [4, 4], enemies: [E(5, 4), E(4, 6), E(4, 7)] },
    ];
    let n = 0;
    cases.forEach(function (c) {
      const lvs = c.lv ? [c.lv] : [1, 2, 3];
      lvs.forEach(function (lv) {
        const pool = POOL.indexOf(c.id) >= 0;
        const a = arena({ at: c.at || [1, 4], skills: pool ? [[c.id, lv]] : [], enemies: c.enemies, heroes: c.heroes, terrain: c.terrain, objects: c.objects, surfaces: c.surfaces });
        if (c.hp) a.foes[0].hp = c.hp;
        if (c.setup) c.setup(a);
        const slot = c.id === 'peb_basic' ? a.p.basic : c.id === 'peb_signature' ? a.p.signature : a.slot(c.id);
        if (c.id === 'peb_signature') DD.Combat.state.hype = 100;
        previewThenUse(t, a.p, slot, c.tg[0], c.tg[1], c.id + ' L' + lv + (c.note ? ' ' + c.note : ''));
        n++;
      });
    });
    t.log('previews checked: ' + n);
  });

  // ---- v2 edge cases ----------------------------------------------------------------------------------------------------
  T.suite('hero_pebbles: v2 edge cases (stunned, silenced, sheep, charmed, AP, turn order, last foe)', function (t) {
    // stunned by an enemy on its turn: his next turn passes with 0 AP
    const st = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(2, 4)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    onTurns(function (u) { return u.side === 'enemy'; }, function () { if (DD.Combat.state.round === 1) DD.Act.addStatus(st.p, 'stun', { turns: 1 }, st.foes[0]); }, function () {
      DD.Combat.endTurn(); DD.Combat.endTurn();
    });
    t.ok(DD.Combat.state.round === 2 && DD.Combat.current() && DD.Combat.current().defId === 'test_knight', 'stunned: his round-2 turn passed by itself');
    t.ok(st.p.ap === 0 && DD.Combat.canUse(st.p, st.p.basic) !== true, 'no AP, no skills');
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === st.p && st.p.ap === 3 && !has(st.p, 'stun'), 'round 3: back to normal');
    // silenced: nothing of his is a spell
    const si = arena({ at: [1, 4], skills: [['peb_zoomies', 1], ['peb_fetch', 1], ['peb_bork', 1], ['peb_puppy_eyes', 1]], enemies: [E(2, 4), E(4, 4)] });
    DD.Act.addStatus(si.p, 'silenced', { turns: 1 }, si.foes[0]);
    DD.Combat.slotsOf(si.p).filter(function (sl) { return sl !== si.p.signature; }).forEach(function (sl) {
      t.eq(DD.Combat.canUse(si.p, sl), true, 'silenced: ' + sl.id + ' still works (barks are not spells)');
    });
    // sheep: no skills
    const sh = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], enemies: [E(4, 4)] });
    DD.Act.addStatus(sh.p, 'sheep', { turns: 1 }, sh.foes[0]);
    t.ok(/Baa/.test(String(DD.Combat.canUse(sh.p, sh.p.basic))) && /Baa/.test(String(DD.Combat.canUse(sh.p, sh.slot('peb_zoomies')))), 'sheep: baa');
    // charmed by a grunt: 2 AP on his turn and his bites can't hurt the charmer
    const ch = arena({ at: [1, 4], skills: [['peb_wag', 1]], enemies: [E(2, 4), E(1, 5)] });
    onTurns(function (u) { return u === ch.foes[0]; }, function () { DD.Act.addStatus(ch.p, 'charmed', { turns: 1 }, ch.foes[0]); }, function () { DD.Combat.endTurn(); });
    t.ok(DD.Combat.current() === ch.p && ch.p.ap === 2, 'charmed: 2 AP');
    use(t, ch.p, ch.slot('peb_wag'), 1, 4, 'charmed wag');
    t.ok(ch.foes[0].hp === 14 && ch.foes[1].hp === 10, 'the wag spares his charmer, not the other grunt');
    // not enough AP / not his turn
    const ap = arena({ at: [1, 4], skills: [['peb_chew_toy', 1], ['peb_bbq', 1]], enemies: [E(2, 4)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    use(t, ap.p, ap.p.basic, 2, 4, 'nibble');
    use(t, ap.p, ap.p.basic, 2, 4, 'nibble 2');
    t.eq(DD.Combat.canUse(ap.p, ap.slot('peb_chew_toy')), 'Not enough AP.', '1 AP left: Chew Toy needs 2');
    DD.Combat.endTurn();
    t.ok(/Not Pebbles's turn|Not Pebbles' turn|Not Pebbles/.test(String(DD.Combat.canUse(ap.p, ap.p.basic))), 'on the knight\'s turn he waits: ' + DD.Combat.canUse(ap.p, ap.p.basic));
    // Dazzled (hero: −1 max range): Fetch Quest 3 instead of 4
    const dz = arena({ at: [1, 4], skills: [['peb_fetch', 1]], enemies: [E(5, 4), E(3, 5)] });
    DD.Act.addStatus(dz.p, 'dazzled', { turns: 1 }, dz.foes[0]);
    t.ok(!valid(dz.p, dz.slot('peb_fetch'), 5, 4) && valid(dz.p, dz.slot('peb_fetch'), 3, 5), 'dazzled: Fetch Quest reaches 3, not 4');
    // killing the last foe mid-skill wins the fight
    const vk = DD.Combat.sandbox({ w: 9, h: 9, seed: 3, enemyAi: false, heroes: [{ id: 'pebbles', x: 4, y: 4, skills: [{ id: 'peb_wag', level: 3 }] }],
      enemies: [{ id: 'test_minion', x: 5, y: 4 }, { id: 'test_minion', x: 3, y: 4 }] });
    use(t, vk.units[0], slotOf(vk.units[0], 'peb_wag'), 4, 4, 'final wag');
    t.eq(vk.result, 'victory', 'killing the last foes mid-skill wins the fight');
    // a downed Pebbles: his passive does not fire, his turn is skipped
    const dn = arena({ at: [1, 4], surfaces: [{ x: 1, y: 4, id: 'fire', turns: 3 }], enemies: [E(2, 4)], heroes: [{ id: 'test_knight', x: 1, y: 7 }] });
    DD.Act.damage(dn.foes[0], dn.p, 99, {});
    t.ok(dn.p.downed, 'downed');
    DD.Combat.endRound();
    t.ok(dn.p.downed && dn.p.hp === 0, 'a downed dog in fire does not heal (or burn)');
    t.eq(DD.Combat.initOf ? DD.Combat.initOf(arena({ at: [1, 4] }).p) : 3, 3, 'initiative modifier +3');
  });

  // ---- AutoPlay ---------------------------------------------------------------------------------------------------------
  T.suite('hero_pebbles: AutoPlay battles at levels 1 / 3 / 5 (party Pebbles + fixture knight, cleric, mage)', function (t) {
    const loadouts = {
      1: [['peb_zoomies', 1], ['peb_fetch', 1]],
      3: [['peb_zoomies', 2], ['peb_chew_toy', 1], ['peb_wag', 1], ['peb_bbq', 1]],
      '3b': [['peb_fetch', 1], ['peb_bork', 1], ['peb_support', 1], ['peb_this_is_fine', 1]],
      5: [['peb_chew_toy', 2], ['peb_wag', 2], ['peb_bbq', 2], ['peb_puppy_eyes', 1]],
      '5b': [['peb_zoomies', 2], ['peb_fetch', 2], ['peb_this_is_fine', 2], ['peb_support', 2]],
    };
    const fights = [[1, 1, 'normal'], [1, 1, 'elite'], [1, 1, 'boss'], [2, 3, 'normal'], [2, '3b', 'elite'], [2, 3, 'boss'],
      [3, 5, 'normal'], [3, '5b', 'elite'], [3, 5, 'boss'], [1, '3b', 'normal'], [2, '5b', 'normal'], [3, '3b', 'normal']];
    const used = {};
    const orig = DD.Combat.useSkill;
    const results = [];
    let wins = 0;
    DD.Combat.useSkill = function (unit, slot) {
      const r = orig.apply(this, arguments);
      if (r && unit && slot && unit.defId === 'pebbles') used[slot.id] = (used[slot.id] || 0) + 1;
      return r;
    };
    try {
      fights.forEach(function (f, i) {
        const act = f[0], key = f[1], kind = f[2], lvl = parseInt(key, 10);
        const enc = DD.getEncounter('test_a' + act + '_' + kind);
        if (!enc) { t.fail('fixture encounter missing: test_a' + act + '_' + kind); return; }
        const party = ['pebbles', 'test_knight', 'test_cleric', 'test_mage'].map(function (id) {
          if (id === 'pebbles') return DD.Combat.makeRunHero({ id: id, level: lvl, skills: loadouts[key].map(function (e) { return { id: e[0], level: e[1] }; }) });
          const h = DD.getHero(id);
          return DD.Combat.makeRunHero({ id: id, level: lvl, skills: h.skillPool.slice(0, 4).map(function (sid) { return { id: sid, level: Math.min(3, 1 + Math.floor(lvl / 3)) }; }) });
        });
        const seed = (Number(t.seed) || 1) * 37 + (i + 1) * 7919;
        const setup = DD.Encounter.build(enc, party, { rng: DD.RNG(seed), difficulty: 'normal', act: act });
        DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: kind });
        const r = DD.AutoPlay.runBattle(30);
        const s = DD.Combat.state;
        const p = s.units.filter(function (u) { return u.defId === 'pebbles'; })[0];
        t.ok(p && isFinite(p.hp) && p.hp >= 0 && p.hp <= p.maxHp, enc.id + ' L' + lvl + ': Pebbles sane');
        t.ok(!!s.order && s.order.length > 0, enc.id + ': initiative rolled');
        t.ok(r.result === 'victory' || r.result === 'defeat' || r.timeout, enc.id + ' L' + lvl + ': the battle ends (' + r.result + ', ' + r.rounds + ' rounds)');
        if (r.result === 'victory') wins++;
        results.push(enc.id + ' L' + key + ': ' + (r.result || 'timeout') + ' in ' + r.rounds + ' (Pebbles ' + (p.downed ? 'downed' : p.hp + '/' + p.maxHp) +
          ', dealt ' + ((s.stats.units[p.id] || {}).dmg || 0) + ')');
      });
      // a full Hype bar and foes all around: AutoPlay throws the party
      const a = arena({ at: [4, 4], level: 5, enemies: [E(5, 4, 'test_grunt', 2), E(3, 4, 'test_grunt', 2), E(4, 5, 'test_grunt', 2), E(4, 3, 'test_grunt', 2)] });
      a.s.hype = 100;
      const before = used.peb_signature || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.peb_signature || 0) > before, 'AutoPlay uses Hot Diggity Dog! with 100 Hype and 4 foes around him');
      // a grunt with a pit behind it: an environmental kill beats a bite
      const pit = arena({ at: [3, 4], level: 3, skills: [['peb_wag', 1], ['peb_chew_toy', 1]], enemies: [E(4, 4), E(7, 7)], terrain: { '5,4': 'pit' } });
      const w0 = used.peb_wag || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.peb_wag || 0) > w0 && pit.foes[0].dead, 'AutoPlay wags the grunt into the pit behind it');
      // Burning foes around him: barbecue time
      const bq = arena({ at: [4, 4], level: 3, skills: [['peb_bbq', 1], ['peb_zoomies', 1]], enemies: [E(5, 4), E(4, 6), E(2, 4)] });
      bq.foes.forEach(function (f) { DD.Act.addStatus(f, 'burn', { stacks: 2 }, bq.p); });
      const b0 = used.peb_bbq || 0;
      DD.AutoPlay.takeTurn();
      t.ok((used.peb_bbq || 0) > b0, 'AutoPlay barbecues three Burning foes');
    } finally { DD.Combat.useSkill = orig; }
    t.log(results.join(' | '));
    t.log('Pebbles skill uses: ' + Object.keys(used).map(function (k) { return k + '×' + used[k]; }).join(', '));
    t.ok((used.peb_basic || 0) > 0, 'Spicy Nibble used');
    const poolUsed = Object.keys(used).filter(function (k) { return POOL.indexOf(k) >= 0; });
    t.ok(poolUsed.length >= 6, 'at least 6 different pool skills used by AutoPlay (' + poolUsed.join(', ') + ')');
    t.ok(wins >= 8, 'the party wins most fixture fights (' + wins + '/' + fights.length + ')');
  });

  // ---- v2 requests (Nov 3): flyers ignore the floor, heals bring the downed back up, barrels ---------------------------
  T.suite('hero_pebbles: v2 requests — a flying Pebbles floats over the fire (no Hot Dog heal, zoomies feel no floor), Emotional Support Dog gets a downed ally up, his bites set off barrels', function (t) {
    // 1. Hot Dog is a floor effect: ending his turn over fire heals a walking Pebbles, never a flying one
    const a = arena({ at: [3, 4], hp: 10, skills: [['peb_this_is_fine', 1]], surfaces: [{ x: 3, y: 4, id: 'fire', turns: 9 }], enemies: [E(8, 8)] });
    const p = a.p, fine = sk('peb_this_is_fine');
    t.ok(DD.Pebbles.inFire(p), 'walking: he stands in the fire');
    t.ok(fine.aiScore(DD.Targeting.buildCtx(p, a.slot('peb_this_is_fine'), { x: p.x, y: p.y })) > 0, 'walking: This Is Fine is worth his cosy heal');
    let hp0 = p.hp;
    DD.Combat.endTurn();
    t.eq(p.hp, hp0 + DD.Pebbles.COZY_HEAL, 'walking: ending his turn in the fire heals ' + DD.Pebbles.COZY_HEAL);
    p.flags.flying = true;
    t.ok(!DD.Pebbles.inFire(p), 'flying: he floats above the fire');
    t.eq(fine.aiScore(DD.Targeting.buildCtx(p, a.slot('peb_this_is_fine'), { x: p.x, y: p.y })), 0, 'flying: This Is Fine is worth no cosy heal');
    hp0 = p.hp;
    DD.Combat.endTurn();
    t.eq(p.hp, hp0, 'flying: no Hot Dog heal over the fire');
    // 2. Hot Zoomies' routes read the per-unit hazards: a walker detours around poison, a flyer zooms straight over it
    const z = arena({ at: [1, 4], skills: [['peb_zoomies', 1]], surfaces: [{ x: 2, y: 4, id: 'poison', turns: 9 }], enemies: [E(8, 8)] });
    const walk = DD.Pebbles.zoomPath(z.p, { x: 3, y: 4 }, 4);
    t.ok(walk && walk.length === 4 && !walk.some(function (q) { return q.x === 2 && q.y === 4; }), 'walking: the route skirts the poison (' + JSON.stringify(walk) + ')');
    z.p.flags.flying = true;
    const fly = DD.Pebbles.zoomPath(z.p, { x: 3, y: 4 }, 4);
    t.ok(fly && fly.length === 2 && fly[0].x === 2 && fly[0].y === 4, 'flying: straight over the puddle (' + JSON.stringify(fly) + ')');
    // 3. Emotional Support Dog aimed at a downed ally: back up with the heal as its HP, Inspired, on its own slot
    [1, 2, 3].forEach(function (lv) {
      const Lv = L('peb_support', lv);
      const b = arena({ at: [3, 4], skills: [['peb_support', lv]], heroes: [{ id: 'test_knight', x: 4, y: 4 }], enemies: [E(8, 8)] });
      const k = at(4, 4), sl = b.slot('peb_support');
      DD.Act.kill(k, null);
      t.ok(k.downed && !k.dead, 'L' + lv + ': premise: the knight is down');
      const tg = DD.Targeting.validTargets(b.p, sl).filter(function (q) { return q.x === 4 && q.y === 4; })[0];
      t.ok(tg && tg.revive === true, 'L' + lv + ': the downed knight is a target (revive)');
      const prev = DD.Combat.preview(b.p, sl, 4, 4);
      const e = prev.perUnit[k.id];
      t.ok(e && e.revived && e.heal === Lv.heal && e.text.indexOf('UP! ' + Lv.heal + ' HP') >= 0, 'L' + lv + ': the preview says UP! ' + Lv.heal + ' HP (' + (e && e.text) + ')');
      use(t, b.p, sl, 4, 4, 'L' + lv + ' lick on the downed knight');
      t.ok(!k.downed && k.hp === Lv.heal, 'L' + lv + ': back on its feet with ' + Lv.heal + ' HP (' + k.hp + ')');
      t.ok(has(k, 'inspired'), 'L' + lv + ': and Inspired');
      t.eq(b.p.ap, 2, 'L' + lv + ': 1 AP');
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && k.ap === k.maxAp, 'L' + lv + ': it acts on its own slot this round, with its full AP');
    });
    // 4. Spicy Nibble on an explosive barrel: it goes off at once; the fire blast can't hurt him
    const c = arena({ at: [3, 4], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }], enemies: [E(5, 4), E(8, 8)] });
    const g = at(5, 4), g0 = g.hp, p0 = c.p.hp;
    t.ok(DD.Targeting.validTargets(c.p, c.p.basic).some(function (q) { return q.obj === 'barrel_explosive' && q.x === 4 && q.y === 4; }), 'Spicy Nibble can be aimed at the barrel');
    const prev = DD.Combat.preview(c.p, c.p.basic, 4, 4);
    t.eq(prev.detonates, 'barrel_explosive', 'the preview detonates it');
    use(t, c.p, c.p.basic, 4, 4, 'nibble a barrel');
    t.ok(!DD.Grid.tile(4, 4).obj, 'the barrel went off');
    t.ok(g.hp < g0 && g0 - g.hp === prev.perUnit[g.id].dmg, 'the grunt next to it takes the blast, as previewed (' + (g0 - g.hp) + ')');
    t.eq(c.p.hp, p0, 'Pebbles, in the blast, is fireproof');
    t.eq(c.p.ap, 2, '1 AP');
  });
})();
