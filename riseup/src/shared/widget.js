/*
 * RiseUp floating space: a small dock that stays on screen through the
 * course and can be dragged anywhere. It holds any of these tools, one tab
 * each:
 *  - score:      points from RiseUp questions and activities
 *  - collection: items gathered with Collectable blocks
 *  - menu:       the course's lessons
 *  - notes:      a notepad (plus Note prompt answers), saved as a PDF
 *  - checklist:  items from Animated checklists marked "floating"
 * Learner progress and the dock's position are kept on the learner's device.
 * Needs components.js, components-more.js and components-extra.js.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports
    ? Object.assign({}, require('./components.js'), require('./components-more.js'), require('./components-extra.js'), require('./nav.js'))
    : root.RiseUp;
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RU) {
  const el = RU._el;
  const WIDGET_TOOLS = { score: 'Score', collection: 'Collection', menu: 'Menu', notes: 'Notepad', checklist: 'Checklist' };
  const SCORED = ['single', 'multiple', 'sortcards', 'fillblanks', 'conversation', 'swipe'];
  const POINTS = 10; // every scored activity is worth up to 10 points
  const ICON = { score: '★', collection: '◆', menu: '☰', notes: '✎', checklist: '✓' };

  /** Which tools are on. Older settings used a single `type`. */
  function toolsOf(cfg) {
    const t = Object.assign({}, cfg.tools || {});
    if (!cfg.tools && cfg.type) t[cfg.type] = true;
    return Object.keys(WIDGET_TOOLS).filter((k) => t[k]);
  }

  const CSS = `
.ru-w { position: fixed; z-index: 2147483050; font: 14px/1.4 var(--ru-body-font, inherit); color: #1d2330; touch-action: none; }
.ru-w * { box-sizing: border-box; }
.ru-w-chip { display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 8px; border: 0; border-radius: 999px; background: #fff; color: inherit; font: inherit; font-weight: 800; cursor: grab; box-shadow: 0 10px 30px rgba(0,0,0,.2), 0 0 0 1px rgba(0,0,0,.05); user-select: none; }
.ru-w-chip:active { cursor: grabbing; }
.ru-w-badge { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--ru-accent, #2f6fde); color: var(--ru-accent-ink, #fff); font-size: 15px; }
.ru-w-ring { position: absolute; inset: -4px; width: 48px; height: 48px; transform: rotate(-90deg); }
.ru-w-ring circle { fill: none; stroke-width: 4; }
.ru-w-ring .bg { stroke: rgba(0,0,0,.08); } .ru-w-ring .fg { stroke: var(--ru-accent, #2f6fde); transition: stroke-dashoffset .6s ease; }
.ru-w-label small { display: block; font-size: 11px; font-weight: 600; opacity: .65; text-transform: uppercase; letter-spacing: .06em; }
.ru-w-panel { position: absolute; width: min(340px, calc(100vw - 24px)); max-height: min(460px, calc(100vh - 100px)); display: flex; flex-direction: column; border-radius: 16px; background: #fff; box-shadow: 0 20px 50px rgba(0,0,0,.25); overflow: hidden; }
.ru-w-panel[hidden] { display: none; }
.ru-w-tabs { display: flex; gap: 2px; padding: 6px 6px 0; border-bottom: 1px solid #eceef3; }
.ru-w-tab { flex: 1; padding: 8px 4px 9px; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 700; color: #5b6475; cursor: pointer; border-bottom: 3px solid transparent; }
.ru-w-tab[aria-selected="true"] { color: #1d2330; border-bottom-color: var(--ru-accent, #2f6fde); }
.ru-w-body { padding: 14px 16px 16px; overflow-y: auto; }
.ru-w-body h2 { margin: 0 0 10px; font: 800 16px/1.2 var(--ru-heading-font, inherit); }
.ru-w-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ru-w-list li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; background: #f5f6f9; }
.ru-w-list li.is-todo { opacity: .55; }
.ru-w-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ru-w-slot { aspect-ratio: 1; display: grid; place-items: center; border-radius: 12px; background: #f5f6f9; font-size: 26px; overflow: hidden; border: 2px dashed #d9dde5; }
.ru-w-slot.is-got { background: color-mix(in srgb, var(--ru-accent, #2f6fde) 12%, #fff); border: 2px solid var(--ru-accent, #2f6fde); }
.ru-w-slot img { width: 100%; height: 100%; object-fit: cover; }
.ru-w-slot .q { font: 800 18px/1 system-ui, sans-serif; color: #b6bcc8; }
.ru-w-menu a { display: flex; gap: 10px; padding: 9px 10px; border-radius: 8px; color: inherit; text-decoration: none; font-weight: 600; }
.ru-w-menu a:hover { background: #f5f6f9; }
.ru-w-menu a[aria-current="page"] { background: color-mix(in srgb, var(--ru-accent, #2f6fde) 12%, #fff); }
.ru-w-menu .n { color: var(--ru-accent, #2f6fde); font-variant-numeric: tabular-nums; }
.ru-w-notes textarea { width: 100%; min-height: 150px; padding: 10px 12px; border: 2px solid #e3e6ec; border-radius: 10px; font: inherit; resize: vertical; color: inherit; background: #fffef7; background-image: repeating-linear-gradient(transparent, transparent 23px, #eef0f4 23px, #eef0f4 24px); line-height: 24px; }
.ru-w-notes .ru-w-prompts { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.ru-w-notes .ru-w-prompts div { padding: 8px 10px; border-radius: 8px; background: #f5f6f9; font-size: 13px; }
.ru-w-notes .ru-w-prompts strong { display: block; }
.ru-w-row { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
.ru-w-btn { padding: 8px 14px; border: 0; border-radius: 999px; background: var(--ru-accent, #2f6fde); color: var(--ru-accent-ink, #fff); font: inherit; font-weight: 800; cursor: pointer; }
.ru-w-btn.ghost { background: none; color: #5b6475; border: 1px solid #d9dde5; }
.ru-w-saved { font-size: 12px; color: #5b6475; }
.ru-w-check { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; background: #f5f6f9; cursor: pointer; }
.ru-w-check input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--ru-accent, #2f6fde); flex: none; }
.ru-w-check.is-done span { text-decoration: line-through; color: #5b6475; }
.ru-w-group { margin: 10px 0 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #5b6475; }
.ru-w-toast { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); padding: 6px 12px; border-radius: 999px; background: #1d2330; color: #fff; font-weight: 700; white-space: nowrap; animation: ru-w-toast 2.2s ease forwards; pointer-events: none; }
@keyframes ru-w-toast { 0% { opacity: 0; transform: translate(-50%, 8px); } 15%, 75% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -6px); } }
.ru-w-chip.is-bump .ru-w-badge { animation: ru-w-bump .6s cubic-bezier(.2,.8,.2,1.4); }
@keyframes ru-w-bump { 40% { transform: scale(1.25); } }
.ru-w :focus-visible { outline: 3px solid var(--ru-accent, #2f6fde); outline-offset: 2px; }
.ru-w-empty { color: #5b6475; font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .ru-w-toast, .ru-w-chip.is-bump .ru-w-badge { animation: none; } }
`;

  /**
   * @param cfg   { enabled, tools: { score, collection, menu, notes, checklist }, title }
   * @param opts  { courseKey, components }
   */
  function startWidget(doc, cfg, opts) {
    const w = Object.assign({ enabled: false, title: '' }, cfg || {});
    const tools = toolsOf(w);
    if (!w.enabled || !tools.length) return { stop() {}, refresh() {} };
    const win = doc.defaultView;
    const o = opts || {};
    const key = o.courseKey || '';
    const comps = o.components || [];
    const posKey = 'riseup:widgetpos:' + key;
    // Open on the tool the button shows: one with progress, if there is one.
    let tab = ['score', 'checklist', 'collection'].find((t) => tools.includes(t)) || tools[0];
    const style = el(doc, 'style', { id: 'riseup-widget-style' });
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);

    const live = el(doc, 'span', { 'aria-live': 'polite', style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)' });
    const badgeText = el(doc, 'span');
    const R = 22; const C = 2 * Math.PI * R;
    const ring = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('class', 'ru-w-ring'); ring.setAttribute('viewBox', '0 0 48 48'); ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<circle class="bg" cx="24" cy="24" r="' + R + '"/><circle class="fg" cx="24" cy="24" r="' + R + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/>';
    const label = el(doc, 'span', { class: 'ru-w-label' });
    const chip = el(doc, 'button', { type: 'button', class: 'ru-w-chip', 'aria-expanded': 'false', 'aria-controls': 'ru-w-panel', title: 'Drag to move' }, [
      el(doc, 'span', { class: 'ru-w-badge' }, [ring, badgeText]), label]);
    const tabsEl = tools.length > 1 ? el(doc, 'div', { class: 'ru-w-tabs', role: 'tablist' }) : null;
    const body = el(doc, 'div', { class: 'ru-w-body', role: tools.length > 1 ? 'tabpanel' : null });
    const panel = el(doc, 'div', { class: 'ru-w-panel', id: 'ru-w-panel', role: 'region', 'aria-label': w.title || 'Course tools', hidden: true }, [tabsEl, body]);
    const root = el(doc, 'div', { class: 'ru-w', 'data-riseup-ignore': '' }, [panel, chip, live]);
    doc.body.appendChild(root);

    if (RU.detectCourseTheme && RU.applyCourseTheme) {
      const look = RU.detectCourseTheme(doc, null);
      delete look.dark; delete look.ink;
      RU.applyCourseTheme(root, look);
    }

    // ---------------------------------------------------------- position
    let pos = { x: 0.02, y: 0.96 };
    try { pos = Object.assign(pos, JSON.parse(win.localStorage.getItem(posKey) || '{}')); } catch (e) { /* default */ }
    function place() {
      const m = 12;
      const cw = chip.offsetWidth || 160;
      const ch = chip.offsetHeight || 56;
      const top = doc.documentElement.classList.contains('ru-has-topnav') ? 70 : m;
      root.style.left = (m + pos.x * Math.max(0, win.innerWidth - cw - 2 * m)) + 'px';
      root.style.top = (top + pos.y * Math.max(0, win.innerHeight - ch - top - m)) + 'px';
      panel.style.bottom = pos.y > 0.5 ? (ch + 10) + 'px' : '';
      panel.style.top = pos.y > 0.5 ? '' : (ch + 10) + 'px';
      panel.style.left = pos.x > 0.5 ? '' : '0';
      panel.style.right = pos.x > 0.5 ? '0' : '';
    }
    const savePos = () => { try { win.localStorage.setItem(posKey, JSON.stringify(pos)); } catch (e) { /* ignore */ } };
    let drag = null;
    chip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { sx: e.clientX, sy: e.clientY, ox: root.offsetLeft, oy: root.offsetTop, moved: false };
      chip.setPointerCapture(e.pointerId);
    });
    chip.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      const m = 12;
      pos.x = Math.min(1, Math.max(0, (drag.ox + dx - m) / Math.max(1, win.innerWidth - chip.offsetWidth - 2 * m)));
      pos.y = Math.min(1, Math.max(0, (drag.oy + dy - m) / Math.max(1, win.innerHeight - chip.offsetHeight - 2 * m)));
      place();
    });
    chip.addEventListener('pointerup', () => {
      if (!drag) return;
      const wasDrag = drag.moved;
      drag = null;
      if (wasDrag) savePos(); else toggle();
    });
    chip.addEventListener('click', (e) => { if (e.detail === 0) toggle(); }); // keyboard
    chip.addEventListener('keydown', (e) => { // Alt + arrows moves it
      const step = 0.05;
      const map = { ArrowLeft: ['x', -step], ArrowRight: ['x', step], ArrowUp: ['y', -step], ArrowDown: ['y', step] };
      if (!map[e.key] || !e.altKey) return;
      e.preventDefault();
      pos[map[e.key][0]] = Math.min(1, Math.max(0, pos[map[e.key][0]] + map[e.key][1]));
      place();
      savePos();
    });
    function toggle(force) {
      const open = force === undefined ? panel.hidden : force;
      panel.hidden = !open;
      chip.setAttribute('aria-expanded', String(open));
      if (open) draw();
    }
    const onKey = (e) => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); chip.focus(); } };
    doc.addEventListener('keydown', onKey);

    // ---------------------------------------------------------- data
    const data = () => RU.progress.read(win, key);
    function scoreSummary() {
      const scored = comps.filter((c) => SCORED.includes(c.type));
      const s = data().scores || {};
      let got = 0;
      const rows = scored.map((c) => {
        const r = s[c.id];
        const pts = r && r.max ? Math.round((r.score / r.max) * POINTS) : null;
        if (pts !== null) got += pts;
        return { name: c.name || (RU.TYPES[c.type] && RU.TYPES[c.type].label) || c.type, pts };
      });
      return { got, max: scored.length * POINTS, rows };
    }
    function collectSummary() {
      const items = comps.filter((c) => c.type === 'collect');
      const got = data().collected || {};
      return { items: items.map((c) => ({ id: c.id, data: c.data || {}, got: got[c.id] })), count: items.filter((c) => got[c.id]).length, max: items.length };
    }
    function checklistSummary() {
      const lists = comps.filter((c) => c.type === 'checklist' && c.data && c.data.floating);
      const state = data().checklist || {};
      let done = 0; let total = 0;
      const groups = lists.map((c) => {
        const items = (c.data.items || []).filter((i) => i.text).map((i, n) => ({ text: i.text, done: Boolean((state[c.id] || [])[n]), n }));
        total += items.length; done += items.filter((i) => i.done).length;
        return { id: c.id, title: c.data.title || c.name || 'Checklist', items };
      });
      return { groups, done, total };
    }

    // ---------------------------------------------------------- chip
    function drawChip() {
      let frac = null;
      // The button shows progress when there is some to show.
      const first = ['score', 'checklist', 'collection'].find((t) => tools.includes(t)) || tools[0];
      if (first === 'score') {
        const s = scoreSummary();
        badgeText.textContent = String(s.got);
        label.replaceChildren(el(doc, 'small', { text: w.title || 'Score' }), doc.createTextNode(s.got + ' / ' + s.max));
        frac = s.max ? s.got / s.max : 0;
      } else if (first === 'collection') {
        const c = collectSummary();
        badgeText.textContent = String(c.count);
        label.replaceChildren(el(doc, 'small', { text: w.title || 'Collection' }), doc.createTextNode(c.count + ' of ' + c.max));
        frac = c.max ? c.count / c.max : 0;
      } else if (first === 'checklist') {
        const c = checklistSummary();
        badgeText.textContent = String(c.done);
        label.replaceChildren(el(doc, 'small', { text: w.title || 'Checklist' }), doc.createTextNode(c.done + ' of ' + c.total + ' done'));
        frac = c.total ? c.done / c.total : 0;
      } else {
        badgeText.textContent = ICON[first];
        label.replaceChildren(el(doc, 'small', { text: 'Course' }), doc.createTextNode(w.title || WIDGET_TOOLS[first]));
      }
      ring.style.display = frac === null ? 'none' : '';
      if (frac !== null) ring.querySelector('.fg').setAttribute('stroke-dashoffset', String(C * (1 - frac)));
      chip.setAttribute('aria-label', label.textContent + '. Select to open. Alt and arrow keys move it.');
    }

    // ---------------------------------------------------------- panel
    function drawTabs() {
      if (!tabsEl) return;
      tabsEl.replaceChildren(...tools.map((t) => {
        const b = el(doc, 'button', { type: 'button', class: 'ru-w-tab', role: 'tab', 'aria-selected': String(t === tab), text: ICON[t] + ' ' + WIDGET_TOOLS[t] });
        b.addEventListener('click', () => { tab = t; draw(); });
        return b;
      }));
    }

    function draw() {
      drawChip();
      if (panel.hidden) return;
      drawTabs();
      const h2 = el(doc, 'h2', { text: tools.length === 1 && w.title ? w.title : WIDGET_TOOLS[tab] });
      if (tab === 'score') {
        const s = scoreSummary();
        body.replaceChildren(h2, s.rows.length
          ? el(doc, 'ul', { class: 'ru-w-list' }, s.rows.map((r) => el(doc, 'li', { class: r.pts === null ? 'is-todo' : '' }, [el(doc, 'span', { text: r.name }), el(doc, 'strong', { text: r.pts === null ? 'To do' : r.pts + ' / ' + POINTS })])))
          : el(doc, 'p', { class: 'ru-w-empty', text: 'There are no scored activities in this course yet.' }));
      } else if (tab === 'collection') {
        const c = collectSummary();
        body.replaceChildren(h2, c.items.length
          ? el(doc, 'div', { class: 'ru-w-grid' }, c.items.map((it) => {
              const img = RU.safeUrl(it.data.image, 'image');
              return el(doc, 'div', { class: 'ru-w-slot' + (it.got ? ' is-got' : ''), title: it.got ? (it.data.name || '') : 'Not found yet', role: 'img', 'aria-label': it.got ? (it.data.name || 'Item') : 'Not found yet' },
                [it.got ? (img ? el(doc, 'img', { src: img, alt: '' }) : el(doc, 'span', { text: it.data.icon || '⭐' })) : el(doc, 'span', { class: 'q', text: '?' })]);
            }))
          : el(doc, 'p', { class: 'ru-w-empty', text: 'Add Collectable blocks to the course to fill this.' }));
      } else if (tab === 'menu') {
        const lessons = RU.collectLessons ? RU.collectLessons(doc) : [];
        const hh = win.location.hash || '';
        body.replaceChildren(h2, lessons.length
          ? el(doc, 'nav', { class: 'ru-w-menu', 'aria-label': 'Lessons' }, lessons.map((l, i) => el(doc, 'a', { href: l.hash, 'aria-current': hh === l.hash || hh.startsWith(l.hash + '/') ? 'page' : null, onclick: () => toggle(false) },
              [el(doc, 'span', { class: 'n', text: String(i + 1).padStart(2, '0') }), el(doc, 'span', { text: l.title })])))
          : el(doc, 'p', { class: 'ru-w-empty', text: 'The lesson list appears here once the course has loaded.' }));
      } else if (tab === 'notes') {
        drawNotes(h2);
      } else if (tab === 'checklist') {
        const c = checklistSummary();
        body.replaceChildren(h2, c.total
          ? el(doc, 'div', null, c.groups.map((g) => el(doc, 'div', null, [
              c.groups.length > 1 ? el(doc, 'p', { class: 'ru-w-group', text: g.title }) : null,
              el(doc, 'div', { class: 'ru-w-list' }, g.items.map((it) => {
                const input = el(doc, 'input', { type: 'checkbox' });
                input.checked = it.done;
                input.addEventListener('change', () => {
                  RU.progress.update(win, key, (p) => { p.checklist = p.checklist || {}; const a = p.checklist[g.id] || []; a[it.n] = input.checked; p.checklist[g.id] = a; });
                  try { doc.dispatchEvent(new win.CustomEvent('riseup:checklist', { detail: { id: g.id, from: 'widget' } })); } catch (e) { /* ignore */ }
                });
                return el(doc, 'label', { class: 'ru-w-check' + (it.done ? ' is-done' : '') }, [input, el(doc, 'span', { text: it.text })]);
              })),
            ])))
          : el(doc, 'p', { class: 'ru-w-empty', text: 'Add an Animated checklist block with “Also show in the floating space” ticked.' }));
      }
    }

    function drawNotes(h2) {
      const p = data();
      const notes = p.notes || {};
      const ta = el(doc, 'textarea', { 'aria-label': 'My notes', placeholder: 'Write notes as you go. They’re saved on this device.' });
      ta.value = (notes.free && notes.free.text) || '';
      const saved = el(doc, 'span', { class: 'ru-w-saved', 'aria-live': 'polite' });
      let t = null;
      ta.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          RU.progress.update(win, key, (q) => { q.notes = q.notes || {}; q.notes.free = { text: ta.value, at: Date.now() }; });
          saved.textContent = 'Saved';
        }, 400);
      });
      const prompts = comps.filter((c) => c.type === 'noteprompt' && notes[c.id] && notes[c.id].text);
      const pdf = el(doc, 'button', { type: 'button', class: 'ru-w-btn', text: 'Download PDF' });
      pdf.addEventListener('click', () => {
        clearTimeout(t);
        RU.progress.update(win, key, (q) => { q.notes = q.notes || {}; q.notes.free = { text: ta.value, at: Date.now() }; });
        RU.downloadBytes(doc, RU.notesPdf(doc, key, comps), 'my-notes.pdf', 'application/pdf');
        live.textContent = 'Your notes were downloaded as a PDF.';
      });
      body.replaceChildren(h2, el(doc, 'div', { class: 'ru-w-notes' }, [
        ta,
        prompts.length ? el(doc, 'div', { class: 'ru-w-prompts' }, prompts.map((c) => el(doc, 'div', null, [el(doc, 'strong', { text: (c.data && c.data.prompt) || 'Note' }), el(doc, 'span', { text: notes[c.id].text })]))) : null,
        el(doc, 'div', { class: 'ru-w-row' }, [pdf, saved]),
      ]));
    }

    function toast(text) {
      const t = el(doc, 'span', { class: 'ru-w-toast', 'aria-hidden': 'true', text });
      root.appendChild(t);
      setTimeout(() => t.remove(), 2300);
      chip.classList.remove('is-bump');
      void chip.offsetWidth;
      chip.classList.add('is-bump');
      live.textContent = text;
    }

    const onScore = (e) => {
      const d = e.detail || {};
      if (!comps.some((c) => c.id === d.id)) return;
      const before = scoreSummary().got;
      RU.progress.update(win, key, (p) => {
        const prev = p.scores[d.id];
        if (!prev || (d.max && d.score / d.max > prev.score / (prev.max || 1))) p.scores[d.id] = { score: d.score, max: d.max };
      });
      const gained = scoreSummary().got - before;
      draw();
      if (tools.includes('score') && gained > 0) toast('+' + gained + ' points');
    };
    const onCollect = (e) => { draw(); if (tools.includes('collection')) toast('Collected: ' + ((e.detail && e.detail.name) || 'item')); };
    const onChecklist = (e) => { if (!(e.detail && e.detail.from === 'widget') || tab !== 'checklist') draw(); else drawChip(); };
    const onNotes = () => { if (tab !== 'notes' || panel.hidden) draw(); };
    doc.addEventListener('riseup:score', onScore);
    doc.addEventListener('riseup:collect', onCollect);
    doc.addEventListener('riseup:checklist', onChecklist);
    doc.addEventListener('riseup:notes', onNotes);
    win.addEventListener('resize', place);
    win.addEventListener('hashchange', draw);

    draw();
    place();
    return {
      refresh: place,
      stop() {
        root.remove();
        style.remove();
        doc.removeEventListener('riseup:score', onScore);
        doc.removeEventListener('riseup:collect', onCollect);
        doc.removeEventListener('riseup:checklist', onChecklist);
        doc.removeEventListener('riseup:notes', onNotes);
        doc.removeEventListener('keydown', onKey);
        win.removeEventListener('resize', place);
        win.removeEventListener('hashchange', draw);
      },
    };
  }

  return { WIDGET_TOOLS, WIDGET_TYPES: WIDGET_TOOLS, startWidget, widgetTools: toolsOf };
});
