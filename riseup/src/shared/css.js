/*
 * Turns a RiseUp course config into CSS. The same CSS is used in the Rise
 * editor, in Rise's preview, and inside published course packages.
 *
 * Rise's markup is not a public API. Every selector that depends on it lives
 * in SELECTORS below so it can be corrected in one place when Rise changes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SELECTORS = {
    block: '[data-block-id], .block-wrapper, .blocks-lesson > section, .block',
    heading: '.block-wrapper h1, .block-wrapper h2, .block-wrapper h3, .block-wrapper h4, [data-block-id] h1, [data-block-id] h2, [data-block-id] h3, [data-block-id] h4, .lesson-header__title',
    button: '.blocks-button__button, .block-wrapper a.brand--background, [data-block-id] a[class*="button"], [data-block-id] button[class*="button"]',
    link: '.block-wrapper a:not([class*="button"]), [data-block-id] a:not([class*="button"])',
    image: '.block-wrapper img, [data-block-id] img',
    // Page-level wrappers that must be see-through for a course background to show.
    pageWrappers: '#app, #app > div, main, .lesson-main, .blocks-lesson, .page-wrap, .lesson-blocks',
  };

  const SHADOWS = {
    none: '',
    soft: '0 1px 3px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.06)',
    medium: '0 2px 6px rgba(0,0,0,.12), 0 10px 24px rgba(0,0,0,.10)',
    strong: '0 6px 14px rgba(0,0,0,.18), 0 20px 40px rgba(0,0,0,.16)',
  };

  const TEXT_SHADOWS = {
    '': '',
    soft: '0 1px 2px rgba(0,0,0,.25)',
    strong: '0 2px 4px rgba(0,0,0,.45)',
    glow: '0 0 6px rgba(255,255,255,.9), 0 0 14px rgba(255,255,255,.6)',
  };

  const TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize'];

  function safeColor(v) {
    if (typeof v !== 'string') return '';
    const s = v.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
    if (/^(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,\/-]+\)$/i.test(s)) return s;
    return '';
  }

  function safeNumber(v, min, max) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
  }

  function safeFamily(v) {
    if (typeof v !== 'string') return '';
    const s = v.trim();
    return /^[A-Za-z0-9 \-]{1,60}$/.test(s) ? s : '';
  }

  function safeWeight(v) {
    const n = safeNumber(v, 100, 900);
    return n === null ? '' : String(Math.round(n / 100) * 100);
  }

  function safeTransform(v) {
    return TRANSFORMS.includes(v) ? v : '';
  }

  function safeId(v) {
    return String(v || '').replace(/[^A-Za-z0-9_-]/g, '');
  }

  function rule(selector, decls) {
    const body = decls.filter(Boolean).join(' ');
    return body ? selector + ' { ' + body + ' }' : '';
  }

  function important(prop, value) {
    return value === '' || value === null || value === undefined ? '' : prop + ': ' + value + ' !important;';
  }

  function globalStylesCss(gs, opts) {
    const editor = Boolean(opts && opts.editor);
    if (!gs || gs.enabled === false) return '';
    const out = [];
    const blockRadius = safeNumber(gs.blockRadius, 0, 64);
    const shadow = SHADOWS[gs.blockShadow] || '';
    if (blockRadius !== null || shadow) {
      out.push(rule(SELECTORS.block, [
        blockRadius !== null ? important('border-radius', blockRadius + 'px') : '',
        blockRadius !== null && !editor ? 'overflow: hidden;' : '', // in the editor this would clip Rise's block toolbars
        important('box-shadow', shadow),
      ]));
    }
    const buttonRadius = safeNumber(gs.buttonRadius, 0, 64);
    out.push(rule(SELECTORS.button, [
      buttonRadius !== null ? important('border-radius', buttonRadius + 'px') : '',
      important('text-transform', safeTransform(gs.buttonTextTransform)),
      important('font-weight', safeWeight(gs.buttonFontWeight)),
    ]));
    out.push(rule(SELECTORS.heading, [
      important('text-transform', safeTransform(gs.headingTextTransform)),
      important('font-weight', safeWeight(gs.headingFontWeight)),
    ]));
    const linkColor = safeColor(gs.linkColor);
    const underline = { always: 'underline', hover: 'none', none: 'none' }[gs.linkUnderline] || '';
    out.push(rule(SELECTORS.link, [important('color', linkColor), important('text-decoration', underline)]));
    if (gs.linkUnderline === 'hover') {
      out.push(rule(SELECTORS.link.split(',').map((s) => s.trim() + ':hover').join(', '), [important('text-decoration', 'underline')]));
    }
    const imageRadius = safeNumber(gs.imageRadius, 0, 64);
    if (imageRadius !== null) out.push(rule(SELECTORS.image, [important('border-radius', imageRadius + 'px')]));
    out.push(pageBackgroundCss(gs, editor, opts));
    if (typeof gs.customCss === 'string' && gs.customCss.trim()) {
      // Custom CSS is the author's own; only stop it closing a <style> element early.
      out.push('/* custom */\n' + gs.customCss.replace(/<\/style/gi, '<\\/style'));
    }
    return out.filter(Boolean).join('\n');
  }

  function safeCssUrl(u) {
    if (typeof u !== 'string') return '';
    const v = u.trim();
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^https:\/\/[^\s'"()<>]+$/i.test(v) || /^(riseup\/)?media\/[\w.-]+$/.test(v)) return v;
    return '';
  }

  /**
   * One large image fixed behind the whole course. It's drawn on a fixed layer
   * (not background-attachment, which phones ignore), and Rise's page wrappers
   * are made see-through so it shows. Not applied in the editor.
   */
  function pageBackgroundCss(gs, editor, opts) {
    const url = safeCssUrl((opts && opts.pageImageUrl) || gs.pageImage);
    if (!url || editor) return '';
    const tint = { light: 'rgba(255,255,255,.55)', dark: 'rgba(8,10,16,.55)' }[gs.pageOverlay] || '';
    const layers = (tint ? 'linear-gradient(' + tint + ', ' + tint + '), ' : '') + "url('" + url + "')";
    const out = [
      'html, body { background: transparent !important; }',
      'body::before { content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none; background: ' + layers + ' center / cover no-repeat; }',
      SELECTORS.pageWrappers.split(',').map((s) => s.trim()).join(', ') + ' { background: transparent !important; }',
    ];
    const blocks = SELECTORS.block + ', .lesson-header'; // the lesson title banner gets the same treatment
    if (gs.pageBlocks === 'frosted' || !gs.pageBlocks) {
      out.push(blocks + ' { background-color: rgba(255,255,255,.82) !important; -webkit-backdrop-filter: blur(8px) saturate(1.2); backdrop-filter: blur(8px) saturate(1.2); }');
    } else if (gs.pageBlocks === 'clear') {
      out.push(blocks + ' { background: transparent !important; }');
    }
    return out.join('\n');
  }

  /** Class name a text style is rendered with. */
  function styleClass(styleId) {
    return 'ru-style-' + safeId(styleId);
  }

  function textStyleCss(style) {
    const id = safeId(style && style.id);
    if (!id) return '';
    const family = safeFamily(style.fontFamily);
    const from = safeColor(style.gradientFrom);
    const to = safeColor(style.gradientTo);
    const angle = safeNumber(style.gradientAngle, 0, 360);
    const spacing = safeNumber(style.letterSpacing, -0.2, 1);
    const decls = [
      family ? "font-family: '" + family + "', inherit !important;" : '',
      important('font-weight', safeWeight(style.fontWeight)),
      style.italic ? 'font-style: italic !important;' : '',
      important('text-transform', safeTransform(style.textTransform)),
      spacing !== null ? important('letter-spacing', spacing + 'em') : '',
      style.smallCaps ? 'font-variant-caps: small-caps !important;' : '',
      important('text-shadow', TEXT_SHADOWS[style.shadow] || ''),
      important('background-color', safeColor(style.highlight)),
    ];
    if (from && to) {
      decls.push(
        'background-image: linear-gradient(' + (angle === null ? 90 : angle) + 'deg, ' + from + ', ' + to + ') !important;',
        '-webkit-background-clip: text !important; background-clip: text !important;',
        '-webkit-text-fill-color: transparent !important; color: transparent !important;'
      );
    } else {
      decls.push(important('color', safeColor(style.color)));
    }
    return rule('.' + styleClass(id), decls);
  }

  /** Google Fonts CSS2 URL for the fonts a course uses, or '' if none. */
  function googleFontsUrl(fonts) {
    const families = (fonts || [])
      .map((f) => {
        const family = safeFamily(f && f.family);
        if (!family) return '';
        const weights = Array.from(new Set((f.weights && f.weights.length ? f.weights : [400, 700]).map(safeWeight).filter(Boolean))).sort();
        const axis = f.italic
          ? 'ital,wght@' + weights.map((w) => '0,' + w).concat(weights.map((w) => '1,' + w)).join(';')
          : 'wght@' + weights.join(';');
        return 'family=' + encodeURIComponent(family).replace(/%20/g, '+') + ':' + axis;
      })
      .filter(Boolean);
    return families.length ? 'https://fonts.googleapis.com/css2?' + families.join('&') + '&display=swap' : '';
  }

  function buildCss(config, opts) {
    const cfg = config || {};
    const parts = ['/* Generated by RiseUp */', globalStylesCss(cfg.globalStyles, opts)];
    for (const s of cfg.textStyles || []) parts.push(textStyleCss(s));
    return parts.filter(Boolean).join('\n') + '\n';
  }

  return {
    SELECTORS, SHADOWS, TEXT_SHADOWS,
    buildCss, globalStylesCss, textStyleCss, styleClass, googleFontsUrl, pageBackgroundCss,
    safeColor, safeFamily,
  };
});
