/* Dungeons and Degenerates — js/data/passives.js
 * The Table of Questionable Blessings (DESIGN §7.1, ARCHITECTURE §3.12): every random passive ('rp_*') a hero can
 * roll at run start and on level-ups (4 slots, levels I-III; rolling an owned one upgrades it).
 * Hooks get the instance { id, level, L, def, data } as their LAST argument; per-fight state lives in p.data
 * (unit ids, never unit references); randomness only through the combat RNG (DD.Combat.state.rng).
 * v2 (initiative, per-unit turns): "your turn" = your own initiative turn (per-turn bookkeeping is keyed on
 * state.turn), nobody starts a fight with Block, nothing reads enemy intents (only boss wind-ups exist).
 * Wording used in every desc: a "hit" deals 1+ damage after armor (Block counts); a "skill hit" is damage dealt by
 * a skill (cause 'skill', attacks of opportunity included); "enemy skill hits" are skill hits on you by a hostile unit.
 */
(function () {
  'use strict';
  const DD = window.DD;

  // ---- runtime helpers (hooks only ever run inside a fight) ---------------------------------------
  function S() { return DD.Combat.state; }
  function rng() { return S().rng; }
  /** One roll on the combat RNG (no roll at all for a sure thing). */
  function roll(pct) { return pct >= 100 || rng().next() * 100 < pct; }
  function pick(list) { return list[rng().int(0, list.length - 1)]; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function hostile(a, b) { return !!a && !!b && DD.Grid.hostile(a, b); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function roundNo() { const s = S(); return s ? s.round : 0; }
  /** Turns started so far this fight: constant during one unit's turn (v2 per-turn bookkeeping). */
  function turnNo() { const s = S(); return s ? s.turn || 0 : 0; }
  /** The unit's own initiative turn is under way (its summons share it). */
  function ownTurn(u) { return !!u && DD.Act.isOwnTurn(u); }
  /** p is one of u's Blessing instances (hooks fired for both sides of an attack of opportunity need the holder). */
  function mine(u, p) { return !!u && (u.passives || []).indexOf(p) >= 0; }
  /** u still has a turn coming this round: an initiative entry after the current one (a summon: its owner's). */
  function stillToCome(u) {
    const s = S();
    if (!u || !s || !s.order) return false;
    const o = (typeof DD.Combat.turnOwner === 'function' && DD.Combat.turnOwner(u)) || u;
    for (let i = Math.max(0, s.turnIndex + 1); i < s.order.length; i++) if (s.order[i].unitId === o.id) return true;
    return false;
  }
  function actNo() {
    const s = S();
    const a = (s && s.run && s.run.act) || (s && s.encounter && s.encounter.act) || 1;
    return Math.max(1, Math.min(3, Math.round(+a) || 1));
  }
  function heightOf(u) { const t = DD.Grid.tile(u.x, u.y); return t ? t.h || 0 : 0; }
  /** Damage dealt by d.source with a skill to a foe of theirs. */
  function skillHit(d) { return d.cause === 'skill' && hostile(d.source, d.target); }
  /** A skill hit on d.target by an enemy of theirs. */
  function hitByFoe(d) { return d.cause === 'skill' && !!d.source && hostile(d.source, d.target); }
  function foesWithin(u, r, min) {
    return DD.Combat.foesOf(u).filter(function (f) { const k = dist(f, u); return k <= r && k >= (min || 0); });
  }
  function adjacentTiles(u) {
    return DD.util.DIRS.map(function (d) { return { x: u.x + d.x, y: u.y + d.y }; })
      .filter(function (q) { return DD.Grid.inBounds(q.x, q.y); });
  }
  function pop(at, text, color) { DD.FX.text(at, text, { color: color || '#ffe08a', size: 15 }); }
  function say(unit, p, text, cls) { DD.Act.log(unit.name + ' (' + p.def.name + '): ' + text, cls || 'status'); }
  /** Free, dry, hazard-free tiles at distance min..r from u (no object either, not even a plate or Rocky), nearest first. */
  function safeTiles(u, r, min) {
    return DD.Grid.emptyTilesNear(u.x, u.y, r, u).filter(function (q) {
      const t = DD.Grid.tile(q.x, q.y);
      return dist(q, u) >= (min || 1) && !t.obj && !DD.Grid.isDrop(q.x, q.y) && !DD.Grid.hazardAt(q.x, q.y, u) &&
        !DD.Grid.terrain(t).liquid;
    });
  }
  /** Wall terrain or a movement-blocking object on one of the 4 neighbouring tiles. */
  function nextToWall(u) {
    const dirs = DD.util.DIRS;
    for (let i = 0; i < 4; i++) {
      const t = DD.Grid.tile(u.x + dirs[i].x, u.y + dirs[i].y);
      if (!t) continue;
      const td = DD.Grid.terrain(t);
      if (td.walkable === false && !td.pit && !td.liquid) return true;
      if (t.obj && DD.Grid.objBlocksMove(t.obj)) return true;
    }
    return false;
  }
  /**
   * Tiles an enemy could hit before u's next turn ('x,y' → 1): every AI foe's reach (DD.AI.threatMap, the HUD's
   * threat shading) plus the tiles of hostile boss wind-ups. v2: there are no other telegraphs to read.
   */
  function threatTiles(u) {
    const out = {};
    if (DD.AI && typeof DD.AI.threatMap === 'function') DD.AI.threatMap(DD.Grid.effectiveSide(u)).forEach(function (v, k) { out[k] = 1; });
    if (DD.AI && typeof DD.AI.windups === 'function') {
      DD.AI.windups().forEach(function (w) {
        if (!w.unit || !hostile(w.unit, u)) return;
        (w.tiles || []).forEach(function (q) { out[q.x + ',' + q.y] = 1; });
      });
    }
    return out;
  }
  /** Spots with the ones no enemy can reach first: those if there are any, else all of them. */
  function calmFirst(u, spots) {
    if (!spots.length) return spots;
    const danger = threatTiles(u);
    const calm = spots.filter(function (q) { return !danger[q.x + ',' + q.y]; });
    return calm.length ? calm : spots;
  }
  function goblinoid(u) {
    const tags = (u && u.tags) || [];
    return tags.indexOf('goblin') >= 0 || tags.indexOf('goblinoid') >= 0 || tags.indexOf('kobold') >= 0;
  }
  function plural(n, word, many) { return n + ' ' + (n === 1 ? word : (many || word + 's')); }
  function ordinal(n) { return n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'); }
  function andList(words) { return words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1]; }
  const STATUS_WORD = { burn: 'Burn', poison: 'Poison', bleed: 'Bleed', root: 'Root', slow: 'Slow', stun: 'Stun' };
  function statusWord(id) { return STATUS_WORD[id] || id; }
  function duckHp() { const d = DD.getSummon('wm_duck'); return d && d.hp > 0 ? d.hp : 8; }
  function slotOf(u, id) {
    const slots = DD.Combat.slotsOf(u);
    for (let i = 0; i < slots.length; i++) if (slots[i].id === id) return slots[i];
    return null;
  }
  function hasCooldown(u, def) {
    const sl = def && slotOf(u, def.id);
    return !!sl && DD.Combat.cooldownOf(u, def, sl.level) > 0;
  }
  /** The surge table, when it exists (MAPGEN's js/data/wildmagic.js). */
  function surge(unit, p, opts) {
    if (!DD.WildMagic || typeof DD.WildMagic.surge !== 'function') return null;
    return DD.WildMagic.surge(unit, Object.assign({ source: p.id }, opts || {}));
  }

  // ---- requires() helpers: hero defs are written by other authors, so check every field ----------
  function heroOf(rh, def) { return def || (rh && typeof rh.id === 'string' ? DD.getHero(rh.id) : null); }
  function kitOf(rh, def) {
    const ids = [];
    function add(id) { if (typeof id === 'string' && id && ids.indexOf(id) < 0) ids.push(id); }
    if (def) {
      add(def.basic); add(def.signature);
      if (Array.isArray(def.skillPool)) def.skillPool.forEach(add);
      if (Array.isArray(def.startingSkills)) def.startingSkills.forEach(add);
    }
    if (rh && Array.isArray(rh.skills)) rh.skills.forEach(function (s) { add(typeof s === 'string' ? s : s && s.id); });
    return ids.map(DD.getSkill).filter(Boolean);
  }
  function tagged(s, tag) { return Array.isArray(s.tags) && s.tags.indexOf(tag) >= 0; }
  function kitCount(rh, def, fn) { return kitOf(rh, def).filter(fn).length; }
  const MELEE_UNIT = { enemy: 1, any: 1, notSelf: 1 };
  const MELEE_TILE = { any: 1, enemy: 1, emptyOrUnit: 1, notSelf: 1 };
  /**
   * A melee damaging skill as the engine's attacks of opportunity read it (ARCHITECTURE §6.2): range 1, aimed at foes,
   * never tagged 'ranged', an area attack only if tagged 'melee'. Read from the def (no unit, no range bonuses).
   */
  function meleeSkill(s) {
    if (!s || typeof s.execute !== 'function' || tagged(s, 'ranged')) return false;
    const L = DD.skillLevel(s, 1);
    if (!L || !(+L.dmg > 0)) return false;
    if (s.area && s.area.shape && s.area.shape !== 'single' && !tagged(s, 'melee')) return false;
    const tg = s.target || {};
    const type = tg.type || 'unit';
    if (type === 'dir') return true;
    if (type === 'unit' ? !MELEE_UNIT[tg.filter || 'enemy'] : type === 'tile' ? !MELEE_TILE[tg.filter || 'any'] : true) return false;
    const r = tg.range;
    const max = Array.isArray(r) ? +r[1] : typeof r === 'number' ? r : 1;
    return max === 1;
  }
  function guard(fn) {
    return function (rh, def) {
      try { def = heroOf(rh, def); return !!def && !!fn(rh, def); } catch (e) { return false; }
    };
  }
  const REQ = {
    fire: guard(function (rh, def) { return kitCount(rh, def, function (s) { return tagged(s, 'fire'); }) >= 2; }),
    // a heal skill that reaches someone else (a self-only keg stand doesn't make a medic), or 2+ skills tagged 'heal'
    healer: guard(function (rh, def) {
      return kitCount(rh, def, function (s) { return s.kind === 'heal' && !(s.target && s.target.type === 'self'); }) >= 1 ||
        kitCount(rh, def, function (s) { return tagged(s, 'heal'); }) >= 2;
    }),
    summoner: guard(function (rh, def) {
      return (Array.isArray(def.summons) && def.summons.length > 0) || kitCount(rh, def, function (s) { return s.kind === 'summon'; }) >= 1;
    }),
    flyer: guard(function (rh, def) { return !!(def.flags && def.flags.flying); }),
    // Corelos pays his Debt through his own rule, not skill hpCost, so the card would be dead weight for him
    hpPayer: guard(function (rh, def) {
      return def.id === 'sparrow' ||
        kitCount(rh, def, function (s) { return (typeof s.hpCost === 'number' && s.hpCost > 0) || tagged(s, 'blood'); }) >= 2;
    }),
    gold: guard(function (rh, def) {
      return ['zarathor', 'buga'].indexOf(def.id) >= 0 || kitCount(rh, def, function (s) { return tagged(s, 'gold'); }) >= 1;
    }),
    // a melee basic attack: the hero makes attacks of opportunity (v2)
    melee: guard(function (rh, def) { return typeof def.basic === 'string' && meleeSkill(DD.getSkill(def.basic)); }),
  };

  function reg(def) { return DD.registerPassive(def); }

  // ==================================================================================================
  // COMMON — a third of a skill level: small numbers, niche conditions, little procs
  // ==================================================================================================

  reg({
    id: 'rp_lucky_socks', name: 'Lucky Socks', icon: '🧦', rarity: 'common', tags: ['offense', 'proc'],
    levels: [{ pct: 10 }, { pct: 15 }, { pct: 20 }],
    desc: function (L) { return 'Your skill hits on foes have a ' + L.pct + '% chance to deal +50% damage.'; },
    flavor: 'Unwashed since session one. The luck is load-bearing.',
    hooks: {
      modifyOutgoingDamage: function (d, p) {
        if (!skillHit(d) || !roll(p.L.pct)) return;
        d.mult *= 1.5;
        pop(d.source, '🧦 Lucky!', '#ffd76a');
      },
    },
  });

  reg({
    id: 'rp_thick_skull', name: 'Thick Skull', icon: '🥥', rarity: 'common', tags: ['defense', 'stat'],
    levels: [{ armor: 1, hp: 0 }, { armor: 1, hp: 4 }, { armor: 2, hp: 4 }],
    stats: function (L) { return L.hp ? { armor: L.armor, hp: L.hp } : { armor: L.armor }; },
    desc: function (L) { return '+' + L.armor + ' armor' + (L.hp ? ' and +' + L.hp + ' max HP.' : '.'); },
    flavor: 'Nothing gets through. Not swords, not spells, not advice.',
  });

  reg({
    id: 'rp_big_boned', name: 'Big-Boned', icon: '🍖', rarity: 'common', tags: ['defense', 'stat'],
    levels: [{ hp: 5 }, { hp: 8 }, { hp: 12 }],
    stats: function (L) { return { hp: L.hp }; },
    desc: function (L) { return '+' + L.hp + ' max HP.'; },
    flavor: "It's not fat. It's tactical padding.",
  });

  // v2 initiative: hit them before they get their turn
  reg({
    id: 'rp_cheap_shot', name: 'Cheap Shot Artist', icon: '🥊', rarity: 'common', tags: ['offense', 'initiative'],
    levels: [{ dmg: 2 }, { dmg: 3 }, { dmg: 4 }],
    desc: function (L) { return 'Your skill hits on foes whose turn is still to come this round deal +' + L.dmg + ' damage.'; },
    flavor: "Fights fair. 'Fair' meaning before the other guy has finished rolling initiative.",
    hooks: {
      modifyOutgoingDamage: function (d, p) { if (skillHit(d) && stillToCome(d.target)) d.flat += p.L.dmg; },
    },
  });

  // v2 attacks of opportunity: melee heroes hold the line (a pure modifyOpportunity, so the AI and the HUD see the bonus)
  reg({
    id: 'rp_hall_monitor', name: 'Hall Monitor', icon: '🦺', rarity: 'common', tags: ['offense', 'opportunity'],
    levels: [{ dmg: 3, stop: false }, { dmg: 5, stop: false }, { dmg: 5, stop: true }],
    requires: REQ.melee,
    desc: function (L) {
      return 'Your attacks of opportunity deal +' + L.dmg + ' damage' + (L.stop ? " and end the foe's walk right there." : '.') + ' Melee fighters only.';
    },
    flavor: 'Has a sash. Has a whistle. Has never once let anyone walk away from a conversation.',
    hooks: {
      modifyOpportunity: function (o, p) { if (mine(o.attacker, p)) o.flat += p.L.dmg; },
      onOpportunityAttack: function (o, p) {
        if (!p.L.stop || !mine(o.attacker, p) || !active(o.mover)) return;
        DD.Act.stopMove(o.mover);
        pop(o.mover, '🦺 No running!', '#ffe08a');
      },
    },
  });

  reg({
    id: 'rp_coin_magnet', name: 'Coin Magnet', icon: '🧲', rarity: 'common', tags: ['gold'],
    levels: [{ gold: 2 }, { gold: 3 }, { gold: 5 }],
    desc: function (L) { return 'Whenever you kill an enemy, the party gains ' + L.gold + ' gold.'; },
    flavor: 'Coins fly into your pockets. So do keys, forks and one very confused squirrel.',
    hooks: {
      onKill: function (d, p) {
        if (!d.target || d.target.side !== 'enemy') return;
        const n = DD.Act.gainGold(p.L.gold);
        if (n) { DD.FX.particles(d.target, { kind: 'coins', count: 8 }); pop(d.target, '+' + n + ' gold', '#ffd76a'); }
      },
    },
  });

  /**
   * Rocky's tile: a free, dry, safe neighbour at your side (perpendicular to the nearest foe), else behind you, in front
   * only as a last resort. Tiles next to other allies come last (four heroes, four rocks: keep the clutter apart).
   */
  function rockSpot(u) {
    let foe = null;
    DD.Combat.foesOf(u).forEach(function (f) { if (!foe || dist(f, u) < dist(foe, u)) foe = f; });
    const ahead = foe ? DD.util.dirTo(u, foe) : { x: 1, y: 0 };
    const friends = DD.Combat.friendsOf(u);
    let best = null, bestScore = Infinity;
    DD.util.DIRS.forEach(function (d) {
      const x = u.x + d.x, y = u.y + d.y;
      const t = DD.Grid.tile(x, y);
      if (!t || t.obj || t.surface || !DD.Grid.isFree(x, y) || DD.Grid.isDrop(x, y) || DD.Grid.hazardAt(x, y, null) || DD.Grid.terrain(t).liquid) return;
      const along = d.x * ahead.x + d.y * ahead.y; // 1 ahead · 0 to the side · -1 behind
      const crowd = friends.filter(function (f) { return dist(f, t) === 1; }).length;
      const score = crowd * 1000 + (along === 0 ? 0 : along < 0 ? 100 : 200) + (foe ? dist(foe, t) : 0);
      if (score < bestScore) { bestScore = score; best = { x: x, y: y }; }
    });
    return best;
  }
  // height / googly are render-only (a pebble-sized rock with googly eyes, so he never reads as a blocking boulder)
  const ROCKY = { label: 'Rocky', blocksLos: false, blocksMove: false, height: 0.45, googly: true };
  /** Rocky's object overrides; rockyOf (the owner's unit id) keeps two pet rocks in one party from swapping owners. */
  function rocky(unit, hp, maxHp) { return Object.assign({ hp: hp, maxHp: maxHp, rockyOf: unit.id }, ROCKY); }
  reg({
    id: 'rp_pet_rock', name: 'Pet Rock', icon: '🪨', rarity: 'common', tags: ['defense', 'object'],
    levels: [{ block: 2 }, { block: 3 }, { block: 4 }],
    desc: function (L) {
      return 'Rocky the pet rock (10 HP, blocks nothing) starts each fight beside you. At the start of each of your turns he is ' +
        'somehow beside you again (if there is room): +' + L.block + ' Block.';
    },
    flavor: "Rocky doesn't do much. Rocky doesn't have to. Nobody has ever seen Rocky move.",
    hooks: {
      onCombatStart: function (unit, p) {
        const spot = rockSpot(unit);
        const o = spot && DD.Act.placeObject(spot.x, spot.y, 'rock', rocky(unit, 10, 10));
        if (!o) { say(unit, p, 'Rocky stayed home today.'); return; }
        p.data.rock = { x: spot.x, y: spot.y };
        DD.FX.particles(spot, { kind: 'dust', count: 8 });
        say(unit, p, 'Rocky the Pet Rock joins the fight. He is a rock.', 'hero');
      },
      onTurnStart: function (unit, p) {
        const at = p.data.rock;
        const t = at && DD.Grid.tile(at.x, at.y);
        // Rocky is gravel now (another holder's Rocky may sit on his old spot: that one is not ours)
        if (!t || !t.obj || t.obj.id !== 'rock' || t.obj.rockyOf !== unit.id) { p.data.rock = null; return; }
        const beside = dist(unit, t) === 1;
        if (!beside || DD.Grid.unitAt(t.x, t.y)) { // wandered off, or someone is standing on him
          const spot = rockSpot(unit);
          if (spot) {
            const old = DD.Act.removeObject(at.x, at.y);
            DD.Act.placeObject(spot.x, spot.y, 'rock', rocky(unit, old.hp, old.maxHp));
            p.data.rock = { x: spot.x, y: spot.y };
            DD.FX.particles(spot, { kind: 'dust', count: 6 });
            pop(spot, '🪨 ...', '#d8d0c0');
          } else if (!beside) return;
        }
        DD.Act.addBlock(unit, p.L.block);
      },
    },
  });

  reg({
    id: 'rp_snack_pouch', name: 'Emergency Snack Pouch', icon: '🥨', rarity: 'common', tags: ['heal'],
    levels: [{ heal: 4 }, { heal: 6 }, { heal: 9 }],
    desc: function (L) { return 'The first time each fight damage leaves you below 50% HP (still standing), heal ' + L.heal + ' HP.'; },
    flavor: 'Trail mix, mostly raisins. You resent every single raisin.',
    hooks: {
      onTakeDamage: function (d, p) {
        const u = d.target;
        if (p.data.used || d.dealt <= 0 || !(u.hp > 0) || u.hp >= u.maxHp * 0.5) return;
        p.data.used = true;
        pop(u, '🥨 Snack break!');
        DD.Act.heal(null, u, p.L.heal);
      },
    },
  });

  reg({
    id: 'rp_spicy_blood', name: 'Spicy Blood', icon: '🌶️', rarity: 'common', tags: ['status', 'fire'],
    levels: [{ burn: 1 }, { burn: 2 }, { burn: 3 }],
    desc: function (L) { return 'When an adjacent foe hits you with a skill, it gains Burn ' + L.burn + ' (Wet foes just sizzle).'; },
    flavor: 'Your blood is 40% hot sauce. Vampires leave one-star reviews.',
    hooks: {
      onTakeDamage: function (d, p) {
        const src = d.source;
        if (!hitByFoe(d) || d.amount <= 0 || !active(src) || dist(src, d.target) !== 1) return;
        DD.Act.addStatus(src, 'burn', { stacks: p.L.burn }, d.target);
      },
    },
  });

  reg({
    id: 'rp_allergic_to_goblins', name: 'Allergic to Goblins', icon: '🤧', rarity: 'common', tags: ['offense'],
    levels: [{ dmg: 2, less: 0 }, { dmg: 3, less: 0 }, { dmg: 4, less: 1 }],
    desc: function (L) {
      return 'Your skill hits on goblins, goblinoids and kobolds deal +' + L.dmg + ' damage (you sneeze on them).' +
        (L.less ? ' Their skill hits on you deal ' + L.less + ' less.' : '');
    },
    flavor: 'Achoo! Sorry. ACHOO! Sorry. The goblins are starting to take it personally.',
    hooks: {
      modifyOutgoingDamage: function (d, p) { if (skillHit(d) && goblinoid(d.target)) d.flat += p.L.dmg; },
      modifyIncomingDamage: function (d, p) { if (p.L.less && hitByFoe(d) && goblinoid(d.source)) d.flat -= p.L.less; },
    },
  });

  /** Rule hook (state.rules): fires in every killer's chain; drains Hype when someone else upstages the owner. */
  function upstaged(d, rule) {
    const killer = d.credit;
    const owner = DD.Combat.byId(rule.ownerId);
    if (!killer || !owner || owner.dead || killer === owner || killer.side !== owner.side || !d.target || d.target.side === owner.side) return;
    if (DD.Act.gainHype(-rule.penalty, 'upstaged')) pop(owner, '🎬 Upstaged!', '#ffb0a0');
  }
  reg({
    id: 'rp_main_character', name: 'Main Character Syndrome', icon: '🎬', rarity: 'common', tags: ['hype', 'rule'],
    levels: [{ bonus: 4, penalty: 3 }, { bonus: 6, penalty: 2 }, { bonus: 8, penalty: 1 }],
    desc: function (L) {
      return 'Your kills give +' + L.bonus + ' extra Hype. Whenever an ally kills an enemy, the party first loses up to ' + L.penalty + ' Hype.';
    },
    flavor: 'Everyone else is an NPC. The DM is very tired of the monologues.',
    hooks: {
      onCombatStart: function (unit, p) {
        DD.Act.addRule({ id: 'rp_main_character:' + unit.id, name: unit.name + ' Is the Main Character', icon: '🎬',
          desc: unit.name + "'s kills: +" + p.L.bonus + ' Hype. Allies\' kills: −' + p.L.penalty + ' Hype first.',
          ownerId: unit.id, penalty: p.L.penalty, hooks: { onKill: upstaged } });
      },
      onKill: function (d, p) { if (d.target && d.target.side === 'enemy') DD.Act.gainHype(p.L.bonus, 'main character'); },
    },
  });

  reg({
    id: 'rp_overcaffeinated', name: 'Overcaffeinated', icon: '☕', rarity: 'common', tags: ['ap', 'initiative', 'stat'],
    levels: [{ init: 2, boost: 1, crash: 3 }, { init: 3, boost: 2, crash: 3 }, { init: 4, boost: 2, crash: 0 }],
    stats: function (L) { return { init: L.init }; },
    desc: function (L) {
      const up = L.boost === 1 ? ' Round 1: +1 AP at the start of your turn.' : ' Rounds 1 and 2: +1 AP at the start of your turn.';
      return '+' + L.init + ' initiative.' + up + (L.crash ? ' Round ' + L.crash + ': −1 AP (the crash).' : ' No crash: you have transcended sleep.');
    },
    flavor: 'Seven espressos and a dream. First in the initiative order, first to hear their own heartbeat.',
    hooks: {
      onTurnStart: function (unit, p) {
        const r = roundNo();
        if (r <= p.L.boost) DD.Act.gainAp(unit, 1);
        else if (p.L.crash && r === p.L.crash) { DD.Act.gainAp(unit, -1); pop(unit, '☕ Crash...', '#b8a890'); }
      },
    },
  });

  reg({
    id: 'rp_superstitious', name: 'Afraid of Even Numbers', icon: '🔢', rarity: 'common', tags: ['offense', 'defense'],
    levels: [{ dmg: 1, block: 2 }, { dmg: 2, block: 3 }, { dmg: 3, block: 3 }],
    desc: function (L) {
      return 'Odd rounds: your skill hits on foes deal +' + L.dmg + ' damage. Even rounds: gain ' + L.block + ' Block at the start of your turn.';
    },
    flavor: 'Never trust an even number. The d20 has twenty sides, and look how that turned out.',
    hooks: {
      modifyOutgoingDamage: function (d, p) { if (roundNo() % 2 === 1 && skillHit(d)) d.flat += p.L.dmg; },
      onTurnStart: function (unit, p) { if (roundNo() % 2 === 0) DD.Act.addBlock(unit, p.L.block); },
    },
  });

  reg({
    id: 'rp_wall_hugger', name: 'Wall Hugger', icon: '🧱', rarity: 'common', tags: ['defense', 'position'],
    levels: [{ n: 1 }, { n: 2 }, { n: 3 }],
    desc: function (L) { return 'While you stand next to a wall or solid object, enemy skill hits on you deal ' + L.n + ' less damage.'; },
    flavor: 'Back against the wall. Literally. Always. Even at parties.',
    hooks: {
      modifyIncomingDamage: function (d, p) { if (hitByFoe(d) && nextToWall(d.target)) d.flat -= p.L.n; },
    },
  });

  reg({
    id: 'rp_high_ground', name: 'I Have the High Ground', icon: '🏔️', rarity: 'common', tags: ['offense', 'position'],
    levels: [{ dmg: 2 }, { dmg: 3 }, { dmg: 4 }],
    desc: function (L) { return 'Your skill hits on foes standing lower than you deal +' + L.dmg + ' damage (on top of the usual high-ground bonus).'; },
    flavor: 'You have the high ground. You will not stop mentioning it.',
    hooks: {
      modifyOutgoingDamage: function (d, p) { if (skillHit(d) && heightOf(d.source) > heightOf(d.target)) d.flat += p.L.dmg; },
    },
  });

  reg({
    id: 'rp_clutch_gene', name: 'Clutch Gene', icon: '😤', rarity: 'common', tags: ['offense', 'lowhp'],
    levels: [{ pct: 20, one: false }, { pct: 30, one: false }, { pct: 30, one: true }],
    desc: function (L) {
      return 'While at or below 30% HP, your skill hits on foes deal +' + L.pct + '% damage.' +
        (L.one ? ' At exactly 1 HP they deal double damage instead.' : '');
    },
    flavor: 'Only performs under pressure. Also only does homework at 3 a.m.',
    hooks: {
      modifyOutgoingDamage: function (d, p) {
        if (!skillHit(d)) return;
        const u = d.source;
        if (p.L.one && u.hp === 1) d.mult *= 2;
        else if (u.hp <= u.maxHp * 0.3) d.mult *= 1 + p.L.pct / 100;
      },
    },
  });

  reg({
    id: 'rp_ghost_accountant', name: 'Haunted by a Ghost Accountant', icon: '👻', rarity: 'common', tags: ['gold', 'proc'],
    levels: [{ gold: 5, pct: 15 }, { gold: 8, pct: 10 }, { gold: 12, pct: 5 }],
    desc: function (L) {
      return 'After each won fight the party gains ' + L.gold + ' gold. At the start of each of your turns: ' + L.pct +
        '% chance you are Confused this turn (moving costs 2 AP).';
    },
    flavor: 'Gerald died during tax season and never left. He is very good at his job. He is very loud.',
    hooks: {
      onCombatEnd: function (unit, result, p) {
        if (result !== 'victory') return;
        const n = DD.Act.gainGold(p.L.gold);
        if (n) say(unit, p, 'Gerald finds ' + n + ' gold in deductions.', 'hero');
      },
      onTurnStart: function (unit, p) {
        if (!roll(p.L.pct)) return;
        pop(unit, '👻 "About those receipts..."', '#d9d9ff');
        DD.Act.addStatus(unit, 'confused', { turns: 1 }, unit);
      },
    },
  });

  reg({
    id: 'rp_sleepwalker', name: 'Sleepwalker', icon: '😴', rarity: 'common', tags: ['teleport', 'proc', 'defense'],
    levels: [{ pct: 25, block: 3, safe: false }, { pct: 25, block: 5, safe: false }, { pct: 25, block: 5, safe: true }],
    desc: function (L) {
      return 'At the end of your turn: ' + L.pct + '% chance you sleepwalk to a random free tile within 2' +
        (L.safe ? ' (one no enemy can reach, if there is one)' : '') + ' and gain ' + L.block + ' Block.';
    },
    flavor: 'Fights in their sleep. Wakes up in a different room. Somehow it helps.',
    hooks: {
      onTurnEnd: function (unit, p) {
        if (!roll(p.L.pct)) return;
        DD.Act.addBlock(unit, p.L.block);
        let spots = safeTiles(unit, 2, 1);
        if (p.L.safe) spots = calmFirst(unit, spots);
        pop(unit, '😴 Zzz...', '#bfd0ff');
        if (!spots.length) return;
        const q = pick(spots);
        DD.Act.teleport(unit, q.x, q.y);
        say(unit, p, 'sleepwalks somewhere else.');
      },
    },
  });

  reg({
    id: 'rp_rules_lawyer', name: 'Rules Lawyer', icon: '📜', rarity: 'common', tags: ['defense', 'status'],
    levels: [{ n: 1 }, { n: 2 }, { n: 3 }],
    desc: function (L) {
      return L.n === 1 ? 'The first debuff an enemy or hazard puts on you each fight is cancelled. Objection!'
        : 'The first ' + L.n + ' debuffs enemies or hazards put on you each fight are cancelled. Objection!';
    },
    flavor: "Actually, page 197 says you can't do that. Nobody has ever checked page 197.",
    hooks: {
      modifyStatus: function (s, p) {
        const def = DD.getStatus(s.id);
        if (!def || def.type !== 'debuff' || (p.data.used || 0) >= p.L.n) return;
        if (s.src && !hostile(s.src, s.unit)) return;
        s.cancel = true;
        p.data.used = (p.data.used || 0) + 1;
        pop(s.unit, '📜 Objection!', '#e8d9a8');
        say(s.unit, p, 'objects to ' + def.name + '. Sustained.');
      },
    },
  });

  reg({
    id: 'rp_trust_fund', name: 'Trust Fund', icon: '💰', rarity: 'common', tags: ['gold', 'run'],
    levels: [{ pct: 10 }, { pct: 15 }, { pct: 20 }],
    runMods: function (L) { return { gold: L.pct / 100 }; },
    desc: function (L) { return 'The party earns +' + L.pct + '% gold (while you are alive).'; },
    flavor: "Daddy's money. Daddy is a dragon. Don't ask where the gold comes from.",
  });

  reg({
    id: 'rp_haggler', name: 'Professional Haggler', icon: '🤝', rarity: 'common', tags: ['gold', 'run'],
    levels: [{ pct: 5 }, { pct: 8 }, { pct: 12 }],
    runMods: function (L) { return { price: -L.pct / 100 }; },
    desc: function (L) { return 'Shop prices are ' + L.pct + '% lower (party-wide; all discounts together cap at 50%).'; },
    flavor: 'Has never paid sticker price. Banned from three bazaars and a lemonade stand.',
  });

  // v2 leveling (no XP): runMods.xp is the hero's extra weight in the DM's level-up roll among the lowest-level
  // heroes (DD.Passives.xpMult = 1 + xp); it never lets a hero jump the rotation
  reg({
    id: 'rp_teachers_pet', name: "Teacher's Pet", icon: '🍎', rarity: 'common', tags: ['levelup', 'run'],
    levels: [{ weight: 1.5 }, { weight: 2 }, { weight: 3 }],
    runMods: function (L) { return { xp: L.weight - 1 }; },
    desc: function (L) { return 'When the DM rolls which of the lowest-level heroes levels up next, you count as ' + L.weight + ' heroes.'; },
    flavor: 'Sits in the front row of every dungeon. Brings the DM an apple. The DM has noticed.',
  });

  reg({
    id: 'rp_second_breakfast', name: 'Second Breakfast', icon: '🥐', rarity: 'common', tags: ['heal', 'run'],
    levels: [{ pct: 20 }, { pct: 35 }, { pct: 50 }],
    runMods: function (L) { return { heal: L.pct / 100 }; },
    desc: function (L) { return 'Out-of-combat healing (rests, shops, events) heals you ' + L.pct + '% more.'; },
    flavor: 'Eats a full breakfast between breakfasts. Heals out of pure spite for diets.',
  });

  reg({
    id: 'rp_quantum_pockets', name: 'Quantum Pockets', icon: '👖', rarity: 'common', tags: ['consumable', 'proc'],
    levels: [{ pct: 20 }, { pct: 30 }, { pct: 40 }],
    desc: function (L) { return 'At the start of each fight in a run: ' + L.pct + '% chance to find a random consumable (if the bag has room).'; },
    flavor: 'The pockets are bigger on the inside. Something in there just moved.',
    hooks: {
      onCombatStart: function (unit, p) {
        const s = S();
        if (!s.run || !roll(p.L.pct)) return;
        const id = DD.Act.giveRandomConsumable();
        if (!id) return;
        const c = DD.getConsumable(id);
        pop(unit, '👖 ' + (c ? c.name : id) + '!', '#bfefff');
        say(unit, p, 'finds a ' + (c ? c.name : id) + ' in a pocket that was not there yesterday.', 'hero');
      },
    },
  });

  reg({
    id: 'rp_dad_jokes', name: 'Dad Jokes', icon: '👨', rarity: 'common', tags: ['status', 'proc'],
    levels: [{ pct: 25 }, { pct: 35 }, { pct: 50 }],
    desc: function (L) { return 'Each foe targeted by your basic attack (attacks of opportunity too) has a ' + L.pct + '% chance to be Weakened for 1 turn.'; },
    flavor: "Hi Hungry, I'm Dad. The goblin needs a minute.",
    hooks: {
      onSkillUsed: function (ctx, p) {
        const u = ctx.user;
        if (!u || !u.basic || ctx.slot !== u.basic) return;
        (ctx.foes || []).forEach(function (f) { if (active(f) && roll(p.L.pct)) DD.Act.addStatus(f, 'weak', { turns: 1 }, u); });
      },
    },
  });

  const ONESIE = [['burn'], ['burn', 'poison'], ['burn', 'poison', 'bleed']];
  reg({
    id: 'rp_fireproof_onesie', name: 'Fireproof Onesie', icon: '🧯', rarity: 'common', tags: ['defense', 'status'],
    levels: [{ ids: ONESIE[0] }, { ids: ONESIE[1] }, { ids: ONESIE[2] }],
    desc: function (L) { return 'You are immune to ' + andList((L.ids || []).map(statusWord)) + '.'; },
    flavor: 'Flame-retardant, mostly. Itchy, definitely. Has feet.',
    hooks: {
      modifyStatus: function (s, p) {
        if ((p.L.ids || []).indexOf(s.id) < 0) return;
        s.cancel = true;
        pop(s.unit, 'Immune!', '#dddddd');
      },
    },
  });

  reg({
    id: 'rp_garlic_breath', name: 'Garlic Breath', icon: '🧄', rarity: 'common', tags: ['offense', 'aura'],
    levels: [{ dmg: 1 }, { dmg: 2 }, { dmg: 3 }],
    desc: function (L) { return 'At the start of your turn, every adjacent foe takes ' + L.dmg + ' damage (ignores armor).'; },
    flavor: 'Vampires hate it. Goblins hate it. The party has started wearing masks.',
    hooks: {
      onTurnStart: function (unit, p) {
        foesWithin(unit, 1, 1).forEach(function (f) {
          if (active(f)) DD.Act.damage(unit, f, p.L.dmg, { cause: 'status', tags: ['rp_garlic'] });
        });
      },
    },
  });

  reg({
    id: 'rp_leaky_waterskin', name: 'Leaky Waterskin', icon: '💦', rarity: 'common', tags: ['surface'],
    levels: [{ surface: 'water', turns: 2 }, { surface: 'water', turns: 3 }, { surface: 'ice', turns: 3 }],
    desc: function (L) {
      return L.surface === 'ice'
        ? 'Every tile you walk out of becomes an ice sheet for ' + L.turns + ' rounds if it has no surface yet (pushed units slide on ice).'
        : 'Every tile you walk out of becomes a puddle for ' + L.turns + ' rounds if it has no surface yet.';
    },
    flavor: 'The cork fell out in session two. Nobody has had the heart to tell you.',
    hooks: {
      onCombatStart: function (unit, p) { p.data.pos = { x: unit.x, y: unit.y }; },
      onTurnStart: function (unit, p) { p.data.pos = { x: unit.x, y: unit.y }; },
      onEnterTile: function (unit, tile, cause, p) {
        const prev = p.data.pos;
        p.data.pos = { x: tile.x, y: tile.y };
        if (cause !== 'move' || !prev || dist(prev, tile) !== 1) return;
        const t = DD.Grid.tile(prev.x, prev.y);
        if (t && !t.surface) DD.Act.setSurface(prev.x, prev.y, p.L.surface, p.L.turns);
      },
    },
  });

  /** Frequent Flyer upgrades, one picked at random (combat RNG) per redemption. */
  const UPGRADES = [
    { id: 'ap', text: '+1 AP', apply: function (u) { DD.Act.gainAp(u, 1); } },
    { id: 'block', text: '4 Block', apply: function (u) { DD.Act.addBlock(u, 4); } },
    { id: 'inspired', text: 'Inspired', apply: function (u) { DD.Act.addStatus(u, 'inspired', { turns: 1 }, u); } },
  ];
  reg({
    id: 'rp_frequent_flyer', name: 'Frequent Flyer Miles', icon: '✈️', rarity: 'common', tags: ['flying', 'random', 'proc', 'move'],
    levels: [{ miles: 8 }, { miles: 6 }, { miles: 5 }],
    requires: REQ.flyer,
    desc: function (L) {
      return 'Each tile you move earns a mile. At the start of your turn, ' + L.miles + ' miles buy a random upgrade (one per turn): ' +
        '+1 AP, 4 Block or Inspired for 1 turn. Flyers only.';
    },
    flavor: 'The miles never expire. The airline is a griffon named Doug. Doug upgrades you out of pity.',
    hooks: {
      onMove: function (unit, path, p) {
        const before = p.data.miles || 0;
        p.data.miles = before + ((path && path.length) || 0);
        if (before < p.L.miles && p.data.miles >= p.L.miles) pop(unit, '✈️ Upgrade ready!', '#bfefff');
      },
      onTurnStart: function (unit, p) {
        if ((p.data.miles || 0) < p.L.miles) return;
        p.data.miles -= p.L.miles;
        const up = UPGRADES[rng().int(0, UPGRADES.length - 1)];
        p.data.last = up.id;
        up.apply(unit);
        pop(unit, '✈️ ' + up.text + '!', '#bfefff');
        say(unit, p, 'redeems ' + p.L.miles + ' miles: ' + up.text + '. Doug sighs.');
      },
    },
  });

  reg({
    id: 'rp_compound_interest', name: 'Compound Interest', icon: '📈', rarity: 'common', tags: ['gold'],
    levels: [{ pct: 5, cap: 5 }, { pct: 8, cap: 8 }, { pct: 10, cap: 12 }],
    requires: REQ.gold,
    desc: function (L) { return 'At the start of each fight, the party gains ' + L.pct + '% of its gold as interest (max ' + L.cap + '). Gold-spenders only.'; },
    flavor: 'Money makes money. Gold makes gold. The goblin bank is furious.',
    hooks: {
      onCombatStart: function (unit, p) {
        const n = Math.min(p.L.cap, Math.floor(DD.Act.gold() * p.L.pct / 100));
        if (n > 0 && DD.Act.gainGold(n)) pop(unit, '📈 +' + n + ' gold', '#ffd76a');
      },
    },
  });

  reg({
    id: 'rp_cardio_king', name: 'Cardio King', icon: '🏃', rarity: 'common', tags: ['offense', 'move'],
    levels: [{ block: 2, dmg: 2 }, { block: 3, dmg: 3 }, { block: 4, dmg: 4 }],
    desc: function (L) {
      return 'The first time each turn you have walked 4+ tiles: gain ' + L.block + ' Block, and your next skill hit on a foe this turn deals +' +
        L.dmg + ' damage.';
    },
    flavor: 'Never skips leg day. Never skips any day. Will not stop telling you about it.',
    hooks: {
      onMove: function (unit, path, p) {
        if (!ownTurn(unit)) return;   // pushed, pulled or walked on someone else's turn: not cardio
        const k = turnNo();
        if (p.data.walkTurn !== k) { p.data.walkTurn = k; p.data.walked = 0; p.data.fired = false; p.data.pumped = false; }
        p.data.walked += (path && path.length) || 0;
        if (p.data.fired || p.data.walked < 4) return;
        p.data.fired = true;
        p.data.pumped = true;
        DD.Act.addBlock(unit, p.L.block);
        pop(unit, '🏃 Cardio!', '#9fffb0');
      },
      modifyOutgoingDamage: function (d, p) {
        if (!p.data.pumped || p.data.walkTurn !== turnNo() || !ownTurn(d.source) || !skillHit(d)) return;
        p.data.pumped = false;
        d.flat += p.L.dmg;
      },
    },
  });

  reg({
    id: 'rp_swamp_thing', name: 'Swamp Thing', icon: '🐸', rarity: 'common', tags: ['offense', 'surface'],
    levels: [{ dmg: 2 }, { dmg: 3 }, { dmg: 4 }],
    desc: function (L) {
      return 'While you stand in a surface (puddle, blood, oil, fire, a cloud...; flyers only count clouds), your skill hits on foes deal +' + L.dmg + ' damage.';
    },
    flavor: 'Most comfortable ankle-deep in something. Does not want to know what.',
    hooks: {
      modifyOutgoingDamage: function (d, p) {
        if (!skillHit(d)) return;
        const t = DD.Grid.tile(d.source.x, d.source.y);
        // v2 request: a flyer is not ankle-deep in anything on the floor; a cloud (steam, smoke) wraps it all the same
        if (t && t.surface && DD.Grid.feelsSurface(d.source, t.surface)) d.flat += p.L.dmg;
      },
    },
  });

  reg({
    id: 'rp_revenge_arc', name: 'Revenge Arc', icon: '💢', rarity: 'common', tags: ['offense', 'ally'],
    levels: [{ pct: 20, block: 3 }, { pct: 30, block: 4 }, { pct: 40, block: 5 }],
    desc: function (L) {
      return 'While an allied hero is downed, your skill hits on foes deal +' + L.pct + '% damage. When an allied summon dies, gain ' + L.block + ' Block.';
    },
    flavor: 'They took everything from you. Mostly a friend. Also your good mood.',
    hooks: {
      modifyOutgoingDamage: function (d, p) {
        if (!skillHit(d)) return;
        const u = d.source, units = S().units;
        for (let i = 0; i < units.length; i++) {
          const o = units[i];
          if (o !== u && o.kind === 'hero' && o.side === u.side && o.downed && !o.dead) { d.mult *= 1 + p.L.pct / 100; return; }
        }
      },
      onAllyDeath: function (unit, dead, p) {
        if (!dead || dead.kind !== 'summon') return;
        DD.Act.addBlock(unit, p.L.block);
        pop(unit, '🔥 For ' + dead.name + '!', '#ff9f6b');
      },
    },
  });

  // ==================================================================================================
  // UNCOMMON — a good item: conditional power, status riders, ducks, chaos
  // ==================================================================================================

  reg({
    id: 'rp_adrenaline_junkie', name: 'Adrenaline Junkie', icon: '💉', rarity: 'uncommon', tags: ['ap'],
    levels: [{ min: 6 }, { min: 5 }, { min: 4 }],
    desc: function (L) {
      return 'Whenever an enemy skill hits you for ' + L.min + '+ damage (Block included), gain +1 AP at the start of your next turn (max +1 per turn).';
    },
    flavor: 'Gets hit, gets HYPED. Has jumped off three cliffs "for the vibes".',
    hooks: {
      onTakeDamage: function (d, p) { if (hitByFoe(d) && d.amount >= p.L.min && d.target.hp > 0) p.data.pending = true; },
      onTurnStart: function (unit, p) {
        if (!p.data.pending) return;
        p.data.pending = false;
        DD.Act.gainAp(unit, 1);
        pop(unit, '💉 ADRENALINE!', '#ff9f6b');
      },
    },
  });

  reg({
    id: 'rp_vampire_wannabe', name: 'Vampire Wannabe', icon: '🧛', rarity: 'uncommon', tags: ['heal', 'offense'],
    levels: [{ pct: 20 }, { pct: 30 }, { pct: 40 }],
    desc: function (L) { return 'Heal ' + L.pct + '% of the damage your skill hits deal to foes (rounded).'; },
    flavor: 'Not a vampire. Wears the cape anyway. Hisses at garlic bread.',
    hooks: {
      onDealDamage: function (d, p) {
        if (!skillHit(d) || d.dealt <= 0 || !active(d.source)) return;
        const n = Math.round(d.dealt * p.L.pct / 100);
        if (n > 0) DD.Act.heal(null, d.source, n);
      },
    },
  });

  reg({
    id: 'rp_petty_revenge', name: 'Petty Revenge', icon: '😠', rarity: 'uncommon', tags: ['status'],
    levels: [{ mark: 2 }, { mark: 3 }, { mark: 4 }],
    desc: function (L) { return 'When a foe hits you with a skill, it is Marked ' + L.mark + ' (the next damage it takes is +' + L.mark + ').'; },
    flavor: 'Keeps a list. The list has a list. Everyone on both will pay.',
    hooks: {
      onTakeDamage: function (d, p) {
        if (!hitByFoe(d) || d.amount <= 0 || !active(d.source)) return;
        DD.Act.addStatus(d.source, 'marked', { stacks: p.L.mark }, d.target);
      },
    },
  });

  reg({
    id: 'rp_bee_whisperer', name: 'Bee Whisperer', icon: '🐝', rarity: 'uncommon', tags: ['status', 'aoe'],
    levels: [{ poison: 2 }, { poison: 3 }, { poison: 4 }],
    desc: function (L) { return 'Whenever you kill an enemy, bees burst out of it: every foe within 2 tiles of it gets Poison ' + L.poison + '.'; },
    flavor: 'The bees are your friends. The bees do not understand personal space.',
    hooks: {
      onKill: function (d, p) {
        const v = d.target, u = d.credit;
        if (!v || v.side !== 'enemy' || !u) return;
        DD.FX.particles(v, { kind: 'sparks', color: '#ffd23f', count: 14 });
        DD.Combat.foesOf(u).forEach(function (f) { if (dist(f, v) <= 2) DD.Act.addStatus(f, 'poison', { stacks: p.L.poison }, u); });
      },
    },
  });

  reg({
    id: 'rp_wild_magic_allergy', name: 'Wild Magic Allergy', icon: '🎆', rarity: 'uncommon', tags: ['wildmagic', 'proc'],
    levels: [{ pct: 15, good: false }, { pct: 20, good: false }, { pct: 20, good: true }],
    desc: function (L) {
      return 'At the start of each of your turns: ' + L.pct + '% chance of a Wild Surge' + (L.good ? ' (good surges only).' : ' (any kind, mostly good).');
    },
    flavor: 'Sneezes sparkles. Hiccups fireballs. Is no longer allowed in libraries.',
    hooks: {
      onTurnStart: function (unit, p) { if (roll(p.L.pct)) surge(unit, p, p.L.good ? { good: true } : null); },
    },
  });

  reg({
    id: 'rp_resting_villain_face', name: 'Resting Villain Face', icon: '😒', rarity: 'uncommon', tags: ['status', 'aura'],
    levels: [{ r: 1, vuln: false }, { r: 2, vuln: false }, { r: 2, vuln: true }],
    desc: function (L) {
      return 'At the start of your turn, ' + (L.r === 1 ? 'adjacent foes are' : 'foes within ' + L.r + ' tiles are') + ' Weakened' +
        (L.vuln ? ' and Vulnerable' : '') + ' for 1 turn.';
    },
    flavor: "Isn't angry. Just looks like that. Once made a lich apologize.",
    hooks: {
      onTurnStart: function (unit, p) {
        foesWithin(unit, p.L.r, 1).forEach(function (f) {
          DD.Act.addStatus(f, 'weak', { turns: 1 }, unit);
          if (p.L.vuln && active(f)) DD.Act.addStatus(f, 'vulnerable', { turns: 1 }, unit);
        });
      },
    },
  });

  reg({
    id: 'rp_inspiring_monologue', name: 'Inspiring Monologue', icon: '🎤', rarity: 'uncommon', tags: ['buff', 'ally'],
    levels: [{ r: 2, turns: 2 }, { r: 3, turns: 2 }, { r: 3, turns: 3 }],
    desc: function (L) {
      return 'At the start of each fight, you and allies within ' + L.r + ' tiles are Inspired (+25% damage) for ' + plural(L.turns, 'turn') + '.';
    },
    flavor: 'Five minutes on courage, ten on the time their cat died. Somehow it works.',
    hooks: {
      onCombatStart: function (unit, p) {
        const crowd = [unit].concat(DD.Combat.friendsOf(unit).filter(function (a) { return dist(a, unit) <= p.L.r; }));
        crowd.forEach(function (a) { DD.Act.addStatus(a, 'inspired', { turns: p.L.turns }, unit); });
      },
    },
  });

  reg({
    id: 'rp_parkour', name: 'Parkour Enthusiast', icon: '🤸', rarity: 'uncommon', tags: ['move', 'stat'],
    levels: [{ mov: 1, hop: false }, { mov: 1, hop: true }, { mov: 2, hop: true }],
    stats: function (L) { return { mov: L.mov }; },
    desc: function (L) { return '+' + L.mov + ' move' + (L.hop ? ', and you can climb 2 levels in one step.' : '.'); },
    flavor: 'PARKOUR! Has never once used a door. The doors miss them.',
    hooks: {
      onCombatStart: function (unit, p) { if (p.L.hop) unit.flags.hop = true; },
    },
  });

  // v2: the only d20 left in the game is initiative, so the dice are loaded there (rolled fights only)
  reg({
    id: 'rp_loaded_dice', name: 'Loaded Dice', icon: '🎲', rarity: 'uncommon', tags: ['random', 'initiative', 'hype'],
    levels: [{ dice: 2, bonus: 0 }, { dice: 2, bonus: 2 }, { dice: 3, bonus: 2 }],
    desc: function (L) {
      return 'You roll initiative with ' + L.dice + ' d20s and keep the best' + (L.bonus ? ' (+' + L.bonus + ' initiative)' : '') +
        '. A natural 20: you are Inspired for 2 turns and the party gains 15 Hype.';
    },
    flavor: "They're not loaded. They're just... motivated. Please don't weigh them.",
    hooks: {
      modifyInitiative: function (r, p) {
        const u = r.unit;
        let best = r.roll;
        const dice = [r.roll];
        for (let i = 1; i < p.L.dice; i++) { const d = rng().int(1, 20); dice.push(d); if (d > best) best = d; }
        r.total += best - r.roll + p.L.bonus;
        r.init += p.L.bonus;
        r.roll = best;
        p.data.dice = dice;
        pop(u, '🎲 ' + dice.join(' / '), best === 20 ? '#ffd23f' : '#ffffff');
        if (best !== 20 || p.data.nat20) return;
        p.data.nat20 = true;
        DD.Act.addStatus(u, 'inspired', { turns: 2 }, u);
        DD.Act.gainHype(15, 'natural 20');
        say(u, p, 'rolls ' + dice.join(' and ') + '. NATURAL TWENTY!', 'hero');
      },
    },
  });

  /**
   * Method Actor's casting pool: rollable table entries of those rarities with an in-fight effect (hooks), never a stat
   * boost (stats only count when the unit is built), a run-layer or hero-only one, itself, or one the hero already has.
   */
  function rolePool(unit, rarities) {
    const own = (unit.passives || []).map(function (q) { return q.id; });
    return Object.keys(DD.defs.passives).sort().map(DD.getPassive).filter(function (d) {
      return !!d && d.id.indexOf('rp_') === 0 && d.id !== 'rp_method_actor' && rarities.indexOf(d.rarity) >= 0 && d.weight > 0 &&
        !d.stats && !d.runMods && !d.requires && !!d.hooks && Object.keys(d.hooks).length > 0 && own.indexOf(d.id) < 0;
    });
  }
  reg({
    id: 'rp_method_actor', name: 'Method Actor', icon: '🎭', rarity: 'uncommon', tags: ['random', 'meta'],
    levels: [{ pool: ['common'], lv: 2 }, { pool: ['common', 'uncommon'], lv: 2 }, { pool: ['uncommon', 'rare'], lv: 2 }],
    desc: function (L) {
      return 'Each fight you improvise a role: a random ' + L.pool.join(' or ') + ' Blessing at level ' + DD.util.roman(L.lv) +
        ' for that fight only (never a stat boost, a hero-only one or one you have).';
    },
    flavor: 'Insists on a new backstory every session. The DM has stopped printing character sheets.',
    hooks: {
      onCombatStart: function (unit, p) {
        const pool = rolePool(unit, p.L.pool);
        if (!pool.length) return;
        const role = pool[rng().int(0, pool.length - 1)];
        // a fight-only extra instance: Hooks.each re-reads unit.passives.length, so the role's own onCombatStart runs next
        const inst = DD.passiveInstance({ id: role.id, level: p.L.lv });
        inst.role = true;
        unit.passives.push(inst);
        p.data.role = role.id;
        DD.Act.touch();
        pop(unit, '🎭 ' + role.name + '!', '#e6c3ff');
        say(unit, p, 'tonight, ' + unit.name + ' plays someone with ' + role.name + ' ' + DD.util.roman(inst.level) + '.', 'hero');
      },
    },
  });

  const GREASE = [['root'], ['root', 'slow'], ['root', 'slow', 'stun']];
  reg({
    id: 'rp_greased_up', name: 'Greased Up', icon: '🧈', rarity: 'uncommon', tags: ['defense', 'status', 'opportunity'],
    levels: [{ ids: GREASE[0] }, { ids: GREASE[1] }, { ids: GREASE[2] }],
    desc: function (L) { return "You can't be opportunity-attacked and are immune to " + andList((L.ids || []).map(statusWord)) + '.'; },
    flavor: 'Slathered in butter for reasons. Nobody can hold you. Nobody wants to.',
    hooks: {
      // pure (the HUD's move preview, paths and the AI query it): only for the holder walking away
      modifyOpportunity: function (o, p) { if (mine(o.mover, p)) o.cancel = true; },
      modifyStatus: function (s, p) {
        if ((p.L.ids || []).indexOf(s.id) < 0) return;
        s.cancel = true;
        pop(s.unit, '🧈 Slippery!', '#ffe9a8');
      },
    },
  });

  reg({
    id: 'rp_displacer_ancestry', name: 'Displacer Beast Ancestry', icon: '🐈‍⬛', rarity: 'uncommon', tags: ['teleport', 'proc', 'defense'],
    levels: [{ pct: 20 }, { pct: 30 }, { pct: 40 }],
    desc: function (L) {
      return 'When an enemy skill hits you: ' + L.pct + '% chance you blink (after the hit) to a random free tile 2-3 tiles away ' +
        '(one no enemy can reach, if there is one).';
    },
    flavor: 'Great-grandma was a displacer beast. You inherited the blinking and the tentacle jokes.',
    hooks: {
      onTakeDamage: function (d, p) {
        const u = d.target;
        if (!hitByFoe(d) || d.amount <= 0 || !(u.hp > 0) || !roll(p.L.pct)) return;
        const spots = calmFirst(u, safeTiles(u, 3, 2));
        if (!spots.length) return;
        const q = pick(spots);
        pop(u, '*blink*', '#c9b6ff');
        DD.Act.teleport(u, q.x, q.y);
      },
    },
  });

  reg({
    id: 'rp_cat_reflexes', name: 'Cat Reflexes', icon: '🐈', rarity: 'uncommon', tags: ['defense', 'proc'],
    levels: [{ pct: 10 }, { pct: 15 }, { pct: 20 }],
    desc: function (L) { return 'Enemy skill hits on you have a ' + L.pct + '% chance to deal no damage (dodged).'; },
    flavor: 'Lands on their feet. Knocks things off tables. Refuses to explain either.',
    hooks: {
      modifyIncomingDamage: function (d, p) {
        if (!hitByFoe(d) || !roll(p.L.pct)) return;
        d.flat -= 1e6;
        pop(d.target, '🐈 Dodged!', '#bfefff');
      },
    },
  });

  reg({
    id: 'rp_pyromaniac', name: 'Pyromaniac', icon: '🔥', rarity: 'uncommon', tags: ['offense', 'fire'],
    levels: [{ dmg: 2, burn: 0 }, { dmg: 3, burn: 0 }, { dmg: 3, burn: 1 }],
    requires: REQ.fire,
    desc: function (L) {
      return 'Your fire skill hits on foes deal +' + L.dmg + ' damage.' + (L.burn ? ' Foes they hit also gain Burn ' + L.burn + '.' : '') + ' Fire users only.';
    },
    flavor: 'Has never met a problem that fire could not make more interesting.',
    hooks: {
      modifyOutgoingDamage: function (d, p) { if (skillHit(d) && d.element === 'fire') d.flat += p.L.dmg; },
      onDealDamage: function (d, p) {
        if (p.L.burn && skillHit(d) && d.element === 'fire' && d.amount > 0 && active(d.target)) DD.Act.addStatus(d.target, 'burn', { stacks: p.L.burn }, d.source);
      },
    },
  });

  reg({
    id: 'rp_explosive_personality', name: 'Explosive Personality', icon: '💥', rarity: 'uncommon', tags: ['offense', 'downed'],
    levels: [{ dmg: 8 }, { dmg: 12 }, { dmg: 16 }],
    desc: function (L) { return 'When you are downed, you explode: ' + L.dmg + ' fire damage to every adjacent foe.'; },
    flavor: "Doesn't go down quietly. Doesn't go down cleanly. Bring a mop.",
    hooks: {
      onDowned: function (unit, d, p) {
        DD.FX.explosion(unit, { radius: 1, color: '#ff8a1a' });
        say(unit, p, 'goes out with a bang.', 'dmg');
        DD.Act.damageTiles(unit, adjacentTiles(unit), p.L.dmg, { element: 'fire', filter: 'foes', cause: 'other', tags: ['rp_explosive'] });
      },
    },
  });

  reg({
    id: 'rp_bedside_manner', name: 'Bedside Manner', icon: '🩺', rarity: 'uncommon', tags: ['heal', 'stat'],
    levels: [{ pct: 20, cleanse: false }, { pct: 30, cleanse: false }, { pct: 30, cleanse: true }],
    requires: REQ.healer,
    stats: function (L) { return { heal: L.pct / 100 }; },
    desc: function (L) {
      return '+' + L.pct + '% healing done.' + (L.cleanse ? ' Your heal skills also remove 1 debuff from each ally they reach (you too).' : '') + ' Healers only.';
    },
    flavor: 'Warm hands, cold puns, questionable license. Says "this might sting" and means it.',
    hooks: {
      onSkillUsed: function (ctx, p) {
        if (!p.L.cleanse || !ctx.skill || (ctx.skill.kind !== 'heal' && !tagged(ctx.skill, 'heal'))) return;
        (ctx.friends || []).forEach(function (f) { if (active(f)) DD.Act.cleanse(f, 'debuff', 1); });
      },
    },
  });

  function buffPets(unit, p) {
    p.data.pets = p.data.pets || {};
    S().units.forEach(function (o) {
      if (o.kind !== 'summon' || o.ownerId !== unit.id || !active(o) || p.data.pets[o.id]) return;
      p.data.pets[o.id] = 1;
      o.maxHp += p.L.hp;
      o.hp += p.L.hp;
      o.dmgBonus = (o.dmgBonus || 0) + p.L.pct / 100;
      DD.Act.touch();
      pop(o, '🐶 Good pet!', '#ffd0a0');
    });
  }
  reg({
    id: 'rp_proud_pet_parent', name: 'Proud Pet Parent', icon: '🐶', rarity: 'uncommon', tags: ['summon'],
    levels: [{ hp: 4, pct: 10 }, { hp: 6, pct: 20 }, { hp: 8, pct: 30 }],
    requires: REQ.summoner,
    desc: function (L) { return 'Your summons get +' + L.hp + ' max HP and +' + L.pct + '% damage. Summoners only.'; },
    flavor: 'Has 400 photos of their summons. Will show you all of them. Mid-combat.',
    hooks: {
      onCombatStart: function (unit, p) { buffPets(unit, p); },
      onTurnStart: function (unit, p) { buffPets(unit, p); },
      onSkillUsed: function (ctx, p) { if (active(ctx.user)) buffPets(ctx.user, p); },
    },
  });

  reg({
    id: 'rp_blood_bank_card', name: 'Blood Bank Loyalty Card', icon: '🩸', rarity: 'uncommon', tags: ['blood'],
    levels: [{ n: 1, block: 0 }, { n: 1, block: 3 }, { n: 2, block: 3 }],
    requires: REQ.hpPayer,
    desc: function (L) {
      return 'Your skills cost ' + L.n + ' less HP (min 0).' + (L.block ? ' Using a skill that costs HP gives ' + L.block + ' Block.' : '') + ' HP-payers only.';
    },
    flavor: 'Tenth pint is free. The blood bank has started asking questions.',
    hooks: {
      modifyCost: function (c, p) { if (c.hp > 0) c.hp = Math.max(0, c.hp - p.L.n); },
      onSkillUsed: function (ctx, p) {
        // attacks of opportunity and echoes are free: nothing was paid, so no Block
        if (!p.L.block || !ctx.skill || ctx.rpEcho || ctx.opportunity || !active(ctx.user)) return;
        if (+DD.resolve(ctx.skill.hpCost, ctx.L, ctx.user, 0) > 0) DD.Act.addBlock(ctx.user, p.L.block);
      },
    },
  });

  // ==================================================================================================
  // RARE — a strong item
  // ==================================================================================================

  reg({
    id: 'rp_emotional_support_duck', name: 'Emotional Support Duck', icon: '🦆', rarity: 'rare', tags: ['summon', 'duck'],
    levels: [{ n: 1, hp: 1 }, { n: 1, hp: 1.5 }, { n: 2, hp: 1 }],
    desc: function (L) {
      const hp = Math.round(duckHp() * L.hp);
      return 'At the start of each fight, ' + (L.n === 1 ? 'a Confused Duck (' + hp + ' HP) joins' : L.n + ' Confused Ducks (' + hp + ' HP each) join') + ' you.';
    },
    flavor: 'Not trained. Not licensed. Emotionally supportive in the way only a duck can be.',
    hooks: {
      onCombatStart: function (unit, p) {
        if (!DD.getSummon('wm_duck')) return;
        const spots = safeTiles(unit, 2, 1);
        for (let i = 0; i < p.L.n && i < spots.length; i++) DD.Act.summon(unit, 'wm_duck', spots[i].x, spots[i].y, { hpMult: p.L.hp });
      },
    },
  });

  reg({
    id: 'rp_plot_armor', name: 'Plot Armor', icon: '📖', rarity: 'rare', tags: ['defense', 'survive'],
    levels: [{ block: 0, invuln: false }, { block: 6, invuln: false }, { block: 6, invuln: true }],
    desc: function (L) {
      return 'Once per fight, when you would go down, you stay up at 1 HP instead' +
        (L.invuln ? ', with ' + L.block + ' Block and Invulnerable for 1 turn.' : L.block ? ', with ' + L.block + ' Block.' : '.');
    },
    flavor: "You can't go down yet. You haven't finished your character arc.",
    hooks: {
      // the engine's veto (ARCHITECTURE §5.3): nothing of a down happens, the hero keeps the 1 HP set here
      preventDeath: function (u, d, p) {
        if (p.data.used || u.kind !== 'hero') return false;
        p.data.used = true;
        u.hp = 1;
        DD.Act.touch();
        pop(u, '🎬 PLOT ARMOR!', '#fff3a0');
        say(u, p, 'refuses to go down before the third act.', 'hero');
        if (p.L.block) DD.Act.addBlock(u, p.L.block);
        if (p.L.invuln) DD.Act.addStatus(u, 'invulnerable', { turns: 1 }, u);
        return true;
      },
    },
  });

  reg({
    id: 'rp_ambidextrous', name: 'Ambidextrous', icon: '🤲', rarity: 'rare', tags: ['ap', 'offense'],
    levels: [{ dmg: 0 }, { dmg: 1 }, { dmg: 2 }],
    desc: function (L) { return 'Your first basic attack each turn costs 0 AP.' + (L.dmg ? ' Your basic attacks deal +' + L.dmg + ' damage.' : ''); },
    flavor: 'Attacks with both hands. Writes with both hands. Eats two sandwiches at once.',
    hooks: {
      modifyCost: function (c, p) {
        const u = c.unit;
        if (u && u.basic && c.skill && c.skill.id === u.basic.id && !u.basic.usedThisTurn) c.ap = 0;
      },
      modifyOutgoingDamage: function (d, p) {
        const u = d.source;
        if (p.L.dmg && skillHit(d) && d.skill && u.basic && d.skill.id === u.basic.id) d.flat += p.L.dmg;
      },
    },
  });

  reg({
    id: 'rp_bifocals', name: 'Bifocals', icon: '👓', rarity: 'rare', tags: ['range', 'stat'],
    levels: [{ range: 1, pct: 0 }, { range: 1, pct: 5 }, { range: 1, pct: 10 }],
    stats: function (L) { return L.pct ? { range: L.range, dmg: L.pct / 100 } : { range: L.range }; },
    desc: function (L) { return '+' + L.range + ' range for your skills with a range of 2 or more.' + (L.pct ? ' +' + L.pct + '% damage.' : ''); },
    flavor: 'Can finally see the enemies. Had been fighting a coat rack for two sessions.',
  });

  reg({
    id: 'rp_uno_reverse', name: 'Uno Reverse Card', icon: '🔄', rarity: 'rare', tags: ['defense', 'proc'],
    levels: [{ pct: 15 }, { pct: 20 }, { pct: 25 }],
    desc: function (L) {
      return 'Enemy skill hits on you have a ' + L.pct + "% chance to be reversed: you take nothing and the attacker takes the hit's base damage.";
    },
    flavor: 'Played at the perfect moment. The lich did not know the rules. The lich does now.',
    hooks: {
      modifyIncomingDamage: function (d, p) {
        if (!hitByFoe(d) || !roll(p.L.pct)) return;
        d.flat -= 1e6;
        p.data.reverse = { id: d.source.id, amount: d.base, element: d.element || null };
      },
      onTakeDamage: function (d, p) {
        const r = p.data.reverse;
        if (!r) return;
        p.data.reverse = null;
        const src = d.source;
        if (!src || src.id !== r.id || !active(src)) return;
        pop(d.target, '🔄 UNO REVERSE!', '#ff6fb5');
        DD.Act.damage(d.target, src, r.amount, { cause: 'other', reflect: true, element: r.element, tags: ['rp_reverse'] });
      },
    },
  });

  reg({
    id: 'rp_extra_attack', name: 'Extra Attack (Allegedly)', icon: '⚔️', rarity: 'rare', tags: ['ap', 'kill'],
    levels: [{ n: 1 }, { n: 2 }, { n: 3 }],
    desc: function (L) { return 'During your turn, each kill gives you +1 AP (up to ' + plural(L.n, 'time') + ' per turn).'; },
    flavor: "Says 'I get an extra attack' every turn. Has never once checked the class features.",
    hooks: {
      onKill: function (d, p) {
        const u = d.credit;
        if (!u || !d.target || d.target.side !== 'enemy' || !active(u) || !ownTurn(u)) return;
        if (p.data.turn !== turnNo()) { p.data.turn = turnNo(); p.data.n = 0; }
        if (p.data.n >= p.L.n) return;
        p.data.n++;
        DD.Act.gainAp(u, 1);
      },
    },
  });

  reg({
    id: 'rp_circle_of_life', name: 'Circle of Life (Duck Edition)', icon: '🐣', rarity: 'rare', tags: ['summon', 'duck', 'kill'],
    levels: [{ pct: 30 }, { pct: 45 }, { pct: 60 }],
    desc: function (L) { return 'When you kill a non-boss enemy, ' + L.pct + '% chance it is reincarnated as a Confused Duck (' + duckHp() + ' HP) on your side.'; },
    flavor: "Death is not the end. Death is a duck. The druids won't confirm or deny.",
    hooks: {
      onKill: function (d, p) {
        const v = d.target, u = d.credit;
        if (!v || !u || v.side !== 'enemy' || DD.Act.isBoss(v) || !DD.getSummon('wm_duck') || !roll(p.L.pct)) return;
        const duck = DD.Act.summon(u, 'wm_duck', v.x, v.y, {});
        if (duck) say(u, p, v.name + ' is reincarnated as ' + duck.name + ' the duck.', 'hero');
      },
    },
  });

  reg({
    id: 'rp_wild_conduit', name: 'Wild Magic Conduit', icon: '🌀', rarity: 'rare', tags: ['wildmagic'],
    levels: [{ every: 4, good: false }, { every: 3, good: false }, { every: 3, good: true }],
    desc: function (L) { return 'Every ' + ordinal(L.every) + ' skill you use triggers a Wild Surge' + (L.good ? ' (good surges only).' : ' (any kind, mostly good).'); },
    flavor: 'Magic flows through you. Mostly out of your ears. Sometimes as bees.',
    hooks: {
      onSkillUsed: function (ctx, p) {
        const u = ctx.user;
        // attacks of opportunity are reactions, not skills you use
        if (!ctx.slot || ctx.rpEcho || ctx.opportunity || !active(u) || S().result) return;
        p.data.count = (p.data.count || 0) + 1;
        if (p.data.count % p.L.every === 0) surge(u, p, p.L.good ? { good: true } : null);
      },
    },
  });

  reg({
    id: 'rp_gold_plated_ego', name: 'Gold-Plated Ego', icon: '🥇', rarity: 'rare', tags: ['defense', 'gold'],
    // v2: no free shields — a rare, and in real runs the party often holds 100-200 gold
    levels: [{ per: 30, max: 3 }, { per: 25, max: 4 }, { per: 20, max: 5 }],
    desc: function (L) { return 'At the start of your turn, gain 1 Block per ' + L.per + ' gold the party holds (max ' + L.max + ').'; },
    flavor: 'Literally gold-plated. Took a fireball to the face and asked if it brought out the shine.',
    hooks: {
      onTurnStart: function (unit, p) {
        const n = Math.min(p.L.max, Math.floor(DD.Act.gold() / p.L.per));
        if (n > 0) DD.Act.addBlock(unit, n);
      },
    },
  });

  reg({
    id: 'rp_deja_vu', name: 'Déjà Vu Enthusiast', icon: '🔁', rarity: 'rare', tags: ['cooldown'],
    levels: [{ every: 4, ap: 0 }, { every: 3, ap: 0 }, { every: 3, ap: 1 }],
    desc: function (L) {
      return 'At the start of your turn on every ' + ordinal(L.every) + ' round (' + L.every + ', ' + (L.every * 2) + ', ' + (L.every * 3) + '...), your skill cooldowns reset' +
        (L.ap ? ' and you gain ' + L.ap + ' AP.' : '.');
    },
    flavor: "Didn't we already fight these guys? We did. We will again. And again.",
    hooks: {
      onTurnStart: function (unit, p) {
        const r = roundNo();
        if (r < p.L.every || r % p.L.every !== 0) return;
        DD.Act.resetCooldowns(unit);
        if (p.L.ap) DD.Act.gainAp(unit, p.L.ap);
      },
    },
  });

  reg({
    id: 'rp_gravitational_ego', name: 'Gravitational Ego', icon: '🪐', rarity: 'rare', tags: ['pull', 'control'],
    levels: [{ r: 3, vuln: false }, { r: 4, vuln: false }, { r: 4, vuln: true }],
    desc: function (L) {
      return 'At the start of your turn, every foe 2-' + L.r + ' tiles away is pulled 1 tile toward you' + (L.vuln ? '; foes that move are Vulnerable for 1 turn.' : '.');
    },
    flavor: 'The universe revolves around you. Physically, now. The goblins are very confused.',
    hooks: {
      onTurnStart: function (unit, p) {
        const list = foesWithin(unit, p.L.r, 2).sort(function (a, b) { return dist(a, unit) - dist(b, unit); });
        list.forEach(function (f) {
          if (!active(f) || !active(unit)) return;
          const res = DD.Act.pull(unit, f, { x: unit.x, y: unit.y }, 1);
          if (p.L.vuln && res && res.moved > 0 && active(f)) DD.Act.addStatus(f, 'vulnerable', { turns: 1 }, unit);
        });
      },
    },
  });

  // ==================================================================================================
  // LEGENDARY — changes how the hero plays
  // ==================================================================================================

  reg({
    id: 'rp_chosen_one', name: 'Chosen One (Self-Declared)', icon: '🌟', rarity: 'legendary', tags: ['ap', 'stat'],
    levels: [{ pct: 0 }, { pct: 10 }],
    stats: function (L) { return L.pct ? { ap: 1, dmg: L.pct / 100 } : { ap: 1 }; },
    desc: function (L) { return '+1 AP every turn.' + (L.pct ? ' +' + L.pct + '% damage.' : ''); },
    flavor: 'A prophecy foretold your coming. You wrote the prophecy. In crayon.',
  });

  reg({
    id: 'rp_cooldowns_social_construct', name: 'Cooldowns Are a Myth', icon: '⏩', rarity: 'legendary', tags: ['cooldown', 'ap'],
    levels: [{ cheap: false }, { cheap: true }],
    desc: function (L) {
      return 'Your skills have no cooldowns. The first skill with a cooldown you use each turn costs ' +
        (L.cheap ? '1 AP less (min 1)' : 'as usual') + '; later ones that turn cost +1 AP.';
    },
    flavor: 'Read the rules. Disagreed with them. The DM has stopped arguing.',
    hooks: {
      // a query (the HUD asks on every hover): only reads p.data and the turn counter
      modifyCost: function (c, p) {
        if (!c.unit || !c.skill || !hasCooldown(c.unit, c.skill)) return;
        if (p.data.usedTurn !== turnNo()) { if (p.L.cheap && c.ap > 1) c.ap -= 1; return; }
        c.ap += 1;
      },
      onSkillUsed: function (ctx, p) {
        const u = ctx.user;
        if (!ctx.slot || ctx.opportunity || !hasCooldown(u, ctx.skill)) return;
        if (!ctx.rpEcho) p.data.usedTurn = turnNo();
        if (ctx.slot.cd > 0) DD.Act.setCooldown(u, ctx.skill.id, 0);
      },
    },
  });

  reg({
    id: 'rp_echo_chamber', name: 'Echo Chamber', icon: '🔊', rarity: 'legendary', tags: ['proc', 'offense'],
    levels: [{ pct: 25 }, { pct: 40 }],
    desc: function (L) {
      return 'When you use a skill (not your signature), ' + L.pct + '% chance it echoes: it resolves again, for free, on the same target (if still valid).';
    },
    flavor: 'Everything you do happens twice. Everything you do happens twice.',
    hooks: {
      onSkillUsed: function (ctx, p) {
        const u = ctx.user, s = S();
        // an attack of opportunity is a free reaction (once per round by rule), not a skill you use: it never echoes
        if (p.data.echoing || ctx.rpEcho || ctx.opportunity || !ctx.slot || ctx.slot === u.signature || !ctx.target || s.result || !active(u)) return;
        if (!roll(p.L.pct) || !DD.Targeting.isValidTarget(u, ctx.slot, ctx.target.x, ctx.target.y)) return;
        p.data.echoing = true;
        try {
          pop(u, '🔊 ECHO!', '#d9a8ff');
          say(u, p, ctx.skill.name + ' echoes!', 'hero');
          DD.Combat.resolveSkill(u, ctx.slot, ctx.target, { extra: { rpEcho: true } });
        } finally { p.data.echoing = false; }
      },
    },
  });

  reg({
    id: 'rp_phoenix_feather', name: 'Phoenix Feather (Probably)', icon: '🪶', rarity: 'legendary', tags: ['survive', 'fire'],
    levels: [{ pct: 50, dmg: 6 }, { pct: 75, dmg: 10 }],
    desc: function (L) {
      return 'The first time you are downed each fight, you rise again at ' + L.pct + '% HP and burst into flames: ' + L.dmg + ' fire damage to every adjacent foe.';
    },
    flavor: 'Definitely a phoenix feather. Not a chicken feather dipped in hot sauce. Stop asking.',
    hooks: {
      onDowned: function (unit, d, p) {
        // still down? (an item may have revived the hero first: then the feather is kept for the next down)
        if (p.data.used || !unit.downed || unit.dead) return;
        p.data.used = true;
        if (!DD.Act.revive(unit, p.L.pct / 100)) return;
        // downed mid-walk (an attack of opportunity, a trap): he did go down, so that walk ends where he fell (DESIGN §4.2)
        DD.Act.stopMove(unit);
        pop(unit, '🪶 RISE!', '#ff8a1a');
        DD.FX.explosion(unit, { radius: 1, color: '#ff7a1a' });
        DD.Act.damageTiles(unit, adjacentTiles(unit), p.L.dmg, { element: 'fire', filter: 'foes', cause: 'other', tags: ['rp_phoenix'] });
      },
    },
  });

  reg({
    id: 'rp_ultra_instinct', name: 'Ultra Instinct (Unlicensed)', icon: '🥋', rarity: 'legendary', tags: ['defense'],
    levels: [{ counter: 0 }, { counter: 4 }],
    desc: function (L) {
      return 'The first enemy skill hit on you each round deals no damage' + (L.counter ? ', and you hit the attacker back for ' + L.counter + ' damage.' : '.');
    },
    flavor: 'Dodges without thinking. Also does taxes without thinking. Mixed results.',
    hooks: {
      modifyIncomingDamage: function (d, p) {
        if (!hitByFoe(d) || p.data.round === roundNo()) return;
        p.data.round = roundNo();
        d.flat -= 1e6;
        pop(d.target, '🥋 Ultra Instinct!', '#bfefff');
        if (p.L.counter) p.data.counter = d.source.id;
      },
      onTakeDamage: function (d, p) {
        const id = p.data.counter;
        if (!id) return;
        p.data.counter = null;
        if (d.source && d.source.id === id && active(d.source)) {
          DD.Act.damage(d.target, d.source, p.L.counter, { cause: 'other', reflect: true, tags: ['rp_counter'] });
        }
      },
    },
  });

  reg({
    id: 'rp_wild_magic_overload', name: 'Wild Magic Overload', icon: '✨', rarity: 'legendary', tags: ['wildmagic'],
    levels: [{ pct: 50 }, { pct: 100 }],
    desc: function (L) {
      return L.pct >= 100 ? 'At the start of each of your turns, a good Wild Surge happens.'
        : 'At the start of each of your turns: ' + L.pct + '% chance of a good Wild Surge.';
    },
    flavor: 'The Weave has a crush on you. It will not stop sending gifts.',
    hooks: {
      onTurnStart: function (unit, p) { if (roll(p.L.pct)) surge(unit, p, { good: true }); },
    },
  });

  // ==================================================================================================
  // CURSED — legendary upside, real (and funny) downside
  // ==================================================================================================

  reg({
    id: 'rp_cursed_glass_cannon', name: 'Cursed: Glass Cannon', icon: '🍷', rarity: 'cursed', tags: ['offense', 'cursed'],
    levels: [{ pct: 40, taken: 30 }, { pct: 50, taken: 30 }],
    stats: function (L) { return { dmg: L.pct / 100 }; },
    desc: function (L) { return '+' + L.pct + '% damage. Downside: you take +' + L.taken + '% damage from everything.'; },
    flavor: "Hits like a dragon. Breaks like a wine glass. Please don't sneeze near them.",
    hooks: {
      modifyIncomingDamage: function (d, p) { d.mult *= 1 + p.L.taken / 100; },
    },
  });

  reg({
    id: 'rp_cursed_kleptomaniac', name: 'Cursed: Kleptomaniac', icon: '🦝', rarity: 'cursed', tags: ['gold', 'cursed', 'run'],
    levels: [{ gold: 2, price: 40 }, { gold: 3, price: 40 }],
    runMods: function (L) { return { price: L.price / 100 }; },
    desc: function (L) {
      return 'Every time one of your skills hits a foe, the party gains ' + L.gold + ' gold. Downside: shop prices are ' + L.price + '% higher (they know).';
    },
    flavor: "Steals from enemies, allies, shopkeepers and, once, from themselves. Won't give any of it back.",
    hooks: {
      onDealDamage: function (d, p) {
        if (!skillHit(d) || d.amount <= 0) return;
        if (DD.Act.gainGold(p.L.gold)) DD.FX.particles(d.target, { kind: 'coins', count: 5 });
      },
    },
  });

  reg({
    // v2: the taunt itself is control now (enemies must attack you), so the upside is the snack alone — with the old
    // +2/+3 armor on top it out-scored every legendary in the sims, even on one hero
    id: 'rp_cursed_loud_eater', name: 'Cursed: Loud Eater', icon: '🍗', rarity: 'cursed', tags: ['heal', 'taunt', 'cursed'],
    levels: [{ heal: 3 }, { heal: 5 }],
    desc: function (L) {
      return 'Heal ' + L.heal + ' HP at the start of each of your turns (snacking). Downside: each round starts with ' +
        'enemies within 3 tiles Taunted by you (they must attack you if they can).';
    },
    flavor: 'Crunches chips during stealth missions. The whole dungeon knows exactly where you are.',
    hooks: {
      onTurnStart: function (unit, p) { DD.Act.heal(null, unit, p.L.heal); },
      onRoundStart: function (unit, round, p) {
        foesWithin(unit, 3, 1).forEach(function (f) { DD.Act.addStatus(f, 'taunt', { turns: 1, silent: true }, unit); });
      },
    },
  });

  reg({
    id: 'rp_cursed_monkey_paw', name: "Cursed: Monkey's Paw", icon: '🐒', rarity: 'cursed', tags: ['ap', 'wildmagic', 'cursed'],
    levels: [{ pct: 25 }, { pct: 20 }],
    stats: function () { return { ap: 1 }; },
    desc: function (L) { return '+1 AP every turn. Downside: at the start of each of your turns, ' + L.pct + '% chance of a bad Wild Surge.'; },
    flavor: 'You wished for more time. The paw curled. Now you have more time to regret things.',
    hooks: {
      onTurnStart: function (unit, p) { if (roll(p.L.pct)) surge(unit, p, { kind: 'bad' }); },
    },
  });

  reg({
    id: 'rp_cursed_couch_potato', name: 'Cursed: Couch Potato', icon: '🛋️', rarity: 'cursed', tags: ['ap', 'offense', 'cursed'],
    levels: [{ pct: 20 }, { pct: 30 }],
    stats: function (L) { return { ap: 1, dmg: L.pct / 100 }; },
    desc: function (L) {
      return '+1 AP every turn and +' + L.pct + '% damage. Downside: getting up is hard — at the start of each of your turns you are Confused ' +
        '(moving costs 2 AP).';
    },
    flavor: "Hasn't stood up since the campaign began. Somehow still the party's best shot.",
    hooks: {
      onTurnStart: function (unit, p) { DD.Act.addStatus(unit, 'confused', { turns: 1, silent: true }, unit); },
    },
  });

  reg({
    id: 'rp_cursed_narcoleptic', name: 'Cursed: Narcoleptic', icon: '😪', rarity: 'cursed', tags: ['offense', 'cursed'],
    levels: [{ pct: 40, chance: 15 }, { pct: 50, chance: 10 }],
    stats: function (L) { return { dmg: L.pct / 100 }; },
    desc: function (L) {
      return '+' + L.pct + '% damage. Downside: at the end of each of your turns, ' + L.chance + '% chance you fall Asleep (you lose your next turn unless something hits you).';
    },
    flavor: 'Fell asleep mid-battle cry. Woke up mid-battle cry. Finished the battle cry.',
    hooks: {
      onTurnEnd: function (unit, p) {
        if (!roll(p.L.chance)) return;
        pop(unit, '😪 Zzz...', '#bfd0ff');
        DD.Act.addStatus(unit, 'sleep', { turns: 1 }, unit);
      },
    },
  });

  /** A skill's own AP cost at the level its user has it (before any modifyCost hook): what "costs 2+ AP" means. */
  function listedAp(u, def, L) {
    if (!L) { const sl = slotOf(u, def.id); L = DD.skillLevel(def, (sl && sl.level) || 1); }
    return +DD.resolve(def.ap, L, u, 1) || 0;
  }
  reg({
    id: 'rp_cursed_blood_pact', name: 'Cursed: Unread Blood Pact', icon: '🖋️', rarity: 'cursed', tags: ['ap', 'blood', 'cursed'],
    levels: [{ hp: 3 }, { hp: 2 }],
    desc: function (L) {
      return 'Your skills that cost 2+ AP cost 1 AP less. Downside: at the end of each of your turns in which you used one, pay ' + L.hp +
        ' HP (never below 1).';
    },
    flavor: 'Signed in blood without reading it. Page 40 mentions "monthly installments".',
    hooks: {
      modifyCost: function (c, p) { if (c.unit && c.skill && listedAp(c.unit, c.skill) >= 2) c.ap -= 1; },
      onSkillUsed: function (ctx, p) {
        if (!ctx.slot || ctx.rpEcho || ctx.opportunity || !ctx.skill || !ownTurn(ctx.user) || listedAp(ctx.user, ctx.skill, ctx.L) < 2) return;
        p.data.owed = turnNo();
      },
      onTurnEnd: function (unit, p) {
        if (!p.data.owed || p.data.owed !== turnNo()) return;
        p.data.owed = 0;
        const paid = Math.min(p.L.hp, unit.hp - 1);
        if (paid <= 0) return;
        unit.hp -= paid;
        DD.Act.touch();
        DD.FX.damage(unit, paid, { cost: true });
        DD.Act.log(unit.name + ' pays ' + paid + ' HP to the Blood Pact.', 'dmg');
      },
    },
  });

  reg({
    id: 'rp_cursed_predatory_loan', name: 'Cursed: Predatory Loan', icon: '🦈', rarity: 'cursed', tags: ['hype', 'gold', 'cursed'],
    levels: [{ hype: 30, fee: 10 }, { hype: 40, fee: 10 }],
    stats: function (L) { return { hype: L.hype }; },
    desc: function (L) {
      return 'The party starts each fight with +' + L.hype + ' Hype. Downside: each fight costs ' + L.fee + ' gold in interest; if the party ' +
        "can't pay, you start Vulnerable and Weak for 2 turns.";
    },
    flavor: 'Borrowed Hype from a loan shark named Gary. Gary is an actual shark. Gary has legs.',
    hooks: {
      onCombatStart: function (unit, p) {
        if (DD.Act.spendGold(p.L.fee)) { say(unit, p, 'pays Gary ' + p.L.fee + ' gold in interest.'); return; }
        say(unit, p, "can't pay Gary. Gary is disappointed.", 'dmg');
        DD.Act.addStatus(unit, 'vulnerable', { turns: 2 }, unit);
        DD.Act.addStatus(unit, 'weak', { turns: 2 }, unit);
      },
    },
  });

  reg({
    id: 'rp_cursed_spontaneous_combustion', name: 'Cursed: Always on Fire', icon: '🥵', rarity: 'cursed', tags: ['fire', 'surface', 'cursed'],
    levels: [{ pct: 20, turns: 1 }, { pct: 35, turns: 1 }],
    stats: function (L) { return { dmg: L.pct / 100 }; },
    desc: function (L) {
      return '+' + L.pct + '% damage; immune to fire damage and Burn. Downside: at the end of each of your turns, ' +
        'the 4 tiles around you catch fire until the round ends, allies or not.';
    },
    flavor: "Keeps bursting into flames. The doctor says it's stress. The fire says it's personal.",
    hooks: {
      modifyStatus: function (s, p) { if (s.id === 'burn') s.cancel = true; },
      modifyIncomingDamage: function (d, p) { if (d.element === 'fire') d.mult = 0; },
      onTurnEnd: function (unit, p) {
        adjacentTiles(unit).forEach(function (q) {
          const t = DD.Grid.tile(q.x, q.y);
          if (!t) return;
          if (t.obj || t.surface) DD.Act.applyElement(q.x, q.y, 'fire', unit, { noUnits: true });
          if (!t.surface && !DD.Grid.terrain(t).liquid) DD.Act.setSurface(q.x, q.y, 'fire', p.L.turns);
        });
      },
    },
  });

  reg({
    id: 'rp_cursed_gamblers_ruin', name: "Cursed: Gambler's Ruin", icon: '🎰', rarity: 'cursed', tags: ['offense', 'random', 'cursed'],
    levels: [{ win: 50 }, { win: 60 }],
    desc: function (L) { return 'Your skill hits on foes: ' + L.win + '% chance to deal double damage, otherwise they deal half damage.'; },
    flavor: 'Let it ride! It did not ride. Let it ride again! Gambling is a strategy, says the gambler.',
    hooks: {
      modifyOutgoingDamage: function (d, p) {
        if (!skillHit(d)) return;
        if (roll(p.L.win)) { d.mult *= 2; pop(d.source, '🎰 JACKPOT', '#ffd23f'); } else { d.mult *= 0.5; pop(d.source, '🎰 bust', '#b0a0a0'); }
      },
    },
  });

  /** Where the Duck Mafia shows up: next to a random enemy, else the free tile farthest from the debtor. */
  function mafiaSpot(unit) {
    const s = S();
    const goons = s.units.filter(function (u) { return active(u) && u.side === 'enemy' && u.defId !== 'wm_duck_foe'; });
    if (goons.length) { const g = pick(goons); return { x: g.x, y: g.y }; }
    let best = null, bd = -1;
    s.grid.tiles.forEach(function (t) {
      if (!DD.Grid.isFree(t.x, t.y) || DD.Grid.isDrop(t.x, t.y)) return;
      const k = dist(t, unit);
      if (k > bd) { bd = k; best = { x: t.x, y: t.y }; }
    });
    return best;
  }
  reg({
    id: 'rp_cursed_duck_mafia', name: 'Cursed: Duck Mafia Debt', icon: '🕶️', rarity: 'cursed', tags: ['ap', 'duck', 'cursed'],
    // v2: hostile ducks act on their own initiative turns (no telegraphs), so the collectors come in smaller crews
    levels: [{ ducks: [1, 2, 3] }, { ducks: [1, 1, 2] }],
    stats: function () { return { ap: 1 }; },
    desc: function (L) {
      const n = L.ducks;
      return '+1 AP every turn. Downside: at the start of each fight, Hostile Ducks join the enemies: ' +
        (n[0] === n[1] ? n[0] + ' in acts 1-2, ' : n[0] + ' in act 1, ' + n[1] + ' in act 2, ') + n[2] + ' in act 3.';
    },
    flavor: 'You owe the Duck Mafia. They do not forget. They do not forgive. They do quack.',
    hooks: {
      onCombatStart: function (unit, p) {
        if (!DD.getEnemy('wm_duck_foe')) return;
        const n = p.L.ducks[actNo() - 1] || 0;
        let came = 0;
        for (let i = 0; i < n; i++) {
          const at = mafiaSpot(unit);
          if (at && DD.Act.spawn('wm_duck_foe', at.x, at.y, {})) came++;
        }
        if (came) say(unit, p, 'the Duck Mafia sends ' + plural(came, 'collector') + '.', 'enemy');
      },
    },
  });
})();
