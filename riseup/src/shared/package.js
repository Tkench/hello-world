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
      '<script src="riseup/riseup-runtime.js"></script>',
      END].join('\n');
    if (!/<\/head>/i.test(clean) || !/<\/body>/i.test(clean)) throw new Error('The course page has no </head> or </body> tag, so RiseUp could not add its styling.');
    return clean.replace(/<\/head>/i, head + '\n</head>').replace(/<\/body>(?![\s\S]*<\/body>)/i, body + '\n</body>');
  }

  /** Only what the published runtime needs. */
  function runtimeConfig(config) {
    return { textStyles: config.textStyles || [], textRules: config.textRules || [] };
  }

  /**
   * @param zip      a JSZip instance holding the published course
   * @param config   the course's RiseUp config
   * @param assets   { runtimeJs, textRulesJs, fontCss? , fontFiles?: [{ name, data }] }
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

    zip.file(dir + 'riseup/riseup.css', deps.buildCss(config));
    zip.file(dir + 'riseup/riseup-config.js', 'window.RISEUP_CONFIG = ' + JSON.stringify(runtimeConfig(config)).replace(/</g, '\\u003c') + ';\n');
    zip.file(dir + 'riseup/text-rules.js', assets.textRulesJs);
    zip.file(dir + 'riseup/riseup-runtime.js', assets.runtimeJs);
    zip.file(index, injectIntoHtml(html, { fontCssHref }));
    return { index, dir, fontsEmbedded: Boolean(assets.fontCss) };
  }

  return { findCourseIndex, injectIntoHtml, patchCourseZip, runtimeConfig, START, END };
});
