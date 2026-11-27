/*
 * Runs inside published courses and Rise previews. Rise renders lessons on the
 * fly, so text rules are re-applied whenever the page content changes.
 * Needs text-rules.js (window.RiseUp.wrapTextRules) and a config.
 */
(function () {
  'use strict';
  var RU = window.RiseUp;
  if (!RU || !RU.wrapTextRules) return;

  function start(config) {
    var cfg = config || window.RISEUP_CONFIG || {};
    var rules = cfg.textRules || [];
    var styles = cfg.textStyles || [];
    if (!rules.length) return null;
    var pending = false;
    var observer = new MutationObserver(schedule);

    function apply() {
      pending = false;
      observer.disconnect();
      try {
        RU.wrapTextRules(document.body, rules, styles, { skipEditable: true });
      } finally {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    }
    function schedule() {
      if (pending) return;
      pending = true;
      (window.requestAnimationFrame || setTimeout)(apply);
    }
    apply();
    return { stop: function () { observer.disconnect(); }, refresh: schedule };
  }

  RU.startRuntime = start;
  if (window.RISEUP_CONFIG) {
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', function () { start(); });
  }
})();
