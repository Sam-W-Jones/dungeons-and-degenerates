/* Dungeons and Degenerates — js/data/items.js
 * The shared item pool (ARCHITECTURE §3.4, DESIGN §7): 50 items with no hero restriction — 17 weapons (damage
 * riders, attacks of opportunity), 16 armor (HP / armor / retaliation / resistances / second winds) and 17 trinkets
 * (Hype, gold, summons, surfaces, wild magic, AP tricks, consumable synergy): 19 common, 16 rare, 7 legendary, 8 cursed.
 * v2 (initiative, no Guard, no starting shield): one clear effect per item (cursed: one upside, one funny downside);
 * no item grants Block at the start of a fight, "per turn" means each unit's own turn (state.turn), and attacks of
 * opportunity are free reactions: they count as skill hits for damage riders but not as "using a skill".
 * Numbers the engine applies live in `stats` (hp ap mov armor dmg heal range hype init); the rest are §5.3 hooks.
 * Item hooks get the item def as their LAST argument; per-fight state lives on unit.data['item_<id>'] (previews copy
 * it, so dry runs never leak). "Skill" riders ignore consumables, status ticks, bumps, explosions and reflected damage.
 * Also registers Steve the Torchbearer (summon steve_torchbearer + 2 skills) for the Hireling Contract, and the
 * DD.Items helpers (docs/notes/items.md).
 */
(function () {
  'use strict';
  const DD = window.DD;

  // ---- helpers ------------------------------------------------------------------------------------------
  const GOLD = '#ffd76a';
  const BAD = '#ff9a7a';
  function A() { return DD.Act; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  /** Active and above 0 HP: onDealDamage / onTakeDamage run before a lethal hit is resolved. */
  function standing(u) { return active(u) && u.hp > 0; }
  function hostile(a, b) { return !!a && !!b && a !== b && DD.Grid.hostile(a, b); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function heightOf(u) { const t = DD.Grid.tile(u.x, u.y); return t ? t.h || 0 : 0; }
  /** "Each turn" (v2): every unit's turn is its own, so the key is the fight's turn counter (state.turn). */
  function turnKey() { const s = S(); return s ? s.turn || 0 : -1; }
  /** It is u's own turn (u is the current unit, or acts on its owner's turn). */
  function ownTurn(u) { return !!(u && DD.Combat && DD.Combat.isTurnOf && DD.Combat.isTurnOf(u)); }
  function rng() { const s = S(); return s && s.rng ? s.rng : DD.rng; }
  /** Per-fight scratch state of an item on a unit (created on first write; use peek() in pure hooks). */
  function mem(unit, it) {
    if (!unit.data) unit.data = {};
    const k = 'item_' + it.id;
    return unit.data[k] || (unit.data[k] = {});
  }
  function peek(unit, it) { return (unit && unit.data && unit.data['item_' + it.id]) || null; }
  function wears(u, it) { return !!u && Array.isArray(u.items) && u.items.indexOf(it.id) >= 0; }
  function isConsumable(def) { return !!def && !!def.id && DD.getConsumable(def.id) === def; }
  /**
   * Not a new use of a skill for "whenever you use a skill" triggers: a free re-resolution (the random passive Echo
   * Chamber passes extra.rpEcho) or an attack of opportunity (v2: a free reaction, ctx.opportunity).
   */
  function notAUse(ctx) { return !!ctx && (!!ctx.rpEcho || !!ctx.opportunity); }
  /** Damage dealt by a skill (not a consumable, status tick, bump, fall, explosion or reflection). */
  function bySkill(d) { return d.cause === 'skill' && !!d.skill && !isConsumable(d.skill); }
  /** The item's owner (d.source) landed a skill hit on a foe (the foe may be dropping from it). */
  function skillHitFoe(d) { return bySkill(d) && d.amount > 0 && hostile(d.source, d.target); }
  /** ...and the foe is still standing: the trigger of status / push riders. */
  function hitFoe(d) { return skillHitFoe(d) && standing(d.target); }
  /** A foe hit the item's owner (d.target) with an attack from an adjacent tile. */
  function meleeHit(d) { return bySkill(d) && d.amount > 0 && active(d.source) && hostile(d.target, d.source) && dist(d.source, d.target) === 1; }
  function proc(unit, it, text, color, size) {
    DD.FX.text(unit, it.icon + ' ' + (text || it.name), { color: color || GOLD, size: size || 13 });
  }
  /** True the first time it is asked during one skill resolution of `unit` (flag kept on DD.Act's skill context). */
  function oncePerSkill(unit, it) {
    const sk = A().currentSkill();
    if (!sk || sk.user !== unit) return false;
    const k = 'item_' + it.id;
    if (sk[k]) return false;
    sk[k] = true;
    return true;
  }
  /** Self-inflicted item damage that never drops the owner below 1 HP (see clampNonlethal). */
  function selfHarm(unit, n, label) {
    if (!standing(unit) || unit.hp <= 1 || !(n > 0)) return 0;
    return A().damage(null, unit, n, { cause: 'status', ignoreBlock: true, tags: [label, 'item_nonlethal'] });
  }
  /** onTakeDamage of items that use selfHarm: modifiers (Vulnerable, Marked...) may push it to 0 — undo that. */
  function clampNonlethal(d) {
    const u = d.target;
    if (u && !u.dead && !u.downed && u.hp <= 0 && (d.tags || []).indexOf('item_nonlethal') >= 0) A().heal(null, u, 1, { silent: true });
  }
  /** Cosmetic: the unit's current sprite (unit.sprite override, §7.3) plus three party balloons tied to its hand.
   *  drawUnit already hovers units with unit.flags.flying. Content that swaps the sprite (Ellaria's Wild Shape sets
   *  or deletes unit.sprite) loses the balloons, so the item calls this again after skills and at turn boundaries;
   *  the itemBalloons mark (a plain key: previews copy it) keeps it from wrapping twice. */
  function balloonSprite(unit) {
    if (!unit || unit.dead || !DD.Sprites || typeof DD.Sprites.specFor !== 'function' || typeof DD.Sprites.metrics !== 'function') return;
    const base = DD.Sprites.specFor(unit);
    if (!base || typeof base !== 'object' || base.itemBalloons) return;
    const m = DD.Sprites.metrics(base) || {};
    const top = -((m.height || 40) / (base.scale || 1));
    // overlays are drawn in the sprite's own (scaled) units: k keeps the balloons the same size on screen for a
    // tiny faerie and a giant corgi alike
    const k = 1 / Math.max(0.5, base.scale || 1);
    const prev = typeof base.overlay === 'function' ? base.overlay : null;
    // spread wide so the side balloons peek out around the HP bar / status row the HUD draws over them
    const BALLOONS = [{ x: -13 * k, y: top - 10 * k, c: '#ff4d6d' }, { x: 1 * k, y: top - 18 * k, c: '#ffd23f' }, { x: 14 * k, y: top - 9 * k, c: '#4fc3ff' }];
    unit.sprite = Object.assign({}, base, {
      itemBalloons: true,
      overlay: function (g, t, o) {
        if (prev) prev.call(this, g, t, o);
        const hy = top * 0.45;
        BALLOONS.forEach(function (b, i) {
          const sway = Math.sin((t || 0) * 2 + i * 1.7) * 1.2 * k;
          g.line(6, hy, b.x + sway, b.y + 5 * k, '#f2ecdf', 0.8 * k);
          g.ellipse(b.x + sway, b.y, 4.2 * k, 5.2 * k, b.c);
          g.ellipse(b.x + sway - 1.4 * k, b.y - 2 * k, 1.1 * k, 1.7 * k, 'rgba(255,255,255,0.75)', null);
        });
      },
    });
  }
  function foesWithin(unit, r) { return S().units.filter(function (o) { return active(o) && hostile(unit, o) && dist(o, unit) <= r; }); }
  function line(lines) { return lines[Math.floor(DD.rng.next() * lines.length) % lines.length]; }   // cosmetic only
  const IDS = [];
  function item(def) { IDS.push(def.id); return DD.registerItem(def); }

  // ======================================================================================================
  // WEAPONS — damage riders
  // ======================================================================================================
  item({
    id: 'rusty_shiv', name: 'Rusty Shiv of Tetanus', slot: 'weapon', rarity: 'common', icon: '🔪',
    desc: 'Whenever you damage a foe with a skill, it gains 1 Bleed.',
    flavor: 'Technically a medical instrument. Technically a medical emergency.',
    hooks: { onDealDamage: function (d) { if (hitFoe(d)) A().addStatus(d.target, 'bleed', { stacks: 1 }, d.source); } },
  });
  item({
    id: 'tiki_torch', name: 'Tiki Torch (Borrowed From a Luau)', slot: 'weapon', rarity: 'common', icon: '🔥',
    desc: 'Whenever you damage a foe with a skill, it gains 1 Burn.',
    flavor: 'Mood lighting for murder. Still smells faintly of coconut.',
    hooks: { onDealDamage: function (d) { if (hitFoe(d)) A().addStatus(d.target, 'burn', { stacks: 1 }, d.source); } },
  });
  item({
    id: 'hygiene_fork', name: 'Fork of Questionable Hygiene', slot: 'weapon', rarity: 'common', icon: '🍴',
    desc: 'Whenever you damage a foe with a skill, it gains 1 Poison.',
    flavor: 'Found in the tavern kitchen. That was the first red flag. The fork was the second.',
    hooks: { onDealDamage: function (d) { if (hitFoe(d)) A().addStatus(d.target, 'poison', { stacks: 1 }, d.source); } },
  });
  item({
    id: 'butter_knife', name: 'Butter Knife of Grim Resolve', slot: 'weapon', rarity: 'common', icon: '🧈',
    stats: { dmg: 0.1 },
    desc: '+10% damage.',
    flavor: 'Spreads butter. Spreads fear. Mostly butter.',
  });
  item({
    id: 'yardstick', name: 'Yardstick of Reach', slot: 'weapon', rarity: 'common', icon: '📏',
    stats: { range: 1 },
    desc: '+1 range for skills and thrown consumables that reach 2 or more tiles.',
    flavor: 'Measures 36 inches. Claims 40. Like everyone at this table.',
  });
  item({
    id: 'big_stick', name: 'Big Stick (Diplomatic Edition)', slot: 'weapon', rarity: 'common', icon: '🏏',
    desc: 'Once per turn, when you damage an adjacent foe with a skill, push it 1 tile away from you.',
    flavor: 'Speak softly. Swing loudly. Apologise never.',
    hooks: {
      onDealDamage: function (d, it) {
        const u = d.source;
        if (!hitFoe(d) || dist(u, d.target) !== 1 || A().isImmovable(d.target)) return;
        const m = mem(u, it);
        if (m.turn === turnKey()) return;
        m.turn = turnKey();
        proc(d.target, it, 'Shove!');
        A().knockback(u, d.target, 1);
      },
    },
  });
  // v2 attacks of opportunity (Sentinel, but rude): the hit ends the foe's walk on the tile it was leaving, so a melee
  // wearer holds the line against divers and archers stepping back. (A "+4 damage on reactions" version measured zero:
  // the AI prices damage bonuses and just never leaves. It does not foresee the stop, so the stop happens in play.)
  // Only heroes with a melee basic attack make attacks of opportunity (DESIGN §4.2): the desc says so, or it reads as
  // broken on half the roster (Zarathor, Syllamin, Corelos, Josiah...).
  item({
    id: 'passive_aggressive_polearm', name: 'Polearm of Passive Aggression', slot: 'weapon', rarity: 'common', icon: '🍢',
    desc: 'A foe you damage with an attack of opportunity (melee basic attacks only) stops right there: its walk ends.',
    flavor: 'Oh, you\'re leaving? No, no, that\'s fine. Totally fine. *stab*',
    hooks: {
      onOpportunityAttack: function (o, it) {
        const m = o && o.mover;
        // the hook also fires on the mover's own items: only the wearer's reactions stop anyone (never his own walk)
        if (!m || !wears(o.attacker, it) || !(o.dealt > 0) || !active(m)) return;
        proc(m, it, 'Not so fast!');
        A().stopMove(m);
      },
    },
  });
  item({
    id: 'flametongue_knockoff', name: 'Flametongue (Knockoff)', slot: 'weapon', rarity: 'rare', icon: '🗡️',
    desc: 'Whenever you damage a foe with a skill, it gains 2 Burn.',
    flavor: 'Says "Flametongue" on the hilt. Says "Made in a Gnome\'s Garage" underneath.',
    hooks: { onDealDamage: function (d) { if (hitFoe(d)) A().addStatus(d.target, 'burn', { stacks: 2 }, d.source); } },
  });
  item({
    id: 'discount_headsman_axe', name: 'Discount Headsman\'s Axe', slot: 'weapon', rarity: 'rare', icon: '🪓',
    desc: 'Your skills deal +4 damage to foes at or below half HP.',
    flavor: 'The previous owner retired. Abruptly. From the neck up.',
    hooks: {
      modifyOutgoingDamage: function (d) {
        if (bySkill(d) && hostile(d.source, d.target) && d.target.hp * 2 <= d.target.maxHp) d.flat += 4;
      },
    },
  });
  item({
    // v2 simplicity: one effect (it no longer also climbs 2 levels per step)
    id: 'high_horse_lance', name: 'Lance of the High Horse', slot: 'weapon', rarity: 'rare', icon: '🐴',
    desc: 'Your skills deal +4 damage to foes standing lower than you.',
    flavor: 'Moral superiority, weaponised. The horse is also judging you.',
    hooks: {
      modifyOutgoingDamage: function (d) {
        if (bySkill(d) && hostile(d.source, d.target) && heightOf(d.source) > heightOf(d.target)) d.flat += 4;
      },
    },
  });
  item({
    id: 'ldr_longbow', name: 'Longbow of Long-Distance Relationships', slot: 'weapon', rarity: 'rare', icon: '🏹',
    stats: { range: 1 },
    desc: '+1 range for skills and thrown consumables that reach 2 or more tiles. Your skills deal +2 damage to foes 4 or more tiles away.',
    flavor: 'It\'s not you. It\'s the forty feet between us.',
    hooks: {
      modifyOutgoingDamage: function (d) { if (bySkill(d) && hostile(d.source, d.target) && dist(d.source, d.target) >= 4) d.flat += 2; },
    },
  });
  item({
    id: 'vampire_spork', name: 'Vampire Spork', slot: 'weapon', rarity: 'rare', icon: '🥄',
    desc: 'Whenever you damage a foe with a skill, heal 2 HP (up to 2 times per turn).',
    flavor: 'Half spoon, half fork, all thirst. Do not use it on soup.',
    hooks: {
      onDealDamage: function (d, it) {
        const u = d.source;
        if (!skillHitFoe(d) || !active(u)) return;
        const m = mem(u, it);
        if (m.turn !== turnKey()) { m.turn = turnKey(); m.n = 0; }
        if (m.n >= 2) return;
        m.n++;
        A().heal(null, u, 2);
      },
    },
  });
  item({
    id: 'excalibur_rental', name: 'Excalibur (Rental)', slot: 'weapon', rarity: 'legendary', icon: '⚔️',
    stats: { dmg: 0.2 },
    desc: '+20% damage. Your skill damage ignores armor.',
    flavor: 'Cuts through anything except the late fees. The Lady of the Lake has a collections department.',
    hooks: { modifyOutgoingDamage: function (d) { if (bySkill(d)) d.ignoreArmor = true; } },
  });
  item({
    id: 'darryl_hammer', name: 'Mjölnir\'s Cousin Darryl', slot: 'weapon', rarity: 'legendary', icon: '🔨',
    desc: 'The first foe you damage with each skill is knocked back 1 tile. If it slams into something, the crash deals 6 damage (instead of 3).',
    flavor: 'Only the worthy can lift it. Darryl is not picky about worthy.',
    hooks: {
      onDealDamage: function (d, it) {
        const u = d.source;
        if (!skillHitFoe(d) || !oncePerSkill(u, it)) return;
        if (!standing(d.target) || A().isImmovable(d.target)) return;
        proc(d.target, it, 'Darryl!');
        A().knockback(u, d.target, 1, { bump: 6 });
      },
    },
  });
  item({
    id: 'overkill_glaive', name: 'Glaive of Giving 110%', slot: 'weapon', rarity: 'legendary', icon: '🔱',
    stats: { dmg: 0.1 },
    desc: '+10% damage. When your skill damage defeats a foe, its overkill damage +3 hits the nearest other foe within 2 tiles of it (this can chain).',
    flavor: 'Coach always said leave it all on the field. Coach meant the enemy\'s field.',
    hooks: {
      onKill: function (d, it) {
        const u = d.credit, dead = d.target;
        if (!u || u.dead || !dead) return;
        const chained = (d.tags || []).indexOf('item_glaive') >= 0;
        if (!chained && !bySkill(d)) return;
        let next = null;
        S().units.forEach(function (o) {
          if (!active(o) || o === dead || !hostile(u, o) || dist(o, dead) > 2) return;
          if (!next || dist(o, dead) < dist(next, dead)) next = o;
        });
        if (!next) return;
        DD.FX.projectile(dead, next, { kind: 'dagger', color: GOLD });
        proc(next, it, '110%!');
        A().damage(u, next, Math.max(0, d.overkill || 0) + 3, { cause: 'other', reflect: true, noHighGround: true, tags: ['item_glaive'] });
      },
    },
  });
  item({
    id: 'flail_of_flailing', name: 'Flail of Uncontrolled Flailing', slot: 'weapon', rarity: 'cursed', icon: '⛓️',
    stats: { dmg: 0.4 },
    desc: '+40% damage. Whenever you use a skill that damages a foe, each ally adjacent to you takes 2 damage from the backswing.',
    flavor: 'Hits everything you aim at, and several things you didn\'t. Your friends now stand further away.',
    hooks: {
      onDealDamage: function (d, it) {
        const u = d.source;
        // an attack of opportunity is a free reaction, not a skill you use: no backswing
        if (!skillHitFoe(d) || d.opportunity || !oncePerSkill(u, it)) return;
        const allies = S().units.filter(function (o) { return active(o) && o !== u && !hostile(u, o) && dist(o, u) === 1; });
        if (!allies.length) return;
        proc(u, it, 'Backswing!', BAD);
        allies.forEach(function (o) { A().damage(u, o, 2, { cause: 'other', reflect: true, noHighGround: true, tags: ['item_flail'] }); });
      },
    },
  });
  const INSULTS = ['"Is that a face or a cry for help?"', '"I\'ve seen scarier mimics at a yard sale!"',
    '"Your stance is a war crime against posture!"', '"Nice armor. Did your mum pick it?"', '"Come closer, I need a laugh!"'];
  item({
    id: 'sentient_sword', name: 'Sentient Sword (Won\'t Shut Up)', slot: 'weapon', rarity: 'cursed', icon: '🗣️',
    stats: { dmg: 0.35 },
    desc: '+35% damage. At the start of your turn it insults every foe within 3 tiles: they are Inspired (+25% damage) through their next turn.',
    flavor: 'It has opinions about everyone\'s mother. It shares them. Loudly. Mid-ambush.',
    hooks: {
      // applied on the wearer's turn, so turns: 1 covers each foe's next turn (v2 durations count the owner's turns)
      onTurnStart: function (unit, it) {
        const foes = foesWithin(unit, 3);
        if (!foes.length) return;
        proc(unit, it, line(INSULTS), BAD, 12);
        foes.forEach(function (f) { A().addStatus(f, 'inspired', { turns: 1 }, unit); });
      },
    },
  });

  // ======================================================================================================
  // ARMOR — HP, armor, retaliation, resistances, second winds (v2: no Block at the start of a fight)
  // ======================================================================================================
  item({
    id: 'chainmail_bikini', name: 'Chainmail Bikini', slot: 'armor', rarity: 'common', icon: '👙',
    stats: { armor: 1 },
    desc: '+1 armor.',
    flavor: 'Protects exactly where it matters least. Very breezy. Zero regrets.',
  });
  item({
    id: 'grandmas_gambeson', name: 'Grandma\'s Quilted Gambeson', slot: 'armor', rarity: 'common', icon: '🧶',
    stats: { hp: 7 },
    desc: '+7 max HP.',
    flavor: 'Every stitch says "I\'m proud of you." The arrows disagree, but politely.',
  });
  item({
    id: 'hedgehog_hoodie', name: 'Hedgehog Hoodie', slot: 'armor', rarity: 'common', icon: '🦔',
    stats: { hp: 2 },
    desc: '+2 max HP. When an adjacent foe damages you with an attack, it takes 2 damage.',
    flavor: 'Hugs not included. Hugs not advised.',
    hooks: {
      onTakeDamage: function (d, it) {
        if (!meleeHit(d)) return;
        proc(d.source, it, 'Prickly!');
        A().damage(d.target, d.source, 2, { cause: 'other', reflect: true, noHighGround: true, tags: ['thorns', 'item_hoodie'] });
      },
    },
  });
  item({
    id: 'galoshes', name: 'Galoshes of Unwarranted Confidence', slot: 'armor', rarity: 'common', icon: '🥾',
    stats: { hp: 3 },
    desc: '+3 max HP. You can\'t be Rooted or Slowed.',
    flavor: 'Waterproof. Mudproof. Webproof. Fashion-proof.',
    hooks: {
      modifyStatus: function (s, it) { if (s.id === 'root' || s.id === 'slow') { s.cancel = true; proc(s.unit, it, 'Squelch. Nope.'); } },
    },
  });
  item({
    id: 'fireproof_apron', name: 'Blacksmith\'s Apron (Fireproof-ish)', slot: 'armor', rarity: 'common', icon: '🦺',
    desc: 'You can\'t be Burned, and you take 50% less fire damage.',
    flavor: 'Kiss the cook. Do not set the cook on fire. Zarathor, this means you.',
    hooks: {
      modifyStatus: function (s, it) { if (s.id === 'burn') { s.cancel = true; proc(s.unit, it, 'Fireproof!'); } },
      modifyIncomingDamage: function (d) { if (d.element === 'fire') d.mult *= 0.5; },
    },
  });
  item({
    // v2: Block gained at the end of your turn lasts through every enemy turn until your next turn starts. Earned by
    // standing still, never a starting shield (enemies acting before your first turn find you without it).
    id: 'turtle_shell', name: 'Turtle Shell (Previous Tenant Evicted)', slot: 'armor', rarity: 'common', icon: '🐢',
    desc: 'At the end of your turn, if you\'re on the tile where you started it, gain 4 Block.',
    flavor: 'The previous tenant left a one-star review and no forwarding address.',
    hooks: {
      onTurnStart: function (unit, it) { const m = mem(unit, it); m.turn = turnKey(); m.at = unit.x + ',' + unit.y; },
      onTurnEnd: function (unit, it) {
        const m = mem(unit, it);
        if (m.turn !== turnKey() || m.at !== unit.x + ',' + unit.y) return;
        proc(unit, it, 'Shell up!');
        A().addBlock(unit, 4);
      },
    },
  });
  item({
    // v2: its 4 Block at the start of combat is gone (no starting shield); the hobbit's shirt lets you slip away instead
    id: 'mithril_shirt', name: 'Mithril Shirt (Pre-Owned)', slot: 'armor', rarity: 'rare', icon: '👕',
    stats: { armor: 1 },
    desc: '+1 armor. You never provoke attacks of opportunity.',
    flavor: 'The previous owner was three feet tall and asked for it back. We said no.',
    hooks: {
      // pure (paths, the HUD's move preview and the AI ask it): the wearer is the one walking away
      modifyOpportunity: function (o, it) { if (o && wears(o.mover, it)) o.cancel = true; },
    },
  });
  item({
    id: 'undying_undies', name: 'Undying Undies', slot: 'armor', rarity: 'rare', icon: '🩳',
    desc: 'Once per combat, damage that would down you leaves you at 1 HP instead, and you gain 8 Block.',
    flavor: 'Lucky underwear. Unwashed since the last TPK, for luck. Mostly for luck.',
    hooks: {
      onTakeDamage: function (d, it) {
        const u = d.target;
        if (!u || u.dead || u.downed || u.hp > 0 || u.kind !== 'hero') return;
        if ((d.tags || []).indexOf('item_nonlethal') >= 0) return;   // another item's self-harm undoes itself
        const m = mem(u, it);
        if (m.used) return;
        m.used = true;
        A().heal(null, u, 1, { silent: true });
        proc(u, it, 'UNDYING UNDIES!', GOLD, 17);
        A().log(u.name + '\'s Undying Undies refuse to let go. Gross, but effective.', 'heal');
        A().addBlock(u, 8);
      },
    },
  });
  item({
    id: 'spiked_pauldrons', name: 'Spiked Pauldrons of Personal Space', slot: 'armor', rarity: 'rare', icon: '📌',
    stats: { hp: 4 },
    desc: '+4 max HP. When an adjacent foe damages you with an attack, it is knocked back 1 tile.',
    flavor: 'A firm boundary, professionally installed on each shoulder.',
    hooks: {
      onTakeDamage: function (d, it) {
        if (!meleeHit(d) || A().isImmovable(d.source)) return;
        proc(d.target, it, 'Back off!');
        A().knockback(d.target, d.source, 1);
      },
    },
  });
  item({
    id: 'crash_helmet', name: 'Crash Helmet (Pre-Dented)', slot: 'armor', rarity: 'rare', icon: '⛑️',
    stats: { hp: 6 },
    desc: '+6 max HP. You take no damage from bumps or falls.',
    flavor: 'Mandatory for anyone Marwyn calls "buddy". Or "ammo".',
    hooks: {
      // the flat sink too: sources that fire after items add flat damage (the Weak Ankles scar: +3 from bumps/falls)
      modifyIncomingDamage: function (d) { if (d.cause === 'bump' || d.cause === 'fall') { d.mult = 0; d.flat = -1e6; } },
    },
  });
  const MIND = { charmed: 1, confused: 1, silenced: 1, sleep: 1 };
  item({
    id: 'tinfoil_hat', name: 'Tinfoil Hat', slot: 'armor', rarity: 'rare', icon: '🛸',
    stats: { hp: 3 },
    desc: '+3 max HP. You can\'t be Charmed, Confused, Silenced or put to Sleep.',
    flavor: 'They can\'t read your thoughts. Mostly because there aren\'t many.',
    hooks: { modifyStatus: function (s, it) { if (MIND[s.id]) { s.cancel = true; proc(s.unit, it, 'Nice try, mind rays.'); } } },
  });
  item({
    id: 'phoenix_down_jacket', name: 'Phoenix Down Jacket', slot: 'armor', rarity: 'legendary', icon: '🪶',
    stats: { hp: 6 },
    desc: '+6 max HP. Once per combat, when you go down, you rise again with 50% HP and every adjacent foe takes 6 fire damage.',
    flavor: 'Dry clean only. It bursts into flames in the tumble dryer. Every. Single. Time.',
    hooks: {
      onDowned: function (unit, d, it) {
        if (!unit || unit.dead || !unit.downed) return;
        const m = mem(unit, it);
        if (m.used) return;
        m.used = true;
        if (!A().revive(unit, 0.5)) return;
        // downed mid-walk (an attack of opportunity, a trap): the walk still ends where he fell (DESIGN §4.2)
        A().stopMove(unit);
        proc(unit, it, 'FROM THE ASHES!', '#ffb04a', 17);
        A().log(unit.name + ' rises from the ashes in a very puffy jacket.', 'heal');
        DD.FX.explosion(unit, { radius: 1, color: '#ff8a1a' });
        DD.FX.sound('fire');
        foesWithin(unit, 1).forEach(function (f) { A().damage(unit, f, 6, { element: 'fire', cause: 'explosion', tags: ['item_phoenix'] }); });
      },
    },
  });
  const GILDED_STEP = 40, GILDED_MAX = 3;
  item({
    // v2: it used to give up to 12 Block at every turn start (a permanent starting shield); now the gold buys armor
    // once, when the fight starts (unit.armor, so the HUD, previews and the AI's estimates all see it)
    id: 'gilded_breastplate', name: 'Gilded Breastplate of Conspicuous Wealth', slot: 'armor', rarity: 'legendary', icon: '💰',
    desc: 'When a fight starts, gain +1 armor for every ' + GILDED_STEP + ' gold the party holds (up to +' + GILDED_MAX + ').',
    flavor: 'Insured for more than you are. Stopping arrows technically voids the warranty.',
    hooks: {
      onCombatStart: function (unit, it) {
        const n = Math.min(GILDED_MAX, Math.floor(A().gold() / GILDED_STEP));
        if (n <= 0) return;
        mem(unit, it).armor = n;
        unit.armor = (unit.armor || 0) + n;
        proc(unit, it, '+' + n + ' armor (conspicuously)');
      },
    },
  });
  item({
    // v2 simplicity: one downside (it no longer also costs 1 Move)
    id: 'barrel_armor', name: 'Barrel Armor (Still Has Ale In It)', slot: 'armor', rarity: 'cursed', icon: '🛢️',
    stats: { hp: 15, armor: 2 },
    desc: '+15 max HP, +2 armor. When something pushes you away, you roll 2 tiles further.',
    flavor: 'You don\'t walk anymore. You roll. Downhill. Into things.',
    hooks: {
      modifyPush: function (p, it) {
        const u = p.unit, src = p.src;
        if (!u || src === u || !p.dir) return;
        if (src && (src.x - u.x) * p.dir.x + (src.y - u.y) * p.dir.y > 0) return;   // a pull: toward its source
        p.dist += 2;
        proc(u, it, 'Rolling!', '#e0b070');
      },
    },
  });
  item({
    id: 'mimic_mail', name: 'Mimic Mail', slot: 'armor', rarity: 'cursed', icon: '🧰',
    stats: { armor: 3, hp: 4 },
    desc: '+3 armor, +4 max HP. At the start of your turn it bites you for 1 damage (it never drops you below 1 HP).',
    flavor: 'It isn\'t armor. It\'s a mimic that is really, really into you.',
    hooks: {
      // 1, not 2: heroes take few hits per fight, so a 2 HP bite every turn cost even a frontliner more than +3
      // armor saved (AutoPlay sims, docs/notes/items.md Review)
      onTurnStart: function (unit, it) {
        if (unit.hp <= 1) return;
        proc(unit, it, 'CHOMP!', BAD);
        selfHarm(unit, 1, 'mimic bite');
      },
      onTakeDamage: clampNonlethal,
    },
  });
  item({
    id: 'haunted_plate', name: 'Haunted Plate (Kevin Lives Here)', slot: 'armor', rarity: 'cursed', icon: '👻',
    stats: { armor: 2, hp: 6 },
    desc: '+2 armor, +6 max HP. At the end of your turn, 50% chance Kevin swaps you with a random movable unit within 3 tiles.',
    flavor: 'Kevin means well. Kevin has never once meant well.',
    hooks: {
      onTurnEnd: function (unit, it) {
        if (!active(unit) || !rng().chance(0.5)) return;
        const pool = S().units.filter(function (o) { return active(o) && o !== unit && dist(o, unit) <= 3 && !A().isImmovable(o); });
        if (!pool.length) return;
        const other = pool[rng().int(0, pool.length - 1)];
        if (!A().swap(unit, other, { force: true })) return;
        proc(unit, it, 'Kevin!', '#c9b8ff');
        A().log('Kevin the ghost swaps ' + unit.name + ' with ' + other.name + '. He thought it would be funny. It was.', 'status');
      },
    },
  });

  // ======================================================================================================
  // TRINKETS — weird, build-defining hooks
  // ======================================================================================================
  function foeKill(d) { const u = d.credit, v = d.target; return !!u && !!v && v !== u && v.side !== u.side; }
  item({
    id: 'coin_purse', name: 'Loot Goblin\'s Coin Purse', slot: 'trinket', rarity: 'common', icon: '👛',
    desc: 'Every foe you defeat drops 2 gold.',
    flavor: 'Contains three coppers, a button and somebody\'s tooth. Now yours.',
    hooks: {
      onKill: function (d) {
        if (!foeKill(d)) return;
        DD.FX.particles(d.target, { kind: 'coins', count: 6 });
        DD.FX.text({ x: d.target.x, y: d.target.y }, '+2 gold', { color: GOLD, size: 13 });
        A().gainGold(2);
      },
    },
  });
  item({
    id: 'foam_finger', name: 'Foam Finger (#1)', slot: 'trinket', rarity: 'common', icon: '👆',
    stats: { hype: 10 },
    desc: '+10 Hype at the start of combat. Whenever you defeat a foe, the party gains 3 more Hype.',
    flavor: 'Number one! At what? Doesn\'t say. Doesn\'t matter.',
    hooks: {
      onKill: function (d, it) {
        if (!foeKill(d)) return;
        if (active(d.credit)) proc(d.credit, it, '+3 Hype');
        A().gainHype(3, it.name);
      },
    },
  });
  item({
    id: 'pretzel_pouch', name: 'Pouch of Emergency Pretzels', slot: 'trinket', rarity: 'common', icon: '🥨',
    desc: 'Whenever you use a consumable, heal 4 HP.',
    flavor: 'Emotional support carbohydrates. Pairs with every potion, especially the bad ones.',
    hooks: { onSkillUsed: function (ctx) { if (isConsumable(ctx.skill) && active(ctx.user)) A().heal(null, ctx.user, 4); } },
  });
  item({
    // v2 simplicity: one effect (the 2 Block every turn are gone; the heal is bigger)
    id: 'dog_treat_bandolier', name: 'Bandolier of Dog Treats', slot: 'trinket', rarity: 'common', icon: '🦴',
    desc: 'At the start of your turn, each of your summons heals 3 HP.',
    flavor: 'Every corgi within five miles just sat down very politely.',
    hooks: {
      onTurnStart: function (unit) {
        S().units.forEach(function (o) {
          if (!active(o) || o.kind !== 'summon' || o.ownerId !== unit.id) return;
          A().heal(null, o, 3);
        });
      },
    },
  });
  item({
    id: 'hang_in_there_poster', name: '"Hang In There" Poster', slot: 'trinket', rarity: 'common', icon: '🐈',
    desc: 'While you\'re below half HP, you deal 25% more damage.',
    flavor: 'The kitten on it is also barely hanging in there. You two have bonded.',
    hooks: { modifyOutgoingDamage: function (d) { const u = d.source; if (u && u.hp * 2 < u.maxHp) d.mult *= 1.25; } },
  });
  item({
    id: 'whetstone', name: 'Whetstone on a String', slot: 'trinket', rarity: 'common', icon: '🪨',
    desc: 'Your basic attack deals +2 damage.',
    flavor: 'Sharpens blades, wits and absolutely nothing else.',
    hooks: {
      modifyOutgoingDamage: function (d) { const u = d.source; if (bySkill(d) && u && u.basic && d.skill.id === u.basic.id) d.flat += 2; },
    },
  });
  item({
    id: 'scented_candle', name: 'Scented Candle of Sanctity', slot: 'trinket', rarity: 'rare', icon: '🕯️',
    desc: 'At the end of your turn, your tile becomes Holy Ground for 2 rounds (grounded units ending a turn there: heroes heal 3, undead take 3 damage).',
    flavor: 'Notes of clean linen and righteous smiting. The undead hate it. So does Josiah\'s beak.',
    hooks: {
      onTurnEnd: function (unit) {
        if (A().setSurface(unit.x, unit.y, 'holy', 2)) DD.FX.tile(unit.x, unit.y, 'glow', { color: '#fff0a0' });
      },
    },
  });
  item({
    // v2: "during your turn" = the wearer's own turn (a kill on someone else's turn would only bank AP for later)
    id: 'adrenaline_jar', name: 'Jar of Questionable Adrenaline', slot: 'trinket', rarity: 'rare', icon: '🫙',
    stats: { init: 2 },
    desc: '+2 initiative. Once per turn, when you defeat a foe during your turn, gain 1 AP.',
    flavor: 'Harvested from a very surprised badger. Do not ask how. Do not ask the badger.',
    hooks: {
      onKill: function (d, it) {
        const u = d.credit;
        if (!foeKill(d) || !active(u) || u.side !== 'hero' || !ownTurn(u)) return;
        const m = mem(u, it);
        if (m.turn === turnKey()) return;
        m.turn = turnKey();
        A().gainAp(u, 1);
      },
    },
  });
  item({
    id: 'encore_kazoo', name: 'Encore Kazoo', slot: 'trinket', rarity: 'rare', icon: '🎺',
    stats: { hype: 10 },
    desc: '+10 Hype at the start of combat. After you use your signature, the party gains 25 Hype.',
    flavor: 'One more time! With feeling! Please stop.',
    hooks: {
      onSkillUsed: function (ctx, it) {
        const u = ctx.user;
        if (!u || !u.signature || !ctx.skill || ctx.skill.id !== u.signature.id) return;
        proc(u, it, 'ENCORE!', GOLD, 15);
        A().gainHype(25, it.name);
      },
    },
  });
  item({
    id: 'compound_interest_ledger', name: 'Ledger of Compound Interest', slot: 'trinket', rarity: 'rare', icon: '📈',
    desc: 'At the start of each combat, the party gains 1 gold per 10 gold it holds (up to 8).',
    flavor: 'Money makes money. The DM is still checking whether that\'s legal in this edition.',
    hooks: {
      onCombatStart: function (unit, it) {
        const n = Math.min(8, Math.floor(A().gold() / 10));
        if (n <= 0) return;
        proc(unit, it, '+' + n + ' gold interest');
        A().gainGold(n);
        A().log(unit.name + '\'s ledger accrues ' + n + ' gold of interest. Nobody understands how.', 'system');
      },
    },
  });
  item({
    id: 'hireling_contract', name: 'Hireling Contract (Steve)', slot: 'trinket', rarity: 'rare', icon: '📜',
    desc: 'At the start of each combat, Steve the Torchbearer (a 12 HP summon with Torch Poke and Cower Professionally) joins you.',
    flavor: 'Two copper a day plus dental. Steve did not read the part about monsters.',
    hooks: {
      onCombatStart: function (unit) {
        const spot = DD.Grid.emptyTilesNear(unit.x, unit.y, 3).filter(function (p) {
          return !DD.Grid.isDrop(p.x, p.y) && !DD.Grid.hazardAt(p.x, p.y, null);
        })[0];
        if (spot) A().summon(unit, 'steve_torchbearer', spot.x, spot.y);
      },
    },
  });
  item({
    id: 'chaos_crystal', name: 'Chaos Crystal (Cubic Zirconia)', slot: 'trinket', rarity: 'legendary', icon: '💎',
    desc: 'Whenever you use a skill, 25% chance of a good Wild Surge.',
    flavor: 'Certified genuine wild magic by a wizard who is definitely real and not three goblins in a robe.',
    hooks: {
      onSkillUsed: function (ctx, it) {
        const u = ctx.user;
        if (!active(u) || !ctx.skill || isConsumable(ctx.skill) || notAUse(ctx) || !DD.WildMagic) return;
        if (rng().chance(0.25)) DD.WildMagic.surge(u, { good: true, source: it.id });
      },
    },
  });
  item({
    // rare, not legendary: flight is pure mobility and measured no stronger than a rare (docs/notes/items.md Review)
    id: 'party_balloons', name: 'Bundle of Party Balloons', slot: 'trinket', rarity: 'rare', icon: '🎈',
    stats: { mov: 1 },
    // v2 request: flyers ignore everything on the floor (terrain, surfaces, traps, plates); clouds and blasts still reach them
    desc: '+1 Move. You fly: you float over height, pits, liquids and everything on the floor (fire, puddles, traps) and ignore terrain costs.',
    flavor: 'You float. Everyone else floats some follow-up questions.',
    hooks: {
      onCombatStart: function (unit, it) {
        unit.flags = unit.flags || {};
        unit.flags.flying = true;
        balloonSprite(unit);
        proc(unit, it, 'Up, up and away!');
      },
      // cosmetic only: re-tie the balloons if a skill or status swapped the sprite (no-op otherwise)
      onSkillUsed: function (ctx) { balloonSprite(ctx.user); },
      onRoundStart: function (unit) { balloonSprite(unit); },
      onTurnStart: function (unit) { balloonSprite(unit); },
      onTurnEnd: function (unit) { balloonSprite(unit); },
    },
  });
  // Pocket Hourglass bookkeeping, kept outside the fight state (never saved, never part of a dry run's result):
  // `pricing` blocks re-entry while it prices a skill without itself; `quotes[unit|skill|uses]` is the latest discounted
  // quote for that skill at that use count. pay() quotes, then counts the use, so onSkillUsed finds the price that use
  // paid under the count before it. Keyed by the count, a later query (a skill that re-prices itself mid-execute, like
  // Power Nap) or a free re-use (Delegate, an echo, an attack of opportunity) can neither overwrite nor reuse that quote.
  const HOURGLASS = { pricing: false, quotes: {} };
  function slotFor(unit, skill) { return DD.Combat.slotsOf(unit).filter(function (sl) { return sl.id === skill.id; })[0] || null; }
  function quoteKey(unit, skill, uses) { return unit.id + '|' + skill.id + '|' + uses; }
  item({
    id: 'pocket_hourglass', name: 'Pocket Hourglass (Sand Not Included)', slot: 'trinket', rarity: 'legendary', icon: '⌛',
    desc: 'Your first skill each turn that costs AP costs 1 less.',
    flavor: 'Borrowed time at a very reasonable rate. Do not read the rate.',
    hooks: {
      onCombatStart: function () { HOURGLASS.quotes = {}; },   // drop last fight's unit references
      // pure (the HUD asks every hover): it only prices; onSkillUsed spends the discount. v2: only on the wearer's own
      // turn (AP is only spent then; on other turns the HUD shows the full price)
      modifyCost: function (c, it) {
        const u = c.unit;
        if (HOURGLASS.pricing || !u || !c.skill) return;
        const sl = slotFor(u, c.skill);
        const key = quoteKey(u, c.skill, sl ? sl.uses || 0 : -1);
        delete HOURGLASS.quotes[key];   // the newest price for this use count wins (pay() asks last)
        if (isConsumable(c.skill) || !ownTurn(u) || !(c.ap > 0)) return;
        const m = peek(u, it);
        if (m && m.turn === turnKey()) return;
        // the price every other source settles on without the Hourglass: a later one (a random passive, a rule) may
        // set the cost outright or only discount 2+ AP skills, and then this discount changes nothing
        let full;
        HOURGLASS.pricing = true;
        try { full = DD.Combat.costOf(u, c.skill, sl ? sl.level : 1).ap; } finally { HOURGLASS.pricing = false; }
        c.ap -= 1;
        c.itemHourglass = { full: full };
        HOURGLASS.quotes[key] = c;   // c.ap ends up as the final price once the later sources are done with it
      },
      onSkillUsed: function (ctx, it) {
        const u = ctx.user;
        if (!u || !ctx.skill || !ctx.slot) return;
        // a paid use: pay() quoted at count n, then counted it (n + 1). A free use (Delegate, an echo, an attack of
        // opportunity) was not counted, and the quote under its count − 1 was already consumed by the paid use that
        // made that count.
        const key = quoteKey(u, ctx.skill, (ctx.slot.uses || 0) - 1);
        const q = HOURGLASS.quotes[key];
        delete HOURGLASS.quotes[key];
        // spent only when the discount lowered the price that use paid
        if (!q || !ownTurn(u) || !(q.ap < q.itemHourglass.full)) return;
        mem(u, it).turn = turnKey();
      },
    },
  });
  item({
    id: 'bag_of_tricks_tricked', name: 'Bag of Tricks (Tricked)', slot: 'trinket', rarity: 'cursed', icon: '🎲',
    stats: { ap: 1 },
    desc: '+1 AP. At the start of each of your turns after the first, a random bad or chaotic Wild Surge happens to you.',
    flavor: 'The tricks are on you. All of them. Every turn.',
    hooks: {
      onTurnStart: function (unit, it) {
        const s = S();
        if (!s || s.round < 2 || !DD.WildMagic) return;
        DD.WildMagic.surge(unit, { good: false, source: it.id });
      },
    },
  });
  item({
    id: 'pay_to_win_medallion', name: 'Pay-to-Win Medallion', slot: 'trinket', rarity: 'cursed', icon: '🪙',
    stats: { dmg: 0.3 }, price: 1,
    desc: '+30% damage. Every skill you use costs the party 1 gold; if it can\'t pay, you lose 3 HP instead (never below 1).',
    flavor: 'Free to play! (Terms, conditions and your firstborn apply.)',
    hooks: {
      onSkillUsed: function (ctx, it) {
        const u = ctx.user;
        // attacks of opportunity are free reactions (DESIGN §4.2), echoes free re-runs: no microtransaction
        if (!active(u) || !ctx.skill || isConsumable(ctx.skill) || notAUse(ctx)) return;
        if (A().spendGold(1)) { DD.FX.particles(u, { kind: 'coins', count: 3 }); return; }
        proc(u, it, 'Insufficient funds!', BAD);
        selfHarm(u, 3, 'microtransactions');
      },
      onTakeDamage: clampNonlethal,
    },
  });
  item({
    id: 'indiscriminate_ring', name: 'Ring of Indiscriminate Regeneration', slot: 'trinket', rarity: 'cursed', icon: '💍',
    desc: 'At the start of your turn, every unit within 3 tiles of you heals 5 HP: you, your allies and your foes.',
    flavor: 'The fine print says "the wearer and anything nearby with a pulse". It was very fine print.',
    hooks: {
      onTurnStart: function (unit) {
        S().units.filter(function (o) { return active(o) && dist(o, unit) <= 3; }).forEach(function (o) { A().heal(null, o, 5); });
      },
    },
  });

  // ======================================================================================================
  // Steve the Torchbearer (Hireling Contract)
  // ======================================================================================================
  DD.registerSkill({
    id: 'steve_torch_poke', name: 'Torch Poke', owner: 'summon', icon: '🔥', kind: 'attack', tags: ['melee', 'fire'], ap: 1,
    levels: [{ dmg: 3, burn: 1 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to an adjacent foe and apply ' + L.burn + ' Burn.'; },
    flavor: 'Steve\'s one move. He practised it on a scarecrow. The scarecrow won.',
    execute: function (ctx) {
      const t = ctx.targetUnit;
      if (!t || !active(t)) return;
      DD.FX.lunge(ctx.user, t);
      DD.FX.particles(t, { kind: 'fire', count: 8 });
      A().damage(ctx.user, t, ctx.L.dmg, { element: 'fire' });
      if (active(t)) A().addStatus(t, 'burn', { stacks: ctx.L.burn }, ctx.user);
      A().maybeBark(ctx.user, 'attack', 0.3);
    },
  });
  DD.registerSkill({
    id: 'steve_cower', name: 'Cower Professionally', owner: 'summon', icon: '🙈', kind: 'buff', tags: [], ap: 1, cooldown: 1,
    levels: [{ block: 4 }],
    target: { type: 'self' },
    desc: function (L) { return 'Gain ' + L.block + ' Block.'; },
    flavor: 'Steve has a certificate in cowering. It is laminated.',
    execute: function (ctx) { A().addBlock(ctx.user, ctx.L.block); },
  });
  DD.registerSummon({
    id: 'steve_torchbearer', name: 'Torchbearer', hp: 12, mov: 4, ap: 2, armor: 0, tags: ['human', 'hireling'],
    names: ['Steve', 'Steve II', 'Other Steve', 'Steve (Temp)', 'Steven', 'Big Steve'],
    sprite: {
      base: 'humanoid', scale: 0.82, build: 'slim', outfit: 'tunic',
      palette: { skin: '#f0c7a0', cloth: '#7d5a38', cloth2: '#d8c08a', hair: '#c4621f', metal: '#a7b0ba', eye: '#24170e',
        accent: '#ffb347', outline: '#1d140e', boots: '#4a3424', belt: '#3b2a1c', pants: '#5b4630' },
      head: { size: 1.1, hair: 'short', hat: 'helmet', eyes: 'big', mouth: 'open' },
      mainhand: 'torch', offhand: 'lantern', extras: ['satchel', 'belt'],
      // the "helmet" is his mum's stew pot: the handle sticks out of the back (head centre ≈ y −28 for this build)
      overlay: function (g) {
        g.line(-11, -31.2, -18, -32.6, g.pal.outline, 3.6);
        g.line(-11.5, -31.2, -17.4, -32.4, '#8d969f', 1.8);
        g.circle(-18.2, -32.7, 1.5, '#8d969f');
      },
    },
    skills: ['steve_torch_poke', 'steve_cower'],
    barks: {
      spawn: ['I brought a torch! And a spare torch!', 'Is this covered by the dental plan?', 'Nobody said there\'d be monsters.',
        'Steve, reporting for... is that a goblin?'],
      attack: ['Back! Back, I say! Please?', 'Fire is bad! For you!', 'Sorry! Sorry!'],
      hurt: ['That\'s not in the contract!', 'Hazard pay! I want hazard pay!', 'My torch arm!'],
      death: ['Tell my mum... I held it high...', 'Should have... read the contract...', 'Dental... plan...'],
    },
    desc: 'A hireling torchbearer on two copper a day plus dental. Holds the light, pokes the darkness, screams on cue.',
  });

  // ======================================================================================================
  // Public helpers
  // ======================================================================================================
  DD.Items = {
    /** Every shared item id registered by this file (display order: weapons, armor, trinkets). */
    ids: IDS,
    /** Does a combat unit (unit.items) or a RunHero (rh.items slots) carry item `id`? */
    has: function (who, id) {
      if (!who || !who.items) return false;
      if (Array.isArray(who.items)) return who.items.indexOf(id) >= 0;
      return ['weapon', 'armor', 'trinket'].some(function (k) { return who.items[k] === id; });
    },
    /** Scratch state an item keeps on a unit for the current fight (null when it has none yet). */
    state: function (unit, id) { return (unit && unit.data && unit.data['item_' + id]) || null; },
  };
})();
