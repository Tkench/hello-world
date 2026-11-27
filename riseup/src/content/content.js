/*
 * RiseUp content script. Runs on rise.articulate.com (top page and frames):
 *  - applies the course's RiseUp styling, fonts and text rules live;
 *  - in the top page, shows the RiseUp panel (Styles, Text, Find, Colors).
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
  };

  // ---------------------------------------------------------------- storage
  const courseKey = () => RU.COURSE_KEY_PREFIX + state.courseId;

  async function load() {
    if (state.courseId === 'default' && !IS_TOP) {
      // Preview frames may not carry the course id; use the one the editor page last reported.
      const { 'riseup:activeCourse': active } = await store.get('riseup:activeCourse');
      if (active) state.courseId = active;
    }
    const got = await store.get([courseKey(), RU.COLORS_KEY, 'riseup:settings']);
    state.config = RU.normalizeCourseConfig(got[courseKey()]);
    state.colors = Object.assign(RU.defaultColors(), got[RU.COLORS_KEY] || {});
    state.settings = Object.assign(state.settings, got['riseup:settings'] || {});
  }

  let saveTimer = null;
  function saveConfig() {
    clearTimeout(saveTimer);
    if (IS_TOP && !state.config.courseTitle) state.config.courseTitle = courseTitleGuess();
    saveTimer = setTimeout(() => store.set({ [courseKey()]: state.config }), 250);
    applyAll();
  }
  function saveColors() {
    store.set({ [RU.COLORS_KEY]: state.colors });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[courseKey()]) {
      state.config = RU.normalizeCourseConfig(changes[courseKey()].newValue);
      applyAll();
      if (panel.render) panel.render(true);
    }
    if (changes[RU.COLORS_KEY]) {
      state.colors = Object.assign(RU.defaultColors(), changes[RU.COLORS_KEY].newValue || {});
      if (panel.render) panel.render(true);
    }
    if (changes['riseup:settings']) {
      state.settings = Object.assign(state.settings, changes['riseup:settings'].newValue || {});
      applyAll();
      if (panel.render) panel.render(true);
    }
  });

  function courseTitleGuess() {
    return (document.title || '').replace(/\s*[|\-–]\s*Rise.*$/i, '').trim();
  }

  // ---------------------------------------------------------------- styling
  const STYLE_ID = 'riseup-style';
  let loadedFontKey = '';
  const fontFaces = [];

  function highlightCss() {
    if (!(globalThis.CSS && CSS.highlights)) return '';
    // ::highlight only supports colour, background and decoration, so the editor
    // shows a marker; the full style shows in Rise's preview and the published course.
    return state.config.textStyles.map((s) => {
      const c = RU.safeColor(s.color) || RU.safeColor(s.gradientFrom) || '#5b3df5';
      return '::highlight(ru-hl-' + s.id.replace(/[^A-Za-z0-9_-]/g, '') + ') { text-decoration: underline dotted 2px ' + c + '; text-underline-offset: 3px; }';
    }).join('\n') + '\n::highlight(riseup-find) { background-color: #ffe27a; color: #1d2330; }';
  }

  function applyCss() {
    let el = document.getElementById(STYLE_ID);
    if (!state.settings.enabled) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = RU.buildCss(state.config) + highlightCss();
  }

  async function applyFonts() {
    const key = state.settings.enabled ? RU.googleFontsUrl(state.config.fonts) : '';
    if (key === loadedFontKey) return;
    loadedFontKey = key;
    fontFaces.splice(0).forEach((f) => document.fonts.delete(f));
    if (!key) return;
    const res = await chrome.runtime.sendMessage({ type: 'riseup:fetchFonts', fonts: state.config.fonts }).catch((e) => ({ ok: false, error: e.message }));
    if (!res || !res.ok) {
      panel.status && panel.status('Fonts could not be loaded: ' + ((res && res.error) || 'no response'), 'error');
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
    // Keep only outermost blocks so text isn't visited twice.
    const outer = blocks.filter((b) => !blocks.some((o) => o !== b && o.contains(b)));
    return outer.length ? outer : [document.body];
  }

  /**
   * In the editor RiseUp must never change Rise's DOM (Rise could save the
   * extra markup, or its own rendering could break), so phrases are only
   * marked with CSS highlights there. Previews and review pages get the real
   * styling by wrapping phrases in spans, as published courses do.
   */
  function isEditorPage() {
    return /\/author(ing)?\//.test(location.href) || Boolean(document.querySelector('[contenteditable=""], [contenteditable="true"]'));
  }

  function clearHighlights() {
    if (!(globalThis.CSS && CSS.highlights)) return;
    for (const name of Array.from(CSS.highlights.keys())) if (name.startsWith('ru-hl-')) CSS.highlights.delete(name);
  }

  function applyTextRules(full) {
    if (!document.body) return;
    observer.disconnect();
    try {
      if (full) RU.unwrapTextRules(document.body);
      clearHighlights();
      if (!state.settings.enabled) return;
      const { textRules, textStyles } = state.config;
      if (!textRules.length) return;
      const editor = isEditorPage();
      for (const root of contentRoots()) {
        if (!editor) {
          RU.wrapTextRules(root, textRules, textStyles, { skipEditable: true });
          continue;
        }
        if (!(globalThis.CSS && CSS.highlights && typeof Highlight === 'function')) continue;
        for (const [styleId, ranges] of Object.entries(RU.collectRanges(root, textRules, textStyles))) {
          const name = 'ru-hl-' + styleId.replace(/[^A-Za-z0-9_-]/g, '');
          const hl = CSS.highlights.get(name) || new Highlight();
          ranges.forEach((r) => hl.add(r));
          CSS.highlights.set(name, hl);
        }
      }
    } finally {
      observe();
    }
  }

  let ruleTimer = null;
  const observer = new MutationObserver((records) => {
    if (records.every((r) => panel.host && panel.host.contains(r.target))) return;
    clearTimeout(ruleTimer);
    ruleTimer = setTimeout(() => applyTextRules(false), 300);
  });
  function observe() {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function applyAll() {
    applyCss();
    applyFonts();
    applyTextRules(true);
    if (panel.refreshStyleCss) panel.refreshStyleCss();
  }

  // ---------------------------------------------------------------- selection tracking
  let lastSelection = '';
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (text) lastSelection = text;
  });

  // ---------------------------------------------------------------- panel
  const panel = {};

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
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    if (value !== undefined) {
      if (tag === 'input') el.setAttribute('value', value);
      el.value = value;
    }
    return el;
  }

  function field(label, input) {
    return h('label', { class: 'field' }, h('span', null, label), input);
  }

  function numberInput(value, onChange, opts) {
    return h('input', Object.assign({ type: 'number', value: value === null || value === undefined ? '' : value, placeholder: 'Rise default',
      oninput: (e) => onChange(e.target.value === '' ? null : Number(e.target.value)) }, opts || {}));
  }

  function selectInput(value, options, onChange) {
    return h('select', { onchange: (e) => onChange(e.target.value) },
      options.map(([v, label]) => h('option', { value: v, selected: String(value) === String(v) }, label)));
  }

  function colorInput(value, onChange) {
    const text = h('input', { type: 'text', value: value || '', placeholder: '#hex', style: 'width:90px',
      onchange: (e) => { const v = RU.normalizeHex(e.target.value) || ''; e.target.value = v; picker.value = v || '#000000'; picker.className = v ? '' : 'unset'; onChange(v); } });
    const picker = h('input', { type: 'color', value: RU.normalizeHex(value) || '#000000', class: value ? '' : 'unset', 'aria-label': 'Pick colour',
      oninput: (e) => { text.value = e.target.value; picker.className = ''; onChange(e.target.value); } });
    const clear = h('button', { class: 'link', type: 'button', title: 'Clear', onclick: () => { text.value = ''; picker.className = 'unset'; onChange(''); } }, 'clear');
    return h('span', { class: 'row' }, picker, text, clear);
  }

  const TRANSFORM_OPTS = [['', 'Rise default'], ['none', 'None'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase'], ['capitalize', 'Capitalize']];
  const WEIGHT_OPTS = [['', 'Rise default'], ['300', 'Light 300'], ['400', 'Regular 400'], ['500', 'Medium 500'], ['600', 'Semibold 600'], ['700', 'Bold 700'], ['800', 'Extra bold 800'], ['900', 'Black 900']];

  // ----- Styles tab
  function stylesTab() {
    const gs = state.config.globalStyles;
    const set = (k) => (v) => { gs[k] = v; saveConfig(); };
    return [
      h('p', { class: 'hint' }, 'Course-wide styling Rise has no setting for. Fonts, colours, block backgrounds and padding stay in Rise’s Theme and Block Defaults.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: gs.enabled !== false, onchange: (e) => set('enabled')(e.target.checked) }), 'Use these styles in this course'),
      h('section', null, h('h2', null, 'Blocks'),
        field('Corner radius (px)', numberInput(gs.blockRadius, set('blockRadius'), { min: 0, max: 64 })),
        field('Shadow', selectInput(gs.blockShadow, [['none', 'None'], ['soft', 'Soft'], ['medium', 'Medium'], ['strong', 'Strong']], set('blockShadow'))),
        field('Image corner radius (px)', numberInput(gs.imageRadius, set('imageRadius'), { min: 0, max: 64 }))),
      h('section', null, h('h2', null, 'Buttons'),
        field('Corner radius (px)', numberInput(gs.buttonRadius, set('buttonRadius'), { min: 0, max: 64 })),
        field('Letter case', selectInput(gs.buttonTextTransform, TRANSFORM_OPTS, set('buttonTextTransform'))),
        field('Weight', selectInput(gs.buttonFontWeight, WEIGHT_OPTS, set('buttonFontWeight')))),
      h('section', null, h('h2', null, 'Headings'),
        field('Letter case', selectInput(gs.headingTextTransform, TRANSFORM_OPTS, set('headingTextTransform'))),
        field('Weight', selectInput(gs.headingFontWeight, WEIGHT_OPTS, set('headingFontWeight')))),
      h('section', null, h('h2', null, 'Links'),
        field('Colour', colorInput(gs.linkColor, set('linkColor'))),
        field('Underline', selectInput(gs.linkUnderline, [['', 'Rise default'], ['always', 'Always'], ['hover', 'On hover'], ['none', 'Never']], set('linkUnderline')))),
      h('section', null, h('h2', null, 'Custom CSS'),
        h('p', { class: 'hint' }, 'Added after the settings above, in the editor and in the published course.'),
        h('textarea', { spellcheck: false, value: gs.customCss || '', oninput: (e) => set('customCss')(e.target.value) })),
    ];
  }

  // ----- Text tab
  let selectedStyleId = null;

  function textTab() {
    const cfg = state.config;
    const fontNames = cfg.fonts.map((f) => f.family);
    const fontInput = h('input', { type: 'text', placeholder: 'Google Fonts family, e.g. Lora', list: 'riseup-font-list' });
    const addFont = () => {
      const family = RU.safeFamily(fontInput.value);
      if (!family) return panel.status('Type a font name exactly as it appears on fonts.google.com.', 'error');
      if (!fontNames.includes(family)) cfg.fonts.push({ family, weights: [400, 700], italic: true });
      fontInput.value = '';
      saveConfig();
      panel.render();
    };

    const style = cfg.textStyles.find((s) => s.id === selectedStyleId) || null;
    const newStyle = () => {
      const s = { id: RU.uid('s'), name: 'Style ' + (cfg.textStyles.length + 1), fontFamily: fontNames[0] || '', fontWeight: '', italic: false,
        textTransform: '', letterSpacing: null, color: '', gradientFrom: '', gradientTo: '', gradientAngle: 90, shadow: '', smallCaps: false, highlight: '' };
      cfg.textStyles.push(s);
      selectedStyleId = s.id;
      saveConfig();
      panel.render();
    };

    const applyToSelection = () => {
      if (!style) return panel.status('Choose or create a style first.', 'error');
      const text = lastSelection;
      if (!text) return panel.status('Select some text in the course first, then press Apply.', 'error');
      if (text.length > 300) return panel.status('Select a shorter phrase (300 characters or fewer).', 'error');
      cfg.textRules = cfg.textRules.filter((r) => r.text !== text);
      cfg.textRules.push({ id: RU.uid('r'), text, styleId: style.id, matchCase: true, wholeWord: false });
      saveConfig();
      panel.render();
      panel.status('“' + text.slice(0, 40) + (text.length > 40 ? '…' : '') + '” now uses ' + style.name + '.', 'ok');
    };

    return [
      h('p', { class: 'hint' }, 'Rise applies one heading font and one body font to whole blocks. Use these styles on any word or phrase.'),
      h('section', null, h('h2', null, 'Fonts'),
        h('div', { class: 'row' }, fontInput, h('button', { class: 'btn', type: 'button', onclick: addFont }, 'Add')),
        h('datalist', { id: 'riseup-font-list' }, RU.SUGGESTED_FONTS.map((f) => h('option', { value: f }))),
        fontNames.length
          ? h('ul', { class: 'list' }, cfg.fonts.map((f, i) => h('li', null,
              h('span', { class: 'grow', style: "font-family:'" + f.family + "'" }, f.family),
              h('button', { class: 'x', type: 'button', title: 'Remove font', 'aria-label': 'Remove ' + f.family, onclick: () => { cfg.fonts.splice(i, 1); saveConfig(); panel.render(); } }, '×'))))
          : h('p', { class: 'empty' }, 'No fonts added yet.')),
      h('section', null, h('h2', null, 'Text styles'),
        cfg.textStyles.length
          ? h('ul', { class: 'list' }, cfg.textStyles.map((s) => h('li', { class: s.id === selectedStyleId ? 'selected' : '' },
              h('button', { class: 'link grow', type: 'button', style: 'text-align:left', onclick: () => { selectedStyleId = s.id; panel.render(); } }, s.name),
              h('button', { class: 'x', type: 'button', 'aria-label': 'Delete ' + s.name, title: 'Delete style', onclick: () => {
                cfg.textStyles = cfg.textStyles.filter((x) => x.id !== s.id);
                cfg.textRules = cfg.textRules.filter((r) => r.styleId !== s.id);
                if (selectedStyleId === s.id) selectedStyleId = null;
                saveConfig(); panel.render();
              } }, '×'))))
          : h('p', { class: 'empty' }, 'No text styles yet.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: newStyle }, 'New style'),
          h('button', { class: 'btn primary', type: 'button', disabled: !style, onclick: applyToSelection }, 'Apply to selected text')),
        style ? styleEditor(style, fontNames) : null),
      h('section', null, h('h2', null, 'Styled phrases'),
        cfg.textRules.length
          ? h('ul', { class: 'list' }, cfg.textRules.map((r) => {
              const s = cfg.textStyles.find((x) => x.id === r.styleId);
              return h('li', null,
                h('span', { class: 'grow', title: r.text }, '“' + r.text + '” → ' + (s ? s.name : '?')),
                h('label', { class: 'check', title: 'Match case' }, h('input', { type: 'checkbox', checked: r.matchCase, onchange: (e) => { r.matchCase = e.target.checked; saveConfig(); } }), 'Aa'),
                h('button', { class: 'x', type: 'button', 'aria-label': 'Remove', title: 'Remove', onclick: () => { cfg.textRules = cfg.textRules.filter((x) => x !== r); saveConfig(); panel.render(); } }, '×'));
            }))
          : h('p', { class: 'empty' }, 'Select text in the course and press “Apply to selected text”.'),
        h('p', { class: 'hint' }, 'Every occurrence of a phrase is styled. In the editor it’s marked with a dotted underline; the full style shows in Rise’s Preview and the published course.')),
    ];
  }

  function styleEditor(s, fontNames) {
    // saveConfig re-applies CSS, which also refreshes the sample (it uses the style's class).
    const set = (k, rerender) => (v) => { s[k] = v; saveConfig(); if (rerender) panel.render(); };
    const sample = h('div', { class: 'sample' }, h('span', { class: RU.styleClass(s.id) }, 'The quick brown fox'));
    return h('div', { class: 'editor' },
      field('Name', h('input', { type: 'text', value: s.name, onchange: (e) => set('name', true)(e.target.value || 'Untitled') })),
      field('Font', selectInput(s.fontFamily, [['', 'Inherit']].concat(fontNames.map((f) => [f, f])), set('fontFamily'))),
      field('Weight', selectInput(s.fontWeight, WEIGHT_OPTS.map(([v, l]) => [v, v ? l : 'Inherit']), set('fontWeight'))),
      field('Letter case', selectInput(s.textTransform, TRANSFORM_OPTS.map(([v, l]) => [v, v ? l : 'Inherit']), set('textTransform'))),
      field('Letter spacing (em)', numberInput(s.letterSpacing, set('letterSpacing'), { step: 0.01, min: -0.2, max: 1, placeholder: 'Inherit' })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.italic, onchange: (e) => set('italic')(e.target.checked) }), 'Italic'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.smallCaps, onchange: (e) => set('smallCaps')(e.target.checked) }), 'Small caps'),
      field('Colour', colorInput(s.color, set('color'))),
      field('Highlight', colorInput(s.highlight, set('highlight'))),
      field('Gradient from', colorInput(s.gradientFrom, set('gradientFrom'))),
      field('Gradient to', colorInput(s.gradientTo, set('gradientTo'))),
      field('Gradient angle (°)', numberInput(s.gradientAngle, set('gradientAngle'), { min: 0, max: 360, placeholder: '90' })),
      field('Shadow', selectInput(s.shadow, [['', 'None'], ['soft', 'Soft'], ['strong', 'Strong'], ['glow', 'Glow']], set('shadow'))),
      sample);
  }

  // ----- Find tab
  const find = { query: '', replacement: '', matchCase: false, wholeWord: false, results: [] };

  function editableHost(node) {
    for (let e = node.parentElement; e; e = e.parentElement) if (e.isContentEditable && (!e.parentElement || !e.parentElement.isContentEditable)) return e;
    return null;
  }

  function scan() {
    find.results = [];
    if (globalThis.CSS && CSS.highlights) CSS.highlights.delete('riseup-find');
    if (!find.query) return;
    const roots = contentRoots();
    for (const root of roots) {
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
      h('p', { class: 'hint' }, 'Searches the lesson that’s open. For the whole course, use course-wide find and replace in RiseUp tools.'),
      h('div', { class: 'row' }, q, h('button', { class: 'btn', type: 'button', onclick: () => { find.query = q.value; run(); } }, 'Find')),
      h('div', { class: 'row', style: 'margin-top:6px' }, rep,
        h('button', { class: 'btn primary', type: 'button', disabled: !editableCount, onclick: () => {
          find.replacement = rep.value;
          let n = 0;
          // Editors may rebuild text nodes after each edit, so re-scan between replacements,
          // always taking the last match so earlier positions stay put.
          for (let i = 0; i < editableCount; i++) {
            const targets = find.results.filter((x) => x.editable);
            if (!targets.length || !replaceResult(targets[targets.length - 1])) break;
            n++;
            if (RU.findMatches(find.replacement, find.query, find).length) {
              // The replacement contains the search text: re-scanning would find it again.
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
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: find.wholeWord, onchange: (e) => { find.wholeWord = e.target.checked; run(); } }), 'Whole words')),
      find.query ? h('p', { class: 'hint' }, find.results.length + ' match' + (find.results.length === 1 ? '' : 'es') +
        (find.results.length > editableCount ? ' (' + (find.results.length - editableCount) + ' not editable here: click the block in Rise to edit it, then search again)' : '')) : null,
      h('ul', { class: 'list' }, find.results.slice(0, 200).map((r) => {
        const t = r.node.nodeValue;
        const a = Math.max(0, r.start - 30);
        const b = Math.min(t.length, r.start + find.query.length + 30);
        return h('li', { class: 'result', onclick: () => {
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
      h('button', { class: 'link', type: 'button', onclick: openTools }, 'Course-wide find and replace (XLIFF) →'),
    ];
  }

  // ----- Colors tab
  const colorUi = { current: '#5b3df5', fg: '#1d2330', bg: '#ffffff' };

  function remember(hex) {
    const c = RU.normalizeHex(hex);
    if (!c) return;
    state.colors.recent = [c].concat(state.colors.recent.filter((x) => x !== c)).slice(0, 12);
    saveColors();
  }

  async function copy(hex) {
    try { await navigator.clipboard.writeText(hex); panel.status('Copied ' + hex + '. Paste it into any Rise colour field.', 'ok'); }
    catch (e) { panel.status(hex + ' (copying was blocked; select and copy it from the box above).', 'error'); }
    remember(hex);
  }

  async function pickFromScreen() {
    if (!('EyeDropper' in window)) return panel.status('This browser has no eyedropper. Use Chrome or Edge 95 or later.', 'error');
    try {
      const { sRGBHex } = await new EyeDropper().open();
      colorUi.current = RU.normalizeHex(sRGBHex) || sRGBHex;
      await copy(colorUi.current);
      panel.render();
    } catch (e) { /* cancelled with Esc */ }
  }

  function colorsTab() {
    const cur = colorUi.current;
    const ratio = RU.contrastRatio(colorUi.fg, colorUi.bg);
    const g = ratio ? RU.wcagGrades(ratio) : null;
    const badge = (ok, label) => h('span', { class: ok ? 'pass' : 'fail' }, (ok ? '✓ ' : '✗ ') + label);
    const swatch = (hex, onRemove) => h('button', { class: 'swatch', type: 'button', title: hex + (onRemove ? ' (right-click to remove)' : ''), 'aria-label': hex, style: 'background:' + hex,
      onclick: () => { colorUi.current = hex; copy(hex); panel.render(); },
      oncontextmenu: onRemove ? (e) => { e.preventDefault(); onRemove(); } : null });
    return [
      h('p', { class: 'hint' }, 'Pick colours from anywhere on screen, keep palettes, and check contrast. Rise’s colour fields take the hex codes.'),
      h('section', null, h('h2', null, 'Colour'),
        h('div', { class: 'big-swatch', style: 'background:' + cur }),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', type: 'button', onclick: pickFromScreen }, 'Pick from screen'),
          h('input', { type: 'color', value: RU.normalizeHex(cur) || '#000000', 'aria-label': 'Colour', oninput: (e) => { colorUi.current = e.target.value; } , onchange: () => panel.render() }),
          h('input', { type: 'text', value: cur, 'aria-label': 'Hex', onchange: (e) => { const v = RU.normalizeHex(e.target.value); if (v) { colorUi.current = v; panel.render(); } } }),
          h('button', { class: 'btn', type: 'button', onclick: () => copy(colorUi.current) }, 'Copy'))),
      state.colors.recent.length ? h('section', null, h('h2', null, 'Recent'), h('div', { class: 'swatches' }, state.colors.recent.map((c) => swatch(c)))) : null,
      h('section', null, h('h2', null, 'Palettes'),
        state.colors.palettes.map((p, pi) => h('div', { style: 'margin-bottom:10px' },
          h('div', { class: 'row' },
            h('input', { type: 'text', value: p.name, 'aria-label': 'Palette name', onchange: (e) => { p.name = e.target.value || 'Palette'; saveColors(); } }),
            h('button', { class: 'btn', type: 'button', onclick: () => { const c = RU.normalizeHex(colorUi.current); if (c && !p.colors.includes(c)) { p.colors.push(c); saveColors(); panel.render(); } } }, '+ Add current'),
            state.colors.palettes.length > 1 ? h('button', { class: 'btn danger', type: 'button', onclick: () => { state.colors.palettes.splice(pi, 1); saveColors(); panel.render(); } }, 'Delete') : null),
          p.colors.length
            ? h('div', { class: 'swatches' }, p.colors.map((c) => swatch(c, () => { p.colors = p.colors.filter((x) => x !== c); saveColors(); panel.render(); })))
            : h('p', { class: 'empty' }, 'Empty. Add the current colour.'))),
        h('button', { class: 'btn', type: 'button', onclick: () => { state.colors.palettes.push({ id: RU.uid('p'), name: 'Palette ' + (state.colors.palettes.length + 1), colors: [] }); saveColors(); panel.render(); } }, 'New palette')),
      h('section', null, h('h2', null, 'Contrast check (WCAG 2)'),
        field('Text', colorInput(colorUi.fg, (v) => { if (v) { colorUi.fg = v; panel.render(); } })),
        field('Background', colorInput(colorUi.bg, (v) => { if (v) { colorUi.bg = v; panel.render(); } })),
        h('div', { class: 'row' },
          h('button', { class: 'link', type: 'button', onclick: () => { colorUi.fg = colorUi.current; panel.render(); } }, 'Use current as text'),
          h('button', { class: 'link', type: 'button', onclick: () => { colorUi.bg = colorUi.current; panel.render(); } }, 'Use current as background'),
          h('button', { class: 'link', type: 'button', onclick: () => { [colorUi.fg, colorUi.bg] = [colorUi.bg, colorUi.fg]; panel.render(); } }, 'Swap')),
        h('div', { class: 'contrast-sample', style: 'color:' + colorUi.fg + ';background:' + colorUi.bg },
          h('div', { class: 'lg' }, 'Large text sample'), h('div', null, 'Body text sample for learners.')),
        ratio ? h('div', null,
          h('div', { class: 'ratio' }, ratio.toFixed(2) + ' : 1'),
          h('div', { class: 'grades' },
            badge(g.normalAA, 'AA body text (4.5)'), badge(g.normalAAA, 'AAA body text (7)'),
            badge(g.largeAA, 'AA large text (3)'), badge(g.largeAAA, 'AAA large text (4.5)'),
            badge(g.uiAA, 'AA icons and controls (3)'))) : null),
    ];
  }

  // ----- shell
  function openTools() {
    chrome.runtime.sendMessage({ type: 'riseup:openTools', courseId: state.courseId });
  }

  function buildPanel() {
    const host = document.createElement('riseup-panel');
    host.setAttribute('data-riseup-ignore', '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = RU.PANEL_CSS;
    const sampleStyle = document.createElement('style'); // text styles, for the preview sample
    const wrap = h('div', { class: 'ru' });
    shadow.append(style, sampleStyle, wrap);
    panel.refreshStyleCss = () => {
      sampleStyle.textContent = state.config.textStyles.map(RU.textStyleCss).join('\n');
    };
    panel.refreshStyleCss();
    document.documentElement.appendChild(host);
    panel.host = host;

    let open = false;
    let tab = 'styles';
    let statusMsg = { text: '', kind: '' };
    const TABS = [['styles', 'Styles', stylesTab], ['text', 'Text', textTab], ['find', 'Find', findTab], ['colors', 'Colors', colorsTab]];

    panel.status = (text, kind) => {
      statusMsg = { text, kind: kind || '' };
      const el = shadow.querySelector('.status');
      if (el) { el.textContent = text; el.className = 'status ' + statusMsg.kind; }
    };

    panel.render = (fromStorage) => {
      const scrollTop = shadow.querySelector('.body') ? shadow.querySelector('.body').scrollTop : 0;
      const active = shadow.activeElement;
      // A storage echo of the user's own typing must not rebuild the field they're in.
      if (fromStorage === true && active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && active.type !== 'checkbox') return;
      wrap.replaceChildren();
      if (state.settings.showLauncher === false) return;
      wrap.append(h('button', { class: 'launcher', type: 'button', 'aria-expanded': String(open), onclick: () => { open = !open; panel.render(); } }, '▲ RiseUp'));
      if (!open) return;
      const current = TABS.find((t) => t[0] === tab);
      wrap.append(h('div', { class: 'panel', role: 'dialog', 'aria-label': 'RiseUp' },
        h('header', null,
          h('h1', null, 'RiseUp'),
          h('span', { class: 'course', title: state.courseId }, state.config.courseTitle || courseTitleGuess() || 'This course'),
          h('button', { class: 'x btn', type: 'button', 'aria-label': 'Close', onclick: () => { open = false; panel.render(); } }, '×')),
        !state.settings.enabled ? h('p', { class: 'hint', style: 'padding:6px 12px 0' }, 'RiseUp is switched off in the toolbar menu, so nothing is applied.') : null,
        h('nav', { class: 'tabs', role: 'tablist' }, TABS.map(([id, label]) =>
          h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === tab), onclick: () => { tab = id; panel.render(); } }, label))),
        h('div', { class: 'body', role: 'tabpanel' }, current[2](), h('div', { class: 'status ' + statusMsg.kind, role: 'status' }, statusMsg.text)),
        h('footer', null,
          h('button', { class: 'btn', type: 'button', onclick: openTools }, 'Publish & tools'))));
      const body = shadow.querySelector('.body');
      if (body) body.scrollTop = scrollTop;
    };

    // Re-render once focus leaves a text field so the panel reflects the change.
    shadow.addEventListener('focusout', () => setTimeout(() => { if (!shadow.activeElement) panel.render(); }, 0));
    panel.render();
  }

  // ---------------------------------------------------------------- start
  async function start() {
    await load();
    if (IS_TOP && state.courseId !== 'default') store.set({ 'riseup:activeCourse': state.courseId });
    applyAll();
    if (IS_TOP) buildPanel();
    // Rise is a single-page app: follow course changes without a reload.
    if (IS_TOP) {
      let lastHref = location.href;
      setInterval(async () => {
        if (location.href === lastHref) return;
        lastHref = location.href;
        const id = RU.courseIdFromUrl(location.href);
        if (id !== state.courseId) {
          state.courseId = id;
          if (id !== 'default') store.set({ 'riseup:activeCourse': id });
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
