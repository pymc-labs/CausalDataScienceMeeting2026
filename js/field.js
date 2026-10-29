/* ==========================================================================
   Field: the full-window background canvas (#field) with the white-paper
   flow-line art. It sits above the CSS background layers, behind the stage,
   and morphs between slides.

   The deck calls Field.set(Object.assign({theme}, slide.field), {instant})
   on every slide change and Field.resize() on window resize.

   data-field modes. Positions are fractions of the 1920 x 1080 stage (the
   window itself at 16:9); the art always covers the whole window, letterbox
   included. intensity (default 1) scales the layer alpha.
     {"mode":"contour","focus":[x,y]}  nested iso-lines of a posterior landscape
                                       with a peach point + ring at its mode
     {"mode":"sweep"}                  26 wavy near-parallel lines
     {"mode":"ribbon","y":y}           25 twisting hairlines centred at height y
     {"mode":"fan","origin":[x,y]}     33 lines leaving one point (posterior fan)
     {"mode":"none"}                   everything fades out

   Line modes share one representation (33 lines x 220 points; a family with
   fewer lines parks its spare slots, invisible, between neighbours), so one
   line mode morphs into the next. Contour <-> line modes crossfade.
   Line maths ported from flow_lines.py (MarketingFoundationalModels repo,
   slides/elements): sweep, ribbon and fan, recoloured to the brand palette.
   ========================================================================== */
(function () {
  'use strict';

  var W = 1920;
  var H = 1080;
  var TAU = Math.PI * 2;

  var LINES = 33;        // line slots shared by every line mode
  var PTS = 220;         // points per line
  var STOPS = 28;        // gradient stops per line (alpha and ink along the line)
  var RIBBON_H = 540;    // ribbon band height: the 3200 x 900 original across 1920 px
  var FAN_H = 600;       // fan band height: the 3200 x 1000 original across 1920 px
  var LEVELS = 22;       // contour levels
  var GRID = 160;        // marching-squares cells across the window
  var KAPPA = 0.88;      // level radius ~ index^KAPPA: rings widen toward the mode

  var MORPH_MS = 1600;
  var FADE_MS = 1200;
  var THEME_MS = 1100;   // matches --t-theme, the CSS background crossfade
  var REDUCED_MS = 200;
  var CONTOUR_DT = 1 / 30;   // contours are recomputed at most at 30 Hz
  var MORPH_LAG = 0.3;       // morphs travel left to right: the far end starts later

  /* ---- Palette (PyMC Labs brand). Index 0: dark slides, 1: light slides ---- */
  var INK = [
    [[244, 249, 255], [180, 231, 221], [159, 170, 226]],   // #F4F9FF -> aqua -> peri
    [[12, 31, 64], [44, 60, 124], [104, 116, 196]]          // navy -> periDeep
  ];
  var MAX_ALPHA = [0.5, 0.22];
  var GLOW = [0.09, 0.04];                                  // glow stroke alpha, relative to the hairline
  var HALO = [[180, 231, 221], [104, 116, 196]];             // soft fill under the contours
  var HALO_ALPHA = [0.16, 0.07];
  var PEACH = [[246, 174, 114], [217, 128, 60]];             // peach / peachDeep

  /* ---- Small helpers. Same curves as Deck.ease (field.js loads first). ---- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function inOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function mixInto(out, a, b, t) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  }
  function rgba(r, g, b, a) {
    return 'rgba(' + (r + 0.5 | 0) + ',' + (g + 0.5 | 0) + ',' + (b + 0.5 | 0) + ',' + clamp(a, 0, 1).toFixed(3) + ')';
  }
  function rgbaOf(c, a) { return rgba(c[0], c[1], c[2], a); }
  function reduced() { return !!(window.Deck && window.Deck.reducedMotion); }
  function mulberry32(seed) {
    return function () {
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Scalar tween evaluated lazily against the frame time.
  function Tween(v, easing) { this.a = v; this.b = v; this.t0 = 0; this.dur = 0; this.ease = easing || inOut; }
  Tween.prototype.get = function (now) {
    var k = this.dur > 0 ? (now - this.t0) / this.dur : 1;
    return k >= 1 ? this.b : k <= 0 ? this.a : lerp(this.a, this.b, this.ease(k));
  };
  Tween.prototype.to = function (v, now, dur) {
    this.a = this.get(now);
    this.b = v;
    this.t0 = now;
    this.dur = dur;
  };
  Tween.prototype.busy = function (now) { return now < this.t0 + this.dur; };

  /* ---- Line families (flow_lines.py) ---------------------------------------- */
  // quantile_positions(n): z = Phi^-1(linspace(.03, .97, n)) normalised to max |z| = 1.
  function mirror(half) {
    var out = half.slice();
    for (var i = half.length - 2; i >= 0; i--) out.push(-half[i]);
    return out;
  }
  var Z25 = mirror([-1, -0.7880, -0.6569, -0.5568, -0.4733, -0.4002, -0.3339, -0.2725, -0.2145, -0.1589, -0.1051, -0.0523, 0]);
  var Z33 = mirror([-1, -0.8295, -0.7170, -0.6297, -0.5568, -0.4931, -0.4357, -0.3831, -0.3339, -0.2875, -0.2431, -0.2004,
    -0.1589, -0.1184, -0.0786, -0.0392, 0]);

  // n real lines spread over the LINES slots: c = continuous line index per
  // slot, a = strength per slot (0 for the spare slots between real lines),
  // z = quantile position per slot (ribbon, fan).
  function family(n, seed, strength, zs) {
    var rnd = mulberry32(seed);
    var c = new Float32Array(LINES);
    var a = new Float32Array(LINES);
    var z = new Float32Array(LINES);
    var slot = [];
    var i, k;
    for (i = 0; i < n; i++) slot.push(Math.round(i * (LINES - 1) / (n - 1)));
    for (i = 0; i < n; i++) {
      c[slot[i]] = i;
      a[slot[i]] = strength(zs ? zs[i] : 0, rnd());
      if (i === n - 1) break;
      for (k = slot[i] + 1; k < slot[i + 1]; k++) c[k] = i + (k - slot[i]) / (slot[i + 1] - slot[i]);
    }
    if (zs) {
      for (k = 0; k < LINES; k++) {
        i = Math.min(Math.floor(c[k]), n - 2);
        z[k] = lerp(zs[i], zs[i + 1], c[k] - i);
      }
    }
    return { n: n, c: c, a: a, z: z };
  }
  var SWEEP = family(26, 2, function (z, r) { return 0.2 + 0.7 * Math.pow(r, 1.6); });
  var RIBBON = family(25, 6, function (z, r) { return 0.2 + 0.7 * Math.exp(-z * z / (2 * 0.55 * 0.55)) * (0.85 + 0.15 * r); }, Z25);
  var FAN = family(33, 4, function (z, r) { return 0.15 + 0.8 * Math.exp(-z * z / (2 * 0.5 * 0.5)) * (0.85 + 0.15 * r); }, Z33);

  // Per-point terms that do not change over time.
  var U = new Float32Array(PTS);           // -0.02 .. 1.02 across the window
  var SWEEP_DRIFT = new Float32Array(PTS); // max(u, 0)^1.4
  var RIB_W = new Float32Array(PTS);       // ribbon width envelope
  var RIB_END = new Float32Array(PTS);     // ribbon end fades
  var FAN_SIG = new Float32Array(PTS);     // fan spread, 0 at the origin
  var FAN_MASK = new Float32Array(PTS);
  var FAN_CEN = new Float32Array(PTS);     // fan centreline relative to the origin
  var RIB_C = new Float32Array(PTS);       // per-frame scratch (ribbon)
  var RIB_T = new Float32Array(PTS);
  var RIB_M = new Float32Array(PTS);
  var MORPH_E = new Float32Array(PTS);     // per-frame scratch (morph progress)
  (function () {
    var c0 = 0.5 + 0.11 * Math.sin(TAU * 0.1);
    for (var p = 0; p < PTS; p++) {
      var f = p / (PTS - 1);
      var u = -0.02 + 1.04 * f;
      var uc = clamp(u, 0, 1);
      U[p] = u;
      SWEEP_DRIFT[p] = Math.pow(Math.max(u, 0), 1.4);
      RIB_W[p] = 0.04 + 0.2 * Math.pow(Math.sin(Math.PI * uc), 0.7);
      RIB_END[p] = smoothstep(0, 0.12, u) * (1 - smoothstep(0.88, 1, u));
      FAN_SIG[p] = (0.05 + 0.3 * Math.pow(f, 0.9)) * smoothstep(0, 0.08, f);
      FAN_MASK[p] = (0.4 + 0.6 * smoothstep(0, 0.3, f)) * smoothstep(0, 0.05, f) * (1 - smoothstep(0.72, 1, f));
      FAN_CEN[p] = 0.5 + 0.11 * Math.sin(TAU * (0.85 * f + 0.1)) + 0.05 * f * Math.sin(TAU * 2.1 * f + 0.9) - c0;
    }
  })();

  /* ---- State ------------------------------------------------------------------- */
  var canvas = null;
  var ctx = null;
  var view = { dpr: 1, s: 1, ox: 0, oy: 0, x0: 0, x1: W, y0: 0, y1: H, version: 0 };
  var raf = 0;
  var last = 0;
  var clock = 0;   // drift time in seconds; frozen under reduced motion

  var theme = new Tween(0, easeOut);   // 0 dark .. 1 light, follows the CSS crossfade
  var lineAlpha = new Tween(0);
  var lineSpec = null;                 // {mode, y | origin, key}
  var morph = null;                    // {t0, dur}
  var N = LINES * PTS;
  var LX = new Float32Array(N), LY = new Float32Array(N), LA = new Float32Array(N);   // shown
  var GX = new Float32Array(N), GY = new Float32Array(N), GA = new Float32Array(N);   // target
  var FX = new Float32Array(N), FY = new Float32Array(N), FA = new Float32Array(N);   // morph start
  var contours = [];                   // contour layers; more than one only while crossfading
  var ink = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  var tint = [0, 0, 0];

  /* ---- Line modes ---------------------------------------------------------------- */
  function genSweep(spec, t, X, Y, A) {
    var x0 = view.x0, xw = view.x1 - view.x0, y0 = view.y0, yh = view.y1 - view.y0;
    var ph1 = TAU * t / 60, ph2 = TAU * t / 38;   // waves travel with the flow, ~40 px/s
    for (var k = 0; k < LINES; k++) {
      var s = SWEEP.c[k] / (SWEEP.n - 1), str = SWEEP.a[k], o = k * PTS;
      var lift = 0.22 * (0.35 + 0.9 * s);
      for (var p = 0; p < PTS; p++) {
        var u = U[p];
        var v = -0.10 + 1.20 * s + lift * SWEEP_DRIFT[p]
          + 0.045 * Math.sin(TAU * (0.75 * u + 0.9 * s + 0.1) - ph1)
          + 0.018 * Math.sin(TAU * (1.6 * u + 1.7 * s + 0.4) - ph2);
        X[o + p] = x0 + u * xw;
        Y[o + p] = y0 + v * yh;
        A[o + p] = str * (0.35 + 0.65 * smoothstep(0.15, 1.1, 0.75 * u + 0.45 * v));
      }
    }
  }

  function genRibbon(spec, t, X, Y, A) {
    var x0 = view.x0, xw = view.x1 - view.x0, yc = spec.y * H;
    var phT = TAU * t / 30, phW = TAU * t / 10, phC = 0.35 * Math.sin(TAU * t / 41);   // nodes travel ~50 px/s
    var p, u, uc;
    for (p = 0; p < PTS; p++) {
      u = U[p];
      uc = clamp(u, 0, 1);
      RIB_C[p] = 0.5 + 0.15 * Math.sin(TAU * (0.8 * uc + 0.05) + phC);
      RIB_T[p] = Math.cos(TAU * (1.25 * uc + 0.7) - phT);
      RIB_M[p] = (0.45 + 0.55 * Math.sqrt(Math.abs(Math.cos(TAU * (1.25 * u + 0.7) - phT)))) * RIB_END[p];
    }
    for (var k = 0; k < LINES; k++) {
      var z = RIBBON.z[k], str = RIBBON.a[k], o = k * PTS;
      for (p = 0; p < PTS; p++) {
        u = U[p];
        uc = clamp(u, 0, 1);
        var v = RIB_C[p] + RIB_W[p] * RIB_T[p] * z + 0.012 * Math.sin(TAU * (2 * uc + 1.1 * z) - phW);
        X[o + p] = x0 + u * xw;
        Y[o + p] = yc + (v - 0.5) * RIBBON_H;
        A[o + p] = str * RIB_M[p];
      }
    }
  }

  function genFan(spec, t, X, Y, A) {
    var ox = spec.origin[0] * W, oy = spec.origin[1] * H;
    var xe = view.x1 + 0.02 * (view.x1 - view.x0);
    var phW = TAU * t / 11, breath = 1 + 0.04 * Math.sin(TAU * t / 9.5), sway = 0.03 * Math.sin(TAU * t / 19);
    for (var k = 0; k < LINES; k++) {
      var z = FAN.z[k], str = FAN.a[k], o = k * PTS;
      for (var p = 0; p < PTS; p++) {
        var f = p / (PTS - 1);
        var wig = 1 + 0.05 * Math.sin(TAU * (1.4 * f + 0.8 * z) - phW);
        var v = FAN_CEN[p] + sway * f * f + FAN_SIG[p] * z * 0.5 * wig * breath;
        X[o + p] = ox + f * (xe - ox);
        Y[o + p] = oy + v * FAN_H;
        A[o + p] = str * FAN_MASK[p];
      }
    }
  }

  var GENERATORS = { sweep: genSweep, ribbon: genRibbon, fan: genFan };

  function updateLines(now, t) {
    GENERATORS[lineSpec.mode](lineSpec, t, GX, GY, GA);
    var P = morph ? (now - morph.t0) / morph.dur : 1;
    if (P >= 1) {
      morph = null;
      LX.set(GX); LY.set(GY); LA.set(GA);
      return;
    }
    for (var p = 0; p < PTS; p++) MORPH_E[p] = inOut(clamp((P - MORPH_LAG * p / (PTS - 1)) / (1 - MORPH_LAG), 0, 1));
    for (var i = 0; i < N; i++) {
      var e = MORPH_E[i % PTS];
      LX[i] = FX[i] + (GX[i] - FX[i]) * e;
      LY[i] = FY[i] + (GY[i] - FY[i]) * e;
      LA[i] = FA[i] + (GA[i] - FA[i]) * e;
    }
  }

  // One stroke style per line: a horizontal gradient carrying the window-wide
  // ink ramp and the per-point alpha (strength x mask) of that line.
  function drawLines(alpha, tm) {
    var maxA = lerp(MAX_ALPHA[0], MAX_ALPHA[1], tm) * alpha;
    var glow = lerp(GLOW[0], GLOW[1], tm);
    var c0 = ink[0], c1 = ink[1], c2 = ink[2];
    var vx0 = view.x0, vxw = view.x1 - view.x0;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var k = 0; k < LINES; k++) {
      var o = k * PTS, peak = 0, p;
      for (p = 0; p < PTS; p++) if (LA[o + p] > peak) peak = LA[o + p];
      if (peak * maxA < 0.004) continue;
      var xa = LX[o], span = LX[o + PTS - 1] - xa;
      if (!(span > 1)) continue;
      var g = ctx.createLinearGradient(xa, 0, xa + span, 0);
      for (var q = 0; q < STOPS; q++) {
        var i = o + Math.round(q * (PTS - 1) / (STOPS - 1));
        var f = clamp((LX[i] - vx0) / vxw, 0, 1);
        var a = f < 0.5 ? c0 : c1, b = f < 0.5 ? c1 : c2, w = f < 0.5 ? f * 2 : f * 2 - 1;
        g.addColorStop(clamp((LX[i] - xa) / span, 0, 1),
          rgba(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w, LA[i] * maxA));
      }
      ctx.beginPath();
      ctx.moveTo(LX[o], LY[o]);
      for (p = 1; p < PTS; p++) ctx.lineTo(LX[o + p], LY[o + p]);
      ctx.strokeStyle = g;
      // Glow: two wide, faint strokes under the hairline.
      ctx.globalAlpha = glow;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /* ---- Contour mode ------------------------------------------------------------------ */
  // Posterior landscape around the mode (dx, dy in stage px from the focus):
  // a tilted elliptical distance (axes AX : AY), steeper on the right, under a
  // low-frequency domain warp that grows away from the mode and drifts with t.
  var AX = 1.35, AY = 0.85, ROT = -0.12, COS_R = Math.cos(ROT), SIN_R = Math.sin(ROT);
  function landscape(dx, dy, t) {
    var r = Math.sqrt(dx * dx + dy * dy);
    var amp = 70 * r / (r + 420);
    var wx = Math.sin(0.0042 * dy + 0.0011 * dx + 1.7 + 0.09 * t)
      + 0.55 * Math.sin(0.0063 * dx - 0.0029 * dy + 4.2 - 0.13 * t)
      + 0.25 * Math.sin(0.0135 * dy - 0.0040 * dx + 0.8 + 0.17 * t);
    var wy = Math.sin(0.0037 * dx - 0.0016 * dy + 0.6 - 0.11 * t)
      + 0.55 * Math.sin(0.0058 * dy + 0.0024 * dx + 2.9 + 0.07 * t)
      + 0.25 * Math.sin(0.0122 * dx + 0.0051 * dy + 5.1 - 0.15 * t);
    var qx = dx + amp * wx, qy = dy + amp * wy;
    var px = (qx * COS_R + qy * SIN_R) / AX;
    var py = (qy * COS_R - qx * SIN_R) / AY;
    var rr = Math.sqrt(px * px + py * py);
    return rr * (1 + 0.22 * px / (rr + 60));
  }

  function ContourLayer(focus) {
    this.focus = focus;
    this.fx = focus[0] * W;
    this.fy = focus[1] * H;
    this.alpha = new Tween(0);
    this.paths = new Array(LEVELS);
    this.stamp = -Infinity;   // drift time of the last recompute
    this.version = -1;        // view version the levels were scaled for
    this.r1 = 1;              // level scale
    this.reach = 1;           // distance to the farthest visible corner
  }

  // Scale the levels so the outermost one reaches the farthest visible corner.
  function scaleLevels(c) {
    var far = 0, reach = 0;
    var xs = [view.x0, view.x1], ys = [view.y0, view.y1];
    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) {
        var dx = xs[i] - c.fx, dy = ys[j] - c.fy;
        far = Math.max(far, landscape(dx, dy, 0));
        reach = Math.max(reach, Math.sqrt(dx * dx + dy * dy));
      }
    }
    c.r1 = far / Math.pow(LEVELS + 0.5, KAPPA);
    c.reach = reach;
    c.version = view.version;
  }

  // Marching squares on a coarse grid over the visible window. Segments are
  // chained through shared grid edges into polylines, then smoothed.
  var grid = { nx: 0, ny: 0, cell: 1, x0: 0, y0: 0, hCount: 0, F: null, L0: null, L1: null };
  var buckets = [];
  for (var bi = 0; bi < LEVELS; bi++) buckets.push([]);
  var touched = [];
  var used = new Uint8Array(4096);
  var chain = [];

  function sizeGrid() {
    var cell = (view.x1 - view.x0) / GRID;
    var nx = GRID + 1, ny = Math.ceil((view.y1 - view.y0) / cell) + 1;
    grid.cell = cell;
    grid.x0 = view.x0;
    grid.y0 = view.y0;
    if (nx === grid.nx && ny === grid.ny) return;
    grid.nx = nx;
    grid.ny = ny;
    grid.hCount = (nx - 1) * ny;
    grid.F = new Float32Array(nx * ny);
    var edges = grid.hCount + nx * (ny - 1);
    grid.L0 = new Int32Array(edges).fill(-1);
    grid.L1 = new Int32Array(edges).fill(-1);
  }

  function crossing(e, lv) {
    var nx = grid.nx, F = grid.F, i, j, va, vb;
    if (e < grid.hCount) {
      j = (e / (nx - 1)) | 0;
      i = e - j * (nx - 1);
      va = F[j * nx + i];
      vb = F[j * nx + i + 1];
      chain.push(grid.x0 + (i + (lv - va) / (vb - va)) * grid.cell, grid.y0 + j * grid.cell);
    } else {
      e -= grid.hCount;
      j = (e / nx) | 0;
      i = e - j * nx;
      va = F[j * nx + i];
      vb = F[(j + 1) * nx + i];
      chain.push(grid.x0 + i * grid.cell, grid.y0 + (j + (lv - va) / (vb - va)) * grid.cell);
    }
  }

  // Quadratic curves through the segment midpoints hide the grid facets.
  function emit(path, P, n, closed) {
    var k, k2;
    if (n < 2) return;
    if (closed) {
      path.moveTo((P[2 * n - 2] + P[0]) / 2, (P[2 * n - 1] + P[1]) / 2);
      for (k = 0; k < n; k++) {
        k2 = (k + 1) % n;
        path.quadraticCurveTo(P[2 * k], P[2 * k + 1], (P[2 * k] + P[2 * k2]) / 2, (P[2 * k + 1] + P[2 * k2 + 1]) / 2);
      }
      path.closePath();
      return;
    }
    path.moveTo(P[0], P[1]);
    for (k = 1; k < n - 1; k++) {
      path.quadraticCurveTo(P[2 * k], P[2 * k + 1], (P[2 * k] + P[2 * k + 2]) / 2, (P[2 * k + 1] + P[2 * k + 3]) / 2);
    }
    path.lineTo(P[2 * n - 2], P[2 * n - 1]);
  }

  function walk(segs, e, s, lv, path) {
    var L0 = grid.L0, L1 = grid.L1, start = e;
    chain.length = 0;
    crossing(e, lv);
    while (s >= 0 && !used[s]) {
      used[s] = 1;
      e = segs[2 * s] === e ? segs[2 * s + 1] : segs[2 * s];
      crossing(e, lv);
      s = L0[e] === s ? L1[e] : L0[e];
    }
    var n = chain.length >> 1;
    var closed = e === start && n > 3;
    emit(path, chain, closed ? n - 1 : n, closed);
  }

  function traceLevel(segs, lv) {
    var m = segs.length >> 1;
    if (!m) return null;
    var L0 = grid.L0, L1 = grid.L1, path = new Path2D(), s, q, e;
    if (used.length < m) used = new Uint8Array(m * 2);
    else used.fill(0, 0, m);
    touched.length = 0;
    for (s = 0; s < 2 * m; s++) {
      e = segs[s];
      if (L0[e] < 0) { L0[e] = s >> 1; touched.push(e); } else L1[e] = s >> 1;
    }
    // Open lines start where a contour enters the grid (an edge with one segment).
    for (q = 0; q < touched.length; q++) {
      e = touched[q];
      if (L1[e] < 0 && !used[L0[e]]) walk(segs, e, L0[e], lv, path);
    }
    for (s = 0; s < m; s++) if (!used[s]) walk(segs, segs[2 * s], s, lv, path);
    for (q = 0; q < touched.length; q++) { L0[touched[q]] = -1; L1[touched[q]] = -1; }
    return path;
  }

  function computeContours(c, t) {
    if (c.version !== view.version) scaleLevels(c);
    sizeGrid();
    var nx = grid.nx, ny = grid.ny, F = grid.F, cell = grid.cell, hRow = nx - 1;
    var inv = 1 / KAPPA, r1 = c.r1, i, j, l;
    for (j = 0; j < ny; j++) {
      var dy = grid.y0 + j * cell - c.fy;
      for (i = 0; i < nx; i++) F[j * nx + i] = Math.pow(landscape(grid.x0 + i * cell - c.fx, dy, t) / r1, inv);
    }
    for (l = 0; l < LEVELS; l++) buckets[l].length = 0;
    // Levels sit at index - 0.5 + a slow breath, in units of the level coordinate.
    var off = -0.5 + 0.18 * Math.sin(TAU * t / 16);
    for (j = 0; j < ny - 1; j++) {
      for (i = 0; i < hRow; i++) {
        var id = j * nx + i;
        var a = F[id], b = F[id + 1], cc = F[id + nx + 1], d = F[id + nx];
        var lo = Math.min(a, b, cc, d), hi = Math.max(a, b, cc, d);
        var l0 = Math.max(1, Math.ceil(lo - off)), l1 = Math.min(LEVELS, Math.ceil(hi - off) - 1);
        if (l0 > l1) continue;
        var eT = j * hRow + i, eB = eT + hRow, eL = grid.hCount + j * nx + i, eR = eL + 1;
        for (l = l0; l <= l1; l++) {
          var lv = l + off, seg = buckets[l - 1];
          switch ((a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (cc > lv ? 2 : 0) | (d > lv ? 1 : 0)) {
            case 1: case 14: seg.push(eL, eB); break;
            case 2: case 13: seg.push(eB, eR); break;
            case 3: case 12: seg.push(eL, eR); break;
            case 4: case 11: seg.push(eT, eR); break;
            case 6: case 9: seg.push(eT, eB); break;
            case 7: case 8: seg.push(eT, eL); break;
            case 5:   // saddle, top-right and bottom-left above
              if ((a + b + cc + d) / 4 > lv) seg.push(eT, eL, eB, eR); else seg.push(eT, eR, eL, eB);
              break;
            case 10:  // saddle, top-left and bottom-right above
              if ((a + b + cc + d) / 4 > lv) seg.push(eT, eR, eL, eB); else seg.push(eT, eL, eB, eR);
              break;
            default: break;
          }
        }
      }
    }
    for (l = 0; l < LEVELS; l++) c.paths[l] = traceLevel(buckets[l], l + 1 + off);
    c.stamp = t;
  }

  function drawContour(c, alpha, tm, t) {
    if (c.version !== view.version || Math.abs(t - c.stamp) >= CONTOUR_DT) computeContours(c, t);
    var maxA = lerp(MAX_ALPHA[0], MAX_ALPHA[1], tm) * alpha;
    var glow = lerp(GLOW[0], GLOW[1], tm);

    // Soft light under the mode, as on the white-paper cover; the same tilted
    // ellipse as the landscape.
    mixInto(tint, HALO[0], HALO[1], tm);
    var ha = lerp(HALO_ALPHA[0], HALO_ALPHA[1], tm) * alpha;
    ctx.save();
    ctx.translate(c.fx, c.fy);
    ctx.rotate(ROT);
    ctx.scale(AX, AY);
    var halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 760);
    halo.addColorStop(0, rgbaOf(tint, ha));
    halo.addColorStop(0.35, rgbaOf(tint, ha * 0.45));
    halo.addColorStop(0.7, rgbaOf(tint, ha * 0.12));
    halo.addColorStop(1, rgbaOf(tint, 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = halo;
    ctx.fillRect(-760, -760, 1520, 1520);
    ctx.restore();

    // Iso-lines: bright near the mode, fading toward the farthest corner.
    var g = ctx.createRadialGradient(c.fx, c.fy, 0, c.fx, c.fy, c.reach);
    g.addColorStop(0, rgbaOf(ink[0], 1));
    g.addColorStop(0.22, rgbaOf(ink[1], 0.9));
    g.addColorStop(0.6, rgbaOf(ink[2], 0.42));
    g.addColorStop(1, rgbaOf(ink[2], 0));
    ctx.strokeStyle = g;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var l = 0; l < LEVELS; l++) {
      var path = c.paths[l];
      if (!path) continue;
      var a = maxA * (1 - 0.45 * l / (LEVELS - 1));
      ctx.globalAlpha = a * glow;
      ctx.lineWidth = 7;
      ctx.stroke(path);
      ctx.lineWidth = 3.5;
      ctx.stroke(path);
      ctx.globalAlpha = a;
      ctx.lineWidth = 1.5;
      ctx.stroke(path);
    }

    // The posterior mode: a peach point with a thin, gently pulsing ring.
    mixInto(tint, PEACH[0], PEACH[1], tm);
    var pulse = 0.5 + 0.5 * Math.sin(TAU * t / 3.6);
    ctx.globalAlpha = alpha;
    if (!reduced()) {
      var q = (t / 4.8) % 1;
      ctx.strokeStyle = rgbaOf(tint, 0.32 * (1 - q) * (1 - q));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(c.fx, c.fy, 16 + 30 * easeOut(q), 0, TAU);
      ctx.stroke();
    }
    ctx.strokeStyle = rgbaOf(tint, 0.7 + 0.25 * pulse);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(c.fx, c.fy, 15 + 1.6 * pulse, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rgbaOf(tint, 1);
    ctx.beginPath();
    ctx.arc(c.fx, c.fy, 5.5, 0, TAU);
    ctx.fill();
  }

  /* ---- Frame loop --------------------------------------------------------------------- */
  function render(now) {
    var tm = theme.get(now), t = clock, i;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var k = view.s * view.dpr;
    ctx.setTransform(k, 0, 0, k, view.ox * view.dpr, view.oy * view.dpr);
    for (i = 0; i < 3; i++) mixInto(ink[i], INK[0][i], INK[1][i], tm);

    for (i = contours.length - 1; i >= 0; i--) {
      if (contours[i].alpha.b === 0 && !contours[i].alpha.busy(now)) contours.splice(i, 1);
    }
    for (i = 0; i < contours.length; i++) {
      var ca = contours[i].alpha.get(now);
      if (ca > 0.002) drawContour(contours[i], ca, tm, t);
    }

    if (morph && now >= morph.t0 + morph.dur && lineAlpha.get(now) <= 0.002) morph = null;
    var la = lineAlpha.get(now);
    if (la > 0.002 && lineSpec) {
      updateLines(now, t);
      drawLines(la, tm);
    }
    ctx.globalAlpha = 1;
  }

  function animating(now) {
    var i;
    if (theme.busy(now) || lineAlpha.busy(now) || morph) return true;
    for (i = 0; i < contours.length; i++) if (contours[i].alpha.busy(now)) return true;
    if (reduced()) return false;   // no drift: the last frame stays as it is
    if (lineAlpha.b > 0) return true;
    for (i = 0; i < contours.length; i++) if (contours[i].alpha.b > 0) return true;
    return false;
  }

  function frame(now) {
    raf = 0;
    if (!ctx || document.hidden) { last = 0; return; }
    if (last && !reduced()) clock += Math.min(now - last, 100) / 1000;
    last = now;
    render(now);
    if (animating(now)) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  function kick() {
    if (!raf && ctx && !document.hidden) raf = requestAnimationFrame(frame);
  }

  // Backing store = window x devicePixelRatio (capped at 2). The stage
  // transform maps 1920 x 1080 stage units into the window like the deck does.
  function measure() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var s = window.Deck && window.Deck.scale ? window.Deck.scale() : Math.min(vw / W, vh / H);
    var bw = Math.max(1, Math.round(vw * dpr)), bh = Math.max(1, Math.round(vh * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    view.dpr = dpr;
    view.s = s;
    view.ox = (vw - W * s) / 2;
    view.oy = (vh - H * s) / 2;
    view.x0 = -view.ox / s;
    view.x1 = W + view.ox / s;
    view.y0 = -view.oy / s;
    view.y1 = H + view.oy / s;
    view.version++;
  }

  function ensure() {
    if (ctx) return true;
    canvas = document.getElementById('field');
    ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (ctx) measure();
    return !!ctx;
  }

  /* ---- API ------------------------------------------------------------------------------- */
  function resize() {
    if (ctx) measure();
    else if (!ensure()) return;
    // Resizing clears the canvas: repaint now, then let the loop carry on.
    render(performance.now());
    kick();
  }

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function pair(v, d) { return Array.isArray(v) && v.length === 2 ? [num(v[0], d[0]), num(v[1], d[1])] : d.slice(); }

  function set(params, opts) {
    if (!ensure()) return;
    params = params || {};
    var instant = !!(opts && opts.instant);
    var now = performance.now();
    var rm = reduced();
    var dMorph = instant ? 0 : rm ? REDUCED_MS : MORPH_MS;
    var dFade = instant ? 0 : rm ? REDUCED_MS : FADE_MS;
    var mode = params.mode;
    var intensity = clamp(num(params.intensity, 1), 0, 1.5);
    var i;

    theme.to(params.theme === 'light' ? 1 : 0, now, instant ? 0 : rm ? REDUCED_MS : THEME_MS);

    if (GENERATORS[mode]) {
      var spec = { mode: mode };
      if (mode === 'ribbon') spec.y = num(params.y, 0.5);
      if (mode === 'fan') spec.origin = pair(params.origin, [0.1, 0.62]);
      spec.key = mode + ':' + (spec.y !== undefined ? spec.y : spec.origin ? spec.origin.join(',') : '');
      var shown = lineSpec && lineAlpha.get(now) > 0.01;
      if (shown && !instant && lineSpec.key !== spec.key) {
        // Morph from whatever is on screen now (possibly mid-morph) to the new form.
        FX.set(LX); FY.set(LY); FA.set(LA);
        morph = { t0: now, dur: dMorph };
      } else if (!shown || instant) {
        morph = null;
      }
      lineSpec = spec;
      lineAlpha.to(intensity, now, shown ? dMorph : dFade);
    } else {
      lineAlpha.to(0, now, dFade);
    }

    var keep = null;
    if (mode === 'contour') {
      var focus = pair(params.focus, [0.74, 0.8]);
      for (i = 0; i < contours.length; i++) {
        if (contours[i].focus[0] === focus[0] && contours[i].focus[1] === focus[1]) keep = contours[i];
      }
      if (!keep) {
        keep = new ContourLayer(focus);
        contours.push(keep);
      }
      keep.alpha.to(intensity, now, dFade);
    }
    for (i = 0; i < contours.length; i++) if (contours[i] !== keep) contours[i].alpha.to(0, now, dFade);

    if (instant) render(now);
    kick();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    } else {
      kick();
    }
  });

  window.Field = { set: set, resize: resize };
})();
