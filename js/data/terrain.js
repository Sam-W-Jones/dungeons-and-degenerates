/* Dungeons and Degenerates — js/data/terrain.js
 * Canonical terrain, objects and surfaces (ARCHITECTURE §3.7) plus the ELEMENT REACTION TABLE used by
 * DD.Act.applyElement (§6.6). Each def may carry `react: { element: reaction }` where reaction is one of
 *   { surface: id|null, turns }       replace/clear the tile surface        { spread: true } chain through same surface
 *   { terrain: id, melt: id }         change terrain (melt = terrain restored when the ice melts)
 *   { shock: true }                   electrify the connected water body       { destroy: true } destroy the object
 * Extra def fields read by the engine: hazard (AI/HUD avoid), hazardDmg / hazardEnd (immediate damage on entering /
 * damage for ending a turn there: the AI's risk estimate, never walks to a death), airborne (surface also affects
 * flyers), slide (pushed units slide +1), init(obj) (instance defaults), available(obj, unit) (interaction shown?).
 */
(function () {
  'use strict';
  const DD = window.DD;

  function C(top, left, right) { return { top: top, left: left, right: right }; }

  // ---- terrain: floors ---------------------------------------------------------------------------
  const floors = [
    ['stone', 'Stone Floor', C('#7d7a78', '#5c5957', '#4a4746'), 'Honest, load-bearing stone.'],
    ['cobble', 'Cobblestones', C('#8a8378', '#655f56', '#524d46'), 'Lumpy. Great for twisted ankles.'],
    ['dirt', 'Dirt', C('#8a6a48', '#694f35', '#55402b'), 'It is dirt. The DM described it for ten minutes.'],
    ['grass', 'Grass', C('#5e9a46', '#4a6e32', '#3c5a29'), 'Touch it. Seriously, the party needs to.'],
    ['wood', 'Wooden Planks', C('#9a6b3f', '#73502f', '#5e4126'), 'Creaky planks soaked in ale.'],
    ['sand', 'Sand', C('#d8c48a', '#b09d6a', '#958455'), 'Coarse, rough, gets everywhere.'],
    ['moss', 'Moss', C('#4f7d3a', '#3b5e2b', '#304d23'), 'Squishy green carpet of questionable origin.'],
    ['crypt', 'Crypt Tiles', C('#6f6a7d', '#524e5e', '#433f4d'), 'Cold tiles over colder residents.'],
    ['obsidian', 'Obsidian', C('#3a3046', '#2a2233', '#211b29'), 'Cooled lava. Still a little smug about it.'],
    ['felt', 'Green Felt', C('#2f7a4b', '#235a37', '#1c4a2d'), 'The DM\'s table. Mind the snack crumbs.'],
    ['paper', 'Graph Paper', C('#e9e6d6', '#c3bfae', '#a8a493'), 'One-inch squares, as the gods intended.'],
    ['carpet', 'Carpet', C('#8c2f3c', '#69232d', '#561c25'), 'Plush, red, and absolutely not stain-resistant.'],
    ['grate', 'Iron Grate', C('#5d6266', '#45494c', '#383b3e'), 'Something down there is watching. And dripping.'],
    ['marble', 'Marble', C('#d9d4cc', '#b1aca4', '#97928b'), 'Fancy floor for fancy villains.'],
  ];
  floors.forEach(function (f) {
    DD.registerTerrain({ id: f[0], name: f[1], walkable: true, cost: 1, blocksLos: false, colors: f[2], desc: f[3] });
  });
  DD.registerTerrain({ id: 'gold', name: 'Gold Coins', walkable: true, cost: 2, colors: C('#e8b923', '#b88d16', '#9a7512'),
    desc: 'Wading through money. Costs 2 to move through.' });

  // ---- terrain: special --------------------------------------------------------------------------
  DD.registerTerrain({ id: 'wall', name: 'Wall', walkable: false, cost: 1, blocksLos: true, tall: 1.5,
    colors: C('#5b5552', '#433e3c', '#363230'), desc: 'Blocks movement and line of sight.' });
  DD.registerTerrain({ id: 'pit', name: 'Pit', walkable: false, pit: true, colors: C('#141014', '#0b080b', '#070507'),
    desc: 'Bottomless-ish. Pushed enemies are YEETED; heroes and bosses lose 25% max HP and climb out.' });
  DD.registerTerrain({ id: 'bridge', name: 'Bridge', walkable: true, cost: 1, colors: C('#8b6239', '#6a4a2b', '#573c23'),
    desc: 'Rickety, but it holds. Probably.' });
  DD.registerTerrain({ id: 'mud', name: 'Mud', walkable: true, cost: 2, colors: C('#5f4630', '#473423', '#3a2b1d'),
    desc: 'Costs 2 to move through. Smells like regret.' });
  DD.registerTerrain({ id: 'rubble', name: 'Rubble', walkable: true, cost: 2, colors: C('#776f66', '#58524b', '#48433d'),
    desc: 'Costs 2 to move through. Somebody skipped the structural check.' });
  DD.registerTerrain({ id: 'ice', name: 'Ice', walkable: true, cost: 1, slide: true, colors: C('#bfe8f7', '#8fc3d6', '#76a9bd'),
    desc: 'Pushed units slide 1 extra tile. Fire melts it.',
    react: { fire: { terrain: 'water' } } });
  DD.registerTerrain({ id: 'water', name: 'Shallow Water', walkable: true, cost: 2, liquid: 'water',
    colors: C('#3f86c6', '#2e6595', '#25537a'),
    desc: 'Costs 2. Makes units Wet and puts out Burn. Lightning electrifies the whole pool; frost freezes it.',
    react: { fire: { surface: 'steam', turns: 1 }, frost: { terrain: 'ice', melt: 'water' }, lightning: { shock: true } },
    onEnter: function (unit) { soak(unit); },
    onTurnEnd: function (unit) { soak(unit); } });
  DD.registerTerrain({ id: 'deep_water', name: 'Deep Water', walkable: false, liquid: 'deep',
    colors: C('#1f4f8a', '#173b67', '#123055'),
    desc: 'Impassable. Pushed units sink: enemies drown, heroes and bosses lose 25% max HP. Frost freezes a path.',
    react: { fire: { surface: 'steam', turns: 1 }, frost: { terrain: 'ice', melt: 'deep_water' }, lightning: { shock: true } } });
  DD.registerTerrain({ id: 'lava', name: 'Lava', walkable: true, cost: 1, liquid: 'lava', hazard: true, hazardDmg: 8, hazardEnd: 8,
    colors: C('#ff5a1f', '#c2410c', '#9a3412'),
    desc: 'Entering or ending a turn here: 8 fire damage and Burn 2. Water cools it to obsidian.',
    react: { water: { terrain: 'obsidian' } },
    onEnter: function (unit) { scorch(unit); },
    onTurnEnd: function (unit) { scorch(unit); } });

  function soak(unit) {
    if (!unit || unit.dead) return;
    if (DD.Act.hasStatus(unit, 'burn')) DD.Act.removeStatus(unit, 'burn');
    DD.Act.addStatus(unit, 'wet', { turns: 2 }, null);
  }
  function scorch(unit) {
    if (!unit || unit.dead) return;
    DD.Act.damage(null, unit, 8, { element: 'fire', cause: 'terrain', tags: ['lava'] });
    if (!unit.dead && !unit.downed) DD.Act.addStatus(unit, 'burn', { stacks: 2 }, null);
  }

  // ---- objects -----------------------------------------------------------------------------------
  function obj(def) { return DD.registerObject(def); }

  obj({ id: 'crate', name: 'Crate', blocksMove: true, blocksLos: false, hp: 6, height: 0.8, color: '#a0743f',
    desc: 'Destructible cover. Contains nothing. It is always nothing.' });
  obj({ id: 'barrel', name: 'Barrel', blocksMove: true, blocksLos: false, hp: 5, height: 0.85, color: '#8a5a2b',
    desc: 'Destructible cover. Sloshes suspiciously.' });
  obj({ id: 'barrel_explosive', name: 'Explosive Barrel', blocksMove: true, blocksLos: false, hp: 3, height: 0.85, color: '#c0392b',
    desc: 'Explodes when destroyed or set alight: 8 fire damage around it and fire on the floor.',
    react: { fire: { destroy: true } },
    onDestroyed: function (o, tile, src) { DD.Act.explode(src, tile.x, tile.y, { radius: 1, dmg: 8, element: 'fire', surface: 'fire', turns: 2 }); } });
  obj({ id: 'keg', name: 'Ale Keg', blocksMove: true, blocksLos: false, hp: 6, height: 0.8, color: '#9b6a35',
    desc: 'Destructible. Breaking it floods nearby tiles with ale (water). A tragedy.',
    onDestroyed: function (o, tile) { DD.Act.splash(tile.x, tile.y, 1, 'water', 3); DD.Act.log('A keg bursts. Somewhere, a dwarf weeps.', 'system'); } });
  obj({ id: 'pillar', name: 'Pillar', blocksMove: true, blocksLos: true, hp: 0, height: 2.2, color: '#9c968d',
    desc: 'Blocks movement and line of sight. Load-bearing drama.' });
  obj({ id: 'rock', name: 'Rock', blocksMove: true, blocksLos: true, hp: 0, height: 1, color: '#7f7a73',
    desc: 'Blocks movement and line of sight. A rock. The DM is very proud of it.' });
  obj({ id: 'tree', name: 'Tree', blocksMove: true, blocksLos: true, hp: 0, height: 2.4, color: '#3f7a3a',
    desc: 'Blocks movement and line of sight. Ellaria says hi to it.' });
  obj({ id: 'dead_tree', name: 'Dead Tree', blocksMove: true, blocksLos: false, hp: 8, height: 2, color: '#6b5440',
    desc: 'Blocks movement. Destructible and flammable.',
    react: { fire: { destroy: true } },
    onDestroyed: function (o, tile) { DD.Act.setSurface(tile.x, tile.y, 'fire', 2); } });
  obj({ id: 'bush', name: 'Bush', blocksMove: false, blocksLos: true, hp: 2, height: 0.7, color: '#4c8c3c',
    desc: 'Walkable. Blocks line of sight through it. Burns.',
    react: { fire: { destroy: true } },
    onDestroyed: function (o, tile) { DD.Act.setSurface(tile.x, tile.y, 'fire', 1); } });
  obj({ id: 'mushroom', name: 'Spore Pod', blocksMove: true, blocksLos: false, hp: 3, height: 0.9, color: '#b5651d',
    desc: 'Destructible. Bursts into poison spores (radius 1) when destroyed.',
    onDestroyed: function (o, tile) { DD.Act.splash(tile.x, tile.y, 1, 'poison', 2); } });
  obj({ id: 'gravestone', name: 'Gravestone', blocksMove: true, blocksLos: false, hp: 0, height: 0.9, color: '#8d8d96',
    desc: 'Blocks movement. "Here lies a fighter who said \'I check for traps\' too late."' });
  obj({ id: 'coffin', name: 'Coffin', blocksMove: true, blocksLos: false, hp: 6, height: 0.6, color: '#5e3b23',
    desc: 'Destructible cover. Occupied? Don\'t ask.' });
  obj({ id: 'statue', name: 'Statue', blocksMove: true, blocksLos: true, hp: 0, height: 1.9, color: '#a8a39a',
    desc: 'Blocks movement and line of sight. Its eyes follow you. Lazily.' });
  obj({ id: 'bookshelf', name: 'Bookshelf', blocksMove: true, blocksLos: true, hp: 8, height: 1.7, color: '#6e4a2c',
    desc: 'Blocks movement and line of sight. Destructible. Overdue.' });
  obj({ id: 'candles', name: 'Candles', blocksMove: true, blocksLos: false, hp: 1, height: 0.5, color: '#f3e3b0',
    desc: 'Destructible. Knocking them over sets their tile on fire.',
    onDestroyed: function (o, tile) { DD.Act.setSurface(tile.x, tile.y, 'fire', 2); DD.Act.applyElement(tile.x, tile.y, 'fire', null); } });
  obj({ id: 'd20', name: 'Giant d20', blocksMove: true, blocksLos: true, hp: 0, height: 1.3, color: '#c0392b',
    desc: 'Blocks movement and line of sight. It always lands on 1 when you need it.' });
  obj({ id: 'soda_can', name: 'Soda Can Tower', blocksMove: true, blocksLos: true, hp: 8, height: 1.8, color: '#3fbf3f',
    desc: 'Blocks movement and line of sight. Destructible: spills sticky soda (water) around it.',
    onDestroyed: function (o, tile) { DD.Act.splash(tile.x, tile.y, 1, 'water', 3); } });
  obj({ id: 'pencil', name: 'Giant Pencil', blocksMove: true, blocksLos: false, hp: 0, height: 0.5, color: '#f1c40f',
    desc: 'Blocks movement. Number 2. Snapped in a rage over initiative order.' });
  obj({ id: 'gold_pile', name: 'Gold Pile', blocksMove: false, blocksLos: false, hp: 0, height: 0.35, color: '#f4c430',
    desc: 'Walk a hero over it to pocket 3-6 gold.',
    onEnter: function (unit, o, tile) {
      if (!unit || unit.side !== 'hero') return;
      const st = DD.Combat.state;
      const n = st && st.rng ? st.rng.int(3, 6) : 4;
      DD.Act.gainGold(n);
      DD.Act.removeObject(tile.x, tile.y);
      DD.FX.particles(tile, { kind: 'coins', count: 10 });
      DD.FX.text(unit, '+' + n + ' gold', { color: '#ffd76a' });
      DD.Act.log(unit.name + ' pockets ' + n + ' gold. Finders keepers.', 'hero');
    } });
  obj({ id: 'bones', name: 'Bones', blocksMove: false, blocksLos: false, hp: 0, height: 0.2, color: '#e8e2cf',
    desc: 'Walkable. The last party that skipped session zero.' });
  obj({ id: 'fence', name: 'Iron Fence', blocksMove: true, blocksLos: false, hp: 4, height: 0.9, color: '#3d3d44',
    desc: 'Blocks movement but not sight. Destructible.' });
  obj({ id: 'pipe', name: 'Pipe', blocksMove: true, blocksLos: false, hp: 0, height: 0.7, color: '#5f7d6e',
    desc: 'Blocks movement. Gurgles ominously.' });
  obj({ id: 'totem', name: 'Totem', blocksMove: true, blocksLos: false, hp: 10, height: 1.5, color: '#8e44ad', smashable: true,
    desc: 'Destructible (10 HP): adjacent heroes can Smash it (1 AP, 5 damage). Usually powering something evil.' });
  obj({ id: 'spikes', name: 'Spike Trap', blocksMove: false, blocksLos: false, hp: 0, height: 0.15, color: '#9aa0a6', hazard: true, hazardDmg: 5,
    desc: 'Walkable. Deals 5 damage to anything that enters (flyers float over).',
    onEnter: function (unit) {
      if (!unit || unit.dead) return;
      DD.Act.damage(null, unit, 5, { cause: 'terrain', tags: ['spikes'] });
    } });
  obj({ id: 'pressure_plate', name: 'Pressure Plate', blocksMove: false, blocksLos: false, hp: 0, height: 0.08, color: '#8c7b5a',
    desc: 'Walkable. Something happens when it is stepped on.',
    onEnter: function (unit, o, tile) {
      o.data.pressed = true;
      o.data.count = (o.data.count || 0) + 1;
      DD.Act.touch();   // a pressed plate is a side effect: the move that pressed it can't be undone
      DD.FX.tile(tile.x, tile.y, 'pulse');
      DD.FX.text(tile, '*click*', { color: '#e8d9a8', size: 13 });
    } });
  obj({ id: 'lever', name: 'Lever', blocksMove: true, blocksLos: false, hp: 0, height: 0.8, color: '#b08d57',
    desc: 'Interact (1 AP): pull it. Pulling levers is half of adventuring.',
    init: function (o) { if (o.data.on === undefined) o.data.on = false; },
    interact: { ap: 1, label: 'Pull', fn: function (unit, o, tile) { toggle(unit, o, tile, 'Ka-chunk.'); } } });
  obj({ id: 'valve', name: 'Valve', blocksMove: true, blocksLos: false, hp: 0, height: 0.7, color: '#6f8f8f',
    desc: 'Interact (1 AP): turn it. Righty-tighty, lefty-floody.',
    init: function (o) { if (o.data.on === undefined) o.data.on = false; },
    interact: { ap: 1, label: 'Turn', fn: function (unit, o, tile) { toggle(unit, o, tile, 'Squeeeak.'); } } });
  obj({ id: 'mirror', name: 'Mirror', blocksMove: true, blocksLos: true, hp: 0, height: 1.6, color: '#cfe8f2',
    desc: 'Interact (1 AP): rotate it a quarter turn. Reflects beams the way it faces.',
    init: function (o) { if (!o.data.facing) o.data.facing = o.facing || 'N'; o.facing = o.data.facing; },
    interact: { ap: 1, label: 'Rotate', fn: function (unit, o, tile) {
      const order = ['N', 'E', 'S', 'W'];
      const i = order.indexOf(o.data.facing);
      o.data.facing = order[(i + 1) % 4];
      o.facing = o.data.facing;
      DD.FX.tile(tile.x, tile.y, 'glow');
      DD.Act.log(unit.name + ' rotates the mirror to face ' + o.data.facing + '. Looking good.', 'hero');
    } } });
  obj({ id: 'chest', name: 'Chest', blocksMove: true, blocksLos: false, hp: 0, height: 0.7, color: '#a8742e',
    desc: 'Interact (1 AP): open it for gold and maybe a consumable. Definitely not a mimic.',
    available: function (o) { return !o.data.opened; },
    interact: { ap: 1, label: 'Open', fn: function (unit, o, tile) {
      const st = DD.Combat.state;
      o.data.opened = true;
      const gold = st.rng.int(8, 16);
      DD.Act.gainGold(gold);
      DD.FX.particles(tile, { kind: 'coins', count: 16 });
      DD.FX.text(tile, '+' + gold + ' gold', { color: '#ffd76a' });
      let line = unit.name + ' opens the chest: ' + gold + ' gold';
      if (st.rng.chance(0.35)) {
        const id = DD.Act.giveRandomConsumable();
        if (id) line += ' and a ' + (DD.getConsumable(id).name);
      }
      DD.Act.log(line + '!', 'hero');
      DD.Act.narrate('treasure', { hero: unit.name, gold: gold });
    } } });
  obj({ id: 'fountain', name: 'Fountain', blocksMove: true, blocksLos: false, hp: 0, height: 1, color: '#7fb8d9',
    desc: 'Interact (1 AP): drink to heal 10 HP. One sip per fight; it is a small fountain.',
    available: function (o) { return !o.data.used; },
    interact: { ap: 1, label: 'Drink', fn: function (unit, o, tile) {
      o.data.used = true;
      DD.FX.particles(tile, { kind: 'bubbles', count: 12 });
      DD.Act.heal(null, unit, 10);
      DD.Act.log(unit.name + ' drinks from the fountain. Tastes like pennies and hope.', 'heal');
    } } });
  obj({ id: 'brazier', name: 'Brazier', blocksMove: true, blocksLos: false, hp: 3, height: 1, color: '#d35400',
    desc: 'Interact (1 AP): kick it over to spill fire 3 tiles away from you. Destroyed: fire all around it.',
    onDestroyed: function (o, tile, src) { DD.Act.splash(tile.x, tile.y, 1, 'fire', 2, src); },
    interact: { ap: 1, label: 'Kick Over', fn: function (unit, o, tile) {
      const dir = DD.util.dirTo(unit, tile);
      DD.Act.removeObject(tile.x, tile.y);
      DD.FX.particles(tile, { kind: 'fire', count: 18 });
      DD.FX.sound('fire');
      for (let k = 0; k < 3; k++) {
        const x = tile.x + dir.x * k, y = tile.y + dir.y * k;
        const t = DD.Grid.tile(x, y);
        if (!t || DD.Grid.terrain(t).walkable === false && !DD.Grid.terrain(t).liquid) break;
        DD.Act.setSurface(x, y, 'fire', 2);
        DD.Act.applyElement(x, y, 'fire', unit);
      }
      DD.Act.log(unit.name + ' kicks over the brazier. Fire safety is for cowards.', 'hero');
    } } });

  function toggle(unit, o, tile, sound) {
    o.data.on = !o.data.on;
    DD.FX.tile(tile.x, tile.y, 'pulse');
    DD.FX.sound('click');
    DD.FX.text(tile, sound, { color: '#e8d9a8', size: 13 });
    DD.Act.log(unit.name + ' ' + (o.data.on ? 'switches on' : 'switches off') + ' the ' + (o.label || DD.getObject(o.id).name).toLowerCase() + '.', 'hero');
  }

  // ---- surfaces ----------------------------------------------------------------------------------
  DD.registerSurface({ id: 'fire', name: 'Fire', color: 'rgba(255,110,20,0.55)', turns: 3, hazard: true, hazardDmg: 0, hazardEnd: 1, airborne: true,
    desc: 'Entering: Burn 2. Ending a turn here: Burn 1. Water or frost puts it out.',
    react: { water: { surface: null }, frost: { surface: null } },
    onEnter: function (unit) { DD.Act.addStatus(unit, 'burn', { stacks: 2 }, null); },
    onTurnEnd: function (unit) { DD.Act.addStatus(unit, 'burn', { stacks: 1 }, null); } });
  DD.registerSurface({ id: 'poison', name: 'Poison Puddle', color: 'rgba(110,200,40,0.5)', turns: 3, hazard: true, hazardDmg: 0, hazardEnd: 1, airborne: true,
    desc: 'Entering: Poison 2. Ending a turn here: Poison 1. Fire burns it away.',
    react: { fire: { surface: 'fire', turns: 1 } },
    onEnter: function (unit) { DD.Act.addStatus(unit, 'poison', { stacks: 2 }, null); },
    onTurnEnd: function (unit) { DD.Act.addStatus(unit, 'poison', { stacks: 1 }, null); } });
  DD.registerSurface({ id: 'water', name: 'Puddle', color: 'rgba(60,140,230,0.45)', turns: 4,
    desc: 'Entering: Wet (puts out Burn). Lightning electrifies it; frost freezes it; fire boils it into steam.',
    react: { fire: { surface: 'steam', turns: 1 }, frost: { surface: 'ice', turns: 4 }, lightning: { shock: true } },
    onEnter: function (unit) { soak(unit); } });
  DD.registerSurface({ id: 'oil', name: 'Oil Slick', color: 'rgba(40,30,20,0.55)', turns: 5,
    desc: 'Flammable: fire ignites it and spreads along the whole slick.',
    react: { fire: { surface: 'fire', turns: 3, spread: true } } });
  DD.registerSurface({ id: 'ice', name: 'Ice Sheet', color: 'rgba(190,235,255,0.6)', turns: 4, slide: true,
    desc: 'Pushed units slide 1 extra tile. Fire melts it into a puddle.',
    react: { fire: { surface: 'water', turns: 3 } } });
  DD.registerSurface({ id: 'blood', name: 'Blood', color: 'rgba(150,10,25,0.5)', turns: 4,
    desc: 'Gross. Some blood mages find it relaxing.' });
  DD.registerSurface({ id: 'web', name: 'Web', color: 'rgba(235,235,235,0.45)', turns: 4, airborne: true,
    desc: 'Entering: Rooted for 1 turn. Fire burns it.',
    react: { fire: { surface: 'fire', turns: 1 } },
    onEnter: function (unit) { DD.Act.addStatus(unit, 'root', { turns: 1 }, null); } });
  DD.registerSurface({ id: 'steam', name: 'Steam', color: 'rgba(235,240,245,0.55)', turns: 1, blocksLos: true,
    desc: 'Blocks line of sight. Spa day.' });
  DD.registerSurface({ id: 'smoke', name: 'Smoke', color: 'rgba(90,90,100,0.55)', turns: 2, blocksLos: true,
    desc: 'Blocks line of sight. Cough.' });
  DD.registerSurface({ id: 'holy', name: 'Holy Ground', color: 'rgba(255,240,150,0.45)', turns: 3, airborne: true,
    desc: 'Heroes ending a turn here heal 3. Undead ending a turn here take 3 damage.',
    onTurnEnd: function (unit) {
      if (unit.side === 'hero') DD.Act.heal(null, unit, 3);
      else if ((unit.tags || []).indexOf('undead') >= 0) DD.Act.damage(null, unit, 3, { element: 'holy', cause: 'surface' });
    } });
  DD.registerSurface({ id: 'electric', name: 'Live Current', color: 'rgba(120,200,255,0.55)', turns: 1, hazard: true, hazardDmg: 3,
    desc: 'Entering: 3 lightning damage.',
    onEnter: function (unit) { DD.Act.damage(null, unit, 3, { element: 'lightning', cause: 'surface' }); } });
  DD.registerSurface({ id: 'cheeto', name: 'Cheeto Dust', color: 'rgba(255,140,0,0.5)', turns: 4,
    desc: 'Entering: Slowed on your next turn. Highly flammable (it\'s mostly cheese).',
    react: { fire: { surface: 'fire', turns: 2, spread: true } },
    // turns: 1 = its next turn (v2: walking in during its own turn skips that turn's tick, see DD.Combat decay)
    onEnter: function (unit) { DD.Act.addStatus(unit, 'slow', { turns: 1 }, null); } });
})();
