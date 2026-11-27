/*
 * End-to-end check: loads the unpacked extension in Chromium and drives it
 * against a stand-in Rise page served at rise.articulate.com (no real Rise
 * account is used). Run: node test/e2e.js [screenshotDir]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const JSZip = require('jszip');

const EXT = path.resolve(__dirname, '..');
const SHOTS = process.argv[2];

const MOCK = (editable) => `<!doctype html><html><head><title>Fire Safety Basics | Rise 360</title>
<style>body{font-family:sans-serif;background:#f3f3f3;margin:0;padding:24px}
.block-wrapper{background:#fff;margin:16px auto;max-width:700px;padding:30px}
.blocks-button__button{display:inline-block;background:#28609f;color:#fff;padding:10px 20px}</style></head>
<body><div class="blocks-lesson">
<section class="block-wrapper" data-block-id="b1"><h2>Fire safety at work</h2>
<p ${editable ? 'contenteditable="true"' : ''} id="para">Fire safety matters. Report every fire safety issue to Acme facilities.</p></section>
<section class="block-wrapper" data-block-id="b2"><a class="blocks-button__button" href="#">Continue</a>
<p><a href="#x">Read the policy</a></p><img alt="" width="120" height="60" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Crect width='120' height='60' fill='%23ccc'/%3E%3C/svg%3E"></section>
</div></body></html>`;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'riseup-e2e-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium', // new headless mode, which supports extensions
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT],
    viewport: { width: 1280, height: 860 },
  });
  await ctx.route('https://rise.articulate.com/**', (route) => {
    const editable = route.request().url().includes('/author/');
    route.fulfill({ status: 200, contentType: 'text/html', body: MOCK(editable) });
  });
  const errors = [];
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;

  // ---------------------------------------------------------------- editor
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('editor: ' + e.message));
  await page.goto('https://rise.articulate.com/author/TESTCOURSE123#/author/details/lesson1');
  const host = page.locator('riseup-panel');
  await host.locator('.launcher').click();
  const panel = host.locator('.panel');
  await panel.waitFor();

  // Styles tab
  await panel.locator('label.field', { hasText: 'Corner radius (px)' }).first().locator('input').fill('16');
  await panel.locator('label.field', { hasText: 'Shadow' }).first().locator('select').selectOption('medium');
  await panel.locator('section', { has: page.locator('h2', { hasText: 'Buttons' }) }).locator('input').first().fill('999');
  await page.waitForTimeout(400);
  const blockStyle = await page.$eval('[data-block-id="b1"]', (el) => [getComputedStyle(el).borderTopLeftRadius, getComputedStyle(el).boxShadow]);
  assert.equal(blockStyle[0], '16px');
  assert.notEqual(blockStyle[1], 'none');
  assert.equal(await page.$eval('.blocks-button__button', (el) => getComputedStyle(el).borderTopLeftRadius), '64px', 'button radius clamps to 64');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '1-styles.png') });

  // Text tab: create a style and apply it to selected text
  await panel.getByRole('tab', { name: 'Text' }).click();
  await panel.getByRole('button', { name: 'New style' }).click();
  await panel.locator('label.field', { hasText: 'Gradient from' }).locator('input[type=text]').fill('#d84737');
  await panel.locator('label.field', { hasText: 'Gradient from' }).locator('input[type=text]').press('Tab');
  await panel.locator('label.field', { hasText: 'Gradient to' }).locator('input[type=text]').fill('#7837a8');
  await panel.locator('label.field', { hasText: 'Gradient to' }).locator('input[type=text]').press('Tab');
  await page.evaluate(() => {
    const p = document.getElementById('para');
    const r = document.createRange();
    r.setStart(p.firstChild, 0);
    r.setEnd(p.firstChild, 'Fire safety'.length);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await panel.getByRole('button', { name: 'Apply to selected text' }).click();
  await panel.locator('.status.ok').waitFor();
  await page.waitForTimeout(500);
  const hl = await page.evaluate(() => Array.from(CSS.highlights.keys()).filter((k) => k.startsWith('ru-hl-')).map((k) => CSS.highlights.get(k).size));
  assert.deepEqual(hl, [2], 'heading and paragraph occurrences highlighted in the editor');
  assert.equal(await page.locator('#para span').count(), 0, 'editor DOM is never modified');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '2-text.png') });

  // Find tab: replace inside the editable paragraph
  await panel.getByRole('tab', { name: 'Find' }).click();
  await panel.getByLabel('Find', { exact: true }).fill('Acme');
  await panel.getByLabel('Find', { exact: true }).press('Enter');
  await panel.getByText('1 match').waitFor();
  await panel.getByLabel('Replace with').fill('Globex');
  await panel.getByRole('button', { name: 'Replace all' }).click();
  assert.match(await page.textContent('#para'), /Globex facilities/);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '3-find.png') });

  // Colors tab
  await panel.getByRole('tab', { name: 'Colors' }).click();
  await panel.locator('.ratio').waitFor();
  assert.match(await panel.locator('.ratio').textContent(), /^\d+\.\d\d : 1$/);
  await panel.getByRole('button', { name: '+ Add current' }).click();
  await panel.locator('.swatches .swatch').first().waitFor();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '4-colors.png') });

  // Fonts: add a Google font, use it in the style, check it loads in the editor
  await panel.getByRole('tab', { name: 'Text' }).click();
  await panel.getByPlaceholder('Google Fonts family, e.g. Lora').fill('Lora');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await panel.locator('label.field', { hasText: 'Font' }).first().locator('select').selectOption('Lora');
  await page.waitForFunction(() => document.fonts.check('16px Lora') && Array.from(document.fonts).some((f) => f.family.replace(/"/g, '') === 'Lora' && f.status === 'loaded'), null, { timeout: 20000 });

  // ---------------------------------------------------------------- preview (non-editable): real styling
  const preview = await ctx.newPage();
  preview.on('pageerror', (e) => errors.push('preview: ' + e.message));
  await preview.goto('https://rise.articulate.com/share/TESTCOURSE123#/lessons/1');
  await preview.waitForSelector('#para span[data-riseup-rule]');
  // Match case is on: the heading and the paragraph's "Fire safety", not the lowercase one.
  assert.equal(await preview.locator('span[data-riseup-rule]').count(), 2);
  assert.equal(await preview.locator('h2 span[data-riseup-rule]').count(), 1);
  assert.match(await preview.$eval('#para span', (el) => getComputedStyle(el).backgroundImage), /linear-gradient/);
  if (SHOTS) await preview.screenshot({ path: path.join(SHOTS, '5-preview.png'), clip: { x: 0, y: 0, width: 1280, height: 260 } });

  // ---------------------------------------------------------------- tools page: patch a zip
  const tools = await ctx.newPage();
  tools.on('pageerror', (e) => errors.push('tools: ' + e.message));
  await tools.goto(`chrome-extension://${extId}/src/tools/tools.html#course=TESTCOURSE123`);
  await tools.locator('#course-summary').getByText('1 font(s), 1 text style').waitFor();
  const zip = new JSZip();
  zip.file('index.html', '<html><head></head><body>launcher</body></html>');
  zip.file('scormcontent/index.html', MOCK(false));
  const zipPath = path.join(profile, 'course.zip');
  fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
  const dl = tools.waitForEvent('download');
  await tools.setInputFiles('#zip-input', zipPath);
  const out = await (await dl).path();
  const patched = await JSZip.loadAsync(fs.readFileSync(out));
  const html = await patched.file('scormcontent/index.html').async('string');
  assert.match(html, /riseup\/riseup-runtime\.js/);
  assert.match(await patched.file('scormcontent/riseup/riseup.css').async('string'), /border-radius: 16px/);
  assert.ok(Object.keys(patched.files).some((n) => /^scormcontent\/riseup\/fonts\/lora-.*\.woff2$/.test(n)), 'Lora embedded in the package');
  assert.match(await patched.file('scormcontent/riseup/fonts.css').async('string'), /font-family: 'Lora'/);
  if (SHOTS) await tools.screenshot({ path: path.join(SHOTS, '6-tools.png'), fullPage: true });

  // Open the patched course from disk: the runtime styles the phrase without the extension's help.
  const dir = path.join(profile, 'unzipped');
  for (const [name, f] of Object.entries(patched.files)) {
    if (f.dir) continue;
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), await f.async('nodebuffer'));
  }
  const lms = await ctx.newPage();
  lms.on('pageerror', (e) => errors.push('published: ' + e.message));
  await lms.goto('file://' + path.join(dir, 'scormcontent/index.html'));
  await lms.waitForSelector('#para span.ru-style-' + (await patched.file('scormcontent/riseup/riseup-config.js').async('string')).match(/"styleId":"([^"]+)"/)[1]);
  assert.equal(await lms.$eval('[data-block-id="b1"]', (el) => getComputedStyle(el).borderTopLeftRadius), '16px');

  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('e2e: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
