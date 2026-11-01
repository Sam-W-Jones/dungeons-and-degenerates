/* Dungeons and Degenerates — tests/harness.js
 * Minimal test framework for headless Chrome (see tools/test.sh).
 *
 *   DD_TEST.suite('engine: pathfinding', function (t) { t.eq(a, b, 'msg'); t.ok(x, 'msg'); }, { tags: ['engine'] });
 *
 * URL params: suite=<comma list of substrings>  tag=<tag>  seed=<n>  n=<iterations hint>  verbose=1
 * Suites may be async. Any DD.warn("Error in ...") raised during a suite (i.e. an exception swallowed by
 * DD.safe in a hook/listener) fails that suite. Output: #summary + #results, document.title = "DONE PASS|FAIL".
 */
(function () {
  'use strict';
  const params = {};
  try { new URLSearchParams(location.search).forEach(function (v, k) { params[k] = v; }); } catch (e) { /* */ }

  const T = (window.DD_TEST = {
    suites: [],
    params: params,
    suite: function (name, fn, opts) { T.suites.push({ name: name, fn: fn, tags: (opts && opts.tags) || [] }); },
  });

  function stringify(v) {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function makeT(ctx) {
    const seed = params.seed !== undefined ? params.seed : 12345;
    const t = {
      seed: seed,
      rng: window.DD && DD.RNG ? DD.RNG(seed + ':' + ctx.name) : null,
      n: params.n !== undefined ? +params.n : null,
      param: function (k, def) { return params[k] !== undefined ? params[k] : def; },
      ok: function (v, msg) { return t.assert(!!v, msg); },
      assert: function (cond, msg) {
        if (cond) ctx.passed++;
        else { ctx.failed++; ctx.errors.push('ASSERT: ' + (msg || '(no message)')); }
        return !!cond;
      },
      eq: function (a, b, msg) {
        return t.assert(a === b, (msg || 'eq') + ' — expected ' + stringify(b) + ', got ' + stringify(a));
      },
      near: function (a, b, eps, msg) {
        return t.assert(Math.abs(a - b) <= (eps || 1e-6), (msg || 'near') + ' — expected ~' + b + ', got ' + a);
      },
      fail: function (msg) { ctx.failed++; ctx.errors.push('FAIL: ' + msg); },
      log: function (msg) { ctx.logs.push(String(msg)); },
      skip: function (reason) { ctx.skipped = reason || 'skipped'; },
      /** Run fn, failing (not throwing) on exceptions. Returns fn's value or undefined. */
      tryRun: function (label, fn) {
        try { return fn(); } catch (e) { ctx.failed++; ctx.errors.push('THROW in ' + label + ': ' + (e && e.stack ? e.stack : e)); return undefined; }
      },
    };
    return t;
  }

  function selected() {
    let list = T.suites.slice();
    if (params.suite) {
      const subs = params.suite.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      list = list.filter(function (s) { return subs.some(function (sub) { return s.name.toLowerCase().indexOf(sub) >= 0; }); });
    }
    if (params.tag) list = list.filter(function (s) { return s.tags.indexOf(params.tag) >= 0; });
    return list;
  }

  async function run() {
    const DD = window.DD;
    const out = [];
    const results = [];
    let failedSuites = 0;
    let totalPass = 0, totalFail = 0;

    // ---- load diagnostics ----
    const missing = window.DD_MISSING || [];
    const loadProblems = DD ? DD.problems.slice() : ['window.DD missing'];
    const loadErrors = DD ? DD.errors.slice() : [];
    out.push('== load ==');
    out.push('missing scripts (' + missing.length + '): ' + (missing.join(', ') || 'none'));
    if (loadErrors.length) { out.push('LOAD ERRORS:'); loadErrors.forEach(function (e) { out.push('  ' + e); }); failedSuites++; }
    if (loadProblems.length) { out.push('REGISTRY WARNINGS (' + loadProblems.length + '):'); loadProblems.forEach(function (e) { out.push('  ' + e); }); failedSuites++; }

    if (DD) {
      DD.headless = true;
      if (DD.FX) DD.FX.instant = true;
      if (DD.Storage) DD.Storage.useMemory(true);
    }

    const list = selected();
    out.push('');
    out.push('== suites (' + list.length + ' of ' + T.suites.length + ') ==');
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const ctx = { name: s.name, passed: 0, failed: 0, errors: [], logs: [], skipped: null, ms: 0, warnings: [] };
      const pBefore = DD ? DD.problems.length : 0;
      const eBefore = DD ? DD.errors.length : 0;
      const t0 = performance.now();
      try {
        await s.fn(makeT(ctx));
      } catch (e) {
        ctx.failed++;
        ctx.errors.push('THROW: ' + (e && e.stack ? e.stack : e));
      }
      ctx.ms = Math.round(performance.now() - t0);
      if (DD) {
        ctx.warnings = DD.problems.slice(pBefore);
        const hookErrors = ctx.warnings.filter(function (w) { return /^Error in /.test(w); });
        if (hookErrors.length) { ctx.failed++; ctx.errors.push('Swallowed errors (' + hookErrors.length + '): ' + hookErrors.slice(0, 5).join('\n    ')); }
        const unc = DD.errors.slice(eBefore);
        if (unc.length) { ctx.failed++; ctx.errors.push('Uncaught: ' + unc.slice(0, 5).join('\n    ')); }
      }
      totalPass += ctx.passed; totalFail += ctx.failed;
      const status = ctx.skipped ? 'SKIP' : ctx.failed ? 'FAIL' : 'PASS';
      if (status === 'FAIL') failedSuites++;
      results.push(ctx);
      out.push('[' + status + '] ' + s.name + ' (' + ctx.passed + ' ok, ' + ctx.failed + ' failed, ' + ctx.ms + 'ms)' + (ctx.skipped ? ' — ' + ctx.skipped : ''));
      ctx.errors.slice(0, 30).forEach(function (e) { out.push('    ' + e); });
      if (ctx.errors.length > 30) out.push('    … ' + (ctx.errors.length - 30) + ' more');
      const nonHookWarnings = ctx.warnings.filter(function (w) { return !/^Error in /.test(w); });
      if (nonHookWarnings.length) out.push('    warnings: ' + nonHookWarnings.slice(0, 8).join(' | '));
      if (params.verbose === '1' || status === 'FAIL') ctx.logs.slice(0, 60).forEach(function (l) { out.push('    · ' + l); });
      // yield so long runs don't starve the page
      await new Promise(function (r) { setTimeout(r, 0); });
    }

    const pass = failedSuites === 0;
    const summary = (pass ? 'PASS' : 'FAIL') + ' — ' + list.length + ' suites, ' + totalPass + ' assertions ok, ' + totalFail + ' failures, ' + failedSuites + ' failing sections';
    document.getElementById('summary').textContent = summary;
    document.getElementById('results').textContent = out.join('\n');
    document.title = 'DONE ' + (pass ? 'PASS' : 'FAIL');
    window.DD_TEST_RESULTS = { pass: pass, results: results, summary: summary };
  }

  document.addEventListener('dd:loaded', function () {
    run().catch(function (e) {
      document.getElementById('summary').textContent = 'FAIL — harness crashed: ' + (e && e.stack ? e.stack : e);
      document.title = 'DONE FAIL';
    });
  });
})();
