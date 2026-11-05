/* Dungeons and Degenerates — tests/hud_tests.js
 * HUD suites (prefix "hud:"): the combat screen (js/ui/combat_hud.js) mounted headlessly on real DD.Combat sandbox
 * fights built from tests/fixtures.js. v2 (initiative, no telegraphs, no Guard): panels, the initiative tracker,
 * deployment + "Roll for Initiative!" + the dice moment, turn flow (only the acting hero's turn group is selectable,
 * End Turn names who acts next, AI turns played back in step with the 'turn' markers), selection, move preview +
 * hazard warning, skill targeting with damage previews, consumables, interactions, Help Up, the inspect panel (enemy
 * move / reach / initiative / abilities, hero initiative / stats / Blessings), boss wind-ups, threat shading (hold Alt,
 * T, the button), log reveal + turn headers, keyboard map, autoplay lock, broken content, and the end-of-fight hand-off.
 * Every action goes through DD.HUD (the same code paths as mouse and keyboard input).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T) return;

  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
  function root() { return DD.HUD.root(); }
  function q(sel) { const r = root(); return r ? r.querySelector(sel) : null; }
  function qa(sel) { const r = root(); return r ? Array.prototype.slice.call(r.querySelectorAll(sel)) : []; }
  function ov() { return DD.Render.overlay; }
  function has(list, p) { return (list || []).some(function (t) { return t.x === p.x && t.y === p.y; }); }
  function byDef(id) { return DD.Combat.state.units.filter(function (u) { return u.defId === id && !u.dead; })[0]; }
  function text(sel) { const n = q(sel); return n ? n.textContent : ''; }
  function chips() { return DD.HUD.tracker().filter(function (x) { return !x.divider; }); }

  function ready(t) {
    if (!DD.UI || !DD.UI.screens || !DD.UI.screens.combat || !DD.HUD) { t.fail('combat screen (DD.HUD) is not registered'); return false; }
    if (!DD.Combat || !DD.Render || !DD.Render.overlay) { t.skip('engine or renderer missing'); return false; }
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('tests/fixtures.js not loaded'); return false; }
    return true;
  }

  /** Start a sandbox fight and show the HUD on it (sandbox default: heroes first, in the listed order, no dice). */
  function fight(cfg) {
    DD.UI.closeAllModals('test');
    const s = DD.Combat.sandbox(Object.assign({ w: 8, h: 8, seed: 11, theme: 'cellar' }, cfg));
    DD.UI.show('combat');
    if (DD.HUD.threat()) DD.HUD.threat(false);
    return s;
  }
  function leave() {
    if (!DD.UI) return;
    DD.UI.closeAllModals('test');
    DD.UI.hideTooltip();
    if (DD.UI.current === 'combat') DD.UI.show('title');
  }
  /** Run with DD.FX animating (not instant) and restore afterwards. */
  function withAnimatedFx(fn) {
    const F = DD.FX;
    const inst = F.instant;
    F.instant = false;
    try { return fn(F); } finally { F.reset(); F.instant = inst; }
  }

  // ---- mounting & panels ---------------------------------------------------------------------------------------------
  T.suite('hud: combat screen mounts with every panel on a sandbox fight', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 3 }, { id: 'test_mage', x: 1, y: 5 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }, { id: 'test_archer', x: 6, y: 6 }] });
      t.ok(DD.HUD.mounted(), 'HUD mounted');
      t.eq(DD.UI.current, 'combat', 'combat screen is current');
      t.eq(qa('.hud-card').length, 2, 'one party card per hero');
      t.eq(text('.hud-round .hr-num'), '1', 'round 1 shown');
      t.ok(/^Defeat all enemies/.test(text('.hud-obj .ho-text')), 'objective text from state.objective.text');
      const sel = DD.HUD.selected();
      t.ok(sel && sel.defId === 'test_knight', 'the acting hero (first in the order) is selected');
      t.eq(ov().selectedId, sel && sel.id, 'overlay.selectedId follows the selection');
      t.eq(ov().turnUnitId, sel && sel.id, 'overlay.turnUnitId marks whose turn it is');
      t.ok(ov().moveTiles.length > 0, 'reachable tiles shown for the selected hero');
      t.eq(qa('.hud-bar .hud-skill').length, 6, 'six action positions for a hero');
      t.eq(qa('.hud-bar .hud-skill.empty').length, 2, 'two empty sockets for a hero with 2 skills');
      t.eq(qa('.hud-bar .hud-skill .hs-key').map(function (k) { return k.textContent; }).join(''), '123456', 'hotkeys 1-6 in order');
      t.ok(q('.hud-skill.role-signature.is-disabled'), 'signature disabled below 100 Hype');
      t.ok(/Next: Wizzy McTest/.test(text('.hud-endbtn .btn-sub')), 'End Turn names who acts next: ' + text('.hud-endbtn .btn-sub'));
      t.ok(!/Guard|Block/.test(text('.hud-endbtn')), 'no Guard / Block preview on End Turn (v2)');
      t.ok(q('.hud-hype .meter'), 'Hype meter present');
      t.ok(q('.hud-threat'), 'threat shading toggle present');
      t.eq(qa('.hud-cons').length, 3, 'three consumable pockets (sandbox default)');
      t.ok(q('.hud-log .hl-list'), 'combat log present');
      t.ok(q('.hud-inspect').classList.contains('hud-hidden'), 'inspect panel hidden until something is hovered');
      t.ok(/Your Turn/.test(text('.hud-phase')), 'phase pill says Your Turn');
      t.ok(/Sir Testsalot/.test(text('.hud-round .hr-who')), 'the round box names who acts');
      // the initiative tracker
      t.ok(q('.hud-init') && !q('.hud-init').classList.contains('hud-hidden'), 'initiative tracker shown');
      t.eq(qa('.hud-init .tk-chip').length, 4, 'one portrait per initiative entry');
      t.ok(q('.hud-init .tk-chip.cur') && q('.hud-init .tk-chip.cur').dataset.unit === sel.id, 'the acting hero\'s portrait is highlighted');
      // party card details
      const card = qa('.hud-card')[0];
      t.ok(card.querySelector('.hud-hp .hh-text').textContent.indexOf('/') > 0, 'party card shows HP numbers');
      t.eq(card.querySelectorAll('.ap-pip.on').length, 3, 'the acting hero shows 3 AP pips');
      t.ok(card.classList.contains('cur') && /Your turn/i.test(card.querySelector('.hc-tag').textContent), 'its card glows and says "Your turn"');
      const other = qa('.hud-card')[1];
      t.eq(other.querySelectorAll('.ap-pip').length, 0, 'a hero outside its turn shows no AP pips');
      t.ok(/Acts next/.test(other.querySelector('.hc-when').textContent), 'it says when it acts: ' + other.querySelector('.hc-when').textContent);
      t.eq(other.querySelector('.hc-init').textContent, '2', 'and its initiative position');
    } finally { leave(); }
  });

  // ---- v2 turn flow: selection limited to the acting turn group -----------------------------------------------------------
  T.suite('hud: only the acting hero (and its summons) can be selected; Tab, cards and End Turn follow the order', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 2 }, { id: 'test_mage', x: 1, y: 4 }, { id: 'test_cleric', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }], enemyAi: false });
      const hs = DD.Combat.heroes();
      t.eq(DD.HUD.selected().id, hs[0].id, 'the knight acts first and is selected');
      t.ok(!DD.HUD.select(hs[1].id), 'select() refuses a hero whose turn it isn\'t');
      t.eq(DD.HUD.selected().id, hs[0].id, 'selection unchanged');
      qa('.hud-card')[1].click();
      t.eq(DD.HUD.selected().id, hs[0].id, 'clicking another hero\'s card does not select it');
      t.ok(/Wizzy McTest acts next/.test(DD.HUD.hint()) && /Sir Testsalot's turn/.test(DD.HUD.hint()), 'it says when that hero acts: ' + DD.HUD.hint());
      t.ok(!q('.hud-inspect').classList.contains('hud-hidden') && /Wizzy McTest/.test(text('.hud-inspect')), 'and pins its inspect panel');
      DD.HUD.rightClick();
      DD.HUD.click(hs[2].x, hs[2].y);
      t.eq(DD.HUD.selected().id, hs[0].id, 'clicking another hero on the board does not select it either');
      t.ok(DD.HUD.key('Tab'), 'Tab is consumed');
      t.ok(/Only Sir Testsalot acts this turn/.test(DD.HUD.hint()), 'Tab with a one-unit turn explains it: ' + DD.HUD.hint());
      // a summon acts on its owner's turn: Tab cycles hero <-> summon
      DD.Act.summon(hs[0], 'test_hound', 2, 2, { noFx: true, silent: true, ready: true });
      DD.HUD.refresh();
      const hound = byDef('test_hound');
      DD.HUD.key('Tab');
      t.eq(DD.HUD.selected() && DD.HUD.selected().id, hound && hound.id, 'Tab selects the knight\'s summon (same turn)');
      DD.HUD.key('Tab', { shiftKey: true });
      t.eq(DD.HUD.selected().id, hs[0].id, 'Shift+Tab goes back to the knight');
      // End Turn hands the dice to the next hero
      t.ok(DD.HUD.endTurn(), 'End Turn');
      t.eq(DD.Combat.current().id, hs[1].id, 'the engine moved to the mage\'s turn');
      t.eq(DD.HUD.selected().id, hs[1].id, 'the HUD selected the mage');
      t.ok(qa('.hud-card')[0].classList.contains('wait') && !qa('.hud-card')[0].classList.contains('cur'), 'the knight\'s card stops glowing');
      t.ok(qa('.hud-card').filter(function (c) { return c.classList.contains('cur'); }).length === 1, 'exactly one card glows');
      t.ok(/acts in|Acted/.test(qa('.hud-card')[0].querySelector('.hc-when').textContent), 'the knight says when it acts again: ' + qa('.hud-card')[0].querySelector('.hc-when').textContent);
      t.ok(DD.HUD.tracker()[0].unitId === hs[1].id && DD.HUD.tracker()[0].cur, 'the tracker starts with the mage now');
    } finally { leave(); }
  });

  // ---- movement --------------------------------------------------------------------------------------------------
  T.suite('hud: move preview, hazard warning, move and undo', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], surfaces: [{ x: 2, y: 1, id: 'fire', turns: 3 }], noPlan: true });
      const k = byDef('test_knight');
      DD.HUD.hover(3, 1);
      t.ok(ov().path.length === 2 && ov().path[1].x === 3, 'path preview to the hovered tile (start excluded)');
      t.ok(ov().pathHazard, 'path through fire is flagged as a hazard');
      t.ok(/Fire/.test(DD.HUD.hint()), 'hint names the hazard: ' + DD.HUD.hint());
      DD.HUD.hover(1, 3);
      t.ok(!ov().pathHazard && ov().path.length === 2, 'safe path is not flagged');
      t.ok(/Move here/.test(DD.HUD.hint()), 'hint explains the move cost: ' + DD.HUD.hint());
      DD.HUD.click(1, 3);
      t.ok(k.x === 1 && k.y === 3, 'click moved the knight');
      t.eq(k.ap, 2, 'the move cost 1 AP');
      t.ok(!q('.hud-undo').classList.contains('is-disabled'), 'Undo enabled after a move');
      t.ok(DD.HUD.key('z'), 'Z is consumed');
      t.ok(k.x === 1 && k.y === 1 && k.ap === 3, 'Z undid the move and refunded the AP');
      t.ok(q('.hud-undo').classList.contains('is-disabled'), 'Undo disabled again');
      DD.HUD.click(7, 1);
      t.ok(k.x === 1 && k.y === 1, 'clicking an unreachable tile does not move');
      t.ok(/Too far|Can't/.test(DD.HUD.hint()), 'and explains why: ' + DD.HUD.hint());
    } finally { leave(); }
  });

  // ---- skills -------------------------------------------------------------------------------------------------------
  T.suite('hud: skill targeting, damage previews, cast, self and directional skills', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2, skills: ['test_war_shout', 'test_shield_bash'] }, { id: 'test_mage', x: 2, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 3, y: 2 }, { id: 'test_archer', x: 6, y: 5 }], noPlan: true });
      const k = byDef('test_knight'), g = byDef('test_grunt');
      DD.HUD.select(k.id);
      t.ok(DD.HUD.key('1'), 'key 1 consumed');
      t.eq(DD.HUD.mode().kind, 'skill', 'key 1 arms the basic attack');
      t.ok(q('.hud-skill.armed'), 'armed button highlighted');
      t.ok(has(ov().targetTiles, g), 'the adjacent grunt is a valid target');
      t.eq(ov().moveTiles.length, 0, 'move tiles hidden while targeting');
      DD.HUD.hover(g.x, g.y);
      const p = DD.Combat.preview(k, k.basic, g.x, g.y);
      const e = p.perUnit[g.id];
      t.ok(e && e.dmg > 0, 'engine preview damages the grunt');
      t.eq(ov().previews[g.id] && ov().previews[g.id].dmg, e.dmg + (e.blocked || 0), 'overlay preview carries the full hit');
      t.ok(has(ov().areaTiles, g), 'area tiles under the cursor');
      t.ok(/Hits 1 foe/.test(DD.HUD.hint()), 'hint summarizes the preview: ' + DD.HUD.hint());
      const archer = byDef('test_archer');
      DD.HUD.click(archer.x, archer.y);
      t.ok(/Out of range/.test(DD.HUD.hint()), 'invalid target explains itself: ' + DD.HUD.hint());
      t.eq(DD.HUD.mode().kind, 'skill', 'still targeting after an invalid click');
      DD.HUD.rightClick();
      t.eq(DD.HUD.mode().kind, 'move', 'right-click cancels targeting');
      t.eq(Object.keys(ov().previews).length, 0, 'previews cleared');
      const hp0 = g.hp;
      DD.HUD.key('1');
      DD.HUD.click(g.x, g.y);
      t.eq(g.hp, hp0 - e.dmg, 'cast dealt exactly the previewed damage');
      t.eq(k.ap, 2, 'basic attack cost 1 AP');
      t.eq(DD.HUD.mode().kind, 'move', 'back to move mode after casting');
      // self skill: preview without aiming, second key press casts
      DD.HUD.key('2');
      t.ok(ov().areaTiles.length > 1, 'self skill shows its area immediately');
      const b0 = k.block;
      DD.HUD.key('2');
      t.ok(k.block > b0, 'pressing the key again casts the self skill');
      // directional skill: aim snaps toward the cursor
      DD.HUD.key('3');
      DD.HUD.hover(6, 2);
      t.ok(ov().areaTiles.length === 1 && ov().areaTiles[0].x === 3 && ov().areaTiles[0].y === 2, 'dir skill aims at the adjacent tile toward the cursor');
      t.ok(ov().previews[g.id] && /↷/.test(ov().previews[g.id].text), 'preview badge marks the push');
      const gx = g.x;
      DD.HUD.click(6, 2);
      t.ok(g.dead || g.x > gx, 'shield bash pushed the grunt east');
      t.eq(k.ap, 0, 'all AP spent');
      t.ok(q('.hud-endbtn').classList.contains('cta'), 'End Turn glows once the acting hero is out of AP (the mage acts on its own turn)');
      DD.HUD.clearHint();
      t.ok(/out of AP/.test(DD.HUD.hint()) && /next: Wizzy McTest/.test(DD.HUD.hint()), 'the hint says so and who is next: ' + DD.HUD.hint());
    } finally { leave(); }
  });

  // ---- consumables, interactions, Help Up --------------------------------------------------------------------------
  T.suite('hud: consumables, object interactions and Help Up', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2, hp: 10 }, { id: 'test_cleric', x: 2, y: 3 }, { id: 'test_rogue', x: 4, y: 2 }],
        enemies: [{ id: 'test_grunt', x: 7, y: 7 }], consumables: ['test_potion'], objects: [{ x: 3, y: 2, id: 'chest' }], enemyAi: false });
      const k = byDef('test_knight'), c = byDef('test_cleric'), r = byDef('test_rogue');
      t.eq(DD.HUD.selected().id, k.id, 'the knight\'s turn');
      const pot = qa('.hud-cons')[0];
      t.ok(pot && !pot.classList.contains('empty') && pot.querySelector('.kbd').textContent === '7', 'potion in pocket 7');
      DD.HUD.key('7');
      t.eq(DD.HUD.mode().kind, 'cons', 'key 7 arms the consumable');
      t.ok(has(ov().targetTiles, k), 'the knight can target himself');
      DD.HUD.hover(k.x, k.y);
      t.ok(ov().previews[k.id] && ov().previews[k.id].heal > 0, 'heal preview on the knight');
      DD.HUD.click(k.x, k.y);
      t.eq(k.hp, 20, 'potion healed 10');
      t.eq(DD.Combat.consumables().length, 0, 'potion used up');
      t.ok(qa('.hud-cons')[0].classList.contains('empty'), 'pocket shows empty');
      // Help Up (an adjacent downed ally)
      DD.Act.kill(c, null);
      DD.HUD.refresh();
      t.ok(c.downed, 'cleric is downed');
      t.ok(/Downed/.test(qa('.hud-card')[1].textContent), 'party card tags the downed hero');
      const tr = chips().filter(function (x) { return x.unitId === c.id; })[0];
      t.ok(tr && tr.mark === '💀', 'the tracker marks the downed hero (its turn is skipped)');
      const help = qa('.hud-skill.act').filter(function (b) { return /Help Up/.test(b.textContent); })[0];
      t.ok(help, 'Help Up button offered to the adjacent knight');
      if (help) help.click();
      t.ok(!c.downed && c.hp > 0, 'Help Up revived the cleric');
      t.eq(k.ap, 0, 'Help Up cost 2 AP');
      // object interaction via E on the rogue's own turn
      DD.HUD.endTurn();
      t.eq(DD.Combat.current().id, c.id, 'the revived cleric gets its own turn');
      DD.HUD.endTurn();
      t.eq(DD.HUD.selected().id, r.id, 'then the rogue\'s turn: selected');
      t.ok(qa('.hud-skill.act').some(function (b) { return /Open/.test(b.textContent); }), 'rogue next to the chest gets an Open button');
      DD.HUD.hover(3, 2);
      t.ok(!q('.hud-inspect').classList.contains('hud-hidden') && /Chest/.test(text('.hud-inspect')), 'hovering the chest describes it');
      t.ok(DD.HUD.key('e'), 'E is consumed');
      t.eq(r.ap, 2, 'interaction cost 1 AP');
    } finally { leave(); }
  });

  // ---- deployment + roll for initiative --------------------------------------------------------------------------------
  T.suite('hud: deployment — free swaps in the zone, then Roll for Initiative (button or Space)', function (t) {
    if (!ready(t)) return;
    try {
      const zone = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }];
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }],
        deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage');
      const s = DD.Combat.state;
      t.ok(DD.Combat.isDeploying() && s.round === 0 && !s.order, 'deployment open (round 0, no initiative yet)');
      t.ok(DD.HUD.select(k.id), 'any hero in the zone can be picked while deploying');
      t.eq(ov().deployTiles.length, zone.length, 'deploy tiles in the overlay');
      t.ok(/Deployment/.test(text('.hud-phase')), 'phase pill says Deployment');
      t.ok(/Deployment/.test(DD.HUD.hint()) && /Roll for Initiative/.test(DD.HUD.hint()), 'deployment hint shown: ' + DD.HUD.hint());
      t.ok(!q('.hud-rollcta').classList.contains('hud-hidden'), 'the big Roll for Initiative button is shown');
      t.ok(/Roll/.test(text('.hud-endbtn .btn-label')), 'End Turn reads Roll! while deploying');
      t.ok(chips().length === 3 && chips().every(function (x) { return x.total === null; }), 'the tracker lists everyone, unrolled');
      DD.HUD.click(2, 3);
      t.ok(k.x === 2 && k.y === 3, 'free reposition inside the zone');
      DD.HUD.click(m.x, m.y, { shift: true });
      t.ok(k.x === 1 && k.y === 2 && m.x === 2 && m.y === 3, 'shift-click swaps with an ally');
      DD.HUD.click(1, 5);
      t.ok(k.x === 1 && k.y === 2 && DD.Combat.isDeploying(), 'a tile outside the zone does nothing (no accidental start)');
      t.ok(/green tiles/.test(DD.HUD.hint()), 'and says why: ' + DD.HUD.hint());
      DD.HUD.key('2');
      t.ok(/roll for initiative/i.test(DD.HUD.hint()) && DD.Combat.isDeploying(), 'skill keys wait for the roll: ' + DD.HUD.hint());
      q('.hud-rollcta').click();
      t.ok(!DD.Combat.isDeploying() && !!s.order && s.round === 1, 'the button rolled initiative: round 1');
      t.eq(ov().deployTiles.length, 0, 'deploy tiles cleared');
      t.ok(q('.hud-rollcta').classList.contains('hud-hidden'), 'the roll button is gone');
      t.ok(chips().length === 3 && chips().every(function (x) { return x.total !== null; }), 'the tracker shows everybody\'s total');
      // the strip starts with the acting unit (the enemies before it already acted) and wraps into round 2
      const order = DD.Combat.order().map(function (e) { return e.unitId; });
      const at = order.indexOf(DD.Combat.current().id);
      const cycle = order.slice(at).concat(order.slice(0, at));
      t.eq(chips().map(function (x) { return x.unitId; }).join(','), cycle.join(','), 'in the rolled order, from the acting unit');
      t.ok(at === 0 || DD.HUD.tracker().some(function (x) { return x.divider && x.round === 2; }), 'with the round 2 divider when it wraps');
      t.ok(s.log.some(function (l) { return /^Roll for initiative!/.test(l.text); }), 'the roll is logged');
      // Space in deployment rolls too
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      t.ok(DD.Combat.isDeploying(), 'second fight deploying');
      t.ok(DD.HUD.key(' '), 'Space is consumed');
      t.ok(!DD.Combat.isDeploying() && DD.Combat.state.round === 1, 'Space rolled initiative');
    } finally { leave(); }
  });

  // ---- the dice moment ---------------------------------------------------------------------------------------------------
  T.suite('hud: the initiative dice moment — hosted for the FX marker, sorted, skippable, log held back', function (t) {
    if (!ready(t)) return;
    if (!DD.FXRender || !DD.FXRender.moments) { t.skip('fx_render moments missing'); return; }
    try {
      const zone = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 1 }];
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }, { id: 'test_archer', x: 6, y: 2 }],
        deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      const host = DD.FXRender.moments.initiative;
      t.ok(host && typeof host.start === 'function', 'the mounted HUD hosts the initiative moment');
      t.ok(!host.wants({ order: [{ unitId: 'x', roll: 0, total: 3 }] }), 'never for a fixed order (no dice)');
      DD.HUD.forceMoments(true);
      withAnimatedFx(function (F) {
        const s = DD.Combat.state;
        const lines0 = qa('.hud-log .log-line').length;
        DD.HUD.rollInitiative();
        t.ok(F.busy(), 'the roll queued its FX');
        for (let i = 0; i < 40 && !DD.HUD.moment(); i++) { F.update(40); DD.HUD.tick(); }
        const mo = DD.HUD.moment();
        t.ok(mo && mo.active, 'the dice moment is showing');
        if (!mo) return;
        const marker = F.active.filter(function (e) { return e.type === 'initiative'; })[0];
        t.ok(marker && marker.ms > 1000, 'the marker holds playback for the moment (' + (marker && marker.ms) + ' ms)');
        t.eq(mo.cards.length, s.order.length, 'one card per initiative entry');
        t.ok(!q('.hud-rolltray').classList.contains('hud-hidden') && !q('.hud-rollscrim').classList.contains('hud-hidden'), 'tray and scrim visible');
        t.ok(/Roll for Initiative/i.test(text('.hud-rolltray .rt-title')) && text('.hud-rolltray .rt-dm').length > 10, 'a title and a DM line');
        t.ok(q('.hud-init').classList.contains('hud-hidden'), 'the tracker waits for the moment');
        t.ok(/Initiative/.test(text('.hud-phase')), 'phase pill: Initiative!');
        // no spoilers while the dice roll: cards, init badges and End Turn don't reveal the order yet
        t.ok(qa('.hud-card .hc-when').every(function (w) { return /Rolling/.test(w.textContent) && !/#\d/.test(w.textContent); }), 'party cards say "Rolling…" (not their place in the order)');
        t.ok(qa('.hud-card .hc-init').every(function (b) { return b.textContent === ''; }), 'no initiative position badges yet');
        t.ok(/Rolling/.test(text('.hud-endbtn .btn-sub')) && !/Next:/.test(text('.hud-endbtn .btn-sub')), 'End Turn does not name who is next yet: ' + text('.hud-endbtn .btn-sub'));
        t.eq(DD.HUD.lock(), 'busy', 'input locked while it plays');
        t.eq(qa('.hud-log .log-line').filter(function (l) { return /^Roll for initiative!/.test(l.textContent); }).length, 0, 'the log does not spoil the result during the moment');
        // halfway: dice landed; later: sorted into initiative order
        F.update(marker.ms * 0.5); DD.HUD.tick();
        t.ok(DD.HUD.moment().cards.some(function (c) { return c.landed; }), 'dice land one after another');
        F.update(marker.ms * 0.3); DD.HUD.tick();
        const first = DD.HUD.moment().cards.filter(function (c) { return c.rank === 1; })[0];
        t.eq(first && first.unitId, s.order[0].unitId, 'rank 1 = first in the order');
        t.ok(qa('.hud-rolltray .rt-card.ranked').length === s.order.length, 'every card shows its rank after sorting');
        // skip
        t.ok(DD.HUD.key(' '), 'Space is consumed');
        t.eq(DD.HUD.moment(), null, 'Space skipped the moment');
        t.ok(q('.hud-rolltray').classList.contains('hud-hidden'), 'tray hidden');
        F.flush();
        DD.HUD.tick();
        t.ok(!q('.hud-init').classList.contains('hud-hidden') && qa('.hud-init .tk-chip').length === s.order.length, 'the tracker takes over');
        t.ok(qa('.hud-log .log-line').length > lines0 && qa('.hud-log .log-line').some(function (l) { return /^Roll for initiative!/.test(l.textContent); }), 'the roll reached the log afterwards');
      });
      // instant mode (tests, headless): no moment at all
      DD.HUD.forceMoments(false);
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      DD.HUD.rollInitiative();
      t.ok(!DD.HUD.moment() && !DD.FX.busy(), 'instant FX: no moment, straight to the tracker');
      t.eq(chips().length, 2, 'tracker filled');
    } finally { leave(); }
  });

  // ---- double triggers: a key / click that skips an animation never also acts ----------------------------------------------
  /** A real keydown through the UI's window listener (UI.onKeyDown → the HUD's onKey); true when it was consumed. */
  function press(k, opts) {
    const e = new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {}));
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  }
  T.suite('hud: a key that skips an animation never also acts — Space / Enter / End Turn on the dice moment, AI turns and the hand-over', async function (t) {
    if (!ready(t)) return;
    if (!DD.FXRender || !DD.FXRender.moments) { t.skip('fx_render moments missing'); return; }
    const F = DD.FX;
    const inst = F.instant;
    try {
      const zone = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 1 }];
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }],
        deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      DD.HUD.forceMoments(true);
      DD.HUD.realInput(true);
      F.instant = false;
      t.ok(press(' ') && !!DD.Combat.state.order, 'Space (a real key event) rolls initiative in deployment');
      // review: a double tap on Roll (or key bounce) used to flush the whole dice moment before it ever showed
      t.ok(press(' ') && F.busy(), 'a quick second Space right after the roll is swallowed (nothing flushed)');
      q('.hud-endbtn').click();
      t.ok(F.busy(), 'so is a quick second click on the button (the double click on Roll)');
      for (let i = 0; i < 60 && !DD.HUD.moment(); i++) { F.update(40); DD.HUD.tick(); }
      t.ok(!!DD.HUD.moment(), 'the dice moment plays');
      t.ok(press(' ') && !!DD.HUD.moment(), 'and a Space still inside that hold does not skip it');
      await tick(300);
      const s = DD.Combat.state;
      const turn0 = s.turn, cur0 = DD.Combat.current();
      t.ok(cur0 && cur0.side === 'hero' && s.phase === 'player', 'logically the first hero\'s turn is already waiting');
      // THE BUG: the Space that skipped the tray also ended that turn
      t.ok(press(' '), 'Space is consumed');
      t.eq(DD.HUD.moment(), null, 'Space skipped the dice moment');
      t.ok(s.turn === turn0 && DD.Combat.current() === cur0 && cur0.ap === DD.Combat.turnAp(cur0), 'and did NOT end ' + cur0.name + '\'s turn');
      t.ok(DD.HUD.graceLeft() > 0, 'a skip opens a short input guard (' + DD.HUD.graceLeft() + ' ms)');
      // the renderer finishes the marker before the HUD's own loop catches up (the race behind the bug)
      for (let i = 0; i < 40 && F.busy(); i++) F.update(40);
      t.ok(!F.busy(), 'playback is over');
      t.ok(press(' ') && s.turn === turn0, 'a quick second Space before the HUD hands the turn over does not end it either');
      t.ok(press('Enter') && s.turn === turn0, 'Enter is consumed (never activates a focused button) and does not end it');
      q('.hud-endbtn').click();
      t.eq(s.turn, turn0, 'nor does a quick click on End Turn');
      DD.HUD.tick();
      t.ok(DD.HUD.graceLeft() > 0 && DD.HUD.selected() === cur0, 'the HUD handed the turn over (selected, guard running)');
      const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      q('.hud-endbtn').dispatchEvent(md);
      t.ok(md.defaultPrevented, 'HUD buttons never take keyboard focus (a focused button would fire on Space / Enter)');
      await tick(DD.HUD.graceLeft() + 40);
      t.ok(press(' ') && (s.turn !== turn0 || DD.Combat.current() !== cur0), 'a deliberate Space after the guard ends the turn');
      // AI turns: the Space that skips their animations does not also end the next hero's turn
      F.reset();
      F.instant = true;
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 4, y: 2 }] });
      F.instant = false;
      DD.HUD.realInput(true);
      const k = byDef('test_knight');
      t.ok(DD.HUD.endTurn() && F.busy(), 'End Turn: the grunt\'s turn is queued for playback');
      const turn1 = DD.Combat.state.turn;
      t.ok(press(' ') && F.busy(), 'a double tap on End Turn does not also skip the grunt\'s turn it just started');
      await tick(300);
      t.ok(press(' ') && !F.busy(), 'Space skipped the AI animations');
      t.ok(press(' ') && DD.Combat.state.turn === turn1 && DD.Combat.current() === k && k.ap === DD.Combat.turnAp(k), 'a second quick Space did not end the knight\'s new turn');
      t.ok(/Turn/.test(text('.hud-phase')) && DD.HUD.lock() === null, 'control is back with the player');
    } finally {
      if (DD.HUD.mounted()) DD.HUD.realInput(false);
      F.reset();
      F.instant = inst;
      leave();
    }
  });

  T.suite('hud: a screen or modal that just appeared ignores Space / Enter for a moment (no double trigger across screens)', function (t) {
    if (!ready(t)) return;
    const real = DD.UI.inShowGuard;
    let clicks = 0;
    try {
      t.ok(typeof real === 'function' && real() === false, 'headless input is never guarded (tests act at once)');
      DD.UI.modal({ title: 'Guard test', body: 'Press Enter.', buttons: [{ label: 'OK', primary: true, onClick: function () { clicks++; } }] });
      DD.UI.inShowGuard = function () { return true; };
      t.ok(press('Enter') && clicks === 0 && DD.UI.modalCount() === 1, 'while guarded, Enter is swallowed (the modal stays, OK not clicked)');
      t.ok(press(' ') && clicks === 0, 'Space too');
      DD.UI.inShowGuard = real;
      t.ok(press('Enter') && clicks === 1 && DD.UI.modalCount() === 0, 'after the guard, Enter clicks the default button');
    } finally {
      DD.UI.inShowGuard = real;
      DD.UI.closeAllModals('test');
    }
  });

  // ---- attacks of opportunity in the HUD --------------------------------------------------------------------------------------
  T.suite('hud: attacks of opportunity — "⚔ Provokes N" on the move preview, engaged cards, inspect lines, the log and Undo', function (t) {
    if (!ready(t)) return;
    if (!DD.Combat.provokes || !DD.AI.engaged) { t.skip('engine without attacks of opportunity'); return; }
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }, { id: 'test_mage', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }, { id: 'test_archer', x: 7, y: 7 }], enemyAi: false });
      const k = byDef('test_knight'), g = byDef('test_grunt'), a = byDef('test_archer');
      const cards = qa('.hud-card');
      t.ok(/⚔ Engaged: Test Grunt \d+/.test(cards[0].querySelector('.hc-engaged').textContent) && !cards[0].querySelector('.hc-engaged').classList.contains('hud-hidden'),
        'the knight\'s card says who would punish a move: ' + cards[0].querySelector('.hc-engaged').textContent);
      t.ok(cards[1].querySelector('.hc-engaged').classList.contains('hud-hidden'), 'the mage (nobody next to it) has no engaged line');
      // the move preview: the engine's fewest-provoke path, who strikes and how hard
      const exp = DD.Combat.provokes(k, 1, 2);
      t.ok(exp.length === 1 && exp[0].unitId === g.id, 'walking west provokes the grunt (engine)');
      DD.HUD.hover(1, 2);
      t.ok(/⚔ Provokes 1 attack of opportunity: Test Grunt \d+/.test(DD.HUD.hint().replace(/\s+/g, ' ')), 'the hint says "⚔ Provokes 1" with who and how hard: ' + DD.HUD.hint());
      t.ok(/Can't be undone/.test(DD.HUD.hint()), 'and that the move can\'t be undone');
      t.ok(ov().pathHazard, 'the path turns red');
      t.ok(ov().previews[k.id] && ov().previews[k.id].dmg === exp[0].dmg && /⚔/.test(ov().previews[k.id].text), 'the knight wears the hit ("-' + exp[0].dmg + ' ⚔")');
      t.ok(ov().previews[g.id] && ov().previews[g.id].text === '⚔' && !ov().previews[g.id].dmg, 'the grunt wears a ⚔ (it strikes)');
      DD.HUD.threat(true);
      DD.HUD.hover(1, 2);
      t.ok(/⚔ Provokes 1 on the way: Test Grunt \d+/.test(DD.HUD.hint()), 'with threat shading on, the hint still leads with the provoke: ' + DD.HUD.hint());
      // review: the walk's hit counts toward "enough to drop" (reach alone would not, reach + the free hit does)
      const td = (DD.HUD.threatData().tiles || []).filter(function (x) { return x.x === 1 && x.y === 2; })[0];
      t.ok(!!td && td.dmg > 0, 'the grunt can reach that tile next turn (' + (td && td.dmg) + ')');
      if (td) {
        const kh = k.hp, kb = k.block;
        k.hp = td.dmg + 1; k.block = 0;
        DD.HUD.refresh();
        DD.HUD.hover(1, 2);
        t.ok(new RegExp('up to ' + td.dmg + ' 💀 enough to drop Sir Testsalot with the walk\'s ' + exp[0].dmg).test(DD.HUD.hint()), 'at ' + k.hp + ' HP the reach alone is not lethal, with the walk it is: ' + DD.HUD.hint());
        k.hp = kh; k.block = kb;
        DD.HUD.refresh();
      }
      DD.HUD.threat(false);
      DD.HUD.hover(2, 6);
      t.ok(!/Provokes/.test(DD.HUD.hint()), 'no provoke text on tiles that are not reachable moves');
      // review: a Bleeding mover pays its stacks when the walk ends — the preview says so next to the free hit
      DD.Act.addStatus(k, 'bleed', 2);
      DD.HUD.refresh();
      DD.HUD.hover(1, 2);
      t.ok(/Provokes 1/.test(DD.HUD.hint()) && /🩸 Bleeding 2: this move costs 2 HP when it ends\./.test(DD.HUD.hint()), 'Bleeding: the move costs its stacks too: ' + DD.HUD.hint());
      DD.Act.removeStatus(k, 'bleed', { silent: true });
      DD.HUD.refresh();
      // inspect lines
      DD.HUD.hover(k.x, k.y);
      t.ok(/Engaged — a move away provokes: Test Grunt/.test(text('.hud-inspect')), 'the knight\'s inspect panel names the grunt');
      t.ok(/Holds the line: a foe walking away from Sir Testsalot takes a free/.test(text('.hud-inspect')), 'and says the knight holds the line (melee basic)');
      DD.HUD.hover(g.x, g.y);
      t.ok(/Holds the line: walking away from it provokes .+\(≈\d+ to Sir Testsalot\)/.test(text('.hud-inspect')), 'the grunt\'s panel: walking away from it provokes (≈ on the selected hero): ' + text('.hud-inspect .hi-line.aoo'));
      DD.HUD.hover(a.x, a.y);
      t.ok(/No melee attack ready: walking away from it is free/.test(text('.hud-inspect')), 'the archer makes none');
      // review: the panel follows the engine's exceptions — a Dazzled AI unit never strikes, a taunted one only its taunter
      DD.Act.addStatus(g, 'dazzled');
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      t.ok(!DD.Combat.provokes(k, 1, 2).length && /No attacks of opportunity while Dazzled/.test(text('.hud-inspect')) && !/Holds the line: walking away from it/.test(text('.hud-inspect')),
        'a Dazzled grunt: no "holds the line" (the engine agrees: nothing provoked): ' + text('.hud-inspect .hi-line'));
      DD.Act.removeStatus(g, 'dazzled');
      const m0 = byDef('test_mage');
      DD.Act.addStatus(g, 'taunt', {}, m0);
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      t.ok(!DD.Combat.provokes(k, 1, 2).length && /taunted: only .+ provokes it/.test(text('.hud-inspect')) && !/≈\d+ to Sir Testsalot/.test(text('.hud-inspect')),
        'a grunt taunted by the mage: only the mage provokes it, no estimate on the knight: ' + text('.hud-inspect .hi-line.aoo'));
      DD.Act.removeStatus(g, 'taunt');
      DD.HUD.refresh();
      DD.HUD.hover(null);
      // the move: the grunt strikes, the log marks it, the first one explains the rule, Undo explains its refusal
      const hp0 = k.hp + k.block;
      DD.HUD.click(1, 2);
      t.ok(k.x === 1 && k.y === 2 && k.hp + k.block === hp0 - exp[0].dmg, 'the knight walked and took exactly the previewed hit');
      const line = qa('.hud-log .log-line.aoo')[0];
      t.ok(line && /attack of opportunity/i.test(line.textContent), 'the log line is marked as an attack of opportunity');
      t.ok(/Attack of opportunity!/.test(DD.HUD.hint()) && /never provoke/.test(DD.HUD.hint()), 'the first one of the fight explains the rule: ' + DD.HUD.hint());
      t.ok(q('.hud-undo').classList.contains('is-disabled'), 'Undo is off after a provoking move');
      DD.HUD.key('z');
      t.ok(/provoked an attack of opportunity/.test(DD.HUD.hint()), 'and Z says why: ' + DD.HUD.hint());
      // its reaction is spent this round: stepping back next to it and away again is free (and the HUD says so)
      DD.HUD.clearHint();
      DD.HUD.click(2, 2);
      t.ok(k.x === 2 && k.y === 2, 'back next to the grunt (stepping next to a foe never provokes)');
      t.ok(cards[0].querySelector('.hc-engaged').classList.contains('hud-hidden'), 'no engaged line: the grunt\'s attack of opportunity is spent');
      DD.HUD.hover(2, 1);
      t.ok(!/Provokes/.test(DD.HUD.hint()) && /already used its attack of opportunity this round/.test(DD.HUD.hint()), 'the move hint says this walk is free: ' + DD.HUD.hint());
      DD.HUD.hover(k.x, k.y);
      t.ok(/Test Grunt already used its attack of opportunity this round/.test(text('.hud-inspect')), 'so does the inspect panel');
      DD.HUD.hover(null);
      // the heroes hold the line too: an enemy walking away from the knight takes his free hit (logged, marked)
      const ghp = g.hp;
      DD.AI.moveTo(g, 6, 2);
      DD.HUD.refresh();
      t.ok(g.hp < ghp || g.dead, 'the grunt walking away from the knight took his attack of opportunity');
      t.ok(qa('.hud-log .log-line.aoo').length === 2 && /Sir Testsalot gets an attack of opportunity on Test Grunt/.test(qa('.hud-log .log-line.aoo')[1].textContent), 'logged and marked');
    } finally { leave(); }
  });

  // ---- the initiative tracker --------------------------------------------------------------------------------------------
  T.suite('hud: initiative tracker — order from the acting unit, next-round divider, joiners, marks, hover and click', function (t) {
    if (!ready(t)) return;
    try {
      fight({ w: 9, h: 9, heroes: [{ id: 'test_knight', x: 1, y: 2 }, { id: 'test_mage', x: 1, y: 5 }], enemies: [{ id: 'test_grunt', x: 6, y: 2 }, { id: 'test_archer', x: 7, y: 6 }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage'), g = byDef('test_grunt'), a = byDef('test_archer');
      t.eq(chips().map(function (x) { return x.name; }).join(','), 'Sir Testsalot,Wizzy McTest,Test Grunt,Test Archer', 'heroes first (sandbox order), the acting knight leads');
      t.ok(chips()[0].cur && !chips()[1].cur, 'only the acting unit is current');
      t.ok(!DD.HUD.tracker().some(function (x) { return x.divider; }), 'round 1 from the top: no divider yet');
      DD.HUD.endTurn();
      const tr = DD.HUD.tracker();
      t.eq(tr[0].unitId, m.id, 'the mage\'s turn leads now');
      const dv = tr.filter(function (x) { return x.divider; })[0];
      t.ok(dv && dv.round === 2, 'a divider marks round 2');
      t.eq(tr[tr.length - 1].unitId, k.id, 'the knight is back after the divider (one full cycle)');
      t.ok(q('.hud-init .tk-div'), 'divider drawn');
      t.ok(qa('.hud-init .tk-chip')[1].style.opacity === '' || +qa('.hud-init .tk-chip')[1].style.opacity >= 0.99, 'the next unit stays crisp');
      t.ok(+qa('.hud-init .tk-chip')[3].style.opacity < 1, 'later ones fade with distance');
      // a unit arriving mid-round rolls (here: fixed order) and joins next round
      const minion = DD.Act.spawn('test_minion', 7, 7, { noFx: true, silent: true });
      DD.HUD.refresh();
      const j = chips().filter(function (x) { return x.joiner; })[0];
      t.ok(minion && j && j.unitId === minion.id, 'a mid-round arrival is listed after the divider as a joiner');
      t.ok(q('.hud-init .tk-chip.joiner'), 'its portrait is dashed');
      // marks: stunned, wind-up
      DD.Act.addStatus(g, 'stun', { turns: 1 }, m);
      DD.HUD.refresh();
      t.eq(chips().filter(function (x) { return x.unitId === g.id; })[0].mark, '💫', 'a stunned unit is marked (it loses its turn)');
      // hover = board highlight + inspect; click = pin
      DD.HUD.hoverTracker(a.id);
      t.ok(ov().hover && ov().hover.x === a.x && ov().hover.y === a.y, 'hovering a portrait highlights the unit on the board');
      t.ok(!q('.hud-inspect').classList.contains('hud-hidden') && /Test Archer/.test(text('.hud-inspect')), 'and opens its inspect panel');
      t.ok(q('.hud-init .tk-chip.hl') && q('.hud-init .tk-chip.hl').dataset.unit === a.id, 'its portrait lights up');
      DD.HUD.hoverTracker(null);
      DD.HUD.clickTracker(a.id);
      t.ok(/pinned/.test(text('.hud-inspect')), 'clicking a portrait pins its inspect panel');
      DD.HUD.rightClick();
      DD.HUD.clickTracker(m.id);
      t.eq(DD.HUD.selected().id, m.id, 'clicking the acting hero\'s portrait selects it');
      // the board highlight works the other way round too
      DD.HUD.hover(g.x, g.y);
      t.ok(q('.hud-init .tk-chip.hl') && q('.hud-init .tk-chip.hl').dataset.unit === g.id, 'hovering a unit on the board lights up its portrait');
      // dead units leave the tracker
      DD.Act.kill(a, k);
      DD.HUD.refresh();
      t.ok(!chips().some(function (x) { return x.unitId === a.id; }), 'a dead unit leaves the tracker');
    } finally { leave(); }
  });

  // ---- AI turns follow the playback ------------------------------------------------------------------------------------
  T.suite('hud: AI turns play out after End Turn — the HUD follows the turn markers, input locked, Space skips', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 4, y: 2 }] });
      const k = byDef('test_knight'), g = byDef('test_grunt');
      withAnimatedFx(function (F) {
        DD.HUD.endTurn();
        t.ok(F.busy(), 'the grunt\'s turn was queued for playback');
        t.eq(DD.Combat.current().id, k.id, 'logically it is already the knight\'s next turn');
        t.eq(DD.Combat.state.round, 2, 'round 2 (logic)');
        DD.HUD.tick();
        t.eq(DD.HUD.lock(), 'busy', 'input locked during playback');
        // play up to the grunt's turn marker
        for (let i = 0; i < 20 && !(DD.HUD.shownTurnUnit() && DD.HUD.shownTurnUnit().id === g.id); i++) { F.update(16); DD.HUD.tick(); }
        t.eq(DD.HUD.shownTurnUnit() && DD.HUD.shownTurnUnit().id, g.id, 'the HUD shows the grunt\'s turn while it animates');
        t.ok(/Enemy Turn/.test(text('.hud-phase')) && /Test Grunt/.test(text('.hud-round .hr-who')), 'phase pill + round box name the acting enemy');
        t.eq(text('.hud-round .hr-num'), '1', 'the round shown is the playback\'s (round 1)');
        t.ok(q('.hud-init .tk-chip.cur.foe') && q('.hud-init .tk-chip.cur').dataset.unit === g.id, 'the tracker highlights the grunt');
        t.eq(ov().turnUnitId, g.id, 'the board ring follows');
        t.ok(/Test Grunt/.test(DD.HUD.hint()) && /Space/.test(DD.HUD.hint()), 'hint: whose turn + Space skips: ' + DD.HUD.hint());
        t.ok(/Space skips/.test(text('.hud-endbtn .btn-sub')) && !/Next:/.test(text('.hud-endbtn .btn-sub')), 'End Turn says Space skips (no stale "Next:"): ' + text('.hud-endbtn .btn-sub'));
        const kx = k.x, ky = k.y;
        DD.HUD.click(1, 4);
        t.ok(k.x === kx && k.y === ky, 'clicks are ignored during AI turns');
        DD.HUD.key(' ');
        t.ok(!F.busy(), 'Space skipped the animations');
        DD.HUD.tick();
        t.eq(DD.HUD.shownTurnUnit() && DD.HUD.shownTurnUnit().id, k.id, 'back to the knight\'s turn');
        t.eq(text('.hud-round .hr-num'), '2', 'round 2 shown');
        t.eq(DD.HUD.lock(), null, 'input unlocked');
        t.eq(DD.HUD.selected().id, k.id, 'the knight is selected for his turn');
      });
    } finally { leave(); }
  });

  // ---- inspect panel ----------------------------------------------------------------------------------------------------
  T.suite('hud: inspect panel — enemy move, reach, initiative and abilities; hero initiative, stats and Blessings', function (t) {
    if (!ready(t)) return;
    const pid = DD.defs.passives ? Object.keys(DD.defs.passives).filter(function (id) { const d = DD.defs.passives[id]; return d && d.rarity !== 'cursed' && !d.requires; })[0] : null;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2, passives: pid ? [{ id: pid, level: 1 }] : [] }, { id: 'test_mage', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 5, y: 2 }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage'), g = byDef('test_grunt');
      DD.HUD.hover(g.x, g.y);
      const insp = q('.hud-inspect');
      const txt = insp.textContent;
      t.ok(!insp.classList.contains('hud-hidden') && /Test Grunt/.test(txt), 'hovering an enemy opens its panel');
      t.ok(/👣 3 Move/.test(txt), 'move: ' + txt.slice(0, 120));
      t.ok(/Init \+0/.test(txt) && insp.querySelector('.hi-order') && /#3/.test(insp.querySelector('.hi-order').textContent), 'initiative modifier and position (#3)');
      t.ok(/it can reach: Sir Testsalot \d+/.test(txt), 'reach: who it can hit on its next turn: ' + txt);
      t.ok(/Abilities/.test(txt) && insp.querySelector('.hi-abil'), 'an Abilities section');
      const stab = DD.getSkill('test_grunt_stab');
      t.ok(stab && txt.indexOf(stab.name) >= 0 && txt.indexOf(DD.skillDesc(stab, 1, g)) >= 0, 'each ability: name + its exact desc');
      t.ok(/Melee|Range/.test(insp.querySelector('.hi-abil .ha-meta').textContent), 'and its range');
      t.ok(!/Next turn: nothing planned/.test(txt), 'no telegraph section for a normal enemy');
      t.eq(ov().reach && ov().reach.unitId, g.id, 'its reach is shaded on the board');
      t.ok(ov().reach.tiles.some(function (p) { return p.x === k.x && p.y === k.y; }), 'covering the knight it can hit');
      // resistances
      DD.HUD.hover(null);
      g.resist = { fire: 0.5, frost: 1.5 };
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      t.ok(/Resists fire/.test(text('.hud-inspect')) && /Weak to frost/.test(text('.hud-inspect')), 'resistance pills');
      // a stunned enemy loses its next turn
      DD.Act.addStatus(g, 'stun', { turns: 1 }, k);
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      t.ok(/loses its next turn/.test(text('.hud-inspect')), 'stunned: the panel says it loses its next turn');
      t.ok(!ov().reach, 'and no reach is shaded');
      // heroes: initiative, stats, Blessings
      DD.HUD.hover(m.x, m.y);
      const ht = text('.hud-inspect');
      t.ok(/Init \+1/.test(ht), 'hero initiative modifier (stats.init): ' + ht.slice(0, 160));
      t.ok(/Acts next \(#2 of 3\)/.test(ht), 'when it acts: ' + ht.slice(0, 200));
      t.ok(/👣 4 Move/.test(ht), 'hero stats');
      DD.HUD.hover(k.x, k.y);
      t.ok(/3\/3 AP/.test(text('.hud-inspect')), 'the acting hero shows its AP');
      if (pid) t.ok(q('.hud-inspect .hi-bless') && q('.hud-inspect .hi-bless').children.length >= 1, 'Blessings as chips');
      t.ok(/✓ No enemy can reach this tile|Enemies that can reach this tile/.test(text('.hud-inspect')), 'and what can reach its tile');
    } finally { leave(); }
  });

  // ---- boss wind-ups ---------------------------------------------------------------------------------------------------------
  T.suite('hud: boss wind-ups — the panel, the bubble data, the move hint; a stun interrupts', function (t) {
    if (!ready(t)) return;
    if (!DD.getEnemy('test_boss') || !DD.AI || typeof DD.AI.windUp !== 'function') { t.skip('test boss or AI.windUp missing'); return; }
    try {
      fight({ w: 11, h: 9, heroes: [{ id: 'test_knight', x: 2, y: 4 }, { id: 'test_mage', x: 2, y: 7 }], enemies: [{ id: 'test_boss', x: 8, y: 4 }], enemyAi: false });
      const k = byDef('test_knight'), b = byDef('test_boss');
      const w = DD.AI.windUp(b, 'test_boss_meteor', { x: 3, y: 4 }, { label: 'Meteor of Regression' });
      DD.HUD.refresh();
      t.ok(w && b.intents.length === 1, 'the boss winds up');
      t.eq(chips().filter(function (x) { return x.unitId === b.id; })[0].mark, '⏳', 'its tracker portrait shows ⏳');
      DD.HUD.hover(b.x, b.y);
      const txt = text('.hud-inspect');
      t.ok(/Winding up/.test(txt) && /Meteor of Regression/.test(txt), 'the inspect panel lists the wind-up: ' + txt.slice(0, 220));
      t.ok(/\d+ dmg/.test(txt) && /next turn/.test(txt), 'with its damage and when it lands');
      t.ok(/Stun, sleep, freeze or polymorph/.test(txt), 'and how to stop it (DD.AI.describe)');
      t.eq(ov().focusIntentUnitId, b.id, 'hovering the boss focuses its wind-up on the board');
      const tiles = DD.AI.intentTiles(b, w);
      const spot = tiles.filter(function (p) { return DD.Combat.reachable(k).has(p.x + ',' + p.y); })[0];
      if (spot) {
        DD.HUD.hover(spot.x, spot.y);
        t.ok(/⏳ Meteor of Regression \d+ lands here at the start of its next turn/.test(DD.HUD.hint()), 'moving into it warns: ' + DD.HUD.hint());
      }
      DD.HUD.hover(tiles[0].x, tiles[0].y);
      t.ok(/Wind-up lands here/.test(text('.hud-inspect')) || /lands here/.test(DD.HUD.hint()), 'the tile names the wind-up');
      // the knight stands in it (target 3,4 radius 1 covers 2,4)
      DD.HUD.hover(k.x, k.y);
      t.ok(/A wind-up lands here/.test(text('.hud-inspect')), 'the hero panel warns about the wind-up on its tile');
      // interrupted by a stun
      DD.Act.addStatus(b, 'stun', { turns: 1 }, k);
      DD.HUD.refresh();
      t.eq(b.intents.length, 0, 'a stun interrupts the wind-up');
      DD.HUD.hover(b.x, b.y);
      t.ok(!/Winding up/.test(text('.hud-inspect')), 'the panel no longer lists it');
    } finally { leave(); }
  });

  // ---- threat shading -------------------------------------------------------------------------------------------------------
  T.suite('hud: threat shading — hold Alt, T or the button; enemy reach + auras; lethal tiles', function (t) {
    if (!ready(t)) return;
    try {
      fight({ w: 10, h: 8, heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }, { id: 'test_archer', x: 9, y: 7 }], enemyAi: false });
      const k = byDef('test_knight'), g = byDef('test_grunt'), a = byDef('test_archer');
      t.ok(!DD.HUD.threat() && !ov().threat, 'off by default');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true, cancelable: true }));
      t.ok(DD.HUD.threat(), 'holding Alt turns it on');
      const th = ov().threat;
      t.ok(th && th.tiles.length > 0 && th.ref > 0, 'overlay.threat lists tiles (' + (th ? th.tiles.length : 0) + ')');
      const map = DD.AI.threatMap('hero');
      let missing = 0;
      map.forEach(function (v, key) { const p = key.split(','); if (!th.tiles.some(function (x) { return x.x === +p[0] && x.y === +p[1] && x.dmg >= v.dmg; })) missing++; });
      t.eq(missing, 0, 'every tile of DD.AI.threatMap is shaded with at least its damage');
      t.ok(q('.hud-threat').classList.contains('on'), 'the button shows it is on');
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true, cancelable: true }));
      t.ok(!DD.HUD.threat() && !ov().threat, 'releasing Alt hides it');
      // T toggles (sticky)
      t.ok(DD.HUD.key('t'), 'T is consumed');
      t.ok(DD.HUD.threat() && !!ov().threat, 'T toggles it on');
      // hint over a tile in reach
      const inReach = DD.HUD.threatData().tiles.filter(function (x) { return x.reach > 0 && DD.Combat.reachable(k).has(x.x + ',' + x.y); })[0];
      if (inReach) {
        DD.HUD.hover(inReach.x, inReach.y);
        t.ok(/can reach this tile/.test(DD.HUD.hint()) && /Test Grunt|Test Archer/.test(DD.HUD.hint()), 'the hint names who can reach the hovered tile: ' + DD.HUD.hint());
      }
      const safe = DD.Combat.reachable(k);
      let safeTile = null;
      safe.forEach(function (e) { if (!safeTile && !DD.HUD.threatData().tiles.some(function (x) { return x.x === e.x && x.y === e.y; })) safeTile = e; });
      if (safeTile) { DD.HUD.hover(safeTile.x, safeTile.y); t.ok(/Out of every enemy's reach/.test(DD.HUD.hint()), 'a safe tile says so: ' + DD.HUD.hint()); }
      // auras are included (threatAt)
      a.hooks = Object.assign({}, a.hooks || {}, { threatAt: function (e, u, tile) { return tile.x === 0 && tile.y === 0 ? { dmg: 9, label: 'Test Aura' } : 0; } });
      DD.HUD.refresh();
      const corner = DD.HUD.threatData().tiles.filter(function (x) { return x.x === 0 && x.y === 0; })[0];
      t.ok(corner && corner.aura === 9 && corner.dmg >= 9, 'aura damage (threatAt) is part of the shading');
      // lethal tiles for the selected hero
      k.hp = 3; k.block = 0;
      DD.HUD.refresh();
      t.ok(DD.HUD.threatData().tiles.some(function (x) { return x.lethal; }) && ov().threat.tiles.some(function (x) { return x.lethal; }), 'tiles that would drop the hero are flagged lethal');
      // card line while it is on (the knight stands in the grunt's reach after a walk up)
      g.x = 3; g.y = 3;
      DD.HUD.refresh();
      t.ok(/can reach: up to \d+/.test(qa('.hud-card')[0].querySelector('.hc-threat').textContent), 'party cards show the reach on their tile: ' + qa('.hud-card')[0].querySelector('.hc-threat').textContent);
      q('.hud-threat').click();
      t.ok(!DD.HUD.threat() && !ov().threat, 'the button toggles it off');
      // four reachers: the list names three and says how many more ("+1" alone read like damage)
      [[3, 4], [4, 3], [3, 2]].forEach(function (p) { DD.Act.spawn('test_grunt', p[0], p[1], { noFx: true, silent: true }); });
      DD.HUD.threat(true);
      DD.HUD.refresh();
      const crowd = DD.HUD.threatData().tiles.filter(function (x) { return DD.Combat.reachable(k).has(x.x + ',' + x.y) && DD.AI.threatMap('hero').get(x.x + ',' + x.y).from.length >= 4; })[0];
      if (crowd) {
        DD.HUD.hover(crowd.x, crowd.y);
        t.ok(/\(\+\d+ more\)/.test(DD.HUD.hint()) && !/\d \+\d/.test(DD.HUD.hint()), 'more than three reachers: "(+N more)": ' + DD.HUD.hint());
      } else t.fail('no tile within reach of four foes in this layout');
    } finally { leave(); }
  });

  // ---- log ---------------------------------------------------------------------------------------------------------------
  T.suite('hud: log lines are revealed in step with FX playback', function (t) {
    if (!ready(t)) return;
    const F = DD.FX;
    const inst = F.instant;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], noPlan: true });
      F.instant = false;
      F.push({ type: 'wait', ms: 400 });
      F.push({ type: 'wait', ms: 400 });
      DD.Act.log('HUD sync line', 'system');
      const shown = function () { return qa('.hud-log .log-line').some(function (l) { return l.textContent === 'HUD sync line'; }); };
      DD.HUD.tick();
      t.ok(!shown(), 'hidden while the FX before it are still queued');
      t.eq(DD.HUD.lock(), 'busy', 'input locked while FX play');
      F.update(16);
      DD.HUD.tick();
      t.ok(!shown(), 'still hidden while its FX have not started');
      F.flush();
      DD.HUD.tick();
      t.ok(shown(), 'revealed once playback reaches it');
      t.eq(DD.HUD.lock(), null, 'input unlocked when FX are idle');
    } finally {
      F.reset();
      F.instant = inst;
      leave();
    }
  });

  T.suite('hud: the log gets "X\'s turn" headers for turns that did something (empty turns skipped)', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }, { id: 'test_mage', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }] });
      const k = byDef('test_knight'), g = byDef('test_grunt');
      DD.HUD.key('1');
      DD.HUD.click(g.x, g.y);
      DD.HUD.endTurn();   // knight → mage
      DD.HUD.endTurn();   // mage (did nothing) → the grunt acts → knight, round 2
      const heads = qa('.hud-log .hl-turn').map(function (h) { return h.textContent; });
      t.ok(heads.some(function (h) { return /Sir Testsalot's turn/.test(h); }), 'the knight\'s attack got a header: ' + heads.join(' | '));
      t.ok(heads.some(function (h) { return /Test Grunt's turn/.test(h); }), 'the grunt\'s turn got a header');
      t.ok(!heads.some(function (h) { return /Wizzy McTest's turn/.test(h); }), 'the mage\'s empty turn got none');
      const gh = qa('.hud-log .hl-turn').filter(function (h) { return /Test Grunt/.test(h.textContent); })[0];
      t.ok(gh && gh.classList.contains('foe') && gh.nextElementSibling && gh.nextElementSibling.classList.contains('log-line'), 'enemy headers are red and lead their lines');
      t.ok(gh && /Test Grunt|Sir Testsalot/.test(gh.nextElementSibling.textContent), 'the line under it is the grunt\'s action: ' + (gh && gh.nextElementSibling.textContent));
      t.ok(k && !k.dead, 'the knight survived to read it');
      // noise: a pack of arrivals rolling initiative becomes one line
      const n0 = qa('.hud-log .log-line').length;
      DD.Act.log('Test Minion rolls initiative: 12 (joins next round).', 'system');
      DD.Act.log('Test Minion rolls initiative: 7 (joins next round).', 'system');
      DD.Act.log('Test Minion rolls initiative: 15 (joins next round).', 'system');
      DD.HUD.tick();
      const joins = qa('.hud-log .log-line.join');
      t.eq(qa('.hud-log .log-line').length, n0 + 1, 'three arrivals = one log line');
      t.ok(joins.length === 1 && /Joining next round: Test Minion \(12\), Test Minion \(7\), Test Minion \(15\)/.test(joins[0].textContent), 'listing each roll: ' + (joins[0] && joins[0].textContent));
    } finally { leave(); }
  });

  // ---- keyboard, menu, autoplay -------------------------------------------------------------------------------------------
  T.suite('hud: keyboard map, menu and autoplay lock', function (t) {
    if (!ready(t)) return;
    const hadMain = Object.prototype.hasOwnProperty.call(DD, 'Main');
    const oldMain = DD.Main;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], noPlan: true });
      const k = byDef('test_knight');
      t.ok(!DD.HUD.key('w'), 'W is left to the camera');
      t.ok(!DD.HUD.key('f'), 'F is left to the camera');
      t.ok(DD.HUD.key('4'), 'number keys are consumed');
      t.ok(/empty/i.test(DD.HUD.hint()), 'empty socket key explains itself: ' + DD.HUD.hint());
      t.ok(DD.HUD.key('6'), 'signature key consumed');
      t.ok(/Hype/.test(DD.HUD.hint()), 'signature without Hype explains itself: ' + DD.HUD.hint());
      t.ok(DD.HUD.key('Escape'), 'Esc consumed');
      const m = DD.UI.topModal();
      t.ok(m && /Paused/.test(m.el.textContent), 'Esc with nothing to cancel opens the menu');
      t.ok(m && /Restart Fight/.test(m.el.textContent) && /Resume/.test(m.el.textContent), 'debug fight menu offers Restart and Resume');
      t.ok(m && /Threat shading/.test(m.el.textContent) && !/Guard/.test(m.el.textContent), 'the controls list the threat shading (and no Guard)');
      DD.UI.closeAllModals('test');
      DD.Main = { autoplay: true };
      DD.HUD.refresh();
      t.eq(DD.HUD.lock(), 'autoplay', 'autoplay locks input');
      DD.HUD.click(1, 2);
      t.ok(k.x === 1 && k.y === 1, 'clicks are ignored under autoplay');
      t.ok(/Autoplay/.test(text('.hud-phase')), 'phase pill shows Autoplay');
    } finally {
      if (hadMain) DD.Main = oldMain; else delete DD.Main;
      leave();
    }
  });

  // ---- robustness ---------------------------------------------------------------------------------------------------------
  T.suite('hud: broken content does not break the HUD', function (t) {
    if (!ready(t)) return;
    const before = DD.problems.length;
    try {
      DD.registerSkill({
        id: 'hudtest_broken', name: 'Broken Skill', owner: 'test_knight', icon: '💥', ap: 1, levels: [{ dmg: 3 }],
        target: { type: 'unit', range: [1, 3], filter: 'enemy' },
        desc: function () { throw new Error('boom desc'); },
        canUse: function () { throw new Error('boom canUse'); },
        execute: function () { throw new Error('boom execute'); },
      });
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2, skills: ['hudtest_broken'] }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }], noPlan: true });
      t.ok(DD.HUD.mounted() && qa('.hud-bar .hud-skill').length === 6, 'HUD renders with a broken skill socketed');
      DD.HUD.key('2');
      const g = byDef('test_grunt');
      DD.HUD.hover(g.x, g.y);
      DD.HUD.click(g.x, g.y);
      t.ok(DD.HUD.mounted(), 'still mounted after using it');
      DD.HUD.hover(null);
      DD.HUD.key(' ');
      t.ok(DD.Combat.state.round >= 2, 'the fight goes on');
      const errs = DD.problems.slice(before).filter(function (w) { return /^Error in /.test(w); });
      t.ok(errs.length > 0, 'broken callbacks were contained and reported (' + errs.length + ')');
      t.ok(errs.every(function (w) { return /boom/.test(w); }), 'only the expected content errors were reported');
    } finally {
      delete DD.defs.skills.hudtest_broken;
      DD.problems.splice(before); // the expected content errors above must not fail this suite
      leave();
    }
  });

  // ---- end of the fight ---------------------------------------------------------------------------------------------------------
  T.suite('hud: victory without a run shows the result modal', async function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }], noPlan: true });
      const g = byDef('test_grunt');
      g.hp = 1;
      DD.HUD.key('1');
      DD.HUD.click(g.x, g.y);
      t.ok(g.dead && DD.Combat.state.result === 'victory', 'killing the last enemy wins');
      await tick(5);
      await tick(5);
      const m = DD.UI.topModal();
      t.ok(m && /Victory/.test(m.el.textContent), 'result modal says Victory');
      t.ok(m && /Restart Fight/.test(m.el.textContent) && /Title/.test(m.el.textContent), 'with Restart and Title');
      t.eq(DD.HUD.lock(), 'over', 'input locked after the fight');
      t.ok(q('.hud-init').classList.contains('hud-hidden'), 'the tracker steps aside after the fight');
    } finally { leave(); }
  });

  /** Run fights: the HUD must hand the result to DD.Run.finishCombat (the run layer waits for it with the UI on). */
  async function runFight(t, result, expectScreen) {
    if (!DD.Run || typeof DD.Run.newRun !== 'function' || !DD.Meta) { t.skip('run layer not available'); return; }
    const ids = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue'];
    const useUi = DD.Run.useUi;
    const meta = DD.util.deepClone(DD.Meta.data);
    const s = DD.UI.settings();
    const unlock = s.unlockAll;
    try {
      DD.Run.useUi = true;
      s.unlockAll = true;
      DD.Run.newRun(ids, 'normal', 777);
      s.unlockAll = unlock;
      t.ok(DD.Run.state && DD.Run.state.party.length === 4, 'run created');
      DD.Run.startCombat('test_a1_normal', 'normal');
      t.eq(DD.UI.current, 'combat', 'startCombat shows the HUD');
      t.ok(DD.Combat.state && DD.Combat.state.run === DD.Run.state, 'combat belongs to the run');
      t.ok(DD.HUD.mounted(), 'HUD mounted');
      t.ok(DD.Combat.isDeploying() && !q('.hud-rollcta').classList.contains('hud-hidden'), 'a run fight opens in deployment with the roll button');
      // [integration] a TPK: a defeat with heroes standing is a lost objective now (rewards, the run goes on)
      if (result === 'defeat') DD.Combat.heroes().forEach(function (u) { u.downed = true; u.hp = 0; });
      DD.Combat.finish(result);
      for (let i = 0; i < 4 && DD.UI.current === 'combat'; i++) await tick(5);
      t.eq(DD.UI.current, expectScreen, result + ' hands off to ' + expectScreen);
      t.ok(!DD.HUD.mounted(), 'HUD unmounted');
      t.eq(DD.Render.overlay.moveTiles.length, 0, 'overlay reset on unmount');
      t.ok(!DD.FXRender || !DD.FXRender.moments || !DD.FXRender.moments.initiative, 'the dice moment host is released on unmount');
    } finally {
      s.unlockAll = unlock;
      DD.Run.useUi = useUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY || 'run');
      DD.Meta.data = meta;
      if (DD.Meta.save) DD.Meta.save();
      leave();
    }
  }
  T.suite('hud: run victory goes to the rewards screen', function (t) { if (ready(t)) return runFight(t, 'victory', 'rewards'); });
  T.suite('hud: run defeat goes to the game over screen', function (t) { if (ready(t)) return runFight(t, 'defeat', 'gameover'); });

  // ---- UI polish: aura threats, enemy passives, Blood Price donors, gold pills, summon packs, the DM caption ----------
  /** threatAt as an instance hook on an enemy unit (the shared definition: def hooks or a status on it; instance
   *  hooks are another hook source of the same unit). */
  function aura(u, fn) { u.hooks = Object.assign({}, u.hooks || {}, { threatAt: fn }); }
  function tipOf(node) { const c = node && node._ddTip ? node._ddTip.content : null; return typeof c === 'function' ? c(node) : c || ''; }

  T.suite('hud: aura threats (enemy threatAt) on party cards, the move hint and the inspect panel', function (t) {
    if (!ready(t)) return;
    const gdef = DD.getEnemy('test_grunt');
    const hadPassive = Object.prototype.hasOwnProperty.call(gdef, 'passive');
    const oldPassive = gdef.passive;
    try {
      gdef.passive = { name: 'Union Rules', icon: '📢', desc: function (u) { return u.name + ' takes a break every 3 turns.'; } };
      fight({ w: 10, h: 8, heroes: [{ id: 'test_knight', x: 2, y: 3 }, { id: 'test_mage', x: 0, y: 7 }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }, { id: 'test_archer', x: 9, y: 0 }],
        surfaces: [{ x: 3, y: 4, id: 'fire', turns: 3 }], noPlan: true });
      const k = byDef('test_knight'), m = byDef('test_mage'), g = byDef('test_grunt'), a = byDef('test_archer');
      const calls = [];
      aura(g, function (e, u, tile, extra) { calls.push([e, u, tile, extra]); return DD.Grid.dist(e, tile) <= 3 ? { dmg: 7, label: 'Stink Aura' } : 0; });
      aura(a, function () { return undefined; });
      DD.HUD.refresh();
      t.ok(calls.length > 0 && calls[0][0] === g && calls[0][2] && typeof calls[0][2].x === 'number', 'threatAt(enemy, unit, tile, extra) is called with the enemy, the unit and a tile');
      const cards = qa('.hud-card');
      const kc = cards.filter(function (c) { return c.textContent.indexOf(k.name) >= 0; })[0];
      const mc = cards.filter(function (c) { return c.textContent.indexOf(m.name) >= 0; })[0];
      t.ok(kc && /⚠ Stink Aura: 7 next turn/.test(kc.querySelector('.hc-threat').textContent) && !kc.querySelector('.hc-threat').classList.contains('hud-hidden'), 'card: "⚠ Stink Aura: 7 next turn" (' + (kc && kc.querySelector('.hc-threat').textContent) + ')');
      t.ok(mc && mc.querySelector('.hc-threat').classList.contains('hud-hidden'), 'out of reach: no aura line (undefined from another enemy counts as 0)');
      t.ok(/Stink Aura/.test(tipOf(kc)), 'the card tooltip names the aura');
      const list = DD.HUD.auraThreats(k);
      t.ok(list.length === 1 && list[0].dmg === 7 && list[0].unit === g && list[0].label === 'Stink Aura', 'DD.HUD.auraThreats lists { unit, dmg, label }');
      // move preview: a tile still inside the aura, and one that escapes it
      DD.HUD.select(k.id);
      DD.HUD.hover(1, 3);
      t.ok(/Ending the turn here: Stink Aura 7 before its next turn/.test(DD.HUD.hint()), 'move hint warns for the tile it would end on: ' + DD.HUD.hint());
      DD.HUD.hover(0, 2);
      t.ok(/Out of Stink Aura here \(7 where/.test(DD.HUD.hint()) && q('.hud-hint').classList.contains('good'), 'move hint: escaping the aura reads as good news: ' + DD.HUD.hint());
      // inspect: the hero, the tile, the enemy (its passive line too)
      DD.HUD.hover(k.x, k.y);
      let txt = text('.hud-inspect');
      t.ok(/Auras: 7 before its next turn/.test(txt) && /Stink Aura \(Test Grunt\): 7/.test(txt), 'hero inspect lists the aura: ' + txt.slice(0, 220));
      t.ok(!/No enemy can reach this tile/.test(txt), 'and does not claim the tile is safe');
      DD.HUD.hover(3, 4);
      txt = q('.hud-inspect').classList.contains('hud-hidden') ? '' : text('.hud-inspect');
      t.ok(/If Sir Testsalot ends the turn here\s*Stink Aura \(Test Grunt\): 7/.test(txt), 'tile inspect: what the selected hero would take there: ' + txt.slice(0, 220));
      DD.HUD.hover(g.x, g.y);
      txt = text('.hud-inspect');
      t.ok(/📢 Union Rules:\s*Test Grunt takes a break every 3 turns\./.test(txt), 'enemy inspect shows its def passive (desc may be a function of the unit)');
      t.ok(/Stink Aura \(aura\) → Sir Testsalot 7/.test(txt), 'enemy inspect lists whom its aura hits: ' + txt.slice(0, 220));
      // a plain number is labelled with the enemy's name; two auras add up
      aura(a, function (e, u) { return u.kind === 'hero' ? 5 : 0; });
      DD.HUD.refresh();
      t.ok(/⚠ 2 auras: 12 next turn/.test(kc.querySelector('.hc-threat').textContent), 'two auras: "⚠ 2 auras: 12 next turn" (' + kc.querySelector('.hc-threat').textContent + ')');
      t.ok(DD.HUD.auraThreats(m).some(function (x) { return x.label === 'Test Archer' && x.dmg === 5; }), 'a number result is labelled with the enemy name');
      // lethal auras are flagged; Block soaks the ones it can, not { ignoreBlock: true } ones
      k.hp = 6; k.block = 0;
      DD.HUD.refresh();
      t.ok(kc.querySelector('.hc-threat').classList.contains('lethal') && /💀/.test(kc.querySelector('.hc-threat').textContent), 'an aura that would drop the hero is marked lethal');
      k.block = 20;
      DD.HUD.refresh();
      t.ok(!kc.querySelector('.hc-threat').classList.contains('lethal'), 'enough Block: not lethal');
      aura(a, function (e, u) { return u.kind === 'hero' ? { dmg: 6, label: 'Late Fees', ignoreBlock: true } : 0; });
      DD.HUD.refresh();
      t.ok(kc.querySelector('.hc-threat').classList.contains('lethal'), 'an aura that ignores Block is lethal through it');
      DD.HUD.hover(k.x, k.y);
      t.ok(/Late Fees \(Test Archer\): 6, ignores Block/.test(text('.hud-inspect')), 'the inspect line says it ignores Block');
      // a dead enemy's aura is gone
      g.dead = true;
      DD.HUD.refresh();
      t.ok(!DD.HUD.auraThreats(k).some(function (x) { return x.unit === g; }), 'dead enemies threaten nothing');
    } finally {
      if (hadPassive) gdef.passive = oldPassive; else delete gdef.passive;
      leave();
    }
  });

  T.suite('hud: Blood Price donor — "paid by" on the HP pill, the tooltip and the aim hint', function (t) {
    if (!ready(t)) return;
    if (!DD.getHero('sparrow') || !DD.getSkill('spa_hemoglob')) { t.skip('Sparrow not registered'); return; }
    try {
      fight({ heroes: [{ id: 'sparrow', x: 2, y: 3, skills: ['spa_hemoglob'] }], enemies: [{ id: 'test_grunt', x: 3, y: 3 }, { id: 'test_archer', x: 6, y: 6 }], noPlan: true });
      const sp = byDef('sparrow'), g = byDef('test_grunt');
      DD.HUD.select(sp.id);
      const listed = DD.resolve(DD.getSkill('spa_hemoglob').hpCost, DD.skillLevel(DD.getSkill('spa_hemoglob'), 1), sp, 0);
      t.ok(listed > 0, 'Hemo-Glob has an HP cost (' + listed + ')');
      let btn = qa('.hud-bar .hud-skill')[1];
      t.ok(btn.querySelector('.hs-hp') && !btn.querySelector('.hs-hp.paid'), 'no donor: the plain HP pill');
      t.eq(DD.HUD.hpPayer(sp, 'spa_hemoglob', 1), null, 'no donor without a Bleeding foe');
      DD.Act.addStatus(g, 'bleed', { stacks: 2, turns: 3 });
      DD.HUD.refresh();
      t.eq(DD.Combat.costOf(sp, DD.getSkill('spa_hemoglob'), 1).hp, 0, 'the engine waives her cost with a Bleeding foe adjacent');
      const payer = DD.HUD.hpPayer(sp, 'spa_hemoglob', 1);
      t.ok(payer && payer.id === g.id, 'the HUD names the Bleeding grunt as the payer');
      btn = qa('.hud-bar .hud-skill')[1];
      t.ok(btn.querySelector('.hs-hp.paid') && btn.querySelector('.hs-hp.paid').textContent.indexOf(String(listed)) >= 0, 'the button pill turns into a 🩸 paid pill');
      const tip = tipOf(btn);
      t.ok(tip.indexOf('paid by Test Grunt') >= 0 && tip.indexOf('pays the ' + listed + ' HP instead') >= 0, 'tooltip: "paid by Test Grunt" on the HP pill + who pays');
      DD.HUD.pressSlot(1);
      DD.HUD.hover(g.x, g.y);
      t.ok(/Test Grunt pays the \d+ HP/.test(DD.HUD.hint()), 'aim hint: who pays (' + DD.HUD.hint() + ')');
      DD.HUD.rightClick();
      // a foe that makes it free some other way is not "paying": only a waived cost names a payer
      DD.Act.removeStatus(g, 'bleed');
      DD.HUD.refresh();
      t.eq(DD.HUD.hpPayer(sp, 'spa_hemoglob', 1), null, 'bleed gone: Sparrow pays again');
    } finally { leave(); }
  });

  T.suite('hud: gold pills on gold-cost skills (party gold, red when short)', function (t) {
    if (!ready(t)) return;
    if (!DD.getHero('zarathor') || !DD.getSkill('zar_bling_throw')) { t.skip('Zarathor not registered'); return; }
    try {
      const g = DD.UI.skillGold('zar_bling_throw', 1);
      t.ok(g && g.cost > 0, 'UI.skillGold reads the cost from the exact desc (' + JSON.stringify(g) + ')');
      fight({ heroes: [{ id: 'zarathor', x: 2, y: 3, skills: ['zar_bling_throw'] }], enemies: [{ id: 'test_grunt', x: 5, y: 3 }], noPlan: true, gold: 2 });
      const z = byDef('zarathor');
      DD.HUD.select(z.id);
      let pill = qa('.hud-bar .hud-skill')[1].querySelector('.hs-gold');
      t.ok(pill && pill.textContent.indexOf(String(g.cost)) >= 0, 'the button shows 🪙' + g.cost);
      t.ok(pill && pill.classList.contains('poor'), 'red while the party holds less (2 gold)');
      DD.Combat.state.sandboxGold = 100;
      DD.HUD.refresh();
      pill = qa('.hud-bar .hud-skill')[1].querySelector('.hs-gold');
      t.eq(DD.Act.gold(), 100, 'party gold raised');
      t.ok(pill && !pill.classList.contains('poor'), 'normal once the party can pay');
      t.ok(/🪙 \d+ gold/.test(tipOf(qa('.hud-bar .hud-skill')[1])), 'tooltip carries the gold pill');
    } finally { leave(); }
  });

  T.suite('hud: summon packs collapse into one row of mini cards (no hidden scrollbar)', function (t) {
    if (!ready(t)) return;
    try {
      fight({ w: 10, h: 10, heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 8 }], enemies: [{ id: 'test_grunt', x: 9, y: 9 }], noPlan: true });
      const k = byDef('test_knight'), m = byDef('test_mage');
      DD.Act.summon(k, 'test_hound', 2, 1, { noFx: true, silent: true });
      DD.Act.summon(k, 'test_hound', 3, 1, { noFx: true, silent: true });
      DD.HUD.refresh();
      t.eq(qa('.hud-card.summon').length, 2, 'two summons: regular indented cards');
      t.eq(qa('.hud-minis').length, 0, 'no mini row yet');
      for (let i = 0; i < 5; i++) DD.Act.summon(k, 'test_hound', 2 + i, 2, { noFx: true, silent: true, ready: true });
      DD.Act.summon(m, 'test_turret', 2, 8, { noFx: true, silent: true });
      DD.HUD.refresh();
      t.eq(qa('.hud-minis').length, 1, 'seven summons: one mini row');
      t.eq(qa('.hud-minis .hud-mini').length, 7, 'every summon has a mini card');
      t.ok(/Sir Testsalot's entourage ×7/.test(q('.hud-minis .hm-count').textContent), 'the row is labelled with the owner and the count');
      t.eq(qa('.hud-card.summon').length, 1, 'the other hero\'s lone summon keeps its full card');
      const order = Array.prototype.map.call(DD.HUD.els().party.children, function (n) { return n.className.split(' ')[0]; }).join(',');
      t.eq(order, 'hud-card,hud-minis,hud-card,hud-card', 'the row sits under its owner (' + order + ')');
      // a mini selects its summon like a card does (the knight's summons act on the knight's turn)
      const hound = DD.Combat.state.units.filter(function (u) { return u.defId === 'test_hound' && u.ap > 0; })[0];
      const mini = qa('.hud-mini')[2];
      mini.click();
      const sel = DD.HUD.selected();
      t.ok(sel && sel.kind === 'summon', 'clicking a mini selects that summon');
      t.ok(qa('.hud-mini.sel').length === 1, 'the selected mini is highlighted');
      if (hound) t.ok(qa('.hud-mini .hm-ap').some(function (n) { return n.textContent === String(hound.ap); }), 'ready summons show their AP');
      // HP slivers follow the unit
      const h0 = DD.Combat.state.units.filter(function (u) { return u.defId === 'test_hound'; })[0];
      h0.hp = Math.max(1, Math.floor(h0.maxHp / 4));
      if (h0.vis) h0.vis.hp = h0.hp; // bars follow the animated value (unit.vis), as the party cards do
      DD.HUD.refresh();
      t.ok(qa('.hud-mini .hm-hp.low').length >= 1, 'a hurt summon shows a low HP sliver');
      // still taller than the panel: every summon group goes compact
      DD.HUD.els().party.style.maxHeight = '150px';
      DD.HUD.els().party.style.overflowY = 'auto';
      DD.HUD.refresh();
      t.eq(qa('.hud-card.summon').length, 0, 'overflowing panel: all summons compact (' + qa('.hud-card.summon').length + ' full summon cards left)');
      t.eq(qa('.hud-minis').length, 2, 'one mini row per owner');
      // summons dying back to a short list restores the normal cards
      DD.HUD.els().party.style.maxHeight = '';
      DD.Combat.state.units.forEach(function (u) { if (u.kind === 'summon' && u.ownerId === k.id) u.dead = true; });
      DD.HUD.refresh();
      t.eq(qa('.hud-minis').length, 0, 'pack gone: no mini rows');
      t.eq(qa('.hud-card.summon').length, 1, 'the lone turret is a full card again');
    } finally { leave(); }
  });

  T.suite('hud: the idle DM speaks after 30 s of quiet in the player phase', function (t) {
    if (!ready(t)) return;
    const had = DD.defs.narration && DD.defs.narration.idle_dm;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], noPlan: true });
      const since = DD.HUD.idleSince();
      t.ok(!DD.HUD.idleCheck(since + 29000), 'quiet for 29 s: nothing yet');
      const lines0 = qa('.hud-log .log-line.narrator').length;
      t.ok(DD.HUD.idleCheck(since + 30500), 'after 30 s the DM gets bored');
      const shown = DD.HUD.els().dmText.textContent;
      const pool = (had || []).concat(['The DM drums his fingers on the table. Loudly.', 'The DM checks his phone. Then checks it again.']);
      t.ok(pool.indexOf(shown) >= 0, 'an idle_dm line in the caption: ' + shown);
      t.ok(DD.HUD.els().dm.classList.contains('show'), 'caption shown');
      t.eq(qa('.hud-log .log-line.narrator').length, lines0 + 1, 'and in the log');
      t.ok(!DD.HUD.idleCheck(since + 31000), 'not again right away');
      t.ok(DD.HUD.idleCheck(since + 30500 + 61000), 'again after another minute of silence');
      DD.HUD.hover(3, 3);
      t.ok(!DD.HUD.idleCheck(DD.HUD.idleSince() + 1000), 'input restarts the idle clock (1 s after it: quiet)');
      t.ok(DD.HUD.idleCheck(DD.HUD.idleSince() + 30001), 'and 30 s after the last input the DM may speak again');
      DD.Combat.state.phase = 'enemy';
      t.ok(!DD.HUD.idleCheck(DD.HUD.idleSince() + 99999), 'never during AI turns');
      DD.Combat.state.phase = 'player';
    } finally { leave(); }
  });

  T.suite('hud: the objective panel fades and lets clicks through while a unit stands under it', function (t) {
    if (!ready(t)) return;
    const R = DD.Render;
    const w2s = R.worldToScreen;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], enemyAi: false });
      const g = byDef('test_grunt');
      const E = DD.HUD.els();
      R.worldToScreen = function () { return { x: -500, y: -500 }; };
      t.ok(!DD.HUD.objPeek(), 'nothing under it: solid');
      t.ok(!E.obj.classList.contains('peek'), '(not faded)');
      const r = E.obj.getBoundingClientRect();
      // the grunt at the back of the board projects right under the objective text
      R.worldToScreen = function (x, y) { return x === g.x && y === g.y ? { x: (r.left + r.right) / 2, y: r.bottom + 20 } : { x: -500, y: -500 }; };
      t.ok(DD.HUD.objPeek(), 'a unit under it: the panel fades');
      t.eq(getComputedStyle(E.obj).pointerEvents, 'none', 'and clicks go through to the board');
      R.worldToScreen = function () { return { x: -500, y: -500 }; };
      t.ok(!DD.HUD.objPeek(), 'it comes back once nobody is under it');
    } finally {
      R.worldToScreen = w2s;
      leave();
    }
  });

  T.suite('hud: the DM caption moves off a back-row boss\'s wind-up bubble', function (t) {
    if (!ready(t)) return;
    const R = DD.Render;
    const w2s = R.worldToScreen;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 4, y: 2 }], enemyAi: false });
      const g = byDef('test_grunt');
      DD.AI.windUp(g, 'test_grunt_stab', { x: 3, y: 2 }, { label: 'Big Stab' });
      DD.HUD.refresh();
      t.ok(g.intents.length > 0, 'the enemy winds up (it gets a bubble)');
      DD.Events.emit('combat:log', { text: 'The DM clears his throat. Dramatically.', cls: 'narrator', round: 1 });
      const E = DD.HUD.els();
      t.ok(E.dm.classList.contains('show'), 'a narrator line shows the caption');
      t.eq(DD.HUD.dmPlace(), 'top', 'it starts under the objective');
      const r = E.dm.getBoundingClientRect();
      // the enemy (with a wind-up) projects right under the caption: its bubble would hide behind it
      R.worldToScreen = function (x, y) { return x === g.x && y === g.y ? { x: (r.left + r.right) / 2, y: r.bottom + 40 } : { x: -500, y: -500 }; };
      DD.HUD.placeDm();
      t.eq(DD.HUD.dmPlace(), 'low', 'over a wind-up bubble it moves low, above the hint bar');
      t.ok(E.dm.parentNode === E.barWrap && E.dm.nextSibling === E.hint, 'low = right above the hint line');
      R.worldToScreen = function () { return { x: -500, y: -500 }; };
      DD.HUD.placeDm();
      t.eq(DD.HUD.dmPlace(), 'top', 'nothing underneath: back under the objective');
    } finally {
      R.worldToScreen = w2s;
      leave();
    }
  });

  // ---- map rotation (rotation plan §3.5, T14) ------------------------------------------------------------------------
  T.suite('hud: map rotation — view buttons, the compass, edge names and the help rows follow the view', function (t) {
    if (!ready(t)) return;
    const R = DD.Render;
    if (['turn', 'resetView', 'setYaw', 'getYaw'].some(function (k) { return typeof R[k] !== 'function'; })) { t.skip('the renderer has no map rotation'); return; }
    const so = DD.Meta && DD.Meta.data ? DD.Meta.data.settings : null;
    const hadYaw = !!so && Object.prototype.hasOwnProperty.call(so, 'viewYaw'), oldYaw = so ? so.viewYaw : undefined;
    const hadSnap = !!so && Object.prototype.hasOwnProperty.call(so, 'rotSnap'), oldSnap = so ? so.rotSnap : undefined;
    const turn = R.turn, resetView = R.resetView;
    const calls = [];
    const needleDeg = function () { const m = /rotate\((-?[\d.]+)deg\)/.exec(DD.HUD.els().needle.style.transform); return m ? +m[1] : NaN; };
    try {
      R.setYaw(0, { keepFocus: false });
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }], noPlan: true,
        reinforcements: [{ round: 3, edge: 'N', enemies: [{ id: 'test_grunt', n: 2 }] }] });
      const E = DD.HUD.els();
      const view = q('.hud-tr .hud-view');
      t.ok(view && !view.classList.contains('hud-hidden'), 'the view cluster sits in the top-right cluster');
      t.ok(view && view.nextElementSibling === E.menu, '...right before the Menu button');
      const btns = qa('.hud-view .hud-vbtn');
      t.eq(btns.map(function (b) { return ['hv-left', 'hv-compass', 'hv-right'].filter(function (c) { return b.classList.contains(c); })[0]; }).join(' '), 'hv-left hv-compass hv-right', 'three buttons: ⟲ · compass · ⟳');
      t.ok(btns.every(function (b) { return !b.dataset.hotkey; }), 'no hotkeys on them (Q / R / Home belong to DD.Input)');
      t.eq(btns.map(function (b) { return b.getAttribute('aria-label'); }).join(' | '), 'Turn the map counter-clockwise (Q) | Reset the view (Home) | Turn the map clockwise (R)', 'icon-only buttons carry names (review)');
      t.ok(/Turn the map \(Q\)/.test(tipOf(btns[0])) && /Middle-drag/.test(tipOf(btns[0])) && /counter-clockwise/.test(tipOf(btns[0])), 'turn-left tooltip: Q, counter-clockwise, middle-drag');
      t.ok(/Reset view \(Home\)/.test(tipOf(btns[1])) && /Classic view/.test(tipOf(btns[1])), 'compass tooltip: Home, and says the view is classic');
      t.ok(/Turn the map \(R\)/.test(tipOf(btns[2])) && / clockwise/.test(tipOf(btns[2])), 'turn-right tooltip: R, clockwise');
      // the compass at the classic view: the needle points up-right (the top-right edge)
      t.near(DD.HUD.compass(), 45, 1e-6, 'yaw 0: the needle points up-right');
      t.ok(!E.compass.classList.contains('turned'), 'yaw 0: the compass is not lit');
      // the buttons drive the renderer (the calls pass through)
      R.turn = function (d) { calls.push('turn ' + d); return turn.apply(R, arguments); };
      R.resetView = function () { calls.push('reset'); return resetView.apply(R, arguments); };
      btns[2].click();
      t.eq(calls.join(','), 'turn 1', '⟳ calls DD.Render.turn(1)');
      t.eq(R.getYaw(), 90, '...and the map turns to 90 (instant without the live loop)');
      t.near(DD.HUD.compass(), 135, 1e-6, 'the needle turned with the board (render:view): down-right');
      t.ok(E.compass.classList.contains('turned'), 'a turned map lights the compass');
      t.ok(/Turned 90° clockwise/.test(tipOf(btns[1])), 'the compass tooltip says how far: ' + tipOf(btns[1]).replace(/<[^>]+>/g, ' ').slice(0, 80));
      btns[0].click();
      btns[0].click();
      t.eq(calls.slice(1).join(','), 'turn -1,turn -1', '⟲ calls DD.Render.turn(-1)');
      t.eq(R.getYaw(), 270, 'two quarter turns back: 270');
      t.ok(/Turned 90° counter-clockwise/.test(tipOf(btns[1])), '270 reads as 90° counter-clockwise');
      btns[1].click();
      t.eq(calls[calls.length - 1], 'reset', 'the compass calls DD.Render.resetView()');
      t.eq(R.getYaw(), 0, '...back to the classic view');
      t.near(DD.HUD.compass(), 45, 1e-6, '...needle up-right again');
      t.ok(!E.compass.classList.contains('turned'), '...and unlit');
      // the needle never spins the long way round (its short CSS transition follows the unwrapped angle)
      R.setYaw(350);
      const a = needleDeg();
      R.setYaw(10);
      t.near(needleDeg() - a, 20, 1e-6, '350 → 10: the needle moves 20°, not -340°');
      // edge names follow the view: reinforcement chip tooltips are evaluated when shown
      R.setYaw(0);
      t.eq(['N', 'E', 'S', 'W', 'zone'].map(function (e) { return DD.HUD.edgeName(e); }).join(' | '), 'top-right edge | bottom-right edge | bottom-left edge | top-left edge | enemy side', 'classic view: the old names');
      const chip = q('.hud-chip.wave');
      t.ok(chip && /from the top-right edge/.test(tipOf(chip)), 'the reinforcement chip names the top-right edge at yaw 0');
      R.setYaw(180);
      t.eq(DD.HUD.edgeName('N'), 'bottom-left edge', 'yaw 180: N is the bottom-left edge');
      t.eq(DD.HUD.edgeName('E'), 'top-left edge', 'yaw 180: E is the top-left edge');
      t.ok(chip && /from the bottom-left edge/.test(tipOf(chip)), 'and the same chip now says so');
      t.near(DD.HUD.compass(), 225, 1e-6, 'yaw 180: the needle points down-left');
      R.setYaw(45);
      t.eq(DD.HUD.edgeName('N') + ' / ' + DD.HUD.edgeName('S'), 'right edge / left edge', 'yaw 45: N is the right edge, S the left');
      t.eq(DD.HUD.edgeName('N', 90), 'bottom-right edge', 'edgeName(edge, yaw) names another view without turning');
      // an open inspect panel survives a settle (it re-picks its corner off-headless)
      const g = byDef('test_grunt');
      DD.HUD.clickTracker(g.id);
      t.ok(!q('.hud-inspect').classList.contains('hud-hidden'), 'an enemy\'s inspect panel is pinned');
      R.setYaw(120);
      t.ok(!q('.hud-inspect').classList.contains('hud-hidden'), 'it stays up through a turn');
      // the snap setting (Settings: "Snap rotation to the classic views") reaches the rotate drag
      if (so && typeof R.beginRotate === 'function' && typeof R.setScene === 'function') {
        const prevScene = R.getScene();
        try {
          R.setScene('combat');   // headless UI.show leaves the scene alone; drags turn the battlefield only
          R.setYaw(0);
          delete so.rotSnap;
          t.ok(R.beginRotate(), 'a rotate drag starts');
          R.rotateDrag(-5);
          t.near(DD.HUD.compass(), 46.75, 0.01, 'the compass follows the drag');
          R.endRotate();
          t.eq(R.getYaw(), 0, 'snap on (default): a drag let go 1.75° off a classic view lands on it');
          so.rotSnap = false;
          R.beginRotate(); R.rotateDrag(-5); R.endRotate();
          t.near(R.getYaw(), 1.75, 0.01, 'rotSnap off: it stays at 1.75°');
          t.near(DD.HUD.compass(), 46.75, 0.01, '...and so does the needle');
        } finally {
          R.setYaw(0, { keepFocus: false });
          R.setScene(prevScene);
        }
      }
      // the in-combat help lists the rotation keys
      R.setYaw(0);
      DD.HUD.openMenu();
      const m = DD.UI.topModal();
      const rows = m ? Array.prototype.slice.call(m.el.querySelectorAll('.hm-controls .k')).map(function (k) { return k.textContent + ' = ' + k.nextElementSibling.textContent; }) : [];
      ['Middle drag = Rotate the map to any angle', 'Q / R = Turn the map 90°', 'Home = Reset the view', 'F = Recenter the board',
        'Shift + wheel = Rotate the map (or swipe · twist)'].forEach(function (r) {
        t.ok(rows.indexOf(r) >= 0, 'menu controls: ' + r);
      });
      DD.UI.closeAllModals('test');
    } finally {
      R.turn = turn;
      R.resetView = resetView;
      R.setYaw(0, { keepFocus: false });
      if (so) {
        if (hadYaw) so.viewYaw = oldYaw; else delete so.viewYaw;
        if (hadSnap) so.rotSnap = oldSnap; else delete so.rotSnap;
      }
      leave();
    }
    t.eq(R.getYaw(), 0, 'the live view is back at yaw 0');
  });

  T.suite('hud: map rotation — no view buttons when the renderer cannot turn; the help rows stay', function (t) {
    if (!ready(t)) return;
    const R = DD.Render;
    const had = Object.prototype.hasOwnProperty.call(R, 'turn'), turn = R.turn;
    try {
      R.turn = undefined;
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }], noPlan: true });
      const view = q('.hud-tr .hud-view');
      t.ok(view && view.classList.contains('hud-hidden'), 'the view cluster is hidden');
      t.ok(DD.HUD.mounted() && q('.hud-tr .hud-speed'), 'the rest of the cluster is there');
      t.eq(DD.HUD.edgeName('N', 0), 'top-right edge', 'edge names still work');
    } finally {
      if (had) R.turn = turn; else delete R.turn;
      leave();
    }
  });

  // review: the debug result modal's "r" is Restart Fight; the same press must not also reach DD.Input's R (turn)
  T.suite('hud: map rotation — R on the debug result modal restarts the fight and does not also turn the map', async function (t) {
    if (!ready(t)) return;
    const R = DD.Render;
    if (typeof R.turn !== 'function' || typeof R.setScene !== 'function') { t.skip('the renderer has no map rotation'); return; }
    const hadMain = !!DD.Main, main = DD.Main || (DD.Main = {});
    const hadRestart = Object.prototype.hasOwnProperty.call(main, 'restartCombat'), oldRestart = main.restartCombat;
    const prevScene = R.getScene();
    const press = function (k) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: 'Key' + k.toUpperCase(), bubbles: true, cancelable: true }));
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: 'Key' + k.toUpperCase(), bubbles: true, cancelable: true }));
    };
    let restarts = 0;
    const cv = document.createElement('canvas');
    document.body.appendChild(cv);
    try {
      t.ok(DD.Input && DD.Input.init(cv), 'DD.Input listens (keys on window)');
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }], noPlan: true });
      R.setScene('combat');   // headless UI.show leaves the scene alone; DD.Input turns the battlefield only
      R.setYaw(0, { keepFocus: false });
      main.restartCombat = function () { restarts++; };
      const g = byDef('test_grunt');
      g.hp = 1;
      DD.HUD.key('1');
      DD.HUD.click(g.x, g.y);
      await tick(5);
      await tick(5);
      const m = DD.UI.topModal();
      t.ok(m && /Restart Fight/.test(m.el.textContent), 'the debug result modal is up');
      press('r');
      t.eq(restarts, 1, 'R clicked Restart Fight');
      t.eq(R.getYaw(), 0, '...and did not turn the map');
      t.eq(R._rot.yawTarget(), 0, '...nor start a turn');
      t.eq(DD.UI.modalCount(), 0, '...which closed the modal');
      DD.HUD.openMenu();
      t.ok(DD.UI.modalCount() > 0, 'the menu is open');
      press('q'); press('r');
      t.eq(R.getYaw(), 0, 'Q / R under a modal do nothing');
      DD.UI.closeAllModals('test');
      press('r');
      t.eq(R.getYaw(), 90, 'with the modal gone R turns the map (instant without the live loop)');
    } finally {
      if (DD.Input) DD.Input.detach();
      cv.remove();
      if (hadRestart) main.restartCombat = oldRestart; else delete main.restartCombat;
      if (!hadMain) delete DD.Main;
      R.setYaw(0, { keepFocus: false });
      R.setScene(prevScene);
      leave();
    }
  });

  // ---- v2 user requests: barrels you can shoot, heals that get a downed ally up, flyers over the floor -----------------
  /** A board with an explosive barrel between two grunts and the knight; the mage (basic: Magic Missile, range 5) acts. */
  function barrelFight(extra) {
    return fight(Object.assign({
      heroes: [{ id: 'test_mage', x: 1, y: 3, skills: ['test_chain_zap'] }, { id: 'test_knight', x: 4, y: 3 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 2 }, { id: 'test_grunt', x: 6, y: 3 }, { id: 'test_archer', x: 7, y: 7 }],
      objects: [{ x: 5, y: 3, id: 'barrel_explosive' }, { x: 1, y: 6, id: 'barrel' }], enemyAi: false,
    }, extra || {}));
  }
  function barrelsReady(t) {
    if (!ready(t)) return false;
    if (!DD.getObject('barrel_explosive') || !DD.Targeting.aimsAtObjects) { t.skip('no explosive barrel / barrel targeting'); return false; }
    return true;
  }

  T.suite('hud: v2 requests — attacks aimed at an explosive barrel: target, 💥 marker, the blast preview, the detonation', function (t) {
    if (!barrelsReady(t)) return;
    const explode0 = DD.Act.explode;
    try {
      barrelFight();
      const m = byDef('test_mage'), k = byDef('test_knight');
      const grunts = DD.Combat.state.units.filter(function (u) { return u.defId === 'test_grunt'; });
      t.eq(DD.HUD.selected().id, m.id, 'the mage acts first');
      DD.HUD.key('1');
      t.ok(has(ov().targetTiles, { x: 5, y: 3 }), 'the armed basic attack lists the explosive barrel as a target');
      t.ok(has(ov().objTargets, { x: 5, y: 3 }) && ov().objTargets.length === 1, 'and the renderer gets its 💥 marker (overlay.objTargets)');
      t.ok(!has(ov().targetTiles, { x: 1, y: 6 }), 'a plain barrel is no target');
      t.ok(/or 💥 the Explosive Barrel/.test(DD.HUD.hint()), 'the aim hint offers the barrel: ' + DD.HUD.hint());
      // hover: the blast, exactly as the engine previews it
      DD.HUD.hover(5, 3);
      const p = DD.Combat.preview(m, m.basic, 5, 3);
      t.ok(p.detonates === 'barrel_explosive', 'the engine preview detonates it');
      ['5,2', '6,3', '4,3', '5,4'].forEach(function (s) { const q = s.split(','); t.ok(has(ov().areaTiles, { x: +q[0], y: +q[1] }), 'the blast tile ' + s + ' is highlighted'); });
      grunts.concat([k]).forEach(function (u) {
        const e = p.perUnit[u.id];
        t.ok(e && ov().previews[u.id] && ov().previews[u.id].dmg === e.dmg + (e.blocked || 0), u.name + ' wears the blast\'s damage (' + (e && e.dmg) + ')');
      });
      t.ok(/Detonate: Explosive Barrel — 8 fire damage within 1 tile/.test(DD.HUD.hint()), 'the hint names the blast: ' + DD.HUD.hint());
      t.ok(/Hits 2 foes/.test(DD.HUD.hint()) && /⚠ hits Sir Testsalot!/.test(DD.HUD.hint()), 'who it catches, the knight by name');
      t.ok(!/💥 Explosive Barrel( ·|$)/.test(DD.HUD.hint()), 'the barrel itself is not listed again as a destroyed object');
      t.ok(DD.Act.explode === explode0, 'the blast watch put DD.Act.explode back');
      t.ok(/💥 Volatile: aim a single-target attack at it/.test(text('.hud-inspect')), 'the barrel\'s inspect panel says attacks set it off');
      t.ok(/🎯 Click: Magic Missile \(Unit\) sets it off — 8 fire damage within 1 tile/.test(text('.hud-inspect')), 'and what the click does: ' + text('.hud-inspect'));
      // a skill that can't aim at objects (a non-basic spell): no barrel target, and the click explains why
      DD.HUD.rightClick();
      DD.HUD.key('2');
      t.ok(!has(ov().targetTiles, { x: 5, y: 3 }) && !ov().objTargets.length, 'Chain Zap (a non-basic spell) does not aim at the barrel');
      DD.HUD.click(5, 3);
      t.ok(/Chain Zap can't set off the Explosive Barrel/.test(DD.HUD.hint()), 'clicking it says why: ' + DD.HUD.hint());
      t.ok(!!DD.Grid.tile(5, 3).obj, 'and nothing went off');
      DD.HUD.rightClick();
      t.eq(ov().objTargets.length, 0, 'no 💥 marker in move mode');
      // the detonation: exactly the preview, AP paid, the barrel gone
      DD.HUD.key('1');
      const hp0 = {};
      grunts.concat([k]).forEach(function (u) { hp0[u.id] = u.hp; });
      DD.HUD.click(5, 3);
      t.ok(!DD.Grid.tile(5, 3).obj, 'the click set the barrel off');
      grunts.concat([k]).forEach(function (u) { t.eq(hp0[u.id] - u.hp, p.perUnit[u.id].dmg, u.name + ' took exactly the previewed blast'); });
      t.eq(m.ap, 2, 'it cost the attack\'s 1 AP');
      t.eq(DD.HUD.mode().kind, 'move', 'back to move mode');
    } finally { DD.Act.explode = explode0; leave(); }
  });

  T.suite('hud: v2 requests — a heal aimed at a downed ally: target, "UP! N HP", cards, inspect, the revive', function (t) {
    if (!ready(t)) return;
    if (!DD.Targeting.revivesWith) { t.skip('no heal revives'); return; }
    try {
      fight({ heroes: [{ id: 'test_cleric', x: 1, y: 3, skills: ['test_heal', 'test_bless'] }, { id: 'test_knight', x: 3, y: 3 }, { id: 'test_mage', x: 1, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const c = byDef('test_cleric'), k = byDef('test_knight');
      DD.Act.kill(k, null);
      DD.HUD.refresh();
      t.ok(k.downed, 'the knight is downed');
      t.eq(DD.HUD.selected().id, c.id, 'the cleric acts');
      const kc = qa('.hud-card')[1];
      t.ok(/Heal back up \(2\)/.test(kc.querySelector('.hc-when').textContent), 'the downed card says a heal gets him up (key 2): ' + kc.querySelector('.hc-when').textContent);
      t.eq(DD.HUD.reviveOptions(k).map(function (o) { return o.name + ':' + o.key; }).join(','), 'Patch Notes:2', 'the ready heal that reaches him');
      const tip = DD.HUD.unitTip(k);
      t.ok(/single-target heal aimed at Sir Testsalot gets Sir Testsalot back up with the healed HP/.test(tip) && /Ready now: Patch Notes \(2\)/.test(tip), 'the card tooltip says so too');
      // move mode: a click on him (not adjacent) explains the options
      DD.HUD.click(k.x, k.y);
      t.ok(/Press 2 \(Patch Notes\), then click Sir Testsalot: back UP/.test(DD.HUD.hint()), 'clicking him says how: ' + DD.HUD.hint());
      DD.HUD.clearHint();
      // a buff that can't revive: no target; the click explains
      DD.HUD.key('3');
      t.ok(!has(ov().targetTiles, k), 'Pep Talk does not target the downed knight');
      DD.HUD.click(k.x, k.y);
      t.ok(/won't get Sir Testsalot up: only a single-target heal does/.test(DD.HUD.hint()), 'and says why: ' + DD.HUD.hint());
      DD.HUD.rightClick();
      DD.HUD.clearHint();
      // the heal: target, preview, revive
      DD.HUD.key('2');
      const entry = ov().targetTiles.filter(function (p) { return p.x === k.x && p.y === k.y; })[0];
      t.ok(entry && entry.revive, 'Patch Notes lists the downed knight (revive)');
      t.ok(ov().reviveTargets.indexOf(k.id) >= 0, 'the renderer gets him as a revive target (green heart)');
      t.ok(/or 🆘 downed Sir Testsalot \(back UP\)/.test(DD.HUD.hint()), 'the aim hint offers him: ' + DD.HUD.hint());
      DD.HUD.hover(k.x, k.y);
      const pv = DD.Combat.preview(c, c.skills[0], k.x, k.y).perUnit[k.id];
      t.ok(pv && pv.revived && pv.heal > 0, 'the engine preview gets him up with ' + (pv && pv.heal) + ' HP');
      const b = ov().previews[k.id];
      t.ok(b && b.revive && b.heal === 0 && b.text.indexOf('UP! ' + pv.heal + ' HP') === 0, 'the board badge reads "' + (b && b.text) + '"');
      t.ok(new RegExp('🆘 UP! Sir Testsalot gets back up with ' + pv.heal + ' HP \\(0 AP now; acts next\\)').test(DD.HUD.hint()), 'the hint: ' + DD.HUD.hint());
      t.ok(!/heals 1 ally/.test(DD.HUD.hint()), 'not counted as a plain heal');
      t.ok(new RegExp('🎯 Click: Patch Notes gets Sir Testsalot back up — UP! ' + pv.heal + ' HP').test(text('.hud-inspect')), 'the inspect panel: ' + text('.hud-inspect'));
      DD.HUD.click(k.x, k.y);
      t.ok(!k.downed && k.hp === pv.heal, 'the click got him up with the previewed ' + pv.heal + ' HP');
      t.eq(c.ap, 2, 'the heal cost its 1 AP');
      t.eq(ov().reviveTargets.length, 0, 'no revive targets once he is up');
      DD.HUD.endTurn();
      t.eq(DD.Combat.current().id, k.id, 'he acts on his own turn, next');
    } finally { leave(); }
  });

  T.suite('hud: v2 requests verify — a downed ally whose turn already passed: "acts in N turns, next round" (no nested brackets)', function (t) {
    if (!ready(t)) return;
    if (!DD.Targeting.revivesWith) { t.skip('no heal revives'); return; }
    try {
      fight({ heroes: [{ id: 'test_knight', x: 3, y: 3 }, { id: 'test_cleric', x: 1, y: 3, skills: ['test_heal', 'test_bless'] }, { id: 'test_mage', x: 1, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false, order: ['test_knight', 'test_cleric', 'test_mage', 'test_grunt'] });
      const c = byDef('test_cleric'), k = byDef('test_knight');
      t.eq(DD.Combat.current().id, k.id, 'the knight acts first');
      DD.HUD.endTurn();
      t.eq(DD.Combat.current().id, c.id, 'then the cleric');
      DD.Act.kill(k, null);
      DD.HUD.refresh();
      DD.HUD.key('2');
      DD.HUD.hover(k.x, k.y);
      const h = DD.HUD.hint();
      t.ok(/gets back up with \d+ HP \(0 AP now; acts in \d+ turns, next round\)/.test(h), 'his slot passed: he acts next round, said without nested brackets: ' + h);
      t.ok(!/\(next round\)\)/.test(h) && !/\bits\b/.test(h.split('🆘')[1] || ''), 'no "(next round))" and no "its" after his name');
    } finally { leave(); }
  });

  T.suite('hud: v2 requests — skill and consumable tooltips say what else they can be aimed at', function (t) {
    if (!ready(t)) return;
    if (!DD.UI.aimNotes || !DD.Targeting.aimsAtObjects) { t.skip('no aim notes'); return; }
    try {
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 3, skills: ['test_chain_zap'] }, { id: 'test_cleric', x: 2, y: 3, skills: ['test_heal', 'test_sanctuary'] }],
        enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const m = byDef('test_mage'), c = byDef('test_cleric');
      t.ok(/💥 Can also be aimed at an explosive barrel/.test(DD.UI.skillTooltipHtml('test_bolt', 1, m)), 'the mage\'s basic attack (a spell) can set barrels off');
      t.ok(!/explosive barrel/.test(DD.UI.skillTooltipHtml('test_chain_zap', 1, m)), 'his non-basic spell can\'t');
      t.ok(/💥 Can also be aimed/.test(DD.UI.skillTooltipHtml('test_slash', 1, null)), 'any kind:attack single-target skill can, even without a unit');
      t.ok(/🆘 Aimed at a downed ally, it gets that ally back up with the healed HP/.test(DD.UI.skillTooltipHtml('test_heal', 1, c)), 'a single-target heal revives');
      t.ok(!/downed ally, it gets/.test(DD.UI.skillTooltipHtml('test_sanctuary', 1, c)), 'an area heal does not');
      t.ok(!/Aimed at a downed|explosive barrel/.test(DD.UI.consumableTooltipHtml('test_potion')), 'a consumable without a kind and an ally target: neither');
      const drink = DD.getConsumable('con_red_drink');
      if (drink && DD.Targeting.revivesWith({ kind: 'hero', side: 'hero' }, drink)) t.ok(/🆘 Aimed at a downed ally/.test(DD.UI.consumableTooltipHtml('con_red_drink')), 'Red Drink revives (consumable tooltip)');
    } finally { leave(); }
  });

  T.suite('hud: v2 requests — flyers: no floor-hazard warnings, "Flying: ignores floor effects", clouds still count', function (t) {
    if (!ready(t)) return;
    if (!DD.Grid.isFlying || !DD.getSurface('fire')) { t.skip('no per-unit flying hazards'); return; }
    try {
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 1 }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false,
        terrain: function (tl) { return tl.x === 3 && tl.y === 4 ? { t: 'lava' } : null; },
        surfaces: [{ x: 2, y: 1, id: 'fire', turns: 3 }, { x: 2, y: 4, id: 'fire', turns: 3 }].concat(DD.getSurface('steam') ? [{ x: 1, y: 2, id: 'steam', turns: 3 }] : []) });
      const m = byDef('test_mage'), k = byDef('test_knight');
      m.flags = Object.assign({}, m.flags, { flying: true });
      DD.HUD.refresh();
      t.eq(DD.HUD.selected().id, m.id, 'the (flying) mage acts');
      DD.HUD.hover(3, 1);
      t.ok(ov().path.length >= 2 && !ov().pathHazard, 'a flyer\'s path over fire is not flagged');
      t.ok(!/Fire|will hurt/.test(DD.HUD.hint()) && /Move here/.test(DD.HUD.hint()), 'and the hint warns of nothing: ' + DD.HUD.hint());
      DD.HUD.hover(2, 1);
      t.ok(/🪽 Wizzy McTest flies over this floor: none of it applies/.test(text('.hud-inspect')), 'the fire tile\'s panel says the flyer floats over it');
      if (DD.getSurface('steam')) {
        DD.HUD.hover(1, 2);
        t.ok(/☁️ Steam hangs in the air: it reaches flyers too/.test(text('.hud-inspect')), 'a cloud still counts for flyers');
      }
      DD.HUD.hover(m.x, m.y);
      t.ok(/🪽 Flying: ignores floor effects/.test(text('.hud-inspect')), 'the flyer\'s inspect panel says so');
      t.ok(/🪽 Flying: ignores floor effects/.test(DD.HUD.unitTip(m)), 'and its card tooltip');
      t.ok(!/Flying/.test(DD.HUD.unitTip(k)), 'the walker\'s does not');
      if (DD.getHero('syllamin') && DD.UI.flyLine) t.ok(/🪽 Flying: ignores floor effects.*still reach Syllamin\./.test(DD.UI.heroTooltipHtml('syllamin')), 'a flying hero\'s roster tooltip says so (by name)');
      // the walker, for contrast: warned of the fire and the lava
      DD.HUD.endTurn();
      t.eq(DD.HUD.selected().id, k.id, 'the knight acts');
      DD.HUD.hover(2, 4);
      t.ok(ov().pathHazard && /Fire/.test(DD.HUD.hint()), 'a walker is still warned of fire: ' + DD.HUD.hint());
      t.ok(!/flies over/.test(text('.hud-inspect')), 'no flyer line for a walker');
    } finally { leave(); }
  });

  /** Bounding box of the pixels that differ between two canvases (null when none do). */
  function diffBox(a, b) {
    const w = a.width, h = a.height;
    const da = a.getContext('2d').getImageData(0, 0, w, h).data, db = b.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) < 24) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  T.suite('hud: v2 requests — the barrel marker, the blast area and the UP! badge follow the map rotation (yaw 0, 30, 200)', function (t) {
    if (!barrelsReady(t)) return;
    const R = DD.Render;
    if (!R || typeof R.renderTo !== 'function' || !DD.Iso || typeof DD.Iso.withYaw !== 'function') { t.skip('no renderTo / yaw'); return; }
    const W = 360, H = 260, rand = Math.random;
    const cvA = document.createElement('canvas'), cvB = document.createElement('canvas');
    // the frame's own randomness (ambient motes) is pinned, so two renders differ only by the overlay
    const seeded = function (fn) { let s = 7; Math.random = function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; try { return fn(); } finally { Math.random = rand; } };
    const draw = function (cv, yaw, at) {
      const cam = DD.Iso.withYaw(yaw, function () { const w = DD.Iso.toWorld(at.x, at.y, 0); return { x: w.x, y: w.y, zoom: 1.4 }; });
      return seeded(function () { return R.renderTo(cv, { width: W, height: H, yaw: yaw, camera: cam }); });
    };
    try {
      // a lone barrel in the open, the mage aiming at it from range
      fight({ w: 9, h: 9, heroes: [{ id: 'test_mage', x: 1, y: 1 }, { id: 'test_cleric', x: 6, y: 6, skills: ['test_heal'] }, { id: 'test_knight', x: 7, y: 7 }],
        enemies: [{ id: 'test_grunt', x: 8, y: 0 }], objects: [{ x: 3, y: 3, id: 'barrel_explosive' }], enemyAi: false });
      const bar = { x: 3, y: 3 };
      DD.HUD.key('1');
      DD.HUD.hover(bar.x, bar.y);
      t.ok(ov().objTargets.length === 1 && ov().areaTiles.length === 5, 'armed and aimed: a marker and a 5-tile blast');
      const full = JSON.parse(JSON.stringify(ov()));
      [0, 30, 200].forEach(function (yaw) {
        Object.assign(ov(), full);
        draw(cvA, yaw, bar);
        ov().objTargets = [];
        draw(cvB, yaw, bar);
        const mk = diffBox(cvA, cvB);
        t.ok(mk && Math.abs(mk.cx - W / 2) <= 4 && mk.y1 < H / 2, 'yaw ' + yaw + ': the 💥 marker stands right above the barrel ' + JSON.stringify(mk));
        Object.assign(ov(), full, { areaTiles: [] });
        draw(cvB, yaw, bar);
        const ar = diffBox(cvA, cvB);
        t.ok(ar && Math.abs(ar.cx - W / 2) <= 6 && Math.abs(ar.cy - H / 2) <= 12 && ar.x1 - ar.x0 > 100, 'yaw ' + yaw + ': the blast area is centred on the barrel ' + JSON.stringify(ar));
      });
      // the UP! badge over a downed hero
      DD.HUD.rightClick();
      const c = byDef('test_cleric'), k = byDef('test_knight');
      DD.Act.kill(k, null);
      DD.HUD.endTurn();
      t.eq(DD.HUD.selected().id, c.id, 'the cleric acts');
      DD.HUD.key('2');
      DD.HUD.hover(k.x, k.y);
      t.ok(ov().previews[k.id] && ov().previews[k.id].revive, 'the downed knight wears the UP! badge');
      const full2 = JSON.parse(JSON.stringify(ov()));
      [0, 30, 200].forEach(function (yaw) {
        Object.assign(ov(), full2);
        draw(cvA, yaw, k);
        ov().previews = {};
        draw(cvB, yaw, k);
        const bd = diffBox(cvA, cvB);
        t.ok(bd && Math.abs(bd.cx - W / 2) <= 6 && bd.y1 < H / 2, 'yaw ' + yaw + ': "UP!" floats right above the knight ' + JSON.stringify(bd));
      });
    } finally { Math.random = rand; leave(); }
  });

  // review: the render / sprite / run / ui / hud suites before this one all turn the map; none may leave it turned,
  // moving or remembered for the content suites after them (their screen positions assume the classic view)
  T.suite('hud: map rotation — no suite so far left the view turned, turning or remembered', async function (t) {
    const R = DD.Render;
    if (!R || typeof R.getYaw !== 'function' || !R._rot) { t.skip('the renderer has no map rotation'); return; }
    await new Promise(function (res) { setTimeout(res, 600); });   // a settle's 500 ms "remember the angle" timer
    const so = DD.Meta && DD.Meta.data ? DD.Meta.data.settings : {};
    t.eq(R.getYaw(), 0, 'the live yaw is 0');
    t.eq(R._rot.yawTarget(), 0, 'no turn is heading anywhere');
    t.ok(!R._rot.anim() && !R.isViewMoving(), 'nothing is turning');
    t.eq(DD.Iso.view().yaw, 0, 'DD.Iso holds the classic view');
    t.ok(!(+so.viewYaw), 'settings.viewYaw is not set (' + JSON.stringify(so.viewYaw) + ')');
    t.ok(so.rotSnap === undefined, 'settings.rotSnap is not set (' + JSON.stringify(so.rotSnap) + ')');
  });
})();
