# h19 contract (wave 0) — the lead's contract for heroes 18-20: Rasma, Biz and Phat Gus

`h19:contract`, Nov 18 2026, on HEAD 8688f41 (v3.2). Plan `.tmp/h19/plan.md` (§0.2 D1-D14, §1.1); the user's words and
the lead's reading `.tmp/h19/request.md` (they win over everything); the three judged addenda
`.tmp/h19/addendum-{rasma,biz,gus}.md` (normative for their hero's content); the scouts' `.tmp/h19/footprint.md` and
`.tmp/h19/roster.md`. ARCHITECTURE §1 ("h19" table) is normative for ownership; this file is the summary and the record.

Nothing here registers a hero: the three hero files and their suites are empty valid stubs. Nothing player-visible
changed (DESIGN / ARCHITECTURE are docs; the stubs register nothing; the sim rule only runs on the sim page).

## Files (this wave)

| File | What landed |
|---|---|
| `docs/ARCHITECTURE.md` | §1 the "h19 (heroes 18-20)" owner table after the V3 table, with the landing rule and the DESIGN writer rule; the Notes line names this file; §3.1 "all 20 available"; §3.2 `forgetWarning`: the sim's protected-skill rule (D4); §3.3 the optional status flags `showTurns` (V3 QA, documented here for the first time) and `showStacks` (D9, H19-SEATS builds it); §7.2 and §8.1 `statusChip` one line each on `showStacks` |
| `docs/DESIGN.md` | §1 / §2 / §3 / §6-intro hero counts (20; "4 of the 20"); §2 pronouns (Rasma, Biz, Phat Gus he/him; Hjalmarino and Spooder "it" or none, never he / she); §5 the h19 band note; §6 house rules: the Wet combos sentence (addendum-rasma §17); §6 reserved names (addenda §19.5 / §19.5 / §20.5); the Sustain paragraph (Biz's Overclock bask among the starters; Rasma's afterglow and Phat Gus's stress eating with the Winter Coat (Built In) among the passives; "each of h19's three heals only himself"); the three §6 briefs (addendum-rasma §25, addendum-biz §24, addendum-gus §26.1) after Benedick's; §6.1 three per-hero bullets (addendum-rasma §25, addendum-biz §24 + the near shapes against the other heroes' summons, addendum-gus §26.3) and the D7 Confused bullet; §11 the three hero events |
| `js/manifest.js` | `js/data/heroes/rasma.js`, `biz.js`, `gus.js` right after `benedick.js` (the user's order, D2); header line |
| `tests/manifest.js` | `tests/content/hero_rasma.js`, `hero_biz.js`, `hero_gus.js` right after `hero_benedick.js`; header line |
| `js/data/heroes/{rasma,biz,gus}.js`, `tests/content/hero_{rasma,biz,gus}.js` | empty valid IIFE stubs (`'use strict'`, `const DD = window.DD`, register nothing; the suite stubs register no suite) |
| `docs/notes/hero-{rasma,biz,gus}.md` | note skeletons with each addendum's outline (§22 / §22 / §23) and empty **Deviations** / **Requests** |
| `tests/core_tests.js` | the h19 twin of the manifest suite: "core: V3 manifests (h19) — Rasma, Biz and Phat Gus load once each, in the user's order, after Benedick" (each file once, right after the previous one, inside the hero block, not in `DD_MISSING`, no load error matching `/rasma|biz|gus/`; logs which of the three registered) |
| `tests/content/boss_svammiel.js` | the pinned `named.length === 17` (line 134) became `named.length >= realHeroIds().length` (D6); the per-hero "exactly one named line" loop (128-133) is unchanged |
| `tests/content/integration.js` | `PENDING_HEROES = ['rasma', 'biz', 'gus']` with a comment that the h19 integrator empties it; the forget-rule twin (below) |
| `tests/sim/sim.js` | the protected-skill rule (D4: `warns` / `isProtected`, exposed on `DD_SIM`); `WORN['lift:gus'] = 'gus_winter_coat'` (additive); the header's Policies and WORN sentences; one comment |
| `docs/notes/h19-contract.md` | this file |

## The decisions every owner builds against (plan §0.2; the addenda defer to them)

- **D1** ids / prefixes / files: `rasma` (`ras_`), `biz` (`biz_`), `gus` (`gus_`); `js/data/heroes/<id>.js`,
  `tests/content/hero_<id>.js`, `docs/notes/hero-<id>.md`; `isolate=heroes/<id>,hero_<id>` matches no other path.
- **D2** order: `…, 'hjalmar', 'pebbles', 'rasma', 'biz', 'gus', 'benedick'` in `UI.HERO_ORDER` and the renderer's
  fallback order (Benedick still "arrives last, obviously"). The manifests load the three after Benedick (load order is
  not display order).
- **D3** title seats: the 16 classic seats, Rasma [6, 2], Biz [0, 4], Phat Gus [0, 1], Benedick [4, 6] (index 19).
- **D4** the sim's protected-skill rule (landed here, wave 0, so every sanity sim is honest): `replaceIdx` never
  forgets a skill tagged `'shapeshift'` or whose `forgetWarning` resolves non-empty for that RunHero
  (`DD.resolve(def.forgetWarning, null, rh, '')`, exactly as `ui.js:2088` reads it). Rasma's `lastEnchantWarning`
  keeps his last enchantment; Biz's Overclock (a string) is kept; Biz's `'keystone'` tag is inert; Phat Gus needs none.
- **D5** the landing rule (V3's): wave 0 lands stubs, manifests and count widenings; H19-VOICE lands all three heroes'
  pools, named lines and events from day one; H19-SEATS lands order, seats and the 20-card fit; the hero owners replace
  the stubs; the integrator adds the ids to `ALL` / `REAL` **last** (an unregistered id in `ALL` silently skips the
  whole cross-content suite, `integration.js:27`).
- **D6** the one pinned count: `boss_svammiel.js:134` is `>=` the registry now; the integrator tightens it to `===`
  once all 20 register. `PENDING_HEROES = ['rasma','biz','gus']`; the integrator empties it.
- **D7** Confused on the hero side is shared by two kits: Phat Gus's status (three skills) and Hjalmarino's Cymbal
  Crash (one adjacent foe). Never "the first" or "the only" hero Confuse, anywhere. Near shapes: Fine, Have One ≈
  Campaign Promise / Hype Man (his is the only Haste, never "the only AP gift"); Too Many Eyes ≈ Murder of Crows III /
  Lullaby of Mediocrity III (never "the only area Mark"); The Hollow Hungers ≈ Entangling Roots.
- **D8** pronoun field: Biz and Phat Gus set `pronoun: 'he'`; Rasma relies on the engine default (he). The constructs'
  own texts (summon `name`, `names`, `desc`, `barks`; their four skills' `name`, `flavor`, descs at levels 1-3) carry
  no he / him / his / himself / she / her / hers / herself (Biz's suite pins it; the integrator's sweep widens to them).
- **D9** optional engine / UI: `showStacks: true` on a status def (H19-SEATS: the chip and the board glyph print the
  stack count from 1); everything else deferred to the digest's open list (Biz R1, A1, H1 / H2, M1, S1, W1; Gus's cost
  badge and `chomp` sound).
- **D10** numbers before release may move both ways inside each addendum's knob list (Q-P1: yes, request.md); the 17
  shipped heroes never change; Rasma's charges are never cut.
- **D11** no line in one new hero's files names another new hero or another hero's construct.
- **D12** none of the 17 shipped heroes' files changes (`js/data/heroes/*.js`, `tests/content/hero_*.js`,
  `docs/notes/hero-*.md`); the Hjalmar "tin double" gag lives in `biz.js`.
- **D13** DESIGN has one writer at a time: this contract pasted the briefs; hero owners write changes as a "DESIGN §6
  brief (h19)" block in their notes; the integrator re-syncs the three subsections; BAL updates number quotes; QA fixers
  fix text.
- **D14** release name: v3.3 (README gets a `**Version 3.3:**` line; the `**Version 3:**` line stays word for word).

The user on Phat Gus (request.md, appended Nov 18, wins over the addenda): "Phat Gus" is his full name; he is an
ACTUAL squirrel (an animal like Pebbles and Benedick, never a squirrel-person: race "Squirrel (Mostly Cheeks)", never
"-folk"; paws, cheeks and mouth, never hands; the beanie his only garment; he wields, wears and carries nothing), never
called a druid, russet with an acorn-cap beanie, never climbs; size jokes are his own, villains never aim at his body
("fat" is his word only; "squirrel" or "rodent" is fine). DESIGN's §6 brief now says so.

Standing rules (request.md): pronouns exact (she/her: Ellaria, Sparrow, Kiri; he/him: the other 14 shipped heroes and
Rasma, Biz, Phat Gus; the constructs "it" or none); ONE conditional heal each, grown from his own verbs, through
`DD.Act.heal(hero, target, n, { via: 'lift:<id>' })` after an `active()` check (Rasma's afterglow, Biz's bask, Phat
Gus's stress eating), never a heal button, an HP threshold, a revive or a combat-start shield; the healers of others
stay Ellaria, Josiah and Valdris; Ellaria is never touched. Difficulty: a normal four-act campaign about 25%, the three
near the median, enemies tuned, never one of the 17 down.

## Every owner's grant (ARCHITECTURE §1 "h19" is normative)

| Owner | Writes |
|---|---|
| Lead: contract (`h19:contract`; `h19:review-contract` the same files for its run) | the files in the table above |
| **H19-VOICE** (`h19:voice`, wave 1) | in the game files, only the `rasma` / `biz` / `gus` entries of: `js/data/svammiel_lines.js` (`HEROES.rasma/.biz/.gus`: roast ×6, back ×3, react); `js/data/bosses/svammiel.js` (`barks.named`: the three lines); `js/data/bosses/goats.js` (`rap_diss_<id>` ×4, `rap_close_<id>` ×2, `rap_back_<id>` ×2, optional BANTER `{ hero: id }`); `js/data/events.js` (`ev_ras_finishing_school`, `ev_biz_scrap`, `ev_gus_picnic`); the optional one named line per new hero in `js/data/bosses/{gardener,league,galbraith,coven}.js`; `js/data/narrator.js` verify only (edit only a tip that turns false). In the suites, only these lists and checks: `tests/content/svammiel_lines.js` (ROSTER, reserved names, COUNT_WORDS + eighteen / nineteen / twenty), `tests/content/narrative.js` (HERO_EVENTS, HERO_NAMES with `gus: 'Phat Gus'`, `H19_ONE_EVENT_HEROES`, COUNT_WORDS, the no-act-4-spoiler walk over every real hero), `tests/content/boss_goats.js` (ROSTER, one joke-split check per hero), `tests/content/boss_svammiel.js` (the three exact named lines; never the count line at ~136), `tests/content/boss_{gardener,league,galbraith,coven}.js` (NAMES maps; the gardener `heroWords` regex gains `Rasma|Biz|Phat|Gus`); `docs/notes/narrative.md` ("h19") |
| **H19-SEATS** (`h19:seats`, wave 1) | `js/ui/ui.js` (`UI.HERO_ORDER`, `statusChip`'s `showStacks`); `css/style.css` (`.ps-roster.many`, `.ps-body.many`, `.hall-heroes.many`, the tavern recruit grid); `js/ui/screens/{party_select,hall,tavern}.js` (the 20-card fit with headroom for 21, comments); `tests/ui_tests.js` (`H19_HEROES` beside `V3_HEROES`, `padHeroes` and the padded counts to 20 and 21, the hero-order and roster-fit suites and their comments, one new `showStacks` chip suite); `js/render/renderer.js` (`TITLE_SLOTS`, the fallback order, the board glyph's `showStacks`); `tests/render_tests.js` (the title-seat and fallback-order checks, one new `showStacks` glyph suite); `docs/notes/ui-v2.md` and `docs/notes/render-world.md` ("h19") |
| **HERO-RASMA / HERO-BIZ / HERO-GUS** | each its three files (replacing the stubs and the skeleton) |
| Reviewers | for their run, the files of what they review (a hero's three files; `review:shared` the voice and seats blocks) |
| Integrator (`h19:integrate`) | `tests/content/integration.js` (the integrator's file, as in v2 and V3; h19's changes: `ALL` += the three; `PENDING_HEROES = []`; the constructs' pronoun sweep; the determinism suite's party holding Biz and Phat Gus, plan §2.3; the log at line ~45 "17 with the full V3 content"), `tests/content/shared.js` (`REAL`, optional `HERO_PREFIX`), `tests/content/boss_svammiel.js` (count back to `===`), `tests/content/kit.js` (`OPT_OUT`: verify only), `tests/sim/sim.js`, `tests/docs_tests.js` (the stale Wet comment at ~208 only; `ORDER` stays v2's sixteen), `README.md`, `docs/DESIGN.md` (the three §6 subsections, §6.1, Sustain, reserved names), `docs/notes/h19-digest.md` (new) |
| BAL (`h19:balance`, `h19:audit`) | `js/data/balance.js`, `tests/balance_tests.js`, the numbers only in the three hero files (+ their suites' number asserts), DESIGN §5 quotes and the briefs' numbers, `docs/notes/balance.md` ("h19 pass") |
| QA lenses, fixers, gate | `.tmp/h19/qa/<lens>/` only; fixers by the plan's §2.6 clusters; the gate any file for a blocker |

## The READY lines (each owner writes its own; the hero owners check them before their final full run)

- H19-VOICE writes **`READY: h19 voice pools`** in `docs/notes/narrative.md` once the three heroes' Svammiel pools,
  named lines, goat lines and hero events (+ their suites' lists) have landed and its full run is green.
- H19-SEATS writes **`READY: h19 seats`** in `docs/notes/ui-v2.md` once the order, the seats, the 20-card fit and
  `showStacks` have landed and its full run is green.
- Rasma and Phat Gus start after both lines exist (wave 2); Biz starts in wave 1 and checks both before his final full run.

## Test widenings (wave 0, one time)

- `core_tests.js`: the h19 twin of the manifest suite (above). The V3 suite is unchanged; both match `suite=core: V3 manifests`.
- `boss_svammiel.js`: `t.ok(def.barks.named.length >= realHeroIds().length, …)`. With the stubs: 17 lines for 17 heroes.
  Once the voice owner lands the three lines: 20 ≥ 17..20 while the heroes register. The integrator restores `===`.
- `integration.js`: `PENDING_HEROES = ['rasma', 'biz', 'gus']` (an event naming one of them before his file registers
  is logged, not failed). The forget-rule twin — suite "integration: V3 — the campaign sim never forgets a shapeshift
  skill (…) nor, h19, one whose forgetWarning speaks" — keeps every shapeshift check and adds: three temporary `test_`
  skills (owner `test_knight`, registered in the suite and deleted in a `finally`): a string `forgetWarning` (kept at
  level I in socket 0), an `(L, rh) => string` warning that speaks only for the last of its kind (kept alone; silent
  and forgettable next to another of its kind), the forget picker's reading equals the sim's, nothing-but-protected
  → −1; then it **logs** (does not pin) the protected set of the 17 shipped heroes and of any h19 hero registered.
  Reading at HEAD: tag-protected `ell_wildshape`, `bas_transform`, `ben_shell` (Blood Moon is Basanos's signature,
  never socketed); warned `bas_transform`, `ben_shell`; added by the new rule: none — the 17 are unchanged.
- `sim.js`: `warns(id, rh)` and `isProtected(id, rh)` on `DD_SIM`; `replaceIdx` skips `isProtected`; the
  `shapeshiftKept` counter keeps counting (it now includes forgetWarning keeps; review-contract renamed the report
  line to "skill replacements that kept a protected skill (shapeshift or forgetWarning, h19 D4) N", pinned by the twin);
  `WORN['lift:gus'] = 'gus_winter_coat'` is inert until `gus.js` registers the item (an unworn item adds nothing, and
  the "== conditional heals" table lists only labels that fired). `docs_tests.js:509` pins the five older entries only.

## Spot-checks at HEAD (every claim the contract relies on)

| Claim (source) | At HEAD | Verdict |
|---|---|---|
| `js/manifest.js:70` benedick.js; `tests/manifest.js:38` hero_benedick.js (footprint §2.1) | 70 / 38 | true |
| core manifest suite at `core_tests.js:178-198` (footprint) | 180-197 | true |
| `boss_svammiel.js:134` pins 17; the per-hero loop at 128-133 (plan D6) | 134; loop 128-133 | true |
| nothing else in `tests/` or `js/` pins 17 heroes (plan D6) | grep `\b17\b|seventeen`: only that line, COUNT_WORDS (narrative.js:76, svammiel_lines.js:303: voice), a log in integration.js:45, a comment in ui_tests.js:1598 (seats), unrelated numbers | true (the log and the comment pin nothing) |
| `PENDING_HEROES` at `integration.js:126` (footprint §2.2) | line 127 (`const PENDING_HEROES = [];`) | off by one, harmless |
| `ui.js:2088` reads `DD.resolve(sd.forgetWarning, null, rh, '')` (plan D4) | 2086-2089 | true |
| only Basanos and Benedick have a `forgetWarning`, both on `'shapeshift'` skills; Ellaria's Wild Shape tagged without one (plan D4) | `basanos.js:432` (`bas_transform`, tags shapeshift at 416), `benedick.js:1016` (`ben_shell`, 1002); `ellaria.js:575` | true (the twin logs it) |
| `sim.js` WORN header ~48, WORN at 181, `replaceIdx` 230-244 (plan / footprint) | 48 / 181-182 / 230-244 | true |
| `docs_tests.js:509` pins exactly the five older WORN entries; 208-214 the Wet rule (plan) | 509-510; 208-214 | true; my Wet text keeps "Thunder Jar", "Frost Flask", "Electric Lute", never "Wet for lightning" / "soaks foes for lightning" / "Wet → lightning, oil" |
| DESIGN counts at ~28, 38, 60, 112, 434; Wet sentence ~402 in §6 (plan §1.1) | 28, 37-38, 60, 112, 434; 401-403 | true |
| no hero skill inflicts Confused today (D7's "two kits share it") | no hero / generic / item source applies `confused` to a foe (only two Blessing downsides on yourself) | true for skills; review-contract: a wild surge's Confused Duck (`wildmagic.js:302-314`, its Honk of Confusion at 668-682) Confuses a foe on the hero side, so DESIGN §6.1 names it |
| "the only Haste" (D7, addendum-gus §10) | review-contract: a wild surge's Caffeine Surge (`wildmagic.js:291-299`, from Zarathor's Wild Card or any surge) Hastes the surger | Phat Gus's is the only Haste a hero hands an ally; DESIGN §6.1 says so |
| "A Disapproving Look is the hero side's only Silence" (addendum-rasma §25) | no hero, generic, item or consumable applies `silenced` | true |
| the summons Biz is compared with (footprint §5.1): `zar_statue` (Statue of Me, immovable, Taunts), `spa_clone` (Evil Twin, Taunts, 2 a fight), `cor_lawyer` (once a combat), Onyx (`josiah.js` passive, Raven Dive calls it back), corgis | `zarathor.js:283/524`, `sparrow.js:383/499`, `corelos.js:572`, `josiah.js:193/405/637`, `ellaria.js:677` | true |
| status chips show stacks only from 2 (`ui.js:1555`, `renderer.js:3540`), `showTurns` exists (D9) | `if (num(st.stacks, 1) > 1)` / `if (st.stacks > 1)`; `showTurns` at ui.js:1557, renderer.js:3542 | true |
| the isolate filter keeps `DD_MANIFEST` whole (the twin checks the lists, not what loaded) | `loader.js:15-23` filters a local copy | true |

Disagreements with the scouts / addenda (none changes a decision):
- footprint §2.2 puts `PENDING_HEROES` at line 126; it is 127.
- addendum-biz §17 asks the integrator for a `'keystone'` tag in `replaceIdx` (request I1) and addendum-rasma §17 for
  the `forgetWarning` rule as the integrator's: plan D4 replaced both with one rule, landed here in wave 0.
- footprint §6 proposed wave-0 widenings of `ui_tests.js` / `render_tests.js` and a NONE pronoun class: the plan gives
  `ui_tests.js` / `render_tests.js` to H19-SEATS, and the user answered he/him for Phat Gus, so no NONE class.

## Deviations

- **DESIGN, the "no act-4 word" rule for the h19 texts**: Rasma's §6 brief drops the addendum's last combo clause
  ("Galbraith's Counterspell can't touch steel, enchanted or not": Galbraith is an act-4 villain), and the three briefs
  open with "h19, the Nth hero (the user, Nov 18; normative spec …). Available from the start." instead of the Gus
  addendum's "not an act-4 spoiler" (Benedick's brief keeps its own wording). The reserved-names sentence says "no enemy
  or boss skill ever uses them" instead of "act-4 enemies". The addenda keep the clause; the integrator may restore it if
  the lead wants it.
- **DESIGN, pronoun-safe brief text**: Biz's brief says "HP 8 + twice Biz's level" / "HP 6 + twice Biz's level" where
  the addendum wrote "twice his level" (a sentence that names Hjalmarino / Spooder; "his" meant Biz). Same numbers.
- **DESIGN §11**: the "35 events" count is not touched (the three events are the voice owner's to land; the integrator
  can recount once they exist).
- **core_tests.js**: an h19 twin suite rather than widening the V3 one (the V3 suite stays V3's record; both match
  `suite=core: V3 manifests`).
- **ARCHITECTURE §3.3** also documents `showTurns` (V3 QA's flag, previously only in §7.2 / §8.1) next to `showStacks`.
- **DESIGN §6.1, D7's "the only Haste"** (review-contract): a wild surge's Caffeine Surge Hastes the surger, so the Phat
  Gus bullet says "the only Haste a hero hands an ally"; the Confused bullet keeps D7's words and adds that a wild
  surge's Confused Duck also Confuses a foe (no "first" / "only" anywhere). Same decision, true words.
- **core_tests.js, the h19 twin's load-error check** (review-contract): it matches the files' paths
  (`/(?:heroes\/|hero_)(?:rasma|biz|gus)\.js/`) instead of plan §1.1's bare `/rasma|biz|gus/` ("gus" is inside
  "fungus" and "disgust", "biz" inside "bizarre"); a self-check pins both cases.

## Requests

- **H19-SEATS**: `showStacks` (D9) in `UI.statusChip` and the renderer's status row (ARCHITECTURE §3.3 / §7.2 / §8.1
  now describe it); a test each.
- **h19 integrator**: tighten `boss_svammiel.js` (~136) to `===` the registry; empty `PENDING_HEROES`; add the three to
  `ALL` / `REAL` last; the log at `integration.js:45` still says "17 with the full V3 content" (harmless; say 20). (The
  sim report line is renamed already: review-contract.)
- **Hero owners**: Rasma's enchantments carry `forgetWarning: lastEnchantWarning` and Biz's Overclock its string, as
  their addenda say; the sim keeps them from wave 0 on (no `'keystone'` tag needed).
- **HERO-GUS, H19-VOICE, qa:voice** (review-contract): never write "the only Haste" bare (notes, tips, descs, flavour):
  a wild surge's Caffeine Surge Hastes the surger. "The only Haste a hero hands an ally" is true. Likewise Confused:
  besides Phat Gus and Cymbal Crash, a wild surge's Confused Duck Confuses a foe (D7 already forbids "first / only").

## Review (`h19:review-contract`, Nov 18)

Checked in the files and in a run, not from the report: every new file has one owner at a time in ARCHITECTURE §1 (the
contract lands the nine stubs and skeletons, the hero owners replace them; `h19-contract.md` the contract's,
`h19-digest.md` the integrator's); both manifests load the six stubs once each, right after Benedick's, inside the hero
block; no test under `tests/` pins 17 heroes (grep `\b17\b|seventeen`: COUNT_WORDS lint lists, a log and two comments,
unrelated numbers; `ui_tests.js:1602`'s padded count is seats'); `replaceIdx` read line by line (the 17's protected set
is the tag set: the twin logs warned ⊆ tagged, added none); `PENDING_HEROES` lists the three; DESIGN carries step 3
(counts, pronouns, the Wet sentence verbatim from addendum-rasma §17, §5 notes, the reserved names of addenda §19.5 /
§19.5 / §20.5 complete, Sustain, the three briefs, §6.1 with D7, §11); `git diff` touches no game file but the manifest
and the stubs, and none of the 17 heroes' files. Fixed:
- ARCHITECTURE §1 / this file's grant table: H19-SEATS's `tests/ui_tests.js` and `tests/render_tests.js` were whole
  files; now named blocks (the order / fit / seat checks and one new `showStacks` suite each). H19-VOICE's "only the
  rasma, biz and gus entries" did not cover the suite-side lists it must widen (COUNT_WORDS, the spoiler walk): now
  "the entries" in the game files and "these lists and checks" in the suites. The integrator's `integration.js` grant
  named three blocks and left out the determinism suite plan §2.3 gives it (and the roster log): now the whole file, as
  in v2 / V3, with h19's changes listed.
- DESIGN §6.1: "the only Haste" was false (a wild surge's Caffeine Surge) and the Confused bullet omitted the wild
  surge's Confused Duck (Deviations above). The §11 event line and the reserved-names line ran past 120 columns, the
  two sprite bullets by two: re-wrapped.
- `tests/sim/sim.js`: the report line said "kept a shapeshift skill" while it counts forgetWarning keeps too: now
  "skill replacements that kept a protected skill (shapeshift or forgetWarning, h19 D4) N" (no script parses it; the
  twin pins the label against `DD_SIM.tally().shapeshiftKept`). The header says so.
- `tests/core_tests.js`: the load-error check matches file paths (Deviations above).
- `tests/content/integration.js` (the twin): the h19 log reads each new hero's starting skills too, as the 17's does.

Runs: `tools/test.sh "suite=core: V3 manifests,never forgets a shapeshift&verbose=1"`: PASS, 3 suites, 57 assertions
(V3 manifests 23, the h19 twin 16, the forget twin 18; logs as above). Full `bash tools/test.sh`: **PASS — 1320
suites, 150927 assertions, 0 failures**, missing scripts none, 0 "Error in" lines
(`.tmp/h19/review-contract/full_test.txt`). No sim re-run: the rule's code is unchanged, only the report's label.

## Tests (wave 0)

All on the wave-0 tree (the stubs registered nothing; 17 heroes in the registry):
- `tools/test.sh "suite=core: V3 manifests"`: PASS, 2 suites, 38 assertions (the V3 suite 23, the h19 twin 15; "h19
  heroes registered so far: none (the stubs)").
- `tools/test.sh "suite=never forgets a shapeshift"` (no isolate): PASS, 17 assertions; logs: tag-protected
  `ell_wildshape, bas_transform, ben_shell`, warned `bas_transform, ben_shell`, added by the new rule: none.
- `tools/test.sh "suite=boss_svammiel&isolate=svammiel,heroes/"`: PASS, 26 suites (3 skip as before: no door with a
  Svammiel cheat, dm.js not loaded, the sim=1 author sims), 712 assertions.
- Full `bash tools/test.sh`: **PASS — 1320 suites, 150925 assertions, 0 failures**, missing scripts none, 0 "Error in"
  lines (`.tmp/h19/contract/full_test.txt`). `tools/test.sh "suite=docs:"` re-run after the last DESIGN edits: PASS
  (6 suites, 101 assertions).
- Sanity sim `bash tools/sim.sh "debug=1&raw=1&seeds=50&from=86700" .tmp/h19/contract/sanity.txt`: 50 normal runs,
  4 acts, random 4 of 17: wins 11 (22%, CI 13–35%), act 3 cleared 42%, doors 96% (91/95), Svammiel 11/17, 0 timeouts,
  **0 errors, 0 DD.warn lines**, skill replacements that kept a protected skill 2 (the v3.2 pages read 0-6 per 100
  runs: the same order; nothing of the 17 is newly protected).
