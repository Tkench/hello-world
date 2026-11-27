/*
 * Downloads Google Fonts so they can be used where linking to Google isn't
 * possible: inside the Rise editor (whose security policy may block font
 * links) and inside published packages that must work offline in an LMS.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports ? require('./css.js') : root.RiseUp;
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  /** Parse Google Fonts CSS into one entry per @font-face. */
  function parseFontFaceCss(css) {
    const faces = [];
    const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const body = m[2];
      const get = (prop) => {
        const r = body.match(new RegExp(prop + '\\s*:\\s*([^;]+);'));
        return r ? r[1].trim() : '';
      };
      const url = (body.match(/url\(([^)]+)\)/) || [])[1];
      if (!url) continue;
      faces.push({
        subset: m[1] || '',
        family: get('font-family').replace(/^['"]|['"]$/g, ''),
        style: get('font-style') || 'normal',
        weight: get('font-weight') || '400',
        unicodeRange: get('unicode-range'),
        url: url.replace(/^['"]|['"]$/g, ''),
      });
    }
    return faces;
  }

  function fileNameFor(face, i) {
    const ext = (face.url.match(/\.(woff2|woff|ttf|otf)(?:$|\?)/) || [])[1] || 'woff2';
    const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return [slug(face.family), face.weight.replace(/\s+/g, '-'), face.style, slug(face.subset) || String(i)].join('-') + '.' + ext;
  }

  /** Download the CSS and every font file for a course's fonts. */
  async function fetchFonts(fonts, fetchImpl) {
    const url = deps.googleFontsUrl(fonts);
    if (!url) return [];
    const f = fetchImpl || fetch;
    const res = await f(url);
    if (!res.ok) throw new Error('Google Fonts returned ' + res.status + '. Check the font names are spelled exactly as on fonts.google.com.');
    const faces = parseFontFaceCss(await res.text());
    await Promise.all(faces.map(async (face, i) => {
      const r = await f(face.url);
      if (!r.ok) throw new Error('Could not download ' + face.family + ' (' + r.status + ').');
      face.data = await r.arrayBuffer();
      face.fileName = fileNameFor(face, i);
    }));
    return faces;
  }

  /** @font-face CSS pointing at files in a local fonts/ folder. */
  function embeddedFontCss(faces) {
    return faces.map((f) => [
      '@font-face {',
      "  font-family: '" + f.family.replace(/'/g, '') + "';",
      '  font-style: ' + f.style + ';',
      '  font-weight: ' + f.weight + ';',
      '  font-display: swap;',
      "  src: url('fonts/" + f.fileName + "');",
      f.unicodeRange ? '  unicode-range: ' + f.unicodeRange + ';' : '',
      '}',
    ].filter(Boolean).join('\n')).join('\n');
  }

  function toBase64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function fromBase64(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
  }

  return { parseFontFaceCss, fetchFonts, embeddedFontCss, toBase64, fromBase64 };
});
