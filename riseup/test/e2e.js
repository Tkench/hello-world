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
const shot = (page, name, opts) => SHOTS && page.screenshot(Object.assign({ path: path.join(SHOTS, name + '.png') }, opts || {}));

let markers = []; // block codes "pasted" into the stand-in lesson

const MOCK = (editable) => `<!doctype html><html><head><title>Fire Safety Basics | Rise 360</title>
<style>body{font-family:Lato,sans-serif;background:#f3f3f3;margin:0;padding:24px;color:#313537}
.block-wrapper{background:#fff;margin:16px auto;max-width:760px;padding:30px 40px}
.brand--background{background:#d84745;color:#fff}
h2{font-family:Georgia,serif}
.blocks-button__button{display:inline-block;padding:10px 20px;border-radius:4px}
.block-wrapper.dark{background:#1f2430;color:#f0f0f0}</style></head>
<body>${editable ? '' : `<aside class="nav-sidebar" style="position:fixed;left:0;top:0;bottom:0;width:280px;background:#fff;box-shadow:1px 0 0 #ddd;padding:20px">
<a href="#/">Fire Safety Basics</a><br><a href="#/lessons/l1">Welcome</a><br><a href="#/lessons/l2">Spotting hazards</a><br><a href="#/lessons/l3">Reporting</a><br><a href="#/lessons/l4">Fire drills</a></aside>`}
<main style="${editable ? '' : 'margin-left:280px'}"><div class="blocks-lesson">
<section class="block-wrapper" data-block-id="b1"><h2>Fire safety at work</h2>
<p ${editable ? 'contenteditable="true"' : ''} id="para">Fire safety matters. Report every fire safety issue to Acme facilities.</p></section>
${markers.map((m, i) => `<section class="block-wrapper${i === 1 ? ' dark' : ''}" data-block-id="m${i}"><p ${editable ? 'contenteditable="true"' : ''}>${m}</p></section>`).join('\n')}
<section class="block-wrapper" data-block-id="b2"><a class="blocks-button__button brand--background" href="#">Continue</a>
<p><a href="#x">Read the policy</a></p></section>
<section class="block-wrapper" data-block-id="b3"><p>More content below.</p></section>
</div></main></body></html>`;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'riseup-e2e-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium', // new headless mode, which supports extensions
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT],
    viewport: { width: 1360, height: 900 },
  });
  await ctx.route('https://rise.articulate.com/**', (route) => {
    const editable = route.request().url().includes('/author/');
    route.fulfill({ status: 200, contentType: 'text/html', body: MOCK(editable) });
  });
  const errors = [];
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;

  // ================================================================ editor
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('editor: ' + e.message));
  const EDITOR = 'https://rise.articulate.com/author/TESTCOURSE123#/author/details/lesson1';
  await page.goto(EDITOR);
  const host = page.locator('riseup-panel');
  const launcher = host.locator('.launcher');
  await launcher.waitFor();

  // Drag the button to the top left; it should stay there after a reload.
  const lb = await launcher.boundingBox();
  await page.mouse.move(lb.x + 20, lb.y + 15);
  await page.mouse.down();
  await page.mouse.move(300, 200, { steps: 8 });
  await page.mouse.move(40, 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.reload();
  await launcher.waitFor();
  await page.waitForTimeout(300);
  const moved = await launcher.boundingBox();
  assert.ok(moved.x < 40 && moved.y < 40, 'launcher remembered at top left: ' + JSON.stringify(moved));
  await launcher.click();
  const panel = host.locator('.panel');
  await panel.waitFor();
  const pb = await panel.boundingBox();
  assert.ok(pb.y > moved.y && pb.x < 100, 'panel opens below and to the right of a top-left button');

  // ---- Styles
  await panel.locator('summary', { hasText: 'Blocks' }).click();
  await panel.locator('label.field', { hasText: 'Corner radius' }).first().locator('input').fill('16');
  await panel.locator('label.field', { hasText: 'Shadow' }).first().locator('select').selectOption('medium');
  await page.waitForTimeout(400);
  const blockStyle = await page.$eval('[data-block-id="b1"]', (el) => [getComputedStyle(el).borderTopLeftRadius, getComputedStyle(el).boxShadow]);
  assert.equal(blockStyle[0], '16px');
  assert.notEqual(blockStyle[1], 'none');
  await panel.locator('summary', { hasText: 'Scroll animation' }).click();
  await page.waitForTimeout(100); // the other section closes on the toggle event
  assert.equal(await panel.locator('details.acc[open]').count(), 1, 'one section open at a time');
  await panel.locator('label.field', { hasText: 'Blocks appear with' }).locator('select').selectOption('rise');
  await panel.locator('summary', { hasText: 'Course navigation' }).click();
  await panel.locator('label.field', { hasText: 'Menu' }).locator('select').selectOption('topbar');
  await panel.locator('label.field', { hasText: 'Bar colour' }).locator('select').selectOption('dark');
  await panel.locator('summary', { hasText: 'Floating space' }).click();
  await panel.getByLabel('Show a floating space learners can move around').check();
  await shot(page, '1-styles');

  // ---- Text
  await panel.getByRole('tab', { name: 'Text' }).click();
  await panel.getByRole('button', { name: 'New style' }).click();
  await panel.locator('summary', { hasText: 'More effects' }).click();
  for (const [label, hex] of [['Gradient from', '#d84737'], ['Gradient to', '#7837a8']]) {
    const input = panel.locator('label.field', { hasText: label }).locator('input[type=text]');
    await input.fill(hex);
    await input.press('Tab');
  }
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
  assert.deepEqual(hl, [2], 'heading and paragraph occurrences marked in the editor');
  assert.equal(await page.locator('#para span').count(), 0, 'editor DOM is never modified');
  await shot(page, '2-text');

  // ---- Blocks: add flip cards and a stat row, and grab their codes
  await panel.getByRole('tab', { name: 'Blocks' }).click();
  await shot(page, '3-blocks-gallery');
  assert.equal(await panel.locator('.tile strong', { hasText: 'Flip card carousel' }).count(), 1);
  await panel.locator('.tile').filter({ has: page.locator('strong', { hasText: /^Flip cards$/ }) }).click();
  const flipCode = (await panel.locator('.code-box code').textContent()).trim();
  assert.match(flipCode, /^\[\[RiseUp: flipcards [a-z0-9]{6}\]\]$/);
  await panel.locator('.preview .ru-flip').first().waitFor();
  const front = panel.locator('.lf-item').first().locator('textarea').first();
  await front.fill('Fire triangle');
  assert.equal(await panel.locator('.preview .ru-flip-front .ru-flip-text').first().textContent(), 'Fire triangle', 'preview updates as you type');
  await shot(page, '4-block-editor');
  await panel.getByRole('button', { name: '← All blocks' }).click();
  await panel.locator('.tile', { hasText: 'Stat row' }).click();
  const statCode = (await panel.locator('.code-box code').textContent()).trim();
  await panel.getByRole('button', { name: '← All blocks' }).click();
  await panel.locator('.tile').filter({ has: page.locator('strong', { hasText: /^Sort into categories$/ }) }).click();
  const sortCode = (await panel.locator('.code-box code').textContent()).trim();
  await panel.getByRole('button', { name: '← All blocks' }).click();
  assert.equal(await panel.locator('.item').count(), 3);

  // "Paste" the codes into the lesson; chips appear beside them in the editor.
  markers = [flipCode, statCode, '[[RiseUp: hero zzzzzz]]', sortCode];
  await page.reload();
  await host.locator('.chip').nth(3).waitFor();
  assert.deepEqual(await host.locator('.chip').allTextContents(), ['Flip cards', 'Stat row', 'Unknown block', 'Sort into categories']);
  await host.locator('.chip').first().click();
  await host.locator('.panel .code-box code', { hasText: flipCode }).waitFor();
  await shot(page, '5-editor-chips');
  await host.locator('.panel').getByRole('button', { name: 'Close' }).click();

  // ---- Find
  await launcher.click();
  await panel.getByRole('tab', { name: 'Find' }).click();
  await panel.getByLabel('Find', { exact: true }).fill('Acme');
  await panel.getByLabel('Find', { exact: true }).press('Enter');
  await panel.getByText('1 match').waitFor();
  await panel.getByLabel('Replace with').fill('Globex');
  await panel.getByRole('button', { name: 'Replace all' }).click();
  assert.match(await page.textContent('#para'), /Globex facilities/);

  // ---- Colours
  await panel.getByRole('tab', { name: 'Colours' }).click();
  await panel.getByRole('button', { name: '+ Add current' }).click();
  await panel.locator('.swatches .swatch').first().waitFor();
  await panel.locator('summary', { hasText: 'Contrast check' }).click();
  assert.match(await panel.locator('.ratio').textContent(), /^\d+\.\d\d : 1$/);
  await shot(page, '6-colours');

  // ================================================================ preview
  const preview = await ctx.newPage();
  preview.on('pageerror', (e) => errors.push('preview: ' + e.message));
  await preview.goto('https://rise.articulate.com/share/TESTCOURSE123#/lessons/l2');
  await preview.waitForSelector('.ru-c-flipcards .ru-flip');
  assert.equal(await preview.locator('.ru-c').count(), 3, 'known codes become blocks');
  // Sort the cards, check, and the floating score picks it up.
  await preview.locator('.ru-w-chip').waitFor();
  for (let i = 0; i < 6; i++) await preview.locator('.ru-sc-choice').first().click();
  await preview.locator('.ru-c-sortcards button', { hasText: 'Check answers' }).click();
  await preview.locator('.ru-c-sortcards .ru-qfb', { hasText: 'of 6 correct' }).waitFor();
  assert.match(await preview.locator('.ru-w-label').textContent(), /Score\d+ \/ 10/);
  assert.notEqual(await preview.locator('.ru-w-label').textContent(), 'Score0 / 10', 'score recorded');
  assert.equal(await preview.evaluate(() => Array.from(document.querySelectorAll('p')).filter((p) => p.textContent.includes('[[RiseUp') && p.offsetParent !== null).length), 0, 'no codes visible to learners');
  assert.equal(await preview.locator('.ru-c-flipcards .ru-flip-text').first().textContent(), 'Fire triangle');
  await preview.locator('.ru-c-flipcards .ru-flip').first().click();
  assert.equal(await preview.locator('.ru-c-flipcards .ru-flip').first().getAttribute('aria-pressed'), 'true');
  const accent = await preview.$eval('.ru-c', (el) => getComputedStyle(el).getPropertyValue('--ru-accent').trim());
  assert.equal(accent, '#d84745', 'blocks pick up the course theme colour');
  assert.ok(await preview.locator('[data-block-id].ru-anim-rise').count() >= 3, 'blocks animate on scroll');
  // Blocks match the course: heading font, button shape, and dark block backgrounds.
  const look = await preview.$eval('.ru-c-flipcards', (el) => ({
    heading: getComputedStyle(el.querySelector('.ru-flip-front')).fontFamily,
    body: getComputedStyle(el).fontFamily,
    dark: el.classList.contains('ru-on-dark'),
  }));
  assert.match(look.heading, /Georgia/);
  assert.match(look.body, /Lato/);
  assert.equal(look.dark, false);
  assert.equal(await preview.$eval('.ru-c-stats', (el) => el.classList.contains('ru-on-dark')), true, 'block on a dark background adapts');
  assert.equal(await preview.$eval('.ru-c-stats .ru-stat-label', (el) => getComputedStyle(el).color), 'rgba(255, 255, 255, 0.75)');
  assert.equal(await preview.locator('#para span[data-riseup-rule]').count(), 1);
  // Top navigation replaces Rise's sidebar.
  await preview.locator('nav.ru-nav.ru-nav-dark').waitFor();
  assert.equal(await preview.locator('.nav-sidebar').isVisible(), false, 'Rise sidebar hidden');
  assert.equal(await preview.locator('.ru-nav-links [aria-current="page"]').textContent(), 'Spotting hazards');
  assert.ok((await preview.locator('[data-block-id="b1"]').boundingBox()).x < 400, 'content re-centred without the sidebar');
  await preview.locator('.ru-nav-links a', { hasText: 'Reporting' }).click();
  await preview.waitForFunction(() => location.hash === '#/lessons/l3');
  await preview.locator('.ru-nav-links [aria-current="page"]', { hasText: 'Reporting' }).waitFor(); // updates on the hashchange event
  await preview.waitForTimeout(1600);
  await shot(preview, '7-preview', { fullPage: true });

  // ================================================================ tools: publish
  const tools = await ctx.newPage();
  tools.on('pageerror', (e) => errors.push('tools: ' + e.message));
  await tools.goto(`chrome-extension://${extId}/src/tools/tools.html#course=TESTCOURSE123`);
  await tools.locator('#course-summary').getByText('1 text style').waitFor();
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
  assert.match(html, /riseup\/components\.js[\s\S]*riseup\/riseup-runtime\.js/);
  await shot(tools, '8-tools', { fullPage: true });

  // Back up everything, delete the course's settings, restore: the blocks come back.
  const bdl = tools.waitForEvent('download');
  await tools.click('#backup-all');
  const backupPath = await (await bdl).path();
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.equal(backup.courses.TESTCOURSE123.components.length, 3);
  tools.once('dialog', (d) => d.accept());
  await tools.click('#delete');
  await tools.locator('#backup-status', { hasText: 'Deleted' }).waitFor();
  assert.equal(await sw.evaluate(async () => Object.keys(await chrome.storage.local.get('riseup:course:TESTCOURSE123')).length), 0);
  tools.once('dialog', (d) => d.accept());
  await tools.setInputFiles('#restore-input', backupPath);
  await tools.locator('#backup-status', { hasText: 'Restored 1 course' }).waitFor();
  assert.equal(await sw.evaluate(async () => (await chrome.storage.local.get('riseup:course:TESTCOURSE123'))['riseup:course:TESTCOURSE123'].components.length), 3);

  // Open the published course from disk: blocks work without the extension.
  const dir = path.join(profile, 'unzipped');
  for (const [name, f] of Object.entries(patched.files)) {
    if (f.dir) continue;
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), await f.async('nodebuffer'));
  }
  const lms = await ctx.newPage();
  lms.on('pageerror', (e) => errors.push('published: ' + e.message));
  await lms.goto('file://' + path.join(dir, 'scormcontent/index.html'));
  await lms.waitForSelector('.ru-c-stats .ru-stat');
  await lms.locator('nav.ru-nav').waitFor();
  assert.equal(await lms.locator('.nav-sidebar').isVisible(), false);
  assert.equal(await lms.locator('.ru-c').count(), 3);
  await lms.locator('.ru-w-chip').waitFor();
  assert.equal(await lms.$eval('[data-block-id="b1"]', (el) => getComputedStyle(el).borderTopLeftRadius), '16px');

  // ================================================================ popup
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 320, height: 300 });
  await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  await popup.getByRole('button', { name: 'Move the RiseUp button back to the corner' }).click();
  await shot(popup, '9-popup');
  await page.bringToFront();
  await page.waitForTimeout(400);
  const reset = await launcher.boundingBox();
  assert.ok(reset.x > 1000 && reset.y > 800, 'launcher back in the corner: ' + JSON.stringify(reset));

  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('e2e: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
