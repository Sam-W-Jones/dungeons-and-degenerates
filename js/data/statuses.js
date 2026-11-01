/* Dungeons and Degenerates — js/data/statuses.js
 * The 25 core statuses (DESIGN §4.4, ARCHITECTURE §6.5). Most semantics live in the engine (DD.Act damage
 * pipeline, DD.Combat AP rules, DD.AI turns); ticking effects live in the hooks below.
 * v2: `turns` count the owner's OWN turns (they tick at the end of each of its turns). A status applied during its
 * owner's own turn skips that first tick, so turns: 1 always means "through its next turn".
 * Extra (non-contract) def fields read by the engine:
 *   defaultTurns  — turns when addStatus() gets none (-1 = until removed)
 *   skipFresh     — false: a status applied during the owner's own turn DOES tick at the end of that turn
 *   stunLike      — the unit loses its next turn (0 AP; AI turns pass) and pending wind-ups are interrupted
 */
(function () {
  'use strict';
  const DD = window.DD;

  function left(st) {
    if (!st || st.turns < 0) return '';
    return ' (' + st.turns + ' turn' + (st.turns === 1 ? '' : 's') + ' left)';
  }
  function decStacks(unit, st) {
    st.stacks -= 1;
    if (st.stacks <= 0) DD.Act.removeStatus(unit, st.id, { silent: true });
  }
  function sourceOf(st) {
    return st && st.source && DD.Combat && DD.Combat.byId ? DD.Combat.byId(st.source) : null;
  }

  DD.registerStatus({
    id: 'burn', name: 'Burning', icon: '🔥', color: '#ff7a1a', type: 'debuff', stacking: 'stack', maxStacks: 20,
    decay: 'never', defaultTurns: -1,
    desc: function (st) { return 'Takes ' + st.stacks + ' fire damage at the end of its turn, then Burn −1. Water or Wet puts it out.'; },
    hooks: {
      onTurnEnd: function (unit, st) {
        DD.Act.damage(sourceOf(st), unit, st.stacks, { element: 'fire', cause: 'status', tags: ['burn'] });
        if (!unit.dead && DD.Act.getStatus(unit, 'burn') === st) decStacks(unit, st);
      },
    },
  });

  DD.registerStatus({
    id: 'poison', name: 'Poisoned', icon: '☠️', color: '#7bd23c', type: 'debuff', stacking: 'stack', maxStacks: 20,
    decay: 'never', defaultTurns: -1,
    desc: function (st) { return 'Takes ' + st.stacks + ' poison damage at the start of its turn (ignores Block), then Poison −1.'; },
    hooks: {
      onTurnStart: function (unit, st) {
        DD.Act.damage(sourceOf(st), unit, st.stacks, { element: 'poison', cause: 'status', ignoreBlock: true, tags: ['poison'] });
        if (!unit.dead && DD.Act.getStatus(unit, 'poison') === st) decStacks(unit, st);
      },
    },
  });

  DD.registerStatus({
    id: 'bleed', name: 'Bleeding', icon: '🩸', color: '#c0122c', type: 'debuff', stacking: 'stack', maxStacks: 20,
    decay: 'never', defaultTurns: -1,
    desc: function (st) { return 'Each move or push: takes ' + st.stacks + ' damage and leaves blood. Bleed −1 at the end of its turn.'; },
    hooks: {
      onTurnEnd: function (unit, st) { decStacks(unit, st); },
    },
  });

  DD.registerStatus({
    id: 'stun', name: 'Stunned', icon: '💫', color: '#ffe14d', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1, stunLike: true,
    desc: function (st) { return 'Loses its next turn (no AP) and any wind-up is interrupted.' + left(st); },
  });

  DD.registerStatus({
    id: 'root', name: 'Rooted', icon: '🌿', color: '#5aa83a', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) { return "Can't take move actions (can still be pushed)." + left(st); },
  });

  DD.registerStatus({
    id: 'weak', name: 'Weakened', icon: '🥀', color: '#a08cbf', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return 'Deals 25% less damage.' + left(st); },
  });

  DD.registerStatus({
    id: 'vulnerable', name: 'Vulnerable', icon: '💔', color: '#ff5c8a', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return 'Takes 25% more damage.' + left(st); },
  });

  DD.registerStatus({
    id: 'taunt', name: 'Taunted', icon: '😤', color: '#ff3b30', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) {
      const src = sourceOf(st);
      const who = src ? src.name : 'the taunter';
      return 'Enemy: on its turn it must attack ' + who + ' if it can (no other attacks). Hero: −50% damage vs anyone but ' + who + '.' + left(st);
    },
  });

  DD.registerStatus({
    id: 'haste', name: 'Hasted', icon: '🏃', color: '#4fd1ff', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return 'Heroes: +1 AP at the start of their turn. Enemies: +2 move.' + left(st); },
  });

  DD.registerStatus({
    id: 'slow', name: 'Slowed', icon: '🐌', color: '#8a9bb0', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return 'Heroes: −1 AP at the start of their turn (min 1). Enemies: −2 move (min 1).' + left(st); },
  });

  DD.registerStatus({
    id: 'regen', name: 'Regenerating', icon: '💚', color: '#3ddc84', type: 'buff', stacking: 'refresh', maxStacks: 20,
    decay: 'turnEnd', defaultTurns: 3,
    desc: function (st) { return 'Heals ' + st.stacks + ' HP at the start of its turn.' + left(st); },
    hooks: {
      onTurnStart: function (unit, st) { DD.Act.heal(sourceOf(st), unit, st.stacks, { cause: 'status' }); },
    },
  });

  DD.registerStatus({
    id: 'stealth', name: 'Stealthed', icon: '👤', color: '#6b6f8a', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return "Can't be targeted by enemy single-target skills; enemies ignore it. Breaks when it deals damage." + left(st); },
  });

  DD.registerStatus({
    id: 'marked', name: 'Marked', icon: '🎯', color: '#ff9f1a', type: 'debuff', stacking: 'stack', maxStacks: 30,
    decay: 'never', defaultTurns: -1,
    desc: function (st) { return 'The next damage it takes is increased by ' + st.stacks + ', then the mark is removed.'; },
  });

  DD.registerStatus({
    id: 'dazzled', name: 'Dazzled', icon: '✨', color: '#fff3a3', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) { return 'Enemy: its attacks land 1 tile off in a random direction. Hero: −1 max range.' + left(st); },
  });

  DD.registerStatus({
    id: 'confused', name: 'Confused', icon: '😵', color: '#d77bff', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) { return 'Enemy: its attacks turn a random quarter turn (may hit friends). Hero: moving costs 2 AP.' + left(st); },
  });

  DD.registerStatus({
    id: 'charmed', name: 'Charmed', icon: '💘', color: '#ff6fb5', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) {
      const src = sourceOf(st);
      return 'Enemy: on its turn it fights for the other side. Hero: can\'t damage ' + (src ? src.name : 'the charmer') + '; −1 AP.' + left(st);
    },
  });

  DD.registerStatus({
    id: 'inspired', name: 'Inspired', icon: '🌟', color: '#ffd23f', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return 'Deals 25% more damage.' + left(st); },
  });

  DD.registerStatus({
    id: 'wet', name: 'Wet', icon: '💧', color: '#3aa0ff', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return "Can't Burn. Takes +50% lightning damage. Frost freezes it solid." + left(st); },
  });

  DD.registerStatus({
    id: 'silenced', name: 'Silenced', icon: '🤐', color: '#9aa4b5', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) { return "Can't use spells (a spell wind-up fizzles)." + left(st); },
  });

  DD.registerStatus({
    id: 'sleep', name: 'Asleep', icon: '💤', color: '#8fb7ff', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2, stunLike: true,
    desc: function (st) { return 'Loses its turns like Stun (interrupts wind-ups), but wakes up when damaged.' + left(st); },
  });

  DD.registerStatus({
    id: 'invulnerable', name: 'Invulnerable', icon: '🛡️', color: '#f5f5f5', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) { return 'Takes no damage.' + left(st); },
  });

  DD.registerStatus({
    id: 'frozen', name: 'Frozen', icon: '🧊', color: '#a8e6ff', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1, stunLike: true,
    desc: function (st) { return 'Loses its next turn like Stun. Takes +50% physical damage; fire damage thaws it.' + left(st); },
  });

  DD.registerStatus({
    id: 'thorns', name: 'Thorny', icon: '🌵', color: '#7fae4a', type: 'buff', stacking: 'stack', maxStacks: 20,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return 'When an adjacent attacker damages it, deals ' + st.stacks + ' damage back.' + left(st); },
  });

  DD.registerStatus({
    id: 'empowered', name: 'Empowered', icon: '💪', color: '#ff8c42', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () { return 'Its next damaging skill deals +50% damage (then this is used up).'; },
  });

  DD.registerStatus({
    id: 'sheep', name: 'Sheep', icon: '🐑', color: '#f2efe6', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) { return 'Polymorphed: can only move (move 2), no skills; interrupts wind-ups. Baa.' + left(st); },
  });
})();
