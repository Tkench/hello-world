(async function () {
  'use strict';
  const RU = window.RiseUp;
  const store = chrome.storage.local;
  const $ = (id) => document.getElementById(id);

  function status(id, text, kind) {
    const el = $(id);
    el.textContent = text;
    el.className = 'status ' + (kind || '');
  }

  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  function dropZone(zoneId, inputId, onFile) {
    const zone = $(zoneId);
    const input = $(inputId);
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.value = ''; });
  }

  // ------------------------------------------------------------ courses
  let courses = {};
  async function loadCourses() {
    const all = await store.get(null);
    courses = {};
    for (const [k, v] of Object.entries(all)) if (k.startsWith(RU.COURSE_KEY_PREFIX)) courses[k.slice(RU.COURSE_KEY_PREFIX.length)] = RU.normalizeCourseConfig(v);
  }

  function selectedId() { return $('course').value; }
  function selected() { return courses[selectedId()] || RU.defaultCourseConfig(); }

  function renderCourses(prefer) {
    const sel = $('course');
    const ids = Object.keys(courses);
    sel.replaceChildren();
    if (!ids.length) {
      sel.append(new Option('No courses yet: open one in Rise and use the RiseUp button', ''));
      sel.disabled = true;
    } else {
      sel.disabled = false;
      for (const id of ids) sel.append(new Option((courses[id].courseTitle || 'Untitled course') + ' · ' + id, id));
      if (prefer && courses[prefer]) sel.value = prefer;
    }
    summarize();
  }

  function summarize() {
    const c = selected();
    const gs = c.globalStyles;
    const styleCount = ['blockRadius', 'blockShadow', 'buttonRadius', 'buttonTextTransform', 'buttonFontWeight', 'headingTextTransform', 'headingFontWeight', 'linkColor', 'linkUnderline', 'imageRadius', 'customCss']
      .filter((k) => gs[k] !== null && gs[k] !== '' && gs[k] !== 'none').length;
    $('course-summary').textContent = selectedId()
      ? styleCount + ' style setting(s), ' + c.fonts.length + ' font(s), ' + c.textStyles.length + ' text style(s), ' + c.textRules.length + ' styled phrase(s).'
      : '';
  }

  $('course').addEventListener('change', summarize);
  await loadCourses();
  const hashCourse = new URLSearchParams(location.hash.slice(1)).get('course');
  renderCourses(hashCourse);

  // ------------------------------------------------------------ publish
  const ownFile = async (path) => (await fetch(chrome.runtime.getURL(path))).text();

  dropZone('zip-drop', 'zip-input', async (file) => {
    if (!selectedId()) return status('zip-status', 'Choose a course first.', 'error');
    const cfg = selected();
    try {
      status('zip-status', 'Reading ' + file.name + '…');
      const zip = await JSZip.loadAsync(file);
      const assets = {
        runtimeJs: await ownFile('src/runtime/riseup-runtime.js'),
        textRulesJs: await ownFile('src/shared/textRules.js'),
        componentsJs: await ownFile('src/shared/components.js'),
        navJs: await ownFile('src/shared/nav.js'),
        componentsMoreJs: await ownFile('src/shared/components-more.js'),
        widgetJs: await ownFile('src/shared/widget.js'),
      };
      if ($('embed-fonts').checked && cfg.fonts.length) {
        status('zip-status', 'Downloading fonts…');
        const faces = await RU.fetchFonts(cfg.fonts);
        assets.fontCss = RU.embeddedFontCss(faces);
        assets.fontFiles = faces.map((f) => ({ name: f.fileName, data: f.data }));
      }
      const result = await RU.patchCourseZip(zip, cfg, assets);
      status('zip-status', 'Building the new zip…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      download(file.name.replace(/\.zip$/i, '') + '-riseup.zip', blob);
      status('zip-status', 'Done. Styling added to ' + result.index + (cfg.fonts.length ? (result.fontsEmbedded ? ', with fonts included' : ', linking fonts from Google Fonts') : '') + '. Upload the downloaded -riseup.zip to your LMS.', 'ok');
    } catch (e) {
      status('zip-status', String(e.message || e), 'error');
    }
  });

  // ------------------------------------------------------------ XLIFF find & replace
  let xlf = null;
  const env = { DOMParser, XMLSerializer };
  const opts = () => ({ matchCase: $('xlf-case').checked, wholeWord: $('xlf-word').checked });
  const updateButtons = () => {
    const ready = Boolean(xlf && $('xlf-find').value);
    $('xlf-preview').disabled = !ready;
    $('xlf-run').disabled = !ready;
  };
  ['xlf-find', 'xlf-replace'].forEach((id) => $(id).addEventListener('input', updateButtons));

  dropZone('xlf-drop', 'xlf-input', async (file) => {
    const text = await file.text();
    try {
      RU.previewXliff(text, '', {}, env); // throws if the file isn't usable XLIFF
      xlf = { name: file.name, text };
      status('xlf-status', 'Loaded ' + file.name + '.', 'ok');
    } catch (e) {
      xlf = null;
      status('xlf-status', String(e.message || e), 'error');
    }
    updateButtons();
  });

  function showMatches(hits, find) {
    const list = $('xlf-matches');
    list.replaceChildren();
    const o = opts();
    for (const hit of hits.slice(0, 300)) {
      const li = document.createElement('li');
      const starts = RU.findMatches(hit.text, find, o);
      let last = 0;
      for (const s of starts) {
        li.append(hit.text.slice(Math.max(last, s - 60), s));
        const m = document.createElement('mark');
        m.textContent = hit.text.slice(s, s + find.length);
        li.append(m);
        last = s + find.length;
      }
      li.append(hit.text.slice(last, last + 60));
      list.append(li);
    }
  }

  $('xlf-preview').addEventListener('click', () => {
    try {
      const find = $('xlf-find').value;
      const hits = RU.previewXliff(xlf.text, find, opts(), env);
      const total = hits.reduce((n, h) => n + h.count, 0);
      status('xlf-status', total + ' match(es) in ' + hits.length + ' text item(s).', total ? 'ok' : '');
      showMatches(hits, find);
    } catch (e) { status('xlf-status', String(e.message || e), 'error'); }
  });

  $('xlf-run').addEventListener('click', () => {
    try {
      const r = RU.replaceInXliff(xlf.text, $('xlf-find').value, $('xlf-replace').value, opts(), env);
      if (!r.count) return status('xlf-status', 'No matches, so no file was made.', 'error');
      download(xlf.name.replace(/(\.xliff?|\.xml)?$/i, '-replaced$1'), r.xml, 'application/xml');
      status('xlf-status', 'Replaced ' + r.count + ' match(es) in ' + r.changedUnits + ' text item(s). Import the downloaded file in Rise’s Translations settings.', 'ok');
      $('xlf-matches').replaceChildren();
    } catch (e) { status('xlf-status', String(e.message || e), 'error'); }
  });

  // ------------------------------------------------------------ backup
  $('export').addEventListener('click', () => {
    if (!selectedId()) return status('backup-status', 'Choose a course first.', 'error');
    const cfg = selected();
    const name = (cfg.courseTitle || selectedId()).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'course';
    download('riseup-' + name + '.json', JSON.stringify({ riseup: RU.CONFIG_VERSION, config: cfg }, null, 2), 'application/json');
    status('backup-status', 'Exported.', 'ok');
  });

  $('import').addEventListener('click', () => {
    if (!selectedId()) return status('backup-status', 'Open the target course in Rise once first, then choose it above.', 'error');
    $('import-input').click();
  });
  $('import-input').addEventListener('change', async () => {
    const file = $('import-input').files[0];
    $('import-input').value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !data.config) throw new Error('This isn’t a RiseUp settings file.');
      const id = selectedId();
      const incoming = RU.normalizeCourseConfig(data.config);
      incoming.courseTitle = courses[id].courseTitle || incoming.courseTitle; // keep the target's name
      if (!confirm('Replace the RiseUp settings of “' + (courses[id].courseTitle || id) + '” with the imported ones?')) return;
      await store.set({ [RU.COURSE_KEY_PREFIX + id]: incoming });
      await loadCourses();
      renderCourses(id);
      status('backup-status', 'Imported. Reload the course in Rise if it’s open.', 'ok');
    } catch (e) { status('backup-status', 'Couldn’t import: ' + (e.message || e), 'error'); }
  });

  $('backup-all').addEventListener('click', async () => {
    const all = await store.get(null);
    const out = {};
    for (const [k, v] of Object.entries(all)) if (k.startsWith(RU.COURSE_KEY_PREFIX)) out[k.slice(RU.COURSE_KEY_PREFIX.length)] = v;
    if (!Object.keys(out).length) return status('backup-status', 'Nothing to back up yet.', 'error');
    download('riseup-backup-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify({ riseup: RU.CONFIG_VERSION, kind: 'backup', savedAt: new Date().toISOString(), courses: out, colors: all[RU.COLORS_KEY] || null }, null, 1), 'application/json');
    await store.set({ 'riseup:lastBackup': Date.now() });
    status('backup-status', 'Backed up ' + Object.keys(out).length + ' course(s).', 'ok');
  });

  $('restore').addEventListener('click', () => $('restore-input').click());
  $('restore-input').addEventListener('change', async () => {
    const file = $('restore-input').files[0];
    $('restore-input').value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const courses = data && data.courses;
      if (!courses || typeof courses !== 'object') throw new Error('This isn\u2019t a RiseUp backup. For a single-course file, choose the course above and use Import.');
      const ids = Object.keys(courses);
      if (!confirm('Restore ' + ids.length + ' course(s) from this backup? Courses already here with the same ID are replaced.')) return;
      const writes = {};
      for (const id of ids) writes[RU.COURSE_KEY_PREFIX + id] = RU.normalizeCourseConfig(courses[id]);
      if (data.colors) writes[RU.COLORS_KEY] = data.colors;
      await store.set(writes);
      await loadCourses();
      renderCourses(ids[0]);
      status('backup-status', 'Restored ' + ids.length + ' course(s). Reload any open Rise tabs.', 'ok');
    } catch (e) { status('backup-status', 'Couldn\u2019t restore: ' + (e.message || e), 'error'); }
  });

  $('delete').addEventListener('click', async () => {
    const id = selectedId();
    if (!id) return;
    if (!confirm('Delete RiseUp’s settings for “' + (courses[id].courseTitle || id) + '”? The Rise course itself isn’t changed.')) return;
    await store.remove(RU.COURSE_KEY_PREFIX + id);
    await loadCourses();
    renderCourses();
    status('backup-status', 'Deleted.', 'ok');
  });
})();
