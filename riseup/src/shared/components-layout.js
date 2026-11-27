/*
 * RiseUp blocks, part 4: tabs, click-to-reveal sections, interactive
 * timelines, scratch cards, labelled graphics, text with hover definitions
 * and pop-ups, a click-to-reveal checklist and card layouts.
 * Load after components.js, components-more.js and components-extra.js.
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
  const reducedMotion = RU._reducedMotion;
  const safeUrl = RU.safeUrl;
  const emitScore = RU.emitScore;
  const button = (doc, text, cls, onclick, attrs) => el(doc, 'button', Object.assign({ type: 'button', class: 'ru-btn' + (cls ? ' ' + cls : ''), text, onclick }, attrs || {}));
  let uidN = 0;
  const uid = (p) => p + '-' + (++uidN) + '-' + Math.random().toString(36).slice(2, 6);
  /** Text with line breaks into paragraphs. */
  const paras = (doc, text, cls) => String(text || '').split(/\n{2,}/).filter((t) => t.trim()).map((t) => el(doc, 'p', { class: cls || 'ru-pre', text: t.trim() }));

  // ================================================================== Tabs
  TYPES.tabs = {
    label: 'Tabs', kind: 'interactive',
    description: 'Content split into tabs learners switch between.',
    fields: [
      { key: 'style', label: 'Style', type: 'select', options: [['underline', 'Underline'], ['pills', 'Pills'], ['side', 'Side (vertical)']] },
      { key: 'tabs', label: 'Tabs', type: 'list', itemLabel: 'Tab', min: 2, max: 8, fields: [
        { key: 'label', label: 'Tab name', type: 'text' },
        { key: 'heading', label: 'Heading (optional)', type: 'text' },
        { key: 'text', label: 'Text (blank line for a new paragraph)', type: 'textarea' },
        { key: 'image', label: 'Image (optional)', type: 'image' },
      ] },
    ],
    defaults: () => ({ style: 'underline', tabs: [
      { label: 'Spot it', heading: 'Spot the hazard', text: 'Look out for anything that could cause harm: trailing cables, spills, blocked exits.', image: '' },
      { label: 'Stop it', heading: 'Make it safe', text: 'If you can do so safely, stop others getting hurt. Put out a sign or close the area.', image: '' },
      { label: 'Report it', heading: 'Report it', text: 'Log it in the safety app within 24 hours, even if nobody was hurt.', image: '' },
    ] }),
    render(doc, d) {
      const tabs = (d.tabs || []).filter((t) => t.label || t.text);
      const id = uid('ru-tab');
      let current = 0;
      const list = el(doc, 'div', { class: 'ru-tabs-list', role: 'tablist', 'aria-orientation': d.style === 'side' ? 'vertical' : 'horizontal' });
      const panels = [];
      const buttons = tabs.map((t, i) => {
        const b = el(doc, 'button', { type: 'button', role: 'tab', id: id + '-t' + i, 'aria-controls': id + '-p' + i, class: 'ru-tabs-tab', text: t.label || 'Tab ' + (i + 1) });
        b.addEventListener('click', () => select(i, true));
        b.addEventListener('keydown', (e) => {
          const prev = d.style === 'side' ? 'ArrowUp' : 'ArrowLeft';
          const next = d.style === 'side' ? 'ArrowDown' : 'ArrowRight';
          const k = { [prev]: current - 1, [next]: current + 1, Home: 0, End: tabs.length - 1 }[e.key];
          if (k === undefined) return;
          e.preventDefault();
          select((k + tabs.length) % tabs.length, true);
        });
        list.appendChild(b);
        const img = safeUrl(t.image, 'image');
        panels.push(el(doc, 'div', { role: 'tabpanel', id: id + '-p' + i, 'aria-labelledby': id + '-t' + i, class: 'ru-tabs-panel', tabindex: '0', hidden: i !== 0 }, [
          img ? el(doc, 'img', { src: img, alt: '', class: 'ru-tabs-img' }) : null,
          el(doc, 'div', null, [t.heading ? el(doc, 'h4', { class: 'ru-tabs-h', text: t.heading }) : null, ...paras(doc, t.text)]),
        ]));
        return b;
      });
      function select(i, focus) {
        current = i;
        buttons.forEach((b, k) => { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
        panels.forEach((p, k) => { p.hidden = k !== i; });
        if (focus) buttons[i].focus();
      }
      select(0);
      return el(doc, 'section', { class: 'ru-tabs ru-tabs-' + (['pills', 'side'].includes(d.style) ? d.style : 'underline') }, [list, el(doc, 'div', { class: 'ru-tabs-panels' }, panels)]);
    },
  };

  // ================================================================== Click to reveal (accordion)
  TYPES.accordion = {
    label: 'Click to reveal', kind: 'interactive',
    description: 'Sections that open and close, like a concertina.',
    fields: [
      { key: 'title', label: 'Title (optional)', type: 'text' },
      { key: 'style', label: 'Style', type: 'select', options: [['cards', 'Cards'], ['numbered', 'Numbered'], ['minimal', 'Minimal lines']] },
      { key: 'single', label: 'Only one open at a time', type: 'checkbox' },
      { key: 'items', label: 'Sections', type: 'list', itemLabel: 'Section', min: 1, max: 12, fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea' },
        { key: 'image', label: 'Image (optional)', type: 'image' },
      ] },
    ],
    defaults: () => ({ title: '', style: 'numbered', single: true, items: [
      { title: 'What counts as a hazard?', text: 'Anything with the potential to cause harm, from a wet floor to a faulty plug.', image: '' },
      { title: 'Who should I tell?', text: 'Your supervisor first. If they’re not around, any member of the safety team.', image: '' },
      { title: 'What if nobody was hurt?', text: 'Report it anyway. Near misses are the warnings that stop the next accident.', image: '' },
    ] }),
    render(doc, d) {
      const id = uid('ru-acc');
      const items = (d.items || []).filter((i) => i.title || i.text);
      const rows = items.map((it, i) => {
        const img = safeUrl(it.image, 'image');
        const body = el(doc, 'div', { class: 'ru-acc-body', id: id + '-' + i, role: 'region', 'aria-labelledby': id + '-b' + i, hidden: true }, [el(doc, 'div', { class: 'ru-acc-inner' }, [img ? el(doc, 'img', { src: img, alt: '' }) : null, ...paras(doc, it.text)])]);
        const btn = el(doc, 'button', { type: 'button', class: 'ru-acc-btn', id: id + '-b' + i, 'aria-expanded': 'false', 'aria-controls': id + '-' + i }, [
          d.style === 'numbered' ? el(doc, 'span', { class: 'ru-acc-num', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') }) : null,
          el(doc, 'span', { class: 'ru-acc-title', text: it.title || 'Section ' + (i + 1) }),
          el(doc, 'span', { class: 'ru-acc-icon', 'aria-hidden': 'true' }),
        ]);
        const row = el(doc, 'div', { class: 'ru-acc-item' }, [el(doc, 'h4', { class: 'ru-acc-h' }, [btn]), body]);
        btn.addEventListener('click', () => toggle(i));
        return { row, btn, body };
      });
      function toggle(i) {
        const open = rows[i].btn.getAttribute('aria-expanded') !== 'true';
        rows.forEach((r, k) => {
          const on = k === i ? open : (d.single !== false ? false : r.btn.getAttribute('aria-expanded') === 'true');
          r.btn.setAttribute('aria-expanded', String(on));
          r.body.hidden = !on;
          r.row.classList.toggle('is-open', on);
        });
      }
      return el(doc, 'section', { class: 'ru-acc ru-acc-' + (['cards', 'numbered', 'minimal'].includes(d.style) ? d.style : 'cards') }, [d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null, ...rows.map((r) => r.row)]);
    },
  };

  // ================================================================== Interactive timeline
  TYPES.itimeline = {
    label: 'Interactive timeline', kind: 'interactive',
    description: 'Events learners explore: a horizontal line of points, expanding cards, or a step-by-step stepper.',
    fields: [
      { key: 'title', label: 'Title (optional)', type: 'text' },
      { key: 'style', label: 'Style', type: 'select', options: [['horizontal', 'Horizontal: select points on a line'], ['cards', 'Vertical: cards that expand'], ['stepper', 'Stepper: one event at a time']] },
      { key: 'events', label: 'Events', type: 'list', itemLabel: 'Event', min: 2, max: 12, fields: [
        { key: 'date', label: 'Date or step', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Detail', type: 'textarea' },
        { key: 'image', label: 'Image (optional)', type: 'image' },
      ] },
    ],
    defaults: () => ({ title: 'How safety law developed', style: 'horizontal', events: [
      { date: '1833', title: 'Factory Act', text: 'Limited working hours for children in textile mills.', image: '' },
      { date: '1974', title: 'Health and Safety at Work Act', text: 'Made employers responsible for the health and safety of everyone at work.', image: '' },
      { date: '1999', title: 'Management Regulations', text: 'Required risk assessments for every workplace.', image: '' },
      { date: '2005', title: 'Fire Safety Order', text: 'Made a “responsible person” accountable for fire safety in each building.', image: '' },
    ] }),
    render(doc, d) {
      const events = (d.events || []).filter((e) => e.title || e.date);
      const style = ['horizontal', 'cards', 'stepper'].includes(d.style) ? d.style : 'horizontal';
      const id = uid('ru-itl');
      const detail = (e) => {
        const img = safeUrl(e.image, 'image');
        return el(doc, 'div', { class: 'ru-itl-detail' }, [img ? el(doc, 'img', { src: img, alt: '' }) : null, el(doc, 'div', null, [
          e.date ? el(doc, 'p', { class: 'ru-itl-date', text: e.date }) : null, el(doc, 'h4', { class: 'ru-itl-title', text: e.title || '' }), ...paras(doc, e.text)])]);
      };
      let body;
      if (style === 'horizontal') {
        const panel = el(doc, 'div', { class: 'ru-itl-panel', role: 'region', 'aria-live': 'polite' });
        const track = el(doc, 'div', { class: 'ru-itl-track', role: 'tablist', 'aria-label': 'Events' });
        const dots = events.map((e, i) => {
          const b = el(doc, 'button', { type: 'button', role: 'tab', class: 'ru-itl-point', style: '--ru-i:' + i, 'aria-selected': 'false' }, [
            el(doc, 'span', { class: 'ru-itl-dot', 'aria-hidden': 'true' }), el(doc, 'span', { class: 'ru-itl-plabel', text: e.date || String(i + 1) }), el(doc, 'span', { class: 'ru-itl-ptitle', text: e.title || '' })]);
          b.addEventListener('click', () => pick(i));
          b.addEventListener('keydown', (ev) => { const k = { ArrowLeft: i - 1, ArrowRight: i + 1 }[ev.key]; if (k !== undefined && k >= 0 && k < events.length) { ev.preventDefault(); pick(k); dots[k].focus(); } });
          track.appendChild(b);
          return b;
        });
        const fill = el(doc, 'span', { class: 'ru-itl-fill', 'aria-hidden': 'true' });
        const seen = new Set();
        function pick(i) {
          seen.add(i);
          dots.forEach((b, k) => { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; b.classList.toggle('is-seen', seen.has(k)); });
          fill.style.width = (events.length > 1 ? (i / (events.length - 1)) * 100 : 0) + '%';
          panel.replaceChildren(detail(events[i]));
        }
        pick(0);
        body = [el(doc, 'div', { class: 'ru-itl-rail' }, [el(doc, 'span', { class: 'ru-itl-line', 'aria-hidden': 'true' }, [fill]), track]), panel];
      } else if (style === 'cards') {
        body = [el(doc, 'ol', { class: 'ru-itl-cards' }, events.map((e, i) => {
          const panelId = id + '-c' + i;
          const more = el(doc, 'div', { class: 'ru-itl-more', id: panelId, hidden: true }, [detail(Object.assign({}, e, { date: '', title: '' }))]);
          const b = el(doc, 'button', { type: 'button', class: 'ru-itl-card', 'aria-expanded': 'false', 'aria-controls': panelId }, [
            el(doc, 'span', { class: 'ru-itl-date', text: e.date || '' }), el(doc, 'span', { class: 'ru-itl-title', text: e.title || '' }), el(doc, 'span', { class: 'ru-acc-icon', 'aria-hidden': 'true' })]);
          b.addEventListener('click', () => { const open = more.hidden; more.hidden = !open; b.setAttribute('aria-expanded', String(open)); li.classList.toggle('is-open', open); });
          const li = el(doc, 'li', { class: 'ru-itl-li' + (i % 2 ? ' is-right' : '') }, [el(doc, 'span', { class: 'ru-itl-node', 'aria-hidden': 'true' }), el(doc, 'div', { class: 'ru-itl-box' }, [b, more])]);
          return li;
        }))];
      } else {
        let i = 0;
        const stage = el(doc, 'div', { class: 'ru-itl-stage', 'aria-live': 'polite' });
        const bar = el(doc, 'span', { class: 'ru-itl-pfill' });
        const count = el(doc, 'span', { class: 'ru-itl-count' });
        const prev = button(doc, '← Back', 'ru-btn-ghost', () => go(i - 1));
        const next = button(doc, 'Next →', '', () => go(i + 1));
        const dates = el(doc, 'div', { class: 'ru-itl-dates', 'aria-hidden': 'true' }, events.map((e) => el(doc, 'span', { text: e.date || '' })));
        function go(k) {
          if (k < 0 || k >= events.length) return;
          const dir = k > i ? 'is-fwd' : 'is-back';
          i = k;
          const card = detail(events[i]);
          card.classList.add(dir);
          stage.replaceChildren(card);
          bar.style.width = ((i + 1) / events.length) * 100 + '%';
          count.textContent = (i + 1) + ' of ' + events.length;
          prev.disabled = i === 0;
          next.disabled = i === events.length - 1;
          Array.from(dates.children).forEach((s, n) => s.classList.toggle('is-on', n <= i));
        }
        go(0);
        body = [el(doc, 'span', { class: 'ru-itl-pbar', 'aria-hidden': 'true' }, [bar]), dates, stage, el(doc, 'div', { class: 'ru-itl-nav' }, [prev, count, next])];
      }
      return el(doc, 'section', { class: 'ru-itl ru-itl-' + style }, [d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null, ...body]);
    },
  };

  // ================================================================== Scratch card
  TYPES.scratch = {
    label: 'Scratch card', kind: 'interactive',
    description: 'Learners scratch away a cover to reveal a message, fact or image underneath.',
    fields: [
      { key: 'title', label: 'Instructions', type: 'text' },
      { key: 'cover', label: 'Text on the cover', type: 'text' },
      { key: 'cards', label: 'Cards', type: 'list', itemLabel: 'Card', min: 1, max: 6, fields: [
        { key: 'heading', label: 'Hidden heading', type: 'text' },
        { key: 'text', label: 'Hidden text', type: 'textarea' },
        { key: 'image', label: 'Hidden image (optional)', type: 'image' },
      ] },
    ],
    defaults: () => ({ title: 'Scratch each card to reveal a fact.', cover: 'Scratch here', cards: [
      { heading: '1 in 3', text: 'workplace fires start in kitchens or staff rooms.', image: '' },
      { heading: '2 minutes', text: 'is all it can take for a small fire to fill a room with smoke.', image: '' },
      { heading: '90%', text: 'of fires are put out with a single extinguisher when caught early.', image: '' },
    ] }),
    render(doc, d) {
      const win = doc.defaultView;
      const cards = (d.cards || []).filter((c) => c.heading || c.text || c.image);
      const grid = el(doc, 'div', { class: 'ru-scr-grid ru-scr-n' + Math.min(3, cards.length) });
      const live = el(doc, 'p', { class: 'ru-sr', 'aria-live': 'polite' });
      cards.forEach((c, i) => {
        const img = safeUrl(c.image, 'image');
        const under = el(doc, 'div', { class: 'ru-scr-under' }, [img ? el(doc, 'img', { src: img, alt: '' }) : null, c.heading ? el(doc, 'p', { class: 'ru-scr-h', text: c.heading }) : null, c.text ? el(doc, 'p', { text: c.text }) : null]);
        const canvas = el(doc, 'canvas', { class: 'ru-scr-canvas', 'aria-hidden': 'true' });
        const reveal = el(doc, 'button', { type: 'button', class: 'ru-scr-reveal', text: 'Reveal card ' + (i + 1) });
        const card = el(doc, 'div', { class: 'ru-scr-card' }, [under, canvas, reveal]);
        grid.appendChild(card);
        let ctx2d = null;
        let w = 0; let h = 0;
        let done = false;
        function paint() {
          const r = card.getBoundingClientRect();
          w = Math.max(1, Math.round(r.width || 240)); h = Math.max(1, Math.round(r.height || 200));
          canvas.width = w; canvas.height = h;
          ctx2d = canvas.getContext && canvas.getContext('2d');
          if (!ctx2d || done) return;
          const accent = win.getComputedStyle(card).getPropertyValue('--ru-accent').trim() || '#2f6fde';
          const g = ctx2d.createLinearGradient(0, 0, w, h);
          g.addColorStop(0, '#c9ced8'); g.addColorStop(0.45, '#eef0f4'); g.addColorStop(0.55, '#dfe3ea'); g.addColorStop(1, '#b6bcc8');
          ctx2d.fillStyle = g; ctx2d.fillRect(0, 0, w, h);
          ctx2d.fillStyle = 'rgba(255,255,255,.35)';
          for (let k = 0; k < 160; k++) ctx2d.fillRect(Math.random() * w, Math.random() * h, 2, 2);
          ctx2d.fillStyle = accent;
          ctx2d.font = '700 ' + Math.round(Math.min(w, h) / 9) + 'px sans-serif';
          ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
          ctx2d.fillText(d.cover || 'Scratch here', w / 2, h / 2);
        }
        function finish() {
          if (done) return;
          done = true;
          card.classList.add('is-revealed');
          reveal.hidden = true;
          live.textContent = 'Card ' + (i + 1) + ': ' + (c.heading || '') + ' ' + (c.text || '');
        }
        let last = null;
        let checks = 0;
        function scratch(x, y) {
          if (!ctx2d || done) return;
          ctx2d.globalCompositeOperation = 'destination-out';
          ctx2d.lineCap = 'round'; ctx2d.lineJoin = 'round'; ctx2d.lineWidth = Math.max(26, w / 9);
          ctx2d.beginPath();
          ctx2d.moveTo(last ? last.x : x, last ? last.y : y);
          ctx2d.lineTo(x, y);
          ctx2d.stroke();
          last = { x, y };
          if (++checks % 8 === 0) {
            // Revealed enough? Sample the cover's transparency.
            try {
              const px = ctx2d.getImageData(0, 0, w, h).data;
              let clear = 0; let total = 0;
              for (let p = 3; p < px.length; p += 4 * 24) { total++; if (px[p] < 40) clear++; }
              if (clear / total > 0.5) finish();
            } catch (e) { /* ignore */ }
          }
        }
        const point = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h }; };
        let down = false;
        canvas.addEventListener('pointerdown', (e) => { down = true; last = null; canvas.setPointerCapture(e.pointerId); const p = point(e); scratch(p.x, p.y); });
        canvas.addEventListener('pointermove', (e) => { if (down) { const p = point(e); scratch(p.x, p.y); } });
        canvas.addEventListener('pointerup', () => { down = false; last = null; });
        reveal.addEventListener('click', finish);
        if (win.requestAnimationFrame) win.requestAnimationFrame(paint); else paint();
        if (win.ResizeObserver) new win.ResizeObserver(() => { if (!done && !down) paint(); }).observe(card);
      });
      return el(doc, 'section', { class: 'ru-scr' }, [d.title ? el(doc, 'p', { class: 'ru-instr', text: d.title }) : null, grid, live]);
    },
  };

  // ================================================================== Labelled graphic
  TYPES.labelled = {
    label: 'Labelled graphic', kind: 'interactive',
    description: 'An image with labels: click text tags or numbered markers to learn more, or drag labels into place.',
    fields: [
      { key: 'title', label: 'Instructions', type: 'text' },
      { key: 'mode', label: 'Type', type: 'select', options: [['tags', 'Text labels on the image (click to reveal)'], ['list', 'Numbered markers with a list beside (click to reveal)'], ['dragdots', 'Drag labels onto marked points'], ['dragzones', 'Drag labels onto areas of the image']] },
      { key: 'image', label: 'Image', type: 'image', hotspotTarget: true },
      { key: 'alt', label: 'Image description (alt text)', type: 'text' },
      { key: 'labels', label: 'Labels', type: 'list', itemLabel: 'Label', min: 1, max: 10, fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'text', label: 'More information', type: 'textarea' },
        { key: 'x', label: 'Across (%)', type: 'number', min: 0, max: 100 },
        { key: 'y', label: 'Down (%)', type: 'number', min: 0, max: 100 },
      ] },
      { key: 'correctFeedback', label: 'Drag types: feedback when all are placed correctly', type: 'text' },
    ],
    defaults: () => ({ title: 'Select each label to find out more.', mode: 'tags', image: '', alt: '', labels: [
      { label: 'Fire exit', text: 'Keep clear at all times and never lock during working hours.', x: 20, y: 30 },
      { label: 'Extinguisher', text: 'CO₂ for electrical fires, water for paper and wood.', x: 72, y: 38 },
      { label: 'Call point', text: 'Break the glass to raise the alarm for the whole building.', x: 46, y: 72 },
    ], correctFeedback: 'All labels in the right place.' }),
    render(doc, d, ctx) {
      const mode = ['tags', 'list', 'dragdots', 'dragzones'].includes(d.mode) ? d.mode : 'tags';
      const img = safeUrl(d.image, 'image');
      const labels = (d.labels || []).filter((l) => l.label).map((l, i) => ({ label: l.label, text: l.text || '', x: Math.min(100, Math.max(0, Number(l.x) || 0)), y: Math.min(100, Math.max(0, Number(l.y) || 0)), i }));
      const stage = el(doc, 'div', { class: 'ru-lg-stage' }, [img ? el(doc, 'img', { src: img, alt: d.alt || '', class: 'ru-lg-img', draggable: 'false' }) : el(doc, 'div', { class: 'ru-hs-placeholder ru-lg-ph', role: 'img', 'aria-label': d.alt || 'Image' }, [el(doc, 'span', { text: 'Add an image' })])]);
      const info = el(doc, 'div', { class: 'ru-lg-info', 'aria-live': 'polite' });
      const live = el(doc, 'p', { class: 'ru-sr', 'aria-live': 'assertive' });
      const showInfo = (l) => info.replaceChildren(el(doc, 'h4', { class: 'ru-lg-ih', text: l.label }), ...paras(doc, l.text));
      let side = null;
      let extra = [];

      if (mode === 'tags' || mode === 'list') {
        const marks = labels.map((l) => {
          const b = el(doc, 'button', { type: 'button', class: mode === 'tags' ? 'ru-lg-tag' : 'ru-lg-pin', style: 'left:' + l.x + '%;top:' + l.y + '%', 'aria-pressed': 'false', text: mode === 'tags' ? l.label : String(l.i + 1), 'aria-label': mode === 'tags' ? null : (l.i + 1) + ': ' + l.label });
          b.addEventListener('click', () => select(l.i));
          stage.appendChild(b);
          return b;
        });
        let listBtns = [];
        if (mode === 'list') {
          side = el(doc, 'ol', { class: 'ru-lg-list' }, labels.map((l) => {
            const b = el(doc, 'button', { type: 'button', class: 'ru-lg-li', 'aria-pressed': 'false' }, [el(doc, 'span', { class: 'ru-lg-n', text: String(l.i + 1) }), el(doc, 'span', { text: l.label })]);
            b.addEventListener('click', () => select(l.i));
            listBtns.push(b);
            return el(doc, 'li', null, [b]);
          }));
        }
        const seen = new Set();
        function select(i) {
          seen.add(i);
          marks.concat(listBtns).forEach((b) => b.setAttribute('aria-pressed', 'false'));
          marks.forEach((b, k) => b.classList.toggle('is-seen', seen.has(k)));
          listBtns.forEach((b, k) => b.classList.toggle('is-seen', seen.has(k)));
          marks[i].setAttribute('aria-pressed', 'true');
          if (listBtns[i]) listBtns[i].setAttribute('aria-pressed', 'true');
          showInfo(labels[i]);
        }
        info.appendChild(el(doc, 'p', { class: 'ru-instr', text: mode === 'tags' ? 'Select a label on the image.' : 'Select a number on the image, or a label in the list.' }));
      } else {
        // Drag labels into place. Every target accepts any label; correct ones reveal more.
        const zones = mode === 'dragzones';
        const placed = new Map(); // target index -> label index
        let selected = null;
        let checked = false;
        const bank = el(doc, 'div', { class: 'ru-lg-bank', role: 'group', 'aria-label': 'Labels to place' });
        const actions = el(doc, 'div', { class: 'ru-actions' });
        const fb = el(doc, 'div', { class: 'ru-qfb', tabindex: '-1', hidden: true });
        const targets = labels.map((l) => {
          const t = el(doc, 'button', { type: 'button', class: zones ? 'ru-lg-zone' : 'ru-lg-target', style: 'left:' + l.x + '%;top:' + l.y + '%', 'aria-label': 'Target ' + (l.i + 1) + ', empty' }, [el(doc, 'span', { class: 'ru-lg-tlabel' })]);
          t.addEventListener('click', () => {
            if (checked) { if (placed.get(l.i) === l.i) showInfo(l); return; }
            if (selected !== null) { place(l.i, selected); return; }
            if (placed.has(l.i)) { placed.delete(l.i); draw(); }
          });
          t.addEventListener('dragover', (e) => { if (!checked) { e.preventDefault(); t.classList.add('is-over'); } });
          t.addEventListener('dragleave', () => t.classList.remove('is-over'));
          t.addEventListener('drop', (e) => { e.preventDefault(); t.classList.remove('is-over'); const li = Number(e.dataTransfer.getData('text/plain')); if (!Number.isNaN(li)) place(l.i, li); });
          stage.appendChild(t);
          return t;
        });
        const order = shuffled(labels, (ctx && ctx.id) || 'lg');
        function place(target, labelIndex) {
          for (const [k, v] of placed) if (v === labelIndex) placed.delete(k);
          placed.set(target, labelIndex);
          selected = null;
          live.textContent = '“' + labels[labelIndex].label + '” placed on target ' + (target + 1) + '.';
          draw();
        }
        function draw() {
          const used = new Set(placed.values());
          bank.replaceChildren(...order.filter((l) => !used.has(l.i)).map((l) => {
            const chip = el(doc, 'button', { type: 'button', class: 'ru-fb-word' + (selected === l.i ? ' is-selected' : ''), draggable: 'true', 'aria-pressed': String(selected === l.i), text: l.label });
            chip.addEventListener('click', () => { selected = selected === l.i ? null : l.i; draw(); if (selected !== null) live.textContent = '“' + l.label + '” selected. Now choose a target on the image.'; });
            chip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(l.i)); e.dataTransfer.effectAllowed = 'move'; });
            return chip;
          }));
          targets.forEach((t, k) => {
            const has = placed.has(k);
            const ok = has && placed.get(k) === k;
            t.querySelector('.ru-lg-tlabel').textContent = has ? labels[placed.get(k)].label : (zones ? '' : String(k + 1));
            t.classList.toggle('is-filled', has);
            t.classList.toggle('is-target', selected !== null && !checked);
            t.classList.toggle('is-right', checked && ok);
            t.classList.toggle('is-wrong', checked && !ok);
            t.setAttribute('aria-label', 'Target ' + (k + 1) + (has ? ': ' + labels[placed.get(k)].label : ', empty') + (checked ? (ok ? ', correct. Select to learn more.' : ', incorrect') : ''));
          });
          actions.replaceChildren();
          if (!checked && placed.size === labels.length) actions.appendChild(button(doc, 'Check', '', check));
          if (checked && [...placed].some(([k, v]) => k !== v)) actions.appendChild(button(doc, 'Try again', 'ru-btn-ghost', () => { checked = false; placed.clear(); fb.hidden = true; info.replaceChildren(); draw(); }));
          if (!bank.children.length && !checked) bank.appendChild(el(doc, 'span', { class: 'ru-instr', text: 'All labels placed.' }));
          if (checked) bank.replaceChildren();
        }
        function check() {
          checked = true;
          draw();
          const right = [...placed].filter(([k, v]) => k === v).length;
          const all = right === labels.length;
          fb.className = 'ru-qfb is-' + (all ? 'correct' : right ? 'partial' : 'incorrect');
          fb.replaceChildren(el(doc, 'p', { class: 'ru-qfb-title' }, [el(doc, 'span', { class: 'ru-qfb-icon', 'aria-hidden': 'true', text: all ? '✓' : '!' }), right + ' of ' + labels.length + ' in the right place']),
            el(doc, 'p', { class: 'ru-qfb-msg', text: all ? (d.correctFeedback || 'All correct.') : 'Select a green label on the image to learn more, or try again.' }));
          fb.hidden = false;
          fb.focus({ preventScroll: true });
          const firstRight = [...placed].find(([k, v]) => k === v);
          if (firstRight) showInfo(labels[firstRight[0]]);
          emitScore(doc, (ctx && ctx.id) || 'lg', right, labels.length);
        }
        draw();
        extra = [bank, fb, actions];
        info.appendChild(el(doc, 'p', { class: 'ru-instr', text: 'Drag each label onto the image, or select a label and then a ' + (zones ? 'highlighted area' : 'numbered point') + '. Correct labels reveal more.' }));
      }
      return el(doc, 'section', { class: 'ru-lg ru-lg-' + mode }, [
        d.title ? el(doc, 'p', { class: 'ru-instr', text: d.title }) : null,
        el(doc, 'div', { class: 'ru-lg-layout' + (side ? ' has-side' : '') }, [stage, side]),
        ...extra, info, live,
      ]);
    },
  };

  // ================================================================== Text with definitions and pop-ups
  TYPES.richtext = {
    label: 'Text with definitions', kind: 'template',
    description: 'Paragraphs where chosen terms show a definition on hover, and chosen phrases open a pop-up.',
    fields: [
      { key: 'title', label: 'Title (optional)', type: 'text' },
      { key: 'text', label: 'Text (blank line for a new paragraph)', type: 'textarea' },
      { key: 'terms', label: 'Hover definitions', type: 'list', itemLabel: 'Term', min: 0, max: 20, fields: [
        { key: 'term', label: 'Word or phrase in the text', type: 'text' },
        { key: 'definition', label: 'Definition', type: 'textarea' },
      ] },
      { key: 'popups', label: 'Pop-up links', type: 'list', itemLabel: 'Pop-up', min: 0, max: 10, fields: [
        { key: 'phrase', label: 'Word or phrase in the text', type: 'text' },
        { key: 'title', label: 'Pop-up title', type: 'text' },
        { key: 'body', label: 'Pop-up text', type: 'textarea' },
        { key: 'image', label: 'Pop-up image (optional)', type: 'image' },
      ] },
    ],
    defaults: () => ({ title: 'Before you start', text: 'Every workplace has a responsible person for fire safety. They carry out a risk assessment and make sure everyone knows the evacuation plan.\n\nIf you spot a hazard, report it. Even a near miss helps.', terms: [
      { term: 'responsible person', definition: 'The person legally accountable for fire safety in a building, usually the employer or building manager.' },
      { term: 'near miss', definition: 'An event that could have caused harm but didn’t.' },
    ], popups: [{ phrase: 'evacuation plan', title: 'The evacuation plan', body: 'It sets out how everyone leaves the building safely: the routes, the assembly point, and who checks each area.', image: '' }] }),
    render(doc, d) {
      const terms = (d.terms || []).filter((t) => t.term && t.definition).map((t) => ({ kind: 'term', key: t.term, t }));
      const pops = (d.popups || []).filter((p) => p.phrase).map((p) => ({ kind: 'pop', key: p.phrase, p }));
      const marks = terms.concat(pops).sort((a, b) => b.key.length - a.key.length);
      const tipId = uid('ru-tip');
      const tip = el(doc, 'span', { class: 'ru-tip', role: 'tooltip', id: tipId, hidden: true });
      let tipFor = null;
      function showTip(anchor, text) {
        tip.textContent = text;
        tip.hidden = false;
        tipFor = anchor;
        anchor.setAttribute('aria-describedby', tipId);
        const box = anchor.closest('.ru-rt').getBoundingClientRect();
        const r = anchor.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(r.left - box.left, box.width - 280)) + 'px';
        tip.style.top = (r.bottom - box.top + 8) + 'px';
      }
      function hideTip() { tip.hidden = true; if (tipFor) tipFor.removeAttribute('aria-describedby'); tipFor = null; }
      function build(text) {
        const out = [];
        let rest = String(text);
        while (rest) {
          let best = null;
          for (const m of marks) {
            const i = rest.toLowerCase().indexOf(m.key.toLowerCase());
            if (i >= 0 && (!best || i < best.i || (i === best.i && m.key.length > best.m.key.length))) best = { i, m };
          }
          if (!best) { out.push(rest); break; }
          if (best.i) out.push(rest.slice(0, best.i));
          const shown = rest.substr(best.i, best.m.key.length);
          if (best.m.kind === 'term') {
            const b = el(doc, 'button', { type: 'button', class: 'ru-rt-term', text: shown });
            const def = best.m.t.definition;
            b.addEventListener('mouseenter', () => showTip(b, def));
            b.addEventListener('mouseleave', hideTip);
            b.addEventListener('focus', () => showTip(b, def));
            b.addEventListener('blur', hideTip);
            b.addEventListener('click', () => (tip.hidden ? showTip(b, def) : hideTip()));
            out.push(b);
          } else {
            const p = best.m.p;
            out.push(el(doc, 'button', { type: 'button', class: 'ru-rt-pop', 'aria-haspopup': 'dialog', text: shown, onclick: (e) => RU.openDialog(doc, e.currentTarget, { title: p.title || p.phrase, body: p.body, image: p.image }) }));
          }
          rest = rest.slice(best.i + best.m.key.length);
        }
        return out;
      }
      const root = el(doc, 'section', { class: 'ru-rt' }, [
        d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null,
        ...String(d.text || '').split(/\n{2,}/).filter((t) => t.trim()).map((t) => el(doc, 'p', { class: 'ru-rt-p' }, build(t.trim()))),
        tip,
      ]);
      root.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
      return root;
    },
  };

  // ================================================================== Click-to-reveal checklist
  TYPES.revealcheck = {
    label: 'Click-to-reveal checklist', kind: 'interactive',
    description: 'Each row stays hidden until learners tick its box, revealing the item next to it.',
    fields: [
      { key: 'title', label: 'Title (optional)', type: 'text' },
      { key: 'items', label: 'Items', type: 'list', itemLabel: 'Item', min: 1, max: 12, fields: [
        { key: 'title', label: 'Item title', type: 'text' },
        { key: 'text', label: 'Item text', type: 'textarea' },
      ] },
      { key: 'done', label: 'Message when all are revealed', type: 'text' },
    ],
    defaults: () => ({ title: '', items: [
      { title: 'Review safety protocols', text: 'Make sure all safety gear is inspected before starting the shift.' },
      { title: 'Check the exits', text: 'Walk the evacuation route and move anything blocking it.' },
      { title: 'Test your radio', text: 'Do a quick check with the control room.' },
      { title: 'Sign in', text: 'So the fire marshal knows you’re on site.' },
    ], done: 'All revealed. You’re ready for your shift.' }),
    render(doc, d) {
      const id = uid('ru-rc');
      const items = (d.items || []).filter((i) => i.title || i.text);
      const live = el(doc, 'p', { class: 'ru-sr', 'aria-live': 'polite' });
      const doneMsg = el(doc, 'p', { class: 'ru-cl-done' });
      const rows = items.map((it, i) => {
        const input = el(doc, 'input', { type: 'checkbox', id: id + '-' + i, class: 'ru-rc-input' });
        const hidden = el(doc, 'span', { class: 'ru-rc-q', 'aria-hidden': 'true', text: '?' });
        const content = el(doc, 'span', { class: 'ru-rc-content', hidden: true }, [it.title ? el(doc, 'strong', { text: it.title + (it.text ? ': ' : '') }) : null, it.text || '']);
        const label = el(doc, 'label', { for: id + '-' + i, class: 'ru-rc-label' }, [el(doc, 'span', { class: 'ru-sr', text: 'Reveal item ' + (i + 1) }), hidden, content]);
        input.addEventListener('change', () => {
          content.hidden = !input.checked;
          hidden.hidden = input.checked;
          row.classList.toggle('is-open', input.checked);
          if (input.checked) live.textContent = (it.title ? it.title + ': ' : '') + (it.text || '');
          const n = rows.filter((r) => r.input.checked).length;
          doneMsg.textContent = n === rows.length ? (d.done || 'All revealed.') : '';
        });
        const row = el(doc, 'li', { class: 'ru-rc-row' }, [input, label]);
        return { row, input };
      });
      return el(doc, 'section', { class: 'ru-rc' }, [
        d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null,
        el(doc, 'p', { class: 'ru-instr', text: 'Select each box to reveal the item next to it. With a keyboard, press Tab to move between boxes and Space to check one.' }),
        el(doc, 'ul', { class: 'ru-rc-list' }, rows.map((r) => r.row)),
        doneMsg, live,
      ]);
    },
  };

  // ================================================================== Card layout
  TYPES.cards = {
    label: 'Card layout', kind: 'template',
    description: 'Cards with an image or looping video, tags, text or bullet points and a button: in columns or rows.',
    fields: [
      { key: 'layout', label: 'Layout', type: 'select', options: [['3', 'Three columns'], ['2', 'Two columns'], ['rows', 'Rows (image beside text)']] },
      { key: 'cards', label: 'Cards', type: 'list', itemLabel: 'Card', min: 1, max: 9, fields: [
        { key: 'media', label: 'Image', type: 'image' },
        { key: 'video', label: 'Or a looping video address (https://… .mp4)', type: 'text' },
        { key: 'icon', label: 'Or an icon (an emoji) on a tinted panel', type: 'text' },
        { key: 'tags', label: 'Tags (comma separated)', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Text (start lines with - for bullet points)', type: 'textarea' },
        { key: 'button', label: 'Button text', type: 'text' },
        { key: 'link', label: 'Button opens this web address (or leave blank and add pop-up text)', type: 'text' },
        { key: 'popup', label: 'Or the button opens a pop-up with this text', type: 'textarea' },
        { key: 'color', label: 'Accent colour (optional)', type: 'color' },
      ] },
    ],
    defaults: () => ({ layout: '3', cards: [
      { media: '', video: '', icon: '🧯', tags: 'Fire safety, Guide', title: 'Using an extinguisher', text: 'Remember PASS: pull, aim, squeeze, sweep.', button: 'Open guide', link: '', popup: 'Pull the pin. Aim at the base of the fire. Squeeze the handle. Sweep from side to side.', color: '' },
      { media: '', video: '', icon: '🚪', tags: 'Evacuation', title: 'Leaving the building', text: '- Use the nearest safe exit\n- Don’t use lifts\n- Go to the assembly point', button: 'See the plan', link: '', popup: 'Your assembly point is the car park by the main gate. Wait to be counted.', color: '#0f7b6c' },
      { media: '', video: '', icon: '📞', tags: 'Contacts', title: 'Who to call', text: 'The safety team is on extension 4400, 24 hours a day.', button: 'Contact list', link: '', popup: 'Safety team: ext 4400\nSecurity: ext 4000\nFirst aid: ext 4111', color: '#7c3aed' },
    ] }),
    render(doc, d) {
      const layout = ['2', '3', 'rows'].includes(String(d.layout)) ? String(d.layout) : '3';
      const cards = (d.cards || []).filter((c) => c.title || c.text || c.media || c.icon || c.video);
      const win = doc.defaultView;
      return el(doc, 'section', { class: 'ru-cards ru-cards-' + layout }, cards.map((c) => {
        const accent = RU._safeColor(c.color);
        const img = safeUrl(c.media, 'image');
        const video = /^https:\/\/[^\s"'<>]+\.(mp4|webm)(\?[^\s"'<>]*)?$/i.test(String(c.video || '').trim()) ? String(c.video).trim() : '';
        let media;
        if (video) {
          const v = el(doc, 'video', { src: video, muted: true, loop: true, playsinline: true, autoplay: !reducedMotion(win), 'aria-hidden': 'true', class: 'ru-cards-video' });
          v.muted = true;
          const pause = el(doc, 'button', { type: 'button', class: 'ru-cards-pause', 'aria-label': 'Pause video', text: '❚❚' });
          pause.addEventListener('click', () => { if (v.paused) { v.play(); pause.textContent = '❚❚'; pause.setAttribute('aria-label', 'Pause video'); } else { v.pause(); pause.textContent = '▶'; pause.setAttribute('aria-label', 'Play video'); } });
          if (reducedMotion(win)) { pause.textContent = '▶'; pause.setAttribute('aria-label', 'Play video'); }
          media = el(doc, 'div', { class: 'ru-cards-media' }, [v, pause]);
        } else if (img) {
          media = el(doc, 'div', { class: 'ru-cards-media' }, [el(doc, 'img', { src: img, alt: '' })]);
        } else {
          media = el(doc, 'div', { class: 'ru-cards-media ru-cards-iconpanel', 'aria-hidden': 'true' }, [el(doc, 'span', { text: c.icon || '★' })]);
        }
        const lines = String(c.text || '').split('\n').map((s) => s.trim()).filter(Boolean);
        const bullets = lines.length && lines.every((l) => /^[-•*]\s*/.test(l));
        const text = bullets ? el(doc, 'ul', { class: 'ru-cards-ul' }, lines.map((l) => el(doc, 'li', { text: l.replace(/^[-•*]\s*/, '') }))) : el(doc, 'p', { class: 'ru-cards-text ru-pre', text: c.text || '' });
        const href = safeUrl(c.link, 'link');
        let action = null;
        if (c.button && href) action = el(doc, 'a', { class: 'ru-btn ru-cards-btn', href, target: /^https?:/.test(href) ? '_blank' : null, rel: 'noopener' }, [c.button, el(doc, 'span', { 'aria-hidden': 'true', text: ' →' })]);
        else if (c.button && c.popup) action = el(doc, 'button', { type: 'button', class: 'ru-btn ru-cards-btn', 'aria-haspopup': 'dialog', onclick: (e) => RU.openDialog(doc, e.currentTarget, { title: c.title || c.button, body: c.popup }) }, [c.button, el(doc, 'span', { 'aria-hidden': 'true', text: ' →' })]);
        const tags = String(c.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
        return el(doc, 'article', { class: 'ru-cards-card', style: accent ? '--ru-accent:' + accent + '; --ru-accent-ink:' + RU.inkFor(accent) : null }, [
          media,
          el(doc, 'div', { class: 'ru-cards-body' }, [
            tags.length ? el(doc, 'p', { class: 'ru-cards-tags' }, tags.map((t) => el(doc, 'span', { text: t }))) : null,
            c.title ? el(doc, 'h4', { class: 'ru-cards-title', text: c.title }) : null,
            text,
            action ? el(doc, 'div', { class: 'ru-cards-foot' }, [action]) : null,
          ]),
        ]);
      }));
    },
  };

  // ------------------------------------------------------------------ styles
  const LAYOUT_CSS = `
.ru-c .ru-pre { white-space: pre-line; }
/* Tabs */
.ru-c .ru-tabs-list { display: flex; gap: 4px; flex-wrap: wrap; }
.ru-c .ru-tabs-tab { padding: 12px 18px; border: 0; background: none; color: var(--ru-muted); font: inherit; font-weight: 700; cursor: pointer; border-radius: 10px 10px 0 0; position: relative; }
.ru-c .ru-tabs-tab:hover { color: var(--ru-ink); }
.ru-c .ru-tabs-tab[aria-selected="true"] { color: var(--ru-accent); }
.ru-c .ru-tabs-underline .ru-tabs-list { border-bottom: 2px solid var(--ru-line); }
.ru-c .ru-tabs-underline .ru-tabs-tab[aria-selected="true"]::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: -2px; height: 4px; border-radius: 4px 4px 0 0; background: var(--ru-accent); }
.ru-c .ru-tabs-panel { padding: 22px 4px 6px; display: flex; gap: 22px; align-items: flex-start; animation: ru-in .3s ease; outline: none; }
.ru-c .ru-tabs-panel:focus-visible { outline: 3px solid var(--ru-accent); outline-offset: 4px; }
.ru-c .ru-tabs-panel[hidden] { display: none; }
.ru-c .ru-tabs-img { width: 40%; border-radius: var(--ru-radius); object-fit: cover; }
@media (max-width: 600px) { .ru-c .ru-tabs-panel { flex-direction: column; } .ru-c .ru-tabs-img { width: 100%; } }
.ru-c .ru-tabs-h { font: 800 1.25em/1.2 var(--ru-heading-font, inherit); margin-bottom: 8px; }
.ru-c .ru-tabs-panel p + p { margin-top: 10px; }
.ru-c .ru-tabs-pills .ru-tabs-list { padding: 6px; border-radius: 999px; background: var(--ru-soft); display: inline-flex; }
.ru-c .ru-tabs-pills .ru-tabs-tab { border-radius: 999px; }
.ru-c .ru-tabs-pills .ru-tabs-tab[aria-selected="true"] { background: var(--ru-accent); color: var(--ru-accent-ink); }
.ru-c .ru-tabs-side { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: 20px; }
.ru-c .ru-tabs-side .ru-tabs-list { flex-direction: column; border-right: 2px solid var(--ru-line); padding-right: 10px; }
.ru-c .ru-tabs-side .ru-tabs-tab { text-align: left; border-radius: 10px; }
.ru-c .ru-tabs-side .ru-tabs-tab[aria-selected="true"] { background: color-mix(in srgb, var(--ru-accent) 10%, var(--ru-card)); }
.ru-c .ru-tabs-side .ru-tabs-panel { padding-top: 6px; }
@media (max-width: 600px) { .ru-c .ru-tabs-side { grid-template-columns: 1fr; } .ru-c .ru-tabs-side .ru-tabs-list { flex-direction: row; border-right: 0; border-bottom: 2px solid var(--ru-line); } }
/* Accordion */
.ru-c .ru-acc { display: flex; flex-direction: column; gap: 8px; }
.ru-c .ru-acc-h { margin: 0; font: inherit; }
.ru-c .ru-acc-btn { display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 18px; border: 0; background: none; color: var(--ru-ink); font: inherit; font-weight: 700; text-align: left; cursor: pointer; }
.ru-c .ru-acc-title { flex: 1; font-family: var(--ru-heading-font, inherit); font-size: 1.05em; }
.ru-c .ru-acc-icon { position: relative; width: 22px; height: 22px; flex: none; border-radius: 50%; background: var(--ru-accent); }
.ru-c .ru-acc-icon::before, .ru-c .ru-acc-icon::after { content: ""; position: absolute; left: 6px; right: 6px; top: 10px; height: 2px; background: var(--ru-accent-ink); transition: transform .25s; }
.ru-c .ru-acc-icon::after { transform: rotate(90deg); }
.ru-c [aria-expanded="true"] > .ru-acc-icon::after { transform: rotate(0); }
.ru-c .ru-acc-num { font: 900 1.4em/1 var(--ru-heading-font, inherit); color: var(--ru-accent); min-width: 1.6em; }
.ru-c .ru-acc-inner { padding: 0 18px 18px; display: flex; flex-direction: column; gap: 10px; animation: ru-in .3s ease; }
.ru-c .ru-acc-inner img { border-radius: 10px; max-height: 260px; object-fit: cover; }
.ru-c .ru-acc-numbered .ru-acc-inner { padding-left: calc(18px + 1.6em + 14px); }
.ru-c .ru-acc-cards .ru-acc-item, .ru-c .ru-acc-numbered .ru-acc-item { border-radius: var(--ru-radius); background: var(--ru-soft); transition: box-shadow .2s; }
.ru-c .ru-acc-item.is-open { box-shadow: inset 4px 0 0 var(--ru-accent), 0 6px 18px rgba(0,0,0,.06); background: var(--ru-card); }
.ru-c .ru-acc-minimal { gap: 0; }
.ru-c .ru-acc-minimal .ru-acc-item { border-bottom: 1px solid var(--ru-line); }
.ru-c .ru-acc-minimal .ru-acc-item.is-open { box-shadow: none; background: none; }
.ru-c .ru-acc-minimal .ru-acc-btn { padding-left: 0; padding-right: 0; }
.ru-c .ru-acc-minimal .ru-acc-inner { padding-left: 0; padding-right: 0; }
/* Interactive timeline */
.ru-c .ru-itl-rail { position: relative; padding-top: 4px; overflow-x: auto; }
.ru-c .ru-itl-line { position: absolute; left: 6%; right: 6%; top: 22px; height: 4px; border-radius: 4px; background: var(--ru-line); }
.ru-c .ru-itl-fill { display: block; height: 100%; width: 0; border-radius: 4px; background: var(--ru-accent); transition: width .5s ease; }
.ru-c .ru-itl-track { position: relative; display: flex; justify-content: space-between; min-width: 520px; }
.ru-c .ru-itl-point { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 4px; border: 0; background: none; color: var(--ru-ink); font: inherit; cursor: pointer; }
.ru-c .ru-itl-dot { width: 26px; height: 26px; border-radius: 50%; background: var(--ru-card); border: 4px solid var(--ru-line); transition: transform .2s, border-color .2s, background .2s; }
.ru-c .ru-itl-point.is-seen .ru-itl-dot { border-color: var(--ru-accent); }
.ru-c .ru-itl-point[aria-selected="true"] .ru-itl-dot { background: var(--ru-accent); border-color: var(--ru-accent); transform: scale(1.25); box-shadow: 0 0 0 6px color-mix(in srgb, var(--ru-accent) 20%, transparent); }
.ru-c .ru-itl-plabel { font-weight: 800; color: var(--ru-accent); }
.ru-c .ru-itl-ptitle { font-size: .85em; color: var(--ru-muted); text-align: center; max-width: 12em; }
.ru-c .ru-itl-panel { margin-top: 14px; }
.ru-c .ru-itl-detail { display: flex; gap: 20px; padding: 20px 22px; border-radius: var(--ru-radius); background: var(--ru-soft); animation: ru-in .35s ease; }
.ru-c .ru-itl-detail img { width: 35%; border-radius: 10px; object-fit: cover; }
@media (max-width: 600px) { .ru-c .ru-itl-detail { flex-direction: column; } .ru-c .ru-itl-detail img { width: 100%; } }
.ru-c .ru-itl-date { font-weight: 800; color: var(--ru-accent); text-transform: uppercase; letter-spacing: .08em; font-size: .85em; }
.ru-c .ru-itl-title { display: block; font: 800 1.2em/1.25 var(--ru-heading-font, inherit); margin: 2px 0 6px; }
.ru-c .ru-itl-cards { list-style: none; position: relative; display: flex; flex-direction: column; gap: 14px; }
.ru-c .ru-itl-cards::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; background: linear-gradient(var(--ru-accent), var(--ru-line)); border-radius: 3px; }
.ru-c .ru-itl-li { position: relative; display: flex; width: 50%; padding-right: 34px; }
.ru-c .ru-itl-li.is-right { margin-left: 50%; padding-right: 0; padding-left: 34px; }
.ru-c .ru-itl-node { position: absolute; top: 18px; right: -10px; width: 20px; height: 20px; border-radius: 50%; background: var(--ru-card); border: 4px solid var(--ru-accent); z-index: 1; }
.ru-c .ru-itl-li.is-right .ru-itl-node { left: -10px; right: auto; }
.ru-c .ru-itl-li.is-open .ru-itl-node { background: var(--ru-accent); }
.ru-c .ru-itl-box { flex: 1; border-radius: var(--ru-radius); background: var(--ru-soft); box-shadow: 0 4px 14px rgba(0,0,0,.05); overflow: hidden; }
.ru-c .ru-itl-card { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; width: 100%; padding: 14px 16px; border: 0; background: none; color: var(--ru-ink); font: inherit; text-align: left; cursor: pointer; }
.ru-c .ru-itl-card .ru-itl-title { grid-column: 1; margin: 0; font-size: 1.05em; }
.ru-c .ru-itl-card .ru-acc-icon { grid-row: 1 / span 2; grid-column: 2; }
.ru-c .ru-itl-more .ru-itl-detail { padding: 0 16px 16px; background: none; }
@media (max-width: 600px) { .ru-c .ru-itl-cards::before { left: 10px; } .ru-c .ru-itl-li, .ru-c .ru-itl-li.is-right { width: 100%; margin-left: 0; padding: 0 0 0 34px; } .ru-c .ru-itl-node, .ru-c .ru-itl-li.is-right .ru-itl-node { left: 0; right: auto; } }
.ru-c .ru-itl-pbar { display: block; height: 6px; border-radius: 6px; background: var(--ru-line); overflow: hidden; }
.ru-c .ru-itl-pfill { display: block; height: 100%; background: var(--ru-accent); transition: width .4s ease; }
.ru-c .ru-itl-dates { display: flex; justify-content: space-between; margin: 8px 0 14px; font-weight: 800; font-size: .85em; color: var(--ru-muted); }
.ru-c .ru-itl-dates .is-on { color: var(--ru-accent); }
.ru-c .ru-itl-stage { overflow: hidden; }
.ru-c .ru-itl-stage .ru-itl-detail { min-height: 140px; }
.ru-c .ru-itl-stage .is-fwd { animation: ru-from-right .4s ease; } .ru-c .ru-itl-stage .is-back { animation: ru-from-left .4s ease; }
@keyframes ru-from-right { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: none; } }
@keyframes ru-from-left { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: none; } }
.ru-c .ru-itl-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
.ru-c .ru-itl-count { font-weight: 700; color: var(--ru-muted); }
/* Scratch card */
.ru-c .ru-scr-grid { display: grid; gap: 14px; grid-template-columns: repeat(3, 1fr); }
.ru-c .ru-scr-n1 { grid-template-columns: minmax(0, 420px); justify-content: center; } .ru-c .ru-scr-n2 { grid-template-columns: repeat(2, 1fr); }
@media (max-width: 600px) { .ru-c .ru-scr-grid { grid-template-columns: 1fr; } }
.ru-c .ru-scr-card { position: relative; min-height: 190px; border-radius: var(--ru-radius); overflow: hidden; background: var(--ru-card); box-shadow: 0 6px 18px rgba(0,0,0,.1); }
.ru-c .ru-scr-under { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 18px; text-align: center; background: color-mix(in srgb, var(--ru-accent) 10%, var(--ru-card)); }
.ru-c .ru-scr-under img { max-height: 90px; border-radius: 8px; }
.ru-c .ru-scr-h { font: 900 2em/1 var(--ru-heading-font, inherit); color: var(--ru-accent); }
.ru-c .ru-scr-canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; transition: opacity .6s ease; }
.ru-c .ru-scr-card.is-revealed .ru-scr-canvas { opacity: 0; pointer-events: none; }
.ru-c .ru-scr-reveal { position: absolute; right: 8px; bottom: 8px; padding: 4px 10px; border: 0; border-radius: 999px; background: rgba(255,255,255,.85); color: #1d2330; font: 700 12px/1.4 system-ui, sans-serif; cursor: pointer; opacity: 0; }
.ru-c .ru-scr-reveal:focus-visible, .ru-c .ru-scr-card:hover .ru-scr-reveal { opacity: 1; }
/* Labelled graphic */
.ru-c .ru-lg-layout.has-side { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 600px) { .ru-c .ru-lg-layout.has-side { grid-template-columns: 1fr; } }
.ru-c .ru-lg-stage { position: relative; border-radius: var(--ru-radius); user-select: none; }
.ru-c .ru-lg-img { width: 100%; display: block; border-radius: var(--ru-radius); }
.ru-c .ru-lg-ph { aspect-ratio: 16 / 10; }
.ru-c .ru-lg-tag { position: absolute; transform: translate(-50%, -50%); padding: 7px 14px; border: 0; border-radius: 999px; background: var(--ru-card); color: var(--ru-ink); font: inherit; font-weight: 800; font-size: .92em; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.25); white-space: nowrap; transition: transform .15s, background .15s; }
.ru-c .ru-lg-tag::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: var(--ru-accent); vertical-align: 1px; }
.ru-c .ru-lg-tag:hover { transform: translate(-50%, -50%) scale(1.05); }
.ru-c .ru-lg-tag[aria-pressed="true"] { background: var(--ru-accent); color: var(--ru-accent-ink); }
.ru-c .ru-lg-tag[aria-pressed="true"]::before { background: var(--ru-accent-ink); }
.ru-c .ru-lg-pin { position: absolute; transform: translate(-50%, -50%); width: 34px; height: 34px; border-radius: 50%; border: 3px solid #fff; background: var(--ru-accent); color: var(--ru-accent-ink); font: 800 14px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
.ru-c .ru-lg-pin[aria-pressed="true"] { background: #fff; color: #1d2330; transform: translate(-50%, -50%) scale(1.15); }
.ru-c .ru-lg-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.ru-c .ru-lg-li { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: 2px solid transparent; border-radius: 10px; background: var(--ru-soft); color: var(--ru-ink); font: inherit; font-weight: 700; text-align: left; cursor: pointer; }
.ru-c .ru-lg-li[aria-pressed="true"] { border-color: var(--ru-accent); background: var(--ru-card); }
.ru-c .ru-lg-li.is-seen .ru-lg-n { background: var(--ru-accent); color: var(--ru-accent-ink); }
.ru-c .ru-lg-n { display: grid; place-items: center; width: 26px; height: 26px; flex: none; border-radius: 50%; background: var(--ru-line); font-size: .85em; }
.ru-c .ru-lg-info { margin-top: 14px; padding: 16px 18px; border-radius: var(--ru-radius); background: var(--ru-soft); min-height: 3em; animation: ru-in .3s ease; }
.ru-c .ru-lg-ih { font: 800 1.1em/1.2 var(--ru-heading-font, inherit); margin-bottom: 4px; }
.ru-c .ru-lg-target, .ru-c .ru-lg-zone { position: absolute; transform: translate(-50%, -50%); border: 2px dashed #fff; background: rgba(0,0,0,.45); color: #fff; font: 800 13px/1.2 system-ui, sans-serif; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25); transition: transform .15s, background .15s; }
.ru-c .ru-lg-target { min-width: 36px; height: 36px; padding: 0 10px; border-radius: 999px; }
.ru-c .ru-lg-zone { width: 24%; height: 20%; border-radius: 12px; display: grid; place-items: center; }
.ru-c .is-target.ru-lg-target, .ru-c .is-target.ru-lg-zone { animation: ru-wiggle 1.2s ease-in-out infinite; border-color: var(--ru-accent); }
.ru-c .ru-lg-target.is-over, .ru-c .ru-lg-zone.is-over { transform: translate(-50%, -50%) scale(1.08); background: color-mix(in srgb, var(--ru-accent) 60%, transparent); }
.ru-c .ru-lg-target.is-filled, .ru-c .ru-lg-zone.is-filled { border-style: solid; background: var(--ru-card); color: var(--ru-ink); border-color: var(--ru-accent); }
.ru-c .is-right.ru-lg-target, .ru-c .is-right.ru-lg-zone { border-color: #1d7a46; background: #eaf7ef; color: #14532d; }
.ru-c .is-wrong.ru-lg-target, .ru-c .is-wrong.ru-lg-zone { border-color: #b3261e; background: #fdeeed; color: #7f1d1d; }
.ru-c .ru-lg-bank { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding: 12px; border-radius: var(--ru-radius); background: var(--ru-soft); min-height: 56px; }
.ru-c .ru-lg-bank:empty { display: none; }
/* Text with definitions */
.ru-c .ru-rt { position: relative; }
.ru-c .ru-rt-p { font-size: 1.05em; line-height: 1.7; }
.ru-c .ru-rt-p + .ru-rt-p { margin-top: 12px; }
.ru-c .ru-rt-term, .ru-c .ru-rt-pop { display: inline; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: help; }
.ru-c .ru-rt-term { border-bottom: 2px dashed var(--ru-accent); }
.ru-c .ru-rt-term:hover, .ru-c .ru-rt-term:focus-visible { background: color-mix(in srgb, var(--ru-accent) 12%, transparent); }
.ru-c .ru-rt-pop { color: var(--ru-accent); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; font-weight: 600; }
.ru-c .ru-tip { position: absolute; z-index: 20; width: 280px; max-width: calc(100% - 8px); padding: 10px 14px; border-radius: 10px; background: #1d2330; color: #fff; font-size: .92em; line-height: 1.45; box-shadow: 0 12px 30px rgba(0,0,0,.25); pointer-events: none; animation: ru-in .15s ease; }
.ru-c .ru-tip[hidden] { display: none; }
/* Click-to-reveal checklist */
.ru-c .ru-rc-list { list-style: none; display: flex; flex-direction: column; gap: 12px; }
.ru-c .ru-rc-row { display: flex; align-items: center; gap: 16px; }
.ru-c .ru-rc-input { flex: none; width: 24px; height: 24px; margin: 0; accent-color: var(--ru-accent); cursor: pointer; }
.ru-c .ru-rc-label { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 58px; padding: 14px 18px; border: 1px solid var(--ru-line); border-radius: 10px; background: var(--ru-card); cursor: pointer; transition: background .3s, border-color .3s; }
.ru-c .ru-rc-q { font-weight: 800; color: var(--ru-muted); font-size: 1.1em; }
.ru-c .ru-rc-content { width: 100%; text-align: left; animation: ru-in .35s ease; }
.ru-c .ru-rc-content[hidden], .ru-c .ru-rc-q[hidden] { display: none; }
.ru-c .ru-rc-row.is-open .ru-rc-label { justify-content: flex-start; border-color: transparent; background: color-mix(in srgb, var(--ru-accent) 7%, var(--ru-card)); }
/* Card layout */
.ru-c .ru-cards { display: grid; gap: 18px; }
.ru-c .ru-cards-3 { grid-template-columns: repeat(3, 1fr); } .ru-c .ru-cards-2 { grid-template-columns: repeat(2, 1fr); }
@media (max-width: 760px) { .ru-c .ru-cards-3 { grid-template-columns: 1fr 1fr; } }
@media (max-width: 520px) { .ru-c .ru-cards-3, .ru-c .ru-cards-2 { grid-template-columns: 1fr; } }
.ru-c .ru-cards-card { display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ru-radius); background: var(--ru-card); box-shadow: 0 6px 22px rgba(0,0,0,.08); border-top: 4px solid var(--ru-accent); transition: transform .2s, box-shadow .2s; }
.ru-c .ru-cards-card:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(0,0,0,.12); }
.ru-c .ru-cards-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; background: #000; }
.ru-c .ru-cards-media img, .ru-c .ru-cards-video { width: 100%; height: 100%; object-fit: cover; display: block; }
.ru-c .ru-cards-iconpanel { display: grid; place-items: center; background: color-mix(in srgb, var(--ru-accent) 14%, #fff); font-size: 56px; }
.ru-c .ru-cards-pause { position: absolute; right: 12px; bottom: 12px; width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgba(0,0,0,.7); color: #fff; font: 700 12px/1 system-ui, sans-serif; cursor: pointer; }
.ru-c .ru-cards-body { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 20px; }
.ru-c .ru-cards-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.ru-c .ru-cards-tags span { padding: 3px 8px; border-radius: 6px; background: var(--ru-soft); color: var(--ru-muted); font-size: .72em; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
.ru-c .ru-cards-title { font: 800 1.25em/1.2 var(--ru-heading-font, inherit); }
.ru-c .ru-cards-text { color: var(--ru-muted); }
.ru-c .ru-cards-ul { padding-left: 1.2em; display: flex; flex-direction: column; gap: 4px; color: var(--ru-muted); }
.ru-c .ru-cards-foot { margin-top: auto; padding-top: 10px; }
.ru-c .ru-cards-btn { border-radius: 8px; }
.ru-c .ru-cards-rows { grid-template-columns: 1fr; }
.ru-c .ru-cards-rows .ru-cards-card { flex-direction: row; border-top: 0; border-left: 4px solid var(--ru-accent); }
.ru-c .ru-cards-rows .ru-cards-media { width: 34%; aspect-ratio: auto; min-height: 200px; flex: none; }
@media (max-width: 600px) { .ru-c .ru-cards-rows .ru-cards-card { flex-direction: column; } .ru-c .ru-cards-rows .ru-cards-media { width: 100%; min-height: 160px; } }
@media (prefers-reduced-motion: reduce) {
  .ru-c .ru-tabs-panel, .ru-c .ru-acc-inner, .ru-c .ru-itl-detail, .ru-c .ru-rc-content, .ru-c .ru-scr-canvas, .ru-c .ru-itl-stage .is-fwd, .ru-c .ru-itl-stage .is-back { animation: none !important; transition: none !important; }
  .ru-c .is-target.ru-lg-target, .ru-c .is-target.ru-lg-zone { animation: none; }
}
`;
  RU.COMPONENT_CSS += LAYOUT_CSS;
  return {};
});
