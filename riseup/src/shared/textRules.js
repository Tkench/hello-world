/*
 * Text rules: "render this phrase with this text style".
 *
 * Rise's editor keeps its own copy of text and drops markup it doesn't know,
 * so RiseUp never writes styling into Rise's text. Instead it stores rules and
 * applies them to the rendered page: by wrapping matches in <span> elements in
 * previews and published courses, and with the CSS Custom Highlight API inside
 * the editor, where changing the DOM would interfere with editing.
 *
 * A text style looks like:
 *   { id, name, fontFamily, fontWeight, italic, textTransform, letterSpacing,
 *     color, gradientFrom, gradientTo, gradientAngle, shadow, smallCaps, highlight }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG', 'MATH']);
  const WORD_CHAR = /[\p{L}\p{N}_]/u;
  const ATTR = 'data-riseup-rule';

  /** Start offsets of every match of `needle` in `haystack`. */
  function findMatches(haystack, needle, opts) {
    const o = opts || {};
    if (!needle) return [];
    const h = o.matchCase ? haystack : haystack.toLowerCase();
    const n = o.matchCase ? needle : needle.toLowerCase();
    const out = [];
    let i = h.indexOf(n);
    while (i !== -1) {
      const before = i > 0 ? haystack[i - 1] : '';
      const after = haystack[i + needle.length] || '';
      const ok = !o.wholeWord || (!WORD_CHAR.test(before) && !WORD_CHAR.test(after));
      if (ok) out.push(i);
      i = h.indexOf(n, i + (ok ? n.length : 1));
    }
    return out;
  }

  function isSkipped(el, opts) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (SKIP_TAGS.has(e.tagName.toUpperCase())) return true;
      if (e.hasAttribute(ATTR) || e.hasAttribute('data-riseup-ignore')) return true;
      if (opts && opts.skipEditable && (e.isContentEditable === true || /^(|true|plaintext-only)$/i.test(e.getAttribute('contenteditable') ?? 'x'))) return true;
    }
    return false;
  }

  function textNodes(root, opts) {
    const doc = root.ownerDocument || root;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, null);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeValue && n.nodeValue.trim() && !isSkipped(n.parentElement, opts)) nodes.push(n);
    }
    return nodes;
  }

  function usableRules(rules, styles) {
    const ids = new Set((styles || []).map((s) => s.id));
    return (rules || [])
      .filter((r) => r && r.text && ids.has(r.styleId))
      .sort((a, b) => b.text.length - a.text.length); // longer phrases win over phrases they contain
  }

  /**
   * Wrap every match in a <span class="ru-style-…">. Safe to call repeatedly:
   * text already wrapped is skipped. Returns the number of spans added.
   */
  function wrapTextRules(root, rules, styles, opts) {
    const styleClass = (id) => 'ru-style-' + String(id).replace(/[^A-Za-z0-9_-]/g, '');
    let added = 0;
    for (const r of usableRules(rules, styles)) {
      for (const node of textNodes(root, opts)) {
        const starts = findMatches(node.nodeValue, r.text, r);
        for (let k = starts.length - 1; k >= 0; k--) {
          const start = starts[k];
          const match = node.splitText(start);
          match.splitText(r.text.length);
          const span = node.ownerDocument.createElement('span');
          span.className = styleClass(r.styleId);
          span.setAttribute(ATTR, r.id || '');
          match.parentNode.replaceChild(span, match);
          span.appendChild(match);
          added++;
        }
      }
    }
    return added;
  }

  /** Undo wrapTextRules. */
  function unwrapTextRules(root) {
    const spans = root.querySelectorAll('span[' + ATTR + ']');
    spans.forEach((span) => {
      const parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
    return spans.length;
  }

  /**
   * Ranges for every match, grouped by style id, without touching the DOM.
   * Used with CSS.highlights inside the editor.
   */
  function collectRanges(root, rules, styles) {
    const doc = root.ownerDocument || root;
    const byStyle = {};
    const claimed = new Map(); // text node -> [[start, end]] already used by a longer rule
    for (const r of usableRules(rules, styles)) {
      for (const node of textNodes(root, {})) {
        const taken = claimed.get(node) || [];
        for (const start of findMatches(node.nodeValue, r.text, r)) {
          const end = start + r.text.length;
          if (taken.some(([s, e]) => start < e && end > s)) continue;
          taken.push([start, end]);
          const range = doc.createRange();
          range.setStart(node, start);
          range.setEnd(node, end);
          (byStyle[r.styleId] = byStyle[r.styleId] || []).push(range);
        }
        claimed.set(node, taken);
      }
    }
    return byStyle;
  }

  return { findMatches, wrapTextRules, unwrapTextRules, collectRanges, RULE_ATTR: ATTR };
});
