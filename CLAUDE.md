# Dungeons and Degenerates — project rules

Isometric turn-based tactical roguelike (comedic fake-D&D party) in **vanilla JS + canvas**, no build step.
Open `index.html` directly (file://). No Node/Python on this machine — Chrome is the only JS runtime.

- **Contract**: `docs/ARCHITECTURE.md` (APIs, data schemas, rules). **Design**: `docs/DESIGN.md` (tone, numbers,
  heroes, enemies, bosses). Read the sections relevant to your task before coding; follow them exactly.
- **File ownership**: ARCHITECTURE §1. Only edit files your task owns. Need a change elsewhere? Write it under
  "Requests" in `docs/notes/<your-area>.md`. Record any contract deviation under "Deviations" there.
- Style: each file is an IIFE using `'use strict'` and `const DD = window.DD`. Classic scripts only (no ES modules,
  no fetch). At load time only `DD.register*()` / `DD.registerNarration()` / `DD.afterLoad()` — no cross-module
  calls. Game-logic randomness via RNG instances (`state.rng`), never `Math.random()`. 2-space indent,
  single quotes, semicolons, short doc comment at the top of each file, comments only where non-obvious.
- **Test**: `tools/test.sh` (all suites) or `tools/test.sh "suite=<substring>&verbose=1"` — headless Chrome.
  Add suites to your area's test file (see `tests/manifest.js`) with `DD_TEST.suite(name, fn)`.
  `&isolate=<substr,…>` (tests and game pages) loads only the content files whose path matches, e.g.
  `tools/test.sh "suite=hero_zarathor&isolate=zarathor"` — use it while iterating so other authors' work in progress
  can't break your runs; finish with a full run without it.
- **Look**: `tools/shot.sh "debug=1&screen=…" .tmp/x.png [WxH] [ms]` then view the PNG with the Read tool.
  Debug URL params: ARCHITECTURE §10.1. Put scratch files in `.tmp/` (gitignored-style scratch dir).
- **Memory**: too many headless Chrome instances at once exhausted the machine's memory and got the app killed.
  Launch Chrome ONLY through `tools/test.sh`, `tools/shot.sh` (or `tools/sim.sh`): they share a machine-wide cap of
  3 concurrent headless runs (`tools/chrome_slot.sh`; scratch harnesses must source it too). Never start
  chrome/msedge directly and never background several runs with `&` — run them one after another.
- **Silence**: the user can hear the browser pane. Every game URL you open there must include `debug=1` (debug pages
  are silent); never add `sound=1` or switch sound effects on in Settings.
- Content must be comedic (names, flavor, barks) but mechanics text exact; `desc` must match `execute`.
- Don't break other areas: run the full `tools/test.sh` before finishing; never leave swallowed "Error in …" warnings.
