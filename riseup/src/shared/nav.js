/*
 * RiseUp course navigation: replaces Rise's left sidebar with a top bar
 * (or a top bar with a full-screen menu), so a course feels more like a
 * website.
 *
 * Rise's markup isn't a public API, so this works from what's reliable: Rise
 * lessons are links to "#/lessons/<id>". The menu is rebuilt from those links,
 * and Rise's own sidebar is only hidden when it can be identified with
 * confidence. If fewer than two lessons are found, nothing is changed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LAYOUTS = { rise: 'Rise sidebar (unchanged)', topbar: 'Top bar', overlay: 'Top bar with full-screen menu' };
  const LESSON_LINK = 'a[href*="#/lessons/"]';
  const OURS = '.ru-c, .ru-nav, .ru-nav-overlay, riseup-panel, [data-riseup-ignore]';
  const SIDEBAR_HINT = /sidebar|side-bar|nav|outline|menu|drawer/i;

  function cleanTitle(a) {
    const t = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim();
    // Rise adds progress words to sidebar items; drop them from the title.
    return t.replace(/\s*(\d{1,3}%|completed?|in progress|not started)\s*$/i, '').trim();
  }

  function hashOf(href) {
    const i = href.indexOf('#');
    return i === -1 ? '' : href.slice(i);
  }

  /** Lessons in the order they appear, without duplicates. */
  function collectLessons(doc) {
    const seen = new Set();
    const out = [];
    for (const a of doc.querySelectorAll(LESSON_LINK)) {
      if (a.closest(OURS)) continue;
      const hash = hashOf(a.getAttribute('href') || '');
      const m = hash.match(/^#\/lessons\/([^/?#]+)/);
      if (!m || seen.has(m[1])) continue;
      const title = cleanTitle(a);
      if (!title) continue;
      seen.add(m[1]);
      out.push({ id: m[1], hash: '#/lessons/' + m[1], title, link: a });
    }
    return out;
  }

  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let anc = nodes[0].parentElement;
    while (anc && !nodes.every((n) => anc.contains(n))) anc = anc.parentElement;
    return anc;
  }

  /**
   * Rise's sidebar: the widest ancestor of the lesson links that holds no
   * lesson content, and that looks like a sidebar (fixed/sticky/absolute, a
   * nav or aside element, or a sidebar-like class).
   */
  function findSidebar(doc, lessons) {
    const win = doc.defaultView;
    let el = commonAncestor(lessons.map((l) => l.link));
    if (!el || el === doc.body || el === doc.documentElement) return null;
    const hasContent = (e) => Boolean(e.querySelector('[data-block-id], .block-wrapper, .lesson-main, .blocks-lesson'));
    if (hasContent(el)) return null;
    while (el.parentElement && el.parentElement !== doc.body && !hasContent(el.parentElement)) el = el.parentElement;
    for (let e = el; e && e !== doc.body; e = e.parentElement) {
      if (hasContent(e)) break;
      const pos = win.getComputedStyle(e).position;
      if (/^(NAV|ASIDE)$/.test(e.tagName) || ['fixed', 'sticky', 'absolute'].includes(pos) || SIDEBAR_HINT.test(String(e.className) + ' ' + (e.id || ''))) return el;
    }
    return null;
  }

  function safeImage(u) {
    if (typeof u !== 'string') return '';
    const s = u.trim();
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s) || /^https?:\/\//i.test(s) || /^riseup\/media\/[\w.-]+$/.test(s)) return s;
    return '';
  }

  function el(doc, tag, attrs, children) {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children || [])) if (c) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    return e;
  }

  const NAV_CSS = `
.ru-nav { --nav-bg: #ffffff; --nav-fg: #1d2330; --nav-muted: #5b6475; --nav-line: rgba(0,0,0,.08); --nav-hover: rgba(0,0,0,.05);
  position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000; height: 64px; display: flex; align-items: center; gap: 18px; padding: 0 clamp(16px, 4vw, 40px);
  background: var(--nav-bg); color: var(--nav-fg); box-shadow: 0 1px 0 var(--nav-line), 0 6px 20px rgba(0,0,0,.06); font: 15px/1.3 var(--ru-body-font, inherit); }
.ru-nav *, .ru-nav-overlay * { box-sizing: border-box; }
.ru-nav.ru-nav-dark { --nav-bg: #1d1f24; --nav-fg: #ffffff; --nav-muted: rgba(255,255,255,.7); --nav-line: rgba(255,255,255,.1); --nav-hover: rgba(255,255,255,.08); }
.ru-nav.ru-nav-brand { --nav-bg: var(--ru-accent); --nav-fg: var(--ru-accent-ink); --nav-muted: var(--ru-accent-ink); --nav-line: rgba(0,0,0,.12); --nav-hover: rgba(255,255,255,.14); }
.ru-nav-home { display: flex; align-items: center; gap: 12px; min-width: 0; color: inherit; text-decoration: none; font: 700 17px/1.2 var(--ru-heading-font, inherit); }
.ru-nav-home img { height: 36px; width: auto; max-width: 160px; object-fit: contain; }
.ru-nav-home span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ru-nav-links { display: flex; align-items: center; gap: 2px; margin-left: auto; min-width: 0; }
.ru-nav-link { position: relative; display: block; padding: 10px 12px; border-radius: 8px; color: inherit; text-decoration: none; font-weight: 600; white-space: nowrap; }
.ru-nav-link:hover { background: var(--nav-hover); }
.ru-nav-link[aria-current="page"]::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: 2px; height: 3px; border-radius: 3px; background: currentColor; }
.ru-nav:not(.ru-nav-brand) .ru-nav-link[aria-current="page"] { color: var(--ru-accent); }
.ru-nav-btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; margin-left: auto; border: 2px solid currentColor; border-radius: 999px; background: none; color: inherit; font: 700 14px/1 inherit; cursor: pointer; }
.ru-nav-links + .ru-nav-btn { margin-left: 8px; }
.ru-nav-btn:hover { background: var(--nav-hover); }
.ru-nav-btn svg { width: 16px; height: 16px; }
.ru-nav a:focus-visible, .ru-nav button:focus-visible, .ru-nav-overlay a:focus-visible, .ru-nav-overlay button:focus-visible { outline: 3px solid var(--ru-accent); outline-offset: 2px; }
.ru-nav-brand a:focus-visible, .ru-nav-brand button:focus-visible { outline-color: var(--ru-accent-ink); }
.ru-nav-progress { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--ru-accent); transition: width .4s ease; }
.ru-nav-brand .ru-nav-progress { background: var(--ru-accent-ink); opacity: .7; }
.ru-nav-drop { position: absolute; top: 58px; right: clamp(16px, 4vw, 40px); width: min(360px, calc(100vw - 32px)); max-height: calc(100vh - 80px); overflow-y: auto; padding: 8px; border-radius: 14px; background: #fff; color: #1d2330; box-shadow: 0 18px 50px rgba(0,0,0,.22); }
.ru-nav-drop a { display: flex; gap: 12px; padding: 10px 12px; border-radius: 8px; color: inherit; text-decoration: none; font-weight: 600; }
.ru-nav-drop a:hover { background: #f3f4f7; }
.ru-nav-drop a[aria-current="page"] { background: color-mix(in srgb, var(--ru-accent) 12%, #fff); color: #1d2330; }
.ru-nav-drop .ru-nav-num { color: var(--ru-accent); min-width: 1.6em; font-variant-numeric: tabular-nums; }
.ru-nav-overlay { position: fixed; inset: 0; z-index: 2147483001; display: flex; flex-direction: column; padding: 24px clamp(20px, 6vw, 80px) 40px; overflow-y: auto; background: #16181d; color: #fff; font: 16px/1.4 var(--ru-body-font, inherit); animation: ru-nav-in .3s ease; }
.ru-nav-overlay[hidden], .ru-nav-drop[hidden] { display: none; }
@keyframes ru-nav-in { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
.ru-nav-overlay-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: clamp(20px, 5vh, 56px); }
.ru-nav-overlay-head p { margin: 0; font: 700 15px/1.2 var(--ru-heading-font, inherit); opacity: .8; }
.ru-nav-overlay ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 6px 40px; }
.ru-nav-overlay a { display: flex; align-items: baseline; gap: 18px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,.12); color: inherit; text-decoration: none; font: 700 clamp(20px, 2.4vw, 28px)/1.2 var(--ru-heading-font, inherit); transition: color .15s, padding-left .2s; }
.ru-nav-overlay a:hover { color: var(--ru-accent); padding-left: 6px; }
.ru-nav-overlay a[aria-current="page"] { color: var(--ru-accent); }
.ru-nav-overlay .ru-nav-num { font-size: .55em; opacity: .6; font-variant-numeric: tabular-nums; }
.ru-nav-overlay .ru-nav-btn { margin-left: 0; color: #fff; }
.ru-nav-hidden { display: none !important; }
html.ru-has-topnav body { padding-top: 64px !important; }
.ru-nav .ru-nav-btn.ru-nav-mobile { display: none; }
@media (max-width: 760px) { .ru-nav-links { display: none; } .ru-nav .ru-nav-btn.ru-nav-mobile { display: inline-flex; margin-left: auto; } }
@media (prefers-reduced-motion: reduce) { .ru-nav-overlay { animation: none; } .ru-nav-progress { transition: none; } }
`;

  const MENU_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/></svg>';

  /**
   * Start custom navigation. Returns { refresh, stop }. Call refresh when the
   * page changes; it sets itself up once Rise has rendered its lesson links.
   */
  function startNav(doc, cfg, opts) {
    const nav = Object.assign({ layout: 'rise', style: 'light', progress: true, logo: '', title: '' }, cfg || {});
    const win = doc.defaultView;
    if (!LAYOUTS[nav.layout] || nav.layout === 'rise') return { refresh() {}, stop() {} };
    let bar = null;
    let overlay = null;
    let drop = null;
    let sidebar = null;
    let lessons = [];
    const reset = []; // [element, property, previous inline value]
    let style = null;

    function current() {
      const h = win.location.hash || '';
      return lessons.findIndex((l) => h === l.hash || h.startsWith(l.hash + '/'));
    }

    function markCurrent() {
      const i = current();
      for (const a of doc.querySelectorAll('.ru-nav a[data-lesson], .ru-nav-overlay a[data-lesson]')) {
        if (Number(a.getAttribute('data-lesson')) === i) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
      const p = bar && bar.querySelector('.ru-nav-progress');
      if (p) p.style.width = (i < 0 ? 0 : ((i + 1) / lessons.length) * 100) + '%';
    }

    function lessonLink(l, i, cls) {
      return el(doc, 'a', { href: l.hash, class: cls || '', 'data-lesson': i, onclick: () => closeMenus() }, [
        cls !== 'ru-nav-link' ? el(doc, 'span', { class: 'ru-nav-num', text: String(i + 1).padStart(2, '0') }) : null,
        el(doc, 'span', { text: l.title }),
      ]);
    }

    function closeMenus(returnFocus) {
      if (drop && !drop.hidden) { drop.hidden = true; bar.querySelectorAll('[aria-controls="ru-nav-drop"]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
      if (overlay && !overlay.hidden) {
        overlay.hidden = true;
        doc.documentElement.style.overflow = '';
        const opener = bar.querySelector('[aria-controls="ru-nav-overlay"]');
        if (opener) { opener.setAttribute('aria-expanded', 'false'); if (returnFocus) opener.focus(); }
      }
    }

    function menuButton(label, controls, onClick, extra) {
      const b = el(doc, 'button', { type: 'button', class: 'ru-nav-btn' + (extra ? ' ' + extra : ''), 'aria-expanded': 'false', 'aria-controls': controls, onclick: onClick });
      const icon = el(doc, 'span', { 'aria-hidden': 'true', style: 'display:contents' });
      icon.innerHTML = MENU_ICON; // static markup, not user input
      b.append(icon, el(doc, 'span', { text: label }));
      return b;
    }

    function build() {
      lessons = collectLessons(doc);
      if (lessons.length < 2) return false;
      style = el(doc, 'style', { id: 'riseup-nav-style' });
      style.textContent = NAV_CSS;
      (doc.head || doc.documentElement).appendChild(style);

      sidebar = findSidebar(doc, lessons);
      if (sidebar) {
        sidebar.classList.add('ru-nav-hidden');
        // Rise pushes the lesson content right to make room for its sidebar; undo that.
        const first = doc.querySelector('[data-block-id], .block-wrapper, .lesson-main, .blocks-lesson, main');
        for (let e = first; e && e !== doc.documentElement; e = e.parentElement) {
          const cs = win.getComputedStyle(e);
          for (const prop of ['margin-left', 'padding-left', 'left']) {
            if (parseFloat(cs.getPropertyValue(prop)) >= 180) {
              reset.push([e, prop, e.style.getPropertyValue(prop), e.style.getPropertyPriority(prop)]);
              e.style.setProperty(prop, prop === 'left' ? 'auto' : '0', 'important');
            }
          }
        }
      }

      const title = nav.title || (doc.title || '').replace(/\s*[|\-–]\s*Rise.*$/i, '').trim() || 'Course';
      const logo = safeImage(nav.logo);
      bar = el(doc, 'nav', { class: 'ru-nav ru-nav-' + (['light', 'dark', 'brand'].includes(nav.style) ? nav.style : 'light'), 'aria-label': 'Course', 'data-riseup-ignore': '' }, [
        el(doc, 'a', { class: 'ru-nav-home', href: '#/', 'aria-label': title + ', course home' }, [logo ? el(doc, 'img', { src: logo, alt: '' }) : null, el(doc, 'span', { text: title })]),
      ]);

      if (nav.layout === 'topbar') {
        const inline = lessons.length <= 5;
        if (inline) bar.appendChild(el(doc, 'div', { class: 'ru-nav-links' }, lessons.map((l, i) => lessonLink(l, i, 'ru-nav-link'))));
        drop = el(doc, 'div', { class: 'ru-nav-drop', id: 'ru-nav-drop', hidden: true }, lessons.map((l, i) => lessonLink(l, i)));
        const btn = menuButton('Lessons', 'ru-nav-drop', () => {
          const open = drop.hidden;
          closeMenus();
          drop.hidden = !open;
          btn.setAttribute('aria-expanded', String(open));
          if (open) { const a = drop.querySelector('[aria-current]') || drop.querySelector('a'); if (a) a.focus(); }
        }, inline ? 'ru-nav-mobile' : '');
        bar.append(btn, drop);
      } else {
        overlay = el(doc, 'div', { class: 'ru-nav-overlay', id: 'ru-nav-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Lessons', hidden: true, 'data-riseup-ignore': '' }, [
          el(doc, 'div', { class: 'ru-nav-overlay-head' }, [
            el(doc, 'p', { text: title }),
            el(doc, 'button', { type: 'button', class: 'ru-nav-btn', text: 'Close', onclick: () => closeMenus(true) }),
          ]),
          el(doc, 'ol', null, lessons.map((l, i) => el(doc, 'li', null, [lessonLink(l, i)]))),
        ]);
        const btn = menuButton('Menu', 'ru-nav-overlay', () => {
          overlay.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
          doc.documentElement.style.overflow = 'hidden';
          const a = overlay.querySelector('[aria-current]') || overlay.querySelector('a');
          if (a) a.focus();
        });
        bar.appendChild(btn);
        doc.body.appendChild(overlay);
      }
      if (nav.progress !== false) bar.appendChild(el(doc, 'span', { class: 'ru-nav-progress', 'aria-hidden': 'true' }));
      doc.body.insertBefore(bar, doc.body.firstChild);
      doc.documentElement.classList.add('ru-has-topnav');
      markCurrent();
      return true;
    }

    const onKey = (e) => { if (e.key === 'Escape') closeMenus(true); };
    const onClick = (e) => { if (drop && !drop.hidden && !e.target.closest('.ru-nav')) closeMenus(); };
    win.addEventListener('hashchange', markCurrent);
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('click', onClick);

    function teardown() {
        if (bar) bar.remove();
        if (overlay) overlay.remove();
        if (style) style.remove();
        if (sidebar) sidebar.classList.remove('ru-nav-hidden');
        reset.splice(0).forEach(([e, prop, val, pri]) => { if (val) e.style.setProperty(prop, val, pri); else e.style.removeProperty(prop); });
        doc.documentElement.classList.remove('ru-has-topnav');
        doc.documentElement.style.overflow = '';
        bar = overlay = drop = sidebar = style = null;
    }

    const api = {
      refresh() {
        if (!bar) build();
        else if (sidebar && !sidebar.isConnected) { teardown(); build(); } // Rise re-rendered its sidebar
        else markCurrent();
        if (bar && opts && opts.look) [bar, overlay].forEach((n) => n && opts.applyLook(n));
      },
      stop() {
        teardown();
        win.removeEventListener('hashchange', markCurrent);
        doc.removeEventListener('keydown', onKey);
        doc.removeEventListener('click', onClick);
      },
    };
    api.refresh();
    return api;
  }

  return { NAV_LAYOUTS: LAYOUTS, startNav, collectLessons, findSidebar };
});
