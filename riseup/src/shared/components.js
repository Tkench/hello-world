/*
 * RiseUp blocks: design templates and interactive blocks.
 *
 * Each type has a form schema (used by the editor panel), default content,
 * and a render function that builds the block with plain DOM APIs. The same
 * file runs in the editor panel, in Rise's preview and in published courses.
 *
 * All author text is inserted with textContent, never as HTML.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // ------------------------------------------------------------------ markers
  // What authors paste into a Rise text block: [[RiseUp: flipcards k3x9q2]]
  const MARKER_RE = /\[\[\s*RiseUp\s*:?\s*(?:[a-z-]+\s+)?([a-z0-9]{4,16})\s*\]\]/gi;

  function markerFor(comp) {
    return '[[RiseUp: ' + comp.type + ' ' + comp.id + ']]';
  }

  function newComponentId() {
    let s = '';
    while (s.length < 6) s += Math.random().toString(36).slice(2);
    return s.slice(0, 6);
  }

  // ------------------------------------------------------------------ helpers
  function el(doc, tag, attrs, children) {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children || [])) if (c) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    return e;
  }

  function safeUrl(u, kind) {
    if (typeof u !== 'string') return '';
    const s = u.trim();
    if (kind === 'image' && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (kind === 'image' && /^riseup\/media\/[\w.-]+$/.test(s)) return s;
    if (kind === 'link' && (/^mailto:/i.test(s) || /^#[\w-]*$/.test(s))) return s;
    return '';
  }

  function safeColor(v) {
    return typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? v.trim() : '';
  }

  function reducedMotion(win) {
    return Boolean(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** Run fn once el scrolls into view (immediately if IntersectionObserver is missing). */
  function onVisible(win, node, fn) {
    if (!win || !win.IntersectionObserver) return fn();
    const io = new win.IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { threshold: 0.2 });
    io.observe(node);
  }

  /** Shuffle that never returns the original order (when there are 2+ items). */
  function shuffled(items, seed) {
    const a = items.slice();
    let s = 0;
    for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let tries = 0; tries < 10; tries++) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      if (a.length < 2 || a.some((x, i) => x !== items[i])) return a;
    }
    return a.slice(1).concat(a[0]);
  }

  // ------------------------------------------------------------------ types
  const TYPES = {};

  TYPES.hero = {
    label: 'Hero banner', kind: 'template',
    description: 'A big opening banner with a title, subtitle and optional button, over an image or a colour gradient.',
    fields: [
      { key: 'eyebrow', label: 'Small heading', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'image', label: 'Background image', type: 'image' },
      { key: 'gradientTo', label: 'Gradient second colour (no image)', type: 'color' },
      { key: 'height', label: 'Height', type: 'select', options: [['medium', 'Medium'], ['tall', 'Tall'], ['short', 'Short']] },
      { key: 'align', label: 'Alignment', type: 'select', options: [['left', 'Left'], ['center', 'Centre']] },
      { key: 'buttonText', label: 'Button text', type: 'text' },
      { key: 'buttonLink', label: 'Button link (https://…)', type: 'text' },
      { key: 'fullWidth', label: 'Stretch to full page width', type: 'checkbox' },
    ],
    defaults: () => ({ eyebrow: 'Module 1', title: 'Working safely together', subtitle: 'What everyone on site needs to know, in 15 minutes.', image: '', gradientTo: '#1d2330', height: 'medium', align: 'left', buttonText: '', buttonLink: '', fullWidth: true }),
    render(doc, d) {
      const img = safeUrl(d.image, 'image');
      const to = safeColor(d.gradientTo) || '#1d2330';
      const bg = img
        ? "background-image: linear-gradient(90deg, rgba(0,0,0,.62), rgba(0,0,0,.18)), url('" + img.replace(/'/g, '%27') + "');"
        : 'background-image: linear-gradient(120deg, var(--ru-accent), ' + to + ');';
      const href = safeUrl(d.buttonLink, 'link');
      return el(doc, 'section', { class: 'ru-hero ru-h-' + (d.height || 'medium') + ' ru-al-' + (d.align || 'left') + (d.fullWidth ? ' ru-bleed' : ''), style: bg }, [
        el(doc, 'div', { class: 'ru-hero-inner' }, [
          d.eyebrow ? el(doc, 'p', { class: 'ru-eyebrow', text: d.eyebrow }) : null,
          el(doc, 'h2', { class: 'ru-hero-title', text: d.title || '' }),
          d.subtitle ? el(doc, 'p', { class: 'ru-hero-sub', text: d.subtitle }) : null,
          d.buttonText && href ? el(doc, 'a', { class: 'ru-btn ru-btn-light', href, target: /^https?:/.test(href) ? '_blank' : null, rel: 'noopener', text: d.buttonText }) : null,
        ]),
      ]);
    },
  };

  TYPES.stats = {
    label: 'Stat row', kind: 'template',
    description: 'Key numbers that count up as the learner scrolls to them.',
    fields: [
      { key: 'title', label: 'Heading (optional)', type: 'text' },
      { key: 'items', label: 'Stats', type: 'list', itemLabel: 'Stat', min: 1, max: 6, fields: [
        { key: 'prefix', label: 'Before number', type: 'text', placeholder: '£' },
        { key: 'value', label: 'Number', type: 'text', placeholder: '98.5' },
        { key: 'suffix', label: 'After number', type: 'text', placeholder: '%' },
        { key: 'label', label: 'Label', type: 'text' },
      ] },
    ],
    defaults: () => ({ title: '', items: [
      { prefix: '', value: '87', suffix: '%', label: 'of incidents are preventable' },
      { prefix: '', value: '3', suffix: '', label: 'steps to report a hazard' },
      { prefix: '', value: '24', suffix: '/7', label: 'safety helpline' },
    ] }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const wrap = el(doc, 'section', { class: 'ru-stats-wrap' }, [d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null]);
      const row = el(doc, 'div', { class: 'ru-stats' });
      for (const it of d.items || []) {
        const raw = String(it.value || '').trim();
        const num = Number(raw.replace(/,/g, ''));
        const decimals = (raw.split('.')[1] || '').length;
        const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        const valueEl = el(doc, 'span', { class: 'ru-stat-num', text: Number.isFinite(num) && raw ? fmt(num) : raw });
        const stat = el(doc, 'div', { class: 'ru-stat' }, [
          el(doc, 'div', { class: 'ru-stat-value' }, [it.prefix || '', valueEl, it.suffix || '']),
          el(doc, 'div', { class: 'ru-stat-label', text: it.label || '' }),
        ]);
        if (Number.isFinite(num) && raw && !reducedMotion(win) && !(ctx && ctx.static)) {
          valueEl.textContent = fmt(0);
          onVisible(win, stat, () => {
            const start = win.performance.now();
            const dur = 1400;
            const tick = (t) => {
              const p = Math.min(1, (t - start) / dur);
              valueEl.textContent = fmt(num * (1 - Math.pow(1 - p, 3)));
              if (p < 1) win.requestAnimationFrame(tick);
            };
            win.requestAnimationFrame(tick);
          });
        }
        row.appendChild(stat);
      }
      wrap.appendChild(row);
      return wrap;
    },
  };

  TYPES.timeline = {
    label: 'Timeline', kind: 'template',
    description: 'Events or steps in order, revealed one by one as the learner scrolls.',
    fields: [
      { key: 'title', label: 'Heading (optional)', type: 'text' },
      { key: 'items', label: 'Events', type: 'list', itemLabel: 'Event', min: 1, max: 12, fields: [
        { key: 'date', label: 'Date or step', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Description', type: 'textarea' },
      ] },
    ],
    defaults: () => ({ title: '', items: [
      { date: 'Step 1', title: 'Spot it', text: 'Notice anything that could cause harm.' },
      { date: 'Step 2', title: 'Make it safe', text: 'If you can do so safely, stop others getting hurt.' },
      { date: 'Step 3', title: 'Report it', text: 'Log it in the safety app within 24 hours.' },
    ] }),
    render(doc, d) {
      return el(doc, 'section', { class: 'ru-timeline-wrap' }, [
        d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null,
        el(doc, 'ol', { class: 'ru-timeline' }, (d.items || []).map((it) => el(doc, 'li', { class: 'ru-tl-item ru-reveal' }, [
          el(doc, 'span', { class: 'ru-tl-dot', 'aria-hidden': 'true' }),
          it.date ? el(doc, 'p', { class: 'ru-tl-date', text: it.date }) : null,
          el(doc, 'h4', { class: 'ru-tl-title', text: it.title || '' }),
          it.text ? el(doc, 'p', { class: 'ru-tl-text', text: it.text }) : null,
        ]))),
      ]);
    },
  };

  TYPES.quote = {
    label: 'Quote card', kind: 'template',
    description: 'A testimonial or expert quote with a name, role and photo.',
    fields: [
      { key: 'quote', label: 'Quote', type: 'textarea' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'image', label: 'Photo', type: 'image' },
      { key: 'style', label: 'Style', type: 'select', options: [['card', 'Card'], ['large', 'Large statement']] },
    ],
    defaults: () => ({ quote: 'The best safety idea we ever had came from someone in their first week.', name: 'Sam Okafor', role: 'Site Manager', image: '', style: 'card' }),
    render(doc, d) {
      const img = safeUrl(d.image, 'image');
      return el(doc, 'figure', { class: 'ru-quote ru-q-' + (d.style || 'card') }, [
        el(doc, 'span', { class: 'ru-q-mark', 'aria-hidden': 'true', text: '“' }),
        el(doc, 'blockquote', null, [el(doc, 'p', { text: d.quote || '' })]),
        el(doc, 'figcaption', null, [
          img ? el(doc, 'img', { src: img, alt: '', class: 'ru-q-img' }) : null,
          el(doc, 'span', null, [el(doc, 'strong', { text: d.name || '' }), d.role ? el(doc, 'span', { class: 'ru-q-role', text: d.role }) : null]),
        ]),
      ]);
    },
  };

  TYPES.section = {
    label: 'Section header', kind: 'template',
    description: 'A bold, numbered divider to open a new part of the lesson.',
    fields: [
      { key: 'number', label: 'Number or label', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'style', label: 'Style', type: 'select', options: [['band', 'Coloured band'], ['line', 'Accent line']] },
    ],
    defaults: () => ({ number: '02', title: 'Reporting hazards', intro: 'How to raise a concern, and what happens next.', style: 'band' }),
    render(doc, d) {
      return el(doc, 'header', { class: 'ru-section ru-s-' + (d.style || 'band') }, [
        d.number ? el(doc, 'span', { class: 'ru-s-num', text: d.number }) : null,
        el(doc, 'div', null, [
          el(doc, 'h2', { class: 'ru-s-title', text: d.title || '' }),
          d.intro ? el(doc, 'p', { class: 'ru-s-intro', text: d.intro }) : null,
        ]),
      ]);
    },
  };

  TYPES.flipcards = {
    label: 'Flip cards', kind: 'interactive',
    description: 'Cards that flip over to show an answer, definition or tip.',
    fields: [
      { key: 'title', label: 'Instructions', type: 'text' },
      { key: 'columns', label: 'Cards per row', type: 'select', options: [['3', '3'], ['2', '2'], ['4', '4']] },
      { key: 'cards', label: 'Cards', type: 'list', itemLabel: 'Card', min: 1, max: 12, fields: [
        { key: 'front', label: 'Front', type: 'textarea' },
        { key: 'back', label: 'Back', type: 'textarea' },
        { key: 'image', label: 'Front image (optional)', type: 'image' },
      ] },
    ],
    defaults: () => ({ title: 'Select each card to reveal the answer.', columns: '3', cards: [
      { front: 'Near miss', back: 'An event that could have caused harm but didn’t. Report it anyway.', image: '' },
      { front: 'Hazard', back: 'Anything with the potential to cause harm.', image: '' },
      { front: 'Risk', back: 'How likely it is that a hazard causes harm, and how badly.', image: '' },
    ] }),
    render(doc, d) {
      const list = el(doc, 'ul', { class: 'ru-flips ru-cols-' + (['2', '3', '4'].includes(String(d.columns)) ? d.columns : '3') });
      (d.cards || []).forEach((c, i) => {
        const img = safeUrl(c.image, 'image');
        const front = el(doc, 'span', { class: 'ru-flip-face ru-flip-front' }, [img ? el(doc, 'img', { src: img, alt: '' }) : null, el(doc, 'span', { class: 'ru-flip-text', text: c.front || '' }), el(doc, 'span', { class: 'ru-flip-hint', text: 'Flip' })]);
        const back = el(doc, 'span', { class: 'ru-flip-face ru-flip-back', 'aria-hidden': 'true' }, [el(doc, 'span', { class: 'ru-flip-text', text: c.back || '' })]);
        const btn = el(doc, 'button', { type: 'button', class: 'ru-flip', 'aria-pressed': 'false', 'aria-label': (c.front || 'Card ' + (i + 1)) + ': flip card' }, [el(doc, 'span', { class: 'ru-flip-inner' }, [front, back])]);
        btn.addEventListener('click', () => {
          const on = btn.getAttribute('aria-pressed') !== 'true';
          btn.setAttribute('aria-pressed', String(on));
          back.setAttribute('aria-hidden', String(!on));
          front.setAttribute('aria-hidden', String(on));
          const live = list.parentNode && list.parentNode.querySelector('.ru-live');
          if (live) live.textContent = on ? (c.back || '') : (c.front || '');
        });
        list.appendChild(el(doc, 'li', null, [btn]));
      });
      return el(doc, 'section', { class: 'ru-flips-wrap' }, [
        d.title ? el(doc, 'p', { class: 'ru-instr', text: d.title }) : null,
        list,
        el(doc, 'p', { class: 'ru-sr ru-live', 'aria-live': 'polite' }),
      ]);
    },
  };

  TYPES.flipcarousel = {
    label: 'Flip card carousel', kind: 'interactive',
    description: 'Flip cards in a moving 3D carousel. Learners go forwards and backwards and flip the card at the front.',
    fields: [
      { key: 'title', label: 'Instructions', type: 'text' },
      { key: 'layout', label: 'Layout', type: 'select', options: [['carousel', '3D carousel'], ['deck', 'Stacked deck']] },
      { key: 'loop', label: 'Loop back to the first card at the end', type: 'checkbox' },
      { key: 'progress', label: 'Show how many cards have been flipped', type: 'checkbox' },
      { key: 'cards', label: 'Cards', type: 'list', itemLabel: 'Card', min: 2, max: 16, fields: [
        { key: 'front', label: 'Front', type: 'textarea' },
        { key: 'back', label: 'Back', type: 'textarea' },
        { key: 'image', label: 'Front image (optional)', type: 'image' },
      ] },
    ],
    defaults: () => ({ title: 'Use the arrows to move through the cards. Select the front card to flip it.', layout: 'carousel', loop: true, progress: true, cards: [
      { front: 'Hazard', back: 'Anything with the potential to cause harm.', image: '' },
      { front: 'Risk', back: 'How likely it is that a hazard causes harm, and how badly.', image: '' },
      { front: 'Near miss', back: 'An event that could have caused harm but didn’t. Report it anyway.', image: '' },
      { front: 'Control measure', back: 'Something put in place to reduce a risk, such as a guard or training.', image: '' },
      { front: 'PPE', back: 'Personal protective equipment: the last line of defence, not the first.', image: '' },
    ] }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const cards = (d.cards || []).filter((c) => c && (c.front || c.back || c.image));
      const n = cards.length;
      const loop = d.loop !== false && n > 2;
      const deck = d.layout === 'deck';
      let current = 0;
      const flipped = new Set();
      const uid = 'ru-fcc-' + ((ctx && ctx.id) || 'x');

      const live = el(doc, 'p', { class: 'ru-sr', 'aria-live': 'polite' });
      const stage = el(doc, 'div', { class: 'ru-fcc-stage' + (deck ? ' ru-fcc-deck' : ''), tabindex: '0', 'aria-label': 'Cards. Use the left and right arrow keys to move.' });
      const slides = cards.map((c, i) => {
        const img = safeUrl(c.image, 'image');
        const front = el(doc, 'span', { class: 'ru-flip-face ru-flip-front' }, [img ? el(doc, 'img', { src: img, alt: '' }) : null, el(doc, 'span', { class: 'ru-flip-text', text: c.front || '' }), el(doc, 'span', { class: 'ru-flip-hint', text: 'Flip' })]);
        const back = el(doc, 'span', { class: 'ru-flip-face ru-flip-back', 'aria-hidden': 'true' }, [el(doc, 'span', { class: 'ru-flip-text', text: c.back || '' })]);
        const btn = el(doc, 'button', { type: 'button', class: 'ru-flip', 'aria-pressed': 'false', 'aria-label': (c.front || 'Card ' + (i + 1)) + ': flip card' }, [el(doc, 'span', { class: 'ru-flip-inner' }, [front, back])]);
        const slide = el(doc, 'div', { class: 'ru-fcc-card', role: 'group', 'aria-roledescription': 'card', 'aria-label': (i + 1) + ' of ' + n }, [btn]);
        btn.addEventListener('click', () => {
          if (i !== current) { go(i); return; } // a side card brings itself to the front
          const on = btn.getAttribute('aria-pressed') !== 'true';
          btn.setAttribute('aria-pressed', String(on));
          back.setAttribute('aria-hidden', String(!on));
          front.setAttribute('aria-hidden', String(on));
          if (on) flipped.add(i);
          live.textContent = on ? (c.back || '') : (c.front || '');
          update();
        });
        return { slide, btn };
      });
      slides.forEach((s) => stage.appendChild(s.slide));

      const prev = el(doc, 'button', { type: 'button', class: 'ru-fcc-nav ru-fcc-prev', 'aria-label': 'Previous card', 'aria-controls': uid, text: '‹' });
      const next = el(doc, 'button', { type: 'button', class: 'ru-fcc-nav ru-fcc-next', 'aria-label': 'Next card', 'aria-controls': uid, text: '›' });
      const dots = el(doc, 'div', { class: 'ru-fcc-dots' });
      const dotBtns = cards.map((c, i) => {
        const b = el(doc, 'button', { type: 'button', class: 'ru-fcc-dot', 'aria-label': 'Go to card ' + (i + 1) + (c.front ? ': ' + c.front : '') });
        b.addEventListener('click', () => go(i));
        dots.appendChild(b);
        return b;
      });
      const count = el(doc, 'p', { class: 'ru-fcc-count' });

      /** Signed distance from the front card, the short way round when looping. */
      function offset(i) {
        let o = i - current;
        if (loop) {
          if (o > n / 2) o -= n;
          if (o < -n / 2) o += n;
        }
        return o;
      }

      function update() {
        slides.forEach(({ slide, btn }, i) => {
          const o = offset(i);
          const a = Math.abs(o);
          const visible = a <= (deck ? 3 : 2);
          let t;
          if (deck) {
            t = o < 0
              ? 'translateX(' + (-110 - (a - 1) * 8) + '%) rotate(' + (-8 - a * 2) + 'deg) scale(.92)'
              : 'translateY(' + (a * 14) + 'px) scale(' + (1 - a * 0.05) + ')';
          } else {
            const x = a === 0 ? 0 : (a === 1 ? 78 : 128);
            t = 'translateX(' + (Math.sign(o) * x) + '%) translateZ(' + (-a * 160) + 'px) rotateY(' + (-Math.sign(o) * (a ? 38 : 0)) + 'deg)';
          }
          slide.style.transform = t;
          slide.style.zIndex = String(100 - a * 2 - (deck && o < 0 ? 50 : 0));
          slide.style.opacity = visible ? (deck ? (o < 0 ? (a === 1 ? '1' : '0') : String(1 - a * 0.15)) : (a <= 1 ? '1' : '0.55')) : '0';
          slide.classList.toggle('is-far', a >= 2);
          slide.style.pointerEvents = visible && !(deck && o < -1) ? 'auto' : 'none';
          slide.classList.toggle('is-current', o === 0);
          // Only the front card is reachable by keyboard and screen readers.
          if (o === 0) { slide.removeAttribute('aria-hidden'); btn.removeAttribute('tabindex'); }
          else { slide.setAttribute('aria-hidden', 'true'); btn.setAttribute('tabindex', '-1'); }
          slide.classList.toggle('is-flipped-done', flipped.has(i));
        });
        dotBtns.forEach((b, i) => {
          b.classList.toggle('is-active', i === current);
          b.classList.toggle('is-seen', flipped.has(i));
          if (i === current) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
        });
        prev.disabled = !loop && current === 0;
        next.disabled = !loop && current === n - 1;
        count.textContent = 'Card ' + (current + 1) + ' of ' + n + (d.progress !== false ? ' · ' + flipped.size + ' flipped' : '');
      }

      function go(i, announce) {
        if (!n) return;
        const target = loop ? (i + n) % n : Math.max(0, Math.min(n - 1, i));
        if (target === current) return;
        current = target;
        update();
        if (announce !== false) live.textContent = 'Card ' + (current + 1) + ' of ' + n + ': ' + (cards[current].front || '');
      }

      prev.addEventListener('click', () => go(current - 1));
      next.addEventListener('click', () => go(current + 1));
      stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
        else if (e.key === 'Home') { e.preventDefault(); go(0); }
        else if (e.key === 'End') { e.preventDefault(); go(n - 1); }
      });
      // Swipe on touch screens.
      let sx = null;
      stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') sx = e.clientX; });
      stage.addEventListener('pointerup', (e) => {
        if (sx === null) return;
        const dx = e.clientX - sx;
        sx = null;
        if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
      });
      update();

      return el(doc, 'section', { class: 'ru-fcc', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': d.title || 'Flip card carousel' }, [
        d.title ? el(doc, 'p', { class: 'ru-instr', text: d.title }) : null,
        el(doc, 'div', { class: 'ru-fcc-frame', id: uid }, [prev, stage, next]),
        el(doc, 'div', { class: 'ru-fcc-foot' }, [dots, count]),
        live,
      ]);
    },
  };

  TYPES.hotspots = {
    label: 'Image hotspots', kind: 'interactive',
    description: 'Numbered markers on an image that open a short explanation.',
    fields: [
      { key: 'title', label: 'Instructions', type: 'text' },
      { key: 'image', label: 'Image', type: 'image', hotspotTarget: true },
      { key: 'alt', label: 'Image description (alt text)', type: 'text' },
      { key: 'points', label: 'Hotspots', type: 'list', itemLabel: 'Hotspot', min: 1, max: 12, fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea' },
        { key: 'x', label: 'Across (%)', type: 'number', min: 0, max: 100 },
        { key: 'y', label: 'Down (%)', type: 'number', min: 0, max: 100 },
      ] },
    ],
    defaults: () => ({ title: 'Select each marker to learn more.', image: '', alt: '', points: [
      { title: 'Fire exit', text: 'Keep clear at all times.', x: 22, y: 40 },
      { title: 'First aid kit', text: 'Checked every month by the first aider.', x: 68, y: 58 },
    ] }),
    render(doc, d) {
      const img = safeUrl(d.image, 'image');
      const stage = el(doc, 'div', { class: 'ru-hs-stage' }, [
        img ? el(doc, 'img', { src: img, alt: d.alt || '', class: 'ru-hs-img' }) : el(doc, 'div', { class: 'ru-hs-placeholder', text: 'Add an image' }),
      ]);
      const pop = el(doc, 'div', { class: 'ru-hs-pop', role: 'region', 'aria-live': 'polite', hidden: true });
      let openBtn = null;
      const close = () => {
        pop.hidden = true;
        if (openBtn) { openBtn.setAttribute('aria-expanded', 'false'); openBtn.classList.remove('is-open'); }
        openBtn = null;
      };
      (d.points || []).forEach((p, i) => {
        const x = Math.min(100, Math.max(0, Number(p.x) || 0));
        const y = Math.min(100, Math.max(0, Number(p.y) || 0));
        const b = el(doc, 'button', { type: 'button', class: 'ru-hs-pin', style: 'left:' + x + '%;top:' + y + '%', 'aria-expanded': 'false', 'aria-label': (i + 1) + ': ' + (p.title || 'Hotspot'), text: String(i + 1) });
        b.addEventListener('click', () => {
          if (openBtn === b) return close();
          close();
          openBtn = b;
          b.setAttribute('aria-expanded', 'true');
          b.classList.add('is-open');
          pop.replaceChildren(
            el(doc, 'button', { type: 'button', class: 'ru-hs-close', 'aria-label': 'Close', text: '×', onclick: () => { const back = openBtn; close(); if (back) back.focus(); } }),
            el(doc, 'h4', { text: (i + 1) + '. ' + (p.title || '') }),
            el(doc, 'p', { text: p.text || '' }));
          pop.style.setProperty('--ru-x', x + '%');
          pop.classList.toggle('ru-left', x > 55);
          pop.style.top = 'calc(' + y + '% + 22px)';
          pop.style.left = x > 55 ? '' : 'calc(' + x + '% - 20px)';
          pop.style.right = x > 55 ? 'calc(' + (100 - x) + '% - 20px)' : '';
          pop.hidden = false;
        });
        stage.appendChild(b);
      });
      stage.appendChild(pop);
      stage.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openBtn) { const back = openBtn; close(); back.focus(); } });
      return el(doc, 'section', { class: 'ru-hs' }, [d.title ? el(doc, 'p', { class: 'ru-instr', text: d.title }) : null, stage]);
    },
  };

  TYPES.sort = {
    label: 'Put in order', kind: 'interactive',
    description: 'Learners drag (or move with buttons) items into the right order, then check their answer.',
    fields: [
      { key: 'question', label: 'Question', type: 'text' },
      { key: 'items', label: 'Items, in the correct order', type: 'list', itemLabel: 'Item', min: 2, max: 10, fields: [
        { key: 'text', label: 'Text', type: 'text' },
      ] },
      { key: 'correct', label: 'Feedback when correct', type: 'text' },
      { key: 'incorrect', label: 'Feedback when not correct', type: 'text' },
    ],
    defaults: () => ({ question: 'Put the steps for reporting a hazard in order.', items: [
      { text: 'Spot the hazard' }, { text: 'Make the area safe' }, { text: 'Tell your supervisor' }, { text: 'Log it in the safety app' },
    ], correct: 'That’s right. Safety first, then report.', incorrect: 'Not quite. The ticked items are in the right place.' }),
    render(doc, d, ctx) {
      const items = (d.items || []).map((it, i) => ({ text: it.text || '', index: i }));
      let order = shuffled(items, (ctx && ctx.id) || 'x');
      const list = el(doc, 'ol', { class: 'ru-sort' });
      const feedback = el(doc, 'p', { class: 'ru-feedback', 'aria-live': 'polite' });
      const check = el(doc, 'button', { type: 'button', class: 'ru-btn', text: 'Check answer' });
      const reset = el(doc, 'button', { type: 'button', class: 'ru-btn ru-btn-ghost', text: 'Try again', hidden: true });
      let dragFrom = null;
      let locked = false;

      function move(from, to, focusIdx) {
        if (locked || to < 0 || to >= order.length) return;
        const [m] = order.splice(from, 1);
        order.splice(to, 0, m);
        draw(focusIdx === undefined ? null : focusIdx);
        feedback.textContent = m.text + ' moved to position ' + (to + 1) + '.';
      }

      function draw(focusPos, focusDir) {
        list.replaceChildren(...order.map((it, pos) => {
          const up = el(doc, 'button', { type: 'button', class: 'ru-sort-mv', 'aria-label': 'Move “' + it.text + '” up', text: '↑', disabled: locked || pos === 0 ? true : null, onclick: () => move(pos, pos - 1, pos - 1) });
          const down = el(doc, 'button', { type: 'button', class: 'ru-sort-mv', 'aria-label': 'Move “' + it.text + '” down', text: '↓', disabled: locked || pos === order.length - 1 ? true : null, onclick: () => move(pos, pos + 1, pos + 1) });
          const li = el(doc, 'li', { class: 'ru-sort-item', draggable: locked ? null : 'true' }, [
            el(doc, 'span', { class: 'ru-sort-grip', 'aria-hidden': 'true', text: '☰' }),
            el(doc, 'span', { class: 'ru-sort-text', text: it.text }),
            el(doc, 'span', { class: 'ru-sort-btns' }, [up, down]),
          ]);
          li.addEventListener('dragstart', (e) => { dragFrom = pos; li.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(pos)); });
          li.addEventListener('dragend', () => li.classList.remove('is-drag'));
          li.addEventListener('dragover', (e) => { if (dragFrom !== null) { e.preventDefault(); li.classList.add('is-over'); } });
          li.addEventListener('dragleave', () => li.classList.remove('is-over'));
          li.addEventListener('drop', (e) => { e.preventDefault(); li.classList.remove('is-over'); if (dragFrom !== null && dragFrom !== pos) move(dragFrom, pos); dragFrom = null; });
          if (locked) li.classList.add(it.index === pos ? 'is-right' : 'is-wrong');
          return li;
        }));
        if (focusPos !== null && focusPos !== undefined) {
          const btns = list.children[focusPos] && list.children[focusPos].querySelectorAll('.ru-sort-mv:not([disabled])');
          if (btns && btns.length) btns[btns.length > 1 && focusDir === 'down' ? 1 : 0].focus();
        }
      }

      check.addEventListener('click', () => {
        locked = true;
        const right = order.filter((it, pos) => it.index === pos).length;
        const all = right === order.length;
        feedback.textContent = (all ? d.correct : d.incorrect) || (all ? 'Correct.' : 'Not quite.');
        feedback.className = 'ru-feedback ' + (all ? 'is-right' : 'is-wrong');
        check.hidden = true;
        reset.hidden = all;
        draw();
      });
      reset.addEventListener('click', () => {
        locked = false;
        order = shuffled(items, Math.random());
        feedback.textContent = '';
        feedback.className = 'ru-feedback';
        check.hidden = false;
        reset.hidden = true;
        draw();
      });
      draw();
      return el(doc, 'section', { class: 'ru-sort-wrap' }, [
        el(doc, 'p', { class: 'ru-q', text: d.question || '' }),
        el(doc, 'p', { class: 'ru-instr', text: 'Drag the items, or use the arrow buttons, then check your answer.' }),
        list,
        el(doc, 'div', { class: 'ru-actions' }, [check, reset]),
        feedback,
      ]);
    },
  };

  TYPES.reveal = {
    label: 'Think, then reveal', kind: 'interactive',
    description: 'A question or scenario with a button that reveals the answer, so learners think first.',
    fields: [
      { key: 'title', label: 'Heading (optional)', type: 'text' },
      { key: 'items', label: 'Questions', type: 'list', itemLabel: 'Question', min: 1, max: 8, fields: [
        { key: 'prompt', label: 'Question or scenario', type: 'textarea' },
        { key: 'answer', label: 'Answer', type: 'textarea' },
      ] },
      { key: 'buttonText', label: 'Button text', type: 'text' },
    ],
    defaults: () => ({ title: 'What would you do?', buttonText: 'Reveal answer', items: [
      { prompt: 'A colleague is about to lift a heavy box on their own.', answer: 'Offer to help, or suggest they use the trolley. Two-person lifts are safer for anything over 25 kg.' },
    ] }),
    render(doc, d, ctx) {
      return el(doc, 'section', { class: 'ru-reveal-wrap' }, [
        d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null,
        ...(d.items || []).map((it, i) => {
          const id = 'ru-rv-' + ((ctx && ctx.id) || 'x') + '-' + i;
          const ans = el(doc, 'div', { class: 'ru-rv-answer', id, hidden: true }, [el(doc, 'p', { text: it.answer || '' })]);
          const btn = el(doc, 'button', { type: 'button', class: 'ru-btn', 'aria-expanded': 'false', 'aria-controls': id, text: d.buttonText || 'Reveal answer' });
          btn.addEventListener('click', () => {
            const open = ans.hidden;
            ans.hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
            btn.textContent = open ? 'Hide answer' : (d.buttonText || 'Reveal answer');
          });
          return el(doc, 'div', { class: 'ru-rv' }, [el(doc, 'p', { class: 'ru-q', text: it.prompt || '' }), btn, ans]);
        }),
      ]);
    },
  };

  TYPES.compare = {
    label: 'Before / after slider', kind: 'interactive',
    description: 'Two images on top of each other with a handle learners drag to compare them.',
    fields: [
      { key: 'title', label: 'Instructions', type: 'text' },
      { key: 'before', label: 'Before image', type: 'image' },
      { key: 'beforeLabel', label: 'Before label', type: 'text' },
      { key: 'after', label: 'After image', type: 'image' },
      { key: 'afterLabel', label: 'After label', type: 'text' },
      { key: 'alt', label: 'Describe what changes (alt text)', type: 'text' },
    ],
    defaults: () => ({ title: 'Drag the handle to compare.', before: '', beforeLabel: 'Before', after: '', afterLabel: 'After', alt: '' }),
    render(doc, d) {
      const before = safeUrl(d.before, 'image');
      const after = safeUrl(d.after, 'image');
      const range = el(doc, 'input', { type: 'range', min: '0', max: '100', value: '50', class: 'ru-cmp-range', 'aria-label': 'Compare ' + (d.beforeLabel || 'before') + ' and ' + (d.afterLabel || 'after') });
      const top = el(doc, 'div', { class: 'ru-cmp-top' }, [before ? el(doc, 'img', { src: before, alt: '' }) : el(doc, 'div', { class: 'ru-hs-placeholder', text: 'Before image' })]);
      const handle = el(doc, 'div', { class: 'ru-cmp-handle', 'aria-hidden': 'true' });
      const stage = el(doc, 'div', { class: 'ru-cmp', role: 'group', 'aria-label': d.alt || 'Before and after comparison' }, [
        after ? el(doc, 'img', { src: after, alt: '', class: 'ru-cmp-base' }) : el(doc, 'div', { class: 'ru-hs-placeholder ru-cmp-base', text: 'After image' }),
        top, handle,
        d.beforeLabel ? el(doc, 'span', { class: 'ru-cmp-label ru-cmp-l', text: d.beforeLabel }) : null,
        d.afterLabel ? el(doc, 'span', { class: 'ru-cmp-label ru-cmp-r', text: d.afterLabel }) : null,
        range,
      ]);
      const set = () => { stage.style.setProperty('--ru-pos', range.value + '%'); };
      range.addEventListener('input', set);
      set();
      return el(doc, 'section', { class: 'ru-cmp-wrap' }, [d.title ? el(doc, 'p', { class: 'ru-instr', text: d.title }) : null, stage]);
    },
  };

  TYPES.reflection = {
    label: 'Reflection', kind: 'interactive',
    description: 'A question learners answer in their own words. Answers are kept on their device and can be downloaded.',
    fields: [
      { key: 'question', label: 'Question', type: 'textarea' },
      { key: 'hint', label: 'Hint (optional)', type: 'text' },
      { key: 'saveText', label: 'Save button text', type: 'text' },
    ],
    defaults: () => ({ question: 'Think of a time you noticed something unsafe at work. What did you do, and what would you do now?', hint: 'Only you can see your answer.', saveText: 'Save my answer' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const key = 'riseup:reflection:' + ((ctx && ctx.courseKey) || '') + ':' + ((ctx && ctx.id) || '');
      const read = () => { try { return win.localStorage.getItem(key) || ''; } catch (e) { return ''; } };
      const id = 'ru-rf-' + ((ctx && ctx.id) || 'x');
      const ta = el(doc, 'textarea', { id, class: 'ru-rf-input', rows: '5' });
      ta.value = read();
      const status = el(doc, 'p', { class: 'ru-feedback', 'aria-live': 'polite' });
      const save = el(doc, 'button', { type: 'button', class: 'ru-btn', text: d.saveText || 'Save my answer' });
      const dl = el(doc, 'button', { type: 'button', class: 'ru-btn ru-btn-ghost', text: 'Download' });
      save.addEventListener('click', () => {
        try { win.localStorage.setItem(key, ta.value); status.textContent = 'Saved on this device.'; }
        catch (e) { status.textContent = 'Your browser didn’t allow saving. Download your answer to keep it.'; }
      });
      dl.addEventListener('click', () => {
        const blob = new win.Blob([(d.question || '') + '\n\n' + ta.value + '\n'], { type: 'text/plain' });
        const a = el(doc, 'a', { href: win.URL.createObjectURL(blob), download: 'my-reflection.txt' });
        doc.body.appendChild(a); a.click(); a.remove();
      });
      return el(doc, 'section', { class: 'ru-rf' }, [
        el(doc, 'label', { for: id, class: 'ru-q', text: d.question || '' }),
        d.hint ? el(doc, 'p', { class: 'ru-instr', text: d.hint }) : null,
        ta,
        el(doc, 'div', { class: 'ru-actions' }, [save, dl]),
        status,
      ]);
    },
  };

  // ------------------------------------------------------------------ course theme
  function rgbToHex(c) {
    const m = c && c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return '';
    return '#' + [m[1], m[2], m[3]].map((v) => ('0' + Number(v).toString(16)).slice(-2)).join('');
  }

  function luminanceOf(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }

  /**
   * Read the look of the Rise course around `near` (the element a block code
   * sits in): theme colour, heading and body fonts, text colour, button
   * shape, and whether the block's background is dark. Anything that can't
   * be read is left out, so the block falls back to its defaults.
   */
  function detectCourseTheme(doc, near) {
    const win = doc.defaultView;
    const cs = (el) => win.getComputedStyle(el);
    const outside = (el) => !el.closest('.ru-c, riseup-panel, [data-riseup-ignore]');
    const pick = (sel) => Array.from(doc.querySelectorAll(sel)).find((el) => outside(el) && el.offsetParent !== null) || null;
    const t = {};

    const brand = pick('.brand--background, [class*="brand--background"]');
    if (brand) t.accent = rgbToHex(cs(brand).backgroundColor);
    if (!t.accent) {
      const branded = pick('.brand--color, [class*="brand--color"], .brand--link');
      if (branded) t.accent = rgbToHex(cs(branded).color);
    }

    const heading = pick('.lesson-header__title, [data-block-id] h1, [data-block-id] h2, [data-block-id] h3, .block-wrapper h2, .block-wrapper h3, main h1, main h2');
    if (heading) t.headingFont = cs(heading).fontFamily;

    const textEl = near && near.nodeType === 1 ? near : pick('[data-block-id] p, .block-wrapper p, main p');
    if (textEl) {
      t.bodyFont = cs(textEl).fontFamily;
      t.ink = rgbToHex(cs(textEl).color);
      // The first solid background behind the block decides light or dark.
      for (let e = textEl; e && e.nodeType === 1; e = e.parentElement) {
        const bg = rgbToHex(cs(e).backgroundColor);
        if (bg) { t.dark = luminanceOf(bg) < 0.2; break; }
      }
    }

    const button = pick('.blocks-button__button, [data-block-id] a.brand--background, [data-block-id] button.brand--background');
    if (button) {
      const r = cs(button).borderTopLeftRadius;
      if (r && r !== '0px') t.buttonRadius = r;
      else if (r === '0px') t.buttonRadius = '0px';
    }
    return t;
  }

  /** Put a detected theme onto one rendered block. */
  function applyCourseTheme(node, t, opts) {
    if (!node || !t) return;
    const o = opts || {};
    const set = (k, v) => { if (v) node.style.setProperty(k, v); };
    if (!o.keepAccent && t.accent) {
      set('--ru-accent', t.accent);
      set('--ru-accent-ink', inkFor(t.accent));
      set('--ru-accent-ink-large', largeInkFor(t.accent));
    }
    set('--ru-heading-font', t.headingFont);
    set('--ru-body-font', t.bodyFont);
    set('--ru-btn-radius', t.buttonRadius);
    if (t.dark) node.classList.add('ru-on-dark');
    else set('--ru-ink', t.ink);
  }

  // ------------------------------------------------------------------ render
  function renderComponent(doc, comp, ctx) {
    const type = comp && TYPES[comp.type];
    if (!type) return null;
    const data = Object.assign(type.defaults(), comp.data || {});
    const node = type.render(doc, data, Object.assign({ id: comp.id }, ctx || {}));
    const root = el(doc, 'div', { class: 'ru-c ru-c-' + comp.type, 'data-riseup-component': comp.id, 'data-riseup-ignore': '' }, [node]);
    return root;
  }

  /** Pick readable text (white or near-black) for a background colour. */
  function inkFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16);
    const lin = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? '#ffffff' : '#14161c';
  }

  /** Large bold text only needs 3:1 (WCAG), so white is kept on mid-tone accents. */
  function largeInkFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16);
    const lin = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return 1.05 / (L + 0.05) >= 3 ? '#ffffff' : inkFor(hex);
  }

  function themeCss(theme) {
    let accent = safeColor(theme && theme.accent) || '#2f6fde';
    if (accent.length === 4) accent = '#' + accent.slice(1).split('').map((c) => c + c).join('');
    const radius = Math.min(32, Math.max(0, Number(theme && theme.radius) || 12));
    return '.ru-c { --ru-accent: ' + accent + '; --ru-accent-ink: ' + inkFor(accent) + '; --ru-accent-ink-large: ' + largeInkFor(accent) + '; --ru-radius: ' + radius + 'px; }';
  }

  const ANIMATIONS = { none: 'None', fade: 'Fade in', rise: 'Rise up', zoom: 'Zoom in', slide: 'Slide in from the side' };

  const COMPONENT_CSS = `
.ru-c { --ru-accent: #2f6fde; --ru-accent-ink: #fff; --ru-radius: 12px; --ru-ink: #1d2330; --ru-muted: #5b6475; --ru-line: #e3e6ec; --ru-soft: #f5f6f9; --ru-card: #ffffff; --ru-btn-radius: 999px;
  color: var(--ru-ink); font: inherit; font-family: var(--ru-body-font, inherit); line-height: 1.5; margin: 8px 0; text-align: left; white-space: normal; }
.ru-c *, .ru-c *::before, .ru-c *::after { box-sizing: border-box; }
.ru-c [hidden] { display: none !important; }
.ru-c img { max-width: 100%; display: block; }
.ru-c h2, .ru-c h3, .ru-c h4, .ru-c p, .ru-c ol, .ru-c ul, .ru-c figure, .ru-c blockquote { margin: 0; padding: 0; }
.ru-c p, .ru-c .ru-flip-text, .ru-c .ru-tl-text { white-space: pre-line; }
.ru-c .ru-title, .ru-c .ru-hero-title, .ru-c .ru-s-title, .ru-c .ru-s-num, .ru-c .ru-tl-title, .ru-c .ru-stat-value, .ru-c .ru-q, .ru-c .ru-flip-front, .ru-c .ru-quote blockquote p, .ru-c .ru-hs-pop h4 { font-family: var(--ru-heading-font, inherit); }
.ru-c .ru-title { font-size: 1.35em; font-weight: 700; margin-bottom: 16px; }
.ru-c .ru-instr { color: var(--ru-muted); font-size: .92em; margin-bottom: 14px; }
.ru-c .ru-q { display: block; font-weight: 700; font-size: 1.08em; margin-bottom: 10px; }
.ru-c .ru-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ru-c .ru-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border: 2px solid var(--ru-accent); border-radius: var(--ru-btn-radius); background: var(--ru-accent); color: var(--ru-accent-ink); font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; transition: transform .15s ease, box-shadow .15s ease; }
.ru-c .ru-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.15); }
.ru-c .ru-btn-ghost { background: transparent; color: var(--ru-accent); }
.ru-c .ru-btn-light { background: #fff; border-color: #fff; color: #14161c; }
.ru-c button:focus-visible, .ru-c a:focus-visible, .ru-c textarea:focus-visible, .ru-c input:focus-visible { outline: 3px solid var(--ru-accent); outline-offset: 3px; }
.ru-c .ru-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.ru-c .ru-feedback { margin-top: 12px; min-height: 1.5em; font-weight: 600; }
.ru-c .ru-feedback.is-right { color: #1d7a46; }
.ru-c .ru-feedback.is-wrong { color: #b3261e; }
.ru-c .ru-hs-placeholder { display: grid; place-items: center; min-height: 220px; background: repeating-linear-gradient(45deg, var(--ru-soft), var(--ru-soft) 12px, #eceef3 12px, #eceef3 24px); color: var(--ru-muted); border-radius: var(--ru-radius); }

/* On a dark Rise block: light text, translucent cards */
.ru-c.ru-on-dark { --ru-ink: #ffffff; --ru-muted: rgba(255,255,255,.75); --ru-line: rgba(255,255,255,.22); --ru-soft: rgba(255,255,255,.08); --ru-card: rgba(255,255,255,.1); }
.ru-c.ru-on-dark .ru-feedback.is-right { color: #5fd08f; }
.ru-c.ru-on-dark .ru-feedback.is-wrong { color: #ff8a88; }
.ru-c.ru-on-dark .ru-rf-input { background: rgba(0,0,0,.25); }

/* Hero */
.ru-c .ru-hero { position: relative; display: flex; align-items: center; color: #fff; background-size: cover; background-position: center; border-radius: var(--ru-radius); overflow: hidden; }
.ru-c .ru-hero.ru-bleed { width: 100vw; margin-left: calc(50% - 50vw); border-radius: 0; }
.ru-c .ru-hero-inner { width: 100%; max-width: 860px; margin: 0 auto; padding: 48px clamp(20px, 5vw, 56px); }
.ru-c .ru-h-short { min-height: 240px; } .ru-c .ru-h-medium { min-height: 380px; } .ru-c .ru-h-tall { min-height: 560px; }
.ru-c .ru-al-center { text-align: center; }
.ru-c .ru-eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: .8em; font-weight: 700; opacity: .9; margin-bottom: 10px; }
.ru-c .ru-hero-title { font-size: clamp(1.9em, 4.2vw, 3.1em); line-height: 1.08; font-weight: 800; letter-spacing: -.02em; color: #fff; }
.ru-c .ru-hero-sub { font-size: 1.15em; margin-top: 14px; max-width: 40em; opacity: .95; }
.ru-c .ru-al-center .ru-hero-sub { margin-left: auto; margin-right: auto; }
.ru-c .ru-hero .ru-btn { margin-top: 24px; }

/* Stats */
.ru-c .ru-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
.ru-c .ru-stat { padding: 22px 18px; border-radius: var(--ru-radius); background: var(--ru-soft); border-top: 4px solid var(--ru-accent); }
.ru-c .ru-stat-value { font-size: 2.4em; font-weight: 800; line-height: 1.05; color: var(--ru-accent); font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.ru-c .ru-stat-label { margin-top: 8px; color: var(--ru-muted); font-weight: 600; }

/* Timeline */
.ru-c .ru-timeline { list-style: none; position: relative; padding-left: 34px; }
.ru-c .ru-timeline::before { content: ""; position: absolute; left: 9px; top: 6px; bottom: 6px; width: 3px; border-radius: 3px; background: linear-gradient(var(--ru-accent), var(--ru-line)); }
.ru-c .ru-tl-item { position: relative; padding-bottom: 26px; }
.ru-c .ru-tl-item:last-child { padding-bottom: 0; }
.ru-c .ru-tl-dot { position: absolute; left: -34px; top: 3px; width: 21px; height: 21px; border-radius: 50%; background: var(--ru-card); border: 4px solid var(--ru-accent); }
.ru-c .ru-tl-date { font-size: .8em; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--ru-accent); }
.ru-c .ru-tl-title { font-size: 1.15em; font-weight: 700; margin: 2px 0 4px; }
.ru-c .ru-tl-text { color: var(--ru-muted); }

/* Quote */
.ru-c .ru-quote { position: relative; padding: 30px 30px 26px 30px; border-radius: var(--ru-radius); background: var(--ru-soft); border-left: 6px solid var(--ru-accent); }
.ru-c .ru-q-mark { position: absolute; top: -8px; right: 20px; font: 900 110px/1 Georgia, serif; color: var(--ru-accent); opacity: .18; }
.ru-c .ru-quote blockquote p { font-size: 1.25em; font-weight: 600; line-height: 1.4; padding-right: 56px; }
.ru-c .ru-q-large blockquote p { padding-right: 0; }
.ru-c .ru-quote figcaption { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
.ru-c .ru-quote figcaption > span { display: flex; flex-direction: column; }
.ru-c .ru-q-img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; }
.ru-c .ru-q-role { color: var(--ru-muted); font-size: .92em; }
.ru-c .ru-q-large { background: none; border: 0; text-align: center; padding: 20px 10px; }
.ru-c .ru-q-large blockquote p { font-size: clamp(1.5em, 3vw, 2.1em); font-weight: 700; letter-spacing: -.01em; }
.ru-c .ru-q-large .ru-q-mark { position: static; display: block; height: 60px; opacity: .5; }
.ru-c .ru-q-large figcaption { justify-content: center; }

/* Section header */
.ru-c .ru-section { display: flex; gap: 22px; align-items: center; border-radius: var(--ru-radius); }
.ru-c .ru-s-band { padding: 30px 32px; background: var(--ru-accent); color: var(--ru-accent-ink); }
.ru-c .ru-s-line { padding: 8px 0 18px; border-bottom: 4px solid var(--ru-accent); }
.ru-c .ru-s-num { font-size: 3.4em; font-weight: 900; line-height: 1; opacity: .9; letter-spacing: -.04em; }
.ru-c .ru-s-line .ru-s-num { color: var(--ru-accent); }
.ru-c .ru-s-title { font-size: 1.7em; font-weight: 800; line-height: 1.15; color: inherit; }
.ru-c .ru-s-intro { margin-top: 6px; opacity: .9; }

/* Flip cards */
.ru-c .ru-flips { list-style: none; display: grid; gap: 14px; grid-template-columns: repeat(3, 1fr); }
.ru-c .ru-cols-2 { grid-template-columns: repeat(2, 1fr); } .ru-c .ru-cols-4 { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 640px) { .ru-c .ru-flips { grid-template-columns: 1fr 1fr; } }
@media (max-width: 420px) { .ru-c .ru-flips { grid-template-columns: 1fr; } }
.ru-c .ru-flip { display: block; width: 100%; min-height: 190px; padding: 0; border: 0; background: none; cursor: pointer; perspective: 1000px; font: inherit; color: inherit; text-align: center; }
.ru-c .ru-flip-inner { position: relative; display: block; width: 100%; min-height: 190px; transition: transform .6s cubic-bezier(.2,.7,.2,1); transform-style: preserve-3d; }
.ru-c .ru-flip[aria-pressed="true"] .ru-flip-inner { transform: rotateY(180deg); }
.ru-c .ru-flip-face { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 18px; border-radius: var(--ru-radius); backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; }
.ru-c .ru-flip-front { background: var(--ru-accent); color: var(--ru-accent-ink-large, var(--ru-accent-ink)); font-weight: 800; font-size: 1.2em; box-shadow: 0 6px 18px rgba(0,0,0,.12); }
.ru-c .ru-flip-front img { max-height: 90px; border-radius: 8px; }
.ru-c .ru-flip-hint { position: absolute; bottom: 10px; right: 14px; font-size: .6em; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; opacity: .75; }
.ru-c .ru-flip-back { background: var(--ru-card); color: var(--ru-ink); border: 2px solid var(--ru-accent); transform: rotateY(180deg); font-size: .98em; }
.ru-c .ru-flip:hover .ru-flip-front { filter: brightness(1.06); }

/* Flip card carousel */
.ru-c .ru-fcc-frame { position: relative; display: flex; align-items: center; gap: 8px; }
.ru-c .ru-fcc-stage { position: relative; flex: 1; height: 330px; perspective: 1200px; transform-style: preserve-3d; overflow: hidden; outline: none; touch-action: pan-y; border-radius: var(--ru-radius); }
.ru-c .ru-fcc-stage:focus-visible { outline: 3px solid var(--ru-accent); outline-offset: 2px; }
.ru-c .ru-fcc-card { position: absolute; top: 18px; left: 50%; width: min(220px, 46%); margin-left: calc(min(220px, 46%) / -2); height: 280px; transition: transform .6s cubic-bezier(.2,.75,.2,1), opacity .45s ease; transform-style: preserve-3d; will-change: transform; }
.ru-c .ru-fcc-card .ru-flip, .ru-c .ru-fcc-card .ru-flip-inner { height: 100%; min-height: 0; }
.ru-c .ru-fcc-card:not(.is-current) .ru-flip-front { filter: brightness(.82) saturate(.9); box-shadow: 0 4px 12px rgba(0,0,0,.12); }
.ru-c .ru-fcc-card:not(.is-current) .ru-flip-hint, .ru-c .ru-fcc-card.is-far .ru-flip-text, .ru-c .ru-fcc-card.is-far img { visibility: hidden; }
.ru-c .ru-fcc-card.is-current .ru-flip-front { box-shadow: 0 16px 34px rgba(0,0,0,.22); }
.ru-c .ru-fcc-card.is-flipped-done .ru-flip-hint::before { content: "\\2713  "; }
.ru-c .ru-fcc-deck .ru-fcc-card { top: 14px; }
.ru-c .ru-fcc-nav { flex: none; width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--ru-accent); background: var(--ru-card); color: var(--ru-accent); font: 700 26px/1 system-ui, sans-serif; cursor: pointer; display: grid; place-items: center; padding-bottom: 3px; transition: background .15s, color .15s, transform .15s; }
.ru-c .ru-fcc-nav:hover:not(:disabled) { background: var(--ru-accent); color: var(--ru-accent-ink); transform: scale(1.06); }
.ru-c .ru-fcc-nav:disabled { opacity: .3; cursor: default; }
.ru-c .ru-fcc-foot { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 10px; }
.ru-c .ru-fcc-dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
.ru-c .ru-fcc-dot { width: 24px; height: 24px; padding: 0; border: 0; background: none; cursor: pointer; display: grid; place-items: center; }
.ru-c .ru-fcc-dot::before { content: ""; width: 9px; height: 9px; border-radius: 999px; background: var(--ru-line); transition: width .25s, background .25s; }
.ru-c .ru-fcc-dot.is-seen::before { background: color-mix(in srgb, var(--ru-accent) 45%, var(--ru-line)); }
.ru-c .ru-fcc-dot.is-active::before { width: 22px; background: var(--ru-accent); }
.ru-c .ru-fcc-count { color: var(--ru-muted); font-size: .85em; font-weight: 600; }
@media (max-width: 520px) { .ru-c .ru-fcc-nav { position: absolute; z-index: 120; bottom: -54px; } .ru-c .ru-fcc-prev { left: 0; } .ru-c .ru-fcc-next { right: 0; } .ru-c .ru-fcc-card { width: 62%; margin-left: -31%; } }

/* Hotspots */
.ru-c .ru-hs-stage { position: relative; border-radius: var(--ru-radius); }
.ru-c .ru-hs-img { width: 100%; border-radius: var(--ru-radius); }
.ru-c .ru-hs-pin { position: absolute; transform: translate(-50%, -50%); width: 38px; height: 38px; border-radius: 50%; border: 3px solid #fff; background: var(--ru-accent); color: var(--ru-accent-ink); font: 800 15px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
.ru-c .ru-hs-pin::after { content: ""; position: absolute; inset: -9px; border-radius: 50%; border: 3px solid var(--ru-accent); opacity: 0; animation: ru-pulse 2.2s ease-out infinite; }
.ru-c .ru-hs-pin.is-open { background: #fff; color: #14161c; }
.ru-c .ru-hs-pin.is-open::after { animation: none; }
@keyframes ru-pulse { 0% { transform: scale(.6); opacity: .8; } 100% { transform: scale(1.4); opacity: 0; } }
.ru-c .ru-hs-pop { position: absolute; z-index: 3; width: min(300px, 80%); padding: 16px 18px; border-radius: var(--ru-radius); background: #fff; color: #1d2330; box-shadow: 0 14px 40px rgba(0,0,0,.28); }
.ru-c .ru-hs-pop h4 { font-size: 1.05em; font-weight: 800; margin: 0 22px 6px 0; }
.ru-c .ru-hs-close { position: absolute; top: 8px; right: 10px; border: 0; background: none; font-size: 22px; line-height: 1; cursor: pointer; color: var(--ru-muted); }

/* Put in order */
.ru-c .ru-sort { list-style: none; display: flex; flex-direction: column; gap: 8px; counter-reset: ru; }
.ru-c .ru-sort-item { counter-increment: ru; display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 14px; border-radius: var(--ru-radius); background: var(--ru-card); border: 2px solid var(--ru-line); box-shadow: 0 2px 6px rgba(0,0,0,.05); cursor: grab; transition: border-color .15s, transform .15s; }
.ru-c .ru-sort-item::before { content: counter(ru); font-weight: 800; color: var(--ru-accent); min-width: 1.2em; }
.ru-c .ru-sort-item.is-drag { opacity: .5; }
.ru-c .ru-sort-item.is-over { border-color: var(--ru-accent); transform: scale(1.01); }
.ru-c .ru-sort-item.is-right { border-color: #1d7a46; background: color-mix(in srgb, #1d7a46 12%, var(--ru-card)); cursor: default; }
.ru-c .ru-sort-item.is-right::after { content: "\\2713"; color: #1d7a46; font-weight: 800; }
.ru-c .ru-sort-item.is-wrong { border-color: #b3261e; background: color-mix(in srgb, #b3261e 10%, var(--ru-card)); cursor: default; }
.ru-c .ru-sort-item.is-wrong::after { content: "\\2717"; color: #b3261e; font-weight: 800; }
.ru-c .ru-sort-grip { color: var(--ru-muted); }
.ru-c .ru-sort-text { flex: 1; font-weight: 600; }
.ru-c .ru-sort-btns { display: flex; gap: 4px; }
.ru-c .ru-sort-mv { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--ru-line); background: var(--ru-soft); color: var(--ru-ink); cursor: pointer; font: 700 14px/1 system-ui, sans-serif; }
.ru-c .ru-sort-mv:disabled { opacity: .35; cursor: default; }

/* Reveal */
.ru-c .ru-rv { padding: 20px 22px; border-radius: var(--ru-radius); background: var(--ru-soft); border-left: 5px solid var(--ru-accent); }
.ru-c .ru-rv + .ru-rv { margin-top: 12px; }
.ru-c .ru-rv-answer { margin-top: 14px; padding: 14px 16px; border-radius: calc(var(--ru-radius) - 4px); background: var(--ru-card); animation: ru-in .35s ease; }
@keyframes ru-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

/* Before / after */
.ru-c .ru-cmp { --ru-pos: 50%; position: relative; overflow: hidden; border-radius: var(--ru-radius); user-select: none; }
.ru-c .ru-cmp-base { width: 100%; }
.ru-c .ru-cmp-top { position: absolute; inset: 0; clip-path: inset(0 calc(100% - var(--ru-pos)) 0 0); }
.ru-c .ru-cmp-top img, .ru-c .ru-cmp-top .ru-hs-placeholder { width: 100%; height: 100%; object-fit: cover; }
.ru-c .ru-cmp-handle { position: absolute; top: 0; bottom: 0; left: var(--ru-pos); width: 4px; margin-left: -2px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.15); pointer-events: none; }
.ru-c .ru-cmp-handle::after { content: "\\2194"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 42px; height: 42px; border-radius: 50%; background: #fff; color: #14161c; display: grid; place-items: center; font: 800 18px/1 system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.3); }
.ru-c .ru-cmp-range { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
.ru-c .ru-cmp-range:focus-visible ~ * { outline: none; }
.ru-c .ru-cmp:focus-within { outline: 3px solid var(--ru-accent); outline-offset: 3px; }
.ru-c .ru-cmp-label { position: absolute; top: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(0,0,0,.6); color: #fff; font-size: .8em; font-weight: 700; pointer-events: none; }
.ru-c .ru-cmp-l { left: 12px; } .ru-c .ru-cmp-r { right: 12px; }

/* Reflection */
.ru-c .ru-rf { padding: 22px; border-radius: var(--ru-radius); background: var(--ru-soft); }
.ru-c .ru-rf-input { width: 100%; padding: 12px 14px; border-radius: calc(var(--ru-radius) - 4px); border: 2px solid var(--ru-line); background: var(--ru-card); color: var(--ru-ink); font: inherit; resize: vertical; }

/* Scroll animations */
.ru-anim { transition: opacity var(--ru-dur, .7s) ease, transform var(--ru-dur, .7s) cubic-bezier(.2,.7,.2,1); }
.ru-anim-fade { opacity: 0; }
.ru-anim-rise { opacity: 0; transform: translateY(34px); }
.ru-anim-zoom { opacity: 0; transform: scale(.94); }
.ru-anim-slide { opacity: 0; transform: translateX(-40px); }
.ru-anim.ru-in { opacity: 1; transform: none; }
.ru-c .ru-reveal { transition: opacity .6s ease, transform .6s ease; }
.ru-c.ru-staged .ru-reveal { opacity: 0; transform: translateY(16px); }
.ru-c.ru-staged .ru-reveal.ru-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .ru-anim, .ru-c .ru-reveal, .ru-c .ru-flip-inner, .ru-c .ru-fcc-card { transition: none !important; }
  .ru-anim, .ru-c.ru-staged .ru-reveal { opacity: 1 !important; transform: none !important; }
  .ru-c .ru-hs-pin::after { animation: none; }
}
`;

  return {
    TYPES, MARKER_RE, COMPONENT_CSS, ANIMATIONS,
    markerFor, newComponentId, renderComponent, themeCss, inkFor, safeUrl,
    detectCourseTheme, applyCourseTheme,
  };
});
