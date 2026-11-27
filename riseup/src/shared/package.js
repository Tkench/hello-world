/*
 * Adds RiseUp's styling to a course published from Rise (SCORM, xAPI, cmi5,
 * AICC or Web zip), so learners see it without the extension.
 *
 * It finds the course's index.html, writes a riseup/ folder next to it
 * (CSS, config, runtime, optional embedded fonts) and links it from the page.
 * Running it twice on the same zip replaces the earlier injection.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports
    ? Object.assign({}, require('./css.js'), require('./textRules.js'))
    : root.RiseUp;
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  const START = '<!-- riseup:start -->';
  const END = '<!-- riseup:end -->';
  const MARKER_RE = /\s*<!-- riseup:start -->[\s\S]*?<!-- riseup:end -->/g;

  /** Pick the course page inside a published zip's file list. */
  function findCourseIndex(paths) {
    const html = paths.filter((p) => /(^|\/)index\.html$/i.test(p) && !/(^|\/)(__MACOSX|lib|libs|vendor)\//i.test(p));
    // SCORM zips have a launcher index.html at the root and the course in scormcontent/.
    const order = [/(^|\/)scormcontent\/index\.html$/i, /(^|\/)content\/index\.html$/i, /(^|\/)index\.html$/i];
    const depth = (p) => p.split('/').length;
    for (const re of order) {
      const hits = html.filter((p) => re.test(p)).sort((a, b) => depth(a) - depth(b));
      if (hits.length) return hits[0];
    }
    return null;
  }

  function injectIntoHtml(html, opts) {
    const clean = html.replace(MARKER_RE, '');
    const head = [START,
      opts.fontCssHref ? '<link rel="stylesheet" href="' + opts.fontCssHref + '">' : '',
      '<link rel="stylesheet" href="riseup/riseup.css">',
      END].filter(Boolean).join('\n');
    const body = [START,
      '<script src="riseup/riseup-config.js"></script>',
      '<script src="riseup/text-rules.js"></script>',
      '<script src="riseup/components.js"></script>',
      '<script src="riseup/components-more.js"></script>',
      '<script src="riseup/components-extra.js"></script>',
      '<script src="riseup/components-layout.js"></script>',
      '<script src="riseup/nav.js"></script>',
      '<script src="riseup/widget.js"></script>',
      '<script src="riseup/riseup-runtime.js"></script>',
      END].join('\n');
    if (!/<\/head>/i.test(clean) || !/<\/body>/i.test(clean)) throw new Error('The course page has no </head> or </body> tag, so RiseUp could not add its styling.');
    return clean.replace(/<\/head>/i, head + '\n</head>').replace(/<\/body>(?![\s\S]*<\/body>)/i, body + '\n</body>');
  }

  /** Only what the published runtime needs. */
  function runtimeConfig(config) {
    return {
      textStyles: config.textStyles || [],
      textRules: config.textRules || [],
      components: config.components || [],
      componentTheme: config.componentTheme || {},
      animation: config.animation || { type: 'none' },
      navigation: config.navigation || { layout: 'rise' },
      widget: config.widget || { enabled: false },
      blockSelector: deps.SELECTORS.block,
    };
  }

  const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

  function base64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  /**
   * Images in RiseUp blocks are stored as data: URLs. In a package they
   * become real files (riseup/media/…) so the course loads faster.
   */
  function externalizeMedia(rtConfig) {
    const files = [];
    const seen = new Map();
    const walk = (v) => {
      if (typeof v === 'string') {
        const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(v);
        if (!m || !MIME_EXT[m[1]]) return v;
        if (!seen.has(v)) {
          const name = 'media/img-' + (files.length + 1) + '.' + MIME_EXT[m[1]];
          files.push({ name, data: base64ToBytes(m[2]) });
          seen.set(v, 'riseup/' + name);
        }
        return seen.get(v);
      }
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const o = {};
        for (const [k, x] of Object.entries(v)) o[k] = walk(x);
        return o;
      }
      return v;
    };
    const config = Object.assign({}, rtConfig, { components: walk(rtConfig.components || []), navigation: walk(rtConfig.navigation || { layout: 'rise' }), componentTheme: walk(rtConfig.componentTheme || {}) });
    return { config, files };
  }

  /**
   * @param zip      a JSZip instance holding the published course
   * @param config   the course's RiseUp config
   * @param assets   { runtimeJs, textRulesJs, componentsJs, fontCss?, fontFiles?: [{ name, data }] }
   */
  async function patchCourseZip(zip, config, assets) {
    const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
    const index = findCourseIndex(paths);
    if (!index) throw new Error('No index.html found. Publish the course from Rise (SCORM, xAPI, cmi5, AICC or Web) and use that zip.');
    const dir = index.includes('/') ? index.slice(0, index.lastIndexOf('/') + 1) : '';
    const html = await zip.file(index).async('string');

    // Drop files from an earlier run so removed fonts don't linger.
    Object.keys(zip.files).filter((p) => p.startsWith(dir + 'riseup/')).forEach((p) => zip.remove(p));

    let fontCssHref = '';
    if (assets.fontCss) {
      zip.file(dir + 'riseup/fonts.css', assets.fontCss);
      for (const f of assets.fontFiles || []) zip.file(dir + 'riseup/fonts/' + f.name, f.data);
      fontCssHref = 'riseup/fonts.css';
    } else {
      fontCssHref = deps.googleFontsUrl(config.fonts);
    }

    // The course background goes in as a file next to the CSS (riseup/media/), not inline.
    let pageImageUrl = '';
    const pm = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec((config.globalStyles && config.globalStyles.pageImage) || '');
    if (pm && MIME_EXT[pm[1]]) {
      zip.file(dir + 'riseup/media/course-background.' + MIME_EXT[pm[1]], base64ToBytes(pm[2]));
      pageImageUrl = 'media/course-background.' + MIME_EXT[pm[1]];
    }
    zip.file(dir + 'riseup/riseup.css', deps.buildCss(config, { pageImageUrl }));
    const media = externalizeMedia(runtimeConfig(config));
    for (const f of media.files) zip.file(dir + 'riseup/' + f.name, f.data);
    zip.file(dir + 'riseup/riseup-config.js', 'window.RISEUP_CONFIG = ' + JSON.stringify(media.config).replace(/</g, '\\u003c') + ';\n');
    zip.file(dir + 'riseup/text-rules.js', assets.textRulesJs);
    zip.file(dir + 'riseup/components.js', assets.componentsJs || '');
    zip.file(dir + 'riseup/nav.js', assets.navJs || '');
    zip.file(dir + 'riseup/components-more.js', assets.componentsMoreJs || '');
    zip.file(dir + 'riseup/components-extra.js', assets.componentsExtraJs || '');
    zip.file(dir + 'riseup/components-layout.js', assets.componentsLayoutJs || '');
    zip.file(dir + 'riseup/widget.js', assets.widgetJs || '');
    zip.file(dir + 'riseup/riseup-runtime.js', assets.runtimeJs);
    zip.file(index, injectIntoHtml(html, { fontCssHref }));
    return { index, dir, fontsEmbedded: Boolean(assets.fontCss) };
  }

  return { findCourseIndex, injectIntoHtml, patchCourseZip, runtimeConfig, externalizeMedia, START, END };
});
