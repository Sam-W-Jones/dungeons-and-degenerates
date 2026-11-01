/* Dungeons and Degenerates — js/data/heroes/basanos.js
 * Basanos the Mostly Housebroken, human werewolf (he/him, available from the start): melee in two forms.
 *   Human  — a disciplined swordsman: Silvered Sword basic; hits, shoves, taunts and bodyguarding.
 *   Wolf   — a savage skirmisher: +2 move, Claw basic (Bleed); rends, pounces, howls and bites.
 * Transform (a skill) swaps the forms. Skills are tagged 'human' or 'wolf'; the other form's are locked (canUse).
 * Passive Hair Trigger: damage that leaves him below half HP turns him into the werewolf for free.
 * The form is the status bas_wolf (the source of truth) plus bookkeeping in unit.data.bas: the move bonus, the basic
 * attack slot and the sprite override (unit.sprite logically, unit.vis.sprite in step with FX playback).
 * Registers: hero basanos, 13 skills (bas_*), status bas_wolf, 3 hero items. Test / debug API: DD.Basanos.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HERO = 'basanos';
  const WOLF = 'bas_wolf';             // status: werewolf form
  const SWORD = 'bas_sword', CLAW = 'bas_claw', TRANSFORM = 'bas_transform';
  const WOLF_MOV = 2;                  // werewolf form: +2 move
  const COLLAR = 'bas_flea_collar', COAT = 'bas_wolfsbane_coat', MOONFANG = 'bas_moonfang';
  const COAT_HEAL = 6;
  const CLAW_LV = [{ dmg: 4, bleed: 1 }, { dmg: 5, bleed: 1 }, { dmg: 5, bleed: 2 }];   // Claw by Transform level
  const MOON = '#ff5a4f';

  // ---- helpers ------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function byPos(a, b) { return a.y - b.y || a.x - b.x; }
  /** An attack's victim: both standing and on opposite sides (a forced resolve on a friend does nothing). */
  function foeOf(u, f) { return active(u) && active(f) && G().hostile(u, f); }
  /** Item check for combat units (items array), RunHeroes (slot object) or null. */
  function hasItem(user, id) {
    if (!user) return false;
    const items = user.items;
    if (Array.isArray(items)) return items.indexOf(id) >= 0;
    if (items && typeof items === 'object') { for (const k in items) if (items[k] === id) return true; }
    return !!(user.runHero && user.runHero !== user && hasItem(user.runHero, id));
  }
  function dataOf(u) {
    const d = u.data || (u.data = {});
    return d.bas || (d.bas = { wolf: false, mov: 0, collar: -1 });
  }
  /** Read-only view of his form bookkeeping (queries must not create it). */
  function peek(u) { return (u && u.data && u.data.bas) || null; }
  /** Bleed stacks a skill of his applies (Moonfang doubles them). */
  function bleedN(n, user) { return hasItem(user, MOONFANG) ? n * 2 : n; }
  function bleed(user, foe, n) { if (active(foe) && n > 0) A().addStatus(foe, 'bleed', { stacks: bleedN(n, user) }, user); }
  function formOf(def) {
    const tags = (def && def.tags) || [];
    return tags.indexOf('wolf') >= 0 ? 'wolf' : tags.indexOf('human') >= 0 ? 'human' : null;
  }

  // ---- forms ------------------------------------------------------------------------------------------
  function isWolf(u) { return !!u && A().hasStatus(u, WOLF); }
  /** Level of his socketed Transform (1 when it is not socketed): it sets the Claw's numbers. */
  function transformLevel(u) {
    const slots = u && Array.isArray(u.skills) ? u.skills : [];
    for (let i = 0; i < slots.length; i++) if (slots[i] && slots[i].id === TRANSFORM) return Math.max(1, Math.min(3, slots[i].level || 1));
    return 1;
  }
  /** His move without the werewolf bonus. */
  function baseMov(u) { const d = peek(u); return (u.mov || 0) - ((d && d.mov) || 0); }

  /** Swap the drawn sprite in step with FX playback (the logical override is set at once; previews skip this). */
  function showSprite(u, spec) {
    const before = u.sprite || HUMAN_SPRITE;
    if (spec) u.sprite = spec; else delete u.sprite;
    if (A().simulating) return;
    if (u.vis && !u.vis.sprite) u.vis.sprite = before;
    const shown = spec || HUMAN_SPRITE;
    DD.FX.call(function () { if (u.vis) u.vis.sprite = shown; });
  }

  /** Make the bookkeeping match the bas_wolf status (it can also vanish by a dispel or when he is downed). */
  function syncForm(u) {
    if (!u) return;
    const d = dataOf(u);
    const wolf = isWolf(u) && !u.downed && !u.dead;
    if (wolf && !d.wolf) {
      d.wolf = true;
      d.mov = WOLF_MOV;
      u.mov = (u.mov || 0) + WOLF_MOV;
      u.basic = A().makeSlot(CLAW, transformLevel(u));
      showSprite(u, WOLF_SPRITE);
    } else if (!wolf && d.wolf) {
      d.wolf = false;
      u.mov = Math.max(1, (u.mov || 0) - (d.mov || 0));
      d.mov = 0;
      u.basic = A().makeSlot(SWORD, 1);
      showSprite(u, null);
    } else return;
    A().touch();
  }

  /** Into the werewolf. why: 'skill' (Transform) | 'trigger' (Hair Trigger) | 'signature' (Blood Moon). */
  function becomeWolf(u, why) {
    if (!active(u) || isWolf(u)) return false;
    A().addStatus(u, WOLF, { silent: true }, u);
    if (!isWolf(u)) return false;
    syncForm(u);
    DD.FX.particles(u, { kind: 'smoke', color: '#8c8a96', count: 16 });
    DD.FX.particles(u, { kind: 'dust', count: 10 });
    DD.FX.sound('roar');
    DD.FX.text(u, why === 'trigger' ? 'HAIR TRIGGER!' : 'AWOOO!', { color: '#e8e2ff', size: why === 'trigger' ? 18 : 16 });
    A().log(why === 'trigger' ? u.name + ' is hurt and the wolf gets out (Hair Trigger).' : u.name + ' turns into the werewolf.', 'hero');
    if (why === 'trigger') {
      A().bark(u, 'trigger');
      if (hasItem(u, COAT)) A().heal(u, u, COAT_HEAL);
    } else if (why === 'skill') A().bark(u, 'wolf');
    return true;
  }
  function becomeHuman(u) {
    if (!u || !isWolf(u)) return false;
    A().removeStatus(u, WOLF, { silent: true });
    syncForm(u);
    if (active(u)) {
      DD.FX.particles(u, { kind: 'dust', count: 10 });
      DD.FX.text(u, 'Human again!', { color: '#ffe9c4', size: 15 });
      A().log(u.name + ' is human again (and very sorry).', 'hero');
      A().bark(u, 'human');
    }
    return true;
  }

  /** canUse gate of a form-tagged skill. */
  function gate(form) {
    return function (ctx) {
      const wolf = isWolf(ctx.user);
      if (form === 'wolf' && !wolf) return 'Werewolf form only (Transform first).';
      if (form === 'human' && wolf) return 'Human form only (Transform first).';
      return true;
    };
  }

  // ---- AutoPlay's Transform estimate ---------------------------------------------------------------------
  /** Damage-equivalent of one use of a skill (rough: AutoPlay prices the real outcome with dry runs afterwards). */
  function useValue(def, L, user) {
    const tags = def.tags || [];
    let v = (L.dmg || 0) + 0.8 * bleedN(L.bleed || 0, user) + (L.block || 0) * 0.3 + (L.push ? 1 : 0);
    if (tags.indexOf('stun') >= 0) v += 6;
    if (tags.indexOf('taunt') >= 0) v += 3;
    if (tags.indexOf('inspire') >= 0) v += 4;
    if (L.heal) v += L.heal * 0.3;
    return v;
  }
  /** How far from him a foe must stand for the skill to matter (melee 1, Pounce its range, self areas their radius). */
  function reachOf(def, L) {
    if (def.target && def.target.type === 'self') return def.area && def.area.shape === 'adjacent' ? 1 : Math.max(1, L.r || 1);
    const r = def.target && def.target.range;
    return Array.isArray(r) ? r[1] : typeof r === 'function' ? (DD.resolve(r, L, null, [1, 1])[1] || 1) : 1;
  }
  /** The slots a form can use: its basic attack plus the socketed skills of that form. */
  function formSlots(u, wolf) {
    const out = [{ id: wolf ? CLAW : SWORD, level: wolf ? transformLevel(u) : 1, cd: 0, uses: 0 }];
    (u.skills || []).forEach(function (sl) {
      const def = sl && DD.getSkill(sl.id);
      if (def && formOf(def) === (wolf ? 'wolf' : 'human')) out.push(sl);
    });
    return out;
  }
  /** Rough best value this form can get out of `ap` AP from here this turn (walking in with its move if needed). */
  function formValue(u, wolf, ap) {
    if (!(ap > 0)) return 0;
    const foes = DD.Combat.foesOf(u);
    if (!foes.length) return 0;
    // rooted or held: no walking in (Pounce still leaps)
    const mov = DD.Combat.cantMove(u) ? 0 : baseMov(u) + (wolf ? WOLF_MOV : 0);
    let best = 0;
    formSlots(u, wolf).forEach(function (sl) {
      const def = DD.getSkill(sl.id);
      if (!def || sl.cd > 0 || (def.charges > 0 && (sl.uses || 0) >= def.charges)) return;
      const L = DD.skillLevel(def, sl.level || 1);
      const cost = Math.max(1, DD.Combat.costOf(u, def, sl.level || 1).ap);
      const v = useValue(def, L, u);
      if (!(v > 0) || cost > ap) return;
      const reach = reachOf(def, L);
      let left = ap;
      if (!foes.some(function (f) { return dist(f, u) <= reach; })) {
        if (ap < cost + 1 || !foes.some(function (f) { return dist(f, u) <= reach + mov; })) return;
        left = ap - 1;
      }
      const uses = DD.Combat.cooldownOf(u, def, sl.level || 1) > 0 ? 1 : Math.floor(left / cost);
      best = Math.max(best, v * uses);
    });
    return best;
  }
  /** Transform's aiScore: what the other form could do with the AP left, minus what this one can do now. */
  function transformScore(ctx) {
    const u = ctx.user;
    if (!active(u) || !DD.Combat.state) return 0;
    const wolf = isWolf(u);
    const cost = DD.Combat.costOf(u, ctx.skill, ctx.level).ap;
    const now = formValue(u, wolf, u.ap || 0);
    let then = formValue(u, !wolf, (u.ap || 0) - cost);
    // below half HP the next hit turns him right back (Hair Trigger)
    if (wolf && u.hp * 2 < u.maxHp) then *= 0.5;
    return Math.max(0, then - now - 2);
  }

  // ---- sprites -------------------------------------------------------------------------------------------
  /** Human: a few too many scratches on the cheek and a moon pendant he swears is ironic. */
  function humanOverlay(g) {
    const H = g.head;
    if (!H) return;
    const r = H.r, red = '#c0392b';
    g.line(H.x + r * 0.35, H.y + r * 0.1, H.x + r * 0.62, H.y + r * 0.42, red, Math.max(0.6, r * 0.07));
    g.line(H.x + r * 0.5, H.y + r * 0.02, H.x + r * 0.76, H.y + r * 0.34, red, Math.max(0.6, r * 0.07));
    g.circle(H.x + r * 0.15, H.y + r * 1.32, r * 0.16, '#f3e6b3', g.shade('#f3e6b3', -0.5));
  }
  /** Werewolf: a long muzzle with a black nose and fangs, over the humanoid head. */
  function wolfOverlay(g) {
    const H = g.head;
    if (!H) return;
    const r = H.r, fur = g.pal.skin, light = g.shade(fur, 0.22);
    const atk = g.pose === 'attack';
    const mx = H.x + r * 0.72, my = H.y + r * 0.34 + (atk ? r * 0.04 : 0);
    g.ellipse(mx, my, r * 0.66, r * 0.4, light, undefined, -0.1);
    g.ellipse(mx + r * 0.58, my - r * 0.17, r * 0.2, r * 0.15, '#17121a', null);
    const fang = '#fffaf0';
    g.poly([[mx - r * 0.02, my + r * 0.3], [mx + r * 0.07, my + r * (atk ? 0.62 : 0.55)], [mx + r * 0.16, my + r * 0.3]], fang, null);
    g.poly([[mx + r * 0.3, my + r * 0.27], [mx + r * 0.38, my + r * (atk ? 0.56 : 0.5)], [mx + r * 0.46, my + r * 0.26]], fang, null);
    if (atk) g.line(mx - r * 0.3, my + r * 0.36, mx + r * 0.55, my + r * 0.3, '#3a1418', Math.max(0.6, r * 0.08));
  }

  const HUMAN_SPRITE = {
    base: 'humanoid', scale: 1, build: 'normal', outfit: 'coat',
    palette: { skin: '#e6bb93', cloth: '#6b5240', cloth2: '#9aa3ae', hair: '#4a3324', metal: '#e8eef5', eye: '#3a2a1e',
      accent: '#c9a24a', outline: '#1b1418', leather: '#5a3d28', belt: '#3b2a1e', beard: '#4a3324' },
    head: { hair: 'wild', beard: 'stubble', eyes: 'sleepy', mouth: 'frown', blush: false },
    mainhand: 'sword', offhand: 'none', extras: ['belt', 'pouches'],
    overlay: humanOverlay,
  };
  const WOLF_SPRITE = {
    base: 'humanoid', scale: 1.12, build: 'stocky', outfit: 'rags', hunch: 0.45,
    palette: { skin: '#8f8c98', cloth: '#5e4838', cloth2: '#3f4a57', hair: '#5d5a68', metal: '#e8eef5', eye: '#ffd23f',
      accent: '#ffd23f', outline: '#151219', ear: '#7f7c89', inner: '#4a4553', tail: '#7f7c89', belt: '#3b2a1e' },
    head: { ears: 'cat', hair: 'wild', eyes: 'glow', mouth: 'none', blush: false },
    tail: 'dog', mainhand: 'none', offhand: 'none', extras: ['belt'],
    overlay: wolfOverlay,
  };

  // ---- status: the werewolf form ------------------------------------------------------------------------
  DD.registerStatus({
    id: WOLF, name: 'Werewolf', icon: '🐺', color: '#8f8c98', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () { return 'Werewolf form: +' + WOLF_MOV + ' move, Claw basic attack, wolf skills ready, human skills locked. Transform to change back.'; },
  });

  // ---- basic attacks (the form decides which one he has) --------------------------------------------------
  DD.registerSkill({
    id: SWORD, name: 'Silvered Sword', owner: HERO, icon: '🗡️', kind: 'attack', tags: ['melee', 'human'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 5 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Human form: deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'Silver: for monsters. He polishes it every night and tries not to think about why.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.lunge(u, f);
      DD.FX.sound('slash');
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'silver'] });
    },
  });

  DD.registerSkill({
    id: CLAW, name: 'Claw', owner: HERO, icon: '🐾', kind: 'attack', tags: ['melee', 'wolf', 'bleed'],
    ap: 1, cooldown: 0,
    levels: CLAW_LV.map(function (c) { return { dmg: c.dmg, bleed: c.bleed }; }),
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L, user) { return 'Werewolf form: deal ' + L.dmg + ' damage to an adjacent foe and apply ' + bleedN(L.bleed, user) + ' Bleed.'; },
    flavor: 'He is very sorry about your face.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.lunge(u, f);
      DD.FX.particles(f, { kind: 'blood', count: 6 });
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'claw'] });
      bleed(u, f, ctx.L.bleed);
    },
  });

  // ---- Transform --------------------------------------------------------------------------------------
  DD.registerSkill({
    id: TRANSFORM, name: 'Transform', owner: HERO, icon: '🌕', kind: 'utility', tags: ['shapeshift'],
    ap: 1, cooldown: 0,
    levels: CLAW_LV.map(function (c) { return { claw: c.dmg, bleed: c.bleed }; }),
    target: { type: 'self' },
    desc: function (L, user) {
      return 'Switch between human and werewolf. Werewolf: +' + WOLF_MOV + ' move; basic attack Claw (' + L.claw + ' damage, ' +
        bleedN(L.bleed, user) + ' Bleed).';
    },
    flavor: 'It is a medical condition. Please stop clapping.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      if (isWolf(u)) becomeHuman(u); else becomeWolf(u, 'skill');
    },
    aiScore: transformScore,
  });

  // ---- human skills -----------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'bas_silver_slash', name: 'Silver Slash', owner: HERO, icon: '⚔️', kind: 'attack', tags: ['melee', 'human', 'vulnerable'],
    ap: 2, cooldown: 1,
    levels: [{ dmg: 8, turns: 1 }, { dmg: 10, turns: 1 }, { dmg: 12, turns: 2 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    canUse: gate('human'),
    desc: function (L) { return 'Human form: deal ' + L.dmg + ' damage to an adjacent foe; it is Vulnerable for ' + plural(L.turns, 'turn') + '.'; },
    flavor: 'Textbook monster-hunter form. He wrote the textbook. Chapter 9 is just "sorry".',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.lunge(u, f);
      DD.FX.particles(f, { kind: 'sparks', color: '#e8eef5', count: 10 });
      DD.FX.sound('slash');
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'silver'] });
      if (active(f)) A().addStatus(f, 'vulnerable', { turns: ctx.L.turns }, u);
    },
  });

  DD.registerSkill({
    id: 'bas_shoulder_check', name: 'Shoulder Check', owner: HERO, icon: '💥', kind: 'attack', tags: ['melee', 'human', 'push'],
    ap: 1, cooldown: 1,
    levels: [{ dmg: 4, push: 1 }, { dmg: 5, push: 1 }, { dmg: 6, push: 2 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    canUse: gate('human'),
    desc: function (L) { return 'Human form: deal ' + L.dmg + ' damage to an adjacent foe and push it ' + plural(L.push, 'tile') + '.'; },
    flavor: 'Excuse me. Sorry. Pardon. Coming through. Sorry.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.lunge(u, f);
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'push'] });
      if (active(f)) A().push(u, f, ctx.dir, ctx.L.push);
    },
  });

  DD.registerSkill({
    id: 'bas_hold_the_line', name: 'Hold the Line', owner: HERO, icon: '🛡️', kind: 'buff', tags: ['human', 'taunt', 'block'],
    ap: 1, cooldown: 2,
    levels: [{ r: 1, block: 4 }, { r: 1, block: 6 }, { r: 2, block: 6 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    canUse: gate('human'),
    desc: function (L) {
      return 'Human form: Taunt every foe within ' + plural(L.r, 'tile') + ' for 1 turn and gain ' + L.block + ' Block.';
    },
    flavor: 'Not past me. Not today. Sorry, but no.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.text(u, 'HOLD!', { color: '#ffe9c4', size: 17 });
      DD.FX.sound('buff');
      ctx.foes.forEach(function (f) { if (active(f)) A().addStatus(f, 'taunt', { turns: 1 }, u); });
      A().addBlock(u, ctx.L.block);
    },
  });

  DD.registerSkill({
    id: 'bas_step_in', name: 'Step In', owner: HERO, icon: '🔁', kind: 'move', tags: ['human', 'swap', 'block'],
    ap: 1, cooldown: 2,
    levels: [{ range: 3, block: 4 }, { range: 4, block: 5 }, { range: 5, block: 6 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, los: false, filter: 'ally' },
    canUse: gate('human'),
    desc: function (L) { return 'Human form: swap places with an ally within ' + plural(L.range, 'tile') + ' and gain ' + L.block + ' Block.'; },
    flavor: 'I\'ll take this one. You go stand somewhere less stabby.',
    execute: function (ctx) {
      const u = ctx.user, a = ctx.targetUnit;
      if (!active(u) || !active(a) || a === u) return;
      DD.FX.text(u, 'Behind me!', { color: '#ffe9c4', size: 15 });
      if (A().swap(u, a, { force: true, src: u }) && active(u)) A().addBlock(u, ctx.L.block);
    },
  });

  // ---- wolf skills ------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'bas_rend', name: 'Rend', owner: HERO, icon: '🩸', kind: 'attack', tags: ['melee', 'wolf', 'bleed'],
    ap: 1, cooldown: 1,
    levels: [{ dmg: 3, bleed: 3 }, { dmg: 4, bleed: 4 }, { dmg: 5, bleed: 5 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    canUse: gate('wolf'),
    desc: function (L, user) { return 'Werewolf form: deal ' + L.dmg + ' damage to an adjacent foe and apply ' + bleedN(L.bleed, user) + ' Bleed.'; },
    flavor: 'Rip, tear, apologize. In that order.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.lunge(u, f);
      DD.FX.particles(f, { kind: 'blood', count: 12 });
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'claw'] });
      bleed(u, f, ctx.L.bleed);
    },
  });

  /** Where Pounce lands next to `foe`: the free, safe tile nearest to him (null when there is none). */
  function landingTile(u, foe) {
    if (!foe) return null;
    if (dist(u, foe) === 1) return { x: u.x, y: u.y };
    const spots = DD.util.DIRS.map(function (d) { return { x: foe.x + d.x, y: foe.y + d.y }; }).filter(function (p) {
      return (G().isFree(p.x, p.y, u) || (p.x === u.x && p.y === u.y)) && !G().isDrop(p.x, p.y);
    });
    spots.sort(function (a, b) {
      return (G().hazardAt(a.x, a.y, u) ? 1 : 0) - (G().hazardAt(b.x, b.y, u) ? 1 : 0) || dist(a, u) - dist(b, u) || byPos(a, b);
    });
    return spots[0] || null;
  }

  DD.registerSkill({
    id: 'bas_pounce', name: 'Pounce', owner: HERO, icon: '🐺', kind: 'attack', tags: ['melee', 'wolf', 'stun', 'leap'],
    ap: 2, cooldown: 3,
    levels: [{ dmg: 4, range: 3 }, { dmg: 6, range: 4 }, { dmg: 8, range: 5 }],
    target: {
      type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy',
      canTarget: function (ctx) { return landingTile(ctx.user, ctx.targetUnit) ? true : 'No room to land.'; },
    },
    canUse: gate('wolf'),
    desc: function (L) { return 'Werewolf form: leap next to a foe within ' + plural(L.range, 'tile') + ', deal ' + L.dmg + ' damage and Stun it.'; },
    flavor: 'Good boy! No. NO. Bad— well. Effective.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      const spot = landingTile(u, f);
      if (!spot) return;
      if (spot.x !== u.x || spot.y !== u.y) {
        const from = { x: u.x, y: u.y };
        if (!A().teleport(u, spot.x, spot.y, { fx: false })) return;
        DD.FX.jump(u, from, spot, { ms: 300 });
      }
      if (!active(u) || !active(f) || dist(u, f) !== 1) return;
      A().face(u, f);
      DD.FX.lunge(u, f);
      DD.FX.shake(4, 180);
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'claw', 'leap'] });
      if (active(f)) A().addStatus(f, 'stun', { turns: 1 }, u);
    },
  });

  DD.registerSkill({
    id: 'bas_howl', name: 'Howl', owner: HERO, icon: '🌝', kind: 'buff', tags: ['wolf', 'inspire', 'aoe'],
    ap: 1, cooldown: 3,
    levels: [{ r: 2, turns: 1 }, { r: 3, turns: 1 }, { r: 3, turns: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    canUse: gate('wolf'),
    desc: function (L) {
      return 'Werewolf form: you and allies within ' + plural(L.r, 'tile') + ' are Inspired (+25% damage) for ' + plural(L.turns, 'turn') + '.';
    },
    flavor: 'AWOOOO. (Translation: "Go team.")',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.text(u, 'AWOOOOO!', { color: '#e8e2ff', size: 18 });
      DD.FX.particles(u, { kind: 'notes', color: '#e8e2ff', count: 10 });
      DD.FX.sound('roar');
      ctx.friends.forEach(function (a) { if (active(a)) A().addStatus(a, 'inspired', { turns: ctx.L.turns }, u); });
    },
  });

  DD.registerSkill({
    id: 'bas_savage_bite', name: 'Savage Bite', owner: HERO, icon: '🦷', kind: 'attack', tags: ['melee', 'wolf', 'heal'],
    ap: 2, cooldown: 1,
    levels: [{ dmg: 9, heal: 6 }, { dmg: 11, heal: 8 }, { dmg: 13, heal: 10 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    canUse: gate('wolf'),
    desc: function (L) { return 'Werewolf form: deal ' + L.dmg + ' damage to an adjacent foe. If that kills it, heal ' + L.heal + '.'; },
    flavor: 'Technically a snack. He will feel terrible about it later.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.lunge(u, f);
      DD.FX.particles(f, { kind: 'blood', count: 10 });
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'bite'] });
      if (f.dead && active(u)) {
        DD.FX.text(u, 'Nom.', { color: '#ffd0d0', size: 15 });
        A().heal(u, u, ctx.L.heal);
      }
    },
  });

  DD.registerSkill({
    id: 'bas_frenzy', name: 'Frenzy', owner: HERO, icon: '🌪️', kind: 'attack', tags: ['melee', 'wolf', 'aoe', 'bleed'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4, bleed: 1 }, { dmg: 5, bleed: 1 }, { dmg: 6, bleed: 2 }],
    target: { type: 'self' },
    area: { shape: 'adjacent' },
    desc: function (L, user) { return 'Werewolf form: deal ' + L.dmg + ' damage and apply ' + bleedN(L.bleed, user) + ' Bleed to every adjacent foe.'; },
    canUse: gate('wolf'),
    flavor: 'Mostly teeth. A little bit of sorry.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'blood', count: 16 });
      DD.FX.shake(4, 220);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.lunge(u, f, { ms: 90 });
        A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'claw', 'aoe'] });
        bleed(u, f, ctx.L.bleed);
      });
    },
  });

  // ---- signature ----------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'bas_blood_moon', name: 'Blood Moon', owner: HERO, icon: '🔴', kind: 'attack', tags: ['melee', 'aoe', 'bleed', 'shapeshift'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 14, bleed: 3, r: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L, user) {
      return 'Become the werewolf and maul every foe within ' + plural(L.r, 'tile') + ': ' + L.dmg + ' damage and ' + bleedN(L.bleed, user) + ' Bleed each.';
    },
    flavor: 'The moon turns red. Everyone else turns and runs.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.flash(MOON, 260);
      DD.FX.banner('BLOOD MOON', { sub: 'He did say sorry in advance', color: MOON });
      DD.FX.shake(10, 500);
      becomeWolf(u, 'signature');
      DD.FX.particles(u, { kind: 'blood', count: 26 });
      ctx.foes.slice().sort(function (a, b) { return dist(a, u) - dist(b, u) || byPos(a, b); }).forEach(function (f) {
        if (!active(f) || !active(u)) return;
        DD.FX.lunge(u, f, { ms: 110 });
        A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'claw', 'aoe'] });
        bleed(u, f, ctx.L.bleed);
      });
    },
  });

  // ---- passive ---------------------------------------------------------------------------------------------
  const PASSIVE = {
    name: 'Hair Trigger',
    desc: 'When damage leaves him below half HP, he turns into the werewolf for free (+' + WOLF_MOV + ' move, Claw basic attack, ' +
      'wolf skills; human skills locked until he Transforms back). Sorry in advance.',
    hooks: {
      onTakeDamage: function (d) {
        const u = d && d.target;
        if (!active(u) || !(d.dealt > 0) || !(u.hp > 0) || u.hp * 2 >= u.maxHp || isWolf(u)) return;
        becomeWolf(u, 'trigger');
      },
      onCombatStart: function (u) { dataOf(u); syncForm(u); },
      onTurnStart: function (u) { syncForm(u); },
      onTurnEnd: function (u) { syncForm(u); },
      onSkillUsed: function (ctx) { if (ctx && ctx.user) syncForm(ctx.user); },
      onDowned: function (u) { syncForm(u); },
    },
  };

  // ---- hero -------------------------------------------------------------------------------------------------
  DD.registerHero({
    id: HERO, name: 'Basanos', epithet: 'the Mostly Housebroken', race: 'Human (Werewolf)', cls: 'Monster Hunter',
    role: 'Melee in two forms: swordsman and werewolf', complexity: 2,
    blurb: 'A scruffy, apologetic monster hunter with a silver sword and a terrible secret: he is, technically, one of the monsters. ' +
      'As a man he holds the line; as a wolf he does not. Please stop asking him who\'s a good boy.',
    color: '#7b93c4', unlock: null,
    stats: { hp: 28, ap: 3, mov: 4, armor: 0, init: 2 }, growth: { hp: 4 }, flags: {},
    sprite: HUMAN_SPRITE,
    basic: SWORD, signature: 'bas_blood_moon',
    passive: PASSIVE,
    startingSkills: [TRANSFORM, 'bas_shoulder_check'],
    skillPool: [TRANSFORM, 'bas_shoulder_check', 'bas_silver_slash', 'bas_hold_the_line', 'bas_step_in',
      'bas_rend', 'bas_pounce', 'bas_howl', 'bas_savage_bite', 'bas_frenzy'],
    summons: [],
    barks: {
      select: ['Basanos. Monster hunter. Mostly the hunting part.', 'Sorry, did someone say "good boy"? No? Carry on.',
        'Silver sword\'s polished. I\'m ready. Probably.', 'Point me at the monster. The other monster.', 'Is it a full moon? Asking for me.'],
      start: ['Everyone stay calm. Especially me.', 'Let\'s do this cleanly. No biting. Hopefully.',
        'I\'ll hold the front. If I start growling, hold it for me.', 'Swords out. Leashes... no. No leashes.',
        'Monsters ahead. Professional courtesy ends here.'],
      move: ['Coming through. Sorry. Sorry.', 'On it.', 'I smell goblin. Don\'t ask how I know.', 'Pardon me. Mind your toes.',
        'Heel. I mean... I\'m going.'],
      kill: ['Sorry. It had to be done.', 'Clean cut. My mother would be proud.', 'One less monster. Present company excluded.',
        'Rest easy. I\'ll handle the paperwork.', 'Don\'t look at me like that. I said sorry.'],
      hurt: ['Ow. Fair.', 'Careful! You\'ll wake the dog. I mean me.', 'That one stung. Literally.', 'Please don\'t do that again. For your sake.'],
      lowhp: ['I\'m losing my grip. On being a person.', 'Things are getting hairy. Literally.', 'Everyone back up. I can\'t promise anything.',
        'Too much blood. Mine. The wolf likes it.'],
      downed: ['Tell my mother... I was a good boy...', 'Not... a... dog...', 'Sorry... about... everything...', 'Bury me... somewhere with a yard...'],
      revive: ['I\'m up. Nobody throw a stick.', 'Back on two legs. Good.', 'Thanks. I owe you one. A favor, not a lick.', 'Still human. Mostly.'],
      ally_down: ['No! Get away from them!', 'Hold on! I\'m coming!', 'That\'s it. I\'m letting him out.', 'Somebody help them up! I\'ll keep these off!'],
      levelup: ['I\'ve learned some new tricks. Not like that.', 'Stronger. Calmer. Hairier.', 'My training pays off. My therapy too.',
        'I can control it now. Mostly. Sometimes.'],
      victory: ['We did it. Sorry about the mess.', 'Good fight. I\'ll get the fur off the walls.', 'Nobody got bitten. A personal best.',
        'Done. Can we not mention the howling?', 'Victory. I need a bath and a very long nap.'],
      idle: ['Marwyn, please stop calling me "pup".', 'Ellaria, your corgis keep sniffing me. Make it stop.',
        'Professor Marbles, I don\'t chase rabbits. I promise.', 'Mayor Buga, put the squeaky toy away.',
        'Sparrow, stop offering me bones. They\'re... fine. Thanks.', 'Slate, you\'re the only one who doesn\'t flinch. I like that.'],
      signature: ['The moon is red. Run.', 'I\'m so sorry about what happens next.', 'BLOOD MOON! AWOOOOO!', 'No more holding back! RAAAH!',
        'Everyone behind me! WAY behind me!'],
      wolf: ['Grrr... sorry. GRRRR.', 'Stand back. It\'s happening.', 'Off comes the coat.', 'Here, doggy. That\'s me.'],
      human: ['Phew. Two legs. Thumbs. Lovely.', 'Sorry about that. All of it.', 'I\'m back. Did I bite anyone?',
        'Human again. Who wants a hug? Nobody? Fair.'],
      trigger: ['Oh no. Oh no no no. AWOOO!', 'Not now! NOT NOW!', 'You\'ve made him angry. Not me. Him.', 'Sorry in advance! GRRRAAH!'],
    },
  });

  // ---- hero items -------------------------------------------------------------------------------------------
  DD.registerItem({
    id: COLLAR, name: 'Flea Collar', slot: 'trinket', rarity: 'rare', icon: '📿', hero: HERO,
    stats: {},
    desc: 'Your first Transform each turn costs 0 AP.',
    flavor: 'Fleas not included. Fleas strongly implied.',
    hooks: {
      modifyCost: function (c) {
        const s = S();
        if (!s || !c || !c.unit || !c.skill || c.skill.id !== TRANSFORM || !hasItem(c.unit, COLLAR)) return;
        const d = peek(c.unit);
        if (!d || d.collar !== s.turn) c.ap = 0;
      },
      onCostPaid: function (p) {
        const s = S();
        if (!s || !p || !p.unit || !p.skill || p.skill.id !== TRANSFORM || p.consumable) return;
        if (p.ap === 0) dataOf(p.unit).collar = s.turn;
      },
    },
  });

  DD.registerItem({
    id: COAT, name: 'Wolfsbane-Lined Coat', slot: 'armor', rarity: 'rare', icon: '🧥', hero: HERO,
    stats: { hp: 4 },
    desc: '+4 max HP. When Hair Trigger turns you into the werewolf, heal ' + COAT_HEAL + '.',
    flavor: 'Lined with wolfsbane. It itches. That is how he knows it is working.',
    hooks: {},
  });

  DD.registerItem({
    id: MOONFANG, name: 'Moonfang', slot: 'weapon', rarity: 'legendary', icon: '🌙', hero: HERO,
    stats: { dmg: 0.1 },
    desc: '+10% damage. The Bleed your skills apply is doubled.',
    flavor: 'A silver sword with a werewolf fang set in the pommel. His own. Long story. A mirror was involved.',
    hooks: {},
  });

  // ---- test / debug API ---------------------------------------------------------------------------------------
  DD.Basanos = {
    WOLF: WOLF, WOLF_MOV: WOLF_MOV, CLAW_LV: CLAW_LV, COAT_HEAL: COAT_HEAL,
    HUMAN_SPRITE: HUMAN_SPRITE, WOLF_SPRITE: WOLF_SPRITE,
    isWolf: isWolf, becomeWolf: becomeWolf, becomeHuman: becomeHuman, syncForm: syncForm, transformLevel: transformLevel,
    formOf: formOf, formValue: formValue, transformScore: transformScore, landingTile: landingTile, baseMov: baseMov,
  };
})();
