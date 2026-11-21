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

- ~~**Lead (ARCHITECTURE §3.10)**: add `initiative` (token `{hero}`: the first hero in the order or 'the party') to the
  narration key list; DESIGN §11 lists the hero events of the first ten heroes only (the six new ones are above).~~
  Done (Nov 5 docs cleanup): ARCHITECTURE §3.10 lists `initiative`, `objective_failed` and `opportunity`; DESIGN §11
  lists all 18 hero events.
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

## Docs and content cleanup (Nov 5) — the `opportunity` key

- **Added** narration key `opportunity` (an attack of opportunity): 10 token-free lines in `narrator.js`
  (`TOKENS.opportunity = []`: either side can swing and the caller may pass nothing, so no line names anyone; no
  pronouns). `tests/content/narrative.js` lists it in `NARRATION_KEYS`, so the static suite checks it like every key
  (8+ lines, length, no v1 talk, no near-repeats, tokens). It is not in the "narrated in practice" list: nothing fires
  it yet.
- **Request — ENGINE (`js/engine/*`, the attack-of-opportunity code)**: decide whether and when to narrate it, e.g.
  `DD.Act.narrate('opportunity')` on the first attack of opportunity of a fight (or one in N), so the DM's caption
  doesn't repeat every round. Pass no vars (or add a token to `TOKENS.opportunity` together with lines that use it).
  Once it fires, add `'opportunity'` to the in-practice `expected` list in `tests/content/narrative.js`.
- ARCHITECTURE §3.10 now lists `initiative`, `objective_failed` and `opportunity`, with the token contract.

## Review (balance run)

- Verified in the browser: `opportunity` has 10 lines, `initiative` 9, `objective_failed` 8; 66 keys; 79 tips (DESIGN
  §11 says 79). The `opportunity` lines are true to DESIGN §4.2 (leaps, teleports and shoves never provoke; one strike
  per attacker per round) and name nobody. Every key in ARCHITECTURE §3.10 has 8+ lines; the content keys with fewer
  (boss banners, Syllamin's roasts) are narrated by their own code, as §3.10 says. 35 content events (+ the run layer's
  fallback = 36 registered), 18 hero events (Slate and Buga two each), as DESIGN §11 says.
- Still open: nothing fires `opportunity` (engine request above).

## Rules run (Nov 6) — moving through allies, swapping places, breaking things (CONTENT SWEEP, shared)

User: "I find heroes get congersted when terrain is around" · "Yes, add swap" · "objects should be targetable to break
them". Tips (each checked in-engine in "narrative: tips"):
- new: "Heroes walk straight through each other, and monsters through theirs. Nobody can stop on an occupied tile, though:
  that is a hug."
- new (Nov 10, finishing pass): "No attack can be aimed at the DM's laminated screen (Smash it up close, or blast it) or
  at what you swore to protect. Even the snacks." (tips stay ≤ 140 characters; checked: the panel is no
  target even from next to it, Smash is offered, a blast hurts it; the Snack Bowl is no target; a keg is, until it is
  the protect objective's)
- new: "Stuck behind the wizard in a corridor? Click them while moving to swap places. It costs a move. The wizard pretends
  not to mind." (the click is the HUD's, per the decisions file; the engine part is checked: cost, trade, undo, no swap
  with a downed ally or a foe)
- new: "Most things with HP are fair game: hit the crate, the totem, the Spore Pod next to three goblins. Property damage
  is still damage."
- changed: "Pushes, pulls, teleports, jumps, dashes and swapping skills never provoke attacks of opportunity. Only walking
  (or a swap move) does." (the swap move provokes like a step — checked) · "Adjacent heroes can Smash objective objects
  like totems: 1 AP for 5 damage. Or just hit them with any single-target attack."
No swap narration: the engine logs its own quip ("X swaps places with Y. <quip>") and uses the `move` bark; a hook is
requested below.

Cross-content check (Nov 10, `tests/content/integration.js`): "integration: rules run — every breakable content object
decides targetable, its desc says so, and the party's aim agrees". Every object with HP registered outside
`js/data/terrain.js` states `targetable: true | false` (volatile ones excepted: they detonate), its desc gives its HP and
says "any single-target attack" (targets) or that attacks are never aimed at it (opt-outs), and a 4-damage bolt agrees
from 1 and 3 tiles (target entry, preview text, the hit itself). Today: targets `sla_boulder`, `a1_strike_fund`,
`a2_bone_pile`, `a2_bone_wall`, `a2_chafing_dish`, `grim_cabinet`, `lich_shelf`; opted out `dm_screen_panel`,
`a2_coffee_machine`, `a3_snack_bowl` (plus the Rocky instance, `passives.js`). DESIGN §4.6 now says destroy objectives
take any single-target attack and protected objects are never aimed at.

### Requests (rules run)
- **Engine (`js/engine/actions.js` / `combat.js`)**: a content hook for the swap's comedy — e.g. `Act.maybeBark(mover,
  'swap', p)` (falling back to `move`) and/or the quips read from `DD.Narrator.LINES.swap` when present — so heroes can
  have swap barks and the narration owner can write the lines. Optional.
- **HUD**: the swap tip says "Click them while moving"; if the swap gesture ends up different, tell the narrative owner
  (`js/data/narrator.js`) so the tip follows.

## History (v1, kept short)

The v1 pass (29 events, 49 tips) and its adversarial review (2026-10-31) fixed: culprit-less "gravity" sentences,
broken outcome sentences ("learns Fetch!.", "X and X"), dominated choices (traps, dragon yard sale, Glimmerjaw, the
patron's free upgrade, the sculptor's free gold, flat HP costs), near-repeat narration lines, and inexact tips. Those
regression checks are all still in the suites.

## Playtest fixes (Nov 12) — fix:ui (narrator.js)

- hero_downed: "{hero} is down, and {enemy} is far too pleased about it." (was "…looks far too proud of itself": it misgendered
  the bosses and, with a hero credit, the heroes) — bosses-objectives-10.
- New keys `hero_downed_self` ['hero'] and `hero_downed_friendly` ['hero', 'enemy' = the ally] (8 lines each, no pronoun for
  {hero}) for self-downs and friendly fire (text-tone-5; the engine picks them: request in docs/notes/hud-v2.md).
- Tips: flyers "still pocket gold" (text-tone-v1); a forgotten skill "goes back in the pile" (heroes-v2).
- act_intro_3: the "load-bearing" Cheeto dust is now "It has seniority." (text-tone-23, my one line of the 14).
- tests/content/narrative.js NARRATION_KEYS lists the two new keys.

## Playtest fixes (Nov 12)

Confirmed playtest findings that live in events.js (fix:content; narrator.js is fix:ui's):
- **text-tone-11 (events part, fixed)**: the Dice Goblin says "You roll an 8 / an 11 / an 18." (`an(x)`).
- **text-tone-12 (fixed)**: Glimmerjaw's Discount Bling: Zarathor only "puts it on immediately" when the item really went
  onto him (`heroItemRec(...).worn`); otherwise he "holds it up to the light, promises to wear it later, and puts on his
  sunglasses anyway. Indoors." plus where it went ("It goes into the bag." / "X wears it for now."). The choice label is
  item-agnostic: "Buy the shiniest thing on the cart." (the item is a random rare, rarely a chain).
- **text-tone-19 (events part, polish, fixed)**: `tally()` pluralises ("two Frost Flasks", "two Buckets of Ice Water",
  "two flasks of Holy Water"); Mayor Buga's debate ends "…turns out to be Chain of Office (Gold-Plated). It goes into the
  bag." (no "(Gold-Plated) (into the bag)"). `heroItem` keeps its old one-phrase form for every other call site;
  `heroItemRec` returns { name, worn, where, after }.
- Test: `narrative: playtest fixes (Nov 12)`.
- The tips suite follows fix:ui's reworded flyer tip (text-tone-v1: "…Clouds and blasts still hit them. They still
  pocket gold.") and now checks that last sentence in-engine (a flyer pockets a gold pile and a Hoard Pile).

## Finish (Nov 14) — FIX: CONTENT (narrator.js and the narrative suites)

- **audit-2 (fixed)**: `narrative: tips`, section 'difficulty', builds the brutal tip's numbers from
  `DD.Balance.difficulty.brutal` (and the extra enemy from `DD.Balance.extraOf`), checks the engine reads the same row,
  and that a brutal regular fight really brings one more grunt. The tip text was already true (the audit fixed it).
- **D7**: narration key `swap` (8 lines, tokens hero + ally); `narrative: narration` knows the key and fills `{ally}`.
- **D1**: the barrel and Smash tips say "any single-target damage skill" (both now ≤ 140 chars).
- **bosses-objectives-10**: not reproduced (the hero_downed line was rephrased in the pre-balance run; the engine picks
  hero_downed_self / hero_downed_friendly for self-owns and friendly fire).
- **D2 (content side)**: a tip in the rule's words: "Slate is immovable: he can start a swap with an ally next to him,
  but nobody can swap with him. Walk around the golem." (`narrative: tips` checks it in-engine: Slate swaps with the
  mage, the mage can't swap with Slate.) The DESIGN text is the docs owner's.

## Review (finish, Nov 14) — REVIEWER

- D7: the `swap` lines and every hero's swap barks name no other hero — now really checked: `kit: finish D7` built its
  name test as `new RegExp('\b' + w + '\b')` (a backspace in a string, so it could never match); it uses `'\\b'` now and
  the lines pass. The D1 / D2 tips read right ("aim any single-target damage skill at an explosive barrel", "Slate is
  immovable: he can start a swap …").

## V3 — act IV "Under the Table" and the 17th hero (NARRATIVE, Nov 14)

Plan `.tmp/v3/design.md` §4.9, §5.1-§5.2, §5.5-§5.8, §8.2 row H, §8.4 NARRATIVE; the voice of `.tmp/v3/design/voice.md`
(V) §3.3, §4.3-§4.4, §5.5-§5.6, §6, §7, §9.3-§9.6, §15; the goats addendum §15 / §17.7; the Benedick addendum §19.

### Files
| File | What |
|---|---|
| `js/data/svammiel_lines.js` (new) | every `svam_*` pool of plan §5.2: `svam_twist` (exactly the user's line), `svam_twist_react_<hero>` ×17, `svam_twist_panel` (new: V §4.3 step 7), `svam_cameo_<lane>` ×5 (8 each; the goats' verbatim), `svam_hero_<hero>` ×17 (6 each), `svam_back_<hero>` ×17 (3 each), `svam_sit_<situation>` ×19 (the keys svammiel.js `situation()` names), `svam_generic` (8), the interjections `svam_phase / _down / _env_kill / _signature / _long / _countered` (6-8 each: one per fight of the act, review V3) and `svam_member_down` (4), `svam_phase_goats` (2), `svam_sulk_<lane>` ×5 (2), `svam_bribe` (3), `svam_reason` (16), `svam_quip_<cheat>` (2; R4 Skill Ban 3 with the Radio Edit callback) and `svam_counter_<cheat>` (1) for all 25 cheats of svammiel.js (5 cameo incl. the Radio Edit, 12 round, 2 snap, 6 phase). The catalogue `DD.SvammielLines` (`HEROES`, `LANES`, `SITUATIONS`, `CHEATS`, `KEYS`, `TRIGGER`, `all()`) serves the suites. |
| `js/data/narrator.js` | the V3 keys in `TOKENS` / `LINES` (`act_intro_4` 8, `act_clear_twist` 3, `twist_loot` 1, `campaign_won` 3, `victory_final` 3, `tips_act4` 19, `run_start_seen` 3, `svam_defeat` 2, `svam_phase2` 2, `svam_phase3` 2) and `DD.Narrator.V3_KEYS`; `DD.Narrator.VARIANTS`: 19 `@a4` pools (`boss_start, round_start, enemy_turn, initiative, victory, defeat, hero_downed, level_up, idle_dm, shop_greet, shop_buy, shop_broke, shop_leave, tavern_greet, rest, recruit, map_enter, gameover_title, victory_title`); the six foreshadowing lines (V §3.3) in `idle_dm` ×2, `act_clear`, `boss_start`, `act_intro_3`, `victory`; `badTokens` holds an `@a<act>` key to its base key's tokens (the wave-0 request). |
| `js/data/events_act4.js` (new) | 7 events, ids `ev_a4_*`, `acts: [4]`, no `api.combat`: The DM's Support Group, Svammiel's Suggestion Box, League Recruitment Drive (Skylla, and Zarak mouthing "ORC"), The Coven's Bake Sale, Galbraith's Book Signing, The Gardener's Compost Heap (plan §5.6), Herd Mentality's Merch Table (the optional seventh, addendum §17.7). |
| `js/data/events.js` | `ev_ben_bistro` "Le Bistro Escargot" (the Benedick addendum §19.1: acts 1-3, weight 2, `withHero('benedick')`, he/him, nothing about act 4). |
| `tests/content/svammiel_lines.js` (new) | 10 suites `svammiel_lines: …` |
| `tests/content/events_act4.js` (new) | 4 suites `events_act4: …` |
| `tests/content/narrative.js` | `HERO_EVENTS` / `HERO_NAMES` += benedick, `V3_ONE_EVENT_HEROES = ['benedick']`, the bistro's outcome checker; `ours()` = the classic events (the registry suite checks every `ev_*` is classic or `ev_a4_*` with `acts [4]`); the static key table includes the V3 keys; 4 new suites `narrative: V3 — …`. |

Run: `tools/test.sh "suite=svammiel_lines,events_act4,narrative&isolate=narrat,svammiel,events"` (one Chrome run).

### What the suites check (plan §8.4 NARRATIVE)
- `svam_twist` is exactly "You thought this was over? I, SVAMMIEL, CONTROL ALL."; the cameo plays it at the act-3 victory.
- Coverage from the registry: every id of `DD.defs.heroes` (and the V3 roster) has ≥ 6 roasts, ≥ 3 comebacks and a twist
  reaction, so an 18th hero fails loudly; Benedick's are the addendum's, verbatim; every door lane (the plan's five and
  the registry's) has 8 announcer lines and 2 sulks; every gauntlet encounter's `cameo.start` pool exists; every cheat of
  the svammiel cameo (and the plan's 25) has 2+ quips and a `DM (whispering): "…"` counter; the goats' pools verbatim.
- Shape: bubbles ≤ 70 (≤ 92 filled with the longest names), counters ≤ 160, tokens only where the trigger fills them
  (`{hero}` in roasts, the down / signature / env-kill interjections and the hero situations, `{name}` in
  `svam_sit_fallen`, `{enemy}` / `{n}` where cameo.js fills them), no pronoun after a token-named hero, uppercase
  starts, no v1 talk, no line in two `svam_*` pools (C5's `svam_finale_open` included), no count of doors.
- The party filter: a roast names its hero in exact case and nobody else; comebacks and reactions name no other hero;
  every other pool names no hero, "Mayor" / "Professor" included; in a fight `DD.Act.partyLines` keeps exactly that.
- Pronouns: each sentence naming one act-4 character (Svammiel, the Gardener "it", Galbraith, Skylla, Kelek, Zarak,
  Warduke, Zargash, the three hags, Billy Bleatz, Lil' Kid, DJ Turnip, Ursa Verse, the DM) across every V3 line and the
  act-4 events; the heroes' own pronouns in their roasts; an advisory log over other owners' act-4 pools.
- Tone: no dialect markers, never "black", Zarak is the dwarf who says orc, no draft League names.
- The svammiel cameo (C5) finds every pool: its prefixes, `DD.Cameo.keyOf`, each trigger key, each door's sulk through its
  `keyOf`, every cheat, every situation.
- A run never repeats a line: the real `DD.Cameo` plays the start cameos of every door (the registry's ∪ the plan's five)
  and the finale for 7 runs with the roster rotated (quiet runs: hero roasts; busy runs: every situation), barks included.
- Act-4 display names (enemies, skills, statuses, objects, surfaces, cheats with `svam_ gard_ lg_ gal_ cov_ rap_` ids)
  never equal a hero-side, classic or other-door name, nor Benedick's reserved names (one family may repeat its own: the
  cameo's and the finale's "The Floor Is Lava").
- narrative: the V3 keys' counts and shape; the 19 variants (≥ the plan's counts, base tokens, ≤ 160 / titles ≤ 50, no
  hero named, no count of doors, no near-repeats); the plan's exact lines; the foreshadowing; `DD.narrationKey` and
  `DD.narrate` in an act-4 vs an act-2 sandbox fight; every act-4 tip checked in-engine or in the registry (skipped with a
  log while its content is missing; the rug tip is source-only), gated (not in `tips`; `run_start_seen` not in
  `run_start`), the order tip count-free, the goats' four; spoilers: no classic pool (every author), classic event or
  Benedick text names Svammiel / Act IV / a fourth act.
- events_act4: registry and copy (the v2 rules), `acts [4]`, never a fight (the resolve source and in practice), gold
  gates, enough events for the registry's event stops; every choice over 6 seeds against its hint; offered only in act 4
  (and `pickEvent` never draws one in act 2); outcomes name heroes without pronouns, full pockets, 1-HP heroes.

### Deviations (from the plan / V, each with its reason)
- **Count-free text** (plan §8.1; five doors, and any later count): V's "Four of his favourites" (act_intro_4) → "All of
  his favourites"; map_enter "four rooms" / "Four doors" → a room for each favourite / "A row of doors";
  `svam_sit_last_mini` "Three down?" → "All my toys but one?"; generic "Four heroes. Adorable." → "A party this size?" (a
  party can be smaller); the League's "Five against four" → the Zarak gag; recruit "act four" → "the last act";
  campaign_won "Four acts…" → "One campaign…". A lint keeps counts out.
- **Tips stay true**: tip 1 says "every door is a mini-boss" (Svammiel is the floor boss) and "marked tiles" (the v1-talk
  lint bans "red tiles"); tip 3 says "his round cheats" are announced a round ahead (snap and phase cheats aren't).
- **Every roast names its hero** (the party filter, and the bubble must say who): V's Marbles kung-fu line, Ellaria's
  corgi line and Zarathor's tiefling line now name them.
- **No line twice in a run**: the Coven's "…zero chill" → "They share. You won't." (the goats' verbatim announcer has
  it); R1's quips don't reuse the cameo lava's line; Sparrow's and Hjalmar's roasts reworded off C5's named barks;
  Pebbles' carpet line → the tavern rug; Sparrow's twist reaction (V's echoed her comeback); campaign_won does not repeat
  `svam_defeat`'s line (both show within seconds), and `svam_defeat` #2 is new for the same reason.
- **Honest quips and counters**: The Tilt's quip no longer says "toward my throne" (the direction varies); Moving Costs
  Extra's no longer says "2 AP" and Hype Confiscated's no "fifty percent" (knobs); counters quote no knob and name no
  hero (cameo.js runs counters through the party filter: C5's fallback lava counter naming Pebbles vanishes without him).
- `svam_long` "Round eight?" → "Round {n}?" (the trigger fires from round 8, maybe later); `svam_countered` fits its
  trigger (an interrupted wind-up, not a countered cheat); `svam_member_down` avoids a singular "them".
- New key `svam_twist_panel` (V §4.3 step 7's three lines; META-UI may read it). `victory_final` is Svammiel's last word
  (the plan's 😈 line first), `campaign_won` the DM's narration (V §9.6). `svam_phase2/3`: two lines each (V: one).
- Events: ids `ev_a4_*`; hints in the v2 wording ("Pay 10 gold." gates its choice; V had "Spend"); the League event is
  Skylla's (Baba Yaga signs the pay) with Zarak mouthing "ORC"; texts trimmed to 2-5 sentences (the Bake Sale sign, the
  Book Signing's "Vol. CCCXII" → "(Volume 312)"); a 1-HP hero says "ow" instead of "loses 0 HP"; the Compost Heap's
  sprinkler → garden shears (the plan cut the sprinklers).
- `ev_ben_bistro`: "a salad that Benedick insists on finishing personally" (no pronoun a stand-in could get wrong) and
  the review prints the gold the chef really paid (a gold Blessing raises it).

### Requests
- **C5 (`svammiel.js` `situation()`)**: situations crowd out the hero roasts. In a real act 4 nearly every start cameo
  finds one (first; mvp / downed_last after every fight; from_* at 50%; rich with act-4 gold; last_mini…), so the
  heroes' roasts and comebacks ("every hero gets the last word") rarely play. V §6.2's rule of thumb is 2-3 situations
  and 2-3 hero roasts a run: e.g. at most every other start cameo is a situation (first and last_mini excepted), or the
  deterministic ones at 50% like from_*. (The no-repeat suite plays quiet and busy runs either way.)
- **META-UI** (`title.js`, `gameover.js`, `map.js`): `tips_act4` join the loading tips after the `seen.bosses.svammiel`
  gate; the four-act final victory shows `campaign_won` (DM badge) then `victory_final` (😈); `act_intro_4` on the Act IV
  banner; optional: `svam_twist_panel` for the Twist panel's Svammiel line (V §4.3 step 7).
- **META-RUN** (`run.js newRun`): after the gate, `run_start` draws from `run_start` + `run_start_seen` (plan §2.6).
- **C1 / C3 (any door with a phase)**: `DD.Cameo.say('svammiel', 'svam_phase')` at the phase change; **C6**:
  `DD.Cameo.say('svammiel', 'svam_phase_goats')` at the bear's entrance (both pools exist).
- **Lead (`js/loader.js`)**: the wave-0 isolate request (P9) still stands; until then `svammiel_lines.js` and
  `events_act4.js` load in every isolated run (harmless: they only register lines and events).

### Known issues
- Full run (Nov 14): 1132 suites, one failure outside this area: `kit: finish D1 — object texts and tips say "any
  single-target damage skill"`: `lg_body` (C2, `league.js`, in progress) lacks the D1 wording. The MapGen "unknown theme
  a4_lair / a4_underfloor" warnings are MAPGEN's act-4 themes, not landed yet.
- The act-4 tip checks for the Gardener, Galbraith, the Coven and the goats skip (logged) until those files land; the
  no-repeat and coverage suites play Benedick with a fixture stand-in until his file lands.

## Review (V3) — adversarial review of the narrative work (Nov 15)

Verdict: **fixed** (7 findings fixed in this area, each with a regression check; the rest passed on below). Checked by
running code: the owned suites, the full `tools/test.sh`, a scratch harness (since removed) that played 12 whole act-4
gauntlets through `DD.Run` + `DD.AutoPlay` (`campaign.acts` 4, `startAtAct(4)`, every door plus Svammiel; every cameo
and narrator log line and every bark dumped) and 4 act-3 runs through the DM (acts 4: the twist; acts 3: no twist), and
one shot (`debug=1&acts=4&act=4&screen=event&event=ev_a4_book_signing`).

### Fixed (most severe first)
1. **Act-4 in-fight narration was false at Svammiel's own fight.** The `@a4` variants play at every act-4 fight, the
   finale too: the transcript showed "Mini-boss! Down here everything is a mini-boss…" opening `boss_svammiel`, "The
   mini-boss acts. Somewhere, Svammiel applauds." while he stood on the board, and victory lines about "the mini-boss",
   "another favourite toy" and the loot table at the campaign's end (the finale pays no loot). Rewritten so every line
   of `boss_start / round_start / enemy_turn / victory / hero_downed @a4` holds at the doors and at the floor boss;
   `act_intro_4` "Every fight down here is a mini-boss" → "Every door down here hides a mini-boss"; `level_up@a4` "the
   next mini-boss's HP" → "the next fight's HP". Lint in `narrative: V3 — the act-4 keys…`.
2. **Pronoun**: `boss_start@a4` "This one winds up its big moves" played at Galbraith (he), Svammiel (he) and the squads.
   Now "Down here the big moves get wound up first". Same lint (`its`, "This one").
3. **Interjections repeated within a run.** Act-4 fights run long, so `svam_long` (2 lines) played 52 times in 12 runs
   (4.3 a run) and the run memory reset the pool: 24 repeated cameo lines in 12 runs, in 11 of them. Every interjection
   that can fire in any fight now has a line per fight of the act (`svam_phase` 6, `svam_down` 8, `svam_env_kill` 6,
   `svam_signature` 6, `svam_long` 7, `svam_countered` 6; `svam_member_down` 4 for the squad doors). After: **0
   repeats** in the same 12 runs. The suite's "2-3 interjections" check is now a registry floor (doors + the finale).
4. **`svam_down` said the hero was still lying there** ("napping on my floor", "…Stay."), but `unit:downed` is emitted
   after the `onDowned` hooks, so an instant revive comes first: the transcript logged "Sparrow is back up" and then
   "Sparrow is napping on my floor". Every line is now about the fall itself; lint. (RULES request below.)
5. **`svam_countered` "{enemy} had a whole bit planned!"** made Svammiel name himself in his own fight (his bark:
   "Svammiel had a whole bit planned! Rude."). Replaced by lines that fit both; lint (no `{enemy}` in that pool).
6. **Tip "The DM whispers a counter for every cheat in the combat log" was false**: `svammiel.js` whispers none for the
   snap cheats (`spendSnap`: Reroll!, That's a 1 Now) nor for the silent phase chips (Cutscenes, Pencilled HP, My REAL
   Dice); their pools exist but never play. Tip now "The DM whispers counters to Svammiel's cheats in the combat log…";
   the tip check also plays `DD.Cameo.cheat('svammiel', 'svam_rule_zero')` in a sandbox and finds the whisper in the log.
7. **Galbraith's Book Signing**: the typo "spells "Galbraith" with one L" is the correct spelling (his own death line
   insists on "one L"). Now "with two Ls"; the event checker asserts it.

### Verified (no change needed)
- `svam_twist` exact, through a real run: the DM falls, "You thought this was over? I, SVAMMIEL, CONTROL ALL.", the
  narrator's table shake and "Oh no. That's my DM.", a hero's reaction bark, `twist_loot` as the DM's rewards text,
  `act_clear_twist` on the act clear, act 4 next; with acts 3 the DM ends the run as v2 (no cameo, no twist).
- Tips (19): each re-read against the landed boss files (Counterspell is spell-only, corgi attacks are `attack`; vines
  `plant` + fire weakness; `lg_body` + Spiteful Revival; the Eye-holder's death splits the turn; Help Up 2 AP; Hay
  Bales / Barn Posts block sight, WHAT?! needs none; the bear at the goats' combined half HP; act-4 prices ×1.25).
- Benedick's six roasts, three comebacks and twist reaction are the addendum's verbatim and he/him; `ev_ben_bistro` acts
  1-3, his name in the text, nothing of act 4. The goats' Svammiel pools verbatim; the Radio Edit quips / counter and
  the R4 callback present. League lines: Kelek's Staff of Power / Ringlerun, Zarak the "dwarf" who says orc, Skylla's
  Baba Yaga. Ship dark: the act-4 events, tips and `run_start_seen` stay gated; the classic pools name nothing of act 4.
- Act-4 events through the run API (the suite's 6 seeds a choice) and on screen (the shot: text and hints fit).

### Passed on (not this area's files)
- **C5 `situation()` starves the hero roasts** (the narrative request, now measured): 12 of 12 simulated runs played
  **0 hero roasts** in 72 start cameos (a situation matched every time; `mvp` follows every fight). Every hero's six
  roasts (Benedick's included) never play; comebacks come only after `mvp` / `downed_last`. V §6.2's rule of thumb is
  2-3 situations and 2-3 hero roasts a run.
- **C5 / RULES: the door sulks are budgeted** (a `quip` interjection): 10 sulks in ~55 door wins, the goats' and the
  League's ~0-1 in 12 runs. Suggest `force: true` on the `sulk` trigger (it ends the fight; the budget is for mid-fight).
- **RULES (`cameo.js`)**: `heroDowned` should skip a hero no longer `downed` (revived by an `onDowned` hook).
- **C5**: whisper the counters of the snap cheats and of the phase-3 chips (the pools exist), then the tip can say
  "every" again.
- `svam_signature` never played: AutoPlay fired 3 signatures in ~66 act-4 fights (BAL / AutoPlay, informational).
- **META-RUN**: `run.js newRun` still ignores `run_start_seen` (plan §2.6). **Lead**: the `js/loader.js` isolate filter
  for `svammiel_lines.js` / `events_act4.js` (P9) is still open.

### Numbers
- Owned suites: 31 suites, 22,905 assertions, 0 failures. Full run: 1227 suites, 143,159 assertions, 0 failures.
- The 12-run harness: before 24 repeated cameo lines (11 runs), after 0; interjections per 12 runs: `svam_long` 52,
  `svam_member_down` 32, `svam_down` 29, `svam_phase` 22, `svam_countered` 18, `svam_phase_goats` 10, `svam_env_kill` 6,
  sulks 10, hero roasts 0.

## QA fixes (Nov 17, QA FIXER content cluster; the full list: docs/notes/boss-svammiel.md "QA fixes (Nov 17)")
- `js/data/svammiel_lines.js` counters: **voice-1** That's a 1 Now (cameo) says "the first big hit on him"; **FIGHTS-05**
  the counters whispered at an announcement (No Healing, No Signatures, Hype Confiscated) never say "this round" early;
  **FIGHTS-06** the Coven lava counter says it never burns a hag. **voice-4**: the Skill Ban "radio edit" quip stays in
  `svam_quip_svam_ban`; svammiel.js plays it only after the Radio Edit landed this run. Suite "svammiel_lines: QA".

## h19 — heroes 18-20: Rasma, Biz and Phat Gus (H19-VOICE, Nov 18)

READY: h19 voice pools

Every per-hero line other files carry for the three, landed before their hero files (plan D5), verbatim from the judged
addenda: Rasma `.tmp/h19/addendum-rasma.md` §19, Biz `addendum-biz.md` §19, Phat Gus `addendum-gus.md` §20 (each line
measured ≤ 70; the longest is Galbraith's Rasma line, 69). Grant: ARCHITECTURE §1 "h19", H19-VOICE.

### Files
| File | What |
|---|---|
| `js/data/svammiel_lines.js` | `HEROES.rasma` / `.biz` / `.gus`: 6 roasts (each names its hero in exact case: "Rasma", "Biz", "Gus" / "Phat Gus"), 3 comebacks in the hero's own voice, 1 twist reaction. Act-4 only, like every pool here. Rasma says "sir" only in his comeback to Svammiel (he). |
| `js/data/bosses/svammiel.js` | `barks.named` + 3: "Stop bowing, Rasma! Just HIT me like a normal bull!", "Biz, your spider is in my EAR! Get it OUT!", "Put DOWN the acorn, Phat Gus! That's MY floor's acorn!" |
| `js/data/bosses/goats.js` | `DISS` / `CLOSE` / `BACK` `.rasma` / `.biz` / `.gus` (4 couplets `setup|punchline`, the setup names him; 2 closers; 2 comebacks in his voice); `BANTER` + `{ hero: 'biz' }` (Hjalmarino's cymbals) and `{ hero: 'gus' }` (the chewing, never his shape). Rasma's addendum has no banter. |
| `js/data/events.js` | `ev_ras_finishing_school` "The Finishing School" 🫖, `ev_biz_scrap` "Free to a Good Home" 🛠️, `ev_gus_picnic` "A Picnic for One (Squirrel)" 🧺: acts [1, 2, 3], `HERO_WEIGHT`, `hero`, `requires: withHero(id)`, 4-5 sentences, one free choice (40 gold), one risk / reward (50%), hints that name the hero, nothing of act 4. |
| `js/data/bosses/gardener.js` / `galbraith.js` / `coven.js` (Granny Gristle) / `league.js` | one named line per new hero (`NAMED`): the Gardener's three, Galbraith's three, Granny's three, Zarak's Rasma and Biz lines, Warduke's Phat Gus line. |
| `js/data/narrator.js` | verified, not edited (below). |
| `tests/content/svammiel_lines.js` | `ROSTER` + `rasma: 'Rasma', biz: 'Biz', gus: 'Phat Gus'` (stand-ins until the files land); `RESERVED` + the three kits' reserved names (addenda §19.5 / §19.5 / §20.5); the count lint + `eighteen|nineteen|twenty`. |
| `tests/content/narrative.js` | `HERO_EVENTS`, `HERO_NAMES` (`gus: 'Phat Gus'`), `H19_ONE_EVENT_HEROES` (joined to the one-event check), the three events' outcome checkers (`SPEC`), `NAMED_LEVEL_UPS` + `ev_gus_picnic` with `NAMED_HINT`, `COUNT_WORDS` + `eighteen|nineteen|twenty`, the no-act-4-spoiler walk over every real hero (Benedick's alone before). |
| `tests/content/boss_goats.js` | `ROSTER` + the three; the HERO-7 joke split per new hero (below). |
| `tests/content/boss_svammiel.js` | three exact-line asserts for the named barks (the count line ~141 is the contract's / integrator's, untouched). |
| `tests/content/boss_{gardener,league,galbraith,coven}.js` | the NAMES / ROSTER maps + the three; the gardener `heroWords` regex + `Rasma|Biz|Phat|Gus`. |

### The joke split (`boss_goats: QA voice-8 / HERO-7`, one check per new hero)
Each joke has one owner, asserted both ways (present in its owner's pool, absent from the other's): Svammiel's roasts
keep "monotaur", the apologies, the smudged monocle (Rasma); the warranty, the reboot ("off and on"), "hiding behind",
cold-blooded and the recall (Biz); the storage unit and the rent (Phat Gus). The goats' bars and closers keep the cup /
teacup / china shop, the blade colours, the cold shoulder (Rasma); the rapping robots, Spooder's name, tribute vs
knockoff, the button (Biz); burying acorns (Phat Gus). Comebacks (`rap_back_*`, the hero's own voice) are outside the
split, as for Benedick.

### Pronouns and tone (checked by hand and by the suites)
- Rasma, Biz, Phat Gus he/him everywhere. Hjalmarino and Spooder never get a gendered pronoun: "Hjalmarino claps its
  cymbals. It does not help."; Zarak's "Tell it I'm an ORC!"; the goats' "a key in its back". In "He shows it to
  Spooder." the "He" is Biz (plan D8's owner rule, not a pronoun for the construct).
- Rasma is formal and polite in every line of his ("I'm afraid I must decline your hospitality. Firmly."); "sir" only in
  the Svammiel comeback, "Gentlemen" only at the goats (he).
- Phat Gus is an actual squirrel (request.md): no hands, pockets or gear in any line; villains roast his snacking, his
  cheeks and the creepy trees, never his body; "fat" appears nowhere. The two borderline lines the lead kept stay
  (Granny's "lovely pie dish", the Gardener's "GRAZING IS PROHIBITED").
- No line names another hero (the party-filter lints in svammiel_lines, boss_goats and the four boss suites), and no
  line names one new hero next to another (plan D11). No "only" / "first" Haste or Confuse anywhere (D7).

### narrator.js tips (verified, no edit)
No new hop, immovable or pocket hero: "Professor Marbles, Betty and Hjalmar hop up 2 levels…" stays true (it names the
hopping heroes; Hjalmarino is a summon, and "monkeys: born climbers" covers it); Slate is still the only immovable hero;
"Josiah adds a fourth" pocket (Phat Gus never uses the pockets); "Summons act on their owner's turn" and "Tab cycles
summons" hold for Biz's constructs; "Summoned allies vanish when the fight ends" holds (they redeploy every fight); the
Confused tip is the status's rule, unchanged.

### Deviations
- **Rasma's event, the third label**: the addendum's "Demand satisfaction from the one with the dagger." is 49
  characters; the narrative suite caps labels at 40. Now "Challenge the one with the dagger." (34; the outcome still
  "challenges the goblin to a duel of manners").
- **Biz's event, "Dig for the good stuff."**: both outcomes start with `standIn(s)` and the damage is guarded with
  `if (s.idx >= 0)`, as in every other hero event (the addendum's two lines had neither; the suite needs the stand-in
  sentence when the event is forced open without Biz).
- **Phat Gus's named level-up**: the addendum's hint "50%: Phat Gus levels up. 50%: …" failed the narrative lint "a
  level-up is the rotation or a named hero" (it only knew hints that open with the name). `NAMED_HINT` now also takes a
  chance prefix, and `NAMED_LEVEL_UPS` lists `ev_gus_picnic` (4 named level-ups; the suite's cap is 4). DESIGN §11's
  rule holds: a named level-up is rare, in the hero's own event, and costs something (here a 50% risk of 30% max HP).
- **The three events' outcome checkers (`SPEC`)** are not named in the grant's list, but every event needs one ("has a
  checker for each of its choices"), as V3's voice owner added Benedick's.
- **The spoiler walk** reads a function item desc through `DD.skillDesc(d, 1, null)` (as the UI does, and as `kit.js`
  checks it with no holder) instead of `String(desc)`, which would stringify the function's source once every hero is
  walked; it adds the hero's `role`.
- **League**: addendum-gus gives Phat Gus's League line to "any member, he": Warduke says it (the League's professional;
  a "policy").
- `svammiel_lines.js` names suite: a clash with the reserved list is labelled "a hero-side reserved name (Benedick, h19)".

### Requests
- **h19 integrator (DESIGN §11)**: the classic events now number **39** (22 hero events + 17 generic); §11 still says 35
  (v2's count; V3's bistro made 36). The three events are named in §11 already.
- **h19 integrator**: nothing else of mine waits on the hero files. Once `rasma`, `biz` and `gus` register, the coverage
  loops (svammiel_lines, boss_svammiel's one-named-line loop, boss_goats' voice, the narrative stand-ins) read their real
  names, which match the lists here ("Rasma", "Biz", "Phat Gus").
- **Anyone adding a fifth named level-up**: the narrative suite caps them at 4 (`named.length <= 4`).

### Runs
All on a tree where none of the three hero files registers yet (the coverage loops play them with fixture stand-ins
under their real names):
- `tools/test.sh "suite=svammiel_lines&isolate=svammiel,heroes/"`: PASS, 11 suites, 4747 assertions.
- `tools/test.sh "suite=narrative&isolate=events,narrator,narrative,heroes/"`: PASS, 17 suites, 16065 assertions (the
  spoiler walk: 17 heroes, 2181 texts; the three logged as not landed).
- `tools/test.sh "suite=boss_goats&isolate=goats,heroes/"`: PASS, 20 suites (1 skip as before), 696 assertions (the
  joke split: 21).
- `tools/test.sh "suite=boss_svammiel&isolate=svammiel,heroes/"`: PASS, 26 suites (3 skips as before), 718 assertions.
- The four voice suites `boss_{gardener,league,galbraith,coven}: voice` (isolate `<boss>,heroes/`): PASS, 138 / 985 /
  118 / 446 assertions.
- Full `bash tools/test.sh`: **PASS — 1323 suites, 152638 assertions, 0 failures**, missing scripts none, 0 "Error in"
  lines (`.tmp/h19/voice/full_test.txt`).

### Review (h19) — `review:shared`, Nov 19
All three hero files registered (20 real heroes). Every new line read aloud: Svammiel's roasts, comebacks, twist
reactions and named barks, the goats' bars, closers, comebacks and banter, the three events and the optional named
lines. Affectionate, short and in the right names (Rasma, Biz, Phat Gus / Gus), he/him, Hjalmarino and Spooder only
ever "it" (Zarak's "Tell it", the goats' "a key in its back", "Hjalmarino claps its cymbals"), Rasma's "sir" only to
Svammiel and "Gentlemen" only to the goats, no villain line about Phat Gus's body, no dialect markers, no line naming an
absent hero, no "only / first" Haste or Confuse (D7), no act-4 word in a new hero's own texts.

**Fixed** (each pinned by the new suite "svammiel_lines: h19 review — …"; the old lines fail it):
- `svam_twist_react_rasma`: "Another villain? How thoughtful. I'd only just put the kettle on." was Benedick's
  reaction ("Another boss? Splendid. I'd only just arrived for this one.") in a waistcoat, against addendum-rasma §3
  rule 4 (Rasma is not Benedick). Now **"How marvellous, a second host! I'm afraid I'll need another cup."** (64; his
  "marvellous" and "I'm afraid", the cup). The suite bars Benedick's phrases and the "I'd only just" frame from Rasma's
  own lines and "sir" / "madam" outside his Svammiel comebacks.
- Galbraith on Phat Gus: "Eldritch powers, Phat Gus? I have TENURE in eldritch powers." opened with the same three
  words as Svammiel's roast "Eldritch powers, Phat Gus? I'm the eldritch power. …" (two act-4 villains, one run). Now
  **"Weird woods magic, Phat Gus? Quaint. I have TENURE in eldritch."** (63; Galbraith's "Quaint", the tenure kept).
- Granny Gristle on Biz: "Biz, dearie! I do love a cold-blooded boy." retold Svammiel's "cold-blooded" (the joke
  split gives it to him). Now **"Biz, dearie! Come fix Granny's cauldron. It's only a little cursed."** (67; the Coven's
  Family Cauldron, the handyman wanted). The suite checks every act-4 villain's named line for the three against
  Svammiel's openers (first three words) and his split jokes (12 lines).
- The no-act-4 walk (`narrative: V3 — nothing a first run meets …`) now reads every level of every skill, and each
  hero's own summons (name, names, desc, barks) and statuses by his skill prefix: Biz's constructs and their skills,
  Rasma's blades, Phat Gus's cheeks. 20 heroes, 3271 texts (2631 before), all clean.

**Kept on purpose**: Granny's "lovely pie dish" and the Gardener's "GRAZING IS PROHIBITED" (the lead's call; neither
reads mean); the goats' "That's your stomach. We can hear." (his hunger, not his shape); the picnic's "He feels bigger.
Wiser. Mostly bigger." (narration of his own feeling after eating a tree, not a villain); Biz's and Phat Gus's twist
reactions both say "Hang on." (only one hero reacts per twist, `svammiel.js` twistExtras).

**Deviations** (from the addenda, for the reasons above): the three rewritten lines.

**Runs**: `suite=svammiel_lines,boss_svammiel,boss_goats,narrative,boss_{gardener,league,galbraith,coven}` with the
bosses and `heroes/` isolated, all 20 registered: PASS, 144 suites, 25572 assertions (before the fixes); after:
voice suites PASS 60 suites / 6855, narrative PASS 17 suites (the walk 3271 texts). One shot: Phat Gus's event at
1024×640 (`.tmp/h19/review-shared/event_gus_1024.png`), the text and the three choices inside the card.

### QA fixes (h19 qa-fix:content, Nov 20) — findings `voice-2`, `voice-10`, `gus-size-lines-outside-voice`
- **Joke split (voice-2)**: the plan (§1.2) gives Svammiel the apologies and the stress eating. The goats' Rasma bar
  "Rasma says sorry with a sword in his hand, …" (an apology joke, and Basanos's "says sorry every time he swings" bar
  next to it) is now **"Rasma yells "Touché!" every time he gets hit,|man, that's not a riposte. That's a nervous
  tic."**; their Phat Gus bar "Phat Gus stress-eats every time it gets tense, …" (Svammiel's "Stress eating, Gus?
  Wonderful.") is now **"Phat Gus says "Fine, have ONE," like it costs him a limb,|one acorn for a friend? That's
  generous, for him."** `boss_goats` SPLIT: Rasma's Svammiel side `/apologi[sz]|\bsorry\b/`, goats `+ /touch[ée]/`;
  Phat Gus's Svammiel side `+ /stress/`, goats `+ /have one/`. (addendum-rasma §19.3's finer split, "the apologies
  ruining villainy" vs "sorry with a sword", is overruled by the plan's wording, which ranks above it.)
- **"rolled in" (voice-10, gus-size-lines)**: the goats' first Phat Gus bar opens **"Phat Gus showed up with his cheeks
  stuffed tight,"** (rhyme and chewing joke kept; "rolled" next to his own "Rolling, rolling, rolling." read as a
  villain's roundness pun). `boss_goats` now checks his bars and closers for roll / round / sphere / fat / chubby /
  belly.
- **The picnic (gus-size-lines)**: "He feels bigger. Wiser. Mostly bigger." (narration, not his own voice) is now **"He
  feels wiser. Mostly fuller."** The review's "kept on purpose" for that line above is superseded.
