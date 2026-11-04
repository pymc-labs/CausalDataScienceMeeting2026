/* ==========================================================================
   Presenter screen: where the talk is, what the next arrow press shows, and
   the speaker notes. The deck (js/deck.js) opens this window and answers over
   postMessage through window.opener; this window sends next/prev back from its
   arrow keys, a clicker and its two buttons. Classic script, so it also works
   from file://. A heartbeat finds the deck again after a reload of either window.
   ========================================================================== */
(function () {
  'use strict';

  var PING_MS = 1000;    // ask the deck for its position this often
  var LOST_MS = 2500;    // no answer for this long: the link is lost
  var deck = window.opener;
  var lastState = 0;
  var lastKey = '';

  function $(sel) { return document.querySelector(sel); }
  var el = {
    status: $('[data-status]'),
    nowLabel: $('[data-now-label]'),
    nowOf: $('[data-now-of]'),
    nowTitle: $('[data-now-title]'),
    nowMeta: $('[data-now-meta]'),
    nowDots: $('[data-now-dots]'),
    nowText: $('[data-now-text]'),
    nextTitle: $('[data-next-title]'),
    nextMeta: $('[data-next-meta]'),
    nextText: $('[data-next-text]'),
    notes: $('[data-notes]')
  };

  function send(type) {
    if (deck && !deck.closed) deck.postMessage({ cdsm: 'presenter', type: type }, '*');
  }
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
    el.notes.innerHTML = m.notes || '<p>No notes for this slide.</p>';
    el.notes.scrollTop = 0;
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
    if (e.metaKey || e.ctrlKey || e.altKey) return;
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
})();
