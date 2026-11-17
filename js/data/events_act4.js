/* Dungeons and Degenerates — js/data/events_act4.js
 * V3, act IV "Under the Table": the event stops of Svammiel's gauntlet (plan .tmp/v3/design.md §5.6; V §15; the goats
 * addendum §17.7). Ids 'ev_a4_*', every one `acts: [4]` (DD.registerEvent defaults to the classic acts, so nothing
 * here can turn up before the twist) and none ever starts a fight: in the gauntlet "ALL encounters are mini-bosses"
 * (DD.Run.queueCombat refuses there anyway; the act-4 event suite checks no choice calls api.combat). Seven events cover
 * the lobby and every intermission of the gauntlet. Hints are the exact mechanics in the v2 wording ("Pay N gold."
 * gates its choice); outcome texts are built from what really happened and name heroes instead of using pronouns for
 * them. Healing here is a one-off stop heal, as v2's events (lead decision D9 binds the heroes' kits, not event stops).
 * Pronouns: the DM he, Svammiel he, Skylla she, Zarak he (the League's "dwarf"; an orc, he says), Galbraith he, the hags
 * she, the Gardener it, Herd Mentality he.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const POCKET_GOLD = 15;       // a consumable that does not fit in the party's pockets is sold for this much (as events.js)
  const CONSOLATION_GOLD = 30;  // nothing left to roll / upgrade for that hero (as events.js)
  const POCKETS = ' (15 gold if your pockets are full)';

  // ---- helpers (runtime only; the same outcomes and fallbacks as js/data/events.js) ---------------------------------
  function canPay(n) { return function (run) { return !!run && (run.gold || 0) >= n; }; }
  function stop(s) { return /[.!?…]["”')]?$/.test(s) ? s : s + '.'; }
  /** A random living hero: { idx, name } (idx -1 and 'Somebody' with nobody alive). */
  function anyone(api) {
    const idx = api.randomHeroIdx();
    return { idx: idx, name: idx >= 0 ? api.heroName(idx) : 'Somebody' };
  }
  /** A roll on the Table of Questionable Blessings for hero idx; the consolation gold when the table has nothing. */
  function bless(api, idx, opts) {
    const name = api.heroName(idx);
    const r = api.rollPassive(idx, opts);
    if (r) {
      const done = (r.results || []).map(function (x) { return x && x.text; }).filter(Boolean);
      return done.length ? done.join(' ') : name + ' rolls on the Table of Questionable Blessings next.';
    }
    const g = api.gold(CONSOLATION_GOLD);
    return 'The Table of Questionable Blessings has nothing for ' + name + ' today, so the DM slides over ' + g + ' gold instead.';
  }
  function skillName(id) { const d = id ? DD.getSkill(id) : null; return d ? d.name : 'a trick'; }
  /** Hero idx upgrades a random socketed skill; with everything maxed, the consolation gold. */
  function upgrade(api, idx) {
    const name = api.heroName(idx);
    const id = api.upgradeSkill(idx);
    if (id) {
      const rh = api.hero(idx);
      const sl = rh ? rh.skills.filter(function (k) { return k.id === id; })[0] : null;
      return name + '\'s ' + skillName(id) + ' is now ' + DD.util.roman(sl ? sl.level : 1) + '.';
    }
    const g = api.gold(CONSOLATION_GOLD);
    return name + ' has nothing left to upgrade, so the DM pays ' + g + ' gold instead.';
  }
  /** One random consumable; sold for POCKET_GOLD when the pockets are full. Returns a sentence. */
  function potion(api) {
    const id = api.giveConsumable();
    const d = id ? DD.getConsumable(id) : null;
    if (d) return stop('You pocket ' + d.name);
    return 'Your pockets are full, so you sell it for ' + api.gold(POCKET_GOLD) + ' gold.';
  }
  /** Hero h ({ idx, name }) takes n damage (event damage never goes below 1 HP). Returns a sentence. */
  function hurt(api, h, n) {
    const lost = api.damage(n, h.idx);
    return lost > 0 ? h.name + ' loses ' + lost + ' HP.' : h.name + ' is already at 1 HP and just says "ow".';
  }
  /** Hero idx gains a random scar. Returns ': <its name>.' or '.'. */
  function scar(api, idx) {
    const sc = idx >= 0 ? api.addScar(idx) : null;
    const d = sc ? DD.getScar(sc) : null;
    return d ? ': ' + stop(d.name) : '.';
  }

  // ---- the events ------------------------------------------------------------------------------------------------------
  DD.registerEvent({
    id: 'ev_a4_support_group', acts: [4], weight: 1, icon: '🪑',
    title: 'The DM\'s Support Group',
    text: 'Behind a chair leg, a circle of folding chairs: a goblin DM, a lich DM and your DM, holding a paper cup of cold coffee. ' +
      '"Hi," he says. "I\'m the DM, and it has been two sessions since I last ran a game." Everyone says "Hi, DM," and he looks ' +
      'at you hopefully.',
    choices: [
      {
        label: 'Give him a pep talk.',
        hint: 'Every hero heals 20% of their max HP.',
        resolve: function (api) {
          api.heal(0.2);
          return 'You tell him he was a great DM. He was a great DM. He cries a little, then bandages everyone with the tablecloth.';
        },
      },
      {
        label: 'Steal his snacks.',
        hint: 'Gain a random consumable' + POCKETS + '. He notices.',
        resolve: function (api) {
          return 'You lift his snack bag: something useful and three Cheetos. ' + potion(api) + ' He watches you go with enormous, ' +
            'wounded eyes.';
        },
      },
      {
        label: 'Invite him along.',
        hint: 'Gain 25 gold: he insists on paying his share, then stays behind.',
        resolve: function (api) {
          const g = api.gold(25);
          return 'He tears up, presses his last ' + g + ' gold into your hands and says he can\'t come. "He\'d see me. He sees everything."';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_a4_suggestion_box', acts: [4], weight: 1, icon: '📮',
    title: 'Svammiel\'s Suggestion Box',
    text: 'A box is nailed to a table leg: SUGGESTIONS (I WILL IGNORE THEM), signed S. It is stuffed to the lid with slips of paper, ' +
      'and every one of them says "stop cheating". Some are in your own handwriting, which is impossible and also upsetting.',
    choices: [
      {
        label: 'Draw a rude doodle of him.',
        hint: 'A random hero rolls on the Table of Questionable Blessings (curses possible).',
        resolve: function (api) {
          const h = anyone(api);
          return h.name + ' draws Svammiel with tiny wings and a big nose and posts it in the box. Something under the floor gasps. ' +
            bless(api, h.idx);
        },
      },
      {
        label: 'Leave a nice note.',
        hint: 'Every hero heals 10% of their max HP.',
        resolve: function (api) {
          api.heal(0.1);
          return 'You write "Nice wings" and post it. The box purrs. A warm, confusing feeling spreads through the whole party.';
        },
      },
      {
        label: 'Steal the whole box.',
        hint: 'Gain 30 gold. A random hero gains a random scar.',
        resolve: function (api) {
          const g = api.gold(30);
          const h = anyone(api);
          return 'Under the slips you find ' + g + ' gold in bribes. The box bites ' + h.name + ' on the way out' + scar(api, h.idx);
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_a4_recruitment_drive', acts: [4], weight: 1, icon: '📋',
    title: 'League Recruitment Drive',
    text: 'Skylla sits at a folding table under a banner far too long for the room, sipping from a mug that says EVIL. "We have ' +
      'openings," she says, without looking up. "Evil dental, evil hours, and the pay is signed off by Baba Yaga personally." ' +
      'Zarak, the League\'s dwarf, glares from the corner and mouths "ORC".',
    choices: [
      {
        label: 'Sign up as a spy.',
        hint: 'A random hero rolls on the Table of Questionable Blessings (curses possible). Skylla sees through it, mostly.',
        resolve: function (api) {
          const h = anyone(api);
          return h.name + ' signs up as "Definitely Evil". Skylla stamps the form without reading it. ' + bless(api, h.idx);
        },
      },
      {
        label: 'Pocket the free pens.',
        hint: 'Gain 20 gold. They are very nice pens.',
        resolve: function (api) {
          const g = api.gold(20);
          return 'You take every pen on the table. Each one is engraved with the League\'s full name and runs out of ink halfway. ' +
            'A pawnbroker pays ' + g + ' gold for the lot.';
        },
      },
      {
        label: 'Correct the banner\'s spelling.',
        hint: 'Every hero heals 15% of their max HP while Skylla explains, for an hour, why it is spelled that way.',
        resolve: function (api) {
          api.heal(0.15);
          return 'Skylla puts her mug down. An hour later you know far too much about the League\'s vowels, and everyone has had a ' +
            'very good sit-down.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_a4_bake_sale', acts: [4], weight: 1, icon: '🥧',
    title: 'The Coven\'s Bake Sale',
    text: 'Three hags sit behind a trestle table, selling pies. "Fresh!" says Granny Gristle. "Mostly fresh!" says Auntie Brine, and ' +
      'Cousin Mildred adds that she doesn\'t know what\'s in them, and she lives there. The chalkboard says ALL PIES 10 GOLD, ' +
      'SPECIAL PIE ON REQUEST.',
    choices: [
      {
        label: 'Buy a pie.',
        hint: 'Pay 10 gold. Every hero heals 25% of their max HP.',
        requires: canPay(10),
        resolve: function (api) {
          api.gold(-10);
          api.heal(0.25);
          return 'It is a perfectly good pie. Everybody checks it twice anyway. Granny Gristle beams the whole time you eat.';
        },
      },
      {
        label: 'Ask about the special pie.',
        hint: 'A random hero heals to full HP and gains a random scar.',
        resolve: function (api) {
          const h = anyone(api);
          if (h.idx < 0) return 'Nobody is brave enough to ask.';
          api.heal(1, h.idx);
          return h.name + ' eats the special pie. It is delicious and it fixes everything, and then it fixes one thing too many' +
            scar(api, h.idx);
        },
      },
      {
        label: 'Compliment Granny\'s knitting.',
        hint: 'Gain a random consumable' + POCKETS + '. Granny pinches every cheek in the party.',
        resolve: function (api) {
          return 'Granny Gristle glows, pinches every cheek in the party and presses a little something into your hands. ' + potion(api);
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_a4_book_signing', acts: [4], weight: 1, icon: '✍️',
    title: 'Galbraith\'s Book Signing',
    text: 'A queue of skeletons snakes between two table legs. At the front, Grand Magister Galbraith signs copies of Galbraith\'s ' +
      'Spells (Volume 312) with a quill plucked from a phoenix that owed him money. "Name?" he asks, then spells his own instead: ' +
      '"G-A-L-B-R-A-I-T-H."',
    choices: [
      {
        label: 'Buy a signed copy.',
        hint: 'Pay 40 gold. A random hero upgrades a skill.',
        requires: canPay(40),
        resolve: function (api) {
          api.gold(-40);
          const h = anyone(api);
          return 'Galbraith signs it "To my future victim". The footnotes are genuinely useful. ' + (h.idx >= 0 ? upgrade(api, h.idx)
            : 'Nobody is left to read it.');
        },
      },
      {
        label: 'Ask him to sign your arm.',
        hint: 'A random hero loses 4 HP and rolls on the Table of Questionable Blessings (curses possible).',
        resolve: function (api) {
          const h = anyone(api);
          if (h.idx < 0) return 'Nobody is brave enough to ask.';
          return 'Galbraith signs ' + h.name + '\'s arm in spellfire. It stings. ' + hurt(api, h, 4) + ' ' + bless(api, h.idx);
        },
      },
      {
        label: 'Point out a typo.',
        hint: 'Gain 30 gold: he pays you to stop talking about it.',
        resolve: function (api) {
          const g = api.gold(30);
          return 'Page nine hundred spells "Galbraith" with two Ls. The queue goes silent. Galbraith pays you ' + g + ' gold to never ' +
            'mention it again.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_a4_compost_heap', acts: [4], weight: 1, icon: '🍂',
    title: 'The Gardener\'s Compost Heap',
    text: 'Behind a table leg the Gardener keeps a compost heap, raked into a perfect square and labelled in tiny brass letters: DO ' +
      'NOT TOUCH. Something gold glints near the top, between an eggshell and a very old boot. Somewhere nearby, eight metal legs ' +
      'tap impatiently.',
    choices: [
      {
        label: 'Dig for the gold.',
        hint: 'Gain 35 gold. A random hero loses 6 HP.',
        resolve: function (api) {
          const h = anyone(api);
          const g = api.gold(35);
          return 'You find ' + g + ' gold and a rake that was not there a moment ago. ' + (h.idx >= 0 ? 'It finds ' + h.name + '\'s shins. ' +
            hurt(api, h, 6) : 'It finds nobody.');
        },
      },
      {
        label: 'Add your rations to it.',
        hint: 'Every hero heals 15% of their max HP.',
        resolve: function (api) {
          api.heal(0.15);
          return 'You add your stale rations to the heap. It approves, in a warm, earthy way, and the warmth gets into everyone\'s ' +
            'bruises.';
        },
      },
      {
        label: 'Leave it tidy.',
        hint: 'A random hero rolls on the Table of Questionable Blessings (curses possible).',
        resolve: function (api) {
          const h = anyone(api);
          return h.name + ' rakes the heap back into a perfect square. Somewhere, a pair of garden shears snips approvingly. ' +
            bless(api, h.idx);
        },
      },
    ],
  });

  // the goats addendum §17.7 (optional seventh): Herd Mentality's tour merch
  DD.registerEvent({
    id: 'ev_a4_merch_table', acts: [4], weight: 1, icon: '👕',
    title: 'Herd Mentality\'s Merch Table',
    text: 'A folding table stands under a hand-painted sign: HERD MENTALITY, WORLD TOUR (THIS BASEMENT). Shirts, a foam finger and a ' +
      'signed record with a bite out of it. Nobody is minding the table. A hoofprint suggests somebody was supposed to.',
    choices: [
      {
        label: 'Buy a tour shirt.',
        hint: 'Pay 20 gold. A random hero rolls on the Table of Questionable Blessings (curses possible).',
        requires: canPay(20),
        resolve: function (api) {
          api.gold(-20);
          const h = anyone(api);
          return h.name + ' puts on the tour shirt. The tour dates on the back are all this basement. ' + bless(api, h.idx);
        },
      },
      {
        label: 'Sell the signed record.',
        hint: 'Gain 30 gold. A random hero loses 5 HP (a headbutt from nowhere).',
        resolve: function (api) {
          const g = api.gold(30);
          const h = anyone(api);
          return 'A passing kobold pays ' + g + ' gold for the record. ' + (h.idx >= 0 ? 'A headbutt arrives from nowhere. ' + hurt(api, h, 5) +
            ' Nobody sees the goat.' : 'Nobody sees the goat.');
        },
      },
      {
        label: 'Leave a one-star review.',
        hint: 'No effect. It feels good, and it does nothing.',
        resolve: function () {
          return stop('You write "One star. Too much bass" on a napkin and tuck it under the foam finger. It felt good. It did nothing');
        },
      },
    ],
  });
})();
