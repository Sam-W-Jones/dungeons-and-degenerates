/* Dungeons and Degenerates — js/data/events.js
 * Narrative events (ARCHITECTURE §3.9 / §9.5, DESIGN §3 / §11). Ids: 'ev_*'.
 *  - hero events: one per hero, two for Slate and Mayor Buga (offered only while that hero is alive in the party;
 *    they reward that hero)
 *  - generic events spread over the three acts
 * v2: there is no XP. "Experience" is a level-up through the event API: one hero drawn by the DM's rotation (random
 * among the lowest-level heroes, api.levelUp()) or, rarely and only in that hero's own event, a named hero
 * (api.levelUp(idx)). Hints are the exact mechanics; outcome text is built from what actually happened (level-ups,
 * item / skill / scar names, gold amounts). Generic outcomes name heroes instead of using pronouns; hero events use
 * the hero's own (DESIGN §6). Helpers degrade gracefully when a registry is empty, a hero has nothing left to gain or a
 * hero event is opened without its hero (debug).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const POCKET_GOLD = 15;       // a consumable that does not fit in the party's pockets is sold for this much
  const CONSOLATION_GOLD = 30;  // nothing left to learn / upgrade / roll, or nobody left to level up
  const HERO_WEIGHT = 2;        // hero events turn up a little more often while their hero is around
  const DEBT_SCAR = 'scar_owes_the_dm';   // Corelos' fine print (a random scar if he already owes)
  const EGO_SCAR = 'scar_bruised_ego';    // Valdris' haircut (a random scar if he already has it)
  const SLOTS = ['weapon', 'armor', 'trinket'];
  const POCKETS = ' (' + POCKET_GOLD + ' gold each if your pockets are full)';
  const ROTATION = 'One hero levels up (the DM rolls among the lowest-level heroes).';

  // ---- helpers (runtime only) ------------------------------------------------------------------------------
  function values(o) { return Object.keys(o || {}).map(function (k) { return o[k]; }); }
  function heroName(id) { const d = DD.getHero(id); return d ? d.name : id; }
  function living(run) {
    return run && Array.isArray(run.party) ? run.party.filter(function (h) { return h && !h.dead; }) : [];
  }
  /** requires(): that hero is alive in the party. */
  function withHero(id) { return function (run) { return living(run).some(function (h) { return h.id === id; }); }; }
  /** requires(): the party can pay n gold. */
  function canPay(n) { return function (run) { return !!run && (run.gold || 0) >= n; }; }
  function itemName(id) { const d = id ? DD.getItem(id) : null; return d ? d.name : 'something shiny'; }
  function scarName(id) { const d = id ? DD.getScar(id) : null; return d ? d.name : 'a brand-new scar'; }
  function skillName(id) { const d = id ? DD.getSkill(id) : null; return d ? d.name : 'a new trick'; }
  function consName(id) { const d = id ? DD.getConsumable(id) : null; return d ? d.name : 'a mystery flask'; }
  function list(parts) {
    if (parts.length < 2) return parts.join('');
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }
  /** Ends a sentence that may close on a name with its own punctuation ("Fetch!", "Back In My Day..."). */
  function stop(s) { return /[.!?…]["”')]?$/.test(s) ? s : s + '.'; }
  /** ['A', 'B', 'A'] -> 'two A and B' (consumable lists repeat names). */
  function tally(names) {
    const order = [];
    const count = {};
    names.forEach(function (n) { if (!count[n]) order.push(n); count[n] = (count[n] || 0) + 1; });
    return list(order.map(function (n) { return count[n] > 1 ? (['', '', 'two', 'three'][count[n]] || count[n]) + ' ' + n : n; }));
  }
  function fight(api, run, kind) { return { act: (run && run.act) || api.act || 1, kind: kind || 'normal' }; }

  /** The featured hero of a hero event: { idx, name, here, id }. A random living stand-in when the hero is
   *  missing (only possible when the event is opened by hand, e.g. ?screen=event&event=...). */
  function star(api, heroId) {
    let idx = api.heroIdx(heroId);
    const here = idx >= 0;
    if (!here) idx = api.randomHeroIdx();
    return { idx: idx, here: here, id: heroId, name: idx >= 0 ? api.heroName(idx) : heroName(heroId) };
  }
  function standIn(s) { return s.here ? '' : '(' + heroName(s.id) + ' is not in the party, so ' + s.name + ' steps in.) '; }
  /** A random living hero: { idx, name }. */
  function anyone(api) {
    const idx = api.randomHeroIdx();
    return { idx: idx, name: idx >= 0 ? api.heroName(idx) : 'Somebody' };
  }
  function aliveIdx(api) {
    const out = [];
    (api.party || []).forEach(function (h, i) { if (h && !h.dead) out.push(i); });
    return out;
  }

  /** The DM's die for a rotation level-up ("The DM rolls a d3 for it: 2! "); '' for a named one or a lone candidate. */
  function dmDie(lv) {
    if (!lv || !lv.rotation || !(lv.die > 1)) return '';
    if (lv.die === 2) return 'The DM flips a coin for it: ' + (lv.face === 1 ? 'heads' : 'tails') + '! ';
    return 'The DM rolls a d' + lv.die + ' for it: ' + lv.face + '! ';
  }
  /** One level-up: hero idx (a named level-up) or, idx omitted, the DM's rotation (random among the lowest-level
   *  living heroes). Nobody to level (that hero, or everyone, at the max level): CONSOLATION_GOLD. Returns a phrase. */
  function levelUp(api, idx) {
    const named = idx !== undefined;
    const lv = named ? (idx >= 0 ? api.levelUp(idx) : null) : api.levelUp();
    if (lv) return dmDie(lv) + lv.name + ' levels up to level ' + lv.to + '.';
    const g = api.gold(CONSOLATION_GOLD);
    return (named && idx >= 0 ? api.heroName(idx) + ' is' : 'Everyone is') + ' already at the max level, so the DM slides over ' +
      g + ' gold instead.';
  }

  /** A random item of `rarity` for the party (api.giveItem: auto-equipped on a free slot, cursed ones go to the
   *  bag). With nothing registered the API pays the rarity's price in gold. Returns a phrase. */
  function partyItem(api, rarity) {
    const before = api.gold();
    const id = api.giveItem({ rarity: rarity });
    if (id) return itemName(id);
    return 'a trinket you sell on the spot for ' + (api.gold() - before) + ' gold';
  }

  /** A `rarity` item for hero idx: one of the hero's own (hero-specific) items the party does not own yet, else any
   *  item of that rarity the hero can use; equipped on the hero when that slot is free (api.giveItem heroIdx).
   *  Returns a phrase that says who ended up wearing it. */
  function heroItem(api, idx, rarity) {
    const rh = api.hero(idx);
    const run = DD.Run && DD.Run.state;
    let id = null;
    if (rh && run && DD.Rewards) {
      const owned = DD.Rewards.ownedItems(run);
      const own = values(DD.defs.items).filter(function (d) {
        return d && d.hero === rh.id && d.rarity === rarity && !d.noDrop && owned.indexOf(d.id) < 0;
      });
      id = own.length ? api.rng.pick(own).id : DD.Rewards.randomItem({ rarity: rarity, hero: rh.id, act: api.act, run: run }, api.rng);
    }
    if (!id) return partyItem(api, rarity);
    const before = (api.party || []).map(function (h) { return h && h.items ? Object.assign({}, h.items) : {}; });
    api.giveItem({ id: id, heroIdx: idx });
    const eq = (api.party || []).findIndex(function (h, i) {
      return !!h && !!h.items && SLOTS.some(function (sl) { return h.items[sl] === id && before[i][sl] !== id; });
    });
    return itemName(id) + (eq === idx ? '' : eq >= 0 ? ' (' + api.heroName(eq) + ' wears it)' : ' (into the bag)');
  }

  /** n random consumables; each one that does not fit (or does not exist) is sold for POCKET_GOLD. */
  function potions(api, n) {
    const got = [];
    let sold = 0;
    for (let i = 0; i < n; i++) {
      const id = api.giveConsumable();
      if (id) got.push(consName(id));
      else sold += api.gold(POCKET_GOLD);
    }
    const parts = [];
    if (got.length) parts.push('you pocket ' + tally(got));
    if (sold) parts.push((got.length ? 'you sell the rest for ' : 'your pockets are full, so you sell ' + (n > 1 ? 'them' : 'it') + ' for ') + sold + ' gold');
    return parts.join(' and ') + '.';
  }

  function skillLevel(api, idx, id) {
    const rh = api.hero(idx);
    const s = rh ? rh.skills.filter(function (k) { return k.id === id; })[0] : null;
    return s ? s.level : 1;
  }

  /** Hero idx upgrades a random socketed skill; with everything maxed, CONSOLATION_GOLD. Returns a phrase. */
  function upgradeFor(api, idx) {
    const name = api.heroName(idx);
    const id = api.upgradeSkill(idx);
    if (id) return name + '\'s ' + skillName(id) + ' is now ' + DD.util.roman(skillLevel(api, idx, id)) + '.';
    const g = api.gold(CONSOLATION_GOLD);
    return name + ' has nothing left to upgrade, so the DM pays ' + g + ' gold instead.';
  }

  /** Hero idx learns a new skill (own pool first; with 4 socketed it waits for the forget-or-skip prompt). With
   *  nothing left to learn, an upgrade instead. Returns a phrase. */
  function learnFor(api, idx) {
    const name = api.heroName(idx);
    const pool = DD.Run && typeof DD.Run.learnableSkills === 'function' ? DD.Run.learnableSkills(idx) : [];
    const id = api.giveSkill(idx, pool.length ? api.rng.pick(pool) : undefined);
    if (!id) return upgradeFor(api, idx);
    const rh = api.hero(idx);
    if (rh && rh.skills.some(function (s) { return s.id === id; })) return stop(name + ' learns ' + skillName(id));
    return name + ' can learn ' + skillName(id) + ' (forget a skill for it, or skip it, after this).';
  }

  /** A roll on the Table of Questionable Blessings for hero idx (opts.noCursed). CONSOLATION_GOLD when the table
   *  has nothing for the hero. Returns a phrase. */
  function bless(api, idx, opts) {
    const name = api.heroName(idx);
    const r = api.rollPassive(idx, opts);
    if (r) {
      const done = (r.results || []).map(function (x) { return x && x.text; }).filter(Boolean);
      return done.length ? done.join(' ') : name + ' rolls on the Table of Questionable Blessings next.';
    }
    const g = api.gold(CONSOLATION_GOLD);
    return 'The Table of Questionable Blessings has nothing for ' + name + ' today, so the DM tosses over ' + g + ' gold instead.';
  }

  /** A scar for hero idx: scarId when given (a random one if the hero already has it), else a random one. Returns a
   *  phrase. */
  function scarFor(api, idx, scarId) {
    let id = scarId && idx >= 0 && DD.getScar(scarId) ? api.addScar(idx, scarId) : null;
    if (!id) id = api.addScar(idx);
    return id ? stop(api.heroName(idx) + ' gains ' + scarName(id)) : api.heroName(idx) + ' already has every scar in the book. Impressive.';
  }

  // ======================================================================================================
  // Generic events
  // ======================================================================================================

  DD.registerEvent({
    id: 'ev_dice_goblin', acts: [1, 2, 3], weight: 1, icon: '🎲',
    title: 'The Dice Goblin',
    text: 'A goblin sits cross-legged on a mound of dice, cradling a d20 like a newborn. "One roll," he rasps. "High roll ' +
      'wins. I am definitely not cheating." His T-shirt says I AM CHEATING.',
    choices: [
      {
        label: 'Bet 25 gold.',
        hint: 'Pay 25 gold and roll a d20: 11-19 pays 50 gold, a natural 20 pays 100, a natural 1 also costs every hero 5 HP.',
        requires: canPay(25),
        resolve: function (api) {
          api.gold(-25);
          const d = api.rng.int(1, 20);
          if (d === 20) {
            const g = api.gold(100);
            return 'Natural 20! The goblin\'s dice pile collapses in shame. He pays out ' + g + ' gold, weeping, and asks if ' +
              'you would hold his dice "for luck." You would not.';
          }
          if (d >= 11) {
            const g = api.gold(50);
            return 'You roll a ' + d + '. The goblin rolls a 3, then a 7, then a 2, then gives up and pays you ' + g + ' gold. "Rigged," he mutters.';
          }
          if (d === 1) {
            api.damage(5);
            return 'Natural 1. The die bounces off the goblin, the ceiling and every member of the party, in that order. It ' +
              'stings, and the goblin keeps your 25 gold.';
          }
          return 'You roll a ' + d + '. The goblin rolls a 19 without looking. He keeps your 25 gold and hands you a pamphlet ' +
            'about problem gambling.';
        },
      },
      {
        label: 'Swipe his lucky d20.',
        hint: '50%: a random hero rolls on the Table of Questionable Blessings (no curses). 50%: he screams for his cousins: fight a normal battle.',
        resolve: function (api, run) {
          if (api.rng.chance(0.5)) {
            const h = anyone(api);
            return 'Your hand is quicker than his eye, mostly because he only has the one. The die hums with questionable ' +
              'power when ' + h.name + ' rolls it. ' + bless(api, h.idx, { noCursed: true });
          }
          return { text: 'The goblin bites your hand, screams "THIEF!" and forty cousins pour out of the dice pile. Some of ' +
            'them were dice the whole time.', combat: fight(api, run, 'normal') };
        },
      },
      {
        label: 'Decline. Gambling is for nerds.',
        hint: 'Every hero heals 15% of their max HP.',
        resolve: function (api) {
          api.heal(0.15);
          return 'You walk away and spend the time you saved on a snack and a good stretch. The goblin calls you nerds, which is ' +
            'fair. Everyone feels slightly better about their life choices.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_session_cancelled', acts: [1, 2, 3], weight: 1, icon: '📵',
    title: 'Session Cancelled (Real Life)',
    text: 'Behind the screen, the DM\'s phone buzzes. He reads it, sighs and announces that tonight\'s session is cancelled: ' +
      'his cousin needs help moving a couch. The dungeon freezes mid-drip. Your characters stand there, unsupervised, ' +
      'for an entire in-game week.',
    choices: [
      {
        label: 'Take a very long rest.',
        hint: 'Every hero heals 50% of their max HP.',
        resolve: function (api) {
          api.heal(0.5);
          return 'The party sleeps for six days straight. Nobody can tell where the drool ends and the dungeon begins. ' +
            'Everyone feels much better.';
        },
      },
      {
        label: 'Get a part-time job.',
        hint: 'Gain 50 gold. Every hero loses 10% of their max HP (bar fights).',
        resolve: function (api) {
          const g = api.gold(50);
          api.damage(0.1);
          return 'You pick up shifts at a goblin tavern. The tips are good and the bar fights are better. The party comes back ' +
            g + ' gold richer and slightly concussed.';
        },
      },
      {
        label: 'Homebrew a side quest.',
        hint: ROTATION + ' 30%: it gets out of hand: fight a normal battle.',
        resolve: function (api, run) {
          const base = 'You write your own adventure while the DM is away. It is ambitious, moving and full of plot holes, and ' +
            'somebody grows as a person. ' + levelUp(api);
          if (api.rng.chance(0.3)) {
            return { text: base + ' Unfortunately, it also includes a homebrewed monster, and you homebrewed it to be ' +
              'extremely angry.', combat: fight(api, run, 'normal') };
          }
          return base;
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_snack_run', acts: [1, 2, 3], weight: 1, icon: '🍕',
    title: 'Snack Run',
    text: 'The DM calls a fifteen-minute snack break. In-world, this manifests as a goblin food truck parked in the ' +
      'corridor: GRUBNUK\'S GREASE WAGON. The menu is written in what you hope is ketchup.',
    choices: [
      {
        label: 'Order the Gut-Buster Platter.',
        hint: 'Pay 25 gold. Every hero heals 50% of their max HP.',
        requires: canPay(25),
        resolve: function (api) {
          api.gold(-25);
          api.heal(0.5);
          return 'It arrives on a shield. It is mostly cheese and courage. The party eats in reverent silence and feels unstoppable.';
        },
      },
      {
        label: 'Try the free Mystery Meat sample.',
        hint: '60%: every hero heals 25% of their max HP. 40%: every hero loses 10% of their max HP.',
        resolve: function (api) {
          if (api.rng.chance(0.6)) {
            api.heal(0.25);
            return 'It is delicious. Nobody asks what it was. Grubnuk winks, which helps no one.';
          }
          api.damage(0.1);
          return 'It is delicious for about four seconds. The next hour is spent in a very small room, taking turns.';
        },
      },
      {
        label: 'Dine and dash.',
        hint: 'Gain a random consumable' + POCKETS.replace(' each', '') + '. Fight a normal battle: Grubnuk has a cleaver.',
        resolve: function (api, run) {
          const loot = potions(api, 1);
          return { text: 'You grab a to-go bag and sprint: ' + loot + ' Grubnuk vaults the counter, cleaver first, and his ' +
            'cousins work the late shift.', combat: fight(api, run, 'normal') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_trap_hallway', acts: [1, 2], weight: 1, icon: '🪤',
    title: 'I Check for Traps',
    text: 'A long hallway, suspiciously clean, with a single gold coin glinting in the middle. The floor tiles are a ' +
      'slightly different colour from the rest of the dungeon. A sign says DEFINITELY NO TRAPS. Behind his screen, the ' +
      'DM is smiling, and the DM never smiles.',
    choices: [
      {
        label: 'I check for traps.',
        hint: 'Gain 25 gold.',
        resolve: function (api) {
          const g = api.gold(25);
          return 'You check for traps. You check again. You check the coin, the sign and each other. Forty minutes later you ' +
            'have disarmed eleven traps and collected ' + g + ' gold. The DM looks betrayed.';
        },
      },
      {
        label: 'Sprint for the coin.',
        hint: '50%: gain 70 gold. 50%: the floor gives way: every hero loses 20% of their max HP.',
        resolve: function (api) {
          if (api.rng.chance(0.5)) {
            const g = api.gold(70);
            return 'You grab the coin and keep running. Darts, blades and a swinging log miss you by inches. There was a whole ' +
              'purse under the coin: ' + g + ' gold.';
          }
          api.damage(0.2);
          return 'The floor gives way at the first step. Then the floor under that floor gives way. You land in a pile of ' +
            'extremely pointy straw.';
        },
      },
      {
        label: 'Send the toughest hero first.',
        hint: 'The hero with the most HP loses 25% of their max HP. Gain 35 gold.',
        resolve: function (api) {
          let best = -1;
          aliveIdx(api).forEach(function (i) { if (best < 0 || api.party[i].hp > api.party[best].hp) best = i; });
          if (best >= 0) api.damage(0.25, best);
          const g = api.gold(35);
          return (best >= 0 ? api.heroName(best) : 'Somebody') + ' volunteers, mostly because everyone else took a step back, ' +
            'then sets off every single trap in the hallway, personally, and hands over ' + g + ' gold. Nobody makes eye contact.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_mimic_meeting', acts: [1, 2], weight: 1, icon: '🧰',
    title: 'Mimics Anonymous',
    text: 'A circle of folding chairs. On each chair sits a treasure chest, and every chest has teeth. "Hi, I\'m Kevin," ' +
      'says the smallest one, "and it\'s been three days since I ate an adventurer." The others clap their lids. Then ' +
      'they all turn to look at you, hopefully.',
    choices: [
      {
        label: 'Share your feelings.',
        hint: ROTATION + ' The group hug costs every hero 10% of their max HP.',
        resolve: function (api) {
          api.damage(0.1);
          const lv = levelUp(api);   // last: the HP loss is 10% of the max HP shown when you chose
          return 'The party opens up about childhoods, trust issues and that time the bard flirted with a dragon. Two mimics ' +
            'cry. ' + lv + ' Then everyone hugs it out, and mimics hug with their teeth.';
        },
      },
      {
        label: 'Let Kevin hug someone.',
        hint: 'A random hero loses 30% of their max HP. Gain a rare item.',
        resolve: function (api) {
          const h = anyone(api);
          if (h.idx >= 0) api.damage(0.3, h.idx);
          return 'Kevin waddles over and hugs ' + h.name + '. With his teeth. It is a lot. When he finally lets go, he coughs ' +
            'up ' + partyItem(api, 'rare') + ' as an apology.';
        },
      },
      {
        label: 'Peek inside one. Just a peek.',
        hint: '50%: it is just a chest: gain 40 gold. 50%: it is Kevin\'s sponsor: fight an elite battle.',
        resolve: function (api, run) {
          if (api.rng.chance(0.5)) {
            const g = api.gold(40);
            return 'It is an ordinary chest that wandered into the wrong meeting. It is mortified, and pays you ' + g +
              ' gold to keep quiet.';
          }
          return { text: 'The chest opens. And opens. And keeps opening. Kevin\'s sponsor, Big Doug, has been clean for nine ' +
            'years, and you just ruined it.', combat: fight(api, run, 'elite') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_goblin_mlm', acts: [1], weight: 1, icon: '📈',
    title: 'An Exciting Business Opportunity',
    text: 'A goblin in a blazer two sizes too big blocks the corridor with a clipboard. "Tired of adventuring for scraps? ' +
      'What if I told you that you could be your own BOSS?" He is selling Essential Oils of Mana, and the opportunity ' +
      'to sell Essential Oils of Mana.',
    choices: [
      {
        label: 'Buy the Starter Kit.',
        hint: 'Pay 30 gold. Gain 2 random consumables' + POCKETS + '.',
        requires: canPay(30),
        resolve: function (api) {
          api.gold(-30);
          return 'The kit contains two suspicious bottles, a motivational poster and a list of everyone you have ever met. You ' +
            'throw away the list; ' + potions(api, 2);
        },
      },
      {
        label: 'Join his downline.',
        hint: 'Pay 40 gold. 40%: you are a natural: gain 110 gold. 60%: the pyramid collapses.',
        requires: canPay(40),
        resolve: function (api) {
          api.gold(-40);
          if (api.rng.chance(0.4)) {
            const h = anyone(api);
            const g = api.gold(110);
            return h.name + ' sells eleven bottles to a skeleton, who sells them to the entire graveyard. You cash out at the ' +
              'top with ' + g + ' gold and never speak of it again.';
          }
          return 'Your upline vanishes overnight with everybody\'s money. The goblin is very sorry. He would like to tell you ' +
            'about a new opportunity.';
        },
      },
      {
        label: 'Recruit HIM into YOUR scheme.',
        hint: 'Gain 30 gold.',
        resolve: function (api) {
          const g = api.gold(30);
          return 'You pitch him your own business: Adventuring. Terrible hours, no benefits, frequent stabbing. He buys in for ' +
            g + ' gold and quits immediately. Everyone learns something about sales.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_cursed_clearance', acts: [1, 2, 3], weight: 1, icon: '💀',
    title: 'Cursed Ring Clearance Sale',
    text: 'EVERYTHING MUST GO, screams a banner over a cart of rings, amulets and one haunted sock. The salesman, a ghost ' +
      'named Dale, insists the curses are "mostly cosmetic." He also insists he died of natural causes, which seems ' +
      'unlikely given the cursed ring on every one of his fingers.',
    choices: [
      {
        label: 'Rummage in the bargain bin.',
        hint: 'Pay 15 gold. Gain a cursed item (cursed items go to your bag).',
        requires: canPay(15),
        resolve: function (api) {
          api.gold(-15);
          const before = api.gold();
          const id = api.giveItem({ rarity: 'cursed' });
          if (!id) return 'Dale sells you a ring that crumbles to dust, then refunds you in ' + (api.gold() - before) + ' gold of ghost money. It spends fine.';
          const d = DD.getItem(id);
          if (d && d.rarity !== 'cursed') return 'You pull out ' + d.name + '. Dale squints at it. "Huh. That one isn\'t even cursed. Lucky you."';
          return 'You pull out ' + itemName(id) + '. It is warm, it hums and it is definitely staring at you. Dale throws in ' +
            'the sock for free. You leave the sock.';
        },
      },
      {
        label: 'Buy the "barely haunted" ring.',
        hint: 'Pay 45 gold. Gain a rare item. 25%: it is haunted after all: a random hero gains a random scar.',
        requires: canPay(45),
        resolve: function (api) {
          api.gold(-45);
          let text = 'Dale wraps up ' + partyItem(api, 'rare') + ' in a shroud. "Barely haunted," he repeats, a little too fast.';
          if (api.rng.chance(0.25)) text += ' That night, something whispers in the dark. ' + scarFor(api, anyone(api).idx);
          return text;
        },
      },
      {
        label: 'Help Dale move on.',
        hint: 'A random scarred hero loses their latest scar. If nobody has a scar, gain 25 gold instead.',
        resolve: function (api) {
          const idx = aliveIdx(api).filter(function (i) { return api.party[i].scars.length > 0; });
          const who = idx.length ? api.rng.pick(idx) : -1;
          const gone = who >= 0 ? api.removeScar(who) : null;
          const story = 'You listen to Dale\'s unfinished business, a very long story about a library fine. He thanks you, glows ' +
            'and passes on. ';
          if (gone) return story + 'As Dale fades, he takes ' + api.heroName(who) + '\'s ' + scarName(gone) + ' along as a souvenir.';
          return story + 'Nobody had a scar for him to take, so he leaves a polite note and ' + api.gold(25) + ' gold of ghost money instead.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_wizard_did_it', acts: [1, 2], weight: 1, icon: '🧙',
    title: 'A Wizard Did It',
    text: 'Every inexplicable thing in this dungeon has the same explanation: a wizard did it, and today you meet him. He ' +
      'is very old, very drunk and very proud of the fish floating in the corner. "I can do one for you too," he slurs, ' +
      'waggling his fingers. "Anything, within reason. MY reason."',
    choices: [
      {
        label: 'Make us stronger.',
        hint: 'A random hero upgrades a skill. 30%: it backfires: that hero also gains a random scar.',
        resolve: function (api) {
          const h = anyone(api);
          let text = 'The wizard points at ' + h.name + ' and yells a word that sounds like a sneeze. ' + upgradeFor(api, h.idx);
          if (api.rng.chance(0.3)) text += ' There is a side effect. ' + scarFor(api, h.idx);
          return text;
        },
      },
      {
        label: 'Make us rich.',
        hint: '50%: gain 70 gold. 50%: he turns up to 30 of your gold into butterflies.',
        resolve: function (api) {
          if (api.rng.chance(0.5)) {
            const g = api.gold(70);
            return 'Gold rains from the ceiling, some of it still warm from wherever he stole it. You collect ' + g + ' gold.';
          }
          const lost = -api.gold(-30);
          return lost ? 'Your coin purse bursts into a cloud of butterflies. They are very pretty. They were ' + lost + ' gold.'
            : 'He tries to turn your gold into butterflies, but your purse is empty. He turns a moth into a smaller moth instead.';
        },
      },
      {
        label: 'Make him go away.',
        hint: 'Gain a random consumable' + POCKETS.replace(' each', '') + '.',
        resolve: function (api) {
          return 'He is so offended that he teleports away mid-sentence, leaving his hat behind. Inside it are a rabbit ' +
            'demanding a lawyer and one unlabelled flask: ' + potions(api, 1);
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_fountain_youth', acts: [2, 3], weight: 1, icon: '⛲',
    title: 'Fountain of Questionable Youth',
    text: 'A marble fountain gurgles in a moonlit glade. A sign reads FOUNTAIN OF YOUTH (RESULTS MAY VARY). A frog on the ' +
      'rim claims to be a nine-hundred-year-old king. The water is a worrying shade of sparkly.',
    choices: [
      {
        label: 'Drink deeply.',
        hint: 'Every hero heals to full HP. 40%: it works too well: a random hero gains a random scar.',
        resolve: function (api) {
          api.heal(1);
          let text = 'The water tastes like summer holidays. Every ache, bruise and bad decision melts away.';
          if (api.rng.chance(0.4)) {
            const h = anyone(api);
            text += ' Then ' + h.name + ' goes through puberty again, in about nine seconds. ' + scarFor(api, h.idx);
          }
          return text;
        },
      },
      {
        label: 'Bottle some for later.',
        hint: 'Gain 2 random consumables' + POCKETS + '.',
        resolve: function (api) {
          return 'You fill every empty flask you own. Two of them bubble in a promising way, and one now contains the frog: ' + potions(api, 2);
        },
      },
      {
        label: 'Kiss the frog.',
        hint: 'A random hero kisses it. 30%: he really is a king: gain a legendary item. 70%: he is just a frog: that hero gains a random scar.',
        resolve: function (api) {
          const h = anyone(api);
          if (api.rng.chance(0.3)) {
            return h.name + ' kisses the frog. POOF: a bewildered king, who rewards his rescuer with ' + partyItem(api, 'legendary') +
              ' and then demands to know what year it is.';
          }
          return h.name + ' kisses the frog. Nothing happens, except that ' + h.name + ' has now kissed a frog, in front of ' +
            'everyone. ' + scarFor(api, h.idx);
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_career_fair', acts: [2], weight: 1, icon: '💼',
    title: 'Necromancy Academy Career Fair',
    text: 'Rows of booths fill the academy\'s great hall, and a skeleton in a lanyard waves you over. "Ever considered a ' +
      'career in UNDEATH? Great benefits, no dental required!" Behind him, a banner promises UNPAID INTERNSHIPS: ' +
      'EXPOSURE GUARANTEED.',
    choices: [
      {
        label: 'Take the unpaid internship.',
        hint: ROTATION + ' Every hero loses 15% of their max HP.',
        resolve: function (api) {
          api.damage(0.15);
          const lv = levelUp(api);
          return 'You spend a week fetching coffee, coffins and coffee for the coffins. Your supervisor is a lich who never ' +
            'learns your names. ' + lv + ' Everybody hurts everywhere.';
        },
      },
      {
        label: 'Attend the free seminar.',
        hint: 'A random hero learns a new skill (or upgrades one if there is nothing to learn).',
        resolve: function (api) {
          const h = anyone(api);
          return 'The seminar is called "Synergy: Leveraging Your Corpse." ' + h.name + ' is the only one who stays awake and ' +
            'walks out with a free tote bag and a new technique. ' + learnFor(api, h.idx);
        },
      },
      {
        label: 'Steal the free pens.',
        hint: 'Gain 30 gold. 50%: security catches you: fight a normal battle.',
        resolve: function (api, run) {
          const g = api.gold(30);
          const base = 'You fill your pockets with branded quills, enchanted erasers and a stress ball shaped like a skull. ' +
            'They resell for ' + g + ' gold.';
          if (api.rng.chance(0.5)) {
            return { text: base + ' Unfortunately, academy security is two very fast skeletons, and they want their pens back.',
              combat: fight(api, run, 'normal') };
          }
          return base + ' Nobody notices. Nobody ever notices the pens.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_overdue_book', acts: [2], weight: 1, icon: '📚',
    title: 'Extremely Overdue',
    text: 'Wedged behind a gravestone you find a library book: Necromancy for Dummies, Third Edition. It is six hundred ' +
      'years overdue. The stamp inside reads LATE FEES ACCRUE DAILY. PROPERTY OF LICH-TENSTEIN. Somewhere far away, ' +
      'something undead looks up from its desk.',
    choices: [
      {
        label: 'Read it.',
        hint: 'A random hero learns a new skill (or upgrades one if there is nothing to learn).',
        resolve: function (api) {
          const h = anyone(api);
          return h.name + ' reads it cover to cover. Chapter 9 is mostly doodles, but Chapter 10 is life-changing. ' + learnFor(api, h.idx);
        },
      },
      {
        label: 'Return it and pay the fine.',
        hint: 'Pay 40 gold. ' + ROTATION + ' Every hero heals 20% of their max HP.',
        requires: canPay(40),
        resolve: function (api) {
          api.gold(-40);
          api.heal(0.2);
          const lv = levelUp(api);   // last: the level-up's Blessing roll can't scale this choice's own heal
          return 'You drop it into a return slot shaped like a screaming mouth. A receipt prints: FINE PAID. KARMA RESTORED. ' +
            lv + ' Everyone feels lighter. Mostly in the purse.';
        },
      },
      {
        label: 'Burn it.',
        hint: 'A random hero rolls on the Table of Questionable Blessings (curses possible). Fight an elite battle: the library sends its enforcers.',
        resolve: function (api, run) {
          const h = anyone(api);
          return { text: 'The book screams as it burns, and forbidden knowledge leaks straight into ' + h.name + '\'s brain. ' +
            bless(api, h.idx, { noCursed: false }) + ' Then the overdue notices arrive. In person. With swords.',
            combat: fight(api, run, 'elite') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_owlbear_daycare', acts: [2], weight: 1, icon: '🦉',
    title: 'Little Talons Owlbear Daycare',
    text: 'A hand-painted sign reads LITTLE TALONS OWLBEAR DAYCARE: VOLUNTEERS WANTED. Inside, six owlbear cubs are ' +
      'disassembling a playpen. The caretaker, a druid named Moss, looks at you with the eyes of someone who has not ' +
      'slept since spring.',
    choices: [
      {
        label: 'Volunteer for a shift.',
        hint: 'Every hero loses 20% of their max HP. Gain 50 gold and a random consumable' + POCKETS.replace(' each', '') + '.',
        resolve: function (api) {
          api.damage(0.2);
          const g = api.gold(50);
          return 'You change diapers you did not know owlbears needed and survive nap time, barely. Moss pays you ' + g +
            ' gold plus a jar of her "special" honey, then falls asleep standing up. As for the honey: ' + potions(api, 1);
        },
      },
      {
        label: 'Nap in the ball pit.',
        hint: 'Every hero heals 35% of their max HP. 30%: Mama Owlbear comes home: fight an elite battle.',
        resolve: function (api, run) {
          api.heal(0.35);
          const base = 'The ball pit is incredibly comfortable. The cubs use you as furniture. You wake up refreshed and ' +
            'covered in feathers.';
          if (api.rng.chance(0.3)) {
            return { text: base + ' You also wake up in a very large shadow. Mama is home, and Mama has questions.',
              combat: fight(api, run, 'elite') };
          }
          return base;
        },
      },
      {
        label: 'Teach the cubs to hunt.',
        hint: 'Gain 30 gold. Fight a normal battle.',
        resolve: function (api, run) {
          const g = api.gold(30);
          return { text: 'Field trip! The cubs watch from a safe distance while you demonstrate proper hunting technique on ' +
            'the nearest monsters. Moss pays ' + g + ' gold for the lesson, up front, in case it goes badly.', combat: fight(api, run, 'normal') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_retcon', acts: [2, 3], weight: 1, icon: '⏪',
    title: 'Retcon',
    text: 'The DM clears his throat: "So, uh, remember that thing that happened earlier? It didn\'t. New canon." Reality ' +
      'flickers like a bad hologram, and a goblin you definitely killed waves at you, confused. The DM offers to rewrite ' +
      'one thing, and only one.',
    choices: [
      {
        label: 'Retcon our injuries.',
        hint: 'Every hero heals 60% of their max HP.',
        resolve: function (api) {
          api.heal(0.6);
          return 'The DM declares the last few fights "mostly flesh wounds." Your bruises fade mid-sentence.';
        },
      },
      {
        label: 'Retcon our scars.',
        hint: 'Twice: a random scarred hero loses their latest scar. If nobody has a scar, gain 40 gold instead.',
        resolve: function (api) {
          const gone = [];
          for (let k = 0; k < 2; k++) {
            const idx = aliveIdx(api).filter(function (i) { return api.party[i].scars.length > 0; });
            if (!idx.length) break;
            const who = api.rng.pick(idx);
            const id = api.removeScar(who);
            if (id) gone.push(api.heroName(who) + '\'s ' + scarName(id));
          }
          if (gone.length) return 'Those scars? Never happened. The DM erases ' + list(gone) + ' from the character sheets.';
          const g = api.gold(40);
          return 'Nobody has a scar to retcon. The DM sheepishly hands over ' + g + ' gold instead and asks you not to tell anyone.';
        },
      },
      {
        label: 'Retcon the loot table.',
        hint: 'Gain a rare item. Fight a normal battle: that goblin is back, with friends.',
        resolve: function (api, run) {
          return { text: 'The DM rerolls the loot from three fights ago. It comes out better: ' + partyItem(api, 'rare') +
            '. Unfortunately, retcons are retroactive, and so is the goblin.', combat: fight(api, run, 'normal') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_rules_lawyer', acts: [3], weight: 1, icon: '⚖️',
    title: 'Bracket & Bracket, Rules Lawyers',
    text: 'Somebody has built a mahogany office into the side of a volcano. Behind a desk stacked with rulebooks reclines ' +
      'a devil in a three-piece suit. "I can get you out of anything," he purrs. "Scars, curses, bad rolls: errata is my ' +
      'specialty, and my fees are... reasonable."',
    choices: [
      {
        label: 'File an appeal.',
        hint: 'Pay 45 gold. The most scarred hero loses every scar. Needs a scarred hero.',
        requires: function (run) { return canPay(45)(run) && living(run).some(function (h) { return h.scars && h.scars.length > 0; }); },
        resolve: function (api) {
          let who = -1;
          aliveIdx(api).forEach(function (i) { if (api.party[i].scars.length && (who < 0 || api.party[i].scars.length > api.party[who].scars.length)) who = i; });
          if (who < 0) return 'He finds nothing to appeal and, astonishingly, does not bill you for it.';
          api.gold(-45);
          const gone = [];
          for (let n = api.party[who].scars.length; n > 0; n--) { const id = api.removeScar(who); if (id) gone.push(scarName(id)); }
          return 'He finds a loophole in Appendix F: scars are technically "cosmetic damage." ' + api.heroName(who) +
            ' walks out without ' + list(gone) + '.';
        },
      },
      {
        label: 'Sue the DM.',
        hint: '60%: win 100 gold in damages. 40%: the DM countersues: fight an elite battle.',
        resolve: function (api, run) {
          if (api.rng.chance(0.6)) {
            const g = api.gold(100);
            return 'The jury, four goblins and a confused owl, finds in your favour. The DM pays ' + g + ' gold out of his ' +
              'snack budget. He will remember this.';
          }
          return { text: 'The DM\'s lawyers arrive. It is a lot of lawyers. Several of them are dragons.', combat: fight(api, run, 'elite') };
        },
      },
      {
        label: 'Ask about a loophole.',
        hint: 'Pay 25 gold. A random hero rolls on the Table of Questionable Blessings (no curses).',
        requires: canPay(25),
        resolve: function (api) {
          api.gold(-25);
          const h = anyone(api);
          return 'He bills you for fifteen minutes, then for six more fifteen-minute increments. In return, ' + h.name +
            ' receives a blessing that is technically legal. ' + bless(api, h.idx, { noCursed: true });
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_infernal_dmv', acts: [3], weight: 1, icon: '🎫',
    title: 'The Infernal DMV',
    text: 'A sign reads TAKE A NUMBER. Your number is 6,666,667. The board says NOW SERVING: 12. A demon behind the counter ' +
      'is eating a sandwich very slowly, and nobody in line has moved since the Bronze Age. Some of them are skeletons now.',
    choices: [
      {
        label: 'Wait in line.',
        hint: ROTATION + ' Every hero loses 20% of their max HP.',
        resolve: function (api) {
          api.damage(0.2);
          const lv = levelUp(api);
          return 'You wait. And wait. You age. Somebody grows as a person. ' + lv + ' When your number is finally called, ' +
            'the demon tells you that you are in the wrong line.';
        },
      },
      {
        label: 'Cut the line.',
        hint: 'Gain a rare item. Fight a normal battle: the line is angry.',
        resolve: function (api, run) {
          return { text: 'You march to the counter and slap down a forged form. The demon stamps it without looking and hands ' +
            'over ' + partyItem(api, 'rare') + ' from the lost and found. Behind you, nine hundred years of waiting turns around.',
            combat: fight(api, run, 'normal') };
        },
      },
      {
        label: 'Bribe the clerk.',
        hint: 'Pay 50 gold. A random hero upgrades a skill. Every hero heals 30% of their max HP.',
        requires: canPay(50),
        resolve: function (api) {
          api.gold(-50);
          api.heal(0.3);
          const h = anyone(api);
          return 'The demon pockets the gold and waves you through a door marked EMPLOYEES ONLY. Behind it: a couch, free ' +
            'coffee and a training manual. ' + upgradeFor(api, h.idx);
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_dragon_yard_sale', acts: [3], weight: 1, icon: '🐉',
    title: 'Dragon\'s Yard Sale',
    text: 'A red dragon has spread half her hoard on blankets across the cavern floor. EVERYTHING 1 GOLD, says a sign, in ' +
      'letters that are still smoking. "Downsizing," she sniffs. "The kids moved out, so I\'m moving into a smaller volcano."',
    choices: [
      {
        label: 'Pay the asking price.',
        hint: 'Pay 1 gold. Gain a common item.',
        requires: canPay(1),
        resolve: function (api) {
          api.gold(-1);
          return 'She takes your single coin, bites it, and adds it to a pile she is very clearly keeping. You walk away with ' +
            partyItem(api, 'common') + '. She waves. It is terrifying.';
        },
      },
      {
        label: 'Make an offer on the good stuff.',
        hint: 'Pay 120 gold. Gain a legendary item.',
        requires: canPay(120),
        resolve: function (api) {
          api.gold(-120);
          return 'She raises an eyebrow, which takes a while on a dragon. "You have taste," she rumbles, and slides over ' +
            partyItem(api, 'legendary') + '.';
        },
      },
      {
        label: 'Haggle with a dragon.',
        hint: '40%: she is charmed: gain a legendary item for free. 60%: she is offended: every hero loses 25% of their max HP.',
        resolve: function (api) {
          if (api.rng.chance(0.4)) {
            return 'You offer three copper and a button for the good stuff. She laughs so hard she sets a table on fire. "Take it," ' +
              'she says, tossing you ' + partyItem(api, 'legendary') + '. "I like you. I\'ll eat you last."';
          }
          api.damage(0.25);
          return 'You lowball her. She does not laugh. The cavern gets very warm, very fast.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_dm_notes', acts: [3], weight: 1, icon: '📓',
    title: 'Behind the Screen',
    text: 'The DM has stepped away to refill his soda. His notes lie open behind the screen, next to a family-size bag of ' +
      'Cheetos and a d20 that has clearly been "adjusted." You can see the next stat block. You can see everything.',
    choices: [
      {
        label: 'Read his notes.',
        hint: ROTATION + ' 50%: he catches you: fight an elite battle.',
        resolve: function (api, run) {
          const lv = levelUp(api);
          if (api.rng.chance(0.5)) {
            return { text: 'You learn a lot from the boss stat block before the DM comes back. ' + lv + ' Then he looks at you, ' +
              'looks at his notes and quietly adds an encounter.', combat: fight(api, run, 'elite') };
          }
          return 'You read everything: the boss\'s weak points, three secret doors and a fan-fic he is writing about your party. ' +
            lv + ' You put it all back exactly where it was.';
        },
      },
      {
        label: 'Swap in a fair d20.',
        hint: 'A random hero rolls on the Table of Questionable Blessings (no curses). Every hero loses 10% of their max HP (karma).',
        resolve: function (api) {
          const h = anyone(api);
          const text = h.name + ' swaps the dice. The universe notices the sudden outbreak of fairness and rewards it. ' +
            bless(api, h.idx, { noCursed: true });
          api.damage(0.1);
          return text + ' The universe also notices the cheating, and the whole party stubs a toe.';
        },
      },
      {
        label: 'Eat his Cheetos.',
        hint: 'Every hero heals 50% of their max HP. Everyone is orange now (cosmetic).',
        resolve: function (api) {
          api.heal(0.5);
          return 'They are stale, the dust is eternal and it is the best meal you have had all campaign. The DM comes back to an ' +
            'empty bag and orange fingerprints on his notes. He says nothing. Yet.';
        },
      },
    ],
  });

  // ======================================================================================================
  // Hero events (requires that hero alive in the party; they reward that hero). Pronouns: Ellaria, Sparrow and Kiri
  // are she/her, every other hero he/him (DESIGN §6).
  // ======================================================================================================

  DD.registerEvent({
    id: 'ev_zar_bling_merchant', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '💍', hero: 'zarathor',
    title: 'Glimmerjaw\'s Discount Bling',
    requires: withHero('zarathor'),
    text: 'A kobold wearing eleven gold chains wheels a velvet cart across your path. "Genuine dragon-hoard bling," hisses ' +
      'Glimmerjaw, polishing a ring with his tongue. Zarathor\'s eyes start glowing in a way that is technically a fire ' +
      'hazard. The rest of the party quietly checks their coin purses.',
    choices: [
      {
        label: 'Buy the big chain.',
        hint: 'Pay 50 gold. Zarathor gains a rare item.',
        requires: canPay(50),
        resolve: function (api) {
          const s = star(api, 'zarathor');
          api.gold(-50);
          return standIn(s) + 'Glimmerjaw bites every coin, twice, then hands over ' + heroItem(api, s.idx, 'rare') + '. ' + s.name +
            ' puts it on immediately, and then puts on his sunglasses. Indoors.';
        },
      },
      {
        label: 'Haggle. With fire.',
        hint: '50%: Zarathor gets a rare item for free. 50%: the cart explodes: Zarathor loses 25% of his max HP.',
        resolve: function (api) {
          const s = star(api, 'zarathor');
          if (api.rng.chance(0.5)) {
            return standIn(s) + s.name + ' snaps his fingers and his hair bursts dramatically into flame. Glimmerjaw shrieks, ' +
              'throws ' + heroItem(api, s.idx, 'rare') + ' at him and flees at kobold speed.';
          }
          const lost = s.idx >= 0 ? api.damage(0.25, s.idx) : 0;
          return standIn(s) + s.name + ' snaps his fingers. The cart, which was apparently made of lamp oil and lies, explodes. ' +
            s.name + (lost ? ' loses ' + lost + ' HP and both eyebrows' : ' was already at 1 HP, so he only loses both eyebrows') +
            ', and every piece of bling melts into one very shiny puddle.';
        },
      },
      {
        label: 'Just window-shop.',
        hint: 'Gain 25 gold.',
        resolve: function (api) {
          const s = star(api, 'zarathor');
          const g = api.gold(25);
          return standIn(s) + s.name + ' spends an hour pressed against the display case, gazing at a ring he cannot afford. ' +
            'Glimmerjaw pays him ' + g + ' gold to stop fogging up the glass. ' + s.name + ' counts it twice. It is never enough.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_syl_rap_battle', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🎤', hero: 'syllamin',
    title: 'Rap Battle at Dead Goblin Crossing',
    requires: withHero('syllamin'),
    text: 'A ring of goblins holding tiny lit candles surrounds MC Gristle, a hobgoblin with an undefeated record of ' +
      'forty-one battles (forty were against his brother). He points at Syllamin and drops a beat on an upturned bucket. ' +
      'The crowd goes "OOOOOH." Syllamin cracks his tiny knuckles.',
    choices: [
      {
        label: 'Spit bars.',
        hint: '70%: Syllamin wins: he upgrades a skill and you gain 30 gold. 30%: he chokes: Syllamin gains a random scar.',
        resolve: function (api) {
          const s = star(api, 'syllamin');
          if (api.rng.chance(0.7)) {
            const up = upgradeFor(api, s.idx);
            const g = api.gold(30);
            return standIn(s) + s.name + ' opens with his mother, pivots to his credit score and closes with a verse about his ' +
              'beard that bards will study for centuries. MC Gristle leaves the circle in tears and the crowd pays up: ' + g +
              ' gold. ' + up;
          }
          return standIn(s) + s.name + ' opens strong, then blanks on a rhyme for "orange." The silence lasts eleven seconds. ' +
            'He will never speak of this again. ' + scarFor(api, s.idx);
        },
      },
      {
        label: 'Turn it into a duet.',
        hint: ROTATION + ' The mosh pit costs every hero 10% of their max HP.',
        resolve: function (api) {
          const s = star(api, 'syllamin');
          api.damage(0.1);
          const lv = levelUp(api);
          return standIn(s) + s.name + ' and MC Gristle freestyle a duet about friendship and stabbing. It is honestly a banger, ' +
            'and the crowd moshes so hard the cave shakes. ' + lv + ' Everyone learns something about rhythm, and violence.';
        },
      },
      {
        label: 'Roast the entire crowd.',
        hint: 'Syllamin rolls on the Table of Questionable Blessings (no curses). Fight a normal battle.',
        resolve: function (api, run) {
          const s = star(api, 'syllamin');
          return { text: standIn(s) + s.name + ' roasts every goblin in the circle by name, including three he made up on the ' +
            'spot. One of them cries. The rest pull out knives. Worth it. ' + bless(api, s.idx, { noCursed: true }),
            combat: fight(api, run, 'normal') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_mar_lost_marbles', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🔮', hero: 'marbles',
    title: 'He Has Lost His Marbles',
    requires: withHero('marbles'),
    text: 'Professor Marbles stops mid-sentence, pats his robe and goes pale under the fur. His bag of marbles has a hole ' +
      'in it. A glittering trail leads down a side tunnel, from which comes the unmistakable sound of goblins ' +
      'discovering marbles. "Those were my GOOD marbles," he whispers. "I keep my memories in them."',
    choices: [
      {
        label: 'Follow the trail.',
        hint: 'Professor Marbles learns a new skill (or upgrades one if there is nothing to learn). Fight a normal battle.',
        resolve: function (api, run) {
          const s = star(api, 'marbles');
          return { text: standIn(s) + s.name + ' hops down the tunnel faster than anyone his age has any right to. While ' +
            'gathering the first marbles he remembers a technique he forgot in 1342. ' + learnFor(api, s.idx) +
            ' The goblins holding the rest of them will not be holding them for long.', combat: fight(api, run, 'normal') };
        },
      },
      {
        label: 'Buy him new marbles.',
        hint: 'Pay 30 gold. Professor Marbles upgrades a skill.',
        requires: canPay(30),
        resolve: function (api) {
          const s = star(api, 'marbles');
          api.gold(-30);
          return standIn(s) + 'A passing merchant sells you a fresh bag at a 400% markup. ' + s.name + ' rolls one around in his ' +
            'paw and smiles. "Ah. Yes. I remember THIS one." ' + upgradeFor(api, s.idx);
        },
      },
      {
        label: 'Let him forget about it.',
        hint: 'Professor Marbles heals to full HP and rolls on the Table of Questionable Blessings (no curses).',
        resolve: function (api) {
          const s = star(api, 'marbles');
          if (s.idx >= 0) api.heal(1, s.idx);
          return standIn(s) + 'You point out a butterfly. By the time it lands, ' + s.name + ' has forgotten the marbles, the ' +
            'tunnel and, briefly, his own name. He naps and wakes up refreshed, convinced he was once a famous juggler. ' +
            bless(api, s.idx, { noCursed: true });
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_mrw_mirror', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🪞', hero: 'marwyn',
    title: 'Mirror, Mirror, on the Wall',
    requires: withHero('marwyn'),
    text: 'An ornate mirror hangs in the corridor, whispering compliments to anyone who walks past. Marwyn stops. The mirror ' +
      'clears its throat and asks, "Who is the most magnificent of them all?" Marwyn has been waiting his whole life for ' +
      'this question.',
    choices: [
      {
        label: 'MARWYN IS. OBVIOUSLY.',
        hint: 'Marwyn rolls on the Table of Questionable Blessings (no curses).',
        resolve: function (api) {
          const s = star(api, 'marwyn');
          return standIn(s) + 'The mirror pauses for dramatic effect. "' + s.name + '," it says, with feeling. ' +
            s.name.toUpperCase() + ' FEELS MAGNIFICENT. The universe shifts slightly to make room. ' + bless(api, s.idx, { noCursed: true });
        },
      },
      {
        label: 'Flex at it until it breaks.',
        hint: '60%: it shatters in awe: Marwyn gains a rare item. 40%: seven years of bad luck: Marwyn gains a random scar.',
        resolve: function (api) {
          const s = star(api, 'marwyn');
          if (api.rng.chance(0.6)) {
            return standIn(s) + s.name + ' flexes. The mirror reflects it. ' + s.name + ' flexes HARDER. No glass can contain this ' +
              'much magnificence: it shatters, leaving ' + heroItem(api, s.idx, 'rare') + ' in the frame.';
          }
          return standIn(s) + s.name + ' flexes so hard that the mirror shatters, mostly into ' + s.name + '. Seven years of bad ' +
            'luck: ' + scarFor(api, s.idx) + ' He insists it was worth it.';
        },
      },
      {
        label: 'Bring it along.',
        hint: 'Marwyn levels up. Every other hero loses 20% of their max HP.',
        resolve: function (api) {
          const s = star(api, 'marwyn');
          aliveIdx(api).forEach(function (i) { if (i !== s.idx) api.damage(0.2, i); });
          const lv = levelUp(api, s.idx);
          return standIn(s) + s.name + ' straps the mirror to his back and stops to admire himself at every torch. Self-esteem ' +
            'is a powerful thing: ' + lv + ' Progress slows to a crawl, and the rest of the party gets ambushed by mosquitoes. Twice.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_ell_lost_corgi', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🐕', hero: 'ellaria',
    title: 'A Very Good Boy, Very Lost',
    requires: withHero('ellaria'),
    text: 'A muddy corgi waddles out of the dark wearing a tiny collar: SIR REGINALD WAFFLEBOTTOM III. IF FOUND, RETURN TO ' +
      'THE TOWER OF EVERLASTING NIGHT. Ellaria is already on her knees. The corgi is already on his back. Nobody in this ' +
      'party has ever been this happy.',
    choices: [
      {
        label: 'Return him to his owner.',
        hint: 'Gain 60 gold.',
        resolve: function (api) {
          const s = star(api, 'ellaria');
          const g = api.gold(60);
          return standIn(s) + 'The Tower of Everlasting Night belongs to a lonely and extremely polite lich. He weeps, pays a ' + g +
            '-gold reward and shows everyone forty paintings of the dog.';
        },
      },
      {
        label: 'Adopt him into the pack.',
        hint: 'Ellaria learns a new skill (or upgrades one if there is nothing to learn).',
        resolve: function (api) {
          const s = star(api, 'ellaria');
          return standIn(s) + s.name + ' and Sir Reginald lock eyes, and an ancient druidic bond forms. He teaches her a trick. ' +
            'She teaches him to sit. He does not sit. ' + learnFor(api, s.idx);
        },
      },
      {
        label: 'Let him lead the way.',
        hint: '50%: he digs up a rare item for Ellaria. 50%: he leads you to his "friends": fight a normal battle.',
        resolve: function (api, run) {
          const s = star(api, 'ellaria');
          if (api.rng.chance(0.5)) {
            return standIn(s) + 'Sir Reginald trots to a loose flagstone and digs furiously. Underneath: ' +
              heroItem(api, s.idx, 'rare') + ', and a bone. He keeps the bone.';
          }
          return { text: standIn(s) + 'Sir Reginald trots proudly into a gnoll camp. The gnolls were also looking for him. Now ' +
            'everyone is looking at you.', combat: fight(api, run, 'normal') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_jos_rat_union', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🐀', hero: 'josiah',
    title: 'Local 404: The Plague-Rat Union',
    requires: withHero('josiah'),
    text: 'Forty plague rats in tiny hard hats block the tunnel, waving signs: FAIR CHEESE NOW and DENTAL FOR ALL. Their shop ' +
      'steward, a rat named Brenda, informs Josiah that his last experiment violated eleven safety regulations. "Also," ' +
      'she adds, "you never paid us for the Plague of \'97." Onyx, Josiah\'s raven, eyes the picket line like a buffet.',
    choices: [
      {
        label: 'Negotiate a fair contract.',
        hint: 'Pay 35 gold. Josiah upgrades a skill. Gain 2 random consumables' + POCKETS + '.',
        requires: canPay(35),
        resolve: function (api) {
          const s = star(api, 'josiah');
          api.gold(-35);
          return standIn(s) + s.name + ' agrees to cheese, dental and one personal day per plague. Brenda shakes his beak. ' +
            upgradeFor(api, s.idx) + ' The union throws in two vials from their own stock, labelled in crayon: ' + potions(api, 2);
        },
      },
      {
        label: 'Hire them as lab assistants.',
        hint: 'Josiah rolls on the Table of Questionable Blessings (no curses). Every hero loses 10% of their max HP.',
        resolve: function (api) {
          const s = star(api, 'josiah');
          api.damage(0.1);
          return standIn(s) + 'The rats take to the lab immediately, mostly by eating it, and everybody gets bitten a little. ' +
            s.name + ' learns something terrible and useful. ' + bless(api, s.idx, { noCursed: true });
        },
      },
      {
        label: 'Bust the union.',
        hint: 'Josiah levels up. Fight a normal battle.',
        resolve: function (api, run) {
          const s = star(api, 'josiah');
          return { text: standIn(s) + s.name + ' informs the rats that they are all fired, which counts as management ' +
            'experience. ' + levelUp(api, s.idx) + ' Brenda calls a strike. The strike involves teeth.', combat: fight(api, run, 'normal') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_spa_blood_bank', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🩸', hero: 'sparrow',
    title: 'First National Blood Bank',
    requires: withHero('sparrow'),
    text: 'A tidy marble counter stands in the middle of a crypt, staffed by a vampire in a cardigan. The sign reads FIRST ' +
      'NATIONAL BLOOD BANK: FREE COOKIE WITH EVERY DEPOSIT. Sparrow\'s eyes go wide. "I have an account here," she ' +
      'whispers. "I have SEVERAL accounts here."',
    choices: [
      {
        label: 'Make a deposit.',
        hint: 'Sparrow loses 30% of her max HP. Gain 45 gold.',
        resolve: function (api) {
          const s = star(api, 'sparrow');
          if (s.idx >= 0) api.damage(0.3, s.idx);
          const g = api.gold(45);
          return standIn(s) + s.name + ' rolls up a sleeve and fills six bags without blinking. The teller is impressed, then ' +
            'concerned, then impressed again. ' + g + ' gold and a cookie. She eats the cookie.';
        },
      },
      {
        label: 'Make a withdrawal.',
        hint: 'Pay 30 gold. Every hero heals 50% of their max HP.',
        requires: canPay(30),
        resolve: function (api) {
          const s = star(api, 'sparrow');
          api.gold(-30);
          api.heal(0.5);
          return standIn(s) + 'The teller hooks everyone up to a bag labelled TYPE O-KAY. It tastes like pennies and works like ' +
            'magic. ' + s.name + ' asks for a second bag "for the road" and drinks it in the road.';
        },
      },
      {
        label: 'Rob the bank.',
        hint: 'Sparrow gains a rare item. Fight an elite battle.',
        resolve: function (api, run) {
          const s = star(api, 'sparrow');
          return { text: standIn(s) + s.name + ' vaults the counter with a dagger in her teeth and grabs a safety deposit box: ' +
            heroItem(api, s.idx, 'rare') + '. The vampire sighs, takes off his cardigan and presses the silent alarm. It is ' +
            'not silent.', combat: fight(api, run, 'elite') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_cor_fine_print', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '📜', hero: 'corelos',
    title: 'Your Patron Would Like a Word',
    requires: withHero('corelos'),
    text: 'A small imp in a cheap suit appears with a briefcase. "Corelos, your patron\'s contract is up for renewal! Tiny ' +
      'changes, nothing to worry about." The scroll he produces unrolls for a full minute, and Corelos is already ' +
      'reaching for the quill.',
    choices: [
      {
        label: 'Sign without reading.',
        hint: 'Corelos upgrades a skill and rolls on the Table of Questionable Blessings (curses possible). The fine print: he gains the scar Owes the DM Money.',
        resolve: function (api) {
          const s = star(api, 'corelos');
          return standIn(s) + s.name + ' signs with a flourish. The imp\'s smile gets wider than his face. Power floods in, along ' +
            'with a faint smell of sulfur and a vague sense of obligation. ' + upgradeFor(api, s.idx) + ' ' +
            bless(api, s.idx, { noCursed: false }) + ' Page 340, clause 9: ' + scarFor(api, s.idx, DEBT_SCAR);
        },
      },
      {
        label: 'Read every clause.',
        hint: ROTATION + ' Corelos loses 25% of his max HP.',
        resolve: function (api) {
          const s = star(api, 'corelos');
          if (s.idx >= 0) api.damage(0.25, s.idx);
          const lv = levelUp(api);
          return standIn(s) + s.name + ' reads every word aloud while the party takes notes, and clause 1,207 turns out to be ' +
            'genuinely educational. ' + lv + ' Clauses 1 through 1,206 give ' + s.name + ' paper cuts in places paper should not reach.';
        },
      },
      {
        label: 'Tear it up.',
        hint: 'Corelos learns a new skill (or upgrades one if there is nothing to learn). Fight a normal battle: the imp brought lawyers.',
        resolve: function (api, run) {
          const s = star(api, 'corelos');
          return { text: standIn(s) + s.name + ' rips the contract in half, then in quarters, then sets the quarters on fire. ' +
            'He feels free, and slightly more dangerous. ' + learnFor(api, s.idx) + ' The imp snaps his fingers and his legal ' +
            'team arrives.', combat: fight(api, run, 'normal') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_sla_noisy_kids', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🧒', hero: 'slate',
    title: 'Kids These Days',
    requires: withHero('slate'),
    text: 'A gang of goblin children has discovered Slate. They are climbing him. One is carving its name into his shin; ' +
      'another keeps asking if he is a rock, at volume. Slate\'s runes begin to glow a very specific shade of "last warning."',
    choices: [
      {
        label: 'GET. OFF. MY. LAWN.',
        hint: 'Slate rolls on the Table of Questionable Blessings (no curses). Gain a random consumable' + POCKETS.replace(' each', '') + '.',
        resolve: function (api) {
          const s = star(api, 'slate');
          return standIn(s) + s.name + '\'s runes flare like a lighthouse and his voice shakes dust from the ceiling. The children ' +
            'scatter, shrieking with delight, and drop their snacks: ' + potions(api, 1) + ' He feels better than he has in nine ' +
            'hundred years. ' + bless(api, s.idx, { noCursed: true });
        },
      },
      {
        label: 'Endure it in silence.',
        hint: 'Slate heals to full HP and upgrades a skill.',
        resolve: function (api) {
          const s = star(api, 'slate');
          if (s.idx >= 0) api.heal(1, s.idx);
          return standIn(s) + s.name + ' stands perfectly still for three hours while the children use him as a jungle gym. Nine ' +
            'hundred years of library duty pays off. Eventually they get bored and leave. He says nothing. His runes say ' +
            'plenty. ' + upgradeFor(api, s.idx);
        },
      },
      {
        label: 'Teach them to throw rocks properly.',
        hint: 'Slate learns a new skill (or upgrades one if there is nothing to learn). 50%: one of them has a very large dad: fight a normal battle.',
        resolve: function (api, run) {
          const s = star(api, 'slate');
          const base = standIn(s) + s.name + ' demonstrates proper rock-throwing form: plant, twist, follow through. The children ' +
            'are enthralled. He accidentally enjoys himself. Nobody can ever know. ' + learnFor(api, s.idx);
          if (api.rng.chance(0.5)) {
            return { text: base + ' Then a bugbear in a WORLD\'S BEST DAD apron arrives, holding a rock. A large one.',
              combat: fight(api, run, 'normal') };
          }
          return base;
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_sla_sculptor', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🗿', hero: 'slate',
    title: 'A Sculptor Wants to "Fix" Him',
    requires: withHero('slate'),
    text: 'An art student in a paint-spattered smock circles Slate three times, muttering. "Magnificent bone structure, ' +
      'terrible nose," she decides, already holding a chisel. "Ten minutes, tops." Slate\'s runes flicker in a way that ' +
      'suggests ten minutes is optimistic.',
    choices: [
      {
        label: 'Let her chisel.',
        hint: 'Slate loses 25% of his max HP and upgrades a skill.',
        resolve: function (api) {
          const s = star(api, 'slate');
          if (s.idx >= 0) api.damage(0.25, s.idx);
          const up = upgradeFor(api, s.idx);
          return standIn(s) + s.name + ' sits very still while the student chips away. It takes three hours, a sledgehammer and most of ' +
            'her vocabulary. The new nose is... different. He hates it, and now he hits harder out of spite. ' + up + ' She ' +
            'sells the chips as authentic golem gravel, and you never see a coin of it.';
        },
      },
      {
        label: 'Hmph. No.',
        hint: 'Slate heals to full HP. Gain 20 gold.',
        resolve: function (api) {
          const s = star(api, 'slate');
          if (s.idx >= 0) api.heal(1, s.idx);
          const g = api.gold(20);
          return standIn(s) + s.name + ' takes the chisel, bites it in half and hands it back. The student writes NO in her ' +
            'sketchbook, underlines it twice and leaves ' + g + ' gold "for the inspiration." ' + s.name + ' feels a rare and pure ' +
            'joy, and it does wonders for his cracks.';
        },
      },
      {
        label: 'Pose for a statue instead.',
        hint: 'Pay 25 gold. Slate rolls on the Table of Questionable Blessings (no curses).',
        requires: canPay(25),
        resolve: function (api) {
          const s = star(api, 'slate');
          api.gold(-25);
          return standIn(s) + s.name + ' poses for nine hours without blinking, mostly because he cannot blink. She calls it ' +
            'GRUMPY ROCK, NO. 4. Something about being immortalized agrees with him. ' + bless(api, s.idx, { noCursed: true });
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_buga_toaster_cult', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🍞', hero: 'buga',
    title: 'The Church of the Golden Crust',
    requires: withHero('buga'),
    text: 'Deep in the dungeon, hooded figures kneel before an ancient, rusted toaster. When Mayor Buga walks in, the ' +
      'chanting stops. "The Golden Crust," whispers the high priest. "The prophecy said He would be lightly buttered." ' +
      'Buga has never been more comfortable in his life.',
    choices: [
      {
        label: 'Accept their tithes.',
        hint: 'Gain 60 gold. 50%: a heretic objects: fight a normal battle.',
        resolve: function (api, run) {
          const s = star(api, 'buga');
          const g = api.gold(60);
          const base = standIn(s) + s.name + ' accepts the tithes with the grace of someone who has done this before: ' + g +
            ' gold, mostly in crumbs that turn out to be gold.';
          if (api.rng.chance(0.5)) {
            return { text: base + ' Then a disgruntled bagel at the back yells "FALSE PROPHET!" and the congregation splits ' +
              'along gluten lines.', combat: fight(api, run, 'normal') };
          }
          return base + ' Nobody objects. Nobody ever objects to Buga. That is the problem.';
        },
      },
      {
        label: 'Bless the congregation.',
        hint: 'Every hero heals 30% of their max HP. Mayor Buga rolls on the Table of Questionable Blessings (no curses).',
        resolve: function (api) {
          const s = star(api, 'buga');
          api.heal(0.3);
          return standIn(s) + s.name + ' raises his tiny arms. The congregation weeps, the toaster dings and everyone feels ' +
            'warm and faintly golden. ' + bless(api, s.idx, { noCursed: true });
        },
      },
      {
        label: 'Climb into the sacred toaster.',
        hint: '50%: perfectly toasted: Mayor Buga heals to full HP and gains a rare item. 50%: extra crispy: Mayor Buga loses 30% of his max HP and gains a random scar.',
        resolve: function (api) {
          const s = star(api, 'buga');
          if (api.rng.chance(0.5)) {
            if (s.idx >= 0) api.heal(1, s.idx);
            return standIn(s) + 'DING. ' + s.name + ' emerges perfectly golden, radiant and holding ' + heroItem(api, s.idx, 'rare') +
              ', which the toaster had apparently been saving for him.';
          }
          if (s.idx >= 0) api.damage(0.3, s.idx);
          return standIn(s) + 'DING. ' + s.name + ' emerges extra crispy. The congregation applauds anyway; he smells incredible. ' +
            scarFor(api, s.idx);
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_buga_reelection', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🗳️', hero: 'buga',
    title: 'Re-Elect Mayor Buga!',
    requires: withHero('buga'),
    text: 'A crowd has gathered around a soapbox in the middle of the dungeon. It is election season down here too. Mayor ' +
      'Buga\'s opponent, a stern baguette named Gerald, is promising "honest bread for honest folk." Buga adjusts his sash, ' +
      'butters himself lightly and strides to the podium.',
    choices: [
      {
        label: 'Promise them everything.',
        hint: 'Gain 70 gold. Mayor Buga gains a random scar.',
        resolve: function (api) {
          const s = star(api, 'buga');
          const g = api.gold(70);
          return standIn(s) + s.name + ' promises free bread, lower taxes, higher taxes and a moat around every home. The ' +
            'donations pour in: ' + g + ' gold. Unfortunately, promises have a way of coming due. ' + scarFor(api, s.idx);
        },
      },
      {
        label: 'Kiss babies, shake hands.',
        hint: 'Pay 30 gold. Mayor Buga upgrades a skill. Every hero heals 20% of their max HP.',
        requires: canPay(30),
        resolve: function (api) {
          const s = star(api, 'buga');
          api.gold(-30);
          api.heal(0.2);
          return standIn(s) + s.name + ' kisses eleven babies, three of them goblins and one of them a mimic, and shakes every ' +
            'hand in the dungeon. The whole party gets a pat on the back and a free lollipop. ' + upgradeFor(api, s.idx);
        },
      },
      {
        label: 'Debate Gerald.',
        hint: '60%: a landslide: Mayor Buga gains a rare item. 40%: Gerald\'s supporters riot: fight a normal battle.',
        resolve: function (api, run) {
          const s = star(api, 'buga');
          if (api.rng.chance(0.6)) {
            return standIn(s) + s.name + ' answers every question with "Toast." The crowd chants it back. Gerald goes stale on ' +
              'live crystal ball. The key to the city turns out to be ' + heroItem(api, s.idx, 'rare') + '.';
          }
          return { text: standIn(s) + s.name + '\'s closing statement ("What\'s the worst that could happen?") is answered ' +
            'immediately by an angry mob of sourdough loyalists.', combat: fight(api, run, 'normal') };
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_kir_lost_and_found', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '👻', hero: 'kiri',
    title: 'The Ethereal Lost and Found',
    requires: withHero('kiri'),
    text: 'A ghost in a cardigan drifts out of the wall, dragging a sack of glowing arrows. "Ethereal Lost and Found," he ' +
      'sighs. "Every single one of these came through my ceiling." Then he squints at Kiri and asks whether she is the elf ' +
      'one or the human one.',
    choices: [
      {
        label: 'Pay for the ceiling.',
        hint: 'Pay 30 gold. Kiri upgrades a skill.',
        requires: canPay(30),
        resolve: function (api) {
          const s = star(api, 'kiri');
          api.gold(-30);
          return standIn(s) + s.name + ' pays for the damages without a word. The ghost, touched, re-fletches her arrows with ' +
            'feathers from the other side. ' + upgradeFor(api, s.idx);
        },
      },
      {
        label: 'Ask for everything back.',
        hint: '60%: Kiri gains a rare item. 40%: the rest of the lost and found wants a word: fight a normal battle.',
        resolve: function (api, run) {
          const s = star(api, 'kiri');
          if (api.rng.chance(0.6)) {
            return standIn(s) + 'At the bottom of the sack, under four hundred of her arrows, is ' + heroItem(api, s.idx, 'rare') +
              '. The ghost insists it has been there since before she was born. ' + s.name + ' decides not to think about it.';
          }
          return { text: standIn(s) + s.name + ' reaches for the sack. So does everything else in the lost and found: forty years ' +
            'of lost luggage, three umbrellas and something that used to be somebody\'s pet.', combat: fight(api, run, 'normal') };
        },
      },
      {
        label: '"Both."',
        hint: 'Kiri rolls on the Table of Questionable Blessings (no curses).',
        resolve: function (api) {
          const s = star(api, 'kiri');
          return standIn(s) + s.name + ' says "Both." The ghost thinks about it for a full minute, hands her a lucky charm out of ' +
            'sheer confusion and floats back into the ceiling. ' + bless(api, s.idx, { noCursed: true });
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_bet_family_reunion', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🐐', hero: 'betty',
    title: 'The Betty Family Reunion',
    requires: withHero('betty'),
    text: 'A banner over the cavern reads BETTY FAMILY REUNION. Forty goatfolk turn to stare, and every single one of them is ' +
      'named Betty. "It\'s a family name," Betty explains, for the hundredth time this campaign. Great-Grandma Betty is ' +
      'already headbutting the buffet table.',
    choices: [
      {
        label: 'Enter the headbutting contest.',
        hint: '60%: Betty wins: he gains a rare item. 40%: he loses: Betty loses 30% of his max HP.',
        resolve: function (api) {
          const s = star(api, 'betty');
          if (api.rng.chance(0.6)) {
            return standIn(s) + s.name + ' lowers his horns and charges. Uncle Betty folds. Cousin Betty folds. Great-Grandma Betty ' +
              'falls over laughing and hands him the family heirloom: ' + heroItem(api, s.idx, 'rare') + '. "Ya earned it, kid."';
          }
          if (s.idx >= 0) api.damage(0.3, s.idx);
          return standIn(s) + s.name + ' charges Great-Grandma Betty, who has been doing this for ninety years. ' + s.name +
            ' wakes up face-down in the potato salad, and the whole family pretends not to have seen it.';
        },
      },
      {
        label: 'Raid the buffet.',
        hint: 'Every hero heals 35% of their max HP.',
        resolve: function (api) {
          const s = star(api, 'betty');
          api.heal(0.35);
          return standIn(s) + 'The party eats like it has never seen food. ' + s.name + ' eats the potato salad, the paper plates, ' +
            'the tablecloth and a small decorative fern. Nobody judges him. They are all Bettys here.';
        },
      },
      {
        label: 'Ask Great-Grandma Betty for advice.',
        hint: 'Betty learns a new skill (or upgrades one if there is nothing to learn).',
        resolve: function (api) {
          const s = star(api, 'betty');
          return standIn(s) + 'Great-Grandma Betty looks him up and down. "Hit it until it stops moving, kid," she says, and ' +
            'demonstrates on a stalagmite. ' + s.name + ' takes notes. ' + learnFor(api, s.idx);
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_bas_somebody_ate_dolly', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🐑', hero: 'basanos',
    title: 'Somebody Ate Dolly',
    requires: withHero('basanos'),
    text: 'A farmer in muddy boots blocks the tunnel, waving a WANTED poster. The drawing shows a very large wolf wearing ' +
      'Basanos\'s exact coat. "Somebody ate Dolly," the farmer growls, staring very hard at the party. Basanos looks at his ' +
      'shoes and mumbles that he is sorry about the sheep.',
    choices: [
      {
        label: 'Pay for the sheep.',
        hint: 'Pay 40 gold. Basanos gains a rare item.',
        requires: canPay(40),
        resolve: function (api) {
          const s = star(api, 'basanos');
          api.gold(-40);
          return standIn(s) + s.name + ' pays for Dolly, plus interest, plus a little extra for the emotional damage. The farmer ' +
            'counts it twice and hands over ' + heroItem(api, s.idx, 'rare') + ', "for the next time you get peckish."';
        },
      },
      {
        label: 'Watch the flock tonight.',
        hint: 'Basanos levels up. Fight a normal battle: something else is hungry.',
        resolve: function (api, run) {
          const s = star(api, 'basanos');
          return { text: standIn(s) + s.name + ' spends the night guarding what is left of the flock, which is mostly an exercise ' +
            'in not eating it. ' + levelUp(api, s.idx) + ' Around midnight, something else comes for the sheep.', combat: fight(api, run, 'normal') };
        },
      },
      {
        label: 'Blame a different wolf.',
        hint: '50%: the farmer buys it and pays a 45-gold bounty. 50%: he does not: Basanos loses 25% of his max HP (pitchfork).',
        resolve: function (api) {
          const s = star(api, 'basanos');
          if (api.rng.chance(0.5)) {
            const g = api.gold(45);
            return standIn(s) + s.name + ' describes the "real" culprit in loving detail: grey fur, big teeth, terrible manners. ' +
              'The farmer pays a ' + g + '-gold bounty for the tip and storms off to hunt it. ' + s.name + ' feels awful about it ' +
              'all the way to the next room.';
          }
          if (s.idx >= 0) api.damage(0.25, s.idx);
          return standIn(s) + 'The farmer looks at the poster, then at ' + s.name + ', then at the poster again. Out comes the ' +
            'pitchfork. ' + s.name + ' does not dodge, because he feels he deserves it.';
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_val_forge_god', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '⚒️', hero: 'valdris',
    title: 'The Forge God Would Like a Trim',
    requires: withHero('valdris'),
    text: 'Deep in the rock you find an ancient forge, still warm, beneath an altar to the forge god. The inscription promises ' +
      'a weapon of legend in exchange for "that which the smith holds most dear." Valdris slowly raises a hand to his long, ' +
      'golden, somehow soot-free hair. "No," he says. "Absolutely not."',
    choices: [
      {
        label: 'Offer the hair.',
        hint: 'Valdris gains a legendary item and the scar Bruised Ego.',
        resolve: function (api) {
          const s = star(api, 'valdris');
          const item = heroItem(api, s.idx, 'legendary');
          return standIn(s) + s.name + ' kneels, shuts his eyes and lets the altar take the hair. One golden lock drifts into the ' +
            'forge, which roars with approval and spits out ' + item + '. ' + scarFor(api, s.idx, EGO_SCAR) + ' He insists it ' +
            'will grow back.';
        },
      },
      {
        label: 'Forge all night instead.',
        hint: 'Gain a rare item. Valdris loses 25% of his max HP.',
        resolve: function (api) {
          const s = star(api, 'valdris');
          if (s.idx >= 0) api.damage(0.25, s.idx);
          return standIn(s) + s.name + ' works the ancient forge until dawn, singing hymns over the anvil and singeing everything ' +
            'except his hair. By sunrise he has made ' + partyItem(api, 'rare') + ', and he has burns in places he refuses to discuss.';
        },
      },
      {
        label: 'Pray. Mind the hair.',
        hint: 'Valdris rolls on the Table of Questionable Blessings (no curses).',
        resolve: function (api) {
          const s = star(api, 'valdris');
          return standIn(s) + s.name + ' prays at the altar for an hour, mostly about conditioner. The forge god, moved by such ' +
            'devotion, sends a blessing instead of a barber. ' + bless(api, s.idx, { noCursed: true });
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_hja_prank_king', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🍌', hero: 'hjalmar',
    title: 'The Prank King of the Underdark',
    requires: withHero('hjalmar'),
    text: 'Somebody has rigged this corridor with whoopee cushions, a bucket over the door and a banana peel on every step. A ' +
      'goblin in a jester hat pops out of a barrel: "GOTCHA!" He calls himself Snickerdoodle, Prank King of the Underdark, ' +
      'and he has just challenged Hjalmar to a prank-off. Hjalmar\'s grin gets so wide it is visible from orbit.',
    choices: [
      {
        label: 'Accept the prank-off.',
        hint: '60%: Hjalmar wins: he gains a rare item. 40%: Snickerdoodle wins: every hero loses 15% of their max HP.',
        resolve: function (api) {
          const s = star(api, 'hjalmar');
          if (api.rng.chance(0.6)) {
            return standIn(s) + s.name + ' swaps the bells on Snickerdoodle\'s hat for very small, very angry bees. The goblin ' +
              'abdicates on the spot and hands over his royal prop: ' + heroItem(api, s.idx, 'rare') + '.';
          }
          api.damage(0.15);
          return standIn(s) + s.name + ' sets up the perfect prank, and Snickerdoodle pranks the prank. The party spends the next ' +
            'hour pulling custard pies out of places custard pies should never go.';
        },
      },
      {
        label: 'Steal his prop bag.',
        hint: 'Hjalmar learns a new skill (or upgrades one if there is nothing to learn). Fight a normal battle: the goblin wants it back.',
        resolve: function (api, run) {
          const s = star(api, 'hjalmar');
          return { text: standIn(s) + s.name + ' swipes the prop bag while Snickerdoodle is taking a bow. Inside: a rubber chicken, ' +
            'a joy buzzer and a book of terrible ideas. ' + learnFor(api, s.idx) + ' Snickerdoodle whistles, and his whole ' +
            'troupe comes running.', combat: fight(api, run, 'normal') };
        },
      },
      {
        label: 'Prank the party instead.',
        hint: 'Hjalmar rolls on the Table of Questionable Blessings (no curses). Every other hero loses 10% of their max HP.',
        resolve: function (api) {
          const s = star(api, 'hjalmar');
          aliveIdx(api).forEach(function (i) { if (i !== s.idx) api.damage(0.1, i); });
          return standIn(s) + s.name + ' decides his friends are a softer target: whoopee cushions, a bucket of glitter and a ' +
            'banana peel in a very bad spot. Snickerdoodle weeps with pride, and the universe rewards true artistry. ' +
            bless(api, s.idx, { noCursed: true });
        },
      },
    ],
  });

  DD.registerEvent({
    id: 'ev_peb_best_in_show', acts: [1, 2, 3], weight: HERO_WEIGHT, icon: '🏆', hero: 'pebbles',
    title: 'Best in Show',
    requires: withHero('pebbles'),
    text: 'A velvet rope, three very serious judges and a sign: UNDERDARK KENNEL CLUB, BEST IN SHOW. Pebbles is already sitting ' +
      'perfectly, tail wagging, quietly setting the red carpet on fire. The judges have never seen a dog made of fire. One of ' +
      'them is sweating, and not from nerves.',
    choices: [
      {
        label: 'Enter Best in Show.',
        hint: '60%: Pebbles wins: he gains a rare item. 40%: disqualified for arson: lose up to 30 gold for the damages.',
        resolve: function (api) {
          const s = star(api, 'pebbles');
          if (api.rng.chance(0.6)) {
            return standIn(s) + s.name + ' sits. ' + s.name + ' stays. ' + s.name + ' rolls over and only singes one judge. Best in ' +
              'Show, unanimously, and the prize is ' + heroItem(api, s.idx, 'rare') + '.';
          }
          const lost = -api.gold(-30);
          return standIn(s) + s.name + ' is doing beautifully until a judge says "good boy" and he wags so hard the podium catches ' +
            'fire. Disqualified for arson. ' + (lost ? 'The damages come to ' + lost + ' gold.'
            : 'You cannot pay for the damages, so the judges accept an IOU and a very sad look.');
        },
      },
      {
        label: 'Try the agility course.',
        hint: 'Pebbles learns a new skill (or upgrades one if there is nothing to learn). 40%: the hellhound contestants take it personally: fight a normal battle.',
        resolve: function (api, run) {
          const s = star(api, 'pebbles');
          const base = standIn(s) + s.name + ' flies through the hoops, the tunnel and the seesaw, setting each one on fire on the ' +
            'way out, and learns a lot about himself. ' + learnFor(api, s.idx);
          if (api.rng.chance(0.4)) {
            return { text: base + ' The hellhounds in the next lane lose, badly, and they take it personally.', combat: fight(api, run, 'normal') };
          }
          return base;
        },
      },
      {
        label: 'Pet the good boy.',
        hint: 'Every hero heals 30% of their max HP.',
        resolve: function (api) {
          const s = star(api, 'pebbles');
          api.heal(0.3);
          return standIn(s) + 'Everyone takes a turn telling ' + s.name + ' he is a good boy. He IS a good boy. He is also very ' +
            'warm, and the warmth soaks into every bruise in the party. Nobody wants to stop.';
        },
      },
    ],
  });
})();
