/* ==========================================================================
   Causal scenes (light slides)
     decomp        slide 5   one weekly sales line, three decompositions
     worlds        slide 9   the prior as a river of simulated worlds
     intervention  slide 10  a contribution as do(TV = 0)
   Graphics are Canvas 2D sized to the scene root (stage px x Deck.scale() x
   devicePixelRatio); text sits in an HTML layer so labels share the deck's
   type and KaTeX. Every series here is synthetic and labelled "illustrative".
   ========================================================================== */
(function () {
  'use strict';

  var Deck = window.Deck;
  var DATA = window.DECK_DATA;
  var ease = Deck.ease;

  /* ---- Palette and inputs (light slides) ---------------------------------- */
  var NAVY = '#0C1F40';
  var HAIR = 'rgba(12, 31, 64, .14)';
  var CARD_LINE = 'rgba(12, 31, 64, .18)';
  var GREY = 'rgba(12, 31, 64, .42)';
  var BASE = 'rgba(12, 31, 64, .16)';
  var PEACH = '#F6AE72';
  var PAPER = '#FFFFFF';
  var INPUTS = [
    { name: 'TV', kind: 'channel', color: '#3E9C8C' },
    { name: 'Search', kind: 'channel', color: '#62B5A6' },
    { name: 'Social', kind: 'channel', color: '#92D0C4' },
    { name: 'Promo', kind: 'control', color: '#6874C4' },
    { name: 'Holiday', kind: 'control', color: '#A3ACE0' }
  ];
  // Components: 0 = baseline, 1 + k = INPUTS[k]. Stacked bottom to top as
  // baseline, Holiday … TV, so a legend read top-down follows the stack.
  var STACK = [0, 5, 4, 3, 2, 1];
  function compColor(i) { return i === 0 ? BASE : INPUTS[i - 1].color; }

  /* ---- Small maths ----------------------------------------------------------- */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function sstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function fill(n, f) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = f(i); return a; }
  function bump(x, c, s) { var d = (x - c) / s; return Math.exp(-0.5 * d * d); }
  function inAny(i, rs) { for (var k = 0; k < rs.length; k++) if (i >= rs[k][0] && i <= rs[k][1]) return true; return false; }
  function maxOf(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
  function minOf(a) { var m = Infinity; for (var i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
  function sumOf(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }

  // Seeded PRNG (mulberry32): uniform, integer and normal draws.
  function rng(seed) {
    var a = seed >>> 0;
    function u() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      u: u,
      range: function (lo, hi) { return lo + (hi - lo) * u(); },
      int: function (lo, hi) { return lo + Math.floor(u() * (hi - lo + 1)); },
      n: function () { return Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u()); }
    };
  }
  // Triangular moving average with half-width k.
  function smooth(x, k) {
    return fill(x.length, function (i) {
      var s = 0, w = 0;
      for (var j = -k; j <= k; j++) {
        var v = x[i + j];
        if (v === undefined) continue;
        var wt = k + 1 - Math.abs(j);
        s += v * wt;
        w += wt;
      }
      return s / w;
    });
  }
  // Geometric carryover.
  function adstock(x, decay) { var c = 0; return x.map(function (v) { c = v + decay * c; return c; }); }

  /* ---- Animation: eased properties and one rAF loop per scene --------------- */
  // Reduced motion: every delay and duration shrinks to at most 200 ms.
  function calm(ms) { return Deck.reducedMotion ? Math.min(ms || 0, 200) : (ms || 0); }
  function Prop(v) { this.v = v; this.a = v; this.b = v; this.t0 = 0; this.d = 0; this.e = ease.inOut; this.live = false; }
  Prop.prototype.set = function (v) { this.v = this.a = this.b = v; this.live = false; return this; };
  // Ease from the current value to `v`. Repeating the current target is a no-op,
  // so step handlers stay idempotent.
  Prop.prototype.to = function (v, dur, delay, easing) {
    var t = performance.now();
    this.tick(t);
    if (this.live ? this.b === v : this.v === v) return this;
    this.a = this.v;
    this.b = v;
    this.t0 = t + calm(delay);
    this.d = calm(dur);
    this.e = easing || ease.inOut;
    this.live = true;
    if (this.d <= 0 && !delay) { this.v = v; this.live = false; }
    return this;
  };
  Prop.prototype.finish = function () { this.v = this.b; this.live = false; return this; };
  Prop.prototype.tick = function (t) {
    if (!this.live) return false;
    var p = this.d > 0 ? (t - this.t0) / this.d : (t >= this.t0 ? 1 : 0);
    if (p >= 1) { this.v = this.b; this.live = false; return false; }
    this.v = p <= 0 ? this.a : this.a + (this.b - this.a) * this.e(p);
    return true;
  };
  function tickAll(props, t) {
    var busy = false;
    for (var i = 0; i < props.length; i++) if (props[i].tick(t)) busy = true;
    return busy;
  }

  // frame(t) draws and returns true while something still moves; `always` keeps
  // the loop alive for continuous motion. stop() is called from leave().
  function Loop(frame) {
    var raf = 0, on = false, self = this;
    this.always = false;
    function tick(t) {
      raf = 0;
      if (!on) return;
      var busy = frame(t);
      if (on && (busy || self.always)) raf = requestAnimationFrame(tick);
    }
    this.run = function () { on = true; if (!raf) raf = requestAnimationFrame(tick); };
    this.stop = function () { on = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
  }

  /* ---- Surface: canvas + label layer inside a scene root --------------------- */
  function Surface(root, w, h) {
    this.root = root;
    this.w = root.offsetWidth || w;
    this.h = root.offsetHeight || h;
    this.k = 0;
    root.classList.add('cz-scene');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cz-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    root.appendChild(this.canvas);
    this.layer = document.createElement('div');
    this.layer.className = 'cz-layer';
    root.appendChild(this.layer);
    this.ctx = this.canvas.getContext('2d');
    this.fit();
  }
  // Backing store = box x stage scale x min(devicePixelRatio, 2). True if it changed.
  Surface.prototype.fit = function () {
    var k = Math.max(0.1, Deck.scale()) * Math.min(window.devicePixelRatio || 1, 2);
    if (Math.abs(k - this.k) < 1e-3) return false;
    this.k = k;
    this.canvas.width = Math.max(1, Math.round(this.w * k));
    this.canvas.height = Math.max(1, Math.round(this.h * k));
    return true;
  };
  Surface.prototype.begin = function () {
    var c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    return c;
  };
  // A label anchored at (x, y) in scene px; align 'l' | 'c' | 'r', centred vertically.
  Surface.prototype.label = function (html, x, y, align, cls) {
    var a = document.createElement('div');
    a.className = 'cz-a cz-a' + (align || 'l');
    a.style.left = x + 'px';
    a.style.top = y + 'px';
    var el = document.createElement('div');
    el.className = 'cz-l' + (cls ? ' ' + cls : '');
    el.innerHTML = html;
    a.appendChild(el);
    this.layer.appendChild(a);
    return el;
  };
  // Hide every label at once, without transitions.
  Surface.prototype.hush = function () {
    var layer = this.layer;
    layer.classList.add('cz-still');
    layer.querySelectorAll('.cz-l.is-on').forEach(function (el) { el.classList.remove('is-on'); });
    void layer.offsetWidth;
    layer.classList.remove('cz-still');
  };
  Surface.prototype.enter = function () {
    var r = this.root;
    r.classList.add('cz-snap');
    r.classList.remove('cz-out');
    void r.offsetWidth;
    r.classList.remove('cz-snap');
    this.hush();
    this.fit();
  };
  Surface.prototype.leave = function () { this.root.classList.add('cz-out'); };

  function show(el, on, delay) {
    if (on) el.style.setProperty('--d', calm(delay) + 'ms');
    el.classList.toggle('is-on', !!on);
  }

  /* ---- Drawing kit ------------------------------------------------------------ */
  var P2 = [0, 0], T2 = [0, 0];

  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function disc(c, x, y, r, fillStyle, stroke, lw) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    if (fillStyle) { c.fillStyle = fillStyle; c.fill(); }
    if (stroke) { c.lineWidth = lw || 1.5; c.strokeStyle = stroke; c.stroke(); }
  }
  // A small × over a paper dot: marks structure outside River's prior.
  function cross(c, x, y, s, color, alpha) {
    c.globalAlpha = alpha;
    c.setLineDash([]);
    disc(c, x, y, s + 4, PAPER);
    c.lineCap = 'round';
    c.lineWidth = 2;
    c.strokeStyle = color;
    c.beginPath();
    c.moveTo(x - s, y - s); c.lineTo(x + s, y + s);
    c.moveTo(x + s, y - s); c.lineTo(x - s, y + s);
    c.stroke();
    c.lineCap = 'butt';
    c.globalAlpha = 1;
  }

  // Quadratic edge between two node rims; `bend` offsets the control point
  // along the left normal of a→b, as a fraction of the chord.
  function Edge(ax, ay, ar, bx, by, br, bend) { this.set(ax, ay, ar, bx, by, br, bend); }
  Edge.prototype.set = function (ax, ay, ar, bx, by, br, bend) {
    var dx = bx - ax, dy = by - ay;
    this.ax = ax; this.ay = ay; this.bx = bx; this.by = by;
    this.len = Math.hypot(dx, dy) || 1;
    this.cx = (ax + bx) / 2 - dy * bend;
    this.cy = (ay + by) / 2 + dx * bend;
    this.t0 = this.rim(ax, ay, ar, 0, 0.5);
    this.t1 = this.rim(bx, by, br, 1, 0.5);
    return this;
  };
  Edge.prototype.pt = function (t, out) {
    var u = 1 - t;
    out[0] = u * u * this.ax + 2 * u * t * this.cx + t * t * this.bx;
    out[1] = u * u * this.ay + 2 * u * t * this.cy + t * t * this.by;
    return out;
  };
  Edge.prototype.tan = function (t, out) {
    out[0] = 2 * (1 - t) * (this.cx - this.ax) + 2 * t * (this.bx - this.cx);
    out[1] = 2 * (1 - t) * (this.cy - this.ay) + 2 * t * (this.by - this.cy);
    return out;
  };
  // Parameter where the curve crosses the circle (x, y, r), by bisection.
  Edge.prototype.rim = function (x, y, r, inside, outside) {
    var a = inside, b = outside;
    for (var k = 0; k < 20; k++) {
      var m = (a + b) / 2;
      this.pt(m, P2);
      if (Math.hypot(P2[0] - x, P2[1] - y) < r) a = m; else b = m;
    }
    return (a + b) / 2;
  };
  // Parameter at the base of an arrowhead of length `head`.
  Edge.prototype.base = function (head) { return head ? this.t1 - head / this.len : this.t1; };

  // Stroke an edge from its tail up to progress p (0..1), arrowhead last.
  function drawEdge(c, e, p, o) {
    if (p <= 0.001) return;
    var alpha = o.alpha === undefined ? 1 : o.alpha;
    if (alpha <= 0.002) return;
    var head = o.head || 0;
    var te = lerp(e.t0, e.base(head), clamp01(p));
    var steps = 28;
    c.beginPath();
    for (var s = 0; s <= steps; s++) {
      e.pt(lerp(e.t0, te, s / steps), P2);
      if (s === 0) c.moveTo(P2[0], P2[1]); else c.lineTo(P2[0], P2[1]);
    }
    c.setLineDash(o.dash || []);
    c.lineCap = o.cap || 'butt';
    c.lineWidth = o.width || 2.5;
    c.strokeStyle = o.color || NAVY;
    c.globalAlpha = alpha;
    c.stroke();
    c.setLineDash([]);
    c.lineCap = 'butt';
    if (head && p > 0.9) {
      e.pt(e.t1, P2);
      e.tan(e.t1, T2);
      var L = Math.hypot(T2[0], T2[1]) || 1, ux = T2[0] / L, uy = T2[1] / L;
      var hw = head * 0.42, bx = P2[0] - ux * head, by = P2[1] - uy * head;
      c.beginPath();
      c.moveTo(P2[0], P2[1]);
      c.lineTo(bx - uy * hw, by + ux * hw);
      c.lineTo(bx + uy * hw, by - ux * hw);
      c.closePath();
      c.globalAlpha = alpha * seg(p, 0.9, 1);
      c.fillStyle = o.color || NAVY;
      c.fill();
    }
    c.globalAlpha = 1;
  }

  /* ==========================================================================
     Scene 1 · decomp: one weekly sales line, three decompositions, same total.
     Seven smooth source shapes are shared out among the six components by an
     attribution matrix whose columns sum to one, so every decomposition adds
     up to the same total in every week.
     ========================================================================== */
  var DEC = (function () {
    var N = 104;
    var R = rng(5112026);
    var trend = fill(N, function (i) { return 26 + 0.07 * i; });
    var season = smooth(fill(N, function (i) { return Math.max(0, 9 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i - 6) / 52)) + 0.35 * R.n()); }), 2);
    var flightWeeks = [[8, 13], [33, 38], [59, 64], [85, 90]];
    var spend = fill(N, function (i) { return inAny(i, flightWeeks) ? R.range(0.8, 1.2) : 0; });
    var flights = smooth(adstock(spend, 0.55).map(function (v) { return 24 * (1 - Math.exp(-v / 1.1)); }), 1);
    var promoWeeks = [[13, 15], [44, 46], [64, 66], [95, 97]];
    var promo = smooth(fill(N, function (i) { return inAny(i, promoWeeks) ? R.range(10, 13) : 0; }), 1);
    var holiday = fill(N, function (i) { return 16 * bump(i, 50, 2.2) + 18 * bump(i, 102, 2.2); });
    var social = smooth(fill(N, function (i) { return 6 + 2 * Math.sin(2 * Math.PI * i / 26 + 0.8) + 0.3 * R.n(); }), 2);
    var demand = smooth(fill(N, function (i) { return Math.max(0, 6 + 0.6 * season[i] + 0.4 * R.n()); }), 1);
    var src = [trend, season, flights, promo, holiday, social, demand];
    // Rows: baseline, TV, Search, Social, Promo, Holiday. Columns: the sources above.
    var mats = [
      [ // A: TV carries the flights and part of the level.
        [0.50, 0.40, 0.00, 0.00, 0.00, 0.00, 0.30],
        [0.40, 0.20, 0.90, 0.20, 0.00, 0.20, 0.00],
        [0.05, 0.30, 0.10, 0.00, 0.00, 0.00, 0.70],
        [0.05, 0.00, 0.00, 0.00, 0.00, 0.80, 0.00],
        [0.00, 0.00, 0.00, 0.80, 0.20, 0.00, 0.00],
        [0.00, 0.10, 0.00, 0.00, 0.80, 0.00, 0.00]
      ],
      [ // B: Search runs with the flights, the season and demand.
        [0.60, 0.30, 0.00, 0.00, 0.00, 0.00, 0.00],
        [0.05, 0.00, 0.15, 0.00, 0.00, 0.00, 0.00],
        [0.30, 0.60, 0.70, 0.50, 0.40, 0.30, 1.00],
        [0.05, 0.00, 0.15, 0.00, 0.00, 0.70, 0.00],
        [0.00, 0.00, 0.00, 0.50, 0.00, 0.00, 0.00],
        [0.00, 0.10, 0.00, 0.00, 0.60, 0.00, 0.00]
      ],
      [ // C: promotions land with the campaigns and take the bumps.
        [0.55, 0.30, 0.00, 0.00, 0.00, 0.00, 0.10],
        [0.05, 0.00, 0.25, 0.00, 0.00, 0.00, 0.00],
        [0.05, 0.00, 0.10, 0.00, 0.00, 0.00, 0.70],
        [0.00, 0.00, 0.00, 0.00, 0.00, 1.00, 0.00],
        [0.35, 0.40, 0.65, 1.00, 0.50, 0.00, 0.20],
        [0.00, 0.30, 0.00, 0.00, 0.50, 0.00, 0.00]
      ]
    ];
    var tot = fill(N, function (i) { var s = 0; for (var j = 0; j < src.length; j++) s += src[j][i]; return s; });
    var comps = mats.map(function (m) {
      return m.map(function (row) {
        return fill(N, function (i) { var s = 0; for (var j = 0; j < src.length; j++) s += row[j] * src[j][i]; return s; });
      });
    });
    var sumAll = sumOf(tot);
    return {
      N: N,
      total: tot,
      comps: comps,
      shares: comps.map(function (cs) { return cs.map(function (c) { return sumOf(c) / sumAll; }); }),
      max: maxOf(tot)
    };
  })();

  Deck.registerScene('decomp', (function () {
    var X0 = 24, X1 = 716, YT = 92, YB = 612;
    var N = DEC.N, TOT = DEC.total, VMAX = DEC.max * 1.05;
    var S, loop;
    var P = { axis: new Prop(0), line: new Prop(0), head: new Prop(0), mix: new Prop(1), grow: fill(6, function () { return new Prop(0); }) };
    var all = [P.axis, P.line, P.head, P.mix].concat(P.grow);
    var mixFrom = [1, 0, 0], mixTo = [1, 0, 0], wt = [1, 0, 0];
    var cur = fill(6, function () { return new Float64Array(N); });
    var lev = fill(7, function () { return new Float64Array(N); });
    var L = {}, keys = [], pcts = [], letters = [], shown = [];

    function xAt(i) { return X0 + (X1 - X0) * i / (N - 1); }
    function yAt(v) { return YB - v / VMAX * (YB - YT); }
    function weights() { var p = P.mix.v; for (var d = 0; d < 3; d++) wt[d] = mixFrom[d] + (mixTo[d] - mixFrom[d]) * p; }
    function setMix(d) { mixFrom = [0, 0, 0]; mixFrom[d] = 1; mixTo = mixFrom.slice(); P.mix.set(1); }
    function morphTo(d) {
      if (mixTo[d] === 1) return;
      weights();
      mixFrom = wt.slice();
      mixTo = [0, 0, 0];
      mixTo[d] = 1;
      P.mix.set(0).to(1, 1200, 0, ease.inOut);
    }

    // Integer shares that add up to 100 (largest remainder).
    function updateShares() {
      var raw = [], out = [], used = 0, k, d;
      for (k = 0; k < 6; k++) {
        var s = 0;
        for (d = 0; d < 3; d++) s += wt[d] * DEC.shares[d][k];
        raw[k] = s * 100;
        out[k] = Math.floor(raw[k]);
        used += out[k];
      }
      var order = [0, 1, 2, 3, 4, 5].sort(function (a, b) { return (raw[b] - out[b]) - (raw[a] - out[a]); });
      for (k = 0; k < 100 - used; k++) out[order[k]]++;
      for (k = 0; k < 6; k++) {
        if (out[k] === shown[k]) continue;
        shown[k] = out[k];
        pcts[k].textContent = out[k] + '%';
      }
    }

    function draw() {
      var c = S.begin(), i, j, k;
      weights();
      for (k = 0; k < 6; k++) {
        var a = DEC.comps[0][k], b = DEC.comps[1][k], e = DEC.comps[2][k], o = cur[k];
        for (i = 0; i < N; i++) o[i] = wt[0] * a[i] + wt[1] * b[i] + wt[2] * e[i];
      }
      var lp = P.line.v, upto = lp * (N - 1), headX = lerp(X0, X1, lp);

      // Stacked components, revealed only where the line has been drawn.
      var grown = true, any = false;
      for (j = 0; j < 6; j++) { if (P.grow[j].v < 1) grown = false; if (P.grow[j].v > 0.001) any = true; }
      if (any && lp > 0) {
        c.save();
        c.beginPath();
        c.rect(0, 0, headX, S.h);
        c.clip();
        var lo = lev[0];
        for (i = 0; i < N; i++) lo[i] = 0;
        for (j = 0; j < 6; j++) {
          var g = P.grow[j].v, comp = cur[STACK[j]], hi = lev[j + 1];
          // The top of a fully grown stack is the total itself.
          if (j === 5 && grown) for (i = 0; i < N; i++) hi[i] = TOT[i];
          else for (i = 0; i < N; i++) hi[i] = lo[i] + g * comp[i];
          if (g > 0.001) {
            c.beginPath();
            c.moveTo(xAt(0), yAt(hi[0]));
            for (i = 1; i < N; i++) c.lineTo(xAt(i), yAt(hi[i]));
            for (i = N - 1; i >= 0; i--) c.lineTo(xAt(i), yAt(lo[i]));
            c.closePath();
            c.globalAlpha = Math.min(1, g * 2.5);
            c.fillStyle = compColor(STACK[j]);
            c.fill();
          }
          lo = hi;
        }
        // Paper-white seams between the bands.
        c.lineWidth = 1.2;
        c.strokeStyle = PAPER;
        c.lineJoin = 'round';
        for (j = 1; j < 6; j++) {
          var gj = P.grow[j - 1].v;
          if (gj <= 0.001) continue;
          c.globalAlpha = 0.9 * Math.min(1, gj * 2.5);
          c.beginPath();
          c.moveTo(xAt(0), yAt(lev[j][0]));
          for (i = 1; i < N; i++) c.lineTo(xAt(i), yAt(lev[j][i]));
          c.stroke();
        }
        c.restore();
      }

      // Hairline zero line.
      c.globalAlpha = P.axis.v;
      c.strokeStyle = HAIR;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(X0, YB + 0.5);
      c.lineTo(X1, YB + 0.5);
      c.stroke();

      // The total: the same line in every step.
      if (lp > 0) {
        var last = Math.floor(upto), hx = xAt(last), hy = yAt(TOT[last]);
        c.globalAlpha = 1;
        c.beginPath();
        c.moveTo(xAt(0), yAt(TOT[0]));
        for (i = 1; i <= last; i++) c.lineTo(xAt(i), yAt(TOT[i]));
        if (last < N - 1) {
          var f = upto - last;
          hx = lerp(xAt(last), xAt(last + 1), f);
          hy = lerp(yAt(TOT[last]), yAt(TOT[last + 1]), f);
          c.lineTo(hx, hy);
        }
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.lineWidth = 3;
        c.strokeStyle = NAVY;
        c.stroke();
        c.lineCap = 'butt';
        if (P.head.v > 0.01) {
          c.globalAlpha = P.head.v;
          disc(c, hx, hy, 6.5, PEACH, PAPER, 2);
        }
      }
      c.globalAlpha = 1;
      updateShares();
    }

    function frame(t) {
      var busy = tickAll(all, t);
      draw();
      return busy;
    }

    function apply(s, entering) {
      var on = s >= 1, d = Math.max(0, s - 1), j;
      var visible = false;
      for (j = 0; j < 6; j++) if (P.grow[j].v > 0.02) visible = true;
      if (on) {
        if (visible) morphTo(d); else setMix(d);
        for (j = 0; j < 6; j++) {
          if (entering) P.grow[j].set(1);
          else P.grow[j].to(1, 900, j * 70, ease.out);
        }
      } else {
        for (j = 0; j < 6; j++) P.grow[j].to(0, 650, (5 - j) * 45, ease.inOut);
      }
      var base = entering ? 900 : 380;
      keys.forEach(function (el, r) { show(el, on, base + r * 55); });
      show(L.chip, on, base + 200);
      letters.forEach(function (el, q) { el.classList.toggle('is-cur', q === d); });
    }

    return {
      mount: function (section) {
        S = new Surface(section.querySelector('.scene-root'), 900, 720);
        loop = new Loop(frame);
        L.sales = S.label('weekly sales', X0, 52, 'l', 'cz-mono');
        L.chip = S.label('decomposition <span class="cz-sw"><i>A</i><i>B</i><i>C</i></span> · same total', X1, 52, 'r', 'cz-tag');
        letters = Array.prototype.slice.call(L.chip.querySelectorAll('.cz-sw i'));
        L.w1 = S.label('week 1', X0, 640, 'l', 'cz-mono');
        L.wN = S.label('week ' + N, X1, 640, 'r', 'cz-mono');
        L.ill = S.label('illustrative', S.w, 640, 'r', 'cz-mono cz-sm');
        // Legend, top to bottom as the stack reads: TV … Holiday, Baseline.
        STACK.slice().reverse().forEach(function (ci, r) {
          var name = ci === 0 ? 'Baseline' : INPUTS[ci - 1].name;
          var el = S.label('<i style="--c:' + compColor(ci) + '"></i>' + name + '<span>0%</span>', 752, 256 + r * 40, 'l', 'cz-key' + (ci === 0 ? ' is-base' : ''));
          keys.push(el);
          pcts[ci] = el.querySelector('span');
        });
        weights();
        updateShares();
      },
      enter: function (ctx) {
        var s = ctx.step;
        S.enter();
        all.forEach(function (p) { p.set(0); });
        P.mix.set(1);
        P.axis.to(1, 700, 150, ease.out);
        if (s === 0) {
          P.line.to(1, 1400, 450, ease.inOut);
          P.head.set(1).to(0, 450, 450 + 1400 + 120);
        } else {
          P.line.to(1, 1000, 300, ease.inOut);
        }
        setMix(Math.max(0, s - 1));
        show(L.sales, true, 200);
        show(L.w1, true, 260);
        show(L.wN, true, 320);
        show(L.ill, true, 380);
        apply(s, true);
        if (ctx.instant) all.forEach(function (p) { p.finish(); });
        draw();
        loop.run();
      },
      step: function (ctx) {
        apply(ctx.step, false);
        if (ctx.instant) all.forEach(function (p) { p.finish(); });
        loop.run();
      },
      leave: function () {
        loop.stop();
        S.leave();
      },
      resize: function () {
        if (S && S.fit()) draw();
      }
    };
  })());

  /* ==========================================================================
     Scene 2 · worlds: the prior as a river of simulated worlds.
     Each card is one world: its inputs, its direct edges to sales and its
     sales path. One card lifts out with its stored graph and contributions;
     then three worlds with near-identical sales and different graphs.
     ========================================================================== */
  Deck.registerScene('worlds', (function () {
    var WEEKS = DATA.prior.weeks;
    var WORLDS = DATA.prior.worlds;
    var CARD_H = 0.84;                 // card height / width
    // Card layout in units of card width: input row, sales node, chart band, week labels.
    var LAY = { inY: 0.19, dx: 0.165, rI: 0.036, salesY: 0.4, rS: 0.05, gx0: 0.055, gx1: 0.945, gy0: 0.53, gy1: 0.765, weekY: 0.8 };
    var MINI = 100;                    // river card width at the front of the band
    var NSLOT = 58;
    var RATE = 0.05;                   // band lengths per second at the front
    var DIM = 0.2, SLOW = 0.22;        // river behind a lifted card
    var HERO = { x: 470, y: 400, w: 640 };
    var TRIO_W = 272, TRIO_Y = 400, TRIO_X = [176, 470, 764];
    var S, loop, mask = null;
    var slots = [], order = [];
    var riverT = 0, lastT = 0, hero = -1, trio = null;
    var P = {
      river: new Prop(0), speed: new Prop(1), hero: new Prop(0), count: new Prop(0),
      trio: [new Prop(0), new Prop(0), new Prop(0)]
    };
    var all = [P.river, P.speed, P.hero, P.count].concat(P.trio);
    var L = {}, heroLabels = [], trioLabels = [], shownCount = -1;
    // Scratch for drawCard, reused every frame.
    var edge = new Edge(0, 0, 0, 1, 0, 0, 0), ix = [0, 0, 0, 0, 0];
    var bandLo = new Float64Array(WEEKS), bandHi = new Float64Array(WEEKS);

    /* ---- Worlds ---- */
    function contribution(k, R, n, scale) {
      var out, i;
      if (k === 0) {                   // TV: flights with carryover and saturation
        var sp = fill(n, function () { return 0; });
        for (var f = R.int(6, 10); f > 0; f--) {
          var s0 = R.int(0, n - 10), len = R.int(4, 9), lvl = R.range(0.6, 1.2);
          for (i = s0; i < s0 + len; i++) sp[i] = lvl;
        }
        var decay = R.range(0.55, 0.85);
        out = smooth(adstock(sp, decay).map(function (v) { return scale * (1 - Math.exp(-v / 1.1)); }), 1);
      } else if (k === 1) {            // Search: follows seasonal demand
        var ph = R.range(0, 6.28);
        out = smooth(fill(n, function (j) { return scale * (0.45 + 0.4 * Math.sin(2 * Math.PI * j / 52 + ph) + 0.06 * R.n()); }), 2);
      } else if (k === 2) {            // Social: always on, slow cycle
        var per = R.range(18, 40), ph2 = R.range(0, 6.28);
        out = smooth(fill(n, function (j) { return scale * (0.42 + 0.22 * Math.sin(2 * Math.PI * j / per + ph2)); }), 2);
      } else if (k === 3) {            // Promo: short pulses
        var pp = fill(n, function () { return 0; });
        for (var q = R.int(8, 14); q > 0; q--) {
          var p0 = R.int(0, n - 4), pl = R.int(2, 4), h = scale * R.range(0.7, 1.15);
          for (i = p0; i < p0 + pl; i++) pp[i] = h;
        }
        out = smooth(pp, 1);
      } else {                         // Holiday: year-end peaks
        var off = R.range(-1.5, 1.5);
        out = fill(n, function (j) { var s = 0; for (var y = 0; y * 52 < n; y++) s += bump(j, 50 + 52 * y + off, 2.4); return scale * 1.25 * s; });
      }
      for (i = 0; i < n; i++) if (out[i] < 0) out[i] = 0;
      return out;
    }
    function finishWorld(id, inputs, on, base, byType) {
      var tot = base.slice();
      byType.forEach(function (c) { if (c) for (var i = 0; i < tot.length; i++) tot[i] += c[i]; });
      return { id: id, inputs: inputs, on: on, base: base, byType: byType, total: tot, max: maxOf(tot) };
    }
    function makeWorld(seed) {
      var R = rng(seed);
      var n = [2, 3, 3, 4, 4, 5, 5, 5][R.int(0, 7)];
      var pool = [0, 1, 2, 3, 4];
      for (var i = 4; i > 0; i--) { var j = R.int(0, i), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      var inputs = pool.slice(0, n).sort(function (a, b) { return a - b; });
      var on = inputs.map(function () { return R.u() < 0.6; });
      var count = on.filter(Boolean).length;
      if (count === 0) on[R.int(0, n - 1)] = true;
      if (n === 5) {                   // a lifted card shows both kinds of edge
        if (count === 5) on[R.int(1, 4)] = false;
        if (count <= 1) on[on.indexOf(false)] = true;
      }
      var level = R.range(9, 15), slope = R.range(-0.006, 0.02), amp = R.range(1.5, 4), ph = R.range(0, 6.28);
      var base = fill(WEEKS, function (w) { return level + slope * w + amp * (0.5 + 0.5 * Math.sin(2 * Math.PI * w / 52 + ph)); });
      var byType = [null, null, null, null, null];
      inputs.forEach(function (k, q) { if (on[q]) byType[k] = contribution(k, R, WEEKS, level * R.range(0.5, 1)); });
      return finishWorld(1 + (Math.imul(seed, 2654435761) >>> 0) % WORLDS, inputs, on, base, byType);
    }
    // Three worlds with almost the same sales and different graphs: shared
    // source shapes, attributed differently, with a small independent wiggle.
    function makeTrio() {
      var n = WEEKS, R = rng(31415);
      var level = fill(n, function (i) { return 15 + 0.02 * i; });
      var season = fill(n, function (i) { return 5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i - 8) / 52)); });
      var sp = fill(n, function (i) { return inAny(i, [[10, 14], [38, 42], [64, 68], [92, 96], [118, 122], [146, 150], [170, 174], [196, 200]]) ? 1 : 0; });
      var flights = smooth(adstock(sp, 0.6).map(function (v) { return 15 * (1 - Math.exp(-v / 1.1)); }), 1);
      var pulses = smooth(fill(n, function (i) { return inAny(i, [[24, 26], [76, 78], [128, 130], [180, 182]]) ? 8 : 0; }), 1);
      var hol = fill(n, function (i) { var s = 0; for (var y = 0; y < 4; y++) s += bump(i, 50 + 52 * y, 1.9); return 9 * s; });
      var social = fill(n, function (i) { return 5 + 1.4 * Math.sin(2 * Math.PI * i / 30); });
      var src = [level, season, flights, pulses, hol, social];
      var specs = [
        { id: 18204, mat: [
          [0.80, 0.50, 0.00, 0.00, 0.40, 0.60], [0.10, 0.00, 0.85, 0.00, 0.00, 0.00], [0.10, 0.50, 0.15, 0.00, 0.00, 0.40],
          [0, 0, 0, 0, 0, 0], [0.00, 0.00, 0.00, 1.00, 0.60, 0.00], [0, 0, 0, 0, 0, 0]] },
        { id: 93517, mat: [
          [0.80, 0.40, 0.00, 0.00, 0.00, 0.00], [0, 0, 0, 0, 0, 0], [0.10, 0.60, 0.60, 0.50, 0.00, 0.00],
          [0.10, 0.00, 0.40, 0.50, 0.00, 1.00], [0, 0, 0, 0, 0, 0], [0.00, 0.00, 0.00, 0.00, 1.00, 0.00]] },
        { id: 151066, mat: [
          [0.75, 0.70, 0.00, 0.00, 0.00, 0.70], [0.15, 0.00, 0.60, 0.00, 0.00, 0.30], [0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0], [0.10, 0.00, 0.40, 1.00, 0.00, 0.00], [0.00, 0.30, 0.00, 0.00, 1.00, 0.00]] }
      ];
      return specs.map(function (sp2) {
        var wig = smooth(fill(n, function () { return R.n(); }), 3);
        var series = sp2.mat.map(function (row) {
          return fill(n, function (i) { var s = 0; for (var j = 0; j < src.length; j++) s += row[j] * src[j][i]; return s * (1 + 0.035 * wig[i]); });
        });
        var byType = [0, 1, 2, 3, 4].map(function (k) { return sumOf(series[k + 1]) > 0 ? series[k + 1] : null; });
        return finishWorld(sp2.id, [0, 1, 2, 3, 4], byType.map(Boolean), series[0], byType);
      });
    }

    /* ---- One card: inputs on top, sales below, its sales path at the bottom.
       det 0 is the river sprite; det 1 adds absent edges (dashed), arrowheads
       and the stored contributions as stacked bands. ---- */
    function drawCard(c, w, cx, cy, Wd, det, alpha) {
      if (alpha <= 0.003) return;
      var Hd = Wd * CARD_H, x0 = cx - Wd / 2, y0 = cy - Hd / 2;
      var n = w.inputs.length, i, j;
      var sx = x0 + Wd * 0.5, sy = y0 + Wd * LAY.salesY, rS = Wd * LAY.rS, rI = Wd * LAY.rI;
      var ew = Math.min(2.5, 0.8 + Wd * 0.0027), head = det > 0.01 ? Math.max(4, Wd * 0.016) : 0;
      c.globalAlpha = alpha;
      rrect(c, x0, y0, Wd, Hd, Wd * 0.035);
      c.fillStyle = PAPER;
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = CARD_LINE;
      c.stroke();
      var iy = y0 + Wd * LAY.inY;
      for (j = 0; j < n; j++) ix[j] = x0 + Wd * (0.5 + (j - (n - 1) / 2) * LAY.dx);
      for (j = 0; j < n; j++) {
        var e = edge.set(ix[j], iy, rI + Wd * 0.006, sx, sy, rS + Wd * 0.008, 0);
        if (w.on[j]) drawEdge(c, e, 1, { width: ew, alpha: alpha * lerp(0.6, 1, det), head: head });
        else if (det > 0.01) {
          var dd = Math.max(2, 6 * Wd / 640);
          drawEdge(c, e, 1, { width: ew * 0.8, alpha: alpha * 0.34 * det, dash: [dd, dd] });
        }
      }
      c.globalAlpha = alpha;
      for (j = 0; j < n; j++) {
        var col = INPUTS[w.inputs[j]].color;
        if (w.on[j]) disc(c, ix[j], iy, rI, col);
        else disc(c, ix[j], iy, rI, PAPER, col, Math.max(1, Wd * 0.0024));
      }
      disc(c, sx, sy, rS, NAVY);

      // Sales path; with detail, the stored contributions stacked under it.
      var gx0 = x0 + Wd * LAY.gx0, gx1 = x0 + Wd * LAY.gx1, gy0 = y0 + Wd * LAY.gy0, gy1 = y0 + Wd * LAY.gy1;
      var m = w.total.length, vmax = w.max * 1.04;
      var X = function (q) { return gx0 + (gx1 - gx0) * q / (m - 1); };
      var Y = function (v) { return gy1 - v / vmax * (gy1 - gy0); };
      if (det > 0.01) {
        var lo = bandLo, hi = bandHi;
        lo.fill(0);
        for (var q = 0; q < STACK.length; q++) {
          var ci = STACK[q], comp = ci === 0 ? w.base : w.byType[ci - 1];
          if (!comp) continue;
          for (i = 0; i < m; i++) hi[i] = lo[i] + comp[i];
          c.beginPath();
          c.moveTo(X(0), Y(hi[0]));
          for (i = 1; i < m; i++) c.lineTo(X(i), Y(hi[i]));
          for (i = m - 1; i >= 0; i--) c.lineTo(X(i), Y(lo[i]));
          c.closePath();
          c.globalAlpha = alpha * det;
          c.fillStyle = compColor(ci);
          c.fill();
          var t = lo; lo = hi; hi = t;
        }
        c.globalAlpha = alpha * det;
        c.strokeStyle = HAIR;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(gx0, gy1 + 0.5);
        c.lineTo(gx1, gy1 + 0.5);
        c.stroke();
      }
      c.globalAlpha = alpha;
      c.beginPath();
      c.moveTo(X(0), Y(w.total[0]));
      for (i = 1; i < m; i++) c.lineTo(X(i), Y(w.total[i]));
      c.lineJoin = 'round';
      c.lineWidth = Wd < 150 ? 1.1 : lerp(1.2, 2, clamp01((Wd - 150) / 490));
      c.strokeStyle = NAVY;
      c.stroke();
      c.globalAlpha = 1;
    }

    /* ---- River ---- */
    function riverX(u) { return lerp(-70, S.w + 70, u); }
    function riverY(u) { return 400 + 92 * Math.sin(2 * Math.PI * (u - 0.12)); }
    function seedFor(j, lap) { return (Math.imul(j + 1, 7919) + Math.imul(lap + 3, 104729)) >>> 0; }

    function renderSprite(sl) {
      var k = S.k, cv = sl.cv;
      cv.width = Math.ceil(MINI * k);
      cv.height = Math.ceil(MINI * CARD_H * k);
      var c = cv.getContext('2d');
      c.setTransform(k, 0, 0, k, 0, 0);
      c.clearRect(0, 0, MINI, MINI * CARD_H);
      drawCard(c, sl.world, MINI / 2, MINI * CARD_H / 2, MINI - 1.5, 0, 1);
    }

    function updateRiver() {
      for (var j = 0; j < NSLOT; j++) {
        var sl = slots[j];
        var pos = sl.u0 + riverT * sl.rate, lap = Math.floor(pos);
        sl.u = pos - lap;
        if (lap !== sl.lap && !sl.held) {
          sl.lap = lap;
          sl.world = makeWorld(seedFor(j, lap));
          renderSprite(sl);
        }
        sl.x = riverX(sl.u);
        sl.y = riverY(sl.u) + sl.v * 72;
        sl.s = lerp(0.42, 0.95, sl.z);
        sl.a = P.river.v * lerp(0.32, 1, sl.z);
      }
    }

    // The card that lifts out: a five-input world near the middle, near the front.
    function ensureHero() {
      var h = hero >= 0 ? slots[hero] : null;
      if (!(h && (h.held || (h.world.inputs.length === 5 && h.u > 0.22 && h.u < 0.72)))) {
        var score = -Infinity;
        hero = -1;
        for (var j = 0; j < NSLOT; j++) {
          var sl = slots[j];
          if (sl.world.inputs.length !== 5) continue;
          var sc = sl.z * 1.2 - Math.abs(sl.u - 0.45) * 2.4;
          if (sc > score) { score = sc; hero = j; }
        }
        if (hero < 0) return;
        h = slots[hero];
      }
      h.held = true;
      L.heroId.textContent = 'world ' + fmt(h.world.id);
    }

    function draw() {
      var c = S.begin(), j, sl;
      // River, back to front, with soft ends.
      if (P.river.v > 0.002) {
        for (var q = 0; q < NSLOT; q++) {
          sl = slots[order[q]];
          if (sl.held) continue;
          var w = MINI * sl.s, h = w * CARD_H;
          c.globalAlpha = sl.a;
          c.drawImage(sl.cv, sl.x - w / 2, sl.y - h / 2, w, h);
        }
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'destination-in';
        c.fillStyle = mask;
        c.fillRect(0, 0, S.w, S.h);
        c.globalCompositeOperation = 'source-over';
      }
      // The lifted card, between its place in the river and the centre.
      if (hero >= 0 && slots[hero].held) {
        sl = slots[hero];
        var e = P.hero.v, w0 = MINI * sl.s;
        var wd = Math.exp(lerp(Math.log(w0), Math.log(HERO.w), e));
        var ha = lerp(P.river.v * lerp(0.32, 1, sl.z), 1, sstep(seg(e, 0, 0.3)));
        drawCard(c, sl.world, lerp(sl.x, HERO.x, e), lerp(sl.y, HERO.y, e), wd, sstep(seg(e, 0.45, 1)), ha);
      }
      // Three worlds rise out of the river and line up.
      for (j = 0; j < 3; j++) {
        var f = P.trio[j].v;
        if (f <= 0.001) continue;
        var u = 0.3 + 0.2 * j, fx = riverX(u), fy = riverY(u) + 20, fw = MINI * 0.7;
        drawCard(c, trio[j], lerp(fx, TRIO_X[j], f), lerp(fy, TRIO_Y, f),
          Math.exp(lerp(Math.log(fw), Math.log(TRIO_W), f)), sstep(seg(f, 0.4, 1)), sstep(seg(f, 0, 0.4)));
      }
      var n = Math.round(WORLDS * P.count.v);
      if (n !== shownCount) { shownCount = n; L.num.textContent = fmt(n); }
    }

    function frame(t) {
      var busy = tickAll(all, t);
      var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
      lastT = t;
      riverT += dt * P.speed.v * (Deck.reducedMotion ? 0.25 : 1);
      updateRiver();
      // Release the card once it is back in the river.
      if (hero >= 0 && slots[hero].held && !P.hero.live && P.hero.v === 0) {
        var h = slots[hero];
        h.held = false;
        h.lap = Math.floor(h.u0 + riverT * h.rate);
      }
      draw();
      return busy;
    }

    function apply(s, entering) {
      var dim = s >= 1;
      if (entering) {
        P.river.to(dim ? DIM : 1, 1100, 120, ease.inOut);
        P.speed.set(dim ? SLOW : 1);
      } else {
        P.river.to(dim ? DIM : 1, 900, 0, ease.inOut);
        P.speed.to(dim ? SLOW : 1, 1000, 0, ease.inOut);
      }
      var trioUp = P.trio[0].v > 0.01 || P.trio[2].v > 0.01;
      if (s === 1) {
        ensureHero();
        var wait = entering ? 500 : trioUp ? 420 : 0;
        P.hero.to(1, 1150, wait, ease.inOut);
        heroLabels.forEach(function (el, q) { show(el, true, wait + 950 + q * 45); });
      } else {
        P.hero.to(0, entering ? 0 : 900, 0, ease.inOut);
        heroLabels.forEach(function (el) { show(el, false); });
      }
      if (s === 2) {
        var wait2 = entering ? 500 : P.hero.v > 0.01 ? 380 : 0;
        P.trio.forEach(function (p, j) { p.to(1, 1050, wait2 + j * 90, ease.inOut); });
        trioLabels.forEach(function (el, q) { show(el, true, wait2 + 1000 + q * 60); });
      } else {
        P.trio.forEach(function (p, j) { p.to(0, entering ? 0 : 750, entering ? 0 : (2 - j) * 60, ease.inOut); });
        trioLabels.forEach(function (el) { show(el, false); });
      }
    }

    function heroPoint(u, v) { return [HERO.x + (u - 0.5) * HERO.w, HERO.y + (v - CARD_H / 2) * HERO.w]; }

    return {
      mount: function (section) {
        S = new Surface(section.querySelector('.scene-root'), 940, 800);
        loop = new Loop(frame);
        loop.always = true;
        mask = S.ctx.createLinearGradient(0, 0, S.w, 0);
        mask.addColorStop(0, 'rgba(0,0,0,0)');
        mask.addColorStop(0.13, 'rgba(0,0,0,1)');
        mask.addColorStop(0.87, 'rgba(0,0,0,1)');
        mask.addColorStop(1, 'rgba(0,0,0,0)');
        var R = rng(2026);
        for (var j = 0; j < NSLOT; j++) {
          var v = -1 + 2 * ((j * 0.618034 + 0.31) % 1), z = (v + 1) / 2;
          slots.push({ u0: (j + R.u()) / NSLOT, v: v, z: z, rate: RATE * lerp(0.55, 1, z), lap: null, world: null, held: false, cv: document.createElement('canvas'), u: 0, x: 0, y: 0, s: 1, a: 0 });
          order.push(j);
        }
        order.sort(function (a, b) { return slots[a].z - slots[b].z; });
        trio = makeTrio();
        updateRiver();

        L.count = S.label('<span>0</span> <em>worlds</em>', S.w, 24, 'r', 'cz-count');
        L.num = L.count.querySelector('span');
        L.ill = S.label('illustrative', S.w, 782, 'r', 'cz-mono cz-sm');
        // Labels of the lifted card, at its final place.
        var p = heroPoint(0.055, 0.065);
        L.heroId = S.label('world', p[0], p[1], 'l', 'cz-mono cz-sm');
        heroLabels.push(L.heroId);
        INPUTS.forEach(function (inp, k) {
          var q = heroPoint(0.5 + (k - 2) * LAY.dx, LAY.inY);
          heroLabels.push(S.label(inp.name, q[0], q[1] - HERO.w * LAY.rI - 18, 'c', 'cz-name cz-sm'));
        });
        p = heroPoint(0.5, LAY.salesY);
        heroLabels.push(S.label('Sales', p[0], p[1], 'c', 'cz-sales'));
        p = heroPoint(0.5 + LAY.rS + 0.03, LAY.salesY);
        heroLabels.push(S.label('stored: graph G', p[0], p[1], 'l', 'cz-tag'));
        p = heroPoint(LAY.gx1, LAY.gy0 - 0.04);
        heroLabels.push(S.label('stored: contributions C', p[0], p[1], 'r', 'cz-tag'));
        p = heroPoint(LAY.gx0, LAY.weekY);
        heroLabels.push(S.label('week 1', p[0], p[1], 'l', 'cz-mono cz-sm'));
        p = heroPoint(LAY.gx1, LAY.weekY);
        heroLabels.push(S.label('week ' + WEEKS, p[0], p[1], 'r', 'cz-mono cz-sm'));
        // Labels of the three aligned worlds.
        trio.forEach(function (w, j) {
          trioLabels.push(S.label('world ' + fmt(w.id), TRIO_X[j] - TRIO_W / 2 + TRIO_W * 0.055, TRIO_Y - TRIO_W * CARD_H / 2 + TRIO_W * 0.07, 'l', 'cz-mono cz-sm'));
        });
        trioLabels.push(S.label('similar data · different graphs', HERO.x, TRIO_Y + TRIO_W * CARD_H / 2 + 46, 'c', 'cz-tag'));
      },
      enter: function (ctx) {
        var s = ctx.step;
        S.enter();
        if (S.k && slots[0].cv.width !== Math.ceil(MINI * S.k)) slots.forEach(renderSprite);
        P.river.set(0);
        P.hero.set(0);
        P.trio.forEach(function (p) { p.set(0); });
        P.count.set(0).to(1, 2600, 350, ease.outQuart);
        lastT = 0;
        updateRiver();
        apply(s, true);
        show(L.count, true, 250);
        show(L.ill, true, 400);
        if (ctx.instant) all.forEach(function (p) { p.finish(); });
        draw();
        loop.run();
      },
      step: function (ctx) {
        apply(ctx.step, false);
        if (ctx.instant) all.forEach(function (p) { p.finish(); });
        loop.run();
      },
      leave: function () {
        loop.stop();
        S.leave();
      },
      resize: function () {
        if (!S || !S.fit()) return;
        slots.forEach(renderSprite);
        draw();
      }
    };
  })());

  /* ==========================================================================
     Scene 3 · intervention: C_{t,TV} = μ_t − μ_t(do(TV = 0)).
     ========================================================================== */
  var IV = (function () {
    var N = 104, R = rng(10112026);
    var flights = [[6, 12], [30, 36], [55, 61], [79, 85], [97, 103]];
    var spend = fill(N, function (i) { return inAny(i, flights) ? R.range(0.7, 1.0) : 0; });
    var carry = adstock(spend, 0.6);
    var ctv = carry.map(function (v) { return 17 * (1 - Math.exp(-v / 1.2)); });
    var base = smooth(fill(N, function (i) { return 36 + 0.04 * i + 4 * Math.sin(2 * Math.PI * (i - 10) / 52) + 0.6 * R.n(); }), 2);
    var search = smooth(fill(N, function (i) { return 7 + 2.5 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (i - 8) / 52)) + 0.3 * R.n(); }), 2);
    var promo = smooth(fill(N, function (i) { return inAny(i, [[20, 22], [46, 48], [72, 74]]) ? R.range(6, 8) : 0; }), 1);
    var hol = fill(N, function (i) { return 9 * bump(i, 50, 1.6) + 10 * bump(i, 102, 1.6); });
    var mu = fill(N, function (i) { return base[i] + ctv[i] + search[i] + promo[i] + hol[i]; });
    var muDo = fill(N, function (i) { return mu[i] - ctv[i]; });
    // The gap label sits where the gap stays widest over a few weeks.
    var mark = 20, widest = -1;
    for (var w = 20; w <= 85; w++) {
      var narrow = Infinity;
      for (var i = w - 3; i <= w + 3; i++) narrow = Math.min(narrow, ctv[i]);
      if (narrow > widest) { widest = narrow; mark = w; }
    }
    return { N: N, spend: spend, ctv: ctv, mu: mu, muDo: muDo, mark: mark, spendMax: maxOf(spend), lo: minOf(muDo), hi: maxOf(mu) };
  })();

  Deck.registerScene('intervention', (function () {
    var N = IV.N;
    var X0 = 40, X1 = 900;
    var SP = { top: 490, zero: 552 };              // TV spend panel
    var SA = { top: 612, bot: 760 };               // sales panel
    var SALES = { x: 734, y: 230, r: 36 };
    var NODES = [                                   // inputs on an arc, TV on top
      { x: 360, y: 52 }, { x: 296, y: 140 }, { x: 278, y: 230 }, { x: 296, y: 320 }, { x: 360, y: 408 }
    ];
    var PRESENT = [true, true, false, true, true];  // Social has no direct edge
    var BENDS = [-0.07, -0.035, 0, 0.035, 0.07];
    var R_IN = 28;
    // Hidden demand U, and where the × sits on each excluded edge
    // (TV → Search, U → Search, U → Sales), clear of River's own edges.
    var U = { x: 630, y: 40, r: 24 };
    var EX_MARK = [0.5, 0.28, 0.5];
    var S, loop, edges = [], ex = [];
    var P = { ent: new Prop(0), dop: new Prop(0), exc: new Prop(0) };
    var all = [P.ent, P.dop, P.exc];
    var L = {}, nodeLabels = [], doLabels = [], exLabels = [];

    function xAt(i) { return X0 + (X1 - X0) * i / (N - 1); }
    function ySpend(v) { return SP.zero - v / (IV.spendMax * 1.12) * (SP.zero - SP.top); }
    var LO = IV.lo - 3, HI = IV.hi + 3;
    function ySales(v) { return SA.bot - (v - LO) / (HI - LO) * (SA.bot - SA.top); }

    function series(c, f, upto) {
      c.beginPath();
      for (var i = 0; i < N; i++) { var x = xAt(i), y = f(i); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); if (x > upto) break; }
    }

    function draw(t) {
      var c = S.begin(), j;
      var en = P.ent.v, dp = P.dop.v, xp = P.exc.v;
      var flow = (t || performance.now()) / 1000 * (Deck.reducedMotion ? 0.08 : 0.32);

      // Edges: present solid with arrowheads, Social dashed and faint.
      for (j = 0; j < 5; j++) {
        var ep = ease.out(seg(en, 0.24 + j * 0.05, 0.52 + j * 0.05));
        if (PRESENT[j]) drawEdge(c, edges[j], ep, { width: 2.5, head: 11 });
        else drawEdge(c, edges[j], ep, { width: 1.8, dash: [6, 6], alpha: 0.36 });
      }
      // Data flow along present edges; TV's stops under do(TV = 0).
      var pa = seg(en, 0.62, 0.85);
      if (pa > 0) {
        for (j = 0; j < 5; j++) {
          if (!PRESENT[j]) continue;
          var a = pa * (j === 0 ? 1 - dp : 1);
          if (a <= 0.01) continue;
          var e = edges[j], tb = e.base(11);
          for (var q = 0; q < 2; q++) {
            var s = (flow + q / 2 + j * 0.17) % 1;
            e.pt(lerp(e.t0, tb, s), P2);
            c.globalAlpha = a * Math.sin(Math.PI * s);
            disc(c, P2[0], P2[1], 3.2, INPUTS[j].color, PAPER, 1.2);
          }
        }
        c.globalAlpha = 1;
      }
      // Nodes.
      for (j = 0; j < 5; j++) {
        var na = ease.out(seg(en, 0.02 + j * 0.045, 0.22 + j * 0.045));
        if (na <= 0) continue;
        var nd = NODES[j], r = R_IN * lerp(0.86, 1, na), col = INPUTS[j].color;
        c.globalAlpha = na;
        if (PRESENT[j]) disc(c, nd.x, nd.y, r, col, col, 1.5);
        else disc(c, nd.x, nd.y, r, PAPER, col, 1.5);
      }
      var sa = ease.out(seg(en, 0.2, 0.42));
      if (sa > 0) {
        c.globalAlpha = sa;
        disc(c, SALES.x, SALES.y, SALES.r * lerp(0.86, 1, sa), NAVY);
      }
      // do(TV = 0): a peach ring that settles on TV.
      if (dp > 0.002) {
        c.globalAlpha = sstep(seg(dp, 0, 0.45));
        disc(c, NODES[0].x, NODES[0].y, R_IN + 9 + 12 * (1 - ease.out(seg(dp, 0, 0.6))), null, PEACH, 2.5);
      }
      // Structure outside River's prior: TV → Search, hidden demand U.
      if (xp > 0.002) {
        for (j = 0; j < ex.length; j++) {
          drawEdge(c, ex[j], 1, { width: 2.2, color: GREY, dash: [3, 6], cap: 'round', head: 9, alpha: xp * 0.9 });
          ex[j].pt(EX_MARK[j], P2);
          cross(c, P2[0], P2[1], 5, GREY, xp);
        }
        c.globalAlpha = xp;
        c.setLineDash([5, 5]);
        disc(c, U.x, U.y, U.r, PAPER, GREY, 1.5);
        c.setLineDash([]);
      }
      c.globalAlpha = 1;

      // Time series, wiped in from the left.
      var wipe = ease.inOut(seg(en, 0.4, 0.95));
      if (wipe > 0) {
        var right = lerp(X0, X1, wipe);
        c.save();
        c.beginPath();
        c.rect(0, SP.top - 20, right + 2, S.h - SP.top + 20);
        c.clip();
        // TV spend: hairline zero, the path, and what do() sets it to.
        c.strokeStyle = HAIR;
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(X0, SP.zero + 0.5); c.lineTo(X1, SP.zero + 0.5); c.stroke();
        var keep = 1 - dp;
        if (dp > 0.002) {
          series(c, function (i) { return ySpend(IV.spend[i]); }, right);
          c.setLineDash([4, 4]);
          c.globalAlpha = 0.5 * dp;
          c.lineWidth = 1.2;
          c.strokeStyle = INPUTS[0].color;
          c.stroke();
          c.setLineDash([]);
        }
        series(c, function (i) { return ySpend(IV.spend[i] * keep); }, right);
        c.lineTo(xAt(N - 1), SP.zero);
        c.lineTo(X0, SP.zero);
        c.closePath();
        c.globalAlpha = 0.24;
        c.fillStyle = INPUTS[0].color;
        c.fill();
        series(c, function (i) { return ySpend(IV.spend[i] * keep); }, right);
        c.globalAlpha = 1;
        c.lineJoin = 'round';
        c.lineWidth = 2;
        c.strokeStyle = INPUTS[0].color;
        c.stroke();

        // Noise-free sales and, under do(TV = 0), the counterfactual below it.
        if (dp > 0.002) {
          c.beginPath();
          for (j = 0; j < N; j++) { if (j === 0) c.moveTo(xAt(j), ySales(IV.mu[j])); else c.lineTo(xAt(j), ySales(IV.mu[j])); }
          for (j = N - 1; j >= 0; j--) c.lineTo(xAt(j), ySales(IV.mu[j] - dp * IV.ctv[j]));
          c.closePath();
          c.globalAlpha = 0.42 * sstep(seg(dp, 0, 0.5));
          c.fillStyle = INPUTS[0].color;
          c.fill();
          series(c, function (i) { return ySales(IV.mu[i] - dp * IV.ctv[i]); }, right);
          c.globalAlpha = 1;
          c.lineWidth = 2.5;
          c.strokeStyle = NAVY;
          c.stroke();
          series(c, function (i) { return ySales(IV.mu[i]); }, right);
          c.setLineDash([6, 5]);
          c.globalAlpha = 0.55 * dp;
          c.lineWidth = 2;
          c.stroke();
          c.setLineDash([]);
        }
        if (dp < 1) {
          series(c, function (i) { return ySales(IV.mu[i]); }, right);
          c.globalAlpha = 1 - dp;
          c.lineWidth = 2.5;
          c.strokeStyle = NAVY;
          c.stroke();
        }
        c.restore();
      }
      c.globalAlpha = 1;
    }

    function frame(t) {
      var busy = tickAll(all, t);
      draw(t);
      return busy;
    }

    function apply(s, entering) {
      var w = entering ? 1700 : 0;
      P.dop.to(s >= 1 ? 1 : 0, s >= 1 ? 1300 : 900, s >= 1 ? w : 0, ease.inOut);
      P.exc.to(s >= 2 ? 1 : 0, 900, s >= 2 ? (entering ? w + 600 : 0) : 0, ease.inOut);
      doLabels.forEach(function (el, q) { show(el, s >= 1, w + 300 + q * 260); });
      exLabels.forEach(function (el, q) { show(el, s >= 2, (entering ? w + 900 : 350) + q * 80); });
    }

    return {
      mount: function (section) {
        S = new Surface(section.querySelector('.scene-root'), 940, 800);
        loop = new Loop(frame);
        loop.always = true;
        NODES.forEach(function (nd, j) {
          edges.push(new Edge(nd.x, nd.y, R_IN + 4, SALES.x, SALES.y, SALES.r + 5, BENDS[j]));
          var inp = INPUTS[j], lx = nd.x - R_IN - 18;
          nodeLabels.push(S.label(inp.name, lx, nd.y - 10, 'r', 'cz-name'));
          nodeLabels.push(S.label(inp.kind, lx, nd.y + 15, 'r', 'cz-kind'));
        });
        nodeLabels.push(S.label('Sales', SALES.x, SALES.y, 'c', 'cz-sales'));
        ex.push(new Edge(NODES[0].x, NODES[0].y, R_IN + 4, NODES[1].x, NODES[1].y, R_IN + 5, 0.12));
        ex.push(new Edge(U.x, U.y, U.r + 4, NODES[1].x, NODES[1].y, R_IN + 5, 0.1));
        ex.push(new Edge(U.x, U.y, U.r + 4, SALES.x, SALES.y, SALES.r + 5, -0.1));

        L.spend = S.label('TV spend', X0, SP.top - 22, 'l', 'cz-mono');
        L.sales = S.label('noise-free sales ' + Deck.tex('\\mu_t'), X0, SA.top - 24, 'l', 'cz-mono');
        L.ill = S.label('illustrative', X1, SP.top - 22, 'r', 'cz-mono cz-sm');
        L.w1 = S.label('week 1', X0, SA.bot + 24, 'l', 'cz-mono cz-sm');
        L.wN = S.label('week ' + N, X1, SA.bot + 24, 'r', 'cz-mono cz-sm');
        doLabels.push(S.label('do(TV = 0)', NODES[0].x + 46, NODES[0].y - 34, 'l', 'cz-do'));
        var mk = IV.mark;
        doLabels.push(S.label(Deck.tex('C_{t,\\mathrm{TV}}'), xAt(mk), (ySales(IV.mu[mk]) + ySales(IV.muDo[mk])) / 2, 'c', 'cz-tex'));
        doLabels.push(S.label('<i class="cz-ln is-dash"></i>' + Deck.tex('\\mu_t') + '<i class="cz-ln"></i>' + Deck.tex('\\mu_t(\\mathrm{do}(\\mathrm{TV}=0))'), X1, SA.top - 24, 'r', 'cz-mono'));
        exLabels.push(S.label('U', U.x, U.y, 'c', 'cz-u'));
        exLabels.push(S.label('not in River’s prior', U.x + U.r + 14, U.y, 'l', 'cz-mono'));
      },
      enter: function (ctx) {
        S.enter();
        P.ent.set(0).to(1, 2000, 150, ease.linear);
        P.dop.set(0);
        P.exc.set(0);
        nodeLabels.forEach(function (el, q) {
          var j = Math.min(4, q >> 1);
          show(el, true, q === nodeLabels.length - 1 ? 150 + 0.3 * 2000 : 150 + (0.06 + j * 0.045) * 2000);
        });
        [L.spend, L.sales, L.ill, L.w1, L.wN].forEach(function (el, q) { show(el, true, 950 + q * 70); });
        apply(ctx.step, true);
        if (ctx.instant) all.forEach(function (p) { p.finish(); });
        draw();
        loop.run();
      },
      step: function (ctx) {
        apply(ctx.step, false);
        if (ctx.instant) all.forEach(function (p) { p.finish(); });
        loop.run();
      },
      leave: function () {
        loop.stop();
        S.leave();
      },
      resize: function () {
        if (S && S.fit()) draw();
      }
    };
  })());
})();
