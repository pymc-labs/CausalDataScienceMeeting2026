/* ==========================================================================
   Results scenes, LIGHT theme.
     structure · slide 17   0 the hidden true graph beside River's draws
                            1 edge-by-edge precision and recall
                            2 reliability of the edge probabilities
                            3 exact-set recovery, one cell per world
     crps      · slide 18   0 full inputs, 99 context weeks: three bars
                            1 the bars fold into a dot plot of every condition
                            2 River against PyMC-Marketing
   Every number on screen is read from window.DECK_DATA. The graph of
   structure step 0 is illustrative and says so on screen.

   Each view is a panel: an SVG laid out in stage px (940 x 800) whose build is
   a pure function of a clock t (ms). Showing a panel runs t forward; hiding it
   lifts it out and freezes t; a panel hidden for longer than RESET_MS builds
   again from t = 0. Steps, jumps, reversals and re-entries therefore only
   choose the visible panel (and, on slide 18, a morph parameter).
   ========================================================================== */
(function () {
  'use strict';

  var D = window.DECK_DATA;
  var ease = Deck.ease;
  var NS = 'http://www.w3.org/2000/svg';
  var VIEW_W = 940;
  var VIEW_H = 800;
  var RESET_MS = 650;
  var ENTER = { delay: 260, lead: 160 };   // slide entrance: CSS rise delay, then the build
  var STEP = { delay: 160, lead: 120 };    // step change
  var VAL_ADVANCE = 0.6 * 24;              // Fira Mono glyph advance at the 24 px of .t-val

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

  // The two horizons in paper order (99, then 207 context weeks): aqua, then peri.
  var CTX = D.evaluation.horizons.map(function (h) { return h.context; });
  var SERIES = [{ deep: C.aquaDeep, light: C.aqua }, { deep: C.periDeep, light: C.peri }];
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
  function Panel(host) {
    this.el = document.createElement('div');
    this.el.className = 'rs-panel';
    this.svg = svgEl('svg', { viewBox: '0 0 ' + VIEW_W + ' ' + VIEW_H, 'class': 'rs-svg', 'aria-hidden': 'true' });
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

  /* ---- Quadratic edges for the schematic graphs ------------------------------------- */
  function qAt(q, t) {
    var u = 1 - t;
    return {
      x: u * u * q[0].x + 2 * u * t * q[1].x + t * t * q[2].x,
      y: u * u * q[0].y + 2 * u * t * q[1].y + t * t * q[2].y
    };
  }
  function qDir(q, t) {
    var x = 2 * (1 - t) * (q[1].x - q[0].x) + 2 * t * (q[2].x - q[1].x);
    var y = 2 * (1 - t) * (q[1].y - q[0].y) + 2 * t * (q[2].y - q[1].y);
    var l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }
  // The piece of q between t0 and t1, as a quadratic of its own (blossom of the control point).
  function qSub(q, t0, t1) {
    var w0 = (1 - t0) * (1 - t1);
    var w1 = (1 - t0) * t1 + t0 * (1 - t1);
    var w2 = t0 * t1;
    return [qAt(q, t0), {
      x: w0 * q[0].x + w1 * q[1].x + w2 * q[2].x,
      y: w0 * q[0].y + w1 * q[1].y + w2 * q[2].y
    }, qAt(q, t1)];
  }
  // Curve parameter at distance d from the start (or from the end).
  function qTrim(q, d, fromEnd) {
    var ref = fromEnd ? q[2] : q[0];
    var lo = 0;
    var hi = 1;
    for (var k = 0; k < 28; k++) {
      var mid = (lo + hi) / 2;
      var p = qAt(q, mid);
      var dd = Math.hypot(p.x - ref.x, p.y - ref.y);
      if (fromEnd ? dd < d : dd >= d) hi = mid; else lo = mid;
    }
    return fromEnd ? lo : hi;
  }
  function qLen(q) {
    var len = 0;
    var prev = q[0];
    for (var i = 1; i <= 32; i++) {
      var p = qAt(q, i / 32);
      len += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
    return len;
  }
  function qPath(q) {
    return 'M' + px2(q[0].x) + ' ' + px2(q[0].y) + 'Q' + px2(q[1].x) + ' ' + px2(q[1].y) + ' ' + px2(q[2].x) + ' ' + px2(q[2].y);
  }

  // A gentle quadratic edge from disc a (radius ra) to disc b (radius rb), with an optional arrowhead.
  function graphEdge(parent, a, b, ra, rb, o) {
    var q = [a, { x: lerp(a.x, b.x, 0.5), y: lerp(a.y, b.y, 0.12) }, b];
    var head = o.head || 0;
    var tTip = qTrim(q, rb + 5, true);
    var line = qSub(q, qTrim(q, ra + 6, false), head ? qTrim(q, rb + 5 + head * 0.7, true) : tTip);
    var g = svgEl('g', null, parent);
    var path = svgEl('path', { d: qPath(line), fill: 'none', stroke: o.color, 'stroke-width': o.width, 'stroke-linecap': 'round' }, g);
    var len = qLen(line);
    if (o.dash) path.setAttribute('stroke-dasharray', o.dash);
    else path.setAttribute('stroke-dasharray', px2(len) + ' ' + px2(len + 2));
    var arrow = null;
    if (head) {
      var tip = qAt(q, tTip);
      var u = qDir(q, tTip);
      var bx = tip.x - u.x * head;
      var by = tip.y - u.y * head;
      var nx = -u.y * head * 0.46;
      var ny = u.x * head * 0.46;
      arrow = svgEl('path', {
        d: 'M' + px2(tip.x) + ' ' + px2(tip.y) + 'L' + px2(bx + nx) + ' ' + px2(by + ny) + 'L' + px2(bx - nx) + ' ' + px2(by - ny) + 'Z',
        fill: o.color
      }, g);
    }
    return { g: g, q: line, path: path, arrow: arrow, len: len };
  }
  // Draws a solid edge from its source: k = 0 hidden, k = 1 complete with its arrowhead.
  function drawEdge(e, k) {
    alpha(e.path, k > 0 ? 1 : 0);
    setAttr(e.path, 'stroke-dashoffset', px2(e.len * (1 - k)));
    if (e.arrow) alpha(e.arrow, seg(k, 0.82, 0.18));
  }
  function disc(parent, p, r, fill, stroke) {
    return svgEl('circle', { cx: p.x, cy: p.y, r: r, fill: fill, stroke: stroke, 'stroke-width': 1.5 }, parent);
  }
  function lockIcon(parent, x, y, color) {
    var g = svgEl('g', {
      transform: 'translate(' + x + ' ' + y + ')',
      fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }, parent);
    svgEl('path', { d: 'M4.5 9.5V6.5a4.5 4.5 0 0 1 9 0v3' }, g);
    svgEl('rect', { x: 1.5, y: 9.5, width: 15, height: 11.5, rx: 2.5 }, g);
    svgEl('circle', { cx: 9, cy: 15.2, r: 1.5, fill: color, stroke: 'none' }, g);
    return g;
  }

  /* ==========================================================================
     Slide 17 · structure
     ========================================================================== */
  var INPUTS = [
    { name: 'TV', color: '#3E9C8C' },
    { name: 'Search', color: '#62B5A6' },
    { name: 'Social', color: '#92D0C4' },
    { name: 'Promo', color: '#6874C4' },
    { name: 'Holiday', color: '#A3ACE0' }
  ];
  // Illustrative example, the same as in the cold-open film: TV, Search and Promo act on sales.
  var EXAMPLE_GRAPH = [1, 1, 0, 1, 0];
  var EXAMPLE_P = [0.94, 0.90, 0.30, 0.86, 0.16];

  // Step 0: the true graph, hidden at inference, beside River's draws.
  function buildSchematic(host) {
    var P = new Panel(host);
    var svg = P.svg;
    var R = 28;
    var RS = 36;
    var Y0 = 236;
    var DY = 84;
    function layout(x0) {
      return {
        nodes: INPUTS.map(function (_, i) { return { x: x0 + 134, y: Y0 + i * DY }; }),
        sales: { x: x0 + 362, y: Y0 + 2 * DY }
      };
    }
    var L = layout(0);
    var Rt = layout(520);

    var defs = svgEl('defs', null, svg);
    var veilFilter = svgEl('filter', { id: 'rs-veil', x: '-10%', y: '-10%', width: '120%', height: '120%' }, defs);
    svgEl('feGaussianBlur', { stdDeviation: '2.2' }, veilFilter);

    // Left: the true graph, stored with the world, not supplied at inference.
    var frame = svgEl('rect', {
      x: 0.75, y: 72, width: 418, height: 572, rx: 18,
      fill: 'rgba(12, 31, 64, .025)', stroke: 'rgba(12, 31, 64, .3)', 'stroke-width': 1.5, 'stroke-dasharray': '6 6'
    }, svg);
    var headL = svgEl('g', null, svg);
    lockIcon(headL, 28, 99, C.ink2);
    tint(text(headL, 58, 118, 'True graph', 't-title'), C.ink2);
    text(headL, 28, 148, 'hidden at inference', 't-mono');
    var veil = svgEl('g', { filter: 'url(#rs-veil)' }, svg);
    var hidEdges = svgEl('g', null, veil);
    EXAMPLE_GRAPH.forEach(function (on, i) {
      graphEdge(hidEdges, L.nodes[i], L.sales, R, RS, on
        ? { color: 'rgba(12, 31, 64, .42)', width: 2.5, head: 11, dash: 'none' }
        : { color: 'rgba(12, 31, 64, .2)', width: 1.5, dash: '6 6' });
    });
    var hidNodes = INPUTS.map(function (inp, i) {
      var g = svgEl('g', null, veil);
      disc(g, L.nodes[i], R, 'rgba(12, 31, 64, .04)', 'rgba(12, 31, 64, .34)');
      text(g, L.nodes[i].x - R - 14, L.nodes[i].y + 7, inp.name, 't-lab', { 'text-anchor': 'end' });
      return g;
    });
    var hidSales = svgEl('g', null, veil);
    disc(hidSales, L.sales, RS, 'rgba(12, 31, 64, .4)', 'none');
    text(hidSales, L.sales.x, L.sales.y + 6, 'Sales', 't-sales', { 'text-anchor': 'middle' });

    // Between them: the question the next steps answer.
    var ask = svgEl('g', null, svg);
    svgEl('circle', { cx: 476, cy: L.sales.y, r: 30, fill: 'none', stroke: C.hair, 'stroke-width': 1.5 }, ask);
    text(ask, 476, L.sales.y + 13, '?', 't-q', { 'text-anchor': 'middle' });

    // Right: River's draws, edge opacity = how often an edge appears among the draws.
    var headR = svgEl('g', null, svg);
    text(headR, 534, 118, 'River\u2019s draws', 't-title');
    text(headR, 534, 148, 'edge probabilities \u00b7 illustrative', 't-mono');
    var edges = EXAMPLE_P.map(function (p, i) {
      var e = graphEdge(svg, Rt.nodes[i], Rt.sales, R, RS, { color: C.ink, width: 2.5, head: 11 });
      alpha(e.g, Math.max(0.12, p));
      var below = Rt.nodes[i].y > Rt.sales.y;
      e.label = text(svg, Rt.nodes[i].x + R + 12, Rt.nodes[i].y + (below ? 30 : -14), p.toFixed(2), 't-mono t-small');
      e.p = p;
      return e;
    });
    var dotsLayer = svgEl('g', null, svg);
    edges.forEach(function (e, i) {
      e.dots = [0, 1, 2].map(function () { return svgEl('circle', { r: 3, fill: INPUTS[i].color, opacity: 0 }, dotsLayer); });
    });
    var rNodes = INPUTS.map(function (inp, i) {
      var g = svgEl('g', null, svg);
      var c = disc(g, Rt.nodes[i], R, inp.color, inp.color);
      text(g, Rt.nodes[i].x - R - 14, Rt.nodes[i].y + 7, inp.name, 't-lab t-ink', { 'text-anchor': 'end' });
      return { g: g, c: c };
    });
    var rSales = svgEl('g', null, svg);
    var rSalesDisc = disc(rSales, Rt.sales, RS, C.ink, C.ink);
    text(rSales, Rt.sales.x, Rt.sales.y + 6, 'Sales', 't-sales', { 'text-anchor': 'middle' });

    var flow = 0;   // 0..1, how much the travelling particles show (ramps in after the build)
    P.duration = 2300;
    P.render = function (t) {
      alpha(frame, seg(t, 0, 700, ease.out));
      reveal(headL, seg(t, 60, 700, ease.out));
      hidNodes.forEach(function (g, i) { alpha(g, seg(t, 120 + i * 60, 600, ease.out)); });
      alpha(hidSales, seg(t, 360, 600, ease.out));
      alpha(hidEdges, seg(t, 420, 700, ease.out));
      alpha(ask, seg(t, 760, 700, ease.out));
      reveal(headR, seg(t, 200, 700, ease.out));
      rNodes.forEach(function (n, i) {
        var k = seg(t, 300 + i * 70, 650, ease.outQuart);
        alpha(n.g, k);
        setAttr(n.c, 'r', px2(R * (0.72 + 0.28 * k)));
      });
      var ks = seg(t, 620, 650, ease.outQuart);
      alpha(rSales, ks);
      setAttr(rSalesDisc, 'r', px2(RS * (0.72 + 0.28 * ks)));
      edges.forEach(function (e, i) {
        drawEdge(e, seg(t, 820 + i * 80, 900, ease.inOut));
        alpha(e.label, seg(t, 1300 + i * 80, 500, ease.out));
      });
      flow = seg(t, 1700, 600);
      if (flow === 0) edges.forEach(function (e) { e.dots.forEach(function (d) { alpha(d, 0); }); });
    };
    // Data flow: particles in each input's colour travel along its edge, as visible as the edge is probable.
    P.tick = function (ms) {
      if (flow === 0) return;
      var s = ms / 1000;
      edges.forEach(function (e, i) {
        e.dots.forEach(function (d, k) {
          var u = (s * 0.42 + k / 3 + i * 0.137) % 1;
          var pt = qAt(e.q, u);
          setAttr(d, 'cx', px2(pt.x));
          setAttr(d, 'cy', px2(pt.y));
          alpha(d, flow * e.p * Math.sin(Math.PI * u));
        });
      });
    };
    return P;
  }

  // Step 1: precision and recall of channel edges, one group per horizon.
  function buildPrecisionRecall(host) {
    var P = new Panel(host);
    var svg = P.svg;
    var X0 = 210;
    var X1 = 730;
    var BAR = 46;
    var TOP = 150;
    var GROUP = 236;
    function x(v) { return X0 + (X1 - X0) * v; }

    var head = text(svg, X0, 62, 'channel edges \u00b7 ' + WORLDS + ' full-input worlds', 't-mono');
    var rows = [];
    var titles = CTX.map(function (ctx, gi) {
      var s = D.structure.channels[ctx];
      var col = SERIES[gi].deep;
      var y0 = TOP + gi * GROUP;
      var title = tint(text(svg, X0, y0, ctx + ' context weeks', 't-lab t-strong'), col);
      [['precision', s.precision], ['recall', s.recall]].forEach(function (m, mi) {
        var yc = y0 + 52 + mi * 66;
        var g = svgEl('g', null, svg);
        text(g, X0 - 20, yc + 7, m[0], 't-lab', { 'text-anchor': 'end' });
        svgEl('rect', { x: X0, y: yc - BAR / 2, width: X1 - X0, height: BAR, fill: C.wash }, g);
        var bar = svgEl('rect', { x: X0, y: yc - BAR / 2, width: 0, height: BAR, fill: col }, svg);
        var val = text(svg, X1 + 28, yc + 13, (0).toFixed(2), 't-big');
        rows.push({ gi: gi, mi: mi, v: m[1], g: g, bar: bar, val: val });
      });
      return title;
    });
    var ay = TOP + GROUP + 52 + 66 + BAR / 2 + 28;
    var axis = svgEl('g', null, svg);
    svgEl('line', { x1: X0, x2: X1, y1: ay, y2: ay, stroke: C.ink3, 'stroke-width': 1 }, axis);
    [0, 0.5, 1].forEach(function (v) {
      svgEl('line', { x1: x(v), x2: x(v), y1: ay, y2: ay + 7, stroke: C.ink3, 'stroke-width': 1 }, axis);
      text(axis, x(v), ay + 31, String(v), 't-mono', { 'text-anchor': 'middle' });
    });
    var note = text(svg, X0, ay + 96, 'edge included when marginal probability \u2265 0.5', 't-mono');

    P.duration = 2300;
    P.render = function (t) {
      reveal(head, seg(t, 0, 600, ease.out));
      titles.forEach(function (e, gi) { reveal(e, seg(t, 80 + gi * 340, 600, ease.out)); });
      rows.forEach(function (r) {
        var st = 260 + r.gi * 340 + r.mi * 100;
        alpha(r.g, seg(t, st - 160, 500, ease.out));
        var k = seg(t, st, 1300, ease.outExpo);
        setAttr(r.bar, 'width', px2((X1 - X0) * r.v * k));
        alpha(r.val, seg(t, st, 250));
        setText(r.val, (r.v * k).toFixed(2));
      });
      alpha(axis, seg(t, 300, 700, ease.out));
      reveal(note, seg(t, 1500, 700, ease.out));
    };
    return P;
  }

  // Step 2: reliability diagram of the channel edge probabilities, both horizons.
  function buildReliability(host) {
    var P = new Panel(host);
    var svg = P.svg;
    var X0 = 190;
    var X1 = 730;
    var Y0 = 600;   // f = 0
    var Y1 = 60;    // f = 1
    var RK = 1.25;  // radius per sqrt(edges in bin): point area is proportional to the count
    var POP = 0.16; // share of the line's draw over which one point grows
    function px(v) { return X0 + (X1 - X0) * v; }
    function py(v) { return Y0 + (Y1 - Y0) * v; }

    // Range-frame axes, set slightly off the data.
    var frame = svgEl('g', null, svg);
    var AX = Y0 + 22;
    var AY = X0 - 22;
    svgEl('line', { x1: px(0.5), x2: px(0.5), y1: py(0), y2: py(1), stroke: C.wash, 'stroke-width': 1 }, frame);
    svgEl('line', { x1: px(0), x2: px(1), y1: py(0.5), y2: py(0.5), stroke: C.wash, 'stroke-width': 1 }, frame);
    svgEl('line', { x1: px(0), x2: px(1), y1: AX, y2: AX, stroke: C.ink3, 'stroke-width': 1 }, frame);
    svgEl('line', { x1: AY, x2: AY, y1: py(0), y2: py(1), stroke: C.ink3, 'stroke-width': 1 }, frame);
    [0, 0.5, 1].forEach(function (v) {
      svgEl('line', { x1: px(v), x2: px(v), y1: AX, y2: AX + 7, stroke: C.ink3, 'stroke-width': 1 }, frame);
      text(frame, px(v), AX + 31, String(v), 't-mono', { 'text-anchor': 'middle' });
      svgEl('line', { x1: AY - 7, x2: AY, y1: py(v), y2: py(v), stroke: C.ink3, 'stroke-width': 1 }, frame);
      text(frame, AY - 14, py(v) + 5, String(v), 't-mono', { 'text-anchor': 'end' });
    });
    text(frame, px(0.5), AX + 74, 'mean predicted probability', 't-lab', { 'text-anchor': 'middle' });
    text(frame, 0, 0, 'observed frequency', 't-lab', {
      'text-anchor': 'middle', transform: 'translate(' + (AY - 70) + ' ' + py(0.5) + ') rotate(-90)'
    });

    var diag = svgEl('line', {
      x1: px(0), y1: py(0), x2: px(0), y2: py(0),
      stroke: C.ink3, 'stroke-width': 1.25, 'stroke-dasharray': '6 6'
    }, svg);
    var diagLabel = text(svg, px(1) + 26, py(1) + 5, 'calibrated', 't-mono');

    var labelAt = [{ p: 0.62, f: 0.25 }, { p: 0.03, f: 0.93 }];
    var series = CTX.map(function (ctx, si) {
      var bins = D.structure.reliability[ctx];
      var col = SERIES[si];
      var g = svgEl('g', null, svg);
      var pts = bins.map(function (b) { return { x: px(b.p), y: py(b.f), r: RK * Math.sqrt(b.n) }; });
      var frac = [0];
      var total = 0;
      for (var j = 1; j < pts.length; j++) {
        total += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
        frac.push(total);
      }
      frac = frac.map(function (v) { return v / total; });
      var path = svgEl('path', {
        d: 'M' + pts.map(function (p) { return px2(p.x) + ' ' + px2(p.y); }).join('L'),
        fill: 'none', stroke: col.deep, 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'stroke-dasharray': px2(total) + ' ' + px2(total + 2)
      }, g);
      var dots = pts.map(function (p) {
        return svgEl('circle', { cx: px2(p.x), cy: px2(p.y), r: 0, fill: col.light, 'fill-opacity': 0.82, stroke: col.deep, 'stroke-width': 1.5 }, g);
      });
      var at = labelAt[si];
      var label = svgEl('g', null, svg);
      tint(text(label, px(at.p), py(at.f), ctx + ' context weeks', 't-lab t-strong'), col.deep);
      text(label, px(at.p), py(at.f) + 30, 'ECE ' + D.structure.channels[ctx].ece.toFixed(2), 't-val');
      return { path: path, dots: dots, pts: pts, frac: frac, total: total, label: label };
    });
    var note = text(svg, X0, AX + 122, 'channel edges \u00b7 point area \u221d edges in the bin', 't-mono');

    P.duration = 2900;
    P.render = function (t) {
      reveal(frame, seg(t, 0, 700, ease.out));
      var kd = seg(t, 150, 1000, ease.inOut);
      setAttr(diag, 'x2', px2(px(kd)));
      setAttr(diag, 'y2', px2(py(kd)));
      alpha(diag, kd > 0 ? 1 : 0);
      alpha(diagLabel, seg(t, 950, 500, ease.out));
      series.forEach(function (s, si) {
        var st = 520 + si * 700;
        var k = seg(t, st, 1300, ease.inOut);
        alpha(s.path, k > 0 ? 1 : 0);
        setAttr(s.path, 'stroke-dashoffset', px2(s.total * (1 - k)));
        // Each point grows as the line reaches it, and is full size when the line is complete.
        s.dots.forEach(function (d, j) {
          var kj = ease.outQuart(clamp01((k - s.frac[j] * (1 - POP)) / POP));
          setAttr(d, 'r', px2(s.pts[j].r * kj));
          alpha(d, kj);
        });
        reveal(s.label, seg(t, st + 1000, 600, ease.out));
      });
      reveal(note, seg(t, 2300, 600, ease.out));
    };
    return P;
  }

  // Step 3: exact-set recovery as waffles, one cell per world, filled in sequence.
  function buildWaffles(host) {
    var P = new Panel(host);
    var svg = P.svg;
    var CELL = 19;
    var GAP = 5;
    var N = 10;
    var SIZE = N * CELL + (N - 1) * GAP;
    var COLX = [30, 490];
    var TOP = [118, 432];
    var STEP_MS = 14;
    var defs = [
      { title: 'Exact live-channel set', vals: CTX.map(function (c) { return D.structure.channels[c].exact; }) },
      { title: 'Channels and controls', vals: CTX.map(function (c) { return D.structure.channelsAndControlsExact[c]; }) }
    ];
    var heads = CTX.map(function (ctx, ci) {
      return tint(text(svg, COLX[ci], 44, ctx + ' context weeks', 't-lab t-strong'), SERIES[ci].deep);
    });
    var waffles = [];
    var titles = defs.map(function (d, ri) {
      var top = TOP[ri];
      var title = text(svg, COLX[0], top - 26, d.title, 't-lab t-ink');
      CTX.forEach(function (ctx, ci) {
        var count = Math.round(d.vals[ci] * WORLDS);
        var grid = svgEl('g', null, svg);
        var fills = [];
        for (var k = 0; k < N * N; k++) {
          var x = COLX[ci] + Math.floor(k / N) * (CELL + GAP);
          var y = top + (k % N) * (CELL + GAP);
          svgEl('rect', { x: x, y: y, width: CELL, height: CELL, rx: 3, fill: C.wash }, grid);
          if (k < count) fills.push(svgEl('rect', { x: x, y: y, width: CELL, height: CELL, rx: 3, fill: SERIES[ci].deep, opacity: 0 }, svg));
        }
        var num = text(svg, COLX[ci] + SIZE + 24, top + 48, '0', 't-count');
        var of = text(svg, COLX[ci] + SIZE + 26, top + 78, 'of ' + WORLDS, 't-mono');
        waffles.push({ ri: ri, ci: ci, grid: grid, fills: fills, num: num, of: of });
      });
      return title;
    });
    var note = text(svg, COLX[0], TOP[1] + SIZE + 56, 'one cell = one world \u00b7 ' + WORLDS + ' full-input worlds', 't-mono');

    function start(w) { return 360 + w.ri * 1050 + w.ci * 160; }
    P.duration = 2900;   // the note finishes last unless a waffle fills longer
    waffles.forEach(function (w) { P.duration = Math.max(P.duration, start(w) + w.fills.length * STEP_MS + 240); });
    P.render = function (t) {
      heads.forEach(function (e, ci) { reveal(e, seg(t, ci * 100, 600, ease.out)); });
      titles.forEach(function (e, ri) { reveal(e, seg(t, 120 + ri * 1050, 600, ease.out)); });
      waffles.forEach(function (w) {
        var st = start(w);
        alpha(w.grid, seg(t, st - 260, 500, ease.out));
        var shown = 0;
        w.fills.forEach(function (c, k) {
          var a = seg(t, st + k * STEP_MS, 240, ease.out);
          alpha(c, a);
          if (a >= 0.5) shown++;
        });
        alpha(w.num, seg(t, st - 160, 400, ease.out));
        alpha(w.of, seg(t, st - 160, 400, ease.out));
        setText(w.num, String(shown));
      });
      reveal(note, seg(t, 2300, 600, ease.out));
    };
    return P;
  }

  (function () {
    var root = null;
    var panels = [];
    var active = false;
    var raf = 0;

    function loop(ms) {
      panels[0].tick(ms);
      raf = requestAnimationFrame(loop);
    }
    function startLoop() { if (!raf) raf = requestAnimationFrame(loop); }
    function stopLoop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function apply(step, o) {
      var cur = Math.max(0, Math.min(panels.length - 1, step | 0));
      panels.forEach(function (p, i) { if (i !== cur) p.hide(o); });
      panels[cur].show(o);
      if (active && cur === 0 && !Deck.reducedMotion) startLoop();
      else stopLoop();
    }

    Deck.registerScene('structure', {
      mount: function (section) {
        root = section.querySelector('.scene-root');
        root.classList.add('rs-root');
        panels = [buildSchematic(root), buildPrecisionRecall(root), buildReliability(root), buildWaffles(root)];
        panels.forEach(function (p) { p.seek(0); });
      },
      enter: function (ctx) {
        active = true;
        setDir(root, ctx.dir);
        apply(ctx.step, { instant: ctx.instant, delay: ENTER.delay, lead: ENTER.lead });
      },
      step: function (ctx) {
        setDir(root, ctx.dir);
        apply(ctx.step, { instant: ctx.instant, delay: STEP.delay, lead: STEP.lead });
      },
      leave: function (ctx) {
        active = false;
        stopLoop();
        setDir(root, ctx.dir);
        panels.forEach(function (p) { p.hide({}); });
      }
    });
  })();

  /* ==========================================================================
     Slide 18 · crps
     ========================================================================== */
  var METHODS = [
    { key: 'mfm', name: 'River', fill: C.aquaDeep },
    { key: 'pathmc', name: 'PathMC', fill: C.peri },
    { key: 'ols', name: 'OLS', fill: C.ols }
  ];

  // Steps 0 and 1: three bars for full inputs at 99 context weeks, which fold into
  // the first row of a dot plot over every condition and horizon (shared x scale).
  function buildCrps(host) {
    var P = new Panel(host);
    var svg = P.svg;
    var rows = D.crpsChannels;
    var oop = D.evaluation.outOfPrior;
    var first = rows.filter(function (r) { return r.condition === D.evaluation.conditionNames[0] && r.context === CTX[0]; })[0];
    var max = 0;
    rows.forEach(function (r) { METHODS.forEach(function (m) { max = Math.max(max, r[m.key]); }); });
    var DMAX = Math.ceil(max / 0.05 - 1e-9) * 0.05;
    var X0 = 300;
    var X1 = 880;
    function x(v) { return X0 + (X1 - X0) * v / DMAX; }

    // --- state 0: bars
    var BAR = 58;
    var barY = [262, 366, 470];
    var head0 = svgEl('g', null, svg);
    text(head0, X0, 118, first.condition.toLowerCase() + ' \u00b7 ' + first.context + ' context weeks', 't-mono');
    text(head0, X0, 148, 'CRPS \u00b7 lower is better', 't-mono');
    var bars = METHODS.map(function (m, k) {
      var name = text(svg, X0 - 24, barY[k] + 9, m.name, 't-name', { 'text-anchor': 'end' });
      var rect = svgEl('rect', { x: X0, y: barY[k] - BAR / 2, width: 0, height: BAR, fill: m.fill }, svg);
      var val = text(svg, X0, barY[k] + 9, '', 't-val');
      return { v: first[m.key], name: name, rect: rect, val: val };
    });
    var wins = text(svg, X0, 580, 'joint wins over both: ' + first.wins, 't-mono');

    // --- state 1: dot plot. Rows come in condition groups, one row per horizon.
    var ROW = 48;
    var GROUP = (CTX.length - 1) * ROW + 64;
    var RY0 = 152;
    var LABEL_X = 222;
    var CTX_X = 280;
    var groupOf = [];
    var posOf = [];
    rows.forEach(function (r, i) {
      var starts = i === 0 || rows[i - 1].condition !== r.condition;
      groupOf.push(i === 0 ? 0 : groupOf[i - 1] + (starts ? 1 : 0));
      posOf.push(starts ? 0 : posOf[i - 1] + 1);
    });
    function rowY(i) { return RY0 + groupOf[i] * GROUP + posOf[i] * ROW; }
    var axisY = rowY(rows.length - 1) + 40;
    var grid = svgEl('g', null, svg);
    [0, 0.1, 0.2].forEach(function (v) {
      svgEl('line', { x1: x(v), x2: x(v), y1: RY0 - 28, y2: axisY, stroke: v === 0 ? C.hair : C.wash, 'stroke-width': 1 }, grid);
      svgEl('line', { x1: x(v), x2: x(v), y1: axisY, y2: axisY + 7, stroke: C.ink3, 'stroke-width': 1 }, grid);
      text(grid, x(v), axisY + 31, String(v), 't-mono', { 'text-anchor': 'middle' });
    });
    svgEl('line', { x1: X0, x2: X1, y1: axisY, y2: axisY, stroke: C.ink3, 'stroke-width': 1 }, grid);
    text(grid, X0, axisY + 72, 'query channel CRPS \u00b7 lower is better', 't-mono');
    text(grid, CTX_X, RY0 - 40, 'context', 't-mono t-small', { 'text-anchor': 'end' });

    var legend = METHODS.map(function (m, k) {
      var g = svgEl('g', null, svg);
      svgEl('circle', { cx: X0 + 8 + k * 150, cy: 66, r: 8, fill: m.fill }, g);
      text(g, X0 + 26 + k * 150, 73, m.name, 't-lab t-ink');
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
            d: 'M238 ' + (y - 12) + 'H233V' + (rowY(last) + 12) + 'H238',
            fill: 'none', stroke: C.peachDeep, 'stroke-width': 1.5, 'stroke-linejoin': 'round'
          }, labels);
        }
      }
      text(labels, CTX_X, y + 6, String(r.context), 't-mono', { 'text-anchor': 'end' });
      var range = svgEl('line', { x1: X0, x2: X0, y1: y, y2: y, stroke: C.hair, 'stroke-width': 2 }, svg);
      var dots = METHODS.map(function (m) {
        return svgEl('circle', { cx: X0, cy: y, r: 8, fill: m.fill, opacity: 0 }, svg);
      });
      return { r: r, y: y, labels: labels, range: range, dots: dots };
    });

    var morph = 0;   // 0 = bars (step 0), 1 = dot plot (step 1)
    var mt = null;

    // Every morph segment ends by m = 1, so the dot plot is exact when the morph completes.
    function render() {
      var t = P.t;
      var m = morph;
      var gone = 1 - seg(m, 0, 0.3, ease.inOut);       // state-0 text leaves first
      var build = seg(t, 0, 700, ease.out);

      reveal(head0, build * gone);
      reveal(wins, seg(t, 1500, 600, ease.out) * gone);
      alpha(grid, seg(m, 0.35, 0.4, ease.inOut) * build);
      legend.forEach(function (g, k) { reveal(g, seg(m, 0.45 + k * 0.06, 0.35, ease.out) * seg(t, 100 + k * 80, 600, ease.out)); });

      // Bars collapse into the first dot row: each bar's end becomes its dot.
      var top = dotRows[0];
      var foldIn = seg(m, 0.32, 0.3, ease.out);
      var lo0 = Infinity;
      var hi0 = -Infinity;
      bars.forEach(function (b, k) {
        var g = seg(t, 300 + k * 80, 1200, ease.outExpo);
        var end = lerp(X0, x(b.v), g);
        var mb = seg(m, 0.02 + k * 0.04, 0.5, ease.inOut);
        var th = lerp(BAR, 4, mb);
        var yc = lerp(barY[k], top.y, mb);
        setAttr(b.rect, 'y', px2(yc - th / 2));
        setAttr(b.rect, 'height', px2(th));
        setAttr(b.rect, 'width', px2(end - X0));
        alpha(b.rect, 1 - seg(m, 0.38, 0.22));
        alpha(b.name, seg(t, 160 + k * 80, 600, ease.out) * gone);
        setAttr(b.val, 'x', px2(end + 16));
        setText(b.val, (b.v * g).toFixed(4));
        alpha(b.val, seg(t, 300 + k * 80, 300) * gone);
        var d = top.dots[k];
        lo0 = Math.min(lo0, end);
        hi0 = Math.max(hi0, end);
        setAttr(d, 'cx', px2(end));
        setAttr(d, 'r', px2(8 * foldIn));
        alpha(d, foldIn);
      });
      alpha(top.labels, foldIn * build);
      setAttr(top.range, 'x1', px2(lo0));
      setAttr(top.range, 'x2', px2(hi0));
      alpha(top.range, seg(m, 0.45, 0.3) * build);

      // The other nine rows arrive in reading order, their dots sliding out from zero.
      for (var i = 1; i < dotRows.length; i++) {
        var row = dotRows[i];
        var m0 = 0.5 + (i - 1) * 0.025;
        var a = seg(m, m0, 0.3, ease.inOut) * seg(t, 200 + i * 70, 600, ease.out);
        var slide = Math.min(seg(m, m0, 0.3, ease.outQuart), seg(t, 260 + i * 70, 1100, ease.outExpo));
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
      }
    }

    P.duration = 2400;
    P.render = render;
    P.setMorph = function (target, instant) {
      if (mt) { mt.cancel(); mt = null; }
      if (instant || morph === target) {
        morph = target;
        render();
        return;
      }
      mt = Deck.tween({
        from: morph,
        to: target,
        duration: 1700 * Math.abs(target - morph),
        easing: ease.linear,
        onUpdate: function (v) { morph = v; render(); },
        onDone: function () { mt = null; }
      });
    };
    var baseStop = P.stop;
    P.stop = function () {
      baseStop.call(P);
      if (mt) { mt.cancel(); mt = null; }
    };
    return P;
  }

  // Step 2: channel CRPS of River against PyMC-Marketing at both horizons.
  function buildMmm(host) {
    var P = new Panel(host);
    var svg = P.svg;
    var pm = D.pymcMarketing;
    var rows = CTX.map(function (ctx) {
      return pm.rows.filter(function (r) { return r.quantity === 'Channels' && r.context === ctx; })[0];
    });
    var max = Math.max.apply(null, rows.map(function (r) { return r.pymc; }));
    var X0 = 230;
    var X1 = 700;
    var BAR = 44;
    function x(v) { return X0 + (X1 - X0) * v / max; }

    // The takeaway sits under the bars and arrives last, after the ratios.
    var rule = svgEl('line', { x1: 0, x2: VIEW_W, y1: 488, y2: 488, stroke: C.hair, 'stroke-width': 1 }, svg);
    var head = svgEl('g', null, svg);
    var h = text(head, X0, 572, 'about ', 't-head');
    tint(svgEl('tspan', null, h), C.aquaDeep).textContent = 'a quarter';
    text(head, X0 + 2, 616, 'River\u2019s channel CRPS against the MMM\u2019s \u00b7 ' + WORLDS + ' full-input worlds', 't-mono');

    var groups = rows.map(function (r, gi) {
      var y0 = 64 + gi * 224;
      var yM = y0 + 46;
      var yR = y0 + 108;
      var title = tint(text(svg, X0, y0, r.context + ' context weeks', 't-lab t-strong'), SERIES[gi].deep);
      var mmm = {
        v: r.pymc,
        name: text(svg, X0 - 20, yM + 8, 'PyMC-Marketing', 't-lab t-ink', { 'text-anchor': 'end' }),
        rect: svgEl('rect', { x: X0, y: yM - BAR / 2, width: 0, height: BAR, fill: C.ink }, svg),
        val: text(svg, X0, yM + 8, '', 't-val')
      };
      // Quarter marks on the MMM bar make "about a quarter" readable at a glance.
      var quarters = svgEl('g', null, svg);
      [1, 2, 3].forEach(function (q) {
        var xq = x(r.pymc * q / 4);
        svgEl('line', { x1: xq, x2: xq, y1: yM - BAR / 2, y2: yM + BAR / 2, stroke: '#F7F7F7', 'stroke-width': 3 }, quarters);
      });
      var river = {
        v: r.mfm,
        name: text(svg, X0 - 20, yR + 8, 'River', 't-lab t-strong', { 'text-anchor': 'end' }),
        rect: svgEl('rect', { x: X0, y: yR - BAR / 2, width: 0, height: BAR, fill: C.aquaDeep }, svg),
        val: text(svg, X0, yR + 8, '', 't-val')
      };
      // Elbow from the end of the MMM bar down to River's value: divide by the ratio.
      var xe = x(r.pymc);
      var xs = x(r.mfm) + 16 + r.mfm.toFixed(4).length * VAL_ADVANCE + 18;
      var link = svgEl('path', {
        d: 'M' + px2(xe) + ' ' + px2(yM + BAR / 2 + 6) + 'V' + px2(yR) + 'H' + px2(xs),
        fill: 'none', stroke: C.ink3, 'stroke-width': 1.5, 'stroke-linejoin': 'round'
      }, svg);
      var linkLen = (yR - (yM + BAR / 2 + 6)) + (xe - xs);
      link.setAttribute('stroke-dasharray', px2(linkLen) + ' ' + px2(linkLen + 2));
      var tip = svgEl('path', { d: 'M' + px2(xs - 1) + ' ' + yR + 'l9 -5v10z', fill: C.ink3 }, svg);
      var ratio = text(svg, xe + 16, yR + 9, '\u00f7 ' + pm.channelRatio[gi].toFixed(1), 't-ratio');
      return { title: title, bars: [mmm, river], quarters: quarters, link: link, linkLen: linkLen, tip: tip, ratio: ratio };
    });
    // The paper's caveat for the reference: its settings, and that every fit failed a health check.
    var note = svgEl('g', null, svg);
    text(note, X0 + 2, 666, 'PyMC-Marketing ' + pm.version + ' \u00b7 default priors \u00b7 fitted once per world and horizon', 't-mono t-small');
    text(note, X0 + 2, 690, pm.unhealthyFits + ' fits failed \u2265 1 health check \u00b7 none excluded', 't-mono t-small');

    P.duration = 3600;
    P.render = function (t) {
      alpha(rule, seg(t, 2300, 700, ease.out));
      reveal(head, seg(t, 2500, 800, ease.out));
      groups.forEach(function (g, gi) {
        var o = gi * 300;
        reveal(g.title, seg(t, 200 + o, 600, ease.out));
        g.bars.forEach(function (b, bi) {
          var st = 380 + o + bi * 360;
          var k = seg(t, st, 1250, ease.outExpo);
          var end = lerp(X0, x(b.v), k);
          alpha(b.name, seg(t, st - 180, 500, ease.out));
          setAttr(b.rect, 'width', px2(end - X0));
          setAttr(b.val, 'x', px2(end + 16));
          setText(b.val, (b.v * k).toFixed(4));
          alpha(b.val, seg(t, st, 250));
        });
        alpha(g.quarters, seg(t, 1500 + o, 500, ease.out));
        var kl = seg(t, 1750 + o, 700, ease.inOut);
        alpha(g.link, kl > 0 ? 1 : 0);
        setAttr(g.link, 'stroke-dashoffset', px2(g.linkLen * (1 - kl)));
        alpha(g.tip, seg(kl, 0.85, 0.15));
        reveal(g.ratio, seg(t, 2150 + o, 600, ease.out));
      });
      reveal(note, seg(t, 2900, 600, ease.out));
    };
    return P;
  }

  (function () {
    var root = null;
    var bars = null;
    var mmm = null;

    function apply(step, o) {
      if (step >= 2) {
        bars.hide(o);
        mmm.show(o);
        return;
      }
      mmm.hide(o);
      var fresh = bars.show(o);
      bars.setMorph(step >= 1 ? 1 : 0, fresh || o.instant);
    }

    Deck.registerScene('crps', {
      mount: function (section) {
        root = section.querySelector('.scene-root');
        root.classList.add('rs-root');
        bars = buildCrps(root);
        mmm = buildMmm(root);
        bars.seek(0);
        mmm.seek(0);
      },
      enter: function (ctx) {
        setDir(root, ctx.dir);
        apply(ctx.step, { instant: ctx.instant, delay: ENTER.delay, lead: ENTER.lead });
      },
      step: function (ctx) {
        setDir(root, ctx.dir);
        apply(ctx.step, { instant: ctx.instant, delay: STEP.delay, lead: STEP.lead });
      },
      leave: function (ctx) {
        setDir(root, ctx.dir);
        bars.hide({});
        mmm.hide({});
      }
    });
  })();
})();
