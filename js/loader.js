/* Dungeons and Degenerates — js/loader.js
 * Loads window.DD_MANIFEST (+ window.DD_EXTRA_SCRIPTS) sequentially with classic <script> tags so the
 * game runs straight from file:// (no server, no modules). Missing files are skipped and recorded in
 * window.DD_MISSING. When done: DD.runAfterLoad(), then dispatches 'dd:loaded' on document.
 * Set window.DD_BASE (e.g. '../') before this script when the page is not at the project root.
 */
(function () {
  'use strict';
  const base = window.DD_BASE || '';
  let list = (window.DD_MANIFEST || []).concat(window.DD_EXTRA_SCRIPTS || []);
  // ?fixtures=1 — load test content into the real game (debugging before/without real content)
  if (!window.DD_TEST && /[?&]fixtures=1(&|$)/.test(window.location.search)) list.push('tests/fixtures.js');
  // ?isolate=a,b — load only the content files (and content test files) whose path contains one of the substrings;
  // core, engine, render, run and UI files always load. Lets content authors test without each other's work in progress.
  const iso = /[?&]isolate=([^&]*)/.exec(window.location.search);
  if (iso) {
    const keys = decodeURIComponent(iso[1]).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    const isContent = function (p) {
      return /^js\/data\/(heroes|enemies|bosses)\//.test(p) || /^tests\/content\//.test(p) ||
        /^js\/data\/(skills_generic|items|consumables|events|narrator|passives)\.js$/.test(p);
    };
    list = list.filter(function (p) { return !isContent(p) || keys.some(function (k) { return p.indexOf(k) >= 0; }); });
  }
  window.DD_MISSING = [];
  window.DD_LOAD_STARTED = Date.now();

  function done() {
    try {
      if (window.DD && window.DD.runAfterLoad) window.DD.runAfterLoad();
    } catch (e) {
      if (window.console) console.error(e);
    }
    window.DD_LOADED = true;
    document.dispatchEvent(new Event('dd:loaded'));
  }

  function load(i) {
    if (i >= list.length) { done(); return; }
    const s = document.createElement('script');
    s.src = base + list[i];
    s.async = false;
    s.onload = function () { load(i + 1); };
    s.onerror = function () { window.DD_MISSING.push(list[i]); load(i + 1); };
    document.head.appendChild(s);
  }

  load(0);
})();
