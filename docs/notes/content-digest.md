# CONTENT DIGEST — the whole game, integrated (briefing for balance / playtest / polish)

> **SUPERSEDED (v2).** This is the v1 digest (10 heroes, telegraphs, Guard, XP, unlocks), kept for history. The current
> content map, the 16 v2 kits, sims and open requests are in `docs/notes/v2-digest.md`.

Written by the integrator after all 19 content areas landed and were reviewed. Everything below was measured with every
file loaded together. Owner notes (`docs/notes/<area>.md`) stay the source of truth for each area's details.

**State**: `bash tools/test.sh` → PASS, 525 suites, 81,307 assertions, 0 failures, no swallowed `Error in` warnings
(the only `warnings:` lines are deliberate: junk-content tests in mapgen/run/render, and the documented `sla_gasket`
advisory). Whole 3-act campaigns play end to end under AutoPlay with zero errors or warnings: 470 simulated runs (~7,000 fights) across the integration batches.

---------------------------------------------------------------------------------------------------------------------

## 1. Content map (ids by area)

### Heroes (10) — `js/data/heroes/*.js`
| id | name | role · stats (L1 HP +growth, move, flags) | passive | basic · signature | starting skills |
|---|---|---|---|---|---|
| `zarathor` | Zarathor | ranged fire chaos · 24 +4, mov 4 | Drip Check (+10% dmg / 50 gold, max +30%; every 4th spell surges) | `zar_basic` · `zar_signature` | `zar_fireball` `zar_bling_throw` |
| `syllamin` | Syllamin (he/him) | support / telegraph sabotage · 20 +3, mov 5, flying | Heckler (Roasted stacks → Emotional Damage stun) | `syl_basic` · `syl_signature` | `syl_heckle` `syl_power_ballad` |
| `marbles` | Professor Marbles | melee skirmisher / control · 28 +4, mov 4, hop | Absent-Minded Mastery (one free skill a turn) | `mar_jab` · `mar_signature` | `mar_whack` `mar_scatter` |
| `marwyn` | Marwyn | tank / taunts · 35 +5, mov 3 | MAGNIFICENCE (stacks → surge; pushes 1 shorter) | `mrw_ginger_snap` · `mrw_behold` | `mrw_war_cry` `mrw_yeet` |
| `ellaria` | Ellaria | corgi summoner / healer · 26 +4, mov 4 | Pack Leader (starts with a corgi) | `ell_thorn_whip` · `ell_release` | `ell_summon_corgi` `ell_spring` |
| `josiah` | Josiah (unlock: act 1) | poison healer + raven · 26 +4, mov 4 | Unlicensed Apothecary (raven, Contagion, +1 consumable slot, brews) | `jos_cane` (House Call) · `jos_pandemic` | `jos_plague_flask` `jos_draught` |
| `sparrow` | Sparrow (unlock: act 2) | bleed assassin, HP costs · 22 +3, mov 5 | Blood Price (dmg grows as HP drops; bleeding foes pay her HP costs) | `spa_basic` · `spa_signature` | `spa_hemoglob` `spa_juicebox` |
| `corelos` | Corelos (unlock: act 3 / the DM) | rune traps + bargains · 24 +4, mov 4 | Collateral Damage (Debt; deaths pay it off) | `cor_rune_bolt` · `cor_fine_print` | `cor_glyph` `cor_bargain` |
| `slate` | Slate (unlock: beat `lichtenstein`) | grappler / thrower · 32 +4, mov 3, armor 1, immovable | Short Fuse (Rage; 3+ flares runes) | `sla_love_tap` · `sla_tantrum` | `sla_hold_still` `sla_personal_space` |
| `buga` | Mayor Buga (unlock: beat `grimble`) | manipulator / loot · 24 +4, mov 4 | Skimming Off the Top (civic fee gold, Endorsed Hype) | `buga_pamphlet` · `buga_toast_of_the_town` | `buga_delegate` `buga_fine` |

Pools (besides the starters): zarathor `zar_chaos_bolt zar_bedazzle zar_rebuke zar_lasso zar_strut zar_gold_plating zar_statue zar_wild_card` ·
syllamin `syl_hype_man syl_shriek syl_glitter_bomb syl_lullaby syl_encore syl_fae_blink syl_sick_burn syl_mosh_pit syl_mic_drop` ·
marbles `mar_punch mar_flurry mar_backinmyday mar_thumper mar_lecture mar_carrot mar_leap mar_hook mar_waxon` ·
marwyn `mrw_cleave mrw_hero_landing mrw_headbutt mrw_charge mrw_gun_show mrw_rage mrw_magnetism mrw_keg_stand` ·
ellaria `ell_roots ell_barkskin ell_good_boy ell_fetch ell_zoomies ell_bowling ell_switcheroo ell_wildshape` ·
josiah `jos_raven_dive jos_leeches jos_miasma jos_quarantine jos_vaccinate jos_volatile jos_tonic jos_murder jos_salts` ·
sparrow `spa_papercuts spa_spray spa_scab spa_goblinmode spa_puppet spa_twin spa_blooddrive spa_veinglory` ·
corelos `cor_detonate cor_served cor_restraining cor_cease cor_sign_here cor_soul_contract cor_attorney cor_lawyer cor_collect` ·
slate `sla_rocks_fall` (displayed "Hard Pass") `sla_air_mail sla_foot_down sla_lawn sla_rock_bottom sla_gasket sla_get_over_here sla_rooted` ·
buga `buga_promise buga_human_shield buga_bribe buga_butter_up buga_red_tape buga_photo_op buga_pork_barrel buga_crumbs`.
Hero summons: `zar_statue cor_imp jos_raven ell_corgi spa_clone` (+ item summon `steve_torchbearer`).
Fight-wide hero rules (HUD chips): Josiah's Contagion, Buga's Civic Fee, Slate's Short Fuse, Corelos' Collateral Damage.

### Shared kit — `skills_generic.js`, `consumables.js`, `items.js`
- **Generic skills (12)**: `gen_throw_chair gen_second_wind gen_dodge_roll gen_shove gen_rally gen_first_aid gen_pocket_sand
  gen_taunt gen_sucker_punch gen_barrel_toss gen_power_nap gen_tactical_retreat` — every hero can learn every one (tomes,
  level-ups, shops; checked by `integration:` suite).
- **Consumables (14)**: `con_red_drink con_big_red_drink(R) con_bad_decisions(R) con_smoke_bomb con_energy_drink con_antidote
  con_liquid_courage con_scroll_of_yeet(R) con_bag_of_d4s con_holy_water con_frost_flask con_thunder_jar(R) con_pocket_sand
  con_mystery_potion`; 20–32 gold; all drop from rewards and shops.
- **Items (79)**: 49 shared (18 common, 16 rare, 7 legendary, 8 cursed) + 30 hero items (3 per hero: rare/rare/legendary,
  Syllamin's jacket and Ellaria's robe are common). Shared: common `rusty_shiv tiki_torch hygiene_fork butter_knife yardstick
  big_stick chainmail_bikini grandmas_gambeson hedgehog_hoodie galoshes fireproof_apron turtle_shell coin_purse foam_finger
  pretzel_pouch dog_treat_bandolier hang_in_there_poster whetstone` · rare `flametongue_knockoff discount_headsman_axe
  high_horse_lance ldr_longbow vampire_spork mithril_shirt undying_undies spiked_pauldrons crash_helmet tinfoil_hat
  scented_candle adrenaline_jar encore_kazoo compound_interest_ledger hireling_contract party_balloons` · legendary
  `excalibur_rental darryl_hammer overkill_glaive phoenix_down_jacket gilded_breastplate chaos_crystal pocket_hourglass` ·
  cursed `flail_of_flailing sentient_sword barrel_armor mimic_mail haunted_plate bag_of_tricks_tricked pay_to_win_medallion
  indiscriminate_ring`. Every item can drop (3,600-draw reachability check); hero items need their hero in the party.

### Enemies (51) and encounters (39) — `js/data/enemies/*.js`, `js/data/bosses/*.js`
| act | minions | normals | elites | boss(es) |
|---|---|---|---|---|
| 1 | `a1_rat a1_slimelet` (+ `grim_intern rat_plaintiff`) | `a1_gob_grunt a1_gob_kid a1_kobold_rep a1_slime a1_spore_bro a1_spider a1_critic` (+ `rat_lawyer`) | `a1_mimic a1_bugbear a1_cube` | `grimble` 150, `rat_king` 200 |
| 2 | `a2_skeleton_intern a2_hollandaise a2_tesla_coil` (+ `lich_intern iris_floater`) | `a2_zombie_unpaid a2_brunch_cultist a2_wisp a2_owlbear_cub a2_banshee a2_gargoyle a2_pixie_swarm` (+ `lich_mimic`) | `a2_mama_owlbear a2_necro_ta a2_gary` | `lichtenstein` 260, `dr_iris` 280 |
| 3 | `a3_imp_influencer a3_kobold_shield a3_backup_dancer` (+ `dm_cameo_goblin dm_cameo_skeleton dm_cameo_imp`) | `a3_hell_hound a3_mind_flayer a3_eyeball_intern a3_rules_lawyer a3_nat1_golem a3_succubus_coach` | `a3_red_dragon a3_death_knight a3_pit_fiend` | `dungeon_master` 480 (3 phases) |

Encounters — act 1: normal `a1_rats_in_the_cellar a1_goblin_ambush a1_slime_time a1_fungus_among_us a1_web_of_lies
a1_union_meeting(destroy) a1_open_mic(protect) a1_big_flush(survive)` · elite `a1_mimic_hoard a1_last_call a1_cube_cleanup` ·
boss `boss_grimble boss_rat_king`. Act 2: normal `a2_unpaid_internship a2_bottomless_brunch a2_cub_scouts
a2_follow_the_lights a2_forbidden_buffet(destroy) a2_last_coffee(protect) a2_rooftop_critics a2_graveyard_shift(survive)` ·
elite `a2_mama_bear a2_office_hours a2_its_alive a2_tenure_review` · boss `boss_lichtenstein boss_dr_iris`. Act 3: normal
`a3_hellhound_walkies a3_influencer_collab a3_self_help_seminar(survive) a3_trial_by_combat a3_cursed_dice_night
a3_kobold_pep_rally(destroy) a3_snack_heist(protect) a3_intern_orientation` · elite `a3_hoarders_lair
a3_very_dramatic_entrance a3_tax_season` · boss `boss_dm`. The run picks one of the act's boss encounters at random for
acts 1 and 2.

### Narrative, run layer, misc
- **Events (30)**: 17 generic (`ev_dice_goblin ev_session_cancelled ev_snack_run ev_trap_hallway ev_mimic_meeting
  ev_goblin_mlm ev_cursed_clearance ev_wizard_did_it ev_fountain_youth ev_career_fair ev_overdue_book ev_owlbear_daycare
  ev_retcon ev_rules_lawyer ev_infernal_dmv ev_dragon_yard_sale ev_dm_notes`) + 13 hero events (one per hero, two for
  Slate and Buga; weight 2, only with that hero alive). 21 / 25 / 23 eligible per act.
- **Narration**: 63 keys, ~390 lines (every §3.10 key; 52 tips; 14 `boss_start` lines from 6 authors, no duplicates).
- **Random passives**: 79 (33 common, 18 uncommon, 11 rare, 6 legendary, 11 cursed) — another workflow owns them.
- **Scars (13)**, **wild surges (30)**, **themes (9)**: `cellar sewer warren hauntwood academy graveyard hellscape hoard dm_table`.
- Content statuses (~45, owner-prefixed), content objects (`cor_rune sla_boulder buga_pork_barrel a1_strike_fund
  a2_bone_pile a2_bone_wall a2_chafing_dish a2_coffee_machine a3_hoard_pile a3_snack_bowl grim_* rat_valve lich_* iris_*
  dm_*`), surfaces (`con_d4s syl_glitter mar_marbles jos_miasma ell_bramble buga_crumbs`), terrain (`grim_dropzone rat_rot
  lich_rug iris_lino dm_track`).

## 2. Notable mechanics the next phase should know

- **Telegraph honesty is engine-enforced**: enemy numbers come from `DD.AI.intentDmg` live, with three flat channels —
  status `telegraphFlat(st, unit)` (Roasted), skill `telegraphFlat(unit, intent)` (pack tactics, vendetta, house rules,
  late fees, buried rat pile) and the attacker multipliers. The `content:` suites fail any attack that hits outside its
  telegraph. Not yet in ARCHITECTURE (see §5, Lead).
- **Engine hooks beyond the contract**: `modifyStatus(s)`, `modifyPush(p)` (Marwyn, Barrel Armor), status/def extras
  (`defaultTurns, skipFresh, enemyDecay, stunLike(doc only), hazard/hazardDmg/hazardEnd, airborne, slide, react,
  smashable, onRoundEnd`), `Act.withCredit`, `Act.fall`, `Combat.resolveSkill`. Content idiom "exact damage" =
  `d.mult = 0; d.flat = n` in a target hook (Rat King flush, Crash Helmet's `flat = -1e6`).
- **Boss puzzles all feed AutoPlay hints** (`autoplay` on objects): Grimble's 3 Tax Loophole levers → vault drop; Rat
  King's 2 sluice valves → flush into the drain; Lich-tenstein's card catalogs + phylactery shelves (renewal until all 3
  are shredded); Dr. Iris's 6 rotatable mirrors (beams reflect into her); the DM's screen panels → track switches →
  Player's Handbooks vs the 3-round "Rocks Fall, Everyone Dies". Every boss has a stun guard status.
- **Hype**: +8 kill, +20 environmental kill, +4 multi-hit; signatures cost 100 (see §4: almost never fire).
- **Run layer**: one Blessing roll per hero at run start and per level; Josiah adds a consumable slot; recruits are built at
  the party's average level; boss unlocks via `unlock: { boss }` (Grimble → Buga, Lich-tenstein → Slate).

## 3. Whole-campaign AutoPlay simulation (integration harness)

Harness: `.tmp/integrate/sim.html` + `sim.js`, run with `bash .tmp/integrate/page.sh sim "seeds=40&from=0&diff=normal&verbose=1"`
(scratch; params `seeds from diff maxr timeout party verbose`). It plays full runs through `DD.Run` (`useUi = false`):
random 4-hero parties from all 10 heroes, random node choice, sensible picks (learn until 4 skills, then upgrades; best
loot; equip upgrades; shop: heal under 60% HP, rarity upgrades, consumables with spare gold; tavern: recruit over the
dead, rest under 75% HP or 2+ scars, else train), events at random, every fight by `DD.AutoPlay.runBattle(30)`. Items and
random passives are in play (unlike most author sims). The test suite carries a 2-seed version
(`integration: whole campaigns …`, `&n=` for more).

**Results** (final code: all integration fixes in; casual seeds 700–729, normal 200–299, brutal 500–559):
| difficulty | runs | campaign wins | act 1 / 2 / 3 clear | boss wins | levels at bosses | fights | timeouts | errors |
|---|---|---|---|---|---|---|---|---|
| casual | 30 | 100% | 100 / 100 / 100% | all 100% | 3.9 / 6.8 / 9.0 | 475 | 0 | 0 |
| normal | 100 | 92% | 100 / 94 / 98% | Grimble 50/50, Rat King 50/50, Lich 47/47, **Iris 47/53**, DM 92/94 | 3.8 / 6.8 / 9.2 | 1,549 | 0 | 0 |
| brutal | 60 | 68% | 98 / 76 / 91% | Grimble 26/27, Rat King 33/33, Lich 28/33, **Iris 17/26**, DM 41/45 | 3.8 / 6.7 / 9.2 | 859 | 0 | 0 |

(The casual batch predates fix 6 below; it lost nothing anyway. Before fix 6 the same normal / brutal seeds gave 90% /
63%: lost protect objectives ended 2 normal and 3 brutal campaigns.)

- **Normal and elite fights are never lost to damage**: every one is won on normal and brutal except lost protect
  objectives (`a1_open_mic` keg 2/46 normal, 2/34 brutal; `a2_last_coffee` 1/26 brutal — now "Objective Failed", the
  run goes on). They cost 0–10% of party HP (elites 0–6%) and run 3.5–6.5 rounds (bosses 5.4–7.7 normal, up to 10 on
  brutal; the DM's longest fight 19 rounds). Only bosses threaten a run. Party HP numbers include in-fight healing.
- **Campaign losses** (normal 8 / 100): Dr. Iris 6, the DM 2. Brutal (19 / 60): Iris 9, Lich-tenstein 5, the DM 4,
  Grimble 1.
- **Hero downs by cause** (normal, 263 downs in 100 runs): Dr. Iris's Clinical Gaze status 100, Rat Pile 21, DM Railroad
  20, DM fudged roll 17, Imp Go Live! 12, Eye Exam 9, eye beams 8, Rocks Fall 7. Brutal (337): Iris gaze 64, eye beams
  28, Railroad 21, Grimble's Audit 21, DM fudged roll 20, Lich (Late Fees interest status) 19, DM doom 15. Permanent
  deaths: 0 in the final normal and brutal batches (2 in an earlier 40-run batch).
- **Per hero** (normal, damage per fight incl. summons / run-win rate): Zarathor 69 / 91%, Syllamin 55 / 92%, Corelos
  52 / 93%, Josiah 51 (11 raven) / 90%, Sparrow 48 / 90%, Marbles 47 / 94%, Ellaria 41 (14 corgis) / 97%, Slate 37 / 90%,
  Buga 37 / 97%, Marwyn 27 / 87%. Brutal run-win rate: Ellaria 88%, Josiah 83%, Zarathor 75%, Corelos 74%, Marbles 72%,
  Buga 68%, Slate 64%, Syllamin 63%, **Sparrow 50%, Marwyn 48%** (healers carry brutal; the HP-cost assassin and the
  tank trail).
- **Skills AutoPlay never uses** (all tested and working; AutoPlay scores 0 for no-damage/no-heal utility): `zar_rebuke
  zar_strut syl_encore syl_fae_blink ell_switcheroo spa_goblinmode gen_dodge_roll gen_tactical_retreat gen_power_nap`;
  rarely `buga_bribe jos_salts (needs a downed ally)`. Signatures: 0–0.1 uses per hero per fight (see §4).
- **Gold** (normal, per run): ~930 earned, ~215 spent in ~1.4 shop visits (random routing), ~670 left at the end; event
  net +8. Brutal ~840 earned / ~615 left. Consumables: the bag is usually full (Josiah brews, AutoPlay drinks only when a
  preview scores ≥ 10); ~4 consumables used per run.
- Rewards taken (normal): items 922, upgrades 318, skills 130, heals 89, gold 50, consumables 27. Level choices: upgrade
  2157, learn 809, perk 241.

## 4. Cross-cutting balance observations (for the balance phase)

1. **Real parties crush everything but bosses.** Every content author measured the same gap (fixture yardstick vs real
   kits): real heroes win act 1–3 normal/elite fights losing 1–10% HP, and in whole runs (items + Blessings) win 92% of
   normal campaigns. All enemy numbers already sit at the top of the DESIGN §5 bands, so per-enemy tuning won't close it.
   Global knobs to consider (one place, not per file): enemy HP band multiplier per act, +1 enemy on normal (brutal does),
   a shared boss difficulty multiplier, or hero-side numbers (basic attacks 4–6 at 1 AP are the bulk of damage).
2. **Difficulty curve is boss-only.** Run outcomes are decided by Dr. Iris (act 2) and the DM; act-1 bosses are ~100% on
   normal. Dr. Iris is the outlier (normal 89%, brutal 65%, 56–65% party HP lost, 2.3–3.9 downs/fight) because AutoPlay
   never uses pillar cover vs Clinical Gaze — humans will find her easier, but she is also the only fight where
   positioning against an aura is required; confirm in playtests before tuning her down.
3. **Signatures almost never fire.** DESIGN: "roughly one per fight". Measured: Hype reaches 100 in swarm/survive fights
   (`a1_big_flush` 100%, rats 73%, slimes 76%) but in few boss fights (Grimble 2%, Lich 2%, Iris 0%, DM 9%; the Rat King 32% thanks to his lawyers), and
   normal fights end in ~4 rounds. Hype sources are kill-driven; boss fights have few kills. Candidates: Hype for damage
   dealt/taken, phase transitions, puzzle steps, or a lower cost.
4. **Gold piles up.** ~670 unspent gold at the end of a normal run (~615 on brutal); Zarathor's Drip Check caps at 150 gold (+30%), so he is at
   max from mid act 1. Options: more shops per act, pricier legendaries/services, gold sinks (Blessing re-rolls), lower
   fight gold, or Buga's civic fee (+~16 gold/fight).
5. **Levels at bosses** 3.8 / 6.8 / 9.2 vs DESIGN ~4 / ~7 / ~10 — fine; level 10 is often reached only after the DM.
6. **Hero spread** (brutal run-win rate 48–88%): Marwyn and Sparrow trail, healers (Ellaria, Josiah) lead. AutoPlay under-plays control/utility
   kits (Syllamin, Buga, Corelos, Slate), so validate with humans before nerfing healers.
7. **Trivial-ish fights**: `a2_last_coffee` (24% of wins in ≤ 2 rounds, ~0% HP lost), `a1_fungus_among_us` (14%),
   `a2_cub_scouts`, `a3_influencer_collab`. No fight is never won; none times out.

## 5. Open Requests (collected from every notes file; resolved ones listed in §6)

**RULES — AutoPlay (sims only; players unaffected)**
- Honour `aiScore` (or a new `autoplayValue(ctx)`) in `quickScore`/`exactScore`; let preview diffs see AP gains,
  cooldown resets and cancelled/redirected telegraphs (zarathor, syllamin, sparrow, ellaria, corelos, buga, marwyn, kit,
  josiah). Value `stunLike` statuses (Sleep, Freeze) on foes with intents like Stun (marbles, syllamin).
- Approach foes and puzzle hints by walking distance (`walkApproach` exists for destroy objectives) (buga, act 1–3).
- `dangerAt` ignores `target.straight` (act 1); aura threats such as Clinical Gaze / Late Fees need a per-enemy
  `dangerAt(unit, tile)` hint so AutoPlay seeks cover (act 2 bosses); summons created mid-turn never act that turn (ellaria).
- Utility consumables (Smoke Bomb, Energy Drink, Liquid Courage) are never valued (kit).

**RULES — engine**
- Hooks: final-damage `modifyFinalDamage` (DM Plot Armor), pre-death `preventDeath` (lich), global `onAnyDeath`
  (corelos), `onAllyDowned` / `modifyHeal` / `modifyMoveCost` (passives table), `modifyOutgoingPush` / `modifyGuard` /
  level in `modifyCost` (items), a post-payment hook for HP costs (sparrow), a rule-level `telegraphFlat` (DM cameos under
  house rules), a no-status "stop walking" (marbles slips), `holds`/`noMove` status flag treated like root (slate grapple),
  `DD.AI.turnOn(unit, victim)` (syllamin Heckle), per-side hazards (josiah miasma).
- `random`-tagged previews still show the dry-run outcome (Chaos Bolt, surges at 5 MAGNIFICENCE, Drip Check surges); a
  ctx/preview `uncertain` flag (zarathor). Def `preview()` entries lack `block`/`blocked` (kit; harmless NaN).
- `enterTile` counts no-op surface `onEnter` as a mutation (Undo lost on marbles) (marbles); `AI.styleOf` default for
  function planners, `api.defaultPlan(u, style)`, planner-aware `AI.recharm` (act 2, act 3); `AI.estimate` ignores custom
  damage-taken statuses (DM Exposed); `pluralName` for objective text (act 2, not needed today); status-driven sprite
  override (act 2 Stone Form).

**HUD / META-UI / META-RUN**
- Enemy-level passive in the inspect panel and an aura-threat channel on hero cards (act 2 bosses); compact summon rows
  after Release the Corgis (ellaria); narrator caption over back-row boss intents (DM); "paid by <foe>" on Sparrow's HP
  pill; gold pill on gold-cost skills (zarathor); `DD.Render.hudMargins` (HUD).
- Narration callers still missing: `level_up` (level-up screen) and `idle_dm` (~30 s idle) (narrative); event
  `hint`/`label` as functions and skipping lines with unfilled tokens (narrative); event API `api.xp(n, heroIdx)`,
  `giveItem({ heroIdx })`, `addScar/removeScar(scarId)` (narrative); party-screen skill cards ignore AP-cost Blessings
  (passives table); a "Session Zero quirk" line on the act-1 intro (passives system); out-of-combat skill text shows base
  numbers (no item bonuses) (josiah).

**RENDER / MAPGEN**
- Unit-behind-unit silhouettes (syllamin behind Marwyn/Slate); `underlay` hook (DM spotlight); volumetric surfaces
  (miasma); `lean`/hunch knob (marbles); skip root vines on grappled units (slate); throw-arc FX for pushes (marwyn);
  object-instance `height` override (pet rock).
- MAPGEN: minimum distance between protect objects and the enemy zone (act 3 worked around it); document E-mark tier
  order for layout authors.

**Lead / docs** (ARCHITECTURE is lead-owned; not edited at integration)
- Document `modifyPush`, `modifyStatus`, skill- and status-level `telegraphFlat`, `stunLike` (unread), def extras, Smash,
  the passives deviations (§9.6) and the DD.Run flow functions; `&passives=` debug param; update DESIGN §6 Corelos to the
  shipped kit. Sanitize `ms` in `DD.FX.push` (renderer already repairs it). One shared difficulty knob (§4.1).
- Passives workflow: `rp_phoenix_feather` should check `unit.downed` before spending itself (items request).

## 6. Integration changes (this pass)

Core fixes (each surgical, commented `[integration fix…]`, regression-tested in `tests/content/integration.js` and
mutation-checked: reverting each fails its suite):
1. `js/engine/actions.js` `Act.damage`: a charmed hero can't hurt its charmer and an element-immune target (`resist 0`)
   takes 0 — flat bonuses (items' `d.flat`) included. A hook's own `d.mult = 0; d.flat = n` still deals exactly n
   (Rat King flush). (hero-corelos request)
2. `js/engine/autoplay.js` `crossedHazard`: hazards crossed on the way (lava 8, spikes, electric, fire/poison ≥ 2) are
   priced into `safetyScore`, so AutoPlay stops walking across lava to save a step. Effect on the 40-seed normal batch:
   campaign wins 37 → 40/40, act 1 downs 28 → 14, Very Dramatic Entrance HP lost 12% → 6%. (enemies-act3 request)
3. `js/engine/autoplay.js` `rescueMove`: a hero with move + 2 AP walks next to a downed ally (safest non-lethal tile) and
   helps them up; skipped when a usable revive skill (`downedAlly` filter, e.g. Smelling Salts) is socketed. (bosses-act2)
4. `js/ui/combat_hud.js`: party gold chip (🪙) next to the Hype meter, live (Drip Check, Bribe, Fines, Grimble's Levy).
   (hero-zarathor / hero-buga requests)
5. `js/run/run.js` + `js/ui/screens/rewards.js`: a fight where a hero is written out narrates `hero_death` instead of
   `victory`. (narrative request)
6. **Lost objectives no longer end the campaign** (`js/run/run.js` `resolveCombat`, `js/ui/combat_hud.js` ribbon,
   `js/ui/screens/rewards.js` empty-loot text). Before, a broken keg / coffee machine / snack bowl was a `defeat`, and the
   run layer turned every defeat into a "Total Party Kill" game over with the party alive (about 4–6% of protect fights in the
   sims). Now a defeat with heroes standing outside a boss fight is an **"Objective Failed"** step: no gold, XP or loot,
   node done (`result: 'defeat'`), downed heroes back on 1 HP with no down counted, the map continues. A TPK, or any lost
   boss fight, is still game over. The HUD ribbon says "Objective Failed" instead of "TPK". The run/HUD "defeat → game
   over" suites now down every hero first (a real TPK). Design knob for later: add a penalty (a scar? half XP?) if a
   free retreat feels too cheap.
7. `tests/run_tests.js`: the sandbox also swaps `DD.defs.enemies` ("run: boss unlocks" leaked a stub `grimble`; registry
   warning gone). (bosses-act1 request)
8. `tests/content_tests.js`: the narration-key check keys off narrator-owned keys (`idle_dm`/`gameover_title`), so
   isolated boss runs pass; the sprite whitelist accepts `hat: 'mushroom'`, `beard: 'tentacles'` and now asserts it
   matches `DD.Sprites.OPTIONS`. (bosses-act2, DM, syllamin, enemies-act1, buga requests)
9. `tests/manifest.js`: added `tests/content/integration.js`.

Content: Josiah's basic `jos_cane` renamed "Bedside Manner" → **"House Call"** (clashed with the Blessing
`rp_bedside_manner`). `tests/content/enemies_act2.js`: the `a2_last_coffee` "not trivial" bar for the protected machine
0.25 → 0.2 (AutoPlay no longer pads damage with lava walks; 6% / 22% over 4 fights). `tests/content/bosses_act1.js`
comment updated (its Grimble guard is now a no-op).

New suites (`integration:`, 10): cross-content consistency (unlocks, act/boss lineup, themes, unique player-facing names
across skills/items/consumables/Blessings/scars, loot and tome reachability, hero events, duplicate narration lines),
regressions for core fixes 1–6 (incl. the HUD → rewards hand-off of a lost objective), and a 2-seed whole-campaign smoke
run with real heroes (`&n=` for more seeds).

Checked and fine: 5 starters + josiah `{ act: 1 }`, sparrow `{ act: 2 }`, corelos `{ act: 3 }`, buga `{ boss: 'grimble' }`,
slate `{ boss: 'lichtenstein' }`; every act has normal/elite/boss encounters (2 bosses in acts 1–2, the DM in act 3);
every encounter's enemies and themes exist; hero-restricted items name real heroes; pools/starters reference real skills;
no status or id registered twice; no duplicate narration lines.

Screens checked headlessly (`.tmp/integrate/shots/`): title, party select (locked/unlocked, hints), map, gallery
(heroes, act 1–3, bosses), a combat per act with 4 real heroes (L1/L4/L7), all five boss arenas, an autoplayed Iris
fight, event, shop, level-up (Blessing roll), party, hall. No console errors.

## 7. Known issues (most important first)

1. Difficulty gap (see §4.1) and signature scarcity (§4.3) — the two biggest balance items.
2. A lost protect objective is now a free "Objective Failed" retreat (§6.6): no loot, but no other cost. Decide in the
   balance phase whether it needs teeth (scar, gold fine, half XP).
3. Dr. Iris dominates run losses under AutoPlay (Clinical Gaze; no AutoPlay cover-seeking, no per-hero warning on the
   board — HUD request open).
4. AutoPlay blind spots make sims understate control/utility kits and never exercise ~10 skills (§3); treat sim
   per-hero rankings as a floor for those kits.
5. Cosmetic: party select at 1280×720 clips two-line roles (Marbles, Ellaria, Syllamin) and the long boss-unlock hints,
   hiding the complexity stars; big sprites (Marwyn, Slate, the DM, Dr. Iris) overflow their gallery cards; barks can
   stack over a boss. Rat King robe hem is a flat band (owner note).
6. Random previews reveal dry-run outcomes (§5 RULES); Mystery Potion has its own "?" preview.
7. Sims hand AutoPlay perfect puzzle hints and exact previews; humans will be worse at puzzles and better at cover and
   utility. Playtest before trusting any boss number.
