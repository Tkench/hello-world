/* Colour helpers: hex parsing and WCAG 2.x contrast. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** '#abc', 'abc', '#aabbcc' or 'rgb(1,2,3)' -> { r, g, b } or null. */
  function parseColor(input) {
    if (typeof input !== 'string') return null;
    const s = input.trim().toLowerCase();
    let m = s.match(/^#?([0-9a-f]{3})$/);
    if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
    m = s.match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
    m = s.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/);
    if (m) {
      const [r, g, b] = m.slice(1, 4).map(Number);
      if ([r, g, b].every((v) => v <= 255)) return { r, g, b };
    }
    return null;
  }

  function toHex(c) {
    const h = (v) => v.toString(16).padStart(2, '0');
    return '#' + h(c.r) + h(c.g) + h(c.b);
  }

  function normalizeHex(input) {
    const c = parseColor(input);
    return c ? toHex(c) : null;
  }

  function luminance(c) {
    const lin = (v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }

  /** WCAG contrast ratio between two colours (1 to 21), or null if either is invalid. */
  function contrastRatio(a, b) {
    const ca = parseColor(a);
    const cb = parseColor(b);
    if (!ca || !cb) return null;
    const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** Which WCAG 2.x levels a ratio passes. */
  function wcagGrades(ratio) {
    return {
      normalAA: ratio >= 4.5,
      normalAAA: ratio >= 7,
      largeAA: ratio >= 3,
      largeAAA: ratio >= 4.5,
      uiAA: ratio >= 3,
    };
  }

  return { parseColor, toHex, normalizeHex, contrastRatio, wcagGrades };
});
