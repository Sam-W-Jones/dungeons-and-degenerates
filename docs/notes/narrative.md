# NARRATIVE notes (events + narrator)

Files: `js/data/events.js`, `js/data/narrator.js`, `tests/content/narrative.js` (suites `narrative: …`).
Isolated run: `bash tools/test.sh "suite=narrative&isolate=events,narrator,narrative"`.
Scratch (not shipped): `.tmp/narrative-v2/` (screenshots; `shot_outcome.sh` takes a Chrome slot via `tools/chrome_slot.sh`
and clicks event choice `pick=N` on `outcome.html`).

## v2 pass (initiative, no telegraphs, no Guard, no XP, attacks of opportunity, six new heroes)

### Events (`js/data/events.js`, 35 events: 18 hero events + 17 generic)
- **XP is gone.** Every "gain N XP" is now a **level-up** through the event API:
  - **Rotation** (`api.levelUp()`): hint `One hero levels up (the DM rolls among the lowest-level heroes).` The outcome
    names the hero with the DM's die, exactly like the rewards screen: "The DM rolls a d3 for it: 2! Kiri levels up to
    level 3." (two candidates: "The DM flips a coin for it: heads!", one candidate: no roll). 8 choices: Homebrew a side
    quest, Share your feelings (mimics), the unpaid internship, Return the overdue book, Wait in line (DMV), Read the DM's
    notes, Syllamin's duet, Corelos reads every clause. Each comes with a cost or a risk (HP, gold, a fight chance).
  - **Named** (`api.levelUp(idx)`, they jump the rotation, ARCHITECTURE §9.2): **rare** — 3 choices, each only in that
    hero's own event and each with a cost: Marwyn "Bring it along" (everyone else −20% HP), Josiah "Bust the union" (a
    fight), Basanos "Watch the flock tonight" (a fight).
  - Small XP rewards (5–10 per hero) became small, different rewards (a 15% heal, 25–60 gold, a heal + Blessing roll,
    a heal + upgrade) so the user's slow leveling stays slow: about a third of the events offer a level-up at all.
  - **Consolation** (a hero with nothing left to learn / upgrade / roll on the Table, or nobody left to level): the DM
    pays **30 gold** instead (`CONSOLATION_GOLD`, was 15 XP). It never bends the rotation.
- **Level-ups and Blessing rolls resolve last** inside a choice (`ev_overdue_book` #1 heals first), so a heal / gold
  Blessing rolled by the level-up can't scale that same choice's numbers, and an HP cost is a share of the max HP shown
  when the player chose (the review moved six choices' level-ups after their HP cost).
- **Pronouns** (the user's list): Ellaria, Sparrow, Kiri she/her; every other hero he/him. Hero events hard-code the
  star's pronouns; generic outcomes name a random hero instead of guessing one (fixed: "Chapter 10 changes their life",
  the toughest hero "They set off…", the MLM skeleton's "his graveyard" and Dale's "with him" after a hero's name, the
  sculptor's "she" in Slate's sentence). Helpers' consolation lines use no pronoun.
- **Six new hero events** (`hero: <id>`, weight 2, acts 1–3, requires the hero alive; each rewards that hero):

| id | hero | title | choices |
|---|---|---|---|
| `ev_kir_lost_and_found` | kiri (she) | The Ethereal Lost and Found | pay 30 → Kiri upgrades · 60% rare item for Kiri / 40% normal fight · Kiri rolls on the Table (no curses) |
| `ev_bet_family_reunion` | betty (he) | The Betty Family Reunion ("It's a family name.") | 60% rare item (the family heirloom) / 40% Betty −30% HP · every hero heals 35% · Betty learns |
| `ev_bas_somebody_ate_dolly` | basanos (he) | Somebody Ate Dolly | pay 40 → rare item for Basanos · **Basanos levels up** + normal fight · 50% 45 gold / 50% Basanos −25% HP |
| `ev_val_forge_god` | valdris (he) | The Forge God Would Like a Trim | legendary item for Valdris + the scar Bruised Ego (his hair) · rare item, Valdris −25% HP · Valdris rolls on the Table |
| `ev_hja_prank_king` | hjalmar (he) | The Prank King of the Underdark | 60% rare item / 40% every hero −15% HP · Hjalmar learns + normal fight · Hjalmar rolls on the Table, everyone else −10% HP |
| `ev_peb_best_in_show` | pebbles (he) | Best in Show | 60% rare item / 40% lose up to 30 gold (arson) · Pebbles learns, 40% normal fight · every hero heals 30% |

- Other changed choices: Dice Goblin "Decline" (6 XP → every hero heals 15%), Session Cancelled rest 40% → 50% and job
  45 → 50 gold (so the level-up choice has company), I Check for Traps (8 XP + 15 → 25 gold), MLM recruit (20 gold + 5
  XP → 30 gold), Dale (10 XP + a scar → a scar, or 25 gold with nobody scarred), Owlbear "Teach the cubs" (10 XP → 30
  gold + the fight), Zarathor window-shop (15 XP → 25 gold), Marbles forgets (+10 XP → + a Blessing roll), Ellaria
  returns the corgi (45 gold + 8 XP → 60 gold), Slate endures (+20 XP → + an upgrade), Slate "Hmph. No." (15 XP → full
  heal + 20 gold), Buga kisses babies (+10 XP → every hero heals 20%).
- Hero items: `heroItem` prefers that hero's own unowned hero item (Kiri's bow, Betty's mallet, Valdris' Brightforge…)
  and now gives it through `api.giveItem({ id, heroIdx })`; scars with an id go through `api.addScar(idx, scarId)`.

### Narrator (`js/data/narrator.js`)
- New key **`initiative`** (9 lines, token `{hero}` = the first hero in the order, or `'the party'`, so `{hero}` never
  starts a sentence): `combat.js` narrates it when initiative is rolled and the HUD's dice tray shows that line
  (`M.rollLine`, else its own fallback).
- Removed every v1 lesson: "Read the red tiles", "Read the telegraphs", "Here come the telegraphed attacks", "how well you
  read those red tiles", "remember to Guard", "experience points", "They Did Not Read the Red Tiles", "the monsters are
  planning too", "Guard accordingly", the Guard / intent-anchor / tracking-shot / "stun cancels telegraphs" / half-XP
  tips.
- New v2 lines: initiative and one turn per unit (combat_start, round_start, initiative), monsters acting the moment
  their turn comes up (enemy_turn), boss wind-ups (boss_start), a fresh attack of opportunity each round (round_start),
  unused AP is lost (round_start), threat shading (idle_dm: "holding Alt shows what the monsters can reach"), the DM's
  level-up roll (victory, level_up).
- Lines with `{hero}` use no pronoun for the hero (the callers pass only a name): hero_downed "Get {hero} up…",
  hero_revived "back up" / "a character sheet", recruit "what the party has been up to" / "rolls both eyes".
- **69 tips** (68 + one added by the review), all true in v2 (initiative and ties, deployment, one turn each + summons, unused AP lost / no Guard, no
  starting Block, enemies act without warning, threat shading, banked AP, mid-round arrivals, debuffs cover the next
  turn, stun / freeze / sleep / taunt / charm / dazzle, boss wind-ups (landing, interrupts, bosses refuse sheep,
  anchors, tracking fizzles), attacks of opportunity (once per round, what never provokes, holding the line, enemies
  provoke too, who can't strike, divers), undo, keys, the battlefield and damage numbers, Help Up, downs, the leveling
  roll, recruits, sockets, Blessings, taverns, pockets, difficulty).

### Tests (`tests/content/narrative.js`, 12 suites, ~12.5k assertions isolated)
- `events — registry, copy and hero events`: shapes and lengths, 2–5 sentences, risk + free choice, **no v1 talk**
  (`V1_TALK`: XP, telegraphs, intents, Guard, red tiles), a level-up hint is the rotation or a named hero, one gated hero
  event per hero (16 heroes), weight 2, **the hero's own pronouns** in its text and hints, the six new heroes have one
  event each that features them, Betty's "It's a family name."
- `events — text, requires and gold costs`: unchanged (every "Pay N gold" locks at N−1, opens at N).
- `generic events (acts 1+)`, `generic events (acts 2-3)`, `hero events`: every choice of every event resolved through
  `DD.Run.chooseEventOption` on cloned runs with **uneven levels** ([2, 1, 2, 1]) and checked against its hint: gold
  (with the consolation gold), HP, **level-ups** (`c.rotation()`: exactly one hero, drawn among the lowest levels, named
  in the text with the right die; `c.named(i)`: that hero only), skills, items (own hero items first), consumables,
  scars (debt / haircut scars), Blessings, fights; every branch reached; outcome text clean (no v1 talk, sentences start
  uppercase, no doubled punctuation, the star's pronouns).
- `events — every outcome gives the real heroes their own pronouns`: every event × choice × 8 seeds with a mostly
  she/her party (Kiri, Ellaria, Sparrow, Betty; the hero's own party for hero events): no "he/him/his" after a she
  hero's name in the same sentence and vice versa.
- `events — level-ups go through the DM's rotation`: 8 rotation hints, 3 named ones (`NAMED_LEVEL_UPS`, only for their own
  hero); two behind → always one of them, both over the seeds, a coin flip; a level party → a d4 and every hero drawn;
  one behind → that hero, no roll; Marwyn's named level-up jumps the rotation; the leveled hero has a pending choice.
- `events — fallbacks`: full pockets, 4 sockets (queued learn), everything maxed (30 gold), **everyone at max level**
  (30 gold, nobody levels), a maxed named hero (Josiah), no scars (retcon 40, Dale 25), "Fetch!" punctuation, "two X",
  full-pocket sentences, Zarathor at 1 HP, Corelos already owes, **Valdris' ego already bruised** (another scar, named).
- `event fights start and auto-battle`: unchanged.
- `narration — every key, line counts, tokens (static)`: the §3.10 keys + `initiative`, 8+ lines (tips 30+), no v1
  talk, no 5-word near-repeats, tokens filled, no lowercase sentence starts (with 'gravity' / 'the party'), **no pronoun
  for {hero}**, and the DM talks v2 (initiative, attack of opportunity, wind-ups, monster turns, level-ups, unused AP,
  Alt).
- `narration tokens are filled in practice`: recorded DD.narrate calls in real sandbox fights (fixed and rolled
  initiative), a real run and the screens' `UI.narrate`; the `initiative` call fills `{hero}`; the uppercase check masks
  capitalized fills (a corgi named "Biscuit Jr." no longer reads as a sentence end).
- `tips — 30+, every one true in v2`: 64 of 69 tips checked in-engine in sections (each in `t.tryRun`), e.g. rolled d20
  + init and a fixed order, ties (stubbed d20s: higher modifier, then heroes), deployment swaps, summons on their
  owner's turn, Block wiped at initiative and lasting through the enemy turn, unused AP gone, an adjacent grunt hitting
  without an intent, `threatMap`, banked AP, joiners, Root through the next turn, stun / frozen skip, taunt (and walking
  to an unreachable taunter), charm, a meteor wind-up landing (or dodged), stun / sleep / frozen interrupt, bosses refuse
  sheep, a stun-immune boss keeps winding up, ground vs self anchors, a tracking wind-up fizzling on stealth, one attack
  of opportunity per round and no undo after it, push / teleport / swap / dash never provoke, a grunt sticking to the
  knight over a hurt wizard, an archer eating the knight's free hit, who can't strike / provoke, divers, and the old
  battlefield / damage / run numbers (the downed-at-victory check now allows the fight's level-up growth). The other 5
  (HUD keys, tracker hover, inspect panel, random Dazzle / Confuse direction, summons vanishing) are listed in
  `SOURCE_ONLY` and were checked against the source; any new tip must be checked or listed.

## Public API

- `DD.Narrator.TOKENS` — `{ key: [tokens every caller fills] }` (the §3.10 keys + `initiative` + `objective_failed`). `DD.Narrator.KEYS`,
  `DD.Narrator.LINES` (this file's lines), `DD.Narrator.tokensOf(line)`, `DD.Narrator.badTokens(key, lines?)`.
- Events have no public helpers; other content may check `DD.getEvent('ev_…')` or the `hero` field.

Token table (unchanged except `initiative` and `objective_failed`):

| key | tokens | callers |
|---|---|---|
| kill, env_kill | hero, enemy | actions.js (`hero` may be a summon's name, e.g. a corgi) |
| overkill | hero, enemy, n | actions.js (n = overkill ≥ 10) |
| multi_kill | hero, n | actions.js (n = kills in one skill, ≥ 3) |
| hero_downed | hero, enemy | actions.js (`enemy` is 'gravity' without a culprit) |
| hero_revived, signature | hero | actions.js, combat.js |
| round_start | n | combat.js (round ≥ 2, 20%) |
| initiative | hero | combat.js (the first hero in the order, else 'the party'), combat_hud.js (same) |
| recruit | hero, name | run.js |
| objective_failed | none | nobody yet: requested from combat.js (a lost objective with heroes standing narrates `defeat` today) |
| everything else | none | victory / defeat / treasure / shop_buy have callers with and without vars, so none |

## Deviations

1. Event `text` is a plain string (`run.js` and the event screen accept strings or functions).
2. Hero events carry `hero: '<heroId>'` (read by the event screen for the portrait) and weight 2.
3. `initiative` is a narration key the engine calls that ARCHITECTURE §3.10 does not list yet (see Requests).
   `objective_failed` (review) is a new key with no caller yet: lines for a lost protect objective while heroes still
   stand, which `defeat`'s TPK lines get wrong (see Requests).
4. Fallbacks not spelled out in hints (edge cases only): "learn" falls back to an upgrade, an upgrade or a Blessing roll
   with nothing left to give falls back to 30 gold, a level-up nobody can take (that hero / everyone at level 10) pays
   30 gold, an item with an empty item registry is paid out as gold (the API's behaviour), and the debt / haircut scars
   become a random scar when the hero already has them. The outcome text always says what happened.
5. `heroItem` still reads `DD.Run.state`, `DD.Rewards.ownedItems` / `randomItem` and `DD.Run.learnableSkills` to pick a
   hero's own item / skill (the event API has no "this hero's own unowned items" query); giving goes through the API.

## Core fixes

None.

## Requests

- **Lead (ARCHITECTURE §3.10)**: add `initiative` (token `{hero}`: the first hero in the order or 'the party') to the
  narration key list; DESIGN §11 lists the hero events of the first ten heroes only (the six new ones are above).
- **META-UI** (`js/ui/screens/title.js`): the title tagline "Every enemy telegraphs its attacks. You will still stand in
  them." is v1 and shows on every visit (seen in `.tmp/narrative-v2/title.png`); suggestion: "Nobody telegraphs
  anything. Except the bosses. You will still stand in it." `TIP_FALLBACK` (shown only when no tips are registered)
  also teaches v1 ("Enemies show exactly what they will do next turn…", "Unused AP turns into Block…", "Push an enemy
  and its melee attack moves with it"); any of the v2 tips in `narrator.js` can replace them.
- **ENGINE / rules owner (`js/engine/combat.js` `Combat.finish`)** (review): a lost protect objective while heroes
  still stand (the run goes on to the "Objective Failed" step) narrates `defeat`, whose lines are TPK lines ("Total
  party kill.", "Everybody is down. … Yep. Everybody.", "Your adventure ends here.") under a HUD ribbon that says "The
  heroes live." Please narrate `objective_failed` there instead (no tokens; lines registered in `narrator.js`), with
  the same test the HUD uses: `result === 'defeat'` and a hero still active. HUD (`combat_hud.js` `showResultModal`,
  debug fights) likewise. Lead: add `objective_failed` to ARCHITECTURE §3.10.
- ~~HUD (optional): move preview "⚔ provokes N"~~ — done by the HUD (red path, ⚔ marks, "Provokes N" hint); a tip now
  mentions it (review).

## Verification (2026-11-03)

- Isolated (`suite=narrative&isolate=events,narrator,narrative`): 12/12 suites pass, 12,540 assertions.
- With all content (`suite=narrative,content:,run: every registered event,ui: flow`): 24/24 pass, 29,438 assertions
  (real heroes, items and the Table of Questionable Blessings loaded).
- Full run (`bash tools/test.sh`, 786 suites, 114,089 assertions, 2 min 38 s): all 12 `narrative:` suites pass; no
  swallowed errors. The 23 failing sections are other areas: `bosses_act1` (18: Grimble / Rat King / stun guard /
  telegraph honesty / sims), `boss_dm` (3: registry, hiding, attack honesty) and `integration` (2: v1 unlock conditions
  and "ten real heroes" vs the v2 all-unlocked 16-hero roster; "no XP" in the Objective Failed step). None mention events
  or narration.
- Mutation checks (each reverted): a named level-up in "Homebrew" fails 8 assertions (rotation, die text, the rotation
  suite); "Somebody please remember to Guard." fails the v1-talk check; the old "his entire graveyard" / Dale's "with
  him" fail the pronoun suite (11 assertions).
- Screenshots (`.tmp/narrative-v2/`): `ev_kiri.png` (event screen + portrait), `out_mrw.png` (named level-up: text and
  the "Marwyn levels up to 2 (+5 max HP)" chip), `out_mimic.png` (rotation: "The DM rolls a d4 for it: 4! Valdris levels
  up to level 2."), `out_val.png` (Brightforge + Bruised Ego), `title.png` (a v2 tip; the v1 tagline above it is
  META-UI's, see Requests).

## Known issues

- Event damage never drops a hero below 1 HP (the run layer's rule), so "loses N" hints can take less from a hero at
  low HP; the event screen's change chips show the exact numbers (the dice goblin's outcome no longer claims a number).
- Lost protect objectives narrate TPK lines until `combat.js` calls `objective_failed` (Requests).
- Gold and healing from events go through the run layer, so gold / heal Blessings (runMods) scale them, like all income.
- Named level-ups (3 choices) can leave the party two levels apart until the rotation catches up (RUN's Deviation 1).
- Hero events forced open without their hero (debug only: `requires` gates them in runs) keep the absent hero's
  pronouns for the stand-in.
- Event fights in act 1 can be elite (only when the player picks that choice; the hint says so).

## Review (v2) — adversarial review of the events + narration v2 pass (2026-11-04)

Scope: `js/data/events.js`, `js/data/narrator.js`, `tests/content/narrative.js`, this file (no earlier review attempt
had touched them). Scratch, Chrome-slot aware: `.tmp/narrev/run.sh` + `probe.html` / `probe.js` (every choice of every
event × 30 seeds on random real 16-hero parties: uneven, maxed and level-10 parties, a dead hero, 5-gold purses), and
`shot_page.sh` + `outcome.html` / `roll.html` (event outcome / initiative dice tray screenshots).

### Verified (held)
- 2,944 real-party outcomes: every "X levels up to level N" matches a real level-up and every level-up is named; no
  stand-in text with the hero present; every real hero gets their own pronouns (she/her: Ellaria, Sparrow, Kiri); no
  broken punctuation, lowercase sentence starts or unfilled tokens.
- Hints vs effects on every branch (the SPEC suites assert gold, HP, levels, items, skills, scars, Blessings, fights,
  consolation gold); the rotation (lowest level first, the die in the text) and the 3 named level-ups only in their own
  hero's event; no v1 talk anywhere (XP, telegraphs, intents, Guard, red tiles, pre-fight Block).
- The source-checked tips: Space / 1-6 / 7-0 / E / Tab / Z keys, Alt and T threat shading, tracker hover, the inspect
  panel and the wind-up drawing (red tiles, ⏳ badge) match `combat_hud.js` and `hud-v2.md`.
- Screenshots (`.tmp/narrev/`): `ev_peb.png` (event screen, hero portrait), `out_dmv.png` / `out_mimic.png` (rotation
  outcomes: "The DM rolls a d4 for it: 2! Betty levels up to level 2.", chips "Party −3 HP" and "Betty levels up to 2
  (+4 max HP)"), `roll.png` (the initiative tray with an `initiative` line).

### Fixed (each with a regression in `tests/content/narrative.js`; mutation-checked)
1. **"Everyone takes one turn per round"** (a tip and the initiative line "Everybody gets one turn a round"): Grimble and
   the Rat King take two (`turnsPerRound: 2`). Tip: "(a few bosses take two)"; the line was rewritten. Test: a two-turn
   boss gets two initiative entries, and the real act 1 bosses have `turnsPerRound: 2`.
2. **Wind-up tips were boss-only and promised "the boss's next turn"**: five elites keep a signature wind-up (Mimic, Mama
   Owlbear, Red Dragon, Death Knight, Pit Fiend) and ⏳2 wind-ups (Disintegrate, the act 1 bosses' two-turn rounds) land
   a turn later. "Enemies act … without warning" now says only bosses and a few elites wind up first; the landing tip
   says "(⏳2: the one after)"; the interrupt / anchor tips are about whoever winds up. Tests: a `turns: 2` wind-up only
   counts down on the owner's next turn and lands on the one after (mutated to `turns: 1`: fails); a stun interrupts an
   elite's wind-up.
3. **"Round {n}. Everybody gets a fresh attack of opportunity"**: ranged units never make one → "Every melee fighter".
4. **Level-ups were not last** in 6 choices (Mimics "Share", Career Fair internship, DMV "Wait", the rap duet, Corelos
   "Read every clause", Marwyn's mirror): the leveled hero paid a share of the *new* max HP, not the one on screen when
   choosing. Reordered. Test: in 4 rotation choices the leveled hero's loss is a share of the pre-level max (DMV mutated
   back to level-first: fails).
5. **Dice goblin's natural 1** claimed "Everyone loses 5 HP" (event damage stops at 1 HP): the outcome names no number;
   the chips show it.
6. **The HUD's provoke preview exists now** (the author's known issue was stale): new tip "Paths dodge attacks of
   opportunity when they can. Hover a tile first: a red path with ⚔ marks shows who still gets a free hit." Tests: a
   walk past a grunt goes round its reach (no provoke, no hit) and from next to it `Combat.provokes` names the grunt and
   its damage; the HUD half is `combat_hud.js` `provokeInfo` (red path, ⚔ previews). Rewording the tip fails the match.
7. **A lost protect objective narrates `defeat`'s TPK lines** while heroes stand and the run goes on: new key
   `objective_failed` (8 lines, no tokens; static checks incl. "never says everybody is down") and a Request to
   `combat.js` (Deviation 3).

### Not changed (judged fine)
- `combat_start` "Everyone gets one turn per round, monsters included." (normal fights only: no two-turn bosses there);
  flavor lines about "no warning" (`enemy_turn`, `initiative`) describe ordinary monsters.
- Stand-in pronouns in debug-forced hero events; `initiative` with `{hero}` = 'the party' (only a fight with no hero).

### Results
- Isolated (`suite=narrative&isolate=events,narrator,narrative`): 12/12 pass, 12,610 assertions. With all content
  (`suite=narrative,content:,run: every registered event,ui: flow`): 24/24 pass, 29,515 assertions.
- Full run (`bash tools/test.sh`, 800 suites, 115,555 assertions): all 12 `narrative:` suites pass, no swallowed errors.
  2 failing sections, both `integration` (not ours): v1 unlock conditions / "ten real heroes" vs the all-unlocked
  16-hero roster (8 asserts), and "no XP" in the Objective Failed step (1). `tests/balance_tests.js` is missing from
  the load (BALANCE's file).

## Balance (v2, gold-equivalents)

Model: gold 1, 1% of party max HP 1, **a level-up 100** (HP growth + a Blessing roll + a learn / upgrade / perk), items
40 / 80 / 150 (cursed 25), consumable 25, scar −45, Blessing roll 40, upgrade or learn 60, fights 0 (a won fight brings
its own level-up and loot, against real risk in v2's "hard but fair" fights).

| event | choices (EV) |
|---|---|
| Session Cancelled | rest 50 · job 40 · homebrew ≈100 (+30% fight) |
| I Check for Traps | check 25 · sprint ≈25 · toughest ≈29 |
| Mimics Anonymous | share ≈90 · Kevin ≈72 · peek 20 (+50% elite) |
| Career Fair | internship ≈85 · seminar 60 · pens 30 (+50% fight) |
| Extremely Overdue | read 60 · return ≈80 · burn ≈40 + elite |
| Infernal DMV | wait ≈80 · cut 80 + fight · bribe ≈40 |
| Behind the Screen | read ≈100 (+50% elite) · swap ≈30 · Cheetos 50 |
| Rap Battle | bars ≈50 · duet ≈90 · roast 40 + fight |
| Patron | sign ≈55 · read ≈94 · tear 60 + fight |
| Mirror | Blessing 40 · flex ≈30 · bring ≈85 (named) |
| Rat Union | contract ≈75 · lab ≈30 · bust 100 + fight (named) |
| Kiri | ceiling 30 · everything ≈48 (+40% fight) · "Both." 40 |
| Betty | contest ≈45 · buffet 35 · advice 60 |
| Basanos | pay 40 · watch 100 + fight (named) · blame ≈20 |
| Valdris | hair ≈105 · forge ≈74 · pray 40 |
| Hjalmar | prank-off ≈42 · steal 60 + fight · prank the party ≈33 |
| Pebbles | show ≈36 · agility 60 (+40% fight) · pet 30 |

Level-up choices are the strongest in their events on purpose (they are the rare "experience" moments) but each costs
HP, gold or risk; about a third of the events offer one, and a typical run meets two or three of them on top of
~16 fight level-ups. Valdris' hair is the one big trade (a sure legendary for a permanent scar).

## Requests (Nov 3) — Onyx, new tips (CONTENT SWEEP, shared)

- **Onyx**: no event or narration line named Josiah's raven; the Plague-Rat Union intro now gives Onyx a cameo ("Onyx,
  Josiah's raven, eyes the picket line like a buffet.").
- **Tips** (+4, 83 now): flyers ignore the floor (clouds and explosions still get them); "Shoot the barrel" (any
  single-target attack, blast kills are environmental: +20 Hype); a single-target heal aimed at a downed ally gets them
  up with the healed HP; turning the map (hold the mouse wheel and drag, Q / R, Home). Plus an idle-DM line about Q / R.
- `tests/content/narrative.js` (the narrator's tests; no other agent owns them in this sweep): the tips suite checks the
  three gameplay tips in-engine (sections "heals get the downed up", "shoot the barrel", "flyers ignore the floor"); the
  map-turning tip is SOURCE_ONLY (js/render/input.js: middle drag, Q / R, Home).

## History (v1, kept short)

The v1 pass (29 events, 49 tips) and its adversarial review (2026-10-31) fixed: culprit-less "gravity" sentences,
broken outcome sentences ("learns Fetch!.", "X and X"), dominated choices (traps, dragon yard sale, Glimmerjaw, the
patron's free upgrade, the sculptor's free gold, flat HP costs), near-repeat narration lines, and inexact tips. Those
regression checks are all still in the suites.
