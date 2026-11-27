/*
 * RiseUp floating space: a small panel that stays on screen through the
 * course and can be dragged anywhere. It shows one of:
 *  - score: points from RiseUp questions and activities
 *  - collection: items gathered with Collectable blocks
 *  - menu: the course's lessons
 * Learner progress and the widget's position are kept on the learner's
 * device (localStorage). Needs components.js and components-more.js.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports
    ? Object.assign({}, require('./components.js'), require('./components-more.js'), require('./nav.js'))
    : root.RiseUp;
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RU) {
  const el = RU._el;
  const WIDGET_TYPES = { score: 'Score', collection: 'Collection', menu: 'Menu' };
  const SCORED = ['single', 'multiple', 'sortcards', 'fillblanks', 'conversation'];
  const POINTS = 10; // every scored activity is worth up to 10 points

  const CSS = `
.ru-w { position: fixed; z-index: 2147483050; font: 14px/1.4 var(--ru-body-font, inherit); color: #1d2330; touch-action: none; }
.ru-w * { box-sizing: border-box; }
.ru-w-chip { display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 8px; border: 0; border-radius: 999px; background: #fff; color: inherit; font: inherit; font-weight: 800; cursor: grab; box-shadow: 0 10px 30px rgba(0,0,0,.2), 0 0 0 1px rgba(0,0,0,.05); user-select: none; }
.ru-w-chip:active { cursor: grabbing; }
.ru-w-badge { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--ru-accent, #2f6fde); color: var(--ru-accent-ink, #fff); font-size: 15px; }
.ru-w-ring { position: absolute; inset: -4px; width: 48px; height: 48px; transform: rotate(-90deg); }
.ru-w-ring circle { fill: none; stroke-width: 4; }
.ru-w-ring .bg { stroke: rgba(0,0,0,.08); } .ru-w-ring .fg { stroke: var(--ru-accent); transition: stroke-dashoffset .6s ease; }
.ru-w-label small { display: block; font-size: 11px; font-weight: 600; opacity: .65; text-transform: uppercase; letter-spacing: .06em; }
.ru-w-panel { position: absolute; width: min(320px, calc(100vw - 24px)); max-height: min(420px, calc(100vh - 100px)); overflow-y: auto; padding: 16px; border-radius: 16px; background: #fff; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
.ru-w-panel[hidden] { display: none; }
.ru-w-panel h2 { margin: 0 0 10px; font: 800 16px/1.2 var(--ru-heading-font, inherit); }
.ru-w-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ru-w-list li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; background: #f5f6f9; }
.ru-w-list li.is-todo { opacity: .55; }
.ru-w-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ru-w-slot { aspect-ratio: 1; display: grid; place-items: center; border-radius: 12px; background: #f5f6f9; font-size: 26px; overflow: hidden; border: 2px dashed #d9dde5; }
.ru-w-slot.is-got { background: color-mix(in srgb, var(--ru-accent) 12%, #fff); border: 2px solid var(--ru-accent); }
.ru-w-slot img { width: 100%; height: 100%; object-fit: cover; }
.ru-w-slot .q { font: 800 18px/1 system-ui, sans-serif; color: #b6bcc8; }
.ru-w-menu a { display: flex; gap: 10px; padding: 9px 10px; border-radius: 8px; color: inherit; text-decoration: none; font-weight: 600; }
.ru-w-menu a:hover { background: #f5f6f9; }
.ru-w-menu a[aria-current="page"] { background: color-mix(in srgb, var(--ru-accent) 12%, #fff); }
.ru-w-menu .n { color: var(--ru-accent); font-variant-numeric: tabular-nums; }
.ru-w-toast { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); padding: 6px 12px; border-radius: 999px; background: #1d2330; color: #fff; font-weight: 700; white-space: nowrap; animation: ru-w-toast 2.2s ease forwards; pointer-events: none; }
@keyframes ru-w-toast { 0% { opacity: 0; transform: translate(-50%, 8px); } 15%, 75% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -6px); } }
.ru-w-chip.is-bump .ru-w-badge { animation: ru-w-bump .6s cubic-bezier(.2,.8,.2,1.4); }
@keyframes ru-w-bump { 40% { transform: scale(1.25); } }
.ru-w :focus-visible { outline: 3px solid var(--ru-accent); outline-offset: 2px; }
.ru-w-empty { color: #5b6475; font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .ru-w-toast, .ru-w-chip.is-bump .ru-w-badge { animation: none; } }
`;

  /**
   * @param cfg   { enabled, type: 'score' | 'collection' | 'menu', title }
   * @param opts  { courseKey, components }
   */
  function startWidget(doc, cfg, opts) {
    const w = Object.assign({ enabled: false, type: 'score', title: '' }, cfg || {});
    if (!w.enabled || !WIDGET_TYPES[w.type]) return { stop() {} };
    const win = doc.defaultView;
    const o = opts || {};
    const key = o.courseKey || '';
    const comps = o.components || [];
    const posKey = 'riseup:widgetpos:' + key;
    const style = el(doc, 'style', { id: 'riseup-widget-style' });
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);

    const live = el(doc, 'span', { class: 'ru-sr', 'aria-live': 'polite', style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)' });
    const badgeText = el(doc, 'span');
    const R = 22; const C = 2 * Math.PI * R;
    const ring = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('class', 'ru-w-ring'); ring.setAttribute('viewBox', '0 0 48 48'); ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<circle class="bg" cx="24" cy="24" r="' + R + '"/><circle class="fg" cx="24" cy="24" r="' + R + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/>';
    const label = el(doc, 'span', { class: 'ru-w-label' });
    const chip = el(doc, 'button', { type: 'button', class: 'ru-w-chip', 'aria-expanded': 'false', 'aria-controls': 'ru-w-panel', title: 'Drag to move' }, [
      el(doc, 'span', { class: 'ru-w-badge' }, [w.type === 'menu' ? null : ring, badgeText]), label]);
    const panel = el(doc, 'div', { class: 'ru-w-panel', id: 'ru-w-panel', role: 'region', 'aria-label': w.title || WIDGET_TYPES[w.type], hidden: true });
    const root = el(doc, 'div', { class: 'ru-w', 'data-riseup-ignore': '' }, [panel, chip, live]);
    doc.body.appendChild(root);

    // Course look: colour and fonts from the page, like the blocks.
    if (RU.detectCourseTheme && RU.applyCourseTheme) {
      const look = RU.detectCourseTheme(doc, null);
      delete look.dark; delete look.ink;
      RU.applyCourseTheme(root, look);
      if (!look.accent && !doc.getElementById('riseup-runtime-style')) { root.style.setProperty('--ru-accent', '#2f6fde'); root.style.setProperty('--ru-accent-ink', '#ffffff'); }
    }

    // ---------------------------------------------------------- position
    let pos = { x: 0.02, y: 0.96 };
    try { pos = Object.assign(pos, JSON.parse(win.localStorage.getItem(posKey) || '{}')); } catch (e) { /* default */ }
    function place() {
      const m = 12;
      const cw = chip.offsetWidth || 160;
      const ch = chip.offsetHeight || 56;
      const top = doc.documentElement.classList.contains('ru-has-topnav') ? 70 : m;
      const x = m + pos.x * Math.max(0, win.innerWidth - cw - 2 * m);
      const y = top + pos.y * Math.max(0, win.innerHeight - ch - top - m);
      root.style.left = x + 'px';
      root.style.top = y + 'px';
      // Open the panel towards the middle of the screen.
      panel.style.bottom = pos.y > 0.5 ? (ch + 10) + 'px' : '';
      panel.style.top = pos.y > 0.5 ? '' : (ch + 10) + 'px';
      panel.style.left = pos.x > 0.5 ? '' : '0';
      panel.style.right = pos.x > 0.5 ? '0' : '';
    }
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
      if (wasDrag) { try { win.localStorage.setItem(posKey, JSON.stringify(pos)); } catch (e) { /* ignore */ } }
      else toggle();
    });
    chip.addEventListener('click', (e) => { if (e.detail === 0) toggle(); }); // keyboard
    chip.addEventListener('keydown', (e) => { // move with arrow keys too
      const step = 0.05;
      const map = { ArrowLeft: ['x', -step], ArrowRight: ['x', step], ArrowUp: ['y', -step], ArrowDown: ['y', step] };
      if (!map[e.key] || !e.altKey) return;
      e.preventDefault();
      pos[map[e.key][0]] = Math.min(1, Math.max(0, pos[map[e.key][0]] + map[e.key][1]));
      place();
      try { win.localStorage.setItem(posKey, JSON.stringify(pos)); } catch (err) { /* ignore */ }
    });
    function toggle() {
      const open = panel.hidden;
      panel.hidden = !open;
      chip.setAttribute('aria-expanded', String(open));
      if (open) draw();
    }
    const onKey = (e) => { if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; chip.setAttribute('aria-expanded', 'false'); chip.focus(); } };
    doc.addEventListener('keydown', onKey);

    // ---------------------------------------------------------- content
    function data() { return RU.progress.read(win, key); }
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

    function drawChip() {
      let frac = 0;
      if (w.type === 'score') {
        const s = scoreSummary();
        badgeText.textContent = String(s.got);
        label.replaceChildren(el(doc, 'small', { text: w.title || 'Score' }), doc.createTextNode(s.got + ' / ' + s.max));
        frac = s.max ? s.got / s.max : 0;
      } else if (w.type === 'collection') {
        const c = collectSummary();
        badgeText.textContent = String(c.count);
        label.replaceChildren(el(doc, 'small', { text: w.title || 'Collection' }), doc.createTextNode(c.count + ' of ' + c.max));
        frac = c.max ? c.count / c.max : 0;
      } else {
        badgeText.textContent = '☰';
        label.replaceChildren(el(doc, 'small', { text: 'Course' }), doc.createTextNode(w.title || 'Menu'));
      }
      const fg = ring.querySelector('.fg');
      if (fg) fg.setAttribute('stroke-dashoffset', String(C * (1 - frac)));
      chip.setAttribute('aria-label', label.textContent + '. Select to open. Alt and arrow keys move it.');
    }

    function draw() {
      drawChip();
      if (panel.hidden) return;
      const title = el(doc, 'h2', { text: w.title || WIDGET_TYPES[w.type] });
      if (w.type === 'score') {
        const s = scoreSummary();
        panel.replaceChildren(title, s.rows.length
          ? el(doc, 'ul', { class: 'ru-w-list' }, s.rows.map((r) => el(doc, 'li', { class: r.pts === null ? 'is-todo' : '' }, [el(doc, 'span', { text: r.name }), el(doc, 'strong', { text: r.pts === null ? 'To do' : r.pts + ' / ' + POINTS })])))
          : el(doc, 'p', { class: 'ru-w-empty', text: 'There are no scored activities in this course yet.' }));
      } else if (w.type === 'collection') {
        const c = collectSummary();
        panel.replaceChildren(title, c.items.length
          ? el(doc, 'div', { class: 'ru-w-grid' }, c.items.map((it) => {
              const img = RU.safeUrl(it.data.image, 'image');
              return el(doc, 'div', { class: 'ru-w-slot' + (it.got ? ' is-got' : ''), title: it.got ? (it.data.name || '') : 'Not found yet', role: 'img', 'aria-label': it.got ? (it.data.name || 'Item') : 'Not found yet' },
                [it.got ? (img ? el(doc, 'img', { src: img, alt: '' }) : el(doc, 'span', { text: it.data.icon || '⭐' })) : el(doc, 'span', { class: 'q', text: '?' })]);
            }))
          : el(doc, 'p', { class: 'ru-w-empty', text: 'Add Collectable blocks to the course to fill this.' }));
      } else {
        const lessons = RU.collectLessons ? RU.collectLessons(doc) : [];
        const h = win.location.hash || '';
        panel.replaceChildren(title, lessons.length
          ? el(doc, 'nav', { class: 'ru-w-menu', 'aria-label': 'Lessons' }, lessons.map((l, i) => el(doc, 'a', { href: l.hash, 'aria-current': h === l.hash || h.startsWith(l.hash + '/') ? 'page' : null, onclick: () => { panel.hidden = true; chip.setAttribute('aria-expanded', 'false'); } },
              [el(doc, 'span', { class: 'n', text: String(i + 1).padStart(2, '0') }), el(doc, 'span', { text: l.title })])))
          : el(doc, 'p', { class: 'ru-w-empty', text: 'The lesson list appears here once the course has loaded.' }));
      }
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
        // Keep the best attempt.
        if (!prev || (d.max && d.score / d.max > prev.score / (prev.max || 1))) p.scores[d.id] = { score: d.score, max: d.max };
      });
      const gained = scoreSummary().got - before;
      draw();
      if (w.type === 'score' && gained > 0) toast('+' + gained + ' points');
    };
    const onCollect = (e) => {
      draw();
      if (w.type === 'collection') toast('Collected: ' + ((e.detail && e.detail.name) || 'item'));
    };
    doc.addEventListener('riseup:score', onScore);
    doc.addEventListener('riseup:collect', onCollect);
    win.addEventListener('resize', place);
    win.addEventListener('hashchange', draw);

    draw();
    place();
    return {
      refresh: () => { place(); },
      stop() {
        root.remove();
        style.remove();
        doc.removeEventListener('riseup:score', onScore);
        doc.removeEventListener('riseup:collect', onCollect);
        doc.removeEventListener('keydown', onKey);
        win.removeEventListener('resize', place);
        win.removeEventListener('hashchange', draw);
      },
    };
  }

  return { WIDGET_TYPES, startWidget };
});
