/*
 * RiseUp runtime. Runs inside published courses (from the package the
 * publish tool makes) and inside Rise's preview (started by the extension).
 *
 *  - Replaces [[RiseUp: type id]] codes with the RiseUp block they name
 *  - Animates blocks as they scroll into view
 *  - Applies text styles to their phrases
 *
 * Rise renders lessons on the fly, so all of this is re-applied whenever the
 * page changes. Needs text-rules.js and components.js loaded first.
 */
(function () {
  'use strict';
  var RU = window.RiseUp;
  if (!RU || !RU.wrapTextRules || !RU.renderComponent) return;

  var STYLE_ID = 'riseup-runtime-style';
  var HOST_ATTR = 'data-riseup-host';
  var BLOCK_SELECTOR = '[data-block-id], .block-wrapper, .blocks-lesson > section';

  function detectAccent(doc) {
    // Use the course's own Rise theme colour so blocks match the course.
    var probe = doc.querySelector('.brand--background, .brand--ui, [class*="brand--background"]');
    var c = probe && doc.defaultView.getComputedStyle(probe).backgroundColor;
    var m = c && c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return '';
    return '#' + [m[1], m[2], m[3]].map(function (v) { return ('0' + Number(v).toString(16)).slice(-2); }).join('');
  }

  function courseKey() {
    return (location.pathname || '').replace(/\/(index\.html)?$/, '');
  }

  /** The element that holds a marker: its paragraph, list item or heading. */
  function hostOf(textNode) {
    var e = textNode.parentElement;
    while (e && e.parentElement && !/^(P|LI|H[1-6]|DIV|SECTION|BLOCKQUOTE)$/.test(e.tagName)) e = e.parentElement;
    return e;
  }

  function start(config, opts) {
    var cfg = config || window.RISEUP_CONFIG || {};
    var o = opts || {};
    var doc = document;
    var win = window;
    var components = {};
    (cfg.components || []).forEach(function (c) { components[c.id] = c; });
    var animation = (cfg.animation && cfg.animation.type) || 'none';
    var duration = Math.min(2000, Math.max(150, Number(cfg.animation && cfg.animation.duration) || 700));
    var blockSelector = cfg.blockSelector || BLOCK_SELECTOR;
    var mounted = [];
    var io = null;
    var pending = false;

    // Styles
    var style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement('style');
      style.id = STYLE_ID;
      (doc.head || doc.documentElement).appendChild(style);
    }
    var theme = Object.assign({}, cfg.componentTheme || {});
    var matchCourse = theme.matchCourse !== false;
    if (!theme.accent && matchCourse) theme.accent = detectAccent(doc);
    style.textContent = RU.COMPONENT_CSS + '\n' + RU.themeCss(theme) + '\n:root { --ru-dur: ' + duration + 'ms; }';

    if (animation !== 'none' && win.IntersectionObserver && !(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      io = new win.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('ru-in'); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }

    function mountMarkers(root) {
      var walker = doc.createTreeWalker(root, 4, null);
      var hits = [];
      for (var n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeValue.indexOf('[[') === -1) continue;
        if (n.parentElement && n.parentElement.closest('[data-riseup-component], script, style, textarea, [contenteditable="true"]')) continue;
        RU.MARKER_RE.lastIndex = 0;
        var m = RU.MARKER_RE.exec(n.nodeValue);
        if (m) hits.push({ node: n, id: m[1].toLowerCase() });
      }
      hits.forEach(function (h) {
        var host = hostOf(h.node);
        if (!host || host.hasAttribute(HOST_ATTR)) return;
        // Read the course's look around this spot before the code is hidden.
        var look = matchCourse ? RU.detectCourseTheme(doc, host) : null;
        host.setAttribute(HOST_ATTR, h.id);
        host.style.display = 'none';
        var comp = components[h.id];
        var node = comp ? RU.renderComponent(doc, comp, { courseKey: courseKey(), bg: cfg.componentTheme && cfg.componentTheme.bg }) : null;
        if (node && look) RU.applyCourseTheme(node, look, { keepAccent: Boolean(cfg.componentTheme && cfg.componentTheme.accent) });
        if (node) {
          if (io && comp.type !== 'hero') { node.classList.add('ru-staged'); }
          host.parentNode.insertBefore(node, host.nextSibling);
          if (io) {
            node.querySelectorAll('.ru-reveal').forEach(function (r) { io.observe(r); });
          } else {
            node.querySelectorAll('.ru-reveal').forEach(function (r) { r.classList.add('ru-in'); });
          }
        }
        mounted.push({ host: host, node: node });
      });
    }

    function animateBlocks() {
      if (!io) return;
      var blocks = doc.querySelectorAll(blockSelector);
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.classList.contains('ru-anim')) continue;
        // Only outermost blocks, so nested ones don't animate twice.
        if (b.parentElement && b.parentElement.closest('.ru-anim')) continue;
        b.classList.add('ru-anim', 'ru-anim-' + animation);
        io.observe(b);
      }
    }

    // Safety brake: if the page keeps undoing RiseUp's changes (a framework
    // re-rendering what RiseUp just changed), stop instead of fighting it.
    var runs = [];
    var halted = false;
    function apply() {
      pending = false;
      if (halted) return;
      var now = Date.now();
      runs.push(now);
      while (runs.length && now - runs[0] > 3000) runs.shift();
      if (runs.length > 60) {
        halted = true;
        observer.disconnect();
        if (window.console) console.warn('RiseUp paused: the page kept changing while RiseUp was updating it.');
        return;
      }
      observer.disconnect();
      try {
        mountMarkers(doc.body);
        animateBlocks();
        if (o.textRules !== false) RU.wrapTextRules(doc.body, cfg.textRules || [], cfg.textStyles || [], { skipEditable: true });
        if (nav) nav.refresh();
      } finally {
        observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
      }
    }
    function schedule() {
      if (pending) return;
      pending = true;
      (win.requestAnimationFrame || setTimeout)(apply);
    }
    var observer = new MutationObserver(schedule);
    var nav = null;
    if (RU.startNav && cfg.navigation && cfg.navigation.layout && cfg.navigation.layout !== 'rise') {
      nav = RU.startNav(doc, cfg.navigation, {
        look: true,
        applyLook: function (n) {
          var look = matchCourse ? RU.detectCourseTheme(doc, null) : {};
          delete look.dark; delete look.ink;
          RU.applyCourseTheme(n, look, { keepAccent: Boolean(theme.accent && cfg.componentTheme && cfg.componentTheme.accent) });
        },
      });
    }
    var widget = (RU.startWidget && cfg.widget && cfg.widget.enabled)
      ? RU.startWidget(doc, cfg.widget, { courseKey: courseKey(), components: cfg.components || [] })
      : null;
    apply();

    return {
      get halted() { return halted; },
      refresh: schedule,
      stop: function () {
        observer.disconnect();
        if (nav) nav.stop();
        if (widget) widget.stop();
        if (io) io.disconnect();
        mounted.forEach(function (m) {
          if (m.node && m.node.parentNode) m.node.parentNode.removeChild(m.node);
          m.host.removeAttribute(HOST_ATTR);
          m.host.style.display = '';
        });
        doc.querySelectorAll('.ru-anim').forEach(function (b) {
          b.classList.remove('ru-anim', 'ru-in', 'ru-anim-fade', 'ru-anim-rise', 'ru-anim-zoom', 'ru-anim-slide');
        });
        RU.unwrapTextRules(doc.body);
        if (style.parentNode) style.parentNode.removeChild(style);
      },
    };
  }

  RU.startRuntime = start;
  if (window.RISEUP_CONFIG) {
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', function () { start(); });
  }
})();
