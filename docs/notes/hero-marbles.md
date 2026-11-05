# Hero: Professor Marbles — notes

Files: `js/data/heroes/marbles.js`, `tests/content/hero_marbles.js` (15 suites `hero_marbles: …`, the last one a manual
balance sim).
Run: `bash tools/test.sh "suite=hero_marbles&isolate=heroes/marbles,hero_marbles"`; generic checks:
`bash tools/test.sh "suite=content:&isolate=heroes/marbles,hero_marbles"`.
Balance sim (manual, needs the other heroes): `bash tools/test.sh "suite=hero_marbles: zz&sim=1&n=3&verbose=1"`.
Scratch (not shipped): `.tmp/marbles/` — `g.png` (gallery), `aoo.png` (a real fixture fight: a grunt walks off him,
"⚔️ Attack of opportunity!" and the log line "Professor Marbles gets an attack of opportunity on Test Grunt (Doddering
Jab)!"), `c1.png`–`c3.png` (v2 pass: deployment, marbles on the board, the 💡 free Lecture), `combat.html` + `cshot.sh`
(scratch harness, modes `sig` / `fire` / `aoo`), `sim3.txt` (sim), `full2.txt` (full `tools/test.sh`).
Review scratch: `.tmp/marrev/` — `probe.html` + `run.sh` + `probe.js` (probes as suites:
`bash .tmp/marrev/run.sh "suite=probe&verbose=1&isolate=heroes/marbles"`), `combat.html` + `cshot.sh` (a real debug fight
with Valdris / Hjalmar / Pebbles; modes `scatter` / `walk` / `aoo` / `hook`), `g1.png` / `g2.png` (gallery),
`c1.png` (Scatter II + a slipped rat + the 💡 0-AP gem), `c3.png` (the "Provokes 1" move preview), `c4.png` (his attack of
opportunity with the new bark), `full1.txt` (full run).

Status (v2 + attacks of opportunity + review, 2026-11-03): the v2 conversion (initiative, no telegraphs, no Guard, no
starting Block, simple skills) is complete; the attacks-of-opportunity pass designed and tested him for the new rule and
reach-aware enemies (DESIGN §4.1–4.2, §8 "Targeting"), hinted it in his blurb and gave his barks the three new party
members (Valdris, Hjalmar, Pebbles — all he/him); the adversarial review (section "Review (v2)" below) fixed the
passive remembering a Silenced spell, the Cane's dead "and pulls" clause and the surface tooltip, and gave his attacks of
opportunity a bark. 15 `hero_marbles` suites (1065 assertions) and the 8 generic `content:` suites pass isolated and in
the full run; nothing failing in the full run comes from his files (see Known issues).

## Review (v2) — adversarial review of the v2 + attacks-of-opportunity work (ADVERSARIAL REVIEWER role, 2026-11-03)

Scope: this file's kit as the AoO pass left it (`js/data/heroes/marbles.js`, `tests/content/hero_marbles.js`, these
notes). Method: read against DESIGN §4.1–4.4 / §6 "Simplicity" + his brief, `docs/notes/v2-migration.md` and rules.md
"Attacks of opportunity"; probes run in Chrome (`.tmp/marrev/`), mutation checks of every fix, screenshots, the zz sim
and a full `tools/test.sh`.

**Verified (held)**
- **desc == effect at every level** of all 12 skills, the passive, `mar_remembered`, `mar_marbles` and the 3 items (every
  desc printed by a probe; the suites check damage, statuses and their own-turn durations, costs, cooldowns, charges,
  displacement; previews exact). The signature hits every foe within 3 (Manhattan) through walls and up ledges (its desc
  promises no line of sight — a burst); Leap may land on lava or a puddle (an "empty tile": the player's call), never in a
  pit or deep water.
- **Simplicity**: one verb + at most one rider per skill; level III adds at most one rider (Leap's THUMP, Wax On's banked
  AP), otherwise bigger numbers (range, Block, AP cost, cooldown); descs 7–24 words, no if/else; the passive is one rule;
  pool 10 (2 starting). Marble Scatter is the longest (24 words, two short sentences) — kept: "(other surfaces stay)" is
  the honest exception, not a hidden clause.
- **v2**: `stats.init` 2 (rolled d20 + 2 tested), `unlock: null`, no Guard / starting Block / telegraph / intent / XP (grep
  + suite), stuns and sleeps interrupt wind-ups, Wax On III's AP is banked for the ally's next turn.
- **Attacks of opportunity**: Doddering Jab is his reaction (5, free, once per round, 6 on a Vulnerable foe); none while
  stunned / asleep / a sheep / downed nor on his charmer; Leap, Whack, Hook and the signature never provoke; his Stun /
  Sleep / Taunt let allies walk away for free; a reach-aware grunt next to him stabs him, not the 4-HP mage. The HUD's move
  preview now reads "⚔ Provokes 1 attack of opportunity: Dire-ish Rat 2 (Ankle Nibble). Can't be undone." (`c3.png`), so his
  leap-or-walk choice is readable.
- **Combos** (2–3 setups that pair with others, all real): Scatter → Vulnerable for everyone; Hook → into cleaves, fire,
  Hjalmar's traps (they spring on pulls and pushes too — hjalmar.js) or across a pit, then pinned by his Jab; Wax On →
  Empowered (for a Fireball, or a hitter Valdris has forged up); Whack → pits, lava, Pebbles' fire (a `fire` surface: Burn
  on entry), traps.
- **Character read**: forgetful passive, a boring Lecture that puts foes to sleep, "Back In My Day...", carrots, a cane,
  marbles he has "deployed" — instantly *a doddering rabbitfolk monk*; distinct from the other 15 (the only free-skill
  passive and the only Vulnerable trap surface).
- **Pronouns**: every line naming a hero follows the user's list (she: Ellaria, Sparrow, Kiri; he: everyone else).
- **Visuals**: gallery (poses, statuses, portraits — one upright and one floppy ear, spectacles, beard, cane, marble
  pouch), the 16-hero gallery at the same scale, a real act-1 fight next to Valdris / Hjalmar / Pebbles (`c1.png`: Scatter
  II's marbles, a slipped Vulnerable rat, the 💡 status and the green 0-AP gem), `c4.png` (his attack of opportunity).
- **Determinism**: the passive rolls `state.rng`; barks and FX use the cosmetic RNG (`DD.rng`).

**Fixed** (each with a regression assertion; reverting the fix fails it — mutation-checked)
1. **Absent-Minded Mastery remembered a spell while he was Silenced** (Lecture: 11 of 30 silenced turn starts in a probe),
   so the "free" use was wasted. "Ready" now also means "not a spell while Silenced" (Silenced lasts through any turn it is
   present at the start of: it ticks at turn end). Test: silenced every turn → Lecture never, Walking Stick Whack 12 of
   12; control without silence → Lecture comes up.
2. **Cane of Unsolicited Advice: "His pushes and pulls move units 1 tile further"** — his only pull, Vaudeville Hook,
   already yanks a foe all the way to him, so the pull half was dead text in his kit (and a hidden extra tile on a 1-tile
   pull Blessing: Gravitational Ego pulled 2). Now "+10% damage. His pushes move units 1 tile further." and the hook
   lengthens forced movement only when the step leads away from him. Tests: the desc says pushes only; a 1-tile pull
   stays 1; a 1-tile push goes 2 (plus the existing Whack 3 / Hook-next-to-him checks).
3. **His attacks of opportunity had no voice**: the blurb promises he "thwacks anyone who walks off mid-lecture". His
   Jab now may bark on an attack of opportunity (`ctx.opportunity`, 50%, cosmetic RNG; like Betty's) from a new
   `opportunity` key: "Class is NOT dismissed!", "Sit DOWN. I haven't finished the lecture.", "I didn't say you could
   leave!", "No running in the dungeon!", "Back in my day, we waited to be excused!" (`c4.png`). Tests: 4–6 lines;
   requested on an attack of opportunity, not on his own-turn Jab.
4. Surface tooltip: "walk or are pushed onto it" → "walk or are moved onto it" (pulls, swaps and teleports slip too).

**Considered, not changed**
- Hooking a foe through an ally bumps both (3 each): the universal bump rule, visible on the line; a foe in the way is a
  combo (two bumps).
- One "Slip!" and log line per marble tile a foe walks over (the Vulnerable only refreshes): slapstick, kept (Deviations).
- A "can't be opportunity-attacked" item: agreed with the author — every slot holds a combo item, and shoving, leaping or
  stunning his way out is the fun. (Hjalmar's Pomade now owns that rule.)
- Numbers: the sim puts him mid-pack (Balance); no retune.

**Remaining** (not his files): barks name heroes who are not in the party (Request to RULES below); DESIGN §6's
Marbles brief is still v1 (Request to the lead).

## Summary (v2: initiative, no telegraphs, no Guard, simple skills, attacks of opportunity)

The user's brief: *"A doddering rabbitfolk monk."* **Professor Marbles, the Forgetful Fist** — an ancient rabbitfolk
grandmaster who forgets names, birthdays and where he left his marbles, but never how to drop a goblin. Mobile melee
skirmisher / control. 28 HP (+4/level), 3 AP, move 4, armor 0, **init +2** (`stats.init`), `flags.hop` (climbs 2
levels), `unlock: null`. Saffron UI accent `#e8a33d`. Blurb ends "...naps through briefings and thwacks anyone who
walks off mid-lecture." (his melee Jab = attacks of opportunity).

**Passive — Absent-Minded Mastery**: *"At the start of each of his turns he suddenly remembers one random ready socketed
skill: its first use that turn costs 0 AP."* One rule (v1's 25% "Senior Moment" forget is gone). Rolled with
`state.rng` in his `onTurnStart`, only on his own turn; stunned / asleep / frozen / sheep: no roll. "Ready" = off
cooldown after this turn's tick, charges left, and not a spell while he is Silenced (review: a Silenced Lecture was
remembered and wasted). Basic and signature are never remembered (sockets only), so an attack of
opportunity (his Jab, on someone else's turn) never touches the memory. Shown as status `mar_remembered` 💡 (its tooltip
names the skill), FX text "💡 Lecture!", a log line ("💡 Professor Marbles suddenly remembers Lecture! (first use this
turn costs 0 AP)") and sometimes a bark; the HUD draws the free skill's AP gem as a green 0. The status leaves silently
when used or at his turn end (never seen on an enemy turn).

| id | name | AP / cd | desc at I (one verb + at most one rider) → II → III |
|---|---|---|---|
| `mar_jab` (basic) | Doddering Jab 👊 | 1 | "Deal 5 damage to an adjacent foe." Melee: also his free attack of opportunity (then a 50% cosmetic `opportunity` bark: "Class is NOT dismissed!"). |
| `mar_signature` | Forgot I Was Retired 🐇 | 2 + 100 Hype | "Every foe within 3 tiles takes 8 damage and is Stunned (it loses its next turn)." He never leaves his tile: a blur visits each foe, nearest first, and hops back (banner, flash, shake). Stun-immune foes only take the damage; boss wind-ups are interrupted. |
| `mar_whack` (starter) | Walking Stick Whack 🏑 | 1 / 1 | "Deal 5 damage to an adjacent foe and push it 2 tiles." 5 & 2 → 6 & 2 → 7 & 3 |
| `mar_scatter` (starter) | Marble Scatter 🔮 | 1 / 2 | "Scatter marbles on a 5-tile plus for 3 rounds (other surfaces stay). Grounded foes there or moving in slip: Vulnerable for their next turn." plus, 3 rounds → 3x3, 3 rounds → 3x3, 4 rounds (tile 0-4, LOS) |
| `mar_punch` | Rabbit Punch 🥊 | 2 / 3, 3, 2 | "Deal 6 damage to an adjacent foe and Stun it (it loses its next turn)." 6 → 8 → 10 (cooldown 2 at III) |
| `mar_flurry` | Flurry of Paws 🐾 | 2 / 1 | "Strike an adjacent foe 3 times for 3 damage each (9 total)." 3×3 → 3×4 → 3×5 (each level beats the previous at armor 0, 1 and 2) |
| `mar_backinmyday` | Back In My Day... 👴 | 1 / 2 | "Gain 4 Block and Taunt adjacent foes: on their next turn they must attack him." 4 → 6 → 8 Block, foes within 2 tiles at III |
| `mar_lecture` | Lecture 📚 (spell) | 3, 3, 2 / 3 | "Adjacent foes fall Asleep for 2 turns (damage wakes them)." adjacent → within 2 → within 2 for 2 AP. Silence blocks it. |
| `mar_carrot` | Carrot Toss 🥕 | 1 / 0, 3 charges | "Heal an ally within 4 tiles (or himself) for 6 HP. He packs 3 carrots per fight." 6 → 8 → 10 |
| `mar_leap` | Hare-Brained Leap 🐰 | 1 / 2 | "Leap to an empty tile up to 3 tiles away, over anything." 3 → 4 → 4 + "He lands with a THUMP: 3 damage to adjacent foes." Never provokes. |
| `mar_hook` | Vaudeville Hook 🪝 | 1 / 2 | "Hook a foe in a straight line 2-3 tiles away: 3 damage and yank it next to him." 2-3 & 3 → 2-4 & 4 → 2-5 & 5 |
| `mar_waxon` | Wax On, Wax Off 🧽 | 1 / 2 | "An ally within 3 tiles is Empowered: its next damaging skill deals +50%." 3 → 5 → 5 + "It also gets +1 AP on its next turn." |

Pool 10 (2 starting) besides basic and signature; AP mix 1 / 2 / 3; one charges skill (Carrot Toss), long cooldowns
(Rabbit Punch, Lecture); every desc ≤ 25 words, no if/else clause, no v1 terms (the registration suite checks it).

## Attacks of opportunity (v2 AoO role, DESIGN §4.2) — how he plays with them

No rule text changed: the kit already had the tools, the new rule makes them matter more.
- **He holds the line.** Doddering Jab is a melee basic, so a foe walking off a tile next to him eats a free Jab (5,
  once per round, normal damage rules: 6 on a Vulnerable foe). Reach-aware enemies weigh that cost, so a grunt next to
  him keeps stabbing *him* instead of strolling past to the 4-HP mage (tested). In the sim foes almost never walk off
  him (6 Jabs in 102 fights): the threat does the work.
- **His mobility never provokes**: Hare-Brained Leap (a leap), Walking Stick Whack (a shove: the foe is pushed out of
  reach, then anyone walks away free), Vaudeville Hook (a pull: never provokes the heroes the foe is dragged past), and
  the signature (he never moves). Walking away from a foe still costs him its hit (and a lethal one downs him on the
  tile he tried to leave).
- **Vaudeville Hook pins**: a back-liner yanked next to him is engaged — walking away costs it a Jab.
- **His control frees the party**: stunned (Rabbit Punch, the signature), asleep (Lecture) and taunted foes (Back In My
  Day: a foe taunted by him strikes only him) make no attacks of opportunity on the allies who walk away from them.
- Nothing in his kit needed a `ctx.opportunity` guard (his Jab has no user-side effects; the passive only counts
  socketed skills). The Jab reads `ctx.opportunity` for flavor only: a 50% `opportunity` bark (cosmetic RNG), the
  lecturer who doesn't let anyone leave ("Class is NOT dismissed!", "Sit DOWN. I haven't finished the lecture.").

## Combos with other heroes (the setups and payoffs the kit is built around)

1. **Marble Scatter → Vulnerable** (setup): every foe on the marbles takes +25% from every hero — at once, and for 3-4
   rounds every foe that walks in on its own turn (marbles are a trap; the AI does not avoid them). Multi-hit and AoE
   allies cash it in best (his own Flurry: 3 × round(3 × 1.25) = 12 instead of 9; his Jab on a foe walking off: 6).
2. **Vaudeville Hook → into the kill zone** (setup): yank a back-liner 2-5 tiles away next to him — into an ally's
   cleave, fireball, puddle, oil or Hjalmar's traps, or across a pit (yeet); once there it is pinned by his Jab.
3. **Wax On, Wax Off → Empowered** (setup): an ally's next damaging skill +50% (save it for the Fireball, or stack it on
   a big hitter Valdris has just forged up); III also banks +1 AP for that ally's next turn.

Plus positioning and turn control: Walking Stick Whack (push into pits, lava, water, oil, Pebbles' fire, Hjalmar's
traps or a friend; shove a brute off a squishy ally so it can walk away free), Rabbit Punch and Lecture (Stun / Sleep:
the foe loses its next turn(s) and makes no attacks of opportunity; both interrupt a boss wind-up), Back In My Day
(Taunt pulls the next hits off a squishy ally; his Block soaks them until the start of his next turn), Leap (hops
ledges and pits, slips out of melee).

**Surface `mar_marbles` "Loose Marbles"**: a light tint + its own painter (7 glossy marbles per tile, stable per-tile
layout from a hash — render-only, never the logic RNG — that twinkle). Tooltip: "Grounded enemies that walk or are moved
onto it slip: Vulnerable for their next turn. Heroes never slip (they know where he dropped them. Mostly)." `onEnter`: a
grounded **enemy** that walks or is pushed, pulled, swapped or teleported onto it slips ("Slip!", a log line) and is
**Vulnerable 1**: from a hero's turn that
covers its next turn; gained on its own walk the status is fresh, so it lasts through its next turn too (ARCHITECTURE
§6.5). No damage, no stop, no slide; the marbles stay until their rounds run out. Heroes, hero-side summons and flyers
never slip. Never placed over another surface, pits, walls or lava; re-scattering keeps the longer duration and takes
the credit. Not flagged `hazard`.

**Status**: `mar_remembered` (buff, 💡, `data: { ids, used }`; hooks `modifyCost` = 0 for a free id, `onSkillUsed`
marks it used, `onTurnEnd` removes it silently).

**Items** (`hero: 'marbles'`, one per slot, one rule each; none gives Block):
- `mar_cane` Cane of Unsolicited Advice (rare weapon 🏒): "+10% damage. His pushes move units 1 tile further."
  (`modifyOutgoingPush` on his sources, only when the step leads away from him: Whack pushes 3 / 3 / 4, a Shove or a
  Scroll of Yeet he uses +1; pulls unchanged — the Hook already yanks a foe all the way to him, and a 1-tile pull Blessing
  stays 1; allies' pushes don't change. Review: it said "pushes and pulls", which was dead text for his Hook.)
- `mar_robes` Robes of Many Pockets (rare armor 🥋): "+5 max HP. At the end of each of his turns, Loose Marbles spill onto
  the 4 tiles around him (other surfaces stay) until the end of the next round." (a moat: a foe stepping up to him
  slips — Vulnerable — and still attacks; foes already next to him don't slip.)
- `mar_pills` Grandpa's Pill Organizer (legendary trinket 💊): "Absent-Minded Mastery remembers 2 skills each turn
  instead of 1."
- Considered and dropped: a "can't be opportunity-attacked" item (the rules notes suggest it for skirmishers). Every
  slot already holds a combo item, and having to Whack / Leap / stun his way out is the fun part of his kit.

**Sprite**: humanoid slim, scale 1 (35 px tall at zoom 1), `hunch: 0.6`, warm grey fur, saffron robe + maroon sash,
brass round spectacles, sleepy eyes, `rabbit_floppy` ears, rabbit tail, cane; an `overlay` adds the long wispy beard,
droopy moustache, bushy white brows (drooping at the outer ends, above the lenses) and a marble pouch, following the
hunch through `g.head` / `g.bodyShear`. Portrait via `DD.Sprites.portrait`. Re-checked in the gallery (poses, statuses,
portraits, in game).

**Barks**: 4-6 lines per key (≤ 70 chars), naming Josiah, Zarathor, Ellaria, Marwyn, Sparrow, Syllamin, Slate, Mayor
Buga, Kiri, Betty, Basanos and now **Valdris** ("Valdris, dear, forge me a new hip. Quickly.", "Valdris, dear, weld them
back together!"), **Hjalmar** ("Hjalmar! Was that YOUR banana peel?", "Hjalmar, give back my spectacles. I can hear you
giggling.") and **Pebbles** ("Pebbles, heel! Not on the rug! ...Too late.", "Good boy, Pebbles! No licking. You are
literally on fire.", "Pebbles... fetch Valdris... good boy..."), plus an attack-of-opportunity kill line ("Never turn
your back on your elders.") and (review) an `opportunity` key that his Jab may use on an attack of opportunity ("Class
is NOT dismissed!", "Sit DOWN. I haven't finished the lecture.", "I didn't say you could leave!", "No running in the
dungeon!", "Back in my day, we waited to be excused!"). Pronouns per the user's list (she: Ellaria, Sparrow, Kiri; he:
everyone else): the suite checks every line that names a hero. No removed mechanics in barks, blurb, role or passive.

Every id: `hero:marbles`, skills `mar_jab mar_signature mar_whack mar_scatter mar_punch mar_flurry mar_backinmyday
mar_lecture mar_carrot mar_leap mar_hook mar_waxon`, status `mar_remembered`, surface `mar_marbles`, items `mar_cane
mar_robes mar_pills`. Removed in v2: `mar_thumper`, `mar_forgot`.

## v1 → v2 (what changed, and why)

| v1 | v2 | why |
|---|---|---|
| Passive: remember one (free) + 25% chance to forget another (+1 AP, `mar_forgot` "Senior Moment") | remember one (free) | one clear rule |
| Signature: 5 chained strikes of 5 (dash + teleport to the nearest unstruck foe within 3, the last one Stunned; rules for walled-in, Invulnerable and charmer foes) | every foe within 3: 8 damage + Stun; he stays put (the dash is FX) | one big, simple effect |
| Whack: a direction, allies shoved too | foes only, same numbers | one verb, no ally exceptions in the text |
| Scatter: slip = 2 damage + Vulnerable; pushed units slide +1; a walking foe stopped and the marbles used up | slip = Vulnerable for its next turn; the marbles stay | one rider; v2 durations |
| Punch 6/8/9 + Stun "cancels the telegraph" | 6/8/10 + Stun (loses its next turn) | v2 stun; III ≈ +50% |
| Flurry: leftover strikes hop to another adjacent foe | one target, leftovers lost | no hidden clause |
| Back In My Day: Block + Thorns + Taunt (re-aims telegraphs) | Block + Taunt (on their next turn they must attack him) | one rider; v2 taunt |
| Thumper (stomp, push AoE) | cut | overlapped Whack and Leap; pool 11 → 10 |
| Lecture: Sleep cancels telegraphs | same numbers: the sleepers lose their next 2 turns unless hit | v2 sleep |
| Carrot Toss: heal + remove 1 debuff | heal 6/8/10 | one verb |
| Leap: always THUMP 3 + push 1 | THUMP 3 at III only, no push | III = one added rider |
| Hook: allies hauled too, pull 2/3/3 | foes only, always yanked next to him; range 3/4/5 | one verb |
| Wax On: Empowered → + 4 Block → + 4 Block + 1 AP now | Empowered, range 3/5/5; III + 1 AP on its next turn (banked) | one rider; v2 AP banking |
| Cane: Whack / Thumper / Hook / Leap move units +1 | his pushes move units +1 (review: "and pulls" dropped — the Hook already yanks a foe to him) | one rule, no dead text |
| Robes: spilled marbles dealt 2 slip damage | spilled marbles slip = Vulnerable | follows the surface |
| Pills: +10 Hype at combat start, remember 2, never forget | remember 2 | one rule |
| — | `stats.init: 2` | v2 initiative (a spry old master) |
| blurb "...hits like a falling piano." | "...thwacks anyone who walks off mid-lecture." | tells players he punishes walk-offs (AoO) |

## Public API

- `DD.Marbles.scatter(src, tiles, { turns = 3, slipNow })` → the tiles that got Loose Marbles (skips tiles with another
  surface and non-floor tiles; marbles already there keep the longer duration and take `src`'s credit; `slipNow`:
  enemies already standing there slip at once).
- `DD.Marbles.slip(unit, tile)` → bool: the slip rule for a unit on a marbles tile (false for heroes, summons, flyers,
  the dead, or no marbles).
- Surface `mar_marbles`: other content may `DD.Act.setSurface(x, y, 'mar_marbles', rounds)`; set
  `tile.surface.data = { src: unitId }` to credit the Vulnerable to a unit.
- Status `mar_remembered` is Marbles-specific (its `data.ids` drives the free cost).

## Deviations

- DESIGN §6's Marbles brief predates v2 (Thumper, "Back In My Day (deflect/counter)", "chain-dash through up to 5
  enemies", "occasionally forgets"): the kit follows DESIGN §6 "Simplicity" instead (table above; Request below).
- The signature is a burst around him, not a real dash: he never leaves his tile, so it needs no landing rules (walls,
  pits, Invulnerable foes) and provokes nothing; the FX blur keeps the chain-dash look.
- A foe that walks across several marble tiles slips on each one (a "Slip!" and a log line per tile; the Vulnerable
  only refreshes). Kept: it is slapstick, and the rule stays "walk onto marbles, slip".

## Requests

- **Lead (DESIGN §6)**: update the Professor Marbles brief to the v2 kit: skills Walking Stick Whack (push), Marble
  Scatter (marbles: grounded foes slip, Vulnerable), Rabbit Punch (stun), Flurry of Paws, Back In My Day (Block +
  Taunt), Lecture (sleep), Carrot Toss (heal), Hare-Brained Leap, Vaudeville Hook (pull), Wax On, Wax Off
  (Empowered); signature *Forgot I Was Retired* (every foe within 3: damage + Stun); passive without "forgets"; he
  holds the line with a melee basic (the AoO role asked for "which heroes hold the line"). Still open at the review.
- **RULES (`js/engine/actions.js` `Act.bark`)** (review): a party filter for barks — when picking a line, skip lines that
  name a hero (its def `name`, or its first word: "Mayor Buga" → "Buga") who is not in the fight, falling back to the
  full list when nothing is left. With 16 heroes and parties of 4, most named lines name an absent hero: 4 of his 6
  `lowhp` and `idle` lines and 3 of 6 `ally_down` / `victory` lines name someone (every hero file has this).
- Resolved since the AoO pass: **NARRATIVE** `ev_mar_lost_marbles` no longer grants XP (the third choice now heals to
  full and rolls on the Table of Questionable Blessings); **HUD** the move preview shows "⚔ Provokes N attack(s) of
  opportunity: who (skill). Can't be undone." (seen in `.tmp/marrev/c3.png`).

## Balance (AutoPlay, 2026-11-03, with attacks of opportunity; the other heroes are mid-conversion, so it drifts)

- Fixture AutoPlay (`hero_marbles: AutoPlay v2 battles`, levels 1 / 3 / 5, 13 fights): 13 / 13 wins, 3.4 rounds on
  average; every pool skill, the jab and the signature get used.
- `zz` sim at the review (34 non-boss encounters × 3, 3 random real partners from all 15 others incl. Valdris, Hjalmar
  and Pebbles, shuffled, levels 2 / 3 / 5 by act, skills I / II / III): 100 / 102 wins. Damage per fight: Kiri 64.8,
  Zarathor 62.2, Syllamin 52.0, Corelos 47.6, Sparrow 43.3, Slate 36.6, Pebbles 35.5, **Marbles 34.1**, Ellaria 33.6,
  Hjalmar 31.6, Josiah 30.6, Buga 28.4, Marwyn 25.7, Basanos 23.3, Betty 22.0, Valdris 19.4 (a buffer: his damage is
  credited to the forged). Marbles 1.63 kills per fight, downed 4 times in 102 fights. Middle of the pack, as a control
  hero should be: his value is in stuns, sleeps, taunts and the party's Vulnerable hits, which the damage tally credits
  to the others. (The AoO pass: 35.6 damage, 1.66 kills, 7 downs, 100 / 102; before the AoO engine: 33.6, 1.53, 7,
  98 / 102.)
- Attacks of opportunity: by him 6, on him 14 in 102 fights — foes stay engaged with him rather than walk off.
- Uses per fight when socketed: Carrot Toss 2.78, Wax On 2.38, Scatter 1.85, Back In My Day 1.83, Hook 1.79, Whack 1.62,
  Flurry 1.38, Leap 1.24, Rabbit Punch 1.21, Lecture 1.00; jab 250 and signature 5 in 102 fights (the party shares its
  Hype and fights are short). The remembered free skill was spent on 331 of his 605 turns (55%).
- Knobs if he proves too strong: the signature radius (3 → 2), the Robes moat, Scatter III's 4 rounds. Too weak:
  Flurry III (3×6), Punch I (7). The review changed no numbers.

## Known issues

- Barks name other heroes even when they are not in the party (the engine's bark picker has no party filter; same in
  every hero file; Request to RULES above). In character for a man who forgets who came along, but it adds up: 4 of 6
  `lowhp` and `idle` lines name someone.
- Marbles block surfaces that only form on bare tiles (`splash` puddles, blood from Bleed, Pebbles' `ignite` fire);
  `setSurface` callers (fire trails, holy ground) overwrite marbles. Intentional: marbles never bury another hero's
  surface, so whichever lands first stays.
- AutoPlay values Marble Scatter for the slips of foes already in the area, not for the trap it leaves.
- Full run at the review (2026-11-03: 788 suites): 20 failing sections, none in his files and no failing assertion
  mentions him — bosses_act1 18 (its tests still call the removed `DD.AI.plan`; mid-flight) and integration 2 (v1
  unlock expectations, "ten real heroes" now 16; the "no ... XP" Objective Failed step). Every `hero_marbles` and
  generic `content:` suite passes; no swallowed errors (`.tmp/marrev/full1.txt`).

## Tests (`tests/content/hero_marbles.js`)

- **registration, numbers and barks**: stats (init +2, hop, unlock null), pool of 10, cut ids gone, the simplicity
  checks on every desc (≤ 25 words, no if/else, no telegraph / intent / Guard / XP), v2 wording of the control descs,
  barks (counts incl. the `opportunity` key, length, ≥ 10 other heroes named incl. Valdris / Hjalmar / Pebbles, pronouns
  for every named hero), the blurb's walk-off hint, passive = one rule, surface, status, items without starting Block,
  sprite metrics, no registry warnings.
- **Jab and Whack**: every level (damage, push, cooldown counted in his own turns); no `opportunity` bark on his own-turn
  Jab; foes-only targeting; edge bump, pushed into a friend, a pit (env kill, +20 Hype), lava, water, an immovable brute,
  a kill skips the push.
- **Marble Scatter and Loose Marbles**: every level (shape, rounds, credit, the foe under it Vulnerable for its next
  turn, heroes never slip, the knight's payoff hit); range; other surfaces stay; durations never shortened; no
  marbles in pits / lava / walls; pushed across; a walking enemy slips on its own turn and stays Vulnerable through
  its next turn; the AI walks in; flyers float over (cast and `slip()`); expiry by rounds.
- **Rabbit Punch and Flurry of Paws**: every level; the stunned grunt loses exactly one turn; cooldowns; a wind-up is
  interrupted; the target dying mid-flurry; armor and thorns per strike; the Scatter combo; each level beats the one
  before at armor 0 / 1 / 2.
- **Back In My Day and Lecture**: Block and taunt radius per level; v2 taunt (the grunt hits him, not the 4-HP mage;
  his Block holds through the grunt's turn and resets at his next turn start); sleep = 2 lost turns, then it fights;
  damage wakes; Silence; a wind-up interrupted.
- **Carrot Toss, Leap, Hook, Wax On**: every level; 3 carrots per fight; ranges; leaping onto ledges and over pits, the
  III thump; hook straight-only, foes only, across a pit, immovable, bump, a kill; Empowered + the banked AP showing up
  on the knight's turn.
- **Absent-Minded Mastery**: free once; 60 turns with exactly one free skill and every socket coming up; cooldowns
  (incl. one ending this turn) and charges respected; (review) Silenced: his spell is never remembered (Lecture 0 of 12,
  Whack 12 of 12; control without silence: Lecture comes up); stun / sheep: no roll; gone before enemy turns, no popups;
  deterministic; only on his own turn.
- **Signature**: 8 + Stun within 3, far foes and allies untouched, the stunned foes lose their turn, a lone foe,
  stun-immune / Invulnerable foes, a wind-up interrupted, downed mid-burst by thorns.
- **Items**: Cane (push +1, the Hook stops next to him, other heroes' pushes unchanged; (review) the desc says pushes
  only, a 1-tile pull stays 1, a 1-tile push goes 2); Robes (+5 HP, nothing before
  his first turn end, other surfaces kept, the timing, a foe stepping up slips); Pills (two different skills free
  every turn).
- **Previews**: every skill × level × up to 6 targets — exact, no dice, side-effect free; a remembered skill previews
  at 0 AP without using up the memory.
- **v2 edge cases**: stunned / asleep / sheep / not enough AP / not his turn / deployment; rolled d20 + 2; charmed;
  null and dead targets; the map corner; hop; a Vulnerable during the foe's own turn when it acts first; Block
  through every enemy turn of the round.
- **Attacks of opportunity** (new): walking away from an adjacent grunt provokes its Stab (move preview
  `Combat.reachable(...).provokes`, `Combat.provokes` = Stab for 4, the event, no undo), a lethal one downs him on the
  tile he left; Leap, Whack and Hook never provoke (and the hook drags a grunt past the knight for free, then it is
  engaged with him); his Jab is his attack of opportunity (5, free, once per round, again next round, with a request for
  the `opportunity` bark; 6 on a Vulnerable foe walking off the marbles); none while stunned / asleep / a sheep /
  downed, nor on his charmer; Rabbit Punch,
  Lecture and the signature let him walk away free, Back In My Day lets the mage walk away from the grunt he taunted
  (control: stabbed without it); a reach-aware grunt engaged with him stabs him, not the 4-HP mage.
- **AutoPlay v2 battles at levels 1 / 3 / 5** (party `marbles, test_knight, test_cleric, test_mage` vs fixture acts
  1-3, 13 fights: wins, no errors, at least 8 of the 10 pool skills, the jab and the signature used) and **AutoPlay
  reads his kit** (signature into 3 foes, the free Punch with 1 AP left, a wind-up interrupted).
- **zz balance sim** (manual, `sim=1`): the numbers above, incl. attacks of opportunity by / on him.

## Requests (Nov 3) — heals that revive, barrels, flyers (CONTENT SWEEP heroes-1, 2026-11-04)

Suite: `hero_marbles: v2 requests — …`. Rules: `docs/notes/rules.md` "v2 requests".

- **Heals.** Carrot Toss no longer returns early on a non-active target (`if (!u || u.dead) return`), so a carrot aimed
  at a downed ally gets it up with the carrot's HP (6 / 8 / 10; preview "UP! N HP"), 1 AP and one of his 3 carrots.
  The desc ("Heal an ally…") already covers it. Wax On is a buff: never aimed at the downed.
- **Barrels.** Jab, Whack, Rabbit Punch, Flurry of Paws and Vaudeville Hook can be aimed at a volatile object (kept: a
  rabbit punching a barrel is canon). The melee ones put him in the blast (8; the preview shows it); the Hook sets it
  off where it stands (nothing yanked).
- **Flyers.** Loose Marbles already skipped flyers in `slip()`; the surface is a floor surface, so the engine keeps
  flyers off it too (a flyer whacked across two marble tiles: no slip, tested). Descs already say "grounded".
