/* ==========================================================================
   Presenter screen: where the talk is, what the next arrow press shows, and
   the speaker notes. The deck (js/deck.js) opens this window and answers over
   postMessage through window.opener; this window sends next/prev back from its
   arrow keys, a clicker and its navigation buttons. Classic script, so it also works
   from file://. A heartbeat finds the deck again after a reload of either window.

   Notes editing: with python3 serve.py, the notes box is editable (one paragraph
   per line). A pause in typing, leaving the box or Cmd/Ctrl+S saves the slide's
   notes into index.html (PUT api/notes), so the edit is a change to a tracked file
   that git shares. Each save sends the text it started from; serve.py refuses it
   when index.html changed meanwhile. Without serve.py the box is read-only.
   ========================================================================== */
(function () {
  'use strict';

  var PING_MS = 1000;    // ask the deck for its position this often
  var LOST_MS = 2500;    // no answer for this long: the link is lost
  var deck = window.opener;
  var lastState = 0;
  var lastKey = '';
  var timerStartedAt = null;
  var timerElapsed = 0;
  var timerInterval = null;

  function $(sel) { return document.querySelector(sel); }
  var el = {
    status: $('[data-status]'),
    timer: $('[data-timer]'),
    timerToggle: $('[data-timer-toggle]'),
    timerReset: $('[data-timer-reset]'),
    nowLabel: $('[data-now-label]'),
    nowOf: $('[data-now-of]'),
    nowTitle: $('[data-now-title]'),
    nowMeta: $('[data-now-meta]'),
    nowDots: $('[data-now-dots]'),
    nowText: $('[data-now-text]'),
    nextTitle: $('[data-next-title]'),
    nextMeta: $('[data-next-meta]'),
    nextText: $('[data-next-text]'),
    notes: $('[data-notes]'),
    save: $('[data-save]'),
    mini: $('[data-mini]')
  };

  // The small copy of the slide is the deck in mirror mode. It moves to the deck's address; only
  // the fragment changes, so it does not reload and plays the same steps and entrances.
  var MINI = 'index.html?mirror';
  var miniHash = null;
  function follow(hash) {
    if (!hash || hash === miniHash) return;
    miniHash = hash;
    el.mini.src = MINI + hash;
  }

  // Use elapsed time, not tick counts, so delayed callbacks do not slow the clock.
  function updateTimer() {
    var elapsed = timerElapsed + (timerStartedAt === null ? 0 : performance.now() - timerStartedAt);
    var seconds = Math.floor(elapsed / 1000);
    var text = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' +
      String(seconds % 60).padStart(2, '0');
    if (el.timer.textContent !== text) el.timer.textContent = text;
  }

  function send(type, extra) {
    var m = { cdsm: 'presenter', type: type };
    for (var k in extra || {}) m[k] = extra[k];
    if (deck && !deck.closed) deck.postMessage(m, '*');
  }

  /* ---- Notes editing ---------------------------------------------------------- */
  var SAVE_MS = 800;     // save after this long without typing
  var canSave = false;
  // The slide whose notes are in the box, the text they started from, and the save state.
  var ed = { title: null, base: [], dirty: false, timer: null, saving: false, again: false };

  function squash(t) { return t.replace(/\s+/g, ' ').trim(); }
  function parasFromHtml(notesHtml) {
    var d = document.createElement('div');
    d.innerHTML = notesHtml || '';
    return Array.prototype.map.call(d.querySelectorAll('p'), function (p) { return squash(p.textContent); }).filter(Boolean);
  }
  function parasFromText(text) { return text.split('\n').map(squash).filter(Boolean); }
  function sameParas(a, b) { return a.length === b.length && a.every(function (p, i) { return p === b[i]; }); }
  function setSave(text, error) {
    el.save.textContent = text;
    el.save.classList.toggle('error', !!error);
  }

  // The box follows the slide, but never replaces text that is being typed or not yet saved.
  function showNotes(title, notesHtml) {
    var paras = parasFromHtml(notesHtml);
    if (title !== ed.title) {
      if (ed.dirty) save();    // the previous slide's last words go to index.html first
      ed.title = title;
      ed.base = paras;
      el.notes.value = paras.join('\n\n');
      el.notes.scrollTop = 0;
      return;
    }
    if (!ed.dirty && !ed.saving && document.activeElement !== el.notes && !sameParas(paras, ed.base)) {
      ed.base = paras;
      el.notes.value = paras.join('\n\n');
    }
  }

  function save() {
    clearTimeout(ed.timer);
    ed.timer = null;
    if (!canSave || !ed.dirty || ed.title === null) return;
    if (ed.saving) { ed.again = true; return; }   // one save at a time: the next one needs the new base
    var title = ed.title;
    var paras = parasFromText(el.notes.value);
    ed.dirty = false;
    ed.saving = true;
    setSave('Saving…');
    fetch('api/notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, base: ed.base, paragraphs: paras }),
      keepalive: true
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'The server refused the notes.'); return j; });
    }).then(function (j) {
      if (ed.title === title) ed.base = j.paragraphs;
      send('notes', { title: title, paragraphs: j.paragraphs });
      setSave('Saved in index.html · commit and push to share');
    }).catch(function (err) {
      setSave('Not saved: ' + err.message, true);
    }).then(function () {
      ed.saving = false;
      if (ed.again) { ed.again = false; save(); }
    });
  }

  el.notes.addEventListener('input', function () {
    if (!canSave) return;
    ed.dirty = true;
    setSave('Editing…');
    clearTimeout(ed.timer);
    ed.timer = setTimeout(save, SAVE_MS);
  });
  el.notes.addEventListener('blur', save);
  window.addEventListener('pagehide', save);

  // Saving needs serve.py; any other server (or file://) leaves the notes read-only.
  fetch('api/notes', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (j) {
      canSave = !!(j && j.save);
      el.notes.readOnly = !canSave;
      el.notes.placeholder = canSave ? 'No notes for this slide. Click here to write some.' : 'No notes for this slide.';
      setSave(canSave ? 'Edits save into index.html' : 'Read-only · run python3 serve.py to edit');
    });

  function setStatus(text, linked) {
    if (el.status.textContent !== text) el.status.textContent = text;
    el.status.classList.toggle('on', !!linked);
  }

  function stepOf(p) { return 'step ' + (p.step + 1) + ' of ' + (p.steps + 1); }
  function pageOf(p, total) { return p.backup ? p.label + ' · backup' : p.label + ' / ' + total; }

  function render(m) {
    var now = m.now;
    document.title = now.label + ' · ' + now.title + ' · Presenter screen';
    el.nowLabel.textContent = now.label;
    el.nowOf.textContent = now.backup ? ' · backup' : ' / ' + m.total;
    el.nowTitle.textContent = now.title;
    el.nowMeta.textContent = now.act + (now.steps ? ' · ' + stepOf(now) : '');
    el.nowDots.innerHTML = '';
    for (var i = 0; now.steps && i <= now.steps; i++) {
      var d = document.createElement('i');
      d.className = i < now.step ? 'done' : i === now.step ? 'cur' : '';
      el.nowDots.appendChild(d);
    }
    el.nowText.textContent = now.text;

    var nx = m.next;
    if (!nx) {
      el.nextTitle.textContent = now.backup ? 'Last backup slide' : 'End of the talk';
      el.nextMeta.textContent = 'The arrow does not go further.';
      el.nextText.textContent = '';
    } else if (m.sameSlide) {
      el.nextTitle.textContent = 'This slide, ' + stepOf(nx);
      el.nextMeta.textContent = nx.act;
      el.nextText.textContent = nx.text;
    } else {
      el.nextTitle.textContent = nx.title;
      el.nextMeta.textContent = 'Slide ' + pageOf(nx, m.total) + ' · ' + nx.act + (nx.steps ? ' · ' + (nx.steps + 1) + ' steps' : '');
      el.nextText.textContent = nx.text;
    }
    showNotes(now.title, m.notes);
    follow(m.hash);
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.cdsm !== 'deck' || e.source !== deck) return;
    lastState = Date.now();
    setStatus('Linked to the deck', true);
    // The heartbeat repeats the same state; render only a change, so a scrolled note stays put.
    var key = m.now.label + '/' + m.now.step + '/' + m.notes.length;
    if (key !== lastKey) { lastKey = key; render(m); }
  });

  function heartbeat() {
    if (!deck) { setStatus('Open this screen from the deck: press P there', false); return; }
    if (deck.closed) { setStatus('The deck window is closed', false); return; }
    if (lastState && Date.now() - lastState > LOST_MS) setStatus('Looking for the deck', false);
    send('hello');
  }
  heartbeat();
  setInterval(heartbeat, PING_MS);

  document.addEventListener('keydown', function (e) {
    // In the notes box the keys type text. Esc leaves the box; Cmd/Ctrl+S saves at once.
    if (e.target === el.notes) {
      if (e.key === 'Escape') { e.preventDefault(); el.notes.blur(); }
      else if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === ' ' || e.key === 'Enter') &&
        e.target instanceof Element && e.target.closest('button')) return;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        e.preventDefault(); send('next'); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); send('prev'); break;
      default: break;
    }
  });
  // Blur after a click, so the arrow keys and Enter do not also press a focused button.
  document.querySelectorAll('[data-cmd]').forEach(function (b) {
    b.addEventListener('click', function () { send(b.getAttribute('data-cmd')); b.blur(); });
  });
  el.timerToggle.addEventListener('click', function () {
    if (timerStartedAt === null) {
      timerStartedAt = performance.now();
      timerInterval = setInterval(updateTimer, 1000);
      el.timerToggle.textContent = 'Pause';
    } else {
      timerElapsed += performance.now() - timerStartedAt;
      timerStartedAt = null;
      clearInterval(timerInterval);
      timerInterval = null;
      el.timerToggle.textContent = 'Resume';
    }
    updateTimer();
    el.timerToggle.blur();
  });
  el.timerReset.addEventListener('click', function () {
    clearInterval(timerInterval);
    timerInterval = null;
    timerStartedAt = null;
    timerElapsed = 0;
    updateTimer();
    el.timerToggle.textContent = 'Start';
    el.timerReset.blur();
  });
})();
