/* ==========================================================================
   Results scenes, LIGHT theme. One picture per slide, no steps.
     structure · slide 15   one dot plot: channel-edge precision and recall, and
                              exact-set recovery, at all three horizons
     crps      · slide 16   one dot plot: query channel CRPS of River, PathMC,
                              OLS and PyMC-Marketing in every condition and at
                              all three horizons
   Every number on screen is read from window.DECK_DATA.

   Each picture is a panel: an SVG laid out in stage px whose build is a pure
   function of a clock t (ms). Entering the slide runs t forward; leaving it
   lifts the panel out and freezes t; a panel hidden for longer than RESET_MS
   builds again from t = 0.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.DECK_DATA;
  var ease = Deck.ease;
  var NS = 'http://www.w3.org/2000/svg';
  var RESET_MS = 650;
  var ENTER = { delay: 260, lead: 160 };   // slide entrance: CSS rise delay, then the build

  var C = {
    ink: '#0C1F40',
    ink2: 'rgba(12, 31, 64, .55)',
    ink3: 'rgba(12, 31, 64, .32)',
    hair: 'rgba(12, 31, 64, .14)',
    wash: 'rgba(12, 31, 64, .055)',
    aqua: '#B4E7DD',
    aquaDeep: '#4FA595',
    peri: '#9FAAE2',
    periDeep: '#6874C4',
    peachDeep: '#D9803C',
    ols: 'rgba(12, 31, 64, .35)'
  };

  // The three horizons in paper order (99, 185, then 207 context weeks): aqua, peri, then navy.
  var CTX = D.evaluation.horizons.map(function (h) { return h.context; });
  var SERIES = [
    { deep: C.aquaDeep, light: C.aqua },
    { deep: C.periDeep, light: C.peri },
    { deep: C.ink, light: 'rgba(12, 31, 64, .22)' }
  ];
  var WORLDS = D.evaluation.casesPerCondition;

  /* ---- Small helpers ------------------------------------------------------------ */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  // Progress of a sub-animation starting at `start` ms and lasting `dur` ms on clock t.
  function seg(t, start, dur, fn) {
    var p = clamp01((t - start) / dur);
    return fn ? fn(p) : p;
  }
  function px2(v) { return v.toFixed(2); }

  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, cls, attrs) {
    var e = svgEl('text', attrs, parent);
    e.setAttribute('x', x);
    e.setAttribute('y', y);
    if (cls) e.setAttribute('class', cls);
    e.textContent = str;
    return e;
  }
  function tint(e, color) { e.style.fill = color; return e; }
  // Attribute writes are cached so a still frame does not touch the DOM.
  function setAttr(e, name, v) {
    var key = '_rs_' + name;
    if (e[key] === v) return;
    e[key] = v;
    e.setAttribute(name, v);
  }
  function setText(e, s) {
    if (e._rs_text === s) return;
    e._rs_text = s;
    e.textContent = s;
  }
  function alpha(e, a) {
    a = a < 0.002 ? 0 : a > 0.998 ? 1 : a;
    setAttr(e, 'opacity', a === 0 || a === 1 ? String(a) : a.toFixed(3));
  }
  // Fade with a short rise: the deck's reveal in miniature.
  function reveal(e, a, dy) {
    alpha(e, a);
    setAttr(e, 'transform', a >= 0.998 ? 'translate(0 0)' : 'translate(0 ' + px2((1 - a) * (dy || 12)) + ')');
  }
  function setDir(root, dir) { root.style.setProperty('--rs-dir', dir < 0 ? '-1' : '1'); }

  /* ---- Panel: one view with a build clock ------------------------------------------ */
  // The SVG is laid out in stage px, w x h.
  function Panel(host, w, h) {
    this.el = document.createElement('div');
    this.el.className = 'rs-panel';
    this.svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, 'class': 'rs-svg', 'aria-hidden': 'true' });
    this.el.appendChild(this.svg);
    host.appendChild(this.el);
    this.t = 0;
    this.duration = 1000;
    this.on = false;
    this.hiddenAt = -Infinity;
    this.tw = null;
  }
  Panel.prototype.render = function () {};
  Panel.prototype.seek = function (t) { this.t = t; this.render(t); };
  Panel.prototype.stop = function () {
    if (this.tw) { this.tw.cancel(); this.tw = null; }
  };
  Panel.prototype.classes = function (on, out, instant) {
    var el = this.el;
    if (instant) el.classList.add('rs-snap');
    el.classList.toggle('is-on', on);
    el.classList.toggle('is-out', out);
    if (instant) {
      void el.offsetWidth;
      el.classList.remove('rs-snap');
    }
  };
  // Shows the panel and runs its build; returns true when the build starts over from t = 0.
  Panel.prototype.show = function (o) {
    var fresh = !this.on && performance.now() - this.hiddenAt > RESET_MS;
    this.on = true;
    if (fresh) {
      this.stop();
      this.classes(false, false, true);
      this.seek(0);
    }
    if (o.instant) {
      this.stop();
      this.classes(true, false, true);
      this.seek(this.duration);
      return fresh;
    }
    this.el.style.transitionDelay = (o.delay || 0) + 'ms';
    this.classes(true, false, false);
    this.play((o.delay || 0) + (o.lead || 0));
    return fresh;
  };
  Panel.prototype.play = function (delay) {
    var self = this;
    if (this.tw) return;
    if (this.t >= this.duration) { this.seek(this.duration); return; }
    this.tw = Deck.tween({
      from: this.t,
      to: this.duration,
      duration: this.duration - this.t,
      easing: ease.linear,
      delay: delay,
      onUpdate: function (v) { self.seek(v); },
      onDone: function () { self.tw = null; }
    });
  };
  Panel.prototype.hide = function (o) {
    if (o.instant) {
      this.stop();
      this.on = false;
      this.hiddenAt = -Infinity;
      this.classes(false, false, true);
      this.seek(0);
      return;
    }
    if (!this.on) return;
    this.on = false;
    this.stop();
    this.hiddenAt = performance.now();
    this.el.style.transitionDelay = '0ms';
    this.classes(false, true, false);
  };

  // A slide with one panel: built on mount, played on entry, lifted out on leave.
  function registerPanelScene(name, build) {
    var root = null;
    var panel = null;
    Deck.registerScene(name, {
      mount: function (section) {
        root = section.querySelector('.scene-root');
        root.classList.add('rs-root');
        panel = build(root);
        panel.seek(0);
      },
      enter: function (ctx) {
        setDir(root, ctx.dir);
        panel.show({ instant: ctx.instant, delay: ENTER.delay, lead: ENTER.lead });
      },
      leave: function (ctx) {
        setDir(root, ctx.dir);
        panel.hide({});
      }
    });
  }

  /* ==========================================================================
     Slide 15 · structure
     ========================================================================== */
  var STRUCT_W = 1760;
  var STRUCT_H = 440;

  // Two questions on one 0-1 scale, one dot per horizon: is each channel edge right (edge by
  // edge), and is the whole set exactly right? A column at the right prints the range.
  function buildStructure(host) {
    var P = new Panel(host, STRUCT_W, STRUCT_H);
    var svg = P.svg;
    var S = D.structure;
    function byCtx(f) { return CTX.map(f); }
    var groups = [
      { head: 'Edge by edge \u00b7 mean over worlds', rows: [
        { name: 'Precision', vals: byCtx(function (c) { return S.channels[c].precision; }) },
        { name: 'Recall', vals: byCtx(function (c) { return S.channels[c].recall; }) }
      ] },
      { head: 'Whole set exactly right \u00b7 share of worlds', rows: [
        { name: 'Channels', vals: byCtx(function (c) { return S.channels[c].exact; }) },
        { name: 'Channels and controls', vals: byCtx(function (c) { return S.channelsAndControlsExact[c]; }) }
      ] }
    ];
    var LABEL_X = 380;
    var X0 = 430;
    var X1 = 1470;
    var VAL_X = X1 + 40;   // the range column sits clear of the scale lines
    var HEAD = 34;         // group heading to its first row
    var ROW = 64;
    var GAP = 72;          // last row of a group to the next heading
    var TICKS = [0, 0.25, 0.5, 0.75, 1];
    function x(v) { return X0 + (X1 - X0) * v; }
    var y = 90;
    groups.forEach(function (g, gi) {
      if (gi) y += GAP - ROW;
      g.y = y;
      y += HEAD;
      g.rows.forEach(function (r) { r.y = y; y += ROW; });
    });
    var axisY = y - ROW + HEAD;

    // Scale lines run only beside each group's rows, so no line passes behind a heading.
    var grid = svgEl('g', null, svg);
    groups.forEach(function (g, gi) {
      var y0 = g.rows[0].y - 18;
      var y1 = gi === groups.length - 1 ? axisY : g.rows[g.rows.length - 1].y + 18;
      TICKS.forEach(function (v) {
        svgEl('line', { x1: x(v), x2: x(v), y1: y0, y2: y1, stroke: v === 0 ? C.hair : C.wash, 'stroke-width': 1 }, grid);
      });
    });
    svgEl('line', { x1: X0, x2: X1, y1: axisY, y2: axisY, stroke: C.ink3, 'stroke-width': 1 }, grid);
    TICKS.forEach(function (v) {
      svgEl('line', { x1: x(v), x2: x(v), y1: axisY, y2: axisY + 7, stroke: C.ink3, 'stroke-width': 1 }, grid);
      text(grid, x(v), axisY + 31, String(v), 't-mono', { 'text-anchor': 'middle' });
    });
    text(grid, X1, 22, WORLDS + ' full-input worlds \u00b7 under the specified prior', 't-mono', { 'text-anchor': 'end' });

    var LEG_X = [0, 90, 200];   // offsets from X0; label widths differ, so placed by hand
    var legend = CTX.map(function (ctx, k) {
      var g = svgEl('g', null, svg);
      svgEl('circle', { cx: X0 + LEG_X[k] + 8, cy: 15, r: 8, fill: SERIES[k].deep }, g);
      text(g, X0 + LEG_X[k] + 26, 22, k === CTX.length - 1 ? ctx + ' context weeks' : String(ctx), 't-lab t-ink');
      return g;
    });
    var heads = groups.map(function (g) { return text(svg, X0, g.y, g.head, 't-cap'); });

    var rows = [];
    groups.forEach(function (g, gi) {
      g.rows.forEach(function (r) {
        var lo = Math.min.apply(null, r.vals).toFixed(2);
        var hi = Math.max.apply(null, r.vals).toFixed(2);
        rows.push({
          gi: gi,
          vals: r.vals,
          label: text(svg, LABEL_X, r.y + 7, r.name, 't-lab t-ink', { 'text-anchor': 'end' }),
          range: svgEl('line', { x1: X0, x2: X0, y1: r.y, y2: r.y, stroke: C.hair, 'stroke-width': 2 }, svg),
          // In horizon order, so the 207-week dot sits on top where two dots meet.
          dots: r.vals.map(function (v, k) { return svgEl('circle', { cx: X0, cy: r.y, r: 9, fill: SERIES[k].deep, opacity: 0 }, svg); }),
          val: text(svg, VAL_X, r.y + 8, lo === hi ? hi : lo + '\u2013' + hi, 't-val')
        });
      });
    });

    P.duration = 2300;
    P.render = function (t) {
      alpha(grid, seg(t, 0, 700, ease.out));
      legend.forEach(function (g, k) { reveal(g, seg(t, 100 + k * 80, 600, ease.out)); });
      heads.forEach(function (h, gi) { reveal(h, seg(t, 150 + gi * 500, 600, ease.out)); });
      rows.forEach(function (row, i) {
        var st = 250 + i * 200 + row.gi * 100;
        var a = seg(t, st, 600, ease.out);
        var k = seg(t, st + 60, 1100, ease.outExpo);
        alpha(row.label, a);
        var lo = Infinity;
        var hi = -Infinity;
        row.dots.forEach(function (d, j) {
          var cx = lerp(X0, x(row.vals[j]), k);
          lo = Math.min(lo, cx);
          hi = Math.max(hi, cx);
          setAttr(d, 'cx', px2(cx));
          alpha(d, a);
        });
        setAttr(row.range, 'x1', px2(lo));
        setAttr(row.range, 'x2', px2(hi));
        alpha(row.range, a);
        reveal(row.val, seg(t, st + 800, 500, ease.out));
      });
    };
    return P;
  }

  /* ==========================================================================
     Slide 16 · crps
     ========================================================================== */
  // Every method of Table 12. The native PyMC-Marketing MMM runs in all five conditions.
  var METHODS = [
    { key: 'mfm', name: 'River', fill: C.aquaDeep },
    { key: 'pathmc', name: 'PathMC', fill: C.peri },
    { key: 'ols', name: 'OLS', fill: C.ols },
    { key: 'mmm', name: 'PyMC-Marketing', fill: C.ink, note: ' \u00b7 default priors' }
  ];
  var CRPS_W = 1760;
  var CRPS_H = 590;

  // One dot plot over every condition and horizon: rows in condition groups, one row per
  // horizon. The entrance builds it once: rows in reading order, dots sliding out from zero.
  function buildCrps(host) {
    var P = new Panel(host, CRPS_W, CRPS_H);
    var svg = P.svg;
    var rows = D.crpsChannels;
    var oop = D.evaluation.outOfPrior;
    var max = 0;
    rows.forEach(function (r) { METHODS.forEach(function (m) { max = Math.max(max, r[m.key]); }); });
    var TICK = 0.05;
    var DMAX = Math.ceil(max / TICK - 1e-9) * TICK;
    var LABEL_X = 330;
    var CTX_X = 388;
    var X0 = 420;
    var X1 = 1700;
    function x(v) { return X0 + (X1 - X0) * v / DMAX; }

    var ROW = 28;
    var GROUP = (CTX.length - 1) * ROW + 34;
    var RY0 = 100;
    var groupOf = [];
    var posOf = [];
    rows.forEach(function (r, i) {
      var starts = i === 0 || rows[i - 1].condition !== r.condition;
      groupOf.push(i === 0 ? 0 : groupOf[i - 1] + (starts ? 1 : 0));
      posOf.push(starts ? 0 : posOf[i - 1] + 1);
    });
    function rowY(i) { return RY0 + groupOf[i] * GROUP + posOf[i] * ROW; }
    var axisY = rowY(rows.length - 1) + 30;

    // Scale: a hairline at zero, a faint line per tick, the measure named at the top right.
    var grid = svgEl('g', null, svg);
    for (var k = 0; k * TICK <= DMAX + 1e-9; k++) {
      var xv = x(k * TICK);
      svgEl('line', { x1: xv, x2: xv, y1: RY0 - 22, y2: axisY, stroke: k === 0 ? C.hair : C.wash, 'stroke-width': 1 }, grid);
      svgEl('line', { x1: xv, x2: xv, y1: axisY, y2: axisY + 7, stroke: C.ink3, 'stroke-width': 1 }, grid);
      text(grid, xv, axisY + 31, k === 0 ? '0' : (k * TICK).toFixed(2), 't-mono', { 'text-anchor': 'middle' });
    }
    svgEl('line', { x1: X0, x2: X1, y1: axisY, y2: axisY, stroke: C.ink3, 'stroke-width': 1 }, grid);
    text(grid, X1, 22, 'query channel CRPS \u00b7 lower is better', 't-mono', { 'text-anchor': 'end' });
    text(grid, CTX_X, RY0 - 36, 'context', 't-mono t-small', { 'text-anchor': 'end' });

    var LEG_X = [0, 130, 280, 400];   // offsets from X0; name widths differ, so placed by hand
    var legend = METHODS.map(function (m, k) {
      var g = svgEl('g', null, svg);
      svgEl('circle', { cx: X0 + LEG_X[k] + 8, cy: 15, r: 8, fill: m.fill }, g);
      var name = text(g, X0 + LEG_X[k] + 26, 22, m.name, 't-lab t-ink');
      if (m.note) svgEl('tspan', { 'class': 't-mono t-small' }, name).textContent = m.note;
      return g;
    });

    var dotRows = rows.map(function (r, i) {
      var y = rowY(i);
      var labels = svgEl('g', null, svg);
      if (posOf[i] === 0) {
        // The condition label sits on its group of rows; an out-of-prior condition is tagged
        // under its name and bracketed across all of its rows.
        var last = i;
        while (last + 1 < rows.length && rows[last + 1].condition === r.condition) last++;
        var mid = (y + rowY(last)) / 2;
        var outOfPrior = oop.indexOf(r.condition) !== -1;
        text(labels, LABEL_X, mid + (outOfPrior ? -3 : 7), r.condition, 't-lab t-ink', { 'text-anchor': 'end' });
        if (outOfPrior) {
          tint(text(labels, LABEL_X, mid + 19, 'out of prior', 't-mono t-small', { 'text-anchor': 'end' }), C.peachDeep);
          svgEl('path', {
            d: 'M' + (LABEL_X + 16) + ' ' + (y - 12) + 'H' + (LABEL_X + 11) + 'V' + (rowY(last) + 12) + 'H' + (LABEL_X + 16),
            fill: 'none', stroke: C.peachDeep, 'stroke-width': 1.5, 'stroke-linejoin': 'round'
          }, labels);
        }
      }
      text(labels, CTX_X, y + 6, String(r.context), 't-mono', { 'text-anchor': 'end' });
      var range = svgEl('line', { x1: X0, x2: X0, y1: y, y2: y, stroke: C.hair, 'stroke-width': 2 }, svg);
      // Drawn last to first, so River's dot sits on top where two dots come close.
      var dots = [];
      for (var m = METHODS.length - 1; m >= 0; m--) {
        dots[m] = svgEl('circle', { cx: X0, cy: y, r: 8, fill: METHODS[m].fill, opacity: 0 }, svg);
      }
      return { r: r, labels: labels, range: range, dots: dots };
    });

    P.duration = 2400;
    P.render = function (t) {
      alpha(grid, seg(t, 0, 700, ease.out));
      legend.forEach(function (g, k) { reveal(g, seg(t, 100 + k * 80, 600, ease.out)); });
      dotRows.forEach(function (row, i) {
        var a = seg(t, 200 + i * 70, 600, ease.out);
        var slide = seg(t, 260 + i * 70, 1100, ease.outExpo);
        alpha(row.labels, a);
        var lo = Infinity;
        var hi = -Infinity;
        row.dots.forEach(function (d, k) {
          var cx = lerp(X0, x(row.r[METHODS[k].key]), slide);
          lo = Math.min(lo, cx);
          hi = Math.max(hi, cx);
          setAttr(d, 'cx', px2(cx));
          alpha(d, a);
        });
        setAttr(row.range, 'x1', px2(lo));
        setAttr(row.range, 'x2', px2(hi));
        alpha(row.range, a);
      });
    };
    return P;
  }

  registerPanelScene('structure', buildStructure);
  registerPanelScene('crps', buildCrps);
})();
