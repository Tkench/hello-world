/*
 * More RiseUp blocks: sort into categories, complete the sentence, pop-up,
 * collectable, torch hotspots, image blender, conversation scenario and
 * data story. Adds to RiseUp.TYPES from components.js (load that first).
 *
 * Learner progress (scores, collected items) is kept on the learner's device
 * in localStorage, per course, and shared with the floating widget.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports ? require('./components.js') : root.RiseUp;
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RU) {
  const TYPES = RU.TYPES;
  const el = RU._el;
  const shuffled = RU._shuffled;
  const onVisible = RU._onVisible;
  const reducedMotion = RU._reducedMotion;
  const safeUrl = RU.safeUrl;
  const emitScore = RU.emitScore;

  // ------------------------------------------------------------------ progress
  const PROGRESS_PREFIX = 'riseup:progress:';
  // Used when the browser blocks localStorage (some LMS players, private modes):
  // progress then lasts until the page is closed.
  const memory = {};
  const progress = {
    read(win, courseKey) {
      const k = PROGRESS_PREFIX + (courseKey || '');
      try {
        const raw = win.localStorage.getItem(k);
        if (raw) return JSON.parse(raw) || {};
      } catch (e) { /* storage blocked */ }
      return memory[k] ? JSON.parse(memory[k]) : {};
    },
    update(win, courseKey, fn) {
      const k = PROGRESS_PREFIX + (courseKey || '');
      const p = progress.read(win, courseKey);
      p.scores = p.scores || {};
      p.collected = p.collected || {};
      fn(p);
      memory[k] = JSON.stringify(p);
      try { win.localStorage.setItem(k, memory[k]); } catch (e) { /* storage blocked: memory only */ }
      return p;
    },
  };

  const button = (doc, text, cls, onclick, attrs) => el(doc, 'button', Object.assign({ type: 'button', class: 'ru-btn' + (cls ? ' ' + cls : ''), text, onclick }, attrs || {}));

  // ================================================================== Sort into categories
  TYPES.sortcards = {
    label: 'Sort into categories', kind: 'question',
    description: 'Learners read each card and sort it into one of up to four categories. Feedback at the end.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'instructions', label: 'Instructions', type: 'text' },
      { key: 'categories', label: 'Categories (2 to 4)', type: 'list', itemLabel: 'Category', min: 2, max: 4, fields: [
        { key: 'name', label: 'Name', type: 'text' },
      ] },
      { key: 'cards', label: 'Cards', type: 'list', itemLabel: 'Card', min: 2, max: 20, fields: [
        { key: 'text', label: 'Card text', type: 'textarea' },
        { key: 'category', label: 'Correct category', type: 'select', options: [['1', 'Category 1'], ['2', 'Category 2'], ['3', 'Category 3'], ['4', 'Category 4']] },
        { key: 'feedback', label: 'Explanation (shown at the end)', type: 'textarea' },
      ] },
      { key: 'correctFeedback', label: 'Feedback when all correct', type: 'textarea' },
      { key: 'incorrectFeedback', label: 'Feedback when some are wrong', type: 'textarea' },
      { key: 'showAnswers', label: 'Let learners see the answers', type: 'checkbox' },
    ],
    defaults: () => ({ title: 'Meeting or email?', instructions: 'Read each card, then sort it into the right category.', categories: [{ name: 'Schedule a meeting' }, { name: 'Just send an email' }], cards: [
      { text: 'Quarterly project review', category: '1', feedback: 'Reviews need discussion and decisions, so meet.' },
      { text: 'Sharing a status update', category: '2', feedback: 'Updates are one-way: an email is quicker for everyone.' },
      { text: 'Resolving a team conflict', category: '1', feedback: 'Tone matters. Talk it through face to face.' },
      { text: 'Distributing meeting notes', category: '2', feedback: 'Notes are for reading. Send them.' },
      { text: 'Brainstorming new ideas', category: '1', feedback: 'Ideas build on each other best in a live conversation.' },
      { text: 'Requesting a file or link', category: '2', feedback: 'A quick email (or chat) does the job.' },
    ], correctFeedback: 'All sorted correctly. You know when a meeting is worth it.', incorrectFeedback: 'Some cards are in the wrong place. Check the explanations below.', showAnswers: true }),
    render(doc, d, ctx) {
      const cats = (d.categories || []).slice(0, 4).map((c, i) => ({ name: c.name || 'Category ' + (i + 1), index: i }));
      const cards = (d.cards || []).filter((c) => c.text).map((c, i) => ({ text: c.text, cat: Math.max(0, Math.min(cats.length - 1, (Number(c.category) || 1) - 1)), feedback: c.feedback || '', index: i }));
      let queue = shuffled(cards, (ctx && ctx.id) || 's');
      const placed = new Map(); // card index -> category index
      let checked = false;

      const count = el(doc, 'p', { class: 'ru-sc-count', 'aria-live': 'polite' });
      const live = el(doc, 'p', { class: 'ru-sr', 'aria-live': 'assertive' });
      const lanes = cats.map((c) => {
        const list = el(doc, 'ul', { class: 'ru-sc-list' });
        const lane = el(doc, 'div', { class: 'ru-sc-lane', 'data-cat': c.index }, [
          el(doc, 'p', { class: 'ru-sc-head' }, [el(doc, 'span', { class: 'ru-sc-num', text: String(c.index + 1) }), el(doc, 'span', { text: c.name })]),
          el(doc, 'div', { class: 'ru-sc-drop' }, [list, el(doc, 'p', { class: 'ru-sc-empty', text: 'Drop here' })]),
        ]);
        lane.addEventListener('dragover', (e) => { if (!checked) { e.preventDefault(); lane.classList.add('is-over'); } });
        lane.addEventListener('dragleave', () => lane.classList.remove('is-over'));
        lane.addEventListener('drop', (e) => { e.preventDefault(); lane.classList.remove('is-over'); place(c.index); });
        return { lane, list, c };
      });
      const deck = el(doc, 'div', { class: 'ru-sc-deck' });
      const actions = el(doc, 'div', { class: 'ru-actions' });
      const fb = el(doc, 'div', { class: 'ru-qfb', tabindex: '-1', hidden: true });

      function place(catIndex) {
        if (checked || !queue.length) return;
        const card = queue.shift();
        placed.set(card.index, catIndex);
        live.textContent = '“' + card.text + '” placed in ' + cats[catIndex].name + '.';
        draw(true);
      }

      function unplace(cardIndex) {
        if (checked) return;
        placed.delete(cardIndex);
        queue.push(cards.find((c) => c.index === cardIndex));
        draw(true);
      }

      function draw(focusDeck) {
        count.textContent = placed.size + ' of ' + cards.length + ' placed';
        for (const { list, c, lane } of lanes) {
          const mine = cards.filter((k) => placed.get(k.index) === c.index);
          lane.classList.toggle('has-items', mine.length > 0);
          list.replaceChildren(...mine.map((k) => {
            const ok = k.cat === c.index;
            const item = el(doc, 'li', { class: 'ru-sc-item' + (checked ? (ok ? ' is-right' : ' is-wrong') : '') }, [
              checked ? el(doc, 'span', { class: 'ru-sc-mark', 'aria-hidden': 'true', text: ok ? '✓' : '✗' }) : null,
              el(doc, 'span', { text: k.text }),
              checked ? el(doc, 'span', { class: 'ru-sr', text: ok ? ' (correct)' : ' (incorrect)' }) : null,
            ]);
            if (!checked) {
              const back = el(doc, 'button', { type: 'button', class: 'ru-sc-back', 'aria-label': 'Send “' + k.text + '” back', text: '↩' });
              back.addEventListener('click', () => unplace(k.index));
              item.appendChild(back);
            }
            return item;
          }));
        }
        const card = queue[0];
        if (card && !checked) {
          const c = el(doc, 'div', { class: 'ru-sc-card', draggable: 'true', tabindex: '0', role: 'group', 'aria-label': 'Card to sort: ' + card.text + '. Press a category number to place it.' }, [
            el(doc, 'p', { class: 'ru-sc-card-n', text: 'Card ' + (placed.size + 1) + ' of ' + cards.length }),
            el(doc, 'p', { class: 'ru-sc-card-text', text: card.text }),
          ]);
          c.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'card'); c.classList.add('is-drag'); });
          c.addEventListener('dragend', () => c.classList.remove('is-drag'));
          c.addEventListener('keydown', (e) => { const n = Number(e.key); if (n >= 1 && n <= cats.length) { e.preventDefault(); place(n - 1); } });
          const choices = el(doc, 'div', { class: 'ru-sc-choices' }, cats.map((cat) => button(doc, '', 'ru-btn-ghost ru-sc-choice', () => place(cat.index), { 'aria-label': 'Put in ' + cat.name, text: (cat.index + 1) + '  ' + cat.name })));
          deck.replaceChildren(c, el(doc, 'p', { class: 'ru-instr', text: 'Drag the card to a category, choose one below, or press its number.' }), choices);
          if (focusDeck) c.focus({ preventScroll: true });
        } else {
          deck.replaceChildren();
        }
        actions.replaceChildren();
        if (!checked && !queue.length) actions.appendChild(button(doc, 'Check answers', '', check));
        if (checked) {
          const right = cards.filter((k) => placed.get(k.index) === k.cat).length;
          if (right < cards.length) actions.appendChild(button(doc, 'Try again', 'ru-btn-ghost', reset));
          if (right < cards.length && d.showAnswers !== false) actions.appendChild(button(doc, 'Show answers', 'ru-btn-ghost', showAnswers));
        }
      }

      function check() {
        checked = true;
        const right = cards.filter((k) => placed.get(k.index) === k.cat).length;
        const all = right === cards.length;
        const wrong = cards.filter((k) => placed.get(k.index) !== k.cat);
        fb.className = 'ru-qfb is-' + (all ? 'correct' : right ? 'partial' : 'incorrect');
        fb.replaceChildren(...[
          el(doc, 'p', { class: 'ru-qfb-title' }, [el(doc, 'span', { class: 'ru-qfb-icon', 'aria-hidden': 'true', text: all ? '✓' : '!' }), right + ' of ' + cards.length + ' correct']),
          el(doc, 'p', { class: 'ru-qfb-msg', text: (all ? d.correctFeedback : d.incorrectFeedback) || '' }),
          wrong.length ? el(doc, 'ul', { class: 'ru-qfb-list' }, wrong.map((k) => el(doc, 'li', { class: 'is-wrong' }, [
            el(doc, 'strong', { text: k.text + ' → ' + cats[k.cat].name }), k.feedback ? el(doc, 'span', { text: k.feedback }) : null]))) : null,
        ].filter(Boolean));
        fb.hidden = false;
        draw();
        live.textContent = right + ' of ' + cards.length + ' correct.';
        fb.focus({ preventScroll: true });
        emitScore(doc, (ctx && ctx.id) || 'sort', right, cards.length);
      }

      function showAnswers() {
        cards.forEach((k) => placed.set(k.index, k.cat));
        draw();
        actions.replaceChildren();
      }

      function reset() {
        checked = false;
        placed.clear();
        queue = shuffled(cards, Math.random());
        fb.hidden = true;
        draw(true);
      }

      draw();
      return el(doc, 'section', { class: 'ru-sc ru-sc-n' + cats.length }, [
        d.title ? el(doc, 'h3', { class: 'ru-title ru-center', text: d.title }) : null,
        d.instructions ? el(doc, 'p', { class: 'ru-instr ru-center', text: d.instructions }) : null,
        count,
        el(doc, 'div', { class: 'ru-sc-lanes' }, lanes.map((l) => l.lane)),
        deck, fb, actions, live,
      ]);
    },
  };

  // ================================================================== Complete the sentence
  /** "The [fire|smoke] alarm" -> [{ text }, { answers: ['fire', 'smoke'] }, { text }] */
  function parseGaps(text) {
    const parts = [];
    const re = /\[([^\]]+)\]/g;
    let last = 0;
    let m;
    while ((m = re.exec(text || ''))) {
      if (m.index > last) parts.push({ text: text.slice(last, m.index) });
      parts.push({ answers: m[1].split('|').map((s) => s.trim()).filter(Boolean) });
      last = m.index + m[0].length;
    }
    if (last < (text || '').length) parts.push({ text: text.slice(last) });
    return parts;
  }

  TYPES.fillblanks = {
    label: 'Complete the sentence', kind: 'question',
    description: 'Learners drag words into the gaps in a sentence. Gaps can accept more than one word. Feedback at the end.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'text', label: 'Sentence(s): put each gap in [square brackets]; separate words that also fit with |', type: 'textarea' },
      { key: 'distractors', label: 'Extra wrong words for the word bank (comma separated)', type: 'text' },
      { key: 'correctFeedback', label: 'Feedback when all correct', type: 'textarea' },
      { key: 'incorrectFeedback', label: 'Feedback when some are wrong', type: 'textarea' },
      { key: 'showAnswers', label: 'Let learners see the answers', type: 'checkbox' },
    ],
    defaults: () => ({ title: 'Complete the sentences', text: 'If you discover a fire, raise the [alarm] straight away.\nNever use a [lift|elevator] during an evacuation. Go to the [assembly|meeting] point and wait to be counted.', distractors: 'window, stairs, office', correctFeedback: 'All correct. You know exactly what to do.', incorrectFeedback: 'Not quite. The gaps in red need another look.', showAnswers: true }),
    render(doc, d, ctx) {
      const parts = parseGaps(d.text);
      const gaps = parts.filter((p) => p.answers);
      const words = gaps.map((g) => g.answers[0]).concat(String(d.distractors || '').split(',').map((w) => w.trim()).filter(Boolean));
      const bankWords = shuffled(words.map((w, i) => ({ w, i })), (ctx && ctx.id) || 'f');
      let selected = null; // bank word id waiting to be placed by click
      let checked = false;
      const filled = new Map(); // gap index -> bank word id
      const live = el(doc, 'p', { class: 'ru-sr', 'aria-live': 'polite' });
      const bank = el(doc, 'div', { class: 'ru-fb-bank', role: 'group', 'aria-label': 'Word bank' });
      const sentence = el(doc, 'p', { class: 'ru-fb-text' });
      const fb = el(doc, 'div', { class: 'ru-qfb', tabindex: '-1', hidden: true });
      const actions = el(doc, 'div', { class: 'ru-actions' });
      const gapBtns = [];

      let gi = 0;
      for (const p of parts) {
        if (!p.answers) {
          const lines = p.text.split('\n');
          lines.forEach((line, i) => { if (i) sentence.appendChild(el(doc, 'br')); sentence.appendChild(doc.createTextNode(line)); });
          continue;
        }
        const index = gi++;
        const g = el(doc, 'button', { type: 'button', class: 'ru-fb-gap', 'aria-label': 'Gap ' + (index + 1) + ', empty' });
        g.addEventListener('click', () => {
          if (checked) return;
          if (selected !== null) { fill(index, selected); return; }
          if (filled.has(index)) { filled.delete(index); draw(); live.textContent = 'Word returned to the bank.'; }
        });
        g.addEventListener('dragover', (e) => { if (!checked) { e.preventDefault(); g.classList.add('is-over'); } });
        g.addEventListener('dragleave', () => g.classList.remove('is-over'));
        g.addEventListener('drop', (e) => { e.preventDefault(); g.classList.remove('is-over'); const id = Number(e.dataTransfer.getData('text/plain')); if (!Number.isNaN(id)) fill(index, id); });
        gapBtns.push(g);
        sentence.appendChild(g);
      }

      function fill(gapIndex, wordId) {
        for (const [k, v] of filled) if (v === wordId) filled.delete(k); // a word can only be in one gap
        filled.set(gapIndex, wordId);
        selected = null;
        live.textContent = '“' + words[wordId] + '” placed in gap ' + (gapIndex + 1) + '.';
        draw();
      }

      function draw() {
        const used = new Set(filled.values());
        bank.replaceChildren(...bankWords.filter((b) => !used.has(b.i)).map((b) => {
          const chip = el(doc, 'button', { type: 'button', class: 'ru-fb-word' + (selected === b.i ? ' is-selected' : ''), draggable: 'true', 'aria-pressed': String(selected === b.i), text: b.w });
          chip.addEventListener('click', () => { selected = selected === b.i ? null : b.i; draw(); if (selected !== null) live.textContent = '“' + b.w + '” selected. Now choose a gap.'; });
          chip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(b.i)); e.dataTransfer.effectAllowed = 'move'; });
          return chip;
        }));
        if (!bank.children.length) bank.appendChild(el(doc, 'span', { class: 'ru-instr', text: 'All words used.' }));
        gapBtns.forEach((g, i) => {
          const w = filled.has(i) ? words[filled.get(i)] : '';
          g.textContent = w || ' ';
          g.classList.toggle('is-filled', Boolean(w));
          g.classList.toggle('is-target', selected !== null && !checked);
          g.setAttribute('aria-label', 'Gap ' + (i + 1) + (w ? ': ' + w : ', empty'));
          g.classList.remove('is-right', 'is-wrong');
          if (checked) g.classList.add(gaps[i].answers.some((a) => a.toLowerCase() === w.toLowerCase()) ? 'is-right' : 'is-wrong');
          g.disabled = checked;
        });
        actions.replaceChildren();
        if (!checked && filled.size === gaps.length && gaps.length) actions.appendChild(button(doc, 'Check answers', '', check));
        if (checked) {
          const right = gaps.filter((g, i) => g.answers.some((a) => a.toLowerCase() === words[filled.get(i)].toLowerCase())).length;
          if (right < gaps.length) {
            actions.appendChild(button(doc, 'Try again', 'ru-btn-ghost', () => { checked = false; filled.clear(); fb.hidden = true; draw(); }));
            if (d.showAnswers !== false) actions.appendChild(button(doc, 'Show answers', 'ru-btn-ghost', showAnswers));
          }
        }
      }

      function check() {
        checked = true;
        draw();
        const right = gapBtns.filter((g) => g.classList.contains('is-right')).length;
        const all = right === gaps.length;
        fb.className = 'ru-qfb is-' + (all ? 'correct' : right ? 'partial' : 'incorrect');
        fb.replaceChildren(
          el(doc, 'p', { class: 'ru-qfb-title' }, [el(doc, 'span', { class: 'ru-qfb-icon', 'aria-hidden': 'true', text: all ? '✓' : '!' }), right + ' of ' + gaps.length + ' correct']),
          el(doc, 'p', { class: 'ru-qfb-msg', text: (all ? d.correctFeedback : d.incorrectFeedback) || '' }));
        fb.hidden = false;
        fb.focus({ preventScroll: true });
        emitScore(doc, (ctx && ctx.id) || 'fill', right, gaps.length);
      }

      function showAnswers() {
        gapBtns.forEach((g, i) => {
          g.textContent = gaps[i].answers.join(' / ');
          g.classList.remove('is-wrong');
          g.classList.add('is-right', 'is-answer');
        });
        actions.replaceChildren();
      }

      draw();
      return el(doc, 'section', { class: 'ru-fb' }, [
        d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null,
        el(doc, 'p', { class: 'ru-instr', text: 'Drag a word into each gap, or select a word and then a gap. Select a filled gap to send its word back.' }),
        sentence, bank, fb, actions, live,
      ]);
    },
  };

  // ================================================================== Pop-up
  TYPES.popup = {
    label: 'Pop-up', kind: 'interactive',
    description: 'A button, card or link that opens a pop-up box with more to read. Learners close it and carry on.',
    fields: [
      { key: 'triggerStyle', label: 'What learners click', type: 'select', options: [['button', 'Button'], ['card', 'Card'], ['link', 'Text link']] },
      { key: 'triggerText', label: 'Button, card or link text', type: 'text' },
      { key: 'cardText', label: 'Card description (Card only)', type: 'textarea' },
      { key: 'title', label: 'Pop-up title', type: 'text' },
      { key: 'body', label: 'Pop-up text', type: 'textarea' },
      { key: 'image', label: 'Pop-up image (optional)', type: 'image' },
      { key: 'closeText', label: 'Close button text', type: 'text' },
    ],
    defaults: () => ({ triggerStyle: 'card', triggerText: 'Why does this matter?', cardText: 'Select to find out.', title: 'Why it matters', body: 'Most workplace fires start small. What people do in the first two minutes decides how far they spread.\n\nRaising the alarm early is the single most effective thing you can do.', image: '', closeText: 'Got it' }),
    render(doc, d) {
      const id = 'ru-pop-' + Math.random().toString(36).slice(2, 8);
      let overlay = null;
      let opener = null;
      function close() {
        if (!overlay) return;
        overlay.remove();
        overlay = null;
        doc.removeEventListener('keydown', onKey, true);
        if (opener) opener.focus();
      }
      function onKey(e) {
        if (!overlay) return;
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key === 'Tab') { // keep focus inside the pop-up
          const f = Array.from(overlay.querySelectorAll('button, a[href], [tabindex="0"]'));
          if (!f.length) return;
          if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      }
      function open(e) {
        opener = e.currentTarget;
        const rootBlock = opener.closest('.ru-c');
        const img = safeUrl(d.image, 'image');
        const closeBtn = button(doc, d.closeText || 'Close', '', close);
        const dialog = el(doc, 'div', { class: 'ru-pop', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-t' }, [
          el(doc, 'button', { type: 'button', class: 'ru-pop-x', 'aria-label': 'Close', text: '×', onclick: close }),
          img ? el(doc, 'img', { src: img, alt: '', class: 'ru-pop-img' }) : null,
          el(doc, 'div', { class: 'ru-pop-body' }, [
            el(doc, 'h3', { id: id + '-t', class: 'ru-title', text: d.title || '' }),
            el(doc, 'p', { class: 'ru-pop-text', text: d.body || '' }),
            el(doc, 'div', { class: 'ru-actions' }, [closeBtn]),
          ]),
        ]);
        // The pop-up sits on top of the whole page but keeps the block's theme.
        overlay = el(doc, 'div', { class: 'ru-c ru-pop-overlay', 'data-riseup-ignore': '', style: rootBlock ? rootBlock.getAttribute('style') : null }, [dialog]);
        if (rootBlock && rootBlock.classList.contains('ru-on-dark')) overlay.classList.add('ru-pop-from-dark');
        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
        doc.body.appendChild(overlay);
        doc.addEventListener('keydown', onKey, true);
        closeBtn.focus();
      }
      const style = ['button', 'card', 'link'].includes(d.triggerStyle) ? d.triggerStyle : 'button';
      let trigger;
      if (style === 'card') {
        trigger = el(doc, 'button', { type: 'button', class: 'ru-pop-card', 'aria-haspopup': 'dialog', onclick: open }, [
          el(doc, 'span', { class: 'ru-pop-card-icon', 'aria-hidden': 'true', text: 'i' }),
          el(doc, 'span', null, [el(doc, 'strong', { text: d.triggerText || 'Find out more' }), d.cardText ? el(doc, 'span', { class: 'ru-pop-card-sub', text: d.cardText }) : null]),
          el(doc, 'span', { class: 'ru-pop-card-go', 'aria-hidden': 'true', text: '↗' }),
        ]);
      } else if (style === 'link') {
        trigger = el(doc, 'button', { type: 'button', class: 'ru-pop-link', 'aria-haspopup': 'dialog', onclick: open, text: d.triggerText || 'Find out more' });
      } else {
        trigger = button(doc, d.triggerText || 'Find out more', '', open, { 'aria-haspopup': 'dialog' });
      }
      return el(doc, 'section', { class: 'ru-popwrap ru-popwrap-' + style }, [trigger]);
    },
  };

  // ================================================================== Collectable
  TYPES.collect = {
    label: 'Collectable', kind: 'interactive',
    description: 'An item learners collect as they go. Works with the floating Collection space.',
    fields: [
      { key: 'name', label: 'Item name', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'icon', label: 'Icon (an emoji, used when there’s no image)', type: 'text' },
      { key: 'image', label: 'Image (optional)', type: 'image' },
      { key: 'mode', label: 'How it’s collected', type: 'select', options: [['button', 'Learner selects Collect'], ['auto', 'Automatically when it’s seen']] },
      { key: 'message', label: 'Message once collected', type: 'text' },
    ],
    defaults: () => ({ name: 'Fire safety badge', description: 'You’ve completed the hazard spotting lesson.', icon: '🛡️', image: '', mode: 'button', message: 'Added to your collection.' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const id = (ctx && ctx.id) || 'c';
      const key = ctx && ctx.courseKey;
      const img = safeUrl(d.image, 'image');
      const item = { name: d.name || 'Item', icon: d.icon || '⭐', image: img };
      const isCollected = () => Boolean((progress.read(win, key).collected || {})[id]);
      const status = el(doc, 'p', { class: 'ru-col-status', 'aria-live': 'polite' });
      const btn = button(doc, 'Collect', '', () => collect());
      const art = el(doc, 'span', { class: 'ru-col-art', 'aria-hidden': 'true' }, [img ? el(doc, 'img', { src: img, alt: '' }) : el(doc, 'span', { text: item.icon })]);
      const card = el(doc, 'div', { class: 'ru-col' }, [art, el(doc, 'div', { class: 'ru-col-body' }, [
        el(doc, 'p', { class: 'ru-col-kicker', text: 'Collectable' }),
        el(doc, 'h3', { class: 'ru-title', text: item.name }),
        d.description ? el(doc, 'p', { text: d.description }) : null,
        el(doc, 'div', { class: 'ru-actions' }, [btn]), status,
      ])]);
      function show(justNow) {
        const done = isCollected();
        card.classList.toggle('is-collected', done);
        btn.hidden = done || d.mode === 'auto';
        status.textContent = done ? '✓ ' + (justNow ? (d.message || 'Collected.') : 'Collected') : '';
      }
      function collect() {
        if (isCollected()) return;
        progress.update(win, key, (p) => { p.collected[id] = Object.assign({ at: Date.now() }, item); });
        try { doc.dispatchEvent(new win.CustomEvent('riseup:collect', { detail: Object.assign({ id }, item) })); } catch (e) { /* ignore */ }
        card.classList.add('is-popping');
        show(true);
      }
      show(false);
      if (d.mode === 'auto' && !(ctx && ctx.static)) onVisible(win, card, () => setTimeout(collect, 600));
      return el(doc, 'section', { class: 'ru-colwrap' }, [card]);
    },
  };

  // ================================================================== Torch hotspots
  TYPES.torch = {
    label: 'Torch hotspots', kind: 'interactive',
    description: 'A darkened image. Learners shine a torch to find the hidden spots and select them.',
    fields: [
      { key: 'title', label: 'Instructions', type: 'text' },
      { key: 'image', label: 'Image', type: 'image', hotspotTarget: true },
      { key: 'alt', label: 'Image description (alt text)', type: 'text' },
      { key: 'radius', label: 'Torch size', type: 'select', options: [['medium', 'Medium'], ['small', 'Small'], ['large', 'Large']] },
      { key: 'points', label: 'Hidden spots', type: 'list', itemLabel: 'Spot', min: 1, max: 12, fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea' },
        { key: 'x', label: 'Across (%)', type: 'number', min: 0, max: 100 },
        { key: 'y', label: 'Down (%)', type: 'number', min: 0, max: 100 },
      ] },
      { key: 'finish', label: 'Message when all are found', type: 'text' },
    ],
    defaults: () => ({ title: 'The power’s out. Use your torch to find the four safety features.', image: '', alt: '', radius: 'medium', points: [
      { title: 'Emergency lighting', text: 'Comes on automatically in a power cut.', x: 18, y: 22 },
      { title: 'Fire exit', text: 'Always kept clear. Follow the green signs.', x: 78, y: 40 },
      { title: 'Fire extinguisher', text: 'CO₂ for electrical fires.', x: 34, y: 70 },
      { title: 'Call point', text: 'Break the glass to raise the alarm.', x: 64, y: 78 },
    ], finish: 'You found them all. You’d get out safely in the dark.' }),
    render(doc, d) {
      const win = doc.defaultView;
      const img = safeUrl(d.image, 'image');
      const R = { small: 70, medium: 105, large: 150 }[d.radius] || 105;
      const points = d.points || [];
      const found = new Set();
      const stage = el(doc, 'div', { class: 'ru-torch-stage', style: '--ru-tr:' + R + 'px; --ru-tx: 50%; --ru-ty: 50%' }, [
        img ? el(doc, 'img', { src: img, alt: d.alt || '', class: 'ru-hs-img' }) : el(doc, 'div', { class: 'ru-torch-placeholder', role: 'img', 'aria-label': d.alt || 'Scene' }),
      ]);
      const dark = el(doc, 'div', { class: 'ru-torch-dark', 'aria-hidden': 'true' });
      const counter = el(doc, 'p', { class: 'ru-torch-count', 'aria-live': 'polite' });
      const pop = el(doc, 'div', { class: 'ru-hs-pop', role: 'region', 'aria-live': 'polite', hidden: true });
      const pins = points.map((p, i) => {
        const x = Math.min(100, Math.max(0, Number(p.x) || 0));
        const y = Math.min(100, Math.max(0, Number(p.y) || 0));
        const b = el(doc, 'button', { type: 'button', class: 'ru-torch-pin', style: 'left:' + x + '%;top:' + y + '%', 'aria-label': 'Hidden spot ' + (i + 1) + (p.title ? ': ' + p.title : ''), text: '?' });
        b.addEventListener('focus', () => moveTorch(x, y, true));
        b.addEventListener('click', () => {
          found.add(i);
          b.classList.add('is-found');
          b.textContent = '✓';
          pop.replaceChildren(
            el(doc, 'button', { type: 'button', class: 'ru-hs-close', 'aria-label': 'Close', text: '×', onclick: () => { pop.hidden = true; b.focus(); } }),
            el(doc, 'h4', { text: p.title || '' }), el(doc, 'p', { text: p.text || '' }));
          pop.style.top = 'calc(' + y + '% + 24px)';
          pop.style.left = x > 55 ? '' : 'calc(' + x + '% - 20px)';
          pop.style.right = x > 55 ? 'calc(' + (100 - x) + '% - 20px)' : '';
          pop.hidden = false;
          update();
        });
        return { b, x, y };
      });
      pins.forEach((p) => stage.appendChild(p.b));
      stage.append(dark, pop);
      const lights = button(doc, 'Lights on', 'ru-btn-ghost', () => {
        const on = !stage.classList.contains('is-lit');
        stage.classList.toggle('is-lit', on);
        lights.textContent = on ? 'Torch mode' : 'Lights on';
        lights.setAttribute('aria-pressed', String(on));
      }, { 'aria-pressed': 'false' });

      function moveTorch(px, py, inPercent) {
        const r = stage.getBoundingClientRect();
        const x = inPercent ? px : ((px - r.left) / r.width) * 100;
        const y = inPercent ? py : ((py - r.top) / r.height) * 100;
        stage.style.setProperty('--ru-tx', x + '%');
        stage.style.setProperty('--ru-ty', y + '%');
        for (const p of pins) {
          const dx = ((p.x - x) / 100) * r.width;
          const dy = ((p.y - y) / 100) * r.height;
          p.b.classList.toggle('is-near', Math.hypot(dx, dy) < R * 0.85);
        }
      }
      function update() {
        counter.textContent = 'Found ' + found.size + ' of ' + points.length + (found.size === points.length && d.finish ? '. ' + d.finish : '');
        stage.classList.toggle('is-done', found.size === points.length);
      }
      stage.addEventListener('pointermove', (e) => moveTorch(e.clientX, e.clientY));
      stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') moveTorch(e.clientX, e.clientY); });
      stage.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.hidden = true; });
      update();
      return el(doc, 'section', { class: 'ru-torch' }, [
        d.title ? el(doc, 'p', { class: 'ru-instr', text: d.title }) : null,
        stage,
        el(doc, 'div', { class: 'ru-torch-foot' }, [counter, lights]),
      ]);
    },
  };

  // ================================================================== Image blender
  TYPES.blender = {
    label: 'Image blender', kind: 'interactive',
    description: 'Several images that blend into each other as learners move a slider.',
    fields: [
      { key: 'title', label: 'Instructions', type: 'text' },
      { key: 'images', label: 'Images, in order', type: 'list', itemLabel: 'Image', min: 2, max: 6, fields: [
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'label', label: 'Label', type: 'text' },
      ] },
      { key: 'alt', label: 'Describe what changes (alt text)', type: 'text' },
    ],
    defaults: () => ({ title: 'Move the slider to see the site change over the year.', images: [{ image: '', label: 'January' }, { image: '', label: 'April' }, { image: '', label: 'July' }, { image: '', label: 'October' }], alt: '' }),
    render(doc, d) {
      const imgs = (d.images || []).slice(0, 6);
      const n = Math.max(2, imgs.length);
      const layers = imgs.map((it, i) => {
        const src = safeUrl(it.image, 'image');
        return src ? el(doc, 'img', { src, alt: '', class: 'ru-bl-layer' }) : el(doc, 'div', { class: 'ru-bl-layer ru-bl-ph', style: 'filter: hue-rotate(' + (i * 70) + 'deg)' }, [el(doc, 'span', { text: it.label || 'Image ' + (i + 1) })]);
      });
      const range = el(doc, 'input', { type: 'range', min: '0', max: String((n - 1) * 100), value: '0', step: '1', class: 'ru-bl-range', 'aria-label': d.alt || 'Blend between images' });
      const labels = el(doc, 'div', { class: 'ru-bl-labels' }, imgs.map((it, i) => {
        const b = el(doc, 'button', { type: 'button', class: 'ru-bl-label', text: it.label || String(i + 1) });
        b.addEventListener('click', () => animateTo(i * 100));
        return b;
      }));
      const stage = el(doc, 'div', { class: 'ru-bl-stage' }, layers);
      function set(v) {
        const pos = Number(v) / 100;
        layers.forEach((l, i) => { l.style.opacity = String(Math.max(0, Math.min(1, 1 - Math.abs(pos - i)))); });
        Array.from(labels.children).forEach((b, i) => b.classList.toggle('is-active', Math.round(pos) === i));
        range.setAttribute('aria-valuetext', (imgs[Math.round(pos)] && imgs[Math.round(pos)].label) || '');
      }
      let anim = 0;
      function animateTo(target) {
        const win = doc.defaultView;
        if (reducedMotion(win) || !win.requestAnimationFrame) { range.value = String(target); set(target); return; }
        const from = Number(range.value);
        const start = win.performance.now();
        const id = ++anim;
        const tick = (t) => {
          if (id !== anim) return;
          const p = Math.min(1, (t - start) / 600);
          const v = from + (target - from) * (1 - Math.pow(1 - p, 3));
          range.value = String(v);
          set(v);
          if (p < 1) win.requestAnimationFrame(tick);
        };
        win.requestAnimationFrame(tick);
      }
      range.addEventListener('input', () => { anim++; set(range.value); });
      set(0);
      return el(doc, 'section', { class: 'ru-bl' }, [d.title ? el(doc, 'p', { class: 'ru-instr', text: d.title }) : null, stage, el(doc, 'div', { class: 'ru-bl-controls' }, [range, labels])]);
    },
  };

  // ================================================================== Conversation scenario
  const QUALITY = { good: { label: 'Good response', delta: 15 }, okay: { label: 'Okay response', delta: 0 }, poor: { label: 'Poor response', delta: -20 } };

  TYPES.conversation = {
    label: 'Conversation scenario', kind: 'question',
    description: 'A chat or phone call. Learners choose replies turn by turn, with feedback and a trust meter.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      { key: 'mode', label: 'Style', type: 'select', options: [['chat', 'Chat messages'], ['call', 'Phone call']] },
      { key: 'name', label: 'Character name', type: 'text' },
      { key: 'avatar', label: 'Character photo', type: 'image' },
      { key: 'meter', label: 'Meter name', type: 'text' },
      { key: 'start', label: 'Meter starts at (%)', type: 'number', min: 0, max: 100 },
      { key: 'turns', label: 'Turns', type: 'list', itemLabel: 'Turn', min: 1, max: 10, fields: [
        { key: 'message', label: 'What the character says (one message per line)', type: 'textarea' },
        { key: 'options', label: 'Reply options', type: 'list', itemLabel: 'Reply', min: 2, max: 4, fields: [
          { key: 'text', label: 'Reply', type: 'text' },
          { key: 'quality', label: 'Rating', type: 'select', options: [['good', 'Good'], ['okay', 'Okay'], ['poor', 'Poor']] },
          { key: 'feedback', label: 'Feedback', type: 'textarea' },
          { key: 'reaction', label: 'How the character reacts (optional)', type: 'textarea' },
        ] },
      ] },
      { key: 'endGood', label: 'Ending when the meter finishes high (70% or more)', type: 'textarea' },
      { key: 'endOkay', label: 'Ending in the middle', type: 'textarea' },
      { key: 'endPoor', label: 'Ending when it finishes low (under 40%)', type: 'textarea' },
    ],
    defaults: () => ({ title: 'Late delivery call', intro: 'Calm an upset customer and keep their trust. Choose a reply at each turn.', mode: 'chat', name: 'Dana', avatar: '', meter: 'Trust', start: 50, turns: [
      { message: 'My order was supposed to arrive Monday. It’s Thursday and nobody has called me.', options: [
        { text: 'I’m sorry. That’s not good enough, let me find out what happened.', quality: 'good', feedback: 'Apologising and taking ownership calms things down fast.', reaction: 'Thank you. I just want to know where it is.' },
        { text: 'Let me look up your order number.', quality: 'okay', feedback: 'Helpful, but it skips the apology. Acknowledge the delay first.', reaction: 'It’s the same number I gave last time.' },
        { text: 'Deliveries are busy this week.', quality: 'poor', feedback: 'This sounds like an excuse and puts the problem back on the customer.', reaction: 'That’s not my problem.' },
      ] },
      { message: 'So when is it actually going to arrive?', options: [
        { text: 'It’s on the van for tomorrow before 12. I’ll text you the tracking link now.', quality: 'good', feedback: 'A specific time and a way to check builds confidence.', reaction: 'OK, that helps. Thanks.' },
        { text: 'It should be with you soon.', quality: 'poor', feedback: '“Soon” is vague, and vague answers lose trust.', reaction: 'You said that on Monday.' },
        { text: 'I’ll call you back once I’ve checked.', quality: 'okay', feedback: 'Following up is good, but give a time so they’re not left waiting again.', reaction: 'Please do. Today.' },
      ] },
    ], endGood: 'Dana’s happy. You owned the problem and gave her something concrete.', endOkay: 'Dana’s calmer, but not convinced. Apologise early and be specific.', endPoor: 'Dana’s still upset and may complain. Start with an apology, then give a clear plan.' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const call = d.mode === 'call';
      const name = d.name || 'Customer';
      const avatar = safeUrl(d.avatar, 'image');
      const turns = (d.turns || []).filter((t) => t && (t.message || (t.options || []).length));
      const start = Math.max(0, Math.min(100, Number(d.start === undefined ? 50 : d.start)));
      let meter = start;
      let turn = 0;
      let timer = null;
      const slow = !reducedMotion(win) && !(ctx && ctx.static);

      const fill = el(doc, 'span', { class: 'ru-cv-fill' });
      const pct = el(doc, 'span', { class: 'ru-cv-pct' });
      const mood = el(doc, 'span', { class: 'ru-cv-mood' });
      const bar = el(doc, 'div', { class: 'ru-cv-meter' }, [el(doc, 'span', { class: 'ru-cv-meter-name', text: d.meter || 'Trust' }), el(doc, 'span', { class: 'ru-cv-track', role: 'meter', 'aria-label': d.meter || 'Trust', 'aria-valuemin': '0', 'aria-valuemax': '100' }, [fill]), pct, mood]);
      const log = el(doc, 'div', { class: 'ru-cv-log', role: 'log', 'aria-live': 'polite' });
      const choices = el(doc, 'div', { class: 'ru-cv-choices' });
      const clock = el(doc, 'span', { class: 'ru-cv-clock', text: '00:00' });

      const face = () => el(doc, 'span', { class: 'ru-cv-avatar', 'aria-hidden': 'true' }, [avatar ? el(doc, 'img', { src: avatar, alt: '' }) : el(doc, 'span', { text: name.charAt(0).toUpperCase() })]);
      function moodWord() { return meter >= 70 ? 'Happy' : meter >= 40 ? 'Neutral' : 'Upset'; }
      function drawMeter() {
        fill.style.width = meter + '%';
        fill.className = 'ru-cv-fill ' + (meter >= 70 ? 'is-high' : meter >= 40 ? 'is-mid' : 'is-low');
        pct.textContent = Math.round(meter) + '%';
        mood.textContent = 'Mood: ' + moodWord();
        bar.querySelector('[role=meter]').setAttribute('aria-valuenow', String(Math.round(meter)));
      }
      function scrollLog() { log.scrollTop = log.scrollHeight; }
      function say(text, who) {
        const mine = who === 'you';
        const row = el(doc, 'div', { class: 'ru-cv-row ' + (mine ? 'is-you' : 'is-them') }, [
          mine ? null : face(),
          el(doc, 'p', { class: 'ru-cv-bubble' }, [el(doc, 'span', { class: 'ru-sr', text: (mine ? 'You' : name) + ': ' }), text]),
          mine ? el(doc, 'span', { class: 'ru-cv-you', 'aria-hidden': 'true', text: 'You' }) : null,
        ]);
        log.appendChild(row);
        scrollLog();
      }
      function typing() {
        const t = el(doc, 'div', { class: 'ru-cv-row is-them ru-cv-typing', 'aria-hidden': 'true' }, [face(), el(doc, 'p', { class: 'ru-cv-bubble' }, [el(doc, 'span'), el(doc, 'span'), el(doc, 'span')])]);
        log.appendChild(t);
        scrollLog();
        return t;
      }
      /** Character messages appear one by one, with a typing indicator. */
      function speak(text, then) {
        const lines = String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
        let i = 0;
        const next = () => {
          if (i >= lines.length) return then && then();
          if (!slow) { say(lines[i++], 'them'); return next(); }
          const t = typing();
          setTimeout(() => { t.remove(); say(lines[i++], 'them'); next(); }, 700 + Math.min(900, lines[i].length * 12));
        };
        next();
      }
      function offer() {
        const t = turns[turn];
        choices.replaceChildren(el(doc, 'p', { class: 'ru-cv-prompt', text: 'Choose your reply' }), el(doc, 'div', { class: 'ru-cv-opts' },
          (t.options || []).filter((o) => o.text).map((o) => button(doc, o.text, 'ru-cv-opt', () => choose(o)))));
        const first = choices.querySelector('button');
        if (first && turn > 0) first.focus({ preventScroll: true });
      }
      function choose(o) {
        choices.replaceChildren();
        say(o.text, 'you');
        const q = QUALITY[o.quality] || QUALITY.okay;
        meter = Math.max(0, Math.min(100, meter + q.delta));
        drawMeter();
        log.appendChild(el(doc, 'div', { class: 'ru-cv-fb is-' + (o.quality || 'okay') }, [
          el(doc, 'p', { class: 'ru-cv-fb-title' }, [el(doc, 'span', { class: 'ru-cv-dot', 'aria-hidden': 'true' }), q.label]),
          o.feedback ? el(doc, 'p', { text: o.feedback }) : null]));
        scrollLog();
        turn++;
        const after = () => (turn < turns.length ? speak(turns[turn].message, offer) : finish());
        if (o.reaction) speak(o.reaction, after); else after();
      }
      function finish() {
        const msg = meter >= 70 ? d.endGood : meter >= 40 ? d.endOkay : d.endPoor;
        if (timer) win.clearInterval(timer);
        choices.replaceChildren(el(doc, 'div', { class: 'ru-cv-end' }, [
          el(doc, 'p', { class: 'ru-cv-end-title', text: (call ? 'Call ended' : 'Conversation over') + ' · ' + (d.meter || 'Trust') + ' ' + Math.round(meter) + '%' }),
          msg ? el(doc, 'p', { text: msg }) : null,
          button(doc, 'Try again', 'ru-cv-opt', restart),
        ]));
        emitScore(doc, (ctx && ctx.id) || 'conv', Math.round(meter), 100);
      }
      function restart() {
        meter = start; turn = 0;
        log.replaceChildren();
        drawMeter();
        begin();
      }
      function begin() {
        if (call) {
          if (timer) win.clearInterval(timer);
          const t0 = Date.now();
          timer = win.setInterval(() => {
            if (!clock.isConnected) { win.clearInterval(timer); return; }
            const s = Math.floor((Date.now() - t0) / 1000);
            clock.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
          }, 1000);
        }
        if (turns.length) speak(turns[0].message, offer);
      }

      drawMeter();
      const startBtn = button(doc, call ? 'Answer the call' : 'Start', 'ru-cv-opt ru-cv-start', () => { startBtn.remove(); begin(); });
      choices.appendChild(startBtn);
      return el(doc, 'section', { class: 'ru-cv ru-cv-' + (call ? 'call' : 'chat') }, [
        el(doc, 'header', { class: 'ru-cv-head' }, [
          call ? el(doc, 'div', { class: 'ru-cv-caller' }, [face(), el(doc, 'span', null, [el(doc, 'strong', { text: name }), el(doc, 'span', { class: 'ru-cv-status' }, ['On call · ', clock])])]) : null,
          d.title ? el(doc, 'h3', { class: 'ru-title', text: d.title }) : null,
          d.intro ? el(doc, 'p', { class: 'ru-cv-intro', text: d.intro }) : null,
          bar,
        ]),
        log, choices,
      ]);
    },
  };

  // ================================================================== Data story
  TYPES.chart = {
    label: 'Data story', kind: 'template',
    description: 'A chart that builds as learners scroll to it, with a highlighted headline, data point and callout.',
    fields: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'headline', label: 'Headline', type: 'text' },
      { key: 'highlight', label: 'Words in the headline to highlight', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'chartType', label: 'Chart', type: 'select', options: [['donut', 'Donut'], ['columns', 'Columns'], ['bars', 'Horizontal bars']] },
      { key: 'style', label: 'Look', type: 'select', options: [['bold', 'Bold (course colour background)'], ['light', 'Light']] },
      { key: 'items', label: 'Data', type: 'list', itemLabel: 'Value', min: 2, max: 8, fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'value', label: 'Value', type: 'number', min: 0, max: 1000000000 },
      ] },
      { key: 'focus', label: 'Label to highlight', type: 'text' },
      { key: 'suffix', label: 'Unit after numbers (eg %)', type: 'text' },
      { key: 'callout', label: 'Callout (put *stars* around words to highlight)', type: 'textarea' },
      { key: 'note', label: 'Source or note', type: 'text' },
    ],
    defaults: () => ({ tag: 'Q3 support review', headline: 'Login issues drove most support tickets', highlight: 'Login issues', subtitle: 'Tickets by product area, July to September', chartType: 'donut', style: 'bold', items: [
      { label: 'Billing', value: 15.2 }, { label: 'Login', value: 42.8 }, { label: 'Shipping', value: 20.7 }, { label: 'Returns', value: 12 }, { label: 'Account', value: 9.4 },
    ], focus: 'Login', suffix: '%', callout: 'More than billing and shipping *combined*.', note: 'Sample data for demonstration' }),
    render(doc, d, ctx) {
      const win = doc.defaultView;
      const NS = 'http://www.w3.org/2000/svg';
      const items = (d.items || []).filter((i) => i && i.label !== undefined).map((i) => ({ label: String(i.label || ''), value: Math.max(0, Number(i.value) || 0) }));
      const total = items.reduce((a, b) => a + b.value, 0) || 1;
      const max = Math.max(...items.map((i) => i.value), 1);
      const focusIdx = Math.max(0, items.findIndex((i) => i.label.toLowerCase() === String(d.focus || '').toLowerCase()));
      const suffix = d.suffix || '';
      const decimals = Math.max(0, ...items.map((i) => (String(i.value).split('.')[1] || '').length));
      const fmt = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
      const svgEl = (tag, attrs) => { const e = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); return e; };

      // Headline with highlighted words.
      const headline = el(doc, 'h3', { class: 'ru-ds-headline' });
      const hl = String(d.highlight || '').trim();
      const hi = hl ? String(d.headline || '').toLowerCase().indexOf(hl.toLowerCase()) : -1;
      if (hi >= 0) headline.append(d.headline.slice(0, hi), el(doc, 'mark', { class: 'ru-ds-mark', text: d.headline.slice(hi, hi + hl.length) }), d.headline.slice(hi + hl.length));
      else headline.textContent = d.headline || '';

      let chart;
      const numbers = []; // [element, value] counted up when built
      if (d.chartType === 'columns' || d.chartType === 'bars') {
        const horizontal = d.chartType === 'bars';
        chart = el(doc, 'div', { class: 'ru-ds-bars' + (horizontal ? ' is-h' : ''), role: 'img', 'aria-label': (d.subtitle || 'Chart') + ': ' + items.map((i) => i.label + ' ' + fmt(i.value)).join(', ') },
          items.map((it, i) => {
            const v = el(doc, 'span', { class: 'ru-ds-val', text: fmt(0) });
            numbers.push([v, it.value]);
            return el(doc, 'div', { class: 'ru-ds-bar' + (i === focusIdx ? ' is-focus' : ''), style: '--ru-v:' + (it.value / max) + '; --ru-i:' + i, 'aria-hidden': 'true' }, [
              el(doc, 'span', { class: 'ru-ds-track' }, [el(doc, 'span', { class: 'ru-ds-fill' }), horizontal ? null : v]),
              horizontal ? v : null,
              el(doc, 'span', { class: 'ru-ds-label', text: it.label }),
            ]);
          }));
      } else {
        const R = 70;
        const C = 2 * Math.PI * R;
        const svg = svgEl('svg', { viewBox: '0 0 200 200', class: 'ru-ds-donut', 'aria-hidden': 'true' });
        let offset = 0;
        const gap = items.length > 1 ? 3 : 0;
        items.forEach((it, i) => {
          const len = (it.value / total) * C;
          const seg = svgEl('circle', { cx: 100, cy: 100, r: R, fill: 'none', 'stroke-width': i === focusIdx ? 30 : 24, class: 'ru-ds-seg' + (i === focusIdx ? ' is-focus' : ''),
            'stroke-dasharray': Math.max(0, len - gap) + ' ' + C, 'stroke-dashoffset': -offset, transform: 'rotate(-90 100 100)', style: '--ru-len:' + Math.max(0, len - gap) + '; --ru-c:' + C + '; --ru-i:' + i });
          svg.appendChild(seg);
          offset += len;
        });
        const centre = el(doc, 'span', { class: 'ru-ds-centre-val', text: fmt(0) });
        numbers.push([centre, items[focusIdx] ? items[focusIdx].value : 0]);
        chart = el(doc, 'div', { class: 'ru-ds-donutwrap', role: 'img', 'aria-label': (d.subtitle || 'Chart') + ': ' + items.map((i) => i.label + ' ' + fmt(i.value)).join(', ') }, [svg,
          el(doc, 'span', { class: 'ru-ds-centre', 'aria-hidden': 'true' }, [centre, el(doc, 'span', { class: 'ru-ds-centre-label', text: items[focusIdx] ? items[focusIdx].label : '' })])]);
      }
      const legend = d.chartType === 'donut' || !d.chartType
        ? el(doc, 'ul', { class: 'ru-ds-legend' }, items.map((it, i) => el(doc, 'li', { class: i === focusIdx ? 'is-focus' : '', style: '--ru-i:' + i }, [el(doc, 'span', { class: 'ru-ds-dot', 'aria-hidden': 'true' }), el(doc, 'span', { class: 'ru-ds-lname', text: it.label }), el(doc, 'strong', { text: fmt(it.value) })])))
        : null;
      const callout = d.callout ? el(doc, 'p', { class: 'ru-ds-callout' }, String(d.callout).split(/\*([^*]+)\*/).map((part, i) => (i % 2 ? el(doc, 'mark', { text: part }) : part))) : null;

      const root = el(doc, 'section', { class: 'ru-ds ru-ds-' + (d.style === 'light' ? 'light' : 'bold') + ' ru-ds-' + (d.chartType || 'donut') }, [
        el(doc, 'span', { class: 'ru-ds-blob', 'aria-hidden': 'true' }),
        d.tag ? el(doc, 'p', { class: 'ru-ds-tag', text: d.tag }) : null,
        headline,
        d.subtitle ? el(doc, 'p', { class: 'ru-ds-sub', text: d.subtitle }) : null,
        el(doc, 'div', { class: 'ru-ds-body' }, [chart, (legend || callout) ? el(doc, 'div', { class: 'ru-ds-side' }, [legend, callout]) : null]),
        d.note ? el(doc, 'p', { class: 'ru-ds-note', text: d.note }) : null,
      ]);

      const build = () => {
        root.classList.add('is-built');
        const dur = 1300;
        if (reducedMotion(win) || !win.requestAnimationFrame) { numbers.forEach(([e, v]) => { e.textContent = fmt(v); }); return; }
        const t0 = win.performance.now();
        const tick = (t) => {
          const p = Math.min(1, (t - t0) / dur);
          const k = 1 - Math.pow(1 - p, 3);
          numbers.forEach(([e, v]) => { e.textContent = fmt(v * k); });
          if (p < 1) win.requestAnimationFrame(tick);
        };
        win.requestAnimationFrame(tick);
      };
      if (ctx && ctx.static) { root.classList.add('is-built'); numbers.forEach(([e, v]) => { e.textContent = fmt(v); }); }
      else onVisible(win, root, build);
      return root;
    },
  };

  // ------------------------------------------------------------------ styles
  const MORE_CSS = `
.ru-c .ru-center { text-align: center; }
/* Sort into categories */
.ru-c .ru-sc-count { text-align: center; font-weight: 700; color: var(--ru-muted); margin: 6px 0 14px; }
.ru-c .ru-sc-lanes { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); }
.ru-c .ru-sc-n3 .ru-sc-lanes { grid-template-columns: repeat(3, 1fr); }
.ru-c .ru-sc-n4 .ru-sc-lanes { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 640px) { .ru-c .ru-sc-lanes { grid-template-columns: 1fr 1fr !important; } }
.ru-c .ru-sc-lane { border-radius: var(--ru-radius); background: var(--ru-soft); overflow: hidden; transition: box-shadow .15s, transform .15s; }
.ru-c .ru-sc-lane.is-over { box-shadow: 0 0 0 3px var(--ru-accent); transform: scale(1.01); }
.ru-c .ru-sc-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--ru-accent); color: var(--ru-accent-ink); font-weight: 800; font-family: var(--ru-heading-font, inherit); }
.ru-c .ru-sc-lane:nth-child(2) .ru-sc-head { background: color-mix(in srgb, var(--ru-accent) 70%, #1d2330); color: #fff; }
.ru-c .ru-sc-lane:nth-child(3) .ru-sc-head { background: color-mix(in srgb, var(--ru-accent) 45%, #ffffff); color: #1d2330; }
.ru-c .ru-sc-lane:nth-child(4) .ru-sc-head { background: color-mix(in srgb, var(--ru-accent) 35%, #1d2330); color: #fff; }
.ru-c .ru-sc-num { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; border: 2px solid currentColor; font-size: .85em; flex: none; }
.ru-c .ru-sc-drop { min-height: 96px; margin: 10px; padding: 8px; border: 2px dashed var(--ru-line); border-radius: calc(var(--ru-radius) - 4px); display: flex; flex-direction: column; justify-content: center; }
.ru-c .ru-sc-lane.has-items .ru-sc-empty { display: none; }
.ru-c .ru-sc-empty { text-align: center; color: var(--ru-muted); }
.ru-c .ru-sc-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.ru-c .ru-sc-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--ru-card); box-shadow: 0 2px 6px rgba(0,0,0,.06); font-size: .95em; animation: ru-in .3s ease; }
.ru-c .ru-sc-item > span:first-child { flex: 1; }
.ru-c .ru-sc-item.is-right { box-shadow: inset 3px 0 0 #1d7a46; } .ru-c .ru-sc-item.is-wrong { box-shadow: inset 3px 0 0 #b3261e; }
.ru-c .ru-sc-mark { flex: none !important; font-weight: 800; } .ru-c .is-right .ru-sc-mark { color: #1d7a46; } .ru-c .is-wrong .ru-sc-mark { color: #b3261e; }
.ru-c .ru-sc-back { border: 0; background: none; color: var(--ru-muted); cursor: pointer; font-size: 1.1em; }
.ru-c .ru-sc-deck { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 18px; }
.ru-c .ru-sc-deck:empty { display: none; }
.ru-c .ru-sc-card { width: min(380px, 100%); padding: 22px 24px; border-radius: var(--ru-radius); background: var(--ru-card); box-shadow: 0 2px 0 var(--ru-line), 0 14px 34px rgba(0,0,0,.12); text-align: center; cursor: grab; animation: ru-deal .4s cubic-bezier(.2,.8,.2,1); }
.ru-c .ru-sc-card.is-drag { opacity: .5; }
.ru-c .ru-sc-card:focus-visible { outline: 3px solid var(--ru-accent); outline-offset: 3px; }
@keyframes ru-deal { from { opacity: 0; transform: translateY(18px) rotate(-2deg) scale(.96); } to { opacity: 1; transform: none; } }
.ru-c .ru-sc-card-n { font-size: .78em; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--ru-accent); margin-bottom: 6px; }
.ru-c .ru-sc-card-text { font-size: 1.2em; font-weight: 700; font-family: var(--ru-heading-font, inherit); white-space: pre-line; }
.ru-c .ru-sc-choices { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.ru-c .ru-sc-choice { padding: 8px 16px; }

/* Complete the sentence */
.ru-c .ru-fb-text { font-size: 1.15em; line-height: 2.4; }
.ru-c .ru-fb-gap { display: inline-block; min-width: 110px; height: 40px; margin: 0 4px; padding: 0 14px; vertical-align: middle; border: 2px dashed var(--ru-accent); border-radius: 10px; background: var(--ru-soft); color: var(--ru-ink); font: inherit; font-weight: 700; line-height: 36px; cursor: pointer; transition: background .15s, transform .15s; }
.ru-c .ru-fb-gap.is-filled { border-style: solid; background: var(--ru-card); }
.ru-c .ru-fb-gap.is-target { animation: ru-wiggle 1.2s ease-in-out infinite; }
.ru-c .ru-fb-gap.is-over { background: color-mix(in srgb, var(--ru-accent) 15%, var(--ru-card)); transform: scale(1.04); }
.ru-c .ru-fb-gap.is-right { border-color: #1d7a46; background: color-mix(in srgb, #1d7a46 10%, var(--ru-card)); }
.ru-c .ru-fb-gap.is-wrong { border-color: #b3261e; background: color-mix(in srgb, #b3261e 8%, var(--ru-card)); }
.ru-c .ru-fb-gap:disabled { cursor: default; }
@keyframes ru-wiggle { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ru-accent) 0%, transparent); } 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--ru-accent) 25%, transparent); } }
.ru-c .ru-fb-bank { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 4px; padding: 16px; border-radius: var(--ru-radius); background: var(--ru-soft); }
.ru-c .ru-fb-word { padding: 9px 16px; border: 0; border-radius: 999px; background: var(--ru-card); color: var(--ru-ink); font: inherit; font-weight: 700; cursor: grab; box-shadow: 0 2px 6px rgba(0,0,0,.08); transition: transform .12s, box-shadow .12s; }
.ru-c .ru-fb-word:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,.12); }
.ru-c .ru-fb-word.is-selected { background: var(--ru-accent); color: var(--ru-accent-ink); }

/* Pop-up */
.ru-c .ru-pop-card { display: flex; align-items: center; gap: 16px; width: 100%; padding: 18px 20px; border: 0; border-radius: var(--ru-radius); background: var(--ru-soft); color: var(--ru-ink); font: inherit; text-align: left; cursor: pointer; box-shadow: inset 4px 0 0 var(--ru-accent); transition: transform .15s, box-shadow .15s; }
.ru-c .ru-pop-card:hover { transform: translateY(-2px); box-shadow: inset 4px 0 0 var(--ru-accent), 0 10px 24px rgba(0,0,0,.1); }
.ru-c .ru-pop-card > span:nth-child(2) { flex: 1; display: flex; flex-direction: column; }
.ru-c .ru-pop-card strong { font-size: 1.1em; font-family: var(--ru-heading-font, inherit); }
.ru-c .ru-pop-card-sub { color: var(--ru-muted); }
.ru-c .ru-pop-card-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--ru-accent); color: var(--ru-accent-ink); font: italic 800 20px/1 Georgia, serif; flex: none; }
.ru-c .ru-pop-card-go { font-size: 1.3em; color: var(--ru-accent); }
.ru-c .ru-pop-link { border: 0; padding: 0; background: none; color: var(--ru-accent); font: inherit; font-weight: 700; text-decoration: underline dotted 2px; text-underline-offset: 4px; cursor: pointer; }
.ru-pop-overlay.ru-c { position: fixed; inset: 0; z-index: 2147483100; margin: 0; display: grid; place-items: center; padding: 20px; background: rgba(10,12,18,.55); backdrop-filter: blur(3px); animation: ru-fade .2s ease; }
@keyframes ru-fade { from { opacity: 0; } to { opacity: 1; } }
.ru-c .ru-pop { position: relative; width: min(560px, 100%); max-height: calc(100vh - 40px); overflow: auto; border-radius: calc(var(--ru-radius) + 4px); background: #fff; color: #1d2330; box-shadow: 0 30px 80px rgba(0,0,0,.35); animation: ru-pop .3s cubic-bezier(.2,.8,.2,1); }
@keyframes ru-pop { from { opacity: 0; transform: translateY(16px) scale(.97); } to { opacity: 1; transform: none; } }
.ru-c .ru-pop-img { width: 100%; max-height: 260px; object-fit: cover; }
.ru-c .ru-pop-body { padding: 26px 28px 24px; border-top: 5px solid var(--ru-accent); }
.ru-c .ru-pop-text { white-space: pre-line; }
.ru-c .ru-pop-x { position: absolute; top: 10px; right: 12px; z-index: 1; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(255,255,255,.9); color: #1d2330; font-size: 22px; cursor: pointer; }

/* Collectable */
.ru-c .ru-col { display: flex; align-items: center; gap: 20px; padding: 20px; border-radius: var(--ru-radius); background: var(--ru-soft); border: 2px dashed var(--ru-line); transition: border-color .3s, background .3s; }
.ru-c .ru-col.is-collected { border-style: solid; border-color: var(--ru-accent); background: color-mix(in srgb, var(--ru-accent) 8%, var(--ru-card)); }
.ru-c .ru-col-art { display: grid; place-items: center; width: 84px; height: 84px; flex: none; border-radius: 50%; background: var(--ru-card); font-size: 42px; box-shadow: 0 6px 16px rgba(0,0,0,.1); overflow: hidden; filter: grayscale(.9); opacity: .7; transition: filter .4s, opacity .4s, transform .4s; }
.ru-c .ru-col-art img { width: 100%; height: 100%; object-fit: cover; }
.ru-c .is-collected .ru-col-art { filter: none; opacity: 1; }
.ru-c .is-popping .ru-col-art { animation: ru-collect .7s cubic-bezier(.2,.8,.2,1.4); }
@keyframes ru-collect { 0% { transform: scale(1); } 40% { transform: scale(1.25) rotate(-8deg); } 100% { transform: scale(1); } }
.ru-c .ru-col-kicker { font-size: .75em; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; color: var(--ru-accent); }
.ru-c .ru-col .ru-title { margin: 2px 0 4px; }
.ru-c .ru-col .ru-actions { margin-top: 10px; }
.ru-c .ru-col-status { font-weight: 700; color: var(--ru-accent); }
.ru-c .ru-col-status:empty { display: none; }

/* Torch */
.ru-c .ru-torch-stage { position: relative; overflow: hidden; border-radius: var(--ru-radius); cursor: none; touch-action: none; background: #222; }
.ru-c .ru-torch-placeholder { aspect-ratio: 16 / 9; background: radial-gradient(circle at 20% 30%, #6b7d92, transparent 40%), radial-gradient(circle at 75% 60%, #8f6b5d, transparent 45%), linear-gradient(160deg, #46505e, #2c3138); }
.ru-c .ru-torch-dark { position: absolute; inset: 0; pointer-events: none; background: rgba(4,6,10,.94);
  -webkit-mask-image: radial-gradient(circle var(--ru-tr) at var(--ru-tx) var(--ru-ty), transparent 0, transparent 55%, #000 100%);
  mask-image: radial-gradient(circle var(--ru-tr) at var(--ru-tx) var(--ru-ty), transparent 0, transparent 55%, #000 100%); transition: opacity .5s; }
.ru-c .ru-torch-stage.is-lit, .ru-c .ru-torch-stage.is-done { cursor: default; }
.ru-c .ru-torch-stage.is-lit .ru-torch-dark, .ru-c .ru-torch-stage.is-done .ru-torch-dark { opacity: 0; }
.ru-c .ru-torch-pin { position: absolute; z-index: 2; transform: translate(-50%, -50%) scale(.6); width: 40px; height: 40px; border-radius: 50%; border: 3px solid #fff; background: var(--ru-accent); color: var(--ru-accent-ink); font: 800 16px/1 system-ui, sans-serif; cursor: pointer; opacity: 0; transition: opacity .25s, transform .25s; }
.ru-c .ru-torch-pin.is-near, .ru-c .ru-torch-pin:focus-visible, .ru-c .is-lit .ru-torch-pin, .ru-c .ru-torch-pin.is-found { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.ru-c .ru-torch-pin.is-found { background: #1d7a46; color: #fff; }
.ru-c .ru-torch-stage .ru-hs-pop { z-index: 4; }
.ru-c .ru-torch-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.ru-c .ru-torch-count { font-weight: 700; }

/* Image blender */
.ru-c .ru-bl-stage { position: relative; aspect-ratio: 16 / 9; overflow: hidden; border-radius: var(--ru-radius); background: #000; }
.ru-c .ru-bl-layer { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ru-c .ru-bl-ph { display: grid; place-items: center; background: linear-gradient(135deg, #3d7fd6, #9ad0f5); color: #fff; font: 800 2em/1 var(--ru-heading-font, inherit); }
.ru-c .ru-bl-controls { margin-top: 14px; }
.ru-c .ru-bl-range { width: 100%; accent-color: var(--ru-accent); height: 28px; }
.ru-c .ru-bl-labels { display: flex; justify-content: space-between; gap: 6px; }
.ru-c .ru-bl-label { border: 0; background: none; color: var(--ru-muted); font: inherit; font-weight: 700; cursor: pointer; padding: 4px 2px; }
.ru-c .ru-bl-label.is-active { color: var(--ru-accent); }

/* Conversation */
.ru-c .ru-cv { border-radius: calc(var(--ru-radius) + 4px); overflow: hidden; background: var(--ru-accent); color: var(--ru-accent-ink); }
.ru-c .ru-cv-call { background: #15171c; color: #fff; }
.ru-c .ru-cv-head { padding: 26px 28px 14px; }
.ru-c .ru-cv-head .ru-title { color: inherit; margin-bottom: 6px; font-size: 1.6em; }
.ru-c .ru-cv-intro { opacity: .9; }
.ru-c .ru-cv-caller { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,.12); }
.ru-c .ru-cv-caller strong { display: block; font-size: 1.1em; }
.ru-c .ru-cv-status { font-size: .85em; opacity: .75; font-variant-numeric: tabular-nums; }
.ru-c .ru-cv-meter { display: flex; align-items: center; gap: 12px; margin-top: 14px; font-weight: 700; font-size: .92em; flex-wrap: wrap; }
.ru-c .ru-cv-track { flex: 1; min-width: 120px; height: 8px; border-radius: 99px; background: rgba(255,255,255,.22); overflow: hidden; }
.ru-c .ru-cv-fill { display: block; height: 100%; border-radius: 99px; transition: width .6s ease, background .6s; background: #a8e6cf; }
.ru-c .ru-cv-fill.is-mid { background: #ffd56b; } .ru-c .ru-cv-fill.is-low { background: #ff8a88; }
.ru-c .ru-cv-mood { opacity: .9; }
.ru-c .ru-cv-log { margin: 0 20px; padding: 16px; max-height: 420px; min-height: 120px; overflow-y: auto; border-radius: var(--ru-radius); background: rgba(255,255,255,.1); display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
.ru-c .ru-cv-row { display: flex; align-items: flex-end; gap: 10px; animation: ru-in .3s ease; }
.ru-c .ru-cv-row.is-you { justify-content: flex-end; }
.ru-c .ru-cv-avatar { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 50%; overflow: hidden; background: #fff; color: #1d2330; font-weight: 800; }
.ru-c .ru-cv-avatar img { width: 100%; height: 100%; object-fit: cover; }
.ru-c .ru-cv-bubble { max-width: 78%; padding: 10px 16px; border-radius: 16px 16px 16px 4px; background: #fff; color: #1d2330; }
.ru-c .is-you .ru-cv-bubble { border-radius: 16px 16px 4px 16px; background: rgba(0,0,0,.35); color: #fff; }
.ru-c .ru-cv-you { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 50%; background: rgba(0,0,0,.35); color: #fff; font-size: .75em; font-weight: 800; }
.ru-c .ru-cv-call .ru-cv-bubble { background: #2a2e36; color: #fff; }
.ru-c .ru-cv-call .is-you .ru-cv-bubble { background: var(--ru-accent); color: var(--ru-accent-ink); }
.ru-c .ru-cv-typing .ru-cv-bubble { display: flex; gap: 4px; padding: 14px 16px; }
.ru-c .ru-cv-typing .ru-cv-bubble span { width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .4; animation: ru-dots 1s infinite; }
.ru-c .ru-cv-typing .ru-cv-bubble span:nth-child(2) { animation-delay: .15s; } .ru-c .ru-cv-typing .ru-cv-bubble span:nth-child(3) { animation-delay: .3s; }
@keyframes ru-dots { 0%, 100% { opacity: .3; transform: none; } 50% { opacity: 1; transform: translateY(-3px); } }
.ru-c .ru-cv-fb { padding: 10px 14px; border-radius: 10px; background: rgba(0,0,0,.28); color: #fff; border-left: 4px solid #ffd56b; animation: ru-in .3s ease; }
.ru-c .ru-cv-fb.is-good { border-color: #a8e6cf; } .ru-c .ru-cv-fb.is-poor { border-color: #ff8a88; }
.ru-c .ru-cv-fb-title { display: flex; align-items: center; gap: 8px; font-weight: 800; margin-bottom: 2px; }
.ru-c .ru-cv-dot { width: 12px; height: 12px; border-radius: 50%; background: #ffd56b; } .ru-c .is-good .ru-cv-dot { background: #a8e6cf; } .ru-c .is-poor .ru-cv-dot { background: #ff8a88; }
.ru-c .ru-cv-choices { padding: 18px 28px 24px; margin-top: 16px; border-top: 1px solid rgba(255,255,255,.15); min-height: 60px; }
.ru-c .ru-cv-prompt { font-weight: 700; margin-bottom: 10px; opacity: .9; }
.ru-c .ru-cv-opts { display: flex; flex-wrap: wrap; gap: 10px; }
.ru-c .ru-cv-opt { background: transparent; border-color: currentColor; color: inherit; }
.ru-c .ru-cv-opt:hover { background: rgba(255,255,255,.14); }
.ru-c .ru-cv-start { background: #fff; color: #1d2330; border-color: #fff; }
.ru-c .ru-cv-call .ru-cv-start { background: #2fbf71; border-color: #2fbf71; color: #fff; }
.ru-c .ru-cv-end-title { font-weight: 800; font-size: 1.15em; margin-bottom: 6px; }
.ru-c .ru-cv-end .ru-btn { margin-top: 12px; }

/* Data story */
.ru-c .ru-ds { position: relative; overflow: hidden; padding: clamp(22px, 4vw, 40px); border-radius: calc(var(--ru-radius) + 4px); }
.ru-c .ru-ds-bold { background: var(--ru-accent); color: var(--ru-accent-ink); }
.ru-c .ru-ds-light { background: var(--ru-soft); }
.ru-c .ru-ds-blob { position: absolute; top: -90px; right: -70px; width: 240px; height: 240px; border-radius: 50%; background: #ffd56b; opacity: .9; pointer-events: none; }
.ru-c .ru-ds-light .ru-ds-blob { background: color-mix(in srgb, var(--ru-accent) 18%, transparent); }
.ru-c .ru-ds > *:not(.ru-ds-blob) { position: relative; }
.ru-c .ru-ds-tag { display: inline-block; padding: 4px 12px; border-radius: 8px; background: #ffd56b; color: #1d2330; font-weight: 700; font-size: .9em; margin-bottom: 12px; }
.ru-c .ru-ds-light .ru-ds-tag { background: color-mix(in srgb, var(--ru-accent) 14%, #fff); color: var(--ru-accent); }
.ru-c .ru-ds-headline { font: 800 clamp(1.6em, 3.6vw, 2.4em)/1.12 var(--ru-heading-font, inherit); letter-spacing: -.02em; color: inherit; max-width: 16em; }
.ru-c .ru-ds-mark { background: #ffd56b; color: #1d2330; padding: 0 .15em; border-radius: 6px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.ru-c .ru-ds-light .ru-ds-mark { background: none; color: var(--ru-accent); box-shadow: inset 0 -.18em 0 color-mix(in srgb, var(--ru-accent) 30%, transparent); }
.ru-c .ru-ds-sub { margin-top: 10px; opacity: .85; font-size: 1.05em; }
.ru-c .ru-ds-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; align-items: center; margin-top: 24px; }
.ru-c .ru-ds-columns .ru-ds-body, .ru-c .ru-ds-bars .ru-ds-body { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); }
@media (max-width: 640px) { .ru-c .ru-ds-body { grid-template-columns: 1fr !important; } }
.ru-c .ru-ds-donutwrap { position: relative; max-width: 300px; justify-self: center; width: 100%; }
.ru-c .ru-ds-donut { width: 100%; display: block; overflow: visible; }
.ru-c .ru-ds-seg { stroke: color-mix(in srgb, currentColor 28%, transparent); stroke-dasharray: 0 var(--ru-c) !important; transition: stroke-dasharray 1s cubic-bezier(.3,.7,.2,1); transition-delay: calc(var(--ru-i) * 90ms); }
.ru-c .ru-ds-light .ru-ds-seg { stroke: color-mix(in srgb, var(--ru-accent) 25%, #d6dae2); }
.ru-c .ru-ds-seg.is-focus { stroke: #ffd56b; }
.ru-c .ru-ds-light .ru-ds-seg.is-focus { stroke: var(--ru-accent); }
.ru-c .ru-ds.is-built .ru-ds-seg { stroke-dasharray: var(--ru-len) var(--ru-c) !important; }
.ru-c .ru-ds-centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ru-c .ru-ds-centre-val { font: 800 clamp(1.8em, 4vw, 2.6em)/1 var(--ru-heading-font, inherit); font-variant-numeric: tabular-nums; }
.ru-c .ru-ds-centre-label { opacity: .85; margin-top: 4px; }
.ru-c .ru-ds-legend { list-style: none; display: flex; flex-direction: column; gap: 4px; }
.ru-c .ru-ds-legend li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; opacity: 0; transform: translateX(10px); transition: opacity .4s, transform .4s; transition-delay: calc(300ms + var(--ru-i) * 80ms); }
.ru-c .ru-ds.is-built .ru-ds-legend li { opacity: 1; transform: none; }
.ru-c .ru-ds-legend li.is-focus { background: rgba(255,255,255,.14); font-weight: 800; }
.ru-c .ru-ds-light .ru-ds-legend li.is-focus { background: color-mix(in srgb, var(--ru-accent) 10%, #fff); }
.ru-c .ru-ds-dot { width: 12px; height: 12px; border-radius: 50%; background: color-mix(in srgb, currentColor 35%, transparent); }
.ru-c .is-focus .ru-ds-dot { background: #ffd56b; } .ru-c .ru-ds-light .is-focus .ru-ds-dot { background: var(--ru-accent); }
.ru-c .ru-ds-lname { flex: 1; }
.ru-c .ru-ds-callout { margin-top: 18px; padding: 14px 18px; border-radius: 10px; background: #fff; color: #1d2330; font-size: 1.12em; opacity: 0; transform: translateY(10px); transition: opacity .5s 1s, transform .5s 1s; }
.ru-c .ru-ds.is-built .ru-ds-callout { opacity: 1; transform: none; }
.ru-c .ru-ds-callout mark { background: #1d2330; color: #fff; padding: 0 .2em; border-radius: 4px; }
.ru-c .ru-ds-light .ru-ds-callout { box-shadow: 0 6px 18px rgba(0,0,0,.08); }
.ru-c .ru-ds-note { margin-top: 18px; font-size: .85em; opacity: .75; }
.ru-c .ru-ds-bars:not(.is-h) { display: flex; align-items: flex-end; gap: clamp(8px, 2vw, 22px); height: 260px; padding-bottom: 28px; border-bottom: 2px solid color-mix(in srgb, currentColor 25%, transparent); }
.ru-c .ru-ds-bars:not(.is-h) .ru-ds-bar { position: relative; flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; }
.ru-c .ru-ds-bars:not(.is-h) .ru-ds-track { position: relative; height: calc(var(--ru-v) * 82%); display: flex; flex-direction: column; justify-content: flex-end; }
.ru-c .ru-ds-bars:not(.is-h) .ru-ds-fill { display: block; height: 100%; border-radius: 8px 8px 0 0; background: color-mix(in srgb, currentColor 30%, transparent); transform: scaleY(0); transform-origin: bottom; transition: transform .9s cubic-bezier(.3,.7,.2,1); transition-delay: calc(var(--ru-i) * 110ms); }
.ru-c .ru-ds-light .ru-ds-fill { background: color-mix(in srgb, var(--ru-accent) 35%, #fff) !important; }
.ru-c .ru-ds-bar.is-focus .ru-ds-fill { background: #ffd56b !important; }
.ru-c .ru-ds-light .ru-ds-bar.is-focus .ru-ds-fill { background: var(--ru-accent) !important; }
.ru-c .ru-ds.is-built .ru-ds-fill { transform: none; }
.ru-c .ru-ds-bars:not(.is-h) .ru-ds-val { position: absolute; top: -1.6em; left: 0; right: 0; text-align: center; font-weight: 800; font-variant-numeric: tabular-nums; }
.ru-c .ru-ds-bars:not(.is-h) .ru-ds-label { position: absolute; bottom: -26px; left: -10px; right: -10px; text-align: center; font-size: .9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ru-c .ru-ds-bar.is-focus .ru-ds-label { font-weight: 800; }
.ru-c .ru-ds-bars.is-h { display: flex; flex-direction: column; gap: 12px; }
.ru-c .ru-ds-bars.is-h .ru-ds-bar { display: grid; grid-template-columns: 110px 1fr auto; align-items: center; gap: 12px; }
.ru-c .ru-ds-bars.is-h .ru-ds-label { order: -1; font-weight: 600; }
.ru-c .ru-ds-bars.is-h .ru-ds-track { height: 18px; border-radius: 9px; background: color-mix(in srgb, currentColor 10%, transparent); overflow: hidden; }
.ru-c .ru-ds-bars.is-h .ru-ds-fill { display: block; height: 100%; width: calc(var(--ru-v) * 100%); border-radius: 9px; background: color-mix(in srgb, currentColor 35%, transparent); transform: scaleX(0); transform-origin: left; transition: transform .9s cubic-bezier(.3,.7,.2,1); transition-delay: calc(var(--ru-i) * 110ms); }
.ru-c .ru-ds-bars.is-h .ru-ds-val { font-weight: 800; font-variant-numeric: tabular-nums; min-width: 4em; text-align: right; }
@media (prefers-reduced-motion: reduce) {
  .ru-c .ru-ds-seg, .ru-c .ru-ds-fill, .ru-c .ru-ds-legend li, .ru-c .ru-ds-callout, .ru-c .ru-sc-card, .ru-c .ru-pop, .ru-pop-overlay { transition: none !important; animation: none !important; }
  .ru-c .ru-fb-gap.is-target { animation: none; outline: 2px dashed var(--ru-accent); }
}
`;
  RU.COMPONENT_CSS += MORE_CSS;

  return { progress, parseGaps, PROGRESS_PREFIX };
});
