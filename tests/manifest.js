/* Test files loaded after the game manifest (missing ones are skipped). One file per owning area.
 * V3: content/hero_benedick.js and content/boss_goats.js ship as empty stubs (their owners replace them); the other new
 * V3 suites do not exist until their owners land them. h19: content/hero_rasma.js, hero_biz.js and hero_gus.js ship as
 * empty stubs in wave 0 (docs/notes/h19-contract.md); their hero owners replace them. */
window.DD_EXTRA_SCRIPTS = [
  'tests/fixtures.js',        // rules: test-only heroes/enemies/summons (ids prefixed "test_")
  'tests/core_tests.js',      // lead (V3): DD.finalAct and the act rows, gauntlet scaling, cameo registry, narration variants
  'tests/engine_tests.js',    // rules: grid, LOS, pathing, damage, statuses, push, turn flow, AI
  'tests/content_tests.js',   // rules: generic content validation + skill/enemy smoke + encounter auto-battles
  'tests/mapgen_tests.js',    // mapgen: generation validity, layouts, encounter build
  'tests/render_tests.js',    // render-world: projection, picking, renderer smoke (headless canvas)
  'tests/sprite_tests.js',    // render-sprites: sprite painter, portraits, FX handlers
  'tests/run_tests.js',       // meta: run flow, rewards, leveling, save/load, events
  'tests/ui_tests.js',        // meta/hud: screens mount/unmount without errors
  'tests/hud_tests.js',       // hud: combat HUD on real sandbox fights (selection, targeting, previews, end of fight)
  'tests/passive_tests.js',   // passives: the random passive table in the run layer and UI (rolls, slots, level-ups)
  'tests/autoplay_tests.js',  // autoplay: AutoPlay fidelity (utility valuation, cover from aura threats, walking approach)
  'tests/balance_tests.js',   // balance: DD.Balance knobs, Hype and economy rules, difficulty targets (smoke-level sims)
  'tests/sim/sim.js',         // docs + tools: the campaign sim (it only runs on tests/sim/sim.html; here it exposes DD_SIM)
  'tests/docs_tests.js',      // docs + tools: the docs quote the game (DESIGN / ARCHITECTURE / v2-digest), sim stalls

  // content-specific suites (one file per content file owner)
  'tests/content/hero_zarathor.js',
  'tests/content/hero_syllamin.js',
  'tests/content/hero_marbles.js',
  'tests/content/hero_marwyn.js',
  'tests/content/hero_corelos.js',
  'tests/content/hero_josiah.js',
  'tests/content/hero_ellaria.js',
  'tests/content/hero_sparrow.js',
  'tests/content/hero_slate.js',
  'tests/content/hero_buga.js',
  'tests/content/hero_kiri.js',
  'tests/content/hero_betty.js',
  'tests/content/hero_basanos.js',
  'tests/content/hero_valdris.js',
  'tests/content/hero_hjalmar.js',
  'tests/content/hero_pebbles.js',
  'tests/content/hero_benedick.js',       // V3: the 17th hero
  'tests/content/hero_rasma.js',          // h19: the 18th hero (wave 0: an empty stub; HERO-RASMA replaces it)
  'tests/content/hero_biz.js',            // h19: the 19th hero (stub first; HERO-BIZ)
  'tests/content/hero_gus.js',            // h19: the 20th hero (stub first; HERO-GUS)
  'tests/content/shared.js',              // items
  'tests/content/kit.js',                 // generic skills + consumables
  'tests/content/passives.js',            // the Table of Questionable Blessings
  'tests/content/enemies_act1.js',
  'tests/content/enemies_act2.js',
  'tests/content/enemies_act3.js',
  'tests/content/bosses_act1.js',
  'tests/content/bosses_act2.js',
  'tests/content/boss_dm.js',
  // V3: act 4
  'tests/content/boss_gardener.js',
  'tests/content/boss_league.js',
  'tests/content/boss_galbraith.js',
  'tests/content/boss_coven.js',
  'tests/content/boss_svammiel.js',
  'tests/content/boss_goats.js',
  'tests/content/narrative.js',
  'tests/content/svammiel_lines.js',      // V3: the svam_* pools (coverage per registered hero, lengths, no repeats)
  'tests/content/events_act4.js',         // V3: act-4 events (acts: [4], never api.combat)
  'tests/content/integration.js',         // integrator: cross-content checks, core-fix regressions, campaign smoke
];
