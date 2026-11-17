/* Dungeons and Degenerates — js/data/svammiel_lines.js
 * V3, act IV "Under the Table": every line pool Svammiel's cameos play (plan .tmp/v3/design.md §5.2; the voice of
 * .tmp/v3/design/voice.md §4.3-4.4 / §6 / §7; the goats addendum §15; the Benedick addendum §19.2). DD.Cameo
 * (js/engine/cameo.js) and svammiel.js pick from these keys with the cosmetic RNG, through the party filter
 * (DD.Act.partyLines), and remember per run what was said (run.flags.cameo), so a run's start cameos never repeat a line.
 *   svam_twist                 the user's line, exactly (the twist on the act-3 DM's table)
 *   svam_twist_react_<hero>    one hero's reaction at the twist (a bark on that hero); svam_twist_panel his Twist-panel line
 *   svam_cameo_<lane>          the announcer line (the banner sub) at each mini-boss door
 *   svam_hero_<hero>           the start roast of a hero in the party; svam_back_<hero> that hero's comeback bark
 *   svam_sit_<situation>       a start roast about what just happened (svammiel.js situation(): {hero} / {name} filled)
 *   svam_generic               the start roast once nobody is left to roast
 *   svam_phase, svam_down, svam_env_kill, svam_signature, svam_member_down, svam_long, svam_countered: interjections
 *   svam_phase_goats           the bear's entrance at the goats (goats.js says it); svam_sulk_<lane> his quip when a door falls
 *   svam_bribe                 a Bribe bought his rule off; svam_reason the "Reason: …" of every cheat line
 *   svam_quip_<cheat>          his bubble with a cheat card; svam_counter_<cheat> the demoted DM's whispered counter
 * Rules: bubbles ≤ 70 characters (the DM's counters are log lines, ≤ 160). A line about a hero names that hero in exact
 * case and no other hero (the party filter is case-sensitive); every other line names no hero at all ("Mayor" and
 * "Professor" included), and a hero named through a token gets no pronoun. No count of doors or heroes is ever written:
 * both come from the registry. Pronouns: Svammiel he; the Gardener it; Galbraith he; Skylla she; Kelek, Zarak, Warduke,
 * Zargash he (Zarak is "the dwarf" to Svammiel, and an orc to Zarak); Granny Gristle, Auntie Brine, Cousin Mildred she;
 * the goats and their bear he. These pools are act-4 only: nothing reads them before the twist (Benedick's included).
 */
(function () {
  'use strict';
  const DD = window.DD;

  // ---- per hero: six roasts (Svammiel), three comebacks and one twist reaction (the hero) --------------------------
  // Roasts poke at what each hero is proud of; every hero gets the last word.
  const HEROES = {
    zarathor: {
      roast: ['Zarathor. Sunglasses indoors. In MY dungeon. Bold.', 'Nice chains, Zarathor. I\'m counting them as treasure. Mine.',
        'A warlock, Zarathor? Who\'s your patron? I\'d remember that bling.', 'Your gold tooth is glaring at me, Zarathor. Fifteen-foot cone.',
        'Every coin you throw, Zarathor, lands in MY pocket. House rule.', 'Wild magic, Zarathor? Cute. My magic is tame. It does what I want.'],
      back: ['You can\'t afford this bling. Nobody can. That\'s the point.', 'Graph-paper wings critiquing MY look? Bold.',
        'The sunglasses stay on. Your smug face is too bright.'],
      react: 'Graph-paper wings? Tacky. Very tacky. I respect it.',
    },
    syllamin: {
      roast: ['Syllamin, the Roastmaster General. I\'m the Roastmaster ADMIRAL.', 'I heard your diss track, Syllamin. One star. The star was me.',
        'You fly too, Syllamin? Adorable. Like a moth. I\'m the bonfire.', 'Tiny lute, tiny wings, tiny chance. Love the energy, Syllamin.',
        'Roast ME, Syllamin? I roast for a living. An unliving.', 'Syllamin, your mouth writes cheques your wings can\'t cash.'],
      back: ['Your wings are graph paper. I\'ve seen scarier homework.', 'One star? Still more than your campaign gets.',
        'Svammiel? Sounds like a sneeze in a cape. @#$% your floor.'],
      react: 'Oh great, he\'s got wings too. Now I\'ve got competition.',
    },
    marbles: {
      roast: ['Professor Marbles! Still alive? Death owes me a sandwich.', 'Back in YOUR day, Marbles? I was there. You were already old.',
        'Marbles, do you remember my name? No? Neither will history.', 'A kung fu rabbit, Marbles? I read the fan fiction. You were taller.',
        'Nap time, Marbles? Sleep is a status. I control statuses.', 'Lost your marbles again, Professor Marbles? I have them.'],
      back: ['Svammiel... Svammiel... no, I\'ve forgotten you already. Lovely.', 'Back in my day, demons had the decency to knock.',
        'I taught your teacher\'s teacher to punch. Badly, it seems.'],
      react: 'Another boss? I thought we\'d finished. Did we finish?',
    },
    marwyn: {
      // the "Marvin" gag lives here only, and Marwyn always gets the last word
      roast: ['Marwyn. MARVIN. I\'m the DM. It\'s Marvin now.', 'Marwyn speaks in third person. SVAMMIEL SPEAKS IN CAPITALS.',
        'Magnificent, Marwyn? I see magnificent every morning. In a mirror.', 'That beard is a fire hazard, Marwyn. I\'m adding it to the map.',
        'Marwyn, you\'ve YEETed everything. Try YEETing a rules decision.', 'Your MAGNIFICENCE meter is cute, Marwyn. Mine goes to SVAMMIEL.'],
      back: ['MARWYN DOES NOT ACKNOWLEDGE YOUR CAPITALS.', 'It is MARWYN. With a W. As in WALLOPED. As in YOU, SOON.',
        'Marvin is the only name Marwyn will AVENGE.'],
      react: 'ANOTHER BOSS? MARWYN IS DELIGHTED. MARWYN IS NOT TIRED.',
    },
    ellaria: {
      roast: ['Ellaria, your corgis tracked mud on my floor. Invoiced each one.', 'Corgis, Ellaria? Against a DEMON? ...Fine. They\'re cute.',
        'I banned dogs from this floor, Ellaria. Nobody told the dogs.', 'A corgi bit my ankle in session three. It\'s on my LIST, Ellaria.',
        'A druid, Ellaria. Let me guess: you\'ll solve this with corgis.', 'Lovely flower crown, Ellaria. It\'s wilting. That\'s me doing that.'],
      back: ['Who\'s a bad boy? You are. Corgis, ankles.', 'The corgis don\'t recognise your authority. Neither do I.',
        'Nature finds a way. The way is corgis. The corgis find you.'],
      react: 'Corgis, stay. Nobody bite the demon. Yet.',
    },
    josiah: {
      roast: ['Josiah, is that a medical licence? It\'s laminated cardboard.', 'Onyx keeps stealing my dice, Josiah. Control your bird.',
        'Doctor Josiah. Doctor of WHAT? Don\'t answer. I\'ve seen the potions.', 'A mask, Josiah? I\'m a demon. I\'m immune to everything but ignoring.',
        'Josiah, your bedside manner is a bedside threat.', 'Second opinion, Josiah? You lose. First opinion stands.'],
      back: ['Diagnosis: acute ego. Prescription: plague flask, liberally.', 'Onyx says your dice are loaded. Onyx never lies about dice.',
        'I\'d prescribe humility, but I don\'t stock miracles.'],
      react: 'Onyx, note the time of the plot twist.',
    },
    sparrow: {
      roast: ['Blood magic, Sparrow? Edgy. I invented edgy. It was a Tuesday.', 'Bleeding on my floor again, Sparrow? It\'s a rental. I own it.',
        'Paying in blood, Sparrow? Amateur. I pay in YOUR blood.', 'Little goblin, big knives. Compensating, Sparrow? Look at my wings.',
        'Sparrow, you\'ve got that \'too edgy for this\' look. Stay forever.', 'A goblin blood mage. Is your blood type \'spite\', Sparrow?'],
      back: ['Lot of blood in you, big guy. Shame to waste it.', 'I don\'t do edgy. I do edges. Sharp ones.',
        'A rental? Then I\'m not paying the cleaning fee.'],
      react: 'A new boss? Great. More blood for the bank.',
    },
    corelos: {
      roast: ['Corelos! My favourite customer. Clause 9: you owe me a chair.', 'Corelos signs anything. Sign this. It says you lose. Sign it.',
        'Your runes are glowing, Corelos. That\'s the warranty expiring.', 'Your infernal lawyer works for ME, Corelos. Read his card.',
        'Read the fine print on your soul, Corelos. It\'s in my font.', 'Corelos, I bought your debts. All of them. In bulk.'],
      back: ['Your contract is unenforceable. I signed it in crayon.', 'My lawyer will be in touch. He\'s three runes in a trench coat.',
        'You\'re standing on my rune. That\'s on you.'],
      react: 'I may have signed something with that signature.',
    },
    slate: {
      roast: ['Slate. Retired? Nobody retires from my campaign. You get un-retired.', 'A rock with runes, Slate? I\'ve stepped on scarier dice.',
        'Smile, Slate. ...No? Fine. I\'ll carve one on.', 'Get off your lawn, Slate? It\'s MY lawn. All of it.',
        'Pale blue stone, Slate. Very calming. I\'ll make you a floor tile.', 'Slate looks unamused. Good. I\'m rationing amusement.'],
      back: ['Hmph. No.', 'Your floor. My foot. Soon.', 'Nine hundred years of shushing. You\'re next.'],
      react: 'No. I\'m retired. Again.',
    },
    buga: {
      roast: ['Mayor Buga. A slice of toast in a sash. Running for breakfast?', 'I own the floor, the table AND the toaster, Buga. Think about it.',
        'Your approval rating is crumbs, Mayor Buga.', 'Buga, I\'m investigating your campaign finances. Mostly the jam.',
        'You take credit for everything, Buga. Take credit for THIS loss.', 'Lightly buttered, heavily corrupt. I respect it, Mayor Buga.'],
      back: ['Svammiel! Great to see you! Vote Buga. Or else.', 'I\'m sourdough. Artisanal. Unlike your cheating.',
        'Noted. I\'ll put you on a committee. It will lose your paperwork.'],
      react: 'Another election? I\'m not campaigning in THIS economy.',
    },
    kiri: {
      roast: ['Kiri. Half-elf, half-human, half-there. Three halves. I checked.', 'Kiri, which half is the elf? ...I\'m going to keep asking.',
        'Arrows through walls, Kiri? On MY floor? That\'s a violation.', 'Half-There, Kiri? I\'ll fix that. Soon you\'ll be None-There.',
        'Stealth through walls, Kiri. Rude. Very cool. Stop it.', 'Kiri, your arrows go ethereal. Mine go wherever I say.'],
      back: ['The half that\'s about to shoot you.', 'Walls are a suggestion. So are your rules.',
        'I\'m half-there. You\'re all-there, unfortunately.'],
      react: 'Saw that coming. Half of me did, anyway.',
    },
    betty: {
      roast: ['Betty. A goat. Named Betty. Family name? Your family is WILD.', 'Betty, you ate my session notes. I want them back. Not like that.',
        'Don\'t call me kid, Betty. I\'m eleven thousand years old.', 'I banned goats from this floor, Betty. You ate the ban.',
        'BAAAttle, Betty? I\'ll show you BAAAD.', 'The G.O.A.T., Betty? I\'m the greatest of ALL time. I MADE time.'],
      back: ['Easy, kid. I\'ve eaten bigger dungeon masters.', 'BAAAH. That\'s goat for \'you\'re next on the menu\'.',
        'Great-Grandma Betty headbutted a demon once. Runs in the family.'],
      react: 'Hold on, kids. Bigger snack incoming.',
    },
    basanos: {
      roast: ['Basanos, the monster hunter who IS the monster. Love an irony.', 'Sit, Basanos. Stay. ...He sat. Did everyone see him sit?',
        'Sorry about the sheep, Basanos? The SHEEP are sorry about you.', 'Full moon, Basanos? It is now. I moved the moon.',
        'Basanos, I bought you a chew toy. It\'s a hero. It\'s you.', 'Come hunt me, Basanos. Bring a leash. For you.'],
      back: ['I\'m not a dog. ...I\'m a little bit of a dog. Grr.', 'You moved the moon? That was a mistake.',
        'Sorry in advance. This time I mean it.'],
      react: 'Everyone stay calm. Especially me. ESPECIALLY me.',
    },
    valdris: {
      roast: ['Valdris, that hair. Real? It\'s real. I\'m adding a frizz rule.', 'Pray to your forge god, Valdris. I\'m on his board of directors.',
        'Your hair is a light source, Valdris. No more sneaking for you.', 'Mind the hair, Valdris? I\'m a demon. I\'m ALWAYS on fire.',
        'What conditioner do you use, Valdris? Asking for a nightmare.', 'Forge armour all you like, Valdris. I\'ll retcon the anvil.'],
      back: ['Touch the hair and the forge god gets PERSONAL.', 'Forge-proof conditioner. Demon-proof too. Try me.',
        'I\'ve tempered steel hotter than your temper.'],
      react: 'Nobody touch the hair. Not even you, demon.',
    },
    hjalmar: {
      roast: ['Hjalmar. You put a whoopee cushion on my throne. I\'ll find out how.', 'A monkey with traps on MY floor? I see every banana, Hjalmar.',
        'Is that MY crown, Hjalmar? It is. Give it back. HJALMAR.', 'I put a trap in your trap, Hjalmar. Trap-ception.',
        'Hee hee? Laughing at your own jokes is MY job, Hjalmar.', 'I banned bananas, Hjalmar. The bananas ignored the ban.'],
      back: ['Hee hee hee. Check your pockets.', 'You\'ll never find the banana. It\'s in your crown.',
        'Ooh ooh! A demon with wings! Bet they\'re ticklish!'],
      react: 'Ooh! He\'s got a crown! I want that crown.',
    },
    pebbles: {
      roast: ['Pebbles. Who\'s a good boy? Not you. ...Okay, a bit you.', 'Pebbles torched the tavern rug. Twice. ...Good boy. Tell nobody.',
        'Fire dog, meet fire demon, Pebbles. I just don\'t wag.', 'Pebbles, I\'m trying to be menacing. Stop wagging at me.',
        'Sit, Pebbles. ...Good boy. NO. Bad. Bad boy. Ugh.', 'I made the floor lava, Pebbles, and you\'re ENJOYING it. Stop.'],
      back: ['BORK! New friend! Mean friend! Bite friend!', 'Wag wag wag. You can\'t stop the wag.',
        'Fetch? I\'ll fetch! I\'ll fetch your WINGS!'],
      react: 'NEW FRIEND! BIG FRIEND! WINGY FRIEND!',
    },
    // the 17th hero (the Benedick addendum §19.2, verbatim): the slowest hero, his shell, his two-turn wings, salt
    benedick: {
      roast: ['Benedick! I started this fight last Tuesday. Glad you could make it.', 'A dragon, Benedick? You\'re a snail with a business card.',
        'I salted the floor for you, Benedick. ...Kidding. Or AM I?', 'Two-turn wings, Benedick? Mine are permanent. Read the fine print.',
        'You carry your house everywhere, Benedick. I OWN the floor it\'s on.', 'Benedick, I\'ve seen glaciers with more initiative.'],
      back: ['I\'m not slow. I\'m inevitable. There\'s a difference.', 'You own the floor. I\'ve slimed it. We\'ll call it even.',
        'Keep talking. I\'ll get to you. I always get there.'],
      react: 'Another boss? Splendid. I\'d only just arrived for this one.',
    },
  };

  // ---- the twist (plan §2.1, §5.1): exactly the user's words -------------------------------------------------------
  const TWIST = ['You thought this was over? I, SVAMMIEL, CONTROL ALL.'];
  // his badge line on the Twist panel (V §4.3 step 7; META-UI may read it)
  const TWIST_PANEL = ['Did you think HE ran this game? Adorable. He\'s my player.', 'That was the tutorial. This is my floor. Wipe your feet.',
    'Session\'s not over until I say it\'s over. I never say it.'];

  // ---- the announcer line at each door (the banner sub: Svammiel: "<line>"), by gauntlet lane ---------------------
  const CAMEO = {
    gardener: ['Meet my Gardener. It keeps the grounds tidy. You are not tidy.', 'Weeding day! Guess who the weeds are.',
      'I bought it from a catalogue. Eight legs, eight blades, one hat.', 'My Gardener has a green thumb. Eight of them. All shears.',
      'It prunes anything taller than a daisy. That\'s all of you.', 'I asked for a hedge maze. It grew a hedge maze. With teeth.',
      'It fertilises with adventurers. Organic. Locally sourced.', 'Please don\'t step on the petunias. It gets upset. Lethally.'],
    // the user's League: Kelek leads, Zarak is the dwarf (says everyone; he says orc), Warduke, Skylla, Zargash
    league: ['The Leeeague of Villainy! I\'m not saying all of it. It takes ages.', 'Five evil adventurers. They\'re you, but evil and organised.',
      'My favourite players! They never ask about rules. Just crimes.', 'Meet the anti-party. They read the Player\'s Handbook backwards.',
      'They rehearsed a pose for you. Twice. Please clap.', 'Five villains, one dwarf. Zarak says he\'s an orc. Adorable.',
      'Kelek wants Ringlerun\'s Staff of Power. He\'ll settle for your stuff.', 'Behold my League! Don\'t say the name fast. You\'ll sprain something.'],
    galbraith: ['Bow to Galbraith. He gets upset if you don\'t. Upset liches explode.', 'Galbraith wrote half your spells. He wants royalties. In blood.',
      'Every spell has his name on it. Literally. Read the spell names.', 'Galbraith! A lich, a wizard and a sore loser. My kind of guy.',
      'Nine hundred years a lich and STILL nobody bows properly.', 'Galbraith, show them a spell. Not that one. ...Okay, that one.',
      'My rules guy. If he says a spell works like that, it does.', 'Don\'t call him Galby. I call him Galby. Only I call him Galby.'],
    // the Coven babysat him; Skylla's patron is the Mother of all Witches (the user's link)
    coven: ['Grandma\'s kitchen! Three grandmas, one Eye. Don\'t ask whose turn.', 'The Coven. They babysat me. Don\'t. Say. Anything.',
      'Three hags, one Eye, one tooth. They share. You won\'t.', 'Don\'t eat the gingerbread. The gingerbread is a previous party.',
      'They baked you a pie. You\'re in it. Metaphorically. For now.', 'If they call me Svammy, you did not hear it. Nobody heard it.',
      'Wipe your feet. The Coven just mopped. With a cat.', 'The Coven! Skylla\'s patron sends her regards. And a casserole.'],
    // the goats addendum §15.2, verbatim
    goats: ['Give it up for my house band! Three goats, one mic, zero chill.', 'Live from under the table: HERD! MENTALITY!',
      'They wrote a verse about each of you. Lots of rhymes for \'dead\'.', 'I\'m the host, the judge AND the crowd. Guess who wins tonight?',
      'Tonight\'s topic: you. Every bar is about you. Enjoy.', 'The judges are ready. The judge is me. I scored it this morning.',
      'Welcome to the barn. The goats run it. I take the door money.', 'Whatever you do, don\'t wake what\'s in the hay. Trust me.'],
  };

  // ---- start roasts about what just happened (svammiel.js situation(); each fires at most once a run) --------------
  const SITUATIONS = {
    fallen: ['I framed {name}\'s character sheet. It hangs on my wall. With honour.', 'A moment of silence for {name}. ...Fine. Two moments.'],
    recruit: ['A new player? Mid-act? Sit down, {hero}. You get the wobbly chair.', 'Welcome, {hero}! I\'ve already started a file. It\'s thick.'],
    first: ['Welcome to the floor. Wipe your feet. On yourselves.', 'First fight on my floor! I\'ll go easy on you. I won\'t.',
      'Ah, fresh players. My favourite flavour.'],
    last_mini: ['One toy left. Then me. I\'m dessert. Spicy dessert.', 'Last mini-boss. After this it\'s just you, me and my rules.',
      'All my toys but one? You\'re making me look bad in front of the DM!'],
    debt: ['{hero} owes the DM money. The DM owes ME. So: {hero}, pay up.'],
    downed_last: ['{hero} hit my floor last fight. The floor remembers.', 'Back on your feet, {hero}? The floor misses you already.'],
    mvp: ['{hero}, most kills last fight. Have a trophy. It\'s cursed.', 'Look who\'s on a streak: {hero}. I hate streaks.'],
    flawless: ['Nobody went down last fight? Suspicious. I\'m weighing your dice.'],
    from_tavern: ['You smell like rug. I can always tell. I hate it.', 'Rested on the RUG, did we? Loophole lovers.'],
    from_shop: ['Enjoy the shop? The DM works there now. I pay him in ones.'],
    from_event: ['How was my side quest? I wrote it on a napkin. A cursed napkin.'],
    hurt: ['You look terrible. All of you. Don\'t fix it on my account.', 'Running on fumes? Lovely. Fumes are flammable.'],
    fresh: ['Full health? You rested on the rug, didn\'t you. I hate that rug.'],
    rich: ['Look at all that gold. Mine, technically. You\'re just holding it.'],
    broke: ['No gold? Even the DM has gold. He works in the shop now. Tip him.'],
    scarred: ['Nice scars, {hero}. Very rugged. Very \'I made choices\'.'],
    swapped: ['Swapping places on MY floor? It\'s legal. I checked. I hate checking.'],
    brutal: ['Brutal difficulty? Finally. Players with taste.'],
    casual: ['Casual mode? Adorable. I\'ll cheat with my indoor voice.'],
  };
  // the start roast when nobody is left to roast (no hero named)
  const GENERIC = ['I\'ve read your character sheets. Cereal boxes are better written.', 'A party this size? Adorable. I usually eat parties of six.',
    'You came so far! Up stairs, through dungeons, and now: down.', 'You all think you\'re the main character. I\'m the main character.',
    'Your teamwork is cute. I\'ll be breaking it up shortly.', 'Rule Zero: I\'m always right. Rule One: see Rule Zero.',
    'I don\'t need a reason. I have WINGS.', 'Please remain seated for the duration of your defeat.'];

  // ---- interjections (bubbles; ≤ 3 a fight, 1 a round, 2 rounds apart: DD.Balance.cameo) --------------------------
  // Most of these can fire in every fight of the act (svam_long in nearly all of them: act-4 fights run long), and the
  // run's memory only resets a pool once it is used up: each pool has at least one line per fight of the act (the
  // doors and the finale), so a run doesn't hear one twice.
  const INTERJECTIONS = {
    // a mini-boss changes phase (its own file says it: DD.Cameo.say('svammiel', 'svam_phase'))
    svam_phase: ['Ooh, phase two! I wrote that at 3 a.m. It shows.', 'Phase two! Everybody act surprised.', 'New phase! Same floor. Still mine.',
      'Second form! Every good villain has one. I have three.', 'Phase change! Somebody cue the dramatic music. Louder.',
      'Ah, a twist. I love a twist. I AM a twist.'],
    // a hero's first down this fight: {hero} the hero, {enemy} who did it (the door's name when nobody did). The bubble
    // can land after an instant revive (onDowned hooks run first), so each line is about the fall, not the lying there.
    svam_down: ['Down goes {hero}! I\'d help, but I\'m the bad guy.', '{hero} hit my floor! MY floor. I\'m billing you for the dent.',
      'Floor time for {hero}! The floor says hello.', 'Timber! A big hand for {hero}, everybody. And for gravity.',
      '{hero}, down! Stay down! ...No? Fine. Nobody listens to me.', 'Ooh, {hero} met my floor. My floor wins again.',
      'That one\'s going in the blooper reel, {hero}.', 'Did {hero} trip? On MY floor? I\'ll allow it.'],
    // a hero kills with the scenery: {enemy} the one who met it
    svam_env_kill: ['Using MY terrain on MY monsters? ...Okay, that was cool.', 'Did you just yeet my staff into the scenery? Rude. Effective.',
      '{enemy} met my scenery. The scenery won. I\'m conflicted.', 'My own floor, turned against me! I taught it everything.',
      'That was MY hazard! Who gave you the manual?', 'Physics! On MY floor! I\'m filing a complaint with gravity.'],
    // the first signature move of the fight: {hero}
    svam_signature: ['A signature move? On my floor? Fine. Impress me, {hero}.', '{hero}\'s doing the thing! I\'m not watching. I\'m totally watching.',
      'Big moves, {hero}! I\'m writing that down. In the good notebook.', 'Ooh, the big one! Do the pose, {hero}. Everyone does the pose.',
      'That\'s your big move, {hero}? Cute. Mine is bigger. And on fire.', 'Hype! HYPE! ...Ugh, I got excited. Stop that, {hero}.'],
    // the first squad member (League, Coven, goats) to fall: {enemy}
    svam_member_down: ['One down! I\'m docking their pay. They\'re unpaid. Docking it anyway.', 'Pathetic. That one\'s getting written out of the sequel.',
      '{enemy} is out! I want a refund on that one.', 'Villain down! I\'m sending flowers. Cheap ones.'],
    // round 8 or later: {n}
    svam_long: ['Take your time. Really. I\'m immortal. You\'re... not.', 'Round {n}? I\'ve run shorter campaigns.',
      'Round {n} already? I\'m ordering snacks. Not for you.', 'Still going? I\'ve aged a century. I still look great.',
      'This fight has more rounds than my villain monologue.', 'I\'m starting to root for the furniture.',
      'Round {n}. My wings fell asleep. Both of them.'],
    // a wind-up interrupted (a door's mini-boss, or his own in his fight: then he says it himself, so no name)
    svam_countered: ['Who taught you to read the rules?! WHO?!', 'Interrupted?! That was the BIG move! I had it on a card!',
      'Rude! That wind-up took me ages to write!', 'You can\'t just STOP a big move! ...Apparently you can.',
      'Cancelled? I\'m writing a very angry review.', 'Nobody interrupts the big finish! Nobody! ...Except you.'],
    // the goats' bear arrives (goats.js: DD.Cameo.say('svammiel', 'svam_phase_goats')): the addendum §15.3, verbatim
    svam_phase_goats: ['A BEAR? Who booked a bear? ...Me. I\'m a big fan.', 'FEATURE! I booked him with your money!'],
  };
  // when a door's mini-boss falls (a quip in the log and the HUD caption), by lane
  const SULK = {
    gardener: ['The Gardener! That was a limited edition! The hat was SIGNED!', 'Fine. I\'ll mow my own floor.'],
    league: ['My League! Who\'s going to do my crimes now? ...Me. I\'ll do my crimes.', 'Five of them! I bought them matching sashes!'],
    galbraith: ['Galbraith\'s down? Who\'s going to explain the spells now? Not ME.', 'He\'ll be back. Liches always come back. Usually.'],
    coven: ['My babysitters? ...Honestly? Good. Six centuries of cheek pinching.', 'Granny\'s going to make ME clean that up.'],
    goats: ['My house band! Who\'s going to play my birthday now?', 'Herd Mentality is on hiatus. Creative differences. With you.'],
  };
  // a Bribe (act-4 shops) bought this fight's rule off
  const BRIBE = ['Gold? For ME? ...This changes nothing. It changes one thing.', 'Bribery! My love language. Fine. No rule this time.',
    'I\'ll allow it. I\'m also pocketing it.'];
  // the end of every cheat line: "Reason: <this>." (no repeat within a fight)
  const REASON = ['none', 'no', 'because', 'wings', 'it\'s funnier', 'I said so', 'see Rule Zero', 'the vibes', 'it\'s Tuesday', '[REDACTED]',
    'you wouldn\'t understand', 'I\'m the DM', 'my floor', 'I was bored', 'the dice told me (I told the dice)', 'spite'];

  // ---- cheats: his quips (bubbles) and the demoted DM's whispered counter (log), by cheat id (svammiel.js) -------------
  // Counters name no hero (the party filter would drop them) and quote no knob, so a balance pass can't make them lie.
  const CHEATS = {
    // the start cameo's cheat at each door
    svam_green_thumb: { quips: ['I did a little gardening. For it. Against you.', 'Two vines, on the house. The house is me.'],
      counter: 'DM (whispering): "The extra vines burn, and they can\'t walk. Weed them before they grab anyone."' },
    svam_nepotism: { quips: ['They\'re my favourites. Favourites go first.', 'Nepotism? I call it a loyalty programme.'],
      counter: 'DM (whispering): "The League rolls higher this fight. Deploy as if they all go first."' },
    svam_cameo_one: { quips: ['First big hit? That\'s a 1. I saw it.', 'Your first big hit on Galbraith? Already a 1. I pre-rolled it.'],
      counter: 'DM (whispering): "Only the first big hit on him this fight turns into a 1. Feed it one you can spare, then go big."' },
    svam_cameo_lava: { quips: ['The floor is lava. I\'m the floor boss. I\'m allowed.', 'Lava on the path! Mind your step. Or don\'t. I\'m not your dad.'],
      counter: 'DM (whispering): "That patch on the way to the cauldron is lava for a few rounds, and it never burns a hag. Walk around it, or fly over it."' },
    // the user's pick at the goats (Nov 13): the goats addendum §15.1, verbatim
    svam_cameo_radio: { quips: ['Radio edit! That skill had language in it.', 'Bleep! Your best move is off the air. Family show.'],
      counter: 'DM (whispering): "One move is off the air for this fight. Play the rest of the set."' },
    // his own fight: the round cheats (announced a round ahead). The DM whispers a counter about acting DURING the cheat
    // as its round starts (svammiel.js whisper: 'live'), the rest at the announcement: no counter says "this round" early
    svam_lava: { quips: ['Hot floor! Not for me. I fly. Ha.', 'Remember my lava? It missed you. It\'s back.'],
      counter: 'DM (whispering): "Get off the marked panel before the round ends. Flyers float over lava; everyone else, walk."' },
    svam_bonus: { quips: ['Bonus action! And a bonus bonus action!', 'Monster Manual, page \'mine\': I get two.'],
      counter: 'DM (whispering): "He swings one extra time on each turn this round. Spread out and keep your Block up."' },
    svam_no_healing: { quips: ['Healing? On MY floor? Halved.', 'Half a heal. Whole attitude.'],
      counter: 'DM (whispering): "Heals get halved for one round. Heal before it, or after. A downed friend still gets up."' },
    svam_ban: { quips: ['That skill? Banned. Too good. Nerfed. Live.', 'I\'m putting that skill in time-out.',
      // the goats addendum §15.1: the finale's callback to the Radio Edit
      'Another bleep! You loved the radio edit, so I made a remix.'],
    counter: 'DM (whispering): "One skill, one turn. Use the others. A Ruling gets it back."' },
    svam_tilt: { quips: ['The floor tilts. Because I said so. Lean into it.', 'Everybody lean! No? The floor will.'],
      counter: 'DM (whispering): "Put something solid on your downhill side. Flyers and the immovable stay put."' },
    svam_rule_zero: { quips: ['Rule zero, written just now: I\'m handsome.', 'New rule. Look at me. That\'s it. That\'s the rule.'],
      counter: 'DM (whispering): "That one does nothing. Do not waste a Ruling on his ego."' },
    svam_panel_swap: { quips: ['Panels! Swap! Everything on them too.', 'Rearranging the furniture. You are the furniture.'],
      counter: 'DM (whispering): "Step off the marked panels, or step on for a free lift. Flyers stay where they hover."' },
    svam_moving_costs: { quips: ['Walking costs extra now. Read the fine print.', 'Floor tax! Every step, every hero.'],
      counter: 'DM (whispering): "Fight from where you stand this round. Skills that move you still cost what they cost."' },
    svam_swap: { quips: ['You two. Swap. No reason. Chaos is my love language.', 'New seating chart! You sit there now. Why? Wings.'],
      counter: 'DM (whispering): "Step off the first chair, or put your sturdiest friend on it. The swap move does that in one step."' },
    svam_wander: { quips: ['I invited some floor staff.', 'Random encounter! Random like a loaded die.'],
      counter: 'DM (whispering): "His floor staff clock in for a round before they act. Area damage, or a Ruling before they arrive."' },
    svam_no_signatures: { quips: ['Signature moves? Banned. Balance.', 'No big moves on my floor. Small moves only.'],
      counter: 'DM (whispering): "Signatures get banned for one round. Fire yours before it, or bank the Hype for after."' },
    svam_hype_tax: { quips: ['Your Hype? Confiscated. Evidence.', 'Your excitement is mine now. Mmm. Tangy.'],
      counter: 'DM (whispering): "Spend your Hype before he takes it. Kills earn it back."' },
    // snap cheats (one a round while he holds a Fudge token)
    svam_reroll: { quips: ['Ooh, a stun? Reroll.', 'I rolled again. I liked the second one better.'],
      counter: 'DM (whispering): "He shrugs off one stun, sleep, freeze or root a round. Bait it with something cheap, then do it for real."' },
    svam_nat1: { quips: ['That roll? It was a 1. I saw it. Nobody else did.', 'Natural 1! Trust me. I\'m a professional.'],
      counter: 'DM (whispering): "One big hit a round turns into a 1. Poke first, then swing."' },
    // phase cheats
    svam_nat20: { quips: ['Natural 20! Take my word for it. My word is law.', 'Twenty! Again! The odds? One. The odds are one.'],
      counter: 'DM (whispering): "He goes first. Put the sturdy one in front and keep the squishy ones off the edge."' },
    svam_go_twice: { quips: ['Initiative? I take two. I, SVAMMIEL, CONTROL ALL.', 'Two turns. One of me. Twice the charm.'],
      counter: 'DM (whispering): "Two turns a round now. A stun costs him one of them. Save it for a wind-up."' },
    svam_scheduling: { quips: ['You can\'t skip my phases. I wrote them.', 'Can\'t kill me yet. Scheduling conflict.'],
      counter: 'DM (whispering): "Each phase holds until the next round. Burst after the flip, not across it."' },
    svam_no_more_floor: { quips: ['FINE. NO MORE FLOOR.', 'I own the floor. I can remove the floor.'],
      counter: 'DM (whispering): "Read the marks and fight toward the middle. A Ruling saves one round\'s floor."' },
    svam_retcon: { quips: ['I had more HP than that. I wrote it in pencil.', 'Continuity error! Fixed. You never hit me.'],
      counter: 'DM (whispering): "Every Master Die you break leaves him less to rub out."' },
    svam_real_dice: { quips: ['Fine. My REAL dice. Don\'t touch them.', 'These dice are honest. Honestly mine.'],
      counter: 'DM (whispering): "Shooters on the dice, fighters on him. Break every one and I can finally call it."' },
  };

  // ---- registration ---------------------------------------------------------------------------------------------------
  const R = DD.registerNarration;
  R('svam_twist', TWIST);
  R('svam_twist_panel', TWIST_PANEL);
  Object.keys(HEROES).forEach(function (id) {
    R('svam_hero_' + id, HEROES[id].roast);
    R('svam_back_' + id, HEROES[id].back);
    R('svam_twist_react_' + id, [HEROES[id].react]);
  });
  Object.keys(CAMEO).forEach(function (lane) { R('svam_cameo_' + lane, CAMEO[lane]); });
  Object.keys(SITUATIONS).forEach(function (k) { R('svam_sit_' + k, SITUATIONS[k]); });
  R('svam_generic', GENERIC);
  Object.keys(INTERJECTIONS).forEach(function (k) { R(k, INTERJECTIONS[k]); });
  Object.keys(SULK).forEach(function (lane) { R('svam_sulk_' + lane, SULK[lane]); });
  R('svam_bribe', BRIBE);
  R('svam_reason', REASON);
  Object.keys(CHEATS).forEach(function (id) {
    R('svam_quip_' + id, CHEATS[id].quips);
    R('svam_counter_' + id, [CHEATS[id].counter]);
  });

  /**
   * Read-only catalogue for the suites (tests/content/svammiel_lines.js) and other owners: which keys exist and how DD.Cameo
   * plays them. bubble: the keys shown as speech bubbles (≤ 70); log: the DM's counters (≤ 160). trigger: the cameo
   * trigger that fills each pool's tokens (DD.Cameo.TOKENS), 'none' for pools picked with no vars.
   */
  function keysOf(prefix, obj) { return Object.keys(obj).map(function (k) { return prefix + k; }); }
  const KEYS = {
    twist: ['svam_twist'], panel: ['svam_twist_panel'],
    roast: keysOf('svam_hero_', HEROES), back: keysOf('svam_back_', HEROES), react: keysOf('svam_twist_react_', HEROES),
    cameo: keysOf('svam_cameo_', CAMEO), situation: keysOf('svam_sit_', SITUATIONS), generic: ['svam_generic'],
    interjection: Object.keys(INTERJECTIONS), sulk: keysOf('svam_sulk_', SULK), bribe: ['svam_bribe'], reason: ['svam_reason'],
    quip: keysOf('svam_quip_', CHEATS), counter: keysOf('svam_counter_', CHEATS),
  };
  const TRIGGER = {};
  KEYS.cameo.concat(KEYS.roast, KEYS.situation, KEYS.generic, KEYS.bribe).forEach(function (k) { TRIGGER[k] = 'start'; });
  KEYS.back.forEach(function (k) { TRIGGER[k] = 'comeback'; });
  KEYS.twist.concat(KEYS.sulk).forEach(function (k) { TRIGGER[k] = 'victory'; });
  KEYS.react.concat(KEYS.panel, KEYS.reason, KEYS.quip, KEYS.counter, ['svam_phase', 'svam_phase_goats']).forEach(function (k) { TRIGGER[k] = 'none'; });
  TRIGGER.svam_down = 'heroDowned';
  TRIGGER.svam_env_kill = 'kill';
  TRIGGER.svam_member_down = 'kill';
  TRIGGER.svam_signature = 'signature';
  TRIGGER.svam_long = 'round';
  TRIGGER.svam_countered = 'windupCancel';
  DD.SvammielLines = {
    HEROES: Object.keys(HEROES), LANES: Object.keys(CAMEO), SITUATIONS: Object.keys(SITUATIONS), CHEATS: Object.keys(CHEATS),
    KEYS: KEYS, TRIGGER: TRIGGER,
    /** Every key this file registers. */
    all: function () { return Object.keys(TRIGGER); },
  };
})();
