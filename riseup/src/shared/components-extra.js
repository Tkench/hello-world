/*
 * RiseUp blocks, part 3: magnifier, note prompt, animated text, stats
 * reveal, reflection timer, confidence check, certificate, yes/no swipe
 * cards, course dividers and animated checklist. Also a small PDF writer
 * for the learner's notes. Load after components.js and components-more.js.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports
    ? Object.assign(require('./components.js'), require('./components-more.js'))
    : root.RiseUp;
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RU) {
  const TYPES = RU.TYPES;
  const el = RU._el;
  const shuffled = RU._shuffled;
  const onVisible = RU._onVisible;
  const reducedMotion = RU._reducedMotion;
  const safeUrl = RU.safeUrl;
  const emitScore = RU.emitScore;
  const progress = RU.progress;
  const button = (doc, text, cls, onclick, attrs) => el(doc, 'button', Object.assign({ type: 'button', class: 'ru-btn' + (cls ? ' ' + cls : ''), text, onclick }, attrs || {}));
  const fire = (doc, name, detail) => { try { doc.dispatchEvent(new doc.defaultView.CustomEvent(name, { detail })); } catch (e) { /* ignore */ } };

  // ================================================================== PDF (notes)
  /** Plain text in the PDF standard fonts' character set. */
  function pdfText(s) {
    return String(s || '')
      .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
      .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[•●]/g, '-').replace(/ /g, ' ')
      .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '?');
  }
  function pdfEscape(s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
  /** Rough Helvetica widths, good enough for wrapping. */
  function textWidth(s, size) {
    let w = 0;
    for (const ch of s) w += /[il.,:;'|!]/.test(ch) ? 0.28 : /[mwMW]/.test(ch) ? 0.83 : /[A-Z]/.test(ch) ? 0.67 : ch === ' ' ? 0.28 : 0.53;
    return w * size;
  }
  function wrap(text, size, width) {
    const out = [];
    for (const para of pdfText(text).split('\n')) {
      let line = '';
      for (const word of para.split(/ +/)) {
        const t = line ? line + ' ' + word : word;
        if (textWidth(t, size) <= width || !line) line = t;
        else { out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  }

  /**
   * A simple A4 PDF: a title, a subtitle and sections of wrapped text.
   * Returns a Uint8Array.
   */
  function makePdf(doc) {
    const W = 595; const H = 842; const M = 56; const TW = W - 2 * M;
    const pages = [];
    let ops = [];
    let y = H - M;
    const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = H - M; };
    const line = (text, font, size, gapAfter) => {
      if (y - size < M) newPage();
      ops.push('BT /' + font + ' ' + size + ' Tf ' + M + ' ' + (y - size).toFixed(1) + ' Td (' + pdfEscape(text) + ') Tj ET');
      y -= size * 1.35 + (gapAfter || 0);
    };
    for (const l of wrap(doc.title || 'Notes', 20, TW)) line(l, 'F2', 20);
    if (doc.subtitle) for (const l of wrap(doc.subtitle, 10, TW)) line(l, 'F1', 10);
    y -= 14;
    for (const s of doc.sections || []) {
      if (s.heading) { y -= 6; for (const l of wrap(s.heading, 13, TW)) line(l, 'F2', 13, 0); y -= 2; }
      for (const l of wrap(s.text || '', 11, TW)) line(l || ' ', 'F1', 11);
      y -= 10;
    }
    newPage();
    const objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const kids = [];
    pages.forEach((p, i) => {
      const pageId = 5 + i * 2;
      const contentId = pageId + 1;
      const stream = p.join('\n');
      objs[contentId] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
      objs[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentId + ' 0 R >>';
      kids.push(pageId + ' 0 R');
    });
    objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = [];
    for (let i = 1; i < objs.length; i++) {
      offsets[i] = out.length;
      out += i + ' 0 obj\n' + objs[i] + '\nendobj\n';
    }
    const xref = out.length;
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
    for (let i = 1; i < objs.length; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  function downloadBytes(doc, bytes, name, type) {
    const win = doc.defaultView;
    const a = el(doc, 'a', { href: win.URL.createObjectURL(new win.Blob([bytes], { type })), download: name });
    doc.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** The learner's notes (free notepad text and note-prompt answers) as a PDF. */
  function notesPdf(doc, courseKey, components) {
    const p = progress.read(doc.defaultView, courseKey);
    const notes = p.notes || {};
    const sections = [];
    if (notes.free && notes.free.text) sections.push({ heading: 'My notes', text: notes.free.text });
    for (const c of components || []) {
      if (c.type !== 'noteprompt') continue;
      const n = notes[c.id];
      if (n && n.text) sections.push({ heading: (c.data && c.data.prompt) || 'Note', text: n.text });
    }
    const title = (doc.title || 'Course').replace(/\s*[|\-–]\s*Rise.*$/i, '').trim();
    return makePdf({ title: 'My notes: ' + title, subtitle: 'Saved ' + new Date().toLocaleString(), sections: sections.length ? sections : [{ text: 'No notes yet.' }] });
  }

  // ================================================================== Magnifier
  const SHAPES = {
    circle: 'circle(50% at 50% 50%)',
    square: 'inset(0)',
    rounded: 'inset(0 round 22%)',
    hexagon: 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)',
    diamond: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  };
  TYPES.magnifier = {
    label: 'Magnifier', kind: 'interactive',
    description: 'An image with a magnifying lens learners drag across it to see detail.',
    fields: [
      { key: 'title', label: 'Instructions', type: 'text' },
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Image description (alt text)', type: 'text' },
      { key: 'shape', label: 'Lens shape', type: 'select', options: [['circle', 'Circle'], ['rounded', 'Rounded square'], ['square', 'Square'], ['hexagon', 'Hexagon'], ['diamond', 'Diamond']] },
      { key: 'size', label: 'Lens size (px)', type: 'number', min: 80, max: 400 },
      { key: 'zoom', label: 'Magnification (×)', type: 'number', min: 1.5, max: 6 },
      { key: 'startOn', label: 'Start with the lens switched on', type: 'checkbox' },
    ],
    defaults: () => ({ title: 'Switch on the magnifier and drag it over the label to read the small print.', image: '', alt: '', shape: 'circle', size: 170, zoom: 2.5, startOn: false }),
    render(doc, d) {
      const win = doc.defaultView;
      const src = safeUrl(d.image, 'image');
      const size = Math.max(80, Math.min(400, Number(d.size) || 170));
      const zoom = Math.max(1.5, Math.min(6, Number(d.zoom) || 2.5));
      const img = src ? el(doc, 'img', { src, alt: d.alt || '', class: 'ru-mag-img', draggable: 'false' }) : el(doc, 'div', { class: 'ru-mag-ph', role: 'img', 'aria-label': d.alt || 'Image' }, [el(doc, 'span', { text: 'Add an image to magnify' })]);
      const lens = el(doc, 'div', { class: 'ru-mag-lens', tabindex: '0', role: 'slider', 'aria-label': 'Magnifier. Use the arrow keys to move it.', 'aria-valuetext': '', style: 'width:' + size + 'px;height:' + size + 'px;clip-path:' + (SHAPES[d.shape] || SHAPES.circle) + ';' + (src ? "background-image:url('" + src.replace(/'/g, '%27') + "')" : '') });
      const ring = el(doc, 'div', { class: 'ru-mag-ring ru-mag-' + (SHAPES[d.shape] ? d.shape : 'circle'), 'aria-hidden': 'true', style: 'width:' + size + 'px;height:' + size + 'px' });
      const stage = el(doc, 'div', { class: 'ru-mag-stage' }, [img, lens, ring]);
      let pos = { x: 0.5, y: 0.5 };
      function place() {
        const r = stage.getBoundingClientRect();
        const w = r.width || stage.offsetWidth || 600;
        const h = r.height || stage.offsetHeight || 340;
        const x = pos.x * w;
        const y = pos.y * h;
        for (const n of [lens, ring]) { n.style.left = (x - size / 2) + 'px'; n.style.top = (y - size / 2) + 'px'; }
        lens.style.backgroundSize = (w * zoom) + 'px ' + (h * zoom) + 'px';
        lens.style.backgroundPosition = (-(x * zoom - size / 2)) + 'px ' + (-(y * zoom - size / 2)) + 'px';
        lens.setAttribute('aria-valuetext', Math.round(pos.x * 100) + '% across, ' + Math.round(pos.y * 100) + '% down');
      }
      function moveTo(cx, cy) {
        const r = stage.getBoundingClientRect();
        pos = { x: Math.max(0, Math.min(1, (cx - r.left) / r.width)), y: Math.max(0, Math.min(1, (cy - r.top) / r.height)) };
        place();
      }
      let dragging = false;
      stage.addEventListener('pointerdown', (e) => {
        if (!stage.classList.contains('is-on')) return;
        dragging = true;
        stage.setPointerCapture(e.pointerId);
        moveTo(e.clientX, e.clientY);
      });
      stage.addEventListener('pointermove', (e) => { if (dragging) moveTo(e.clientX, e.clientY); });
      stage.addEventListener('pointerup', () => { dragging = false; });
      lens.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.1 : 0.03;
        const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!k) return;
        e.preventDefault();
        pos = { x: Math.max(0, Math.min(1, pos.x + k[0])), y: Math.max(0, Math.min(1, pos.y + k[1])) };
        place();
      });
      const toggle = button(doc, 'Magnifier on', '', () => setOn(!stage.classList.contains('is-on')), { 'aria-pressed': 'false' });
      function setOn(on) {
        stage.classList.toggle('is-on', on);
        toggle.textContent = on ? 'Magnifier off' : 'Magnifier on';
        toggle.setAttribute('aria-pressed', String(on));
        if (on) { place(); }
      }
      if (win.ResizeObserver) new win.ResizeObserver(() => place()).observe(stage);
      if (img.tagName === 'IMG') img.addEventListener('load', place);
      setOn(Boolean(d.startOn));
      return el(doc, 'section', { class: 'ru-mag' }, [
        d.title ? el(doc, 'p', { class: 'ru-instr', text: d.title }) : null,
        stage,
        el(doc, 'div', { class: 'ru-actions' }, [toggle, el(doc, 'span', { class: 'ru-mag-zoom', text: zoom + '× zoom' })]),
      ]);
    },
  };

  // ================================================================== Note prompt
  TYPES.noteprompt = {
    label: 'Note prompt', kind: 'interactive',
    description: 'A question learners answer in their own words. Answers go into their notepad and its PDF.',
    fields: [
      { key: 'prompt', label: 'Prompt', type: 'textarea' },
      { key: 'hint', label: 'Hint (optional)', type: 'text' },
    ],
    defaults: () => ({ prompt: 'What’s one thing you’ll do differently after this lesson?', hint: 'Your answer is saved to your notepad, which you can download as a PDF.' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const id = (ctx && ctx.id) || 'np';
      const key = ctx && ctx.courseKey;
      const inputId = 'ru-np-' + id;
      const saved = ((progress.read(win, key).notes || {})[id] || {}).text || '';
      const ta = el(doc, 'textarea', { id: inputId, class: 'ru-rf-input', rows: '4' });
      ta.value = saved;
      const status = el(doc, 'p', { class: 'ru-feedback', 'aria-live': 'polite' });
      let t = null;
      ta.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          progress.update(win, key, (p) => { p.notes = p.notes || {}; p.notes[id] = { text: ta.value, at: Date.now() }; });
          status.textContent = 'Saved to your notepad.';
          fire(doc, 'riseup:notes', { id });
        }, 500);
      });
      return el(doc, 'section', { class: 'ru-rf ru-np' }, [
        el(doc, 'label', { for: inputId, class: 'ru-q' }, [el(doc, 'span', { class: 'ru-np-icon', 'aria-hidden': 'true', text: '✎' }), d.prompt || '']),
        d.hint ? el(doc, 'p', { class: 'ru-instr', text: d.hint }) : null,
        ta, status,
      ]);
    },
  };

  // ================================================================== Animated text
  TYPES.animtext = {
    label: 'Animated text', kind: 'template',
    description: 'A headline or statement that animates in as learners scroll to it.',
    fields: [
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'effect', label: 'Animation', type: 'select', options: [['words', 'Words rise in'], ['typewriter', 'Typewriter'], ['letters', 'Letters fade in'], ['highlight', 'Highlighter sweep'], ['decode', 'Decode'], ['shimmer', 'Colour shimmer']] },
      { key: 'highlight', label: 'Words to highlight (Highlighter sweep)', type: 'text' },
      { key: 'size', label: 'Size', type: 'select', options: [['large', 'Large'], ['xl', 'Extra large'], ['medium', 'Medium']] },
      { key: 'align', label: 'Alignment', type: 'select', options: [['left', 'Left'], ['center', 'Centre']] },
      { key: 'replay', label: 'Replay when selected', type: 'checkbox' },
    ],
    defaults: () => ({ text: 'Small actions prevent big incidents.', effect: 'words', highlight: 'big incidents', size: 'large', align: 'left', replay: true }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const text = String(d.text || '');
      const effect = d.effect || 'words';
      const box = el(doc, 'p', { class: 'ru-at ru-at-' + effect + ' ru-at-' + (d.size || 'large') + ' ru-al-' + (d.align || 'left'), 'aria-label': text });
      const still = reducedMotion(win) || (ctx && ctx.static);
      let timers = [];
      const clear = () => { timers.forEach((t) => clearTimeout(t)); timers = []; };

      function build() {
        clear();
        box.classList.remove('is-in');
        box.replaceChildren();
        const inner = el(doc, 'span', { 'aria-hidden': 'true' });
        box.appendChild(inner);
        if (effect === 'words') {
          text.split(/(\s+)/).forEach((w, i) => inner.appendChild(/\s/.test(w) ? doc.createTextNode(w) : el(doc, 'span', { class: 'ru-at-w', style: '--ru-i:' + i, text: w })));
        } else if (effect === 'letters') {
          Array.from(text).forEach((ch, i) => inner.appendChild(ch === ' ' ? doc.createTextNode(' ') : el(doc, 'span', { class: 'ru-at-l', style: '--ru-i:' + i, text: ch })));
        } else if (effect === 'highlight') {
          const hl = String(d.highlight || '').trim();
          const i = hl ? text.toLowerCase().indexOf(hl.toLowerCase()) : -1;
          if (i >= 0) inner.append(text.slice(0, i), el(doc, 'mark', { class: 'ru-at-mark', text: text.slice(i, i + hl.length) }), text.slice(i + hl.length));
          else inner.append(el(doc, 'mark', { class: 'ru-at-mark', text }));
        } else {
          inner.textContent = text;
        }
        return inner;
      }

      function play() {
        const inner = build();
        if (still) { box.classList.add('is-in'); return; }
        // Next frame, so the start state is painted first.
        win.requestAnimationFrame(() => win.requestAnimationFrame(() => box.classList.add('is-in')));
        if (effect === 'typewriter') {
          inner.textContent = '';
          const caret = el(doc, 'span', { class: 'ru-at-caret', 'aria-hidden': 'true' });
          box.appendChild(caret);
          Array.from(text).forEach((ch, i) => timers.push(setTimeout(() => { inner.textContent += ch; }, 300 + i * 45)));
          timers.push(setTimeout(() => caret.remove(), 300 + text.length * 45 + 1500));
        } else if (effect === 'decode') {
          const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*';
          const steps = 18;
          for (let s = 0; s <= steps; s++) {
            timers.push(setTimeout(() => {
              const done = Math.floor((s / steps) * text.length);
              inner.textContent = Array.from(text).map((ch, i) => (i < done || ch === ' ' ? ch : glyphs[Math.floor(Math.random() * glyphs.length)])).join('');
            }, 200 + s * 55));
          }
        }
      }
      onVisible(win, box, play);
      if (still) play();
      if (d.replay) {
        box.classList.add('ru-at-replay');
        box.setAttribute('title', 'Select to replay');
        box.addEventListener('click', play);
      }
      return el(doc, 'section', { class: 'ru-atwrap' }, [box]);
    },
  };

  // ================================================================== Stats reveal
  TYPES.statsreveal = {
    label: 'Stats reveal', kind: 'template',
    description: 'Big infographic numbers that count up, revealed one at a time, with optional Learn more pop-ups.',
    fields: [
      { key: 'title', label: 'Title (optional)', type: 'text' },
      { key: 'reveal', label: 'How they appear', type: 'select', options: [['click', 'One at a time, when learners select Reveal'], ['scroll', 'All together, as learners scroll to them']] },
      { key: 'look', label: 'Look', type: 'select', options: [['dark', 'Dark'], ['light', 'Light']] },
      { key: 'items', label: 'Statistics', type: 'list', itemLabel: 'Statistic', min: 1, max: 6, fields: [
        { key: 'prefix', label: 'Before the number', type: 'text' },
        { key: 'value', label: 'Number', type: 'text' },
        { key: 'suffix', label: 'After the number (eg %)', type: 'text' },
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'text', label: 'Description', type: 'textarea' },
        { key: 'more', label: 'Learn more pop-up text (optional)', type: 'textarea' },
      ] },
      { key: 'source', label: 'Source', type: 'text' },
    ],
    defaults: () => ({ title: '', reveal: 'click', look: 'dark', items: [
      { prefix: '', value: '100', suffix: '%', label: 'Learner pass rate, up from 50%', text: 'A module redesigned accessibility-first took apprentice pass rates from 50% to a full 100%.', more: 'The redesign added captions, clear structure and keyboard-friendly activities.' },
      { prefix: '', value: '30', suffix: '%', label: 'Expert time saved per module', text: 'A new authoring pipeline cuts subject expert time by around 30% on every module.', more: '' },
      { prefix: '', value: '95', suffix: '%+', label: 'Module completion rate', text: 'Engaging openings and interactive blocks keep completion above 95%.', more: '' },
    ], source: 'Sample figures for demonstration.' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const items = (d.items || []).filter((i) => i && (i.value || i.label));
      const byClick = d.reveal !== 'scroll';
      let shown = 0;
      const list = el(doc, 'div', { class: 'ru-st-list' });
      const count = el(doc, 'p', { class: 'ru-st-count', 'aria-live': 'polite' });
      const actions = el(doc, 'div', { class: 'ru-actions ru-st-actions' });
      const rows = items.map((it) => {
        const raw = String(it.value || '').trim();
        const num = Number(raw.replace(/,/g, ''));
        const decimals = (raw.split('.')[1] || '').length;
        const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        const numEl = el(doc, 'span', { class: 'ru-st-num', text: raw });
        const learn = it.more ? button(doc, 'Learn more', 'ru-btn-ghost ru-st-more', (e) => RU.openDialog(doc, e.currentTarget, { title: it.label || raw, body: it.more })) : null;
        const row = el(doc, 'article', { class: 'ru-st-row' }, [
          el(doc, 'div', { class: 'ru-st-figure' }, [it.prefix ? el(doc, 'span', { class: 'ru-st-affix', text: it.prefix }) : null, numEl, it.suffix ? el(doc, 'span', { class: 'ru-st-affix', text: it.suffix }) : null]),
          el(doc, 'div', { class: 'ru-st-copy' }, [
            it.label ? el(doc, 'p', { class: 'ru-st-label', text: it.label }) : null,
            it.text ? el(doc, 'p', { class: 'ru-st-text', text: it.text }) : null,
            learn,
          ]),
        ]);
        const countUp = () => {
          if (!Number.isFinite(num) || !raw || reducedMotion(win) || (ctx && ctx.static)) { numEl.textContent = Number.isFinite(num) && raw ? fmt(num) : raw; return; }
          const t0 = win.performance.now();
          const tick = (t) => {
            const p = Math.min(1, (t - t0) / 1400);
            numEl.textContent = fmt(num * (1 - Math.pow(1 - p, 3)));
            if (p < 1) win.requestAnimationFrame(tick);
          };
          numEl.textContent = fmt(0);
          win.requestAnimationFrame(tick);
        };
        return { row, countUp };
      });
      function revealNext() {
        const r = rows[shown++];
        list.appendChild(r.row);
        win.requestAnimationFrame(() => r.row.classList.add('is-in'));
        r.countUp();
        draw();
      }
      function draw() {
        count.textContent = shown + ' of ' + rows.length + ' statistics revealed';
        actions.replaceChildren();
        if (shown < rows.length && byClick) actions.appendChild(button(doc, shown ? 'Reveal next' : 'Reveal', '', revealNext));
        if (shown === rows.length) actions.appendChild(button(doc, 'Replay', 'ru-btn-ghost', () => { shown = 0; list.replaceChildren(); if (byClick) { revealNext(); } else { rows.forEach(() => revealNext()); } }));
      }
      if ((ctx && ctx.static) || !byClick) {
        if (ctx && ctx.static) rows.forEach(() => revealNext());
        else { draw(); onVisible(win, list, () => rows.forEach((r, i) => setTimeout(revealNext, i * 250))); }
      } else {
        draw();
      }
      return el(doc, 'section', { class: 'ru-st ru-st-' + (d.look === 'light' ? 'light' : 'dark') }, [
        d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null,
        count, list, el(doc, 'div', { class: 'ru-st-foot' }, [actions, d.source ? el(doc, 'p', { class: 'ru-st-source', text: d.source }) : null]),
      ]);
    },
  };

  // ================================================================== Reflection timer
  function chime(win) {
    try {
      const Ctx = win.AudioContext || win.webkitAudioContext;
      if (!Ctx) return;
      const ac = new Ctx();
      [660, 880].forEach((f, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = f;
        o.type = 'sine';
        g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.25);
        g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + i * 0.25 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.25 + 0.9);
        o.connect(g).connect(ac.destination);
        o.start(ac.currentTime + i * 0.25);
        o.stop(ac.currentTime + i * 0.25 + 1);
      });
    } catch (e) { /* no audio */ }
  }

  TYPES.timer = {
    label: 'Reflection timer', kind: 'interactive',
    description: 'A countdown that gives learners time to stop and think, with an optional chime.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'prompt', label: 'What to think about', type: 'textarea' },
      { key: 'seconds', label: 'Length (seconds)', type: 'number', min: 5, max: 3600 },
      { key: 'sound', label: 'Chime at the end', type: 'checkbox' },
      { key: 'done', label: 'Message when time is up', type: 'text' },
    ],
    defaults: () => ({ title: 'Time to reflect', prompt: 'Think about the last time you raised a concern at work. What made it easy or hard?', seconds: 60, sound: true, done: 'Time’s up. Hold on to that thought.' }),
    render(doc, d) {
      const win = doc.defaultView;
      const total = Math.max(5, Math.min(3600, Number(d.seconds) || 60));
      let left = total;
      let running = false;
      let tick = null;
      let soundOn = d.sound !== false;
      const R = 88; const C = 2 * Math.PI * R;
      const NS = 'http://www.w3.org/2000/svg';
      const svg = doc.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('class', 'ru-tm-ring'); svg.setAttribute('aria-hidden', 'true');
      const mk = (cls) => { const c = doc.createElementNS(NS, 'circle'); c.setAttribute('cx', '100'); c.setAttribute('cy', '100'); c.setAttribute('r', String(R)); c.setAttribute('class', cls); return c; };
      const track = mk('ru-tm-track');
      const bar = mk('ru-tm-bar');
      bar.setAttribute('stroke-dasharray', String(C));
      svg.append(track, bar);
      const time = el(doc, 'span', { class: 'ru-tm-time', role: 'timer', 'aria-live': 'off' });
      const state = el(doc, 'span', { class: 'ru-tm-state' });
      const live = el(doc, 'p', { class: 'ru-sr', 'aria-live': 'polite' });
      const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      const startBtn = button(doc, 'Start', '', () => (running ? pause() : start()));
      const resetBtn = button(doc, 'Reset', 'ru-btn-ghost', () => reset());
      const soundBtn = el(doc, 'button', { type: 'button', class: 'ru-tm-sound', 'aria-pressed': String(soundOn), 'aria-label': 'Chime at the end', title: 'Chime at the end' });
      soundBtn.addEventListener('click', () => { soundOn = !soundOn; soundBtn.setAttribute('aria-pressed', String(soundOn)); drawSound(); });
      function drawSound() { soundBtn.textContent = soundOn ? '🔔' : '🔕'; }
      const face = el(doc, 'div', { class: 'ru-tm-face' }, [svg, el(doc, 'div', { class: 'ru-tm-centre' }, [time, state])]);
      const root = el(doc, 'section', { class: 'ru-tm' }, [
        d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null,
        d.prompt ? el(doc, 'p', { class: 'ru-tm-prompt', text: d.prompt }) : null,
        face,
        el(doc, 'div', { class: 'ru-actions ru-tm-actions' }, [startBtn, soundBtn, resetBtn]),
        live,
      ]);
      function draw(label) {
        time.textContent = fmt(left);
        bar.setAttribute('stroke-dashoffset', String(C * (1 - left / total)));
        state.textContent = label || (running ? 'Reflecting' : left === total ? 'Ready' : left === 0 ? 'Done' : 'Paused');
        startBtn.textContent = running ? 'Pause' : left === total ? 'Start' : left === 0 ? 'Start again' : 'Resume';
        root.classList.toggle('is-running', running);
        root.classList.toggle('is-done', left === 0);
      }
      function start() {
        if (left === 0) left = total;
        running = true;
        live.textContent = 'Timer started: ' + fmt(left) + '.';
        tick = win.setInterval(() => {
          if (!root.isConnected && tick) { win.clearInterval(tick); return; }
          left = Math.max(0, left - 1);
          if (left === 0) {
            win.clearInterval(tick); running = false;
            if (soundOn) chime(win);
            live.textContent = d.done || 'Time’s up.';
            draw(d.done ? 'Done' : 'Done');
            if (d.done) state.textContent = 'Done';
            msg.textContent = d.done || '';
            return;
          }
          draw();
        }, 1000);
        draw();
      }
      function pause() { running = false; win.clearInterval(tick); live.textContent = 'Paused.'; draw(); }
      function reset() { running = false; win.clearInterval(tick); left = total; msg.textContent = ''; draw(); }
      const msg = el(doc, 'p', { class: 'ru-tm-msg', 'aria-hidden': 'true' });
      root.insertBefore(msg, live);
      drawSound();
      draw();
      return root;
    },
  };

  // ================================================================== Confidence check
  const SCALES = {
    faces: ['😫', '🙁', '😐', '🙂', '😀'],
    stars: ['★', '★★', '★★★', '★★★★', '★★★★★'],
    numbers: ['1', '2', '3', '4', '5'],
  };
  TYPES.confidence = {
    label: 'Confidence check', kind: 'question',
    description: 'A five-point check-in learners answer at the start and again later, to see how they’ve changed.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'question', label: 'Question', type: 'textarea' },
      { key: 'pair', label: 'Pair name (use the same name on the before and after checks)', type: 'text' },
      { key: 'stage', label: 'This is the', type: 'select', options: [['before', 'First check (before)'], ['after', 'Second check (after)']] },
      { key: 'scale', label: 'Scale', type: 'select', options: [['faces', 'Faces'], ['stars', 'Stars'], ['numbers', 'Numbers 1 to 5']] },
      { key: 'labels', label: 'Labels, lowest to highest (comma separated)', type: 'text' },
      { key: 'thanks', label: 'Message after answering', type: 'text' },
      { key: 'up', label: 'Second check: when confidence went up', type: 'text' },
      { key: 'same', label: 'Second check: when it stayed the same', type: 'text' },
      { key: 'down', label: 'Second check: when it went down', type: 'text' },
    ],
    defaults: () => ({ title: 'Confidence check', question: 'When you’re not sure about something at work, how comfortable do you feel asking for help?', pair: 'asking-for-help', stage: 'before', scale: 'faces', labels: 'Not at all, Not really, Sometimes, Usually, Easily', thanks: 'Thanks. We’ll ask again at the end.', up: 'Your confidence has gone up. Nice work.', same: 'About the same as before. That’s fine: confidence takes practice.', down: 'A little lower than before. Revisit the lesson, or talk to your manager.' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const key = ctx && ctx.courseKey;
      const pair = String(d.pair || 'check').trim().toLowerCase() || 'check';
      const after = d.stage === 'after';
      let labels = String(d.labels || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (labels.length === 6 && /^yes$/i.test(labels[4])) labels = labels.slice(0, 4).concat([labels[4] + ', ' + labels[5]]); // "Yes, easily"
      while (labels.length < 5) labels.push(String(labels.length + 1));
      labels = labels.slice(0, 5);
      const icons = SCALES[d.scale] || SCALES.faces;
      const read = () => ((progress.read(win, key).checks || {})[pair]) || {};
      const id = 'ru-cf-' + ((ctx && ctx.id) || 'x');
      const status = el(doc, 'div', { class: 'ru-cf-msg', 'aria-live': 'polite' });
      const earlier = read().before;
      const submit = button(doc, 'Submit', '', () => save(), { disabled: true });
      let choice = (after ? read().after : read().before);
      const opts = labels.map((lab, i) => {
        const input = el(doc, 'input', { type: 'radio', name: id, id: id + '-' + i, value: String(i), class: 'ru-opt-input' });
        if (choice === i) input.checked = true;
        input.addEventListener('change', () => { choice = i; submit.disabled = false; drawSel(); });
        const lbl = el(doc, 'label', { for: id + '-' + i, class: 'ru-cf-opt' + (after && earlier === i ? ' was-before' : '') }, [
          el(doc, 'span', { class: 'ru-cf-icon ru-cf-' + (d.scale || 'faces'), 'aria-hidden': 'true', text: icons[i] }),
          el(doc, 'span', { class: 'ru-cf-label', text: lab }),
          after && earlier === i ? el(doc, 'span', { class: 'ru-cf-was', text: 'Before' }) : null,
        ]);
        return el(doc, 'div', { class: 'ru-opt-wrap' }, [input, lbl]);
      });
      function drawSel() { opts.forEach((o, i) => o.classList.toggle('is-selected', choice === i)); }
      function save() {
        progress.update(win, key, (p) => { p.checks = p.checks || {}; p.checks[pair] = Object.assign(p.checks[pair] || {}, after ? { after: choice } : { before: choice }); });
        submit.textContent = 'Update';
        if (!after) { status.className = 'ru-cf-msg is-ok'; status.textContent = d.thanks || 'Saved.'; return; }
        if (earlier === undefined) { status.className = 'ru-cf-msg is-ok'; status.textContent = 'Saved.'; return; }
        const diff = choice - earlier;
        status.className = 'ru-cf-msg is-' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'same');
        status.replaceChildren(
          el(doc, 'strong', { text: 'Before: ' + labels[earlier] + '  →  Now: ' + labels[choice] }),
          el(doc, 'span', { text: (diff > 0 ? d.up : diff < 0 ? d.down : d.same) || '' }));
      }
      drawSel();
      if (choice !== undefined) submit.disabled = false;
      const intro = after
        ? (earlier === undefined
          ? el(doc, 'p', { class: 'ru-cf-note' , text: 'We couldn’t find your earlier answer, so this one starts fresh. That usually happens if you began the course on a different device or browser.' })
          : el(doc, 'p', { class: 'ru-cf-note is-found', text: 'Earlier you chose “' + labels[earlier] + '”. Now that you’ve finished, how would you answer?' }))
        : null;
      return el(doc, 'section', { class: 'ru-cf' }, [
        d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null,
        intro,
        el(doc, 'fieldset', { class: 'ru-opts ru-cf-scale' }, [el(doc, 'legend', { class: 'ru-q', text: d.question || '' }), el(doc, 'div', { class: 'ru-cf-row' }, opts)]),
        el(doc, 'div', { class: 'ru-actions ru-cf-actions' }, [submit]),
        status,
      ]);
    },
  };

  // ================================================================== Certificate
  TYPES.certificate = {
    label: 'Certificate', kind: 'template',
    description: 'A completion certificate learners personalise with their name, then save as a PDF or print.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'course', label: 'Course name (blank uses the course title)', type: 'text' },
      { key: 'text', label: 'Wording', type: 'text' },
      { key: 'design', label: 'Design', type: 'select', options: [['modern', 'Modern'], ['classic', 'Classic'], ['bold', 'Bold']] },
      { key: 'logo', label: 'Logo', type: 'image' },
      { key: 'signName', label: 'Signed by (name)', type: 'text' },
      { key: 'signRole', label: 'Signed by (role)', type: 'text' },
    ],
    defaults: () => ({ heading: 'Certificate of completion', course: '', text: 'This certifies that', design: 'modern', logo: '', signName: 'Alex Morgan', signRole: 'Head of Learning' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const key = ctx && ctx.courseKey;
      const course = d.course || (doc.title || 'this course').replace(/\s*[|\-–]\s*Rise.*$/i, '').trim();
      const savedName = (progress.read(win, key).learnerName) || '';
      const logo = safeUrl(d.logo, 'image');
      const nameOut = el(doc, 'p', { class: 'ru-ct-name', text: savedName || 'Your name' });
      const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      const cert = el(doc, 'div', { class: 'ru-ct ru-ct-' + (['modern', 'classic', 'bold'].includes(d.design) ? d.design : 'modern') }, [
        el(doc, 'span', { class: 'ru-ct-corner', 'aria-hidden': 'true' }),
        logo ? el(doc, 'img', { src: logo, alt: '', class: 'ru-ct-logo' }) : null,
        el(doc, 'p', { class: 'ru-ct-heading', text: d.heading || 'Certificate of completion' }),
        el(doc, 'p', { class: 'ru-ct-text', text: d.text || 'This certifies that' }),
        nameOut,
        el(doc, 'p', { class: 'ru-ct-text', text: 'has successfully completed' }),
        el(doc, 'p', { class: 'ru-ct-course', text: course }),
        el(doc, 'div', { class: 'ru-ct-foot' }, [
          el(doc, 'div', null, [el(doc, 'p', { class: 'ru-ct-line', text: date }), el(doc, 'p', { class: 'ru-ct-small', text: 'Date' })]),
          el(doc, 'div', null, [el(doc, 'p', { class: 'ru-ct-line ru-ct-sign', text: d.signName || '' }), el(doc, 'p', { class: 'ru-ct-small', text: d.signRole || '' })]),
        ]),
      ]);
      const inputId = 'ru-ct-' + ((ctx && ctx.id) || 'x');
      const input = el(doc, 'input', { type: 'text', id: inputId, class: 'ru-ct-input', autocomplete: 'name', placeholder: 'Type your name' });
      input.value = savedName;
      input.addEventListener('input', () => {
        nameOut.textContent = input.value.trim() || 'Your name';
        progress.update(win, key, (p) => { p.learnerName = input.value.trim(); });
      });
      const print = button(doc, 'Save as PDF or print', '', () => {
        if (!input.value.trim()) { input.focus(); hint.textContent = 'Add your name first.'; return; }
        hint.textContent = '';
        // Print just the certificate: everything else is hidden while printing.
        const st = el(doc, 'style', { id: 'ru-print-style' });
        st.textContent = '@media print { @page { size: A4 landscape; margin: 0; } body * { visibility: hidden !important; } .ru-printing, .ru-printing * { visibility: visible !important; } .ru-printing { position: fixed !important; inset: 0 !important; margin: 0 !important; width: 100% !important; height: 100% !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }';
        doc.head.appendChild(st);
        cert.classList.add('ru-printing');
        const done = () => { cert.classList.remove('ru-printing'); st.remove(); win.removeEventListener('afterprint', done); };
        win.addEventListener('afterprint', done);
        win.print();
        setTimeout(done, 1500);
      });
      const hint = el(doc, 'p', { class: 'ru-feedback', 'aria-live': 'polite' });
      return el(doc, 'section', { class: 'ru-ctwrap' }, [
        cert,
        el(doc, 'div', { class: 'ru-ct-form' }, [el(doc, 'label', { for: inputId, class: 'ru-q', text: 'Name on the certificate' }), el(doc, 'div', { class: 'ru-actions' }, [input, print]), hint,
          el(doc, 'p', { class: 'ru-instr', text: 'In the print window, choose “Save as PDF” to keep a copy.' })]),
      ]);
    },
  };

  // ================================================================== Yes / no swipe cards
  TYPES.swipe = {
    label: 'Yes or no swipe cards', kind: 'question',
    description: 'A stack of cards learners swipe left or right to answer. Feedback on each card and a score at the end.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'question', label: 'Question to answer for each card', type: 'text' },
      { key: 'noLabel', label: 'Left answer', type: 'text' },
      { key: 'yesLabel', label: 'Right answer', type: 'text' },
      { key: 'cards', label: 'Cards', type: 'list', itemLabel: 'Card', min: 2, max: 20, fields: [
        { key: 'text', label: 'Card text', type: 'textarea' },
        { key: 'image', label: 'Image (optional)', type: 'image' },
        { key: 'answer', label: 'Correct answer', type: 'select', options: [['yes', 'Right answer'], ['no', 'Left answer']] },
        { key: 'feedback', label: 'Feedback', type: 'textarea' },
      ] },
    ],
    defaults: () => ({ title: 'Safe or unsafe?', question: 'Swipe right if it’s safe, left if it isn’t.', noLabel: 'Unsafe', yesLabel: 'Safe', cards: [
      { text: 'Propping a fire door open on a hot day', image: '', answer: 'no', feedback: 'Fire doors only work closed. Never wedge them.' },
      { text: 'Reporting a frayed cable to facilities', image: '', answer: 'yes', feedback: 'Exactly right: report it and keep people away.' },
      { text: 'Standing on a swivel chair to reach a shelf', image: '', answer: 'no', feedback: 'Use a step or a stepladder. Chairs move.' },
      { text: 'Clearing a spill and putting out a wet floor sign', image: '', answer: 'yes', feedback: 'Clean up and warn others. Good.' },
    ] }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const cards = (d.cards || []).filter((c) => c.text || c.image).map((c, i) => ({ text: c.text || '', image: safeUrl(c.image, 'image'), yes: c.answer !== 'no', feedback: c.feedback || '', i }));
      const yes = d.yesLabel || 'Yes';
      const no = d.noLabel || 'No';
      let order = cards.slice();
      let pos = 0;
      let results = [];
      let busy = false;
      const stack = el(doc, 'div', { class: 'ru-sw-stack' });
      const fb = el(doc, 'div', { class: 'ru-sw-fb', 'aria-live': 'polite' });
      const count = el(doc, 'p', { class: 'ru-sw-count' });
      const noBtn = button(doc, '← ' + no, 'ru-sw-no', () => answer(false));
      const yesBtn = button(doc, yes + ' →', 'ru-sw-yes', () => answer(true));
      const controls = el(doc, 'div', { class: 'ru-sw-controls' }, [noBtn, yesBtn]);
      const end = el(doc, 'div', { class: 'ru-sw-end', hidden: true });

      function cardEl(c, depth) {
        return el(doc, 'div', { class: 'ru-sw-card', style: '--ru-d:' + depth, 'aria-hidden': depth ? 'true' : null }, [
          c.image ? el(doc, 'img', { src: c.image, alt: '' }) : null,
          el(doc, 'p', { class: 'ru-sw-text', text: c.text }),
          el(doc, 'span', { class: 'ru-sw-stamp ru-sw-stamp-yes', 'aria-hidden': 'true', text: yes }),
          el(doc, 'span', { class: 'ru-sw-stamp ru-sw-stamp-no', 'aria-hidden': 'true', text: no }),
        ]);
      }
      function draw() {
        stack.replaceChildren(...order.slice(pos, pos + 3).map((c, k) => cardEl(c, k)).reverse());
        count.textContent = pos < order.length ? 'Card ' + (pos + 1) + ' of ' + order.length : '';
        const top = stack.lastChild;
        if (top) { top.setAttribute('tabindex', '0'); top.setAttribute('role', 'group'); top.setAttribute('aria-label', order[pos].text + '. Left arrow for ' + no + ', right arrow for ' + yes + '.'); bindDrag(top); }
        controls.hidden = pos >= order.length;
      }
      function bindDrag(card) {
        let sx = null;
        let dx = 0;
        card.addEventListener('pointerdown', (e) => { if (busy) return; sx = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); card.classList.add('is-dragging'); });
        card.addEventListener('pointermove', (e) => {
          if (sx === null) return;
          dx = e.clientX - sx;
          card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 18) + 'deg)';
          card.classList.toggle('is-yes', dx > 40);
          card.classList.toggle('is-no', dx < -40);
        });
        const release = () => {
          if (sx === null) return;
          sx = null;
          card.classList.remove('is-dragging');
          if (Math.abs(dx) > 90) answer(dx > 0);
          else { card.style.transform = ''; card.classList.remove('is-yes', 'is-no'); }
        };
        card.addEventListener('pointerup', release);
        card.addEventListener('pointercancel', release);
        card.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); answer(true); } if (e.key === 'ArrowLeft') { e.preventDefault(); answer(false); } });
      }
      function answer(saidYes) {
        if (busy || pos >= order.length) return;
        busy = true;
        const c = order[pos];
        const right = saidYes === c.yes;
        results.push({ c, right });
        const top = stack.lastChild;
        if (top) {
          top.classList.add(saidYes ? 'is-yes' : 'is-no', 'is-gone');
          top.style.transform = 'translateX(' + (saidYes ? 140 : -140) + '%) rotate(' + (saidYes ? 18 : -18) + 'deg)';
        }
        fb.className = 'ru-sw-fb ' + (right ? 'is-right' : 'is-wrong');
        fb.replaceChildren(el(doc, 'strong', { text: (right ? '✓ Correct: ' : '✗ Not quite: ') + (c.yes ? yes : no) }), c.feedback ? el(doc, 'span', { text: c.feedback }) : null);
        const wait = reducedMotion(win) || (ctx && ctx.static) ? 0 : 380;
        setTimeout(() => {
          pos++;
          busy = false;
          draw();
          if (pos >= order.length) finish();
          else if (stack.lastChild) stack.lastChild.focus({ preventScroll: true });
        }, wait);
      }
      function finish() {
        const right = results.filter((r) => r.right).length;
        const wrong = results.filter((r) => !r.right);
        end.hidden = false;
        end.replaceChildren(
          el(doc, 'p', { class: 'ru-sw-score', text: right + ' of ' + results.length + ' correct' }),
          wrong.length ? el(doc, 'ul', { class: 'ru-qfb-list' }, wrong.map((r) => el(doc, 'li', { class: 'is-wrong' }, [el(doc, 'strong', { text: r.c.text + ' → ' + (r.c.yes ? yes : no) }), r.c.feedback ? el(doc, 'span', { text: r.c.feedback }) : null]))) : null,
          button(doc, 'Try again', 'ru-btn-ghost', () => { order = shuffled(cards, Math.random()); pos = 0; results = []; end.hidden = true; fb.replaceChildren(); fb.className = 'ru-sw-fb'; draw(); }));
        emitScore(doc, (ctx && ctx.id) || 'swipe', right, results.length);
      }
      draw();
      return el(doc, 'section', { class: 'ru-sw' }, [
        d.title ? el(doc, 'h3', { class: 'ru-title ru-center', text: d.title }) : null,
        d.question ? el(doc, 'p', { class: 'ru-instr ru-center', text: d.question + ' You can also use the buttons or your arrow keys.' }) : null,
        el(doc, 'div', { class: 'ru-sw-labels', 'aria-hidden': 'true' }, [el(doc, 'span', { text: '← ' + no }), count, el(doc, 'span', { text: yes + ' →' })]),
        stack, controls, fb, end,
      ]);
    },
  };

  // ================================================================== Dividers
  const DIVIDERS = [['line', 'Line with dot'], ['gradient', 'Gradient bar'], ['wave', 'Wave'], ['zigzag', 'Zigzag'], ['dots', 'Three dots'], ['chapter', 'Numbered chapter'], ['banner', 'Text banner'], ['icon', 'Icon between lines'], ['slant', 'Slanted band'], ['scroll', 'Keep scrolling']];
  TYPES.divider = {
    label: 'Course divider', kind: 'template',
    description: 'Ten styles of divider to break up the content, from a simple line to a text banner.',
    fields: [
      { key: 'style', label: 'Style', type: 'select', options: DIVIDERS },
      { key: 'text', label: 'Text (Chapter, Banner, Slanted band, Keep scrolling)', type: 'text' },
      { key: 'number', label: 'Number (Chapter)', type: 'text' },
      { key: 'icon', label: 'Icon (an emoji, for Icon between lines)', type: 'text' },
    ],
    defaults: () => ({ style: 'banner', text: 'A little later in the course…', number: '02', icon: '✦' }),
    render(doc, d) {
      const NS = 'http://www.w3.org/2000/svg';
      const style = DIVIDERS.some(([k]) => k === d.style) ? d.style : 'line';
      const svgPath = (pathD, viewBox) => {
        const s = doc.createElementNS(NS, 'svg');
        s.setAttribute('viewBox', viewBox); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ru-dv-svg');
        const p = doc.createElementNS(NS, 'path'); p.setAttribute('d', pathD); s.appendChild(p);
        return s;
      };
      const kids = {
        line: () => [el(doc, 'span', { class: 'ru-dv-rule' }), el(doc, 'span', { class: 'ru-dv-dot' }), el(doc, 'span', { class: 'ru-dv-rule' })],
        gradient: () => [el(doc, 'span', { class: 'ru-dv-grad' })],
        wave: () => [svgPath('M0 10 Q 12.5 0 25 10 T 50 10 T 75 10 T 100 10', '0 0 100 20')],
        zigzag: () => [svgPath('M0 15 L5 5 L10 15 L15 5 L20 15 L25 5 L30 15 L35 5 L40 15 L45 5 L50 15 L55 5 L60 15 L65 5 L70 15 L75 5 L80 15 L85 5 L90 15 L95 5 L100 15', '0 0 100 20')],
        dots: () => [el(doc, 'span'), el(doc, 'span'), el(doc, 'span')],
        chapter: () => [el(doc, 'span', { class: 'ru-dv-num', text: d.number || '' }), el(doc, 'span', { class: 'ru-dv-ctext', text: d.text || '' }), el(doc, 'span', { class: 'ru-dv-rule' })],
        banner: () => [el(doc, 'p', { class: 'ru-dv-btext', text: d.text || '' })],
        icon: () => [el(doc, 'span', { class: 'ru-dv-rule' }), el(doc, 'span', { class: 'ru-dv-ico', text: d.icon || '✦' }), el(doc, 'span', { class: 'ru-dv-rule' })],
        slant: () => [el(doc, 'p', { class: 'ru-dv-stext', text: d.text || '' })],
        scroll: () => [el(doc, 'p', { class: 'ru-dv-sctext', text: d.text || 'Keep scrolling' }), el(doc, 'span', { class: 'ru-dv-chev', 'aria-hidden': 'true' })],
      }[style]();
      const hasText = ['chapter', 'banner', 'slant', 'scroll'].includes(style) && (d.text || d.number);
      return el(doc, 'div', { class: 'ru-dv ru-dv-' + style, role: hasText ? null : 'separator' }, kids);
    },
  };

  // ================================================================== Animated checklist
  TYPES.checklist = {
    label: 'Animated checklist', kind: 'interactive',
    description: 'Items learners tick off, with a strike-through. Can also live in the floating space as a checklist of learning.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'items', label: 'Items', type: 'list', itemLabel: 'Item', min: 1, max: 20, fields: [
        { key: 'text', label: 'Item', type: 'text' },
        { key: 'detail', label: 'Detail (optional)', type: 'text' },
      ] },
      { key: 'floating', label: 'Also show these in the floating space’s checklist', type: 'checkbox' },
      { key: 'done', label: 'Message when everything is ticked', type: 'text' },
    ],
    defaults: () => ({ title: 'Before you start a shift', items: [
      { text: 'Check the fire exits are clear', detail: '' }, { text: 'Know where the nearest extinguisher is', detail: '' },
      { text: 'Read the latest safety bulletin', detail: 'It’s on the team noticeboard.' }, { text: 'Report anything that looks wrong', detail: '' },
    ], floating: true, done: 'All done. You’re ready to go.' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const id = (ctx && ctx.id) || 'cl';
      const key = ctx && ctx.courseKey;
      const items = (d.items || []).filter((i) => i.text);
      const read = () => ((progress.read(win, key).checklist || {})[id]) || [];
      const count = el(doc, 'p', { class: 'ru-cl-count', 'aria-live': 'polite' });
      const bar = el(doc, 'span', { class: 'ru-cl-fill' });
      const rows = items.map((it, i) => {
        const inputId = 'ru-cl-' + id + '-' + i;
        const input = el(doc, 'input', { type: 'checkbox', id: inputId, class: 'ru-opt-input' });
        input.addEventListener('change', () => {
          progress.update(win, key, (p) => { p.checklist = p.checklist || {}; const a = p.checklist[id] || []; a[i] = input.checked; p.checklist[id] = a; });
          fire(doc, 'riseup:checklist', { id });
          sync(true);
        });
        const li = el(doc, 'li', { class: 'ru-cl-item' }, [input, el(doc, 'label', { for: inputId, class: 'ru-cl-label' }, [
          el(doc, 'span', { class: 'ru-cl-box', 'aria-hidden': 'true' }),
          el(doc, 'span', { class: 'ru-cl-text' }, [el(doc, 'span', { class: 'ru-cl-main', text: it.text }), it.detail ? el(doc, 'span', { class: 'ru-cl-detail', text: it.detail }) : null]),
        ])]);
        return { li, input };
      });
      const doneMsg = el(doc, 'p', { class: 'ru-cl-done' });
      function sync(animate) {
        const state = read();
        rows.forEach((r, i) => { r.input.checked = Boolean(state[i]); r.li.classList.toggle('is-done', r.input.checked); });
        const n = rows.filter((r) => r.input.checked).length;
        count.textContent = n + ' of ' + rows.length + ' done';
        bar.style.width = (rows.length ? (n / rows.length) * 100 : 0) + '%';
        const all = n === rows.length && rows.length > 0;
        root.classList.toggle('is-complete', all);
        doneMsg.textContent = all ? (d.done || 'All done.') : '';
        if (all && animate) { root.classList.remove('is-celebrate'); void root.offsetWidth; root.classList.add('is-celebrate'); }
      }
      const root = el(doc, 'section', { class: 'ru-cl', 'data-floating': d.floating ? 'true' : null }, [
        el(doc, 'div', { class: 'ru-cl-head' }, [d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null, count]),
        el(doc, 'span', { class: 'ru-cl-bar', 'aria-hidden': 'true' }, [bar]),
        el(doc, 'ul', { class: 'ru-cl-list' }, rows.map((r) => r.li)),
        doneMsg,
      ]);
      // Stay in step with the floating checklist (and other copies of this block).
      doc.addEventListener('riseup:checklist', (e) => { if (e.detail && e.detail.id === id && root.isConnected) sync(false); });
      sync(false);
      return root;
    },
  };

  // ------------------------------------------------------------------ styles
  const EXTRA_CSS = `
/* Magnifier */
.ru-c .ru-mag-stage { position: relative; overflow: hidden; border-radius: var(--ru-radius); user-select: none; touch-action: none; }
.ru-c .ru-mag-img { width: 100%; display: block; }
.ru-c .ru-mag-ph { aspect-ratio: 16 / 9; display: grid; place-items: center; background: repeating-linear-gradient(45deg, var(--ru-soft), var(--ru-soft) 12px, #eceef3 12px, #eceef3 24px); color: var(--ru-muted); }
.ru-c .ru-mag-lens, .ru-c .ru-mag-ring { position: absolute; display: none; pointer-events: none; }
.ru-c .ru-mag-stage.is-on { cursor: grab; }
.ru-c .ru-mag-stage.is-on .ru-mag-lens, .ru-c .ru-mag-stage.is-on .ru-mag-ring { display: block; }
.ru-c .ru-mag-lens { pointer-events: auto; background-repeat: no-repeat; background-color: #fff; outline: none; }
.ru-c .ru-mag-ring { border: 4px solid #fff; box-shadow: 0 8px 26px rgba(0,0,0,.35), inset 0 0 0 2px var(--ru-accent); }
.ru-c .ru-mag-circle { border-radius: 50%; } .ru-c .ru-mag-rounded { border-radius: 22%; } .ru-c .ru-mag-square { border-radius: 0; }
.ru-c .ru-mag-hexagon, .ru-c .ru-mag-diamond { border: 0; box-shadow: none; filter: drop-shadow(0 6px 14px rgba(0,0,0,.4)); background: transparent; outline: 4px solid transparent; }
.ru-c .ru-mag-lens:focus-visible + .ru-mag-ring { box-shadow: 0 0 0 4px var(--ru-accent), 0 8px 26px rgba(0,0,0,.35); }
.ru-c .ru-mag-zoom { align-self: center; color: var(--ru-muted); font-weight: 700; }
/* Note prompt */
.ru-c .ru-np .ru-q { display: flex; gap: 10px; align-items: flex-start; }
.ru-c .ru-np-icon { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 8px; background: var(--ru-accent); color: var(--ru-accent-ink); }
/* Animated text */
.ru-c .ru-at { margin: 0; font-family: var(--ru-heading-font, inherit); font-weight: 800; letter-spacing: -.02em; line-height: 1.15; color: var(--ru-ink); }
.ru-c .ru-at-medium { font-size: 1.6em; } .ru-c .ru-at-large { font-size: clamp(1.9em, 4vw, 2.8em); } .ru-c .ru-at-xl { font-size: clamp(2.4em, 6vw, 4.2em); }
.ru-c .ru-at-replay { cursor: pointer; }
.ru-c .ru-at-w { display: inline-block; opacity: 0; transform: translateY(.6em); transition: opacity .5s, transform .6s cubic-bezier(.2,.8,.2,1); transition-delay: calc(var(--ru-i) * 45ms); }
.ru-c .ru-at-l { display: inline-block; opacity: 0; filter: blur(6px); transition: opacity .5s, filter .5s; transition-delay: calc(var(--ru-i) * 28ms); }
.ru-c .ru-at.is-in .ru-at-w, .ru-c .ru-at.is-in .ru-at-l { opacity: 1; transform: none; filter: none; }
.ru-c .ru-at-mark { background: linear-gradient(transparent 55%, color-mix(in srgb, var(--ru-accent) 45%, transparent) 55%) no-repeat 0 0 / 0% 100%; color: inherit; transition: background-size 1.1s cubic-bezier(.3,.7,.2,1) .2s; padding: 0 .05em; }
.ru-c .ru-at.is-in .ru-at-mark { background-size: 100% 100%; }
.ru-c .ru-at-caret { display: inline-block; width: .08em; height: .95em; margin-left: .05em; vertical-align: -.1em; background: var(--ru-accent); animation: ru-blink 1s steps(2) infinite; }
@keyframes ru-blink { 50% { opacity: 0; } }
.ru-c .ru-at-decode { font-variant-numeric: tabular-nums; }
.ru-c .ru-at-shimmer > span { background: linear-gradient(100deg, var(--ru-ink) 30%, var(--ru-accent) 50%, var(--ru-ink) 70%) 0 0 / 250% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; }
.ru-c .ru-at-shimmer.is-in > span { animation: ru-shimmer 2.4s ease-in-out 1; animation-fill-mode: both; }
@keyframes ru-shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
/* Stats reveal */
.ru-c .ru-st { padding: clamp(20px, 4vw, 36px); border-radius: calc(var(--ru-radius) + 4px); }
.ru-c .ru-st-dark { background: radial-gradient(ellipse at 50% 0, color-mix(in srgb, var(--ru-accent) 18%, #14110f), #070707 60%); color: #f2f2f2; }
.ru-c .ru-st-light { background: var(--ru-soft); }
.ru-c .ru-st .ru-title { color: inherit; }
.ru-c .ru-st-count { opacity: .8; margin-bottom: 14px; }
.ru-c .ru-st-list { display: flex; flex-direction: column; gap: 10px; }
.ru-c .ru-st-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); border-radius: var(--ru-radius); overflow: hidden; border-left: 4px solid var(--ru-accent); opacity: 0; transform: translateY(18px); transition: opacity .5s, transform .6s cubic-bezier(.2,.8,.2,1); }
.ru-c .ru-st-row.is-in { opacity: 1; transform: none; }
.ru-c .ru-st-dark .ru-st-row { background: #121212; }
.ru-c .ru-st-light .ru-st-row { background: var(--ru-card); box-shadow: 0 4px 14px rgba(0,0,0,.06); }
@media (max-width: 600px) { .ru-c .ru-st-row { grid-template-columns: 1fr; } }
.ru-c .ru-st-figure { display: flex; align-items: flex-start; justify-content: center; padding: 22px 16px; border-right: 1px solid rgba(127,127,127,.18); }
.ru-c .ru-st-num { font: 800 clamp(3.4em, 9vw, 6em)/.9 var(--ru-heading-font, inherit); font-stretch: condensed; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.ru-c .ru-st-affix { font: 800 2em/1 var(--ru-heading-font, inherit); color: var(--ru-accent-text, var(--ru-accent)); margin: .15em .1em 0; }
.ru-c .ru-st-dark .ru-st-affix { color: color-mix(in srgb, var(--ru-accent) 70%, #ffffff); }
.ru-c .ru-st-copy { padding: 22px 24px; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
.ru-c .ru-st-label { text-transform: uppercase; letter-spacing: .12em; font-size: .8em; font-weight: 800; opacity: .75; }
.ru-c .ru-st-more { align-self: flex-start; border-radius: 6px; text-transform: uppercase; letter-spacing: .1em; font-size: .8em; }
.ru-c .ru-st-dark .ru-btn-ghost { color: #fff; border-color: color-mix(in srgb, var(--ru-accent) 70%, #ffffff); }
.ru-c .ru-st-dark .ru-st-actions .ru-btn:not(.ru-btn-ghost) { background: var(--ru-accent); }
.ru-c .ru-st-foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
.ru-c .ru-st-source { font-size: .85em; opacity: .7; text-align: right; max-width: 30em; margin-left: auto; }
/* Timer */
.ru-c .ru-tm { padding: clamp(20px, 4vw, 34px); border-radius: calc(var(--ru-radius) + 4px); text-align: center; background: linear-gradient(135deg, #17262c, #22414c); color: #fff; }
.ru-c .ru-tm .ru-title { color: inherit; font-weight: 400; letter-spacing: .02em; }
.ru-c .ru-tm-prompt { max-width: 34em; margin: 0 auto 10px; opacity: .85; }
.ru-c .ru-tm-face { position: relative; width: min(280px, 80%); margin: 10px auto; aspect-ratio: 1; }
.ru-c .ru-tm-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
.ru-c .ru-tm-ring circle { fill: none; stroke-width: 6; }
.ru-c .ru-tm-track { stroke: rgba(255,255,255,.1); fill: rgba(64,170,150,.16) !important; }
.ru-c .ru-tm-bar { stroke: #4fd1b3; stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
.ru-c .ru-tm-centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ru-c .ru-tm-time { font: 800 clamp(2.6em, 8vw, 3.6em)/1 var(--ru-heading-font, inherit); font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.ru-c .ru-tm-state { text-transform: uppercase; letter-spacing: .16em; font-size: .78em; opacity: .8; margin-top: 6px; }
.ru-c .ru-tm.is-running .ru-tm-face { animation: ru-breathe 6s ease-in-out infinite; }
@keyframes ru-breathe { 50% { transform: scale(1.03); } }
.ru-c .ru-tm-actions { justify-content: center; }
.ru-c .ru-tm .ru-btn-ghost { color: #fff; border-color: rgba(255,255,255,.5); }
.ru-c .ru-tm-sound { width: 44px; height: 44px; border-radius: 50%; border: 2px solid rgba(255,255,255,.4); background: none; cursor: pointer; font-size: 16px; }
.ru-c .ru-tm-sound[aria-pressed="false"] { opacity: .6; }
.ru-c .ru-tm-msg { margin-top: 12px; font-weight: 700; color: #4fd1b3; }
.ru-c .ru-tm-msg:empty { display: none; }
/* Confidence check */
.ru-c .ru-cf { padding: clamp(18px, 3vw, 28px); border-radius: var(--ru-radius); background: var(--ru-card); box-shadow: 0 4px 18px rgba(0,0,0,.08); }
.ru-c .ru-cf-note { padding: 12px 14px; margin-bottom: 14px; border-left: 4px solid #e0a100; background: #fdf6e6; color: #4a3b10; border-radius: 6px; font-size: .95em; }
.ru-c .ru-cf-note.is-found { border-color: var(--ru-accent); background: color-mix(in srgb, var(--ru-accent) 8%, #fff); color: var(--ru-ink); }
.ru-c .ru-cf-scale > .ru-q { padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--ru-line); width: 100%; }
.ru-c .ru-cf-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; padding: 10px; border-radius: var(--ru-radius); background: var(--ru-soft); }
@media (max-width: 520px) { .ru-c .ru-cf-row { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; } .ru-c .ru-cf-label { font-size: .7em; } }
.ru-c .ru-cf-opt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 6px; border-radius: 10px; background: var(--ru-card); cursor: pointer; text-align: center; border: 2px solid transparent; transition: transform .15s, border-color .15s; }
.ru-c .ru-cf-opt:hover { transform: translateY(-2px); }
.ru-c .is-selected .ru-cf-opt { border-color: var(--ru-accent); background: color-mix(in srgb, var(--ru-accent) 10%, var(--ru-card)); }
.ru-c .ru-opt-input:focus-visible + .ru-cf-opt { outline: 3px solid var(--ru-accent); outline-offset: 2px; }
.ru-c .ru-cf-icon { font-size: 28px; line-height: 1; filter: grayscale(.6); }
.ru-c .ru-cf-stars { font-size: 13px; color: #e0a100; filter: none; }
.ru-c .ru-cf-numbers { font: 800 22px/1 var(--ru-heading-font, inherit); color: var(--ru-accent-text, var(--ru-accent)); filter: none; }
.ru-c .is-selected .ru-cf-icon { filter: none; transform: scale(1.15); }
.ru-c .ru-cf-label { font-size: .85em; font-weight: 700; }
.ru-c .ru-cf-opt.was-before { box-shadow: inset 0 0 0 2px dashed; outline: 2px dashed var(--ru-muted); outline-offset: -6px; }
.ru-c .ru-cf-was { position: absolute; top: -9px; left: 50%; transform: translateX(-50%); padding: 1px 8px; border-radius: 99px; background: var(--ru-ink); color: #fff; font-size: .65em; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
.ru-c .ru-cf-actions { justify-content: center; }
.ru-c .ru-cf-msg { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; text-align: center; font-weight: 600; }
.ru-c .ru-cf-msg.is-up strong { color: #1d7a46; } .ru-c .ru-cf-msg.is-down strong { color: #b3261e; } .ru-c .ru-cf-msg.is-ok { color: var(--ru-accent-text, var(--ru-accent)); }
/* Certificate */
.ru-c .ru-ct { position: relative; overflow: hidden; aspect-ratio: 1.414; padding: 6% 8%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: #fff; color: #1d2330; border-radius: 6px; box-shadow: 0 10px 40px rgba(0,0,0,.15); }
.ru-c .ru-ct-logo { max-height: 56px; max-width: 180px; margin-bottom: 4%; object-fit: contain; }
.ru-c .ru-ct-heading { font: 800 clamp(1.1em, 3vw, 2em)/1.1 var(--ru-heading-font, inherit); text-transform: uppercase; letter-spacing: .12em; color: var(--ru-accent-text, var(--ru-accent)); }
.ru-c .ru-ct-text { margin-top: 3%; color: #5b6475; font-size: clamp(.8em, 1.6vw, 1em); }
.ru-c .ru-ct-name { margin-top: 1%; font: 700 clamp(1.6em, 5vw, 3em)/1.1 Georgia, 'Times New Roman', serif; font-style: italic; border-bottom: 2px solid #d9dde5; padding: 0 1em .1em; }
.ru-c .ru-ct-course { margin-top: 1%; font: 800 clamp(1em, 2.6vw, 1.5em)/1.2 var(--ru-heading-font, inherit); }
.ru-c .ru-ct-foot { display: flex; justify-content: space-around; width: 100%; margin-top: 6%; gap: 20px; }
.ru-c .ru-ct-line { padding: 0 1em .2em; border-bottom: 1px solid #b9bfca; font-weight: 700; font-size: clamp(.75em, 1.6vw, 1em); }
.ru-c .ru-ct-sign { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: clamp(1em, 2.4vw, 1.4em); font-weight: 400; }
.ru-c .ru-ct-small { font-size: .75em; color: #5b6475; margin-top: 4px; }
.ru-c .ru-ct-modern { border-top: 14px solid var(--ru-accent); }
.ru-c .ru-ct-modern .ru-ct-corner { position: absolute; right: -60px; bottom: -60px; width: 200px; height: 200px; border-radius: 50%; background: color-mix(in srgb, var(--ru-accent) 14%, transparent); }
.ru-c .ru-ct-classic { box-shadow: inset 0 0 0 10px #fff, inset 0 0 0 12px var(--ru-accent), inset 0 0 0 18px #fff, inset 0 0 0 19px color-mix(in srgb, var(--ru-accent) 45%, #fff), 0 10px 40px rgba(0,0,0,.15); background: #fffdf7; }
.ru-c .ru-ct-classic .ru-ct-heading { font-family: Georgia, serif; text-transform: none; letter-spacing: .02em; font-weight: 700; }
.ru-c .ru-ct-bold { background: var(--ru-accent); color: var(--ru-accent-ink); }
.ru-c .ru-ct-bold .ru-ct-heading, .ru-c .ru-ct-bold .ru-ct-text, .ru-c .ru-ct-bold .ru-ct-small { color: inherit; opacity: .9; }
.ru-c .ru-ct-bold .ru-ct-name { border-color: currentColor; }
.ru-c .ru-ct-bold .ru-ct-line { border-color: currentColor; }
.ru-c .ru-ct-form { margin-top: 16px; }
.ru-c .ru-ct-input { flex: 1; min-width: 200px; padding: 10px 14px; border: 2px solid var(--ru-line); border-radius: 999px; font: inherit; background: var(--ru-card); color: var(--ru-ink); }
/* Swipe cards */
.ru-c .ru-sw-labels { display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: var(--ru-muted); max-width: 440px; margin: 6px auto 8px; }
.ru-c .ru-sw-count { font-weight: 600; font-size: .9em; }
.ru-c .ru-sw-stack { position: relative; height: 300px; max-width: 360px; margin: 0 auto; }
.ru-c .ru-sw-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; border-radius: calc(var(--ru-radius) + 4px); background: var(--ru-card); box-shadow: 0 12px 30px rgba(0,0,0,.14); text-align: center; touch-action: none; user-select: none; transform: translateY(calc(var(--ru-d) * 12px)) scale(calc(1 - var(--ru-d) * .05)); transition: transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s; cursor: grab; border: 2px solid var(--ru-line); }
.ru-c .ru-sw-card.is-dragging { transition: none; cursor: grabbing; }
.ru-c .ru-sw-card[aria-hidden="true"] > * { visibility: hidden; } /* cards waiting underneath stay blank */
.ru-c .ru-sw-card.is-gone { opacity: 0; }
.ru-c .ru-sw-card:focus-visible { outline: 3px solid var(--ru-accent); outline-offset: 3px; }
.ru-c .ru-sw-card img { max-height: 120px; border-radius: 10px; }
.ru-c .ru-sw-text { font: 700 1.25em/1.3 var(--ru-heading-font, inherit); }
.ru-c .ru-sw-stamp { position: absolute; top: 18px; padding: 4px 12px; border: 3px solid; border-radius: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; opacity: 0; transition: opacity .15s; }
.ru-c .ru-sw-stamp-yes { left: 18px; color: #1d7a46; transform: rotate(-12deg); } .ru-c .ru-sw-stamp-no { right: 18px; color: #b3261e; transform: rotate(12deg); }
.ru-c .is-yes .ru-sw-stamp-yes, .ru-c .is-no .ru-sw-stamp-no { opacity: 1; }
.ru-c .ru-sw-controls { display: flex; justify-content: center; gap: 12px; margin-top: 18px; }
.ru-c .ru-sw-controls[hidden] { display: none; }
.ru-c .ru-sw-no { background: var(--ru-card); color: #b3261e; border-color: #b3261e; }
.ru-c .ru-sw-yes { background: var(--ru-card); color: #1d7a46; border-color: #1d7a46; }
.ru-c .ru-sw-fb { max-width: 460px; margin: 14px auto 0; display: flex; flex-direction: column; gap: 2px; text-align: center; min-height: 1.5em; }
.ru-c .ru-sw-fb.is-right strong { color: #1d7a46; } .ru-c .ru-sw-fb.is-wrong strong { color: #b3261e; }
.ru-c .ru-sw-end { max-width: 520px; margin: 14px auto 0; text-align: center; }
.ru-c .ru-sw-end .ru-qfb-list { text-align: left; margin: 10px 0; }
.ru-c .ru-sw-score { font: 800 1.4em/1.2 var(--ru-heading-font, inherit); }
/* Dividers */
.ru-c .ru-dv { display: flex; align-items: center; justify-content: center; gap: 14px; margin: 18px 0; color: var(--ru-accent-text, var(--ru-accent)); }
.ru-c .ru-dv-rule { flex: 1; height: 2px; background: var(--ru-line); }
.ru-c .ru-dv-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--ru-accent); box-shadow: 0 0 0 6px color-mix(in srgb, var(--ru-accent) 18%, transparent); }
.ru-c .ru-dv-grad { width: 100%; height: 8px; border-radius: 8px; background: linear-gradient(90deg, transparent, var(--ru-accent), color-mix(in srgb, var(--ru-accent) 40%, #ffd56b), transparent); }
.ru-c .ru-dv-svg { width: 100%; height: 26px; overflow: visible; }
.ru-c .ru-dv-svg path { fill: none; stroke: var(--ru-accent); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.ru-c .ru-dv-dots span { width: 10px; height: 10px; border-radius: 50%; background: var(--ru-accent); }
.ru-c .ru-dv-dots span:nth-child(2) { opacity: .6; } .ru-c .ru-dv-dots span:nth-child(3) { opacity: .3; }
.ru-c .ru-dv-chapter { justify-content: flex-start; }
.ru-c .ru-dv-num { font: 900 2.6em/1 var(--ru-heading-font, inherit); letter-spacing: -.04em; }
.ru-c .ru-dv-ctext { font: 800 1.2em/1.2 var(--ru-heading-font, inherit); color: var(--ru-ink); text-transform: uppercase; letter-spacing: .06em; }
.ru-c .ru-dv-banner { width: 100vw; margin-left: calc(50% - 50vw); padding: 36px 20px; background: #2b2b2b; color: #fff; }
.ru-c .ru-dv-btext { font: 800 clamp(1.3em, 3vw, 1.8em)/1.2 var(--ru-heading-font, inherit); text-align: center; }
.ru-c .ru-dv-ico { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; border: 2px solid var(--ru-accent); font-size: 20px; }
.ru-c .ru-dv-slant { width: 100vw; margin-left: calc(50% - 50vw); padding: 44px 20px; background: var(--ru-accent); color: var(--ru-accent-ink); clip-path: polygon(0 18%, 100% 0, 100% 82%, 0 100%); }
.ru-c .ru-dv-stext { font: 800 clamp(1.2em, 2.6vw, 1.6em)/1.2 var(--ru-heading-font, inherit); text-align: center; }
.ru-c .ru-dv-scroll { flex-direction: column; gap: 6px; color: var(--ru-muted); }
.ru-c .ru-dv-sctext { text-transform: uppercase; letter-spacing: .14em; font-size: .8em; font-weight: 800; }
.ru-c .ru-dv-chev { width: 16px; height: 16px; border-right: 3px solid var(--ru-accent); border-bottom: 3px solid var(--ru-accent); transform: rotate(45deg); animation: ru-bob 1.6s ease-in-out infinite; }
@keyframes ru-bob { 50% { transform: translateY(6px) rotate(45deg); } }
/* Checklist */
.ru-c .ru-cl { padding: clamp(18px, 3vw, 26px); border-radius: var(--ru-radius); background: var(--ru-soft); }
.ru-c .ru-cl-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.ru-c .ru-cl-head .ru-title { margin-bottom: 6px; }
.ru-c .ru-cl-count { font-weight: 700; color: var(--ru-muted); }
.ru-c .ru-cl-bar { display: block; height: 6px; border-radius: 6px; background: var(--ru-line); overflow: hidden; margin-bottom: 14px; }
.ru-c .ru-cl-fill { display: block; height: 100%; background: var(--ru-accent); transition: width .5s ease; }
.ru-c .ru-cl-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.ru-c .ru-cl-item { position: relative; }
.ru-c .ru-cl-label { display: flex; gap: 14px; align-items: flex-start; padding: 12px 14px; border-radius: 10px; background: var(--ru-card); cursor: pointer; transition: background .2s; }
.ru-c .ru-opt-input:focus-visible + .ru-cl-label { outline: 3px solid var(--ru-accent); outline-offset: 2px; }
.ru-c .ru-cl-box { flex: none; position: relative; width: 24px; height: 24px; border-radius: 7px; border: 2px solid var(--ru-accent); transition: background .2s, transform .2s; }
.ru-c .is-done .ru-cl-box { background: var(--ru-accent); animation: ru-tick .35s cubic-bezier(.2,.8,.2,1.4); }
.ru-c .is-done .ru-cl-box::after { content: ""; position: absolute; left: 7px; top: 2px; width: 6px; height: 12px; border: solid var(--ru-accent-ink); border-width: 0 3px 3px 0; transform: rotate(45deg); }
@keyframes ru-tick { 50% { transform: scale(1.2); } }
.ru-c .ru-cl-text { display: flex; flex-direction: column; }
.ru-c .ru-cl-main { position: relative; align-self: flex-start; font-weight: 600; transition: color .3s; }
.ru-c .ru-cl-main::after { content: ""; position: absolute; left: 0; top: 52%; height: 2px; width: 0; background: currentColor; transition: width .35s ease; }
.ru-c .is-done .ru-cl-main { color: var(--ru-muted); }
.ru-c .is-done .ru-cl-main::after { width: 100%; }
.ru-c .ru-cl-detail { font-size: .88em; color: var(--ru-muted); }
.ru-c .ru-cl-done { margin-top: 10px; font-weight: 800; color: var(--ru-accent-text, var(--ru-accent)); }
.ru-c .ru-cl-done:empty { display: none; }
.ru-c .ru-cl.is-celebrate .ru-cl-done { animation: ru-collect .7s cubic-bezier(.2,.8,.2,1.4); }
@media (prefers-reduced-motion: reduce) {
  .ru-c .ru-at-w, .ru-c .ru-at-l, .ru-c .ru-at-mark, .ru-c .ru-st-row, .ru-c .ru-sw-card, .ru-c .ru-cl-main::after, .ru-c .ru-tm-bar { transition: none !important; }
  .ru-c .ru-tm.is-running .ru-tm-face, .ru-c .ru-dv-chev, .ru-c .ru-at-caret, .ru-c .ru-at-shimmer.is-in > span { animation: none !important; }
}
`;
  RU.COMPONENT_CSS += EXTRA_CSS;

  return { makePdf, notesPdf, downloadBytes, pdfText, DIVIDERS };
});
