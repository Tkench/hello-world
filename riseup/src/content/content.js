/*
 * RiseUp content script. Runs on rise.articulate.com (top page and frames).
 *
 * In the editor: applies course styling, marks styled phrases and RiseUp
 * block codes (without ever changing Rise's own content), and shows the
 * RiseUp panel.
 * In previews: runs the same runtime as published courses, so blocks,
 * animations and text styles look exactly as learners will see them.
 */
(function () {
  'use strict';
  const RU = globalThis.RiseUp;
  if (!RU || globalThis.__riseupLoaded) return;
  globalThis.__riseupLoaded = true;

  const IS_TOP = window.top === window;
  const store = chrome.storage.local;
  const state = {
    courseId: RU.courseIdFromUrl(location.href),
    config: RU.defaultCourseConfig(),
    colors: RU.defaultColors(),
    settings: { enabled: true, showLauncher: true },
    ui: { x: null, y: null }, // launcher position, as fractions of the free space
  };

  // ================================================================ storage
  const courseKey = () => RU.COURSE_KEY_PREFIX + state.courseId;

  async function load() {
    if (state.courseId === 'default' && !IS_TOP) {
      // Preview frames may not carry the course id; use the one the editor page last reported.
      const { 'riseup:activeCourse': active } = await store.get('riseup:activeCourse');
      if (active) state.courseId = active;
    }
    const got = await store.get([courseKey(), RU.COLORS_KEY, 'riseup:settings', 'riseup:ui', 'riseup:lastBackup']);
    state.lastBackup = got['riseup:lastBackup'] || 0;
    state.config = RU.normalizeCourseConfig(got[courseKey()]);
    state.colors = Object.assign(RU.defaultColors(), got[RU.COLORS_KEY] || {});
    state.settings = Object.assign(state.settings, got['riseup:settings'] || {});
    state.ui = Object.assign(state.ui, got['riseup:ui'] || {});
  }

  /** JSON with sorted keys: chrome.storage hands objects back with their keys reordered. */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  let saveTimer = null;
  const ownWrites = new Set(); // JSON of saves this page made, so their echoes are ignored
  function writeNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    ownWrites.add(stable(state.config));
    if (ownWrites.size > 20) ownWrites.delete(ownWrites.values().next().value);
    store.set({ [courseKey()]: JSON.parse(JSON.stringify(state.config)) });
  }
  /** Typing is batched; structural changes (add, delete) pass { now: true }. */
  function saveConfig(opts) {
    clearTimeout(saveTimer);
    if (IS_TOP && !state.config.courseTitle) state.config.courseTitle = courseTitleGuess();
    if (opts && opts.now) writeNow();
    else saveTimer = setTimeout(writeNow, 250);
    if (!(opts && opts.silent)) applyAll();
  }
  addEventListener('pagehide', () => { if (saveTimer) writeNow(); });
  const saveColors = () => store.set({ [RU.COLORS_KEY]: state.colors });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let rerender = false;
    if (changes[courseKey()]) {
      const raw = stable(changes[courseKey()].newValue);
      // Our own saves come back here too, possibly after newer edits: ignore them,
      // and don't let another tab's change overwrite edits still waiting to be saved.
      if (ownWrites.has(raw)) ownWrites.delete(raw);
      else if (!saveTimer) {
        const next = RU.normalizeCourseConfig(changes[courseKey()].newValue);
        if (stable(next) !== stable(state.config)) { state.config = next; applyAll(); rerender = true; }
      }
    }
    if (changes[RU.COLORS_KEY]) { state.colors = Object.assign(RU.defaultColors(), changes[RU.COLORS_KEY].newValue || {}); rerender = true; }
    if (changes['riseup:settings']) { state.settings = Object.assign(state.settings, changes['riseup:settings'].newValue || {}); applyAll(); rerender = true; }
    if (changes['riseup:ui'] && !panel.dragging) { state.ui = Object.assign({ x: null, y: null }, changes['riseup:ui'].newValue || {}); if (panel.place) panel.place(); }
    if (rerender && panel.render) panel.render(true);
  });

  function courseTitleGuess() {
    return (document.title || '').replace(/\s*[|\-–]\s*Rise.*$/i, '').trim();
  }

  // ================================================================ styling
  const STYLE_ID = 'riseup-style';
  let loadedFontKey = '';
  const fontFaces = [];
  let runtime = null;

  /**
   * Is it safe to change this page's DOM (render blocks, menus, styled text)?
   *
   * Only in a frame, or a page at a preview/share address, that is clearly a
   * preview: never the Rise app itself, whatever it looks like while loading, because changing the DOM of Rise's
   * own app can stop it from loading. Everywhere else RiseUp only adds its own
   * styles, highlights and panel, and leaves Rise's elements alone.
   */
  function isPreviewFrame() {
    // A top-level page only counts when its address clearly says it's a preview or share link.
    if (IS_TOP && !/^\/(preview|share|review)\//i.test(location.pathname)) return false;
    if (/\/(author|authoring|manage|dashboard)(\/|$|\?|#)/i.test(location.pathname + location.hash)) return false;
    if (document.querySelector('[contenteditable=""], [contenteditable="true"]')) return false;
    return Boolean(document.querySelector('[data-block-id], .blocks-lesson, .lesson-main, a[href*="#/lessons/"]'));
  }
  const isEditorPage = () => !isPreviewFrame();

  function highlightCss() {
    if (!(globalThis.CSS && CSS.highlights)) return '';
    return state.config.textStyles.map((s) => {
      const c = RU.safeColor(s.color) || RU.safeColor(s.gradientFrom) || '#f04f4d';
      return '::highlight(ru-hl-' + s.id.replace(/[^A-Za-z0-9_-]/g, '') + ') { text-decoration: underline dotted 2px ' + c + '; text-underline-offset: 3px; }';
    }).join('\n') +
      '\n::highlight(riseup-find) { background-color: #ffa34a; color: #2b2b2b; }' +
      '\n::highlight(riseup-marker) { background-color: rgba(240, 79, 77, .14); color: #c23b39; }';
  }

  function applyCss() {
    let el = document.getElementById(STYLE_ID);
    if (!state.settings.enabled) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = RU.buildCss(state.config, { editor: isEditorPage() }) + highlightCss();
  }

  async function applyFonts() {
    const key = state.settings.enabled ? RU.googleFontsUrl(state.config.fonts) : '';
    if (key === loadedFontKey) return;
    loadedFontKey = key;
    fontFaces.splice(0).forEach((f) => document.fonts.delete(f));
    if (!key) return;
    const res = await chrome.runtime.sendMessage({ type: 'riseup:fetchFonts', fonts: state.config.fonts }).catch((e) => ({ ok: false, error: e.message }));
    if (!res || !res.ok) {
      if (panel.status) panel.status('Fonts could not be loaded: ' + ((res && res.error) || 'no response'), 'error');
      loadedFontKey = '';
      return;
    }
    for (const f of res.faces) {
      try {
        const face = new FontFace(f.family, RU.fromBase64(f.data), { style: f.style, weight: f.weight, unicodeRange: f.unicodeRange || undefined });
        await face.load();
        document.fonts.add(face);
        fontFaces.push(face);
      } catch (e) { /* skip a face that fails rather than losing the rest */ }
    }
  }

  function contentRoots() {
    const blocks = Array.from(document.querySelectorAll(RU.SELECTORS.block));
    const outer = blocks.filter((b) => !blocks.some((o) => o !== b && o.contains(b)));
    return outer.length ? outer : [document.body];
  }

  function clearHighlights(prefix) {
    if (!(globalThis.CSS && CSS.highlights)) return;
    for (const name of Array.from(CSS.highlights.keys())) if (name.startsWith(prefix)) CSS.highlights.delete(name);
  }

  /** Text nodes holding RiseUp block codes, with the block they name. */
  function findMarkers() {
    const out = [];
    for (const root of contentRoots()) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeValue.indexOf('[[') === -1) continue;
        RU.MARKER_RE.lastIndex = 0;
        let m;
        while ((m = RU.MARKER_RE.exec(n.nodeValue))) {
          const range = document.createRange();
          range.setStart(n, m.index);
          range.setEnd(n, m.index + m[0].length);
          out.push({ id: m[1].toLowerCase(), range });
        }
      }
    }
    return out;
  }

  /** Editor: mark styled phrases and block codes without touching Rise's DOM. */
  function applyEditorMarks() {
    clearHighlights('ru-hl-');
    clearHighlights('riseup-marker');
    if (!state.settings.enabled || !(globalThis.CSS && CSS.highlights && typeof Highlight === 'function')) { if (panel.chips) panel.chips([]); return; }
    const { textRules, textStyles } = state.config;
    if (textRules.length) {
      for (const root of contentRoots()) {
        for (const [styleId, ranges] of Object.entries(RU.collectRanges(root, textRules, textStyles))) {
          const name = 'ru-hl-' + styleId.replace(/[^A-Za-z0-9_-]/g, '');
          const hl = CSS.highlights.get(name) || new Highlight();
          ranges.forEach((r) => hl.add(r));
          CSS.highlights.set(name, hl);
        }
      }
    }
    const markers = findMarkers();
    if (markers.length) CSS.highlights.set('riseup-marker', new Highlight(...markers.map((m) => m.range)));
    if (panel.chips) panel.chips(markers);
  }

  function applyMarks() {
    if (!document.body) return;
    observer.disconnect();
    try {
      if (isEditorPage()) {
        if (runtime) { runtime.stop(); runtime = null; }
        applyEditorMarks();
      } else {
        if (runtime) runtime.stop();
        runtime = state.settings.enabled ? RU.startRuntime(state.config) : null;
      }
    } finally {
      observe();
    }
  }

  let markTimer = null;
  const observer = new MutationObserver((records) => {
    if (records.every((r) => panel.host && panel.host.contains(r.target))) return;
    if (runtime) {
      // A preview frame that turns editable (or stops looking like a preview) gets left alone.
      if (isEditorPage()) { clearTimeout(markTimer); markTimer = setTimeout(applyMarks, 300); }
      return; // otherwise the runtime watches the page itself
    }
    if (!IS_TOP && isPreviewFrame()) { clearTimeout(markTimer); markTimer = setTimeout(applyMarks, 300); return; } // a preview finished loading
    clearTimeout(markTimer);
    markTimer = setTimeout(() => { observer.disconnect(); try { applyEditorMarks(); } finally { observe(); } }, 300);
  });
  function observe() {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function applyAll() {
    applyCss();
    applyFonts();
    applyMarks();
    if (panel.refreshPreviewCss) panel.refreshPreviewCss();
  }

  let lastSelection = '';
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (text) lastSelection = text;
  });

  // ================================================================ UI helpers
  const panel = {};

  const ICONS = {
    up: '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.5 8 5l4.5 4.5"/><path d="M5 13h6"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    styles: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="4"/><path d="M3 8h14"/></svg>',
    text: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 5V4h12v1M10 4v12M7.5 16h5"/></svg>',
    blocks: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1.8"/><rect x="11" y="3" width="6" height="6" rx="1.8"/><rect x="3" y="11" width="6" height="6" rx="1.8"/><path d="M14 11v6M11 14h6" stroke-linecap="round"/></svg>',
    find: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="9" cy="9" r="5"/><path d="m13 13 4 4"/></svg>',
    colors: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="7"/><circle cx="7" cy="8" r="1.2" fill="currentColor"/><circle cx="11" cy="6.5" r="1.2" fill="currentColor"/><circle cx="13.5" cy="10" r="1.2" fill="currentColor"/></svg>',
    copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="5" width="8" height="8" rx="2"/><path d="M3 10V4a1 1 0 0 1 1-1h6"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
    pen: '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"><path d="M3 13l1-3.5L10.5 3l2.5 2.5L6.5 12z"/></svg>',
    // gallery glyphs
    hero: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5 7h6M5 9.5h3.5" stroke-linecap="round"/></svg>',
    stats: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 13V9M8 13V4M13 13V7"/></svg>',
    timeline: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 2v12"/><circle cx="4" cy="4.5" r="1.6" fill="currentColor"/><circle cx="4" cy="11" r="1.6" fill="currentColor"/><path d="M8 4.5h5M8 11h5" stroke-linecap="round"/></svg>',
    quote: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 9.5C3 6.5 4.6 4.6 7 4v1.6C5.8 6.1 5.2 7 5.1 8H7v4H3zM9 9.5C9 6.5 10.6 4.6 13 4v1.6c-1.2.5-1.8 1.4-1.9 2.4H13v4H9z"/></svg>',
    section: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 5h12M2 8h8M2 11h12"/></svg>',
    flipcards: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="3" width="7" height="10" rx="1.5"/><path d="M11.5 5.5c1.2.6 2 1.6 2 2.5s-.8 1.9-2 2.5" stroke-linecap="round"/></svg>',
    flipcarousel: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="5" y="3" width="6" height="10" rx="1.4"/><path d="M3 5v6M13 5v6" stroke-linecap="round"/></svg>',
    single: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="4.5" cy="5" r="2"/><circle cx="4.5" cy="11" r="2"/><circle cx="4.5" cy="11" r=".6" fill="currentColor"/><path d="M8.5 5h5M8.5 11h5" stroke-linecap="round"/></svg>',
    multiple: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2.5" y="3" width="4" height="4" rx="1"/><rect x="2.5" y="9" width="4" height="4" rx="1"/><path d="M3.5 5l.8.8 1.4-1.6M3.5 11l.8.8 1.4-1.6M8.5 5h5M8.5 11h5" stroke-linecap="round"/></svg>',
    sortcards: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2" y="2.5" width="5" height="11" rx="1.2"/><rect x="9" y="2.5" width="5" height="11" rx="1.2"/><path d="M3.5 6h2M10.5 6h2M10.5 8.5h2" stroke-linecap="round"/></svg>',
    fillblanks: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 6h3M11 6h3M2 11h5"/><rect x="6" y="4" width="4" height="4" rx="1" stroke-dasharray="1.5 1.2"/></svg>',
    popup: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2" y="3" width="12" height="9" rx="2"/><path d="M8 6v.01M8 8v2" stroke-linecap="round"/></svg>',
    collect: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8 2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4L2.2 6.3l4-.6z"/></svg>',
    torch: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 2h6l-1 4H6z"/><path d="M6 6h4v8H6z"/><path d="M3 3l1 1M13 3l-1 1" stroke-linecap="round"/></svg>',
    blender: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="6" cy="7" r="4"/><circle cx="10" cy="7" r="4"/><path d="M2 14h12" stroke-linecap="round"/></svg>',
    conversation: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2 3h8v5H5l-3 2.5z"/><path d="M10 6h4v5.5L12 10H7.5V8"/></svg>',
    chart: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5V8l4.5 3" stroke-linecap="round"/></svg>',
    hotspots: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="2.5" width="12" height="11" rx="2"/><circle cx="6" cy="7" r="1.5" fill="currentColor"/><circle cx="10.5" cy="9.5" r="1.5" fill="currentColor"/></svg>',
    sort: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 4h7M6 8h7M6 12h7M3 3.5v9M2 11l1 1.5L4 11"/></svg>',
    reveal: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>',
    compare: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M8 2v12"/></svg>',
    reflection: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 3h10v7H7l-3 3v-3H3z"/></svg>',
  };

  function svg(name) {
    const span = document.createElement('span');
    span.style.display = 'contents';
    span.innerHTML = ICONS[name] || ''; // static markup defined above, never user input
    return span;
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'value') value = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    if (value !== undefined) {
      if (tag === 'input') el.setAttribute('value', value);
      el.value = value;
    }
    return el;
  }

  const field = (label, input, cls) => h('label', { class: 'field' + (cls ? ' ' + cls : '') }, h('span', null, label), input);

  function numberInput(value, onChange, opts) {
    return h('input', Object.assign({ type: 'number', value: value === null || value === undefined ? '' : value, placeholder: 'Default',
      oninput: (e) => onChange(e.target.value === '' ? null : Number(e.target.value)) }, opts || {}));
  }

  function selectInput(value, options, onChange) {
    return h('select', { onchange: (e) => onChange(e.target.value) },
      options.map(([v, label]) => h('option', { value: v, selected: String(value) === String(v) }, label)));
  }

  function colorInput(value, onChange) {
    const text = h('input', { type: 'text', value: value || '', placeholder: 'Default', 'aria-label': 'Hex colour',
      onchange: (e) => { const v = RU.normalizeHex(e.target.value) || ''; e.target.value = v; picker.value = v || '#000000'; picker.className = v ? '' : 'unset'; onChange(v); } });
    const picker = h('input', { type: 'color', value: RU.normalizeHex(value) || '#000000', class: value ? '' : 'unset', 'aria-label': 'Pick colour',
      oninput: (e) => { text.value = e.target.value; picker.className = ''; onChange(e.target.value); } });
    return h('span', { class: 'colorfield' }, picker, text);
  }

  /** Collapsible section; remembers which one is open per tab. */
  const openSection = {};
  function acc(tab, id, title, body, count) {
    const isOpen = (openSection[tab] === undefined ? null : openSection[tab]) === id;
    const d = h('details', { class: 'acc', open: isOpen },
      h('summary', null, title, count ? h('span', { class: 'count' }, count) : null),
      h('div', { class: 'acc-body' }, body));
    // Record the open section on click too: the toggle event comes a moment later.
    d.firstChild.addEventListener('click', () => { openSection[tab] = d.open ? null : id; });
    d.addEventListener('toggle', () => {
      if (d.open) {
        openSection[tab] = id;
        d.parentElement && d.parentElement.querySelectorAll('details.acc[open]').forEach((o) => { if (o !== d) o.open = false; });
      } else if (openSection[tab] === id) openSection[tab] = null;
    });
    return d;
  }

  const TRANSFORM_OPTS = [['', 'Default'], ['none', 'None'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase'], ['capitalize', 'Capitalise']];
  const WEIGHT_OPTS = [['', 'Default'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold'], ['900', 'Black']];

  // ================================================================ Styles tab
  function stylesTab() {
    const gs = state.config.globalStyles;
    const anim = state.config.animation;
    const nav = state.config.navigation;
    const wdg = state.config.widget;
    const set = (k) => (v) => { gs[k] = v; saveConfig(); };
    const setAnim = (k) => (v) => { anim[k] = v; saveConfig(); };
    const T = 'styles';
    return [
      h('p', { class: 'lead' }, 'Styling Rise has no setting for. Theme fonts, colours and block padding stay in Rise.'),
      acc(T, 'blocks', 'Blocks', [
        field('Corner radius', numberInput(gs.blockRadius, set('blockRadius'), { min: 0, max: 64 })),
        field('Shadow', selectInput(gs.blockShadow, [['none', 'None'], ['soft', 'Soft'], ['medium', 'Medium'], ['strong', 'Strong']], set('blockShadow'))),
        field('Image corner radius', numberInput(gs.imageRadius, set('imageRadius'), { min: 0, max: 64 })),
      ]),
      acc(T, 'animation', 'Scroll animation', [
        field('Blocks appear with', selectInput(anim.type, Object.entries(RU.ANIMATIONS), setAnim('type'))),
        field('Speed', selectInput(String(anim.duration), [['450', 'Quick'], ['700', 'Normal'], ['1100', 'Slow']], (v) => setAnim('duration')(Number(v)))),
        h('p', { class: 'empty' }, 'Shows in Preview and the published course. Learners who turn off motion on their device don’t see it.'),
      ]),
      acc(T, 'nav', 'Course navigation', [
        field('Menu', selectInput(nav.layout, Object.entries(RU.NAV_LAYOUTS), (v) => { nav.layout = v; saveConfig(); panel.render(); })),
        nav.layout !== 'rise' ? [
          field('Bar colour', selectInput(nav.style, [['light', 'Light'], ['dark', 'Dark'], ['brand', 'Course colour']], (v) => { nav.style = v; saveConfig(); })),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: nav.progress !== false, onchange: (e) => { nav.progress = e.target.checked; saveConfig(); } }), 'Show a progress line'),
          field('Title', h('input', { type: 'text', value: nav.title || '', placeholder: 'Course title', oninput: (e) => { nav.title = e.target.value; saveConfig({ silent: true }); } })),
          field('Logo', imageInput(nav.logo, (v) => { nav.logo = v; saveConfig(); }), 'stack'),
          h('p', { class: 'empty' }, 'Replaces Rise\u2019s left sidebar with a menu across the top. See it in Preview and the published course.'),
        ] : null,
      ]),
      acc(T, 'widget', 'Floating space', [
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Boolean(wdg.enabled), onchange: (e) => { wdg.enabled = e.target.checked; saveConfig(); panel.render(); } }), 'Show a floating space learners can move around'),
        wdg.enabled ? [
          field('Shows', selectInput(wdg.type, [['score', 'Score from activities'], ['collection', 'Collection (use Collectable blocks)'], ['menu', 'Lesson menu']], (v) => { wdg.type = v; saveConfig(); })),
          field('Title', h('input', { type: 'text', value: wdg.title || '', placeholder: 'Default', oninput: (e) => { wdg.title = e.target.value; saveConfig({ silent: true }); } })),
          h('p', { class: 'empty' }, 'Appears in Preview and the published course. Learners can drag it anywhere; progress is kept on their device.'),
        ] : null,
      ]),
      acc(T, 'buttons', 'Buttons', [
        field('Corner radius', numberInput(gs.buttonRadius, set('buttonRadius'), { min: 0, max: 64 })),
        field('Letter case', selectInput(gs.buttonTextTransform, TRANSFORM_OPTS, set('buttonTextTransform'))),
        field('Weight', selectInput(gs.buttonFontWeight, WEIGHT_OPTS, set('buttonFontWeight'))),
      ]),
      acc(T, 'headings', 'Headings', [
        field('Letter case', selectInput(gs.headingTextTransform, TRANSFORM_OPTS, set('headingTextTransform'))),
        field('Weight', selectInput(gs.headingFontWeight, WEIGHT_OPTS, set('headingFontWeight'))),
      ]),
      acc(T, 'links', 'Links', [
        field('Colour', colorInput(gs.linkColor, set('linkColor'))),
        field('Underline', selectInput(gs.linkUnderline, [['', 'Default'], ['always', 'Always'], ['hover', 'On hover'], ['none', 'Never']], set('linkUnderline'))),
      ]),
      acc(T, 'css', 'Custom CSS', [
        h('textarea', { class: 'code', spellcheck: false, value: gs.customCss || '', 'aria-label': 'Custom CSS', placeholder: '/* Applied in the editor and the published course */', oninput: (e) => set('customCss')(e.target.value) }),
      ]),
    ];
  }

  // ================================================================ Text tab
  let selectedStyleId = null;

  function textTab() {
    const cfg = state.config;
    const T = 'text';
    if (openSection[T] === undefined) openSection[T] = 'styles';
    const fontNames = cfg.fonts.map((f) => f.family);
    const fontInput = h('input', { type: 'text', placeholder: 'Google Fonts name, eg Lora', list: 'riseup-font-list', 'aria-label': 'Font name' });
    const addFont = () => {
      const family = RU.safeFamily(fontInput.value);
      if (!family) return panel.status('Type a font name exactly as it appears on fonts.google.com.', 'error');
      if (!fontNames.includes(family)) cfg.fonts.push({ family, weights: [400, 700], italic: true });
      saveConfig();
      panel.render();
    };

    const style = cfg.textStyles.find((s) => s.id === selectedStyleId) || null;
    const newStyle = () => {
      const s = { id: RU.uid('s'), name: 'Style ' + (cfg.textStyles.length + 1), fontFamily: fontNames[0] || '', fontWeight: '', italic: false,
        textTransform: '', letterSpacing: null, color: '', gradientFrom: '', gradientTo: '', gradientAngle: 90, shadow: '', smallCaps: false, highlight: '' };
      cfg.textStyles.push(s);
      selectedStyleId = s.id;
      saveConfig({ now: true });
      panel.render();
    };

    const applyToSelection = () => {
      if (!style) return panel.status('Choose or create a style first.', 'error');
      const text = lastSelection;
      if (!text) return panel.status('Select some text in the course first.', 'error');
      if (text.length > 300) return panel.status('Select a shorter phrase (300 characters or fewer).', 'error');
      cfg.textRules = cfg.textRules.filter((r) => r.text !== text);
      cfg.textRules.push({ id: RU.uid('r'), text, styleId: style.id, matchCase: true, wholeWord: false });
      saveConfig({ now: true });
      panel.render();
      panel.status('“' + text.slice(0, 40) + (text.length > 40 ? '…' : '') + '” now uses ' + style.name + '.', 'ok');
    };

    return [
      h('p', { class: 'lead' }, 'Style any word or phrase. In the editor styled text is underlined; Preview shows the full style.'),
      acc(T, 'styles', 'Text styles', [
        cfg.textStyles.length
          ? h('ul', { class: 'list' }, cfg.textStyles.map((s) => h('li', { class: 'item' + (s.id === selectedStyleId ? ' selected' : '') },
              h('button', { class: 'grow', type: 'button', onclick: () => { selectedStyleId = s.id === selectedStyleId ? null : s.id; panel.render(); } }, s.name),
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete ' + s.name, title: 'Delete', onclick: () => {
                cfg.textStyles = cfg.textStyles.filter((x) => x.id !== s.id);
                cfg.textRules = cfg.textRules.filter((r) => r.styleId !== s.id);
                if (selectedStyleId === s.id) selectedStyleId = null;
                saveConfig(); panel.render();
              } }, svg('trash')))))
          : h('p', { class: 'empty' }, 'No text styles yet.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', type: 'button', disabled: !style, onclick: applyToSelection }, 'Apply to selected text'),
          h('button', { class: 'btn', type: 'button', onclick: newStyle }, 'New style')),
        style ? styleEditor(style, fontNames) : null,
      ], cfg.textStyles.length ? String(cfg.textStyles.length) : ''),
      acc(T, 'fonts', 'Fonts', [
        h('div', { class: 'row' }, fontInput, h('button', { class: 'btn', type: 'button', onclick: addFont }, 'Add')),
        h('datalist', { id: 'riseup-font-list' }, RU.SUGGESTED_FONTS.map((f) => h('option', { value: f }))),
        fontNames.length
          ? h('ul', { class: 'list' }, cfg.fonts.map((f, i) => h('li', { class: 'item' },
              h('span', { class: 'grow', style: "font-family:'" + f.family + "'; font-size: 15px" }, f.family),
              h('button', { class: 'icon-btn', type: 'button', title: 'Remove', 'aria-label': 'Remove ' + f.family, onclick: () => { cfg.fonts.splice(i, 1); saveConfig(); panel.render(); } }, svg('trash')))))
          : h('p', { class: 'empty' }, 'Any Google Font, used only where you apply it.'),
      ], cfg.fonts.length ? String(cfg.fonts.length) : ''),
      acc(T, 'phrases', 'Styled phrases', [
        cfg.textRules.length
          ? h('ul', { class: 'list' }, cfg.textRules.map((r) => {
              const s = cfg.textStyles.find((x) => x.id === r.styleId);
              return h('li', { class: 'item' },
                h('span', { class: 'grow', title: r.text }, '“' + r.text + '”', h('span', { class: 'sub' }, s ? s.name : '?')),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', title: 'Remove', onclick: () => { cfg.textRules = cfg.textRules.filter((x) => x !== r); saveConfig(); panel.render(); } }, svg('trash')));
            }))
          : h('p', { class: 'empty' }, 'Select text in the course, then Apply to selected text.'),
      ], cfg.textRules.length ? String(cfg.textRules.length) : ''),
    ];
  }

  function styleEditor(s, fontNames) {
    const set = (k, rerender) => (v) => { s[k] = v; saveConfig(); if (rerender) panel.render(); };
    return h('div', { style: 'margin-top:10px' },
      field('Name', h('input', { type: 'text', value: s.name, onchange: (e) => set('name', true)(e.target.value || 'Untitled') })),
      field('Font', selectInput(s.fontFamily, [['', 'Same as Rise']].concat(fontNames.map((f) => [f, f])), set('fontFamily'))),
      field('Weight', selectInput(s.fontWeight, WEIGHT_OPTS, set('fontWeight'))),
      field('Colour', colorInput(s.color, set('color'))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.italic, onchange: (e) => set('italic')(e.target.checked) }), 'Italic'),
      h('details', { class: 'acc', style: 'margin-top:8px' },
        h('summary', null, 'More effects'),
        h('div', { class: 'acc-body' },
          field('Letter case', selectInput(s.textTransform, TRANSFORM_OPTS, set('textTransform'))),
          field('Letter spacing (em)', numberInput(s.letterSpacing, set('letterSpacing'), { step: 0.01, min: -0.2, max: 1 })),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.smallCaps, onchange: (e) => set('smallCaps')(e.target.checked) }), 'Small caps'),
          field('Highlight', colorInput(s.highlight, set('highlight'))),
          field('Gradient from', colorInput(s.gradientFrom, set('gradientFrom'))),
          field('Gradient to', colorInput(s.gradientTo, set('gradientTo'))),
          field('Gradient angle', numberInput(s.gradientAngle, set('gradientAngle'), { min: 0, max: 360 })),
          field('Shadow', selectInput(s.shadow, [['', 'None'], ['soft', 'Soft'], ['strong', 'Strong'], ['glow', 'Glow']], set('shadow'))))),
      h('div', { class: 'sample' }, h('span', { class: RU.styleClass(s.id) }, 'The quick brown fox')));
  }

  // ================================================================ Blocks tab
  let editingId = null;

  function component(id) { return state.config.components.find((c) => c.id === id) || null; }

  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); panel.status(okMsg, 'ok'); }
    catch (e) { panel.status('Copying was blocked. Select the code and copy it with Ctrl+C.', 'error'); }
  }

  function blocksTab() {
    const comp = editingId && component(editingId);
    return comp ? blockEditor(comp) : blockHome();
  }

  function blockHome() {
    const cfg = state.config;
    const T = 'blocks';
    const add = (type) => {
      const def = RU.TYPES[type];
      const c = { id: RU.newComponentId(), type, name: def.label, data: def.defaults() };
      cfg.components.push(c);
      editingId = c.id;
      saveConfig({ now: true });
      panel.render();
    };
    const tile = ([type, def]) => h('button', { class: 'tile', type: 'button', onclick: () => add(type), title: def.description },
      h('span', { class: 'glyph' }, svg(type)), h('strong', null, def.label), h('small', null, def.description.split('.')[0] + '.'));
    const entries = Object.entries(RU.TYPES);
    const theme = cfg.componentTheme;
    return [
      backupDue() ? h('p', { class: 'lead', style: 'margin-bottom:6px' }, 'Your RiseUp work is saved in this browser only, and removing the extension deletes it. ', h('button', { class: 'link', type: 'button', onclick: backupAll }, 'Back up now')) : null,
      cfg.components.length ? [
        h('p', { class: 'group-label' }, 'In this course'),
        h('ul', { class: 'list' }, cfg.components.map((c) => h('li', { class: 'item' },
          h('button', { class: 'grow', type: 'button', onclick: () => { editingId = c.id; panel.render(); } },
            c.name || RU.TYPES[c.type].label, h('span', { class: 'sub' }, RU.TYPES[c.type] ? RU.TYPES[c.type].label + ' · ' + c.id : c.type)),
          h('button', { class: 'icon-btn', type: 'button', title: 'Copy code', 'aria-label': 'Copy code for ' + c.name, onclick: () => copyText(RU.markerFor(c), 'Code copied. Paste it into a Rise text block.') }, svg('copy'))))),
      ] : h('p', { class: 'lead' }, 'Add designed and interactive blocks to your lessons. Pick one, fill it in, then paste its code into a Rise text block.'),
      h('p', { class: 'group-label' }, 'Design templates'),
      h('div', { class: 'gallery' }, entries.filter(([, d]) => d.kind === 'template').map(tile)),
      h('p', { class: 'group-label' }, 'Interactive'),
      h('div', { class: 'gallery' }, entries.filter(([, d]) => d.kind === 'interactive').map(tile)),
      h('p', { class: 'group-label' }, 'Questions'),
      h('div', { class: 'gallery' }, entries.filter(([, d]) => d.kind === 'question').map(tile)),
      h('div', { style: 'margin-top:14px' }, acc(T, 'look', 'Block look', [
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: theme.matchCourse !== false, onchange: (e) => { theme.matchCourse = e.target.checked; saveConfig(); panel.render(); } }), 'Match the course\u2019s colour, fonts and buttons'),
        h('p', { class: 'empty' }, theme.matchCourse !== false
          ? 'Blocks take the Rise theme colour, heading and body fonts, text colour and button shape, and adapt to dark block backgrounds.'
          : 'Blocks use the colour below and the page\u2019s default font.'),
        field(theme.matchCourse !== false ? 'Override colour' : 'Accent colour', colorInput(theme.accent, (v) => { theme.accent = v; saveConfig(); })),
        field('Corner radius', numberInput(theme.radius, (v) => { theme.radius = v === null ? 12 : v; saveConfig(); }, { min: 0, max: 32 })),
      ])),
    ];
  }

  function blockEditor(comp) {
    const def = RU.TYPES[comp.type];
    const pickable = comp.type === 'hotspots' || comp.type === 'torch';
    const previewBox = h('div', { class: 'preview' + (pickable ? ' pickable' : '') });
    const drawPreview = () => {
      const node = RU.renderComponent(document, comp, { courseKey: 'preview', static: true });
      const theme = state.config.componentTheme;
      if (node && theme.matchCourse !== false) {
        // Preview with the course's fonts and colours, read from the lesson that's open.
        const look = RU.detectCourseTheme(document, null);
        delete look.dark; // the preview card is always light
        RU.applyCourseTheme(node, look, { keepAccent: Boolean(theme.accent) });
      }
      previewBox.replaceChildren(h('span', { class: 'preview-label' }, pickable ? 'Preview · click the image to add a spot' : 'Preview'), node || '');
      const torchStage = previewBox.querySelector('.ru-torch-stage');
      if (torchStage) torchStage.classList.add('is-lit'); // authors see every spot
      if (pickable) {
        const stage = previewBox.querySelector('.ru-hs-stage, .ru-torch-stage');
        stage && stage.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          const r = stage.getBoundingClientRect();
          const x = Math.round(((e.clientX - r.left) / r.width) * 100);
          const y = Math.round(((e.clientY - r.top) / r.height) * 100);
          comp.data.points = (comp.data.points || []).concat([{ title: 'Spot ' + ((comp.data.points || []).length + 1), text: '', x, y }]);
          saveConfig();
          panel.render();
        });
      }
    };
    const changed = () => { saveConfig({ silent: true }); drawPreview(); applyMarksSoon(); };
    drawPreview();
    const marker = RU.markerFor(comp);
    return [
      h('button', { class: 'link back', type: 'button', onclick: () => { editingId = null; panel.render(); } }, '← All blocks'),
      h('div', { class: 'code-box' },
        h('code', null, marker),
        h('button', { class: 'btn primary', type: 'button', onclick: () => copyText(marker, 'Code copied. In Rise, add a Text block and paste it in.') }, svg('copy'), 'Copy code')),
      h('p', { class: 'howto' }, 'Paste the code into its own Rise text block. Preview and the published course show the ' + def.label.toLowerCase() + ' in its place.'),
      previewBox,
      field('Block name', h('input', { type: 'text', value: comp.name || '', placeholder: def.label, oninput: (e) => { comp.name = e.target.value; saveConfig({ silent: true }); } })),
      formFields(def.fields, comp.data, changed),
      h('div', { class: 'row', style: 'margin-top:14px' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => {
          if (!confirm('Delete “' + (comp.name || def.label) + '”? Its code will stop working in this course.')) return;
          state.config.components = state.config.components.filter((c) => c !== comp);
          editingId = null; saveConfig({ now: true }); panel.render();
        } }, svg('trash'), 'Delete block')),
    ];
  }

  let marksTimer = null;
  function applyMarksSoon() { clearTimeout(marksTimer); marksTimer = setTimeout(applyAll, 500); }

  /** Build form controls from a block type's field schema. */
  function formFields(fields, data, changed) {
    return fields.map((f) => {
      const set = (v) => { data[f.key] = v; changed(); };
      const v = data[f.key];
      switch (f.type) {
        case 'text': return field(f.label, h('input', { type: 'text', value: v || '', placeholder: f.placeholder || '', oninput: (e) => set(e.target.value) }), 'stack');
        case 'textarea': return field(f.label, h('textarea', { value: v || '', rows: 3, oninput: (e) => set(e.target.value) }), 'stack');
        case 'number': return field(f.label, numberInput(v, set, { min: f.min, max: f.max }));
        case 'color': return field(f.label, colorInput(v, set));
        case 'select': return field(f.label, selectInput(v, f.options, set));
        case 'checkbox': return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Boolean(v), onchange: (e) => set(e.target.checked) }), f.label);
        case 'image': return field(f.label, imageInput(v, set), 'stack');
        case 'list': return listField(f, data, changed);
        default: return null;
      }
    });
  }

  function listField(f, data, changed) {
    const items = Array.isArray(data[f.key]) ? data[f.key] : (data[f.key] = []);
    const blank = () => Object.fromEntries(f.fields.map((x) => [x.key, x.type === 'number' ? 50 : '']));
    return h('div', { class: 'listfield' },
      h('div', { class: 'lf-head' }, f.label,
        h('button', { class: 'btn', type: 'button', disabled: items.length >= (f.max || 99), onclick: () => { items.push(blank()); changed(); panel.render(); } }, '+ Add')),
      items.map((it, i) => h('div', { class: 'lf-item' },
        h('div', { class: 'lf-item-head' }, h('span', null, (f.itemLabel || 'Item') + ' ' + (i + 1)),
          h('button', { class: 'icon-btn', type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); changed(); panel.render(); } }, '↑'),
          h('button', { class: 'icon-btn', type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: i === items.length - 1, onclick: () => { items.splice(i + 1, 0, items.splice(i, 1)[0]); changed(); panel.render(); } }, '↓'),
          h('button', { class: 'icon-btn', type: 'button', title: 'Remove', 'aria-label': 'Remove ' + (f.itemLabel || 'item') + ' ' + (i + 1), disabled: items.length <= (f.min || 0), onclick: () => { items.splice(i, 1); changed(); panel.render(); } }, svg('trash'))),
        formFields(f.fields, it, changed))));
  }

  /** Image picker: upload (resized and stored with the block) or a web address. */
  function imageInput(value, onChange) {
    const thumb = h('span', { class: 'thumb', style: value ? "background-image:url('" + String(value).replace(/'/g, '%27') + "')" : '' });
    const url = h('input', { type: 'text', placeholder: 'Upload or paste an image address', value: value && !value.startsWith('data:') ? value : (value ? 'Uploaded image' : ''),
      onchange: (e) => { const v = e.target.value.trim(); if (v === 'Uploaded image') return; onChange(RU.safeUrl(v, 'image')); panel.render(); } });
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { onChange(await shrinkImage(f)); panel.render(); }
      catch (err) { panel.status('That image couldn’t be read. Try a JPG or PNG.', 'error'); }
    } });
    return h('span', { class: 'imgfield' }, thumb, url,
      h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Upload'),
      value ? h('button', { class: 'icon-btn', type: 'button', title: 'Remove image', 'aria-label': 'Remove image', onclick: () => { onChange(''); panel.render(); } }, svg('trash')) : null,
      file);
  }

  /** Resize uploads to at most 1600px so courses stay light. */
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const src = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(src);
        resolve(file.type === 'image/png' || file.type === 'image/gif' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('bad image')); };
      img.src = src;
    });
  }

  // ================================================================ Find tab
  const find = { query: '', replacement: '', matchCase: false, wholeWord: false, results: [] };

  function editableHost(node) {
    for (let e = node.parentElement; e; e = e.parentElement) if (e.isContentEditable && (!e.parentElement || !e.parentElement.isContentEditable)) return e;
    return null;
  }

  function scan() {
    find.results = [];
    if (globalThis.CSS && CSS.highlights) CSS.highlights.delete('riseup-find');
    if (!find.query) return;
    for (const root of contentRoots()) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (panel.host && panel.host.contains(n)) continue;
        if (n.parentElement && n.parentElement.closest('script,style,noscript')) continue;
        for (const start of RU.findMatches(n.nodeValue, find.query, find)) {
          const range = document.createRange();
          range.setStart(n, start);
          range.setEnd(n, start + find.query.length);
          find.results.push({ node: n, start, range, editable: Boolean(editableHost(n)) });
        }
      }
    }
    if (globalThis.CSS && CSS.highlights && typeof Highlight === 'function' && find.results.length) {
      CSS.highlights.set('riseup-find', new Highlight(...find.results.map((r) => r.range)));
    }
  }

  function replaceResult(r) {
    const host = editableHost(r.node);
    if (!host || !r.node.isConnected) return false;
    host.focus();
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(r.range);
    // Go through the editor's own input handling so Rise records and saves the change.
    const ok = document.execCommand('insertText', false, find.replacement);
    host.dispatchEvent(new Event('input', { bubbles: true }));
    return ok;
  }

  function findTab() {
    const run = () => { scan(); panel.render(); };
    const q = h('input', { type: 'text', value: find.query, placeholder: 'Find in this lesson', 'aria-label': 'Find',
      onkeydown: (e) => { if (e.key === 'Enter') { find.query = e.target.value; run(); } } });
    const rep = h('input', { type: 'text', value: find.replacement, placeholder: 'Replace with', 'aria-label': 'Replace with',
      oninput: (e) => { find.replacement = e.target.value; } });
    const editableCount = find.results.filter((r) => r.editable).length;
    return [
      h('div', { class: 'row' }, q, h('button', { class: 'btn', type: 'button', onclick: () => { find.query = q.value; run(); } }, 'Find')),
      h('div', { class: 'row', style: 'margin-top:6px' }, rep,
        h('button', { class: 'btn primary', type: 'button', disabled: !editableCount, onclick: () => {
          find.replacement = rep.value;
          let n = 0;
          for (let i = 0; i < editableCount; i++) {
            const targets = find.results.filter((x) => x.editable);
            if (!targets.length || !replaceResult(targets[targets.length - 1])) break;
            n++;
            if (RU.findMatches(find.replacement, find.query, find).length) {
              for (const r of targets.slice(0, -1).reverse()) if (replaceResult(r)) n++;
              break;
            }
            scan();
          }
          scan(); panel.render();
          panel.status('Replaced ' + n + ' of ' + editableCount + '.', n === editableCount ? 'ok' : 'error');
        } }, 'Replace all')),
      h('div', { class: 'row' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: find.matchCase, onchange: (e) => { find.matchCase = e.target.checked; run(); } }), 'Match case'),
        h('label', { class: 'check', style: 'margin-left:10px' }, h('input', { type: 'checkbox', checked: find.wholeWord, onchange: (e) => { find.wholeWord = e.target.checked; run(); } }), 'Whole words')),
      find.query ? h('p', { class: 'empty' }, find.results.length + ' match' + (find.results.length === 1 ? '' : 'es') +
        (find.results.length > editableCount ? ' · ' + (find.results.length - editableCount) + ' need the block clicked in Rise before replacing' : '')) : null,
      h('ul', { class: 'list' }, find.results.slice(0, 200).map((r) => {
        const t = r.node.nodeValue;
        const a = Math.max(0, r.start - 30);
        const b = Math.min(t.length, r.start + find.query.length + 30);
        return h('li', { class: 'item result', onclick: () => {
            r.node.parentElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
            const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(r.range);
          } },
          h('span', { class: 'grow' }, (a ? '…' : '') + t.slice(a, r.start), h('mark', null, t.slice(r.start, r.start + find.query.length)), t.slice(r.start + find.query.length, b) + (b < t.length ? '…' : '')),
          r.editable ? h('button', { class: 'btn', type: 'button', onclick: (e) => {
            e.stopPropagation(); find.replacement = rep.value;
            const ok = replaceResult(r); scan(); panel.render();
            panel.status(ok ? 'Replaced.' : 'Rise didn’t accept the change. Edit this one by hand.', ok ? 'ok' : 'error');
          } }, 'Replace') : null);
      })),
      h('p', { class: 'empty', style: 'margin-top:14px' }, 'Whole course? ', h('button', { class: 'link', type: 'button', onclick: openTools }, 'Use course-wide find and replace')),
    ];
  }

  // ================================================================ Colors tab
  const colorUi = { current: '#f04f4d', fg: '#2b2b2b', bg: '#ffffff' };

  function remember(hex) {
    const c = RU.normalizeHex(hex);
    if (!c) return;
    state.colors.recent = [c].concat(state.colors.recent.filter((x) => x !== c)).slice(0, 12);
    saveColors();
  }

  async function copyColor(hex) {
    await copyText(hex, 'Copied ' + hex + '. Paste it into any Rise colour field.');
    remember(hex);
  }

  async function pickFromScreen() {
    if (!('EyeDropper' in window)) return panel.status('This browser has no eyedropper. Use Chrome or Edge 95 or later.', 'error');
    try {
      const { sRGBHex } = await new EyeDropper().open();
      colorUi.current = RU.normalizeHex(sRGBHex) || sRGBHex;
      await copyColor(colorUi.current);
      panel.render();
    } catch (e) { /* cancelled with Esc */ }
  }

  function colorsTab() {
    const T = 'colors';
    if (openSection[T] === undefined) openSection[T] = 'palettes';
    const cur = colorUi.current;
    const ratio = RU.contrastRatio(colorUi.fg, colorUi.bg);
    const g = ratio ? RU.wcagGrades(ratio) : null;
    const badge = (ok, label) => h('span', { class: ok ? 'pass' : 'fail' }, (ok ? '✓ ' : '✗ ') + label);
    const swatch = (hex, onRemove) => h('button', { class: 'swatch', type: 'button', title: hex + (onRemove ? ' · right-click to remove' : ''), 'aria-label': hex, style: 'background:' + hex,
      onclick: () => { colorUi.current = hex; copyColor(hex); panel.render(); },
      oncontextmenu: onRemove ? (e) => { e.preventDefault(); onRemove(); } : null });
    return [
      h('div', { class: 'swatch-big', style: 'background:' + cur }),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: pickFromScreen }, 'Pick from screen'),
        h('input', { type: 'color', value: RU.normalizeHex(cur) || '#000000', 'aria-label': 'Colour', oninput: (e) => { colorUi.current = e.target.value; }, onchange: () => panel.render() }),
        h('input', { type: 'text', value: cur, 'aria-label': 'Hex', style: 'width:90px;flex:1', onchange: (e) => { const v = RU.normalizeHex(e.target.value); if (v) { colorUi.current = v; panel.render(); } } }),
        h('button', { class: 'btn', type: 'button', onclick: () => copyColor(colorUi.current) }, 'Copy')),
      state.colors.recent.length ? h('div', { class: 'swatches', style: 'margin:10px 0 14px' }, state.colors.recent.map((c) => swatch(c))) : h('div', { style: 'height:12px' }),
      acc(T, 'palettes', 'Palettes', [
        state.colors.palettes.map((p, pi) => h('div', { style: 'margin-bottom:12px' },
          h('div', { class: 'row' },
            h('input', { type: 'text', value: p.name, 'aria-label': 'Palette name', onchange: (e) => { p.name = e.target.value || 'Palette'; saveColors(); } }),
            h('button', { class: 'btn', type: 'button', onclick: () => { const c = RU.normalizeHex(colorUi.current); if (c && !p.colors.includes(c)) { p.colors.push(c); saveColors(); panel.render(); } } }, '+ Add current'),
            state.colors.palettes.length > 1 ? h('button', { class: 'icon-btn', type: 'button', title: 'Delete palette', 'aria-label': 'Delete palette', onclick: () => { state.colors.palettes.splice(pi, 1); saveColors(); panel.render(); } }, svg('trash')) : null),
          p.colors.length
            ? h('div', { class: 'swatches' }, p.colors.map((c) => swatch(c, () => { p.colors = p.colors.filter((x) => x !== c); saveColors(); panel.render(); })))
            : h('p', { class: 'empty' }, 'Empty. Add the current colour.'))),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.colors.palettes.push({ id: RU.uid('p'), name: 'Palette ' + (state.colors.palettes.length + 1), colors: [] }); saveColors(); panel.render(); } }, '+ New palette'),
      ]),
      acc(T, 'contrast', 'Contrast check', [
        field('Text', colorInput(colorUi.fg, (v) => { if (v) { colorUi.fg = v; panel.render(); } })),
        field('Background', colorInput(colorUi.bg, (v) => { if (v) { colorUi.bg = v; panel.render(); } })),
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { colorUi.fg = colorUi.current; panel.render(); } }, 'Current as text'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { colorUi.bg = colorUi.current; panel.render(); } }, 'Current as background'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { [colorUi.fg, colorUi.bg] = [colorUi.bg, colorUi.fg]; panel.render(); } }, 'Swap')),
        h('div', { class: 'contrast-sample', style: 'color:' + colorUi.fg + ';background:' + colorUi.bg },
          h('div', { class: 'lg' }, 'Large text sample'), h('div', null, 'Body text sample for learners.')),
        ratio ? h('div', null,
          h('div', { class: 'ratio' }, ratio.toFixed(2) + ' : 1'),
          h('div', { class: 'grades' },
            badge(g.normalAA, 'AA body text'), badge(g.normalAAA, 'AAA body text'),
            badge(g.largeAA, 'AA large text'), badge(g.largeAAA, 'AAA large text'),
            badge(g.uiAA, 'AA icons and controls'))) : null,
      ]),
    ];
  }

  // ================================================================ backup
  /** Download every course's RiseUp settings and blocks as one file. */
  async function backupAll() {
    const all = await store.get(null);
    const courses = {};
    for (const [k, v] of Object.entries(all)) if (k.startsWith(RU.COURSE_KEY_PREFIX)) courses[k.slice(RU.COURSE_KEY_PREFIX.length)] = v;
    const file = { riseup: RU.CONFIG_VERSION, kind: 'backup', savedAt: new Date().toISOString(), courses, colors: all[RU.COLORS_KEY] || null };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
    a.download = 'riseup-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    state.lastBackup = Date.now();
    store.set({ 'riseup:lastBackup': state.lastBackup });
    panel.status('Backup downloaded. Keep it somewhere safe; restore it from Publish & tools.', 'ok');
    panel.render();
  }

  function backupDue() {
    const hasWork = state.config.components.length || state.config.textRules.length;
    return hasWork && (!state.lastBackup || Date.now() - state.lastBackup > 3 * 24 * 3600 * 1000);
  }

  // ================================================================ shell
  function openTools() {
    chrome.runtime.sendMessage({ type: 'riseup:openTools', courseId: state.courseId });
  }

  async function loadUiFont() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'riseup:uiFonts' });
      if (!res || !res.ok) return;
      for (const f of res.faces) {
        const face = new FontFace('RiseUp Poppins', RU.fromBase64(f.data), { weight: f.weight });
        await face.load();
        document.fonts.add(face);
      }
    } catch (e) { /* falls back to system fonts */ }
  }

  function buildPanel() {
    const host = document.createElement('riseup-panel');
    host.setAttribute('data-riseup-ignore', '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = RU.PANEL_CSS;
    const previewStyle = document.createElement('style'); // block and text-style CSS for previews in the panel
    const wrap = h('div', { class: 'ru' });
    const chipLayer = h('div', { class: 'ru' });
    shadow.append(style, previewStyle, chipLayer, wrap);
    document.documentElement.appendChild(host);
    panel.host = host;

    // Previews use the course's Rise theme colour unless an accent is set, like the runtime does.
    function courseAccent() {
      const probe = document.querySelector('.brand--background, .brand--ui, [class*="brand--background"]');
      const c = probe && getComputedStyle(probe).backgroundColor;
      const m = c && c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return '';
      return RU.toHex({ r: +m[1], g: +m[2], b: +m[3] });
    }
    panel.refreshPreviewCss = () => {
      const theme = Object.assign({}, state.config.componentTheme);
      if (!theme.accent && theme.matchCourse !== false) theme.accent = courseAccent();
      previewStyle.textContent = RU.COMPONENT_CSS + '\n' + RU.themeCss(theme) +
        '\n' + state.config.textStyles.map(RU.textStyleCss).join('\n');
    };
    panel.refreshPreviewCss();

    let open = false;
    let tab = 'styles';
    let statusMsg = { text: '', kind: '' };
    const TABS = [['styles', 'Styles', stylesTab], ['text', 'Text', textTab], ['blocks', 'Blocks', blocksTab], ['find', 'Find', findTab], ['colors', 'Colours', colorsTab]];

    panel.status = (text, kind) => {
      statusMsg = { text, kind: kind || '' };
      const el = shadow.querySelector('.status');
      if (el) { el.textContent = text; el.className = 'status ' + statusMsg.kind; }
    };

    panel.openBlock = (id) => {
      open = true; tab = 'blocks'; editingId = component(id) ? id : null;
      panel.render();
    };

    // ---------- position: launcher is draggable; the panel opens beside it
    const launcher = h('button', { class: 'launcher', type: 'button', 'aria-expanded': 'false', title: 'RiseUp · drag to move' },
      h('span', { class: 'mark' }, svg('up')), 'RiseUp');
    let panelEl = null;

    function launcherPos() {
      const w = launcher.offsetWidth || 110;
      const hgt = launcher.offsetHeight || 42;
      const fx = state.ui.x === null || state.ui.x === undefined ? 1 : state.ui.x;
      const fy = state.ui.y === null || state.ui.y === undefined ? 1 : state.ui.y;
      const m = 16;
      return { x: m + fx * Math.max(0, innerWidth - w - 2 * m), y: m + fy * Math.max(0, innerHeight - hgt - 2 * m), w, h: hgt };
    }

    panel.place = () => {
      const p = launcherPos();
      launcher.style.left = p.x + 'px';
      launcher.style.top = p.y + 'px';
      if (!panelEl) return;
      const pw = panelEl.offsetWidth;
      const ph = panelEl.offsetHeight;
      const m = 12;
      let left = p.x + p.w / 2 > innerWidth / 2 ? p.x + p.w - pw : p.x;
      let top = p.y + p.h / 2 > innerHeight / 2 ? p.y - ph - 10 : p.y + p.h + 10;
      left = Math.min(Math.max(m, left), innerWidth - pw - m);
      top = Math.min(Math.max(m, top), innerHeight - ph - m);
      panelEl.style.left = left + 'px';
      panelEl.style.top = top + 'px';
    };

    function startDrag(e, onClick) {
      if (e.button !== 0) return;
      const start = { x: e.clientX, y: e.clientY };
      const origin = launcherPos();
      let moved = false;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true;
        panel.dragging = true;
        launcher.classList.add('dragging');
        const m = 16;
        state.ui.x = Math.min(1, Math.max(0, (origin.x + dx - m) / Math.max(1, innerWidth - origin.w - 2 * m)));
        state.ui.y = Math.min(1, Math.max(0, (origin.y + dy - m) / Math.max(1, innerHeight - origin.h - 2 * m)));
        panel.place();
      };
      const up = () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
        launcher.classList.remove('dragging');
        if (moved) store.set({ 'riseup:ui': { x: state.ui.x, y: state.ui.y } });
        setTimeout(() => { panel.dragging = false; }, 0);
        if (!moved && onClick) onClick();
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    }

    launcher.addEventListener('pointerdown', (e) => startDrag(e, () => { open = !open; panel.render(); }));
    launcher.addEventListener('click', (e) => { if (e.detail === 0) { open = !open; panel.render(); } }); // keyboard
    addEventListener('resize', () => panel.place());

    // ---------- chips beside block codes in the editor
    let chipMarkers = [];
    panel.chips = (markers) => { chipMarkers = markers; positionChips(); };
    function positionChips() {
      const chips = chipMarkers.map((m) => {
        const comp = component(m.id);
        const rects = m.range.getClientRects();
        const r = rects[rects.length - 1];
        if (!r || r.bottom < 0 || r.top > innerHeight) return null;
        const chip = h('button', { class: 'chip' + (comp ? '' : ' unknown'), type: 'button', style: 'left:' + Math.min(innerWidth - 220, r.right + 8) + 'px;top:' + (r.top + r.height / 2 - 13) + 'px',
          title: comp ? 'Edit this RiseUp block' : 'This code doesn’t match a block in this course',
          onclick: () => comp ? panel.openBlock(comp.id) : panel.status('No block with code ' + m.id + ' in this course. Was it copied from another course?', 'error') },
          h('span', { class: 'mark' }, svg('pen')), comp ? (comp.name || RU.TYPES[comp.type].label) : 'Unknown block');
        return chip;
      }).filter(Boolean);
      chipLayer.replaceChildren(...chips);
    }
    let chipFrame = 0;
    const chipSoon = () => { if (!chipFrame) chipFrame = requestAnimationFrame(() => { chipFrame = 0; positionChips(); }); };
    addEventListener('scroll', chipSoon, true);
    addEventListener('resize', chipSoon);

    // ---------- render
    panel.render = (fromStorage) => {
      const bodyEl = shadow.querySelector('.body');
      const scrollTop = bodyEl ? bodyEl.scrollTop : 0;
      const active = shadow.activeElement;
      // A storage echo of the user's own typing must not rebuild the field they're in.
      if (fromStorage === true && active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && active.type !== 'checkbox') return;
      launcher.setAttribute('aria-expanded', String(open));
      const parts = [];
      if (state.settings.showLauncher !== false) parts.push(launcher);
      panelEl = null;
      if (open) {
        const current = TABS.find((t) => t[0] === tab);
        const head = h('div', { class: 'head', title: 'Drag to move' },
          h('span', { class: 'mark' }, svg('up')),
          h('div', { class: 'titles' }, h('h1', null, 'RiseUp'), h('span', { class: 'course', title: state.courseId }, state.config.courseTitle || courseTitleGuess() || 'This course')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', title: 'Close', onclick: () => { open = false; panel.render(); } }, svg('close')));
        head.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) startDrag(e); });
        panelEl = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'RiseUp' },
          head,
          h('nav', { class: 'tabs', role: 'tablist' }, TABS.map(([id, label]) =>
            h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(id === tab), onclick: () => { tab = id; statusMsg = { text: '', kind: '' }; panel.render(); } }, svg(id), label))),
          h('div', { class: 'body', role: 'tabpanel' },
            !state.settings.enabled ? h('p', { class: 'lead' }, 'RiseUp is switched off, so nothing is applied to the course.') : null,
            current[2](), h('p', { class: 'status ' + statusMsg.kind, role: 'status' }, statusMsg.text)),
          h('div', { class: 'foot' },
            h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: state.settings.enabled, 'aria-label': 'Apply RiseUp',
              onchange: (e) => { state.settings.enabled = e.target.checked; store.set({ 'riseup:settings': state.settings }); } }), state.settings.enabled ? 'On' : 'Off'),
            h('span', { class: 'row', style: 'flex-wrap:nowrap' },
              h('button', { class: 'btn' + (backupDue() ? ' primary' : ''), type: 'button', title: 'Download a backup of all your RiseUp work', onclick: backupAll }, 'Back up'),
              h('button', { class: 'btn', type: 'button', onclick: openTools }, 'Publish & tools'))));
        parts.push(panelEl);
      }
      wrap.replaceChildren(...parts);
      panel.place();
      const body = shadow.querySelector('.body');
      if (body) body.scrollTop = scrollTop;
    };

    shadow.addEventListener('focusout', () => setTimeout(() => { if (!shadow.activeElement) panel.render(true); }, 0));
    shadow.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { open = false; panel.render(); launcher.focus(); } });
    panel.render();
    applyMarks(); // draw chips now that the layer exists
  }

  // ================================================================ start
  async function start() {
    await load();
    if (IS_TOP && state.courseId !== 'default') store.set({ 'riseup:activeCourse': state.courseId });
    if (IS_TOP) { loadUiFont(); buildPanel(); }
    applyAll();
    if (IS_TOP) {
      let lastHref = location.href;
      setInterval(async () => {
        if (location.href === lastHref) return;
        lastHref = location.href;
        const id = RU.courseIdFromUrl(location.href);
        if (id !== state.courseId) {
          state.courseId = id;
          if (id !== 'default') store.set({ 'riseup:activeCourse': id });
          editingId = null;
          await load();
          applyAll();
          panel.render();
        }
      }, 1000);
    }
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
