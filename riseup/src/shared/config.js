/*
 * RiseUp shared configuration: defaults, storage keys and course detection.
 * Loaded as a classic script in the extension (attaches to globalThis.RiseUp)
 * and as a CommonJS module in Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CONFIG_VERSION = 1;
  const COURSE_KEY_PREFIX = 'riseup:course:';
  const COLORS_KEY = 'riseup:colors';

  /** Styling Rise has no native control for. Null/empty means "leave Rise's default". */
  function defaultGlobalStyles() {
    return {
      enabled: true,
      blockRadius: null, // px, rounds block containers (Rise has no corner-radius setting)
      blockShadow: 'none', // none | soft | medium | strong
      buttonRadius: null, // px
      buttonTextTransform: '', // '' | none | uppercase | lowercase | capitalize
      buttonFontWeight: '', // '' | 400..900
      headingTextTransform: '',
      headingFontWeight: '',
      linkColor: '',
      linkUnderline: '', // '' | always | hover | none
      imageRadius: null, // px
      pageImage: '', // one fixed image behind the whole course
      pageOverlay: 'light', // none | light | dark
      pageBlocks: 'frosted', // how Rise's blocks sit on it: frosted | solid | clear
      customCss: '',
    };
  }

  function defaultCourseConfig() {
    return {
      version: CONFIG_VERSION,
      courseTitle: '',
      globalStyles: defaultGlobalStyles(),
      fonts: [], // [{ family: 'Lora', weights: [400, 700], italic: true }]
      textStyles: [], // see textRules.js for the shape
      textRules: [], // [{ id, text, styleId, matchCase, wholeWord }]
      components: [], // RiseUp blocks: [{ id, type, name, data }] (see components.js)
      componentTheme: { accent: '', radius: 12, matchCourse: true, bg: {} }, // bg: course default block background // matchCourse: take colour, fonts and button shape from the Rise course
      animation: { type: 'none', duration: 700 }, // scroll animation for blocks
      navigation: { layout: 'rise', style: 'light', progress: true, logo: '', title: '' }, // see nav.js
      widget: { enabled: false, tools: { score: true }, title: '' }, // floating space, see widget.js
      startPage: { enabled: false, style: 'photo', eyebrow: '', title: '', subtitle: '', image: '', logo: '', bullets: '', duration: '', buttonText: 'Start course', startAt: '1' }, // see course.js
    };
  }

  function defaultColors() {
    return { palettes: [{ id: 'default', name: 'My colors', colors: [] }], recent: [] };
  }

  /** Fill in any missing keys so configs saved by older versions keep working. */
  function normalizeCourseConfig(cfg) {
    const base = defaultCourseConfig();
    const out = Object.assign(defaultCourseConfig(), cfg || {});
    out.globalStyles = Object.assign(defaultGlobalStyles(), (cfg && cfg.globalStyles) || {});
    for (const k of ['fonts', 'textStyles', 'textRules', 'components']) if (!Array.isArray(out[k])) out[k] = [];
    out.componentTheme = Object.assign(base.componentTheme, (cfg && cfg.componentTheme) || {});
    out.componentTheme.bg = Object.assign({}, out.componentTheme.bg);
    out.animation = Object.assign(base.animation, (cfg && cfg.animation) || {});
    out.navigation = Object.assign(base.navigation, (cfg && cfg.navigation) || {});
    out.startPage = Object.assign(base.startPage, (cfg && cfg.startPage) || {});
    out.widget = Object.assign(base.widget, (cfg && cfg.widget) || {});
    // Older settings chose one tool with `type`.
    if (cfg && cfg.widget && !cfg.widget.tools && cfg.widget.type) out.widget.tools = { [cfg.widget.type]: true };
    out.widget.tools = Object.assign({}, out.widget.tools);
    out.version = CONFIG_VERSION;
    return out;
  }

  /**
   * Works out which Rise course a URL belongs to. Rise's URL scheme is not
   * documented, so this accepts the shapes seen in practice and falls back to
   * the first long id-like path segment.
   */
  function courseIdFromUrl(href) {
    let url;
    try { url = new URL(href); } catch (e) { return 'default'; }
    const hay = url.pathname + ' ' + url.hash;
    const m = hay.match(/\/(?:author|authoring|course|courses|preview|review|share)\/([A-Za-z0-9_-]{8,})/);
    if (m) return m[1];
    const seg = hay.split(/[\/#?\s]+/).find((s) => /^[A-Za-z0-9_-]{16,}$/.test(s));
    return seg || 'default';
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9);
  }

  return {
    CONFIG_VERSION, COURSE_KEY_PREFIX, COLORS_KEY,
    defaultGlobalStyles, defaultCourseConfig, defaultColors,
    normalizeCourseConfig, courseIdFromUrl, uid,
  };
});
