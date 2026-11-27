/*
 * Course-wide find and replace through Rise's own translation workflow:
 * export the course as XLIFF in Rise, run it through RiseUp, import it back.
 * Only text is changed; tags, attributes and escaped HTML markup are left alone.
 *
 * Works with XLIFF 1.2 (<trans-unit>) and 2.x (<segment>).
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports ? require('./textRules.js') : root.RiseUp;
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  const { findMatches } = deps;
  // Pieces of a text node that must not be edited: escaped HTML tags and entities.
  const PROTECTED = /(<[^>]*>|&[#A-Za-z0-9]+;)/;

  function replaceInString(text, find, replacement, opts) {
    let count = 0;
    const parts = text.split(PROTECTED).map((part, i) => {
      if (i % 2 === 1) return part; // protected piece
      const starts = findMatches(part, find, opts);
      if (!starts.length) return part;
      count += starts.length;
      let out = '';
      let last = 0;
      for (const s of starts) {
        out += part.slice(last, s) + replacement;
        last = s + find.length;
      }
      return out + part.slice(last);
    });
    return { text: parts.join(''), count };
  }

  function visibleText(text) {
    return text.split(PROTECTED).filter((_, i) => i % 2 === 0).join('');
  }

  function units(doc) {
    const all = Array.from(doc.getElementsByTagName('*'));
    const segs = all.filter((e) => e.localName === 'trans-unit' || e.localName === 'segment');
    return segs;
  }

  function child(el, name) {
    return Array.from(el.children || el.childNodes).find((c) => c.nodeType === 1 && c.localName === name) || null;
  }

  function textNodesOf(el) {
    const out = [];
    (function walk(n) {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 3) out.push(c);
        else if (c.nodeType === 1) walk(c);
      }
    })(el);
    return out;
  }

  function parse(xml, env) {
    const doc = new env.DOMParser().parseFromString(xml, 'application/xml');
    const err = doc.getElementsByTagName('parsererror')[0];
    if (err) throw new Error('This file is not valid XLIFF: ' + (err.textContent || '').trim().slice(0, 200));
    if (!units(doc).length) throw new Error('No translation units were found. Export the course from Rise as XLIFF and try again.');
    return doc;
  }

  /** The text Rise will import for a unit: its target if present, else its source. */
  function effectiveEl(unit) {
    return child(unit, 'target') || child(unit, 'source');
  }

  /** Matches without changing anything: [{ unitId, count, text }]. */
  function previewXliff(xml, find, opts, env) {
    const doc = parse(xml, env);
    const hits = [];
    for (const u of units(doc)) {
      const el = effectiveEl(u);
      if (!el) continue;
      const text = visibleText(textNodesOf(el).map((t) => t.nodeValue).join(''));
      const n = findMatches(text, find, opts).length;
      if (n) hits.push({ unitId: u.getAttribute('id') || (u.parentNode && u.parentNode.getAttribute && u.parentNode.getAttribute('id')) || '', count: n, text });
    }
    return hits;
  }

  /**
   * Replace in every unit. Units without a <target> get one copied from the
   * source, so the re-imported file keeps all of the course's text.
   */
  function replaceInXliff(xml, find, replacement, opts, env) {
    if (!find) throw new Error('Enter the text to find.');
    const doc = parse(xml, env);
    let count = 0;
    let changedUnits = 0;
    for (const u of units(doc)) {
      const source = child(u, 'source');
      let target = child(u, 'target');
      if (!target && source) {
        target = doc.createElementNS(source.namespaceURI, source.prefix ? source.prefix + ':target' : 'target');
        for (const c of Array.from(source.childNodes)) target.appendChild(c.cloneNode(true));
        if (source.nextSibling) u.insertBefore(target, source.nextSibling);
        else u.appendChild(target);
      }
      if (!target) continue;
      let unitCount = 0;
      for (const t of textNodesOf(target)) {
        const r = replaceInString(t.nodeValue, find, replacement, opts);
        if (r.count) {
          t.nodeValue = r.text;
          unitCount += r.count;
        }
      }
      if (unitCount) changedUnits++;
      count += unitCount;
    }
    let out = new env.XMLSerializer().serializeToString(doc);
    if (/^\s*<\?xml/.test(xml) && !/^\s*<\?xml/.test(out)) out = '<?xml version="1.0" encoding="UTF-8"?>\n' + out;
    return { xml: out, count, changedUnits };
  }

  return { replaceInXliff, previewXliff, replaceInString };
});
