/* Dungeons and Degenerates — js/engine/hooks.js
 * DD.Hooks (ARCHITECTURE §5.3). Hook sources of a unit, in order:
 *   hero passive / enemy or summon def hooks → unit.hooks (instance) → items → scars → random passives
 *   (unit.passives, the rolled table passives) → statuses → state.rules.
 * fire(name, unit, ...args) calls hooks[name](...args, extra) for each source, wrapped in DD.safe, where extra is
 * the passive / def, item def, scar def, random-passive instance { id, level, L, def, data }, status instance or
 * rule object. Returns the last non-undefined result.
 * fireAll(name, ...args) fires for every active unit with the unit prepended: hooks[name](unit, ...args, extra).
 * some(name, unit, ...args) fires like fire() and is true when any source returned true (veto hooks: preventDeath).
 * The full hook list (contract hooks + the engine extras) is ARCHITECTURE §5.3.
 */
(function () {
  'use strict';
  const DD = window.DD;

  function defOf(unit) {
    if (!unit) return null;
    if (unit.kind === 'hero') return DD.getHero(unit.defId);
    if (unit.kind === 'summon') return DD.getSummon(unit.defId);
    return DD.getEnemy(unit.defId) || DD.getSummon(unit.defId);
  }

  function call(label, fn, thisArg, args) { return DD.safe(label, fn, thisArg, args); }

  /** Shared body of fire / fireOwn: args has room for the source extra at index n. Last non-undefined result wins. */
  function fireWith(name, unit, args, n, noRules) {
    let result;
    Hooks.each(unit, function (hooks, extra, label) {
      const fn = hooks[name];
      if (typeof fn !== 'function') return false;
      args[n] = extra;
      const r = call('hook ' + name + ' (' + label + ')', fn, hooks, args);
      if (r !== undefined) result = r;
      return false;
    }, noRules);
    return result;
  }

  const Hooks = (DD.Hooks = {
    defOf: defOf,

    /** List of { hooks, extra, label } for a unit (allocates; use for inspection, fire() avoids it). */
    sources: function (unit) {
      const out = [];
      Hooks.each(unit, function (hooks, extra, label) { out.push({ hooks: hooks, extra: extra, label: label }); });
      return out;
    },

    /** Iterate hook sources in contract order. cb(hooksObj, extra, label) — return true to stop. noRules: skip state.rules. */
    each: function (unit, cb, noRules) {
      if (!unit) return;
      const def = defOf(unit);
      if (def) {
        if (unit.kind === 'hero') {
          if (def.passive && def.passive.hooks && cb(def.passive.hooks, def.passive, 'passive of ' + def.id)) return;
        } else if (def.hooks && cb(def.hooks, def, 'hooks of ' + def.id)) return;
      }
      if (unit.hooks && cb(unit.hooks, unit, 'instance hooks of ' + unit.id)) return;
      const items = unit.items;
      if (items && items.length) {
        for (let i = 0; i < items.length; i++) {
          const it = DD.getItem(items[i]);
          if (it && it.hooks && cb(it.hooks, it, 'item ' + it.id)) return;
        }
      }
      const scars = unit.scars;
      if (scars && scars.length) {
        for (let i = 0; i < scars.length; i++) {
          const sc = DD.getScar(scars[i]);
          if (sc && sc.hooks && cb(sc.hooks, sc, 'scar ' + sc.id)) return;
        }
      }
      const passives = unit.passives;
      if (passives && passives.length) {
        for (let i = 0; i < passives.length; i++) {
          const p = passives[i];
          if (p && p.def && p.def.hooks && cb(p.def.hooks, p, 'random passive ' + p.id)) return;
        }
      }
      const sts = unit.statuses;
      if (sts && sts.length) {
        const copy = sts.slice();
        for (let i = 0; i < copy.length; i++) {
          const inst = copy[i];
          if (sts.indexOf(inst) < 0) continue; // removed by an earlier hook
          const sd = DD.getStatus(inst.id);
          if (sd && sd.hooks && cb(sd.hooks, inst, 'status ' + inst.id)) return;
        }
      }
      const s = DD.Combat && DD.Combat.state;
      if (!noRules && s && s.rules && s.rules.length) {
        const rules = s.rules.slice();
        for (let i = 0; i < rules.length; i++) {
          const r = rules[i];
          if (r && r.hooks && cb(r.hooks, r, 'rule ' + r.id)) return;
        }
      }
    },

    fire: function (name, unit) {
      if (!unit) return undefined;
      const n = arguments.length - 2;
      const args = new Array(n + 1);
      for (let i = 0; i < n; i++) args[i] = arguments[i + 2];
      return fireWith(name, unit, args, n, false);
    },

    /** fire() without the state.rules sources (for hooks fired on every unit whose rules fire once via fireRules). */
    fireOwn: function (name, unit) {
      if (!unit) return undefined;
      const n = arguments.length - 2;
      const args = new Array(n + 1);
      for (let i = 0; i < n; i++) args[i] = arguments[i + 2];
      return fireWith(name, unit, args, n, true);
    },

    /** Like fire(), but true if ANY source returned true (every source still runs, in order). */
    some: function (name, unit) {
      if (!unit) return false;
      const n = arguments.length - 2;
      const args = new Array(n + 1);
      for (let i = 0; i < n; i++) args[i] = arguments[i + 2];
      let any = false;
      Hooks.each(unit, function (hooks, extra, label) {
        const fn = hooks[name];
        if (typeof fn !== 'function') return false;
        args[n] = extra;
        if (call('hook ' + name + ' (' + label + ')', fn, hooks, args) === true) any = true;
        return false;
      });
      return any;
    },

    /** Fire for every active unit (or the given list): hooks[name](unit, ...args, extra). */
    fireAll: function (name) {
      const s = DD.Combat && DD.Combat.state;
      if (!s) return;
      const rest = Array.prototype.slice.call(arguments, 1);
      const units = s.units.slice();
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.dead || u.downed) continue;
        Hooks.fire.apply(null, [name, u, u].concat(rest));
      }
    },

    /** Fire only the global rule hooks once (not per unit): rule.hooks[name](...args, rule). */
    fireRules: function (name) {
      const s = DD.Combat && DD.Combat.state;
      if (!s || !s.rules) return;
      const args = Array.prototype.slice.call(arguments, 1);
      const rules = s.rules.slice();
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        if (r && r.hooks && typeof r.hooks[name] === 'function') call('rule ' + r.id + ' ' + name, r.hooks[name], r.hooks, args.concat([r]));
      }
    },

    /** True if any source of the unit defines the hook (cheap skip for hot paths). */
    has: function (name, unit) {
      let found = false;
      Hooks.each(unit, function (hooks) { if (typeof hooks[name] === 'function') { found = true; return true; } return false; });
      return found;
    },
  });
})();
