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

  /**
   * Swap the sprite: the logical override (unit.sprite) changes at once; on screen the old look is pinned
   * (unit.vis.sprite) until FX playback reaches the change, then the pin is dropped so unit.sprite shows again — also
   * when other content re-wrapped it meanwhile (the Party Balloons item does). Previews skip the visual part.
   */
  const looks = new WeakMap();          // unit → number of queued look changes (cosmetic, never part of a dry run)
  function showSprite(u, spec) {
    const before = (u.vis && u.vis.sprite) || u.sprite || HUMAN_SPRITE;
    if (spec) u.sprite = spec; else delete u.sprite;
    if (A().simulating || !u.vis) return;
    if (!u.vis.sprite) u.vis.sprite = before;
    const n = (looks.get(u) || 0) + 1, shown = spec || HUMAN_SPRITE;
    looks.set(u, n);
    DD.FX.call(function () { if (u.vis) u.vis.sprite = looks.get(u) === n ? null : shown; });
  }

  /**
   * Swap the basic attack slot. It is still one attack slot, so its bookkeeping carries over: "first basic attack this
   * turn", the use count (a fresh 0 reads as refunded uses to AutoPlay's cooldown valuation) and the cooldown.
   */
  function setBasic(u, id, level) {
    const old = u.basic || {};
    u.basic = A().makeSlot(id, level);
    u.basic.usedThisTurn = !!old.usedThisTurn;
    u.basic.uses = old.uses || 0;
    u.basic.cd = old.cd || 0;
    u.basic.fresh = !!old.fresh;
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
      setBasic(u, CLAW, transformLevel(u));
      showSprite(u, WOLF_SPRITE);
    } else if (!wolf && d.wolf) {
      d.wolf = false;
      d.dire = false;
      u.mov = Math.max(1, (u.mov || 0) - (d.mov || 0));
      d.mov = 0;
      setBasic(u, SWORD, 1);
      showSprite(u, null);
    } else return;
    A().touch();
  }
  /** Blood Moon's huge dire-wolf look fades at the end of that turn (cosmetic: the form is the same werewolf). */
  function endDireLook(u) {
    const d = peek(u);
    if (!d || !d.dire) return;
    d.dire = false;
    if (isWolf(u)) showSprite(u, WOLF_SPRITE);
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

  /** Hair Trigger's rule, checked after he lost HP: still standing, below half HP and not yet the werewolf. */
  function hairTrigger(u) {
    if (active(u) && u.hp > 0 && u.hp * 2 < u.maxHp && !isWolf(u)) becomeWolf(u, 'trigger');
  }
  /**
   * syncForm, plus a pending Hair Trigger: a hit that took him to 0 HP is checked here, because the engine asks
   * onTakeDamage before it decides the down, and something (Plot Armor) may refuse it and leave him standing at 1 HP.
   */
  function settle(u) {
    if (!u) return;
    syncForm(u);
    const d = peek(u);
    if (!d || !d.pending) return;
    d.pending = false;
    hairTrigger(u);
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
  const COAT_COL = '#3e4a63', MAIL = '#9aa3ae', SILVER = '#e8eef5';
  /** Human: a grey streak in his hair (the wolf showing), a few too many scratches, a crescent pendant "worn ironically". */
  function humanOverlay(g) {
    const H = g.head;
    if (!H) return;
    const r = H.r, red = '#c0392b', lw = Math.max(0.6, r * 0.065);
    // a grey streak from the crown down the fringe
    g.path(function (c) {
      c.moveTo(H.x - r * 0.3, H.y - r * 0.98);
      c.quadraticCurveTo(H.x - r * 0.02, H.y - r * 0.72, H.x + r * 0.02, H.y - r * 0.3);
      c.quadraticCurveTo(H.x - r * 0.16, H.y - r * 0.62, H.x - r * 0.46, H.y - r * 0.9);
      c.closePath();
    }, '#a9a6b4', null);
    // three claw scratches across the cheek
    for (let i = 0; i < 3; i++) {
      const x = H.x + r * (0.36 + i * 0.12);
      g.line(x, H.y + r * 0.06, x + r * 0.17, H.y + r * 0.4, red, lw);
    }
    // crescent-moon pendant on the chest
    const px = H.x + r * 0.18, py = H.y + r * 1.34, pr = r * 0.2;
    g.path(function (c) {
      c.arc(px, py, pr, -Math.PI / 2, Math.PI / 2, true);
      c.quadraticCurveTo(px - pr * 0.55, py, px, py - pr);
      c.closePath();
    }, SILVER, g.shade(SILVER, -0.55), Math.max(0.5, r * 0.05));
  }
  /** Werewolf: a long grey snout poking out past the face, pale muzzle, black nose, fangs (the jaw drops when he bites). */
  function wolfOverlay(g) {
    const H = g.head;
    if (!H) return;
    const r = H.r, fur = g.pal.skin, pale = '#dcd7e2';
    const atk = g.pose === 'attack';
    const L = r * 0.72;                                      // half-length of the muzzle
    const mx = H.x + r * 0.82, my = H.y + r * 0.5;          // snout centre (the face sits r * 0.24 right of the head's)
    const jaw = atk ? r * 0.2 : 0;
    if (atk) g.ellipse(mx - r * 0.04, my + r * 0.16, L * 0.8, r * 0.16 + jaw * 0.5, '#3a1418', null);
    // lower jaw, then the snout: fur on the bridge, pale underneath
    g.ellipse(mx - r * 0.06, my + r * 0.14 + jaw, L * 0.76, r * 0.13, g.shade(pale, -0.12));
    g.ellipse(mx, my, L, r * 0.24, pale, undefined, -0.06);
    g.path(function (c) {
      c.moveTo(mx - L * 0.96, my - r * 0.02);
      c.quadraticCurveTo(mx - L * 0.2, my - r * 0.36, mx + L * 0.9, my - r * 0.14);
      c.quadraticCurveTo(mx + L * 0.2, my - r * 0.06, mx - L * 0.96, my - r * 0.02);
      c.closePath();
    }, fur, null);
    g.ellipse(mx + L * 0.86, my - r * 0.1, r * 0.14, r * 0.11, '#17121a', null);
    g.circle(mx + L * 0.8, my - r * 0.13, r * 0.035, '#8a8494', null);
    // fangs over the lip
    const fang = '#fffaf0', fy = my + r * 0.12;
    g.poly([[mx - L * 0.45, fy], [mx - L * 0.35, fy + r * 0.2 + jaw * 0.6], [mx - L * 0.24, fy]], fang, null);
    g.poly([[mx + L * 0.2, fy - r * 0.02], [mx + L * 0.29, fy + r * 0.16 + jaw * 0.6], [mx + L * 0.38, fy - r * 0.02]], fang, null);
  }

  const HUMAN_SPRITE = {
    base: 'humanoid', scale: 1, build: 'normal', outfit: 'coat',
    palette: { skin: '#e6bb93', cloth: COAT_COL, cloth2: MAIL, pants: '#4a3a2e', boots: '#2e2420', hair: '#3b2a20',
      beard: '#3b2a20', metal: SILVER, eye: '#3a2a1e', accent: '#c9a24a', outline: '#1b1418', leather: '#5a3d28', belt: '#2b1f17' },
    head: { hair: 'long', beard: 'stubble', eyes: 'sleepy', mouth: 'frown', blush: false },
    mainhand: 'sword', offhand: 'none', extras: ['belt', 'pouches'],
    overlay: humanOverlay,
  };
  const WOLF_SPRITE = {
    base: 'humanoid', scale: 1.12, build: 'stocky', outfit: 'rags', hunch: 0.45,
    palette: { skin: '#8f8c98', cloth: COAT_COL, cloth2: MAIL, hair: '#5d5a68', metal: SILVER, eye: '#ffd23f',
      accent: '#ffd23f', outline: '#151219', ear: '#7f7c89', inner: '#4a4553', tail: '#7f7c89', belt: '#2b1f17' },
    head: { ears: 'cat', hair: 'wild', eyes: 'glow', mouth: 'none', blush: false },
    tail: 'dog', mainhand: 'none', offhand: 'none', extras: ['belt'],
    overlay: wolfOverlay,
  };
  /** Blood Moon's look for the rest of that turn: a huge red-eyed dire wolf (cosmetic: the form is the same werewolf). */
  const DIRE_SPRITE = Object.assign({}, WOLF_SPRITE, {
    scale: 1.34, hunch: 0.55,
    palette: Object.assign({}, WOLF_SPRITE.palette, { skin: '#7f7b8a', hair: '#4a4656', eye: '#ff3b30', ear: '#6f6b7a', tail: '#6f6b7a' }),
    aura: { kind: 'glow', color: MOON },
  });

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
    id: CLAW, name: 'Claw', owner: HERO, icon: '🐺', kind: 'attack', tags: ['melee', 'wolf', 'bleed'],
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
    levels: [{ dmg: 5, push: 1 }, { dmg: 6, push: 1 }, { dmg: 7, push: 2 }],
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
    id: 'bas_hold_the_line', name: 'Hold the Line', owner: HERO, icon: '🛡️', kind: 'utility', tags: ['human', 'taunt', 'block'],
    ap: 1, cooldown: 2,
    levels: [{ r: 2, block: 4 }, { r: 2, block: 5 }, { r: 3, block: 6 }],
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
    id: 'bas_pounce', name: 'Pounce', owner: HERO, icon: '💨', kind: 'attack', tags: ['melee', 'wolf', 'stun', 'leap'],
    ap: 2, cooldown: 3,
    levels: [{ dmg: 4, range: 3 }, { dmg: 6, range: 4 }, { dmg: 8, range: 5 }],
    target: {
      type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy',
      objects: false,   // a pounce lands next to a foe; he does not leap onto barrels (Claw pops an adjacent one)
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
      if (isWolf(u)) { showSprite(u, DIRE_SPRITE); dataOf(u).dire = true; }
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
      'wolf skills). Sorry in advance.',
    hooks: {
      onTakeDamage: function (d) {
        const u = d && d.target;
        if (!u) return;
        settle(u);
        if (!active(u) || !(d.dealt > 0)) return;
        // at 0 HP the down is decided after this hook: if it is refused, settle() lets the wolf out at the next chance
        if (!(u.hp > 0)) { dataOf(u).pending = true; return; }
        hairTrigger(u);
      },
      // the bookkeeping (move, basic attack, sprite) follows the bas_wolf status, which a dispel can also take away
      // ("OBJECTION!"): re-checked whenever something happens to him
      onCombatStart: function (u) { dataOf(u); syncForm(u); },
      onRoundStart: function (u) { settle(u); },
      onTurnStart: function (u) { settle(u); },
      onTurnEnd: function (u) { settle(u); endDireLook(u); },
      onStatusApplied: function (u) { settle(u); },
      onHealed: function (u) { settle(u); },
      onSkillUsed: function (ctx) { if (ctx && ctx.user) settle(ctx.user); },
      onOpportunityAttack: function (o) {
        if (o && o.attacker && o.attacker.defId === HERO) settle(o.attacker);
        if (o && o.mover && o.mover.defId === HERO) settle(o.mover);
      },
      onDowned: function (u) { const d = peek(u); if (d) d.pending = false; syncForm(u); },
      // his attack of opportunity is the basic of the form he is in, even before a hook re-synced the slot (a dispel
      // with nothing after it): pure, it only swaps the slot this query resolves
      modifyOpportunity: function (o) {
        const u = o && o.attacker;
        if (!u || u.defId !== HERO || !o.skill || (o.skill.id !== SWORD && o.skill.id !== CLAW)) return;
        const id = isWolf(u) ? CLAW : SWORD;
        if (o.skill.id === id) return;
        o.level = id === CLAW ? transformLevel(u) : 1;
        o.slot = A().makeSlot(id, o.level);
        o.skill = DD.getSkill(id);
      },
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
        'Pebbles, we are NOT sniffing each other. We\'re coworkers.', 'Valdris, I don\'t need a silver collar. Stop measuring me.'],
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
    HUMAN_SPRITE: HUMAN_SPRITE, WOLF_SPRITE: WOLF_SPRITE, DIRE_SPRITE: DIRE_SPRITE,
    isWolf: isWolf, becomeWolf: becomeWolf, becomeHuman: becomeHuman, syncForm: syncForm, transformLevel: transformLevel,
    formOf: formOf, formValue: formValue, transformScore: transformScore, landingTile: landingTile, baseMov: baseMov,
  };
})();
