# Dungeons and Degenerates

An isometric, turn-based tactical roguelike about a fake D&D party of degenerates, built from real campaign
characters. Roll for initiative, pick four of your worst friends, and drag them through three acts of goblin tax
collectors, overdue liches, a beholder optometrist and, finally, the Dungeon Master himself.

> **Status: v2 in progress.** Initiative turns, no enemy telegraphs, slower shared leveling and simplified skills
> are being rolled out across all the content. It's playable, but expect rough edges and balance swings.

## Play

- **In the browser:** https://sam-w-jones.github.io/dungeons-and-degenerates/ (once GitHub Pages is enabled for
  this repo: Settings → Pages → Deploy from a branch → `main` / root).
- **Locally:** download or clone the repo and open `index.html` in Chrome or Edge. No install, no build, no server.

## How it plays

- **Party:** pick 4 of 16 heroes, all available from the start: Zarathor, Syllamin, Professor Marbles, Marwyn the
  Magnificent, Ellaria, Josiah (and Onyx, his raven), Sparrow, Corelos, Slate, Mayor Buga, Kiri, Betty, Basanos,
  Valdris, Hjalmar and Pebbles.
- **Combat:** deploy your party, then **roll for initiative**. Every hero and monster acts in turn order. On a
  hero's turn you get 3 AP for moving, skills, consumables and interactions; unused AP is lost. Enemies act
  without warning (hold Alt to shade every tile they could reach); bosses wind up their biggest attacks a turn
  early. Push enemies into pits and lava, combine effects (Wet + lightning, oil + fire), and fill the Hype meter to
  unleash a signature move. Aim any single-target attack at an explosive barrel to set it off, aim a heal at a
  downed friend to get them back up, and remember that flyers float over everything on the floor (but not clouds).
- **Runs:** three acts of branching maps with fights, elites, events, shops, taverns, treasure and bosses. After
  every won fight one hero levels up, rotating fairly so nobody pulls ahead. A level-up brings a new skill or an
  upgrade (4 skill sockets, upgrades I–III) and a roll on the **Table of Questionable Blessings**, a very random
  table of passives (4 slots). Downed heroes get scars; the third down writes them out of the campaign.

## Controls

| Input | Action |
| --- | --- |
| Click a hero / tile / target | Select / move / use the armed skill |
| `1` · `2`–`5` · `6` | Basic attack · socketed skills · signature |
| `7`–`0` | Consumables |
| `E` | Interact (levers, chests, Help Up a downed ally) |
| `Tab` | Next unit acting this turn (e.g. your summons) |
| `Space` | Roll initiative / end turn / skip animations |
| `Z` | Undo the last move |
| Hold `Alt` (or `T` to toggle) | Threat shading |
| Right-click / `Esc` | Cancel · menu |
| `W` `A` `S` `D` (or arrows) / mouse wheel (or `+` `-`) | Pan / zoom the camera |
| Right or left drag | Pan the camera |
| Middle drag (hold the mouse wheel) | Rotate the map to any angle (it stays there) |
| `Q` / `R` | Turn the map 90° counter-clockwise / clockwise |
| Shift + wheel / sideways swipe · two-finger twist | Rotate the map (mouse without a middle button · touch) |
| `Home` / the compass button | Reset the view |
| `F` | Recenter the board |

## Development

- Vanilla JavaScript and canvas, no dependencies and no build step. `js/loader.js` loads the classic scripts listed
  in `js/manifest.js`, so the game runs straight from `file://`.
- `docs/DESIGN.md` is the game design, `docs/ARCHITECTURE.md` the technical contract (APIs, data schemas, rules),
  and `docs/notes/` holds per-area notes.
- Tests: `bash tools/test.sh` runs the whole suite in headless Chrome (`bash tools/test.sh "suite=<name>"` to
  filter). Screenshots: `bash tools/shot.sh "debug=1&screen=…" out.png`.
- Debug URL parameters, e.g. `index.html?debug=1&screen=combat&party=kiri,betty,basanos,slate&encounter=boss_grimble`
  (see ARCHITECTURE §10.1). Debug pages are silent and expose `DDdbg` helpers in the console.
