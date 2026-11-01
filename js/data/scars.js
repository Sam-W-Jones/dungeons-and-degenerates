/* Dungeons and Degenerates — js/data/scars.js
 * Scars (DESIGN §3/§7): small permanent debuffs a hero gets when they end a fight downed. Removable at shops and
 * taverns. `stats` use the item stat keys (hp, mov, dmg, heal, range, ...) and are summed by DD.Run.heroStats;
 * `hooks` are combat hooks (ARCHITECTURE §5.3) fired by DD.Hooks with the scar def as the LAST argument.
 */
(function () {
  'use strict';
  const DD = window.DD;

  function addStatus(unit, id, opts) {
    if (unit && !unit.dead && DD.Act && DD.Act.addStatus && DD.getStatus(id)) DD.Act.addStatus(unit, id, opts, null);
  }
  function note(unit, text) {
    if (!unit) return;
    if (DD.FX && DD.FX.text) DD.FX.text(unit, text, { color: '#d9a0ff', size: 14 });
    if (DD.Act && DD.Act.log) DD.Act.log((unit.name || 'A hero') + ': ' + text, 'status');
  }
  function addFlat(d, n) { d.flat = (d.flat || 0) + n; }

  // ---- stat scars -------------------------------------------------------------------------
  DD.registerScar({
    id: 'scar_trick_knee', name: 'Trick Knee', icon: '🦵',
    desc: '-1 move.',
    flavor: 'It can predict rain with 60% accuracy. It cannot predict stairs.',
    stats: { mov: -1 },
  });

  DD.registerScar({
    id: 'scar_bruised_ego', name: 'Bruised Ego', icon: '💔',
    desc: 'Deal 5% less damage.',
    flavor: 'Still thinks about that goblin who laughed at them. Daily.',
    stats: { dmg: -0.05 },
  });

  DD.registerScar({
    id: 'scar_glass_jaw', name: 'Glass Jaw', icon: '🥛',
    desc: '-4 max HP.',
    flavor: 'Technically still a jaw. Mostly a vibe now.',
    stats: { hp: -4 },
  });

  DD.registerScar({
    id: 'scar_tinnitus', name: 'Tinnitus', icon: '🔔',
    desc: '-1 range on skills with range 2 or more.',
    flavor: 'The bard says it is the sound of their talent. It is not.',
    stats: { range: -1 },
  });

  // ---- hook scars -------------------------------------------------------------------------
  DD.registerScar({
    id: 'scar_stage_fright', name: 'Stage Fright', icon: '😰',
    desc: 'Start each combat Weak (deal 25% less damage) during your first turn.',
    flavor: 'Rehearsed the battle cry in the mirror. Forgot it anyway.',
    hooks: {
      onCombatStart: function (unit) { addStatus(unit, 'weak', { stacks: 1, turns: 1 }); },
    },
  });

  DD.registerScar({
    id: 'scar_hangover', name: 'Permanent Hangover', icon: '🍺',
    desc: '-1 AP on your first turn of each combat.',
    flavor: 'One drink at the Leaky Flagon. One. Six weeks ago.',
    hooks: {
      onTurnStart: function (unit) {
        const st = DD.Combat && DD.Combat.state;
        if (!unit || unit.dead || !st || st.round !== 1 || !(unit.ap > 0)) return;
        unit.ap -= 1;
        note(unit, '-1 AP (hangover)');
      },
    },
  });

  DD.registerScar({
    id: 'scar_weak_ankles', name: 'Weak Ankles', icon: '🦶',
    desc: 'Take +3 damage from bumps and falls.',
    flavor: 'Rolled an ankle on a d4 in 1987. Never recovered.',
    hooks: {
      modifyIncomingDamage: function (d) {
        if (d && (d.cause === 'bump' || d.cause === 'fall')) addFlat(d, 3);
      },
    },
  });

  DD.registerScar({
    id: 'scar_afraid_of_fire', name: 'Afraid of Fire Now', icon: '🔥',
    desc: 'Take +2 damage from fire.',
    flavor: 'Zarathor says it "builds character". Zarathor caused it.',
    hooks: {
      modifyIncomingDamage: function (d) { if (d && d.element === 'fire') addFlat(d, 2); },
    },
  });

  DD.registerScar({
    id: 'scar_imposter_syndrome', name: 'Imposter Syndrome', icon: '🎭',
    desc: 'Deal 10% less damage while at full HP.',
    flavor: 'Only feels like a real adventurer after getting stabbed a bit.',
    hooks: {
      modifyOutgoingDamage: function (d) {
        const src = d && d.source;
        if (src && src.maxHp > 0 && src.hp >= src.maxHp) d.mult = (d.mult == null ? 1 : d.mult) * 0.9;
      },
    },
  });

  DD.registerScar({
    id: 'scar_thin_skin', name: 'Thin Skin', icon: '🧻',
    desc: 'Take +1 damage from enemy skills.',
    flavor: 'Emotionally AND physically. The bard noticed both.',
    hooks: {
      modifyIncomingDamage: function (d) {
        if (d && d.source && d.source.side === 'enemy' && (d.cause === 'skill' || !d.cause)) addFlat(d, 1);
      },
    },
  });

  DD.registerScar({
    id: 'scar_commitment_issues', name: 'Commitment Issues', icon: '💍',
    desc: 'Your first skill each combat costs +1 AP.',
    flavor: 'Wants to keep their options open. Their options are stabbing.',
    hooks: {
      modifyCost: function (c) {
        if (c && c.unit && !(c.unit.data && c.unit.data.scarCommitted)) c.ap = (c.ap || 0) + 1;
      },
      onSkillUsed: function (ctx) {
        const u = ctx && ctx.user;
        if (u) { u.data = u.data || {}; u.data.scarCommitted = true; }
      },
    },
  });

  DD.registerScar({
    id: 'scar_owes_the_dm', name: 'Owes the DM Money', icon: '💸',
    desc: 'Lose 5 gold after each combat you win.',
    flavor: 'Borrowed a pencil in session one. The interest is brutal.',
    hooks: {
      onCombatEnd: function (unit, result) {
        if (result !== 'victory' || !DD.Act || !DD.Act.loseGold) return;
        const lost = DD.Act.loseGold(5);
        if (lost) note(unit, '-' + lost + ' gold (debt)');
      },
    },
  });

  DD.registerScar({
    id: 'scar_sleep_talker', name: 'Sleep Talker', icon: '😴',
    desc: 'Start each combat Marked 3 (the first hit you take deals +3 damage).',
    flavor: 'Mumbles the party\'s battle plan out loud. Enemies take notes.',
    hooks: {
      onCombatStart: function (unit) { addStatus(unit, 'marked', { stacks: 3 }); },
    },
  });
})();
