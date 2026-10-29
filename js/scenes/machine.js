/* ==========================================================================
   Scenes on the dark slides of "Inside River" and "The next stage".
     flow   (slide 14)  conditional flow matching: noise, training pairs,
                        16 Euler steps on the exact marginal velocity field,
                        coherent noise over weeks
     graphs (slide 15)  router graph draws, edge probabilities and the
                        spike-and-slab contribution posteriors
     slots  (slide 22)  one graph for every week, the unused graph slots,
                        research mechanisms, time-varying graphs
   A canvas draws each figure; small DOM labels sit on top for the text.
   Every frame is a function of the current step and of the times at which
   its parts were switched on, so steps can jump in any order.
   ========================================================================== */
(function () {
  'use strict';

  var DATA = window.DECK_DATA;
  var NET = DATA.network;
  var ease = Deck.ease;
  var clamp = Deck.clamp;
  var lerp = Deck.lerp;
  var TAU = Math.PI * 2;

  /* ---- Palette (dark slides) ----------------------------------------------- */
  function hex(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var INK = hex('#F3F6FB');
  var NAVY_DEEP = hex('#06112A');
  var AQUA = hex('#B4E7DD');
  var PERI = hex('#9FAAE2');
  var PEACH = hex('#F6AE72');

  // The deck's inputs: three channels (aqua family) and two controls (peri family).
  var INPUTS = [
    { name: 'TV', kind: 'channel', col: hex('#B4E7DD') },
    { name: 'Search', kind: 'channel', col: hex('#93D9CB') },
    { name: 'Social', kind: 'channel', col: hex('#74C9B9') },
    { name: 'Promo', kind: 'control', col: hex('#9FAAE2') },
    { name: 'Holiday', kind: 'control', col: hex('#C6CCF1') }
  ];
  // Illustrative edge probabilities, as in the causal film (labelled "illustrative" on screen).
  var P_EDGE = [0.94, 0.90, 0.30, 0.86, 0.16];

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')';
  }
  function mix(c1, c2, t) {
    return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
  }
  function smooth(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function pad(n, w) {
    var s = String(n);
    while (s.length < w) s = ' ' + s;
    return s;
  }
  function still() { return !!Deck.reducedMotion; }
  // With reduced motion every scene reaches its final frame within this time after enter or a step.
  var IDLE_MS = 2000;
  // Progress of a timed build: eased 0..1 over `d` ms from `t0` (instant with reduced motion).
  function prog(now, t0, d, e) {
    if (still()) return now >= t0 ? 1 : 0;
    return (e || ease.inOut)(clamp((now - t0) / d, 0, 1));
  }

  /* ---- An animated scalar: a pure function of time once its target is set ---- */
  function Anim(v) { this.a = v; this.b = v; this.t0 = 0; this.d = 1; this.e = ease.inOut; }
  Anim.prototype.get = function (now) {
    var p = (now - this.t0) / this.d;
    if (p >= 1) return this.b;
    if (p <= 0) return this.a;
    return this.a + (this.b - this.a) * this.e(p);
  };
  Anim.prototype.to = function (b, now, d, delay, e) {
    if (b === this.b) return;
    this.a = this.get(now);
    this.b = b;
    this.t0 = now + (still() ? 0 : (delay || 0));
    this.d = Math.max(1, still() ? Math.min(d, 200) : d);
    this.e = e || ease.inOut;
  };
  Anim.prototype.set = function (v) { this.a = v; this.b = v; this.t0 = 0; this.d = 1; };
  function snapAll(A) { for (var k in A) A[k].set(A[k].b); }

  /* ---- Seeded random numbers (mulberry32, Box-Muller) ------------------------ */
  function rng(seed) {
    var s = seed >>> 0;
    var spare = null;
    function random() {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function normal() {
      if (spare !== null) { var v = spare; spare = null; return v; }
      var u = random() || 1e-12;
      var w = random();
      var r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(TAU * w);
      return r * Math.cos(TAU * w);
    }
    function shuffle(n) {
      var a = [];
      var i;
      for (i = 0; i < n; i++) a.push(i);
      for (i = n - 1; i > 0; i--) {
        var j = Math.floor(random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    return { random: random, normal: normal, shuffle: shuffle };
  }

  // Standard normal quantile (Acklam's rational approximation, |error| < 1.2e-9).
  function probit(p) {
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var q;
    if (p < 0.02425 || p > 0.97575) {
      q = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
      var x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
      return p < 0.5 ? x : -x;
    }
    q = p - 0.5;
    var r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /* ---- Surface: a canvas over the scene root, DOM labels, one rAF loop ------- */
  function Surface(section, name) {
    var root = section.querySelector('.scene-root');
    this.w = root.offsetWidth;
    this.h = root.offsetHeight;
    this.wrap = document.createElement('div');
    this.wrap.className = 'mx mx-' + name;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mx-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.wrap.appendChild(this.canvas);
    root.appendChild(this.wrap);
    this.ctx = this.canvas.getContext('2d');
    this.k = 1;
    this.labels = [];
    this.raf = 0;
    this.running = false;
    this.active = false;
    this.idleAt = Infinity;
    this.draw = null;
    this.layers = [];
  }
  // Backing store = scene size x stage scale x device pixel ratio (capped at 2).
  Surface.prototype.fit = function () {
    var k = Deck.scale() * Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.max(1, Math.round(this.w * k));
    var bh = Math.max(1, Math.round(this.h * k));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    this.k = bw / this.w;
    for (var i = 0; i < this.layers.length; i++) this.sizeLayer(this.layers[i]);
  };
  // Offscreen layer at the backing resolution, for parts that stay still once drawn.
  Surface.prototype.layer = function () {
    var c = document.createElement('canvas');
    var l = { canvas: c, ctx: c.getContext('2d'), ok: false, n: 0 };
    this.layers.push(l);
    this.sizeLayer(l);
    return l;
  };
  Surface.prototype.sizeLayer = function (l) {
    if (l.canvas.width === this.canvas.width && l.canvas.height === this.canvas.height) return;
    l.canvas.width = this.canvas.width;
    l.canvas.height = this.canvas.height;
    l.ok = false;
  };
  // Clears a layer; returns its context in scene px.
  Surface.prototype.beginLayer = function (l) {
    var c = l.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, l.canvas.width, l.canvas.height);
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    return c;
  };
  Surface.prototype.blit = function (ctx, l, a) {
    if (a <= 0.003) return;
    ctx.globalAlpha = a;
    ctx.drawImage(l.canvas, 0, 0, this.w, this.h);
  };
  Surface.prototype.begin = function () {
    var ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    return ctx;
  };
  Surface.prototype.start = function (draw) {
    this.draw = draw;
    this.active = true;
    this.wake();
  };
  // The loop runs while the slide is active. With reduced motion every change settles
  // within IDLE_MS, so the loop stops then; the next step wakes it again.
  Surface.prototype.wake = function () {
    var self = this;
    this.idleAt = still() ? performance.now() + IDLE_MS : Infinity;
    if (this.running) return;
    this.running = true;
    var tick = function (now) {
      if (!self.running) return;
      self.draw(now);
      if (now > self.idleAt) { self.running = false; return; }
      self.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };
  Surface.prototype.stop = function () {
    this.active = false;
    this.running = false;
    cancelAnimationFrame(this.raf);
  };
  // One frame for the current state when the loop is idle (after a resize).
  Surface.prototype.redraw = function () {
    if (this.active && !this.running && this.draw) this.draw(performance.now());
  };
  // A text label at scene px (x, y). anchor: c (centre), l (left-middle), r (right-middle).
  // steps: the steps on which it shows (all steps when omitted).
  Surface.prototype.label = function (html, x, y, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'mx-lab mx-a-' + (opts.anchor || 'c') + (opts.cls ? ' ' + opts.cls : '');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    var inner = document.createElement('span');
    inner.innerHTML = html;
    el.appendChild(inner);
    this.wrap.appendChild(el);
    var lab = { el: el, inner: inner, html: html, steps: opts.steps || null, delay: opts.delay || 0, on: false };
    this.labels.push(lab);
    return lab;
  };
  Surface.prototype.showLabels = function (step, entering) {
    var i;
    var lab;
    if (entering) {
      this.wrap.classList.add('mx-instant');
      for (i = 0; i < this.labels.length; i++) {
        this.labels[i].on = false;
        this.labels[i].el.classList.remove('on');
      }
      void this.wrap.offsetWidth;
      this.wrap.classList.remove('mx-instant');
    }
    for (i = 0; i < this.labels.length; i++) {
      lab = this.labels[i];
      var on = !lab.steps || lab.steps.indexOf(step) !== -1;
      if (on === lab.on) continue;
      lab.on = on;
      if (on) lab.el.style.setProperty('--d', ((entering ? 420 : 240) + lab.delay) + 'ms');
      lab.el.classList.toggle('on', on);
    }
  };
  Surface.prototype.text = function (lab, html) {
    if (lab.html === html) return;
    lab.html = html;
    lab.inner.innerHTML = html;
  };

  /* ---- Drawing helpers -------------------------------------------------------- */
  var PT = [0, 0];
  var DASH = [6, 6];
  var DOTTED = [1, 5];

  // Quadratic edge from (ax, ay) to (bx, by) bent sideways by `bend` px, trimmed by ra and rb.
  function makeEdge(ax, ay, bx, by, bend, ra, rb) {
    var dx = bx - ax;
    var dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var cx = (ax + bx) / 2 - dy / len * bend;
    var cy = (ay + by) / 2 + dx / len * bend;
    var l0 = Math.sqrt((cx - ax) * (cx - ax) + (cy - ay) * (cy - ay)) || 1;
    var l1 = Math.sqrt((bx - cx) * (bx - cx) + (by - cy) * (by - cy)) || 1;
    return {
      x0: ax + (cx - ax) / l0 * ra, y0: ay + (cy - ay) / l0 * ra,
      cx: cx, cy: cy,
      x1: bx - (bx - cx) / l1 * rb, y1: by - (by - cy) / l1 * rb
    };
  }
  function qpt(e, t, out) {
    var u = 1 - t;
    out[0] = u * u * e.x0 + 2 * u * t * e.cx + t * t * e.x1;
    out[1] = u * u * e.y0 + 2 * u * t * e.cy + t * t * e.y1;
    return out;
  }
  function qlen(e) {
    var chord = Math.sqrt((e.x1 - e.x0) * (e.x1 - e.x0) + (e.y1 - e.y0) * (e.y1 - e.y0));
    var poly = Math.sqrt((e.cx - e.x0) * (e.cx - e.x0) + (e.cy - e.y0) * (e.cy - e.y0)) +
      Math.sqrt((e.x1 - e.cx) * (e.x1 - e.cx) + (e.y1 - e.cy) * (e.y1 - e.cy));
    return (chord + poly) / 2;
  }
  // The part of the curve from t = 0 to t = p (de Casteljau split).
  function qpath(ctx, e, p) {
    ctx.moveTo(e.x0, e.y0);
    if (p >= 1) { ctx.quadraticCurveTo(e.cx, e.cy, e.x1, e.y1); return; }
    var ax = lerp(e.x0, e.cx, p);
    var ay = lerp(e.y0, e.cy, p);
    ctx.quadraticCurveTo(ax, ay, lerp(ax, lerp(e.cx, e.x1, p), p), lerp(ay, lerp(e.cy, e.y1, p), p));
  }
  // Filled arrowhead with its tip at (x, y), pointing along (ux, uy).
  function arrowHead(ctx, x, y, ux, uy, size) {
    var l = Math.sqrt(ux * ux + uy * uy) || 1;
    ux /= l; uy /= l;
    var w = size * 0.48;
    ctx.moveTo(x, y);
    ctx.lineTo(x - ux * size - uy * w, y - uy * size + ux * w);
    ctx.lineTo(x - ux * size + uy * w, y - uy * size - ux * w);
    ctx.closePath();
  }
  // o: {col, a, w, dash, p (drawn fraction), head (arrowhead size, 0 for none)}
  function drawEdge(ctx, e, o) {
    var p = o.p === undefined ? 1 : o.p;
    if (p <= 0.002 || o.a <= 0.003) return;
    var hs = o.head || 0;
    var len = qlen(e);
    ctx.globalAlpha = o.a;
    ctx.strokeStyle = rgba(o.col, 1);
    ctx.lineWidth = o.w;
    ctx.setLineDash(o.dash || []);
    ctx.lineCap = o.dash === DOTTED ? 'round' : 'butt';
    ctx.beginPath();
    qpath(ctx, e, hs ? Math.min(p, 1 - (hs * 0.8) / len) : p);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    if (hs && p >= 0.999) {
      ctx.fillStyle = rgba(o.col, 1);
      ctx.beginPath();
      arrowHead(ctx, e.x1, e.y1, e.x1 - e.cx, e.y1 - e.cy, hs);
      ctx.fill();
    }
  }
  function disc(ctx, x, y, r, col, a) {
    if (a <= 0.003) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(col, 1);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // Graph node: dark disc lit toward its colour, 1.5 px ring.
  function node(ctx, x, y, r, col, lit, a) {
    if (a <= 0.003) return;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = rgba(mix(NAVY_DEEP, col, lit), 1);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(col, 0.5 + 0.5 * lit);
    ctx.stroke();
  }
  // Data travelling along an edge: `count` beads, faded at both ends.
  function flowDots(ctx, e, phase, count, a, col, r) {
    if (a < 0.01 || still()) return;
    for (var d = 0; d < count; d++) {
      var s = (phase + d / count) % 1;
      if (s < 0) s += 1;
      qpt(e, s, PT);
      ctx.globalAlpha = a * Math.sin(Math.PI * s);
      ctx.beginPath();
      ctx.arc(PT[0], PT[1], r || 3, 0, TAU);
      ctx.fillStyle = rgba(col, 1);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(NAVY_DEEP, 1);
      ctx.stroke();
    }
  }
  // Small cross marking an excluded slot.
  function cross(ctx, x, y, s) {
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
  }
  function monoFont(ctx, px) {
    ctx.font = '400 ' + px + 'px "Fira Mono", ui-monospace, Menlo, monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (px * 0.04).toFixed(2) + 'px';
  }

  /* ==========================================================================
     flow (slide 14): conditional flow matching on a two-mode target
     ========================================================================== */
  function flowScene() {
    var K = NET.eulerSteps;            // uniform explicit Euler steps at inference
    var RHO = NET.noiseRho;            // share of the coherent noise component
    var N_NOISE = 400;
    var N_TARGET = 260;
    var N_PAIRS = 8;
    var N_LINES = 31;
    var WEEKS = 52;
    var N_SERIES = 6;
    var O = [226, 392];                // noise centre (scene px)
    var S = 60;                        // px per unit of z
    // Target: two graphs give two modes of the contributions (illustrative).
    var MODES = [
      { mu: [8.6, -2.72], sd: [0.42, 0.6], w: 0.56 },
      { mu: [8.6, 2.78], sd: [0.5, 0.44], w: 0.44 }
    ];
    var HOP = 300;                     // ms per Euler step on screen
    var HOP_MOVE = 210;
    var TAU_PERIOD = 7200;             // ms for a training marker to slide from tau = 0 to 1
    var RING_A = [0.34, 0.2, 0.1];
    var TARGET_BLOOM = 1400;           // ms after the entrance by which the target has bloomed
    var SER_COLS = [hex('#B4E7DD'), hex('#93D9CB'), hex('#74C9B9')];
    var CH = { x0: 60, x1: 920, y0: 390, unit: 64, axis: 640 };

    var sf;
    var L = {};
    var A = {
      view: new Anim(0), noise: new Anim(1), target: new Anim(1), pairs: new Anim(0),
      stream: new Anim(0), time: new Anim(0), rise: new Anim(0)
    };
    var st = { step: 0, bloomT0: -1e9, pairsT0: 0, streamT0: 0, timeT0: 0, hop: null, euler: -1 };
    var noise, target, paths, lines, pairs, series, sprites;
    var lay = {};                      // cached layers: streamlines, target, Euler trails
    var LW = [0, 0];
    var EX = [0, 0];
    var EY = [0, 0];
    var V = [0, 0];

    function X(x) { return O[0] + S * x; }
    function Y(y) { return O[1] + S * y; }
    function TX(t) { return CH.x0 + (CH.x1 - CH.x0) * t / (WEEKS - 1); }
    function TY(v) { return CH.y0 - CH.unit * v; }

    // Exact marginal velocity of the path z_tau = (1 - tau) z0 + tau z1 with z0 ~ N(0, I) and
    // z1 ~ sum_k w_k N(mu_k, diag sd_k^2):  v(z, tau) = E[z1 - z0 | z_tau = z]
    //   = sum_k r_k(z, tau) (mu_k + c_k (z - tau mu_k)),   c_k = (tau sd_k^2 - (1 - tau)) / s_k^2,
    //   s_k^2 = (1 - tau)^2 + tau^2 sd_k^2,   r_k proportional to w_k N(z; tau mu_k, s_k^2).
    function velocity(x, y, tau, out) {
      var om = 1 - tau;
      var lmax = -Infinity;
      var k;
      for (k = 0; k < MODES.length; k++) {
        var m = MODES[k];
        var vx = m.sd[0] * m.sd[0];
        var vy = m.sd[1] * m.sd[1];
        var sx2 = om * om + tau * tau * vx;
        var sy2 = om * om + tau * tau * vy;
        var dx = x - tau * m.mu[0];
        var dy = y - tau * m.mu[1];
        LW[k] = Math.log(m.w) - 0.5 * (dx * dx / sx2 + dy * dy / sy2 + Math.log(sx2 * sy2));
        EX[k] = m.mu[0] + (tau * vx - om) / sx2 * dx;
        EY[k] = m.mu[1] + (tau * vy - om) / sy2 * dy;
        if (LW[k] > lmax) lmax = LW[k];
      }
      var ws = 0;
      var ox = 0;
      var oy = 0;
      for (k = 0; k < MODES.length; k++) {
        var wk = Math.exp(LW[k] - lmax);
        ws += wk;
        ox += wk * EX[k];
        oy += wk * EY[k];
      }
      out[0] = ox / ws;
      out[1] = oy / ws;
    }

    function sprite(col) {
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      var g = c.getContext('2d');
      var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, rgba(col, 1));
      grd.addColorStop(0.27, rgba(col, 1));
      grd.addColorStop(0.33, rgba(col, 0.3));
      grd.addColorStop(0.55, rgba(col, 0.08));
      grd.addColorStop(1, rgba(col, 0));
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      return c;
    }

    function build() {
      var R = rng(11);
      var i, j, p, x, y, o;
      noise = [];
      while (noise.length < N_NOISE) {
        x = R.normal();
        y = R.normal();
        if (x * x + y * y > 10.9) continue;            // |z| < 3.3 keeps the cloud inside the frame
        noise.push({ x: x, y: y, r: 1.5 + 1.1 * R.random(), a: 0.5 + 0.45 * R.random(), d: 150 * Math.sqrt(x * x + y * y) + 140 * R.random() });
      }
      target = [];
      for (i = 0; i < N_TARGET; i++) {
        var m = MODES[R.random() < MODES[0].w ? 0 : 1];
        target.push({ x: m.mu[0] + m.sd[0] * R.normal(), y: m.mu[1] + m.sd[1] * R.normal(), r: 1.3 + 0.9 * R.random(), a: 0.3 + 0.4 * R.random(), d: 250 + 450 * R.random() });
      }

      // Inference: K explicit Euler steps of the exact field from every noise point.
      paths = new Float32Array(N_NOISE * (K + 1) * 2);
      for (p = 0; p < N_NOISE; p++) {
        x = noise[p].x;
        y = noise[p].y;
        o = p * (K + 1) * 2;
        paths[o] = x;
        paths[o + 1] = y;
        for (i = 0; i < K; i++) {
          velocity(x, y, i / K, V);
          x += V[0] / K;
          y += V[1] / K;
          paths[o + 2 * i + 2] = x;
          paths[o + 2 * i + 3] = y;
        }
      }

      // Streamlines: integral curves of the same field (RK4), seeded at normal quantiles.
      lines = [];
      var NS = 72;
      var h = 1 / NS;
      for (j = 0; j < N_LINES; j++) {
        var z = probit((j + 0.5) / N_LINES);
        var pts = new Float32Array((NS + 1) * 2);
        x = 0;
        y = z;
        pts[0] = x;
        pts[1] = y;
        for (i = 0; i < NS; i++) {
          var t = i * h;
          velocity(x, y, t, V);
          var k1x = V[0];
          var k1y = V[1];
          velocity(x + 0.5 * h * k1x, y + 0.5 * h * k1y, t + 0.5 * h, V);
          var k2x = V[0];
          var k2y = V[1];
          velocity(x + 0.5 * h * k2x, y + 0.5 * h * k2y, t + 0.5 * h, V);
          var k3x = V[0];
          var k3y = V[1];
          velocity(x + h * k3x, y + h * k3y, t + h, V);
          x += h / 6 * (k1x + 2 * k2x + 2 * k3x + V[0]);
          y += h / 6 * (k1y + 2 * k2y + 2 * k3y + V[1]);
          pts[2 * i + 2] = x;
          pts[2 * i + 3] = y;
        }
        lines.push({ pts: pts, z: z });
      }

      // Training pairs: independent noise and target points, stratified flow times (j + u_j) / N.
      pairs = [];
      var used = {};
      var modeOf = [0, 1, 0, 1, 0, 0, 1, 0];
      var order = R.shuffle(N_PAIRS);
      for (j = 0; j < N_PAIRS; j++) {
        var ang = -Math.PI + (j + 0.5) * TAU / N_PAIRS;
        var best = 0;
        var bd = Infinity;
        for (p = 0; p < N_NOISE; p++) {
          var q = noise[p];
          var rr = Math.sqrt(q.x * q.x + q.y * q.y);
          if (used[p] || rr < 0.8 || rr > 1.9) continue;
          var da = Math.atan2(q.y, q.x) - ang;
          da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
          if (da < bd) { bd = da; best = p; }
        }
        used[best] = true;
        var mm = MODES[modeOf[j]];
        pairs.push({
          x0: noise[best].x, y0: noise[best].y,
          x1: mm.mu[0] + 0.8 * mm.sd[0] * R.normal(), y1: mm.mu[1] + 0.8 * mm.sd[1] * R.normal(),
          ph: (order[j] + R.random()) / N_PAIRS
        });
      }

      // Noise over weeks: z0_t = sqrt(rho) kappa_t + sqrt(1 - rho) e_t, kappa smooth with unit variance;
      // the faded twin of each draw is the same e_t with rho = 0.
      series = [];
      for (j = 0; j < N_SERIES; j++) {
        var a0 = R.normal();
        var comps = [];
        for (i = 0; i < 3; i++) comps.push({ a: R.normal(), f: 0.35 + 0.55 * i + 0.3 * R.random(), ph: TAU * R.random() });
        var coh = new Float32Array(WEEKS);
        var ind = new Float32Array(WEEKS);
        for (var wk = 0; wk < WEEKS; wk++) {
          var kap = a0;
          for (i = 0; i < 3; i++) kap += comps[i].a * Math.SQRT2 * Math.sin(TAU * comps[i].f * wk / WEEKS + comps[i].ph);
          kap /= 2;
          var e = R.normal();
          coh[wk] = Math.sqrt(RHO) * kap + Math.sqrt(1 - RHO) * e;
          ind[wk] = e;
        }
        series.push({ coh: coh, ind: ind, col: SER_COLS[j % 3] });
      }

      sprites = [];
      for (i = 0; i <= 5; i++) sprites.push(sprite(mix(INK, AQUA, i / 5)));
    }

    /* -- Euler hops: rewinds to the noise, then plays K hops ------------------- */
    function hopPos(now) {
      var hp = st.hop;
      if (now >= hp.play) {
        if (still()) return K;
        var t = now - hp.play;
        var i = Math.floor(t / HOP);
        if (i >= K) return K;
        return i + ease.inOut(clamp((t - i * HOP) / HOP_MOVE, 0, 1));
      }
      if (hp.from <= 0) return 0;
      return hp.from * (1 - ease.inOut(clamp((now - hp.t0) / hp.dur, 0, 1)));
    }
    function trailAlpha(now) {
      var hp = st.hop;
      if (now >= hp.play) return 1;
      if (hp.from <= 0) return 0;
      return 1 - clamp((now - hp.t0) / (0.7 * hp.dur), 0, 1);
    }
    function eulerCount(now) {
      var hp = st.hop;
      if (now < hp.play) return 0;
      if (still()) return K;
      return Math.min(K, Math.floor((now - hp.play) / HOP) + 1);
    }
    function rewind(now, playAt) {
      var h = hopPos(now);
      var d = h > 0.01 ? 450 + 25 * h : 1;
      st.hop = { from: h, t0: now, dur: still() ? 1 : d, play: playAt === Infinity ? Infinity : Math.max(playAt, now + (h > 0.01 ? d + 200 : 0)) };
    }
    function bloom(now, d) {
      return ease.out(clamp((now - st.bloomT0 - d) / 650, 0, 1));
    }

    /* -- Drawing --------------------------------------------------------------- */
    function draw(now) {
      var ctx = sf.begin();
      var av = A.view.get(now);
      var at = A.time.get(now);
      var rise = A.rise.get(now);
      // Offsets snap to whole device pixels so the cached layers copy without resampling.
      if (av > 0.003) {
        ctx.save();
        ctx.translate(0, Math.round((rise - 18 * (1 - av)) * sf.k) / sf.k);
        draw2d(ctx, now, av);
        ctx.restore();
      }
      if (at > 0.003) {
        ctx.save();
        ctx.translate(0, Math.round((rise + 18 * (1 - at)) * sf.k) / sf.k);
        drawTime(ctx, now, at);
        ctx.restore();
      }
      var k = eulerCount(now);
      if (k !== st.euler) {
        st.euler = k;
        sf.text(L.euler, 'Euler step ' + pad(k, 2) + ' / ' + K);
      }
    }

    function draw2d(ctx, now, av) {
      var h = hopPos(now);
      var tr = trailAlpha(now) * av;
      var as = A.stream.get(now) * av;
      var ap = A.pairs.get(now) * av;
      if (as > 0.003) drawLines(ctx, now, as);
      drawTarget(ctx, now, av * A.target.get(now));
      if (h > 0.001 && tr > 0.003) drawTrails(ctx, now, h, tr);
      if (ap > 0.003) drawPairLines(ctx, now, ap);
      drawNoise(ctx, now, h, av * A.noise.get(now));
      if (ap > 0.003) drawPairMarks(ctx, now, ap);
    }

    function drawLines(ctx, now, a) {
      var rev = prog(now, st.streamT0, 1500);
      if (rev <= 0) return;
      if (rev < 1) { strokeLines(ctx, rev, a); return; }
      if (!lay.lines.ok) {
        strokeLines(sf.beginLayer(lay.lines), 1, 1);
        lay.lines.ok = true;
      }
      sf.blit(ctx, lay.lines, a);
    }
    function strokeLines(c, rev, a) {
      var grad = c.createLinearGradient(X(0), 0, X(MODES[0].mu[0]), 0);
      grad.addColorStop(0, rgba(INK, 1));
      grad.addColorStop(1, rgba(AQUA, 1));
      var np = lines[0].pts.length / 2;
      var last = rev * (np - 1);
      var n = Math.floor(last);
      var f = last - n;
      c.lineWidth = 1;
      c.strokeStyle = grad;
      for (var j = 0; j < lines.length; j++) {
        var pts = lines[j].pts;
        var z = lines[j].z;
        c.globalAlpha = a * (0.05 + 0.13 * Math.exp(-z * z / 0.98));
        c.beginPath();
        c.moveTo(X(pts[0]), Y(pts[1]));
        for (var i = 1; i <= n; i++) c.lineTo(X(pts[2 * i]), Y(pts[2 * i + 1]));
        if (n < np - 1) c.lineTo(X(lerp(pts[2 * n], pts[2 * n + 2], f)), Y(lerp(pts[2 * n + 1], pts[2 * n + 3], f)));
        c.stroke();
      }
    }

    function drawTarget(ctx, now, a) {
      if (a < 0.003) return;
      if (now - st.bloomT0 < TARGET_BLOOM) { paintTarget(ctx, now, a); return; }
      if (!lay.target.ok) {
        paintTarget(sf.beginLayer(lay.target), now, 1);
        lay.target.ok = true;
      }
      sf.blit(ctx, lay.target, a);
    }
    function paintTarget(c, now, a) {
      var ring = a * bloom(now, 380);
      c.lineWidth = 1;
      c.strokeStyle = rgba(AQUA, 1);
      for (var k = 0; k < MODES.length; k++) {
        var m = MODES[k];
        for (var s = 1; s <= 3; s++) {
          c.globalAlpha = ring * RING_A[s - 1];
          c.beginPath();
          c.ellipse(X(m.mu[0]), Y(m.mu[1]), s * m.sd[0] * S, s * m.sd[1] * S, 0, 0, TAU);
          c.stroke();
        }
      }
      var spr = sprites[5];
      for (var i = 0; i < target.length; i++) {
        var q = target[i];
        var qa = q.a * a * bloom(now, q.d);
        if (qa < 0.01) continue;
        var hs = q.r * 3.2;
        c.globalAlpha = qa;
        c.drawImage(spr, X(q.x) - hs, Y(q.y) - hs, 2 * hs, 2 * hs);
      }
    }

    // Trails: a hairline through the hops and one dot per Euler step (white at the start, aqua at the end).
    // Finished hops accumulate in a layer; only the hop in progress is drawn live.
    function drawTrails(ctx, now, h, a) {
      var hp = st.hop;
      var tl = lay.trail;
      var n = Math.min(Math.floor(h), K);
      var f = h - n;
      var p, o;
      if (!tl.ok) {
        sf.beginLayer(tl);
        tl.n = 0;
        tl.ok = true;
      }
      if (now >= hp.play) {
        if (n < tl.n) {
          sf.beginLayer(tl);
          tl.n = 0;
        }
        while (tl.n < n) appendHop(tl.ctx, ++tl.n);
      }
      sf.blit(ctx, tl, a);
      if (now < hp.play || f <= 0 || n >= K) return;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = rgba(INK, 1);
      ctx.globalAlpha = 0.07 * a;
      ctx.beginPath();
      for (p = 0; p < N_NOISE; p++) {
        o = p * (K + 1) * 2 + 2 * n;
        ctx.moveTo(X(paths[o]), Y(paths[o + 1]));
        ctx.lineTo(X(lerp(paths[o], paths[o + 2], f)), Y(lerp(paths[o + 1], paths[o + 3], f)));
      }
      ctx.stroke();
    }
    // Hop i of every particle into the trail layer: the segment from step i - 1 and the dot at step i.
    function appendHop(c, i) {
      var p, o;
      c.lineWidth = 0.8;
      c.strokeStyle = rgba(INK, 1);
      c.globalAlpha = 0.07;
      c.beginPath();
      for (p = 0; p < N_NOISE; p++) {
        o = p * (K + 1) * 2 + 2 * (i - 1);
        c.moveTo(X(paths[o]), Y(paths[o + 1]));
        c.lineTo(X(paths[o + 2]), Y(paths[o + 3]));
      }
      c.stroke();
      c.globalAlpha = 0.36;
      c.fillStyle = rgba(mix(INK, AQUA, i / K), 1);
      c.beginPath();
      for (p = 0; p < N_NOISE; p++) {
        o = p * (K + 1) * 2 + 2 * i;
        c.rect(X(paths[o]) - 0.8, Y(paths[o + 1]) - 0.8, 1.6, 1.6);
      }
      c.fill();
    }

    function drawNoise(ctx, now, h, a) {
      if (a < 0.003) return;
      var n = Math.min(Math.floor(h), K);
      var f = h - n;
      var spr = sprites[Math.round(5 * Math.pow(h / K, 1.5))];
      for (var p = 0; p < N_NOISE; p++) {
        var q = noise[p];
        var qa = q.a * a * bloom(now, q.d);
        if (qa < 0.01) continue;
        var o = p * (K + 1) * 2 + 2 * n;
        var x = paths[o];
        var y = paths[o + 1];
        if (f > 0 && n < K) {
          x = lerp(x, paths[o + 2], f);
          y = lerp(y, paths[o + 3], f);
        }
        var hs = q.r * 3.2;
        ctx.globalAlpha = qa;
        ctx.drawImage(spr, X(x) - hs, Y(y) - hs, 2 * hs, 2 * hs);
      }
    }

    function pairReveal(now, j) { return prog(now, st.pairsT0 + 90 * j, 800); }

    function drawPairLines(ctx, now, a) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(INK, 1);
      ctx.globalAlpha = 0.4 * a;
      ctx.beginPath();
      for (var j = 0; j < pairs.length; j++) {
        var pr = pairs[j];
        var p = pairReveal(now, j);
        if (p <= 0) continue;
        var x0 = X(pr.x0);
        var y0 = Y(pr.y0);
        ctx.moveTo(x0, y0);
        ctx.lineTo(lerp(x0, X(pr.x1), p), lerp(y0, Y(pr.y1), p));
      }
      ctx.stroke();
    }

    // Endpoints, the marker at z_tau and the velocity target u = z1 - z0 (the same all along the line).
    function drawPairMarks(ctx, now, a) {
      for (var j = 0; j < pairs.length; j++) {
        var pr = pairs[j];
        var p = pairReveal(now, j);
        if (p <= 0) continue;
        var x0 = X(pr.x0);
        var y0 = Y(pr.y0);
        var x1 = X(pr.x1);
        var y1 = Y(pr.y1);
        disc(ctx, x0, y0, 3.2, INK, a * Math.min(1, 4 * p));
        if (p >= 1) disc(ctx, x1, y1, 3.2, AQUA, a);
        var mt = still() ? 1 : smooth(900, 1500, now - st.pairsT0 - 90 * j);
        if (mt <= 0) continue;
        var tau = still() ? pr.ph : (pr.ph + Math.max(0, now - st.pairsT0) / TAU_PERIOD) % 1;
        var fade = mt * smooth(0, 0.06, tau) * (1 - smooth(0.94, 1, tau));
        if (fade < 0.01) continue;
        var dx = x1 - x0;
        var dy = y1 - y0;
        var len = Math.sqrt(dx * dx + dy * dy);
        var ux = dx / len;
        var uy = dy / len;
        var mx = x0 + dx * tau;
        var my = y0 + dy * tau;
        var al = 0.14 * len;
        ctx.globalAlpha = a * fade;
        ctx.strokeStyle = rgba(PEACH, 1);
        ctx.fillStyle = rgba(PEACH, 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx + ux * 7, my + uy * 7);
        ctx.lineTo(mx + ux * (al - 7), my + uy * (al - 7));
        ctx.stroke();
        ctx.beginPath();
        arrowHead(ctx, mx + ux * al, my + uy * al, ux, uy, 9);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx, my, 4.6, 0, TAU);
        ctx.fillStyle = rgba(NAVY_DEEP, 1);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(INK, 1);
        ctx.stroke();
      }
    }

    function timeReveal(now, j, lag) { return prog(now, st.timeT0 + lag + 110 * j, 1300); }
    function polyline(ctx, v, p) {
      var n = v.length;
      var last = p * (n - 1);
      var m = Math.floor(last);
      ctx.beginPath();
      ctx.moveTo(TX(0), TY(v[0]));
      for (var i = 1; i <= m; i++) ctx.lineTo(TX(i), TY(v[i]));
      if (m < n - 1) {
        var f = last - m;
        ctx.lineTo(TX(m + f), TY(lerp(v[m], v[m + 1], f)));
      }
      ctx.stroke();
    }
    function drawTime(ctx, now, a) {
      var j, p;
      ctx.globalAlpha = a;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(INK, 0.18);
      ctx.beginPath();
      ctx.moveTo(CH.x0, CH.axis + 0.5);
      ctx.lineTo(CH.x1, CH.axis + 0.5);
      for (j = 0; j <= 4; j++) {
        var tx = Math.round(TX((WEEKS - 1) * j / 4)) + 0.5;
        ctx.moveTo(tx, CH.axis);
        ctx.lineTo(tx, CH.axis + 6);
      }
      ctx.stroke();
      // rho = 0: the same draws without the shared component (faded, jagged)
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(INK, 1);
      for (j = 0; j < series.length; j++) {
        p = timeReveal(now, j, 450);
        if (p <= 0) continue;
        ctx.globalAlpha = a * 0.15;
        polyline(ctx, series[j].ind, p);
      }
      // rho = 0.98: coherent draws
      ctx.lineWidth = 1.8;
      for (j = 0; j < series.length; j++) {
        p = timeReveal(now, j, 0);
        if (p <= 0) continue;
        ctx.globalAlpha = a * 0.92;
        ctx.strokeStyle = rgba(series[j].col, 1);
        polyline(ctx, series[j].coh, p);
      }
    }

    /* -- Steps ----------------------------------------------------------------- */
    function setStep(s, now, entering) {
      st.step = s;
      var show2d = s <= 2;
      // Back from the time view: the particles start again from the noise.
      if (show2d && A.view.get(now) < 0.02) st.hop = { from: 0, t0: now, dur: 1, play: Infinity };
      A.view.to(show2d ? 1 : 0, now, show2d ? 900 : 600, show2d && !entering ? 200 : 0);
      A.noise.to(s === 1 ? 0.3 : 1, now, 700);
      A.target.to(s === 0 ? 1 : (s === 1 ? 0.55 : 0.42), now, 800);
      if (s === 1 && A.pairs.get(now) < 0.02) st.pairsT0 = now + (entering ? 900 : 200);
      A.pairs.to(s === 1 ? 1 : 0, now, s === 1 ? 500 : 450);
      if (s === 2 && A.stream.get(now) < 0.02) st.streamT0 = now + (entering ? 700 : 150);
      A.stream.to(s === 2 ? 1 : 0, now, s === 2 ? 900 : 500);
      if (s === 3 && A.time.get(now) < 0.02) st.timeT0 = now + 450;
      A.time.to(s === 3 ? 1 : 0, now, s === 3 ? 900 : 450, s === 3 && !entering ? 250 : 0);
      if (s === 2) rewind(now, now + (entering ? 1700 : 1000));
      else if (s < 2) rewind(now, Infinity);
      sf.showLabels(s, entering);
    }
    function snap(now) {
      snapAll(A);
      st.bloomT0 = -1e9;
      st.pairsT0 = Math.min(st.pairsT0, now - 5000);
      st.streamT0 = Math.min(st.streamT0, now - 5000);
      st.timeT0 = Math.min(st.timeT0, now - 5000);
      if (st.step === 2) st.hop = { from: 0, t0: now, dur: 1, play: now - K * HOP - 1 };
    }

    return {
      mount: function (section) {
        sf = new Surface(section, 'flow');
        lay.lines = sf.layer();
        lay.target = sf.layer();
        lay.trail = sf.layer();
        build();
        st.hop = { from: 0, t0: 0, dur: 1, play: Infinity };
        var top = pairs[0];
        for (var j = 1; j < pairs.length; j++) if (pairs[j].y0 < top.y0) top = pairs[j];
        L.noise = sf.label('z<sub>0</sub> · base noise', O[0], O[1] + 3.3 * S + 46, { cls: 'mx-mono', steps: [0, 1, 2], delay: 300 });
        L.g1 = sf.label('graph G<sub>1</sub>', X(MODES[0].mu[0] + 3 * MODES[0].sd[0]) + 22, Y(MODES[0].mu[1]), { anchor: 'l', cls: 'mx-mono mx-aqua', steps: [0, 1, 2], delay: 450 });
        L.g2 = sf.label('graph G<sub>2</sub>', X(MODES[1].mu[0] + 3 * MODES[1].sd[0]) + 22, Y(MODES[1].mu[1]), { anchor: 'l', cls: 'mx-mono mx-aqua', steps: [0, 1, 2], delay: 520 });
        L.tau = sf.label('τ ~ U(0, 1)', 470, 64, { cls: 'mx-mono', steps: [1], delay: 450 });
        L.u = sf.label('u = z<sub>1</sub> − z<sub>0</sub>', 470, 96, { cls: 'mx-mono mx-hot', steps: [1], delay: 900 });
        L.z0 = sf.label('z<sub>0</sub>', X(top.x0) - 12, Y(top.y0) - 14, { anchor: 'r', cls: 'mx-mono', steps: [1], delay: 500 });
        L.z1 = sf.label('z<sub>1</sub>', X(top.x1) + 12, Y(top.y1) - 18, { anchor: 'l', cls: 'mx-mono mx-aqua', steps: [1], delay: 1100 });
        L.euler = sf.label('Euler step ' + pad(0, 2) + ' / ' + K, 470, 64, { cls: 'mx-mono', steps: [2], delay: 300 });
        L.leg1 = sf.label('<i class="mx-sw"></i>ρ = ' + RHO + ' · coherent over weeks', CH.x0, 124, { anchor: 'l', cls: 'mx-mono mx-aqua', steps: [3], delay: 200 });
        L.leg2 = sf.label('<i class="mx-sw"></i>ρ = 0 · independent weeks', CH.x0, 156, { anchor: 'l', cls: 'mx-mono mx-faint', steps: [3], delay: 280 });
        L.w1 = sf.label('week 1', CH.x0, CH.axis + 26, { anchor: 'l', cls: 'mx-mono mx-faint', steps: [3], delay: 300 });
        L.wn = sf.label('week ' + WEEKS, CH.x1, CH.axis + 26, { anchor: 'r', cls: 'mx-mono mx-faint', steps: [3], delay: 340 });
        L.ill = sf.label('illustrative', sf.w - 2, sf.h - 16, { anchor: 'r', cls: 'mx-mono mx-faint', delay: 600 });
      },
      enter: function (ctx) {
        var now = performance.now();
        sf.fit();
        A.view.set(ctx.step <= 2 ? 1 : 0);
        A.noise.set(1);
        A.target.set(1);
        A.pairs.set(0);
        A.stream.set(0);
        A.time.set(0);
        A.rise.set(ctx.dir < 0 ? -16 : 16);
        A.rise.to(0, now, 1300, 150, ease.outQuart);
        st.bloomT0 = now + 220;
        st.hop = { from: 0, t0: now, dur: 1, play: Infinity };
        st.euler = -1;
        setStep(ctx.step, now, true);
        if (ctx.instant) snap(now);
        sf.start(draw);
      },
      step: function (ctx) {
        var now = performance.now();
        setStep(ctx.step, now, false);
        if (ctx.instant) snap(now);
        sf.wake();
      },
      leave: function () { sf.stop(); },
      resize: function () { sf.fit(); sf.redraw(); }
    };
  }

  /* ==========================================================================
     graphs (slide 15): the router samples graphs; contributions given a graph
     ========================================================================== */
  function graphsScene() {
    var N = NET.draws;                 // graph draws per prediction
    var NX = 214;
    var YS = [148, 274, 400, 526, 652];
    var RI = 30;
    var SX = 566;
    var SY = 400;
    var RS = 38;
    var ST = { x0: 712, x1: 992, v0: -0.4, v1: 1.0 };    // contribution axis of the strip
    var SPIKE_H = 72;
    var SLAB_H = 64;
    var G = 140;
    var BW = 0.032;
    var VIS = 12;                      // graph draws shown one by one before the counter runs
    var FAST = 1500;
    var BUILD = 2600;
    // Continuous part of each contribution given an edge (illustrative): channels are
    // nonnegative, controls may be signed.
    var SLAB = [
      { m: 0.56, s: 0.2, pos: true }, { m: 0.42, s: 0.22, pos: true }, { m: 0.2, s: 0.3, pos: true },
      { m: 0.3, s: 0.12 }, { m: 0.03, s: 0.12 }
    ];

    var sf;
    var L = { p: [] };
    var A = { perm: new Anim(0), draw: new Anim(0), freq: new Anim(0), prob: new Anim(0), strip: new Anim(0), tint: new Anim(0) };
    var st = { step: -1, enterT0: 0, drawT0: Infinity, buildT0: Infinity, nAcc: 0, shownDraw: -1, shownBuild: -1 };
    var draws, values, cum, edges, sched, fast0, grids, zeros, gridScale, zeroX;

    function vx(v) { return ST.x0 + (v - ST.v0) / (ST.v1 - ST.v0) * (ST.x1 - ST.x0); }

    function addKernel(gr, v) {
      var span = 4 * BW / (ST.v1 - ST.v0) * (G - 1);
      var gc = (v - ST.v0) / (ST.v1 - ST.v0) * (G - 1);
      var g0 = Math.max(0, Math.floor(gc - span));
      var g1 = Math.min(G - 1, Math.ceil(gc + span));
      for (var g = g0; g <= g1; g++) {
        var d = (ST.v0 + (ST.v1 - ST.v0) * g / (G - 1) - v) / BW;
        gr[g] += Math.exp(-0.5 * d * d);
      }
    }
    // Spike and slab of the first n draws.
    function accumulate(n) {
      var s, i;
      if (n < st.nAcc) {
        for (i = 0; i < 5; i++) { grids[i].fill(0); zeros[i] = 0; }
        st.nAcc = 0;
      }
      for (s = st.nAcc; s < n; s++) {
        for (i = 0; i < 5; i++) {
          if (draws[s * 5 + i]) addKernel(grids[i], values[s * 5 + i]);
          else zeros[i]++;
        }
      }
      st.nAcc = n;
    }

    function build() {
      var R = rng(23);
      var i, s, t;
      // Graph draws: each edge present in exactly round(p N) of the N draws, in random order.
      draws = new Uint8Array(N * 5);
      for (i = 0; i < 5; i++) {
        var idx = R.shuffle(N);
        var k = Math.round(P_EDGE[i] * N);
        for (s = 0; s < k; s++) draws[idx[s] * 5 + i] = 1;
      }
      cum = [];
      for (i = 0; i < 5; i++) {
        var c = new Uint16Array(N + 1);
        for (s = 0; s < N; s++) c[s + 1] = c[s] + draws[s * 5 + i];
        cum.push(c);
      }
      // Decoder draws given each graph: exactly 0 without the edge, the slab with it.
      values = new Float32Array(N * 5);
      for (s = 0; s < N; s++) {
        for (i = 0; i < 5; i++) {
          if (!draws[s * 5 + i]) continue;
          var sl = SLAB[i];
          var z = R.normal();
          values[s * 5 + i] = sl.pos ? sl.m * Math.exp(sl.s * z - 0.5 * sl.s * sl.s) : sl.m + sl.s * z;
        }
      }
      // The first VIS draws come one by one, faster and faster.
      sched = [];
      t = 0;
      var gap = 440;
      for (s = 0; s < VIS; s++) {
        sched.push(t);
        t += gap;
        gap = Math.max(120, gap * 0.8);
      }
      fast0 = t;
      grids = [];
      for (i = 0; i < 5; i++) grids.push(new Float32Array(G));
      zeros = new Uint16Array(5);
      st.nAcc = 0;
      accumulate(N);
      var mx = 0;
      for (i = 0; i < 5; i++) for (s = 0; s < G; s++) mx = Math.max(mx, grids[i][s]);
      gridScale = SLAB_H / mx;
      accumulate(0);
      zeroX = vx(0);
      edges = [];
      for (i = 0; i < 5; i++) edges.push(makeEdge(NX, YS[i], SX, SY, -0.1 * (SY - YS[i]), RI + 4, RS + 5));
    }

    function drawCount(now) {
      var t = now - st.drawT0;
      if (t < 0) return 0;
      if (still()) return N;
      if (t < fast0) {
        var n = 0;
        while (n < VIS && sched[n] <= t) n++;
        return n;
      }
      return Math.min(N, VIS + Math.round((N - VIS) * Math.pow(clamp((t - fast0) / FAST, 0, 1), 1.5)));
    }
    function drawFlash(now, n) {
      if (n < 1 || n > VIS || still()) return 0;
      return Math.exp(-(now - st.drawT0 - sched[n - 1]) / 160);
    }
    function buildCount(now) {
      var t = now - st.buildT0;
      if (t < 0) return 0;
      if (still()) return N;
      return Math.min(N, Math.round(N * Math.pow(clamp(t / BUILD, 0, 1), 1.6)));
    }
    function landTime(s) { return st.buildT0 + BUILD * Math.pow((s + 0.5) / N, 1 / 1.6); }
    function nodeIn(now, i) { return prog(now, st.enterT0 + 150 + 60 * i, 600, ease.out); }
    function edgeIn(now, i) { return prog(now, st.enterT0 + 500 + 70 * i, 900); }

    function draw(now) {
      var ctx = sf.begin();
      var n = drawCount(now);
      drawDag(ctx, now, n);
      var as = A.strip.get(now);
      if (as > 0.003) drawStrip(ctx, now, as);
      else if (st.nAcc) accumulate(0);
      if (n !== st.shownDraw) {
        st.shownDraw = n;
        sf.text(L.count, 'G ~ q(G | D) · draw ' + pad(n, 3) + ' / ' + N);
      }
      var b = as > 0.003 ? buildCount(now) : 0;
      if (b !== st.shownBuild) {
        st.shownBuild = b;
        sf.text(L.strip, 'contributions · draw ' + pad(b, 3) + ' / ' + N);
      }
    }

    function drawDag(ctx, now, n) {
      var aPerm = A.perm.get(now);
      var aDraw = A.draw.get(now);
      var aFreq = A.freq.get(now);
      var aProb = A.prob.get(now);
      var tint = A.tint.get(now);
      var cur = n - 1;
      var flash = drawFlash(now, n);
      var edgeCol = mix(INK, PEACH, tint);
      var i;
      for (i = 0; i < 5; i++) {
        var e = edges[i];
        // permitted by the prior: input -> sales
        drawEdge(ctx, e, { col: INK, a: 0.5 * aPerm, w: 1.5, dash: DASH, p: edgeIn(now, i), head: 8 });
        // edge frequency over the draws so far, settling on the edge probability
        var fr = lerp(n > 0 ? cum[i][n] / n : 0, cum[i][N] / N, aProb);
        if (aFreq > 0.003 && fr > 0.003) {
          drawEdge(ctx, e, { col: edgeCol, a: aFreq * (0.12 + 0.8 * fr), w: 1 + 4.5 * fr, head: 7 + 6 * fr });
        }
        // the current graph draw, with data flowing along its edges
        if (aDraw > 0.003 && cur >= 0 && draws[cur * 5 + i]) {
          drawEdge(ctx, e, { col: PEACH, a: aDraw, w: 2.5 + 1.5 * flash, head: 10 });
          flowDots(ctx, e, (now - st.drawT0) * 0.0011 + i * 0.17, 3, aDraw, PEACH);
        }
        // steady state: the router's edges carry data in proportion to their probability
        if (tint > 0.003) flowDots(ctx, e, (now - st.enterT0) * 0.00032 + i * 0.23, 2, tint * fr, PEACH);
      }
      for (i = 0; i < 5; i++) {
        var on = cur >= 0 ? draws[cur * 5 + i] : 0;
        var lit = lerp(0.16, on ? 1 : 0.1, aDraw);
        lit = lerp(lit, 0.12 + 0.88 * cum[i][N] / N, aProb);
        node(ctx, NX, YS[i], RI * (1 + 0.07 * flash * on * aDraw), INPUTS[i].col, lit, nodeIn(now, i));
      }
      disc(ctx, SX, SY, RS * (1 + 0.04 * flash * aDraw), INK, nodeIn(now, 5));
    }

    function drawStrip(ctx, now, a) {
      var n = buildCount(now);
      var tint = A.tint.get(now);
      var spikeCol = mix(INK, PEACH, tint);
      var i, g, s;
      accumulate(n);
      // zero, shared by every row
      ctx.globalAlpha = a;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(INK, 0.32);
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(zeroX, YS[0] - 66);
      ctx.lineTo(zeroX, YS[4] + 44);
      ctx.stroke();
      ctx.setLineDash([]);
      for (i = 0; i < 5; i++) {
        var yb = YS[i] + 34;
        var col = mix(INPUTS[i].col, AQUA, tint);
        var gr = grids[i];
        ctx.globalAlpha = a;
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(INK, 0.18);
        ctx.beginPath();
        ctx.moveTo(ST.x0, yb + 0.5);
        ctx.lineTo(ST.x1, yb + 0.5);
        ctx.stroke();
        // slab: the continuous part, given a graph with the edge
        ctx.beginPath();
        ctx.moveTo(ST.x0, yb);
        for (g = 0; g < G; g++) ctx.lineTo(ST.x0 + (ST.x1 - ST.x0) * g / (G - 1), yb - gr[g] * gridScale);
        ctx.lineTo(ST.x1, yb);
        ctx.closePath();
        ctx.globalAlpha = a * (0.2 + 0.25 * tint);
        ctx.fillStyle = rgba(col, 1);
        ctx.fill();
        ctx.beginPath();
        for (g = 0; g < G; g++) {
          var px = ST.x0 + (ST.x1 - ST.x0) * g / (G - 1);
          if (g === 0) ctx.moveTo(px, yb - gr[g] * gridScale);
          else ctx.lineTo(px, yb - gr[g] * gridScale);
        }
        ctx.globalAlpha = a;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(col, 0.9);
        ctx.stroke();
        // spike: draws without the edge contribute exactly zero
        var hS = zeros[i] / N * SPIKE_H;
        if (hS > 0.2) {
          ctx.strokeStyle = rgba(spikeCol, 1);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(zeroX, yb);
          ctx.lineTo(zeroX, yb - hS);
          ctx.stroke();
          disc(ctx, zeroX, yb - hS, 3.6, spikeCol, a);
        }
      }
      // the newest draws as they land
      if (!still()) {
        for (s = Math.max(0, n - 90); s < n; s++) {
          var age = now - landTime(s);
          if (age > 520 || age < 0) continue;
          var k = 1 - age / 520;
          for (i = 0; i < 5; i++) {
            var on = draws[s * 5 + i];
            disc(ctx, on ? vx(values[s * 5 + i]) : zeroX, YS[i] + 34 - 5 - 16 * k, 2.2, on ? mix(INPUTS[i].col, AQUA, tint) : spikeCol, a * 0.85 * k);
          }
        }
      }
    }

    function setStep(s, now, entering) {
      var prev = st.step;
      st.step = s;
      A.perm.to(s === 0 ? 1 : 0.22, now, 700);
      A.draw.to(s === 1 ? 1 : 0, now, s === 1 ? 400 : 700);
      A.freq.to(s === 0 ? 0 : (s === 1 ? 0.55 : 1), now, 800);
      A.prob.to(s >= 2 ? 1 : 0, now, s >= 2 ? 1200 : 500);
      if (s >= 3 && A.strip.get(now) < 0.02) st.buildT0 = now + (entering ? 1300 : 300);
      A.strip.to(s >= 3 ? 1 : 0, now, s >= 3 ? 700 : 500);
      A.tint.to(s === 4 ? 1 : 0, now, 900);
      if (s === 1 && prev !== 1) st.drawT0 = now + (entering ? 1300 : 350);
      else if (s === 0) st.drawT0 = Infinity;
      sf.showLabels(s, entering);
    }
    function snap(now) {
      snapAll(A);
      st.enterT0 = now - 5000;
      if (st.step === 1) st.drawT0 = now - fast0 - FAST - 1;
      if (st.step >= 3) st.buildT0 = now - BUILD - 1;
    }

    return {
      mount: function (section) {
        sf = new Surface(section, 'graphs');
        build();
        INPUTS.forEach(function (inp, i) {
          sf.label(inp.name, NX - RI - 18, YS[i] - 11, { anchor: 'r', cls: 'mx-name', delay: 60 * i });
          sf.label(inp.kind, NX - RI - 18, YS[i] + 15, { anchor: 'r', cls: 'mx-kind', delay: 60 * i + 40 });
          // edge probability beside each input, on the side away from its edge
          var p = (cum[i][N] / N).toFixed(2).replace(/^0/, '');
          L.p.push(sf.label('p = ' + p, NX + RI + 16, YS[i] + (YS[i] > SY ? 22 : -22), { anchor: 'l', cls: 'mx-mono', steps: [2, 3, 4], delay: 120 + 70 * i }));
          sf.label(inp.name, ST.x0, YS[i] + 34 - 74, { anchor: 'l', cls: 'mx-kind', steps: [3, 4], delay: 60 * i });
        });
        sf.label('Sales', SX, SY, { cls: 'mx-name mx-navy', delay: 320 });
        L.perm = sf.label('permitted: input → sales', (NX + SX) / 2, YS[4] + 96, { cls: 'mx-mono', steps: [0], delay: 600 });
        L.count = sf.label('', SX + RS + 24, SY, { anchor: 'l', cls: 'mx-mono', steps: [1], delay: 300 });
        L.router = sf.label('router · q(G | D)', (NX + SX) / 2, YS[0] - 92, { cls: 'mx-mono mx-hot', steps: [4], delay: 200 });
        L.strip = sf.label('', ST.x0, YS[0] - 92, { anchor: 'l', cls: 'mx-mono', steps: [3], delay: 200 });
        L.dec = sf.label('decoder · q(C | D, G)', ST.x0, YS[0] - 92, { anchor: 'l', cls: 'mx-mono mx-aqua', steps: [4], delay: 300 });
        L.zero = sf.label('0', zeroX, YS[4] + 62, { cls: 'mx-mono', steps: [3, 4], delay: 300 });
        L.absent = sf.label('absent edge → exactly', zeroX - 14, YS[4] + 62, { anchor: 'r', cls: 'mx-mono', steps: [3, 4], delay: 1400 });
        L.ill = sf.label('illustrative', sf.w - 2, sf.h - 16, { anchor: 'r', cls: 'mx-mono mx-faint', steps: [1, 2, 3, 4], delay: 500 });
      },
      enter: function (ctx) {
        var now = performance.now();
        sf.fit();
        A.perm.set(0);
        A.draw.set(0);
        A.freq.set(0);
        A.prob.set(0);
        A.strip.set(0);
        A.tint.set(0);
        st.enterT0 = now;
        st.step = -1;
        st.drawT0 = Infinity;
        st.buildT0 = Infinity;
        st.shownDraw = -1;
        st.shownBuild = -1;
        accumulate(0);
        setStep(ctx.step, now, true);
        if (ctx.instant) snap(now);
        sf.start(draw);
      },
      step: function (ctx) {
        var now = performance.now();
        setStep(ctx.step, now, false);
        if (ctx.instant) snap(now);
        sf.wake();
      },
      leave: function () { sf.stop(); },
      resize: function () { sf.fit(); sf.redraw(); }
    };
  }

  /* ==========================================================================
     slots (slide 22): one graph for every week; the slots beyond River's prior
     ========================================================================== */
  function slotsScene() {
    var IX = [266, 373, 480, 587, 694];
    var IY = 430;
    var RI = 27;
    var SX = 480;
    var SY = 690;
    var RS = 34;
    var UX = 240;
    var UY = 690;
    var RU = 24;
    var FIXED = [1, 1, 0, 1, 0];                 // today's graph: TV, Search, Promo -> Sales
    var NW = 10;
    var WEEKS = DATA.prior.weeks;
    var WEEK_NO = [];
    for (var w = 0; w < NW; w++) WEEK_NO.push(Math.round(1 + (WEEKS - 1) * w / (NW - 1)));
    // Time-varying graphs (illustrative): direct edges per week, a TV -> Search path, hidden demand.
    var WEEK_G = [
      [1, 1, 0, 1, 0], [1, 1, 1, 1, 0], [0, 1, 1, 1, 0], [0, 1, 1, 1, 1], [1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1], [1, 1, 0, 1, 1], [1, 1, 0, 0, 0], [1, 0, 0, 1, 0], [1, 1, 1, 1, 0]
    ];
    var WEEK_MED = [0, 0, 0, 0, 1, 1, 1, 0, 0, 0];
    var WEEK_HID = [0, 1, 1, 0, 0, 0, 0, 0, 0, 0];
    var LABELLED = [0, 3, 6, 9];
    var SPAN = 1.6;
    // Week row: cards across the time axis, receding toward a vanishing point on the right.
    var ROW = { x0: 120, vx: 1630, bottom: 300, horizon: 50, r: 0.92, hh: 108, lx: 64, ly: -15 };
    var U_IN = [-0.78, -0.39, 0, 0.39, 0.78];   // lateral positions of the inputs on a card
    var V_IN = 0.36;
    var V_SALES = -0.52;

    var sf;
    var L = {};
    var A = { slots: new Anim(0), mech: new Anim(0), row: new Anim(1), front: new Anim(1), morph: new Anim(0) };
    var st = { step: 0, enterT0: 0, scanT0: Infinity, slotsT0: 0, mechT0: 0 };
    var direct, arcs, uEdges, med, hid, inter, junction, cards;

    // Point (u, v) of card k: u lateral, v vertical, both in [-1, 1]. The far side of a card is a little shorter.
    function cardPt(k, u, v, out) {
      var s = Math.pow(ROW.r, k);
      var cx = ROW.vx + (ROW.x0 - ROW.vx) * s;
      var cy = ROW.horizon + (ROW.bottom - ROW.horizon) * s - ROW.hh * s;
      out[0] = cx + u * ROW.lx * s;
      out[1] = cy + u * ROW.ly * s - v * ROW.hh * s * (1 - 0.06 * u);
      return out;
    }
    // Slot between inputs i < j: a short link between neighbours, an arc over the row otherwise.
    function arcEdge(i, j) {
      var x0 = IX[i] + RI + 2;
      var x1 = IX[j] - RI - 2;
      var h = j - i === 1 ? 0 : 50 + 0.62 * (x1 - x0);
      return { x0: x0, y0: IY, cx: (x0 + x1) / 2, cy: IY - h, x1: x1, y1: IY };
    }

    function build() {
      var i, j, k;
      direct = [];
      for (i = 0; i < 5; i++) direct.push(makeEdge(IX[i], IY, SX, SY, 0.1 * (SX - IX[i]), RI + 3, RS + 5));
      // Slots between inputs: channel-channel, control-channel and control-control (every pair here).
      arcs = [];
      for (i = 0; i < 5; i++) for (j = i + 1; j < 5; j++) arcs.push({ i: i, j: j, e: arcEdge(i, j) });
      // Latent demand U -> channels, controls and sales.
      uEdges = [];
      for (i = 0; i < 5; i++) uEdges.push(makeEdge(UX, UY, IX[i], IY, 0.06 * (IX[i] - UX), RU + 3, RI + 5));
      uEdges.push(makeEdge(UX, UY, SX, SY, 0, RU + 3, RS + 5));
      // Research mechanisms: mediation TV -> Search -> Sales, hidden demand U -> Search and U -> Sales,
      // interaction TV x Promo (TV modulates the Promo edge).
      med = arcs[0].e;
      hid = [uEdges[1], uEdges[5]];
      junction = qpt(direct[3], 0.5, [0, 0]);
      inter = makeEdge(IX[0], IY, junction[0], junction[1], 26, RI + 3, 7);
      // Week cards, near to far.
      cards = [];
      for (k = 0; k < NW; k++) {
        var c = { s: Math.pow(ROW.r, k), quad: [], ins: [], sales: cardPt(k, 0, V_SALES, [0, 0]), u: cardPt(k, -0.72, V_SALES, [0, 0]) };
        c.quad.push(cardPt(k, -1, 1, [0, 0]), cardPt(k, 1, 1, [0, 0]), cardPt(k, 1, -1, [0, 0]), cardPt(k, -1, -1, [0, 0]));
        for (i = 0; i < 5; i++) c.ins.push(cardPt(k, U_IN[i], V_IN, [0, 0]));
        c.medc = cardPt(k, (U_IN[0] + U_IN[1]) / 2, V_IN + 0.32, [0, 0]);
        cards.push(c);
      }
    }

    function cardIn(now, k) { return prog(now, st.enterT0 + 650 + 70 * k, 700, ease.out); }
    function frontIn(now, i) { return prog(now, st.enterT0 + 150 + 60 * i, 600, ease.out); }
    function scanFlash(now, k) {
      if (still()) return 0;
      var pos = (now - st.scanT0) / 140 - 1;
      return Math.exp(-((pos - k) * (pos - k)) / 0.8);
    }

    function draw(now) {
      var ctx = sf.begin();
      drawRow(ctx, now, A.row.get(now));
      drawFront(ctx, now);
    }

    function drawRow(ctx, now, aRow) {
      var m = A.morph.get(now);
      var k, i;
      monoFont(ctx, 15);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      for (k = NW - 1; k >= 0; k--) {
        var c = cards[k];
        var a = cardIn(now, k) * aRow;
        if (a < 0.003) continue;
        var mk = ease.inOut(clamp(m * (1 + SPAN) - SPAN * k / (NW - 1), 0, 1));
        var changes = WEEK_MED[k] || WEEK_HID[k];
        for (i = 0; i < 5; i++) if (WEEK_G[k][i] !== FIXED[i]) changes = 1;
        var flash = Math.max(changes ? Math.sin(Math.PI * mk) : 0, 0.8 * scanFlash(now, k));
        var border = mix(mix(INK, AQUA, Math.min(1, scanFlash(now, k))), PEACH, changes ? Math.sin(Math.PI * mk) : 0);
        // card
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(c.quad[0][0], c.quad[0][1]);
        for (i = 1; i < 4; i++) ctx.lineTo(c.quad[i][0], c.quad[i][1]);
        ctx.closePath();
        ctx.fillStyle = rgba(mix(NAVY_DEEP, INK, 0.04 + 0.04 * flash), 0.82);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(border, 0.22 + 0.5 * flash);
        ctx.stroke();
        var sc = c.s;
        // edges
        for (i = 0; i < 5; i++) {
          var on = lerp(FIXED[i], WEEK_G[k][i], mk);
          var p = c.ins[i];
          ctx.beginPath();
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(c.sales[0], c.sales[1]);
          if (on > 0.01) {
            ctx.globalAlpha = a * on;
            ctx.lineWidth = 1.6 * Math.max(0.7, sc);
            ctx.strokeStyle = rgba(INPUTS[i].col, 0.95);
            ctx.stroke();
          }
          if (on < 0.99) {
            ctx.globalAlpha = a * (1 - on) * 0.5;
            ctx.lineWidth = 1;
            ctx.setLineDash(DOTTED);
            ctx.lineCap = 'round';
            ctx.strokeStyle = rgba(INK, 0.6);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineCap = 'butt';
          }
        }
        // a TV -> Search path in some weeks
        var md = WEEK_MED[k] * mk;
        if (md > 0.01) {
          ctx.globalAlpha = a * md;
          ctx.lineWidth = 1.6 * Math.max(0.7, sc);
          ctx.strokeStyle = rgba(PERI, 1);
          ctx.beginPath();
          ctx.moveTo(c.ins[0][0], c.ins[0][1]);
          ctx.quadraticCurveTo(c.medc[0], c.medc[1], c.ins[1][0], c.ins[1][1]);
          ctx.stroke();
        }
        // hidden demand in some weeks
        var hd = WEEK_HID[k] * mk;
        if (hd > 0.01) {
          ctx.globalAlpha = a * hd;
          ctx.lineWidth = 1.3;
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = rgba(PERI, 1);
          ctx.beginPath();
          ctx.moveTo(c.u[0], c.u[1]);
          ctx.lineTo(c.ins[1][0], c.ins[1][1]);
          ctx.moveTo(c.u[0], c.u[1]);
          ctx.lineTo(c.sales[0], c.sales[1]);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(c.u[0], c.u[1], 5.5 * sc, 0, TAU);
          ctx.fillStyle = rgba(NAVY_DEEP, 1);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // nodes
        for (i = 0; i < 5; i++) {
          var lit = lerp(FIXED[i], WEEK_G[k][i], mk);
          node(ctx, c.ins[i][0], c.ins[i][1], 6 * sc, INPUTS[i].col, 0.15 + 0.85 * lit, a);
        }
        disc(ctx, c.sales[0], c.sales[1], 9 * sc, INK, a);
        if (LABELLED.indexOf(k) !== -1) {
          ctx.globalAlpha = a;
          ctx.fillStyle = rgba(INK, 0.5);
          ctx.fillText('week ' + WEEK_NO[k], c.quad[0][0], c.quad[0][1] - 10);
        }
      }
    }

    function drawFront(ctx, now) {
      var aF = A.front.get(now);
      var aS = A.slots.get(now);
      var aM = A.mech.get(now);
      var i, k;
      // capacity slots: zero in River's prior (dotted, with a small cross)
      if (aS > 0.003) {
        for (k = 0; k < arcs.length; k++) {
          var pa = prog(now, st.slotsT0 + 35 * k, 700);
          drawEdge(ctx, arcs[k].e, { col: INK, a: 0.42 * aS * aF, w: 1.2, dash: DOTTED, p: pa });
        }
        for (k = 0; k < uEdges.length; k++) {
          var pu = prog(now, st.slotsT0 + 300 + 50 * k, 700);
          drawEdge(ctx, uEdges[k], { col: INK, a: 0.42 * aS * aF, w: 1.2, dash: DOTTED, p: pu });
        }
        ctx.globalAlpha = 0.55 * aS * aF * prog(now, st.slotsT0 + 700, 500);
        ctx.strokeStyle = rgba(INK, 1);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (k = 0; k < arcs.length; k++) {
          qpt(arcs[k].e, 0.5, PT);
          cross(ctx, PT[0], PT[1], 3.5);
        }
        for (k = 0; k < uEdges.length; k++) {
          qpt(uEdges[k], 0.5, PT);
          cross(ctx, PT[0], PT[1], 3.5);
        }
        ctx.stroke();
      }
      // today's direct edges: present solid, permitted but absent dashed
      for (i = 0; i < 5; i++) {
        var pe = prog(now, st.enterT0 + 450 + 70 * i, 900);
        if (FIXED[i]) {
          drawEdge(ctx, direct[i], { col: INPUTS[i].col, a: 0.9 * aF, w: 2.5, p: pe, head: 10 });
          if (pe >= 1) flowDots(ctx, direct[i], (now - st.enterT0) * 0.00028 + 0.31 * i, 2, 0.9 * aF, INPUTS[i].col, 2.6);
        } else {
          drawEdge(ctx, direct[i], { col: INK, a: 0.34 * aF, w: 1.5, dash: DASH, p: pe, head: 8 });
        }
      }
      // research mechanisms
      if (aM > 0.003) {
        var pm = prog(now, st.mechT0, 900);
        var ph = prog(now, st.mechT0 + 350, 900);
        var pi = prog(now, st.mechT0 + 700, 900);
        drawEdge(ctx, med, { col: PERI, a: aM * aF, w: 2.2, dash: [7, 5], p: pm, head: 9 });
        drawEdge(ctx, direct[1], { col: PERI, a: 0.85 * aM * aF, w: 3, p: prog(now, st.mechT0 + 450, 700), head: 10 });
        drawEdge(ctx, hid[0], { col: PERI, a: aM * aF, w: 2.2, dash: [7, 5], p: ph, head: 9 });
        drawEdge(ctx, hid[1], { col: PERI, a: aM * aF, w: 2.2, dash: [7, 5], p: ph, head: 9 });
        drawEdge(ctx, inter, { col: PEACH, a: aM * aF, w: 2.2, dash: [7, 5], p: pi });
        if (pi >= 0.999) {
          ctx.globalAlpha = aM * aF;
          ctx.lineWidth = 2;
          ctx.strokeStyle = rgba(PEACH, 1);
          ctx.fillStyle = rgba(NAVY_DEEP, 1);
          ctx.beginPath();
          ctx.arc(junction[0], junction[1], 6, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
      }
      // nodes
      for (i = 0; i < 5; i++) node(ctx, IX[i], IY, RI, INPUTS[i].col, FIXED[i] ? 1 : 0.18, aF * frontIn(now, i));
      disc(ctx, SX, SY, RS, INK, aF * frontIn(now, 5));
      var aU = Math.max(aS, aM) * aF;
      if (aU > 0.003) {
        ctx.globalAlpha = aU;
        ctx.beginPath();
        ctx.arc(UX, UY, RU, 0, TAU);
        ctx.fillStyle = rgba(NAVY_DEEP, 1);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = rgba(mix(INK, PERI, aM), 0.85);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    function setStep(s, now, entering) {
      st.step = s;
      if (s === 1 && A.slots.get(now) < 0.02) st.slotsT0 = now + (entering ? 900 : 150);
      A.slots.to(s === 1 ? 1 : (s === 2 ? 0.45 : 0), now, 700);
      if (s >= 2 && A.mech.get(now) < 0.02) st.mechT0 = now + (entering ? 1000 : 200);
      A.mech.to(s === 2 ? 1 : (s === 3 ? 0.5 : 0), now, 700);
      A.row.to(s === 0 || s === 3 ? 1 : 0.3, now, 800);
      A.front.to(s === 3 ? 0.55 : 1, now, 800);
      A.morph.to(s === 3 ? 1 : 0, now, s === 3 ? 2200 : 700, s === 3 ? 300 : 0, s === 3 ? ease.linear : ease.inOut);
      if (s === 0 && entering) st.scanT0 = now + 1700;
      sf.showLabels(s, entering);
    }
    function snap(now) {
      snapAll(A);
      st.enterT0 = st.slotsT0 = st.mechT0 = now - 5000;
      st.scanT0 = -1e9;
    }

    return {
      mount: function (section) {
        sf = new Surface(section, 'slots');
        build();
        INPUTS.forEach(function (inp, i) {
          sf.label(inp.name, IX[i], IY - RI - 22, { cls: 'mx-name mx-name-s', delay: 60 * i });
        });
        sf.label('Sales', SX, SY, { cls: 'mx-name mx-navy', delay: 320 });
        sf.label('U', UX, UY, { cls: 'mx-name mx-name-s', steps: [1, 2, 3], delay: 200 });
        L.latent = sf.label('latent demand', UX, UY + RU + 24, { cls: 'mx-mono', steps: [1], delay: 300 });
        L.hidden = sf.label('hidden demand', UX, UY + RU + 24, { cls: 'mx-mono mx-peri', steps: [2], delay: 650 });
        L.med = sf.label('mediation', (IX[0] + IX[1]) / 2, IY - RI - 58, { cls: 'mx-mono mx-peri', steps: [2], delay: 300 });
        L.inter = sf.label('interaction · TV × Promo', 630, junction[1], { anchor: 'l', cls: 'mx-mono mx-hot', steps: [2], delay: 1000 });
        L.slots = sf.label(NET.graphSlots + ' slots · ' + NET.graphFamilies + ' families · ' + NET.graphSlotsZero + ' set to zero in River’s prior', cards[0].quad[0][0], 44, { anchor: 'l', cls: 'mx-mono', steps: [1, 2], delay: 400 });
        L.one = sf.label('each sampled graph · every week', cards[0].quad[0][0], 44, { anchor: 'l', cls: 'mx-mono mx-aqua', steps: [0], delay: 1300 });
        L.tv = sf.label('time-varying causal graphs', cards[0].quad[0][0], 44, { anchor: 'l', cls: 'mx-mono mx-hot', steps: [3], delay: 400 });
        L.ill = sf.label('illustrative', sf.w - 2, sf.h - 16, { anchor: 'r', cls: 'mx-mono mx-faint', delay: 600 });
      },
      enter: function (ctx) {
        var now = performance.now();
        sf.fit();
        A.slots.set(0);
        A.mech.set(0);
        A.row.set(1);
        A.front.set(1);
        A.morph.set(0);
        st.enterT0 = now;
        st.scanT0 = Infinity;
        setStep(ctx.step, now, true);
        if (ctx.instant) snap(now);
        sf.start(draw);
      },
      step: function (ctx) {
        var now = performance.now();
        setStep(ctx.step, now, false);
        if (ctx.instant) snap(now);
        sf.wake();
      },
      leave: function () { sf.stop(); },
      resize: function () { sf.fit(); sf.redraw(); }
    };
  }

  Deck.registerScene('flow', flowScene());
  Deck.registerScene('graphs', graphsScene());
  Deck.registerScene('slots', slotsScene());
})();
