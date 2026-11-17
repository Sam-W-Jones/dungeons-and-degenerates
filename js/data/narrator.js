/* Dungeons and Degenerates — js/data/narrator.js
 * The DM's voice (ARCHITECTURE §3.10, DESIGN §2 / §11): narration lines for every engine / run / UI key (plus the v2
 * engine key `initiative`, `objective_failed` for a lost objective while heroes stand, `opportunity` for an attack
 * of opportunity, which the engine may narrate, and `swap` for a swap move) and the loading-screen tips. The DM is snarky, sleep-deprived, secretly proud of the
 * party, fudges dice, eats Cheetos and threatens "rocks fall". v2: initiative order, one turn per unit, enemies that act
 * without warning, boss wind-ups, attacks of opportunity, no Guard, slow shared leveling. Tokens are used only where
 * every caller fills them (DD.Narrator.TOKENS): DD.narrate leaves an unfilled token in the text, so keys with any
 * token-less caller use none. Lines that name a hero never use a pronoun for them (the caller only passes a name).
 * Tips are mechanically true in v2 (each one was checked against the engine; tests/content/narrative.js re-checks them).
 * V3 (act IV "Under the Table", plan .tmp/v3/design.md §4.9 / §5.5 / §5.7): the act-4 keys (act_intro_4, the twist's
 * act_clear_twist / twist_loot, the four-act ending's campaign_won / victory_final, the gated tips_act4 and
 * run_start_seen, Svammiel's svam_defeat / svam_phase2 / svam_phase3) and the `key@a4` variants (VARIANTS) that replace
 * a base pool while act 4 is played: the DM narrates act IV demoted, whispering from under his chair. Variants use
 * their base key's tokens. The six foreshadowing lines (V §3.3) sit in the classic pools: ordinary DM quirks on a first
 * run. Nothing a player sees before the twist names Svammiel or a fourth act (tips_act4 / run_start_seen are gated by
 * their readers on DD.Meta.data.seen.bosses.svammiel). Svammiel's own cameo pools live in js/data/svammiel_lines.js.
 */
(function () {
  'use strict';
  const DD = window.DD;

  /** Tokens each key's callers fill (the intersection over every call site). */
  const TOKENS = {
    combat_start: [], elite_start: [], boss_start: [], victory: [], defeat: [], objective_failed: [],
    kill: ['hero', 'enemy'], env_kill: ['hero', 'enemy'], overkill: ['hero', 'enemy', 'n'], multi_kill: ['hero', 'n'],
    hero_downed: ['hero', 'enemy'], hero_downed_self: ['hero'], hero_downed_friendly: ['hero', 'enemy'], hero_revived: ['hero'], hero_death: [], level_up: [], signature: ['hero'],
    round_start: ['n'], enemy_turn: [], initiative: ['hero'], opportunity: [], swap: ['hero', 'ally'],
    shop_greet: [], shop_buy: [], shop_broke: [], shop_leave: [], tavern_greet: [], rest: [], recruit: ['hero', 'name'],
    map_enter: [], act_intro_1: [], act_intro_2: [], act_intro_3: [], act_clear: [], treasure: [], tips: [],
    gameover_title: [], victory_title: [], run_start: [], idle_dm: [],
    // V3: act IV (ARCHITECTURE §3.10). The map's act banner; the twist panel's DM line (run.js) and the DM's loot text;
    // the four-act final victory (campaign_won, then Svammiel's last word from far below: victory_final); the loading
    // tips and run-start lines that join only after the twist was seen; Svammiel's fight (svammiel.js narrates them)
    act_intro_4: [], act_clear_twist: [], twist_loot: [], victory_final: [], campaign_won: [], tips_act4: [],
    run_start_seen: [], svam_defeat: [], svam_phase2: [], svam_phase3: [],
  };
  /** The V3 keys above (the act-4 pools; the narrative suite checks them apart from the classic keys). */
  const V3_KEYS = ['act_intro_4', 'act_clear_twist', 'twist_loot', 'victory_final', 'campaign_won', 'tips_act4', 'run_start_seen',
    'svam_defeat', 'svam_phase2', 'svam_phase3'];

  const LINES = {
    // ---- combat (DD.Act.narrate → combat log + the HUD's DM caption) ----------------------------------------
    combat_start: [
      'Places, everyone. Deploy in the green, then the d20 decides who gets to panic first.',
      'The DM rubs his hands together. "Okay. Fair fight. Totally fair."',
      'Monsters! In a dungeon! Who could possibly have predicted this.',
      'The DM puts on his monster voice. It is his normal voice, but louder.',
      'Combat! The DM shuffles the minis around for dramatic effect. One of them falls over.',
      'No warnings tonight. The monsters will simply do things, the way monsters do.',
      'The DM crunches a Cheeto ominously. Things are about to happen.',
      'The DM consults a table labelled "Encounters (Mean)" and smiles.',
      'Everyone gets one turn per round, monsters included. The dice pick the order. The DM picks the mood.',
      'Somewhere, a bard has already started your eulogy. Make him rewrite it.',
    ],
    elite_start: [
      'The DM pulls out a bigger, scarier mini. It is a painted thimble, but the intent is clear.',
      'This one has a name, a backstory and a DM who will protect it with his life.',
      'An elite! The loot is rare. So is surviving it.',
      'The DM cracks his knuckles, then his neck, then a fresh soda. Uh oh.',
      'Elite fight. The DM has been saving this one since session two.',
      'Something large is breathing heavily. It is not the DM. Probably.',
      'The DM quietly moves his snacks out of the splash zone.',
      'Guaranteed rare loot, says the rulebook. Guaranteed pain, says the DM.',
    ],
    boss_start: [
      'BOSS FIGHT. The DM stands up for this one. His knees crack louder than the thunder.',
      'The DM whips a cloth off a mini he clearly spent forty hours painting. Nobody is allowed to touch it.',
      'The DM unfolds a second, taller screen. He means business.',
      'A boss appears. Its stat block is laminated. Nobody laminates a stat block they expect to lose.',
      'The DM rolls his biggest dice. They are novelty dice. They are still scary.',
      'Phases, wind-ups, puzzles: the DM has waited all week for you to ruin his plan.',
      'The DM whispers "finally," and nobody likes the way he said it.',
      'Everything this act has been building to. No pressure. Rocks could fall at any moment.',
      'When this boss starts winding up, the floor turns red and an hourglass appears. The DM is not bluffing.',
      // V3 foreshadowing (V §3.3): an ordinary DM quirk on a first run, a joke on every run after the twist
      'The DM glances at the floor before the boss fight. Just once. Just to check.',
    ],
    victory: [
      'Victory! The DM sighs and opens the loot table he was hoping not to use.',
      'The last enemy falls. The DM writes "they cheated" in his notes.',
      'You win! The DM insists this was the plan all along.',
      'The dust settles. The DM rolls to see who levels up and glares at the die.',
      'Another encounter survived. The DM takes a long, sad sip of soda.',
      'Victory, with only a little property damage. Okay, a lot of property damage.',
      'The monsters are defeated. Their families will be notified by goblin post.',
      'Nailed it. The DM says "good job" in a voice that means "next time."',
      'The DM removes the defeated minis one by one, slowly, like a funeral.',
      'The DM checks under the table before he hands over the loot. Habit, he says.',
    ],
    defeat: [
      'The DM closes his notebook gently. "So. Who brought spare character sheets?"',
      'Total party kill. The DM is trying very hard not to look pleased.',
      'Rocks did not even need to fall. You managed it all by yourselves.',
      'And that is how the campaign ended: bravely, stupidly and all at once.',
      'The DM offers a moment of silence, then immediately starts planning the next campaign.',
      'Your adventure ends here. The bards will sing of it, mostly as a warning.',
      'Everybody is down. The DM checks twice. Yep. Everybody.',
      'The dice have spoken, and they said some really hurtful things.',
    ],
    // a lost protect objective while heroes still stand (the run goes on): requested from combat.js, see notes
    objective_failed: [
      'Objective failed. Everyone is still standing, which is more than can be said for the thing you were guarding.',
      'The DM marks the objective as lost and draws a sad little face next to it.',
      'Nobody died. The objective did. The DM calls it a teachable moment.',
      'You beat up plenty of monsters and protected absolutely nothing. Mixed reviews.',
      'The heroes live. The thing they were meant to protect has been written out of the campaign.',
      'The DM is very sorry for your loss. He is not sorry at all. He is drafting an invoice.',
      'Well, you protected yourselves beautifully. Just not the one thing you were asked to.',
      'Mission failed, party intact. The bards will call it a draw. The DM will not.',
    ],
    kill: [
      '{hero} drops {enemy}. The DM crosses a name off his list, sadly.',
      '{enemy} is out. {hero} takes a small, smug bow.',
      '{hero} deletes {enemy} from the campaign.',
      'Down goes {enemy}! {hero} would like that on the highlight reel.',
      '{enemy} had a family. {hero} did not ask about it.',
      'The DM tears up the stat block for {enemy}. {hero} did that.',
      '{hero} sends {enemy} to the big dungeon in the sky.',
      '{enemy} is defeated. {hero} checks the body for loot out of pure habit.',
      '{hero} adds {enemy} to the tally. Loudly.',
    ],
    env_kill: [
      '{hero} lets the scenery handle {enemy}. The environment remains undefeated.',
      'Environmental kill! {enemy} meets the terrain, courtesy of {hero}.',
      '{hero} uses the battlefield. {enemy} becomes part of it.',
      'The DM put that hazard there as decoration. {hero} disagreed, and so does {enemy}, briefly.',
      '{enemy} is yeeted into the set dressing. {hero} calls it physics.',
      'Style points! {hero} gets {enemy} killed by the furniture.',
      '{hero} and the dungeon team up on {enemy}. Beautiful teamwork.',
      '{enemy} forgot to check for hazards. {hero} did not.',
    ],
    overkill: [
      '{hero} hits {enemy} {n} points harder than necessary. Message received.',
      'Overkill! {hero} wastes {n} perfectly good damage on {enemy}.',
      '{enemy} needed a gentle nudge. {hero} sent {n} extra damage, gift-wrapped.',
      'The DM needs a second notepad for {hero}\'s overkill on {enemy}: {n}.',
      '{hero} turns {enemy} into a fine mist, with {n} damage to spare.',
      'That was {n} more damage than {enemy} had left. {hero} does not do half measures.',
      '{enemy} was already defeated. {hero} keeps going for {n} more, just to be sure.',
      'Rest in pieces, {enemy}. {hero} overkilled by {n}.',
    ],
    multi_kill: [
      '{hero} takes out {n} at once! The DM drops a Cheeto.',
      'Multi-kill! {n} enemies, one {hero}.',
      '{hero} wipes {n} monsters off the map in one go. The DM needs a minute.',
      '{n} for the price of one! {hero} is running a sale.',
      'The DM erases {n} minis\' worth of planning. Thanks, {hero}.',
      '{hero} scores {n} kills with one move. Somebody start the slow clap.',
      '{n} down! {hero} will need a bigger trophy shelf.',
      'Combo! {hero} sends {n} monsters home early.',
    ],
    // {enemy} is 'gravity' when nobody gets the credit (lava, burn ticks…), so it never starts a sentence here
    hero_downed: [
      '{hero} is down, and {enemy} is far too pleased about it.',
      '{hero} hits the floor. The DM makes a note: {enemy} will be hearing about this.',
      'Down goes {hero}, courtesy of {enemy}. The DM writes that one down.',
      '{hero} takes an unscheduled nap, sponsored by {enemy}. An adjacent friend can Help Up for 2 AP.',
      '{hero} goes down to {enemy}. The DM is pretending not to celebrate.',
      '{hero} is down! Get {hero} up before the fight is won, or there will be a Scar.',
      '{hero} has fallen and can\'t get up. Do not expect any help from {enemy}.',
      'Everyone gasps as {hero} goes down. Over in the corner, {enemy} does a little dance.',
    ],
    // [playtest text-tone-5] the credit for the down is the downed hero (a self-own: a barrel shot point blank)
    hero_downed_self: [
      'Down goes {hero}, by {hero}\'s own hand. The DM pencils in "self-own" and underlines it twice.',
      '{hero} is down. The culprit has been identified, and it is {hero}.',
      '{hero} hits the floor. No monster was involved. The monsters are applauding anyway.',
      'Friendly fire, minus the friend: {hero} is down. The DM calls it "commitment to the bit."',
      '{hero} takes a nap of {hero}\'s own making. An adjacent ally can Help Up for 2 AP.',
      'The DM did not even have to roll. {hero} is down, entirely self-inflicted.',
      '{hero} goes down. The enemies would like it on record that they did nothing.',
      'Gravity, physics and {hero}\'s own choices team up. {hero} is down.',
    ],
    // [playtest text-tone-5] the credit is another hero-side unit ({enemy} is that ally's name): friendly fire
    hero_downed_friendly: [
      '{hero} goes down to friendly fire from {enemy}. The DM writes that one down twice.',
      '{enemy} drops {hero}. Same team, allegedly. The monsters are taking notes.',
      'Friendly fire! {hero} is down, and {enemy} would like to speak to a lawyer.',
      '{hero} hits the floor, courtesy of {enemy}. Team-building exercises have been scheduled.',
      'The monsters didn\'t even have to try. {enemy} took care of {hero}.',
      '{hero} is down. Ask {enemy} why. Actually, don\'t: there will be a speech.',
      'Down goes {hero}! The assist goes to {enemy}, on the wrong team\'s scoresheet.',
      '{enemy} meant well. {hero} is down anyway. Someone adjacent can Help Up for 2 AP.',
    ],
    hero_revived: [
      '{hero} is back up, a little dizzy and very annoyed.',
      '{hero} rises! The DM sighs and un-crumples a character sheet.',
      'Back from the floor: {hero}. Not even a scar. Yet.',
      '{hero} gets up, dusts off and pretends that never happened.',
      'A helping hand, and {hero} is back in the fight.',
      '{hero} returns! The monsters are visibly disappointed.',
      'The DM watches {hero} stand back up and quietly erases a plot point.',
      '{hero} lives! Somebody tell the bards to stop writing that song.',
    ],
    hero_death: [
      'Written out of the campaign. The DM slides a character sheet into the drawer of the fallen.',
      'Three downs was one too many. The DM lights a candle on the snack table.',
      'A hero has died. The party will raise a glass at every tavern, and at every trap.',
      'Gone, but not forgotten. Mostly not forgotten. The tavern has openings.',
      'The DM reads a short eulogy. It includes the phrase "should have used Help Up."',
      'Rest in peace. The bards will exaggerate everything, as is tradition.',
      'The campaign goes on, one chair emptier. The DM fills the chair with snacks.',
      'Some heroes ride off into the sunset. This one rode off into a pit.',
    ],
    level_up: [
      'Level up! More HP, a roll on the Table of Questionable Blessings and a choice to make.',
      'Ding! The DM reluctantly hands over the next page of your character sheet.',
      'One level-up per won fight, and the DM rolls to see who. The lowest level always goes first.',
      'More levels! Remember: four skill sockets, and forgetting is forever.',
      'Level up! The party gets stronger. The goblins stay exactly the same.',
      'Growth! Character development! Actual numbers going up!',
      'The DM mutters "power creep" and turns the page. Slowly. Very slowly.',
      'Level up. Do not ask the DM how many levels the boss has.',
      'Slow and steady: the DM levels this party one hero at a time. He calls it fair. The barbarian calls it a conspiracy.',
    ],
    signature: [
      '{hero} unleashes a signature move! The DM starts taking notes for the sequel.',
      '100 Hype, spent beautifully. {hero} is the main character now.',
      '{hero} goes full cinematic. Somebody cue the guitar solo.',
      'SIGNATURE MOVE! {hero} would like this printed on a mug.',
      '{hero} has been saving this one. The monsters regret everything.',
      'The DM puts down his soda. {hero} is doing the thing.',
      '{hero} cashes in all that Hype. Worth every point.',
      'No slow-motion replay of {hero}\'s signature move exists. Enjoy it now.',
    ],
    round_start: [
      'Round {n}. Everyone still alive? Good. For now.',
      'Round {n}. The DM checks his notes and frowns at them.',
      'Round {n}! The initiative order has not changed. Neither has the goblins\' attitude.',
      'Round {n}. Fight!',
      'It is round {n}. The DM refills his soda for the long haul.',
      'Round {n}. The monsters are adapting. Allegedly.',
      'Round {n}: same dungeon, new mistakes.',
      'On to round {n}. Unused AP is still not a savings account.',
      'Round {n}. Every melee fighter gets a fresh attack of opportunity. Spend it on a goblin.',
    ],
    // once per run of monster turns (combat.js, 10%)
    enemy_turn: [
      'The enemies take their turn. The DM rubs his hands together.',
      'Monster time! The DM narrates every attack with sound effects.',
      'Monster turn. No warning, no countdown, just a goblin with a plan.',
      'The DM moves the minis with suspicious enthusiasm.',
      'The monsters act the moment their turn comes up. The DM calls it "improv."',
      'The monsters act. The DM does the voices. All of the voices.',
      'Brace yourselves. The DM just said "okay, so..." in that tone.',
      'The enemies go. The DM rolls behind the screen and does not show you.',
      'Initiative says it is the monsters\' turn. The DM agrees with initiative.',
    ],
    // the initiative roll (combat.js + the HUD's dice tray): {hero} = the first hero in the order, else 'the party'
    initiative: [
      'Roll for initiative! The DM rolls behind the screen and refuses to elaborate.',
      'Everybody roll a d20. The order holds for the whole fight, so complain to the dice.',
      'Initiative is rolled. The first hero up is {hero}. No pressure.',
      'Dice everywhere. One rolls under the couch. The DM rules it a natural 1 and moves on.',
      'Initiative! Quick little things go first. Golems go eventually.',
      'The DM reads out the turn order like a wedding seating chart. Nobody likes their table.',
      'Roll for initiative! Anything that beat {hero} to it will not be sending a warning first.',
      'The d20s have spoken. The order is final, and the DM will eat Cheetos through every single turn of it.',
      'Initiative order locked in. Somebody write it on a napkin. The napkin is now canon.',
    ],
    // an attack of opportunity (requested from the engine, docs/notes/narrative.md; nothing narrates it yet). Token-free:
    // either side can swing, and the caller may pass nothing
    opportunity: [
      'Attack of opportunity! Walking away from a fight is a choice. A painful one.',
      'Never turn your back on someone holding something sharp. The DM says this every session. Nobody listens.',
      'Free swing! The rules call it an attack of opportunity. The victim calls it rude.',
      'Somebody tried to leave without paying the exit fee. The exit fee is a punch.',
      'The DM checks the rulebook. Yes, walking away provokes. No, "I was just leaving" is not a defense.',
      'Opportunity knocks. With a weapon. On the back of a head.',
      'Pro tip from the DM: shove, leap or teleport out of a melee. Strolling out costs extra.',
      'A free hit, courtesy of poor life choices and the movement rules.',
      'The DM loves this rule. It is the only one everybody at the table actually remembers.',
      'That is what turning your back in a melee gets you. Ask anyone who has done it twice.',
    ],
    // [finish D7] a swap move (DD.Act.swapMove, now and then): {hero} = the one who moved, {ally} = the ally it traded
    // places with. Names come only from the tokens, so no line can name a hero who is not in the fight
    swap: [
      '{hero} and {ally} trade places. The DM erases two minis and redraws them. Grudgingly.',
      '"After you." "No, after YOU." {hero} and {ally} settle it by swapping.',
      '{hero} swaps with {ally}. Musical chairs, but with more stabbing.',
      'A tactical swap! {hero} takes the front, {ally} takes the credit.',
      '{ally} is politely relocated by {hero}. Nobody signed a form.',
      '{hero} and {ally} do the little sidestep dance. The monsters are briefly confused.',
      'Seat swap! {hero} wanted the view. {ally} wanted to live.',
      'The DM checks the rules: {ally} was only moved, so {ally} provokes nothing. {hero} walked, so {hero} might.',
    ],

    // ---- run & screens (shopkeeper, barkeep, map, act screens) -------------------------------------------------
    shop_greet: [
      'Welcome to Ye Olde Overpriced Shoppe! Everything is genuine, and genuinely marked up.',
      'Ah, customers! Or as I call them, walking wallets.',
      'Browse freely. Breathing on the merchandise costs extra.',
      'Everything you need to survive, at prices that make you wish you hadn\'t.',
      'Welcome back! No, I don\'t remember you. Yes, prices went up.',
      'No haggling, no refunds, no mimics. Well. Fewer mimics.',
      'Adventurers! I love adventurers. You always die with full pockets.',
      'Step right in! Mind the goblin. He is an employee. Allegedly.',
    ],
    shop_buy: [
      'A wise purchase. Probably.',
      'Sold! No refunds, no returns, no eye contact.',
      'Excellent choice. That one has barely been cursed at all.',
      'Pleasure doing business. Mostly my pleasure.',
      'Another satisfied customer. Satisfaction not guaranteed.',
      'Ka-ching! Come back when you have more of that.',
      'Great buy. I would use it myself, if I were brave or stupid.',
      'Gift-wrapped in genuine parchment. That costs extra. Kidding! ...Unless?',
    ],
    shop_broke: [
      'Gold first, dreams second.',
      'This is a shop, not a charity. The charity is two doors down, and it is a mimic.',
      'Come back when you are less poor.',
      'Your wallet says no. I agree with your wallet.',
      'I accept gold, more gold and very rare gems. Not hugs.',
      'Window shopping is free. Everything else is not.',
      'I don\'t do layaway. Or sympathy.',
      'Have you tried killing something richer?',
    ],
    shop_leave: [
      'Come again! Bring more gold!',
      'Don\'t die before your next purchase!',
      'Tell your friends. Especially the rich ones.',
      'Thanks for shopping! Mind the trapdoor on the way out.',
      'Farewell! If you find any loot, you know where I am.',
      'Leaving so soon? Your gold will miss me.',
      'Bye now! Remember: if it breaks, it was already broken.',
      'Off you go. Try not to bleed on the doormat.',
    ],
    tavern_greet: [
      'Sit down, you look terrible. That is a compliment around here.',
      'First round is free. The second round is mandatory.',
      'No fighting inside. Outside, I sell tickets.',
      'Welcome! Rest, train or recruit. Or drink. Mostly drink.',
      'Heroes! Wipe your feet. And your swords.',
      'You smell like dungeon. The bath is in the back. The ale is in the front.',
      'Back again? The bard has been working on a song about you. It is mean.',
      'Pull up a stool. The good ones are by the fire and covered in dog hair.',
    ],
    rest: [
      'The party collapses into beds that are only slightly haunted.',
      'A long rest, a hot meal and nobody gets stabbed. True luxury.',
      'The party snores in perfect harmony. The bard is jealous.',
      'You rest. The DM uses the downtime to sharpen the next encounter.',
      'Warm beds, cold ale and a medic who is only a little drunk.',
      'Eight hours of sleep. Nine, counting the nap during breakfast.',
      'The barkeep tucks everyone in and confiscates the sharp things.',
      'The party rests up. Somewhere in the dungeon, a monster does the same.',
    ],
    recruit: [
      'A new face at the table: {hero} pulls up a chair and asks what the party has been up to.',
      '{hero} has been waiting at the bar all campaign for someone to ask.',
      'The DM hands {hero} a fresh character sheet. It is already a little stained.',
      'Fresh blood! {hero} signs the waiver without reading it.',
      '{hero} joins up, mostly for the dental plan.',
      'The party gains a member. {hero} already has opinions about the marching order.',
      '{hero} rolls up to the table, rolls for stats and rolls both eyes.',
      'Everyone welcome {hero}! Please don\'t get attached. Kidding. Mostly.',
    ],
    map_enter: [
      'The party consults the map. The map consults the party. Nobody is reassured.',
      'Choose a path. The DM has prepared exactly one of them.',
      'Somewhere ahead: loot, glory and at least one goblin with a grudge.',
      'The DM taps the map. "You can go anywhere." You can go forward.',
      'Onward! Unless you want to split the party. Please don\'t split the party.',
      'Pick a door, any door. Monsters behind all of them. Snacks behind some.',
      'The road forks. The DM grins. The road always forks.',
      'Every node is an adventure. Some adventures are taxes.',
    ],
    act_intro_1: [
      'Act I: The Leaky Flagon\'s Basement. Every legend starts in a cellar. Most of them end there too.',
      'Act I. Rats, goblins and a tax collector who will not take no for an answer.',
      'Session one! The DM has prepared a cellar, some sewers and his favourite goblin. Try not to die in the tutorial.',
      'Act I begins under a tavern, as all great tragedies do. Mind the barrels.',
      'The Leaky Flagon\'s basement awaits: damp, dark and absolutely full of goblins.',
      'Act I. The DM swore this campaign would be different. It starts in a basement.',
      'Welcome to Act I, where the floors are sticky and the kobolds are unionized.',
      'Act I: down the stairs, past the kegs and into trouble. Bring a torch. Bring two.',
    ],
    act_intro_2: [
      'Act II: the Hauntwood and the Necromancy Academy (Accredited). The trees are cursed and the faculty is dead.',
      'Act II. Fog, graveyards and a library with very strict late fees.',
      'The forest is haunted, the academy is accredited and the DM has bought a new fog machine.',
      'Act II begins. Everything here is undead, overdue or an owlbear.',
      'Welcome to the Hauntwood. Don\'t feed the wisps. Don\'t pet the skeletons. Return your books.',
      'Act II: the DM read a book about atmosphere. Brace for atmosphere.',
      'The trees whisper, the graves groan and the library charges interest. Act II.',
      'Act II. You have outgrown the basement. Now the basement is everywhere, and haunted.',
    ],
    act_intro_3: [
      'Act III: Behind the DM Screen. You can see his notes from here. They are mostly crossed out.',
      'Act III. Lava, dragons and the actual table. The DM has stopped pretending to be neutral.',
      'The final act. The DM puts on his serious hat. It is the same hat, worn seriously.',
      'Act III begins. Somewhere ahead, a giant d20 is rolling your way.',
      'Welcome behind the screen. Mind the Cheeto dust. It has seniority.',
      'Act III: hellscapes, a dragon hoard and a man with a lot of dice. This is where it ends.',
      'The last act. The DM has saved his meanest encounters, and his biggest bag of snacks.',
      'Act III. You have come too far to die to something embarrassing. Probably.',
      'Act III. The DM swears this is the last act. He says it to the floor, for some reason.',
    ],
    act_clear: [
      'The DM flips to a fresh page and cracks his knuckles.',
      'One act down! The DM is visibly sweating.',
      'Act cleared. The DM declares a pizza break, followed by a harder act.',
      'The boss falls. The DM quietly rewrites the next act to be meaner.',
      'Act complete. The DM mutters something about "power gamers."',
      'Another chapter closed. The bards are already exaggerating it.',
      'The act is over. Everyone stretches, refills their drinks and pretends not to be tired.',
      'That is the act! The DM is moving the goalposts as we speak.',
      'The DM\'s phone buzzes. A text from "S": "Cute act. Mine\'s better." He turns the phone face down.',
    ],
    treasure: [
      'Treasure! Definitely not a mimic. The DM looks disappointed.',
      'Loot! The DM grudgingly admits that was on purpose.',
      'Shiny things! Everyone pretends not to want them.',
      'Treasure, and nobody checked for traps, and nobody died. Lucky.',
      'Gold, trinkets and one weird sock. Classic loot.',
      'It opens without biting anyone. The DM sighs into his soda.',
      'Treasure! Remember: if it is cursed, it is still yours.',
      'The DM rolls on the loot table and does not like the result. You do.',
    ],
    gameover_title: [
      'The Party That Tripped Over Its Own Ambition',
      'Rocks Fell. Everyone Died.',
      'A Cautionary Tale, Probably',
      'They Rolled a 1 for Initiative',
      'Roll Up New Characters',
      'The Campaign That Wasn\'t',
      'Natural 1s All the Way Down',
      'The DM Wins This Round',
    ],
    victory_title: [
      'Legends (Allegedly)',
      'The Party That Somehow Won',
      'Certified Dungeon Degenerates',
      'The DM Has Run Out of Monsters',
      'Heroes of the Table',
      'Natural 20s All Around',
      'Absolutely Not Railroaded',
      'Undefeated, Mostly',
    ],
    run_start: [
      'Session zero is over. Grab your dice: the DM has been looking forward to this.',
      'A new campaign begins! The DM promises it will be fair. The DM is lying.',
      'Four adventurers walk into a tavern. That is the whole setup. The punchline is coming.',
      'Welcome, degenerates. The snacks are out, the dice are rolled and the DM is smiling.',
      'The campaign begins. Please keep your hands, feet and character sheets inside the dungeon at all times.',
      'Character sheets: filled in. Snacks: acquired. Survival: optional.',
      'Another campaign! The DM has prepared three acts and absolutely no mercy.',
      'Let the adventure begin. The map only goes forward, and so does the pain.',
    ],
    idle_dm: [
      'The DM drums his fingers on the table. Take your time. No, really. He has all night.',
      'The DM opens a fresh bag of Cheetos. The crunching is deafening.',
      'The DM checks his phone, then pointedly checks it again.',
      'Take your time. The goblins are using it to stretch.',
      'The DM starts building a tower out of his dice. It is getting tall.',
      'Somewhere in the dungeon, a goblin taps its foot.',
      'The DM mentions, to nobody in particular, that holding Alt shows what the monsters can reach.',
      'The DM hums the hold music from the Infernal DMV. Badly.',
      'The DM tilts his head sideways to read the board. Somebody tell him about the Q and R keys.',
      'The DM tucks his feet up onto his chair. He always does. He won\'t say why.',
      'Something under the table bumps the DM\'s chair. He does not look down. He has learned not to look down.',
    ],

    // ---- loading-screen tips (title screen). Every tip is true in v2; numbers are the engine's. -----------------
    tips: [
      // initiative & turns
      'Every fight opens with a roll for initiative: d20 plus each unit\'s modifier. The order holds for the whole fight.',
      'Initiative ties go to the higher modifier, then to the heroes. The monsters have filed a complaint.',
      'Before the initiative roll, place and swap heroes anywhere in the green deployment zone for free.',
      'Everyone takes one turn per round in initiative order (a few bosses take two). Summons act on their owner\'s turn: corgis move with Ellaria.',
      'Unused AP is lost when a turn ends. There is no Guard: spend it or lose it.',
      'Nobody starts a fight with Block. You earn it mid-fight, and it lasts until the start of its owner\'s next turn.',
      'Monsters act the moment their turn comes up, without warning. Only bosses and a few elites wind up their big moves first.',
      'Hold Alt (or press T) for threat shading: every tile an enemy could hit before this hero\'s next turn.',
      'The initiative tracker shows who acts next. Hover a portrait to light that unit up on the board.',
      'Inspect an enemy to see its move, reach, initiative and abilities. Knowing beats guessing.',
      'AP you give an ally outside their turn is banked: they get it at the start of their next turn.',
      'Monsters that appear mid-round roll initiative on arrival and act from the next round.',
      // control
      'A debuff you apply on your turn covers the enemy\'s next turn: Root the charger, Silence the caster, Taunt the brute.',
      'A Stunned enemy skips its whole next turn. So does a Frozen one.',
      'Sleeping units wake up when damaged. Stunned ones do not get that luxury.',
      'A Taunted enemy must attack its taunter if it can reach it, and walks toward it if it can\'t.',
      'A Charmed enemy fights for your side on its next turn. Point it at its friends.',
      'A Dazzled enemy\'s attack lands 1 tile off in a random direction. A Confused one may turn and hit its friends.',
      // wind-ups (bosses, and a few elites' signature moves)
      'Wind-ups mark their tiles in red with a ⏳ and land at the start of their owner\'s next turn (⏳2: the one after). Get clear!',
      'Stun, Sleep or Freeze whoever is winding up and the wind-up is interrupted on the spot, if it sticks. Bosses can\'t be sheeped.',
      'Wind-ups aimed at the floor stay put. Ones aimed from the monster itself move with it when you shove it.',
      'A wind-up that tracks a hero can fizzle: get out of its range, out of its sight or into stealth before it lands.',
      // attacks of opportunity
      'Walking away from a melee foe gives it a free attack of opportunity. Each unit makes at most one per round.',
      'Pushes, pulls, teleports, jumps, dashes and swapping skills never provoke attacks of opportunity. Only walking (or a swap move) does.',
      'Melee heroes hold the line: an enemy next to one would rather keep swinging than walk past and eat a free hit.',
      'It works both ways: an enemy that walks away from your melee heroes eats a free hit too. Pin the archers.',
      'Stunned, sleeping, frozen and sheeped units make no attacks of opportunity, and stealthed units provoke none.',
      'Sneaky enemies dive the weakest hero. Everything else hits what it can reach, starting with whoever is next to it.',
      'Paths dodge attacks of opportunity when they can. Hover a tile first: a red path with ⚔ marks shows who still gets a free hit.',
      'Bad move? Press Z to undo it, as long as nothing else happened since and it provoked no attack of opportunity.',
      // moving through allies, swapping places (rules run)
      'Heroes walk straight through each other, and monsters through theirs. Nobody can stop on an occupied tile, though: that is a hug.',
      'Stuck behind the wizard in a corridor? Click them while moving to swap places. It costs a move. The wizard pretends not to mind.',
      // [finish D2] the rule text: "Immovable units can start a swap but can't be swapped"
      'Slate is immovable: he can start a swap with an ally next to him, but nobody can swap with him. Walk around the golem.',
      'Space rolls initiative and ends turns, 1-6 pick skills, 7-0 use consumables, E interacts and Tab cycles summons.',
      'Can\'t see a tile? Hold the mouse wheel and drag to turn the map. Q and R turn it 90 degrees, Home puts it back.',
      // battlefield
      'Non-boss enemies pushed into a pit or deep water are gone for good (unless they fly). YEET.',
      'Heroes and bosses who fall into a pit lose 25% of their max HP, then climb out somewhere safe.',
      'A blocked push deals bump damage (usually 3) to the unit pushed, and to any unit it slams into.',
      'Lava deals 8 fire damage and Burn 2 to anyone who walks in or ends a turn there. Flyers float over it.',
      'Water puts out Burn and makes units Wet. Wet units can\'t Burn and take 50% more lightning damage.',
      'Lightning in water shocks the whole pool: 4 lightning damage (6 if Wet) and a Stun to everyone in it. Flyers just watch.',
      'Fire boils water into steam, which blocks line of sight until the end of the round.',
      'Frost freezes water into ice, and pushed units slide one extra tile on ice.',
      'Fire ignites oil, and the flames race along the entire slick.',
      'Explosive barrels blow up when destroyed or set alight: 8 fire damage to everything next to them.',
      'Shoot the barrel: aim any single-target damage skill at an explosive barrel and it goes off. Blast kills are environmental: +20 Hype.',
      'Webs root whoever walks into them. Fire burns them away.',
      'Skills used from higher ground deal 25% more damage.',
      'Climbing costs 1 extra move per level, and most heroes step up only 1 level at a time. Flyers ignore height, pits, liquids and mud.',
      'Professor Marbles, Betty and Hjalmar hop up 2 levels in a single step. Rabbits, goats and monkeys: born climbers.',
      'Flyers ignore the floor, good and bad: fire, puddles, traps, plates, holy ground. Clouds and blasts still hit them. They still pocket gold.',
      'Adjacent heroes can Smash objective objects like totems: 1 AP for 5 damage. Any single-target damage skill can break one too.',
      'Most things with HP are fair game: hit the crate, the totem, the Spore Pod next to three goblins. Property damage is still damage.',
      'No attack can be aimed at the DM\'s laminated screen (Smash it up close, or blast it) or at what you swore to protect. Even the snacks.',
      'Fountains heal 10 HP for 1 AP. One sip per fight: it is a small fountain.',
      // damage & Hype
      'Kills give +8 Hype. Environmental kills (pits, hazards, bumps, explosions) give +20 instead.',
      'One of your skills hitting 2 or more foes gives +4 Hype. Line them up.',
      'Signatures cost 100 Hype. Hype starts every fight at 0 (plus bonuses from gear and Blessings), so spend it.',
      'Poison ignores Block. Burn does not. Plan your shields accordingly.',
      'Bleeding units take damage every time they move or get pushed. Shove them around.',
      'A Marked unit takes extra damage from the next hit, equal to its Mark stacks.',
      'Frozen units take 50% more physical damage, but fire thaws them out.',
      'Armor reduces each attack by its value, down to a minimum of 1. Burn, poison and falls ignore armor.',
      // downs & the run
      'An adjacent ally can Help Up a downed hero for 2 AP. They get up with 25% of their max HP and act on their next turn.',
      'Aim a single-target heal at a downed ally and they get up with the healed HP. Help Up is for people who forgot to pack a Red Drink.',
      'Heroes still down when a fight is won get up at 1 HP with a Scar. Help them up before the fight ends.',
      'Each won fight a hero ends downed counts as a down. The third one writes them out of the campaign.',
      'After every won fight the DM rolls to see who levels up. The lowest-level heroes always go first.',
      'Leveling is slow: one hero per won fight, so in a party of four each hero levels about once every four fights.',
      'Recruits join at the lowest level among the heroes who stay, and the level-up roll treats them like everyone else.',
      'Each level-up rolls on the Table of Questionable Blessings, then you pick 1 of 3: new skills, upgrades or perks.',
      'Heroes socket 4 skills. Learning a fifth means forgetting one (it goes back in the pile), or skipping the new one.',
      'Heroes hold up to 4 Blessings. Rolling one you already own upgrades it instead.',
      'At a tavern, pick one: rest (35% heal for everyone and one scar treated), train (upgrade a skill) or recruit.',
      'The party shares 3 consumable pockets, and Josiah adds a fourth. Only heroes can drink potions: corgis lack thumbs.',
      'Summoned allies vanish when the fight ends. Do not get attached to the corgis. (You will.)',
      'Brutal: enemies get 15% more HP and 5% more damage, and normal fights bring an extra enemy.',
      'Clearing an act heals every hero for 50% of their max HP.',
    ],

    // ---- V3: act IV "Under the Table" (plan §5.5; the twist §2.1; the ending §2.4) --------------------------------
    // the act banner (map.js showActBanner): count-free, the gauntlet's doors come from the registry
    act_intro_4: [
      'Act IV: Under the Table. Down here the floor has a boss, and the boss has wings.',
      'Act IV. The DM whispers from under his chair: "All of his favourites, in any order. Then him. I\'m so sorry."',
      'Under the table: chewing gum, lost dice, a Cheeto the size of a canoe and a demon who owns all of it.',
      'Act IV. You can see the underside of the DM\'s table from here. Someone has carved "S WAS HERE" into it.',
      '"Welcome to the floor," says Svammiel. "Mind the gum. The gum is load-bearing."',
      'Act IV: no more DM. Well, there is a DM. He is a lot taller and he does not play fair.',
      'The last act. For real this time. Probably. Svammiel refuses to confirm.',
      'Act IV. Every door down here hides a mini-boss, and every mini-boss has a fan club of one: Svammiel.',
    ],
    // the twist panel's DM line (run.js completeAct: the act-clear text when the campaign goes on)
    act_clear_twist: [
      'The DM, from under his screen: "He\'s my DM. He has never once let me win. ...Good luck."',
      'The DM, very quietly, from under the table: "Every DM has a DM. Mine has wings. I\'m so sorry."',
      'The DM pulls his feet up onto his chair. "Now you know why I never put them on the floor."',
    ],
    // the act-3 boss's rewards text at the twist (run.js resolveCombat), exactly the plan's line
    twist_loot: [
      'The DM\'s loot is already sorted, labelled and signed in a handwriting that is not his: "Enjoy it. You\'ll need it. — S."',
    ],
    // the four-act final victory (gameover.js): campaign_won is the DM's narration, victory_final Svammiel's last word
    campaign_won: [
      'One campaign, one very sore demon and a party that refused to stay down. The DM is so proud he could cry. He does cry.',
      'The Cheeto dust settles. The DM writes THE END at the bottom of his notes, then, after a moment, adds a question mark.',
      'The DM sets his screen back up on top of the table, where screens belong, and grins at the party over it.',
    ],
    victory_final: [
      'Svammiel, from somewhere far below: "Fine. FINE. ...Same time next week?"',
      'From very far below the floor, a small, sulky voice: "Best two out of three?"',
      'Far below, something with graph-paper wings is already writing the sequel. In pencil.',
    ],
    // loading tips that join `tips` only once Svammiel has been seen (title.js gates them); each is true in the final
    // build and re-checked by the narrative suite. Count-free on purpose: the doors come from the registry.
    tips_act4: [
      'In Act IV every door is a mini-boss, and mini-bosses wind up their big moves like bosses: marked tiles, an hourglass, get clear.',
      'Svammiel cheats, but always out loud: the banner names the cheat and its exact effect, and the rule bar keeps it until it ends.',
      'Svammiel announces his round cheats a round ahead. Read the "Next round" chip, then plan.',
      'The DM sits at the kids\' table in Svammiel\'s fight. Ask him for a Ruling: it cancels a cheat and hurts Svammiel.',
      'Svammiel flies: lava, fire, puddles and traps never touch him. Until somebody catches him cheating.',
      'In Act IV you pick the order of the mini-bosses, with rests, shops and events in between. Then the floor boss.',
      'Heroes can swap places with an adjacent ally as a move. On a stirring spot, that means the spot never comes free.',
      'Galbraith counters one spell a round. Swords, arrows and corgis go straight through.',
      'The Gardener\'s plants burn. Fire in a greenhouse: not advised, unless you are the heroes.',
      'Break the League\'s bodies, or Zargash prays them back up.',
      'Whoever holds the Coven\'s Eye runs the Coven\'s turn. Take her down and they act separately.',
      'The tavern rug is the one floor Svammiel doesn\'t control. Rest stops are safe.',
      'The DM whispers counters to Svammiel\'s cheats in the combat log. Read the log; he is on your side now.',
      'Shooting a barrel still works in Act IV. The League calls theirs Evil Powder Kegs. Same barrels.',
      'Heals aimed at a downed ally still bring them back up. Svammiel calls it cheating. It isn\'t.',
      'A bar takes two goats: one starts it, another finishes it. Shut one up in between and the bar hangs.',
      'Clap back at the Rapping Goats\' mic stand: their verse turns on you. Send your sturdiest hero.',
      'The goats need to see who they diss. Hay bales and barn posts hide you. Lil\' Kid just yells, though.',
      'At half health the Rapping Goats wake whatever is snoring in the hay. It is a bear. It writes poetry.',
    ],
    // run-start lines that join `run_start` once the twist was seen (the lie of "three acts" is the setup until then)
    run_start_seen: [
      'The DM has prepared three acts. Something under the table has prepared a fourth.',
      'A new campaign. The DM keeps his feet up on his chair. You know why now.',
      'Three acts, says the DM. A voice from under the table says: "Four."',
    ],
    // Svammiel's fight (svammiel.js): his defeat and his phase flips
    svam_defeat: [
      'The DM climbs back into his chair and, for the first time in eleven years, puts both feet on the floor. "Same time next week," he says. It is not a question.',
      'Somewhere above, the table stops shaking. The DM peeks over the edge of it, sees the party and starts a slow clap that goes on for a while.',
    ],
    svam_phase2: [
      'Svammiel kicks the board. The floor tiles rearrange themselves out of fear.',
      'Svammiel spreads his wings and takes a second turn, because apparently that is allowed now.',
    ],
    svam_phase3: [
      'Svammiel stops pretending there is a rulebook. There is only him, and a lot of capital letters.',
      'Svammiel rage-quits his own floor. The outer panels start falling into the dark, panel by panel.',
    ],
  };

  /**
   * V3: act-4 variants (`key@a4`, ARCHITECTURE §2 / §3.10): while act 4 is played, DD.narrate draws from these instead
   * of the base pool. Same tokens as the base key; {hero} never gets a pronoun; {enemy} may be 'gravity' (a down with
   * nobody to credit) and {hero} 'the party' (initiative), so neither starts a sentence.
   */
  const VARIANTS = {
    'boss_start@a4': [
      'Whatever comes next has Svammiel\'s handwriting all over it. The DM recognises the red pen.',
      'The lights dim. A spotlight snaps on. Svammiel paid for the spotlight.',
      'The DM whispers: "Down here the big moves get wound up first. Watch for the marked tiles and the hourglass."',
      'Svammiel has a laminated card for this fight. He laminated it twice.',
      'Boss music plays from somewhere above you, on a cursed kazoo.',
      'Every fight in Act IV is a boss fight. The DM calls that "a lot". Svammiel calls it "Tuesday".',
    ],
    'round_start@a4': [
      'Round {n}. The DM whispers the round number. Svammiel repeats it, louder, for credit.',
      'Round {n}. A demon taps a d20 against a table leg, loudly, on purpose.',
      'Round {n}. The floor shifts slightly. Probably nothing. It is never nothing.',
      'Round {n}! The DM, under his breath: "You can do this."',
      'Round {n}. The gum on the ceiling stretches a little lower.',
      'Round {n}. Svammiel checks his notes, smiles, and crosses out something you did.',
      'It is round {n}. The DM would like everyone to know he is rooting for you. Quietly.',
      'Round {n}. The floor boss is watching. The floor is also watching.',
    ],
    'enemy_turn@a4': [
      'The monsters move. Svammiel does the voices. He is better at voices than the DM. The DM is hurt.',
      'Enemy turn. Svammiel commentates it like a sports announcer who hates you.',
      'Monster time, under the table. The dust bunnies scatter.',
      'Their turn. Svammiel applauds before anything has even happened.',
      'Enemy turn. The DM covers his eyes. Then peeks.',
      'The enemies act. Svammiel adds sound effects nobody asked for.',
    ],
    'initiative@a4': [
      'Roll for initiative! Svammiel rolls too. He rolls a 20. He shows nobody.',
      'Initiative! First up for the heroes: {hero}. Svammiel has already started heckling.',
      'The dice tumble across the floor. Svammiel owns the floor. Make of that what you will.',
      'Dice rolled under the table, where the DM can\'t see them. Svammiel can. Svammiel sees everything.',
      'Initiative! The DM whispers "nice roll" to {hero} and hides behind a chair leg.',
      'Everyone rolls. One die rolls under the canoe-sized Cheeto and is never seen again.',
    ],
    'victory@a4': [
      'Victory! Svammiel boos from somewhere above. Then below. Then above again.',
      'A tiny thumbs up appears from under a chair. The DM is not allowed to cheer down here.',
      'You win! Svammiel writes "cheated" in his notes. He would know.',
      'Svammiel takes it personally. He takes everything personally, including the furniture.',
      'Victory. The DM does a quiet fist pump, then pretends it was a stretch.',
      'The floor boss is losing his floor, and he is taking it very badly.',
      'The dice stop rolling. Down here, that counts as applause.',
      'Cleared! Somewhere, a demon is drafting a strongly worded errata.',
    ],
    'defeat@a4': [
      'Svammiel lands on the pile of heroes. "You thought this was over? Now it is."',
      'Total party kill. Svammiel flips the board. You were all still on it.',
      'The DM, from under the table, quietly packs your minis away. He is crying a little.',
      'Everyone is down. Svammiel rolls his d20. It says 20. It always says 20.',
      'Swept under the rug. Svammiel has waited all act to say that, and he hates rugs.',
      'The campaign ends under the table, where all the dropped things go.',
      'Svammiel does a victory lap of the room. He flies it, so it counts double.',
      'Rule Zero: the DM always wins. Svammiel wrote that rule, and he just used it.',
    ],
    'hero_downed@a4': [
      '{hero} hits the floor. Svammiel\'s floor. It remembers everyone.',
      '{hero} goes down to {enemy}. Svammiel starts a slow clap. Nobody joins in.',
      'Down goes {hero}! The DM whispers: "Help Up is two AP. Or aim a heal at the fallen."',
      '{hero} is down, courtesy of {enemy}. Svammiel makes a note in red ink.',
      '{hero} is down. The DM, under his breath: "Get up. Please. I can\'t watch him gloat."',
      'A thud under the table: {hero} is down, and {enemy} looks very pleased with the floor.',
    ],
    'level_up@a4': [
      'Level up! Svammiel objects. The rules overrule him. He hates the rules.',
      'Ding! The DM rolls for who levels up. Svammiel demands a reroll. He doesn\'t get one.',
      'Level up, under the table. The DM slips you the next page of your character sheet.',
      'More levels. Svammiel quietly adds a zero to the next fight\'s HP. In his head. Only in his head.',
    ],
    'idle_dm@a4': [
      'Svammiel drums his claws on the floor. It is his floor. He can drum as loudly as he likes.',
      'The DM, whispering: "Take your time. He can\'t rush you. That rule is still mine."',
      'Svammiel starts building a tower out of the party\'s lost dice. It is very tall.',
      'Svammiel yawns theatrically. His wings yawn too.',
      'Somewhere, Svammiel is reading your character sheets aloud in funny voices.',
      'The DM mentions, very quietly, that holding Alt still shows what the monsters can reach.',
    ],
    'shop_greet@a4': [
      'The DM, in a paper hat: "Welcome to Ye Olde Overpriced Shoppe. I used to run this whole campaign."',
      '"Under new management," says the DM, pointing at a portrait of Svammiel. The portrait winks.',
      'The DM is working the counter. His name tag says DM (DEMOTED). He seems very relieved to see you.',
      '"Everything is genuine," whispers the DM. "Except the prices. Svammiel sets the prices."',
      'The DM restocks potions with the quiet dignity of a man who once had a screen.',
      '"Buy something," the DM pleads. "I work on commission. He pays me in dice. Ones only."',
      '"Between us," whispers the DM, "the Red Drinks are the only honest thing in this shop."',
      '"Everything costs more down here," whispers the DM. "Svammiel\'s markup. Don\'t ask."',
    ],
    'shop_buy@a4': [
      '"Excellent choice," says the DM. "Back when I was in charge, I\'d have hidden that in a chest for you."',
      'The DM rings it up and mouths "good luck".',
      '"Sold! Svammiel takes a cut. Svammiel takes every cut."',
      'The DM wraps it in an old character sheet. Yours, from session one.',
      '"No refunds," sighs the DM. "His rule. I would have allowed refunds."',
      'Ka-ching. Somewhere below, a demon hears the till and smiles.',
    ],
    'shop_broke@a4': [
      '"Not enough gold," says the DM gently. "Trust me, I know the feeling."',
      '"I\'d spot you," whispers the DM, "but he audits the till."',
      'The DM checks his own pockets for you: two d4s and a Cheeto. Not legal tender.',
      '"Come back richer," says the DM. "Or come back with his crown. I\'d frame it."',
      '"Svammiel says no credit," says the DM. "Svammiel says no to a lot of things."',
      'Short on gold? The DM nods sadly. He was short on gold for eleven years.',
    ],
    'shop_leave@a4': [
      '"Go get him," whispers the DM. "But don\'t tell him I said that."',
      'The DM waves you off with his paper hat.',
      '"Come back alive! I need the commission."',
      '"If you see my screen down there, I\'d like it back."',
      'The DM flips the sign to CLOSED (FOREVER?), then flips it back.',
      '"Good luck," says the DM. "I mean it. I always meant it."',
    ],
    'tavern_greet@a4': [
      'The Last Tavern Under the Table. Wipe your feet on the rug: it\'s the only floor down here Svammiel doesn\'t own.',
      'A tavern with a very, very large rug. "He can\'t cheat on carpet," says the barkeep. "Fine print."',
      '"No demons past the rug," says the barkeep, nodding at a sign. Someone has drawn horns on the sign.',
      'The fire is warm, the ale is cold and the rug is wall to wall. You are safe here. Mostly.',
      '"Rest, train or recruit," says the barkeep. "The rug\'s got you."',
      'Svammiel hovers at the tavern door, just off the rug, sulking. He is not allowed in.',
      '"Last stop before a mini-boss," says the barkeep. "Or after one. I lose track down here."',
      'Three adventurers at the bar argue about which mini-boss to fight first. All three are crying.',
    ],
    'rest@a4': [
      'The party sleeps on the rug. Svammiel taps on the window all night. Nobody lets him in.',
      'A long rest under the table. The gum overhead drips once, ominously, and stops.',
      'Everyone rests. The DM sneaks in, tucks a blanket over the party and sneaks out again.',
      'Eight hours on the rug. Svammiel spends all of them outside, muttering about carpet loopholes.',
      'The party rests. Down here, "night" is when the DM switches his desk lamp off.',
      'Rested. The rug has never felt so much like a legal document.',
    ],
    'recruit@a4': [
      '{hero} has been living under the table since session four and is thrilled to see lamplight.',
      '{hero} signs on in the middle of the last act. Svammiel immediately opens a file.',
      'A fresh face under the table: {hero}. Svammiel gives a slow, delighted clap from outside the rug.',
      '{hero} crawls out from behind a table leg, holding a character sheet and a very old sandwich.',
    ],
    'map_enter@a4': [
      'The floor plan has a room for each of his favourites, and a throne. Svammiel has drawn horns on your party token.',
      'Pick a mini-boss. Any mini-boss. Svammiel has rigged all of them equally.',
      'The DM whispers from behind a chair leg: "Rest when you can. He hates the rug."',
      'A map drawn on graph paper in red pen, with a smiley face over every trap.',
      'A row of doors. Behind each one, a mini-boss and a demon waiting to heckle you about it.',
      'Svammiel\'s map has a legend. The legend is a drawing of Svammiel.',
      'The path forks. Svammiel insists both forks are his. He is technically right.',
      'Somewhere above you, the DM\'s table creaks. Somewhere below you, something laughs.',
    ],
    'gameover_title@a4': [
      'Floored', 'Swept Under the Rug', 'Rule Zero Wins Again', 'The DM\'s DM Sends His Regards',
      'Cheated Out of a Happy Ending', 'Lost Under the Table', 'You Thought This Was Over', 'Svammiel Controls All (Allegedly)',
    ],
    'victory_title@a4': [
      'The Party That Beat the DM\'s DM', 'Floor Bosses No More', 'Above the Table at Last', 'Cheated, Undefeated',
      'Natural 20s (Unfudged)', 'Svammiel Controls Nothing', 'Same Time Next Week', 'Certified Under-the-Table Survivors',
    ],
  };

  Object.keys(LINES).forEach(function (k) { DD.registerNarration(k, LINES[k]); });
  Object.keys(VARIANTS).forEach(function (k) { DD.registerNarration(k, VARIANTS[k]); });

  /** Public: the token contract per key (for content authors and tests) and this file's own lines. */
  DD.Narrator = {
    TOKENS: TOKENS,
    KEYS: Object.keys(TOKENS),
    LINES: LINES,
    V3_KEYS: V3_KEYS,
    VARIANTS: VARIANTS,
    /** Tokens used by a line, e.g. ['hero', 'enemy']. */
    tokensOf: function (line) {
      const out = [];
      String(line).replace(/\{(\w+)\}/g, function (m, k) { if (out.indexOf(k) < 0) out.push(k); return m; });
      return out;
    },
    /** Lines of `key` (all registered, or `lines`) that use a token its callers do not fill. An act variant
     *  ('victory@a4') is held to its base key's tokens. */
    badTokens: function (key, lines) {
      const base = DD.narrationBaseKey ? DD.narrationBaseKey(key) : String(key).replace(/@a\d+$/, '');
      const ok = TOKENS[base] || [];
      return (lines || DD.defs.narration[key] || []).filter(function (l) {
        return DD.Narrator.tokensOf(l).some(function (t) { return ok.indexOf(t) < 0; });
      });
    },
  };
})();
