# h19 digest — heroes 18-20: Rasma, Biz and Phat Gus (v3.3)

`h19:integrate`, Nov 19 2026, on HEAD 8688f41 (v3.2) plus the h19 build. What was built and where, the three kits, the
heals, the integration, the first numbers (iteration "int"), the deferred requests (plan D9) and the open questions
(plan §5.2). Plan `.tmp/h19/plan.md`; the user's words `.tmp/h19/request.md` (they win over everything); the judged
addenda `.tmp/h19/addendum-{rasma,biz,gus}.md`. The v2 digest (`docs/notes/v2-digest.md`) and the docs suite's kit
generator stay v2's record (plan §2.3: V3 never added Benedick there, and the balance pass's Overclock cooldown knob
would otherwise break a file the balance owner does not own); the three kit tables live here.

## 1. The user's request
"Then time for some new characters! / Rasma, a monocle-wearing monotaur who speaks in formal, polite english. He is a
spellsword (he enchants his sword with magical effects to deal damage). / Biz , a lizard-man artificer who relies on
his mechanical summons, Hjalmarino (a monkey) and Spooder (a spider) to fight for him" and, a minute later, "And Phat
Gus, a fat squirrel with weird eldritch forest powers who eats food" (Nov 18). Pronouns: all three he/him (Phat Gus:
"He/him"); Hjalmarino and Spooder "it" or none. Phat Gus is an actual squirrel, never called a druid, russet with an
acorn-cap beanie, doesn't climb; "fat" is his own word only. Same day: the two softened Rapping Goats lines "Keep them";
"Casual being easy is fine" (casual's upper bound is a report).

## 2. What was built and where

| owner | files | what |
|---|---|---|
| `h19:contract` (+ review) | `docs/ARCHITECTURE.md` (§1 h19 table, §3.1, §3.2 `forgetWarning`, §3.3 `showStacks`), `docs/DESIGN.md` (counts, pronouns, §5 notes, §6 house rules, reserved names, Sustain, the three briefs, §6.1, §11), `js/manifest.js`, `tests/manifest.js`, `tests/core_tests.js`, `tests/sim/sim.js` (D4 rule, `WORN['lift:gus']`), `docs/notes/h19-contract.md` | the tree made ready for three heroes before any registered |
| `h19:voice` | `js/data/svammiel_lines.js`, `js/data/bosses/{svammiel,goats,gardener,league,galbraith,coven}.js` (the three heroes' entries), `js/data/events.js` (`ev_ras_finishing_school`, `ev_biz_scrap`, `ev_gus_picnic`), the matching suite lists, `docs/notes/narrative.md` "h19" | Svammiel's roasts / comebacks / twist reactions and named barks, the goats' couplets, the optional villain named lines, three hero events (acts 1-3) |
| `h19:seats` | `js/ui/ui.js` (`HERO_ORDER`, `statusChip` `showStacks`), `css/style.css`, `js/ui/screens/{party_select,hall,tavern}.js`, `js/render/renderer.js` (`TITLE_SLOTS`, fallback order, glyph `showStacks`), `tests/{ui,render}_tests.js`, `docs/notes/{ui-v2,render-world}.md` "h19" | the order (`…, pebbles, rasma, biz, gus, benedick`), the 20-card fit (party select 5 × 4, Hall 4 × 5, `.crowd` for 21), the campfire seats keyed by order index, `showStacks` |
| `h19:hero-rasma` (+ `review:rasma`) | `js/data/heroes/rasma.js`, `tests/content/hero_rasma.js` (16 suites + zz), `docs/notes/hero-rasma.md` | Rasma the Monotaur |
| `h19:hero-biz` (+ `review:biz`) | `js/data/heroes/biz.js`, `tests/content/hero_biz.js` (25 suites + zz), `docs/notes/hero-biz.md` | Biz the Subcontractor, Hjalmarino and Spooder |
| `h19:hero-gus` (+ `review:phat-gus`) | `js/data/heroes/gus.js`, `tests/content/hero_gus.js` (24 suites + review + zz watcher), `docs/notes/hero-gus.md` | Phat Gus the Unfathomable |
| `review:shared` | the voice and seats files | three lines rewritten (Rasma's twist reaction, Galbraith on Phat Gus, Granny on Biz), the recruit pick in display order, a regression suite, the spoiler walk over every level and each hero's summons / statuses |
| `h19:integrate` (this) | `tests/content/{integration,shared,boss_svammiel}.js`, `tests/sim/sim.js` (verified), `tests/content/kit.js` (verified), `tests/docs_tests.js` (one comment), `README.md`, `docs/DESIGN.md` (§11 count), this file | §5 below |

None of the 17 shipped heroes' files changed (`git diff` of `js/data/heroes/`, `tests/content/hero_*.js`,
`docs/notes/hero-*.md` is empty for them; the three new heroes' files are new). Ellaria's three files: untouched.

## 3. The three kits (from the hero notes; level-by-level texts as `DD.skillDesc(def, level, null)` prints them)

### Rasma the Monotaur — Minotaur Spellsword (he/him; `docs/notes/hero-rasma.md`)
32 HP (+4 a level), AP 3, move 4, armor 0, init −1, complexity 2. Passive *Enchanté*: one enchantment at a time on his
sword, 3 charges (4 with Rapier Wit); each sword strike that hits a foe (attacks of opportunity and ripostes too) uses
one; the strike that uses the last heals him 5 (the afterglow, `lift:rasma`). (Numbers as the balance passes left them,
`docs/notes/balance.md` "h19 pass" and "h19 fix pass": HP 30 → 32, `AFTERGLOW` 3 → 4 → 5, With All Due Respect 8/10/12 →
9/11/13, the enchant bonus +2/+3/+3 → +3/+4/+4; AutoPlay: he enchants on the way in, fix:balance R1.)

| id | name | kind · AP / cd | I / II / III |
|---|---|---|---|
| `ras_pardon` (basic) | Pardon Me | attack · 1 / 0 | Sword strike: deal 5 damage to an adjacent foe. |
| `ras_cold_shoulder` (starter) | The Cold Shoulder | spell · 1 / 0 · self | Enchant your sword with frost (3 charges): its strikes deal frost damage, +3 / +4 / +4, and Slow each foe hit for 1 / 1 / 2 turn(s). Wet foes freeze. |
| `ras_shocking` | Positively Shocking | spell · 1 / 0 · self | Enchant your sword with lightning (3 charges): its strikes deal lightning damage (+50% against Wet foes), +3 / +4 / +4, and arc 2 / 3 / 4 lightning damage to the nearest other foe within 2. |
| `ras_disarming` | Most Disarming | spell · 1 / 0 · self | Enchant your sword with charm (3 charges): its strikes deal +3 / +4 / +4 damage and Weaken each foe hit for 1 / 1 / 2 turn(s) (it deals 25% less). |
| `ras_due_respect` (starter) | With All Due Respect | attack · 2 / 1 | Sword strike: deal 9 / 11 / 13 damage to an adjacent foe. |
| `ras_sweeping_bow` | Sweeping Bow | attack · 2 / 2 · self, adjacent | Sword strike: deal 4 / 5 / 6 damage to every adjacent foe (one charge, however many it hits). |
| `ras_regards` | Sending My Regards | attack · 2 / 1 · LOS | Sword strike: flick a crescent of magic off your blade at a foe within 4 / 4 / 5: 6 / 8 / 9 damage. |
| `ras_keep_change` | Do Keep the Change | attack · 2 / 3 | Sword strike: deal 6 / 7 / 8 damage to an adjacent foe, +2 / +3 / +3 for each charge left on your enchantment; it uses them all. |
| `ras_touche` | Touché | buff · 1 / 2 · self | En garde: until your next turn, the first foe that hits you from an adjacent tile takes a sword strike back for 5 / 7. (III: the first 2 times a foe hits you from an adjacent tile, it takes a sword strike back for 7.) |
| `ras_tea` | Tea, Anyone? | utility · 1 / 3, 3, 2 · LOS, foe or ally | Throw your tea over a foe or ally within 3 / 4 / 4: it is Wet for 2 turns (a Burn on it goes out). |
| `ras_look` | A Disapproving Look | utility · 1 / 3 · LOS, not a boss | A foe within 3 / 4 / 4 (not a boss) is Silenced for 1 / 1 / 2 turn(s): no spells, and a spell wind-up fizzles. |
| `ras_thousand` (signature) | A Thousand Pardons | attack · 2, 100 Hype · self, circle 2 | Every foe within 2 takes three strikes of 6: lightning, then frost, then plain steel. Your enchantment is not used. |

Statuses `ras_frost` / `ras_shock` / `ras_charm` (the blades, `showStacks`), `ras_guard` (En Garde). Items: Rapier Wit
(legendary weapon, 4 charges), Bespoke Waistcoat (rare armor, +4 HP +1 armor), The Spare Monocle (rare trinket, the
first enchantment each turn costs 0 AP). The sim keeps his last enchantment (`forgetWarning: lastEnchantWarning`, D4).

### Biz the Subcontractor — Lizardfolk Artificer (he/him; `docs/notes/hero-biz.md`)

| Piece | Id | Numbers (I / II / III or Mk I / II / III) | Notes |
|---|---|---|---|
| Hero | `biz` | 22 HP (+3/level; 31 at L4), AP 3, move 4, armor 0, init −1, complexity 3, `pronoun: 'he'`, `unlock: null` | Lizardfolk Artificer, role "Robot commander · hides behind bots" |
| Passive | Batteries Included | both constructs at combat start; a scrapped one reboots at its Scrap Heap on his 3rd turn after, with a third of its HP (rounded up), and sits that turn out (status `biz_booting` "Booting Up": no AP, no Overclock) | `autoplayEnd: baskEnd`; `turnEndNote: baskNote` |
| Basic | `biz_rivet_gun` Rivet Gun | 3 within 3 (reach), LOS | ranged: Biz makes no attacks of opportunity |
| Starter | `biz_duct_tape` Duct Tape | Block 5 / 6 / 8 within 3 / 3 / 4, cd 1 | Biz or his constructs only |
| Starter | `biz_overclock` Overclock | +1 AP now (2 with the Remote; `OC_AP`), runs hot; never on a robot that came back this turn; bask 3 / 4 / 4; range 3 / 3 / 4; cd 2 / 2 / 1 | his ONE heal (`lift:biz`); `forgetWarning` (D4) + tag `keystone` |
| Pool | `biz_reboot` Turn It Off and On Again | 2 AP, cd 3 / 2 / 2; I / II: it spends that turn booting up; III acts at once (no Overclock that turn) | targets a heap tile, anywhere, no LOS; full HP |
| Pool | `biz_red_button` Big Red Button | `boom` 8 / 10 / 12 to each adjacent foe; 1 AP, `charges: 1` | key `boom`, never `dmg` |
| Pool | `biz_hide` Nothing to See Here | Stealth 1 / 1 / 2 of his turns, cd 3 / 2 / 3 | his robots' hits keep it, his own break it |
| Pool | `biz_firmware` Firmware Update | +1 / +2 / +2 every hit, range 1 / 1 / 3, cd 1 | status `biz_updated` |
| Pool | `biz_www` World Wide Web | Root every foe within 1 / 1 / 2 of Spooder, cd 3 / 2 / 2 | self target, custom area |
| Pool | `biz_zip_line` Zip Line | Spooder reels Biz or an ally within 4 / 5 / 5 of it next to it, cd 2 / 2 / 1 | a teleport: never provokes |
| Pool | `biz_synergy` Synergy | 4 / 5 / 6 within 4, +3 / +4 / +5 per construct next to the foe; 2 AP, cd 2 | a crate takes the listed 4 / 5 / 6 (D4) |
| Signature | `biz_spoodmarino` Spoodmarino! | reboots scrapped constructs (full HP, booting up: no AP, no Overclock), then 12 + Rooted to each foe within 2 of a construct | 100 Hype, 2 AP |
| Construct | `biz_hjalmarino` Hjalmarino (Mechanical Monkey) | HP 4 + 2 × his level, armor 0, move 4, AP 2, hop, poison-proof | Monkey Wrench 2 / 3 / 4 (its attacks of opportunity; aiScore `warmScore`), Cymbal Crash Confused cd 3 / 2 / 1, not on a boss ("Bosses have heard the cymbals before.") |
| Construct | `biz_spooder` Spooder (Mechanical Spider) | HP 3 + 2 × his level, armor 0, move 4, AP 2, Root- and poison-proof | Pew Pew 2 / 2 / 3 within 3 (`warmScore`), Thwip! Rooted cd 3 / 2 / 2, range 3 / 3 / 4 |
| Items | `biz_universal_remote`, `biz_warranty`, `biz_spare_tail` | rare weapon +10% dmg (Overclock +1 AP: 2 instead of 1); rare trinket (first scrap of each kind: 1 turn); legendary armor +4 HP (a death-save) | no `WORN` entry: the heal is a skill rider |

Models by Biz's level: Mk I at L1-3, Mk II at L4-6, Mk III at L7+ (skill levels, the HUD card's "Mk" badge, the look).
(Numbers as the balance passes left them, `docs/notes/balance.md` "h19 pass": all seven "too strong" knobs of the
addendum: robot HP 8/6 + 2L → 6/4 + 2L, the reboot on his 3rd turn (was 2nd) with a third of its HP (was half; a
Warranty claim too), Mk bands 3/6 → 4/7, Overclock cd 2/1/1 → 2/2/1, Hjalmarino armor 1 → 0, Cymbal Crash not on bosses.
"h19 fix pass" (the lead's B1-B5, Nov 21): the robots' attacks value his bask (`warmScore`, B1); a robot that comes back
boots up that turn and can't be overclocked (B2); Overclock +2 → +1 AP (B3); Monkey Wrench 3/4/5 → 2/3/4, Pew Pew 2/3/4 →
2/2/3 (B4); robot HP 6/4 + 2L → 4/3 + 2L, the floors (B5).)
A reboot is a new unit; no `DD.Act.heal` from his kit ever aims at a construct.

### Phat Gus the Unfathomable — Squirrel (Mostly Cheeks) Snackromancer (he/him; `docs/notes/hero-gus.md`)
30 HP (+4 a level; 42 at L4), AP 3, move 4, armor 0, init +2, complexity 2, `pronoun: 'he'`. Passive *The Woods
Provide*: an acorn falls into his cheeks at the start of each of his turns (they hold 3, 4 with Cheeks of Holding; he
starts each fight with 1, 2 with it; at the cap it bonks off); skills that say "Eat" eat them; stress eating: once per
turn, if a foe is next to him after he eats, he heals 3 (5 with the Winter Coat (Built In); `lift:gus`; a meal at full HP
leaves the turn's heal for a later meal, fix:polish); an eater aimed at an object spends the acorn and heals nothing (D4,
`qa-fix:content`).

| id | name | AP / cd | I | II | III |
|---|---|---|---|---|---|
| `gus_incisor` (basic) | Incisor Decision 😬 | 1 / 0 | Deal 5 damage to an adjacent foe (7 if it is Confused). | — | — |
| `gus_whispers` (starter, spell) | Don't Listen to the Trees 🍂 | 2 / 2 | Eat an acorn: the trees whisper to every foe within 2 of you: 4 psychic damage, and each is Confused for 1 turn. | … within 2 …: 5 psychic … | … within 3 …: 6 psychic … |
| `gus_root_canal` (starter) | Root Canal 🦷 | 1 / 1 | Eat an acorn: roots burst up under a foe within 4 (no sight needed): 5 damage, and it is Weakened for 1 turn. | … within 5 …: 6 damage … 1 turn. | … within 5 …: 8 damage … 2 turns. |
| `gus_hollow` | The Hollow Hungers 👄 | 2 / 2 | Eat 2 acorns: the floor under a foe within 3 opens and bites: 12 damage, and it is Rooted for 1 turn. | … 15 … | … 18 … |
| `gus_binge` | All You Can Eat 🍽️ | 2 / 2 | Eat every acorn in your cheeks (at least 1): each foe next to you takes 3 psychic damage per acorn eaten. | … 4 psychic … | … each foe within 2 of you takes 4 psychic … |
| `gus_hole` (move) | Down the Squirrel Hole 🕳️ | 1 / 2, 2, 1 | Eat an acorn: tunnel to an empty tile within 4 (no sight needed). Foes next to the tile you left are Confused for 1 turn. | … within 5 … | … within 5 … |
| `gus_eyes` (spell) | Too Many Eyes 👁️ | 1 / 1 | Eat an acorn: eyes open in the bark around a tile within 5. Each foe on or next to it is Marked 3 (the next damage it takes is +3). | … Marked 4 (… +4). | … Marked 5 (… +5). |
| `gus_tree` | The Tree That Isn't There 🌳 | 2 / 2 | Acorns rain on every foe on or next to a tile within 4: 4 damage each. One lands in your cheeks if there's room (+1 acorn). | … 5 damage … | … 6 damage … |
| `gus_hangry` (buff) | Hangry 😠 | 0 / 3, 2, 2 | Only with empty cheeks: you are Empowered (your next damaging skill deals +50% damage). | (cd 2) | … +50% damage) and Inspired until the end of this turn (+25% damage). |
| `gus_have_one` (buff) | Fine, Have One 🎁 | 1 / 3, 3, 2 | Give an ally next to you one of your acorns (reluctantly): it is Hasted for its next turn (+1 AP). | Give an ally within 2 … | Give an ally within 3 … |
| `gus_acorn` (signature, 100 Hype) | The Acorn That Should Not Be ☄️ | 2 / 0 | A colossal acorn with far too many eyes drops on a tile within 5 (no sight needed): every foe within 2 of it takes 16 damage and is Confused for 1 turn. Then your cheeks fill up. | — | — |

Status `gus_cheeks` "Cheekful of Acorns" (stacks = acorns, `showStacks`). Items: The Nom-Nom-Nomicon (legendary weapon:
after he eats, the nearest awake foe within 3 takes 2 psychic per acorn), Cheeks of Holding (rare trinket), Winter Coat
(Built In) (rare armor, +5 HP, stress eating +2; `WORN['lift:gus']` in the sim).

## 4. The heals (plan D9; one conditional heal each, through `DD.Act.heal(..., { via: 'lift:<id>' })` after `active()`)
- **Rasma — the afterglow** (`lift:rasma`, passive): the sword strike that spends his enchantment's last charge heals
  him 5 (fix:balance R4: 4 → 5). Everything else of his is HP-neutral.
- **Biz — the bask** (`lift:biz`, starter Overclock): end that turn next to the robot he overclocked, heal 3 / 4 / 4, once
  a turn. Never on a living robot (he tapes, scraps and reboots them).
- **Phat Gus — stress eating** (`lift:gus`, passive): once per turn, if an active foe is next to him after an Eat skill,
  heal 3 (5 with the Winter Coat; only a call that heals spends the turn's heal, fix:polish). Never on a kill, an object (an
  eater aimed at a crate spends the acorn and heals nothing) or a death (Betty's), never on leaving melee (Kiri's).
None is a heal button, an HP-threshold trigger, a revive or a combat-start shield; none heals another unit; the healers
of others stay Ellaria, Josiah and Valdris; Ellaria is untouched.

## 5. Integration (`h19:integrate`)
- `tests/content/integration.js`:
  - `ALL += 'rasma', 'biz', 'gus'` (all he: no `SHE` entry): the cross-content suite and its pronoun sweep now read
    their blurbs, barks, skills (every level) and items; `PENDING_HEROES = []` (all three hero events name a registered
    hero); the registry log says "20 with the full h19 content".
  - **The construct sweep (D8)**: `CONSTRUCTS = { biz: ['biz_hjalmarino', 'biz_spooder'] }`. Biz's `summons` are exactly
    those two; each def has `pronoun: 'it'`; their own texts (name, names, desc, every bark) and their skills' (name,
    flavor, the desc at levels 1-3: Monkey Wrench, Cymbal Crash, Pew Pew, Thwip!) carry no he / him / his / himself /
    she / her / hers / herself at all (59 texts). Biz's own texts and the narration that name a construct keep the owner
    rule (he/him for Biz), so his passive's "who act on his turn" and his tip pass.
  - **The forget-rule twin (D4)** now asserts on the real kits: each of Rasma's three enchantments, when it is his only
    one, is protected at level I in socket 0 (the new skill replaces another); with two socketed neither is; his lone
    enchantment as the only socket → −1. Biz's Overclock is kept by its warning (not a tag). Phat Gus has no protected
    skill.
  - **Determinism** runs two parties: V3's (Betty, Kiri, Benedick, Josiah) and h19's (Biz, Phat Gus, Hjalmar, Josiah:
    two summons on Biz's turn, the Hjalmar gag, Phat Gus's whispers). For h19's, the party's barks, every summon's
    barks, `DD.Gus.WHISPERS` and `DD.Biz.TIN_LINES` also get an extra line; the goats door replays bit-identical
    (result, round, combat RNG state, Hype, every unit's HP and tile incl. both robots, the cheats).
  - New suite **"integration: h19 — Biz's robots with Phat Gus"** (the cross-new-hero checks D11 keeps out of the hero
    suites, passed on by review:phat-gus): Hjalmarino's Cymbal Crash on Biz's turn, then Phat Gus's Incisor Decision
    deals 7 to that grunt and 5 to a plain one; Fine, Have One on Spooder → Hasted, 3 AP on Biz's next turn; with only
    the robots next to him an Eat skill heals nothing, with a grunt there one `lift:gus` on himself.
- `tests/content/shared.js`: `REAL += 'rasma', 'biz', 'gus'` (the whole-pool AutoPlay fights, previews with item hooks,
  summoners / flyers, spenders / Polearm, Whetstone and Encore Kazoo now run on their kits: Whetstone +2 on Pardon Me,
  Rivet Gun and Incisor Decision; the Kazoo +25 after each signature; the Polearm stops a brute walking off Rasma and
  Phat Gus); `HERO_PREFIX` + `ras|biz|gus`; the summoners suite gains Biz: the Bandolier of Dog Treats heals both robots
  3 at his turn start (a shared item; his own kit never heals a robot).
- `tests/content/boss_svammiel.js`: the named-line count is `===` the registry again (20 for 20) when the full roster is
  loaded; an isolated run keeps `>=`.
- `tests/content/kit.js` `OPT_OUT`: verified unchanged (no `target.objects: false` in the three kits; the suite passes).
- `tests/sim/sim.js`: verified, no edit (D4 rule, `WORN['lift:gus']`, the header: the contract's).
- `tests/docs_tests.js`: the stale "no hero kit cashes in Wet" comment now says Rasma's blades do (comment only); the
  kit generator's `ORDER` stays v2's sixteen.
- `README.md`: "pick 4 of 20", the three in the party line (Biz "with Hjalmarino and Spooder, his mechanical monkey and
  spider"), one sentence each, and a `**Version 3.3:**` line in the version box; the `**Version 3:**` line is word for
  word; no act-4 word.
- `docs/DESIGN.md`: §11 "39 events in acts 1-3 (22 hero events and 17 generic)" (the voice owner's request). The three
  §6 subsections, §6.1, the Sustain paragraph and the reserved names needed no re-sync: no hero note carries a "DESIGN §6
  brief (h19)" block (Rasma and Phat Gus say the build matches the pasted brief; Biz's review changes are below the
  brief's level of detail), and every number in the briefs matches the code (HP, growth, init, `AFTERGLOW` 3, bask
  3 / 4 / 4, `STRESS_HEAL` 3 + `COAT_HEAL` 2).

**Tests**: one full `bash tools/test.sh`: **PASS — 1394 suites, 178,149 assertions, 0 failures, 0 failing sections**,
0 "Error in" lines in the results (log: `.tmp/h19/integrate/full_test.txt`). The content advisories it prints are the
known ones (Benedick's move 2; Synergy's and All You Can Eat's "dealt a base" combo numbers; Spoodmarino's damage dealt
by the robots): warnings, recorded as deviations in the hero notes.

## 6. Numbers: iteration "int" (plan §3.1-§3.3; the first reading with all twenty, nothing tuned yet)
Stock `tools/sim.sh`, one 100-seed page at a time, `debug=1&healers=ellaria,josiah,valdris&raw=1` (normal pages also
`verbose=1`); every page's overrides line reads `none`. Normal: seeds 86000-86599 (6 pages, 600 runs, 7,592 fights).
Forced: seeds 86600-86699, five seats (Rasma, Biz, Phat Gus, Betty, Mayor Buga) × T_A (Josiah, Kiri, Marwyn) and T_B
(Corelos, Slate, Hjalmar), 10 pages, 1,000 runs, 12,748 fights. Pooled with `.tmp/heal/baseline/merge.awk` / `split.awk`,
`.tmp/heal/lifts.awk` (+ `WORN['lift:gus']`), `.tmp/heal/after/rounds.awk` / `t8.awk` and `.tmp/h19/bal/int/fp.awk` /
`nobiz.awk`; raw pages, scripts and the pooled tables in `.tmp/h19/bal/int/` (`compose_int.sh` rebuilds them, no
Chrome). Wilson 95% intervals for rates, batch-means 95% half-widths over the pages for per-fight means, a delta-method
95% interval on the log ratio for R_H. v3.2 = the heal audit's final gate (and its pooled 1,200 runs) in
`docs/notes/balance.md`.

| # | target | iteration "int" (n, 95% CI) | v3.2 | verdict |
|---|---|---|---|---|
| T1 | campaign [23, 28], CI overlapping 22-28 | **30.5%** (183/600, 26.9–34.3) | 26.2% gate, 25.8% pooled | **MISS** (high; CI overlaps) |
| T2 | act 3 cleared [28, 35] | **38.8%** (233/600, 35.0–42.8) | 34.6% pooled | **MISS** (high) |
| T3 | Svammiel [80, 85] | **86.7%** (183/211, 81.5–90.7) | 81.7% | **MISS** (high; CI overlaps) |
| T3 | every door ≥ 91% (gate) / ≤ 98.5% (report) | coven 98.2 · galbraith 97.8 · gardener 97.7 · goats **99.1** · league 97.3; all 98.0% (1091/1113, 97.0–98.7) | 95.8-99.0 | gate PASS; report: goats over 98.5 |
| T3 | Svammiel rounds ≤ 13.27 | 12.33 (n 211) | 13.22 (11.77 baseline) | PASS |
| T3s | stalls ≤ 1 per 1,000 fights | **0** in 7,592 normal + 12,748 forced fights | 2 in ~10,000 | PASS |
| T4 | brutal [5, 13]; casual report | not measured (iteration "int" is normal only; the audit's gate seeds) | 7.0%; casual 78.8% | — |
| T5n(a) | forced R_H in [0.80, 1.25] or within noise | Rasma **0.51** (0.32–0.81) · Biz **3.31** (2.62–4.17) · Phat Gus 1.36 (0.99–1.86) | — | Rasma **MISS** (weak) · Biz **MISS** (strong) · Gus within noise |
| T5n(b) | pool share in [0.80, 1.25]× the median or within noise | Rasma 0.84× (22.1%, 29/131, 15.9–30.0) · Biz **2.40×** (63.2%, 74/117, 54.2–71.4) · Phat Gus 0.95× (25.0%, 29/116, 18.0–33.6); median 26.3% | — | Rasma in band · Biz **MISS** · Gus in band |
| T5o | the 17 (report) | Ellaria 2.09×, Zarathor 1.83, Josiah 1.79, Syllamin 1.21, the other 13 0.68-1.13 (Hjalmar 0.68, Slate 0.69 – Kiri 1.13); nobody above Biz and Ellaria | Ellaria 2.41, Josiah 1.92, Zarathor 1.56, Syllamin 1.46, 13 at 0.77-1.27 | report |
| T5o rails | Pebbles, Valdris (Rasma) and Betty, Syllamin (Gus) within ±5 points of v3.2 | Pebbles 26.1% (+6.8 on 19.3; 18.9–34.8) · Valdris 26.8% (+5.0) · Betty 26.6% (+4.7) · Syllamin 31.9% (−1.7); the whole campaign is +4.7 | 1,200-run kept rows | report: everyone rose with Biz's parties; Pebbles' rise is inside his interval |
| E | Ellaria's parties ≥ 52% (n ≥ 150) | 55.1% (65/118, 46.1–63.8; n < 150) · without Biz in the party 52.5% (53/101) | 53.4% | report (above the floor; n short) |
| T6 | Josiah, Ellaria ≥ 2× every non-healer at healing others; Valdris not below 1.16×; new kits heal no other unit | Josiah 15.6 ± 0.8, Ellaria 11.0 ± 1.0 vs Sparrow 2.7 (≥ 4×); Valdris 3.2 = 1.19× Sparrow; `lift:rasma` / `lift:biz` / `lift:gus` to others 0.00 (each file has one heal call, on himself) | 15.6 / 10.7; 1.16× | PASS |
| T8n | `lift:rasma` ≥ 1.0 fire and 4-10 HP | 0.92 ± 0.11 fires · **2.43 ± 0.29** HP a fight (regular 0.63 · 1.74; elite 1.19 · 3.31; mini 1.98 · 4.73; boss 1.06 · 2.73); overheal 12% | — | **MISS** (HP; fires within noise of 1.0) |
| T8n | `lift:biz` 0.8-2 fires and 3-8 HP | **0.70 ± 0.04** fires · **1.74 ± 0.12** HP (regular 0.52 · 1.17; boss 0.73 · 1.88); overheal 28% | — | **MISS** (both) |
| T8n | `lift:gus` ≥ 0.8 fires and 2.4-9 HP (rail ≤ 10) | 1.04 ± 0.13 fires · 3.01 ± 0.31 HP (regular 0.74 · 2.09); Winter Coat worn in 201 fights (14%): 1.34 fires, 5.53 HP a worn fight | — | PASS |
| T8o | the 16 v3.2 lifts (report) | 13 of 16 met; misses: Kiri 0.18 fires / 0.89 HP, Benedick 0.31 fires, Valdris 0.73 fires and 54% to others; Sparrow now meets (0.26) | 12 of 16 (misses Kiri, Benedick, Sparrow, Valdris) | report: unchanged picture |
| T9 | every page 0 errors / 0 `DD.warn`; full suite; D12 | 16 pages: 0 / 0; `tools/test.sh` PASS (1394 suites); the 17 heroes' and Ellaria's files untouched | PASS | PASS |
| T10 | kit health (report) | Biz: robots 37.9 of 62.3 Biz-side damage a fight = **61%** (55-75), Overclock 2.50 uses a fight. Phat Gus: ≈ 4.4 acorns eaten a fight (≥ 3), Don't Listen 0.46 uses a fight (the Confused target stays out of reach under AutoPlay). Rasma: Sweeping Bow 0.03 and the signature 0.00 a fight. Blade share, freezes, scraps, bonks: only the hero suites' zz sims count them (owners' and reviewers' readings: blade 82%, freezes 0.15 random / 0.34 Wet parties, scraps 1.76, bonks 0.62) | — | report |

**Forced pages** (paired seeds 86600-86699; four-act wins of 100 runs, act 1 / act 3 cleared):

| seat | with T_A (Josiah, Kiri, Marwyn) | with T_B (Corelos, Slate, Hjalmar) | T_A + T_B | R_H |
|---|---|---|---|---|
| Betty (ref.) | 39% (30.0–48.8) · 88 / 52 | 1% (0.2–5.4) · 56 / 8 | 20.0% (40/200) | 1.07 |
| Mayor Buga (ref.) | 33% (24.6–42.7) · 83 / 47 | 2% (0.6–7.0) · 57 / 12 | 17.5% (35/200) | 0.93 |
| **Rasma** | 17% (10.9–25.5) · 82 / 29 | 2% (0.6–7.0) · 46 / 4 | 9.5% (19/200, 6.2–14.4) | **0.51** (0.32–0.81) |
| **Biz** | **85%** (76.7–90.7) · 96 / 87 | **39%** (30.0–48.8) · 78 / 47 | 62.0% (124/200, 55.1–68.4) | **3.31** (2.62–4.17) |
| **Phat Gus** | 47% (37.5–56.7) · 91 / 56 | 4% (1.6–9.8) · 54 / 11 | 25.5% (51/200, 20.0–32.0) | 1.36 (0.99–1.86) |

Reference ½(W(Betty) + W(Buga)) = 18.8%. Every forced page: 0 errors, 0 `DD.warn`, 0 stalls.

**What the reading says (for the balance pass; the integrator moved no number)**
- **Biz is the outlier** (plan risk 1): 3.3× the reference in the forced reading and 2.4× the median in the pool, above
  Ellaria. With Josiah, Kiri and Marwyn he wins 85% of four-act runs; with the healer-less T_B 39% (the reference
  1-2%). His side deals 62.3 a fight (the robots 61% of it) while he takes 12.2 (the lowest of the twenty) and goes
  down 0.20 a fight: two bodies from turn 1 that soak the foes' attacks and come back for free. **The campaign's T1 / T2 /
  T3 misses are his**: runs without Biz in the starting four win 22.6% (109/483, 19.1–26.5) and clear act 3 31.7%
  (153/483, 27.7–36.0), inside T1 / T2. Plan §3.4: a T5n miss is fixed with the hero's own knobs before any enemy row;
  §3.5's "strong" list starts with robot HP −2 each, then the reboot timer 2 → 3, the Mk bands 3/6 → 4/7, Overclock
  cd 2/1/1 → 2/2/1, Hjalmarino armor 1 → 0, Cymbal Crash non-bosses only, reboot at a third of max HP; outside
  0.67-1.50× the lead allows two of his steps in one iteration (request.md). His bask stays under T8n (0.70 fires, 1.74
  HP): a weaker Biz takes more hits, which should lift the bask by itself; its own knob (3/4/4 → 4/5/5) is HP only.
- **Rasma is under** in the forced reading (0.51, interval 0.32–0.81, under 0.67: a miss whatever the interval) and in
  band in the pool (0.84×). He goes down 0.50 a fight (the most of the three; Biz 0.20, Phat Gus 0.25) and takes 22.9 a
  fight. §3.5's weak list: enchant bonus +2 → +3 at I, `AFTERGLOW` 3 → 4 (also his T8n lever: 2.43 HP against 4-10),
  With All Due Respect 8/10/12 → 9/11/13, HP 30 → 32; never his charges.
- **Phat Gus is fine**: within noise in the forced reading (1.36, interval 0.99–1.86) and 0.95× in the pool; T8n met
  (1.04 fires, 3.01 HP; the Winter Coat's 5.5 HP a worn fight under the rail). The reviewers' "healer-less T_B" worry
  reads 4% for him against Betty's 1% and Buga's 2% here (n = 100 a page).
- The healer split: no healer in the party 17.5% (49/280; v3.2 gate 11.3%); healer-less runs lost in act 1 38.9% of them
  (< 42%; v3.2 38.8%). With Josiah 47.1%, with Valdris 26.8%.
- Next (plan §2.4): the balance pass's iteration 0 is this reading if no file changes before it (it can pool these
  pages); Biz first (T5n), then Rasma (T5n / T8n), then T1-T3 with enemy rows only if they are still out once Biz is in
  band.

## 6b. Numbers: the final gate (`h19:audit`, Nov 20; the balance pass's kept numbers, no enemy row moved)
The plan's fresh gate seeds: normal 60000-60599, casual 61000, brutal 62000, forced 63000 (10 pages) and `acts=3`
63500. "Pooled" adds the pass's last iteration (normal 68000-68599 and Biz's forced 68600), which ran on identical
rows and hero numbers (verified by replay). Full tables, stalls, party shapes and levers: `docs/notes/balance.md` "h19
audit". Raw pages: `.tmp/h19/audit/`.

| # | target | gate (pooled) | verdict |
|---|---|---|---|
| T1 | campaign [23, 28] | 28.5% (**28.7%**, 344/1199, 26.2–31.3); without Biz 24.6% | **MISS** (point; CI overlaps) |
| T2 | act 3 cleared [28, 35] | 37.0% (**37.6%**, 34.9–40.4); without Biz 33.7% | **MISS** |
| T3 | Svammiel [80, 85]; doors ≥ 91; rounds ≤ 13.27 | 83.0% (83.3%); doors 96.3-100 (goats 99.8 pooled: report); 12.64 rounds | PASS |
| T3s | stalls ≤ 1 / 1,000 | 2 in 23,239 gate fights: a Biz reboot-decoy grind at the Gardener (forced 63047) and a shipped Help-Up loop (brutal 62043) | PASS on rate; the Biz shape reported |
| T4 | brutal [5, 13]; casual report | brutal 6.0% (6/100); casual 73.0%; `acts=3` 40.0% | PASS; reports |
| T5n | forced R_H · pool share | Biz **2.07** (2.12 pooled) · **1.87×**; Rasma **0.66** (0.43–1.01) · **0.71×** (17.7%, 13.4–23.2 vs median 24.9%); Phat Gus 1.15 · 1.00× | Biz **MISS** · Rasma **MISS** · Phat Gus PASS |
| T5o | the 17 (report) | Ellaria 2.02, Josiah 1.78, Syllamin 1.70, Zarathor 1.69; the other 13 0.76-1.11 | report |
| E | Ellaria's parties ≥ 52% | 49.1% (**50.2%**, 114/227, 43.8–56.7) | **REPORT** (under the line; no row moved) |
| T6 | healers ≥ 2×; new kits heal no one else | Josiah 15.6, Ellaria 11.0 vs 2.7; Valdris 1.22×; `lift:*` to others 0 | PASS |
| T8n | the three heals | Rasma **0.89 · 3.15 HP** · Biz **0.62 · 1.61 HP** · Phat Gus 1.15 · 3.23 HP | Rasma, Biz **MISS** · Phat Gus PASS |
| T8o | the 16 v3.2 lifts | Kiri, Benedick, Valdris (56% to others) as in v3.2; Slate 0.96 at its edge | report |
| T9 | pages; full suite; D12 | 0 errors / 0 `DD.warn`; D12 empty; full suite 1 failure (the barrel case, `tests/content_tests.js`) | **MISS** until that test is fixed |
| T10 | kit health (zz sims) | blade 80%, freezes 0.20; robots 58%, scraps 1.98 (57% back); acorns 4.26, bonks 0.60, Confused 0.75 | report |

## 6c. The release gate (`h19:gate`, Nov 21; the final tree after the three QA fixers)
Scratch: `.tmp/h19/gate/` (`run_sims.sh`, `run_shots.sh`, the pages, `test1.txt` / `test2.txt`, `shots/`).
- **Full suite** (`CONSOLE=1 bash tools/test.sh`): run 1 PASS (1409 suites, 178,528 assertions); run 2 FAILED one
  check, a **flaky test**: "engine: h19 QA-BIZ-8 …" took the first log line matching `/unleashes/`, and the narrator's
  cosmetic signature pool (`DD.rng`, 1 line in 8: "{hero} unleashes a signature move! …") sometimes logs first. The
  same loose filter sat in "integration: h19 QA — Overclock's preview …". **Gate fix** (tests only): both now match the
  skill's own name (`/unleashes Mass Assert/`, `' unleashes ' + def.name`), so a doubled bang still fails them. Then
  two more full runs: see the T9 row. Every "Error in" line in the console is a deliberate test fixture
  (`test_tmp_throw`, "boom", `zz_throw`, `test_render_*`); none comes from an h19 file, and the results hold none.
- **Replay** of the audit's first normal page (`debug=1&healers=ellaria,josiah,valdris&raw=1&verbose=1&seeds=100&
  from=60000&diff=normal`): **not byte-identical** to `.tmp/h19/audit/normal_60000.txt`, but byte-identical to
  `qa-fix:content`'s re-measure (`.tmp/h19/qa-fix-content/normal_60000.txt`), so nothing moved after the fixers. Four
  runs differ (60033, 60044, 60061, 60070), all four with Phat Gus: the D4 fix (an eater aimed at an object no longer
  stress-heals). Moved: wins 29 → 28 (60044 now loses in act 2), act 3 cleared 41 → 40, fights 1286 → 1277, Svammiel
  29/38 → 28/37, `lift:gus` 1.06 · 2.9 HP → 1.02 · 2.8 HP, `lift:rasma` 1.02 · 3.4 → 1.05 · 3.5; `lift:biz` unchanged.
  One run in a hundred: inside noise, no verdict moves.
- **Fresh smoke** 74000-74199 (2 pages, 200 runs, 2,513 fights): 0 errors, 0 `DD.warn`, 0 stalls.

| # | target | smoke 74000-74199 (n, 95% CI) | audit (pooled) | verdict |
|---|---|---|---|---|
| T1 | campaign [23, 28] | 31.0% (62/200, 25.0–37.7) | 28.7% (26.2–31.3) | **MISS** (as the audit; drift +2.3, inside noise) |
| T2 | act 3 cleared [28, 35] | 38.0% (76/200, 31.6–44.9) | 37.6% | **MISS** (as the audit) |
| T3 | Svammiel [80, 85] | 88.6% (62/70, 79.0–94.1); rounds 12.9 | 83.3% (n 414); 12.82 | PASS on the audit's n (the smoke's small n overlaps it) |
| T3 | doors ≥ 91 (≤ 98.5 report) | 98.4% (358/364): coven 97.3, galbraith 97.3, gardener 98.6, goats 98.6, league 100 | 96.3-100 | PASS; report: three doors over 98.5 |
| T3s | stalls ≤ 1 / 1,000 | 0 in 2,513 | 2 in 23,239 | PASS |
| T5n(b) | pool share | Biz 1.78× (23/45, 51.1%) · Rasma 0.85× (10/41, 24.4%) · Phat Gus 1.15× (12/37, 32.4%); median ≈ 28.5% | Biz 1.87× · Rasma 0.71× · Gus 1.00× | Biz **MISS** · Rasma MISS at the audit (in band here, small n) · Gus PASS |
| E | Ellaria's parties | 59.5% (25/42, 44.5–73.0) | 50.2% (114/227) | report (v3.2 53.4%) |
| T6 | healers ≥ 2×; new kits heal nobody else | Josiah 14.9, Ellaria 9.8 vs Sparrow 4.2 (2.4×); `lift:*` to others 0 | PASS | PASS |
| T8n | the three heals (fires · HP a fight) | Rasma 0.79 · 2.7 · Biz 0.60 · 1.5 · Phat Gus 1.22 · 3.4 | Rasma 0.89 · 3.15 · Biz 0.62 · 1.61 · Gus 1.15 · 3.23 | Rasma, Biz **MISS** · Gus PASS |
| T9 | pages; suite twice; D12 | 3 pages 0 / 0; after the flake fix the suite PASSES twice, identical (1409 suites, 178,528 assertions, 0 failures; 28 console "Error in" lines, all deliberate fixtures, 0 in the results); D12 empty | 1 failure then | **PASS** (the barrel case is fixed) |

T4, T5n(a) (forced) and T10 were not re-measured: the gate's tree differs from the audit's only by the Phat Gus D4 rule
and display-only fixes, and the replay shows that rule's reach. The audit's readings stand for them.

- **Shots** (`.tmp/h19/gate/shots/`, 21 PNGs, every one read): party select at 1024 × 640, 1280 × 720 and 1920 × 1080
  (20 cards, 5 × 4, Pebbles → Rasma → Biz → Phat Gus → Benedick, nothing clipped); the Hall ("0 / 20" from the
  registry); the tavern ("16 heroes drinking at the bar"); the title campfire (20 seated, Phat Gus under the tree, Biz by
  the signpost, Rasma by the water, Benedick on the path); the gallery (20 heroes; the Mechanical Monkey and Spider among
  9 summons); the summoners' HUD (two Mk I robot cards under Biz, "Spoodmarino!" whole on the hotbar); each new hero at
  rot 0 / 90 / 200; Biz Mk II at level 4 (14 / 12 HP) and Mk III at level 7 (20 / 18); one AutoPlay moment each
  (Rasma's ❄️3 chip, Root Canal's fixed log line).
- **Diff** `git diff 8688f41 -- js/data/heroes tests/content/hero_*.js docs/notes/hero-*.md`: empty (none of the 17,
  Ellaria's three files untouched); the three new heroes' nine files are new. Each has his one `DD.Act.heal` call with
  its `lift:` label (rasma.js:138, biz.js:390, gus.js:209), a D9-guard suite, his notes and his DESIGN §6 subsection.
- **Gate verdict**: checks 1-5 hold. The balance misses of the audit (T1, T2, T5n Biz and Rasma, T8n Rasma and Biz)
  are unchanged and wait on the lead or the user; nothing drifted beyond noise.
- Small things left (not blockers): `biz.js:8` still says the Mk bands are "3 / 6" (a comment; the code reads
  `MK_AT` [4, 7]); a comment at `biz.js:1075` names Rasma (D11 is about lines; the suite runs isolated). Release notes
  for the players: `.tmp/h19/release-notes.md`.

## 6d. The balance fix pass (`fix:balance`, Nov 21; after §7's polish; the lead's B1-B5 and R1-R4)
The lead's levers beyond the addenda (tuning, not character facts), in order: Biz B1 (AutoPlay) → B5, two a reading while
his forced point sat outside 0.67-1.50; Rasma R1 (AutoPlay) → R4, one a reading. Seeds ≥ 130000 (the lead's ledger);
pages from frozen snapshots of the tree (`.tmp/h19/fix/bal/`). Full tables, iterations, stalls, deviations:
`docs/notes/balance.md` "h19 fix pass (Nov 21)"; per hero: the notes' "Balance fix pass".
- **Landed** — Biz: the robots' attacks value his bask (`warmScore`, B1); a robot that comes back boots up that turn (no
  AP, no Overclock; chip "Booting Up"; Turn It Off and On Again III still acts at once, B2); Overclock +1 AP (B3);
  Monkey Wrench 2/3/4, Pew Pew 2/2/3 (B4); robot HP 4 / 3 + 2L (B5, the floors). Rasma: he enchants on the way in
  (R1); the enchant bonus +3/+4/+4 (R2); `AFTERGLOW` 5 (R4); R3 (34 HP) not needed. Phat Gus, the 17 and every enemy row:
  unchanged.
- **Final reading** (snap3 = the shipped tree; normal 140000-140599, forced 143000-143599, 600 a seat; the pass was
  stopped by the user before casual, brutal and smoke finished, so those three are not reported):
  - T1 25.8% (155/600, 22.5-29.5) PASS · T2 34.7% (208/600, 31.0-38.6) PASS · Svammiel 82.9% (155/187) PASS · doors
    97.8% (952/973) PASS · stalls 0 / 7672.
  - Biz: forced R 1.50 (1.26-1.79; pooled with it3 1.49, 1.28-1.73), pool 1.45x - MISS at the edge of the hard band
    (was 2.07-2.12 / 1.87x). B1-B5 are spent; the next lever is the lead's or the user's.
  - Rasma: forced 0.81 (0.65-1.01; pooled 0.82), pool 0.96x - PASS (was 0.66 / 0.71x).
  - Phat Gus: forced 1.25 (1.04-1.51), pool 0.81x - PASS (both at the edge).
  - T8n: Rasma 1.00 fires, 4.41 HP PASS; Biz 0.55, 1.43 HP MISS (accepted: no heal step while he is outside T5n); Phat
    Gus 1.12, 3.29 HP PASS.
  - E (report): Ellaria's parties 45.6% (52/114) final, 54.5% (66/121) at it3, pooled 50.2% (118/235) - under the 52%
    report line, as at the Nov 20 audit; no enemy row moved.

## 7. Polish (`fix:polish`, Nov 21; the cross-fixer requests that had not landed)
The lead's list after the gate; each item landed with a test and no number changed (the balance pass after it owns the
numbers). Scratch: `.tmp/h19/fix/polish/`. Old sections 7-9 are now 8-10.

| # | request (where it was asked) | what landed | test |
|---|---|---|---|
| 1 | QA-BIZ-4's content half: the end-of-turn bask cue (`hud-v2.md` "h19 QA fixes" Requests); the gate's two stale `biz.js` comments (§6c) | `biz.js` `PASSIVE.turnEndNote` → `baskNote` (pure; `DD.Biz.baskNote`): "♨️ Biz basks on Hjalmarino's hot engine: +3 HP" (min(bask, missing HP); "nothing to heal (full HP)") / "♨️ Biz won't bask here: not next to Hjalmarino" / '' with nothing of his running hot; a hovered robot move counts on its new tile. Header: "Mk II from 4, Mk III from 7: MK_AT"; Cymbal Crash's comment no longer names another new hero | "hero_biz: polish — turnEndNote …" (31); "hud: h19 polish — Biz: …" (19, the real screen) |
| 2 | gus-passive-live-numbers (`hud-v2.md` Requests) | `gus.js` `PASSIVE.liveDesc = passiveDesc`; `desc` stays the base text | "hero_gus: polish — the passive's liveDesc …" (22) |
| 3 | QA-BIZ-6's HUD half (`rules.md` "h19 QA fixes (Nov 20)" Requests) | `combat_hud.js` `apLabel` / `apLabels`: an entry's `ap` / `apNext` (ranges from `apMin` / `apMax`) on the badge ("+2 AP ♨️") and as one "⚡" part of the aim hint ("⚡ Hjalmarino +2 AP", "⚡ Slate +1 AP next turn", "⚡ you +2 AP"); N is always the preview's | "hud: h19 polish — a preview's AP …" (20); the Biz suite (N = 2, 3 with the Remote) |
| 4 | `shooter: false` on Galbraith's chain hops (`hud-v2.md` Requests: its beams play before the damage, so the renderer's struck rule can't see them) | `galbraith.js` Chain Lightning: hops (`from !== u`) pass `shooter: false`; his own first beam, the ray and the counter keep the cast | "boss_galbraith: polish — Chain Lightning's hops …" (10); the boss suite 19 / 19 isolated |
| 5 | Phat Gus's once-a-turn stress heal at full HP (qa-fix:content fixed the text only, `hero-gus.md` "QA fixes") | `gus.js` `stressEat`: the turn's heal is spent only by a call that heals (`healed > 0`); the passive and tip 2 back to the addendum's words: "Stress eating: once per turn, if a foe is next to him after he eats, he heals 3 HP." / "…once a turn." No threshold (the same call at 1, 29 and 30 HP; a 0-HP call at full HP) | suite 4 rewritten (the full-HP meal, then the hurt meal heals 3, a third meal nothing, next turn again; 29/30 → +1 is the turn's); the sim=1 rules watcher (12 battles, 0 broken rules) |
| 6 | the ARCHITECTURE lines never written (`hud-v2.md` / `rules.md` Requests "Lead", this digest's §8 "Lead (optional)") | §1 a `fix:polish` row; §3.1 `liveDesc(who)` and `turnEndNote(hero, x, y, moved)`; §3.2 the `forgetWarning` resolve (called `(null, runHero)`), a def `preview()` with `ap` / `apNext`; §5.2 `Targeting.diff(…, opts?)`, `PreviewEntry.ap` / `apNext` and their `apMin` / `apMax`; §7.2 `overlay.moves`, `renderTo` `landings` / `heads`, `TITLE_SLOTS` / `titleTile`; §7.4 beam shooters and `shooter: false`; §8.1 `passiveText`, `ANYWHERE_RANGE`; §8.3 the h19 HUD (landings, the cue, AP, "anywhere") and `DD.HUD.endTurnTip` / `turnEndNote` / `fitNames` (`showStacks` was already in §3.3 / §7.2 / §8.1) | "hud: h19 polish — ARCHITECTURE documents the h19 hooks …" (13: the lines and the code they name) |

- **What can move a sim number**: only item 5. A hurt Phat Gus who ate at full HP earlier the same turn now heals on the
  later meal, and a full-HP turn with two meals next to a foe makes two 0-HP calls (the sim counts calls as fires):
  `lift:gus` fires and HP can only rise a little (audit: 1.15 fires, 3.23 HP, in band). Items 1-4 and 6 are display or
  docs only (no engine, AI, AutoPlay or sim path reads `turnEndNote`, `liveDesc`, the HUD's text or FX opts).
- **Requests left** (not this role's files): `docs/DESIGN.md` l.449 and l.842-844 and `.tmp/h19/release-notes.md` l.33
  still say Phat Gus's Nov 20 "the first time each turn" (lead); this digest's §3 Phat Gus passive line and §4 Phat Gus
  bullet say it too (the balance fixer's sections). Exact replacement wording: `hero-gus.md` "Polish" → Requests.
- **Full suite** (one `CONSOLE=1 bash tools/test.sh` after the code, tests and notes; log
  `.tmp/h19/fix/polish/full_test.txt`): **PASS — 1415 suites, 178,656 assertions, 0 failures, 0 failing sections**,
  missing scripts 0 (the gate's 1409 + the six new polish suites). The console's 28 "Error in" lines are the gate's
  deliberate fixtures (`test_tmp_throw`, "boom", `zz_throw`, `test_render_*`); none comes from a polish file, and the
  results hold none.

## 8. Deferred and passed on (not built here; every fallback is shipped content)
Plan D9 (the optional engine / UI requests):
- **R1 RULES** — `Act.kill` books no damage stat when the credit is the target (fallback: the Button's self-destruct
  subtracts `hp0` through `Act.statOf`, pinned in Biz's suite).
- **A1 AUTOPLAY** — `DD.AutoPlay.summonWorth` (fallback: `boomValue`'s +40 coupling, pinned).
- **H1 HUD** — a ghost card for a scrapped summon (fallback: the 🔧 chip, the heap's digit, the log).
- **H2 HUD** — a stable summon card / Tab order by `def.summons` (fallback: names on the cards).
- **M1 META-UI** — the party-select summon list (fallback: Biz's blurb and passive name both robots). Building it would
  put every summon's desc (Ellaria's corgi included) on a new screen; each would need its own desc check first.
- **S1 RENDER-SPRITES** — gallery Mk II / III looks (fallback: suite 22 and a scratch scene).
- **W1 RENDER-WORLD** — Biz's robots at his campfire seat (fallback: the seat alone).
- **Phat Gus** — a generic HUD cost badge (🌰1 / 🌰2 / 🌰all) and a procedural `chomp` sound (fallback: every eater's desc
  starts with its price, the ⛔ refusal names the shortfall, `hit` at 0.6).
- **Cross-new-hero banter** (D11): Biz's two optional idle lines naming Rasma and Phat Gus, Rasma's two naming Biz and
  Phat Gus (the addenda's "once they ship" lines). Not in any hero file; whoever owns cross-hero banter later.

Passed on by the reviewers (other owners' files; none blocks the suite):
- **HUD (`qa-fix:render-ui`)**: a long one-word skill name breaks mid-word on the hotbar ("SPOODMARI / NO!" at 1280×720
  and 1024×640, "OVERCLOC / K" at 1024×640). Optional: let deployment select a summon.
- **Portrait framing**: at 1600×900 and 1920×1080 the 5 × 4 party-select cards cut Phat Gus's tail at the portrait's left
  edge (Benedick's shell is cut the same way since V3).
- **Engine / contract (minor)**: Biz's 🔧 Rebuilding chip is display-only but typed `buff`, so the act-3 Rules Lawyer's
  OVERRULED! counts and dispels it (the reboot still happens: the timers live in `unit.data.biz`).
- **Lead (optional)**: ARCHITECTURE §7.2 could mention `DD.Render.titleTile(x, y)` and that seat i of `TITLE_SLOTS`
  belongs to the i-th hero of the order.
- **Content suite (optional)**: the "dealt a base" advisory could accept multiples of a `per` key.
- **Balance**: §6 below.
- The untracked `bash.exe.stackdump` in the repo root is not part of h19 and should not be committed.

## 9. Open questions for the user (plan §5.2; the build proceeds on each default; an answer is a rename / knob pass)
- **Q-R1** "Monotaur": his own joke or a typo? Default: his joke (epithet "the Monotaur", race "Minotaur").
- **Q-R2** Which magical effects does the real Rasma put on his sword? Default: frost, lightning and a disarming charm;
  no fire. **Q-R3** A tea man (cup and saucer, Tea, Anyone?)? Default: yes. **Q-R4** His look? Default: chestnut fur,
  ivory horns, gold monocle on a chain, cravat, mustard waistcoat, claret tailcoat, a straight sword. **Q-R5** British-
  flavoured formal, or plain formal? Default: British-flavoured. **Q-R6** Initiative −1 as "after you"? Default: yes.
  **Q-R7** Any fixed lore (title, surname, homeland)? Default: none.
- **Q-B1** Biz's personality and voice? Default: a cheerful small-business tinkerer ("I don't fight. I delegate.").
  **Q-B2** Epithet; is "Biz" short for anything? Default: "Biz the Subcontractor", just Biz. **Q-B3** Does he fight
  himself? Default: barely (Rivet Gun 3). **Q-B4** The Hjalmarino / Hjalmar gag (a knockoff, royalties in bananas): would
  Hjalmar's player enjoy it? Default: yes, cosmetic, once a fight at 50%. **Q-B5** The robots' looks and jobs? Default: a
  tin cymbal monkey in a teal fez (melee, Confuses); a blue-steel googly-eyed spider-bot (ranged, Roots). **Q-B6** Do
  they break and come back mid-fight? Default: yes. **Q-B7** Biz's look? Default: chartreuse gecko, brass goggles,
  blueprint-blue coveralls. **Q-B8** The robots' pronouns? Default: "it".
- **Q-G2** What is Phat Gus at the table (warlock, homebrew)? Default: race "Squirrel (Mostly Cheeks)", class
  "Snackromancer" (the user confirmed: never called a druid). **Q-G3** Where the powers come from? Default: "the woods",
  never named. **Q-G4** What he eats? Default: acorns are the fuel. **Q-G5** Personality? Default: mellow, food-first,
  unbothered by cosmic horror. (Answered on Nov 18: Q-G1 "Phat Gus" is his full name; Q-G6 russet fur and an acorn-cap
  beanie (the eyed tail is still the addenda's); Q-G7 he doesn't climb; Q-G8 the size jokes are his own only and
  villains never aim at his body; and he is an actual squirrel.)
- **Q-P1** (answered by the lead's reading): the three new heroes' own numbers may move both ways inside their knob
  lists before their first release; the 17 shipped heroes never change.
- Two review-time choices for the lead / `qa:voice`: Phat Gus's Fine, Have One icon is 🎁 (the addendum's 🤲 is a pair of
  human hands, and he has paws); Rasma's first select line is now "Rasma, delighted to oblige. Horns, monocle and all."
  (`qa-fix:content`, voice-3: the old "Rasma, at your service. Do mind the horns." read as Benedick in a waistcoat).

## 10. Deviations (the integrator's)
- **The named-line count** is `===` only when all twenty heroes are registered; an isolated run keeps `>=` (with `===`
  alone, `isolate=svammiel` would fail on 20 lines for 0 heroes).
- **Determinism** adds h19's party as a second fight in the same suite (V3's fight is unchanged), and grows the party's
  barks, every summon's barks, Phat Gus's whispers and the tin-double lines only for that fight.
- **The cross-new-hero suite** is new (not in the role text); it holds the three checks review:phat-gus ran in a scratch
  probe and passed on.
- **DESIGN §11's event count** (the voice owner's request) is outside the role's list of DESIGN sections; it is one
  number in the h19 events' own paragraph.
- **README**: Phat Gus is "a very round squirrel" (DESIGN's brief's words; "fat" stays his own) and his party-line
  sentence is "Phat Gus eats acorns, and the woods do the rest".
