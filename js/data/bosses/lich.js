/* Dungeons and Degenerates — js/data/bosses/lich.js
 * Act 2 boss: LICH-TENSTEIN, the Overdue Librarian (enemy 'lichtenstein', encounter 'boss_lichtenstein').
 * Arena "The Restricted Section": aisles of Restricted Section Shelves, two Card Catalogs, a book-return chute (pit).
 * v2 (initiative): on his own turn he fires an Overdue Notice (a bolt, at once) and takes the next step of his rotation:
 *   phase 1: Bookfall (checkerboard WIND-UP) → its Second Printing (the other squares) → SHHHH! (radius 2 WIND-UP,
 *   Silence) → Unpaid Internship (2 skeletons);
 *   phase 2 "FINAL NOTICE" (≤ 50% HP): Final Notice (2 rows / columns WIND-UP) → Bookfall → its Second Printing (the
 *   other squares) → QUIET!!! (radius 3 WIND-UP) → Unpaid Internship.
 * Wind-ups land at the start of his next turn (DD.AI.windUp); a stun / freeze interrupts them. The wind-up skills are not
 * in his skill list (his rotation drives them), so the HUD's threat shading and AutoPlay only count what he can do at once.
 * A first wave of Bookfall that lands is always followed by its Second Printing (the rotation waits a turn if needed).
 * Late Fees (a stacking buff): +N.feeRate at the end of each of his turns (N.feeRate2 in phase 2, +1 per living skeleton),
 * +1 damage per fee on his attacks, no cap (his clock: shredding a phylactery resets it).
 * Puzzle: 3 of the 8 Restricted Section Shelves hide phylacteries (always among the 6 deepest), 2 are mimics. A Card
 * Catalog (once a round each) makes the nearest hidden phylactery's shelf glow; searching (or breaking) it shreds it:
 * 25 damage, fees waived, Stunned (not while Speed-Reading). None left: Mortal Again (no more reforming). While one is
 * left he can't die: at 0 HP he collapses into an invulnerable Pile of Bones and spends his next turn reforming (25% HP),
 * burning a phylactery. A stun buys him Speed-Reading (no stun-locks). Public helpers: DD.Act2Bosses.lich.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const TAU = Math.PI * 2;

  // ---- numbers (DESIGN §5 act 2 boss; v2 level band: a party of about level 3-4) -----------------------------------
  const N = {
    hp: 320, notice: 12, noticeRange: 30, bookfall: 11, shhh: 9, shhhR: 2, quiet: 12, quietR: 3, final: 20, phylactery: 25,
    reformPct: 0.25, feeRate: 4, feeRate2: 5, focus: 3, internCap: 3, internHp: 12, internDmg: 5, internMark: 2,
    mimicHp: 20, mimicDmg: 6, mimicSurprise: 5, boon: 5, mortal: 0, noticeNearest: 1,
  };
  const LICH = 'lichtenstein';
  // his rotation, one step a turn (after the Overdue Notice); 'reprint' = the Second Printing of the Bookfall that landed
  const ROTATION = { 1: ['bookfall', 'reprint', 'shhh', 'interns'], 2: ['final', 'bookfall', 'reprint', 'shhh', 'interns'] };
  const STEP_NAMES = { bookfall: 'Bookfall ⏳', reprint: 'Second Printing ⏳', shhh: 'SHHHH! ⏳', quiet: 'QUIET!!! ⏳', final: 'Final Notice ⏳', interns: 'Unpaid Internship' };
  const WINDUPS = ['lich_bookfall', 'lich_shhh', 'lich_quiet', 'lich_final_notice'];

  // ---- small helpers -------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function S() { return DD.Combat && DD.Combat.state; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  function key(x, y) { return x + ',' + y; }
  function units() { const s = S(); return s ? s.units : []; }
  function findLich() { return units().filter(function (u) { return u.defId === LICH && !u.dead; })[0] || null; }
  function lichData(u) {
    if (!u.data.lich) u.data.lich = { turn: 0, step: 0, phase: 1, renewals: 0 };
    return u.data.lich;
  }
  // collapsed state lives in his data too: a dispelled Pile of Bones status can't strand him invulnerable forever
  function isBones(u) { return !!u && (has(u, 'lich_bonepile') || !!lichData(u).collapsed); }
  /** Stun-likes (stun, frozen, any stunLike status) and charm: what Speed-Reading shrugs off. */
  function incapacitates(id) { return id === 'charmed' || (DD.Act.isStunLike ? DD.Act.isStunLike(id) : id === 'stun' || id === 'frozen'); }
  function pending(u, skillId) { return (u.intents || []).some(function (i) { return i.skillId === skillId; }); }

  // minor DM asides: logged like Act.narrate (narrator line, cosmetic RNG, never during previews) but kept local
  const QUIPS = {
    catalog: ['{hero} uses the Card Catalog. The DM is visibly moved: nobody has used a card catalog since 1994.',
      '{hero} finds the right index card on the first try. The DM suspects metagaming.'],
    mimic: ['The shelf opens its mouth. The DM opens his. Both say "surprise."',
      'Roll for... no, it\'s just a mimic. It\'s always a mimic.'],
    collapse: ['The lich crumbles. The DM checks his notes and smiles an awful little smile.',
      'Bones everywhere. You are pretty sure liches don\'t stay down while their books are still checked out.'],
  };
  function quip(id, vars) {
    const lines = QUIPS[id];
    if (!lines || A().simulating) return '';
    const r = DD.rng && DD.rng.next ? DD.rng.next() : 0;
    const line = lines[Math.floor(r * lines.length) % lines.length].replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] !== undefined ? String(vars[k]) : m;
    });
    A().log(line, 'narrator');
    return line;
  }
  function fightData() {
    const s = S();
    if (!s) return { shredded: 0, spent: 0, lookups: 0, searches: 0, mimics: 0 };
    s.data = s.data || {};
    if (!s.data.lich) s.data.lich = { shredded: 0, spent: 0, lookups: 0, searches: 0, mimics: 0 };
    return s.data.lich;
  }
  function shelves() {
    const s = S();
    if (!s) return [];
    return s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === 'lich_shelf'; });
  }
  /** Shelf tiles still hiding a phylactery (the single source of truth for "is he still renewable?"). */
  function phylacteryTiles() {
    return shelves().filter(function (t) { return t.obj.data.role === 'phylactery'; });
  }
  function hiddenPhylacteries() { return phylacteryTiles().filter(function (t) { return !t.obj.data.revealed; }); }
  function aliveOf(defId) { return units().filter(function (u) { return u.defId === defId && active(u); }); }

  // Wind-up numbers are the engine's live ones (DD.AI.intentDmg: weak / inspired / empowered / item bonus / difficulty,
  // plus the Late Fees through the status's telegraphFlat): the planner never passes an explicit dmg.
  function feesOf(u) { const st = DD.Act.getStatus(u, 'lich_late_fees'); return st ? st.stacks : 0; }
  function outMult(u) {
    let m = 1;
    if (has(u, 'weak')) m *= 0.75;
    if (has(u, 'inspired')) m *= 1.25;
    if (has(u, 'empowered')) m *= 1.5;
    if (u.dmgBonus) m *= 1 + u.dmgBonus;
    const s = S();
    m *= (s && s.difficulty && s.difficulty.dmg) || 1;
    return m;
  }
  /** What a wind-up of `base` damage shows right now (same formula as DD.AI.intentDmg). */
  function teleDmg(u, base) {
    return Math.round(base * outMult(u)) + (DD.AI && DD.AI.telegraphFlat ? DD.AI.telegraphFlat(u) : feesOf(u));
  }

  // ---- statuses ------------------------------------------------------------------------------------------------
  DD.registerStatus({
    id: 'lich_late_fees', name: 'Late Fees', icon: '💸', color: '#9be36b', type: 'buff', stacking: 'stack', maxStacks: 99,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      const n = (st && st.stacks) || 1;
      return 'His attacks deal +' + n + ' damage. He gains ' + N.feeRate + ' more at the end of each of his turns (' + N.feeRate2 +
        ' below half HP), +1 per living Work-Study Skeleton. Shredding a phylactery waives them all.';
    },
    hooks: {
      modifyOutgoingDamage: function (d, st) { if (d.cause === 'skill') d.flat += st.stacks; },
    },
    // wind-up numbers and reach estimates show it live (DD.AI adds it after the multipliers, where the pipeline adds d.flat)
    telegraphFlat: function (st) { return (st && st.stacks) || 0; },
  });
  DD.registerStatus({
    id: 'lich_bonepile', name: 'Pile of Bones', icon: '🦴', color: '#e8e2cf', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () {
      return 'Collapsed and Invulnerable. He spends his next turn reforming (' + Math.round(N.reformPct * 100) +
        '% HP), burning one phylactery, unless the last one is shredded first.';
    },
  });
  DD.registerStatus({
    id: 'lich_focus', name: 'Speed-Reading', icon: '👓', color: '#c9a03a', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: N.focus,
    desc: function (st) {
      return 'Shook off the last stun: can\'t be Stunned, Frozen or Charmed' +
        (st && st.turns > 0 ? ' (' + st.turns + ' more turn' + (st.turns === 1 ? '' : 's') + ')' : '') + '.';
    },
  });
  DD.registerStatus({
    id: 'lich_mortal', name: 'Mortal Again', icon: '🕯️', color: '#ff9a7a', type: 'debuff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () {
      return 'His last phylactery is gone: he can no longer reform' + (N.mortal > 0 ? ' and takes ' + Math.round(N.mortal * 100) + '% more damage' : '') + '.';
    },
    // declarative (previews, the AI and AutoPlay see it); N.mortal is a balance knob, 0 = no damage bonus
    takenMult: function () { return 1 + N.mortal; },
  });

  // ---- FX helpers ----------------------------------------------------------------------------------------------
  function noticeFx(from, to) {
    DD.FX.projectile(from, to, {
      kind: 'custom', arc: 18, size: 1, color: '#ffb3c7', trail: true,
      draw: function (c, x, y) {
        c.save();
        c.translate(x, y);
        c.rotate(Math.sin(x * 0.05) * 0.4);
        c.fillStyle = '#fff4dc'; c.strokeStyle = '#3a2214'; c.lineWidth = 1.2;
        c.beginPath(); c.rect(-7, -5, 14, 10); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(-7, -5); c.lineTo(0, 1); c.lineTo(7, -5); c.stroke();
        c.fillStyle = '#d0263a'; c.beginPath(); c.arc(0, 1, 2.2, 0, TAU); c.fill();
        c.restore();
      },
    });
  }
  function bookRainFx(tiles) {
    for (let i = 0; i < tiles.length; i++) {
      DD.FX.particles(tiles[i], { kind: 'dust', count: 4, parallel: i > 0 });
      DD.FX.tile(tiles[i].x, tiles[i].y, 'crack', { parallel: true, color: '#c8a46a' });
    }
  }
  function shushFx(u, r) {
    DD.FX.custom('custom', {
      at: { x: u.x, y: u.y }, ms: 520, layer: 'world',
      draw: function (c, x, y, p) {
        c.save();
        c.globalAlpha = 1 - p * 0.8;
        c.strokeStyle = '#b9ffb0'; c.lineWidth = 3;
        for (let k = 0; k < 3; k++) {
          const rr = (p + k * 0.22) % 1;
          c.beginPath(); c.ellipse(x, y, 20 + rr * 32 * r, 10 + rr * 16 * r, 0, 0, TAU); c.stroke();
        }
        c.font = 'bold 22px Georgia, serif'; c.textAlign = 'center';
        c.lineWidth = 5; c.strokeStyle = '#1a1014'; c.strokeText('SHHHH!', x, y - 70 - p * 10);
        c.fillStyle = '#e8ffe0'; c.fillText('SHHHH!', x, y - 70 - p * 10);
        c.restore();
      },
    });
    DD.FX.shake(5, 300, { parallel: true });
  }

  // ---- area helpers ----------------------------------------------------------------------------------------------
  function openTile(x, y) {
    const t = G().tile(x, y);
    if (!t) return false;
    const td = G().terrain(t);
    if (td.walkable === false && !td.pit) return false;
    return !(t.obj && G().objBlocksMove(t.obj));
  }
  /** Fallback checkerboard (5×5 around the target, the target square included) when no explicit tiles were given. */
  function checkerArea(ctx) {
    const t = ctx && ctx.target;
    if (!t) return [];
    const par = (t.x + t.y) % 2;
    const out = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = t.x + dx, y = t.y + dy;
      if (((x + y) % 2 + 2) % 2 === par && openTile(x, y)) out.push({ x: x, y: y });
    }
    return out;
  }
  /** Fallback Final Notice (no explicit tiles): the target's row and the next one, like the desc. */
  function rowArea(ctx) {
    const t = ctx && ctx.target, s = S();
    if (!t || !s) return [];
    const out = [];
    [t.y, t.y + 1 < s.grid.h ? t.y + 1 : t.y - 1].forEach(function (y) {
      for (let x = 0; x < s.grid.w; x++) if (openTile(x, y)) out.push({ x: x, y: y });
    });
    return out;
  }

  // ---- skills ----------------------------------------------------------------------------------------------------
  // at once, every turn (his one skill-list attack: the HUD's reach and AutoPlay read it)
  eskill({
    id: 'lich_overdue_notice', name: 'Overdue Notice', icon: '📜', kind: 'spell', tags: ['ranged'], anchor: 'unit',
    levels: [{ dmg: N.notice }], target: { type: 'unit', range: [1, N.noticeRange], filter: 'enemy', los: false },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage (+ Late Fees) to the nearest foe' + (N.noticeRange >= 30 ? ', however far' : ' within ' + N.noticeRange + ' tiles') +
        ' (on a tie, the one with the most HP). It\'s mail: walls and shelves don\'t stop it.';
    },
    flavor: 'Third and final reminder. Fourth and final reminder. Fifth... It will find you. It always finds you.',
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        noticeFx(ctx.user, f);
        A().damage(ctx.user, f, ctx.L.dmg);
      });
    },
  });

  // WIND-UPS (his rotation; they land at the start of his next turn)
  eskill({
    id: 'lich_bookfall', name: 'Bookfall', icon: '📚', kind: 'spell', tags: ['aoe'], anchor: 'ground',
    levels: [{ dmg: N.bookfall }], target: { type: 'tile', range: [0, 30], filter: 'any', los: false },
    area: { shape: 'custom', fn: checkerArea },
    desc: function (L) {
      return 'Books rain on the marked checkerboard squares: ' + L.dmg + ' damage (+ Late Fees) to everyone on one (his own ' +
        'minions too). When a first wave lands, he charges its Second Printing on the other squares.';
    },
    flavor: 'The Dewey Decimal System, delivered at terminal velocity.',
    execute: function (ctx) {
      bookRainFx(ctx.tiles);
      DD.FX.shake(4, 260);
      ctx.units.forEach(function (u) { if (u !== ctx.user && active(u)) A().damage(ctx.user, u, ctx.L.dmg, { tags: ['books'] }); });
      // a landing first wave leaves its region for the Second Printing (the other squares, charged this turn)
      const rp = ctx.intent && ctx.intent.data && ctx.intent.data.reprint;
      if (rp && active(ctx.user)) lichData(ctx.user).reprint = rp;
    },
  });

  // SHHHH! (phase 1) and QUIET!!! (phase 2) are two skills: a wind-up resolves at its skill's own numbers
  function shushSkill(id, name, dmg, r, flavor) {
    eskill({
      id: id, name: name, icon: '🤫', kind: 'attack', tags: ['aoe'], anchor: 'self',
      levels: [{ dmg: dmg, r: r, turns: 1 }], target: { type: 'self' },
      area: { shape: 'circle', size: function (L) { return L.r; } },
      desc: function (L) {
        return 'Each of his foes within ' + L.r + ' tiles of him takes ' + L.dmg + ' damage (+ Late Fees) and is Silenced (no spells) for ' +
          L.turns + ' turn. The circle moves with him.';
      },
      flavor: flavor,
      execute: function (ctx) {
        shushFx(ctx.user, ctx.L.r / 3);
        ctx.foes.forEach(function (f) {
          if (!active(f)) return;
          A().damage(ctx.user, f, ctx.L.dmg);
          if (active(f)) A().addStatus(f, 'silenced', { turns: ctx.L.turns }, ctx.user);
        });
      },
    });
  }
  shushSkill('lich_shhh', 'SHHHH!', N.shhh, N.shhhR, 'You cannot silence a librarian. Believe us, people have tried.');
  shushSkill('lich_quiet', 'QUIET!!!', N.quiet, N.quietR, 'The library voice, but at a volume that cracks stained glass.');

  eskill({
    id: 'lich_final_notice', name: 'Final Notice', icon: '🧾', kind: 'spell', tags: ['aoe'], anchor: 'ground',
    levels: [{ dmg: N.final }], target: { type: 'tile', range: [0, 30], filter: 'any', los: false },
    area: { shape: 'custom', fn: rowArea },
    desc: function (L) {
      return 'Final Notices fly down the two marked rows or columns: ' + L.dmg + ' damage (+ Late Fees) to each of his foes in them.';
    },
    flavor: 'Final. Notice. (Not legally binding. Legally haunting.)',
    execute: function (ctx) {
      const tiles = ctx.tiles;
      if (tiles.length) {
        DD.FX.beam(tiles[0], tiles[tiles.length - 1], { color: '#ffd0e0', width: 5 });
        DD.FX.shake(5, 300, { parallel: true });
      }
      ctx.foes.forEach(function (f) { if (active(f)) A().damage(ctx.user, f, ctx.L.dmg); });
    },
  });

  eskill({
    id: 'lich_interns', name: 'Unpaid Internship', icon: '💀', kind: 'summon', tags: ['summon'], anchor: 'self', cooldown: 2,
    levels: [{ n: 2 }], target: { type: 'self' },
    desc: function (L) {
      return 'Summon ' + L.n + ' Work-Study Skeletons out of the book-return chute (never more than ' + N.internCap + ' at once).';
    },
    flavor: 'The pay is exposure. The exposure is to necromancy.',
    execute: function (ctx) { spawnInterns(ctx.user, ctx.L.n); },
  });

  eskill({
    id: 'lich_intern_stamp', name: 'OVERDUE Stamp', icon: '🔖', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: N.internDmg, mark: N.internMark }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage to an adjacent foe and stamp it OVERDUE (Marked ' + L.mark + ': the next hit on it deals +' + L.mark + ').';
    },
    flavor: 'Ka-chunk. You are now property of the library.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.lunge(ctx.user, ctx.target);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().addStatus(f, 'marked', { stacks: ctx.L.mark }, ctx.user);
      });
    },
  });

  eskill({
    id: 'lich_mimic_chomp', name: 'Paperback Chomp', icon: '📕', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: N.mimicDmg }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Root it for 1 turn (stuck between the pages).'; },
    flavor: 'It has been waiting three hundred years to be checked out.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.lunge(ctx.user, ctx.target);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().addStatus(f, 'root', { turns: 1 }, ctx.user);
      });
    },
  });

  // ---- interns -----------------------------------------------------------------------------------------------------
  function spawnInterns(lich, n) {
    const alive = aliveOf('lich_intern').length;
    let k = Math.min(n, N.internCap - alive);
    if (k <= 0 || !lich) return 0;
    const s = S();
    // they climb out of the book-return chute (tiles next to a 'lich_chute' pit), else the staff room doors, else near him
    const chute = [];
    s.grid.tiles.forEach(function (t) {
      if (t.tag !== 'lich_chute') return;
      G().neighbors(t.x, t.y).forEach(function (n) { chute.push({ x: n.x, y: n.y }); });
    });
    const marks = s.grid.tiles.filter(function (t) { return t.tag === 'enemy_spawn'; });
    const spots = chute.concat(marks, G().emptyTilesNear(lich.x, lich.y, 3))
      .filter(function (p) { return G().isFree(p.x, p.y) && !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y); });
    let made = 0;
    const used = {};
    for (let i = 0; i < spots.length && k > 0; i++) {
      const p = spots[i];
      if (used[key(p.x, p.y)] || !G().isFree(p.x, p.y)) continue;
      used[key(p.x, p.y)] = 1;
      if (A().spawn('lich_intern', p.x, p.y)) { k--; made++; }
    }
    if (made) {
      A().log(made + ' work-study skeleton' + (made > 1 ? 's climb' : ' climbs') + ' out of the book-return chute. "It\'s a great learning opportunity."', 'enemy');
    }
    return made;
  }

  // ---- Late Fees -----------------------------------------------------------------------------------------------------
  /** Add n Late Fees (no cap: the fees are his clock; shredding a phylactery resets them). Returns how many. */
  function addFees(u, n) {
    if (!active(u) || !(n > 0)) return 0;
    const before = feesOf(u);
    A().addStatus(u, 'lich_late_fees', { stacks: n, turns: -1, silent: true }, u);
    DD.FX.text(u, '💸 Late Fees +' + n, { color: '#b8f28a', size: 14 });
    A().log('Late Fees compound: Lich-tenstein\'s attacks now deal +' + (before + n) + ' damage.', 'enemy');
    return n;
  }
  function waiveFees(u) {
    if (!u || !feesOf(u)) return false;
    A().removeStatus(u, 'lich_late_fees', { text: 'Fees waived!' });
    return true;
  }

  // ---- the puzzle ------------------------------------------------------------------------------------------------
  const BOOKS = [
    'Necronomicon for Dummies (3rd Edition)', 'Fifty Shades of Grey Ooze', 'Goodnight Moon (Bound in Human Skin)',
    'The Very Hungry Gelatinous Cube', 'Where\'s Waldo? (He\'s a Mimic)', 'Chicken Soup for the Undead Soul', 'Eat, Pray, Lich',
    'How to Win Friends and Reanimate People', 'Harry Potter and the Overdue Fines', 'Diary of a Wimpy Kobold',
    'The Art of War (Bard\'s Abridged Edition)', 'Oh, the Places You\'ll Haunt!', 'The Lion, the Witch and the Wardrobe Mimic',
  ];
  const PHYLACTERIES = ['"My Immortal" (A Lich\'s Poetry Journal)', '"Dear Diary: Undeath Is Lonely"', '"Twilight" (Lovingly Annotated)',
    '"101 Ways to Cheat Death" (Vol. 1-100 Missing)'];

  function setShelfLabel(o) {
    const r = o.data.role;
    if (o.data.searched) o.label = r === 'spent' ? 'Scorched Shelf (a burnt-out phylactery)' : 'Picked-Over Shelf';
    else if (o.data.revealed && r === 'phylactery') o.label = 'Restricted Shelf — PHYLACTERY INSIDE!';
    else o.label = 'Restricted Section Shelf';
  }

  /**
   * Encounter onStart: deal the shelf roles with the combat RNG — the 3 phylacteries hide among the 6 shelves farthest
   * from the heroes' deployment (the lich keeps his soul close), 2 mimics among the rest, everything else is just books.
   */
  function setupLibrary(state) {
    const list = shelves();
    const zone = state.grid.tiles.filter(function (t) { return t.zone === 'hero'; });
    const depth = function (t) { let d = 99; zone.forEach(function (z) { d = Math.min(d, G().dist(z, t)); }); return zone.length ? d : -t.y; };
    const order = list.slice().sort(function (a, b) { return depth(b) - depth(a) || a.y - b.y || a.x - b.x; });
    const deep = state.rng.shuffle(order.slice(0, Math.min(order.length, 6)));
    const roles = new Map();
    deep.slice(0, 3).forEach(function (t) { roles.set(t, 'phylactery'); });
    state.rng.shuffle(order.filter(function (t) { return !roles.has(t); })).slice(0, 2).forEach(function (t) { roles.set(t, 'mimic'); });
    const titles = state.rng.shuffle(BOOKS.slice());
    const ptitles = state.rng.shuffle(PHYLACTERIES.slice());
    let pi = 0;
    list.forEach(function (t, i) {
      const o = t.obj;
      o.data.role = roles.get(t) || 'empty';
      o.data.title = o.data.role === 'phylactery' ? ptitles[pi++ % ptitles.length] : titles[i % titles.length];
      o.data.revealed = false;
      o.data.searched = false;
      setShelfLabel(o);
    });
    fightData();
    state.objective.flavor = flavorText();
  }
  /** Objective subtitle: the puzzle's score and the one thing to do next (kept current by updateFlavor). */
  function flavorText() {
    const fd = fightData();
    const list = phylacteryTiles();
    const left = list.length;
    const lich = findLich();
    const head = 'Phylacteries shredded ' + fd.shredded + (fd.spent ? ' · burnt ' + fd.spent : '') + ' · left ' + left + '. ';
    if (!left) {
      return head + 'He is Mortal Again: no more reforming' + (N.mortal > 0 ? ' (and he takes ' + Math.round(N.mortal * 100) + '% more damage)' : '') +
        '. Finish him!';
    }
    const glowing = list.some(function (t) { return t.obj.data.revealed; });
    if (lich && isBones(lich)) {
      return head + 'He is a Pile of Bones and reforms on his next turn: ' + (glowing ? 'Search the glowing shelf now' +
        (left === 1 ? ' (the last one finishes him)!' : '!') : 'Look Up a Card Catalog and Search the shelf it lights up!');
    }
    return head + (glowing ? 'Search the glowing shelf (1 AP) to shred it: 25 damage, fees waived, Stun.' :
      'Look Up a Card Catalog (1 AP), then Search the shelf that glows.');
  }
  function updateFlavor() { const s = S(); if (s && s.objective) s.objective.flavor = flavorText(); }

  /** Reveal the hidden phylactery shelf nearest to `from` (catalog look-ups, renewals). */
  function revealNearest(from, who) {
    const list = hiddenPhylacteries();
    if (!list.length) return null;
    list.sort(function (a, b) { return G().dist(a, from) - G().dist(b, from) || a.y - b.y || a.x - b.x; });
    const t = list[0];
    t.obj.data.revealed = true;
    setShelfLabel(t.obj);
    DD.FX.tile(t.x, t.y, 'glow', { color: '#7dff8a' });
    DD.FX.particles(t, { kind: 'runes', count: 14, color: '#7dff8a' });
    A().touch();
    A().log((who ? who + ': ' : '') + 'a phylactery hides in the shelf at ' + t.x + ',' + t.y + ' (it glows green).', 'system');
    updateFlavor();
    return t;
  }

  function catalogReady(o) {
    const s = S();
    return !!s && hiddenPhylacteries().length > 0 && o.data.usedRound !== s.round;
  }
  function lookUp(unit, o, tile) {
    const fd = fightData();
    fd.lookups++;
    o.data.usedRound = S().round;
    const t = revealNearest(unit, null);
    DD.FX.particles(tile, { kind: 'dust', count: 10 });
    if (t) {
      DD.FX.beam(tile, t, { color: '#7dff8a', width: 3 });
      A().log(unit.name + ' checks the Card Catalog: "Dewey Decimal 666.6 — Phylacteries, Personal." Aisle ' + t.x + ', shelf ' + t.y + '.', 'hero');
      quip('catalog', { hero: unit.name });
    } else {
      A().log(unit.name + ' flips through the Card Catalog. Nothing left to find but late fees.', 'hero');
    }
  }

  /** A plain shelf: a good book with a happy ending (+5 HP). */
  function boon(unit, o) {
    const title = o.data.title || BOOKS[0];
    A().heal(null, unit, N.boon);
    A().log(unit.name + ' finds "' + title + '". It has a happy ending (+' + N.boon + ' HP).', 'hero');
    DD.FX.text(unit, '📖 ' + title, { color: '#f3e3b0', size: 12 });
  }

  function mimicAmbush(unit, tile) {
    const fd = fightData();
    fd.mimics++;
    A().removeObject(tile.x, tile.y);
    const m = A().spawn('lich_mimic', tile.x, tile.y);
    DD.FX.shake(6, 320);
    quip('mimic', { hero: unit ? unit.name : 'someone' });
    if (!m) return null;
    DD.FX.text(m, 'IT\'S A MIMIC!', { color: '#ff7b6b', size: 18 });
    A().bark(m, 'spawn');
    if (unit && active(unit) && G().dist(unit, m) === 1) {
      DD.FX.lunge(m, unit);
      A().damage(m, unit, N.mimicSurprise, { cause: 'other', tags: ['mimic'] });
    }
    return m;
  }

  function searchShelf(unit, o, tile) {
    const fd = fightData();
    fd.searches++;
    const role = o.data.role || 'empty';
    if (role === 'mimic') { mimicAmbush(unit, tile); updateFlavor(); return; }
    o.data.searched = true;
    if (role === 'phylactery') {
      o.data.role = 'shredded';
      setShelfLabel(o);
      shred(unit, tile, o);
    } else {
      setShelfLabel(o);
      boon(unit, o);
    }
    updateFlavor();
  }

  function shelfDestroyed(o, tile, src) {
    const role = o.data.role;
    if (role === 'phylactery') { o.data.role = 'shredded'; shred(src && src.side === 'hero' ? src : null, tile, o); }
    else if (role === 'mimic') mimicAmbush(null, tile);
    updateFlavor();
  }

  /** A phylactery is torn up: 25 damage + Late Fees waived + Stun — or, on a pile of bones, one renewal fewer / the end. */
  function shred(hero, tile, o) {
    const fd = fightData();
    fd.shredded++;
    DD.FX.particles(tile, { kind: 'runes', count: 22, color: '#7dff8a' });
    DD.FX.particles(tile, { kind: 'feathers', count: 12, color: '#fff4dc', parallel: true });
    A().log((hero ? hero.name : 'Someone') + ' shreds ' + ((o && o.data.title) || 'a phylactery') + '! (' + fd.shredded + ' shredded)', 'hero');
    const lich = findLich();
    const left = phylacteryTiles().length;
    A().narrate('lich_phylactery', { hero: hero ? hero.name : 'the party', n: left });
    if (!lich) return;
    DD.FX.beam(tile, lich, { color: '#7dff8a', width: 4 });
    waiveFees(lich);
    if (isBones(lich)) {
      if (!left) finalDeath(lich, hero);
      else { DD.FX.text(lich, 'One less renewal!', { color: '#b8f28a', size: 15 }); A().bark(lich, 'hurt'); }
      return;
    }
    DD.FX.banner('PHYLACTERY SHREDDED', { sub: left ? left + ' left: he can still reform' : 'He is finally mortal!', color: '#9dff8a', ms: 900 });
    A().damage(hero || null, lich, N.phylactery, { cause: 'status', tags: ['phylactery'], ignoreBlock: true });
    // the stun respects Speed-Reading: shredding every round can't lock him out of the fight. It interrupts his wind-up.
    if (active(lich) && !isBones(lich)) A().addStatus(lich, 'stun', { turns: 1 }, hero || null);
    if (!left) makeMortal(lich);
    if (active(lich)) A().bark(lich, 'phylactery');
  }

  /** No phylactery left (shredded or burnt): he can't reform any more (N.mortal: an optional damage-taken bonus). */
  function makeMortal(u) {
    if (!active(u) || isBones(u) || has(u, 'lich_mortal')) return false;
    A().addStatus(u, 'lich_mortal', { turns: -1, silent: true }, null);
    DD.FX.text(u, '🕯️ MORTAL AGAIN!', { color: '#ff9a7a', size: 17 });
    A().log('With no phylacteries left, Lich-tenstein is mortal again: he can no longer reform' +
      (N.mortal > 0 ? ' and takes ' + Math.round(N.mortal * 100) + '% more damage' : '') + '.', 'system');
    return true;
  }

  function finalDeath(lich, hero) {
    lichData(lich).final = true;
    lichData(lich).collapsed = false;
    A().removeStatus(lich, 'invulnerable', { silent: true });
    A().removeStatus(lich, 'lich_bonepile', { silent: true });
    DD.FX.banner('RETURNED. PERMANENTLY.', { sub: 'His last phylactery is confetti', color: '#9dff8a', ms: 1100 });
    A().kill(lich, hero || null, { force: true, text: 'DUST!', cause: 'other' });
  }

  /**
   * A pile of bones only reforms on its next turn: his skills cool down through it, so the HUD's reach line / threat
   * shading and AutoPlay (DD.AI.reachOf: ready skills only) don't count an Overdue Notice that is not coming.
   */
  function holdSkills(u) {
    DD.Combat.slotsOf(u).forEach(function (sl) {
      if (!((sl.cd || 0) >= 2 || (sl.cd === 1 && sl.fresh))) A().setCooldown(u, sl.id, 1);
    });
  }
  /** 0 HP with a phylactery left: collapse into an invulnerable pile of bones (he reforms on his next turn). */
  function collapse(u) {
    u.hp = 1;
    if (u.intents && u.intents.length && DD.AI && DD.AI.cancelIntents) DD.AI.cancelIntents(u, 'Collapsed!');
    lichData(u).collapsed = true;
    // collapsed during his own turn (his landing wind-up hit thorns, an attack of opportunity on his walk...): he reforms
    // on his NEXT turn, never in this one, so the heroes always get a turn against the bones (cleared at his turn end)
    lichData(u).collapsedOwn = !!(DD.Combat.isTurnOf && DD.Combat.isTurnOf(u));
    holdSkills(u);
    // a pile of bones doesn't walk on (collapsed by an attack of opportunity on his way back to the desk)
    if (A().stopMove) A().stopMove(u);
    A().addStatus(u, 'lich_bonepile', { turns: -1, silent: true }, u);
    A().addStatus(u, 'invulnerable', { turns: -1, silent: true }, u);
    DD.FX.text(u, 'Collapses...', { color: '#e8e2cf', size: 16 });
    DD.FX.banner('OVERDUE, NOT DEAD', { sub: 'He reforms on his next turn: shred his phylacteries!', color: '#c9ffb0', ms: 1000 });
    A().log('Lich-tenstein collapses into a pile of bones... and the bones are already renewing their membership. (' +
      phylacteryTiles().length + ' phylacteries left)', 'enemy');
    quip('collapse', {});
    A().bark(u, 'collapse');
    updateFlavor();
    A().touch();
  }

  /** His turn as a pile of bones: burn the farthest phylactery, come back at 25% HP, reveal another hiding place. */
  function reassemble(u) {
    const list = phylacteryTiles();
    lichData(u).collapsed = false;
    A().removeStatus(u, 'lich_bonepile', { silent: true });
    A().removeStatus(u, 'invulnerable', { silent: true });
    if (!list.length) return false;
    const foes = units().filter(function (o) { return active(o) && G().hostile(u, o); });
    const far = function (t) { let d = 99; foes.forEach(function (f) { d = Math.min(d, G().dist(f, t)); }); return d; };
    list.sort(function (a, b) { return far(b) - far(a) || a.y - b.y || a.x - b.x; });
    const t = list[0];
    t.obj.data.role = 'spent';
    t.obj.data.searched = true;
    t.obj.data.revealed = false;
    setShelfLabel(t.obj);
    const fd = fightData();
    fd.spent++;
    const d = lichData(u);
    d.renewals++;
    const target = Math.max(1, Math.round(u.maxHp * N.reformPct));
    const healed = target - u.hp;
    if (healed > 0) { u.hp = target; DD.FX.heal(u, healed); }
    DD.FX.beam(t, u, { color: '#7dff8a', width: 5 });
    DD.FX.tile(t.x, t.y, 'crack', { color: '#4a3a2a' });
    DD.FX.banner('RENEWED!', {
      sub: '"Checked out for another three hundred years." (' + (list.length - 1) + ' phylacteries left)', color: '#c9ffb0', ms: 1000,
    });
    A().log('Lich-tenstein reforms (' + u.hp + ' HP), burning the phylactery at ' + t.x + ',' + t.y + '. That takes him all turn.', 'enemy');
    A().narrate('lich_renew', {});
    A().bark(u, 'renew');
    // he reforms straight into phase 2 (a party that burst him from above half HP to 0 still gets the FINAL NOTICE banner)
    enterPhase2(u);
    revealNearest(u, 'His soul\'s backup copy flickers');
    if (list.length === 1) makeMortal(u); // that was the last one: no more renewals
    updateFlavor();
    A().touch();
    return true;
  }

  // ---- planner ------------------------------------------------------------------------------------------------------
  function enterPhase2(u) {
    const d = lichData(u);
    if (d.phase >= 2) return;
    d.phase = 2;
    d.step = 0;
    DD.FX.flash('#7dff8a', 220);
    DD.FX.banner('FINAL NOTICE', { sub: 'Final Notices, QUIET!!! and Late Fees +' + N.feeRate2 + ' a turn', color: '#c9ffb0', ms: 1000 });
    A().log('Lich-tenstein slams his date stamp: FINAL NOTICE! His rotation is now Final Notice → Bookfall → its Second Printing → ' +
      'QUIET!!! → Unpaid Internship, and his Late Fees grow by ' + N.feeRate2 + ' a turn.', 'enemy');
    A().narrate('lich_phase2', {});
    A().bark(u, 'phase');
  }

  function rotation(u) { return ROTATION[lichData(u).phase >= 2 ? 2 : 1]; }
  /** The step he will take on his next turn (for the inspect panel). */
  function nextStep(u) {
    // a charged first wave: once it lands, its Second Printing comes next (whatever the rotation says)
    if ((u.intents || []).some(function (i) { return i.skillId === 'lich_bookfall' && i.data && i.data.reprint; })) return 'reprint';
    const r = rotation(u);
    let name = r[lichData(u).step % r.length];
    // the Second Printing step with no first wave coming (it was interrupted): he shouts instead
    if (name === 'reprint') name = 'shhh';
    return name === 'shhh' && lichData(u).phase >= 2 ? 'quiet' : name;
  }

  /**
   * Whom the Overdue Notice goes to (review v2): the NEAREST foe in range (no line of sight needed), on a tie the one
   * with the most HP. A readable rule the party can play around: whoever stands closest to his desk gets the mail, so a
   * tough hero holding the line in front of him shields the backline (an infinite-range notice scored like a normal
   * shooter — kills first — sniped the weakest hero anywhere: half its notices hit the lowest-HP hero and they caused
   * ~90% of the party's downs). N.noticeNearest 0 = the old scoring (balance comparisons only).
   */
  function noticeTarget(u, foes) {
    let best = null, bestSc = -Infinity;
    foes.forEach(function (f) {
      const dd = G().dist(u, f);
      if (dd < 1 || dd > N.noticeRange) return;
      let sc;
      if (N.noticeNearest) sc = -dd * 1000 + (f.hp || 0) + (f.block || 0) * 0.01;
      else {
        const est = DD.AI.estimate(u, f, N.notice, null) + feesOf(u);
        sc = est + DD.AI.targetValue(u, f, est, 'ranged') - dd * 0.05;
      }
      if (sc > bestSc) { bestSc = sc; best = f; }
    });
    return best;
  }

  /**
   * A desk-bound caster: he only drifts when nobody is within his notices' reach, he stands in something nasty or he was
   * shoved more than 2 rows off his desk; then toward a tile about 3 from the nearest foe, back by his desk rows. Walks
   * pay their attacks of opportunity.
   */
  function reposition(u, api, foes) {
    const home = lichData(u).home || (lichData(u).home = { x: u.x, y: u.y });
    const reaches = foes.some(function (f) { const d = G().dist(u, f); return d >= 1 && d <= N.noticeRange; });
    if (reaches && !G().hazardAt(u.x, u.y, u) && Math.abs(u.y - home.y) <= 2) return;
    const reach = api.reachable(u);
    if (!reach || !reach.size) return;
    const score = function (p) {
      let dn = 99, seen = 0;
      foes.forEach(function (f) {
        const d = G().dist(p, f);
        dn = Math.min(dn, d);
        if (d >= 1 && d <= N.noticeRange) seen++;
      });
      let sc = seen * 3 - Math.abs(dn - 3) * 1.4 - (dn <= 1 ? 4 : 0) - (p.cost || 0) * 0.05 - (G().hazardAt(p.x, p.y, u) ? 20 : 0);
      const off = Math.abs(p.y - home.y);
      if (off > 2) sc -= (off - 2) * 6;
      return sc;
    };
    let best = null, bestSc = score({ x: u.x, y: u.y, cost: 0 });
    reach.forEach(function (e) {
      if (DD.AI.pathRisk && DD.AI.pathRisk(u, e).lethal) return;
      const aoo = api.aooCost ? api.aooCost(u, e) : 0;
      if (aoo === Infinity) return;
      const sc = score(e) - aoo;
      if (sc > bestSc + 0.75) { best = e; bestSc = sc; }
    });
    if (best) api.moveTo(u, best.x, best.y);
  }

  /** Checkerboard region: the foes' bounding box grown by 1, at most 7×7, inside the grid. */
  function checkerRegion(foes) {
    const s = S();
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1, cx = 0, cy = 0;
    foes.forEach(function (f) { x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y); x1 = Math.max(x1, f.x); y1 = Math.max(y1, f.y); cx += f.x; cy += f.y; });
    cx = Math.round(cx / foes.length); cy = Math.round(cy / foes.length);
    x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
    if (x1 - x0 > 6) { x0 = cx - 3; x1 = cx + 3; }
    if (y1 - y0 > 6) { y0 = cy - 3; y1 = cy + 3; }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(s.grid.w - 1, x1); y1 = Math.min(s.grid.h - 1, y1);
    return { x0: x0, y0: y0, x1: x1, y1: y1, cx: cx, cy: cy };
  }
  function checkerTiles(reg, par) {
    const out = [];
    for (let y = reg.y0; y <= reg.y1; y++) for (let x = reg.x0; x <= reg.x1; x++) {
      if ((x + y) % 2 === par && openTile(x, y)) out.push({ x: x, y: y });
    }
    return out;
  }

  // rotation steps: each returns true if it did something (the planner falls back to the next one otherwise)
  function bookfall(u, api, foes) {
    if (has(u, 'silenced') || pending(u, 'lich_bookfall')) return false;
    const reg = checkerRegion(foes);
    const hits = [0, 0];
    foes.forEach(function (f) { hits[(f.x + f.y) % 2]++; });
    const par = hits[0] === hits[1] ? (S().round % 2) : (hits[0] > hits[1] ? 0 : 1);
    return !!api.windUp(u, 'lich_bookfall', { x: reg.cx, y: reg.cy }, {
      tiles: checkerTiles(reg, par), label: 'Bookfall', banner: 'Stand on an unmarked square (a Second Printing follows)',
      data: { reprint: { x0: reg.x0, y0: reg.y0, x1: reg.x1, y1: reg.y1, cx: reg.cx, cy: reg.cy, par: 1 - par } },
    });
  }
  /** Second Printing: the other colour of the region `r` of the Bookfall that just landed (this turn). */
  function secondPrinting(u, api, r) {
    if (!r || has(u, 'silenced') || pending(u, 'lich_bookfall')) return false;
    return !!api.windUp(u, 'lich_bookfall', { x: r.cx, y: r.cy }, { tiles: checkerTiles(r, r.par), label: 'Bookfall (2nd Printing)', banner: 'The other squares this time' });
  }
  function shout(u, api, foes) {
    const two = lichData(u).phase >= 2;
    const r = two ? N.quietR : N.shhhR;
    if (pending(u, 'lich_shhh') || pending(u, 'lich_quiet')) return false;
    // only worth it with a foe close by (inside the circle or a step from it)
    if (!foes.some(function (f) { return G().dist(u, f) <= r + 1; })) return false;
    return !!api.windUp(u, two ? 'lich_quiet' : 'lich_shhh', u, { anchor: 'self', label: two ? 'QUIET!!!' : 'SHHHH!', banner: 'Get out of the circle (or push him)' });
  }
  /** Two rows (or columns, whichever catches more foes) of Final Notices. */
  function finalNotice(u, api, foes) {
    if (has(u, 'silenced') || pending(u, 'lich_final_notice')) return false;
    const s = S();
    const tally = function (axis) {
      const c = {};
      foes.forEach(function (f) { const k = axis === 'row' ? f.y : f.x; c[k] = (c[k] || 0) + 1; });
      return Object.keys(c).map(function (k) { return { k: +k, n: c[k] }; }).sort(function (a, b) { return b.n - a.n || a.k - b.k; });
    };
    const rows = tally('row'), cols = tally('col');
    const score = function (list) { return (list[0] ? list[0].n : 0) + (list[1] ? list[1].n : 0); };
    const useRows = score(rows) > score(cols) || (score(rows) === score(cols) && lichData(u).turn % 2 === 0);
    const pick = (useRows ? rows : cols).slice(0, 2);
    if (pick.length < 2) {
      const k0 = pick[0] ? pick[0].k : (useRows ? u.y : u.x);
      const lim = useRows ? s.grid.h - 1 : s.grid.w - 1;
      pick.push({ k: k0 + 1 <= lim ? k0 + 1 : k0 - 1, n: 0 });
    }
    const tiles = [];
    pick.forEach(function (p) {
      const n = useRows ? s.grid.w : s.grid.h;
      for (let i = 0; i < n; i++) {
        const x = useRows ? i : p.k, y = useRows ? p.k : i;
        if (openTile(x, y)) tiles.push({ x: x, y: y });
      }
    });
    const center = useRows ? { x: Math.floor(s.grid.w / 2), y: pick[0].k } : { x: pick[0].k, y: Math.floor(s.grid.h / 2) };
    return !!api.windUp(u, 'lich_final_notice', center, { tiles: tiles, label: 'Final Notice', banner: 'Two whole ' + (useRows ? 'rows' : 'columns') + ': get off them' });
  }
  function interns(u, api) {
    if (aliveOf('lich_intern').length >= N.internCap || !api.canUse(u, 'lich_interns')) return false;
    return api.act(u, 'lich_interns', u, { anchor: 'self' });
  }
  const STEPS = {
    bookfall: function (u, api, foes) { return bookfall(u, api, foes) || shout(u, api, foes); },
    // no first wave landed (interrupted): the shout step instead (what the passive line's "Next:" announces)
    reprint: function (u, api, foes, rp) { return secondPrinting(u, api, rp) || shout(u, api, foes) || bookfall(u, api, foes); },
    shhh: function (u, api, foes) { return shout(u, api, foes) || bookfall(u, api, foes); },
    final: function (u, api, foes) { return finalNotice(u, api, foes) || shout(u, api, foes); },
    interns: function (u, api) { return interns(u, api); },
  };

  /**
   * His turn (wind-ups already landed): reform if he is a pile of bones (that is the whole turn); phase 2 at half HP;
   * drift back to his desk if needed; an Overdue Notice; then the next step of his rotation (a wind-up or the interns).
   */
  function lichPlan(unit, api) {
    const d = lichData(unit);
    if (isBones(unit)) {
      if (d.collapsedOwn) return;   // he collapsed at the start of this very turn: the reform waits for his next one
      if (!reassemble(unit)) d.final = true;
      return;
    }
    if (d.phase < 2 && unit.hp <= unit.maxHp * 0.5) enterPhase2(unit);
    d.turn++;
    // the region of a first-wave Bookfall that landed at the start of this turn (read once: never carried over)
    const rp = d.reprint;
    d.reprint = null;
    const foes = api.foes(unit);   // taunt-aware: a taunted librarian only has eyes for the taunter
    if (!foes.length) return;
    // a pile of bones does nothing more: an attack of opportunity on his walk or a retaliation (thorns) on his notice can
    // collapse him mid-turn (and a stun on the way ends his turn too)
    const done = function () { return !active(unit) || isBones(unit) || DD.Act.isStunned(unit); };
    reposition(unit, api, foes);
    if (done()) { updateFlavor(); return; }
    if (api.canUse(unit, 'lich_overdue_notice')) {
      const t = noticeTarget(unit, foes);
      if (t) api.act(unit, 'lich_overdue_notice', t, { anchor: 'unit' });
      if (done()) { updateFlavor(); return; }
    }
    const r = rotation(unit);
    const name = r[d.step % r.length];
    // a first wave that landed is always followed by its Second Printing (as its banner promises): if a fallback Bookfall
    // or a phase change put another step here, the Second Printing takes this turn and the rotation waits a turn
    if (rp && name !== 'reprint' && secondPrinting(unit, api, rp)) { updateFlavor(); return; }
    d.step++;
    STEPS[name](unit, api, foes, rp);
    updateFlavor();
  }

  /** The inspect panel's passive line: his rule and what comes next. */
  function passiveText(u) {
    const two = !!u && lichData(u).phase >= 2;
    const r = ROTATION[two ? 2 : 1].map(function (n) { return n === 'shhh' && two ? 'quiet' : n; });
    const next = u && !isBones(u) ? ' Next: ' + STEP_NAMES[nextStep(u)] + '.' : '';
    // who gets the mail if nobody moves (the HUD reads this live, so it stays pure: no RNG, no state)
    let to = '';
    if (u && !isBones(u) && S() && DD.AI && DD.AI.targetsFor) {
      const t = noticeTarget(u, DD.AI.targetsFor(u) || []);
      if (t) to = ' (now: ' + t.name + ')';
    }
    return 'His turn: an Overdue Notice to the nearest foe' + to + ', then the next of ' + r.map(function (n) { return STEP_NAMES[n]; }).join(' → ') + '.' + next +
      ' While a phylactery is left he can\'t die: he collapses and reforms.';
  }

  // ---- objects ----------------------------------------------------------------------------------------------------
  function edge(x0, y0, x1, y1, u) { return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]; }
  function hashOf(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const BOOK_COLS = ['#8e2b2b', '#2d4f8a', '#3b6b3f', '#6a4a8c', '#b08a2a', '#2c6b6b', '#7a3a5a'];

  // ---- map rotation: the library furniture turns with the board (def.yawAware: g.box stands on the view's ground quad).
  // Face details run along each visible face's bottom edge (f.x0, f.y0 -> f.x1, f.y1: exactly the classic left / right face
  // edges at the default view), or keep their classic yaw-0 coordinates and are moved onto the view (exactly the same
  // pixels at yaw 0). A side facing away hides its details.
  function classic() { return DD.Iso.view().legacy; }
  /** The visible faces of a block on (cx, cy, hw, hh) by physical side ('N' | 'E' | 'S' | 'W'); a hidden side is absent. */
  function sideFaces(g, cx, cy, hw, hh) {
    const by = {};
    g.faces(cx, cy, hw, hh).forEach(function (f) { by[f.dir] = f; });
    return by;
  }
  /** A point drawn at yaw 0 on a block's left (S side) face, put on that side's face f at the same spot ([px, py] at yaw 0). */
  function onLeftFace(f, cx, cy, hw, hh, px, py) {
    if (classic()) return [px, py];
    const s = (px - cx + hw) / hw;
    return f.at(s, cy + hh * s - py);
  }
  /** A point drawn at yaw 0 `h` px above the square (cx, cy, hw, hh) (on a block's top), in the current view. */
  function onTop(g, cx, cy, hw, hh, h, px, py) {
    if (classic()) return [px, py];
    const a = (px - cx) / hw, b = (py + h - cy) / hh;
    return g.on(cx, cy, hw, hh, (a + b) / 2, (b - a) / 2, h);
  }

  /**
   * Iso bookshelf with book rows; `fill` 0..1 = how stocked it is. Every side holds books: the classic left (S) and right (E)
   * faces draw first from the seeded stream, the far sides continue it, so each side keeps its books as the map turns.
   */
  function paintShelf(g, t, wood, fill, seed) {
    const c = g.ctx;
    g.ellipse(0, 3, 24, 9, 'rgba(0,0,0,0.28)', null);
    g.box(0, 0, 20, 10, 54, wood, true);
    let r = seed;
    const rnd = function () { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    const vis = sideFaces(g, 0, 0, 20, 10);
    ['S', 'E', 'N', 'W'].forEach(function (dir) {
      const fc = vis[dir], f = fc ? [fc.x0, fc.y0, fc.x1, fc.y1, fc.shade > 0 ? -0.2 * fc.shade : 0] : null;
      for (let s = 0; s < 3; s++) {
        const base = -4 - s * 17, top = base - 13;
        let a0 = null, a1 = null;
        if (f) {
          a0 = edge(f[0], f[1], f[2], f[3], 0.04); a1 = edge(f[0], f[1], f[2], f[3], 0.96);
          c.beginPath(); c.moveTo(a0[0], a0[1] + base); c.lineTo(a1[0], a1[1] + base); c.lineTo(a1[0], a1[1] + top); c.lineTo(a0[0], a0[1] + top); c.closePath();
          c.fillStyle = 'rgba(20,10,5,0.78)'; c.fill();
        }
        let uu = 0.06;
        while (uu < 0.92) {
          const w = 0.06 + rnd() * 0.06, hgt = 8 + rnd() * 4;
          if (rnd() < fill) {
            const col = BOOK_COLS[Math.floor(rnd() * BOOK_COLS.length)];
            if (f) {
              const a = edge(f[0], f[1], f[2], f[3], uu), b = edge(f[0], f[1], f[2], f[3], Math.min(0.94, uu + w));
              c.beginPath(); c.moveTo(a[0], a[1] + base); c.lineTo(b[0], b[1] + base); c.lineTo(b[0], b[1] + base - hgt); c.lineTo(a[0], a[1] + base - hgt); c.closePath();
              c.fillStyle = DD.util.shade(col, f[4]); c.fill();
              c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.5; c.stroke();
            }
          }
          uu += w + 0.01;
        }
        if (f) { c.beginPath(); c.moveTo(a0[0], a0[1] + base); c.lineTo(a1[0], a1[1] + base); c.strokeStyle = '#2a1a10'; c.lineWidth = 1.5; c.stroke(); }
      }
    });
  }

  function drawShelf(g, obj, time) {
    const d = obj.data || {};
    const t = g.tile || { x: 0, y: 0 };
    const seed = Math.floor(hashOf(t.x, t.y) * 233280);
    const wood = d.searched ? { top: '#4a3a30', left: '#3c2c22', right: '#30221a' } : { top: '#5a3a5e', left: '#4a2c4c', right: '#3a203c' };
    paintShelf(g, t, wood, d.searched ? (d.role === 'spent' ? 0.15 : 0.35) : 0.9, seed);
    // red OVERDUE sticker on the south side (the left face by default)
    const south = sideFaces(g, 0, 0, 20, 10).S;
    if (south) {
      const P = function (x, y) { return onLeftFace(south, 0, 0, 20, 10, x, y); };
      g.poly([P(-15, -48), P(-6, -43.5), P(-6, -38.5), P(-15, -43)], '#c0263a', '#3a0c12');
      const a = P(-13.5, -44.5), b = P(-7.5, -41.5);
      g.line(a[0], a[1], b[0], b[1], '#ffe0e0', 1);
    }
    if (d.role === 'spent') {
      g.glow(0, -30, 18, '#3a3a3a', 0.35);
      for (let i = 0; i < 3; i++) g.circle(-6 + i * 6, -58 - ((time * 8 + i * 5) % 14), 2.2 - i * 0.4, 'rgba(90,90,90,0.5)', null);
    }
    if (d.revealed && !d.searched) {
      const p = 0.55 + 0.25 * Math.sin(time * 4);
      g.glow(0, -30, 30, '#7dff8a', 0.45 * p);
      g.box(0, -22, 20, 10, 6, { top: 'rgba(125,255,138,0.5)', left: 'rgba(90,220,110,0.45)', right: 'rgba(70,190,90,0.45)' }, null);
      for (let i = 0; i < 4; i++) {
        const a = time * 1.6 + i * 1.57;
        g.circle(Math.cos(a) * 16, -40 + Math.sin(a * 1.3) * 10, 2, 'rgba(180,255,180,0.9)', null);
      }
      g.text('📕', 0, -66, 13, '#ffffff');
    }
  }

  function drawCatalog(g, obj, time) {
    g.ellipse(0, 3, 18, 7, 'rgba(0,0,0,0.28)', null);
    const wood = { top: '#9a6b3f', left: '#7a5230', right: '#5e3e24' };
    g.box(0, 0, 15, 7.5, 28, wood, true);
    const c = g.ctx;
    // drawer grid on every visible face (lit like the face: the classic left / right colours at the quarter views)
    g.faces(0, 0, 15, 7.5).forEach(function (fc) {
      const f = [fc.x0, fc.y0, fc.x1, fc.y1], front = g.mix('#8a5e36', '#6e4a2a', fc.shade);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const u0 = 0.08 + col * 0.3, u1 = u0 + 0.24;
        const a = edge(f[0], f[1], f[2], f[3], u0), b = edge(f[0], f[1], f[2], f[3], u1);
        const yb = -4 - row * 8, yt = yb - 6;
        c.beginPath(); c.moveTo(a[0], a[1] + yb); c.lineTo(b[0], b[1] + yb); c.lineTo(b[0], b[1] + yt); c.lineTo(a[0], a[1] + yt); c.closePath();
        c.fillStyle = front; c.fill(); c.strokeStyle = '#2a1a10'; c.lineWidth = 0.7; c.stroke();
        const m = edge(a[0], a[1], b[0], b[1], 0.5);
        g.circle(m[0], m[1] + yb - 3, 0.9, '#e8c060', null);
      }
    });
    if (catalogReady(obj)) {
      const bob = Math.sin(time * 3) * 2;
      g.rect(-7, -44 + bob, 14, 9, '#fff8e6', '#3a2214', 1);
      g.line(-5, -41 + bob, 5, -41 + bob, '#9a8a7a', 0.8);
      g.line(-5, -38.5 + bob, 3, -38.5 + bob, '#9a8a7a', 0.8);
      g.glow(0, -40 + bob, 12, '#ffe9a0', 0.35);
    }
  }

  function drawDesk(g) {
    g.ellipse(0, 3, 24, 9, 'rgba(0,0,0,0.25)', null);
    g.box(0, 0, 20, 10, 20, { top: '#7a4a2a', left: '#5e3820', right: '#4a2c18' }, true);
    g.rect(-10, -34, 20, 8, '#2a1a10', '#e8c060', 1.5);
    g.text('RETURNS', 0, -30, 6, '#e8c060');
    // the service bell and a returns slip lie on the top: they turn with the board
    const on = function (x, y) { return onTop(g, 0, 0, 20, 10, 20, x, y); };
    const bell = on(9, -21);
    g.ellipse(bell[0], bell[1], 3.2, 1.6, '#c9a03a', true);
    g.circle(bell[0], bell[1] - 2, 1, '#f3d27a', null);
    g.poly([on(-12, -22), on(-3, -18), on(-3, -15), on(-12, -19)], '#f3e3b0', true);
  }

  /**
   * AutoPlay hints (the interactions are the registered defs', so AutoPlay also dry-runs them: a shred's stun
   * interrupting a pending wind-up shows up as danger saved on top of these numbers).
   */
  function shelfHint(unit, o) {
    const d = o.data || {};
    if (d.searched) return 0;
    if (d.revealed && d.role === 'phylactery') {
      const lich = findLich();
      if (lich && isBones(lich)) return phylacteryTiles().length <= 1 ? 140 : 30;
      return 48;
    }
    return 0; // an unrevealed shelf is a gamble (2 of them bite): sensible parties ask the catalog first
  }
  function catalogHint(unit, o) { return o && catalogReady(o) ? 16 : 0; }

  DD.registerObject({
    id: 'lich_shelf', name: 'Restricted Section Shelf', blocksMove: true, blocksLos: true, hp: 8, height: 1.7, color: '#5a3a5e', yawAware: true,
    desc: 'Search (1 AP) or break it (8 HP). Three shelves hide Lich-tenstein\'s phylacteries: shredding one deals ' + N.phylactery +
      ' damage to him, waives his Late Fees and Stuns him (not while he is Speed-Reading). Two are mimics; the rest hold a good ' +
      'book (+' + N.boon + ' HP). A Card Catalog makes the right ones glow green.',
    available: function (o) { return !(o.data && o.data.searched); },
    interact: { ap: 1, label: 'Search', fn: function (unit, o, tile) { searchShelf(unit, o, tile); } },
    onDestroyed: function (o, tile, src) { shelfDestroyed(o, tile, src); },
    autoplay: shelfHint,
    draw: drawShelf,
  });
  DD.registerObject({
    id: 'lich_catalog', name: 'Card Catalog', blocksMove: true, blocksLos: false, hp: 0, height: 1.1, color: '#8a5a2c', yawAware: true,
    desc: 'Look Up (1 AP, once per round): the shelf hiding the nearest of Lich-tenstein\'s phylacteries glows green. ' +
      'Mimics are not in the catalog. Nobody is in the catalog.',
    available: function (o) { return catalogReady(o); },
    interact: { ap: 1, label: 'Look Up', fn: function (unit, o, tile) { lookUp(unit, o, tile); } },
    autoplay: catalogHint,
    draw: drawCatalog,
  });
  DD.registerObject({
    id: 'lich_desk', name: 'Circulation Desk', blocksMove: true, blocksLos: false, hp: 0, height: 0.6, color: '#7a4a2a', yawAware: true,
    desc: 'Blocks movement. The returns slot has teeth marks. Ring the bell for service (nobody will come).',
    draw: drawDesk,
  });
  // the reading-room rug is green (not the core red carpet): the red wind-up hatching must stay readable on it
  DD.registerTerrain({
    id: 'lich_rug', name: 'Reading-Room Rug', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#2f5a48', left: '#234536', right: '#1c382c' },
    desc: 'Plush, green and very, very quiet. Talking on it is a fineable offence.',
  });

  // ---- sprites -------------------------------------------------------------------------------------------------------
  function hasSt(st, id) { return !!st && (st instanceof Set ? st.has(id) : Array.isArray(st) ? st.indexOf(id) >= 0 : typeof st === 'object' ? !!st[id] : false); }

  function drawSkull(g, x, y, t, dim, tilt) {
    const bone = '#efe8d6';
    const c = g.ctx;
    c.save(); c.translate(x, y); c.rotate(tilt || 0);
    // hair bun (grey, with a pencil through it)
    g.shaded(function (p) { p.ellipse(-1.5, -7.5, 9.2, 5.2, -0.1, 0, TAU); }, '#a9a9b6', { dx: 1, dy: -1 });
    g.shaded(function (p) { p.arc(-3, -13.5, 4.6, 0, TAU); }, '#b8b8c4', { dx: 0.8, dy: -0.8 });
    g.line(-9, -16.5, 3.5, -10.5, '#e8b923', 1.8);
    g.line(3.5, -10.5, 5.2, -9.7, '#f4a6b8', 1.8);
    // skull + jaw
    g.shaded(function (p) { p.ellipse(0, 0, 8.6, 8.2, 0, 0, TAU); }, bone, { dx: 1.2, dy: -1.2, hl: [-2.5, -4, 3, 1.6, -0.4] });
    g.shaded(function (p) { p.moveTo(-5, 4); p.lineTo(5.5, 4); p.lineTo(4.5, 9); p.lineTo(-4, 9); p.closePath(); }, bone, { dx: 0.6, dy: -0.6 });
    for (let i = -1; i <= 2; i++) g.line(i * 2.2, 5.5, i * 2.2, 8.4, '#3a2a26', 0.6);
    g.poly([[1.6, 1.8], [0.4, 4], [2.8, 4]], '#2a1d20', null);
    // eye sockets with soul-fire
    const flick = dim ? 0.35 + 0.25 * Math.sin(t * 2.2) : 0.85 + 0.15 * Math.sin(t * 9);
    [[-3.2, -0.6], [4.4, -0.6]].forEach(function (e) {
      g.ellipse(e[0], e[1], 2.6, 2.9, '#1d1418', null);
      g.glow(e[0], e[1], 6, '#7dff8a', 0.55 * flick);
      g.circle(e[0], e[1], 1.15, 'rgba(190,255,190,' + flick.toFixed(2) + ')', null);
    });
    // half-moon reading glasses + bead chain
    g.arc(-3.2, -0.2, 3.4, 0.05, Math.PI - 0.05, '#c9a03a', 1.1, 'rgba(220,240,255,0.22)');
    g.arc(4.4, -0.2, 3.4, 0.05, Math.PI - 0.05, '#c9a03a', 1.1, 'rgba(220,240,255,0.22)');
    g.line(0.2, -0.2, 1, -0.2, '#c9a03a', 1);
    g.path(function (p) { p.moveTo(-6.6, 0); p.quadraticCurveTo(-11, 9, -6, 15); }, null, '#c9a03a', 0.7);
    g.path(function (p) { p.moveTo(7.8, 0); p.quadraticCurveTo(11, 9, 6, 15); }, null, '#c9a03a', 0.7);
    c.restore();
  }

  function drawBonePile(g, t) {
    const bone = '#e8e2cf';
    g.glow(0, -6, 16, '#7dff8a', 0.18 + 0.08 * Math.sin(t * 2));
    [[-10, -2, 8, -6], [-6, -7, 10, 0], [-12, -6, 2, 0], [2, -3, 13, -8], [-4, 0, 6, -10]].forEach(function (b) {
      g.limb(b[0], b[1], b[2], b[3], 2.2, bone);
      g.circle(b[0], b[1], 1.8, bone);
      g.circle(b[2], b[3], 1.8, bone);
    });
    g.ellipse(0, -2, 13, 4, 'rgba(60,30,70,0.85)', true);
    drawSkull(g, 1, -16, t, true, 0.35);
    g.text('...renewing', 0, -34, 6, '#c9ffb0', null);
  }

  function drawLich(g, t, o) {
    const st = o && o.statuses;
    const ud = o && o.unit && o.unit.data && o.unit.data.lich;
    if (hasSt(st, 'lich_bonepile') || (ud && ud.collapsed)) { drawBonePile(g, t); return; }
    const P = g.pal;
    const cast = g.pose === 'cast' || g.pose === 'attack';
    const hurt = g.pose === 'hurt';
    const sway = Math.sin(t * 1.7) * 1.1;
    const bone = '#efe8d6';
    // orbiting books + soul glow (behind)
    g.glow(0, -26, 26, '#7dff8a', 0.16 + 0.05 * Math.sin(t * 2));
    for (let i = 0; i < 3; i++) {
      const a = t * 1.2 + i * 2.09;
      if (Math.sin(a) > 0) continue;
      drawTinyBook(g, Math.cos(a) * 19, -30 + Math.sin(a) * 4 + Math.sin(t * 3 + i) * 1.5, BOOK_COLS[i * 2]);
    }
    // robe: bell with a tattered hem
    g.shaded(function (p) {
      p.moveTo(-7.5, -31);
      p.quadraticCurveTo(-13, -16, -13.5 + sway * 0.4, -3);
      for (let i = 0; i <= 6; i++) {
        const x = -13.5 + (27 * i) / 6;
        p.lineTo(x + sway * 0.4, (i % 2 ? -4.5 : 1.2) + Math.sin(t * 3.2 + i * 1.3) * 1.1);
      }
      p.quadraticCurveTo(13, -16, 7.5, -31);
      p.closePath();
    }, P.cloth, { dx: 1.6, dy: -1.2, hl: [-5, -24, 2.2, 6, 0.1] });
    // mustard cardigan over the shoulders
    g.shaded(function (p) {
      p.moveTo(-8.5, -32); p.quadraticCurveTo(-11, -22, -9.5, -12); p.lineTo(-2.5, -12); p.lineTo(-1.2, -30); p.closePath();
    }, P.cloth2, { dx: 0.9, dy: -0.9 });
    g.shaded(function (p) {
      p.moveTo(8.5, -32); p.quadraticCurveTo(11, -22, 9.5, -12); p.lineTo(2.5, -12); p.lineTo(1.2, -30); p.closePath();
    }, P.cloth2, { dx: 0.9, dy: -0.9 });
    for (let i = 0; i < 3; i++) g.circle(-2.6, -27 + i * 5, 0.9, '#5a3a14', null);
    // library-card lanyard
    g.path(function (p) { p.moveTo(-3, -32); p.lineTo(0, -21); p.lineTo(3, -32); }, null, '#2d6bd6', 0.9);
    g.rect(-2.6, -22, 5.2, 4, '#fff8e6', true, 0.6);
    g.line(-1.6, -20.6, 1.6, -20.6, '#2d6bd6', 0.6);
    // the tome (left hand, open) — the date stamp or the SHHH finger (right hand)
    const bookY = -15 + Math.sin(t * 2.1) * 0.8;
    g.limb(-7, -29, -10, bookY + 1, 2.2, bone, -13, -22);
    // an open tome held up like a hymnal: two fanned pages over a plum cover
    g.poly([[-18, bookY - 4], [-10, bookY - 1.5], [-2, bookY - 4], [-2, bookY + 1.5], [-10, bookY + 4], [-18, bookY + 1.5]], '#6a2a4a', true);
    g.poly([[-17, bookY - 5.5], [-10, bookY - 3], [-10, bookY + 2.2], [-17, bookY - 0.3]], '#fff4dc', true);
    g.poly([[-10, bookY - 3], [-3, bookY - 5.5], [-3, bookY - 0.3], [-10, bookY + 2.2]], '#f3e6c4', true);
    for (let i = 0; i < 3; i++) {
      g.line(-15.5, bookY - 3.6 + i * 1.6, -11.5, bookY - 2.2 + i * 1.6, '#8a7a6a', 0.5);
      g.line(-8.5, bookY - 2.2 + i * 1.6, -4.5, bookY - 3.6 + i * 1.6, '#8a7a6a', 0.5);
    }
    g.glow(-10, bookY - 3, 8, '#a0ffb0', 0.35 + 0.1 * Math.sin(t * 3));
    if (cast) {
      g.limb(7, -29, 4.5, -36.5, 2.2, bone, 10, -33);
      g.limb(4.5, -36.5, 4.2, -42.5, 1.2, bone);
    } else {
      const sx = 11 + (hurt ? -1 : 0), sy = -16 + Math.sin(t * 2.4 + 1) * 0.8;
      g.limb(7, -29, sx, sy, 2.2, bone, 12, -24);
      g.rect(sx - 2.2, sy - 6, 4.4, 5, '#5a3a22', true, 1);
      g.rect(sx - 3.6, sy - 1.5, 7.2, 3, '#2a1a10', true, 0.8);
      g.text('LATE', sx, sy + 4.5, 3.4, '#ff6b7b', null);
    }
    // head
    drawSkull(g, 0.5, -40 + (hurt ? 1 : 0), t, false, hurt ? -0.15 : Math.sin(t * 1.3) * 0.04);
    // orbiting books (front)
    for (let i = 0; i < 3; i++) {
      const a = t * 1.2 + i * 2.09;
      if (Math.sin(a) <= 0) continue;
      drawTinyBook(g, Math.cos(a) * 19, -30 + Math.sin(a) * 4 + Math.sin(t * 3 + i) * 1.5, BOOK_COLS[i * 2]);
    }
    if (cast) g.text('SHH', 11, -52, 5, '#e8ffe0');
  }
  function drawTinyBook(g, x, y, col) {
    g.rect(x - 2.8, y - 3.6, 5.6, 7.2, col, true, 0.8);
    g.line(x - 1.6, y - 3.6, x - 1.6, y + 3.6, 'rgba(255,240,200,0.6)', 0.6);
  }

  function drawMimic(g, t) {
    const chomp = g.pose === 'attack' ? 1 : 0.5 + 0.5 * Math.sin(t * 5);
    const open = 2 + chomp * 5;
    const c = g.ctx;
    c.save(); c.translate(0, 0);
    g.ellipse(0, 1, 13, 4.5, 'rgba(0,0,0,0.25)', null);
    // lower body (shelf base)
    g.shaded(function (p) { p.rect(-11, -14, 22, 14); }, '#5a3a5e', { dx: 1.2, dy: -1.2 });
    for (let i = 0; i < 5; i++) g.rect(-9.5 + i * 4, -12.5, 3.4, 9, BOOK_COLS[i % BOOK_COLS.length], true, 0.5);
    // mouth: tongue + teeth
    g.rect(-10.5, -15 - open, 21, open + 1.5, '#3a0c18', null);
    g.ellipse(2, -15 - open * 0.35, 6, Math.max(1, open * 0.35), '#e05a7a', null);
    for (let i = 0; i < 6; i++) {
      g.poly([[-10 + i * 3.6, -14.5], [-8.2 + i * 3.6, -11.8], [-6.4 + i * 3.6, -14.5]], '#fff8e6', null);
      g.poly([[-10 + i * 3.6, -15 - open], [-8.2 + i * 3.6, -17.6 - open + 2.6 + 0.1], [-6.4 + i * 3.6, -15 - open]], '#fff8e6', null);
    }
    // lid (upper shelf) hinged open
    g.shaded(function (p) { p.rect(-11, -26 - open, 22, 11); }, '#5a3a5e', { dx: 1.2, dy: -1.2 });
    for (let i = 0; i < 5; i++) g.rect(-9.5 + i * 4, -24.5 - open, 3.4, 8, BOOK_COLS[(i + 3) % BOOK_COLS.length], true, 0.5);
    // googly eyes on top
    [[-4.5, -29 - open], [4.5, -29 - open]].forEach(function (e, i) {
      g.circle(e[0], e[1], 3.4, '#ffffff');
      g.circle(e[0] + Math.sin(t * 3 + i) * 1.2, e[1] + 0.6, 1.5, '#1d1418', null);
    });
    c.restore();
  }

  // ---- enemies -------------------------------------------------------------------------------------------------------
  DD.registerEnemy({
    id: LICH, name: 'Lich-tenstein', act: 2, tier: 'boss', hp: N.hp, mov: 2, armor: 0,
    tags: ['undead', 'boss', 'lich'], flags: { flying: true, large: true, immune: ['sleep'] }, resist: { poison: 0, frost: 0.5, holy: 1.5 },
    sprite: {
      base: 'custom', scale: 2.1, height: 52, width: 30, headY: -40, hover: 6,
      palette: { skin: '#efe8d6', cloth: '#3d2352', cloth2: '#c9a227', hair: '#a9a9b6', metal: '#c9a03a', eye: '#7dff8a', accent: '#7dff8a', outline: '#1a1014' },
      bounds: { l: -40, r: 40, t: -78, b: 16 }, portrait: { x: 0, y: -38, r: 18 },
      draw: drawLich,
    },
    // his skill list is what he does at once (the HUD's reach and AutoPlay read it); the wind-ups come from his rotation
    skills: ['lich_overdue_notice', 'lich_interns'],
    ai: lichPlan, aiStyle: 'ranged', xp: 50, gold: [80, 100],
    passive: { name: 'Overdue Policy', icon: '📚', desc: function (u) { return passiveText(u); } },
    hooks: {
      // the fees grow at the END of his turn: a wind-up he just charged shows the new number for the heroes' whole window
      // (growing at the round start would raise it after the last hero turn before it lands)
      onTurnEnd: function (unit) {
        lichData(unit).collapsedOwn = false;   // a collapse in this turn: he reforms on the next one
        // a pile of bones that lost its turn (stunned) still reforms on the next one: keep the skills cooling down
        if (isBones(unit) && active(unit)) holdSkills(unit);
        if (isBones(unit) || !active(unit)) return;
        addFees(unit, (lichData(unit).phase >= 2 ? N.feeRate2 : N.feeRate) + aliveOf('lich_intern').length);
      },
      onTakeDamage: function (d) {
        const u = d.target;
        if (!u || u.dead || u.hp > 0 || lichData(u).final) return;
        if (phylacteryTiles().length) collapse(u);
      },
      // instant kills (Act.kill) skip onTakeDamage: a lich with phylacteries left refuses that death and collapses
      // instead, before any of a death happens (no death bark or log, no gold tally, no Hype, no onKill)
      preventDeath: function (unit) {
        if (lichData(unit).final || !phylacteryTiles().length) return false;
        collapse(unit);
        return true;
      },
      onDeath: function () { A().narrate('lich_victory', {}); },
      onStatusApplied: function (unit, st) {
        // a boss is not stun-locked: every incapacitation (a shredded phylactery's too) buys him Speed-Reading: the turn
        // he loses plus his next 2
        if (st && incapacitates(st.id) && active(unit)) A().addStatus(unit, 'lich_focus', { turns: N.focus, silent: true }, unit);
      },
      modifyStatus: function (s) {
        if (!s.unit || !incapacitates(s.id) || !has(s.unit, 'lich_focus')) return;
        s.cancel = true;
        DD.FX.text(s.unit, '👓 Speed-Reading: shrugs it off', { color: '#e8c060', size: 13 });
      },
    },
    boss: { title: 'The Overdue Librarian', intro: '"Your books are LATE. Your fines are COMPOUNDING. And you are TALKING. IN. MY. LIBRARY."', music: null },
    barks: {
      spawn: ['Silence in the stacks!', 'You have 300 years of late fees.', 'Whisper your last words. QUIETLY.'],
      attack: ['SHHHH!', 'Overdue!', 'That will be a fine.', 'Dewey Decimate!'],
      hurt: ['That was a first edition!', 'Mind the spine!', 'Ow! My marginalia!'],
      death: ['Return... to... sender...', 'My golem... never even said goodbye...', 'Please... renew... me...'],
      phase: ['FINAL NOTICE!', 'The fees are COMPOUNDING!'],
      phylactery: ['MY POETRY JOURNAL!', 'That was a SIGNED copy!', 'You dog-eared my SOUL!'],
      collapse: ['Merely... a brief... renewal...', 'Shelving myself... temporarily.'],
      renew: ['Renewed for another 300 years!', 'You cannot cancel my membership!'],
    },
    desc: 'Head librarian of the Necromancy Academy, undead since the late-fee schedule was last updated. Hides his soul in overdue ' +
      'books because nobody, living or dead, has ever returned one. Moves: Overdue Notice, Bookfall, SHHHH! (later QUIET!!!), Final Notice, Unpaid ' +
      'Internship. His golem security guard has been threatening to quit for two hundred years.',
  });

  DD.registerEnemy({
    id: 'lich_intern', name: 'Work-Study Skeleton', act: 2, tier: 'minion', hp: N.internHp, mov: 4, armor: 0,
    tags: ['undead', 'skeleton'], resist: { poison: 0, holy: 1.5 },
    sprite: {
      base: 'humanoid', scale: 0.85, build: 'slim', outfit: 'tunic',
      palette: { skin: '#e8e2cf', cloth: '#7a8aa0', cloth2: '#c9a227', hair: '#e8e2cf', metal: '#c9a03a', eye: '#7dff8a', accent: '#2d6bd6', outline: '#1a1014' },
      head: { face: 'skull', eyes: 'glow', hat: 'none', mouth: 'none' }, mainhand: 'book', offhand: 'scroll', extras: ['satchel'],
    },
    skills: ['lich_intern_stamp'], ai: { style: 'melee' }, xp: 2, gold: [0, 1],
    barks: {
      spawn: ['Is this a paid position?', 'Day one! So excited to be exploited!', 'Do we get dental? We have so many teeth.'],
      attack: ['Stamped!', 'OVERDUE!', 'Sorry! Boss says I have to!'],
      hurt: ['Worker\'s comp?!', 'My femur! I was using that!'],
      death: ['At least it counts as experience...', 'Tell HR...', 'I quit. Again.'],
    },
    desc: 'A work-study student (unpaid: technically an internship) working toward a degree in Applied Necromancy. Stamps everything OVERDUE, including people, and files the ' +
      'paperwork: every living Work-Study Skeleton adds 1 to the Late Fees each round. Hours: all of them.',
  });

  DD.registerEnemy({
    id: 'lich_mimic', name: 'Bookshelf Mimic', act: 2, tier: 'normal', hp: N.mimicHp, mov: 3, armor: 0,
    tags: ['mimic', 'construct'], resist: { fire: 1.5 },
    sprite: { base: 'custom', scale: 1.1, height: 34, width: 26, headY: -22, palette: { cloth: '#5a3a5e', accent: '#e05a7a', outline: '#1a1014' }, draw: drawMimic },
    skills: ['lich_mimic_chomp'], ai: { style: 'melee' }, xp: 6, gold: [3, 6],
    barks: {
      spawn: ['SURPRISE! I\'m in the Restricted Section!', 'Finally, a reader!', 'CHECK. ME. OUT.'],
      attack: ['Chomp!', 'Read me!', 'Spine-tingling!'],
      hurt: ['My dust jacket!', 'Not the binding!'],
      death: ['The end...', 'Out of print...'],
    },
    desc: 'A bookshelf that ate the books, then the librarian\'s apprentice, then the concept of returns. Disappointed in your reading habits.',
  });

  // ---- arena + encounter ------------------------------------------------------------------------------------------------
  // 14 × 12: the lich's desk end at the top (walls N + W), Restricted Section aisles in the middle, the party at the
  // bottom. R = restricted shelf (role dealt at start), K = card catalog, = = the book-return chute (a pit, interns climb out).
  const LAYOUT = [
    '##############',
    '#bbc...D...cbb',
    '#..E...B...E..',
    '#.....:::.....',
    '#.R.R..:..R.R.',
    '#......:......',
    '#K..R..=..R..K',
    '#......:......',
    '#.b..R.:.R..b.',
    '#......:......',
    '#..HHHHHHHH...',
    '#......:......',
  ];
  DD.registerEncounter({
    id: 'boss_lichtenstein', act: 2, kind: 'boss', name: 'The Restricted Section', weight: 1,
    intro: 'The Academy library. Somewhere a quill scratches a fine. The air smells of dust, mildew and three centuries of compound interest.',
    map: {
      theme: 'academy', layout: LAYOUT,
      legend: {
        '.': { terrain: 'wood' },
        ':': { terrain: 'lich_rug' },
        'b': { terrain: 'wood', obj: 'bookshelf' },
        'c': { terrain: 'wood', obj: 'candles' },
        'D': { terrain: 'lich_rug', obj: 'lich_desk' },
        'R': { terrain: 'wood', obj: 'lich_shelf', mark: 'lich_shelf' },
        'K': { terrain: 'wood', obj: 'lich_catalog', mark: 'lich_catalog' },
        'E': { terrain: 'lich_rug', zone: 'enemy', tag: 'enemy_spawn' },
        'B': { terrain: 'lich_rug', zone: 'enemy', tag: 'boss_spawn' },
        'H': { terrain: 'wood', zone: 'hero' },
        '=': { terrain: 'pit', mark: 'lich_chute' },
      },
    },
    enemies: [{ id: LICH, n: 1 }, { id: 'lich_intern', n: 2 }],
    objective: { type: 'boss', flavor: 'Look Up a Card Catalog (1 AP), then Search the shelf that glows to shred a phylactery.' },
    onStart: function (state) { setupLibrary(state); A().narrate('lich_start', {}); },
    reward: { goldMult: 1, itemRarity: 'legendary' },
  });

  // ---- narration -------------------------------------------------------------------------------------------------------
  DD.registerNarration('boss_start', [
    'The DM puts on his reading glasses. For the voice. He does not need them. He needs them.',
  ]);
  DD.registerNarration('lich_start', [
    'DM: "Liches keep their souls somewhere safe. Libraries have a whole system for finding things. The Card Catalog. Just saying."',
    'DM: "Three of those shelves hide his soul. Two hide teeth. Only one of those is listed in the Card Catalog."',
  ]);
  DD.registerNarration('lich_phylactery', [
    '{hero} tears out the last page of the lich\'s soul. Spoiler: it ends badly for him. ({n} left)',
    'Paper cuts are nothing compared to what {hero} just did to that lich\'s afterlife. ({n} left)',
    'The DM winces. "You can\'t just... tear up... okay, yes, you can." ({n} left)',
  ]);
  DD.registerNarration('lich_renew', [
    'He renews himself like a library book nobody else wanted. Shred the phylacteries, people!',
    'The bones snap back together. "Renewals are free for staff," he wheezes.',
  ]);
  DD.registerNarration('lich_phase2', [
    'Late fees are now compounding hourly. The DM pulls out a calculator. It has a skull on it.',
    'FINAL NOTICE. The DM reads it aloud in a library whisper, which is somehow worse.',
  ]);
  DD.registerNarration('lich_victory', [
    'Lich-tenstein is returned. Permanently. Somewhere in the stacks, an old stone golem quietly packs up its desk.',
    'The lich is dust. A pale blue golem in the corner peels off its name badge, its runes flaring, grumbles "I QUIT," and follows you out.',
  ]);

  // ---- public helpers (tests, other content) -------------------------------------------------------------------------------
  DD.Act2Bosses = DD.Act2Bosses || {};
  DD.Act2Bosses.lich = {
    N: N, ROTATION: ROTATION, WINDUPS: WINDUPS, plan: lichPlan, phylacteryTiles: phylacteryTiles, hiddenPhylacteries: hiddenPhylacteries,
    shelves: shelves, setupLibrary: setupLibrary, reveal: revealNearest, fees: feesOf, teleDmg: teleDmg, checkerRegion: checkerRegion,
    checkerTiles: checkerTiles, spawnInterns: spawnInterns, findLich: findLich, collapse: collapse, reassemble: reassemble,
    data: lichData, fight: fightData, addFees: addFees, waiveFees: waiveFees, isBones: isBones, makeMortal: makeMortal,
    nextStep: nextStep, passiveText: passiveText, noticeTarget: noticeTarget,
  };
})();
