/*
 * RiseUp course structure: a Course menu block, lesson completion
 * tracking, "section complete, back to menu" banners and a custom start
 * page that replaces Rise's cover page.
 *
 * Lessons are found from Rise's "#/lessons/<id>" links (see nav.js).
 * A lesson counts as finished once the learner reaches its last block.
 * Progress is kept on the learner's device with the rest of RiseUp's
 * progress. Load after components.js, components-more.js and nav.js.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports
    ? Object.assign(require('./components.js'), require('./components-more.js'), require('./nav.js'))
    : root.RiseUp;
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RU) {
  const TYPES = RU.TYPES;
  const el = RU._el;
  const safeUrl = RU.safeUrl;
  const progress = RU.progress;
  const BLOCK = '[data-block-id], .block-wrapper';

  /** A lesson by number (1 = first lesson) or by its exact title. */
  function resolveLesson(lessons, ref) {
    const r = String(ref === undefined || ref === null ? '' : ref).trim();
    if (!r) return null;
    if (/^\d+$/.test(r)) return lessons[Number(r) - 1] || null;
    return lessons.find((l) => l.title.toLowerCase() === r.toLowerCase()) || null;
  }

  function lessonIdFromHash(hash) {
    const m = String(hash || '').match(/^#\/lessons\/([^/?#]+)/);
    return m ? m[1] : '';
  }

  /** The lessons a menu section covers, from its first to its last lesson. */
  function sectionLessons(lessons, section) {
    const first = resolveLesson(lessons, section.first);
    const last = resolveLesson(lessons, section.last) || first;
    if (!first) return [];
    const a = lessons.indexOf(first);
    const b = lessons.indexOf(last);
    return lessons.slice(Math.min(a, b), Math.max(a, b) + 1);
  }

  function sectionState(lessons, section, done) {
    const ls = sectionLessons(lessons, section);
    const n = ls.filter((l) => done[l.id]).length;
    return { lessons: ls, done: n, total: ls.length, complete: ls.length > 0 && n === ls.length, started: n > 0 };
  }

  // ================================================================== Course menu
  TYPES.coursemenu = {
    label: 'Course menu', kind: 'template',
    description: 'A menu page of sections. Learners return to it after each section, which is then ticked off.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'style', label: 'Style', type: 'select', options: [['tiles', 'Numbered tiles'], ['panels', 'Tall panels'], ['list', 'List with progress ring'], ['image', 'Tiles over a header image']] },
      { key: 'image', label: 'Header image (Tiles over a header image)', type: 'image' },
      { key: 'sequential', label: 'Sections open in order (lock the rest)', type: 'checkbox' },
      { key: 'sections', label: 'Sections', type: 'list', itemLabel: 'Section', min: 1, max: 10, fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Description', type: 'textarea' },
        { key: 'icon', label: 'Icon (an emoji)', type: 'text' },
        { key: 'image', label: 'Image (optional, replaces the icon)', type: 'image' },
        { key: 'first', label: 'First lesson (number or exact lesson title)', type: 'text' },
        { key: 'last', label: 'Last lesson (number or exact lesson title)', type: 'text' },
      ] },
      { key: 'doneText', label: 'Message when every section is complete', type: 'text' },
    ],
    defaults: () => ({ title: 'Course menu', intro: 'Choose a section. Each one is ticked off when you finish it, and you come back here afterwards.', style: 'tiles', image: '', sequential: false, sections: [
      { title: 'Spotting hazards', text: 'What to look out for, and why near misses matter.', icon: '🔍', image: '', first: '2', last: '3' },
      { title: 'Making it safe', text: 'What to do in the first few minutes.', icon: '🧯', image: '', first: '4', last: '5' },
      { title: 'Reporting', text: 'How to log it, and what happens next.', icon: '📝', image: '', first: '6', last: '6' },
    ], doneText: 'All sections complete. Well done.' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const key = ctx && ctx.courseKey;
      const style = ['tiles', 'panels', 'list', 'image'].includes(d.style) ? d.style : 'tiles';
      const sections = (d.sections || []).filter((s) => s.title);
      const R = 52; const C = 2 * Math.PI * R;
      const root = el(doc, 'section', { class: 'ru-cm ru-cm-' + style });
      const live = el(doc, 'p', { class: 'ru-sr', 'aria-live': 'polite' });

      function draw() {
        const lessons = RU.collectLessons ? RU.collectLessons(doc) : [];
        const p = progress.read(win, key);
        const done = p.lessonsDone || {};
        // Remember where the menu lives so sections can send learners back here.
        const here = lessonIdFromHash(win.location && win.location.hash);
        if (here && !(ctx && ctx.static) && p.menuHash !== '#/lessons/' + here) progress.update(win, key, (q) => { q.menuHash = '#/lessons/' + here; });
        const states = sections.map((s) => sectionState(lessons, s, done));
        const complete = states.filter((s) => s.complete).length;
        const items = sections.map((s, i) => {
          const st = states[i];
          const locked = d.sequential && i > 0 && !states[i - 1].complete && !st.started;
          const target = st.lessons.find((l) => !done[l.id]) || st.lessons[0];
          const img = safeUrl(s.image, 'image');
          const status = st.complete ? 'Complete' : locked ? 'Locked' : st.started ? 'In progress' : 'Start';
          const art = img ? el(doc, 'img', { src: img, alt: '', class: 'ru-cm-img' }) : el(doc, 'span', { class: 'ru-cm-icon', 'aria-hidden': 'true', text: s.icon || String(i + 1) });
          const inner = [
            el(doc, 'span', { class: 'ru-cm-num', 'aria-hidden': 'true', text: st.complete ? '✓' : String(i + 1) }),
            art,
            el(doc, 'span', { class: 'ru-cm-body' }, [
              el(doc, 'span', { class: 'ru-cm-title', text: s.title }),
              s.text ? el(doc, 'span', { class: 'ru-cm-text', text: s.text }) : null,
              el(doc, 'span', { class: 'ru-cm-status' }, [status, st.total > 1 && st.started && !st.complete ? ' · ' + st.done + ' of ' + st.total : '']),
            ]),
          ];
          const cls = 'ru-cm-item' + (st.complete ? ' is-complete' : '') + (locked ? ' is-locked' : '') + (st.started && !st.complete ? ' is-started' : '');
          const label = s.title + ', section ' + (i + 1) + ': ' + status.toLowerCase();
          const node = target && !locked
            ? el(doc, 'a', { class: cls, href: target.hash, 'aria-label': label }, inner)
            : el(doc, 'div', { class: cls, role: 'group', 'aria-label': label + (target ? '' : '. Lessons not found yet.') }, inner);
          return el(doc, 'li', { style: '--ru-i:' + i }, [node]);
        });
        const ring = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ring.setAttribute('viewBox', '0 0 120 120'); ring.setAttribute('class', 'ru-cm-ring'); ring.setAttribute('aria-hidden', 'true');
        ring.innerHTML = '<circle cx="60" cy="60" r="' + R + '" class="bg"/><circle cx="60" cy="60" r="' + R + '" class="fg" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - (sections.length ? complete / sections.length : 0))) + '"/>';
        const summary = el(doc, 'div', { class: 'ru-cm-summary' }, [
          el(doc, 'div', { class: 'ru-cm-ringwrap' }, [ring, el(doc, 'span', { class: 'ru-cm-pct', text: Math.round(sections.length ? (complete / sections.length) * 100 : 0) + '%' })]),
          el(doc, 'p', { class: 'ru-cm-count', text: complete + ' of ' + sections.length + ' sections complete' }),
          complete === sections.length && sections.length && d.doneText ? el(doc, 'p', { class: 'ru-cm-done', text: d.doneText }) : null,
        ]);
        const head = el(doc, 'div', { class: 'ru-cm-head' }, [
          d.title ? el(doc, 'h2', { class: 'ru-cm-heading', text: d.title }) : null,
          d.intro ? el(doc, 'p', { class: 'ru-cm-intro', text: d.intro }) : null,
        ]);
        const headerImg = style === 'image' ? safeUrl(d.image, 'image') : '';
        root.replaceChildren(...[
          style === 'image' ? el(doc, 'div', { class: 'ru-cm-banner', style: headerImg ? "background-image:url('" + headerImg.replace(/'/g, '%27') + "')" : '' }, [head]) : head,
          style === 'list' ? el(doc, 'div', { class: 'ru-cm-split' }, [el(doc, 'ol', { class: 'ru-cm-items' }, items), summary]) : el(doc, 'ol', { class: 'ru-cm-items' }, items),
          style === 'list' ? null : summary,
          live].filter(Boolean));
      }
      draw();
      if (win && win.addEventListener && !(ctx && ctx.static)) {
        const onChange = () => { if (root.isConnected) draw(); else { win.removeEventListener('hashchange', onChange); doc.removeEventListener('riseup:lessondone', onChange); } };
        win.addEventListener('hashchange', onChange);
        doc.addEventListener('riseup:lessondone', onChange);
        // Rise may render its lesson links after this block: draw again shortly.
        setTimeout(() => { if (root.isConnected) draw(); }, 800);
      }
      return root;
    },
  };

  // ================================================================== Start page
  const START_STYLES = { photo: 'Photo with the title over it', split: 'Split: text and image side by side', bold: 'Bold colour with shapes' };

  function startPageEl(doc, sp, opts) {
    const o = opts || {};
    const img = safeUrl(sp.image, 'image');
    const logo = safeUrl(sp.logo, 'image');
    const style = START_STYLES[sp.style] ? sp.style : 'photo';
    const title = sp.title || o.courseTitle || 'Course';
    const bullets = String(sp.bullets || '').split('\n').map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    const start = el(doc, 'button', { type: 'button', class: 'ru-btn ru-sp-start', text: (o.resume ? (sp.resumeText || 'Continue') : (sp.buttonText || 'Start course')) + ' →' });
    const again = o.resume ? el(doc, 'button', { type: 'button', class: 'ru-btn ru-btn-ghost ru-sp-again', text: 'Start from the beginning' }) : null;
    const copy = el(doc, 'div', { class: 'ru-sp-copy' }, [
      logo ? el(doc, 'img', { src: logo, alt: '', class: 'ru-sp-logo' }) : null,
      sp.eyebrow ? el(doc, 'p', { class: 'ru-sp-eyebrow', text: sp.eyebrow }) : null,
      el(doc, 'h1', { class: 'ru-sp-title', text: title }),
      sp.subtitle ? el(doc, 'p', { class: 'ru-sp-sub', text: sp.subtitle }) : null,
      bullets.length ? el(doc, 'ul', { class: 'ru-sp-list' }, bullets.map((b) => el(doc, 'li', { text: b }))) : null,
      el(doc, 'div', { class: 'ru-sp-actions' }, [start, again, sp.duration ? el(doc, 'span', { class: 'ru-sp-meta', text: '⏱ ' + sp.duration }) : null]),
    ]);
    const page = el(doc, 'section', { class: 'ru-c ru-sp ru-sp-' + style, role: 'region', 'aria-label': 'Start: ' + title, 'data-riseup-ignore': '' }, [
      style === 'photo' ? el(doc, 'div', { class: 'ru-sp-bg', style: img ? "background-image:url('" + img.replace(/'/g, '%27') + "')" : '' }) : null,
      style === 'bold' ? el(doc, 'span', { class: 'ru-sp-shape ru-sp-shape-1', 'aria-hidden': 'true' }) : null,
      style === 'bold' ? el(doc, 'span', { class: 'ru-sp-shape ru-sp-shape-2', 'aria-hidden': 'true' }) : null,
      copy,
      style === 'split' ? el(doc, 'div', { class: 'ru-sp-media', style: img ? "background-image:url('" + img.replace(/'/g, '%27') + "')" : '' }) : null,
    ]);
    return { page, start, again };
  }

  // ================================================================== Runtime: completion, banners, start page
  /**
   * @param cfg   { startPage, components }
   * @param opts  { courseKey, applyLook(node) }
   */
  function startCourse(doc, cfg, opts) {
    const win = doc.defaultView;
    const o = opts || {};
    const key = o.courseKey || '';
    const menus = (cfg.components || []).filter((c) => c.type === 'coursemenu');
    const sp = Object.assign({ enabled: false }, cfg.startPage || {});
    let io = null;
    let watched = null;
    let banner = null;
    let startEl = null;

    const lessonsNow = () => (RU.collectLessons ? RU.collectLessons(doc) : []);
    const currentId = () => lessonIdFromHash(win.location.hash);

    function markDone(id) {
      const p = progress.read(win, key);
      if (p.lessonsDone && p.lessonsDone[id]) return;
      progress.update(win, key, (q) => { q.lessonsDone = q.lessonsDone || {}; q.lessonsDone[id] = Date.now(); });
      try { doc.dispatchEvent(new win.CustomEvent('riseup:lessondone', { detail: { id } })); } catch (e) { /* ignore */ }
      showBanner();
    }

    /** Watch the lesson's last block: reaching it finishes the lesson. */
    function watchEnd() {
      const id = currentId();
      if (!id || !win.IntersectionObserver) return;
      const blocks = Array.from(doc.querySelectorAll(BLOCK)).filter((b) => !b.closest('.ru-c') && !(b.parentElement && b.parentElement.closest(BLOCK)));
      const last = blocks[blocks.length - 1];
      if (!last || last === watched) return;
      if (io) io.disconnect();
      watched = last;
      io = new win.IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting) && currentId() === id) markDone(id);
      }, { threshold: 0.4 });
      io.observe(last);
    }

    /** At the end of a section's last lesson, offer the way back to the menu. */
    function showBanner() {
      if (banner && banner.isConnected) return;
      const id = currentId();
      if (!id || !menus.length || !watched || !watched.isConnected) return;
      const p = progress.read(win, key);
      if (!(p.lessonsDone || {})[id]) return;
      const lessons = lessonsNow();
      for (const m of menus) {
        const sections = ((m.data && m.data.sections) || []).filter((s) => s.title);
        for (const s of sections) {
          const ls = sectionLessons(lessons, s);
          if (!ls.length || ls[ls.length - 1].id !== id) continue;
          const st = sectionState(lessons, s, p.lessonsDone || {});
          const menuHash = p.menuHash || '';
          const done = sections.filter((x) => sectionState(lessons, x, p.lessonsDone || {}).complete).length;
          banner = el(doc, 'aside', { class: 'ru-c ru-se', 'data-riseup-ignore': '', role: 'status' }, [
            el(doc, 'span', { class: 'ru-se-tick', 'aria-hidden': 'true', text: '✓' }),
            el(doc, 'div', { class: 'ru-se-copy' }, [
              el(doc, 'p', { class: 'ru-se-title', text: (st.complete ? 'Section complete: ' : 'End of section: ') + s.title }),
              el(doc, 'p', { class: 'ru-se-sub', text: done + ' of ' + sections.length + ' sections complete' }),
            ]),
            menuHash ? el(doc, 'a', { class: 'ru-btn ru-se-btn', href: menuHash, text: 'Back to menu' }) : null,
          ]);
          if (o.applyLook) o.applyLook(banner);
          watched.parentNode.insertBefore(banner, watched.nextSibling);
          return;
        }
      }
    }

    /** Rise's cover page is the course's root route. */
    const onCover = () => /^#?\/?$/.test(win.location.hash || '');
    function drawStart() {
      if (!sp.enabled) return;
      if (!onCover()) { if (startEl) { startEl.remove(); startEl = null; doc.documentElement.classList.remove('ru-sp-open'); } return; }
      if (startEl && startEl.isConnected) return;
      const lessons = lessonsNow();
      const p = progress.read(win, key);
      const lastVisited = p.lastLesson && lessons.find((l) => l.hash === p.lastLesson);
      const first = resolveLesson(lessons, sp.startAt || '1') || lessons[0];
      const resume = Boolean(lastVisited && p.lessonsDone && Object.keys(p.lessonsDone).length);
      const title = (doc.title || '').replace(/\s*[|\-–]\s*Rise.*$/i, '').trim();
      const built = startPageEl(doc, sp, { courseTitle: title, resume });
      startEl = built.page;
      built.start.addEventListener('click', () => { const t = resume ? lastVisited : first; if (t) win.location.hash = t.hash; });
      if (built.again) built.again.addEventListener('click', () => { if (first) win.location.hash = first.hash; });
      if (!first) built.start.disabled = !resume;
      if (o.applyLook) o.applyLook(startEl);
      doc.body.appendChild(startEl);
      doc.documentElement.classList.add('ru-sp-open');
      built.start.focus({ preventScroll: true });
    }

    function onHash() {
      banner = null; watched = null;
      const id = currentId();
      if (id) progress.update(win, key, (q) => { q.lastLesson = '#/lessons/' + id; });
      drawStart();
    }
    win.addEventListener('hashchange', onHash);
    onHash();

    return {
      refresh() { watchEnd(); showBanner(); drawStart(); },
      stop() {
        win.removeEventListener('hashchange', onHash);
        if (io) io.disconnect();
        if (banner) banner.remove();
        if (startEl) startEl.remove();
        doc.documentElement.classList.remove('ru-sp-open');
      },
    };
  }

  const COURSE_CSS = `
/* Course menu */
.ru-c .ru-cm-head { margin-bottom: 18px; }
.ru-c .ru-cm-heading { font: 800 clamp(1.6em, 3.4vw, 2.2em)/1.1 var(--ru-heading-font, inherit); color: var(--ru-ink); letter-spacing: -.01em; }
.ru-c .ru-cm-intro { margin-top: 8px; color: var(--ru-muted); max-width: 40em; }
.ru-c .ru-cm-items { list-style: none; display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.ru-c .ru-cm-items > li { animation: ru-in .4s ease both; animation-delay: calc(var(--ru-i) * 70ms); }
.ru-c .ru-cm-item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; height: 100%; padding: 22px 18px 18px; border-radius: var(--ru-radius); background: var(--ru-card); color: var(--ru-ink); text-decoration: none; text-align: center; box-shadow: 0 6px 20px rgba(0,0,0,.08); border: 2px solid transparent; transition: transform .2s, box-shadow .2s, border-color .2s; }
.ru-c a.ru-cm-item:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(0,0,0,.14); border-color: var(--ru-accent); }
.ru-c a.ru-cm-item:focus-visible { outline: 3px solid var(--ru-accent); outline-offset: 3px; }
.ru-c .ru-cm-num { display: grid; place-items: center; width: 54px; height: 54px; border-radius: 50%; background: var(--ru-accent); color: var(--ru-accent-ink); font: 800 1.5em/1 var(--ru-heading-font, inherit); }
.ru-c .ru-cm-item.is-complete .ru-cm-num { background: #1d7a46; color: #fff; }
.ru-c .ru-cm-icon { font-size: 34px; line-height: 1; }
.ru-c .ru-cm-img { width: 100%; height: 110px; object-fit: cover; border-radius: 10px; }
.ru-c .ru-cm-body { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.ru-c .ru-cm-title { font: 800 1.15em/1.2 var(--ru-heading-font, inherit); text-transform: uppercase; letter-spacing: .03em; }
.ru-c .ru-cm-text { color: var(--ru-muted); font-size: .92em; }
.ru-c .ru-cm-status { margin-top: auto; padding-top: 8px; font-size: .78em; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--ru-accent-text, var(--ru-accent)); }
.ru-c .is-complete .ru-cm-status { color: #1d7a46; }
.ru-c.ru-on-dark .is-complete .ru-cm-status { color: #5fd08f; }
.ru-c .ru-cm-item.is-locked { opacity: .55; filter: grayscale(.6); cursor: not-allowed; }
.ru-c .ru-cm-item.is-locked .ru-cm-num::after { content: "\\1f512"; position: absolute; top: 10px; right: 12px; font-size: 16px; }
.ru-c .ru-cm-summary { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 18px; flex-wrap: wrap; }
.ru-c .ru-cm-ringwrap { position: relative; width: 64px; height: 64px; }
.ru-c .ru-cm-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
.ru-c .ru-cm-ring circle { fill: none; stroke-width: 12; }
.ru-c .ru-cm-ring .bg { stroke: var(--ru-line); } .ru-c .ru-cm-ring .fg { stroke: var(--ru-accent); stroke-linecap: round; transition: stroke-dashoffset .8s ease; }
.ru-c .ru-cm-pct { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 800; font-size: .85em; }
.ru-c .ru-cm-count { font-weight: 700; color: var(--ru-muted); }
.ru-c .ru-cm-done { width: 100%; text-align: center; font-weight: 800; color: var(--ru-accent-text, var(--ru-accent)); }
.ru-c .ru-cm-panels .ru-cm-items { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; border-radius: var(--ru-radius); overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.12); }
.ru-c .ru-cm-panels .ru-cm-item { border-radius: 0; box-shadow: none; min-height: 340px; justify-content: flex-start; background: var(--ru-accent); color: var(--ru-accent-ink); border: 0; border-right: 1px solid rgba(255,255,255,.25); }
.ru-c .ru-cm-panels li:nth-child(even) .ru-cm-item { background: color-mix(in srgb, var(--ru-accent) 82%, #ffffff); }
.ru-c .ru-cm-panels .ru-cm-num { background: rgba(255,255,255,.95); color: #1d2330; }
.ru-c .ru-cm-panels .ru-cm-text, .ru-c .ru-cm-panels .ru-cm-status { color: inherit; opacity: .9; }
.ru-c .ru-cm-panels a.ru-cm-item:hover { transform: none; filter: brightness(1.06); }
.ru-c .ru-cm-split { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 24px; align-items: center; }
@media (max-width: 640px) { .ru-c .ru-cm-split { grid-template-columns: 1fr; } }
.ru-c .ru-cm-list .ru-cm-items { grid-template-columns: 1fr; gap: 0; }
.ru-c .ru-cm-list .ru-cm-item { flex-direction: row; text-align: left; padding: 14px 6px; border-radius: 0; box-shadow: none; background: none; border: 0; border-bottom: 1px solid var(--ru-line); }
.ru-c .ru-cm-list a.ru-cm-item:hover { transform: translateX(4px); box-shadow: none; }
.ru-c .ru-cm-list .ru-cm-num { width: 34px; height: 34px; font-size: 1em; flex: none; }
.ru-c .ru-cm-list .ru-cm-icon { font-size: 22px; }
.ru-c .ru-cm-list .ru-cm-title { text-transform: none; letter-spacing: 0; font-size: 1.05em; }
.ru-c .ru-cm-list .ru-cm-status { padding-top: 0; }
.ru-c .ru-cm-list .ru-cm-summary { flex-direction: column; margin-top: 0; }
.ru-c .ru-cm-list .ru-cm-ringwrap { width: min(220px, 60vw); height: auto; aspect-ratio: 1; }
.ru-c .ru-cm-list .ru-cm-pct { font: 800 2.2em/1 var(--ru-heading-font, inherit); }
.ru-c .ru-cm-banner { margin: 0 0 -60px; padding: 40px 28px 90px; border-radius: var(--ru-radius); background: linear-gradient(120deg, var(--ru-accent), #1d2330) center / cover; color: #fff; position: relative; overflow: hidden; }
.ru-c .ru-cm-banner[style*="url"]::before { content: ""; position: absolute; inset: 0; background: linear-gradient(rgba(8,10,16,.35), rgba(8,10,16,.65)); }
.ru-c .ru-cm-banner > * { position: relative; }
.ru-c .ru-cm-banner .ru-cm-heading, .ru-c .ru-cm-banner .ru-cm-intro { color: #fff; }
.ru-c .ru-cm-image .ru-cm-items { padding: 0 16px; position: relative; }
/* Section complete banner */
.ru-c.ru-se { display: flex; align-items: center; gap: 16px; margin: 24px auto; max-width: 760px; padding: 18px 22px; border-radius: var(--ru-radius); background: var(--ru-card); color: var(--ru-ink); box-shadow: 0 10px 30px rgba(0,0,0,.12); border-left: 6px solid #1d7a46; animation: ru-in .4s ease; }
.ru-c .ru-se-tick { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 50%; background: #1d7a46; color: #fff; font: 800 20px/1 system-ui, sans-serif; animation: ru-collect .7s cubic-bezier(.2,.8,.2,1.4); }
.ru-c .ru-se-copy { flex: 1; }
.ru-c .ru-se-title { font: 800 1.1em/1.25 var(--ru-heading-font, inherit); }
.ru-c .ru-se-sub { color: var(--ru-muted); font-size: .92em; }
/* Start page */
html.ru-sp-open { overflow: hidden; }
.ru-c.ru-sp { position: fixed; inset: 0; z-index: 2147483040; display: flex; align-items: center; overflow: auto; margin: 0; background: #14161c; color: #fff; animation: ru-fade .4s ease; }
.ru-c .ru-sp-copy { position: relative; z-index: 1; width: min(720px, 100%); padding: clamp(28px, 7vw, 90px); }
.ru-c .ru-sp-logo { max-height: 54px; max-width: 200px; margin-bottom: 28px; object-fit: contain; }
.ru-c .ru-sp-eyebrow { text-transform: uppercase; letter-spacing: .16em; font-weight: 800; font-size: .85em; opacity: .9; margin-bottom: 12px; }
.ru-c .ru-sp-title { margin: 0; font: 800 clamp(2.4em, 6.5vw, 4.6em)/1.02 var(--ru-heading-font, inherit); letter-spacing: -.03em; color: inherit; }
.ru-c .ru-sp-sub { margin-top: 18px; font-size: clamp(1.05em, 2vw, 1.3em); opacity: .92; max-width: 32em; }
.ru-c .ru-sp-list { margin: 22px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.ru-c .ru-sp-list li { display: flex; gap: 10px; align-items: flex-start; }
.ru-c .ru-sp-list li::before { content: "\\2713"; flex: none; display: grid; place-items: center; width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; background: var(--ru-accent); color: var(--ru-accent-ink); font: 800 12px/1 system-ui, sans-serif; }
.ru-c .ru-sp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 32px; }
.ru-c .ru-sp-start { padding: 16px 30px; font-size: 1.1em; box-shadow: 0 12px 30px rgba(0,0,0,.3); }
.ru-c .ru-sp-again { color: inherit; border-color: currentColor; }
.ru-c .ru-sp-meta { font-weight: 700; opacity: .85; }
.ru-c.ru-sp-photo .ru-sp-bg { position: absolute; inset: 0; background: linear-gradient(120deg, var(--ru-accent), #1d2330) center / cover; transform: scale(1.04); animation: ru-sp-zoom 18s ease-out forwards; }
.ru-c.ru-sp-photo .ru-sp-bg::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(8,10,16,.88) 0%, rgba(8,10,16,.55) 55%, rgba(8,10,16,.15) 100%); }
@keyframes ru-sp-zoom { to { transform: scale(1); } }
.ru-c.ru-sp-split { background: var(--ru-soft, #f5f6f9); color: var(--ru-ink, #1d2330); }
.ru-c.ru-sp-split .ru-sp-copy { width: 52%; }
.ru-c.ru-sp-split .ru-sp-media { position: absolute; top: 0; right: 0; bottom: 0; width: 48%; background: linear-gradient(135deg, var(--ru-accent), color-mix(in srgb, var(--ru-accent) 40%, #ffffff)) center / cover; clip-path: polygon(12% 0, 100% 0, 100% 100%, 0 100%); }
.ru-c.ru-sp-split .ru-sp-eyebrow { color: var(--ru-accent-text, var(--ru-accent)); opacity: 1; }
@media (max-width: 720px) { .ru-c.ru-sp-split .ru-sp-copy { width: 100%; padding-top: 46vh; } .ru-c.ru-sp-split .ru-sp-media { width: 100%; height: 40vh; bottom: auto; clip-path: polygon(0 0, 100% 0, 100% 86%, 0 100%); } }
.ru-c.ru-sp-bold { background: var(--ru-accent); color: var(--ru-accent-ink); overflow: hidden; }
.ru-c.ru-sp-bold .ru-sp-start { background: var(--ru-accent-ink); color: var(--ru-accent); border-color: var(--ru-accent-ink); }
.ru-c.ru-sp-bold .ru-sp-list li::before { background: var(--ru-accent-ink); color: var(--ru-accent); }
.ru-c .ru-sp-shape { position: absolute; border-radius: 50%; pointer-events: none; }
.ru-c .ru-sp-shape-1 { width: 70vmax; height: 70vmax; right: -25vmax; top: -30vmax; background: rgba(255,255,255,.12); }
.ru-c .ru-sp-shape-2 { width: 40vmax; height: 40vmax; right: 8vmax; bottom: -22vmax; background: rgba(0,0,0,.12); }
@media (prefers-reduced-motion: reduce) { .ru-c.ru-sp, .ru-c.ru-sp-photo .ru-sp-bg, .ru-c .ru-cm-items > li, .ru-c.ru-se, .ru-c .ru-se-tick { animation: none !important; } }
`;
  RU.COMPONENT_CSS += COURSE_CSS;

  return { startCourse, startPageEl, resolveLesson, sectionLessons, START_STYLES };
});
