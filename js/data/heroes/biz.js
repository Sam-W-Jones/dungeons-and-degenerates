/* Dungeons and Degenerates — js/data/heroes/biz.js
 * Biz the Subcontractor, Lizardfolk Artificer (he/him, the 19th hero, h19; available from the start). The user, Nov 18:
 * "a lizard-man artificer who relies on his mechanical summons, Hjalmarino (a monkey) and Spooder (a spider) to fight
 * for him". Spec: .tmp/h19/addendum-biz.md (plan .tmp/h19/plan.md D1-D14).
 * Three bodies: Biz himself (22 HP, the weakest basic in the game) and his two constructs, ordinary hero-side summons
 * that act on his turn with their own 2 AP: Hjalmarino, a tin cymbal monkey (melee: Monkey Wrench is its attack of
 * opportunity, Cymbal Crash Confuses), and Spooder, a googly-eyed spider-bot (ranged Pew Pew, Thwip! Roots). Their
 * model (Mk I / II / III) follows his level (Mk II from 4, Mk III from 7: MK_AT). The constructs take "it" or no
 * pronoun, never he / she.
 * Passive Batteries Included deploys both at combat start; a scrapped one leaves a Scrap Heap (a non-blocking, untargetable
 * marker; the truth is unit.data.biz.scrap) and reboots there at the start of his third turn after with a third of its HP (it
 * spends that turn booting up, fix:balance B2): a NEW unit, never a heal. His ONE heal (D9, Nov 18): Overclock's bask — he
 * ends that turn next to the construct he overclocked and heals 3/4/4 through DD.Act.heal(biz, biz, n, { via: 'lift:biz' }),
 * once a turn. Nothing in the kit restores HP to a living construct (Duct Tape is Block, a reboot is a rebuild).
 * Registers: hero biz, 11 skills (biz_*: basic, 9 pool, signature), 4 construct skills (owner 'summon'), summons
 * biz_hjalmarino / biz_spooder, statuses biz_overclocked / biz_updated / biz_rebuilding / biz_booting, object biz_scrap,
 * 3 hero items, loading tips. Randomness: cosmetic only (maybeBark, the Hjalmar gag's DD.rng). Test / debug API: DD.Biz.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HERO = 'biz';
  const HJ = 'biz_hjalmarino', SP = 'biz_spooder';
  // h19:balance (it1): robot HP −2 each (8/6 → 6/4 + 2 × his level; defHp = the def's HP = level 1) and the reboot
  // timer 2 → 3 (the addendum's first two "too strong" knobs; first reading 3.31× the reference). fix:balance B5 (Nov 21,
  // the lead's two steps, Biz still 1.58×): Hjalmarino 6 → 5 → 4 + 2L, Spooder 4 → 3 + 2L (the floors)
  const KINDS = {
    hjalmarino: { id: HJ, name: 'Hjalmarino', base: 4, per: 2, defHp: 6, color: '#d9a54a' },
    spooder: { id: SP, name: 'Spooder', base: 3, per: 2, defHp: 5, color: '#6fa8dc' },
  };
  const ORDER = ['hjalmarino', 'spooder'];
  const ROMAN = ['', 'I', 'II', 'III'];
  const MK_AT = [4, 7];          // Mk II from Biz's level 4, Mk III from 7 (h19:balance it2: 3 / 6 → 4 / 7)
  const SCRAP_TURNS = 3;         // a scrapped construct reboots at the start of his third turn after
  // h19:balance it4: a timed reboot (and a Warranty claim) builds it with a third of its max HP, rounded up (was half)
  const REBOOT_FRAC = 1 / 3, REBOOT_SHARE = 'a third of its HP';
  const OC_AP = 1;               // fix:balance B3 (Nov 21): Overclock's AP 2 → 1 (never below +1); the Remote adds 1
  const NTH = ['', 'next', 'second', 'third', 'fourth'], WORD = ['', 'one', 'two', 'three', 'four'];
  const OVER = 'biz_overclocked', UPDATED = 'biz_updated', REBUILD = 'biz_rebuilding', SCRAP = 'biz_scrap';
  // fix:balance B2 (Nov 21, the lead's decision): a robot that comes back is Booting Up for that turn of his
  const BOOT = 'biz_booting';
  const REMOTE = 'biz_universal_remote', WARRANTY = 'biz_warranty', TAIL = 'biz_spare_tail';
  const BLUE = '#3a86d4', HOT = '#ff7a3d', SILK = '#f4f1e6', GOLD = '#f0c23a', CYAN = '#7fe3ff', BRASS = '#c9a24f', STEEL = '#c9ced6';
  // the Hjalmar "tin double" gag: literal lines on Hjalmar's unit (his file is never touched; cosmetic, 50%, once a fight)
  const TIN_LAUGHED = 'Why is it laughing like me?! Stop that!', TIN_LAUGH = 'HEE. HEE. HEE. (Recorded.)';
  const TIN_LINES = ['Hey! Who made a TIN me?!', 'Ooh ooh! That\'s MY face! On a TOY!', 'I want royalties! In bananas!', TIN_LAUGHED];

  // ---- helpers ----------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function byPos(a, b) { return a.y - b.y || a.x - b.x; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function byId(id) { return id == null || !DD.Combat || !DD.Combat.byId ? null : DD.Combat.byId(id); }
  function foeOf(u, f) { return active(u) && active(f) && G().hostile(u, f); }
  function hasItem(u, id) { return !!u && Array.isArray(u.items) && u.items.indexOf(id) >= 0; }
  /** Item check for descs: combat units (items array) and RunHeroes (slot object) alike (Ellaria's). */
  function wears(u, id) {
    if (!u) return false;
    if (Array.isArray(u.items)) return u.items.indexOf(id) >= 0;
    if (u.items && typeof u.items === 'object') { for (const k in u.items) if (u.items[k] === id) return true; }
    return !!(u.runHero && u.runHero !== u && wears(u.runHero, id));
  }
  /** A skill's target reach for this user: the base number plus his range items (DD.Targeting.reach; heroes-v1). */
  function reach(user, id, L, base) {
    const d = DD.getSkill(id);
    if (!user || !d || !DD.Targeting || typeof DD.Targeting.reach !== 'function') return base;
    return DD.Targeting.reach(d, L || d.levels[0], user, base);
  }
  function freshData() {
    return { scrap: { hjalmarino: null, spooder: null }, seq: 0, basked: -1, tail: false, tailNow: false, tin: false,
      claimed: { hjalmarino: false, spooder: false } };
  }
  function dataOf(u) { const d = u.data || (u.data = {}); return d.biz || (d.biz = freshData()); }
  /** Read-only view of his bookkeeping (queries, descs and scores never create it). */
  function peek(u) { return (u && u.data && u.data.biz) || null; }
  function statusOf(u, id) { return u && DD.Act ? A().getStatus(u, id) : null; }
  /** The status instance st sits on unit u (status hooks fire for an attacker's and a mover's sources alike). */
  function holds(u, st) { return !!u && !!st && Array.isArray(u.statuses) && u.statuses.indexOf(st) >= 0; }
  /** A hit of its own skill on a foe; attacks of opportunity go through modifyOpportunity (Valdris's split). */
  function skillHit(d) {
    return !!d && d.cause === 'skill' && !d.opportunity && !!d.source && !!d.target && d.target !== d.source && G().hostile(d.source, d.target);
  }
  /** AutoPlay's shared heal price (DD.AutoPlay.healWorth, E2), with the same formula as a fallback. */
  function healWorth(u, n) {
    if (DD.AutoPlay && typeof DD.AutoPlay.healWorth === 'function') return DD.AutoPlay.healWorth(u, n);
    n = Number(n);
    if (!active(u) || !(n > 0)) return 0;
    const miss = (u.maxHp || 0) - (u.hp || 0);
    return miss > 0 ? Math.min(n, miss) * (miss > u.maxHp / 2 ? 1.5 : 0.8) : 0;
  }
  /** A free tile that is safe to stand on for u (no drop unless it flies, no damaging hazard). */
  function safeFree(x, y, u) {
    return G().isFree(x, y, u || undefined) && ((u && G().isFlying(u)) || !G().isDrop(x, y)) && !G().hazardAt(x, y, u || null);
  }
  /** Tiles within r (Manhattan) of p, nearest first, then top-left first. */
  function around(p, r, self) {
    const out = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > r || (!d && !self)) continue;
        if (G().inBounds(p.x + dx, p.y + dy)) out.push({ x: p.x + dx, y: p.y + dy, d: d });
      }
    }
    return out.sort(function (a, b) { return a.d - b.d || byPos(a, b); });
  }
  function rngLine(lines) { return DD.util.line(lines, DD.rng); }

  // ---- constructs ---------------------------------------------------------------------------------------------
  /** 'hjalmarino' | 'spooder' | null, by def (generic suites summon the defs bare: never read c.data.biz alone). */
  function kindOf(c) { return c && c.defId === HJ ? 'hjalmarino' : c && c.defId === SP ? 'spooder' : null; }
  function bizLevel(u) { return u && u.level > 0 ? Math.floor(u.level) : 1; }
  function mkOf(owner) { const L = bizLevel(owner); return L >= MK_AT[1] ? 3 : L >= MK_AT[0] ? 2 : 1; }
  function hpOf(owner, kind) { const K = KINDS[kind]; return K.base + K.per * bizLevel(owner); }
  function isMine(owner, c) { return !!owner && !!c && !!kindOf(c) && c.ownerId === owner.id; }
  /** His living constructs, in unit order. */
  function constructsOf(owner) {
    const s = S();
    if (!s || !owner) return [];
    return s.units.filter(function (c) { return active(c) && isMine(owner, c); });
  }
  function constructOf(owner, kind) { return constructsOf(owner).filter(function (c) { return kindOf(c) === kind; })[0] || null; }
  /** Not stunned, asleep, frozen or a sheep: it can act. */
  function able(c) { return active(c) && !A().isStunned(c) && !A().hasStatus(c, 'sheep'); }
  function flatOf(st) { return (st && st.data && st.data.flat) || 1; }
  function updatedFlat(c) { const st = statusOf(c, UPDATED); return st ? flatOf(st) : 0; }
  function foesNextTo(c) {
    if (!c || !DD.Combat) return [];
    return DD.Combat.foesOf(c).filter(function (f) { return active(f) && dist(f, c) === 1; }).sort(byPos);
  }
  function constructsNextTo(f, owner) { return f ? constructsOf(owner).filter(function (c) { return dist(c, f) === 1; }).length : 0; }

  /**
   * Build one construct for owner on (x, y): the model for his level now (Mk I / II / III: skill levels, title "Mk II", look),
   * HP base + per × his level (opts.frac < 1: a NEW unit made with less HP, e.g. a timed reboot; never Act.heal).
   * opts: ready (AP now during his turn), noFx, frac. Returns the unit or null.
   */
  function build(owner, kind, x, y, opts) {
    opts = opts || {};
    const K = KINDS[kind], mk = mkOf(owner);
    const c = A().summon(owner, K.id, x, y, { level: mk, hpMult: hpOf(owner, kind) / K.defHp, name: K.name,
      ready: !!opts.ready, noFx: !!opts.noFx, silent: true });
    if (!c) return null;
    if (opts.frac && opts.frac < 1) c.hp = Math.max(1, Math.ceil(c.maxHp * opts.frac - 1e-9));   // 1 / 3 of 18 is 6, never 7
    // the card's badge (where a hero's says "Lv 3"): just the model, so the HUD card keeps room for the name
    // ("Mechanical Monkey Mk I" cut Hjalmarino to "HJA…" at 1280×720 and "H" at 1024×640, review:biz)
    c.title = 'Mk ' + ROMAN[mk];
    c.sprite = (kind === 'hjalmarino' ? MONKEY_LOOKS : SPIDER_LOOKS)[mk - 1];
    c.data = c.data || {};
    c.data.biz = { kind: kind, mk: mk };
    A().touch();
    return c;
  }
  function namesOf(list) { return list.length === 2 ? list[0].name + ' and ' + list[1].name : list.map(function (c) { return c.name; }).join(', '); }

  /**
   * Batteries Included: both constructs at combat start in the deploy zone, within 2 of him when the zone has room there
   * (Ellaria's startingCorgi), else on the zone's free tile nearest him; never doubled. review:biz (h19): a boss map's zone
   * is a strip, and with only the tiles within 2 Spooder landed outside it at every Grimble / Rat King start, where
   * deployment can't move it (Combat.deployMove needs the mover in the zone).
   */
  function startingBots(u) {
    const s = S();
    if (!s || !active(u)) return;
    const zone = s.deploy && s.deploy.active ? s.deploy.tiles : [];
    const inZone = function (p) { return zone.some(function (z) { return z.x === p.x && z.y === p.y; }) ? 1 : 0; };
    const foes = DD.Combat.foesOf(u);
    const near = function (p) { let d = 99; foes.forEach(function (f) { d = Math.min(d, dist(f, p)); }); return d; };
    const beyond = function (p) { return Math.max(0, dist(p, u) - 2); };
    const made = [];
    ORDER.forEach(function (kind) {
      if (constructOf(u, kind)) return;
      const seen = {};
      const spots = G().emptyTilesNear(u.x, u.y, 2).concat(zone).filter(function (p) {
        const k = p.x + ',' + p.y;
        if (seen[k]) return false;
        seen[k] = 1;
        return (p.x !== u.x || p.y !== u.y) && G().isFree(p.x, p.y) && !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y, null);
      });
      if (!spots.length) { A().log('No room to unpack ' + KINDS[kind].name + '. It stays in the box.', 'hero'); return; }
      spots.sort(kind === 'hjalmarino' ? function (a, b) {
        return inZone(b) - inZone(a) || beyond(a) - beyond(b) || near(a) - near(b) || dist(a, u) - dist(b, u) || byPos(a, b);
      } : function (a, b) {
        return inZone(b) - inZone(a) || beyond(a) - beyond(b) || (dist(a, u) === 1 ? 0 : 1) - (dist(b, u) === 1 ? 0 : 1) || near(b) - near(a) || byPos(a, b);
      });
      const c = build(u, kind, spots[0].x, spots[0].y, { noFx: true, ready: true });
      if (c) made.push(c);
    });
    if (made.length) A().log(u.name + ' unpacks ' + namesOf(made) + ' (Mk ' + ROMAN[mkOf(u)] + '). Some assembly required.', 'hero');
  }

  // ---- scrap, the Scrap Heap and the timed reboot ---------------------------------------------------------------
  /** A heap may lie here: a floor tile with no object on it (never over a trap, parcel, crate, lever or another heap). */
  function heapOk(x, y) {
    const t = G().tile(x, y);
    if (!t || t.obj) return false;
    const td = G().terrain(t);
    return !td.pit && !td.liquid && td.walkable !== false && G().isWalkable(x, y, null);
  }
  /** The tile itself if a heap may lie there, else the nearest such tile within 3, else null. */
  function heapSpot(x, y) {
    const q = around({ x: x, y: y }, 3, true).filter(function (p) { return heapOk(p.x, p.y); })[0];
    return q ? { x: q.x, y: q.y } : null;
  }
  function isHeap(o, owner, kind) { return !!o && o.id === SCRAP && !!o.data && o.data.owner === owner.id && (!kind || o.data.kind === kind); }
  /** The heap object of his scrapped kind (null when it has none or other content replaced it). */
  function heapObj(owner, kind) {
    const D = peek(owner), rec = D && D.scrap[kind];
    if (!rec || !rec.at) return null;
    const t = G().tile(rec.at.x, rec.at.y);
    return t && isHeap(t.obj, owner, kind) ? t.obj : null;
  }
  /** [QA QA-BIZ-1] The heap's hover name (the tile inspect prints obj.label): which robot, and how many of his turns. */
  function heapLabel(owner, kind, left) {
    const who = owner.name + '\'s';
    const when = left > 1 ? 'reboots in ' + left + ' of ' + who + ' turns' : left === 1 ? 'reboots at the start of ' + who + ' next turn' :
      'reboots as soon as there is room';
    return KINDS[kind].name + '\'s Scrap Heap (' + when + ')';
  }
  function placeHeap(owner, kind, at, left) {
    if (at) A().placeObject(at.x, at.y, SCRAP, { label: heapLabel(owner, kind, left), data: { owner: owner.id, kind: kind, left: left } });
  }
  /** The record's countdown changed: the heap's painted digit and its label follow. */
  function setHeapLeft(owner, kind, left) {
    const h = heapObj(owner, kind);
    if (!h) return;
    h.data.left = left;
    h.label = heapLabel(owner, kind, left);
  }
  /** His scrapped kinds, in the order they were scrapped. */
  function pending(D) {
    if (!D) return [];
    return ORDER.filter(function (k) { return !!D.scrap[k]; }).sort(function (a, b) { return D.scrap[a].order - D.scrap[b].order; });
  }

  /**
   * One of his constructs died (its def's onDeath, so it also runs while he is downed): a Scrap Heap where it fell (or
   * on the nearest floor within 3), the timer (SCRAP_TURNS of his turns; 1 for a kind's first scrap with the Extended Warranty).
   */
  function scrapped(c) {
    const s = S();
    if (!s || s.result || !c) return;
    const owner = byId(c.ownerId);
    const kind = kindOf(c);
    if (!owner || owner.dead || owner.defId !== HERO || !kind) return;
    const D = dataOf(owner), K = KINDS[kind];
    const first = wears(owner, WARRANTY) && !D.claimed[kind];
    if (first) D.claimed[kind] = true;
    const left = first ? 1 : SCRAP_TURNS;
    // one heap per kind: a second robot of a kind (built by other content while the first one's record waited) replaces
    // the old heap, so it can fall on that tile too (it used to land on the nearest free floor, a blown barrel's hole)
    if (heapObj(owner, kind)) A().removeObject(D.scrap[kind].at.x, D.scrap[kind].at.y);
    const at = heapSpot(c.x, c.y);
    D.seq++;
    D.scrap[kind] = { left: left, at: at, order: D.seq };
    placeHeap(owner, kind, at, left);
    A().touch();
    const boom = !!(c.data && c.data.biz && c.data.biz.boom);
    const spot = at || { x: c.x, y: c.y };
    DD.FX.particles(spot, { kind: 'sparks', count: 14, color: K.color });
    DD.FX.particles(spot, { kind: 'smoke', count: 6, parallel: true });
    DD.FX.text(spot, '🔩 SCRAP!', { color: '#d8dde4', size: 16 });
    DD.FX.sound('bump');
    DD.FX.sound('clockwork');
    A().log((boom ? owner.name + ' presses the big red button. ' + K.name + ' goes KABOOM.' : K.name + ' is scrap!') +
      (first ? '' : ' It reboots in ' + left + ' of ' + owner.name + '\'s turns.'), 'hero');
    if (first) A().log('📜 Extended Warranty: ' + K.name + ' reboots next turn, free of charge.', 'hero');
    if (active(owner)) {
      if (first) A().bark(owner, 'warranty');
      else if (!boom) A().bark(owner, 'scrap_' + kind);
    }
    syncChip(owner);
  }

  /**
   * His turn start (only while he is active): each scrapped kind counts down; at 0 it reboots (REBOOT_FRAC of its HP)
   * and spends this turn booting up (fix:balance B2: it used to act at once).
   */
  function tickScrap(u) {
    const D = peek(u);
    pending(D).forEach(function (kind) {
      const rec = D.scrap[kind];
      if (!rec) return;
      rec.left = Math.max(0, rec.left - 1);
      setHeapLeft(u, kind, rec.left);
      A().touch();
      if (rec.left <= 0) reboot(u, kind, { frac: REBOOT_FRAC, ready: false, cause: 'timer' });
    });
  }
  /**
   * fix:balance B2 (Nov 21): a robot that comes back (the timer, Turn It Off and On Again, Spoodmarino!) can't be
   * overclocked on the turn it came back (c.data.biz.back, the truth) and, unless it was built ready (Turn It Off and On
   * Again III: "It acts at once"), has no AP that turn: it is booting up. The ⏳ chip shows it (display; gone at his turn end).
   */
  function bootUp(u, c, ready) {
    const s = S();
    c.data.biz.back = s ? s.turn : -1;
    const st = A().addStatus(c, BOOT, { turns: 1, silent: true }, u);
    if (st) { st.data = st.data || {}; st.data.ready = !!ready; }
  }
  /** It came back this turn (no Overclock on it until his next turn). */
  function justBack(c) { const s = S(); return !!s && !!c && !!c.data && !!c.data.biz && c.data.biz.back === s.turn; }
  /** Where a scrapped kind reboots: its heap tile if free and safe, else the nearest within 3; heap-less: next to him (then within 2). */
  function rebootSpot(u, rec, taken) {
    const ok = function (p) { return safeFree(p.x, p.y, null) && !(taken && taken[p.x + ',' + p.y]); };
    const q = (rec.at ? around(rec.at, 3, true) : around(u, 2, false)).filter(ok)[0];
    return q ? { x: q.x, y: q.y } : null;
  }
  /** A scrapped kind is back (or never needed rebuilding): the record and its heap go. */
  function clearRec(u, kind) {
    const D = peek(u), rec = D && D.scrap[kind];
    if (!rec) return;
    if (heapObj(u, kind)) A().removeObject(rec.at.x, rec.at.y);
    D.scrap[kind] = null;
    A().touch();
    syncChip(u);
  }
  /**
   * Rebuild a scrapped kind (the timer, Turn It Off and On Again, Spoodmarino!): a NEW unit, the model for his level now
   * (an Update is lost: factory settings), opts.frac of its max HP. opts: frac, ready, cause 'timer' | 'skill' |
   * 'signature'. Returns the construct or null (no room: the record stays at 0 and is retried at his next turn start).
   */
  function reboot(u, kind, opts) {
    opts = opts || {};
    const D = peek(u), rec = D && D.scrap[kind], K = KINDS[kind];
    if (!rec || !K) return null;
    const live = constructOf(u, kind);
    if (live) { clearRec(u, kind); return live; }   // other content made one meanwhile: never doubled
    const spot = rebootSpot(u, rec);
    if (!spot) {
      rec.left = 0;
      setHeapLeft(u, kind, 0);
      A().log('No room to reboot ' + K.name + '. ' + u.name + ' needs a bigger garage.', 'hero');
      return null;
    }
    const from = rec.at;
    const c = build(u, kind, spot.x, spot.y, { frac: opts.frac === undefined ? 1 : opts.frac, ready: !!opts.ready });
    if (!c) return null;
    bootUp(u, c, !!opts.ready);
    clearRec(u, kind);
    if (from && (from.x !== spot.x || from.y !== spot.y)) {
      DD.FX.projectile(from, spot, { kind: 'bone', color: BRASS });
      DD.FX.projectile(from, spot, { kind: 'bone', color: BRASS, parallel: true });
    }
    DD.FX.particles(c, { kind: 'sparks', count: 16, color: GOLD });
    DD.FX.text(c, '🔌 Rebooted!', { color: CYAN, size: 15 });
    DD.FX.sound('clockwork');
    if (opts.cause === 'timer') A().log(u.name + ' reboots ' + K.name + ' from the scrap (' + REBOOT_SHARE + '). It is booting up.', 'hero');
    else if (opts.cause === 'skill') A().log(u.name + ' turns ' + K.name + ' off and on again. It works!', 'hero');
    if (opts.cause !== 'signature' && active(u)) A().bark(u, 'reboot');
    return c;
  }
  /** The scrapped kind whose heap lies on p (Turn It Off and On Again's click target), or null. Reads the records. */
  function kindAtHeap(u, p) {
    const D = peek(u);
    if (!D || !p) return null;
    for (let i = 0; i < ORDER.length; i++) {
      const rec = D.scrap[ORDER[i]];
      if (rec && rec.at && rec.at.x === p.x && rec.at.y === p.y) return ORDER[i];
    }
    return null;
  }
  /** His turn start: a heap other content replaced is re-placed on the nearest free floor (the record follows it). */
  function syncHeaps(u) {
    const D = peek(u);
    pending(D).forEach(function (kind) {
      const rec = D.scrap[kind];
      if (!rec || !rec.at || heapObj(u, kind)) return;
      rec.at = heapSpot(rec.at.x, rec.at.y);
      placeHeap(u, kind, rec.at, rec.left);
      A().touch();
    });
  }
  /** The 🔧 chip on him (display only): the soonest reboot as its number, every scrapped kind in its tooltip. */
  function syncChip(u) {
    if (!active(u)) return;
    const D = peek(u);
    const list = pending(D).map(function (k) { return { name: KINDS[k].name, left: D.scrap[k].left }; });
    const st = statusOf(u, REBUILD);
    if (!list.length) { if (st) A().removeStatus(u, REBUILD, { silent: true }); return; }
    const turns = Math.max(1, Math.min.apply(null, list.map(function (e) { return e.left; })));
    const inst = st || A().addStatus(u, REBUILD, { turns: turns, silent: true }, u);
    if (!inst) return;
    const was = JSON.stringify([inst.turns, inst.data && inst.data.list]);
    inst.turns = turns;
    inst.data = inst.data || {};
    inst.data.list = list;
    if (was !== JSON.stringify([inst.turns, inst.data.list])) A().touch();
  }

  // ---- commands ------------------------------------------------------------------------------------------------
  /**
   * The bask (passive onTurnEnd; D9 / Nov 18: his ONE heal): he ends the turn next to (the 4 orthogonal neighbours) the
   * construct he overclocked this turn and heals its st.data.bask, once a turn (two overclocked robots, an echo), only
   * while he stands (never a revive), whatever his HP (no threshold). At full HP the call heals 0 and logs nothing.
   */
  function bask(u) {
    if (!active(u)) return;
    const s = S(), D = dataOf(u);
    if (!s || D.basked === s.turn) return;
    let n = 0, src = null;
    constructsOf(u).forEach(function (c) {
      const st = statusOf(c, OVER);
      if (st && st.data && st.data.src === u.id && dist(c, u) === 1 && (st.data.bask || 0) > n) { n = st.data.bask; src = c; }
    });
    if (!n) return;
    D.basked = s.turn;
    if (A().heal(u, u, n, { via: 'lift:biz' }) > 0) {
      DD.FX.text(u, '♨️ Toasty!', { color: '#ff9d5c', size: 14 });
      DD.FX.particles(u, { kind: 'smoke', count: 6, color: '#ffd9b0' });
      A().log(u.name + ' basks on ' + src.name + '\'s hot engine.', 'hero');
      A().maybeBark(u, 'bask', 0.5);
    }
  }
  function peekBasked(u) { const D = peek(u), s = S(); return !!D && !!s && D.basked === s.turn; }

  /**
   * The Hjalmar "tin double" gag (cosmetic): at his first turn start of a fight, with Hjalmar and Hjalmarino both up, a
   * 50% roll of the cosmetic RNG (never state.rng, never while simulating): Hjalmar objects, the monkey laughs, Biz explains.
   */
  function tinDouble(u) {
    if (A().simulating) return;
    const D = dataOf(u), s = S();
    if (D.tin || !s) return;
    D.tin = true;
    const hj = s.units.filter(function (x) { return x.kind === 'hero' && x.defId === 'hjalmar' && active(x); })[0];
    const mk = constructOf(u, 'hjalmarino');
    if (!hj || !mk || DD.rng.next() >= 0.5) return;
    const line = rngLine(TIN_LINES);
    // [QA voice-5] "Why is it laughing like me?!" needs a laugh first: the monkey laughs, then Hjalmar objects
    if (line === TIN_LAUGHED) { A().bark(mk, TIN_LAUGH); A().bark(hj, line); } else { A().bark(hj, line); A().bark(mk, 'spawn'); }
    A().bark(u, 'tin_double');
  }

  /**
   * The Big Red Button: the construct (still the damage source) deals boom to each adjacent foe, then is killed by its own
   * hand (no kill credit for anyone) and scrapped as usual; Act.kill's own damage stat for it is taken back (request R1's
   * fallback: the self-destruct books no damage).
   */
  function selfDestruct(u, c, L, def) {
    if (!active(c)) return;
    DD.FX.text(c, '3... 2... 1...', { color: '#ff5a3d', size: 15 });
    DD.FX.sound('clockwork');
    DD.FX.explosion(c, { radius: 1, color: '#ff8a3d' });
    DD.FX.flash('#ff5a3c', 120);
    DD.FX.shake(7, 300);
    DD.FX.sound('explosion');
    foesNextTo(c).forEach(function (f) {
      if (active(f) && active(c)) A().damage(c, f, L.boom, { cause: 'skill', skill: def, tags: ['explosion', 'construct'] });
    });
    if (active(c)) {
      c.data = c.data || {};
      c.data.biz = Object.assign({}, c.data.biz, { boom: true });
      const hp0 = c.hp;
      if (A().kill(c, c, { cause: 'other', force: true, text: 'KABOOM!' })) {
        const st = A().statOf(c);
        if (st) st.dmg = Math.max(0, st.dmg - hp0);
      }
    }
    if (active(u)) A().bark(u, 'boom');
  }
  /**
   * Where each scrapped kind would reboot right now, in reboot order (each spot is taken before the next is chosen, as
   * the sequential reboots in Spoodmarino!'s execute take them). Pure: it only reads the board and his records.
   */
  function rebootSpots(u) {
    const D = peek(u), taken = {}, out = [];
    pending(D).forEach(function (k) {
      const rec = D.scrap[k];
      if (!rec || constructOf(u, k)) return;
      const p = rebootSpot(u, rec, taken);
      if (p) { taken[p.x + ',' + p.y] = 1; out.push(p); }
    });
    return out;
  }
  /**
   * Spoodmarino!'s highlight: tiles within 2 of each living construct and of the tile each scrapped one will reboot on
   * ([QA QA-BIZ-3] its heap when free, else where rebootSpot puts it; a heap-less one next to Biz).
   */
  function comboArea(ctx) {
    const u = ctx && ctx.user;
    if (!u) return [];
    const centres = constructsOf(u).map(function (c) { return { x: c.x, y: c.y }; }).concat(rebootSpots(u));
    const seen = {}, out = [];
    centres.forEach(function (p) {
      around(p, 2, true).forEach(function (q) { const k = q.x + ',' + q.y; if (!seen[k]) { seen[k] = 1; out.push({ x: q.x, y: q.y }); } });
    });
    return out;
  }
  function anyBotOrHeap(u) { return constructsOf(u).length > 0 || pending(peek(u)).length > 0; }
  /** World Wide Web's area: tiles within L.r of an able Spooder that hold no friend. */
  function webArea(ctx) {
    const u = ctx && ctx.user, L = (ctx && ctx.L) || {};
    const sp = u ? constructOf(u, 'spooder') : null;
    if (!sp || !able(sp)) return [];
    return around(sp, L.r || 1, false).filter(function (p) {
      const o = G().unitAt(p.x, p.y);
      return !o || G().hostile(u, o);
    }).map(function (p) { return { x: p.x, y: p.y }; });
  }
  /** Zip Line's landing: a free safe tile next to Spooder, nearest to the reeled unit's tile, then top-left. */
  function zipSpot(sp, t) {
    if (!sp || !t) return null;
    const out = [];
    DD.util.DIRS.forEach(function (d) {
      const q = { x: sp.x + d.x, y: sp.y + d.y };
      if ((q.x !== t.x || q.y !== t.y) && safeFree(q.x, q.y, t)) out.push(q);
    });
    out.sort(function (a, b) { return dist(a, t) - dist(b, t) || byPos(a, b); });
    return out[0] || null;
  }
  /** The Spare Tail's scurry: a free safe tile within 3 with the fewest foes next to it, then the farthest from foes, then near a construct. */
  function tailSpot(u) {
    const foes = DD.Combat.foesOf(u), bots = constructsOf(u);
    const adj = function (p) { return foes.filter(function (f) { return dist(f, p) === 1; }).length; };
    const near = function (p) { let d = 99; foes.forEach(function (f) { d = Math.min(d, dist(f, p)); }); return d; };
    const botD = function (p) { let d = 99; bots.forEach(function (c) { d = Math.min(d, dist(c, p)); }); return d; };
    const spots = around(u, 3, false).filter(function (p) { return safeFree(p.x, p.y, u); });
    spots.sort(function (a, b) { return adj(a) - adj(b) || near(b) - near(a) || botD(a) - botD(b) || byPos(a, b); });
    return spots[0] || null;
  }

  // ---- AutoPlay hooks (pure; content side only: no engine change) -------------------------------------------------
  /** Best damage c can deal with `ap` AP this turn (its Updated flat included); 0 when no foe is in reach. */
  function bestHit(c, ap) {
    if (!able(c) || !(ap > 0) || !DD.Combat) return 0;
    const foes = DD.Combat.foesOf(c).filter(active);
    if (!foes.length) return 0;
    let nearest = 99;
    foes.forEach(function (f) { nearest = Math.min(nearest, dist(f, c)); });
    const flat = updatedFlat(c), stepAp = DD.Combat.moveApCost ? DD.Combat.moveApCost(c) : 1;
    const rooted = !!(A().cantMove && A().cantMove(c));
    let best = 0;
    DD.Combat.slotsOf(c).forEach(function (sl) {
      const d = DD.getSkill(sl.id);
      const L = d && DD.skillLevel(d, sl.level || 1);
      if (!L || !(L.dmg > 0) || (sl.cd || 0) > 0) return;
      const cost = Math.max(1, Math.round(+DD.resolve(d.ap, L, c, 1)) || 1);
      const r = DD.Targeting.range(c, d, sl.level || 1)[1];
      let left = ap;
      if (nearest > r) {
        if (rooted || nearest - r > (c.mov || 0) || left < stepAp + cost) return;
        left -= stepAp;
      }
      best = Math.max(best, Math.floor(left / cost) * (L.dmg + flat));
    });
    return best;
  }
  /** He can end this turn next to c: already there, or a free tile next to c within his move and AP for the walk + the skill. */
  function canEndNextTo(u, c) {
    if (!active(u) || !active(c)) return false;
    if (dist(u, c) === 1) return true;
    if ((u.ap || 0) < 2 || (A().cantMove && A().cantMove(u))) return false;
    return DD.util.DIRS.some(function (d) {
      const q = { x: c.x + d.x, y: c.y + d.y };
      return G().isFree(q.x, q.y, u) && dist(u, q) <= (u.mov || 0);
    });
  }
  /** c can hit a foe from the tile it stands on (or can't walk): it will likely still be there at his turn end. */
  function staysPut(c) {
    if (!able(c) || !DD.Combat) return false;
    if (A().cantMove && A().cantMove(c)) return true;
    let nearest = 99;
    DD.Combat.foesOf(c).forEach(function (f) { if (active(f)) nearest = Math.min(nearest, dist(f, c)); });
    return DD.Combat.slotsOf(c).some(function (sl) {
      const d = DD.getSkill(sl.id), L = d && DD.skillLevel(d, sl.level || 1);
      return !!L && L.dmg > 0 && DD.Targeting.range(c, d, sl.level || 1)[1] >= nearest;
    });
  }
  /**
   * Overclock's aiScore: the hits the AP buy (the dry run already pays 2 per AP given) plus the bask it sets up. The robots
   * act again after him (AutoPlay plays summons first each pass), so the bask counts in full only for a robot next to
   * him that can hit from where it stands; a robot that has to walk to a foe will likely leave (sanity sim 81000, T8n).
   */
  function overclockScore(ctx) {
    const u = ctx && ctx.user, c = ctx && ctx.targetUnit, L = (ctx && ctx.L) || {};
    if (!u || !isMine(u, c) || !able(c)) return 0;
    const g = (L.ap || OC_AP) + (wears(u, REMOTE) ? 1 : 0);
    const hit = bestHit(c, (c.ap || 0) + g);
    const hits = hit > 0 ? 0.5 * g * hit : 0.5;
    const stays = staysPut(c);
    const near = dist(u, c) === 1 ? (stays ? 1.5 : 0.4) : canEndNextTo(u, c) ? (stays ? 0.5 : 0.2) : 0;
    const warm = peekBasked(u) ? 0 : near * healWorth(u, L.bask);
    return hits + warm;
  }
  /**
   * fix:balance B1 (Nov 21): the robot's side of the bask, its attacks' aiScore. A hot robot acts again after Biz has
   * chosen his tile (summons first, then him, then the AP Overclock gave it), and a quarter of his hurt Overclock turns
   * lost the bask because it then walked off. Attacking from a tile next to him (ctx.user stands on the tile it would
   * attack from) is worth his bask: in full once he can't move any more, a third while he can still come over. Pure.
   */
  function warmScore(ctx) {
    const c = ctx && ctx.user, st = c ? statusOf(c, OVER) : null;
    if (!st || !st.data) return 0;
    const u = byId(st.data.src);
    if (!active(u) || !isMine(u, c) || peekBasked(u) || dist(c, u) !== 1) return 0;
    const stuck = (u.ap || 0) < (DD.Combat.moveApCost ? DD.Combat.moveApCost(u) : 1) || !!(A().cantMove && A().cantMove(u));
    return (stuck ? 1 : 1 / 3) * healWorth(u, st.data.bask);
  }
  /** passive.autoplayEnd (E1, the T8 lesson): what ending his turn on (x, y) is worth for the bask. */
  function baskEnd(unit, x, y) {
    if (!unit || peekBasked(unit)) return 0;
    let best = 0;
    constructsOf(unit).forEach(function (c) {
      const st = statusOf(c, OVER);
      if (st && st.data && st.data.src === unit.id && Math.abs(c.x - x) + Math.abs(c.y - y) === 1) best = Math.max(best, healWorth(unit, st.data.bask));
    });
    return best;
  }
  /**
   * passive.turnEndNote (the HUD's end-of-turn cue, h19 QA-BIZ-4; pure): what the bask makes of his turn ending on (x, y),
   * read like bask() — the robot he overclocked this turn, orthogonally next to (x, y), the bigger number first. `moved`
   * = { unit, x, y }: a robot of his hovering a move counts as standing on (moved.x, moved.y). '' with no hot robot of his
   * (or once he has basked this turn). The HP is what the heal would restore now (capped at his max HP).
   */
  function baskNote(unit, x, y, moved) {
    if (!active(unit) || peekBasked(unit)) return '';
    const hot = [];
    let n = 0, src = null;
    constructsOf(unit).forEach(function (c) {
      const st = statusOf(c, OVER);
      if (!st || !st.data || st.data.src !== unit.id) return;
      hot.push(c);
      const p = moved && moved.unit === c ? moved : c;
      if (Math.abs(p.x - x) + Math.abs(p.y - y) === 1 && (st.data.bask || 0) > n) { n = st.data.bask; src = c; }
    });
    if (!hot.length) return '';
    if (!src) return '♨️ ' + unit.name + ' won\'t bask here: not next to ' + hot.map(function (c) { return c.name; }).join(' or ');
    const gain = Math.min(n, Math.max(0, (unit.maxHp || 0) - (unit.hp || 0)));
    return '♨️ ' + unit.name + ' basks on ' + src.name + '\'s hot engine: ' + (gain > 0 ? '+' + gain + ' HP' : 'nothing to heal (full HP)');
  }
  /**
   * The Big Red Button's autoplayValue: the exact pass prices his own construct's death as an ally KO (40 + 1.5 × its HP),
   * which it undoes, then charges the real loss (its next turns: it reboots SCRAP_TURNS of his turns later); the quick pass gets
   * the blast's damage. −20 with fewer than 2 foes next to it and no kill.
   */
  function boomValue(ctx) {
    const u = ctx && ctx.user, c = ctx && ctx.targetUnit, L = (ctx && ctx.L) || {};
    if (!u || !isMine(u, c) || !active(c)) return 0;
    const boom = L.boom || 0;
    const adj = foesNextTo(c), kills = adj.filter(function (f) { return f.hp + (f.block || 0) <= boom; }).length;
    const loss = 4 + 0.3 * c.hp + 2 * bestHit(c, c.maxAp || 2);
    if (adj.length < 2 && !kills) return -20;
    if (ctx.autoplay) return 40 + 1.5 * c.hp - loss;
    return adj.reduce(function (v, f) { return v + Math.min(boom, f.hp + (f.block || 0)); }, 0) + 10 * kills - loss;
  }
  function incomingDmg(t, x, y) {
    if (!t || !DD.AutoPlay || typeof DD.AutoPlay.incomingAt !== 'function') return 0;
    const r = DD.safe('biz incomingAt', DD.AutoPlay.incomingAt, DD.AutoPlay, [t, x, y]);
    return r && isFinite(r.dmg) ? r.dmg : 0;
  }
  /** World Wide Web's aiScore: 1.2 a foe in the area that is not Rooted and not root-proof. */
  function webScore(ctx) {
    const foes = (ctx && ctx.foes) || [];
    return 1.2 * foes.filter(function (f) { return active(f) && !A().hasStatus(f, 'root') && !A().immuneTo(f, 'root'); }).length;
  }
  /** Zip Line's aiScore: the danger it takes the reeled unit out of, the bask it sets up for him, minus a brawler pulled back. */
  function zipScore(ctx) {
    const u = ctx && ctx.user, t = ctx && ctx.targetUnit;
    const sp = u ? constructOf(u, 'spooder') : null;
    if (!u || !t || !sp || t === sp) return 0;
    const land = zipSpot(sp, t);
    if (!land) return 0;
    let v = Math.max(0, incomingDmg(t, t.x, t.y) - incomingDmg(t, land.x, land.y)) * (t === u ? 1 : 0.8);
    if (t === u && !peekBasked(u)) {
      constructsOf(u).forEach(function (c) {
        const st = statusOf(c, OVER);
        if (st && st.data && st.data.src === u.id && dist(c, land) === 1) v += healWorth(u, st.data.bask);
      });
    }
    const basic = t.basic && DD.getSkill(t.basic.id);
    if (basic && (basic.tags || []).indexOf('melee') >= 0 && DD.Combat) {
      const near = function (p) { let d = 99; DD.Combat.foesOf(t).forEach(function (f) { d = Math.min(d, dist(f, p)); }); return d; };
      if (near(land) > near(t)) v -= 2;
    }
    return v;
  }
  /** Nothing to See Here's aiScore: 0 when already Stealthed, else 0.6 × the hit it dodges (at most his HP). */
  function hideScore(ctx) {
    const u = ctx && ctx.user;
    if (!u || A().hasStatus(u, 'stealth')) return 0;
    return 0.6 * Math.min(u.hp || 0, incomingDmg(u, u.x, u.y));
  }
  /** Duct Tape's aiScore: the Block it will likely spend (a construct's a little less, his own more). */
  function tapeScore(ctx) {
    const u = ctx && ctx.user, t = ctx && ctx.targetUnit, L = (ctx && ctx.L) || {};
    if (!u || !t || (t !== u && !isMine(u, t))) return 0;
    return Math.min(L.block || 0, incomingDmg(t, t.x, t.y)) * (t === u ? 1.2 : 0.8);
  }
  /** Firmware Update's aiScore: ~2 hits a turn over the rest of the fight (0 when already Updated). */
  function firmwareScore(ctx) {
    const u = ctx && ctx.user, c = ctx && ctx.targetUnit, L = (ctx && ctx.L) || {};
    if (!u || !isMine(u, c) || statusOf(c, UPDATED)) return 0;
    const foes = DD.Combat ? DD.Combat.foesOf(u).filter(active).length : 0;
    return (L.flat || 1) * 2 * Math.min(3, foes / 2);
  }
  /** Synergy's aiScore (the quick pass only; the exact pass dry-runs the real hit): + per × constructs next to the foe. */
  function synergyScore(ctx) {
    if (!ctx || ctx.autoplay) return 0;
    return ((ctx.L && ctx.L.per) || 0) * constructsNextTo(ctx.targetUnit, ctx.user);
  }

  // ---- sprites and painters (house style: chibi, bold outlines, cel shading, idle bob; rotation-safe) ---------------
  /** A status id in the painter's statuses (a Set of ids from the renderer) or on the unit. */
  function stHas(o, id) {
    const st = o && o.statuses;
    if (st) return st instanceof Set ? st.has(id) : Array.isArray(st) ? st.indexOf(id) >= 0 : !!st[id];
    return !!(o && o.unit && o.unit.statuses && A().hasStatus(o.unit, id));
  }
  /** A yellow / black hazard-tape band from (x1, y1) to (x2, y2). */
  function hazardTape(g, x1, y1, x2, y2, w) {
    g.line(x1, y1, x2, y2, '#1d1d1d', w + 0.8);
    g.line(x1, y1, x2, y2, '#f5d020', w);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.3) / n, b = (i + 0.6) / n;
      g.line(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b, '#1d1d1d', w);
    }
  }
  function steam(g, x, y, t, still) {
    for (let i = 0; i < 3; i++) {
      const ph = still ? i / 3 : (t * 0.9 + i / 3) % 1;
      g.circle(x + Math.sin(ph * 6 + i) * 1.4, y - ph * 8, 1 + ph * 1.6, 'rgba(240,240,240,' + (0.55 * (1 - ph)).toFixed(2) + ')', null);
    }
  }

  /** Biz: a chartreuse gecko in blueprint-blue coveralls (humanoid base, slim) + this overlay. */
  function bizOverlay(g, t, o) {
    if (!g || !g.head) return;
    o = o || {};
    const H = g.head, r = H.r, still = !!o.still, pose = g.pose;
    const hurt = pose === 'hurt', cast = pose === 'cast', atk = pose === 'attack', lying = (o.lying || 0) > 0.5;
    const shY = H.y + r * 0.8;
    // the remote-control backpack beyond his back edge, a blinking red LED on its antenna (radio arcs when he casts)
    const bx = -8.6, by = shY + 4.4;
    g.rect(bx - 2.2, by - 3.6, 4.4, 7.4, '#5a6470', g.outline, 1.2);
    g.rect(bx - 1.2, by - 1.8, 2.4, 1.6, '#2c3138', null, 0.4);
    g.line(bx - 0.6, by - 3.6, bx - 2.2, by - 12.2, '#2b2f36', 0.9);
    const led = still ? 1 : 0.5 + 0.5 * Math.sin(t * 4);
    g.glow(bx - 2.2, by - 12.6, 3.2, '#ff3b2f', 0.55 * led);
    g.circle(bx - 2.2, by - 12.6, 1.1, led > 0.5 ? '#ff3b2f' : '#8a1f1a', g.outline);
    if (cast) [3, 5, 7].forEach(function (rr, i) { g.arc(bx - 2.2, by - 12.6, rr, -2.3, -0.8, CYAN, 0.9 - i * 0.15); });
    // the pale belly stripe at the open collar
    g.ellipse(0.9, shY + 2.4, 1.9, 3, '#e3efb0', null);
    // a rolled blueprint at the back hand, a wrench in the front hand (a tiny rivet leaves it as he attacks)
    if (g.hands) {
      const b = g.hands.back, f = g.hands.front;
      g.rect(b.x - 1.4, b.y - 4.4, 2.8, 7.2, '#6aa8e8', g.outline, 1.2);
      g.line(b.x - 1.4, b.y - 2, b.x + 1.4, b.y - 2, 'rgba(255,255,255,0.8)', 0.4);
      g.line(b.x - 1.4, b.y + 0.6, b.x + 1.4, b.y + 0.6, 'rgba(255,255,255,0.8)', 0.4);
      g.line(b.x, b.y - 4.4, b.x, b.y + 2.8, 'rgba(255,255,255,0.6)', 0.4);
      const a = isFinite(f.angle) ? f.angle : Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
      const ex = f.x + dx * 6, ey = f.y + dy * 6;
      g.line(f.x, f.y, ex, ey, '#8b96a1', 1.6);
      g.circle(ex, ey, 1.7, '#b8c2cc', g.outline);
      g.circle(ex + dx * 0.6, ey + dy * 0.6, 0.8, '#4a5560', null);
      if (atk) {
        const p = typeof g.poseT === 'number' ? g.poseT : 0.5;
        g.circle(ex + dx * (2 + 6 * p) + 2 * p, ey + dy * (2 + 6 * p), 0.9, STEEL, g.outline);
      }
    }
    // the three-spine crest down the back of his head
    [[-0.5, -0.8, -2.2], [-0.82, -0.5, -2.6], [-0.98, -0.12, -3]].forEach(function (k) {
      const cx = H.x + k[0] * r, cy = H.y + k[1] * r, a = k[2];
      g.poly([[cx + Math.cos(a + 1.3) * 1.5, cy + Math.sin(a + 1.3) * 1.5], [cx + Math.cos(a) * 3, cy + Math.sin(a) * 3],
        [cx + Math.cos(a - 1.3) * 1.5, cy + Math.sin(a - 1.3) * 1.5]], '#5e8f2a', g.outline, 0.8);
    });
    // the long gecko snout (forward = +x), nostrils and a smile line; a forked-tongue flick now and then
    const fx = H.x + r * 0.35, fy = H.y + r * 0.2;
    g.shaded(function (p) {
      p.moveTo(fx - r * 0.1, fy - r * 0.42);
      p.quadraticCurveTo(fx + r * 0.9, fy - r * 0.44, fx + r * 1.05, fy - r * 0.05);
      p.quadraticCurveTo(fx + r * 1.0, fy + r * 0.36, fx + r * 0.2, fy + r * 0.38);
      p.closePath();
    }, '#8cc63f', { dx: 0.8, dy: -0.9, dark: '#5e8f2a' });
    g.circle(fx + r * 0.88, fy - r * 0.18, 0.5, '#2a3a14', null);
    g.line(fx + r * 0.3, fy + r * 0.12, fx + r * 0.86, fy + r * 0.08, '#2a3a14', 0.7);
    if (!still && t % 4 < 0.22 && !hurt) {
      const tx = fx + r * 1.05, ty = fy + r * 0.05;
      g.line(tx, ty, tx + 3.2, ty, '#ff7f9a', 0.8);
      g.line(tx + 3.2, ty, tx + 4.2, ty - 0.8, '#ff7f9a', 0.6);
      g.line(tx + 3.2, ty, tx + 4.2, ty + 0.8, '#ff7f9a', 0.6);
    }
    // big yellow eyes with slit pupils (they blink like everyone's); the goggles drop over them when he is hurt or down
    const ey = H.y - r * 0.12, ex = H.x + r * 0.3;
    const goggles = hurt || lying;
    if (!goggles) {
      if (g.blink) g.line(ex - r * 0.26, ey, ex + r * 0.26, ey, g.outline, 1);
      else {
        g.circle(ex, ey, r * 0.28, '#ffcf3a', g.outline);
        g.ellipse(ex + r * 0.06, ey, r * 0.07, r * 0.22, '#1a1410', null);
        g.circle(ex - r * 0.08, ey - r * 0.12, r * 0.07, '#ffffff', null);
      }
    }
    // brass goggles pushed up on the forehead (small lenses with a glint), a strap round the head; down over his eyes
    // when he is hurt or downed
    const gy = goggles ? ey : H.y - r * 0.74;
    const gx = goggles ? ex - r * 0.06 : H.x + r * 0.05, cr = goggles ? r * 0.24 : r * 0.15;
    g.line(H.x - r * 0.95, gy + 0.6, gx + cr, gy, '#5a3a1e', 1.2);
    [-cr * 1.1, cr * 1.1].forEach(function (dx) {
      const cx = gx + dx;
      g.circle(cx, gy, cr + 0.5, BRASS, g.outline);
      g.circle(cx, gy, Math.max(0.4, cr - 0.3), '#7fe3ff', null);
      g.circle(cx - cr * 0.3, gy - cr * 0.3, cr * 0.25, '#ffffff', null);
    });
  }
  const BIZ_SPRITE = { base: 'humanoid', scale: 1, build: 'slim', outfit: 'tunic',
    palette: { skin: '#8cc63f', cloth: '#2f6d9e', cloth2: '#c9a24a', hair: '#5e8f2a', metal: '#c9a24a', eye: '#ffcf3a',
      accent: '#e94f37', outline: '#16241a', leather: '#7a4f2a', belt: '#7a4f2a', tail: '#8cc63f', pants: '#2f6d9e', boots: '#4a3424' },
    head: { size: 1.05, ears: 'none', hair: 'none', beard: 'none', hat: 'none', face: 'none', eyes: 'none', mouth: 'none', horns: 'none' },
    tail: 'lizard', mainhand: 'none', offhand: 'none', extras: ['belt', 'pouches'], bling: [], aura: null, overlay: bizOverlay };

  /** Hjalmarino (this.mk = its model): a tin wind-up cymbal monkey in a teal knockoff fez. */
  function hjmOverlay(g, t, o) {
    if (!g || !g.head) return;
    o = o || {};
    const mk = (this && this.mk) || 1, H = g.head, r = H.r, still = !!o.still, pose = g.pose;
    const hot = stHas(o, OVER), upd = stHas(o, UPDATED), atk = pose === 'attack', hurt = pose === 'hurt';
    const shY = H.y + r * 0.8, step = still ? 0 : Math.floor(t * 3) % 2;
    // the wind-up key beyond the back edge (it spins three times faster while Overclocked)
    const kw = still ? 1 : Math.abs(Math.cos(t * (hot ? 9 : 3)));
    const ky = shY + 4.4;
    g.line(-4.4, ky, -6.6, ky, '#8d8f96', 1.2);
    const klw = g.lw;
    g.lw = Math.min(klw, 0.9);
    g.ellipse(-7.6, ky - 2.1, 0.5 + 1.7 * kw, 2, '#e3c25a', g.outline);
    g.ellipse(-7.6, ky + 2.1, 0.5 + 1.7 * kw, 2, '#e3c25a', g.outline);
    g.lw = klw;
    // the coiled-spring tail
    const tb = still ? 0 : Math.sin(t * 4) * 1.2;
    for (let i = 0; i < 4; i++) g.ellipse(-5.6 - i * 1.2, shY + 8.6 - i * 1.4 + tb * i / 4, 1.4, 0.75, null, '#9a9aa0');
    // Mk III: rocket heels
    if (mk >= 3) [-1.8, 1.8].forEach(function (x) { g.flame(x, 1.4, 1.8, 3 + (still ? 0 : Math.sin(t * 20 + x) * 0.8), '#ff8a3d', null); });
    // Overclocked: a red-hot torso and steam; Updated: a hazard-tape stripe and a glinting bolt
    if (hot) { g.glow(0.5, shY + 4, 6, '#ff5a28', 0.45); steam(g, -2, H.y - r, t, still); }
    if (upd) { hazardTape(g, -4, shY + 2.4, 4.4, shY + 5.6, 1.3); g.circle(3.6, shY + 1.6, 0.8, '#fff6a0', null); }
    // the painted tin face: Hjalmar's mask shape, a jaw seam and rivets, never-blinking eyes, a fixed toothy grin
    const fx = H.x + r * 0.24, FACE = '#f0dcb0';
    g.path(function (p) {
      p.moveTo(fx + r * 0.62, H.y - r * 0.06);
      p.ellipse(fx - r * 0.3, H.y - r * 0.06, r * 0.36, r * 0.4, 0, 0, Math.PI * 2);
      p.moveTo(fx + r * 0.66, H.y - r * 0.06);
      p.ellipse(fx + r * 0.3, H.y - r * 0.06, r * 0.36, r * 0.4, 0, 0, Math.PI * 2);
      p.moveTo(fx + r * 0.62, H.y + r * 0.4);
      p.ellipse(fx, H.y + r * 0.4, r * 0.62, r * 0.42, 0, 0, Math.PI * 2);
    }, FACE, null);
    g.line(fx - r * 0.5, H.y + r * 0.62, fx + r * 0.5, H.y + r * 0.62, 'rgba(90,60,30,0.6)', 0.6);
    [-0.45, 0, 0.45].forEach(function (k) { g.circle(fx + k * r, H.y + r * 0.74, 0.45, '#b08850', null); });
    const ey = H.y - r * 0.06, ex = r * 0.29, er = r * 0.17;
    [-1, 1].forEach(function (s) {
      g.glow(fx + s * ex, ey, er * 2.2, '#ffb030', 0.25);
      g.circle(fx + s * ex, ey, er, '#ffffff', g.outline);
      g.circle(fx + s * ex + er * 0.2, ey, er * 0.55, '#1a1410', null);
      g.circle(fx + s * ex + er * 0.45, ey - er * 0.35, er * 0.22, '#ffffff', null);
    });
    const my = H.y + r * 0.38;
    g.path(function (p) {
      p.moveTo(fx - r * 0.42, my);
      p.quadraticCurveTo(fx, my + r * 0.34, fx + r * 0.44, my - r * 0.02);
      p.closePath();
    }, '#fffbea', g.outline, 0.7);
    for (let i = 1; i < 4; i++) g.line(fx - r * 0.42 + i * r * 0.21, my, fx - r * 0.42 + i * r * 0.21, my + r * 0.12, '#8a7a5a', 0.4);
    // the knockoff fez: Hjalmar's shape tilted the other way, teal, a gold band, a tassel that moves in jerky steps
    const c = g.ctx;
    c.save();
    c.translate(H.x - r * 0.1, H.y - r * 0.82);
    c.rotate(-0.22);
    const bw = r * 0.46, tw = r * 0.36, fh = r * 0.62;
    g.path(function (p) {
      p.moveTo(-bw, 0); p.lineTo(-tw, -fh); p.lineTo(tw, -fh); p.lineTo(bw, 0);
      p.quadraticCurveTo(0, r * 0.12, -bw, 0); p.closePath();
    }, '#2e86ab', g.outline, Math.max(0.8, r * 0.08));
    g.ellipse(0, -fh, tw, r * 0.1, '#236a87', g.outline, 0);
    g.line(-bw * 0.95, -r * 0.08, bw * 0.95, -r * 0.08, GOLD, Math.max(0.8, r * 0.09));
    const sw = step ? 0.5 : -0.2;
    const tx = -Math.sin(0.9 + sw) * r * 0.55, ty = -fh + Math.cos(0.9 + sw) * r * 0.55;
    g.line(0, -fh, tx, ty, '#1c120b', Math.max(0.7, r * 0.06));
    g.circle(tx, ty, r * 0.1, mk >= 3 ? GOLD : '#1c120b', g.outline);
    if (mk >= 2) {   // Mk II and up: a little antenna with a blinking tip
      g.line(tw * 0.4, -fh, tw * 0.6, -fh - 4, '#8d8f96', 0.7);
      g.circle(tw * 0.6, -fh - 4.4, 0.8, step ? '#7cff6b' : '#2f6a2a', null);
    }
    c.restore();
    // the cymbals at the hands (chrome from Mk II): idle twitch on the 2-step clock, they crash together as it attacks
    if (g.hands) {
      const col = mk >= 2 ? '#e8eef4' : '#e3c25a';
      // held up at the chest like the toy (a tiny build's hands hang at its feet)
      let f = { x: 5.2, y: shY + 4.2 }, b = { x: -4.6, y: shY + 3.8 };
      if (atk) { f = { x: 3.4, y: shY + 3.4 }; b = { x: 5.6, y: shY + 3.2 }; }
      const lw0 = g.lw;
      g.lw = Math.min(lw0, 0.9);   // small shapes: a full outline would swallow them
      [b, f].forEach(function (h) { g.circle(h.x + (h.x > 0 ? -1.6 : 1.6), h.y + 0.8, 1.3, '#c8a060', g.outline); });
      [b, f].forEach(function (h, i) {
        const droop = hurt && i === 0 ? 0.6 : 0, tw2 = step && !atk ? (i ? 0.4 : -0.4) : 0;
        const cy = h.y + tw2 + droop * 2;
        g.ellipse(h.x, cy, 3.2, 2.5, col, g.outline, droop);
        g.ellipse(h.x - 0.6, cy - 0.6, 1.6, 1, 'rgba(255,255,255,0.55)', null, droop);
        g.circle(h.x, cy, 0.8, g.shade(col, -0.3), null);
      });
      g.lw = lw0;
      if (atk) [[-2, -2], [0, -3], [2, -2]].forEach(function (d) { g.line(4 + d[0] * 0.6, shY + 1.6 + d[1] * 0.4, 4 + d[0] * 1.5, shY + d[1] * 1.3, '#fff6c0', 0.6); });
      if (hurt) g.circle(b.x + 2, b.y - 1, 0.7, '#fff0a0', null);
    }
  }
  const MONKEY_BASE = { base: 'humanoid', scale: 0.84, build: 'tiny', outfit: 'tunic',
    palette: { skin: '#c8a060', cloth: '#2e86ab', cloth2: '#f2c14e', hair: '#8a6a3a', metal: '#e3c25a', eye: '#1a1410',
      outline: '#1c140b', ear: '#c8a060', inner: '#f0dcb0', pants: '#c8a060', boots: '#8a6a3a', belt: '#f2c14e' },
    head: { size: 1.1, ears: 'rat', hair: 'none', beard: 'none', hat: 'none', face: 'none', eyes: 'none', mouth: 'none', horns: 'none' },
    tail: 'none', mainhand: 'none', offhand: 'none', extras: [], bling: [], aura: null, overlay: hjmOverlay,
    height: 30, portrait: { x: 1, y: -24, r: 11 } };
  const MONKEY_LOOKS = [1, 2, 3].map(function (mk) { return Object.assign({}, MONKEY_BASE, { mk: mk }); });

  /** Spooder (this.mk): a small blue-steel jumping-spider bot, two big googly eyes; origin at the feet, facing +x. */
  const SPP = { body: '#4f79a6', bodyDk: '#2c4a6e', leg: '#2b3440', legDk: '#1d242c', joint: '#8aa1b8', white: '#ffffff',
    pupil: '#111111', lens: '#9fe6ff', blaster: '#c9ced6', spool: '#f4f1e6', led: '#7cff6b', outline: '#0f1620' };
  function spiderLeg(g, rx, ry, dx, lift, col, w, tape) {
    const kx = rx + dx * 0.55, ky = ry - 4.6 - lift * 0.4, fx2 = rx + dx, fy = -lift;
    g.line(rx, ry, kx, ky, col, w);
    g.line(kx, ky, fx2, fy, col, w);
    g.circle(kx, ky, w * 0.45, SPP.joint, null);
    g.circle(fx2, fy, w * 0.4, col, null);
    if (tape) hazardTape(g, kx + (fx2 - kx) * 0.3, ky + (fy - ky) * 0.3, kx + (fx2 - kx) * 0.6, ky + (fy - ky) * 0.6, 1);
  }
  function drawSpooder(g, t, o) {
    o = o || {};
    const mk = (this && this.mk) || 1, c = g.ctx, still = !!o.still, lying = o.lying || 0;
    const hot = stHas(o, OVER), upd = stHas(o, UPDATED), pose = g.pose, atk = pose === 'attack', hurt = pose === 'hurt';
    const lw = g.lw;
    g.lw = Math.min(lw, 1.3);
    if (lying > 0.05) {
      // the dead-bug pose: undo the engine's fall-over, flip the dome and curl the legs up
      c.rotate(lying * Math.PI / 2);
      c.translate(-lying * 18 * 0.4, lying * (28 * 0.3 + 1));
      [-5, -2, 2, 5].forEach(function (x) { g.arc(x, -9, 2.2, Math.PI, Math.PI * 1.9, SPP.leg, 1.3); });
      g.shaded(function (p) { p.ellipse(0, -5, 7, 4.6, 0, 0, Math.PI * 2); }, SPP.body, { dx: 0.6, dy: 0.8, dark: SPP.bodyDk });
      g.circle(4.6, -4.4, 2.4, SPP.white, g.outline);
      g.line(3.6, -5.4, 5.6, -3.4, SPP.pupil, 0.8);
      g.line(5.6, -5.4, 3.6, -3.4, SPP.pupil, 0.8);
      g.lw = lw;
      return;
    }
    const walk = typeof o.walk === 'number' ? o.walk : null;
    const by = -9, roots = [-4, -1.5, 1.5, 4], reachX = [-9.5, -4.5, 4.5, 9.5];
    const liftOf = function (i, side) {
      if (still) return 0;
      if (atk && side && i === 3) return 6;
      if (walk !== null) return Math.max(0, Math.sin(walk * Math.PI * 4 + (i + side) % 2 * Math.PI)) * 2.2;
      return Math.max(0, Math.sin(t * 6 + i + side * 2)) * 1.5;
    };
    g.ellipse(0, 0.4, 11, 2.8, 'rgba(0,0,0,0.25)', null);
    // far-side legs first (darker), then the body, then the near-side legs
    roots.forEach(function (x, i) { spiderLeg(g, x + 0.8, by + 0.4, reachX[i] * 0.9, liftOf(i, 0), SPP.legDk, 1.2, false); });
    if (hot) g.glow(0, by, 10, '#ff5a28', 0.4);
    g.shaded(function (p) { p.ellipse(0, by, 7.5, 5.4, 0, 0, Math.PI * 2); }, SPP.body, { dx: 0.8, dy: -1, dark: SPP.bodyDk, hl: [-2.2, by - 2.8, 2.6, 1.3] });
    for (let i = 0; i < 6; i++) g.circle(-5 + i * 2, by + 3.6 - Math.abs(i - 2.5) * 0.3, 0.45, SPP.joint, null);
    // the spool of silk on top (brass from Mk II), a loose thread
    g.ellipse(-2, by - 5.4, 2.6, 1.6, mk >= 2 ? BRASS : SPP.spool, g.outline);
    g.line(-2, by - 5.4, -5.4, by - 2.4, SPP.spool, 0.5);
    // an antenna with a slow LED blink (brighter on Mk III)
    const blinkOn = still || Math.sin(t * 2) > 0;
    g.line(-4, by - 4, -5.6, by - 10.4, '#3a434f', 0.7);
    if (blinkOn) g.glow(-5.6, by - 10.8, mk >= 3 ? 3.6 : 2.4, SPP.led, mk >= 3 ? 0.7 : 0.45);
    g.circle(-5.6, by - 10.8, 0.9, blinkOn ? SPP.led : '#2f6a2a', null);
    if (hot) steam(g, -4.5, by - 3, t, still);
    roots.forEach(function (x, i) { spiderLeg(g, x, by + 1.6, reachX[i], liftOf(i, 1), SPP.leg, 1.4, upd && i === 1); });
    // the toy blaster below the front (twin barrels on Mk III), a muzzle flash as it shoots
    g.rect(3.4, by + 2.6, 4.6, 1.6, SPP.blaster, g.outline, 0.6);
    if (mk >= 3) g.rect(3.4, by + 4.4, 4.6, 1.4, SPP.blaster, g.outline, 0.6);
    if (atk) g.star(9, by + 3.4, 2.4, '#fff3a0', null, 5);
    // four little lens dots (five from Mk II) and the two big googly eyes, pupils lagging and jiggling
    for (let i = 0; i < (mk >= 2 ? 5 : 4); i++) g.circle(2.2 + i * 1.1, by - 4.6 - (i % 2) * 0.5, 0.45, SPP.lens, null);
    const jig = still ? 0 : walk !== null ? Math.sin(t * 7) * 0.8 : Math.sin(t * 1.3) * 0.25;
    [[3.6, by - 1.8, 2.6], [6, by - 1, 3.2]].forEach(function (e, i) {
      g.circle(e[0], e[1], e[2], SPP.white, g.outline);
      let px = 0.9 + jig, py = e[2] * 0.3 + Math.abs(jig) * 0.4;
      if (hurt && i === 1) { px = Math.cos(t * 12) * e[2] * 0.4; py = Math.sin(t * 12) * e[2] * 0.4; }
      g.circle(e[0] + px, e[1] + py, e[2] * 0.48, SPP.pupil, null);
      g.circle(e[0] + px - 0.4, e[1] + py - 0.5, e[2] * 0.14, SPP.white, null);
    });
    g.lw = lw;
  }
  const SPIDER_LOOKS = [1, 2, 3].map(function (mk) {
    return { base: 'custom', mk: mk, scale: 0.8, height: 18, width: 28, headY: -12, portrait: { x: 4, y: -11, r: 10 }, palette: SPP, draw: drawSpooder };
  });

  /** The Scrap Heap (tile-local, billboard, round parts: right at any yaw); the countdown on a little wrench tag. */
  function drawScrap(g, obj, t) {
    const data = (obj && obj.data) || {}, left = data.left;
    t = t || 0;
    g.ellipse(0, 0, 11, 4, 'rgba(0,0,0,0.3)');
    if (data.kind === 'spooder') {
      [-6, -3, 1, 4, 7].forEach(function (x, i) { g.arc(x, -2.4, 2.6, Math.PI * (1 + i * 0.07), Math.PI * 1.95, '#2b3440', 1.3); });
      g.ellipse(-1, -3, 5.6, 3.2, '#4f79a6', true);
      g.circle(2.4, -6, 2.6, '#ffffff', true);
      g.circle(2.6, -7.2, 1.2, '#111111');
      g.ellipse(-4.4, -6.2, 2.4, 1.5, SILK, true);
      g.line(-4.4, -6.2, -9, -1.2, SILK, 0.6);
    } else {
      g.ellipse(3, -2.6, 4.6, 1.8, '#e3c25a', true, -0.3);
      g.circle(3, -2.6, 0.6, '#8a6a2a');
      g.circle(-3, -3.2, 2.2, '#9a9aa0', true);
      g.circle(-3, -3.2, 0.9, '#5d5e63');
      g.circle(0.4, -4.6, 1.6, '#b7b8bd', true);
      g.line(-6.4, -5.4, -6.4, -9, '#8d8f96', 1);
      g.ellipse(-7.6, -9.4, 1.3, 1.6, '#e3c25a', true);
      g.ellipse(-5.2, -9.4, 1.3, 1.6, '#e3c25a', true);
      g.poly([[-1, -6], [1.6, -10.4], [4.6, -10.4], [6, -6]], '#2e86ab', true);
      g.line(-0.6, -6.6, 5.6, -6.6, GOLD, 1);
      for (let i = 0; i < 3; i++) g.ellipse(7.4 - i * 1.1, -4.2 - i * 1.3, 1.3, 0.7, null, '#9a9aa0');
    }
    // the tag with the turns left (nothing at 0); the digit is g.text (never mirrored). [QA QA-BIZ-1] twice the old size
    // (a 5-px digit with an outline stroke was a blob at the default camera); the hover label says it in words too
    if (left > 0) {
      g.line(6, -4, 9, -9, '#6b7280', 1);
      g.rect(6, -19.4, 12, 10.4, '#f3e2b8', true, 1.6);
      g.text(String(left), 12, -14.1, 9.5, '#1d1d1d', null);
    }
    // two smoke wisps and a rare spark
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.5 + i * 0.5) % 1;
      g.circle(-2 + i * 3 + Math.sin(ph * 6) * 1.2, -6 - ph * 9, 1.2 + ph * 1.6, 'rgba(160,160,160,' + (0.45 * (1 - ph)).toFixed(2) + ')');
    }
    if ((t * 1.7) % 3 < 0.1) { g.line(-1, -7, 1, -9, '#fff3a0', 0.8); g.line(1, -7, -1, -9, '#fff3a0', 0.8); }
  }

  /** Spoodmarino!'s FX (FX.custom draw: the anchor tile is projected through the view, so it is right at any yaw). */
  function drawCombo(c, x, y, p, view) {
    const z = (view && view.zoom) || 1, k = 1.6 * z;
    const a = p > 0.8 ? Math.max(0, (1 - p) / 0.2) : 1, rise = Math.sin(Math.min(1, p * 3) * Math.PI / 2);
    c.save();
    c.globalAlpha = a;
    c.translate(x, y - 10 * z * rise);
    c.scale(k, k);
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(244,241,230,0.85)';
    c.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + p * 2, len = 18 * Math.min(1, p * 2);
      c.beginPath();
      c.moveTo(0, -8);
      c.quadraticCurveTo(Math.cos(ang) * len * 0.5, -8 + Math.sin(ang) * len * 0.5 - 6, Math.cos(ang) * len, -8 + Math.sin(ang) * len * 0.6);
      c.stroke();
    }
    c.strokeStyle = '#2b3440';
    c.lineWidth = 1.2;
    [-6, -3, 3, 6].forEach(function (lx) {
      c.beginPath(); c.moveTo(lx * 0.6, -6); c.lineTo(lx * 1.2, -10); c.lineTo(lx * 1.7, 0); c.stroke();
    });
    c.fillStyle = '#4f79a6'; c.strokeStyle = '#0f1620'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(0, -7, 7, 4.6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    [[3, -7, 2], [5.4, -6.4, 2.4]].forEach(function (e) {
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(e[0], e[1], e[2], 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#111111'; c.beginPath(); c.arc(e[0] + 0.6 * Math.sin(p * 20), e[1] + 0.6, e[2] * 0.45, 0, Math.PI * 2); c.fill();
    });
    // Hjalmarino riding on top: body, head, the teal fez, cymbals raised
    c.fillStyle = '#c8a060';
    c.beginPath(); c.ellipse(-1, -15, 3, 3.6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(-1, -21, 3.2, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#2e86ab';
    c.beginPath(); c.moveTo(-3, -23.6); c.lineTo(-2.4, -27); c.lineTo(0.4, -27); c.lineTo(1, -23.6); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e3c25a';
    const clap = Math.abs(Math.sin(p * 18)) * 2;
    [[-6 + clap, -24], [4 - clap, -24]].forEach(function (cy) { c.beginPath(); c.ellipse(cy[0], cy[1], 2.4, 1, 0, 0, Math.PI * 2); c.fill(); c.stroke(); });
    c.restore();
  }

  // ---- statuses and the object ----------------------------------------------------------------------------------------
  DD.registerStatus({
    id: OVER, name: 'Overclocked', icon: '♨️', color: HOT, type: 'buff', stacking: 'refresh', maxStacks: 1,
    // skipFresh false with turns 1: gone at the end of THIS turn (his group's turn-end order: his bask reads it first)
    decay: 'turnEnd', skipFresh: false, defaultTurns: 1,
    desc: function (st) {
      const n = (st && st.data && st.data.bask) || 3;
      return 'Running hot this turn: if Biz ends the turn next to it, he basks on its engine and heals ' + n + ' HP.';
    },
  });
  DD.registerStatus({
    id: UPDATED, name: 'Updated', icon: '💾', color: GOLD, type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    // a flat change of its damage numbers (DD.AI.estimate, AutoPlay)
    telegraphFlat: function (st) { return flatOf(st); },
    desc: function (st) { return 'Updated: deals +' + flatOf(st) + ' damage with every hit, attacks of opportunity included, for the rest of the fight.'; },
    hooks: {
      modifyOutgoingDamage: function (d, st) { if (skillHit(d) && holds(d.source, st)) d.flat += flatOf(st); },
      // pure: the HUD's move preview, paths and the AI's attack-of-opportunity estimates read it
      modifyOpportunity: function (o, st) { if (o && holds(o.attacker, st)) o.flat += flatOf(st); },
    },
  });
  DD.registerStatus({
    id: REBUILD, name: 'Rebuilding', icon: '🔧', color: STEEL, type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'never', defaultTurns: -1, showTurns: true,
    desc: function (st) {
      const list = (st && st.data && st.data.list) || [];
      return list.length ? list.map(function (e) {
        // "of Biz's turns", never "his": the sentence's subject is the construct (it, plan D8)
        return e.name + ' reboots ' + (e.left <= 1 ? 'at the start of Biz\'s next turn' : 'in ' + e.left + ' of Biz\'s turns');
      }).join('. ') + '.' : 'Rebuilding a robot.';
    },
  });
  // fix:balance B2: display only (the truth is c.data.biz.back); skipFresh false with turns 1: gone at the end of THIS turn
  DD.registerStatus({
    id: BOOT, name: 'Booting Up', icon: '⏳', color: CYAN, type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', skipFresh: false, defaultTurns: 1,
    desc: function (st) {
      return st && st.data && st.data.ready ? 'Just rebooted: it can\'t be overclocked until Biz\'s next turn.' :
        'Just rebooted and booting up: it can\'t act or be overclocked until Biz\'s next turn.';
    },
  });
  DD.registerObject({
    id: SCRAP, name: 'Scrap Heap', blocksMove: false, blocksLos: false, hp: 0, height: 0.3, targetable: false, color: '#9a8a6a',
    desc: 'What is left of one of Biz\'s robots. The number is how many of Biz\'s turns until it reboots here (or as near as ' +
      'there is room); Turn It Off and On Again reboots it now.',
    draw: drawScrap,
  });

  // ---- the constructs' skills (owner 'summon'; level = the model) ------------------------------------------------------
  DD.registerSkill({
    id: 'biz_monkey_wrench', name: 'Monkey Wrench', owner: 'summon', icon: '🔧', kind: 'attack', tags: ['melee', 'wrench'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 2 }, { dmg: 3 }, { dmg: 4 }],   // fix:balance B4 (Nov 21): 3 / 4 / 5 → 2 / 3 / 4 (1 less, never below 2)
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'Someone handed it a wrench once. It never gave the wrench back.',
    aiScore: warmScore,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.lunge(u, f);
      DD.FX.particles(f, { kind: 'sparks', count: 6, color: '#ffe08a', parallel: true });
      DD.FX.text(f, 'CLANG!', { color: '#f2d16b', size: 15 });
      A().damage(u, f, ctx.L.dmg, { tags: ['melee', 'wrench'] });
      A().maybeBark(u, 'wrench', 0.2);
    },
  });
  DD.registerSkill({
    id: 'biz_cymbal_crash', name: 'Cymbal Crash', owner: 'summon', icon: '🥁', kind: 'utility', tags: ['confuse', 'cymbal'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ turns: 1, cd: 3 }, { turns: 1, cd: 2 }, { turns: 1, cd: 1 }],
    // h19:balance it3: non-bosses only (the addendum's sixth "too strong" knob), refused in canTarget with its own words
    target: { type: 'unit', range: [1, 1], filter: 'enemy',
      canTarget: function (ctx) { return ctx.targetUnit && A().isBoss(ctx.targetUnit) ? 'Bosses have heard the cymbals before.' : true; } },
    desc: function () { return 'An adjacent foe (not a boss) is Confused for its next turn: its attacks turn a random quarter turn and may hit its friends.'; },
    flavor: 'The wind-up monkey with the cymbals. Yes, that one. It has waited its whole life for this.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f) || A().isBoss(f)) return;
      DD.FX.lunge(u, f);
      DD.FX.text(f, 'CLANG CLANG!', { color: '#f2d16b', size: 18 });
      DD.FX.flash('#ffffff', 80);
      DD.FX.particles(f, { kind: 'notes', count: 8, color: '#f2d16b', parallel: true });
      DD.FX.sound('crit');
      A().addStatus(f, 'confused', { turns: ctx.L.turns }, u);
      A().maybeBark(u, 'cymbal', 0.2);
    },
  });
  DD.registerSkill({
    id: 'biz_pew_pew', name: 'Pew Pew', owner: 'summon', icon: '💥', kind: 'attack', tags: ['ranged'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 2 }, { dmg: 2 }, { dmg: 3 }],   // fix:balance B4 (Nov 21): 2 / 3 / 4 → 2 / 2 / 3 (1 less, never below 2)
    target: { type: 'unit', range: [1, 3], filter: 'enemy' },
    desc: function (L, user) { return 'Deal ' + L.dmg + ' damage to a foe within ' + reach(user, 'biz_pew_pew', L, 3) + '.'; },
    flavor: 'Biz installed a tiny blaster. Spooder installed the sound effects.',
    aiScore: warmScore,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.projectile(u, f, { kind: 'bolt', color: CYAN });
      A().damage(u, f, ctx.L.dmg, { tags: ['ranged'] });
      A().maybeBark(u, 'pew', 0.2);
    },
  });
  DD.registerSkill({
    id: 'biz_thwip', name: 'Thwip!', owner: 'summon', icon: '🕸️', kind: 'utility', tags: ['ranged', 'root', 'web'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ cd: 3, range: 3 }, { cd: 2, range: 3 }, { cd: 2, range: 4 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, filter: 'enemy' },
    desc: function (L, user) { return 'A foe within ' + reach(user, 'biz_thwip', L, L.range) + ' is Rooted for its next turn (no move actions).'; },
    flavor: 'Biz calls it "tactical silk deployment". Spooder calls it "thwip".',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.beam(u, f, { color: SILK, width: 2 });
      DD.FX.particles(f, { kind: 'sparks', count: 6, color: '#ffffff', parallel: true });
      DD.FX.text(f, 'Thwip!', { color: SILK, size: 14 });
      DD.FX.sound('snip');
      A().addStatus(f, 'root', { turns: 1 }, u);
      A().maybeBark(u, 'thwip', 0.2);
    },
  });

  // ---- the two constructs (engine-native summons; no pronoun in any of their texts) ------------------------------------
  /** A construct's own hurt and last-gasp beeps (cosmetic; the engine barks only for heroes and enemies). */
  function botHurt(d) {
    const u = d && d.target;
    if (!u || A().simulating || u.dead || !((d.dealt || 0) > 0)) return;
    if (u.hp <= 0) A().maybeBark(u, 'death', 0.5);
    else A().maybeBark(u, 'hurt', 0.15);
  }
  DD.registerSummon({
    id: HJ, name: 'Mechanical Monkey', names: ['Hjalmarino'], hp: KINDS.hjalmarino.defHp, mov: 4, ap: 2, armor: 0, init: 0, pronoun: 'it',   // h19:balance it3: armor 1 → 0
    color: KINDS.hjalmarino.color, tags: ['construct', 'machine', 'monkey'], flags: { hop: true }, resist: { poison: 0 },
    sprite: MONKEY_LOOKS[0], skills: ['biz_monkey_wrench', 'biz_cymbal_crash'],
    hooks: { onDeath: function (unit) { scrapped(unit); }, onTakeDamage: botHurt },
    barks: {
      spawn: ['*whirr* OOH OOH. *clang*', '*click click click* CLANG!', TIN_LAUGH, '*key turns* Ready. To. Clang.'],
      select: ['OOH OOH? *whirr*', 'READY. HEE HEE.', '*cymbals at the ready*'],
      // [QA voice-6] each skill barks its own sound (a wrench never says "CLANG CLANG", the cymbals never wrench);
      // 'attack' stays the generic pool for anything that swings without a key of its own
      attack: ['OOH OOH AH AH!', '*whirr whirr*', 'HEE HEE. *clank*'],
      wrench: ['CLANG!', '*aggressive wrenching*', '*bonk bonk bonk*'],
      cymbal: ['*CLANG CLANG*', 'OOH OOH AH AH!', '*cymbals at maximum volume*'],
      hurt: ['*BZZT*', '*sad little clang*', '*rattle rattle*'],
      death: ['*one last clang*', '*the key winds down*', 'OOH... oooh... *sproing*'],
    },
    desc: 'Hjalmarino, Biz\'s mechanical cymbal monkey (Hjalmar calls it a knockoff). Acts on Biz\'s turn. HP ' + KINDS.hjalmarino.base + ' + twice ' +
      'Biz\'s level, hops up 2 levels, can\'t be poisoned. Monkey Wrench (it also hits foes that walk away from it) ' +
      'and Cymbal Crash (Confused; not bosses). Mk II from Biz\'s level ' + MK_AT[0] + ', Mk III from ' + MK_AT[1] + '.',
  });
  DD.registerSummon({
    id: SP, name: 'Mechanical Spider', names: ['Spooder'], hp: KINDS.spooder.defHp, mov: 4, ap: 2, armor: 0, init: 0, pronoun: 'it',
    color: KINDS.spooder.color, tags: ['construct', 'machine', 'spider'], flags: { immune: ['root'] }, resist: { poison: 0 },
    sprite: SPIDER_LOOKS[0], skills: ['biz_pew_pew', 'biz_thwip'],
    hooks: { onDeath: function (unit) { scrapped(unit); }, onTakeDamage: botHurt },
    barks: {
      spawn: ['*happy tippy-taps*', '*googly eyes wobble*', 'SPOODER.EXE IS RUNNING.', '*eight tiny clicks*'],
      select: ['beep?', 'AWAITING INPUT.', '*eight legs, one purpose*'],
      attack: ['*angry tippy-taps*', 'TARGET ACQUIRED.', '*googly eyes narrow*'],
      pew: ['pew pew!', 'PEW.', '*tiny blaster noises*'],
      thwip: ['*thwip*', '*thwip thwip*', '*spins a tiny net*'],
      hurt: ['*eep*', '*a leg falls off. It goes back on.*', '*bzzt* :('],
      death: ['*curls up its legs*', '*a googly eye rolls away*', 'SPOODER.EXE HAS STOPPED WORKING.'],
    },
    desc: 'Spooder, Biz\'s mechanical spider: eight legs, two googly eyes, one tiny blaster. Acts on Biz\'s turn. HP ' + KINDS.spooder.base + ' + ' +
      'twice Biz\'s level, can\'t be poisoned or Rooted. Pew Pew within 3 and Thwip! (Rooted). Mk II from Biz\'s level ' + MK_AT[0] + ', ' +
      'Mk III from ' + MK_AT[1] + '.',
  });

  // ---- basic attack ---------------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'biz_rivet_gun', name: 'Rivet Gun', owner: HERO, icon: '🔩', kind: 'attack', tags: ['ranged', 'rivet'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 3 }],
    target: { type: 'unit', range: [1, 3], filter: 'enemy' },
    desc: function (L, user) { return 'Deal ' + L.dmg + ' damage to a foe within ' + reach(user, 'biz_rivet_gun', L, 3) + '.'; },
    flavor: 'His one concession to fighting in person. He would like it noted that it is mostly for fixing things.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      DD.FX.projectile(u, f, { kind: 'dagger', color: STEEL });
      A().damage(u, f, ctx.L.dmg, { tags: ['ranged', 'rivet'] });
    },
  });

  // ---- starters ---------------------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'biz_duct_tape', name: 'Duct Tape', owner: HERO, icon: '🧰', kind: 'buff', tags: ['block', 'construct', 'repair'],
    ap: 1, cooldown: 1,
    levels: [{ block: 5, range: 3 }, { block: 6, range: 3 }, { block: 8, range: 4 }],
    target: {
      type: 'unit', range: function (L) { return [0, L.range]; }, filter: 'allyOrSelf', los: false,
      canTarget: function (ctx) { const t = ctx.targetUnit; return t && (t === ctx.user || isMine(ctx.user, t)) ? true : 'Only Biz or his robots.'; },
    },
    desc: function (L, user) {
      return 'You or one of your constructs within ' + reach(user, 'biz_duct_tape', L, L.range) + ' gains ' + L.block + ' Block.';
    },
    flavor: 'If it moves and it shouldn\'t: duct tape. If it doesn\'t move and it should: Overclock.',
    aiScore: tapeScore,
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(u) || !active(t) || (t !== u && !isMine(u, t))) return;
      A().addBlock(t, ctx.L.block);
      DD.FX.particles(t, { kind: 'sparks', count: 6, color: STEEL });
      DD.FX.text(t, 'Taped!', { color: STEEL, size: 14 });
      DD.FX.sound('buff');
      A().maybeBark(u, 'tape', 0.3);
    },
  });
  function canOverclock(ctx) {
    const c = ctx.targetUnit;
    if (!isMine(ctx.user, c)) return 'Only Biz\'s robots.';
    if (A().isStunned(c) || A().hasStatus(c, 'sheep')) return c.name + ' can\'t act right now.';
    if (justBack(c)) return c.name + ' is still booting up. Overclock it next turn.';   // fix:balance B2
    return true;
  }
  DD.registerSkill({
    id: 'biz_overclock', name: 'Overclock', owner: HERO, icon: '♨️', kind: 'buff', tags: ['command', 'construct', 'ap', 'keystone'],
    ap: 1, cooldown: function (L) { return L.cd; },
    // `bask`, never `heal`: a level key `heal` would be read as an ungated heal (Valdris's `dents` lesson)
    // h19:balance it2: cd 2 / 1 / 1 → 2 / 2 / 1; fix:balance B3 (Nov 21): ap 2 → 1 (never below +1)
    levels: [{ ap: OC_AP, bask: 3, range: 3, cd: 2 }, { ap: OC_AP, bask: 4, range: 3, cd: 2 }, { ap: OC_AP, bask: 4, range: 4, cd: 1 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, filter: 'ally', los: false, canTarget: canOverclock },
    forgetWarning: 'Your one heal and your best command live here. Without it the robots never redline and Biz never warms up.',
    desc: function (L, user) {
      const g = L.ap + (wears(user, REMOTE) ? 1 : 0);
      return 'One of your constructs within ' + reach(user, 'biz_overclock', L, L.range) + ' gains ' + g + ' AP now and runs hot: ' +
        'end this turn next to it and you bask on its engine, healing ' + L.bask + ' HP.';
    },
    flavor: 'Lizards are cold-blooded. Robots running at 140% are not. Everybody wins, briefly.',
    aiScore: overclockScore,
    execute: function (ctx) {
      const u = ctx.user, c = ctx.targetUnit, L = ctx.L;
      if (!active(u) || !isMine(u, c) || !active(c)) return;
      const g = L.ap + (wears(u, REMOTE) ? 1 : 0);
      A().gainAp(c, g);
      const st = A().addStatus(c, OVER, { turns: 1, silent: true }, u);
      if (st) { st.data = st.data || {}; st.data.bask = L.bask; st.data.src = u.id; }
      DD.FX.particles(c, { kind: 'smoke', count: 12, color: '#f2f2f2' });
      DD.FX.text(c, '♨️ Overclocked!', { color: HOT, size: 15 });
      DD.FX.sound('clockwork');
      A().maybeBark(u, 'overclock', 0.4);
      A().log(u.name + ' overclocks ' + c.name + ': +' + g + ' AP. It is running hot.', 'hero');
    },
  });

  // ---- skill pool -------------------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'biz_reboot', name: 'Turn It Off and On Again', owner: HERO, icon: '🔌', kind: 'summon', tags: ['summon', 'construct', 'reboot'],
    ap: 2, cooldown: function (L) { return L.cd; },
    levels: [{ cd: 3 }, { cd: 2 }, { cd: 2, ready: true }],
    target: {
      type: 'tile', range: [0, 99], los: false, filter: 'any',
      canTarget: function (ctx) { return kindAtHeap(ctx.user, ctx.target) ? true : 'Pick one of your Scrap Heaps.'; },
    },
    canUse: function (ctx) {
      const D = peek(ctx.user);
      return pending(D).some(function (k) { return !!D.scrap[k].at; }) ? true : 'Nothing to reboot. Everything works. Suspicious.';
    },
    desc: function (L) {
      // fix:balance B2: I / II boot up this turn; III keeps "acts at once" (its level's upgrade), never an Overclock that turn
      return 'Reboot one of your scrapped constructs at its Scrap Heap, anywhere on the field, with full HP.' +
        (L.ready ? ' It acts at once (but can\'t be overclocked this turn).' : ' It spends this turn booting up (no actions, no Overclock).');
    },
    flavor: '"Have you tried turning it off and on again?" Every IT department\'s spell, in physical form.',
    execute: function (ctx) {
      const u = ctx.user, kind = kindAtHeap(u, ctx.target);
      if (!active(u) || !kind) return;
      reboot(u, kind, { frac: 1, ready: !!ctx.L.ready, cause: 'skill' });
    },
  });
  DD.registerSkill({
    id: 'biz_red_button', name: 'Big Red Button', owner: HERO, icon: '🔴', kind: 'attack', tags: ['aoe', 'explosion', 'construct'],
    ap: 1, cooldown: 0, charges: 1,
    // key `boom`, never `dmg`: the quick pass would read damage on the aimed ally, and the Radio Edit picks by dmg
    levels: [{ boom: 8 }, { boom: 10 }, { boom: 12 }],
    target: {
      type: 'unit', range: [1, 99], los: false, filter: 'ally',
      canTarget: function (ctx) { return isMine(ctx.user, ctx.targetUnit) && active(ctx.targetUnit) ? true : 'Only your own robots have the button.'; },
    },
    area: { shape: 'custom', fn: function (ctx) {
      const c = ctx && ctx.target ? G().unitAt(ctx.target.x, ctx.target.y) : null;
      if (!c || !isMine(ctx.user, c)) return [];
      return DD.util.DIRS.map(function (d) { return { x: c.x + d.x, y: c.y + d.y }; }).filter(function (p) { return G().inBounds(p.x, p.y); });
    } },
    desc: function (L) {
      return 'Once per fight: one of your constructs, anywhere, self-destructs. Every foe next to it takes ' + L.boom +
        ' damage. It is scrapped (and reboots as usual).';
    },
    flavor: 'Big. Red. Labelled "DO NOT". He has never once not.',
    autoplayValue: boomValue,
    execute: function (ctx) {
      const u = ctx.user, c = ctx.targetUnit;
      if (!active(u) || !isMine(u, c) || !active(c)) return;
      selfDestruct(u, c, ctx.L, ctx.skill || DD.getSkill('biz_red_button'));
    },
  });
  DD.registerSkill({
    id: 'biz_hide', name: 'Nothing to See Here', owner: HERO, icon: '🦎', kind: 'buff', tags: ['stealth', 'self', 'lizard'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ turns: 1, cd: 3 }, { turns: 1, cd: 2 }, { turns: 2, cd: 3 }],
    target: { type: 'self' },
    desc: function (L) {
      return 'You are Stealthed through your next ' + (L.turns > 1 ? L.turns + ' turns' : 'turn') + ' (enemies ignore you). ' +
        'Your constructs\' attacks don\'t break it; yours do.';
    },
    flavor: 'Lizard thing. Also a management thing. He blends into the wall and lets the robots take the meeting.',
    aiScore: hideScore,
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      A().addStatus(u, 'stealth', { turns: ctx.L.turns }, u);
      DD.FX.particles(u, { kind: 'glitter', count: 8, color: '#9fc59a' });
      DD.FX.text(u, '🦎 ...', { color: '#9fc59a', size: 14 });
      A().maybeBark(u, 'hide', 0.4);
      A().log(u.name + ' holds very still. He is a wall now.', 'hero');
    },
  });
  DD.registerSkill({
    id: 'biz_firmware', name: 'Firmware Update', owner: HERO, icon: '💾', kind: 'buff', tags: ['construct', 'upgrade'],
    ap: 1, cooldown: 1,
    levels: [{ flat: 1, range: 1 }, { flat: 2, range: 1 }, { flat: 2, range: 3 }],
    target: {
      type: 'unit', range: function (L) { return [1, L.range]; }, filter: 'ally', los: false,
      canTarget: function (ctx) {
        const c = ctx.targetUnit;
        if (!isMine(ctx.user, c)) return 'Only Biz\'s robots.';
        if (statusOf(c, UPDATED)) return c.name + ' is already up to date.';
        return true;
      },
    },
    desc: function (L, user) {
      return (L.range > 1 ? 'A construct within ' + reach(user, 'biz_firmware', L, L.range) : 'An adjacent construct') + ' deals +' + L.flat +
        ' damage with every hit for the rest of the fight (attacks of opportunity too). One update each.';
    },
    flavor: 'Patch 1.0.2: Hjalmarino buffed. Spooder buffed. Biz unchanged (working as intended).',
    aiScore: firmwareScore,
    execute: function (ctx) {
      const u = ctx.user, c = ctx.targetUnit;
      if (!active(u) || !isMine(u, c) || !active(c) || statusOf(c, UPDATED)) return;
      const st = A().addStatus(c, UPDATED, { silent: true }, u);
      if (st) { st.data = st.data || {}; st.data.flat = ctx.L.flat; }
      DD.FX.particles(c, { kind: 'sparks', count: 12, color: GOLD });
      DD.FX.text(c, '💾 Updated +' + ctx.L.flat, { color: GOLD, size: 14 });
      DD.FX.sound('buff');
      A().maybeBark(u, 'firmware', 0.5);
      A().log(u.name + ' pushes a firmware update: ' + c.name + ' deals +' + ctx.L.flat + ' damage with every hit.', 'hero');
    },
  });
  DD.registerSkill({
    id: 'biz_www', name: 'World Wide Web', owner: HERO, icon: '🌐', kind: 'utility', tags: ['spooder', 'root', 'aoe', 'web'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ r: 1, cd: 3 }, { r: 1, cd: 2 }, { r: 2, cd: 2 }],
    target: { type: 'self' },
    area: { shape: 'custom', fn: webArea },
    canUse: function (ctx) {
      const sp = constructOf(ctx.user, 'spooder');
      if (!sp) return 'Spooder is scrap. Turn it off and on again.';
      if (!able(sp)) return 'Spooder can\'t move a leg right now.';
      const r = (ctx.L && ctx.L.r) || 1;
      return webArea(ctx).some(function (p) { const o = G().unitAt(p.x, p.y); return o && foeOf(ctx.user, o); }) ? true :
        r > 1 ? 'No foe within ' + r + ' tiles of Spooder.' : 'No foe next to Spooder.';
    },
    desc: function (L) { return 'Every foe ' + (L.r > 1 ? 'within ' + L.r + ' tiles of' : 'next to') + ' Spooder is Rooted for its next turn.'; },
    flavor: 'Now in your area. Spooder is very proud of the joke.',
    aiScore: webScore,
    execute: function (ctx) {
      const u = ctx.user, sp = constructOf(u, 'spooder');
      if (!active(u) || !sp) return;
      let n = 0;
      DD.FX.particles(sp, { kind: 'bubbles', count: 10, color: '#ffffff' });
      DD.FX.sound('snip');
      ctx.foes.slice().sort(byPos).forEach(function (f) {
        if (!foeOf(u, f)) return;
        DD.FX.beam(sp, f, { color: SILK, width: 2, parallel: true });
        DD.FX.text(f, '🕸️ Webbed!', { color: SILK, size: 13 });
        if (A().addStatus(f, 'root', { turns: 1 }, sp)) n++;
      });
      A().maybeBark(u, 'web', 0.4);
      A().log(sp.name + ' spins a World Wide Web: ' + plural(n, 'foe') + ' stuck.', 'hero');
    },
  });
  DD.registerSkill({
    id: 'biz_zip_line', name: 'Zip Line', owner: HERO, icon: '🪢', kind: 'move', tags: ['move', 'ally', 'spider'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ range: 4, cd: 2 }, { range: 5, cd: 2 }, { range: 5, cd: 1 }],
    target: {
      type: 'unit', range: [0, 99], filter: 'allyOrSelf', los: false,
      canTarget: function (ctx) {
        const sp = constructOf(ctx.user, 'spooder'), t = ctx.targetUnit;
        if (!sp || !t) return 'Spooder reels in you or an ally.';
        if (t === sp) return 'Spooder can\'t reel itself.';
        if (dist(t, sp) > ctx.L.range) return 'Too far from Spooder.';
        if (A().isImmovable(t)) return t.name + ' is immovable.';
        if (dist(t, sp) === 1) return 'Already next to Spooder.';
        return zipSpot(sp, t) ? true : 'No room next to Spooder.';
      },
    },
    canUse: function (ctx) {
      const sp = constructOf(ctx.user, 'spooder');
      if (!sp) return 'Spooder is scrap. Turn it off and on again.';
      return able(sp) ? true : 'Spooder can\'t move a leg right now.';
    },
    desc: function (L) {
      return 'Spooder reels you or an ally within ' + L.range + ' tiles of it onto a free tile next to it, without provoking attacks of opportunity.';
    },
    flavor: 'Spooder can lift fifty times its own body weight. Its own body weight is very small. Nobody tell it.',
    aiScore: zipScore,
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, sp = constructOf(u, 'spooder');
      if (!active(u) || !active(t) || !sp || !able(sp)) return;
      const spot = zipSpot(sp, t);
      if (!spot) return;
      const from = { x: t.x, y: t.y };
      DD.FX.beam(sp, t, { color: SILK, width: 2 });
      if (!A().teleport(t, spot.x, spot.y, { fx: false })) return;
      DD.FX.jump(t, from, spot, { ms: 260 });
      DD.FX.text(t, 'Thwip!', { color: SILK, size: 14 });
      DD.FX.sound('slide_whistle');
      A().maybeBark(u, 'zip', 0.4);
      A().log(sp.name + ' reels ' + t.name + ' in on a silk line.', 'hero');
    },
  });
  DD.registerSkill({
    id: 'biz_synergy', name: 'Synergy', owner: HERO, icon: '🤝', kind: 'attack', tags: ['ranged', 'combo'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4, per: 3 }, { dmg: 5, per: 4 }, { dmg: 6, per: 5 }],
    target: { type: 'unit', range: [1, 4], filter: 'enemy' },
    desc: function (L, user) {
      return 'Deal ' + L.dmg + ' damage to a foe within ' + reach(user, 'biz_synergy', L, 4) + ', +' + L.per + ' for each of your constructs next to it.';
    },
    flavor: 'Biz learned this word at a seminar. He has never been happier.',
    aiScore: synergyScore,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      const bots = constructsOf(u).filter(function (c) { return dist(c, f) === 1; });
      bots.forEach(function (c, i) { DD.FX.beam(c, f, { color: BLUE, width: 3, parallel: i > 0 }); });
      DD.FX.projectile(u, f, { kind: 'dagger', color: STEEL });
      DD.FX.text(f, 'SYNERGY!', { color: '#9fd0ff', size: 16 });
      A().damage(u, f, ctx.L.dmg + ctx.L.per * bots.length, { tags: ['ranged', 'combo'] });
    },
  });

  // ---- signature ----------------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'biz_spoodmarino', name: 'Spoodmarino!', owner: HERO, icon: '🤖', kind: 'attack', tags: ['aoe', 'root', 'construct'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 12 }],
    target: { type: 'self' },
    area: { shape: 'custom', fn: comboArea },
    canUse: function (ctx) { return anyBotOrHeap(ctx.user) ? true : 'Nothing left to combine.'; },
    desc: function (L) {
      return 'Your scrapped constructs reboot at their Scrap Heaps with full HP (booting up). Then every foe within 2 tiles of one ' +
        'of your constructs takes ' + L.dmg + ' damage and is Rooted for its next turn.';
    },
    flavor: 'Patent pending. Insurance pending. Spooder\'s consent: enthusiastic.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, def = ctx.skill || DD.getSkill('biz_spoodmarino');
      if (!active(u)) return;
      pending(peek(u)).forEach(function (kind) { reboot(u, kind, { frac: 1, ready: false, cause: 'signature' }); });
      const bots = constructsOf(u);
      const rank = function (c) { return kindOf(c) === 'hjalmarino' ? 0 : 1; };
      const anchor = bots.filter(function (c) { return kindOf(c) === 'spooder'; })[0] || bots[0] || u;
      DD.FX.banner('SPOODMARINO!', { sub: 'Monkey, mount spider', color: BLUE });
      DD.FX.shake(9, 450);
      DD.FX.sound('clockwork');
      DD.FX.sound('explosion');
      DD.FX.custom('custom', { at: { x: anchor.x, y: anchor.y }, ms: 1200, layer: 'world', draw: drawCombo });
      DD.FX.particles(anchor, { kind: 'sparks', count: 20, color: GOLD, parallel: true });
      const foes = DD.Combat.foesOf(u).filter(function (f) {
        return active(f) && bots.some(function (c) { return active(c) && dist(c, f) <= 2; });
      }).sort(byPos);
      foes.forEach(function (f) {
        if (!active(f)) return;
        let best = null;
        constructsOf(u).forEach(function (c) {
          const d = dist(c, f);
          if (d <= 2 && (!best || d < best.d || (d === best.d && rank(c) < rank(best.c)))) best = { c: c, d: d };
        });
        if (!best) return;
        DD.FX.beam(best.c, f, { color: SILK, width: 2, parallel: true });
        A().damage(best.c, f, L.dmg, { cause: 'skill', skill: def, tags: ['signature', 'construct'] });
        if (active(f)) A().addStatus(f, 'root', { turns: 1 }, best.c);
      });
      // [QA QA-BIZ-7] no 'signature' bark here: Combat.useSkill barks it for every signature cast (HUD and AutoPlay alike)
      const now = constructsOf(u);
      A().log(now.length >= 2 ? 'Hjalmarino climbs onto Spooder. SPOODMARINO!' : (now[0] ? now[0].name : u.name) + ' goes it alone. SPOODMARINO!', 'hero');
    },
  });

  // ---- passive: Batteries Included -------------------------------------------------------------------------------------
  const PASSIVE = {
    name: 'Batteries Included',
    desc: 'Starts each fight with Hjalmarino (a mechanical monkey) and Spooder (a mechanical spider), who act on his turn. ' +
      'A scrapped one reboots at its Scrap Heap on his ' + NTH[SCRAP_TURNS] + ' turn after (' + REBOOT_SHARE + ') and sits that turn out.',
    // engine hook E1: what ending his turn on (x, y) is worth for the bask (the T8 lesson)
    autoplayEnd: function (unit, x, y) { return baskEnd(unit, x, y); },
    // HUD hook (h19 QA-BIZ-4): the move hint, the tile panel and End Turn say where his turn has to end for the bask
    turnEndNote: function (unit, x, y, moved) { return baskNote(unit, x, y, moved); },
    hooks: {
      onCombatStart: function (u) {
        if (!active(u)) return;
        u.data = u.data || {};
        u.data.biz = freshData();
        startingBots(u);
      },
      onTurnStart: function (u) {
        if (!active(u)) return;
        tickScrap(u);
        syncHeaps(u);
        syncChip(u);
        tinDouble(u);
      },
      onTurnEnd: function (u) { bask(u); syncChip(u); },
      onCombatEnd: function (u) { if (u && u.data) delete u.data.biz; },
    },
  };

  // ---- hero ---------------------------------------------------------------------------------------------------------
  DD.registerHero({
    id: HERO, name: 'Biz', epithet: 'the Subcontractor', race: 'Lizardfolk', cls: 'Artificer',
    role: 'Robot commander · hides behind bots', complexity: 3,
    blurb: 'A lizard-man artificer who does not fight: he has people for that, robot people. Hjalmarino, a mechanical ' +
      'cymbal monkey that Hjalmar insists is a knockoff, and Spooder, a mechanical spider with very big eyes, do the fighting ' +
      'while Biz overclocks them, tapes them up and reboots them from the scrap. When they run hot, he basks on their engines ' +
      'like the cold-blooded professional he is.',
    color: BLUE, unlock: null, pronoun: 'he',
    stats: { hp: 22, ap: 3, mov: 4, armor: 0, init: -1 }, growth: { hp: 3 }, flags: {},
    sprite: BIZ_SPRITE,
    basic: 'biz_rivet_gun', signature: 'biz_spoodmarino',
    passive: PASSIVE,
    // ORDER MATTERS: the campaign sim forgets socket 0 first; Overclock (his heal) also carries a forgetWarning (plan D4)
    startingSkills: ['biz_duct_tape', 'biz_overclock'],
    skillPool: ['biz_duct_tape', 'biz_overclock', 'biz_reboot', 'biz_red_button', 'biz_hide', 'biz_firmware', 'biz_www',
      'biz_zip_line', 'biz_synergy'],
    summons: [HJ, SP],
    barks: {
      select: ['Biz. Artificer. Mostly management.', 'I don\'t fight. I have people for that. Robot people.',
        'Hjalmarino, Spooder: look busy. The client\'s watching.', 'You want it fixed, built or blown up? I do all three.',
        'Blueprints ready. Warranty... pending.'],
      start: ['Hjalmarino, Spooder: you\'re on. I\'ll be over here. Supervising.', 'Some assembly required. Let\'s assemble some violence.',
        'Roll for initiative! I\'ll roll in a bit. Cold-blooded.', 'Bots up front, lizard in the back. That\'s the business model.',
        'Nobody touch the big red button. Except me.'],
      move: ['Repositioning. Strategically. Away.', 'Scurry, scurry.', 'Keeping a safe managerial distance.', 'Mobile workshop on the move! Watch the toolbox!',
        'Looking for a warm rock. Or a warm robot.'],
      kill: ['Field test: passed!', 'Ka-ching. Business is good.', 'Another satisfied customer. Well. Customer.',
        'Rivet to the face. Efficient. Affordable.', 'I did that? Personally? Write that down, Spooder.'],
      hurt: ['Ow! Not the inventor!', 'Hey! Hit the robot! It\'s literally there for that!', 'My scales! I just polished those!',
        'Ow. It\'ll grow back. Probably.'],
      lowhp: ['Bots! Defensive formation! Around ME!', 'I\'m getting cold. That\'s bad. That\'s very lizard bad.',
        'Can somebody turn ME off and on again?', 'This is why I build robots! To get hit INSTEAD of me!'],
      downed: ['Keep... working... I\'m... on break...', 'Tell Spooder... I was proud...', 'Warranty... void...',
        'Should\'ve... built... a third one...'],
      revive: ['Rebooted! Did anyone save my work?', 'Back online! Minor scale damage.', 'I\'m up! Who left me on the cold floor?',
        'Turned off. Turned on again. Works every time.'],
      ally_down: ['Bots! Help them up! Gently! GENTLY!', 'Hang on, {downed}! I\'m sending a robot! The good one!',
        'No no no. I don\'t do medical. I do mechanical!', 'Hold on! I\'ll build a stretcher! Give me six turns!'],
      levelup: ['Patch notes: better at everything. Mostly the robots.', 'New firmware! For me. Lizards get updates too.',
        'Version two point oh! Some bugs fixed. Some added.', 'I\'ve had a breakthrough. Two, actually. Robot-shaped.'],
      victory: ['Job done. Invoice to follow.', 'Great work, team. Robot team. And you lot.', 'Clean win. Hjalmarino, stop clanging. HJALMARINO.',
        'Five stars. Would subcontract again.', 'Time to bask. Somebody find me a warm rock.'],
      // lines naming a hero play only with that hero in the fight (DD.Act.partyLines; "Hjalmarino" never matches \bHjalmar\b)
      idle: ['Hjalmar, it\'s not a knockoff. It\'s an homage.', 'Pebbles, can I sit next to you? You\'re so warm.',
        'Valdris, can I borrow the anvil? You\'ll get it back. In parts.', 'Betty, Spooder is not a snack. Spit it out.',
        'Slate, mind if I bask on you? You\'re a lovely warm rock.', 'Josiah, Onyx keeps stealing Spooder\'s screws.',
        'Is it cold in here, or am I just a lizard?', 'I\'m not hiding. I\'m supervising from cover.'],
      signature: ['COMBINE! Spoodmarino, assemble!', 'Behold! My masterpiece! Both of them! At once!',
        'Monkey, mount spider! This is not a drill! It IS a drill!', 'Product launch! Everybody gets a demo!', 'Spoodmarino! Patent pending!'],
      swap: ['Quick reshuffle, {ally}. Management stands at the back.', '{ally}, swap with me. You\'re sturdier. That\'s a compliment.'],
      overclock: ['Overclock! Redline it!', 'Run hot, buddy! I\'m freezing over here!', 'Feel that? That\'s the warranty voiding.',
        'Wind it up and let it go!'],
      bask: ['Ahh. Warm engine.', 'Five minutes on the radiator. Then war.', 'Warm machine, happy lizard.'],
      scrap_hjalmarino: ['HJALMARINO! I\'ll fix you! I have glue!', 'Not the monkey! Nobody touches the monkey!', 'Monkey down! It\'ll buff out.'],
      scrap_spooder: ['SPOODER! Who hurt my baby?!', 'Spooder! Eight legs and you still fell over?!', 'Spooder down! I\'ve got spare legs!'],
      reboot: ['Have you tried turning it off and on again?', 'And... we\'re back! Factory settings!', 'Rebooting. Please hold.',
        'Good as new! Newer, technically.'],
      boom: ['Big red button. Don\'t tell the warranty people.', 'I\'m so sorry. Not to you. To the robot.', 'This is fine. I kept the blueprints.'],
      firmware: ['Firmware update! Do not unplug!', 'Patch notes: it hits harder now. That\'s all the notes.', 'Upgrade installed! Please do not read the manual.'],
      web: ['Spooder, web them up!', 'World Wide Web, now in your area.', 'Sticky situation? Spooder\'s specialty.'],
      zip: ['Spooder! Reel \'em in!', 'Hold on tight! It\'s mostly safe!'],
      hide: ['Nothing to see here. Just a wall. A wall with a tail.', 'I\'m a rock. Rocks don\'t get hit.', 'Shh. I\'m camouflage.'],
      tape: ['Duct tape. Is there anything it can\'t do?', 'Taped! Structurally sound. Emotionally fragile.'],
      tail: ['My tail! Keep it. I\'ve got a spare.', 'Tail drop! Classic lizard move! Bye!'],
      warranty: ['Warranty claim approved!', 'And THAT is why you buy the extended warranty.'],
      // only after Hjalmar's line of the tin-double gag (tinDouble)
      tin_double: ['It\'s an homage, Hjalmar.', 'It\'s licensed, Hjalmar! ...Spiritually.', 'Hjalmar, it\'s a tribute act.'],
    },
  });

  // ---- hero items (rare, rare, legendary) ------------------------------------------------------------------------------
  DD.registerItem({
    id: REMOTE, name: 'Universal Remote', slot: 'weapon', rarity: 'rare', icon: '📡', hero: HERO,
    stats: { dmg: 0.1 },
    desc: '+10% damage. Overclock gives 1 more AP (' + (OC_AP + 1) + ' instead of ' + OC_AP + ').',
    flavor: 'Controls Hjalmarino, Spooder, any TV and, once, a very confused goblin.',
    hooks: {},   // Overclock's desc and execute read it (wears)
  });
  DD.registerItem({
    id: WARRANTY, name: 'Extended Warranty', slot: 'trinket', rarity: 'rare', icon: '📜', hero: HERO,
    stats: {},
    desc: 'The first time each of your constructs is scrapped in a fight, it reboots at the start of your next turn instead (with ' + REBOOT_SHARE + ').',
    flavor: 'Covers fire, flood, goblins and acts of DM. Read the fine print. There is no fine print. Biz checked.',
    hooks: {},   // scrapped() reads it: a kind's first scrap of the fight waits 1 of his turns instead of SCRAP_TURNS
  });
  DD.registerItem({
    id: TAIL, name: 'Spare Tail', slot: 'armor', rarity: 'legendary', icon: '🦎', hero: HERO,
    stats: { hp: 4 },
    desc: '+4 max HP. Once per fight, a hit that would down you leaves you at 1 HP instead: you drop your tail and scurry to the safest free tile within 3.',
    flavor: 'Lizards regrow their tails. Biz keeps a spare in a jar anyway. Peace of mind.',
    hooks: {
      // a death-save, not a heal (D9 counts them apart): once a fight he stays up at 1 HP
      preventDeath: function (unit) {
        if (!unit || unit.kind !== 'hero' || !hasItem(unit, TAIL)) return false;
        const D = dataOf(unit);
        if (D.tail) return false;
        D.tail = true;
        D.tailNow = true;
        unit.hp = 1;
        return true;
      },
      onDeathPrevented: function (unit) {
        const D = peek(unit);
        if (!D || !D.tailNow) return;
        D.tailNow = false;
        A().stopMove(unit);
        const from = { x: unit.x, y: unit.y }, spot = tailSpot(unit);
        if (spot && A().teleport(unit, spot.x, spot.y, { fx: false })) DD.FX.jump(unit, from, spot, { ms: 240 });
        DD.FX.text(from, '🦎 *wriggle*', { color: '#8cc63f', size: 14 });
        DD.FX.particles(from, { kind: 'dust', count: 6 });
        A().bark(unit, 'tail');
        A().log(unit.name + ' drops his tail and scurries off at 1 HP. It\'ll grow back.', 'hero');
      },
    },
  });

  // ---- loading-screen tips (all true) ------------------------------------------------------------------------------------
  DD.registerNarration('tips', [
    'Biz\'s robots act on his turn: Tab cycles Biz, Hjalmarino and Spooder, each with its own AP.',
    'Overclock one of Biz\'s robots, let it work, then end his turn next to it: he basks on the hot engine and heals.',
    'A scrapped robot reboots at its Scrap Heap ' + WORD[SCRAP_TURNS] + ' of Biz\'s turns later and spends that turn booting up. ' +
      'Turn It Off and On Again does it now.',
    'To pull Biz out of melee, have one of his robots swap with him: the mover provokes, Biz doesn\'t.',
  ]);

  // ---- test / debug API -------------------------------------------------------------------------------------------------
  /** Scrap his construct of `kind` through the real path (Act.kill: the def's onDeath runs scrapped()). Tests / debug. */
  function scrapNow(u, kind) {
    const c = constructOf(u, kind);
    return c ? A().kill(c, null, { force: true }) : false;
  }
  /** { hjalmarino: left | null, spooder: left | null }: the turns left on each scrapped kind. */
  function scrapTimers(u) {
    const D = peek(u), out = {};
    ORDER.forEach(function (k) { out[k] = D && D.scrap[k] ? D.scrap[k].left : null; });
    return out;
  }
  DD.Biz = {
    HERO: HERO, HJ: HJ, SP: SP, KINDS: KINDS, ORDER: ORDER, MK_AT: MK_AT, SCRAP_TURNS: SCRAP_TURNS, REBOOT_FRAC: REBOOT_FRAC, OVER: OVER, UPDATED: UPDATED,
    REBUILD: REBUILD, SCRAP: SCRAP, REMOTE: REMOTE, WARRANTY: WARRANTY, TAIL: TAIL, TIN_LINES: TIN_LINES,
    kindOf: kindOf, mkOf: mkOf, hpOf: hpOf, constructsOf: constructsOf, constructOf: constructOf, isMine: isMine, able: able,
    build: build, reboot: reboot, scrapTimers: scrapTimers, scrap: scrapNow, kindAtHeap: kindAtHeap, heapSpot: heapSpot, heapOk: heapOk,
    heapOf: function (u, kind) { return heapObj(u, kind); }, data: peek, syncChip: syncChip, bask: bask, tinDouble: tinDouble,
    zipSpot: zipSpot, tailSpot: tailSpot, comboArea: comboArea, webArea: webArea,
    heapLabel: heapLabel, syncHeaps: syncHeaps, rebootSpots: rebootSpots, TIN_LAUGH: TIN_LAUGH,   // h19 qa-fix:content
    bestHit: bestHit, canEndNextTo: canEndNextTo, staysPut: staysPut, overclockScore: overclockScore, baskEnd: baskEnd, boomValue: boomValue,
    warmScore: warmScore, BOOT: BOOT, justBack: justBack, OC_AP: OC_AP,   // fix:balance B1-B3
    baskNote: baskNote,   // fix:polish: the HUD's turnEndNote
    webScore: webScore, zipScore: zipScore, hideScore: hideScore, tapeScore: tapeScore, firmwareScore: firmwareScore,
    synergyScore: synergyScore,
    BIZ_SPRITE: BIZ_SPRITE, MONKEY_LOOKS: MONKEY_LOOKS, SPIDER_LOOKS: SPIDER_LOOKS,
    painters: { bizOverlay: bizOverlay, hjmOverlay: hjmOverlay, drawSpooder: drawSpooder, drawScrap: drawScrap, drawCombo: drawCombo },
  };
})();
