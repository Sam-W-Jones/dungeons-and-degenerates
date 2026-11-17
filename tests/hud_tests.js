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
      t.ok(/Holds the line: walking away provokes .+\(≈\d+ to Sir Testsalot\)/.test(text('.hud-inspect')), 'the grunt\'s panel: walking away from it provokes (≈ on the selected hero): ' + text('.hud-inspect .hi-line.aoo'));
      DD.HUD.hover(a.x, a.y);
      t.ok(/No melee attack ready: walking away is free/.test(text('.hud-inspect')), 'the archer makes none');
      // review: the panel follows the engine's exceptions — a Dazzled AI unit never strikes, a taunted one only its taunter
      DD.Act.addStatus(g, 'dazzled');
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      t.ok(!DD.Combat.provokes(k, 1, 2).length && /No attacks of opportunity while Dazzled/.test(text('.hud-inspect')) && !/Holds the line: walking away/.test(text('.hud-inspect')),
        'a Dazzled grunt: no "holds the line" (the engine agrees: nothing provoked): ' + text('.hud-inspect .hi-line'));
      DD.Act.removeStatus(g, 'dazzled');
      const m0 = byDef('test_mage');
      DD.Act.addStatus(g, 'taunt', {}, m0);
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      t.ok(!DD.Combat.provokes(k, 1, 2).length && /taunted: only .+ gets the free hit/.test(text('.hud-inspect')) && !/≈\d+ to Sir Testsalot/.test(text('.hud-inspect')),
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
      t.ok(!/Provokes/.test(DD.HUD.hint()) && /already used an attack of opportunity this round/.test(DD.HUD.hint()), 'the move hint says this walk is free: ' + DD.HUD.hint());
      DD.HUD.hover(k.x, k.y);
      t.ok(/Test Grunt already used an attack of opportunity this round/.test(text('.hud-inspect')), 'so does the inspect panel');
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
      t.ok(/, .+ can reach: Sir Testsalot \d+/.test(txt), 'reach: who it can hit on its next turn: ' + txt);
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
      t.ok(/loses the next turn/.test(text('.hud-inspect')), 'stunned: the panel says it loses its next turn');
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
        t.ok(/⏳ Meteor of Regression \d+ lands here at the start of .+'s next turn/.test(DD.HUD.hint()), 'moving into it warns: ' + DD.HUD.hint());
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
      const map = DD.AI.threatMap('hero', { hero: k });
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
      // four reachers: the list names three and says how many more ("+1" alone read like damage). [playtest
      // bosses-objectives-3] only foes that act before the knight's next turn count: these four are in the order now
      // (a foe spawned mid-round joins next round, after him, and would not count)
      leave();
      fight({ w: 10, h: 8, heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [[3, 3], [3, 4], [4, 3], [3, 2]].map(function (p) { return { id: 'test_grunt', x: p[0], y: p[1] }; }), enemyAi: false });
      const k2 = byDef('test_knight');
      DD.HUD.threat(true);
      DD.HUD.refresh();
      const hmap = DD.AI.threatMap('hero', { hero: k2 });
      const crowd = DD.HUD.threatData().tiles.filter(function (x) { const v = hmap.get(x.x + ',' + x.y); return DD.Combat.reachable(k2).has(x.x + ',' + x.y) && v && v.from.length >= 4; })[0];
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
      t.ok(!DD.FXRender || !DD.FXRender.moments || !DD.FXRender.moments.cameo, 'V3: so is the cameo moment host');
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
      t.ok(/Ending the turn here: Stink Aura 7 before Sir Testsalot's next turn/.test(DD.HUD.hint()), 'move hint warns for the tile it would end on: ' + DD.HUD.hint());
      DD.HUD.hover(0, 2);
      t.ok(/Out of Stink Aura here \(7 where/.test(DD.HUD.hint()) && q('.hud-hint').classList.contains('good'), 'move hint: escaping the aura reads as good news: ' + DD.HUD.hint());
      // inspect: the hero, the tile, the enemy (its passive line too)
      DD.HUD.hover(k.x, k.y);
      let txt = text('.hud-inspect');
      t.ok(/Auras: 7 before Sir Testsalot's next turn/.test(txt) && /Stink Aura \(Test Grunt\): 7/.test(txt), 'hero inspect lists the aura: ' + txt.slice(0, 220));
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
      heroes: [{ id: 'test_mage', x: 1, y: 3, skills: [shyZap()] }, { id: 'test_knight', x: 4, y: 3 }],
      enemies: [{ id: 'test_grunt', x: 5, y: 2 }, { id: 'test_grunt', x: 6, y: 3 }, { id: 'test_archer', x: 7, y: 7 }],
      objects: [{ x: 5, y: 3, id: 'barrel_explosive' }, { x: 1, y: 6, id: 'barrel' }], enemyAi: false,
    }, extra || {}));
  }
  /**
   * [finish D1] Shy Zap: a single-target damage spell that opts out of objects (target.objects false), so it never aims
   * at a crate or a barrel whatever the engine's rule for spells is. Registered on use; dropShyZap() in finally.
   */
  const SHY = 'hudtest_shy_zap';
  function shyZap() {
    if (!DD.getSkill(SHY)) {
      DD.registerSkill({ id: SHY, name: 'Shy Zap', owner: 'test_mage', icon: '⚡', kind: 'spell', tags: ['lightning', 'ranged'], ap: 2, cooldown: 2,
        levels: [{ dmg: 5 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', objects: false },
        desc: function (L) { return 'Deal ' + L.dmg + ' lightning damage to a foe. Too shy for furniture.'; },
        execute: function (ctx) { if (ctx.targetUnit) DD.Act.damage(ctx.user, ctx.targetUnit, ctx.L.dmg, { element: 'lightning' }); } });
    }
    return SHY;
  }
  function dropShyZap() { delete DD.defs.skills[SHY]; }
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
      // rules run: a plain barrel is a breakable (🔨), never a 💥 — the boom count is for things that explode only
      t.ok(has(ov().targetTiles, { x: 1, y: 6 }) && has(ov().breakTargets, { x: 1, y: 6 }) && !has(ov().objTargets, { x: 1, y: 6 }), 'a plain barrel is a 🔨 breakable target, not a 💥 one');
      t.ok(/or 💥 the Explosive Barrel or 🔨 the Barrel \(/.test(DD.HUD.hint()), 'the aim hint offers the barrel and the breakable: ' + DD.HUD.hint());
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
      t.ok(/💥 Volatile: any single-target damage skill aimed at it \(in range and line of sight\) sets it off/.test(text('.hud-inspect')), 'the barrel\'s inspect panel says damage skills set it off (D1 words)');
      t.ok(/🎯 Click: Magic Missile \(Unit\) sets it off — 8 fire damage within 1 tile/.test(text('.hud-inspect')), 'and what the click does: ' + text('.hud-inspect'));
      // a skill that can't aim at objects (finish D1: one that opts out): no barrel target, and the click explains why
      DD.HUD.rightClick();
      DD.HUD.key('2');
      t.ok(!has(ov().targetTiles, { x: 5, y: 3 }) && !ov().objTargets.length, 'Shy Zap (opts out) does not aim at the barrel');
      DD.HUD.click(5, 3);
      t.ok(/Shy Zap is for foes only, not the Explosive Barrel: another single-target damage skill can set it off\./.test(DD.HUD.hint()), 'clicking it says why: ' + DD.HUD.hint());
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
    } finally { DD.Act.explode = explode0; leave(); dropShyZap(); }
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
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 3, skills: [shyZap()] }, { id: 'test_cleric', x: 2, y: 3, skills: ['test_heal', 'test_sanctuary'] }],
        enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const m = byDef('test_mage'), c = byDef('test_cleric');
      t.ok(/💥 Can also be aimed at an explosive barrel/.test(DD.UI.skillTooltipHtml('test_bolt', 1, m)), 'the mage\'s basic attack (a spell) can set barrels off');
      t.ok(!/explosive barrel/.test(DD.UI.skillTooltipHtml(SHY, 1, m)), 'a damage spell that opts out (target.objects false) can\'t');
      t.ok(/💥 Can also be aimed/.test(DD.UI.skillTooltipHtml('test_slash', 1, null)), 'any kind:attack single-target skill can, even without a unit');
      t.ok(/🆘 Aimed at a downed ally, it gets that ally back up with the healed HP/.test(DD.UI.skillTooltipHtml('test_heal', 1, c)), 'a single-target heal revives');
      t.ok(!/downed ally, it gets/.test(DD.UI.skillTooltipHtml('test_sanctuary', 1, c)), 'an area heal does not');
      t.ok(!/Aimed at a downed|explosive barrel/.test(DD.UI.consumableTooltipHtml('test_potion')), 'a consumable without a kind and an ally target: neither');
      const drink = DD.getConsumable('con_red_drink');
      if (drink && DD.Targeting.revivesWith({ kind: 'hero', side: 'hero' }, drink)) t.ok(/🆘 Aimed at a downed ally/.test(DD.UI.consumableTooltipHtml('con_red_drink')), 'Red Drink revives (consumable tooltip)');
    } finally { leave(); dropShyZap(); }
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

  // ---- rules run: moving through allies (click-through, pass-through range, swaps) and breaking objects ---------------
  /**
   * Real input: DD.Input bound to a canvas laid over the view and the board fitted at `yaw`; io.move / io.click send
   * pointer events through it, so the HUD hears input:tileHover / input:tileClick exactly as from a mouse.
   */
  function realInput(yaw, fn) {
    const r = DD.Render, I = DD.Input;
    const size = r.size();
    const cv = document.createElement('canvas');
    cv.width = size.width; cv.height = size.height;
    cv.style.cssText = 'position:fixed;left:0;top:0;width:' + size.width + 'px;height:' + size.height + 'px';
    document.body.appendChild(cv);
    const scene = r.getScene();
    r.setScene('combat');
    r.setYaw(yaw, { keepFocus: false });
    r.fitMap({ instant: true });
    I.init(cv);
    const pe = function (type, p, extra) {
      cv.dispatchEvent(new PointerEvent(type, Object.assign({ clientX: p.x, clientY: p.y, pointerId: 31, bubbles: true, cancelable: true }, extra || {})));
    };
    const io = {
      move: function (p, shift) { pe('pointermove', p, { shiftKey: !!shift }); },
      click: function (p, shift) {
        pe('pointermove', p, { shiftKey: !!shift });
        pe('pointerdown', p, { button: 0, buttons: 1, shiftKey: !!shift });
        pe('pointerup', p, { button: 0, buttons: 0, shiftKey: !!shift });
      },
      /** A screen point on tile (x, y) that `who`'s sprite covers: the pick hits the sprite, the ground there is the tile. */
      covered: function (x, y, who) {
        const c = r.worldToScreen(x, y), z = r.camera.zoom;
        for (let j = -6; j <= 6; j++) {
          for (let i = -8; i <= 8; i++) {
            const p = { x: c.x + i * 4 * z, y: c.y + j * 2.5 * z };
            const h = I.pick(p.x, p.y);
            if (h && h.unitId === who.id && h.under && h.under.x === x && h.under.y === y) return p;
          }
        }
        return null;
      },
      /** A screen point that picks the unit over its own tile (its feet). */
      feet: function (u) {
        const c = r.worldToScreen(u.x, u.y), z = r.camera.zoom;
        for (let j = 0; j <= 8; j++) {
          for (let i = -4; i <= 4; i++) {
            const p = { x: c.x + i * 2 * z, y: c.y + 4 * z - j * 2 * z };
            const h = I.pick(p.x, p.y);
            if (h && h.unitId === u.id && (!h.under || (h.under.x === u.x && h.under.y === u.y))) return p;
          }
        }
        return null;
      },
    };
    try { return fn(io); } finally {
      I.detach();
      cv.remove();
      r.setYaw(0, { keepFocus: false });
      r.setScene(scene);
    }
  }
  function inputReady(t) {
    if (!ready(t)) return false;
    if (!DD.Input || typeof DD.Input.pick !== 'function' || typeof DD.Render.setYaw !== 'function') { t.skip('no DD.Input / rotation'); return false; }
    return true;
  }
  /** Render the live overlay offscreen (ambient motes pinned so two renders differ only by the overlay). */
  function shot(cv, at, zoom) {
    const rand = Math.random;
    let s = 7;
    Math.random = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    try {
      const w = DD.Iso.toWorld(at.x, at.y, 0);
      return DD.Render.renderTo(cv, { width: 360, height: 260, camera: { x: w.x, y: w.y, zoom: zoom || 1.4 } });
    } finally { Math.random = rand; }
  }
  function tiles(list) { return (list || []).map(function (p) { return p.x + ',' + p.y; }).join(' '); }

  T.suite('hud: rules run — a click on a reachable tile an ally\'s sprite covers moves there (real pointer events; yaw 0, 30, 200)', function (t) {
    if (!inputReady(t)) return;
    try {
      [0, 30, 200].forEach(function (yaw) {
        fight({ w: 9, h: 9, heroes: [{ id: 'test_knight', x: 3, y: 6 }, { id: 'test_mage', x: 4, y: 4 }, { id: 'test_cleric', x: 6, y: 5 }],
          enemies: [{ id: 'test_grunt', x: 8, y: 0 }], enemyAi: false });
        const k = byDef('test_knight'), m = byDef('test_mage');
        const allies = DD.Combat.state.units.filter(function (u) { return u.side === 'hero' && u !== k; });
        realInput(yaw, function (io) {
          t.eq(DD.HUD.selected().id, k.id, 'yaw ' + yaw + ': the knight acts');
          if (yaw === 0) t.ok(!!io.covered(3, 3, m), 'yaw 0: the mage\'s sprite covers the tile right behind the mage (3,3), one the knight can reach');
          let spot = null;
          DD.Combat.reachable(k).forEach(function (e) {
            allies.forEach(function (a) { if (!spot) { const p = io.covered(e.x, e.y, a); if (p) spot = { p: p, x: e.x, y: e.y, ally: a }; } });
          });
          t.ok(!!spot, 'yaw ' + yaw + ': a reachable tile under an ally\'s sprite' + (spot ? ' (' + spot.x + ',' + spot.y + ' under ' + spot.ally.name + ')' : ''));
          if (!spot) return;
          io.move(spot.p);
          t.ok(ov().hover && ov().hover.x === spot.x && ov().hover.y === spot.y, 'yaw ' + yaw + ': the hover lands on the covered tile, not on ' + spot.ally.name);
          const path = ov().path;
          t.ok(path.length > 0 && path[path.length - 1].x === spot.x && path[path.length - 1].y === spot.y, 'yaw ' + yaw + ': the path preview runs there');
          t.ok(ov().ghosts && ov().ghosts[spot.ally.id] === 0.35, 'yaw ' + yaw + ': ' + spot.ally.name + ' fades while the cursor is on the tile behind');
          t.ok(/^Move here/.test(DD.HUD.hint()), 'yaw ' + yaw + ': the hint is the move: ' + DD.HUD.hint());
          const ap0 = k.ap;
          io.click(spot.p);
          t.ok(k.x === spot.x && k.y === spot.y, 'yaw ' + yaw + ': the click moved the knight there');
          t.eq(DD.HUD.selected().id, k.id, 'yaw ' + yaw + ': and selected or inspected nobody else');
          t.eq(k.ap, ap0 - DD.Combat.moveApCost(k), 'yaw ' + yaw + ': it cost a move');
          DD.HUD.key('z');
          t.ok(k.x === 3 && k.y === 6, 'yaw ' + yaw + ': Z undoes it');
          // outside move aiming (no AP to move) a click there inspects the ally as before
          k.ap = 0;
          DD.HUD.refresh();
          io.click(spot.p);
          t.ok(k.x === 3 && k.y === 6, 'yaw ' + yaw + ': with no AP to move, the click moves nobody');
          t.ok(text('.hud-inspect').indexOf(spot.ally.name) >= 0, 'yaw ' + yaw + ': it inspects ' + spot.ally.name + ' instead');
        });
      });
    } finally { leave(); }
  });

  T.suite('hud: rules run — deployment and aiming click through a friendly sprite too (real pointer events)', function (t) {
    if (!inputReady(t)) return;
    try {
      // deployment: a free green tile behind the mage
      const zone = [];
      for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) zone.push({ x: x, y: y });
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }],
        deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage');
      DD.HUD.select(k.id);
      realInput(0, function (io) {
        const p = io.covered(2, 2, m);
        t.ok(!!p, 'the mage\'s sprite covers the green tile (2,2)');
        if (!p) return;
        io.move(p);
        t.ok(ov().ghosts && ov().ghosts[m.id] === 0.35, 'the mage fades');
        io.click(p);
        t.ok(k.x === 2 && k.y === 2, 'the click placed the knight on (2,2)');
        t.eq(DD.HUD.selected().id, k.id, 'the knight stays selected');
        const f = io.feet(m);
        io.click(f, true);
        t.ok(k.x === 3 && k.y === 3 && m.x === 2 && m.y === 2, 'Shift+click on the mage still swaps them in deployment');
        io.click(io.feet(m));
        t.eq(DD.HUD.selected().id, m.id, 'a plain click on the mage selects the mage');
        // Shift+click on the mage's head, over a free green tile: Shift means the mage (swap), not the tile behind
        DD.HUD.select(k.id);
        const hp = io.covered(1, 1, m);
        t.ok(!!hp, 'the mage\'s sprite covers the free green tile (1,1)');
        if (hp) {
          io.click(hp, true);
          t.ok(k.x === 2 && k.y === 2 && m.x === 3 && m.y === 3, 'Shift+click over the mage\'s head swaps with the mage (knight ' + k.x + ',' + k.y + ')');
        }
      });
      leave();
      // aiming: a crate behind the knight's sprite, the mage's basic attack armed
      if (!DD.Targeting.breakable || !DD.getObject('crate')) return;
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 3 }, { id: 'test_knight', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 7, y: 0 }],
        objects: [{ x: 3, y: 3, id: 'crate' }], enemyAi: false });
      const mg = byDef('test_mage'), kn = byDef('test_knight');
      const crate = DD.Grid.tile(3, 3).obj;
      DD.HUD.key('1');
      realInput(0, function (io) {
        const p = io.covered(3, 3, kn);
        t.ok(!!p, 'the knight\'s sprite covers the crate\'s tile');
        if (!p) return;
        io.move(p);
        t.ok(ov().hover && ov().hover.x === 3 && ov().hover.y === 3, 'aiming over the knight\'s head lands on the crate');
        t.ok(ov().ghosts && ov().ghosts[kn.id] === 0.35, 'and the knight fades');
        t.ok(/🔨 Break: Crate/.test(DD.HUD.hint()), 'the hint previews the break: ' + DD.HUD.hint());
        const hp0 = crate.hp, ap0 = mg.ap;
        io.click(p);
        t.ok(crate.hp < hp0 || !DD.Grid.tile(3, 3).obj, 'the click hit the crate (' + hp0 + ' → ' + crate.hp + ')');
        t.ok(mg.ap < ap0 && kn.hp === kn.maxHp, 'the mage paid for the attack; the knight was not hit');
      });
    } finally { leave(); }
  });

  T.suite('hud: rules run — the move range runs on through allies in a corridor: pass tiles, a ⇄ end, the path, the walk', function (t) {
    if (!ready(t)) return;
    if (!DD.Render.renderTo) { t.skip('no renderTo'); return; }
    try {
      fight({ w: 9, h: 5, terrain: function (tl) { return tl.y !== 2 ? { t: 'wall' } : null; },
        heroes: [{ id: 'test_knight', x: 1, y: 2 }, { id: 'test_mage', x: 2, y: 2 }, { id: 'test_cleric', x: 3, y: 2 }],
        enemies: [{ id: 'test_grunt', x: 8, y: 2 }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage'), c = byDef('test_cleric');
      t.eq(DD.HUD.selected().id, k.id, 'the knight acts, last in line');
      t.eq(tiles(ov().moveTiles), '0,2 4,2', 'ahead, the knight can end only past both allies (4,2), never on one');
      t.eq(tiles(ov().swapTiles), '2,2', 'the adjacent mage is a ⇄ end (a swap)');
      t.eq(tiles(ov().passTiles), '3,2', 'the cleric\'s tile is pass-through: the range has no hole');
      DD.HUD.hover(4, 2);
      t.eq(tiles(ov().path), '2,2 3,2 4,2', 'the path preview runs through both allies');
      t.ok(ov().ghosts && ov().ghosts[m.id] === 0.55 && ov().ghosts[c.id] === 0.55, 'both fade a little while the walk through them is aimed');
      t.ok(/Walks through Wizzy McTest and Father Unittest\./.test(DD.HUD.hint()), 'the hint says who it walks through: ' + DD.HUD.hint());
      DD.HUD.hover(3, 2);
      t.ok(/Father Unittest doesn't block: Sir Testsalot walks through/.test(DD.HUD.hint()), 'hovering a farther ally says it does not block: ' + DD.HUD.hint());
      DD.HUD.hover(null);
      t.ok(/^⇄ Boxed in\? Click an ally next to Sir Testsalot to swap places \(1 AP, uses the move\)/.test(DD.HUD.hint()), 'boxed in (2 tiles of range): the idle hint says how to swap out: ' + DD.HUD.hint());
      // the renderer draws the pass tile, the ⇄ ring and the fades only while the overlay has them
      DD.HUD.hover(4, 2);
      const full = JSON.parse(JSON.stringify(ov()));
      const cvA = document.createElement('canvas'), cvB = document.createElement('canvas');
      const a = shot(cvA, { x: 3, y: 2 });
      t.ok(a && a.swapRings === 1 && a.ghosted === 2, '⇄ ring under the mage, both allies faded (' + (a && a.swapRings) + ', ' + (a && a.ghosted) + ')');
      Object.assign(ov(), full, { passTiles: [], swapTiles: [], ghosts: null });
      const b = shot(cvB, { x: 3, y: 2 });
      t.ok(b && b.swapRings === 0 && b.ghosted === 0, 'none without them');
      const d = diffBox(cvA, cvB);
      t.ok(d && d.x1 - d.x0 > 30, 'and the frames differ there ' + JSON.stringify(d));
      Object.assign(ov(), full);
      DD.HUD.click(4, 2);
      t.ok(k.x === 4 && k.y === 2 && m.x === 2 && c.x === 3, 'the knight walked through both allies to (4,2)');
    } finally { leave(); }
  });

  T.suite('hud: rules run — swap with an adjacent ally: ⇄ preview, the click (real pointer), undo, attacks of opportunity, refusals, Help Up', function (t) {
    if (!inputReady(t)) return;
    if (!DD.Combat.swapInfo) { t.skip('no swaps in the engine'); return; }
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 3 }, { id: 'test_mage', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage');
      t.ok(has(ov().swapTiles, m), 'the adjacent mage is marked ⇄ (overlay.swapTiles)');
      DD.HUD.hover(m.x, m.y);
      t.ok(ov().swap && ov().swap.from.x === 2 && ov().swap.to.x === 3 && !ov().swap.bad, 'hovering the mage previews the swap (arrows both ways)');
      t.ok(/⇄ Swap with Wizzy McTest: 1 move, 1 AP; it costs Wizzy McTest nothing \(no AP, no turn\)\./.test(DD.HUD.hint()), 'and says what it costs: ' + DD.HUD.hint());
      const mAp = m.ap, kAp = k.ap;
      realInput(0, function (io) {
        const p = io.feet(m);
        t.ok(!!p, 'a screen spot on the mage');
        if (!p) return;
        io.move(p);
        t.ok(ov().swap && ov().swap.to.x === 3, 'the real hover previews it too');
        io.click(p);
      });
      t.ok(k.x === 3 && k.y === 3 && m.x === 2 && m.y === 3, 'the click swapped them');
      t.eq(k.ap, kAp - DD.Combat.moveApCost(k), 'it cost the knight a move');
      t.eq(m.ap, mAp, 'the mage paid nothing');
      t.eq(DD.HUD.selected().id, k.id, 'the knight is still selected');
      DD.HUD.undo();
      t.ok(k.x === 2 && m.x === 3 && k.ap === kAp, 'Z undoes the swap');
      // a stunned ally won't budge
      DD.Act.addStatus(m, 'stun', { turns: 1 }, null);
      DD.HUD.refresh();
      t.ok(!has(ov().swapTiles, m), 'a stunned ally is no ⇄ end');
      DD.HUD.hover(m.x, m.y);
      t.ok(/⇄ Wizzy McTest is out cold and won't budge\./.test(DD.HUD.hint()), 'hovering says why (greyed; the reason names the ally first): ' + DD.HUD.hint());
      DD.HUD.click(m.x, m.y);
      t.ok(k.x === 2 && m.x === 3, 'the click swapped nobody');
      t.ok(/⇄ Wizzy McTest is out cold/.test(DD.HUD.hint()), 'and says why: ' + DD.HUD.hint());
      // a downed ally next to the knight: the click is still Help Up
      DD.Act.kill(m, null);
      DD.HUD.refresh();
      t.ok(m.downed && !has(ov().swapTiles, m), 'downed: no ⇄');
      DD.HUD.click(m.x, m.y);
      t.ok(!m.downed, 'clicking a downed ally next to the knight helps the ally up');
    } finally { leave(); }
    try {
      // the swap walks the knight away from a grunt: an attack of opportunity
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 3 }, { id: 'test_mage', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage');
      const si = DD.Combat.swapInfo(k, m.x, m.y);
      t.ok(si && si.ok === true && si.provokes.length === 1, 'engine: this swap provokes the grunt');
      DD.HUD.hover(m.x, m.y);
      t.ok(ov().swap && ov().swap.bad, 'red swap arrows');
      t.ok(ov().previews[k.id] && ov().previews[k.id].text === '⚔' && ov().previews[k.id].dmg === si.provokes[0].dmg, 'the hit on the knight is previewed (' + si.provokes[0].dmg + ')');
      t.ok(/⚔ <?b?>?Provokes 1|⚔ Provokes 1/.test(DD.HUD.hint()) && /Can't be undone/.test(DD.HUD.hint()), 'the hint warns: ' + DD.HUD.hint());
    } finally { leave(); }
    try {
      // a unit of this turn (the summoner's hound): a click selects it, Shift+click swaps
      fight({ heroes: [{ id: 'test_summoner', x: 2, y: 3 }], summons: [{ id: 'test_hound', x: 3, y: 3, owner: 'test_summoner' }],
        enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const sm = byDef('test_summoner'), hd = byDef('test_hound');
      t.eq(DD.HUD.selected().id, sm.id, 'the summoner acts');
      t.ok(has(ov().swapTiles, hd), 'the hound can be swapped with');
      DD.HUD.hover(hd.x, hd.y);
      t.ok(DD.HUD.hint().indexOf('Click selects ' + hd.name + ' · Shift+click: ⇄ swap places (1 move, 1 AP)') === 0, 'hover: click selects, Shift+click swaps: ' + DD.HUD.hint());
      t.ok(!ov().swap, 'no swap arrows for a plain click that selects');
      DD.HUD.click(hd.x, hd.y, { shift: true });
      t.ok(sm.x === 3 && hd.x === 2, 'Shift+click swapped them');
      DD.HUD.click(hd.x, hd.y);
      t.eq(DD.HUD.selected().id, hd.id, 'a plain click selects the hound');
    } finally { leave(); }
  });

  T.suite('hud: rules run review — the acting hero\'s own sprite in front of an adjacent ally: the click swaps / helps up (real pointer events)', function (t) {
    if (!inputReady(t)) return;
    if (!DD.Combat.swapInfo) { t.skip('no swaps in the engine'); return; }
    // the knight's sprite covers part of the mage's tile right behind (up-screen of) him at these views; before the
    // review a click there hit the knight himself and did nothing
    [0, 45, 200].forEach(function (yaw) {
      try {
        let k = null, m = null, spot = null;
        [[3, 4], [4, 3], [5, 4], [4, 5]].some(function (at) {
          fight({ heroes: [{ id: 'test_knight', x: 4, y: 4 }, { id: 'test_mage', x: at[0], y: at[1] }], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], enemyAi: false });
          k = byDef('test_knight'); m = byDef('test_mage');
          realInput(yaw, function (io) { spot = io.covered(m.x, m.y, k); });
          return !!spot;
        });
        t.ok(!!spot, 'yaw ' + yaw + ': the knight\'s sprite covers part of an adjacent mage\'s tile (' + (m ? m.x + ',' + m.y : '-') + ')');
        if (!spot) return;
        const mx = m.x, my = m.y;
        realInput(yaw, function (io) {
          io.move(spot);
          t.ok(ov().hover && ov().hover.x === mx && ov().hover.y === my, 'yaw ' + yaw + ': the hover lands on the mage\'s tile');
          t.ok(ov().swap && ov().swap.to.x === mx && ov().swap.to.y === my, 'yaw ' + yaw + ': and previews the swap');
          t.ok(ov().ghosts && ov().ghosts[k.id] === 0.35, 'yaw ' + yaw + ': the knight fades so the mage shows');
          t.ok(/⇄ Swap with Wizzy McTest/.test(DD.HUD.hint()), 'yaw ' + yaw + ': the hint: ' + DD.HUD.hint());
          io.click(spot);
          t.ok(k.x === mx && k.y === my && m.x === 4 && m.y === 4, 'yaw ' + yaw + ': the click swapped them');
          DD.HUD.undo();
          t.ok(k.x === 4 && k.y === 4 && m.x === mx, 'yaw ' + yaw + ': Z undoes it');
          // a downed mage there: the same click helps her up
          DD.Act.kill(m, null);
          DD.HUD.refresh();
          io.click(spot);
          t.ok(!m.downed && k.x === 4 && k.y === 4, 'yaw ' + yaw + ': downed, the click is Help Up');
        });
      } finally { leave(); }
    });
  });

  T.suite('hud: rules run — breakable objects: 🔨 target, "Break: …" preview, the HP bar, inspect, the hit; opt-outs say why', function (t) {
    if (!ready(t)) return;
    if (!DD.Targeting.breakable || !DD.getObject('crate')) { t.skip('no breakable targeting'); return; }
    try {
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 3, skills: ['test_chain_zap'] }, { id: 'test_knight', x: 1, y: 6 }],
        enemies: [{ id: 'test_grunt', x: 7, y: 7 }], objects: [{ x: 4, y: 3, id: 'crate' }, { x: 3, y: 5, id: 'crate', targetable: false }], enemyAi: false });
      const m = byDef('test_mage');
      const crate = DD.Grid.tile(4, 3).obj;
      DD.HUD.key('1');
      t.ok(has(ov().targetTiles, { x: 4, y: 3 }) && has(ov().breakTargets, { x: 4, y: 3 }) && !ov().objTargets.length, 'the armed basic attack can hit the crate: a 🔨 target, no 💥');
      t.ok(!has(ov().targetTiles, { x: 3, y: 5 }), 'a crate marked targetable: false is no target');
      t.ok(/or 🔨 the Crate \(/.test(DD.HUD.hint()), 'the aim hint offers it: ' + DD.HUD.hint());
      DD.HUD.click(3, 5);
      t.ok(/The Crate can't be targeted: (Smash it from next to it or catch it in an area attack|only an area attack or a blast reaches it)\./.test(DD.HUD.hint()), 'clicking the opted-out crate says why: ' + DD.HUD.hint());
      t.eq(DD.Grid.tile(3, 5).obj.hp, 6, 'and nothing hit it');
      DD.HUD.clearHint();
      DD.HUD.hover(4, 3);
      const p = DD.Combat.preview(m, m.basic, 4, 3);
      t.ok(p && p.breaks && p.breaks.id === 'crate', 'the engine preview breaks it');
      t.ok(DD.HUD.hint().indexOf('🔨 ' + p.breaks.text) >= 0, 'the hint shows "' + (p.breaks && p.breaks.text) + '": ' + DD.HUD.hint());
      t.ok(ov().objPreview && ov().objPreview.x === 4 && ov().objPreview.dmg === p.breaks.dmg && ov().objPreview.breaks === p.breaks.destroyed, 'the HP bar previews the hit (overlay.objPreview)');
      t.ok(/🔨 Breakable \(6\/6 HP\): any single-target damage skill can break it \(in range and line of sight\)\. It takes the skill's listed damage and nothing else/.test(text('.hud-inspect')), 'inspect: its HP and that any single-target damage skill can break it (D1 words): ' + text('.hud-inspect'));
      t.ok(/🎯 Click: Magic Missile \(Unit\) hits it for \d+/.test(text('.hud-inspect')), 'and what this click does');
      // the 🔨 marker: drawn over the crate, a "break" box; nothing without breakTargets
      const cvA = document.createElement('canvas'), cvB = document.createElement('canvas');
      const full = JSON.parse(JSON.stringify(ov()));
      [0, 30, 200].forEach(function (yaw) {
        Object.assign(ov(), full);
        const camAt = function (cv) {
          const cam = DD.Iso.withYaw(yaw, function () { const w = DD.Iso.toWorld(4, 3, 0); return { x: w.x, y: w.y, zoom: 1.4 }; });
          const rand = Math.random; let s = 7;
          Math.random = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
          try { return DD.Render.renderTo(cv, { width: 360, height: 260, yaw: yaw, camera: cam }); } finally { Math.random = rand; }
        };
        const a = camAt(cvA);
        const bm = a && a.booms && a.booms.filter(function (x) { return x.x === 4 && x.y === 3; })[0];
        t.ok(bm && bm.kind === 'break' && Math.abs((bm.x0 + bm.x1) / 2 - 180) <= 5 && bm.y1 < 130, 'yaw ' + yaw + ': the 🔨 marker stands over the crate ' + JSON.stringify(bm));
        Object.assign(ov(), full, { breakTargets: [], objPreview: null });
        const b = camAt(cvB);
        t.ok(b && !b.booms.length, 'yaw ' + yaw + ': no marker without breakTargets');
        const d = diffBox(cvA, cvB);
        t.ok(d && Math.abs(d.cx - 180) <= 8 && d.y1 < 130, 'yaw ' + yaw + ': only the marker and the HP bar differ, over the crate ' + JSON.stringify(d));
      });
      Object.assign(ov(), full);
      // the hit: exactly the preview, the attack's AP paid, back to move mode
      const hp0 = crate.hp, ap0 = m.ap;
      DD.HUD.click(4, 3);
      if (p.breaks.destroyed) t.ok(!DD.Grid.tile(4, 3).obj, 'it broke');
      else t.eq(crate.hp, hp0 - p.breaks.dmg, 'it took exactly the previewed damage');
      t.ok(m.ap < ap0 && DD.HUD.mode().kind === 'move', 'the attack was paid; back to move mode');
      // a last hit: "— breaks!"
      if (DD.Grid.tile(4, 3).obj) {
        crate.hp = 1;
        DD.HUD.key('1');
        DD.HUD.hover(4, 3);
        t.ok(/🔨 Break: Crate − \d+ damage — breaks!/.test(DD.HUD.hint()), 'one HP left: "breaks!": ' + DD.HUD.hint());
        t.ok(ov().objPreview && ov().objPreview.breaks, 'the bar shows it all going');
        DD.HUD.click(4, 3);
        t.ok(!DD.Grid.tile(4, 3).obj, 'and the click broke it');
      }
      // the opted-out crate's inspect
      DD.HUD.rightClick();
      DD.HUD.hover(3, 5);
      t.ok(/🚫 Not a target/.test(text('.hud-inspect')), 'the opted-out crate\'s inspect says so: ' + text('.hud-inspect'));
    } finally { leave(); }
    try {
      // a skill that can't hit objects (finish D1: it opts out)
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 3, skills: [shyZap()] }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }], objects: [{ x: 3, y: 3, id: 'crate' }], enemyAi: false });
      DD.HUD.key('2');
      t.eq(DD.HUD.mode().kind, 'skill', 'Shy Zap is armed');
      t.ok(!has(ov().targetTiles, { x: 3, y: 3 }) && !ov().breakTargets.length, 'Shy Zap (opts out) does not aim at objects');
      DD.HUD.click(3, 3);
      t.ok(/Shy Zap is for foes only, not the Crate: another single-target damage skill can break it\./.test(DD.HUD.hint()), 'the click says why: ' + DD.HUD.hint());
      t.eq(DD.Grid.tile(3, 3).obj.hp, 6, 'and the crate is untouched');
      DD.HUD.hover(3, 3);
      t.ok(/· Shy Zap is for foes only and can't break it\./.test(text('.hud-inspect')), 'the crate\'s inspect says the armed skill opts out: ' + text('.hud-inspect'));
    } finally { leave(); dropShyZap(); }
  });

  T.suite('hud: rules run — breaking: what it does (objective count, loot, puzzle step); tooltips offer it', function (t) {
    if (!ready(t)) return;
    if (!DD.Targeting.breakable || !DD.Targeting.objectDamage) { t.skip('no breakable targeting'); return; }
    const oid = 'hudtest_piggy';
    try {
      DD.registerObject({ id: oid, name: 'Piggy Bank', hp: 3, blocksMove: true, blocksLos: false, color: '#f49ac1', autoplay: 7,
        desc: 'Destructible (3 HP). Holds 4 gold and one IOU.', onDestroyed: function () { DD.Act.gainGold(4); } });
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }],
        objects: [{ x: 3, y: 3, id: oid }, { x: 3, y: 5, id: oid }, { x: 4, y: 1, id: 'crate' }], enemyAi: false, kind: 'boss',
        objective: { type: 'destroy', objId: oid, count: 2 } });
      const m = byDef('test_mage');
      const gold0 = DD.Act.gold();
      DD.HUD.key('1');
      DD.HUD.hover(3, 3);
      const h = DD.HUD.hint();
      t.ok(/🔨 Break: Piggy Bank − 3 damage — breaks!/.test(h), 'the break: ' + h);
      t.ok(/🎯 Objective 1\/2/.test(h) && !/wins the fight/.test(h), 'it counts toward the objective (1 of 2)');
      t.ok(/💰 \+4 gold/.test(h), 'its loot (the gold its onDestroyed hands out)');
      t.ok(/🧩 Puzzle step/.test(h), 'a boss fight object with a puzzle hint: a puzzle step');
      t.eq(DD.Act.gold(), gold0, 'the preview gave no real gold');
      t.ok(/🎯 Objective: break 2 of these \(0 so far\)\./.test(text('.hud-inspect')), 'inspect: the objective line');
      DD.HUD.hover(4, 1);
      t.ok(/🔨 Break: Crate/.test(DD.HUD.hint()) && !/Objective|gold|Puzzle/.test(DD.HUD.hint()), 'a plain crate: just the break: ' + DD.HUD.hint());
      DD.HUD.click(3, 3);
      t.ok(!DD.Grid.tile(3, 3).obj && DD.Act.gold() === gold0 + 4, 'the click broke it and paid out');
      m.ap = 3;
      DD.HUD.refresh();
      DD.HUD.key('1');
      DD.HUD.hover(3, 5);
      t.ok(/🎯 Objective 2\/2: that wins the fight!/.test(DD.HUD.hint()), 'the last one says it wins the fight: ' + DD.HUD.hint());
      // the skill tooltip offers objects too (UI.aimNotes), with the damage an object takes
      t.ok(/🔨 Can also hit a breakable object in range \(crates, totems…\) for 4 damage and nothing else; it breaks at 0 HP\./.test(DD.UI.skillTooltipHtml('test_bolt', 1, m)), 'the basic attack\'s tooltip: 🔨 for its listed damage and nothing else');
      t.ok(!/breakable object/.test(DD.UI.skillTooltipHtml(shyZap(), 1, m)), 'a damage spell that opts out: no 🔨 line');
    } finally {
      delete DD.defs.objects[oid];
      leave();
      dropShyZap();
    }
  });

  // ---- render / HUD polish (wf10) ------------------------------------------------------------------------------------
  /** The src of the first portrait image inside an element (party card, tracker chip, inspect head). */
  function portSrc(node) { const img = node && node.querySelector('.portrait img, img.portrait-canvas'); return img ? img.getAttribute('src') : ''; }
  function cardOf(name) { return qa('.hud-card').filter(function (c) { return c.textContent.indexOf(name) >= 0; })[0] || null; }

  T.suite('hud: polish — portraits follow forms (party card, tracker, inspect)', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }, { id: 'test_mage', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 5, y: 2 }], enemyAi: false });
      const k = byDef('test_knight');
      const card0 = portSrc(cardOf(k.name)), chip0 = portSrc(q('.tk-chip[data-unit="' + k.id + '"]'));
      DD.HUD.hover(k.x, k.y);
      const insp0 = portSrc(q('.hud-inspect .hi-head'));
      t.ok(card0 && chip0 && insp0, 'portraits drawn (card, tracker chip, inspect)');
      // a form change (what Transform / Wild Shape do): unit.sprite now holds another look
      k.sprite = { base: 'quadruped', palette: { skin: '#8f8c98', accent: '#ffd23f' }, shape: { body: 'long' } };
      DD.HUD.hover(null);
      DD.HUD.refresh();
      const card1 = portSrc(cardOf(k.name)), chip1 = portSrc(q('.tk-chip[data-unit="' + k.id + '"]'));
      t.ok(card1 && card1 !== card0, 'the party card shows the new form');
      t.ok(chip1 && chip1 !== chip0, 'so does its tracker portrait');
      DD.HUD.hover(k.x, k.y);
      t.ok(portSrc(q('.hud-inspect .hi-head')) !== insp0, 'and the inspect panel');
      // the on-screen pin (vis.sprite) wins while FX playback catches up, like on the board
      const pin = { base: 'blob', palette: { skin: '#59d36a' } };
      k.vis.sprite = pin;
      DD.HUD.hover(null);
      DD.HUD.refresh();
      t.ok(portSrc(cardOf(k.name)) !== card1, 'a pinned look (vis.sprite) shows first');
      // back to the def look: the very same cached portrait as at the start
      k.vis.sprite = null;
      delete k.sprite;
      DD.HUD.refresh();
      t.eq(portSrc(cardOf(k.name)), card0, 'back in his own look: the original portrait');
      t.eq(portSrc(q('.tk-chip[data-unit="' + k.id + '"]')), chip0, '...on the tracker too');
    } finally { leave(); }
  });

  T.suite('hud: polish — a skill\'s own canTarget refusal is the hint; inspect pills for noProvoke / noOpportunity / immunities; every ability listed', function (t) {
    if (!ready(t)) return;
    const sid = 'hudtest_picky';
    try {
      DD.registerSkill({
        id: sid, name: 'Picky Poke', owner: 'test_knight', icon: '👉', ap: 1, levels: [{ dmg: 2 }],
        target: { type: 'unit', range: [1, 6], filter: 'enemy', canTarget: function (ctx) { return ctx.target && ctx.target.x === 5 ? 'Only on Tuesdays. Today is not Tuesday.' : true; } },
        desc: function () { return 'Poke a foe for 2 damage, but only on Tuesdays.'; },
        execute: function (ctx) { DD.Act.damage(ctx.user, ctx.targetUnit, 2); },
      });
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2, skills: [sid], passives: [] }, { id: 'test_mage', x: 2, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 5, y: 2 }, { id: 'test_archer', x: 3, y: 4 }], enemyAi: false, noPlan: true });
      const g = byDef('test_grunt'), k = byDef('test_knight');
      DD.HUD.key('2');
      t.eq((DD.HUD.mode() || {}).kind, 'skill', 'Picky Poke armed');
      DD.HUD.hover(g.x, g.y);
      DD.HUD.click(g.x, g.y);
      t.ok(/Only on Tuesdays\. Today is not Tuesday\./.test(DD.HUD.hint()), 'clicking a foe it refuses says the skill\'s own reason: ' + DD.HUD.hint());
      t.eq(g.hp, g.maxHp, 'and nothing happened');
      DD.HUD.key('Escape');
      DD.HUD.rightClick();
      DD.HUD.hover(null);
      // pills: noProvoke / noOpportunity on anyone; resistances and status immunities on heroes too
      g.flags.noProvoke = true;
      g.flags.noOpportunity = true;
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      const gt = text('.hud-inspect');
      t.ok(/👻 Can't be pinned/.test(gt), 'noProvoke pill: ' + gt.slice(0, 200));
      t.ok(/🕊 No free hits/.test(gt), 'noOpportunity pill');
      DD.HUD.hover(null);
      k.resist = { fire: 0, poison: 0.5 };
      k.flags.immune = ['burn'];
      DD.HUD.refresh();
      DD.HUD.hover(k.x, k.y);
      const kt = text('.hud-inspect');
      t.ok(/Immune: fire/.test(kt) && /Resists poison/.test(kt), 'a hero\'s resistances: ' + kt.slice(0, 220));
      t.ok(/Immune: Burning/.test(kt), 'and status immunities (flags.immune)');
      // every ability, not just four
      DD.HUD.hover(null);
      const stab = (g.skillSlots || [])[0];
      for (let i = 0; i < 5 && stab; i++) g.skillSlots.push(DD.Act.makeSlot(stab.id, 1));
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      const n = (DD.Combat.slotsOf(g) || []).filter(Boolean).length;
      t.ok(n > 4, 'the grunt now has ' + n + ' abilities');
      t.eq(qa('.hud-inspect .hi-abil').length, n, 'the inspect panel lists all of them');
      t.ok(/Abilities \(\d+\)/.test(text('.hud-inspect')), 'with the count in the heading');
    } finally {
      delete DD.defs.skills[sid];
      leave();
    }
  });

  T.suite('hud: polish — Loaded Dice shows every die it rolled on the dice moment and the initiative badge', function (t) {
    if (!ready(t)) return;
    if (!DD.FXRender || !DD.FXRender.moments || !DD.getPassive || !DD.getPassive('rp_loaded_dice')) { t.skip('moments or Loaded Dice missing'); return; }
    try {
      const zone = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 1 }];
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1, passives: [{ id: 'rp_loaded_dice', level: 3 }] }, { id: 'test_mage', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }],
        deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      DD.HUD.forceMoments(true);
      withAnimatedFx(function (F) {
        const k = byDef('test_knight');
        DD.HUD.rollInitiative();
        for (let i = 0; i < 40 && !DD.HUD.moment(); i++) { F.update(40); DD.HUD.tick(); }
        const p = (k.passives || []).filter(function (x) { return x && x.id === 'rp_loaded_dice'; })[0];
        const dice = p && p.data && p.data.dice;
        t.ok(Array.isArray(dice) && dice.length === 3, 'Loaded Dice III rolled 3 d20s (' + JSON.stringify(dice) + ')');
        const marker = F.active.filter(function (e) { return e.type === 'initiative'; })[0];
        t.ok(!!DD.HUD.moment() && !!marker, 'the dice moment plays');
        if (!marker) return;
        F.update(marker.ms * 0.8); DD.HUD.tick();
        const xd = qa('.hud-rolltray .rt-xd');
        t.eq(xd.length, 1, 'one card shows extra dice (only the knight has Loaded Dice)');
        const tx = xd[0] ? xd[0].textContent : '';
        t.ok(dice && dice.every(function (v) { return tx.indexOf(String(v)) >= 0; }), 'it shows every die: ' + tx);
        t.ok(xd[0] && xd[0].querySelector('b') && +xd[0].querySelector('b').textContent === Math.max.apply(null, dice), 'the kept (best) die in bold');
        t.ok(xd[0] && /kept the best/.test(xd[0].getAttribute('title') || ''), 'its tooltip says so');
        DD.HUD.skipMoment();
        F.flush();
        DD.HUD.tick();
        DD.HUD.hover(k.x, k.y);
        const badge = q('.hud-inspect .hi-order');
        t.ok(badge && /d20s [\d /]+, kept \d+/.test(badge.getAttribute('title') || ''), 'the inspect initiative badge lists the dice: ' + (badge && badge.getAttribute('title')));
      });
    } finally { DD.HUD.forceMoments(false); leave(); }
  });

  T.suite('hud: polish — the HUD reports its panels so the board fit keeps out from under them', function (t) {
    if (!ready(t)) return;
    const R = DD.Render, before = R.hudMargins;
    try {
      fight({ w: 10, h: 7, heroes: [{ id: 'test_knight', x: 1, y: 5 }, { id: 'test_mage', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 9, y: 0 }, { id: 'test_archer', x: 0, y: 0 }], enemyAi: false });
      t.ok(typeof R.hudMargins === 'function', 'mounted: DD.Render.hudMargins is the HUD\'s');
      const W = R.size().width, H = R.size().height;
      t.eq(R.hudMargins(W, H).avoid.length, 0, 'headless: no panels reported unless a test asks');
      const boxes = DD.HUD.fitAvoid(true);
      const log = q('.hud-log').getBoundingClientRect(), obj = q('.hud-obj').getBoundingClientRect();
      t.ok(boxes.length >= 5, 'panels reported (' + boxes.length + ')');
      t.ok(boxes.some(function (b) { return Math.abs(b.x0 - log.left) < 1 && Math.abs(b.y1 - log.bottom) < 1 && !b.soft; }), 'the combat log (hard)');
      t.ok(boxes.some(function (b) { return Math.abs(b.x0 - obj.left) < 1 && b.soft; }), 'the objective (soft: it fades when something is under it)');
      t.ok(boxes.every(function (b) { return b.x1 > b.x0 && b.y1 > b.y0; }), 'every box is a real box');
      t.eq(R.hudMargins(W, H, { live: false }).avoid.length, 0, 'offscreen renders (renderTo) get none');
      t.ok(R.hudMargins(W, H).avoid.length === boxes.length, 'the renderer sees the same boxes');
      // the fit at a diagonal view keeps every unit head and tile centre out of the hard panels
      R.setYaw(45, { keepFocus: false });
      R.fitMap({ instant: true });
      const s = DD.Combat.state;
      const hard = boxes.filter(function (b) { return !b.soft; });
      const hidden = [];
      s.grid.tiles.forEach(function (tl) {
        const p = R.worldToScreen(tl.x, tl.y, R.tileTop(tl.x, tl.y));
        if (hard.some(function (b) { return p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1; })) hidden.push(tl.x + ',' + tl.y);
      });
      s.units.forEach(function (u) {
        const p = R.worldToScreen(u.x, u.y), hy = p.y - DD.Sprites.metrics(u).height * R.camera.zoom;
        if (boxes.some(function (b) { return p.x > b.x0 && p.x < b.x1 && hy > b.y0 && hy < b.y1; })) hidden.push(u.name);
      });
      t.eq(hidden.length, 0, 'at 45 deg nothing sits under a panel (' + (hidden.join(' ') || 'none') + ')');
      DD.HUD.fitAvoid(false);
    } finally {
      R.setYaw(0, { keepFocus: false });
      leave();
    }
    t.eq(R.hudMargins, before, 'unmounted: the previous hudMargins is back');
  });

  // Review (balance run): the objective faded over a boss whose head and HP pill were well clear of it (the peek test
  // guessed every boss 120 px tall at any zoom, while the board fit keeps the real sprite and pill clear); and a resize
  // refitted with the panels measured at the old window size.
  T.suite('hud: review — the objective fades for the real sprite and HP pill; a resize measures the panels again', function (t) {
    if (!ready(t)) return;
    const R = DD.Render;
    const w2s = R.worldToScreen;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_boss', x: 6, y: 6 }], enemyAi: false });
      const b = byDef('test_boss');
      const E = DD.HUD.els();
      const r = E.obj.getBoundingClientRect();
      const z = R.camera.zoom, zc = Math.max(0.65, Math.min(1.5, z)), m = DD.Sprites.metrics(b);
      t.ok(b.tier === 'boss' && m.height > 0, 'a boss with real sprite metrics (height ' + Math.round(m.height) + ')');
      // its feet so low that its HP pill sits 6 px under the panel: head and pill clear
      const sts = (b.statuses || []).some(function (x) { return x && x.id; });
      const top = Math.max((m.height + 16) * z, m.height * z + 4 * z + (sts ? 18 * zc + 8 : 5 * zc + 4));
      const at = function (dy) { R.worldToScreen = function (x, y) { return x === b.x && y === b.y ? { x: (r.left + r.right) / 2, y: r.bottom + top + dy } : { x: -500, y: -500 }; }; };
      at(6);
      t.ok(!DD.HUD.objPeek(), 'a boss whose head and HP pill are clear of the objective: it stays solid');
      at(-8);
      t.ok(DD.HUD.objPeek(), 'its HP pill under the panel: it fades');
      // beside the panel: the HP number left of the bar still counts (the pill reaches ' + Math.round(48 * zc + 9) + ' px left)
      R.worldToScreen = function (x, y) { return x === b.x && y === b.y ? { x: r.right + 48 * zc, y: r.bottom + top - 8 } : { x: -500, y: -500 }; };
      t.ok(DD.HUD.objPeek(), 'the pill\'s left end under the panel\'s right edge: it fades');
      R.worldToScreen = function () { return { x: -500, y: -500 }; };
      t.ok(!DD.HUD.objPeek(), 'nobody near it: solid again');
      // the panels the fit avoids are measured again at a new window size (not reused for AVOID_MS)
      R.worldToScreen = w2s;
      const a1 = DD.HUD.fitAvoid(true);
      const iw = Object.getOwnPropertyDescriptor(window, 'innerWidth');
      let measured = 0;
      const gbcr = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { measured++; return gbcr.call(this); };
      try {
        Object.defineProperty(window, 'innerWidth', { configurable: true, get: function () { return 1234; } });
        R.hudMargins(800, 600);
        t.ok(measured > 0, 'a new window size: the panels are measured again (' + measured + ' boxes read)');
        measured = 0;
        R.hudMargins(800, 600);
        t.eq(measured, 0, 'the same size within the cache window: reused');
      } finally {
        Element.prototype.getBoundingClientRect = gbcr;
        if (iw) Object.defineProperty(window, 'innerWidth', iw); else delete window.innerWidth;
      }
      t.ok(a1.length >= 5, '(panels reported: ' + a1.length + ')');
      DD.HUD.fitAvoid(false);
    } finally {
      R.worldToScreen = w2s;
      leave();
    }
  });

  // ---- playtest fixes (Nov 12; .tmp/wf12/confirmed-findings.json) ---------------------------------------------------------
  /** Every screen point (a grid around the unit) whose pick hits `who`'s sprite: [{ x, y, under }]. */
  function spritePoints(who) {
    const r = DD.Render, I = DD.Input;
    const c = r.worldToScreen(who.x, who.y), z = r.camera.zoom;
    const out = [];
    for (let j = -24; j <= 6; j++) {
      for (let i = -10; i <= 10; i++) {
        const p = { x: c.x + i * 2 * z, y: c.y + j * 2 * z };
        const h = I.pick(p.x, p.y);
        if (h && h.unitId === who.id) out.push({ x: p.x, y: p.y, under: h.under || null });
      }
    }
    return out;
  }

  T.suite('hud: playtest first-hour-2 — anywhere on an adjacent ally\'s sprite a click swaps (never the tile behind); Shift keeps the ally on hover', function (t) {
    if (!inputReady(t)) return;
    if (!DD.Combat.swapInfo) { t.skip('no swaps in the engine'); return; }
    [0, 135, 315].forEach(function (yaw) {
      try {
        fight({ w: 9, h: 9, heroes: [{ id: 'test_knight', x: 4, y: 5 }, { id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 0 }], enemyAi: false });
        const k = byDef('test_knight'), m = byDef('test_mage');
        realInput(yaw, function (io) {
          const pts = spritePoints(m);
          const behind = pts.filter(function (p) { return p.under && !(p.under.x === m.x && p.under.y === m.y) && DD.Combat.reachable(k).get(p.under.x + ',' + p.under.y); });
          t.ok(pts.length > 20, 'yaw ' + yaw + ': ' + pts.length + ' points on the mage\'s sprite (' + behind.length + ' over a reachable tile behind)');
          const off = pts.filter(function (p) { io.move(p); return !(ov().hover && ov().hover.x === m.x && ov().hover.y === m.y && ov().swap); });
          t.eq(off.length, 0, 'yaw ' + yaw + ': every one of them previews the swap with the mage (' + off.length + ' did not)');
          const p = behind[0] || pts[0];
          io.move(p);
          t.ok(/⇄ Swap with Wizzy McTest/.test(DD.HUD.hint()), 'yaw ' + yaw + ': the hint is the swap: ' + DD.HUD.hint());
          io.click(p);
          t.ok(k.x === 4 && k.y === 4 && m.x === 4 && m.y === 5, 'yaw ' + yaw + ': the click swapped them (knight ' + k.x + ',' + k.y + ')');
          DD.HUD.undo();
          // downed: the same sprite helps up, anywhere on it
          DD.Act.kill(m, null);
          DD.HUD.refresh();
          const dp = spritePoints(m);
          const wrong = dp.filter(function (q) { io.move(q); return !/^🆘 Click: Help Up Wizzy McTest/.test(DD.HUD.hint()); });
          t.ok(dp.length > 0 && wrong.length === 0, 'yaw ' + yaw + ': hovering the downed mage (' + dp.length + ' points) previews Help Up everywhere (' + wrong.length + ' not): ' + DD.HUD.hint());
          if (dp.length) io.click(dp[dp.length - 1]);
          t.ok(!m.downed && k.x === 4 && k.y === 5, 'yaw ' + yaw + ': the click helped the mage up and moved nobody');
        });
      } finally { leave(); }
    });
    try {
      // a farther ally: the click still reaches the tile behind it; Shift held keeps the ally (the hover agrees with Shift+click)
      fight({ w: 9, h: 9, heroes: [{ id: 'test_knight', x: 3, y: 6 }, { id: 'test_mage', x: 4, y: 4 }], enemies: [{ id: 'test_grunt', x: 8, y: 0 }], enemyAi: false });
      const m = byDef('test_mage');
      realInput(0, function (io) {
        const p = io.covered(3, 3, m);
        t.ok(!!p, 'the mage\'s sprite covers (3,3)');
        if (!p) return;
        io.move(p);
        t.ok(ov().hover && ov().hover.x === 3 && ov().hover.y === 3 && /^Move here/.test(DD.HUD.hint()), 'no Shift: the hover goes through to (3,3)');
        io.move(p, true);
        t.ok(ov().hover && ov().hover.x === 4 && ov().hover.y === 4 && /Wizzy McTest doesn't block/.test(DD.HUD.hint()), 'Shift held: the hover stays on the mage: ' + DD.HUD.hint());
        io.move(p);
      });
    } finally { leave(); }
  });

  T.suite('hud: playtest first-hour-v1 / combat-controls-3 — hovering a downed ally previews Help Up (or why not); a chest previews its click', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 3, y: 3 }, { id: 'test_mage', x: 4, y: 3 }, { id: 'test_cleric', x: 3, y: 6 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }],
        objects: [{ x: 2, y: 3, id: 'chest' }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage'), c = byDef('test_cleric');
      DD.Act.kill(m, null);
      DD.Act.kill(c, null);
      DD.HUD.refresh();
      DD.HUD.hover(m.x, m.y);
      const upHp = Math.max(1, Math.round(m.maxHp * 0.25));
      t.ok(DD.HUD.hint().indexOf('🆘 Click: Help Up Wizzy McTest: 2 AP, back up with ' + upHp + ' HP (25%).') === 0 && /Can't be undone\.$/.test(DD.HUD.hint()),
        'adjacent downed ally: the hover says what the click does: ' + DD.HUD.hint());
      t.ok(!/doesn't block/.test(DD.HUD.hint()), 'and not "doesn\'t block"');
      DD.HUD.hover(c.x, c.y);
      t.ok(/^🆘 Father Unittest is down\. /.test(DD.HUD.hint()) && /Help Up \(2 AP/.test(DD.HUD.hint()), 'a downed ally farther away: how to get him up: ' + DD.HUD.hint());
      DD.HUD.hover(2, 3);
      // E takes the first interaction (Help Up here), so the hint offers the click only
      t.ok(/^🖐 Chest — Click: Open \(1 AP\)\.$/.test(DD.HUD.hint()), 'a chest next to the knight: what the click does: ' + DD.HUD.hint());
      k.ap = 1;
      DD.HUD.refresh();
      DD.HUD.hover(m.x, m.y);
      t.ok(/Help Up<?\/?b?>? needs 2 AP \(Sir Testsalot has 1\)|Help Up needs 2 AP \(Sir Testsalot has 1\)/.test(DD.HUD.hint()), 'with 1 AP: why not: ' + DD.HUD.hint());
      DD.HUD.click(m.x, m.y);
      t.ok(m.downed && k.x === 3 && k.y === 3 && k.ap === 1, 'and the click spends nothing and moves nobody');
      k.ap = 3;
      DD.HUD.refresh();
      DD.HUD.click(m.x, m.y);
      t.ok(!m.downed && m.hp === upHp && k.ap === 1, 'with 3 AP the click is the Help Up the hover promised (' + m.hp + ' HP)');
      DD.HUD.hover(2, 3);
      t.ok(/^🖐 Chest — Click or E: Open \(1 AP\)\.$/.test(DD.HUD.hint()), 'the chest is now the first interaction: E opens it too: ' + DD.HUD.hint());
    } finally { leave(); }
  });

  T.suite('hud: playtest first-hour-7 — a refusal for one unit never covers the next unit\'s hints; arming replaces it', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 3 }, { id: 'test_mage', x: 1, y: 5 }], enemies: [{ id: 'test_grunt', x: 2, y: 3 }], enemyAi: false });
      const m = byDef('test_mage');
      DD.HUD.key('4');
      t.eq(DD.HUD.hint(), 'That socket is empty.', 'an empty socket: the refusal');
      DD.HUD.key('1');
      t.ok(/^🗡️ Test Slash — /.test(DD.HUD.hint()), 'arming the basic attack replaces it at once: ' + DD.HUD.hint());
      DD.HUD.rightClick();
      DD.HUD.key('4');
      t.eq(DD.HUD.hint(), 'That socket is empty.', 'the refusal again');
      DD.HUD.endTurn();
      t.eq(DD.HUD.selected().id, m.id, 'the mage acts');
      t.ok(DD.HUD.hint() !== 'That socket is empty.', 'the knight\'s refusal is gone on the mage\'s turn: ' + DD.HUD.hint());
      DD.HUD.hover(2, 5);
      t.ok(/^Move here/.test(DD.HUD.hint()), 'and the mage\'s move hint shows: ' + DD.HUD.hint());
    } finally { leave(); }
  });

  T.suite('hud: playtest combat-controls-4 — the swap hint counts Bleed (the line, the 💀 check, red arrows, the HP preview)', function (t) {
    if (!ready(t)) return;
    if (!DD.Combat.swapInfo || !DD.getStatus('bleed')) { t.skip('no swaps or no bleed'); return; }
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 3 }, { id: 'test_mage', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage');
      DD.Act.addStatus(k, 'bleed', { stacks: 3 }, null);
      k.block = 0;
      DD.HUD.refresh();
      DD.HUD.hover(m.x, m.y);
      t.ok(/⇄ Swap with Wizzy McTest/.test(DD.HUD.hint()) && /🩸 Bleeding 3: this move costs 3 HP when it ends\./.test(DD.HUD.hint()), 'the swap hint warns of the bleed: ' + DD.HUD.hint());
      t.ok(ov().swap && ov().swap.bad, 'red swap arrows');
      t.ok(ov().previews[k.id] && ov().previews[k.id].dmg === 3 && !ov().previews[k.id].lethal, 'the knight\'s HP preview shows the 3');
      k.hp = 2;
      DD.HUD.refresh();
      DD.HUD.hover(m.x, m.y);
      t.ok(/costs 3 HP when it ends 💀/.test(DD.HUD.hint()) && ov().previews[k.id].lethal, 'at 2 HP the swap would drop him: 💀 ' + DD.HUD.hint());
    } finally { leave(); }
  });

  T.suite('hud: playtest text-tone-v1 / text-tone-3 — a flyer still pockets gold; named units get no "it" / "its" in the panels', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 1 }, { id: 'test_knight', x: 1, y: 4 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], enemyAi: false,
        objects: DD.getObject('gold_pile') ? [{ x: 3, y: 1, id: 'gold_pile' }] : [] });
      const m = byDef('test_mage'), k = byDef('test_knight'), g = byDef('test_grunt');
      m.flags = Object.assign({}, m.flags, { flying: true });
      DD.HUD.refresh();
      if (DD.getObject('gold_pile')) {
        DD.HUD.hover(3, 1);
        const txt = text('.hud-inspect');
        t.ok(/🪽 Wizzy McTest flies, but still swoops down for the Gold Pile\./.test(txt), 'the gold pile\'s panel: the flyer still swoops down for it');
        t.ok(!/none of it applies/.test(txt), 'and never "none of it applies" over loot: ' + txt.slice(0, 200));
      }
      DD.HUD.hover(m.x, m.y);
      t.ok(/Loot is not floor: Wizzy McTest still swoops down for gold\./.test(text('.hud-inspect')), 'the flyer\'s own panel says loot still counts');
      DD.HUD.hover(k.x, k.y);
      const kt = text('.hud-inspect');
      t.ok(!/\bits next turn\b/.test(kt) && /before Sir Testsalot's next turn/.test(kt), 'a hero\'s panel names him: ' + kt.slice(0, 200));
      DD.HUD.hover(g.x, g.y);
      const gt = text('.hud-inspect');
      t.ok(!/\bit can reach\b|\bOn its\b|walking away from it\b|\(it acts next\)/.test(gt), 'a foe\'s panel has no generic "it" templates: ' + gt.slice(0, 260));
      t.ok(!/it acts on its own initiative turn/.test(DD.HUD.unitTip(k)), 'nor a hero\'s card tooltip: ' + DD.HUD.unitTip(k).replace(/<[^>]+>/g, ' ').slice(0, 200));
    } finally { leave(); }
  });

  T.suite('hud: playtest first-hour-1 — a monster\'s ability text shows this fight\'s damage (× the fight multiplier), heroes\' stays as listed', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 5, y: 3 }], enemyAi: false });
      const k = byDef('test_knight'), g = byDef('test_grunt');
      const def = DD.getSkill('test_grunt_stab');
      const base = DD.skillLevel(def, 1).dmg;
      DD.Combat.state.difficulty = Object.assign({}, DD.Combat.state.difficulty, { dmg: 1.4 });
      const info = DD.UI.skillInfo(def, 1, g);
      const want = Math.round(base * 1.4);
      t.ok(info.fightMult === 1.4 && info.desc.indexOf(String(want)) >= 0, 'the grunt\'s Stab reads ' + want + ' (listed ' + base + ' × 1.4): ' + info.desc);
      t.eq(DD.UI.skillInfo(def, 1, null).desc, DD.skillDesc(def, 1, null), 'outside the fight (no unit) the listed number');
      const hk = DD.UI.skillInfo('test_slash', 1, k);
      t.eq(hk.fightMult, 1, 'a hero skill is never scaled');
      DD.HUD.hover(g.x, g.y);
      t.ok(q('.hud-inspect .ha-mult') && /×1\.4/.test(text('.hud-inspect .ha-mult')), 'the ability row carries a ×1.4 pill');
      DD.Combat.state.difficulty = Object.assign({}, DD.Combat.state.difficulty, { dmg: 1 });
      t.eq(DD.UI.skillInfo(def, 1, g).desc, DD.skillDesc(def, 1, g), 'at ×1 the text is the listed one');
    } finally { leave(); }
  });

  T.suite('hud: playtest combat-controls-6 / text-tone-17 / text-tone-18 — why a hovered foe is no target; tooltips follow the rules and DD.Balance', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }, { id: 'test_grunt', x: 1, y: 6 }], enemyAi: false,
        terrain: function (tl) { return tl.x === 2 && tl.y === 3 ? { t: 'wall' } : null; } });
      const near = DD.Combat.state.units.filter(function (u) { return u.defId === 'test_grunt' && u.x === 4; })[0];
      const far = DD.Combat.state.units.filter(function (u) { return u.defId === 'test_grunt' && u.y === 6; })[0];
      DD.HUD.key('1');
      DD.HUD.hover(near.x, near.y);
      t.ok(/✖ No line of sight/.test(DD.HUD.hint()), 'hovering the foe behind the wall says why before the click: ' + DD.HUD.hint());
      DD.HUD.rightClick();
      DD.Act.kill(far, null);
      DD.HUD.refresh();
      DD.HUD.key('1');
      t.ok(/No valid targets/i.test(DD.HUD.hint()) && /Nearest foe, Test Grunt: No line of sight/.test(DD.HUD.hint()), '"No valid targets" names the nearest foe and why: ' + DD.HUD.hint());
      // the Hype tooltip reads DD.Balance.hype
      const E = DD.HUD.els();
      const tip = function (n) { const c = n && n._ddTip && n._ddTip.content; return typeof c === 'function' ? c(n) : c || ''; };
      if (DD.Balance && DD.Balance.hype) {
        const k0 = DD.Balance.hype.kill;
        try {
          DD.Balance.hype.kill = 9;
          t.ok(/\+9 per kill/.test(tip(E.hype)), 'the Hype tooltip follows DD.Balance.hype: ' + tip(E.hype).replace(/<[^>]+>/g, ' ').slice(0, 160));
        } finally { DD.Balance.hype.kill = k0; }
        t.ok(!/their Signature/.test(tip(E.hype)), 'no "their" for a hero');
      }
      t.ok(/Only bosses and a few elites wind up/.test(tip(E.round)), 'the round tooltip: bosses and a few elites wind up');
    } finally { leave(); }
  });

  T.suite('hud: playtest combat-controls-1 / -2 — a free hit that stops the move, dice ranges, rider bleed, a web on the path: the hints and the drawn path say so', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 3 }, { id: 'test_mage', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 2, y: 4 }], enemyAi: false });
      const k = byDef('test_knight'), g = byDef('test_grunt');
      k.block = 0;
      const C = DD.Combat, real = C.provokes, realSwap = C.swapInfo;
      // the engine's dry-run shape (Combat.provokes / swapInfo, playtest fix): a stop, a dice range, a rider's Bleed
      const fake = function (list) {
        const out = list.map(function (p) { return Object.assign({}, p, { unitId: g.id, name: g.name, skillName: 'Stab', dmg: 4, bleed: 1, stops: 'Rooted', random: true, min: 0, max: 9, skipped: false }); });
        out.outcome = { end: { x: k.x, y: k.y }, arrived: false, loss: 5, lossMin: 1, lossMax: 10, bleedTick: 1, lethal: false, uncertain: true };
        return out;
      };
      try {
        C.provokes = function (u, x, y) { const r = real.apply(C, arguments); return r && r.length ? fake(r) : r; };
        C.swapInfo = function () { const si = realSwap.apply(C, arguments); if (si && si.ok === true && si.provokes && si.provokes.length) { si.provokes = fake(si.provokes); si.outcome = si.provokes.outcome; } return si; };
        DD.HUD.refresh();
        DD.HUD.hover(2, 1);
        const hint = DD.HUD.hint();
        t.ok(/Test Grunt 0–9 \+🩸1/.test(hint), 'a dice strike shows its range and its Bleed rider: ' + hint);
        t.ok(/⛔ Stab stops Sir Testsalot \(Rooted\): the move is spent\./.test(hint), 'and that it ends the walk: ' + hint);
        t.ok(/🩸 Bleeding 1: this move costs 1 HP when it ends\./.test(hint), 'the rider\'s Bleed tick is counted');
        t.eq(ov().path.length, 0, 'the drawn path stops where the walker does (here: where it stands)');
        t.ok(ov().previews[k.id] && ov().previews[k.id].dmg === 5, 'the HP preview is the dry run\'s loss (5)');
        DD.HUD.hover(3, 3);
        t.ok(/⛔ Stab stops Sir Testsalot \(Rooted\): the move is spent and the swap won't happen\./.test(DD.HUD.hint()), 'a swap: called off: ' + DD.HUD.hint());
        t.ok(ov().swap && ov().swap.bad && ov().swap.blocked, 'red arrows with a ✖');
      } finally { C.provokes = real; C.swapInfo = realSwap; }
    } finally { leave(); }
    if (!DD.getSurface('web') || !DD.Grid.snagAt) { t.skip('no web snags in the engine'); return; }
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false,
        terrain: function (tl) { return tl.y !== 3 ? { t: 'wall' } : null; }, surfaces: [{ x: 2, y: 3, id: 'web', turns: 4 }] });
      const k = byDef('test_knight');
      DD.HUD.hover(3, 3);
      t.ok(/⚠ The path crosses Web: Sir Testsalot is Rooted there and the walk stops short\./.test(DD.HUD.hint()), 'a web on the only path: warned: ' + DD.HUD.hint());
      t.ok(ov().pathHazard && tiles(ov().path) === '2,3', 'red path, cut at the web (' + tiles(ov().path) + ')');
      DD.HUD.hover(2, 3);
      t.ok(/🕸 Ends on Web: Sir Testsalot is Rooted there\./.test(DD.HUD.hint()), 'ending on the web: ' + DD.HUD.hint());
      t.ok(k.x === 1, '(nobody moved)');
    } finally { leave(); }
  });

  T.suite('hud: playtest bosses-objectives-3 — a foe with two turns before the hero\'s next counts twice (card line, hint, shading)', function (t) {
    if (!ready(t)) return;
    if (!DD.AI.turnsBefore) { t.skip('no DD.AI.turnsBefore'); return; }
    try {
      fight({ w: 9, h: 7, heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }], enemyAi: false });
      const k = byDef('test_knight'), g = byDef('test_grunt');
      const s = DD.Combat.state;
      const ge = s.order.filter(function (e) { return e.unitId === g.id; })[0];
      s.order.push(Object.assign({}, ge));   // a second turn this round, before the knight's next one (a two-turn boss)
      t.eq(DD.AI.turnsBefore(g, k), 2, 'the engine: two grunt turns before the knight\'s next');
      k.block = 0;
      DD.HUD.threat(true);
      DD.HUD.refresh();
      const one = num0(DD.AI.reachOf(g).tiles.get(k.x + ',' + k.y));
      t.ok(one > 0, 'the grunt reaches the knight (' + one + ' a turn)');
      const card = qa('.hud-card')[0].querySelector('.hc-threat').textContent;
      t.ok(card.indexOf('up to ' + 2 * one) >= 0, 'the card counts both turns: ' + card);
      const td = DD.HUD.threatData().tiles.filter(function (x) { return x.x === k.x && x.y === k.y; })[0];
      t.ok(td && td.reach === 2 * one, 'the shading too (' + (td && td.reach) + ')');
      const near = DD.Combat.reachable(k);
      let tile = null;
      near.forEach(function (e) { if (!tile && DD.AI.reachOf(g).tiles.has(e.x + ',' + e.y)) tile = e; });
      if (tile) {
        DD.HUD.hover(tile.x, tile.y);
        t.ok(/Test Grunt \d+ \(2 turns\)/.test(DD.HUD.hint()), 'the hint says it acts twice first: ' + DD.HUD.hint());
      }
      DD.HUD.threat(false);
    } finally { leave(); }
    function num0(v) { return +v || 0; }
  });

  T.suite('hud: playtest heroes-3 — a tile-aimed hit on a crate (Betty\'s Family Hammer) previews the break and the HP bar', function (t) {
    if (!ready(t)) return;
    if (!DD.getHero('betty') || !DD.getSkill('bet_family_hammer') || !DD.getObject('crate')) { t.skip('no Betty / crate'); return; }
    try {
      fight({ heroes: [{ id: 'betty', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], objects: [{ x: 4, y: 3, id: 'crate' }], enemyAi: false });
      const b = byDef('betty');
      const crate = DD.Grid.tile(4, 3).obj;
      DD.HUD.key('1');
      DD.HUD.hover(4, 3);
      const p = DD.Combat.preview(b, b.basic, 4, 3);
      const e = p && (p.objects || []).filter(function (o) { return o.x === 4 && o.y === 3; })[0];
      if (!e || !(e.dmg > 0 || e.destroyed)) { t.skip('the engine preview does not hit the crate'); return; }
      t.ok(/🔨 (\? )?Break: Crate − \d+ damage/.test(DD.HUD.hint()), 'the hint previews the break: ' + DD.HUD.hint());
      t.ok(ov().objPreview && ov().objPreview.x === 4 && ov().objPreview.dmg > 0, 'and the crate\'s HP bar shows the hit');
      const hp0 = crate.hp, dmg = ov().objPreview ? ov().objPreview.dmg : 0;
      DD.HUD.click(4, 3);
      const after = DD.Grid.tile(4, 3).obj;
      t.ok(after ? after.hp === hp0 - dmg : dmg >= hp0, 'the hit lands as previewed (' + hp0 + ' − ' + dmg + ' → ' + (after ? after.hp : 'broken') + ')');
    } finally { leave(); }
  });

  // ---- finish (Nov 14): lead decisions D1 / D2 on the HUD side ------------------------------------------------------
  T.suite('hud: finish D1 — the 🔨 / 💥 markers, the aim hint and the tooltip lines follow the engine (any single-target damage skill); opt-outs show none', function (t) {
    if (!ready(t)) return;
    const TG = DD.Targeting;
    if (!TG.aimsAtObjects || !TG.objectDamage || !DD.getObject('crate') || !DD.getObject('barrel_explosive') || !DD.getSkill('test_mark')) { t.skip('no object targeting'); return; }
    const ZING = 'hudtest_zing';
    try {
      DD.registerSkill({ id: ZING, name: 'Zing', owner: 'test_mage', icon: '✴️', kind: 'spell', tags: ['ranged'], ap: 1,
        levels: [{ dmg: 3 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: true },
        desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe. Furniture counts, morally.'; },
        execute: function (ctx) { if (ctx.targetUnit) DD.Act.damage(ctx.user, ctx.targetUnit, ctx.L.dmg); } });
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 3, skills: [ZING, shyZap(), 'test_mark'] }], enemies: [{ id: 'test_grunt', x: 1, y: 6 }],
        objects: [{ x: 3, y: 3, id: 'crate' }, { x: 3, y: 5, id: 'barrel_explosive' }], enemyAi: false });
      const m = byDef('test_mage');
      t.ok(TG.aimsAtObjects(m, 'test_bolt') && TG.objectDamage(m, 'test_bolt') > 0, 'engine: the basic attack breaks objects (every rule version)');
      t.ok(!TG.aimsAtObjects(m, SHY), 'engine: a damage spell with target.objects false never aims at objects');
      // the inspect panel states the rule in D1's words
      DD.HUD.hover(3, 3);
      t.ok(/🔨 Breakable \(6\/6 HP\): any single-target damage skill can break it/.test(text('.hud-inspect')), 'the crate: "any single-target damage skill can break it": ' + text('.hud-inspect').slice(0, 260));
      t.ok(!/single-target attack/.test(text('.hud-inspect')), 'no leftover "single-target attack" wording');
      DD.HUD.hover(3, 5);
      t.ok(/💥 Volatile: any single-target damage skill aimed at it/.test(text('.hud-inspect')), 'the barrel too: ' + text('.hud-inspect').slice(0, 260));
      [['1', 'test_bolt'], ['2', ZING], ['3', SHY], ['4', 'test_mark']].forEach(function (c) {
        const name = DD.getSkill(c[1]).name;
        const aims = !!TG.aimsAtObjects(m, c[1]);
        const breaks = aims && TG.objectDamage(m, c[1]) > 0;
        DD.HUD.rightClick();
        DD.HUD.key(c[0]);
        t.eq((DD.HUD.mode() || {}).kind, 'skill', name + ' is armed');
        t.eq(has(ov().breakTargets, { x: 3, y: 3 }), breaks, name + ': the 🔨 marker on the crate follows the engine (' + breaks + ')');
        t.eq(has(ov().objTargets, { x: 3, y: 5 }), aims, name + ': the 💥 marker on the barrel follows the engine (' + aims + ')');
        t.eq(/🔨 the Crate/.test(DD.HUD.hint()), breaks, name + ': the aim hint offers the crate exactly then: ' + DD.HUD.hint());
        const tip = DD.UI.skillTooltipHtml(c[1], 1, m);
        t.eq(/🔨 Can also hit a breakable object in range \(crates, totems…\) for \d+ damage and nothing else/.test(tip), breaks, name + ': the tooltip\'s 🔨 line follows the engine');
        t.eq(/💥 Can also be aimed at an explosive barrel/.test(tip), aims, name + ': and its 💥 line');
        if (breaks) return;
        DD.HUD.click(3, 3);
        const why = c[1] === SHY ? /Shy Zap is for foes only, not the Crate: another single-target damage skill can break it\./ :
          new RegExp(name + ' can\'t break the Crate: any single-target damage skill can\\.');
        t.ok(why.test(DD.HUD.hint()), name + ': the click on the crate says why, in the rule\'s words: ' + DD.HUD.hint());
        t.eq(DD.Grid.tile(3, 3).obj.hp, 6, name + ': and the crate is untouched');
      });
    } finally {
      leave();
      delete DD.defs.skills[ZING];
      dropShyZap();
    }
  });

  T.suite('hud: finish D2 — immovable units can start a swap but can\'t be swapped: the refusal names the ally once, the 🗿 pill says the rule, the mover follows the engine', function (t) {
    if (!ready(t)) return;
    if (!DD.Combat.swapInfo || !DD.Act.isImmovable) { t.skip('no swaps'); return; }
    try {
      fight({ heroes: [{ id: 'test_mage', x: 2, y: 3 }, { id: 'test_knight', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const m = byDef('test_mage'), k = byDef('test_knight');
      k.flags = Object.assign({}, k.flags, { immovable: true });
      DD.HUD.refresh();
      t.eq(DD.HUD.selected().id, m.id, 'the mage acts');
      const si = DD.Combat.swapInfo(m, k.x, k.y);
      t.ok(si && si.ok !== true && /immovable/i.test(String(si.ok)), 'engine: nobody swaps an immovable ally (' + (si && si.ok) + ')');
      t.ok(!has(ov().swapTiles, k), 'no ⇄ ring under the immovable knight');
      DD.HUD.hover(k.x, k.y);
      const h = DD.HUD.hint();
      t.ok(/⇄ Sir Testsalot is immovable/.test(h), 'hovering him gives the engine\'s reason, led by his name: ' + h);
      t.ok(!/Can't swap with Sir Testsalot: Sir Testsalot/.test(h), 'and never "Can\'t swap with Sir Testsalot: Sir Testsalot …"');
      const pill = qa('.hud-inspect .pill').filter(function (p) { return /🗿 Immovable/.test(p.textContent); })[0];
      const tip = pill ? pill.getAttribute('title') || pill.title || '' : '';
      t.ok(/^Sir Testsalot can't be pushed, pulled or swapped, but can start a swap as the move\.$/.test(tip), 'the 🗿 pill states the rule: ' + tip);
      DD.HUD.click(k.x, k.y);
      t.ok(m.x === 2 && k.x === 3, 'the click swapped nobody');
      t.ok(/⇄ Sir Testsalot is immovable/.test(DD.HUD.hint()) && !/Can't swap with Sir Testsalot: Sir Testsalot/.test(DD.HUD.hint()), 'and the click says why the same way: ' + DD.HUD.hint());
      // a reason about the mover keeps the "Can't swap with" lead-in (it doesn't name the ally)
      const ap0 = m.ap;
      m.ap = 0;
      DD.HUD.clearHint();
      DD.HUD.refresh();
      DD.HUD.hover(k.x, k.y);
      t.ok(/⇄ Can't swap with Sir Testsalot: Not enough AP\./.test(DD.HUD.hint()), 'a mover-side reason keeps the lead-in: ' + DD.HUD.hint());
      m.ap = ap0;
      // a foe that is immovable: no swap words on its pill
      const g = byDef('test_grunt');
      g.flags = Object.assign({}, g.flags, { immovable: true });
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      const gp = qa('.hud-inspect .pill').filter(function (p) { return /🗿 Immovable/.test(p.textContent); })[0];
      t.eq(gp ? gp.getAttribute('title') || gp.title : '', 'Test Grunt can\'t be pushed or pulled.', 'a foe\'s 🗿 pill: no swap talk');
    } finally { leave(); }
    try {
      // the immovable knight acts: a swap he starts is his own move (D2); the HUD shows exactly what the engine allows
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 3 }, { id: 'test_mage', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage');
      k.flags = Object.assign({}, k.flags, { immovable: true });
      DD.HUD.refresh();
      t.eq(DD.HUD.selected().id, k.id, 'the immovable knight acts');
      const si = DD.Combat.swapInfo(k, m.x, m.y);
      const can = !!si && si.ok === true;
      t.eq(has(ov().swapTiles, m), can, 'the ⇄ ring under the mage follows the engine (' + (si && si.ok) + ')');
      DD.HUD.hover(m.x, m.y);
      t.eq(/⇄ Swap with Wizzy McTest/.test(DD.HUD.hint()), can, 'the swap preview follows it: ' + DD.HUD.hint());
      DD.HUD.click(m.x, m.y);
      t.eq(k.x === 3 && m.x === 2, can, 'the click swaps exactly when the engine allows it');
      if (can) { DD.HUD.undo(); t.ok(k.x === 2 && m.x === 3, 'Z undoes it'); }
      else t.ok(/⇄ /.test(DD.HUD.hint()), 'otherwise the click says why: ' + DD.HUD.hint());
    } finally { leave(); }
    if (!DD.getHero('slate')) return;
    try {
      // the real one: Slate next to the mage, both ways round
      fight({ heroes: [{ id: 'slate', x: 2, y: 3 }, { id: 'test_mage', x: 3, y: 3 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const sl = byDef('slate'), m = byDef('test_mage');
      t.eq(DD.HUD.selected().id, sl.id, 'Slate acts');
      const si = DD.Combat.swapInfo(sl, m.x, m.y);
      DD.HUD.hover(m.x, m.y);
      t.eq(/⇄ Swap with Wizzy McTest/.test(DD.HUD.hint()), !!si && si.ok === true, 'Slate\'s own swap previews exactly when the engine allows it (' + (si && si.ok) + '): ' + DD.HUD.hint());
      DD.HUD.hover(sl.x, sl.y);
      const pill = qa('.hud-inspect .pill').filter(function (p) { return /🗿 Immovable/.test(p.textContent); })[0];
      t.eq(pill ? pill.getAttribute('title') || pill.title : '', 'Slate can\'t be pushed, pulled or swapped, but can start a swap as the move.', 'his 🗿 pill states the rule');
      DD.HUD.endTurn();
      t.eq(DD.HUD.selected().id, m.id, 'the mage acts');
      DD.HUD.hover(sl.x, sl.y);
      t.ok(/⇄ Slate is immovable/.test(DD.HUD.hint()) && !/Can't swap with Slate: Slate/.test(DD.HUD.hint()), 'the mage can\'t swap him; the hint names him once: ' + DD.HUD.hint());
    } finally { leave(); }
  });

  T.suite('hud: review (finish) — a refused swap shows a ✖ between its arrows; the 🗿 pill of a unit that never moves promises no swap', function (t) {
    if (!ready(t)) return;
    if (!DD.Combat.swapInfo || !DD.Act.isImmovable || !DD.getSummon('test_turret')) { t.skip('no swaps or no turret fixture'); return; }
    try {
      // D2 refusal on the board: the knight is immovable, so the mage's hover previews red arrows WITH the ✖ (refused)
      fight({ heroes: [{ id: 'test_mage', x: 2, y: 3 }, { id: 'test_knight', x: 3, y: 3 }, { id: 'test_summoner', x: 2, y: 4 }],
        summons: [{ id: 'test_turret', x: 1, y: 4, owner: 'test_summoner' }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const m = byDef('test_mage'), k = byDef('test_knight'), sm = byDef('test_summoner'), tu = byDef('test_turret');
      k.flags = Object.assign({}, k.flags, { immovable: true });
      DD.HUD.refresh();
      t.eq(DD.HUD.selected().id, m.id, 'the mage acts');
      DD.HUD.hover(k.x, k.y);
      t.ok(/⇄ Sir Testsalot is immovable/.test(DD.HUD.hint()), 'the hint refuses: ' + DD.HUD.hint());
      t.ok(ov().swap && ov().swap.bad && ov().swap.blocked, 'the board says no as well: red arrows with a ✖ (blocked)');
      // an allowed swap keeps plain arrows (no ✖)
      DD.HUD.hover(sm.x, sm.y);
      const si = DD.Combat.swapInfo(m, sm.x, sm.y);
      t.ok(si && si.ok === true, 'engine: the mage may swap with the summoner (' + (si && si.ok) + ')');
      t.ok(ov().swap && !ov().swap.blocked && !ov().swap.bad, 'an allowed, safe swap: blue arrows, no ✖');
      // a mover-side refusal (no AP) is a ✖ too
      const ap0 = m.ap;
      m.ap = 0;
      DD.HUD.refresh();
      DD.HUD.hover(sm.x, sm.y);
      t.ok(/⇄ Can't swap with /.test(DD.HUD.hint()) && ov().swap && ov().swap.blocked, 'out of AP: refused, ✖: ' + DD.HUD.hint());
      m.ap = ap0;
      DD.HUD.refresh();
      // the 🗿 pill: an immovable hero-side unit that never moves (move 0) can't start a swap, so the tip doesn't say it can
      DD.HUD.hover(tu.x, tu.y);
      const pill = qa('.hud-inspect .pill').filter(function (p) { return /🗿 Immovable/.test(p.textContent); })[0];
      t.eq(pill ? pill.getAttribute('title') : '', tu.name + ' can\'t be pushed, pulled or swapped.', 'a move-0 turret\'s pill: no "can start a swap"');
      DD.HUD.hover(k.x, k.y);
      const kp = qa('.hud-inspect .pill').filter(function (p) { return /🗿 Immovable/.test(p.textContent); })[0];
      t.eq(kp ? kp.getAttribute('title') : '', 'Sir Testsalot can\'t be pushed, pulled or swapped, but can start a swap as the move.', 'a walking one keeps the D2 rule');
    } finally { leave(); }
    if (!DD.getSummon('zar_statue')) return;
    try {
      // the real one: Zarathor's Tasteful Statue (move 0, immovable)
      fight({ heroes: [{ id: 'test_mage', x: 2, y: 3 }], summons: [{ id: 'zar_statue', x: 3, y: 3, owner: 'test_mage' }],
        enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
      const st = byDef('zar_statue');
      DD.HUD.hover(st.x, st.y);
      const pill = qa('.hud-inspect .pill').filter(function (p) { return /🗿 Immovable/.test(p.textContent); })[0];
      t.eq(pill ? pill.getAttribute('title') : '', st.name + ' can\'t be pushed, pulled or swapped.', 'the statue\'s pill: ' + (pill && pill.getAttribute('title')));
    } finally { leave(); }
  });

  // ---- V3 (act IV, plan §4.8): Svammiel's cameos, cheat chips, kind labels, the tracker crowd, the BLEEP sticker ------------
  // The fixtures' test doors (test_a4_lane_a..d, test_a4_finale) are act-4 boss fights whose cameo actor is the Heckler
  // (test_heckler, tests/fixtures.js): the same DD.Cameo path as Svammiel's, without depending on the real content.
  function v3Ready(t) {
    if (!ready(t)) return false;
    if (!DD.Cameo || DD.Cameo.stub || !DD.getCameo || !DD.getCameo('test_heckler') || !DD.getEncounter('test_a4_lane_b')) { t.skip('DD.Cameo or the act-4 test doors missing'); return false; }
    return true;
  }
  const ZONE4 = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }];
  /** A test door in deployment (cameo + cheat at combat:ready). */
  function door(id, extra) {
    return fight(Object.assign({ encounter: DD.getEncounter(id), heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 2 }],
      enemies: [{ id: 'test_boss', x: 5, y: 5 }, { id: 'test_minion', x: 6, y: 2 }], deploy: true, deployTiles: ZONE4, initiative: 'roll', enemyAi: false }, extra || {}));
  }
  /** Run the FX until the HUD hosts a blocking cameo (or give up). → the 'cameo' FX event or null */
  function untilCameo(F) {
    for (let i = 0; i < 200 && !DD.HUD.cameo(); i++) { F.update(40); DD.HUD.tick(); }
    return F.active.filter(function (e) { return e.type === 'cameo'; })[0] || null;
  }
  function settleFx(F) { for (let i = 0; i < 400 && F.busy(); i++) F.update(50); DD.HUD.tick(); }
  /** Run fn with Settings "Svammiel's cameos" set to v (restored after). */
  function withCameoSetting(v, fn) {
    const st = DD.Meta && DD.Meta.data && DD.Meta.data.settings;
    if (!st) return fn(false);
    const had = Object.prototype.hasOwnProperty.call(st, 'cameos'), old = st.cameos;
    st.cameos = v;
    try { return fn(true); } finally { if (had) st.cameos = old; else delete st.cameos; }
  }

  T.suite('hud: V3 — a blocking cameo is hosted: input waits, Space / Enter / Esc / a click skip it, deployment works right after, AutoPlay shortens it', function (t) {
    if (!v3Ready(t)) return;
    if (!DD.FXRender || !DD.FXRender.moments || !DD.FX.handlers.cameo) { t.skip('fx_render has no cameo handler'); return; }
    const hadMain = Object.prototype.hasOwnProperty.call(DD, 'Main'), oldMain = DD.Main;
    try {
      withCameoSetting('full', function () {
        withAnimatedFx(function (F) {
          door('test_a4_lane_d');
          const host = DD.FXRender.moments.cameo;
          t.ok(host && typeof host.start === 'function' && typeof host.wants === 'function', 'the mounted HUD hosts the cameo moment (DD.FXRender.moments.cameo)');
          const k = byDef('test_knight');
          const evt = untilCameo(F);
          const c = DD.HUD.cameo();
          t.ok(evt && c && c.active, 'the start cameo (a swoop) is showing');
          if (!evt || !c) return;
          t.eq(c.style, 'swoop', 'style swoop');
          t.eq(c.name, 'The Heckler', 'the actor is named');
          const full = DD.Cameo.STYLES.swoop.cheatMs || DD.Cameo.STYLES.swoop.ms;
          t.eq(evt.ms, full, 'the event lasts DD.Cameo\'s length (a cheat card: ' + full + ' ms)');
          t.eq(c.ms, evt.ms, 'the host answered that length');
          t.eq(DD.HUD.lock(), 'busy', 'input is locked while it plays');
          t.ok(/The Heckler/.test(text('.hud-phase')), 'the phase pill names him: ' + text('.hud-phase'));
          t.ok(/has the floor/.test(DD.HUD.hint()) && /Space/.test(DD.HUD.hint()), 'the hint says how to skip: ' + DD.HUD.hint());
          t.ok(!q('.hud-cameoscrim').classList.contains('hud-hidden'), 'a see-through layer takes the skip click');
          t.ok(q('.hud-endbtn').classList.contains('is-disabled') && q('.hud-rollcta').classList.contains('is-disabled'), 'Roll / End Turn look locked (not live during the swoop)');
          DD.HUD.click(2, 3);
          t.ok(k.x === 1 && k.y === 1 && DD.Combat.isDeploying(), 'a deploy click does nothing while he has the floor');
          t.ok(DD.HUD.key(' '), 'Space is consumed');
          t.eq(DD.HUD.cameo(), null, 'Space skipped the cameo');
          t.ok(evt.elapsed >= evt.ms, 'the event jumps to its end (elapsed = ms)');
          t.ok(q('.hud-cameoscrim').classList.contains('hud-hidden'), 'the click layer is gone');
          t.ok(DD.Combat.isDeploying() && !DD.Combat.state.order, 'and Space did NOT also roll initiative');
          settleFx(F);
          t.ok(!F.busy() && evt.done, 'playback finished the event');
          t.eq(DD.HUD.lock(), null, 'input unlocks');
          t.ok(/Deployment/.test(text('.hud-phase')), 'deployment, right after');
          DD.HUD.click(2, 3);
          t.ok(k.x === 2 && k.y === 3, 'a deploy click works right after the cameo');
          settleFx(F);
          t.ok(DD.HUD.rollInitiative() && !!DD.Combat.state.order, 'and the roll');
          // Enter, Esc and a click skip it too (Esc never opens the menu over it)
          [['Enter', function () { return DD.HUD.key('Enter'); }], ['Esc', function () { return DD.HUD.key('Escape'); }],
            ['a click', function () { q('.hud-cameoscrim').click(); return true; }]].forEach(function (w) {
            F.reset();
            door('test_a4_lane_d');
            const e2 = untilCameo(F);
            t.ok(e2 && DD.HUD.cameo(), w[0] + ': the cameo plays');
            t.ok(w[1]() && DD.HUD.cameo() === null && e2 && e2.elapsed >= e2.ms, w[0] + ' skips it');
            t.ok(!DD.UI.topModal(), w[0] + ': no menu opened');
            settleFx(F);
            t.ok(DD.HUD.lock() === null && DD.Combat.isDeploying(), w[0] + ': deployment is open');
          });
          // AutoPlay plays it at 35% of its length
          F.reset();
          DD.Main = { autoplay: true };
          door('test_a4_lane_d');
          const e3 = untilCameo(F);
          t.ok(!!e3, 'AutoPlay: the cameo plays');
          t.eq(e3 && e3.ms, Math.round(full * 0.35), 'AutoPlay shortens it to 35% (' + (e3 && e3.ms) + ' ms)');
          DD.HUD.skipCameo();
          settleFx(F);
          if (hadMain) DD.Main = oldMain; else delete DD.Main;
        });
      });
      // Settings "Short": the HUD keeps DD.Cameo's short length; "Log only": no moment at all, the lines reach the log
      withCameoSetting('short', function (ok) {
        if (!ok) return;
        withAnimatedFx(function (F) {
          door('test_a4_lane_d');
          const e = untilCameo(F);
          t.eq(e && e.ms, DD.Cameo.STYLES.swoop.short, 'Short: ' + DD.Cameo.STYLES.swoop.short + ' ms');
          DD.HUD.skipCameo();
          settleFx(F);
        });
      });
      withCameoSetting('log', function (ok) {
        if (!ok) return;
        withAnimatedFx(function (F) {
          door('test_a4_lane_d');
          const e = untilCameo(F);
          t.ok(!e && !DD.HUD.cameo(), 'Log only: no cameo FX, no moment');
          t.ok(qa('.hud-log .log-line.cameo').length >= 2, 'the lines are in the log (' + qa('.hud-log .log-line.cameo').length + ')');
          settleFx(F);
          t.eq(DD.HUD.lock(), null, 'deployment is open at once');
        });
      });
      // instant FX (tests, sims): nothing is hosted, nothing waits
      door('test_a4_lane_d');
      t.ok(!DD.HUD.cameo() && !DD.FX.busy() && DD.HUD.lock() === null, 'instant FX: no moment, deployment open');
      t.ok(DD.Combat.state.data.cameo && DD.Combat.state.data.cameo.started, 'the start cameo still played (its memory is there)');
    } finally {
      if (hadMain) DD.Main = oldMain; else delete DD.Main;
      leave();
    }
  });

  T.suite('hud: V3 — the twist\'s entrance on a won board is hosted too: the end of the fight waits for it, Space skips it', function (t) {
    if (!v3Ready(t)) return;
    if (!DD.FX.handlers.cameo) { t.skip('fx_render has no cameo handler'); return; }
    try {
      withCameoSetting('full', function () {
        withAnimatedFx(function (F) {
          fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }], enemyAi: false });
          F.reset();
          DD.Combat.finish('victory');
          t.eq(DD.Combat.state.result, 'victory', 'the fight is won');
          DD.Cameo.play('test_heckler', 'You thought this was over? I, THE HECKLER, CONTROL ALL.', { style: 'entrance', force: true, afterEnd: true });
          const evt = untilCameo(F);
          t.ok(evt && DD.HUD.cameo() && DD.HUD.cameo().style === 'entrance', 'an entrance is hosted like the swoop');
          t.eq(evt && evt.ms, DD.Cameo.STYLES.entrance.ms, 'at its full length (' + (evt && evt.ms) + ' ms)');
          t.ok(/THE HECKLER/.test(text('.hud-log')), 'its line is in the log with the speaker chip');
          t.ok(/has the floor/.test(DD.HUD.hint()), 'the hint says how to skip him: ' + DD.HUD.hint());
          DD.HUD.tick();
          t.ok(!DD.HUD.endPending() && !DD.UI.topModal(), 'the end of the fight waits for him');
          t.ok(DD.HUD.key(' ') && !DD.HUD.cameo(), 'Space skips it');
          t.ok(!DD.HUD.endPending(), 'that press does not also hurry the hand-off');
          settleFx(F);
          t.ok(DD.HUD.endPending() || !!DD.UI.topModal(), 'then the fight ends as usual');
        });
      });
    } finally { leave(); }
  });

  T.suite('hud: V3 — cameo lines carry the speaker chip (DM lines keep "DM"); the caption shows who speaks; the DM is demoted under the table', function (t) {
    if (!v3Ready(t)) return;
    try {
      withCameoSetting('full', function () {
        door('test_a4_lane_b');
        const lines = qa('.hud-log .log-line.cameo');
        t.ok(lines.length >= 3, 'the start cameo\'s lines are in the log (' + lines.length + ')');
        t.ok(lines.every(function (l) { const c = l.querySelector('.hl-dm.hl-cameo'); return c && c.textContent === '🤡 THE HECKLER'; }), 'each with the actor\'s chip "🤡 THE HECKLER"');
        t.ok(lines.every(function (l) { return !/^DM/.test(l.textContent); }), 'not the DM\'s chip');
        const ch = lines.filter(function (l) { return l.classList.contains('cheat'); })[0];
        t.ok(ch && /^🤡 THE HECKLERThe Heckler cheats: Rigged Tests\. Heroes take 1 more damage from every hit this fight\. Reason: /.test(ch.textContent),
          'the cheat\'s line: marked, its icon once (the chip has it), the exact desc and a reason: ' + (ch && ch.textContent));
        t.eq(DD.Combat.state.log.filter(function (e) { return e.cls === 'cameo' && e.cheat; })[0].text.indexOf('🤡 The Heckler cheats:'), 0, '(the engine\'s line keeps its icon)');
        const nar = qa('.hud-log .log-line.narrator .hl-dm');
        t.ok(nar.length > 0 && nar.every(function (c) { return c.textContent === 'DM' && c.getAttribute('title') === 'The DM (demoted)'; }), 'DM lines keep "DM"; under the table its tooltip reads "The DM (demoted)"');
        t.eq(getComputedStyle(lines[0]).overflowWrap, 'anywhere', 'log lines wrap anywhere (the League\'s 72-letter name)');
        // the caption: a quip (log + caption only) speaks with his portrait and name; a DM line gets the DM back
        DD.Cameo.play('test_heckler', 'Fine. You win. This time.', { style: 'quip', force: true });
        let cap = DD.HUD.caption();
        t.ok(cap && cap.text === 'Fine. You win. This time.' && cap.speaker === 'The Heckler' && cap.actor === 'test_heckler', 'a quip takes the caption, by him: ' + JSON.stringify(cap));
        t.eq(cap && cap.title, 'The Heckler, Test Critic', 'his badge says who he is');
        t.ok(q('.hud-dm').classList.contains('cameo') && q('.hud-dm .dm-port') && text('.hud-dm .dm-who') === 'The Heckler:', 'his portrait and name in the caption');
        t.ok(!q('.hud-dm .dm-badge'), '(no DM badge)');
        DD.Act.log('The DM checks the rules. Under the table.', 'narrator');
        cap = DD.HUD.caption();
        t.ok(cap && cap.speaker === null && cap.title === 'The DM (demoted)' && !q('.hud-dm').classList.contains('cameo') && text('.hud-dm .dm-badge') === 'DM', 'a DM line: the DM badge, demoted: ' + JSON.stringify(cap));
        // a bubble shows on the canvas: it leaves the caption alone (Full)
        DD.Cameo.play('test_heckler', 'Boo! A bubble.', { style: 'bubble', force: true });
        t.eq((DD.HUD.caption() || {}).speaker, null, 'Full: a bubble interjection leaves the caption to the DM');
        t.ok(/Boo! A bubble\./.test(text('.hud-log')), '(it is in the log)');
      });
      withCameoSetting('log', function (ok) {
        if (!ok) return;
        DD.Cameo.play('test_heckler', 'Log only, still heckling.', { style: 'bubble', force: true });
        const cap = DD.HUD.caption();
        t.ok(cap && cap.speaker === 'The Heckler' && cap.text === 'Log only, still heckling.', 'Log only (no FX): his lines take the caption');
      });
      // a classic fight: the DM is the Dungeon Master
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] });
      DD.Act.log('The DM clears his throat.', 'narrator');
      t.eq(DD.HUD.caption() && DD.HUD.caption().title, 'The Dungeon Master', 'acts 1-3: "The Dungeon Master"');
      t.ok(qa('.hud-log .log-line.narrator .hl-dm').every(function (c) { return c.getAttribute('title') === 'The Dungeon Master'; }), 'the log\'s DM chips too');
    } finally { leave(); }
  });

  T.suite('hud: V3 — cheat chips: 😈 and the exact desc, one icon, "Next round" once; a rule\'s live name refreshes its chip (E7, the goats\' Verse)', function (t) {
    if (!v3Ready(t)) return;
    try {
      door('test_a4_lane_b');
      const s = DD.Combat.state;
      const rule = s.rules.filter(function (r) { return r.id === 'cameo:test_cheat_rule'; })[0];
      t.ok(rule && rule.cheat && rule.name === '🧪 Rigged Tests', 'the start cheat is a rule (name with its icon, as DD.Cameo builds it)');
      const chip = q('.hud-obj .hud-chip.rule.cheat');
      t.ok(chip && chip.querySelector('.rl-cheat') && chip.querySelector('.rl-cheat').textContent === '😈', 'a cheat chip with the 😈 badge');
      t.eq(chip && chip.querySelector('.rl-name').textContent, '🧪 Rigged Tests', 'its icon once (not "🧪 🧪 Rigged Tests")');
      const tip = tipOf(chip);
      t.ok(/Heroes take 1 more damage from every hit this fight\./.test(tip), 'the tooltip has the exact desc');
      t.ok(/😈 The Heckler cheats/.test(tip) && /whole fight/.test(tip), 'who cheats, and for how long');
      // announced cheats (Svammiel's finale): "Next round" style, the prefix once
      DD.Act.addRule({ id: 'test_next_a', name: 'Next round: Pop Quiz', icon: '📝', desc: 'Next round every test is a pop quiz.', turns: -1, hooks: {}, cheat: true, next: true, source: 'test_heckler', silent: true });
      DD.Act.addRule({ id: 'test_next_b', name: '🎲 Flaky Dice', icon: '🎲', desc: 'Next round every roll is flaky.', turns: 1, hooks: {}, cheat: true, next: true, source: 'test_heckler', silent: true });
      DD.HUD.refresh();
      const nx = qa('.hud-obj .hud-chip.rule.next');
      t.eq(nx.map(function (c) { return c.querySelector('.rl-name').textContent; }).join(' | '), '📝 Next round: Pop Quiz | 🎲 Next round: Flaky Dice', '"Next round" once, the icon once');
      t.ok(nx.every(function (c) { return c.classList.contains('cheat') && /goes live next round/.test(tipOf(c)); }), 'the tooltip says when it goes live');
      // E7: content rewrites a rule's name and desc mid-fight; the chip follows on the next refresh
      DD.Act.addRule({ id: 'test_verse', name: '📝 Verse 0/3', icon: '📝', desc: 'No bars yet.', turns: -1, hooks: {}, silent: true });
      DD.HUD.refresh();
      const verseChip = function () { return qa('.hud-obj .hud-chip.rule').filter(function (c) { return c.dataset.rule === 'test_verse'; })[0]; };
      t.eq(verseChip() && verseChip().querySelector('.rl-name').textContent, '📝 Verse 0/3', 'a plain rule chip (no 😈)');
      t.ok(verseChip() && !verseChip().classList.contains('cheat'), '(not a cheat)');
      const r = s.rules.filter(function (x) { return x.id === 'test_verse'; })[0];
      r.name = '📝 Verse 1/3 → Sir Testsalot';
      r.desc = 'One bar about Sir Testsalot.';
      DD.HUD.refresh();
      t.eq(verseChip() && verseChip().querySelector('.rl-name').textContent, '📝 Verse 1/3 → Sir Testsalot', 'the live name shows (same id, same turns)');
      t.ok(/One bar about Sir Testsalot\./.test(tipOf(verseChip())), 'the tooltip reads the live desc');
      s.objective.flavor = '🐐 Crew 168/255 · something in the hay wakes at 127';
      DD.HUD.refresh();
      t.eq(text('.hud-obj .ho-flavor'), '🐐 Crew 168/255 · something in the hay wakes at 127', 'the objective flavour line follows too');
    } finally { leave(); }
  });

  T.suite('hud: V3 — kind labels (Mini-boss, Floor Boss), short names for squads, the inspect line naming this and next round\'s cheats, the wind-up hint', function (t) {
    if (!v3Ready(t)) return;
    try {
      const foot = function () { return tipOf(q('.hud-round')).replace(/<[^>]+>/g, ' '); };
      door('test_a4_lane_c', { enemies: [{ id: 'test_boss', x: 5, y: 5 }, { id: 'test_brute', x: 6, y: 2 }] });
      t.ok(/Mini-boss fight/.test(foot()), 'a gauntlet door is a Mini-boss fight: ' + foot().slice(0, 140));
      t.eq(text('.hud-obj .ho-flavor'), 'Two bosses walk into a bar.', 'the squad\'s flavour line');
      const brute = byDef('test_brute');
      const chip = qa('.hud-init .tk-chip').filter(function (c) { return c.dataset.unit === brute.id; })[0];
      t.ok(chip && /Elite · The Test Brute Brigade/.test(tipOf(chip)), 'a squad member\'s tracker tooltip names the squad (short name)');
      DD.HUD.hover(brute.x, brute.y);
      t.ok(/Elite · The Test Brute Brigade/.test(text('.hud-inspect .hi-sub')), 'and its inspect panel: ' + text('.hud-inspect .hi-sub'));
      const cl = q('.hud-inspect .hi-line.cheat');
      t.ok(cl && /^😈 Cheats this round: 📦 Mystery Box · next round: none announced\.$/.test(cl.textContent), 'a squad member names the cheats this and next round: ' + (cl && cl.textContent));
      DD.HUD.hover(null);
      door('test_a4_finale', { enemies: [{ id: 'test_boss', x: 5, y: 5 }, { id: 'test_heckler_imp', x: 6, y: 2 }] });
      t.ok(/Floor Boss fight/.test(foot()), 'the finale is the Floor Boss fight');
      const imp = byDef('test_heckler_imp');
      DD.HUD.hover(imp.x, imp.y);
      t.ok(!q('.hud-inspect .hi-line.cheat'), 'no cheats in play: no line');
      DD.Act.addRule({ id: 'test_now', name: 'Rigged Mic', icon: '🎤', desc: 'This round his mic is louder.', turns: 1, hooks: {}, cheat: true, source: 'test_heckler', silent: true });
      DD.Act.addRule({ id: 'test_next', name: 'Next round: Pop Quiz', icon: '📝', desc: 'Next round every test is a pop quiz.', turns: -1, hooks: {}, cheat: true, next: true, source: 'test_heckler', silent: true });
      DD.HUD.refresh();
      DD.HUD.hover(imp.x, imp.y);
      const line = q('.hud-inspect .hi-line.cheat');
      t.ok(line && line.textContent === '😈 Cheats this round: 🎤 Rigged Mic · next round: 📝 Pop Quiz.', 'the cheater himself (on the board) names this and next round\'s cheats: ' + (line && line.textContent));
      t.ok(line && /This round his mic is louder\./.test(line.getAttribute('title')), '(the descs in its tooltip)');
      const minion = DD.Combat.state.units.filter(function (u) { return u.side === 'enemy' && !u.isBoss && u.tier !== 'boss' && u !== imp && !u.dead; })[0];
      if (minion) { DD.HUD.hover(minion.x, minion.y); t.ok(!q('.hud-inspect .hi-line.cheat'), 'a plain minion has no such line'); }
      DD.HUD.hover(null);
      // classic fights keep their labels
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_boss', x: 5, y: 5 }], kind: 'boss' });
      t.ok(/\bBoss fight/.test(foot()) && !/Mini-boss|Floor Boss/.test(foot()), 'a v2 boss fight is a Boss fight');
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 5, y: 5 }] });
      t.ok(/Skirmish fight/.test(foot()), 'a skirmish is a Skirmish');
      // E7: a wind-up's hint line (intent.data.hint) in the inspect panel and the tracker
      fight({ w: 11, h: 9, heroes: [{ id: 'test_knight', x: 2, y: 4 }], enemies: [{ id: 'test_boss', x: 8, y: 4 }], kind: 'boss', enemyAi: false });
      const boss = byDef('test_boss');
      const it = DD.AI.windUp(boss, 'test_boss_meteor', { x: 3, y: 4 }, { label: 'Big Slam', data: { hint: 'Slam → Sir Testsalot' } });
      DD.HUD.refresh();
      if (!it) t.skip('no wind-up');
      else {
        DD.HUD.hover(boss.x, boss.y);
        t.eq(text('.hud-inspect .hi-intent .hii-hint'), '👉 Slam → Sir Testsalot', 'the wind-up row carries its hint line');
        const bc = qa('.hud-init .tk-chip').filter(function (c) { return c.dataset.unit === boss.id; })[0];
        t.ok(bc && /Big Slam \(Slam → Sir Testsalot\)/.test(tipOf(bc)), 'and the tracker tooltip');
        DD.HUD.hover(null);
      }
    } finally { leave(); }
  });

  T.suite('hud: V3 — a skill a rule refuses shows its reason in the ⛔ line; "Bleeped …" gets the BLEEP sticker (the Radio Edit)', function (t) {
    if (!v3Ready(t)) return;
    if (typeof DD.Combat.vetoOf !== 'function') { t.skip('no E13 veto (Combat.vetoOf)'); return; }
    const hadMain = Object.prototype.hasOwnProperty.call(DD, 'Main'), oldMain = DD.Main;
    try {
      fight({ heroes: [{ id: 'test_mage', x: 1, y: 1 }, { id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], enemyAi: false });
      const m = byDef('test_mage');
      DD.Act.addRule({ id: 'test_radio', name: 'Radio Edit (test)', icon: '📻', desc: 'Fire Fixture (Wizzy McTest) is bleeped: it can\'t be used this fight.', turns: -1, cheat: true, source: 'test_heckler', silent: true,
        hooks: { modifyUse: function (qq) { if (qq.unit.defId === 'test_mage' && qq.skill.id === 'test_fireball') qq.why = 'Bleeped by the Heckler (Radio Edit).'; } } });
      DD.HUD.refresh();
      t.eq(DD.HUD.selected(), m, 'the mage acts');
      const btn = function (id) { return qa('.hud-bar .hud-skill').filter(function (b) { return b.querySelector('.hs-name') && b.querySelector('.hs-name').textContent === DD.getSkill(id).name; })[0]; };
      const fb = btn('test_fireball'), fr = btn('test_frost_ray');
      t.ok(fb && fb.classList.contains('is-disabled') && fb.classList.contains('bleeped'), 'the bleeped skill is greyed and marked');
      t.eq(fb && fb.querySelector('.hs-bleep') && fb.querySelector('.hs-bleep').textContent, 'BLEEP', 'with a BLEEP sticker');
      t.ok(fb && /⛔ Bleeped by the Heckler \(Radio Edit\)\./.test(tipOf(fb)), 'its ⛔ line gives the reason');
      t.ok(fr && !fr.classList.contains('bleeped') && !fr.querySelector('.hs-bleep'), 'the other skills are fine');
      DD.HUD.key('2');
      t.ok(/Bleeped/.test(DD.HUD.hint()) && DD.HUD.mode().kind === 'move', 'its key says why and arms nothing: ' + DD.HUD.hint());
      // locked (here: AutoPlay drives): the ⛔ line names the lock AND the ban; the sticker stays
      DD.Main = { autoplay: true };
      DD.HUD.refresh();
      const fb2 = btn('test_fireball');
      t.ok(fb2 && fb2.querySelector('.hs-bleep') && /⛔ Autoplay is driving\./.test(tipOf(fb2)) && /⛔ Bleeped by the Heckler/.test(tipOf(fb2)), 'locked: both ⛔ lines, still BLEEP');
      if (hadMain) DD.Main = oldMain; else delete DD.Main;
      DD.HUD.refresh();
      // another refusal (not "Bleeped"): the ⛔ line only, no sticker (the fixtures' Muted Test cheat)
      door('test_a4_lane_d', { heroes: [{ id: 'test_mage', x: 1, y: 1 }], deploy: false, initiative: 'heroesFirst' });
      const mute = DD.Combat.state.data.testMute;
      const mb = mute ? btn(mute.skillId) : null;
      t.ok(mb && mb.classList.contains('is-disabled') && !mb.querySelector('.hs-bleep') && /⛔ Muted by the Heckler \(Muted Test\)\./.test(tipOf(mb)), 'a "Muted …" veto: greyed, its reason, no BLEEP');
      // the real Radio Edit (svammiel.js), when loaded: the picked skill gets the sticker all fight
      const sv = DD.getCameo('svammiel');
      const heroes = ['zarathor', 'syllamin', 'kiri', 'betty'].filter(function (id) { return !!DD.getHero(id); });
      if (sv && sv.cheats && sv.cheats.svam_cameo_radio && heroes.length) {
        fight({ heroes: heroes.map(function (id, i) { return { id: id, x: 1, y: 1 + i, level: 4 }; }), enemies: [{ id: 'test_grunt', x: 7, y: 7 }], enemyAi: false });
        const rule = DD.Cameo.cheat('svammiel', 'svam_cameo_radio');
        const pick = DD.Combat.state.data.cameoRadio;
        t.ok(rule && pick, 'the Radio Edit applied (' + (rule && rule.desc) + ')');
        if (rule && pick) {
          const who = DD.Combat.byId(pick.unitId);
          for (let i = 0; i < 6 && DD.Combat.current() !== who; i++) DD.HUD.endTurn();
          DD.HUD.refresh();
          t.eq(DD.Combat.current(), who, 'the bleeped hero acts (' + who.name + ')');
          const rb = btn(pick.skillId);
          t.ok(rb && rb.querySelector('.hs-bleep') && /⛔ Bleeped by Svammiel \(Radio Edit\)\./.test(tipOf(rb)), DD.getSkill(pick.skillId).name + ': BLEEP and the ⛔ line');
          const rc = q('.hud-obj .hud-chip.rule.cheat');
          const filled = DD.getSkill(pick.skillId).name + ' (' + who.name + ') is bleeped: it can\'t be used this fight.';
          t.ok(rc && rc.querySelector('.rl-name').textContent === '📻 Radio Edit' && tipOf(rc).indexOf(DD.util.escapeHtml(filled)) >= 0,
            'the chip: "📻 Radio Edit" (one icon), the filled desc "' + filled + '"');
        }
      } else t.ok(true, '(svammiel.js or real heroes not loaded: the real Radio Edit check is skipped)');
    } finally {
      if (hadMain) DD.Main = oldMain; else delete DD.Main;
      leave();
    }
  });

  /** The real game (index.html, debug URL params work) in an iframe of exactly w × h px. */
  function gameFrame(query, w, h) {
    return new Promise(function (resolve) {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;border:0;opacity:0;pointer-events:none;width:' + w + 'px;height:' + h + 'px';
      let done = false;
      const finish = function () { if (!done) { done = true; resolve(f); } };
      f.onload = finish;
      setTimeout(finish, 20000);
      f.src = '../index.html?' + query;
      document.body.appendChild(f);
    });
  }
  async function frameUntil(fn, ms) {
    const end = Date.now() + (ms || 10000);
    while (Date.now() < end) { let ok = false; try { ok = !!fn(); } catch (e) { ok = false; } if (ok) return true; await tick(50); }
    return false;
  }

  T.suite('hud: V3 — the initiative tracker fits a squad of five, four heroes and three summons (and the crowd of 16 chips) at 1280×720 (real page)', async function (t) {
    if (!v3Ready(t)) return;
    const sizes = [[1280, 720], [1024, 640]];
    for (let i = 0; i < sizes.length; i++) {
      const w = sizes[i][0], h = sizes[i][1];
      const f = await gameFrame('debug=1&fixtures=1&seed=3', w, h);
      try {
        const W = f.contentWindow;
        const ok = await frameUntil(function () { return W.DD_LOADED && W.DD && W.DD.UI && W.DD.UI.current === 'title' && W.DD.getHero('test_knight'); }, 15000);
        t.ok(ok, w + '×' + h + ': the game is up with the fixtures');
        if (!ok) continue;
        const D = W.DD, doc = W.document;
        D.FX.instant = true;
        const league = ['lg_kelek', 'lg_warduke', 'lg_skylla', 'lg_zarak', 'lg_zargash'].every(function (id) { return !!D.getEnemy(id); });
        const squad = league ? ['lg_kelek', 'lg_warduke', 'lg_skylla', 'lg_zarak', 'lg_zargash'] : ['test_brute', 'test_brute', 'test_brute', 'test_brute', 'test_brute'];
        const goats = ['rap_billy', 'rap_kid', 'rap_turnip', 'rap_ursa'].every(function (id) { return !!D.getEnemy(id); });
        const cases = [
          { tag: 'the League (' + (league ? 'real' : 'test elites') + ') + 4 heroes + 3 summons', enemies: squad.map(function (id, k) { return { id: id, x: 10, y: 1 + 2 * k }; }), n: 9 },
          { tag: 'the crowd: 12 units roll (16 chips)', enemies: squad.concat(['test_minion', 'test_minion', 'test_minion']).map(function (id, k) { return { id: id, x: k < 5 ? 10 : 12, y: k < 5 ? 1 + 2 * k : 2 + 3 * (k - 5) }; }), n: 12 },
        ];
        if (goats) cases.push({ tag: 'the goats (with the bear) + 4 heroes + 3 summons', enemies: [{ id: 'rap_billy', x: 10, y: 1 }, { id: 'rap_kid', x: 10, y: 4 }, { id: 'rap_turnip', x: 10, y: 7 }, { id: 'rap_ursa', x: 12, y: 3 }], n: 8 });
        for (let c = 0; c < cases.length; c++) {
          const cs = cases[c], tag = w + '×' + h + ', ' + cs.tag + ': ';
          D.Combat.sandbox({ w: 14, h: 11, seed: 3, enemyAi: false,
            heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 3 }, { id: 'test_cleric', x: 1, y: 5 }, { id: 'test_summoner', x: 1, y: 7 }],
            summons: [{ id: 'test_hound', x: 2, y: 6, owner: 'test_summoner' }, { id: 'test_hound', x: 2, y: 7, owner: 'test_summoner' }, { id: 'test_hound', x: 2, y: 8, owner: 'test_summoner' }],
            enemies: cs.enemies, objective: { type: 'boss', bossIds: cs.enemies.map(function (e) { return e.id; }) } });
          if (D.UI.current !== 'combat') D.UI.show('combat');
          await tick(250);
          const tr = doc.querySelector('.hud-init');
          const chipsF = Array.prototype.slice.call(doc.querySelectorAll('.hud-init .tk-chip'));
          const units = D.Combat.order().length;
          t.ok(units >= cs.n, tag + units + ' initiative entries');
          t.ok(chipsF.length >= units, tag + chipsF.length + ' tracker chips');
          if (!tr || !chipsF.length) continue;
          const b = tr.getBoundingClientRect();
          const out = chipsF.filter(function (n) { const r = n.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1; });
          t.eq(out.length, 0, tag + 'every chip sits inside the tracker (' + Math.round(b.width) + ' px wide)');
          t.ok(tr.scrollWidth <= tr.clientWidth + 1, tag + 'no overflow (' + tr.scrollWidth + ' ≤ ' + tr.clientWidth + ')');
          const hit = function (a, z) { return a.left < z.right - 1 && z.left < a.right - 1 && a.top < z.bottom - 1 && z.top < a.bottom - 1; };
          const bad = ['.hud-round', '.hud-tr'].filter(function (sel) { const n = doc.querySelector(sel); return n && hit(b, n.getBoundingClientRect()); });
          t.eq(bad.join(','), '', tag + 'the tracker overlaps neither the round box nor the top-right buttons');
          t.ok(b.left >= 0 && b.right <= w, tag + 'on screen');
        }
      } finally { f.remove(); }
    }
  });

  // ---- V3 QA fixes (render-ui cluster) -------------------------------------------------------------------------------
  T.suite('hud: QA HERO-1 — a skill\'s own preview reaches the board and the hint: Snail Mail\'s "📦 N next turn" on every foe in the footprint, the Mystery Potion\'s "? (d6)"', function (t) {
    if (!ready(t)) return;
    const mail = DD.getSkill('ben_mail');
    if (!DD.getHero('benedick') || !mail || typeof mail.preview !== 'function') { t.skip('Benedick (Snail Mail with its own preview) is not registered'); return; }
    try {
      const pot = DD.getConsumable('con_mystery_potion');
      fight({ heroes: [{ id: 'benedick', x: 2, y: 3, level: 5, skills: [{ id: 'ben_shell', level: 1 }, { id: 'ben_slime_line', level: 2 }, { id: 'ben_mail', level: 2 }] }],
        enemies: [{ id: 'test_grunt', x: 6, y: 3 }, { id: 'test_archer', x: 6, y: 5 }, { id: 'test_minion', x: 1, y: 7 }], consumables: pot ? ['con_mystery_potion'] : [], enemyAi: false });
      const b = byDef('benedick'), g = byDef('test_grunt'), a = byDef('test_archer'), far = byDef('test_minion');
      t.eq(DD.HUD.selected() && DD.HUD.selected().id, b.id, 'Benedick\'s turn');
      DD.HUD.pressSlot(3);
      t.ok(DD.HUD.mode().kind === 'skill' && /Snail Mail/.test(DD.HUD.hint()), 'Snail Mail armed (key 4): ' + DD.HUD.hint());
      DD.HUD.hover(6, 4);
      const slot = (b.skills || []).filter(function (s) { return s && s.id === 'ben_mail'; })[0];
      const eng = DD.Targeting.preview(b, slot, { x: 6, y: 4 });
      const eg = eng.perUnit[g.id], ea = eng.perUnit[a.id];
      t.ok(eg && /^📦 \d+ next turn$/.test(eg.text) && eg.dmg === 0, 'the engine\'s honest number for the grunt: ' + (eg && eg.text));
      const pg = ov().previews[g.id], pa = ov().previews[a.id];
      t.ok(pg && pg.text === eg.text, 'the grunt wears it on the board (overlay text "' + (pg && pg.text) + '")');
      t.ok(pa && ea && pa.text === ea.text, 'so does the archer ("' + (pa && pa.text) + '")');
      t.ok(pg && pg.dmg === 0 && !pg.lethal, 'nothing lands now: no damage number, no skull');
      t.ok(!ov().previews[far.id], 'a foe outside the footprint gets nothing');
      const hint = DD.HUD.hint();
      t.ok(hint.indexOf(eg.text + ' → ') >= 0 && hint.indexOf(g.name) >= 0 && hint.indexOf(a.name) >= 0, 'the hint names the parcel\'s hit and who it is for: ' + hint);
      t.ok(!/Hits \d+ foe/.test(hint), 'and promises no hit now');
      DD.HUD.rightClick();
      // the Mystery Potion's bare "? (d6)" (its own preview: the die stays hidden) keeps its words too
      if (pot && typeof pot.preview === 'function') {
        DD.HUD.pressConsumable(0);
        t.eq(DD.HUD.mode().kind, 'cons', 'the Mystery Potion armed');
        DD.HUD.hover(b.x, b.y);
        const pb = ov().previews[b.id];
        t.eq(pb && pb.text, '? (d6)', 'the drinker\'s badge reads "? (d6)", not a bare "?"');
        DD.HUD.rightClick();
      } else t.log('the Mystery Potion is not registered: its check waits');
      // a dry-run preview keeps the plain badge (no custom text): the slime line's hit is the HP number
      DD.HUD.pressSlot(2);
      DD.HUD.hover(g.x, g.y);
      const pl = ov().previews[g.id];
      t.ok(pl && pl.dmg > 0 && !/next turn/.test(pl.text || ''), 'a dry-run preview stays the damage badge (' + JSON.stringify(pl) + ')');
    } finally { leave(); }
  });

  T.suite('hud: QA FIGHTS-04 — the objective fades only where a unit (or the hovered tile) is under it; the chips clear of it keep their text and tooltips', function (t) {
    if (!ready(t)) return;
    const R = DD.Render;
    const w2s = R.worldToScreen;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], enemyAi: false });
      const s = DD.Combat.state, g = byDef('test_grunt');
      s.objective.flavor = 'This round: Pop Quiz · Next cheat: Flaky Dice';
      [['qa_obj_a', '📝 The Extremely Long Pop Quiz'], ['qa_obj_b', '🎲 Flaky Dice of Questionable Origin'], ['qa_obj_c', '🧻 The Paper Cut of Destiny']].forEach(function (r, i) {
        DD.Act.addRule({ id: r[0], name: r[1], desc: 'QA rule ' + i + '.', turns: -1, hooks: {}, cheat: i > 0, silent: true });
      });
      DD.HUD.refresh();
      const E = DD.HUD.els();
      const chipEls = qa('.hud-obj .hud-chip');
      t.ok(chipEls.length >= 3, 'three rule chips on the objective (' + chipEls.length + ')');
      const first = chipEls[0], last = chipEls[chipEls.length - 1];
      const rf = first.getBoundingClientRect(), rl = last.getBoundingClientRect();
      const m = DD.Sprites && DD.Sprites.metrics ? DD.Sprites.metrics(g) : null;
      if (!m || !(m.height > 0) || !(rl.width > 0)) { t.skip('no sprite metrics or no layout'); return; }
      const z = R.camera.zoom, zc = Math.max(0.65, Math.min(1.5, z));
      const top = Math.max((m.height + 16) * z, m.height * z + 4 * z + 5 * zc + 4);
      const hw = Math.max(30 * zc + 9, (m.width || 0) * 0.5 * z);
      t.ok(rl.left - 4 - hw > rf.right || rl.top >= rf.bottom, '(the last chip is well clear of the first: ' + Math.round(rf.right) + ' → ' + Math.round(rl.left) + ')');
      const bg0 = getComputedStyle(E.obj).backgroundImage;
      // the grunt flies at the back: its head just under the last chip's bottom edge, its body below the panel
      R.worldToScreen = function (x, y) { return x === g.x && y === g.y ? { x: rl.right - 4, y: rl.bottom + top - 4 } : { x: -500, y: -500 }; };
      t.ok(DD.HUD.objPeek(), 'a unit under the panel: it peeks');
      t.eq(getComputedStyle(E.obj).pointerEvents, 'none', 'the panel lets clicks through to the board');
      t.eq(getComputedStyle(E.obj).backgroundImage, 'none', 'its background goes (the unit shows through)');
      t.ok(last.classList.contains('ho-under') && getComputedStyle(last).pointerEvents === 'none', 'the chip over the unit fades and lets clicks through');
      t.ok(!first.classList.contains('ho-under') && getComputedStyle(first).pointerEvents === 'auto', 'the chip clear of it stays solid and hoverable (its tooltip opens)');
      t.eq(getComputedStyle(first).opacity, '1', '(full opacity)');
      ['.ho-main', '.ho-flavor'].forEach(function (sel) { const n = q('.hud-obj ' + sel); t.ok(n && !n.classList.contains('ho-under'), sel + ' clear of the unit: readable'); });
      t.ok(/Pop Quiz/.test(text('.hud-obj .ho-flavor')), '(the flavour line names this round\'s cheat)');
      // the hovered tile counts too: a tile under the first chip fades that chip, not the others
      R.worldToScreen = function (x, y) { return x === 0 && y === 0 ? { x: (rf.left + rf.right) / 2, y: rf.bottom - 1 } : { x: -500, y: -500 }; };
      DD.HUD.hover(0, 0);
      t.ok(DD.HUD.objPeek(), 'the hovered tile under the panel: it peeks');
      t.ok(first.classList.contains('ho-under') && !last.classList.contains('ho-under'), 'only the chip over the hovered tile fades');
      DD.HUD.hover(null);
      R.worldToScreen = function () { return { x: -500, y: -500 }; };
      t.ok(!DD.HUD.objPeek(), 'nobody under it: solid again');
      t.eq(qa('.hud-obj .ho-under').length, 0, 'every part solid again');
      t.eq(getComputedStyle(E.obj).backgroundImage, bg0, 'and the background is back' + (bg0 === 'none' ? ' (this page has no style.css: the panel has none)' : ''));
    } finally {
      R.worldToScreen = w2s;
      leave();
    }
  });

  T.suite('hud: QA HERO-3 — a skill that spends all your AP says so where you commit: "1+" on its button and tooltip, "spends all N AP" in the armed hint', function (t) {
    if (!ready(t)) return;
    if (!DD.getHero('benedick') || !DD.getSkill('ben_shell')) { t.skip('Benedick is not registered'); return; }
    try {
      fight({ heroes: [{ id: 'benedick', x: 2, y: 3, level: 5, skills: ['ben_shell', 'ben_slime_line'] }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }], enemyAi: false });
      const b = byDef('benedick');
      const btns = qa('.hud-bar .hud-skill');
      const cost = DD.Combat.costOf(b, DD.getSkill('ben_shell'), 1).ap;
      t.eq(btns[1] && btns[1].querySelector('.hs-ap').textContent, cost + '+', 'Coming Out of My Shell\'s cost badge reads "' + cost + '+"');
      t.ok(/every AP you have left/.test(btns[1].querySelector('.hs-ap').title), 'its title says why');
      t.ok(!/\+/.test(btns[2].querySelector('.hs-ap').textContent), 'the Slime Line\'s badge stays a plain number');
      const tip = DD.UI.skillTooltipHtml('ben_shell', 1, b);
      t.ok(tip.indexOf('>' + cost + '+ AP') >= 0, 'the tooltip\'s cost pill reads "' + cost + '+ AP"');
      t.ok(b.ap > cost, '(Benedick starts his turn with ' + b.ap + ' AP)');
      DD.HUD.pressSlot(1);
      t.eq(DD.HUD.mode().kind, 'skill', 'the shell armed');
      t.ok(DD.HUD.hint().indexOf('spends all ' + b.ap + ' AP') >= 0, 'the armed hint warns before the click: ' + DD.HUD.hint());
      DD.HUD.rightClick();
      b.ap = cost;
      DD.HUD.refresh();
      DD.HUD.pressSlot(1);
      t.ok(DD.HUD.mode().kind === 'skill' && !/spends all/.test(DD.HUD.hint()), 'with only the cost left there is nothing extra to warn about');
      DD.HUD.rightClick();
      t.ok(DD.getSkill('gen_power_nap') ? DD.UI.skillInfo('gen_power_nap', 1).drainsAp === true : true, 'Power Nap is a drain too (its desc says so)');
      t.ok(DD.UI.skillInfo('test_fireball', 1).drainsAp === false, 'a plain skill is not');
    } finally { leave(); }
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
