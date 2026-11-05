/* Dungeons and Degenerates — js/ui/screens/settings.js
 * Settings: animation speed, sound effects + volume, screen shake, grid overlay, map rotation snap (rotSnap), the
 * "I'm the DM's Favorite" unlock-everyone toggle, a controls reference and "Reset Progress" (confirm). Changes apply
 * immediately (DD.Main.applySettings → DD.FX.speed / DD.Audio) and persist via DD.Meta.save(). Params: { back: screenId }.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const SPEEDS = [0.5, 1, 1.5, 2, 3];
  const CONTROLS = [
    ['Left click', 'Select hero · move · use skill'],
    ['Right click / Esc', 'Cancel targeting · close windows'],
    ['1 – 6', 'Basic attack, skills, signature'],
    ['7 – 0', 'Consumables'],
    ['E', 'Interact · Help Up'],
    ['Tab', 'Cycle heroes'],
    ['Space', 'Roll for initiative · end turn · skip animations'],
    ['Z', 'Undo last move'],
    ['Enter', 'Use the armed skill on the hovered tile'],
    ['WASD / Arrows', 'Pan the camera'],
    ['Mouse wheel / + −', 'Zoom'],
    ['Right / left drag', 'Pan the camera'],
    ['Middle drag', 'Rotate the map to any angle'],
    ['Q / R', 'Turn the map 90°'],
    ['Shift + wheel', 'Rotate the map (or a sideways swipe)'],
    ['Two-finger twist', 'Rotate the map (touch)'],
    ['Home', 'Reset the view'],
    ['F', 'Recenter the camera'],
  ];

  function save() {
    if (DD.Meta && typeof DD.Meta.save === 'function') DD.safe('Meta.save', DD.Meta.save, DD.Meta);
  }
  function apply() {
    if (DD.Main && typeof DD.Main.applySettings === 'function') { DD.Main.applySettings(); return; }
    const s = DD.UI.settings();
    if (DD.FX) DD.FX.speed = +s.animSpeed || 1;
    if (DD.Audio) {
      if (typeof DD.Audio.setVolume === 'function') DD.safe('Audio.setVolume', DD.Audio.setVolume, DD.Audio, [+s.volume]);
      if (typeof DD.Audio.mute === 'function') DD.safe('Audio.mute', DD.Audio.mute, DD.Audio, [s.sfx === false]);
    }
  }
  function changed() { apply(); save(); }

  function row(label, desc, control) {
    const el = DD.UI.el;
    return el('div.set-row', null, el('div.set-text', null, el('div.set-label', null, label), desc ? el('div.set-desc', null, desc) : null), el('div.set-control', null, control));
  }

  function toggle(on, onChange) {
    const UI = DD.UI, el = UI.el;
    const t = el('button.toggle', { type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', class: on ? 'on' : '' }, el('span.tg-knob'), el('span.tg-on', null, 'On'), el('span.tg-off', null, 'Off'));
    t.addEventListener('click', function () {
      on = !on;
      t.classList.toggle('on', on);
      t.setAttribute('aria-checked', on ? 'true' : 'false');
      UI.sound('click');
      DD.safe('toggle change', onChange, null, [on]);
    });
    return t;
  }

  function resetProgress() {
    const UI = DD.UI;
    UI.confirm('Burn every character sheet? This deletes <b>all stats, codex entries and run history</b>, and abandons the current campaign. Your settings are kept. This cannot be undone. Like, actually.', { title: 'Reset Progress?', yes: 'Burn it all', no: 'Keep my stuff', danger: true, icon: '🔥' })
      .then(function (ok) {
        if (!ok) return;
        if (DD.Run && typeof DD.Run.clear === 'function') DD.safe('Run.clear', DD.Run.clear, DD.Run);
        if (DD.Meta && typeof DD.Meta.reset === 'function') DD.safe('Meta.reset', DD.Meta.reset, DD.Meta);
        else if (DD.Meta && DD.Meta.data) {
          const d = DD.Meta.data;
          d.unlocked = UI.heroIds().filter(function (id) { const h = DD.getHero(id); return h && !h.unlock; });
          d.stats = { runs: 0, wins: 0, bestAct: 0, deaths: 0, kills: 0 };
          d.seen = { enemies: {}, bosses: {}, events: {} };
          d.history = [];
          save();
        }
        UI.toast('Progress reset. Session Zero, take two.', { icon: '🔥', cls: 'bad' });
        UI.refresh();
      });
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('settings', {
      scene: 'none',
      cls: 'full bg-tavern',
      history: false,
      mount: function (root, params) {
        const UI = DD.UI, el = UI.el;
        params = params || {};
        const s = UI.settings();
        const back = function () { UI.show(params.back && UI.screens[params.back] ? params.back : 'title'); };
        root.appendChild(UI.header('Settings', 'Knobs, sliders and absolutely no cheats. Allegedly.', UI.button('Back', back, { icon: '←', cls: 'ghost', hotkey: 'Escape', showKey: false })));
        const panel = el('div.settings-panel.panel.scroll');

        panel.appendChild(el('div.set-h', null, 'Game'));
        const seg = el('div.segmented');
        SPEEDS.forEach(function (v) {
          const b = UI.button(v + '×', function () {
            s.animSpeed = v;
            seg.querySelectorAll('.seg').forEach(function (x) { x.classList.toggle('active', +x.dataset.v === v); });
            changed();
          }, { cls: 'seg' + ((+s.animSpeed || 1) === v ? ' active' : '') });
          b.dataset.v = String(v);
          seg.appendChild(b);
        });
        panel.appendChild(row('Animation speed', 'How fast combat plays out. 3× for people with somewhere to be.', seg));
        panel.appendChild(row('Screen shake', 'Big hits rattle the screen.', toggle(s.shake !== false, function (on) { s.shake = on; changed(); })));
        panel.appendChild(row('Show grid', 'Outline every tile on the battlefield.', toggle(s.showGrid !== false, function (on) { s.showGrid = on; changed(); })));
        // map rotation (settings.rotSnap, read by DD.Render.endRotate; absent = on)
        panel.appendChild(row('Snap rotation to the classic views', 'A middle-drag let go within 4° of a classic view lands on it. Hold Shift while letting go to leave it exactly where it is.', toggle(s.rotSnap !== false, function (on) { s.rotSnap = on; changed(); })));

        panel.appendChild(el('div.set-h', null, 'Audio'));
        const vol = el('input.slider', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round((s.volume !== undefined ? +s.volume : 0.6) * 100)) });
        const volVal = el('span.slider-val', null, vol.value + '%');
        vol.addEventListener('input', function () { volVal.textContent = vol.value + '%'; s.volume = +vol.value / 100; apply(); });
        vol.addEventListener('change', function () { save(); UI.sound('coin'); });
        const volWrap = el('div.slider-wrap' + (s.sfx === false ? '.off' : ''), null, vol, volVal);
        panel.appendChild(row('Sound effects', 'Procedural blips, whooshes, corgi yips and raven caws.', toggle(s.sfx !== false, function (on) { s.sfx = on; volWrap.classList.toggle('off', !on); changed(); })));
        panel.appendChild(row('Volume', null, volWrap));

        // v2 (integrator): every hero starts unlocked, so the unlock cheat only shows while some hero def has a lock
        const anyLocks = UI.heroIds().some(function (id) { const h = DD.getHero(id); return h && h.unlock; });
        if (anyLocks) {
          panel.appendChild(el('div.set-h', null, 'Cheats (Allegedly)'));
          panel.appendChild(row('I\'m the DM\'s Favorite', 'Unlock every hero right now. The DM will pretend not to notice.', toggle(!!s.unlockAll, function (on) {
            s.unlockAll = on;
            changed();
            UI.toast(on ? 'Every hero is now unlocked. Teacher\'s pet.' : 'Back to earning it the hard way.', { icon: on ? '🍎' : '🎲' });
          })));
        }

        panel.appendChild(el('div.set-h', null, 'Controls'));
        panel.appendChild(el('div.controls', null, CONTROLS.map(function (c) { return el('div.ctrl', null, el('span.ctrl-key', null, c[0]), el('span.ctrl-desc', null, c[1])); })));

        panel.appendChild(el('div.set-h.danger', null, 'Danger Zone'));
        panel.appendChild(row('Reset progress', anyLocks ? 'Delete unlocks, stats, codex and history.' : 'Delete stats, codex and history.', UI.button('Reset Progress', resetProgress, { cls: 'danger small', icon: '🔥' })));
        root.appendChild(el('div.settings-wrap', null, panel));
      },
    });
  });
})();
