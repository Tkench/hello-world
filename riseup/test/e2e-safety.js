/*
 * Safety check for the "course won't open" problem: a stand-in Rise app that,
 * like Rise's framework, rebuilds its page whenever anything else changes it,
 * and starts with a loading screen (as after a browser restart). RiseUp must
 * not change the app's DOM, so the app settles and opens. Rise's preview, in
 * a frame, must still show RiseUp blocks.
 * Run: node test/e2e-safety.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '..');

const LESSON = `<aside class="nav-sidebar" style="position:fixed;left:0;top:0;width:260px"><a href="#/lessons/l1">Welcome</a><a href="#/lessons/l2">Hazards</a></aside>
<main style="margin-left:260px"><div class="blocks-lesson">
<section class="block-wrapper" data-block-id="b1"><h2>Fire safety at work</h2><p>Fire safety matters.</p></section>
<section class="block-wrapper" data-block-id="b2"><p>[[RiseUp: flipcards abc123]]</p></section>
</div></main>`;

// The app: shows "Loading…", renders the course, then makes text editable,
// and re-renders whenever someone else touches its DOM.
const APP = `<!doctype html><html><head><title>Fire Safety Basics | Rise 360</title></head><body><div id="app">Loading…</div>
<script>
  window.renders = 0;
  window.ready = false;
  const app = document.getElementById('app');
  let html = 'Loading…';
  // Like a UI framework: its own updates are expected; anyone else's change makes it re-render.
  const mo = new MutationObserver(() => render());
  function render() { window.renders++; app.innerHTML = html; mo.takeRecords(); }
  mo.observe(app, { childList: true, subtree: true, characterData: true, attributes: true });
  setTimeout(() => { html = ${JSON.stringify(LESSON)}; render(); }, 1200);
  setTimeout(() => { html = html.replace('<p>Fire safety matters.</p>', '<p contenteditable="true">Fire safety matters.</p>'); render(); window.ready = true; }, 2500);
</script></body></html>`;

const PREVIEW = `<!doctype html><html><head><title>Preview</title><style>.brand--background{background:#d84745}</style></head><body>${LESSON}</body></html>`;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'riseup-safety-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT],
  });
  await ctx.route('https://rise.articulate.com/**', (route) => {
    const url = route.request().url();
    const body = url.includes('/preview/') ? PREVIEW
      : url.includes('/with-preview') ? `<!doctype html><body><iframe id="pv" src="https://rise.articulate.com/preview/XYZCOURSE01#/lessons/l1" style="width:1000px;height:700px"></iframe></body>`
      : APP;
    route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  process.stderr.write('step: launched\n');
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');

  // Saved RiseUp work for the course: a block, top navigation, animation and a styled phrase.
  const config = {
    courseTitle: 'Fire Safety Basics',
    globalStyles: { blockRadius: 16 },
    components: [{ id: 'abc123', type: 'flipcards', name: 'Flip cards', data: { cards: [{ front: 'Hazard', back: 'Harm' }] } }],
    navigation: { layout: 'topbar', style: 'dark' },
    animation: { type: 'rise', duration: 700 },
    textStyles: [{ id: 's1', name: 'S', color: '#ff0000' }],
    textRules: [{ id: 'r1', text: 'Fire safety', styleId: 's1', matchCase: true }],
  };
  process.stderr.write('step: worker ready\n');
  await sw.evaluate(async (cfg) => { await chrome.storage.local.set({ 'riseup:course:XYZCOURSE01': cfg }); }, config);

  for (const url of [
    'https://rise.articulate.com/author/XYZCOURSE01#/author/details',
    'https://rise.articulate.com/XYZCOURSE01#/course', // an address that doesn't say "author"
    'https://rise.articulate.com/',
    'https://rise.articulate.com/manage/all-content',
  ]) {
    const page = await ctx.newPage();
    process.stderr.write(new Date().toISOString().slice(17,23) + ' step: ' + ['open', url].join(' ') + '\n');
    await page.goto(url);
    process.stderr.write(new Date().toISOString().slice(17,23) + ' step: ' + ['loaded'].join(' ') + '\n');
    await page.waitForFunction(() => window.ready, null, { timeout: 8000 });
    await page.waitForTimeout(2000);
    process.stderr.write(new Date().toISOString().slice(17,23) + ' step: ' + ['settled'].join(' ') + '\n');
    const r = await page.evaluate(() => ({
      renders: window.renders,
      blocks: document.querySelectorAll('.ru-c').length,
      hidden: document.querySelectorAll('[data-riseup-host], .ru-nav-hidden, .ru-anim, span[data-riseup-rule]').length,
      text: document.getElementById('app').textContent.includes('Fire safety at work'),
    }));
    assert.ok(r.renders <= 3, url + ': the app settled (' + r.renders + ' renders)');
    assert.equal(r.blocks, 0, url + ': no blocks drawn into the app');
    assert.equal(r.hidden, 0, url + ': nothing of the app changed');
    assert.ok(r.text, url + ': course content shown');
    assert.ok(await page.locator('riseup-panel .launcher').isVisible(), url + ': RiseUp button still available');
    await page.close();
  }

  // Rise's preview, in a frame: blocks, menu and styling appear there.
  process.stderr.write(new Date().toISOString().slice(17,23) + ' step: ' + ['preview'].join(' ') + '\n');
  const host = await ctx.newPage();
  await host.goto('https://rise.articulate.com/author/XYZCOURSE01/with-preview');
  const frame = host.frameLocator('#pv');
  await frame.locator('.ru-c-flipcards .ru-flip').first().waitFor({ timeout: 8000 });
  await frame.locator('nav.ru-nav').waitFor();
  assert.equal(await frame.locator('span[data-riseup-rule]').count(), 2); // heading and paragraph

  // The runtime's safety brake: on a page that keeps undoing RiseUp's changes, it stops.
  process.stderr.write(new Date().toISOString().slice(17,23) + ' step: ' + ['brake'].join(' ') + '\n');
  const pub = await ctx.newPage();
  await pub.setContent(`<!doctype html><body><div id="app"></div><script>
    const app = document.getElementById('app');
    const html = ${JSON.stringify(LESSON)};
    window.renders = 0;
    const mo = new MutationObserver(() => draw());
    const draw = () => { window.renders++; app.innerHTML = html; mo.takeRecords(); };
    mo.observe(app, { childList: true, subtree: true, attributes: true });
    draw();
  </script></body>`);
  for (const f of ['src/shared/textRules.js', 'src/shared/components.js', 'src/shared/nav.js', 'src/runtime/riseup-runtime.js']) await pub.addScriptTag({ path: path.join(EXT, f) });
  const halted = await pub.evaluate(async (cfg) => {
    const rt = window.RiseUp.startRuntime({ components: cfg.components, textRules: [], textStyles: [] });
    await new Promise((r) => setTimeout(r, 4000));
    return { halted: rt.halted, renders: window.renders };
  }, config);
  assert.equal(halted.halted, true, 'runtime stopped fighting the page');
  assert.ok(halted.renders < 200, 'page not stuck in a loop (' + halted.renders + ' renders)');

  await ctx.close();
  console.log('e2e-safety: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
