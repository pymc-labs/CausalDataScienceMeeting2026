/* ==========================================================================
   Deck engine: navigation, steps, transitions, scenes, chrome.
   Classic script (no modules) so the deck also opens from file://.

   Slide markup
     <section class="slide" data-title="…" data-act="…" data-theme="dark|light"
              data-steps="N" data-scene="name" data-chrome="on|min|off"
              data-field='{"mode":"contour", …}'>
       … elements with class "r" reveal with a stagger when the slide enters
       … [data-step="k"]        shown from step k onward
       … [data-until="k"]       shown before step k
       … [data-step-only="a b"] shown only on the listed steps
       … [data-past="k"]        gets .is-past from step k (use with .dim-past)
       <aside class="notes">speaker notes</aside>
     </section>
   Steps run 0..N. Next advances the step, then the slide. Previous goes back
   one step; from step 0 it lands on the last step of the previous slide.

   Scene contract (js/scenes/*.js)
     Deck.registerScene('name', {
       mount(el, api),            // once, after fonts load; el is the <section>
       enter(ctx),                // slide becomes active; ctx = {step, dir, instant}
                                  // render the state of ctx.step (any value:
                                  // going back lands on the last step) and
                                  // animate the entrance as the scene likes
       step(ctx),                 // step changed while active
                                  // ctx = {step, prev, dir, instant}; must be
                                  // idempotent for any step value (jumps happen)
       leave(ctx),                // slide stops being active; stop rAF loops here
       resize()                   // optional
     });
   ========================================================================== */
(function () {
  'use strict';

  var STAGE_W = 1920;
  var STAGE_H = 1080;
  var LEAVE_MS = 700;

  var scenes = Object.create(null);
  var listeners = Object.create(null);
  var slides = [];
  var cur = -1;
  var curStep = 0;
  var started = false;
  var leaveTimer = null;

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Small animation toolkit shared with scenes --------------------------- */
  var ease = {
    linear: function (t) { return t; },
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
    outExpo: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    inOutQuint: function (t) { return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2; }
  };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /**
   * tween({from, to, duration, easing, delay, onUpdate, onDone}) -> {cancel, done}
   * `from`/`to` may be numbers or arrays of numbers of equal length.
   */
  function tween(opts) {
    var from = opts.from === undefined ? 0 : opts.from;
    var to = opts.to === undefined ? 1 : opts.to;
    var duration = reducedMotion ? Math.min(opts.duration || 800, 200) : (opts.duration || 800);
    var easing = opts.easing || ease.inOut;
    var delay = opts.delay || 0;
    var isArr = Array.isArray(from);
    var t0 = null;
    var raf = 0;
    var cancelled = false;
    var resolveDone;
    var done = new Promise(function (res) { resolveDone = res; });
    function value(k) {
      if (!isArr) return lerp(from, to, k);
      var out = new Array(from.length);
      for (var j = 0; j < from.length; j++) out[j] = lerp(from[j], to[j], k);
      return out;
    }
    function frame(now) {
      if (cancelled) return;
      if (t0 === null) t0 = now + delay;
      var p = duration <= 0 ? 1 : clamp((now - t0) / duration, 0, 1);
      if (now >= t0 && opts.onUpdate) opts.onUpdate(value(easing(p)), p);
      if (p < 1) raf = requestAnimationFrame(frame);
      else { if (opts.onDone) opts.onDone(); resolveDone(true); }
    }
    raf = requestAnimationFrame(frame);
    return {
      cancel: function () { cancelled = true; cancelAnimationFrame(raf); resolveDone(false); },
      done: done
    };
  }

  function tex(src, display) {
    if (!window.katex) return src;
    try {
      return window.katex.renderToString(src, { displayMode: !!display, throwOnError: false, output: 'html', trust: true, strict: false });
    } catch (e) {
      console.error('KaTeX', e);
      return src;
    }
  }

  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, data) { (listeners[evt] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); }

  /* ---- Scene plumbing ------------------------------------------------------ */
  function callScene(slide, method, ctx) {
    var impl = slide.scene && scenes[slide.scene];
    if (!impl || typeof impl[method] !== 'function') return;
    try { impl[method](method === 'mount' ? slide.el : ctx, method === 'mount' ? api : undefined); }
    catch (e) { console.error('[scene ' + slide.scene + '] ' + method, e); }
  }

  function registerScene(name, impl) {
    scenes[name] = impl;
    if (!started) return;
    // Late registration: mount now and sync to the current state.
    slides.forEach(function (s, idx) {
      if (s.scene !== name || s.mounted) return;
      s.mounted = true;
      callScene(s, 'mount');
      if (idx === cur) {
        callScene(s, 'enter', { step: curStep, dir: 1, instant: true });
      }
    });
  }

  /* ---- Steps ----------------------------------------------------------------- */
  function parseList(v) { return String(v).trim().split(/[\s,]+/).map(Number); }

  function applyStep(slide, s) {
    slide.el.dataset.step = String(s);
    for (var j = 0; j < slide.frags.length; j++) {
      var f = slide.frags[j];
      var shown = true;
      if (f.hasAttribute('data-step')) shown = shown && s >= Number(f.getAttribute('data-step'));
      if (f.hasAttribute('data-until')) shown = shown && s < Number(f.getAttribute('data-until'));
      if (f.hasAttribute('data-step-only')) shown = shown && parseList(f.getAttribute('data-step-only')).indexOf(s) !== -1;
      f.classList.toggle('is-shown', shown);
    }
    for (var k = 0; k < slide.pasts.length; k++) {
      var p = slide.pasts[k];
      p.classList.toggle('is-past', s >= Number(p.getAttribute('data-past')));
    }
  }

  /* ---- Field (background canvas) ------------------------------------------- */
  function syncField(slide, instant) {
    if (!window.Field || typeof window.Field.set !== 'function') return;
    try { window.Field.set(Object.assign({ theme: slide.theme }, slide.field), { instant: !!instant }); }
    catch (e) { console.error('[field]', e); }
  }

  /* ---- Quiet zones: the background lines fade out behind text ------------------ */
  // Text is the protagonist. Every text run, equation, card and scene area of the
  // active slide, and the visible chrome, goes to the background field as a box
  // in stage px. The field clears its lines there and fades them in around it.
  // Blocks are cleared as a whole, so a list or a group of notes sits on one
  // plain area instead of lines running between its rows.
  var QUIET_BLOCKS = '.katex, .card, .chip, .close-col, .boundary, .scene-root, .proc i, .splitbar, ' +
    '.points, .stats, .trio, .scope, .test-flow, .test-design, .choices, .splits, .bma, .pfn-eqs, .eq-stage, ' +
    '.flow-text, .facts, .chips, .title-block, .close-cols, .thanks, .arch-head, .process';
  var quietTimer = null;
  function quietZones(slide) {
    var base = document.querySelector('.stage-main').getBoundingClientRect();
    var k = baseScale();
    var out = [];
    var range = document.createRange();
    function add(r) {
      if (r.width >= 1 && r.height >= 1) out.push([(r.left - base.left) / k, (r.top - base.top) / k, r.width / k, r.height / k]);
    }
    function addText(root) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!/\S/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
          return n.parentElement.closest('.notes, .katex, .scene-root') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) {
        range.selectNodeContents(walker.currentNode);
        var rs = range.getClientRects();
        for (var i = 0; i < rs.length; i++) add(rs[i]);
      }
    }
    addText(slide.el);
    slide.el.querySelectorAll(QUIET_BLOCKS).forEach(function (el) { add(el.getBoundingClientRect()); });
    if (slide.chrome !== 'off') {
      addText(document.querySelector('.chrome-foot'));
      if (slide.chrome !== 'min') {
        addText(document.querySelector('.chrome-head'));
        add(document.querySelector('.chrome-head .brand-logo').getBoundingClientRect());
      }
    }
    return out;
  }
  function syncQuiet(slide, instant) {
    if (!window.Field || typeof window.Field.quiet !== 'function' || zoom.on) return;
    try { window.Field.quiet(quietZones(slide), { instant: !!instant }); }
    catch (e) { console.error('[field]', e); }
  }
  // Entering text rises and fades in for about a second; measure again at rest.
  function settleQuiet(slide) {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(function () { if (slides[cur] === slide) syncQuiet(slide); }, 1300);
  }

  /* ---- Chrome ------------------------------------------------------------------ */
  var chrome = {};
  function updateChrome(slide, index) {
    document.body.classList.toggle('chrome-off', slide.chrome === 'off');
    document.body.classList.toggle('chrome-min', slide.chrome === 'min');
    if (chrome.page) {
      chrome.page.innerHTML = String(index + 1).padStart(2, '0') + '<span class="of"> / ' + String(slides.length).padStart(2, '0') + '</span>';
    }
    if (chrome.act && chrome.actWant !== slide.act) {
      // Track the wanted act, not the label text: a quick overshoot and return
      // must cancel the pending swap.
      chrome.actWant = slide.act;
      clearTimeout(chrome.actTimer);
      chrome.act.classList.add('out');
      chrome.actTimer = setTimeout(function () {
        chrome.act.textContent = chrome.actWant;
        chrome.act.classList.remove('out');
      }, 260);
    }
    updateProgress();
  }
  function updateProgress() {
    var s = slides[cur];
    if (!s) return;
    var frac = slides.length <= 1 ? 1 : (cur + (s.steps ? curStep / (s.steps + 1) : 0)) / (slides.length - 1);
    document.documentElement.style.setProperty('--progress', clamp(frac, 0, 1).toFixed(4));
  }

  /* ---- Navigation ------------------------------------------------------------ */
  function go(index, step, opts) {
    opts = opts || {};
    index = clamp(index | 0, 0, slides.length - 1);
    var target = slides[index];
    step = step === 'last' ? target.steps : clamp(step | 0, 0, target.steps);
    if (zoom.on || zoom.armed) setZoom(false);

    if (index === cur) {
      if (step === curStep) return;
      var prevStep = curStep;
      var sdir = step > prevStep ? 1 : -1;
      curStep = step;
      applyStep(target, step);
      callScene(target, 'step', { step: step, prev: prevStep, dir: sdir, instant: !!opts.instant });
      emit('stepchange', { index: index, step: step, prev: prevStep, dir: sdir });
      updateProgress();
      writeHash();
      return;
    }

    var dir = index > cur ? 1 : -1;
    document.body.classList.toggle('nav-back', dir < 0);
    var old = slides[cur];

    // Only one slide may be leaving at a time.
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    slides.forEach(function (s) { if (s !== old) s.el.classList.remove('is-leaving'); });

    if (old) {
      callScene(old, 'leave', { dir: dir });
      old.el.classList.remove('is-active');
      if (!opts.instant) {
        old.el.classList.add('is-leaving');
        var leaving = old.el;
        leaveTimer = setTimeout(function () { leaving.classList.remove('is-leaving'); leaveTimer = null; }, LEAVE_MS);
      }
    }

    cur = index;
    curStep = step;
    document.body.dataset.theme = target.theme;
    applyStep(target, step);
    if (opts.instant) target.el.classList.add('no-anim');
    // Force a style flush so the entering transition starts from the hidden state.
    void target.el.offsetWidth;
    target.el.classList.add('is-active');
    if (opts.instant) requestAnimationFrame(function () { target.el.classList.remove('no-anim'); });

    syncField(target, opts.instant);
    updateChrome(target, index);
    callScene(target, 'enter', { step: step, dir: dir, instant: !!opts.instant });
    syncQuiet(target, opts.instant);
    settleQuiet(target);
    updateNotes();
    updateOverviewCurrent();
    emit('slidechange', { index: index, step: step, dir: dir, slide: target.el });
    writeHash();
  }

  function next() {
    var s = slides[cur];
    if (curStep < s.steps) go(cur, curStep + 1);
    else if (cur < slides.length - 1) go(cur + 1, 0);
  }
  function prev() {
    if (curStep > 0) go(cur, curStep - 1);
    else if (cur > 0) go(cur - 1, 'last');
  }

  /* ---- Hash -------------------------------------------------------------------- */
  function writeHash() {
    var h = '#/' + (cur + 1) + (curStep ? '/' + curStep : '');
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function readHash() {
    var m = /^#\/(\d+)(?:\/(\d+))?/.exec(location.hash || '');
    if (!m) return null;
    return { index: Number(m[1]) - 1, step: Number(m[2] || 0) };
  }

  /* ---- Overlays: notes, overview, blackout, hint ------------------------------ */
  var notesOn = false;
  function updateNotes() {
    if (!chrome.notes) return;
    var s = slides[cur];
    var n = s && s.el.querySelector('.notes');
    chrome.notes.innerHTML = '<h4>' + (cur + 1) + ' · ' + (s ? s.title : '') + '</h4>' + (n ? n.innerHTML : '<p>No notes.</p>');
  }
  function toggleNotes() { notesOn = !notesOn; chrome.notes.classList.toggle('on', notesOn); updateNotes(); }

  function buildOverview() {
    var root = chrome.overview;
    var html = '';
    var act = null;
    slides.forEach(function (s, idx) {
      if (s.act !== act) {
        if (act !== null) html += '</ol>';
        act = s.act;
        html += '<h3>' + act + '</h3><ol>';
      }
      html += '<li><button data-go="' + idx + '"><span class="k">' + String(idx + 1).padStart(2, '0') + '</span>' + s.title + '</button></li>';
    });
    html += '</ol>';
    root.innerHTML = html;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-go]');
      if (!b) return;
      toggleOverview(false);
      go(Number(b.getAttribute('data-go')), 0);
    });
  }
  function updateOverviewCurrent() {
    if (!chrome.overview) return;
    chrome.overview.querySelectorAll('button[data-go]').forEach(function (b) {
      b.classList.toggle('current', Number(b.getAttribute('data-go')) === cur);
    });
  }
  function toggleOverview(force) {
    var on = typeof force === 'boolean' ? force : !chrome.overview.classList.contains('on');
    if (on && (zoom.on || zoom.armed)) setZoom(false);
    chrome.overview.classList.toggle('on', on);
    if (on) {
      var b = chrome.overview.querySelector('button.current');
      if (b) b.focus();
    }
  }
  function toggleBlackout() { chrome.blackout.classList.toggle('on'); }

  var hintTimer = null;
  function showHint(text, ms) {
    if (!chrome.hint) return;
    chrome.hint.textContent = text;
    chrome.hint.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { chrome.hint.classList.remove('on'); }, ms || 3500);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {});
    else document.exitFullscreen();
  }

  /* ---- Point zoom: Z then click (or Alt+click) zooms the slide around a point --- */
  var zoom = { armed: false, on: false, k: 2.2 };
  function setZoom(on, px, py) {
    var s = slides[cur];
    zoom.armed = false;
    document.body.classList.remove('zoom-armed');
    if (!s) return;
    if (on) {
      s.el.style.transformOrigin = px.toFixed(1) + 'px ' + py.toFixed(1) + 'px';
      s.el.style.transform = 'scale(' + zoom.k + ')';
    } else {
      s.el.style.transform = '';
    }
    if (zoom.on === on) return;
    zoom.on = on;
    document.body.classList.toggle('zoomed', on);
    // Canvas scenes re-render their backing store at the new effective scale.
    setTimeout(function () { callScene(s, 'resize'); }, 60);
  }
  function armZoom() {
    if (zoom.on) { setZoom(false); return; }
    zoom.armed = !zoom.armed;
    document.body.classList.toggle('zoom-armed', zoom.armed);
    if (zoom.armed) showHint('Click a point to zoom  ·  Z or Esc to cancel', 2600);
  }
  function onClick(e) {
    if (!started || chrome.overview.classList.contains('on')) return;
    if (zoom.on) { setZoom(false); return; }
    if (!zoom.armed && !e.altKey) return;
    var stageEl = document.querySelector('.stage-main');
    var r = stageEl.getBoundingClientRect();
    var base = baseScale();
    setZoom(true, (e.clientX - r.left) / base, (e.clientY - r.top) / base);
  }

  /* ---- Input ------------------------------------------------------------------- */
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    // Priority: blackout, then overview, then zoom. Nothing acts behind a black screen.
    if (chrome.blackout.classList.contains('on')) {
      if (k === 'b' || k === 'B' || k === '.' || k === 'Escape') { e.preventDefault(); toggleBlackout(); }
      return;
    }
    if (chrome.overview.classList.contains('on')) {
      if (k === 'Escape' || k === 'o' || k === 'O') { e.preventDefault(); toggleOverview(false); }
      return;
    }
    if (k === 'Escape' && (zoom.on || zoom.armed)) { e.preventDefault(); setZoom(false); return; }
    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); go(0, 0); break;
      case 'End': e.preventDefault(); go(slides.length - 1, 0); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'n': case 'N': toggleNotes(); break;
      case 'o': case 'O': case 'Escape': e.preventDefault(); toggleOverview(true); break;
      case 'b': case 'B': case '.': toggleBlackout(); break;
      case 'z': case 'Z': armZoom(); break;
      default: break;
    }
  }

  var touchX = null;
  function onTouchStart(e) { touchX = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) { if (dx < 0) next(); else prev(); }
  }

  var cursorTimer = null;
  function onMouseMove() {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () { document.body.classList.add('hide-cursor'); }, 2200);
  }

  /* ---- Layout -------------------------------------------------------------------- */
  function fit() {
    var scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    document.documentElement.style.setProperty('--scale', scale.toFixed(5));
    slides.forEach(function (s) { if (s.mounted) callScene(s, 'resize'); });
    if (window.Field && window.Field.resize) window.Field.resize();
    if (slides[cur]) syncQuiet(slides[cur], true);
  }
  // Moving the window between a 1x projector and a 2x laptop screen changes the
  // pixel ratio without a resize event; canvases must re-fit their backing store.
  function watchPixelRatio() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    if (!mq.addEventListener) return;
    mq.addEventListener('change', function () { fit(); watchPixelRatio(); }, { once: true });
  }
  function baseScale() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  }
  // Effective scale of the active slide, including the point zoom.
  function stageScale() {
    return baseScale() * (zoom.on ? zoom.k : 1);
  }


  /* ---- Init -------------------------------------------------------------------- */
  var api = {
    W: STAGE_W,
    H: STAGE_H,
    get reducedMotion() { return reducedMotion; },
    tween: tween,
    ease: ease,
    lerp: lerp,
    clamp: clamp,
    tex: tex,
    on: on,
    current: function () { return { index: cur, step: curStep, slide: slides[cur] && slides[cur].el }; },
    // Current stage scale (CSS px per stage px). Canvas scenes size their
    // backing store with scale() * devicePixelRatio for crisp lines.
    scale: stageScale
  };

  function init() {
    var els = Array.prototype.slice.call(document.querySelectorAll('.stage-main > .slide'));
    slides = els.map(function (el) {
      var field = {};
      if (el.dataset.field) {
        try { field = JSON.parse(el.dataset.field); } catch (e) { console.error('Bad data-field on', el, e); }
      }
      el.querySelectorAll('.r').forEach(function (r, idx) {
        if (!r.style.getPropertyValue('--i')) r.style.setProperty('--i', String(idx));
      });
      return {
        el: el,
        title: el.dataset.title || '',
        act: el.dataset.act || '',
        theme: el.dataset.theme || 'dark',
        chrome: el.dataset.chrome || 'on',
        steps: Number(el.dataset.steps || 0),
        scene: el.dataset.scene || null,
        field: field,
        frags: Array.prototype.slice.call(el.querySelectorAll('[data-step], [data-until], [data-step-only]')),
        pasts: Array.prototype.slice.call(el.querySelectorAll('[data-past]')),
        mounted: false
      };
    });

    // Static math.
    document.querySelectorAll('[data-tex]').forEach(function (el) {
      el.innerHTML = tex(el.getAttribute('data-tex'), el.hasAttribute('data-display'));
    });

    chrome.page = document.querySelector('[data-chrome-page]');
    chrome.act = document.querySelector('[data-chrome-act]');
    chrome.notes = document.querySelector('.notes-panel');
    chrome.overview = document.querySelector('.overview');
    chrome.blackout = document.querySelector('.blackout');
    chrome.hint = document.querySelector('.hint');
    buildOverview();

    fit();
    window.addEventListener('resize', fit);
    watchPixelRatio();
    document.addEventListener('keydown', onKey);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', function () {
      var h = readHash();
      if (h && (h.index !== cur || h.step !== curStep)) go(h.index, h.step);
    });

    started = true;
    slides.forEach(function (s) {
      if (s.scene && scenes[s.scene]) { s.mounted = true; callScene(s, 'mount'); }
    });

    var h = readHash() || { index: 0, step: 0 };
    go(h.index, h.step);
    showHint('← →  navigate   ·   N notes   ·   O overview   ·   Z zoom   ·   F full screen', 4200);
    document.documentElement.classList.add('deck-ready');
  }

  window.Deck = {
    registerScene: registerScene,
    go: go,
    next: next,
    prev: prev,
    on: on,
    tween: tween,
    ease: ease,
    lerp: lerp,
    clamp: clamp,
    tex: tex,
    current: api.current,
    scale: stageScale,
    get reducedMotion() { return reducedMotion; },
    W: STAGE_W,
    H: STAGE_H
  };

  function boot() {
    var loads = [];
    if (document.fonts && document.fonts.load) {
      // Canvas scenes draw text with these faces; load them before any scene mounts.
      ['300 20px Inter', '400 20px Inter', '500 20px Inter', '600 20px Inter',
        '400 20px "Fira Mono"', '500 20px "Fira Mono"', '400 20px Archivo', '500 20px Archivo']
        .forEach(function (f) { loads.push(document.fonts.load(f).catch(function () {})); });
      loads.push(document.fonts.ready);
    }
    // Never block the deck on fonts for more than 2.5 s.
    Promise.race([Promise.all(loads), new Promise(function (r) { setTimeout(r, 2500); })]).then(init);
  }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
