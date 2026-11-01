/* Dungeons and Degenerates — tests/sprite_tests.js (RENDER-SPRITES)
 * Suites "sprites: ..." — procedural sprite painter (every SpriteSpec option, poses, statuses, portraits, drawUnit),
 * FX playback handlers + DD.FXRender layers, DD.Audio robustness and the debug gallery. Runs headless on offscreen canvases.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  if (!T) return;

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  /** Opaque-pixel count (sampled every 2nd pixel) — proves something was actually painted. */
  function ink(c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 8) if (d[i] > 24) n++;
    return n;
  }
  function errorsSince(n) { return DD.problems.slice(n).filter(function (p) { return /^Error in /.test(p); }); }
  /** Remove warnings a test provoked on purpose (asserted first) so the harness doesn't count them. */
  function dropProblems(from) { DD.problems.splice(from, DD.problems.length - from); }
  function withDefs(defs, fn) {
    const added = [];
    for (let i = 0; i < defs.length; i++) {
      const bag = DD.defs[defs[i].bag];
      if (bag[defs[i].def.id]) continue;
      bag[defs[i].def.id] = defs[i].def; added.push(defs[i]);
    }
    try { return fn(); } finally { for (let i = 0; i < added.length; i++) delete DD.defs[added[i].bag][added[i].def.id]; }
  }
  const BASE = { base: 'humanoid', build: 'normal', outfit: 'tunic', palette: { skin: '#f0c49a', cloth: '#4f7fd6' }, head: { hair: 'short' } };
  function variant(over) {
    const s = JSON.parse(JSON.stringify(BASE));
    for (const k in over) {
      if (k === 'head') Object.assign(s.head, over.head);
      else if (k === 'palette') Object.assign(s.palette, over.palette);
      else s[k] = over[k];
    }
    return s;
  }
  function fakeUnit(id, defId, kind, extra) {
    const u = Object.assign({ id: id, defId: defId, kind: kind, side: kind === 'enemy' ? 'enemy' : 'hero', name: id, x: 2, y: 2,
      hp: 20, maxHp: 20, block: 0, facing: 1, statuses: [], dead: false, downed: false, flags: {}, tags: [], data: {} }, extra || {});
    DD.FX.initVis(u);
    return u;
  }

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('sprites: painter helper g', function (t) {
    const S = DD.Sprites;
    t.ok(S && typeof S.draw === 'function' && typeof S.drawUnit === 'function' && typeof S.portrait === 'function', 'DD.Sprites API present');
    const c = canvas(120, 120), ctx = c.getContext('2d');
    const g = S.painter(ctx, { accent: '#ff0000' }, 0.5);
    ['circle', 'ellipse', 'rect', 'poly', 'line', 'arc', 'text', 'limb', 'path', 'shaded', 'glow', 'star', 'heart', 'flame', 'note', 'shade', 'rgba']
      .forEach(function (m) { t.ok(typeof g[m] === 'function', 'g.' + m + ' exists'); });
    t.ok(g.pal && g.pal.accent === '#ff0000' && typeof g.lw === 'number' && typeof g.outline === 'string' && g.t === 0.5, 'g.pal / g.lw / g.outline / g.t');
    t.tryRun('helpers', function () {
      ctx.translate(60, 100);
      g.circle(0, -20, 6, '#ffcc00'); g.ellipse(10, -10, 6, 3, g.pal.accent, null, 0.3); g.rect(-20, -40, 10, 8, '#00ff00', undefined, 2);
      g.poly([[0, 0], [10, -5], [5, 5]], '#0000ff'); g.poly([0, 0, -10, -5, -5, 5], '#0000ff', false); g.poly([{ x: 1, y: 1 }, { x: 4, y: 9 }, { x: 8, y: 2 }], '#fff');
      g.line(-30, -50, 30, -50, '#fff', 2); g.arc(0, -60, 8, 0, Math.PI, '#fff', 1.5, '#f0f'); g.text('Hi', 0, -70, 10, '#fff');
      g.limb(-20, -10, -10, 0, 3, '#c90', -18, -2); g.path(function (p) { p.moveTo(0, 0); p.lineTo(5, -5); p.closePath(); }, '#abc');
      g.shaded(function (p) { p.arc(20, -30, 7, 0, Math.PI * 2); }, '#8844aa', { hl: [18, -33, 2, 1] }); g.glow(0, -40, 12, '#ff8800', 0.5);
      g.star(-25, -70, 4, '#ff0', null, 5); g.heart(25, -70, 3, '#f6a'); g.flame(0, -5, 6, 10, '#f80', null, 1); g.note(-35, -20, 3, '#ff0');
    });
    t.ok(ink(c) > 200, 'helpers painted pixels');
    t.ok(/^rgb\(/.test(g.shade('#808080', -0.2)) && g.rgba('#ffffff', 0.5).indexOf('rgba(') === 0, 'shade/rgba helpers return colours');
    const c2 = canvas(60, 60);
    S.paint(c2.getContext('2d'), 30, 50, 1, function (gg) { gg.rect(-8, -16, 16, 16, gg.pal.cloth); });
    t.ok(ink(c2) > 30, 'DD.Sprites.paint runs a painter at a point');
  });

  T.suite('sprites: every spec option renders', function (t) {
    const S = DD.Sprites, O = S.OPTIONS, p0 = DD.problems.length;
    const c = canvas(180, 170), ctx = c.getContext('2d');
    const cases = [];
    O.build.forEach(function (v) { cases.push(['build', v, variant({ build: v })]); });
    O.outfit.forEach(function (v) { cases.push(['outfit', v, variant({ outfit: v })]); });
    ['ears', 'horns', 'hair', 'beard', 'hat', 'face', 'eyes', 'mouth'].forEach(function (k) {
      O[k].forEach(function (v) { const h = {}; h[k] = v; cases.push(['head.' + k, v, variant({ head: h })]); });
    });
    ['wings', 'tail', 'mainhand', 'offhand'].forEach(function (k) { O[k].forEach(function (v) { const o = {}; o[k] = v; cases.push([k, v, variant(o)]); }); });
    O.bling.forEach(function (v) { cases.push(['bling', v, variant({ bling: [v] })]); });
    O.extras.forEach(function (v) { cases.push(['extras', v, variant({ extras: [v] })]); });
    O.aura.forEach(function (v) { cases.push(['aura', v, variant({ aura: { kind: v, color: '#66ccff' } })]); });
    O.quadruped.legs.forEach(function (l) { O.quadruped.snout.forEach(function (sn) {
      cases.push(['quadruped', l + '/' + sn, { base: 'quadruped', shape: { legs: l, snout: sn, body: sn === 'flat' ? 'round' : 'long', fluff: l === 'short' }, head: { ears: 'cat' }, tail: 'dog' }]);
    }); });
    [{ wobble: 0 }, { wobble: 2, translucent: true }, { cube: true }].forEach(function (sh, i) { cases.push(['blob', 'shape' + i, { base: 'blob', shape: sh, head: { eyes: 'big', mouth: 'grin', hat: i === 0 ? 'tophat' : 'none' } }]); });
    O.flyer.body.forEach(function (b) { cases.push(['flyer', b, { base: 'flyer', shape: { body: b, stalks: b === 'orb' ? 5 : 0 }, head: { mouth: 'fangs' } }]); });
    O.swarm.of.forEach(function (o) { cases.push(['swarm', o, { base: 'swarm', shape: { of: o, count: 6 }, bling: ['crown'] }]); });
    O.construct.kind.forEach(function (k) { cases.push(['construct', k, { base: 'construct', shape: { kind: k }, mainhand: 'sword', offhand: 'shield' }]); });
    cases.push(['custom', 'draw', { base: 'custom', draw: function (g) { g.rect(-8, -30, 16, 30, g.pal.cloth); } }]);
    cases.push(['overlay', 'humanoid', variant({ overlay: function (g) { g.circle(0, -44, 3, '#ff0'); } })]);

    let drawn = 0, empty = [];
    cases.forEach(function (cs) {
      const spec = cs[2];
      O.poses.forEach(function (pose) {
        [1, -1].forEach(function (facing) {
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
          t.tryRun(cs[0] + '=' + cs[1] + ' ' + pose, function () {
            S.draw(ctx, spec, 90, 130, 1.6, { t: 1.37, pose: pose, poseT: pose === 'attack' ? 0.45 : undefined, facing: facing, walk: 0.25 });
          });
          if (pose === 'idle' && facing === 1) { if (ink(c) > 40) drawn++; else empty.push(cs[0] + '=' + cs[1]); }
        });
      });
    });
    t.eq(empty.length, 0, 'every option paints visible pixels' + (empty.length ? ' (empty: ' + empty.join(', ') + ')' : ''));
    t.ok(drawn === cases.length, cases.length + ' option variants drawn in all poses and both facings');
    t.eq(errorsSince(p0).length, 0, 'no swallowed painter errors');
    const unknown = DD.problems.slice(p0).filter(function (p) { return /Sprite/.test(p); });
    t.eq(unknown.length, 0, 'documented option values never warn: ' + unknown.slice(0, 3).join(' | '));
    // sampled zoom-1 readability: a medium humanoid is ~40 px tall
    const m = S.metrics(BASE);
    t.ok(m.height >= 34 && m.height <= 48, 'medium humanoid is ~40px tall at zoom 1 (got ' + Math.round(m.height) + ')');
  });

  T.suite('sprites: sample specs and portraits', function (t) {
    const S = DD.Sprites, p0 = DD.problems.length;
    t.ok(Array.isArray(S.samples) && S.samples.length > 100, 'sample spec set exists (' + (S.samples || []).length + ')');
    const groups = {};
    S.samples.forEach(function (s) { groups[s.group] = true; });
    (S.sampleGroups || []).forEach(function (gname) { t.ok(groups[gname], 'sample group "' + gname + '" populated'); });
    const c = canvas(160, 160), ctx = c.getContext('2d');
    let bad = [];
    S.samples.forEach(function (s) {
      ctx.clearRect(0, 0, 160, 160);
      t.tryRun('sample ' + s.id, function () { S.draw(ctx, s.spec, 80, 140, 1.5, { t: 0.8 }); });
      if (ink(c) < 40) bad.push(s.id);
      const p = S.portrait(s.spec, 48);
      if (!p || p.width !== 48 || ink(p) < 100) bad.push('portrait ' + s.id);
    });
    t.eq(bad.length, 0, 'every sample + portrait paints (' + bad.slice(0, 5).join(', ') + ')');
    t.eq(errorsSince(p0).length, 0, 'no swallowed errors');
  });

  T.suite('sprites: drawUnit (defs, vis, poses, statuses, overrides)', function (t) {
    const S = DD.Sprites, p0 = DD.problems.length;
    const hero = { id: '__spr_hero', name: 'Spr Hero', __kind: 'heroes', color: '#e25822', flags: { flying: true }, sprite: variant({ wings: 'fairy', head: { ears: 'elf' } }) };
    const foe = { id: '__spr_foe', name: 'Spr Foe', __kind: 'enemies', act: 1, tier: 'normal', sprite: { base: 'blob', head: { eyes: 'big' } } };
    const pet = { id: '__spr_pet', name: 'Spr Pet', __kind: 'summons', sprite: { base: 'quadruped', scale: 0.7, head: { ears: 'cat' } } };
    withDefs([{ bag: 'heroes', def: hero }, { bag: 'enemies', def: foe }, { bag: 'summons', def: pet }], function () {
      const c = canvas(200, 200), ctx = c.getContext('2d');
      const draw = function (u, t) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 200, 200); S.drawUnit(ctx, u, 100, 160, 2, t || 1); return ink(c); };
      const h = fakeUnit('h1', '__spr_hero', 'hero'), e = fakeUnit('e1', '__spr_foe', 'enemy'), s = fakeUnit('s1', '__spr_pet', 'summon');
      t.ok(draw(h) > 100 && draw(e) > 100 && draw(s) > 100, 'hero / enemy / summon sprites resolve by kind');
      t.ok(S.metrics(h).hover > 0, 'flying hero hovers');
      t.ok(S.specFor(e) === foe.sprite && S.specFor(fakeUnit('x', '__nope', 'enemy')) === S.PLACEHOLDER, 'specFor + placeholder fallback');
      t.ok(draw(fakeUnit('x2', '__nope', 'enemy')) > 100, 'unknown def draws the unpainted-miniature placeholder');
      const big = Object.assign(fakeUnit('o1', '__spr_hero', 'hero'), { sprite: '__spr_foe' });
      t.ok(draw(big) > 100, 'unit.sprite override by def id');
      const base = draw(h);
      h.vis.alpha = 0.3; const faded = draw(h); h.vis.alpha = 1;
      t.ok(faded > 0 && faded <= base, 'vis.alpha fades the sprite');
      h.vis.flash = 1; t.ok(draw(h) > 100, 'hit flash draws'); h.vis.flash = 0;
      h.vis.scale = 1.5; t.ok(draw(h) > base, 'vis.scale enlarges'); h.vis.scale = 1;
      h.vis.offX = 30; t.ok(draw(h) > 50, 'vis.offX lunge offset'); h.vis.offX = 0;
      h.vis.downed = true; t.ok(draw(h) > 100, 'downed units lie on the ground'); h.vis.downed = false;
      ['attack', 'cast', 'hurt'].forEach(function (pose) {
        h.vis.pose = pose; h.vis.poseT = 0.5; h.vis._fxAt = performance.now();
        t.ok(draw(h) > 100, 'FX pose ' + pose);
      });
      h.vis.pose = null; h.vis._fxAt = undefined;
      h.vis.dead = true; t.eq(draw(h), 0, 'dead units are not drawn'); h.vis.dead = false;
      h.vis.hidden = true; t.eq(draw(h), 0, 'hidden (unspawned) units are not drawn'); h.vis.hidden = false;
      h.vis.deathT = 0.5; h.vis.dead = true; h.vis._fxAt = performance.now();
      t.ok(draw(h) > 0, 'a dying unit keeps drawing while its death FX plays'); h.vis.deathT = undefined; h.vis.dead = false;
      ['frozen', 'poison', 'burn', 'stealth', 'sheep', 'stun', 'sleep', 'charmed', 'confused', 'wet', 'root', 'invulnerable'].forEach(function (id) {
        e.statuses = [{ id: id, stacks: 1, turns: 1 }];
        t.ok(draw(e, 2.3) > 60, 'status visual: ' + id);
      });
      e.statuses = [];
      delete h.vis; t.ok(draw(h) > 100, 'drawUnit tolerates a unit without vis');
    });
    t.eq(errorsSince(p0).length, 0, 'no swallowed errors');
  });

  T.suite('sprites: portraits are cached', function (t) {
    const S = DD.Sprites;
    const def = { id: '__spr_port', name: 'Port', __kind: 'heroes', color: '#3fa7ff', sprite: variant({ head: { hat: 'wizard' } }) };
    withDefs([{ bag: 'heroes', def: def }], function () {
      const r0 = S.stats.portraitRenders;
      const a = S.portrait('__spr_port', 64), b = S.portrait('__spr_port', 64);
      t.ok(a instanceof HTMLCanvasElement && a.width === 64 && a.height === 64, 'portrait is a 64px canvas');
      t.ok(a === b && S.stats.portraitRenders === r0 + 1, 'second call hits the cache');
      t.ok(S.portrait(def, 64) === a, 'def object and def id share the cache');
      const c = S.portrait('__spr_port', 32);
      t.ok(c !== a && c.width === 32, 'different size is a different portrait');
      t.ok(ink(a) > 600, 'portrait has a painted background and figure');
      const host = document.createElement('div'); host.appendChild(a); document.body.appendChild(host);
      const d = S.portrait('__spr_port', 64);
      t.ok(d !== a && d.width === 64 && ink(d) > 600, 'a portrait already in the DOM is copied, not moved');
      document.body.removeChild(host);
      const nb = S.portrait('__spr_port', 64, { bg: false }), gray = S.portrait('__spr_port', 64, { gray: true, border: true });
      t.ok(nb !== a && ink(nb) < ink(a) && gray !== a, 'bg:false / gray variants are separate cache entries');
      t.ok(/^data:image\/png/.test(S.portraitURL('__spr_port', 40)), 'portraitURL gives a data URL');
      t.ok(S.portrait(def.sprite, 48).width === 48 && S.portrait('__does_not_exist', 48).width === 48, 'spec objects and unknown ids work');
    });
  });

  T.suite('sprites: broken content is contained', function (t) {
    const S = DD.Sprites, p0 = DD.problems.length;
    const c = canvas(120, 120), ctx = c.getContext('2d');
    const bad = { base: 'custom', draw: function () { throw new Error('boom'); } };
    for (let i = 0; i < 5; i++) S.draw(ctx, bad, 60, 100, 1, { t: i });
    const errs = errorsSince(p0);
    t.eq(errs.length, 1, 'a throwing spec.draw warns once (then draws the placeholder)');
    t.ok(ink(c) > 50, 'placeholder drawn instead');
    const over = variant({ overlay: function () { throw new Error('overlay boom'); } });
    for (let i = 0; i < 3; i++) S.draw(ctx, over, 60, 100, 1, { t: i });
    t.eq(errorsSince(p0).length, 2, 'a throwing overlay warns once');
    const weird = { base: 'dragonborn', build: 'chonky', palette: { skin: 'not-a-colour', cloth: 42 }, head: { hat: 'sombrero', size: 'big' }, bling: ['monocle'], aura: 'yes', scale: -3 };
    t.tryRun('garbage spec', function () { S.draw(ctx, weird, 60, 100, 1, { t: 0 }); S.portrait(weird, 32); S.metrics(weird); });
    t.tryRun('null spec / unit', function () { S.draw(ctx, null, 60, 100, 1); S.drawUnit(ctx, null, 0, 0, 1, 0); S.drawUnit(ctx, { id: 'z' }, 60, 100, 1, 0); });
    const warnings = DD.problems.slice(p0).filter(function (p) { return /^Sprite/.test(p); });
    t.ok(warnings.length >= 5, 'bad option values produce readable warnings (' + warnings.length + ')');
    dropProblems(p0); // provoked on purpose
  });

  T.suite('sprites: metrics', function (t) {
    const S = DD.Sprites;
    const small = S.metrics(variant({ build: 'tiny' })), huge = S.metrics(variant({ build: 'huge', scale: 2 }));
    t.ok(small.height > 20 && small.height < huge.height, 'builds and scale change height');
    t.ok(huge.scale === 2 && Math.abs(huge.width - S.metrics(variant({ build: 'huge' })).width * 2) < 0.01, 'metrics include spec scale');
    t.ok(S.metrics({ base: 'flyer' }).hover > 0 && S.metrics({ base: 'blob' }).hover === 0, 'flyers hover');
    ['humanoid', 'quadruped', 'blob', 'flyer', 'swarm', 'construct'].forEach(function (b) {
      const m = S.metrics({ base: b });
      t.ok(m.height > 10 && m.width > 10 && isFinite(m.headY), b + ' metrics sane');
    });
    const c = canvas(80, 40);
    t.tryRun('drawShadow', function () { S.drawShadow(c.getContext('2d'), BASE, 40, 20, 1); });
    t.ok(ink(c) > 20, 'shadow painted');
  });

  // ---------------------------------------------------------------------------------------------------------------
  // FX playback: run real DD.FX events through the handlers with fake units, outside instant mode.
  function withFx(units, fn) {
    const FX = DD.FX, saved = { instant: FX.instant, speed: FX.speed, resolve: FX.resolveUnit };
    FX.reset();
    DD.FXRender.clear();
    FX.instant = false; FX.speed = 1;
    FX.resolveUnit = function (id) { for (let i = 0; i < units.length; i++) if (units[i].id === id) return units[i]; return null; };
    try { return fn(FX); } finally {
      FX.reset(); DD.FXRender.clear();
      FX.instant = saved.instant; FX.speed = saved.speed; FX.resolveUnit = saved.resolve;
    }
  }
  function fakeView(c, t, dt) {
    return { ctx: c.getContext('2d'), zoom: 1.5, t: t, dt: dt, width: c.width, height: c.height,
      toScreen: function (x, y, h) { return { x: 200 + (x - y) * 48, y: 120 + (x + y) * 24 - (h || 0) * 24 }; } };
  }
  function play(FX, maxFrames, view, c) {
    let frames = 0, t = 0;
    while (FX.busy() && frames < maxFrames) {
      FX.update(16); t += 0.016; frames++;
      if (view) { const v = fakeView(c, t, 16); DD.FXRender.drawWorld(v); DD.FXRender.drawScreen(v); }
    }
    return frames;
  }

  T.suite('sprites: FX handlers cover every event type', function (t) {
    const H = DD.FX.handlers;
    ['move', 'slide', 'jump', 'teleport', 'lunge', 'projectile', 'beam', 'explosion', 'particles', 'damage', 'heal', 'block', 'status', 'text',
      'bark', 'death', 'downed', 'revive', 'spawn', 'shake', 'banner', 'flash', 'wait', 'call', 'tile', 'sound', 'custom',
      'turn', 'initiative', 'windup'].forEach(function (type) {
      t.ok(!!H[type], 'handler registered: ' + type);
    });
    t.ok(DD.FXRender && typeof DD.FXRender.drawWorld === 'function' && typeof DD.FXRender.drawScreen === 'function' && typeof DD.FXRender.shakeOffset === 'function', 'DD.FXRender API');
    t.ok(DD.FXRender.moments && typeof DD.FXRender.moments === 'object', 'DD.FXRender.moments (hosted moments, v2)');
  });

  T.suite('sprites: v2 markers — a hosted initiative moment blocks playback and folds the engine banner; turn moves shownTurn', function (t) {
    const FX = DD.FX;
    const M = DD.FXRender.moments;
    const prevHost = M.initiative;
    const inst = FX.instant;
    const p0 = DD.problems.length;
    const calls = [];
    try {
      FX.instant = false;
      FX.reset();
      DD.FXRender.clear();
      // no host: the marker is instant and the banner plays as usual
      delete M.initiative;
      FX.banner('Roll for initiative!', { sub: 'Someone goes first' });
      FX.text({ x: 1, y: 1 }, '🎲 12');
      const mk = FX.custom('initiative', { order: [{ unitId: 'a', roll: 12, init: 0, total: 12 }], ms: 0 });
      FX.update(16);
      t.ok(FX.active.some(function (e) { return e.type === 'banner'; }) && DD.FXRender.count() > 0, 'no host: the banner plays');
      FX.flush();
      t.eq(mk.ms, 0, 'no host: the marker takes no time');
      // a host that wants it: the banner is folded into the moment, the marker lasts what the host says
      M.initiative = { wants: function (evt) { return evt.order.some(function (r) { return r.roll > 0; }); }, start: function (evt) { calls.push(evt); return 1500; } };
      DD.FXRender.clear();
      const bn = FX.banner('Roll for initiative!', { sub: 'Someone goes first' });
      FX.text({ x: 1, y: 1 }, '🎲 12');
      const mk2 = FX.custom('initiative', { order: [{ unitId: 'a', roll: 12, init: 0, total: 12 }], ms: 0 });
      FX.push({ type: 'turn', unitId: 'a', round: 1, ms: 0 });
      // the folded banner takes no time, the dice text 70 ms, then the moment starts
      for (let i = 0; i < 12 && FX.active.indexOf(mk2) < 0; i++) FX.update(40);
      t.ok(bn.folded && bn.done, 'the banner was folded (no double announcement)');
      t.eq(calls.length, 1, 'the host started the moment once');
      t.eq(mk2.ms, 1500, 'the marker now lasts the moment');
      t.ok(FX.busy() && FX.active.indexOf(mk2) >= 0, 'playback waits on it');
      FX.update(1000);
      t.ok(FX.active.indexOf(mk2) >= 0, 'still playing after 1 s');
      mk2.elapsed = mk2.ms; // the host skips it
      FX.update(16);
      t.ok(!FX.busy(), 'skipping finishes it and playback moves on');
      t.ok(FX.shownTurn && FX.shownTurn.unitId === 'a', 'the turn marker moved DD.FX.shownTurn');
      // a fixed order (no dice): the host declines, nothing is folded
      const bn3 = FX.banner('Roll for initiative!', {});
      FX.custom('initiative', { order: [{ unitId: 'a', roll: 0, init: 0, total: 1 }], ms: 0 });
      FX.update(16);
      t.ok(!bn3.folded, 'a fixed order keeps its banner');
      FX.flush();
      t.eq(calls.length, 1, 'and no moment');
      // a throwing host is contained
      M.initiative = { start: function () { throw new Error('boom moment'); } };
      FX.custom('initiative', { order: [{ unitId: 'a', roll: 5, total: 5 }], ms: 0 });
      t.tryRun('throwing host', function () { FX.update(16); FX.flush(); });
      const errs = DD.problems.slice(p0).filter(function (w) { return /^Error in /.test(w); });
      t.ok(errs.length === 1 && /boom moment/.test(errs[0]), 'the broken host was reported once and playback went on');
      DD.problems.splice(p0);
    } finally {
      if (prevHost) M.initiative = prevHost; else delete M.initiative;
      FX.reset();
      FX.instant = inst;
      DD.FXRender.clear();
    }
  });

  T.suite('sprites: FX handlers start/update/end with fake units', function (t) {
    const p0 = DD.problems.length;
    const a = fakeUnit('fa', '__none', 'hero', { x: 1, y: 1 }), b = fakeUnit('fb', '__none', 'enemy', { x: 4, y: 2 });
    const c = canvas(400, 300);
    withFx([a, b], function (FX) {
      const H = FX.handlers;
      const evts = [
        { type: 'move', unit: a, unitId: a.id, path: [{ x: 2, y: 1, h: 0 }, { x: 3, y: 1, h: 1 }], ms: 230 },
        { type: 'slide', unit: b, unitId: b.id, from: { x: 4, y: 2, h: 0 }, to: { x: 5, y: 2, h: 0 }, ms: 170 },
        { type: 'jump', unit: a, unitId: a.id, from: { x: 3, y: 1, h: 1 }, to: { x: 3, y: 3, h: 0 }, ms: 340 },
        { type: 'teleport', unit: a, unitId: a.id, from: { x: 3, y: 3, h: 0 }, to: { x: 1, y: 1, h: 0 }, ms: 280 },
        { type: 'lunge', unit: a, unitId: a.id, to: { x: 2, y: 1, h: 0 }, ms: 170 },
        { type: 'projectile', from: { x: 1, y: 1, h: 0 }, to: { x: 5, y: 2, h: 0 }, kind: 'fireball', color: '#ffffff', ms: 260 },
        { type: 'beam', from: { x: 1, y: 1, h: 0 }, to: { x: 5, y: 2, h: 0 }, color: '#ff4444', width: 6, kind: 'lightning', ms: 330 },
        { type: 'explosion', at: { x: 5, y: 2, h: 0 }, radius: 2, color: '#ff8a1a', ms: 380 },
        { type: 'particles', at: { x: 5, y: 2, h: 0 }, kind: 'coins', count: 8, ms: 0 },
        { type: 'damage', unit: b, unitId: b.id, amount: 7, hp: 13, block: 0, element: 'fire', crit: true, blocked: 2, ms: 230 },
        { type: 'heal', unit: b, unitId: b.id, amount: 3, hp: 16, block: 0, ms: 200 },
        { type: 'block', unit: a, unitId: a.id, amount: 4, block: 4, ms: 120 },
        { type: 'status', unit: b, unitId: b.id, statusId: 'burn', text: '', ms: 140 },
        { type: 'text', unit: a, unitId: a.id, at: { x: 1, y: 1, h: 0 }, text: 'Hello', color: '#fff', size: 16, ms: 70 },
        { type: 'bark', unit: a, unitId: a.id, text: 'I am a very long bark that should wrap over a few lines in its bubble.', dur: 400, ms: 0 },
        { type: 'downed', unit: a, unitId: a.id, ms: 360 },
        { type: 'revive', unit: a, unitId: a.id, hp: 5, ms: 300 },
        { type: 'death', unit: b, unitId: b.id, ms: 420 },
        { type: 'spawn', unit: b, unitId: b.id, at: { x: 4, y: 4, h: 0 }, ms: 300 },
        { type: 'shake', intensity: 6, dur: 300, ms: 0 },
        { type: 'banner', text: 'ROUND 2', sub: 'Fight!', color: '#ffd76a', ms: 950 },
        { type: 'flash', color: '#ffffff', dur: 200, ms: 0 },
        { type: 'wait', ms: 300 },
        { type: 'tile', at: { x: 2, y: 2, h: 0 }, kind: 'crack', ms: 0 },
        { type: 'sound', name: 'hit', ms: 0 },
        { type: 'custom', draw: function (ctx, x, y, p) { ctx.fillRect(x, y, 4, 4 + p); }, at: { x: 1, y: 1, h: 0 }, ms: 300 },
      ];
      evts.forEach(function (e) {
        const h = H[e.type];
        t.tryRun(e.type + ' start/update/end', function () {
          e.elapsed = 0;
          if (h.start) h.start(e);
          if (h.update) { h.update(e, 0.25, 16); h.update(e, 0.5, 16); h.update(e, 0.9, 16); }
          e.done = true;
          if (h.end) h.end(e);
          FX.applyEnd(e);
        });
      });
      t.ok(DD.FXRender.count() > 10, 'handlers spawned non-blocking visuals (' + DD.FXRender.count() + ')');
      let tt = 0;
      t.tryRun('draw layers', function () {
        for (let i = 0; i < 20; i++) { tt += 0.016; const v = fakeView(c, tt, 16); DD.FXRender.drawWorld(v); DD.FXRender.drawScreen(v); }
      });
      t.ok(ink(c) > 500, 'FX layers painted');
      const s = DD.FXRender.shakeOffset();
      t.ok(isFinite(s.x) && isFinite(s.y), 'shakeOffset is numeric');
      // effects expire: advance ~6 s of frames
      for (let i = 0; i < 400; i++) { tt += 0.016; DD.FXRender.drawWorld(fakeView(c, tt, 16)); DD.FXRender.drawScreen(fakeView(c, tt, 16)); }
      t.eq(DD.FXRender.count(), 0, 'every effect expires (no leaks)');
      const z = DD.FXRender.shakeOffset();
      t.ok(z.x === 0 && z.y === 0, 'shake decays to zero');
    });
    t.eq(errorsSince(p0).length, 0, 'no swallowed errors');
  });

  T.suite('sprites: FX queue playback converges vis to logic', function (t) {
    const p0 = DD.problems.length;
    const a = fakeUnit('qa', '__none', 'hero', { x: 1, y: 1 }), b = fakeUnit('qb', '__none', 'enemy', { x: 3, y: 1 });
    const c = canvas(400, 300);
    withFx([a, b], function (FX) {
      a.x = 2; a.y = 1; FX.move(a, [{ x: 2, y: 1 }]);
      FX.lunge(a, b);
      FX.projectile(a, b, { kind: 'arrow' });
      b.hp = 12; FX.damage(b, 8, { element: 'frost' }); FX.sound('hit');
      FX.bark(b, 'Ow!');
      b.x = 4; FX.slide(b, { x: 3, y: 1 }, { x: 4, y: 1 });
      FX.status(b, 'stun', 'Stunned!');
      FX.text(b, 'BONK!', { color: '#ffe08a' });
      b.dead = true; FX.death(b, { cause: 'fall' });
      FX.banner('Victory!', { sub: 'Huzzah' });
      t.ok(FX.busy(), 'queue has events');
      const frames = play(FX, 2000, true, c);
      t.ok(!FX.busy() && frames < 2000, 'queue drains (' + frames + ' frames)');
      t.ok(a.vis.x === 2 && a.vis.y === 1 && a.vis.offX === 0 && a.vis.offY === 0, 'mover ends on its tile with no lunge offset');
      t.ok(b.vis.hp === 12 && b.vis.dead === true && b.vis.alpha === 0 && b.vis.x === 4, 'target hp/position/death converge');
      t.ok(!a.vis.pose && !a.vis.lift, 'transient pose fields cleared');
    });
    withFx([a], function (FX) {
      FX.speed = 4;
      a.x = 3; FX.move(a, [{ x: 3, y: 1 }]);
      const fast = play(FX, 500, false);
      t.ok(fast <= 4, 'DD.FX.speed shortens playback (' + fast + ' frames)');
    });
    t.eq(errorsSince(p0).length, 0, 'no swallowed errors');
  });

  T.suite('sprites: FXRender tolerates bad input', function (t) {
    const p0 = DD.problems.length;
    t.tryRun('missing view', function () { DD.FXRender.drawWorld(null); DD.FXRender.drawScreen({}); DD.FXRender.drawWorld({ ctx: null }); });
    withFx([], function (FX) {
      t.tryRun('odd events', function () {
        FX.projectile({ x: 1, y: 1 }, { x: 2, y: 2 }, { kind: 'banana' });
        FX.particles({ x: 1, y: 1 }, { kind: 'confetti', count: 9999 });
        FX.tile(1, 1, 'wobble');
        FX.damage({ id: 'ghost', hp: 1 }, 3);
        FX.bark({ id: 'ghost2' }, 'boo');
        FX.custom('mystery_type', { ms: 50 });
        play(FX, 200, true, canvas(100, 100));
      });
    });
    t.eq(errorsSince(p0).length, 0, 'no swallowed errors');
  });

  // ---------------------------------------------------------------------------------------------------------------
  /** Opaque bounding box { l, r, t, b } of a canvas (null when empty). */
  function bbox(c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let l = c.width, r = -1, tp = c.height, b = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 24) { if (x < l) l = x; if (x > r) r = x; if (y < tp) tp = y; if (y > b) b = y; }
    }
    return r < 0 ? null : { l: l, r: r, t: tp, b: b };
  }
  /** Opaque pixels inside a rectangle. */
  function inkIn(c, x0, y0, w, h) {
    const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 24) n++;
    return n;
  }

  T.suite('sprites: underlay, hunch, grapples and painted bounds', function (t) {
    const S = DD.Sprites, p0 = DD.problems.length;
    const c = canvas(200, 200), ctx = c.getContext('2d');
    const clear = function () { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 200, 200); };
    // underlay: painted at ground level behind the body (a floor glow far below the feet proves it ran)
    const lit = variant({ underlay: function (g) { g.rect(-30, 6, 60, 10, '#fff2a0'); } });
    clear(); S.draw(ctx, lit, 100, 120, 2, { t: 1 });
    t.ok(inkIn(c, 40, 132, 120, 20) > 500, 'spec.underlay paints (a floor pool under the feet)');
    clear(); S.draw(ctx, lit, 100, 120, 2, { t: 1, underlay: false });
    t.ok(inkIn(c, 40, 132, 120, 20) < 50, 'opts.underlay = false paints the bare body (silhouette masks, portraits)');
    clear(); S.draw(ctx, lit, 100, 120, 2, { t: 1, hover: 30, lift: 20 });
    t.ok(inkIn(c, 40, 132, 120, 20) > 500, 'the underlay stays on the ground while the body hovers or jumps');
    const boom = variant({ underlay: function () { throw new Error('underlay boom'); } });
    for (let i = 0; i < 3; i++) { clear(); S.draw(ctx, boom, 100, 120, 2, { t: i }); }
    t.eq(errorsSince(p0).length, 1, 'a throwing underlay warns once, then is skipped');
    t.ok(ink(c) > 100, '...and the body still draws');
    dropProblems(p0);

    // hunch: the head cranes forward and sinks, the feet stay planted
    const upright = variant({ outfit: 'robe', build: 'slim' }), hunched = variant({ outfit: 'robe', build: 'slim', hunch: 0.8 });
    t.ok(S.metrics(hunched).headY > S.metrics(upright).headY, 'a hunched head sits lower (metrics.headY)');
    clear(); S.draw(ctx, upright, 100, 160, 3, { t: 0, still: true, blink: false }); const bu = bbox(c);
    clear(); S.draw(ctx, hunched, 100, 160, 3, { t: 0, still: true, blink: false }); const bh = bbox(c);
    t.ok(bu && bh && bh.r > bu.r + 3, 'the hunched figure leans forward (right edge ' + (bh && bh.r) + ' vs ' + (bu && bu.r) + ')');
    t.ok(bu && bh && Math.abs(bh.b - bu.b) <= 2, 'feet stay planted');
    clear(); S.draw(ctx, hunched, 100, 160, 3, { t: 0, facing: -1, still: true }); const bl = bbox(c);
    t.ok(bl && bl.l < bu.l - 3, 'and mirrors with facing');

    // grapples explain the Root: no root vines on a held unit (sla_grappled, or any status flagged `holds`)
    const hold = { id: '__spr_hold', name: 'Held', __kind: 'statuses', type: 'debuff', holds: true };
    const pin = { id: '__spr_pin', name: 'Pinned', __kind: 'statuses', type: 'debuff', noMove: true };
    withDefs([{ bag: 'statuses', def: hold }, { bag: 'statuses', def: pin }], function () {
      const vines = function (ids) {
        clear(); S.draw(ctx, BASE, 100, 160, 3, { t: 0.5, still: true, statuses: new Set(ids) });
        return inkIn(c, 40, 158, 120, 12);
      };
      const bare = vines([]), rooted = vines(['root']);
      t.ok(rooted > bare + 30, 'Root shows vines at the feet (' + bare + ' -> ' + rooted + ' px)');
      t.ok(vines(['root', 'sla_grappled']) <= bare + 5, 'no vines when the root comes from Slate\'s grapple');
      t.ok(vines(['root', '__spr_hold']) <= bare + 5, 'nor from any status flagged holds: true');
      t.ok(vines(['root', '__spr_pin']) <= bare + 5, 'nor from the engine\'s noMove statuses');
    });

    // painted bounds: horns, hats and scale included; measured once per spec
    const tall = variant({ head: { hat: 'wizard' }, scale: 1.5 });
    const b1 = S.bounds(tall), b2 = S.bounds(BASE);
    t.ok(b1 && b2 && b1.h > b2.h * 1.4 && b1.t < b2.t, 'bounds grow with the hat and the scale (' + Math.round(b1.h) + ' vs ' + Math.round(b2.h) + ')');
    t.ok(S.bounds(tall) === b1, 'bounds are cached per spec');
    t.ok(b2.l < 0 && b2.r > 0 && b2.b > 0 && b2.b < 6, 'bounds are measured around the feet');
    const spinning = function (spin) { clear(); S.draw(ctx, BASE, 100, 120, 2, { t: 0, still: true, spin: spin }); return bbox(c); };
    const s0 = spinning(0), s1 = spinning(Math.PI / 2);
    t.ok(s0 && s1 && (s1.r - s1.l) > (s0.r - s0.l) + 10, 'opts.spin tumbles the body (thrown units)');
    t.eq(errorsSince(p0).length, 0, 'no swallowed errors');
  });

  T.suite('sprites: pushes fly as one arc, thrown units tumble', function (t) {
    const p0 = DD.problems.length;
    const thrower = fakeUnit('th_a', '__none', 'hero', { x: 1, y: 2 }), foe = fakeUnit('th_b', '__none', 'enemy', { x: 2, y: 2 });
    /** Play the queue, recording the foe's highest lift and whether it ever spun. */
    const run = function (FX) {
      let lift = 0, spun = false, frames = 0;
      while (FX.busy() && frames++ < 400) {
        FX.update(16);
        if (foe.vis.lift > lift) lift = foe.vis.lift;
        if (foe.vis.spin) spun = true;
      }
      return { lift: lift, spun: spun };
    };
    withFx([thrower, foe], function (FX) {
      // YEET: a lunge at the foe, then one slide per tile (what Act.push queues)
      FX.lunge(thrower, foe);
      FX.text(foe, 'YEET!');
      for (let x = 2; x < 5; x++) { FX.slide(foe, { x: x, y: 2 }, { x: x + 1, y: 2 }, { ms: 120 }); FX.sound('push'); }
      foe.x = 5;
      const r = run(FX);
      t.ok(r.lift > 18, 'a 3-tile push flies in one arc (peak lift ' + r.lift.toFixed(1) + ' px)');
      t.ok(r.spun, 'thrown right after a lunge: the foe tumbles');
      t.ok(foe.vis.x === 5 && !foe.vis.lift && !foe.vis.spin && !foe.vis.pose, 'lands on its tile, upright, pose cleared');
    });
    withFx([thrower, foe], function (FX) {
      FX.slide(foe, { x: 5, y: 2 }, { x: 6, y: 2 }, { ms: 120 });
      foe.x = 6;
      const r = run(FX);
      t.ok(r.lift < 1 && !r.spun, 'a 1-tile shove stays a slide');
    });
    withFx([thrower, foe], function (FX) {
      // a blocking event between the steps (e.g. a hazard hit on the way) splits the flight: each part lands
      FX.slide(foe, { x: 6, y: 2 }, { x: 7, y: 2 }, { ms: 120 });
      FX.slide(foe, { x: 7, y: 2 }, { x: 8, y: 2 }, { ms: 120 });
      FX.damage(foe, 2);
      FX.slide(foe, { x: 8, y: 2 }, { x: 9, y: 2 }, { ms: 120 });
      FX.slide(foe, { x: 9, y: 2 }, { x: 10, y: 2 }, { ms: 120 });
      foe.x = 10;
      let lifted = 0, peak = 0, frames = 0;
      while (FX.busy() && frames++ < 400) {
        FX.update(16);
        const playingDamage = FX.active.some(function (e) { return e.type === 'damage'; });
        if (playingDamage && foe.vis.lift > 0.5) lifted++;
        peak = Math.max(peak, foe.vis.lift || 0);
      }
      t.ok(peak > 8, 'both 2-tile parts arc (' + peak.toFixed(1) + ' px)');
      t.eq(lifted, 0, 'never left hanging in the air while something else plays');
    });
    withFx([thrower, foe], function (FX) {
      foe.x = 8; foe.y = 2; DD.FX.syncVis(foe);
      FX.lunge(thrower, foe);
      FX.jump(foe, { x: 8, y: 2 }, { x: 8, y: 5 }, { arc: 30, ms: 300 });
      foe.y = 5;
      t.ok(run(FX).spun, 'a jump right after a lunge at the unit is a throw: it tumbles');
      FX.jump(foe, { x: 8, y: 5 }, { x: 6, y: 5 }, { ms: 300 });
      foe.x = 6;
      t.ok(!run(FX).spun, 'a plain leap does not');
      FX.lunge(thrower, foe);
      FX.jump(foe, { x: 6, y: 5 }, { x: 6, y: 3 }, { ms: 300, spin: false });
      foe.y = 3;
      t.ok(!run(FX).spun, 'spin: false opts out');
      FX.jump(foe, { x: 6, y: 3 }, { x: 6, y: 1 }, { ms: 300, spin: 2 });
      foe.y = 1;
      t.ok(run(FX).spun && !foe.vis.spin, 'spin: n asks for n turns, and the unit lands upright');
    });
    t.eq(errorsSince(p0).length, 0, 'no swallowed errors');
  });

  T.suite('sprites: barks never pile up', function (t) {
    const p0 = DD.problems.length;
    const us = [0, 1, 2, 3].map(function (i) { return fakeUnit('bk' + i, '__none', i ? 'enemy' : 'hero', { x: 3 + (i % 2), y: 3 + (i >> 1) }); });
    const c = canvas(640, 400);
    withFx(us, function () {
      const barks = us.map(function (u, i) { return DD.FXRender.bark(u, i === 2 ? 'Roll for initiative. Actually, don\'t. I already did.' : 'Mine! All mine!', 3000); });
      const v = fakeView(c, 0.5, 16);
      v.widgets = { bk0: { id: 'bk0', x0: 140, x1: 260, y0: 120, y1: 140 } };
      DD.FXRender.drawScreen(v);
      const g = barks.map(function (e) { return e._geom; });
      t.ok(g.every(function (x) { return x && x.bw > 0; }), 'every bark was laid out');
      let overlaps = 0;
      for (let i = 0; i < g.length; i++) for (let k = i + 1; k < g.length; k++) {
        const a = g[i], b = g[k];
        if (a.bx < b.bx + b.bw && a.bx + a.bw > b.bx && a.by < b.by + b.bh && a.by + a.bh > b.by) overlaps++;
      }
      t.eq(overlaps, 0, 'four barks from neighbouring units do not overlap');
      t.ok(g[0].by + g[0].bh + g[0].tail <= 120 + 1, 'a bark sits above its speaker\'s HP widget (view.widgets)');
      t.ok(g.every(function (x) { return x.by >= 0 && x.bx >= 0 && x.bx + x.bw <= 640; }), 'all bubbles stay on screen');
      t.ok(ink(c) > 2000, 'bubbles painted');
    });
    t.eq(errorsSince(p0).length, 0, 'no swallowed errors');
  });

  // ---------------------------------------------------------------------------------------------------------------
  T.suite('sprites: audio API never throws', function (t) {
    const A = DD.Audio;
    t.ok(A && typeof A.play === 'function' && typeof A.setVolume === 'function' && typeof A.mute === 'function', 'DD.Audio API');
    const names = ['click', 'hover', 'hit', 'crit', 'fire', 'frost', 'zap', 'poison', 'heal', 'buff', 'debuff', 'push', 'bump', 'fall',
      'explosion', 'death', 'downed', 'levelup', 'coin', 'buy', 'error', 'turn', 'victory', 'defeat', 'bark', 'corgi', 'caw', 'roar',
      'magic', 'summon', 'step', 'slash', 'arrow', 'splash'];
    names.forEach(function (n) { t.ok(A.names.indexOf(n) >= 0, 'sound recipe: ' + n); });
    t.tryRun('play everything headless', function () { names.concat(['nope', null, 42]).forEach(function (n) { A.play(n, { vol: 2, pitch: 9 }); }); });
    t.eq(A.play('hit'), false, 'headless play is a silent no-op');
    t.eq(A.setVolume(0.3), 0.3, 'setVolume');
    t.eq(A.setVolume(7), 1, 'volume clamps');
    A.mute(true); t.ok(A.isMuted(), 'mute'); A.mute(false); t.ok(!A.isMuted() || (DD.Meta && DD.Meta.data && DD.Meta.data.settings && DD.Meta.data.settings.sfx === false), 'unmute');
    A.setVolume(0.6);
  });

  T.suite('sprites: gallery screen', function (t) {
    const G = DD.Gallery, p0 = DD.problems.length;
    t.ok(G && typeof G.mount === 'function' && typeof G.draw === 'function', 'DD.Gallery API');
    ['heroes', 'summons', 'enemies', 'bosses', 'act1', 'objects', 'specs', 'specs:hats', 'all', 'builds:normal', 'nope_nothing'].forEach(function (w) {
      const info = G.resolve(w);
      t.ok(info && typeof info.title === 'string' && Array.isArray(info.sections), 'resolve ' + w + ' -> ' + info.mode);
    });
    t.eq(G.resolve('builds:normal').mode, 'detail', 'a single id opens the detail view');
    const c = canvas(1280, 720);
    ['specs:hats', 'all', 'builds:normal', 'objects', 'nope_nothing'].forEach(function (w) {
      G.which = w;
      t.tryRun('draw ' + w, function () { G.draw({ ctx: c.getContext('2d'), width: 1280, height: 720, t: 1.1 }); });
    });
    t.ok(ink(c) > 5000, 'gallery painted');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px';
    document.body.appendChild(host);
    t.tryRun('mount/unmount', function () {
      G.mount(host, { which: 'specs:eyes' });
      t.ok(G.mounted && host.querySelector('canvas'), 'mount adds a canvas');
      G.unmount();
    });
    t.ok(!G.mounted && !host.querySelector('canvas'), 'unmount cleans up');
    document.body.removeChild(host);
    if (DD.UI && DD.UI.screens) t.ok(!!DD.UI.screens.gallery, 'registered as UI screen "gallery"');
    t.eq(errorsSince(p0).length, 0, 'no swallowed errors');
  });
})();
