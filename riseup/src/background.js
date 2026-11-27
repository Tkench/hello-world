/* RiseUp service worker: font downloads and opening the tools page. */
importScripts('shared/css.js', 'shared/fontLoader.js');

const RU = self.RiseUp;
const fontCache = new Map(); // Google Fonts URL -> faces with base64 data

async function fontsFor(fonts) {
  const key = RU.googleFontsUrl(fonts);
  if (!key) return [];
  if (!fontCache.has(key)) {
    const faces = await RU.fetchFonts(fonts);
    fontCache.set(key, faces.map((f) => ({
      family: f.family, style: f.style, weight: f.weight, unicodeRange: f.unicodeRange,
      data: RU.toBase64(f.data),
    })));
  }
  return fontCache.get(key);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;
  if (msg.type === 'riseup:fetchFonts') {
    fontsFor(msg.fonts || [])
      .then((faces) => sendResponse({ ok: true, faces }))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true; // async response
  }
  if (msg.type === 'riseup:uiFonts') {
    // Poppins (the brand typeface) ships with the extension for the panel.
    Promise.all([400, 700].map(async (weight) => {
      const res = await fetch(chrome.runtime.getURL('fonts/poppins-' + weight + '.woff2'));
      return { weight: String(weight), data: RU.toBase64(await res.arrayBuffer()) };
    }))
      .then((faces) => sendResponse({ ok: true, faces }))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  if (msg.type === 'riseup:openTools') {
    const hash = msg.courseId ? '#course=' + encodeURIComponent(msg.courseId) : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('src/tools/tools.html' + hash) });
    return false;
  }
  return false;
});
